// Poser une carte où l'on veut, sans que rien d'autre ne bouge (23/09).
//
// « Je veux juste pouvoir placer une carte où je veux sans que tout bouge. »
// Le point qui compte : déposer sur une cellule libre ne déplace QUE la carte
// déposée, et un trou reste un trou.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  disposer, poser, premiereLibre, cellulePointee, colonnesDe, nettoyer, rangeesMax, hauteur,
} from '../src/placement.js';

// Cinq pièces, comme sur l'Accueil.
const NOMS = ['A', 'B', 'C', 'D', 'E'];
const COMPACTES = { A: 'c', B: 'c', C: 'c', D: 'c', E: 'c' };
const AVEC_UNE_GRANDE = { ...COMPACTES, C: 's' };

test('sans aucune place enregistrée, les cartes se suivent comme avant', () => {
  const d = disposer(NOMS, COMPACTES, {}, 3);
  assert.deepEqual(d.A, { c: 1, r: 1 });
  assert.deepEqual(d.B, { c: 2, r: 1 });
  assert.deepEqual(d.C, { c: 3, r: 1 });
  assert.deepEqual(d.D, { c: 1, r: 2 });
  assert.deepEqual(d.E, { c: 2, r: 2 });
  // Une standard prend deux rangées.
  const g = disposer(['C', 'D'], AVEC_UNE_GRANDE, {}, 2);
  assert.deepEqual(g.C, { c: 1, r: 1 });
  assert.deepEqual(g.D, { c: 2, r: 1 });
  assert.equal(hauteur('s'), 2);
  assert.equal(hauteur('c'), 1);
});

test('un trou voulu reste un trou', () => {
  // A en haut à gauche, D dessous mais en laissant une rangée vide.
  const places = { A: { c: 1, r: 1 }, D: { c: 1, r: 3 } };
  const d = disposer(['A', 'D'], COMPACTES, places, 3);
  assert.deepEqual(d.A, { c: 1, r: 1 });
  assert.deepEqual(d.D, { c: 1, r: 3 }, 'la carte ne remonte pas combler le vide');
});

test('déposer sur une cellule libre ne déplace QUE la carte déposée', () => {
  const places = disposer(NOMS, COMPACTES, {}, 3); // tout le monde a une place
  const avant = disposer(NOMS, COMPACTES, places, 3);
  // E part se poser tout seul en colonne 3, rangée 4.
  const apres = disposer(NOMS, COMPACTES, poser(places, NOMS, COMPACTES, 'E', 3, 4, 3), 3);
  assert.deepEqual(apres.E, { c: 3, r: 4 });
  for (const nom of ['A', 'B', 'C', 'D']) {
    assert.deepEqual(apres[nom], avant[nom], nom + ' n’avait aucune raison de bouger');
  }
});

test('déposer sur une carte échange les deux, et personne d’autre', () => {
  const places = disposer(NOMS, COMPACTES, {}, 3);
  const avant = disposer(NOMS, COMPACTES, places, 3);
  // D (1,2) va sur B (2,1).
  const apres = disposer(NOMS, COMPACTES, poser(places, NOMS, COMPACTES, 'D', 2, 1, 3), 3);
  assert.deepEqual(apres.D, { c: 2, r: 1 });
  assert.deepEqual(apres.B, avant.D, 'B prend la place que D vient de quitter');
  for (const nom of ['A', 'C', 'E']) {
    assert.deepEqual(apres[nom], avant[nom], nom + ' n’a pas bougé');
  }
});

test('une place faite sur un écran plus large se rabat, sans superposer', () => {
  // Places prises sur quatre colonnes, relues sur deux.
  const places = { A: { c: 1, r: 1 }, B: { c: 4, r: 1 }, C: { c: 3, r: 1 } };
  const d = disposer(['A', 'B', 'C'], COMPACTES, places, 2);
  const cellules = Object.values(d).map(p => p.c + ':' + p.r);
  assert.equal(new Set(cellules).size, cellules.length, 'deux cartes ne partagent jamais une cellule');
  assert.ok(Object.values(d).every(p => p.c <= 2), 'aucune carte hors des colonnes existantes');
});

test('une pièce nouvelle prend le premier creux, sans déranger les autres', () => {
  const places = { A: { c: 1, r: 1 }, B: { c: 3, r: 1 } };
  const d = disposer(['A', 'B', 'NEUVE'], COMPACTES, places, 3);
  assert.deepEqual(d.A, { c: 1, r: 1 });
  assert.deepEqual(d.B, { c: 3, r: 1 });
  assert.deepEqual(d.NEUVE, { c: 2, r: 1 }, 'le creux entre les deux');
});

test('les bornes tiennent : colonne hors grille, rangée trop basse, nom inconnu', () => {
  const places = disposer(['A', 'B'], COMPACTES, {}, 2);
  const loin = poser(places, ['A', 'B'], COMPACTES, 'A', 99, 999, 2);
  assert.ok(loin.A.c <= 2 && loin.A.r <= rangeesMax(['A', 'B'], COMPACTES, 2));
  assert.deepEqual(poser(places, ['A', 'B'], COMPACTES, 'INCONNUE', 1, 1, 2), places, 'rien ne change');
  assert.deepEqual(premiereLibre(new Set(['1:1', '2:1']), 2, 1), { c: 1, r: 2 });
});

test('la cellule sous le doigt se calcule sur la grille réelle', () => {
  // Trois colonnes de 100 px, 8 px d'écart : 0-99, 108-207, 216-315.
  const rect = { left: 0, top: 0, width: 316, height: 400 };
  assert.deepEqual(cellulePointee(10, 10, rect, 3), { c: 1, r: 1 });
  assert.deepEqual(cellulePointee(150, 10, rect, 3), { c: 2, r: 1 });
  assert.deepEqual(cellulePointee(300, 10, rect, 3), { c: 3, r: 1 });
  assert.deepEqual(cellulePointee(10, 100, rect, 3), { c: 1, r: 2 }, 'rangée de 88 px + 8 d’écart');
  // Hors de la grille : on se rabat dedans plutôt que de refuser le geste.
  assert.deepEqual(cellulePointee(-50, -50, rect, 3), { c: 1, r: 1 });
  assert.deepEqual(cellulePointee(9999, 10, rect, 3), { c: 3, r: 1 });
});

test('on lit le nombre de colonnes que la grille montre vraiment', () => {
  assert.equal(colonnesDe('210px 210px 210px'), 3);
  assert.equal(colonnesDe('minmax(0px, 1fr) minmax(0px, 1fr)'), 2, 'les espaces des parenthèses ne comptent pas');
  assert.equal(colonnesDe('none'), 1);
  assert.equal(colonnesDe(''), 1);
});

test('une pièce supprimée ne garde pas sa cellule', () => {
  const places = { A: { c: 1, r: 1 }, PARTIE: { c: 2, r: 2 }, B: { c: 3, r: 1 } };
  assert.deepEqual(nettoyer(places, ['A', 'B']), { A: { c: 1, r: 1 }, B: { c: 3, r: 1 } });
  assert.deepEqual(nettoyer(null, ['A']), {});
  assert.deepEqual(nettoyer({ A: 'abimee' }, ['A']), {});
});
