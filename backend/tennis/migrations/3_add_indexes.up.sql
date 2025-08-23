-- Add indexes for frequently queried fields to improve performance

-- Player indexes
CREATE INDEX IF NOT EXISTS idx_players_name_lower ON players (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_players_country ON players (country);
CREATE INDEX IF NOT EXISTS idx_players_birth_date ON players (birth_date);

-- Match indexes
CREATE INDEX IF NOT EXISTS idx_matches_date_desc ON matches (match_date DESC);
CREATE INDEX IF NOT EXISTS idx_matches_tournament ON matches (tournament_name);
CREATE INDEX IF NOT EXISTS idx_matches_surface ON matches (surface);
CREATE INDEX IF NOT EXISTS idx_matches_level ON matches (tournament_level);
CREATE INDEX IF NOT EXISTS idx_matches_winner ON matches (winner_id);
CREATE INDEX IF NOT EXISTS idx_matches_players_date ON matches (player1_id, player2_id, match_date);

-- Player stats indexes
CREATE INDEX IF NOT EXISTS idx_player_stats_player_created ON player_stats (player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_player_stats_ranking ON player_stats (ranking) WHERE ranking IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_player_stats_elo ON player_stats (elo_rating) WHERE elo_rating IS NOT NULL;

-- Head-to-head indexes
CREATE INDEX IF NOT EXISTS idx_h2h_player_pair ON head_to_head (LEAST(player1_id, player2_id), GREATEST(player1_id, player2_id));
CREATE INDEX IF NOT EXISTS idx_h2h_last_match ON head_to_head (last_match_date DESC) WHERE last_match_date IS NOT NULL;

-- Prediction indexes
CREATE INDEX IF NOT EXISTS idx_predictions_created ON predictions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_predictions_players ON predictions (player1_name, player2_name);
CREATE INDEX IF NOT EXISTS idx_predictions_surface ON predictions (surface);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_matches_player_surface_date ON matches (player1_id, surface, match_date DESC);
CREATE INDEX IF NOT EXISTS idx_matches_player2_surface_date ON matches (player2_id, surface, match_date DESC);
CREATE INDEX IF NOT EXISTS idx_player_stats_match_player ON player_stats (match_id, player_id) WHERE match_id > 0;
