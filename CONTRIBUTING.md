# Contributing to BugPin

Thank you for your interest in contributing to BugPin! We welcome contributions from the community.

## Code of Conduct

Be respectful, inclusive, and considerate of others. We want BugPin to be a welcoming project for everyone.

## How to Contribute

### Reporting Bugs

If you find a bug:

1. Check if the issue already exists in [GitHub Issues](https://github.com/aranticlabs/bugpin/issues)
2. If not, create a new issue with:
   - Clear, descriptive title
   - Steps to reproduce the bug
   - Expected vs actual behavior
   - Screenshots if applicable
   - Environment details (OS, Browser, Docker version, etc.)

### Suggesting Features

Feature requests are welcome! Please:

1. Check if the feature has already been requested
2. Create a new issue with:
   - Clear description of the feature
   - Use case and why it's valuable
   - Possible implementation approach (optional)

### Contributing Code

We follow a standard fork-and-pull-request workflow:

1. **Fork the repository** to your GitHub account

2. **Clone your fork**:

   ```bash
   git clone https://github.com/YOUR-USERNAME/bugpin.git
   cd bugpin
   ```

3. **Create a feature branch**:

   ```bash
   git checkout -b feature/my-awesome-feature
   # or
   git checkout -b fix/issue-123
   ```

4. **Set up development environment**:

   ```bash
   # Install dependencies
   bun install

   # Start development server
   bun run dev
   ```

5. **Make your changes** following our coding standards (see below)

6. **Test your changes**:

   ```bash
   # Type check
   bun run typecheck

   # Run tests
   bun run test
   ```

7. **Commit your changes** (with sign-off):

   ```bash
   git add .
   git commit -s -m "feat: add awesome feature"
   ```

   The `-s` flag adds a `Signed-off-by` line (see [Sign Your Work](#sign-your-work) below).

   Follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):
   - `feat:` - New feature
   - `fix:` - Bug fix
   - `docs:` - Documentation changes
   - `style:` - Code style changes (formatting, etc.)
   - `refactor:` - Code refactoring
   - `test:` - Adding or updating tests
   - `chore:` - Maintenance tasks

8. **Push to your fork**:

   ```bash
   git push origin feature/my-awesome-feature
   ```

9. **Create a Pull Request** on GitHub with:
   - Clear description of changes
   - Link to related issues
   - Screenshots/videos if UI changes

## Development Guidelines

### Coding Standards

**Read [docs/CODING-PRINCIPLES.md](docs/CODING-PRINCIPLES.md) first!** It contains our architecture principles and coding standards.

Key principles:

- **Simple layered architecture**: Routes → Services → Repositories
- **TypeScript strict mode**: No `any` types
- **Result pattern**: Services return `Result<T>` for error handling
- **American English**: `color`, `center`, `organize`
- **No file-level JSDoc**: Files start with imports, not comments

### File Structure

- Routes: `/src/server/routes/`
- Services: `/src/server/services/`
- Repositories: `/src/server/database/repositories/`
- Admin Console: `/src/admin/`
- Widget: `/src/widget/`

### Naming Conventions

See [docs/CODING-PRINCIPLES.md](docs/CODING-PRINCIPLES.md) for complete naming conventions:

- Files: `kebab-case.ts` (e.g. `reports.service.ts`, `auth.middleware.ts`)
- Repositories: `*.repo.ts` (e.g. `reports.repo.ts`)
- Services: `*.service.ts` (e.g. `reports.service.ts`)
- Classes: `PascalCase`
- Functions/variables: `camelCase`
- Constants: `SCREAMING_SNAKE_CASE`

### Testing

- Write tests for new features
- Update tests when modifying existing code
- Ensure all tests pass before submitting PR

### Documentation

- Update relevant documentation in `/docs`
- Add JSDoc to public API functions/classes where helpful (no file-level JSDoc headers)
- Update README if adding user-facing features

## Project Setup

### Prerequisites

- [Bun](https://bun.sh) v1.0 or higher
- Docker (for testing containerized deployment)

### Development Commands

Dependency ranges may use `^`; `bun.lock` records the exact versions used by CI and
Docker builds. Bun filters newly resolved npm releases to a minimum age of 72 hours.
Run `bun run check:dependency-age` to check every locked npm release in CE and an
initialized EE submodule, including transitive dependencies. Missing lockfiles
fail the check. For a CE-only local check, run
`bun run src/server/scripts/check-dependency-age.ts bun.lock`.

The release age check runs on pull requests and before Docker publishing. It fails
when a release is younger than 72 hours or its publication timestamp cannot be
verified. Rerun it after the reported eligibility time. The pinned SheetJS tarball
is excluded because its release is hosted outside npm; other non-registry sources
are rejected. Release age does not establish that a package is uncompromised, so
dependency updates still need security review. Configure the `dependency-age` job
as a required status check in GitHub branch protection to enforce it before merging.

The PR workflow reads EE's lockfile at the exact submodule revision recorded by
CE, using `EE_ACCESS_TOKEN`. Without access to the private EE repository, the check
fails. Fork contributions must be checked from a trusted maintainer branch because
GitHub does not provide this secret to fork PRs.

```bash
# Install dependencies
bun install

# Development: server + admin (hot reload). Widget: bun run dev:widget for watch build
bun run dev

# Build for production
bun run build

# Type checking
bun run typecheck

# Tests
bun run test

# Clean build artifacts and node_modules
rm -rf dist node_modules src/*/node_modules
```

### Architecture Overview

- **Server**: Bun runtime + Hono framework + SQLite
- **Admin Console**: React 19 + Vite + TanStack Query + Tailwind CSS
- **Widget**: Preact + Fabric.js (for annotations) + IndexedDB (offline support)

## Pull Request Guidelines

### PR Description

Include:

- **What** - Summary of changes
- **Why** - Reason for changes
- **How** - Implementation approach
- **Testing** - How you tested the changes
- **Screenshots** - If UI changes

### Review Process

1. Maintainers will review your PR
2. Address any requested changes
3. Once approved, your PR will be merged
4. Your contribution will be included in the next release!

## Questions?

- Open a [GitHub Discussion](https://github.com/aranticlabs/bugpin/discussions)
- Check existing issues and discussions
- Read the [documentation](https://docs.bugpin.io)

## Sign Your Work

We use the Developer Certificate of Origin (DCO) as an additional safeguard for the BugPin project. This is a well-established and widely used mechanism to assure contributors have confirmed their right to license their contribution under the project's license.

Please read the [DCO](DCO) file. If you can certify it, then just add a line to every git commit message:

```
Signed-off-by: Your Name <your.email@example.com>
```

Use your real name (sorry, no pseudonyms or anonymous contributions). You can sign your commit automatically with `git commit -s`. You can also use git aliases like `git config --global alias.ci 'commit -s'`. Now you can commit with `git ci` and the commit will be signed.

## License

BugPin uses a multi-license approach:

| Component | License |
|-----------|---------|
| Server (`src/server/`) | AGPL-3.0 |
| Admin (`src/admin/`) | AGPL-3.0 |
| Widget (`src/widget/`) | MIT |
| Enterprise (`ee/`) | Proprietary |

By contributing to BugPin, you agree that:

- Contributions to `src/server/` and `src/admin/` are licensed under AGPL-3.0
- Contributions to `src/widget/` are licensed under MIT
- You cannot contribute to `ee/` (proprietary, Arantic Digital only)

The AGPL-3.0 and MIT licenses include:

- Explicit patent grants from contributors
- Standard open source freedoms to use, modify, and distribute

These licenses do not grant permission to use the BugPin name or logo. See [legal/TRADEMARK.md](legal/TRADEMARK.md) for our trademark policy.

**No separate Contributor License Agreement (CLA) is required.** The DCO sign-off is sufficient.
---

Thank you for contributing to BugPin!
