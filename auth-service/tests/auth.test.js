const test = require("node:test");
const assert = require("node:assert/strict");
const { createApp } = require("../src/app");

// In-memory stand-in for the users table
function fakeUsers() {
  const rows = [];
  return {
    async ping() {},
    async findByUsername(name) {
      return rows.find(u => u.username.toLowerCase() === name.toLowerCase()) || null;
    },
    async create(username, password) {
      const user = { id: rows.length + 1, username, password };
      rows.push(user);
      return { id: user.id, username };
    }
  };
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

const post = (base, path, body, cookie) => fetch(base + path, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
  body: JSON.stringify(body)
});

const newApp = users => createApp({ users, sessionSecret: "test-secret" });

test("GET /health returns ok when the database answers", async () => {
  await withServer(newApp(fakeUsers()), async base => {
    const res = await fetch(base + "/health");
    assert.equal(res.status, 200);
    assert.equal((await res.json()).status, "ok");
  });
});

test("GET /health returns 503 when the database is down", async () => {
  const users = fakeUsers();
  users.ping = async () => { throw new Error("db down"); };
  await withServer(newApp(users), async base => {
    const res = await fetch(base + "/health");
    assert.equal(res.status, 503);
  });
});

test("register then login works and /api/me returns the user", async () => {
  await withServer(newApp(fakeUsers()), async base => {
    const reg = await post(base, "/api/register", { username: "alice", password: "secret1" });
    assert.equal(reg.status, 201);

    const login = await post(base, "/api/login", { username: "ALICE", password: "secret1" });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie").split(";")[0];

    const me = await fetch(base + "/api/me", { headers: { cookie } });
    assert.equal(me.status, 200);
    assert.equal((await me.json()).user.username, "alice");
  });
});

test("duplicate usernames are rejected (case-insensitive)", async () => {
  await withServer(newApp(fakeUsers()), async base => {
    await post(base, "/api/register", { username: "bob", password: "pw" });
    const again = await post(base, "/api/register", { username: "BOB", password: "pw" });
    assert.equal(again.status, 409);
  });
});

test("wrong password and unknown user both give 401", async () => {
  await withServer(newApp(fakeUsers()), async base => {
    await post(base, "/api/register", { username: "carol", password: "right" });
    const wrong = await post(base, "/api/login", { username: "carol", password: "wrong" });
    const unknown = await post(base, "/api/login", { username: "nobody", password: "x" });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
  });
});

test("missing fields give 400", async () => {
  await withServer(newApp(fakeUsers()), async base => {
    const res = await post(base, "/api/register", { username: "dave" });
    assert.equal(res.status, 400);
  });
});

test("/api/me is 401 without a session, and after logout", async () => {
  await withServer(newApp(fakeUsers()), async base => {
    assert.equal((await fetch(base + "/api/me")).status, 401);

    await post(base, "/api/register", { username: "erin", password: "pw" });
    const login = await post(base, "/api/login", { username: "erin", password: "pw" });
    const cookie = login.headers.get("set-cookie").split(";")[0];

    const out = await post(base, "/api/logout", {}, cookie);
    assert.equal(out.status, 200);
    assert.equal((await fetch(base + "/api/me", { headers: { cookie } })).status, 401);
  });
});
