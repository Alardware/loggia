// ─────────────────────────────────────────────────────────────────────────────
// La fiche du purificateur d'air (sa consigne du 21/11, ADR 0387).
//
// Ce qui compte : un purificateur se reconnaît à son APPAREIL (sa qualité d'air, son filtre), jamais à son nom ; le niveau
// de l'air se lit sur ce que l'intégration publie et ne contredit pas la table des capteurs ; la rangée des modes et des
// vitesses suit ce que l'appareil sait ; la scène garde le rythme de sa consigne (particules par niveau, Nuit × 0,6,
// facteur de vitesse) ; le planning n'annonce que de vrais changements de mode ; la fiche dessine aux jetons du thème, et
// « réduire les animations » coupe la scène.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
const { setLoggiaState } = await import('../src/state.js');
const { estPurificateur } = await import('../src/purificateurboot.js');
const P = await import('../src/purificateur.js');
const { default: FichePurificateurContent } = await import('../src/fichepurificateur.jsx');

const lire = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const sansCommentaires = (t) => t.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const etats = (o) => Object.fromEntries(Object.entries(o).map(([id, [state, attributes]]) => [id, { entity_id: id, state, attributes: attributes || {} }]));

// Le purificateur de sa maison, tel que VeSync le publie (registre et base lus le 21/11) : un LV-PUR131S, trois vitesses,
// Auto et Nuit ; en Auto, pas de `percentage`.
const META = new Map([
  ['fan.air', { deviceId: 'pur' }],
  ['sensor.air_qualite', { deviceId: 'pur', translationKey: 'air_quality' }],
  ['sensor.air_filtre', { deviceId: 'pur', translationKey: 'filter_life', category: 'diagnostic' }],
  ['switch.air_affichage', { deviceId: 'pur', translationKey: 'display', category: 'config' }],
  ['fan.poele', { deviceId: 'poele' }],
  ['sensor.poele_temp', { deviceId: 'poele', deviceClass: 'temperature' }],
  ['fan.autre', { deviceId: 'autre' }],
  ['sensor.autre_pm', { deviceId: 'autre', deviceClass: 'pm25' }],
  ['fan.cache', { deviceId: 'cache' }],
  ['sensor.cache_air', { deviceId: 'cache', translationKey: 'air_quality', disabled: true }],
]);
const INDEX = { entityMeta: META };
const VESYNC = { supported_features: 1 | 8 | 16 | 32, percentage_step: 100 / 3, preset_modes: ['auto', 'sleep'] };
const maison = ({ fan = ['on', { ...VESYNC, preset_mode: 'auto', percentage: null }], air = 'excellent', filtre = '72', ecran = 'on' } = {}) => etats({
  'fan.air': fan, 'sensor.air_qualite': [air], 'sensor.air_filtre': [filtre, { unit_of_measurement: '%' }], 'switch.air_affichage': [ecran],
});

// ─── Reconnaître un purificateur ─────────────────────────────────────────────

test('un purificateur se reconnaît à sa qualité d’air ou à son filtre, jamais à son nom', () => {
  assert.equal(estPurificateur(INDEX, 'fan.air'), true, 'VeSync : la clé air_quality');
  assert.equal(estPurificateur(INDEX, 'fan.autre'), true, 'des particules sur le même appareil');
  assert.equal(estPurificateur(INDEX, 'fan.poele'), false, 'la ventilation d’un poêle reste un ventilateur');
  assert.equal(estPurificateur(INDEX, 'fan.cache'), false, 'une sœur désactivée ne compte pas');
  assert.equal(estPurificateur(INDEX, 'sensor.air_qualite'), false);
  assert.equal(estPurificateur(null, 'fan.air'), false);
});

test('la fiche du purificateur s’ouvre à la place de la fiche universelle, en feuille à onglets', () => {
  const F = lire('src/appareils/fiches.jsx');
  assert.match(F, /estPurificateur\(LOGGIA_INDEX, appPop\) \? <FichePurificateur id=\{appPop\}/);
  const coquille = F.slice(F.indexOf('\nfunction FichePurificateur('), F.indexOf('\n}\n', F.indexOf('\nfunction FichePurificateur(')));
  assert.ok(coquille.includes('<BottomSheet onClose={onClose} onglets>'), 'ses onglets changeraient sa hauteur');
  assert.ok(coquille.includes('<FicheAppareil id={fiche}'), '« L’appareil » ouvre la fiche universelle par-dessus');
  assert.ok(F.includes("lazyRecharge(() => import('../fichepurificateur.jsx'))"), 'la fiche se charge à la demande');
  // Le démarrage n'embarque que la reconnaissance.
  assert.ok(!/from '\.\.\/purificateur\.js'/.test(F) && !/from '\.\.\/fichepurificateur\.jsx'/.test(F));
});

// ─── Le niveau de l'air ──────────────────────────────────────────────────────

test('le niveau de l’air se lit sur le mot, le rang, les particules ou l’indice', () => {
  for (const [v, n] of [['excellent', 'excellent'], ['Good', 'good'], ['moderate', 'moderate'], ['poor', 'poor'], ['very_poor', 'polluted'], ['bad', 'poor']]) {
    assert.equal(P.niveauDeLAir(v, { translationKey: 'air_quality' }), n, v);
  }
  assert.equal(P.niveauDeLAir('2', { translationKey: 'air_quality' }), 'good', 'le rang 1 à 5 de VeSync');
  assert.equal(P.niveauDeLAir('7', { translationKey: 'air_quality' }), null);
  // Les particules aux paliers de la table des capteurs (confort.js : bon sous 10, moyen sous 25).
  assert.equal(P.niveauDeLAir('4', { deviceClass: 'pm25' }), 'excellent');
  assert.equal(P.niveauDeLAir('8', { deviceClass: 'pm25' }), 'good');
  assert.equal(P.niveauDeLAir('20', { deviceClass: 'pm25' }), 'moderate');
  assert.equal(P.niveauDeLAir('30', {}, 'µg/m³'), 'poor');
  assert.equal(P.niveauDeLAir('80', { deviceClass: 'pm25' }), 'polluted');
  assert.equal(P.niveauDeLAir('120', { deviceClass: 'aqi' }), 'poor');
  assert.equal(P.niveauDeLAir('unknown', {}), null);
  assert.equal(P.niveauDeLAir(null, {}), null);
  const CONFORT = lire('src/confort.js');
  assert.ok(CONFORT.includes("pm25: () => [[10, trSens('Bon · air'), OK], [25, trSens('Moyen · air'), AMBRE]"), 'les paliers des capteurs ont bougé : réaligner PALIERS_PM25');
});

// ─── La vue : modes, vitesses, scène ─────────────────────────────────────────

test('la rangée suit l’appareil : Auto, ses trois vitesses, Nuit', () => {
  const v = P.vuePurificateur(INDEX, maison(), 'fan.air');
  assert.deepEqual(v.pilules.map(p => p.mot), ['Auto', 'Faible', 'Moyen', 'Fort', 'Nuit']);
  assert.equal(v.mode, 'auto');
  assert.deepEqual(v.pilules.filter(p => p.on).map(p => p.cle), ['auto']);
  assert.deepEqual(v.pilules[2].envoi, { service: 'turn_on', data: { percentage: 67 } });
  assert.deepEqual(v.pilules[4].envoi, { service: 'turn_on', data: { preset_mode: 'sleep' } });
  // Un appareil sans Nuit ni crans : la rangée rétrécit.
  const sans = P.vuePurificateur(INDEX, maison({ fan: ['on', { supported_features: 8 | 32, preset_modes: ['auto'], preset_mode: 'auto' }] }), 'fan.air');
  assert.deepEqual(sans.pilules.map(p => p.cle), ['auto']);
});

test('la scène garde le rythme de sa consigne', () => {
  // En Auto sans vitesse publiée, celle que le niveau appelle : très bon → faible (0,7), 16 particules.
  let v = P.vuePurificateur(INDEX, maison(), 'fan.air');
  assert.equal(v.cran, 1); assert.equal(v.f, 0.7); assert.equal(v.particules, 16);
  assert.equal(v.ligne, 'Auto · vitesse faible');
  v = P.vuePurificateur(INDEX, maison({ air: 'poor' }), 'fan.air');
  assert.equal(v.cran, 3); assert.equal(v.f, 1.5); assert.equal(v.particules, 46); assert.equal(v.alerte, true);
  v = P.vuePurificateur(INDEX, maison({ air: 'polluted' }), 'fan.air');
  assert.equal(v.particules, 62); assert.equal(v.couleur, 'var(--o-bad)');
  // Nuit : 0,45, particules × 0,6.
  v = P.vuePurificateur(INDEX, maison({ fan: ['on', { ...VESYNC, preset_mode: 'sleep' }], air: 'moderate' }), 'fan.air');
  assert.equal(v.mode, 'nuit'); assert.equal(v.f, 0.45); assert.equal(v.particules, Math.round(36 * 0.6));
  // Manuel à 67 % : le cran du milieu, vitesse 1.
  v = P.vuePurificateur(INDEX, maison({ fan: ['on', { ...VESYNC, preset_mode: null, percentage: 67 }] }), 'fan.air');
  assert.equal(v.mode, 'manuel'); assert.equal(v.cran, 2); assert.equal(v.f, 1);
  assert.deepEqual(v.pilules.filter(p => p.on).map(p => p.cle), ['v2']);
  // La minuterie posée s'écrit dans la ligne du disque.
  assert.equal(P.vuePurificateur(INDEX, maison(), 'fan.air', { minuteur: { duree: 120 } }).ligne, 'Auto · vitesse faible · 2 h');
  // Éteint : gris, rien ne bouge, « Éteint ».
  v = P.vuePurificateur(INDEX, maison({ fan: ['off', VESYNC], air: 'poor' }), 'fan.air');
  assert.equal(v.f, 0); assert.equal(v.particules, 0); assert.equal(v.couleur, 'var(--o-text3)'); assert.equal(v.motNiveau, 'Éteint');
  assert.equal(v.alerte, false, 'éteint, pas de bandeau d’alerte');
});

test('le bandeau dit ce qu’il fait, vraiment', () => {
  assert.equal(P.vuePurificateur(INDEX, maison({ air: 'good' }), 'fan.air').bandeau, 'Air bon : vitesse moyenne pour le garder propre.');
  assert.equal(P.vuePurificateur(INDEX, maison({ fan: ['off', VESYNC] }), 'fan.air').bandeau, 'Purificateur à l’arrêt. Choisissez un mode pour le relancer.');
  // « écran éteint » seulement si l'écran l'est.
  const nuit = (ecran) => P.vuePurificateur(INDEX, maison({ fan: ['on', { ...VESYNC, preset_mode: 'sleep' }], ecran }), 'fan.air').bandeau;
  assert.equal(nuit('off'), 'Mode nuit : ventilateur au minimum et écran éteint.');
  assert.equal(nuit('on'), 'Mode nuit : ventilateur au minimum.');
  assert.equal(P.bandeau({ mode: 'auto', niveau: 'excellent', prochain: 'Nuit à 22:30' }), 'Air très bon : il tourne au ralenti, en silence. Planning : Nuit à 22:30.');
});

test('le filtre : bon état, bientôt, à remplacer', () => {
  assert.deepEqual(P.vuePurificateur(INDEX, maison({ filtre: '72' }), 'fan.air').filtre, { pct: 72, niveau: 'bon', etat: 'En bon état' });
  assert.equal(P.vuePurificateur(INDEX, maison({ filtre: '25' }), 'fan.air').filtre.niveau, 'moyen');
  assert.equal(P.vuePurificateur(INDEX, maison({ filtre: '0' }), 'fan.air').filtre.etat, 'À remplacer');
  assert.equal(P.vuePurificateur(INDEX, maison({ filtre: 'unknown' }), 'fan.air').filtre, null);
});

test('la minuterie fait 2 h, 4 h, 8 h puis s’annule — le composant ajoute à ce qui reste', () => {
  assert.deepEqual(P.suiteMinuterie(0), { poser: 120 });
  assert.deepEqual(P.suiteMinuterie(120), { poser: 120 });
  assert.deepEqual(P.suiteMinuterie(240), { poser: 240 });
  assert.deepEqual(P.suiteMinuterie(480), { annuler: true });
});

test('les particules sont figées : le même hasard à chaque rendu', () => {
  assert.equal(P.PARTICULES.length, 64);
  const r = P.PARTICULES[0];
  assert.ok(r.base >= 2.6 && r.base <= 5 && r.taille >= 3 && r.taille <= 9 && [1, 2, 3].includes(r.voie));
});

// ─── Le planning ─────────────────────────────────────────────────────────────

const SEMAINE = [{ debut: 0, mode: 'nuit' }, { debut: 420, mode: 'auto' }, { debut: 510, mode: 'arret' }, { debut: 1050, mode: 'auto' }, { debut: 1350, mode: 'nuit' }];
const WEEKEND = [{ debut: 0, mode: 'nuit' }, { debut: 570, mode: 'auto' }, { debut: 1380, mode: 'nuit' }];
const TYPE = [0, 1, 2, 3, 4, 5, 6].map(j => (j < 5 ? SEMAINE : WEEKEND));

test('le prochain changement saute minuit quand le mode ne change pas', () => {
  assert.deepEqual(P.prochainChangement(TYPE, 0, 360), { jour: 0, debut: 420, mode: 'auto', ecart: 0 });
  // Lundi 23:00 : la Nuit de 00:00 continue celle de 22:30, le prochain changement est mardi 07:00.
  assert.deepEqual(P.prochainChangement(TYPE, 0, 1380), { jour: 1, debut: 420, mode: 'auto', ecart: 1 });
  assert.equal(P.prochainChangement(Array(7).fill([{ debut: 0, mode: 'auto' }]), 0, 0), null);
  const modes = P.modesPlanning(P.vuePurificateur(INDEX, maison(), 'fan.air'));
  assert.deepEqual(modes.map(m => m.cle), ['arret', 'auto', 'v1', 'v2', 'v3', 'nuit']);
  assert.equal(P.phraseProchain({ jour: 0, debut: 1350, mode: 'nuit', ecart: 0 }, modes, () => 'lundi'), 'Nuit à 22:30');
  assert.equal(P.phraseProchain({ jour: 1, debut: 420, mode: 'auto', ecart: 1 }, modes, () => 'mardi'), 'Auto demain à 07:00');
  assert.equal(P.phraseProchain({ jour: 3, debut: 420, mode: 'v2', ecart: 3 }, modes, () => 'jeudi'), 'Moyen jeudi à 07:00');
});

test('éditer une journée : ajouter, déplacer, retirer, copier', () => {
  const r = P.ajouterPlage(SEMAINE);
  assert.equal(r.indice, 3, 'la plus longue — 08:30 → 17:30 — est coupée');
  assert.deepEqual(r.jour[3], { debut: 780, mode: 'auto' });
  assert.equal(P.ajouterPlage([{ debut: 0, mode: 'auto' }, ...Array.from({ length: 47 }, (_, i) => ({ debut: 30 * (i + 1), mode: 'auto' }))]), null);
  // La première plage ne bouge pas ; une plage reste à 30 min de ses voisines.
  assert.equal(P.deplacerPlage(SEMAINE, 0, 1), null);
  assert.deepEqual(P.deplacerPlage(SEMAINE, 1, -1)[1], { debut: 390, mode: 'auto' });
  assert.equal(P.deplacerPlage([{ debut: 0, mode: 'nuit' }, { debut: 30, mode: 'auto' }, { debut: 60, mode: 'arret' }], 1, 1), null);
  assert.equal(P.retirerPlage(SEMAINE, 0), null);
  assert.equal(P.retirerPlage(SEMAINE, 2).length, 4);
  const copie = P.copierJour(TYPE, 5, [0, 1, 2, 3, 4]);
  assert.deepEqual(copie[0], WEEKEND); assert.deepEqual(copie[6], WEEKEND);
  copie[0][0].mode = 'arret';
  assert.equal(WEEKEND[0].mode, 'nuit', 'la copie ne touche pas l’original');
  assert.deepEqual(P.journeePropre([{ debut: 435, mode: 'auto' }, { debut: 60, mode: 'nuit' }]), [{ debut: 0, mode: 'nuit' }, { debut: 420, mode: 'auto' }]);
  assert.deepEqual(P.semaineType(P.modesPlanning(P.vuePurificateur(INDEX, maison(), 'fan.air')))[0], SEMAINE);
});

test('l’historique : l’escalier de l’air et les gestes du jour', () => {
  const t0 = Date.parse('2026-11-20T00:00:00Z');
  const h = (min) => new Date(t0 + min * 60000).toISOString();
  const niveau = (s) => P.niveauDeLAir(s, { translationKey: 'air_quality' });
  const esc = P.escalierAir([{ state: 'excellent', last_changed: h(0) }, { state: 'excellent', last_changed: h(30) }, { state: 'unavailable', last_changed: h(40) },
    { state: 'poor', last_changed: h(60) }, { state: 'good', last_changed: h(120) }], niveau, t0, t0 + 86400000);
  assert.deepEqual(esc.map(x => x.n), [0, 3, 1]);
  assert.equal(P.pireNiveau(esc), 3);
  const ev = P.evenementsJour([{ state: 'off', last_changed: h(0), attributes: {} }, { state: 'on', last_changed: h(420), attributes: { preset_mode: 'auto' } },
    { state: 'on', last_changed: h(500), attributes: { preset_mode: null, percentage: 100 } }, { state: 'off', last_changed: h(510), attributes: {} }], esc,
  { presetAuto: 'auto', presetNuit: 'sleep', n: 3, vitesse: { pas: 100 / 3, etapes: [1, 2, 3] } });
  assert.deepEqual(ev.map(e => e.texte), ['Éteint', 'vitesse forte', 'Allumé · mode Auto', 'Air bon', 'Air mauvais']);
});

// ─── Le dessin ───────────────────────────────────────────────────────────────

test('la fiche dessine aux jetons du thème, sans menu natif ni nom d’entité', () => {
  const F = sansCommentaires(lire('src/fichepurificateur.jsx'));
  const J = sansCommentaires(lire('src/purificateur.js'));
  for (const t of [F, J]) {
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(t.replace(/'#fff'/g, '')), 'une couleur écrite en dur');
    assert.ok(!/rgba?\(\d/.test(t), 'une couleur écrite en dur');
    assert.ok(!t.includes('<select'), 'un menu natif');
    assert.ok(!/'(fan|sensor|switch)\.[a-z]/.test(t), 'un entity_id en dur');
  }
  // Le choisi en bleu plein, texte blanc.
  assert.ok(F.includes("background: on ? 'var(--o-accent-fond)' : 'transparent', color: on ? '#fff' : 'var(--o-text1)'"));
  // Une seule croix, celle de l'en-tête commun, qui nomme aussi la feuille.
  assert.ok(F.includes('<EnteteFiche nom={nom}') && !F.includes('<CroixFeuille'));
});

test('la scène : halo, particules, pales — et « réduire les animations » coupe tout', () => {
  const CSS = lire('src/index.css');
  for (const k of ['@keyframes pu-entre1', '@keyframes pu-entre2', '@keyframes pu-entre3', '@keyframes pu-souffle', '@keyframes pu-tourne']) assert.ok(CSS.includes(k), k);
  assert.ok(CSS.includes('translateX(230px) scale(1)') && CSS.includes('translateX(98px) scale(.2)'), 'les trajectoires de sa consigne');
  assert.ok(CSS.includes('@media (prefers-reduced-motion: reduce) { .pu-pt, .pu-anime .pu-halo, .pu-pales { animation: none; }'));
});

test('la fiche rendue : la scène, cinq pilules, quatre onglets', () => {
  setLoggiaState({ index: INDEX });
  try {
    const hass = { states: maison({ air: 'moderate' }), callWS: () => new Promise(() => {}) };
    const html = renderToStaticMarkup(createElement(FichePurificateurContent, { hass, id: 'fan.air', piece: 'Bureau', appareil: 'VeSync LV-PUR131S', maintenant: Date.parse('2026-11-16T10:00:00') }));
    assert.match(html, /data-scene="anime"/);
    assert.equal((html.match(/class="pu-pt pu-p\d"/g) || []).length, 36, 'air moyen : 36 particules');
    assert.match(html, /data-niveau="moderate"/);
    assert.match(html, /Auto · vitesse forte/);
    assert.equal((html.match(/role="tab"/g) || []).length, 4);
    assert.match(html, /Bureau · VeSync LV-PUR131S/);
    assert.match(html, /Filtre 72 %/);
    // Sans le composant (pas de réponse des minuteurs), pas d'action Minuterie.
    assert.ok(!html.includes('Minuterie'));
  } finally { setLoggiaState({ index: null }); }
});
