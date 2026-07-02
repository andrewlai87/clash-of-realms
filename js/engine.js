"use strict";

/*
 * engine.js — the chess rules engine.
 * Board is a flat array of 64 squares, index 0 = a8 (top-left), 63 = h1.
 * Pieces are 2-char strings: color ('w'/'b') + type ('p','n','b','r','q','k').
 * Moves are objects: { from, to, flags, promo }
 *   flags: null | 'double' | 'ep' | 'castleK' | 'castleQ'
 *   promo: null | 'q' | 'r' | 'b' | 'n'
 */
const Engine = (() => {

  const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  const KNIGHT_D = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
  const KING_D   = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  const BISHOP_D = [[-1,-1],[-1,1],[1,-1],[1,1]];
  const ROOK_D   = [[-1,0],[1,0],[0,-1],[0,1]];
  const QUEEN_D  = BISHOP_D.concat(ROOK_D);

  const other = c => (c === "w" ? "b" : "w");
  const sqIndex = s => (8 - +s[1]) * 8 + (s.charCodeAt(0) - 97);
  const sqName = i => "abcdefgh"[i & 7] + (8 - (i >> 3));

  function fromFEN(fen) {
    const [placement, turn, castling, ep, half, full] = fen.trim().split(/\s+/);
    const board = new Array(64).fill(null);
    let i = 0;
    for (const ch of placement) {
      if (ch === "/") continue;
      if (ch >= "1" && ch <= "8") { i += +ch; continue; }
      board[i++] = (ch === ch.toUpperCase() ? "w" : "b") + ch.toLowerCase();
    }
    return {
      board,
      turn: turn || "w",
      castling: {
        wK: (castling || "").includes("K"),
        wQ: (castling || "").includes("Q"),
        bK: (castling || "").includes("k"),
        bQ: (castling || "").includes("q"),
      },
      ep: !ep || ep === "-" ? -1 : sqIndex(ep),
      halfmove: +half || 0,
      fullmove: +full || 1,
    };
  }

  // Is `sq` attacked by any piece of color `by`?
  function isAttacked(board, sq, by) {
    if (sq < 0) return false;
    const r = sq >> 3, c = sq & 7;
    const pr = by === "w" ? r + 1 : r - 1;
    if (pr >= 0 && pr < 8) {
      if (c > 0 && board[pr * 8 + c - 1] === by + "p") return true;
      if (c < 7 && board[pr * 8 + c + 1] === by + "p") return true;
    }
    for (const [dr, dc] of KNIGHT_D) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr * 8 + nc] === by + "n") return true;
    }
    for (const [dr, dc] of KING_D) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr * 8 + nc] === by + "k") return true;
    }
    for (const [dr, dc] of ROOK_D) {
      let nr = r + dr, nc = c + dc;
      while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
        const p = board[nr * 8 + nc];
        if (p) { if (p === by + "r" || p === by + "q") return true; break; }
        nr += dr; nc += dc;
      }
    }
    for (const [dr, dc] of BISHOP_D) {
      let nr = r + dr, nc = c + dc;
      while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
        const p = board[nr * 8 + nc];
        if (p) { if (p === by + "b" || p === by + "q") return true; break; }
        nr += dr; nc += dc;
      }
    }
    return false;
  }

  class Game {
    constructor(fen = START_FEN) { this.load(fen); }

    load(fen) {
      const s = fromFEN(fen);
      this.board = s.board;
      this.turn = s.turn;
      this.castling = s.castling;
      this.ep = s.ep;
      this.halfmove = s.halfmove;
      this.fullmove = s.fullmove;
      this.history = [];
    }

    kingSq(color) {
      const k = color + "k";
      for (let i = 0; i < 64; i++) if (this.board[i] === k) return i;
      return -1;
    }

    inCheck(color = this.turn) {
      return isAttacked(this.board, this.kingSq(color), other(color));
    }

    genCastles(color, push) {
      const B = this.board;
      const home = color === "w" ? 56 : 0;
      const e = home + 4;
      if (B[e] !== color + "k") return;
      const enemy = other(color);
      const kSide = color === "w" ? this.castling.wK : this.castling.bK;
      const qSide = color === "w" ? this.castling.wQ : this.castling.bQ;
      if (kSide && B[home + 7] === color + "r" && !B[e + 1] && !B[e + 2] &&
          !isAttacked(B, e, enemy) && !isAttacked(B, e + 1, enemy) && !isAttacked(B, e + 2, enemy))
        push(e, e + 2, "castleK");
      if (qSide && B[home] === color + "r" && !B[e - 1] && !B[e - 2] && !B[e - 3] &&
          !isAttacked(B, e, enemy) && !isAttacked(B, e - 1, enemy) && !isAttacked(B, e - 2, enemy))
        push(e, e - 2, "castleQ");
    }

    pseudoMoves(color) {
      const B = this.board, out = [];
      const push = (from, to, flags = null, promo = null) => out.push({ from, to, flags, promo });
      for (let from = 0; from < 64; from++) {
        const p = B[from];
        if (!p || p[0] !== color) continue;
        const r = from >> 3, c = from & 7, t = p[1];
        if (t === "p") {
          const dir = color === "w" ? -1 : 1;
          const startRow = color === "w" ? 6 : 1;
          const promoRow = color === "w" ? 0 : 7;
          const fwd = from + dir * 8;
          if (!B[fwd]) {
            if ((fwd >> 3) === promoRow) for (const pr of "qrbn") push(from, fwd, null, pr);
            else push(from, fwd);
            if (r === startRow && !B[from + dir * 16]) push(from, from + dir * 16, "double");
          }
          for (const dc of [-1, 1]) {
            const nc = c + dc;
            if (nc < 0 || nc > 7) continue;
            const to = fwd + dc;
            if (B[to] && B[to][0] !== color) {
              if ((to >> 3) === promoRow) for (const pr of "qrbn") push(from, to, null, pr);
              else push(from, to);
            } else if (to === this.ep && !B[to]) {
              push(from, to, "ep");
            }
          }
        } else if (t === "n" || t === "k") {
          for (const [dr, dc] of (t === "n" ? KNIGHT_D : KING_D)) {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
            const to = nr * 8 + nc;
            if (!B[to] || B[to][0] !== color) push(from, to);
          }
          if (t === "k") this.genCastles(color, push);
        } else {
          const dirs = t === "b" ? BISHOP_D : t === "r" ? ROOK_D : QUEEN_D;
          for (const [dr, dc] of dirs) {
            let nr = r + dr, nc = c + dc;
            while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
              const to = nr * 8 + nc;
              if (!B[to]) push(from, to);
              else { if (B[to][0] !== color) push(from, to); break; }
              nr += dr; nc += dc;
            }
          }
        }
      }
      return out;
    }

    legalMoves() {
      const out = [];
      const mover = this.turn;
      for (const m of this.pseudoMoves(mover)) {
        this.make(m);
        if (!this.inCheck(mover)) out.push(m);
        this.undo();
      }
      return out;
    }

    make(move) {
      const B = this.board, color = this.turn;
      const piece = B[move.from];
      let capSq = move.to;
      if (move.flags === "ep") capSq = move.to + (color === "w" ? 8 : -8);
      const undo = {
        move, piece, capSq,
        captured: B[capSq],
        castling: { ...this.castling },
        ep: this.ep,
        halfmove: this.halfmove,
      };
      B[capSq] = null;
      B[move.from] = null;
      B[move.to] = move.promo ? color + move.promo : piece;
      if (move.flags === "castleK") { B[move.to - 1] = B[move.to + 1]; B[move.to + 1] = null; }
      if (move.flags === "castleQ") { B[move.to + 1] = B[move.to - 2]; B[move.to - 2] = null; }
      if (piece[1] === "k") {
        if (color === "w") { this.castling.wK = this.castling.wQ = false; }
        else { this.castling.bK = this.castling.bQ = false; }
      }
      const CORNER = { 56: "wQ", 63: "wK", 0: "bQ", 7: "bK" };
      if (CORNER[move.from]) this.castling[CORNER[move.from]] = false;
      if (CORNER[move.to]) this.castling[CORNER[move.to]] = false;
      this.ep = move.flags === "double" ? (move.from + move.to) / 2 : -1;
      this.halfmove = (piece[1] === "p" || undo.captured) ? 0 : this.halfmove + 1;
      if (color === "b") this.fullmove++;
      this.turn = other(color);
      this.history.push(undo);
      return undo;
    }

    undo() {
      const u = this.history.pop();
      if (!u) return;
      const B = this.board, move = u.move;
      this.turn = other(this.turn);
      B[move.from] = u.piece;
      B[move.to] = null;
      if (u.captured) B[u.capSq] = u.captured;
      if (move.flags === "castleK") { B[move.to + 1] = B[move.to - 1]; B[move.to - 1] = null; }
      if (move.flags === "castleQ") { B[move.to - 2] = B[move.to + 1]; B[move.to + 1] = null; }
      this.castling = u.castling;
      this.ep = u.ep;
      this.halfmove = u.halfmove;
      if (this.turn === "b") this.fullmove--;
    }

    insufficient() {
      const minors = [];
      for (let i = 0; i < 64; i++) {
        const p = this.board[i];
        if (!p || p[1] === "k") continue;
        if (p[1] === "p" || p[1] === "r" || p[1] === "q") return false;
        minors.push({ t: p[1], sqColor: ((i >> 3) + (i & 7)) & 1 });
      }
      if (minors.length <= 1) return true;
      return minors.every(m => m.t === "b" && m.sqColor === minors[0].sqColor);
    }

    status() {
      const moves = this.legalMoves();
      if (moves.length === 0) {
        if (this.inCheck()) return { over: true, result: other(this.turn), reason: "checkmate" };
        return { over: true, result: "draw", reason: "stalemate" };
      }
      if (this.halfmove >= 100) return { over: true, result: "draw", reason: "fifty" };
      if (this.insufficient()) return { over: true, result: "draw", reason: "material" };
      return { over: false };
    }
  }

  function perft(game, depth) {
    if (depth === 0) return 1;
    let n = 0;
    for (const m of game.legalMoves()) {
      game.make(m);
      n += perft(game, depth - 1);
      game.undo();
    }
    return n;
  }

  return { Game, perft, isAttacked, other, sqIndex, sqName, START_FEN };
})();

if (typeof module !== "undefined") module.exports = Engine;
