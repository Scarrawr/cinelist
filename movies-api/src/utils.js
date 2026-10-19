// Pure helper functions (no I/O), so they are easy to unit test.

const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

const normalizeForCompare = value => String(value ?? "")
  .toLowerCase()
  .replace(/&/g, "and")
  .replace(/['’]/g, "")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const extractYear = value => {
  const match = String(value ?? "").match(/\d{4}/);
  return match ? match[0] : "";
};

const WORD_NUMBERS = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10
};

const ROMAN_NUMBERS = {
  i: 1, ii: 2, iii: 3, iv: 4, v: 5,
  vi: 6, vii: 7, viii: 8, ix: 9, x: 10
};

function extractPartNumber(value) {
  const text = String(value ?? "").toLowerCase();

  const partMatch = text.match(/\bpart\s+(\d+|[a-z]+)\b/);
  if (partMatch) {
    const token = partMatch[1];
    const numeric = /^\d+$/.test(token)
      ? Number(token)
      : WORD_NUMBERS[token];
    if (numeric) return numeric;
  }

  const romanMatch = text.match(/episode\s+([ivx]+)\b/);
  if (romanMatch && ROMAN_NUMBERS[romanMatch[1]]) {
    return ROMAN_NUMBERS[romanMatch[1]];
  }

  return null;
}

// Used for duplicate detection in the watchlist
const normalizeTitle = value => String(value || "")
  .trim().replace(/\s+/g, " ").toLowerCase();

// OMDb uses the string "N/A" for missing values
const metadataValue = value =>
  typeof value === "string" && value !== "N/A" ? value : "";

function toWatchlistShape(details) {
  const value = key =>
    typeof details[key] === "string" && details[key] !== "N/A" ? details[key] : "";

  return {
    title: value("Title"),
    genre: value("Genre"),
    year: value("Year"),
    poster: value("Poster"),
    imdbID: value("imdbID"),
    imdbRating: value("imdbRating"),
    plot: value("Plot"),
    rated: value("Rated"),
    released: value("Released"),
    runtime: value("Runtime"),
    director: value("Director"),
    writer: value("Writer"),
    actors: value("Actors"),
    language: value("Language"),
    country: value("Country"),
    awards: value("Awards"),
    ratings: Array.isArray(details.Ratings) ? details.Ratings : [],
    metascore: value("Metascore"),
    imdbVotes: value("imdbVotes"),
    type: value("Type"),
    boxOffice: value("BoxOffice")
  };
}

function formatTrailerResult(videoId, title) {
  const sanitizedId = typeof videoId === "string" ? videoId.trim() : "";
  const validId = YOUTUBE_VIDEO_ID_PATTERN.test(sanitizedId) ? sanitizedId : "";

  return {
    videoId: validId,
    title: typeof title === "string" ? title : "",
    watchUrl: validId ? `https://www.youtube.com/watch?v=${validId}` : "",
    embeddable: Boolean(validId)
  };
}

module.exports = {
  YOUTUBE_VIDEO_ID_PATTERN,
  WORD_NUMBERS,
  ROMAN_NUMBERS,
  normalizeForCompare,
  extractYear,
  extractPartNumber,
  normalizeTitle,
  metadataValue,
  toWatchlistShape,
  formatTrailerResult
};
