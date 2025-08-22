import { api } from "encore.dev/api";
import { Query } from "encore.dev/api";
import { tennisDB } from "./db";

interface GetPredictionsParams {
  limit?: Query<number>;
  player?: Query<string>;
}

interface Prediction {
  id: number;
  player1_name: string;
  player2_name: string;
  surface: string;
  tournament_level: string;
  predicted_winner: string;
  win_probability: number;
  model_version: string;
  created_at: string;
}

interface GetPredictionsResponse {
  predictions: Prediction[];
  total: number;
}

// Retrieves recent match predictions with optional filtering.
export const getPredictions = api<GetPredictionsParams, GetPredictionsResponse>(
  { expose: true, method: "GET", path: "/tennis/predictions" },
  async ({ limit = 50, player }) => {
    let whereClause = '';
    let params: any[] = [];
    
    if (player) {
      whereClause = 'WHERE LOWER(player1_name) LIKE LOWER($1) OR LOWER(player2_name) LIKE LOWER($1)';
      params = [`%${player}%`];
    }

    const predictions = await tennisDB.rawQueryAll<Prediction>(
      `SELECT id, player1_name, player2_name, surface, tournament_level, 
              predicted_winner, win_probability, model_version, created_at
       FROM predictions 
       ${whereClause}
       ORDER BY created_at DESC 
       LIMIT $${params.length + 1}`,
      ...params, limit
    );

    const totalResult = await tennisDB.rawQueryRow<{count: number}>(
      `SELECT COUNT(*) as count FROM predictions ${whereClause}`,
      ...params
    );

    return {
      predictions,
      total: totalResult?.count || 0
    };
  }
);
