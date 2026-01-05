/**
 * Production configuration values
 *
 * This module defines the production configuration values used throughout the application.
 */

module.exports = {
  /**
   * Issue-specific configuration
   *
   * @type {Object}
   */
  issue: {
    /**
     * Controls automatic label update for repository
     *
     * When enabled, the system will automatically update repository labels
     * defined in the labels configuration during workflow execution. When
     * disabled, the system will only use existing labels.
     *
     * @type {boolean}
     * @default false
     */
    updateLabels: false,

    /**
     * Predefined issue label definitions used across the repository
     *
     * Contains standardized label definitions (color, description) that are
     * used for categorizing issues in GitHub. These labels can be automatically
     * created when updateLabels is true.
     *
     * @type {Object}
     */
    labels: {
      /**
       * Label definition for bugs and issues
       *
       * @type {Object}
       */
      bug: {
        /**
         * Display color for the bug label (red)
         *
         * @type {string}
         * @default 'd73a4a'
         */
        color: 'd73a4a',

        /**
         * Tooltip description shown when hovering over the bug label
         *
         * @type {string}
         * @default 'Something isn\'t working'
         */
        description: 'Something isn\'t working'
      },

      /**
       * Label definition for dependency version issues
       *
       * @type {Object}
       */
      dependency: {
        /**
         * Display color for the dependency label (dark blue)
         *
         * @type {string}
         * @default '00008b'
         */
        color: '00008b',

        /**
         * Tooltip description shown when hovering over the dependency label
         *
         * @type {string}
         * @default 'Dependency version related'
         */
        description: 'Dependency version related'
      },

      /**
       * Label definition for issues requiring initial assessment
       *
       * @type {Object}
       */
      triage: {
        /**
         * Display color for the triage label (green)
         *
         * @type {string}
         * @default '30783f'
         */
        color: '30783f',

        /**
         * Tooltip description shown when hovering over the triage label
         *
         * @type {string}
         * @default 'Needs triage'
         */
        description: 'Needs triage'
      },

      /**
       * Label definition for workflow-related issues and errors
       *
       * @type {Object}
       */
      workflow: {
        /**
         * Display color for the workflow label (purple)
         *
         * @type {string}
         * @default 'b84cfd'
         */
        color: 'b84cfd',

        /**
         * Tooltip description shown when hovering over the workflow label
         *
         * @type {string}
         * @default 'Workflow execution related'
         */
        description: 'Workflow execution related'
      }
    }
  },

  /**
   * Repository-specific configuration
   *
   * @type {Object}
   */
  repository: {
    /**
     * Git user identity for automated operations
     *
     * Contains the standard user identity used for Git operations in automated
     * workflows. This configuration ensures that commits and changes made by
     * GitHub Actions are properly attributed to the GitHub Actions bot account
     * rather than to any human user.
     *
     * The GitHub Actions bot is a special system account that can make verified
     * commits directly through the GitHub API without requiring personal access
     * tokens. Using this identity ensures all automated commits are clearly
     * distinguishable from human commits in the repository history.
     *
     * @type {Object}
     */
    user: {
      /**
       * Email address for the GitHub Actions bot
       *
       * Standard email address for the GitHub Actions bot account.
       * This email is automatically recognized by GitHub as belonging
       * to the Actions system account, which allows commits to be
       * properly verified in the GitHub interface.
       *
       * @type {string}
       * @default '41898282+github-actions[bot]@users.noreply.github.com'
       */
      email: '41898282+github-actions[bot]@users.noreply.github.com',

      /**
       * Username for the GitHub Actions bot
       *
       * Standard username for the GitHub Actions bot account.
       * This username is displayed as the author/committer in Git commit
       * history and in the GitHub interface, making it clear which changes
       * were made by automated processes.
       *
       * @type {string}
       * @default 'github-actions[bot]'
       */
      name: 'github-actions[bot]'
    }
  },

  /**
   * Workflow-specific configuration
   *
   * @type {Object}
   */
  workflow: {
    /**
     * Standard labels to apply to workflow-generated issues
     *
     * This array defines the set of labels that are automatically applied to issues
     * created by workflows when they detect problems. These labels help categorize
     * and filter workflow-related issues in the repository's issue tracker.
     *
     * @type {Array<string>}
     * @default ['bug', 'triage', 'workflow']
     */
    labels: ['bug', 'triage', 'workflow'],

    /**
     * Log level for workflow operations
     *
     * Controls the verbosity of log output in workflows. Available levels:
     * - debug: Show all messages including detailed tracing and stack traces
     * - info: Show informational, warning, and error messages (default)
     * - warning: Show only warning and error messages
     * - error: Show only error messages
     *
     * @type {string}
     * @default 'info'
     */
    logLevel: 'info',

    /**
     * Path to the Handlebars template for workflow-generated issues
     *
     * This file contains the Handlebars template used to generate the content
     * of issues created by workflow runs when errors or warnings are detected.
     * It includes placeholders for workflow name, branch, commit, and run details.
     *
     * @type {string}
     * @default '.github/actions/templates/workflow.md.hbs'
     */
    template: '.github/actions/templates/workflow.md.hbs',

    /**
     * Standard title prefix for workflow-generated issues
     *
     * When workflows encounter errors or need to report information,
     * they create issues with this standardized title prefix for easy identification.
     * The complete title typically includes additional context about the specific issue.
     *
     * @type {string}
     * @default 'workflow: Issues Detected'
     */
    title: 'workflow: Issues Detected'
  }
};
