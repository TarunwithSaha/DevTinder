const request = require("supertest");
const { createApp } = require("../src/app");

const app = createApp({ enabled: false });

test("the bare URL redirects to the API docs", async () => {
  const res = await request(app).get("/").expect(302);
  expect(res.headers.location).toBe("/docs/");
});