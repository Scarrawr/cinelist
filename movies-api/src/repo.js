const { Pool } = require("pg");

function createPool() {
  return new Pool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  });
}

const COLS = `id, user_id, title, genre, year, watched, favorite, poster, imdb_id,
  imdb_rating, plot, rated, released, runtime, director, writer, actors, language,
  country, awards, ratings, metascore, imdb_votes, type, box_office`;

// Database row (snake_case) -> the JSON shape the frontend already expects (camelCase)
function toMovie(r) {
  return {
    id: r.id,
    userId: r.user_id,
    title: r.title,
    genre: r.genre,
    year: r.year,
    watched: r.watched,
    favorite: r.favorite,
    poster: r.poster,
    imdbID: r.imdb_id,
    imdbRating: r.imdb_rating,
    plot: r.plot,
    rated: r.rated,
    released: r.released,
    runtime: r.runtime,
    director: r.director,
    writer: r.writer,
    actors: r.actors,
    language: r.language,
    country: r.country,
    awards: r.awards,
    ratings: r.ratings || [],
    metascore: r.metascore,
    imdbVotes: r.imdb_votes,
    type: r.type,
    boxOffice: r.box_office
  };
}

// Only these fields can be changed through updateMovie (whitelist => no SQL injection)
const COLUMN_FOR = {
  title: "title",
  genre: "genre",
  year: "year",
  watched: "watched",
  favorite: "favorite",
  poster: "poster",
  imdbID: "imdb_id",
  imdbRating: "imdb_rating"
};

function createMoviesRepo(pool) {
  async function getMovie(id, userId) {
    const { rows } = await pool.query(
      `SELECT ${COLS} FROM movies WHERE id = $1 AND user_id = $2`, [id, userId]
    );
    return rows[0] ? toMovie(rows[0]) : null;
  }

  return {
    async ping() {
      await pool.query("SELECT 1");
    },

    async listMovies(userId) {
      const { rows } = await pool.query(
        `SELECT ${COLS} FROM movies WHERE user_id = $1 ORDER BY id`, [userId]
      );
      return rows.map(toMovie);
    },

    async findDuplicate(userId, { imdbID, title, year, normalizedTitle }) {
      const { rows } = await pool.query(
        `SELECT 1 FROM movies
          WHERE user_id = $1
            AND ( ($2 <> '' AND imdb_id = $2)
               OR (lower(regexp_replace(btrim(title), '\\s+', ' ', 'g')) = $3 AND year = $4) )
          LIMIT 1`,
        [userId, imdbID || "", normalizedTitle, String(year)]
      );
      return rows.length > 0;
    },

    async insertMovie(userId, m) {
      const values = [
        userId, m.title, m.genre, m.year, false, false, m.poster, m.imdbID,
        m.imdbRating, m.plot, m.rated, m.released, m.runtime, m.director, m.writer,
        m.actors, m.language, m.country, m.awards, JSON.stringify(m.ratings || []),
        m.metascore, m.imdbVotes, m.type, m.boxOffice
      ];
      const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
      const { rows } = await pool.query(
        `INSERT INTO movies (user_id, title, genre, year, watched, favorite, poster,
           imdb_id, imdb_rating, plot, rated, released, runtime, director, writer,
           actors, language, country, awards, ratings, metascore, imdb_votes, type,
           box_office)
         VALUES (${placeholders}) RETURNING ${COLS}`,
        values
      );
      return toMovie(rows[0]);
    },

    async updateMovie(id, userId, patch) {
      const sets = [];
      const values = [];

      for (const [key, value] of Object.entries(patch)) {
        const column = COLUMN_FOR[key];
        if (!column || value === undefined) continue;
        values.push(value);
        sets.push(`${column} = $${values.length}`);
      }

      if (sets.length === 0) return getMovie(id, userId);

      values.push(id, userId);
      const { rows } = await pool.query(
        `UPDATE movies SET ${sets.join(", ")}
          WHERE id = $${values.length - 1} AND user_id = $${values.length}
          RETURNING ${COLS}`,
        values
      );
      return rows[0] ? toMovie(rows[0]) : null;
    },

    async deleteMovie(id, userId) {
      const result = await pool.query(
        "DELETE FROM movies WHERE id = $1 AND user_id = $2", [id, userId]
      );
      return result.rowCount > 0;
    },

    async getFeatured() {
      const { rows } = await pool.query(
        "SELECT data FROM featured_movies ORDER BY position"
      );
      return rows.map(r => r.data);
    },

    async saveFeatured(list) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM featured_movies");
        for (const [index, movie] of list.entries()) {
          await client.query(
            "INSERT INTO featured_movies (imdb_id, position, data) VALUES ($1, $2, $3)",
            [movie.imdbID, index + 1, JSON.stringify(movie)]
          );
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    // Offline fallback for /api/movie/:imdbID when OMDb is unreachable
    async findLocalMovieByImdbId(imdbID) {
      const mine = await pool.query(
        `SELECT ${COLS} FROM movies WHERE imdb_id = $1 LIMIT 1`, [imdbID]
      );
      if (mine.rows[0]) return toMovie(mine.rows[0]);

      const featured = await pool.query(
        "SELECT data FROM featured_movies WHERE imdb_id = $1", [imdbID]
      );
      return featured.rows[0] ? featured.rows[0].data : null;
    }
  };
}

module.exports = { createPool, createMoviesRepo };
