// ─────────────────────────────────────────────────────────────────────────────
// Exporter, importer, remettre à zéro : la maison ne doit jamais se vider
// (audit du 03/10).
//
// Ces trois fonctions n'étaient protégées que par des épingles de texte — une
// reformulation qui avalait un refus passait toute la suite. Ici on les
// EXÉCUTE, contre un faux composant qui fait ce que fait `store.py` : il
// construit la nouvelle configuration, la vérifie, puis l'écrit d'un bloc —
// ou refuse tout.
//
// Trois défauts tenaient ensemble :
//  1. l'import purgeait la maison par un premier envoi, puis réécrivait par un
//     second ; refusé ou perdu, ce second laissait une maison vide ;
//  2. l'export embarquait ce que l'appareil sait de lui-même — la photo de
//     fond surtout, qui dépasse souvent les 256 Kio qu'accepte le serveur ;
//  3. l'import prenait n'importe quel JSON pour une configuration.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  exportConfigComplete, lireConfigImport, importConfigComplete, resetLoggiaComplet,
} from '../src/state.js';
import { CLES_APPAREIL } from '../src/config.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_VALEUR = 256 * 1024;   // store.py, MAX_VALUE_BYTES

/** Un stockage de navigateur en mémoire. */
function stockage(depart = {}) {
  const m = new Map(Object.entries(depart));
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

/**
 * Un faux composant Loggia, branché comme le vrai : `document` porte un
 * élément `home-assistant` dont `hass.callWS` répond.
 *
 * `config/set` est ATOMIQUE, comme `_set_locked` : tailles d'abord
 * (websocket_api.py, `_payload_too_big`), puis fusion en mémoire, puis une
 * seule écriture. `panne(msg, n)` peut faire échouer le n-ième envoi.
 */
function installer({ serveur = null, local = {}, panne = null } = {}) {
  const ls = stockage(local);
  const appels = [];
  const etat = { config: serveur ? { ...serveur } : {} };
  let envois = 0;
  const hass = {
    async callWS(msg) {
      appels.push(msg);
      if (msg.type === 'loggia/config/get') {
        return { config: { ...etat.config, loggia_admin_pin_defini: true } };
      }
      if (msg.type === 'loggia/config/set') {
        envois += 1;
        if (panne) { const e = panne(msg, envois); if (e) throw e; }
        for (const [k, v] of Object.entries(msg.config)) {
          const poids = Buffer.byteLength(JSON.stringify(v), 'utf8');
          if (poids > MAX_VALEUR) throw { code: 'payload_too_large', message: `valeur trop volumineuse (${poids} octets) : ${k}` };
        }
        const neuf = { ...etat.config };
        for (const [k, v] of Object.entries(msg.config)) { if (v == null) delete neuf[k]; else neuf[k] = v; }
        etat.config = neuf;
        return { config: neuf };
      }
      if (msg.type === 'loggia/config/delete') {
        if (panne) { const e = panne(msg, 0); if (e) throw e; }
        return { config: {} };
      }
      throw new Error('commande inattendue ' + msg.type);
    },
  };
  const doc = { querySelector: (s) => (s === 'home-assistant' && serveur ? { hass } : null) };
  globalThis.localStorage = ls;
  globalThis.document = doc;
  globalThis.window = { localStorage: ls, document: doc };
  return { ls, appels, etat, hass, envois: () => envois };
}

/** Une maison réaliste : celle qu'on ne veut pas perdre. */
const MAISON = {
  loggia_rooms: [{ name: 'Salon' }, { name: 'Cuisine' }, { name: 'Bureau' }],
  loggia_users: [{ name: 'Luna', role: 'Admin' }, { name: 'Invité', role: 'Famille' }],
  loggia_cameras: ['camera.entree'],
  loggia_accueil: { ordinateur: ['meteo', 'pieces'] },
  'loggia-theme': 'nuit',
  'loggia-langue': 'fr',
};
const PHOTO_LOURDE = 'data:image/jpeg;base64,' + 'A'.repeat(331321);   // la taille d'un fond Windows mesuré à l'audit

const fichier = (config) => JSON.stringify({ format: 'loggia-config', version: 1, exporte_le: '2026-09-12T08:00:00.000Z', source: 'serveur', config });

// ── L'import : tout ou rien ──────────────────────────────────────────────────

// Ce que l'appareil a de précieux et qu'un import refusé ne doit pas perdre :
// des réglages jamais arrivés au serveur, et son thème.
const APPAREIL_INTACT = { loggia_enattente: '{"loggia_accueil":{"v":{},"n":1}}', 'loggia-theme': 'nuit' };
const intact = (ctx) => {
  assert.equal(ctx.ls.getItem('loggia_enattente'), APPAREIL_INTACT.loggia_enattente, 'le carnet des réglages en attente a été vidé par un import refusé');
  assert.equal(ctx.ls.getItem('loggia-theme'), 'nuit');
};

test('un import refusé par Home Assistant laisse la maison intacte', async () => {
  const ctx = installer({ serveur: MAISON, local: APPAREIL_INTACT });
  const trop = { loggia_rooms: [{ name: 'Grenier' }], loggia_customviews: 'x'.repeat(MAX_VALEUR + 10) };
  await assert.rejects(importConfigComplete(fichier(trop)), (e) => e.code === 'payload_too_large');
  assert.deepEqual(ctx.etat.config, MAISON, 'la maison a été touchée par un import refusé');
  assert.equal(ctx.envois(), 1, 'la purge et le contenu doivent partir ENSEMBLE');
  intact(ctx);
});

test('une connexion perdue pendant l’import ne vide pas la maison', async () => {
  // La coupure tombe sur l'envoi qui PORTE le contenu : en deux envois, la
  // purge était déjà passée.
  const porteContenu = (m) => Object.values(m.config).some((v) => v != null);
  const ctx = installer({ serveur: MAISON, local: APPAREIL_INTACT, panne: (m) => (porteContenu(m) ? { error: { code: 3, message: 'Connection lost' } } : null) });
  await assert.rejects(importConfigComplete(fichier({ loggia_rooms: [{ name: 'Grenier' }] })));
  assert.deepEqual(ctx.etat.config, MAISON);
  intact(ctx);
});

test('un minuteur qui tourne n’est ni exporté, ni purgé, ni réécrit par un import', async () => {
  // Réimporté une semaine plus tard, un minuteur échu depuis longtemps
  // éteignait une lampe au redémarrage suivant ; purgé, un minuteur en cours
  // se perdait. C'est un état du serveur, pas un réglage.
  const enCours = { 'light.salon': { fin: 1790000000, par: 'u1' } };
  const ctx = installer({ serveur: { ...MAISON, loggia_minuteurs: enCours, loggia_sirene_test: { 'siren.entree': 1 } } });
  const brut = JSON.parse(await exportConfigComplete());
  assert.ok(!('loggia_minuteurs' in brut.config) && !('loggia_sirene_test' in brut.config), 'l’état d’exécution est parti dans l’export');
  await importConfigComplete(fichier({ ...MAISON, loggia_minuteurs: { 'light.cuisine': { fin: 1, par: 'u2' } } }));
  const lot = ctx.appels.find((m) => m.type === 'loggia/config/set').config;
  assert.ok(!('loggia_minuteurs' in lot) && !('loggia_sirene_test' in lot), 'l’import a touché l’état d’exécution');
  assert.deepEqual(ctx.etat.config.loggia_minuteurs, enCours);
});

test('avec le composant, l’import ne laisse pas une copie de la maison sur l’appareil', async () => {
  // Elle remonterait plus tard au serveur par `completerDepuisLocal`, dès
  // qu'une clé y manquerait, et déferait une remise à zéro faite ailleurs.
  const ctx = installer({ serveur: MAISON });
  await importConfigComplete(fichier(MAISON));
  assert.equal(ctx.ls.getItem('loggia_rooms'), null, 'une copie JSON des pièces est restée sur l’appareil');
  assert.equal(ctx.ls.getItem('loggia_users'), null);
  assert.equal(ctx.ls.getItem('loggia-theme'), 'nuit', 'le thème brut du premier affichage doit rester');
});

test('les marges d’écran d’un autre appareil ne s’installent pas', async () => {
  // Le téléphone exporte avec ses marges réglées à la main ; la tablette
  // importe et garde les siennes.
  installer({ serveur: MAISON, local: { 'loggia-navoffset': '34', 'loggia-topoffset': '47' } });
  const depuisLeTelephone = await exportConfigComplete();
  assert.ok(!/loggia-navoffset|loggia-topoffset/.test(depuisLeTelephone), 'les marges du téléphone sont parties dans l’export');
  const ctx = installer({ serveur: MAISON, local: { 'loggia-navoffset': '12' } });
  await importConfigComplete(fichier({ ...MAISON, 'loggia-navoffset': 34, 'loggia-topoffset': 47 }));
  assert.equal(ctx.ls.getItem('loggia-navoffset'), '12', 'la tablette a perdu sa propre marge');
  assert.equal(ctx.ls.getItem('loggia-topoffset'), null);
});

test('l’import est un miroir, en un seul envoi', async () => {
  const ctx = installer({ serveur: { ...MAISON, loggia_plants: ['plante.ficus'] } });
  await importConfigComplete(fichier({ loggia_rooms: [{ name: 'Grenier' }], 'loggia-theme': 'jour' }));
  assert.deepEqual(ctx.etat.config, { loggia_rooms: [{ name: 'Grenier' }], 'loggia-theme': 'jour' },
    'une clé absente du fichier a survécu, ou une clé du fichier manque');
  const sets = ctx.appels.filter((m) => m.type === 'loggia/config/set');
  assert.equal(sets.length, 1);
  assert.equal(sets[0].config.loggia_plants, null, 'la purge fait partie du même envoi');
});

test('sans lecture préalable, pas d’import : rien n’est écrit', async () => {
  const ctx = installer({ serveur: MAISON });
  const vrai = ctx.hass.callWS;
  ctx.hass.callWS = async (msg) => {
    if (msg.type === 'loggia/config/get') throw { code: 'timeout', message: 'pas de réponse' };
    return vrai(msg);
  };
  await assert.rejects(importConfigComplete(fichier({ 'loggia-theme': 'jour' })));
  assert.equal(ctx.envois(), 0);
  assert.deepEqual(ctx.etat.config, MAISON);
});

// ── Ce que l'appareil sait de lui-même ───────────────────────────────────────

test('l’export laisse sur l’appareil ce qui est à l’appareil', async () => {
  // TOUTES les clés de la liste, et le piège du tiret : `loggia-ha-fr` est un
  // cache de traductions, `loggia-ha` le thème Home Assistant choisi — lui
  // part dans l'export.
  const appareil = Object.fromEntries([...CLES_APPAREIL].map((k) => [k, k === 'loggia-fond-photo' ? PHOTO_LOURDE : '1']));
  installer({
    serveur: MAISON,
    local: {
      ...appareil,
      'loggia-ha-fr': '{"Salon":"Salon"}',
      loggia_enattente: '{"loggia_accueil":{"v":{},"n":1}}',
      // Une clé de configuration que le serveur n'a pas : elle part, c'est
      // tout l'intérêt du balayage par motif (24/09).
      'loggia-hiddenviews': '["energie"]',
      'loggia-ha': 'mon-theme',
      // Le thème brut du premier affichage, que le serveur connaît déjà.
      'loggia-theme': 'nuit',
    },
  });
  const brut = JSON.parse(await exportConfigComplete());
  assert.equal(brut.format, 'loggia-config');
  for (const k of [...CLES_APPAREIL, 'loggia-ha-fr', 'loggia_enattente', 'loggia_admin_pin_defini']) {
    assert.ok(!(k in brut.config), `${k} est parti dans l’export`);
  }
  assert.ok(CLES_APPAREIL.size >= 15, 'la liste des clés d’appareil a rétréci');
  assert.equal(brut.config['loggia-ha'], 'mon-theme', 'le thème Home Assistant choisi a disparu de l’export');
  assert.deepEqual(brut.config['loggia-hiddenviews'], ['energie'], 'une clé locale de configuration a été oubliée');
  assert.deepEqual(brut.config.loggia_rooms, MAISON.loggia_rooms);
  assert.ok(JSON.stringify(brut).length < MAX_VALEUR, 'l’export pèse encore le poids d’une photo');
});

test('une photo rangée par erreur dans la partie commune ne repart pas dans l’export', async () => {
  // C'est ce qu'un import d'avant le 03/10 a pu laisser sur le serveur.
  installer({ serveur: { ...MAISON, 'loggia-fond-photo': 'data:image/jpeg;base64,AAAA', loggia_journal: ['n1'] } });
  const brut = JSON.parse(await exportConfigComplete());
  assert.ok(!('loggia-fond-photo' in brut.config));
  assert.ok(!('loggia_journal' in brut.config));
});

test('un ancien fichier pollué par la photo se restaure quand même — et nettoie le serveur', async () => {
  const ctx = installer({
    serveur: { ...MAISON, 'loggia-fond-photo': 'data:ancienne' },
    local: { 'loggia-fond-photo': 'data:la-photo-de-cet-appareil', loggia_journal: '["n9"]' },
  });
  await importConfigComplete(fichier({ ...MAISON, 'loggia-fond-photo': PHOTO_LOURDE, loggia_journal: ['n1'], loggia_admin_pin_defini: true }));
  assert.deepEqual(ctx.etat.config, MAISON, 'la photo ou le journal sont entrés dans la maison');
  assert.equal(ctx.ls.getItem('loggia-fond-photo'), 'data:la-photo-de-cet-appareil', 'l’import a remplacé la photo de cet appareil');
  assert.equal(ctx.ls.getItem('loggia_journal'), '["n9"]', 'l’import a effacé le journal lu de cet appareil');
});

test('la sauvegarde faite avant une remise à zéro se restaure, photo de fond ou pas', async () => {
  // Le scénario exact de l'audit : photo de fond, sauvegarde automatique,
  // remise à zéro, puis restauration de cette sauvegarde.
  const ctx = installer({ serveur: MAISON, local: { 'loggia-fond-photo': PHOTO_LOURDE } });
  const sauvegarde = await exportConfigComplete();
  await resetLoggiaComplet();
  assert.deepEqual(ctx.etat.config, {}, 'la remise à zéro n’a pas vidé la maison');
  await importConfigComplete(sauvegarde);
  assert.deepEqual(ctx.etat.config, MAISON);
});

test('l’import efface le carnet des réglages en attente', async () => {
  // Sinon il rejouerait, au démarrage suivant, des réglages d'AVANT l'import.
  const ctx = installer({ serveur: MAISON, local: { loggia_enattente: '{"loggia_accueil":{"v":{},"n":2}}', 'loggia-vieux': '1' } });
  await importConfigComplete(fichier(MAISON));
  assert.equal(ctx.ls.getItem('loggia_enattente'), null);
  assert.equal(ctx.ls.getItem('loggia-vieux'), null, 'un reste local a survécu au miroir');
});

test('sans composant, l’import garde aussi les pièces et les profils', async () => {
  // Le stockage local EST alors la configuration : n'y écrire que les
  // chaînes perdait tout ce qui est un tableau ou un objet.
  const ctx = installer({ serveur: null });
  await importConfigComplete(fichier(MAISON));
  assert.deepEqual(JSON.parse(ctx.ls.getItem('loggia_rooms')), MAISON.loggia_rooms);
  assert.deepEqual(JSON.parse(ctx.ls.getItem('loggia_users')), MAISON.loggia_users);
  assert.equal(ctx.ls.getItem('loggia-theme'), 'nuit', 'le thème se lit brut au premier affichage');
});

// ── Lire avant d'écrire ──────────────────────────────────────────────────────

test('un fichier qui n’est pas une configuration Loggia est refusé avant tout envoi', async () => {
  const ctx = installer({ serveur: MAISON });
  const paquet = JSON.stringify({ name: 'loggia', private: true, version: '3.84.0', scripts: { test: 'node --test' }, dependencies: { react: '^18' } });
  await assert.rejects(importConfigComplete(paquet), (e) => e.code === 'pas_loggia');
  assert.equal(ctx.appels.length, 0, 'un envoi est parti pour un fichier étranger');
  assert.deepEqual(ctx.etat.config, MAISON);
});

test('les refus de lecture portent un code que l’écran traduit', () => {
  assert.throws(() => lireConfigImport('{pas du json'), (e) => e.code === 'illisible');
  assert.throws(() => lireConfigImport('[1,2]'), (e) => e.code === 'illisible');
  assert.throws(() => lireConfigImport('{}'), (e) => e.code === 'pas_loggia');
  assert.throws(() => lireConfigImport(fichier({})), (e) => e.code === 'vide');
  // Des valeurs toutes nulles : envoyé, ce lot effacerait toute la maison.
  assert.throws(() => lireConfigImport(fichier({ loggia_rooms: null, loggia_users: null })), (e) => e.code === 'vide');
  // Un export qui ne contiendrait que ce qui reste sur l'appareil n'a rien à restaurer.
  assert.throws(() => lireConfigImport(fichier({ 'loggia-fond-photo': 'data:x', loggia_admin_pin: '1234' })), (e) => e.code === 'vide');
});

test('l’ancien format plat reste accepté, ses clés étrangères ignorées', () => {
  const lu = lireConfigImport(JSON.stringify({ loggia_rooms: [{ name: 'Salon' }], 'loggia-theme': 'nuit', name: 'autre-chose' }));
  assert.deepEqual(Object.keys(lu.config).sort(), ['loggia-theme', 'loggia_rooms']);
  assert.deepEqual(lu.ignorees, ['name']);
  assert.equal(lu.resume.exporteLe, null, 'un fichier plat n’a pas de date');
});

test('le résumé dit de quand date le fichier et ce qu’il contient', () => {
  const lu = lireConfigImport(fichier(MAISON));
  assert.equal(lu.resume.exporteLe, '2026-09-12T08:00:00.000Z');
  assert.equal(lu.resume.pieces, 3);
  assert.equal(lu.resume.profils, 2);
  assert.equal(lu.resume.cles, Object.keys(MAISON).length);
});

test('le code administrateur ne passe jamais par un fichier', () => {
  const lu = lireConfigImport(fichier({ ...MAISON, loggia_admin_pin: '1234', loggia_admin_pin_hache: { sel: 'x' } }));
  assert.ok(!('loggia_admin_pin' in lu.config));
  assert.ok(!('loggia_admin_pin_hache' in lu.config));
});

// ── L'écran : confirmer, sauvegarder, puis seulement remplacer ──────────────

test('l’écran confirme, sauvegarde d’abord, et renonce sans sauvegarde', () => {
  // Le composant n'est pas exporté : on vérifie l'ORDRE des gestes, comme
  // pour la remise à zéro (tests/robustesse_front.test.mjs).
  const par = readFileSync(join(RACINE, 'src', 'views', 'parametres.jsx'), 'utf8');
  const corps = par.slice(par.indexOf('function ImportConfigBtn()'), par.indexOf('function AdminPinEditor('));
  assert.ok(corps.includes('setLu(lireConfigImport(await f.text()))'), 'choisir un fichier doit seulement le LIRE');
  const importer = corps.slice(corps.indexOf('const importer = async () => {'));
  // La garde ENTIÈRE : un fichier qui n'a pas pu être proposé arrête tout.
  const sauvegarde = importer.indexOf("if (!telechargerConfig(j, 'loggia-avant-import')) throw new Error(PAS_DE_FICHIER);");
  assert.ok(par.includes("if (!telechargerConfig(j, 'loggia-avant-remise-a-zero')) throw new Error(PAS_DE_FICHIER);"), 'la remise à zéro ignore un téléchargement raté');
  assert.ok(par.includes("if (!telechargerConfig(j, 'loggia-config')) throw new Error(PAS_DE_FICHIER);"), 'l’export ignore un téléchargement raté');
  const renonce = importer.indexOf("tr('Sauvegarde impossible : l’import est annulé.");
  const remplace = importer.indexOf('await importConfigComplete(lu)');
  assert.ok(sauvegarde > 0 && renonce > sauvegarde && remplace > renonce, 'la sauvegarde doit précéder l’import, et son échec l’arrêter');
  assert.ok(importer.slice(renonce, remplace).includes('return;'), 'sans sauvegarde, l’import continuait');
  // Un second appui confirme : le premier ne fait que lire et résumer.
  assert.ok(corps.includes('onClick={() => { if (lu) importer(); else if (fichier.current) fichier.current.click(); }}'));
});

// ── La remise à zéro ─────────────────────────────────────────────────────────

test('un refus de la remise à zéro remonte, et l’appareil n’est pas vidé', async () => {
  // Le défaut clos le 18/09 : avaler ce refus rechargeait comme si tout
  // était effacé, et les réglages du compte revenaient à la synchronisation.
  const ctx = installer({
    serveur: MAISON,
    local: { 'loggia-theme': 'nuit' },
    panne: (m) => (m.type === 'loggia/config/delete' ? { code: 'unknown_error', message: 'refus' } : null),
  });
  await assert.rejects(resetLoggiaComplet(), (e) => e.code === 'unknown_error');
  assert.equal(ctx.ls.getItem('loggia-theme'), 'nuit');
});

test('un serveur muet n’est pas une maison vide : la remise à zéro s’arrête', async () => {
  // Seule la LECTURE échoue — le reste répondrait. Avaler cet échec viderait
  // l'appareil et rechargerait sans avoir purgé la maison, qui redescendrait
  // telle quelle (audit du 18/09).
  const ctx = installer({ serveur: MAISON, local: { 'loggia-theme': 'nuit' } });
  const vrai = ctx.hass.callWS;
  ctx.hass.callWS = async (msg) => {
    if (msg.type === 'loggia/config/get') throw { code: 'timeout', message: 'pas de réponse' };
    return vrai(msg);
  };
  await assert.rejects(resetLoggiaComplet());
  assert.equal(ctx.envois(), 0, 'une écriture est partie sans lecture préalable');
  assert.ok(!ctx.appels.some((m) => m.type === 'loggia/config/delete'), 'les réglages du compte ont été effacés sans lecture');
  assert.equal(ctx.ls.getItem('loggia-theme'), 'nuit', 'l’appareil a été vidé');
  assert.deepEqual(ctx.etat.config, MAISON);
});
