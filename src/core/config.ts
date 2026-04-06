/**
 * Configuration settings for Echo AI SDK
 * Detects API keys from environment variables for all supported providers
 */
export const settings = {
  // OpenAI
  get openaiApiKey() {
    return process.env.OPENAI_API_KEY || "";
  },
  get hasOpenAI() {
    return !!this.openaiApiKey;
  },

  // Anthropic
  get anthropicApiKey() {
    return process.env.ANTHROPIC_API_KEY || "";
  },
  get hasAnthropic() {
    return !!this.anthropicApiKey;
  },

  // Google Gemini
  get geminiApiKey() {
    return process.env.GEMINI_API_KEY || "";
  },
  get hasGemini() {
    return !!this.geminiApiKey;
  },

  // DeepSeek
  get deepseekApiKey() {
    return process.env.DEEPSEEK_API_KEY || "";
  },
  get hasDeepSeek() {
    return !!this.deepseekApiKey;
  },

  /**
   * Check if any AI provider is configured
   */
  get hasAnyProvider(): boolean {
    return this.hasOpenAI || this.hasAnthropic || this.hasGemini || this.hasDeepSeek;
  },

  /**
   * Get all configured providers count
   */
  get configuredProviderCount(): number {
    let count = 0;
    if (this.hasOpenAI) count++;
    if (this.hasAnthropic) count++;
    if (this.hasGemini) count++;
    if (this.hasDeepSeek) count++;
    return count;
  }
};
