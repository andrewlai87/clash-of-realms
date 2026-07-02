"use strict";

/*
 * pieces.js — hand-drawn SVG fantasy chess pieces.
 * Each piece is drawn in a 100x120 viewBox, front-facing, and rendered
 * from a faction palette so one drawing serves both armies.
 *
 *   pawn   → Footman        rook  → Tower Golem
 *   knight → Knight         queen → Sorceress-Queen
 *   bishop → Battlemage     king  → High King
 */
const Pieces = (() => {

  const TITLES = { p: "Footman", n: "Knight", b: "Battlemage", r: "Tower Golem", q: "Sorceress-Queen", k: "High King" };
  const FACTIONS = { w: "Ivory Order", b: "Obsidian Legion" };

  function palette(color) {
    return color === "w" ? {
      armor: "#d3dae8", armorDark: "#9daac4", armorLight: "#f1f4fa",
      cloth: "#3d63ab", clothDark: "#2b4779",
      trim: "#dcae45", trimDark: "#a87f2a",
      skin: "#e9b98d", skinDark: "#c78f66",
      hair: "#8a5a2b", beard: "#e9e5da",
      wood: "#8a6b47",
      steel: "#c3ccdc", steelDark: "#7d8798",
      glow: "#6fd2ff", glowDeep: "#2f9fd8",
      stone: "#c2bbab", stoneDark: "#948c7b",
      horse: "#ece5d4", horseDark: "#cec4ad",
      outline: "#3a3f52",
    } : {
      armor: "#5c6070", armorDark: "#3e414e", armorLight: "#7e8396",
      cloth: "#96303f", clothDark: "#6a1f2b",
      trim: "#c08a3e", trimDark: "#8f6426",
      skin: "#d8a077", skinDark: "#b57e57",
      hair: "#2e2620", beard: "#b9b4c6",
      wood: "#5f4a33",
      steel: "#9299ab", steelDark: "#5a5f6e",
      glow: "#c86bff", glowDeep: "#8f2fd8",
      stone: "#6e6862", stoneDark: "#4c4740",
      horse: "#4e453e", horseDark: "#362f29",
      outline: "#15161d",
    };
  }

  const shadow = `<ellipse cx="50" cy="112" rx="27" ry="6" fill="rgba(0,0,0,0.28)" stroke="none"/>`;

  function pawn(P) {
    return `
      ${shadow}
      <!-- spear -->
      <rect x="69" y="30" width="3.6" height="78" rx="1.6" fill="${P.wood}"/>
      <polygon points="70.8,12 64.5,31 77.1,31" fill="${P.steel}"/>
      <!-- tunic -->
      <path d="M37,66 C35,84 33.5,95 32,103 L68,103 C66.5,95 65,84 63,66 Z" fill="${P.cloth}"/>
      <path d="M32.8,98 L67.2,98 L68,103 L32,103 Z" fill="${P.trim}"/>
      <!-- boots -->
      <path d="M38,102 h9 v6 q0,3 -3,3 h-6 Z" fill="${P.clothDark}"/>
      <path d="M53,102 h9 v6 q0,3 3,3 l-12,0 Z" fill="${P.clothDark}"/>
      <!-- chest plate -->
      <path d="M37,56 Q50,50 63,56 L64,74 L36,74 Z" fill="${P.armor}"/>
      <path d="M37,56 Q50,50 63,56 L63,61 Q50,55 37,61 Z" fill="${P.armorLight}"/>
      <rect x="35" y="71" width="30" height="6" rx="2" fill="${P.clothDark}"/>
      <rect x="46" y="70.5" width="8" height="7" rx="1.5" fill="${P.trim}"/>
      <!-- arms -->
      <path d="M61,58 C66,58 69,56 70.5,55 L72.5,60 C70,62 66,63 62,63 Z" fill="${P.armor}"/>
      <circle cx="70.8" cy="58" r="4" fill="${P.skin}"/>
      <path d="M39,58 C34,58 31,62 29.5,66 L34.5,69 C36,65 38,63 40,62 Z" fill="${P.armor}"/>
      <!-- shield -->
      <circle cx="28" cy="76" r="13" fill="${P.cloth}" stroke="${P.trim}" stroke-width="3"/>
      <circle cx="28" cy="76" r="4.2" fill="${P.trim}"/>
      <!-- head -->
      <circle cx="50" cy="41" r="11.5" fill="${P.skin}"/>
      <path d="M37.5,41 A12.5,12.5 0 0 1 62.5,41 L62,36 A12.5,12.5 0 0 0 38,36 Z" fill="${P.armor}"/>
      <path d="M36.5,39.5 A13.5,13 0 0 1 63.5,39.5 L63.5,43 L36.5,43 Z" fill="${P.armor}"/>
      <rect x="35" y="41" width="30" height="3.4" rx="1.7" fill="${P.armorDark}"/>
      <rect x="47.9" y="41" width="4.2" height="9" rx="2" fill="${P.armorDark}"/>
      <circle cx="43.5" cy="46" r="1.7" fill="${P.outline}"/>
      <circle cx="56.5" cy="46" r="1.7" fill="${P.outline}"/>`;
  }

  function knight(P) {
    return `
      ${shadow}
      <!-- lance with pennant -->
      <rect x="16" y="58" width="86" height="4" rx="2" fill="${P.wood}" transform="rotate(-52 50 60)"/>
      <polygon points="82,13.5 74,24 84,27" fill="${P.steel}"/>
      <path d="M79,24 L98,31 L77,36 Z" fill="${P.cloth}"/>
      <!-- neck & chest -->
      <path d="M29,110 L64,110 C63,88 63,72 72,59 C79,49 74,40 64,41 C52,42 40,52 34,68 C30,80 29,94 29,110 Z" fill="${P.horse}"/>
      <!-- mane -->
      <path d="M46,45 C36,54 30,70 29,96 C33,88 36,86 38,88 C37,76 40,62 50,52 C54,48 52,44 46,45 Z" fill="${P.cloth}"/>
      <!-- head -->
      <path d="M60,42 C62,34 70,29 78,32 C86,35 92,44 93,50 C93.8,54.5 90,57.5 84,57 C74,56 66,56 62,54 C58,52 59,46 60,42 Z" fill="${P.horse}"/>
      <!-- ears -->
      <path d="M62,37 L65,25 L71,35 Z" fill="${P.horse}"/>
      <path d="M72,36 L78,27 L81,38 Z" fill="${P.horse}"/>
      <!-- chanfron face armor -->
      <path d="M64,38 C72,32 82,36 91,47 L87,52 C79,43 70,40 64,44 Z" fill="${P.armor}"/>
      <circle cx="74" cy="47.5" r="2.2" fill="${P.outline}"/>
      <!-- muzzle band -->
      <path d="M85,50 L92,52 L91,56 L84,55 Z" fill="${P.trim}"/>
      <!-- plume -->
      <path d="M66,30 C64,20 70,13 78,12 C73,17 74,24 76,30 Z" fill="${P.clothDark}"/>
      <!-- neck armor plates -->
      <path d="M31,90 C42,83 54,83 62,90 L62,99 C53,92 41,92 31,99 Z" fill="${P.armor}"/>
      <path d="M30,101 C42,94 54,94 63,101 L63,110 L30,110 Z" fill="${P.armorDark}"/>
      <path d="M31,90 C42,83 54,83 62,90 L62,93 C53,86.5 41,86.5 31,93 Z" fill="${P.armorLight}"/>
      <circle cx="46" cy="104" r="2.6" fill="${P.trim}"/>`;
  }

  function bishop(P) {
    return `
      ${shadow}
      <!-- staff -->
      <rect x="74.4" y="30" width="3.2" height="78" rx="1.6" fill="${P.wood}"/>
      <circle cx="76" cy="24" r="10" fill="${P.glow}" opacity="0.30" stroke="none"/>
      <circle cx="76" cy="24" r="6.2" fill="${P.glow}"/>
      <circle cx="74" cy="22" r="2" fill="#ffffff" opacity="0.85" stroke="none"/>
      <path d="M86,10 l1.1,3 3,1.1 -3,1.1 -1.1,3 -1.1,-3 -3,-1.1 3,-1.1 Z" fill="${P.glow}"/>
      <!-- robe -->
      <path d="M50,36 C39,42 34,58 29,105 L71,105 C66,58 61,42 50,36 Z" fill="${P.cloth}"/>
      <path d="M30,98 L70,98 L71,105 L29,105 Z" fill="${P.clothDark}"/>
      <path d="M38,72 a3,3 0 1 1 0.1,0 Z" fill="${P.trim}" opacity="0.9"/>
      <path d="M60,84 a2.6,2.6 0 1 1 0.1,0 Z" fill="${P.trim}" opacity="0.9"/>
      <path d="M47,90 c-3,-1 -4,-5 -2,-8 c-4,1 -5,7 -1,9 c1,0.4 2,0.2 3,-1 Z" fill="${P.trim}" opacity="0.9"/>
      <!-- sleeve reaching staff -->
      <path d="M55,56 C62,52 68,48 72,45 L78,52 C72,57 65,61 58,64 Z" fill="${P.clothDark}"/>
      <circle cx="76" cy="49" r="4" fill="${P.skin}"/>
      <!-- left sleeve folded -->
      <path d="M36,62 C42,57 52,57 57,62 L53,72 C48,67 42,67 38,72 Z" fill="${P.clothDark}"/>
      <!-- beard -->
      <path d="M41,43 C41,56 45,63 50,65 C55,63 59,56 59,43 Z" fill="${P.beard}"/>
      <!-- face -->
      <circle cx="50" cy="40" r="10" fill="${P.skin}"/>
      <circle cx="45.5" cy="39" r="1.7" fill="${P.outline}"/>
      <circle cx="54.5" cy="39" r="1.7" fill="${P.outline}"/>
      <!-- wizard hat -->
      <ellipse cx="50" cy="33.5" rx="17" ry="5" fill="${P.clothDark}"/>
      <path d="M36.5,33 C41,19 46,12 60,4 C54,15 61,22 64,33 C56,29 44,29 36.5,33 Z" fill="${P.cloth}"/>
      <path d="M49,17 l1,2.6 2.6,1 -2.6,1 -1,2.6 -1,-2.6 -2.6,-1 2.6,-1 Z" fill="${P.trim}"/>`;
  }

  function rook(P) {
    return `
      <ellipse cx="50" cy="112" rx="30" ry="6" fill="rgba(0,0,0,0.28)" stroke="none"/>
      <!-- banner -->
      <rect x="48.7" y="16" width="2.6" height="26" fill="${P.wood}"/>
      <path d="M51,17 L72,22.5 L51,28 Z" fill="${P.cloth}"/>
      <!-- crenellations -->
      <path d="M31,54 L31,38 L39,38 L39,45 L45,45 L45,38 L55,38 L55,45 L61,45 L61,38 L69,38 L69,54 Z" fill="${P.stone}"/>
      <!-- tower body -->
      <path d="M34,54 L66,54 L68,96 L32,96 Z" fill="${P.stone}"/>
      <path d="M34,54 L66,54 L66.3,60 L33.7,60 Z" fill="${P.stoneDark}" opacity="0.5"/>
      <path d="M33,66 L67,66 M33.5,78 L66.5,78 M34,90 L66,90 M50,54 L50,66 M42,66 L42,78 M58,66 L58,78 M50,78 L50,90 M43,90 L43,96 M59,90 L59,96"
            stroke="${P.stoneDark}" stroke-width="1.6" fill="none" opacity="0.7"/>
      <!-- base -->
      <path d="M28,110 L72,110 L68,96 L32,96 Z" fill="${P.stoneDark}"/>
      <!-- arch with glowing eyes -->
      <path d="M43,72 A7,8 0 0 1 57,72 L57,86 L43,86 Z" fill="#181420"/>
      <circle cx="46.6" cy="75" r="3.8" fill="${P.glow}" opacity="0.35" stroke="none"/>
      <circle cx="53.4" cy="75" r="3.8" fill="${P.glow}" opacity="0.35" stroke="none"/>
      <circle cx="46.6" cy="75" r="2" fill="${P.glow}" stroke="none"/>
      <circle cx="53.4" cy="75" r="2" fill="${P.glow}" stroke="none"/>
      <!-- floating stone fists -->
      <path d="M13,72 q-4,6 0,12 q6,5 12,0 q4,-6 0,-12 q-6,-5 -12,0 Z" fill="${P.stone}"/>
      <path d="M16,76 l7,0 M16,80 l7,0" stroke="${P.stoneDark}" stroke-width="1.6"/>
      <path d="M75,72 q-4,6 0,12 q6,5 12,0 q4,-6 0,-12 q-6,-5 -12,0 Z" fill="${P.stone}"/>
      <path d="M78,76 l7,0 M78,80 l7,0" stroke="${P.stoneDark}" stroke-width="1.6"/>
      <!-- glowing runes -->
      <path d="M38,84 l3,-5 3,5 Z" fill="none" stroke="${P.glow}" stroke-width="1.4" opacity="0.8"/>
      <path d="M57,68 l5,0 m-5,-3.5 l5,0" stroke="${P.glow}" stroke-width="1.4" opacity="0.8"/>
      <!-- cracks -->
      <path d="M62,88 l3,4 m-25,-26 l-3,-4" stroke="${P.stoneDark}" stroke-width="1.4" fill="none"/>`;
  }

  function queen(P) {
    return `
      ${shadow}
      <!-- scepter -->
      <rect x="24.5" y="40" width="3" height="52" rx="1.5" fill="${P.trimDark}"/>
      <circle cx="26" cy="33" r="9" fill="${P.glow}" opacity="0.28" stroke="none"/>
      <polygon points="26,22 33,33 26,44 19,33" fill="${P.glow}"/>
      <polygon points="26,25.5 30.8,33 26,40.5 21.2,33" fill="#ffffff" opacity="0.45" stroke="none"/>
      <path d="M37,14 l1,2.7 2.7,1 -2.7,1 -1,2.7 -1,-2.7 -2.7,-1 2.7,-1 Z" fill="${P.glow}"/>
      <!-- hair behind -->
      <path d="M39,26 C34,38 35,52 40,62 L45,58 C41,50 41,38 45,29 Z" fill="${P.hair}"/>
      <path d="M61,26 C66,38 65,52 60,62 L55,58 C59,50 59,38 55,29 Z" fill="${P.hair}"/>
      <!-- gown -->
      <path d="M50,44 C39,52 32,72 27,106 L73,106 C68,72 61,52 50,44 Z" fill="${P.cloth}"/>
      <path d="M50,50 C46,62 44,82 43,104 L57,104 C56,82 54,62 50,50 Z" fill="${P.clothDark}"/>
      <path d="M28,99 L72,99 L73,106 L27,106 Z" fill="${P.trim}"/>
      <!-- bodice -->
      <path d="M42,45 L58,45 L56,64 L44,64 Z" fill="${P.clothDark}"/>
      <path d="M46,48 l8,0 m-8,5 l8,0 m-8,5 l8,0" stroke="${P.trim}" stroke-width="1.4"/>
      <!-- arms -->
      <path d="M43,49 C37,52 32,57 29,62 L34,66 C37,61 41,57 45,55 Z" fill="${P.cloth}"/>
      <circle cx="27.5" cy="60" r="3.6" fill="${P.skin}"/>
      <path d="M57,49 C62,52 65,57 66,63 L60,65 C59,60 56,56 53,54 Z" fill="${P.cloth}"/>
      <circle cx="62" cy="66" r="3.4" fill="${P.skin}"/>
      <!-- necklace -->
      <path d="M45,46 Q50,51 55,46" stroke="${P.trim}" stroke-width="1.6" fill="none"/>
      <circle cx="50" cy="50" r="2" fill="${P.glow}"/>
      <!-- head -->
      <circle cx="50" cy="33" r="9.5" fill="${P.skin}"/>
      <path d="M41,29 C42,23 47,20.5 50,20.5 C53,20.5 58,23 59,29 C56,26 44,26 41,29 Z" fill="${P.hair}"/>
      <circle cx="46" cy="33" r="1.6" fill="${P.outline}"/>
      <circle cx="54" cy="33" r="1.6" fill="${P.outline}"/>
      <!-- crown -->
      <path d="M41,23.5 L44,14 L48,20 L50,12 L52,20 L56,14 L59,23.5 Z" fill="${P.trim}"/>
      <circle cx="50" cy="12" r="1.8" fill="${P.glow}"/>
      <circle cx="44" cy="14.5" r="1.3" fill="${P.glow}"/>
      <circle cx="56" cy="14.5" r="1.3" fill="${P.glow}"/>`;
  }

  function king(P) {
    return `
      ${shadow}
      <!-- cape -->
      <path d="M31,50 C24,68 23,90 25,105 L75,105 C77,90 76,68 69,50 Z" fill="${P.cloth}"/>
      <path d="M31,50 C29,56 27,64 26,72 L32,72 C33,63 34,56 36,51 Z" fill="${P.beard}" opacity="0.85"/>
      <path d="M69,50 C71,56 73,64 74,72 L68,72 C67,63 66,56 64,51 Z" fill="${P.beard}" opacity="0.85"/>
      <!-- tabard & boots -->
      <path d="M37,78 L63,78 L60,103 L40,103 Z" fill="${P.clothDark}"/>
      <path d="M39,102 h8 v5 q0,3 -3,3 h-5 Z" fill="${P.armorDark}"/>
      <path d="M53,102 h8 v8 h-5 q-3,0 -3,-3 Z" fill="${P.armorDark}"/>
      <!-- torso armor -->
      <path d="M37,50 L63,50 L66,80 L34,80 Z" fill="${P.armor}"/>
      <path d="M37,50 L63,50 L63.7,57 L36.3,57 Z" fill="${P.armorLight}"/>
      <rect x="34" y="76" width="32" height="6" rx="2" fill="${P.clothDark}"/>
      <rect x="45.5" y="75" width="9" height="8" rx="1.5" fill="${P.trim}"/>
      <!-- pauldrons -->
      <circle cx="35.5" cy="53" r="7" fill="${P.armorDark}"/>
      <circle cx="64.5" cy="53" r="7" fill="${P.armorDark}"/>
      <!-- greatsword, point down -->
      <circle cx="50" cy="46.5" r="3.6" fill="${P.trim}"/>
      <rect x="47.9" y="49" width="4.2" height="10" fill="${P.trimDark}"/>
      <rect x="37" y="57.5" width="26" height="5" rx="2.4" fill="${P.trim}"/>
      <path d="M46.5,62.5 L53.5,62.5 L53,102 L50,110 L47,102 Z" fill="${P.steel}"/>
      <path d="M50,62.5 L50,105" stroke="${P.steelDark}" stroke-width="1.6"/>
      <!-- gauntlets on hilt -->
      <circle cx="45" cy="54" r="4" fill="${P.armorDark}"/>
      <circle cx="55" cy="54" r="4" fill="${P.armorDark}"/>
      <!-- beard & head -->
      <circle cx="50" cy="30" r="11" fill="${P.skin}"/>
      <path d="M40,31 C40,43 45,48 50,48 C55,48 60,43 60,31 C56,35 44,35 40,31 Z" fill="${P.beard}"/>
      <circle cx="45.5" cy="28.5" r="1.7" fill="${P.outline}"/>
      <circle cx="54.5" cy="28.5" r="1.7" fill="${P.outline}"/>
      <!-- crown -->
      <path d="M39,21 L39,10 L44,16 L50,7 L56,16 L61,10 L61,21 Z" fill="${P.trim}"/>
      <rect x="38" y="19" width="24" height="4.5" rx="2" fill="${P.trimDark}"/>
      <circle cx="50" cy="21" r="2" fill="${P.glow}"/>
      <circle cx="50" cy="7" r="2" fill="${P.glow}"/>`;
  }

  const DRAW = { p: pawn, n: knight, b: bishop, r: rook, q: queen, k: king };

  function svg(type, color, opts = {}) {
    const P = palette(color);
    const cls = opts.className ? ` class="${opts.className}"` : "";
    const style = opts.size ? ` style="width:${opts.size}px;height:auto"` : "";
    return `<svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg"${cls}${style}>` +
      `<g stroke="${P.outline}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">` +
      DRAW[type](P) +
      `</g></svg>`;
  }

  return { svg, TITLES, FACTIONS, palette };
})();
