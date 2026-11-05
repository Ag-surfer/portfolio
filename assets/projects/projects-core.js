// Pure, DOM-free logic for the projects showcase: data normalization,
// filtering, sorting and URL state. Works in the browser (window.ProjectsCore)
// and in Node (module.exports) so it can be unit-tested without a browser.
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ProjectsCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var STATUSES = ["active", "shipped", "wip", "archived"];
  var STATUS_LABEL = { active: "Active", shipped: "Shipped", wip: "In progress", archived: "Archived" };
  var SORTS = ["featured", "newest", "oldest", "title"];
  var SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  function str(v) { return typeof v === "string" ? v.trim() : ""; }

  function strList(v, lower) {
    if (!Array.isArray(v)) return [];
    var seen = Object.create(null);
    var out = [];
    v.forEach(function (x) {
      var s = lower ? str(x).toLowerCase() : str(x);
      if (s && !seen[s]) { seen[s] = true; out.push(s); }
    });
    return out;
  }

  var SAFE_PROTOCOLS = { "http:": true, "https:": true, "mailto:": true };

  function safeUrl(v) {
    var s = str(v);
    if (!s) return "";
    // Parse the way the browser will (the URL parser strips tabs/newlines, so
    // "java\tscript:" resolves to javascript:). Relative links resolve against
    // an http base and pass; anything else must use an allowlisted protocol.
    try {
      return SAFE_PROTOCOLS[new URL(s, "http://relative.invalid/").protocol] ? s : "";
    } catch (e) {
      return "";
    }
  }

  /**
   * Validate and normalize raw JSON. Accepts {projects: [...]} or a bare array.
   * Invalid entries are dropped and reported in `warnings` instead of throwing,
   * so one bad record never blanks the whole page.
   */
  function normalize(raw) {
    var list = Array.isArray(raw) ? raw : raw && Array.isArray(raw.projects) ? raw.projects : null;
    var warnings = [];
    if (!list) return { projects: [], warnings: ["Data has no projects array."] };

    var slugs = {};
    var projects = [];
    list.forEach(function (p, i) {
      if (!p || typeof p !== "object") { warnings.push("Entry " + i + " is not an object."); return; }
      var slug = str(p.slug);
      var title = str(p.title);
      if (!SLUG_RE.test(slug)) { warnings.push("Entry " + i + " has an invalid slug."); return; }
      if (!title) { warnings.push("Project '" + slug + "' has no title."); return; }
      if (slugs[slug]) { warnings.push("Duplicate slug '" + slug + "' skipped."); return; }
      slugs[slug] = true;

      var status = STATUSES.indexOf(p.status) !== -1 ? p.status : "";
      if (p.status && !status) warnings.push("Project '" + slug + "' has unknown status '" + p.status + "'.");
      var year = Number.isInteger(p.year) ? p.year : null;
      var links = p.links && typeof p.links === "object" ? p.links : {};

      var proj = {
        slug: slug,
        title: title,
        summary: str(p.summary),
        role: str(p.role),
        year: year,
        status: status,
        featured: p.featured === true,
        tags: strList(p.tags, true),
        stack: strList(p.stack),
        highlights: strList(p.highlights),
        links: { demo: safeUrl(links.demo), repo: safeUrl(links.repo), writeup: safeUrl(links.writeup) },
        order: projects.length
      };
      proj.searchText = [proj.title, proj.summary, proj.role, proj.tags.join(" "), proj.stack.join(" "),
        proj.highlights.join(" "), proj.year || ""].join(" ").toLowerCase();
      projects.push(proj);
    });
    return { projects: projects, warnings: warnings };
  }

  /** Tag -> count, sorted by count desc then name. */
  function tagCounts(projects) {
    var counts = {};
    projects.forEach(function (p) { p.tags.forEach(function (t) { counts[t] = (counts[t] || 0) + 1; }); });
    return Object.keys(counts)
      .map(function (t) { return { tag: t, count: counts[t] }; })
      .sort(function (a, b) { return b.count - a.count || (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0); });
  }

  function statusCounts(projects) {
    var counts = {};
    projects.forEach(function (p) { if (p.status) counts[p.status] = (counts[p.status] || 0) + 1; });
    return STATUSES.filter(function (s) { return counts[s]; }).map(function (s) {
      return { status: s, label: STATUS_LABEL[s], count: counts[s] };
    });
  }

  function emptyState() { return { q: "", tags: [], status: "", sort: "featured" }; }

  function isFiltered(state) { return !!(state.q || state.tags.length || state.status); }

  /**
   * Projects matching every query term (AND), any selected tag (OR) and the status.
   * Returns a new array; input order is preserved.
   */
  function filter(projects, state) {
    var terms = str(state.q).toLowerCase().split(/\s+/).filter(Boolean);
    var tags = state.tags || [];
    return projects.filter(function (p) {
      if (state.status && p.status !== state.status) return false;
      if (tags.length && !tags.some(function (t) { return p.tags.indexOf(t) !== -1; })) return false;
      for (var i = 0; i < terms.length; i++) if (p.searchText.indexOf(terms[i]) === -1) return false;
      return true;
    });
  }

  function byTitle(a, b) { return a.title.localeCompare(b.title, undefined, { sensitivity: "base" }); }
  function byYearDesc(a, b) { return (b.year || 0) - (a.year || 0); }

  /** Stable sort; ties fall back to the order in the data file. */
  function sort(projects, mode) {
    var cmp = {
      featured: function (a, b) { return (b.featured - a.featured) || byYearDesc(a, b); },
      newest: byYearDesc,
      oldest: function (a, b) { return (a.year || 9999) - (b.year || 9999); },
      title: byTitle
    }[mode] || null;
    var out = projects.slice();
    if (!cmp) cmp = function (a, b) { return (b.featured - a.featured) || byYearDesc(a, b); };
    return out.sort(function (a, b) { return cmp(a, b) || a.order - b.order; });
  }

  /** Parse ?q=&tags=a,b&status=&sort= into a state, dropping unknown values. */
  function parseState(search, knownTags) {
    var params = new URLSearchParams(search || "");
    var s = emptyState();
    s.q = (params.get("q") || "").slice(0, 100);
    var known = knownTags || null;
    s.tags = strList((params.get("tags") || "").split(","), true).filter(function (t) { return !known || known.indexOf(t) !== -1; });
    var status = params.get("status") || "";
    s.status = STATUSES.indexOf(status) !== -1 ? status : "";
    var sortMode = params.get("sort") || "";
    s.sort = SORTS.indexOf(sortMode) !== -1 ? sortMode : "featured";
    return s;
  }

  /** Inverse of parseState; omits defaults so the clean URL stays clean. */
  function serializeState(state) {
    var params = new URLSearchParams();
    if (state.q) params.set("q", state.q);
    if (state.tags.length) params.set("tags", state.tags.join(","));
    if (state.status) params.set("status", state.status);
    if (state.sort && state.sort !== "featured") params.set("sort", state.sort);
    var qs = params.toString();
    return qs ? "?" + qs : "";
  }

  return {
    STATUSES: STATUSES,
    STATUS_LABEL: STATUS_LABEL,
    SORTS: SORTS,
    normalize: normalize,
    tagCounts: tagCounts,
    statusCounts: statusCounts,
    emptyState: emptyState,
    isFiltered: isFiltered,
    filter: filter,
    sort: sort,
    parseState: parseState,
    serializeState: serializeState
  };
});
