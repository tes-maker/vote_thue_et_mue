const assert = require("node:assert/strict");
const test = require("node:test");
const { archiveSchema, mandateInputSchema, mandateSchema, sessionSchema } = require("../server/schemas");

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

test("adds an empty confidential-vote list for older session data", () => {
  const result = sessionSchema.safeParse(session());
  assert.equal(result.success, true);
  assert.deepEqual(result.data.votesConfidentiels, []);
});

test("accepts anonymous option tallies within the elected-member limit", () => {
  const value = session();
  value.votesConfidentiels = [{
    id: "secret1",
    numero: "2",
    objet: "Choix d'une option",
    limite: 3,
    options: [
      { id: "option1", nom: "Option A", voix: 1 },
      { id: "option2", nom: "Option B", voix: 1 },
    ],
    abstentions: 1,
    npp: 0,
  }];
  const result = sessionSchema.safeParse(value);
  assert.equal(result.success, true);
  assert.equal(result.data.votesConfidentiels[0].options.length, 2);
});

test("accepts legacy structure tallies and converts them to options", () => {
  const value = session();
  value.votesConfidentiels = [{
    id: "secret1",
    numero: "2",
    objet: "Choix",
    limite: 2,
    structures: [{ id: "option1", nom: "Option A", voix: 1 }],
    abstentions: 0,
    npp: 0,
  }];
  const result = sessionSchema.safeParse(value);
  assert.equal(result.success, true);
  assert.deepEqual(result.data.votesConfidentiels[0].options, [{ id: "option1", nom: "Option A", voix: 1 }]);
  assert.equal(Object.hasOwn(result.data.votesConfidentiels[0], "structures"), false);
});

test("rejects confidential tallies above the ballot limit and duplicate option ids", () => {
  const value = session();
  value.votesConfidentiels = [{
    id: "secret1",
    numero: "2",
    objet: "Choix d'une option",
    limite: 2,
    options: [
      { id: "option1", nom: "Option A", voix: 1 },
      { id: "option2", nom: "Option B", voix: 1 },
    ],
    abstentions: 1,
    npp: 0,
  }];
  assert.equal(sessionSchema.safeParse(value).success, false);

  value.votesConfidentiels[0].abstentions = 0;
  value.votesConfidentiels[0].options[1].id = "option1";
  assert.equal(sessionSchema.safeParse(value).success, false);
});

test("treats members without a status as serving for backwards compatibility", () => {
  const result = sessionSchema.safeParse(session());
  assert.equal(result.success, true);
  assert.equal(result.data.elus.every(member => member.actif), true);
  assert.equal(result.data.votes[0].electeurs.every(member => member.actif), true);
});

test("keeps resigned members out of attendance while retaining recorded votes", () => {
  const value = session();
  value.elus[2].actif = false;
  value.presence.m3 = { present: false, mandataire: null };
  const result = sessionSchema.safeParse(value);
  assert.equal(result.success, true);
  assert.equal(result.data.votes[0].electeurs.some(member => member.id === "m3"), true);
});

test("rejects an inactive member in attendance or as session president", () => {
  const value = session();
  value.elus[0].actif = false;
  assert.equal(sessionSchema.safeParse(value).success, false);

  const inactivePresident = session();
  inactivePresident.elus[0].actif = false;
  inactivePresident.presence.m1 = { present: false, mandataire: null };
  assert.equal(sessionSchema.safeParse(inactivePresident).success, false);
});

test("rejects a proxy assigned to an absent councillor", () => {
  const value = session();
  value.presence.m1.present = false;
  assert.equal(sessionSchema.safeParse(value).success, false);
});

test("rejects a member without attendance instead of crashing", () => {
  const value = session();
  delete value.presence.m1;
  assert.equal(sessionSchema.safeParse(value).success, false);
  value.presence.other = { present: false, mandataire: null };
  assert.equal(sessionSchema.safeParse(value).success, false);
});

test("rejects impossible session dates", () => {
  const value = session();
  value.seance.date = "2026-02-30";
  assert.equal(sessionSchema.safeParse(value).success, false);
  value.seance.date = "2024-02-29";
  assert.equal(sessionSchema.safeParse(value).success, true);
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

test("validates current mandate years for creation and editing", () => {
  assert.equal(mandateSchema.safeParse({ startYear: 2026, endYear: 2032 }).success, true);
  assert.equal(mandateSchema.safeParse({ startYear: 2032, endYear: 2026 }).success, false);
  assert.equal(mandateSchema.safeParse({ startYear: 2026, endYear: 2026 }).success, false);
  assert.equal(mandateInputSchema.safeParse({
    mode: "create",
    startYear: 2026,
    endYear: 2032,
  }).success, true);
  assert.equal(mandateInputSchema.safeParse({
    mode: "edit",
    startYear: 2026,
    endYear: 2025,
  }).success, false);
});
