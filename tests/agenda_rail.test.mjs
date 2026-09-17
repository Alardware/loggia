// Une carte agenda a la place de deux (16/09, ADR 0032, etape 5 de la
// refonte) : la date, la bande des sept prochains jours, ce qui vient.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  JOURS_AGENDA, cleJour, debutDe, finDe, plageSemaine, joursAgenda, toucheJour, comptesParJour, evenementsAVenir, evenementsDuJour,
} from '../src/agenda.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
const en = readFileSync(join(RACINE, 'src', 'langues', 'en.js'), 'utf8');
const NL = String.fromCharCode(10);
const bloc = (debut, fin) => { const d = src.indexOf(debut); assert.ok(d >= 0, debut + ' introuvable'); const f = src.indexOf(fin, d + 1); return src.slice(d, f < 0 ? undefined : f); };

// Le 16 septembre 2026 a 17 h, heure locale : les dates de test sont locales,
// les `dateTime` passent par toISOString — le meme instant, quel que soit le
// fuseau de la machine qui teste.
const AUJ = new Date(2026, 8, 16, 17, 0, 0);
const iso = (y, m, d, h, mi = 0) => new Date(y, m, d, h, mi).toISOString();
const jourDe = (y, m, d) => { const x = new Date(y, m, d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
const colis = { summary: 'Livraison colis', start: { dateTime: iso(2026, 8, 16, 16) }, end: { dateTime: iso(2026, 8, 16, 17, 30) } };
const passe = { summary: 'Dentiste', start: { dateTime: iso(2026, 8, 16, 9) }, end: { dateTime: iso(2026, 8, 16, 10) } };
const poubelles = { summary: 'Poubelles', start: { date: jourDe(2026, 8, 17) }, end: { date: jourDe(2026, 8, 18) } };
const salon = { summary: 'Salon', start: { date: jourDe(2026, 8, 19) }, end: { date: jourDe(2026, 8, 21) } };
const cafe = { summary: 'Café', start: { dateTime: iso(2026, 8, 18, 10) }, end: { dateTime: iso(2026, 8, 18, 11) } };
const tard = { summary: 'Tard', start: { dateTime: iso(2026, 8, 16, 23, 30) }, end: { dateTime: iso(2026, 8, 17, 0, 30) } };

test('la cle d’un jour, le debut et la fin d’un evenement', () => {
  assert.equal(cleJour(new Date(2026, 8, 16, 23)), '2026-8-16');
  assert.equal(debutDe(colis).getTime(), new Date(2026, 8, 16, 16).getTime());
  assert.equal(debutDe(poubelles).getTime(), new Date(2026, 8, 17).getTime(), 'une journee entiere commence a minuit local');
  assert.equal(finDe(poubelles).getTime(), new Date(2026, 8, 18).getTime());
  assert.equal(finDe({ summary: 'x', start: { dateTime: iso(2026, 8, 16, 16) } }).getTime(), new Date(2026, 8, 16, 16).getTime(), 'sans fin : le debut');
  assert.equal(debutDe({ summary: 'x' }), null);
  assert.equal(debutDe({ summary: 'x', start: { date: 'hier' } }), null);
  assert.equal(debutDe(null), null);
  assert.equal(finDe({ summary: 'x', start: { dateTime: iso(2026, 8, 16, 16) }, end: { date: 'plus tard' } }).getTime(), new Date(2026, 8, 16, 16).getTime(), 'une fin illisible vaut le debut');
});

test('la plage lue et la bande des jours : d’aujourd’hui minuit, sept jours', () => {
  const p = plageSemaine(AUJ);
  assert.equal(p.debut.getTime(), new Date(2026, 8, 16).getTime());
  assert.equal(p.fin.getTime(), new Date(2026, 8, 16).getTime() + 7 * 864e5);
  const js = joursAgenda(AUJ);
  assert.equal(js.length, JOURS_AGENDA);
  assert.equal(JOURS_AGENDA, 7);
  assert.equal(cleJour(js[0]), '2026-8-16', 'aujourd’hui d’abord');
  assert.equal(js[0].getHours(), 0);
  assert.deepEqual(js.map(cleJour), ['2026-8-16', '2026-8-17', '2026-8-18', '2026-8-19', '2026-8-20', '2026-8-21', '2026-8-22']);
  assert.equal(joursAgenda(AUJ, 3).length, 3);
});

test('un evenement touche son jour : un rendez-vous le sien, une journee entiere chacun des siens', () => {
  assert.equal(toucheJour(colis, new Date(2026, 8, 16)), true);
  assert.equal(toucheJour(colis, new Date(2026, 8, 17)), false);
  assert.equal(toucheJour(tard, new Date(2026, 8, 16)), true, '23 h 30 appartient a son jour');
  assert.equal(toucheJour(tard, new Date(2026, 8, 17)), false, 'meme s’il deborde apres minuit');
  assert.equal(toucheJour({ summary: 'minuit', start: { dateTime: iso(2026, 8, 16, 0) }, end: { dateTime: iso(2026, 8, 16, 1) } }, new Date(2026, 8, 16)), true, 'minuit pile appartient au jour qui commence');
  assert.equal(toucheJour({ summary: 'minuit', start: { dateTime: iso(2026, 8, 17, 0) }, end: { dateTime: iso(2026, 8, 17, 1) } }, new Date(2026, 8, 16)), false, '… et pas au jour qui finit');
  assert.equal(toucheJour(poubelles, new Date(2026, 8, 17)), true);
  assert.equal(toucheJour(poubelles, new Date(2026, 8, 18)), false, 'la fin d’une journee entiere est exclue');
  assert.equal(toucheJour(salon, new Date(2026, 8, 19)), true);
  assert.equal(toucheJour(salon, new Date(2026, 8, 20)), true, 'deux jours : les deux');
  assert.equal(toucheJour(salon, new Date(2026, 8, 21)), false);
  assert.equal(toucheJour(salon, new Date(2026, 8, 18)), false);
  assert.equal(toucheJour({ summary: 'x' }, new Date(2026, 8, 16)), false);
});

test('les comptes par jour de la bande', () => {
  const c = comptesParJour([colis, passe, poubelles, salon, cafe, tard], joursAgenda(AUJ));
  assert.deepEqual(c, { '2026-8-16': 3, '2026-8-17': 1, '2026-8-18': 1, '2026-8-19': 1, '2026-8-20': 1, '2026-8-21': 0, '2026-8-22': 0 });
  assert.deepEqual(comptesParJour([], joursAgenda(AUJ, 2)), { '2026-8-16': 0, '2026-8-17': 0 });
  assert.deepEqual(comptesParJour(null, null), {});
});

test('ce qui vient : pas ce qui est fini, du plus proche au plus lointain', () => {
  const v = evenementsAVenir([salon, cafe, passe, colis, poubelles, tard, { summary: 'sans date' }], AUJ);
  assert.deepEqual(v.map(e => e.summary), ['Livraison colis', 'Tard', 'Poubelles', 'Café', 'Salon'], 'le colis en cours reste, le dentiste de ce matin non, l’evenement sans date non plus');
  assert.deepEqual(evenementsAVenir([colis], new Date(2026, 8, 16, 17, 30)).map(e => e.summary), [], 'fini a l’instant : fini');
  assert.deepEqual(evenementsAVenir([colis], new Date(2026, 8, 16, 17, 29).getTime()).map(e => e.summary), ['Livraison colis'], 'un instant en millisecondes vaut une date');
  assert.deepEqual(evenementsAVenir(null, AUJ), []);
});

test('les evenements d’un jour, dans l’ordre', () => {
  assert.deepEqual(evenementsDuJour([tard, salon, passe, colis], new Date(2026, 8, 16)).map(e => e.summary), ['Dentiste', 'Livraison colis', 'Tard']);
  assert.deepEqual(evenementsDuJour([tard, salon, passe, colis], new Date(2026, 8, 20)).map(e => e.summary), ['Salon']);
  assert.deepEqual(evenementsDuJour([tard, salon], new Date(2026, 8, 22)), []);
});

test('le rail : une carte Agenda a la place de deux — la date, la bande, ce qui vient', () => {
  assert.ok(src.includes("const ACC_RAIL = ['attention', 'meteo', 'moment', 'rappels', 'agenda', 'heure', 'calendrier'];"), 'le mini-mois d’avant n’est pas revenu : « calendrier » est un widget EN OPTION (ADR 0041), absent tant qu’on ne l’ajoute pas');
  // La meteo a rejoint le rail (ADR 0038), puis deux widgets en option (ADR 0041) ferment la liste des noms.
  assert.ok(src.includes("moment: tr('En ce moment'), rappels: tr('Rappels'), agenda: tr('Agenda'), meteo: tr('Météo'), heure: tr('Heure'), calendrier: tr('Calendrier') });"), 'les noms en edition');
  assert.ok(src.includes("import { WIDGETS_OPTION, STYLES_WIDGETS, NOMS_STYLES, styleDe, villesDe } from './horloge.js';"), 'par defaut le rail reste celui de l’ADR 0032 : UNE carte agenda');
  const d = bloc('function Dashboard(', NL + '}');
  assert.ok(d.includes('const agenda = useAgenda(accueil && accueil.hass, null, plageAgenda);') && d.includes('const plageAgenda = useMemo(() => plageSemaine(new Date(jourAuj)), [jourAuj]);'), 'tous les evenements de la semaine, d’aujourd’hui minuit');
  assert.ok(d.includes('const [jourChoisi, setJourChoisi] = useState(null);'), 'un jour se choisit');
  assert.ok(d.includes('const montresAg = jourAg ? evenementsDuJour(agenda || [], jourAg) : aVenir.slice(0, 5);'), 'cinq lignes de ce qui vient, ou le jour choisi en entier');
  assert.ok(d.includes('onClick={() => setJourChoisi(choisi ? null : k)} aria-pressed={choisi}'), 'la bande : un jour se choisit et se rend');
  assert.ok(d.includes("background: auj ? 'var(--o-accent-fond)' : 'transparent'") && d.includes('{Array.from({ length: Math.min(n, 2) }).map((_, i) => <span key={i} style={{ width: 4, height: 4, borderRadius: \'50%\', background: \'var(--o-accent-soft)\' }} />)}'), 'aujourd’hui en pastille, un point par evenement (deux au plus) — le dessin du mini-mois');
  assert.ok(d.includes("const railAgenda = calRailId ? railPanel(tr('Agenda'), sousAg, nAuj ? (nAuj > 1 ? tr('{n} AUJOURD’HUI', { n: nAuj }) : tr('1 AUJOURD’HUI')) : tr('RIEN AUJOURD’HUI'), nAuj ? '79,140,255' : OKRGB, [bandeAg, ...lignesAg]) : null;"), 'la carte, avec le compte du jour ; sans calendrier, rien');
  assert.ok(d.includes("{jourAg ? tr('Rien ce jour-là') : tr('Rien de prévu ces 7 jours')}"), 'sans evenement, elle le dit');
  assert.ok(d.includes("onClick={() => dc.ouvrir(calRailId)} aria-label={tr('Ouvrir le calendrier')}"), 'la date ouvre le calendrier, comme le mini-mois le faisait');
  assert.ok(d.includes('moment: railMoment, rappels: railRappels, agenda: railAgenda,') && !d.includes('calendrier: railCal') && !d.includes('<CvCalendrier id={calRailId}'), 'le mini-mois a quitte le rail (la carte du catalogue reste)');
  const o = bloc('  const ordreDe = (zone) => {', NL + '  };');
  assert.ok(o.includes('.filter(s => base.indexOf(s) >= 0)'), 'un ordre enregistre avec une section inconnue l’ignore simplement (un vieux « calendrier » ne fait que ranger le widget en option, toujours absent tant qu’on ne l’ajoute pas)');
  for (const k of ['{n} AUJOURD’HUI', '1 AUJOURD’HUI', 'RIEN AUJOURD’HUI', 'Rien ce jour-là', 'Rien de prévu ces 7 jours', 'Ouvrir le calendrier']) {
    assert.ok(en.includes("'" + k + "':"), k + ' manque a en.js');
  }
});
