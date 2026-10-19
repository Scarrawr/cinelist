const {
  YOUTUBE_VIDEO_ID_PATTERN,
  WORD_NUMBERS,
  ROMAN_NUMBERS,
  normalizeForCompare,
  extractYear,
  extractPartNumber,
  formatTrailerResult
} = require("./utils");

// Finds a YouTube trailer for a movie (TMDB first if a key is set, else a YouTube search).
// `http` is injected (axios in production, a fake in tests).
function createTrailerFinder({ http, tmdbKey = "" }) {
  const cache = new Map();

  async function isEmbeddable(videoId) {
    if (!YOUTUBE_VIDEO_ID_PATTERN.test(videoId)) return false;

    try {
      const response = await http.get("https://www.youtube.com/oembed", {
        params: { url: `https://www.youtube.com/watch?v=${videoId}`, format: "json" },
        timeout: 8000,
        validateStatus: null
      });

      return response.status === 200;
    } catch (error) {
      return error.response?.status === 401 ? false : true;
    }
  }

  async function firstEmbeddableCandidate(candidates) {
    for (const candidate of candidates.slice(0, 5)) {
      if (await isEmbeddable(candidate.videoId)) {
        return candidate;
      }
    }

    return null;
  }

  return async function findTrailer(title, year) {
    const cacheKey = `${title.toLowerCase()}|${year}`;
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }

    try {
    if (tmdbKey) {
      const searchResponse = await http.get("https://api.themoviedb.org/3/search/movie", {
        params: {
          api_key: tmdbKey,
          query: title,
          year: year || undefined,
          include_adult: false
        },
        timeout: 12000
      });

      const movie = Array.isArray(searchResponse.data?.results)
        ? searchResponse.data.results.find(result => {
            const matchesYear = !year || String(result.release_date || "").startsWith(String(year));
            const sameTitle = normalizeForCompare(result.title || result.original_title || "") === normalizeForCompare(title);
            return matchesYear && (sameTitle || normalizeForCompare(result.title || result.original_title || "").includes(normalizeForCompare(title)));
          }) || searchResponse.data.results[0]
        : null;

      if (movie?.id) {
        const videoResponse = await http.get(`https://api.themoviedb.org/3/movie/${movie.id}/videos`, {
          params: { api_key: tmdbKey },
          timeout: 12000
        });

        const trailer = Array.isArray(videoResponse.data?.results)
          ? [...videoResponse.data.results]
              .filter(video => video.site === "YouTube" && (video.type === "Trailer" || video.type === "Teaser"))
              .sort((first, second) => Number(second.official) - Number(first.official))[0]
          : null;

        if (trailer?.key && await isEmbeddable(trailer.key)) {
          const result = formatTrailerResult(trailer.key, trailer.name || title);
          cache.set(cacheKey, result);
          return result;
        }
      }
    }

    const response = await http.get("https://www.youtube.com/results", {
      params: { search_query: `${title} ${year} official trailer`.trim() },
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 12000,
      maxContentLength: 5_000_000
    });

    const candidates = [...response.data.matchAll(
      /"videoRenderer":\{"videoId":"([A-Za-z0-9_-]{11})"[\s\S]*?"title":\{"runs":\[\{"text":"((?:\\.|[^"\\])*)"/g
    )].slice(0, 40).map(match => {
      let videoTitle = match[2];
      try {
        videoTitle = JSON.parse(`"${videoTitle}"`);
      } catch {
        return null;
      }

      return { videoId: match[1], title: videoTitle };
    }).filter(candidate => candidate && YOUTUBE_VIDEO_ID_PATTERN.test(candidate.videoId));

    const titleWords = normalizeForCompare(title).split(/\s+/).filter(Boolean);
    const requestedPart = extractPartNumber(title);
    const hasYear = Boolean(extractYear(year));

    const baseWords = titleWords.filter(word =>
      word !== "part" && word !== "episode" && !(word in WORD_NUMBERS) &&
      !(word in ROMAN_NUMBERS)
    );

    const requiredWords = baseWords.length ? baseWords : titleWords;

    const rankedCandidates = candidates.map(candidate => {
      const normalizedCandidate = normalizeForCompare(candidate.title);
      const candidateWords = new Set(normalizedCandidate.split(/\s+/).filter(Boolean));
      const hasTrailerLabel = /trailer|teaser/i.test(candidate.title);

      const missingWords = requiredWords.filter(word => !candidateWords.has(word));
      const allWordsPresent = missingWords.length === 0;

      const contiguousMatch = normalizedCandidate.includes(normalizeForCompare(title));
      const startsWithTitle = normalizedCandidate.startsWith(normalizeForCompare(title));

      const candidatePart = extractPartNumber(candidate.title);
      const partConflict = requestedPart !== null && candidatePart !== null &&
        requestedPart !== candidatePart;

      const candidateYear = extractYear(candidate.title);
      const yearConflict = hasYear && candidateYear && candidateYear !== extractYear(year);

      const normalizedRequest = normalizeForCompare(title);
      const requestWords = new Set(normalizedRequest.split(/\s+/).filter(Boolean));
      const candidateMarker = candidate.title.match(
        /\b(no way home|far from home|homecoming|across the spider-?verse|into the spider-?verse|returns|reboot|revival)\b/i
      );
      const markerPhrase = candidateMarker
        ? normalizeForCompare(candidateMarker[1])
        : "";
      const sequelMarker = Boolean(markerPhrase) &&
        !requestWords.has(markerPhrase.split(" ")[0]);

      const titleStart = normalizedCandidate.indexOf(normalizeForCompare(title));
      const extraLeadingWords = titleStart > 0
        ? normalizedCandidate.slice(0, titleStart).split(/\s+/).filter(Boolean).length
        : 0;

      const score =
        (allWordsPresent ? 10 : 0) +
        (contiguousMatch ? 8 : 0) +
        (startsWithTitle ? 12 : 0) +
        (hasTrailerLabel ? 4 : 0) +
        (/official/i.test(candidate.title) ? 2 : 0) +
        (candidateYear && candidateYear === extractYear(year) ? 5 : 0) -
        (extraLeadingWords * 4) -
        missingWords.length * 8 -
        (partConflict ? 100 : 0) -
        (yearConflict ? 100 : 0);

      return {
        ...candidate,
        score,
        hasTrailerLabel,
        allWordsPresent,
        partConflict,
        yearConflict,
        sequelMarker
      };
    }).filter(candidate =>
      candidate.hasTrailerLabel &&
      candidate.allWordsPresent &&
      !candidate.partConflict &&
      !candidate.yearConflict &&
      !candidate.sequelMarker
    ).sort((first, second) => second.score - first.score);

      const chosen = await firstEmbeddableCandidate(rankedCandidates);
      const result = chosen
        ? formatTrailerResult(chosen.videoId, chosen.title)
        : formatTrailerResult("", "");

      cache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.warn(`YouTube trailer lookup failed for ${title}:`, error.message);
      const unavailable = formatTrailerResult("", "");
      cache.set(cacheKey, unavailable);
      return unavailable;
    }
  };
}

module.exports = { createTrailerFinder };
