// ─────────────────────────────────────────────────────────────────────────────
// Toute ligne à verdict cède son libellé, jamais son verdict (lot 16, 05/10).
//
// La suite « co2_ligne » avait fait céder le libellé de la SEULE carte CO₂.
// La température, l'humidité et le bruit gardaient l'ancienne ligne, une seule
// chaîne à ellipse : c'est le MOT DU PALIER qui tombait. Mesuré dans la
// démonstration (vue Objets, 28 vrais capteurs semés un par palier, cartes
// standard), en pixels coupés au bout de la ligne :
//   • 360 px (carte 161) : « Température · TROP FROID » 23, « UN PEU CHAUD »
//     41, « TROP CHAUD » 30, « Humidité · TROP HUMIDE » 13, « TRÈS HUMIDE »
//     11 — en français ; « Temperatuur · EEN BEETJE WARM » 59, « Rumore ·
//     MOLTO RUMOROSO » 37, « Wilgotność · BARDZO WILGOTNO » 59 ;
//   • lignes coupées sur 28, dans les sept langues : 1 à 6 à 390 px, 2 à 9
//     à 375, 4 à 13 à 360, 12 à 20 à 320 px (au sous-pixel près). Après :
//     aucune à 390 et 375 ; à 320, seuls des verdicts plus larges que TOUTE
//     la ligne s'ellipsent encore (le repli de la rangée du CO₂).
// La mise en page cède, pas les mots : la MÊME rangée que le CO₂, pour toute
// mesure à verdict. Le nom accessible ne change pas (`subLu`), ni la ligne
// des cartes sans verdict.
//
// On REND la carte (React côté serveur, ADR 0069) : un crochet de chargement
// ajoute à App.jsx, pour CE test seul, l'export de `RoomGenericCard` sous
// `?l16vl` — le fichier n'est pas touché.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}

const EXPOSE = 'data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?l16vl')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -6), ctx);",
  "  return { ...r, source: String(r.source) + ';export { RoomGenericCard as __RoomGenericCard };' };",
  '}',
].join('\n'));
register('./jsx-hooks.mjs', import.meta.url);
register(EXPOSE);
const { __RoomGenericCard: RoomGenericCard } = await import(new URL('../src/App.jsx?l16vl', import.meta.url).href);

const NL = String.fromCharCode(10);
const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
function fonction(nom) {
  const d = APP.indexOf(NL + 'function ' + nom + '(');
  assert.ok(d >= 0, nom + ' introuvable');
  return APP.slice(d, APP.indexOf(NL + '}' + NL, d) + 2);
}

const capteur = (id, v, dc, unite, nom) => ({ entity_id: id, state: String(v), last_changed: '2026-10-05T08:00:00Z', attributes: { friendly_name: nom, device_class: dc, unit_of_measurement: unite } });
const carte = (st) => renderToStaticMarkup(createElement(RoomGenericCard, {
  id: st.entity_id, hass: { states: { [st.entity_id]: st }, config: { unit_system: { temperature: '°C' } }, callService: () => {} }, onOpen: () => {},
}));
/* La ligne d'état : le premier `div` après celui du nom. */
const ligneDe = (html, nom) => {
  const i = html.indexOf('>' + nom + '</div>');
  assert.ok(i > 0, 'le nom « ' + nom + ' » n’est pas rendu');
  const d = html.indexOf('<div', i);
  return html.slice(d, html.indexOf('</div>', d) + 6);
};
const RANGEE = /^<div style="[^"]*display:flex"><span style="min-width:0;overflow:hidden;text-overflow:ellipsis">([^<]+)<\/span><span style="flex-shrink:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:pre">([^<]+)<\/span><\/div>$/;

/* Un palier coupé de chaque mesure (relevés ci-dessus), et le CO₂ qui l'avait déjà. */
const CAS = [
  [capteur('sensor.cuisine_temperature', 30, 'temperature', '°C', 'Cuisine température'), 'Température', 'TROP CHAUD', 'Température · Trop chaud'],
  [capteur('sensor.cuisine_temperature', 26.5, 'temperature', '°C', 'Cuisine température'), 'Température', 'UN PEU CHAUD', 'Température · Un peu chaud'],
  [capteur('sensor.cuisine_humidite', 75, 'humidity', '%', 'Cuisine humidité'), 'Humidité', 'TROP HUMIDE', 'Humidité · Trop humide'],
  [capteur('sensor.salon_bruit', 85, 'sound_pressure', 'dB', 'Salon bruit'), 'Bruit', 'TRÈS BRUYANT', 'Bruit · Très bruyant'],
  [capteur('sensor.salon_co2', 1700, 'carbon_dioxide', 'ppm', 'Salon CO2'), 'Qualité d’air', 'CONFINÉ', 'Qualité d’air · Confiné'],
];

test('toute mesure à verdict : le libellé se réduit, le verdict garde sa largeur', () => {
  for (const [st, lib, mot] of CAS) {
    const ligne = ligneDe(carte(st), st.attributes.friendly_name);
    const m = RANGEE.exec(ligne);
    assert.ok(m, st.attributes.device_class + ' : la ligne n’est pas la rangée libellé + verdict — ' + ligne);
    // Le libellé d'abord, le verdict ensuite (séparateur compris) : l'ordre
    // de lecture ne change pas, seul le libellé cède.
    assert.equal(m[1], lib, st.attributes.device_class);
    assert.equal(m[2], ' · ' + mot, st.attributes.device_class);
  }
});

test('le nom accessible ne change pas, ni la ligne des cartes sans verdict', () => {
  for (const [st, , , lu] of CAS) {
    assert.ok(carte(st).includes('aria-label="' + st.attributes.friendly_name + ', '), 'la surface a perdu son nom');
    assert.ok(carte(st).includes(', ' + lu + '"'), st.attributes.device_class + ' : le nom lu a changé');
  }
  // Une mesure sans table de confort (une puissance) : la ligne d'avant, un
  // seul texte.
  const ligne = ligneDe(carte(capteur('sensor.four', 1250, 'power', 'W', 'Four')), 'Four');
  assert.ok(!ligne.includes('display:flex') && !ligne.includes('<span'), 'une carte sans verdict a changé de ligne — ' + ligne);
  assert.ok(ligne.endsWith('>Puissance</div>'), ligne);
});

test('une seule rangée dans la carte : la même que le CO₂, pas une copie', () => {
  const f = fonction('RoomGenericCard');
  assert.equal(f.split("display: 'flex' }}><span style={{ minWidth: 0,").length - 1, 1, 'la rangée est écrite plus d’une fois');
  // Posée pour toute mesure que la table de confort connaît, pas pour le seul CO₂.
  const i = f.indexOf('ligneVerdict = [libMesure, jauge.verdict.t.toLocaleUpperCase(locale())];');
  assert.ok(i > 0, 'la carte ne garde pas libellé et verdict à part');
  const avant = f.slice(f.lastIndexOf(NL, i), i);
  assert.ok(!/if \(/.test(avant), 'la rangée dépend encore d’une condition : ' + avant.trim());
  assert.ok(!f.includes('ligneAir'), 'l’ancien nom, propre au CO₂, est resté');
});
