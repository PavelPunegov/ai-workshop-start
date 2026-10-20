#!/usr/bin/env node
// The Node client: a GitHub repository or organization through the API, or a local directory; stdout and
// stderr. Nothing is stored.
import { run } from './commands.ts';
import { openGitHub, parseGitHubUrl } from './core/github.ts';
import { openDirectory } from './local.ts';
import { scanOrganization } from './core/organization.ts';

const token = process.env.GITHUB_TOKEN || undefined;

process.exitCode = await run(process.argv.slice(2), {
  open: (input) => (parseGitHubUrl(input) ? openGitHub(input, { fetch, token }) : openDirectory(input)),
  organization: (input, progress) => scanOrganization(input, { fetch, token }, progress),
  print: (text) => console.log(text),
  error: (text) => console.error(text),
});
