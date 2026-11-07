const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { sessionSchema } = require("../server/schemas");

function createStateContext(overrides = {}) {
  let nextId = 0;
  const context = vm.createContext({
    DEFAULT_ELUS: [["Élu", "Maire"], ["Autre", "Conseiller"]],
    uid: () => `generated${++nextId}`,
    today: () => "2026-11-01",
    structuredClone,
    ...overrides,
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/state.js"), "utf8"), context);
  return context;
}

test("creates a new session that the server accepts", () => {
  const session = createStateContext().fresh();
  const result = sessionSchema.safeParse(JSON.parse(JSON.stringify(session)));
  assert.equal(result.success, true);
  assert.equal(Object.values(session.presence).every(attendance => attendance.present), true);
});

test("marks resigned members absent when a new session keeps the member list", () => {
  const context = createStateContext();
  const session = context.fresh([{ id: "m1", nom: "Élu", fonction: "", actif: false }]);
  assert.deepEqual({ ...session.presence.m1 }, { present: false, mandataire: null });
});

test("resuming an archive edits a copy and keeps every deliberation", async () => {
  const snapshot = { seance: { id: "s1" }, votes: [{ id: "v1" }, { id: "v2" }] };
  let committed = 0;
  const context = createStateContext({
    confirm: () => true,
    t: key => key,
    navigateToTab: () => {},
    openVote: "v1",
    archives: [{ id: "s1", snapshot }],
    current: { seance: { id: "s0" }, votes: [], votesConfidentiels: [] },
    countCommit: () => { committed++; },
  });
  vm.runInContext("ARCHIVES = archives; S = current; commit = countCommit;", context);

  await context.restoreArchive("s1");
  const restored = vm.runInContext("S", context);
  assert.equal(restored.votes.length, 2);
  assert.equal(committed, 1);
  restored.votes.pop();
  assert.equal(snapshot.votes.length, 2);
});

test("resuming an archive over unarchived votes requires the password again", async () => {
  const current = { seance: { id: "s0" }, votes: [{ id: "v9" }], votesConfidentiels: [] };
  let asked = 0;
  let committed = 0;
  const context = createStateContext({
    confirm: () => true,
    t: key => key,
    navigateToTab: () => {},
    requireElevation: async () => { asked++; return false; },
    archives: [{ id: "s1", snapshot: { seance: { id: "s1" }, votes: [], votesConfidentiels: [] } }],
    current,
    countCommit: () => { committed++; },
  });
  vm.runInContext("ARCHIVES = archives; S = current; commit = countCommit;", context);

  await context.restoreArchive("s1");
  assert.equal(asked, 1);
  assert.equal(committed, 0);
  assert.equal(vm.runInContext("S", context), current);

  // Une fois la séance en cours archivée avec ce vote, aucune confirmation n'est demandée.
  vm.runInContext("ARCHIVES.push({ id: 's0', snapshot: structuredClone(S) });", context);
  await context.restoreArchive("s1");
  assert.equal(asked, 1);
  assert.equal(committed, 1);
});
