import { api, APIError } from "encore.dev/api";
import { tennisDB } from "./db";
import type { PredictionInput, PredictionResult, Player, PlayerStats, HeadToHead } from "./types";

// Predicts the outcome of a tennis match between two players.
export const predictMatch = api<PredictionInput, PredictionResult>(
  { expose: true, method: "POST", path: "/tennis/predict" },
  async (input) => {
    // Get player information
    const player1 = await tennisDB.queryRow<Player>`
      SELECT * FROM players WHERE LOWER(name) = LOWER(${input.player1_name})
    `;
    
    const player2 = await tennisDB.queryRow<Player>`
      SELECT * FROM players WHERE LOWER(name) = LOWER(${input.player2_name})
    `;

    if (!player1) {
      throw APIError.notFound(`Player "${input.player1_name}" not found`);
    }
    
    if (!player2) {
      throw APIError.notFound(`Player "${input.player2_name}" not found`);
    }

    // Get latest stats for both players
    const player1Stats = await tennisDB.queryRow<PlayerStats>`
      SELECT * FROM player_stats 
      WHERE player_id = ${player1.id} 
      ORDER BY created_at DESC 
      LIMIT 1
    `;
    
    const player2Stats = await tennisDB.queryRow<PlayerStats>`
      SELECT * FROM player_stats 
      WHERE player_id = ${player2.id} 
      ORDER BY created_at DESC 
      LIMIT 1
    `;

    if (!player1Stats || !player2Stats) {
      throw APIError.notFound("Player statistics not found");
    }

    // Get head-to-head record
    const h2h = await tennisDB.queryRow<HeadToHead>`
      SELECT * FROM head_to_head 
      WHERE (player1_id = ${player1.id} AND player2_id = ${player2.id})
         OR (player1_id = ${player2.id} AND player2_id = ${player1.id})
    `;

    // Calculate prediction using our model
    const prediction = calculateMatchPrediction(
      player1, player1Stats,
      player2, player2Stats,
      h2h, input
    );

    // Store prediction in database
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

    return prediction;
  }
);

function calculateMatchPrediction(
  player1: Player, player1Stats: PlayerStats,
  player2: Player, player2Stats: PlayerStats,
  h2h: HeadToHead | null,
  input: PredictionInput
): PredictionResult {
  const features = [];
  const featureImportance = [];

  // Age factor
  const player1Age = player1.birth_date ? 
    (new Date().getTime() - new Date(player1.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000) : 30;
  const player2Age = player2.birth_date ? 
    (new Date().getTime() - new Date(player2.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000) : 30;
  
  const ageDiff = player1Age - player2Age;
  features.push(ageDiff);

  // Ranking difference (lower ranking number is better)
  const rankingDiff = (player2Stats.ranking || 100) - (player1Stats.ranking || 100);
  features.push(rankingDiff);
  featureImportance.push({
    feature: 'Ranking Difference',
    importance: Math.abs(rankingDiff) / 100,
    description: `${player1.name} ranked ${player1Stats.ranking || 'unranked'}, ${player2.name} ranked ${player2Stats.ranking || 'unranked'}`
  });

  // Elo rating difference
  const surfaceElo1 = getSurfaceElo(player1Stats, input.surface);
  const surfaceElo2 = getSurfaceElo(player2Stats, input.surface);
  const eloDiff = surfaceElo1 - surfaceElo2;
  features.push(eloDiff);
  featureImportance.push({
    feature: 'Elo Rating Difference',
    importance: Math.abs(eloDiff) / 200,
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
  const formDiff = player1Stats.recent_form_5 - player2Stats.recent_form_5;
  features.push(formDiff);
  featureImportance.push({
    feature: 'Recent Form (Last 5)',
    importance: Math.abs(formDiff) / 5,
    description: `${player1.name}: ${player1Stats.recent_form_5}/5, ${player2.name}: ${player2Stats.recent_form_5}/5`
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
  const serveAdvantage = (player1Stats.aces_per_match - player2Stats.aces_per_match) / 10 +
                        (player1Stats.first_serve_pct - player2Stats.first_serve_pct);
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
    logit += features[i] * weights[i];
  }

  // Convert logit to probability
  const player1Probability = 1 / (1 + Math.exp(-logit));
  const player2Probability = 1 - player1Probability;

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
}

function getSurfaceElo(stats: PlayerStats, surface: string): number {
  switch (surface) {
    case 'clay': return stats.elo_clay || stats.elo_rating || 1500;
    case 'grass': return stats.elo_grass || stats.elo_rating || 1500;
    case 'hard': return stats.elo_hard || stats.elo_rating || 1500;
    case 'indoor': return stats.elo_hard || stats.elo_rating || 1500; // Use hard court elo for indoor
    default: return stats.elo_rating || 1500;
  }
}

function getSurfaceWinPct(stats: PlayerStats, surface: string): number {
  switch (surface) {
    case 'clay': return stats.clay_win_pct;
    case 'grass': return stats.grass_win_pct;
    case 'hard': return stats.hard_win_pct;
    case 'indoor': return stats.indoor_win_pct;
    default: return stats.career_win_pct;
  }
}
