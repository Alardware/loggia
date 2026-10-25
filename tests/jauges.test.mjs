// ─────────────────────────────────────────────────────────────────────────────
// Les jauges des cartes capteurs (retours du 19/09, captures Netatmo à l'appui).
//
// « Je pense qu'il faut revenir à la carte de base, celle-ci ; pour le CO₂,
// ajouter une jauge en dessous comme sur ces images » — puis « un trait, pas un
// rond, et les chiffres sont les uns sur les autres » — puis « les valeurs sont
// inscrites sur les photos ». La table de confort.js prend les bornes et les
// couleurs des captures ; les cartes, leur jauge, la fiche de confort, la
// bannière et « À surveiller » la lisent toutes. Voir l'ADR 0057.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
// ASSERTION MODIFIÉE (audit du 19/10, point 14) : `jaugeMesure` (code mort) et `barresPile` (une seconde règle des piles) sont partis.
const { echelleMesure, barreMesure, cleMesure, verdictMesure } = await import('../src/confort.js');
const { SEUIL_CO2 } = await import('../src/attention.js');

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const APP = lire('src', 'App.jsx');
const fonction = (nom) => {
  const i = APP.indexOf('\nfunction ' + nom + '(');
  return APP.slice(i, APP.indexOf('\n}\n', i) + 3);
};

test('les repères sont les chiffres écrits sur les photos', () => {
  assert.deepEqual(echelleMesure('co2').reperes.map(r => r.v), [900, 1150, 1400, 1600]);
  assert.deepEqual(echelleMesure('temp').reperes.map(r => r.v), [15, 17, 23, 26, 29]);
  assert.deepEqual(echelleMesure('hum').reperes.map(r => r.v), [15, 30, 40, 50, 60, 70, 80]);
  assert.deepEqual(echelleMesure('bruit').reperes.map(r => r.v), [50, 65, 70, 80]);
  assert.equal(echelleMesure('lumiere'), null);
});

test('les couleurs des photos, dans leur ordre : bleu idéal, puis vert, jaune, orange, rouge', () => {
  const B = 'var(--o-cold)', V = 'var(--o-ok)', J = 'var(--o-warn)', O = 'var(--o-warn2)', R = 'var(--o-bad)';
  assert.deepEqual(echelleMesure('co2').bandes.map(b => b.c), [B, V, J, O, R]);
  assert.deepEqual(echelleMesure('bruit').bandes.map(b => b.c), [B, V, J, O, R]);
  // Des deux côtés de l'idéal pour la température et l'humidité.
  assert.deepEqual(echelleMesure('temp').bandes.map(b => b.c), [R, O, J, V, B, V, J, O, R]);
  assert.deepEqual(echelleMesure('hum').bandes.map(b => b.c), [R, O, J, V, B, V, J, O, R]);
  // Les bandes se suivent sans trou, de 0 à 100 %.
  for (const cle of ['co2', 'temp', 'hum', 'bruit']) {
    const b = echelleMesure(cle).bandes;
    assert.equal(b[0].de, 0, cle);
    assert.equal(b[b.length - 1].a, 100, cle);
    for (let i = 1; i < b.length; i++) assert.equal(b[i].de, b[i - 1].a, cle + ' : un trou entre deux bandes');
  }
});

/* ASSERTIONS MODIFIÉES (audit du 19/10, point 14) : portées de `jaugeMesure` sur `barreMesure`, la barre que les cartes dessinent —
 * son repère reste sur la barre, de 1 à 99 %. */
test('le trait suit la valeur sur une échelle linéaire, bornée aux extrémités', () => {
  const co2 = (v) => barreMesure('co2', v).pos;
  assert.ok(co2(900) < co2(1150) && co2(1150) < co2(1400) && co2(1400) < co2(1600));
  // Sous l'échelle, le trait reste au bout gauche — comme 447 ppm sur la photo.
  assert.equal(co2(447), 1);
  assert.equal(co2(5000), 99);
  // Le trait tombe dans la bande de son verdict.
  for (const [cle, v] of [['co2', 1280], ['co2', 1480], ['temp', 20], ['hum', 47], ['bruit', 67]]) {
    const b = barreMesure(cle, v);
    assert.equal(b.zones[b.i].c, verdictMesure(cle, v).c, cle + ' ' + v + ' : le trait et le mot ne disent pas la même chose');
    const debut = b.zones.slice(0, b.i).reduce((n, z) => n + z.part, 0);
    assert.ok(b.pos >= Math.floor(debut) && b.pos <= Math.ceil(debut + b.zones[b.i].part), cle + ' ' + v + ' : le repère hors de sa bande');
  }
  assert.equal(barreMesure('co2', null), null);
  assert.equal(barreMesure('co2', 'unknown'), null);
});

test('les chiffres ne se chevauchent pas, même dans une carte de téléphone (barre de 144 px)', () => {
  // 10 px, gras, chiffres à chasse fixe : environ 6 px par chiffre. Les échelles du dehors aussi (passe 1 ter, 16/10 ; C15 révisé).
  for (const [cle, dehors] of [['co2'], ['temp'], ['hum'], ['bruit'], ['temp', true], ['hum', true]]) {
    const r = echelleMesure(cle, 'C', dehors).reperes;
    for (let i = 1; i < r.length; i++) {
      const ecart = (r[i].pos - r[i - 1].pos) / 100 * 144;
      const place = (String(r[i].v).length + String(r[i - 1].v).length) * 3 + 2;
      assert.ok(ecart >= place, cle + ' : ' + r[i - 1].v + ' et ' + r[i].v + ' se touchent (' + Math.round(ecart) + ' px)');
    }
  }
});

/* ASSERTION MODIFIÉE (audit du 19/10, point 13) : UNE règle de pile (`couleurPile`, ADR 0206) — les barres gardent leur nombre (une par
 * 20 %, au plus proche, jamais moins d'une), leur couleur est celle de la pile : ambre au seuil de la veille, rouge au critique, vert sinon. */
test('la pile en cinq barres, comme la capture : une par 20 %, dans la couleur de LA règle des piles', () => {
  const carte = APP.slice(APP.indexOf('function RoomGenericCard('), APP.indexOf("/* ── La carte d'une MESURE"));
  assert.ok(carte.includes("barres = { n: Math.max(1, Math.min(5, Math.round(n / 20))), c: couleurPile(n, 'var(--o-ok)') };"), 'les barres lisent couleurPile');
  assert.ok(!APP.includes('barresPile') && !lire('src', 'confort.js').includes('barresPile'), 'la seconde règle est revenue');
});

test('les classes Home Assistant qui ont une jauge', () => {
  // ASSERTION MODIFIÉE (chantier Capteurs, tâche 2) : la luminosité a sa famille dans la table (§ 6) ; une pile n'en a toujours pas.
  assert.deepEqual(['temperature', 'humidity', 'carbon_dioxide', 'sound_pressure', 'battery', 'illuminance'].map(dc => cleMesure(dc)), ['temp', 'hum', 'co2', 'bruit', null, 'lux']);
});

/* ASSERTIONS MODIFIÉES (chantier Capteurs, tâche 4 ; C11) : la jauge de la carte d'une mesure est la barre des zones de
 * sa maquette (`BarreMesure`) — le trait devient un repère de 4 px sur 16, les bandes de 8 px se séparent de 2 px. */
test('la jauge : un TRAIT à la valeur, pas un rond, sur une barre de 8 px ; pas de jauge dans la compacte', () => {
  assert.ok(!APP.includes('\nfunction JaugeMesure('), 'l’ancienne jauge est restée');
  const j = fonction('BarreMesure');
  assert.ok(j.includes("data-repere=\"\" style={{ position: 'absolute', top: 0, left: barre.pos + '%', width: 4, height: 16, marginLeft: -2, borderRadius: 2,"), 'le repère est un trait');
  assert.ok(!/borderRadius: '50%'/.test(j), 'un rond est revenu');
  assert.ok(j.includes("top: 4, height: 8, display: 'flex', gap: 2"), 'la barre a changé d’épaisseur');
  assert.ok(j.includes("left: 'clamp(' + demi + 'px, ' + r.pos + '%, calc(100% - ' + demi + 'px))'"), 'les chiffres restent dans la barre');
  assert.ok(j.includes('aria-hidden="true"'), 'la valeur et son mot sont déjà écrits : la jauge ne se lit pas');
  // « Laisse comme sur la 2e photo » : la compacte garde son dessin — icône, nom, valeur.
  const c = fonction('CvCard');
  assert.ok(!c.includes('BarreMesure') && !c.includes('JaugePile') && !c.includes('barreMesure('), 'une jauge est revenue dans la compacte');
});

test('une seule table : « Élevé » commence à 1 400 ppm partout', () => {
  assert.equal(verdictMesure('co2', SEUIL_CO2).t, 'Élevé', 'le point « À surveiller » tombe au début de « Élevé »');
  assert.equal(verdictMesure('co2', SEUIL_CO2 - 1).t, 'Moyen');
  // ASSERTION MODIFIÉE (audit du 19/10, M16) : la bannière et le badge lisent la table elle-même — plus de paliers à part.
  assert.ok(!APP.includes('function airPalier') && APP.includes("const zoneCo2 = (co2) => (co2 == null ? null : zoneMesure('co2', co2));"), 'la bannière et le badge');
  assert.ok(fonction('CvAir').includes("const vAir = air.co2V == null ? null : verdictMesure('co2', air.co2V);"), 'la carte « Qualité air » du catalogue');
  assert.ok(!APP.includes("tr('Mauvais'), 'var(--o-bad)'"), 'plus de seconde échelle 800 / 1200 dans la carte « Qualité air »');
  const py = lire('custom_components', 'loggia', 'veilles.py');
  assert.ok(py.includes('"co2": {"actif": False, "seuil": ' + SEUIL_CO2 + ','), 'le défaut de la veille du serveur');
  assert.ok(lire('src', 'views', 'veilles.jsx').includes('value={co2.seuil != null ? co2.seuil : SEUIL_CO2}'), 'l’écran des veilles');
});
