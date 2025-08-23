import { api, APIError } from "encore.dev/api";
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
    try {
      // Validate input
      validateSyncInput(data_types, tour, days_back);

      const syncedData: SyncDataResponse['synced_data'] = {};
      const errors: string[] = [];

      const tours = tour === 'both' ? ['atp', 'wta'] as const : [tour as 'atp' | 'wta'];

      for (const currentTour of tours) {
        if (data_types.includes('players')) {
          try {
            const playersCount = await syncPlayers(currentTour, force_update);
            syncedData.players = (syncedData.players || 0) + playersCount;
          } catch (error) {
            const errorMsg = `Failed to sync ${currentTour.toUpperCase()} players: ${error}`;
            errors.push(errorMsg);
            console.error(errorMsg, error);
          }
        }

        if (data_types.includes('rankings')) {
          try {
            const rankingsCount = await syncRankings(currentTour);
            syncedData.rankings = (syncedData.rankings || 0) + rankingsCount;
          } catch (error) {
            const errorMsg = `Failed to sync ${currentTour.toUpperCase()} rankings: ${error}`;
            errors.push(errorMsg);
            console.error(errorMsg, error);
          }
        }

        if (data_types.includes('matches')) {
          try {
            const matchesCount = await syncRecentMatches(currentTour, days_back);
            syncedData.matches = (syncedData.matches || 0) + matchesCount;
          } catch (error) {
            const errorMsg = `Failed to sync ${currentTour.toUpperCase()} matches: ${error}`;
            errors.push(errorMsg);
            console.error(errorMsg, error);
          }
        }

        if (data_types.includes('tournaments')) {
          try {
            const tournamentsCount = await syncTournaments(currentTour);
            syncedData.tournaments = (syncedData.tournaments || 0) + tournamentsCount;
          } catch (error) {
            const errorMsg = `Failed to sync ${currentTour.toUpperCase()} tournaments: ${error}`;
            errors.push(errorMsg);
            console.error(errorMsg, error);
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
      if (error instanceof APIError) {
        throw error;
      }
      throw APIError.internal("Sync operation failed", error);
    }
  }
);

function validateSyncInput(dataTypes: string[], tour: string, daysBack: number): void {
  if (!Array.isArray(dataTypes) || dataTypes.length === 0) {
    throw APIError.invalidArgument("At least one data type must be specified");
  }

  const validDataTypes = ['players', 'rankings', 'matches', 'tournaments'];
  const invalidTypes = dataTypes.filter(type => !validDataTypes.includes(type));
  if (invalidTypes.length > 0) {
    throw APIError.invalidArgument(`Invalid data types: ${invalidTypes.join(', ')}. Valid types are: ${validDataTypes.join(', ')}`);
  }

  if (!['atp', 'wta', 'both'].includes(tour)) {
    throw APIError.invalidArgument("Tour must be 'atp', 'wta', or 'both'");
  }

  if (typeof daysBack !== 'number' || daysBack < 1 || daysBack > 365) {
    throw APIError.invalidArgument("Days back must be a number between 1 and 365");
  }
}

async function syncPlayers(tour: 'atp' | 'wta', forceUpdate: boolean): Promise<number> {
  try {
    const apiPlayers = await tennisAPI.getPlayers(tour, 500);
    let syncedCount = 0;

    for (const apiPlayer of apiPlayers) {
      try {
        if (!apiPlayer.name || apiPlayer.name.trim().length === 0) {
          console.warn(`Skipping player with empty name: ${JSON.stringify(apiPlayer)}`);
          continue;
        }

        const existingPlayer = await tennisDB.queryRow<{id: number, updated_at: string}>`
          SELECT id, updated_at FROM players WHERE name = ${apiPlayer.name}
        `;

        const dominantHand = apiPlayer.plays === 'L' ? 'left' : 'right';
        const twoHandedBackhand = apiPlayer.backhand === '2' || apiPlayer.backhand === 'Two-handed';
        const birthDate = validatePlayerBirthDate(apiPlayer.birth_date);
        const heightCm = validatePlayerHeight(apiPlayer.height);

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
  } catch (error) {
    throw new Error(`Failed to sync players for ${tour.toUpperCase()}: ${error}`);
  }
}

async function syncRankings(tour: 'atp' | 'wta'): Promise<number> {
  try {
    const rankings = await tennisAPI.getRankings(tour);
    let syncedCount = 0;

    for (const ranking of rankings) {
      try {
        if (!ranking.player_name || ranking.player_name.trim().length === 0) {
          console.warn(`Skipping ranking with empty player name: ${JSON.stringify(ranking)}`);
          continue;
        }

        if (!ranking.ranking || ranking.ranking < 1 || ranking.ranking > 10000) {
          console.warn(`Skipping ranking with invalid ranking number: ${JSON.stringify(ranking)}`);
          continue;
        }

        const player = await tennisDB.queryRow<{id: number}>`
          SELECT id FROM players WHERE LOWER(name) = LOWER(${ranking.player_name})
        `;

        if (player) {
          // Calculate Elo rating based on ranking (simple formula)
          const eloRating = Math.max(1000, 1500 + (200 - ranking.ranking) * 2);

          // Create or update player stats with current ranking
          await tennisDB.exec`
            INSERT INTO player_stats (
              player_id, match_id, ranking, elo_rating, career_matches_played, 
              career_matches_won, career_win_pct, recent_form_5, years_on_tour
            ) VALUES (
              ${player.id}, 0, ${ranking.ranking}, ${eloRating}, 
              0, 0, 0, 0, 0
            )
            ON CONFLICT (player_id, match_id) DO UPDATE SET
              ranking = EXCLUDED.ranking,
              elo_rating = EXCLUDED.elo_rating,
              created_at = NOW()
          `;
          syncedCount++;
        } else {
          console.warn(`Player not found for ranking: ${ranking.player_name}`);
        }
      } catch (error) {
        console.error(`Failed to sync ranking for ${ranking.player_name}:`, error);
      }
    }

    return syncedCount;
  } catch (error) {
    throw new Error(`Failed to sync rankings for ${tour.toUpperCase()}: ${error}`);
  }
}

async function syncRecentMatches(tour: 'atp' | 'wta', daysBack: number): Promise<number> {
  try {
    const matches = await tennisAPI.getRecentMatches(tour, daysBack);
    let syncedCount = 0;

    for (const match of matches) {
      try {
        if (!validateMatchData(match)) {
          continue;
        }

        // Get or create players
        const player1 = await getOrCreatePlayer(match.player1);
        const player2 = await getOrCreatePlayer(match.player2);
        
        if (!player1 || !player2) {
          console.warn(`Failed to get or create players for match: ${match.id}`);
          continue;
        }

        const winnerId = match.winner ? 
          (match.winner.name === match.player1.name ? player1.id : player2.id) : null;

        // Validate match date
        const matchDate = validateMatchDate(match.date);
        if (!matchDate) {
          console.warn(`Invalid match date for match ${match.id}: ${match.date}`);
          continue;
        }

        // Check if match already exists
        const existingMatch = await tennisDB.queryRow<{id: number}>`
          SELECT id FROM matches 
          WHERE player1_id = ${player1.id} AND player2_id = ${player2.id} 
          AND match_date = ${matchDate}
          AND tournament_name = ${match.tournament_name}
        `;

        if (!existingMatch && match.status === 'completed' && winnerId) {
          await tennisDB.exec`
            INSERT INTO matches (
              player1_id, player2_id, winner_id, match_date, tournament_name,
              tournament_level, surface, round_name, best_of, score, location, indoor
            ) VALUES (
              ${player1.id}, ${player2.id}, ${winnerId}, ${matchDate}, ${match.tournament_name},
              ${match.tournament_level}, ${match.surface}, ${match.round}, ${match.best_of || 3},
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
  } catch (error) {
    throw new Error(`Failed to sync matches for ${tour.toUpperCase()}: ${error}`);
  }
}

async function syncTournaments(tour: 'atp' | 'wta'): Promise<number> {
  try {
    const tournaments = await tennisAPI.getTournaments(tour, new Date().getFullYear(), 'upcoming');
    let syncedCount = 0;

    // For now, we'll just count tournaments we could sync
    // In a full implementation, you might want to store tournament data in a separate table
    for (const tournament of tournaments) {
      try {
        if (!tournament.name || tournament.name.trim().length === 0) {
          console.warn(`Skipping tournament with empty name: ${JSON.stringify(tournament)}`);
          continue;
        }

        // Here you could store tournament information in a tournaments table
        // For this example, we'll just count them
        syncedCount++;
      } catch (error) {
        console.error(`Failed to sync tournament ${tournament.name}:`, error);
      }
    }

    return syncedCount;
  } catch (error) {
    throw new Error(`Failed to sync tournaments for ${tour.toUpperCase()}: ${error}`);
  }
}

async function getOrCreatePlayer(apiPlayer: TennisAPIPlayer): Promise<{id: number} | null> {
  try {
    if (!apiPlayer.name || apiPlayer.name.trim().length === 0) {
      throw new Error("Player name is required");
    }

    let player = await tennisDB.queryRow<{id: number}>`
      SELECT id FROM players WHERE LOWER(name) = LOWER(${apiPlayer.name})
    `;

    if (!player) {
      const dominantHand = apiPlayer.plays === 'L' ? 'left' : 'right';
      const twoHandedBackhand = apiPlayer.backhand === '2' || apiPlayer.backhand === 'Two-handed';
      const birthDate = validatePlayerBirthDate(apiPlayer.birth_date);
      const heightCm = validatePlayerHeight(apiPlayer.height);
      
      await tennisDB.exec`
        INSERT INTO players (name, birth_date, height_cm, dominant_hand, two_handed_backhand, country)
        VALUES (${apiPlayer.name}, ${birthDate}, ${heightCm}, 
                ${dominantHand}, ${twoHandedBackhand}, ${apiPlayer.country})
      `;

      player = await tennisDB.queryRow<{id: number}>`
        SELECT id FROM players WHERE LOWER(name) = LOWER(${apiPlayer.name})
      `;
    }

    return player;
  } catch (error) {
    console.error(`Failed to get or create player ${apiPlayer.name}:`, error);
    return null;
  }
}

function validateMatchData(match: TennisAPIMatch): boolean {
  if (!match.player1 || !match.player1.name || match.player1.name.trim().length === 0) {
    console.warn(`Invalid player1 data for match ${match.id}`);
    return false;
  }

  if (!match.player2 || !match.player2.name || match.player2.name.trim().length === 0) {
    console.warn(`Invalid player2 data for match ${match.id}`);
    return false;
  }

  if (match.player1.name === match.player2.name) {
    console.warn(`Player1 and player2 are the same for match ${match.id}`);
    return false;
  }

  if (!match.tournament_name || match.tournament_name.trim().length === 0) {
    console.warn(`Missing tournament name for match ${match.id}`);
    return false;
  }

  return true;
}

function validateMatchDate(dateStr: string): string | null {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return null;
    }

    const year = date.getFullYear();
    if (year < 1990 || year > new Date().getFullYear() + 1) {
      return null;
    }

    return date.toISOString().split('T')[0];
  } catch {
    return null;
  }
}

function validatePlayerBirthDate(birthDate?: string): string | null {
  if (!birthDate) return null;
  
  try {
    const date = new Date(birthDate);
    if (isNaN(date.getTime())) return null;
    
    const year = date.getFullYear();
    if (year < 1950 || year > new Date().getFullYear() - 15) {
      return null; // Invalid birth year
    }
    
    return date.toISOString().split('T')[0];
  } catch {
    return null;
  }
}

function validatePlayerHeight(height?: number): number | null {
  if (!height || typeof height !== 'number') return null;
  
  if (height < 140 || height > 220) {
    return null; // Invalid height
  }
  
  return height;
}

function shouldUpdatePlayer(lastUpdated: string): boolean {
  try {
    const lastUpdate = new Date(lastUpdated);
    const now = new Date();
    const daysSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceUpdate > 7; // Update if more than 7 days old
  } catch {
    return true; // Update if we can't parse the date
  }
}
