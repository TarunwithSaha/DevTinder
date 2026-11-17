const request = require("supertest");
const { createApp } = require("../src/app");
const ConnectionRequest = require("../src/models/connectionRequest");
const h = require("./helpers");

const app = createApp({ enabled: false });

beforeAll(h.startDb);
afterAll(h.stopDb);
beforeEach(h.resetDb);

let alice, bob, carol;
beforeEach(async () => {
  alice = await h.registerAndLogin(app, "Alice");
  bob = await h.registerAndLogin(app, "Bob");
  carol = await h.registerAndLogin(app, "Carol");
});

const send = (from, status, toId) => from.agent.post(`/request/send/${status}/${toId}`);
const review = (by, status, requestId) => by.agent.post(`/request/review/${status}/${requestId}`);

describe("sending", () => {
  test("a valid request is created", async () => {
    const res = await send(alice, "interested", bob.id).expect(201);
    expect(res.body.request).toMatchObject({ fromUserId: alice.id, toUserId: bob.id, status: "interested" });
  });

  test("a duplicate is rejected", async () => {
    await send(alice, "interested", bob.id).expect(201);
    const res = await send(alice, "interested", bob.id).expect(409);
    expect(res.body.error).toMatch(/already sent/);
  });

  test("the reverse direction is rejected too, without revealing the type", async () => {
    await send(alice, "ignored", bob.id).expect(201);
    const res = await send(bob, "interested", alice.id).expect(409);
    expect(res.body.error).toMatch(/already exists/);
    expect(res.body.error).not.toMatch(/ignor/i);
  });

  test.each([
    ["yourself", "interested", () => alice.id, 400, /yourself/],
    ["an unknown user", "interested", () => "000000000000000000000000", 404, /not found/i],
    ["a malformed id", "interested", () => "abc", 400, /not a valid id/],
    ["an invalid status", "accepted", () => bob.id, 400, /Status must be/],
  ])("rejects a request to %s", async (name, status, target, code, message) => {
    const res = await send(alice, status, target()).expect(code);
    expect(res.body.error).toMatch(message);
  });

  test("needs a login", async () => {
    await request(app).post(`/request/send/interested/${bob.id}`).expect(401);
  });

  test("ten identical sends at the same moment create exactly one request", async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => send(alice, "interested", bob.id)));
    const codes = results.map((r) => r.status).sort();
    expect(codes.filter((c) => c === 201)).toHaveLength(1);
    expect(codes.filter((c) => c === 409)).toHaveLength(9);
    expect(await ConnectionRequest.countDocuments({ fromUserId: alice.id, toUserId: bob.id })).toBe(1);
  });
});

describe("privacy", () => {
  test("an ignore never shows up for the other person", async () => {
    await send(alice, "ignored", bob.id).expect(201);
    const res = await bob.agent.get("/user/requests/received").expect(200);
    expect(res.body.count).toBe(0);
  });

  test("an ignored request cannot be reviewed, and looks like a missing one", async () => {
    const sent = await send(alice, "ignored", bob.id).expect(201);
    const res = await review(bob, "accepted", sent.body.request.id).expect(404);
    expect(res.body.error).toBe("Request not found");
  });

  test("no emailId appears in any list of other people", async () => {
    const sent = await send(alice, "interested", bob.id).expect(201);
    const received = await bob.agent.get("/user/requests/received").expect(200);
    await review(bob, "accepted", sent.body.request.id).expect(200);
    const connections = await alice.agent.get("/user/connections").expect(200);
    const feed = await carol.agent.get("/user/feed").expect(200);
    for (const res of [received, connections, feed]) {
      expect(JSON.stringify(res.body)).not.toMatch(/emailId|@example\.com/);
    }
  });
});

describe("reviewing", () => {
  let requestId;
  beforeEach(async () => {
    requestId = (await send(alice, "interested", bob.id).expect(201)).body.request.id;
  });

  test("only the receiver can review", async () => {
    await review(alice, "accepted", requestId).expect(404);
    await review(carol, "accepted", requestId).expect(404);
  });

  test.each([
    ["an invalid status", "interested", () => requestId, 400, /Status must be/],
    ["a malformed id", "accepted", () => "abc", 400, /not a valid id/],
  ])("rejects %s", async (name, status, id, code, message) => {
    const res = await review(bob, status, id()).expect(code);
    expect(res.body.error).toMatch(message);
  });

  test("accepting connects both people, and a decision is final", async () => {
    await review(bob, "accepted", requestId).expect(200);
    await review(bob, "accepted", requestId).expect(409);
    await review(bob, "rejected", requestId).expect(409);

    const aliceList = await alice.agent.get("/user/connections").expect(200);
    const bobList = await bob.agent.get("/user/connections").expect(200);
    expect(aliceList.body.connections.map((c) => c.user.id)).toEqual([bob.id]);
    expect(bobList.body.connections.map((c) => c.user.id)).toEqual([alice.id]);
  });

  test("ten competing accept and reject reviews at the same moment: exactly one wins", async () => {
    const calls = Array.from({ length: 10 }, (_, i) => review(bob, i % 2 ? "accepted" : "rejected", requestId));
    const results = await Promise.all(calls);

    const wins = results.filter((r) => r.status === 200);
    expect(wins).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(9);

    // the stored state matches the one response that said success
    const stored = await ConnectionRequest.findById(requestId).lean();
    expect(stored.status).toBe(wins[0].body.request.status);
  });
});