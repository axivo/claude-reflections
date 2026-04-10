/**
 * Workflow handler for reflection entry operations
 *
 * @module handlers/Workflow
 * @author AXIVO
 * @license BSD-3-Clause
 */
const Action = require('../core/Action');
const BucketService = require('../services/Bucket');
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
    this.bucketService = new BucketService(params);
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
   * Triggers a website build via the Cloudflare deploy hook
   *
   * @returns {Promise<void>}
   */
  async deployEntries() {
    return this.execute('deploy entries', async () => {
      this.logger.info('Triggering website build...');
      const response = await fetch(process.env.DEPLOY_HOOK_URL, { method: 'POST' });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Deploy hook returned ${response.status}: ${text}`);
      }
      this.logger.info('Website build triggered successfully');
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
   * Uploads diary entries to R2 storage
   *
   * @returns {Promise<void>}
   */
  async uploadEntries() {
    return this.execute('upload all entries', async () => {
      this.logger.info('Uploading entries to R2 bucket...');
      const updatedFiles = await this.gitHubService.getUpdatedFiles();
      const diaryFiles = updatedFiles.filter(file => file.match(/^diary\/\d{4}\/\d{2}\/\d{2}\.md$/));
      let totalEntries = 0;
      let totalMedia = 0;
      const processedDirs = new Set();
      for (const file of diaryFiles) {
        const count = await this.bucketService.processFile(file);
        totalEntries += count;
        const dirKey = file.replace(/\/\d{2}\.md$/, '');
        if (!processedDirs.has(dirKey)) {
          processedDirs.add(dirKey);
          const mediaCount = await this.bucketService.processMedia(file);
          totalMedia += mediaCount;
        }
      }
      let message = `Uploaded ${totalEntries} entries from ${diaryFiles.length} diary files`;
      if (totalMedia) {
        message = `Uploaded ${totalEntries} entries and ${totalMedia} media from ${diaryFiles.length} diary files`;
      }
      this.logger.info(message);
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
      if (issue) {
        message = 'Successfully reported workflow issue';
      }
      this.logger.info(`${message}`);
    }, false);
  }
}

module.exports = WorkflowHandler;
