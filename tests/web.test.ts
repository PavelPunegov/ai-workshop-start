// The decisions in spec/web.md, checked over HTTP on a real server: GitHub answers from
// tests/helpers.ts, and ./fixture stands in for a repository with copies, outside skills and a
// malformed SKILL.md.
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, test } from 'node:test';
import { openGitHub } from '../src/core/github.ts';
import { replay } from '../src/core/replay.ts';
import type { Source } from '../src/core/scan.ts';
import { openDirectory } from '../src/local.ts';
import { createWebServer, respond } from '../src/web.ts';
import { EXAMPLE_COMMIT, FIXTURE, github } from './helpers.ts';

/** A running server; `get(repo)` asks the page for that repository link. */
async function serve(open: (input: string) => Promise<Source>, log?: (error: unknown) => void) {
  const server = createWebServer({ open, log });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  after(() => server.close());
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return async (repo?: string, path = '/') => {
    const url = new URL(path, base);
    if (repo !== undefined) url.searchParams.set('repo', repo);
    const response = await fetch(url);
    return { status: response.status, type: response.headers.get('content-type'), html: await response.text() };
  };
}

const live = await serve((input) => openGitHub(input, { fetch: github, token: 'test' }));
const fixture = await serve(() => openDirectory(FIXTURE));

/** The text of each element with the class, tags removed. */
function texts(html: string, className: string): string[] {
  const pattern = new RegExp(`<(\\w+) class="${className}[^"]*"[^>]*>([\\s\\S]*?)</\\1>`, 'g');
  return [...html.matchAll(pattern)].map((match) => match[2].replace(/<[^>]+>/g, '').trim());
}

test('no repository yet → the form alone', async () => {
  const page = await live();
  assert.equal(page.status, 200);
  assert.equal(page.type, 'text/html; charset=utf-8');
  assert.match(page.html, /<form method="get" action="\/">/);
  assert.match(page.html, /<input id="repo" name="repo"[^>]*value=""/);
  assert.doesNotMatch(page.html, /class="(error|skills|repository)"/);
});

test('the site banner stays separate from scanning, results and errors', async () => {
  for (const repo of [undefined, 'https://github.com/JetBrains/example', 'not a link', 'https://github.com/JetBrains/not-answered']) {
    const page = await live(repo);
    const banner = page.html.match(/<body>\s*(<header\b[^>]*>[\s\S]*?<\/header>)\s*<main>/)?.[1];
    assert.ok(banner, 'a site banner precedes the main content');
    assert.match(banner, /<h1>Skill Atlas<\/h1>/);
    assert.match(banner, /Every <code>SKILL.md<\/code> in a GitHub repository or organization/);
    assert.doesNotMatch(banner, /<form|id="scan-output"|role="alert"/);
    assert.equal((page.html.match(/<h1>/g) ?? []).length, 1);
    assert.match(page.html, /<main>\s*<form method="get" action="\/">/);
  }
});

test('the delivered page supports both system themes without browser scripting or stored preferences', async () => {
  const pages = [await live(), await fixture('https://github.com/JetBrains/fixture'), await live('invalid')];
  for (const { html } of pages) {
    const css = html.match(/<style>([\s\S]*?)<\/style>/)![1];
    assert.match(css, /color-scheme:\s*light dark/);
    const darkRule = css.match(/@media\s*\(prefers-color-scheme:\s*dark\)\s*{\s*:root\s*{([^}]+)}/);
    assert.ok(darkRule, 'a dark system preference overrides the page palette');
    const dark = darkRule[1];
    for (const token of ['background', 'surface', 'surface-soft', 'text', 'muted', 'line', 'accent', 'button', 'button-hover', 'error-bg', 'error-text', 'error-line', 'warning-bg', 'warning-text', 'warning-line']) {
      assert.match(dark, new RegExp(`--${token}:\\s*#[0-9a-f]{6}`, 'i'), token);
    }
    assert.match(css, /body\s*{[^}]*background:[^}]*var\(--background\)/);
    assert.match(css, /body\s*{[^}]*color:\s*var\(--text\)/);
    assert.match(css, /\.error\s*{[^}]*background:\s*var\(--error-bg\)/);
    assert.match(css, /\.warnings\s*{[^}]*background:\s*var\(--warning-bg\)/);
    assert.doesNotMatch(html, /localStorage|sessionStorage/);
  }
});

test('the delivered layout accommodates narrow screens, long paths and keyboard focus', async () => {
  const { html } = await fixture('https://github.com/JetBrains/fixture');
  const css = html.match(/<style>([\s\S]*?)<\/style>/)![1];
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /:focus-visible\s*{[^}]*outline:/);
  assert.match(css, /@media\s*\(max-width:\s*40rem\)/);
  assert.match(css, /\.skills\s*{[^}]*display:\s*grid/);
  assert.match(css, /input\s*{[^}]*min-width:\s*0/);
});
test('the start page shows a welcome screen with repositories to try', async () => {
  const page = await live();
  const welcome = page.html.match(/<section class="welcome">([\s\S]*?)<\/section>/)?.[1];
  assert.ok(welcome, 'a welcome screen in the output');
  assert.match(welcome, /<h2>Welcome to Skill Atlas<\/h2>/);
  assert.ok(welcome.includes('href="/?repo=https%3A%2F%2Fgithub.com%2FJetBrains%2Fkotlin"'));
  assert.doesNotMatch(page.html, /class="ide"/);
  for (const repo of ['https://github.com/JetBrains/example', 'not a link']) {
    assert.doesNotMatch((await live(repo)).html, /class="welcome"/, repo);
  }
});

test('a result is an IDE window: stripe, Skills tool window, editor and status bar, in IntelliJ colors', async () => {
  const { html } = await fixture('https://github.com/JetBrains/fixture');
  const ide = html.match(/<div class="ide">[\s\S]*<div class="status-bar">([\s\S]*?)<\/div>\s*<\/div>/);
  assert.ok(ide, 'the result is framed as an IDE window');
  assert.match(ide[0], /<div class="stripe" aria-hidden="true">/);
  assert.match(ide[0], /<aside class="tool-window" aria-label="Skills">\s*<div class="tool-window-title">Skills<\/div>\s*<section class="repository">/);
  assert.match(ide[0], /<div class="editor" aria-hidden="true"><p class="editor-hint">Select a skill in the tree/);
  assert.match(ide[1], /Skill Atlas › fixture/);
  const css = html.match(/<style>([\s\S]*?)<\/style>/)![1];
  assert.match(css, /--accent: #3574f0/);
  assert.match(css, /--header-bg: #27282e/);
  assert.match(css, /--brand: linear-gradient\(90deg, #087cfa, #fe315d 55%, #f97a12\)/);
  assert.match(css, /\.pick:checked ~ \.skill-details\s*{[^}]*display: flex/);
  assert.match(css, /\.pick:focus-visible \+ \.tree-row\s*{[^}]*outline:/);
});

test('each skill is a tree row; the first starts selected and opens in the editor', async () => {
  const { html } = await fixture('https://github.com/JetBrains/fixture');
  const rows = [...html.matchAll(/<input class="pick" type="radio" name="skill" id="(skill-\d+)"( checked)?>\s*<label class="tree-row" for="([^"]+)">[\s\S]*?<span class="tree-label">([^<]*)<\/span><span class="tree-hint">([^<]*)<\/span><\/label>/g)];
  assert.deepEqual(rows.map((row) => [row[1], row[3], row[4], row[5]]), [
    ['skill-0', 'skill-0', 'code-style', '.github/skills'],
    ['skill-1', 'skill-1', 'code-style', 'plugins/tools/skills'],
    ['skill-2', 'skill-2', 'commits', '.agents/skills'],
    ['skill-3', 'skill-3', 'release-checklist', '.agents/skills'],
  ]);
  assert.deepEqual(rows.map((row) => Boolean(row[2])), [true, false, false, false]);
  const filtered = await fixture('https://github.com/JetBrains/fixture', '/?filter=commits');
  assert.match(filtered.html, /id="skill-0" checked>\s*<label class="tree-row" for="skill-0">[\s\S]*?>commits</);
});

test('the editor shows the tab, breadcrumbs, full description, details and a GitHub link', async () => {
  const { html } = await live('https://github.com/JetBrains/example');
  const editor = html.match(/<article class="skill-details" aria-label="commits">([\s\S]*?)<\/article>/)?.[1];
  assert.ok(editor, 'the skill has an editor view');
  assert.match(editor, /<span class="tab">[\s\S]*?SKILL\.md<\/span>/);
  assert.deepEqual(texts(editor, 'crumbs')[0].split('›'), ['.claude', 'skills', 'commits', 'SKILL.md']);
  assert.deepEqual(texts(editor, 'about'), ['Write commit messages the way this repository does. Use for every commit.']);
  assert.match(editor, /<span class="property-label">File<\/span><p class="path">/);
  assert.ok(editor.includes(`<a class="open-link" href="https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md">Open on GitHub ↗</a>`));
  const fixtures = await fixture('https://github.com/JetBrains/fixture');
  assert.match(fixtures.html, /<span class="property-label">Copies<\/span><p class="copies">/);
  assert.match(fixtures.html, /<span class="property-label">Location<\/span><p class="outside">/);
});

test('a single-sentence description is not repeated in the editor', async () => {
  const commit = 'b'.repeat(40);
  const single = await serve((input) => openGitHub(input, { fetch: replay({
    'https://api.github.com/repos/JetBrains/single': { status: 200, body: { full_name: 'JetBrains/single', default_branch: 'main' } },
    'https://api.github.com/repos/JetBrains/single/commits/main': { status: 200, body: { sha: commit } },
    [`https://api.github.com/repos/JetBrains/single/git/trees/${commit}?recursive=1`]: {
      status: 200, body: { truncated: false, tree: [{ path: '.agents/skills/lint/SKILL.md', type: 'blob', mode: '100644' }] },
    },
    [`https://raw.githubusercontent.com/JetBrains/single/${commit}/.agents/skills/lint/SKILL.md`]: {
      status: 200, body: '---\nname: lint\ndescription: Run the linter.\n---\n',
    },
  }) }));
  const { html } = await single('https://github.com/JetBrains/single');
  assert.deepEqual(texts(html, 'description'), ['Run the linter.']);
  assert.deepEqual(texts(html, 'about'), []);
  assert.doesNotMatch(html, /<h4>Description<\/h4>/);
});

test('a repository link → the repository, its count, its commit, and each skill as the CLI shows it', async () => {
  const page = await live('https://github.com/JetBrains/example');
  assert.equal(page.status, 200);
  assert.deepEqual(texts(page.html, 'repository'), [`📦 JetBrains/example · 1 skill · 📌 ${EXAMPLE_COMMIT.slice(0, 7)}`]);
  assert.deepEqual(texts(page.html, 'name'), ['🧩 commits']);
  assert.deepEqual(texts(page.html, 'description'), ['Write commit messages the way this repository does.']);
  assert.deepEqual(texts(page.html, 'path'), ['📄 .claude/skills/commits/SKILL.md']);
  // The link pins the scanned commit; the full description is in the tooltip.
  assert.ok(page.html.includes(`href="https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md"`));
  assert.ok(page.html.includes('title="Write commit messages the way this repository does. Use for every commit."'));
  assert.deepEqual(texts(page.html, 'copies'), []);
  assert.deepEqual(texts(page.html, 'outside'), []);
  assert.deepEqual(texts(page.html, 'filter-count'), ['Showing 1 of 1 skill']);
  // The input keeps what was typed.
  assert.ok(page.html.includes('value="https://github.com/JetBrains/example"'));
});

test('skills sorted by name, with copies, outside .agents and .claude, and warnings', async () => {
  const page = await fixture('https://github.com/JetBrains/fixture');
  assert.equal(page.status, 200);
  assert.match(texts(page.html, 'repository')[0], /^📦 fixture · 4 skills$/);
  assert.deepEqual(texts(page.html, 'name'), ['🧩 code-style', '🧩 code-style', '🧩 commits', '🧩 release-checklist']);
  assert.deepEqual(texts(page.html, 'path'), [
    '📄 .github/skills/code-style/SKILL.md',
    '📄 plugins/tools/skills/code-style/SKILL.md',
    '📄 .agents/skills/commits/SKILL.md',
    '📄 .agents/skills/release-checklist/SKILL.md',
  ]);
  assert.deepEqual(texts(page.html, 'copies'), [
    '🪞 Also in .claude/skills/commits/SKILL.md, plugins/tools/skills/commits/SKILL.md',
  ]);
  assert.deepEqual(texts(page.html, 'outside'), ['📍 Outside .agents and .claude', '📍 Outside .agents and .claude']);
  // The malformed one: its directory name, no description, and a warning on the page.
  assert.equal(texts(page.html, 'description').at(-1), 'No description');
  const [warnings] = texts(page.html, 'warnings');
  assert.match(warnings, /⚠️ Warnings\s+\.agents\/skills\/release-checklist\/SKILL\.md: malformed front matter: /);
});

test('valid links accept surrounding whitespace and keep it in the form', async () => {
  const input = '  https://github.com/JetBrains/example  ';
  const page = await live(input);
  assert.equal(page.status, 200);
  assert.ok(page.html.includes(`value="${input}"`));
  assert.deepEqual(texts(page.html, 'name'), ['🧩 commits']);
});

test('the filter form keeps the repository and offers a clear link', async () => {
  const page = await fixture('https://github.com/JetBrains/fixture', '/?filter=commits');
  assert.match(page.html, /<label for="filter">Filter skills<\/label>/);
  assert.match(page.html, /<input type="hidden" name="repo" value="https:\/\/github.com\/JetBrains\/fixture">/);
  assert.match(page.html, /<input id="filter" name="filter" type="search" value="commits"/);
  assert.match(page.html, /<button type="submit">Filter<\/button>/);
  assert.match(page.html, /href="\/\?repo=https%3A%2F%2Fgithub.com%2FJetBrains%2Ffixture">Clear filter<\/a>/);
  assert.deepEqual(texts(page.html, 'copies'), [
    '🪞 Also in .claude/skills/commits/SKILL.md, plugins/tools/skills/commits/SKILL.md',
  ]);
  const clearUrl = page.html.match(/<a href="([^"\n]+)">Clear filter<\/a>/)![1];
  const cleared = await fixture(undefined, clearUrl.replaceAll('&amp;', '&'));
  assert.equal(texts(cleared.html, 'name').length, 4);
  assert.match(cleared.html, /id="filter" name="filter" type="search" value=""/);
  const repositoryForm = page.html.match(/<form[\s\S]*?<\/form>/)![0];
  assert.doesNotMatch(repositoryForm, /name="filter"/);
});

test('filtering retains the scanned commit and uses the full description', async () => {
  const page = await live('https://github.com/JetBrains/example', '/?filter=USE%20FOR%20EVERY');
  assert.equal(page.status, 200);
  assert.deepEqual(texts(page.html, 'name'), ['🧩 commits']);
  assert.match(texts(page.html, 'repository')[0], new RegExp(EXAMPLE_COMMIT.slice(0, 7)));
  assert.ok(page.html.includes(`/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`));
});

test('filter matches names, full descriptions and primary or copy paths, ignoring case and surrounding whitespace', async () => {
  const cases: [string, string[]][] = [
    ['  CoDe-StYlE  ', ['🧩 code-style', '🧩 code-style']],
    ['KOTLIN OR JAVA', ['🧩 code-style']],
    ['plugins/tools/skills/code-style', ['🧩 code-style']],
    ['.claude/skills/commits', ['🧩 commits']],
    ['release-checklist', ['🧩 release-checklist']],
    ['', ['🧩 code-style', '🧩 code-style', '🧩 commits', '🧩 release-checklist']],
    ['   ', ['🧩 code-style', '🧩 code-style', '🧩 commits', '🧩 release-checklist']],
  ];
  for (const [filter, expected] of cases) {
    const page = await fixture('https://github.com/JetBrains/fixture', `/?filter=${encodeURIComponent(filter)}`);
    assert.equal(page.status, 200);
    assert.deepEqual(texts(page.html, 'name'), expected, filter);
    assert.deepEqual(texts(page.html, 'filter-count'), [`Showing ${expected.length} of 4 skills`]);
    assert.match(texts(page.html, 'repository')[0], /4 skills/);
    assert.match(texts(page.html, 'warnings')[0], /malformed front matter/);
  }
});

test('no matches is different from a repository without skills', async () => {
  const page = await fixture('https://github.com/JetBrains/fixture', '/?filter=nonexistent');
  assert.deepEqual(texts(page.html, 'name'), []);
  assert.deepEqual(texts(page.html, 'filter-count'), ['Showing 0 of 4 skills']);
  assert.deepEqual(texts(page.html, 'empty'), ['No skills match this filter.']);
  const empty = await serve(async () => ({ ...(await openDirectory(FIXTURE)), paths: [] }));
  const result = await empty('https://github.com/JetBrains/empty', '/?filter=commits');
  assert.deepEqual(texts(result.html, 'empty'), ['🫙 No SKILL.md in this repository.']);
  assert.doesNotMatch(result.html, /id="filter"/);
});

test('filter input is literal text and is escaped in the form', async () => {
  const filter = '\"><script>alert(1)</script>&';
  const page = await fixture('https://github.com/JetBrains/fixture', `/?filter=${encodeURIComponent(filter)}`);
  assert.equal(page.status, 200);
  assert.doesNotMatch(page.html, /<script>/);
  assert.ok(page.html.includes('value="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;&amp;"'));
  assert.deepEqual(texts(page.html, 'name'), []);
  const literal = await fixture('https://github.com/JetBrains/fixture', '/?filter=.*');
  assert.deepEqual(texts(literal.html, 'name'), []);
});

test('malformed input → an error message, status 400, nothing fetched', async () => {
  let opened = false;
  const page = await serve(async (input) => {
    opened = true;
    return openDirectory(input);
  });
  for (const input of ['', ' ', '   ', '\t\n', '\u00a0', 'not a link', '  not a link  ', '../fixture', 'https://gitlab.com/JetBrains/kotlin', 'https://github.com/JetBrains/repo/tree/main']) {
    const result = await page(input);
    assert.equal(result.status, 400, input);
    assert.match(result.html, /<div class="error" role="alert">❌ Not a GitHub repository or organization URL: /, input);
    assert.doesNotMatch(result.html, /class="skills"/, input);
    assert.ok(result.html.includes(`value="${input}"`), 'the form keeps the submitted input');
  }
  assert.equal(opened, false);
});

test('unreachable repository → an error message, status 502', async () => {
  const offline = await live('https://github.com/JetBrains/not-answered');
  assert.equal(offline.status, 502);
  assert.deepEqual(texts(offline.html, 'error'), [
    '❌ Cannot reach GitHub: not recorded: https://api.github.com/repos/JetBrains/not-answered',
  ]);

  const notFound = await serve((input) =>
    openGitHub(input, {
      fetch: replay({ 'https://api.github.com/repos/JetBrains/no-such-repository': { status: 404, body: { message: 'Not Found' } } }),
    }),
  );
  const missing = await notFound('https://github.com/JetBrains/no-such-repository');
  assert.equal(missing.status, 502);
  assert.deepEqual(texts(missing.html, 'error'), ['❌ Repository not found: https://github.com/JetBrains/no-such-repository']);
});

test('any other failure → a generic message, status 500, the details in the server log', async () => {
  const logged: unknown[] = [];
  const broken = await serve(async () => {
    throw new Error('internal detail: /srv/secret');
  }, (error) => logged.push(error));
  const page = await broken('https://github.com/JetBrains/example');
  assert.equal(page.status, 500);
  assert.deepEqual(texts(page.html, 'error'), ['❌ Something went wrong; the details are in the server log.']);
  assert.doesNotMatch(page.html, /internal detail/);
  assert.equal(logged.length, 1);
  assert.equal((logged[0] as Error).message, 'internal detail: /srv/secret');
});

test('respond: the status and the page, without a socket', async () => {
  const services = { open: () => openDirectory(FIXTURE), log: () => assert.fail('nothing to log') };
  const answer = (path: string, method = 'GET') => respond(new URL(path, 'http://localhost'), method, services);
  assert.deepEqual(await answer('/'), { status: 200, page: {} });
  for (const path of ['/?repo', '/?repo=', '/?repo=+++', '/?repo=%20']) {
    const invalid = await answer(path);
    assert.equal(invalid.status, 400, path);
    assert.equal(invalid.page.input, new URL(path, 'http://localhost').searchParams.get('repo'));
    assert.match(invalid.page.error!, /Not a GitHub repository or organization URL/);
  }
  assert.equal((await answer('/?repo=nope')).status, 400);
  assert.equal((await answer('/', 'POST')).status, 404);
  const scanned = await answer('/?repo=github.com/JetBrains/fixture');
  assert.equal(scanned.status, 200);
  assert.equal(scanned.page.input, 'github.com/JetBrains/fixture');
  assert.equal(scanned.page.result?.skills.length, 4);
});

test('what the user typed is escaped, never markup', async () => {
  const page = await live('<script>alert(1)</script>');
  assert.equal(page.status, 400);
  assert.doesNotMatch(page.html, /<script>/);
  assert.ok(page.html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
});

test('another path → not found', async () => {
  const page = await live(undefined, '/elsewhere');
  assert.equal(page.status, 404);
  assert.match(page.html, /❌ Not found: \/elsewhere/);
});
