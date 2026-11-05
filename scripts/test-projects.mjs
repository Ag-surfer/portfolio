#!/usr/bin/env node
// Dependency-free tests for the projects showcase.
//   node scripts/test-projects.mjs
// 1. Unit tests for assets/projects/projects-core.js (pure logic).
// 2. Data contract for data/projects.json.
// 3. UI tests: boots the real projects.js against a minimal fake DOM.
// Real-browser rendering is covered separately by scripts/smoke-projects.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const Core = createRequire(import.meta.url)(path.join(ROOT, "assets/projects/projects-core.js"));
const DATA = JSON.parse(read("data/projects.json"));

const P = (o) => ({ slug: o.title.toLowerCase().replace(/\W+/g, "-"), tags: [], ...o });
const sample = () => Core.normalize([
  P({ title: "Alpha", year: 2024, status: "shipped", tags: ["web", "cli"], stack: ["Rust"] }),
  P({ title: "beta", year: 2026, status: "wip", tags: ["web"], featured: true, summary: "Realtime maps" }),
  P({ title: "Gamma", year: 2025, status: "archived", tags: ["mobile"] }),
  P({ title: "Delta", year: 2025, status: "shipped", tags: ["cli"] })
]).projects;
const slugs = (list) => list.map((p) => p.slug);

// ---------------------------------------------------------------- core

test("normalize keeps valid entries and reports invalid ones", () => {
  const { projects, warnings } = Core.normalize({ projects: [
    { slug: "ok", title: "OK", tags: ["Web", "web", " CLI "], status: "shipped", year: 2025 },
    { slug: "ok", title: "Duplicate" },
    { slug: "Bad Slug", title: "X" },
    { slug: "no-title" },
    null,
    { slug: "odd-status", title: "Odd", status: "paused", year: "2020" }
  ] });
  assert.deepEqual(slugs(projects), ["ok", "odd-status"]);
  assert.deepEqual(projects[0].tags, ["web", "cli"], "tags trimmed, lowercased, de-duplicated");
  assert.equal(projects[1].status, "", "unknown status dropped");
  assert.equal(projects[1].year, null, "non-integer year dropped");
  assert.equal(warnings.length, 5);
});

test("normalize accepts a bare array and rejects junk", () => {
  assert.equal(Core.normalize([{ slug: "a", title: "A" }]).projects.length, 1);
  assert.equal(Core.normalize({}).projects.length, 0);
  assert.equal(Core.normalize(null).warnings.length, 1);
});

test("normalize strips unsafe link schemes", () => {
  const [p] = Core.normalize([{ slug: "a", title: "A", links: {
    demo: "javascript:alert(1)", repo: "https://example.com", writeup: "notes/a.html" } }]).projects;
  assert.deepEqual(p.links, { demo: "", repo: "https://example.com", writeup: "notes/a.html" });

  const demo = (url) => Core.normalize([{ slug: "a", title: "A", links: { demo: url } }]).projects[0].links.demo;
  for (const bad of ["java\tscript:alert(1)", "java\nscript:alert(1)", "JaVaScRiPt:alert(1)",
    "\u0000javascript:alert(1)", "data:text/html,<b>x</b>", "vbscript:x", "http://[bad"]) {
    assert.equal(demo(bad), "", `rejects ${JSON.stringify(bad)}`);
  }
  for (const ok of ["https://example.com/a?b#c", "HTTP://EXAMPLE.COM", "mailto:me@example.com",
    "/projects.html", "notes/a.html", "#project-a", "//example.com/x"]) {
    assert.equal(demo(ok), ok, `keeps ${JSON.stringify(ok)}`);
  }
});

test("filter: search terms are ANDed, case-insensitive, across fields", () => {
  const ps = sample();
  assert.deepEqual(slugs(Core.filter(ps, { q: "REALTIME", tags: [], status: "" })), ["beta"]);
  assert.deepEqual(slugs(Core.filter(ps, { q: "rust web", tags: [], status: "" })), ["alpha"]);
  assert.deepEqual(slugs(Core.filter(ps, { q: "rust mobile", tags: [], status: "" })), []);
  assert.deepEqual(slugs(Core.filter(ps, { q: "2025", tags: [], status: "" })), ["gamma", "delta"]);
});

test("filter: tags are ORed, status narrows, all combine", () => {
  const ps = sample();
  assert.deepEqual(slugs(Core.filter(ps, { q: "", tags: ["mobile", "cli"], status: "" })), ["alpha", "gamma", "delta"]);
  assert.deepEqual(slugs(Core.filter(ps, { q: "", tags: ["cli"], status: "shipped" })), ["alpha", "delta"]);
  assert.deepEqual(slugs(Core.filter(ps, { q: "delta", tags: ["cli"], status: "shipped" })), ["delta"]);
  assert.deepEqual(slugs(Core.filter(ps, { q: "", tags: ["web"], status: "archived" })), []);
});

test("sort modes, with ties broken by data order", () => {
  const ps = sample();
  assert.deepEqual(slugs(Core.sort(ps, "featured")), ["beta", "gamma", "delta", "alpha"]);
  assert.deepEqual(slugs(Core.sort(ps, "newest")), ["beta", "gamma", "delta", "alpha"]);
  assert.deepEqual(slugs(Core.sort(ps, "oldest")), ["alpha", "gamma", "delta", "beta"]);
  assert.deepEqual(slugs(Core.sort(ps, "title")), ["alpha", "beta", "delta", "gamma"]);
  assert.deepEqual(slugs(Core.sort(ps, "bogus")), slugs(Core.sort(ps, "featured")));
  assert.deepEqual(slugs(ps), ["alpha", "beta", "gamma", "delta"], "input not mutated");
});

test("tagCounts and statusCounts", () => {
  const ps = sample();
  assert.deepEqual(Core.tagCounts(ps), [
    { tag: "cli", count: 2 }, { tag: "web", count: 2 }, { tag: "mobile", count: 1 }]);
  assert.deepEqual(Core.statusCounts(ps).map((s) => [s.status, s.count]),
    [["shipped", 2], ["wip", 1], ["archived", 1]]);
});

test("URL state round-trips and drops unknown values", () => {
  const s = Core.parseState("?q=maps&tags=web,CLI,nope&status=wip&sort=title", ["web", "cli"]);
  assert.deepEqual(s, { q: "maps", tags: ["web", "cli"], status: "wip", sort: "title" });
  assert.equal(Core.serializeState(s), "?q=maps&tags=web%2Ccli&status=wip&sort=title");
  assert.deepEqual(Core.parseState(Core.serializeState(s), ["web", "cli"]), s);
  assert.deepEqual(Core.parseState("?status=lost&sort=random"), Core.emptyState());
  assert.equal(Core.serializeState(Core.emptyState()), "", "defaults keep the URL clean");
});

test("filter + sort stay fast on 10,000 projects", () => {
  const tags = ["web", "cli", "ai", "data", "infra", "mobile", "games", "design"];
  const big = Core.normalize(Array.from({ length: 10000 }, (_, i) => ({
    slug: "p-" + i, title: "Project " + i, summary: "Summary number " + i, year: 2000 + (i % 27),
    status: Core.STATUSES[i % 4], tags: [tags[i % 8], tags[(i * 7) % 8]], stack: ["Lang" + (i % 13)]
  }))).projects;
  const t0 = performance.now();
  for (let i = 0; i < 20; i++) Core.sort(Core.filter(big, { q: "number 9", tags: ["ai", "web"], status: "" }), "title");
  const per = (performance.now() - t0) / 20;
  assert.ok(per < 50, `filter+sort took ${per.toFixed(1)} ms per pass`);
});

// ---------------------------------------------------------------- data contract

test("data/projects.json is valid and rich enough to exercise the UI", () => {
  const { projects, warnings } = Core.normalize(DATA);
  assert.deepEqual(warnings, []);
  assert.equal(projects.length, DATA.projects.length);
  assert.ok(projects.length >= 12, "enough items to exercise filters");
  assert.ok(projects.some((p) => p.featured), "at least one featured");
  assert.deepEqual(new Set(projects.map((p) => p.status)), new Set(Core.STATUSES), "every status represented");
  assert.ok(Core.tagCounts(projects).length > 8, "more tags than the collapsed limit");
  for (const p of projects) {
    assert.ok(p.summary.length > 20 && p.summary.length <= 160, `${p.slug}: summary 20-160 chars`);
    assert.ok(p.tags.length >= 1, `${p.slug}: has tags`);
    assert.ok(p.year >= 2000 && p.year <= 2100, `${p.slug}: plausible year`);
  }
});

test("projects.html has every element projects.js looks up", () => {
  const html = read("projects.html");
  const ids = [...read("assets/projects/projects.js").matchAll(/\$\("([\w-]+)"\)/g)].map((m) => m[1]);
  assert.ok(ids.length >= 10);
  for (const id of ids) assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
  assert.ok(html.indexOf("projects-core.js") < html.indexOf("projects.js\""), "core loads first");
});

// ---------------------------------------------------------------- UI (fake DOM)

class FakeEl {
  constructor(doc, tag) {
    this.ownerDocument = doc;
    this.tagName = tag.toUpperCase();
    this.childNodes = [];
    this.parentNode = null;
    this.attrs = new Map();
    this.listeners = {};
    this.hidden = false;
    this.value = "";
    this.text = "";
    this.isContentEditable = false;
    const self = this;
    const key = (k) => "data-" + k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
    this.dataset = new Proxy({}, {
      get: (_, k) => (typeof k === "string" && self.attrs.has(key(k)) ? self.attrs.get(key(k)) : undefined),
      set: (_, k, v) => { self.attrs.set(key(k), String(v)); return true; }
    });
    this.classList = { contains: (c) => (self.getAttribute("class") || "").split(/\s+/).includes(c) };
  }
  get id() { return this.getAttribute("id"); }
  get children() { return this.childNodes; }
  get firstChild() { return this.childNodes[0] || null; }
  setAttribute(k, v) { if (k === "hidden") this.hidden = true; else this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  removeAttribute(k) { this.attrs.delete(k); }
  get textContent() { return this.text + this.childNodes.map((c) => c.textContent).join(""); }
  set textContent(v) { this.replaceChildren(); this.text = String(v); }
  appendChild(c) {
    const nodes = c.tagName === "#FRAGMENT" ? c.childNodes.splice(0) : [c];
    for (const n of nodes) {
      if (n.parentNode) n.parentNode.childNodes.splice(n.parentNode.childNodes.indexOf(n), 1);
      n.parentNode = this;
      this.childNodes.push(n);
    }
    return c;
  }
  replaceChildren(...nodes) {
    this.childNodes.forEach((n) => { n.parentNode = null; });
    this.childNodes = [];
    this.text = "";
    nodes.forEach((n) => this.appendChild(n));
  }
  *walk() { for (const c of this.childNodes) { yield c; yield* c.walk(); } }
  querySelector(tag) { for (const n of this.walk()) if (n.tagName === tag.toUpperCase()) return n; return null; }
  closest(sel) {
    if (sel !== "button[data-tag]") throw new Error("fake closest() only supports button[data-tag]");
    for (let n = this; n; n = n.parentNode) if (n.tagName === "BUTTON" && n.attrs.has("data-tag")) return n;
    return null;
  }
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
  dispatch(type, init = {}) {
    const ev = { type, target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...init };
    for (let n = this; n; n = n.parentNode) (n.listeners[type] || []).forEach((f) => f(ev));
    (this.ownerDocument.listeners[type] || []).forEach((f) => f(ev));
    return ev;
  }
  click() { return this.dispatch("click"); }
  focus() { this.ownerDocument.activeElement = this; }
  select() {}
  scrollIntoView() { this.ownerDocument.scrolledTo = this; }
}

function makeDocument() {
  const doc = { listeners: {}, activeElement: null };
  const body = new FakeEl(doc, "body");
  doc.body = body;
  doc.createElement = (t) => new FakeEl(doc, t);
  doc.createDocumentFragment = () => new FakeEl(doc, "#fragment");
  doc.addEventListener = (t, f) => { (doc.listeners[t] ||= []).push(f); };
  doc.getElementById = (id) => { for (const n of body.walk()) if (n.id === id) return n; return null; };
  // Recreate projects.html's id'd elements (tag + initial hidden state) from the real file.
  const html = read("projects.html");
  for (const m of html.matchAll(/<(\w+)([^>]*?)\sid="([\w-]+)"([^>]*)>/g)) {
    const el = new FakeEl(doc, m[1]);
    el.setAttribute("id", m[3]);
    if (/\shidden(\s|$)/.test(m[2] + " " + m[4] + " ")) el.hidden = true;
    if (m[3] === "pj-error") el.appendChild(new FakeEl(doc, "p"));
    if (m[3] === "pj-sort") el.value = "featured";
    body.appendChild(el);
  }
  return doc;
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function boot({ search = "", hash = "", data = DATA, fetchFails = false } = {}) {
  const document = makeDocument();
  const location = { pathname: "/projects.html", search, hash, protocol: "http:" };
  const history = { replaceState(_s, _t, url) { const u = new URL(url, "http://x"); location.search = u.search; } };
  const fetch = async () => {
    if (fetchFails) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => structuredClone(data) };
  };
  const ctx = { document, location, history, fetch, console: { warn() {}, error() {}, log: console.log },
    setTimeout, clearTimeout, URLSearchParams, URL };
  ctx.window = ctx;
  ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(read("assets/projects/projects-core.js"), ctx);
  vm.runInContext(read("assets/projects/projects.js"), ctx);
  for (let i = 0; i < 5; i++) await tick();
  const $ = (id) => document.getElementById(id);
  const cards = () => $("pj-grid").childNodes;
  const visible = () => cards().filter((c) => !c.hidden).map((c) => c.id.replace("project-", ""));
  const barTag = (t) => $("pj-tag-list").childNodes.find((b) => b.dataset.tag === t);
  return { document, location, $, cards, visible, barTag };
}

test("UI: renders every project, featured first, with collapsed tag bar", async () => {
  const ui = await boot();
  const all = Core.sort(Core.normalize(DATA).projects, "featured");
  assert.equal(ui.cards().length, all.length);
  assert.deepEqual(ui.visible(), slugs(all));
  assert.equal(ui.$("pj-grid").getAttribute("aria-busy"), null);
  assert.equal(ui.$("pj-controls").hidden, false);
  assert.equal(ui.$("pj-empty").hidden, true);
  assert.equal(ui.$("pj-count").textContent, `Showing all ${all.length} projects`);
  const bar = ui.$("pj-tag-list").childNodes;
  assert.equal(bar.length, Core.tagCounts(all).length);
  assert.equal(bar.filter((b) => !b.hidden).length, 8, "only top 8 tags before expanding");
  const more = ui.$("pj-tag-more");
  assert.equal(more.hidden, false);
  assert.equal(more.getAttribute("aria-expanded"), "false");
  more.click();
  assert.equal(bar.filter((b) => !b.hidden).length, bar.length);
  assert.equal(more.getAttribute("aria-expanded"), "true");
  assert.equal(ui.location.search, "", "default state keeps URL clean");
});

test("UI: tag toggles filter, sync pressed state everywhere, and update the URL", async () => {
  const ui = await boot();
  ui.barTag("games").click();
  const games = Core.normalize(DATA).projects.filter((p) => p.tags.includes("games"));
  assert.deepEqual(new Set(ui.visible()), new Set(slugs(games)));
  assert.equal(ui.barTag("games").getAttribute("aria-pressed"), "true");
  assert.equal(ui.location.search, "?tags=games");
  assert.equal(ui.$("pj-clear").hidden, false);
  assert.match(ui.$("pj-count").textContent, new RegExp(`^Showing ${games.length} of \\d+ projects tagged games$`));

  // A tag chip inside a card toggles the same filter (OR semantics) and shows pressed state.
  const firstCard = ui.cards().find((c) => !c.hidden);
  const chip = [...firstCard.walk()].find((n) => n.tagName === "BUTTON" && n.dataset.tag === "design");
  chip.click();
  assert.equal(ui.location.search, "?tags=games%2Cdesign");
  assert.equal(chip.getAttribute("aria-pressed"), "true");
  ui.barTag("games").click();
  ui.barTag("design").click();
  assert.equal(ui.visible().length, ui.cards().length);
  assert.equal(ui.$("pj-clear").hidden, true);
});

test("UI: debounced search, empty state, and clear-all restores focus", async () => {
  const ui = await boot();
  const q = ui.$("pj-q");
  q.value = "zzzz-nothing";
  q.dispatch("input");
  assert.equal(ui.visible().length, ui.cards().length, "debounced: no change yet");
  await wait(200);
  assert.deepEqual(ui.visible(), []);
  assert.equal(ui.$("pj-empty").hidden, false);
  assert.equal(ui.$("pj-grid").hidden, true);
  assert.equal(ui.location.search, "?q=zzzz-nothing");
  ui.$("pj-empty-clear").click();
  assert.equal(ui.$("pj-empty").hidden, true);
  assert.equal(ui.visible().length, ui.cards().length);
  assert.equal(q.value, "");
  assert.equal(ui.document.activeElement, q, "focus moves to search, not lost on a hidden button");
});

test("UI: keyboard — '/' focuses search, Enter applies now, Escape clears", async () => {
  const ui = await boot();
  const q = ui.$("pj-q");
  const ev = ui.document.body.dispatch("keydown", { key: "/" });
  assert.equal(ui.document.activeElement, q);
  assert.equal(ev.defaultPrevented, true);
  q.value = "rust";
  q.dispatch("keydown", { key: "Enter" });
  assert.equal(ui.location.search, "?q=rust");
  assert.ok(ui.visible().length > 0 && ui.visible().length < ui.cards().length);
  q.dispatch("keydown", { key: "Escape" });
  assert.equal(q.value, "");
  assert.equal(ui.visible().length, ui.cards().length);
  // "/" typed inside a field is left alone.
  assert.equal(q.dispatch("keydown", { key: "/" }).defaultPrevented, false);
});

test("UI: restores state from the URL (status + sort + tags)", async () => {
  const ui = await boot({ search: "?status=wip&sort=title&tags=web,unknown" });
  const expected = Core.sort(Core.filter(Core.normalize(DATA).projects,
    { q: "", tags: ["web"], status: "wip" }), "title");
  assert.ok(expected.length > 0);
  assert.deepEqual(ui.visible(), slugs(expected));
  assert.equal(ui.$("pj-status").value, "wip");
  assert.equal(ui.$("pj-sort").value, "title");
  assert.equal(ui.location.search, "?tags=web&status=wip&sort=title", "unknown tag dropped from URL");
  ui.$("pj-sort").value = "oldest";
  ui.$("pj-sort").dispatch("change");
  assert.deepEqual(ui.visible(), slugs(Core.sort(expected, "oldest")));
});

test("UI: deep link to a filtered-out card clears filters and scrolls to it", async () => {
  const ui = await boot({ search: "?tags=games", hash: "#project-kiln" });
  assert.ok(ui.visible().includes("kiln"));
  assert.equal(ui.document.scrolledTo.id, "project-kiln");
});

test("UI: load failure and empty data show an error state", async () => {
  let ui = await boot({ fetchFails: true });
  assert.equal(ui.$("pj-error").hidden, false);
  assert.match(ui.$("pj-error").textContent, /could not be loaded \(HTTP 404\)/);
  assert.equal(ui.$("pj-controls").hidden, true);
  assert.equal(ui.$("pj-count").textContent, "");
  ui = await boot({ data: { projects: [] } });
  assert.match(ui.$("pj-error").textContent, /No projects to show yet/);
});

test("UI: card content — links carry accessible names, external links are safe", async () => {
  const ui = await boot();
  const card = ui.$("project-trail-log");
  const links = [...card.walk()].filter((n) => n.tagName === "A");
  assert.deepEqual(links.map((a) => a.textContent), ["Live demo for Trail Log", "Source for Trail Log"]);
  links.forEach((a) => assert.equal(a.getAttribute("rel"), "noopener noreferrer"));
  const details = [...card.walk()].find((n) => n.tagName === "SUMMARY");
  assert.equal(details.textContent, "Highlights (3)");
});

test("UI: malformed deep-link hash is ignored, not fatal", async () => {
  for (const hash of ["#%E0", "#%", "#project-%zz"]) {
    const ui = await boot({ search: "?tags=games", hash });
    assert.equal(ui.$("pj-error").hidden, true, `${hash}: no error state`);
    assert.equal(ui.$("pj-controls").hidden, false);
    assert.ok(ui.visible().length > 0, `${hash}: cards still render`);
    assert.equal(ui.location.search, "?tags=games", `${hash}: URL filters kept`);
  }
});

test("UI: focus stays on a card's tag chip after it reorders the grid", async () => {
  const ui = await boot();
  const chipIn = (slug, tag) => [...ui.$("project-" + slug).walk()]
    .find((n) => n.tagName === "BUTTON" && n.dataset.tag === tag);
  const chip = chipIn("lanternlight", "games");
  chip.focus();
  chip.click();
  assert.deepEqual(new Set(ui.visible()), new Set(["pixel-garden", "lanternlight"]));
  assert.equal(ui.document.activeElement, chip, "focus kept on the activated chip");
  assert.equal(chip.getAttribute("aria-pressed"), "true");
});

test("UI: when the pressed chip's card hides, focus moves to the tag bar", async () => {
  const ui = await boot({ search: "?tags=games,cli" });
  const chip = [...ui.$("project-lanternlight").walk()]
    .find((n) => n.tagName === "BUTTON" && n.dataset.tag === "games");
  chip.focus();
  chip.click();                       // deselect "games": lanternlight (no cli tag) hides
  assert.equal(ui.$("project-lanternlight").hidden, true);
  const bar = ui.barTag("games");
  const expected = bar.hidden ? ui.$("pj-tag-more") : bar;
  assert.equal(ui.document.activeElement, expected, "focus lands on a visible, related control");
  assert.notEqual(ui.document.activeElement, chip);
});

test("UI: deselecting a collapsed tag in the bar moves focus to the expander", async () => {
  const ui = await boot();
  const all = Core.tagCounts(Core.normalize(DATA).projects);
  const rare = all[all.length - 1].tag;          // ranked past the collapsed limit
  ui.$("pj-tag-more").click();                   // expand
  const btn = ui.barTag(rare);
  btn.click();                                   // select
  ui.$("pj-tag-more").click();                   // collapse: stays visible while selected
  assert.equal(btn.hidden, false);
  btn.focus();
  btn.click();                                   // deselect: button hides when collapsed
  assert.equal(btn.hidden, true);
  assert.equal(ui.document.activeElement, ui.$("pj-tag-more"));
});
