const express = require("express");
const session = require("express-session");
const { createTrailerFinder } = require("./trailer");
const {
  normalizeForCompare,
  extractYear,
  normalizeTitle,
  metadataValue,
  toWatchlistShape,
  formatTrailerResult
} = require("./utils");

const FEATURED_TITLES = [
  "The Dark Knight",
  "Inception",
  "Interstellar",
  "Avengers: Endgame",
  "Dune: Part Two",
  "The Shawshank Redemption",
  "Spider-Man: Across the Spider-Verse",
  "Oppenheimer",
  "Whiplash",
  "Parasite"
];

// App factory: every outside dependency is injected, so tests need no database,
// no Redis and no internet.
//   repo          data access (Postgres in production, in-memory fake in tests)
//   http          axios-like client for OMDb / TMDB / YouTube
//   sessionStore  Redis store shared with auth-service (undefined => in-memory)
//   getUser       optional override for "who is logged in" (used by tests)
function createApp({ repo, http, omdbKey = "", tmdbKey = "", sessionStore, sessionSecret, getUser }) {
  const app = express();
  const findTrailer = createTrailerFinder({ http, tmdbKey });

  app.set("trust proxy", 1);
  app.use(express.json());

  // Sessions are CREATED by auth-service; here we only read them from the shared store.
  app.use(session({
    store: sessionStore,
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax" }
  }));

  const currentUser = getUser || (req => req.session && req.session.user);

  function requireAuth(req, res, next) {
    const user = currentUser(req);
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    req.user = user;
    next();
  }

  async function omdb(params) {
    const response = await http.get("https://www.omdbapi.com/", {
      params: { apikey: omdbKey, ...params }
    });
    return response.data;
  }

  // ---------- health ----------
  app.get("/health", async (req, res) => {
    try {
      await repo.ping();
      res.json({ status: "ok", service: "movies-api" });
    } catch (error) {
      res.status(503).json({ status: "unavailable", service: "movies-api" });
    }
  });

  // ---------- watchlist ----------

  // Fill in a missing IMDb rating (and a few other blanks) from OMDb
  async function enrichmentPatch(movie) {
    if (movie.imdbRating || !omdbKey) return null;

    try {
      const details = await omdb(movie.imdbID
        ? { i: movie.imdbID }
        : { t: movie.title, y: movie.year || undefined });

      if (details?.Response !== "True") return null;

      const patch = {
        imdbRating: details.imdbRating && details.imdbRating !== "N/A"
          ? details.imdbRating : "N/A"
      };
      if (!movie.poster && details.Poster && details.Poster !== "N/A") {
        patch.poster = details.Poster;
      }
      if (!movie.imdbID && details.imdbID) patch.imdbID = details.imdbID;
      if ((!movie.genre || movie.genre === "Unknown") && details.Genre) {
        patch.genre = details.Genre;
      }
      return patch;
    } catch (error) {
      console.warn(`Could not load OMDb rating for ${movie.title}:`, error.message);
      return null;
    }
  }

  // READ - only the logged-in user's movies
  app.get("/api/movies", requireAuth, async (req, res) => {
    try {
      const movies = await repo.listMovies(req.user.id);

      const enriched = await Promise.all(movies.map(async movie => {
        const patch = await enrichmentPatch(movie);
        if (!patch) return movie;
        return (await repo.updateMovie(movie.id, req.user.id, patch)) || movie;
      }));

      res.json(enriched);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Could not load your watchlist." });
    }
  });

  // CREATE
  app.post("/api/movies", requireAuth, async (req, res) => {
    try {
      const body = req.body || {};
      const enteredTitle = typeof body.title === "string" ? body.title.trim() : "";
      const enteredGenre = typeof body.genre === "string" ? body.genre.trim() : "";
      const enteredYear = String(body.year ?? "").trim();
      const enteredImdbID = typeof body.imdbID === "string" ? body.imdbID.trim() : "";

      if (!enteredTitle || !enteredGenre || !enteredYear) {
        return res.status(400).json({ message: "Title, genre, and year are required." });
      }

      const duplicate = await repo.findDuplicate(req.user.id, {
        imdbID: enteredImdbID,
        title: enteredTitle,
        year: enteredYear,
        normalizedTitle: normalizeTitle(enteredTitle)
      });

      if (duplicate) {
        return res.status(409).json({ message: "This movie is already in your watchlist." });
      }

      const movie = await repo.insertMovie(req.user.id, {
        title: enteredTitle,
        genre: enteredGenre,
        year: enteredYear,
        poster: typeof body.poster === "string" && body.poster !== "N/A" ? body.poster : "",
        imdbID: enteredImdbID,
        imdbRating: metadataValue(body.imdbRating),
        plot: metadataValue(body.plot),
        rated: metadataValue(body.rated),
        released: metadataValue(body.released),
        runtime: metadataValue(body.runtime),
        director: metadataValue(body.director),
        writer: metadataValue(body.writer),
        actors: metadataValue(body.actors),
        language: metadataValue(body.language),
        country: metadataValue(body.country),
        awards: metadataValue(body.awards),
        ratings: Array.isArray(body.ratings) ? body.ratings : [],
        metascore: metadataValue(body.metascore),
        imdbVotes: metadataValue(body.imdbVotes),
        type: metadataValue(body.type),
        boxOffice: metadataValue(body.boxOffice)
      });

      res.status(201).json(movie);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Could not add the movie." });
    }
  });

  // UPDATE
  app.put("/api/movies/:id", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        return res.status(404).json({ message: "Movie not found." });
      }

      const { title, genre, year, watched, favorite } = req.body || {};
      const patch = {};

      if (title !== undefined) {
        if (typeof title !== "string" || !title.trim()) {
          return res.status(400).json({ message: "Title cannot be empty." });
        }
        patch.title = title.trim();
      }
      if (genre !== undefined) patch.genre = String(genre).trim();
      if (year !== undefined) patch.year = String(year).trim();
      if (watched !== undefined) patch.watched = Boolean(watched);
      if (favorite !== undefined) patch.favorite = Boolean(favorite);

      const movie = await repo.updateMovie(id, req.user.id, patch);
      if (!movie) {
        return res.status(404).json({ message: "Movie not found." });
      }

      res.json(movie);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Could not update the movie." });
    }
  });

  // DELETE
  app.delete("/api/movies/:id", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const deleted = Number.isInteger(id) && await repo.deleteMovie(id, req.user.id);
      if (!deleted) {
        return res.status(404).json({ message: "Movie not found." });
      }

      res.json({ message: "Movie deleted successfully." });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Could not delete the movie." });
    }
  });

  // ---------- featured (homepage carousel) ----------
  app.get("/api/featured", requireAuth, async (req, res) => {
    try {
      const saved = await repo.getFeatured();
      if (saved.length > 0) {
        return res.json(saved);
      }

      if (!omdbKey) {
        return res.status(500).json({ message: "OMDb API key is not configured." });
      }

      const results = await Promise.all(FEATURED_TITLES.map(async title => {
        const details = await omdb({ t: title, plot: "short" });
        if (details?.Response !== "True" || details.Type !== "movie") return null;

        const v = key => (details[key] && details[key] !== "N/A" ? details[key] : "");
        return {
          imdbID: details.imdbID,
          title: details.Title,
          year: details.Year,
          poster: v("Poster"),
          imdbRating: v("imdbRating"),
          plot: v("Plot"),
          genre: v("Genre"),
          released: v("Released"),
          runtime: v("Runtime"),
          director: v("Director"),
          writer: v("Writer"),
          actors: v("Actors"),
          language: v("Language"),
          country: v("Country"),
          awards: v("Awards"),
          metascore: v("Metascore"),
          imdbVotes: v("imdbVotes"),
          boxOffice: v("BoxOffice"),
          rated: v("Rated")
        };
      }));

      const featuredMovies = results.filter(Boolean);
      if (featuredMovies.length === 0) {
        return res.status(502).json({ message: "Could not load featured movies right now." });
      }

      await repo.saveFeatured(featuredMovies);
      res.json(featuredMovies);
    } catch (error) {
      console.error("Featured movies lookup failed:", error.message);
      res.status(500).json({ message: "Could not load featured movies. Please try again." });
    }
  });

  // ---------- OMDb validation / lookup ----------
  async function omdbSearch(title, year) {
    const data = await omdb({ s: title, ...(year ? { y: year } : {}) });
    if (data?.Response === "False") return [];
    return Array.isArray(data?.Search) ? data.Search : [];
  }

  async function omdbDetails(imdbID) {
    const data = await omdb({ i: imdbID, plot: "short" });
    return data?.Response === "True" ? data : null;
  }

  app.post("/api/validate", requireAuth, async (req, res) => {
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const year = String(req.body?.year ?? "").trim();
    const genre = typeof req.body?.genre === "string" ? req.body.genre.trim() : "";

    if (!title) {
      return res.status(400).json({
        valid: false, reason: "empty",
        message: "Movie not found. Please enter a valid movie title."
      });
    }

    if (!omdbKey) {
      return res.status(500).json({
        valid: false, reason: "omdb_key", message: "OMDb API key is not configured."
      });
    }

    try {
      const candidates = await omdbSearch(title, extractYear(year));

      if (candidates.length === 0 && year) {
        const withoutYear = await omdbSearch(title, "");
        if (withoutYear.length > 0) {
          return res.status(422).json({
            valid: false, reason: "year",
            message: "The movie year does not match the OMDb data.",
            closestTitle: withoutYear[0].Title,
            actualYear: withoutYear[0].Year
          });
        }
      }

      if (candidates.length === 0) {
        return res.status(404).json({
          valid: false, reason: "not_found",
          message: "Movie not found. Please enter a valid movie title."
        });
      }

      const normalizedTitle = normalizeForCompare(title);
      const exactMatch = candidates.find(c => normalizeForCompare(c.Title) === normalizedTitle);
      const chosen = exactMatch || candidates[0];
      const details = await omdbDetails(chosen.imdbID);

      if (!details) {
        return res.status(404).json({
          valid: false, reason: "not_found",
          message: "Movie not found. Please enter a valid movie title."
        });
      }

      if (details.Type && details.Type !== "movie") {
        return res.status(422).json({
          valid: false, reason: "not_movie",
          message: `"${details.Title}" is a ${details.Type}, not a movie.`
        });
      }

      if (year) {
        const submittedYear = extractYear(year);
        const actualYear = extractYear(details.Year) || extractYear(details.Released);
        if (submittedYear !== actualYear) {
          return res.status(422).json({
            valid: false, reason: "year",
            message: "The movie year does not match the OMDb data.",
            actualYear
          });
        }
      }

      if (genre) {
        const omdbGenres = String(details.Genre || "")
          .split(",").map(normalizeForCompare).filter(Boolean);
        if (!omdbGenres.includes(normalizeForCompare(genre))) {
          return res.status(422).json({
            valid: false, reason: "genre",
            message: "The movie genre does not match the OMDb data.",
            actualGenre: details.Genre
          });
        }
      }

      res.json({ valid: true, movie: toWatchlistShape(details) });
    } catch (error) {
      console.error("Validation failed:", error.message);
      res.status(500).json({
        valid: false, reason: "lookup_failed",
        message: "Could not verify this movie with OMDb. Please try again."
      });
    }
  });

  app.get("/api/lookup", requireAuth, async (req, res) => {
    try {
      const title = req.query.title;

      if (!title || !String(title).trim()) {
        return res.status(400).json({ message: "Please enter a movie title." });
      }

      if (!omdbKey) {
        return res.status(500).json({ message: "OMDb API key is not configured." });
      }

      const found = await omdb({ s: String(title).trim() });
      if (found.Response === "False") {
        return res.json([]);
      }

      const results = await Promise.all(found.Search.map(async movie => {
        let imdbRating = "N/A";
        let details = {};

        try {
          const data = await omdb({ i: movie.imdbID });
          if (data?.Response === "True") {
            details = data;
            imdbRating = data.imdbRating || "N/A";
          }
        } catch (error) {
          console.warn(`Could not load OMDb rating for ${movie.Title}:`, error.message);
        }

        return {
          ...details,
          imdbID: movie.imdbID,
          title: details.Title || movie.Title,
          year: details.Year || movie.Year,
          type: details.Type || movie.Type,
          genre: details.Genre && details.Genre !== "N/A" ? details.Genre : "Unknown",
          poster: details.Poster && details.Poster !== "N/A"
            ? details.Poster
            : movie.Poster !== "N/A" ? movie.Poster : "",
          imdbRating
        };
      }));

      res.json(results);
    } catch (error) {
      console.error("OMDb lookup failed:", error.message);
      res.status(500).json({ message: "Could not connect to OMDb. Please try again." });
    }
  });

  // ---------- trailer ----------
  app.get("/api/trailer", requireAuth, async (req, res) => {
    const title = typeof req.query.title === "string" ? req.query.title.trim() : "";
    const year = typeof req.query.year === "string" ? req.query.year.trim() : "";

    if (!title) {
      return res.status(400).json(formatTrailerResult("", ""));
    }

    res.json(await findTrailer(title, year));
  });

  // ---------- one movie's details ----------
  app.get("/api/movie/:imdbID", requireAuth, async (req, res) => {
    const imdbID = req.params.imdbID;

    const fallback = async () => {
      try {
        return await repo.findLocalMovieByImdbId(imdbID);
      } catch (error) {
        return null;
      }
    };

    if (!omdbKey) {
      const local = await fallback();
      if (local) return res.json(local);
      return res.status(503).json({
        message: "Movie details are temporarily unavailable. The OMDb API key is not configured."
      });
    }

    try {
      const data = await omdb({ i: imdbID, plot: "short" });

      if (data.Response === "False") {
        const local = await fallback();
        if (local) return res.json(local);
        return res.status(404).json({ message: "Movie details not found." });
      }

      res.json(data);
    } catch (error) {
      const local = await fallback();
      if (local) return res.json(local);
      res.status(500).json({ message: "Could not load movie details." });
    }
  });

  app.use((error, req, res, next) => {
    console.error(error);
    res.status(500).json({ message: "Internal server error." });
  });

  return app;
}

module.exports = { createApp };
