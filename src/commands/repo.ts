import chalk from 'chalk';
import { confirm } from '@inquirer/prompts';
import { ExitPromptError } from '@inquirer/core';
import {
  addRepository,
  removeRepository,
  getRepository,
  loadRepositories,
} from '../utils/config.js';

/**
 * Add a repository to the configuration
 */
export async function addRepo(name: string, url: string, options: { yes?: boolean }): Promise<void> {
  try {
    addRepository(name, url);
    console.log(chalk.green(`✓ Added repository: ${chalk.bold(name)}`));
    console.log(chalk.dim(`  URL: ${url}`));
  } catch (error) {
    const err = error as Error;
    console.error(chalk.red(`Error: ${err.message}`));
    process.exit(1);
  }
}

/**
 * Remove a repository from the configuration
 */
export async function removeRepo(name: string, options: { yes?: boolean }): Promise<void> {
  const repo = getRepository(name);
  
  if (!repo) {
    console.error(chalk.red(`Error: Repository '${name}' not found`));
    process.exit(1);
  }
  
  if (!options.yes) {
    try {
      const shouldRemove = await confirm({
        message: chalk.yellow(`Remove repository '${name}'?`),
        default: false,
      });
      
      if (!shouldRemove) {
        console.log(chalk.yellow('Cancelled'));
        return;
      }
    } catch (error) {
      if (error instanceof ExitPromptError) {
        console.log(chalk.yellow('\nCancelled by user'));
        process.exit(0);
      }
      throw error;
    }
  }
  
  const removed = removeRepository(name);
  
  if (removed) {
    console.log(chalk.green(`✓ Removed repository: ${chalk.bold(name)}`));
  } else {
    console.error(chalk.red(`Error: Repository '${name}' not found`));
    process.exit(1);
  }
}

/**
 * List all configured repositories
 */
export function listRepos(): void {
  const repositories = loadRepositories();
  
  if (repositories.length === 0) {
    console.log(chalk.dim('No repositories configured.'));
    console.log(chalk.dim('\nAdd a repository:'));
    console.log(chalk.cyan('  openskills repo add <name> <url>'));
    return;
  }
  
  console.log(chalk.bold('Configured Repositories:\n'));
  
  for (const repo of repositories) {
    console.log(`  ${chalk.bold(repo.name.padEnd(25))} ${chalk.dim(repo.url)}`);
    const date = new Date(repo.addedAt).toLocaleDateString();
    console.log(chalk.dim(`    Added: ${date}\n`));
  }
  
  console.log(chalk.dim(`Total: ${repositories.length} repository(ies)`));
}
