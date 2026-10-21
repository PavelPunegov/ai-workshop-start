// How a list of skills is shown, the same in every client: the CLI and the web page.
import { AGENT_FOLDERS, isInsideAgentFolders } from './core/find.ts';
import type { Skill } from './core/model.ts';
import type { OrganizationResult } from './core/organization.ts';

export function organizationSummary({ organization, projects }: OrganizationResult): string {
  return `${organization.id} · ${countProjects(projects.length)} · ${countSkills(organizationSkillCount(projects))}`;
}

export function organizationSkillCount(projects: OrganizationResult['projects']): number {
  return projects.reduce((total, project) => total + project.skills.length, 0);
}

export function countProjects(count: number): string {
  return `${count} ${count === 1 ? 'project' : 'projects'}`;
}

/** `1 skill`, `4 skills`: a count of skills, not of copies. */
export function countSkills(count: number): string {
  return `${count} ${count === 1 ? 'skill' : 'skills'}`;
}

/** The description's first sentence, on one line. */
export function firstSentence(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return /^.*?[.!?](?=\s|$)/.exec(line)?.[0] ?? line;
}

/** Whether the skill is shown as outside .agents and .claude. */
export function isOutside(skill: Skill): boolean {
  // The main copy is in .agents or .claude whenever any copy is.
  return !isInsideAgentFolders(skill.path);
}

/** `.agents and .claude`. */
export const AGENT_FOLDER_NAMES = AGENT_FOLDERS.join(' and ');

/** The words of a skill's name, lowercase: `build-tools-bump` → `build`, `tools`, `bump`. */
export function nameWords(name: string): string[] {
  return [...new Set(name.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 1))];
}

/** Words shared by the names of at least two skills, with their skill counts, sorted by word. */
export function skillGroups(skills: Skill[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const skill of skills) for (const word of nameWords(skill.name)) counts.set(word, (counts.get(word) ?? 0) + 1);
  return new Map([...counts].filter(([, count]) => count > 1).sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** The skill's groups: the words of its name that are groups. */
export function skillTags(skill: Skill, groups: Map<string, number>): string[] {
  return nameWords(skill.name).filter((word) => groups.has(word)).sort();
}
