// The skill-atlas commands. The same code serves the Node CLI and the browser
// terminal: everything that differs between them comes in through the context.
import { AtlasError } from './core/errors.ts';
import { skillLink, type Repository, type Skill } from './core/model.ts';
import { scan, type Source } from './core/scan.ts';
import { parseGitHubOrganizationUrl } from './core/github.ts';
import type { OrganizationResult, Progress } from './core/organization.ts';
import { AGENT_FOLDER_NAMES, countSkills, firstSentence, isOutside, organizationSummary } from './present.ts';

export type Context = {
  /** Opens what the user asked to scan. */
  open(input: string): Promise<Source>;
  organization?: (input: string, progress: Progress) => Promise<OrganizationResult>;
  print(text: string): void;
  /** Errors and warnings. */
  error(text: string): void;
};

const usage = `Usage: skill-atlas <command>

  scan <GitHub URL | directory>   find every SKILL.md in a repository or organization
  help                            show this help`;

/** Runs one command; returns its exit code. */
export async function run(args: string[], context: Context): Promise<number> {
  const [command = 'help', ...rest] = args;
  try {
    if (command === 'scan') await scanCommand(rest, context);
    else if (command === 'help') context.print(usage);
    else throw new AtlasError(`Unknown command: ${command}\n\n${usage}`);
    return 0;
  } catch (error) {
    if (!(error instanceof AtlasError)) throw error;
    context.error(error.message);
    return 1;
  }
}

async function scanCommand(args: string[], context: Context) {
  if (args.length !== 1) throw new AtlasError('Usage: skill-atlas scan <GitHub URL | directory>');
  if (parseGitHubOrganizationUrl(args[0]) && context.organization) {
    const result = await context.organization(args[0], ({ organization, completed, total }) => {
      context.error(`Scanning ${organization}: ${completed}/${total} projects`);
    });
    context.print(organizationSummary(result));
    for (const project of result.projects) {
      printRepository(project.repository, project.skills, context);
      for (const warning of project.warnings) context.error(`warning: ${project.repository.id}: ${warning}`);
    }
    return;
  }
  const result = await scan(await context.open(args[0]));
  printRepository(result.repository, result.skills, context);
  for (const warning of result.warnings) context.error(`warning: ${warning}`);
}

/**
 * `<owner>/<repo> · N skills`, then each skill's name, first sentence and link, its copies,
 * and whether it is outside .agents and .claude.
 */
function printRepository(repository: Repository, skills: Skill[], { print }: Context) {
  print(`${repository.id} · ${countSkills(skills.length)}`);
  for (const skill of skills) {
    print(skill.description ? `${skill.name} — ${firstSentence(skill.description)}` : skill.name);
    print(`  ${skillLink(repository, skill)}`);
    if (skill.copies.length > 0) print(`  also in ${skill.copies.join(', ')}`);
    if (isOutside(skill)) print(`  outside ${AGENT_FOLDER_NAMES}`);
  }
}
