import { api } from "encore.dev/api";
import { Query } from "encore.dev/api";
import { tennisDB } from "./db";
import { cache } from "./cache";

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
  from_cache: boolean;
}

// Retrieves recent match predictions with optional filtering and caching.
export const getPredictions = api<GetPredictionsParams, GetPredictionsResponse>(
  { expose: true, method: "GET", path: "/tennis/predictions" },
  async ({ limit = 50, player }) => {
    try {
      // Create cache key based on parameters
      const cacheParams = { limit, player: player || 'all' };
      const cachedData = await cache.get('predictions_list', cacheParams);
      
      if (cachedData) {
        return {
          ...cachedData,
          from_cache: true
        };
      }

      let whereClause = '';
      let params: any[] = [];
      
      if (player) {
        whereClause = 'WHERE LOWER(player1_name) LIKE LOWER($1) OR LOWER(player2_name) LIKE LOWER($1)';
        params = [`%${player}%`];
      }

      // Use optimized query with index on created_at DESC
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

      const response = {
        predictions,
        total: totalResult?.count || 0,
        from_cache: false
      };

      // Cache for 5 minutes
      await cache.set('predictions_list', cacheParams, response, 300);

      return response;
    } catch (error) {
      throw new Error(`Failed to fetch predictions: ${error}`);
    }
  }
);
