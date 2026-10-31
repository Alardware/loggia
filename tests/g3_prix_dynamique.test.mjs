// ─────────────────────────────────────────────────────────────────────────────
// Le prix qui VARIE (chantier G3, D4 et E5 ; ADR 0302).
//
// Une seule connexion dont le prix vient d'une entité qui bouge (un prix spot,
// un tarif horaire) s'appelait « Tarif unique » : faux. Elle s'appelle « Prix
// du moment », et quand l'entité publie sa PRÉVISION en attribut — une liste
// d'objets avec une heure de début et un prix —, la carte dit la fenêtre la
// moins chère : « Le moins cher : 13:00–15:00 ».
//
// La prévision se reconnaît à sa FORME, jamais au nom d'une intégration. Celles
// qui ne la donnent que par une action à elles (Nord Pool officielle, Tibber)
// restent sans fenêtre.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lirePrevision, fenetreMoinsChere, prixVarie } from '../src/tarif.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const HISTO = readFileSync(join(RACINE, 'src', 'views', 'energiehisto.jsx'), 'utf8');

const H = 3600e3;
const base = Date.UTC(2026, 9, 30, 0, 0, 0);
const iso = (ms) => new Date(ms).toISOString();
// Vingt-quatre heures, le creux de 13 h à 15 h.
const PRIX = [30, 28, 27, 26, 26, 27, 32, 38, 40, 36, 30, 22, 18, 9, 10, 17, 25, 34, 41, 44, 39, 33, 31, 30];

test('la forme ENTSO-E : `time` et `price`, la fin déduite du début suivant', () => {
  const pts = lirePrevision({ prices: PRIX.map((p, h) => ({ time: iso(base + h * H), price: p / 100 })), friendly_name: 'Prix' });
  assert.equal(pts.length, 24);
  assert.equal(pts[0].debut, base);
  assert.equal(pts[0].fin, base + H);
  assert.equal(pts[23].fin, base + 24 * H, 'le dernier dure comme son voisin');
});

test('la forme Amber : plusieurs nombres, plusieurs dates — le début est le plus tôt, le prix est `per_kwh`', () => {
  const pts = lirePrevision({ forecasts: [0, 1, 2].map(i => ({
    duration: 30, date: '2026-10-30', nem_date: iso(base + (i + 1) * 1800e3), per_kwh: [0.3, 0.1, 0.2][i], spot_per_kwh: 0.05,
    start_time: iso(base + i * 1800e3), end_time: iso(base + (i + 1) * 1800e3), renewables: 40, spike_status: 'none' })) });
  assert.deepEqual(pts.map(p => [p.debut, p.fin, p.prix]), [[base, base + 1800e3, 0.3], [base + 1800e3, base + 3600e3, 0.1], [base + 3600e3, base + 5400e3, 0.2]]);
});

test('aujourd’hui et demain dans deux attributs : une seule liste', () => {
  const pts = lirePrevision({
    raw_today: [{ start: iso(base), end: iso(base + H), value: 1 }, { start: iso(base + H), end: iso(base + 2 * H), value: 2 }],
    raw_tomorrow: [{ start: iso(base + 24 * H), end: iso(base + 25 * H), value: 3 }, { start: iso(base + 25 * H), end: iso(base + 26 * H), value: 4 }],
  });
  assert.deepEqual(pts.map(p => p.prix), [1, 2, 3, 4]);
});

test('rien qui ressemble à une prévision : liste vide', () => {
  assert.deepEqual(lirePrevision({ friendly_name: 'Prix', unit_of_measurement: '€/kWh', options: ['a', 'b'] }), []);
  assert.deepEqual(lirePrevision({ liste: [{ nom: 'x', prix: 1 }, { nom: 'y', prix: 2 }] }), [], 'sans heure de début, ce n’est pas une prévision');
  assert.deepEqual(lirePrevision(null), []);
});

test('la fenêtre continue la moins chère, deux heures par défaut', () => {
  const pts = PRIX.map((p, h) => ({ debut: base + h * H, fin: base + (h + 1) * H, prix: p }));
  const f = fenetreMoinsChere(pts, base + 8 * H);
  assert.deepEqual([f.debut, f.fin], [base + 13 * H, base + 15 * H]);
  // Trois heures : 13 h – 16 h (9 + 10 + 17), pas 12 h – 15 h (18 + 9 + 10).
  const t = fenetreMoinsChere(pts, base + 8 * H, 180);
  assert.deepEqual([t.debut, t.fin], [base + 13 * H, base + 16 * H]);
});

test('à égalité, la plus tôt ; le passé ne compte pas', () => {
  const pts = [5, 1, 1, 5, 1, 1, 5].map((p, h) => ({ debut: base + h * H, fin: base + (h + 1) * H, prix: p }));
  const f = fenetreMoinsChere(pts, base);
  assert.equal(f.debut, base + 1 * H, 'la première des deux fenêtres à 1');
  const apres = fenetreMoinsChere(pts, base + 3 * H + 10);
  assert.equal(apres.debut, base + 4 * H, 'celle d’avant est passée');
});

test('l’heure en cours compte, un trou casse la continuité', () => {
  const pts = [{ debut: base, fin: base + H, prix: 1 }, { debut: base + H, fin: base + 2 * H, prix: 1 },
    { debut: base + 3 * H, fin: base + 4 * H, prix: 0 }, { debut: base + 5 * H, fin: base + 6 * H, prix: 0 }];
  const f = fenetreMoinsChere(pts, base + 30 * 60e3);
  assert.deepEqual([f.debut, f.fin], [base, base + 2 * H], 'les deux heures à 0 ne se touchent pas');
});

test('des prix tous égaux ne désignent rien', () => {
  const pts = [1, 1, 1, 1].map((p, h) => ({ debut: base + h * H, fin: base + (h + 1) * H, prix: p }));
  assert.equal(fenetreMoinsChere(pts, base), null);
  assert.equal(fenetreMoinsChere([], base), null);
});

test('un prix VARIE quand sa prévision ou sa journée bouge', () => {
  assert.equal(prixVarie([{ prix: 1 }, { prix: 2 }], null), true);
  assert.equal(prixVarie([], [{ state: '0.21' }, { state: '0.19' }]), true);
  assert.equal(prixVarie([], [{ state: '0.21' }, { state: '0.21' }, { state: 'unavailable' }]), false, 'un prix fixe publié par une entité reste un tarif unique');
  assert.equal(prixVarie([], null), false);
});

test('la carte du tarif : « Prix du moment » et « Le moins cher »', () => {
  assert.match(HISTO, /tr\('Prix du moment'\)/);
  assert.match(HISTO, /tr\('Le moins cher : \{de\}–\{a\}'/);
  assert.match(HISTO, /tr\('Le moins cher : demain \{de\}–\{a\}'/);
  assert.match(HISTO, /fenetreMoinsChere\(/);
});
