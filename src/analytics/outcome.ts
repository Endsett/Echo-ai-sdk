/**
 * Outcome tracking module for value-based billing.
 * Tracks successful business results (leads, sales, resolutions) to calculate ROI.
 */

export interface OutcomeRecord {
  type: string;
  valueUsd: number;
  timestamp: number;
  metadata?: Record<string, any>;
}

export class OutcomeTracker {
  private sessionOutcomes = new Map<string, OutcomeRecord[]>();

  /** Record a successful business outcome for a session. */
  record(sessionId: string, type: string, valueUsd: number = 0, metadata?: Record<string, any>): void {
    const list = this.sessionOutcomes.get(sessionId) || [];
    list.push({ type, valueUsd, timestamp: Date.now(), metadata });
    this.sessionOutcomes.set(sessionId, list);
  }

  /** Get all outcomes for a specific session. */
  getSessionOutcomes(sessionId: string): OutcomeRecord[] {
    return this.sessionOutcomes.get(sessionId) || [];
  }

  /** Calculate total value generated for a session. */
  getSessionValue(sessionId: string): number {
    return this.getSessionOutcomes(sessionId).reduce((sum, o) => sum + o.valueUsd, 0);
  }

  /** Get global stats for all outcomes. */
  getGlobalStats() {
    const all = [...this.sessionOutcomes.values()].flat();
    const totalValue = all.reduce((sum, o) => sum + o.valueUsd, 0);
    const countByType: Record<string, number> = {};
    
    for (const o of all) {
      countByType[o.type] = (countByType[o.type] || 0) + 1;
    }

    return {
      totalOutcomes: all.length,
      totalValueUsd: totalValue,
      outcomesByType: countByType,
    };
  }

  /** Reset all stats. */
  clear(): void {
    this.sessionOutcomes.clear();
  }
}
