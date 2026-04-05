# CI/CD Setup Guide

This document explains the production-grade CI/CD workflow implemented for the Echo AI SDK.

## Overview

The CI/CD pipeline is designed to provide:
- Fast feedback for developers
- Automated quality gates
- Secure and reliable releases
- Comprehensive monitoring and alerting

## Workflows

### 1. CI Workflow (`.github/workflows/ci.yml`)

The main CI workflow runs on every push and pull request:

#### Jobs:
- **quick-checks**: Runs linting and typechecking with path filtering
- **test**: Runs tests across Node.js 20 and 22 with coverage reporting
- **security**: Performs npm audit and Snyk security scans
- **build**: Builds CJS and ESM bundles
- **bundle-size-check**: Monitors bundle size changes on PRs

#### Features:
- Parallel execution for faster feedback
- Intelligent caching for dependencies
- Conditional execution based on changed files
- Codecov integration for coverage tracking
- Bundle size monitoring with 10% threshold

### 2. Release Workflow (`.github/workflows/release.yml`)

Automated semantic release triggered on pushes to main:

#### Features:
- Semantic versioning based on conventional commits
- Automated changelog generation
- Publishing to npm and GitHub Packages
- Release artifact creation
- Rollback capability

#### Configuration:
- Uses `.releaserc.json` for release configuration
- Requires `NPM_TOKEN` and `GITHUB_TOKEN` secrets

### 3. Preview Workflow (`.github/workflows/preview.yml`)

Creates preview deployments for pull requests:

#### Features:
- Documentation preview on Netlify
- TypeScript type check results in PR comments
- Conditional execution based on changed files

#### Required Secrets:
- `NETLIFY_AUTH_TOKEN`
- `NETLIFY_SITE_ID`

### 4. Quality Workflow (`.github/workflows/quality.yml`)

Runs comprehensive quality checks:

#### Jobs:
- **performance**: Performance regression tests
- **api-compatibility**: API change detection
- **documentation**: Documentation coverage validation
- **bundle-analysis**: Detailed bundle analysis
- **metrics**: Build metrics collection

### 5. Dependency Update Workflow (`.github/workflows/dependency-update.yml`)

Automated dependency management:

#### Features:
- Weekly dependency updates
- Security vulnerability scanning
- Automatic PR creation
- Test execution before PR creation

### 6. Monitoring Workflow (`.github/workflows/monitoring.yml`)

Continuous monitoring and alerting:

#### Features:
- Package health checks
- Performance benchmarking
- Automated issue creation on failures
- Repository metrics collection

## Required Secrets

### For Publishing:
- `NPM_TOKEN`: npm publish token
- `GITHUB_TOKEN`: GitHub token (automatically provided)

### For Security:
- `SNYK_TOKEN`: Snyk security scanning token

### For Previews:
- `NETLIFY_AUTH_TOKEN`: Netlify authentication token
- `NETLIFY_SITE_ID`: Netlify site ID

### For Coverage:
- `CODECOV_TOKEN`: Codecov token (optional, for private repos)

## Configuration Files

### `.releaserc.json`
Configures semantic release behavior:
- Branch strategy
- Plugin configuration
- Changelog generation

### `package.json` Scripts
- `test:coverage`: Run tests with coverage
- `format:check`: Check code formatting
- `format`: Format code with Prettier

### `.prettierrc`
Code formatting configuration

## Performance Optimizations

1. **Parallel Execution**: Jobs run in parallel where possible
2. **Intelligent Caching**: 
   - npm dependencies cached
   - Build artifacts cached
   - Test results cached
3. **Path Filtering**: Skip full CI on docs-only changes
4. **Matrix Optimization**: Test on latest Node.js versions only

## Quality Gates

1. **Code Quality**: ESLint, TypeScript, Prettier
2. **Test Coverage**: Minimum 40% coverage (configurable)
3. **Security**: npm audit, Snyk scans
4. **Bundle Size**: Fail on >10% increase
5. **Performance**: Benchmark thresholds

## Monitoring

1. **Status Badges**: Comprehensive badges in README
2. **Build Metrics**: Collected and stored as artifacts
3. **Failure Alerts**: Automatic issue creation
4. **Coverage Reports**: Codecov integration
5. **Dependency Monitoring**: Automated updates

## Best Practices

1. **Conventional Commits**: Required for semantic release
   ```
   feat: add new feature
   fix: resolve bug
   chore: update dependencies
   docs: update documentation
   ```

2. **PR Titles**: Must follow semantic format for PR title check

3. **Branch Strategy**: 
   - `main`: Production branch
   - Feature branches: Create PRs to main

4. **Release Process**:
   - Push to main with conventional commits
   - Semantic release automatically creates version
   - Changelog generated automatically
   - Published to npm and GitHub Packages

## Troubleshooting

### Common Issues:

1. **Bundle Size Increase**:
   - Check what was added
   - Consider code splitting
   - Update bundle size threshold if needed

2. **Test Failures**:
   - Check test artifacts
   - Review test coverage
   - Ensure all dependencies are installed

3. **Release Failures**:
   - Check NPM_TOKEN configuration
   - Verify conventional commit format
   - Review semantic release logs

4. **Security Scan Failures**:
   - Update vulnerable dependencies
   - Review false positives
   - Update security thresholds

## Future Enhancements

1. **E2E Testing**: Add end-to-end test suite
2. **Performance Budgets**: More granular performance budgets
3. **Multi-Environment Deployments**: Staging/prod environments
4. **Canary Releases**: Gradual rollout for new versions
5. **Automated Documentation**: API docs from JSDoc
