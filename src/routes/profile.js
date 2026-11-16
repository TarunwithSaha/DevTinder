const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth");
const profile = require("../controllers/profileController");

const router = express.Router();

router.get("/profile/view", requireAuth, profile.view);
router.patch("/profile/edit", requireAuth, asyncHandler(profile.edit));
router.patch("/profile/password", requireAuth, asyncHandler(profile.changePassword));

module.exports = router;