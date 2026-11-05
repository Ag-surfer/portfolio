'use strict';
// Static checks for about.html / contact.html: shared chrome, landmarks, a11y wiring.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pages = ['about.html', 'contact.html'];
const html = Object.fromEntries(pages.map((p) => [p, fs.readFileSync(path.join(root, p), 'utf8')]));

const between = (src, open, close) => {
  const start = src.indexOf(open);
  const end = src.indexOf(close, start);
  assert.ok(start !== -1 && end !== -1, `missing ${open}…${close}`);
  return src.slice(start, end + close.length);
};
const ids = (src) => [...src.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
// Normalise the one intended difference: which nav link is the current page.
const chrome = (src) => ({
  header: between(src, '<header', '</header>').replace(/ aria-current="page"/g, ''),
  footer: between(src, '<footer', '</footer>'),
  skip: between(src, '<a class="skip-link"', '</a>'),
});

test('header, footer and skip link are identical across pages', () => {
  const [a, b] = pages.map((p) => chrome(html[p]));
  assert.equal(a.header, b.header);
  assert.equal(a.footer, b.footer);
  assert.equal(a.skip, b.skip);
});

for (const page of pages) {
  test(`${page}: document basics and landmarks`, () => {
    const src = html[page];
    assert.match(src, /^<!DOCTYPE html>/);
    assert.match(src, /<html lang="en">/);
    assert.match(src, /<meta name="viewport"/);
    assert.match(src, /<link rel="stylesheet" href="css\/pages.css">/);
    assert.equal((src.match(/<h1[\s>]/g) || []).length, 1, 'exactly one h1');
    assert.match(src, /<main id="main"/);
    assert.match(src, /<a class="skip-link" href="#main">/);
    assert.match(src, /<nav class="site-nav" aria-label="Main">/);
  });

  test(`${page}: nav marks itself as the current page`, () => {
    const current = [...html[page].matchAll(/<a href="([^"]+)" aria-current="page">/g)].map((m) => m[1]);
    assert.deepEqual(current, [page]);
  });

  test(`${page}: ids are unique and every ARIA/label reference resolves`, () => {
    const src = html[page];
    const all = ids(src);
    assert.equal(new Set(all).size, all.length, `duplicate ids: ${all.filter((x, i) => all.indexOf(x) !== i)}`);
    const refs = [
      ...[...src.matchAll(/aria-(?:labelledby|describedby)="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)),
      ...[...src.matchAll(/<label for="([^"]+)"/g)].map((m) => m[1]),
    ];
    for (const ref of refs) assert.ok(all.includes(ref), `dangling reference to #${ref}`);
  });

  test(`${page}: local links point at files that exist or belong to other lanes`, () => {
    const otherLanes = new Set(['index.html', 'projects.html']);
    const local = [...html[page].matchAll(/(?:href|src)="([^"#:]+)"/g)].map((m) => m[1]);
    for (const ref of local) {
      if (otherLanes.has(ref)) continue;
      assert.ok(fs.existsSync(path.join(root, ref)), `${ref} is missing`);
    }
  });
}

test('contact form: every control is labelled, required fields carry an error slot', () => {
  const form = between(html['contact.html'], '<form', '</form>');
  assert.match(form, /novalidate/);
  const controls = [...form.matchAll(/<(input|select|textarea)\b[^>]*\sid="([^"]+)"/g)].map((m) => m[2]);
  assert.deepEqual(controls, ['name', 'email', 'topic', 'message', 'website']);
  for (const id of controls) assert.match(form, new RegExp(`<label for="${id}"`), `${id} has no label`);
  for (const id of ['name', 'email', 'topic', 'message']) {
    assert.match(form, new RegExp(`id="${id}"[^>]*\\srequired`), `${id} not required`);
    assert.match(form, new RegExp(`id="${id}"[^>]*aria-describedby="[^"]*${id}-error`), `${id} error not described`);
  }
  assert.match(form, /id="website"[^>]*tabindex="-1"/, 'honeypot must be out of tab order');
});
