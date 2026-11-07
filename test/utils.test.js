const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadUtils(now) {
  const RealDate = Date;
  const FixedDate = class extends RealDate { constructor(...args) { super(...(args.length ? args : [now])); } };
  const context = vm.createContext({ crypto: globalThis.crypto, Date: FixedDate });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/utils.js"), "utf8"), context);
  return vm.runInContext("({ uid, today })", context);
}

test("generates identifiers in the format accepted by the server", () => {
  const { uid } = loadUtils(Date.now());
  const ids = new Set(Array.from({ length: 1000 }, () => uid()));
  assert.equal(ids.size, 1000);
  for (const id of ids) assert.match(id, /^[a-z0-9]{16}$/);
});

test("uses the local calendar day, not the UTC one", () => {
  // 00:30 heure locale : en UTC, ce peut être encore la veille.
  const { today } = loadUtils(new Date(2026, 10, 7, 0, 30).getTime());
  assert.equal(today(), "2026-11-07");
});
