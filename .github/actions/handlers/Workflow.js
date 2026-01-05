/**
 * Workflow handler for reflection entry operations
 *
 * @module handlers/Workflow
 * @author AXIVO
 * @license BSD-3-Clause
 */
const Action = require('../core/Action');
const config = require('../config');
const FileService = require('../services/File');
const FormatService = require('../services/Format');
const GitService = require('../services/Git');
const GitHubService = require('../services/Github');
const IssueService = require('../services/Issue');
const LabelService = require('../services/Label');
const TemplateService = require('../services/Template');

/**
 * Workflow handler for reflection entry operations
 *
 * Provides orchestration for repository configuration, entry formatting,
 * and issue reporting for reflection workflows.
 *
 * @class WorkflowHandler
 */
class WorkflowHandler extends Action {
  /**
   * Creates a new WorkflowHandler instance
   *
   * @param {Object} params - Handler parameters
   */
  constructor(params) {
    params.config = config;
    super(params);
    this.fileService = new FileService(params);
    this.formatService = new FormatService(params);
    this.gitService = new GitService(params);
    this.gitHubService = new GitHubService(params);
    this.issueService = new IssueService(params);
    this.labelService = new LabelService(params);
    this.templateService = new TemplateService(params);
  }

  /**
   * Configures repository
   *
   * @returns {Promise<void>}
   */
  async configureRepository() {
    return this.execute('configure repository', async () => {
      this.logger.info('Configuring repository for workflow operations...');
      await this.gitService.configure();
      this.logger.info('Repository configuration complete');
    });
  }

  /**
   * Formats entries and optionally updates labels
   *
   * @returns {Promise<void>}
   */
  async processEntries() {
    return this.execute('process entries', async () => {
      if (this.config.get('issue.updateLabels')) await this.labelService.update();
      this.logger.info('Formatting entries...');
      const updatedFiles = await this.gitHubService.getUpdatedFiles();
      const markdownFiles = updatedFiles.filter(file => file.endsWith('.md'));
      await this.formatService.format(markdownFiles);
      this.logger.info('Entry formatting process complete');
    });
  }

  /**
   * Reports workflow issues
   *
   * @returns {Promise<void>}
   */
  async reportIssue() {
    return this.execute('report workflow issue', async () => {
      this.logger.info('Checking for workflow issues...');
      const templatePath = this.config.get('workflow.template');
      const templateContent = await this.fileService.read(templatePath);
      const issue = await this.issueService.report(
        this.context,
        {
          content: templateContent,
          service: this.templateService
        }
      );
      let message = 'No workflow issues to report';
      if (issue) message = 'Successfully reported workflow issue';
      this.logger.info(`${message}`);
    }, false);
  }
}

module.exports = WorkflowHandler;
