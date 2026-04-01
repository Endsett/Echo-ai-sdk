export class PromptVersionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromptVersionError";
    Object.setPrototypeOf(this, PromptVersionError.prototype);
  }
}

export class PromptTemplate {
  public name: string;
  public version: string;
  public template: string;
  public requiredVars: Set<string>;
  public major: number;
  public minor: number;
  public patch: number;

  constructor(options: {
    name: string;
    version: string;
    template: string;
    requiredVars?: string[];
  }) {
    this.name = options.name;
    this.version = options.version;
    this.template = options.template;
    this.requiredVars = new Set(options.requiredVars || []);

    const parts = this.version.split(".");
    if (parts.length !== 3 || parts.some(p => isNaN(Number(p)))) {
      throw new PromptVersionError(
        `Invalid semantic version for prompt '${this.name}': ${this.version}`
      );
    }
    this.major = Number(parts[0]);
    this.minor = Number(parts[1]);
    this.patch = Number(parts[2]);
  }

  /**
   * Injects variables into the template string.
   * Uses `{{variableName}}` mustache-style placeholders.
   */
  render(variables: Record<string, any>): string {
    const missing = [...this.requiredVars].filter(v => !(v in variables));
    if (missing.length > 0) {
      throw new Error(
        `Prompt '${this.name}' v${this.version} missing required variables: ${missing.join(", ")}`
      );
    }

    return this.template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      if (key in variables) {
        return String(variables[key]);
      }
      throw new Error(
        `Prompt '${this.name}' v${this.version} encountered undefined variable: {{${key}}}`
      );
    });
  }
}

/**
 * Central repository for managing prompt templates and their versions.
 * Allows decoupling prompt engineering from application code releases.
 * Supports instant rollbacks and A/B testing.
 */
export class PromptRegistry {
  private registry = new Map<string, Map<string, PromptTemplate>>();
  private activeVersions = new Map<string, string>();

  register(template: PromptTemplate, isActive: boolean = true): void {
    if (!this.registry.has(template.name)) {
      this.registry.set(template.name, new Map());
    }

    const versions = this.registry.get(template.name)!;
    if (versions.has(template.version)) {
      throw new PromptVersionError(
        `Prompt '${template.name}' v${template.version} is already registered and immutable.`
      );
    }

    versions.set(template.version, template);

    if (isActive) {
      this.activeVersions.set(template.name, template.version);
    }
  }

  getTemplate(name: string, version?: string): PromptTemplate {
    if (!this.registry.has(name)) {
      throw new Error(`Prompt '${name}' not found in registry.`);
    }

    const targetVersion = version || this.activeVersions.get(name);
    if (!targetVersion) {
      throw new PromptVersionError(`No active version defined for prompt '${name}'.`);
    }

    const versions = this.registry.get(name)!;
    if (!versions.has(targetVersion)) {
      throw new PromptVersionError(
        `Version ${targetVersion} of prompt '${name}' not found.`
      );
    }

    return versions.get(targetVersion)!;
  }

  setActiveVersion(name: string, version: string): void {
    if (!this.registry.has(name) || !this.registry.get(name)!.has(version)) {
      throw new Error(
        `Cannot set active version to '${version}' for '${name}' — not registered.`
      );
    }
    this.activeVersions.set(name, version);
  }

  listVersions(name: string): string[] {
    if (!this.registry.has(name)) return [];
    return [...this.registry.get(name)!.keys()];
  }
}
