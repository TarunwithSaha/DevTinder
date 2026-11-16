const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth");
const request = require("../controllers/requestController");

const router = express.Router();

router.post("/request/send/:status/:toUserId", requireAuth, asyncHandler(request.send));
router.post("/request/review/:status/:requestId", requireAuth, asyncHandler(request.review));

module.exports = router;