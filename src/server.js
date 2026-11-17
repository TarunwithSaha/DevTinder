require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("./config/database");
const { createApp } = require("./app");
const app = createApp();

const PORT = process.env.PORT || 3000;
let server;

// Stop accepting connections, let in-flight requests finish, close the database, exit.
async function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  // If something hangs, do not wait forever
  setTimeout(() => {
    console.error("Forced exit after 10 s");
    process.exit(1);
  }, 10000).unref();

  try {
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    console.log("Shutdown complete");
    process.exit(0);
  } catch (err) {
    console.error("Error during shutdown:", err);
    process.exit(1);
  }
}

// An unexpected error means the process may be in an unknown state.
// Log it and exit, so a supervisor (nodemon, Docker, a host) restarts a clean process.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
  process.exit(1);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  process.exit(1);
});
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

(async () => {
  try {
    if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is not set");
    await connectDB();
    console.log("Database connected");
    server = app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
  } catch (err) {
    console.error("Startup failed:", err.message);
    process.exit(1);
  }
})();