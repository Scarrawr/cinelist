-- CineList schema + seed data (runs once, when the db-data volume is first created)

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT        NOT NULL,
  password_hash TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- usernames are unique regardless of upper/lower case
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (lower(username));

CREATE TABLE IF NOT EXISTS movies (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  genre       TEXT        NOT NULL DEFAULT '',
  year        TEXT        NOT NULL DEFAULT '',
  watched     BOOLEAN     NOT NULL DEFAULT FALSE,
  favorite    BOOLEAN     NOT NULL DEFAULT FALSE,
  poster      TEXT        NOT NULL DEFAULT '',
  imdb_id     TEXT        NOT NULL DEFAULT '',
  imdb_rating TEXT        NOT NULL DEFAULT '',
  plot        TEXT        NOT NULL DEFAULT '',
  rated       TEXT        NOT NULL DEFAULT '',
  released    TEXT        NOT NULL DEFAULT '',
  runtime     TEXT        NOT NULL DEFAULT '',
  director    TEXT        NOT NULL DEFAULT '',
  writer      TEXT        NOT NULL DEFAULT '',
  actors      TEXT        NOT NULL DEFAULT '',
  language    TEXT        NOT NULL DEFAULT '',
  country     TEXT        NOT NULL DEFAULT '',
  awards      TEXT        NOT NULL DEFAULT '',
  ratings     JSONB       NOT NULL DEFAULT '[]'::jsonb,
  metascore   TEXT        NOT NULL DEFAULT '',
  imdb_votes  TEXT        NOT NULL DEFAULT '',
  type        TEXT        NOT NULL DEFAULT '',
  box_office  TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS movies_user_idx ON movies (user_id);

-- Homepage carousel (separate from every user's watchlist)
CREATE TABLE IF NOT EXISTS featured_movies (
  imdb_id  TEXT    PRIMARY KEY,
  position INTEGER NOT NULL,
  data     JSONB   NOT NULL
);

INSERT INTO featured_movies (imdb_id, position, data) VALUES
  ('tt0468569', 1, '{"imdbID": "tt0468569", "title": "The Dark Knight", "year": "2008", "poster": "https://m.media-amazon.com/images/M/MV5BMTMxNTMwODM0NF5BMl5BanBnXkFtZTcwODAyMTk2Mw@@._V1_QL75_UX380_CR0,0,380,562_.jpg", "imdbRating": "9.1", "plot": "When a menace known as the Joker wreaks havoc and chaos on the people of Gotham, Batman, James Gordon and Harvey Dent must work together to put an end to the madness.", "genre": "Crime, Thriller", "released": "18 Jul 2008", "runtime": "152 min", "director": "Christopher Nolan", "writer": "Jonathan Nolan, Christopher Nolan, David S. Goyer", "actors": "Christian Bale, Heath Ledger, Aaron Eckhart", "language": "English, Mandarin", "country": "United States, United Kingdom", "awards": "Won 2 Oscars. 164 wins & 165 nominations total", "metascore": "85", "imdbVotes": "3,236,507", "boxOffice": "$534,987,076", "rated": "PG-13"}'::jsonb),
  ('tt1375666', 2, '{"imdbID": "tt1375666", "title": "Inception", "year": "2010", "poster": "https://m.media-amazon.com/images/M/MV5BMjAxMzY3NjcxNF5BMl5BanBnXkFtZTcwNTI5OTM0Mw@@._V1_QL75_UX380_CR0,0,380,562_.jpg", "imdbRating": "8.8", "plot": "A thief who steals corporate secrets through the use of dream-sharing technology is given the inverse task of planting an idea into the mind of a CEO, but his tragic past may doom the project and his team to disaster.", "genre": "Adventure, Sci-Fi, Thriller", "released": "16 Jul 2010", "runtime": "148 min", "director": "Christopher Nolan", "writer": "Christopher Nolan", "actors": "Leonardo DiCaprio, Joseph Gordon-Levitt, Elliot Page", "language": "English, Japanese, French", "country": "United Kingdom, United States", "awards": "Won 4 Oscars. 160 wins & 220 nominations total", "metascore": "74", "imdbVotes": "2,877,173", "boxOffice": "$292,587,330", "rated": "PG-13"}'::jsonb),
  ('tt0816692', 3, '{"imdbID": "tt0816692", "title": "Interstellar", "year": "2014", "poster": "https://m.media-amazon.com/images/M/MV5BYzdjMDAxZGItMjI2My00ODA1LTlkNzItOWFjMDU5ZDJlYWY3XkEyXkFqcGc@._V1_QL75_UX380_CR0,0,380,562_.jpg", "imdbRating": "8.7", "plot": "In a dystopian future where Earth has become near-uninhabitable, a team of astronauts embark on a mission to find a new home for humanity.", "genre": "Adventure, Sci-Fi", "released": "07 Nov 2014", "runtime": "169 min", "director": "Christopher Nolan", "writer": "Jonathan Nolan, Christopher Nolan", "actors": "Matthew McConaughey, Anne Hathaway, Jessica Chastain", "language": "English", "country": "United States, United Kingdom, Canada", "awards": "Won 1 Oscar. 45 wins & 148 nominations total", "metascore": "74", "imdbVotes": "2,617,722", "boxOffice": "$203,227,580", "rated": "PG-13"}'::jsonb),
  ('tt4154796', 4, '{"imdbID": "tt4154796", "title": "Avengers: Endgame", "year": "2019", "poster": "https://m.media-amazon.com/images/M/MV5BMWEyNDM2ZmQtMmFkNi00MTQ1LTk1MjItMzdlZGJlYmIyYzZlXkEyXkFqcGc@._V1_QL75_UX380_CR0,0,380,562_.jpg", "imdbRating": "8.4", "plot": "After the devastating events of Avengers: Infinity War (2018), the universe is in ruins. With the help of remaining allies, the Avengers assemble once more in order to reverse Thanos'' actions and restore balance to the universe.", "genre": "Action, Adventure, Sci-Fi", "released": "26 Apr 2019", "runtime": "181 min", "director": "Anthony Russo, Joe Russo", "writer": "Christopher Markus, Stephen McFeely, Stan Lee", "actors": "Robert Downey Jr., Chris Evans, Mark Ruffalo", "language": "English, Japanese, Xhosa, German", "country": "United States", "awards": "Nominated for 1 Oscar. 71 wins & 132 nominations total", "metascore": "78", "imdbVotes": "1,485,583", "boxOffice": "$858,373,000", "rated": "PG-13"}'::jsonb),
  ('tt15239678', 5, '{"imdbID": "tt15239678", "title": "Dune: Part Two", "year": "2024", "poster": "https://m.media-amazon.com/images/M/MV5BNTc0YmQxMjEtODI5MC00NjFiLTlkMWUtOGQ5NjFmYWUyZGJhXkEyXkFqcGc@._V1_QL75_UX380_CR0,0,380,562_.jpg", "imdbRating": "8.4", "plot": "Paul Atreides unites with the Fremen while on a warpath of revenge against the conspirators who destroyed his family. Facing a choice between the love of his life and the fate of the universe, he endeavors to prevent a terrible fu...", "genre": "Action, Adventure, Drama", "released": "01 Mar 2024", "runtime": "166 min", "director": "Denis Villeneuve", "writer": "Denis Villeneuve, Jon Spaihts, Frank Herbert", "actors": "Timothée Chalamet, Zendaya, Rebecca Ferguson", "language": "English, American Sign Language", "country": "United States, Canada, United Arab Emirates, Hungary, Italy, New Zealand, Jordan", "awards": "Won 2 Oscars. 126 wins & 375 nominations total", "metascore": "79", "imdbVotes": "797,737", "boxOffice": "$282,144,358", "rated": "PG-13"}'::jsonb),
  ('tt0111161', 6, '{"imdbID": "tt0111161", "title": "The Shawshank Redemption", "year": "1994", "poster": "https://m.media-amazon.com/images/M/MV5BMDAyY2FhYjctNDc5OS00MDNlLThiMGUtY2UxYWVkNGY2ZjljXkEyXkFqcGc@._V1_QL75_UX380_CR0,4,380,562_.jpg", "imdbRating": "9.3", "plot": "After a banker is sentenced to life in Shawshank Prison, he forms an unlikely friendship with a seasoned inmate and clings to hope amid cruelty and corruption.", "genre": "Drama", "released": "14 Oct 1994", "runtime": "142 min", "director": "Frank Darabont", "writer": "Stephen King, Frank Darabont", "actors": "Tim Robbins, Morgan Freeman, Bob Gunton", "language": "English", "country": "United States", "awards": "Nominated for 7 Oscars. 21 wins & 43 nominations total", "metascore": "82", "imdbVotes": "3,235,958", "boxOffice": "$28,767,189", "rated": "R"}'::jsonb),
  ('tt9362722', 7, '{"imdbID": "tt9362722", "title": "Spider-Man: Across the Spider-Verse", "year": "2023", "poster": "https://m.media-amazon.com/images/M/MV5BNThiZjA3MjItZGY5Ni00ZmJhLWEwN2EtOTBlYTA4Y2E0M2ZmXkEyXkFqcGc@._V1_QL75_UX380_CR0,1,380,562_.jpg", "imdbRating": "8.5", "plot": "Traveling across the multiverse, Miles Morales meets a new team of Spider-People, made up of heroes from different dimensions. But when the heroes clash over how to deal with a new threat, Miles finds himself at a crossroads.", "genre": "Animation, Action, Adventure", "released": "02 Jun 2023", "runtime": "140 min", "director": "Joaquim Dos Santos, Kemp Powers, Justin K. Thompson", "writer": "Phil Lord, Christopher Miller, Dave Callaham", "actors": "Shameik Moore, Hailee Steinfeld, Brian Tyree Henry", "language": "English", "country": "United States", "awards": "Nominated for 1 Oscar. 107 wins & 164 nominations total", "metascore": "86", "imdbVotes": "556,793", "boxOffice": "$381,593,754", "rated": "PG"}'::jsonb),
  ('tt15398776', 8, '{"imdbID": "tt15398776", "title": "Oppenheimer", "year": "2023", "poster": "https://m.media-amazon.com/images/M/MV5BN2JkMDc5MGQtZjg3YS00NmFiLWIyZmQtZTJmNTM5MjVmYTQ4XkEyXkFqcGc@._V1_QL75_UX380_CR0,0,380,562_.jpg", "imdbRating": "8.2", "plot": "A dramatization of the life story of J. Robert Oppenheimer, the physicist who had a large hand in the development of the atomic bombs that brought an end to World War II.", "genre": "Biography, Drama, History", "released": "21 Jul 2023", "runtime": "180 min", "director": "Christopher Nolan", "writer": "Christopher Nolan, Kai Bird, Martin Sherwin", "actors": "Cillian Murphy, Emily Blunt, Matt Damon", "language": "English, German, Italian, Dutch", "country": "United States, United Kingdom", "awards": "Won 7 Oscars. 370 wins & 378 nominations total", "metascore": "90", "imdbVotes": "1,103,487", "boxOffice": "$330,078,895", "rated": "R"}'::jsonb),
  ('tt2582802', 9, '{"imdbID": "tt2582802", "title": "Whiplash", "year": "2014", "poster": "https://m.media-amazon.com/images/M/MV5BMDFjOWFkYzktYzhhMC00NmYyLTkwY2EtYjViMDhmNzg0OGFkXkEyXkFqcGc@._V1_QL75_UX380_CR0,0,380,562_.jpg", "imdbRating": "8.5", "plot": "A promising young drummer enrolls at a cut-throat music conservatory where his dreams of greatness are mentored by an instructor who will stop at nothing to realize a student''s potential.", "genre": "Drama, Music", "released": "15 Oct 2014", "runtime": "106 min", "director": "Damien Chazelle", "writer": "Damien Chazelle", "actors": "Miles Teller, J.K. Simmons, Melissa Benoist", "language": "English", "country": "United States", "awards": "Won 3 Oscars. 100 wins & 144 nominations total", "metascore": "89", "imdbVotes": "1,185,509", "boxOffice": "$14,003,391", "rated": "R"}'::jsonb),
  ('tt6751668', 10, '{"imdbID": "tt6751668", "title": "Parasite", "year": "2019", "poster": "https://m.media-amazon.com/images/M/MV5BYjk1Y2U4MjQtY2ZiNS00OWQyLWI3MmYtZWUwNmRjYWRiNWNhXkEyXkFqcGc@._V1_QL75_UX380_CR0,0,380,562_.jpg", "imdbRating": "8.5", "plot": "Greed and class discrimination threaten the newly formed symbiotic relationship between the wealthy Park family and the destitute Kim clan.", "genre": "Drama, Thriller", "released": "08 Nov 2019", "runtime": "132 min", "director": "Bong Joon Ho", "writer": "Bong Joon Ho, Han Jin-won", "actors": "Song Kang-ho, Lee Sun-kyun, Cho Yeo-jeong", "language": "Korean, English", "country": "South Korea", "awards": "Won 4 Oscars. 309 wins & 261 nominations total", "metascore": "97", "imdbVotes": "1,200,817", "boxOffice": "$53,847,897", "rated": "R"}'::jsonb)
ON CONFLICT (imdb_id) DO NOTHING;
