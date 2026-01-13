import { existsSync, mkdirSync, rmSync, readdirSync, copyFileSync, statSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';
import { select, confirm, checkbox } from '@inquirer/prompts';
import { ExitPromptError } from '@inquirer/core';
import { findAllSkills, findSkill } from '../utils/skills.js';
import { loadRepositories, getRepository } from '../utils/config.js';
import type { UploadOptions } from '../types.js';

// Constants
const MAX_RETRY_ATTEMPTS = 10;
const FILE_SYSTEM_WAIT_MS = 300;
const GIT_SUBMODULE_MODE = '160000'; // Git submodule mode
const DEFAULT_BRANCHES = ['main', 'master'] as const;

/**
 * Type guard for execSync error with stderr/stdout
 */
function isExecError(error: unknown): error is { stderr?: Buffer; stdout?: Buffer; code?: number; message?: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    ('stderr' in error || 'stdout' in error || 'code' in error || 'message' in error)
  );
}

/**
 * Validate branch name to prevent command injection
 * Git branch names can contain: letters, numbers, -, _, /, .
 * @param branch Branch name to validate
 * @returns true if valid, false otherwise
 */
function isValidBranchName(branch: string): boolean {
  // Git branch names can contain: letters, numbers, -, _, /, .
  // But we'll be more restrictive for safety
  return /^[a-zA-Z0-9._/-]+$/.test(branch) && branch.length > 0 && branch.length <= 255;
}

/**
 * Validate skill name to prevent path injection
 * @param skillName Skill name to validate
 * @returns true if valid, false otherwise
 */
function isValidSkillName(skillName: string): boolean {
  // Skill names should be safe for file paths and Git commands
  // Allow: letters, numbers, -, _, .
  // Disallow: /, \, :, *, ?, ", <, >, |, and other special chars
  return /^[a-zA-Z0-9._-]+$/.test(skillName) && skillName.length > 0 && skillName.length <= 255;
}

/**
 * Validate repository name to prevent path injection
 * @param repoName Repository name to validate
 * @returns true if valid, false otherwise
 */
function isValidRepoName(repoName: string): boolean {
  // Repository names should be safe for file paths
  // Disallow: path traversal (../, ..\\), special chars
  if (repoName.includes('..') || repoName.includes('/') || repoName.includes('\\')) {
    return false;
  }
  // Allow: letters, numbers, -, _, .
  return /^[a-zA-Z0-9._-]+$/.test(repoName) && repoName.length > 0 && repoName.length <= 255;
}

/**
 * Validate Git URL to prevent command injection
 * @param url Git URL to validate
 * @returns true if valid, false otherwise
 */
function isValidGitUrl(url: string): boolean {
  // Basic validation: must start with valid protocol or be SSH format
  const validProtocols = ['http://', 'https://', 'git://', 'git@'];
  const hasValidProtocol = validProtocols.some(protocol => url.startsWith(protocol));
  
  if (!hasValidProtocol) {
    return false;
  }
  
  // Check for command injection patterns
  const dangerousChars = ['`', '$', ';', '&', '|', '<', '>', '\n', '\r'];
  if (dangerousChars.some(char => url.includes(char))) {
    return false;
  }
  
  return url.length > 0 && url.length <= 2000; // Reasonable URL length limit
}

/**
 * Escape path for use in Git commands (double quotes)
 * @param path Path to escape
 * @returns Escaped path
 */
function escapeGitPath(path: string): string {
  // Escape double quotes, backslashes, and other special characters
  // for use in double-quoted strings (works on both Unix and Windows)
  return path
    .replace(/\\/g, '\\\\')  // Escape backslashes first
    .replace(/"/g, '\\"')    // Escape double quotes
    .replace(/\n/g, '')      // Remove newlines
    .replace(/\r/g, '')       // Remove carriage returns
    .replace(/\t/g, ' ')      // Replace tabs with spaces
    .replace(/\0/g, '');      // Remove null bytes
}

/**
 * Sanitize branch name for Git commands
 * @param branch Branch name
 * @returns Sanitized branch name or 'main' as fallback
 */
function sanitizeBranchName(branch: string): string {
  if (isValidBranchName(branch)) {
    return branch;
  }
  console.warn(chalk.yellow(`Warning: Invalid branch name '${branch}', using 'main' as fallback`));
  return 'main';
}

/**
 * Get platform-specific command to delete a directory
 * @param path Path to delete
 * @returns Command string for the current platform
 */
function getDeleteCommand(path: string): string {
  const isWindows = process.platform === 'win32';
  if (isWindows) {
    // Windows: Use PowerShell or cmd
    return `Remove-Item -Recurse -Force "${path}"`;
  } else {
    // Unix-like: Use rm
    return `rm -rf "${path}"`;
  }
}

/**
 * Clean up submodule-related files and configuration
 * @param localRepoDir Local repository directory
 * @param skillName Skill name
 */
function cleanupSubmodule(localRepoDir: string, skillName: string): void {
  try {
    // 1. Remove from .gitmodules
    const gitmodulesPath = join(localRepoDir, '.gitmodules');
    if (existsSync(gitmodulesPath)) {
      let gitmodulesContent = readFileSync(gitmodulesPath, 'utf-8');
      const submoduleRegex = new RegExp(
        `\\[submodule\\s+"skills/${skillName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\][\\s\\S]*?(?=\\[submodule|$)`,
        'g'
      );
      gitmodulesContent = gitmodulesContent.replace(submoduleRegex, '').trim();
      
      if (gitmodulesContent) {
        writeFileSync(gitmodulesPath, gitmodulesContent + '\n', 'utf-8');
        // Stage the .gitmodules change
        execSync('git add .gitmodules', { cwd: localRepoDir, stdio: 'pipe' });
      } else {
        // If no submodules left, remove .gitmodules file
        rmSync(gitmodulesPath, { force: true });
        try {
          execSync('git rm .gitmodules', { cwd: localRepoDir, stdio: 'pipe' });
        } catch (error) {
          // Ignore if .gitmodules is not tracked - this is expected
          if (isExecError(error) && error.code !== 0) {
            // Log only if it's an unexpected error (not "file not found")
            const errorMsg = error.stderr?.toString() || '';
            if (!errorMsg.includes('did not match any files')) {
              console.log(chalk.dim(`Note: Could not remove .gitmodules from Git index: ${errorMsg.trim()}`));
            }
          }
        }
      }
    }
    
    // 2. Remove from .git/config (submodule configuration)
    try {
      const gitConfigPath = join(localRepoDir, '.git', 'config');
      if (existsSync(gitConfigPath)) {
        let configContent = readFileSync(gitConfigPath, 'utf-8');
        const configRegex = new RegExp(
          `\\[submodule\\s+"skills/${skillName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\][\\s\\S]*?(?=\\[|$)`,
          'g'
        );
        configContent = configContent.replace(configRegex, '').trim();
        writeFileSync(gitConfigPath, configContent + '\n', 'utf-8');
      }
    } catch (error) {
      // Ignore errors when cleaning up .git/config - non-critical
      if (isExecError(error) && error.code !== 0) {
        console.log(chalk.dim(`Note: Could not clean up .git/config: ${error.message || 'Unknown error'}`));
      }
    }
    
    // 3. Remove from .git/modules/ (submodule metadata)
    const gitModulesPath = join(localRepoDir, '.git', 'modules', 'skills', skillName);
    if (existsSync(gitModulesPath)) {
      rmSync(gitModulesPath, { recursive: true, force: true });
    }
    
    // 4. Remove from .git/modules/skills/ if empty
    const gitModulesSkillsPath = join(localRepoDir, '.git', 'modules', 'skills');
    if (existsSync(gitModulesSkillsPath)) {
      try {
        const entries = readdirSync(gitModulesSkillsPath);
        if (entries.length === 0) {
          rmSync(gitModulesSkillsPath, { recursive: true, force: true });
        }
      } catch (error) {
        // Ignore errors when checking/removing empty directories
        if (isExecError(error) && error.code !== 0) {
          console.log(chalk.dim(`Note: Could not check/remove empty .git/modules/skills directory: ${error.message || 'Unknown error'}`));
        }
      }
    }
  } catch (error) {
    // Log but don't fail on submodule cleanup errors - non-critical
    if (isExecError(error)) {
      console.log(chalk.yellow(`Warning: Some submodule cleanup operations failed: ${error.message || 'Unknown error'}`));
    }
  }
}

/**
 * Check if a path is a Git-related file or directory that should be skipped
 * @param name File or directory name
 * @returns true if should be skipped
 */
function isGitRelatedFile(name: string): boolean {
  return name === '.git' || name === '.gitignore' || name === '.gitattributes';
}

/**
 * Ensure .git directory is removed from a skill directory (with retries)
 * @param skillDir Skill directory path
 * @param skillName Skill name for error messages
 * @param context Context for error messages
 * @returns true if successfully removed or doesn't exist, false otherwise
 */
async function ensureGitDirectoryRemoved(
  skillDir: string,
  skillName: string,
  context: string = 'target'
): Promise<boolean> {
  const gitPath = join(skillDir, '.git');
  return await removeGitDirectory(gitPath, skillName, context);
}

/**
 * Remove .git directory with retries (for Windows file system)
 * @param gitPath Path to .git directory
 * @param skillName Skill name for error messages
 * @param context Context for error messages (e.g., "target" or "before git add")
 * @returns true if successfully removed, false otherwise
 */
async function removeGitDirectory(
  gitPath: string,
  skillName: string,
  context: string = 'target'
): Promise<boolean> {
  if (!existsSync(gitPath)) {
    return true;
  }

  console.log(chalk.yellow(`Warning: Found .git directory in ${context}, removing to prevent submodule issue...`));

  let removed = false;
  for (let i = 0; i < MAX_RETRY_ATTEMPTS; i++) {
    try {
      rmSync(gitPath, { recursive: true, force: true });
      await new Promise(resolve => setTimeout(resolve, FILE_SYSTEM_WAIT_MS));
      if (!existsSync(gitPath)) {
        removed = true;
        break;
      }
    } catch (error) {
      // Continue retrying
      await new Promise(resolve => setTimeout(resolve, FILE_SYSTEM_WAIT_MS));
    }
  }

  if (!removed && existsSync(gitPath)) {
    console.error(chalk.red(`\nError: .git directory still exists in ${context}`));
    console.error(chalk.red(`Path: ${gitPath}`));
    console.error(chalk.red('Git will treat this as a submodule, causing upload to fail.'));
    console.error(chalk.yellow('\nPlease manually delete the .git directory:'));
    console.error(chalk.cyan(`  ${getDeleteCommand(gitPath)}`));
    console.error(chalk.yellow('\nThen try uploading again.'));
    return false;
  }

  if (removed) {
    console.log(chalk.green(`✓ Removed .git directory`));
  }
  return removed;
}

/**
 * Get current Git branch name
 * @param repoDir Repository directory
 * @returns Branch name or 'main' as default
 */
function getCurrentBranch(repoDir: string): string {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: repoDir,
      encoding: 'utf-8',
    }).trim();
    return sanitizeBranchName(branch);
  } catch {
    return 'main'; // Default branch
  }
}

/**
 * Escape commit message for shell command
 * @param message Commit message
 * @returns Escaped message
 */
function escapeCommitMessage(message: string): string {
  // Escape special characters for shell command (works on both Unix and Windows)
  // Note: For better security, consider using git commit with -F flag to read from file
  return message
    .replace(/\\/g, '\\\\')  // Escape backslashes first
    .replace(/"/g, '\\"')    // Escape double quotes
    .replace(/\$/g, '\\$')   // Escape dollar signs
    .replace(/`/g, '\\`')    // Escape backticks
    .replace(/\n/g, ' ')     // Replace newlines with spaces
    .replace(/\r/g, '')      // Remove carriage returns
    .replace(/\0/g, '');      // Remove null bytes
}

/**
 * Upload a skill to a configured repository
 * The skill will be placed in skills/<skill-name>/ directory
 */
export async function uploadSkill(
  skillName: string | undefined,
  options: UploadOptions
): Promise<void> {
  // Step 1: Select or find the skill(s)
  let skillsToUpload: Array<{ name: string; baseDir: string }> = [];

  if (skillName) {
    const skillLocation = findSkill(skillName);
    if (!skillLocation) {
      console.error(chalk.red(`Error: Skill '${skillName}' not found`));
      process.exit(1);
    }
    skillsToUpload = [{
      name: skillName,
      baseDir: skillLocation.baseDir,
    }];
  } else {
    // Interactive selection - allow multiple skills
    const skills = findAllSkills();
    if (skills.length === 0) {
      console.error(chalk.red('Error: No skills installed'));
      console.error(chalk.dim('\nInstall skills first:'));
      console.error(chalk.cyan('  openskills install owner/repo'));
      process.exit(1);
    }

    try {
      const sorted = skills.sort((a, b) => {
        if (a.location !== b.location) {
          return a.location === 'project' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      const choices = sorted.map((s) => ({
        name: `${chalk.bold(s.name.padEnd(25))} ${s.location === 'project' ? chalk.blue('(project)') : chalk.dim('(global)')}`,
        value: s.name,
        description: s.description.slice(0, 70),
        checked: false,
      }));

      const selectedNames = await checkbox({
        message: 'Select skills to upload',
        choices,
        pageSize: 15,
      });

      if (selectedNames.length === 0) {
        console.log(chalk.yellow('No skills selected. Cancelled.'));
        return;
      }

      for (const name of selectedNames) {
        const skillLocation = findSkill(name);
        if (skillLocation) {
          skillsToUpload.push({
            name,
            baseDir: skillLocation.baseDir,
          });
        }
      }
    } catch (error) {
      if (error instanceof ExitPromptError) {
        console.log(chalk.yellow('\nCancelled by user'));
        process.exit(0);
      }
      throw error;
    }
  }

  // Step 2: Select repository
  const repositories = loadRepositories();
  if (repositories.length === 0) {
    console.error(chalk.red('Error: No repositories configured'));
    console.error(chalk.dim('\nAdd a repository first:'));
    console.error(chalk.cyan('  openskills repo add <name> <url>'));
    process.exit(1);
  }

  let selectedRepo: { name: string; url: string } | null = null;

  if (options.repo) {
    const repo = getRepository(options.repo);
    if (!repo) {
      console.error(chalk.red(`Error: Repository '${options.repo}' not found`));
      process.exit(1);
    }
    selectedRepo = repo;
  } else {
    // Interactive selection
    try {
      const choices = repositories.map((repo) => ({
        name: `${chalk.bold(repo.name.padEnd(25))} ${chalk.dim(repo.url)}`,
        value: repo.name,
      }));

      const selectedName = await select({
        message: 'Select repository to upload to',
        choices,
        pageSize: 15,
      });

      const repo = getRepository(selectedName);
      if (!repo) {
        console.error(chalk.red(`Error: Repository '${selectedName}' not found`));
        process.exit(1);
      }
      selectedRepo = repo;
    } catch (error) {
      if (error instanceof ExitPromptError) {
        console.log(chalk.yellow('\nCancelled by user'));
        process.exit(0);
      }
      throw error;
    }
  }

  // Step 3: Clone or update repository and upload skills
  await uploadToRepository(skillsToUpload, selectedRepo.url, selectedRepo.name, options);
}

/**
 * Upload skills to a repository
 * Repository structure: skills/<skill-name>/
 */
async function uploadToRepository(
  skills: Array<{ name: string; baseDir: string }>,
  repoUrl: string,
  repoName: string,
  options: UploadOptions
): Promise<void> {
  // Validate repository name to prevent path injection
  if (!isValidRepoName(repoName)) {
    console.error(chalk.red(`Error: Invalid repository name '${repoName}'. Repository names can only contain letters, numbers, dots, hyphens, and underscores, and cannot contain path traversal characters.`));
    process.exit(1);
  }
  
  // Validate Git URL to prevent command injection
  if (!isValidGitUrl(repoUrl)) {
    console.error(chalk.red(`Error: Invalid Git URL '${repoUrl}'. URL must start with http://, https://, git://, or git@, and cannot contain command injection characters.`));
    process.exit(1);
  }
  
  // Use a persistent local clone directory in ~/.openskills/repos/<repo-name>
  const reposDir = join(homedir(), '.openskills', 'repos');
  // Use basename to prevent path traversal even if validation fails
  const safeRepoName = repoName.split(/[/\\]/).pop() || repoName;
  const localRepoDir = join(reposDir, safeRepoName);

  // Clone repository if it doesn't exist locally
  if (!existsSync(localRepoDir)) {
    const spinner = ora('Cloning repository...').start();
    try {
      mkdirSync(reposDir, { recursive: true });
      execSync(`git clone "${repoUrl}" "${localRepoDir}"`, {
        stdio: 'pipe',
      });
      spinner.succeed('Repository cloned');
    } catch (error) {
      spinner.fail('Failed to clone repository');
      if (isExecError(error) && error.stderr) {
        console.error(chalk.dim(error.stderr.toString().trim()));
      }
      console.error(chalk.yellow('\nTip: Check your Git credentials (SSH keys or credential helper)'));
      process.exit(1);
    }
  } else {
    // Update existing repository
    const spinner = ora('Updating repository...').start();
    try {
      execSync('git fetch origin', { cwd: localRepoDir, stdio: 'pipe' });
      const currentBranch = getCurrentBranch(localRepoDir);
      
      // Try to pull from current branch, then main, then master
      let pullSuccess = false;
      for (const branch of [currentBranch, ...DEFAULT_BRANCHES]) {
        try {
          // Sanitize branch name to prevent command injection
          const safeBranch = sanitizeBranchName(branch);
          execSync(`git pull origin ${safeBranch}`, { cwd: localRepoDir, stdio: 'pipe' });
          pullSuccess = true;
          break;
        } catch {
          // Continue to next branch
        }
      }
      
      if (pullSuccess) {
        spinner.succeed('Repository updated');
      } else {
        // Ignore errors - might be first push or branch doesn't exist
        spinner.succeed('Repository ready');
      }
    } catch (error) {
      // Ignore errors - might be first push or branch doesn't exist
      spinner.succeed('Repository ready');
    }
  }

  // Ensure skills directory exists
  const skillsDir = join(localRepoDir, 'skills');
  mkdirSync(skillsDir, { recursive: true });

  // Copy each skill to skills/<skill-name>/
  for (const skill of skills) {
    // Validate skill name to prevent path injection
    if (!isValidSkillName(skill.name)) {
      console.error(chalk.red(`Error: Invalid skill name '${skill.name}'. Skill names can only contain letters, numbers, dots, hyphens, and underscores.`));
      process.exit(1);
    }
    
    const targetSkillDir = join(skillsDir, skill.name);
    
    // Check if skill already exists
    if (existsSync(targetSkillDir)) {
      if (!options.yes) {
        try {
          const shouldOverwrite = await confirm({
            message: chalk.yellow(`Skill '${skill.name}' already exists in repository. Overwrite?`),
            default: false,
          });

          if (!shouldOverwrite) {
            console.log(chalk.yellow(`Skipped: ${skill.name}`));
            continue;
          }
        } catch (error) {
          if (error instanceof ExitPromptError) {
            console.log(chalk.yellow('\nCancelled by user'));
            process.exit(0);
          }
          throw error;
        }
      }
    }

    const spinner = ora(`Copying ${skill.name}...`).start();
    try {
      // Check if it's a submodule (needed for later cleanup)
      let isSubmodule = false;
      let isRegisteredSubmodule = false;
      
      // Remove existing directory if it exists (both from filesystem and Git)
      if (existsSync(targetSkillDir)) {
        // Check if it's a submodule by checking for .git file or directory
        const existingGitPath = join(targetSkillDir, '.git');
        isSubmodule = existsSync(existingGitPath);
        
        // Check if it's registered as a submodule in Git
        try {
          // Check if it's mode 160000 (submodule)
          // Escape path to prevent command injection
          const skillPath = escapeGitPath(join('skills', skill.name));
          const lsOutput = execSync(`git ls-files --stage "${skillPath}"`, { 
            cwd: localRepoDir, 
            encoding: 'utf-8',
            stdio: 'pipe' 
          });
          isRegisteredSubmodule = lsOutput.includes(GIT_SUBMODULE_MODE);
        } catch (error) {
          // Not in Git index or not a submodule - this is expected
          // Only log if it's an unexpected error
          if (isExecError(error) && error.code !== 0) {
            const errorMsg = error.stderr?.toString() || '';
            if (!errorMsg.includes('did not match any files') && !errorMsg.includes('No such file')) {
              console.log(chalk.dim(`Note: Could not check submodule status: ${errorMsg.trim()}`));
            }
          }
        }
        
        // Remove from Git index first (if it exists)
        try {
          // Escape path to prevent command injection
          const skillPath = escapeGitPath(join('skills', skill.name));
          if (isSubmodule || isRegisteredSubmodule) {
            // If it's a submodule, use git rm without -r flag and --force
            execSync(`git rm --cached --force "${skillPath}"`, { 
              cwd: localRepoDir, 
              stdio: 'pipe' 
            });
          } else {
            // If it's a regular directory, use git rm -r
            execSync(`git rm -r --cached "${skillPath}"`, { 
              cwd: localRepoDir, 
              stdio: 'pipe' 
            });
          }
        } catch (error) {
          // Ignore if not in Git index - this is expected
          if (isExecError(error) && error.code !== 0) {
            const errorMsg = error.stderr?.toString() || '';
            if (!errorMsg.includes('did not match any files') && !errorMsg.includes('No such file')) {
              console.log(chalk.dim(`Note: Could not remove from Git index: ${errorMsg.trim()}`));
            }
          }
        }
        
        // Remove from filesystem (ensure .git is also removed)
        rmSync(targetSkillDir, { recursive: true, force: true });
        
        // Double-check: if .git still exists, remove it explicitly
        if (existsSync(existingGitPath)) {
          rmSync(existingGitPath, { recursive: true, force: true });
        }
        
        // If it was a submodule, clean up all submodule-related files
        if (isSubmodule || isRegisteredSubmodule) {
          cleanupSubmodule(localRepoDir, skill.name);
        }
      }
      
      // If we removed a submodule, commit the removal first before adding new files
      // This ensures Git doesn't treat the new files as submodule changes
      if (isSubmodule || isRegisteredSubmodule) {
        try {
          // Check if there are staged changes (submodule removal)
          const statusOutput = execSync('git status --porcelain', { 
            cwd: localRepoDir, 
            encoding: 'utf-8',
            stdio: 'pipe' 
          });
          
          if (statusOutput.trim()) {
            // Commit the submodule removal first
            execSync('git commit -m "Remove submodule before uploading as regular files"', { 
              cwd: localRepoDir, 
              stdio: 'pipe' 
            });
          }
        } catch (error) {
          // Ignore errors - might not be necessary to commit
          if (isExecError(error) && error.code !== 0) {
            console.log(chalk.dim(`Note: Could not commit submodule removal: ${error.message || 'Unknown error'}`));
          }
        }
      }
      
      // Ensure target directory exists
      mkdirSync(targetSkillDir, { recursive: true });
      
      // Recursively copy all files and directories
      // Skip .git directory and other Git-related files to avoid submodule issues
      function copyRecursive(src: string, dest: string): void {
        const entries = readdirSync(src, { withFileTypes: true });
        
        for (const entry of entries) {
          // CRITICAL: Skip .git directory and other Git-related files
          // This must be checked at every level to prevent copying .git
          if (isGitRelatedFile(entry.name)) {
            continue;
          }
          
          const srcPath = join(src, entry.name);
          const destPath = join(dest, entry.name);
          
          if (entry.isDirectory()) {
            // Double-check: don't copy .git directories even if they somehow got through
            if (isGitRelatedFile(entry.name)) {
              continue;
            }
            mkdirSync(destPath, { recursive: true });
            copyRecursive(srcPath, destPath);
          } else if (entry.isFile()) {
            copyFileSync(srcPath, destPath);
          } else if (entry.isSymbolicLink()) {
            // For symlinks, copy the actual file content (dereference)
            // Skip if it points to Git-related files
            if (isGitRelatedFile(entry.name)) {
              continue;
            }
            try {
              const stats = statSync(srcPath, { throwIfNoEntry: false });
              if (!stats) {
                // Broken symlink, skip
                continue;
              }
              if (stats.isFile()) {
                copyFileSync(srcPath, destPath);
              } else if (stats.isDirectory()) {
                // Recursively copy directory content (dereference symlinks)
                mkdirSync(destPath, { recursive: true });
                copyRecursive(srcPath, destPath);
              }
            } catch {
              // Skip broken or inaccessible symlinks
              continue;
            }
          }
        }
      }
      
      copyRecursive(skill.baseDir, targetSkillDir);
      
      // CRITICAL: ALWAYS check and remove .git if it exists (even if copyRecursive should have skipped it)
      // This is essential to prevent Git from treating it as a submodule
      const removed = await ensureGitDirectoryRemoved(targetSkillDir, skill.name, 'target');
      if (!removed) {
        spinner.fail(`CRITICAL: Failed to remove .git directory from ${skill.name}`);
        process.exit(1);
      }
      
      // Verify that files were copied (check for SKILL.md at minimum)
      const skillMdPath = join(targetSkillDir, 'SKILL.md');
      if (!existsSync(skillMdPath)) {
        spinner.fail(`Failed to copy ${skill.name}: SKILL.md not found`);
        console.error(chalk.red(`Error: SKILL.md was not copied to ${targetSkillDir}`));
        process.exit(1);
      }
      
      spinner.succeed(`Copied ${skill.name}`);
    } catch (error) {
      spinner.fail(`Failed to copy ${skill.name}`);
      const errorMessage = isExecError(error) ? (error.message || 'Unknown error') : 'Unknown error';
      console.error(chalk.red(`Error: ${errorMessage}`));
      process.exit(1);
    }
  }

  // Commit changes
  const commitMessage = options.message || 
    (skills.length === 1 
      ? `Upload skill: ${skills[0].name}` 
      : `Upload ${skills.length} skills: ${skills.map(s => s.name).join(', ')}`);

  // CRITICAL: Before adding to Git, ensure no .git directories exist in skill directories
  // This prevents Git from treating them as submodules
  for (const skill of skills) {
    const skillDir = join(localRepoDir, 'skills', skill.name);
    const removed = await ensureGitDirectoryRemoved(skillDir, skill.name, `${skill.name} before adding to Git`);
    if (!removed) {
      process.exit(1);
    }
  }

  // Add all changes to Git
  const addSpinner = ora('Adding files to Git...').start();
  try {
    // Force add all files in skills directory (including those that might be ignored)
    // Use -f to force add files that might be in .gitignore
    for (const skill of skills) {
      const skillPath = join('skills', skill.name);
      
      // CRITICAL: Double-check .git doesn't exist before adding
      const skillDir = join(localRepoDir, skillPath);
      const removed = await ensureGitDirectoryRemoved(skillDir, skill.name, 'before git add');
      if (!removed) {
        console.error(chalk.red(`CRITICAL: Failed to remove .git before git add`));
        process.exit(1);
      }
      
      try {
        // Escape path to prevent command injection
        const escapedPath = escapeGitPath(skillPath);
        execSync(`git add -f "${escapedPath}"`, { cwd: localRepoDir, stdio: 'pipe' });
      } catch {
        // If individual add fails, try adding the whole directory
        const escapedPath = escapeGitPath(skillPath);
        execSync(`git add -f "${escapedPath}/"`, { cwd: localRepoDir, stdio: 'pipe' });
      }
    }
    
    // Also use git add -A to catch any other changes
    execSync('git add -A', { cwd: localRepoDir, stdio: 'pipe' });
    
    addSpinner.succeed('Files added to Git');
  } catch (error) {
    addSpinner.fail('Failed to add files to Git');
    if (isExecError(error) && error.stderr) {
      console.error(chalk.dim(error.stderr.toString().trim()));
    }
    process.exit(1);
  }

  // Check if there are any changes to commit
  const checkSpinner = ora('Checking for changes...').start();
  try {
    // Check if there are staged changes
    const statusOutput = execSync('git status --porcelain', { 
      cwd: localRepoDir, 
      encoding: 'utf-8',
      stdio: 'pipe' 
    });
    
    if (!statusOutput.trim()) {
      checkSpinner.info('No changes to commit');
      console.log(chalk.yellow('No changes detected. Skills are already up to date.'));
      
      try {
        const lsOutput = execSync('git ls-files skills/', { 
          cwd: localRepoDir, 
          encoding: 'utf-8',
          stdio: 'pipe' 
        });
        if (lsOutput.trim()) {
          console.log(chalk.dim('\nFiles in Git index:'));
          console.log(chalk.dim(lsOutput.trim().split('\n').slice(0, 10).join('\n')));
        }
      } catch (error) {
        // Ignore errors when listing files - non-critical
        if (isExecError(error) && error.code !== 0) {
          console.log(chalk.dim(`Note: Could not list files in Git index: ${error.message || 'Unknown error'}`));
        }
      }
      
      return;
    }
    
    checkSpinner.succeed('Changes detected');
  } catch (error) {
    checkSpinner.fail('Failed to check changes');
    if (isExecError(error) && error.stderr) {
      console.error(chalk.dim(error.stderr.toString().trim()));
    }
    process.exit(1);
  }

  // Commit changes
  const commitSpinner = ora('Committing changes...').start();
  try {
    const isWindows = process.platform === 'win32';
    
    // Escape commit message for shell command
    const escapedMessage = escapeCommitMessage(commitMessage);
    const commitCmd = `git commit -m "${escapedMessage}"`;
    
    const execOptions: { 
      cwd: string; 
      stdio: 'pipe'; 
      shell?: string;
      encoding: BufferEncoding;
    } = {
      cwd: localRepoDir,
      stdio: 'pipe',
      encoding: 'utf-8',
    };
    
    // On Windows, use PowerShell or cmd.exe
    if (isWindows) {
      // Let execSync use default behavior, or explicitly specify PowerShell
      execOptions.shell = process.env.PSModulePath ? 'powershell.exe' : (process.env.COMSPEC || 'cmd.exe');
    }
    
    const output = execSync(commitCmd, execOptions);
    
    commitSpinner.succeed('Changes committed');
    
    // Display commit information if available
    if (output && typeof output === 'string' && output.trim()) {
      console.log(chalk.dim(output.trim()));
    }
  } catch (error) {
    commitSpinner.fail('Failed to commit changes');
    
    // Display full error information
    console.error(chalk.red('\n=== Commit Error Details ==='));
    
    if (isExecError(error)) {
      if (error.stderr) {
        const errorMsg = error.stderr.toString().trim();
        console.error(chalk.red('Stderr:'));
        console.error(chalk.dim(errorMsg));
      }
      
      if (error.stdout) {
        const outputMsg = error.stdout.toString().trim();
        console.error(chalk.yellow('Stdout:'));
        console.error(chalk.dim(outputMsg));
      }
      
      if (error.code !== undefined) {
        console.error(chalk.red(`Exit code: ${error.code}`));
      }
    }
    
    // Check for common issues
    const errorText = isExecError(error) 
      ? (error.stderr?.toString() || error.stdout?.toString() || '').toLowerCase()
      : '';
    
    if (errorText.includes('nothing to commit') || errorText.includes('nothing added to commit')) {
      console.log(chalk.yellow('\nNo changes to commit. Skills are already up to date.'));
      return;
    } else if (errorText.includes('author') || errorText.includes('user.name') || errorText.includes('user.email')) {
      console.error(chalk.yellow('\nTip: Configure Git user name and email:'));
      console.error(chalk.cyan('  git config --global user.name "Your Name"'));
      console.error(chalk.cyan('  git config --global user.email "your.email@example.com"'));
    }
    
    process.exit(1);
  }

  // Push to remote
  await pushToRemote(localRepoDir, skills.map(s => s.name));
}

/**
 * Push to remote repository
 */
async function pushToRemote(repoDir: string, skillNames: string[]): Promise<void> {
  const spinner = ora('Pushing to remote...').start();
  
  // Check remote repository configuration
  let remoteUrl: string;
  try {
    remoteUrl = execSync('git remote get-url origin', {
      cwd: repoDir,
      encoding: 'utf-8',
      stdio: 'pipe'
    }).trim();
    console.log(chalk.dim(`Remote: ${remoteUrl}`));
  } catch (error) {
    spinner.fail('No remote repository configured');
    console.error(chalk.red('Error: Remote repository not found'));
    process.exit(1);
  }
  
  // Get current branch
  const currentBranch = getCurrentBranch(repoDir);
  console.log(chalk.dim(`Current branch: ${currentBranch}`));
  
  // Try to push to current branch, then main, then master
  let pushSuccess = false;
  let lastError: unknown = null;
  
  for (const branch of [currentBranch, ...DEFAULT_BRANCHES]) {
    try {
      // Sanitize branch name to prevent command injection
      const safeBranch = sanitizeBranchName(branch);
      if (branch === currentBranch) {
        // Use -u flag for current branch to set upstream
        execSync(`git push -u origin ${safeBranch}`, { 
          cwd: repoDir, 
          stdio: 'pipe',
          encoding: 'utf-8'
        });
      } else {
        execSync(`git push origin ${safeBranch}`, { 
          cwd: repoDir, 
          stdio: 'pipe',
          encoding: 'utf-8'
        });
      }
      pushSuccess = true;
      break;
    } catch (error) {
      lastError = error;
      if (isExecError(error)) {
        const errorMsg = error.stderr?.toString() || error.stdout?.toString() || '';
        
        // If branch doesn't exist on remote, try next branch
        if (errorMsg.includes(`refs/heads/${branch}`) || errorMsg.includes('Could not read')) {
          continue;
        }
      }
      // For other errors, stop trying
      break;
    }
  }
  
  if (pushSuccess) {
    spinner.succeed('Pushed to remote');
    
    if (skillNames.length === 1) {
      console.log(chalk.green(`\n✓ Successfully uploaded skill: ${chalk.bold(skillNames[0])}`));
    } else {
      console.log(chalk.green(`\n✓ Successfully uploaded ${skillNames.length} skills:`));
      skillNames.forEach(name => {
        console.log(chalk.green(`  - ${chalk.bold(name)}`));
      });
    }
  } else {
    spinner.fail('Failed to push to remote');
    
    console.error(chalk.red('\n=== Push Error Details ==='));
    
    if (lastError && isExecError(lastError)) {
      if (lastError.stderr) {
        const errorMsg = lastError.stderr.toString().trim();
        console.error(chalk.red('Stderr:'));
        console.error(chalk.dim(errorMsg));
        
        if (errorMsg.includes('authentication') || errorMsg.includes('permission') || errorMsg.includes('denied')) {
          console.error(chalk.yellow('\nTip: Check your Git credentials (SSH keys or credential helper)'));
        } else if (errorMsg.includes('no upstream') || errorMsg.includes('no tracking')) {
          console.error(chalk.yellow('\nTip: The branch may not exist on remote. Try:'));
          console.error(chalk.cyan(`  git push -u origin ${currentBranch}`));
        } else if (errorMsg.includes('rejected') || errorMsg.includes('non-fast-forward')) {
          console.error(chalk.yellow('\nTip: Remote has changes that you don\'t have. Try:'));
          console.error(chalk.cyan(`  git pull origin ${currentBranch} --rebase`));
          console.error(chalk.cyan(`  git push origin ${currentBranch}`));
        }
      }
      
      if (lastError.stdout) {
        console.error(chalk.yellow('Stdout:'));
        console.error(chalk.dim(lastError.stdout.toString().trim()));
      }
    }
    
    process.exit(1);
  }
}
