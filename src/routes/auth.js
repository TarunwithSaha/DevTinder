const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth");
const auth = require("../controllers/authController");

const router = express.Router();

router.post("/signup", asyncHandler(auth.signup));
router.post("/login", asyncHandler(auth.login));
router.post("/logout", auth.logout);
router.get("/profile", requireAuth, auth.profile);

module.exports = router;