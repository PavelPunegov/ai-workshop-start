#!/usr/bin/env node
// The web view: the server and its entry. A page with a form for a GitHub repository link, and
// the same skills the CLI prints, rendered on the server by ./web/page.ts. Only GitHub links: a
// web page never reads local directories. Nothing is stored. `npm start`, or `PORT=8080 npm start`.
import { createServer, type Server } from 'node:http';
import { AtlasError } from './core/errors.ts';
import { openGitHub, parseGitHubUrl } from './core/github.ts';
import { scan, type Source } from './core/scan.ts';
import { renderPage, type Page } from './web/page.ts';

export type WebOptions = {
  /** Opens a GitHub repository link that parses; the live GitHub API by default. */
  open?: (input: string) => Promise<Source>;
  /** Where an unexpected failure is explained; the page itself only says that it happened. */
  log?: (error: unknown) => void;
};

export type Answer = { status: number; page: Page };

/** `GET /?repo=<GitHub URL>`: the page; anything else is not found. */
export function createWebServer(options: WebOptions = {}): Server {
  const token = process.env.GITHUB_TOKEN || undefined;
  const services = {
    open: options.open ?? ((input: string) => openGitHub(input, { fetch, token })),
    log: options.log ?? ((error: unknown) => console.error(error)),
  };
  return createServer(async (request, response) => {
    const { status, page } = await respond(new URL(request.url ?? '/', 'http://localhost'), request.method, services);
    response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(renderPage(page));
  });
}

/** What the server answers for a request: routing, validation, the scan, and its status. */
export async function respond(url: URL, method: string | undefined, services: Required<WebOptions>): Promise<Answer> {
  if (method !== 'GET' || url.pathname !== '/') return { status: 404, page: { error: `Not found: ${url.pathname}` } };
  const input = url.searchParams.get('repo')?.trim();
  if (!input) return { status: 200, page: {} };
  if (!parseGitHubUrl(input)) {
    return { status: 400, page: { input, error: `Not a GitHub repository URL: ${input}. Expected https://github.com/<owner>/<repo>` } };
  }
  try {
    return { status: 200, page: { input, result: await scan(await services.open(input)) } };
  } catch (error) {
    const status = statusOf(error);
    if (status === 500) services.log(error);
    return { status, page: { input, error: status === 500 ? 'Something went wrong; the details are in the server log.' : messageOf(error) } };
  }
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
