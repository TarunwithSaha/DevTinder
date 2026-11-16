const User = require("../models/user");
const ConnectionRequest = require("../models/connectionRequest");
const AppError = require("../utils/AppError");
const { publicCard, CARD_FIELDS } = require("../utils/serializers");

const SEND_STATUSES = ["interested", "ignored"];
const REVIEW_STATUSES = ["accepted", "rejected"];
const LIST_LIMIT = 100;

// Exactly 24 hex characters. (mongoose.isValidObjectId also accepts any
// 12-character string, which would let odd input through.)
const ID_PATTERN = /^[0-9a-fA-F]{24}$/;

function assertId(value, label) {
  if (typeof value !== "string" || !ID_PATTERN.test(value))
    throw new AppError(`${label} is not a valid id`, 400);
}

async function sendRequest(me, status, toUserId) {
  if (!SEND_STATUSES.includes(status))
    throw new AppError(`Status must be one of: ${SEND_STATUSES.join(", ")}`, 400);
  assertId(toUserId, "User id");
  if (me._id.equals(toUserId)) throw new AppError("You cannot send a request to yourself", 400);

  const target = await User.exists({ _id: toUserId });
  if (!target) throw new AppError("User not found", 404);

  // Look in BOTH directions. The unique index only covers "same sender, same receiver".
  const existing = await ConnectionRequest.findOne({
    $or: [
      { fromUserId: me._id, toUserId },
      { fromUserId: toUserId, toUserId: me._id },
    ],
  }).select("fromUserId");

  if (existing) {
    if (existing.fromUserId.equals(me._id))
      throw new AppError("You already sent a request to this user", 409);
    // Deliberately vague: it must not reveal whether they showed interest or ignored you
    throw new AppError("A request between you and this user already exists", 409);
  }

  try {
    return await ConnectionRequest.create({ fromUserId: me._id, toUserId, status });
  } catch (err) {
    // Two identical sends can both pass the check above. The unique index stops the
    // second one; turn that database error into a clean answer.
    if (err.code === 11000) throw new AppError("You already sent a request to this user", 409);
    throw err;
  }
}

async function reviewRequest(me, status, requestId) {
  if (!REVIEW_STATUSES.includes(status))
    throw new AppError(`Status must be one of: ${REVIEW_STATUSES.join(", ")}`, 400);
  assertId(requestId, "Request id");

  // ONE atomic operation: the request must be mine, and must still be "interested".
  // If two reviews arrive at the same moment, the database lets only one of them match.
  const updated = await ConnectionRequest.findOneAndUpdate(
    { _id: requestId, toUserId: me._id, status: "interested" },
    { status },
    { new: true, runValidators: true }
  );
  if (updated) return updated;

  // It did not match. Work out why, without leaking anything.
  const existing = await ConnectionRequest.findById(requestId).select("toUserId status");
  if (!existing || !existing.toUserId.equals(me._id) || existing.status === "ignored")
    throw new AppError("Request not found", 404);
  throw new AppError(`This request was already ${existing.status}`, 409);
}

async function listReceived(me) {
  const requests = await ConnectionRequest.find({ toUserId: me._id, status: "interested" })
    .sort({ createdAt: -1 })
    .limit(LIST_LIMIT)
    .populate("fromUserId", CARD_FIELDS);

  return requests
    .filter((r) => r.fromUserId) // skip requests from users that no longer exist
    .map((r) => ({ requestId: r._id, receivedAt: r.createdAt, from: publicCard(r.fromUserId) }));
}

async function listConnections(me) {
  const requests = await ConnectionRequest.find({
    status: "accepted",
    $or: [{ fromUserId: me._id }, { toUserId: me._id }],
  })
    .sort({ updatedAt: -1 })
    .limit(LIST_LIMIT)
    .populate("fromUserId", CARD_FIELDS)
    .populate("toUserId", CARD_FIELDS);

  return requests
    .map((r) => {
      const iSent = r.fromUserId && r.fromUserId._id.equals(me._id);
      const other = iSent ? r.toUserId : r.fromUserId;
      return other ? { connectionId: r._id, since: r.updatedAt, user: publicCard(other) } : null;
    })
    .filter(Boolean);
}

module.exports = { sendRequest, reviewRequest, listReceived, listConnections };