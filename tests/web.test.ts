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
import { createWebServer } from '../src/web.ts';
import { EXAMPLE_COMMIT, FIXTURE, github } from './helpers.ts';

/** A running server; `get(repo)` asks the page for that repository link. */
async function serve(open: (input: string) => Promise<Source>) {
  const server = createWebServer({ open });
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

test('malformed input → an error message, status 400, nothing fetched', async () => {
  let opened = false;
  const page = await serve(async (input) => {
    opened = true;
    return openDirectory(input);
  });
  for (const input of ['not a link', '../fixture', 'https://gitlab.com/JetBrains/kotlin', 'https://github.com/JetBrains']) {
    const result = await page(input);
    assert.equal(result.status, 400, input);
    assert.match(result.html, /<div class="error" role="alert">❌ Not a GitHub repository URL: /, input);
    assert.doesNotMatch(result.html, /class="skills"/, input);
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
