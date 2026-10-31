/* Pas de couleur en dur dans un composant (28/10, ADR 0281).
 *
 * La règle de la maison : une couleur passe par les variables du thème
 * (`--o-*`), que la garde de contraste ajuste (src/contraste.js) et que chaque
 * thème redéfinit. Une couleur écrite en dur ne suit ni le mode clair, ni les
 * thèmes, ni la garde. La règle était dite, pas gardée : l'audit du 28/10 a
 * compté 130 couleurs en dur dans 12 composants.
 *
 * Ce test est un CLIQUET, comme celui des avertissements d'eslint :
 *  - un fichier qui n'est pas dans la liste n'a droit à AUCUNE couleur ;
 *  - un fichier de la liste ne peut pas en ajouter ;
 *  - quand on en retire, le plafond doit descendre avec (lot 6 de l'audit) :
 *    la liste dit toujours la vérité, et elle ne fait que rétrécir.
 *
 * Tolérés partout : le blanc et le noir (`#fff`, `#000`, et leurs formes
 * longues) — le blanc sur `--o-accent-fond` est la règle des puces choisies,
 * le noir celle des ombres. Et deux fichiers dont c'est le métier : les
 * palettes des thèmes. Les commentaires et les catalogues de langues ne
 * comptent pas.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(RACINE, 'src');

/* Les palettes : c'est ICI que les couleurs ont le droit de vivre. */
const PALETTES = new Set(['theme.js', 'themes-bleus.js']);

/* Les plafonds du 28/10 : ce qui reste à résorber (lot 6). Ne monte jamais. */
const PLAFONDS = {
  // Les pastilles des thèmes (un aperçu de CHAQUE thème, pas du thème actif)
  // et la pastille Ko-fi, qui garde son dessin (sa règle).
  'views/parametres.jsx': 61,
  // Les dégradés de décor de l'Accueil et les teintes de la galerie, sortis d'App.jsx avec eux (ADR 0283).
  'accueil/briques.jsx': 10,
  'cartescustom/galerie.jsx': 2,
  // Les icônes des conseils du dehors, sorties d'App.jsx avec la vue d'une pièce (ADR 0283).
  'vues/piece.jsx': 4,
  // La bibliothèque (ses aperçus) et la coche du composeur, sorties d'App.jsx avec l'édition (ADR 0283).
  'edition/biblio.jsx': 3,
  // Les teintes des cartes des vues personnalisées, sorties d'App.jsx avec elles (ADR 0283).
  'cartescustom/cartes.jsx': 8,
  // L'écran d'erreur du démarrage : il s'affiche quand le thème n'a pas pu se poser.
  'boot.jsx': 8,
  // Le ciel animé : des couleurs de ciel, pas d'interface.
  'ciel.js': 6,
  'ecranveille.jsx': 5,
  // `USER_COLORS` : la couleur de chaque profil.
  'ui.jsx': 6,
  // Le badge « Démonstration », posé hors de React, avant le thème.
  'demo.js': 5,
  'scenes.jsx': 3,
  'Onboarding.jsx': 1,
  'plan3d.jsx': 1,
  'wxutil.jsx': 1,
};

const TOLERES = new Set(['#fff', '#ffffff', '#000', '#000000']);
const HEXA = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;

/** Le texte sans ses commentaires, les lignes gardées à leur place. */
const sansCommentaires = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

function compter() {
  const out = {};
  const marcher = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) { if (f !== 'langues') marcher(p); continue; }
      if (!/\.(js|jsx)$/.test(f)) continue;
      const rel = relative(SRC, p).split('\\').join('/');
      if (PALETTES.has(rel)) continue;
      const trouves = (sansCommentaires(readFileSync(p, 'utf8')).match(HEXA) || []).filter(h => !TOLERES.has(h.toLowerCase()));
      if (trouves.length) out[rel] = trouves;
    }
  };
  marcher(SRC);
  return out;
}

const TROUVES = compter();

test('le balayage voit bien les couleurs', () => {
  assert.ok(Object.keys(TROUVES).length >= 5, 'le balayage ne trouve presque rien : il est cassé');
  assert.ok((sansCommentaires("a /* #123456 */ b // #abcdef\nc '#a1b2c3'").match(HEXA) || []).length === 1,
    'les commentaires comptent, ou une chaîne ne compte plus');
});

test('aucun composant n’ajoute de couleur en dur', () => {
  const trop = Object.entries(TROUVES)
    .filter(([f, l]) => l.length > (PLAFONDS[f] || 0))
    .map(([f, l]) => `${f} : ${l.length} pour ${PLAFONDS[f] || 0} permises (${[...new Set(l)].slice(0, 6).join(', ')})`);
  assert.deepEqual(trop, [], 'une couleur en dur : passe par une variable du thème (--o-*), la garde de contraste ne la voit pas');
});

test('les plafonds descendent avec ce qui est résorbé', () => {
  const hauts = Object.entries(PLAFONDS)
    .filter(([f, n]) => (TROUVES[f] || []).length < n)
    .map(([f, n]) => `${f} : plafond ${n}, il en reste ${(TROUVES[f] || []).length}`);
  assert.deepEqual(hauts, [], 'des couleurs ont été retirées : descends le plafond, il ne doit laisser aucune place libre');
});
