# Skill Atlas

Every agent skill in a repository or organization: `./skill-atlas scan` finds each `SKILL.md` and prints its name,
description and link.

Requires Node 24 or newer. To scan an entire GitHub organization, pass its profile URL:

```console
npm ci
./skill-atlas scan https://github.com/JetBrains
```

The report starts with the organization name, project count and total skill count, followed by
the skills in each project. Progress goes to stderr; the final report goes to stdout. All visible
repositories are included, including forks, archived projects and projects without skills. Copies
count once within a project; the same skill in two projects counts twice. A failure stops the scan
with an error instead of showing incomplete totals.

```console
$ npm ci
$ ./skill-atlas scan https://github.com/JetBrains/kotlin
JetBrains/kotlin · 6 skills
…
build-tools-bump-gradle-api — Bumps the Gradle API version that Kotlin Gradle plugins are compiled against in the Kotlin compiler repository.
  https://github.com/JetBrains/kotlin/blob/5ab6270ab772d113e8ad52ebfcaa0109c522ae00/.claude/skills/build-tools-bump-gradle-api/SKILL.md
…
```

Or as a web page (Node 24+; `PORT`, default 3000):

```console
$ npm ci
$ npm start
Skill Atlas: http://localhost:3000
```

Open it, paste a GitHub link, get the skills. Use **Filter skills** to search names, full descriptions,
and paths (including copies), ignoring case. Submit with **Filter**; **Clear filter** shows all skills.
Each submission scans the repository again; the filtered URL can be bookmarked or shared.
The Skill Atlas title and description sit in a separate blue header above the scan form, with
colors that follow your system's light or dark theme.

The web view follows your system's light or dark theme automatically, including when it changes
while the page is open. Cards and forms adapt to narrow screens, and keyboard focus stays visible.
The layout and themes also work with JavaScript disabled; no theme preference is stored.

You can also paste an organization URL such as `https://github.com/JetBrains`. The page shows a
live progress bar, an organization summary, and a collapsible section for every project. Expand a
project to see its skills; **Filter skills** searches across projects. Live progress requires
JavaScript; scanning and viewing results also work without it. Leaving the page or starting another
scan cancels the live scan.

Behind an HTTP proxy, set `NODE_USE_ENV_PROXY=1` so
Node's `fetch` uses `HTTPS_PROXY`; otherwise the page answers `Cannot reach GitHub: fetch failed`.

Set `GITHUB_TOKEN` for a higher GitHub rate limit and to include private repositories the token can
read. Organization scans can make many requests, so a token is recommended. No scan results are
stored. `npm test` runs the tests.

- [spec/](spec/): what it does. [AGENTS.md](AGENTS.md): the definition of done.
- [fixture/](fixture/README.md): a small repository for the tests.
