'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateContact, buildMailto, LIMITS } = require('../js/contact-form.js');

const valid = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  topic: 'project',
  message: 'I would like to talk about a project.',
};

test('accepts a complete, valid submission', () => {
  assert.deepEqual(validateContact(valid), {});
});

test('requires every field', () => {
  const errors = validateContact({});
  assert.deepEqual(Object.keys(errors).sort(), ['email', 'message', 'name', 'topic']);
});

test('treats whitespace-only values as empty', () => {
  const errors = validateContact({ name: '   ', email: ' ', topic: ' ', message: '\n\t' });
  assert.equal(errors.name, 'Enter your name.');
  assert.equal(errors.email, 'Enter your email address.');
  assert.equal(errors.topic, 'Choose a topic.');
  assert.equal(errors.message, 'Enter a message.');
});

test('rejects malformed emails', () => {
  for (const email of ['ada', 'ada@', '@example.com', 'ada@example', 'a da@example.com', 'ada@@example.com', 'ada@.com', 'ada@example.']) {
    assert.ok(validateContact({ ...valid, email }).email, `expected ${JSON.stringify(email)} to be rejected`);
  }
});

test('accepts common real-world emails', () => {
  for (const email of ['a@b.co', 'first.last+tag@sub.example.co.uk', ' padded@example.com ']) {
    assert.equal(validateContact({ ...valid, email }).email, undefined, email);
  }
});

test('rejects topics not in the list', () => {
  assert.ok(validateContact({ ...valid, topic: 'spam' }).topic);
  assert.ok(validateContact({ ...valid, topic: 'toString' }).topic);
});

test('enforces message length bounds and reports current length', () => {
  const short = validateContact({ ...valid, message: 'too short' });
  assert.match(short.message, /at least 20 characters \(currently 9\)/);
  assert.equal(validateContact({ ...valid, message: 'x'.repeat(LIMITS.messageMin) }).message, undefined);
  assert.equal(validateContact({ ...valid, message: 'x'.repeat(LIMITS.messageMax) }).message, undefined);
  assert.ok(validateContact({ ...valid, message: 'x'.repeat(LIMITS.messageMax + 1) }).message);
});

test('enforces name length', () => {
  assert.ok(validateContact({ ...valid, name: 'x'.repeat(LIMITS.nameMax + 1) }).name);
});

test('buildMailto encodes subject and body', () => {
  const url = buildMailto('hello@example.com', { ...valid, message: 'Hi & bye?\nline 2' });
  assert.ok(url.startsWith('mailto:hello@example.com?subject='));
  const params = new URLSearchParams(url.split('?')[1]);
  assert.equal(params.get('subject'), '[Portfolio] Freelance project from Ada Lovelace');
  assert.equal(params.get('body'), 'Hi & bye?\nline 2\n\n— Ada Lovelace <ada@example.com>');
});
