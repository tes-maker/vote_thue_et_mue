const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("places archiving and starting a blank session side by side", () => {
  const presence = { innerHTML: "" };
  const context = vm.createContext({
    window: { location: { pathname: "/" }, addEventListener() {} },
    S: { seance: { titre: "", date: "", president: "" }, elus: [] },
    MANDATE: { startYear: 2026, endYear: 2032 },
    document: { getElementById: () => presence },
    proxies: () => new Map(),
    counts: () => ({ n: 0, p: 0, r: 0, a: 0, quorumOk: false, quorum: 0 }),
    fmtDate: () => "",
    esc: value => String(value),
    attrs: () => "",
    t: (key, params = {}) => key === "currentMandate"
      ? `Mandat ${params.start}–${params.end}`
      : ({
          session: "Séance",
          archiveSession: "Archiver la séance actuelle",
          newSession: "Nouvelle séance vierge",
        })[key] ?? key,
  });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../js/render.js"), "utf8"),
    context,
  );

  vm.runInContext("renderPresence()", context);

  const archiveIndex = presence.innerHTML.indexOf('data-act="archiveSession"');
  const newSessionIndex = presence.innerHTML.indexOf('data-act="newSeance"');
  assert.match(presence.innerHTML, /data-act="manageMandate">Mandat 2026–2032/);
  assert.notEqual(archiveIndex, -1);
  assert.ok(newSessionIndex > archiveIndex);
  assert.equal((presence.innerHTML.match(/data-act="newSeance"/g) ?? []).length, 1);
});

test("asks before archiving the current session", async () => {
  let confirmed = false;
  let archiveCalls = 0;
  let notificationCount = 0;
  let renderCount = 0;
  const context = vm.createContext({
    document: {
      addEventListener: () => {},
      getElementById: () => ({
        set textContent(value) { this.message = value; },
        classList: {
          toggle: () => {},
          add: () => { notificationCount++; },
          remove: () => {},
        },
      }),
    },
    confirm: message => {
      assert.equal(message, "confirmArchiveCurrentSession");
      return confirmed;
    },
    t: key => key,
    archiveCurrentSession: async () => {
      archiveCalls++;
      return true;
    },
    clearTimeout: () => {},
    setTimeout: () => {},
    render: () => { renderCount++; },
  });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../js/actions.js"), "utf8"),
    context,
  );

  await vm.runInContext("ON_CLICK.archiveSession()", context);
  assert.equal(archiveCalls, 0);
  assert.equal(notificationCount, 0);

  confirmed = true;
  await vm.runInContext("ON_CLICK.archiveSession()", context);
  assert.equal(archiveCalls, 1);
  assert.equal(notificationCount, 1);
  assert.equal(renderCount, 1);
});

test("still allows logging in again after a failed save, but blocks other forms", async () => {
  const handlers = {};
  const notifications = [];
  const submitted = [];
  const context = vm.createContext({
    document: { addEventListener: (type, handler) => { handlers[type] = handler; } },
    saveError: new Error("conflict"),
    failureMessage: () => "stateConflict",
    t: key => key,
    login: form => submitted.push(form.dataset.submit),
    console,
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/actions.js"), "utf8"), context);
  vm.runInContext("showNotification = message => notified(message)", Object.assign(context, {
    notified: message => notifications.push(message),
  }));

  const submit = name => handlers.submit({
    preventDefault() {},
    target: { dataset: { submit: name }, elements: {} },
  });
  submit("addVote");
  assert.deepEqual(notifications, ["stateConflict"]);
  assert.deepEqual(submitted, []);

  submit("login");
  await Promise.resolve();
  assert.deepEqual(submitted, ["login"]);
  assert.deepEqual(notifications, ["stateConflict"]);
});

function loadActions(overrides) {
  const handlers = {};
  const context = vm.createContext({
    document: { addEventListener: (type, handler) => { handlers[type] = handler; } },
    saveError: null,
    t: key => key,
    console,
    ...overrides,
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/actions.js"), "utf8"), context);
  return { context, handlers };
}

test("keeps the current session date when the date field is cleared", () => {
  let commits = 0;
  let renders = 0;
  const S = { seance: { date: "2026-11-01" } };
  const { context } = loadActions({ S, commit: () => { commits++; }, render: () => { renders++; } });

  vm.runInContext('ON_CHANGE.date({}, "")', context);
  assert.equal(S.seance.date, "2026-11-01");
  assert.equal(commits, 0);
  assert.equal(renders, 1);

  vm.runInContext('ON_CHANGE.date({}, "2026-12-01")', context);
  assert.equal(S.seance.date, "2026-12-01");
  assert.equal(commits, 1);
});

test("blocked actions report the actual save failure, not a conflict", () => {
  const messages = [];
  const { context, handlers } = loadActions({
    saveError: new Error("invalid_data"),
    failureMessage: () => "saveFailure",
  });
  vm.runInContext("showNotification = message => notified(message)", Object.assign(context, {
    notified: message => messages.push(message),
  }));
  handlers.submit({ preventDefault() {}, target: { dataset: { submit: "addVote" }, elements: {} } });
  assert.deepEqual(messages, ["saveFailure"]);
});

test("numbers new votes after both nominal and confidential votes", () => {
  const votes = { innerHTML: "" };
  const uidValues = [];
  const S = {
    elus: [],
    votes: [{ id: "v1", numero: "1", objet: "A", electeurs: [], choix: {} }],
    votesConfidentiels: [{ id: "c1", numero: "2", objet: "B", options: [], limite: 0, abstentions: 0, npp: 0 }],
    seance: { president: null },
  };
  const context = vm.createContext({
    window: { location: { pathname: "/" }, addEventListener() {} },
    document: { getElementById: () => votes, addEventListener() {} },
    S,
    counts: () => ({ n: 0, p: 0, r: 0, a: 0, quorumOk: false, quorum: 0 }),
    tally: () => ({ ok: null, res: "res_none", votants: 0, pour: 0, contre: 0, abst: 0, npp: 0 }),
    esc: value => String(value),
    t: key => key,
    uid: () => { uidValues.push("new"); return "new"; },
    voters: () => [],
    pres: () => ({}),
    commit() {},
    console,
  });
  for (const file of ["render.js", "actions.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../js", file), "utf8"), context);
  }

  vm.runInContext("renderVotes()", context);
  assert.match(votes.innerHTML, /name="numero" value="3"/);

  vm.runInContext('ON_SUBMIT.addVote({ elements: { objet: { value: "C" }, numero: { value: " " } } })', context);
  assert.equal(S.votes.at(-1).numero, "3");
});

test("limits every text field to the length accepted by the server", () => {
  const sections = {};
  const member = { id: "m1", nom: "Élu", fonction: "Maire", actif: true };
  const context = vm.createContext({
    window: { location: { pathname: "/" }, addEventListener() {} },
    document: { getElementById: id => (sections[id] ??= { innerHTML: "" }) },
    S: {
      elus: [member],
      seance: { titre: "", date: "2026-11-01", president: "m1" },
      presence: { m1: { present: true, mandataire: null } },
      votes: [],
      votesConfidentiels: [{ id: "c1", numero: "1", objet: "B", options: [], limite: 1, abstentions: 0, npp: 0 }],
    },
    MANDATE: { startYear: 2026, endYear: 2032 },
    pres: () => ({ present: true, mandataire: null }),
    isPresent: () => true,
    proxies: () => new Map(),
    counts: () => ({ n: 1, p: 1, r: 0, a: 0, quorumOk: true, quorum: 1 }),
    esc: value => String(value),
    t: key => key,
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/render.js"), "utf8"), context);
  vm.runInContext(`
    renderPresence(); renderVotes(); renderConfidentialVotes();
    renderElus();
    const list = document.getElementById("elus").innerHTML;
    editingMember = "m1";
    renderElus();
    document.getElementById("elus").innerHTML += list;
    editingVoteTitle = { voteId: "c1", type: "confidential" };
    renderConfidentialVotes();
  `, context);

  const limits = { numero: "50", objet: "5000", nom: "255", fonction: "500" };
  const html = Object.values(sections).map(section => section.innerHTML).join("");
  const inputs = html.match(/<input\b[^>]*>/g).filter(input => !/type="date"/.test(input));
  assert.ok(inputs.length >= 9);
  for (const input of inputs) {
    const name = input.match(/name="(\w+)"/)?.[1];
    assert.equal(input.match(/maxlength="(\d+)"/)?.[1], name ? limits[name] : "255", input);
  }
});
