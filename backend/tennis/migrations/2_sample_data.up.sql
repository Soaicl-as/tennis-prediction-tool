-- Insert sample players
INSERT INTO players (name, birth_date, height_cm, dominant_hand, two_handed_backhand, country) VALUES
('Novak Djokovic', '1987-05-22', 188, 'right', TRUE, 'Serbia'),
('Rafael Nadal', '1986-06-03', 185, 'left', TRUE, 'Spain'),
('Roger Federer', '1981-08-08', 185, 'right', FALSE, 'Switzerland'),
('Carlos Alcaraz', '2003-05-05', 183, 'right', TRUE, 'Spain'),
('Daniil Medvedev', '1996-02-11', 198, 'right', TRUE, 'Russia'),
('Stefanos Tsitsipas', '1998-08-12', 193, 'right', FALSE, 'Greece'),
('Alexander Zverev', '1997-04-20', 198, 'right', TRUE, 'Germany'),
('Jannik Sinner', '2001-08-16', 188, 'right', TRUE, 'Italy'),
('Iga Swiatek', '2001-05-31', 176, 'right', TRUE, 'Poland'),
('Aryna Sabalenka', '1998-05-05', 182, 'right', TRUE, 'Belarus'),
('Coco Gauff', '2004-03-13', 175, 'right', TRUE, 'USA'),
('Jessica Pegula', '1994-02-24', 170, 'right', TRUE, 'USA');

-- Insert sample matches with realistic data
INSERT INTO matches (player1_id, player2_id, winner_id, match_date, tournament_name, tournament_level, surface, round_name, best_of, score, duration_minutes, location, indoor) VALUES
(1, 2, 1, '2023-06-11', 'French Open', 'Grand Slam', 'clay', 'Final', 5, '6-4, 6-2, 6-3', 180, 'Paris', FALSE),
(3, 4, 4, '2023-07-16', 'Wimbledon', 'Grand Slam', 'grass', 'Final', 5, '1-6, 7-6, 6-1, 3-6, 6-4', 240, 'London', FALSE),
(1, 5, 1, '2023-09-10', 'US Open', 'Grand Slam', 'hard', 'Final', 5, '6-3, 7-6, 6-3', 195, 'New York', FALSE),
(9, 10, 9, '2023-06-10', 'French Open', 'Grand Slam', 'clay', 'Final', 3, '6-2, 7-5', 120, 'Paris', FALSE),
(11, 12, 11, '2023-09-09', 'US Open', 'Grand Slam', 'hard', 'Final', 3, '2-6, 6-3, 6-2', 135, 'New York', FALSE);

-- Insert sample player stats for the matches
INSERT INTO player_stats (player_id, match_id, ranking, elo_rating, elo_clay, elo_hard, elo_grass, career_matches_played, career_matches_won, career_win_pct, clay_win_pct, hard_win_pct, grass_win_pct, aces_per_match, first_serve_pct, first_serve_points_won_pct, break_points_saved_pct, recent_form_5, years_on_tour) VALUES
-- Djokovic vs Nadal at French Open
(1, 1, 3, 2150, 2100, 2180, 2120, 1200, 950, 0.792, 0.750, 0.820, 0.780, 8.5, 0.68, 0.75, 0.65, 4, 18),
(2, 1, 2, 2180, 2250, 2150, 2100, 1150, 920, 0.800, 0.920, 0.750, 0.680, 6.2, 0.70, 0.72, 0.68, 5, 20),
-- Federer vs Alcaraz at Wimbledon
(3, 2, 8, 2050, 1980, 2080, 2150, 1500, 1200, 0.800, 0.650, 0.820, 0.870, 12.5, 0.65, 0.78, 0.70, 3, 24),
(4, 2, 1, 2200, 2180, 2220, 2150, 180, 150, 0.833, 0.800, 0.850, 0.780, 9.8, 0.72, 0.76, 0.62, 5, 3),
-- Djokovic vs Medvedev at US Open
(1, 3, 2, 2160, 2100, 2200, 2120, 1210, 960, 0.793, 0.750, 0.830, 0.780, 8.7, 0.69, 0.76, 0.66, 5, 18),
(5, 3, 3, 2120, 2050, 2180, 2080, 350, 280, 0.800, 0.650, 0.850, 0.720, 11.2, 0.66, 0.73, 0.58, 4, 7),
-- Swiatek vs Sabalenka at French Open
(9, 4, 1, 2250, 2300, 2220, 2180, 220, 190, 0.864, 0.920, 0.840, 0.750, 4.5, 0.68, 0.70, 0.62, 5, 5),
(10, 4, 2, 2200, 2180, 2230, 2150, 180, 150, 0.833, 0.780, 0.870, 0.720, 7.8, 0.65, 0.72, 0.58, 4, 6),
-- Gauff vs Pegula at US Open
(11, 5, 6, 2100, 2050, 2130, 2080, 150, 120, 0.800, 0.750, 0.820, 0.780, 5.2, 0.67, 0.68, 0.60, 5, 4),
(12, 5, 4, 2080, 2040, 2100, 2060, 200, 160, 0.800, 0.720, 0.830, 0.750, 4.8, 0.69, 0.71, 0.63, 4, 6);

-- Insert sample head-to-head records
INSERT INTO head_to_head (player1_id, player2_id, total_matches, player1_wins, player2_wins, clay_matches, clay_player1_wins, hard_matches, hard_player1_wins, grass_matches, grass_player1_wins) VALUES
(1, 2, 59, 30, 29, 19, 8, 20, 15, 3, 2),
(1, 3, 50, 27, 23, 6, 4, 22, 14, 3, 2),
(1, 5, 12, 8, 4, 2, 1, 7, 5, 1, 1),
(2, 3, 40, 24, 16, 16, 14, 11, 5, 4, 2),
(9, 10, 8, 6, 2, 4, 4, 3, 2, 0, 0),
(11, 12, 5, 3, 2, 1, 1, 4, 2, 0, 0);
