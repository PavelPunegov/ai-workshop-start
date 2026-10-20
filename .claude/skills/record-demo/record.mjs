#!/usr/bin/env node
// Records a demo of the Skill Atlas web view: starts the app, drives a real browser at a human
// pace with a visible cursor, and saves the video. Playwright comes from PLAYWRIGHT_DIR, so the
// project gets no new dependency. Usage is in ./SKILL.md.
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SIZE = { width: 1280, height: 800 };

const { values: options } = parseArgs({
  options: {
    url: { type: 'string' },
    repo: { type: 'string', default: 'https://github.com/JetBrains/kotlin' },
    filter: { type: 'string', default: 'gradle' },
    org: { type: 'string' },
    out: { type: 'string', default: join(ROOT, 'recordings', `skill-atlas-${stamp()}.webm`) },
    pace: { type: 'string', default: '1' },
    headed: { type: 'boolean', default: false },
  },
});
const pace = Number(options.pace) || 1;

/** The cursor and click ripple a viewer needs to follow the demo; headless video shows none. */
const CURSOR = `
window.addEventListener('DOMContentLoaded', () => {
  const dot = document.createElement('div');
  dot.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(255,80,80,.55);border:2px solid #fff;box-shadow:0 0 4px #000;left:var(--x,-50px);top:var(--y,-50px);transition:transform .15s';
  document.body.append(dot);
  const saved = JSON.parse(sessionStorage.getItem('demo-cursor') || 'null');
  if (saved) { dot.style.setProperty('--x', saved.x + 'px'); dot.style.setProperty('--y', saved.y + 'px'); }
  addEventListener('mousemove', (e) => {
    dot.style.setProperty('--x', e.clientX + 'px'); dot.style.setProperty('--y', e.clientY + 'px');
    sessionStorage.setItem('demo-cursor', JSON.stringify({ x: e.clientX, y: e.clientY }));
  }, true);
  addEventListener('mousedown', () => { dot.style.transform = 'scale(.6)'; }, true);
  addEventListener('mouseup', () => { dot.style.transform = ''; }, true);
});`;

const playwright = loadPlaywright();
await mkdir(dirname(options.out), { recursive: true });
const server = options.url ? undefined : await startApp();
const base = options.url ?? server.url;
const videos = await mkdtemp(join(tmpdir(), 'skill-atlas-video-'));
const browser = await playwright.chromium.launch({ headless: !options.headed });
const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: videos, size: SIZE } });
await context.addInitScript(CURSOR);
const page = await context.newPage();
let failure;
try {
  await runScenario(page, base);
} catch (error) {
  failure = error;
} finally {
  await context.close();
  await page.video().saveAs(options.out).catch(() => {});
  await browser.close();
  server?.stop();
  await rm(videos, { recursive: true, force: true });
}
if (failure) {
  console.error(`Demo failed: ${failure.message}\nPartial video: ${options.out}`);
  process.exit(1);
}
console.log(`Demo video: ${options.out}`);

/** The story: a repository scan, a filter, then optionally an organization with live progress. */
async function runScenario(page, base) {
  await page.goto(base);
  await pause(1500);
  await scan(page, options.repo);
  await page.locator('#filter, .error').first().waitFor({ timeout: 120_000 });
  await expectNoError(page);
  await pause(2000);
  await browse(page);
  if (options.filter) await filter(page, options.filter);
  if (options.org) await scanOrganization(page, options.org);
  await pause(2000);
}

async function scan(page, link) {
  await click(page, page.locator('#repo'));
  await page.locator('#repo').fill('');
  await page.keyboard.type(link, { delay: 60 / pace });
  await pause(600);
  await click(page, page.getByRole('button', { name: 'Scan' }));
}

async function filter(page, text) {
  await click(page, page.locator('#filter'));
  await page.keyboard.type(text, { delay: 120 / pace });
  await pause(600);
  await click(page, page.getByRole('button', { name: 'Filter' }));
  await page.locator('#filter-count').waitFor();
  await pause(2500);
  await browse(page);
}

async function scanOrganization(page, link) {
  await page.mouse.wheel(0, -10_000);
  await pause(800);
  await scan(page, link);
  await page.locator('#scan-progress').waitFor({ timeout: 10_000 }).catch(() => {});
  await page.locator('.organization, .error').first().waitFor({ timeout: 600_000 });
  await expectNoError(page);
  await pause(2000);
  const project = page.locator('details.project summary').filter({ hasNotText: '· 0 skills' }).first();
  if (await project.count()) {
    await click(page, project);
    await pause(1500);
    await browse(page);
  }
}

/** Scrolls down through the results and back, so the viewer sees them. */
async function browse(page) {
  const height = await page.evaluate(() => document.body.scrollHeight - innerHeight);
  const steps = Math.min(8, Math.ceil(height / 300));
  for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, 300); await pause(400); }
  await pause(800);
  if (steps) { await page.mouse.wheel(0, -steps * 300); await pause(1000); }
}

/** Glides the cursor to the element before clicking, as a person would. */
async function click(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error(`Not visible: ${locator}`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 25 });
  await pause(250);
  await page.mouse.down();
  await page.mouse.up();
}

async function expectNoError(page) {
  const error = page.locator('.error');
  if (await error.count()) throw new Error(`The app showed an error: ${(await error.first().textContent()).trim()}`);
}

/** Starts `npm start` on a free port and resolves once the server prints its URL. */
async function startApp() {
  const port = String(4000 + Math.floor(Math.random() * 1000));
  const child = spawn(process.execPath, ['src/web.ts'], { cwd: ROOT, env: { ...process.env, PORT: port }, stdio: ['ignore', 'pipe', 'inherit'] });
  const url = await new Promise((done, fail) => {
    child.stdout.on('data', (chunk) => { const found = /http:\/\/\S+/.exec(String(chunk)); if (found) done(found[0]); });
    child.on('exit', (code) => fail(new Error(`The app exited with code ${code} before it started`)));
  });
  return { url, stop: () => child.kill() };
}

function loadPlaywright() {
  const dir = process.env.PLAYWRIGHT_DIR;
  if (!dir) throw new Error('Set PLAYWRIGHT_DIR to the folder where playwright is installed; see SKILL.md');
  return createRequire(join(resolve(dir), 'noop.js'))('playwright');
}

function pause(ms) {
  return new Promise((done) => setTimeout(done, ms / pace));
}

function stamp() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

