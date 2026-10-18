"use strict";
// Reproducible pinned Phosphor Duotone integrity and UI regression checks.
// Runs offline on Windows without image CDN or npm dependencies.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const context = {window: {}};
vm.createContext(context);
for (const file of ["catalog.js", "catalog-additions.js", "icons.js"]) {
  vm.runInContext(read(file), context, {filename: file, timeout: 5000});
}
const catalog = context.window.SOLYAN_TOOL_CATALOG;
const icons = context.window.SOLYAN_PHOSPHOR;
const manifest = JSON.parse(read("icons/phosphor-duotone/SOURCE.json"));
const iconDir = path.join(root, "icons", "phosphor-duotone");

test("Phosphor Duotone source and MIT license are pinned", () => {
  assert.equal(icons.sourceCommit, "2b75f3ad12b420c9504ef05df8d2564a28f8500e");
  assert.equal(manifest.commit, icons.sourceCommit);
  assert.equal(manifest.license, "MIT");
  assert.equal(manifest.variant, "duotone");
  assert.match(read("icons/phosphor-duotone/LICENSE"), /MIT License/);
});

test("every Windows tool and navigation item has a local SVG mapping", () => {
  const toolIds = new Set(catalog.tools.map(item => item.id));
  assert.equal(toolIds.size, catalog.tools.length, "duplicate tool ID");
  for (const tool of catalog.tools) {
    assert.ok(Object.hasOwn(icons.tools, tool.id), "unmapped Windows tool: " + tool.id);
    assert.match(icons.tool(tool.id, tool.category), /<img class="tool-svg" src="\.\/icons\/phosphor-duotone\//);
  }
  for (const category of catalog.categories) {
    assert.ok(Object.hasOwn(icons.categories, category.id), "unmapped category: " + category.id);
  }
  for (const nav of ["home", "all", "recent", "favorite", "settings", "search", "notifications"]) {
    assert.ok(Object.hasOwn(icons.navigation, nav), "unmapped navigation icon: " + nav);
  }
});

test("all 86 vendored SVGs have original upstream git blob checksums", () => {
  const expected = Object.entries(manifest.assets);
  assert.equal(expected.length, 86);
  const actualNames = fs.readdirSync(iconDir).filter(name => name.endsWith(".svg")).sort();
  assert.deepEqual(actualNames, expected.map(([file]) => file).sort());
  for (const [name, gitSha] of expected) {
    const bytes = fs.readFileSync(path.join(iconDir, name));
    const header = Buffer.from("blob " + bytes.length + "\0", "utf8");
    const actualSha = crypto.createHash("sha1").update(header).update(bytes).digest("hex");
    assert.equal(actualSha, gitSha, "upstream SVG changed: " + name);
    const svg = bytes.toString("utf8");
    assert.match(svg, /^<svg /);
    assert.match(svg, /viewBox="0 0 256 256"/);
    assert.doesNotMatch(svg, /<(script|foreignObject|image|iframe|style)\b/i);
    assert.doesNotMatch(svg, /https?:\/\/(?!www\.w3\.org\/2000\/svg)/i);
  }
});

test("Windows card title and description are distinct rows", () => {
  const css = read("styles.css");
  const app = read("app.js");
  assert.match(css, /\.tool-body\{display:flex;flex-direction:column;/);
  assert.match(css, /\.tool-name\{display:block;/);
  assert.match(css, /\.tool-desc\{display:block;/);
  assert.match(app, /<span class="tool-name">/);
  assert.match(app, /<span class="tool-desc">/);
});

test("icon layer uses offline files and keeps missing tools honest", () => {
  const html = read("index.html");
  const app = read("app.js");
  assert.ok(html.indexOf('./icons.js') < html.indexOf('./app.js'), "icon mapping must load first");
  assert.match(app, /icons\.tool\(tool\.id, tool\.category\)/);
  assert.match(app, /Chưa khả dụng/);
  assert.match(app, /is-pending/);
  assert.doesNotMatch(read("icons.js"), /<svg|unpkg\.com|cdn\./);
});
