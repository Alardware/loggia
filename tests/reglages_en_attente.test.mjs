/* Un réglage qui n'est jamais arrivé au serveur (28/09).
 *
 * « Parfois quand j'actualise la page, éventuellement après un redémarrage,
 * j'ai une organisation de cartes grande petite, masquer, démasquer. Et bien
 * ça réinitialise et revient en arrière, je suis obligé de remettre mes cartes
 * comme je les avais mises. »
 *
 * Ce n'est pas l'agencement qui était mal enregistré : c'est l'envoi qui se
 * perdait, sans que personne ne le reprenne. Voir `src/enattente.js`.
 *
 * Audit du 03/10 : le carnet se range PAR COMPTE (`MOI` ci-dessous), retient
 * une EMPREINTE de ce que le serveur tenait, et renvoie CLÉ PAR CLÉ
 * (reglages_en_attente_cle_par_cle.test.mjs). */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Un stockage d'appareil, en mémoire. Le module ne connaît que `window` : il
 * doit exister AVANT le premier appel, pas avant l'import. */
const boite = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (boite.has(k) ? boite.get(k) : null),
    setItem: (k, v) => { boite.set(k, String(v)); },
    removeItem: (k) => { boite.delete(k); },
  },
};

const { compteDe, poserEnAttente, purgerEnAttente, enAttente, renvoyerEnAttente, empreinte } = await import('../src/enattente.js');

const CLE = 'loggia_enattente';
const MOI = 'compte-famille';
const ADMIN = 'compte-admin';
const AGENCEMENT = { Salon: { larges: ['light.plafonnier'], compacts: ['switch.prise'] } };

beforeEach(() => { boite.clear(); });

test('on inscrit AVANT d’envoyer, et l’on raye au succès', () => {
  const marques = poserEnAttente({ loggia_roomlayout: AGENCEMENT }, MOI);
  assert.deepEqual(enAttente(MOI), { loggia_roomlayout: AGENCEMENT }, 'le lot doit attendre dès maintenant');
  assert.equal(marques.loggia_roomlayout, 1, 'la première écriture d’une clé porte la marque 1');
  purgerEnAttente(marques, MOI);
  assert.equal(enAttente(MOI), null, 'ce qui est arrivé ne doit plus attendre');
  assert.equal(boite.has(CLE), false, 'un carnet vide s’efface, il ne se garde pas');
});

test('une écriture faite PENDANT l’aller-retour ne se fait pas rayer', () => {
  const premier = poserEnAttente({ loggia_roomlayout: AGENCEMENT }, MOI);
  // L'utilisateur range une autre carte avant que la première réponse arrive.
  const second = { Salon: { larges: [] } };
  poserEnAttente({ loggia_roomlayout: second }, MOI);
  // La réponse du PREMIER envoi arrive enfin.
  purgerEnAttente(premier, MOI);
  assert.deepEqual(enAttente(MOI), { loggia_roomlayout: second },
    'la dernière valeur serait celle qui se perdrait');
});

test('une suppression attend comme le reste', () => {
  poserEnAttente({ loggia_roomlayout: null }, MOI);
  assert.deepEqual(enAttente(MOI), { loggia_roomlayout: null },
    'effacer une clé est un réglage : il doit arriver au serveur lui aussi');
});

test('un carnet abîmé ne bloque rien', () => {
  boite.set(CLE, 'ceci n’est pas du JSON');
  assert.equal(enAttente(MOI), null);
  const m = poserEnAttente({ loggia_seclayout: { a: 1 } }, MOI);
  assert.deepEqual(enAttente(MOI), { loggia_seclayout: { a: 1 } }, 'on repart d’un carnet propre');
  purgerEnAttente(m, MOI);
  boite.set(CLE, JSON.stringify(['une', 'liste']));
  assert.equal(enAttente(MOI), null, 'une liste n’est pas un carnet');
});

test('au démarrage, ce qui attend repart, une clé par envoi — et le carnet se vide', async () => {
  poserEnAttente({ loggia_roomlayout: AGENCEMENT, loggia_seclayout: null }, MOI);
  const envoyes = [];
  const hass = { user: { id: MOI }, callWS: async (msg) => { envoyes.push(msg); return {}; } };
  const r = await renvoyerEnAttente(hass);
  // Une clé par envoi (audit du 03/10) : un refus n'emporte plus que la sienne.
  assert.equal(envoyes.length, 2, 'une clé par envoi : un refus n’emporte plus que la sienne');
  assert.ok(envoyes.every((m) => m.type === 'loggia/config/set' && Object.keys(m.config).length === 1));
  assert.deepEqual(Object.assign({}, ...envoyes.map((m) => m.config)), { loggia_roomlayout: AGENCEMENT, loggia_seclayout: null },
    'tout le carnet repart, suppression comprise');
  assert.deepEqual(r.cles.sort(), ['loggia_roomlayout', 'loggia_seclayout']);
  assert.equal(enAttente(MOI), null);
});

test('un transport coupé GARDE, un refus applicatif ABANDONNE', async () => {
  poserEnAttente({ loggia_roomlayout: AGENCEMENT }, MOI);

  // Home Assistant redémarre : la connexion tombe, l'erreur n'a pas de `code`.
  const coupe = { user: { id: MOI }, callWS: async () => { throw new Error('Connection lost'); } };
  const r1 = await renvoyerEnAttente(coupe);
  assert.deepEqual(r1.cles, [], 'rien n’est parti');
  assert.deepEqual(enAttente(MOI), { loggia_roomlayout: AGENCEMENT },
    'le carnet doit garder : c’est tout l’intérêt, on retentera');

  // Le serveur REFUSE (clé de la maison depuis un compte ordinaire) : retenter
  // à chaque ouverture ne donnerait rien de plus.
  const warn = console.warn; console.warn = () => {};
  const refus = { user: { id: MOI }, callWS: async () => { const e = new Error('reserve'); e.code = 'not_admin'; throw e; } };
  const r2 = await renvoyerEnAttente(refus);
  console.warn = warn;
  assert.ok(r2.refus, 'un refus se distingue d’une panne de transport');
  assert.equal(enAttente(MOI), null, 'un refus applicatif ne se retente pas indéfiniment');
});

test('sans composant, le carnet attend sans rien perdre', async () => {
  poserEnAttente({ loggia_roomlayout: AGENCEMENT }, MOI);
  const r = await renvoyerEnAttente(null, MOI);
  assert.deepEqual(r.cles, []);
  assert.deepEqual(enAttente(MOI), { loggia_roomlayout: AGENCEMENT });
});

/* Rejeu B de l'audit du 03/10 — un carnet PAR COMPTE. */

test('le compte d’une session se lit sur hass.user.id', () => {
  assert.equal(compteDe({ user: { id: MOI } }), MOI);
  assert.equal(compteDe({ user: {} }), null);
  assert.equal(compteDe(null), null);
});

test('sans compte, rien ne s’inscrit : personne ne saurait sous quels droits le rejouer', () => {
  assert.deepEqual(poserEnAttente({ loggia_roomlayout: AGENCEMENT }, null), {});
  assert.equal(boite.has(CLE), false);
});

test('rejeu B : ce qu’un compte ordinaire a laissé ne repart JAMAIS sous un administrateur', async () => {
  // Un compte ordinaire tente un réglage de la maison ; l'envoi se perd.
  poserEnAttente({ loggia_users: [{ name: 'Invité' }] }, MOI);
  // Un administrateur ouvre ensuite la même tablette.
  const envoyes = [];
  const admin = { user: { id: ADMIN }, callWS: async (msg) => { envoyes.push(msg); return {}; } };
  const r = await renvoyerEnAttente(admin);
  assert.equal(envoyes.length, 0, 'la valeur refusée au compte ordinaire serait passée sous les droits de l’administrateur');
  assert.deepEqual(r.cles, []);
  assert.deepEqual(enAttente(MOI), { loggia_users: [{ name: 'Invité' }] }, 'elle attend son auteur, et seulement lui');
  assert.equal(enAttente(ADMIN), null);
});

test('deux comptes sur la même tablette : chacun son carnet', () => {
  const a = poserEnAttente({ loggia_roomlayout: AGENCEMENT }, MOI);
  poserEnAttente({ loggia_seclayout: { a: 1 } }, ADMIN);
  purgerEnAttente(a, MOI);
  assert.equal(enAttente(MOI), null);
  assert.deepEqual(enAttente(ADMIN), { loggia_seclayout: { a: 1 } }, 'rayer chez l’un ne raye pas chez l’autre');
});

test('un carnet d’avant le 03/10, rangé sans auteur, se lit vide', () => {
  boite.set(CLE, JSON.stringify({ loggia_users: { v: [{ name: 'Invité' }], n: 1 } }));
  assert.equal(enAttente(MOI), null, 'personne ne sait sous quel compte il avait été écrit');
  poserEnAttente({ loggia_roomlayout: AGENCEMENT }, MOI);
  assert.deepEqual(JSON.parse(boite.get(CLE)), { comptes: { [MOI]: { loggia_roomlayout: { v: AGENCEMENT, n: 1 } } } },
    'la première écriture le remplace par le format par compte');
});

test('le câblage dans App, et la clé qui ne doit pas voyager', () => {
  const app = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
  assert.ok(app.includes("import { compteDe, poserEnAttente, purgerEnAttente, renvoyerEnAttente } from './enattente.js';"), 'App n’importe plus le carnet');
  assert.ok(app.includes('const compte = compteDe(h);\n    const marques = poserEnAttente(patch, compte, cfgServeurRef.current);'),
    'le lot doit être inscrit AVANT l’envoi, sous le compte qui écrit — sinon actualiser pendant l’aller-retour le perd');
  assert.ok(app.indexOf('const marques = poserEnAttente(patch, compte, cfgServeurRef.current);') < app.indexOf("h.callWS({ type: 'loggia/config/set', config: patch })"),
    'inscrit APRÈS l’envoi, le carnet ne servirait à rien');
  assert.ok(app.includes('.then(() => purgerEnAttente(marques, compte))'), 'ce qui arrive doit être rayé');
  assert.ok(app.includes('purgerEnAttente(marques, compte);\n          Promise.reject(e);'), 'ce qui est REFUSÉ doit être rayé aussi');
  assert.ok(app.includes("if (!(e && (e.code === 'not_admin' || e.code === 'code_admin_requis'))) local();"),
    'une valeur refusée faute de droits ne se recopie pas sur l’appareil — completerDepuisLocal la confierait au serveur sous un administrateur');
  assert.ok(app.includes('cfgServeurRef.current = serverOk ? serverCfg : null;'),
    'l’empreinte se prend sur ce que le serveur tient — et sur rien tant qu’il n’a pas répondu');
  assert.ok(app.includes('renvoyerEnAttente(h, monId, state.available ? state.config : null)'), 'rien ne repart au démarrage, ou pas sous le bon compte');

  const cfg = readFileSync(join(RACINE, 'src', 'config.js'), 'utf8');
  assert.ok(cfg.includes("LOCAL_ONLY_KEYS = new Set(['loggia_enattente'])"),
    'le carnet décrit un incident de CET appareil : ni export, ni configuration de la maison');
});

test('ce qui rendait la perte définitive est toujours là — et c’est voulu', () => {
  const etat = readFileSync(join(RACINE, 'src', 'state.js'), 'utf8');
  const cfg = readFileSync(join(RACINE, 'src', 'config.js'), 'utf8');
  /* Ces deux règles sont justes : le serveur fait autorité sur ce qui est
   * commun, et `completerDepuisLocal` ne doit jamais écraser une valeur
   * serveur par une vieille copie locale. C'est leur RENCONTRE qui perdait le
   * réglage, faute de quiconque pour le renvoyer. Si l'une des deux change, ce
   * test doit être relu — pas supprimé. */
  assert.ok(etat.includes('if (LOGGIA_SERVER && !estPersonnelle(key)) return fallback;'),
    'le serveur ne fait plus autorité : le carnet n’a plus la même raison d’être');
  assert.ok(cfg.includes('if (dejaLa !== undefined && dejaLa !== null) return;'),
    'completerDepuisLocal ne pousse plus seulement les clés absentes');
});

/* Audit du 03/10 — un réglage resté au carnet écrasait, des jours plus tard,
 * l'agencement rangé entre-temps sur un autre écran : l'ordre du PC, la carte
 * ajoutée, la disposition de la tablette disparaissaient sans un mot. Le
 * carnet retient l'EMPREINTE de ce que le serveur tenait, et celles de nos
 * envois restés sans réponse ; au renvoi, si le serveur tient autre chose,
 * c'est lui qui a raison.
 *
 * Un faux composant applique `loggia/config/set` comme `store.py` (une valeur
 * nulle efface) et rend sa configuration comme `loggia/config/get`. */
const copie = (o) => JSON.parse(JSON.stringify(o));
function fauxComposant(depart) {
  const config = copie(depart);
  const envois = [];
  const hass = {
    user: { id: MOI },
    callWS: async (msg) => {
      envois.push(msg);
      Object.entries(msg.config).forEach(([k, v]) => {
        if (v == null) delete config[k]; else config[k] = copie(v);
      });
      return {};
    },
  };
  return { config, envois, hass, lire: () => copie(config) };
}
const taire = async (f) => {
  const info = console.info; console.info = () => {};
  try { return await f(); } finally { console.info = info; }
};

test('rejeu A : le téléphone rate une écriture, le PC range, le téléphone rouvre — le rangement du PC survit', async () => {
  const maison = fauxComposant({ loggia_roomlayout: AGENCEMENT });
  const TELEPHONE = { Salon: { larges: [], compacts: ['light.plafonnier', 'switch.prise'] } };
  const PC = {
    Salon: { larges: ['switch.prise'], compacts: ['light.plafonnier'] },
    Cuisine: { larges: ['light.plan_de_travail'] },
  };

  // Le téléphone range ; Home Assistant redémarre, l'envoi se perd.
  poserEnAttente({ loggia_roomlayout: TELEPHONE }, MOI, maison.lire());

  // Le lendemain, l'ordinateur range à son tour — et ça arrive.
  await maison.hass.callWS({ type: 'loggia/config/set', config: { loggia_roomlayout: PC } });
  maison.envois.length = 0;

  // Le téléphone rouvre : il lit la configuration, puis vide son carnet.
  const r = await taire(() => renvoyerEnAttente(maison.hass, MOI, maison.lire()));

  assert.deepEqual(maison.config.loggia_roomlayout, PC,
    'un réglage vieux d’un jour a écrasé le rangement fait depuis sur l’ordinateur');
  assert.equal(maison.envois.length, 0, 'rien ne devait repartir');
  assert.deepEqual(r.cles, []);
  assert.deepEqual(r.depassees, ['loggia_roomlayout'], 'l’abandon doit nommer la clé');
  assert.equal(enAttente(MOI), null, 'dépassée, l’entrée se raye — sinon elle attendrait à chaque ouverture');
});

test('personne n’a rangé depuis : le carnet renvoie, comme le 28/09', async () => {
  const maison = fauxComposant({ loggia_roomlayout: AGENCEMENT, loggia_seclayout: { a: 1 } });
  const NEUF = { Salon: { larges: [] } };
  poserEnAttente({ loggia_roomlayout: NEUF, loggia_seclayout: null }, MOI, maison.lire());
  const r = await renvoyerEnAttente(maison.hass, MOI, maison.lire());
  assert.deepEqual(r.cles.sort(), ['loggia_roomlayout', 'loggia_seclayout']);
  assert.deepEqual(maison.config.loggia_roomlayout, NEUF, 'le cas du 28/09 doit toujours repartir');
  assert.equal('loggia_seclayout' in maison.config, false, 'une suppression perdue repart elle aussi');
  assert.equal(enAttente(MOI), null);
});

test('Home Assistant redémarre en plein rangement : le premier envoi arrive sans réponse, le second se perd — le second repart', async () => {
  const maison = fauxComposant({ loggia_roomlayout: AGENCEMENT });
  const UN = { Salon: { larges: [] } };
  const DEUX = { Salon: { larges: [], compacts: ['switch.prise'] } };
  const vu = maison.lire();
  poserEnAttente({ loggia_roomlayout: UN }, MOI, vu);
  // Il arrive, mais la connexion tombe avant la réponse : rien n'est rayé.
  await maison.hass.callWS({ type: 'loggia/config/set', config: { loggia_roomlayout: UN } });
  // L'écran montre déjà UN (état optimiste) ; le second part dans le vide.
  poserEnAttente({ loggia_roomlayout: DEUX }, MOI, { ...vu, loggia_roomlayout: UN });
  maison.envois.length = 0;
  const r = await taire(() => renvoyerEnAttente(maison.hass, MOI, maison.lire()));
  assert.deepEqual(r.depassees, [],
    'le serveur tient NOTRE premier envoi, pas un rangement venu d’ailleurs');
  assert.deepEqual(r.cles, ['loggia_roomlayout']);
  assert.deepEqual(maison.config.loggia_roomlayout, DEUX,
    'un redémarrage pendant qu’on range perdait de nouveau la dernière carte — le cas même du 28/09');
  assert.equal(enAttente(MOI), null);
});

test('deux envois en route : le premier répond, le second se perd — le second repart', async () => {
  const maison = fauxComposant({ loggia_roomlayout: AGENCEMENT });
  const UN = { Salon: { larges: [] } };
  const DEUX = { Salon: { larges: [], compacts: ['switch.prise'] } };
  const vu = maison.lire();
  const m1 = poserEnAttente({ loggia_roomlayout: UN }, MOI, vu);
  poserEnAttente({ loggia_roomlayout: DEUX }, MOI, { ...vu, loggia_roomlayout: UN });
  await maison.hass.callWS({ type: 'loggia/config/set', config: { loggia_roomlayout: UN } });
  purgerEnAttente(m1, MOI);
  const r = await taire(() => renvoyerEnAttente(maison.hass, MOI, maison.lire()));
  assert.deepEqual(r.cles, ['loggia_roomlayout'], 'la réponse du premier ne doit pas faire passer le second pour dépassé');
  assert.deepEqual(maison.config.loggia_roomlayout, DEUX);
});

test('arrivé, mais la réponse s’est perdue : rayé sans rien renvoyer', async () => {
  const maison = fauxComposant({ loggia_roomlayout: AGENCEMENT });
  const NEUF = { Salon: { larges: [] } };
  poserEnAttente({ loggia_roomlayout: NEUF }, MOI, maison.lire());
  await maison.hass.callWS({ type: 'loggia/config/set', config: { loggia_roomlayout: NEUF } });
  maison.envois.length = 0;
  const r = await renvoyerEnAttente(maison.hass, MOI, maison.lire());
  assert.equal(maison.envois.length, 0, 'le serveur tenait déjà cette valeur');
  assert.deepEqual(r.depassees, [], 'ce n’est pas un abandon : la valeur est là-bas');
  assert.equal(enAttente(MOI), null);
});

test('l’écran relit le rangement d’un autre, puis range par-dessus : c’est ce dernier qui repart', async () => {
  const maison = fauxComposant({ loggia_roomlayout: AGENCEMENT });
  poserEnAttente({ loggia_roomlayout: { Salon: { larges: [] } } }, MOI, maison.lire()); // perdu
  const PC = { Cuisine: { larges: ['light.plan_de_travail'] } };
  await maison.hass.callWS({ type: 'loggia/config/set', config: { loggia_roomlayout: PC } });
  // Resté ouvert, le téléphone relit (ADR 0067) et range en le voyant — perdu aussi.
  const PAR_DESSUS = { ...PC, Salon: { larges: ['light.plafonnier'] } };
  poserEnAttente({ loggia_roomlayout: PAR_DESSUS }, MOI, maison.lire());
  const r = await taire(() => renvoyerEnAttente(maison.hass, MOI, maison.lire()));
  assert.deepEqual(r.cles, ['loggia_roomlayout'], 'ce rangement a été fait en VOYANT celui de l’ordinateur');
  assert.deepEqual(maison.config.loggia_roomlayout, PAR_DESSUS);
});

test('sans empreinte — entrée posée avant que le serveur réponde — on renvoie comme avant', async () => {
  boite.set(CLE, JSON.stringify({ comptes: { [MOI]: { loggia_roomlayout: { v: AGENCEMENT, n: 2 } } } }));
  const maison = fauxComposant({ loggia_roomlayout: { Salon: { larges: [] } } });
  const r = await renvoyerEnAttente(maison.hass, MOI, maison.lire());
  assert.deepEqual(r.cles, ['loggia_roomlayout'], 'rien ne dit que le serveur a bougé depuis : on ne jette pas');
  assert.deepEqual(maison.config.loggia_roomlayout, AGENCEMENT);

  poserEnAttente({ loggia_seclayout: { a: 1 } }, MOI, null);
  const autre = fauxComposant({ loggia_seclayout: { a: 2 } });
  const r2 = await renvoyerEnAttente(autre.hass, MOI, autre.lire());
  assert.deepEqual(r2.cles, ['loggia_seclayout'], 'composant pas encore lu : pas d’empreinte, pas d’abandon');
});

test('l’empreinte ignore l’ordre des clés, pas celui des listes ; absent vaut nul', () => {
  assert.equal(empreinte({ a: 1, b: [1, { c: 2, d: 3 }] }), empreinte({ b: [1, { d: 3, c: 2 }], a: 1 }));
  assert.notEqual(empreinte(['a', 'b']), empreinte(['b', 'a']), 'l’ordre d’une liste, c’est l’agencement');
  assert.notEqual(empreinte({ a: 1 }), empreinte({ a: 2 }));
  assert.notEqual(empreinte({ a: 1 }), empreinte({ a: '1' }));
  assert.equal(empreinte(undefined), empreinte(null), 'pour le composant, null efface');
  assert.equal(empreinte({ a: 1, b: undefined }), empreinte({ a: 1 }), 'comme JSON, une clé indéfinie ne voyage pas');
});
