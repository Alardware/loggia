/* La table des mesures (chantier Capteurs, § 6 ; C3, C5, C8) : src/confort.js, pur.
 *
 * UNE SEULE TABLE : les quatre familles d'avant gardent leurs bornes, leurs
 * mots et leurs couleurs (C3) ; la luminosité, les particules, les COV et le
 * vent arrivent avec les mots de sa maquette « Cartes capteurs ». Ce qui est
 * « bon » (C5) : le bleu et le vert de la table, et toute la luminosité. La
 * barre d'une carte et sa phrase (C8) se lisent ici, et ce que la table juge
 * dehors (C15) : le vent et les particules.
 *
 * En français, fixé avant le premier import (la règle de la CI). */
import { test } from 'node:test';
import assert from 'node:assert/strict';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
const C = await import('../src/confort.js');
const U = await import('../src/unites.js');

const NBSP = '\u00a0';
const mot = (cle, v) => C.zoneMesure(cle, v).t;

test('les quatre familles d’avant ne bougent pas : bornes, mots, couleurs', () => {
  assert.deepEqual([14.9, 15, 17.9, 18, 23, 23.1, 26, 29, 29.1].map(v => mot('temp', v)),
    ['Trop froid', 'Froid', 'Bon', 'Idéal', 'Idéal', 'Bon', 'Bon', 'Chaud', 'Trop chaud']);
  assert.deepEqual([14, 29.9, 30, 50, 70, 81].map(v => mot('hum', v)), ['Très sec', 'Sec', 'Bon', 'Idéal', 'Humide', 'Très humide']);
  assert.deepEqual([899, 900, 1149, 1150, 1399, 1400, 1600].map(v => mot('co2', v)), ['Excellent', 'Bon', 'Bon', 'Moyen', 'Moyen', 'Élevé', 'Confiné']);
  assert.deepEqual([49, 50, 65, 70, 80].map(v => mot('bruit', v)), ['Calme', 'Modéré', 'Animé', 'Bruyant', 'Très bruyant']);
  assert.deepEqual(C.verdictMesure('co2', 1659), { t: 'Confiné', c: 'var(--o-bad)' }, 'le verdict d’avant se lit dans la même table');
  assert.deepEqual(C.echelleMesure('co2').reperes.map(r => r.v), [900, 1150, 1400, 1600]);
});

test('§ 6 : les familles nouvelles prennent les mots de sa maquette, la borne exclue', () => {
  assert.deepEqual([49, 50, 299, 300, 1400].map(v => mot('lux', v)), ['Sombre', 'Tamisé', 'Tamisé', 'Lumineux', 'Lumineux']);
  assert.deepEqual([9.9, 10, 24.9, 25].map(v => mot('pm25', v)), ['Bon', 'Moyen', 'Moyen', 'Mauvais']);
  assert.deepEqual([149, 150, 249, 250].map(v => mot('cov', v)), ['Bon', 'Moyen', 'Moyen', 'Mauvais']);
  assert.deepEqual([19, 20, 49, 50].map(v => mot('vent', v)), ['Calme', 'Venteux', 'Venteux', 'Fort']);
  assert.deepEqual(C.echelleMesure('lux').reperes.map(r => r.v), [50, 300]);
  assert.deepEqual(['pm25', 'cov', 'vent'].map(k => C.echelleMesure(k).reperes.map(r => r.v)), [[10, 25], [150, 250], [20, 50]]);
});

test('C5 : ce qui est bon — le bleu et le vert de la table ; toute la luminosité ; le vent fort, non', () => {
  const bon = (cle, v) => C.zoneMesure(cle, v).bon;
  assert.deepEqual([16.5, 18, 21, 25, 26.5].map(v => bon('temp', v)), [false, true, true, true, false], 'Frais, Idéal, Idéal, Bon, Un peu chaud');
  assert.deepEqual([800, 1000, 1200].map(v => bon('co2', v)), [true, true, false], 'Excellent et Bon ; Moyen ne l’est plus');
  assert.deepEqual([1, 120, 1400].map(v => bon('lux', v)), [true, true, true], 'aucune lumière n’est mauvaise : la carte ne se colore jamais');
  assert.deepEqual([10, 30, 60].map(v => bon('vent', v)), [true, true, false], 'calme et venteux, oui ; fort, non');
  assert.deepEqual([5, 12].map(v => bon('pm25', v)), [true, false]);
  const z = C.zoneMesure('co2', 1659);
  assert.deepEqual([z.i, z.c, z.rgb], [4, 'var(--o-bad)', 'var(--o-bad-rgb)'], 'le rang de la zone, sa couleur et son compagnon « r,g,b »');
  assert.equal(C.zoneMesure('co2', 'unknown'), null);
  assert.equal(C.zoneMesure('pression', 1013), null, 'une mesure sans table n’a pas de zone');
});

test('la luminosité se lit sur une échelle LOGARITHMIQUE, de 1 à 2 000 lx', () => {
  const b = C.barreMesure('lux', 120);
  assert.deepEqual(b.zones.map(z => z.part), [51.5, 23.5, 25], 'Sombre, Tamisé, Lumineux : leur part de l’échelle, en %');
  assert.equal(b.i, 1);
  assert.equal(b.pos, 63, 'log 120 / log 2 000');
  assert.deepEqual(C.echelleMesure('lux').reperes.map(r => r.pos), [51.5, 75]);
  assert.equal(C.barreMesure('lux', 0).pos, 1, 'zéro lux : le bord gauche, sans logarithme de zéro');
});

test('§ 3 : la barre d’une carte — une bande par zone, la zone où l’on est, le repère, les chiffres', () => {
  const b = C.barreMesure('co2', 1659);
  assert.deepEqual(b.zones.map(z => z.t), ['Excellent', 'Bon', 'Moyen', 'Élevé', 'Confiné']);
  assert.deepEqual(b.zones.map(z => z.bon), [true, true, false, false, false]);
  assert.equal(Math.round(b.zones.reduce((s, z) => s + z.part, 0)), 100, 'les bandes couvrent toute l’échelle');
  assert.equal(b.i, 4);
  assert.equal(b.pos, 95.2, '(1 659 − 850) / (1 700 − 850)');
  assert.deepEqual(b.reperes.map(r => r.t), [900, 1150, 1400, 1600].map(n => n.toLocaleString('fr-FR')), 'les chiffres écrits, dans la langue de l’écran');
  assert.equal(C.barreMesure('co2', 5000).pos, 99, 'au-delà de l’échelle : le repère reste sur la barre');
  assert.equal(C.barreMesure('co2', 300).pos, 1);
  assert.equal(C.barreMesure('co2', null), null);
});

test('la température en Fahrenheit : la zone se lit en Celsius, les chiffres s’écrivent en °F', () => {
  const b = C.barreMesure('temp', U.versCelsius(70.5, 'F'), 'F');
  assert.equal(b.zones[b.i].t, 'Idéal');
  assert.deepEqual(b.reperes.map(r => r.t), ['59', '63', '73', '79', '84']);
});

test('le vent en m/s, en nœuds ou en mph : la table compte en km/h, les chiffres s’écrivent dans l’unité du capteur', () => {
  assert.equal(U.versKmh(10, 'm/s'), 36);
  assert.equal(Math.round(U.versKmh(10, 'kn') * 100) / 100, 18.52);
  assert.equal(Math.round(U.versKmh(10, 'mph') * 100) / 100, 16.09);
  assert.equal(U.versKmh(32, 'km/h'), 32, 'le km/h reste tel quel');
  assert.equal(U.deKmh(36, 'm/s'), 10);
  const b = C.barreMesure('vent', U.versKmh(10, 'm/s'), 'm/s');
  assert.equal(b.zones[b.i].t, 'Venteux');
  assert.deepEqual(b.reperes.map(r => r.t), ['6', '14'], '20 et 50 km/h, en m/s');
});

test('la famille d’un capteur, lue à sa classe ; un COV ne se lit qu’en INDICE, sans unité', () => {
  // ASSERTION MODIFIÉE (30/10, G4-A5) : les PM10 ont leurs zones (UE 2030, OMS 2021) — `pm10`, plus `null`.
  assert.deepEqual(['temperature', 'humidity', 'carbon_dioxide', 'sound_pressure', 'illuminance', 'pm25', 'wind_speed', 'battery', 'pressure', 'pm10'].map(dc => C.cleMesure(dc)),
    ['temp', 'hum', 'co2', 'bruit', 'lux', 'pm25', 'vent', null, null, 'pm10']);
  assert.equal(C.cleMesure('volatile_organic_compounds', ''), 'cov', 'l’indice d’un capteur Sensirion, de 0 à 500');
  assert.equal(C.cleMesure('volatile_organic_compounds_parts', undefined), 'cov');
  assert.equal(C.cleMesure('volatile_organic_compounds', 'µg/m³'), null, 'des µg/m³ ne se lisent pas sur l’échelle d’un indice');
  assert.equal(C.cleMesure('volatile_organic_compounds_parts', 'ppb'), null);
});

test('C8 : la phrase d’une carte — le mot de la zone, « aérez » quand elle le demande, l’humidité d’une température', () => {
  const ph = (cle, v, h) => C.phraseMesure(cle, C.zoneMesure(cle, v), h);
  assert.equal(ph('co2', 1659), 'Confiné · aérez');
  assert.equal(ph('co2', 1177), 'Moyen · aérez', 'le CO₂ moyen et au-delà');
  assert.equal(ph('co2', 1000), 'Bon');
  assert.equal(ph('hum', 68), 'Humide · aérez', 'l’humidité trop haute');
  assert.equal(ph('hum', 25), 'Sec', 'trop basse : rien à aérer');
  assert.equal(ph('pm25', 30), 'Mauvais · aérez');
  assert.equal(ph('cov', 182), 'Moyen · aérez');
  assert.equal(ph('temp', 21.4, 52), 'Idéal · 52' + NBSP + '% d’humidité', 'le nombre et son unité ne se séparent pas');
  assert.equal(ph('temp', 21.4, null), 'Idéal', 'sans hygromètre sur l’appareil : le mot seul');
  assert.equal(ph('lux', 120), 'Tamisé');
  assert.equal(C.phraseMesure('co2', null), '');
});

test('le nom d’une famille et le chiffre d’une carte', () => {
  assert.deepEqual(['temp', 'hum', 'co2', 'bruit', 'lux', 'pm25', 'cov', 'vent'].map(C.nomMesure),
    ['Température', 'Humidité', 'CO₂', 'Bruit', 'Luminosité', 'PM2,5', 'Indice COV', 'Vent']);
  assert.equal(C.chiffreMesure('temp', 21.44), '21,4', 'une décimale pour une température');
  assert.equal(C.chiffreMesure('temp', 21), '21,0');
  assert.equal(C.chiffreMesure('co2', 1659.4), (1659).toLocaleString('fr-FR'));
  assert.equal(C.chiffreMesure('lux', 120.6), '121');
});

/* ASSERTION MODIFIÉE (passe 1 ter, 16/10 ; C15 révisé — « les capteur exterieur il manque les jauges ») : dehors, la température et l'humidité ont
 * leurs propres zones (test plus bas) ; le CO₂, le bruit, les COV et la luminosité restent neutres. */
test('C15 : dehors, la température, l’humidité, le vent et les particules ont des zones ; une température sans zone dit encore l’humidité de son appareil', () => {
  assert.deepEqual(['temp', 'hum', 'co2', 'bruit', 'cov', 'lux', 'vent', 'pm25'].map(C.jugeeDehors), [true, true, false, false, false, false, true, true]);
  assert.equal(C.phraseMesure('temp', null, 81), '81' + NBSP + '% d’humidité', 'sans zone : l’humidité seule, son nombre et son unité ensemble');
  assert.equal(C.phraseMesure('hum', null, 81), '', 'une autre famille sans zone n’a pas de phrase');
  assert.equal(C.phraseMesure('temp', null), '', 'ni zone ni hygromètre : rien');
});

/* TEST AJOUTÉ (correction bis, points 6, 9, 11 et 13) : ce que la table ajoute pour la passe de corrections.
 *  - un vent dans une unité qu'elle ne connaît pas (le Beaufort) ne se ramène pas au km/h : la carte le dit neutre (point 11) ;
 *  - la forme de repli d'une phrase de carte large : sans « aérez », l'humidité sans son mot (point 6) ;
 *  - le glyphe d'une famille (point 9) ;
 *  - les zones portent leur borne comprise, pour lire une courbe sans rebâtir la table (point 13) ; et l'aller vers son repère. */
test('correction bis : unité de vent connue, phrase de repli, glyphe de famille, bornes comprises', () => {
  assert.deepEqual(['km/h', 'm/s', 'mph', 'kn', 'ft/s', 'Bft', 'beaufort', '', undefined].map(U.uniteVentConnue), [true, true, true, true, true, false, false, false, false]);
  const ideal = C.zoneMesure('temp', 21.4), confine = C.zoneMesure('co2', 1659);
  assert.equal(C.phraseMesure('temp', ideal, 52), 'Idéal · 52' + NBSP + '% d’humidité');
  assert.equal(C.phraseMesure('temp', ideal, 52, true), 'Idéal · 52' + NBSP + '%');
  assert.deepEqual([C.phraseMesure('co2', confine), C.phraseMesure('co2', confine, null, true)], ['Confiné · aérez', 'Confiné']);
  assert.deepEqual(['temp', 'hum', 'co2', 'bruit', 'lux', 'pm25', 'cov', 'vent', null].map(C.iconeMesure), ['thermometer-half', 'humidity', 'wind', 'volume', 'brightness', 'smog', 'smog', 'wind', null]);
  const z = C.zonesMesure('temp');
  assert.deepEqual(z.map(x => x.inclus), [false, false, false, false, true, true, true, true, false], 'comme la table : « ≤ 23 : idéal »');
  assert.deepEqual([C.versRepere('temp', 70.5, 'F').toFixed(2), C.versRepere('vent', 10, 'm/s'), C.versRepere('co2', 900, 'ppm')], ['21.39', 36, 900]);
});

/* TESTS AJOUTÉS (passe 1 ter, 16/10 ; C15 révisé). Sa phrase : « les capteur exterieur il manque les jauges ». Les cartes du dehors
 * n'avaient ni barre ni mot : la table ne jugeait dehors que le vent et les particules. Dehors a maintenant SES zones, choisies par la
 * pièce du dehors (`dehors`) : la température — Gel, Froid, Frais, Doux, Chaud, Canicule — et l'humidité — Sec, Normal, Humide,
 * Saturé. Le froid en bleu (aucun jeton n'est plus soutenu : le gel prend le même), le doux en vert, le chaud en ambre, la canicule en
 * rouge ; sec et humide en ambre, saturé en orange. Le « bon » du dehors est le vert seul : il ne sert qu'aux bandes de la courbe,
 * puisque dehors rien n'est une alerte — la zone le dit (`dehors`), et sa phrase ne demande jamais d'aérer. */
test('passe 1 ter, C15 révisé : dehors a ses zones — Gel, Froid, Frais, Doux, Chaud, Canicule ; Sec, Normal, Humide, Saturé', () => {
  const motD = (cle, v) => C.zoneMesure(cle, v, true).t;
  assert.deepEqual([-0.1, 0, 9.9, 10, 16.9, 17, 24.9, 25, 31.9, 32].map(v => motD('temp', v)),
    ['Gel', 'Froid', 'Froid', 'Frais', 'Frais', 'Doux', 'Doux', 'Chaud', 'Chaud', 'Canicule'], 'la borne exclue, comme dans la maison');
  assert.deepEqual([29.9, 30, 69.9, 70, 84.9, 85, 100].map(v => motD('hum', v)), ['Sec', 'Normal', 'Normal', 'Humide', 'Humide', 'Saturé', 'Saturé']);
  const B = 'var(--o-cold)', V = 'var(--o-ok)', J = 'var(--o-warn)', O = 'var(--o-warn2)', R = 'var(--o-bad)';
  assert.deepEqual(C.echelleMesure('temp', 'C', true).bandes.map(b => b.c), [B, B, B, V, J, R], 'le froid en bleu, le doux en vert, le chaud en ambre, la canicule en rouge');
  assert.deepEqual(C.echelleMesure('hum', 'C', true).bandes.map(b => b.c), [J, V, J, O], 'sec et humide en ambre, saturé en orange');
  // Le « bon » du dehors : le vert seul — le bleu y dit le froid, pas l'idéal.
  assert.deepEqual([-5, 5, 12, 20, 28, 35].map(v => C.zoneMesure('temp', v, true).bon), [false, false, false, true, false, false]);
  assert.deepEqual([20, 50, 75, 90].map(v => C.zoneMesure('hum', v, true).bon), [false, true, false, false]);
  // La zone dit qu'elle est du dehors ; dans une pièce, rien ne change.
  assert.deepEqual([C.zoneMesure('temp', 5, true).dehors, C.zoneMesure('temp', 5).dehors], [true, false]);
  assert.deepEqual([C.zoneMesure('temp', 5).t, C.zoneMesure('hum', 92).t], ['Trop froid', 'Très humide'], 'la table de la maison ne bouge pas');
  // Le vent et les particules gardent leurs zones, déjà du dehors ; le CO₂ n'en a pas de propres.
  assert.deepEqual([C.zoneMesure('vent', 60, true).t, C.zoneMesure('pm25', 30, true).t, C.zoneMesure('vent', 60, true).dehors], ['Fort', 'Mauvais', true]);
});

test('passe 1 ter : la barre du dehors — six bandes de −10 à 40 °C, quatre de 10 à 100 % ; ses repères en °C comme en °F ; ses zones pour la courbe', () => {
  const t = C.barreMesure('temp', 5, 'C', true);
  assert.deepEqual(t.zones.map(z => z.t), ['Gel', 'Froid', 'Frais', 'Doux', 'Chaud', 'Canicule']);
  assert.deepEqual(t.zones.map(z => z.part), [20, 20, 14, 16, 14, 16], 'leur part de l’échelle, en %');
  assert.deepEqual([t.i, t.pos], [1, 30], '(5 + 10) / 50');
  assert.deepEqual(t.reperes.map(r => r.t), ['0', '10', '17', '25', '32']);
  const f = C.barreMesure('temp', U.versCelsius(41, 'F'), 'F', true);
  assert.deepEqual([f.zones[f.i].t, f.reperes.map(r => r.t)], ['Froid', ['32', '50', '63', '77', '90']], 'en °F : la zone se lit en Celsius, les seuils se convertissent');
  const h = C.barreMesure('hum', 81, '%', true);
  assert.deepEqual([h.zones.map(z => z.part), h.i, h.reperes.map(r => r.t)], [[22.2, 44.5, 16.6, 16.7], 2, ['30', '70', '85']]);
  assert.equal(C.barreMesure('hum', 81, '%').zones.length, 9, 'témoin : la barre de la maison');
  assert.deepEqual(C.zonesMesure('temp', true).map(z => [z.de, z.a, z.bon]),
    [[-Infinity, 0, false], [0, 10, false], [10, 17, false], [17, 25, true], [25, 32, false], [32, Infinity, false]]);
  assert.deepEqual(C.zonesMesure('hum', true).map(z => z.bon), [false, true, false, false]);
  assert.deepEqual(C.zonesMesure('co2', true), C.zonesMesure('co2'), 'une famille sans zones du dehors garde les siennes');
});

test('passe 1 ter : dehors, la phrase dit le mot de la zone, jamais « aérez »', () => {
  assert.equal(C.phraseMesure('temp', C.zoneMesure('temp', 5, true), 92), 'Froid · 92' + NBSP + '% d’humidité');
  assert.equal(C.phraseMesure('hum', C.zoneMesure('hum', 92, true)), 'Saturé');
  assert.equal(C.phraseMesure('pm25', C.zoneMesure('pm25', 30, true)), 'Mauvais', 'des particules dehors : on n’aère pas pour elles');
  assert.equal(C.phraseMesure('pm25', C.zoneMesure('pm25', 30)), 'Mauvais · aérez', 'témoin : dans une pièce');
});
