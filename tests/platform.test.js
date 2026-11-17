const request = require("supertest");
const { createApp } = require("../src/app");
const h = require("./helpers");

beforeAll(h.startDb);
afterAll(h.stopDb);
beforeEach(h.resetDb);

describe("security headers", () => {
  const app = createApp({ enabled: false });

  test("helmet headers are set and the framework is not advertised", async () => {
    const res = await request(app).get("/health").expect(200);
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["strict-transport-security"]).toBeDefined();
    expect(res.headers["content-security-policy"]).toBeDefined();
  });
});

describe("API docs", () => {
  const app = createApp({ enabled: false });

  test("Swagger UI is served at /docs/", async () => {
    const res = await request(app).get("/docs/").expect(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
  });
});

describe("error handling", () => {
  const app = createApp({ enabled: false });

  test("an unknown route is a JSON 404", async () => {
    const res = await request(app).get("/nope").expect(404);
    expect(res.body.error).toMatch(/Route not found/);
  });

  test("a wrong method on a real route is a JSON 404", async () => {
    const { agent } = await h.registerAndLogin(app, "Tarun");
    await agent.delete("/user/feed").expect(404);
  });

  test("an oversized body is a JSON 413", async () => {
    const { agent } = await h.registerAndLogin(app, "Tarun");
    const res = await agent.patch("/profile/edit").send({ about: "a".repeat(20000) }).expect(413);
    expect(res.body.error).toMatch(/too large/);
  });
});

describe("rate limiting", () => {
  const creds = { emailId: "tarun@example.com", password: h.PASSWORD };
  const wrong = { emailId: "tarun@example.com", password: "Wrong!Pass#9" };

  test("failed logins are limited, and the limit applies even to the right password", async () => {
    const app = createApp({ login: { windowMs: 60000, limit: 3 } });
    await request(app).post("/signup").send({ firstName: "Tarun", ...creds }).expect(201);

    for (let i = 0; i < 3; i++) await request(app).post("/login").send(wrong).expect(401);
    const blocked = await request(app).post("/login").send(wrong).expect(429);
    expect(blocked.body.error).toMatch(/Too many requests/);
    await request(app).post("/login").send(creds).expect(429);
  });

  test("successful logins do not use up the budget", async () => {
    const app = createApp({ login: { windowMs: 60000, limit: 3 } });
    await request(app).post("/signup").send({ firstName: "Tarun", ...creds }).expect(201);
    for (let i = 0; i < 6; i++) await request(app).post("/login").send(creds).expect(200);
  });

  test("signups are limited", async () => {
    const app = createApp({ signup: { windowMs: 60000, limit: 2 } });
    for (let i = 1; i <= 2; i++) {
      await request(app).post("/signup").send({ firstName: "User", emailId: `u${i}@example.com`, password: h.PASSWORD }).expect(201);
    }
    await request(app).post("/signup").send({ firstName: "User", emailId: "u3@example.com", password: h.PASSWORD }).expect(429);
  });

  test("password changes are limited by failed attempts", async () => {
    const app = createApp({ password: { windowMs: 60000, limit: 2 } });
    const { agent } = await h.registerAndLogin(app, "Tarun");
    const body = { currentPassword: "Wrong!Pass#9", newPassword: "N3w!Passw0rd#2" };
    await agent.patch("/profile/password").send(body).expect(400);
    await agent.patch("/profile/password").send(body).expect(400);
    await agent.patch("/profile/password").send(body).expect(429);
  });

  test("sending requests is limited", async () => {
    const app = createApp({ request: { windowMs: 60000, limit: 2 } });
    const a = await h.registerAndLogin(app, "Alice");
    const [b, c, d] = [await h.registerAndLogin(app, "Bob"), await h.registerAndLogin(app, "Carol"), await h.registerAndLogin(app, "Dave")];
    await a.agent.post(`/request/send/ignored/${b.id}`).expect(201);
    await a.agent.post(`/request/send/ignored/${c.id}`).expect(201);
    await a.agent.post(`/request/send/ignored/${d.id}`).expect(429);
  });

  test("the health check is never limited", async () => {
    const app = createApp({ global: { windowMs: 60000, limit: 1 } });
    for (let i = 0; i < 5; i++) await request(app).get("/health").expect(200);
  });
});