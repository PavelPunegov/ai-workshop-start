#!/usr/bin/env node
// The web view: a page with a form for a GitHub repository link, and the same skills the CLI
// prints, rendered on the server. Only GitHub links: a web page never reads local directories.
// Nothing is stored. `npm start`, or `PORT=8080 node src/web.ts`.
import { createServer, type Server } from 'node:http';
import { AtlasError } from './core/errors.ts';
import { AGENT_FOLDERS, isInsideAgentFolders } from './core/find.ts';
import { openGitHub, parseGitHubUrl } from './core/github.ts';
import { firstSentence, skillLink, type Repository, type Skill } from './core/model.ts';
import { scan, type ScanResult, type Source } from './core/scan.ts';

export type WebOptions = {
  /** Opens a GitHub repository link that parses; the live GitHub API by default. */
  open?: (input: string) => Promise<Source>;
};

/** What the page shows: the form alone, a scan's result, or an error. */
export type Page = { input?: string; result?: ScanResult; error?: string };

/** `GET /?repo=<GitHub URL>`: the page; anything else is not found. */
export function createWebServer(options: WebOptions = {}): Server {
  const token = process.env.GITHUB_TOKEN || undefined;
  const open = options.open ?? ((input: string) => openGitHub(input, { fetch, token }));

  return createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const send = (status: number, page: Page) => {
      response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(renderPage(page));
    };
    if (request.method !== 'GET' || url.pathname !== '/') return send(404, { error: `Not found: ${url.pathname}` });

    const input = url.searchParams.get('repo')?.trim();
    if (!input) return send(200, {});
    if (!parseGitHubUrl(input)) {
      return send(400, { input, error: `Not a GitHub repository URL: ${input}. Expected https://github.com/<owner>/<repo>` });
    }
    try {
      send(200, { input, result: await scan(await open(input)) });
    } catch (error) {
      if (error instanceof AtlasError) return send(502, { input, error: error.message });
      send(500, { input, error: `Unexpected error: ${error instanceof Error ? error.message : String(error)}` });
    }
  });
}

export function renderPage({ input = '', result, error }: Page): string {
  const title = result ? `${result.repository.id} · Skill Atlas` : 'Skill Atlas';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<h1>🧭 Skill Atlas</h1>
<p class="muted">Every <code>SKILL.md</code> in a GitHub repository: its name, description and link.</p>
<form method="get" action="/">
<label for="repo">🔎 Repository</label>
<input id="repo" name="repo" type="text" value="${escape(input)}" placeholder="https://github.com/owner/repo" required autofocus>
<button type="submit">Scan</button>
</form>
${error ? `<div class="error" role="alert">❌ ${escape(error)}</div>` : ''}${result ? renderResult(result) : ''}
</main>
</body>
</html>
`;
}

function renderResult({ repository, skills, warnings }: ScanResult): string {
  const count = `${skills.length} ${skills.length === 1 ? 'skill' : 'skills'}`;
  const commit = repository.commit && ` · 📌 <code title="${escape(repository.commit)}">${escape(repository.commit.slice(0, 7))}</code>`;
  return `<section class="repository">
<h2>📦 <a href="${escape(repository.url)}">${escape(repository.id)}</a> · <span class="count">${count}</span>${commit}</h2>
</section>
${warnings.length > 0 ? `<section class="warnings">
<h3>⚠️ Warnings</h3>
<ul>${warnings.map((warning) => `<li>${escape(warning)}</li>`).join('')}</ul>
</section>
` : ''}${skills.length > 0
    ? `<ul class="skills">\n${skills.map((skill) => renderSkill(repository, skill)).join('\n')}\n</ul>`
    : '<p class="empty">🫙 No SKILL.md in this repository.</p>'}
`;
}

/** The CLI's lines for one skill: name, first sentence, link, copies, and whether it is outside. */
function renderSkill(repository: Repository, skill: Skill): string {
  const link = skillLink(repository, skill);
  const lines = [
    `<h3 class="name">🧩 ${escape(skill.name)}</h3>`,
    skill.description
      ? `<p class="description" title="${escape(skill.description)}">${escape(firstSentence(skill.description))}</p>`
      : '<p class="description muted">No description</p>',
    `<p class="path">📄 <a href="${escape(link)}"><code>${escape(skill.path)}</code></a></p>`,
  ];
  if (skill.copies.length > 0) {
    lines.push(`<p class="copies">🪞 Also in ${skill.copies.map((copy) => `<code>${escape(copy)}</code>`).join(', ')}</p>`);
  }
  // The main copy is in .agents or .claude whenever any copy is.
  if (!isInsideAgentFolders(skill.path)) lines.push(`<p class="outside">📍 Outside ${AGENT_FOLDERS.join(' and ')}</p>`);
  return `<li class="skill">\n${lines.join('\n')}\n</li>`;
}

function escape(text: string): string {
  const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return text.replace(/[&<>"']/g, (character) => entities[character]);
}

const STYLE = `
:root { color-scheme: light dark; --muted: #6b7280; --line: #d1d5db; --accent: #2563eb; }
body { font: 16px/1.5 system-ui, sans-serif; margin: 0; }
main { max-width: 52rem; margin: 0 auto; padding: 2rem 1rem; }
h1 { margin: 0; }
code { font: 0.9em ui-monospace, monospace; }
a { color: var(--accent); }
.muted { color: var(--muted); }
form { display: flex; gap: 0.5rem; align-items: center; margin: 1.5rem 0; }
input { flex: 1; font: inherit; padding: 0.5rem; border: 1px solid var(--line); border-radius: 0.375rem; }
button { font: inherit; padding: 0.5rem 1rem; border: 0; border-radius: 0.375rem; background: var(--accent); color: white; cursor: pointer; }
.error { padding: 0.75rem 1rem; border: 1px solid #f87171; border-radius: 0.375rem; background: #fef2f2; color: #991b1b; }
.warnings { padding: 0.5rem 1rem; border: 1px solid #fbbf24; border-radius: 0.375rem; background: #fffbeb; color: #92400e; }
.warnings h3 { margin: 0.25rem 0; font-size: 1rem; }
.skills { list-style: none; padding: 0; display: grid; gap: 0.75rem; }
.skill { border: 1px solid var(--line); border-radius: 0.5rem; padding: 0.75rem 1rem; }
.skill p, .skill h3 { margin: 0.25rem 0; }
.path, .copies, .outside { font-size: 0.9rem; color: var(--muted); }
`;

if (import.meta.main) {
  const port = Number(process.env.PORT) || 3000;
  createWebServer().listen(port, () => console.log(`Skill Atlas: http://localhost:${port}`));
}
