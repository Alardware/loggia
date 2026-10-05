/* Lot 13 de l'audit du 03/10 — les deux modales faites main des Paramètres.
 *
 * L'éditeur d'un profil (« Ajouter un profil », « Modifier ce profil ») et
 * celui d'une vue personnalisée (« Créer une vue », le crayon d'une vue)
 * posaient leur propre voile : `position: fixed`, fermé à la souris. Ni
 * dialogue, ni nom, ni Échap, ni fond inerte — Tab filait derrière le voile
 * vers la page restée vivante —, et un « Annuler » qui ne faisait que fermer.
 * Les huit pastilles de couleur d'un profil s'annonçaient toutes « Couleur du
 * profil », sans dire laquelle était prise ; l'icône choisie d'une vue était la
 * seule puce choisie de Loggia à ne pas passer en bleu plein.
 *
 * Les deux composants ne sont pas exportés : ils se lisent comme du texte. Le
 * filet commun — aucune modale faite main, nulle part — vit dans
 * `feuilles.test.mjs`. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const PAR = lire('src', 'views', 'parametres.jsx');
const UI = lire('src', 'ui.jsx');
const corps = (nom) => {
  const i = PAR.indexOf('function ' + nom + '(');
  assert.ok(i >= 0, nom + ' introuvable dans parametres.jsx');
  return PAR.slice(i, PAR.indexOf('\n}\n', i) + 2);
};
const PROFIL = corps('UserEditor');
const VUE = corps('CvEditor');
const EDITEURS = [['l’éditeur de profil', PROFIL], ['l’éditeur de vue', VUE]];
const EN = (await import(pathToFileURL(join(RACINE, 'src', 'langues', 'en.js')).href)).default;

test('les deux éditeurs sont des feuilles, nommées par leur ligne de titre', () => {
  for (const [nom, src] of EDITEURS) {
    assert.ok(src.includes('<BottomSheet onClose={onClose} title={') && src.includes('</BottomSheet>'),
      nom + ' : pas de feuille, ou une feuille sans ligne de titre — elle s’annoncerait « dialogue », sans nom');
    assert.ok(!src.includes("position: 'fixed'") && !src.includes('role="presentation"') && !src.includes('onMouseDown={onClose}'),
      nom + ' : le voile fait main est revenu — ni Échap, ni fond inerte, et Tab sort derrière lui');
  }
  assert.ok(VUE.includes("title={cv ? tr('Modifier la vue') : tr('Nouvelle vue')}"), 'la feuille d’une vue a perdu son nom');
  // L'initiale du profil reste sur la ligne de titre, tue : elle n'entre pas dans le nom de la feuille.
  const debut = PROFIL.indexOf('title={(');
  assert.ok(debut >= 0, 'la ligne de titre du profil a changé de forme');
  const titre = PROFIL.slice(debut, PROFIL.indexOf(')}>', debut));
  assert.ok(titre.includes('<span aria-hidden="true"') && titre.includes("(name.trim()[0] || '?').toUpperCase()"),
    'l’initiale a quitté la ligne de titre, ou elle se lit dans le nom de la feuille');
  assert.ok(titre.includes("{user ? tr(\"Modifier l'utilisateur\") : tr('Nouvel utilisateur')}"), 'la feuille d’un profil a perdu son nom');
});

test('plus d’« Annuler » qui ne fait que fermer : la croix de la feuille suffit', () => {
  for (const [nom, src] of EDITEURS) {
    assert.ok(!src.includes("tr('Annuler')") && !src.includes('<button onClick={onClose}'),
      nom + ' : un bouton ne fait que fermer, à côté de la croix');
    assert.ok(src.includes("{tr('Enregistrer')}</button>"), nom + ' : « Enregistrer » est parti avec « Annuler »');
  }
  assert.ok(PROFIL.includes('{onDelete && <button onClick={onDelete}'), 'la suppression d’un profil a disparu');
});

test('le focus revient au bouton qui a ouvert la feuille', () => {
  /* Un `autoFocus` prend le focus AVANT l'effet de la feuille : elle retenait
   * ce champ comme l'élément à qui le rendre — démonté à la fermeture. Sans
   * lui, la feuille pose elle-même le focus sur son premier champ. */
  assert.ok(PROFIL.includes("<input aria-label={tr('Nom')} value={name} onChange={e => setName(e.target.value)}"), 'le champ du nom a changé');
  // L'ATTRIBUT, où qu'il soit — pas le mot, que le commentaire du champ cite entre accents graves.
  for (const [nom, src] of EDITEURS) assert.ok(!/\sautoFocus[\s=/>]/.test(src), nom + ' : un autoFocus est revenu — le focus ne revient plus au bouton qui a ouvert la feuille');
  assert.ok(UI.includes("!n.hasAttribute('data-croix')"), 'la feuille ne pose plus le focus sur son premier champ');
});

test('chaque pastille de couleur dit sa couleur, et si elle est prise', () => {
  const liste = UI.match(/export const USER_COLORS = \[([^\]]*)\]/);
  assert.ok(liste, 'USER_COLORS introuvable dans ui.jsx');
  const n = (liste[1].match(/'[^']*'/g) || []).length;
  assert.ok(n >= 8, 'la lecture de USER_COLORS a échoué');
  const table = PROFIL.match(/const nomsCouleurs = \[([^\]]*)\];/);
  assert.ok(table, 'les pastilles n’ont plus de noms');
  const noms = [...table[1].matchAll(/tr\('([^']*)'\)/g)].map(m => m[1]);
  assert.equal(noms.length, n, 'une pastille sans nom, ou un nom sans pastille : la table suit USER_COLORS, dans son ordre');
  assert.equal(new Set(noms).size, n, 'deux pastilles s’annoncent pareil');
  for (const nom of noms) assert.ok(nom in EN, '« ' + nom + ' » n’est pas au catalogue : il se dirait en français dans les six autres langues');
  assert.ok(PROFIL.includes('USER_COLORS.map((col, k) => <button key={col} aria-label={nomsCouleurs[k]} title={nomsCouleurs[k]} aria-pressed={col === c}'),
    'une pastille ne dit plus sa couleur, ou plus si elle est prise');
  assert.ok(!PROFIL.includes("aria-label={tr('Couleur du profil')} onClick"), 'les huit pastilles s’annoncent de nouveau toutes pareilles');
  assert.ok(PROFIL.includes("<div role=\"group\" aria-label={tr('Couleur du profil')}"), 'le groupe des pastilles a perdu son nom');
  // Le rôle aussi : « Admin » et « Famille » ne se disaient choisis qu'en couleur.
  assert.ok(PROFIL.includes("aria-pressed={role === 'Admin'}") && PROFIL.includes("aria-pressed={role === 'Famille'}"), 'le rôle choisi ne se dit plus');
});

test('l’icône choisie d’une vue passe en bleu plein, comme toute puce choisie', () => {
  assert.ok(VUE.includes('CV_ICONS.map(ic => { const on = icon === ic; return <button key={ic} aria-label={ic} aria-pressed={on}'),
    'une icône ne dit plus si elle est prise');
  assert.ok(VUE.includes("border: 'var(--o-bw,1px) solid ' + (on ? 'transparent' : 'var(--o-bd2)'), background: on ? 'var(--o-accent-fond)' : 'var(--o-s2)', color: on ? '#fff' : 'var(--o-text1)'"),
    'l’icône choisie n’est plus en bleu plein');
  assert.ok(!VUE.includes("background: icon === ic ? 'rgba(var(--o-accent-rgb),.14)'"), 'le fond lavé de l’icône choisie est revenu');
});
