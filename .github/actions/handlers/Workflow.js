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
   * Formats entries and optionally updates labels
   *
   * @returns {Promise<void>}
   */
  async processEntries() {
    return this.execute('process entries', async () => {
      if (this.config.get('issue.updateLabels')) await this.labelService.update();
      this.logger.info('Formatting entries...');
      const updatedFiles = await this.gitHubService.getUpdatedFiles();
      const markdownFiles = updatedFiles
        .filter(file => file.status !== 'removed' && file.filename.endsWith('.md'))
        .map(file => file.filename);
      await this.formatService.format(markdownFiles);
      this.logger.info('Entry formatting process complete');
    });
  }

  /**
   * Synchronizes diary entries and media with R2 storage
   *
   * @returns {Promise<void>}
   */
  async updateEntries() {
    return this.execute('update all entries', async () => {
      this.logger.info('Updating entries in R2 bucket...');
      const updatedFiles = await this.gitHubService.getUpdatedFiles();
      const diaryPattern = /^diary\/\d{4}\/\d{2}\/\d{2}\.md$/;
      const mediaPattern = /^diary\/\d{4}\/\d{2}\/media\//;
      let totalEntries = 0;
      let totalMedia = 0;
      const diaryFiles = new Set();
      const processedDirs = new Set();
      for (const file of updatedFiles) {
        if (file.status === 'removed' && diaryPattern.test(file.filename)) {
          totalEntries += await this.bucketService.deleteFile(file.filename);
          diaryFiles.add(file.filename);
          continue;
        }
        if (file.status === 'removed' && mediaPattern.test(file.filename)) {
          totalMedia += await this.bucketService.deleteMedia(file.filename);
          continue;
        }
        if (file.status === 'renamed' && file.previousFilename && diaryPattern.test(file.previousFilename)) {
          totalEntries += await this.bucketService.deleteFile(file.previousFilename);
        }
        if (file.status === 'renamed' && file.previousFilename && mediaPattern.test(file.previousFilename)) {
          totalMedia += await this.bucketService.deleteMedia(file.previousFilename);
        }
        if (diaryPattern.test(file.filename)) {
          totalEntries += await this.bucketService.processFile(file.filename);
          diaryFiles.add(file.filename);
          const dirKey = file.filename.replace(/\/\d{2}\.md$/, '');
          if (!processedDirs.has(dirKey)) {
            processedDirs.add(dirKey);
            totalMedia += await this.bucketService.processMedia(file.filename);
          }
          continue;
        }
        if (mediaPattern.test(file.filename)) {
          totalMedia += await this.bucketService.uploadMedia(file.filename);
        }
      }
      const pluralRules = new Intl.PluralRules('en-US');
      const plural = (count, singular, pluralForm) => `${count} ${pluralRules.select(count) === 'one' ? singular : pluralForm}`;
      let message = `Updated ${plural(totalEntries, 'entry', 'entries')} from ${plural(diaryFiles.size, 'diary file', 'diary files')}`;
      if (totalMedia) {
        message = `Updated ${plural(totalEntries, 'entry', 'entries')} and ${plural(totalMedia, 'media file', 'media files')} from ${plural(diaryFiles.size, 'diary file', 'diary files')}`;
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
