// Projects showcase: loads data/projects.json and renders filterable cards.
(function () {
  "use strict";

  var DATA_URL = "data/projects.json";
  var STATUS_LABEL = { active: "Active", shipped: "Shipped", wip: "In progress", archived: "Archived" };

  var grid = document.getElementById("pj-grid");
  var filters = document.getElementById("pj-filters");
  var count = document.getElementById("pj-count");
  var projects = [];
  var activeTag = "all";

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (text != null) node.textContent = text;
    return node;
  }

  function sortProjects(list) {
    return list.slice().sort(function (a, b) {
      if (!!b.featured !== !!a.featured) return b.featured ? 1 : -1;
      return (b.year || 0) - (a.year || 0);
    });
  }

  function card(p) {
    var li = el("li", { "class": "pj-card" + (p.featured ? " is-featured" : ""), id: "project-" + p.slug });
    var head = el("div", { "class": "pj-card-head" });
    head.appendChild(el("h2", null, p.title));
    if (p.year) head.appendChild(el("span", { "class": "pj-year" }, String(p.year)));
    li.appendChild(head);
    li.appendChild(el("p", { "class": "pj-summary" }, p.summary || ""));

    var meta = el("div", { "class": "pj-meta" });
    if (p.status) meta.appendChild(el("span", { "class": "pj-status", "data-status": p.status }, STATUS_LABEL[p.status] || p.status));
    (p.tags || []).forEach(function (t) { meta.appendChild(el("span", { "class": "pj-tag" }, t)); });
    li.appendChild(meta);

    var links = p.links || {};
    if (links.repo || links.demo) {
      var row = el("div", { "class": "pj-links" });
      if (links.demo) row.appendChild(el("a", { href: links.demo }, "Live demo"));
      if (links.repo) row.appendChild(el("a", { href: links.repo }, "Source"));
      li.appendChild(row);
    }
    return li;
  }

  function render() {
    var visible = projects.filter(function (p) {
      return activeTag === "all" || (p.tags || []).indexOf(activeTag) !== -1;
    });
    grid.replaceChildren.apply(grid, visible.map(card));
    count.textContent = visible.length + " of " + projects.length + " projects";
    Array.prototype.forEach.call(filters.children, function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.tag === activeTag));
    });
  }

  function buildFilters() {
    var tags = {};
    projects.forEach(function (p) { (p.tags || []).forEach(function (t) { tags[t] = (tags[t] || 0) + 1; }); });
    var names = ["all"].concat(Object.keys(tags).sort());
    names.forEach(function (t) {
      var b = el("button", { type: "button", "class": "pj-filter", "data-tag": t, "aria-pressed": "false" },
        t === "all" ? "All" : t + " (" + tags[t] + ")");
      b.addEventListener("click", function () { activeTag = t; render(); });
      filters.appendChild(b);
    });
  }

  function fail(msg) {
    count.textContent = "";
    grid.replaceChildren(el("li", { "class": "pj-error" }, msg));
  }

  fetch(DATA_URL)
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (data) {
      projects = sortProjects(Array.isArray(data) ? data : data.projects || []);
      if (!projects.length) return fail("No projects yet.");
      buildFilters();
      render();
    })
    .catch(function (err) {
      var hint = location.protocol === "file:" ? " Serve the site over HTTP (e.g. python3 -m http.server)." : "";
      fail("Could not load projects (" + err.message + ")." + hint);
    });
})();
