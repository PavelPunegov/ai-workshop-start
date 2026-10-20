import { findSkills, isInsideAgentFolders, type SkillFile } from './find.ts';
import { sortSkills, type Repository, type Skill } from './model.ts';
import { parseSkill } from './parse.ts';

/** A repository to scan: its files, and how to read them. */
export type Source = {
  repository: Repository;
  /** Every file path, relative to the repository root. */
  paths: string[];
  /** What listing the files had to leave out. */
  warnings: string[];
  /** The file's bytes, or undefined if it is not there. */
  read(path: string): Promise<Uint8Array | undefined>;
};

export type ScanResult = { repository: Repository; skills: Skill[]; warnings: string[] };

/** fetch → find → parse. Nothing is stored: the result is all there is. */
export async function scan(source: Source): Promise<ScanResult> {
  const files = findSkills(source.paths, source.repository.name);
  // The files are read at the same time: on GitHub, each one is a request.
  const results = await Promise.all(files.map((file) => readSkill(source, file)));
  const read = results.flatMap((result) => (result.read ? [result.read] : []));
  const parsed = groupCopies(read).map((group) => toSkill(source.repository, group));
  return {
    repository: source.repository,
    skills: sortSkills(parsed.map((result) => result.skill)),
    warnings: [
      ...source.warnings,
      ...results.flatMap((result) => (result.warning ? [result.warning] : [])),
      ...parsed.flatMap((result) => (result.warning ? [result.warning] : [])),
    ],
  };
}

type ReadSkill = { file: SkillFile; text: string };

async function readSkill(source: Source, file: SkillFile): Promise<{ read?: ReadSkill; warning?: string }> {
  const bytes = await source.read(file.path);
  if (!bytes) return { warning: `${file.path}: listed, but not found at the scanned commit; skipped` };
  return { read: { file, text: new TextDecoder().decode(bytes) } };
}

/**
 * Identical files are one skill: the first in `.agents` or `.claude`, else the first by path,
 * with the others as its copies.
 */
function groupCopies(skills: ReadSkill[]): ReadSkill[][] {
  const groups = new Map<string, ReadSkill[]>();
  for (const skill of skills) groups.set(skill.text, [...(groups.get(skill.text) ?? []), skill]);
  const rank = (skill: ReadSkill) => (isInsideAgentFolders(skill.file.path) ? 0 : 1);
  return [...groups.values()].map((group) =>
    group.sort((a, b) => rank(a) - rank(b) || (a.file.path < b.file.path ? -1 : 1)),
  );
}

function toSkill(repository: Repository, [main, ...copies]: ReadSkill[]): { skill: Skill; warning?: string } {
  const parsed = parseSkill(main.text);
  const skill: Skill = {
    id: `${repository.id}:${main.file.path}`,
    repository: repository.id,
    path: main.file.path,
    name: parsed.name ?? main.file.name,
    description: parsed.description,
    commit: repository.commit,
    copies: copies.map((copy) => copy.file.path),
  };
  return { skill, warning: parsed.warning && `${main.file.path}: ${parsed.warning}` };
}
