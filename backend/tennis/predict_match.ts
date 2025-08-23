import { api, APIError } from "encore.dev/api";
import { tennisDB } from "./db";
import { cache } from "./cache";
import type { PredictionInput, PredictionResult, Player, PlayerStats, HeadToHead } from "./types";

// Optimized prediction with caching and performance improvements
export const predictMatch = api<PredictionInput, PredictionResult>(
  { expose: true, method: "POST", path: "/tennis/predict" },
  async (input) => {
    try {
      // Validate input
      validatePredictionInput(input);

      // Check cache first for exact prediction
      const cachedPrediction = await cache.getPrediction(
        input.player1_name,
        input.player2_name,
        input.surface,
        input.tournament_level
      );

      if (cachedPrediction) {
        return cachedPrediction;
      }

      // Get player information with optimized queries
      const [player1, player2] = await Promise.all([
        getPlayerByNameOptimized(input.player1_name),
        getPlayerByNameOptimized(input.player2_name)
      ]);

      // Get cached or fresh stats for both players
      const [player1Stats, player2Stats, h2h] = await Promise.all([
        getPlayerStatsOptimized(player1.id),
        getPlayerStatsOptimized(player2.id),
        getHeadToHeadOptimized(player1.id, player2.id)
      ]);

      // Calculate prediction using optimized algorithm
      const prediction = calculateMatchPredictionOptimized(
        player1, player1Stats,
        player2, player2Stats,
        h2h, input
      );

      // Cache the prediction
      await cache.setPrediction(
        input.player1_name,
        input.player2_name,
        input.surface,
        prediction,
        input.tournament_level,
        3600 // 1 hour cache
      );

      // Store prediction in database (async, don't wait)
      storePredictionAsync(input, prediction);

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

async function getPlayerByNameOptimized(playerName: string): Promise<Player> {
  try {
    // Use optimized query with index on LOWER(name)
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

async function getPlayerStatsOptimized(playerId: number): Promise<PlayerStats> {
  try {
    // Check cache first
    const cachedStats = await cache.getPlayerStats(playerId);
    if (cachedStats) {
      return cachedStats;
    }

    // Use optimized query with index on (player_id, created_at DESC)
    const stats = await tennisDB.queryRow<PlayerStats>`
      SELECT * FROM player_stats 
      WHERE player_id = ${playerId} 
      ORDER BY created_at DESC 
      LIMIT 1
    `;

    if (!stats) {
      throw APIError.notFound(`No statistics found for player ID ${playerId}`);
    }

    // Validate and set defaults for critical stats
    if (stats.elo_rating === null || stats.elo_rating === undefined) {
      stats.elo_rating = 1500;
    }

    if (stats.career_win_pct === null || stats.career_win_pct === undefined) {
      stats.career_win_pct = 0.5;
    }

    // Cache the stats for 10 minutes
    await cache.setPlayerStats(playerId, stats, 600);

    return stats;
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    throw APIError.internal(`Database error while fetching stats for player ID ${playerId}`, error);
  }
}

async function getHeadToHeadOptimized(player1Id: number, player2Id: number): Promise<HeadToHead | null> {
  try {
    // Check cache first
    const cachedH2H = await cache.getHeadToHead(player1Id, player2Id);
    if (cachedH2H) {
      return cachedH2H;
    }

    // Use optimized query with composite index
    const h2h = await tennisDB.queryRow<HeadToHead>`
      SELECT * FROM head_to_head 
      WHERE (player1_id = ${player1Id} AND player2_id = ${player2Id})
         OR (player1_id = ${player2Id} AND player2_id = ${player1Id})
    `;

    // Cache the result for 30 minutes (even if null)
    await cache.setHeadToHead(player1Id, player2Id, h2h, 1800);

    return h2h;
  } catch (error) {
    console.warn(`Failed to fetch head-to-head data for players ${player1Id} and ${player2Id}:`, error);
    return null;
  }
}

async function storePredictionAsync(input: PredictionInput, prediction: PredictionResult): Promise<void> {
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
    console.error("Failed to store prediction in database:", error);
  }
}

function calculateMatchPredictionOptimized(
  player1: Player, player1Stats: PlayerStats,
  player2: Player, player2Stats: PlayerStats,
  h2h: HeadToHead | null,
  input: PredictionInput
): PredictionResult {
  try {
    // Pre-calculate commonly used values
    const player1Age = calculateAge(player1.birth_date);
    const player2Age = calculateAge(player2.birth_date);
    const player1Ranking = player1Stats.ranking || 100;
    const player2Ranking = player2Stats.ranking || 100;
    
    // Use surface-specific Elo ratings for better accuracy
    const surfaceElo1 = getSurfaceEloOptimized(player1Stats, input.surface);
    const surfaceElo2 = getSurfaceEloOptimized(player2Stats, input.surface);
    
    // Get surface-specific win percentages
    const surfaceWinPct1 = getSurfaceWinPctOptimized(player1Stats, input.surface);
    const surfaceWinPct2 = getSurfaceWinPctOptimized(player2Stats, input.surface);

    // Calculate features efficiently
    const features = calculateFeaturesOptimized(
      player1Age, player2Age,
      player1Ranking, player2Ranking,
      surfaceElo1, surfaceElo2,
      surfaceWinPct1, surfaceWinPct2,
      player1Stats, player2Stats,
      h2h, player1.id
    );

    // Calculate probability using optimized logistic regression
    const player1Probability = calculateProbabilityOptimized(features);
    const player2Probability = 1 - player1Probability;

    // Validate probabilities
    if (!isFinite(player1Probability) || player1Probability < 0 || player1Probability > 1) {
      throw new Error("Invalid probability calculation");
    }

    // Determine confidence level efficiently
    const probDiff = Math.abs(player1Probability - 0.5);
    const confidenceLevel: 'low' | 'medium' | 'high' = 
      probDiff >= 0.25 ? 'high' : probDiff >= 0.1 ? 'medium' : 'low';

    // Generate feature importance efficiently
    const featureImportance = generateFeatureImportanceOptimized(
      player1, player2, player1Stats, player2Stats, h2h, input,
      player1Ranking, player2Ranking, surfaceElo1, surfaceElo2,
      surfaceWinPct1, surfaceWinPct2
    );

    return {
      predicted_winner: player1Probability > 0.5 ? player1.name : player2.name,
      win_probability: Math.max(player1Probability, player2Probability),
      player1_probability: player1Probability,
      player2_probability: player2Probability,
      confidence_level: confidenceLevel,
      feature_importance: featureImportance,
      model_version: 'v1.1-optimized'
    };
  } catch (error) {
    throw new Error(`Failed to calculate match prediction: ${error}`);
  }
}

function calculateFeaturesOptimized(
  player1Age: number, player2Age: number,
  player1Ranking: number, player2Ranking: number,
  surfaceElo1: number, surfaceElo2: number,
  surfaceWinPct1: number, surfaceWinPct2: number,
  player1Stats: PlayerStats, player2Stats: PlayerStats,
  h2h: HeadToHead | null, player1Id: number
): number[] {
  const features = [];

  // Age difference
  features.push(player1Age - player2Age);

  // Ranking difference (lower is better)
  features.push(player2Ranking - player1Ranking);

  // Elo rating difference
  features.push(surfaceElo1 - surfaceElo2);

  // Surface win percentage difference
  features.push(surfaceWinPct1 - surfaceWinPct2);

  // Recent form difference
  features.push((player1Stats.recent_form_5 || 0) - (player2Stats.recent_form_5 || 0));

  // Head-to-head advantage
  let h2hAdvantage = 0;
  if (h2h && h2h.total_matches > 0) {
    const player1H2HWins = h2h.player1_id === player1Id ? h2h.player1_wins : h2h.player2_wins;
    h2hAdvantage = (player1H2HWins / h2h.total_matches) - 0.5;
  }
  features.push(h2hAdvantage);

  // Serve advantage
  const serveAdvantage = ((player1Stats.aces_per_match || 0) - (player2Stats.aces_per_match || 0)) / 10 +
                        ((player1Stats.first_serve_pct || 0) - (player2Stats.first_serve_pct || 0));
  features.push(serveAdvantage);

  return features;
}

function calculateProbabilityOptimized(features: number[]): number {
  // Optimized weights based on tennis analytics research
  const weights = [-0.02, 0.01, 0.003, 2.0, 0.15, 1.5, 0.3];
  
  let logit = 0;
  for (let i = 0; i < Math.min(features.length, weights.length); i++) {
    if (isFinite(features[i])) {
      logit += features[i] * weights[i];
    }
  }

  // Convert logit to probability using fast approximation
  return 1 / (1 + Math.exp(-logit));
}

function generateFeatureImportanceOptimized(
  player1: Player, player2: Player,
  player1Stats: PlayerStats, player2Stats: PlayerStats,
  h2h: HeadToHead | null, input: PredictionInput,
  player1Ranking: number, player2Ranking: number,
  surfaceElo1: number, surfaceElo2: number,
  surfaceWinPct1: number, surfaceWinPct2: number
): Array<{ feature: string; importance: number; description: string }> {
  const featureImportance = [];

  // Ranking difference
  const rankingDiff = Math.abs(player2Ranking - player1Ranking);
  featureImportance.push({
    feature: 'Ranking Difference',
    importance: Math.min(rankingDiff / 100, 1),
    description: `${player1.name} ranked ${player1Ranking}, ${player2.name} ranked ${player2Ranking}`
  });

  // Elo rating difference
  const eloDiff = Math.abs(surfaceElo1 - surfaceElo2);
  featureImportance.push({
    feature: 'Elo Rating Difference',
    importance: Math.min(eloDiff / 200, 1),
    description: `${player1.name}: ${surfaceElo1.toFixed(0)}, ${player2.name}: ${surfaceElo2.toFixed(0)} on ${input.surface}`
  });

  // Surface win percentage
  const surfaceWinDiff = Math.abs(surfaceWinPct1 - surfaceWinPct2);
  featureImportance.push({
    feature: 'Surface Win % Difference',
    importance: surfaceWinDiff,
    description: `${player1.name}: ${(surfaceWinPct1 * 100).toFixed(1)}%, ${player2.name}: ${(surfaceWinPct2 * 100).toFixed(1)}% on ${input.surface}`
  });

  // Recent form
  const formDiff = Math.abs((player1Stats.recent_form_5 || 0) - (player2Stats.recent_form_5 || 0));
  featureImportance.push({
    feature: 'Recent Form (Last 5)',
    importance: formDiff / 5,
    description: `${player1.name}: ${player1Stats.recent_form_5 || 0}/5, ${player2.name}: ${player2Stats.recent_form_5 || 0}/5`
  });

  // Head-to-head
  if (h2h && h2h.total_matches > 0) {
    const player1H2HWins = h2h.player1_id === player1.id ? h2h.player1_wins : h2h.player2_wins;
    const h2hAdvantage = Math.abs((player1H2HWins / h2h.total_matches) - 0.5);
    featureImportance.push({
      feature: 'Head-to-Head Record',
      importance: h2hAdvantage * 2,
      description: `${player1.name} leads ${player1H2HWins}-${h2h.total_matches - player1H2HWins} in ${h2h.total_matches} matches`
    });
  }

  return featureImportance.sort((a, b) => b.importance - a.importance);
}

function calculateAge(birthDate?: string): number {
  if (!birthDate) return 30;
  
  try {
    const birth = new Date(birthDate);
    const now = new Date();
    const age = (now.getTime() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    
    return (age >= 15 && age <= 50) ? age : 30;
  } catch {
    return 30;
  }
}

function getSurfaceEloOptimized(stats: PlayerStats, surface: string): number {
  try {
    const baseElo = stats.elo_rating || 1500;
    
    switch (surface) {
      case 'clay': return stats.elo_clay || baseElo;
      case 'grass': return stats.elo_grass || baseElo;
      case 'hard': return stats.elo_hard || baseElo;
      case 'indoor': return stats.elo_hard || baseElo;
      default: return baseElo;
    }
  } catch {
    return 1500;
  }
}

function getSurfaceWinPctOptimized(stats: PlayerStats, surface: string): number {
  try {
    let winPct: number;
    
    switch (surface) {
      case 'clay': winPct = stats.clay_win_pct; break;
      case 'grass': winPct = stats.grass_win_pct; break;
      case 'hard': winPct = stats.hard_win_pct; break;
      case 'indoor': winPct = stats.indoor_win_pct; break;
      default: winPct = stats.career_win_pct; break;
    }
    
    // Validate and return
    return (winPct !== null && winPct !== undefined && isFinite(winPct) && winPct >= 0 && winPct <= 1) 
      ? winPct 
      : (stats.career_win_pct || 0.5);
  } catch {
    return 0.5;
  }
}
