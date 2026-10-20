/** A skill found in a repository: its SKILL.md and its name. */
export type SkillFile = { path: string; name: string };

/** Where agents keep a repository's own skills. */
export const SKILL_ROOTS = ['.agents/skills', '.claude/skills', '.github/skills', 'agent/skills'];

/** The folders agents read skills from; a skill elsewhere is shown as outside them. */
export const AGENT_FOLDERS = ['.agents', '.claude'];

/**
 * Every file named exactly SKILL.md, named after its directory (a SKILL.md at the
 * root after the repository). Nothing is ignored; identical copies are grouped by the scan.
 */
export function findSkills(paths: string[], repositoryName: string): SkillFile[] {
  return paths
    .filter((path) => path.split('/').at(-1) === 'SKILL.md')
    .sort()
    .map((path) => ({ path, name: path.split('/').at(-2) ?? repositoryName }));
}

/** Whether the path is under `.agents/` or `.claude/` at the repository root. */
export function isInsideAgentFolders(path: string): boolean {
  return AGENT_FOLDERS.includes(path.split('/')[0]);
}
