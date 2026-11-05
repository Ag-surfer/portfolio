# Project data

`projects.json` feeds `projects.html`. Each entry:

| Field      | Type     | Notes                                              |
|------------|----------|----------------------------------------------------|
| `slug`     | string   | Unique; used as the card anchor `#project-<slug>`. |
| `title`    | string   | Card heading.                                      |
| `summary`  | string   | One or two sentences.                              |
| `year`     | number   | Sort key (newest first, after featured).           |
| `status`   | string   | `active`, `shipped`, `wip` or `archived`.          |
| `featured` | boolean  | Featured projects sort first and get an accent.    |
| `tags`     | string[] | Drive the tag filter buttons.                      |
| `links`    | object   | `repo` and `demo` URLs; empty string hides a link. |

The sample entries are placeholders; replace them with real projects.

Preview: `python3 -m http.server` from the repo root, then open
<http://localhost:8000/projects.html> (`fetch` does not work over `file://`).
Smoke check: `./scripts/smoke-projects`.
