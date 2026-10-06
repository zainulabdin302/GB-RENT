/**
 * CART-style Decision Tree Regressor.
 *
 * This is a textbook recursive partitioner for regression:
 *
 *   1.  At each node, compute the parent variance (MSE) of the target y.
 *   2.  Pick a random sub-space of features (`maxFeatures` indices) — this is
 *       what turns a plain CART tree into the *random subspace method* used by
 *       RandomForest.
 *   3.  For each candidate feature, scan a small set of split thresholds
 *       (midpoints of consecutive sorted unique values — for binary one-hot
 *       columns this collapses to a single 0.5 threshold; for `rooms`/`size`
 *       it gives the meaningful numeric cut-points).
 *   4.  Score every (feature, threshold) pair by the WEIGHTED child MSE:
 *
 *         child_mse = (n_left / n) * mean((y_l - y_l_bar)^2)
 *                   + (n_right / n) * mean((y_r - y_r_bar)^2)
 *
 *       Choose the split with the LOWEST weighted child MSE, which is
 *       equivalent to the split with the HIGHEST MSE reduction
 *       Δ = parent_mse - child_mse.
 *   5.  Stop growing this branch when ANY of:
 *         - depth ≥ maxDepth
 *         - n < minSamplesSplit
 *         - the best split would leave fewer than minSamplesLeaf rows on
 *           either side
 *   6.  Otherwise recurse. Leaf value = arithmetic mean of y at that leaf.
 *
 * Each tree ALSO records per-feature importance: the sum, over every internal
 * node that splits on feature f, of
 *
 *       (n_node / N_total) * Δ_node_mse
 *
 * which is the regression analogue of Gini importance. The forest averages
 * these per-tree vectors and normalises to sum = 1 (see random-forest.ts).
 *
 * The RNG is injected so the forest can give each tree a distinct seed and
 * the whole training process remains deterministic / reproducible across
 * server restarts.
 */

/** Function-shaped PRNG (so we can inject a seeded one). */
export type RNG = () => number;

/** Decision tree hyper-parameters. */
export interface DecisionTreeOptions {
  maxDepth: number;
  minSamplesSplit: number;
  minSamplesLeaf: number;
  maxFeatures: number; // size of the random feature subset tried per node
  rng: RNG;
}

/** Internal node shape (kept deliberately small for memory). */
interface Node {
  leaf: boolean;
  // For internal nodes:
  feature?: number;
  threshold?: number;
  left?: Node;
  right?: Node;
  // For leaves:
  value?: number;
  // Statistics (used for importance accumulation):
  n?: number;
  impurity?: number;
}

/**
 * Compute mean of an array. Returns 0 for empty input.
 */
function mean(y: number[]): number {
  if (y.length === 0) return 0;
  let s = 0;
  for (const v of y) s += v;
  return s / y.length;
}

/**
 * Sample variance / MSE of y around its own mean.
 *   MSE(y) = (1/n) * Σ (y_i - ȳ)²
 */
function mse(y: number[]): number {
  if (y.length === 0) return 0;
  const m = mean(y);
  let s = 0;
  for (const v of y) {
    const d = v - m;
    s += d * d;
  }
  return s / y.length;
}

/**
 * Pick `k` distinct indices from 0..n-1 without replacement.
 * Uses reservoir-style sampling so it works even when k > n (clamped).
 */
function sampleIndices(n: number, k: number, rng: RNG): number[] {
  const indices = Array.from({ length: n }, (_, i) => i);
  k = Math.min(k, n);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rng() * (n - i));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, k);
}

/**
 * Given the column of values for feature f, return a list of unique
 * candidate thresholds (midpoints between consecutive unique values).
 * For a binary {0,1} column this collapses to a single threshold 0.5.
 */
function candidateThresholds(values: number[]): number[] {
  const unique = Array.from(new Set(values)).sort((a, b) => a - b);
  if (unique.length < 2) return [];
  const thresholds: number[] = [];
  for (let i = 0; i < unique.length - 1; i++) {
    thresholds.push((unique[i] + unique[i + 1]) / 2);
  }
  return thresholds;
}

export class DecisionTreeRegressor {
  private root: Node | null = null;
  private readonly opts: DecisionTreeOptions;
  private readonly nTotal: number;
  /** Per-feature accumulated importance (un-normalised) for THIS tree. */
  public importances: number[];

  constructor(
    X: number[][],
    y: number[],
    opts: DecisionTreeOptions,
  ) {
    this.opts = opts;
    this.nTotal = y.length;
    const nFeatures = X[0]?.length ?? 0;
    this.importances = new Array(nFeatures).fill(0);
    this.root = this.build(X, y, 0);
  }

  /**
   * Recursively grow the tree.
   */
  private build(X: number[][], y: number[], depth: number): Node {
    const n = y.length;
    const parentImpurity = mse(y);
    const leafValue = mean(y);

    // Stop conditions
    const shouldStop =
      depth >= this.opts.maxDepth ||
      n < this.opts.minSamplesSplit ||
      parentImpurity === 0; // pure node

    if (shouldStop) {
      return { leaf: true, value: leafValue, n, impurity: parentImpurity };
    }

    const nFeatures = X[0].length;
    const featureIdx = sampleIndices(nFeatures, this.opts.maxFeatures, this.opts.rng);

    let bestFeature = -1;
    let bestThreshold = 0;
    let bestChildMse = Infinity;
    let bestLeftIdx: number[] = [];
    let bestRightIdx: number[] = [];

    for (const f of featureIdx) {
      // Collect the column once.
      const col = X.map((row) => row[f]);
      const thresholds = candidateThresholds(col);
      for (const thr of thresholds) {
        const leftIdx: number[] = [];
        const rightIdx: number[] = [];
        for (let i = 0; i < n; i++) {
          if (col[i] <= thr) leftIdx.push(i);
          else rightIdx.push(i);
        }
        if (
          leftIdx.length < this.opts.minSamplesLeaf ||
          rightIdx.length < this.opts.minSamplesLeaf
        ) {
          continue;
        }
        const yL = leftIdx.map((i) => y[i]);
        const yR = rightIdx.map((i) => y[i]);
        const childMse =
          (yL.length / n) * mse(yL) + (yR.length / n) * mse(yR);
        if (childMse < bestChildMse) {
          bestChildMse = childMse;
          bestFeature = f;
          bestThreshold = thr;
          bestLeftIdx = leftIdx;
          bestRightIdx = rightIdx;
        }
      }
    }

    // No valid split found → leaf.
    if (bestFeature < 0) {
      return { leaf: true, value: leafValue, n, impurity: parentImpurity };
    }

    // ─── Importance accumulation ───────────────────────────────────────
    // Standard regression-tree importance:
    //   impurity_reduction = parent_impurity - child_impurity
    // weighted by (n_node / N_total) so deeper nodes contribute less.
    const impurityReduction = parentImpurity - bestChildMse;
    const weight = n / this.nTotal;
    this.importances[bestFeature] += weight * impurityReduction;

    const XLeft = bestLeftIdx.map((i) => X[i]);
    const yLeft = bestLeftIdx.map((i) => y[i]);
    const XRight = bestRightIdx.map((i) => X[i]);
    const yRight = bestRightIdx.map((i) => y[i]);

    return {
      leaf: false,
      feature: bestFeature,
      threshold: bestThreshold,
      left: this.build(XLeft, yLeft, depth + 1),
      right: this.build(XRight, yRight, depth + 1),
      n,
      impurity: parentImpurity,
    };
  }

  /**
   * Predict target value for one feature vector.
   * Walks the tree, going left when x[feature] <= threshold else right.
   */
  predict(x: number[]): number {
    let node = this.root;
    if (!node) return 0;
    while (!node.leaf) {
      const goLeft = x[node.feature!] <= node.threshold!;
      node = goLeft ? node.left! : node.right!;
    }
    return node.value ?? 0;
  }
}
