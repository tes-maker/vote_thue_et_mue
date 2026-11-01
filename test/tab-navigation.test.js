const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

process.env.DATABASE_URL ??= "******127.0.0.1:5432/test";
process.env.SESSION_SECRET ??= "test-session-secret-with-at-least-thirty-two-characters";
const { createApp } = require("../server");

test("initializes and navigates tabs using address paths", () => {
  const pushedPaths = [];
  const window = {
    location: { pathname: "/votes" },
    history: {
      pushState: (_state, _title, path) => {
        pushedPaths.push(path);
        window.location.pathname = path;
      },
    },
    addEventListener: () => {},
  };
  const context = vm.createContext({ window });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../js/render.js"), "utf8"),
    context,
  );

  assert.equal(vm.runInContext("current", context), "votes");
  vm.runInContext('navigateToTab("confidential")', context);
  assert.equal(vm.runInContext("current", context), "confidential");
  assert.equal(window.location.pathname, "/confidential");
  assert.deepEqual(pushedPaths, ["/confidential"]);
});

test("serves the app when opening a tab address directly", async t => {
  const server = createApp().listen(0);
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  t.after(() => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  }));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/confidential`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /data-val="confidential"/);
  for (const logo of ["rf_logo_dark.svg", "logo_thue_et_mue_dark.svg"]) {
    const logoResponse = await fetch(`http://127.0.0.1:${server.address().port}/${logo}`);
    assert.equal(logoResponse.status, 200);
    assert.match(await logoResponse.text(), /path:not\(\[class\]\)\{fill:#fff\}/);
  }
});
