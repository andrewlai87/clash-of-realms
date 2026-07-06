"use strict";

/*
 * app.js — UI wiring: board rendering, input, game flow, AI turns,
 * battle triggering, promotion, undo, captured-piece trays.
 */
(() => {

  const game = new Engine.Game();

  const state = {
    mode: "ai",            // 'ai' | '2p'
    aiLevel: "knight",
    playerColor: "w",      // human side in AI mode
    orientation: "w",
    battles: true,
    selected: null,        // selected square index
    legal: [],             // legal moves cached for current turn
    lastMove: null,
    busy: false,           // battle playing or AI thinking
    over: false,
  };

  const boardEl = document.getElementById("board");
  const statusMsg = document.getElementById("status-msg");
  const turnBanner = document.getElementById("turn-banner");
  const capturedW = document.getElementById("captured-w");
  const capturedB = document.getElementById("captured-b");
  const squares = [];

  // ---------- board construction ----------

  for (let i = 0; i < 64; i++) {
    const sq = document.createElement("div");
    sq.dataset.i = i;
    sq.addEventListener("click", () => onSquareClick(i));
    squares.push(sq);
  }

  function layoutBoard() {
    boardEl.innerHTML = "";
    const order = [];
    for (let i = 0; i < 64; i++) order.push(state.orientation === "w" ? i : 63 - i);
    for (const i of order) boardEl.appendChild(squares[i]);
    for (const i of order) {
      const r = i >> 3, c = i & 7;
      const sq = squares[i];
      sq.className = "sq " + (((r + c) & 1) === 0 ? "light" : "dark");
      sq.querySelectorAll(".coord").forEach(e => e.remove());
      const isBottomRow = state.orientation === "w" ? r === 7 : r === 0;
      const isLeftCol = state.orientation === "w" ? c === 0 : c === 7;
      if (isBottomRow) {
        const f = document.createElement("span");
        f.className = "coord coord-file";
        f.textContent = "abcdefgh"[c];
        sq.appendChild(f);
      }
      if (isLeftCol) {
        const rk = document.createElement("span");
        rk.className = "coord coord-rank";
        rk.textContent = 8 - r;
        sq.appendChild(rk);
      }
    }
  }

  // ---------- rendering ----------

  function render() {
    state.legal = state.over ? [] : game.legalMoves();
    const checkedKing = game.inCheck() ? game.kingSq(game.turn) : -1;
    for (let i = 0; i < 64; i++) {
      const sq = squares[i];
      const p = game.board[i];
      sq.querySelectorAll("svg, .marker").forEach(e => e.remove());
      sq.classList.remove("sel", "mv", "cap", "last", "check");
      if (p) sq.insertAdjacentHTML("beforeend", Pieces.svg(p[1], p[0]));
      if (state.lastMove && (i === state.lastMove.from || i === state.lastMove.to)) sq.classList.add("last");
      if (i === checkedKing) sq.classList.add("check");
    }
    if (state.selected != null) {
      squares[state.selected].classList.add("sel");
      for (const m of state.legal) {
        if (m.from !== state.selected) continue;
        const target = squares[m.to];
        const marker = document.createElement("div");
        const isCap = game.board[m.to] || m.flags === "ep";
        marker.className = "marker " + (isCap ? "marker-cap" : "marker-mv");
        target.appendChild(marker);
        target.classList.add(isCap ? "cap" : "mv");
      }
    }
    renderCaptured();
    renderStatus();
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

  function factionName(c) { return c === "w" ? "The Ivory Order" : "The Obsidian Legion"; }

  function renderStatus(extra) {
    if (state.over) return;
    const c = game.turn;
    turnBanner.innerHTML = `<span class="shield ${c === "w" ? "shield-w" : "shield-b"}"></span> ${factionName(c)} to move`;
    if (extra) statusMsg.textContent = extra;
    else if (game.inCheck()) statusMsg.textContent = "⚠ The " + (c === "w" ? "Ivory" : "Obsidian") + " King is in peril — check!";
    else statusMsg.textContent = state.mode === "ai" && c !== state.playerColor ? "The enemy plots its move…" : "";
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
        if (candidates[0].promo) {
          choosePromotion(game.turn).then(promoType => {
            const move = candidates.find(m => m.promo === promoType);
            executeMove(move);
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
    render();
  }

  // ---------- moving ----------

  async function executeMove(move) {
    state.busy = true;
    const attacker = game.board[move.from];
    const victim = move.flags === "ep"
      ? game.board[move.to + (attacker[0] === "w" ? 8 : -8)]
      : game.board[move.to];

    if (victim && state.battles) {
      squares[move.to].classList.add("target");
      await Battle.play(attacker, victim);
      squares[move.to].classList.remove("target");
    } else if (victim) {
      Sound.clang();
    } else if (move.flags === "castleK" || move.flags === "castleQ") {
      Sound.move();
    } else {
      Sound.move();
    }

    game.make(move);
    state.lastMove = move;
    state.selected = null;
    state.busy = false;
    render();

    const st = game.status();
    if (st.over) return endGame(st);
    if (game.inCheck()) Sound.check();

    if (state.mode === "ai" && game.turn !== state.playerColor) aiTurn();
  }

  function aiTurn() {
    state.busy = true;
    renderStatus("The enemy plots its move…");
    setTimeout(async () => {
      const move = await AI.bestMove(game, state.aiLevel);
      state.busy = false;
      if (move) executeMove(move);
    }, 420);
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
        btn.addEventListener("click", () => {
          overlay.remove();
          resolve(t);
        });
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
    render();
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
    state.orientation = state.mode === "ai" ? state.playerColor : "w";
    layoutBoard();
    render();
    if (state.mode === "ai" && game.turn !== state.playerColor) aiTurn();
  }

  function undo() {
    if (state.busy || game.history.length === 0) return;
    document.getElementById("gameover-overlay")?.remove();
    state.over = false;
    game.undo();
    // In AI mode also take back the AI's reply so it's the human's turn again.
    if (state.mode === "ai" && game.turn !== state.playerColor && game.history.length) game.undo();
    state.lastMove = game.history.length ? game.history[game.history.length - 1].move : null;
    state.selected = null;
    render();
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
  $("btn-flip").addEventListener("click", () => {
    state.orientation = Engine.other(state.orientation);
    layoutBoard();
    render();
  });
  $("toggle-battles").addEventListener("change", e => { state.battles = e.target.checked; });
  $("toggle-sound").addEventListener("change", e => { Sound.setMuted(!e.target.checked); });
  $("toggle-sound").checked = !Sound.muted;

  // Debug hook: window.debugBattle('wn','bp')
  window.debugBattle = (a, d) => Battle.play(a, d);

  layoutBoard();
  render();
})();
