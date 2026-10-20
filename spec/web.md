# Web view
A *thin client*, like the CLI: the server and its entry in `src/web.ts`, the HTML in
`src/web/page.ts`, the rules shared with the CLI (first sentence, count, outside) in `src/present.ts`.
`npm start` (`PORT`, default 3000): a page at `/` with a form for a **GitHub repository link**.
`GET /?repo=<URL>` scans and renders the result **on the server**; *nothing is stored*.
`GITHUB_TOKEN`, optional: as for the CLI.
## Output
The same information as the CLI, one card per skill:
- 📦 the repository, linked; the count of skills; 📌 the scanned commit, short
- 🧩 the name; the description's *first sentence* (the whole one as a tooltip), else *No description*
- 📄 the path, linked to the SKILL.md at the scanned commit
- 🪞 `Also in <paths>` for copies; 📍 `Outside .agents and .claude` when it is
- ⚠️ warnings in their own box above the skills; 🫙 when there is no SKILL.md
- Sorted by **name**, as in the CLI
## Errors
A ❌ message on the page, the form kept with what was typed:
- Malformed input, anything but `github.com/<owner>/<repo>` → status *400*, nothing fetched.
  Local directories are *not* accepted: a web page never reads the server's disk
- Unreachable or missing repository, rate limit → the CLI's message, status *502*
- Any other failure → a generic message, status *500*; the details go to the server log, not the page
- Any other path → status *404*
- What the user typed is always escaped
