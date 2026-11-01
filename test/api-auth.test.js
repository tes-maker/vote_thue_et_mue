process.env.DATABASE_URL ??= "******127.0.0.1:5432/test";
process.env.SESSION_SECRET ??= "test-session-secret-with-at-least-thirty-two-characters";

const assert = require("node:assert/strict");
const test = require("node:test");
const { isValidApiToken } = require("../server");

const token = "secret-api-key-for-tests-with-more-than-32-characters";

test("validates a configured Bearer API token", () => {
  assert.equal(isValidApiToken(`Bearer ${token}`, token), true);
});

test("rejects missing, malformed, or incorrect API tokens", () => {
  assert.equal(isValidApiToken(undefined, token), false);
  assert.equal(isValidApiToken("Basic abc", token), false);
  assert.equal(isValidApiToken(`Bearer ${token}extra`, token), false);
  assert.equal(isValidApiToken(`Bearer ${"x".repeat(token.length)}`, token), false);
  assert.equal(isValidApiToken(`Bearer ${token}`, undefined), false);
});
