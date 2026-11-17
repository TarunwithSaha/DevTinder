## Part 1: Setup and authentication

### Q1. Why hash passwords with bcrypt instead of encrypting them or using plain SHA-256? What does the salt do?

Encryption is reversible. If the database and the key are both stolen, every password can be read back, and the server itself needs the key, so it can always recover the plaintext. A password should never be recoverable, only checkable. A hash is one-way: the server stores the hash and, at login, hashes the attempt and compares.

Plain SHA-256 is one-way but built to be fast. A GPU can try billions of SHA-256 guesses per second, so a stolen database of SHA-256 hashes can be cracked quickly with a dictionary of common passwords. bcrypt is deliberately slow and has an adjustable cost factor. I used 10, which means 2^10 rounds. That makes each guess expensive, and the cost can be raised as hardware gets faster.

The salt is a random value generated for each password and stored inside the hash string itself. In my database the hash starts with `$2a$10$`, which encodes the algorithm, the cost and then the salt. Because each password has its own salt:
- Two users with the same password get different hashes, so one cracked hash doesn't reveal the others.
- Precomputed tables of hashes (rainbow tables) are useless, since an attacker would need a separate table for every salt.

bcrypt only uses the first 72 bytes of a password, which is why `validation.js` rejects passwords longer than 72 characters.

### Q2. Why put the JWT in an httpOnly cookie instead of `localStorage`? What do `sameSite` and `secure` add?

Anything in `localStorage` can be read by any JavaScript running on the page. If an attacker injects a script (XSS), it can read the token and send it to their own server, and then they can use my session from anywhere. A cookie marked `httpOnly` cannot be read by JavaScript at all. In my test, `cat cookies.txt` showed the cookie on a line starting with `#HttpOnly_localhost`, which is curl marking exactly this flag. The browser attaches the cookie to requests automatically, but page scripts cannot see it.

The trade-off is that cookies are sent automatically, which opens the door to CSRF, where another site makes my browser send a request with my cookie. `sameSite: "lax"` stops the browser from sending the cookie on cross-site POST requests, which blocks the usual CSRF attack. `secure: true` makes the browser send the cookie only over HTTPS so it can't be sniffed on the network. I turn it on only when `NODE_ENV` is `production`, because local development runs over plain HTTP and the cookie would never be sent.

httpOnly doesn't make XSS harmless: a malicious script can still make requests as the user while the page is open. It only stops the token itself from being stolen and reused elsewhere.

The token is signed, not encrypted. Decoding the middle part of my token gave `{"id":"6afaa6f70624d737e5bb8fe1","iat":1794811957,"exp":1795416757}`. Anyone can read it, but nobody can change it without the secret. `exp` minus `iat` is 604,800 seconds, exactly 7 days, which matches `expiresIn: "7d"`. Nothing sensitive goes into the payload.

### Q3. Why return the same "Invalid credentials" message for an unknown email and a wrong password, and what does `DUMMY_HASH` fix?

If the server said "no such user" for one case and "wrong password" for the other, an attacker could try many emails and learn which ones are registered (user enumeration), then focus password guessing on real accounts. In my test, both a wrong password for `tarun@example.com` and an unknown `nobody@example.com` returned exactly `{"error":"Invalid credentials"}` with HTTP 401.

The message alone isn't enough, because of timing. A bcrypt comparison takes tens of milliseconds. If the code returned immediately for an unknown email without hashing anything, that case would respond much faster than a wrong password, and the attacker could tell them apart by measuring response time. `DUMMY_HASH` fixes this: when the user doesn't exist, the code still runs `bcrypt.compare` against a throwaway hash computed at startup, so both paths do the same expensive work and take about the same time.

Timing check: /health took 1.1 ms and one bcrypt compare took 88.6 ms. In 10 alternating
pairs, a wrong password on a real account averaged 0.722 s and an unknown email averaged
0.695 s. The 27 ms gap is under a third of one bcrypt compare, so the dummy hash keeps
both paths doing the same expensive work. The sample is small and network noise is much
larger than the effect, so this shows no leak as big as a skipped bcrypt compare but does
not prove identical timing. Most of the ~700 ms is the Codespace-to-Atlas round trip,
which both paths share.


### Q4. What attack does the `typeof` check stop? Use the `{"$ne":null}` test result.

This is NoSQL injection. `express.json()` happily parses a body like `{"emailId":{"$ne":null},"password":"x"}`, so `emailId` arrives as an object and not a string. If that object went straight into `User.findOne({ emailId })`, MongoDB would read `{"$ne": null}` as an operator meaning "email not equal to null", which matches any user. In apps that put both email and password into the query filter, that's a full login bypass.

My check rejects anything that isn't a string before it reaches the query. When I sent that body to `/login`, I got `{"error":"A valid email is required"}` with HTTP 400, so the query never ran.

To be accurate about this app: even without the check, login would still have failed here, because the password is verified with `bcrypt.compare` and not inside the database filter. So in this code the check is defense in depth, not the only barrier. It also prevents a 500 error, because `validator.isEmail` throws on non-strings. In code that queries by password or by other user-supplied fields, the same missing check would be a serious hole.

### Evidence from my runs

- Server: `Database connected`, `Server listening on port 3000`. `GET /health` returned 200.
- Signup returned 201 with an `id`, and no password field in the response.
- Rejections: duplicate email 409, weak password 400, invalid email 400, malformed JSON 400.
- Both bad-login cases returned the identical 401 `Invalid credentials` message. The `$ne` injection returned 400.
- Login returned 200 and set an httpOnly cookie. `/profile` returned 200 with the cookie, 401 `Please log in` with none, and 401 `Session is invalid or expired` with a fake token.
- Logout returned 200, and `/profile` returned 401 afterwards.
- [fill in: the Atlas document for my user, `password` starting with `$2a$10$`]

### Limitations

- Logout only clears the cookie. A token that was already copied stays valid until it expires, because JWTs aren't revoked server-side. A token blocklist or short-lived access tokens with refresh tokens would fix that.
- `/login` has no rate limiting yet, so password guessing isn't throttled. Planned for Part 5.
- Signup returns "Email is already registered", which does reveal that an email exists. Login avoids this leak, but signup trades privacy for usability.

######################################################################

## Part 2: Profiles and the connection request model

### Q1. Why an allowed-fields list that rejects unknown fields, instead of passing `req.body` to the model? What would `{"emailId":"hacker@example.com"}` have done without it?

Passing `req.body` straight to the model is called mass assignment. The client decides which fields change, so any field the model has becomes editable by anyone logged in. My route only accepts the names in `EDITABLE_FIELDS` and rejects the whole request if any other key is present.

What the three attack requests would have done without the list:
- `{"emailId":"hacker@example.com"}` would have replaced my account's email. Email is the account's identity, so I could claim an address I don't own, and any later feature built on email (password reset, verification) would trust it. The unique index would only stop me from taking an address that is already registered.
- `{"password":"hacked"}` would have been stored as plain text. Hashing happens in my service code, not in the schema, so the model would have saved whatever string it received. That gives a plaintext password in the database, and I would be locked out, since `bcrypt.compare` against a non-hash fails.
- `{"firstName":"Hacker","isAdmin":true}`: in this app, Mongoose's strict mode would silently drop `isAdmin`, because the schema has no such field. That protection is accidental. The day someone adds a `role` or `isAdmin` field, the same request would become privilege escalation, so the allowlist is what keeps it safe.

My step 5 results: all three returned HTTP 400 with `These fields cannot be edited: emailId` (and `password`, `isAdmin`). Step 7 then showed the profile unchanged. The `isAdmin` request had a valid `firstName` in it, and nothing was applied, because the whole request was rejected and not partly applied.

Rejecting is better than silently ignoring unknown fields. A client that sends a wrong field name finds out immediately, and attacks leave an obvious trace.

An allowlist is better than a blocklist (listing the forbidden fields), because a blocklist fails open: any new sensitive field is editable until someone remembers to add it. An allowlist fails closed.

The same route also type-checks each field (`age` must be a number, so `"21"` is rejected), caps lengths, removes duplicate skills (`node.js` collapsed into `Node.js`), and allows only `http` and `https` photo URLs (so `javascript:alert(1)` was rejected).

### Q2. Why edit with `set()` and `save()` instead of `findByIdAndUpdate`?

`findByIdAndUpdate` sends the update straight to MongoDB and skips most of Mongoose's document logic:
- **Validators don't run by default.** They run only if I pass `runValidators: true`, and it's easy to forget.
- **Update validators behave differently.** In a custom validator, `this` is the query and not the document, so a cross-field rule like my "toUserId must not equal fromUserId" can't be written the same way (the `ConnectionRequest` model relies on this).
- **Document middleware doesn't run.** `pre("save")` hooks never fire for update queries.

With `set()` and `save()`, Mongoose applies the changes to a real document, validates the final state against the whole schema, runs the hooks, and writes only the modified fields. I then return the saved document, so the response is exactly what is stored.

It costs nothing extra here, because `requireAuth` already loaded the user, so `req.user` is a document. There's no second read. The one downside is a lost-update race: if two edits change the same field at the same moment, the last write wins. For a personal profile that's acceptable, and for something like a balance I'd use an atomic update with a condition.

### Q3. Why a unique compound index when the code could check for an existing request first?

A check followed by an insert has a race window. If A's request is sent twice at nearly the same moment (a double click, a retry), both requests can run the check before either has inserted. Both see "no existing request", both insert, and I end up with two rows. The check and the insert are two separate steps, and the database can interleave other requests between them.

A unique index is enforced inside the database as part of the insert itself, so there's no gap. One insert wins and the other fails with error code 11000, even if both arrive in the same instant. In my model check, the second A to B request was rejected with `code 11000`.

So the right design uses both: the pre-check in the service gives a friendly message in the normal case, and the index guarantees correctness in the racing case.

Two follow-ups I noted:
- The index blocks A to B twice but not B to A after A to B. My script printed `PASS reverse request B->A is NOT blocked by the index`, which shows the gap. Part 3's service must check both directions. Two users sending to each other at exactly the same moment could still slip through, and fully closing that would take a canonical pair key (for example the two ids sorted) with its own unique index.
- My error handler currently maps code 11000 to "Email is already registered". For a duplicate request that message would be wrong, so Part 3 has to catch 11000 in the request service and return a proper message.

### Q4. Why add a second index on `{ toUserId, status }`, and which query does it serve?

MongoDB answers a query by scanning the whole collection unless an index fits it. The common question in this app is "which requests were sent to me, with status X?", meaning find where `toUserId` is me and `status` is `interested`. That is the pending-requests screen, and it will also serve the accepted-connections list (where I'm the receiver). The index stores requests ordered first by receiver and then by status, so MongoDB jumps straight to my entries. Without it, every such call would be O(n) over all requests in the system, getting slower as the app grows.

The unique index on `(fromUserId, toUserId)` already serves "requests I sent", because `fromUserId` is its first field (a compound index can answer queries on its leading fields). That leaves `toUserId` queries uncovered, which is the gap the second index fills. Together they will also help the Part 4 feed, which needs everyone I've interacted with in either direction.

The order matters: `toUserId` is first because queries always specify it, and `status` second so it can narrow further. A query filtering only on `status` couldn't use this index well. The cost is slightly slower writes and extra storage for every insert, which is a good trade for a read-heavy screen.

### Evidence from my runs

- Edit with valid data returned 200, and the duplicate skill `node.js` was dropped: `["C++","Node.js","MongoDB"]`. The data persisted on the next view.
- Rejected edits (all 400): `emailId`, `password` and `isAdmin` not editable, empty body, age 17, age `"21"`, gender `robot`, `javascript:` photo URL, skills as a string, 11 skills. Not logged in gave 401. Afterwards the profile was unchanged.
- Password change: wrong current password 400, weak new password 400, same password 400, then 200. The old password returned 401 on login and the new one returned 200. I changed it.

######################################################################

## Part 3: Connection request flow

### Q1. Why is the review a single `findOneAndUpdate` with the status in the filter, instead of reading the request, checking it, and calling `save()`? Use your test 10 result.

Read, check, then save is three steps, and other requests can run between them. If two reviews arrive at the same moment (Bob taps Accept in one tab and Reject in another, or a client retries), both read the request while it is still `interested`, both pass the check, and both write. The last write wins, both callers are told "success", and the final state can disagree with the response one of them received. By default, Mongoose's `save()` also doesn't detect this: for a plain field change it sends an update filtered only by `_id`, so it overwrites silently.

My version puts the rule in the database operation. The filter is `{ _id, toUserId: me, status: "interested" }`, and the update sets the new status. MongoDB applies a single-document update atomically, so checking the filter and changing the status are one indivisible step. Once one update has moved the status away from `interested`, every other update's filter no longer matches, and it returns `null`. The code then reads the document only to choose an error message and returns 409. That follow-up read can't change any data, so it doesn't need to be atomic.

Test 10 sent 10 reviews at the same moment on Carol's request, five `accepted` and five `rejected`. Result: exactly one `200` and nine `409`. Afterwards Bob's connections listed Carol, so `accepted` had won, which matches the one request that got a success response. Ownership (`toUserId: me`) sits in the same filter, so authorization is checked atomically too, and the whole thing costs one database round trip.

### Q2. Why does reviewing someone else's request, or an `ignored` one, return 404 and not 403 or 409? What would leak otherwise?

A 403 ("exists, but not yours") or a different message for an ignored request would tell the caller something they shouldn't know. A 404 makes "doesn't exist", "isn't yours" and "was ignored" look identical.

- **Someone else's request:** request ids are MongoDB ObjectIds, which contain a timestamp and counter and are not secret. If a 403 existed, anyone could probe ids and learn which ones are real requests. With 404, probing reveals nothing. In test 6, Tarun trying to review his own request to Bob got `404 Request not found`, the same answer as a nonexistent id.
- **An ignored request:** an `ignored` request is a private swipe. If reviewing it returned 409 ("already ignored"), the person who was ignored could discover that someone swiped past them. In test 6, Carol reviewing the request Tarun had ignored got `404 Request not found`. Test 5 showed the other half of the same rule: Carol's received list had `count: 0`, because ignores never appear to the other side.

The 409 is reserved for cases where telling the caller is harmless. If Bob's own request is already `accepted` or `rejected`, he made that decision himself (test 7 returned `This request was already accepted`).

### Q3. The send route checks for an existing request first and also relies on the unique index. What does each handle? Use your test 3 and test 9 results.

**The pre-check** handles the normal, one-at-a-time case with a clear message, and it covers things the index can't:
- It checks both directions. The unique index only matches the same sender and receiver, so Bob sending to Tarun after Tarun sent to Bob is a different pair as far as the index is concerned. In test 3, Bob's request got `409 A request between you and this user already exists`, which only the pre-check could produce.
- That message is deliberately vague, so Bob can't tell whether Tarun showed interest or ignored him.
- It also validates before inserting: no self-requests (`400`), target must exist (`404`), valid id format (`400`), valid status (`400`).

**The unique index** handles concurrency. The check followed by the insert has a gap: ten identical sends can all pass the check before any insert finishes. The index is enforced inside the insert itself, so one insert wins and the rest fail with error code 11000. The service turns that into the same clean 409 and no 500 is ever returned. Test 9 sent 10 identical requests from Carol to Bob at the same moment: exactly one `201` and nine `409`, and Bob's received list showed a single request from Carol.

One honest limit of that evidence: both layers answer with the same 409 and the same message, so the status codes alone don't show which layer rejected which request. 

### Q4. Which race is still not closed by the code, and how would you close it?

Two users sending to each other at the same instant. If A sends to B while B sends to A, both pre-checks find nothing, and both inserts pass the unique index, because (A, B) and (B, A) are different pairs. The result is two rows for one pair, which can leave the app in an inconsistent state: both users pending, neither seeing a match, or an accept applied to one row while the other stays open. The Part 2 model check showed the index doesn't block the reverse direction. I have not reproduced this race through the API, because the timing window is tiny. This is reasoned from the code and the index definition.

The fix is a canonical pair key. Add a `pairKey` field set to the two user ids sorted and joined, for example the smaller id, an underscore, then the larger id, so A to B and B to A produce the same key. Put a unique index on `pairKey`. The database then rejects the second insert whatever the direction, and the existing 11000 handling turns it into a 409. The trade-offs: it needs a backfill for existing rows before the index can be created (existing duplicates would make index creation fail), and a pair can then have only one request row, so the "who sent it" information must stay in `fromUserId` and `toUserId`.

Smaller gaps I noticed: the "target exists" check and the insert aren't atomic, so a user deleted in between could leave an orphaned request (the list code skips such rows). There's also no way to change a decision. An ignored user can't later be marked interested, and an accepted connection can't be removed.

### Evidence from my runs

- Send: `201` for a valid request. Rejections: duplicate `409`, reverse direction `409`, self `400`, unknown user `404`, bad id `400`, bad status `400`, not logged in `401`.
- Privacy: Carol's received list was empty after being ignored. Bob's received list showed Tarun's card (name, age, about, skills, photo) with no `emailId`.
- Review: Carol (not the receiver) got `404`, Tarun (the sender) got `404`, an invalid status gave `400`, a bad id gave `400`. Bob accepted with `200`, then two further attempts, accept again and reject, both returned `409`.
- Connections: Tarun saw Bob and Bob saw Tarun, each seeing the other person's card with no email.
- Race test 9 (10 simultaneous sends): 1 x `201`, 9 x `409`, one request in Bob's list.
- Race test 10 (10 simultaneous reviews, accept vs reject): 1 x `200`, 9 x `409`. Carol ended up in Bob's connections, so accepted won.

### Limitations

- Opposite-direction simultaneous sends can still create two rows (Q4).
- Decisions are final: no un-ignore, no removing a connection.
- Lists are capped at 100 and aren't paginated yet .
- No rate limiting on sending requests .

######################################################################

## Part 4: Feed, pagination and error handling

### Q1. Why cursor pagination and not `skip`/`limit`? What happens to someone walking pages of a feed that changes while they swipe?

`skip(n)` means "ignore the first n results of the query as it is right now". The feed isn't a fixed list. Every swipe removes that person from it, and new signups appear at the top, because the feed is newest first. So "the first n" keeps changing under the reader.

- **Swiping removes rows, so skip jumps over people.** Say page 1 shows users 1 to 7 and I swipe on all seven. They leave the feed, so old user 8 is now first. Page 2 with `skip=7` then skips old users 8 to 14, and I never see them.
- **New signups add rows, so skip repeats people.** If three users join at the top while I read page 1, everything shifts down by three, and `skip=7` shows the last three people of page 1 again.
- **Cost.** MongoDB has to walk past every skipped row. The feed query also filters with `$nin`, so deep pages get slower and slower.

A cursor anchors to a position and not a count. My query asks for `_id < lastSeenId`, sorted by `_id` descending. Removing someone doesn't move that position, and new signups have larger ids, so they sit above the cursor and can't appear in a later page. There are no gaps and no repeats, and the `_id` index makes every page equally cheap. `_id` is also unique, so the order never ties. A sort on something like `createdAt` could produce equal values and break the cursor.

Tests 5 and 7 check this from two sides. Test 5 walks the whole feed with `limit=7` and counts the ids and the duplicates, so it catches any gap or repeat in a static feed. Test 7 swipes on someone and confirms they disappear from the feed, which is the "feed changes while you swipe" situation that makes skip unsafe.

### Q2. Why fetch `limit + 1` rows? Why must `nextCursor` be the last returned row's id and not the extra row's id?

The extra row answers "is there another page?" without a second `count` query. A count would cost another round trip and could disagree with the data if the feed changed in between. If `limit + 1` rows come back, there is more, and I return only `limit` of them. If I fetched exactly `limit` rows, I couldn't tell "this was the last page" from "this page is full". I would either need a count or I'd end with an empty last page. With the extra row, a full last page correctly gets `nextCursor: null`.

The cursor must be the id of the last row I actually returned, because the next request uses a strict `$lt` ("older than the cursor"):
- Cursor = id of the last returned row: the next page starts with the extra row, which is the very next person.
- Cursor = id of the extra row: `$lt` excludes it, so that person is never shown, at every page boundary.

So with the wrong cursor, a feed of 25 users read 7 at a time would lose one person at each of the 3 page boundaries and show only 22. The page-walk test in test 5 exists to catch exactly that kind of loss. It counts ids across all pages and expects every user exactly once.

### Q3. What would `?cursor[$ne]=x` have done without the string check? Why must `limit` be checked too?

Express's query parser turns `cursor[$ne]=x` into an object, `{ cursor: { $ne: "x" } }`, and `?limit=1&limit=2` into an array. If that object reached the query, my filter would become `_id: { $lt: { $ne: "x" } }`, a client-supplied operator inside a database filter. That is NoSQL injection, the same family as the `{"$ne":null}` login attack from Part 1.

To be precise about this code: `_id` is an ObjectId path, so Mongoose would most likely try to cast the object to an ObjectId, fail with a `CastError`, and return a 400 through my handler. I haven't tested that by removing the check, so I won't claim it as fact. I wouldn't rely on it, because the protection would be an accident of casting. The same value in an aggregation, a `.lean()` raw query, or a string-typed field isn't cast, and an operator object there is taken literally. So my check allows only a plain string of exactly 24 hex characters, and anything else is rejected before a query exists.

Test 6 sends ten bad values (`limit=0`, `51`, `abc`, `5.5`, empty, repeated, `limit[$gt]=0`, `cursor=abc`, `cursor[$ne]=x`, and a 25-character cursor) and expects every one to come back as a 400. It also checks that a correctly formatted but unmatched cursor (`000000000000000000000000`) gets a normal empty page, because nothing is older than the smallest possible id.

`limit` needs a check because it sets how much work one request can cause:
- With no upper bound, `limit=1000000` would load a million documents into memory, so a single request could slow the server for everyone.
- `limit=abc` becomes `NaN`, and `limit[$gt]=0` or a repeated parameter isn't a number at all, so the query would error or misbehave.
- In MongoDB `limit(0)` means "no limit", and a negative limit has its own odd meaning. A client controlling the number could use those special values.

So `limit` must match `^\d{1,3}$`, be between 1 and 50, and default to 10.

### Q4. The feed hides people in both directions. What does test 8 show about what I can work out about other users, and how can the leak be closed?

The feed hides everyone I share a request with, whoever sent it and whatever its status. That includes people who ignored me. Test 8 makes a seed user ignore Tarun and then checks Tarun's feed and received list. The feed no longer shows that user, and the received list doesn't either, because ignores are never shown to the person who was ignored.

That gap is a signal. Someone who vanished from my feed, whom I didn't swipe on, and who isn't in my received list or connections, can only be a person who ignored me. A user who compares two snapshots of their feed could read other people's private swipes. So the Part 3 promise that an ignore is invisible to the other person is broken by the feed.

The send route has the same leak. If Bob tries to send to Tarun after Tarun ignored him, Bob gets `409 A request between you and this user already exists`. My Part 3 note said that message was vague so Bob couldn't tell interest from an ignore. That only hides the type of request. An interested request would show up in Bob's received list, so a 409 with nothing in that list still implies an ignore.

How to close it:
1. **Feed:** hide only people I have swiped on, people I'm connected to, and people who sent me a visible request. Keep people who ignored me in my feed as if nothing happened.
2. **Send:** when I swipe on someone who ignored me, return a normal success and not a 409.
3. **Data model:** this works properly if each direction is its own independent record (a `swipes` collection keyed by sender and receiver) and a connection exists only when both directions are `interested`. It would also close the opposite-direction race from Part 3, because A to B and B to A become separate rows and a match is computed from the pair. The costs are a data-model change, a changed review flow, and a migration of existing requests.

Weaker signals such as response timing and sizes remain, but the feed disappearance is the clear one.

### What I ran and what I learned

- `scripts/seed-users.js` creates 25 fake users and `--clean` removes them and their requests, so the feed has people to show.
- The three-user shell loop failed the first time with `bash: !Pass#1\: event not found`, followed by three `401` responses. Bash expands `!` inside double quotes, so the login JSON was mangled, no cookie was saved, and the follow-up requests were unauthenticated. Rerunning with the JSON in single quotes fixed it. Lesson: a password containing `!` has to go in single quotes in shell commands.
- The feed excludes me and everyone I share a request with, uses cursor pagination with `limit + 1`, returns cards without `emailId`, and validates every query parameter as a plain string in a fixed format.
- The two Part 3 lists use the same pagination, sorted by `_id` so the cursor is stable.
- `server.js` now handles SIGINT and SIGTERM by closing the server and the database, and exits on unhandled errors so a supervisor can restart a clean process.

### Limitations

- The `$nin` list grows with every interaction. It's fine for thousands of users, but it becomes slow and eventually hits MongoDB's document size limit. A production feed would use an aggregation with a join or a precomputed "seen" set.
- Ordering is by account age, so there is no ranking by shared skills.
- The ignore leak described above is still open.
- Connections are ordered by when the request was created, not when it was accepted, because the cursor needs a unique, stable sort key.

#####################################################################################################

## Part 5: Tests, rate limiting, security headers, docs and CI

### Q1. Why test against an in-memory MongoDB and not mock the database? What would the race tests have proven with a mock?

A mock replaces the database with code I write, so it can only confirm my own assumptions about how MongoDB behaves. The behaviors this project depends on are exactly the ones a mock would fake:
- **Unique indexes.** A mock returns whatever I tell it to, so a duplicate insert would never fail with error code 11000 unless I programmed that in.
- **Atomic updates.** `findOneAndUpdate` with a filter is atomic inside MongoDB. A mock just returns a value, so there is no atomicity to test.
- **Schema rules.** Validators, casting an invalid id into a `CastError`, `select: false` on the password and `populate` all live in Mongoose and the database.

With a mock, the race tests would have proven nothing. "Ten identical sends create one request" would pass or fail according to how I wrote the mock, and could never fail because of a real concurrency bug.

`mongodb-memory-server` starts a real MongoDB process in memory. The tests build the real indexes (`Model.init()` in `helpers.js`), wipe the data between tests while keeping the indexes, and talk to the actual engine. The costs are a slower suite (about 30 seconds locally, and a first-run download of the MongoDB binary) and a limit on realism: it is a single in-memory server, not Atlas, so it has no network latency, no replica set and no cluster behavior. GitHub Actions ran the whole suite in 42 seconds.

### Q2. What do the two "ten at the same moment" tests prove, and what can they not prove? What happened when I removed the status from the review filter?

**What they prove:** the requests are sent together (`Promise.all`) to one app instance, so they interleave on the event loop and reach the real database at overlapping times. With the code as written, ten identical sends produced one `201` and nine `409`, with exactly one row stored. Ten competing accept and reject reviews produced exactly one `200` and nine `409`, and the stored status matched the one response that said success. Those are the intended guarantees from the unique index and the conditional atomic update.

**What they cannot prove:**
- A passing race test cannot prove there is no race. Timing can hide a bug on one run. A failing run proves a bug, but a passing one only shows that this run did not hit it.
- The two layers give the same answer. In the duplicate-send test, both the pre-check and the unique index return the same 409, so the test cannot tell which layer rejected a request.
- It covers one Node process against one database. It does not cover several server instances, although the atomicity lives in MongoDB, so it should hold there too.
- It doesn't cover the opposite-direction race (A and B sending to each other at the same instant), which is a known open limitation.

**Break-on-purpose result:** I removed `status: "interested"` from the review filter and ran `tests/connections.test.js`. Three tests failed and 14 passed:
- "an ignored request cannot be reviewed" got `200` where it expected `404`.
- "a decision is final" got `200` where it expected `409`.
- The race test received 10 successful reviews where it expected 1 (`Expected length: 1, Received length: 10`).

After restoring the line, all 17 tests passed again.

An honest reading: that mutation breaks the rule even when requests come one at a time, which is why the sequential tests failed too. So this experiment shows the suite catches that bug, but it does not show that the race test alone detects a concurrency-only bug. A stronger check would be to replace the atomic update with read, check, then `save()`: it passes every sequential test and can only fail under concurrency.

One lesson from the commit: my edit left a commented-out copy of the bug in the committed file. `git status` only lists changed files, so it didn't show it. `git diff` showed it, and I removed it in a follow-up commit. From now on I run `git diff --staged` before committing.

### Q3. Why does the login limiter count only failed attempts, and what are the limits of an in-memory, per-IP limiter?

The limiter uses `skipSuccessfulRequests: true`, so only failed attempts use up the budget. A normal user who logs in correctly is never locked out, while someone guessing passwords burns through the limit quickly. The tests confirm both sides: with a limit of 3, three wrong passwords were rejected with `401`, the fourth got `429`, and even the correct password got `429` while the limit was active. Six successful logins in a row with the same limit all returned `200`. By hand, with the real limit of 10 per 15 minutes, twelve wrong logins gave ten `401`s and then `429 429`.

Limits of this design:
- **Per IP, not per account.** An attacker with many IP addresses can spread guesses and stay under the limit, and many honest users behind one shared address (an office or a campus) share one budget. Limiting per account would stop distributed guessing but lets anyone lock a victim out by failing on purpose.
- **In memory.** The counters reset when the server restarts, and each server instance keeps its own, so N instances allow N times the limit. A shared store such as Redis fixes both.
- **`TRUST_PROXY` has to be right.** Behind a hosting proxy, the real client is in the `X-Forwarded-For` header. If Express doesn't trust the proxy, every request appears to come from the proxy's address, so all users share one budget. In Codespaces I saw exactly this: `express-rate-limit` logged `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR`. If I trust the header when no proxy exists, or trust too many hops, a client can invent that header and rotate fake addresses to dodge the limit. So the setting must equal the real number of proxies in front of the app: `1` on Render, unset locally.

### Q4. Name differences between my development and production setups, and why each matters.

1. **`JWT_SECRET`.** Production gets its own newly generated random secret, never reused from development. Whoever knows the secret can forge a login token for any user. Development secrets get printed in terminals and pasted around, so they have to be treated as exposed. If production used the same value, a development leak would compromise the live app.
2. **Database user and database.** Production uses a separate Atlas user with `readWrite` on only the `devtinder_prod` database, instead of the development user on `devtinder`. Tests, the seed script and its `--clean` option can never touch real data, and a leaked development credential cannot read or delete production.
3. **Cookie flags (`NODE_ENV=production`).** In production the login cookie is marked `Secure`, so the browser sends it only over HTTPS and it cannot be read on a plain-HTTP network. It stays off in development, because the cookie would never be sent to `http://localhost`. `httpOnly` and `sameSite: "lax"` are on in both.
4. **`TRUST_PROXY=1`.** Needed behind the hosting proxy so the rate limiter sees real client addresses (see Q3). Leaving it off locally avoids trusting a header nobody should be setting.
5. **Network access to the database.** In development, Atlas allows access from anywhere (`0.0.0.0/0`), because Codespaces addresses change. That is only acceptable with a strong password and no sensitive data. A hosting platform without a fixed outbound address has the same constraint, so the database password and the user's privileges are what protect the data, and the least-privilege user in point 2 matters even more.

### Evidence from my runs

- `npm test`: 5 suites passed, 87 tests passed.
- Coverage: 93.56% statements, 84.03% branches, 96.61% functions, 94.3% lines. The gaps are `src/config/database.js` (0%, because the tests connect to the in-memory database directly and never run the real startup code), `errorHandler.js` (78.57% statements) and `profileValidation.js` (83.33% statements).
- GitHub Actions: workflow `tests`, run #1 on commit `ba0cb2a`, green, 42 seconds.
- Response headers on `/health` include `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff` and `X-Frame-Options`, and `X-Powered-By` is absent.
- Login rate limit: ten `401` responses and then `429 429`.
- The rate limiter logged `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` in Codespaces until `TRUST_PROXY` was set to `1`.

### Limitations

- The rate limiter is per IP and in memory (Q3).
- Race tests cannot prove the absence of a race (Q2). The opposite-direction send race is still open.
- `database.js` and some error branches are not covered by tests.
- A stolen token stays valid until it expires, even after a password change.