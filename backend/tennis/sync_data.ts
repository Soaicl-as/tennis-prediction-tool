import { api } from "encore.dev/api";
import { tennisDB } from "./db";
import { tennisAPI, TennisAPIPlayer, TennisAPIMatch, TennisAPIRanking } from "./api_client";

interface SyncDataRequest {
  data_types: ('players' | 'rankings' | 'matches' | 'tournaments')[];
  tour?: 'atp' | 'wta' | 'both';
  days_back?: number;
  force_update?: boolean;
}

interface SyncDataResponse {
  success: boolean;
  synced_data: {
    players?: number;
    rankings?: number;
    matches?: number;
    tournaments?: number;
  };
  errors?: string[];
  message: string;
}

// Synchronizes tennis data from external APIs to keep the database current.
export const syncData = api<SyncDataRequest, SyncDataResponse>(
  { expose: true, method: "POST", path: "/tennis/sync" },
  async ({ data_types, tour = 'both', days_back = 7, force_update = false }) => {
    const syncedData: SyncDataResponse['synced_data'] = {};
    const errors: string[] = [];

    try {
      const tours = tour === 'both' ? ['atp', 'wta'] as const : [tour as 'atp' | 'wta'];

      for (const currentTour of tours) {
        if (data_types.includes('players')) {
          try {
            const playersCount = await syncPlayers(currentTour, force_update);
            syncedData.players = (syncedData.players || 0) + playersCount;
          } catch (error) {
            errors.push(`Failed to sync ${currentTour.toUpperCase()} players: ${error}`);
          }
        }

        if (data_types.includes('rankings')) {
          try {
            const rankingsCount = await syncRankings(currentTour);
            syncedData.rankings = (syncedData.rankings || 0) + rankingsCount;
          } catch (error) {
            errors.push(`Failed to sync ${currentTour.toUpperCase()} rankings: ${error}`);
          }
        }

        if (data_types.includes('matches')) {
          try {
            const matchesCount = await syncRecentMatches(currentTour, days_back);
            syncedData.matches = (syncedData.matches || 0) + matchesCount;
          } catch (error) {
            errors.push(`Failed to sync ${currentTour.toUpperCase()} matches: ${error}`);
          }
        }

        if (data_types.includes('tournaments')) {
          try {
            const tournamentsCount = await syncTournaments(currentTour);
            syncedData.tournaments = (syncedData.tournaments || 0) + tournamentsCount;
          } catch (error) {
            errors.push(`Failed to sync ${currentTour.toUpperCase()} tournaments: ${error}`);
          }
        }
      }

      const totalSynced = Object.values(syncedData).reduce((sum, count) => sum + (count || 0), 0);
      
      return {
        success: errors.length === 0,
        synced_data: syncedData,
        errors: errors.length > 0 ? errors : undefined,
        message: `Successfully synced ${totalSynced} records${errors.length > 0 ? ` with ${errors.length} errors` : ''}`
      };
    } catch (error) {
      return {
        success: false,
        synced_data: syncedData,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        message: 'Sync operation failed'
      };
    }
  }
);

async function syncPlayers(tour: 'atp' | 'wta', forceUpdate: boolean): Promise<number> {
  const apiPlayers = await tennisAPI.getPlayers(tour, 500);
  let syncedCount = 0;

  for (const apiPlayer of apiPlayers) {
    try {
      const existingPlayer = await tennisDB.queryRow<{id: number, updated_at: string}>`
        SELECT id, updated_at FROM players WHERE name = ${apiPlayer.name}
      `;

      const dominantHand = apiPlayer.plays === 'L' ? 'left' : 'right';
      const twoHandedBackhand = apiPlayer.backhand === '2' || apiPlayer.backhand === 'Two-handed';
      const birthDate = apiPlayer.birth_date || null;
      const heightCm = apiPlayer.height || null;

      if (!existingPlayer) {
        // Insert new player
        await tennisDB.exec`
          INSERT INTO players (name, birth_date, height_cm, dominant_hand, two_handed_backhand, country)
          VALUES (${apiPlayer.name}, ${birthDate}, ${heightCm}, ${dominantHand}, ${twoHandedBackhand}, ${apiPlayer.country})
        `;
        syncedCount++;
      } else if (forceUpdate || shouldUpdatePlayer(existingPlayer.updated_at)) {
        // Update existing player
        await tennisDB.exec`
          UPDATE players SET
            birth_date = COALESCE(${birthDate}, birth_date),
            height_cm = COALESCE(${heightCm}, height_cm),
            dominant_hand = COALESCE(${dominantHand}, dominant_hand),
            two_handed_backhand = COALESCE(${twoHandedBackhand}, two_handed_backhand),
            country = COALESCE(${apiPlayer.country}, country),
            updated_at = NOW()
          WHERE id = ${existingPlayer.id}
        `;
        syncedCount++;
      }
    } catch (error) {
      console.error(`Failed to sync player ${apiPlayer.name}:`, error);
    }
  }

  return syncedCount;
}

async function syncRankings(tour: 'atp' | 'wta'): Promise<number> {
  const rankings = await tennisAPI.getRankings(tour);
  let syncedCount = 0;

  for (const ranking of rankings) {
    try {
      const player = await tennisDB.queryRow<{id: number}>`
        SELECT id FROM players WHERE LOWER(name) = LOWER(${ranking.player_name})
      `;

      if (player) {
        // Create or update player stats with current ranking
        await tennisDB.exec`
          INSERT INTO player_stats (
            player_id, match_id, ranking, elo_rating, career_matches_played, 
            career_matches_won, career_win_pct, recent_form_5, years_on_tour
          ) VALUES (
            ${player.id}, 0, ${ranking.ranking}, ${1500 + (200 - ranking.ranking) * 2}, 
            0, 0, 0, 0, 0
          )
          ON CONFLICT (player_id, match_id) DO UPDATE SET
            ranking = EXCLUDED.ranking,
            updated_at = NOW()
        `;
        syncedCount++;
      }
    } catch (error) {
      console.error(`Failed to sync ranking for ${ranking.player_name}:`, error);
    }
  }

  return syncedCount;
}

async function syncRecentMatches(tour: 'atp' | 'wta', daysBack: number): Promise<number> {
  const matches = await tennisAPI.getRecentMatches(tour, daysBack);
  let syncedCount = 0;

  for (const match of matches) {
    try {
      // Get or create players
      const player1 = await getOrCreatePlayer(match.player1);
      const player2 = await getOrCreatePlayer(match.player2);
      
      if (!player1 || !player2) continue;

      const winnerId = match.winner ? 
        (match.winner.name === match.player1.name ? player1.id : player2.id) : null;

      // Check if match already exists
      const existingMatch = await tennisDB.queryRow<{id: number}>`
        SELECT id FROM matches 
        WHERE player1_id = ${player1.id} AND player2_id = ${player2.id} 
        AND match_date = ${match.date}
        AND tournament_name = ${match.tournament_name}
      `;

      if (!existingMatch && match.status === 'completed' && winnerId) {
        await tennisDB.exec`
          INSERT INTO matches (
            player1_id, player2_id, winner_id, match_date, tournament_name,
            tournament_level, surface, round_name, best_of, score, location, indoor
          ) VALUES (
            ${player1.id}, ${player2.id}, ${winnerId}, ${match.date}, ${match.tournament_name},
            ${match.tournament_level}, ${match.surface}, ${match.round}, ${match.best_of},
            ${match.score || ''}, ${match.location || ''}, ${match.indoor || false}
          )
        `;
        syncedCount++;
      }
    } catch (error) {
      console.error(`Failed to sync match ${match.id}:`, error);
    }
  }

  return syncedCount;
}

async function syncTournaments(tour: 'atp' | 'wta'): Promise<number> {
  const tournaments = await tennisAPI.getTournaments(tour, new Date().getFullYear(), 'upcoming');
  let syncedCount = 0;

  // For now, we'll just count tournaments we could sync
  // In a full implementation, you might want to store tournament data in a separate table
  for (const tournament of tournaments) {
    try {
      // Here you could store tournament information in a tournaments table
      // For this example, we'll just count them
      syncedCount++;
    } catch (error) {
      console.error(`Failed to sync tournament ${tournament.name}:`, error);
    }
  }

  return syncedCount;
}

async function getOrCreatePlayer(apiPlayer: TennisAPIPlayer): Promise<{id: number} | null> {
  let player = await tennisDB.queryRow<{id: number}>`
    SELECT id FROM players WHERE LOWER(name) = LOWER(${apiPlayer.name})
  `;

  if (!player) {
    try {
      const dominantHand = apiPlayer.plays === 'L' ? 'left' : 'right';
      const twoHandedBackhand = apiPlayer.backhand === '2' || apiPlayer.backhand === 'Two-handed';
      
      await tennisDB.exec`
        INSERT INTO players (name, birth_date, height_cm, dominant_hand, two_handed_backhand, country)
        VALUES (${apiPlayer.name}, ${apiPlayer.birth_date || null}, ${apiPlayer.height || null}, 
                ${dominantHand}, ${twoHandedBackhand}, ${apiPlayer.country})
      `;

      player = await tennisDB.queryRow<{id: number}>`
        SELECT id FROM players WHERE LOWER(name) = LOWER(${apiPlayer.name})
      `;
    } catch (error) {
      console.error(`Failed to create player ${apiPlayer.name}:`, error);
      return null;
    }
  }

  return player;
}

function shouldUpdatePlayer(lastUpdated: string): boolean {
  const lastUpdate = new Date(lastUpdated);
  const now = new Date();
  const daysSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceUpdate > 7; // Update if more than 7 days old
}
