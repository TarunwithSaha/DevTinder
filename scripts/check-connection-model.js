// Proves the database-level rules of the ConnectionRequest model.
// Run with: node scripts/check-connection-model.js
require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../src/models/user");
const ConnectionRequest = require("../src/models/connectionRequest");

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
  if (!ok) failures++;
}
async function errorOf(fn) {
  try {
    await fn();
    return null;
  } catch (e) {
    return e;
  }
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  await ConnectionRequest.init(); // make sure the indexes exist before testing them

  const tag = Date.now();
  const emailPrefix = `model-check-${tag}-`;
  try {
    const mk = (n) =>
      User.create({ firstName: `Test${n}`, emailId: `${emailPrefix}${n}@example.com`, password: "not-a-real-hash" });
    const a = await mk("A");
    const b = await mk("B");

    const first = await ConnectionRequest.create({ fromUserId: a._id, toUserId: b._id, status: "interested" });
    check("valid request A->B is saved", first.status === "interested");

    let err = await errorOf(() => ConnectionRequest.create({ fromUserId: a._id, toUserId: b._id, status: "interested" }));
    check("duplicate A->B is rejected by the unique index", err && err.code === 11000, err && `code ${err.code}`);

    err = await errorOf(() => ConnectionRequest.create({ fromUserId: a._id, toUserId: a._id, status: "interested" }));
    check("request to yourself is rejected", err && err.name === "ValidationError" && !!err.errors.toUserId,
      err && err.errors && err.errors.toUserId && err.errors.toUserId.message);

    err = await errorOf(() => ConnectionRequest.create({ fromUserId: a._id, toUserId: b._id, status: "banana" }));
    check("invalid status is rejected", err && err.name === "ValidationError" && !!err.errors.status);

    err = await errorOf(() => ConnectionRequest.create({ fromUserId: b._id, toUserId: a._id, status: "interested" }));
    check("reverse request B->A is NOT blocked by the index (the service must block it in Part 3)", err === null);

    const indexes = await ConnectionRequest.collection.indexes();
    console.log("Indexes:", indexes.map((i) => i.name).join(", "));
    check("unique index on (fromUserId, toUserId) exists",
      indexes.some((i) => i.unique && i.key.fromUserId === 1 && i.key.toUserId === 1));
    check("index on (toUserId, status) exists",
      indexes.some((i) => i.key.toUserId === 1 && i.key.status === 1));
  } finally {
    // Clean up everything this script created, even if a check threw
    const users = await User.find({ emailId: new RegExp("^" + emailPrefix) }, "_id");
    const ids = users.map((u) => u._id);
    await ConnectionRequest.deleteMany({ $or: [{ fromUserId: { $in: ids } }, { toUserId: { $in: ids } }] });
    await User.deleteMany({ _id: { $in: ids } });
    await mongoose.disconnect();
  }

  console.log(failures === 0 ? "\nAll checks passed" : `\n${failures} check(s) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});