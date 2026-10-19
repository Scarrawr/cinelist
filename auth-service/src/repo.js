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

// Data access for the users table. app.js only depends on this small interface,
// so tests can swap in an in-memory fake.
function createUsersRepo(pool) {
  return {
    async ping() {
      await pool.query("SELECT 1");
    },

    async findByUsername(username) {
      const { rows } = await pool.query(
        "SELECT id, username, password_hash FROM users WHERE lower(username) = lower($1) LIMIT 1",
        [username]
      );
      if (!rows[0]) return null;
      return { id: rows[0].id, username: rows[0].username, password: rows[0].password_hash };
    },

    async create(username, passwordHash) {
      const { rows } = await pool.query(
        "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username",
        [username, passwordHash]
      );
      return rows[0];
    }
  };
}

module.exports = { createPool, createUsersRepo };
