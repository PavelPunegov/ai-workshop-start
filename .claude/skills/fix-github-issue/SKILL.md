---
name: fix-github-issue
description: Pick up a GitHub issue, implement the feature request or fix the bug with tests, label the issue "Delegated to AI agent" and open a pull request. Use when asked to work on, fix or implement a GitHub issue by number or URL.
argument-hint: "[issue number or URL]"
---

# Fix a GitHub issue

Take one issue from open to pull request. Use the `gh` CLI for everything on GitHub.

## 1. Pick the issue

- With an argument, use that issue: `gh issue view <number> --comments`.
- Without one, list candidates and pick the oldest open issue that is not assigned and has no
  `Delegated to AI agent` label:

  ```console
  gh issue list --state open --search 'no:assignee -label:"Delegated to AI agent"' --limit 20
  ```

- Read the title, body, comments and linked issues or PRs. Decide whether it is a **bug** or a
  **feature request**.
- If the issue is unclear or too big for one PR, stop and ask the user. Do not guess.

## 2. Claim it

Create the label if it is missing, then add it, so nobody else picks the issue up:

```console
gh label create "Delegated to AI agent" --color 5319E7 --description "Picked up by an AI agent" 2>/dev/null || true
gh issue edit <number> --add-label "Delegated to AI agent"
```

## 3. Branch

Start from an up-to-date default branch:

```console
git switch main && git pull --ff-only
git switch -c issue-<number>-<short-slug>
```

If the working tree has uncommitted changes, stop and ask the user first.

## 4. Understand the code

- Read `AGENTS.md` and `spec/` first; they define the behaviour and the definition of done.
- Find the code the issue touches. For a bug, reproduce it: run the command or test from the
  issue and confirm it fails as reported.

## 5. Write the test first

- **Bug:** add a test that reproduces the bug and fails on the current code.
- **Feature:** add tests for each case the feature adds, including edge cases and errors.
- If the change alters existing behaviour, update the existing tests; do not delete them to
  make the suite pass.
- Follow the existing test style and helpers, for example `tests/helpers.ts`.
- Run `npm test` and confirm the new test fails for the right reason.

## 6. Implement

- Make the smallest change that resolves the issue. No unrelated refactoring.
- Follow the existing layering and code style.
- Update `spec/` and the README when behaviour or usage changes.

## 7. Verify

Everything CI runs must pass locally:

```console
npm ci
npm run typecheck
npm test
./skill-atlas help
./skill-atlas scan ./fixture
```

If something fails, fix it. Do not open the PR with failing checks.

## 8. Commit and open the PR

- Commit with a message that says what changed and why, and references the issue.
- Push and open the PR against `main`. `Fixes #<number>` closes the issue on merge:

  ```console
  git push -u origin HEAD
  gh pr create --base main --label "Delegated to AI agent" \
    --title "<short summary>" --body "<body>"
  ```

- The body has:
  - `Fixes #<number>`
  - **What:** the change in one or two sentences.
  - **Why:** the cause of the bug, or the need for the feature.
  - **Tests:** which tests were added or changed, and the commands run with their result.

## 9. Report

Give the user the PR URL, a one-line summary of the change, and anything left open or uncertain.
