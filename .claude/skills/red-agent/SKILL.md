---
name: red-agent
description: Red agent. Break the Skill Atlas web view the way real end users would, then file one GitHub issue per bug with steps to reproduce and a screenshot or video, labeled "Delegated to AI agent". Use when asked to break, attack, bug-hunt, smoke-test or exploratory-test the web view.
argument-hint: "[area to focus on, e.g. filter, organizations, mobile] [max issues]"
---

# Red agent

You are a tester, not a developer. Use the web view only as an end user can: a browser, the
address bar, the form, the keyboard, the window size. Do not read `src/` to find bugs, and do
not fix anything. The goal is a list of real, reproducible bugs filed as GitHub issues.

## 0. Before you start

Check these and stop and ask the user if any fails:

- `gh auth status` shows a login with permission to write issues and contents.
- `node --version` is 24 or newer, and `npm ci` has been run.
- Playwright is installed outside the repository, as in the `record-demo` skill:

  ```console
  DEMO_DEPS="$HOME/.cache/skill-atlas-demo"
  mkdir -p "$DEMO_DEPS"
  npm install --prefix "$DEMO_DEPS" --no-save playwright@1
  npx --prefix "$DEMO_DEPS" playwright install chromium
  ```

- `export GITHUB_TOKEN=$(gh auth token)`, so scans are not cut short by the rate limit. Scans
  call the live GitHub API: use small repositories and organizations, and expect at most about
  10 code searches a minute.

## 1. Learn what "correct" means

Read `spec/web.md`. A bug is either a difference from the spec, or something any user would call
broken: a crash, a blank or frozen page, lost input, unreadable text, a layout that overflows,
a control that does nothing, or a security problem such as injected HTML.

Start the app once and look at it: `npm start` (`PORT` to change the port), then open it.

## 2. Break it

Act as several kinds of users. Try each idea below, plus your own; with an argument, focus on
that area. Drive the browser with short Playwright scripts, or with `repro.mjs` (step 3).

- **The careless typist:** empty input, spaces only, a trailing slash, `.git`, `http://`,
  `www.github.com`, no scheme, mixed case, a `/tree/main/...` link, a query string or `#hash`,
  a GitLab link, a local path, a 5 000-character link, emoji and right-to-left text.
- **The curious hacker:** `<script>alert(1)</script>`, `"><img src=x onerror=alert(1)>` and
  `javascript:` in the link and the filter; edit `?repo=` and `?filter=` by hand, repeat them,
  leave them empty, encode them twice; open unknown paths and `/events` with bad targets.
- **The impatient user:** double-click **Scan**, submit again while an organization scan runs,
  press Back and Forward mid-scan, reload, close the tab, go offline in the middle.
- **The filter user:** filter for nothing, whitespace, one letter, regex characters `.*[(`,
  case changes, a path segment, a copy's path; press **Clear filter**; filter on an organization.
- **The phone and accessibility user:** widths 320, 375 and 768; zoom 200%; light and dark
  schemes and switching between them; keyboard only (Tab, Enter, Space on summaries); check focus
  is visible and nothing scrolls sideways.
- **The no-JavaScript user:** `--no-js`; every form, filter and collapsible section must still
  work, organizations without live progress.
- **The sharer:** copy the URL after a scan or a filter, open it in a new page, and compare.

For each finding, reproduce it **twice** from a fresh page before you call it a bug. Note the
exact input, the expected result (quote the spec line if there is one) and what happened.
Drop findings that are only network flakiness or GitHub rate limits that the page reports correctly.

## 3. Capture the evidence

Write the minimal steps as JSON and replay them with `repro.mjs`. Each step is an object with one
key: `goto` (path or URL), `fill` / `type` (`[selector, text]`), `click` (selector), `press`
(key), `back`, `forward`, `reload`, `offline` (`true`/`false`), `viewport` (`[w, h]`),
`colorScheme` (`"light"`/`"dark"`), `zoom` (number), `waitFor` (selector), `wait` (ms),
`screenshot` (name).

```console
cat > /tmp/bug-1.json <<'EOF'
[
  { "goto": "/" },
  { "fill": ["#repo", "https://github.com/JetBrains/kotlin/"] },
  { "click": "button:has-text('Scan')" },
  { "waitFor": ".repository, .error" },
  { "screenshot": "result" }
]
EOF
PLAYWRIGHT_DIR="$HOME/.cache/skill-atlas-demo" node .claude/skills/red-agent/repro.mjs \
  --steps /tmp/bug-1.json --out recordings/red-agent/bug-1
```

Options: `--url <base>` uses an app that is already running, `--width`/`--height` set the window
(default 1280×800), `--color-scheme dark`, `--no-js`, `--headed`.

It saves `video.webm`, `final.png`, your named screenshots and `report.json` (console errors,
page errors, failed requests, page statuses) in `--out`, which git ignores. A console error for a
400 or 404 page is the expected status, not a bug by itself. Open the screenshot
and check it shows the bug. Choose what to attach:

- **Screenshot** when one picture shows the bug: wrong text, layout, colors, an error message.
- **Video** when the bug needs a sequence: timing, navigation, a double submit, a frozen scan.
  Keep the steps short, so the video is a few seconds long.

## 4. File one issue per bug

Detect the repository with `gh repo view --json nameWithOwner --jq .nameWithOwner`.

**No duplicates.** Search open and closed issues for the same symptom first:
`gh issue list --state all --search "<keywords> in:title,body"`. If one exists, add a comment with
your evidence instead of a new issue.

**Labels.** Create them once if they are missing:

```console
gh label list --search "Delegated to AI agent" --json name --jq '.[].name' | grep -qx "Delegated to AI agent" \
  || gh label create "Delegated to AI agent" --color 5319E7 --description "Picked up by an AI agent"
gh label list --search bug --json name --jq '.[].name' | grep -qx bug \
  || gh label create bug --color D73A4A --description "Something isn't working"
```

**Attachments.** `gh` cannot upload files to issues, so store them on a `red-agent-evidence`
branch through the API, without touching the local checkout. Create the branch once from the
default branch, then upload each file:

```console
REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
gh api "repos/$REPO/git/ref/heads/red-agent-evidence" >/dev/null 2>&1 || gh api "repos/$REPO/git/refs" \
  -f ref=refs/heads/red-agent-evidence -f sha="$(gh api "repos/$REPO/git/ref/heads/main" --jq .object.sha)"
gh api -X PUT "repos/$REPO/contents/evidence/<slug>/final.png" -f branch=red-agent-evidence \
  -f message="Evidence: <short title>" -f content="$(base64 < recordings/red-agent/bug-1/final.png | tr -d '\n')"
```

Link it as `https://github.com/<REPO>/blob/red-agent-evidence/evidence/<slug>/<file>?raw=true`.
An image link with `![...](...)` shows inline; a `.webm` is a plain link. Never upload tokens,
`.env` or anything that shows them.

**Body.** Write it to a file outside the repository, for example `/tmp/issue-1.md`, never inline
with `--body`: the shell would run anything in backticks. Use this layout:

```markdown
## Summary
<one sentence: what breaks, for whom>

## Steps to reproduce
1. Run `npm start` and open http://localhost:3000/
2. Type `<exact input>` in **Repository or organization**
3. Press **Scan**

## Expected
<what should happen; quote spec/web.md if it says>

## Actual
<what happens, with the exact message or status>

## Evidence
![screenshot](<link>)  or  [video](<link>)

## Environment
Chromium <version> via Playwright, <width>×<height>, <light|dark>, JavaScript <on|off>, commit <short sha>

<details><summary>Replay steps (repro.mjs)</summary>

<the steps JSON>
</details>
```

Then file it:

```console
gh issue create --title "<Area>: <what breaks>" --label bug --label "Delegated to AI agent" \
  --body-file /tmp/issue-1.md
```

Titles say the symptom, not a guessed cause, for example `Filter: regex characters show a 500 error`.
File at most 10 issues per run unless the user says otherwise; report the rest in step 5.

## 5. Report

Give the user a table: issue URL, title, kind of evidence. Then list what you tried that worked
as specified, findings you dropped and why, and anything you could not test.
