import { api, APIError } from "encore.dev/api";
import { tennisDB } from "./db";

interface UploadFileRequest {
  file_content: string;
  file_name: string;
  player1_name?: string;
  player2_name?: string;
}

interface UploadFileResponse {
  success: boolean;
  processed_data: {
    players_added: number;
    matches_added: number;
    stats_added: number;
  };
  extracted_players: string[];
  message: string;
}

// Uploads a tennis data file and extracts relevant information for specified players.
export const uploadFile = api<UploadFileRequest, UploadFileResponse>(
  { expose: true, method: "POST", path: "/tennis/upload-file" },
  async ({ file_content, file_name, player1_name, player2_name }) => {
    try {
      const lines = file_content.trim().split('\n');
      if (lines.length < 2) {
        throw APIError.invalidArgument("File must contain at least a header and one data row");
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const dataType = detectDataType(headers);
      
      let processedData = {
        players_added: 0,
        matches_added: 0,
        stats_added: 0
      };
      
      const extractedPlayers = new Set<string>();
      const targetPlayers = [player1_name, player2_name].filter(Boolean).map(name => name!.toLowerCase());

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        
        if (values.length !== headers.length) {
          continue; // Skip malformed rows
        }

        const record: Record<string, string> = {};
        headers.forEach((header, index) => {
          record[header] = values[index];
        });

        // Extract player names from the record
        const playersInRecord = extractPlayersFromRecord(record, dataType);
        playersInRecord.forEach(player => extractedPlayers.add(player));

        // Only process records that involve the target players (if specified)
        if (targetPlayers.length > 0) {
          const recordPlayersLower = playersInRecord.map(p => p.toLowerCase());
          const hasTargetPlayer = targetPlayers.some(target => 
            recordPlayersLower.some(recordPlayer => recordPlayer.includes(target) || target.includes(recordPlayer))
          );
          
          if (!hasTargetPlayer) {
            continue; // Skip records that don't involve target players
          }
        }

        // Process the record based on detected data type
        if (dataType === 'players') {
          await processPlayerRecord(record);
          processedData.players_added++;
        } else if (dataType === 'matches') {
          const success = await processMatchRecord(record);
          if (success) processedData.matches_added++;
        } else if (dataType === 'stats') {
          const success = await processStatsRecord(record);
          if (success) processedData.stats_added++;
        } else {
          // Try to process as mixed data
          if (hasPlayerFields(record)) {
            await processPlayerRecord(record);
            processedData.players_added++;
          }
          if (hasMatchFields(record)) {
            const success = await processMatchRecord(record);
            if (success) processedData.matches_added++;
          }
          if (hasStatsFields(record)) {
            const success = await processStatsRecord(record);
            if (success) processedData.stats_added++;
          }
        }
      }

      const totalProcessed = processedData.players_added + processedData.matches_added + processedData.stats_added;
      
      return {
        success: true,
        processed_data: processedData,
        extracted_players: Array.from(extractedPlayers),
        message: `Successfully processed ${totalProcessed} records from ${file_name}. Found data for ${extractedPlayers.size} players.`
      };
    } catch (error) {
      throw APIError.internal("Failed to process file", error);
    }
  }
);

function detectDataType(headers: string[]): 'players' | 'matches' | 'stats' | 'mixed' {
  const playerFields = ['name', 'player_name', 'birth_date', 'birthdate', 'height', 'height_cm', 'country'];
  const matchFields = ['player1', 'player2', 'winner', 'match_date', 'date', 'tournament', 'surface', 'score'];
  const statsFields = ['ranking', 'elo_rating', 'elo', 'win_pct', 'matches_played', 'matches_won'];

  const hasPlayerFields = playerFields.some(field => headers.includes(field));
  const hasMatchFields = matchFields.some(field => headers.includes(field));
  const hasStatsFields = statsFields.some(field => headers.includes(field));

  if (hasPlayerFields && !hasMatchFields && !hasStatsFields) return 'players';
  if (hasMatchFields && !hasPlayerFields && !hasStatsFields) return 'matches';
  if (hasStatsFields && !hasPlayerFields && !hasMatchFields) return 'stats';
  return 'mixed';
}

function extractPlayersFromRecord(record: Record<string, string>, dataType: string): string[] {
  const players: string[] = [];
  
  // Extract player names based on common field names
  const playerFields = [
    'name', 'player_name', 'player', 'player1', 'player2', 'winner', 
    'player1_name', 'player2_name', 'winner_name'
  ];
  
  playerFields.forEach(field => {
    if (record[field] && record[field].trim()) {
      players.push(record[field].trim());
    }
  });
  
  return [...new Set(players)]; // Remove duplicates
}

function hasPlayerFields(record: Record<string, string>): boolean {
  const playerFields = ['name', 'player_name', 'birth_date', 'birthdate', 'height', 'height_cm'];
  return playerFields.some(field => record[field]);
}

function hasMatchFields(record: Record<string, string>): boolean {
  const matchFields = ['player1', 'player2', 'winner', 'match_date', 'date', 'tournament'];
  return matchFields.some(field => record[field]);
}

function hasStatsFields(record: Record<string, string>): boolean {
  const statsFields = ['ranking', 'elo_rating', 'elo', 'win_pct', 'matches_played'];
  return statsFields.some(field => record[field]);
}

async function processPlayerRecord(record: Record<string, string>): Promise<void> {
  const name = record.name || record.player_name || record.player;
  if (!name) return;

  const birthDate = record.birth_date || record.birthdate || null;
  const height = record.height_cm || record.height ? parseInt(record.height_cm || record.height) : null;
  const hand = record.dominant_hand || record.hand || record.plays === 'L' ? 'left' : 'right';
  const backhand = record.two_handed_backhand === 'true' || record.two_handed_backhand === '1' || 
                   record.backhand === '2' || record.backhand === 'Two-handed';
  const country = record.country || record.nationality || null;

  await tennisDB.exec`
    INSERT INTO players (name, birth_date, height_cm, dominant_hand, two_handed_backhand, country)
    VALUES (${name}, ${birthDate}, ${height}, ${hand}, ${backhand}, ${country})
    ON CONFLICT (name) DO UPDATE SET
      birth_date = COALESCE(EXCLUDED.birth_date, players.birth_date),
      height_cm = COALESCE(EXCLUDED.height_cm, players.height_cm),
      dominant_hand = COALESCE(EXCLUDED.dominant_hand, players.dominant_hand),
      two_handed_backhand = COALESCE(EXCLUDED.two_handed_backhand, players.two_handed_backhand),
      country = COALESCE(EXCLUDED.country, players.country),
      updated_at = NOW()
  `;
}

async function processMatchRecord(record: Record<string, string>): Promise<boolean> {
  const player1Name = record.player1 || record.player1_name;
  const player2Name = record.player2 || record.player2_name;
  const winnerName = record.winner || record.winner_name;
  
  if (!player1Name || !player2Name || !winnerName) return false;

  // Get or create players
  const player1 = await getOrCreatePlayerByName(player1Name);
  const player2 = await getOrCreatePlayerByName(player2Name);
  const winner = await getOrCreatePlayerByName(winnerName);
  
  if (!player1 || !player2 || !winner) return false;

  const matchDate = record.match_date || record.date || new Date().toISOString().split('T')[0];
  const tournament = record.tournament || record.tournament_name || 'Unknown';
  const level = record.tournament_level || record.level || 'ATP 250';
  const surface = record.surface || 'hard';
  const round = record.round || record.round_name || 'R32';
  const bestOf = record.best_of ? parseInt(record.best_of) : 3;
  const score = record.score || '';
  const duration = record.duration_minutes ? parseInt(record.duration_minutes) : null;
  const location = record.location || '';
  const indoor = record.indoor === 'true' || record.indoor === '1';

  // Check if match already exists
  const existingMatch = await tennisDB.queryRow<{id: number}>`
    SELECT id FROM matches 
    WHERE player1_id = ${player1.id} AND player2_id = ${player2.id} 
    AND match_date = ${matchDate}
    AND tournament_name = ${tournament}
  `;

  if (!existingMatch) {
    await tennisDB.exec`
      INSERT INTO matches (
        player1_id, player2_id, winner_id, match_date, tournament_name,
        tournament_level, surface, round_name, best_of, score, duration_minutes,
        location, indoor
      ) VALUES (
        ${player1.id}, ${player2.id}, ${winner.id}, ${matchDate}, ${tournament},
        ${level}, ${surface}, ${round}, ${bestOf}, ${score}, ${duration},
        ${location}, ${indoor}
      )
    `;
  }

  return true;
}

async function processStatsRecord(record: Record<string, string>): Promise<boolean> {
  const playerName = record.player || record.player_name || record.name;
  if (!playerName) return false;

  const player = await getOrCreatePlayerByName(playerName);
  if (!player) return false;

  // Parse numeric fields with defaults
  const parseFloatSafe = (value: string, defaultValue: number = 0): number => {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
  };

  const parseIntSafe = (value: string, defaultValue: number = 0): number => {
    const parsed = parseInt(value);
    return isNaN(parsed) ? defaultValue : parsed;
  };

  await tennisDB.exec`
    INSERT INTO player_stats (
      player_id, match_id, ranking, elo_rating, elo_clay, elo_grass, elo_hard,
      career_matches_played, career_matches_won, career_win_pct,
      clay_matches_played, clay_matches_won, clay_win_pct,
      grass_matches_played, grass_matches_won, grass_win_pct,
      hard_matches_played, hard_matches_won, hard_win_pct,
      aces_per_match, first_serve_pct, first_serve_points_won_pct,
      break_points_saved_pct, recent_form_5, years_on_tour
    ) VALUES (
      ${player.id}, ${parseIntSafe(record.match_id || '0')}, ${parseIntSafe(record.ranking || '0')},
      ${parseFloatSafe(record.elo_rating || record.elo || '1500')}, 
      ${parseFloatSafe(record.elo_clay || '1500')},
      ${parseFloatSafe(record.elo_grass || '1500')}, 
      ${parseFloatSafe(record.elo_hard || '1500')},
      ${parseIntSafe(record.career_matches_played || '0')}, 
      ${parseIntSafe(record.career_matches_won || '0')},
      ${parseFloatSafe(record.career_win_pct || '0')}, 
      ${parseIntSafe(record.clay_matches_played || '0')},
      ${parseIntSafe(record.clay_matches_won || '0')}, 
      ${parseFloatSafe(record.clay_win_pct || '0')},
      ${parseIntSafe(record.grass_matches_played || '0')}, 
      ${parseIntSafe(record.grass_matches_won || '0')},
      ${parseFloatSafe(record.grass_win_pct || '0')}, 
      ${parseIntSafe(record.hard_matches_played || '0')},
      ${parseIntSafe(record.hard_matches_won || '0')}, 
      ${parseFloatSafe(record.hard_win_pct || '0')},
      ${parseFloatSafe(record.aces_per_match || '0')}, 
      ${parseFloatSafe(record.first_serve_pct || '0')},
      ${parseFloatSafe(record.first_serve_points_won_pct || '0')}, 
      ${parseFloatSafe(record.break_points_saved_pct || '0')},
      ${parseIntSafe(record.recent_form_5 || '0')}, 
      ${parseFloatSafe(record.years_on_tour || '0')}
    )
    ON CONFLICT (player_id, match_id) DO UPDATE SET
      ranking = EXCLUDED.ranking,
      elo_rating = EXCLUDED.elo_rating,
      elo_clay = EXCLUDED.elo_clay,
      elo_grass = EXCLUDED.elo_grass,
      elo_hard = EXCLUDED.elo_hard,
      career_matches_played = EXCLUDED.career_matches_played,
      career_matches_won = EXCLUDED.career_matches_won,
      career_win_pct = EXCLUDED.career_win_pct,
      clay_matches_played = EXCLUDED.clay_matches_played,
      clay_matches_won = EXCLUDED.clay_matches_won,
      clay_win_pct = EXCLUDED.clay_win_pct,
      grass_matches_played = EXCLUDED.grass_matches_played,
      grass_matches_won = EXCLUDED.grass_matches_won,
      grass_win_pct = EXCLUDED.grass_win_pct,
      hard_matches_played = EXCLUDED.hard_matches_played,
      hard_matches_won = EXCLUDED.hard_matches_won,
      hard_win_pct = EXCLUDED.hard_win_pct,
      aces_per_match = EXCLUDED.aces_per_match,
      first_serve_pct = EXCLUDED.first_serve_pct,
      first_serve_points_won_pct = EXCLUDED.first_serve_points_won_pct,
      break_points_saved_pct = EXCLUDED.break_points_saved_pct,
      recent_form_5 = EXCLUDED.recent_form_5,
      years_on_tour = EXCLUDED.years_on_tour,
      created_at = NOW()
  `;

  return true;
}

async function getOrCreatePlayerByName(playerName: string): Promise<{id: number} | null> {
  let player = await tennisDB.queryRow<{id: number}>`
    SELECT id FROM players WHERE LOWER(name) = LOWER(${playerName})
  `;

  if (!player) {
    try {
      await tennisDB.exec`
        INSERT INTO players (name, dominant_hand, two_handed_backhand)
        VALUES (${playerName}, 'right', false)
      `;

      player = await tennisDB.queryRow<{id: number}>`
        SELECT id FROM players WHERE LOWER(name) = LOWER(${playerName})
      `;
    } catch (error) {
      console.error(`Failed to create player ${playerName}:`, error);
      return null;
    }
  }

  return player;
}
