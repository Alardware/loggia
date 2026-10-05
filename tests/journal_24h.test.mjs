// ─────────────────────────────────────────────────────────────────────────────
// Le journal « 24 h, en direct » dit vraiment vingt-quatre heures (audit du
// 03/10).
//
// L'abonnement au journal de Home Assistant remonte 24 h en arrière de son
// OUVERTURE, puis ajoute ce qui arrive sans jamais rien retirer. Sur une
// tablette allumée de lundi à jeudi, la carte « Les dernières 24 heures, en
// direct » montrait encore l'événement de lundi — daté « 16:00 », comme s'il
// était du jour. Même défaut dans la carte Journal d'une entité (CvJournal).
//
// Après correction : ce qui sort de la fenêtre sort de l'écran à la minute
// près, et une heure qui n'est pas d'aujourd'hui dit son jour.
//
// Fuseau de Paris (vérifié ci-dessous) et langue française fixée AVANT
// l'import : la machine de la CI ne doit pas changer le résultat.
// ─────────────────────────────────────────────────────────────────────────────

process.env.TZ = 'Europe/Paris';
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composant, rendre } from './rendu.mjs';

const { dansLaFenetre, heureJournal, FENETRE_EVENEMENT } = await import('../src/evenement.js');
const { tr } = await import('../src/i18n.js');
const grouperJournal = await composant('historique.jsx', 'grouperJournal');
const RoomActivityCard = await composant('historique.jsx', 'RoomActivityCard');

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const NL = String.fromCharCode(10);

const hm = (d) => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const sec = (d) => d.getTime() / 1000; // le journal parle en secondes
const ev = (id, state, d) => ({ entity_id: id, state, when: sec(d) });

// Jeudi 1er octobre 2026, 10 h : la tablette est allumée depuis lundi.
const JEUDI = new Date(2026, 9, 1, 10, 0);
const JEUDI_9H12 = new Date(2026, 9, 1, 9, 12);
const MERCREDI_16H = new Date(2026, 8, 30, 16, 0);
const LUNDI_16H = new Date(2026, 8, 28, 16, 0);

test('le fuseau de Paris est bien en place (sinon les tests suivants ne prouvent rien)', () => {
  assert.equal(new Date(2026, 9, 1, 12).getTimezoneOffset(), -120, 'heure d’été attendue le 01/10/2026');
  assert.equal(new Date(2027, 2, 29).getTime() - new Date(2027, 2, 28).getTime(), 23 * 3600e3, 'le 28/03/2027 doit compter 23 h');
});

test('une tablette allumée de lundi à jeudi : lundi sort de la carte « 24 h »', () => {
  // Ce que l'abonnement a accumulé depuis lundi, le plus récent d'abord.
  const accumule = [
    ev('light.salon', 'on', JEUDI_9H12),
    ev('cover.salon', 'open', MERCREDI_16H),
    ev('lock.entree', 'unlocked', LUNDI_16H),
  ];
  const vus = dansLaFenetre(accumule, JEUDI.getTime());
  assert.deepEqual(vus.map(e => e.entity_id), ['light.salon', 'cover.salon'], 'l’événement de lundi est encore à l’écran jeudi');
  assert.equal(grouperJournal(vus).length, 2, 'le regroupement ne compte que ce qui reste dans la fenêtre');
});

test('la fenêtre : 24 h pile restent, une milliseconde de plus sort — en secondes comme en millisecondes', () => {
  const t = JEUDI.getTime();
  const pile = { entity_id: 'light.a', state: 'on', when: (t - FENETRE_EVENEMENT) / 1000 };
  const audela = { entity_id: 'light.b', state: 'on', when: t - FENETRE_EVENEMENT - 1 };
  assert.deepEqual(dansLaFenetre([pile, audela], t), [pile]);
});

test('ce qui ne se lit pas ne passe pas pour récent ; une horloge en retard ne cache rien', () => {
  const t = JEUDI.getTime();
  const futur = { entity_id: 'light.a', state: 'on', when: (t + 5 * 60000) / 1000 };
  assert.deepEqual(dansLaFenetre([futur], t), [futur], 'un événement « dans le futur » est réel : c’est la tablette qui retarde');
  assert.deepEqual(dansLaFenetre([{ entity_id: 'light.a', state: 'on', when: 'hier' }, { entity_id: 'light.b', state: 'on' }, null], t), [], 'sans instant lisible : rien');
  assert.deepEqual(dansLaFenetre(null, t), []);
  assert.deepEqual(dansLaFenetre(undefined, t), []);
});

test('rien ne tombe : le même tableau revient (la mémoïsation de l’appelant tient)', () => {
  const frais = [ev('light.salon', 'on', JEUDI_9H12)];
  assert.equal(dansLaFenetre(frais, JEUDI.getTime()), frais);
});

test('l’heure d’une ligne dit son jour quand ce n’est pas aujourd’hui', () => {
  const t = JEUDI.getTime();
  assert.equal(heureJournal(sec(JEUDI_9H12), t, 'fr-FR'), hm(JEUDI_9H12), 'aujourd’hui : l’heure seule');
  assert.equal(heureJournal(JEUDI_9H12.getTime(), t, 'fr-FR'), hm(JEUDI_9H12), 'en millisecondes aussi');
  assert.equal(heureJournal(sec(MERCREDI_16H), t, 'fr-FR'), tr('hier') + ' ' + hm(MERCREDI_16H));
  const lundi = heureJournal(sec(LUNDI_16H), t, 'fr-FR');
  assert.notEqual(lundi, hm(LUNDI_16H), 'lundi se lisait « 16:00 » le jeudi');
  assert.ok(lundi.endsWith(hm(LUNDI_16H)) && lundi.includes('28'), 'le jour, puis l’heure : ' + lundi);
});

test('« hier » reste la veille entre 0 h et 1 h, le lendemain du passage à l’heure d’été', () => {
  const veille = new Date(2027, 2, 28, 10, 0);
  assert.equal(heureJournal(sec(veille), new Date(2027, 2, 29, 0, 30).getTime(), 'fr-FR'), tr('hier') + ' ' + hm(veille));
});

test('sans instant lisible : « — », jamais « Invalid Date » (ADR 0030)', () => {
  for (const q of [null, undefined, '', 'pas une date', NaN]) assert.equal(heureJournal(q, JEUDI.getTime(), 'fr-FR'), '—', String(q));
});

test('sans journal, pas de carte — et le crochet tient son ordre au rendu', () => {
  assert.equal(rendre(RoomActivityCard, { hass: null, ids: null }), '');
});

test('les deux cartes passent par la fenêtre et par heureJournal', () => {
  const h = lire('src', 'historique.jsx');
  const debut = h.indexOf('export function useRoomLogbook(');
  assert.ok(debut >= 0, 'le crochet du journal a disparu');
  const crochet = h.slice(debut, h.indexOf(NL + '}', debut));
  assert.ok(crochet.includes('const maintenant = useMinute();'), 'le journal ne vieillit plus : aucune horloge ne le relit');
  assert.ok(crochet.includes('return useMemo(() => dansLaFenetre(events, maintenant), [events, maintenant]);'), 'le journal rend tout ce qu’il a accumulé depuis l’ouverture');
  assert.ok(crochet.includes('const vus = new Set(prev.map(cle));'), 'le dédoublonnage de la reconnexion a sauté');
  const carte = h.slice(h.indexOf('export function RoomActivityCard('), h.indexOf('export function useSysHist('));
  assert.ok(carte.includes('{heureJournal(e.when)}'), 'la carte « 24 h » date de nouveau à l’heure seule');
  assert.ok(!h.includes('toLocaleTimeString'), 'historique.jsx formate de nouveau une heure à la main');
  const app = lire('src', 'App.jsx');
  const d = app.indexOf('function CvJournal(');
  assert.ok(d >= 0, 'la carte Journal a disparu');
  const cv = app.slice(d, app.indexOf(NL + '}', d));
  assert.ok(cv.includes('{heureJournal(e.when)}') && !cv.includes('toLocaleTimeString'), 'la carte Journal d’une entité date de nouveau à l’heure seule');
});
