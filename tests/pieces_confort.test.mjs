// La barre de confort des pieces (17/09, ADR 0039) : elle remplace les
// reglages rapides (luminosite, couleur, volets) par un indice sur 100 et une
// pastille par mesure que la piece possede — et rien qui s'affiche sans capteur.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/* La langue de la machine ne doit rien changer : « 21,4 °C » s'ecrit « 21.4 °C »
 * sur un runner anglais. Fixee AVANT le premier import (voir systeme_hoas). */
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
const { MESURES_CONFORT, verdictMesure, scoreMesure, valeurConfort, verdictIndice, indiceConfort, capteurBruit } = await import('../src/confort.js');

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const app = lire('src', 'App.jsx');
const barre = lire('src', 'barreconfort.jsx');
const pur = lire('src', 'confort.js');
const css = lire('src', 'index.css');
const demo = lire('src', 'demo.js');
const en = lire('src', 'langues', 'en.js');
const police = lire('public', 'fonts', 'uicons-regular-rounded.css');
const NL = String.fromCharCode(10);
const bloc = (debut, fin) => { const d = app.indexOf(debut); assert.ok(d >= 0, debut + ' introuvable'); const f = app.indexOf(fin, d + 1); return app.slice(d, f < 0 ? undefined : f); };
const e = (state, attributes = {}) => ({ state: String(state), attributes });
const mot = (cle, v) => verdictMesure(cle, v).t;

test('les paliers sont CEUX des captures du 19/09, borne par borne', () => {
  // « Les valeurs sont inscrites sur les photos » : 15 · 17 · 23 · 26 · 29 °C,
  // 15 · 30 · 40 · 50 · 60 · 70 · 80 %, 900 · 1150 · 1400 · 1600 ppm,
  // 50 · 65 · 70 · 80 dB. Le bleu est l'ideal ; les bornes hautes de
  // l'ideal et au-dela sont incluses.
  assert.deepEqual([14.9, 15, 15.9, 16, 16.9, 17, 17.9, 18, 23, 23.1, 26, 26.1, 27, 27.1, 29, 29.1].map(v => mot('temp', v)),
    ['Trop froid', 'Froid', 'Froid', 'Frais', 'Frais', 'Bon', 'Bon', 'Idéal', 'Idéal', 'Bon', 'Bon', 'Un peu chaud', 'Un peu chaud', 'Chaud', 'Chaud', 'Trop chaud']);
  assert.deepEqual([14.9, 15, 19.9, 20, 29.9, 30, 39.9, 40, 50, 50.1, 60, 60.1, 70, 70.1, 80, 80.1].map(v => mot('hum', v)),
    ['Très sec', 'Trop sec', 'Trop sec', 'Sec', 'Sec', 'Bon', 'Bon', 'Idéal', 'Idéal', 'Bon', 'Bon', 'Humide', 'Humide', 'Trop humide', 'Trop humide', 'Très humide']);
  assert.deepEqual([899, 900, 1149, 1150, 1399, 1400, 1599, 1600, 2000].map(v => mot('co2', v)),
    ['Excellent', 'Bon', 'Bon', 'Moyen', 'Moyen', 'Élevé', 'Élevé', 'Confiné', 'Confiné']);
  assert.deepEqual([49.9, 50, 64.9, 65, 69.9, 70, 79.9, 80, 95].map(v => mot('bruit', v)),
    ['Calme', 'Modéré', 'Modéré', 'Animé', 'Animé', 'Bruyant', 'Bruyant', 'Très bruyant', 'Très bruyant']);
  // Les couleurs des captures, en jetons du theme : bleu, vert, jaune, orange, rouge.
  assert.deepEqual(verdictMesure('temp', 14), { t: 'Trop froid', c: 'var(--o-bad)' });
  assert.deepEqual(verdictMesure('temp', 15.5), { t: 'Froid', c: 'var(--o-warn2)' });
  assert.deepEqual(verdictMesure('temp', 16.5), { t: 'Frais', c: 'var(--o-warn)' });
  assert.deepEqual(verdictMesure('temp', 17.5), { t: 'Bon', c: 'var(--o-ok)' });
  assert.deepEqual(verdictMesure('temp', 21), { t: 'Idéal', c: 'var(--o-cold)' });
  assert.deepEqual(verdictMesure('hum', 10), { t: 'Très sec', c: 'var(--o-bad)' });
  assert.deepEqual(verdictMesure('hum', 25), { t: 'Sec', c: 'var(--o-warn)' });
  assert.deepEqual(verdictMesure('co2', 2000), { t: 'Confiné', c: 'var(--o-bad)' });
  assert.deepEqual(verdictMesure('bruit', 34), { t: 'Calme', c: 'var(--o-cold)' });
  assert.deepEqual(verdictMesure('co2', '612'), { t: 'Excellent', c: 'var(--o-cold)' }, 'un etat est une chaine');
  assert.equal(verdictMesure('temp', null), null);
  assert.equal(verdictMesure('temp', ''), null);
  assert.equal(verdictMesure('temp', 'unknown'), null);
  assert.equal(verdictMesure('lumiere', 300), null, 'une mesure inconnue n’a pas de verdict');
});

test('la fiche de confort lit la meme table : ses verdicts sont delegues', () => {
  const table = bloc('const COMFORT = {', NL + '};');
  for (const cle of ['temp', 'hum', 'co2', 'bruit']) assert.ok(table.includes("verdict: v => verdictMesure('" + cle + "', v) }"), cle + ' : verdict delegue');
  assert.ok(!/verdict: v => v </.test(table), 'plus aucun seuil ecrit dans la fiche : une seule table, confort.js');
  assert.ok(table.includes("bruit: { key: 'bruit', label: tr('Bruit'), ico: 'volume', ...echelleFiche('bruit'),"), 'le bruit a sa barre dans la fiche');
  // La barre de la fiche : l'echelle des jauges des cartes (19/09).
  assert.ok(app.includes('const e = echelleMesure(cle);') && app.includes("return { min: e.de, max: e.a, grad: 'linear-gradient(90deg,' + e.bandes.map(b => b.c + ' ' + b.de + '% ' + b.a + '%').join(',') + ')',"), 'bornes, couleurs et reperes des cartes');
  assert.ok(app.includes("import { indiceConfort, verdictMesure, capteurBruit, echelleMesure, jaugeMesure, cleMesure, barresPile } from './confort.js';"));
});

test('la note d’une mesure : 100 sur le plateau de l’idéal, puis une pente entre les ancrages', () => {
  assert.deepEqual([21, 18, 23, 24, 26, 10, 15, 29, 40].map(v => scoreMesure('temp', v)), [100, 100, 100, 90, 70, 0, 25, 25, 0]);
  assert.deepEqual([45, 40, 50, 55, 35, 10, 0, 100, 65].map(v => scoreMesure('hum', v)), [100, 100, 100, 85, 85, 13, 0, 0, 58]);
  assert.deepEqual([300, 400, 900, 1000, 1280, 1500, 2000, 5000].map(v => scoreMesure('co2', v)), [100, 100, 100, 92, 67, 43, 10, 0]);
  assert.deepEqual([0, 34, 50, 57.5, 70, 200].map(v => scoreMesure('bruit', v)), [100, 100, 100, 85, 55, 0]);
  assert.equal(scoreMesure('temp', null), null);
  assert.equal(scoreMesure('lumiere', 3), null);
});

test('les valeurs se disent avec leur unite', () => {
  assert.equal(valeurConfort('temp', 21.44), '21,4 °C');
  assert.equal(valeurConfort('temp', 21), '21 °C', 'pas de « ,0 »');
  assert.equal(valeurConfort('hum', 46.6), '47 %');
  assert.match(valeurConfort('co2', 1280), /^1[\s\u202f\u00a0]280 ppm$/, 'le separateur de milliers est une espace fine');
  assert.equal(valeurConfort('co2', 612), '612 ppm');
  assert.equal(valeurConfort('bruit', 34.4), '34 dB');
  assert.equal(valeurConfort('temp', null), null);
  assert.equal(valeurConfort('lumiere', 3), null);
});

test('l’indice : la moyenne des notes, tiree vers le bas par la pire', () => {
  assert.deepEqual(MESURES_CONFORT, ['temp', 'hum', 'co2', 'bruit']);
  const tout = indiceConfort({ temp: 21.4, hum: 47, co2: 612, bruit: 34 });
  assert.equal(tout.indice, 100);
  assert.deepEqual(tout.verdict, { t: 'Confortable', c: 'var(--o-ok)' });
  assert.deepEqual(tout.mesures.map(m => [m.cle, m.nom, m.icone, m.valeur, m.verdict.t, m.score]), [
    ['temp', 'Température', 'thermometer-half', '21,4 °C', 'Idéal', 100], ['hum', 'Humidité', 'humidity', '47 %', 'Idéal', 100],
    ['co2', 'CO₂', 'wind', '612 ppm', 'Excellent', 100], ['bruit', 'Bruit', 'volume', '34 dB', 'Calme', 100],
  ]);
  // Une chambre a l'air moyen : 100, 100 et 67 → moyenne 89, pire 67 → 78.
  const chambre = indiceConfort({ temp: 19.6, hum: 49, co2: 1280 });
  assert.equal(chambre.indice, 78);
  assert.deepEqual(chambre.verdict, { t: 'Correct', c: 'var(--o-accent-soft)' });
  assert.deepEqual(chambre.mesures.map(m => m.cle), ['temp', 'hum', 'co2'], 'pas de sonometre : pas de pastille Bruit');
  // 21 °C, mais un air tres sec et confine : la moyenne seule dirait 55.
  assert.equal(indiceConfort({ temp: 21, hum: 10, co2: 2000, bruit: 34 }).indice, 33);
  assert.equal(indiceConfort({ temp: 21, hum: 10, co2: 2000, bruit: 34 }).verdict.t, 'À améliorer');
  assert.equal(indiceConfort({ co2: 1280 }).indice, 67, 'une seule mesure : sa note');
  assert.deepEqual(indiceConfort({ bruit: 34, temp: 21 }).mesures.map(m => m.cle), ['temp', 'bruit'], 'toujours dans le meme ordre');
  assert.equal(indiceConfort({ temp: null, hum: undefined, co2: '', bruit: NaN }), null, 'sans mesure, pas d’indice');
  assert.equal(indiceConfort({}), null);
  assert.equal(indiceConfort(null), null);
  assert.deepEqual([100, 80, 79, 60, 59, 40, 39, 20, 19, 0].map(n => verdictIndice(n).t),
    ['Confortable', 'Confortable', 'Correct', 'Correct', 'Acceptable', 'Acceptable', 'À améliorer', 'À améliorer', 'Inconfortable', 'Inconfortable']);
  assert.deepEqual([90, 70, 50, 30, 10].map(n => verdictIndice(n).c), ['var(--o-ok)', 'var(--o-accent-soft)', 'var(--o-warn)', 'var(--o-warn2)', 'var(--o-bad)']);
  assert.equal(verdictIndice(null), null);
});

test('le sonometre se reconnait a sa device_class — jamais a son unite', () => {
  const S = {
    'sensor.routeur_signal': e(-52, { unit_of_measurement: 'dB', device_class: 'signal_strength' }),
    'number.salon_bruit_seuil': e(40, { unit_of_measurement: 'dB', device_class: 'sound_pressure' }),
    'sensor.salon_bruit_hs': e('unavailable', { unit_of_measurement: 'dB', device_class: 'sound_pressure' }),
    'sensor.salon_bruit': e(34, { unit_of_measurement: 'dB', device_class: 'sound_pressure' }),
    'sensor.salon_temperature': e(21, { unit_of_measurement: '°C', device_class: 'temperature' }),
  };
  assert.equal(capteurBruit(Object.keys(S), S), 'sensor.salon_bruit', 'ni la force du Wi-Fi, ni un reglage, ni un capteur indisponible');
  assert.equal(capteurBruit(['sensor.routeur_signal', 'sensor.salon_temperature'], S), null);
  assert.equal(capteurBruit(['sensor.absent'], S), null);
  assert.equal(capteurBruit(null, S), null);
  assert.equal(capteurBruit(['sensor.salon_bruit'], null), null);
});

test('la vue d’une piece : la barre de confort a la place des reglages rapides', () => {
  const vue = bloc('function RoomView(', NL + '}');
  assert.ok(vue.includes('{confortPiece && <BarreConfort confort={confortPiece} onOpen={onOpenComfort} />}'), 'la barre, et la fiche de confort d’un tap');
  assert.ok(vue.includes('const confortPiece = indiceConfort({ temp: live && live.temp, hum: live && live.hum, co2: live && live.co2, bruit: bruitId ? parseFloat(S[bruitId].state) : null });'), 'les mesures de la piece, et son sonometre');
  assert.ok(vue.includes('const bruitId = capteurBruitPiece(S, room);') && vue.includes('<RoomComfortModal piece={piece} hass={hass} bruitId={bruitId}'), 'le bruit va aussi dans la fiche');
  for (const ancien of ['setGroupBri', 'setGroupColor', 'toggleCovers', 'coverPct', 'LIGHT_PALETTE', 'className="o-bar"', "tr('Luminosité')", 'o-barlabel']) assert.ok(!vue.includes(ancien), ancien + ' : les reglages rapides ont quitte la vue');
  assert.ok(vue.includes("? tr('{n} lampes allumées', { n: lightsOn.length })"), 'l’en-tete garde son compte de lampes');
  assert.ok(!css.includes('.o-barlabel'), 'la regle de l’ancienne barre est partie avec elle');
  const zone = bloc('function capteurBruitPiece(S, roomName) {', NL + '}');
  assert.ok(zone.includes('find(z => rmNorm(z.name) === cible)') && zone.includes('return zone ? capteurBruit(zone.entities, S) : null;'), 'le sonometre se cherche dans la ZONE Home Assistant de la piece');
  assert.ok(app.includes('capteurBruitPiece((getHass() || {}).states, activeRoom)].filter(Boolean) : [];'), 'et il est relu en direct quand la piece est ouverte');
  const fiche = bloc('function RoomComfortModal(', NL + '}');
  assert.ok(fiche.includes('const confort = indiceConfort(vals);') && fiche.includes("const overall = confort ? confort.verdict : { t: '—', c: 'var(--o-text2)' };") && fiche.includes("{tr('Indice de confort')} · {confort.indice} / 100"), 'la fiche dit le meme mot que la barre');
  assert.ok(fiche.includes('const metrics = [COMFORT.temp, COMFORT.hum, COMFORT.co2, COMFORT.bruit].filter(m => vals[m.key] != null);'));
});

test('la barre : l’indice et son anneau, un filet, une pastille par mesure', () => {
  const ordre = ['className="o-confort-anneau"', '<Fi i="leaf"', "{tr('INDICE DE CONFORT')}", '<span className="n">{indice}</span>', '<span className="sur">/ 100</span>', '{verdict.t}</span>', 'className="o-confort-sep"', '{mesures.map(m => (', '<Fi i={m.icone} size={15} />', '{m.nom}</div>', '{m.valeur}</span>', 'className="pt"', '{m.verdict.t}</span>'];
  let curseur = -1;
  for (const morceau of ordre) { const i = barre.indexOf(morceau); assert.ok(i > curseur, morceau + ' n’est pas a sa place'); curseur = i; }
  assert.ok(barre.includes('if (!confort) return null;'), 'sans mesure, pas de barre');
  assert.ok(barre.includes('strokeDashoffset={TOUR * (1 - Math.max(0, Math.min(100, indice)) / 100)}') && barre.includes('stroke={verdict.c}'), 'l’anneau se remplit a hauteur de l’indice, a la couleur du verdict');
  assert.ok(barre.includes("background: 'rgba(' + cl_hexRgb(m.verdict.c) + ',.16)', color: m.verdict.c"), 'chaque pastille prend la couleur de SON verdict');
  assert.ok(barre.includes('role="button" tabIndex={0} aria-label={tr(\'Historique du confort\')}') && barre.includes("if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); }"), 'au clavier comme au doigt');
  assert.ok(barre.includes("style={{ '--conf-n': mesures.length }}"));
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(barre), 'aucune couleur en dur');
});

test('au telephone la rangee de mesures reste sur UNE ligne', () => {
  assert.ok(css.includes('.o-confort { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: var(--o-radius,18px); background: var(--o-surfA); border: var(--o-bw,1px) solid var(--o-bd2);'), 'la surface et la marge de la barre des scenarios');
  const tablette = css.slice(css.indexOf('@media (max-width: 900px) {' + NL + '  .o-confort {'));
  assert.ok(tablette.includes('.o-confort-mesures { display: grid; grid-template-columns: repeat(var(--conf-n, 4), minmax(0, 1fr)); gap: 8px; }'), 'autant de colonnes que de mesures');
  const tel = css.slice(css.indexOf('@media (max-width: 560px) {' + NL + '  .o-confort {'));
  assert.ok(tel.includes('.o-confort-mesure { flex-direction: column; align-items: flex-start;') && tel.includes('.o-confort-nom { display: none; }'), 'l’icone au-dessus, le nom s’efface');
  assert.ok(!tel.slice(0, tel.indexOf(NL + '}')).includes('grid-template-columns'), 'jamais deux colonnes forcees');
});

test('les icones existent, la demo a un sonometre, et l’anglais suit', () => {
  for (const m of pur.matchAll(/icone: '([a-z0-9-]+)'/g)) assert.ok(police.includes('.fi-rr-' + m[1] + ':before'), m[1] + ' n’existe pas dans la police');
  assert.ok(police.includes('.fi-rr-leaf:before'));
  assert.ok(demo.includes("'sensor.salon_bruit': s(34, { friendly_name: 'Salon Bruit', unit_of_measurement: 'dB', device_class: 'sound_pressure' }),") && demo.includes("'sensor.salon_humidite', 'sensor.salon_co2', 'sensor.salon_bruit', 'cover.salon',"), 'dans la zone du salon');
  for (const k of ['INDICE DE CONFORT', 'Indice de confort', 'Confortable', 'Correct', 'Acceptable', 'À améliorer', 'Inconfortable', 'Trop froid', 'Frais', 'Idéal', 'Un peu chaud', 'Trop chaud', 'Très chaud',
    'Trop sec', 'Bon', 'Humide', 'Trop humide', 'Excellent', 'Moyen', 'Élevé', 'Confiné', 'Calme', 'Animé', 'Bruyant', 'Très bruyant', 'Froid', 'Chaud', 'Sec', 'Très sec', 'Très humide', 'Modéré', 'Bruit', 'Température', 'Humidité', 'Historique du confort', 'Niveau sonore élevé dans la pièce.']) {
    assert.ok(en.includes("'" + k + "':"), k + ' manque a en.js');
  }
});

test('la barre a la hauteur de celle des scenarios (retour du 18/09)', () => {
  // La barre des scenarios : 10 px de marge, des groupes de 37 px sur une
  // rangee. La barre de confort suit : anneau de 34 px, pastilles de 36 px —
  // le nom reste au-dessus de la valeur, sinon quatre mesures debordent.
  assert.ok(css.includes('.o-confort-anneau { position: relative; width: 34px; height: 34px;'), 'l’anneau grossit de nouveau');
  assert.ok(css.includes('.o-confort-anneau svg { position: absolute; inset: 0; width: 100%; height: 100%; }'), 'le dessin de l’anneau ne suit plus sa boite');
  assert.ok(css.includes('.o-confort-mesure { display: flex; align-items: center; gap: 9px; padding: 4px 12px 4px 5px; border-radius: 10px;'));
  assert.ok(css.includes('.o-confort-ico { width: 27px; height: 27px;'));
  assert.ok(css.includes('.o-confort-nom { font-size: 10.5px; line-height: 1.15;') && css.includes('.o-confort-val { display: flex; align-items: center; gap: 6px; margin-top: 1px; font-size: 12.5px; line-height: 1.2;'), 'le nom au-dessus de la valeur, en petit');
});
