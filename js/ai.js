"use strict";

/*
 * ai.js — computer opponent. Iterative-deepening negamax with alpha-beta
 * pruning, quiescence search (captures + forced check-evasions), killer-move
 * + MVV-LVA move ordering, and a material + piece-square-table evaluation
 * (bishop pair, doubled/passed pawns, tapered king safety).
 *
 * Six difficulty levels. The bottom four are fixed shallow depths with
 * blunder jitter (fast, deliberately imperfect). The top two are time-boxed
 * iterative deepening for real tactical strength — Warlord searches for
 * under a second, Archmage for a few seconds.
 */
const AI = (() => {

  const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
  const MATE_SCORE = 100000;
  const MAX_QPLY = 8;

  // Piece-square tables from white's perspective, index 0 = a8.
  const PST = {
    p: [
       0,  0,  0,  0,  0,  0,  0,  0,
      50, 50, 50, 50, 50, 50, 50, 50,
      10, 10, 20, 30, 30, 20, 10, 10,
       5,  5, 10, 25, 25, 10,  5,  5,
       0,  0,  0, 20, 20,  0,  0,  0,
       5, -5,-10,  0,  0,-10, -5,  5,
       5, 10, 10,-20,-20, 10, 10,  5,
       0,  0,  0,  0,  0,  0,  0,  0,
    ],
    n: [
      -50,-40,-30,-30,-30,-30,-40,-50,
      -40,-20,  0,  0,  0,  0,-20,-40,
      -30,  0, 10, 15, 15, 10,  0,-30,
      -30,  5, 15, 20, 20, 15,  5,-30,
      -30,  0, 15, 20, 20, 15,  0,-30,
      -30,  5, 10, 15, 15, 10,  5,-30,
      -40,-20,  0,  5,  5,  0,-20,-40,
      -50,-40,-30,-30,-30,-30,-40,-50,
    ],
    b: [
      -20,-10,-10,-10,-10,-10,-10,-20,
      -10,  0,  0,  0,  0,  0,  0,-10,
      -10,  0,  5, 10, 10,  5,  0,-10,
      -10,  5,  5, 10, 10,  5,  5,-10,
      -10,  0, 10, 10, 10, 10,  0,-10,
      -10, 10, 10, 10, 10, 10, 10,-10,
      -10,  5,  0,  0,  0,  0,  5,-10,
      -20,-10,-10,-10,-10,-10,-10,-20,
    ],
    r: [
       0,  0,  0,  0,  0,  0,  0,  0,
       5, 10, 10, 10, 10, 10, 10,  5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
       0,  0,  0,  5,  5,  0,  0,  0,
    ],
    q: [
      -20,-10,-10, -5, -5,-10,-10,-20,
      -10,  0,  0,  0,  0,  0,  0,-10,
      -10,  0,  5,  5,  5,  5,  0,-10,
       -5,  0,  5,  5,  5,  5,  0, -5,
        0,  0,  5,  5,  5,  5,  0, -5,
      -10,  5,  5,  5,  5,  5,  0,-10,
      -10,  0,  5,  0,  0,  0,  0,-10,
      -20,-10,-10, -5, -5,-10,-10,-20,
    ],
    k: [
      -30,-40,-40,-50,-50,-40,-40,-30,
      -30,-40,-40,-50,-50,-40,-40,-30,
      -30,-40,-40,-50,-50,-40,-40,-30,
      -30,-40,-40,-50,-50,-40,-40,-30,
      -20,-30,-30,-40,-40,-30,-30,-20,
      -10,-20,-20,-20,-20,-20,-20,-10,
       20, 20,  0,  0,  0,  0, 20, 20,
       20, 30, 10,  0,  0, 10, 30, 20,
    ],
    // used once material thins out — encourages king centralization for endgames
    k_end: [
      -50,-40,-30,-20,-20,-30,-40,-50,
      -30,-20,-10,  0,  0,-10,-20,-30,
      -30,-10, 20, 30, 30, 20,-10,-30,
      -30,-10, 30, 40, 40, 30,-10,-30,
      -30,-10, 30, 40, 40, 30,-10,-30,
      -30,-10, 20, 30, 30, 20,-10,-30,
      -30,-30,  0,  0,  0,  0,-30,-30,
      -50,-30,-30,-30,-30,-30,-30,-50,
    ],
  };

  // bonus for a passed pawn, indexed by ranks advanced from its start rank
  const PASSED_BONUS = [0, 6, 10, 18, 28, 42, 60, 0];

  const LEVELS = {
    squire:    { label: "Squire",      depth: 1, jitter: 140 },
    manatarms: { label: "Man-at-Arms", depth: 2, jitter: 55 },
    knight:    { label: "Knight",      depth: 3, jitter: 15 },
    champion:  { label: "Champion",    depth: 4, jitter: 0 },
    warlord:   { label: "Warlord",     timeMs: 900,  maxDepth: 10, jitter: 0 },
    archmage:  { label: "Archmage",    timeMs: 2800, maxDepth: 14, jitter: 0 },
  };

  // thrown to unwind the search stack the instant the time budget expires;
  // every make()/undo() pair below is wrapped in try/finally specifically
  // so this exception can propagate through many recursion levels without
  // ever leaving the live `game` object with an un-undone move.
  class TimeUp extends Error {}
  const TIME_UP = new TimeUp();

  let deadline = Infinity;
  let nodeCount = 0;
  let killers = [];   // killers[ply] = [move, move] — quiet moves that caused cutoffs

  function resetSearch(dl) {
    deadline = dl;
    nodeCount = 0;
    killers = [];
  }

  function checkTime() {
    if (performance.now() > deadline) throw TIME_UP;
  }

  function isPassed(B, i, color) {
    const file = i & 7, rank = i >> 3;
    const dir = color === "w" ? -1 : 1;
    for (let r = rank + dir; r >= 0 && r < 8; r += dir) {
      for (let df = -1; df <= 1; df++) {
        const f = file + df;
        if (f < 0 || f > 7) continue;
        const q = B[r * 8 + f];
        if (q && q[1] === "p" && q[0] !== color) return false;
      }
    }
    return true;
  }

  // Evaluation from white's perspective.
  function evaluate(game) {
    const B = game.board;
    let score = 0;
    let wBishops = 0, bBishops = 0;
    const filesW = new Array(8).fill(0), filesB = new Array(8).fill(0);
    let nonPawnMaterial = 0;
    for (let i = 0; i < 64; i++) {
      const p = B[i];
      if (!p) continue;
      if (p[1] === "p") (p[0] === "w" ? filesW : filesB)[i & 7]++;
      else if (p[1] !== "k") nonPawnMaterial += VAL[p[1]];
      if (p[1] === "b") { if (p[0] === "w") wBishops++; else bBishops++; }
    }
    const endgame = nonPawnMaterial <= 2400;
    for (let i = 0; i < 64; i++) {
      const p = B[i];
      if (!p) continue;
      const idx = p[0] === "w" ? i : i ^ 56;
      const pst = p[1] === "k" ? (endgame ? PST.k_end[idx] : PST.k[idx]) : PST[p[1]][idx];
      let v = VAL[p[1]] + pst;
      if (p[1] === "p" && isPassed(B, i, p[0])) {
        const rank = i >> 3;
        v += PASSED_BONUS[p[0] === "w" ? 7 - rank : rank];
      }
      score += p[0] === "w" ? v : -v;
    }
    if (wBishops >= 2) score += 30;
    if (bBishops >= 2) score -= 30;
    for (let f = 0; f < 8; f++) {
      if (filesW[f] > 1) score -= 14 * (filesW[f] - 1);
      if (filesB[f] > 1) score += 14 * (filesB[f] - 1);
    }
    return score;
  }

  function isCapture(game, m) {
    return !!game.board[m.to] || m.flags === "ep";
  }

  function sameMove(a, b) {
    return a.from === b.from && a.to === b.to && a.promo === b.promo;
  }

  function moveScore(game, m, ply) {
    if (isCapture(game, m)) {
      const victim = m.flags === "ep" ? VAL.p : VAL[game.board[m.to][1]];
      const attacker = VAL[game.board[m.from][1]];
      return 100000 + victim * 10 - attacker;   // MVV-LVA
    }
    if (m.promo === "q") return 95000;
    const k = killers[ply];
    if (k) {
      if (sameMove(k[0], m)) return 90000;
      if (k[1] && sameMove(k[1], m)) return 89000;
    }
    return 0;
  }

  function orderMoves(game, moves, ply) {
    moves.sort((a, b) => moveScore(game, b, ply) - moveScore(game, a, ply));
  }

  function addKiller(ply, m) {
    const k = killers[ply] || [];
    if (k[0] && sameMove(k[0], m)) return;
    killers[ply] = [m, k[0]].filter(Boolean).slice(0, 2);
  }

  // Quiescence: resolve captures (and, if in check, all evasions — a check
  // can't be safely ignored just because there's no capture available) so
  // the fixed-depth cutoff doesn't mistake "about to lose the queen" for a
  // quiet position.
  function quiesce(game, alpha, beta, qply) {
    nodeCount++;
    if ((nodeCount & 255) === 0) checkTime();
    const mover = game.turn;
    const inCheck = game.inCheck(mover);
    let best = inCheck ? -Infinity : (mover === "w" ? evaluate(game) : -evaluate(game));
    if (!inCheck) {
      if (best >= beta) return beta;
      if (best > alpha) alpha = best;
    }
    if (qply >= MAX_QPLY) return alpha;
    const pseudo = game.pseudoMoves(mover);
    const moves = inCheck ? pseudo : pseudo.filter(m => isCapture(game, m) || m.promo === "q");
    orderMoves(game, moves, qply);
    let hasLegal = false;
    for (const m of moves) {
      game.make(m);
      if (game.inCheck(mover)) { game.undo(); continue; }
      hasLegal = true;
      let score;
      try { score = -quiesce(game, -beta, -alpha, qply + 1); }
      finally { game.undo(); }
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    if (inCheck && !hasLegal) return -MATE_SCORE - (MAX_QPLY - qply);
    return best;
  }

  function search(game, depth, alpha, beta, ply) {
    nodeCount++;
    if ((nodeCount & 255) === 0) checkTime();
    if (depth <= 0) return quiesce(game, alpha, beta, 0);
    if (game.halfmove >= 100 || game.insufficient()) return 0;
    const mover = game.turn;
    const moves = game.pseudoMoves(mover);
    orderMoves(game, moves, ply);
    let hasLegal = false;
    let best = -Infinity;
    for (const m of moves) {
      game.make(m);
      if (game.inCheck(mover)) { game.undo(); continue; }
      hasLegal = true;
      let score;
      try { score = -search(game, depth - 1, -beta, -alpha, ply + 1); }
      finally { game.undo(); }
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) {
        if (!isCapture(game, m)) addKiller(ply, m);
        break;
      }
    }
    if (!hasLegal) return game.inCheck(mover) ? -MATE_SCORE - depth : 0;
    return best;
  }

  // Levels 1-4: a single fixed-depth search, fast enough to stay synchronous.
  function bestMoveFixed(game, cfg) {
    const moves = game.legalMoves();
    if (moves.length === 0) return null;
    for (let i = moves.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [moves[i], moves[j]] = [moves[j], moves[i]];
    }
    orderMoves(game, moves, 0);
    let best = null, bestScore = -Infinity;
    for (const m of moves) {
      game.make(m);
      let s;
      try { s = -search(game, cfg.depth - 1, -Infinity, Infinity, 1); }
      finally { game.undo(); }
      if (cfg.jitter) s += (Math.random() * 2 - 1) * cfg.jitter;
      if (s > bestScore) { bestScore = s; best = m; }
    }
    return best;
  }

  // Levels 5-6: iterative deepening against a wall-clock budget. Only a
  // fully-completed depth's result is ever trusted — if TimeUp cuts a
  // deeper iteration short, its partial results are discarded and the
  // previous (shallower) iteration's best move is returned instead.
  // Root moves are re-ordered by score after each completed depth so the
  // next iteration tries the likely-best move first (a cheap stand-in for
  // full PV move ordering).
  async function iterativeDeepen(game, cfg) {
    let ordering = game.legalMoves();
    if (ordering.length === 0) return null;
    if (ordering.length === 1) return ordering[0];
    let best = null;
    for (let depth = 1; depth <= cfg.maxDepth; depth++) {
      let iterBest = null, iterScore = -Infinity;
      const scored = [];
      try {
        for (const m of ordering) {
          game.make(m);
          let s;
          try { s = -search(game, depth - 1, -Infinity, Infinity, 1); }
          finally { game.undo(); }
          scored.push({ m, s });
          if (s > iterScore) { iterScore = s; iterBest = m; }
        }
      } catch (e) {
        if (e === TIME_UP) break;
        throw e;
      }
      best = iterBest;
      scored.sort((a, b) => b.s - a.s);
      ordering = scored.map(x => x.m);
      if (Math.abs(iterScore) > MATE_SCORE - 1000) break;   // forced mate found — no need to go deeper
      if (performance.now() > deadline) break;
      await new Promise(res => setTimeout(res, 0));         // yield so the board keeps animating while "thinking"
    }
    return best || ordering[0];
  }

  async function bestMove(game, level) {
    const cfg = LEVELS[level] || LEVELS.knight;
    if (typeof cfg.timeMs === "number") {
      resetSearch(performance.now() + cfg.timeMs);
      return await iterativeDeepen(game, cfg);
    }
    resetSearch(Infinity);
    return bestMoveFixed(game, cfg);
  }

  return { bestMove, evaluate, LEVELS };
})();

if (typeof module !== "undefined") module.exports = AI;
