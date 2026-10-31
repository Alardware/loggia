/* LES VUES SEMAINE ET JOUR LISENT LEUR PROPRE SEMAINE (18/10).
 *
 * « Onglet Mois pas de problème, par contre onglet Semaine ne m'affiche pas
 * tout, j'ai rien de la semaine-là alors que Mois si — et Jour idem. » La
 * feuille ne demandait une plage que pour le Mois ; Semaine et Jour
 * retombaient sur les sept jours de la carte du rail, comptés à partir
 * d'AUJOURD'HUI. Un dimanche, la semaine affichée (lundi → dimanche) n'avait
 * donc que son dernier jour de lu : six colonnes vides alors que le mois,
 * lui, montrait bien les journées.
 *
 * Et le bouton clair / sombre du bandeau gardait son soleil dans les deux
 * modes, et les flèches de l'agenda bougeaient avec la largeur du titre. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { plageDeLaSemaine, cleJour } from '../src/agenda.js';

import { MONOLITHE } from './monolithe.mjs'; // App.jsx et ce qui en sort (ADR 0282)
const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, 'src', f), 'utf8');

test('la semaine affichée se lit du lundi minuit au lundi suivant', () => {
  // Dimanche 18/10/2026 à 15 h : la semaine montrée va du lundi 12 au dimanche 18.
  const p = plageDeLaSemaine(new Date(2026, 9, 18, 15, 0));
  assert.equal(cleJour(p.debut), cleJour(new Date(2026, 9, 12)));
  assert.equal(p.debut.getHours() + p.debut.getMinutes(), 0, 'à minuit');
  assert.equal(cleJour(p.fin), cleJour(new Date(2026, 9, 19)));
  assert.equal(p.fin.getHours(), 0, 'fin exclue, au lundi minuit');
});

test('un lundi ouvre sa propre semaine, pas la précédente', () => {
  const p = plageDeLaSemaine(new Date(2026, 9, 12, 8));
  assert.equal(cleJour(p.debut), cleJour(new Date(2026, 9, 12)));
  assert.equal(cleJour(p.fin), cleJour(new Date(2026, 9, 19)));
});

test('la semaine du passage à l’heure d’hiver garde sept jours de calendrier', () => {
  // Le dimanche 25/10/2026 compte 25 heures : 7 × 24 h tomberait le dimanche à 23 h.
  const p = plageDeLaSemaine(new Date(2026, 9, 25, 12));
  assert.equal(cleJour(p.debut), cleJour(new Date(2026, 9, 19)));
  assert.equal(cleJour(p.fin), cleJour(new Date(2026, 9, 26)));
  assert.equal(p.fin.getHours(), 0);
});

test('la feuille demande sa plage pour Semaine et Jour, plus seulement pour Mois', () => {
  const c = lire('feuilleagenda.jsx');
  assert.ok(!c.includes("if (vue !== 'mois') { onPlage(null); return undefined; }"),
    'Semaine et Jour ne doivent plus retomber sur les sept jours du rail');
  assert.ok(c.includes('plageDeLaSemaine(jourSel)'), 'la semaine du jour choisi se calcule');
  assert.ok(c.includes("onPlage(vue === 'mois' ? plageMois : plageVue);"), 'et se demande');
});

test('les flèches de l’agenda ne suivent plus la largeur du titre', () => {
  const c = lire('feuilleagenda.jsx');
  // Au large : Aujourd'hui, les flèches, PUIS le titre — sa largeur ne pousse plus rien.
  assert.match(c, /\{aujourdhui\}\s*\{fleches\}\s*\{titreDOM\}\s*<div style=\{\{ flex: 1 \}\} \/>\s*\{vues\}/);
});

test('le bouton clair / sombre montre le mode où l’on est', () => {
  const c = MONOLITHE;
  assert.ok(!c.includes('<Ico name="brightness" size={18} /></button>'), 'plus de soleil figé');
  assert.ok(c.includes("<Ico name={ctx.light ? 'sun' : 'moon'} size={18} />"), 'soleil en clair, lune en sombre');
});
