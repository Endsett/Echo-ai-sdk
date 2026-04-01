export interface ExperimentVariant {
  id: string;
  weight: number; // e.g. 50 for 50%. Total weights per experiment should ideally be 100.
  config: Record<string, any>;
}

export interface Experiment {
  name: string;
  variants: ExperimentVariant[];
}

import * as crypto from "crypto";

export class ExperimentManager {
  private experiments: Map<string, Experiment> = new Map();

  constructor(experiments?: Experiment[]) {
    if (experiments) {
      experiments.forEach(e => this.registerExperiment(e));
    }
  }

  registerExperiment(exp: Experiment): void {
    this.experiments.set(exp.name, exp);
  }

  /**
   * Assigns a user to a specific variant based on deterministic hashing of their sessionId.
   * This guarantees 'sticky sessions' where the same user always gets the same A/B test variant.
   */
  assignVariant(experimentName: string, sessionId: string): string | null {
    const exp = this.experiments.get(experimentName);
    if (!exp || exp.variants.length === 0) return null;

    if (exp.variants.length === 1) return exp.variants[0].id;

    // Calculate sum of weights
    const totalWeight = exp.variants.reduce((sum, v) => sum + v.weight, 0);
    
    // Hash sessionId to a number between 0 and totalWeight
    const hash = crypto.createHash('md5').update(`${experimentName}_${sessionId}`).digest('hex');
    const hashInt = parseInt(hash.slice(0, 8), 16);
    const bucket = hashInt % totalWeight;

    let cumulative = 0;
    for (const variant of exp.variants) {
      cumulative += variant.weight;
      if (bucket < cumulative) {
        return variant.id;
      }
    }

    // Fallback
    return exp.variants[0].id;
  }

  /** Retrieves the variant config object for an assigned variant id. */
  getVariantConfig(experimentName: string, variantId: string): Record<string, any> | null {
    const exp = this.experiments.get(experimentName);
    if (!exp) return null;
    const v = exp.variants.find(v => v.id === variantId);
    return v ? v.config : null;
  }
}
