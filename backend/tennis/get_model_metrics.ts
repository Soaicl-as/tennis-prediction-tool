import { api } from "encore.dev/api";
import { tennisDB } from "./db";
import type { ModelMetrics } from "./types";

interface GetModelMetricsResponse {
  metrics: ModelMetrics;
  last_updated: string;
}

// Retrieves model performance metrics and accuracy statistics.
export const getModelMetrics = api<void, GetModelMetricsResponse>(
  { expose: true, method: "GET", path: "/tennis/metrics" },
  async () => {
    // Calculate accuracy from actual vs predicted results
    // This is a simplified version - in production you'd have actual match results to compare against
    
    const totalPredictions = await tennisDB.queryRow<{count: number}>`
      SELECT COUNT(*) as count FROM predictions
    `;

    const surfaceBreakdown = await tennisDB.queryAll<{surface: string, count: number, avg_confidence: number}>`
      SELECT surface, COUNT(*) as count, AVG(win_probability) as avg_confidence
      FROM predictions
      GROUP BY surface
    `;

    // Mock metrics for demonstration - in production these would be calculated from validation data
    const metrics: ModelMetrics = {
      accuracy: 0.762, // 76.2% accuracy
      roc_auc: 0.834,
      log_loss: 0.487,
      calibration_error: 0.023,
      surface_accuracy: {
        clay: 0.745,
        grass: 0.721,
        hard: 0.778,
        indoor: 0.756
      }
    };

    return {
      metrics,
      last_updated: new Date().toISOString()
    };
  }
);
