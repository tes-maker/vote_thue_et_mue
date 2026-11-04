const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

test("renders named anonymous options with abstention and non-participation counters", () => {
  const section = { innerHTML: "" };
  const context = {
    window: { location: { pathname: "/" }, addEventListener() {} },
    S: {
      elus: [{ id: "member1", nom: "Identité confidentielle", actif: true }],
      votes: [],
      votesConfidentiels: [{
        id: "secret1",
        numero: "1",
        objet: "Désignation",
        limite: 1,
        options: [{ id: "option1", nom: "Option A", voix: 1 }],
        abstentions: 0,
        npp: 0,
      }],
    },
    document: { getElementById: () => section },
    esc: value => String(value),
    t: (key, params = {}) => ({
      confidentialVotesTitle: `Votes confidentiels (${params.n})`,
      confidentialLimit: `${params.total}/${params.limite}`,
      confidentialDecrement: `Retirer ${params.nom}`,
      confidentialIncrement: `Ajouter ${params.nom}`,
      confidentialAbstentions: "Abstention",
      confidentialNpp: "Ne prend pas part au vote",
    })[key] ?? key,
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../js/render.js"), "utf8"),
    context,
  );
  context.renderConfidentialVotes();

  assert.match(section.innerHTML, /Option A/);
  assert.match(section.innerHTML, /<button type="button" class="member-action"[^>]*data-act="confidentialCount"[^>]*data-delta="1"/);
  assert.match(section.innerHTML, /<td class="confidential-count"[^>]*>1<\/td>/);
  assert.match(section.innerHTML, /disabled aria-label="Ajouter Option A"/);
  assert.match(section.innerHTML, /Ne prend pas part au vote/);
  assert.match(section.innerHTML, /Abstention/);
  assert.doesNotMatch(section.innerHTML, /Identité confidentielle|member1/);
});

test("refreshes only the changed confidential ballot counters", () => {
  const countCells = [
    { dataset: { confidentialTarget: "option", confidentialId: "option1" }, textContent: "0" },
    { dataset: { confidentialTarget: "abstentions", confidentialId: "" }, textContent: "0" },
    { dataset: { confidentialTarget: "npp", confidentialId: "" }, textContent: "0" },
  ];
  const buttons = [
    { dataset: { target: "option", id: "option1", delta: "1" }, disabled: false },
    { dataset: { target: "abstentions", id: "", delta: "1" }, disabled: false },
    { dataset: { target: "npp", id: "", delta: "1" }, disabled: false },
  ];
  const limit = { textContent: "" };
  const card = {
    dataset: { confidentialVote: "secret1" },
    querySelector: () => limit,
    querySelectorAll: selector => selector === "[data-confidential-count]" ? countCells : buttons,
  };
  const context = {
    window: { location: { pathname: "/" }, addEventListener() {} },
    document: { querySelectorAll: () => [card] },
    t: (key, params) => `${params.total}/${params.limite}`,
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../js/render.js"), "utf8"),
    context,
  );
  const vote = {
    id: "secret1",
    limite: 2,
    options: [{ id: "option1", nom: "Option A", voix: 1 }],
    abstentions: 1,
    npp: 0,
  };
  context.refreshConfidentialVote(vote);

  assert.deepEqual(countCells.map(cell => cell.textContent), ["1", "1", "0"]);
  assert.equal(limit.textContent, "2/2");
  assert.deepEqual(buttons.map(button => button.disabled), [true, true, true]);
});

test("increments a confidential counter without rerendering or submitting the page", async () => {
  const countCell = {
    dataset: { confidentialTarget: "option", confidentialId: "option1" },
    textContent: "0",
  };
  const limit = { textContent: "" };
  const button = {
    dataset: { target: "option", id: "option1", delta: "1" },
    disabled: false,
  };
  const card = {
    dataset: { confidentialVote: "secret1" },
    querySelector: () => limit,
    querySelectorAll: selector => selector === "[data-confidential-count]" ? [countCell] : [button],
  };
  const status = {
    textContent: "",
    classList: { toggle() {} },
  };
  let clickHandler;
  let renderCount = 0;
  let commitOptions;
  const vote = {
    id: "secret1",
    limite: 2,
    options: [{ id: "option1", nom: "Option A", voix: 0 }],
    abstentions: 0,
    npp: 0,
  };
  const context = {
    window: { location: { pathname: "/" }, addEventListener() {} },
    S: { votesConfidentiels: [vote] },
    saveError: null,
    document: {
      addEventListener: (type, handler) => {
        if (type === "click") clickHandler = handler;
      },
      getElementById: () => status,
      querySelectorAll: () => [card],
    },
    clearTimeout() {},
    setTimeout() {},
    render: () => { renderCount++; },
    commit: options => { commitOptions = options; },
    t: (key, params = {}) => key === "confidentialLimit"
      ? `${params.total}/${params.limite}`
      : key,
    showNotification() {},
    console,
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../js/render.js"), "utf8"),
    context,
  );
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../js/actions.js"), "utf8"),
    context,
  );

  let defaultPrevented = false;
  clickHandler({
    target: {
      closest: () => ({
        dataset: {
          act: "confidentialCount",
          vote: "secret1",
          id: "option1",
          target: "option",
          delta: "1",
        },
      }),
    },
    preventDefault: () => { defaultPrevented = true; },
  });
  await Promise.resolve();

  assert.equal(defaultPrevented, true);
  assert.equal(vote.options[0].voix, 1);
  assert.equal(countCell.textContent, "1");
  assert.equal(limit.textContent, "1/2");
  assert.equal(commitOptions.render, false);
  assert.equal(renderCount, 0);
});

test("does not reserve header space for the hidden successful-save status", () => {
  const css = fs.readFileSync(path.join(__dirname, "../style.css"), "utf8");
  const rule = css.match(/\.save-status\s*\{([^}]+)\}/)?.[1] ?? "";
  assert.doesNotMatch(rule, /(?:^|;)\s*width:/);
  assert.match(rule, /flex:\s*0 1 auto/);
});

test("keeps navigation tabs and action buttons in one horizontal row", () => {
  const css = fs.readFileSync(path.join(__dirname, "../style.css"), "utf8");
  const navRule = css.match(/\.nav\s+\.wrap\s*\{([^}]+)\}/)?.[1] ?? "";
  const tabsRule = css.match(/\.tabs\s*\{([^}]+)\}/)?.[1] ?? "";
  const tabsButtonsRule = css.match(/\.tabs\s+button\s*\{([^}]+)\}/)?.[1] ?? "";
  const actionsRule = css.match(/\.actions\s*\{([^}]+)\}/)?.[1] ?? "";
  const buttonsRule = css.match(/\.actions\s*>\s*button\s*\{([^}]+)\}/)?.[1] ?? "";
  assert.match(navRule, /flex-wrap:\s*nowrap/);
  assert.match(navRule, /overflow-x:\s*auto/);
  assert.match(tabsRule, /flex-wrap:\s*nowrap/);
  assert.match(tabsButtonsRule, /white-space:\s*nowrap/);
  assert.match(actionsRule, /flex-wrap:\s*nowrap/);
  assert.match(buttonsRule, /white-space:\s*nowrap/);
});

test("reduces horizontal gutters for the page and login screen", () => {
  const css = fs.readFileSync(path.join(__dirname, "../style.css"), "utf8");
  assert.match(css, /\.wrap\s*\{[^}]*padding:\s*0 8px;/);
  assert.match(css, /body\.locked \.login\s*\{[^}]*padding:\s*32px 8px;/);
});

test("toggles and persists the theme, with translations for both languages", () => {
  const values = new Map();
  const logos = [
    { dataset: { lightSrc: "/rf_logo.svg", darkSrc: "/rf_logo_dark.svg" }, src: "/rf_logo.svg" },
    { dataset: { lightSrc: "/logo_thue_et_mue.svg", darkSrc: "/logo_thue_et_mue_dark.svg" }, src: "/logo_thue_et_mue.svg" },
  ];
  const themeToggle = {
    textContent: "",
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
  };
  const context = {
    localStorage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
    document: {
      documentElement: { dataset: {}, lang: "" },
      body: { classList: { contains: () => true } },
      querySelectorAll: selector => selector === "img[data-dark-src]" ? logos : [],
      getElementById: id => id === "theme-toggle" ? themeToggle : null,
    },
    renderSaveStatus() {},
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../js/i18n.js"), "utf8"),
    context,
  );
  context.applyStatic();
  assert.equal(themeToggle.textContent, "Activer le mode sombre");
  assert.equal(themeToggle.attributes["aria-pressed"], "false");

  context.toggleTheme();
  assert.equal(context.document.documentElement.dataset.theme, "dark");
  assert.equal(values.get("vote-cm-theme"), "dark");
  assert.equal(themeToggle.textContent, "Activer le mode clair");
  assert.equal(themeToggle.attributes["aria-pressed"], "true");
  assert.deepEqual(logos.map(logo => logo.src), ["/rf_logo_dark.svg", "/logo_thue_et_mue_dark.svg"]);

  context.setLang("en");
  assert.equal(themeToggle.textContent, "Enable light mode");
});

test("dark logo assets turn unclassified black paths white while preserving colored paths", () => {
  const css = fs.readFileSync(path.join(__dirname, "../style.css"), "utf8");
  assert.match(css, /:root\[data-theme="dark"\]\s*\{[^}]*--fond-page:\s*#181818/s);
  const publicHtml = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
  assert.match(publicHtml, /data-dark-src="\/rf_logo_dark\.svg"/);
  assert.match(publicHtml, /data-dark-src="\/logo_thue_et_mue_dark\.svg"/);
  for (const file of ["rf_logo_dark.svg", "logo_thue_et_mue_dark.svg"]) {
    const svg = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    assert.match(svg, /path:not\(\[class\]\)\{fill:#fff\}/);
  }
  const communalLogo = fs.readFileSync(path.join(__dirname, "../logo_thue_et_mue_dark.svg"), "utf8");
  assert.match(communalLogo, /\.st0\s*\{\s*fill:#4DBDC6/);
  assert.match(communalLogo, /\.st1\s*\{\s*fill:#E74561/);
  assert.match(communalLogo, /\.st2\s*\{\s*fill:#C1D566/);
});

test("README references only available screenshots", () => {
  const readme = fs.readFileSync(path.join(__dirname, "../README.md"), "utf8");
  const images = [...readme.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(match => match[1]);
  const screenshots = images.filter(image => image.startsWith("images/"));
  assert.deepEqual(screenshots, ["images/clair.png", "images/sombre.png", "images/list.png"]);
  assert.equal(images.length, screenshots.length);
  for (const image of screenshots) {
    assert.equal(fs.existsSync(path.join(__dirname, "..", image)), true, `${image} should exist`);
  }
});
