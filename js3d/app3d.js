"use strict";

/*
 * app3d.js — game flow for the 3D board: input, AI turns, battles,
 * promotion, undo, status text, captured trays. Mirrors app.js but
 * renders through Board3D instead of the DOM board.
 */
(() => {

  const game = new Engine.Game();

  const state = {
    mode: "ai",
    aiLevel: "knight",
    playerColor: "w",
    battles: true,
    selected: null,
    legal: [],
    lastMove: null,
    busy: false,
    over: false,
  };

  const statusMsg = document.getElementById("status-msg");
  const turnBanner = document.getElementById("turn-banner");
  const capturedW = document.getElementById("captured-w");
  const capturedB = document.getElementById("captured-b");

  Board3D.init(document.getElementById("board3d"), onSquareClick);

  // ---------- status / trays ----------

  function factionName(c) { return c === "w" ? "The Ivory Order" : "The Obsidian Legion"; }

  function refreshStatus(extra) {
    if (state.over) return;
    const c = game.turn;
    turnBanner.innerHTML = `<span class="shield ${c === "w" ? "shield-w" : "shield-b"}"></span> ${factionName(c)} to move`;
    if (extra) statusMsg.textContent = extra;
    else if (game.inCheck()) statusMsg.textContent = "⚠ The " + (c === "w" ? "Ivory" : "Obsidian") + " King is in peril — check!";
    else statusMsg.textContent = state.mode === "ai" && c !== state.playerColor ? "The enemy plots its move…" : "";
  }

  function refreshMarkers() {
    state.legal = state.over ? [] : game.legalMoves();
    Board3D.setLastMove(state.lastMove);
    Board3D.setCheck(game.inCheck() ? game.kingSq(game.turn) : null);
    Board3D.setSelection(state.selected, state.legal, game);
  }

  function renderCaptured() {
    const fallen = { w: [], b: [] };
    for (const u of game.history) if (u.captured) fallen[u.captured[0]].push(u.captured);
    const order = { q: 0, r: 1, b: 2, n: 3, p: 4 };
    for (const c of ["w", "b"]) {
      const host = c === "w" ? capturedW : capturedB;
      fallen[c].sort((a, b) => order[a[1]] - order[b[1]]);
      host.innerHTML = fallen[c].length
        ? fallen[c].map(p => Pieces.svg(p[1], p[0])).join("")
        : `<span class="none">none yet</span>`;
    }
  }

  // ---------- input ----------

  function onSquareClick(i) {
    if (state.busy || state.over) return;
    if (state.mode === "ai" && game.turn !== state.playerColor) return;
    const p = game.board[i];
    if (state.selected != null) {
      const candidates = state.legal.filter(m => m.from === state.selected && m.to === i);
      if (candidates.length) {
        state.selected = null;
        Board3D.setSelection(null, [], game);
        if (candidates[0].promo) {
          choosePromotion(game.turn).then(promoType => {
            executeMove(candidates.find(m => m.promo === promoType));
          });
        } else {
          executeMove(candidates[0]);
        }
        return;
      }
    }
    if (p && p[0] === game.turn) {
      state.selected = state.selected === i ? null : i;
      if (state.selected != null) Sound.select();
    } else {
      state.selected = null;
    }
    refreshMarkers();
  }

  // ---------- moving ----------

  async function executeMove(move) {
    state.busy = true;
    Board3D.setSelection(null, [], game);
    const attacker = game.board[move.from];
    const capSq = move.flags === "ep" ? move.to + (attacker[0] === "w" ? 8 : -8) : move.to;
    const victim = game.board[capSq];

    if (victim && state.battles) {
      await Battle3D.play(move, game);
    } else if (victim) {
      Sound.clang();
      await Board3D.quickCapture(move, capSq);
    } else {
      Sound.move();
      await Board3D.animateMove(move, game);
    }

    game.make(move);
    Board3D.commitMove(move, game);
    state.lastMove = move;
    state.selected = null;
    state.busy = false;
    refreshMarkers();
    renderCaptured();
    refreshStatus();

    const st = game.status();
    if (st.over) return endGame(st);
    if (game.inCheck()) Sound.check();

    if (state.mode === "ai" && game.turn !== state.playerColor) aiTurn();
  }

  function aiTurn() {
    state.busy = true;
    refreshStatus("The enemy plots its move…");
    setTimeout(async () => {
      const move = await AI.bestMove(game, state.aiLevel);
      state.busy = false;
      if (move) executeMove(move);
    }, 450);
  }

  // ---------- promotion ----------

  function choosePromotion(color) {
    return new Promise(resolve => {
      const overlay = document.createElement("div");
      overlay.className = "modal-overlay";
      const box = document.createElement("div");
      box.className = "modal promo-modal";
      box.innerHTML = `<h2>A Footman Ascends!</h2><p>Choose thy champion:</p>`;
      const row = document.createElement("div");
      row.className = "promo-row";
      for (const t of ["q", "r", "b", "n"]) {
        const btn = document.createElement("button");
        btn.className = "promo-btn";
        btn.innerHTML = Pieces.svg(t, color) + `<span>${Pieces.TITLES[t]}</span>`;
        btn.addEventListener("click", () => { overlay.remove(); resolve(t); });
        row.appendChild(btn);
      }
      box.appendChild(row);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
    });
  }

  // ---------- game over ----------

  function endGame(st) {
    state.over = true;
    refreshMarkers();
    let title, sub;
    if (st.reason === "checkmate") {
      title = st.result === "w" ? "The Ivory Order Triumphs!" : "The Obsidian Legion Triumphs!";
      sub = "Checkmate — the enemy king has fallen.";
      const humanWon = state.mode !== "ai" || st.result === state.playerColor;
      humanWon ? Sound.fanfare() : Sound.defeat();
    } else {
      title = "An Uneasy Truce";
      sub = st.reason === "stalemate" ? "Stalemate — no legal moves remain."
        : st.reason === "fifty" ? "Draw — fifty moves without progress."
        : "Draw — neither army can force victory.";
      Sound.check();
    }
    turnBanner.textContent = "";
    statusMsg.textContent = sub;

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "gameover-overlay";
    const box = document.createElement("div");
    box.className = "modal gameover-modal";
    const crown = st.reason === "checkmate"
      ? Pieces.svg("k", st.result) : Pieces.svg("k", "w") + Pieces.svg("k", "b");
    box.innerHTML = `<div class="go-art">${crown}</div><h2>${title}</h2><p>${sub}</p>`;
    const btns = document.createElement("div");
    btns.className = "go-btns";
    const again = document.createElement("button");
    again.className = "btn";
    again.textContent = "⚔ New Campaign";
    again.addEventListener("click", () => { overlay.remove(); newGame(); });
    const view = document.createElement("button");
    view.className = "btn btn-ghost";
    view.textContent = "View Board";
    view.addEventListener("click", () => overlay.remove());
    btns.append(again, view);
    box.appendChild(btns);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  // ---------- controls ----------

  function newGame() {
    document.getElementById("gameover-overlay")?.remove();
    game.load(Engine.START_FEN);
    state.selected = null;
    state.lastMove = null;
    state.busy = false;
    state.over = false;
    Board3D.fullSync(game);
    Board3D.setHome(state.mode === "ai" ? state.playerColor : "w");
    refreshMarkers();
    renderCaptured();
    refreshStatus();
    if (state.mode === "ai" && game.turn !== state.playerColor) aiTurn();
  }

  function undo() {
    if (state.busy || game.history.length === 0) return;
    document.getElementById("gameover-overlay")?.remove();
    state.over = false;
    game.undo();
    if (state.mode === "ai" && game.turn !== state.playerColor && game.history.length) game.undo();
    state.lastMove = game.history.length ? game.history[game.history.length - 1].move : null;
    state.selected = null;
    Board3D.fullSync(game);
    refreshMarkers();
    renderCaptured();
    refreshStatus();
  }

  const $ = id => document.getElementById(id);

  $("mode-select").addEventListener("change", e => {
    state.mode = e.target.value;
    $("ai-options").style.display = state.mode === "ai" ? "" : "none";
    newGame();
  });
  $("level-select").addEventListener("change", e => { state.aiLevel = e.target.value; });
  $("color-select").addEventListener("change", e => { state.playerColor = e.target.value; newGame(); });
  $("btn-new").addEventListener("click", newGame);
  $("btn-undo").addEventListener("click", undo);
  $("btn-flip").addEventListener("click", () => Board3D.flipCamera());
  $("toggle-battles").addEventListener("change", e => { state.battles = e.target.checked; });
  $("toggle-sound").addEventListener("change", e => { Sound.setMuted(!e.target.checked); });
  $("toggle-sound").checked = !Sound.muted;
  $("toggle-gfx").checked = Gfx3D.rich;
  $("toggle-gfx").disabled = !Gfx3D.supported;
  $("toggle-gfx").addEventListener("change", e => { e.target.checked = Board3D.setRichGraphics(e.target.checked); });

  // Debug hooks (used by dev tooling; harmless in production)
  window.debugState = () => ({ turn: game.turn, busy: state.busy, over: state.over });
  window.debugBoard = () => game.board.map((p, i) => p ? `${i}:${p}` : null).filter(Boolean).join(" ");
  window.debugClick = sq => onSquareClick(sq);
  window.debugLoad = fen => {
    game.load(fen);
    state.selected = null;
    state.lastMove = null;
    state.over = false;
    state.busy = false;
    Board3D.fullSync(game);
    refreshMarkers();
    renderCaptured();
    refreshStatus();
  };

  refreshStatus("Summoning the armies…");
  Pieces3D.load().then(ok => {
    if (!ok) console.warn("Character models unavailable — using built-in pieces.");
    Board3D.fullSync(game);
    refreshMarkers();
    renderCaptured();
    refreshStatus();
  });
})();
