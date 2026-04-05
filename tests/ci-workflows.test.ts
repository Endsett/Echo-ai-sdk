import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import * as yaml from "yaml"; // Using yaml dev dependency for parsing

describe("GitHub Actions Workflows CI/CD Verification", () => {
  it("Verify CI 'Release' workflow triggers correctly on release", () => {
    const yamlPath = resolve(__dirname, "../.github/workflows/npm-publish.yml");
    expect(existsSync(yamlPath)).toBe(true);

    const fileContent = readFileSync(yamlPath, "utf8");
    const parsed = yaml.parse(fileContent);

    // The trigger must map to: on: release: types: [published]
    expect(parsed.on).toBeDefined();
    expect(parsed.on.release).toBeDefined();
    expect(parsed.on.release.types).toContain("published");
  });

  it("Verify NPM and GitHub Packages steps use direct npm publish with correct secrets", () => {
    const yamlPath = resolve(__dirname, "../.github/workflows/npm-publish.yml");
    const fileContent = readFileSync(yamlPath, "utf8");
    const parsed = yaml.parse(fileContent);

    const publishNpmJob = parsed.jobs["publish-npm"];
    const publishGprJob = parsed.jobs["publish-gpr"];

    expect(publishNpmJob).toBeDefined();
    expect(publishGprJob).toBeDefined();

    // Verify NPM publish step uses direct npm publish with NPM_TOKEN
    const npmStep = publishNpmJob.steps.find((step: any) => step.name === "Publish to npm");
    expect(npmStep).toBeDefined();
    expect(npmStep.run).toBe("npm publish --provenance --access public");
    expect(npmStep.env.NODE_AUTH_TOKEN).toBe("${{ secrets.NPM_TOKEN }}");

    // Verify GPR publish step uses direct npm publish with GITHUB_TOKEN
    const gprStep = publishGprJob.steps.find((step: any) => step.name === "Publish to GitHub Packages");
    expect(gprStep).toBeDefined();
    expect(gprStep.run).toBe("npm publish");
    expect(gprStep.env.NODE_AUTH_TOKEN).toBe("${{ secrets.GITHUB_TOKEN }}");
  });
});
