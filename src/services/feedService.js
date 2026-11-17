const User = require("../models/user");
const ConnectionRequest = require("../models/connectionRequest");
const { publicCard, CARD_FIELDS } = require("../utils/serializers");
const { buildPage } = require("../utils/pagination");

async function getFeed(me, { limit, cursor }) {
  // Everyone I share a request with, in EITHER direction and with ANY status.
  // (.lean() returns plain objects, which is faster when we only need the ids.)
  const requests = await ConnectionRequest.find({
    $or: [{ fromUserId: me._id }, { toUserId: me._id }],
  })
    .select("fromUserId toUserId")
    .lean();

  const hidden = new Set([me._id.toString()]);
  for (const r of requests) {
    hidden.add(r.fromUserId.toString());
    hidden.add(r.toUserId.toString());
  }

  const idFilter = { $nin: [...hidden] };
  if (cursor) idFilter.$lt = cursor; // keyset pagination: only users older than the cursor

  const users = await User.find({ _id: idFilter })
    .select(CARD_FIELDS)
    .sort({ _id: -1 }) // newest accounts first; _id is unique, so the order is stable
    .limit(limit + 1)
    .lean();

  const { items, nextCursor } = buildPage(users, limit, (u) => u._id);
  return { users: items.map(publicCard), nextCursor };
}

module.exports = { getFeed };