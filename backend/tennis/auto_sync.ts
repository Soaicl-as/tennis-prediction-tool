import { api } from "encore.dev/api";
import { CronJob } from "encore.dev/cron";
import { tennisDB } from "./db";
import { tennisAPI } from "./api_client";

// API endpoint for automatic tennis data sync
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
      
      for (const ranking of rankings) {
        const player = await tennisDB.queryRow<{id: number}>`
          SELECT id FROM players WHERE LOWER(name) = LOWER(${ranking.player_name})
        `;

        if (player) {
          // Update or insert latest ranking
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
        }
      }
      
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
      
      for (const match of matches) {
        if (match.status !== 'completed' || !match.winner) continue;
        
        const player1 = await tennisDB.queryRow<{id: number}>`
          SELECT id FROM players WHERE LOWER(name) = LOWER(${match.player1.name})
        `;
        
        const player2 = await tennisDB.queryRow<{id: number}>`
          SELECT id FROM players WHERE LOWER(name) = LOWER(${match.player2.name})
        `;
        
        if (!player1 || !player2) continue;
        
        const winnerId = match.winner.name === match.player1.name ? player1.id : player2.id;
        
        // Check if match already exists
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
        }
      }
      
      console.log(`Synced ${syncedCount} new ${tour.toUpperCase()} matches`);
    } catch (error) {
      console.error(`Failed to sync ${tour.toUpperCase()} matches:`, error);
    }
  }
}

async function updatePlayerStatistics(): Promise<void> {
  try {
    // Update career statistics for all players based on their match history
    const players = await tennisDB.queryAll<{id: number, name: string}>`
      SELECT id, name FROM players
    `;
    
    for (const player of players) {
      // Calculate career statistics
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
        
        // Get recent form (last 5 matches)
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
      }
    }
    
    console.log(`Updated statistics for ${players.length} players`);
  } catch (error) {
    console.error("Failed to update player statistics:", error);
  }
}

export { autoSyncJob };
