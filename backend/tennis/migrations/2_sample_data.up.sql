-- Insert current ATP top players (as of 2024)
INSERT INTO players (name, birth_date, height_cm, dominant_hand, two_handed_backhand, country) VALUES
('Jannik Sinner', '2001-08-16', 188, 'right', TRUE, 'Italy'),  -- Current world #1 [[5]]
('Alexander Zverev', '1997-04-20', 198, 'right', TRUE, 'Germany'),  -- Ranked #2 [[2]]
('Carlos Alcaraz', '2003-05-05', 183, 'right', TRUE, 'Spain'),  -- Ranked #3 [[5]]
('Taylor Fritz', '1997-10-28', 196, 'right', TRUE, 'USA'),  -- Ranked #4 [[2]]
('Daniil Medvedev', '1996-02-11', 198, 'right', TRUE, 'Russia'),  -- Ranked #5 [[2]]
('Casper Ruud', '1998-12-22', 183, 'right', TRUE, 'Norway'),  -- Ranked #6 [[2]]
('Novak Djokovic', '1987-05-22', 188, 'right', TRUE, 'Serbia'),  -- Ranked #7 [[2]]
('Andrey Rublev', '1997-10-17', 188, 'right', TRUE, 'Russia'),  -- Ranked #8 [[2]]
('Stefanos Tsitsipas', '1998-08-12', 193, 'right', FALSE, 'Greece'),  -- One-handed backhand specialist
('Hubert Hurkacz', '1997-02-11', 201, 'right', TRUE, 'Poland');  -- Among tallest active players [[4]]

-- Note: Removed WTA players as request specified ATP (men's) players only
-- Current rankings show Sinner as year-end #1 with 11,830 ATP points [[1]]