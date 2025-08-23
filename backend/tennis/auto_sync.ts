import { api } from "encore.dev/api";
import { CronJob } from "encore.dev/cron";
import { tennisDB } from "./db";
import { tennisAPI } from "./api_client";
import { cache } from "./cache";

// API endpoint for automatic tennis data sync with cache invalidation
export const autoSyncData = api<void, { success: boolean; message: string }>(
  { expose: false, method: "POST", path: "/tennis/auto-sync" },
  async () => {
    console.log("Starting automatic tennis data sync...");
    
    try {
      // Sync ATP and WTA rankings daily
      await syncRankingsAutomatically();
      
      // Sync recent matches (last 3 days)
      await syncRecentMatchesAutomatically();
      
      // Update player statistics
      await updatePlayerStatistics();
      
      // Invalidate relevant caches
      await invalidateStaleCache();
      
      console.log("Automatic tennis data sync completed successfully");
      return {
        success: true,
        message: "Automatic tennis data sync completed successfully"
      };
    } catch (error) {
      console.error("Automatic tennis data sync failed:", error);
      return {
        success: false,
        message: `Automatic tennis data sync failed: ${error}`
      };
    }
  }
);

// Automatically sync tennis data every 6 hours
const autoSyncJob = new CronJob("auto-sync-tennis-data", {
  title: "Auto Sync Tennis Data",
  schedule: "0 */6 * * *", // Every 6 hours
  endpoint: autoSyncData,
});

async function syncRankingsAutomatically(): Promise<void> {
  const tours: ('atp' | 'wta')[] = ['atp', 'wta'];
  
  for (const tour of tours) {
    try {
      const rankings = await tennisAPI.getRankings(tour);
      
      // Use batch processing for better performance
      const batchSize = 100;
      for (let i = 0; i < rankings.length; i += batchSize) {
        const batch = rankings.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (ranking) => {
          try {
            const player = await tennisDB.queryRow<{id: number}>`
              SELECT id FROM players WHERE LOWER(name) = LOWER(${ranking.player_name})
            `;

            if (player) {
              await tennisDB.exec`
                INSERT INTO player_stats (
                  player_id, match_id, ranking, elo_rating, 
                  career_matches_played, career_matches_won, career_win_pct,
                  recent_form_5, years_on_tour
                ) VALUES (
                  ${player.id}, 0, ${ranking.ranking}, ${1500 + (200 - ranking.ranking) * 2},
                  0, 0, 0, 0, 0
                )
                ON CONFLICT (player_id, match_id) DO UPDATE SET
                  ranking = EXCLUDED.ranking,
                  elo_rating = EXCLUDED.elo_rating,
                  created_at = NOW()
              `;
              
              // Invalidate cache for this player
              await cache.invalidatePlayerData(player.id);
            }
          } catch (error) {
            console.error(`Failed to sync ranking for ${ranking.player_name}:`, error);
          }
        }));
      }
      
      // Invalidate rankings cache
      await cache.invalidatePattern(`rankings:tour:${tour}`);
      
      console.log(`Synced ${rankings.length} ${tour.toUpperCase()} rankings`);
    } catch (error) {
      console.error(`Failed to sync ${tour.toUpperCase()} rankings:`, error);
    }
  }
}

async function syncRecentMatchesAutomatically(): Promise<void> {
  const tours: ('atp' | 'wta')[] = ['atp', 'wta'];
  
  for (const tour of tours) {
    try {
      const matches = await tennisAPI.getRecentMatches(tour, 3);
      let syncedCount = 0;
      
      // Use batch processing for better performance
      const batchSize = 25;
      for (let i = 0; i < matches.length; i += batchSize) {
        const batch = matches.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (match) => {
          try {
            if (match.status !== 'completed' || !match.winner) return;
            
            const [player1, player2] = await Promise.all([
              tennisDB.queryRow<{id: number}>`
                SELECT id FROM players WHERE LOWER(name) = LOWER(${match.player1.name})
              `,
              tennisDB.queryRow<{id: number}>`
                SELECT id FROM players WHERE LOWER(name) = LOWER(${match.player2.name})
              `
            ]);
            
            if (!player1 || !player2) return;
            
            const winnerId = match.winner.name === match.player1.name ? player1.id : player2.id;
            
            // Use optimized query with composite index
            const existingMatch = await tennisDB.queryRow<{id: number}>`
              SELECT id FROM matches 
              WHERE player1_id = ${player1.id} AND player2_id = ${player2.id} 
              AND match_date = ${match.date}
              AND tournament_name = ${match.tournament_name}
            `;
            
            if (!existingMatch) {
              await tennisDB.exec`
                INSERT INTO matches (
                  player1_id, player2_id, winner_id, match_date, tournament_name,
                  tournament_level, surface, round_name, best_of, score, location, indoor
                ) VALUES (
                  ${player1.id}, ${player2.id}, ${winnerId}, ${match.date}, ${match.tournament_name},
                  ${match.tournament_level}, ${match.surface}, ${match.round}, ${match.best_of || 3},
                  ${match.score || ''}, ${match.location || ''}, ${match.indoor || false}
                )
              `;
              syncedCount++;
              
              // Invalidate caches for both players
              await Promise.all([
                cache.invalidatePlayerData(player1.id),
                cache.invalidatePlayerData(player2.id)
              ]);
            }
          } catch (error) {
            console.error(`Failed to sync match ${match.id}:`, error);
          }
        }));
      }
      
      // Invalidate match-related caches
      await cache.invalidateMatchData();
      
      console.log(`Synced ${syncedCount} new ${tour.toUpperCase()} matches`);
    } catch (error) {
      console.error(`Failed to sync ${tour.toUpperCase()} matches:`, error);
    }
  }
}

async function updatePlayerStatistics(): Promise<void> {
  try {
    // Get all players in batches for better performance
    const players = await tennisDB.queryAll<{id: number, name: string}>`
      SELECT id, name FROM players
    `;
    
    // Process players in batches
    const batchSize = 50;
    for (let i = 0; i < players.length; i += batchSize) {
      const batch = players.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (player) => {
        try {
          // Use optimized query with indexes
          const careerStats = await tennisDB.queryRow<{
            total_matches: number,
            total_wins: number,
            clay_matches: number,
            clay_wins: number,
            grass_matches: number,
            grass_wins: number,
            hard_matches: number,
            hard_wins: number,
            indoor_matches: number,
            indoor_wins: number
          }>`
            SELECT 
              COUNT(*) as total_matches,
              SUM(CASE WHEN winner_id = ${player.id} THEN 1 ELSE 0 END) as total_wins,
              SUM(CASE WHEN surface = 'clay' THEN 1 ELSE 0 END) as clay_matches,
              SUM(CASE WHEN surface = 'clay' AND winner_id = ${player.id} THEN 1 ELSE 0 END) as clay_wins,
              SUM(CASE WHEN surface = 'grass' THEN 1 ELSE 0 END) as grass_matches,
              SUM(CASE WHEN surface = 'grass' AND winner_id = ${player.id} THEN 1 ELSE 0 END) as grass_wins,
              SUM(CASE WHEN surface = 'hard' THEN 1 ELSE 0 END) as hard_matches,
              SUM(CASE WHEN surface = 'hard' AND winner_id = ${player.id} THEN 1 ELSE 0 END) as hard_wins,
              SUM(CASE WHEN indoor = true THEN 1 ELSE 0 END) as indoor_matches,
              SUM(CASE WHEN indoor = true AND winner_id = ${player.id} THEN 1 ELSE 0 END) as indoor_wins
            FROM matches 
            WHERE player1_id = ${player.id} OR player2_id = ${player.id}
          `;
          
          if (careerStats && careerStats.total_matches > 0) {
            const careerWinPct = careerStats.total_wins / careerStats.total_matches;
            const clayWinPct = careerStats.clay_matches > 0 ? careerStats.clay_wins / careerStats.clay_matches : 0;
            const grassWinPct = careerStats.grass_matches > 0 ? careerStats.grass_wins / careerStats.grass_matches : 0;
            const hardWinPct = careerStats.hard_matches > 0 ? careerStats.hard_wins / careerStats.hard_matches : 0;
            const indoorWinPct = careerStats.indoor_matches > 0 ? careerStats.indoor_wins / careerStats.indoor_matches : 0;
            
            // Get recent form using optimized query
            const recentMatches = await tennisDB.queryAll<{winner_id: number}>`
              SELECT winner_id FROM matches 
              WHERE player1_id = ${player.id} OR player2_id = ${player.id}
              ORDER BY match_date DESC 
              LIMIT 5
            `;
            
            const recentForm = recentMatches.filter(m => m.winner_id === player.id).length;
            
            // Update player stats
            await tennisDB.exec`
              UPDATE player_stats SET
                career_matches_played = ${careerStats.total_matches},
                career_matches_won = ${careerStats.total_wins},
                career_win_pct = ${careerWinPct},
                clay_matches_played = ${careerStats.clay_matches},
                clay_matches_won = ${careerStats.clay_wins},
                clay_win_pct = ${clayWinPct},
                grass_matches_played = ${careerStats.grass_matches},
                grass_matches_won = ${careerStats.grass_wins},
                grass_win_pct = ${grassWinPct},
                hard_matches_played = ${careerStats.hard_matches},
                hard_matches_won = ${careerStats.hard_wins},
                hard_win_pct = ${hardWinPct},
                indoor_matches_played = ${careerStats.indoor_matches},
                indoor_matches_won = ${careerStats.indoor_wins},
                indoor_win_pct = ${indoorWinPct},
                recent_form_5 = ${recentForm},
                created_at = NOW()
              WHERE player_id = ${player.id} AND match_id = 0
            `;
            
            // Invalidate cache for this player
            await cache.invalidatePlayerData(player.id);
          }
        } catch (error) {
          console.error(`Failed to update stats for player ${player.name}:`, error);
        }
      }));
    }
    
    console.log(`Updated statistics for ${players.length} players`);
  } catch (error) {
    console.error("Failed to update player statistics:", error);
  }
}

async function invalidateStaleCache(): Promise<void> {
  try {
    // Invalidate prediction caches (they depend on player stats)
    await cache.invalidateAllPredictions();
    
    // Invalidate player lists cache
    await cache.invalidatePattern('all_players');
    
    // Invalidate predictions list cache
    await cache.invalidatePattern('predictions_list');
    
    console.log("Invalidated stale cache entries");
  } catch (error) {
    console.error("Failed to invalidate cache:", error);
  }
}

export { autoSyncJob };
