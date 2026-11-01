const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createStateContext() {
  let nextId = 0;
  const context = vm.createContext({
    DEFAULT_ELUS: [],
    uid: () => `generated${++nextId}`,
    today: () => "2026-11-01",
  });
  const source = fs.readFileSync(path.join(__dirname, "../js/state.js"), "utf8");
  vm.runInContext(source, context);
  return context;
}

test("normalizing a resumed archive retains every deliberation and repairs legacy ids", () => {
  const context = createStateContext();
  const archive = {
    snapshot: {
      elus: [{ id: "m1", nom: "Élu", fonction: "Maire", actif: true }],
      seance: { id: "s1", titre: "Conseil municipal", date: "2026-11-01", president: "m1" },
      presence: { m1: { present: true, mandataire: null } },
      votes: [
        { id: "v1", numero: "1", objet: "Délibération 1" },
        { id: "legacy-vote-2", numero: "2", objet: "Délibération 2" },
        { id: "v1", numero: "3", objet: "Délibération 3" },
      ],
    },
  };

  const [restored] = context.normalizeArchives([archive]);

  assert.equal(restored.snapshot.votes.length, 3);
  assert.deepEqual(
    Array.from(restored.snapshot.votes, vote => vote.objet),
    ["Délibération 1", "Délibération 2", "Délibération 3"],
  );
  assert.equal(new Set(Array.from(restored.snapshot.votes, vote => vote.id)).size, 3);
});
