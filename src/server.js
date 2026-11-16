require("dotenv").config();
const connectDB = require("./config/database");
const app = require("./app");

const PORT = process.env.PORT || 3000;

(async () => {
  try {
    if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is not set");
    await connectDB();
    console.log("Database connected");
    app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
  } catch (err) {
    console.error("Startup failed:", err.message);
    process.exit(1);
  }
})();