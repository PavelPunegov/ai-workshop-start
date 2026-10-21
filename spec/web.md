# Web view
A *thin client*, like the CLI: the server and its entry in `src/web.ts`, the HTML in
`src/web/page.ts`, the rules shared with the CLI (first sentence, count, outside) in `src/present.ts`.
`npm start` (`PORT`, default 3000): a page at `/` with a form for a **GitHub repository or organization link**.
`GET /?repo=<URL>` scans and renders the result **on the server**; *nothing is stored*.
With no `repo` parameter, show the start form without an error (status *200*).
`GITHUB_TOKEN`, optional: as for the CLI.
## Site header
- Every page has a separate header banner above the main scan form and output, containing
  the **Skill Atlas** heading, a logo and its description. Results and errors stay in the main content.
- The banner is the IDE's main toolbar: it spans the page with the dark IntelliJ toolbar color in
  both themes and the JetBrains gradient (blue, pink, orange) as its bottom border. Its text wraps
  on narrow screens while keeping the heading and description readable.
## Appearance
- The page looks like IntelliJ IDEA (New UI), with its Light and Dark theme colors: the toolbar,
  the scan form as a bar below it, then the result as an IDE window filling the page height.
- The window has a tool window stripe, a **Skills** tool window on the left and an editor on the
  right, with a status bar showing the repository or organization. The tool window holds the
  repository or organization header, the filter, warnings and the tree of skills, one row per skill
  with its folder as a hint. Organization projects are collapsible folders in the same tree.
- Selecting a row shows that skill in the editor: a `SKILL.md` tab, the path as breadcrumbs, the
  name, the first sentence, the full description when it is longer, a details table (file, copies,
  location) and an **Open on GitHub** link. Rows are radio buttons, so selection needs no JavaScript
  and the arrow keys move through the tree. A repository's first matching skill starts selected;
  with nothing shown, the editor asks to select a skill.
- Without a result or error, the editor area shows a welcome screen with examples to scan.
- On screens up to 40rem the window stacks: no stripe, and the selected skill opens below its row.
  Long names and paths wrap without horizontal scrolling; inputs fit narrow screens.
- Follow the system light or dark preference automatically, including changes while the page is
  open. Explicit theme colors cover the page, panels, forms, inputs, text, links, buttons,
  selection, warnings, errors, empty states and progress. No JavaScript or stored preference is needed.
- Keyboard focus is visibly outlined on links, inputs, buttons, tree rows and project summaries.
## Output
The same information as the CLI, one tree row and editor view per skill:
- 📦 the repository, linked; the count of skills; 📌 the scanned commit, short
- 🧩 the name; the description's *first sentence* (the whole one as a tooltip), else *No description*
- 📄 the path, linked to the SKILL.md at the scanned commit
- 🪞 `Also in <paths>` for copies; 📍 `Outside .agents and .claude` when it is
- ⚠️ warnings in their own box above the skills; 🫙 when there is no SKILL.md
- Sorted by **name**, as in the CLI
## Filtering
- A scanned repository with skills has a **Filter skills** form, keeping the repository link.
- `GET /?repo=<URL>&filter=<text>` scans the repository and filters the rendered cards.
  Each submission scans again; no scan results are stored. No JavaScript is required.
- Match a literal substring in the name, full description, path, or any copy's path,
  ignoring case and surrounding whitespace. An empty or whitespace-only filter shows all skills.
- Keep the typed filter in the form, escaped as text. **Clear filter** returns to the
  repository without a filter. Scanning another repository starts without a filter.
- Show `Showing <matched> of <total> skills` (singular for one total skill). The repository
  header still counts all unique skills; matches keep their original order and copy information.
- Keep scan warnings visible. With no matches, show *No skills match this filter.*;
  a repository without skills still shows *No SKILL.md in this repository.* and no filter form.
## Errors
A ❌ message on the page, the form kept with what was typed:
- Malformed input, anything but `github.com/<owner>/<repo>` or `github.com/<organization>` → status *400*, nothing fetched.
  A submitted empty or whitespace-only `repo` value is malformed, including `/?repo=` and `/?repo=+++`.
  Keep the original input in the form, including surrounding whitespace; valid URLs may have surrounding whitespace.
  Local directories are *not* accepted: a web page never reads the server's disk
- Unreachable or missing repository, rate limit → the CLI's message, status *502*
- Any other failure → a generic message, status *500*; the details go to the server log, not the page
- Any other path → status *404*
- What the user typed is always escaped
## Organizations and progress
- `GET /?repo=<organization URL>` renders an organization summary: its linked name, number of
  projects and total skills. Each project is a collapsed native `details` element with its name
  and skill count in the summary. Expanding shows its usual repository header, commit, warnings
  and skill cards, including copies and outside markers. Include projects with zero skills.
- Keep the existing filter rules across all projects. Show the aggregate matched/total skill
  count; each project's summary still counts all its skills. Keep all project sections, warnings,
  empty repository messages and per-project no-match messages.
- An empty organization says *No repositories in this organization.* and shows zero totals.
- The completed report shows completed/total projects and a labeled progress element.
- With JavaScript and EventSource available, submitting an organization in the scan form starts
  `GET /events?org=<organization URL>`. Show an indeterminate progress bar while listing projects,
  then update a labeled bar and live status after each completed project. A successful final
  event inserts the server-rendered report and updates the shareable page URL. A new submission
  cancels any previous scan; leaving the page cancels its scan.
- The event response is `text/event-stream`, with JSON `data` events: `type: progress` plus
  `organization`, `completed`, `total`; then `type: result` plus `html`, or `type: error` plus
  escaped error `html`. Errors end the scan and remove the running indicator. Unexpected failures
  show the existing generic message and are logged. Interrupted connections show a retry message.
- Invalid event targets return 400 before any fetch. Streaming errors after headers are sent
  use an error event with HTTP 200. Regular page requests keep the usual 400/502/500 statuses.
- Without JavaScript, the GET form and all final results, filters and collapsible sections work;
  there are no live progress updates. `/client.js` serves the enhancement script. No jobs, scan
  results or credentials are sent to browser storage.
