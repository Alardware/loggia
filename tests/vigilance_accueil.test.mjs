/* La vigilance sur l'Accueil (01/11, ADR 0310 ; lot 6 du rapport Gladys : W3).
 *
 *  - UNE lecture du niveau (attention.js, `lireVigilance`) : le widget, la popup, la carte Vigilance, les notifications, le point
 *    et le rail la lisent. Météo-France : l'état est le niveau, les attributs les phénomènes. MeteoAlarm : la couleur de
 *    `awareness_level`, sinon la gravité à SON échelle (Severe = orange, Extreme = rouge).
 *  - Le choix par défaut, réversible : le ROUGE est un point d'attention (un danger), l'ORANGE une ligne en tête d'« En ce
 *    moment », le jaune et le vert rien de plus qu'avant.
 *  - Une seule source : le capteur de la maison (`capteurVigilance`, Météo-France d'abord) — une alerte ne se dit pas deux fois.
 *  - Le composant reconnaît l'alerte départementale à son identifiant stable (« 18 Weather alert ») : le rôle `vigilance`.
 *  - La démo porte le cas : `?vigilance=orange|rouge`. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
const { lireVigilance, texteVigilance, vigilanceRail, pointsAttention, VIGILANCE_POINT, VIGILANCE_RAIL } = await import('../src/attention.js');
const { capteurVigilance, estVigilanceMeteoFrance } = await import('../src/vigilance.js');
const { maisonCapteursDemo, varianteVigilance } = await import('../src/demo.js');

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');

const MF = 'sensor.cher_weather_alert';
const MA = 'binary_sensor.meteoalarm';
const mf = (niveau, phenomenes = {}) => ({ state: niveau, attributes: { friendly_name: 'Alerte météo', attribution: 'Data provided by Météo-France', ...phenomenes } });
const ma = (etat, attrs = {}) => ({ state: etat, attributes: { friendly_name: 'MeteoAlarm', device_class: 'safety', attribution: 'Information provided by MeteoAlarm', ...attrs } });
const meteo = (pts) => pts.filter(p => p.cle.indexOf('meteo:') === 0);

test('la lecture de Météo-France : l’état est le niveau, le détail les phénomènes à ce niveau ; muette, rien', () => {
  assert.deepEqual(lireVigilance(MF, mf('Rouge', { 'Orages': 'Rouge', 'Vent violent': 'Orange', 'Canicule': 'Vert' })), { niveau: 'rouge', detail: 'Orages' });
  assert.deepEqual(lireVigilance(MF, mf('Orange', { 'Orages': 'Orange', 'Vent violent': 'Orange' })), { niveau: 'orange', detail: 'Orages, Vent violent' });
  assert.deepEqual(lireVigilance(MF, mf('Vert', { 'Orages': 'Vert' })), { niveau: 'vert', detail: null });
  assert.equal(lireVigilance(MF, mf('unavailable')), null);
  assert.equal(lireVigilance(MF, mf('12')), null, 'un état qui n’est pas un niveau');
});

test('la lecture de MeteoAlarm : la couleur d’abord, sinon la gravité à son échelle — Severe est l’orange, Extreme le rouge', () => {
  assert.equal(lireVigilance(MA, ma('on', { awareness_level: '3; orange; Severe', severity: 'Severe' })).niveau, 'orange');
  assert.equal(lireVigilance(MA, ma('on', { awareness_level: '4; red; Extreme', severity: 'Extreme' })).niveau, 'rouge');
  assert.equal(lireVigilance(MA, ma('on', { awareness_level: '2; yellow; Moderate', severity: 'Extreme' })).niveau, 'jaune', 'la couleur l’emporte');
  assert.deepEqual(['Minor', 'Moderate', 'Severe', 'Extreme', 'extreme'].map(g => lireVigilance(MA, ma('on', { severity: g })).niveau), ['vert', 'jaune', 'orange', 'rouge', 'rouge']);
  assert.deepEqual(lireVigilance(MA, ma('on', { event: 'Orages' })), { niveau: 'jaune', detail: 'Orages' }, 'allumée sans rien : le jaune, comme avant');
  assert.deepEqual(lireVigilance(MA, ma('off', { awareness_level: '1; green; Minor', event: 'Orages' })), { niveau: 'vert', detail: null }, 'au calme, pas d’événement');
  assert.equal(lireVigilance(MA, ma('off')), null, 'éteinte, sans niveau');
  assert.equal(lireVigilance(MA, ma('off', { event: 'Orages', severity: 'Extreme' })), null, 'éteinte : pas d’alerte, quoi qu’il reste en attributs');
});

test('la phrase : la couleur et le phénomène ; un événement qui dit la vigilance ne la redit pas', () => {
  assert.equal(texteVigilance({ niveau: 'rouge', detail: 'Orages' }), 'Vigilance rouge · Orages');
  assert.equal(texteVigilance({ niveau: 'orange', detail: null }), 'Vigilance orange');
  assert.equal(texteVigilance({ niveau: 'jaune', detail: 'Vigilance jaune orages' }), 'Vigilance jaune orages');
  assert.equal(texteVigilance(null), null);
});

test('le choix par défaut : rouge, un point ; orange, le rail', () => {
  assert.deepEqual([VIGILANCE_POINT, VIGILANCE_RAIL], ['rouge', 'orange']);
});

test('Météo-France rouge : UN point, un danger, « Vigilance rouge » et le phénomène, vers Sécurité', () => {
  const S = { [MF]: mf('Rouge', { 'Orages': 'Rouge', 'Vent violent': 'Jaune' }) };
  assert.deepEqual(pointsAttention({ S, vigilance: MF }), [{ cle: 'meteo:' + MF, niveau: 'danger', icone: 'umbrella', titre: 'Vigilance rouge', sous: 'Orages', vue: 'securite', haid: MF }]);
  assert.deepEqual(pointsAttention({ S: { [MF]: mf('Rouge') }, vigilance: MF })[0].sous, 'Alerte météo en cours', 'sans phénomène nommé');
});

test('Météo-France orange, jaune, vert, muette : aucun point', () => {
  for (const niveau of ['Orange', 'Jaune', 'Vert', 'unavailable']) {
    assert.deepEqual(pointsAttention({ S: { [MF]: mf(niveau, { 'Orages': niveau }) }, vigilance: MF }), [], niveau);
  }
});

test('MeteoAlarm : rouge, un point ; orange et jaune, aucun ; vert, rien', () => {
  const pts = (attrs) => meteo(pointsAttention({ S: { [MA]: ma('on', attrs) } }));
  assert.deepEqual(pts({ awareness_level: '4; red; Extreme', event: 'Orages' }).map(p => [p.niveau, p.titre, p.sous]), [['danger', 'Vigilance rouge', 'Orages']]);
  assert.deepEqual(pts({ awareness_level: '3; orange; Severe', severity: 'Severe', event: 'Orages' }), [], 'orange : le rail');
  assert.deepEqual(pts({ awareness_level: '2; yellow; Moderate', event: 'Orages' }), [], 'jaune : plus de point');
  assert.deepEqual(pointsAttention({ S: { [MA]: ma('on', { awareness_level: '1; green; Minor' }) } }), [], 'vert : ni vigilance ni capteur de sécurité');
});

test('une seule source : le capteur de la maison — Météo-France d’abord ; MeteoAlarm n’est pas redite', () => {
  const S = { [MF]: mf('Rouge', { 'Orages': 'Rouge' }), [MA]: ma('on', { awareness_level: '4; red; Extreme', event: 'Thunderstorm' }) };
  const id = capteurVigilance(S);
  assert.equal(id, MF);
  assert.deepEqual(meteo(pointsAttention({ S, vigilance: id })).map(p => p.cle), ['meteo:' + MF]);
  assert.deepEqual(meteo(pointsAttention({ S, vigilance: null })), [], 'la maison n’a pas de vigilance : aucune lecture de plus');
  // Sans ce morceau du contexte (un appelant qui ne le passe pas), chaque binaire MeteoAlarm est lu, comme avant.
  assert.deepEqual(meteo(pointsAttention({ S })).map(p => p.cle), ['meteo:' + MA]);
  // Une vigilance masquée ne se dit pas.
  assert.deepEqual(meteo(pointsAttention({ S, vigilance: MF, masque: (x) => x === MF })), []);
});

test('le rail : l’orange seulement — « Vigilance orange » et le phénomène ; rien au rouge, au jaune, sans capteur', () => {
  assert.deepEqual(vigilanceRail({ [MF]: mf('Orange', { 'Orages': 'Orange', 'Canicule': 'Jaune' }) }, MF), { cle: 'vigilance:' + MF, titre: 'Vigilance orange', sous: 'Orages', haid: MF });
  assert.deepEqual(vigilanceRail({ [MA]: ma('on', { awareness_level: '3; orange; Severe' }) }, MA).sous, 'Alerte météo en cours');
  assert.equal(vigilanceRail({ [MA]: ma('on', { severity: 'Severe', event: 'Vent violent' }) }, MA).sous, 'Vent violent', 'Severe sans couleur : l’orange');
  for (const niveau of ['Rouge', 'Jaune', 'Vert', 'unavailable']) assert.equal(vigilanceRail({ [MF]: mf(niveau) }, MF), null, niveau);
  assert.equal(vigilanceRail({ [MF]: mf('Orange') }, null), null);
  assert.equal(vigilanceRail(null, MF), null);
});

test('la reconnaissance par clé : le rôle `vigilance` de l’index suffit, quel que soit l’identifiant', () => {
  assert.ok(estVigilanceMeteoFrance('sensor.alerte_du_departement', { state: 'Orange' }, { platform: 'meteo_france', meteo: 'vigilance' }));
  assert.ok(!estVigilanceMeteoFrance('sensor.alerte_du_departement', { state: 'Orange' }, { platform: 'meteo_france', meteo: 'pluie' }));
  assert.ok(!estVigilanceMeteoFrance('binary_sensor.alerte', { state: 'on' }, { meteo: 'vigilance' }), 'un capteur seulement');
});

test('l’Accueil : la vigilance de la maison au point d’attention ; l’orange en tête d’« En ce moment », qui ouvre la fiche météo', () => {
  const src = lire('src', 'accueil', 'dashboard.jsx');
  assert.ok(src.includes('vigilance: capteurVigilance(etatsAcc, LOGGIA_INDEX),'), 'le point lit le capteur du widget');
  const debut = src.indexOf('const momentRows = [];');
  const bloc = src.slice(debut, src.indexOf('/* Un lecteur en lecture', debut));
  assert.ok(bloc.includes('const vig = vigilanceRail(S0, vigId);') && bloc.includes('const vigId = capteurVigilance(S0, LOGGIA_INDEX);'), 'la ligne, avant les lecteurs');
  assert.ok(bloc.includes('if (vig) momentRows.push(<LigneMoment key={vig.cle} icone="umbrella" rgb="var(--o-warn2-rgb)" nom={vig.titre} sous={vig.sous}'), 'la ligne orange');
  assert.ok(bloc.includes('onOpen={() => dc.ouvrir(weatherEntity(dashHass) || vig.haid)} fiche />'), 'elle ouvre la fiche météo');
  // Le widget, la popup et les notifications lisent le même capteur et le même niveau.
  assert.ok(lire('src', 'cartemeteo.jsx').includes('vigilanceWidget(S, capteurVigilance(S, LOGGIA_INDEX))'));
  assert.ok(lire('src', 'fichemeteo.jsx').includes('const capteur = capteurVigilance(S, LOGGIA_INDEX);'));
  assert.ok(lire('src', 'app', 'derive.jsx').includes("const grave = (lireVigilance(id, e) || {}).niveau === 'rouge';"));
  for (const f of [['src', 'meteo.js'], ['src', 'vigilance.js'], ['src', 'app', 'derive.jsx']]) {
    assert.ok(!/a\.severity === 'Severe'/.test(lire(...f)), f.join('/') + ' : plus de copie de la règle');
  }
});

test('la démo porte le cas : `?vigilance=orange` met la ligne au rail, `?vigilance=rouge` le point', () => {
  const orange = maisonCapteursDemo({ quand: Date.UTC(2026, 10, 1, 13, 30) }).states;
  varianteVigilance(orange, 'orange');
  const id = capteurVigilance(orange);
  assert.equal(id, 'sensor.paris_weather_alert');
  assert.deepEqual([vigilanceRail(orange, id).titre, vigilanceRail(orange, id).sous], ['Vigilance orange', 'Orages']);
  assert.deepEqual(meteo(pointsAttention({ S: orange, vigilance: id })), []);
  const rouge = maisonCapteursDemo({ quand: Date.UTC(2026, 10, 1, 13, 30) }).states;
  varianteVigilance(rouge, 'rouge');
  assert.deepEqual(meteo(pointsAttention({ S: rouge, vigilance: id })).map(p => [p.titre, p.sous, p.niveau]), [['Vigilance rouge', 'Orages', 'danger']]);
  assert.equal(vigilanceRail(rouge, id), null);
  const calme = maisonCapteursDemo({ quand: Date.UTC(2026, 10, 1, 13, 30) }).states;
  varianteVigilance(calme, 'violette');
  assert.equal(calme[id].state, 'Jaune', 'une variante inconnue ne change rien');
  const demo = lire('src', 'demo.js');
  assert.ok(demo.includes("if (Object.prototype.hasOwnProperty.call(VARIANTES_VIGILANCE, q.get('vigilance'))) VARIANTE_VIGILANCE = q.get('vigilance');"));
  assert.ok(demo.includes('\n  varianteVigilance(states, VARIANTE_VIGILANCE);\n'), 'la maison de la démo la reçoit');
});
