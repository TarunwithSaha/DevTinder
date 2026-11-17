// Creates (or removes) fake users so the feed has people to show.
//   node scripts/seed-users.js [count]   creates seed.1@example.com ... seed.N@example.com
//   node scripts/seed-users.js --clean   removes them and every request they are part of
// Every seed user has the password  Str0ng!Pass#1
require("dotenv").config();
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("../src/models/user");
const ConnectionRequest = require("../src/models/connectionRequest");

const EMAIL_PATTERN = /^seed\.\d+@example\.com$/;
const PASSWORD = "Str0ng!Pass#1";
const SKILLS = ["JavaScript", "Python", "C++", "React", "Node.js", "MongoDB", "Docker", "Go", "Rust", "SQL"];
const GENDERS = ["male", "female", "other"];

(async () => {
  const arg = process.argv[2];
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    if (arg === "--clean") {
      const users = await User.find({ emailId: EMAIL_PATTERN }, "_id");
      const ids = users.map((u) => u._id);
      const reqs = await ConnectionRequest.deleteMany({
        $or: [{ fromUserId: { $in: ids } }, { toUserId: { $in: ids } }],
      });
      const del = await User.deleteMany({ _id: { $in: ids } });
      console.log(`Removed ${del.deletedCount} seed users and ${reqs.deletedCount} requests`);
      return;
    }

    const count = arg === undefined ? 25 : Number(arg);
    if (!Number.isInteger(count) || count < 1 || count > 200) {
      console.error("Usage: node scripts/seed-users.js [count 1-200 | --clean]");
      process.exitCode = 1;
      return;
    }

    const hash = bcrypt.hashSync(PASSWORD, 10); // one hash is enough for all of them
    const emails = Array.from({ length: count }, (_, i) => `seed.${i + 1}@example.com`);
    const existing = new Set(await User.find({ emailId: { $in: emails } }).distinct("emailId"));

    const docs = [];
    emails.forEach((emailId, i) => {
      if (existing.has(emailId)) return;
      const n = i + 1;
      docs.push({
        firstName: `Seed${n}`,
        lastName: "User",
        emailId,
        password: hash,
        age: 18 + (n % 30),
        gender: GENDERS[n % 3],
        about: `Seed profile number ${n}`,
        skills: [SKILLS[n % SKILLS.length], SKILLS[(n + 3) % SKILLS.length]],
      });
    });
    if (docs.length) await User.insertMany(docs);
    console.log(`Created ${docs.length} seed users (${existing.size} already existed)`);
    console.log(`Log in as any of them with password ${PASSWORD}`);
  } finally {
    await mongoose.disconnect();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});