// ─────────────────────────────────────────────────────────────────────────────
// Une panne n'est pas un agenda vide (audit du 03/10).
//
// Un redémarrage de Home Assistant, une coupure du Wi-Fi au mauvais moment :
// chaque GET des calendriers échouait, `useAgenda` posait une liste vide et la
// tenait un quart d'heure — « Rien de prévu ce jour-là. », sept zéros dans la
// bande, le bandeau de la collecte parti avec. L'historique 24 h faisait de
// même pendant cinq minutes : « Historique indisponible » à la place d'une
// courbe qu'on venait de lire.
//
// Un calendrier qui RÉPOND vide est vide ; un calendrier qui ne répond pas n'a
// rien dit. La lecture vit dans agenda.js et se teste ici pour de vrai, avec
// un faux `callApi` ; le branchement des deux hooks se relit dans App.jsx.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lireCalendriers, garderDansFenetre } from '../src/agenda.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');

/** Le corps d'une fonction nommée, jusqu'à la suivante. */
function corps(entete) {
  const i = src.indexOf(entete);
  assert.notEqual(i, -1, `${entete} introuvable`);
  const fin = src.indexOf('\nfunction ', i + entete.length);
  assert.notEqual(fin, -1, `fin de ${entete} introuvable`);
  return src.slice(i, fin);
}

// Dates locales ; les `dateTime` passent par toISOString — le même instant,
// quel que soit le fuseau de la machine qui teste.
const iso = (y, m, d, h, mi = 0) => new Date(y, m, d, h, mi).toISOString();
const DEBUT = new Date(2026, 9, 3);
const FIN = new Date(2026, 9, 10);
const MAISON = 'calendar.maison';
const TRAVAIL = 'calendar.travail';
const cafe = { summary: 'Café', start: { dateTime: iso(2026, 9, 5, 10) }, end: { dateTime: iso(2026, 9, 5, 11) } };
const dentiste = { summary: 'Dentiste', start: { dateTime: iso(2026, 9, 4, 9) }, end: { dateTime: iso(2026, 9, 4, 10) } };

/** Un faux `hass.callApi` : par calendrier, sa réponse — ou une erreur, levée
 * comme le ferait un fetch sans réseau. Il note chaque chemin demandé. */
function fausseApi(reponses) {
  const vus = [];
  const api = async (methode, chemin) => {
    vus.push(methode + ' ' + chemin);
    const r = reponses[chemin.slice('calendars/'.length, chemin.indexOf('?'))];
    if (r instanceof Error) throw r;
    return r;
  };
  return { api, vus };
}
const panne = () => new Error('Failed to fetch');

test('aucun calendrier ne répond : `null`, et non une liste vide', async () => {
  const { api, vus } = fausseApi({ [MAISON]: panne(), [TRAVAIL]: panne() });
  assert.equal(await lireCalendriers(api, [MAISON, TRAVAIL], DEBUT, FIN), null,
    'une panne doit se distinguer d’un agenda vide — sinon la carte dit « Rien de prévu »');
  assert.equal(vus.length, 2, 'chaque calendrier a été tenté');
});

test('un calendrier qui répond vide reste vide', async () => {
  const { api } = fausseApi({ [MAISON]: [], [TRAVAIL]: panne() });
  assert.deepEqual(await lireCalendriers(api, [MAISON, TRAVAIL], DEBUT, FIN), [],
    'un calendrier a répondu : son « rien » est une vraie réponse');
});

test('un calendrier qui refuse ne prive pas les autres, et tout se range par début', async () => {
  const { api, vus } = fausseApi({ [TRAVAIL]: panne(), [MAISON]: [cafe, { summary: 'sans date' }, null, dentiste] });
  const l = await lireCalendriers(api, [TRAVAIL, MAISON], DEBUT, FIN);
  assert.deepEqual(l.map(e => e.summary), ['Dentiste', 'Café'], 'les illisibles écartés, le reste dans l’ordre');
  assert.ok(l.every(e => e._cal === MAISON), 'chaque événement porte son calendrier sous `_cal`');
  assert.equal(vus[1], 'GET calendars/' + MAISON + '?start=' + encodeURIComponent(DEBUT.toISOString())
    + '&end=' + encodeURIComponent(FIN.toISOString()), 'la même requête qu’avant le déménagement');
});

test('pendant la panne, on garde ce qu’on montrait — ce qui tient encore dans la fenêtre', () => {
  const montres = [
    { ...dentiste, _cal: MAISON },
    { ...cafe, _cal: TRAVAIL },
    { summary: 'Mois dernier', start: { date: '2026-09-20' }, end: { date: '2026-09-21' }, _cal: MAISON },
    { summary: 'Hier soir', start: { dateTime: iso(2026, 9, 2, 22) }, end: { dateTime: iso(2026, 9, 3, 1) }, _cal: MAISON },
  ];
  assert.deepEqual(garderDansFenetre(montres, [MAISON, TRAVAIL], DEBUT, FIN).map(e => e.summary),
    ['Dentiste', 'Café', 'Hier soir'], 'ce qui chevauche la fenêtre reste, ce qui en est sorti s’en va');
  assert.deepEqual(garderDansFenetre(montres, [MAISON], DEBUT, FIN).map(e => e.summary),
    ['Dentiste', 'Hier soir'], 'un agenda décoché pendant la panne ne reste pas à l’écran');
  assert.deepEqual(garderDansFenetre(null, [MAISON], DEBUT, FIN), []);
});

test('useAgenda : une panne garde la liste, et l’on relit dans trente secondes', () => {
  const c = corps('function useAgenda(');
  assert.ok(c.includes('const tous = await lireCalendriers(api, liste, debut, fin);'),
    'la lecture passe par agenda.js, qui distingue la panne du vide');
  assert.ok(c.includes('if (tous === null) {'), 'la panne a son propre chemin');
  assert.ok(c.includes('garderDansFenetre(avant, liste, debut, fin)'), 'pendant la panne, on garde ce qu’on montrait');
  assert.equal(c.split('setEvents([])').length - 1, 1, 'seule l’absence de tout calendrier vide la liste');
  // Le réessai : un minuteur d'AFFICHAGE, borné, unique, annulé quand un sondage part et au démontage.
  assert.ok(c.includes('if (essais++ < 10) reessai = setTimeout(lire, 30 * 1000);'), 'trente secondes, dix fois au plus');
  assert.match(c, /clearTimeout\(reessai\);\s*if \(essais\+\+ < 10\)/, 'deux lectures croisées ne laissent qu’un minuteur');
  // Pas la déclaration `let reessai = null, essais = 0;` : la remise à zéro qui suit une lecture réussie.
  assert.match(c, /\n\s*essais = 0;\s*\n\s*setEvents\(plage \? tous/, 'une lecture réussie rend ses dix essais');
  assert.match(c, /const lire = async \(\) => \{\s*clearTimeout\(reessai\);/, 'un sondage qui part annule le réessai en attente');
  assert.ok(c.includes('return () => { mort = true; clearInterval(iv); clearTimeout(reessai); };'), 'le démontage annule le réessai');
  assert.ok(c.includes('setInterval(lire, 15 * 60000)'), 'le sondage du quart d’heure demeure');
});

test('useHistorique24 : un GET raté garde la courbe montrée, une demi-heure au plus', () => {
  const c = corps('function useHistorique24(');
  assert.ok(c.includes('montree = lue;'), 'chaque série lue devient la série montrée');
  assert.ok(c.includes("if (!mort) setPoints(montree && Date.now() - montree.t < 30 * 60000 ? montree.serie : 'erreur');"),
    'un échec garde une courbe récente ; sans elle, il se dit « indisponible » (robustesse_front)');
  assert.ok(!c.includes("setPoints('erreur')"), 'un échec n’efface plus une courbe tracée');
  // Seulement ce qui a été MONTRÉ : une série du cache vieille d'une heure passerait pour les dernières 24 h.
  assert.ok(c.includes('let montree = recent ? frais : null;'));
});
