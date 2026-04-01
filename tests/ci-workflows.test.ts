import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import * as yaml from "yaml"; // Using yaml dev dependency for parsing

describe("GitHub Actions Workflows CI/CD Verification", () => {
  it("Verify CI 'Release' workflow triggers correctly on push to main", () => {
    const yamlPath = resolve(__dirname, "../.github/workflows/npm-publish.yml");
    expect(existsSync(yamlPath)).toBe(true);

    const fileContent = readFileSync(yamlPath, "utf8");
    const parsed = yaml.parse(fileContent);

    // The trigger must map to: on: push: branches: [main]
    expect(parsed.on).toBeDefined();
    expect(parsed.on.push).toBeDefined();
    expect(parsed.on.push.branches).toContain("main");
  });

  it("Verify NPM and GitHub Packages steps use the npm-publish action with correct secrets", () => {
    const yamlPath = resolve(__dirname, "../.github/workflows/npm-publish.yml");
    const fileContent = readFileSync(yamlPath, "utf8");
    const parsed = yaml.parse(fileContent);

    const publishNpmJob = parsed.jobs["publish-npm"];
    const publishGprJob = parsed.jobs["publish-gpr"];

    expect(publishNpmJob).toBeDefined();
    expect(publishGprJob).toBeDefined();

    // Verify NPM publish step uses JS-DevTools/npm-publish with NPM_TOKEN
    const npmStep = publishNpmJob.steps.find((step: any) => step.name === "Publish to npm");
    expect(npmStep).toBeDefined();
    expect(npmStep.uses.startsWith("JS-DevTools/npm-publish")).toBe(true);
    expect(npmStep.with.token).toBe("${{ secrets.NPM_TOKEN }}");
    expect(npmStep.with.provenance).toBe(true);
    expect(npmStep.with.access).toBe("public");

    // Verify GPR publish step uses JS-DevTools/npm-publish with GITHUB_TOKEN
    const gprStep = publishGprJob.steps.find((step: any) => step.name === "Publish to GitHub Packages");
    expect(gprStep).toBeDefined();
    expect(gprStep.uses.startsWith("JS-DevTools/npm-publish")).toBe(true);
    expect(gprStep.with.token).toBe("${{ secrets.GITHUB_TOKEN }}");
    expect(gprStep.with.registry).toContain("npm.pkg.github.com");
  });
});
