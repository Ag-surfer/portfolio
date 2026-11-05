// Projects showcase UI. Pure logic lives in projects-core.js (ProjectsCore).
// Cards are built once; filtering toggles `hidden` and only reorders nodes
// when the visible sequence actually changes.
(function () {
  "use strict";

  var Core = window.ProjectsCore;
  var DATA_URL = "data/projects.json";
  var VISIBLE_TAGS = 8;       // tags shown before "Show all"
  var SEARCH_DEBOUNCE_MS = 120;

  var $ = function (id) { return document.getElementById(id); };
  var ui = {
    q: $("pj-q"),
    status: $("pj-status"),
    sort: $("pj-sort"),
    tagList: $("pj-tag-list"),
    tagMore: $("pj-tag-more"),
    count: $("pj-count"),
    clear: $("pj-clear"),
    grid: $("pj-grid"),
    empty: $("pj-empty"),
    emptyClear: $("pj-empty-clear"),
    error: $("pj-error"),
    controls: $("pj-controls")
  };

  var projects = [];
  var cards = Object.create(null);   // slug -> <li>
  var tagButtons = [];               // filter-bar buttons, ranked by count
  var cardChips = [];                // tag buttons inside cards
  var state = Core.emptyState();
  var lastOrder = "";
  var tagsExpanded = false;
  var searchTimer = 0;

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    if (attrs) for (var k in attrs) if (attrs[k] != null) node.setAttribute(k, attrs[k]);
    if (text != null) node.textContent = text;
    return node;
  }

  // ---- card construction (once per project) ----

  function buildCard(p) {
    var li = el("li", { "class": "pj-card" + (p.featured ? " is-featured" : ""), id: "project-" + p.slug });
    var art = el("article", { "aria-labelledby": "pj-title-" + p.slug });

    var head = el("header", { "class": "pj-card-head" });
    head.appendChild(el("h2", { id: "pj-title-" + p.slug }, p.title));
    if (p.year) head.appendChild(el("span", { "class": "pj-year" }, String(p.year)));
    art.appendChild(head);

    var meta = el("p", { "class": "pj-meta" });
    if (p.featured) meta.appendChild(el("span", { "class": "pj-badge" }, "Featured"));
    if (p.status) meta.appendChild(el("span", { "class": "pj-status", "data-status": p.status }, Core.STATUS_LABEL[p.status]));
    if (p.role) meta.appendChild(el("span", { "class": "pj-role" }, p.role));
    if (meta.firstChild) art.appendChild(meta);

    if (p.summary) art.appendChild(el("p", { "class": "pj-summary" }, p.summary));

    if (p.stack.length) {
      var stack = el("ul", { "class": "pj-stack", "aria-label": "Tech stack" });
      p.stack.forEach(function (s) { stack.appendChild(el("li", null, s)); });
      art.appendChild(stack);
    }

    if (p.highlights.length) {
      var det = el("details", { "class": "pj-details" });
      det.appendChild(el("summary", null, "Highlights (" + p.highlights.length + ")"));
      var hl = el("ul");
      p.highlights.forEach(function (h) { hl.appendChild(el("li", null, h)); });
      det.appendChild(hl);
      art.appendChild(det);
    }

    if (p.tags.length) {
      var tags = el("div", { "class": "pj-card-tags", role: "group", "aria-label": "Filter by tag" });
      p.tags.forEach(function (t) {
        var chip = el("button", { type: "button", "class": "pj-chip pj-chip-sm", "data-tag": t, "aria-pressed": "false" }, t);
        cardChips.push(chip);
        tags.appendChild(chip);
      });
      art.appendChild(tags);
    }

    var L = p.links;
    if (L.demo || L.repo || L.writeup) {
      var row = el("p", { "class": "pj-links" });
      [["demo", "Live demo"], ["repo", "Source"], ["writeup", "Write-up"]].forEach(function (pair) {
        var href = L[pair[0]];
        if (!href) return;
        var a = el("a", { href: href, rel: /^https?:/i.test(href) ? "noopener noreferrer" : null }, pair[1]);
        a.appendChild(el("span", { "class": "pj-sr" }, " for " + p.title));
        row.appendChild(a);
      });
      art.appendChild(row);
    }

    li.appendChild(art);
    return li;
  }

  // ---- controls ----

  function buildTagFilters() {
    var frag = document.createDocumentFragment();
    Core.tagCounts(projects).forEach(function (tc, i) {
      var b = el("button", {
        type: "button", "class": "pj-chip", "data-tag": tc.tag, "data-rank": String(i),
        "aria-pressed": "false", "aria-label": tc.tag + ", " + tc.count + (tc.count === 1 ? " project" : " projects")
      });
      b.appendChild(el("span", null, tc.tag));
      b.appendChild(el("span", { "class": "pj-chip-count", "aria-hidden": "true" }, String(tc.count)));
      tagButtons.push(b);
      frag.appendChild(b);
    });
    ui.tagList.appendChild(frag);
    var extra = tagButtons.length - VISIBLE_TAGS;
    if (extra > 0) {
      ui.tagMore.hidden = false;
      ui.tagMore.dataset.extra = String(extra);
    }
  }

  function buildStatusOptions() {
    Core.statusCounts(projects).forEach(function (s) {
      ui.status.appendChild(el("option", { value: s.status }, s.label + " (" + s.count + ")"));
    });
  }

  function syncControls() {
    if (ui.q.value.trim() !== state.q) ui.q.value = state.q;
    ui.status.value = state.status;
    ui.sort.value = state.sort;

    var selected = Object.create(null);
    state.tags.forEach(function (t) { selected[t] = true; });
    tagButtons.forEach(function (b) {
      var on = !!selected[b.dataset.tag];
      b.setAttribute("aria-pressed", String(on));
      // Collapsed: show the top tags plus any selected ones, so active filters are never hidden.
      b.hidden = !tagsExpanded && Number(b.dataset.rank) >= VISIBLE_TAGS && !on;
    });
    cardChips.forEach(function (c) { c.setAttribute("aria-pressed", String(!!selected[c.dataset.tag])); });
    if (!ui.tagMore.hidden) {
      ui.tagMore.setAttribute("aria-expanded", String(tagsExpanded));
      ui.tagMore.textContent = tagsExpanded ? "Show fewer tags" : "Show all tags (+" + ui.tagMore.dataset.extra + ")";
    }
    ui.clear.hidden = !Core.isFiltered(state);
  }

  // ---- render ----

  function describe(n) {
    var total = projects.length;
    var msg = n === total ? "Showing all " + total + " projects" : "Showing " + n + " of " + total + " projects";
    var parts = [];
    if (state.q) parts.push("matching “" + state.q + "”");
    if (state.tags.length) parts.push("tagged " + state.tags.join(" or "));
    if (state.status) parts.push("with status " + Core.STATUS_LABEL[state.status].toLowerCase());
    return parts.length ? msg + " " + parts.join(", ") : msg;
  }

  function render() {
    var visible = Core.sort(Core.filter(projects, state), state.sort);
    var show = Object.create(null);
    visible.forEach(function (p) { show[p.slug] = true; });

    // Reorder only when the visible sequence changed, in one batched append.
    var order = visible.map(function (p) { return p.slug; }).join(",");
    if (order !== lastOrder) {
      var frag = document.createDocumentFragment();
      visible.forEach(function (p) { frag.appendChild(cards[p.slug]); });
      projects.forEach(function (p) { if (!show[p.slug]) frag.appendChild(cards[p.slug]); });
      ui.grid.appendChild(frag);
      lastOrder = order;
    }
    projects.forEach(function (p) {
      var hide = !show[p.slug];
      if (cards[p.slug].hidden !== hide) cards[p.slug].hidden = hide;
    });

    ui.empty.hidden = visible.length > 0;
    ui.grid.hidden = visible.length === 0;
    var text = describe(visible.length);
    if (ui.count.textContent !== text) ui.count.textContent = text;
    syncControls();
    writeUrl();
  }

  function writeUrl() {
    var next = location.pathname + Core.serializeState(state) + location.hash;
    if (next !== location.pathname + location.search + location.hash) {
      try { history.replaceState(null, "", next); } catch (e) { /* e.g. sandboxed iframe */ }
    }
  }

  function setState(patch) {
    for (var k in patch) state[k] = patch[k];
    render();
  }

  function toggleTag(tag) {
    var tags = state.tags.slice();
    var i = tags.indexOf(tag);
    if (i === -1) tags.push(tag); else tags.splice(i, 1);
    setState({ tags: tags });
  }

  function clearFilters() {
    clearTimeout(searchTimer);
    setState({ q: "", tags: [], status: "" });
    ui.q.focus();
  }

  // ---- events ----

  function bindEvents() {
    ui.q.addEventListener("input", function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () { setState({ q: ui.q.value.trim() }); }, SEARCH_DEBOUNCE_MS);
    });
    ui.q.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && ui.q.value) {
        e.preventDefault();
        clearTimeout(searchTimer);
        ui.q.value = "";
        setState({ q: "" });
      } else if (e.key === "Enter") {
        e.preventDefault();
        clearTimeout(searchTimer);
        setState({ q: ui.q.value.trim() });
      }
    });
    ui.status.addEventListener("change", function () { setState({ status: ui.status.value }); });
    ui.sort.addEventListener("change", function () { setState({ sort: ui.sort.value }); });

    // Delegated: one listener for the tag bar, one for every card's chips.
    function onChip(e) {
      var b = e.target.closest("button[data-tag]");
      if (b) toggleTag(b.dataset.tag);
    }
    ui.tagList.addEventListener("click", onChip);
    ui.grid.addEventListener("click", onChip);

    ui.tagMore.addEventListener("click", function () {
      tagsExpanded = !tagsExpanded;
      syncControls();
    });
    ui.clear.addEventListener("click", clearFilters);
    ui.emptyClear.addEventListener("click", clearFilters);

    // "/" jumps to search from anywhere that is not already a form field.
    document.addEventListener("keydown", function (e) {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      var t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      ui.q.focus();
      ui.q.select();
    });
  }

  // ---- boot ----

  function showError(msg) {
    ui.grid.removeAttribute("aria-busy");
    ui.grid.replaceChildren();
    ui.grid.hidden = true;
    ui.controls.hidden = true;
    ui.count.textContent = "";
    ui.error.querySelector("p").textContent = msg;
    ui.error.hidden = false;
  }

  function boot(raw) {
    var result = Core.normalize(raw);
    result.warnings.forEach(function (w) { console.warn("[projects]", w); });
    projects = result.projects;
    if (!projects.length) {
      showError("No projects to show yet.");
      return;
    }

    var frag = document.createDocumentFragment();
    projects.forEach(function (p) { cards[p.slug] = buildCard(p); frag.appendChild(cards[p.slug]); });
    ui.grid.replaceChildren(frag);
    ui.grid.removeAttribute("aria-busy");

    buildTagFilters();
    buildStatusOptions();
    state = Core.parseState(location.search, tagButtons.map(function (b) { return b.dataset.tag; }));
    ui.controls.hidden = false;
    bindEvents();
    render();

    // Deep link (#project-slug): if filters from the URL hide that card, drop them.
    var id = location.hash ? decodeURIComponent(location.hash.slice(1)) : "";
    var target = id && document.getElementById(id);
    if (target && target.classList.contains("pj-card")) {
      if (target.hidden) setState({ q: "", tags: [], status: "" });
      target.scrollIntoView();
    }
  }

  if (!Core) {
    showError("Projects could not be loaded (missing projects-core.js).");
    return;
  }

  fetch(DATA_URL)
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(boot)
    .catch(function (err) {
      console.error("[projects]", err);
      var hint = location.protocol === "file:" ? " Serve the site over HTTP, for example with python3 -m http.server." : "";
      showError("Projects could not be loaded (" + err.message + ")." + hint);
    });
})();
