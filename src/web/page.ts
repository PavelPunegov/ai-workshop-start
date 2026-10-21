// The web page, as HTML: the form, then the scan's result or an error. Everything shown comes
// through `escape`; nothing here knows about HTTP. The result looks like an IDE: a tree of skills
// in a tool window and the selected skill in the editor, chosen with CSS alone.
import { skillLink, type Repository, type Skill } from '../core/model.ts';
import type { ScanResult } from '../core/scan.ts';
import type { OrganizationResult } from '../core/organization.ts';
import { AGENT_FOLDER_NAMES, countSkills, countProjects, firstSentence, isOutside, organizationSkillCount } from '../present.ts';

/** What the page shows: the form alone, a scan's result, or an error. */
export type Page = { input?: string; filter?: string; result?: ScanResult; organization?: OrganizationResult; error?: string };

/** Hands out the tree rows' ids; the first row of a page starts selected. */
type Ids = { next: number };

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
<span class="logo" aria-hidden="true">SA</span>
<h1>Skill Atlas</h1>
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
  return result ? renderResult(result, input, filter) : WELCOME;
}

function matchingSkills(skills: Skill[], filter: string): Skill[] {
  const query = filter.trim().toLowerCase();
  return skills.filter((skill) =>
    [skill.name, skill.description, skill.path, ...skill.copies].some((text) => text.toLowerCase().includes(query)),
  );
}

/** The IDE frame: the tool window stripe, the tree, the editor behind the selection, the status bar. */
function renderIde(tree: string, status: string): string {
  return `<div class="ide">
<div class="stripe" aria-hidden="true"><span class="stripe-button">${FOLDER_ICON}</span></div>
<aside class="tool-window" aria-label="Skills">
<div class="tool-window-title">Skills</div>
${tree}</aside>
<div class="editor" aria-hidden="true"><p class="editor-hint">Select a skill in the tree to see its details</p></div>
<div class="status-bar">${status}</div>
</div>
`;
}

function renderOrganization({ organization, projects }: OrganizationResult, input: string, filter: string): string {
  const total = organizationSkillCount(projects);
  const shown = projects.reduce((count, project) => count + matchingSkills(project.skills, filter).length, 0);
  const ids = { next: 0 };
  const tree = [
    `<section class="organization"><h2>🏢 <a href="${escape(organization.url)}">${escape(organization.id)}</a> · ${countProjects(projects.length)} · ${countSkills(total)}</h2></section>\n`,
    `<p class="progress">Scan complete: ${projects.length}/${projects.length} projects <progress value="${projects.length || 1}" max="${projects.length || 1}" aria-label="Projects scanned"></progress></p>\n`,
    total ? renderFilter(input, filter, shown, total) : '',
    projects.length ? projects.map((project) => renderProject(project, filter, ids)).join('') : '<p class="empty">No repositories in this organization.</p>\n',
  ].join('');
  return renderIde(tree, `<span>Skill Atlas › ${escape(organization.id)}</span><span>${countProjects(projects.length)} · ${countSkills(total)}</span>`);
}

function renderProject({ repository, skills, warnings }: ScanResult, filter: string, ids: Ids): string {
  const matches = matchingSkills(skills, filter);
  return `<details class="project">
<summary>📦 ${escape(repository.id)} · ${countSkills(skills.length)}</summary>
${renderHeader(repository, skills.length)}${renderWarnings(warnings)}${skills.length && !matches.length ? '<p class="empty">No skills match this filter.</p>\n' : renderSkills(repository, matches, ids)}
</details>\n`;
}

function renderResult({ repository, skills, warnings }: ScanResult, input: string, filter: string): string {
  const matches = matchingSkills(skills, filter);
  const tree = [
    renderHeader(repository, skills.length),
    skills.length ? renderFilter(input, filter, matches.length, skills.length) : '',
    renderWarnings(warnings),
    skills.length && !matches.length ? '<p class="empty">No skills match this filter.</p>\n' : renderSkills(repository, matches, { next: 0 }),
  ].join('');
  const commit = repository.commit ? `<span>📌 ${escape(repository.commit.slice(0, 7))}</span>` : '';
  return renderIde(tree, `<span>Skill Atlas › ${escape(repository.id)}</span>${commit}`);
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

function renderSkills(repository: Repository, skills: Skill[], ids: Ids): string {
  if (skills.length === 0) return '<p class="empty">🫙 No SKILL.md in this repository.</p>\n';
  return `<ul class="skills">\n${skills.map((skill) => renderSkill(repository, skill, ids.next++)).join('\n')}\n</ul>\n`;
}

/**
 * A tree row and, when its radio is checked, the editor with the CLI's lines for the skill:
 * name, first sentence, link, copies, and whether it is outside.
 */
function renderSkill(repository: Repository, skill: Skill, index: number): string {
  const id = `skill-${index}`;
  const link = skillLink(repository, skill);
  const sentence = firstSentence(skill.description);
  const lines = [
    `<h3 class="name">🧩 ${escape(skill.name)}</h3>`,
    skill.description
      ? `<p class="description" title="${escape(skill.description)}">${escape(sentence)}</p>`
      : '<p class="description muted">No description</p>',
  ];
  if (skill.description && sentence !== skill.description.replace(/\s+/g, ' ').trim()) {
    lines.push('<h4>Description</h4>', `<p class="about">${escape(skill.description)}</p>`);
  }
  lines.push('<h4>Details</h4>', '<div class="properties">');
  lines.push(property('File', `<p class="path">📄 <a href="${escape(link)}"><code>${escape(skill.path)}</code></a></p>`));
  if (skill.copies.length > 0) {
    lines.push(property('Copies', `<p class="copies">🪞 Also in ${skill.copies.map((copy) => `<code>${escape(copy)}</code>`).join(', ')}</p>`));
  }
  if (isOutside(skill)) lines.push(property('Location', `<p class="outside">📍 Outside ${AGENT_FOLDER_NAMES}</p>`));
  lines.push('</div>', `<a class="open-link" href="${escape(link)}">Open on GitHub ↗</a>`);
  const segments = skill.path.split('/');
  return `<li class="skill">
<input class="pick" type="radio" name="skill" id="${id}"${index === 0 ? ' checked' : ''}>
<label class="tree-row" for="${id}">${SKILL_ICON}<span class="tree-label">${escape(skill.name)}</span><span class="tree-hint">${escape(segments.slice(0, -2).join('/'))}</span></label>
<article class="skill-details" aria-label="${escape(skill.name)}">
<div class="tabs"><span class="tab">${SKILL_ICON}${escape(segments.at(-1)!)}</span></div>
<div class="crumbs">${segments.map((segment) => `<span>${escape(segment)}</span>`).join('<span aria-hidden="true">›</span>')}</div>
<div class="document">
${lines.join('\n')}
</div>
</article>
</li>`;
}

function property(label: string, value: string): string {
  return `<div class="property"><span class="property-label">${label}</span>${value}</div>`;
}

function escape(text: string): string {
  const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return text.replace(/[&<>"']/g, (character) => entities[character]);
}

const FOLDER_ICON = '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 3.5h5l1.5 1.5h6.5v8h-13z" fill="none" stroke="currentColor"/></svg>';
const SKILL_ICON = '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 1.5h6l3 3v10h-9z" fill="none" stroke="currentColor"/><path d="M5.5 11V7l1.5 1.75L8.5 7v4" fill="none" stroke="var(--accent)"/></svg>';

/** The start page, like the IDE's empty editor: what to type, and two repositories to try. */
const WELCOME = `<section class="welcome">
<span class="logo logo-large" aria-hidden="true">SA</span>
<h2>Welcome to Skill Atlas</h2>
<p>Paste a GitHub repository or organization link above and press <kbd>Enter</kbd>.</p>
<ul class="shortcuts">
${['JetBrains/kotlin', 'JetBrains/intellij-community'].map((id) => `<li><span>Try</span><a href="/?${new URLSearchParams({ repo: `https://github.com/${id}` })}">${id}</a></li>`).join('\n')}
<li><span>Move through skills</span><span class="keys"><kbd>↑</kbd> <kbd>↓</kbd></span></li>
</ul>
</section>
`;

// The IntelliJ IDEA New UI palettes, Light and Dark, with the JetBrains gradient in the toolbar.
const STYLE = `
:root {
  color-scheme: light dark;
  --stripe: 2.5rem; --sidebar: 21rem; --status: 1.75rem;
  --background: #f7f8fa; --surface: #ffffff; --surface-soft: #ebecf0;
  --text: #1e1f22; --muted: #6c707e; --line: #dfe1e5; --input-line: #c9ccd6;
  --accent: #3574f0; --link: #2f65ca; --selection: #d4e2ff;
  --button: #3574f0; --button-hover: #3369d6;
  --error-bg: #fff7f7; --error-text: #b42a3b; --error-line: #fad4d8;
  --warning-bg: #fffaeb; --warning-text: #6e4b00; --warning-line: #fed277;
  --header-bg: #27282e; --header-text: #ffffff; --header-muted: #b4b8bf; --header-line: #1e1f22;
  --brand: linear-gradient(90deg, #087cfa, #fe315d 55%, #f97a12);
}
@media (prefers-color-scheme: dark) {
  :root {
    --background: #2b2d30; --surface: #1e1f22; --surface-soft: #393b40;
    --text: #dfe1e5; --muted: #8c9099; --line: #393b40; --input-line: #4e5157;
    --accent: #3574f0; --link: #548af7; --selection: #2e436e;
    --button: #3574f0; --button-hover: #4682f7;
    --error-bg: #402929; --error-text: #ff9ea8; --error-line: #5e3838;
    --warning-bg: #3d3223; --warning-text: #f2c55c; --warning-line: #5e4d33;
    --header-bg: #2b2d30; --header-text: #dfe1e5; --header-muted: #9da0a8; --header-line: #1e1f22;
  }
}
* { box-sizing: border-box; }
html, body { height: 100%; }
body { display: flex; flex-direction: column; font: 14px/1.5 Inter, system-ui, -apple-system, "Segoe UI", sans-serif; margin: 0; background: var(--background); color: var(--text); }
code, kbd { font: 0.92em "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace; }
a { color: var(--link); text-decoration: none; }
a:hover { text-decoration: underline; text-underline-offset: 0.2em; }
.muted { color: var(--muted); }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.icon { width: 16px; height: 16px; flex: none; color: var(--muted); }

.site-header { position: relative; background: var(--header-bg); color: var(--header-text); border-bottom: 1px solid var(--header-line); }
.site-header::after { content: ""; position: absolute; inset: auto 0 -1px; height: 2px; background: var(--brand); }
.site-header-inner { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem 0.75rem; padding: 0.6rem 1rem; }
.site-header p { margin: 0; color: var(--header-muted); font-size: 0.875rem; }
.site-header code { color: var(--header-text); }
h1 { font-size: 1rem; font-weight: 600; line-height: 1.5; margin: 0; }
.logo { display: inline-grid; place-items: center; width: 1.75rem; height: 1.75rem; border-radius: 0.375rem; background: linear-gradient(#000000, #000000) padding-box, var(--brand) border-box; border: 2px solid transparent; color: #ffffff; font: 700 0.7rem/1 "JetBrains Mono", ui-monospace, monospace; }

main { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow-wrap: anywhere; }
main > form { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin: 0; padding: 0.5rem 1rem; background: var(--background); border-bottom: 1px solid var(--line); }
main > form label { font-size: 0.8125rem; color: var(--muted); font-weight: 500; }
main > form input { max-width: 40rem; }
label { font-size: 0.8125rem; font-weight: 600; }
input { flex: 1; min-width: 0; font: inherit; height: 2rem; padding: 0 0.6rem; color: var(--text); background: var(--surface); border: 1px solid var(--input-line); border-radius: 0.25rem; }
input:focus-visible { outline: none; border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
input::placeholder { color: var(--muted); opacity: 1; }
button { font: inherit; font-weight: 500; height: 2rem; padding: 0 1rem; border: 1px solid transparent; border-radius: 0.25rem; background: var(--button); color: #ffffff; cursor: pointer; }
button:hover { background: var(--button-hover); }

#scan-progress { margin: 1rem; padding: 0.75rem 1rem; border: 1px solid var(--line); border-radius: 0.5rem; background: var(--surface); }
#scan-output { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: auto; }
progress { display: block; width: 100%; height: 0.375rem; margin: 0.5rem 0 0; accent-color: var(--accent); }
.error { margin: 1rem; padding: 0.75rem 1rem; border: 1px solid var(--error-line); border-radius: 0.5rem; background: var(--error-bg); color: var(--error-text); }

.welcome { margin: auto; padding: 3rem 1.5rem; text-align: center; color: var(--muted); }
.welcome h2 { margin: 1rem 0 0.25rem; font-size: 1.5rem; font-weight: 600; color: var(--text); }
.logo-large { width: 4rem; height: 4rem; border-radius: 0.75rem; border-width: 3px; font-size: 1.25rem; }
.shortcuts { list-style: none; display: grid; grid-template-columns: max-content max-content; gap: 0.5rem 1.25rem; justify-content: center; padding: 0; margin: 2rem 0 0; text-align: left; }
.shortcuts li { display: contents; }
.shortcuts li > span:first-child { text-align: right; }
kbd { padding: 0.05rem 0.35rem; border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 0.25rem; background: var(--surface); color: var(--text); }

.ide { position: relative; flex: 1; min-height: 28rem; display: grid; grid-template-columns: var(--stripe) var(--sidebar) minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) var(--status); background: var(--surface); }
.stripe { display: flex; flex-direction: column; align-items: center; padding-top: 0.5rem; background: var(--background); border-right: 1px solid var(--line); }
.stripe-button { display: grid; place-items: center; width: 1.75rem; height: 1.75rem; border-radius: 0.375rem; background: var(--selection); }
.stripe-button .icon { color: var(--accent); }
.tool-window { overflow: auto; padding: 0 0.5rem 1rem; background: var(--background); border-right: 1px solid var(--line); }
.tool-window-title { position: sticky; top: 0; z-index: 1; margin: 0 -0.5rem; padding: 0.5rem 1rem; font-weight: 600; background: var(--background); }
.editor { display: grid; place-items: center; padding: 2rem; color: var(--muted); }
.status-bar { grid-column: 1 / -1; display: flex; justify-content: space-between; gap: 1rem; align-items: center; padding: 0 1rem; font-size: 0.8125rem; color: var(--muted); background: var(--background); border-top: 1px solid var(--line); white-space: nowrap; overflow: hidden; }

h2 { font-size: 0.875rem; font-weight: 600; line-height: 1.5; margin: 0; }
.repository, .organization { padding: 0.25rem 0.5rem 0.5rem; }
.count { color: var(--muted); font-weight: 400; }
.tool-window form { display: flex; flex-wrap: wrap; gap: 0.375rem; align-items: center; margin: 0.25rem 0.5rem 0; }
.tool-window form label { width: 100%; }
.tool-window form a { font-size: 0.8125rem; }
.filter-count, .progress { margin: 0.375rem 0.5rem; color: var(--muted); font-size: 0.8125rem; }
.warnings { margin: 0.5rem; padding: 0.5rem 0.75rem; border: 1px solid var(--warning-line); border-radius: 0.375rem; background: var(--warning-bg); color: var(--warning-text); font-size: 0.8125rem; }
.warnings h3 { margin: 0; font-size: inherit; }
.warnings ul { padding-left: 1rem; margin: 0.25rem 0 0; }
.empty { margin: 0.5rem; padding: 1rem; color: var(--muted); text-align: center; border: 1px dashed var(--line); border-radius: 0.375rem; }

.skills { list-style: none; padding: 0; margin: 0.25rem 0 0; display: grid; grid-template-columns: minmax(0, 1fr); }
.pick { position: absolute; opacity: 0; pointer-events: none; }
.tree-row { display: flex; align-items: center; gap: 0.375rem; min-height: 1.75rem; padding: 0.125rem 0.5rem 0.125rem 1.5rem; border-radius: 0.25rem; font-weight: 400; cursor: pointer; }
.tree-row:hover { background: var(--surface-soft); }
.pick:checked + .tree-row { background: var(--selection); }
.pick:focus-visible + .tree-row { outline: 2px solid var(--accent); outline-offset: -2px; }
.tree-label { min-width: 0; }
.tree-hint { margin-left: auto; padding-left: 0.5rem; color: var(--muted); font-size: 0.75rem; text-align: right; }

.project > summary { display: flex; align-items: center; gap: 0.375rem; min-height: 1.75rem; padding: 0.125rem 0.5rem; border-radius: 0.25rem; cursor: pointer; font-weight: 500; list-style: none; }
.project > summary::-webkit-details-marker { display: none; }
.project > summary::before { content: ""; flex: none; width: 0.4rem; height: 0.4rem; margin: 0 0.3rem 0 0.1rem; border: solid var(--muted); border-width: 0 1.5px 1.5px 0; transform: rotate(-45deg); transition: transform 0.1s; }
.project[open] > summary::before { transform: rotate(45deg); }
.project > summary:hover { background: var(--surface-soft); }
.project > summary:focus-visible { outline-offset: -2px; }
.project > .repository { padding-left: 1.75rem; color: var(--muted); }
.project > .repository h2 { font-weight: 400; font-size: 0.8125rem; }
.project .tree-row { padding-left: 2.25rem; }

.skill-details { display: none; flex-direction: column; background: var(--surface); }
.pick:checked ~ .skill-details { display: flex; position: absolute; top: 0; bottom: var(--status); left: calc(var(--stripe) + var(--sidebar)); right: 0; overflow: auto; }
.tabs { display: flex; flex: none; height: 2.5rem; padding: 0 0.5rem; border-bottom: 1px solid var(--line); }
.tab { display: flex; align-items: center; gap: 0.375rem; padding: 0 0.75rem; border-bottom: 2px solid var(--accent); margin-bottom: -1px; }
.crumbs { display: flex; flex-wrap: wrap; gap: 0.375rem; padding: 0.375rem 1.25rem; font-size: 0.8125rem; color: var(--muted); border-bottom: 1px solid var(--line); }
.document { width: 100%; max-width: 52rem; padding: 2rem 2.5rem 3rem; }
.skill h3.name { margin: 0 0 0.5rem; font-size: 1.75rem; font-weight: 600; line-height: 1.25; letter-spacing: -0.01em; }
.description { margin: 0; font-size: 1.0625rem; }
.document h4 { margin: 2rem 0 0.5rem; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
.about { margin: 0; white-space: pre-line; }
.properties { display: grid; border: 1px solid var(--line); border-radius: 0.5rem; overflow: hidden; }
.property { display: grid; grid-template-columns: 7rem minmax(0, 1fr); gap: 1rem; padding: 0.625rem 1rem; border-top: 1px solid var(--line); }
.property:first-child { border-top: 0; }
.property-label { color: var(--muted); font-size: 0.8125rem; }
.path, .copies, .outside { margin: 0; font-size: 0.875rem; }
.outside { justify-self: start; padding: 0 0.5rem; border-radius: 0.25rem; background: var(--warning-bg); color: var(--warning-text); }
.open-link { display: inline-flex; align-items: center; height: 2rem; margin-top: 1.5rem; padding: 0 1rem; border: 1px solid var(--input-line); border-radius: 0.25rem; color: var(--text); }
.open-link:hover { text-decoration: none; background: var(--surface-soft); }

@media (max-width: 40rem) {
  html, body { height: auto; }
  main, #scan-output { overflow: visible; }
  .ide { display: block; min-height: 0; }
  .stripe, .editor { display: none; }
  .tool-window { overflow: visible; border-right: 0; }
  .status-bar { height: var(--status); }
  .pick:checked ~ .skill-details { position: static; margin: 0.25rem 0 0.75rem; border: 1px solid var(--line); border-radius: 0.5rem; }
  .document { padding: 1rem; }
  .skill h3.name { font-size: 1.375rem; }
  .property { grid-template-columns: minmax(0, 1fr); gap: 0.125rem; }
  main > form label { width: 100%; }
  main > form input { max-width: none; }
  form > a { width: 100%; }
}
`;
