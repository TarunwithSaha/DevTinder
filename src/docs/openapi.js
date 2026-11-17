const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema) => ({ "application/json": { schema } });
const errorResponse = (description) => ({ description, content: json(ref("Error")) });
const secured = [{ cookieAuth: [] }];

const pageParams = [
  { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50, default: 10 } },
  {
    name: "cursor",
    in: "query",
    description: "The nextCursor value from the previous page",
    schema: { type: "string", pattern: "^[0-9a-fA-F]{24}$" },
  },
];

const idParam = (name, description) => ({
  name,
  in: "path",
  required: true,
  description,
  schema: { type: "string", pattern: "^[0-9a-fA-F]{24}$" },
});

module.exports = {
  openapi: "3.0.3",
  info: {
    title: "DevTinder API",
    version: "1.0.0",
    description:
      "Developer matchmaking backend. Log in with POST /login: the browser keeps the session cookie, so the other endpoints work from this page afterwards.",
  },
  servers: [{ url: "/" }],
  paths: {
    "/health": {
      get: { summary: "Health check", responses: { 200: { description: "Server is up" } } },
    },
    "/signup": {
      post: {
        summary: "Create an account",
        requestBody: { required: true, content: json(ref("SignupBody")) },
        responses: {
          201: { description: "Account created", content: json(ref("UserResponse")) },
          400: errorResponse("Validation failed"),
          409: errorResponse("Email already registered"),
          429: errorResponse("Rate limit exceeded"),
        },
      },
    },
    "/login": {
      post: {
        summary: "Log in (sets an httpOnly cookie)",
        requestBody: { required: true, content: json(ref("LoginBody")) },
        responses: {
          200: { description: "Logged in", content: json(ref("UserResponse")) },
          400: errorResponse("Invalid input"),
          401: errorResponse("Invalid credentials"),
          429: errorResponse("Too many failed attempts"),
        },
      },
    },
    "/logout": {
      post: { summary: "Log out (clears the cookie)", responses: { 200: { description: "Logged out" } } },
    },
    "/profile": {
      get: {
        summary: "Current user",
        security: secured,
        responses: { 200: { description: "OK", content: json(ref("UserResponse")) }, 401: errorResponse("Not logged in") },
      },
    },
    "/profile/view": {
      get: {
        summary: "View your full profile",
        security: secured,
        responses: { 200: { description: "OK", content: json(ref("UserResponse")) }, 401: errorResponse("Not logged in") },
      },
    },
    "/profile/edit": {
      patch: {
        summary: "Edit profile (only the listed fields; any other field is rejected)",
        security: secured,
        requestBody: { required: true, content: json(ref("ProfileEdit")) },
        responses: {
          200: { description: "Updated", content: json(ref("UserResponse")) },
          400: errorResponse("Validation failed or field not editable"),
          401: errorResponse("Not logged in"),
        },
      },
    },
    "/profile/password": {
      patch: {
        summary: "Change password",
        security: secured,
        requestBody: { required: true, content: json(ref("PasswordChange")) },
        responses: {
          200: { description: "Password changed" },
          400: errorResponse("Wrong current password or weak new password"),
          401: errorResponse("Not logged in"),
          429: errorResponse("Too many failed attempts"),
        },
      },
    },
    "/request/send/{status}/{toUserId}": {
      post: {
        summary: "Show interest in someone, or skip them",
        security: secured,
        parameters: [
          { name: "status", in: "path", required: true, schema: { type: "string", enum: ["interested", "ignored"] } },
          idParam("toUserId", "The other user's id"),
        ],
        responses: {
          201: { description: "Recorded", content: json(ref("RequestResponse")) },
          400: errorResponse("Invalid status or id, or request to yourself"),
          401: errorResponse("Not logged in"),
          404: errorResponse("User not found"),
          409: errorResponse("A request between you already exists"),
        },
      },
    },
    "/request/review/{status}/{requestId}": {
      post: {
        summary: "Accept or reject a request sent to you",
        security: secured,
        parameters: [
          { name: "status", in: "path", required: true, schema: { type: "string", enum: ["accepted", "rejected"] } },
          idParam("requestId", "The request id"),
        ],
        responses: {
          200: { description: "Updated", content: json(ref("RequestResponse")) },
          400: errorResponse("Invalid status or id"),
          401: errorResponse("Not logged in"),
          404: errorResponse("No such request for you"),
          409: errorResponse("Already decided"),
        },
      },
    },
    "/user/feed": {
      get: {
        summary: "People you have not interacted with, newest first",
        security: secured,
        parameters: pageParams,
        responses: { 200: { description: "A page of cards", content: json(ref("FeedResponse")) }, 400: errorResponse("Bad limit or cursor") },
      },
    },
    "/user/requests/received": {
      get: {
        summary: "Pending requests sent to you",
        security: secured,
        parameters: pageParams,
        responses: { 200: { description: "A page of requests" }, 400: errorResponse("Bad limit or cursor") },
      },
    },
    "/user/connections": {
      get: {
        summary: "Your accepted connections",
        security: secured,
        parameters: pageParams,
        responses: { 200: { description: "A page of connections" }, 400: errorResponse("Bad limit or cursor") },
      },
    },
  },
  components: {
    securitySchemes: { cookieAuth: { type: "apiKey", in: "cookie", name: "token" } },
    schemas: {
      Error: { type: "object", properties: { error: { type: "string" } } },
      SignupBody: {
        type: "object",
        required: ["firstName", "emailId", "password"],
        properties: {
          firstName: { type: "string", minLength: 2, maxLength: 50 },
          lastName: { type: "string", maxLength: 50 },
          emailId: { type: "string", format: "email" },
          password: { type: "string", description: "8 to 72 chars with lowercase, uppercase, number and symbol" },
        },
      },
      LoginBody: {
        type: "object",
        required: ["emailId", "password"],
        properties: { emailId: { type: "string", format: "email" }, password: { type: "string" } },
      },
      ProfileEdit: {
        type: "object",
        properties: {
          firstName: { type: "string" },
          lastName: { type: "string" },
          age: { type: "integer", minimum: 18, maximum: 100 },
          gender: { type: "string", enum: ["male", "female", "other"] },
          about: { type: "string", maxLength: 500 },
          skills: { type: "array", maxItems: 10, items: { type: "string", maxLength: 30 } },
          photoUrl: { type: "string", description: "http(s) URL, or empty to clear" },
        },
      },
      PasswordChange: {
        type: "object",
        required: ["currentPassword", "newPassword"],
        properties: { currentPassword: { type: "string" }, newPassword: { type: "string" } },
      },
      User: {
        type: "object",
        description: "Your own profile. Other users appear only as cards, which never include emailId.",
        properties: {
          id: { type: "string" }, firstName: { type: "string" }, lastName: { type: "string" },
          emailId: { type: "string" }, age: { type: "integer" }, gender: { type: "string" },
          about: { type: "string" }, skills: { type: "array", items: { type: "string" } }, photoUrl: { type: "string" },
        },
      },
      UserResponse: { type: "object", properties: { user: ref("User") } },
      Card: {
        type: "object",
        properties: {
          id: { type: "string" }, firstName: { type: "string" }, lastName: { type: "string" },
          age: { type: "integer" }, gender: { type: "string" }, about: { type: "string" },
          skills: { type: "array", items: { type: "string" } }, photoUrl: { type: "string" },
        },
      },
      FeedResponse: {
        type: "object",
        properties: {
          count: { type: "integer" },
          users: { type: "array", items: ref("Card") },
          nextCursor: { type: "string", nullable: true },
        },
      },
      RequestResponse: {
        type: "object",
        properties: {
          message: { type: "string" },
          request: {
            type: "object",
            properties: {
              id: { type: "string" }, fromUserId: { type: "string" }, toUserId: { type: "string" },
              status: { type: "string" }, createdAt: { type: "string" },
            },
          },
        },
      },
    },
  },
};