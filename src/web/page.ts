// The web page, as HTML: the form, then the scan's result or an error. Everything shown comes
// through `escape`; nothing here knows about HTTP.
import { skillLink, type Repository, type Skill } from '../core/model.ts';
import type { ScanResult } from '../core/scan.ts';
import { AGENT_FOLDER_NAMES, countSkills, firstSentence, isOutside } from '../present.ts';

/** What the page shows: the form alone, a scan's result, or an error. */
export type Page = { input?: string; result?: ScanResult; error?: string };

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
${error ? `<div class="error" role="alert">❌ ${escape(error)}</div>\n` : ''}${result ? renderResult(result) : ''}
</main>
</body>
</html>
`;
}

function renderResult({ repository, skills, warnings }: ScanResult): string {
  return [renderHeader(repository, skills.length), renderWarnings(warnings), renderSkills(repository, skills)].join('');
}

/** The repository, linked; the count of skills; the scanned commit, short. */
function renderHeader(repository: Repository, count: number): string {
  const commit = repository.commit
    ? ` · 📌 <code title="${escape(repository.commit)}">${escape(repository.commit.slice(0, 7))}</code>`
    : '';
  const link = `<a href="${escape(repository.url)}">${escape(repository.id)}</a>`;
  return `<section class="repository">
<h2>📦 ${link} · <span class="count">${countSkills(count)}</span>${commit}</h2>
</section>
`;
}

/** Nothing when there are none. */
function renderWarnings(warnings: string[]): string {
  if (warnings.length === 0) return '';
  return `<section class="warnings">
<h3>⚠️ Warnings</h3>
<ul>${warnings.map((warning) => `<li>${escape(warning)}</li>`).join('')}</ul>
</section>
`;
}

function renderSkills(repository: Repository, skills: Skill[]): string {
  if (skills.length === 0) return '<p class="empty">🫙 No SKILL.md in this repository.</p>\n';
  return `<ul class="skills">\n${skills.map((skill) => renderSkill(repository, skill)).join('\n')}\n</ul>\n`;
}

/** The CLI's lines for one skill: name, first sentence, link, copies, and whether it is outside. */
function renderSkill(repository: Repository, skill: Skill): string {
  const lines = [
    `<h3 class="name">🧩 ${escape(skill.name)}</h3>`,
    skill.description
      ? `<p class="description" title="${escape(skill.description)}">${escape(firstSentence(skill.description))}</p>`
      : '<p class="description muted">No description</p>',
    `<p class="path">📄 <a href="${escape(skillLink(repository, skill))}"><code>${escape(skill.path)}</code></a></p>`,
  ];
  if (skill.copies.length > 0) {
    lines.push(`<p class="copies">🪞 Also in ${skill.copies.map((copy) => `<code>${escape(copy)}</code>`).join(', ')}</p>`);
  }
  if (isOutside(skill)) lines.push(`<p class="outside">📍 Outside ${AGENT_FOLDER_NAMES}</p>`);
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
