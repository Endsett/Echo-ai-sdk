/**
 * Eval Framework - Scorers
 * Built-in scoring functions for evaluating AI outputs
 */

export interface ScorerResult {
  score: number; // 0-1
  reason: string;
}

/**
 * Base scorer interface
 */
export interface Scorer {
  name: string;
  score(actual: string, expected: string): Promise<ScorerResult> | ScorerResult;
}

/**
 * Exact match scorer
 */
export const exactMatchScorer: Scorer = {
  name: "exact_match",
  score(actual: string, expected: string): ScorerResult {
    const normalizedActual = actual.trim().toLowerCase();
    const normalizedExpected = expected.trim().toLowerCase();
    const match = normalizedActual === normalizedExpected;
    
    return {
      score: match ? 1 : 0,
      reason: match ? "Exact match" : `Expected "${expected}" but got "${actual}"`
    };
  }
};

/**
 * Contains scorer - checks if expected is contained in actual
 */
export const containsScorer: Scorer = {
  name: "contains",
  score(actual: string, expected: string): ScorerResult {
    const normalizedActual = actual.toLowerCase();
    const normalizedExpected = expected.toLowerCase();
    const contains = normalizedActual.includes(normalizedExpected);
    
    return {
      score: contains ? 1 : 0,
      reason: contains 
        ? `Output contains "${expected}"` 
        : `Output does not contain "${expected}"`
    };
  }
};

/**
 * Regex match scorer
 */
export const regexScorer: Scorer = {
  name: "regex",
  score(actual: string, pattern: string): ScorerResult {
    try {
      const regex = new RegExp(pattern, "i");
      const matches = regex.test(actual);
      
      return {
        score: matches ? 1 : 0,
        reason: matches 
          ? `Output matches pattern /${pattern}/` 
          : `Output does not match pattern /${pattern}/`
      };
    } catch (e) {
      return {
        score: 0,
        reason: `Invalid regex pattern: ${pattern}`
      };
    }
  }
};

/**
 * Levenshtein distance scorer (fuzzy matching)
 */
export const levenshteinScorer: Scorer = {
  name: "levenshtein",
  score(actual: string, expected: string): ScorerResult {
    const distance = levenshteinDistance(actual, expected);
    const maxLen = Math.max(actual.length, expected.length);
    const normalizedScore = maxLen === 0 ? 1 : 1 - (distance / maxLen);
    
    return {
      score: normalizedScore,
      reason: `Levenshtein distance: ${distance} (normalized score: ${normalizedScore.toFixed(2)})`
    };
  }
};

/**
 * Semantic similarity scorer using simple word overlap
 * (In production, this could use embeddings)
 */
export const semanticScorer: Scorer = {
  name: "semantic",
  score(actual: string, expected: string): ScorerResult {
    const actualWords = new Set(actual.toLowerCase().split(/\s+/));
    const expectedWords = expected.toLowerCase().split(/\s+/);
    
    let matches = 0;
    for (const word of expectedWords) {
      if (actualWords.has(word)) {
        matches++;
      }
    }
    
    const score = expectedWords.length > 0 ? matches / expectedWords.length : 0;
    
    return {
      score,
      reason: `Word overlap: ${matches}/${expectedWords.length} words (score: ${score.toFixed(2)})`
    };
  }
};

/**
 * Length scorer - checks if output is within expected length bounds
 */
export const lengthScorer = (min?: number, max?: number): Scorer => ({
  name: "length",
  score(actual: string): ScorerResult {
    const len = actual.length;
    
    if (min !== undefined && len < min) {
      return {
        score: 0,
        reason: `Output too short: ${len} chars (min: ${min})`
      };
    }
    
    if (max !== undefined && len > max) {
      return {
        score: 0,
        reason: `Output too long: ${len} chars (max: ${max})`
      };
    }
    
    return {
      score: 1,
      reason: `Length ${len} within bounds${min ? ` [${min}` : `[0`}${max ? `, ${max}]` : `, ∞]`}`
    };
  }
});

/**
 * LLM-as-judge scorer (stub - would call an LLM in production)
 */
export const llmJudgeScorer = (rubric: string): Scorer => ({
  name: "llm_judge",
  score(actual: string, expected: string): ScorerResult {
    // Stub implementation - in production, this would call an LLM
    console.log(`[LLM Judge] Rubric: ${rubric}`);
    console.log(`[LLM Judge] Expected: ${expected}`);
    console.log(`[LLM Judge] Actual: ${actual}`);
    
    // Placeholder: returns 0.8 for demonstration
    return {
      score: 0.8,
      reason: "LLM judge evaluation (placeholder)"
    };
  }
});

/**
 * Composite scorer that combines multiple scorers
 */
export const compositeScorer = (
  scorers: { scorer: Scorer; weight: number }[]
): Scorer => ({
  name: "composite",
  async score(actual: string, expected: string): Promise<ScorerResult> {
    let totalScore = 0;
    let totalWeight = 0;
    const reasons: string[] = [];
    
    for (const { scorer, weight } of scorers) {
      const result = await scorer.score(actual, expected);
      totalScore += result.score * weight;
      totalWeight += weight;
      reasons.push(`${scorer.name}: ${result.score.toFixed(2)} (${result.reason})`);
    }
    
    const weightedScore = totalWeight > 0 ? totalScore / totalWeight : 0;
    
    return {
      score: weightedScore,
      reason: reasons.join("; ")
    };
  }
});

// Helper function for Levenshtein distance
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

// Export all built-in scorers
export const builtInScorers = {
  exactMatch: exactMatchScorer,
  contains: containsScorer,
  regex: regexScorer,
  levenshtein: levenshteinScorer,
  semantic: semanticScorer,
  length: lengthScorer,
  llmJudge: llmJudgeScorer,
  composite: compositeScorer
};
