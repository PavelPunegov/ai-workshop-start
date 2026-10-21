#!/usr/bin/env node
// The web view: the server and its entry. A form for a GitHub repository or organization link, and
// the same skills the CLI prints, rendered on the server by ./web/page.ts. Only GitHub links: a
// web page never reads local directories. Nothing is stored. `npm start`, or `PORT=8080 npm start`.
import { createServer, type Server, type ServerResponse } from 'node:http';
import { AtlasError } from './core/errors.ts';
import { openGitHub, parseGitHubUrl, parseGitHubOrganizationUrl, type GitHubOptions } from './core/github.ts';
import { scanOrganization } from './core/organization.ts';
import { scan, type Source } from './core/scan.ts';
import { renderPage, renderOutput, type Page } from './web/page.ts';
import { CLIENT } from './web/client.ts';

export type WebOptions = {
  /** Opens a GitHub repository link that parses; the live GitHub API by default. */
  open?: (input: string) => Promise<Source>;
  /** Where an unexpected failure is explained; the page itself only says that it happened. */
  log?: (error: unknown) => void;
  /** The same API credentials and fetch for repository and organization scans. */
  github?: GitHubOptions;
};

type Services = Pick<Required<WebOptions>, 'open' | 'log'> & Pick<WebOptions, 'github'>;

export type Answer = { status: number; page: Page };

/** The server page, its enhancement script and live organization scan events. */
export function createWebServer(options: WebOptions = {}): Server {
  const token = process.env.GITHUB_TOKEN || undefined;
  const github = options.github ?? { fetch, token };
  const services = {
    open: options.open ?? ((input: string) => openGitHub(input, github)),
    log: options.log ?? ((error: unknown) => console.error(error)),
    github,
  };
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/client.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      response.end(CLIENT);
      return;
    }
    if (request.method === 'GET' && url.pathname === '/events') {
      await streamOrganization(url, response, services);
      return;
    }
    const { status, page } = await respond(url, request.method, services);
    response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(renderPage(page));
  });
}

/** What the server answers for a request: routing, validation, the scan, and its status. */
export async function respond(url: URL, method: string | undefined, services: Services): Promise<Answer> {
  if (method !== 'GET' || url.pathname !== '/') return { status: 404, page: { error: `Not found: ${url.pathname}` } };
  const input = url.searchParams.get('repo');
  if (input === null) return { status: 200, page: {} };
  const organization = parseGitHubOrganizationUrl(input);
  if (!parseGitHubUrl(input) && !organization) {
    return { status: 400, page: { input, error: `Not a GitHub repository or organization URL: ${input}. Expected https://github.com/<owner>/<repo> or https://github.com/<organization>` } };
  }
  try {
    if (organization) {
      return { status: 200, page: { input, filter: url.searchParams.get('filter') ?? '', organization: await scanOrganization(input, services.github ?? { fetch, token: process.env.GITHUB_TOKEN || undefined }) } };
    }
    return { status: 200, page: { input, filter: url.searchParams.get('filter') ?? '', result: await scan(await services.open(input)) } };
  } catch (error) {
    const status = statusOf(error);
    if (status === 500) services.log(error);
    return { status, page: { input, error: status === 500 ? 'Something went wrong; the details are in the server log.' : messageOf(error) } };
  }
}

/** One request owns the entire scan; disconnecting cancels it and no results are retained. */
async function streamOrganization(url: URL, response: ServerResponse, services: Services & { github: GitHubOptions }): Promise<void> {
  const input = url.searchParams.get('org')?.trim() ?? '';
  if (!parseGitHubOrganizationUrl(input)) {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Expected a GitHub organization URL');
    return;
  }
  const controller = new AbortController();
  response.on('close', () => controller.abort());
  response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-store', 'X-Accel-Buffering': 'no' });
  response.flushHeaders();
  const send = (event: unknown) => response.write(`data: ${JSON.stringify(event)}\n\n`);
  try {
    const organization = await scanOrganization(input, { ...services.github, signal: controller.signal }, (progress) => {
      controller.signal.throwIfAborted();
      send({ type: 'progress', ...progress });
    });
    send({ type: 'result', html: renderOutput({ input, organization }) });
  } catch (error) {
    if (response.destroyed) return;
    if (statusOf(error) === 500) services.log(error);
    send({ type: 'error', html: renderOutput({ error: statusOf(error) === 500 ? 'Something went wrong; the details are in the server log.' : messageOf(error) }) });
  }
  response.end();
}

/** A failure explained to the user is GitHub's answer, 502; anything else is ours, 500. */
function statusOf(error: unknown): number {
  return error instanceof AtlasError ? 502 : 500;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (import.meta.main) {
  const port = Number(process.env.PORT) || 3000;
  createWebServer().listen(port, () => console.log(`Skill Atlas: http://localhost:${port}`));
}
