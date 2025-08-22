export interface Player {
  id: number;
  name: string;
  birth_date?: string;
  height_cm?: number;
  dominant_hand?: 'right' | 'left';
  two_handed_backhand?: boolean;
  country?: string;
}

export interface Match {
  id: number;
  player1_id: number;
  player2_id: number;
  winner_id: number;
  match_date: string;
  tournament_name?: string;
  tournament_level?: string;
  surface: 'clay' | 'grass' | 'hard' | 'indoor';
  round_name?: string;
  best_of?: number;
  score?: string;
  duration_minutes?: number;
  location?: string;
  altitude_m?: number;
  indoor?: boolean;
}

export interface PlayerStats {
  id: number;
  player_id: number;
  match_id: number;
  ranking?: number;
  elo_rating?: number;
  elo_clay?: number;
  elo_grass?: number;
  elo_hard?: number;
  career_matches_played: number;
  career_matches_won: number;
  career_win_pct: number;
  clay_matches_played: number;
  clay_matches_won: number;
  clay_win_pct: number;
  grass_matches_played: number;
  grass_matches_won: number;
  grass_win_pct: number;
  hard_matches_played: number;
  hard_matches_won: number;
  hard_win_pct: number;
  indoor_matches_played: number;
  indoor_matches_won: number;
  indoor_win_pct: number;
  aces_per_match: number;
  double_faults_per_match: number;
  first_serve_pct: number;
  first_serve_points_won_pct: number;
  second_serve_points_won_pct: number;
  break_points_saved_pct: number;
  break_points_converted_pct: number;
  return_games_won_pct: number;
  return_points_won_pct: number;
  tiebreak_win_pct: number;
  avg_sets_per_match: number;
  recent_form_5: number;
  recent_form_10: number;
  days_since_last_match: number;
  top10_win_pct: number;
  top50_win_pct: number;
  years_on_tour: number;
}

export interface HeadToHead {
  id: number;
  player1_id: number;
  player2_id: number;
  total_matches: number;
  player1_wins: number;
  player2_wins: number;
  clay_matches: number;
  clay_player1_wins: number;
  grass_matches: number;
  grass_player1_wins: number;
  hard_matches: number;
  hard_player1_wins: number;
  indoor_matches: number;
  indoor_player1_wins: number;
  last_match_date?: string;
}

export interface PredictionInput {
  player1_name: string;
  player2_name: string;
  surface: 'clay' | 'grass' | 'hard' | 'indoor';
  tournament_level?: string;
  best_of?: number;
  location?: string;
  indoor?: boolean;
}

export interface PredictionResult {
  predicted_winner: string;
  win_probability: number;
  player1_probability: number;
  player2_probability: number;
  confidence_level: 'low' | 'medium' | 'high';
  feature_importance: FeatureImportance[];
  model_version: string;
}

export interface FeatureImportance {
  feature: string;
  importance: number;
  description: string;
}

export interface TrainingData {
  features: number[][];
  labels: number[];
  feature_names: string[];
}

export interface ModelMetrics {
  accuracy: number;
  roc_auc: number;
  log_loss: number;
  calibration_error: number;
  surface_accuracy: {
    clay: number;
    grass: number;
    hard: number;
    indoor: number;
  };
}
