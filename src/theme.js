/* Le thème : ce qui décide des couleurs, et qui les pose.
 *
 * Sorti d'`App.jsx` le 27/09/2026 (audit, point 9 — première étape du
 * découpage). Quatre cent cinquante-cinq lignes qui n'avaient rien à faire
 * dans le monolithe : aucune n'est un composant, aucune n'appelle un hook,
 * aucune ne rend de JSX. Elles lisent un réglage, calculent des couleurs, et
 * écrivent des propriétés CSS sur la racine du document.
 *
 * Ce qui vit ici :
 *   • `LOGGIA_PRESETS` — les quatorze thèmes et leurs variantes claire/sombre ;
 *   • `THEME_KEYS` — les jetons `--o-*` qu'un thème a le droit de surcharger,
 *     et que l'on purge avant d'en appliquer un autre ;
 *   • `applyVars`, `applyLook`, `applyTheme` — la pose, du plus précis au plus
 *     général ; `applyTheme` est la seule porte que l'écran pousse ;
 *   • `readLook` — le réglage d'apparence, avec ses replis ;
 *   • `readComputedHaTheme` et `signatureHaTheme` — le miroir du thème de Home
 *     Assistant, lu sur le parent ;
 *   • `lum`, `cssToRgb` — deux calculs de couleur ;
 *   • `LAVIS` et `lav` — l'intensité du lavis des cartes actives. `LAVIS` est
 *     une variable de module que `applyLook` réécrit, et que les cartes lisent
 *     à chaque rendu. Les liaisons d'un module ES sont VIVES : `App.jsx` voit
 *     la valeur du moment, pas celle de l'import.
 *
 * Ce qui n'y vit PAS, et pourquoi : `LOOK_DEF` reste dans `ui.jsx`, d'où
 * `views/parametres.jsx` le lit aussi ; le déplacer élargirait ce découpage à
 * deux fichiers de plus pour rien.
 */
import { garde, JETONS_GARDE } from './contraste.js';
import { cfgVal } from './state.js';
import { LOOK_DEF } from './ui.jsx';

// "couleur CSS (hex/rgb) → 'r,g,b'" pour alimenter les tokens rgba(var(--o-accent-rgb),...)
function cssToRgb(c) {
  c = (c || '').trim();
  if (c[0] === '#') { let h = c.slice(1); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; const n = parseInt(h, 16); return isNaN(n) ? '' : `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`; }
  const m = c.match(/(\d+)[ ,]+(\d+)[ ,]+(\d+)/); return m ? `${m[1]},${m[2]},${m[3]}` : '';
}

const THEME_KEYS = ['--o-bg', '--o-bggrad', '--o-bg2', '--o-side1', '--o-side2', '--o-surfA', '--o-surfB', '--o-header', '--o-text', '--o-text1', '--o-text2', '--o-text3', '--o-bd1', '--o-bd2', '--o-bd3', '--o-s1', '--o-s2', '--o-s3', '--o-s4', '--o-s5', '--o-well', '--o-well2', '--o-well0', '--o-accent', '--o-accent-rgb', '--o-accent-soft', '--o-accent-soft-rgb', '--o-shadow', '--o-bw', '--o-font',
  // tokens fins des presets (Atrium) — purgés au changement de thème comme les autres
  '--o-ok', '--o-ok-rgb', '--o-warn2', '--o-warn2-rgb', '--o-bad', '--o-bad-rgb', '--o-shadow-hover', '--o-shadow-rangee',
  // Le voile du bandeau meteo. Un preset qui le teinte sans qu'il figure
  // ici le laisserait au theme suivant : le bleu de l'un sur le fond de
  // l'autre, jusqu'au rechargement.
  '--o-sky',
  /* Accents decoratifs. Ils portent chacun un ROLE : `--o-purple` est la
   * couleur des volets d'un bout a l'autre du dashboard, `--o-cyan` celle
   * des scenes, `--o-gold` celle de ce qu'on epingle. Un theme peut donc
   * les reteindre sans rien brouiller, tant qu'ils restent distincts entre
   * eux — et il le faut pour une charte monochrome, ou un violet detonne. */
  '--o-purple', '--o-purple-rgb', '--o-cyan', '--o-cyan-rgb',
  '--o-cold', '--o-cold-rgb', '--o-gold', '--o-gold-rgb',
  '--o-warn', '--o-warn-rgb',
  /* Les teintes des pieces. Elles suivent un theme qui n'a qu'une couleur,
   * et redeviennent celles d'avant des qu'on en change. */
  '--o-piece-ambre', '--o-piece-ambre-rgb', '--o-piece-tendre',
  '--o-piece-tendre-rgb', '--o-piece-vert', '--o-piece-vert-rgb',
  '--o-piece-chambre', '--o-piece-chambre-rgb', '--o-piece-bain', '--o-piece-bain-rgb'];
// Thèmes natifs Loggia (créés pour Loggia, adaptés des thèmes HA fournis). Chaque preset a une variante claire + sombre,
// pilotée par le Mode d'affichage. Forme = entrée de applyVars (bg/surface/text/accent/radius/shadow/border/font/bggrad).
const LOGGIA_PRESETS = {
  neumorphix: {
    light: { bg: '#e8eaf0', surface: '#eef0f6', surfaceElevated: '#f3f5fb', text: '#2c2f3a', muted: '#606470', border: 'rgba(120,130,160,.14)', accent: '#6c7ae0', accentText: '#5563cc', radius: '20px', borderWidth: '0px', shadow: '6px 6px 14px #d3d6e1, -6px -6px 14px #ffffff', bggrad: 'linear-gradient(160deg,#edeff5,#e3e6ef)', font: "'Manrope', -apple-system, sans-serif" },
    dark: { bg: '#1e2128', surface: '#262b35', surfaceElevated: '#2c323e', text: '#e2e8f0', muted: '#94a3b8', border: 'rgba(255,255,255,.05)', accent: '#5de0d8', radius: '20px', borderWidth: '0px', shadow: '5px 5px 12px #13161c, -5px -5px 12px #2d3340', bggrad: 'linear-gradient(160deg,#21252e,#171a20)', font: "'Manrope', -apple-system, sans-serif" },
  },
  google: {
    light: { bg: '#f6f8fc', surface: '#ffffff', surfaceElevated: '#ffffff', text: '#202124', muted: '#5f6368', border: '#e7e9ee', accent: '#1a73e8', radius: '12px', borderWidth: '1px', shadow: '0 1px 3px rgba(60,64,67,.15), 0 1px 2px rgba(60,64,67,.1)', bggrad: '', font: "'Google Sans','Roboto',-apple-system,sans-serif" },
    dark: { bg: '#171717', surface: '#202124', surfaceElevated: '#26282c', text: '#f2f2f2', muted: '#a6a6a6', border: '#2c2d31', accent: '#8ab4f8', radius: '12px', borderWidth: '1px', shadow: '0 1px 3px rgba(0,0,0,.5)', bggrad: '', font: "'Google Sans','Roboto',-apple-system,sans-serif" },
  },
  ios: {
    light: { bg: '#e5e5ea', surface: '#fbfbfd', surfaceElevated: '#ffffff', text: '#1c1c1e', muted: '#6c6c70', border: 'rgba(60,60,67,.1)', accent: '#ff9409', accentText: '#b35c00', radius: '22px', borderWidth: '0px', shadow: '0 10px 30px rgba(0,0,0,.08)', bggrad: 'linear-gradient(165deg,#eef0f5,#e1e4ed)', font: "-apple-system,'SF Pro Display','Segoe UI',sans-serif" },
    dark: { bg: '#0d0d10', surface: '#1c1c1e', surfaceElevated: '#262629', text: '#ffffff', muted: '#aeaeb2', border: 'rgba(255,255,255,.08)', accent: '#ff9f09', radius: '22px', borderWidth: '0px', shadow: '0 10px 30px rgba(0,0,0,.5)', bggrad: 'linear-gradient(165deg,#1a1a20,#09090c)', font: "-apple-system,'SF Pro Display','Segoe UI',sans-serif" },
  },
  // Frosted Glass : surfaces TRANSLUCIDES (le flou backdrop est appliqué en CSS via html.loggia-frosted) sur un fond dégradé.
  frosted: {
    light: { bg: '#e6e8f5', surface: 'rgba(255,255,255,.55)', surfaceElevated: 'rgba(255,255,255,.72)', text: '#15183a', muted: '#54597e', border: 'rgba(255,255,255,.55)', accent: '#6a74d3', accentText: '#4e57b0', radius: '18px', borderWidth: '1px', shadow: '0 14px 30px rgba(40,40,90,.14)', bggrad: 'linear-gradient(120deg,#f4e9f1 0%,#e3e9f8 45%,#bcc8f0 100%)', font: "-apple-system,'Segoe UI',Roboto,sans-serif" },
    dark: { bg: '#0d111c', surface: 'rgba(34,38,58,.42)', surfaceElevated: 'rgba(44,49,72,.55)', text: '#eaebf2', muted: '#a6abc6', border: 'rgba(234,235,238,.14)', accent: '#8f97de', radius: '18px', borderWidth: '1px', shadow: '0 14px 30px rgba(0,0,0,.38)', bggrad: 'radial-gradient(ellipse 95% 75% at 55% 32%,#283050 0%,#141b2d 55%,#0b0f1a 100%)', font: "-apple-system,'Segoe UI',Roboto,sans-serif" },
  },
  // ── Thèmes éditeur VS Code (palettes officielles ; variante claire = pendant light officiel) ──
  onedark: {
    dark: { bg: '#21252b', surface: '#282c34', surfaceElevated: '#2f343e', text: '#abb2bf', muted: '#7f848e', border: 'rgba(255,255,255,.06)', accent: '#61afef', radius: '18px', borderWidth: '1px', shadow: '0 12px 30px rgba(0,0,0,.4)', bggrad: 'linear-gradient(170deg,#23272e,#1d2025)', font: "'Manrope', -apple-system, sans-serif" },
    light: { bg: '#eaeaeb', surface: '#fafafa', surfaceElevated: '#ffffff', text: '#383a42', muted: '#696c77', border: 'rgba(56,58,66,.13)', accent: '#4078f2', accentText: '#2f5cc4', radius: '18px', borderWidth: '1px', shadow: '0 10px 24px rgba(56,58,66,.10)', bggrad: '', font: "'Manrope', -apple-system, sans-serif" },
  },
  dracula: {
    dark: { bg: '#21222c', surface: '#282a36', surfaceElevated: '#343746', text: '#f8f8f2', muted: '#8a94c0', border: 'rgba(189,147,249,.14)', accent: '#bd93f9', radius: '18px', borderWidth: '1px', shadow: '0 12px 30px rgba(0,0,0,.42)', bggrad: 'radial-gradient(ellipse 90% 70% at 50% 0%,#2b2d3d 0%,#1e1f29 60%)', font: "'Manrope', -apple-system, sans-serif" },
    light: { bg: '#f3efe0', surface: '#fffbeb', surfaceElevated: '#ffffff', text: '#1f1f1f', muted: '#635d97', border: 'rgba(100,74,201,.16)', accent: '#644ac9', accentText: '#4f39a8', radius: '18px', borderWidth: '1px', shadow: '0 10px 24px rgba(100,74,201,.10)', bggrad: '', font: "'Manrope', -apple-system, sans-serif" },
  },
  github: {
    dark: { bg: '#0d1117', surface: '#161b22', surfaceElevated: '#1c2129', text: '#e6edf3', muted: '#8b949e', border: '#30363d', accent: '#58a6ff', radius: '14px', borderWidth: '1px', shadow: '0 8px 24px rgba(0,0,0,.4)', bggrad: '', font: "'Manrope', -apple-system, sans-serif" },
    light: { bg: '#f6f8fa', surface: '#ffffff', surfaceElevated: '#ffffff', text: '#1f2328', muted: '#656d76', border: '#d0d7de', accent: '#0969da', accentText: '#0969da', radius: '14px', borderWidth: '1px', shadow: '0 6px 18px rgba(31,35,40,.08)', bggrad: '', font: "'Manrope', -apple-system, sans-serif" },
  },
  tokyo: {
    dark: { bg: '#16161e', surface: '#1a1b26', surfaceElevated: '#1f2335', text: '#c0caf5', muted: '#7982a9', border: 'rgba(122,162,247,.11)', accent: '#7aa2f7', radius: '18px', borderWidth: '1px', shadow: '0 12px 30px rgba(0,0,0,.45)', bggrad: 'radial-gradient(ellipse 95% 70% at 50% 0%,#1e2030 0%,#131420 60%)', font: "'Manrope', -apple-system, sans-serif" },
    light: { bg: '#d5d6db', surface: '#e6e7ed', surfaceElevated: '#f2f2f7', text: '#343b58', muted: '#5a607d', border: 'rgba(52,59,88,.15)', accent: '#2e7de9', accentText: '#1f5bb8', radius: '18px', borderWidth: '1px', shadow: '0 10px 24px rgba(52,59,88,.10)', bggrad: '', font: "'Manrope', -apple-system, sans-serif" },
  },
  material: {
    dark: { bg: '#1e282d', surface: '#263238', surfaceElevated: '#2e3c43', text: '#eeffff', muted: '#7d97a5', border: 'rgba(255,255,255,.06)', accent: '#80cbc4', radius: '20px', borderWidth: '0px', shadow: '0 12px 30px rgba(0,0,0,.4)', bggrad: 'linear-gradient(165deg,#243036,#1b2429)', font: "'Manrope', -apple-system, sans-serif" },
    light: { bg: '#eceff1', surface: '#fafafa', surfaceElevated: '#ffffff', text: '#37474f', muted: '#607d8b', border: 'rgba(55,71,79,.12)', accent: '#00897b', accentText: '#00695c', radius: '20px', borderWidth: '0px', shadow: '0 10px 24px rgba(55,71,79,.10)', bggrad: '', font: "'Manrope', -apple-system, sans-serif" },
  },
  nightowl: {
    dark: { bg: '#01111d', surface: '#011627', surfaceElevated: '#0b2942', text: '#d6deeb', muted: '#7e97b3', border: 'rgba(95,126,151,.22)', accent: '#82aaff', radius: '18px', borderWidth: '1px', shadow: '0 12px 32px rgba(0,0,0,.5)', bggrad: 'radial-gradient(ellipse 95% 70% at 50% 0%,#04203a 0%,#010f1a 60%)', font: "'Manrope', -apple-system, sans-serif" },
    light: { bg: '#f0f0f0', surface: '#fbfbfb', surfaceElevated: '#ffffff', text: '#403f53', muted: '#676688', border: 'rgba(64,63,83,.14)', accent: '#0c969b', accentText: '#0a7c80', radius: '18px', borderWidth: '1px', shadow: '0 10px 24px rgba(64,63,83,.10)', bggrad: '', font: "'Manrope', -apple-system, sans-serif" },
  },
  // ── Paires de couleurs (réf. envoyée par le user) : Charcoal × Soft Lavender, Plum Wine × Blush Pink ──
  lavande: {
    dark: { bg: '#232326', surface: '#2b2b2f', surfaceElevated: '#333338', text: '#ece9f4', muted: '#a8a3bd', border: 'rgba(214,205,234,.12)', accent: '#c3b5e6', accentText: '#d6cdea', radius: '20px', borderWidth: '1px', shadow: '0 4px 10px rgba(0,0,0,.24), 0 16px 32px rgba(0,0,0,.2)', bggrad: 'linear-gradient(170deg,#27272b,#1d1d20)', font: "'Manrope', -apple-system, sans-serif" },
    light: { bg: '#e9e4f3', surface: '#f7f5fb', surfaceElevated: '#ffffff', text: '#2b2b30', muted: '#6d6785', border: 'rgba(43,43,48,.12)', accent: '#7b68b8', accentText: '#5f4da0', radius: '20px', borderWidth: '1px', shadow: '0 2px 6px rgba(43,43,48,.06), 0 12px 28px rgba(43,43,48,.10)', bggrad: 'linear-gradient(165deg,#efeaf7,#e2dcf0)', font: "'Manrope', -apple-system, sans-serif" },
  },
  plum: {
    dark: { bg: '#22101a', surface: '#341624', surfaceElevated: '#421c2e', text: '#f6e7ec', muted: '#c39aa9', border: 'rgba(242,198,207,.14)', accent: '#eda4b6', accentText: '#f2c6cf', radius: '20px', borderWidth: '1px', shadow: '0 4px 10px rgba(0,0,0,.26), 0 16px 32px rgba(0,0,0,.22)', bggrad: 'radial-gradient(ellipse 95% 70% at 50% 0%,#3d1628 0%,#1c0d15 60%)', font: "'Manrope', -apple-system, sans-serif" },
    light: { bg: '#f6e3e8', surface: '#fdf5f7', surfaceElevated: '#ffffff', text: '#3c1526', muted: '#8d5a6c', border: 'rgba(90,30,58,.14)', accent: '#a03d5e', accentText: '#832c4a', radius: '20px', borderWidth: '1px', shadow: '0 2px 6px rgba(90,30,58,.06), 0 12px 28px rgba(90,30,58,.10)', bggrad: 'linear-gradient(165deg,#f9ebef,#f2dae1)', font: "'Manrope', -apple-system, sans-serif" },
  },
  // ── Atrium : le thème du tableau de bord maison. Sa signature n'est pas sa
  //    couleur — elle est proche de celle d'Loggia — mais son traitement : aucune
  //    ombre, des surfaces opaques, et un filet d'un pixel qui porte seul la
  //    structure. Le fond descend au quasi-noir neutre pour que les cartes se
  //    détachent par leur clarté, et non par une ombre portée.
  atrium: {
    dark: {
      bg: '#07090d', surface: '#0b0f15', surfaceElevated: '#111620', text: '#e9eef5', muted: '#a8b2c1',
      border: 'rgba(255,255,255,.065)', accent: '#5b8cff', accentText: '#8fb0ff',
      radius: '16px', borderWidth: '1px', shadow: '0 0 0 1px rgba(255,255,255,.085)', bggrad: '', font: "'Manrope', -apple-system, sans-serif",
      fine: {
        // carte = dégradé c1 → c2 + filet 1px ; aucune ombre portée au repos —
        // le filet EST l'ombre (un anneau), sinon les cartes se confondaient
        // avec la page, la règle du gabarit leur interdisant une bordure.
        '--o-shadow-rangee': '0 0 0 1px rgba(255,255,255,.085)',
        '--o-surfA': '#111620', '--o-surfB': '#0b0f15',
        '--o-bg2': '#0a0d12', '--o-side1': '#0a0d12', '--o-side2': '#07090d',
        '--o-header': 'rgba(8,10,14,.88)',
        '--o-well': '#0d1117', '--o-well0': '#111620', '--o-well2': '#07090d',
        // 7 niveaux de texte du handoff → 4 tokens Loggia (t1 · t2 · t3 · t6)
        '--o-text': '#e9eef5', '--o-text1': '#cfd7e2', '--o-text2': '#a8b2c1', '--o-text3': '#5c6675',
        // traits (hair) — jamais confondus avec les remplissages
        '--o-bd1': 'rgba(255,255,255,.1)', '--o-bd2': 'rgba(255,255,255,.065)', '--o-bd3': 'rgba(255,255,255,.045)',
        // remplissages neutres (s1 → s4)
        '--o-s1': 'rgba(255,255,255,.07)', '--o-s2': 'rgba(255,255,255,.045)', '--o-s3': 'rgba(255,255,255,.03)',
        '--o-s4': 'rgba(255,255,255,.02)', '--o-s5': 'rgba(255,255,255,.02)',
        // sémantique : le texte change entre les thèmes, pas les points/jauges
        '--o-ok': '#5ee089', '--o-ok-rgb': '34,197,94', '--o-warn2': '#f7bd5c', '--o-warn2-rgb': '245,165,36',
        '--o-bad': '#f79c92', '--o-bad-rgb': '240,104,90',
        '--o-shadow-hover': '0 16px 34px rgba(0,0,0,.45)',
      },
    },
    light: {
      bg: '#f2f4f7', surface: '#ffffff', surfaceElevated: '#ffffff', text: '#101828', muted: '#475467',
      border: 'rgba(16,24,40,.1)', accent: '#5b8cff', accentText: '#1d55c9',
      radius: '16px', borderWidth: '1px', shadow: '0 0 0 1px rgba(16,24,40,.14)', bggrad: '', font: "'Manrope', -apple-system, sans-serif",
      fine: {
        '--o-shadow-rangee': '0 0 0 1px rgba(16,24,40,.14)',
        // en clair, c1 = c2 = blanc : la carte est plate, c'est le filet qui la détache
        '--o-surfA': '#ffffff', '--o-surfB': '#ffffff',
        '--o-bg2': '#ffffff', '--o-side1': '#ffffff', '--o-side2': '#ffffff',
        '--o-header': 'rgba(246,247,249,.9)',
        '--o-well': '#ffffff', '--o-well0': '#ffffff', '--o-well2': '#f2f4f7',
        '--o-text': '#101828', '--o-text1': '#26303f', '--o-text2': '#475467', '--o-text3': '#8a93a1',
        '--o-bd1': 'rgba(16,24,40,.14)', '--o-bd2': 'rgba(16,24,40,.1)', '--o-bd3': 'rgba(16,24,40,.07)',
        '--o-s1': 'rgba(16,24,40,.07)', '--o-s2': 'rgba(16,24,40,.05)', '--o-s3': 'rgba(16,24,40,.035)',
        '--o-s4': 'rgba(16,24,40,.022)', '--o-s5': 'rgba(16,24,40,.022)',
        '--o-ok': '#15803d', '--o-ok-rgb': '34,197,94', '--o-warn2': '#b45309', '--o-warn2-rgb': '245,165,36',
        '--o-bad': '#b42318', '--o-bad-rgb': '240,104,90',
        '--o-shadow-hover': '0 16px 34px rgba(16,24,40,.12)',
      },
    },
  },
  /* ── The Projekt ────────────────────────────────────────────────────────
   *
   * D'après la planche de charte : dix teintes, une seule source de lumière.
   *
   * Le noir n'y est jamais neutre — #020D12 tire sur le bleu — et l'azur
   * #3CA2D9 ne sert qu'à désigner ce qui agit. La glace #BEE8FF, elle, ne
   * remplit rien : elle écrit.
   *
   * Trois choix viennent de la planche et non de l'habitude.
   *
   * Le fond n'est pas plat. Toutes les vignettes montrent une lueur venue du
   * haut ; `bggrad` la reproduit, et c'est elle qui donne la profondeur que
   * les autres thèmes vont chercher dans une ombre portée.
   *
   * Les traits et les remplissages sont teintés de GLACE, jamais de blanc. Un
   * `rgba(255,255,255,.1)` posé sur ce fond vire au gris et casse la dominante
   * froide en un coup ; `rgba(190,232,255,…)` la tient.
   *
   * Et l'accent qui remplit n'est pas celui qui écrit. #3CA2D9 sur #020D12
   * passe tout juste ; #BEE8FF y respire. D'où `accent` d'un côté,
   * `accentText` de l'autre — la charte fait la même distinction en donnant
   * deux bleus là où un seul aurait suffi.
   */
  projekt: {
    dark: {
      bg: '#020D12', surface: '#06202E', surfaceElevated: '#0A2A3B', text: '#ffffff', muted: '#6c8ea3',
      border: 'rgba(190,232,255,.12)', accent: '#3ca2d9', accentText: '#bee8ff',
      radius: '14px', borderWidth: '1px',
      shadow: '0 4px 12px rgba(0,0,0,.45), 0 18px 40px rgba(1,10,15,.4)',
      // La lueur du haut, reprise de la planche : elle éclaire l'en-tête et
      // s'éteint avant le bas de page, comme sur chaque vignette.
      bggrad: 'radial-gradient(118% 78% at 50% -14%, #0b3d57 0%, #06283a 30%, #03151e 58%, #020D12 82%)',
      font: "'Manrope', -apple-system, sans-serif",
      fine: {
        '--o-surfA': '#0a2a3b', '--o-surfB': '#06202e',
        '--o-bg2': '#03131c', '--o-side1': '#04161f', '--o-side2': '#020d12',
        '--o-header': 'rgba(2,13,18,.8)',
        '--o-well': '#051b27', '--o-well0': '#0a2a3b', '--o-well2': '#020d12',
        // Quatre niveaux de texte : blanc pur pour les titres, TP-10 pour le
        // courant, puis deux gris bleutés — TP-09 ferme la marche.
        // TP-09 (#6c8ea3) tombait a 4,29:1 sur la carte haute : mesure, pas
        // impression. Eclairci juste assez pour passer, sans quitter l'acier.
        '--o-text': '#ffffff', '--o-text1': '#d9e2e7', '--o-text2': '#9db6c5', '--o-text3': '#7597ab',
        '--o-bd1': 'rgba(190,232,255,.17)', '--o-bd2': 'rgba(190,232,255,.11)', '--o-bd3': 'rgba(190,232,255,.075)',
        '--o-s1': 'rgba(190,232,255,.1)', '--o-s2': 'rgba(190,232,255,.065)', '--o-s3': 'rgba(190,232,255,.045)',
        '--o-s4': 'rgba(190,232,255,.03)', '--o-s5': 'rgba(190,232,255,.03)',
        // Le voile du bandeau météo : lui aussi vire au bleu de la charte,
        // sinon il ramène le gris que tout le reste évite.
        '--o-sky': 'rgba(60,162,217,.34)',
        // Sémantique : le texte change d'un thème à l'autre, pas la lecture
        // d'un point vert ou d'une jauge rouge. On les refroidit, sans plus.
        '--o-ok': '#4fd1a5', '--o-ok-rgb': '79,209,165',
        '--o-warn2': '#f0b25e', '--o-warn2-rgb': '240,178,94',
        '--o-bad': '#f58c7f', '--o-bad-rgb': '245,140,127',
        /* Accents décoratifs : la charte n'a qu'une teinte, la hiérarchie s'y
         * fait par la CLARTÉ. Chacun garde son rôle — les volets restent d'une
         * seule couleur partout — mais aucun ne sort du bleu. Un violet de
         * volet sur ce fond se voyait de l'autre bout de la pièce. */
        '--o-gold': '#bee8ff', '--o-gold-rgb': '190,232,255',
        '--o-cold': '#8fc6e8', '--o-cold-rgb': '143,198,232',
        '--o-cyan': '#5bc8f5', '--o-cyan-rgb': '91,200,245',
        /* Les volets prennent l'ACIER, pas un second azur. Le premier essai,
         * #4e8fcb, faisait deux bleus vifs a onze degres de teinte l'un de
         * l'autre — et 4,35:1, sous le seuil. L'acier desature s'oppose au
         * vif de l'accent par la saturation, comme la charte le fait elle-meme
         * en donnant #3CA2D9 ET #6C8EA3. */
        '--o-purple': '#8aafc4', '--o-purple-rgb': '138,175,196',
        // L'avertissement garde sa chaleur : c'est ce qui le fait lire comme
        // un avertissement. Juste assez rabattu pour ne pas jurer.
        '--o-warn': '#f2c97d', '--o-warn-rgb': '242,201,125',
        /* Les teintes des PIÈCES ne sont pas reprises ici, et c'est un choix.
         *
         * Elles ont été ramenées dans la gamme une fois : sept pièces d'un
         * même bleu, échelonnées par la clarté. Le résultat était cohérent et
         * illisible — on ne repère plus la cuisine du coin de l'œil, il faut
         * lire l'icône. Ces couleurs n'habillent pas, elles identifient, et
         * une charte de marque ne l'emporte pas là-dessus. */
        // Au survol, la lumière plutôt que l'ombre : c'est le geste de la charte.
        '--o-shadow-hover': '0 22px 48px rgba(2,96,147,.4)',
      },
    },
    light: {
      bg: '#e7eef3', surface: '#ffffff', surfaceElevated: '#ffffff', text: '#020d12', muted: '#4b6879',
      border: 'rgba(5,31,45,.13)', accent: '#026093', accentText: '#014e78',
      radius: '14px', borderWidth: '1px',
      shadow: '0 1px 2px rgba(5,31,45,.06), 0 10px 26px rgba(5,31,45,.07)',
      // La planche a aussi ses plages claires — #FFFFFF, #E0E0E0, #D9E2E7. La
      // lueur reste, retournée : le blanc en haut, le gris bleuté en bas.
      bggrad: 'radial-gradient(118% 78% at 50% -14%, #ffffff 0%, #edf3f7 34%, #dde7ed 72%, #d9e2e7 100%)',
      font: "'Manrope', -apple-system, sans-serif",
      fine: {
        '--o-surfA': '#ffffff', '--o-surfB': '#fbfdfe',
        '--o-bg2': '#eff4f7', '--o-side1': '#ffffff', '--o-side2': '#e7eef3',
        '--o-header': 'rgba(247,250,252,.88)',
        '--o-well': '#ffffff', '--o-well0': '#ffffff', '--o-well2': '#e7eef3',
        // Sur blanc, TP-09 ne donne que 3,48:1. Assombri jusqu'a 4,58:1.
        '--o-text': '#020d12', '--o-text1': '#051f2d', '--o-text2': '#3f5a69', '--o-text3': '#587a8d',
        '--o-bd1': 'rgba(5,31,45,.16)', '--o-bd2': 'rgba(5,31,45,.11)', '--o-bd3': 'rgba(5,31,45,.075)',
        '--o-s1': 'rgba(5,31,45,.075)', '--o-s2': 'rgba(5,31,45,.05)', '--o-s3': 'rgba(5,31,45,.035)',
        '--o-s4': 'rgba(5,31,45,.022)', '--o-s5': 'rgba(5,31,45,.022)',
        '--o-sky': 'rgba(2,96,147,.22)',
        // Assombris pour rester lisibles sur blanc, comme le veut le thème clair.
        '--o-ok': '#0f7a5a', '--o-ok-rgb': 'var(--o-ok-rgb)',
        '--o-warn2': '#a85b0b', '--o-warn2-rgb': '245,158,11',
        '--o-bad': '#b4231a', '--o-bad-rgb': '239,68,68',
        // Mêmes rôles, retournés : sur blanc c'est le plus SOMBRE qui
        // ressort. L'ordre de clarté s'inverse, la hiérarchie tient.
        '--o-gold': '#01507b', '--o-gold-rgb': '1,80,123',
        '--o-cold': '#0d6f9f', '--o-cold-rgb': '13,111,159',
        '--o-cyan': '#0a6e9e', '--o-cyan-rgb': '10,110,158',
        '--o-purple': '#4b6e82', '--o-purple-rgb': '75,110,130',
        // 4,14:1 sur blanc : sous le seuil. Assombri a 4,82:1.
        '--o-warn': '#9a6809', '--o-warn-rgb': '154,104,9',
        // Mêmes rôles, assombris : sur blanc c'est la profondeur qui range.
        '--o-shadow-hover': '0 18px 40px rgba(5,31,45,.14)',
      },
    },
  },
};
function lum(c) {
  c = (c || '').trim(); let r, g, b;
  if (c[0] === '#') { let h = c.slice(1); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; const n = parseInt(h, 16); if (isNaN(n)) return 1; r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255; }
  else { const m = c.match(/(\d+)[ ,]+(\d+)[ ,]+(\d+)/); if (!m) return 1; r = +m[1]; g = +m[2]; b = +m[3]; }
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
function applyVars(root, v) {
  const set = (k, val) => { if (val) root.style.setProperty(k, val); };
  set('--o-bg', v.bg); set('--o-bg2', v.bg); set('--o-side2', v.bg); set('--o-well2', v.bg);
  set('--o-surfA', v.surfaceElevated || v.surface); set('--o-surfB', v.surface); set('--o-header', v.surface); set('--o-side1', v.surfaceElevated || v.surface); set('--o-well', v.surface); set('--o-well0', v.surfaceElevated || v.surface);
  set('--o-text', v.text); set('--o-text1', v.text); set('--o-text2', v.muted); set('--o-text3', v.muted);
  set('--o-bd1', v.border); set('--o-bd2', v.border); set('--o-bd3', v.border);
  set('--o-s1', v.border); set('--o-s2', v.border); set('--o-s3', v.border); set('--o-s4', v.border); set('--o-s5', v.border);
  if (v.accent) { set('--o-accent', v.accent); const rgb = cssToRgb(v.accent); if (rgb) set('--o-accent-rgb', rgb); const at = v.accentText || v.accent; set('--o-accent-soft', at); const rgbS = cssToRgb(at); if (rgbS) set('--o-accent-soft-rgb', rgbS); }
  set('--o-radius', v.radius); set('--o-shadow', v.shadow); set('--o-bw', v.borderWidth); set('--o-font', v.font); set('--o-bggrad', v.bggrad);
  // Tokens fins d'un preset (7 niveaux de texte, traits ≠ remplissages, sémantique) :
  // appliqués en dernier, ils affinent le mapping grossier ci-dessus sans le remplacer.
  if (v.fine) Object.keys(v.fine).forEach(k => set(k, v.fine[k]));
}
// "Suivre HA" : lit le thème ACTIF de HA (nom via selectedTheme/default) puis sa définition
// Lit les valeurs RÉSOLUES du thème HA appliqué sur le parent (comme la V1 : C5).
// Marche pour tous les thèmes HACS (var() + tokens maison résolus par le navigateur).
/* Ce que Home Assistant affiche, en une chaine comparable (24/09, plan M9).
 *
 * « Suivre Home Assistant » reappliquait le theme TOUTES LES 1,5 s : retirer
 * une cinquantaine de proprietes de la racine, les reecrire, puis relancer la
 * garde de contraste et ses calculs de couleur. Quarante fois par minute,
 * indefiniment, pour un theme qui ne change presque jamais — et chaque passe
 * invalidait le style de toute la page.
 *
 * On garde la lecture, qui est la source de verite : le theme de HA peut
 * changer sans que son NOM bouge, le mode sombre par exemple. Mais on ne
 * REECRIT que si la lecture a change. */
export function signatureHaTheme(hass) {
  const v = readComputedHaTheme(hass);
  return v ? JSON.stringify(v) : '';
}

function readComputedHaTheme(hass) {
  try {
    const top = window.top || window;
    const d = top.document;
    const els = [];
    if (d.documentElement) els.push(d.documentElement);
    const he = d.querySelector('home-assistant'); if (he) els.push(he);
    const hr = he && he.shadowRoot && he.shadowRoot.querySelector('home-assistant-main'); if (hr) els.push(hr);
    if (d.body) els.push(d.body);
    for (const el of els) {
      const t = top.getComputedStyle(el), r = l => (t.getPropertyValue(l) || '').trim();
      const bg = r('--lovelace-background') || r('--primary-background-color');
      if (!bg) continue;
      const dark = (hass && hass.themes && typeof hass.themes.darkMode === 'boolean') ? hass.themes.darkMode : lum(bg) < 0.5;
      return {
        dark, bg,
        accent: r('--primary-color'),
        surface: r('--ha-card-background') || r('--card-background-color'),
        surfaceElevated: r('--card-background-color') || r('--ha-card-background'),
        text: r('--primary-text-color'),
        muted: r('--secondary-text-color'),
        border: r('--ha-card-border-color') || r('--divider-color'),
        radius: r('--ha-card-border-radius'),
        shadow: r('--ha-card-box-shadow'),
        borderWidth: r('--ha-card-border-width'),
        font: r('--primary-font-family') || r('--mdc-typography-font-family') || r('--paper-font-body1_-_font-family'),
      };
    }
  } catch {}
  return null;
}
/* Safe mode « sans thème » : posé par l'écran d'erreur (boot.jsx), consommé
 * ici — il ne vaut que pour UN chargement et ne touche pas à la configuration.
 * Un preset ou un look corrompu ne doit pas condamner le dashboard. */
export const SAFE_NOLOOK = (() => {
  try { if (sessionStorage.getItem('loggia_safe_nolook')) { sessionStorage.removeItem('loggia_safe_nolook'); return true; } } catch { /* rien */ }
  return false;
})();

export function readLook() {
  if (SAFE_NOLOOK) return { ...LOOK_DEF };
  try {
    const L = { ...LOOK_DEF, ...(cfgVal('loggia_look', null) || {}) };
    if (L.fond !== 'photo') L.fond = 'aucun'; // les degrades retires retombent sur « aucun »
    // « Bleu », retire des couleurs d'accent le 19/09 : c'etait l'accent du theme
    // d'origine, deja offert par « Couleur du theme ».
    if (L.accent === '#4f8cff') L.accent = '';
    return L;
  } catch { return { ...LOOK_DEF }; }
}

/* Teinte d'état : les cartes qui montrent un appareil ACTIF (lampe allumée,
 * volet ouvert, radiateur qui chauffe) lavent leur surface de leur couleur.
 * Le réglage module l'intensité de ce lavis. « Douce » = le rendu historique
 * (les ampoules l'avaient déjà, en dur) ; « Sans » rend les cartes neutres ;
 * « Pleine » double la présence de la couleur, façon GlassHome.
 *
 * `LAVIS` est un facteur module-level et non un état React : il est LU au
 * rendu (jamais à l'import), et changer le réglage redessine tout l'arbre. */
const TEINTES = { sans: 0, discrete: .6, douce: 1, pleine: 1.9 };
export let LAVIS = 1;
/** Alpha de lavis bornée : base × facteur du réglage, plafonnée à .85. */
export const lav = (base) => Math.min(.85, Math.round(base * LAVIS * 1000) / 1000);

/* Fond d'écran : « aucun » ou la photo de l'utilisateur (voir lireFondPhoto).
 * Les dégradés Minuit / Abysse / Ardoise ont vécu du 28 au 29/08/2026 —
 * retirés à la demande de l'utilisateur, la photo les rendait superflus. Une
 * ancienne valeur enregistrée retombe sur « aucun ». */
function applyLook(root, L, frostedPreset, light) {
  // Intensité du lavis de teinte, lue par les cartes au rendu (voir TEINTES).
  LAVIS = TEINTES[L.tint] != null ? TEINTES[L.tint] : 1;
  /* Un seul matériau depuis le 29/08 (décision user) : le translucide de
   * l'accueil, partout. Le réglage Opaque/Verre a disparu de l'Apparence ;
   * `L.glass` reste dans les configs enregistrées mais n'est plus lu. */
  const verre = true;
  root.classList.toggle('loggia-frosted', verre);
  /* « Verre » ne posait qu'un `backdrop-filter`. Or un flou d'arriere-plan ne se
   * voit qu'a travers ce qui est translucide : les surfaces sont a 90 %
   * d'opacite, certains themes les donnent carrement opaques, et l'effet
   * n'apparaissait pas. D'ou l'impression que le reglage ne faisait rien selon
   * le theme choisi.
   *
   * On ouvre donc la surface elle-meme. En JS et non en CSS : les presets posent
   * ces tokens EN INLINE sur la racine, et une regle de classe ne bat pas un
   * style inline — c'est ecrit dans index.css, et c'est pourquoi la premiere
   * tentative ne pouvait pas fonctionner.
   *
   * On garde une base solide : sous 55 % d'opacite, le texte des cartes passe
   * sous le seuil de contraste sur un fond clair.
   *
   * La surface lue est celle DU THEME : un preset la pose en inline, et la
   * retirer d'abord faisait relire celle de Loggia — les quatorze autres
   * themes dessinaient leurs cartes dans le bleu nuit de Loggia (audit du
   * 19/09). `applyTheme` a deja purge les jetons : rien ne s'accumule. Un
   * theme deja plus translucide (Frosted Glass, un verre par conception)
   * garde son opacite. */
  ['--o-surfA', '--o-surfB'].forEach(token => {
    if (!verre) return;
    const brut = getComputedStyle(root).getPropertyValue(token).trim();
    const rgb = cssToRgb(brut);
    if (!rgb) return;
    // L'alpha : la quatrieme composante d'un rgb()/rgba(), s'il y en a une.
    const parts = ((brut.match(/rgba?\(([^)]*)\)/) || [])[1] || '').split(/[\s,/]+/).filter(Boolean);
    const alpha = parts.length === 4 ? (parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3])) : 1;
    root.style.setProperty(token, 'rgba(' + rgb + ',' + Math.min(isNaN(alpha) ? 1 : alpha, .62) + ')');
  });
  root.classList.toggle('loggia-contrast', !!L.contrast);
  if (L.contrast) {
    const cs = getComputedStyle(root);
    const towardText = (token, part) => {
      const a = cssToRgb(cs.getPropertyValue('--o-text').trim());
      const b = cssToRgb(cs.getPropertyValue(token).trim());
      if (!a || !b) return;
      const A = a.split(','), B = b.split(',');
      root.style.setProperty(token, 'rgb(' + [0, 1, 2].map(i => Math.round(+A[i] * part + +B[i] * (1 - part))).join(',') + ')');
    };
    towardText('--o-text2', .55); towardText('--o-text3', .42); towardText('--o-bd3', .22);
  }
  if (L.radius === 'net') root.style.setProperty('--o-radius', '7px');
  else if (L.radius === 'rond') root.style.setProperty('--o-radius', '26px');
  if (!L.shadow) { root.style.setProperty('--o-shadow', 'none'); root.style.setProperty('--o-shadow-hover', 'none'); }
  if (!L.hairline) root.style.setProperty('--o-bw', '0px');
  /* L'accent DU THEME, avant qu'un choix de l'Apparence le remplace : la
   * pastille « Couleur du theme » le montre. Elle lisait `--o-accent` — apres
   * un choix, deux pastilles de la meme couleur (19/09). Relu a chaque
   * application : `--o-accent` vient d'etre purge (THEME_KEYS) puis repose par
   * le theme. */
  root.style.setProperty('--o-accent-theme', getComputedStyle(root).getPropertyValue('--o-accent').trim());
  if (L.accent) {
    const rgb = cssToRgb(L.accent);
    root.style.setProperty('--o-accent', L.accent); root.style.setProperty('--o-accent-soft', L.accent);
    if (rgb) { root.style.setProperty('--o-accent-rgb', rgb); root.style.setProperty('--o-accent-soft-rgb', rgb); }
  }
  /* La garde de contraste (ADR 0060), en DERNIER : elle relit les couleurs
   * telles qu'elles sont posées — surfaces comprises — et ne retouche que
   * celles qui manquent leur seuil. Un theme qui tient les siens n'est pas
   * touche ; les quatorze palettes venues d'ailleurs, si. */
  const csFinal = getComputedStyle(root);
  const corrige = garde(t => csFinal.getPropertyValue(t).trim());
  Object.keys(corrige).forEach(k => root.style.setProperty(k, corrige[k]));
}

export function applyTheme(opts, hass) {
  const root = document.documentElement;
  THEME_KEYS.forEach(k => root.style.removeProperty(k)); root.style.removeProperty('--o-radius'); root.style.removeProperty('--o-bggrad'); root.style.removeProperty('--o-shadow-hover');
  // Ce que la garde de contraste a posé la fois d'avant : sinon la correction
  // d'un thème suivrait au suivant.
  JETONS_GARDE.forEach(k => root.style.removeProperty(k));
  root.classList.remove('loggia-frosted');
  const L = opts.look || readLook();
  // Suivre HA : miroir du thème actif de HA (valeurs résolues sur le parent).
  if (opts.haTheme === 'FOLLOW') {
    const v = readComputedHaTheme(hass);
    if (v) { applyVars(root, v); root.classList.toggle('loggia-light', !v.dark); applyLook(root, L, false, !v.dark); return !!v.dark; }
    // computed pas prêt → base en attendant (l'effet poll réessaie)
  }
  const light = opts.mode === 'light';
  root.classList.toggle('loggia-light', light);
  // Preset Loggia ('' = défaut → tokens CSS de base, aucune surcharge). Sinon applique la variante claire/sombre.
  const preset = LOGGIA_PRESETS[opts.loggiaTheme];
  if (preset) { const v = preset[light ? 'light' : 'dark']; if (v) applyVars(root, v); }
  applyLook(root, L, opts.loggiaTheme === 'frosted', light); // 'frosted' active aussi le flou backdrop des cartes
  return !light;
}
