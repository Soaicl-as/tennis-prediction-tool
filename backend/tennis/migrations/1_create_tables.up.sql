-- Players table
CREATE TABLE players (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  birth_date DATE,
  height_cm INTEGER,
  dominant_hand TEXT CHECK (dominant_hand IN ('right', 'left')),
  two_handed_backhand BOOLEAN DEFAULT FALSE,
  country TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Matches table
CREATE TABLE matches (
  id BIGSERIAL PRIMARY KEY,
  player1_id BIGINT REFERENCES players(id),
  player2_id BIGINT REFERENCES players(id),
  winner_id BIGINT REFERENCES players(id),
  match_date DATE NOT NULL,
  tournament_name TEXT,
  tournament_level TEXT CHECK (tournament_level IN ('Grand Slam', 'Masters 1000', 'ATP 500', 'ATP 250', 'WTA 1000', 'WTA 500', 'WTA 250', 'Challenger', 'ITF')),
  surface TEXT CHECK (surface IN ('clay', 'grass', 'hard', 'indoor')),
  round_name TEXT,
  best_of INTEGER CHECK (best_of IN (3, 5)),
  score TEXT,
  duration_minutes INTEGER,
  location TEXT,
  altitude_m INTEGER,
  indoor BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Player statistics table (career stats at time of match)
CREATE TABLE player_stats (
  id BIGSERIAL PRIMARY KEY,
  player_id BIGINT REFERENCES players(id),
  match_id BIGINT REFERENCES matches(id),
  ranking INTEGER,
  elo_rating DOUBLE PRECISION,
  elo_clay DOUBLE PRECISION,
  elo_grass DOUBLE PRECISION,
  elo_hard DOUBLE PRECISION,
  career_matches_played INTEGER DEFAULT 0,
  career_matches_won INTEGER DEFAULT 0,
  career_win_pct DOUBLE PRECISION DEFAULT 0,
  clay_matches_played INTEGER DEFAULT 0,
  clay_matches_won INTEGER DEFAULT 0,
  clay_win_pct DOUBLE PRECISION DEFAULT 0,
  grass_matches_played INTEGER DEFAULT 0,
  grass_matches_won INTEGER DEFAULT 0,
  grass_win_pct DOUBLE PRECISION DEFAULT 0,
  hard_matches_played INTEGER DEFAULT 0,
  hard_matches_won INTEGER DEFAULT 0,
  hard_win_pct DOUBLE PRECISION DEFAULT 0,
  indoor_matches_played INTEGER DEFAULT 0,
  indoor_matches_won INTEGER DEFAULT 0,
  indoor_win_pct DOUBLE PRECISION DEFAULT 0,
  aces_per_match DOUBLE PRECISION DEFAULT 0,
  double_faults_per_match DOUBLE PRECISION DEFAULT 0,
  first_serve_pct DOUBLE PRECISION DEFAULT 0,
  first_serve_points_won_pct DOUBLE PRECISION DEFAULT 0,
  second_serve_points_won_pct DOUBLE PRECISION DEFAULT 0,
  break_points_saved_pct DOUBLE PRECISION DEFAULT 0,
  break_points_converted_pct DOUBLE PRECISION DEFAULT 0,
  return_games_won_pct DOUBLE PRECISION DEFAULT 0,
  return_points_won_pct DOUBLE PRECISION DEFAULT 0,
  tiebreak_win_pct DOUBLE PRECISION DEFAULT 0,
  avg_sets_per_match DOUBLE PRECISION DEFAULT 0,
  recent_form_5 INTEGER DEFAULT 0,
  recent_form_10 INTEGER DEFAULT 0,
  days_since_last_match INTEGER DEFAULT 0,
  top10_win_pct DOUBLE PRECISION DEFAULT 0,
  top50_win_pct DOUBLE PRECISION DEFAULT 0,
  years_on_tour DOUBLE PRECISION DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Head-to-head records
CREATE TABLE head_to_head (
  id BIGSERIAL PRIMARY KEY,
  player1_id BIGINT REFERENCES players(id),
  player2_id BIGINT REFERENCES players(id),
  total_matches INTEGER DEFAULT 0,
  player1_wins INTEGER DEFAULT 0,
  player2_wins INTEGER DEFAULT 0,
  clay_matches INTEGER DEFAULT 0,
  clay_player1_wins INTEGER DEFAULT 0,
  grass_matches INTEGER DEFAULT 0,
  grass_player1_wins INTEGER DEFAULT 0,
  hard_matches INTEGER DEFAULT 0,
  hard_player1_wins INTEGER DEFAULT 0,
  indoor_matches INTEGER DEFAULT 0,
  indoor_player1_wins INTEGER DEFAULT 0,
  last_match_date DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(player1_id, player2_id)
);

-- Predictions table to store model predictions
CREATE TABLE predictions (
  id BIGSERIAL PRIMARY KEY,
  player1_name TEXT NOT NULL,
  player2_name TEXT NOT NULL,
  surface TEXT NOT NULL,
  tournament_level TEXT,
  predicted_winner TEXT NOT NULL,
  win_probability DOUBLE PRECISION NOT NULL,
  model_version TEXT DEFAULT 'v1.0',
  feature_importance JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX idx_matches_date ON matches(match_date);
CREATE INDEX idx_matches_player1 ON matches(player1_id);
CREATE INDEX idx_matches_player2 ON matches(player2_id);
CREATE INDEX idx_player_stats_player_match ON player_stats(player_id, match_id);
CREATE INDEX idx_head_to_head_players ON head_to_head(player1_id, player2_id);
CREATE INDEX idx_players_name ON players(name);
