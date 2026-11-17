const request = require("supertest");
const { createApp } = require("../src/app");
const User = require("../src/models/user");
const h = require("./helpers");

const app = createApp({ enabled: false });

beforeAll(h.startDb);
afterAll(h.stopDb);
beforeEach(h.resetDb);

describe("profile edit", () => {
  test("applies valid changes, removes duplicate skills and persists them", async () => {
    const { agent } = await h.registerAndLogin(app, "Tarun");
    const res = await agent
      .patch("/profile/edit")
      .send({ age: 21, gender: "male", about: "CSE student", skills: ["C++", "Node.js", "MongoDB", "node.js"], photoUrl: "https://example.com/me.png" })
      .expect(200);
    expect(res.body.user.skills).toEqual(["C++", "Node.js", "MongoDB"]);

    const view = await agent.get("/profile/view").expect(200);
    expect(view.body.user).toMatchObject({ age: 21, gender: "male", about: "CSE student" });
  });

  test.each([
    ["emailId", { emailId: "hacker@example.com" }, /cannot be edited/],
    ["password", { password: "hacked" }, /cannot be edited/],
    ["an unknown field", { firstName: "Hacker", isAdmin: true }, /cannot be edited/],
    ["an empty body", {}, /at least one field/],
    ["age under 18", { age: 17 }, /Age must be/],
    ["age as a string", { age: "21" }, /Age must be/],
    ["an invalid gender", { gender: "robot" }, /Gender must be/],
    ["a javascript: photo URL", { photoUrl: "javascript:alert(1)" }, /Photo URL/],
    ["skills as a string", { skills: "C++" }, /Skills must be/],
    ["11 skills", { skills: Array.from({ length: 11 }, (_, i) => `s${i}`) }, /Skills must be/],
    ["an about text over 500 characters", { about: "a".repeat(501) }, /About must be/],
  ])("rejects %s", async (name, body, message) => {
    const { agent } = await h.registerAndLogin(app, "Tarun");
    const res = await agent.patch("/profile/edit").send(body).expect(400);
    expect(res.body.error).toMatch(message);
  });

  test("a rejected request changes nothing, even its valid fields", async () => {
    const { agent, id } = await h.registerAndLogin(app, "Tarun");
    await agent.patch("/profile/edit").send({ firstName: "Hacker", isAdmin: true }).expect(400);
    const stored = await User.findById(id).lean();
    expect(stored.firstName).toBe("Tarun");
  });

  test("the email can never be changed through this route", async () => {
    const { agent, id } = await h.registerAndLogin(app, "Tarun");
    await agent.patch("/profile/edit").send({ emailId: "hacker@example.com" }).expect(400);
    const stored = await User.findById(id).lean();
    expect(stored.emailId).toBe("tarun@example.com");
  });

  test("needs a login", async () => {
    await request(app).patch("/profile/edit").send({ age: 22 }).expect(401);
  });
});

describe("password change", () => {
  test.each([
    ["a wrong current password", { currentPassword: "Wrong!Pass#9", newPassword: "N3w!Passw0rd#2" }, /incorrect/],
    ["a weak new password", { currentPassword: h.PASSWORD, newPassword: "weak" }, /New password must be/],
    ["the same password", { currentPassword: h.PASSWORD, newPassword: h.PASSWORD }, /different/],
  ])("rejects %s", async (name, body, message) => {
    const { agent } = await h.registerAndLogin(app, "Tarun");
    const res = await agent.patch("/profile/password").send(body).expect(400);
    expect(res.body.error).toMatch(message);
  });

  test("a successful change replaces the old password", async () => {
    const { agent, emailId } = await h.registerAndLogin(app, "Tarun");
    await agent.patch("/profile/password").send({ currentPassword: h.PASSWORD, newPassword: "N3w!Passw0rd#2" }).expect(200);
    await request(app).post("/login").send({ emailId, password: h.PASSWORD }).expect(401);
    await request(app).post("/login").send({ emailId, password: "N3w!Passw0rd#2" }).expect(200);
  });
});