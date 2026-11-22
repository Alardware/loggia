// ─────────────────────────────────────────────────────────────────────────────
// Audit du 12/11, lot 4 : ce que les cartes disent.
//
//  — E19 : le journal d'un thermostat dit ses modes avec les mots de sa carte —
//    plus « CONFORT » pour `heat`, plus `cool`, `auto`, `dry` en anglais brut ;
//  — E20 : la fiche d'un lecteur qui joue une série dit la série, puis
//    l'épisode — comme la carte ; le titre de l'épisode ne s'écrit plus deux fois ;
//  — E24 : muet, partout la règle de la lumière : « Indisponible depuis 14:20 »
//    en rouge (volet, garage, thermostat, radiateur, carte générique, mesure,
//    eau chaude, borne) ;
//  — E26 : la carte « Qualité air » écrit l'unité que le capteur publie ;
//  — R4 : un capteur à état texte se dit comme une phrase, jamais en gros chiffres ;
//  — I5 : l'interrupteur simple a le minuteur de la fiche d'une lumière.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { monter, parcourir, texteDe } from './crochets.mjs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);

const { etatJournal } = await import('../src/historique.jsx');
const { quandLumiere } = await import('../src/lumieres.js');
const { vueEauChaude } = await import('../src/eauchaude.js');
const { RoomCoverCard } = await import('../src/cartes/volet.jsx');
const { RoomClimateCard } = await import('../src/cartes/chauffage.jsx');
const { RoomGenericCard } = await import('../src/cartes/generique.jsx');
const { vueMesure } = await import('../src/cartes/mesure.jsx');
const { CvAir } = await import('../src/cartescustom/galerie.jsx');
const CarteBorneContenu = (await import('../src/carteborne.jsx')).default;
const { RangeeMinuteur } = await import('../src/ficheswitch.jsx');

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => readFileSync(join(RACINE, p), 'utf8').replace(/\r\n/g, '\n');
const tours = async (n = 8) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
const rendre = (C, p) => renderToStaticMarkup(createElement(C, p));

/* L'instant du silence : maintenant — le même jour à coup sûr, quelle que soit l'heure du test. La phrase attendue se calcule
 * par la règle de la lumière elle-même. */
const TU = new Date().toISOString();
const DEPUIS = 'Indisponible depuis ' + quandLumiere(TU);
const muet = (id, attributes = {}) => ({ entity_id: id, state: 'unavailable', attributes, last_changed: TU, last_updated: TU });
const hassDe = (...sts) => ({ states: Object.fromEntries(sts.map(s => [s.entity_id, s])), callService: () => Promise.resolve(), callWS: () => new Promise(() => {}) });
// La couleur de l'élément qui écrit exactement ce texte, dans le HTML rendu.
const couleurDe = (html, texte) => { const m = new RegExp('color:([^;"]+)[^>]*>' + texte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '<').exec(html); return m ? m[1] : null; };

// ── E19 ─────────────────────────────────────────────────────────────────────

test('E19 — le journal d’un thermostat dit ses modes avec les mots de sa carte', () => {
  const mot = (st) => etatJournal('climate.salon', st, {});
  assert.deepEqual(['heat', 'cool', 'auto', 'heat_cool', 'dry', 'fan_only', 'off'].map(mot), ['Chauffage', 'Froid', 'Auto', 'Auto', 'Sec', 'Ventil', 'Éteint']);
  assert.equal(mot('boost_fabricant'), 'boost_fabricant', 'un mode inconnu reste tel que l’appareil l’écrit');
  assert.equal(mot('unavailable'), 'Indisponible');
  assert.ok(!lire('src/historique.jsx').includes("tr('CONFORT')"), '« CONFORT » est revenu');
});

// ── E20 ─────────────────────────────────────────────────────────────────────

test('E20 — la fiche d’une série : le nom de la série, puis l’épisode — comme la carte', () => {
  const src = lire('src/fichemedia.jsx');
  const ligne = (debut) => { const i = src.indexOf(debut); assert.ok(i >= 0, debut); return src.slice(i, src.indexOf('\n', i)); };
  const calcul = new Function('l', ligne('  const titre = ') + '\n' + ligne('  const episode = ') + '\n' + ligne('  const dessous = ') + '\nreturn [titre, dessous];');
  assert.deepEqual(calcul({ serie: 'Lupin', title: 'Chapitre 1', saison: '1', episode: '1' }), ['Lupin', 'Chapitre 1 · S1 E1']);
  assert.deepEqual(calcul({ serie: 'Lupin', saison: '2', episode: '3' }), ['Lupin', 'S2 E3'], 'sans titre d’épisode');
  assert.deepEqual(calcul({ title: 'Hey Jude', artist: 'The Beatles' }), ['Hey Jude', 'The Beatles'], 'un morceau ne change pas');
});

// ── E24 ─────────────────────────────────────────────────────────────────────

test('E24 — eau chaude muette : « Indisponible depuis … » en rouge ; sans heure, « Indisponible »', () => {
  const v = vueEauChaude({ id: 'water_heater.ballon', S: { 'water_heater.ballon': muet('water_heater.ballon') } });
  assert.deepEqual([v.mort, v.phrase.texte, v.phrase.encre], [true, DEPUIS, 'var(--o-bad)']);
  const absent = vueEauChaude({ id: 'water_heater.ballon', S: {} });
  assert.deepEqual([absent.phrase.texte, absent.phrase.encre], ['Indisponible', 'var(--o-bad)']);
});

test('E24 — garage, thermostat, carte générique : la phrase de la lumière, en rouge', () => {
  const garage = rendre(RoomCoverCard, { id: 'cover.garage', hass: hassDe(muet('cover.garage', { friendly_name: 'Garage', device_class: 'garage' })), onOpen: () => {} });
  assert.equal(couleurDe(garage, DEPUIS), 'var(--o-bad)', garage);
  const clim = rendre(RoomClimateCard, { id: 'climate.salon', hass: hassDe(muet('climate.salon', { friendly_name: 'Thermostat' })), onOpen: () => {} });
  assert.equal(couleurDe(clim, DEPUIS), 'var(--o-bad)', clim);
  const relais = rendre(RoomGenericCard, { id: 'switch.relais', hass: hassDe(muet('switch.relais', { friendly_name: 'Relais' })), onOpen: () => {} });
  assert.equal(couleurDe(relais, DEPUIS), 'var(--o-bad)', 'un switch : le rouge, plus seulement un capteur binaire — ' + relais);
});

test('E24 — mesure et borne muettes : depuis quand', () => {
  const S = { 'sensor.co2': muet('sensor.co2', { device_class: 'carbon_dioxide', unit_of_measurement: 'ppm', friendly_name: 'CO₂' }) };
  assert.equal(vueMesure({ states: S }, 'sensor.co2').phrase, DEPUIS);
  assert.equal(vueMesure({ states: {} }, 'sensor.absent').phrase, 'Indisponible', 'une entité absente : sans heure');
  const borne = { puissance: 'sensor.borne_w', statut: 'sensor.borne_statut' };
  const html = rendre(CarteBorneContenu, { borne, hass: hassDe(muet('sensor.borne_w'), muet('sensor.borne_statut')), nom: 'Borne' });
  assert.equal(couleurDe(html, DEPUIS), 'var(--o-bad)', html);
});

// ── E26 ─────────────────────────────────────────────────────────────────────

test('E26 — Qualité air : l’unité que publie le capteur, l’ancienne en repli', () => {
  const capteur = (id, dc, v, u) => ({ entity_id: id, state: String(v), attributes: { device_class: dc, ...(u ? { unit_of_measurement: u } : {}) } });
  const avec = rendre(CvAir, { hass: hassDe(capteur('sensor.co2', 'carbon_dioxide', 700, 'ppm'), capteur('sensor.cov', 'volatile_organic_compounds', 120, 'µg/m³'), capteur('sensor.pm', 'pm25', 8, 'µg/m³')) });
  assert.ok(avec.includes('>120 µg/m³<') && avec.includes('>8 µg/m³<') && !avec.includes(' ppb<'), avec);
  const sans = rendre(CvAir, { hass: hassDe(capteur('sensor.cov', 'volatile_organic_compounds_parts', 80), capteur('sensor.pm', 'pm25', 8)) });
  assert.ok(sans.includes('>80 ppb<') && sans.includes('>8 µg/m³<'), sans);
});

// ── R4 ──────────────────────────────────────────────────────────────────────

test('R4 — un capteur à état texte se dit comme une phrase, jamais en gros chiffres', () => {
  const ciel = rendre(RoomGenericCard, { id: 'sensor.ciel', hass: hassDe({ entity_id: 'sensor.ciel', state: 'partlycloudy', attributes: { friendly_name: 'Ciel' } }), onOpen: () => {} });
  assert.ok(ciel.includes('>Partiellement nuageux<') && !ciel.includes('partlycloudy'), 'un ciel, dans la langue de l’écran — ' + ciel);
  const brut = rendre(RoomGenericCard, { id: 'sensor.cycle', hass: hassDe({ entity_id: 'sensor.cycle', state: 'en_attente', attributes: { friendly_name: 'Cycle' } }), onOpen: () => {} });
  assert.ok(brut.includes('>en_attente<'), brut);
  /* Ni le coin chiffré (carte étroite), ni le chiffre à droite du nom (carte large) : le texte s'écrit UNE fois, sur la ligne
   * d'état — un nombre, lui, s'écrit deux fois, la feuille n'en montrant qu'un. */
  const fois = (h, t) => h.split('>' + t + '<').length - 1;
  assert.deepEqual([fois(brut, 'en_attente'), fois(ciel, 'Partiellement nuageux')], [1, 1]);
  const nombre = rendre(RoomGenericCard, { id: 'sensor.p', hass: hassDe({ entity_id: 'sensor.p', state: '12', attributes: { friendly_name: 'Pression', unit_of_measurement: 'hPa' } }), onOpen: () => {} });
  assert.ok(fois(nombre, '12') === 2, 'un nombre garde son coin et sa place à droite du nom — ' + nombre);
});

// ── I5 ──────────────────────────────────────────────────────────────────────

test('I5 — l’interrupteur simple a le minuteur de la fiche d’une lumière', async () => {
  const ID = 'switch.poele';
  const poses = [];
  let reponse = { maintenant: Date.now() / 1000, minuteurs: {} };
  const hass = (etat) => ({
    states: { [ID]: { entity_id: ID, state: etat, attributes: { friendly_name: 'Poêle' } } },
    callWS: (msg) => { if (msg.type !== 'loggia/minuteurs/etat') poses.push(msg); return Promise.resolve(reponse); },
  });
  const briques = { FicheRangee: () => null, FicheValeur: () => null, useSeconde: () => {} };
  const puces = (m) => { const b = []; parcourir(m.arbre, (e) => { if (e.type === 'button') b.push(e); }); return b; };
  const m = monter(RangeeMinuteur, { hass: hass('on'), id: ID, briques });
  try {
    await tours(); m.rendre();
    assert.deepEqual(puces(m).map(b => texteDe(b)), ['15 min', '30 min', '1 h', '2 h'], 'les quatre durées de la lumière');
    // Le serveur répond au « 1 h » par le minuteur posé.
    reponse = { maintenant: Date.now() / 1000, minuteurs: { [ID]: { fin: Date.now() / 1000 + 3600, duree: 60 } } };
    puces(m)[2].props.onClick();
    assert.deepEqual(poses, [{ type: 'loggia/minuteurs/poser', entity_id: ID, minutes: 60 }]);
    // Un minuteur qui tourne : « +15 min », « +1 h », « Annuler ».
    await tours(); m.rendre();
    assert.deepEqual(puces(m).map(b => texteDe(b)), ['+15 min', '+1 h', 'Annuler']);
    puces(m)[2].props.onClick();
    assert.deepEqual(poses[1], { type: 'loggia/minuteurs/annuler', entity_id: ID });
  } finally { m.demonter(); }
  // Éteint : les durées restent, inertes ; rien ne part.
  reponse = { maintenant: Date.now() / 1000, minuteurs: {} };
  const e = monter(RangeeMinuteur, { hass: hass('off'), id: ID, briques });
  try {
    await tours(); e.rendre();
    const inertes = puces(e);
    assert.ok(inertes.length === 4 && inertes.every(b => b.props['aria-disabled'] === true), 'inertes, éteint');
    inertes[0].props.onClick();
    assert.equal(poses.length, 2, 'un appareil éteint ne reçoit pas de minuteur');
  } finally { e.demonter(); }
});
