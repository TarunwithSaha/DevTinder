const express = require("express");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const swaggerUi = require("swagger-ui-express");
const openapi = require("./docs/openapi");
const authRouter = require("./routes/auth");
const profileRouter = require("./routes/profile");
const requestRouter = require("./routes/request");
const userRouter = require("./routes/user");
const { notFound, errorHandler } = require("./middlewares/errorHandler");

const DEFAULT_LIMITS = {
  enabled: true,
  global: { windowMs: 60 * 1000, limit: 300 },
  login: { windowMs: 15 * 60 * 1000, limit: 10 },
  signup: { windowMs: 60 * 60 * 1000, limit: 10 },
  password: { windowMs: 15 * 60 * 1000, limit: 5 },
  request: { windowMs: 60 * 1000, limit: 60 },
};

function makeLimiter(enabled, cfg, extra = {}) {
  if (!enabled) return (req, res, next) => next();
  return rateLimit({
    windowMs: cfg.windowMs,
    limit: cfg.limit,
    standardHeaders: "draft-7", // RateLimit headers, so clients can see their budget
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later" },
    ...extra,
  });
}

// Built by a function so tests can create apps with different limits.
// Limiter state lives in memory, inside each app instance.
function createApp(overrides = {}) {
  const limits = { ...DEFAULT_LIMITS, ...overrides };
  const on = limits.enabled;
  const app = express();

  // Behind a hosting proxy, req.ip would be the proxy's address for everyone and the
  // rate limiter would treat all users as one. TRUST_PROXY=1 means "trust one proxy hop".
  if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY));

  // API docs are mounted before helmet, because Swagger UI needs scripts that helmet's
  // strict default policy would block. Everything else gets the full set of headers.
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapi));

  app.use(helmet());
  app.get("/health", (req, res) => res.json({ status: "ok" }));
app.get("/", (req, res) => res.redirect("/docs/"));

  app.use(makeLimiter(on, limits.global));
  app.use(express.json({ limit: "10kb" }));
  app.use(cookieParser());

  // skipSuccessfulRequests: only FAILED attempts use up the budget, so normal users
  // are never locked out, but password guessing is throttled.
  app.post("/login", makeLimiter(on, limits.login, { skipSuccessfulRequests: true }));
  app.post("/signup", makeLimiter(on, limits.signup));
  app.patch("/profile/password", makeLimiter(on, limits.password, { skipSuccessfulRequests: true }));
  app.use("/request", makeLimiter(on, limits.request));

  app.use("/", authRouter);
  app.use("/", profileRouter);
  app.use("/", requestRouter);
  app.use("/", userRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };