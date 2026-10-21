// The web page, as HTML: the form, then the scan's result or an error. Everything shown comes
// through `escape`; nothing here knows about HTTP.
import { skillLink, type Repository, type Skill } from '../core/model.ts';
import type { ScanResult } from '../core/scan.ts';
import type { OrganizationResult } from '../core/organization.ts';
import { AGENT_FOLDER_NAMES, countSkills, countProjects, firstSentence, isOutside, organizationSkillCount } from '../present.ts';

/** What the page shows: the form alone, a scan's result, or an error. */
export type Page = { input?: string; filter?: string; result?: ScanResult; organization?: OrganizationResult; error?: string };

export function renderPage(page: Page): string {
  const { input = '', result, organization } = page;
  const title = result ? `${result.repository.id} · Skill Atlas` : organization ? `${organization.organization.id} · Skill Atlas` : 'Skill Atlas';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>${STYLE}</style>
<script src="/client.js" defer></script>
</head>
<body>
<header class="site-header">
<div class="site-header-inner">
<h1>🧭 Skill Atlas</h1>
<p>Every <code>SKILL.md</code> in a GitHub repository or organization: its name, description and link.</p>
</div>
</header>
<main>
<form method="get" action="/">
<label for="repo">🔎 Repository or organization</label>
<input id="repo" name="repo" type="text" value="${escape(input)}" placeholder="https://github.com/owner/repo" required autofocus>
<button type="submit">Scan</button>
</form>
<section id="scan-progress" hidden aria-live="polite">
<label for="scan-meter" id="scan-status">Listing projects…</label>
<progress id="scan-meter" aria-labelledby="scan-status"></progress>
</section>
<div id="scan-output" aria-live="polite">${renderOutput(page)}</div>
</main>
</body>
</html>
`;
}

/** A fragment for both the server page and the live scan's final event. */
export function renderOutput({ input = '', filter = '', result, organization, error }: Page): string {
  if (error) return `<div class="error" role="alert">❌ ${escape(error)}</div>\n`;
  if (organization) return renderOrganization(organization, input, filter);
  return result ? renderResult(result, input, filter) : '';
}

function matchingSkills(skills: Skill[], filter: string): Skill[] {
  const query = filter.trim().toLowerCase();
  return skills.filter((skill) =>
    [skill.name, skill.description, skill.path, ...skill.copies].some((text) => text.toLowerCase().includes(query)),
  );
}

function renderOrganization({ organization, projects }: OrganizationResult, input: string, filter: string): string {
  const total = organizationSkillCount(projects);
  const shown = projects.reduce((count, project) => count + matchingSkills(project.skills, filter).length, 0);
  return [
    `<section class="organization"><h2>🏢 <a href="${escape(organization.url)}">${escape(organization.id)}</a> · ${countProjects(projects.length)} · ${countSkills(total)}</h2></section>\n`,
    `<p class="progress">Scan complete: ${projects.length}/${projects.length} projects <progress value="${projects.length || 1}" max="${projects.length || 1}" aria-label="Projects scanned"></progress></p>\n`,
    total ? renderFilter(input, filter, shown, total) : '',
    projects.length ? projects.map((project) => renderProject(project, filter)).join('') : '<p class="empty">No repositories in this organization.</p>\n',
  ].join('');
}

function renderProject({ repository, skills, warnings }: ScanResult, filter: string): string {
  const matches = matchingSkills(skills, filter);
  return `<details class="project">
<summary>📦 ${escape(repository.id)} · ${countSkills(skills.length)}</summary>
${renderHeader(repository, skills.length)}${renderWarnings(warnings)}${skills.length && !matches.length ? '<p class="empty">No skills match this filter.</p>\n' : renderSkills(repository, matches)}
</details>\n`;
}

function renderResult({ repository, skills, warnings }: ScanResult, input: string, filter: string): string {
  const matches = matchingSkills(skills, filter);
  return [
    renderHeader(repository, skills.length),
    renderWarnings(warnings),
    skills.length ? renderFilter(input, filter, matches.length, skills.length) : '',
    skills.length && !matches.length ? '<p class="empty">No skills match this filter.</p>\n' : renderSkills(repository, matches),
  ].join('');
}

function renderFilter(input: string, filter: string, shown: number, total: number): string {
  const clearUrl = `/?${new URLSearchParams({ repo: input })}`;
  return `<form method="get" action="/">
<input type="hidden" name="repo" value="${escape(input)}">
<label for="filter">Filter skills</label>
<input id="filter" name="filter" type="search" value="${escape(filter)}" placeholder="Name, description or path" aria-describedby="filter-count">
<button type="submit">Filter</button>
<a href="${escape(clearUrl)}">Clear filter</a>
</form>
<p class="filter-count" id="filter-count">Showing ${shown} of ${countSkills(total)}</p>
`;
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
:root { color-scheme: light dark; --muted: #6b7280; --line: #d1d5db; --accent: #2563eb; --header-bg: #eff6ff; --header-text: #172554; --header-muted: #334155; --header-line: #bfdbfe; }
body { font: 16px/1.5 system-ui, sans-serif; margin: 0; }
main, .site-header-inner { max-width: 52rem; margin: 0 auto; padding: 2rem 1rem; }
.site-header { background: var(--header-bg); color: var(--header-text); border-bottom: 1px solid var(--header-line); }
.site-header p { max-width: 62ch; margin: 0.5rem 0 0; color: var(--header-muted); }
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
.project { border: 1px solid var(--line); border-radius: 0.5rem; padding: 0.75rem 1rem; margin: 0.75rem 0; }
summary { cursor: pointer; font-weight: 600; }
progress { display: block; width: 100%; margin: 0.5rem 0; }
@media (prefers-color-scheme: dark) { :root { --header-bg: #172554; --header-text: #eff6ff; --header-muted: #bfdbfe; --header-line: #1e40af; } }
@media (max-width: 40rem) { form { flex-wrap: wrap; } label { width: 100%; } input { min-width: 0; } }
`;
