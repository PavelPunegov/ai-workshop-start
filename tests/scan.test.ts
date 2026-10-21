// The decisions in spec/analysis.md and spec/cli.md, checked on what the real command prints for
// ./fixture and for a small GitHub repository answered in tests/helpers.ts. The edge cases of
// where skills live are yours to add.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { openGitHub } from '../src/core/github.ts';
import { parseSkill } from '../src/core/parse.ts';
import { replay } from '../src/core/replay.ts';
import { scan } from '../src/core/scan.ts';
import { atlas, CLI, EXAMPLE_COMMIT, FIXTURE } from './helpers.ts';

const fixture = await atlas(['scan', FIXTURE]);
const example = await atlas(['scan', 'github.com/JetBrains/example']);

test('malformed front matter → the directory name, no description and a warning', () => {
  const parsed = parseSkill(readFileSync(join(FIXTURE, '.agents/skills/release-checklist/SKILL.md'), 'utf8'));
  assert.equal(parsed.name, undefined);
  assert.equal(parsed.description, '');
  assert.equal(
    parsed.warning,
    'malformed front matter: Nested mappings are not allowed in compact mappings at line 3, column 14; using the directory name',
  );
});

test('scan prints the repository, then each skill with its first sentence and pinned link', () => {
  assert.equal(example.code, 0, example.stderr);
  assert.equal(
    example.stdout,
    [
      'JetBrains/example · 1 skill',
      'commits — Write commit messages the way this repository does.',
      `  https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`,
    ].join('\n'),
  );
});

test('./fixture: every skill, sorted by name, linked to its file, with a warning for the malformed one', () => {
  const root = pathToFileURL(FIXTURE).href;
  assert.equal(fixture.code, 0);
  assert.equal(
    fixture.stdout,
    [
      'fixture · 4 skills',
      "code-style — Follow the project's code style.",
      `  ${root}/.github/skills/code-style/SKILL.md`,
      '  outside .agents and .claude',
      "code-style — Format the plugin's Kotlin sources.",
      `  ${root}/plugins/tools/skills/code-style/SKILL.md`,
      '  outside .agents and .claude',
      'commits — Write commit messages the way this repository does.',
      `  ${root}/.agents/skills/commits/SKILL.md`,
      '  also in .claude/skills/commits/SKILL.md, plugins/tools/skills/commits/SKILL.md',
      'release-checklist',
      `  ${root}/.agents/skills/release-checklist/SKILL.md`,
    ].join('\n'),
  );
  assert.match(fixture.stderr, /^warning: \.agents\/skills\/release-checklist\/SKILL\.md: malformed front matter: /);
});

test('identical skills → one skill, the copy in .agents or .claude first, the others under `also in`', () => {
  const lines = fixture.stdout.split('\n');
  const commits = lines.findIndex((line) => line.startsWith('commits — '));
  assert.equal(lines.filter((line) => line.startsWith('commits')).length, 1);
  assert.match(lines[commits + 1], /\/\.agents\/skills\/commits\/SKILL\.md$/);
  assert.equal(lines[commits + 2], '  also in .claude/skills/commits/SKILL.md, plugins/tools/skills/commits/SKILL.md');
  // The same name, a different file: two skills, no copies.
  assert.equal(lines.filter((line) => line.startsWith('code-style — ')).length, 2);
  assert.doesNotMatch(fixture.stdout, /also in .*code-style/);
});

test('a skill with no copy in .agents or .claude → marked as outside them', () => {
  const lines = fixture.stdout.split('\n');
  const outside = lines.flatMap((line, index) => (line === '  outside .agents and .claude' ? [lines[index - 1]] : []));
  assert.deepEqual(
    outside.map((link) => link.replace(/^.*\/fixture\//, '')),
    ['.github/skills/code-style/SKILL.md', 'plugins/tools/skills/code-style/SKILL.md'],
  );
  // commits has a copy in plugins/, but its main copy is in .agents: not marked.
  assert.equal(outside.some((link) => link.includes('/commits/')), false);
});

test('the CLI prints the result at once and stores nothing', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'skill-atlas-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const scanned = spawnSync(process.execPath, [CLI, 'scan', FIXTURE], { cwd, encoding: 'utf8' });
  assert.equal(scanned.status, 0, scanned.stderr);
  assert.equal(scanned.stdout, `${fixture.stdout}\n`);
  assert.deepEqual(readdirSync(cwd), []);
});

test('unreachable repository → a clear message, exit code 1', async () => {
  const missing = spawnSync(process.execPath, [CLI, 'scan', join(FIXTURE, 'no-such-directory')], { encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /^Not a GitHub URL or a readable directory: .*no-such-directory\n$/);

  // What GitHub answers for a repository that does not exist.
  const notFound = replay({ 'https://api.github.com/repos/JetBrains/no-such-repository': { status: 404, body: { message: 'Not Found' } } });
  await assert.rejects(openGitHub('https://github.com/JetBrains/no-such-repository', { fetch: notFound }), {
    message: 'Repository not found: https://github.com/JetBrains/no-such-repository',
  });

  const offline = await atlas(['scan', 'https://github.com/JetBrains/not-answered']);
  assert.equal(offline.code, 1);
  assert.match(offline.stderr, /^Cannot reach GitHub: not recorded: https:\/\/api\.github\.com\/repos\/JetBrains\/not-answered$/);
});

test('rate limit → a message that asks for GITHUB_TOKEN', async () => {
  const limited = replay({
    'https://api.github.com/repos/JetBrains/MPS': {
      status: 403,
      body: { message: 'API rate limit exceeded for 192.0.2.1. (But here is the good news: ...)' },
    },
  });
  await assert.rejects(openGitHub('https://github.com/JetBrains/MPS', { fetch: limited }), {
    message: 'GitHub rate limit reached; set GITHUB_TOKEN',
  });
});

test('without a token, a truncated tree warns and scans known roots without code search', async () => {
  const api = 'https://api.github.com/repos/Acme/large';
  const recorded = replay({
    [api]: { status: 200, body: { full_name: 'Acme/large', default_branch: 'main' } },
    [`${api}/commits/main`]: { status: 200, body: { sha: 'commit' } },
    [`${api}/git/trees/commit?recursive=1`]: { status: 200, body: { truncated: true, tree: [] } },
    [`${api}/git/trees/commit`]: { status: 200, body: { tree: [{ path: '.agents', type: 'tree', sha: 'agents' }] } },
    [`${api}/git/trees/agents`]: { status: 200, body: { tree: [{ path: 'skills', type: 'tree', sha: 'skills' }] } },
    [`${api}/git/trees/skills?recursive=1`]: { status: 200, body: {
      truncated: false, tree: [{ path: 'commits/SKILL.md', type: 'blob', mode: '100644' }],
    } },
    'https://raw.githubusercontent.com/Acme/large/commit/.agents/skills/commits/SKILL.md': { status: 200, body: '---\nname: commits\n---\n' },
  });
  const urls: string[] = [];
  const result = await scan(await openGitHub('github.com/Acme/large', { fetch: async (url, init) => {
    assert.equal(init?.headers?.Authorization, undefined);
    urls.push(url);
    return recorded(url, init);
  } }));
  assert.equal(result.skills.length, 1);
  assert.equal(result.skills[0].path, '.agents/skills/commits/SKILL.md');
  assert.match(result.warnings[0], /tree is too large.*GITHUB_TOKEN/);
  assert.equal(urls.filter((url) => url === `${api}/git/trees/commit`).length, 1);
  assert.ok(!urls.some((url) => url.includes('/search/code')));
});
