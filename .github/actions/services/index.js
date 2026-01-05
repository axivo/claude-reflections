/**
 * Services module
 *
 * @module services
 * @author AXIVO
 * @license BSD-3-Clause
 */

const FileService = require('./File');
const FormatService = require('./Format');
const GitService = require('./Git');
const GitHubService = require('./Github');
const IssueService = require('./Issue');
const LabelService = require('./Label');
const ShellService = require('./Shell');
const TemplateService = require('./Template');

module.exports = {
  File: FileService,
  Format: FormatService,
  Git: GitService,
  GitHub: GitHubService,
  Issue: IssueService,
  Label: LabelService,
  Shell: ShellService,
  Template: TemplateService
};
