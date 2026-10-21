import { openGitHub, openOrganization, type GitHubOptions, type Organization } from './github.ts';
import { scan, type ScanResult } from './scan.ts';
import { mapConcurrent } from './concurrent.ts';

export type OrganizationResult = { organization: Organization; projects: ScanResult[] };
export type ScanProgress = { organization: string; completed: number; total: number };
export type Progress = (progress: ScanProgress) => void;

/** Scan four projects at a time, keeping sorted results and counting completed projects. */
export async function scanOrganization(input: string, options: GitHubOptions, progress: Progress = () => {}): Promise<OrganizationResult> {
  const controller = new AbortController();
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  const github = { ...options, signal };
  try {
    const organization = await openOrganization(input, github);
    let completed = 0;
    const report = () => progress({ organization: organization.id, completed, total: organization.repositories.length });
    report();
    const projects = await mapConcurrent(organization.repositories, async (id) => {
      signal.throwIfAborted();
      const result = await scan(await openGitHub(`https://github.com/${id}`, github));
      signal.throwIfAborted();
      completed++;
      report();
      return result;
    });
    return { organization, projects };
  } finally {
    controller.abort(); // A failed project or disconnected client cancels the other workers.
  }
}
