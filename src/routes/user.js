const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth");
const user = require("../controllers/userController");

const router = express.Router();

router.get("/user/requests/received", requireAuth, asyncHandler(user.received));
router.get("/user/connections", requireAuth, asyncHandler(user.connections));

module.exports = router;