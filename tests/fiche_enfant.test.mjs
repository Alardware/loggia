/* La feuille « Réglages parent » du mode enfant (chantier Mode enfant, tâche 5 ; E13, E14, E19, E20, E23 ; § 6.4 ; sa maquette, cadre 2d).
 *
 * On la JOUE (tests/crochets.mjs) telle que la fiche d'un lecteur la monte : la coquille `FicheEnfant` (fichemedia.jsx) garde le
 * `BottomSheet` et pose la frontière Suspense dedans ; son contenu (`ContenuEnfant`, ficheenfant.jsx, chargé à la demande — le seul
 * export du module, passe bis du 17/10, point 10) reçoit l'état du mode enfant, la configuration commune, les lecteurs de la maison
 * et les briques d'App.jsx. Un faux Home Assistant retient chaque commande et chaque service.
 * Ce qui est garanti :
 *  - l'en-tête commun : « Mode enfant · Lino », « 2 appareils · code demandé pour modifier » (ou « Désactivé · aucune limite »,
 *    « Limites levées jusqu'à 18:50 »), la bascule « Mode enfant » qui écrit `actif` ;
 *  - la demande en attente : Refuser / Accorder 15 min → `loggia/enfant/repondre`, et l'état rendu remplace celui des cartes ;
 *  - le volume maximum (10 à 100 par 5, piste 32) → `volume_max` ; le temps d'écran (un `Segment`) → `budget` ; les heures (quatre
 *    `ListeChoix`, par quart d'heure, jamais un `<select>`) → `heures` ; les bascules des sons pour dormir et de la voix ;
 *  - « Recevoir les annonces » (E23) : la sœur « Annonces » de l'Echo, `switch.turn_on` / `turn_off`, jamais `toggle` ;
 *  - les appareils du profil : « Pièce Chambre · ajouté tout seul », « Ajouté par vous » et sa croix, « Ajouter un appareil » ;
 *  - « Lever les limites 30 min » / « Rétablir les limites » → `loggia/enfant/lever` ; « Code parent » (administrateurs) ;
 *  - un refus `code_admin_requis` rouvre le pavé (`onCode`) ; un autre refus se dit ; un profil neuf naît avec sa pièce (E20). */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

import { monter, horlogeFausse, documentFaux, texteDe } from './crochets.mjs';

import { MONOLITHE } from './monolithe.mjs'; // App.jsx et ce qui en sort (ADR 0282)
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
register('data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?fiche_enfant')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -'?fiche_enfant'.length), ctx);",
  "  return { ...r, source: String(r.source) + ';export { BRIQUES_MEDIA };' };",
  '}',
].join('\n')));
const F = await import(new URL('../src/App.jsx?fiche_enfant', import.meta.url).href);
const M = await import(new URL('../src/ficheenfant.jsx', import.meta.url).href);
const EN = await import('../src/enfantetat.js');
const ST = await import('../src/state.js');
const lire = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const SRC = lire('src/ficheenfant.jsx');
const MEDIA = lire('src/fichemedia.jsx');
const APP = MONOLITHE;

const NBSP = String.fromCharCode(160);
const T = new Date(2026, 9, 17, 18, 20, 0, 0).getTime();
const OFF = 'media_player.chambre_echo_dot', HACS = 'media_player.echo_dot_chambre', ATV = 'media_player.apple_tv_chambre', CUISINE = 'media_player.echo_cuisine', TV = 'media_player.tv_salon';
const PARLER = 'notify.chambre_echo_dot_parler', ANNONCES = 'switch.chambre_echo_dot_annonces';
const PROFIL = { nom: 'Lino', zone: 'chambre', actif: true, ajouts: [ATV], ecrans: null, volume_max: 40, coucher_max: 20, budget: { semaine: 90, weekend: 90 }, heures: { semaine: ['07:30', '20:30'], weekend: ['08:30', '21:00'] }, dormir: true, voix: true, phrases_dormir: ['joue du bruit blanc', 'joue de la musique pour dormir'] };
const CFG = (sur = {}) => ({ profils: { chambre: { ...PROFIL, ...sur } }, simulation: { actif: false } });
const VUE = (sur = {}) => ({ profil: 'chambre', nom: 'Lino', actif: true, leve_jusqua: null, plafond: 40, bloque: null, reprise: '07:30', ecran: null, dormir: null, demande: null, ...sur });
const APPAREILS = [{ entite: OFF, ajoute: false, ecran: false, parler: PARLER, annonces: ANNONCES, hacs: HACS }, { entite: ATV, ajoute: true, ecran: true, parler: null, annonces: null, hacs: null }];
const ETAT = (profil = {}, lecteurs = {}) => ({ maintenant: T / 1000, demarre: true, simulation: false, recu: T,
  profils: { chambre: { nom: 'Lino', zone: 'chambre', actif: true, leve_jusqua: null, demande: null, voix: true, dormir: true, appareils: APPAREILS, ...profil } },
  lecteurs: { [OFF]: VUE(), [HACS]: VUE(), [ATV]: VUE({ ecran: { budget_min: 90, utilise_s: 3300, bonus_min: 0, reste_s: 2100 } }), ...lecteurs } });
const LECTEURS = [{ haid: OFF, name: 'Echo Dot - Chambre', ma: HACS }, { haid: ATV, name: 'Apple TV Chambre', ma: null }, { haid: CUISINE, name: 'Echo de la cuisine', ma: null }, { haid: TV, name: 'TV du salon', ma: null }];
const STATES = () => ({
  [OFF]: { state: 'playing', attributes: { friendly_name: 'Echo Dot - Chambre' } }, [HACS]: { state: 'playing', attributes: { friendly_name: 'Echo Dot Chambre' } },
  [ATV]: { state: 'playing', attributes: { friendly_name: 'Apple TV Chambre' } }, [ANNONCES]: { state: 'on', attributes: { friendly_name: 'Echo Dot - Chambre Annonces' } },
});
/* Un faux Home Assistant : chaque commande et chaque service retenus ; une réponse par type, ou `{ rejet }`. */
function serveur(reponses = {}, { admin = true, states = STATES() } = {}) {
  const appels = [], services = [];
  const hass = {
    states, user: { id: 'u-papa', name: 'Papa', is_admin: admin },
    callWS: (msg) => { appels.push(msg); const r = Object.prototype.hasOwnProperty.call(reponses, msg.type) ? reponses[msg.type] : null; const v = typeof r === 'function' ? r(msg) : r; return v && v.rejet ? Promise.reject(v.rejet) : Promise.resolve(v); },
    callService: (d, s, data) => { services.push(d + '.' + s + ' ' + (data && data.entity_id)); return Promise.resolve(); },
  };
  return { appels, services, hass };
}
async function dans(fn) {
  const h = horlogeFausse(), d = documentFaux();
  h.installer(); d.installer();
  globalThis.document.documentElement = { classList: { contains: () => false } };
  try { return await fn({ h, d }); } finally { h.restaurer(); d.restaurer(); }
}
const attendre = () => new Promise(r => setImmediate(r));
// ASSERTION MODIFIÉE (passe bis du 17/10, point 10) : le contenu est l'export par défaut — et le seul — de ficheenfant.jsx.
const contenu = (hass, props = {}) => monter(M.default, { hass, ident: 'chambre', nom: 'Lino', piece: 'Chambre', zone: 'chambre', etat: ETAT(), config: CFG(), lecteurs: LECTEURS, briques: F.BRIQUES_MEDIA, admin: true, onCode: () => {}, ...props });
const de = (m, nom) => m.trouver(e => e.type && e.type.name === nom);
const bouton = (m, nom) => m.trouver(e => e.type === 'button' && (e.props['aria-label'] === nom || e.props.title === nom || texteDe(e) === nom))[0];
const bascule = (m, nom) => de(m, 'RmBascule').find(b => b.props.nom === nom);
const patchs = (s) => s.appels.filter(a => a.type === 'loggia/enfant/config').map(a => a.patch);
const REPONSE = (etat = ETAT()) => ({ 'loggia/enfant/config': (msg) => ({ config: CFG(), etat, patch: msg.patch }), 'loggia/enfant/lever': etat, 'loggia/enfant/repondre': etat, 'loggia/pin/definir': { defini: true } });

test('§ 6.4 : l’en-tête commun — « Mode enfant · Lino », les appareils et le code, la plaque `child-head`, la bascule qui écrit `actif` ; désactivé, levé', () => dans(async () => {
  const s = serveur(REPONSE());
  const m = contenu(s.hass);
  const [entete] = de(m, 'EnteteFiche');
  assert.equal(entete.props.nom, 'Mode enfant · Lino');
  assert.equal(entete.props.sousNom, '2 appareils · code demandé pour modifier');
  assert.deepEqual([entete.props.plaque.icone, entete.props.plaque.fond], ['child-head', 'rgba(var(--o-accent-rgb),.16)'], 'la plaque de sa maquette, sur l’accent à 0,16');
  const ep = entete.props.epingle;
  const b = ep && ep.type && ep.type.name === 'RmBascule' ? ep : [].concat(ep && ep.props ? ep.props.children : []).flat().find(x => x && x.type && x.type.name === 'RmBascule');
  assert.deepEqual([b.props.on, b.props.nom], [true, 'Mode enfant'], 'la bascule « Mode enfant », dans l’en-tête');
  b.props.onToggle();
  await attendre();
  assert.deepEqual(patchs(s), [{ profils: { chambre: { actif: false } } }], 'éteindre le profil : `actif` faux, rien d’autre');
  // Désactivé : « aucune limite » ; levées : jusqu'à quand.
  assert.equal(de(contenu(s.hass, { config: CFG({ actif: false }) }), 'EnteteFiche')[0].props.sousNom, 'Désactivé · aucune limite');
  const leve = contenu(s.hass, { etat: ETAT({ leve_jusqua: T / 1000 + 1800 }) });
  assert.equal(de(leve, 'EnteteFiche')[0].props.sousNom, 'Limites levées jusqu’à 18:50');
  assert.equal(SRC.split('<EnteteFiche nom=').length - 1, 1, 'un seul en-tête, le commun : sa croix en dernier');
}));

test('E13 : la demande en attente — « Lino demande 15 min de plus », l’appareil et l’heure, Refuser / Accorder 15 min → `enfant/repondre` ; l’état rendu remplace celui des cartes', () => dans(async () => {
  EN.reglerEnfantEtat({ hass: { callWS: () => new Promise(() => {}) } });
  const apres = ETAT({ demande: { appareil: ATV, quand: T / 1000, reponse: 'accordee' } });
  const s = serveur(REPONSE(apres));
  const m = contenu(s.hass, { etat: ETAT({ demande: { appareil: ATV, quand: T / 1000, reponse: null } }) });
  const t = m.texte();
  assert.ok(t.includes('Lino demande 15 min de plus') && t.includes('Apple TV Chambre · à 18:20'), t);
  const accorder = bouton(m, 'Accorder 15 min');
  assert.ok(accorder && bouton(m, 'Refuser'), 'les deux réponses');
  m.appuyer(accorder);
  await attendre();
  assert.deepEqual(s.appels, [{ type: 'loggia/enfant/repondre', profil: 'chambre', accorder: true }]);
  assert.equal(EN.lireEtatEnfant().etat, apres, 'l’état rendu par la commande est posé pour toutes les cartes, sans attendre le sondage');
  // Répondue, la demande ne s'affiche plus ; Refuser écrit faux.
  const m2 = contenu(s.hass, { etat: apres });
  assert.ok(!m2.texte().includes('demande 15 min de plus'));
  s.appels.length = 0;
  const m3 = contenu(s.hass, { etat: ETAT({ demande: { appareil: ATV, quand: T / 1000, reponse: null } }) });
  m3.appuyer(bouton(m3, 'Refuser'));
  await attendre();
  assert.deepEqual(s.appels, [{ type: 'loggia/enfant/repondre', profil: 'chambre', accorder: false }]);
  EN.reglerEnfantEtat({});
}));

test('§ 6.4 : le volume maximum — « 40 % », la barre de 10 à 100 par 5 (piste 32), la phrase ; glisser écrit `volume_max` ; le temps d’écran — « 55 min utilisées aujourd’hui », le segment → `budget` ; sans écran, pas de segment', () => dans(async () => {
  const s = serveur(REPONSE());
  const m = contenu(s.hass);
  const jauge = de(m, 'RmJauge').find(j => j.props.label === 'Volume maximum');
  assert.deepEqual([jauge.props.v, jauge.props.min, jauge.props.pas, jauge.props.piste, jauge.props.zone, jauge.props.plafond], [40, 10, 5, 32, 44, undefined], 'la barre de la maison, de 10 à 100 par 5, sans plafond : c’est elle qui le règle');
  const t = m.texte();
  assert.ok(t.includes('Volume maximum') && t.includes('40' + NBSP + '%'), 'le mot et la valeur');
  assert.ok(t.includes('Loggia ramène le volume à ce niveau s’il est monté depuis l’appareil, à la voix ou dans l’appli Alexa. Au coucher : 20' + NBSP + '% max.'), t);
  jauge.props.onCommit(55);
  await attendre();
  assert.deepEqual(patchs(s), [{ profils: { chambre: { volume_max: 55 } } }]);
  // Le temps d'écran : l'Apple TV, 55 min utilisées, 1 h 30 choisi.
  assert.ok(t.includes('Temps d’écran · Apple TV Chambre') && t.includes('55 min utilisées aujourd’hui'), t);
  const [seg] = de(m, 'Segment');
  assert.deepEqual([seg.props.value, seg.props.options.map(o => o.label), seg.props.label], [90, ['30 min', '1 h', '1 h 30', '2 h', 'Illimité'], 'Temps d’écran']);
  seg.props.onChange(120);
  await attendre();
  assert.deepEqual(patchs(s).at(-1), { profils: { chambre: { budget: { semaine: 120, weekend: 120 } } } }, 'la semaine et le week-end ensemble : un seul segment, celui de la maquette');
  // Illimité : budget 0 ; « Aucune limite ».
  const libre = contenu(s.hass, { config: CFG({ budget: { semaine: 0, weekend: 0 } }) });
  assert.deepEqual([de(libre, 'Segment')[0].props.value, libre.texte().includes('Aucune limite')], [0, true]);
  // Un profil sans écran (l'Echo seule) : ni segment ni « Temps d'écran ».
  const sans = contenu(s.hass, { etat: ETAT({ appareils: [APPAREILS[0]] }) });
  assert.deepEqual([de(sans, 'Segment').length, sans.texte().includes('Temps d’écran')], [0, false]);
}));

test('§ 6.4 : les heures autorisées — quatre `ListeChoix` par quart d’heure (jamais un <select>) → `heures` ; les bascules des sons pour dormir et de la voix, quand une Echo sait ; « Recevoir les annonces » : `switch.turn_off` / `turn_on` (E23)', () => dans(async () => {
  const s = serveur(REPONSE());
  const m = contenu(s.hass);
  const listes = de(m, 'ListeChoix');
  assert.deepEqual(listes.map(l => l.props.value), ['07:30', '20:30', '08:30', '21:00'], 'la semaine puis le week-end, le début puis la fin');
  assert.deepEqual([listes[0].props.options.length, listes[0].props.options[0], listes[0].props.options.at(-1)], [96, { id: '00:00', label: '00:00' }, { id: '23:45', label: '23:45' }]);
  assert.ok(!SRC.includes('<select'), 'jamais un <select> natif (sa règle)');
  listes[0].props.onChange('08:00');
  await attendre();
  assert.deepEqual(patchs(s).at(-1), { profils: { chambre: { heures: { semaine: ['08:00', '20:30'], weekend: ['08:30', '21:00'] } } } }, 'les deux jours arrivent entiers (le piège des volets)');
  listes[3].props.onChange('21:30');
  await attendre();
  assert.deepEqual(patchs(s).at(-1), { profils: { chambre: { heures: { semaine: ['07:30', '20:30'], weekend: ['08:30', '21:30'] } } } });
  // Les sons pour dormir (la jumelle HACS existe), la voix (« Parler » existe) : deux bascules qui écrivent `dormir` et `voix`.
  const dormir = bascule(m, 'Au coucher : sons pour dormir');
  assert.ok(dormir && dormir.props.on, 'la bascule des sons pour dormir');
  assert.ok(m.texte().includes('Bruit blanc et musique douce, 20' + NBSP + '% max'));
  dormir.props.onToggle();
  await attendre();
  assert.deepEqual(patchs(s).at(-1), { profils: { chambre: { dormir: false } } });
  const voix = bascule(m, 'Prévenir cinq minutes avant par Echo Dot - Chambre');
  assert.ok(voix && voix.props.on, 'la bascule de la voix, qui nomme l’Echo');
  voix.props.onToggle();
  await attendre();
  assert.deepEqual(patchs(s).at(-1), { profils: { chambre: { voix: false } } });
  // Les annonces : la sœur « Annonces » est allumée — la bascule la coupe, explicitement.
  const annonces = bascule(m, 'Recevoir les annonces');
  assert.ok(annonces && annonces.props.on);
  assert.ok(m.texte().includes('Les messages envoyés à toute la maison'));
  annonces.props.onToggle();
  assert.deepEqual(s.services, ['switch.turn_off ' + ANNONCES], 'jamais `toggle`');
  const etats = STATES(); etats[ANNONCES].state = 'off';
  const s2 = serveur(REPONSE(), { states: etats });
  const m2 = contenu(s2.hass);
  assert.equal(bascule(m2, 'Recevoir les annonces').props.on, false);
  bascule(m2, 'Recevoir les annonces').props.onToggle();
  assert.deepEqual(s2.services, ['switch.turn_on ' + ANNONCES]);
  // Sans jumelle, sans « Parler », sans sœur « Annonces » : rien d'inerte (M11).
  const seule = contenu(s.hass, { etat: ETAT({ appareils: [{ ...APPAREILS[0], parler: null, annonces: null, hacs: null }] }) });
  assert.deepEqual([bascule(seule, 'Au coucher : sons pour dormir'), bascule(seule, 'Recevoir les annonces'), de(seule, 'RmBascule').some(b => /^Prévenir/.test(b.props.nom))], [undefined, undefined, false]);
}));

test('§ 6.4 : les appareils du profil — « Pièce Chambre · ajouté tout seul », « Ajouté par vous » et sa croix (→ `ajouts`), « Ajouter un appareil » : les lecteurs de la maison hors du profil', () => dans(async () => {
  const s = serveur(REPONSE());
  const m = contenu(s.hass);
  const t = m.texte();
  assert.ok(t.includes('Appareils du profil') && t.includes('Echo Dot - Chambre') && t.includes('Pièce Chambre · ajouté tout seul') && t.includes('Apple TV Chambre') && t.includes('Ajouté par vous'), t);
  const retirer = bouton(m, 'Retirer Apple TV Chambre');
  assert.ok(retirer, 'la croix d’un ajout');
  assert.equal(bouton(m, 'Retirer Echo Dot - Chambre'), undefined, 'un appareil de la pièce ne se retire pas : il est là tout seul');
  m.appuyer(retirer);
  await attendre();
  assert.deepEqual(patchs(s).at(-1), { profils: { chambre: { ajouts: [] } } });
  // Ajouter : la liste des lecteurs qui ne sont pas déjà du profil — ni l'Echo, ni sa jumelle, ni l'Apple TV.
  m.appuyer(bouton(m, 'Ajouter un appareil'));
  const liste = de(m, 'ListeChoix').find(l => l.props.label === 'Ajouter un appareil');
  assert.deepEqual(liste.props.options, [{ id: CUISINE, label: 'Echo de la cuisine' }, { id: TV, label: 'TV du salon' }]);
  liste.props.onChange(CUISINE);
  await attendre();
  assert.deepEqual(patchs(s).at(-1), { profils: { chambre: { ajouts: [ATV, CUISINE] } } }, 'la liste entière, l’ajout au bout');
}));

test('E14 : « Lever les limites 30 min » → `enfant/lever 30` ; levées, « Rétablir les limites » → 0 ; désactivé, inerte. « Code parent » : les administrateurs le changent sur place, les autres lisent où', () => dans(async () => {
  const s = serveur(REPONSE());
  const m = contenu(s.hass);
  m.appuyer(bouton(m, 'Lever les limites 30 min'));
  await attendre();
  assert.deepEqual(s.appels.at(-1), { type: 'loggia/enfant/lever', profil: 'chambre', minutes: 30 });
  const leve = contenu(s.hass, { etat: ETAT({ leve_jusqua: T / 1000 + 1800 }) });
  assert.equal(bouton(leve, 'Lever les limites 30 min'), undefined);
  leve.appuyer(bouton(leve, 'Rétablir les limites'));
  await attendre();
  assert.deepEqual(s.appels.at(-1), { type: 'loggia/enfant/lever', profil: 'chambre', minutes: 0 });
  const eteint = contenu(s.hass, { config: CFG({ actif: false }) });
  assert.equal(bouton(eteint, 'Lever les limites 30 min').props['aria-disabled'], true, 'un profil désactivé n’a pas de limites à lever');
  // Le code parent, pour un administrateur : deux champs, la règle de quatre à huit chiffres, les deux pareils, puis `pin/definir`.
  s.appels.length = 0;
  m.appuyer(bouton(m, 'Code parent'));
  const champs = m.trouver(e => e.type === 'input');
  assert.deepEqual(champs.map(c => c.props['aria-label']), ['Nouveau code', 'Confirmer']);
  champs[0].props.onChange({ target: { value: '12' } }); m.rendre();
  m.trouver(e => e.type === 'input')[1].props.onChange({ target: { value: '12' } }); m.rendre();
  m.appuyer(bouton(m, 'Enregistrer le code'));
  assert.ok(m.texte().includes('Le code fait de 4 à 8 chiffres.'));
  m.trouver(e => e.type === 'input')[0].props.onChange({ target: { value: '1234' } }); m.rendre();
  m.trouver(e => e.type === 'input')[1].props.onChange({ target: { value: '1235' } }); m.rendre();
  m.appuyer(bouton(m, 'Enregistrer le code'));
  assert.ok(m.texte().includes('Les deux codes ne correspondent pas.'));
  assert.equal(s.appels.length, 0, 'rien ne part tant que les deux codes ne vont pas');
  m.trouver(e => e.type === 'input')[1].props.onChange({ target: { value: '1234' } }); m.rendre();
  m.appuyer(bouton(m, 'Enregistrer le code'));
  await attendre(); m.rendre();
  assert.deepEqual(s.appels, [{ type: 'loggia/pin/definir', pin: '1234' }]);
  assert.ok(m.texte().includes('Code administrateur mis à jour — le même sur tous les appareils.'));
  const ordinaire = contenu(s.hass, { admin: false });
  assert.equal(bouton(ordinaire, 'Code parent'), undefined);
  assert.ok(ordinaire.texte().includes('Le code se change dans Paramètres, par un administrateur'));
}));

test('E19, E20 : un refus `code_admin_requis` rouvre le pavé (`onCode`) ; un autre refus se dit ; un profil neuf naît avec le nom de sa pièce et sa zone ; la feuille garde le BottomSheet, le contenu dedans', () => dans(async () => {
  let codes = 0;
  const s = serveur({ 'loggia/enfant/config': { rejet: { code: 'code_admin_requis', message: 'le code de la maison est requis pour le mode enfant' } } });
  const m = contenu(s.hass, { admin: false, onCode: () => { codes += 1; } });
  de(m, 'RmJauge').find(j => j.props.label === 'Volume maximum').props.onCommit(50);
  await attendre(); m.rendre();
  assert.equal(codes, 1, 'le laissez-passer a expiré : le pavé');
  assert.ok(!m.trouver(e => e.props && e.props.role === 'alert' && texteDe(e)).length, 'rien de rouge : ce n’est pas une erreur');
  const s2 = serveur({ 'loggia/enfant/config': { rejet: { code: 'invalid_format', message: 'mode enfant : volume_max : un entier de 10 a 100' } } });
  const m2 = contenu(s2.hass);
  de(m2, 'RmJauge').find(j => j.props.label === 'Volume maximum').props.onCommit(50);
  await attendre(); m2.rendre();
  const alerte = m2.trouver(e => e.props && e.props.role === 'alert' && texteDe(e))[0];
  assert.ok(alerte && texteDe(alerte).length > 0, 'le refus du composant se dit, dans la langue de l’écran (refus.js)');
  assert.deepEqual(patchs(s2), [{ profils: { chambre: { volume_max: 50 } } }], 'l’écriture est partie telle quelle : c’est le composant qui a refusé');
  // Un profil qui n'existe pas encore (E20) : la feuille s'ouvre sur les réglages par défaut, et le premier enregistrement porte le nom et la zone.
  const s3 = serveur(REPONSE());
  const neuf = contenu(s3.hass, { etat: null, config: { profils: {}, simulation: { actif: false } }, nom: 'Chambre', piece: 'Chambre' });
  assert.equal(de(neuf, 'EnteteFiche')[0].props.nom, 'Mode enfant · Chambre');
  assert.ok(neuf.texte().includes('Ajouter un appareil') && !neuf.texte().includes('Ajouté par vous'), 'aucun appareil encore : le serveur recense à l’enregistrement');
  de(neuf, 'RmJauge').find(j => j.props.label === 'Volume maximum').props.onCommit(35);
  await attendre();
  assert.deepEqual(patchs(s3), [{ profils: { chambre: { nom: 'Chambre', zone: 'chambre', volume_max: 35 } } }]);
  /* ASSERTION MODIFIÉE (passe bis du 17/10, point 10) : la feuille est la COQUILLE `FicheEnfant` de fichemedia.jsx — le BottomSheet, la frontière
   * Suspense DEDANS (repli de 260 px), le contenu à la demande dedans, sur le modèle de `FicheMedia` ; ficheenfant.jsx n'a plus de feuille et
   * n'exporte que son contenu. Avant, la frontière était HORS de la feuille, qui vivait dans le morceau : rien pendant le chargement, et un
   * morceau manquant tombait dans la barrière de la fiche du lecteur. */
  assert.equal(M.default.name, 'ContenuEnfant');
  assert.equal(SRC.split('<BottomSheet').length - 1, 0, 'ficheenfant.jsx ne pose plus la feuille');
  assert.equal((SRC.match(/^export /gm) || []).length, 1, 'un seul export : le contenu');
  assert.ok(MEDIA.includes("const ContenuEnfant = lazyRecharge(() => import('./ficheenfant.jsx'));"), 'le contenu des réglages se charge à la demande, depuis la fiche d’un lecteur');
  const k = MEDIA.indexOf('\nfunction FicheEnfant({ onClose, ...props }) {');
  const coquille = MEDIA.slice(k, MEDIA.indexOf('\n}\n', k));
  assert.ok(k >= 0 && coquille.indexOf('<BottomSheet onClose={onClose}>') < coquille.indexOf('<Suspense fallback={<div style={{ minHeight: 260 }} />}>')
    && coquille.indexOf('<Suspense fallback') < coquille.indexOf('<ContenuEnfant {...props} />'), 'la coquille : la feuille, la frontière dedans, le contenu');
  assert.ok(MEDIA.includes('<FicheEnfant hass={v.hass} ident={identProfil}') && !MEDIA.includes('<Suspense fallback={null}>'), 'la fiche monte la coquille, sans frontière hors de la feuille');
  assert.ok(!/media_player[^\n]*turn_on|\btoggle\b|media_play_pause/.test(SRC), 'aucun ordre qui allume ou bascule à l’aveugle');
}));

/* TEST AJOUTÉ (passe bis 3 du 17/10, point 4 ; sa demande, « quand je regle le volume, le pourcentage ne suis pas comme sur la maquette »).
 * « Volume maximum » restait figé pendant le glisser : la barre est celle de la maison (`RmJauge`), elle annonce le doigt (`onGlisse`) — le
 * chiffre le suit, au pas de 5. Relâché : UNE écriture, et le chiffre garde la valeur posée (`useOptimiste`) jusqu'à ce que la configuration
 * relue la dise — il ne repasse pas par l'ancienne. Refusée, l'ancienne revient ; jamais relue, elle revient six secondes plus tard. */
test('passe bis 3, point 4 : « Volume maximum » suit le doigt — 60 %, 75 % pendant le glisser, rien ne part ; relâché, UNE écriture, 75 % jusqu’à la configuration relue ; refusée, 40 % revient', () => dans(async ({ h }) => {
  const sousLeDoigt = (m, x) => {
    const jauge = de(m, 'RmJauge').find(j => j.props.label === 'Volume maximum');
    const barre = monter(F.BRIQUES_MEDIA.RmJauge, jauge.props);
    const el = { querySelector: () => null, getBoundingClientRect: () => ({ left: 0, width: 226 }), classList: { add() {}, remove() {} }, setPointerCapture() {}, onpointermove: null, onpointerup: null, onpointercancel: null };
    barre.arbre.props.onPointerDown({ stopPropagation() {}, preventDefault() {}, currentTarget: el, clientX: x, pointerId: 1 });
    return el;
  };
  const chiffre = (m) => texteDe(m.trouver(e => e.props && e.props['data-volume-max'] === '')[0]);
  const barre = (m) => de(m, 'RmJauge').find(j => j.props.label === 'Volume maximum').props;
  const s = serveur(REPONSE());
  const m = contenu(s.hass);
  assert.equal(chiffre(m), '40' + NBSP + '%');
  assert.equal(typeof barre(m).onGlisse, 'function', 'la barre annonce le doigt');
  // (226 − 26) px de piste utile, au pas de 5 : 120 px font 60 %, 150 px 75 %.
  const el = sousLeDoigt(m, 120);
  m.rendre();
  assert.deepEqual([chiffre(m), barre(m).v], ['60' + NBSP + '%', 60], 'posé sur la barre : le chiffre suit, et la barre reçoit la valeur du doigt');
  el.onpointermove({ clientX: 150 });
  m.rendre();
  assert.equal(chiffre(m), '75' + NBSP + '%');
  assert.deepEqual(patchs(s), [], 'rien ne part pendant le glisser');
  el.onpointerup();
  m.rendre();
  assert.equal(chiffre(m), '75' + NBSP + '%', 'relâché : la valeur posée, sans repasser par 40');
  await attendre(); m.rendre();
  assert.deepEqual(patchs(s), [{ profils: { chambre: { volume_max: 75 } } }], 'UNE écriture, au relâcher');
  assert.equal(chiffre(m), '75' + NBSP + '%', 'la réponse arrivée, la configuration relue n’est pas encore là : 75 tient');
  m.proprietes({ config: CFG({ volume_max: 75 }) });
  assert.deepEqual([chiffre(m), barre(m).v], ['75' + NBSP + '%', 75], 'la configuration relue le dit');
  // Refusée : l'ancienne valeur revient, et le refus se dit.
  const s2 = serveur({ 'loggia/enfant/config': { rejet: { code: 'invalid_format', message: 'mode enfant : volume_max : un entier de 10 a 100' } } });
  const m2 = contenu(s2.hass);
  const el2 = sousLeDoigt(m2, 150);
  el2.onpointerup();
  m2.rendre();
  assert.equal(chiffre(m2), '75' + NBSP + '%');
  await attendre(); m2.rendre();
  assert.deepEqual([chiffre(m2), barre(m2).v], ['40' + NBSP + '%', 40], 'refusée : 40 revient, la barre aussi');
  assert.ok(m2.trouver(e => e.props && e.props.role === 'alert' && texteDe(e)).length === 1, 'et le refus se dit');
  // Acceptée mais jamais relue : six secondes plus tard, la configuration fait foi.
  const s3 = serveur(REPONSE());
  const m3 = contenu(s3.hass);
  sousLeDoigt(m3, 150).onpointerup();
  await attendre(); m3.rendre();
  assert.equal(chiffre(m3), '75' + NBSP + '%');
  h.avancer(6100); m3.rendre();
  assert.equal(chiffre(m3), '40' + NBSP + '%', 'le filet expire : la carte redit ce que la maison dit');
}));

/* TEST AJOUTÉ (18/10, son retour : « quand je règle le volume à ne pas dépasser, par exemple il est à 40 % et je le mets à 20 %, il revient
 * à 40 % dans le réglage alors que les 20 % ont bien été appliqués »). `loggia/enfant/config` écrit `loggia_enfant` côté serveur et rend la
 * configuration entière, `{config, etat}` ; rien d'autre ne la relit — le flux de l'ADR 0067 ne parle que des écritures du client
 * (`config/set`). La feuille ne gardait que l'état : le cache que la fiche lui passe (`cfgVal('loggia_enfant')`, fichemedia.jsx) restait
 * sur l'ancienne configuration, et le chiffre y retombait quand l'optimiste expirait. Le même cache servait les autres réglages : une
 * bascule redessinée sur l'ancienne valeur (le second appui réécrivait la même), le début d'une plage renvoyé à l'ancien quand on en
 * changeait la fin, un premier ajout perdu au second. Le faux serveur fait ici comme le vrai (`poser_patch`) : il rend la configuration
 * qu'il vient d'écrire, le patch posé. */
test('18/10 : « Volume maximum » réglé de 40 à 20 % reste à 20 % — la configuration rendue par l’écriture remplace le cache que la fiche relit, sans repartir au serveur ; heures, bascule et ajouts partent de la dernière écriture ; un refus n’y touche pas', () => dans(async ({ h }) => {
  let cfgServeur = CFG();
  const ecrite = (patch) => { cfgServeur = { ...cfgServeur, profils: { ...cfgServeur.profils, chambre: { ...cfgServeur.profils.chambre, ...patch.profils.chambre } } }; return cfgServeur; };
  const recus = [];
  let sauves = 0;
  ST.setLoggiaState({ cfg: { loggia_enfant: cfgServeur }, server: true, save: () => { sauves += 1; return Promise.resolve(true); }, recu: (cle, v) => recus.push([cle, v]) });
  try {
    const s = serveur({ 'loggia/enfant/config': (msg) => ({ config: ecrite(msg.patch), etat: ETAT() }), 'loggia/enfant/lever': ETAT() });
    const m = contenu(s.hass, { config: ST.cfgVal('loggia_enfant', null) });
    // La fiche se redessine (un sondage, un état posé) : elle relit le cache, comme fichemedia.jsx.
    const relire = () => m.proprietes({ config: ST.cfgVal('loggia_enfant', null) });
    const chiffre = () => texteDe(m.trouver(e => e.props && e.props['data-volume-max'] === '')[0]);
    assert.equal(chiffre(), '40' + NBSP + '%');
    de(m, 'RmJauge').find(j => j.props.label === 'Volume maximum').props.onCommit(20);
    await attendre(); relire();
    assert.deepEqual(patchs(s), [{ profils: { chambre: { volume_max: 20 } } }]);
    assert.equal(ST.cfgVal('loggia_enfant', null).profils.chambre.volume_max, 20, 'le cache tient ce que le serveur a écrit');
    assert.deepEqual(recus.map(([cle, v]) => [cle, v.profils.chambre.volume_max]), [['loggia_enfant', 20]], 'l’état d’App aussi : il recopie le cache à chaque rendu');
    assert.equal(sauves, 0, 'rien ne repart par `config/set` : c’est le serveur qui vient de l’écrire');
    assert.equal(chiffre(), '20' + NBSP + '%');
    h.avancer(6100); relire();
    assert.equal(chiffre(), '20' + NBSP + '%', 'six secondes plus tard, l’optimiste expiré : 20, pas 40');
    // Les heures : la fin changée juste après le début garde le début NOUVEAU.
    de(m, 'ListeChoix')[0].props.onChange('08:00');
    await attendre(); relire();
    de(m, 'ListeChoix')[1].props.onChange('21:00');
    await attendre(); relire();
    assert.deepEqual(patchs(s).at(-1), { profils: { chambre: { heures: { semaine: ['08:00', '21:00'], weekend: ['08:30', '21:00'] } } } }, 'le début posé juste avant ne repart pas à 07:30');
    assert.deepEqual(de(m, 'ListeChoix').slice(0, 2).map(l => l.props.value), ['08:00', '21:00']);
    // La bascule « Mode enfant » : coupée, elle se redessine coupée, et le second appui la rallume.
    const modeEnfant = () => de(m, 'EnteteFiche')[0].props.epingle;
    modeEnfant().props.onToggle();
    await attendre(); relire();
    assert.equal(modeEnfant().props.on, false);
    modeEnfant().props.onToggle();
    await attendre(); relire();
    assert.deepEqual(patchs(s).slice(-2), [{ profils: { chambre: { actif: false } } }, { profils: { chambre: { actif: true } } }], 'couper puis rallumer : deux écritures différentes');
    // Les ajouts : le second garde le premier.
    m.appuyer(bouton(m, 'Ajouter un appareil'));
    de(m, 'ListeChoix').find(l => l.props.label === 'Ajouter un appareil').props.onChange(CUISINE);
    await attendre(); relire();
    m.appuyer(bouton(m, 'Ajouter un appareil'));
    de(m, 'ListeChoix').find(l => l.props.label === 'Ajouter un appareil').props.onChange(TV);
    await attendre(); relire();
    assert.deepEqual(patchs(s).at(-1), { profils: { chambre: { ajouts: [ATV, CUISINE, TV] } } }, 'le premier ajout tient');
    // Lever ne rend que l'état : la configuration en cache ne bouge pas.
    const n = recus.length, avant = ST.cfgVal('loggia_enfant', null);
    m.appuyer(bouton(m, 'Lever les limites 30 min'));
    await attendre();
    assert.deepEqual([s.appels.at(-1).type, recus.length, ST.cfgVal('loggia_enfant', null)], ['loggia/enfant/lever', n, avant]);
    // Refusée : le cache reste tel quel, rien n'arrive à App.
    const s2 = serveur({ 'loggia/enfant/config': { rejet: { code: 'invalid_format', message: 'mode enfant : volume_max : un entier de 10 a 100' } } });
    const m2 = contenu(s2.hass, { config: avant });
    de(m2, 'RmJauge').find(j => j.props.label === 'Volume maximum').props.onCommit(50);
    await attendre();
    assert.deepEqual([recus.length, ST.cfgVal('loggia_enfant', null), sauves], [n, avant, 0], 'un refus laisse le cache tel quel');
  } finally {
    ST.setLoggiaState({ cfg: {}, server: false, save: null, recu: null });
  }
  // App pose ce qui arrive dans son état, sans `config/set` ni carnet, et confie la fonction à state.js.
  assert.ok(APP.includes('const recuCfg = useCallback((cle, valeur) => setServerCfg(c => ({ ...c, [cle]: valeur })), []);'), 'App : son état, sans repartir');
  assert.ok(APP.includes('setLoggiaState({ save: saveCfg, recu: recuCfg });'), 'App confie la fonction à state.js');
}));
