const { createApp } = require("../src/app");
const User = require("../src/models/user");
const h = require("./helpers");

const app = createApp({ enabled: false });

beforeAll(h.startDb);
afterAll(h.stopDb);
beforeEach(h.resetDb);

let me;
beforeEach(async () => {
  me = await h.registerAndLogin(app, "Tarun");
});

async function seedUsers(n) {
  return User.insertMany(
    Array.from({ length: n }, (_, i) => ({
      firstName: `Seed${i + 1}`,
      emailId: `seed.${i + 1}@example.com`,
      password: "not-a-real-hash",
    }))
  );
}

async function walk(agent, limit) {
  const ids = [];
  let cursor = null;
  let pages = 0;
  do {
    const res = await agent.get(`/user/feed?limit=${limit}${cursor ? `&cursor=${cursor}` : ""}`).expect(200);
    ids.push(...res.body.users.map((u) => u.id));
    cursor = res.body.nextCursor;
    pages++;
  } while (cursor && pages < 50);
  return { ids, pages };
}

describe("feed", () => {
  test("walking every page returns each person exactly once", async () => {
    await seedUsers(25);
    const { ids, pages } = await walk(me.agent, 7);
    expect(pages).toBe(4); // 7 + 7 + 7 + 4
    expect(ids).toHaveLength(25);
    expect(new Set(ids).size).toBe(25);
  });

  test("the last page has a null cursor, and a full last page does not invent another", async () => {
    await seedUsers(14);
    const first = await me.agent.get("/user/feed?limit=7").expect(200);
    const second = await me.agent.get(`/user/feed?limit=7&cursor=${first.body.nextCursor}`).expect(200);
    expect(first.body.nextCursor).not.toBeNull();
    expect(second.body.count).toBe(7);
    expect(second.body.nextCursor).toBeNull();
  });

  test("the default page size is 10", async () => {
    await seedUsers(15);
    const res = await me.agent.get("/user/feed").expect(200);
    expect(res.body.count).toBe(10);
  });

  test("hides me and everyone I share a request with, in either direction", async () => {
    const seeds = await seedUsers(5);
    const bob = await h.registerAndLogin(app, "Bob");
    await me.agent.post(`/request/send/ignored/${seeds[0].id}`).expect(201);
    await me.agent.post(`/request/send/interested/${seeds[1].id}`).expect(201);
    await bob.agent.post(`/request/send/interested/${me.id}`).expect(201);

    const res = await me.agent.get("/user/feed?limit=50").expect(200);
    const shown = res.body.users.map((u) => u.id);
    expect(shown).not.toContain(me.id);
    expect(shown).not.toContain(seeds[0].id);
    expect(shown).not.toContain(seeds[1].id);
    expect(shown).not.toContain(bob.id);
    expect(shown).toHaveLength(3); // seeds 3, 4 and 5
  });

  test("swiping on a whole page does not skip or repeat anyone on the next page", async () => {
    await seedUsers(9);
    const first = await me.agent.get("/user/feed?limit=3").expect(200);
    const second = await me.agent.get(`/user/feed?limit=3&cursor=${first.body.nextCursor}`).expect(200);

    for (const u of first.body.users) await me.agent.post(`/request/send/ignored/${u.id}`).expect(201);

    const fresh = await me.agent.get("/user/feed?limit=3").expect(200);
    expect(fresh.body.users.map((u) => u.id)).toEqual(second.body.users.map((u) => u.id));
  });

  test("never includes anyone's email", async () => {
    await seedUsers(3);
    const res = await me.agent.get("/user/feed").expect(200);
    expect(JSON.stringify(res.body)).not.toMatch(/emailId|@example\.com/);
  });

  test("a cursor older than every user gives an empty last page", async () => {
    await seedUsers(3);
    const res = await me.agent.get("/user/feed?cursor=000000000000000000000000").expect(200);
    expect(res.body).toMatchObject({ count: 0, users: [], nextCursor: null });
  });

  test.each([
    "limit=0",
    "limit=51",
    "limit=abc",
    "limit=5.5",
    "limit=",
    "limit=1&limit=2",
    "limit[$gt]=0",
    "cursor=abc",
    "cursor[$ne]=x",
    "cursor=000000000000000000000000x",
  ])("rejects ?%s with 400", async (query) => {
    await me.agent.get(`/user/feed?${query}`).expect(400);
  });

  test("needs a login", async () => {
    await require("supertest")(app).get("/user/feed").expect(401);
  });
});

describe("request and connection lists", () => {
  test("received requests are paginated", async () => {
    const senders = [];
    for (const name of ["Ann", "Ben", "Cat"]) senders.push(await h.registerAndLogin(app, name));
    for (const s of senders) await s.agent.post(`/request/send/interested/${me.id}`).expect(201);

    const first = await me.agent.get("/user/requests/received?limit=2").expect(200);
    expect(first.body.count).toBe(2);
    expect(first.body.nextCursor).not.toBeNull();
    const second = await me.agent.get(`/user/requests/received?limit=2&cursor=${first.body.nextCursor}`).expect(200);
    expect(second.body.count).toBe(1);
    expect(second.body.nextCursor).toBeNull();
  });

  test("connections are paginated", async () => {
    const others = [];
    for (const name of ["Ann", "Ben"]) others.push(await h.registerAndLogin(app, name));
    for (const o of others) {
      const sent = await me.agent.post(`/request/send/interested/${o.id}`).expect(201);
      await o.agent.post(`/request/review/accepted/${sent.body.request.id}`).expect(200);
    }
    const first = await me.agent.get("/user/connections?limit=1").expect(200);
    expect(first.body.count).toBe(1);
    const second = await me.agent.get(`/user/connections?limit=1&cursor=${first.body.nextCursor}`).expect(200);
    expect(second.body.count).toBe(1);
    expect(second.body.nextCursor).toBeNull();
  });
});