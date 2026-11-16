const express = require("express");
const cookieParser = require("cookie-parser");
const authRouter = require("./routes/auth");
const { notFound, errorHandler } = require("./middlewares/errorHandler");

const app = express();

app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());

app.get("/health", (req, res) => res.json({ status: "ok" }));
app.use("/", authRouter);

app.use(notFound);
app.use(errorHandler);

module.exports = app;