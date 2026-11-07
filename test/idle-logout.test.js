const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

/** Charge js/auth.js avec une horloge et des minuteurs simulés. */
function loadAuth() {
  const clock = { now: 1_000_000 };
  const timers = [];
  const calls = { keepAlive: 0, logout: 0 };
  const body = { classList: { contains: () => false, toggle() {} } };
  const element = { addEventListener() {}, close() {}, focus() {}, textContent: "" };
  const context = vm.createContext({
    Date: { now: () => clock.now },
    setTimeout: (fn, delay) => { timers.push({ fn, at: clock.now + delay }); return timers.length; },
    clearTimeout() {},
    document: { body, getElementById: () => element, addEventListener() {} },
    API: { currentUser: async () => { calls.keepAlive++; return { user: {} }; } },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/auth.js"), "utf8"), context);
  vm.runInContext("logout = () => { countLogout(); }", Object.assign(context, { countLogout: () => calls.logout++ }));
  return { context, clock, timers, calls };
}

test("logs out after 10 minutes without any action", () => {
  const { context, clock, timers, calls } = loadAuth();
  context.resetIdleTimeout();
  assert.equal(timers.at(-1).at - clock.now, 10 * 60 * 1000);

  clock.now += 9 * 60 * 1000;
  context.recordActivity();
  assert.equal(calls.logout, 0);
  assert.equal(timers.at(-1).at - clock.now, 10 * 60 * 1000, "une action repousse la déconnexion");

  // Minuteur parti en retard (veille) : la première action après 10 minutes déconnecte.
  clock.now += 10 * 60 * 1000;
  context.recordActivity();
  assert.equal(calls.logout, 1);
});

test("keeps the server session alive at most once a minute while the user acts", () => {
  const { context, clock, calls } = loadAuth();
  context.resetIdleTimeout();
  clock.now += 30 * 1000;
  context.recordActivity();
  assert.equal(calls.keepAlive, 0);
  clock.now += 31 * 1000;
  context.recordActivity();
  context.recordActivity();
  assert.equal(calls.keepAlive, 1);
});
