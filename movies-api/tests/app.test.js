const test = require("node:test");
const assert = require("node:assert/strict");
const { createApp } = require("../src/app");

// ---- in-memory stand-in for the Postgres repo ----
function fakeRepo() {
  let nextId = 1;
  const movies = [];
  return {
    pingFails: false,
    async ping() { if (this.pingFails) throw new Error("db down"); },
    async listMovies(userId) { return movies.filter(m => m.userId === userId); },
    async findDuplicate(userId, { imdbID, normalizedTitle, year }) {
      return movies.some(m => m.userId === userId &&
        ((imdbID && m.imdbID === imdbID) ||
         (m.title.trim().toLowerCase() === normalizedTitle && m.year === String(year))));
    },
    async insertMovie(userId, data) {
      const movie = { id: nextId++, userId, watched: false, favorite: false, ...data };
      movies.push(movie);
      return movie;
    },
    async updateMovie(id, userId, patch) {
      const movie = movies.find(m => m.id === id && m.userId === userId);
      if (!movie) return null;
      Object.assign(movie, patch);
      return movie;
    },
    async deleteMovie(id, userId) {
      const index = movies.findIndex(m => m.id === id && m.userId === userId);
      if (index === -1) return false;
      movies.splice(index, 1);
      return true;
    },
    async getFeatured() { return [{ imdbID: "tt0468569", title: "The Dark Knight" }]; },
    async saveFeatured() {},
    async findLocalMovieByImdbId() { return null; }
  };
}

// ---- fake OMDb: only knows "Inception (2010)" ----
const INCEPTION = {
  Response: "True", Title: "Inception", Year: "2010", Type: "movie",
  imdbID: "tt1375666", Genre: "Action, Adventure, Sci-Fi", Released: "16 Jul 2010"
};
const fakeHttp = {
  async get(url, { params }) {
    if (params.s) {
      if (params.y && params.y !== "2010") return { data: { Response: "False" } };
      return { data: { Response: "True", Search: [{ Title: "Inception", Year: "2010", imdbID: "tt1375666", Type: "movie" }] } };
    }
    if (params.i === "tt1375666") return { data: INCEPTION };
    return { data: { Response: "False" } };
  }
};

function newApp(repo = fakeRepo()) {
  return createApp({
    repo,
    http: fakeHttp,
    omdbKey: "test-key",
    sessionSecret: "test-secret",
    // tests log in by sending an x-test-user header instead of a real session
    getUser: req => {
      const id = req.get("x-test-user");
      return id ? { id: Number(id), username: "user" + id } : null;
    }
  });
}

async function withServer(app, fn) {
  const server = await new Promise(resolve => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}

const call = (base, method, path, { body, user = 1 } = {}) => fetch(base + path, {
  method,
  headers: {
    "Content-Type": "application/json",
    ...(user ? { "x-test-user": String(user) } : {})
  },
  body: body ? JSON.stringify(body) : undefined
});

const INCEPTION_BODY = { title: "Inception", genre: "Sci-Fi", year: 2010, imdbID: "tt1375666" };

test("GET /health is ok, and 503 when the database is down", async () => {
  const repo = fakeRepo();
  await withServer(newApp(repo), async base => {
    assert.equal((await call(base, "GET", "/health", { user: null })).status, 404);
    repo.pingFails = true;
    assert.equal((await call(base, "GET", "/health", { user: null })).status, 503);
  });
});

test("protected routes return 401 without a login", async () => {
  await withServer(newApp(), async base => {
    for (const path of ["/api/movies", "/api/featured", "/api/lookup?title=x", "/api/trailer?title=x"]) {
      const res = await call(base, "GET", path, { user: null });
      assert.equal(res.status, 401, path);
    }
  });
});

test("add a movie, then it shows up in the watchlist", async () => {
  await withServer(newApp(), async base => {
    const created = await call(base, "POST", "/api/movies", { body: INCEPTION_BODY });
    assert.equal(created.status, 201);

    const list = await (await call(base, "GET", "/api/movies")).json();
    assert.equal(list.length, 1);
    assert.equal(list[0].title, "Inception");
  });
});

test("adding the same movie twice gives 409", async () => {
  await withServer(newApp(), async base => {
    await call(base, "POST", "/api/movies", { body: INCEPTION_BODY });
    const again = await call(base, "POST", "/api/movies", { body: INCEPTION_BODY });
    assert.equal(again.status, 409);
  });
});

test("missing title, genre or year gives 400", async () => {
  await withServer(newApp(), async base => {
    const res = await call(base, "POST", "/api/movies", { body: { title: "Inception" } });
    assert.equal(res.status, 400);
  });
});

test("users only see their own movies", async () => {
  await withServer(newApp(), async base => {
    await call(base, "POST", "/api/movies", { body: INCEPTION_BODY, user: 1 });
    const other = await (await call(base, "GET", "/api/movies", { user: 2 })).json();
    assert.equal(other.length, 0);
  });
});

test("mark watched / favorite, and 404 for someone else's movie", async () => {
  await withServer(newApp(), async base => {
    const created = await (await call(base, "POST", "/api/movies", { body: INCEPTION_BODY })).json();

    const updated = await call(base, "PUT", `/api/movies/${created.id}`, { body: { watched: true, favorite: true } });
    assert.equal(updated.status, 200);
    const movie = await updated.json();
    assert.equal(movie.watched, true);
    assert.equal(movie.favorite, true);

    const stolen = await call(base, "PUT", `/api/movies/${created.id}`, { body: { watched: false }, user: 2 });
    assert.equal(stolen.status, 404);
  });
});

test("delete removes the movie; deleting again gives 404", async () => {
  await withServer(newApp(), async base => {
    const created = await (await call(base, "POST", "/api/movies", { body: INCEPTION_BODY })).json();
    assert.equal((await call(base, "DELETE", `/api/movies/${created.id}`)).status, 200);
    assert.equal((await call(base, "DELETE", `/api/movies/${created.id}`)).status, 404);
  });
});

test("validate accepts a real movie and rejects a wrong year", async () => {
  await withServer(newApp(), async base => {
    const good = await call(base, "POST", "/api/validate", { body: { title: "Inception", year: 2010, genre: "Sci-Fi" } });
    assert.equal(good.status, 200);
    assert.equal((await good.json()).valid, true);

    const bad = await call(base, "POST", "/api/validate", { body: { title: "Inception", year: 2011, genre: "Sci-Fi" } });
    assert.equal(bad.status, 422);
    assert.equal((await bad.json()).reason, "year");
  });
});

test("validate rejects the wrong genre", async () => {
  await withServer(newApp(), async base => {
    const res = await call(base, "POST", "/api/validate", { body: { title: "Inception", year: 2010, genre: "Horror" } });
    assert.equal(res.status, 422);
    assert.equal((await res.json()).reason, "genre");
  });
});

test("featured movies come from the repository", async () => {
  await withServer(newApp(), async base => {
    const res = await call(base, "GET", "/api/featured");
    assert.equal(res.status, 200);
    assert.equal((await res.json())[0].title, "The Dark Knight");
  });
});
