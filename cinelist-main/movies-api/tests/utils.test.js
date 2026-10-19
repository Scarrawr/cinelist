const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeForCompare, extractYear, extractPartNumber, normalizeTitle,
  metadataValue, toWatchlistShape, formatTrailerResult
} = require("../src/utils");

test("normalizeForCompare strips punctuation, apostrophes and case", () => {
  assert.equal(normalizeForCompare("Harry's & Co."), "harrys and co");
  assert.equal(normalizeForCompare("  Spider-Man: Across  "), "spider man across");
  assert.equal(normalizeForCompare(null), "");
});

test("extractYear finds the first 4-digit year", () => {
  assert.equal(extractYear("2010"), "2010");
  assert.equal(extractYear("Released 18 Jul 2008"), "2008");
  assert.equal(extractYear("no year"), "");
});

test("extractPartNumber understands words, digits and roman numerals", () => {
  assert.equal(extractPartNumber("Dune: Part Two"), 2);
  assert.equal(extractPartNumber("Movie Part 3"), 3);
  assert.equal(extractPartNumber("Star Wars: Episode IV"), 4);
  assert.equal(extractPartNumber("Inside Out 2"), null);
});

test("normalizeTitle collapses spaces and lowercases", () => {
  assert.equal(normalizeTitle("  The   Dark  Knight "), "the dark knight");
});

test("metadataValue turns N/A and non-strings into empty strings", () => {
  assert.equal(metadataValue("N/A"), "");
  assert.equal(metadataValue(5), "");
  assert.equal(metadataValue("PG-13"), "PG-13");
});

test("toWatchlistShape maps OMDb fields and blanks out N/A", () => {
  const shape = toWatchlistShape({
    Title: "Inception", Year: "2010", Genre: "Sci-Fi", Poster: "N/A",
    imdbID: "tt1375666", Ratings: [{ Source: "IMDb", Value: "8.8/10" }]
  });
  assert.equal(shape.title, "Inception");
  assert.equal(shape.poster, "");
  assert.equal(shape.imdbID, "tt1375666");
  assert.equal(shape.ratings.length, 1);
  assert.equal(shape.director, "");
});

test("formatTrailerResult accepts valid YouTube ids only", () => {
  const ok = formatTrailerResult("dQw4w9WgXcQ", "Trailer");
  assert.equal(ok.embeddable, true);
  assert.equal(ok.watchUrl, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");

  const bad = formatTrailerResult("not-valid!", "Trailer");
  assert.equal(bad.embeddable, false);
  assert.equal(bad.videoId, "");
});
