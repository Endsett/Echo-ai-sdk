# Release Automation Troubleshooting

## Common Issues and Solutions

### 1. Semantic Release Not Triggering

**Problem**: No release is created when pushing to main.

**Solutions**:
- Ensure commits follow conventional commit format:
  ```
  feat: add new feature
  fix: resolve bug
  chore: update dependencies
  docs: update documentation
  ```
- Check that you're pushing to the `main` branch
- Verify the `.releaserc.json` configuration is correct

### 2. NPM Publish Fails

**Problem**: Package fails to publish to npm.

**Solutions**:
- Check that `NPM_TOKEN` secret is configured in GitHub repository settings
- Ensure you have publishing permissions for the package
- Verify `package.json` has correct:
  - `name` (unique on npm)
  - `version` (will be updated by semantic-release)
  - `publishConfig` registry setting

### 3. GitHub Packages Publish Fails

**Problem**: Package fails to publish to GitHub Packages.

**Solutions**:
- Check that `GITHUB_TOKEN` has `packages:write` permission
- Ensure the package name is scoped: `@Endsett/echo-ai-sdk-ts`
- Verify registry URL is set correctly in the workflow

### 4. Release Artifacts Not Uploaded

**Problem**: Release artifacts are not attached to the GitHub release.

**Solutions**:
- Check that the release job is setting outputs correctly
- Verify the artifact creation step runs successfully
- Ensure the upload step has proper permissions

### 5. Tests Failing in Release

**Problem**: Tests pass locally but fail in release workflow.

**Solutions**:
- Check Node.js version compatibility (using Node 20 in CI)
- Ensure all dependencies are properly installed with `npm ci`
- Check for platform-specific differences

### 6. Build Fails in Release

**Problem**: Build fails during release process.

**Solutions**:
- Ensure `npm run build` works locally
- Check that all required files are included in the build
- Verify TypeScript configuration is correct

## Debugging Steps

### 1. Check Workflow Logs
1. Go to Actions tab in GitHub
2. Click on the failed Release workflow
3. Review each step's logs for error messages

### 2. Test Locally
```bash
# Install dependencies
npm ci

# Run tests
npm run test:coverage

# Build
npm run build

# Test semantic release configuration
npx semantic-release --dry-run
```

### 3. Verify Configuration
```bash
# Check semantic-release config
cat .releaserc.json

# Check package.json
cat package.json | grep -E "(name|version|publishConfig)"
```

### 4. Check Secrets
Ensure these secrets are configured in GitHub repository settings:
- `NPM_TOKEN`: npm automation token
- `GITHUB_TOKEN`: Automatically provided, ensure permissions are correct
- `SNYK_TOKEN`: For security scanning (optional)
- `CODECOV_TOKEN`: For coverage reporting (optional)

## Manual Release

If automated release fails, you can release manually:

```bash
# 1. Install semantic-release locally
npm install -g semantic-release

# 2. Set environment variables
export GITHUB_TOKEN=your_github_token
export NPM_TOKEN=your_npm_token

# 3. Run semantic release
npx semantic-release

# 4. Create GitHub release manually if needed
gh release create v2.8.0 --generate-notes
```

## Get Help

1. Check [Semantic Release Documentation](https://semantic-release.gitbook.io/)
2. Review [GitHub Actions Documentation](https://docs.github.com/en/actions)
3. Create an issue in the repository with:
   - Workflow run ID
   - Error messages
   - Steps taken to debug

## Prevention Tips

1. Always use conventional commit messages
2. Test locally before pushing to main
3. Keep dependencies up to date
4. Monitor workflow runs regularly
5. Set up notifications for workflow failures
