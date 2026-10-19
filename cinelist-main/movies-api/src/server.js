require("dotenv").config();

const axios = require("axios");
const { createApp } = require("./app");
const { createPool, createMoviesRepo } = require("./repo");
const { buildSessionStore } = require("./session-store");

if (!process.env.SESSION_SECRET) {
  console.error("SESSION_SECRET is not set.");
  process.exit(1);
}

const app = createApp({
  repo: createMoviesRepo(createPool()),
  http: axios,
  omdbKey: (process.env.OMDB_API_KEY || "").trim(),
  tmdbKey: (process.env.TMDB_API_KEY || "").trim(),
  sessionStore: buildSessionStore(),
  sessionSecret: process.env.SESSION_SECRET
});

const PORT = process.env.PORT || 3002;
const server = app.listen(PORT, () => {
  console.log(`movies-api listening on port ${PORT}`);
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
