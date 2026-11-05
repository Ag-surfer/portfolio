/*
 * Contact form: client-side validation + mailto hand-off (no backend yet).
 * Pure validation lives in `validateContact` so it can be unit-tested in Node.
 */
(function (root) {
  'use strict';

  var LIMITS = { nameMax: 100, emailMax: 254, messageMin: 20, messageMax: 2000 };
  var TOPICS = { role: 'Job opportunity', project: 'Freelance project', collab: 'Collaboration', other: 'Something else' };
  // Pragmatic check: one @, no spaces, a dot in the domain, no leading/trailing dot.
  var EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

  function clean(v) { return typeof v === 'string' ? v.trim() : ''; }

  /** Returns { field: message } for each invalid field; empty object when valid. */
  function validateContact(values) {
    var v = values || {};
    var name = clean(v.name);
    var email = clean(v.email);
    var topic = clean(v.topic);
    var message = clean(v.message);
    var errors = {};

    if (!name) errors.name = 'Enter your name.';
    else if (name.length > LIMITS.nameMax) errors.name = 'Name must be ' + LIMITS.nameMax + ' characters or fewer.';

    if (!email) errors.email = 'Enter your email address.';
    else if (email.length > LIMITS.emailMax || !EMAIL_RE.test(email)) errors.email = 'Enter an email address like name@example.com.';

    if (!topic) errors.topic = 'Choose a topic.';
    else if (!Object.prototype.hasOwnProperty.call(TOPICS, topic)) errors.topic = 'Choose a topic from the list.';

    if (!message) errors.message = 'Enter a message.';
    else if (message.length < LIMITS.messageMin) errors.message = 'Message must be at least ' + LIMITS.messageMin + ' characters (currently ' + message.length + ').';
    else if (message.length > LIMITS.messageMax) errors.message = 'Message must be ' + LIMITS.messageMax + ' characters or fewer.';

    return errors;
  }

  /** Builds the mailto: URL for a valid submission. */
  function buildMailto(recipient, values) {
    var subject = '[Portfolio] ' + (TOPICS[clean(values.topic)] || 'Message') + ' from ' + clean(values.name);
    var body = clean(values.message) + '\n\n— ' + clean(values.name) + ' <' + clean(values.email) + '>';
    return 'mailto:' + recipient + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  }

  var api = { validateContact: validateContact, buildMailto: buildMailto, LIMITS: LIMITS, TOPICS: TOPICS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;
  root.ContactForm = api;

  var FIELDS = ['name', 'email', 'topic', 'message'];
  var LABELS = { name: 'Name', email: 'Email', topic: 'Topic', message: 'Message' };

  function init() {
    var form = document.getElementById('contact-form');
    if (!form) return;
    var summary = document.getElementById('form-errors');
    var summaryList = summary.querySelector('ul');
    var status = document.getElementById('form-status');
    var counter = document.getElementById('message-counter');
    var recipient = form.getAttribute('action').replace(/^mailto:/, '');
    var touched = {};

    function values() {
      var out = {};
      FIELDS.forEach(function (f) { out[f] = form.elements[f].value; });
      return out;
    }

    function showFieldError(field, msg) {
      var input = form.elements[field];
      var slot = document.getElementById(field + '-error');
      if (msg) { input.setAttribute('aria-invalid', 'true'); slot.textContent = msg; }
      else { input.removeAttribute('aria-invalid'); slot.textContent = ''; }
    }

    function setStatus(text) {
      status.className = text ? 'alert alert-success' : '';
      status.textContent = text;
    }

    function updateCounter() {
      var len = form.elements.message.value.trim().length;
      counter.textContent = len + ' / ' + LIMITS.messageMax;
      counter.classList.toggle('over', len > LIMITS.messageMax);
    }

    function checkField(field) {
      showFieldError(field, validateContact(values())[field]);
    }

    FIELDS.forEach(function (field) {
      var input = form.elements[field];
      input.addEventListener('blur', function () {
        if (input.value.trim() !== '' || touched[field]) { touched[field] = true; checkField(field); }
      });
      input.addEventListener(field === 'topic' ? 'change' : 'input', function () {
        // Re-validate live only once the user has seen an error, so typing isn't nagged.
        if (touched[field] || input.getAttribute('aria-invalid') === 'true') checkField(field);
      });
    });
    form.elements.message.addEventListener('input', updateCounter);
    updateCounter();

    summaryList.addEventListener('click', function (e) {
      var link = e.target.closest('a[data-field]');
      if (!link) return;
      e.preventDefault();
      form.elements[link.getAttribute('data-field')].focus();
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      setStatus('');

      // Honeypot filled in: almost certainly a bot. Pretend success, send nothing.
      if (form.elements.website.value) { form.reset(); updateCounter(); setStatus('Thanks, your message is ready to send.'); return; }

      var data = values();
      var errors = validateContact(data);
      var invalid = FIELDS.filter(function (f) { return errors[f]; });

      FIELDS.forEach(function (f) { touched[f] = true; showFieldError(f, errors[f]); });

      if (invalid.length) {
        summaryList.textContent = '';
        invalid.forEach(function (f) {
          var li = document.createElement('li');
          var a = document.createElement('a');
          a.href = '#' + f;
          a.setAttribute('data-field', f);
          a.textContent = LABELS[f] + ': ' + errors[f];
          li.appendChild(a);
          summaryList.appendChild(li);
        });
        summary.hidden = false;
        summary.focus();
        return;
      }

      summary.hidden = true;
      window.location.href = buildMailto(recipient, data);
      setStatus('Your email app should open with the message filled in. If it doesn’t, email ' + recipient + ' directly.');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);
