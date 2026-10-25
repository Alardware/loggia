/* TEST AJOUTÉ (chantier IoT, tâche 9, 18/10 ; sa maquette « Cartes IoT », 1c et 1d ; I18, I19, I20) — les trois onglets de la
 * fiche d'un robot qui suivent son Accueil.
 *  - I18, le Planning qui prévient : l'heure en 22 / 800, au gris éteint si le passage l'est ; les sept jours en puces de 34 px ;
 *    « Dans « Ne pas déranger » : ce passage n'aura pas lieu. » ; « Aucun départ entre 22:00 et 07:00 » / « Les passages partent à
 *    toute heure » ; « De − 22:00 + à − 07:00 + » par pas de 30 min ; l'avertissement de l'application du fabricant ; un compte
 *    ordinaire lit le planning sans rien régler ;
 *  - I19, l'Historique : les sept jours glissants — Passages, Durée, Surface —, la session en cours en tête, puis chaque passage avec
 *    ses pièces, son heure et sa durée, son motif, son issue en couleur ; sans carnet, l'historique d'état ; plus de barres ;
 *  - I20, l'Entretien qui alerte : rouge sous 15, ambre sous 35, neutre au-dessus ; « Remplacé » seulement si l'appareil a le bouton
 *    et pas à 100 % ; il DEMANDE sur sa rangée avant de remettre le compteur à zéro — une remise à zéro ne se rattrape pas.
 * La fiche se joue comme dans tests/fiche_robot.test.mjs (tests/crochets.mjs) : la vue de sa carte d'abord, la fiche ensuite ; un
 * onglet se monte à son tour, à ses props. Le serveur est doublé ; l'heure est celle de la maquette, samedi 17/10/2026, 18:20. */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

import { monter, horlogeFausse, documentFaux, texteDe, parcourir } from './crochets.mjs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
register('data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?fiche_robot_onglets')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -'?fiche_robot_onglets'.length), ctx);",
  "  return { ...r, source: String(r.source) + ';export { useVueRobot };' };",
  '}',
].join('\n')));
const { setLoggiaState } = await import('../src/state.js');
const F = await import(new URL('../src/App.jsx?fiche_robot_onglets', import.meta.url).href);
const FR = await import(new URL('../src/ficherobot.jsx', import.meta.url).href);
// La brique commune de l'Entretien (passe bis 2 de l'étape 2 IoT, 19/10) : montée seule, à des pièces fabriquées.
const FC = await import(new URL('../src/fichecommune.jsx', import.meta.url).href);
const RE = await import('../src/robotsetat.js');
const R = { ...(await import('../src/robots.js')), ...(await import('../src/robotsfiche.js')) };

const T = new Date(2026, 9, 17, 18, 20).getTime();
const S = T / 1000;
const ASP = 'vacuum.aspirateur', TOND = 'lawn_mower.tondeuse';
const FILTRE = 'sensor.aspirateur_filtre', BROSSE = 'sensor.aspirateur_brosse', LATERALE = 'sensor.aspirateur_brosse_laterale';
const RAZ_FILTRE = 'button.aspirateur_filtre_raz', RAZ_LATERALE = 'button.aspirateur_brosse_laterale_raz', TOTAL = 'sensor.aspirateur_surface_totale';
const PLUIE_A = 'switch.tondeuse_a', PLUIE_B = 'switch.tondeuse_b';
const st = (id, state, attributes = {}, depuis = new Date(2026, 9, 17, 16, 40).toISOString()) => ({ entity_id: id, state, last_changed: depuis, last_updated: depuis, attributes });
function maison() {
  return {
    [ASP]: st(ASP, 'docked', { friendly_name: 'Aspirateur', battery_level: 92, supported_features: 8828 }),
    [FILTRE]: st(FILTRE, '32', { friendly_name: 'Aspirateur Filtre', unit_of_measurement: '%' }),
    [BROSSE]: st(BROSSE, '12', { friendly_name: 'Aspirateur Brosse principale', unit_of_measurement: '%' }),
    [LATERALE]: st(LATERALE, '100', { friendly_name: 'Aspirateur Brosse latérale', unit_of_measurement: '%' }),
    [RAZ_FILTRE]: st(RAZ_FILTRE, 'unknown', { friendly_name: 'Aspirateur Remise à zéro du filtre' }),
    [RAZ_LATERALE]: st(RAZ_LATERALE, 'unknown', { friendly_name: 'Aspirateur Remise à zéro de la brosse latérale' }),
    [TOTAL]: st(TOTAL, '1843', { friendly_name: 'Aspirateur Surface totale nettoyée', unit_of_measurement: 'm²' }),
    [TOND]: st(TOND, 'docked', { friendly_name: 'Tondeuse', battery_level: 64, supported_features: 7 }),
    // Deux interrupteurs de pluie : le premier par l'identifiant n'est PAS celui de la détection (I18).
    [PLUIE_A]: st(PLUIE_A, 'off', { friendly_name: 'Tondeuse Pluie pendant la tonte' }),
    [PLUIE_B]: st(PLUIE_B, 'on', { friendly_name: 'Tondeuse Détection de pluie' }),
  };
}
const META = new Map([
  [ASP, { deviceId: 'd1', device: 'Aspirateur', platform: 'ecovacs' }],
  [FILTRE, { deviceId: 'd1', device: 'Aspirateur', platform: 'ecovacs', translationKey: 'lifespan_filter' }],
  [BROSSE, { deviceId: 'd1', device: 'Aspirateur', platform: 'ecovacs', translationKey: 'lifespan_brush' }],
  [LATERALE, { deviceId: 'd1', device: 'Aspirateur', platform: 'ecovacs', translationKey: 'lifespan_side_brush' }],
  [RAZ_FILTRE, { deviceId: 'd1', device: 'Aspirateur', platform: 'ecovacs', translationKey: 'reset_lifespan_filter' }],
  [RAZ_LATERALE, { deviceId: 'd1', device: 'Aspirateur', platform: 'ecovacs', translationKey: 'reset_lifespan_side_brush' }],
  [TOTAL, { deviceId: 'd1', device: 'Aspirateur', platform: 'ecovacs', translationKey: 'total_stats_area' }],
  [TOND, { deviceId: 'd2', device: 'Tondeuse', platform: 'mammotion' }],
  [PLUIE_A, { deviceId: 'd2', device: 'Tondeuse', platform: 'mammotion', translationKey: 'rain_delay_during_mowing' }],
  [PLUIE_B, { deviceId: 'd2', device: 'Tondeuse', platform: 'mammotion', translationKey: 'rain_detection' }],
]);
const ETAT = () => ({
  maintenant: S, meteo: null, journal: [], erreurs: {}, en_cours: {},
  passages: [
    { robot: ASP, debut: S - 86400, fin: S - 86400 + 3060, duree_min: 51, issue: 'termine', zones: [], tout: true, source: 'loggia', surface: 68, motif: null },
    { robot: ASP, debut: S - 3 * 86400, fin: S - 3 * 86400 + 2700, duree_min: 45, issue: 'interrompu', zones: [{ id: 'seg:1', nom: 'Salon' }], tout: false, source: 'appareil', surface: 61, motif: 'Bloqué sous le canapé' },
    { robot: ASP, debut: S - 9 * 86400, fin: S - 9 * 86400 + 3000, duree_min: 50, issue: 'termine', zones: [], tout: true, source: 'loggia', surface: 70, motif: null },
  ],
  config: { plannings: [{ id: 'semaine', robot: ASP, heure: '09:30', jours: [0, 1, 2, 3, 4], zones: [], actif: true },
    { id: 'nuit', robot: ASP, heure: '23:00', jours: [5, 6], zones: [], actif: true }],
  robots: { [ASP]: { calme: { actif: true, debut: '22:00', fin: '07:00' }, pluie: { actif: false } } } },
});
/* La maison et le serveur de Loggia doublés : `etat` rend ce que le test pose (`muet` : un composant d'avant ce chantier) ; les
 * autres messages attendent la réponse du test. `ordinaire` : un compte Home Assistant qui n'est pas administrateur ; `histoire` :
 * ce que rend l'historique d'état. */
function poser({ retouche = null, etat = ETAT(), muet = false, ordinaire = false, histoire = [] } = {}) {
  const courants = maison();
  if (retouche) retouche(courants);
  setLoggiaState({ index: { entityMeta: META, deviceMeta: new Map(), areaList: [{ name: 'Salon', entities: [ASP] }], areaNameOf: () => 'Salon', services: null }, ent: {}, cfg: {}, resolved: {} });
  const appels = [], ws = [], rejets = [];
  const serveur = {
    callWS: (msg) => {
      if (msg.type === 'loggia/robots/etat') { ws.push(msg); return muet ? Promise.reject({ code: 'unknown_command', message: 'Unknown command.' }) : Promise.resolve(JSON.parse(JSON.stringify(etat))); }
      return new Promise((ok, ko) => ws.push({ ...msg, ok, ko }));
    },
  };
  RE.reglerRobotsEtat({ hass: serveur, signaler: (e) => rejets.push(e) });
  const hass = () => ({ ...serveur, states: Object.fromEntries(Object.entries(courants).map(([k, v]) => [k, { ...v, attributes: { ...v.attributes } }])),
    ...(ordinaire ? { user: { is_admin: false } } : {}),
    callApi: () => Promise.resolve(JSON.parse(JSON.stringify(histoire))),
    callService: (d, s, data, cible) => { const ids = (cible && cible.entity_id) || (data && data.entity_id); appels.push(d + '.' + s + ' ' + [].concat(ids).join(',')); return Promise.resolve(); } });
  return { appels, ws, rejets, courants, hass };
}
async function dans(fn) {
  const h = horlogeFausse(), d = documentFaux();
  const vraiNow = Date.now;
  h.installer(); d.installer();
  globalThis.document.documentElement = { classList: { contains: () => false } };
  Date.now = () => T;
  try { return await fn({ h, d }); } finally { Date.now = vraiNow; h.restaurer(); d.restaurer(); setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null }); }
}
const attendre = () => new Promise(r => setImmediate(r));
const de = (m, nom) => m.trouver(e => e.type && e.type.name === nom)[0];
const tous = (m, nom) => m.trouver(e => e.type && e.type.name === nom);
// Une puce de « De − 22:00 + à − 07:00 + » (`PasHeure`, nommée par ce qu'elle fait : son `aria-label`).
const pasHeure = (m, nom) => m.trouver(e => e.type && e.type.name === 'PasHeure' && e.props.nom === nom)[0];
const ecrit = (m, texte) => m.trouver(e => e.props && typeof e.props.children === 'string' && e.props.children === texte);
/* La fiche sur la vue de sa carte, puis l'onglet voulu, monté à ses props. */
async function onglet(w, nom, id = ASP) {
  const domaine = id.split('.')[0];
  const vue = monter((p) => F.useVueRobot(p.hass, p.id, null, true, { rapide: true }), { hass: w.hass(), id });
  await attendre();
  vue.rendre();
  const m = monter(FR.default, { hass: w.hass(), idRobot: id, domaine, vue: vue.arbre, plaque: null, sousNom: null, epingle: null, onFiche: () => {} });
  await attendre();
  m.rendre();
  de(m, 'FicheOnglets').props.onChoisir(nom); m.rendre();
  const nomComposant = { planning: 'OngletPlanning', historique: 'OngletHistorique', entretien: 'OngletEntretien' }[nom];
  const el = de(m, nomComposant);
  assert.ok(el, nomComposant + ' : l’onglet ne se montre pas');
  return { m, vue, el, o: monter(el.type, el.props) };
}

test('I18 : le Planning de sa maquette — l’heure en 22 / 800, les jours en puces de 34 px, le passage retenu par « Ne pas déranger » le dit', () => dans(async () => {
  const w = poser();
  const { o } = await onglet(w, 'planning');
  const t = o.texte();
  assert.ok(t.includes('Passages planifiés') && t.includes('Ajouter'), t);
  const heure = ecrit(o, '09:30')[0];
  assert.deepEqual([heure.props.style.fontSize, heure.props.style.fontWeight, heure.props.style.color], [22, 800, 'var(--o-text)'], 'l’heure de sa maquette');
  assert.equal(t.split('Dans « Ne pas déranger » : ce passage n’aura pas lieu.').length - 1, 1, '23:00 le week-end, et lui seul');
  /* ASSERTION MODIFIÉE (passe bis du 18/10, point 13) : les jours d'un passage sont les PUCES de sa maquette — pleine largeur, 34 px de
   * haut, dans une grille de sept colonnes, le rayon 10 —, plus les pastilles rondes communes (`PuceJour`). */
  const jours = tous(o, 'JourPassage');
  assert.equal(jours.length, 14, 'sept jours par passage');
  const jour = monter(jours[0].type, jours[0].props).arbre;
  assert.deepEqual([jour.props.style.width, jour.props.style.height, jour.props.style.borderRadius, jour.props.style.fontSize, jour.props['aria-label']], ['100%', 34, 10, 11.5, 'Lundi'], 'des puces de 34 px, pleine largeur');
  assert.equal(tous(o, 'PuceJour').length, 0);
  assert.ok(t.includes('Ne pas déranger') && t.includes('Aucun départ entre 22:00 et 07:00'), 'la plage dite en clair');
  assert.ok(t.includes('Si l’application du fabricant programme aussi des passages, coupez-les : sinon il part deux fois.'), 'dès qu’un passage est actif');
  assert.ok(!tous(o, 'ChampHeure').length, 'plus de champ d’heure natif');
}));

test('I18 : « De − 22:00 + à − 07:00 + » par pas de 30 min — chaque pas part au serveur ; un passage éteint a l’heure au gris éteint', () => dans(async () => {
  const etat = ETAT();
  etat.config.plannings[1].actif = false;
  const w = poser({ etat });
  const { o } = await onglet(w, 'planning');
  assert.equal(ecrit(o, '23:00')[0].props.style.color, 'var(--o-text3)', 'éteint : le gris de texte éteint, pas l’ambre');
  assert.ok(!o.texte().includes('Dans « Ne pas déranger »'), 'éteint, il ne prévient de rien');
  for (const nom of ['Début plus tôt', 'Début plus tard', 'Fin plus tôt', 'Fin plus tard']) assert.ok(pasHeure(o, nom), nom + ' : la puce manque');
  o.appuyer(pasHeure(o, 'Début plus tard'));
  o.appuyer(pasHeure(o, 'Fin plus tôt'));
  const patchs = w.ws.filter(x => x.type === 'loggia/robots/config').map(x => x.patch);
  assert.deepEqual(patchs, [{ robots: { [ASP]: { calme: { debut: '22:30' } } } }, { robots: { [ASP]: { calme: { fin: '06:30' } } } }]);
  assert.deepEqual([R.decalerHeure('23:30', 30), R.decalerHeure('00:00', -30), R.decalerHeure('07:00', 30), R.decalerHeure('nuit', 30)], ['00:00', '23:30', '07:30', 'nuit'], 'le cadran de 24 h');
}));

/* TEST AJOUTÉ (passe bis du 18/10, point 7) : la réponse d'un enregistrement se posait sur l'état FIGÉ du dernier rendu de la fiche —
 * un relevé arrivé entre-temps (un passage qui commence) était effacé. Elle se pose sur l'état frais du magasin. */
test('point 7 : la configuration rendue par le serveur se pose sur l’état frais, pas sur celui du dernier rendu', () => dans(async () => {
  const w = poser();
  const { o } = await onglet(w, 'planning');
  o.appuyer(pasHeure(o, 'Début plus tard'));
  const ecrit = w.ws.find(x => x.type === 'loggia/robots/config');
  // Entre l'écriture et sa réponse, un relevé : l'aspirateur s'est mis au travail.
  const frais = ETAT();
  frais.en_cours[ASP] = { debut: S - 60, phase: 'travail', duree_min: 1, zones: [], tout: true, source: 'loggia', surface: null };
  RE.poserEtatRobots(frais);
  const config = JSON.parse(JSON.stringify(frais.config));
  config.robots[ASP].calme.debut = '22:30';
  ecrit.ok({ config });
  await attendre();
  const e = RE.lireEtatRobots().etat;
  assert.deepEqual([e.config.robots[ASP].calme.debut, !!e.en_cours[ASP]], ['22:30', true], 'la configuration rendue, et le passage du relevé gardé');
}));

test('I18 : « Ne pas déranger » éteint — « Les passages partent à toute heure » ; un compte ordinaire lit le planning sans rien régler', () => dans(async () => {
  const etat = ETAT();
  etat.config.robots[ASP].calme.actif = false;
  const w = poser({ etat, ordinaire: true });
  const { o } = await onglet(w, 'planning');
  const t = o.texte();
  assert.ok(t.includes('Les passages partent à toute heure') && !t.includes('Dans « Ne pas déranger »'), t);
  assert.ok(t.includes('09:30') && t.includes('23:00'), 'il lit les passages');
  assert.ok(!t.includes('Ajouter'), 'rien à ajouter');
  assert.equal(tous(o, 'Bascule').length, 0, 'rien à basculer');
  assert.ok(tous(o, 'JourPassage').every(j => j.props.disabled), 'les jours se lisent'); // ASSERTION MODIFIÉE (passe bis du 18/10, point 13) : les puces de sa maquette
  assert.equal(pasHeure(o, 'Début plus tard'), undefined, 'la plage se lit');
  assert.equal(o.trouver(e => e.props && e.props['aria-haspopup'] === 'dialog').length, 0, 'un passage ne s’ouvre pas');
}));

/* TEST AJOUTÉ (passe bis du 18/10, point 11) : la feuille d'un passage se pose dans <body> (`BottomSheet`, par un portail), HORS de la
 * fiche du robot (`.rb-aspirateur`, `.rb-tondeuse`) : les jetons du robot (`--rb-*`) n'y existent pas — « Enregistrer » y était
 * peint de `var(--rb-fond)`, donc d'aucune couleur, du texte blanc sur rien en thème clair. Il prend le bleu plein du thème. */
test('point 11 : « Enregistrer » d’un passage — la feuille vit dans <body> : le bleu plein du thème, jamais un jeton du robot', () => dans(async () => {
  const w = poser();
  const { o } = await onglet(w, 'planning');
  o.appuyer(o.trouver(e => e.type === 'button' && texteDe(e) === 'Ajouter')[0]);
  const f = de(o, 'FeuillePlanning');
  assert.ok(f, 'la feuille d’un passage neuf');
  const contenu = monter(f.type, f.props).arbre.props.children(() => {});
  const boutons = [];
  parcourir(contenu, (e) => { if (e.type === 'button') boutons.push(e); });
  const enregistrer = boutons.find(b => texteDe(b) === 'Enregistrer');
  assert.deepEqual([enregistrer.props.style.background, enregistrer.props.style.color], ['var(--o-accent-fond)', '#fff']);
  const styles = [];
  parcourir(contenu, (e) => { if (e.props && e.props.style) styles.push(JSON.stringify(e.props.style)); });
  assert.ok(!styles.some(s => s.includes('--rb-')), 'aucun jeton du robot dans une feuille posée dans <body>');
}));

/* TEST AJOUTÉ (passe bis du 18/10, point 13) : le rayon 10 de la puce de sa maquette (`ChipButton`) — les pas de « Ne pas déranger »
 * (40 × 40), « Remplacé » (36 px) et les deux puces de sa question. */
test('point 13 : les pas de la plage, « Remplacé » et sa question ont le rayon de sa maquette', () => dans(async () => {
  const w = poser();
  const { o } = await onglet(w, 'planning');
  const pas = monter(pasHeure(o, 'Début plus tôt').type, pasHeure(o, 'Début plus tôt').props).arbre;
  assert.deepEqual([pas.props.style.borderRadius, pas.props.style.width, pas.props.style.height], [10, 40, 40]);
  const { o: e } = await onglet(poser(), 'entretien');
  const remplace = ecrit(e, 'Remplacé')[0];
  assert.deepEqual([remplace.props.style.borderRadius, remplace.props.style.height], [10, 36]);
  e.appuyer(remplace);
  assert.deepEqual(['Annuler', 'Oui, 100 %'].map(t => ecrit(e, t)[0].props.style.borderRadius), [10, 10]);
}));

test('I18 : la pluie de la tondeuse — l’interrupteur de clé `rain_detection` passe avant tout autre', () => dans(async () => {
  const w = poser();
  const { o } = await onglet(w, 'planning', TOND);
  const pluie = tous(o, 'Bascule').find(b => b.props.nom === 'Capteur de pluie');
  assert.ok(pluie, 'la pluie de l’appareil, sous « Ne pas déranger »');
  assert.equal(pluie.props.on, true, 'celui de la détection, allumé — pas « Pluie pendant la tonte », éteint');
  pluie.props.cb();
  assert.deepEqual(w.appels, ['switch.turn_off ' + PLUIE_B]);
}));

test('I19 : l’Historique, sept jours glissants — Passages, Durée, Surface ; la session en cours en tête ; le motif ; l’issue en couleur', () => dans(async () => {
  const etat = ETAT();
  etat.en_cours[ASP] = { debut: new Date(2026, 9, 17, 16, 40).getTime() / 1000, phase: 'travail', duree_min: 100, zones: [{ id: 'seg:1', nom: 'Salon' }, { id: 'seg:2', nom: 'Cuisine' }], tout: false, source: 'loggia', surface: 42 };
  const w = poser({ retouche: (c) => { c[ASP].state = 'cleaning'; }, etat });
  const { el, o } = await onglet(w, 'historique');
  assert.deepEqual([el.props.resume.n, el.props.resume.dureeMin, el.props.resume.surface], [3, 196, 171], 'le passage d’il y a neuf jours n’en est plus');
  assert.deepEqual(el.props.rangees.map(r => [r.badge, r.quoi, r.ligne, r.surface, r.mot, r.encre, r.motif]), [
    ['Auj.', 'Salon · Cuisine', 'Depuis 16:40', 42, 'En cours', 'var(--rb-doux)', null],
    ['Hier', 'Tout le logement', '18:20 · 51 min', 68, 'Terminé', 'var(--o-text2)', null],
    ['Mer', 'Salon', '18:20 · 45 min', 61, 'Interrompu', 'var(--o-warn)', 'Bloqué sous le canapé'],
  ]);
  const t = o.texte();
  assert.ok(t.includes('7 derniers jours') && t.includes('Passages') && t.includes('Durée') && t.includes('3 h 16') && t.includes('171 m²'), t);
  assert.ok(t.includes('Bloqué sous le canapé'), 'le motif');
  assert.equal(o.trouver(e => e.props && e.props.role === 'img').length, 0, 'les barres partent');
}));

/* TEST AJOUTÉ (passe bis du 18/10, point 2) : quand les aires visées sont TOUTES ses aires, le passage se dit « tout le jardin » — sur
 * la carte (« Tond · tout le jardin »), dans l'Accueil et à l'Historique (« Tout le jardin »), comme sa maquette et le § 6 ; sinon,
 * la liste de ses aires. Le carnet garde les aires (les puces du passage en cours les montrent choisies), et `tout` l'emporte. */
test('point 2 : toutes ses aires, c’est « tout le jardin » — la carte, l’Accueil, l’Historique ; sinon la liste', () => {
  const aires = [{ id: 'switch.t_avant', nom: 'Pelouse avant' }, { id: 'switch.t_arriere', nom: 'Pelouse arrière' }];
  const etat = { config: { plannings: [], robots: {} }, erreurs: {},
    en_cours: { [TOND]: { debut: S - 600, phase: 'travail', duree_min: 10, zones: aires, tout: true, source: 'loggia', surface: null } },
    passages: [{ robot: TOND, debut: S - 86400, fin: S - 86400 + 3600, duree_min: 60, issue: 'termine', zones: aires, tout: true, source: 'loggia', surface: 210, motif: null },
      { robot: TOND, debut: S - 2 * 86400, fin: S - 2 * 86400 + 1800, duree_min: 30, issue: 'termine', zones: aires.slice(0, 1), tout: false, source: 'loggia', surface: 96, motif: null }] };
  const c = RE.vueCarnetRobot(etat, TOND, T);
  assert.deepEqual([c.pieces, c.tout], [null, true], '`tout` l’emporte sur la liste');
  assert.equal(R.phraseRobot({ domaine: 'lawn_mower', phase: 'travail', pieces: c.pieces, tout: c.tout, maintenant: T }).texte, 'Tond · tout le jardin');
  assert.equal(R.etatAccueil({ domaine: 'lawn_mower', phase: 'travail', pieces: c.pieces, tout: c.tout, maintenant: T }).phrase, 'Tout le jardin');
  const rangees = R.rangeesHistorique(R.sessionsCarnet(etat, TOND), { domaine: 'lawn_mower', maintenant: T, loc: 'fr-FR' });
  assert.deepEqual(rangees.map(r => r.quoi), ['Tout le jardin', 'Tout le jardin', 'Pelouse avant']);
});

/* TEST AJOUTÉ (passe bis du 18/10, point A) : un passage lancé par un script maison se dit, à l'Historique et dans l'Accueil, par le
 * nom du script — « Nettoyer la buanderie » —, plutôt que « Nettoyage » ; ses pièces, s'il les sait, passent devant.
 * ASSERTION MODIFIÉE (passe bis 2 du 18/10, point L) : l'exemple d'avant était le nom d'un script de SON installation. */
test('point A : à l’Historique, le nom du script maison dit le passage', () => {
  const etat = { config: { plannings: [], robots: {} }, erreurs: {},
    en_cours: { [ASP]: { debut: S - 600, phase: 'travail', duree_min: 10, zones: [], tout: false, source: 'loggia', surface: null, libelle: 'Nettoyer la buanderie' } },
    passages: [{ robot: ASP, debut: S - 86400, fin: S - 86400 + 1200, duree_min: 20, issue: 'termine', zones: [], tout: false, source: 'loggia', surface: null, motif: null, libelle: 'Nettoyer la buanderie' },
      { robot: ASP, debut: S - 2 * 86400, fin: S - 2 * 86400 + 1200, duree_min: 20, issue: 'termine', zones: [{ id: 'bureau', nom: 'Bureau' }], tout: false, source: 'loggia', surface: null, motif: null, libelle: 'Nettoyer les pièces' }] };
  const rangees = R.rangeesHistorique(R.sessionsCarnet(etat, ASP), { domaine: 'vacuum', maintenant: T, loc: 'fr-FR' });
  assert.deepEqual(rangees.map(r => r.quoi), ['Nettoyer la buanderie', 'Nettoyer la buanderie', 'Bureau']);
  const c = RE.vueCarnetRobot(etat, ASP, T);
  assert.equal(R.etatAccueil({ phase: 'travail', pieces: c.pieces, tout: c.tout, libelle: c.libelle, maintenant: T }).phrase, 'Nettoyer la buanderie');
});

/* TEST AJOUTÉ (passe bis 2 du 18/10, point I) : un passage du planning que le serveur a RETENU se lisait au Journal seulement. Il se
 * dit aussi dans l'Accueil de la popup — une ligne sobre, qui ouvre le Planning —, sa cause traduite, et seulement s'il date de moins
 * d'un jour et qu'aucun passage du planning n'est parti depuis. */
test('point I : un passage retenu se dit dans l’Accueil — une ligne sobre, qui ouvre le Planning ; seulement s’il est récent', () => dans(async () => {
  const ligne = (ts, quoi, detail, heure = '09:30') => ({ ts, module: 'robots', regle: 'planning', quoi, cibles: [TOND], n: 0, motif: 'planning ' + heure,
    detail, g: { motif: [['planning {heure}', { heure }]] } });
  const avec = (journal) => { const e = ETAT(); e.journal = journal; return e; };
  // Le dernier passage du planning de la tondeuse : retenu ce matin, faute de zone allumée.
  assert.deepEqual(R.passageRetenu(avec([ligne(S - 8 * 3600, 'retenu', 'aucune zone allumée')]), TOND, T), { heure: '09:30', pourquoi: 'aucune zone allumée' });
  assert.equal(R.passageRetenu(avec([ligne(S - 26 * 3600, 'retenu', 'pluie')]), TOND, T), null, 'plus d’un jour : il ne se dit plus');
  assert.equal(R.passageRetenu(avec([ligne(S - 3600, 'tondre', '', '17:20'), ligne(S - 8 * 3600, 'retenu', 'pluie')]), TOND, T), null, 'un passage parti depuis l’efface');
  assert.equal(R.passageRetenu(avec([ligne(S - 3600, 'retenu', 'pluie')]), ASP, T), null, 'celui de ce robot seulement');
  assert.equal(R.passageRetenu(null, TOND, T), null);
  // Dans la popup de la tondeuse : la ligne, et elle ouvre le Planning.
  const w = poser({ etat: avec([ligne(S - 8 * 3600, 'retenu', 'aucune zone allumée')]) });
  const vue = monter((p) => F.useVueRobot(p.hass, p.id, null, true, { rapide: true }), { hass: w.hass(), id: TOND });
  await attendre();
  vue.rendre();
  const m = monter(FR.default, { hass: w.hass(), idRobot: TOND, domaine: 'lawn_mower', vue: vue.arbre, plaque: null, sousNom: null, epingle: null, onFiche: () => {} });
  const accueil = de(m, 'OngletAccueil');
  assert.deepEqual(accueil.props.retenu, { heure: '09:30', pourquoi: 'aucune zone allumée' });
  const ma = monter(accueil.type, accueil.props);
  const bouton = ma.trouver(e => e.type === 'button' && e.props.className === 'rb-a-retenu')[0];
  assert.ok(bouton && texteDe(bouton).includes('Passage de 09:30 retenu : aucune zone allumée'), ma.texte());
  ma.appuyer(bouton);
  m.rendre();
  assert.equal(de(m, 'PanneauOnglet').props.actuel, 'planning', 'elle ouvre le Planning, où l’on règle ce qui l’a retenu');
  // Rien de retenu : pas de ligne.
  const w2 = poser();
  const vue2 = monter((p) => F.useVueRobot(p.hass, p.id, null, true, { rapide: true }), { hass: w2.hass(), id: TOND });
  await attendre();
  vue2.rendre();
  const m2 = monter(FR.default, { hass: w2.hass(), idRobot: TOND, domaine: 'lawn_mower', vue: vue2.arbre, plaque: null, sousNom: null, epingle: null, onFiche: () => {} });
  assert.equal(de(m2, 'OngletAccueil').props.retenu, null);
}));

test('I19 : sans carnet, l’historique d’état — « Nettoyage », ses pièces ne se savent pas ; rien du tout : « Aucun passage ces 7 derniers jours. »', () => dans(async () => {
  const histoire = [[st(ASP, 'cleaning', {}, new Date(2026, 9, 16, 8, 30).toISOString()), st(ASP, 'docked', {}, new Date(2026, 9, 16, 9, 21).toISOString())]];
  const w = poser({ muet: true, histoire });
  const { m, vue } = await onglet(w, 'historique');
  await attendre();
  m.rendre();
  const el = de(m, 'OngletHistorique');
  assert.deepEqual(el.props.rangees.map(r => [r.badge, r.quoi, r.ligne, r.mot]), [['Hier', 'Nettoyage', '08:30 · 51 min', 'Terminé']]);
  assert.equal(vue.arbre.etat, null, 'le composant ne répond pas');
  const w2 = poser({ muet: true });
  const { m: m2 } = await onglet(w2, 'historique');
  await attendre();
  m2.rendre();
  const o2 = monter(de(m2, 'OngletHistorique').type, de(m2, 'OngletHistorique').props);
  assert.ok(o2.texte().includes('Aucun passage ces 7 derniers jours.'), o2.texte());
}));

test('I20 : l’Entretien qui alerte — rouge sous 15, ambre sous 35, neutre au-dessus ; la phrase de sa maquette', () => dans(async () => {
  const w = poser();
  const { o } = await onglet(w, 'entretien');
  const pct = (v) => ecrit(o, v + ' %')[0];
  assert.deepEqual([pct(32).props.style.color, pct(12).props.style.color, pct(100).props.style.color], ['var(--o-warn)', 'var(--o-bad)', 'var(--o-text1)']);
  const barres = o.trouver(e => e.props && e.props.style && e.props.style.position === 'absolute' && /%$/.test(String(e.props.style.width)));
  assert.deepEqual(barres.map(b => [b.props.style.width, b.props.style.background]), [['32%', 'var(--o-warn)'], ['12%', 'var(--o-bad)'], ['100%', 'var(--o-text3)']], 'la barre de 6 px, dans la même règle');
  assert.ok(o.texte().includes('2 pièces à changer bientôt. Touchez « Remplacé » après l’intervention : son compteur repart à 100 %.'), o.texte());
  assert.deepEqual([0, 14, 15, 34, 35, 100].map(R.niveauUsure), ['bas', 'bas', 'moyen', 'moyen', 'bon', 'bon'], 'les seuils de sa maquette');
  // Sans bouton de remise à zéro, la seconde moitié de la phrase ne dit rien qui vaille.
  /* ASSERTION MODIFIÉE (passe bis du 18/10, point 15) : jamais de « Tout va bien » permanent — tout au-dessus de 35 %, l'Entretien ne
   * dit RIEN (ni « Tout est en ordre. », ni son « Touchez « Remplacé » … ») ; la phrase ne vient qu'avec une pièce à changer. */
  assert.equal(R.phraseEntretien([{ nom: 'Filtre', pct: 80, niveau: 'bon', reset: null }]), null);
  assert.equal(R.phraseEntretien([{ nom: 'Filtre', pct: 32, niveau: 'moyen', reset: null }]), '1 pièce à changer bientôt.');
  assert.equal(R.phraseEntretien([{ nom: 'Filtre', pct: 80, niveau: 'bon', reset: 'button.x' }]), null);
}));

/* TEST AJOUTÉ (passe bis du 18/10, point 15) : tout au-dessus de 35 %, l'Entretien ne dit RIEN — pas de « Tout va bien » permanent ;
 * et chez qui n'a pas activé les boutons de remise à zéro, « Remplacé » ne s'offre pas, et aucune phrase ne le remplace. */
test('point 15 : l’Entretien sans phrase permanente — rien au-dessus de 35 % ; sans bouton, ni « Remplacé » ni phrase pour lui', () => dans(async () => {
  const w = poser({ retouche: (c) => { c[FILTRE].state = '80'; c[BROSSE].state = '64'; delete c[RAZ_FILTRE]; delete c[RAZ_LATERALE]; } });
  const { o } = await onglet(w, 'entretien');
  const t = o.texte();
  assert.ok(!/Tout est en ordre|Touchez|Remplacé/.test(t), t);
  assert.equal(o.trouver(e => e.props && e.props.style && e.props.style.fontSize === 12.5 && e.props.style.lineHeight === 1.45).length, 0, 'pas de ligne d’introduction');
  assert.ok(t.includes('80 %') && t.includes('Surface totale nettoyée'), 'les pièces et les compteurs restent');
  // Une pièce sous 35 %, sans bouton : la phrase dit ce qui presse, sans « Touchez « Remplacé » ».
  const w2 = poser({ retouche: (c) => { delete c[RAZ_FILTRE]; delete c[RAZ_LATERALE]; } });
  const { o: o2 } = await onglet(w2, 'entretien');
  assert.ok(o2.texte().includes('2 pièces à changer bientôt.') && !o2.texte().includes('Touchez') && !o2.texte().includes('Remplacé'), o2.texte());
}));

test('I20 : « Remplacé » — seulement si l’appareil a le bouton, et pas à 100 % ; il demande sur sa rangée, et seul « Oui, 100 % » remet à zéro', () => dans(async () => {
  const w = poser();
  const { o } = await onglet(w, 'entretien');
  const remplaces = ecrit(o, 'Remplacé');
  assert.equal(remplaces.length, 1, 'le filtre seul : la brosse principale n’a pas de bouton, la latérale est à 100 %');
  o.appuyer(remplaces[0]);
  assert.ok(o.texte().includes('Remettre Filtre à 100 % ?'), o.texte());
  assert.deepEqual(w.appels, [], 'demander n’est pas remettre à zéro');
  o.appuyer(ecrit(o, 'Annuler')[0]);
  assert.ok(!o.texte().includes('Remettre Filtre à 100 % ?') && ecrit(o, 'Remplacé').length === 1, 'annulé : la rangée revient');
  assert.deepEqual(w.appels, []);
  o.appuyer(ecrit(o, 'Remplacé')[0]);
  o.appuyer(ecrit(o, 'Oui, 100 %')[0]);
  assert.deepEqual(w.appels, ['button.press ' + RAZ_FILTRE]);
  assert.ok(!o.texte().includes('Remettre Filtre à 100 % ?'), 'la question se referme');
  // Puis les compteurs, tels que l'appareil les nomme — sans le titre que sa maquette n'a pas.
  assert.ok(texteDe(o.arbre).includes('Surface totale nettoyée') && !texteDe(o.arbre).includes('Compteurs'), texteDe(o.arbre));
}));

/* TESTS AJOUTÉS (passe bis 2 de l'étape 2 IoT, 19/10 ; relecture de contrôle) : l'Entretien du robot, installé chez lui le matin même,
 * garde son dessin en devenant la brique commune (`OngletEntretien`, fichecommune.jsx) — le panneau PLAT de sa maquette (§ 7.5 :
 * `--o-s3`, le liseré, le rayon 18) que ses autres onglets ont, pas le panneau du socle (le dégradé surfA → surfB, l'ombre, le rayon
 * `--o-radius`) ; et le sous-texte d'une pièce (« 43 h sur 60 h ») reste gris quand le pourcentage et sa barre disent déjà l'usure —
 * l'ambre et le rouge n'y vont que pour une pièce comptée en jours seuls, sans pourcentage (les consommables du distributeur). */
test('passe bis 2 : le panneau de l’Entretien est celui des autres onglets du robot — plat, le liseré, le rayon 18, ni dégradé ni ombre', () => dans(async () => {
  const { o: h } = await onglet(poser(), 'historique');
  const { o: e } = await onglet(poser(), 'entretien');
  // Un panneau de liste : un cadre arrondi, bordé, qui coupe ce qui dépasse — les rangées de l'Historique, les pièces puis les compteurs.
  const listes = (m) => m.trouver(x => x.type === 'div' && x.props.style && x.props.style.borderRadius != null && x.props.style.border && x.props.style.overflow === 'hidden');
  const [histo] = listes(h), [pieces, compteurs] = listes(e);
  assert.ok(histo && pieces && compteurs, 'les panneaux de liste de l’Historique et de l’Entretien');
  assert.deepEqual(pieces.props.style, histo.props.style, 'le panneau des pièces n’est pas celui des autres onglets du robot');
  assert.deepEqual(compteurs.props.style, histo.props.style, 'le panneau des compteurs n’est pas celui des autres onglets du robot');
  assert.deepEqual([histo.props.style.background, histo.props.style.borderRadius, histo.props.style.boxShadow], ['var(--o-s3)', 18, undefined], 'témoin : le panneau plat de sa maquette, sans ombre');
}));

test('passe bis 2 : le sous-texte d’une pièce — gris sous un pourcentage (« 43 h sur 60 h »), l’ambre ou le rouge seulement en jours sans pourcentage', () => dans(async () => {
  const pieces = [
    { id: 'sensor.r_filtre', role: 'filtre', nom: 'Filtre', pct: 28, texte: '43 h sur 60 h', niveau: 'moyen', reset: null },
    { id: 'sensor.r_brosse', role: 'brosse', nom: 'Brosse', pct: 9, texte: '55 h sur 60 h', niveau: 'bas', reset: null },
    { id: 'sensor.d_desh', role: 'deshydratant', nom: 'Déshydratant', pct: null, texte: '5 jours restants', niveau: 'moyen', reset: null },
    { id: 'sensor.d_filtre', role: 'filtre', nom: 'Filtre à eau', pct: null, texte: '2 jours restants', niveau: 'bas', reset: null },
  ];
  const e = monter(FC.OngletEntretien, { hass: null, pieces, compteurs: [], phrase: null });
  const couleur = (texte) => ecrit(e, texte)[0].props.style.color;
  assert.deepEqual([couleur('43 h sur 60 h'), couleur('55 h sur 60 h')], ['var(--o-text2)', 'var(--o-text2)'], 'le sous-texte du robot passait à l’ambre et au rouge : le pourcentage et sa barre disent déjà l’usure');
  assert.deepEqual([couleur('28 %'), couleur('9 %')], ['var(--o-warn)', 'var(--o-bad)'], 'témoin : le pourcentage garde sa couleur');
  assert.deepEqual([couleur('5 jours restants'), couleur('2 jours restants')], ['var(--o-warn)', 'var(--o-bad)'], 'en jours seuls (le distributeur), le sous-texte est le seul signal : il garde sa couleur');
}));
