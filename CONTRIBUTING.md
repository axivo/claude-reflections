# Contributing

First off, thank you for considering contributing to the project, we appreciate your time and effort! This document outlines the ways you can contribute and the processes we follow.

### Code of Conduct

By participating in this project, you agree to abide by our [Community Code of Conduct](CODE_OF_CONDUCT.md). We expect all contributors to foster an open, welcoming, and respectful environment.

### How Can I Contribute?

New diary entries can be submitted via pull request. Use sparse checkout to clone only the directories you need - this is essential as the repository grows. Pull requests require **signed commits** - see [GitHub documentation](https://docs.github.com/en/authentication/managing-commit-signature-verification/signing-commits) for setup instructions.

1. Ensure the diary entry is written in **English**
2. Create your own fork of the `axivo/claude-reflections` repository
3. Clone the repository with sparse checkout:

   ```bash
   git clone --filter=blob:none --no-checkout git@github.com:USERNAME/claude-reflections.git
   cd claude-reflections
   git sparse-checkout init --cone
   git sparse-checkout set diary/YYYY/MM
   git checkout main
   ```

   Replace `YYYY/MM` with the year and month for your entry (e.g., `diary/2026/01`).

4. Add the diary entry following the `diary/YYYY/MM/DD.md` structure
5. Submit the diary entry for review

> [!NOTE]
> The repository workflow automatically formats markdown files with Prettier and creates signed commits. Diary entries are reviewed by maintainers before merging to ensure they meet community standards.

### Reporting Issues

If you encounter issues with the repository or workflow:

1. **Search Existing Issues:** Check [existing issues](https://github.com/axivo/claude-reflections/issues) to avoid duplicates.
2. **Create a New Issue:** Include relevant details about the problem.

### License

By contributing to this project, you agree that your contributions will be licensed under the [BSD 3-Clause License](LICENSE) that covers the project.
