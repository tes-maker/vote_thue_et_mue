// Règle serveur : un vote enregistré ne disparaît de la base qu'avec une authentification renforcée.
process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";
process.env.SESSION_SECRET ??= "test-session-secret-with-at-least-thirty-two-characters";

const assert = require("node:assert/strict");
const test = require("node:test");
const { checkActiveReplacement, checkArchiveReplacements } = require("../server");

const session = (id, votes = [], votesConfidentiels = []) => ({
  seance: { id },
  votes: votes.map(voteId => ({ id: voteId })),
  votesConfidentiels: votesConfidentiels.map(voteId => ({ id: voteId })),
});

/** Base simulée : la séance active et les archives, indexées par identifiant de séance. */
function fakeClient(active, archives = {}) {
  return {
    async query(sql, params) {
      if (sql.includes("FROM app_state")) return { rows: active ? [{ payload: active, revision: 3 }] : [] };
      return { rows: params[0].filter(id => archives[id]).map(id => ({ session_id: id, snapshot: archives[id] })) };
    },
  };
}

const request = ({ elevated = false, bearer = false, revision = 3 } = {}) => ({
  expectedRevision: revision,
  apiAuthenticated: bearer,
  session: elevated ? { elevatedUntil: Date.now() + 60_000 } : {},
});

const refusal = { status: 403, code: "reauth_required" };

test("removing a vote from the active session requires the password again", async () => {
  const client = fakeClient(session("s1", ["v1", "v2"], ["c1"]));
  await assert.rejects(checkActiveReplacement(client, request(), session("s1", ["v1"], ["c1"])), refusal);
  await assert.rejects(checkActiveReplacement(client, request(), session("s1", ["v1", "v2"])), refusal);
  await assert.rejects(checkActiveReplacement(client, request({ bearer: true }), session("s1", ["v1"], ["c1"])), refusal);
  await checkActiveReplacement(client, request({ elevated: true }), session("s1", ["v1"], ["c1"]));
  await checkActiveReplacement(client, request(), session("s1", ["v1", "v2", "v3"], ["c1"]));
});

test("an expired confirmation no longer allows deletions", async () => {
  const client = fakeClient(session("s1", ["v1"]));
  const expired = { expectedRevision: 3, session: { elevatedUntil: Date.now() - 1 } };
  await assert.rejects(checkActiveReplacement(client, expired, session("s1")), refusal);
});

test("switching session is free only when the previous votes are archived", async () => {
  const active = session("s1", ["v1"]);
  await checkActiveReplacement(fakeClient(active, { s1: session("s1", ["v1"]) }), request(), session("s2"));
  await assert.rejects(checkActiveReplacement(fakeClient(active), request(), session("s2")), refusal);
});

test("a session replacing its archive must keep the archived votes", async () => {
  const client = fakeClient(session("s1"), { s2: session("s2", ["v1", "v2"]) });
  await checkActiveReplacement(client, request(), session("s2", ["v1", "v2"]));
  await assert.rejects(checkActiveReplacement(client, request(), session("s2", ["v1"])), refusal);
});

test("checks the revision before anything else", async () => {
  const client = fakeClient(session("s1", ["v1"]));
  await assert.rejects(checkActiveReplacement(client, request({ revision: 2 }), session("s1")), { status: 409 });
  await checkActiveReplacement(fakeClient(null), request({ revision: 0 }), session("s1"));
});

test("an import cannot drop votes from an existing archive", async () => {
  const client = fakeClient(null, { s1: session("s1", ["v1"]) });
  const archive = votes => ({ id: "s1", snapshot: session("s1", votes) });
  await checkArchiveReplacements(client, request(), [archive(["v1", "v2"])]);
  await assert.rejects(checkArchiveReplacements(client, request(), [archive([])]), refusal);
  await checkArchiveReplacements(client, request({ elevated: true }), [archive([])]);
});
