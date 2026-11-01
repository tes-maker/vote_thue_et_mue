const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("places archiving and starting a blank session side by side", () => {
  const presence = { innerHTML: "" };
  const context = vm.createContext({
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
