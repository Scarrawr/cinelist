const { createClient } = require("redis");
const RedisStore = require("connect-redis").default;

// Sessions live in Redis so they survive redeploys and are shared with movies-api.
// Both services MUST use the same SESSION_SECRET and the same key prefix.
function buildSessionStore() {
  if (!process.env.REDIS_URL) {
    console.warn("REDIS_URL not set: using in-memory sessions (development only).");
    return undefined;
  }

  const client = createClient({ url: process.env.REDIS_URL });
  client.on("error", error => console.error("Redis error:", error.message));
  client.connect().catch(error => console.error("Redis connect failed:", error.message));

  return new RedisStore({ client, prefix: "cinelist:sess:" });
}

module.exports = { buildSessionStore };
