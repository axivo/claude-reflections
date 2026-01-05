/**
 * Format service for file formatting operations
 *
 * @module services/Format
 * @author AXIVO
 * @license BSD-3-Clause
 */
const Action = require('../core/Action');
const GitService = require('./Git');
const ShellService = require('./Shell');

/**
 * Format service for file formatting operations
 *
 * Provides Prettier integration including formatting
 * and Git commit management.
 *
 * @class FormatService
 */
class FormatService extends Action {
  /**
   * Creates a new FormatService instance
   *
   * @param {Object} params - Service parameters
   */
  constructor(params) {
    super(params);
    this.gitService = new GitService(params);
    this.shellService = new ShellService(params);
  }

  /**
   * Formats markdown files and commits changes
   *
   * @param {Array<string>} files - Files to format
   * @returns {Promise<void>}
   */
  async format(files) {
    return this.execute('format markdown', async () => {
      if (!files.length) {
        this.logger.info('No markdown files to format');
        return;
      }
      this.logger.info('Formatting markdown files with Prettier...');
      await this.shellService.execute('npx', ['prettier', '--write', ...files], { output: true });
      const statusResult = await this.gitService.getStatus();
      const changedFiles = [...statusResult.modified, ...statusResult.untracked];
      if (!changedFiles.length) {
        this.logger.info('No formatting changes to commit');
        return;
      }
      const branch = process.env.GITHUB_HEAD_REF;
      await this.gitService.signedCommit(branch, changedFiles, 'chore(github-action): format markdown');
    }, false);
  }
}

module.exports = FormatService;
