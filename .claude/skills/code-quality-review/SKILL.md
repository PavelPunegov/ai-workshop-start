---
name: code-quality-review
description: Review changed code for small methods, clear responsibilities, short comments and reproducible run instructions. Use when asked to review a diff, a branch or a file for readability.
---

# Code quality review

Review what changed, not the whole repository. Without a target, review `git diff main...HEAD`
plus uncommitted changes.

## What to check

1. **Small, concise methods.**
   - One method does one thing; its name says what.
   - Flag methods longer than about 20 lines, nesting deeper than 2 levels, or more than 3–4 parameters.
   - Suggest the split: name the new methods.
2. **Clear responsibility.**
   - Each class, module or object can be described in one sentence without "and".
   - Flag mixed concerns, for example I/O in core logic, or formatting in the model.
   - Follow the existing layering, for example `spec/analysis.md`: core is fetch → find → parse; the CLI is a thin client.
3. **Short, simple comments and docs.**
   - A comment says *why*, not what the code already says.
   - One or two plain sentences. No filler, no restated names, no stale text.
   - Flag comments that no longer match the code.
4. **Reproducible run instructions.** For every change to a README, spec or doc about running something:
   - Commands are exact and copy-pasteable, in a `console` block, in order.
   - Prerequisites are stated: tool versions, `npm ci` first, env vars such as `GITHUB_TOKEN`.
   - The expected result is shown or described.
   - **Run the commands** in a clean copy and report whether they work as written.

## How to report

- One finding per issue: `file:line`, the problem, a concrete fix.
- Most important first; skip nitpicks the code already follows locally.
- If nothing is wrong, say so in one line.
- Do not edit files unless asked.
