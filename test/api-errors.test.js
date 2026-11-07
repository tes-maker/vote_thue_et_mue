// Réponses d'erreur des routes : elles sont toutes émises avant le moindre accès à la base.
process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";
process.env.SESSION_SECRET ??= "test-session-secret-with-at-least-thirty-two-characters";
const TOKEN = "api-token-for-tests-with-more-than-32-characters";
process.env.API_BEARER_TOKEN = TOKEN;

const assert = require("node:assert/strict");
const test = require("node:test");
const { createApp } = require("../server");

test("answers protected routes with the documented error codes", async t => {
  const server = createApp().listen(0);
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const call = async (method, url, { headers = {}, body, raw } = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${url}`, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    return [response.status, (await response.json()).error];
  };
  const bearer = { Authorization: `Bearer ${TOKEN}` };

  assert.deepEqual(await call("GET", "/api/state"), [401, "unauthorized"]);
  assert.deepEqual(await call("POST", "/api/auth/logout"), [401, "unauthorized"]);
  assert.deepEqual(await call("POST", "/api/auth/logout", { headers: bearer }), [401, "unauthorized"]);
  assert.deepEqual(await call("POST", "/api/auth/login", { body: { email: "x" } }), [400, "invalid_data"]);
  assert.deepEqual(await call("PUT", "/api/v1/state", { headers: bearer, body: {} }), [428, "revision_required"]);
  assert.deepEqual(
    await call("PUT", "/api/state", { headers: { ...bearer, "If-Match": "abc" }, body: {} }),
    [428, "revision_required"],
  );
  assert.deepEqual(
    await call("PUT", "/api/state", { headers: { ...bearer, "If-Match": "99999999999999999999" }, body: {} }),
    [400, "invalid_revision"],
  );
  assert.deepEqual(
    await call("PUT", "/api/state", { headers: { ...bearer, "If-Match": "1" }, body: { active: {} } }),
    [400, "invalid_data"],
  );
  assert.deepEqual(
    await call("PUT", "/api/mandate", { headers: { ...bearer, "If-Match": "1" }, body: { mode: "edit" } }),
    [400, "invalid_data"],
  );
  assert.deepEqual(await call("PUT", "/api/state", { raw: "{" }), [400, "invalid_data"]);
  assert.deepEqual(
    await call("PUT", "/api/state", { raw: JSON.stringify({ x: "a".repeat(11 * 1024 * 1024) }) }),
    [413, "payload_too_large"],
  );
  // Le jeton bearer ne permet jamais de supprimer : il n'y a pas de mot de passe à confirmer.
  assert.deepEqual(await call("DELETE", "/api/archives/s1", { headers: bearer }), [403, "reauth_required"]);
  assert.deepEqual(await call("DELETE", "/api/v1/archives/s1"), [401, "unauthorized"]);
  assert.deepEqual(await call("POST", "/api/auth/elevate", { body: { password: "x" } }), [401, "unauthorized"]);
  assert.deepEqual(await call("POST", "/api/auth/elevate", { headers: bearer, body: { password: "x" } }), [401, "unauthorized"]);
  assert.deepEqual(await call("GET", "/api/unknown"), [404, "not_found"]);
});
