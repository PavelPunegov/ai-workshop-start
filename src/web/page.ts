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
<main>
<header class="intro">
<p class="eyebrow">Repository &amp; organization explorer</p>
<h1>🧭 Skill Atlas</h1>
<p class="muted">Every <code>SKILL.md</code> in a GitHub repository or organization: its name, description and link.</p>
</header>
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
:root {
  color-scheme: light dark;
  --background: #f4f6fb; --surface: #ffffff; --surface-soft: #edf0f8;
  --text: #172033; --muted: #526079; --line: #d8deea; --accent: #5634c5;
  --button: #5b3bd1; --button-hover: #4728b5;
  --error-bg: #fff1f2; --error-text: #9f1239; --error-line: #fda4af;
  --warning-bg: #fffbeb; --warning-text: #854d0e; --warning-line: #e5bc60;
}
@media (prefers-color-scheme: dark) {
  :root {
    --background: #111521; --surface: #1b2232; --surface-soft: #252e43;
    --text: #e8edf7; --muted: #a9b6ce; --line: #3b4863; --accent: #c0afff;
    --button: #6545d5; --button-hover: #7354e3;
    --error-bg: #381d2b; --error-text: #ffb3c6; --error-line: #925169;
    --warning-bg: #322a1a; --warning-text: #f4d58b; --warning-line: #89703d;
  }
}
* { box-sizing: border-box; }
body { font: 16px/1.6 system-ui, sans-serif; margin: 0; background: var(--background); color: var(--text); }
main { max-width: 64rem; margin: 0 auto; padding: 3.5rem 1.5rem; overflow-wrap: anywhere; }
.intro { max-width: 42rem; margin-bottom: 2rem; }
.eyebrow { color: var(--accent); font-size: 0.75rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; margin: 0 0 0.75rem; }
h1 { font-size: clamp(2rem, 5vw, 3rem); line-height: 1.2; letter-spacing: -0.04em; margin: 0 0 1rem; }
h2 { font-size: 1.15rem; line-height: 1.5; margin: 0; }
code { font: 0.875em ui-monospace, monospace; }
a { color: var(--accent); text-underline-offset: 0.2em; }
a:hover { text-decoration-thickness: 2px; }
.muted { color: var(--muted); }
form { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; margin: 1.5rem 0; padding: 1.5rem; background: var(--surface); border: 1px solid var(--line); border-radius: 1rem; }
label { width: 100%; font-size: 0.875rem; font-weight: 650; }
input { flex: 1; min-width: 0; font: inherit; padding: 0.7rem 0.9rem; color: var(--text); background: var(--background); border: 1px solid var(--line); border-radius: 0.5rem; }
input::placeholder { color: var(--muted); opacity: 1; }
button { font: inherit; font-weight: 650; padding: 0.7rem 1.25rem; min-height: 2.75rem; border: 1px solid transparent; border-radius: 0.5rem; background: var(--button); color: #ffffff; cursor: pointer; }
button:hover { background: var(--button-hover); }
:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
.repository, .organization { padding: 1.25rem 0; border-bottom: 1px solid var(--line); margin-top: 2rem; }
.count { display: inline-block; color: var(--muted); font-weight: 500; }
.error { padding: 1rem 1.25rem; margin: 1.5rem 0; border: 1px solid var(--error-line); border-radius: 0.75rem; background: var(--error-bg); color: var(--error-text); }
.warnings { padding: 1rem 1.25rem; margin: 1.5rem 0; border: 1px solid var(--warning-line); border-radius: 0.75rem; background: var(--warning-bg); color: var(--warning-text); }
.warnings h3 { margin: 0; font-size: 1rem; }
.warnings ul { padding-left: 1.25rem; margin-bottom: 0; }
.skills { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
.skill { min-width: 0; border: 1px solid var(--line); border-radius: 0.875rem; padding: 1.5rem; background: var(--surface); }
.skill h3 { margin: 0 0 0.75rem; font-size: 1.05rem; line-height: 1.45; }
.skill p { margin: 0.65rem 0 0; }
.description { color: var(--text); }
.path, .copies, .outside { font-size: 0.875rem; color: var(--muted); }
.outside { display: inline-block; padding: 0.25rem 0.5rem; background: var(--surface-soft); border-radius: 0.375rem; }
.filter-count, .progress { color: var(--muted); font-size: 0.875rem; }
.empty { color: var(--muted); padding: 2rem 1.5rem; text-align: center; border: 1px dashed var(--line); border-radius: 0.875rem; }
.project { border: 1px solid var(--line); border-radius: 0.875rem; padding: 1.25rem; margin: 1rem 0; background: var(--surface); }
summary { cursor: pointer; font-weight: 650; }
summary::marker { color: var(--accent); }
.project[open] > summary { padding-bottom: 1rem; border-bottom: 1px solid var(--line); }
.project .repository { margin-top: 0; }
progress { display: block; width: 100%; height: 0.625rem; margin: 0.75rem 0; accent-color: var(--accent); }
#scan-progress { padding: 1.25rem; border: 1px solid var(--line); border-radius: 0.875rem; background: var(--surface); }
@media (max-width: 40rem) {
  main { padding: 2rem 1rem; }
  form, .skill, .project { padding: 1rem; }
  form > a { width: 100%; }
  .skills { grid-template-columns: minmax(0, 1fr); }
}
`;
