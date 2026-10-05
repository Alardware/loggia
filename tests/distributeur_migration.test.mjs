// ─────────────────────────────────────────────────────────────────────────────
// La liste de repas de Paramètres s'en va sans rien perdre (ADR 0155, 05/10).
//
// Le planning du distributeur vient désormais du programme de l'appareil, des
// automatisations qui le commandent, ou du planning de Loggia : la liste
// saisie dans Paramètres › Objets (« Repas de la journée ») cesse d'être une
// source et perd son éditeur. Rien ne se perd en silence pour autant :
//  1. « Enregistrer » réécrit `loggia_feeder` depuis TOUTES les vues de la
//     fiche « Entités de la vue », même celles qui ne montrent pas le
//     distributeur. L'ancienne liste et les automatisations associées (le
//     « Associer » de la fiche) n'ont plus de champ : elles sont RECOPIÉES
//     telles que le magasin les tient, relues au moment d'écrire — un état
//     capturé à l'ouverture de la feuille écraserait un « Associer » fait
//     entre-temps ;
//  2. la clé survit tant qu'un champ désigne quelque chose — l'appareil seul
//     (un Petlibro n'a pas de réservoir en grammes), l'ancienne liste seule,
//     les associées seules ;
//  3. l'encart « Ancienne liste de repas » la montre, compte ses repas reliés
//     et non reliés, avec leurs heures et leurs libellés, jusqu'au geste
//     « Oublier l'ancienne liste » (admin), qui garde les automatisations
//     reliées ASSOCIÉES au distributeur ;
//  4. le distributeur se désigne aussi par son appareil, choisi dans une
//     ListeChoix où ceux qui savent distribuer passent en tête.
// Le test exécute le VRAI `useEntConfig` (rendu React côté serveur) et le vrai
// `cfgSet` : il échoue sur le code d'avant pour ce qu'il perd.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
const { rendre } = await import('./rendu.mjs');   // les crochets `.jsx`, avant le premier import d'une vue
const { createElement } = await import('react');
const { setLoggiaState, loggiaEnt } = await import('../src/state.js');
const P = await import('../src/views/parametres.jsx');

const PARAM = readFileSync(new URL('../src/views/parametres.jsx', import.meta.url), 'utf8');

/** Serveur joignable, et ce que `cfgSet` envoie au composant. */
let envois = [];
let reponse = true;
const etat = (cfg = {}, extra = {}) => {
  envois = []; reponse = true;
  setLoggiaState({ cfg, ent: {}, server: true, index: null, save: (patch) => { envois.push(patch); return reponse; }, ...extra });
};

/* `saveEnt` recharge la page 700 ms après l'envoi : une page de test n'a rien
 * à recharger. `alert` dirait « Enregistrement impossible ». */
const alertes = [];
globalThis.window = { location: { reload() {} } };
globalThis.alert = (m) => { alertes.push(m); };

/** Le VRAI `useEntConfig`, rendu une fois : ce qu'il rend, `saveEnt` compris. */
function editeur(hass = null) {
  let capte = null;
  rendre(function Sonde() { capte = P.useEntConfig(hass); return null; });
  return capte;
}

const HAIDS = { reservoir: 'input_number.croquettes_reservoir', portionWeight: 'number.distributeur_portion', distribuees: 'sensor.croquettes_du_jour' };
const VIDES = { reservoir: null, portionWeight: null, distribuees: null };
// L'ancienne liste de la démo : un repas relié, un non relié — plus un repas
// abîmé, qu'aucun écrivain n'a le droit de « réparer » en le réécrivant.
const MEALS = [
  { id: 'matin', time: '07:30', label: 'Repas du matin', g: 45, auto: 'input_boolean.repas_matin' },
  { id: 'soir', time: '19:00', label: 'Repas du soir', g: 45, auto: 'automation.croquettes_matin_et_soir' },
  { id: 'nuit', time: 2330, label: { fr: 'Nuit' }, g: { n: 3 }, auto: 5 },
];

/* ── 1. Chaque vue qui enregistre recopie l'ancienne liste et les associées ── */

const VUES = Object.keys(P.VIEW_ENT_SECTIONS);

test('une seule écriture pour toutes les vues : la feuille « Entités de la vue » enregistre par `saveEnt`', () => {
  assert.ok(VUES.length >= 7, VUES.join(','));
  // Chaque vue ouvre la MÊME feuille, dont le seul bouton d'écriture est `saveEnt`.
  const feuille = PARAM.slice(PARAM.indexOf('export function ViewEntSheet('), PARAM.indexOf('\n}\n', PARAM.indexOf('export function ViewEntSheet(')));
  assert.match(feuille, /const \{ ent, setEnt, entSet, saveEnt, dlists \} = useEntConfig\(hass\);/);
  assert.match(feuille, /<button onClick=\{saveEnt\}/);
  assert.equal((PARAM.match(/loggia_feeder: feederAEcrire\(/g) || []).length, 1, 'un second écrivain de `loggia_feeder` ne recopierait peut-être pas l’ancienne liste');
  // …et cette écriture relit la clé AU MOMENT d'écrire, pas à l'ouverture de la feuille.
  assert.match(PARAM, /loggia_feeder: feederAEcrire\(ent, cfgVal\('loggia_feeder', null\) \|\| loggiaEnt\('feeder', null\)\),/);
});

for (const vue of VUES) {
  test(`« Enregistrer » depuis la vue ${vue} garde l’ancienne liste, les associées et l’appareil`, () => {
    etat({ loggia_feeder: { haid: 'select.distributeur_feed', haids: HAIDS, appareil: 'dist_cuisine', meals: MEALS, associees: ['automation.croquettes_du_midi'] } });
    // La feuille de la vue se rend, avec son bouton « Enregistrer ».
    const html = rendre(P.ViewEntSheet, { view: vue, hass: null, onClose: () => {} });
    assert.ok(html.includes('Enregistrer et recharger'), vue);
    const { saveEnt } = editeur();
    // Entre l'ouverture de la feuille et « Enregistrer », la fiche du
    // distributeur a associé une automatisation : relue AU MOMENT d'écrire.
    setLoggiaState({ cfg: { loggia_feeder: { ...loggiaEnt('feeder'), associees: ['automation.croquettes_du_midi', 'automation.croquettes_week_end'] } } });
    saveEnt();
    assert.equal(envois.length, 1, vue);
    assert.deepEqual(envois[0].loggia_feeder, {
      haids: HAIDS, haid: 'select.distributeur_feed', appareil: 'dist_cuisine',
      meals: MEALS, associees: ['automation.croquettes_du_midi', 'automation.croquettes_week_end'],
    }, vue + ' : l’ancienne liste, une associée ou l’appareil se perd à l’enregistrement');
    assert.deepEqual(alertes, []);
  });
}

test('les repas de l’ancienne liste se recopient TELS QUELS ; seuls partent ceux qui ne portent rien', () => {
  const brut = { meals: [...MEALS, null, 5, 'soir', [], {}, { time: '', label: '', g: 0, auto: null }, { label: 'Goûter' }, { g: 30 }] };
  const ecrit = P.feederAEcrire({ feeder: P.feederEdition(brut) }, brut);
  assert.deepEqual(ecrit.meals, [...MEALS, { label: 'Goûter' }, { g: 30 }]);
  assert.equal(ecrit.meals[0], MEALS[0], 'le repas est recopié, pas reconstruit');
  // Des associées abîmées ne finissent pas dans les clés surveillées (`useHass`).
  assert.deepEqual(P.feederAEcrire({ feeder: P.feederEdition({}) }, { associees: ['automation.a', 7, null, '', { id: 'x' }, 'automation.a'] }).associees, ['automation.a']);
  // Une liste qui n'en est pas une ne s'écrit pas.
  for (const v of [null, 'x', 42, { 0: { time: '07:30' } }]) {
    assert.deepEqual(P.feederAEcrire({ feeder: P.feederEdition({ script: 'script.distribuer' }) }, { script: 'script.distribuer', meals: v, associees: v }),
      { haids: VIDES, script: 'script.distribuer', meals: [] }, JSON.stringify(v));
  }
});

/* ── 2. La clé survit tant qu'un champ désigne quelque chose ──────────────── */

test('la clé survit avec l’appareil seul, l’ancienne liste seule ou les associées seules', () => {
  const vide = P.feederEdition(null);
  assert.equal(P.feederAEcrire({ feeder: vide }, null), null, 'rien de désigné : la clé s’efface, comme avant');
  assert.deepEqual(P.feederAEcrire({ feeder: { ...vide, appareil: 'dist_petlibro' } }, null),
    { haids: VIDES, appareil: 'dist_petlibro', meals: [] });
  assert.deepEqual(P.feederAEcrire({ feeder: vide }, { meals: [MEALS[0]] }), { haids: VIDES, meals: [MEALS[0]] });
  assert.deepEqual(P.feederAEcrire({ feeder: vide }, { associees: ['automation.matin'] }), { haids: VIDES, meals: [], associees: ['automation.matin'] });
  // Le Petlibro de la démo : désigné par son appareil, sans réservoir.
  etat({ loggia_feeder: { appareil: 'dist_petlibro', haid: 'button.granary_manual_feed', haids: {}, meals: [] } });
  assert.equal(editeur().ent.feeder.appareil, 'dist_petlibro');
  editeur().saveEnt();
  assert.deepEqual(envois[0].loggia_feeder, { haids: VIDES, appareil: 'dist_petlibro', haid: 'button.granary_manual_feed', meals: [] });
});

test('l’éditeur lit l’appareil sans lever, quelle que soit la forme reçue', () => {
  assert.equal(P.feederEdition({ appareil: '  dist_cuisine ' }).appareil, 'dist_cuisine');
  for (const v of [null, 42, 'abc', [], { appareil: 7 }, { appareil: { id: 'x' } }, { appareil: '   ' }]) {
    assert.equal(P.feederEdition(v).appareil, '', JSON.stringify(v));
  }
});

/* ── 3. L'encart « Ancienne liste de repas » ──────────────────────────────── */

const objets = (hass = null) => rendre(P.ViewEntSheet, { view: 'objets', hass, onClose: () => {} });
// Découpé aux balises, entités décodées en une passe (CodeQL, 05/10).
const texteDe = (html) => html.split(/<[^>]*>/).join('\n').replace(/&(amp|quot|#x27);/g, (_, e) => ({ amp: '&', quot: '"', '#x27': "'" })[e]);

test('l’éditeur de repas est parti, l’aide dit où se lit le planning', () => {
  etat({ loggia_feeder: { haids: HAIDS, meals: MEALS } });
  const t = texteDe(objets());
  for (const parti of ['Repas de la journée', 'REPAS DE LA JOURNÉE', 'Piloté par automatisations']) assert.ok(!t.includes(parti), parti);
  assert.ok(t.includes('Désignez l’appareil, ou le réservoir, la portion et, si besoin, le script qui distribue. Le planning se lit dans la fiche du distributeur.'));
});

test('l’encart compte les repas reliés et non reliés, avec leurs heures et leurs libellés', () => {
  etat({ loggia_feeder: { haids: HAIDS, meals: [...MEALS, { id: 'midi', time: '12:30', label: 'Midi', g: 20, auto: 'automation.croquettes_du_midi' }, null, {}] } });
  const hass = { states: { 'automation.croquettes_matin_et_soir': { state: 'on', attributes: { friendly_name: 'Croquettes matin et soir' } } } };
  const t = texteDe(objets(hass));
  assert.ok(t.includes('Ancienne liste de repas'));
  // La phrase ENTIÈRE, mot pour mot (05/10 : le contradicteur des textes l'a réécrite — « Ils ne
  // servent plus » se lisait « le repas ne part plus » — et la suite d'integ était rouge).
  assert.ok(t.includes('Ces repas venaient d’une liste saisie dans Loggia. Cette liste ne sert plus de planning : la fiche du distributeur lit celui de l’appareil, vos automatisations ou le planning de Loggia. Rien ne change pour vos automatisations : celles qui distribuaient distribuent toujours.'), t);
  assert.ok(!t.includes('Ils ne servent plus'), 'l’ancienne phrase est revenue : elle se lisait « le repas ne part plus »');
  assert.ok(t.includes('2 repas reliés à une automatisation'), t);
  assert.ok(t.includes('2 repas non reliés : ils ne distribuaient rien par eux-mêmes'), t);
  // Les heures, les libellés, les GRAMMES (05/10, relecture « données » : saisis par repas, ils ne
  // se montraient plus nulle part), le nom de l'automatisation reliée.
  assert.ok(t.includes('19:00 · Repas du soir · Croquettes matin et soir\n · 45 g\n'), t);
  assert.ok(t.includes('12:30 · Midi · automation.croquettes_du_midi\n · 20 g\n'), t);
  assert.ok(t.includes('07:30 · Repas du matin\n · 45 g\n'), t);
  // Le repas abîmé se montre aussi : une ligne, jamais vide.
  assert.ok(/\n—\n/.test(t), 'le repas abîmé a disparu de l’encart');
  assert.ok(t.includes('Oublier l’ancienne liste'));
  assert.ok(t.includes('Les automatisations reliées restent associées au distributeur.'));
  // Au singulier.
  etat({ loggia_feeder: { haids: HAIDS, meals: [MEALS[0], MEALS[1]] } });
  const u = texteDe(objets());
  assert.ok(u.includes('1 repas relié à une automatisation') && u.includes('1 repas non relié : il ne distribuait rien par lui-même'), u);
});

test('sans ancienne liste, pas d’encart ; un compte ordinaire ne voit pas « Oublier »', () => {
  for (const meals of [[], null, [null, {}, { time: '' }], 'x']) {
    etat({ loggia_feeder: { haids: HAIDS, meals } });
    assert.ok(!texteDe(objets()).includes('Ancienne liste de repas'), JSON.stringify(meals));
  }
  etat({ loggia_feeder: { haids: HAIDS, meals: MEALS } });
  const t = texteDe(objets({ states: {}, user: { is_admin: false } }));
  assert.ok(t.includes('Ancienne liste de repas') && t.includes('1 repas relié à une automatisation'));
  assert.ok(!t.includes('Oublier l’ancienne liste'), 'un compte ordinaire peut oublier l’ancienne liste (ADR 0144)');
  // Pas d'encart dans une vue qui ne montre pas le distributeur.
  assert.ok(!texteDe(rendre(P.ViewEntSheet, { view: 'securite', hass: null, onClose: () => {} })).includes('Ancienne liste de repas'));
});

/* ── « Oublier l'ancienne liste » ─────────────────────────────────────────── */

test('« Oublier » vide la liste et garde ses automatisations reliées associées, sans toucher au reste', () => {
  const brut = { haid: 'select.distributeur_feed', haids: HAIDS, appareil: 'dist_cuisine', meals: MEALS, associees: ['automation.croquettes_du_midi'], autre: 1 };
  assert.deepEqual(P.oublierAncienneListe(brut), {
    haid: 'select.distributeur_feed', haids: HAIDS, appareil: 'dist_cuisine', autre: 1,
    meals: [], associees: ['automation.croquettes_du_midi', 'automation.croquettes_matin_et_soir'],
  });
  // Rien de relié : la liste se vide, rien ne s'invente. Jamais `null` : une
  // liste vidée volontairement reste vide.
  assert.deepEqual(P.oublierAncienneListe({ meals: [MEALS[0]] }), { meals: [], associees: [] });
  for (const v of [null, 42, 'x', []]) assert.deepEqual(P.oublierAncienneListe(v), { meals: [], associees: [] }, JSON.stringify(v));
  // Relu ensuite par « Enregistrer » : l'association survit, la liste ne revient pas.
  etat({ loggia_feeder: P.oublierAncienneListe(brut) });
  editeur().saveEnt();
  assert.deepEqual(envois[0].loggia_feeder.meals, []);
  assert.deepEqual(envois[0].loggia_feeder.associees, ['automation.croquettes_du_midi', 'automation.croquettes_matin_et_soir']);
  // Le geste passe par `BoutonConfirme`, relit la clé au moment du geste et dit un refus.
  const encart = PARAM.slice(PARAM.indexOf('function AncienneListeRepas('), PARAM.indexOf('\n}\n', PARAM.indexOf('function AncienneListeRepas(')));
  assert.match(encart, /<BoutonConfirme libelle=\{tr\('Oublier l’ancienne liste'\)\} onConfirme=\{oublier\} \/>/);
  assert.match(encart, /cfgSet\(\{ loggia_feeder: oublierAncienneListe\(cfgVal\('loggia_feeder', null\) \|\| loggiaEnt\('feeder', null\)\) \}\)/);
  assert.match(encart, /ok === false\) \{ setErr\(tr\('Réservé aux administrateurs\.'\)\)/);
  assert.match(encart, /\{!compteOrdinaire\(hass\) && \(/);
});

/* ── Ce que la mise à jour retire, dit à l'écran (05/10, relecture « données ») ──
 * La configuration de l'utilisateur : sept repas reliés à des automatisations,
 * `script.distribuer`, un réservoir `input_number` en grammes. Deux pertes se
 * faisaient SANS UN MOT : les jours de réserve (comptés jusqu'ici sur les
 * grammes de la liste ; ils demandent maintenant le poids d'une portion), et
 * « Distribuer » quand le script n'avait jamais été désigné (deviné à son nom
 * avant le 05/10, jamais depuis). */

const SCRIPT = 'script.distribuer';
const SEPT = ['07:00', '09:00', '11:00', '13:00', '15:00', '17:00', '19:00'].map(h => ({ id: 'r' + h.slice(0, 2), time: h, label: 'Repas ' + h, g: 15, auto: 'automation.repas_' + h.replace(':', '') }));
const MAISON = { states: {
  [SCRIPT]: { state: 'off', attributes: { friendly_name: 'Distribuer' } },
  'script.lumieres': { state: 'off', attributes: { friendly_name: 'Lumières du salon' } },
  'input_number.croquettes_reservoir': { state: '640', attributes: { unit_of_measurement: 'g', max: 1500 } },
} };
const RESERVOIR = { reservoir: 'input_number.croquettes_reservoir', portionWeight: null, distribuees: null };

test('sans poids de portion en grammes, l’encart dit que les grammes de la liste ne comptent plus la réserve', () => {
  const phrase = 'Les grammes de cette liste ne servent plus : sans poids de portion en grammes, la fiche ne compte plus les jours de réserve.';
  etat({ loggia_feeder: { haids: RESERVOIR, script: SCRIPT, meals: SEPT } });
  const t = texteDe(objets(MAISON));
  assert.ok(t.includes(phrase), t);
  assert.ok(t.includes('07:00 · Repas 07:00 · automation.repas_0700\n · 15 g\n'), t);
  // Une portion en grammes désignée : la réserve se compte, la phrase se tait.
  const avecPortion = { states: { ...MAISON.states, 'number.portion': { state: '15', attributes: { unit_of_measurement: 'g' } } } };
  etat({ loggia_feeder: { haids: { ...RESERVOIR, portionWeight: 'number.portion' }, script: SCRIPT, meals: SEPT } });
  assert.ok(!texteDe(objets(avecPortion)).includes(phrase), 'la réserve se compte : rien à dire');
  // Une liste sans grammes n'a rien perdu.
  etat({ loggia_feeder: { haids: RESERVOIR, script: SCRIPT, meals: SEPT.map(({ g, ...m }) => m) } });
  assert.ok(!texteDe(objets(MAISON)).includes(phrase), 'pas de grammes, pas de perte');
  // Un réservoir en % (ou sans réservoir) : la réserve ne se comptait déjà pas avant le 05/10
  // (`joursDeReserve` voulait des grammes dans le bac) — la phrase dirait une perte qui n'en est
  // pas une (05/10, contradicteur de C3). Les grammes restent visibles, ligne par ligne.
  const enPct = { states: { ...MAISON.states, 'sensor.bac_pct': { state: '38', attributes: { unit_of_measurement: '%' } } } };
  etat({ loggia_feeder: { haids: { ...RESERVOIR, reservoir: 'sensor.bac_pct' }, script: SCRIPT, meals: SEPT } });
  const tPct = texteDe(objets(enPct));
  assert.ok(!tPct.includes(phrase), 'réservoir en % : rien n’est perdu');
  assert.ok(tPct.includes('07:00 · Repas 07:00 · automation.repas_0700\n · 15 g\n'), tPct);
  etat({ loggia_feeder: { haids: { ...RESERVOIR, reservoir: null }, script: SCRIPT, meals: SEPT } });
  assert.ok(!texteDe(objets(MAISON)).includes(phrase), 'sans réservoir : rien n’est perdu');
});

test('script jamais désigné : « Distribuer » demande l’appareil ou le script, et les candidats sont PROPOSÉS, jamais choisis', () => {
  const sans = 'Distribuer » demande l’appareil, ou le script qui distribue : désignez-le ci-dessus.';
  etat({ loggia_feeder: { haids: RESERVOIR, meals: SEPT } });
  const t = texteDe(objets(MAISON));
  assert.ok(t.includes(sans), t);
  assert.ok(t.includes('Proposés d’après leur nom : Distribuer (script.distribuer).'), t);
  assert.ok(!t.includes('Lumières du salon ('), 'un script sans rapport n’est pas proposé');
  // Rien n'est choisi en silence : « Enregistrer » n'écrit aucun script.
  editeur(MAISON).saveEnt();
  assert.equal(envois[0].loggia_feeder.script, undefined, 'un script deviné a été écrit');
  // Le script désigné : « Distribuer » a sa commande, la phrase se tait.
  etat({ loggia_feeder: { haids: RESERVOIR, script: SCRIPT, meals: SEPT } });
  assert.ok(!texteDe(objets(MAISON)).includes(sans));
  // Un appareil qui distribue : pas de phrase non plus.
  etat({ loggia_feeder: { haids: HAIDS, appareil: 'dist_cuisine' } }, { index: indexDe() });
  assert.ok(!texteDe(objets({ states: STATES })).includes(sans));
  // Aucun distributeur du tout : la section ne réclame rien.
  etat({});
  assert.ok(!texteDe(objets(MAISON)).includes(sans), 'une maison sans distributeur lirait une demande');
  // Sans candidat : la demande seule.
  etat({ loggia_feeder: { haids: RESERVOIR, meals: SEPT } });
  const seule = texteDe(objets({ states: { 'input_number.croquettes_reservoir': MAISON.states['input_number.croquettes_reservoir'] } }));
  assert.ok(seule.includes(sans) && !seule.includes('Proposés d’après leur nom'), seule);
});

test('la liste du champ « Script de distribution » met les candidats en tête, sous un mot qui le dit', () => {
  const tous = [{ id: 'script.a', label: 'A', sub: 'script.a' }, { id: SCRIPT, label: 'Distribuer', sub: SCRIPT }, { id: 'script.z', label: 'Z', sub: 'script.z' }];
  assert.deepEqual(P.suggestionsScript(tous, [SCRIPT]), [
    { id: SCRIPT, label: 'Distribuer', sub: 'script.distribuer · peut-être celui qui distribue' },
    { id: 'script.a', label: 'A', sub: 'script.a' }, { id: 'script.z', label: 'Z', sub: 'script.z' },
  ]);
  assert.deepEqual(P.suggestionsScript(tous, []), tous);
  assert.deepEqual(P.suggestionsScript(null, [SCRIPT]), []);
  // …et c'est bien CETTE liste que reçoit le champ « Script de distribution », les candidats
  // lus dans la maison (05/10, contradicteur de C3 : débrancher l'appel ne rougissait rien —
  // ChampSuggere ne rend sa liste qu'au focus, un rendu serveur ne la voit pas).
  assert.match(PARAM, /const candidats = avecDistributeur \? scriptsCandidats\(etatsMaison\) : \[\];/);
  assert.match(PARAM, /suggestions=\{k === 'script' \? suggestionsScript\(sugg\(d\), candidats\) : sugg\(d\)\}/);
});

/* ── 4. Le champ « Appareil » ─────────────────────────────────────────────── */

/** Un index de deux appareils : un distributeur Zigbee2MQTT et une lampe. */
function indexDe() {
  const entityMeta = new Map([
    ['light.salon', { deviceId: 'lampe', device: 'Lampe du salon', platform: 'hue' }],
    ['select.distributeur_feed', { deviceId: 'dist_cuisine', device: 'Distributeur de croquettes', platform: 'mqtt' }],
    ['number.distributeur_portion', { deviceId: 'dist_cuisine', device: 'Distributeur de croquettes', platform: 'mqtt' }],
    ['sensor.desactive', { deviceId: 'autre', device: 'Autre', disabled: true }],
    ['input_number.croquettes_reservoir', { deviceId: null }],
  ]);
  const deviceMeta = new Map([
    ['lampe', { id: 'lampe', name: 'Lampe du salon', manufacturer: 'Signify', model: 'Hue Go' }],
    ['dist_cuisine', { id: 'dist_cuisine', name: 'Distributeur de croquettes', manufacturer: 'Aqara', model: 'C1' }],
  ]);
  return { entityMeta, deviceMeta };
}
const STATES = { 'select.distributeur_feed': { state: 'STOP', attributes: { options: ['STOP', 'START'] } }, 'light.salon': { state: 'on', attributes: {} } };

test('les appareils qui savent distribuer passent en tête, les autres suivent par nom', () => {
  assert.deepEqual(P.appareilsDistributeur(indexDe(), STATES), [
    { id: 'dist_cuisine', label: 'Distributeur de croquettes', sub: 'select.distributeur_feed', reconnu: true },
    { id: 'lampe', label: 'Lampe du salon', sub: 'Signify · Hue Go', reconnu: false },
  ]);
  // Une entité désactivée ne fait pas exister un appareil ; sans index, rien.
  for (const v of [null, {}, { entityMeta: 5 }]) assert.deepEqual(P.appareilsDistributeur(v, STATES), [], JSON.stringify(v));
});

test('le champ « Appareil » est une ListeChoix, jamais un <select> natif, et garde un appareil sorti de l’index', () => {
  etat({ loggia_feeder: { haids: HAIDS } }, { index: indexDe() });
  const html = objets({ states: STATES });
  assert.ok(html.includes('aria-label="Appareil : Aucun"'), 'le champ « Appareil » manque');
  assert.ok(!/<select\b/.test(html));
  etat({ loggia_feeder: { haids: HAIDS, appareil: 'dist_cuisine' } }, { index: indexDe() });
  assert.ok(objets({ states: STATES }).includes('aria-label="Appareil : Distributeur de croquettes"'));
  // Choisir un appareil MARQUE le formulaire touché : sans cela, « Oublier
  // l'ancienne liste » (une écriture de la configuration pendant l'édition)
  // relançait la lecture et effaçait l'appareil choisi — vu dans la démo.
  assert.match(PARAM, /const majFeeder = \(k, val\) => entSet\('feeder'\)\(\{ \.\.\.ent\.feeder, \[k\]: val \}\);/);
  assert.match(PARAM, /onChange=\{val => majFeeder\('appareil', val\)\}/);
  assert.doesNotMatch(PARAM, /setEnt\(o => \(\{ \.\.\.o, feeder:/, 'un champ du distributeur s’écrit sans marquer le formulaire touché');
  // Un appareil qui n'est plus dans l'index reste choisi, sous son identifiant.
  etat({ loggia_feeder: { haids: HAIDS, appareil: 'dist_parti' } }, { index: indexDe() });
  assert.ok(objets({ states: STATES }).includes('aria-label="Appareil : dist_parti"'));
});

/* Contradicteur (05/10) : la liste ne décrit plus que les sœurs des domaines
 * que la règle R1 lit sans configuration (bouton, nombre, texte, liste) — tout
 * décrire coûtait ~11 ms à chaque état de la maison, feuille ouverte. La
 * réponse doit rester EXACTEMENT celle de la règle entière, cas par cas de la
 * fixture partagée : un domaine ajouté à `commandeDistribuer` sans l'être ici
 * ferait tomber ce test, pas un distributeur dans la liste. */
test('la liste reconnaît exactement ce que reconnaît la règle entière, sur toute la fixture partagée', async () => {
  const D = await import('../src/distributeur.js');
  const F = JSON.parse(readFileSync(new URL('./fixtures/distributeurs.json', import.meta.url), 'utf8'));
  let vus = 0;
  for (const cas of F.cas) {
    const noms = new Map((cas.appareils || []).map(a => [a.device_id, a.nom]));
    const entityMeta = new Map();
    const states = {};
    for (const e of cas.entites) {
      entityMeta.set(e.entity_id, { deviceId: e.device_id || null, device: e.device_id ? (noms.get(e.device_id) || null) : null,
        category: e.categorie || null, hidden: !!e.masquee, disabled: !!e.desactivee, name: null,
        platform: e.plateforme || null, deviceClass: e.classe || null, translationKey: e.cle || null });
      if (e.etat != null) states[e.entity_id] = { entity_id: e.entity_id, state: e.etat, attributes: e.attributs || {} };
    }
    const index = { entityMeta };
    const liste = P.appareilsDistributeur(index, states);
    const appareils = new Set([...entityMeta.values()].filter(m => m.deviceId && !m.disabled).map(m => m.deviceId));
    assert.deepEqual(liste.map(a => a.id).sort(), [...appareils].sort(), `[${cas.id}] un appareil manque à la liste`);
    for (const a of liste) {
      const entiere = D.commandeDistribuer(D.soeursDistributeur(index, states, a.id), states, null);
      assert.equal(a.reconnu, !!entiere, `[${cas.id}] ${a.id}`);
      if (entiere) { assert.equal(a.sub, entiere.entity_id, `[${cas.id}] ${a.id}`); vus++; }
      // Le nom vient de l'appareil, même quand aucune sœur ne peut commander.
      assert.equal(a.label, noms.get(a.id) || a.id, `[${cas.id}] ${a.id}`);
    }
  }
  assert.ok(vus >= 20, 'la fixture ne reconnaît presque plus rien : le test ne prouve plus rien');
});
