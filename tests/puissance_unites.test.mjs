// ─────────────────────────────────────────────────────────────────────────────
// Une puissance en kW n'est pas une puissance en W (audit du 03/10, lot 9).
//
// La découverte choisit le capteur de puissance par sa seule device_class
// `power` — c'est juste — mais chaque lecture prenait le chiffre brut pour des
// watts. Un compteur P1/DSMR qui publie 2,75 kW s'affichait « 3 W » sur la vue
// Énergie, « ↓ 1 W » sur l'Accueil, et les seuils « > 5 W » ne se
// franchissaient jamais : le solaire ne paraissait jamais actif. Même examen
// pour l'énergie : un compteur en Wh se lisait mille fois trop grand en kWh.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { wattsDe, kwhDe, facteurWatts, facteurKwh } from '../src/unites.js';
import { MONOLITHE, VUES_SORTIES } from './monolithe.mjs'; // App.jsx + les vues sorties du boot (ADR 0274)

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const APP = (MONOLITHE + VUES_SORTIES);
const capteur = (state, unite, dc = 'power') => ({
  state: String(state),
  attributes: unite == null ? { device_class: dc } : { device_class: dc, unit_of_measurement: unite },
});
const proche = (v, attendu, msg = '') => assert.ok(v != null && Math.abs(v - attendu) < 1e-6, `${msg} — ${v} au lieu de ${attendu}`);
// Le corps d'une fonction d'App.jsx, jusqu'à la suivante.
const corps = (nom) => {
  const i = APP.indexOf('\nfunction ' + nom + '(');
  assert.notEqual(i, -1, nom + ' introuvable');
  return APP.slice(i, APP.indexOf('\nfunction ', i + 1));
};
// Les commentaires citent le code d'avant : on ne teste que le code.
const sansCommentaires = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('wattsDe ramène kW, MW et mW au watt', () => {
  assert.equal(wattsDe(capteur('2.75', 'kW')), 2750, 'le compteur P1/DSMR du constat');
  proche(wattsDe(capteur('1.2', 'MW')), 1200000);
  proche(wattsDe(capteur('500', 'mW')), 0.5);
  assert.equal(wattsDe(capteur('850', 'W')), 850, 'des watts restent des watts');
});

test('wattsDe garde le signe : un compteur net passe sous zéro quand on exporte', () => {
  assert.equal(Math.round(wattsDe(capteur('-0.46', 'kW')) * 1000) / 1000, -460);
});

test('wattsDe lit les unités écrites à la main, sans deviner l’ambigu', () => {
  assert.equal(wattsDe(capteur('3', 'KW')), 3000);
  assert.equal(wattsDe(capteur('3', ' kW ')), 3000);
  // « mw » : milli ou méga ? Un milliard d'écart — on ne devine pas.
  assert.equal(wattsDe(capteur('3', 'mw')), 3);
});

test('la puissance apparente d’un Linky (VA) se lit comme des watts, comme avant', () => {
  assert.equal(wattsDe(capteur('1840', 'VA', 'apparent_power')), 1840);
  proche(wattsDe(capteur('1.84', 'kVA', 'apparent_power')), 1840);
});

test('une unité absente ou inconnue se lit telle quelle : le comportement d’avant, pas un « — »', () => {
  assert.equal(wattsDe(capteur('120', null)), 120, 'un modèle sans unité garde son chiffre');
  assert.equal(wattsDe(capteur('120', 'Watt')), 120);
  assert.equal(wattsDe({ state: '5' }), 5, 'sans attributs, aucun plantage');
  assert.equal(facteurWatts(''), 1);
  assert.equal(facteurWatts(undefined), 1);
  // Une énergie passée par erreur à la table des puissances n'est pas convertie.
  assert.equal(facteurWatts('kWh'), 1);
});

test('wattsDe rend null sans valeur lisible : la règle du zéro (ADR 0030)', () => {
  assert.equal(wattsDe(null), null, 'entité absente');
  assert.equal(wattsDe(undefined), null);
  assert.equal(wattsDe(capteur('unavailable', 'kW')), null);
  assert.equal(wattsDe(capteur('unknown', 'W')), null);
  assert.equal(wattsDe({ state: null, attributes: {} }), null);
  assert.equal(wattsDe({ state: '' }), null);
});

test('kwhDe ramène Wh, MWh, MJ et Gcal au kWh', () => {
  proche(kwhDe(capteur('1500', 'Wh', 'energy')), 1.5, 'un compteur en Wh se lisait mille fois trop grand');
  assert.equal(kwhDe(capteur('6.16', 'kWh', 'energy')), 6.16);
  proche(kwhDe(capteur('2', 'MWh', 'energy')), 2000);
  proche(kwhDe(capteur('36', 'MJ', 'energy')), 10);
  proche(kwhDe(capteur('1', 'Gcal', 'energy')), 4184 / 3.6, 'un réseau de chaleur en Gcal, 4,184 J la calorie comme Home Assistant');
  proche(kwhDe(capteur('1500', 'wh', 'energy')), 1.5, 'la casse écrite à la main');
  assert.equal(kwhDe(capteur('unavailable', 'Wh', 'energy')), null);
});

test('les facteurs servent l’historique, qui arrive sans ses attributs', () => {
  assert.equal(facteurWatts('kW'), 1000);
  assert.equal(facteurWatts('W'), 1);
  assert.equal(facteurKwh('kWh'), 1);
  assert.equal(facteurKwh('Wh'), 0.001);
});

test('unites.js reste pur : ni React, ni Home Assistant', () => {
  assert.doesNotMatch(lire('src', 'unites.js'), /^import /m);
});

test('la vue Énergie lit ses puissances en watts et ses énergies en kWh', () => {
  const code = sansCommentaires(corps('EnergieContent'));
  assert.ok(code.includes('const numW = (id, def = 0) => { const w = avail(id) ? wattsDe(S[id]) : null; return w == null ? def : w; };'), 'la lecture en watts a disparu');
  assert.ok(code.includes('const numKwh = (id, def = 0) => { const k = avail(id) ? kwhDe(S[id]) : null; return k == null ? def : k; };'), 'la lecture en kWh a disparu');
  assert.doesNotMatch(code, /\bnum\((EN\.(solarNow|solarOutput|consoNow|gridNow|injectionNow|surplusNow|consoMaison|appTotal|evNow|batNow)|d\.power)\)/,
    'une puissance se lit encore brute : 2,75 kW redeviendrait « 3 W »');
  assert.doesNotMatch(code, /\bnum\((EN\.(prodJour|consoJour|consoJourHc|consoJourHp|consoHcToday|consoHpToday|consoReseauToday|injectionJour)|d\.kwh)\)/,
    'une énergie se lit encore brute : des Wh passeraient pour des kWh');
  /* Les deux courbes des dernieres 24 h ont disparu avec la refonte du 06/10.
   * Ce qu'elles protegeaient tient maintenant dans l'historique feuilletable :
   * une statistique arrive dans l'unite du capteur, et se ramene au kWh avant
   * d'etre tracee — sans quoi un compteur en Wh ferait mille fois trop. */
  const histo = lire('src', 'views', 'energiehisto.jsx');
  assert.ok(histo.includes("facteurs[id] = id === EN.coutJour ? 1 : facteurKwh(unite(id));"),
    'les statistiques ne se ramènent plus au kWh');
  assert.ok(histo.includes("facteurs[id] = choix === 'cout' ? 1 : facteurKwh(unite(id));"),
    'le calendrier non plus');
});

test('l’Accueil, la carte Énergie, les points d’attention et l’aperçu lisent en watts', () => {
  const acc = sansCommentaires(corps('deriveAccueil'));
  // ASSERTION MODIFIÉE (25/10) : l'Accueil lit aussi les noms de la fiche (gridNow, injectionNow, solarNow), toujours en watts.
  /* ASSERTION MODIFIÉE (30/10, G3-D3) : deux onduleurs — le solaire et le flux net se lisent par leurs PARTS (`idsDe`,
   * `sommeLue`), chacune toujours en watts par `numW`. */
  assert.ok(acc.includes('const numW = (id) => (id && S[id] ? wattsDe(S[id]) : null);') && acc.includes("const solarParts = sommeLue(idsDe(E, 'solarNow'), numW);")
    && acc.includes("netW = sommeLue(idsDe(E, 'consoNow'), numW), surplusRaw = ou(E.surplusNow, E.injectionNow);"),
    'le bandeau de l’Accueil relit ses puissances brutes : « ↓ 1 W »');
  assert.ok(acc.includes('const power = numW(notifIds().dishwasher) || 0;'), 'le lave-vaisselle compare encore des kW à des seuils en watts');
  const cv = sansCommentaires(corps('CvEnergie'));
  // ASSERTION MODIFIÉE (30/10, G3-D3) : tous les onduleurs, et le flux net nommé d'abord — toujours par `wattsDe`.
  assert.ok(cv.includes("const sol = sommeLue(idsDe(EN, 'solarNow'), (id) => lit(id, wattsDe));") && cv.includes('const grid = net != null ? net : lit(EN.gridNow, wattsDe);') && cv.includes('const jour = lit(EN.consoJour, kwhDe);'),
    'la carte Énergie maison relit ses capteurs bruts');
  const notifs = sansCommentaires(corps('deriveNotifs'));
  assert.ok(!notifs.includes('numOf('), 'un seuil en watts lit encore la valeur brute');
  // Le surplus : une puissance seulement, jamais l'index cumulé (relecture du 03/10).
  assert.ok(notifs.includes('const sur = net != null ? Math.max(0, -net) : wattsOf(EH.injectionNow || EH.surplusNow);') && notifs.includes('const lv = wattsOf(notifIds().dishwasher);'));
  // ASSERTION AJOUTÉE (30/10, G3-D3) : le flux net se lit par ses parts, en watts.
  assert.ok(notifs.includes("const net = sommeLue(idsDe(ficheEnergie(), 'consoNow'), wattsOf);"));
  assert.ok(sansCommentaires(corps('useHass')).includes('const n = wattsDe(s);'),
    'la signature des capteurs bruyants arrondit encore des kW à 10 : l’écran ne bouge plus sous 5 kW');
  assert.ok(lire('src', 'views', 'parametres.jsx').includes('wattsDe(S[en.consoNow])'), 'l’aperçu des Paramètres relit la consommation brute');
});

/* TEST RÉÉCRIT (chantier Prises, tâche 3, P1) : la puissance d'une prise est
 * celle du capteur que la règle des prises retient (`priseDe`), plus le premier
 * capteur `power` de son appareil — celui du poêle les porte tous. Toujours en
 * watts. */
test('la carte d’une prise lit sa puissance en watts, dans le capteur que la règle lui donne', () => {
  // Chantier Prises, tâche 7 : la carte d'une prise a sa vue (`useVuePrise`), partagée avec la compacte.
  const i = APP.indexOf('function useVuePrise(');
  assert.notEqual(i, -1, 'la vue d’une prise a disparu');
  const f = APP.slice(i, APP.indexOf('\n}\n', i));
  assert.ok(f.includes('const prise = actif ? priseDe(S, id) : PAS_DE_PRISE;'), 'la puissance de la prise ne se cherche plus par la règle des prises');
  assert.ok(f.includes('const watts = prise.puissance && S[prise.puissance] ? wattsDe(S[prise.puissance]) : null;'),
    'la puissance d’une prise se lit encore brute : 1,25 kW redeviendrait « 1 W »');
});
