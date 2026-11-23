window.Homino = window.Homino || {};

(function (ns) {
  const {
    SHAPED_TEMPLATES,
    valueToLetter,
    getValueRange,
    getTotalDominoCount
  } = ns.Config;

  function isHole(r, c, grid) {
    return !grid || !grid[r] || grid[r][c] === -1;
  }

  function edgeKey(r1, c1, r2, c2) {
    if (r1 < r2 || (r1 === r2 && c1 < c2)) return `${r1},${c1}|${r2},${c2}`;
    return `${r2},${c2}|${r1},${c1}`;
  }

  function pairKey(a, b) {
    return a <= b ? `${a}-${b}` : `${b}-${a}`;
  }

  function formatPairLabel(a, b, displayMode, diffMode) {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (displayMode === 'letters') {
      return `${valueToLetter(lo, diffMode)}\u2013${valueToLetter(hi, diffMode)}`;
    }
    return `${lo}\u2013${hi}`;
  }

  function getNeighbors(r, c, rows, cols, grid) {
    const res = [];
    if (r > 0 && !isHole(r - 1, c, grid)) res.push([r - 1, c]);
    if (r < rows - 1 && !isHole(r + 1, c, grid)) res.push([r + 1, c]);
    if (c > 0 && !isHole(r, c - 1, grid)) res.push([r, c - 1]);
    if (c < cols - 1 && !isHole(r, c + 1, grid)) res.push([r, c + 1]);
    return res;
  }

  function findDominoAt(dominoes, r, c) {
    return dominoes.findIndex(d => (d.r1 === r && d.c1 === c) || (d.r2 === r && d.c2 === c));
  }

  function isBlockedBetween(grid, walls, r1, c1, r2, c2) {
    if (isHole(r1, c1, grid) || isHole(r2, c2, grid)) return true;
    return Boolean(walls[edgeKey(r1, c1, r2, c2)]);
  }

  function countSolutionsUpToTwo(grid, rows, cols, diffMode) {
    const { minVal, maxVal } = getValueRange(diffMode);
    const span = maxVal - minVal + 1;
    const totalPairs = getTotalDominoCount(diffMode);
    const covered = new Uint8Array(rows * cols);
    const usedPair = new Uint8Array(span * span);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (isHole(r, c, grid)) {
          covered[r * cols + c] = 1;
        }
      }
    }

    const pairIndex = (a, b) => {
      const lo = a < b ? a - minVal : b - minVal;
      const hi = a < b ? b - minVal : a - minVal;
      return lo * span + hi;
    };

    const edgesByPair = Array.from({ length: span * span }, () => []);
    const cellAdj = Array.from({ length: rows * cols }, () => []);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (isHole(r, c, grid)) continue;
        const idx = r * cols + c;
        if (c + 1 < cols && !isHole(r, c + 1, grid)) {
          const nIdx = r * cols + (c + 1);
          const pIdx = pairIndex(grid[r][c], grid[r][c + 1]);
          edgesByPair[pIdx].push([idx, nIdx]);
          cellAdj[idx].push([nIdx, pIdx]);
          cellAdj[nIdx].push([idx, pIdx]);
        }
        if (r + 1 < rows && !isHole(r + 1, c, grid)) {
          const nIdx = (r + 1) * cols + c;
          const pIdx = pairIndex(grid[r][c], grid[r + 1][c]);
          edgesByPair[pIdx].push([idx, nIdx]);
          cellAdj[idx].push([nIdx, pIdx]);
          cellAdj[nIdx].push([idx, pIdx]);
        }
      }
    }

    let solutionsFound = 0;

    function solve(placedCount) {
      if (solutionsFound >= 2) return;
      if (placedCount === totalPairs) {
        solutionsFound++;
        return;
      }

      let bestCell = -1;
      let minCellMoves = 99;
      for (let i = 0; i < rows * cols; i++) {
        if (covered[i]) continue;
        let moves = 0;
        const adj = cellAdj[i];
        for (let k = 0; k < adj.length; k++) {
          const [nb, pIdx] = adj[k];
          if (!covered[nb] && !usedPair[pIdx]) moves++;
        }
        if (moves === 0) return;
        if (moves < minCellMoves) {
          minCellMoves = moves;
          bestCell = i;
          if (moves === 1) break;
        }
      }

      let bestPair = -1;
      let minPairMoves = minCellMoves;
      if (minPairMoves > 1) {
        for (let a = minVal; a <= maxVal; a++) {
          for (let b = a; b <= maxVal; b++) {
            const pIdx = (a - minVal) * span + (b - minVal);
            if (usedPair[pIdx]) continue;
            const edges = edgesByPair[pIdx];
            let moves = 0;
            for (let k = 0; k < edges.length; k++) {
              const [u, v] = edges[k];
              if (!covered[u] && !covered[v]) moves++;
            }
            if (moves === 0) return;
            if (moves < minPairMoves) {
              minPairMoves = moves;
              bestPair = pIdx;
              if (moves === 1) break;
            }
          }
          if (minPairMoves === 1 && bestPair !== -1) break;
        }
      }

      if (bestPair !== -1) {
        const edges = edgesByPair[bestPair];
        usedPair[bestPair] = 1;
        for (let k = 0; k < edges.length; k++) {
          const [u, v] = edges[k];
          if (!covered[u] && !covered[v]) {
            covered[u] = 1;
            covered[v] = 1;
            solve(placedCount + 1);
            covered[u] = 0;
            covered[v] = 0;
            if (solutionsFound >= 2) break;
          }
        }
        usedPair[bestPair] = 0;
      } else {
        const adj = cellAdj[bestCell];
        covered[bestCell] = 1;
        for (let k = 0; k < adj.length; k++) {
          const [nb, pIdx] = adj[k];
          if (!covered[nb] && !usedPair[pIdx]) {
            covered[nb] = 1;
            usedPair[pIdx] = 1;
            solve(placedCount + 1);
            usedPair[pIdx] = 0;
            covered[nb] = 0;
            if (solutionsFound >= 2) break;
          }
        }
        covered[bestCell] = 0;
      }
    }

    solve(0);
    return solutionsFound;
  }

  const lastTemplateIdxBySize = {};

  function tryGenerateFromTemplate(diffMode, rows, cols, expectedPairs, chosenTpl, tplIdx) {
    for (let attempt = 0; attempt < 25; attempt++) {
      const used = Array.from({ length: rows }, () => Array(cols).fill(false));
      const grid = Array.from({ length: rows }, () => Array(cols).fill(0));

      if (chosenTpl) {
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (chosenTpl[r][c] === 'X') {
              used[r][c] = true;
              grid[r][c] = -1;
            }
          }
        }
      }

      const pairs = [];
      let steps = 0;

      function backtrack() {
        if (++steps > 22000) return false;

        let bestR = -1;
        let bestC = -1;
        let minDeg = 99;

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (used[r][c]) continue;
            let deg = 0;
            if (r > 0 && !used[r - 1][c]) deg++;
            if (r + 1 < rows && !used[r + 1][c]) deg++;
            if (c > 0 && !used[r][c - 1]) deg++;
            if (c + 1 < cols && !used[r][c + 1]) deg++;
            if (deg === 0) return false;
            if (deg < minDeg) {
              minDeg = deg;
              bestR = r;
              bestC = c;
              if (deg === 1) break;
            }
          }
          if (minDeg === 1) break;
        }

        if (bestR === -1) return true;

        used[bestR][bestC] = true;
        const dirs = [];
        if (bestR > 0 && !used[bestR - 1][bestC]) dirs.push([bestR - 1, bestC]);
        if (bestR + 1 < rows && !used[bestR + 1][bestC]) dirs.push([bestR + 1, bestC]);
        if (bestC > 0 && !used[bestR][bestC - 1]) dirs.push([bestR, bestC - 1]);
        if (bestC + 1 < cols && !used[bestR][bestC + 1]) dirs.push([bestR, bestC + 1]);

        for (let i = dirs.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
        }

        for (const [nr, nc] of dirs) {
          used[nr][nc] = true;
          pairs.push({ r1: bestR, c1: bestC, r2: nr, c2: nc });
          if (backtrack()) return true;
          pairs.pop();
          used[nr][nc] = false;
        }

        used[bestR][bestC] = false;
        return false;
      }

      if (!backtrack() || pairs.length !== expectedPairs) continue;

      const { minVal, maxVal } = getValueRange(diffMode);
      const tiles = [];
      for (let a = minVal; a <= maxVal; a++) {
        for (let b = a; b <= maxVal; b++) {
          tiles.push([a, b]);
        }
      }
      for (let i = tiles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
      }

      pairs.forEach((p, i) => {
        const [a, b] = tiles[i];
        if (Math.random() < 0.5) {
          grid[p.r1][p.c1] = a;
          grid[p.r2][p.c2] = b;
        } else {
          grid[p.r1][p.c1] = b;
          grid[p.r2][p.c2] = a;
        }
      });

      return { rows, cols, grid, solution: pairs, templateIndex: tplIdx };
    }

    return null;
  }

  function generateSingleRandomBoard(diffMode, boardShape, forcedTemplateIndex = null) {
    const isShaped = boardShape === 'shaped';
    const rows = diffMode + 1;
    const cols = isShaped ? (diffMode + 1) : diffMode;
    const expectedPairs = getTotalDominoCount(diffMode);

    if (!isShaped) {
      return tryGenerateFromTemplate(diffMode, rows, cols, expectedPairs, null, 0);
    }

    const templates = SHAPED_TEMPLATES[rows] || [];
    const count = templates.length;
    if (count > 0) {
      const startIdx = forcedTemplateIndex !== null
        ? (forcedTemplateIndex % count)
        : Math.floor(Math.random() * count);

      for (let offset = 0; offset < count; offset++) {
        const idx = (startIdx + offset) % count;
        const board = tryGenerateFromTemplate(diffMode, rows, cols, expectedPairs, templates[idx], idx);
        if (board) return board;
      }
    }

    return tryGenerateFromTemplate(diffMode, diffMode + 1, diffMode, expectedPairs, null, 0);
  }

  function generatePuzzle(diffMode, genMode, boardShape) {
    const rows = diffMode + 1;
    const templates = boardShape === 'shaped' ? (SHAPED_TEMPLATES[rows] || []) : [];
    const tplCount = templates.length;

    let startTplIdx = null;
    if (tplCount > 0) {
      const prevIdx = lastTemplateIdxBySize[rows];
      startTplIdx = prevIdx === undefined
        ? Math.floor(Math.random() * tplCount)
        : (prevIdx + 1) % tplCount;
    }

    if (genMode !== 'unique') {
      const board = generateSingleRandomBoard(diffMode, boardShape, startTplIdx);
      if (tplCount > 0 && board && board.templateIndex !== undefined) {
        lastTemplateIdxBySize[rows] = board.templateIndex;
      }
      return board;
    }

    const maxAttempts = diffMode >= 7 ? 200 : 140;
    const deadline = Date.now() + (diffMode >= 7 ? 600 : 450);
    let lastBoard = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const candidate = generateSingleRandomBoard(diffMode, boardShape, startTplIdx);
      lastBoard = candidate;
      if (candidate && countSolutionsUpToTwo(candidate.grid, candidate.rows, candidate.cols, diffMode) === 1) {
        if (tplCount > 0 && candidate.templateIndex !== undefined) {
          lastTemplateIdxBySize[rows] = candidate.templateIndex;
        }
        return candidate;
      }
      if (Date.now() > deadline) break;
    }

    if (tplCount > 0 && lastBoard && lastBoard.templateIndex !== undefined) {
      lastTemplateIdxBySize[rows] = lastBoard.templateIndex;
    }
    return lastBoard;
  }

  function getFilterCandidatePairs(state, targetPairKey) {
    if (!targetPairKey || state.isGameOver) return [];
    const { rows, cols, grid, walls, dominoes } = state;
    const candidates = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (isHole(r, c, grid) || findDominoAt(dominoes, r, c) !== -1) continue;
        if (c + 1 < cols && !isHole(r, c + 1, grid) && findDominoAt(dominoes, r, c + 1) === -1 && !isBlockedBetween(grid, walls, r, c, r, c + 1)) {
          if (pairKey(grid[r][c], grid[r][c + 1]) === targetPairKey) {
            candidates.push({ r1: r, c1: c, r2: r, c2: c + 1, edge: edgeKey(r, c, r, c + 1) });
          }
        }
        if (r + 1 < rows && !isHole(r + 1, c, grid) && findDominoAt(dominoes, r + 1, c) === -1 && !isBlockedBetween(grid, walls, r, c, r + 1, c)) {
          if (pairKey(grid[r][c], grid[r + 1][c]) === targetPairKey) {
            candidates.push({ r1: r, c1: c, r2: r + 1, c2: c, edge: edgeKey(r, c, r + 1, c) });
          }
        }
      }
    }
    return candidates;
  }

  function findLogicalAdvice(state, t) {
    const { rows, cols, grid, walls, dominoes, solution, maxPip, displayMode } = state;
    const counts = {};
    for (const d of dominoes) {
      const pk = pairKey(grid[d.r1][d.c1], grid[d.r2][d.c2]);
      counts[pk] = (counts[pk] || 0) + 1;
    }

    // Pravidlo 1: Bunky s jedinym volnym sousedem
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (isHole(r, c, grid) || findDominoAt(dominoes, r, c) !== -1) continue;
        const freeNeighbors = getNeighbors(r, c, rows, cols, grid).filter(
          ([nr, nc]) => !isBlockedBetween(grid, walls, r, c, nr, nc) && findDominoAt(dominoes, nr, nc) === -1
        );
        if (freeNeighbors.length === 1) {
          const [nr, nc] = freeNeighbors[0];
          const lbl = formatPairLabel(grid[r][c], grid[nr][nc], displayMode, maxPip);
          return {
            action: 'link',
            r1: r, c1: c, r2: nr, c2: nc,
            pairLabel: lbl,
            message: t.adviceSingleNeighbor.replace('{pair}', lbl)
          };
        }
      }
    }

    // Pravidlo 2: Kamen ze sady, ktery ma na cele desce jedine mozne misto (Hidden Single)
    const { minVal, maxVal } = getValueRange(maxPip);
    for (let a = minVal; a <= maxVal; a++) {
      for (let b = a; b <= maxVal; b++) {
        const pk = `${a}-${b}`;
        if ((counts[pk] || 0) > 0) continue;
        const candidates = getFilterCandidatePairs(state, pk);
        if (candidates.length === 1) {
          const cand = candidates[0];
          const lbl = formatPairLabel(a, b, displayMode, maxPip);
          return {
            action: 'link',
            r1: cand.r1, c1: cand.c1, r2: cand.r2, c2: cand.c2,
            pairLabel: lbl,
            message: t.adviceHiddenSingle.replace('{pair}', lbl)
          };
        }
      }
    }

    // Pravidlo 3: Zakazana duplicita -> mezi volnou dvojici musi byt stena
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (isHole(r, c, grid) || findDominoAt(dominoes, r, c) !== -1) continue;
        if (c + 1 < cols && !isHole(r, c + 1, grid) && findDominoAt(dominoes, r, c + 1) === -1 && !isBlockedBetween(grid, walls, r, c, r, c + 1)) {
          const pk = pairKey(grid[r][c], grid[r][c + 1]);
          if ((counts[pk] || 0) >= 1) {
            const lbl = formatPairLabel(grid[r][c], grid[r][c + 1], displayMode, maxPip);
            return {
              action: 'wall',
              r1: r, c1: c, r2: r, c2: c + 1,
              edge: edgeKey(r, c, r, c + 1),
              pairLabel: lbl,
              message: t.adviceDuplicateWall.replace('{pair}', lbl)
            };
          }
        }
        if (r + 1 < rows && !isHole(r + 1, c, grid) && findDominoAt(dominoes, r + 1, c) === -1 && !isBlockedBetween(grid, walls, r, c, r + 1, c)) {
          const pk = pairKey(grid[r][c], grid[r + 1][c]);
          if ((counts[pk] || 0) >= 1) {
            const lbl = formatPairLabel(grid[r][c], grid[r + 1][c], displayMode, maxPip);
            return {
              action: 'wall',
              r1: r, c1: c, r2: r + 1, c2: c,
              edge: edgeKey(r, c, r + 1, c),
              pairLabel: lbl,
              message: t.adviceDuplicateWall.replace('{pair}', lbl)
            };
          }
        }
      }
    }

    // Zalozni krok: spravna hrana ze skryteho reseni
    const solEdgeSet = new Set(solution.map(s => edgeKey(s.r1, s.c1, s.r2, s.c2)));
    const candidateEdges = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (isHole(r, c, grid)) continue;
        if (c + 1 < cols && !isHole(r, c + 1, grid)) {
          const k = edgeKey(r, c, r, c + 1);
          if (!solEdgeSet.has(k) && !walls[k]) candidateEdges.push({ r1: r, c1: c, r2: r, c2: c + 1, edge: k });
        }
        if (r + 1 < rows && !isHole(r + 1, c, grid)) {
          const k = edgeKey(r, c, r + 1, c);
          if (!solEdgeSet.has(k) && !walls[k]) candidateEdges.push({ r1: r, c1: c, r2: r + 1, c2: c, edge: k });
        }
      }
    }

    if (candidateEdges.length > 0) {
      const chosen = candidateEdges[Math.floor(Math.random() * candidateEdges.length)];
      return {
        action: 'fallback_wall',
        r1: chosen.r1, c1: chosen.c1, r2: chosen.r2, c2: chosen.c2,
        edge: chosen.edge,
        message: t.adviceFallbackEdge
      };
    }

    return null;
  }

  ns.Engine = {
    isHole,
    edgeKey,
    pairKey,
    formatPairLabel,
    getNeighbors,
    findDominoAt,
    isBlockedBetween,
    countSolutionsUpToTwo,
    generatePuzzle,
    getFilterCandidatePairs,
    findLogicalAdvice
  };
})(window.Homino);
