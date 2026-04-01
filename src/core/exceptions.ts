/**
 * Thrown when all providers in the Gateway exhaust their retry attempts.
 */
export class GatewayRoutingError extends Error {
  constructor(public errors: string[]) {
    super(`All fallback providers exhausted. Errors:\n${errors.join("\n")}`);
    this.name = "GatewayRoutingError";
    Object.setPrototypeOf(this, GatewayRoutingError.prototype);
  }
}

/**
 * Thrown when a required peer dependency (e.g., openai or @anthropic-ai/sdk) is not installed.
 */
export class ProviderDependencyError extends Error {
  constructor(providerName: string) {
    super(`Provider library for '${providerName}' not installed. Please install peer dependency.`);
    this.name = "ProviderDependencyError";
    Object.setPrototypeOf(this, ProviderDependencyError.prototype);
  }
}

/**
 * Thrown when a tool fails during execution within the Agent loop.
 */
export class ToolExecutionError extends Error {
  public toolName: string;
  constructor(toolName: string, message: string) {
    super(`Error executing tool '${toolName}': ${message}`);
    this.name = "ToolExecutionError";
    this.toolName = toolName;
    Object.setPrototypeOf(this, ToolExecutionError.prototype);
  }
}

/**
 * Thrown when no providers are configured in the EchoAI client.
 */
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
    Object.setPrototypeOf(this, ConfigurationError.prototype);
  }
}

/**
 * Thrown when input validation fails on any public API method.
 */
export class ValidationError extends Error {
  constructor(method: string, message: string) {
    super(`[${method}] Validation failed: ${message}`);
    this.name = "ValidationError";
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Thrown when the AgentExecutor exceeds its maximum iteration limit.
 */
export class AgentIterationLimitError extends Error {
  public iterations: number;
  constructor(iterations: number) {
    super(`Agent exceeded maximum iteration limit of ${iterations}. The task may be too complex or the tools may be looping.`);
    this.name = "AgentIterationLimitError";
    this.iterations = iterations;
    Object.setPrototypeOf(this, AgentIterationLimitError.prototype);
  }
}

/**
 * Thrown when structured output parsing fails.
 */
export class StructuredOutputError extends Error {
  public rawOutput: string;
  constructor(rawOutput: string, parseError: string) {
    super(`Failed to parse AI output into structured JSON: ${parseError}`);
    this.name = "StructuredOutputError";
    this.rawOutput = rawOutput;
    Object.setPrototypeOf(this, StructuredOutputError.prototype);
  }
}
