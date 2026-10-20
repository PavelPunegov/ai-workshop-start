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
