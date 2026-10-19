const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");

// App factory: dependencies are injected so tests can run without Postgres or Redis.
function createApp({ users, sessionStore, sessionSecret }) {
  const app = express();

  // Needed when running behind the Nginx reverse proxy
  app.set("trust proxy", 1);
  app.use(express.json());

  app.use(session({
    store: sessionStore, // undefined => in-memory store
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24,
      httpOnly: true,
      sameSite: "lax"
    }
  }));

  // Health check (Docker HEALTHCHECK + Jenkins smoke test). Also verifies the database.
  app.get("/health", async (req, res) => {
    try {
      await users.ping();
      res.json({ status: "ok", service: "auth-service" });
    } catch (error) {
      res.status(503).json({ status: "unavailable", service: "auth-service" });
    }
  });

  // REGISTER
  app.post("/api/register", async (req, res) => {
    try {
      const { username, password } = req.body || {};

      if (typeof username !== "string" || typeof password !== "string" ||
          !username.trim() || !password) {
        return res.status(400).json({ message: "Username and password are required." });
      }

      const cleanName = username.trim();

      if (await users.findByUsername(cleanName)) {
        return res.status(409).json({ message: "Username is already taken." });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      try {
        await users.create(cleanName, hashedPassword);
      } catch (error) {
        // 23505 = unique violation (two people registered the same name at once)
        if (error.code === "23505") {
          return res.status(409).json({ message: "Username is already taken." });
        }
        throw error;
      }

      res.status(201).json({ message: "Account created successfully." });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Registration failed." });
    }
  });

  // LOGIN
  app.post("/api/login", async (req, res) => {
    try {
      const { username, password } = req.body || {};

      if (typeof username !== "string" || typeof password !== "string" ||
          !username || !password) {
        return res.status(400).json({ message: "Username and password are required." });
      }

      const user = await users.findByUsername(username.trim());
      const passwordMatch = user ? await bcrypt.compare(password, user.password) : false;

      if (!user || !passwordMatch) {
        return res.status(401).json({ message: "Invalid username or password." });
      }

      req.session.user = { id: user.id, username: user.username };
      res.json({ message: "Login successful.", user: req.session.user });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Login failed." });
    }
  });

  // LOGOUT
  app.post("/api/logout", (req, res) => {
    req.session.destroy(error => {
      if (error) {
        return res.status(500).json({ message: "Logout failed." });
      }
      res.clearCookie("connect.sid");
      res.json({ message: "Logged out successfully." });
    });
  });

  // CURRENT USER (also used by the proxy to protect the main page)
  app.get("/api/me", (req, res) => {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ message: "Not authenticated." });
    }
    res.json({ user: req.session.user });
  });

  app.use((error, req, res, next) => {
    console.error(error);
    res.status(500).json({ message: "Internal server error." });
  });

  return app;
}

module.exports = { createApp };
