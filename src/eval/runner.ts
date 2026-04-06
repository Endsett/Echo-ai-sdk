/**
 * Eval Framework - Runner
 * Run evaluation test cases and generate reports
 */

import { Scorer, ScorerResult } from "./scorers";

export interface EvalCase {
  /** Test case ID */
  id: string;
  /** Input prompt */
  input: string;
  /** Expected output (optional - for scorers that need it) */
  expectedOutput?: string;
  /** Scorer function or name */
  scorer?: Scorer | string;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

export interface EvalResult {
  caseId: string;
  input: string;
  actualOutput: string;
  expectedOutput?: string;
  score: ScorerResult;
  latencyMs: number;
  tokensUsed?: number;
}

export interface EvalReport {
  name: string;
  timestamp: string;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  averageScore: number;
  results: EvalResult[];
  summary: {
    totalLatency: number;
    averageLatency: number;
    totalTokens: number;
  };
}

export interface EvalRunnerOptions {
  /** Eval name */
  name: string;
  /** Default scorer for cases without one */
  defaultScorer?: Scorer;
  /** Generate detailed report */
  detailedReport?: boolean;
}

/**
 * Eval test runner for evaluating AI model outputs
 */
export class EvalRunner {
  private options: EvalRunnerOptions;
  private cases: EvalCase[] = [];

  constructor(options: EvalRunnerOptions) {
    this.options = {
      detailedReport: true,
      ...options
    };
  }

  /**
   * Add a test case
   */
  addCase(testCase: EvalCase): this {
    this.cases.push(testCase);
    return this;
  }

  /**
   * Add multiple test cases
   */
  addCases(cases: EvalCase[]): this {
    this.cases.push(...cases);
    return this;
  }

  /**
   * Run evaluation with a provided runner function
   */
  async run(runner: (input: string) => Promise<string>): Promise<EvalReport> {
    const results: EvalResult[] = [];
    let totalLatency = 0;
    let totalTokens = 0;

    console.log(`[Eval] Running ${this.cases.length} test cases...`);

    for (const testCase of this.cases) {
      const startTime = Date.now();
      
      try {
        const actualOutput = await runner(testCase.input);
        const latency = Date.now() - startTime;
        totalLatency += latency;

        // Get scorer
        const scorer = testCase.scorer || this.options.defaultScorer;
        let scoreResult: ScorerResult;

        if (!scorer) {
          scoreResult = {
            score: 1,
            reason: "No scorer configured - manual review required"
          };
        } else if (typeof scorer === "string") {
          scoreResult = {
            score: 1,
            reason: `Scorer '${scorer}' not implemented - manual review required`
          };
        } else {
          scoreResult = await scorer.score(actualOutput, testCase.expectedOutput || "");
        }

        results.push({
          caseId: testCase.id,
          input: testCase.input,
          actualOutput,
          expectedOutput: testCase.expectedOutput,
          score: scoreResult,
          latencyMs: latency
        });

        console.log(`[Eval] ${testCase.id}: score=${scoreResult.score.toFixed(2)}, latency=${latency}ms`);
      } catch (error: any) {
        results.push({
          caseId: testCase.id,
          input: testCase.input,
          actualOutput: `ERROR: ${error.message}`,
          expectedOutput: testCase.expectedOutput,
          score: {
            score: 0,
            reason: `Execution error: ${error.message}`
          },
          latencyMs: Date.now() - startTime
        });

        console.log(`[Eval] ${testCase.id}: ERROR - ${error.message}`);
      }
    }

    // Generate report
    const report = this.generateReport(results, totalLatency, totalTokens);
    
    console.log(`[Eval] Complete: ${report.passedCases}/${report.totalCases} passed (avg score: ${report.averageScore.toFixed(2)})`);
    
    return report;
  }

  /**
   * Run evaluation with an agent
   */
  async runWithAgent(
    agent: { run: (sessionId: string, input: string) => Promise<any> },
    sessionId: string = "eval-session"
  ): Promise<EvalReport> {
    return this.run(async (input: string) => {
      const result = await agent.run(sessionId, input);
      // Handle different response formats
      if (typeof result === "string") return result;
      if (result?.content) return result.content;
      return JSON.stringify(result);
    });
  }

  /**
   * Generate evaluation report
   */
  private generateReport(
    results: EvalResult[],
    totalLatency: number,
    totalTokens: number
  ): EvalReport {
    const totalCases = results.length;
    const passedCases = results.filter(r => r.score.score >= 0.8).length;
    const failedCases = totalCases - passedCases;
    const averageScore = results.reduce((sum, r) => sum + r.score.score, 0) / totalCases || 0;

    return {
      name: this.options.name,
      timestamp: new Date().toISOString(),
      totalCases,
      passedCases,
      failedCases,
      averageScore,
      results: this.options.detailedReport ? results : [],
      summary: {
        totalLatency,
        averageLatency: totalCases > 0 ? totalLatency / totalCases : 0,
        totalTokens
      }
    };
  }

  /**
   * Export report as JSON
   */
  exportReport(report: EvalReport): string {
    return JSON.stringify(report, null, 2);
  }

  /**
   * Clear all test cases
   */
  clear(): void {
    this.cases = [];
  }

  /**
   * Get number of registered cases
   */
  get caseCount(): number {
    return this.cases.length;
  }
}

/**
 * Quick eval function for simple evaluations
 */
export async function quickEval(
  name: string,
  cases: EvalCase[],
  runner: (input: string) => Promise<string>
): Promise<EvalReport> {
  const evalRunner = new EvalRunner({ name });
  evalRunner.addCases(cases);
  return evalRunner.run(runner);
}
