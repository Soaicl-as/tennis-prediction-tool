import { api, APIError } from "encore.dev/api";
import { tennisDB } from "./db";
import type { PredictionInput, PredictionResult, Player, PlayerStats, HeadToHead } from "./types";

// Predicts the outcome of a tennis match between two players.
export const predictMatch = api<PredictionInput, PredictionResult>(
  { expose: true, method: "POST", path: "/tennis/predict" },
  async (input) => {
    try {
      // Validate input
      validatePredictionInput(input);

      // Get player information
      const [player1, player2] = await Promise.all([
        getPlayerByName(input.player1_name),
        getPlayerByName(input.player2_name)
      ]);

      // Get latest stats for both players
      const [player1Stats, player2Stats] = await Promise.all([
        getLatestPlayerStats(player1.id),
        getLatestPlayerStats(player2.id)
      ]);

      // Get head-to-head record
      const h2h = await getHeadToHeadRecord(player1.id, player2.id);

      // Calculate prediction using our model
      const prediction = calculateMatchPrediction(
        player1, player1Stats,
        player2, player2Stats,
        h2h, input
      );

      // Store prediction in database
      await storePrediction(input, prediction);

      return prediction;
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      throw APIError.internal("Failed to generate match prediction", error);
    }
  }
);

function validatePredictionInput(input: PredictionInput): void {
  if (!input.player1_name || typeof input.player1_name !== 'string' || input.player1_name.trim().length === 0) {
    throw APIError.invalidArgument("Player 1 name is required and must be a non-empty string");
  }

  if (!input.player2_name || typeof input.player2_name !== 'string' || input.player2_name.trim().length === 0) {
    throw APIError.invalidArgument("Player 2 name is required and must be a non-empty string");
  }

  if (input.player1_name.trim().toLowerCase() === input.player2_name.trim().toLowerCase()) {
    throw APIError.invalidArgument("Player names must be different");
  }

  if (!input.surface || !['clay', 'grass', 'hard', 'indoor'].includes(input.surface)) {
    throw APIError.invalidArgument("Surface must be one of: clay, grass, hard, indoor");
  }

  if (input.best_of && ![3, 5].includes(input.best_of)) {
    throw APIError.invalidArgument("Best of must be either 3 or 5");
  }

  if (input.tournament_level && typeof input.tournament_level !== 'string') {
    throw APIError.invalidArgument("Tournament level must be a string");
  }

  if (input.location && typeof input.location !== 'string') {
    throw APIError.invalidArgument("Location must be a string");
  }

  if (input.indoor !== undefined && typeof input.indoor !== 'boolean') {
    throw APIError.invalidArgument("Indoor must be a boolean");
  }
}

async function getPlayerByName(playerName: string): Promise<Player> {
  try {
    const player = await tennisDB.queryRow<Player>`
      SELECT * FROM players WHERE LOWER(name) = LOWER(${playerName.trim()})
    `;
    
    if (!player) {
      throw APIError.notFound(`Player "${playerName}" not found in database`);
    }

    return player;
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    throw APIError.internal(`Database error while fetching player "${playerName}"`, error);
  }
}

async function getLatestPlayerStats(playerId: number): Promise<PlayerStats> {
  try {
    const stats = await tennisDB.queryRow<PlayerStats>`
      SELECT * FROM player_stats 
      WHERE player_id = ${playerId} 
      ORDER BY created_at DESC 
      LIMIT 1
    `;

    if (!stats) {
      throw APIError.notFound(`No statistics found for player ID ${playerId}`);
    }

    // Validate critical stats
    if (stats.elo_rating === null || stats.elo_rating === undefined) {
      stats.elo_rating = 1500; // Default Elo rating
    }

    if (stats.career_win_pct === null || stats.career_win_pct === undefined) {
      stats.career_win_pct = 0.5; // Default win percentage
    }

    return stats;
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    throw APIError.internal(`Database error while fetching stats for player ID ${playerId}`, error);
  }
}

async function getHeadToHeadRecord(player1Id: number, player2Id: number): Promise<HeadToHead | null> {
  try {
    const h2h = await tennisDB.queryRow<HeadToHead>`
      SELECT * FROM head_to_head 
      WHERE (player1_id = ${player1Id} AND player2_id = ${player2Id})
         OR (player1_id = ${player2Id} AND player2_id = ${player1Id})
    `;

    return h2h;
  } catch (error) {
    // Head-to-head data is optional, so we don't throw an error if it's missing
    console.warn(`Failed to fetch head-to-head data for players ${player1Id} and ${player2Id}:`, error);
    return null;
  }
}

async function storePrediction(input: PredictionInput, prediction: PredictionResult): Promise<void> {
  try {
    await tennisDB.exec`
      INSERT INTO predictions (
        player1_name, player2_name, surface, tournament_level,
        predicted_winner, win_probability, feature_importance
      ) VALUES (
        ${input.player1_name}, ${input.player2_name}, ${input.surface},
        ${input.tournament_level || 'Unknown'}, ${prediction.predicted_winner},
        ${prediction.win_probability}, ${JSON.stringify(prediction.feature_importance)}
      )
    `;
  } catch (error) {
    // Log the error but don't fail the prediction
    console.error("Failed to store prediction in database:", error);
  }
}

function calculateMatchPrediction(
  player1: Player, player1Stats: PlayerStats,
  player2: Player, player2Stats: PlayerStats,
  h2h: HeadToHead | null,
  input: PredictionInput
): PredictionResult {
  try {
    const features = [];
    const featureImportance = [];

    // Age factor
    const player1Age = calculateAge(player1.birth_date);
    const player2Age = calculateAge(player2.birth_date);
    const ageDiff = player1Age - player2Age;
    features.push(ageDiff);

    // Ranking difference (lower ranking number is better)
    const player1Ranking = player1Stats.ranking || 100;
    const player2Ranking = player2Stats.ranking || 100;
    const rankingDiff = player2Ranking - player1Ranking;
    features.push(rankingDiff);
    featureImportance.push({
      feature: 'Ranking Difference',
      importance: Math.min(Math.abs(rankingDiff) / 100, 1),
      description: `${player1.name} ranked ${player1Ranking}, ${player2.name} ranked ${player2Ranking}`
    });

    // Elo rating difference
    const surfaceElo1 = getSurfaceElo(player1Stats, input.surface);
    const surfaceElo2 = getSurfaceElo(player2Stats, input.surface);
    const eloDiff = surfaceElo1 - surfaceElo2;
    features.push(eloDiff);
    featureImportance.push({
      feature: 'Elo Rating Difference',
      importance: Math.min(Math.abs(eloDiff) / 200, 1),
      description: `${player1.name}: ${surfaceElo1.toFixed(0)}, ${player2.name}: ${surfaceElo2.toFixed(0)} on ${input.surface}`
    });

    // Surface-specific win percentage
    const surfaceWinPct1 = getSurfaceWinPct(player1Stats, input.surface);
    const surfaceWinPct2 = getSurfaceWinPct(player2Stats, input.surface);
    const surfaceWinDiff = surfaceWinPct1 - surfaceWinPct2;
    features.push(surfaceWinDiff);
    featureImportance.push({
      feature: 'Surface Win % Difference',
      importance: Math.abs(surfaceWinDiff),
      description: `${player1.name}: ${(surfaceWinPct1 * 100).toFixed(1)}%, ${player2.name}: ${(surfaceWinPct2 * 100).toFixed(1)}% on ${input.surface}`
    });

    // Recent form
    const formDiff = (player1Stats.recent_form_5 || 0) - (player2Stats.recent_form_5 || 0);
    features.push(formDiff);
    featureImportance.push({
      feature: 'Recent Form (Last 5)',
      importance: Math.abs(formDiff) / 5,
      description: `${player1.name}: ${player1Stats.recent_form_5 || 0}/5, ${player2.name}: ${player2Stats.recent_form_5 || 0}/5`
    });

    // Head-to-head record
    let h2hAdvantage = 0;
    if (h2h && h2h.total_matches > 0) {
      const player1H2HWins = h2h.player1_id === player1.id ? h2h.player1_wins : h2h.player2_wins;
      const player1H2HWinPct = player1H2HWins / h2h.total_matches;
      h2hAdvantage = player1H2HWinPct - 0.5; // Convert to advantage (-0.5 to +0.5)
      
      featureImportance.push({
        feature: 'Head-to-Head Record',
        importance: Math.abs(h2hAdvantage) * 2,
        description: `${player1.name} leads ${player1H2HWins}-${h2h.total_matches - player1H2HWins} in ${h2h.total_matches} matches`
      });
    }
    features.push(h2hAdvantage);

    // Serve advantage
    const serveAdvantage = ((player1Stats.aces_per_match || 0) - (player2Stats.aces_per_match || 0)) / 10 +
                          ((player1Stats.first_serve_pct || 0) - (player2Stats.first_serve_pct || 0));
    features.push(serveAdvantage);

    // Calculate probability using logistic regression-like approach
    let logit = 0;
    
    // Weights based on tennis analytics research
    const weights = [
      -0.02,  // age difference (slight penalty for being older)
      0.01,   // ranking difference (positive means player1 has better ranking)
      0.003,  // elo difference
      2.0,    // surface win percentage difference
      0.15,   // recent form difference
      1.5,    // head-to-head advantage
      0.3     // serve advantage
    ];

    for (let i = 0; i < features.length && i < weights.length; i++) {
      if (isFinite(features[i])) {
        logit += features[i] * weights[i];
      }
    }

    // Convert logit to probability
    const player1Probability = 1 / (1 + Math.exp(-logit));
    const player2Probability = 1 - player1Probability;

    // Ensure probabilities are valid
    if (!isFinite(player1Probability) || player1Probability < 0 || player1Probability > 1) {
      throw new Error("Invalid probability calculation");
    }

    // Determine confidence level
    const probDiff = Math.abs(player1Probability - 0.5);
    let confidenceLevel: 'low' | 'medium' | 'high';
    if (probDiff < 0.1) confidenceLevel = 'low';
    else if (probDiff < 0.25) confidenceLevel = 'medium';
    else confidenceLevel = 'high';

    return {
      predicted_winner: player1Probability > 0.5 ? player1.name : player2.name,
      win_probability: Math.max(player1Probability, player2Probability),
      player1_probability: player1Probability,
      player2_probability: player2Probability,
      confidence_level: confidenceLevel,
      feature_importance: featureImportance.sort((a, b) => b.importance - a.importance),
      model_version: 'v1.0'
    };
  } catch (error) {
    throw new Error(`Failed to calculate match prediction: ${error}`);
  }
}

function calculateAge(birthDate?: string): number {
  if (!birthDate) return 30; // Default age
  
  try {
    const birth = new Date(birthDate);
    const now = new Date();
    const age = (now.getTime() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    
    if (age < 15 || age > 50) {
      return 30; // Default for invalid ages
    }
    
    return age;
  } catch {
    return 30; // Default age if date parsing fails
  }
}

function getSurfaceElo(stats: PlayerStats, surface: string): number {
  try {
    switch (surface) {
      case 'clay': return stats.elo_clay || stats.elo_rating || 1500;
      case 'grass': return stats.elo_grass || stats.elo_rating || 1500;
      case 'hard': return stats.elo_hard || stats.elo_rating || 1500;
      case 'indoor': return stats.elo_hard || stats.elo_rating || 1500; // Use hard court elo for indoor
      default: return stats.elo_rating || 1500;
    }
  } catch {
    return 1500; // Default Elo rating
  }
}

function getSurfaceWinPct(stats: PlayerStats, surface: string): number {
  try {
    let winPct: number;
    
    switch (surface) {
      case 'clay': winPct = stats.clay_win_pct; break;
      case 'grass': winPct = stats.grass_win_pct; break;
      case 'hard': winPct = stats.hard_win_pct; break;
      case 'indoor': winPct = stats.indoor_win_pct; break;
      default: winPct = stats.career_win_pct; break;
    }
    
    // Validate win percentage
    if (winPct === null || winPct === undefined || !isFinite(winPct) || winPct < 0 || winPct > 1) {
      return stats.career_win_pct || 0.5; // Default to career win percentage or 50%
    }
    
    return winPct;
  } catch {
    return 0.5; // Default win percentage
  }
}
