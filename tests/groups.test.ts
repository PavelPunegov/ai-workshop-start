// Skill groups (spec/web.md, Groups): words shared by skill names, shown as tags that link to the
// group. ./fixture's two code-style skills share `code` and `style`; its other skills share nothing.
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, test } from 'node:test';
import type { Skill } from '../src/core/model.ts';
import { replay } from '../src/core/replay.ts';
import { openDirectory } from '../src/local.ts';
import { nameWords, skillGroups, skillTags } from '../src/present.ts';
import { createWebServer } from '../src/web.ts';
import { FIXTURE } from './helpers.ts';

const REPO = 'https://github.com/JetBrains/fixture';

async function serve(options: Parameters<typeof createWebServer>[0]) {
  const server = createWebServer(options);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  after(() => server.close());
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return async (query: Record<string, string>) => {
    const response = await fetch(`${base}/?${new URLSearchParams(query)}`);
    return { status: response.status, html: await response.text() };
  };
}

const fixture = await serve({ open: () => openDirectory(FIXTURE) });

/** Each skill card's name and the words of its tags. */
function cards(html: string): [string, string[]][] {
  return [...html.matchAll(/<li class="skill">([\s\S]*?)<\/li>/g)].map(([, card]) => [
    card.match(/<h3 class="name">🧩 ([^<]*)<\/h3>/)![1],
    [...card.matchAll(/<a class="tag"[^>]*>#([^<]*)<\/a>/g)].map((match) => match[1]),
  ]);
}

/** The group row's tags: word, count, link and whether it is selected. */
function groups(html: string) {
  const nav = html.match(/<nav class="groups"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? '';
  return [...nav.matchAll(/<a class="tag" href="([^"]*)"[^>]*?( aria-current="true")?>#([^<]*)<\/a> <span class="tag-count">(\d+)<\/span>/g)]
    .map(([, href, current, word, count]) => ({ word, count: Number(count), href: href.replaceAll('&amp;', '&'), current: Boolean(current) }));
}

function skill(name: string): Skill {
  return { id: name, repository: 'r', path: `${name}/SKILL.md`, name, description: '', commit: '', copies: [] };
}

test('a group is a word shared by the names of at least two skills, ignoring case and separators', () => {
  assert.deepEqual(nameWords('Debug-Kotlin_tests 2'), ['debug', 'kotlin', 'tests']);
  assert.deepEqual(nameWords('test-test'), ['test']);
  const skills = ['run-tests', 'debug-tests', 'debug-gradle', 'release', 'Tests.flaky'].map(skill);
  const found = skillGroups(skills);
  assert.deepEqual([...found], [['debug', 2], ['tests', 3]]);
  assert.deepEqual(skillTags(skills[1], found), ['debug', 'tests']);
  assert.deepEqual(skillTags(skills[3], found), []);
});

test('the page lists every group with its skill count, and each card shows its groups as tags', async () => {
  const page = await fixture({ repo: REPO });
  assert.equal(page.status, 200);
  assert.deepEqual(groups(page.html).map(({ word, count, current }) => [word, count, current]), [['code', 2, false], ['style', 2, false]]);
  assert.match(page.html, /<nav class="groups" aria-label="Skill groups">/);
  assert.deepEqual(cards(page.html), [
    ['code-style', ['code', 'style']],
    ['code-style', ['code', 'style']],
    ['commits', []],
    ['release-checklist', []],
  ]);
  // Tags sit with the description, before the path.
  const card = page.html.match(/<li class="skill">([\s\S]*?)<\/li>/)![1];
  assert.ok(card.indexOf('class="description"') < card.indexOf('class="tags"'));
  assert.ok(card.indexOf('class="tags"') < card.indexOf('class="path"'));
});

test('clicking a tag shows its group, keeps warnings and totals, and the selected tag links back to all skills', async () => {
  const { html } = await fixture({ repo: REPO });
  const code = groups(html).find((group) => group.word === 'code')!;
  assert.equal(code.href, `/?${new URLSearchParams({ repo: REPO, tag: 'code' })}`);
  const selected = await fixture(Object.fromEntries(new URL(code.href, 'http://x').searchParams));
  assert.deepEqual(cards(selected.html).map(([name]) => name), ['code-style', 'code-style']);
  assert.match(selected.html, /Showing 2 of 4 skills/);
  assert.match(selected.html, /📦 <a[^>]*>fixture<\/a> · <span class="count">4 skills/);
  assert.match(selected.html, /malformed front matter/);
  const current = groups(selected.html).find((group) => group.word === 'code')!;
  assert.equal(current.current, true);
  assert.equal(current.href, `/?${new URLSearchParams({ repo: REPO })}`);
  assert.equal(groups(selected.html).find((group) => group.word === 'style')!.current, false);
});

test('a tag combines with the filter text, which keeps the tag; Clear filter drops both', async () => {
  const page = await fixture({ repo: REPO, tag: 'Style ', filter: 'plugin' });
  assert.deepEqual(cards(page.html).map(([name]) => name), ['code-style']);
  assert.match(page.html, /Showing 1 of 4 skills/);
  assert.match(page.html, /<input type="hidden" name="tag" value="style">/);
  assert.match(page.html, /href="\/\?repo=https%3A%2F%2Fgithub.com%2FJetBrains%2Ffixture">Clear filter<\/a>/);
  const untagged = await fixture({ repo: REPO, filter: 'plugin' });
  assert.doesNotMatch(untagged.html, /name="tag"/);
});

test('a tag matches whole name words only; an unknown tag shows no matches', async () => {
  const partial = await fixture({ repo: REPO, tag: 'commit' });
  assert.deepEqual(cards(partial.html), []);
  assert.match(partial.html, /No skills match this filter\./);
  const words = await fixture({ repo: REPO, tag: 'checklist' });
  assert.deepEqual(cards(words.html).map(([name]) => name), ['release-checklist']);
});

test('a tag is escaped as text', async () => {
  const page = await fixture({ repo: REPO, tag: '"><script>alert(1)</script>' });
  assert.equal(page.status, 200);
  assert.doesNotMatch(page.html, /<script>alert/);
  assert.match(page.html, /name="tag" value="&quot;&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;"/);
});

test('no shared words → no group row and no tags', async () => {
  const single = await serve({ open: async () => ({ ...(await openDirectory(FIXTURE)), paths: ['.claude/skills/commits/SKILL.md'] }) });
  const { html } = await single({ repo: REPO });
  assert.doesNotMatch(html, /class="groups"|class="tags"|class="tag"/);
});

test('organization groups span its projects, and a tag filters every project', async () => {
  const API = 'https://api.github.com';
  const answers: Parameters<typeof replay>[0] = {
    [`${API}/orgs/Acme`]: { status: 200, body: { login: 'Acme' } },
    [`${API}/orgs/Acme/repos?type=all&per_page=100&page=1`]: { status: 200, body: [{ full_name: 'Acme/alpha' }, { full_name: 'Acme/beta' }] },
  };
  const names: Record<string, string[]> = { alpha: ['debug-tests', 'release'], beta: ['debug-gradle'] };
  for (const [name, skills] of Object.entries(names)) {
    const id = `Acme/${name}`;
    answers[`${API}/repos/${id}`] = { status: 200, body: { full_name: id, default_branch: 'main' } };
    answers[`${API}/repos/${id}/commits/main`] = { status: 200, body: { sha: 'abc1234' } };
    const paths = skills.map((skill) => `.claude/skills/${skill}/SKILL.md`);
    answers[`${API}/repos/${id}/git/trees/abc1234?recursive=1`] = {
      status: 200, body: { truncated: false, tree: paths.map((path) => ({ path, type: 'blob', mode: '100644' })) },
    };
    for (const skill of skills) {
      answers[`https://raw.githubusercontent.com/${id}/abc1234/.claude/skills/${skill}/SKILL.md`] = { status: 200, body: `---\nname: ${skill}\n---\n` };
    }
  }
  const organization = await serve({ github: { fetch: replay(answers) } });
  const page = await organization({ repo: 'https://github.com/Acme' });
  assert.deepEqual(groups(page.html).map(({ word, count }) => [word, count]), [['debug', 2]]);
  assert.deepEqual(cards(page.html), [['debug-tests', ['debug']], ['release', []], ['debug-gradle', ['debug']]]);
  const tagged = await organization({ repo: 'https://github.com/Acme', tag: 'debug' });
  assert.deepEqual(cards(tagged.html).map(([name]) => name), ['debug-tests', 'debug-gradle']);
  assert.match(tagged.html, /Showing 2 of 3 skills/);
  assert.equal((tagged.html.match(/<details class="project">/g) ?? []).length, 2);
});
