# Project data

`projects.json` feeds `projects.html`. Shape: `{ "version": 1, "projects": [ ... ] }`.

| Field        | Type     | Required | Notes                                                          |
|--------------|----------|----------|----------------------------------------------------------------|
| `slug`       | string   | yes      | Unique, lowercase kebab-case. Card anchor: `#project-<slug>`.  |
| `title`      | string   | yes      | Card heading.                                                  |
| `summary`    | string   |          | One or two sentences (20–160 chars, checked by the tests).     |
| `role`       | string   |          | Your role, e.g. "Solo developer".                              |
| `year`       | integer  |          | Used by the Newest/Oldest sorts.                               |
| `status`     | string   |          | `active`, `shipped`, `wip` or `archived`.                      |
| `featured`   | boolean  |          | Sorts first under "Featured first" and gets an accent.         |
| `tags`       | string[] |          | Filter chips (match any). Lowercased; keep the set small.      |
| `stack`      | string[] |          | Shown as tech badges; searchable.                              |
| `highlights` | string[] |          | Shown in a collapsible "Highlights" list; searchable.          |
| `links`      | object   |          | `demo`, `repo`, `writeup`. Missing or empty hides the link. Only `http(s):`, `mailto:` and relative URLs are kept. |

Invalid entries (bad slug, missing title, duplicate slug) are skipped with a
console warning instead of breaking the page. The sample entries are
placeholders; links point at `example.com`.

## Page behaviour

- Search matches title, summary, role, tags, stack, highlights and year; all
  words must match. Press `/` to focus search, `Escape` to clear it.
- Filters live in the URL (`?q=&tags=a,b&status=&sort=`), so a filtered view
  can be shared or bookmarked. `#project-<slug>` deep-links to a card.
- Only the 8 most-used tags show until "Show all tags" is pressed; selected
  tags always stay visible.

## Preview and tests

    python3 -m http.server     # then open http://localhost:8000/projects.html
    node scripts/test-projects.mjs    # unit + UI tests, no dependencies
    ./scripts/smoke-projects          # tests above + headless Chromium checks

`fetch` does not work over `file://`, so preview through a local server.
