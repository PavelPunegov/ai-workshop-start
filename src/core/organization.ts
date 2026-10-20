import { openGitHub, openOrganization, type GitHubOptions, type Organization } from './github.ts';
import { scan, type ScanResult } from './scan.ts';

export type OrganizationResult = { organization: Organization; projects: ScanResult[] };
export type ScanProgress = { organization: string; completed: number; total: number };
export type Progress = (progress: ScanProgress) => void;

/** Scan projects in order, bounding GitHub traffic and reporting only completed projects. */
export async function scanOrganization(input: string, options: GitHubOptions, progress: Progress = () => {}): Promise<OrganizationResult> {
  const organization = await openOrganization(input, options);
  const projects: ScanResult[] = [];
  const report = () => progress({ organization: organization.id, completed: projects.length, total: organization.repositories.length });
  report();
  for (const id of organization.repositories) {
    projects.push(await scan(await openGitHub(`https://github.com/${id}`, options)));
    report();
  }
  return { organization, projects };
}
