const request = require("supertest");
const jwt = require("jsonwebtoken");
const { createApp } = require("../src/app");
const User = require("../src/models/user");
const h = require("./helpers");

const app = createApp({ enabled: false }); // no rate limits in these tests

beforeAll(h.startDb);
afterAll(h.stopDb);
beforeEach(h.resetDb);

const validSignup = { firstName: "Tarun", lastName: "Saha", emailId: "tarun@example.com", password: h.PASSWORD };

describe("signup", () => {
  test("creates the user and never returns the password", async () => {
    const res = await request(app).post("/signup").send(validSignup).expect(201);
    expect(res.body.user.emailId).toBe("tarun@example.com");
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });

  test("stores a bcrypt hash, not the password", async () => {
    await request(app).post("/signup").send(validSignup).expect(201);
    const stored = await User.findOne({ emailId: "tarun@example.com" }).select("+password");
    expect(stored.password).not.toBe(h.PASSWORD);
    expect(stored.password).toMatch(/^\$2[aby]\$10\$/);
  });

  test("rejects a duplicate email with 409", async () => {
    await request(app).post("/signup").send(validSignup).expect(201);
    const res = await request(app).post("/signup").send(validSignup).expect(409);
    expect(res.body.error).toMatch(/already registered/i);
  });

  test.each([
    ["weak password", { ...validSignup, password: "abc" }, /Password must be/],
    ["invalid email", { ...validSignup, emailId: "not-an-email" }, /valid email/],
    ["short first name", { ...validSignup, firstName: "T" }, /First name/],
    ["password over 72 characters", { ...validSignup, password: "Aa1!" + "x".repeat(70) }, /at most 72/],
    ["email as an object", { ...validSignup, emailId: { $ne: null } }, /valid email/],
  ])("rejects %s with 400", async (name, body, message) => {
    const res = await request(app).post("/signup").send(body).expect(400);
    expect(res.body.error).toMatch(message);
  });

  test("rejects malformed JSON with 400", async () => {
    const res = await request(app).post("/signup").set("Content-Type", "application/json").send("{bad json").expect(400);
    expect(res.body.error).toMatch(/not valid JSON/);
  });

  test("ignores extra fields instead of storing them", async () => {
    await request(app).post("/signup").send({ ...validSignup, isAdmin: true, age: 99 }).expect(201);
    const stored = await User.findOne({ emailId: "tarun@example.com" }).lean();
    expect(stored.isAdmin).toBeUndefined();
    expect(stored.age).toBeUndefined();
  });
});

describe("login", () => {
  beforeEach(async () => {
    await request(app).post("/signup").send(validSignup).expect(201);
  });

  test("sets an httpOnly cookie", async () => {
    const res = await request(app).post("/login").send({ emailId: "tarun@example.com", password: h.PASSWORD }).expect(200);
    const cookie = res.headers["set-cookie"].join(";");
    expect(cookie).toMatch(/token=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  test("a wrong password and an unknown email get the identical answer", async () => {
    const wrong = await request(app).post("/login").send({ emailId: "tarun@example.com", password: "Wrong!Pass#9" }).expect(401);
    const unknown = await request(app).post("/login").send({ emailId: "nobody@example.com", password: "Wrong!Pass#9" }).expect(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body.error).toBe("Invalid credentials");
  });

  test("a NoSQL operator in the email is rejected before any query", async () => {
    await request(app).post("/login").send({ emailId: { $ne: null }, password: "x" }).expect(400);
  });

  test("email matching ignores case and surrounding spaces", async () => {
    await request(app).post("/login").send({ emailId: "  TARUN@Example.com ", password: h.PASSWORD }).expect(200);
  });
});

describe("sessions", () => {
  test("/profile needs a login", async () => {
    await request(app).get("/profile").expect(401);
  });

  test("a logged-in agent can read /profile, and logout ends the session", async () => {
    const { agent } = await h.registerAndLogin(app, "Tarun");
    await agent.get("/profile").expect(200);
    await agent.post("/logout").expect(200);
    await agent.get("/profile").expect(401);
  });

  test("a made-up token is rejected", async () => {
    await request(app).get("/profile").set("Cookie", "token=abc.def.ghi").expect(401);
  });

  test("a token signed with another secret is rejected", async () => {
    const { id } = await h.registerAndLogin(app, "Tarun");
    const forged = jwt.sign({ id }, "some-other-secret");
    await request(app).get("/profile").set("Cookie", `token=${forged}`).expect(401);
  });

  test("an expired token is rejected", async () => {
    const { id } = await h.registerAndLogin(app, "Tarun");
    const expired = jwt.sign({ id, exp: Math.floor(Date.now() / 1000) - 10 }, process.env.JWT_SECRET);
    await request(app).get("/profile").set("Cookie", `token=${expired}`).expect(401);
  });

  test("a valid token for a deleted account stops working", async () => {
    const { agent, id } = await h.registerAndLogin(app, "Tarun");
    await agent.get("/profile").expect(200);
    await User.deleteOne({ _id: id });
    await agent.get("/profile").expect(401);
  });
});