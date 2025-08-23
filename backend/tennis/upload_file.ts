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
      // Validate input
      validateUploadInput(file_content, file_name);

      const lines = file_content.trim().split('\n');
      if (lines.length < 2) {
        throw APIError.invalidArgument("File must contain at least a header and one data row");
      }

      const headers = parseHeaders(lines[0]);
      const dataType = detectDataType(headers);
      
      let processedData = {
        players_added: 0,
        matches_added: 0,
        stats_added: 0
      };
      
      const extractedPlayers = new Set<string>();
      const targetPlayers = [player1_name, player2_name]
        .filter(Boolean)
        .map(name => name!.trim().toLowerCase())
        .filter(name => name.length > 0);

      let processedRows = 0;
      let errorCount = 0;

      for (let i = 1; i < lines.length; i++) {
        try {
          const values = parseCSVLine(lines[i]);
          
          if (values.length !== headers.length) {
            console.warn(`Row ${i + 1}: Column count mismatch (expected ${headers.length}, got ${values.length})`);
            continue;
          }

          const record = createRecord(headers, values);

          // Extract player names from the record
          const playersInRecord = extractPlayersFromRecord(record, dataType);
          playersInRecord.forEach(player => {
            if (player && player.trim()) {
              extractedPlayers.add(player.trim());
            }
          });

          // Only process records that involve the target players (if specified)
          if (targetPlayers.length > 0) {
            const recordPlayersLower = playersInRecord.map(p => p.toLowerCase());
            const hasTargetPlayer = targetPlayers.some(target => 
              recordPlayersLower.some(recordPlayer => 
                recordPlayer.includes(target) || target.includes(recordPlayer)
              )
            );
            
            if (!hasTargetPlayer) {
              continue;
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

          processedRows++;
        } catch (error) {
          errorCount++;
          console.error(`Error processing row ${i + 1}:`, error);
          
          // Stop processing if too many errors
          if (errorCount > 10) {
            throw APIError.invalidArgument(`Too many errors in file (${errorCount} errors). Please check your data format.`);
          }
        }
      }

      const totalProcessed = processedData.players_added + processedData.matches_added + processedData.stats_added;
      
      let message = `Successfully processed ${totalProcessed} records from ${file_name}. Found data for ${extractedPlayers.size} players.`;
      if (errorCount > 0) {
        message += ` (${errorCount} rows had errors and were skipped)`;
      }

      return {
        success: true,
        processed_data: processedData,
        extracted_players: Array.from(extractedPlayers),
        message
      };
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      throw APIError.internal("Failed to process file", error);
    }
  }
);

function validateUploadInput(fileContent: string, fileName: string): void {
  if (!fileContent || typeof fileContent !== 'string') {
    throw APIError.invalidArgument("File content is required and must be a string");
  }

  if (fileContent.trim().length === 0) {
    throw APIError.invalidArgument("File content cannot be empty");
  }

  if (fileContent.length > 10 * 1024 * 1024) { // 10MB limit
    throw APIError.invalidArgument("File size exceeds 10MB limit");
  }

  if (!fileName || typeof fileName !== 'string') {
    throw APIError.invalidArgument("File name is required and must be a string");
  }

  if (fileName.trim().length === 0) {
    throw APIError.invalidArgument("File name cannot be empty");
  }
}

function parseHeaders(headerLine: string): string[] {
  try {
    const headers = parseCSVLine(headerLine).map(h => h.trim().toLowerCase());
    
    if (headers.length === 0) {
      throw new Error("No headers found");
    }

    // Check for duplicate headers
    const uniqueHeaders = new Set(headers);
    if (uniqueHeaders.size !== headers.length) {
      throw new Error("Duplicate column headers found");
    }

    return headers;
  } catch (error) {
    throw APIError.invalidArgument(`Invalid CSV header format: ${error}`);
  }
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  // Add the last field
  result.push(current.trim());
  
  return result;
}

function createRecord(headers: string[], values: string[]): Record<string, string> {
  const record: Record<string, string> = {};
  
  for (let i = 0; i < headers.length && i < values.length; i++) {
    record[headers[i]] = values[i];
  }
  
  return record;
}

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
  if (!name || name.trim().length === 0) {
    throw new Error("Player name is required");
  }

  if (name.trim().length > 100) {
    throw new Error("Player name is too long (max 100 characters)");
  }

  try {
    const birthDate = validateDate(record.birth_date || record.birthdate);
    const height = validateHeight(record.height_cm || record.height);
    const hand = validateHand(record.dominant_hand || record.hand || record.plays);
    const backhand = validateBackhand(record.two_handed_backhand || record.backhand);
    const country = validateCountry(record.country || record.nationality);

    await tennisDB.exec`
      INSERT INTO players (name, birth_date, height_cm, dominant_hand, two_handed_backhand, country)
      VALUES (${name.trim()}, ${birthDate}, ${height}, ${hand}, ${backhand}, ${country})
      ON CONFLICT (name) DO UPDATE SET
        birth_date = COALESCE(EXCLUDED.birth_date, players.birth_date),
        height_cm = COALESCE(EXCLUDED.height_cm, players.height_cm),
        dominant_hand = COALESCE(EXCLUDED.dominant_hand, players.dominant_hand),
        two_handed_backhand = COALESCE(EXCLUDED.two_handed_backhand, players.two_handed_backhand),
        country = COALESCE(EXCLUDED.country, players.country),
        updated_at = NOW()
    `;
  } catch (error) {
    throw new Error(`Failed to process player record for "${name}": ${error}`);
  }
}

async function processMatchRecord(record: Record<string, string>): Promise<boolean> {
  const player1Name = record.player1 || record.player1_name;
  const player2Name = record.player2 || record.player2_name;
  const winnerName = record.winner || record.winner_name;
  
  if (!player1Name || !player2Name || !winnerName) {
    throw new Error("Player1, player2, and winner names are required for match records");
  }

  if (player1Name.trim() === player2Name.trim()) {
    throw new Error("Player1 and player2 must be different");
  }

  if (winnerName.trim() !== player1Name.trim() && winnerName.trim() !== player2Name.trim()) {
    throw new Error("Winner must be either player1 or player2");
  }

  try {
    // Get or create players
    const [player1, player2, winner] = await Promise.all([
      getOrCreatePlayerByName(player1Name.trim()),
      getOrCreatePlayerByName(player2Name.trim()),
      getOrCreatePlayerByName(winnerName.trim())
    ]);
    
    if (!player1 || !player2 || !winner) {
      throw new Error("Failed to create or find players");
    }

    const matchDate = validateMatchDate(record.match_date || record.date);
    const tournament = validateTournament(record.tournament || record.tournament_name);
    const level = validateTournamentLevel(record.tournament_level || record.level);
    const surface = validateSurface(record.surface);
    const round = validateRound(record.round || record.round_name);
    const bestOf = validateBestOf(record.best_of);
    const score = validateScore(record.score);
    const duration = validateDuration(record.duration_minutes);
    const location = validateLocation(record.location);
    const indoor = validateIndoor(record.indoor);

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
  } catch (error) {
    throw new Error(`Failed to process match record: ${error}`);
  }
}

async function processStatsRecord(record: Record<string, string>): Promise<boolean> {
  const playerName = record.player || record.player_name || record.name;
  if (!playerName || playerName.trim().length === 0) {
    throw new Error("Player name is required for stats records");
  }

  try {
    const player = await getOrCreatePlayerByName(playerName.trim());
    if (!player) {
      throw new Error(`Failed to find or create player: ${playerName}`);
    }

    // Parse and validate numeric fields
    const matchId = validateInteger(record.match_id, 0, 0, Number.MAX_SAFE_INTEGER);
    const ranking = validateInteger(record.ranking, 0, 0, 10000);
    const eloRating = validateFloat(record.elo_rating || record.elo, 1500, 0, 3000);
    const eloClay = validateFloat(record.elo_clay, 1500, 0, 3000);
    const eloGrass = validateFloat(record.elo_grass, 1500, 0, 3000);
    const eloHard = validateFloat(record.elo_hard, 1500, 0, 3000);
    
    const careerMatchesPlayed = validateInteger(record.career_matches_played, 0, 0, 10000);
    const careerMatchesWon = validateInteger(record.career_matches_won, 0, 0, 10000);
    const careerWinPct = validateFloat(record.career_win_pct, 0, 0, 1);
    
    const clayMatchesPlayed = validateInteger(record.clay_matches_played, 0, 0, 10000);
    const clayMatchesWon = validateInteger(record.clay_matches_won, 0, 0, 10000);
    const clayWinPct = validateFloat(record.clay_win_pct, 0, 0, 1);
    
    const grassMatchesPlayed = validateInteger(record.grass_matches_played, 0, 0, 10000);
    const grassMatchesWon = validateInteger(record.grass_matches_won, 0, 0, 10000);
    const grassWinPct = validateFloat(record.grass_win_pct, 0, 0, 1);
    
    const hardMatchesPlayed = validateInteger(record.hard_matches_played, 0, 0, 10000);
    const hardMatchesWon = validateInteger(record.hard_matches_won, 0, 0, 10000);
    const hardWinPct = validateFloat(record.hard_win_pct, 0, 0, 1);
    
    const acesPerMatch = validateFloat(record.aces_per_match, 0, 0, 50);
    const firstServePct = validateFloat(record.first_serve_pct, 0, 0, 1);
    const firstServePointsWonPct = validateFloat(record.first_serve_points_won_pct, 0, 0, 1);
    const breakPointsSavedPct = validateFloat(record.break_points_saved_pct, 0, 0, 1);
    const recentForm5 = validateInteger(record.recent_form_5, 0, 0, 5);
    const yearsOnTour = validateFloat(record.years_on_tour, 0, 0, 30);

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
        ${player.id}, ${matchId}, ${ranking}, ${eloRating}, ${eloClay}, ${eloGrass}, ${eloHard},
        ${careerMatchesPlayed}, ${careerMatchesWon}, ${careerWinPct},
        ${clayMatchesPlayed}, ${clayMatchesWon}, ${clayWinPct},
        ${grassMatchesPlayed}, ${grassMatchesWon}, ${grassWinPct},
        ${hardMatchesPlayed}, ${hardMatchesWon}, ${hardWinPct},
        ${acesPerMatch}, ${firstServePct}, ${firstServePointsWonPct},
        ${breakPointsSavedPct}, ${recentForm5}, ${yearsOnTour}
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
  } catch (error) {
    throw new Error(`Failed to process stats record for "${playerName}": ${error}`);
  }
}

async function getOrCreatePlayerByName(playerName: string): Promise<{id: number} | null> {
  if (!playerName || playerName.trim().length === 0) {
    throw new Error("Player name cannot be empty");
  }

  const name = playerName.trim();
  
  if (name.length > 100) {
    throw new Error("Player name is too long (max 100 characters)");
  }

  try {
    let player = await tennisDB.queryRow<{id: number}>`
      SELECT id FROM players WHERE LOWER(name) = LOWER(${name})
    `;

    if (!player) {
      await tennisDB.exec`
        INSERT INTO players (name, dominant_hand, two_handed_backhand)
        VALUES (${name}, 'right', false)
      `;

      player = await tennisDB.queryRow<{id: number}>`
        SELECT id FROM players WHERE LOWER(name) = LOWER(${name})
      `;
    }

    return player;
  } catch (error) {
    throw new Error(`Failed to get or create player "${name}": ${error}`);
  }
}

// Validation helper functions
function validateDate(dateStr?: string): string | null {
  if (!dateStr || dateStr.trim().length === 0) return null;
  
  const date = new Date(dateStr.trim());
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date format: ${dateStr}`);
  }
  
  const year = date.getFullYear();
  if (year < 1950 || year > new Date().getFullYear()) {
    throw new Error(`Date year must be between 1950 and current year: ${dateStr}`);
  }
  
  return date.toISOString().split('T')[0];
}

function validateHeight(heightStr?: string): number | null {
  if (!heightStr || heightStr.trim().length === 0) return null;
  
  const height = parseInt(heightStr.trim());
  if (isNaN(height) || height < 140 || height > 220) {
    throw new Error(`Height must be between 140 and 220 cm: ${heightStr}`);
  }
  
  return height;
}

function validateHand(handStr?: string): string {
  if (!handStr || handStr.trim().length === 0) return 'right';
  
  const hand = handStr.trim().toLowerCase();
  if (hand === 'l' || hand === 'left') return 'left';
  if (hand === 'r' || hand === 'right') return 'right';
  
  return 'right'; // Default to right
}

function validateBackhand(backhandStr?: string): boolean {
  if (!backhandStr || backhandStr.trim().length === 0) return false;
  
  const backhand = backhandStr.trim().toLowerCase();
  return backhand === 'true' || backhand === '1' || backhand === '2' || backhand === 'two-handed';
}

function validateCountry(countryStr?: string): string | null {
  if (!countryStr || countryStr.trim().length === 0) return null;
  
  const country = countryStr.trim();
  if (country.length > 50) {
    throw new Error(`Country name is too long (max 50 characters): ${country}`);
  }
  
  return country;
}

function validateMatchDate(dateStr?: string): string {
  if (!dateStr || dateStr.trim().length === 0) {
    return new Date().toISOString().split('T')[0];
  }
  
  const date = new Date(dateStr.trim());
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid match date format: ${dateStr}`);
  }
  
  return date.toISOString().split('T')[0];
}

function validateTournament(tournamentStr?: string): string {
  if (!tournamentStr || tournamentStr.trim().length === 0) return 'Unknown';
  
  const tournament = tournamentStr.trim();
  if (tournament.length > 100) {
    throw new Error(`Tournament name is too long (max 100 characters): ${tournament}`);
  }
  
  return tournament;
}

function validateTournamentLevel(levelStr?: string): string {
  if (!levelStr || levelStr.trim().length === 0) return 'ATP 250';
  
  const validLevels = ['Grand Slam', 'Masters 1000', 'ATP 500', 'ATP 250', 'WTA 1000', 'WTA 500', 'WTA 250', 'Challenger', 'ITF'];
  const level = levelStr.trim();
  
  if (validLevels.includes(level)) {
    return level;
  }
  
  return 'ATP 250'; // Default
}

function validateSurface(surfaceStr?: string): string {
  if (!surfaceStr || surfaceStr.trim().length === 0) return 'hard';
  
  const validSurfaces = ['clay', 'grass', 'hard', 'indoor'];
  const surface = surfaceStr.trim().toLowerCase();
  
  if (validSurfaces.includes(surface)) {
    return surface;
  }
  
  return 'hard'; // Default
}

function validateRound(roundStr?: string): string {
  if (!roundStr || roundStr.trim().length === 0) return 'R32';
  
  const round = roundStr.trim();
  if (round.length > 20) {
    throw new Error(`Round name is too long (max 20 characters): ${round}`);
  }
  
  return round;
}

function validateBestOf(bestOfStr?: string): number {
  if (!bestOfStr || bestOfStr.trim().length === 0) return 3;
  
  const bestOf = parseInt(bestOfStr.trim());
  if (bestOf === 3 || bestOf === 5) {
    return bestOf;
  }
  
  return 3; // Default
}

function validateScore(scoreStr?: string): string {
  if (!scoreStr || scoreStr.trim().length === 0) return '';
  
  const score = scoreStr.trim();
  if (score.length > 50) {
    throw new Error(`Score is too long (max 50 characters): ${score}`);
  }
  
  return score;
}

function validateDuration(durationStr?: string): number | null {
  if (!durationStr || durationStr.trim().length === 0) return null;
  
  const duration = parseInt(durationStr.trim());
  if (isNaN(duration) || duration < 30 || duration > 600) {
    return null; // Invalid duration, return null
  }
  
  return duration;
}

function validateLocation(locationStr?: string): string {
  if (!locationStr || locationStr.trim().length === 0) return '';
  
  const location = locationStr.trim();
  if (location.length > 100) {
    throw new Error(`Location is too long (max 100 characters): ${location}`);
  }
  
  return location;
}

function validateIndoor(indoorStr?: string): boolean {
  if (!indoorStr || indoorStr.trim().length === 0) return false;
  
  const indoor = indoorStr.trim().toLowerCase();
  return indoor === 'true' || indoor === '1';
}

function validateInteger(valueStr?: string, defaultValue: number = 0, min: number = Number.MIN_SAFE_INTEGER, max: number = Number.MAX_SAFE_INTEGER): number {
  if (!valueStr || valueStr.trim().length === 0) return defaultValue;
  
  const value = parseInt(valueStr.trim());
  if (isNaN(value) || value < min || value > max) {
    return defaultValue;
  }
  
  return value;
}

function validateFloat(valueStr?: string, defaultValue: number = 0, min: number = Number.MIN_VALUE, max: number = Number.MAX_VALUE): number {
  if (!valueStr || valueStr.trim().length === 0) return defaultValue;
  
  const value = parseFloat(valueStr.trim());
  if (isNaN(value) || value < min || value > max) {
    return defaultValue;
  }
  
  return value;
}
