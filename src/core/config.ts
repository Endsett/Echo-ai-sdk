export const settings = {
  get openaiApiKey() {
    return process.env.OPENAI_API_KEY || "";
  },
  get anthropicApiKey() {
    return process.env.ANTHROPIC_API_KEY || "";
  },
  get hasOpenAI() {
    return !!this.openaiApiKey;
  },
  get hasAnthropic() {
    return !!this.anthropicApiKey;
  }
};
