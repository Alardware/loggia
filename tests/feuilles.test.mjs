// ─────────────────────────────────────────────────────────────────────────────
// Une seule croix, la même partout, en dernier sur la ligne d'en-tête.
//
// Retours du 19/09 : « toutes les popups n'ont pas le même bouton pour fermer
// ni au même endroit, ça va pas » — il y en avait cinq sortes, et des
// « Annuler » en bas qui ne faisaient que fermer. Puis, quand la croix est
// montée à côté de la poignée : « pourquoi ils ne sont pas alignés ? et
// horizontalement » — l'épingle et la roue restaient sur la ligne du titre.
// La croix est donc UN composant, `CroixFeuille` (ui.jsx) : 34 px, rayon 10,
// le fond de l'épingle, posé en dernier sur la ligne d'en-tête de chaque
// feuille ; il ferme la feuille qui le contient.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const UI = lire('src', 'ui.jsx');
const APP = lire('src', 'App.jsx');
const sources = () => {
  const fichiers = [];
  const parcourir = (d) => readdirSync(join(RACINE, d), { withFileTypes: true }).forEach(e => {
    if (e.isDirectory()) parcourir(join(d, e.name));
    else if (/\.jsx?$/.test(e.name)) fichiers.push(join(d, e.name));
  });
  parcourir('src');
  return fichiers.map(f => [f.replace(/\\/g, '/'), readFileSync(join(RACINE, f), 'utf8')]);
};
const fonction = (src, nom) => {
  const i = src.indexOf('function ' + nom + '(');
  const j = src.indexOf('\nfunction ', i + 1);
  return src.slice(i, j < 0 ? undefined : j);
};

test('la croix commune : la taille et le fond de l’épingle ; elle ferme sa feuille', () => {
  const c = fonction(UI, 'CroixFeuille');
  assert.ok(c.includes('width: 34, height: 34, borderRadius: 10') && c.includes("background: 'var(--o-s1)'"), 'la croix n’a plus la taille de ses voisins');
  assert.ok(c.includes('const fermer = useContext(FermerCtx);') && c.includes('data-croix=""'));
  assert.ok(fonction(APP, 'BoutonEpingle').includes('width: 34, height: 34, borderRadius: 10'), 'l’épingle a changé de taille : la croix ne s’aligne plus sur elle');
  const b = fonction(UI, 'BottomSheet');
  assert.ok(b.includes('<FermerCtx.Provider value={close}>'), 'la croix ne sait plus quelle feuille fermer');
  assert.ok(!b.includes("aria-label={tr('Fermer')}"), 'la feuille dessine de nouveau sa croix à part, au-dessus de l’en-tête');
  assert.ok(b.includes('{title ? <TitreFeuille style={{ fontSize: 17, fontWeight: 800 }} marge={12}>{title}</TitreFeuille> : null}'), 'une feuille qui ne passe qu’un titre n’a plus sa ligne');
  // Au clavier, on arrive sur le contenu, pas sur « Fermer » ; la recherche garde son champ.
  assert.ok(b.includes('el.contains(document.activeElement)') && b.includes("!n.hasAttribute('data-croix')"));
});

test('chaque feuille porte la croix sur sa ligne d’en-tête', () => {
  // Chaque <BottomSheet> de src/ : la croix vient de CroixFeuille, de
  // TitreFeuille, de FicheEntete, du `title` passé à la feuille, ou de la
  // fiche du robot qu'elle contient.
  const sans = [];
  for (const [f, s] of sources()) {
    let i = s.indexOf('<BottomSheet');
    while (i >= 0) {
      const fin = s.indexOf('</BottomSheet>', i);
      const bloc = s.slice(i, fin < 0 ? undefined : fin);
      const ouverture = s.slice(i, s.indexOf('\n', i));
      if (!/<CroixFeuille|<TitreFeuille|<FicheEntete|<FicheRobotContent/.test(bloc) && !/ title=\{/.test(ouverture)) sans.push(f + ':' + s.slice(0, i).split('\n').length);
      i = s.indexOf('<BottomSheet', i + 1);
    }
  }
  assert.deepEqual(sans, [], 'une feuille n’a plus de croix');
  // L'en-tête des fiches : l'épingle, puis la croix.
  const e = fonction(APP, 'FicheEntete');
  assert.ok(e.indexOf('<BoutonEpingle id={id} />') >= 0 && e.indexOf('<BoutonEpingle id={id} />') < e.indexOf('<CroixFeuille />'), 'la croix n’est plus en dernier');
  // La fiche du robot : l'épingle, la roue, puis la croix — sur la même ligne.
  const robot = lire('src', 'ficherobot.jsx');
  const r = robot.slice(robot.indexOf("onClick={() => setOnglet('reglages')} aria-label={tr('Réglages')}"));
  assert.ok(r.indexOf('<CroixFeuille />') > 0 && r.indexOf('<CroixFeuille />') < r.indexOf('\n      </div>'), 'la croix du robot a quitté la ligne de la roue');
});

test('aucune autre croix : la commune, la commande d’un volet, le formulaire d’événement', () => {
  const croix = [];
  for (const [f, s] of sources()) {
    const n = (s.match(/aria-label=\{tr\('Fermer'\)\}/g) || []).length;
    if (n) croix.push(f + ' × ' + n);
  }
  assert.deepEqual(croix.sort(), ['src/App.jsx × 2', 'src/ui.jsx × 1']);
  assert.ok(APP.includes("<button aria-label={tr('Fermer')} title={tr('Fermer')} onClick={(e) => { e.stopPropagation(); setOv(0); commander(hass, id, 'close'); }}"), 'la commande du volet');
  assert.ok(fonction(APP, 'NouvelEvenement').includes("<button onClick={onClose} aria-label={tr('Fermer')}"), 'la croix du formulaire d’événement, DANS la fiche de l’agenda');
  assert.ok(!APP.includes('FICHE_X') && !/<FicheEntete [^\n]*close=/.test(APP), 'l’en-tête des fiches a retrouvé sa croix à part');
});

test('plus de bouton en bas qui ne fait que fermer', () => {
  const fautifs = [];
  for (const [f, s] of sources()) {
    if (/<button[^>]*onClick=\{(close|onFermer)\}[^>]*>\s*(\{tr\('(Annuler|Terminé|Fermer)'\)\}|Annuler|Fermer)\s*<\/button>/.test(s)) fautifs.push(f);
  }
  assert.deepEqual(fautifs, [], 'un « Annuler » ou un « Terminé » ferme encore la feuille, à côté de la croix');
});

test('le navigateur de médias garde son retour, et la croix au bout de sa ligne', () => {
  const n = fonction(APP, 'NavigateurMedias');
  assert.ok(n.includes('{pile.length > 1 && (') && n.includes("<button onClick={remonter} aria-label={tr('Revenir')} style={btnRond}>"), 'le retour a disparu');
  assert.ok(n.includes('<CroixFeuille />'));
});
