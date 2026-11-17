// Test environment. This runs before the app code reads any setting.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-only-secret-0123456789abcdef0123456789abcdef";

const mongoose = require("mongoose");
const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");
// Load the models so their indexes can be built before any test relies on them
require("../src/models/user");
require("../src/models/connectionRequest");

const PASSWORD = "Str0ng!Pass#1";
let mongod;

async function startDb() {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all(Object.values(mongoose.models).map((m) => m.init())); // unique indexes exist
}

// Wipes the data but keeps the collections and their indexes
async function resetDb() {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
}

async function stopDb() {
  await mongoose.disconnect();
  await mongod.stop();
}

// Creates an account and returns a logged-in agent (an agent keeps its cookie)
async function registerAndLogin(app, name) {
  const emailId = `${name.toLowerCase()}@example.com`;
  await request(app).post("/signup").send({ firstName: name, emailId, password: PASSWORD }).expect(201);
  const agent = request.agent(app);
  const res = await agent.post("/login").send({ emailId, password: PASSWORD }).expect(200);
  return { agent, id: res.body.user.id, emailId };
}

module.exports = { PASSWORD, startDb, resetDb, stopDb, registerAndLogin };