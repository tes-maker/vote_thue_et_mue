process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";
process.env.SESSION_SECRET ??= "test-session-secret-with-at-least-thirty-two-characters";

const assert = require("node:assert/strict");
const test = require("node:test");
const { archiveSchema, sessionSchema } = require("../server");

function session() {
  const members = [
    { id: "m1", nom: "Élu présent", fonction: "Maire" },
    { id: "m2", nom: "Élu absent 1", fonction: "Conseiller" },
    { id: "m3", nom: "Élu absent 2", fonction: "Conseiller" },
  ];
  return {
    elus: members,
    seance: { id: "s1", titre: "Conseil municipal", date: "2026-11-01", president: "m1" },
    presence: {
      m1: { present: true, mandataire: null },
      m2: { present: false, mandataire: "m1" },
      m3: { present: false, mandataire: "m1" },
    },
    votes: [{
      id: "v1",
      numero: "1",
      objet: "Délibération",
      choix: { m1: "pour", m2: "contre", m3: "abst" },
      electeurs: [
        { ...members[0], present: true, mandataire: null },
        { ...members[1], present: false, mandataire: "m1" },
        { ...members[2], present: false, mandataire: "m1" },
      ],
      president: "m1",
    }],
  };
}

test("accepts multiple proxies held by one present councillor", () => {
  assert.equal(sessionSchema.safeParse(session()).success, true);
});

test("rejects a proxy assigned to an absent councillor", () => {
  const value = session();
  value.presence.m1.present = false;
  assert.equal(sessionSchema.safeParse(value).success, false);
});

test("rejects duplicate councillor ids", () => {
  const value = session();
  value.elus[2].id = "m2";
  assert.equal(sessionSchema.safeParse(value).success, false);
});

test("validates archive identifiers and snapshot shape", () => {
  const snapshot = session();
  assert.equal(archiveSchema.safeParse({
    id: snapshot.seance.id,
    archivedAt: "2026-11-01T12:00:00.000Z",
    snapshot,
  }).success, true);
  assert.equal(archiveSchema.safeParse({
    id: "other",
    archivedAt: "2026-11-01T12:00:00.000Z",
    snapshot,
  }).success, false);
});
