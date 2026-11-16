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