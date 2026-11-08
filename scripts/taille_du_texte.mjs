/* La taille du texte (07/11, étape 10 du rapport sur l'usage) : le TEXTE grandit, la disposition ne bouge pas.
 *
 * Les styles de Loggia écrivent leurs tailles de police en pixels — près de 1 600 `fontSize: 13` dans 116 fichiers, plus
 * index.css —, qu'aucune taille posée à la racine n'atteint. Plutôt que de réécrire chaque ligne, la construction les fait
 * passer par un multiplicateur : `fontSize: 13` devient `'calc(13px * var(--o-texte, 1))'`, et `src/tailletexte.js` pose
 * `--o-texte` sur la page. Sans réglage, la variable manque et chaque taille reste exacte au pixel près.
 *
 * Ce qui grandit : une taille écrite en nombre (`fontSize: 13`, ou les deux branches de `tel ? 12 : 13`), une interligne en
 * pixels (`lineHeight: '14px'`), dans les feuilles de style `font-size` et `line-height` en px — et, depuis le 07/11 (« il ne
 * s'applique pas partout »), toute taille écrite en toutes lettres : une variable (`var(--o-chiffre-taille, 25px)`, les
 * chiffres des cartes), une part de la boîte (`clamp(30px, 15.5cqw, 54px)`, les tuiles de l'Accueil). Une taille AJUSTÉE à
 * sa colonne (`clamp(10.5px, calc(100cqi / …), 12px)` : le mot remplit sa place, pas plus) grandit jusqu'à sa borne haute
 * agrandie et rétrécit comme avant quand la place manque — le nom d'une carte ne sort pas de sa carte.
 * Ce qui ne bouge pas : les icônes (`<i className="fi …">`, `.fi` en CSS) — leur police dessine, elle n'écrit pas —, les
 * tailles relatives (`em`, `%` : elles suivent leur parent, qui grandit), et celles passées par une variable JS
 * (`fontSize: taille`) : la source les convertit elle-même. tests/taille_texte.test.mjs recense ce qui reste sur les vraies
 * sources ; une taille nouvelle écrite autrement s'y signale. */

const NOMBRE = String.raw`\d+(?:\.\d+)?|\.\d+`;
const multiplie = (n) => `calc(${n}px * var(--o-texte, 1))`;

// Une balise `<i …>` jusqu'à sa fin ; la flèche `=>` d'un gestionnaire ne la ferme pas.
const BALISE_I = /<i\b(?:[^>]|=>)*?(?:\/>|(?<!=)>)/gs;
const TAILLE = new RegExp(String.raw`(\bfontSize:\s*)(${NOMBRE})(?=\s*[,}\n])`, 'g');
const BRANCHE = String.raw`'[^'\n]*'|${NOMBRE}`;
const ALTERNATIVE = new RegExp(String.raw`(\bfontSize:\s*[^,{}?:'"\x60\n]+?\?\s*)(${BRANCHE})(\s*:\s*)(${BRANCHE})(?=\s*[,}\n])`, 'g');
const INTERLIGNE = new RegExp(String.raw`(\blineHeight:\s*)'(${NOMBRE})px'`, 'g');
// Une taille entre apostrophes, seule (une chaîne coupée par un `+`, la source la convertit elle-même).
const CHAINE = /(\bfontSize:\s*)'([^'\n]*)'(?=\s*[,}\n])/g;
// Une longueur que rien ne ferait grandir : des pixels, une part de la boîte ou de l'écran, une variable.
const LONGUEUR = /\d(?:px|rem|cq[iwhb]|v[wh]|vmin|vmax)\b|var\(/;
const PIXELS = new RegExp(String.raw`^(${NOMBRE})px$`);

/* Les arguments d'une fonction CSS, coupés aux seules virgules de premier niveau. */
function argumentsDe(s) {
  const args = [];
  let prof = 0, debut = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') prof++;
    else if (s[i] === ')') prof--;
    else if (s[i] === ',' && !prof) { args.push(s.slice(debut, i).trim()); debut = i + 1; }
  }
  return [...args, s.slice(debut).trim()];
}

/** Une taille de police écrite en toutes lettres, passée par la variable : des pixels se multiplient ; une taille ajustée à
 * sa colonne (`clamp(min, … 100cqi …, max)`) n'agrandit que sa borne haute ; le reste se multiplie en entier. Une taille
 * relative (`em`, `%`) ou qui passe déjà par la variable ne bouge pas. */
export function agrandirTaille(valeur) {
  const v = valeur.trim();
  if (v.includes('--o-texte') || !LONGUEUR.test(v)) return valeur;
  const px = PIXELS.exec(v);
  if (px) return multiplie(px[1]);
  const c = /^clamp\((.*)\)$/s.exec(v);
  if (c) {
    const args = argumentsDe(c[1]);
    if (args.length === 3 && args[1].includes('cqi')) return `clamp(${args[0]}, ${args[1]}, ${agrandirTaille(args[2])})`;
  }
  return `calc(${v} * var(--o-texte, 1))`;
}

/** Un module de `src/` : ses tailles de texte en nombres passent par la variable, ses icônes non. */
export function agrandirJs(code) {
  const icones = [];
  let s = code.replace(BALISE_I, (t) => (/\bfi\b/.test(t) ? `\u0000${icones.push(t) - 1}\u0000` : t));
  s = s.replace(TAILLE, (_, avant, n) => `${avant}'${multiplie(n)}'`);
  s = s.replace(CHAINE, (_, avant, v) => `${avant}'${agrandirTaille(v)}'`);
  const branche = (b) => (b.startsWith("'") ? `'${agrandirTaille(b.slice(1, -1))}'` : `'${multiplie(b)}'`);
  s = s.replace(ALTERNATIVE, (_, avant, oui, entre, non) => avant + branche(oui) + entre + branche(non));
  s = s.replace(INTERLIGNE, (_, avant, n) => `${avant}'${multiplie(n)}'`);
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => icones[Number(i)]);
}

/** Une feuille de style de `src/` : chaque `font-size`, et `line-height` en px, règle par règle, hors des icônes `.fi`. Une
 * propriété à soi (`--o-font-size`) ne compte pas : celle qui la lit grandit. */
export function agrandirCss(css) {
  return css.replace(/([^{}]*)\{([^{}]*)\}/g, (regle, selecteur, decl) => (/\.fi\b/.test(selecteur) ? regle
    : `${selecteur}{${decl
      .replace(/(?<![\w-])(font-size\s*:\s*)([^;!]+?)(?=\s*(?:!important)?\s*(?:;|$))/g, (_, avant, v) => avant + agrandirTaille(v))
      .replace(new RegExp(String.raw`(?<![\w-])(line-height\s*:\s*)(${NOMBRE})px\b`, 'g'), (_, avant, n) => avant + multiplie(n))}}`));
}

/** Le greffon Vite : avant React, sur les seules sources de Loggia — jamais node_modules. */
export const greffonTailleDuTexte = {
  name: 'loggia-taille-du-texte',
  enforce: 'pre',
  transform(code, id) {
    const f = id.split('?')[0].replace(/\\/g, '/');
    if (!f.includes('/src/') || f.includes('/node_modules/')) return null;
    const apres = /\.(jsx?|mjs)$/.test(f) ? agrandirJs(code) : f.endsWith('.css') ? agrandirCss(code) : code;
    // Les remplacements restent sur leur ligne : la carte des sources ne bouge pas.
    return apres === code ? null : { code: apres, map: null };
  },
};
