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

export function hungarianMaxWeightMatching(fieldsCandidates: FieldCandidates[]): Assignment[] {
  const keysSet = new Set<string>();
  for (const fc of fieldsCandidates) {
    for (const c of fc.candidates) {
      keysSet.add(c.key);
    }
  }
  const keysList = Array.from(keysSet);
  
  const n = fieldsCandidates.length;
  const m = keysList.length;
  if (n === 0 || m === 0) return [];

  const dim = Math.max(n, m);
  
  // Cost matrix: we want to maximize sum of weights, so we minimize (100 - Weight)
  const cost: number[][] = Array.from({ length: dim }, () => new Array(dim).fill(100));

  for (let i = 0; i < n; i++) {
    const fc = fieldsCandidates[i];
    for (const cand of fc.candidates) {
      const j = keysList.indexOf(cand.key);
      if (j !== -1) {
        cost[i][j] = 100 - cand.score;
      }
    }
  }

  const labelByRow = new Array(dim).fill(0);
  const labelByCol = new Array(dim).fill(0);
  const matchByCol = new Array(dim).fill(-1);
  const matchByRow = new Array(dim).fill(-1);

  // Initial labeling
  for (let i = 0; i < dim; i++) {
    labelByRow[i] = Math.min(...cost[i]);
  }

  for (let i = 0; i < dim; i++) {
    const links = new Array(dim).fill(-1);
    const mins = new Array(dim).fill(Infinity);
    const visited = new Array(dim).fill(false);
    let currentRow = i;
    let currentCol = -1;

    // Search for augmenting path
    while (currentRow !== -1) {
      let markedRow = currentRow;
      let minDelta = Infinity;
      let nextCol = -1;
      visited[markedRow] = true;

      for (let j = 0; j < dim; j++) {
        if (!visited[dim + j]) {
          const val = cost[markedRow][j] - labelByRow[markedRow] - labelByCol[j];
          if (val < mins[j]) {
            mins[j] = val;
            links[j] = markedRow;
          }
          if (mins[j] < minDelta) {
            minDelta = mins[j];
            nextCol = j;
          }
        }
      }

      for (let r = 0; r < dim; r++) {
        if (visited[r]) {
          labelByRow[r] += minDelta;
        }
      }
      for (let c = 0; c < dim; c++) {
        if (visited[dim + c]) {
          labelByCol[c] -= minDelta;
        } else {
          mins[c] -= minDelta;
        }
      }

      visited[dim + nextCol] = true;
      const matchedRow = matchByCol[nextCol];
      if (matchedRow === -1) {
        currentCol = nextCol;
        break;
      }
      currentRow = matchedRow;
    }

    // Augment matching
    while (currentCol !== -1) {
      const prevRow = links[currentCol];
      const prevCol = matchByRow[prevRow];
      matchByCol[currentCol] = prevRow;
      matchByRow[prevRow] = currentCol;
      currentCol = prevCol;
    }
  }

  // Collect results
  const assignments: Assignment[] = [];
  for (let i = 0; i < n; i++) {
    const matchedCol = matchByRow[i];
    if (matchedCol !== -1 && matchedCol < m) {
      const keyName = keysList[matchedCol];
      const fc = fieldsCandidates[i];
      const cand = fc.candidates.find(c => c.key === keyName);
      if (cand) {
        assignments.push({
          fieldIndex: fc.fieldIndex,
          key: keyName,
          score: cand.score
        });
      }
    }
  }

  return assignments;
}
