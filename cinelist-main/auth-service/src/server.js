require("dotenv").config();

const { createApp } = require("./app");
const { createPool, createUsersRepo } = require("./repo");
const { buildSessionStore } = require("./session-store");

if (!process.env.SESSION_SECRET) {
  console.error("SESSION_SECRET is not set.");
  process.exit(1);
}

const app = createApp({
  users: createUsersRepo(createPool()),
  sessionStore: buildSessionStore(),
  sessionSecret: process.env.SESSION_SECRET
});

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  console.log(`auth-service listening on port ${PORT}`);
});

// Docker sends SIGTERM on stop/redeploy: close cleanly instead of waiting to be killed
process.on("SIGTERM", () => server.close(() => process.exit(0)));
