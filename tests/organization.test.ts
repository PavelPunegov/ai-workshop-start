import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { createBrowserBackend } from '../src/browser.ts';
import { openOrganization, parseGitHubOrganizationUrl, type Fetch } from '../src/core/github.ts';
import { scanOrganization } from '../src/core/organization.ts';
import { replay, type Recording } from '../src/core/replay.ts';
import { createWebServer } from '../src/web.ts';
import { CLI } from './helpers.ts';

const API = 'https://api.github.com';
const content = '---\nname: commits\ndescription: Write commits. More detail.\n---\n';

function organization(): Recording {
  const answers: Recording = {
    [`${API}/orgs/Acme`]: { status: 200, body: { login: 'Acme' } },
    [`${API}/orgs/Acme/repos?type=all&per_page=100&page=1`]: {
      status: 200, body: ['beta', 'empty', 'alpha'].map((name) => ({ full_name: `Acme/${name}`, fork: name === 'beta', archived: name === 'alpha' })),
    },
  };
  for (const name of ['alpha', 'beta', 'empty']) {
    const id = `Acme/${name}`;
    answers[`${API}/repos/${id}`] = { status: 200, body: { full_name: id, default_branch: 'main' } };
    answers[`${API}/repos/${id}/commits/main`] = name === 'empty'
      ? { status: 409, body: { message: 'Git Repository is empty.' } }
      : { status: 200, body: { sha: 'abc1234' } };
    const paths = ['.agents/skills/commits/SKILL.md', '.claude/skills/commits/SKILL.md'];
    answers[`${API}/repos/${id}/git/trees/abc1234?recursive=1`] = {
      status: 200, body: { truncated: false, tree: paths.map((path) => ({ path, type: 'blob', mode: '100644' })) },
    };
    for (const path of paths) answers[`https://raw.githubusercontent.com/${id}/abc1234/${path}`] = { status: 200, body: content };
  }
  return answers;
}

async function serve(t: TestContext, answers: Recording | Fetch = organization()) {
  const server = createWebServer({ github: { fetch: typeof answers === 'function' ? answers : replay(answers) } });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

test('organization command: sorted projects, per-project copies, cross-project totals, and progress', async () => {
  const backend = createBrowserBackend({ fetch: replay(organization()) });
  const output = await backend.run('scan https://github.com/Acme');
  assert.match(output, /Acme · 3 projects · 2 skills/);
  assert.ok(output.indexOf('Acme/alpha · 1 skill') < output.indexOf('Acme/beta · 1 skill'));
  assert.match(output, /Acme\/empty · 0 skills/);
  assert.equal((output.match(/also in \.claude\/skills\/commits\/SKILL.md/g) ?? []).length, 2);
  assert.match(output, /https:\/\/github.com\/Acme\/alpha\/blob\/abc1234\//);
  assert.match(output, /Scanning Acme: 0\/3 projects/);
  assert.match(output, /Scanning Acme: 3\/3 projects/);
});

test('organization web page: summary, collapsed projects including empty ones, and existing filters', async (t) => {
  const base = await serve(t);
  const response = await fetch(`${base}/?repo=https://github.com/Acme`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Acme<\/a> · 3 projects · 2 skills/);
  assert.equal((html.match(/<details class="project">/g) ?? []).length, 3);
  assert.doesNotMatch(html, /<details[^>]* open/);
  assert.match(html, /No SKILL.md in this repository/);
  assert.match(html, /Also in/);
  assert.match(html, /abc1234/);
  assert.match(html, /<progress[^>]*value="3"[^>]*max="3"/);
  const filtered = await fetch(`${base}/?repo=github.com/Acme&filter=nonexistent`).then((r) => r.text());
  assert.match(filtered, /Showing 0 of 2 skills/);
  assert.match(filtered, /No skills match this filter/);
  assert.equal((filtered.match(/<details class="project">/g) ?? []).length, 3);
});

test('web streams real progress before the scan completes, then the rendered result', async (t) => {
  const recorded = replay(organization());
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  t.after(release);
  const base = await serve(t, async (url, init) => {
    if (url === `${API}/repos/Acme/alpha`) await gate;
    return recorded(url, init);
  });
  const response = await fetch(`${base}/events?org=https://github.com/Acme`);
  assert.equal(response.headers.get('content-type'), 'text/event-stream; charset=utf-8');
  const reader = response.body!.getReader();
  const first = await reader.read();
  let body = new TextDecoder().decode(first.value);
  assert.match(body, /"completed":0,"total":3/);
  assert.doesNotMatch(body, /"type":"result"/);
  release();
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    body += new TextDecoder().decode(next.value);
  }
  const events = body.trim().split('\n\n').map((event) => JSON.parse(event.replace(/^data: /, '')));
  assert.deepEqual(events.filter((e) => e.type === 'progress').map((e) => [e.completed, e.total]), [[0, 3], [1, 3], [2, 3], [3, 3]]);
  assert.equal(events.at(-1).type, 'result');
  assert.match(events.at(-1).html, /3 projects · 2 skills/);
});

test('repository pagination includes every project, deduplicates page overlaps, and sends credentials', async () => {
  const answers = organization();
  answers[`${API}/orgs/Acme/repos?type=all&per_page=100&page=1`].body = Array.from({ length: 100 }, (_, i) => ({ full_name: `Acme/project-${i}` }));
  answers[`${API}/orgs/Acme/repos?type=all&per_page=100&page=2`] = {
    status: 200, body: [{ full_name: 'Acme/project-99' }, { full_name: 'Acme/last' }],
  };
  const recorded = replay(answers);
  const urls: string[] = [];
  const fetch: Fetch = async (url, init) => {
    assert.equal(init?.headers?.Authorization, 'Bearer test');
    urls.push(url);
    return recorded(url, init);
  };
  const result = await openOrganization('http://www.github.com/Acme/', { fetch, token: 'test' });
  assert.equal(result.repositories.length, 101);
  assert.ok(result.repositories.includes('Acme/last'));
  assert.deepEqual(result.repositories, [...result.repositories].sort());
  assert.equal(urls.length, 3);
});

test('authenticated organizations use trees and still scan when code search is rate limited', async () => {
  const answers = organization();
  for (const name of ['alpha', 'beta']) {
    answers[`${API}/search/code?q=filename:SKILL.md+repo:Acme/${name}&per_page=100&page=1`] = {
      status: 403, body: { message: 'API rate limit exceeded' },
    };
  }
  const raw: string[] = [];
  const recorded = replay(answers);
  const result = await scanOrganization('github.com/Acme', {
    token: 'test', fetch: async (url, init) => {
      assert.equal(init?.headers?.Authorization, 'Bearer test');
      if (url.startsWith('https://raw.')) raw.push(url);
      return recorded(url, init);
    },
  });
  assert.equal(raw.length, 4);
  assert.equal(result.projects.length, 3);
});

test('real CLI keeps progress on stderr, prints the report at once, and writes no scan data', (t) => {
  const temporary = mkdtempSync(join(tmpdir(), 'atlas-organization-'));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const preload = join(temporary, 'github.mjs');
  writeFileSync(preload, `const answers = ${JSON.stringify(organization())};
globalThis.fetch = async (url) => {
  if (!Object.hasOwn(answers, url)) throw new Error('Unexpected URL: ' + url);
  const { status, body } = answers[url];
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
};`);
  const result = spawnSync(process.execPath, ['--import', preload, CLI, 'scan', 'github.com/Acme'], {
    cwd: temporary, env: { ...process.env, GITHUB_TOKEN: '' }, encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^Acme · 3 projects · 2 skills\nAcme\/alpha/);
  assert.doesNotMatch(result.stdout, /Scanning/);
  assert.match(result.stderr, /^Scanning Acme: 0\/3 projects\n/);
  assert.match(result.stderr, /Scanning Acme: 3\/3 projects\n$/);
  assert.deepEqual(readdirSync(temporary), ['github.mjs']);
  const broken = organization();
  broken[`${API}/repos/Acme/beta`] = { status: 404, body: { message: 'Not Found' } };
  writeFileSync(preload, `const answers = ${JSON.stringify(broken)};
globalThis.fetch = async (url) => {
  const { status, body } = answers[url];
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
};`);
  const failed = spawnSync(process.execPath, ['--import', preload, CLI, 'scan', 'github.com/Acme'], {
    env: { ...process.env, GITHUB_TOKEN: '' }, encoding: 'utf8',
  });
  assert.equal(failed.status, 1);
  assert.equal(failed.stdout, '');
  assert.match(failed.stderr, /Repository not found: https:\/\/github.com\/Acme\/beta/);
});

test('organization URL validation rejects repository paths, other hosts, local paths and query strings', () => {
  for (const input of ['github.com/Acme', 'https://github.com/Acme/', 'http://www.github.com/Acme']) {
    assert.equal(parseGitHubOrganizationUrl(input), 'Acme');
  }
  for (const input of ['github.com/Acme/repo', 'https://github.com/Acme?tab=repositories', 'github.com/Acme#x', 'https://example.com/Acme', '/etc', 'github.com/../']) {
    assert.equal(parseGitHubOrganizationUrl(input), undefined);
  }
});

test('bad stream targets are rejected before GitHub is called; the browser script is served', async (t) => {
  const base = await serve(t, async () => assert.fail('nothing should be fetched'));
  for (const input of ['../fixture', 'https://github.com/Acme/repo', '<script>']) {
    assert.equal((await fetch(`${base}/events?org=${encodeURIComponent(input)}`)).status, 400);
  }
  const script = await fetch(`${base}/client.js`);
  assert.equal(script.headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.match(await script.text(), /new EventSource/);
});

test('empty organization has an explicit zero summary and no projects', async (t) => {
  const answers = organization();
  answers[`${API}/orgs/Acme/repos?type=all&per_page=100&page=1`].body = [];
  const base = await serve(t, answers);
  const html = await fetch(`${base}/?repo=github.com/Acme`).then((r) => r.text());
  assert.match(html, /0 projects · 0 skills/);
  assert.match(html, /No repositories in this organization/);
  assert.doesNotMatch(html, /<details/);
  const output = await createBrowserBackend({ fetch: replay(answers) }).run('scan github.com/Acme');
  assert.match(output, /Acme · 0 projects · 0 skills/);
  const stream = await fetch(`${base}/events?org=github.com/Acme`).then((r) => r.text());
  assert.match(stream, /"completed":0,"total":0/);
  assert.match(stream, /"type":"result"/);
});

test('one project and one skill use singular counts', async (t) => {
  const answers = organization();
  answers[`${API}/orgs/Acme/repos?type=all&per_page=100&page=1`].body = [{ full_name: 'Acme/alpha' }];
  const output = await createBrowserBackend({ fetch: replay(answers) }).run('scan github.com/Acme');
  assert.match(output, /Acme · 1 project · 1 skill/);
  const base = await serve(t, answers);
  const html = await fetch(`${base}/?repo=github.com/Acme&filter=MORE%20DETAIL`).then((r) => r.text());
  assert.match(html, /1 project · 1 skill/);
  assert.match(html, /Showing 1 of 1 skill/);
  assert.match(html, /class="name">🧩 commits/);
});

test('missing organization, rate limit, and repository failures never produce a complete summary', async (t) => {
  for (const [url, status, message] of [
    [`${API}/orgs/Acme`, 404, 'Not Found'],
    [`${API}/orgs/Acme/repos?type=all&per_page=100&page=1`, 403, 'API rate limit exceeded'],
    [`${API}/repos/Acme/beta`, 404, 'Not Found'],
    [`${API}/orgs/Acme`, 401, 'Bad credentials'],
  ] as const) {
    const answers = organization();
    answers[url] = { status, body: { message } };
    const base = await serve(t, answers);
    const response = await fetch(`${base}/?repo=github.com/Acme`);
    assert.equal(response.status, 502);
    const html = await response.text();
    assert.match(html, /role="alert"/);
    assert.doesNotMatch(html, /class="organization"/);
    const stream = await fetch(`${base}/events?org=github.com/Acme`).then((r) => r.text());
    assert.match(stream, /"type":"error"/);
    assert.doesNotMatch(stream, /"type":"result"/);
  }
});

test('warnings and skill metadata stay inside their project and are escaped in HTML and event results', async (t) => {
  const answers = organization();
  for (const prefix of ['.agents', '.claude']) {
    answers[`https://raw.githubusercontent.com/Acme/alpha/abc1234/${prefix}/skills/commits/SKILL.md`].body = '---\nname: "<img src=x onerror=alert(1)>"\ndescription: "A <script>bad</script> description. More."\n---\n';
    answers[`https://raw.githubusercontent.com/Acme/beta/abc1234/${prefix}/skills/commits/SKILL.md`].body = '---\nname: [malformed\n---\n';
  }
  const base = await serve(t, answers);
  for (const path of ['/?repo=github.com/Acme', '/events?org=github.com/Acme']) {
    const body = await fetch(base + path).then((r) => r.text());
    const html = path.startsWith('/events')
      ? JSON.parse(body.trim().split('\n\n').at(-1)!.slice(6)).html : body;
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.doesNotMatch(html, /<img|<script>/);
    assert.match(html, /malformed front matter/);
    const beta = html.slice(html.indexOf('<summary>📦 Acme/beta'));
    assert.match(beta, /class="warnings"/);
  }
});

test('unexpected event failures are logged with only a generic error sent to the browser', async (t) => {
  const logs: unknown[] = [];
  // Malformed API JSON, unlike a network failure, is an unexpected internal failure.
  const broken = createWebServer({ github: { fetch: async () => new Response('private internal detail') }, log: (error) => logs.push(error) });
  await new Promise<void>((resolve) => broken.listen(0, '127.0.0.1', resolve));
  t.after(() => broken.close());
  const base = `http://127.0.0.1:${(broken.address() as AddressInfo).port}`;
  const body = await fetch(`${base}/events?org=github.com/Acme`).then((r) => r.text());
  assert.match(body, /Something went wrong/);
  assert.doesNotMatch(body, /private internal detail/);
  assert.equal(logs.length, 1);
});

test('disconnecting the progress request aborts every active project and never starts queued projects', { timeout: 5000 }, async (t) => {
  const answers = organization();
  answers[`${API}/orgs/Acme/repos?type=all&per_page=100&page=1`].body = Array.from({ length: 8 }, (_, i) => ({ full_name: `Acme/project-${i}` }));
  const recorded = replay(answers);
  const active: string[] = [];
  const cancellations: string[] = [];
  let cancelled!: () => void;
  let started!: () => void;
  const aborted = new Promise<void>((resolve) => { cancelled = resolve; });
  const pending = new Promise<void>((resolve) => { started = resolve; });
  const base = await serve(t, async (url, init) => {
    if (!url.startsWith(`${API}/repos/Acme/project-`)) return recorded(url, init);
    active.push(url);
    return new Promise<Response>((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => {
        cancellations.push(url);
        if (cancellations.length === 4) cancelled();
        reject(new Error('aborted'));
      }, { once: true });
      if (active.length === 4) started();
    });
  });
  const disconnect = new AbortController();
  t.after(() => disconnect.abort());
  const response = await fetch(`${base}/events?org=github.com/Acme`, { signal: disconnect.signal });
  const reader = response.body!.getReader();
  await reader.read();
  await pending;
  await reader.cancel();
  await aborted;
  assert.equal(active.length, 4);
  assert.deepEqual(cancellations, active);
});

test('projects run four at a time, report completion order, and return sorted results', { timeout: 5000 }, async (t) => {
  const answers = organization();
  const names = Array.from({ length: 9 }, (_, i) => `project-${i}`);
  answers[`${API}/orgs/Acme/repos?type=all&per_page=100&page=1`].body = names.map((name) => ({ full_name: `Acme/${name}` }));
  for (const name of names) {
    answers[`${API}/repos/Acme/${name}`] = { status: 200, body: { full_name: `Acme/${name}`, default_branch: 'main' } };
    answers[`${API}/repos/Acme/${name}/commits/main`] = { status: 409, body: { message: 'Git Repository is empty.' } };
  }
  const recorded = replay(answers);
  const started: string[] = [];
  const completed: string[] = [];
  const progress: number[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const pending = scanOrganization('github.com/Acme', { fetch: async (url, init) => {
    if (/\/repos\/Acme\/project-\d$/.test(url)) {
      started.push(url);
      if (!url.endsWith('project-1')) await gate;
    }
    if (url.includes('/commits/')) completed.push(url);
    return recorded(url, init);
  } }, (event) => { progress.push(event.completed); });
  t.after(async () => { release(); await pending.catch(() => {}); });
  await new Promise(setImmediate);
  // One fast project finishes while the first stays blocked, freeing a worker for project 4.
  assert.equal(started.length, 5);
  assert.equal(completed.length, 1);
  assert.match(completed[0], /project-1/);
  assert.deepEqual(progress, [0, 1]);
  release();
  const result = await pending;
  assert.deepEqual(result.projects.map((p) => p.repository.id), names.map((name) => `Acme/${name}`));
  assert.deepEqual(progress, Array.from({ length: 10 }, (_, i) => i));
});

test('a project failure cancels other workers, stops queued projects, and preserves the error', { timeout: 5000 }, async () => {
  const answers = organization();
  answers[`${API}/orgs/Acme/repos?type=all&per_page=100&page=1`].body = Array.from({ length: 8 }, (_, i) => ({ full_name: `Acme/project-${i}` }));
  const recorded = replay(answers);
  const started: string[] = [];
  const aborted: string[] = [];
  const progress: number[] = [];
  await assert.rejects(scanOrganization('github.com/Acme', { fetch: async (url, init) => {
    if (!url.startsWith(`${API}/repos/`)) return recorded(url, init);
    started.push(url);
    if (url.endsWith('project-0')) return new Response(JSON.stringify({ message: 'API rate limit exceeded' }), { status: 403 });
    return new Promise<Response>((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => { aborted.push(url); reject(new Error('aborted')); }, { once: true });
    });
  } }, (event) => { progress.push(event.completed); }), /GitHub rate limit reached/);
  assert.equal(started.length, 4);
  assert.equal(aborted.length, 3);
  assert.deepEqual(progress, [0]);
});

test('organization skill reads are parallel but bounded even with many files', { timeout: 5000 }, async (t) => {
  const answers = organization();
  answers[`${API}/orgs/Acme/repos?type=all&per_page=100&page=1`].body = [{ full_name: 'Acme/alpha' }];
  const paths = Array.from({ length: 20 }, (_, i) => `.agents/skills/skill-${i}/SKILL.md`);
  answers[`${API}/repos/Acme/alpha/git/trees/abc1234?recursive=1`].body = {
    truncated: false, tree: paths.map((path) => ({ path, type: 'blob', mode: '100644' })),
  };
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let reads = 0;
  const recorded = replay(answers);
  const pending = scanOrganization('github.com/Acme', { fetch: async (url, init) => {
    if (!url.startsWith('https://raw.')) return recorded(url, init);
    reads++;
    await gate;
    return new Response(content);
  } });
  t.after(async () => { release(); await pending.catch(() => {}); });
  await new Promise(setImmediate);
  assert.equal(reads, 4);
  release();
  const result = await pending;
  assert.equal(reads, 20);
  assert.equal(result.projects[0].skills.length, 1);
  assert.equal(result.projects[0].skills[0].copies.length, 19);
});

test('authenticated truncated trees fall back to paginated code search', async () => {
  const answers = organization();
  answers[`${API}/orgs/Acme/repos?type=all&per_page=100&page=1`].body = [{ full_name: 'Acme/alpha' }];
  answers[`${API}/repos/Acme/alpha/git/trees/abc1234?recursive=1`].body = { truncated: true, tree: [] };
  const path = '.agents/skills/commits/SKILL.md';
  answers[`${API}/search/code?q=filename:SKILL.md+repo:Acme/alpha&per_page=100&page=1`] = {
    status: 200, body: { total_count: 101, items: Array.from({ length: 100 }, () => ({ path })) },
  };
  answers[`${API}/search/code?q=filename:SKILL.md+repo:Acme/alpha&per_page=100&page=2`] = {
    status: 200, body: { total_count: 101, items: [{ path: '.claude/skills/commits/SKILL.md' }] },
  };
  const urls: string[] = [];
  const recorded = replay(answers);
  const result = await scanOrganization('github.com/Acme', { token: 'test', fetch: async (url, init) => {
    assert.equal(init?.headers?.Authorization, 'Bearer test');
    urls.push(url);
    return recorded(url, init);
  } });
  assert.ok(urls.includes(`${API}/repos/Acme/alpha/git/trees/abc1234?recursive=1`));
  assert.ok(urls.some((url) => url.includes('search/code') && url.endsWith('page=2')));
  assert.equal(result.projects[0].skills.length, 1);
  assert.equal(result.projects[0].skills[0].copies.length, 1);
  assert.deepEqual(result.projects[0].warnings, []);
});
