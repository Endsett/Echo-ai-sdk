import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import * as yaml from "yaml"; // Using yaml dev dependency for parsing

describe("GitHub Actions Workflows CI/CD Verification", () => {
  it("Verify CI 'Release' workflow triggers correctly on push to main", () => {
    const yamlPath = resolve(__dirname, "../.github/workflows/release.yml");
    expect(existsSync(yamlPath)).toBe(true);

    const fileContent = readFileSync(yamlPath, "utf8");
    const parsed = yaml.parse(fileContent);

    // The trigger must map to: on: push: branches: [main]
    expect(parsed.on).toBeDefined();
    expect(parsed.on.push).toBeDefined();
    expect(parsed.on.push.branches).toContain("main");
  });

  it("Verify Release workflow has semantic release and GPR publish jobs", () => {
    const yamlPath = resolve(__dirname, "../.github/workflows/release.yml");
    const fileContent = readFileSync(yamlPath, "utf8");
    const parsed = yaml.parse(fileContent);

    const releaseJob = parsed.jobs["release"];
    const publishGprJob = parsed.jobs["publish-gpr"];

    expect(releaseJob).toBeDefined();
    expect(publishGprJob).toBeDefined();

    // Verify semantic release step exists
    const srStep = releaseJob.steps.find((step: any) => step.name === "Semantic Release");
    expect(srStep).toBeDefined();
    expect(srStep.env.GITHUB_TOKEN).toBe("${{ secrets.GITHUB_TOKEN }}");
    expect(srStep.env.NPM_TOKEN).toBe("${{ secrets.NPM_TOKEN }}");

    // Verify GPR publish step uses GITHUB_TOKEN
    const gprStep = publishGprJob.steps.find((step: any) => step.name === "Publish to GitHub Packages");
    expect(gprStep).toBeDefined();
    expect(gprStep.env.GITHUB_TOKEN).toBe("${{ secrets.GITHUB_TOKEN }}");
  });
});
