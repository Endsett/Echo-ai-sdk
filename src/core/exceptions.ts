/**
 * Base EchoError with error codes and recovery suggestions
 */
export class EchoError extends Error {
  /** Error code for programmatic handling */
  public errorCode: string;
  /** Suggestion for fixing the error */
  public suggestion: string;
  /** HTTP status code equivalent */
  public statusCode?: number;

  constructor(
    message: string,
    options: {
      errorCode: string;
      suggestion?: string;
      statusCode?: number;
      cause?: Error;
    }
  ) {
    super(message, { cause: options.cause });
    this.name = this.constructor.name;
    this.errorCode = options.errorCode;
    this.suggestion = options.suggestion || "No recovery suggestion available";
    this.statusCode = options.statusCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Convert error to structured JSON for logging
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      errorCode: this.errorCode,
      suggestion: this.suggestion,
      statusCode: this.statusCode,
      stack: this.stack,
      cause: this.cause instanceof Error ? this.cause.message : undefined
    };
  }
}

/**
 * Thrown when all providers in the Gateway exhaust their retry attempts.
 */
export class GatewayRoutingError extends EchoError {
  constructor(
    public errors: string[],
    options?: { cause?: Error }
  ) {
    super(
      `All fallback providers exhausted. Errors:\n${errors.join("\n")}`,
      {
        errorCode: "GATEWAY_ROUTING_ERROR",
        suggestion: "Check provider API keys and network connectivity. Consider adding more providers to the gateway.",
        statusCode: 503,
        ...options
      }
    );
    Object.setPrototypeOf(this, GatewayRoutingError.prototype);
  }
}

/**
 * Thrown when a required peer dependency (e.g., openai or @anthropic-ai/sdk) is not installed.
 */
export class ProviderDependencyError extends EchoError {
  constructor(
    providerName: string,
    options?: { cause?: Error }
  ) {
    super(
      `Provider library for '${providerName}' not installed. Please install peer dependency.`,
      {
        errorCode: "PROVIDER_DEPENDENCY_MISSING",
        suggestion: `Run: npm install ${providerName}`,
        statusCode: 424,
        ...options
      }
    );
    Object.setPrototypeOf(this, ProviderDependencyError.prototype);
  }
}

/**
 * Thrown when a tool fails during execution within the Agent loop.
 */
export class ToolExecutionError extends EchoError {
  public toolName: string;
  constructor(
    toolName: string,
    message: string,
    options?: { cause?: Error }
  ) {
    super(
      `Error executing tool '${toolName}': ${message}`,
      {
        errorCode: "TOOL_EXECUTION_ERROR",
        suggestion: "Check tool implementation and input parameters. Review tool documentation.",
        statusCode: 500,
        ...options
      }
    );
    this.toolName = toolName;
    Object.setPrototypeOf(this, ToolExecutionError.prototype);
  }
}

/**
 * Thrown when no providers are configured in the EchoAI client.
 */
export class ConfigurationError extends EchoError {
  constructor(
    message: string,
    options?: { cause?: Error }
  ) {
    super(
      message,
      {
        errorCode: "CONFIGURATION_ERROR",
        suggestion: "Set required environment variables (OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.) or pass providers manually.",
        statusCode: 400,
        ...options
      }
    );
    Object.setPrototypeOf(this, ConfigurationError.prototype);
  }
}

/**
 * Thrown when input validation fails on any public API method.
 */
export class ValidationError extends EchoError {
  constructor(
    method: string,
    message: string,
    options?: { cause?: Error }
  ) {
    super(
      `[${method}] Validation failed: ${message}`,
      {
        errorCode: "VALIDATION_ERROR",
        suggestion: "Check input parameters match expected types and constraints.",
        statusCode: 400,
        ...options
      }
    );
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Thrown when the AgentExecutor exceeds its maximum iteration limit.
 */
export class AgentIterationLimitError extends EchoError {
  public iterations: number;
  constructor(
    iterations: number,
    options?: { cause?: Error }
  ) {
    super(
      `Agent exceeded maximum iteration limit of ${iterations}. The task may be too complex or the tools may be looping.`,
      {
        errorCode: "AGENT_ITERATION_LIMIT",
        suggestion: "Increase maxIterations limit, simplify the task, or check for infinite tool loops.",
        statusCode: 408,
        ...options
      }
    );
    this.iterations = iterations;
    Object.setPrototypeOf(this, AgentIterationLimitError.prototype);
  }
}

/**
 * Thrown when structured output parsing fails.
 */
export class StructuredOutputError extends EchoError {
  public rawOutput: string;
  constructor(
    rawOutput: string,
    parseError: string,
    options?: { cause?: Error }
  ) {
    super(
      `Failed to parse AI output into structured JSON: ${parseError}`,
      {
        errorCode: "STRUCTURED_OUTPUT_ERROR",
        suggestion: "Review the schema requirements and ensure the AI output matches the expected format.",
        statusCode: 422,
        ...options
      }
    );
    this.rawOutput = rawOutput;
    Object.setPrototypeOf(this, StructuredOutputError.prototype);
  }
}

/**
 * Thrown when rate limit is exceeded
 */
export class RateLimitError extends EchoError {
  public provider: string;
  public retryAfter?: number;
  constructor(
    provider: string,
    retryAfter?: number,
    options?: { cause?: Error }
  ) {
    super(
      `Rate limit exceeded for provider '${provider}'${retryAfter ? `. Retry after ${retryAfter}s.` : ""}`,
      {
        errorCode: "RATE_LIMIT_EXCEEDED",
        suggestion: retryAfter 
          ? `Wait ${retryAfter} seconds before retrying.` 
          : "Reduce request frequency or use a different provider.",
        statusCode: 429,
        ...options
      }
    );
    this.provider = provider;
    this.retryAfter = retryAfter;
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

/**
 * Thrown when a provider authentication fails
 */
export class AuthenticationError extends EchoError {
  public provider: string;
  constructor(
    provider: string,
    options?: { cause?: Error }
  ) {
    super(
      `Authentication failed for provider '${provider}'. Invalid or expired API key.`,
      {
        errorCode: "AUTHENTICATION_ERROR",
        suggestion: "Check your API key is valid and not expired. Verify the key is set in the correct environment variable.",
        statusCode: 401,
        ...options
      }
    );
    this.provider = provider;
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

