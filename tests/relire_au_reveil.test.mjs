// ─────────────────────────────────────────────────────────────────────────────
// Un écran qui se réveille relit la configuration (08/10).
//
// « Souvent je dois remettre les widgets, les réactiver ou désactiver
// certaines, et l'ordre aussi qui change ; les cartes pièces aussi, si elle est
// compacte grande elle repasse en compacte. »
//
// La resynchronisation de l'ADR 0067 ne tenait qu'à UN fil : le message
// `loggia/config/suivre`. Un onglet endormi ne le reçoit pas, et une connexion
// coupée puis revenue ne rejoue pas ce qu'on a manqué — Home Assistant se
// rabonne, il ne raconte pas le passé.
//
// L'écran gardait donc un cache périmé. Et comme un réglage s'écrit par OBJET
// ENTIER — la grille de l'Accueil, la disposition d'une vue —, son premier
// rangement renvoyait cet objet dans son état d'avant : ce qu'on avait rangé
// ailleurs disparaissait. Une tablette murale ouverte en permanence le faisait
// à chaque fois qu'on la touchait.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { doitRelire } from '../src/config.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');

test('trois réveils déclenchent la relecture', () => {
  /* L'onglet redevient visible, la fenêtre reprend le focus, la connexion
   * repart. Les trois peuvent tomber ensemble : `relire` est groupée. */
  assert.ok(APP.includes("document.addEventListener('visibilitychange', auReveil);"), 'un onglet endormi ne rattrape plus ce qu’il a manqué');
  assert.ok(APP.includes("window.addEventListener('focus', auReveil);"), 'revenir sur la fenêtre ne relit plus');
  assert.ok(APP.includes("conn.addEventListener('ready', relire);"), 'une reconnexion ne relit plus — et HA ne rejoue pas le passé');
});

test('chaque écouteur est retiré', () => {
  ['visibilitychange', 'focus'].forEach(e => {
    assert.ok(APP.includes("removeEventListener('" + e + "', auReveil)"), e + ' reste accroché');
  });
  assert.ok(APP.includes("conn.removeEventListener('ready', relire)"), 'l’écouteur de reconnexion reste accroché');
});

test('un onglet CACHÉ ne relit pas', () => {
  /* `visibilitychange` part aussi quand on QUITTE l'onglet : relire à ce
   * moment-là ferait une requête pour un écran que personne ne regarde. */
  assert.ok(APP.includes("if (typeof document === 'undefined' || document.visibilityState === 'visible') relire();"),
    'la relecture doit attendre que l’écran soit regardé');
});

test('l’effet rejoue à l’arrivée du serveur', () => {
  /* Au premier rendu la connexion n'existe pas encore : l'écouteur de
   * reconnexion se serait posé dans le vide, et l'écran n'aurait jamais
   * rattrapé une coupure. */
  const i = APP.indexOf("const relire = () => { if (relireRef.current) relireRef.current(); };");
  assert.ok(i > 0, 'l’effet de réveil a disparu');
  const fin = APP.indexOf('}, [serverOk]);', i);
  assert.ok(fin > i && fin - i < 1800, 'l’effet de réveil ne dépend plus de l’arrivée du serveur');
});

test('la relecture passe par le même chemin que l’ADR 0067', () => {
  /* `relireRef` est groupée (300 ms) et attend la fin de l'édition : un réveil
   * en plein rangement ne doit pas écraser ce qu'on est en train de faire. */
  assert.ok(APP.includes('const relire = () => { if (relireRef.current) relireRef.current(); };'),
    'le réveil ne doit pas court-circuiter le groupement ni l’attente de l’édition');
  assert.ok(APP.includes("if (editRef.current) { enAttenteRef.current = true; return; }"),
    'une relecture pendant l’édition doit toujours attendre sa sortie');
});

/* ── Le filtre qui existait déjà ─────────────────────────────────────────── */

test('une clé COMMUNE fait relire tout le monde', () => {
  assert.equal(doitRelire({ communes: ['loggia_accgrille'], perso: [] }, { userId: 'moi' }), true);
  assert.equal(doitRelire({ communes: ['x'], perso: [] }, { userId: null }), true, 'même sans savoir qui on est');
});

test('une clé PERSO ne fait relire que son auteur', () => {
  assert.equal(doitRelire({ communes: [], perso: ['loggia_look'], user_id: 'moi' }, { userId: 'moi' }), true);
  assert.equal(doitRelire({ communes: [], perso: ['loggia_look'], user_id: 'toi' }, { userId: 'moi' }), false);
});

test('un message vide ou abîmé ne fait rien', () => {
  assert.equal(doitRelire(null, { userId: 'moi' }), false);
  assert.equal(doitRelire({}, { userId: 'moi' }), false);
  assert.equal(doitRelire({ communes: [], perso: [] }, { userId: 'moi' }), false);
});
