/* Le fond VRAI d'une carte de lumière, sombre et clair (chantier Lumières, passe 9 bis A, point 1).
 *
 * Les jetons de Loggia sont lus tels qu'index.css les écrit — la page, les deux
 * surfaces des cartes, la piste des barres —, pas recopiés : un jeton qui change
 * change aussi le fond contre lequel les tests mesurent l'encre d'une ampoule.
 *
 *  - sous la GLYPHE : le haut de la carte, le lavis de la teinte vraie (au plus
 *    0,22 en haut, à 100 % de luminosité), puis la plaque (0,22) par-dessus ;
 *  - sous le REPÈRE de la barre : le pied de la carte (le lavis y tombe à 0,03),
 *    puis la piste (`--o-s1`).
 * Un module d'aide, pas un test : `node --test` ne le lance pas. */
import { readFileSync } from 'node:fs';
import { lireCouleur, composer } from '../src/contraste.js';

const CSS = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function bloc(debut) {
  const i = CSS.indexOf(debut);
  if (i < 0) throw new Error('index.css : ' + debut.trim() + ' introuvable');
  return CSS.slice(i, CSS.indexOf('\n}', i));
}
function jeton(texte, nom) {
  const m = texte.match(new RegExp('(?:^|[\\s;{])' + nom + ':\\s*([^;]+);'));
  const c = m ? lireCouleur(m[1].trim()) : null;
  if (!c) throw new Error('index.css : le jeton ' + nom + ' ne se lit pas');
  return c;
}
function theme(texte, clair) {
  const page = jeton(texte, '--o-bg').slice(0, 3);
  return { clair, page, haut: composer(page, jeton(texte, '--o-surfA')), bas: composer(page, jeton(texte, '--o-surfB')), piste: jeton(texte, '--o-s1') };
}

/** `sombre` (`:root`) et `clair` (`html.loggia-light`) : `{ clair, page, haut, bas, piste }`. */
export const THEMES = {
  sombre: theme(bloc('\n:root {\n'), false),
  clair: theme(bloc('\nhtml.loggia-light {\n'), true),
};

/** Le fond sous la glyphe d'une carte allumée de teinte `teinte` : le lavis du haut (`lavis`, 0,22 à 100 %), puis la plaque (0,22). */
export const fondGlyphe = (T, teinte, lavis = 0.22) => composer(composer(T.haut, [...teinte, lavis]), [...teinte, 0.22]);

/** Le fond sous le repère de la barre : le pied de la carte (lavis 0,03), puis la piste. */
export const fondRepere = (T, teinte) => composer(composer(T.bas, [...teinte, 0.03]), T.piste);

/** Le fond sous la PHRASE d'une carte étroite (passe téléphone, T8) : le lavis de la carte, sans plaque — pris à son plus dense, en haut
 *  (`lavis`, 0,22 à 100 % de luminosité), quand la phrase est au milieu de la carte, où il est plus léger : la mesure est un majorant. */
export const fondPhrase = (T, teinte, lavis = 0.22) => composer(T.haut, [...teinte, lavis]);

/** La teinte (0 à 360°) d'une couleur `[r, v, b]`. */
export function teinteDe([r, v, b]) {
  const m = Math.max(r, v, b), n = Math.min(r, v, b), d = m - n;
  if (!d) return 0;
  const h = m === r ? ((v - b) / d) % 6 : m === v ? (b - r) / d + 2 : (r - v) / d + 4;
  return Math.round(((h * 60) + 360) % 360);
}
