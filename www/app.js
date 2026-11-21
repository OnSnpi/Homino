window.Homino = window.Homino || {};

(function (ns) {
  const {
    CONSTANTS,
    I18N,
    detectLang,
    valueToLetter,
    getValueRange,
    getSetLabel,
    getTotalDominoCount,
    createPipHTML,
    createSymbolSVG
  } = ns.Config;

  const {
    isHole,
    edgeKey,
    pairKey,
    formatPairLabel,
    getNeighbors,
    findDominoAt,
    isBlockedBetween,
    generatePuzzle,
    getFilterCandidatePairs,
    findLogicalAdvice
  } = ns.Engine;

  let state = {
    lang: detectLang(),
    maxPip: 6,
    boardShape: 'rect',
    genMode: 'classic',
    soundEnabled: true,
    hapticsEnabled: true,
    wins: { 4: 0, 5: 0, 6: 0, 7: 0 },
    theme: 'classic',
    displayMode: 'digits',
    rows: 7,
    cols: 6,
    grid: [],
    solution: [],
    walls: {},
    dominoes: [],
    checkpoint: null,
    history: [],
    isGameOver: false
  };

  let activeFilterPair = null;
  let xrayValue = null;
  let pendingAdvice = null;
  let pendingConfirmAction = null;
  let endModalOpenedAt = 0;

  let transientErrors = {
    cells: new Set(),
    edges: new Set(),
    message: null,
    type: 'normal'
  };

  // --- HAPTIKA ---
  function getNativeHaptics() {
    try {
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics) {
        return window.Capacitor.Plugins.Haptics;
      }
    } catch (e) {}
    return null;
  }

  function triggerHaptic(kind) {
    if (!state.hapticsEnabled) return;
    const haptics = getNativeHaptics();
    if (haptics) {
      try {
        if (kind === 'light') haptics.impact({ style: 'LIGHT' });
        else if (kind === 'medium') haptics.impact({ style: 'MEDIUM' });
        else if (kind === 'error') haptics.notification({ type: 'ERROR' });
        else if (kind === 'win') haptics.notification({ type: 'SUCCESS' });
        return;
      } catch (e) {}
    }
    try {
      if (navigator.vibrate) {
        if (kind === 'light') navigator.vibrate(12);
        else if (kind === 'medium') navigator.vibrate(20);
        else if (kind === 'error') navigator.vibrate([35, 30, 35]);
        else if (kind === 'win') navigator.vibrate([25, 45, 25, 45, 70]);
      }
    } catch (e) {}
  }

  // --- SYNTETICKY ZVUK (Web Audio API s organickymi mikro-variacemi) ---
  let audioCtx = null;

  function ensureAudioCtx() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function jitter(val, pct) {
    return val * (1 + (Math.random() * 2 - 1) * pct);
  }

  function playTone(freq, duration, type = 'sine', volume = 0.08, delay = 0, endFreq = null, humanize = true) {
    if (!state.soundEnabled) return;
    const ctx = ensureAudioCtx();
    if (!ctx) return;

    const fStart = humanize ? jitter(freq, 0.07) : freq;
    const fEnd = endFreq ? (humanize ? jitter(endFreq, 0.07) : endFreq) : null;
    const dur = humanize ? jitter(duration, 0.16) : duration;
    const vol = humanize ? jitter(volume, 0.15) : volume;
    const attack = humanize ? (0.005 + Math.random() * 0.008) : 0.008;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(fStart, now);
    if (fEnd) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, fEnd), now + dur);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(vol, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.015);
  }

  function triggerSound(kind) {
    if (!state.soundEnabled) return;
    if (kind === 'edgeAdd') {
      playTone(540, 0.055, 'triangle', 0.075, 0, 370, true);
    } else if (kind === 'edgeRemove') {
      playTone(395, 0.055, 'triangle', 0.065, 0, 285, true);
    } else if (kind === 'link') {
      playTone(523.25, 0.07, 'triangle', 0.085, 0, 440, true);
      playTone(659.25, 0.09, 'sine', 0.075, 0.032 + Math.random() * 0.01, null, true);
    } else if (kind === 'unlink') {
      playTone(493.88, 0.07, 'triangle', 0.07, 0, null, true);
      playTone(392.00, 0.08, 'sine', 0.06, 0.032 + Math.random() * 0.01, null, true);
    } else if (kind === 'auto') {
      // Bohatejsi zaklapnuti pri automatickem uzavreni kostky
      playTone(523.25, 0.085, 'triangle', 0.08, 0, null, true);
      playTone(659.25, 0.095, 'sine', 0.08, 0.04, null, true);
      playTone(783.99, 0.14, 'sine', 0.085, 0.085, null, true);
      playTone(1046.50, 0.16, 'sine', 0.045, 0.11, null, true);
    } else if (kind === 'xray') {
      playTone(680, 0.055, 'sine', 0.05, 0, 720, true);
    } else if (kind === 'error') {
      playTone(174.61, 0.11, 'triangle', 0.09, 0, 155, false);
      playTone(164.81, 0.14, 'triangle', 0.09, 0.09, 140, false);
    } else if (kind === 'win') {
      playTone(523.25, 0.13, 'sine', 0.09, 0, null, false);
      playTone(659.25, 0.13, 'sine', 0.09, 0.07, null, false);
      playTone(783.99, 0.15, 'sine', 0.09, 0.14, null, false);
      playTone(1046.50, 0.32, 'sine', 0.10, 0.21, null, false);
      playTone(1051.00, 0.32, 'triangle', 0.04, 0.21, null, false);
    }
  }
  
  // --- DVOJITE ULOZISTE ---
  function getNativePrefs() {
    try {
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Preferences) {
        return window.Capacitor.Plugins.Preferences;
      }
    } catch (e) {}
    return null;
  }

  async function storageRead(key) {
    const prefs = getNativePrefs();
    if (prefs) {
      try {
        const res = await prefs.get({ key });
        if (res && res.value !== null && res.value !== undefined) return res.value;
      } catch (e) {}
    }
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  async function storageWrite(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {}
    const prefs = getNativePrefs();
    if (prefs) {
      try {
        await prefs.set({ key, value });
      } catch (e) {}
    }
  }

  function saveProfile() {
    storageWrite(CONSTANTS.PROFILE_KEY, JSON.stringify({
      lang: state.lang,
      maxPip: state.maxPip,
      boardShape: state.boardShape,
      genMode: state.genMode,
      soundEnabled: state.soundEnabled,
      hapticsEnabled: state.hapticsEnabled,
      wins: {
        4: Number(state.wins[4]) || 0,
        5: Number(state.wins[5]) || 0,
        6: Number(state.wins[6]) || 0,
        7: Number(state.wins[7]) || 0
      },
      theme: state.theme,
      displayMode: state.displayMode
    }));
  }

  function saveBoard() {
    storageWrite(CONSTANTS.BOARD_KEY, JSON.stringify({
      maxPip: state.maxPip,
      boardShape: state.boardShape,
      rows: state.rows,
      cols: state.cols,
      grid: state.grid,
      solution: state.solution,
      walls: state.walls,
      dominoes: state.dominoes,
      checkpoint: state.checkpoint,
      history: state.history,
      isGameOver: state.isGameOver
    }));
  }

  function saveGame() {
    saveProfile();
    saveBoard();
  }

  function extractWinsFromObject(obj) {
    if (!obj || typeof obj !== 'object') return { 4: 0, 5: 0, 6: 0, 7: 0 };
    if (obj.wins && typeof obj.wins === 'object') {
      return {
        4: Number(obj.wins[4]) || 0,
        5: Number(obj.wins[5]) || 0,
        6: Number(obj.wins[6]) || 0,
        7: Number(obj.wins[7]) || 0
      };
    }
    return { 4: 0, 5: 0, 6: Number(obj.masterWins) || 0, 7: 0 };
  }

  function getMasterWins() {
    if (!state.wins) return 0;
    return (Number(state.wins[6]) || 0) + (Number(state.wins[7]) || 0);
  }

  function getTotalWins() {
    if (!state.wins) return 0;
    return (Number(state.wins[4]) || 0) +
           (Number(state.wins[5]) || 0) +
           (Number(state.wins[6]) || 0) +
           (Number(state.wins[7]) || 0);
  }

  function sanitizeUnlocks() {
    const mw = getMasterWins();
    if (mw < CONSTANTS.MILESTONE_EMERALD && state.theme === 'emerald') state.theme = 'classic';
    if (mw < CONSTANTS.MILESTONE_TOUR && state.theme === 'tournament') state.theme = 'classic';
    if (mw < CONSTANTS.MILESTONE_ROYAL && state.theme === 'royal') state.theme = 'classic';
    if (mw < CONSTANTS.MILESTONE_SYMBOLS && state.displayMode === 'symbols') state.displayMode = 'digits';
    if (mw < CONSTANTS.MILESTONE_PIPS && state.displayMode === 'pips') state.displayMode = 'digits';
  }

  async function loadGame() {
    let bestWins = { 4: 0, 5: 0, 6: 0, 7: 0 };
    let loadedProfile = null;
    let loadedBoard = null;

    const rawProfile = await storageRead(CONSTANTS.PROFILE_KEY);
    if (rawProfile) {
      try {
        loadedProfile = JSON.parse(rawProfile);
        bestWins = extractWinsFromObject(loadedProfile);
      } catch (e) {}
    }

    for (const legacyKey of CONSTANTS.LEGACY_KEYS) {
      const rawLegacy = await storageRead(legacyKey);
      if (!rawLegacy) continue;
      try {
        const parsed = JSON.parse(rawLegacy);
        const lw = extractWinsFromObject(parsed);
        bestWins[4] = Math.max(bestWins[4], lw[4]);
        bestWins[5] = Math.max(bestWins[5], lw[5]);
        bestWins[6] = Math.max(bestWins[6], lw[6]);
        bestWins[7] = Math.max(bestWins[7], lw[7]);

        if (!loadedProfile) {
          loadedProfile = {
            lang: parsed.lang || detectLang(),
            maxPip: parsed.maxPip || 6,
            boardShape: 'rect',
            genMode: 'classic',
            soundEnabled: true,
            hapticsEnabled: true,
            theme: parsed.theme || 'classic',
            displayMode: parsed.displayMode || 'digits'
          };
        }
        if (!loadedBoard && Array.isArray(parsed.grid) && parsed.grid.length > 0) {
          loadedBoard = parsed;
        }
      } catch (e) {}
    }

    const rawBoard = await storageRead(CONSTANTS.BOARD_KEY);
    if (rawBoard) {
      try {
        const parsedBoard = JSON.parse(rawBoard);
        if (parsedBoard && Array.isArray(parsedBoard.grid) && parsedBoard.grid.length > 0) {
          loadedBoard = parsedBoard;
        }
      } catch (e) {}
    }

    if (loadedProfile) {
      state.lang = loadedProfile.lang || state.lang;
      state.maxPip = loadedProfile.maxPip || state.maxPip;
      state.boardShape = loadedProfile.boardShape === 'shaped' ? 'shaped' : 'rect';
      state.genMode = loadedProfile.genMode === 'unique' ? 'unique' : 'classic';
      state.soundEnabled = loadedProfile.soundEnabled !== false;
      state.hapticsEnabled = loadedProfile.hapticsEnabled !== false;
      state.theme = loadedProfile.theme || state.theme;
      state.displayMode = loadedProfile.displayMode || state.displayMode;
    }
    state.wins = bestWins;
    sanitizeUnlocks();
    saveProfile();

    if (loadedBoard && Array.isArray(loadedBoard.grid) && loadedBoard.grid.length > 0) {
      state.maxPip = loadedBoard.maxPip || state.maxPip;
      state.boardShape = loadedBoard.boardShape === 'shaped' ? 'shaped' : (loadedBoard.rows === loadedBoard.cols ? 'shaped' : 'rect');
      state.rows = loadedBoard.rows || (state.maxPip + 1);
      state.cols = loadedBoard.cols || (state.boardShape === 'shaped' ? state.maxPip + 1 : state.maxPip);
      state.grid = loadedBoard.grid;
      state.solution = loadedBoard.solution || [];
      state.walls = loadedBoard.walls || {};
      state.dominoes = loadedBoard.dominoes || [];
      state.checkpoint = loadedBoard.checkpoint || null;
      state.history = loadedBoard.history || [];
      state.isGameOver = Boolean(loadedBoard.isGameOver || loadedBoard.won);
      if (state.isGameOver) {
        state.history = [];
        state.checkpoint = null;
        state.walls = {};
      }
      saveBoard();
      return true;
    }

    return false;
  }

  // --- HERNI AKCE ---
  function clearAdvice() {
    pendingAdvice = null;
  }

  function isGameInProgress() {
    if (state.isGameOver) return false;
    return state.dominoes.length > 0 || Object.keys(state.walls).length > 0 || state.history.length > 0;
  }

  function requestConfirmAction(onConfirm) {
    if (!isGameInProgress()) {
      onConfirm();
      return;
    }
    const t = I18N[state.lang];
    document.getElementById('confirm-title').textContent = t.confirmNewTitle;
    document.getElementById('confirm-desc').textContent = t.confirmNewDesc;
    document.getElementById('btn-confirm-cancel').textContent = t.confirmCancel;
    document.getElementById('btn-confirm-ok').textContent = t.confirmOkNew;

    pendingConfirmAction = onConfirm;
    document.getElementById('modal-confirm').classList.add('open');
  }

  function pushHistory() {
    if (state.isGameOver) return;
    state.history.push({
      walls: { ...state.walls },
      dominoes: state.dominoes.map(d => ({ ...d })),
      checkpoint: state.checkpoint ? {
        walls: { ...state.checkpoint.walls },
        dominoes: state.checkpoint.dominoes.map(d => ({ ...d }))
      } : null
    });
    if (state.history.length > 120) state.history.shift();
  }

  function undoMove() {
    if (state.isGameOver || state.history.length === 0) return;
    clearAdvice();
    const prev = state.history.pop();
    state.walls = prev.walls;
    state.dominoes = prev.dominoes;
    state.checkpoint = prev.checkpoint || null;
    transientErrors.cells.clear();
    transientErrors.edges.clear();
    transientErrors.message = null;
    transientErrors.type = 'normal';
    triggerHaptic('light');
    triggerSound('unlink');
    saveBoard();
    renderAll();
  }

  function startTrialMode() {
    if (state.isGameOver || state.checkpoint) return;
    clearAdvice();
    pushHistory();
    state.checkpoint = {
      walls: { ...state.walls },
      dominoes: state.dominoes.map(d => ({ ...d }))
    };
    transientErrors.message = I18N[state.lang].statusTrialActive;
    transientErrors.type = 'normal';
    triggerHaptic('light');
    triggerSound('edgeAdd');
    saveBoard();
    renderAll();
  }

  function acceptTrialMode(silent = false) {
    if (!state.checkpoint) return;
    clearAdvice();
    if (!silent) pushHistory();
    state.dominoes = state.dominoes.map(d => ({ r1: d.r1, c1: d.c1, r2: d.r2, c2: d.c2, trial: false }));
    for (const k of Object.keys(state.walls)) {
      if (state.walls[k] === 'trial') state.walls[k] = 'user';
    }
    state.checkpoint = null;
    if (!silent) {
      triggerHaptic('medium');
      triggerSound('link');
      evaluateBoard(false, true);
      if (!state.isGameOver && !transientErrors.message) {
        transientErrors.message = I18N[state.lang].statusTrialAccepted;
        transientErrors.type = 'success';
      }
      saveGame();
      renderAll();
    }
  }

  function discardTrialMode() {
    if (!state.checkpoint) return;
    clearAdvice();
    pushHistory();
    state.walls = { ...state.checkpoint.walls };
    state.dominoes = state.checkpoint.dominoes.map(d => ({ ...d }));
    state.checkpoint = null;
    triggerHaptic('light');
    triggerSound('unlink');
    evaluateBoard(false, false);
    transientErrors.message = I18N[state.lang].statusTrialDiscarded;
    transientErrors.type = 'normal';
    saveBoard();
    renderAll();
  }

  function removeDominoAndOuterWalls(idx) {
    if (idx === -1) return;
    const d = state.dominoes[idx];
    state.dominoes.splice(idx, 1);

    const cells = [[d.r1, d.c1], [d.r2, d.c2]];
    for (const [cr, cc] of cells) {
      for (const [nr, nc] of getNeighbors(cr, cc, state.rows, state.cols, state.grid)) {
        if ((nr === d.r1 && nc === d.c1) || (nr === d.r2 && nc === d.c2)) continue;
        if (findDominoAt(state.dominoes, nr, nc) !== -1) continue;
        const k = edgeKey(cr, cc, nr, nc);
        if (state.walls[k] === 'user' || state.walls[k] === 'trial') delete state.walls[k];
      }
    }
  }

  function linkDomino(r1, c1, r2, c2, recordHistory = true) {
    if (state.isGameOver) return;
    if (isHole(r1, c1, state.grid) || isHole(r2, c2, state.grid)) return;
    if (Math.abs(r1 - r2) + Math.abs(c1 - c2) !== 1) return;

    clearAdvice();

    const existingIdx = state.dominoes.findIndex(
      d => (d.r1 === r1 && d.c1 === c1 && d.r2 === r2 && d.c2 === c2) ||
           (d.r1 === r2 && d.c1 === c2 && d.r2 === r1 && d.c2 === c1)
    );

    if (recordHistory) pushHistory();

    if (existingIdx !== -1) {
      removeDominoAndOuterWalls(existingIdx);
      triggerHaptic('light');
      triggerSound('unlink');
      evaluateBoard(false, true);
      saveGame();
      renderAll();
      return;
    }

    const idx1 = findDominoAt(state.dominoes, r1, c1);
    if (idx1 !== -1) removeDominoAndOuterWalls(idx1);
    const idx2 = findDominoAt(state.dominoes, r2, c2);
    if (idx2 !== -1) removeDominoAndOuterWalls(idx2);

    const isTrial = Boolean(state.checkpoint);
    delete state.walls[edgeKey(r1, c1, r2, c2)];
    state.dominoes.push({ r1, c1, r2, c2, trial: isTrial });

    const cells = [[r1, c1], [r2, c2]];
    for (const [cr, cc] of cells) {
      for (const [nr, nc] of getNeighbors(cr, cc, state.rows, state.cols, state.grid)) {
        if ((nr === r1 && nc === c1) || (nr === r2 && nc === c2)) continue;
        const k = edgeKey(cr, cc, nr, nc);
        if (!state.walls[k]) state.walls[k] = isTrial ? 'trial' : 'user';
      }
    }

    const autoFormed = runAutoEncloseLoop();
    const hadErr = evaluateBoard(false, true);
    if (!state.isGameOver && !hadErr) {
      triggerHaptic('medium');
      triggerSound(autoFormed ? 'auto' : 'link');
    }
    saveGame();
    renderAll();
  }

  function toggleEdge(r1, c1, r2, c2) {
    if (state.isGameOver) return;
    if (isHole(r1, c1, state.grid) || isHole(r2, c2, state.grid)) return;
    clearAdvice();
    const k = edgeKey(r1, c1, r2, c2);
    pushHistory();

    let added = false;
    if (state.walls[k]) {
      delete state.walls[k];
    } else {
      added = true;
      state.walls[k] = state.checkpoint ? 'trial' : 'user';
      const dIdx = state.dominoes.findIndex(
        d => (d.r1 === r1 && d.c1 === c1 && d.r2 === r2 && d.c2 === c2) ||
             (d.r1 === r2 && d.c1 === c2 && d.r2 === r1 && d.c2 === c1)
      );
      if (dIdx !== -1) state.dominoes.splice(dIdx, 1);
    }

    const autoFormed = runAutoEncloseLoop();
    const hadErr = evaluateBoard(autoFormed, true);
    if (!state.isGameOver && !hadErr) {
      triggerHaptic(autoFormed ? 'medium' : 'light');
      if (autoFormed) triggerSound('auto');
      else triggerSound(added ? 'edgeAdd' : 'edgeRemove');
    }
    saveGame();
    renderAll();
  }

  function runAutoEncloseLoop() {
    let formedAny = false;
    let changed = true;
    const isTrial = Boolean(state.checkpoint);

    while (changed) {
      changed = false;
      for (let r = 0; r < state.rows; r++) {
        for (let c = 0; c < state.cols; c++) {
          if (isHole(r, c, state.grid) || findDominoAt(state.dominoes, r, c) !== -1) continue;

          const openNeighbors = getNeighbors(r, c, state.rows, state.cols, state.grid).filter(
            ([nr, nc]) => !isBlockedBetween(state.grid, state.walls, r, c, nr, nc) && findDominoAt(state.dominoes, nr, nc) === -1
          );

          if (openNeighbors.length === 1) {
            const [nr, nc] = openNeighbors[0];
            const backNeighbors = getNeighbors(nr, nc, state.rows, state.cols, state.grid).filter(
              ([br, bc]) => !isBlockedBetween(state.grid, state.walls, nr, nc, br, bc) && findDominoAt(state.dominoes, br, bc) === -1
            );

            if (
              backNeighbors.length === 1 &&
              backNeighbors[0][0] === r &&
              backNeighbors[0][1] === c &&
              findDominoAt(state.dominoes, r, c) === -1 &&
              findDominoAt(state.dominoes, nr, nc) === -1
            ) {
              delete state.walls[edgeKey(r, c, nr, nc)];
              state.dominoes.push({ r1: r, c1: c, r2: nr, c2: nc, trial: isTrial });
              formedAny = true;
              changed = true;
            }
          }
        }
      }
    }
    return formedAny;
  }

  function evaluateBoard(autoFormed = false, triggerWinCelebration = false) {
    const t = I18N[state.lang];
    transientErrors.cells.clear();
    transientErrors.edges.clear();
    transientErrors.message = null;
    transientErrors.type = 'normal';

    const counts = {};
    for (const d of state.dominoes) {
      const pk = pairKey(state.grid[d.r1][d.c1], state.grid[d.r2][d.c2]);
      counts[pk] = (counts[pk] || 0) + 1;
    }

    let dupLabel = null;
    for (const d of state.dominoes) {
      const v1 = state.grid[d.r1][d.c1];
      const v2 = state.grid[d.r2][d.c2];
      const pk = pairKey(v1, v2);
      if (counts[pk] > 1) {
        dupLabel = formatPairLabel(v1, v2, state.displayMode, state.maxPip);
        transientErrors.cells.add(`${d.r1},${d.c1}`);
        transientErrors.cells.add(`${d.r2},${d.c2}`);
      }
    }

    let hasDeadCell = false;
    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) {
        if (isHole(r, c, state.grid) || findDominoAt(state.dominoes, r, c) !== -1) continue;
        const free = getNeighbors(r, c, state.rows, state.cols, state.grid).filter(
          ([nr, nc]) => !isBlockedBetween(state.grid, state.walls, r, c, nr, nc) && findDominoAt(state.dominoes, nr, nc) === -1
        );
        if (free.length === 0) {
          hasDeadCell = true;
          transientErrors.cells.add(`${r},${c}`);
        }
      }
    }

    const totalDominoes = getTotalDominoCount(state.maxPip);
    const setLabel = getSetLabel(state.maxPip);
    const isMasterSet = state.maxPip === 6 || state.maxPip === 7;

    if (dupLabel) {
      transientErrors.message = t.statusErrDup.replace('{pair}', dupLabel);
      transientErrors.type = 'error';
      if (triggerWinCelebration) {
        triggerHaptic('error');
        triggerSound('error');
      }
      return true;
    }

    if (hasDeadCell) {
      transientErrors.message = t.statusErrDead;
      transientErrors.type = 'error';
      if (triggerWinCelebration) {
        triggerHaptic('error');
        triggerSound('error');
      }
      return true;
    }

    if (state.dominoes.length === totalDominoes && Object.keys(counts).length === totalDominoes) {
      if (state.checkpoint) acceptTrialMode(true);
      activeFilterPair = null;
      xrayValue = null;
      clearAdvice();
      const wasAlreadyOver = state.isGameOver;
      state.isGameOver = true;
      state.history = [];
      state.walls = {};
      transientErrors.type = 'success';

      let unlockText = null;
      if (!wasAlreadyOver && triggerWinCelebration) {
        const prevMaster = getMasterWins();
        state.wins[state.maxPip] = (Number(state.wins[state.maxPip]) || 0) + 1;

        if (isMasterSet) {
          const mw = getMasterWins();
          if (prevMaster < CONSTANTS.MILESTONE_EMERALD && mw >= CONSTANTS.MILESTONE_EMERALD) {
            state.theme = 'emerald';
            unlockText = t.statusUnlock5;
          } else if (prevMaster < CONSTANTS.MILESTONE_TOUR && mw >= CONSTANTS.MILESTONE_TOUR) {
            state.theme = 'tournament';
            unlockText = t.statusUnlock10;
          } else if (prevMaster < CONSTANTS.MILESTONE_SYMBOLS && mw >= CONSTANTS.MILESTONE_SYMBOLS) {
            state.displayMode = 'symbols';
            unlockText = t.statusUnlock15;
          } else if (prevMaster < CONSTANTS.MILESTONE_PIPS && mw >= CONSTANTS.MILESTONE_PIPS) {
            state.displayMode = 'pips';
            unlockText = t.statusUnlock20;
          } else if (prevMaster < CONSTANTS.MILESTONE_ROYAL && mw >= CONSTANTS.MILESTONE_ROYAL) {
            state.theme = 'royal';
            unlockText = t.statusUnlock30;
          }
        }
      }

      if (unlockText) {
        transientErrors.message = unlockText;
      } else if (isMasterSet) {
        transientErrors.message = t.statusWinMaster.replace('{total}', totalDominoes);
      } else {
        transientErrors.message = t.statusWinTrain.replace('{setLabel}', setLabel);
      }

      if (triggerWinCelebration) {
        triggerHaptic('win');
        triggerSound('win');
        showEndModal({ isMaster: isMasterSet, unlockText });
      }
      return false;
    }

    if (autoFormed) {
      transientErrors.message = t.statusAutoFormed;
      transientErrors.type = 'success';
    }
    return false;
  }

  function useAdvice() {
    if (state.isGameOver) return;
    const t = I18N[state.lang];
    transientErrors.cells.clear();
    transientErrors.edges.clear();

    const counts = {};
    for (const d of state.dominoes) {
      const pk = pairKey(state.grid[d.r1][d.c1], state.grid[d.r2][d.c2]);
      counts[pk] = (counts[pk] || 0) + 1;
    }
    for (const d of state.dominoes) {
      const v1 = state.grid[d.r1][d.c1];
      const v2 = state.grid[d.r2][d.c2];
      const pk = pairKey(v1, v2);
      if (counts[pk] > 1) {
        clearAdvice();
        transientErrors.cells.add(`${d.r1},${d.c1}`);
        transientErrors.cells.add(`${d.r2},${d.c2}`);
        transientErrors.message = t.statusHintErrDup.replace('{pair}', formatPairLabel(v1, v2, state.displayMode, state.maxPip));
        transientErrors.type = 'error';
        triggerHaptic('error');
        triggerSound('error');
        renderAll();
        return;
      }
    }

    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) {
        if (isHole(r, c, state.grid) || findDominoAt(state.dominoes, r, c) !== -1) continue;
        const free = getNeighbors(r, c, state.rows, state.cols, state.grid).filter(
          ([nr, nc]) => !isBlockedBetween(state.grid, state.walls, r, c, nr, nc) && findDominoAt(state.dominoes, nr, nc) === -1
        );
        if (free.length === 0) {
          clearAdvice();
          transientErrors.cells.add(`${r},${c}`);
          transientErrors.message = t.statusHintErrDead;
          transientErrors.type = 'error';
          triggerHaptic('error');
          triggerSound('error');
          renderAll();
          return;
        }
      }
    }

    const solEdgeSet = new Set(state.solution.map(s => edgeKey(s.r1, s.c1, s.r2, s.c2)));
    for (const wKey of Object.keys(state.walls)) {
      if (solEdgeSet.has(wKey)) {
        clearAdvice();
        transientErrors.edges.add(wKey);
        transientErrors.message = t.statusHintErrWall;
        transientErrors.type = 'error';
        triggerHaptic('error');
        triggerSound('error');
        renderAll();
        return;
      }
    }

    if (pendingAdvice) {
      const adv = pendingAdvice;
      clearAdvice();
      if (adv.action === 'link') {
        linkDomino(adv.r1, adv.c1, adv.r2, adv.c2, true);
        if (!state.isGameOver && transientErrors.type !== 'error') {
          transientErrors.message = t.adviceAppliedLink.replace('{pair}', adv.pairLabel);
          transientErrors.type = 'success';
          renderAll();
        }
      } else if (adv.action === 'wall') {
        toggleEdge(adv.r1, adv.c1, adv.r2, adv.c2);
        if (!state.isGameOver && transientErrors.type !== 'error') {
          transientErrors.message = t.adviceAppliedWall;
          transientErrors.type = 'success';
          renderAll();
        }
      } else if (adv.action === 'fallback_wall') {
        pushHistory();
        state.walls[adv.edge] = 'hint';
        const autoFormed = runAutoEncloseLoop();
        evaluateBoard(autoFormed, true);
        if (!state.isGameOver && !autoFormed) {
          transientErrors.message = t.adviceAppliedWall;
          transientErrors.type = 'success';
        }
        triggerHaptic(autoFormed ? 'medium' : 'light');
        triggerSound(autoFormed ? 'auto' : 'edgeAdd');
        saveGame();
        renderAll();
      }
      return;
    }

    const adv = findLogicalAdvice(state, t);
    if (adv) {
      pendingAdvice = adv;
      transientErrors.message = adv.message;
      transientErrors.type = 'success';
      triggerHaptic('light');
      triggerSound('xray');
      renderAll();
    }
  }

  // --- KONFETY A MODALY ---
  function clearConfetti() {
    const layer = document.getElementById('confetti-layer');
    if (layer) layer.innerHTML = '';
  }

  function launchConfetti() {
    const layer = document.getElementById('confetti-layer');
    if (!layer) return;
    clearConfetti();

    const colors = ['#fde047', '#f59e0b', '#fbbf24', '#f472b6', '#38bdf8', '#34d399'];
    for (let i = 0; i < 44; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.color = colors[i % colors.length];
      piece.style.animationDelay = `${Math.random() * 0.65}s`;
      piece.style.animationDuration = `${2.1 + Math.random() * 1.4}s`;
      piece.innerHTML = createSymbolSVG(i % 7, 18);
      layer.appendChild(piece);
    }
  }

  function showEndModal({ isMaster, unlockText }) {
    const t = I18N[state.lang];
    const totalDominoes = getTotalDominoCount(state.maxPip);
    const setLabel = getSetLabel(state.maxPip);
    const setWins = isMaster ? getMasterWins() : (Number(state.wins[state.maxPip]) || 0);

    const badgeText = isMaster
      ? `\uD83D\uDC51 ${t.endBadgeMaster.replace('{setLabel}', setLabel)}`
      : t.endBadgeStandard.replace('{setLabel}', setLabel);
    const titleText = isMaster ? t.endTitleMaster : t.endTitleStandard;
    const descText = (isMaster ? t.endDescMaster : t.endDescStandard)
      .replace('{total}', totalDominoes)
      .replace('{setLabel}', setLabel);
    const statWinsLabel = isMaster
      ? t.endStatMasterWins
      : t.endStatSetWins.replace('{setLabel}', setLabel);

    const logoAccent = isMaster ? '#fbbf24' : 'var(--accent)';
    const logoInner = isMaster ? '#0f172a' : 'var(--card)';
    const unlockHTML = unlockText ? `<div class="end-unlock-banner">\u2728 ${unlockText}</div>` : '';

    const container = document.getElementById('end-modal-content');
    container.innerHTML = `
      <div class="end-logo-frame ${isMaster ? 'perfect' : ''}">
        <svg width="38" height="38" viewBox="0 0 64 64" fill="none">
          <rect x="5" y="13" width="54" height="38" rx="10" fill="${logoAccent}"/>
          <rect x="8.5" y="16.5" width="47" height="31" rx="7" fill="${logoInner}"/>
          <line x1="32" y1="19" x2="32" y2="45" stroke="${logoAccent}" stroke-width="2.6" stroke-linecap="round"/>
          <circle cx="16.5" cy="24.5" r="2.7" fill="${logoAccent}"/>
          <circle cx="23.5" cy="39.5" r="2.7" fill="${logoAccent}"/>
          <circle cx="40.5" cy="24.5" r="2.7" fill="${logoAccent}"/>
          <circle cx="44" cy="32" r="2.7" fill="${logoAccent}"/>
          <circle cx="47.5" cy="39.5" r="2.7" fill="${logoAccent}"/>
        </svg>
      </div>
      <div class="end-badge ${isMaster ? 'perfect' : ''}">${badgeText}</div>
      <h2 class="end-title">${titleText}</h2>
      <p class="end-desc">${descText}</p>
      ${unlockHTML}
      <div class="end-stats-card">
        <div class="end-stat-item">
          <span class="end-stat-label">${t.endStatBoard}</span>
          <span class="end-stat-val">${totalDominoes}/${totalDominoes}</span>
        </div>
        <div class="end-stat-item">
          <span class="end-stat-label">${statWinsLabel}</span>
          <span class="end-stat-val ${isMaster ? 'gold' : ''}">${setWins}</span>
        </div>
      </div>
      <div class="end-actions">
        <button class="btn-modal-sec" id="btn-end-view">${t.endBtnView}</button>
        <button class="btn-modal-prim" id="btn-end-again">${t.endBtnAgain}</button>
      </div>
    `;

    document.getElementById('btn-end-view').addEventListener('click', () => {
      document.getElementById('modal-end').classList.remove('open');
    });
    document.getElementById('btn-end-again').addEventListener('click', () => {
      startNewGame(state.maxPip, state.genMode, state.boardShape);
    });

    endModalOpenedAt = Date.now();
    document.getElementById('modal-end').classList.add('open');
    if (isMaster) launchConfetti();
  }

  function restartCurrentGame() {
    clearConfetti();
    document.getElementById('modal-end').classList.remove('open');
    document.getElementById('modal-newgame').classList.remove('open');

    activeFilterPair = null;
    xrayValue = null;
    clearAdvice();
    state.walls = {};
    state.dominoes = [];
    state.checkpoint = null;
    state.history = [];
    state.isGameOver = false;
    transientErrors = {
      cells: new Set(),
      edges: new Set(),
      message: I18N[state.lang].statusRestarted,
      type: 'normal'
    };
    triggerHaptic('light');
    triggerSound('unlink');
    saveBoard();
    renderAll();
  }

  function startNewGame(diffMode = state.maxPip, genMode = state.genMode, boardShape = state.boardShape) {
    clearConfetti();
    document.getElementById('modal-end').classList.remove('open');
    document.getElementById('modal-newgame').classList.remove('open');

    activeFilterPair = null;
    xrayValue = null;
    clearAdvice();
    const puzzle = generatePuzzle(diffMode, genMode, boardShape);
    state.maxPip = diffMode;
    state.genMode = genMode;
    state.boardShape = boardShape;
    state.rows = puzzle.rows;
    state.cols = puzzle.cols;
    state.grid = puzzle.grid;
    state.solution = puzzle.solution;
    state.walls = {};
    state.dominoes = [];
    state.checkpoint = null;
    state.history = [];
    state.isGameOver = false;
    transientErrors = {
      cells: new Set(),
      edges: new Set(),
      message: genMode === 'unique' ? I18N[state.lang].statusStartUnique : I18N[state.lang].statusStart,
      type: 'normal'
    };
    triggerHaptic('light');
    saveGame();
    renderAll();
  }

  function simulateBatchWinForTesting() {
    document.getElementById('modal-settings').classList.remove('open');
    if (state.isGameOver) startNewGame(state.maxPip, state.genMode, state.boardShape);
    activeFilterPair = null;
    xrayValue = null;
    clearAdvice();
    state.checkpoint = null;
    state.walls = {};
    state.dominoes = state.solution.map(s => ({ ...s, trial: false }));
    state.wins[state.maxPip] = (Number(state.wins[state.maxPip]) || 0) + 4;
    evaluateBoard(false, true);
    saveGame();
    renderAll();
  }

  function resetAllWinsForTesting() {
    state.wins = { 4: 0, 5: 0, 6: 0, 7: 0 };
    sanitizeUnlocks();
    transientErrors.cells.clear();
    transientErrors.edges.clear();
    transientErrors.message = I18N[state.lang].statusStatsReset;
    transientErrors.type = 'normal';
    saveProfile();
    renderAll();
  }

  // --- VYKRESLOVANI ---
  function formatSingleValue(val) {
    if (state.displayMode === 'letters') return valueToLetter(val, state.maxPip);
    return String(val);
  }

  function renderCellValue(val) {
    if (val === -1) return '';
    if (state.displayMode === 'letters') return valueToLetter(val, state.maxPip);
    if (state.displayMode === 'symbols') return createSymbolSVG(val);
    if (state.displayMode === 'pips') return createPipHTML(val);
    return val;
  }

  function applyThemeAndI18n() {
    document.body.classList.remove('theme-emerald', 'theme-tournament', 'theme-royal');
    if (state.theme === 'emerald') document.body.classList.add('theme-emerald');
    if (state.theme === 'tournament') document.body.classList.add('theme-tournament');
    if (state.theme === 'royal') document.body.classList.add('theme-royal');

    const meta = document.getElementById('meta-theme-color');
    if (meta) {
      const colorMap = { classic: '#f0f2f5', tournament: '#f0f2f5', emerald: '#064e3b', royal: '#0f172a' };
      meta.setAttribute('content', colorMap[state.theme] || '#f0f2f5');
    }

    const t = I18N[state.lang];
    document.documentElement.lang = state.lang;

    document.getElementById('rotate-title').textContent = t.rotateTitle;
    document.getElementById('rotate-sub').textContent = t.rotateSub;

    document.getElementById('header-wins-label').textContent = t.winsLabel;
    document.getElementById('header-deck-label').textContent = t.deckLabel;
    document.getElementById('lbl-undo').textContent = t.undo;
    document.getElementById('lbl-rules').textContent = t.rules;
    document.getElementById('lbl-hint').textContent = t.hint;
    document.getElementById('lbl-new').textContent = t.newGame;

    document.getElementById('ng-title').textContent = t.ngTitle;
    document.getElementById('btn-ng-deal').textContent = t.ngDealNew;
    document.getElementById('btn-ng-restart').textContent = t.ngRestartSame;
    document.getElementById('btn-ng-cancel').textContent = t.ngCancel;

    document.getElementById('set-title').textContent = t.setTitle;
    document.getElementById('set-lang-label').textContent = t.setLangLabel;
    document.getElementById('set-av-label').textContent = t.setAvLabel;
    document.getElementById('toggle-sound').textContent = state.soundEnabled ? t.soundOn : t.soundOff;
    document.getElementById('toggle-haptics').textContent = state.hapticsEnabled ? t.hapticsOn : t.hapticsOff;

    document.getElementById('set-diff-label').textContent = t.setDiffLabel;
    document.getElementById('set-shape-label').textContent = t.setShapeLabel;
    document.getElementById('shape-rect').textContent = t.shapeRect;
    document.getElementById('shape-shaped').textContent = t.shapeShaped;
    document.getElementById('set-gen-label').textContent = t.setGenLabel;
    document.getElementById('gen-classic').textContent = t.genClassic;
    document.getElementById('gen-unique').textContent = t.genUnique;
    document.getElementById('set-theme-label').textContent = t.setThemeLabel;
    document.getElementById('set-display-label').textContent = t.setDisplayLabel;
    document.getElementById('set-unlock-info').innerHTML = t.setUnlockInfo;
    document.getElementById('btn-close-settings').textContent = t.saveAndClose;

    if (state.boardShape === 'shaped') {
      document.getElementById('diff-4').textContent = '1\u20134 (5\u00d75)';
      document.getElementById('diff-5').textContent = '1\u20135 (6\u00d76)';
      document.getElementById('diff-6').textContent = '1\u20136 (7\u00d77)';
      document.getElementById('diff-7').textContent = '0\u20136 (8\u00d78)';
    } else {
      document.getElementById('diff-4').textContent = '1\u20134 (4\u00d75)';
      document.getElementById('diff-5').textContent = '1\u20135 (5\u00d76)';
      document.getElementById('diff-6').textContent = '1\u20136 (6\u00d77)';
      document.getElementById('diff-7').textContent = '0\u20136 (7\u00d78)';
    }

    const rulesModal = document.getElementById('rules-modal-content');
    rulesModal.innerHTML = t.rulesHTML;
    document.getElementById('btn-close-rules').addEventListener('click', () => {
      document.getElementById('modal-rules').classList.remove('open');
    });
  }

  function renderAll() {
    applyThemeAndI18n();

    const t = I18N[state.lang];
    const totalDominoes = getTotalDominoCount(state.maxPip);

    document.getElementById('wins-count').textContent = getTotalWins();
    document.getElementById('deck-counter').textContent = `${state.dominoes.length}/${totalDominoes}`;

    document.getElementById('btn-undo').disabled = state.isGameOver || state.history.length === 0;
    document.getElementById('btn-hint').disabled = state.isGameOver;
    document.getElementById('board-wrapper').classList.toggle('locked', state.isGameOver);

    const usedPairCounts = {};
    const trialPairSet = new Set();
    for (const d of state.dominoes) {
      const pk = pairKey(state.grid[d.r1][d.c1], state.grid[d.r2][d.c2]);
      usedPairCounts[pk] = (usedPairCounts[pk] || 0) + 1;
      if (d.trial) trialPairSet.add(pk);
    }

    const filterPlacedCount = activeFilterPair ? (usedPairCounts[activeFilterPair] || 0) : 0;
    const filterCandidates = (activeFilterPair && !state.isGameOver) ? getFilterCandidatePairs(state, activeFilterPair) : [];
    const filterDividerEdges = new Set();
    if (activeFilterPair && filterPlacedCount >= 1) {
      for (const cand of filterCandidates) filterDividerEdges.add(cand.edge);
    }

    const sb = document.getElementById('status-bar');
    const stText = document.getElementById('status-text');
    const trialActions = document.getElementById('trial-actions');
    const inTrial = Boolean(state.checkpoint) && !state.isGameOver;

    sb.classList.remove('is-error', 'is-success', 'is-trial');
    if (xrayValue !== null) {
      const totalOfVal = state.maxPip + 1;
      let usedOfVal = 0;
      for (const d of state.dominoes) {
        if (state.grid[d.r1][d.c1] === xrayValue) usedOfVal++;
        if (state.grid[d.r2][d.c2] === xrayValue) usedOfVal++;
      }
      const leftOfVal = Math.max(0, totalOfVal - usedOfVal);
      stText.textContent = t.statusXray
        .replace('{val}', formatSingleValue(xrayValue))
        .replace('{used}', usedOfVal)
        .replace('{total}', totalOfVal)
        .replace('{left}', leftOfVal);
    } else {
      if (transientErrors.type === 'error') sb.classList.add('is-error');
      else if (transientErrors.type === 'success') sb.classList.add('is-success');
      else if (inTrial) sb.classList.add('is-trial');

      if (transientErrors.message) {
        stText.textContent = transientErrors.message;
      } else if (activeFilterPair && filterPlacedCount >= 1) {
        const [fa, fb] = activeFilterPair.split('-').map(Number);
        const flbl = formatPairLabel(fa, fb, state.displayMode, state.maxPip);
        stText.textContent = filterDividerEdges.size > 0
          ? t.statusFilterPlacedFound.replace('{pair}', flbl).replace('{count}', filterDividerEdges.size)
          : t.statusFilterPlacedClean.replace('{pair}', flbl);
      } else if (state.isGameOver) {
        stText.textContent = t.statusFinishedLocked;
      } else if (inTrial) {
        stText.textContent = t.statusTrialActive;
      } else {
        stText.textContent = state.genMode === 'unique' ? t.statusStartUnique : t.statusStart;
      }
    }

    if (state.isGameOver) {
      trialActions.innerHTML = '';
    } else if (inTrial) {
      trialActions.innerHTML = `
        <button class="trial-btn accept" id="btn-trial-accept">${t.trialAcceptBtn}</button>
        <button class="trial-btn discard" id="btn-trial-discard">${t.trialDiscardBtn}</button>
      `;
      document.getElementById('btn-trial-accept').addEventListener('click', () => acceptTrialMode(false));
      document.getElementById('btn-trial-discard').addEventListener('click', discardTrialMode);
    } else {
      trialActions.innerHTML = `<button class="trial-btn" id="btn-trial-start">${t.trialStartBtn}</button>`;
      document.getElementById('btn-trial-start').addEventListener('click', startTrialMode);
    }

    const boardGrid = document.getElementById('board-grid');
    boardGrid.style.setProperty('--cols', state.cols);
    boardGrid.style.setProperty('--rows', state.rows);

    const cellDominoDir = {};
    const cellInTrial = {};
    for (const d of state.dominoes) {
      if (Math.abs(d.r1 - d.r2) + Math.abs(d.c1 - d.c2) !== 1) continue;
      const dir = d.r1 === d.r2 ? 'h' : 'v';
      cellDominoDir[`${d.r1},${d.c1}`] = dir;
      cellDominoDir[`${d.r2},${d.c2}`] = dir;
      if (d.trial) {
        cellInTrial[`${d.r1},${d.c1}`] = true;
        cellInTrial[`${d.r2},${d.c2}`] = true;
      }
    }

    let cellsHTML = '';
    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) {
        const val = state.grid[r][c];
        const ck = `${r},${c}`;
        const hole = val === -1;
        const classes = ['cell', hole ? 'is-hole' : `val-${val}`];
        if (c === state.cols - 1) classes.push('last-col');
        if (r === state.rows - 1) classes.push('last-row');
        if (hole) {
          if (r > 0 && !isHole(r - 1, c, state.grid)) classes.push('hole-top');
          if (r < state.rows - 1 && !isHole(r + 1, c, state.grid)) classes.push('hole-bottom');
          if (c > 0 && !isHole(r, c - 1, state.grid)) classes.push('hole-left');
          if (c < state.cols - 1 && !isHole(r, c + 1, state.grid)) classes.push('hole-right');
        } else {
          if (cellDominoDir[ck] === 'h') classes.push('in-domino-h');
          if (cellDominoDir[ck] === 'v') classes.push('in-domino-v');
          if (cellInTrial[ck]) classes.push('in-trial');
          if (transientErrors.cells.has(ck)) classes.push('is-error');
          if (xrayValue !== null && val === xrayValue) {
            classes.push(cellDominoDir[ck] ? 'xray-used' : 'xray-free');
          }
        }
        cellsHTML += `<div class="${classes.join(' ')}" data-r="${r}" data-c="${c}">${renderCellValue(val)}</div>`;
      }
    }
    boardGrid.innerHTML = cellsHTML;

    const dominoOverlay = document.getElementById('domino-overlay');
    const cellW = 100 / state.cols;
    const cellH = 100 / state.rows;
    const padX = cellW * 0.065;
    const padY = cellH * 0.065;

    let pillsHTML = '';

    if (activeFilterPair && filterPlacedCount === 0 && !state.isGameOver) {
      for (const cand of filterCandidates) {
        const minR = Math.min(cand.r1, cand.r2);
        const minC = Math.min(cand.c1, cand.c2);
        const isHoriz = cand.r1 === cand.r2;
        const left = minC * cellW + padX;
        const top = minR * cellH + padY;
        const width = (isHoriz ? cellW * 2 : cellW) - padX * 2;
        const height = (isHoriz ? cellH : cellH * 2) - padY * 2;
        pillsHTML += `<div class="filter-pill" style="left:${left}%;top:${top}%;width:${width}%;height:${height}%;"></div>`;
      }
    }

    if (pendingAdvice && pendingAdvice.action === 'link' && !state.isGameOver) {
      const minR = Math.min(pendingAdvice.r1, pendingAdvice.r2);
      const minC = Math.min(pendingAdvice.c1, pendingAdvice.c2);
      const isHoriz = pendingAdvice.r1 === pendingAdvice.r2;
      const left = minC * cellW + padX;
      const top = minR * cellH + padY;
      const width = (isHoriz ? cellW * 2 : cellW) - padX * 2;
      const height = (isHoriz ? cellH : cellH * 2) - padY * 2;
      pillsHTML += `<div class="advice-pill" style="left:${left}%;top:${top}%;width:${width}%;height:${height}%;"></div>`;
    }

    for (const d of state.dominoes) {
      if (Math.abs(d.r1 - d.r2) + Math.abs(d.c1 - d.c2) !== 1) continue;
      const minR = Math.min(d.r1, d.r2);
      const minC = Math.min(d.c1, d.c2);
      const isHoriz = d.r1 === d.r2;
      const left = minC * cellW + padX;
      const top = minR * cellH + padY;
      const width = (isHoriz ? cellW * 2 : cellW) - padX * 2;
      const height = (isHoriz ? cellH : cellH * 2) - padY * 2;

      const v1 = state.grid[d.r1][d.c1];
      const v2 = state.grid[d.r2][d.c2];
      const pk = pairKey(v1, v2);
      const isDouble = v1 === v2;
      const cls = ['domino-pill', isHoriz ? 'horizontal' : 'vertical'];
      if (isDouble) cls.push('is-double');
      if (d.trial) cls.push('is-trial');
      if (activeFilterPair === pk && filterPlacedCount >= 1) cls.push('is-filtered-placed');
      if (usedPairCounts[pk] > 1) cls.push('is-error');

      let innerSVG = '';
      if (state.theme === 'royal') {
        const strokeRef = isDouble ? 'url(#royalPlatStroke)' : (isHoriz ? 'url(#royalGoldStroke)' : 'url(#royalRoseStroke)');
        const fillRef = isDouble ? 'url(#royalPlatFill)' : (isHoriz ? 'url(#royalGoldFill)' : 'url(#royalRoseFill)');
        const dashAttr = d.trial ? 'stroke-dasharray="5 3"' : '';
        const divLine = isHoriz
          ? `<line x1="50" y1="16" x2="50" y2="84" stroke="${strokeRef}" stroke-width="1.4" stroke-opacity="0.45"/>`
          : `<line x1="16" y1="50" x2="84" y2="50" stroke="${strokeRef}" stroke-width="1.4" stroke-opacity="0.45"/>`;
        innerSVG = `<svg viewBox="0 0 100 100" preserveAspectRatio="none"><rect x="1.5" y="1.5" width="97" height="97" rx="10" fill="${fillRef}" stroke="${strokeRef}" stroke-width="2.6" ${dashAttr} vector-effect="non-scaling-stroke"/>${divLine}</svg>`;
      }

      pillsHTML += `<div class="${cls.join(' ')}" style="left:${left}%;top:${top}%;width:${width}%;height:${height}%;">${innerSVG}</div>`;
    }
    dominoOverlay.innerHTML = pillsHTML;

    const edgesOverlay = document.getElementById('edges-overlay');
    let edgesHTML = '';
    const adviceEdgeKey = (pendingAdvice && (pendingAdvice.action === 'wall' || pendingAdvice.action === 'fallback_wall'))
      ? pendingAdvice.edge
      : null;

    if (!state.isGameOver) {
      for (let r = 0; r < state.rows; r++) {
        for (let c = 0; c < state.cols - 1; c++) {
          if (isHole(r, c, state.grid) || isHole(r, c + 1, state.grid)) continue;
          const k = edgeKey(r, c, r, c + 1);
          const wType = state.walls[k];
          const cls = ['edge-hit', 'v-edge'];
          if (wType === 'user') cls.push('active');
          if (wType === 'trial') cls.push('trial-edge');
          if (wType === 'hint') cls.push('hinted');
          if (transientErrors.edges.has(k)) cls.push('error-edge');
          if (k === adviceEdgeKey || filterDividerEdges.has(k)) cls.push('advice-edge');

          const left = (c + 1) * cellW;
          const top = r * cellH;
          edgesHTML += `<div class="${cls.join(' ')}" style="left:${left}%;top:${top}%;height:${cellH}%;" data-r1="${r}" data-c1="${c}" data-r2="${r}" data-c2="${c + 1}"><div class="edge-line"></div></div>`;
        }
      }

      for (let r = 0; r < state.rows - 1; r++) {
        for (let c = 0; c < state.cols; c++) {
          if (isHole(r, c, state.grid) || isHole(r + 1, c, state.grid)) continue;
          const k = edgeKey(r, c, r + 1, c);
          const wType = state.walls[k];
          const cls = ['edge-hit', 'h-edge'];
          if (wType === 'user') cls.push('active');
          if (wType === 'trial') cls.push('trial-edge');
          if (wType === 'hint') cls.push('hinted');
          if (transientErrors.edges.has(k)) cls.push('error-edge');
          if (k === adviceEdgeKey || filterDividerEdges.has(k)) cls.push('advice-edge');

          const left = c * cellW;
          const top = (r + 1) * cellH;
          edgesHTML += `<div class="${cls.join(' ')}" style="left:${left}%;top:${top}%;width:${cellW}%;" data-r1="${r}" data-c1="${c}" data-r2="${r + 1}" data-c2="${c}"><div class="edge-line"></div></div>`;
        }
      }
    }
    edgesOverlay.innerHTML = edgesHTML;

    const tray = document.getElementById('tray-grid');
    tray.classList.toggle('cols-5', state.maxPip === 4 || state.maxPip === 5);
    const { minVal, maxVal } = getValueRange(state.maxPip);
    let trayHTML = '';
    for (let a = minVal; a <= maxVal; a++) {
      for (let b = a; b <= maxVal; b++) {
        const pk = `${a}-${b}`;
        const cnt = usedPairCounts[pk] || 0;
        const cls = ['tray-item'];
        if (cnt === 1) {
          cls.push('used');
          if (trialPairSet.has(pk)) cls.push('trial-used');
        }
        if (cnt > 1) cls.push('duplicate');
        if (activeFilterPair === pk) cls.push('filtered');

        let itemLabel = `${a}\u2013${b}`;
        if (state.displayMode === 'letters') {
          itemLabel = `${valueToLetter(a, state.maxPip)}\u2013${valueToLetter(b, state.maxPip)}`;
        } else if (state.displayMode === 'symbols') {
          itemLabel = `${createSymbolSVG(a, 11.5, true)}<span>\u2013</span>${createSymbolSVG(b, 11.5, true)}`;
        }
        trayHTML += `<div class="${cls.join(' ')}" data-pk="${pk}">${itemLabel}</div>`;
      }
    }
    tray.innerHTML = trayHTML;

    tray.querySelectorAll('.tray-item').forEach(el => {
      el.addEventListener('click', () => {
        if (state.isGameOver) return;
        const pk = el.dataset.pk;
        activeFilterPair = (activeFilterPair === pk) ? null : pk;
        triggerHaptic('light');
        renderAll();
      });
    });

    const mw = getMasterWins();
    document.getElementById('stat-wins-4').textContent = state.wins[4] || 0;
    document.getElementById('stat-wins-5').textContent = state.wins[5] || 0;
    document.getElementById('stat-wins-6').textContent = state.wins[6] || 0;
    document.getElementById('stat-wins-7').textContent = state.wins[7] || 0;

    document.getElementById('toggle-sound').classList.toggle('active', state.soundEnabled);
    document.getElementById('toggle-haptics').classList.toggle('active', state.hapticsEnabled);

    document.getElementById('diff-4').classList.toggle('active', state.maxPip === 4);
    document.getElementById('diff-5').classList.toggle('active', state.maxPip === 5);
    document.getElementById('diff-6').classList.toggle('active', state.maxPip === 6);
    document.getElementById('diff-7').classList.toggle('active', state.maxPip === 7);

    document.getElementById('shape-rect').classList.toggle('active', state.boardShape === 'rect');
    document.getElementById('shape-shaped').classList.toggle('active', state.boardShape === 'shaped');

    document.getElementById('gen-classic').classList.toggle('active', state.genMode === 'classic');
    document.getElementById('gen-unique').classList.toggle('active', state.genMode === 'unique');

    document.getElementById('lang-cs').classList.toggle('active', state.lang === 'cs');
    document.getElementById('lang-en').classList.toggle('active', state.lang === 'en');

    document.getElementById('tile-digits-icon').textContent = getSetLabel(state.maxPip);
    document.getElementById('tile-letters-icon').textContent = state.maxPip === 7 ? 'A\u2013G' : `A\u2013${valueToLetter(state.maxPip, state.maxPip)}`;

    const uEmerald = mw >= CONSTANTS.MILESTONE_EMERALD;
    const uTour = mw >= CONSTANTS.MILESTONE_TOUR;
    const uSymbols = mw >= CONSTANTS.MILESTONE_SYMBOLS;
    const uPips = mw >= CONSTANTS.MILESTONE_PIPS;
    const uRoyal = mw >= CONSTANTS.MILESTONE_ROYAL;

    document.getElementById('tile-classic-name').textContent = t.tileClassic;
    document.getElementById('tile-classic-sub').textContent = t.subBase;
    document.getElementById('tile-emerald-name').textContent = t.tileEmerald;
    document.getElementById('tile-emerald-sub').textContent = uEmerald ? t.subUnlocked : `\uD83D\uDD12 ${t.subLock5}`;
    document.getElementById('tile-tour-name').textContent = t.tileTour;
    document.getElementById('tile-tour-sub').textContent = uTour ? t.subUnlocked : `\uD83D\uDD12 ${t.subLock10}`;
    document.getElementById('tile-royal-name').textContent = t.tileRoyal;
    document.getElementById('tile-royal-sub').textContent = uRoyal ? t.subUnlocked : `\uD83D\uDD12 ${t.subLock30}`;
    document.getElementById('tile-digits-name').textContent = t.tileDigits;
    document.getElementById('tile-digits-sub').textContent = t.subBase;
    document.getElementById('tile-letters-name').textContent = t.tileLetters;
    document.getElementById('tile-letters-sub').textContent = t.subBase;
    document.getElementById('tile-symbols-name').textContent = t.tileSymbols;
    document.getElementById('tile-symbols-sub').textContent = uSymbols ? t.subUnlocked : `\uD83D\uDD12 ${t.subLock15}`;
    document.getElementById('tile-pips-name').textContent = t.tilePips;
    document.getElementById('tile-pips-sub').textContent = uPips ? t.subUnlocked : `\uD83D\uDD12 ${t.subLock20}`;

    document.getElementById('tile-classic').classList.toggle('active', state.theme === 'classic');
    document.getElementById('tile-emerald').classList.toggle('locked', !uEmerald);
    document.getElementById('tile-emerald').classList.toggle('active', state.theme === 'emerald');
    document.getElementById('tile-tournament').classList.toggle('locked', !uTour);
    document.getElementById('tile-tournament').classList.toggle('active', state.theme === 'tournament');
    document.getElementById('tile-royal').classList.toggle('locked', !uRoyal);
    document.getElementById('tile-royal').classList.toggle('active', state.theme === 'royal');

    document.getElementById('tile-digits').classList.toggle('active', state.displayMode === 'digits');
    document.getElementById('tile-letters').classList.toggle('active', state.displayMode === 'letters');
    document.getElementById('tile-symbols').classList.toggle('locked', !uSymbols);
    document.getElementById('tile-symbols').classList.toggle('active', state.displayMode === 'symbols');
    document.getElementById('tile-pips').classList.toggle('locked', !uPips);
    document.getElementById('tile-pips').classList.toggle('active', state.displayMode === 'pips');
  }

  // --- DOTYKOVE OVLADANI A LONG-PRESS ---
  function setupPointerInteractions() {
    const wrapper = document.getElementById('board-wrapper');
    let startCell = null;
    let startX = 0;
    let startY = 0;
    let startedOnEdge = false;
    let swiped = false;
    let activePointerId = null;
    let lastPointerTime = 0;
    let longPressTimer = null;

    function getCellFromPoint(clientX, clientY) {
      const rect = wrapper.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      if (x < 0 || y < 0 || x >= rect.width || y >= rect.height) return null;
      const c = Math.floor((x / rect.width) * state.cols);
      const r = Math.floor((y / rect.height) * state.rows);
      if (r < 0 || r >= state.rows || c < 0 || c >= state.cols) return null;
      if (isHole(r, c, state.grid)) return null;
      return { r, c };
    }

    function highlightSwipeCell(cell) {
      document.querySelectorAll('.cell.swipe-active').forEach(el => el.classList.remove('swipe-active'));
      if (!cell) return;
      const el = document.querySelector(`.cell[data-r="${cell.r}"][data-c="${cell.c}"]`);
      if (el) el.classList.add('swipe-active');
    }

    function cancelLongPress() {
      if (longPressTimer !== null) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      if (xrayValue !== null) {
        xrayValue = null;
        renderAll();
      }
    }

    function resetPointerState() {
      cancelLongPress();
      highlightSwipeCell(null);
      if (activePointerId !== null && wrapper.hasPointerCapture && wrapper.hasPointerCapture(activePointerId)) {
        try { wrapper.releasePointerCapture(activePointerId); } catch (err) {}
      }
      activePointerId = null;
      startCell = null;
      startedOnEdge = false;
      swiped = false;
    }

    wrapper.addEventListener('pointerdown', (e) => {
      ensureAudioCtx();
      if (state.isGameOver) return;
      const now = Date.now();
      if (activePointerId !== null && (now - lastPointerTime > 1200)) resetPointerState();
      if (activePointerId !== null) return;

      activePointerId = e.pointerId;
      lastPointerTime = now;
      startX = e.clientX;
      startY = e.clientY;
      swiped = false;
      startedOnEdge = Boolean(e.target.closest('.edge-hit'));
      startCell = getCellFromPoint(e.clientX, e.clientY);

      if (!startedOnEdge && startCell) {
        highlightSwipeCell(startCell);
        const targetVal = state.grid[startCell.r][startCell.c];
        longPressTimer = setTimeout(() => {
          longPressTimer = null;
          if (!swiped && activePointerId !== null) {
            highlightSwipeCell(null);
            xrayValue = targetVal;
            triggerHaptic('light');
            triggerSound('xray');
            renderAll();
          }
        }, 380);
      }

      if (wrapper.setPointerCapture) {
        try { wrapper.setPointerCapture(e.pointerId); } catch (err) {}
      }
    });

    wrapper.addEventListener('pointermove', (e) => {
      if (state.isGameOver || e.pointerId !== activePointerId || !startCell || swiped) return;
      lastPointerTime = Date.now();

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const moveDist = Math.hypot(dx, dy);

      if (moveDist > 8 && longPressTimer !== null) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }

      if (xrayValue !== null && moveDist > 14) {
        xrayValue = null;
        renderAll();
      }

      const rect = wrapper.getBoundingClientRect();
      const cellSizePx = rect.width / state.cols;
      const thresholdPx = startedOnEdge ? Math.max(24, cellSizePx * 0.48) : Math.max(18, cellSizePx * 0.34);

      if (moveDist < thresholdPx) return;

      let targetR = startCell.r;
      let targetC = startCell.c;
      if (Math.abs(dx) > Math.abs(dy)) targetC += dx > 0 ? 1 : -1;
      else targetR += dy > 0 ? 1 : -1;

      if (targetR >= 0 && targetR < state.rows && targetC >= 0 && targetC < state.cols && !isHole(targetR, targetC, state.grid)) {
        swiped = true;
        highlightSwipeCell(null);
        linkDomino(startCell.r, startCell.c, targetR, targetC, true);
      }
    });

    wrapper.addEventListener('pointerup', (e) => {
      if (e.pointerId !== activePointerId) return;
      const wasSwiped = swiped;
      const wasXray = xrayValue !== null;
      resetPointerState();

      if (!state.isGameOver && !wasSwiped && !wasXray) {
        const elUnderFinger = document.elementFromPoint(e.clientX, e.clientY);
        const targetEdge = elUnderFinger ? elUnderFinger.closest('.edge-hit') : e.target.closest('.edge-hit');
        if (targetEdge) {
          toggleEdge(
            Number(targetEdge.dataset.r1),
            Number(targetEdge.dataset.c1),
            Number(targetEdge.dataset.r2),
            Number(targetEdge.dataset.c2)
          );
        }
      }
    });

    wrapper.addEventListener('pointercancel', resetPointerState);
    wrapper.addEventListener('lostpointercapture', resetPointerState);
    window.addEventListener('blur', resetPointerState);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) resetPointerState();
    });

    // Gesto Zpet: swipnuti zprava doleva mimo herni desku a otevrene modaly (Varianta A)
    let globalTouchId = null;
    let globalStartX = 0;
    let globalStartY = 0;
    let suppressNextClick = false;

    document.addEventListener('click', (e) => {
      if (suppressNextClick) {
        suppressNextClick = false;
        e.stopPropagation();
        e.preventDefault();
      }
    }, true);

    document.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) {
        globalTouchId = null;
        return;
      }
      if (state.isGameOver || state.history.length === 0) return;
      if (document.querySelector('.modal-backdrop.open')) return;
      if (e.target.closest('#board-wrapper')) return;

      const touch = e.changedTouches[0];
      globalTouchId = touch.identifier;
      globalStartX = touch.clientX;
      globalStartY = touch.clientY;
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
      if (globalTouchId === null) return;
      const touch = Array.from(e.changedTouches).find(t => t.identifier === globalTouchId);
      if (!touch) return;

      const dx = touch.clientX - globalStartX;
      const dy = touch.clientY - globalStartY;
      globalTouchId = null;

      if (state.isGameOver || state.history.length === 0) return;
      if (document.querySelector('.modal-backdrop.open')) return;

      if (dx <= -65 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        suppressNextClick = true;
        setTimeout(() => { suppressNextClick = false; }, 350);
        undoMove();
      }
    }, { passive: true });

    document.addEventListener('touchcancel', () => {
      globalTouchId = null;
    }, { passive: true });

    // Fallback pro ovladani mysi na desktopu (mimo dotykovou obrazovku)
    let mouseSwipeActive = false;
    let mouseStartX = 0;
    let mouseStartY = 0;

    document.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (state.isGameOver || state.history.length === 0) return;
      if (document.querySelector('.modal-backdrop.open')) return;
      if (e.target.closest('#board-wrapper')) return;

      mouseSwipeActive = true;
      mouseStartX = e.clientX;
      mouseStartY = e.clientY;
    });

    document.addEventListener('mouseup', (e) => {
      if (!mouseSwipeActive) return;
      mouseSwipeActive = false;

      const dx = e.clientX - mouseStartX;
      const dy = e.clientY - mouseStartY;

      if (state.isGameOver || state.history.length === 0) return;
      if (document.querySelector('.modal-backdrop.open')) return;

      if (dx <= -65 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        suppressNextClick = true;
        setTimeout(() => { suppressNextClick = false; }, 350);
        undoMove();
      }
    });
    
  function setupUI() {
    document.addEventListener('pointerdown', ensureAudioCtx, { passive: true });

    document.getElementById('btn-undo').addEventListener('click', undoMove);
    document.getElementById('btn-hint').addEventListener('click', useAdvice);

    document.getElementById('btn-new').addEventListener('click', () => {
      if (isGameInProgress()) {
        document.getElementById('modal-newgame').classList.add('open');
      } else {
        startNewGame(state.maxPip, state.genMode, state.boardShape);
      }
    });
    
    document.getElementById('btn-ng-deal').addEventListener('click', () => startNewGame(state.maxPip, state.genMode, state.boardShape));
    document.getElementById('btn-ng-restart').addEventListener('click', restartCurrentGame);
    document.getElementById('btn-ng-cancel').addEventListener('click', () => document.getElementById('modal-newgame').classList.remove('open'));

    document.getElementById('btn-confirm-cancel').addEventListener('click', () => {
      pendingConfirmAction = null;
      document.getElementById('modal-confirm').classList.remove('open');
    });

    document.getElementById('btn-confirm-ok').addEventListener('click', () => {
      document.getElementById('modal-confirm').classList.remove('open');
      if (typeof pendingConfirmAction === 'function') {
        const fn = pendingConfirmAction;
        pendingConfirmAction = null;
        fn();
      }
    });

    document.getElementById('btn-settings').addEventListener('click', () => document.getElementById('modal-settings').classList.add('open'));
    document.getElementById('btn-rules').addEventListener('click', () => document.getElementById('modal-rules').classList.add('open'));
    document.getElementById('btn-close-settings').addEventListener('click', () => document.getElementById('modal-settings').classList.remove('open'));

    document.querySelectorAll('.modal-backdrop').forEach(bg => {
      bg.addEventListener('click', (e) => {
        if (e.target === bg) {
          if (bg.id === 'modal-end' && (Date.now() - endModalOpenedAt < 500)) return;
          if (bg.id === 'modal-confirm') pendingConfirmAction = null;
          bg.classList.remove('open');
        }
      });
    });
    
    document.getElementById('toggle-sound').addEventListener('click', () => {
      state.soundEnabled = !state.soundEnabled;
      if (state.soundEnabled) triggerSound('edgeAdd');
      saveProfile();
      renderAll();
    });

    document.getElementById('toggle-haptics').addEventListener('click', () => {
      state.hapticsEnabled = !state.hapticsEnabled;
      if (state.hapticsEnabled) triggerHaptic('light');
      saveProfile();
      renderAll();
    });

    let titleTapCount = 0;
    let titleTapTimer = null;
    document.getElementById('set-title').addEventListener('click', () => {
      titleTapCount += 1;
      clearTimeout(titleTapTimer);
      if (titleTapCount >= 5) {
        titleTapCount = 0;
        simulateBatchWinForTesting();
      } else {
        titleTapTimer = setTimeout(() => { titleTapCount = 0; }, 1500);
      }
    });

    let statsTapCount = 0;
    let statsTapTimer = null;
    document.getElementById('stats-box').addEventListener('click', () => {
      statsTapCount += 1;
      clearTimeout(statsTapTimer);
      if (statsTapCount >= 5) {
        statsTapCount = 0;
        resetAllWinsForTesting();
      } else {
        statsTapTimer = setTimeout(() => { statsTapCount = 0; }, 1500);
      }
    });

    document.querySelectorAll('[data-diff]').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = Number(btn.dataset.diff);
        if (val !== state.maxPip) {
          requestConfirmAction(() => {
            state.maxPip = val;
            renderAll();
            document.getElementById('modal-settings').classList.remove('open');
            setTimeout(() => startNewGame(val, state.genMode, state.boardShape), 10);
          });
        }
      });
    });

    document.querySelectorAll('[data-shape]').forEach(btn => {
      btn.addEventListener('click', () => {
        const shape = btn.dataset.shape;
        if (shape !== state.boardShape) {
          requestConfirmAction(() => {
            state.boardShape = shape;
            renderAll();
            document.getElementById('modal-settings').classList.remove('open');
            setTimeout(() => startNewGame(state.maxPip, state.genMode, shape), 10);
          });
        }
      });
    });

    document.querySelectorAll('[data-gen]').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.gen;
        if (mode !== state.genMode) {
          requestConfirmAction(() => {
            state.genMode = mode;
            renderAll();
            document.getElementById('modal-settings').classList.remove('open');
            setTimeout(() => startNewGame(state.maxPip, mode, state.boardShape), 10);
          });
        }
      });
    });
    
    document.querySelectorAll('[data-lang]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.lang = btn.dataset.lang;
        saveProfile();
        renderAll();
      });
    });

    document.getElementById('tile-classic').addEventListener('click', () => { state.theme = 'classic'; saveProfile(); renderAll(); });
    document.getElementById('tile-emerald').addEventListener('click', () => { if (getMasterWins() >= CONSTANTS.MILESTONE_EMERALD) { state.theme = 'emerald'; saveProfile(); renderAll(); } });
    document.getElementById('tile-tournament').addEventListener('click', () => { if (getMasterWins() >= CONSTANTS.MILESTONE_TOUR) { state.theme = 'tournament'; saveProfile(); renderAll(); } });
    document.getElementById('tile-royal').addEventListener('click', () => { if (getMasterWins() >= CONSTANTS.MILESTONE_ROYAL) { state.theme = 'royal'; saveProfile(); renderAll(); } });

    document.getElementById('tile-digits').addEventListener('click', () => { state.displayMode = 'digits'; saveProfile(); renderAll(); });
    document.getElementById('tile-letters').addEventListener('click', () => { state.displayMode = 'letters'; saveProfile(); renderAll(); });
    document.getElementById('tile-symbols').addEventListener('click', () => { if (getMasterWins() >= CONSTANTS.MILESTONE_SYMBOLS) { state.displayMode = 'symbols'; saveProfile(); renderAll(); } });
    document.getElementById('tile-pips').addEventListener('click', () => { if (getMasterWins() >= CONSTANTS.MILESTONE_PIPS) { state.displayMode = 'pips'; saveProfile(); renderAll(); } });
  }

  async function initApp() {
    setupUI();
    setupPointerInteractions();
    const loaded = await loadGame();
    if (!loaded) {
      startNewGame(6, state.genMode, state.boardShape);
    } else {
      evaluateBoard(false, false);
      if (state.isGameOver) {
        transientErrors.message = I18N[state.lang].statusFinishedLocked;
        transientErrors.type = 'success';
      } else if (!transientErrors.message) {
        transientErrors.message = I18N[state.lang].statusResume;
      }
      renderAll();
    }
  }

  initApp();
})(window.Homino);
