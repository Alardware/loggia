/* TEST AJOUTÉ (chantier IoT, tâche 6, 18/10 ; sa maquette « Cartes IoT », 1a ; I5 à I9, I12, I33, I34, I35) — la carte d'un robot,
 * aspirateur ou tondeuse, et sa compacte.
 *
 * Ces tests JOUENT la carte (tests/crochets.mjs) : on la monte sur un `hass`, on lit ce qu'elle dessine — la plaque, la phrase, le
 * chiffre nommé, les puces —, on appuie. Sous `?carte_robot`, App.jsx exporte la carte, sa vue et la compacte — le fichier n'est pas
 * touché. Le serveur (`loggia/robots/etat`, `loggia/robots/lancer`) est doublé ; l'heure est celle de la maquette, samedi 17/10/2026,
 * 18:20. Ce qui est garanti :
 *  - I5, I6 : la grille commune (`o-gabarit`) ; le chiffre NOMMÉ — la batterie, « Batterie » dessous —, en grand dans la rangée du
 *    milieu (carte large) et en haut à droite (carte étroite) ; la surface dit le nom, la phrase et la batterie ;
 *  - I7 : la phrase du robot (robots.js) — les pièces du carnet du serveur, ou celles que cet onglet vient de lancer ; le prochain
 *    passage qui partira ; « Il bipe » trois secondes après un `locate` accepté ;
 *  - I8 : au travail, la plaque à 0,18 et le lavis de 0,14 à 0,03 dans la teinte du robot — l'accent pour l'aspirateur, le vert pour
 *    la tondeuse ; au repos, le gris, sans lavis ; muet, le liseré qui respire ;
 *  - I9 : les puces de la phase et des bits, chacune par son service explicite, jamais `toggle` ; « Démarrer » passe par le serveur
 *    (`loggia/robots/lancer`), en direct sans lui ; le geste d'abord (I33) ; un départ refusé retombe et remonte au toast ;
 *  - I12 : la compacte garde sa disposition et prend la phrase, la batterie, et pour mini-commande la première puce de la carte —
 *    Démarrer, Pause, Reprendre, jamais la base. */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

import { monter, horlogeFausse, documentFaux } from './crochets.mjs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
register('data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?carte_robot')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -'?carte_robot'.length), ctx);",
  // ASSERTION MODIFIÉE (passe bis du 18/10, point 17) : la coquille de la popup (`FicheRobot`) s'exporte aussi, pour sa sous-ligne.
  "  return { ...r, source: String(r.source) + ';export { RoomRobotCard, useVueRobot, CvCard, FicheRobot };' };",
  '}',
].join('\n')));
const { setLoggiaState } = await import('../src/state.js');
const F = await import(new URL('../src/App.jsx?carte_robot', import.meta.url).href);
const RE = await import('../src/robotsetat.js');
const { texteRefus } = await import('../src/refus.js');
const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const CSS = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const T = new Date(2026, 9, 17, 18, 20).getTime();
const S = T / 1000;
const ASP = 'vacuum.aspirateur', TOND = 'lawn_mower.tondeuse';
const iso = (h, m) => new Date(2026, 9, 17, h, m).toISOString();
const st = (id, state, attributes, depuis = iso(17, 50)) => ({ entity_id: id, state, last_changed: depuis, last_updated: depuis, attributes });
function maison() {
  return {
    [ASP]: st(ASP, 'docked', { friendly_name: 'Aspirateur', battery_level: 92, supported_features: 8828 }),
    [TOND]: st(TOND, 'docked', { friendly_name: 'Tondeuse', battery_level: 64, supported_features: 7 }),
  };
}
const ETAT = () => ({
  maintenant: S, meteo: null, journal: [], passages: [], erreurs: {}, en_cours: {},
  config: { plannings: [{ id: 'semaine', robot: ASP, heure: '09:30', jours: [0, 1, 2, 3, 4], zones: [], actif: true },
    { id: 'nuit', robot: ASP, heure: '23:00', jours: [5, 6], zones: [], actif: true }],
  robots: { [ASP]: { calme: { actif: true, debut: '22:00', fin: '07:00' }, pluie: { actif: false } } } },
});
const SALON_CUISINE = [{ id: 'seg:1', nom: 'Salon' }, { id: 'seg:2', nom: 'Cuisine' }];
/* La maison doublée : un `hass` dont chaque lecture est un objet neuf, les services notés, et le serveur de Loggia — `etat` rend
 * ce que le test pose (ou refuse, `muet`), `lancer` attend que le test réponde. */
function poser({ retouche = null, etat = ETAT(), muet = false, rejets = null } = {}) {
  const courants = maison();
  if (retouche) retouche(courants);
  setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: {} });
  const appels = [], ws = [];
  const serveur = {
    callWS: (msg) => {
      if (msg.type === 'loggia/robots/etat') { ws.push(msg); return muet ? Promise.reject({ code: 'unknown_command', message: 'Unknown command.' }) : Promise.resolve(JSON.parse(JSON.stringify(etat))); }
      return new Promise((ok, ko) => ws.push({ ...msg, ok, ko }));
    },
  };
  // Le canal du toast : un rejet non repris ferait échouer le test ; la carte le dit ici (`signalerRobot`).
  RE.reglerRobotsEtat({ hass: serveur, signaler: (e) => { if (rejets) rejets.push(e); else throw e; } });
  const hass = () => ({ ...serveur, states: Object.fromEntries(Object.entries(courants).map(([k, v]) => [k, { ...v }])),
    callService: (d, s, data, cible) => { appels.push([d + '.' + s, (cible && cible.entity_id) || (data && data.entity_id)].join(' ')); return Promise.resolve(); } });
  return { appels, ws, courants, hass, etat };
}
async function dans(fn) {
  const h = horlogeFausse(), d = documentFaux();
  const vraiNow = Date.now;
  h.installer(); d.installer();
  globalThis.document.documentElement = { classList: { contains: () => false } };
  Date.now = () => T;
  try { return await fn({ h, d }); } finally { Date.now = vraiNow; h.restaurer(); d.restaurer(); }
}
const attendre = () => new Promise(r => setImmediate(r));
// Ce qui prend plusieurs tours — un module chargé à la demande, une chaîne de promesses : on attend que ce soit fait, borné.
const jusqua = async (f, n = 500) => { for (let i = 0; i < n && !f(); i++) await attendre(); };
const de = (m, nom) => m.trouver(e => e.type && e.type.name === nom)[0];
const classe = (m, c) => m.trouver(e => e.props && typeof e.props.className === 'string' && e.props.className.split(' ').indexOf(c) >= 0)[0];
const phrase = (m) => classe(m, 'o-gab-phrase');
const plaque = (m) => m.trouver(e => e.props && e.props.style && e.props.style.width === 38)[0];
const puces = (m) => m.trouver(e => e.type === 'button' && /^(Démarrer|Localiser|Pause|Reprendre|Base) /.test(e.props['aria-label'] || ''));
const puce = (m, mot) => puces(m).find(b => b.props['aria-label'].startsWith(mot + ' '));
const carte = async (w, id) => { const m = monter(F.RoomRobotCard, { id, hass: w.hass(), onOpen: () => {} }); await attendre(); m.rendre(); return m; };

test('I5 à I8 : au travail — la teinte du robot, « Nettoie · Salon, Cuisine » du carnet, la batterie nommée, la surface qui dit tout', () => dans(async () => {
  const etat = ETAT();
  etat.en_cours[ASP] = { debut: S - 600, phase: 'travail', duree_min: 10, zones: SALON_CUISINE, tout: false, source: 'loggia', surface: 12 };
  const w = poser({ retouche: (c) => { c[ASP].state = 'cleaning'; c[ASP].attributes.battery_level = 64; }, etat });
  const m = await carte(w, ASP);
  assert.deepEqual(w.ws.map(x => x.type), ['loggia/robots/etat'], 'la carte s’abonne à l’état des robots');
  assert.ok(m.arbre.props.className.split(' ').indexOf('o-gabarit') >= 0 && m.arbre.props.className.indexOf('o-panne') < 0, 'la grille commune, pas de panne');
  assert.deepEqual([plaque(m).props.style.background, plaque(m).props.style.color], ['rgba(var(--o-accent-rgb),.18)', 'var(--o-accent-soft)'], 'la plaque à 0,18 dans l’accent');
  assert.ok(m.arbre.props.style.background.startsWith('linear-gradient(180deg,rgba(var(--o-accent-rgb),0.14),rgba(var(--o-accent-rgb),0.03) 72%)'), m.arbre.props.style.background);
  assert.deepEqual([phrase(m).props.children, phrase(m).props.style.color, phrase(m).props.style['--o-n']], ['Nettoie · Salon, Cuisine', 'var(--o-accent-soft)', 24]);
  assert.equal(classe(m, 'o-gab-nom').props.children, 'Aspirateur');
  assert.equal(de(m, 'Surface').props.label, 'Aspirateur, Nettoie · Salon, Cuisine, batterie 64 %', 'la surface dit le nom, la phrase et la batterie (I6)');
  // Le chiffre nommé : en grand dans la rangée du milieu (carte large), en haut à droite (carte étroite) — la couleur des piles, neutre ici.
  for (const nom of ['ChiffreNomme', 'ChiffreNommeHaut']) {
    const c = de(m, nom);
    assert.deepEqual([c.props.v, c.props.nom, c.props.couleur], [64, 'Batterie', 'var(--o-text)'], nom);
  }
  // Les puces du travail : Pause et Base, chacune son mot (deux n'en montrent que le glyphe sous 200 px, la feuille le dit).
  assert.deepEqual(puces(m).map(b => [b.props['aria-label'], b.props.title]), [['Pause Aspirateur', 'Pause'], ['Base Aspirateur', 'Base']]);
  assert.equal(classe(m, 'o-puces-robot').props['data-n'], 2);
  assert.deepEqual(m.trouver(e => e.props && e.props.className === 'o-puce-robot-mot').map(e => e.props.children), ['Pause', 'Base']);
}));

test('I9, I33 : Pause, Base et Reprendre par leur service, le geste d’abord, la base choisie au retour ; relu après chaque commande ; jamais `toggle`', () => dans(async ({ h }) => {
  const etat = ETAT();
  etat.en_cours[ASP] = { debut: S - 600, phase: 'travail', duree_min: 10, zones: SALON_CUISINE, tout: false, source: 'loggia', surface: 12 };
  const w = poser({ retouche: (c) => { c[ASP].state = 'cleaning'; }, etat });
  const m = await carte(w, ASP);
  m.appuyer(puce(m, 'Pause'));
  await attendre();
  /* ASSERTION MODIFIÉE (passe bis du 18/10, point 1) : le geste en vol vit dans le magasin partagé de robotsetat.js — l'application
   * se redessine à son signal (`useSyncExternalStore`), le harnais des tests à la main (`m.rendre()`). Et la puce qui l'a lancé
   * reste « Pause », en cours, tant que Home Assistant ne l'a pas confirmé : elle disait « Reprendre » sous le doigt, et le second
   * appui relançait le robot. */
  m.rendre();
  assert.deepEqual(w.appels, ['vacuum.pause ' + ASP]);
  assert.equal(phrase(m).props.children, 'En pause · Salon, Cuisine', 'le geste d’abord : la carte n’attend pas son nuage');
  assert.deepEqual(puces(m).map(b => [b.props.title, b.props['aria-disabled'] || null]), [['Pause', 'true'], ['Base', null]]);
  assert.ok(w.ws.filter(x => x.type === 'loggia/robots/etat').length >= 2, 'relu après la commande');
  m.appuyer(puce(m, 'Base'));
  await attendre();
  m.rendre();
  assert.deepEqual(w.appels.slice(1), ['vacuum.return_to_base ' + ASP], 'la base reste permise pendant une pause en vol');
  assert.equal(phrase(m).props.children, 'Retour à la base');
  assert.deepEqual([puce(m, 'Base').props.style.background, puce(m, 'Base').props.style.color], ['var(--o-accent-fond)', '#fff'], 'la base, choisie pendant le retour');
  // ASSERTION MODIFIÉE (passe bis du 18/10, point 1) : pendant le retour demandé, rien ne repart ; Home Assistant confirmé, « Reprendre » revient.
  assert.equal(puce(m, 'Reprendre'), undefined, 'le retour en vol : pas de « Reprendre » sous le doigt');
  w.courants[ASP].state = 'returning';
  h.avancer(1500);
  m.proprietes({ hass: w.hass() });
  m.appuyer(puce(m, 'Reprendre'));
  await attendre();
  assert.deepEqual(w.appels.slice(2), ['vacuum.start ' + ASP], 'reprendre : `vacuum.start`');
  assert.ok(!w.appels.some(x => /toggle/.test(x)));
}));

test('I7, I9, I3 A : sur la base — le prochain passage qui partira ; « Démarrer » passe par le serveur et dit aussitôt « Nettoie · tout le logement » ; « Localiser » fait biper trois secondes', () => dans(async ({ h }) => {
  const w = poser();
  const m = await carte(w, ASP);
  // 23:00 ce soir et demain tombe dans « Ne pas déranger » (22:00–07:00) : il ne partira pas. Le prochain, lundi 09:30.
  assert.deepEqual([phrase(m).props.children, phrase(m).props.style.color], ['Passage lundi 09:30', 'var(--o-text2)']);
  assert.deepEqual([plaque(m).props.style.background, plaque(m).props.style.color], ['var(--o-s1)', 'var(--o-text1)'], 'au repos, le gris doux');
  assert.ok(!String(m.arbre.props.style.background || '').includes('rgba('), 'au repos, pas de lavis');
  assert.deepEqual(puces(m).map(b => b.props.title), ['Démarrer', 'Localiser']);
  m.appuyer(puce(m, 'Démarrer'));
  const lancer = w.ws.find(x => x.type === 'loggia/robots/lancer');
  assert.deepEqual([lancer.robot, lancer.zones], [ASP, []], 'par le serveur, qui note le départ au carnet : tout le logement');
  // ASSERTION MODIFIÉE (passe bis du 18/10, point 1) : le geste vit au magasin partagé ; le harnais redessine à la main (`m.rendre()`).
  m.rendre();
  assert.equal(phrase(m).props.children, 'Nettoie · tout le logement', 'le geste d’abord, et ce que cet onglet vient de lancer');
  assert.deepEqual(puces(m).map(b => [b.props.title, b.props['aria-disabled'] || null]), [['Démarrer', 'true'], ['Base', null]], 'la puce reste « Démarrer », en cours : pas de « Pause » sous le doigt');
  assert.deepEqual(w.appels, [], 'le serveur envoie la commande : rien ne part d’ici');
  lancer.ok({ ...ETAT() });
  await attendre();
  m.rendre();
  assert.equal(phrase(m).props.children, 'Nettoie · tout le logement');
  // Localiser (une autre carte, sur la base) : le service, puis « Il bipe » trois secondes — dans cet onglet.
  const w2 = poser();
  const m2 = await carte(w2, ASP);
  m2.appuyer(puce(m2, 'Localiser'));
  await attendre();
  assert.deepEqual(w2.appels, ['vacuum.locate ' + ASP]);
  m2.rendre();
  assert.deepEqual([phrase(m2).props.children, phrase(m2).props.style.color], ['Il bipe : suivez le son', 'var(--o-accent-soft)']);
  h.avancer(3000);
  m2.rendre();
  assert.equal(phrase(m2).props.children, 'Passage lundi 09:30', 'trois secondes, puis la phrase d’avant');
}));

/* TEST AJOUTÉ (passe bis 2 du 20/10, relecture de contrôle — point 3) : « Localiser » de la CARTE fait comme la popup — son script maison
 * quand il en désigne un qui répond (`vacuumScripts.localiser`, l'aspirateur principal), par le serveur avec son rôle ; « Il bipe » à la
 * réponse ; le geste partagé sans garde : un second appui pendant le vol ne rebipe pas, et « Démarrer » reste offert ; un serveur d'avant
 * (`invalid_format`) ou un script indisponible : `locate`, sans toast. */
test('point 3 : « Localiser » de la carte — son script par le serveur, le bipe à la réponse, un seul appui compte, « Démarrer » reste ; sans script qui répond, `locate`', () => dans(async ({ h }) => {
  const SCRIPTS = { nettoyer_tout: 'script.robot_partout', localiser: 'script.robot_ou' };
  const avecScripts = (etatOu = 'off') => {
    const w = poser({ retouche: (c) => { c['script.robot_ou'] = st('script.robot_ou', etatOu, { friendly_name: 'Robot Ou' }); } });
    setLoggiaState({ cfg: { loggia_entities: { vacuumScripts: SCRIPTS } }, resolved: { vacuum: { available: true, main: ASP } } });
    return w;
  };
  try {
    const w = avecScripts();
    const m = await carte(w, ASP);
    m.appuyer(puce(m, 'Localiser'));
    await attendre();
    const lancer = w.ws.find(x => x.type === 'loggia/robots/lancer');
    assert.deepEqual([lancer.robot, lancer.zones, lancer.script, lancer.role], [ASP, [], 'script.robot_ou', 'localiser'], 'son script, avec son rôle, par le serveur');
    assert.deepEqual(w.appels, [], 'pas de `locate` en plus');
    m.rendre();
    assert.deepEqual(puces(m).map(b => [b.props.title, b.props['aria-disabled'] || null]), [['Démarrer', null], ['Localiser', 'true']], 'en vol : la puce ne fait rien, « Démarrer » reste offert');
    m.appuyer(puce(m, 'Localiser'));
    assert.equal(w.ws.filter(x => x.type === 'loggia/robots/lancer').length, 1, 'un second appui ne relance pas le script');
    lancer.ok({ ...ETAT() });
    await attendre();
    m.rendre();
    assert.deepEqual([phrase(m).props.children, phrase(m).props.style.color], ['Il bipe : suivez le son', 'var(--o-accent-soft)'], '« Il bipe » à la réponse');
    h.avancer(3000); m.rendre();
    assert.equal(phrase(m).props.children, 'Passage lundi 09:30', 'trois secondes, puis la phrase d’avant');
    h.avancer(4000); m.rendre();
    assert.equal(puce(m, 'Localiser').props['aria-disabled'], undefined, 'le filet passé, la puce revient');
    // Un serveur d'avant cette passe : `invalid_format` (son schéma ignore le rôle) — `locate`, sans toast.
    const w2 = avecScripts();
    const m2 = await carte(w2, ASP);
    m2.appuyer(puce(m2, 'Localiser'));
    await attendre();
    w2.ws.find(x => x.type === 'loggia/robots/lancer').ko({ code: 'invalid_format', message: 'extra keys not allowed' });
    await attendre(); await attendre();
    assert.deepEqual(w2.appels, ['vacuum.locate ' + ASP]);
    // Le script désigné mais indisponible ou disparu : le serveur ne le lance pas et ne note rien (`_etat_script`, `script_inconnu`) — `locate`, sans toast.
    const w3 = avecScripts('unavailable');
    const m3 = await carte(w3, ASP);
    m3.appuyer(puce(m3, 'Localiser'));
    await attendre();
    w3.ws.find(x => x.type === 'loggia/robots/lancer').ko({ code: 'script_inconnu', message: 'script inconnu de ce robot : ' + ASP });
    await attendre(); await attendre();
    assert.deepEqual(w3.appels, ['vacuum.locate ' + ASP]);
  } finally { setLoggiaState({ cfg: {}, resolved: {} }); }
}));

test('un départ refusé : l’avance retombe, et le refus remonte au toast avec sa phrase', () => dans(async () => {
  const rejets = [];
  const w = poser({ rejets });
  const m = await carte(w, ASP);
  m.appuyer(puce(m, 'Démarrer'));
  // ASSERTION MODIFIÉE (passe bis du 18/10, point 1) : le geste vit au magasin partagé ; le harnais redessine à la main (`m.rendre()`).
  m.rendre();
  assert.equal(phrase(m).props.children, 'Nettoie · tout le logement');
  w.ws.find(x => x.type === 'loggia/robots/lancer').ko({ code: 'deja_en_route', message: 'deja en route : ' + ASP });
  await jusqua(() => rejets.length > 0);
  m.rendre();
  assert.equal(phrase(m).props.children, 'Passage lundi 09:30', 'l’avance retombe : le robot n’est pas parti');
  assert.deepEqual(rejets.map(r => r && r.code), ['deja_en_route'], 'le refus remonte au toast, son code avec');
  assert.equal(texteRefus(rejets[0]), 'Départ non lancé — le robot est déjà en route', 'et sa phrase est là pour lui');
  assert.deepEqual(w.appels, [], 'rien n’est parti en direct');
}));

test('I8, I9 : la tondeuse — le vert, « Tond · Pelouse arrière », `pause` et `dock` ; sur la base, « Démarrer » seule, son mot visible', () => dans(async () => {
  const etat = ETAT();
  etat.en_cours[TOND] = { debut: S - 1800, phase: 'travail', duree_min: 30, zones: [{ id: 'switch.tondeuse_zone_arriere', nom: 'Pelouse arrière' }], tout: false, source: 'loggia', surface: null };
  const w = poser({ retouche: (c) => { c[TOND].state = 'mowing'; }, etat });
  const m = await carte(w, TOND);
  assert.deepEqual([plaque(m).props.style.background, plaque(m).props.style.color], ['rgba(var(--o-ok-rgb),.18)', 'var(--o-ok)']);
  assert.ok(m.arbre.props.style.background.startsWith('linear-gradient(180deg,rgba(var(--o-ok-rgb),0.14),rgba(var(--o-ok-rgb),0.03) 72%)'));
  assert.deepEqual([phrase(m).props.children, phrase(m).props.style.color], ['Tond · Pelouse arrière', 'var(--o-ok)']);
  assert.deepEqual(puces(m).map(b => b.props.title), ['Pause', 'Base']);
  m.appuyer(puce(m, 'Base'));
  await attendre();
  assert.deepEqual(w.appels, ['lawn_mower.dock ' + TOND]);
  const w2 = poser();
  const m2 = await carte(w2, TOND);
  assert.deepEqual(puces(m2).map(b => b.props.title), ['Démarrer'], 'pas de « Localiser » : Home Assistant n’en a pas pour une tondeuse');
  assert.equal(classe(m2, 'o-puces-robot').props['data-n'], 1, 'une puce seule garde son mot');
  assert.equal(phrase(m2).props.children, 'Sur la base', 'aucun planning : la base');
}));

test('en erreur, à l’arrêt, muet : la base seule, l’arrêt qui repart ou rentre, le liseré qui respire et rien à toucher', () => dans(async () => {
  const etat = ETAT();
  etat.erreurs[ASP] = { texte: 'Brosse coincée', t: S - 60 };
  const w = poser({ retouche: (c) => { c[ASP].state = 'error'; }, etat });
  const m = await carte(w, ASP);
  assert.deepEqual([phrase(m).props.children, phrase(m).props.style.color], ['En erreur · Brosse coincée', 'var(--o-bad)'], 'le message que publie son capteur, au carnet');
  assert.deepEqual(puces(m).map(b => b.props.title), ['Base']);
  assert.deepEqual([plaque(m).props.style.background, plaque(m).props.style.color], ['var(--o-s1)', 'var(--o-text1)']);
  const w2 = poser({ retouche: (c) => { c[ASP].state = 'idle'; } });
  const m2 = await carte(w2, ASP);
  assert.equal(phrase(m2).props.children, 'À l’arrêt');
  assert.deepEqual(puces(m2).map(b => b.props.title), ['Démarrer', 'Base'], 'arrêté hors de sa base : repartir, ou rentrer');
  const w3 = poser({ retouche: (c) => { c[ASP] = st(ASP, 'unavailable', { friendly_name: 'Aspirateur', battery_level: 92, supported_features: 8828 }, iso(14, 20)); } });
  const m3 = await carte(w3, ASP);
  assert.ok(m3.arbre.props.className.split(' ').indexOf('o-panne') >= 0, 'muet : le liseré qui respire');
  assert.deepEqual([phrase(m3).props.children, phrase(m3).props.style.color], ['Indisponible depuis 14:20', 'var(--o-bad)']);
  assert.deepEqual(puces(m3), [], 'rien à toucher');
  assert.equal(de(m3, 'ChiffreNomme'), undefined, 'une batterie d’avant la panne ne se donne pas pour vraie');
  assert.deepEqual([plaque(m3).props.style.background, plaque(m3).props.style.color], ['var(--o-s1)', 'var(--o-text3)']);
}));

test('sans serveur, rien ne s’invente : « Sur la base », « Nettoyage en cours » ; « Démarrer » part en direct', () => dans(async () => {
  const w = poser({ muet: true });
  const m = await carte(w, ASP);
  assert.equal(phrase(m).props.children, 'Sur la base', 'pas de planning lu : pas de passage annoncé');
  m.appuyer(puce(m, 'Démarrer'));
  w.ws.find(x => x.type === 'loggia/robots/lancer').ko({ code: 'unknown_command', message: 'Unknown command.' });
  await jusqua(() => w.appels.length > 0);
  assert.deepEqual(w.appels, ['vacuum.start ' + ASP], 'un composant d’avant ce chantier : le service du domaine, comme avant');
  const w2 = poser({ muet: true, retouche: (c) => { c[ASP].state = 'cleaning'; } });
  const m2 = await carte(w2, ASP);
  assert.equal(phrase(m2).props.children, 'Nettoyage en cours', 'les pièces ne se savent pas');
}));

test('I12 : la compacte — la phrase, la batterie à droite, et pour mini-commande la première puce de la carte, jamais la base', () => dans(async () => {
  const compacte = async (w, id) => { const m = monter(F.CvCard, { id, hass: w.hass(), onOpen: () => {}, dense: true }); await attendre(); m.rendre(); return m; };
  const mini = (m) => m.trouver(e => e.type === 'button' && /^(Démarrer|Pause|Reprendre|Base|Localiser) /.test(e.props['aria-label'] || ''));
  const w = poser();
  const m = await compacte(w, ASP);
  assert.equal(m.texte().includes('Passage lundi 09:30'), true, 'la phrase de la carte');
  assert.ok(m.texte().includes('92' + String.fromCharCode(160) + '%'), 'la batterie à droite');
  assert.deepEqual(mini(m).map(b => b.props['aria-label']), ['Démarrer Aspirateur']);
  m.appuyer(mini(m)[0]);
  assert.deepEqual(w.ws.filter(x => x.type === 'loggia/robots/lancer').map(x => x.robot), [ASP], 'Démarrer passe par le serveur');
  const w2 = poser({ retouche: (c) => { c[ASP].state = 'cleaning'; } });
  const m2 = await compacte(w2, ASP);
  assert.deepEqual(mini(m2).map(b => b.props['aria-label']), ['Pause Aspirateur']);
  m2.appuyer(mini(m2)[0]);
  await attendre();
  assert.deepEqual(w2.appels, ['vacuum.pause ' + ASP]);
  const w3 = poser({ retouche: (c) => { c[ASP].state = 'returning'; } });
  assert.deepEqual(mini(await compacte(w3, ASP)).map(b => b.props['aria-label']), ['Reprendre Aspirateur'], 'au retour : reprendre — elle ne renvoie plus à la base');
  const w4 = poser({ retouche: (c) => { c[ASP].state = 'error'; } });
  assert.deepEqual(mini(await compacte(w4, ASP)), [], 'en erreur, la base seule : pas de mini-commande');
}));

/* TEST AJOUTÉ (passe bis du 18/10, point 1) : la preuve de la relecture — deux appuis sur la première puce d'un robot qui travaille
 * envoyaient `pause`, puis `start` : la puce avait basculé sous le doigt sur l'avance du geste. Le geste en vol vit désormais dans un
 * magasin partagé (robotsetat.js) : la carte large, l'étroite (la même puce) et la compacte n'envoient qu'UN service ; la puce reste
 * « Pause », en cours, sans rien offrir de l'inverse ; l'avance se voit pareil dans la vue de la popup ; Home Assistant confirmé,
 * passé 1,5 s, « Reprendre » revient ; sans réponse, passé le filet (5 s et un relevé du pont), la carte redit ce que dit la maison. */
test('point 1 : deux appuis sur « Pause » — la carte, la compacte : UN service, jamais `start` après `pause` ; l’avance partagée', () => dans(async ({ h }) => {
  for (const [id, dom, travail, nom] of [[ASP, 'vacuum', 'cleaning', 'Aspirateur'], [TOND, 'lawn_mower', 'mowing', 'Tondeuse']]) {
    const w = poser({ retouche: (c) => { c[id].state = travail; } });
    const m = await carte(w, id);
    const premiere = m.trouver(e => e.type === 'button' && e.props['aria-label'] === 'Pause ' + nom)[0];
    m.appuyer(premiere);
    await attendre();
    m.appuyer(premiere); // le second appui, au même endroit
    await attendre();
    m.rendre();
    assert.deepEqual(w.appels, [dom + '.pause ' + id], nom + ' : un seul service');
    assert.deepEqual(puces(m).map(b => [b.props.title, b.props['aria-disabled'] || null]), [['Pause', 'true'], ['Base', null]], nom + ' : la puce reste « Pause », en cours ; pas de « Reprendre » sous le doigt');
    assert.deepEqual([puce(m, 'Pause').props.style.background, puce(m, 'Pause').props.style.color], ['var(--o-accent-fond)', '#fff'], 'en cours : la puce choisie');
    m.appuyer(puce(m, 'Pause'));
    assert.deepEqual(w.appels, [dom + '.pause ' + id], 'la puce en cours ne fait rien');
    // La vue de la popup, montée à part, lit le MÊME geste : l'avance se voit pareil (point 10 de la conformité).
    const vue = monter((p) => F.useVueRobot(p.hass, p.id, null, true, { rapide: true }), { hass: w.hass(), id });
    await attendre();
    vue.rendre();
    assert.deepEqual([vue.arbre.phase, vue.arbre.geste && vue.arbre.geste.cle], ['pause', 'pause'], 'la popup dit « En pause », comme la carte');
    // Home Assistant confirme ; passé 1,5 s, la puce peut dire « Reprendre ».
    w.courants[id].state = 'paused';
    h.avancer(1500);
    m.proprietes({ hass: w.hass() });
    assert.deepEqual(puces(m).map(b => b.props.title), ['Reprendre', 'Base']);
    assert.equal(puce(m, 'Reprendre').props['aria-disabled'], undefined);
  }
  // Sans réponse de Home Assistant : passé le filet, la carte redit ce que dit la maison.
  const w = poser({ retouche: (c) => { c[ASP].state = 'cleaning'; } });
  const m = await carte(w, ASP);
  m.appuyer(puce(m, 'Pause'));
  m.rendre();
  assert.equal(phrase(m).props.children, 'En pause');
  h.avancer(6999);
  m.rendre();
  assert.equal(puce(m, 'Pause').props['aria-disabled'], 'true', 'le filet tient encore');
  h.avancer(1);
  m.rendre();
  assert.deepEqual([phrase(m).props.children, puce(m, 'Pause').props['aria-disabled']], ['Nettoyage en cours', undefined], 'le filet passé : la maison fait foi');
}));

test('point 1 : la compacte — deux appuis sur sa mini-commande : un seul service ; « Démarrer » deux fois : un seul départ', () => dans(async () => {
  const compacte = async (w, id) => { const m = monter(F.CvCard, { id, hass: w.hass(), onOpen: () => {}, dense: true }); await attendre(); m.rendre(); return m; };
  const mini = (m) => m.trouver(e => e.type === 'button' && /^(Démarrer|Pause|Reprendre) /.test(e.props['aria-label'] || ''))[0];
  const w = poser({ retouche: (c) => { c[TOND].state = 'mowing'; } });
  const m = await compacte(w, TOND);
  const avant = mini(m);
  m.appuyer(avant);
  await attendre();
  m.appuyer(avant);
  await attendre();
  m.rendre();
  assert.deepEqual(w.appels, ['lawn_mower.pause ' + TOND], 'un seul service, jamais `start_mowing` après `pause`');
  assert.equal(mini(m).props['aria-label'], 'Pause Tondeuse', 'la mini-commande reste « Pause »');
  const w2 = poser();
  const m2 = await compacte(w2, ASP);
  const demarrer = mini(m2);
  m2.appuyer(demarrer);
  m2.appuyer(demarrer);
  assert.equal(w2.ws.filter(x => x.type === 'loggia/robots/lancer').length, 1, 'un seul départ part au serveur');
}));

/* TEST AJOUTÉ (passe bis du 18/10, point 8) : la batterie que la carte montre — bornée de 0 à 100 ; un attribut vide n'est pas « 0 % »,
 * c'est une batterie inconnue, que la carte tait ; sans attribut, la sœur `battery`. */
test('point 8 : la batterie de la carte — bornée, inconnue plutôt que 0 %, la sœur ensuite', () => dans(async () => {
  const bat = async (x, soeurs = null) => {
    const w = poser({ retouche: (c) => { Object.assign(c[ASP].attributes, x); if (soeurs) Object.assign(c, soeurs); } });
    if (soeurs) setLoggiaState({ index: { entityMeta: new Map([[ASP, { deviceId: 'd1', device: 'Aspirateur' }], ...Object.keys(soeurs).map(id => [id, { deviceId: 'd1', device: 'Aspirateur', deviceClass: soeurs[id].attributes.device_class }])]), deviceMeta: new Map(), areaList: [], areaNameOf: () => null }, ent: {}, cfg: {}, resolved: {} });
    const m = await carte(w, ASP);
    const c = de(m, 'ChiffreNomme');
    return [c ? c.props.v : null, phrase(m).props.children];
  };
  assert.deepEqual(await bat({ battery_level: 130 }), [100, 'Passage lundi 09:30']);
  assert.deepEqual(await bat({ battery_level: '' }), [null, 'Passage lundi 09:30'], 'vide : la carte tait sa batterie, jamais « 0 % »');
  const soeurs = { 'sensor.aspirateur_batterie': st('sensor.aspirateur_batterie', '45.6', { device_class: 'battery', unit_of_measurement: '%' }) };
  const r = await bat({ battery_level: undefined }, soeurs);
  assert.equal(r[0], 46, 'la sœur `battery`, sans attribut');
}));

/* TEST AJOUTÉ (passe bis du 18/10, point 16) : sur la carte étroite, la colonne du chiffre nommé (en haut à droite) tient dans les 38 px
 * de la plaque — sinon la rangée du haut grandit et un nom sur deux lignes pousse le pied hors des 150 px de contenu (38 + 10 + 32 + 2
 * + 15 + 9 + 44). La marge de 4 px du chiffre de la grille (`ChiffreHaut`) faisait 4 + 22 + 2 + 11 = 39 : un pixel de trop. */
test('point 16 : la colonne du chiffre nommé de la carte étroite tient dans les 38 px de la plaque', () => dans(async () => {
  const w = poser({ retouche: (c) => { c[ASP].attributes.friendly_name = 'Aspirateur robot du rez-de-chaussée'; } });
  const m = await carte(w, ASP);
  const haut = de(m, 'ChiffreNommeHaut');
  const mh = monter(haut.type, haut.props);
  const chiffre = mh.trouver(e => e.type && e.type.name === 'ChiffreHaut')[0];
  const nom = mh.trouver(e => e.type === 'span' && e.props.style && e.props.style.fontSize === 9.5)[0];
  const colonne = (chiffre.props.haut ?? 4) + 22 + Number(nom.props.style.marginTop || 0) + parseFloat(nom.props.style.lineHeight);
  assert.ok(colonne <= 38, colonne + ' px pour 38');
  // Le chiffre de la grille, ailleurs, garde sa marge de 4 px (sa règle, T6).
  const autre = monter(chiffre.type, { v: 92, u: '%' }).arbre;
  assert.equal(autre.props.style.marginTop, 4);
}));

/* TEST AJOUTÉ (passe bis du 18/10, point 17) : la sous-ligne de l'en-tête de la popup commence par une majuscule — « Robot aspirateur »
 * sans zone, comme « Distributeur » ; avec sa zone, « Salon · robot aspirateur », comme sa maquette (« Maison · robot aspirateur »). */
test('point 17 : la sous-ligne de la popup — « Robot aspirateur » sans zone, « Salon · robot tondeuse » avec', () => dans(async () => {
  const sous = async (id, zone) => {
    const w = poser();
    if (zone) setLoggiaState({ index: { entityMeta: new Map(), deviceMeta: new Map(), areaList: [{ name: zone, entities: [id] }], areaNameOf: () => zone } });
    const m = monter(F.FicheRobot, { id, hass: w.hass(), onClose: () => {} });
    await attendre();
    m.rendre();
    const contenu = m.arbre.props.children();
    let fiche = null;
    (function chercher(n) { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) { n.forEach(chercher); return; } if (n.props && 'sousNom' in n.props) fiche = n; chercher(n.props && n.props.children); })(contenu);
    return fiche.props.sousNom;
  };
  assert.equal(await sous(ASP, null), 'Robot aspirateur');
  assert.equal(await sous(TOND, null), 'Robot tondeuse');
  assert.equal(await sous(TOND, 'Salon'), 'Salon · robot tondeuse');
}));

test('la place des robots : la carte au gabarit commun, l’ancienne carte machine et ses branches parties, « En ce moment » qui dit la phrase', () => {
  assert.ok(!APP.includes('function RoomMachineCard('), 'l’ancienne carte machine est partie');
  assert.ok(APP.includes("(d === 'vacuum' || d === 'lawn_mower') ? <RoomRobotCard id={id} hass={hass} onOpen={ouvrir} label={label} />"), 'les robots ont leur carte, dans toute vue');
  const cv = APP.slice(APP.indexOf('function CvCard('), APP.indexOf('\n}\n', APP.indexOf('function CvCard(')));
  assert.ok(!cv.includes("tr('Démarrer le nettoyage')") && !cv.includes("tr('Lancer la tonte')") && !cv.includes("'start_mowing'"), 'la compacte ne commande plus le robot par elle-même : sa vue le fait');
  const moment = APP.slice(APP.indexOf('const momentRows = [];'), APP.indexOf('const nEnCours = momentRows.length;'));
  assert.ok(moment.includes('phraseRobot({ domaine: dom, phase: phaseRobot(dom, e.state)'), '« En ce moment » écrit la phrase du robot (I34)');
  assert.ok(moment.includes("commande(id, 'vacuum', 'return_to_base')") && moment.includes("commande(id, 'lawn_mower', 'dock')"), 'son geste reste « Renvoyer au dock »');
  assert.ok(/@container \(width < 200px\) \{ \.o-puces-robot\[data-n="2"\] \.o-puce-robot-mot \{ display: none; \} \}/.test(CSS), 'deux puces n’ont que leur glyphe sous 200 px de contenu (I9)');
});
