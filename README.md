# DevTinder API

https://devtinder-65a9.onrender.com/

A backend for a developer matchmaking app, built with Node.js, Express and MongoDB. Users sign up, build a profile, browse a feed of other developers, send interest or skip, and connect when the other person accepts.

## Features

- **Authentication:** bcrypt password hashing, JWT in an httpOnly cookie, and the same error for an unknown email and a wrong password. Both paths run a bcrypt comparison (a dummy hash when the email does not exist), so they do the same slow work.
- **Profiles:** edits go through an allowlist of fields. Any other field rejects the whole request, so a client cannot change its email or inject new fields.
- **Connection requests:** send interested or ignored, then accept or reject. Review is one atomic database update, so simultaneous reviews cannot both succeed. A unique index stops duplicate sends even when they arrive at the same moment.
- **Feed:** everyone you have not interacted with, newest first, with cursor pagination so nobody is skipped or repeated while you swipe.
- **Privacy:** other users appear only as cards without an email, and an ignore is never visible to the person ignored.
- **Security:** input type checks against NoSQL injection, rate limits, helmet security headers, a request size limit, and no internal error details in responses.
- **Operations:** graceful shutdown, fail-fast on unexpected errors, and OpenAPI docs served at `/docs`.

## Tech stack

Node.js 20+, Express 4, MongoDB with Mongoose, Jest, Supertest, mongodb-memory-server, helmet, express-rate-limit, Swagger UI, GitHub Actions.

## Run locally

```bash
npm install
cp .env.example .env     # then fill in MONGODB_URI and JWT_SECRET
npm run dev
```

Generate a secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

| Variable | Meaning |
|---|---|
| `MONGODB_URI` | MongoDB connection string (an Atlas free cluster works) |
| `JWT_SECRET` | Long random string used to sign login tokens |
| `PORT` | Port to listen on (default 3000) |
| `NODE_ENV` | Set to `production` to mark cookies `Secure` |
| `TRUST_PROXY` | Set to `1` behind one hosting proxy so rate limits see real client IPs |

## Tests

```bash
npm test                 # runs the whole suite against an in-memory MongoDB
npm run test:coverage    # adds a coverage report
```

87 tests across 5 suites, with about 94% line coverage. The tests use a real (in-memory) MongoDB, so unique indexes and atomic updates behave as in production. They include concurrency tests: ten identical sends at once create one request, and ten competing accept and reject reviews produce exactly one winner. GitHub Actions runs the suite on every push.

## API

Interactive docs are served at `/docs`. Authentication is a session cookie set by `POST /login`.

| Method | Path | Description |
|---|---|---|
| POST | `/signup` | Create an account |
| POST | `/login` | Log in |
| POST | `/logout` | Log out |
| GET | `/profile` | Current user |
| GET | `/profile/view` | Your full profile |
| PATCH | `/profile/edit` | Edit allowed fields |
| PATCH | `/profile/password` | Change password |
| POST | `/request/send/:status/:toUserId` | `interested` or `ignored` |
| POST | `/request/review/:status/:requestId` | `accepted` or `rejected` |
| GET | `/user/feed` | People you have not interacted with |
| GET | `/user/requests/received` | Pending requests sent to you |
| GET | `/user/connections` | Your connections |
| GET | `/health` | Health check |

List endpoints take `?limit=1..50` (default 10) and `?cursor=` from the previous response's `nextCursor`.

## Design decisions

- **Layers:** routes, controllers, services and a middleware folder, so business rules can be tested without HTTP.
- **Validation first:** every field is type-checked before it reaches a query or the model.
- **Atomic review:** `findOneAndUpdate` with the ownership and `interested` status in the filter, so the check and the change are a single database operation.
- **Cursor pagination:** the feed changes while the user swipes, so skip-based pages would skip or repeat people.
- **Rate limits:** failed logins and failed password changes are counted and successful ones are not, so normal users are never locked out.

## Known limitations

- Rate-limit counters live in memory, so they reset on restart and are not shared between instances. A shared store such as Redis would fix that.
- A stolen login token stays valid until it expires (7 days), even after a password change.
- A user who ignored you disappears from your feed, which leaks the ignore. Fixing it needs separate records per direction.
- Two users sending to each other at exactly the same instant can create two request records.
- Decisions are final: there is no undo for ignore or for removing a connection.