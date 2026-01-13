import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { Repository, RepositoriesConfig } from '../types.js';

/**
 * Get the path to the configuration file
 */
export function getConfigPath(): string {
  const configDir = join(homedir(), '.openskills');
  return join(configDir, 'repositories.json');
}

/**
 * Ensure the configuration directory exists
 */
function ensureConfigDir(): void {
  const configDir = join(homedir(), '.openskills');
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
}

/**
 * Load repositories from configuration file
 */
export function loadRepositories(): Repository[] {
  const configPath = getConfigPath();
  
  if (!existsSync(configPath)) {
    return [];
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const config: RepositoriesConfig = JSON.parse(content);
    
    if (!config.repositories || !Array.isArray(config.repositories)) {
      return [];
    }
    
    return config.repositories;
  } catch (error) {
    // If file is corrupted, return empty array
    return [];
  }
}

/**
 * Save repositories to configuration file
 */
export function saveRepositories(repositories: Repository[]): void {
  ensureConfigDir();
  const configPath = getConfigPath();
  
  const config: RepositoriesConfig = {
    repositories: repositories.sort((a, b) => a.name.localeCompare(b.name)),
  };
  
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

/**
 * Add a repository to the configuration
 */
export function addRepository(name: string, url: string): void {
  const repositories = loadRepositories();
  
  // Check if repository with same name already exists
  if (repositories.some((repo) => repo.name === name)) {
    throw new Error(`Repository '${name}' already exists`);
  }
  
  // Validate URL format (basic check)
  if (!isValidGitUrl(url)) {
    throw new Error(`Invalid Git URL: ${url}`);
  }
  
  const newRepo: Repository = {
    name,
    url,
    addedAt: new Date().toISOString(),
  };
  
  repositories.push(newRepo);
  saveRepositories(repositories);
}

/**
 * Remove a repository from the configuration
 */
export function removeRepository(name: string): boolean {
  const repositories = loadRepositories();
  const initialLength = repositories.length;
  
  const filtered = repositories.filter((repo) => repo.name !== name);
  
  if (filtered.length === initialLength) {
    return false; // Repository not found
  }
  
  saveRepositories(filtered);
  return true;
}

/**
 * Get a repository by name
 */
export function getRepository(name: string): Repository | null {
  const repositories = loadRepositories();
  return repositories.find((repo) => repo.name === name) || null;
}

/**
 * Check if a string is a valid Git URL
 */
function isValidGitUrl(url: string): boolean {
  return (
    url.startsWith('git@') ||
    url.startsWith('git://') ||
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.endsWith('.git')
  );
}
