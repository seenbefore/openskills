export interface Skill {
  name: string;
  description: string;
  location: 'project' | 'global';
  path: string;
}

export interface SkillLocation {
  path: string;
  baseDir: string;
  source: string;
}

export interface InstallOptions {
  global?: boolean;
  universal?: boolean;
  yes?: boolean;
}

export interface SkillMetadata {
  name: string;
  description: string;
  context?: string;
}

export interface Repository {
  name: string;
  url: string;
  addedAt: string;
}

export interface RepositoriesConfig {
  repositories: Repository[];
}
