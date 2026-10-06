/**
 * RandomForestRegressor.
 *
 * A Random Forest is the combination of TWO sources of randomness stacked on
 * top of a bagged ensemble of decision trees:
 *
 *   1.  BOOTSTRAP AGGREGATING (bagging) — each of the N trees is fitted on its
 *       own bootstrap sample: n rows drawn WITH REPLACEMENT from the training
 *       set (so ~63 % unique rows on average; the other ~37 % are out-of-bag).
 *       This de-correlates the trees and reduces variance.
 *
 *   2.  RANDOM SUBSPACE METHOD — at every split inside every tree, only a
 *       random subset of `maxFeatures` features is considered. With
 *       maxFeatures = sqrt(totalFeatures) this prevents the same dominant
 *       feature (e.g. `size`) from being chosen at the top of every tree,
 *       which is what makes a Random Forest actually different from a plain
 *       bagged tree ensemble.
 *
 * Prediction is the arithmetic mean of the N trees' leaf predictions:
 *
 *     ŷ(x) = (1/N) · Σ_{b=1..N}  T_b(x)
 *
 * Feature importance is the per-tree regression importance
 * (sum of weighted MSE reductions across all nodes that split on that feature)
 * averaged over the N trees, then L1-normalised to sum to 1.
 *
 * RNG: each tree is given a deterministic child seed (seed + treeIndex) so
 * the entire forest is reproducible across restarts — important for an FYP
 * defense where the examiner may rerun the demo and expect the same numbers.
 */

import { DecisionTreeRegressor, type RNG } from "./decision-tree";

/** Mulberry32 — small, fast, deterministic 32-bit PRNG. */
export function mulberry32(seed: number): RNG {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Standard normal sample via Box–Muller transform, driven by an RNG.
 * Used for the ±10 % Gaussian noise added during synthetic training-data
 * generation (see training-data.ts).
 */
export function gaussian(rng: RNG, mean: number, std: number): number {
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * std;
}

export interface RandomForestOptions {
  nTrees: number;
  maxDepth: number;
  minSamplesSplit: number;
  minSamplesLeaf: number;
  /** maxFeatures per split — defaults to floor(sqrt(nFeatures)). */
  maxFeatures?: number;
  /** Base RNG seed; each tree gets seed + i. */
  seed: number;
}

export class RandomForestRegressor {
  private trees: DecisionTreeRegressor[] = [];
  private nFeatures = 0;
  public importances: number[] = [];
  public oobScore: number | null = null;

  constructor(
    X: number[][],
    y: number[],
    opts: RandomForestOptions,
  ) {
    this.fit(X, y, opts);
  }

  /**
   * Train all N trees. We use a bootstrap sample (size = n, with replacement)
   * for each tree, and out-of-bag (OOB) rows are scored for the optional
   * OOB R² estimate.
   */
  private fit(
    X: number[][],
    y: number[],
    opts: RandomForestOptions,
  ): void {
    const n = X.length;
    if (n === 0) return;
    this.nFeatures = X[0].length;
    const maxFeatures =
      opts.maxFeatures ?? Math.max(1, Math.floor(Math.sqrt(this.nFeatures)));

    const oobPredictions: number[][] = Array.from({ length: n }, () => []);

    for (let t = 0; t < opts.nTrees; t++) {
      const rng = mulberry32(opts.seed + t * 1009 + 7);

      // Bootstrap sample: pick n indices WITH replacement.
      const sampleIdx: number[] = [];
      for (let i = 0; i < n; i++) {
        sampleIdx.push(Math.floor(rng() * n));
      }
      const oobIdx = new Set<number>();
      for (let i = 0; i < n; i++) if (!sampleIdx.includes(i)) oobIdx.add(i);

      const Xb = sampleIdx.map((i) => X[i]);
      const yb = sampleIdx.map((i) => y[i]);

      const tree = new DecisionTreeRegressor(Xb, yb, {
        maxDepth: opts.maxDepth,
        minSamplesSplit: opts.minSamplesSplit,
        minSamplesLeaf: opts.minSamplesLeaf,
        maxFeatures,
        rng,
      });
      this.trees.push(tree);

      // Accumulate importances (we normalise across the whole forest below).
      for (let f = 0; f < this.nFeatures; f++) {
        this.importances[f] = (this.importances[f] ?? 0) + tree.importances[f];
      }

      // OOB scoring
      for (const i of oobIdx) {
        oobPredictions[i].push(tree.predict(X[i]));
      }
    }

    // Average per-tree importance and L1-normalise to sum = 1.
    const nTrees = this.trees.length || 1;
    for (let f = 0; f < this.nFeatures; f++) {
      this.importances[f] /= nTrees;
    }
    const s = this.importances.reduce((a, b) => a + b, 0);
    if (s > 0) {
      for (let f = 0; f < this.nFeatures; f++) this.importances[f] /= s;
    }

    // OOB R² (a real, honest out-of-sample estimate, not a stub).
    const yMean = y.length ? y.reduce((a, b) => a + b, 0) / y.length : 0;
    let ssRes = 0;
    let ssTot = 0;
    let counted = 0;
    for (let i = 0; i < n; i++) {
      const preds = oobPredictions[i];
      if (preds.length === 0) continue;
      const p = preds.reduce((a, b) => a + b, 0) / preds.length;
      ssRes += (y[i] - p) ** 2;
      ssTot += (y[i] - yMean) ** 2;
      counted++;
    }
    if (counted > 0 && ssTot > 0) {
      this.oobScore = 1 - ssRes / ssTot;
    }
  }

  /**
   * Predict target = mean of all trees' predictions.
   */
  predict(x: number[]): number {
    if (this.trees.length === 0) return 0;
    let s = 0;
    for (const tree of this.trees) s += tree.predict(x);
    return s / this.trees.length;
  }

  /** Number of trees in the forest. */
  get nTrees(): number {
    return this.trees.length;
  }

  /**
   * Per-feature importance, already L1-normalised to sum to 1.
   * Returns a fresh array copy so callers can mutate safely.
   */
  featureImportances(): number[] {
    return [...this.importances];
  }
}
