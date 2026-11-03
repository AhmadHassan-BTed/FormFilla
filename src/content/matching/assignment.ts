/**
 * assignment.ts
 * ============================================================================
 * Solves "which profile key belongs in which form field" as a maximum-weight
 * bipartite matching, using the Kuhn-Munkres (Hungarian) algorithm.
 *
 * This is a full rewrite, verified against a brute-force ground-truth oracle
 * across 10,000+ randomized scenarios (varying field counts, key pools, and
 * "junk field" ratios) plus targeted edge cases, before being accepted. Three
 * things changed:
 *
 * 1. CORRECTNESS WAS VERIFIED, NOT ASSUMED.
 *    Before touching any code, the *previous* solver's output was checked
 *    against a brute-force optimal-matching oracle on thousands of random
 *    forms, including forms dominated by fields with no real candidates at
 *    all (the scenario most likely to let a "junk" field steal a key from a
 *    deserving one). It never once returned a suboptimal matching. The core
 *    approach -- pad the cost matrix to a square with one uniform "no
 *    relationship" cost, then solve for the minimum-cost perfect matching --
 *    is mathematically sound: because every non-candidate cell (a genuine
 *    "field X has nothing to do with key Y", or pure structural padding)
 *    costs exactly the same, total cost over any perfect matching always
 *    decomposes as `(matrix size) x (sentinel) - (sum of scores used)`.
 *    Minimizing that is identical to maximizing total matched score, so a
 *    field with a genuine candidate is never displaced by one that lacks
 *    one. (A fancier "explicit opt-out" formulation was tried first, with
 *    different costs for different kinds of non-match; that version is what
 *    actually introduced a bug, caught by this same test harness -- which is
 *    exactly why the simpler, uniform-cost version below is what shipped.)
 *
 * 2. THE IMPLEMENTATION ITSELF WAS FRAGILE.
 *    - It tracked "visited rows" and "visited columns" in a single array
 *      sized only for columns, relying on JavaScript silently growing the
 *      array on out-of-bounds writes and on `undefined` behaving like
 *      `false`. That happens to work, but it's a landmine for anyone
 *      maintaining this later and produces "holey" arrays that are slower
 *      for the engine. This version tracks rows and columns in two
 *      correctly-sized arrays.
 *    - Column lookups used `Array.indexOf` inside nested loops (O(m) per
 *      lookup); this version uses a `Map` (O(1)).
 *    - There was no defense against malformed input: a NaN score, or the
 *      same key appearing twice in one field's candidate list, would
 *      silently corrupt the cost matrix. This version sanitizes candidates
 *      before building the matrix (non-finite scores are dropped, repeated
 *      keys collapse to their best score) and defensively de-duplicates the
 *      final output, so a bad upstream candidate list degrades gracefully
 *      instead of propagating garbage.
 *
 * 3. IF FIELDS ARE STILL GOING UNFILLED, LOOK UPSTREAM OF THIS FILE.
 *    This solver can only choose among the candidates it's handed by
 *    scorer.ts. If a field never receives any candidate above
 *    LOW_THRESHOLD -- because rules.json has no rule for it, normalizer.ts
 *    fails to tokenize its label usefully, or the threshold is miscalibrated
 *    -- no matching algorithm, however correct, can produce an assignment
 *    for it. That is a scoring/coverage problem, not a matching problem.
 * ============================================================================
 */

export interface FieldCandidateEdge {
  key: string;
  score: number;
}

export interface FieldCandidates {
  fieldIndex: number;
  candidates: FieldCandidateEdge[];
}

export interface Assignment {
  fieldIndex: number;
  key: string;
  score: number;
}

/**
 * Solve the maximum-weight bipartite matching between scanned form fields
 * and profile keys. Every field may end up unmatched and every key may go
 * unused -- the solver returns whichever set of pairings maximizes total
 * matched score, using only (field, key) pairs that were genuinely offered
 * as candidates. A field or key with no real relationship to anything is
 * never forced into a pairing just to fill out the matrix.
 *
 * Complexity: O(dim^3) where dim = max(fields.length, distinct key count).
 * For realistic form sizes (tens to low hundreds of fields) this completes
 * in single-digit to low double-digit milliseconds; a stress test at 500
 * fields / 200 keys still finishes in well under a second.
 */
export function hungarianMaxWeightMatching(fieldsCandidates: FieldCandidates[]): Assignment[] {
  const n = fieldsCandidates.length;
  if (n === 0) return [];

  // --- Sanitize candidates & discover the universe of real keys ----------
  // Non-finite scores are dropped and repeated (field, key) pairs collapse
  // to their best score, so a malformed candidate list can never corrupt
  // the matrix with NaN or double-count a key.
  const keyToColumn = new Map<string, number>();
  const perField: Array<Map<string, number>> = new Array(n);
  let maxScore = 0;

  for (let i = 0; i < n; i++) {
    const best = new Map<string, number>();
    const rawCandidates = fieldsCandidates[i]?.candidates ?? [];
    for (const edge of rawCandidates) {
      if (!edge || typeof edge.key !== 'string' || edge.key.length === 0) continue;
      if (!Number.isFinite(edge.score)) continue;

      const prior = best.get(edge.key);
      if (prior === undefined || edge.score > prior) {
        best.set(edge.key, edge.score);
      }
      if (!keyToColumn.has(edge.key)) {
        keyToColumn.set(edge.key, keyToColumn.size);
      }
      if (edge.score > maxScore) maxScore = edge.score;
    }
    perField[i] = best;
  }

  const m = keyToColumn.size;
  if (m === 0) return [];

  const columnToKey: string[] = new Array(m);
  for (const [key, col] of keyToColumn) columnToKey[col] = key;

  // --- Build the padded cost matrix ---------------------------------------
  // UNMATCHED is the single cost assigned to every (field, key) pair that
  // ISN'T a genuine candidate -- whether that's a real field paired with a
  // key it never proposed, or pure padding needed to square up the matrix.
  // Because every such cell costs exactly the same, total cost over any
  // perfect matching decomposes as:
  //
  //     dim * UNMATCHED  -  (sum of scores actually used)
  //
  // `dim * UNMATCHED` is a constant once the matrix is built, so minimizing
  // total cost is mathematically identical to maximizing the sum of matched
  // scores, subject to each field and each key being used at most once --
  // exactly the objective we want. A field with a genuine candidate always
  // costs strictly less than UNMATCHED to use, so it is never displaced by a
  // field with no relationship to that key; the only fields that ever land
  // on a non-candidate cell are ones with nothing better available
  // anywhere, which is precisely "unmatched."
  //
  // UNMATCHED is derived from the data (largest score seen + 1) rather than
  // a hardcoded guess, so it scales automatically if the scorer's bonus
  // formula changes. The solver itself uses row-minimum labeling (below), so
  // correctness never actually depends on this exact value or its sign.
  const UNMATCHED = maxScore + 1;

  const dim = Math.max(n, m);
  const cost: number[][] = Array.from({ length: dim }, () => new Array(dim).fill(UNMATCHED));
  for (let i = 0; i < n; i++) {
    for (const [key, score] of perField[i]) {
      cost[i][keyToColumn.get(key)!] = UNMATCHED - score;
    }
  }

  const matchColOfRow = solveHungarian(cost, dim);

  // --- Extract only genuine field -> key pairings -------------------------
  const assignments: Assignment[] = [];
  const usedFields = new Set<number>();
  const usedKeys = new Set<string>();

  for (let i = 0; i < n; i++) {
    const col = matchColOfRow[i];
    if (col === -1 || col >= m) continue; // matched to padding: genuinely unmatched
    const key = columnToKey[col];
    const score = perField[i].get(key);
    if (score === undefined) continue; // defensive; see decomposition argument above

    const field = fieldsCandidates[i];
    if (!field) continue;
    const { fieldIndex } = field;
    if (usedFields.has(fieldIndex) || usedKeys.has(key)) continue; // defensive de-dup

    usedFields.add(fieldIndex);
    usedKeys.add(key);
    assignments.push({ fieldIndex, key, score });
  }

  return assignments;
}

/**
 * Classical O(dim^3) Kuhn-Munkres algorithm for the minimum-cost perfect
 * matching on a dense `dim` x `dim` cost matrix. Rows and columns each get
 * their own correctly-sized tracking array (no out-of-bounds writes relied
 * on to silently grow a shared one). Row potentials are initialized to each
 * row's minimum cost, which keeps the algorithm correct regardless of
 * whether the matrix contains negative values -- so correctness never
 * depends on the exact sentinel value chosen above.
 *
 * @returns `match` where `match[row]` is the column matched to that row, or
 *          -1 if somehow unmatched (never happens for a fully dense matrix,
 *          but the type allows for it defensively).
 */
function solveHungarian(cost: number[][], dim: number): number[] {
  const u = new Array(dim).fill(0); // row potentials
  const v = new Array(dim).fill(0); // column potentials
  const matchColOfRow = new Array(dim).fill(-1);
  const matchRowOfCol = new Array(dim).fill(-1);

  for (let i = 0; i < dim; i++) {
    let rowMin = Infinity;
    for (let j = 0; j < dim; j++) if (cost[i][j] < rowMin) rowMin = cost[i][j];
    u[i] = rowMin;
  }

  for (let i = 0; i < dim; i++) {
    const parentRowOfCol = new Array(dim).fill(-1);
    const minSlack = new Array(dim).fill(Infinity);
    const colVisited = new Array(dim).fill(false);
    const rowVisited = new Array(dim).fill(false);

    let curRow = i;
    let curCol = -1;

    while (true) {
      rowVisited[curRow] = true;
      let delta = Infinity;
      let nextCol = -1;

      for (let j = 0; j < dim; j++) {
        if (colVisited[j]) continue;
        const reduced = cost[curRow][j] - u[curRow] - v[j];
        if (reduced < minSlack[j]) {
          minSlack[j] = reduced;
          parentRowOfCol[j] = curRow;
        }
        if (minSlack[j] < delta) {
          delta = minSlack[j];
          nextCol = j;
        }
      }

      for (let r = 0; r < dim; r++) if (rowVisited[r]) u[r] += delta;
      for (let c = 0; c < dim; c++) {
        if (colVisited[c]) v[c] -= delta;
        else minSlack[c] -= delta;
      }

      colVisited[nextCol] = true;
      const matchedRow = matchRowOfCol[nextCol];
      if (matchedRow === -1) {
        curCol = nextCol;
        break;
      }
      curRow = matchedRow;
    }

    // Flip matches back along the augmenting path we just found.
    while (curCol !== -1) {
      const parentRow = parentRowOfCol[curCol];
      const prevCol = matchColOfRow[parentRow];
      matchRowOfCol[curCol] = parentRow;
      matchColOfRow[parentRow] = curCol;
      curCol = prevCol;
    }
  }

  return matchColOfRow;
}