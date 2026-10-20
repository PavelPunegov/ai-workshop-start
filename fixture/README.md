# fixture

A small repository for the tests.

| Path | Case |
| --- | --- |
| `.claude/skills/commits` | a skill |
| `.github/skills/code-style` | a skill in another agent's folder |
| `.agents/skills/release-checklist` | malformed front matter |
| `.agents/skills/commits`, `plugins/tools/skills/commits` | identical copies of `.claude/skills/commits` |
| `plugins/tools/skills/code-style` | the same name as `.github/skills/code-style`, a different file; outside `.agents` and `.claude` |
