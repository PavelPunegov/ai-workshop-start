# Command line
`./skill-atlas scan <GitHub URL | directory>`
Prints the result **at once**; *nothing is stored*.
`GITHUB_TOKEN`, optional: a higher GitHub rate limit.
## Output
```
JetBrains/kotlin · 6 skills
build-tools-bump-gradle-api — Bumps the Gradle API…
  https://github.com/JetBrains/kotlin/blob/<commit>/…
```
- Sorted by **name**; the description's *first sentence*
- The count is of skills, not of copies
- `also in <paths>` for copies; `outside .agents and .claude` when it is; warnings go to *stderr*
## Organizations
`./skill-atlas scan https://github.com/<organization>` prints:
```
example-org · 2 projects · 1 skill
example-org/alpha · 1 skill
commits — Write commits.
  https://github.com/example-org/alpha/blob/<commit>/.agents/skills/commits/SKILL.md
example-org/beta · 0 skills
```
- Print the summary followed by each project's usual repository report, in project order.
- While scanning, write `Scanning <organization>: <completed>/<total> projects` to stderr,
  starting at zero. Stdout still receives the complete result at once, only on success.
- Organization warnings go to stderr with the project name. Failures exit with code 1;
  no partial report goes to stdout.
