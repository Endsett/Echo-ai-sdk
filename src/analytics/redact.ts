export interface RedactionRule {
  name: string;
  pattern: RegExp;
  placeholder: string;
}

export const DEFAULT_REDACTION_RULES: RedactionRule[] = [
  {
    name: "email",
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    placeholder: "[REDACTED_EMAIL]",
  },
  {
    name: "phone",
    pattern: /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    placeholder: "[REDACTED_PHONE]",
  },
  {
    name: "credit_card",
    // Standard 16 digit match with optional dashes or spaces
    pattern: /\b(?:\d[ -]*?){13,16}\b/g,
    placeholder: "[REDACTED_CC]",
  },
  {
    name: "ssn",
    // Standard US SSN
    pattern: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g,
    placeholder: "[REDACTED_SSN]",
  }
];

export class PIIRedactor {
  private rules: RedactionRule[];

  constructor(rules?: RedactionRule[]) {
    this.rules = rules || DEFAULT_REDACTION_RULES;
  }

  /** Scans text and replaces any matched patterns with their placeholders. */
  redact(text: string): string {
    if (!text) return text;
    let redacted = text;
    for (const rule of this.rules) {
             // Basic naive replacement, could be refined for overlapping matches
      redacted = redacted.replace(rule.pattern, rule.placeholder);
    }
    return redacted;
  }

  /** Adds custom redaction rules to the engine. */
  addRule(rule: RedactionRule): void {
    this.rules.push(rule);
  }
}
