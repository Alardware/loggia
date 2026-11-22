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
import { cfgVal, apparence } from './state.js';
import { LOOK_DEF } from './ui.jsx';
import { poserVerre } from './verre.js';
import { poserCalme } from './calme.js';
import { suivreNuit } from './nuitecran.js';

/* « Verre des cartes » (ADR 0284) : la classe se pose à l'import, donc avant
 * le premier rendu — un saut de Plein à Léger se verrait sur chaque carte. */
poserVerre();
/* « Animations réduites » (audit des thèmes du 13/11, V4), de même : la classe
 * est là avant le premier rendu, aucune boucle ne part pour s'arrêter aussitôt. */
poserCalme();
/* « Nuit de l'écran » (ADR 0287), de même : une tablette rechargée la nuit ne
 * s'allume pas d'abord. Le suivi de la minute ne part que sur Soleil. */
suivreNuit();

// "couleur CSS (hex/rgb) → 'r,g,b'" pour alimenter les tokens rgba(var(--o-accent-rgb),...)
function cssToRgb(c) {
  c = (c || '').trim();
  if (c[0] === '#') { let h = c.slice(1); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; const n = parseInt(h, 16); return isNaN(n) ? '' : `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`; }
  const m = c.match(/(\d+)[ ,]+(\d+)[ ,]+(\d+)/); return m ? `${m[1]},${m[2]},${m[3]}` : '';
}

const THEME_KEYS = ['--o-serif', '--o-bg', '--o-bggrad', '--o-bg2', '--o-side1', '--o-side2', '--o-surfA', '--o-surfB', '--o-header', '--o-text', '--o-text1', '--o-text2', '--o-text3', '--o-bd1', '--o-bd2', '--o-bd3', '--o-s1', '--o-s2', '--o-s3', '--o-s4', '--o-s5', '--o-well', '--o-well2', '--o-well0', '--o-accent', '--o-accent-rgb', '--o-accent-soft', '--o-accent-soft-rgb', '--o-shadow', '--o-bw', '--o-font', '--o-flou', '--o-fenetre', '--o-flou-fenetre', '--o-relief',
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
  /* La lampe allumée et l'interrupteur allumé (audit des thèmes du 13/11, F7) : Google les met à son accent, iOS allume
   * ses interrupteurs en vert. Sans eux ici, le bleu de l'un resterait sur les lampes du thème suivant. */
  '--o-lampe', '--o-lampe-rgb', '--o-lampe-b', '--o-bascule-lampe', '--o-bascule-on',
  /* Les teintes des pieces. Elles suivent un theme qui n'a qu'une couleur,
   * et redeviennent celles d'avant des qu'on en change. */
  '--o-piece-ambre', '--o-piece-ambre-rgb', '--o-piece-tendre',
  '--o-piece-tendre-rgb', '--o-piece-vert', '--o-piece-vert-rgb',
  '--o-piece-chambre', '--o-piece-chambre-rgb', '--o-piece-bain', '--o-piece-bain-rgb',
  /* La charte du mouvement (audit des thèmes du 13/11, V6) : durées et courbes, posées sur la racine dans index.css. Depuis le
   * 17/11, tous les thèmes ont le rythme de Prisme et aucun ne le règle ; un thème qui le ferait ne doit pas le laisser au suivant. */
  '--o-dur-rapide', '--o-dur', '--o-dur-lente', '--o-courbe', '--o-rebond'];
// Thèmes natifs Loggia (créés pour Loggia, adaptés des thèmes HA fournis). Chaque preset a une variante claire + sombre,
// pilotée par le Mode d'affichage. Forme = entrée de applyVars (bg/surface/text/accent/radius/shadow/border/font/bggrad).
const LOGGIA_PRESETS = {
  /* ── Neumorphix, refait sur sa source (audit des thèmes du 13/11, F6) : le thème « NeuMorphix » de yakidd
   *    (`themes/neumorphix.yaml`, variantes light et dark), relu le 14/11. Le néomorphisme tient à UNE règle : la carte a la
   *    couleur du fond, et seules deux ombres — une sombre en bas à droite, une claire en haut à gauche — la soulèvent.
   *      • clair : fond ET carte #f0f0f0 (Loggia posait une carte bleutée, en verre, sur un dégradé : le principe était cassé) ;
   *      • sombre : fond #1e2128, carte #262b35 ;
   *      • les ombres de la source, avec leur liseré intérieur d'un pixel ; en petit (`neu-shadow-flat`) pour ce qui défile ;
   *      • cartes OPAQUES (`matiere`), aucun dégradé, 20 px de rayon, aucune bordure ; séparateurs de la source ;
   *      • `relief` : la garde de contraste n'écarte pas la carte du fond tant que ses ombres la portent (contraste.js).
   *    Les commandes en creux (`neu-shadow-inset`) de la source ne sont pas reprises : ce sont des composants, pas des jetons. */
  neumorphix: {
    light: { bg: '#f0f0f0', surface: '#f0f0f0', surfaceElevated: '#f0f0f0', text: '#2c2f3a', muted: '#606470',
      border: '#d8d8d8', traits: ['#d8d8d8', 'rgba(216,216,216,.8)', 'rgba(216,216,216,.6)'],
      fonds: ['rgba(44,47,58,.07)', 'rgba(44,47,58,.05)', 'rgba(44,47,58,.035)', 'rgba(44,47,58,.022)'],
      accent: '#6c7ae0', radius: '20px', borderWidth: '0px', bggrad: '', matiere: 'opaque', relief: true,
      shadow: '4px 4px 12px #dedede, -4px -4px 12px #ffffff, inset 1px 1px 0px #ffffff',
      font: "'Manrope', -apple-system, sans-serif",
      // L'ombre de survol est son relief (17/11) : sans elle, une carte survolée prenait l'ombre portée sombre de Loggia.
      fine: { '--o-shadow-rangee': '2px 2px 4px #dedede, -2px -2px 4px #ffffff', '--o-shadow-hover': '4px 4px 12px #dedede, -4px -4px 12px #ffffff, inset 1px 1px 0px #ffffff' } },
    dark: { bg: '#1e2128', surface: '#262b35', surfaceElevated: '#262b35', text: '#e2e8f0', muted: '#94a3b8',
      border: '#3a4055', traits: ['#3a4055', 'rgba(58,64,85,.8)', 'rgba(58,64,85,.6)'],
      fonds: ['rgba(226,232,240,.08)', 'rgba(226,232,240,.06)', 'rgba(226,232,240,.045)', 'rgba(226,232,240,.03)'],
      accent: '#5de0d8', radius: '20px', borderWidth: '0px', bggrad: '', matiere: 'opaque', relief: true,
      shadow: '3px 3px 7px #13161c, -3px -3px 7px #2d3340, inset 1px 1px 0px #3a3f4d',
      font: "'Manrope', -apple-system, sans-serif",
      fine: { '--o-shadow-rangee': '2px 2px 4px #13161c, -2px -2px 4px #2d3340', '--o-shadow-hover': '3px 3px 7px #13161c, -3px -3px 7px #2d3340, inset 1px 1px 0px #3a3f4d' } },
  },
  /* ── Google, refait sur sa source (audit des thèmes du 13/11, F7) : le thème Home Assistant « Google Theme » de JuanMTech
   *    (`themes/google_theme.yaml`), relu ligne à ligne le 15/11.
   *      • des cartes OPAQUES (`matiere`), blanches en clair, #202124 en sombre — Loggia les ouvrait à 62 % et les floutait ;
   *      • un fond NEUTRE, #f8f8f8 (il était bleuté) ; la bordure de carte de la source, #ebebeb / #2a2b2e ;
   *      • la barre latérale a la couleur des cartes, l'en-tête celle de la page ; en clair, les creux sont ses gris ;
   *      • TOUT CE QUI EST ACTIF PREND L'ACCENT (`rgb-state-light-color`, `rgb-state-cover-color`… valent l'accent) : une lampe
   *        allumée et un volet ouvert sont bleus, comme un interrupteur. C'est à cela qu'on reconnaît ce thème.
   *    La source ne déclare ni rayon, ni ombre, ni police : 12 px et l'ombre légère restent ; Roboto — la police de Home
   *    Assistant, donc celle du thème — passe en tête de la pile. Elle est embarquée (public/fonts, E5). */
  google: {
    light: { bg: '#f8f8f8', surface: '#ffffff', surfaceElevated: '#ffffff', text: '#202124', muted: '#5f6368',
      border: '#ebebeb', fonds: ['#e6e6e6', '#ebebeb', '#f2f2f2', '#f5f5f5'], barre: '#ffffff', entete: '#f8f8f8',
      accent: '#1a73e8', radius: '12px', borderWidth: '1px', bggrad: '', matiere: 'opaque',
      shadow: '0 1px 3px rgba(60,64,67,.15), 0 1px 2px rgba(60,64,67,.1)',
      etats: { lampe: '#1a73e8', purple: '#1a73e8' },
      font: "'Roboto','Google Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      fine: { '--o-lampe-b': '#1a73e8', '--o-bascule-lampe': 'var(--o-accent-fond)' } },
    dark: { bg: '#171717', surface: '#202124', surfaceElevated: '#202124', text: '#f2f2f2', muted: '#a6a6a6',
      border: '#2a2b2e', barre: '#202124', entete: '#171717',
      accent: '#8ab4f8', radius: '12px', borderWidth: '1px', bggrad: '', matiere: 'opaque',
      shadow: '0 1px 3px rgba(0,0,0,.5)',
      etats: { lampe: '#8ab4f8', purple: '#8ab4f8' },
      font: "'Roboto','Google Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      fine: { '--o-lampe-b': '#8ab4f8', '--o-bascule-lampe': 'var(--o-accent-fond)' } },
  },
  /* ── iOS, refait sur sa source (audit des thèmes du 13/11, F7) : le thème Home Assistant de basnijholt
   *    (`themes/ios-themes.yaml`, variante « blue-red », la première du fichier), relu le 15/11.
   *      • la carte est un voile à 40 %, SANS flou (`ha-card-background: rgba(245,245,245,.4)` / `rgba(10,10,10,.4)`) : Loggia
   *        la montait à 62 % et la floutait. `matiere: 'opaque'` ne dit ici que cela — ni voile ajouté, ni flou ;
   *      • 20 px de rayon (22 avant), aucune bordure, AUCUNE ombre : la source n'en déclare pas ;
   *      • en sombre, le fond #2c2c2e de la source (systemGray5) et non un presque-noir, et son texte atténué #d3d3d3 ;
   *      • un interrupteur allumé est VERT, #34c759 / #30d158 (systemGreen), quel que soit l'accent (`--o-bascule-on`,
   *        index.css) ;
   *      • ce qui flotte (fiche, menu) prend le fond presque plein de la source (`card-background-color`, 90 %) : un voile
   *        à 40 % sans flou laisserait lire la page à travers ses réglages (`fenetre`).
   *    Le fond de la source est une PHOTO HomeKit, la même en clair et en sombre — et elle est sombre. Décision D2a : pas
   *    d'image embarquée, un dégradé redessiné d'après ses couleurs relevées — violet nuit, un halo bleu à gauche, un halo
   *    prune à droite, assourdis. EN SOMBRE seulement : en clair Loggia écrit en encre foncée sur la page, une photo sombre
   *    n'y tiendrait pas ; le clair garde le gris uni de la source (#e5e5ea, systemGray5).
   *    Pas repris : les textes du clair (la source écrit le principal en gris et le secondaire en noir, l'ordre inverse de
   *    Loggia), l'icône active jaune, le curseur bleu. */
  ios: {
    light: { bg: '#e5e5ea', surface: 'rgba(245,245,245,.4)', surfaceElevated: 'rgba(245,245,245,.4)', text: '#1c1c1e', muted: '#6c6c70',
      border: 'rgba(142,142,147,.3)', fonds: ['rgba(60,60,67,.1)'], barre: '#e5e5ea', fenetre: 'rgba(255,255,255,.9)',
      accent: '#ff9409', accentText: '#b35c00', radius: '20px', borderWidth: '0px', shadow: 'none', bggrad: '', matiere: 'opaque',
      font: "-apple-system,'SF Pro Display','Segoe UI',sans-serif",
      fine: { '--o-bascule-on': '#34c759', '--o-shadow-rangee': 'none' } },
    dark: { bg: '#2c2c2e', surface: 'rgba(10,10,10,.4)', surfaceElevated: 'rgba(10,10,10,.4)', text: '#ffffff', muted: '#d3d3d3',
      border: 'rgba(152,152,157,.3)', fonds: ['rgba(255,255,255,.08)'], barre: '#2c2c2e', entete: 'rgba(30,2,61,.4)', fenetre: 'rgba(25,25,25,.9)',
      accent: '#ff9f09', radius: '20px', borderWidth: '0px', shadow: 'none', matiere: 'opaque',
      // Chaque halo est écrit dans sa couleur VRAIE, une fois posé sur le violet (le bleu pétrole et le rouge de la photo à 40 %) :
      // aucun n'est plus clair que le gris #2c2c2e de la source, la garde de contraste n'a donc rien à retoucher à cause d'eux.
      bggrad: 'radial-gradient(58% 46% at 27% 38%, #212857 0%, rgba(33,40,87,0) 72%), radial-gradient(56% 50% at 73% 40%, #4a1844 0%, rgba(74,24,68,0) 72%), radial-gradient(50% 30% at 30% 100%, #3e1638 0%, rgba(62,22,56,0) 76%), linear-gradient(180deg, #1c0240 0%, #26064b 62%, #19052f 100%)',
      font: "-apple-system,'SF Pro Display','Segoe UI',sans-serif",
      fine: { '--o-bascule-on': '#30d158', '--o-shadow-rangee': 'none' } },
  },
  /* ── Frosted Glass, refait sur sa source (audit des thèmes du 13/11, F1) : le thème Home Assistant de wessamlauf, v1.4.0,
   *    relu ligne à ligne le 14/11. Ce qui en fait un verre :
   *      • la carte est TRANSPARENTE (`ha-card-background: transparent`) — ici un voile à peine posé, parce que la même surface
   *        sert aussi aux menus et aux fiches de Loggia, qui ne peuvent pas être de l'air ;
   *      • un flou COURT, 8 px en clair et 10 px en sombre, saturation 1,25 (`flou`) — pas les 16 px de Loggia ;
   *      • une bordure d'un demi-pixel, blanche à 30 % / 22 %, et un REFLET INTÉRIEUR en trois traits, avant l'ombre portée ;
   *      • les textes sont la même encre à 98 %, 80 %, 60 % — pas une seconde teinte ;
   *      • l'accent sombre est un bleu acier #7aa2be (Loggia avait une pervenche) ; le clair, #6a74d3, était juste ;
   *      • barre latérale et en-tête à 10 % du fond ; marche #76d698, arrêt #ea7287, avertissement #ffdb75 ;
   *      • ce qui flotte (fiche, menu) a son propre fond, 35 % du fond du thème et un flou de 18 px (`fenetre`).
   *    Le fond de la source est une PHOTO. Décision D2a : pas d'image embarquée, un dégradé redessiné d'après ses couleurs —
   *    crème → rose → bleu en clair, halos bleu nuit, gris et prune sur #02060b en sombre. Le bleu du coin est adouci et les
   *    halos assourdis juste assez pour que l'encre et l'accent du thème tiennent leurs seuils sans être retouchés. */
  frosted: {
    light: { bg: '#fef4f2', surface: 'rgba(255,255,255,.14)', surfaceElevated: 'rgba(255,255,255,.22)',
      text: 'rgba(19,21,54,.98)', text1: 'rgba(19,21,54,.92)', muted: 'rgba(19,21,54,.8)', text3: 'rgba(19,21,54,.66)',
      border: 'rgba(255,255,255,.3)', traits: ['rgba(255,255,255,.38)', 'rgba(255,255,255,.3)', 'rgba(19,21,54,.1)'],
      fonds: ['rgba(255,255,255,.38)', 'rgba(255,255,255,.32)', 'rgba(255,255,255,.26)', 'rgba(255,255,255,.2)'],
      barre: 'rgba(254,244,242,.1)', entete: 'rgba(254,244,242,.1)',
      accent: '#6a74d3', accentText: '#4e57b0', radius: '18px', borderWidth: '0.5px', flou: 'blur(8px) saturate(1.25)',
      fenetre: 'rgba(254,244,242,.35)', flouFenetre: 'blur(18px) saturate(1.2)',
      etats: { ok: '#76d698', bad: '#ea7287', warn: '#ffdb75' },
      shadow: '3px 3px .5px -3.5px rgba(255,255,255,.3) inset, -2px -2px .5px -2px rgba(255,255,255,.3) inset, 0 0 8px 1px rgba(255,255,255,.1) inset, 0 0 2px 0 rgba(0,0,0,.1), 0 10px 32px rgba(21,25,45,.12), 0 2px 8px rgba(21,25,45,.08)',
      bggrad: 'radial-gradient(78% 88% at 100% 100%, rgba(198,208,242,.95) 0%, rgba(198,208,242,0) 72%), radial-gradient(70% 70% at 96% 4%, rgba(208,231,250,.95) 0%, rgba(208,231,250,0) 72%), radial-gradient(70% 80% at 0% 100%, rgba(245,226,235,.95) 0%, rgba(245,226,235,0) 72%), linear-gradient(115deg, #fffdf4 0%, #f5f2f7 48%, #eaedf8 100%)',
      font: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
      fine: { '--o-side2': 'rgba(254,244,242,.1)', '--o-shadow-rangee': '3px 3px .5px -3.5px rgba(255,255,255,.3) inset, -2px -2px .5px -2px rgba(255,255,255,.3) inset, 0 0 2px 0 rgba(0,0,0,.1), 0 3px 10px rgba(21,25,45,.1)' } },
    dark: { bg: '#02060b', surface: 'rgba(234,235,238,.035)', surfaceElevated: 'rgba(234,235,238,.06)',
      text: 'rgba(234,235,238,.98)', text1: 'rgba(234,235,238,.92)', muted: 'rgba(234,235,238,.8)', text3: 'rgba(234,235,238,.62)',
      border: 'rgba(234,235,238,.22)', traits: ['rgba(234,235,238,.22)', 'rgba(234,235,238,.16)', 'rgba(90,111,128,.28)'],
      fonds: ['rgba(255,255,255,.11)', 'rgba(255,255,255,.09)', 'rgba(255,255,255,.07)', 'rgba(255,255,255,.05)'],
      barre: 'rgba(2,6,11,.1)', entete: 'rgba(2,6,11,.1)',
      accent: '#7aa2be', radius: '18px', borderWidth: '0.5px', flou: 'blur(10px) saturate(1.25)',
      fenetre: 'rgba(2,6,11,.35)', flouFenetre: 'blur(18px) saturate(1.2)',
      etats: { ok: '#76d698', bad: '#ea7287', warn: '#ffdb75' },
      shadow: '3px 3px .5px -3.5px rgba(255,255,255,.3) inset, -2px -2px .5px -2px rgba(255,255,255,.2) inset, 0 0 8px 1px rgba(255,255,255,.06) inset, 0 0 2px 0 rgba(0,0,0,.18), 0 14px 38px rgba(0,0,0,.34), 0 2px 10px rgba(0,0,0,.24)',
      bggrad: 'radial-gradient(60% 55% at 26% 30%, rgba(18,38,70,.75) 0%, rgba(18,38,70,0) 72%), radial-gradient(44% 40% at 46% 47%, rgba(44,52,72,.62) 0%, rgba(44,52,72,0) 74%), radial-gradient(40% 36% at 76% 14%, rgba(42,38,48,.62) 0%, rgba(42,38,48,0) 76%), radial-gradient(62% 20% at 58% 77%, rgba(46,52,68,.55) 0%, rgba(46,52,68,0) 76%), radial-gradient(50% 40% at 12% 88%, rgba(40,24,42,.75) 0%, rgba(40,24,42,0) 76%), #02060b',
      font: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
      fine: { '--o-side2': 'rgba(2,6,11,.1)', '--o-shadow-rangee': '3px 3px .5px -3.5px rgba(255,255,255,.3) inset, -2px -2px .5px -2px rgba(255,255,255,.2) inset, 0 0 2px 0 rgba(0,0,0,.18), 0 3px 10px rgba(0,0,0,.22)' } },
  },
  // ── Thèmes éditeur VS Code (palettes officielles ; variante claire = pendant light officiel) ──
  /* ── LES TROIS PALETTES D'ÉDITEUR, refaites sur leurs sources (audit des thèmes du 13/11, F5 ; relues le 15/11) : One Dark
   *    Pro, Tokyo Night, Night Owl. Leurs fonds, textes et accents étaient justes ; ce qui s'écartait leur était commun — une
   *    bordure translucide inventée, un dégradé de fond qu'aucune source n'a, les couleurs d'état de Loggia, le verre, 18 px
   *    de rayon et une grande ombre. Elles prennent :
   *      • la bordure, les textes et les couleurs d'état de LEUR palette ; un fond uni ; des cartes OPAQUES (`matiere`) ;
   *      • la forme d'un éditeur, là où la source ne dit rien : 6 px, un filet d'un pixel, aucune ombre ;
   *      • fond de page = la barre latérale de l'éditeur, carte = la zone d'édition.
   *    One Dark Pro (Binaryify/OneDark-Pro) et One Light (atom/one-light-syntax) : Atom, lui, PRESCRIT sa forme — 3 px de rayon
   *    et la police du système. Le fond de page clair (#eaeaeb) n'a pas été retrouvé dans une source lue : il reste. */
  onedark: {
    dark: { bg: '#21252b', surface: '#282c34', surfaceElevated: '#282c34', text: '#abb2bf', muted: '#7f848e',
      border: '#3e4452', fonds: ['rgba(171,178,191,.1)', 'rgba(171,178,191,.075)', 'rgba(171,178,191,.05)', 'rgba(171,178,191,.035)'], barre: '#21252b',
      accent: '#61afef', radius: '3px', borderWidth: '1px', shadow: 'none', bggrad: '', matiere: 'opaque',
      etats: { ok: '#98c379', warn: '#e5c07b', warn2: '#d19a66', bad: '#e06c75', purple: '#c678dd', cyan: '#56b6c2', gold: '#e5c07b' },
      font: "system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      fine: { '--o-well': '#21252b', '--o-well0': '#2c313a', '--o-shadow-rangee': 'none' } },
    light: { bg: '#eaeaeb', surface: '#fafafa', surfaceElevated: '#fafafa', text: '#383a42', muted: '#696c77',
      border: 'rgba(56,58,66,.2)', fonds: ['rgba(56,58,66,.1)', 'rgba(56,58,66,.07)', 'rgba(56,58,66,.05)', 'rgba(56,58,66,.035)'], barre: '#eaeaeb',
      accent: '#4078f2', radius: '3px', borderWidth: '1px', shadow: 'none', bggrad: '', matiere: 'opaque',
      etats: { ok: '#50a14f', warn: '#c18401', warn2: '#986801', bad: '#e45649', purple: '#a626a4', cyan: '#0184bc', gold: '#c18401' },
      font: "system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      fine: { '--o-well': '#eaeaeb', '--o-well0': '#ffffff', '--o-shadow-rangee': 'none' } },
  },
  /* ── Dracula / Alucard, refaits sur leurs sources (audit des thèmes du 13/11, F2) : la palette officielle (draculatheme.com,
   *    Dracula et Alucard « Classic ») et le thème Home Assistant officiel (dracula/home-assistant), relus le 14/11.
   *      • la FORME est celle du thème HA : 12 px de rayon, AUCUNE bordure, l'ombre `3px 3px 13px -6px` noire à 40 % ;
   *      • des cartes OPAQUES (`matiere`) et aucun dégradé de fond : la source n'a ni verre ni lueur ;
   *      • les couleurs d'état sont celles de la palette — vert, orange, rouge, rose, cyan, jaune : c'est l'identité du thème ;
   *      • le texte atténué est le « Comment » de la palette (#6272a4, #6c664b) : la garde de contraste le remonte DANS SA
   *        TEINTE jusqu'au seuil (décision D1a) — Alucard avait un violet inventé, il retrouve son brun ;
   *      • les traits fins sont la « Selection » de la palette, comme elle le prescrit ; les creux, ses fonds « Light ».
   *    Le fond et la carte restent ceux de la PALETTE (Background Dark sous Background) : le thème HA pose la carte en
   *    #44475a, où presque aucune couleur de Dracula ne se lit. La police n'est prescrite par aucune source : Manrope reste. */
  dracula: {
    dark: { bg: '#21222c', surface: '#282a36', surfaceElevated: '#343746', text: '#f8f8f2', muted: '#6272a4',
      border: '#44475a', traits: ['#44475a', 'rgba(68,71,90,.75)', 'rgba(68,71,90,.5)'],
      fonds: ['rgba(248,248,242,.09)', 'rgba(248,248,242,.065)', 'rgba(248,248,242,.045)', 'rgba(248,248,242,.03)'],
      accent: '#bd93f9', radius: '12px', borderWidth: '0px', shadow: '3px 3px 13px -6px rgba(0,0,0,.4)', bggrad: '', matiere: 'opaque',
      etats: { ok: '#50fa7b', warn: '#f1fa8c', warn2: '#ffb86c', bad: '#ff5555', purple: '#ff79c6', cyan: '#8be9fd', gold: '#f1fa8c' },
      font: "'Manrope', -apple-system, sans-serif",
      fine: { '--o-well': '#21222c', '--o-well0': '#424450', '--o-shadow-rangee': '2px 2px 8px -4px rgba(0,0,0,.4)' } },
    light: { bg: '#ece9df', surface: '#fffbeb', surfaceElevated: '#fffbeb', text: '#1f1f1f', muted: '#6c664b',
      border: '#cfcfde', traits: ['#cfcfde', 'rgba(207,207,222,.8)', 'rgba(207,207,222,.55)'],
      fonds: ['rgba(31,31,31,.07)', 'rgba(31,31,31,.05)', 'rgba(31,31,31,.035)', 'rgba(31,31,31,.022)'],
      accent: '#644ac9', radius: '12px', borderWidth: '0px', shadow: '3px 3px 13px -6px rgba(31,31,31,.22)', bggrad: '', matiere: 'opaque',
      etats: { ok: '#14710a', warn: '#846e15', warn2: '#a34d14', bad: '#cb3a2a', purple: '#a3144d', cyan: '#036a96', gold: '#846e15' },
      font: "'Manrope', -apple-system, sans-serif",
      fine: { '--o-well': '#efeddc', '--o-well0': '#efeddc', '--o-shadow-rangee': '2px 2px 8px -4px rgba(31,31,31,.2)' } },
  },
  /* ── GitHub, refait sur sa source (audit des thèmes du 13/11, F3) : Primer, le système de design de GitHub — ses jetons publiés
   *    (thèmes sombre et clair, rayons, police), relus le 14/11. Loggia avait une palette d'avant et un rayon qui n'existe pas.
   *      • rayon 6 px (`borderRadius-default`), bordure d'un pixel `borderColor-default`, cartes OPAQUES (`matiere`) ;
   *      • l'ombre AU REPOS, deux traits d'un pixel (`shadow-resting-small`) ; l'ombre des couches flottantes ne vient qu'au survol ;
   *      • sombre : page #0d1117, carte #151b23 (`bgColor-muted`), texte #f0f6fc, atténué #9198a1, bordure #3d444d, accent #4493f8 ;
   *      • clair : page et carte BLANCHES, creux #f6f8fa, texte #1f2328, atténué #59636e, bordure #d1d9e0, accent #0969da ;
   *      • vert, ambre, rouge, violet : `fgColor-success / attention / danger / done` ;
   *      • la police de Primer est Mona Sans, puis celle du système. Mona Sans est embarquée (public/fonts, E5) : la pile la
   *        nomme en premier, le système ne répond que si le fichier manque. Son zéro à chasse fixe est barré : le thème
   *        demande ses chiffres à leur largeur naturelle (`chiffres: 'naturels'`). */
  github: {
    dark: { bg: '#0d1117', surface: '#151b23', surfaceElevated: '#151b23', text: '#f0f6fc', muted: '#9198a1',
      border: '#3d444d', traits: ['#3d444d', 'rgba(61,68,77,.7)', 'rgba(61,68,77,.5)'],
      fonds: ['rgba(101,108,118,.2)', 'rgba(101,108,118,.15)', 'rgba(101,108,118,.11)', 'rgba(101,108,118,.08)'],
      barre: '#0d1117', entete: '#0d1117',
      accent: '#4493f8', radius: '6px', borderWidth: '1px', bggrad: '', matiere: 'opaque',
      shadow: '0 1px 1px 0 rgba(1,4,9,.6), 0 1px 3px 0 rgba(1,4,9,.6)',
      etats: { ok: '#3fb950', warn: '#d29922', warn2: '#d29922', bad: '#f85149', purple: '#ab7df8' },
      font: "'Mona Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif", chiffres: 'naturels',
      fine: { '--o-well': '#010409', '--o-well0': '#212830',
        '--o-shadow-hover': '0 6px 12px -3px rgba(1,4,9,.4), 0 6px 18px 0 rgba(1,4,9,.4)', // `shadow-floating-small` sans son anneau d'1 px : le liseré de la carte le fait déjà
        '--o-shadow-rangee': '0 1px 1px 0 rgba(1,4,9,.6), 0 1px 3px 0 rgba(1,4,9,.6)' } },
    light: { bg: '#ffffff', surface: '#ffffff', surfaceElevated: '#ffffff', text: '#1f2328', muted: '#59636e',
      border: '#d1d9e0', traits: ['#d1d9e0', 'rgba(209,217,224,.7)', 'rgba(209,217,224,.5)'],
      fonds: ['rgba(129,139,152,.12)', 'rgba(129,139,152,.09)', 'rgba(129,139,152,.07)', 'rgba(129,139,152,.05)'],
      barre: '#ffffff', entete: '#f6f8fa',
      accent: '#0969da', radius: '6px', borderWidth: '1px', bggrad: '', matiere: 'opaque',
      shadow: '0 1px 1px 0 rgba(31,35,40,.04), 0 1px 2px 0 rgba(31,35,40,.03)',
      etats: { ok: '#1a7f37', warn: '#9a6700', warn2: '#9a6700', bad: '#d1242f', purple: '#8250df' },
      font: "'Mona Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif", chiffres: 'naturels',
      fine: { '--o-well': '#f6f8fa', '--o-well0': '#f6f8fa',
        '--o-shadow-hover': '0 6px 12px -3px rgba(37,41,46,.04), 0 6px 18px 0 rgba(37,41,46,.12)',
        '--o-shadow-rangee': '0 1px 1px 0 rgba(31,35,40,.04), 0 1px 2px 0 rgba(31,35,40,.03)' } },
  },
  /* Tokyo Night (F5) : enkia/tokyo-night-vscode-theme, « Night » et « Light ». Le texte est celui de la zone d'édition
   * (#a9b1d6 — Loggia avait le #c0caf5 d'une autre déclinaison), l'atténué celui de l'interface (#787c99 / #707280) ; la
   * bordure est SOMBRE (#101014), comme dans l'éditeur ; le clair retrouve le bleu de la source (#2959aa), Loggia en
   * avait un autre. La police n'est pas prescrite : Manrope reste. */
  tokyo: {
    dark: { bg: '#16161e', surface: '#1a1b26', surfaceElevated: '#1a1b26', text: '#a9b1d6', muted: '#787c99',
      border: '#101014', fonds: ['rgba(169,177,214,.1)', 'rgba(169,177,214,.075)', 'rgba(169,177,214,.05)', 'rgba(169,177,214,.035)'], barre: '#16161e',
      accent: '#7aa2f7', radius: '6px', borderWidth: '1px', shadow: 'none', bggrad: '', matiere: 'opaque',
      etats: { ok: '#9ece6a', warn: '#e0af68', warn2: '#ff9e64', bad: '#f7768e', purple: '#bb9af7', cyan: '#7dcfff', gold: '#e0af68' },
      font: "'Manrope', -apple-system, sans-serif",
      fine: { '--o-well': '#16161e', '--o-well0': '#202330', '--o-shadow-rangee': 'none' } },
    light: { bg: '#d6d8df', surface: '#e6e7ed', surfaceElevated: '#e6e7ed', text: '#343b59', muted: '#707280',
      border: '#c1c2c7', fonds: ['rgba(52,59,89,.1)', 'rgba(52,59,89,.075)', 'rgba(52,59,89,.05)', 'rgba(52,59,89,.035)'], barre: '#d6d8df',
      accent: '#2959aa', radius: '6px', borderWidth: '1px', shadow: 'none', bggrad: '', matiere: 'opaque',
      etats: { ok: '#33635c', warn: '#8f5e15', warn2: '#965027', bad: '#8c4351', purple: '#7b43ba', cyan: '#006c86', gold: '#8f5e15' },
      font: "'Manrope', -apple-system, sans-serif",
      fine: { '--o-well': '#d6d8df', '--o-well0': '#dadce3', '--o-shadow-rangee': 'none' } },
  },
  /* ── Material Theme, refait sur sa source (audit des thèmes du 13/11, F4) : la palette publiée de Material Theme
   *    (material-theme.com, référence des couleurs — « Oceanic » pour le sombre, « Lighter » pour le clair), relue le 15/11.
   *      • fond de page = « Contrast » (#1e272c / #eeeeee) ; carte = « Background » (#263238 / #fafafa), OPAQUE (`matiere`) ;
   *      • texte = « Foreground » (#b0bec5 / #546e7a) : Loggia écrivait dans le blanc du CODE (#eeffff), pas dans celui de
   *        l'interface ; texte atténué = « Text » (#607d8b / #94a7b0). La garde de contraste les remonte DANS LEUR TEINTE
   *        jusqu'à ses seuils (décision D1a) ;
   *      • bordure = « Border » (#2a373e / #d3e1e8), un pixel ; creux = « Buttons » et « Second Background » ;
   *      • accent = « Accent Color » (#009688 / #00bcd4) — le clair avait un vert d'eau qui n'est pas dans la palette ; ce qui
   *        s'ÉCRIT dans l'accent prend « Links » (#80cbc4 / #39adb5) ;
   *      • vert, jaune, orange, rouge, violet, cyan, bleu : ceux de la palette ;
   *      • la FORME est celle de Material 3 : 12 px, l'ombre d'élévation 1, aucun dégradé. Roboto en tête de la pile de
   *        polices ; elle est embarquée (public/fonts, E5). */
  material: {
    dark: { bg: '#1e272c', surface: '#263238', surfaceElevated: '#263238', text: '#b0bec5', muted: '#607d8b',
      border: '#2a373e', fonds: ['#32424a', '#2e3c43', '#2e3c43', '#2a373e'], barre: '#1e272c',
      accent: '#009688', accentText: '#80cbc4', radius: '12px', borderWidth: '1px', bggrad: '', matiere: 'opaque',
      shadow: '0 1px 2px 0 rgba(0,0,0,.3), 0 1px 3px 1px rgba(0,0,0,.15)',
      etats: { ok: '#c3e88d', warn: '#ffcb6b', warn2: '#f78c6c', bad: '#f07178', purple: '#c792ea', cyan: '#89ddff', gold: '#ffcb6b', cold: '#82aaff' },
      font: "'Roboto',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      fine: { '--o-well': '#2e3c43', '--o-well0': '#32424a', '--o-shadow-rangee': '0 1px 2px 0 rgba(0,0,0,.3)' } },
    light: { bg: '#eeeeee', surface: '#fafafa', surfaceElevated: '#fafafa', text: '#546e7a', muted: '#94a7b0',
      border: '#d3e1e8', fonds: ['#e7e7e8', '#eeeeee', '#f3f4f5', '#f3f4f5'], barre: '#eeeeee',
      accent: '#00bcd4', accentText: '#39adb5', radius: '12px', borderWidth: '1px', bggrad: '', matiere: 'opaque',
      shadow: '0 1px 2px 0 rgba(0,0,0,.3), 0 1px 3px 1px rgba(0,0,0,.15)',
      etats: { ok: '#91b859', warn: '#f6a434', warn2: '#f76d47', bad: '#e53935', purple: '#7c4dff', cyan: '#39adb5', gold: '#f6a434', cold: '#6182b8' },
      font: "'Roboto',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      fine: { '--o-well': '#f3f4f5', '--o-well0': '#ffffff', '--o-shadow-rangee': '0 1px 2px 0 rgba(0,0,0,.2)' } },
  },
  /* Night Owl / Light Owl (F5) : sdras/night-owl-vscode-theme. En sombre TOUT l'éditeur est #011627 — page et carte ont donc
   * la même couleur, et c'est le filet qui dessine la carte (#1d3b53, sa couleur de sélection) ; les creux sont son champ de
   * saisie (#0b253a) et son onglet actif (#0b2942). Le texte atténué est le gris-vert des commentaires (#637777 / #989fb1) :
   * Loggia en avait fait un bleu ; la garde le remonte dans sa teinte (D1a). Le clair prend la couleur d'action de la source
   * (#2aa298). La police n'est pas prescrite : Manrope reste. */
  nightowl: {
    dark: { bg: '#011627', surface: '#011627', surfaceElevated: '#011627', text: '#d6deeb', muted: '#637777',
      border: '#1d3b53', fonds: ['rgba(214,222,235,.1)', 'rgba(214,222,235,.075)', 'rgba(214,222,235,.05)', 'rgba(214,222,235,.035)'], barre: '#011627',
      accent: '#82aaff', radius: '6px', borderWidth: '1px', shadow: 'none', bggrad: '', matiere: 'opaque',
      etats: { ok: '#22da6e', warn: '#ecc48d', warn2: '#f78c6c', bad: '#ef5350', purple: '#c792ea', cyan: '#7fdbca', gold: '#ecc48d' },
      font: "'Manrope', -apple-system, sans-serif",
      fine: { '--o-well': '#0b253a', '--o-well0': '#0b2942', '--o-shadow-rangee': 'none' } },
    light: { bg: '#f0f0f0', surface: '#fbfbfb', surfaceElevated: '#fbfbfb', text: '#403f53', muted: '#989fb1',
      border: '#d9d9d9', fonds: ['rgba(64,63,83,.1)', 'rgba(64,63,83,.075)', 'rgba(64,63,83,.05)', 'rgba(64,63,83,.035)'], barre: '#f0f0f0',
      accent: '#2aa298', radius: '6px', borderWidth: '1px', shadow: 'none', bggrad: '', matiere: 'opaque',
      etats: { ok: '#08916a', warn: '#e0af02', bad: '#de3d3b', purple: '#994cc3', cyan: '#0c969b', gold: '#e0af02', cold: '#4876d6' },
      font: "'Manrope', -apple-system, sans-serif",
      fine: { '--o-well': '#f0f0f0', '--o-well0': '#f6f6f6', '--o-shadow-rangee': 'none' } },
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
      radius: '16px', borderWidth: '1px', shadow: '0 0 0 calc(1px - var(--o-bw, 1px)) rgba(255,255,255,.085)', bggrad: '', font: "'Manrope', -apple-system, sans-serif",
      fine: {
        // carte = dégradé c1 → c2 + filet 1px ; aucune ombre portée au repos —
        // le filet EST l'ombre (un anneau), sinon les cartes se confondaient
        // avec la page, la règle du gabarit leur interdisant une bordure.
        // Depuis le 04/10, toutes les cartes portent le liseré du réglage
        // « Liserés » : l'anneau s'efface quand le trait est là (épaisseur
        // 1px − --o-bw), et revient quand on le coupe — un seul trait, jamais 2 px.
        '--o-shadow-rangee': '0 0 0 calc(1px - var(--o-bw, 1px)) rgba(255,255,255,.085)',
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
      radius: '16px', borderWidth: '1px', shadow: '0 0 0 calc(1px - var(--o-bw, 1px)) rgba(16,24,40,.14)', bggrad: '', font: "'Manrope', -apple-system, sans-serif",
      fine: {
        '--o-shadow-rangee': '0 0 0 calc(1px - var(--o-bw, 1px)) rgba(16,24,40,.14)',
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
  // ── Prisme : verre, halo, tonal (titres en Outfit, texte en Manrope).
  prisme: {
    dark: {
      bg: '#05070d', surface: '#1a2338', surfaceElevated: '#222d46',
      text: '#f5f7fb', muted: '#a3aec3', border: 'rgba(206,222,255,.11)',
      accent: '#94bdff', accentText: '#94bdff',
      radius: '22px', borderWidth: '1px',
      shadow: 'inset 0 1px 0 rgba(255,255,255,.07), 0 1px 2px rgba(0,0,0,.30), 0 12px 28px -12px rgba(0,0,0,.60)',
      bggrad: 'radial-gradient(120% 80% at 50% -12%, #17274a 0%, #0d1730 32%, #080d1a 60%, #05070d 86%)',
      font: "'Manrope', -apple-system, sans-serif", serif: "'Outfit', 'Manrope', -apple-system, sans-serif",
      fine: {
        '--o-bg2': '#080c16', '--o-side1': '#0a0f1c', '--o-side2': '#05070d', '--o-surfA': 'rgba(34,45,70,.62)',
        '--o-surfB': 'rgba(26,35,56,.62)', '--o-header': 'rgba(5,7,13,.72)', '--o-text': '#f5f7fb', '--o-text1': '#d0d7e4',
        '--o-text2': '#a3aec3', '--o-text3': '#9aa5b9', '--o-bd1': 'rgba(206,222,255,.16)',
        '--o-bd2': 'rgba(206,222,255,.11)', '--o-bd3': 'rgba(206,222,255,.075)', '--o-s1': 'rgba(170,196,255,.10)',
        '--o-s2': 'rgba(170,196,255,.07)', '--o-s3': 'rgba(170,196,255,.05)', '--o-s4': 'rgba(170,196,255,.035)',
        '--o-s5': 'rgba(170,196,255,.025)', '--o-sky': 'rgba(61,139,255,.30)', '--o-well0': '#232c3f', '--o-well': '#0c111c',
        '--o-well2': '#05070d', '--o-accent': '#94bdff', '--o-accent-rgb': '148,189,255', '--o-accent-soft': '#94bdff',
        '--o-accent-soft-rgb': '148,189,255', '--o-ok': '#3ddc97', '--o-ok-rgb': '61,220,151', '--o-warn': '#ffd27a',
        '--o-warn-rgb': '255,210,122', '--o-warn2': '#f7a531', '--o-warn2-rgb': '247,165,49', '--o-bad': '#ff837a',
        '--o-bad-rgb': '255,131,122', '--o-cold': '#7bb8ff', '--o-cold-rgb': '123,184,255', '--o-gold': '#ffd678',
        '--o-gold-rgb': '255,214,120', '--o-purple': '#b9a8ff', '--o-purple-rgb': '185,168,255', '--o-cyan': '#5cd0f2',
        '--o-cyan-rgb': '92,208,242',
        // Au survol, la carte monte et son ombre s'accentue — SANS liseré ni lueur bleue (son choix du 16/11 : « C, sans lueur » ; la lueur de 32 px faisait « de trop »).
        '--o-shadow-hover': 'inset 0 1px 0 rgba(255,255,255,.12), 0 18px 40px -14px rgba(0,0,0,.70)',
        '--o-shadow-rangee': 'inset 0 1px 0 rgba(255,255,255,.06), 0 1px 2px rgba(0,0,0,.28), 0 6px 14px -8px rgba(0,0,0,.50)',
      },
    },
    light: {
      bg: '#eef1f6', surface: '#f9fbfe', surfaceElevated: '#ffffff',
      text: '#0e1320', muted: '#4c5568', border: 'rgba(14,22,44,.09)',
      accent: '#0a53c3', accentText: '#0a54c6',
      radius: '22px', borderWidth: '1px',
      shadow: 'inset 0 1px 0 rgba(255,255,255,.80), 0 1px 2px rgba(14,22,44,.06), 0 10px 24px -10px rgba(14,22,44,.14)',
      bggrad: 'radial-gradient(120% 80% at 50% -12%, #ffffff 0%, #f6f8fb 36%, #eef1f6 100%)',
      font: "'Manrope', -apple-system, sans-serif", serif: "'Outfit', 'Manrope', -apple-system, sans-serif",
      fine: {
        '--o-bg2': '#f6f8fb', '--o-side1': '#ffffff', '--o-side2': '#f3f5f9', '--o-surfA': 'rgba(255,255,255,.62)',
        '--o-surfB': 'rgba(249,251,254,.62)', '--o-header': 'rgba(250,252,255,.78)', '--o-text': '#0e1320',
        '--o-text1': '#2a3142', '--o-text2': '#4c5568', '--o-text3': '#5c6577', '--o-bd1': 'rgba(14,22,44,.12)',
        '--o-bd2': 'rgba(14,22,44,.09)', '--o-bd3': 'rgba(14,22,44,.065)', '--o-s1': 'rgba(20,48,110,.06)',
        '--o-s2': 'rgba(20,48,110,.045)', '--o-s3': 'rgba(20,48,110,.035)', '--o-s4': 'rgba(20,48,110,.028)',
        '--o-s5': 'rgba(20,48,110,.022)', '--o-sky': 'rgba(11,92,216,.22)', '--o-well0': '#ebeef3', '--o-well': '#e7eaf0',
        '--o-well2': '#dfe3ea', '--o-accent': '#0a53c3', '--o-accent-rgb': '10,83,195', '--o-accent-soft': '#0a54c6',
        '--o-accent-soft-rgb': '10,84,198', '--o-ok': '#05693d', '--o-ok-rgb': '5,105,61', '--o-warn': '#7d5200',
        '--o-warn-rgb': '125,82,0', '--o-warn2': '#944304', '--o-warn2-rgb': '148,67,4', '--o-bad': '#b3191f',
        '--o-bad-rgb': '179,25,31', '--o-cold': '#0f57b5', '--o-cold-rgb': '15,87,181', '--o-gold': '#825000',
        '--o-gold-rgb': '130,80,0', '--o-purple': '#6a3fc0', '--o-purple-rgb': '106,63,192', '--o-cyan': '#00637d',
        '--o-cyan-rgb': '0,99,125',
        '--o-shadow-hover': 'inset 0 1px 0 rgba(255,255,255,.90), 0 16px 34px -14px rgba(14,22,44,.22)', // sans lueur, comme en sombre (16/11)
        '--o-shadow-rangee': 'inset 0 1px 0 rgba(255,255,255,.80), 0 1px 2px rgba(14,22,44,.05), 0 5px 12px -7px rgba(14,22,44,.12)',
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
/* Les couleurs d'état qu'un thème peut déclarer (audit des thèmes du 13/11, M3) : `etats: { ok: '#50fa7b', bad: … }`. Chacune
 * pose son jeton ET son compagnon « r,g,b », calculé : écrit à la main, il se trompait (une référence à lui-même, un vert d'un
 * autre thème). Les teintes des PIÈCES n'en sont pas : elles identifient, elles n'habillent pas. `lampe` (F7) est la couleur
 * d'une lumière allumée : l'ambre de Loggia, que Google remplace par son accent. */
const ETATS = ['ok', 'warn', 'warn2', 'bad', 'purple', 'cyan', 'gold', 'cold', 'lampe'];
function applyVars(root, v) {
  const set = (k, val) => { if (val) root.style.setProperty(k, val); };
  /* Ce qu'un thème PEUT dire en plus (M1) — sans quoi tout s'aplatit : une seule bordure servait aux trois traits ET aux cinq
   * remplissages, le texte principal à ses deux premiers niveaux, l'atténué aux deux derniers. Toutes facultatives ; un thème qui
   * ne les donne pas se pose exactement comme avant.
   *   text1, text3      les niveaux de texte intermédiaires ;
   *   traits            [bd1, bd2, bd3], du plus marqué au plus léger ;
   *   fonds             [s1 … s5], les remplissages neutres — le dernier donné sert aux suivants ;
   *   barre, entete     la barre latérale et l'en-tête ;
   *   etats             ses couleurs d'état (voir `ETATS`) ;
   *   flou              le flou de son verre (`blur(8px) saturate(1.25)`) — sans lui, celui de Loggia (index.css) ;
   *   fenetre, flouFenetre   le fond et le flou de ce qui FLOTTE (une fiche, un menu de l'en-tête) quand la carte du thème est
   *                     trop transparente pour porter une fenêtre : sans eux, la surface des cartes, comme avant ;
   *   relief            `true` quand la carte a la couleur du fond PAR PRINCIPE et que ses ombres la portent (Neumorphix) :
   *                     la garde de contraste ne l'écarte alors pas du fond (`--o-relief`, contraste.js). */
  const traits = Array.isArray(v.traits) ? v.traits : [], rempl = Array.isArray(v.fonds) ? v.fonds : [];
  const fondN = (i) => rempl[i] || rempl[rempl.length - 1] || v.border;
  set('--o-bg', v.bg); set('--o-bg2', v.bg); set('--o-side2', v.bg); set('--o-well2', v.bg);
  set('--o-surfA', v.surfaceElevated || v.surface); set('--o-surfB', v.surface); set('--o-header', v.entete || v.surface); set('--o-side1', v.barre || v.surfaceElevated || v.surface); set('--o-well', v.surface); set('--o-well0', v.surfaceElevated || v.surface);
  set('--o-text', v.text); set('--o-text1', v.text1 || v.text); set('--o-text2', v.muted); set('--o-text3', v.text3 || v.muted);
  set('--o-bd1', traits[0] || v.border); set('--o-bd2', traits[1] || traits[0] || v.border); set('--o-bd3', traits[2] || traits[1] || traits[0] || v.border);
  set('--o-s1', fondN(0)); set('--o-s2', fondN(1)); set('--o-s3', fondN(2)); set('--o-s4', fondN(3)); set('--o-s5', fondN(4));
  if (v.etats) ETATS.forEach((nom) => { const c = v.etats[nom]; if (!c) return; set('--o-' + nom, c); const rgb = cssToRgb(c); if (rgb) set('--o-' + nom + '-rgb', rgb); });
  if (v.accent) { set('--o-accent', v.accent); const rgb = cssToRgb(v.accent); if (rgb) set('--o-accent-rgb', rgb); const at = v.accentText || v.accent; set('--o-accent-soft', at); const rgbS = cssToRgb(at); if (rgbS) set('--o-accent-soft-rgb', rgbS); }
  set('--o-radius', v.radius); set('--o-shadow', v.shadow); set('--o-bw', v.borderWidth); set('--o-font', v.font); set('--o-flou', v.flou); set('--o-fenetre', v.fenetre); set('--o-flou-fenetre', v.flouFenetre); set('--o-relief', v.relief ? '1' : '');
  /* Les titres suivent le theme : un preset qui ne declare pas de serif a
   * lui prend SA police courante, sinon ses titres resteraient en
   * Newsreader pendant que tout le reste change. */
  set('--o-serif', v.serif || v.font); set('--o-bggrad', v.bggrad);
  /* Mais un thème SANS police de titre ne les penche plus (audit des thèmes du
   * 13/11, E1) : Manrope n'a pas d'italique embarqué, le navigateur en
   * fabriquait un faux dans quatorze thèmes. Ses titres se dessinent droits et
   * gras (index.css, `html.loggia-titres-droits`). */
  root.classList.toggle('loggia-titres-droits', !v.serif);
  /* Chiffres à leur largeur naturelle (E5) : pour un thème dont la police barre le zéro de ses chiffres à chasse fixe
   * (Mona Sans, GitHub). La règle est dans index.css, sous « Chiffres a chasse fixe ». */
  root.classList.toggle('loggia-chiffres-naturels', v.chiffres === 'naturels');
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
    // L'apparence du profil ou de l'écran d'abord (ADR 0223), la maison ensuite.
    const ap = apparence().look;
    const L = { ...LOOK_DEF, ...((ap && typeof ap === 'object') ? ap : (cfgVal('loggia_look', null) || {})) };
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
function applyLook(root, L, variante, light) {
  // Intensité du lavis de teinte, lue par les cartes au rendu (voir TEINTES).
  LAVIS = TEINTES[L.tint] != null ? TEINTES[L.tint] : 1;
  /* Un seul matériau depuis le 29/08 (décision user) : le translucide de
   * l'accueil, partout. Le réglage Opaque/Verre a disparu de l'Apparence ;
   * `L.glass` reste dans les configs enregistrées mais n'est plus lu.
   *
   * Sauf pour un thème repris d'ailleurs qui se dit OPAQUE (audit des thèmes du 13/11, D4a : la matière suit le thème) :
   * Dracula n'a ni verre ni flou. Ses cartes gardent leur couleur pleine et la classe du verre ne se pose pas — les thèmes
   * de Loggia, et tout thème qui ne dit rien, restent en verre. */
  const verre = !(variante && variante.matiere === 'opaque');
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
  /* `--o-shadow-rangee` aussi (04/10) : la colonne du rail de l'Accueil
   * redéfinit `--o-shadow` par elle, et la rangée des scénarios la lit en
   * `!important` — « Ombres portées » coupé y laissait une ombre. Purgée avec
   * les jetons du thème (THEME_KEYS) : rallumer les ombres la rend. */
  if (!L.shadow) { root.style.setProperty('--o-shadow', 'none'); root.style.setProperty('--o-shadow-hover', 'none'); root.style.setProperty('--o-shadow-rangee', 'none'); }
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

/* Saphir et Acier vivent dans `themes-bleus.js`, chargé à la demande :
 * le boot n'avait plus la place (25/10). Le premier `applyTheme` qui en
 * réclame un pose le défaut, lance le chargement, et se rejoue à l'arrivée —
 * avec les DERNIERS réglages demandés, pas ceux du départ : on a pu changer de
 * thème ou de mode entre-temps. */
const BLEUS = ['saphir', 'acier'];

/* Les thèmes retirés le 19/11 (sa demande : « supprime les thèmes givre, plume wine, lavande et the Projekt »). Un écran
 * qui en gardait un retombe sur le thème par défaut, et Paramètres le montre coché. */
export const THEMES_RETIRES = ['givre', 'plum', 'lavande', 'projekt'];
export const themeConnu = (t) => (typeof t === 'string' && THEMES_RETIRES.indexOf(t) < 0 ? t : '');
let bleus = null, enRoute = null, dernierTheme = null;
function chargerBleus() {
  if (enRoute) return;
  enRoute = import('./themes-bleus.js').then(m => {
    // Un import retenu par `vite:preloadError` rend `undefined` (recharge.js) :
    // la page va repartir, on ne rejoue rien.
    if (!m) return;
    bleus = m.THEMES_BLEUS;
    if (dernierTheme && BLEUS.includes(dernierTheme[0].loggiaTheme)) applyTheme(...dernierTheme);
  }).catch(() => { enRoute = null; });
}

export function applyTheme(opts, hass) {
  dernierTheme = [opts, hass];
  const root = document.documentElement;
  THEME_KEYS.forEach(k => root.style.removeProperty(k)); root.style.removeProperty('--o-radius'); root.style.removeProperty('--o-bggrad'); root.style.removeProperty('--o-shadow-hover');
  // Ce que la garde de contraste a posé la fois d'avant : sinon la correction
  // d'un thème suivrait au suivant.
  JETONS_GARDE.forEach(k => root.style.removeProperty(k));
  root.classList.remove('loggia-frosted'); root.classList.remove('loggia-titres-droits'); root.classList.remove('loggia-prisme'); root.classList.remove('loggia-chiffres-naturels');
  const L = opts.look || readLook();
  // Suivre HA : miroir du thème actif de HA (valeurs résolues sur le parent).
  if (opts.haTheme === 'FOLLOW') {
    const v = readComputedHaTheme(hass);
    if (v) { applyVars(root, v); root.classList.toggle('loggia-light', !v.dark); applyLook(root, L, null, !v.dark); return !!v.dark; }
    // computed pas prêt → base en attendant (l'effet poll réessaie)
  }
  const light = opts.mode === 'light';
  root.classList.toggle('loggia-light', light);
  // Preset Loggia ('' = défaut → tokens CSS de base, aucune surcharge). Sinon applique la variante claire/sombre.
  const preset = LOGGIA_PRESETS[opts.loggiaTheme] || (bleus && bleus[opts.loggiaTheme]);
  if (!preset && !bleus && BLEUS.includes(opts.loggiaTheme)) chargerBleus();
  const variante = preset ? preset[light ? 'light' : 'dark'] : null;
  if (variante) applyVars(root, variante);
  // Prisme a une mise en page à lui (src/prisme.css) : la classe la borne à ce thème.
  root.classList.toggle('loggia-prisme', opts.loggiaTheme === 'prisme');
  applyLook(root, L, variante, light); // la variante dit sa matière : verre (par défaut) ou opaque
  return !light;
}
