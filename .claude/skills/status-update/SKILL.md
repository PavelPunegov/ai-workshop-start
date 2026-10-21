---
name: status-update
description: Write a status update for the repository - issues opened in a period, each with a short description and who opened it, and pull requests merged with the issues they fixed. Use when asked for a status update, a weekly report, a changelog of recent work, or "what happened since".
argument-hint: "[period, e.g. 7d, 2w, since 2026-10-01] [output file]"
---

# Status update

Summarize recent activity on GitHub: what was reported and what was fixed. Use the `gh` CLI for
everything and only read; do not create, edit, label or comment on anything.

## 0. Before you start

- `gh auth status` shows a login that can read the repository. If not, stop and ask the user.
- Detect the repository: `REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner)`.

## 1. Pick the period

- With an argument, use it: `7d`, `2w` or `since <YYYY-MM-DD>`.
- Without one, use the last 7 days.
- Turn it into a start date `SINCE` in `YYYY-MM-DD` form, for example on macOS
  `SINCE=$(date -v-7d +%F)`, on Linux `SINCE=$(date -d '7 days ago' +%F)`. The end is today.

## 2. Issues opened

```console
gh issue list --repo "$REPO" --state all --limit 200 --search "created:>=$SINCE sort:created-asc" \
  --json number,title,author,state,labels,url,body,createdAt
```

For each issue keep: number and link, title, author login (`@login`), state (open or closed),
labels, and a **short description**: one sentence, at most about 20 words, written by you from the
body (the Summary section if there is one). Do not paste the body. If the body is empty, use the
title only.

## 3. Pull requests fixed

```console
gh pr list --repo "$REPO" --state merged --limit 200 --search "merged:>=$SINCE sort:updated-asc" \
  --json number,title,author,mergedAt,url,closingIssuesReferences
```

For each PR keep: number and link, title, author, merge date, and the issues it fixed from
`closingIssuesReferences`. If that list is empty, look for `Fixes #N`, `Closes #N` or `Resolves #N`
in the body (`gh pr view <number> --json body`). A PR that fixes no issue is still listed.

Mark issues from step 2 that one of these PRs fixed, so the reader sees what was opened and fixed
in the same period.

If a list hits the limit of 200, say so in the update; do not silently drop items.

## 4. Write the update

Use this layout. Leave out a section only if it has nothing; then write "None".

```markdown
# Status update: <SINCE> – <today>

<one or two sentences: N issues opened, M pull requests merged, anything that stands out>

## Issues opened (N)
| Issue | Opened by | Status | Description |
|---|---|---|---|
| [#12 Filter: regex characters show a 500 error](<url>) | @login | open | <short description> |
| [#13 ...](<url>) | @login | fixed by #15 | <short description> |

## Pull requests fixed (M)
| PR | Author | Merged | Fixes |
|---|---|---|---|
| [#15 Escape the filter before matching](<url>) | @login | 2026-10-20 | #13 |
| [#16 ...](<url>) | @login | 2026-10-21 | – |

## Still open
<issues from the period that are still open and have no merged fix, one line each, or "None">
```

Status for an issue is `open`, `fixed by #<pr>` or `closed` (closed without a merged PR from the
period). Keep the order by number.

## 5. Deliver

- Print the update to the user.
- With an output file argument, also write it there. Do not commit it, and do not post it
  anywhere (issue, discussion, chat) unless the user asks.
