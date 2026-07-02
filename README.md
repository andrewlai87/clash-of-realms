# ⚔ Clash of Realms — Fantasy Chess

A medieval-fantasy chess game where the pieces are characters — footmen, mounted
knights, battlemages, tower golems, a sorceress-queen, and a high king — and every
capture plays out as an animated battle.

**The Ivory Order** (white) vs **The Obsidian Legion** (black).

## Play it

No install needed — it's pure HTML/CSS/JavaScript:

- **Easiest:** double-click `index.html` to open it in your browser.
- **Or serve it:** `python3 -m http.server 4173` in this folder, then open
  <http://localhost:4173>.

## Features

- **Full chess rules** — castling, en passant, promotion, check/checkmate,
  stalemate, fifty-move and insufficient-material draws. The engine is verified
  against standard perft test positions.
- **Cinematic capture battles** — melee pieces lunge and slash, mages hurl
  spell projectiles, tower golems leap and ground-slam. The capturing piece
  always wins, so chess strategy stays pure. Click any battle to skip it;
  toggle battles off entirely in the panel.
- **AI opponent** — three difficulty levels (Squire / Knight / Warlord),
  minimax search with alpha-beta pruning. Or play a friend in local 2-player.
- **Fantasy piece art** — every piece is hand-drawn SVG, palette-swapped per
  faction. Promotion and game-over screens are themed to match.
- **Synthesized sound** — sword clangs, spell blasts, and victory fanfares
  generated with WebAudio (no audio files). Mutable, and the setting persists.

## Piece guide

| Chess piece | In this realm |
|---|---|
| Pawn | Footman |
| Knight | Knight (armored warhorse) |
| Bishop | Battlemage |
| Rook | Tower Golem |
| Queen | Sorceress-Queen |
| King | High King |

## Project layout

```
index.html      page shell
css/style.css   all styling (board, panel, battle arena, modals)
js/engine.js    chess rules engine (board state, move gen, make/undo, perft)
js/ai.js        computer opponent (negamax + alpha-beta, piece-square tables)
js/pieces.js    SVG fantasy piece art + faction palettes
js/battle.js    cinematic capture-battle animations
js/sound.js     WebAudio sound effects
js/app.js       UI wiring: board, input, game flow, modals
```

## Testing the engine

```
node -e "const E = require('./js/engine.js'); console.log(E.perft(new E.Game(), 4))"
# → 197281 (the known-correct move count for depth 4 from the start position)
```

## Ideas for later

- Move list / notation panel
- Threefold-repetition draw detection
- Online multiplayer
- More elaborate per-matchup battle choreography
