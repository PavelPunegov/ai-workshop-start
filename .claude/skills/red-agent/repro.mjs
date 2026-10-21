#!/usr/bin/env node
// Replays the steps of one bug in a real browser and saves the evidence: a video, a final
// screenshot, and the console errors, failed requests and HTTP statuses seen on the way.
// Playwright comes from PLAYWRIGHT_DIR, so the project gets no new dependency. Usage is in ./SKILL.md.
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const { values: options } = parseArgs({
  options: {
    steps: { type: 'string' },
    url: { type: 'string' },
    out: { type: 'string', default: join(ROOT, 'recordings', 'red-agent', stamp()) },
    width: { type: 'string', default: '1280' },
    height: { type: 'string', default: '800' },
    'color-scheme': { type: 'string', default: 'light' },
    'no-js': { type: 'boolean', default: false },
    headed: { type: 'boolean', default: false },
  },
});
if (!options.steps) throw new Error('Pass --steps <file.json>; see SKILL.md');

const steps = JSON.parse(await readFile(options.steps, 'utf8'));
const size = { width: Number(options.width), height: Number(options.height) };
const playwright = loadPlaywright();
await mkdir(options.out, { recursive: true });
const server = options.url ? undefined : await startApp();
const base = options.url ?? server.url;
const videos = await mkdtemp(join(tmpdir(), 'red-agent-video-'));
const browser = await playwright.chromium.launch({ headless: !options.headed });
const context = await browser.newContext({
  viewport: size,
  recordVideo: { dir: videos, size },
  colorScheme: options['color-scheme'],
  javaScriptEnabled: !options['no-js'],
});
const page = await context.newPage();
const log = watch(page);
let failure;
try {
  for (const step of steps) await run(page, step);
} catch (error) {
  failure = error.message;
} finally {
  await page.screenshot({ path: join(options.out, 'final.png'), fullPage: true }).catch(() => {});
  await context.close();
  await page.video().saveAs(join(options.out, 'video.webm')).catch(() => {});
  await browser.close();
  server?.stop();
  await rm(videos, { recursive: true, force: true });
}
const report = { base, failure, ...log, out: options.out };
await writeFile(join(options.out, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

/** One step: an object with a single action key, for example `{ "click": "text=Scan" }`. */
async function run(page, step) {
  const [action, arg] = Object.entries(step)[0];
  switch (action) {
    case 'goto': return page.goto(new URL(arg, base).href);
    case 'fill': return page.locator(arg[0]).fill(arg[1]);
    case 'type': return page.locator(arg[0]).pressSequentially(arg[1], { delay: 40 });
    case 'click': return page.locator(arg).first().click();
    case 'press': return page.keyboard.press(arg);
    case 'back': return page.goBack();
    case 'forward': return page.goForward();
    case 'reload': return page.reload();
    case 'offline': return context.setOffline(arg);
    case 'viewport': return page.setViewportSize({ width: arg[0], height: arg[1] });
    case 'colorScheme': return page.emulateMedia({ colorScheme: arg });
    case 'zoom': return page.evaluate((z) => { document.body.style.zoom = String(z); }, arg);
    case 'waitFor': return page.locator(arg).first().waitFor({ timeout: 600_000 });
    case 'wait': return page.waitForTimeout(arg);
    case 'screenshot': return page.screenshot({ path: join(options.out, `${arg}.png`), fullPage: true });
    default: throw new Error(`Unknown step: ${JSON.stringify(step)}`);
  }
}

/** Collects what a user would not see but a developer needs: errors and HTTP statuses. */
function watch(page) {
  const log = { consoleErrors: [], pageErrors: [], failedRequests: [], responses: [] };
  page.on('console', (m) => { if (m.type() === 'error') log.consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => log.pageErrors.push(e.message));
  page.on('requestfailed', (r) => log.failedRequests.push(`${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => { if (r.request().resourceType() === 'document') log.responses.push(`${r.status()} ${r.url()}`); });
  return log;
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

function stamp() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}
