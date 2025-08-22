import { api, APIError } from "encore.dev/api";
import { tennisDB } from "./db";

interface UploadDataRequest {
  csv_data: string;
  data_type: 'players' | 'matches' | 'stats';
}

interface UploadDataResponse {
  success: boolean;
  records_processed: number;
  message: string;
}

// Uploads CSV data to populate the tennis database.
export const uploadData = api<UploadDataRequest, UploadDataResponse>(
  { expose: true, method: "POST", path: "/tennis/upload" },
  async ({ csv_data, data_type }) => {
    try {
      const lines = csv_data.trim().split('\n');
      if (lines.length < 2) {
        throw APIError.invalidArgument("CSV must contain at least a header and one data row");
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      let recordsProcessed = 0;

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        
        if (values.length !== headers.length) {
          continue; // Skip malformed rows
        }

        const record: Record<string, string> = {};
        headers.forEach((header, index) => {
          record[header] = values[index];
        });

        if (data_type === 'players') {
          await processPlayerRecord(record);
        } else if (data_type === 'matches') {
          await processMatchRecord(record);
        } else if (data_type === 'stats') {
          await processStatsRecord(record);
        }

        recordsProcessed++;
      }

      return {
        success: true,
        records_processed: recordsProcessed,
        message: `Successfully processed ${recordsProcessed} ${data_type} records`
      };
    } catch (error) {
      throw APIError.internal("Failed to process CSV data", error);
    }
  }
);

async function processPlayerRecord(record: Record<string, string>) {
  const name = record.name || record.player_name;
  if (!name) return;

  const birthDate = record.birth_date || record.birthdate || null;
  const height = record.height_cm ? parseInt(record.height_cm) : null;
  const hand = record.dominant_hand || record.hand || 'right';
  const backhand = record.two_handed_backhand === 'true' || record.two_handed_backhand === '1';
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

async function processMatchRecord(record: Record<string, string>) {
  const player1Name = record.player1 || record.player1_name;
  const player2Name = record.player2 || record.player2_name;
  const winnerName = record.winner || record.winner_name;
  
  if (!player1Name || !player2Name || !winnerName) return;

  // Get player IDs
  const player1 = await tennisDB.queryRow<{id: number}>`
    SELECT id FROM players WHERE LOWER(name) = LOWER(${player1Name})
  `;
  const player2 = await tennisDB.queryRow<{id: number}>`
    SELECT id FROM players WHERE LOWER(name) = LOWER(${player2Name})
  `;
  const winner = await tennisDB.queryRow<{id: number}>`
    SELECT id FROM players WHERE LOWER(name) = LOWER(${winnerName})
  `;

  if (!player1 || !player2 || !winner) return;

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

async function processStatsRecord(record: Record<string, string>) {
  const playerName = record.player || record.player_name;
  if (!playerName) return;

  const player = await tennisDB.queryRow<{id: number}>`
    SELECT id FROM players WHERE LOWER(name) = LOWER(${playerName})
  `;
  if (!player) return;

  // Parse numeric fields with defaults
  const parseFloat = (value: string, defaultValue: number = 0): number => {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
  };

  const parseInt = (value: string, defaultValue: number = 0): number => {
    const parsed = Number.parseInt(value);
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
      ${player.id}, ${parseInt(record.match_id || '0')}, ${parseInt(record.ranking || '0')},
      ${parseFloat(record.elo_rating || '1500')}, ${parseFloat(record.elo_clay || '1500')},
      ${parseFloat(record.elo_grass || '1500')}, ${parseFloat(record.elo_hard || '1500')},
      ${parseInt(record.career_matches_played || '0')}, ${parseInt(record.career_matches_won || '0')},
      ${parseFloat(record.career_win_pct || '0')}, ${parseInt(record.clay_matches_played || '0')},
      ${parseInt(record.clay_matches_won || '0')}, ${parseFloat(record.clay_win_pct || '0')},
      ${parseInt(record.grass_matches_played || '0')}, ${parseInt(record.grass_matches_won || '0')},
      ${parseFloat(record.grass_win_pct || '0')}, ${parseInt(record.hard_matches_played || '0')},
      ${parseInt(record.hard_matches_won || '0')}, ${parseFloat(record.hard_win_pct || '0')},
      ${parseFloat(record.aces_per_match || '0')}, ${parseFloat(record.first_serve_pct || '0')},
      ${parseFloat(record.first_serve_points_won_pct || '0')}, ${parseFloat(record.break_points_saved_pct || '0')},
      ${parseInt(record.recent_form_5 || '0')}, ${parseFloat(record.years_on_tour || '0')}
    )
  `;
}
