# Repository analysis
## Input
A **GitHub repository or organization** URL, or a local directory
## Output
Every `SKILL.md`: **name**, **description**, **link**
## Architecture
Core: fetch → find → parse. CLI: a *thin client*.
Skill: id = `repo:path`, name, description, commit
## Details
- **GitHub API**, no clone; *under 5 s* for intellij-community
- Discover files through the scanned commit's recursive tree, with or without a token. Reserve
  authenticated code search for truncated trees, avoiding its smaller quota for ordinary projects.
  Without a token, truncated trees still warn and inspect only the known skill roots.
- Read at most four skill files concurrently per project, keeping skill and warning order stable.
- The name: front matter, else the directory
- The link pins the *scanned commit*
- Malformed front matter → a *warning*, the scan goes on
- Unreachable repository → a clear message, exit code 1
- Identical skills are *one skill*: byte-identical SKILL.md files. The main copy is the first in
  `.agents` or `.claude`, else the first by path; the others are its *copies*
- A skill with no copy in `.agents` or `.claude` is marked as *outside* them
## Organizations
- `https://github.com/<organization>` scans every repository visible to the supplied credentials,
  including forks and archived repositories. Use the organization API, following every page of
  repositories; no clone. A user profile is not an organization.
- Organization URLs accept the same optional scheme, `www.` prefix and trailing slash as repository
  URLs. Query strings, fragments and extra path segments are not accepted.
- Summarize the number of projects and the sum of their unique skill counts. Deduplicate copies
  within each project; identical skills in different projects count separately.
- Sort projects by full repository name. Scan at most four projects concurrently, returning results
  in sorted order even when they finish out of order. Report completed/total projects after listing
  and after each completed project. Keep the existing repository scan and skill presentation rules.
- Include repositories without skills and empty Git repositories (no commit yet). An organization
  without visible repositories has zero projects and zero skills.
- A missing organization, inaccessible repository, authentication failure or rate limit stops the
  scan with a clear error. Do not present incomplete totals as a successful organization summary.
- On failure or cancellation, abort active requests, stop queued work and further progress updates,
  and preserve the original failure message.
- Nothing is stored; authenticated requests, including skill file reads, use `GITHUB_TOKEN`.
