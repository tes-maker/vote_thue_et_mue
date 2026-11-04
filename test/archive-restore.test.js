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

test("resuming an archive edits a copy and keeps every deliberation", () => {
  const snapshot = { seance: { id: "s1" }, votes: [{ id: "v1" }, { id: "v2" }] };
  let committed = 0;
  const context = createStateContext({
    confirm: () => true,
    t: key => key,
    navigateToTab: () => {},
    openVote: "v1",
    archives: [{ id: "s1", snapshot }],
    countCommit: () => { committed++; },
  });
  vm.runInContext("ARCHIVES = archives; commit = countCommit;", context);

  context.restoreArchive("s1");
  const restored = vm.runInContext("S", context);
  assert.equal(restored.votes.length, 2);
  assert.equal(committed, 1);
  restored.votes.pop();
  assert.equal(snapshot.votes.length, 2);
});
