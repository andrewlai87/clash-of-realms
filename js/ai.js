"use strict";

/*
 * ai.js — computer opponent. Negamax with alpha-beta pruning,
 * material + piece-square-table evaluation, capture-first move ordering.
 * Difficulty = search depth + score jitter (blunder factor).
 */
const AI = (() => {

  const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

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
  };

  const LEVELS = {
    easy:   { depth: 1, jitter: 120 },
    medium: { depth: 2, jitter: 20 },
    hard:   { depth: 3, jitter: 0 },
  };

  // Evaluation from white's perspective.
  function evaluate(game) {
    let score = 0;
    const B = game.board;
    for (let i = 0; i < 64; i++) {
      const p = B[i];
      if (!p) continue;
      const v = VAL[p[1]] + PST[p[1]][p[0] === "w" ? i : i ^ 56];
      score += p[0] === "w" ? v : -v;
    }
    return score;
  }

  function victimValue(game, m) {
    const target = game.board[m.to];
    if (target) return VAL[target[1]];
    if (m.flags === "ep") return VAL.p;
    return 0;
  }

  function orderMoves(game, moves) {
    moves.sort((a, b) => victimValue(game, b) - victimValue(game, a));
  }

  function search(game, depth, alpha, beta) {
    const moves = game.legalMoves();
    if (moves.length === 0) return game.inCheck() ? -100000 - depth : 0;
    if (game.halfmove >= 100 || game.insufficient()) return 0;
    if (depth <= 0) return game.turn === "w" ? evaluate(game) : -evaluate(game);
    orderMoves(game, moves);
    let best = -Infinity;
    for (const m of moves) {
      game.make(m);
      const s = -search(game, depth - 1, -beta, -alpha);
      game.undo();
      if (s > best) best = s;
      if (s > alpha) alpha = s;
      if (alpha >= beta) break;
    }
    return best;
  }

  function bestMove(game, level) {
    const cfg = LEVELS[level] || LEVELS.medium;
    const moves = game.legalMoves();
    if (moves.length === 0) return null;
    // Shuffle for variety, then bring captures forward for pruning.
    for (let i = moves.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [moves[i], moves[j]] = [moves[j], moves[i]];
    }
    orderMoves(game, moves);
    let best = null, bestScore = -Infinity;
    for (const m of moves) {
      game.make(m);
      let s = -search(game, cfg.depth - 1, -Infinity, Infinity);
      game.undo();
      if (cfg.jitter) s += (Math.random() * 2 - 1) * cfg.jitter;
      if (s > bestScore) { bestScore = s; best = m; }
    }
    return best;
  }

  return { bestMove, evaluate, LEVELS };
})();

if (typeof module !== "undefined") module.exports = AI;
