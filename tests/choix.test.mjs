// ─────────────────────────────────────────────────────────────────────────────
// Une liste de choix aux couleurs du thème, partout.
//
// Retour du 18/09 (« il y a un souci avec les menus dans Alertes, pourquoi
// sont-ils blancs comme ça », trois captures) : le menu d'un <select> natif
// est dessiné par le système — blanc sous Windows, quel que soit le thème.
// Loggia dessine le sien : `ListeChoix` (ui.jsx), sa logique dans choix.js.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sansAccents, filtrerChoix, blocsChoix, placerMenu, SEUIL_RECHERCHE } from '../src/choix.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const UI = lire('src', 'ui.jsx');
const PAR = lire('src', 'views', 'parametres.jsx');

// Des noms de démonstration, pas ceux d'une vraie maison.
const OPTIONS = [
  { id: '', label: 'Automatique' },
  { id: 'valve.arrivee', label: 'Arrivée d’eau', sub: 'valve.arrivee', groupe: 'Vannes' },
  { id: 'switch.prise_jardin', label: 'Prise du jardin', sub: 'switch.prise_jardin', groupe: 'Prises et interrupteurs' },
  { id: 'switch.eclairage_sejour', label: 'Éclairage séjour', sub: 'switch.eclairage_sejour', groupe: 'Prises et interrupteurs' },
];

test('plus aucun <select> natif dans l’interface', () => {
  // Un seul suffirait à rouvrir un menu blanc sous Windows. Les commentaires
  // qui racontent l'ancien <select> ne comptent pas.
  const fichiers = [];
  const parcourir = (d) => readdirSync(join(RACINE, d), { withFileTypes: true }).forEach(e => {
    if (e.isDirectory()) parcourir(join(d, e.name));
    else if (/\.jsx?$/.test(e.name)) fichiers.push(join(d, e.name));
  });
  parcourir('src');
  const sansCommentaires = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const fautifs = fichiers.filter(f => /<select[\s>]/.test(sansCommentaires(readFileSync(join(RACINE, f), 'utf8'))));
  assert.deepEqual(fautifs, [], 'un menu natif est revenu');
});

test('le filtre : le nom ou l’identifiant, sans se soucier des accents', () => {
  assert.equal(sansAccents('Éclairage Séjour'), 'eclairage sejour');
  assert.deepEqual(filtrerChoix(OPTIONS, 'eclai').map(o => o.id), ['switch.eclairage_sejour'], 'les accents comptent encore');
  assert.deepEqual(filtrerChoix(OPTIONS, 'switch.prise').map(o => o.id), ['switch.prise_jardin'], 'l’identifiant ne se cherche pas');
  assert.deepEqual(filtrerChoix(OPTIONS, '  ').map(o => o.id), OPTIONS.map(o => o.id), 'un filtre vide doit tout rendre');
  assert.deepEqual(filtrerChoix(OPTIONS, 'zzz'), []);
  assert.deepEqual(filtrerChoix(null, 'x'), []);
  assert.equal(SEUIL_RECHERCHE, 12, 'le champ de filtre paraît au-delà de douze options');
});

test('les groupes : un intitulé par suite d’options, le rang du clavier gardé', () => {
  const b = blocsChoix(OPTIONS);
  assert.deepEqual(b.map(x => x.groupe), ['', 'Vannes', 'Prises et interrupteurs']);
  assert.deepEqual(b[2].items.map(x => x.i), [2, 3], 'les flèches suivraient un autre ordre que l’écran');
  // Filtré, un groupe vidé disparaît avec son intitulé.
  assert.deepEqual(blocsChoix(filtrerChoix(OPTIONS, 'jardin')).map(x => x.groupe), ['Prises et interrupteurs']);
});

test('le menu s’ouvre sous son bouton, au-dessus quand la place manque en bas', () => {
  const bouton = (top, left = 100, width = 268, h = 48) => ({ top, bottom: top + h, left, width });
  const enHaut = placerMenu(bouton(100), 1330, 900, 340);
  assert.equal(enHaut.dessous, true);
  assert.equal(enHaut.top, 154);
  assert.equal(enHaut.w, 340, 'la largeur demandée');
  assert.equal(enHaut.max, 340);
  // Le choix de la vanne, en bas de la page des Alertes.
  const enBas = placerMenu(bouton(800), 1330, 900, 340);
  assert.equal(enBas.dessous, false, 'en bas de page, le menu sortirait de l’écran');
  assert.equal(enBas.bottom, 106);
  assert.ok(enBas.max >= 120 && enBas.max <= 786);
  // Au bord droit, il rentre dans l'écran ; jamais plus large que lui.
  assert.equal(placerMenu(bouton(100, 1200), 1330, 900, 340).left, 1330 - 340 - 8);
  const tel = placerMenu(bouton(100, 10, 300), 390, 844, 460);
  assert.equal(tel.w, 390 - 16);
  assert.equal(tel.left, 8);
});

test('la liste commune : dans <body>, au clavier, le filtre sur les longues listes', () => {
  const c = UI.slice(UI.indexOf('export function ListeChoix('), UI.indexOf('\nexport const CV_DOM_ICON'));
  assert.ok(c.includes('createPortal(') && c.includes(', document.body)}'), 'le menu retombe à côté de son bouton');
  // Échap, écouté en capture sur le document : il ferme le menu, pas la feuille autour.
  assert.ok(c.includes("document.addEventListener('keydown', onKey, true);") && c.includes("if (e.key !== 'Escape') return;"));
  for (const k of ["'ArrowDown'", "'ArrowUp'", "'Home'", "'End'", "'Enter'", "'Tab'"]) assert.ok(c.includes(k), k + ' ne répond plus');
  assert.ok(c.includes('role="listbox"') && c.includes('role="option"') && c.includes('aria-activedescendant={vise}'));
  assert.ok(c.includes('liste.length > SEUIL_RECHERCHE'), 'plus de filtre sur les longues listes');
  assert.ok(c.includes("tactile = window.matchMedia('(pointer: coarse)').matches"), 'le clavier du téléphone surgirait à chaque ouverture');
  assert.ok(c.includes('placerMenu(el.getBoundingClientRect(), largeurEcran(), window.innerHeight, largeur)'));
});

test('les menus des Alertes : la liste de Loggia, groupée, triée par nom', () => {
  assert.ok(PAR.includes('<ListeChoix label={label} value={value} onChange={onChange} options={options} largeur={340}'), 'le choix des Alertes a perdu la liste commune');
  assert.ok(PAR.includes("sub: 'notify.' + x"), 'le service du téléphone ne se lit plus sous son nom');
  assert.ok(PAR.includes("groupe: tr('Vannes')") && PAR.includes("groupe: tr('Prises et interrupteurs')"));
  // Le groupe prend tout `switch.*` : pas seulement des prises.
  assert.ok(!PAR.includes("tr('Prises commandées')"), 'le groupe promet des prises et liste tous les interrupteurs');
  assert.ok(PAR.includes('const parNom = (ids) => ids.slice().sort((a, b) => nomDe(a).localeCompare(nomDe(b), locale()));'), 'la liste suit les identifiants, pas les noms lus');
});

test('les mots de la liste existent en anglais', () => {
  const en = lire('src', 'langues', 'en.js');
  for (const k of ['Rechercher…', 'Aucun résultat', 'Alarme à armer', 'Entité du tarif heures creuses', 'Prises et interrupteurs']) {
    assert.ok(en.includes("'" + k + "':"), k + ' manque à en.js');
  }
});
