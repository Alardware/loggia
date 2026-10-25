/* La course d'un volet à l'écran (chantier Volets, § 5, V8).
 *
 * `src/voletcourse.js` est pur — l'instant passe en argument — et son magasin
 * se double (horloge et minuteries). Ce qui est garanti ici, à sec :
 *  - une course complète dure 20 s ; la cible tient 180 s au plus, puis la
 *    position publiée fait foi ;
 *  - les quatre sources et leur ordre : un geste, un ordre du serveur,
 *    `opening` / `closing`, la bascule Netatmo — et `closed 100` → `open 1`,
 *    une position qui ARRIVE, n'en est pas une (sa chambre, le 09/10) ;
 *  - la confirmation (à 5 près), Stop, une position réelle pendant la course,
 *    le mouvement réduit ;
 *  - 10 images par seconde pendant une course, et plus rien ensuite ;
 *  - les crochets lisent le magasin : la même course pour tous, rien sans volet. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const C = await import('../src/voletcourse.js');

const T0 = Date.parse('2026-10-12T19:29:08+02:00');
const iso = (t) => new Date(t).toISOString();
// Un état de Home Assistant, mis à jour à l'instant `t` (`changé` : quand l'ÉTAT a changé).
const st = (state, position, t, change = t) => ({ state, attributes: { device_class: 'shutter', supported_features: 15,
  ...(position == null ? {} : { current_position: position }) }, last_updated: iso(t), last_changed: iso(change) });
const pos = (e, reelle, t) => Math.round(C.affichage(e, reelle, t).pos);

test('une course complète dure 20 s, une demi-course 10 s ; réduite, elle garde sa durée', () => {
  assert.deepEqual([C.COURSE_COMPLETE_S, C.TENUE_S, C.CONFIRMATION, C.IMAGE_MS], [20, 180, 5, 100], 'les nombres du § 5');
  assert.equal(C.nouvelleCourse(100, 0, T0, 'geste').duree, 20000);
  assert.equal(C.nouvelleCourse(60, 100, T0, 'geste').duree, 8000);
  assert.equal(C.nouvelleCourse(60, 100, T0, 'geste', true).duree, 8000, 'prefers-reduced-motion : seul le dessin saute à la cible, la course dure (relecture du 13/10, point 3)');
  assert.deepEqual(C.nouvelleCourse(-5, 140, T0, 'geste').depart, 0, 'bornée à 0 et 100');
});

test('l’affichage : la course glisse, puis la cible tient 180 s, puis la position publiée fait foi', () => {
  const e = C.geste(null, 0, 100, T0);
  assert.deepEqual(C.affichage(e, 100, T0 + 10000), { pos: 50, enCourse: true, sens: 'fermeture', cible: 0 });
  assert.deepEqual(C.affichage(e, 100, T0 + 20000), { pos: 0, enCourse: false, sens: null, cible: 0 }, 'arrivée : la cible tient');
  assert.equal(C.affichage(e, 100, T0 + 20000 + 179000).pos, 0, 'elle tient encore à 179 s');
  assert.deepEqual(C.affichage(e, 100, T0 + 20000 + 180000), { pos: 100, enCourse: false, sens: null, cible: null }, 'passé 180 s : Home Assistant fait foi — un volet bloqué se voit');
  assert.equal(C.affichage(C.geste(null, 100, 60, T0), 60, T0 + 4000).sens, 'ouverture');
});

test('source 1, un geste : il part de la position DESSINÉE — un nouveau geste en pleine course aussi', () => {
  let e = C.geste(null, 0, 100, T0);
  e = C.geste(e, 100, 100, T0 + 5000);      // remonter à mi-chemin : la course repart de 75
  assert.equal(e.course.depart, 75);
  assert.equal(e.course.cible, 100);
  assert.equal(e.course.duree, 5000);
  assert.equal(e.course.source, 'geste');
});

test('Stop : la course s’arrête là où elle est, la position tient jusqu’à la prochaine publiée, 180 s au plus', () => {
  let e = C.geste(null, 0, 100, T0);
  e = C.arret(e, 100, T0 + 6000);
  assert.deepEqual(C.affichage(e, 100, T0 + 7000), { pos: 70, enCourse: false, sens: null, cible: 70 });
  assert.equal(pos(e, 100, T0 + 6000 + 180000), 100, 'passé 180 s sans nouvelle, la position publiée');
  // La position publiée arrive : elle remplace aussitôt.
  e = C.voirHA({ ...e, vu: C.lireVolet(st('open', 100, T0 - 1000)) }, st('open', 68, T0 + 30000), T0 + 30000);
  assert.equal(e.course, null);
  assert.equal(C.arret(C.voirHA(null, st('open', 40, T0), T0), 40, T0).course, null, 'hors course, Stop ne pose rien');
});

test('la confirmation : une position publiée à 5 près termine la course ; une autre la remplace', () => {
  const avant = C.voirHA(null, st('open', 100, T0 - 60000), T0 - 60000);
  let e = C.geste(avant, 0, 100, T0);
  const confirme = C.voirHA(e, st('open', 4, T0 + 25000), T0 + 25000);
  assert.equal(confirme.course, null, '4 % pour une cible de 0 : confirmé');
  const autre = C.voirHA(e, st('open', 40, T0 + 25000), T0 + 25000);
  assert.equal(autre.course, null, 'arrivée à 40 au lieu de 0 : Home Assistant dit autre chose, il fait foi');
  assert.equal(pos(autre, 40, T0 + 26000), 40);
  // Un état qui change SANS position (la bascule) ne termine pas la tenue.
  e = C.voirHA(e, st('closed', 100, T0 + 3000), T0 + 3000);
  assert.ok(e.course, 'la bascule de l’état ne confirme rien : la position vaut encore 100');
  assert.equal(pos(e, 100, T0 + 30000), 0, 'la cible tient');
});

test('une position réelle pendant la course : la course repart d’elle, même cible — le dessin suit le moteur', () => {
  const avant = C.voirHA(null, st('open', 100, T0 - 60000), T0 - 60000);
  let e = C.geste(avant, 0, 100, T0);
  e = C.voirHA(e, st('closing', 80, T0 + 2000), T0 + 2000);
  assert.deepEqual([e.course.depart, e.course.cible, e.course.t0, e.course.source], [80, 0, T0 + 2000, 'geste']);
  e = C.voirHA(e, st('closing', 30, T0 + 9000), T0 + 9000);
  assert.equal(pos(e, 30, T0 + 9000), 30, 'sans saut');
  e = C.voirHA(e, st('closed', 0, T0 + 14000), T0 + 14000);
  assert.equal(e.course, null, 'arrêté à la cible : confirmé');
});

test('source 3, `opening` / `closing` : la cible du serveur si elle est connue, sinon 100 ou 0', () => {
  const avant = C.voirHA(null, st('open', 20, T0 - 60000), T0 - 60000);
  const e = C.voirHA(avant, st('opening', 20, T0), T0);
  assert.deepEqual([e.course.depart, e.course.cible, e.course.source], [20, 100, 'ha']);
  const vise = C.voirHA(avant, st('opening', 20, T0), T0, { manoeuvre: { cible: 60, depuis: iso(T0), regle: 'planning' } });
  assert.equal(vise.course.cible, 60);
  // Une source moins sûre ne remplace pas un geste : la cible du geste reste.
  const g = C.geste(avant, 40, 20, T0);
  assert.equal(C.voirHA(g, st('opening', 20, T0 + 500), T0 + 500).course.cible, 40);
});

test('source 4, la bascule Netatmo : l’état change, la position NON, il y a moins de 180 s', () => {
  // 09/10, sa chambre : `open 100`, puis `closed 100` à 19:29:08 — la descente commence.
  const avant = C.voirHA(null, st('open', 100, T0 - 3600000), T0 - 3600000);
  let e = C.voirHA(avant, st('closed', 100, T0), T0 + 2000);
  assert.deepEqual([e.course.depart, e.course.cible, e.course.t0, e.course.source], [100, 0, T0, 'bascule']);
  assert.equal(pos(e, 100, T0 + 10000), 50, 'partie à l’heure de la bascule, pas à celle où l’écran l’a vue');
  // 19:30:01 : `open 1` — la position ARRIVE. Ce n'est pas une ouverture : la fin de la fermeture.
  e = C.voirHA(e, st('open', 1, T0 + 53000), T0 + 53000);
  assert.equal(e.course, null, 'confirmée à 1 % : la course s’arrête, aucune ouverture ne commence');
  assert.equal(pos(e, 1, T0 + 54000), 1);
  // L'inverse : `closed 0` → `open 0`, la montée.
  const bas = C.voirHA(null, st('closed', 0, T0 - 3600000), T0 - 3600000);
  assert.equal(C.voirHA(bas, st('open', 0, T0), T0).course.cible, 100);
});

test('ce qui n’est PAS une bascule : une position qui arrive, une bascule trop vieille, le chargement de la page', () => {
  // Page ouverte entre la bascule et la position : `closed 100` vu en premier, puis `open 1`.
  let e = C.voirHA(null, st('closed', 100, T0), T0 + 5000);
  assert.equal(e.course, null, 'au chargement, on ne sait rien de l’état d’avant : rien ne se déduit');
  e = C.voirHA(e, st('open', 1, T0 + 53000), T0 + 53000);
  assert.equal(e.course, null, '`closed 100` → `open 1` : une position qui arrive, jamais une ouverture');
  // Une bascule vue trop tard (son état a changé il y a 3 min) ne se joue plus.
  const avant = C.voirHA(null, st('open', 100, T0 - 3600000), T0 - 3600000);
  assert.equal(C.voirHA(avant, st('closed', 100, T0 + 200000, T0), T0 + 200000).course, null);
  // Un volet qui ne publie pas sa position : un changement d'état EST une position (100 → 0), pas une bascule.
  const simple = C.voirHA(null, st('open', null, T0 - 60000), T0 - 60000);
  assert.equal(C.voirHA(simple, st('closed', null, T0), T0).course, null);
});

test('source 2, un ordre du serveur : joué une fois, pas trop vieux, jamais devant un geste', () => {
  const m = { cible: 0, depuis: iso(T0), regle: 'planning' };
  const avant = C.voirHA(null, st('open', 100, T0 - 60000), T0 - 60000);
  let e = C.voirServeur(avant, m, 100, T0 + 4000);
  assert.deepEqual([e.course.depart, e.course.cible, e.course.t0, e.course.source, e.joue], [100, 0, T0, 'serveur', iso(T0)]);
  assert.equal(C.voirServeur(e, m, 100, T0 + 8000), e, 'le même ordre, relu au sondage suivant, ne se rejoue pas');
  assert.equal(C.voirServeur(avant, m, 100, T0 + 181000).course, null, 'trop vieux : la position publiée fait foi');
  assert.equal(C.voirServeur(avant, m, 2, T0 + 4000).course, null, 'déjà à la cible : rien ne bouge');
  const g = C.geste(avant, 60, 100, T0 + 1000);
  assert.equal(C.voirServeur(g, m, 100, T0 + 2000).course.cible, 60, 'un geste de l’écran est plus sûr');
  // Il remplace une bascule (moins sûre), depuis la position dessinée : sans saut.
  const b = C.voirHA(avant, st('closed', 100, T0), T0);
  const s = C.voirServeur(b, { cible: 30, depuis: iso(T0 + 1000), regle: 'soleil' }, 100, T0 + 5000);
  assert.deepEqual([Math.round(s.course.depart), s.course.cible, s.course.source], [75, 30, 'serveur']);
});

test('muet : rien ne se déduit d’une coupure, la dernière lecture reste', () => {
  const avant = C.voirHA(null, st('open', 100, T0 - 60000), T0 - 60000);
  assert.equal(C.voirHA(avant, st('unavailable', null, T0), T0), avant);
  assert.equal(C.lireVolet(st('unknown', 40, T0)), null);
});

test('le mouvement réduit : seul le DESSIN saute à la cible — « En fermeture », Stop, la tenue et la confirmation ne changent pas', () => {
  // Relecture du 13/10, point 3 : une course de durée nulle n'était jamais « en course ».
  const e = C.geste(null, 0, 100, T0, true);
  assert.equal(e.course.duree, 20000, 'la course garde sa durée');
  assert.deepEqual(C.affichage(e, 100, T0), { pos: 0, enCourse: true, sens: 'fermeture', cible: 0 }, 'dessinée à la cible dès le départ, elle court');
  assert.deepEqual(C.affichage(e, 100, T0 + 10000), { pos: 0, enCourse: true, sens: 'fermeture', cible: 0 });
  assert.deepEqual(C.affichage(e, 100, T0 + 20000), { pos: 0, enCourse: false, sens: null, cible: 0 }, 'arrivée : la cible tient');
  assert.equal(pos(e, 100, T0 + 20000 + 179000), 0);
  assert.equal(pos(e, 100, T0 + 20000 + 180000), 100, 'passé la tenue, la position publiée');
  // Stop s'arrête là où le moteur EST — estimé —, pas là où le dessin a sauté.
  assert.deepEqual(C.affichage(C.arret(e, 100, T0 + 6000), 100, T0 + 7000), { pos: 70, enCourse: false, sens: null, cible: 70 });
  // Un nouveau geste repart, lui aussi, de la position estimée.
  const g = C.geste(e, 100, 100, T0 + 5000, true);
  assert.deepEqual([g.course.depart, g.course.cible, g.course.duree], [75, 100, 5000]);
  // La confirmation : une position publiée à 5 près termine la course.
  const avant = C.voirHA(null, st('open', 100, T0 - 60000), T0 - 60000);
  const r = C.voirHA(C.geste(avant, 0, 100, T0, true), st('open', 3, T0 + 25000), T0 + 25000, { reduit: true });
  assert.equal(r.course, null);
  // Le magasin d'un poste au mouvement réduit : la carte voit la course, le dessin à la cible.
  C.reglerCourses({ horloge: () => T0 + 4000, repeter: () => 0, arreterMinuterie: () => {}, plusTard: () => 0, annuler: () => {}, reduit: true });
  C.lancerCourse('cover.volet_salon', 0, st('open', 100, T0 - 60000));
  assert.deepEqual(C.afficherCourse('cover.volet_salon', st('open', 100, T0 - 60000)), { pos: 0, enCourse: true, sens: 'fermeture', cible: 0 });
});

/* Une horloge et des minuteries à la main : on voit chaque minuterie posée. */
function banc() {
  const b = { t: T0, rep: new Map(), att: new Map(), n: 1 };
  const m = C.reglerCourses({
    horloge: () => b.t,
    repeter: (f, ms) => { const id = b.n++; b.rep.set(id, { f, ms }); return id; },
    arreterMinuterie: (id) => b.rep.delete(id),
    plusTard: (f, ms) => { const id = b.n++; b.att.set(id, { f, ms }); return id; },
    annuler: (id) => b.att.delete(id),
  });
  b.avancer = (ms) => { b.t += ms; for (const r of [...b.rep.values()]) r.f(); };
  b.reveiller = () => { for (const [id, a] of [...b.att]) { b.att.delete(id); b.t += a.ms; a.f(); } };
  return { b, m };
}

test('le magasin : 10 images par seconde pendant une course, un seul réveil pendant la tenue, rien au repos', () => {
  const { b, m } = banc();
  const id = 'cover.volet_salon';
  let vus = 0;
  m.ecouter(id, () => { vus += 1; });
  m.voir(id, st('open', 100, T0 - 60000));
  assert.equal(b.rep.size, 0, 'au repos, rien ne tourne');
  C.lancerCourse(id, 0, st('open', 100, T0 - 60000));
  assert.deepEqual([...b.rep.values()].map(r => r.ms), [100], '10 images par seconde');
  const avant = vus;
  b.avancer(100);
  assert.ok(vus > avant, 'chaque image prévient les abonnés');
  for (let i = 0; i < 205; i++) b.avancer(100);
  assert.equal(b.rep.size, 0, 'arrivée : l’image s’arrête');
  assert.deepEqual([...b.att.values()].map(a => a.ms > 179000 && a.ms <= 180001), [true], 'un réveil au bout de la tenue');
  b.reveiller();
  assert.equal(m.lire(id).e.course, null, 'la tenue finie, la course part');
  assert.equal(b.rep.size + b.att.size, 0, 'plus rien ne tourne');
});

test('le magasin : la carte, la compacte et la fiche lisent la MÊME course', () => {
  const { m } = banc();
  const id = 'cover.volet_cuisine';
  m.voir(id, st('open', 60, T0 - 60000));
  C.lancerCourse(id, 100, st('open', 60, T0 - 60000));
  const un = m.lire(id), deux = m.lire(id);
  assert.equal(un, deux, 'un instantané stable entre deux lectures');
  assert.equal(C.afficherCourse(id, st('open', 60, T0 - 60000)).sens, 'ouverture');
  C.arreterCourse(id, st('open', 60, T0 - 60000));
  assert.equal(C.afficherCourse(id, st('open', 60, T0 - 60000)).enCourse, false);
});

test('les crochets : la course d’un volet pour un composant ; sans volet, rien ne s’abonne', () => {
  let t = T0;
  C.reglerCourses({ horloge: () => t, repeter: () => 0, arreterMinuterie: () => {}, plusTard: () => 0, annuler: () => {} });
  const vus = [];
  const Sonde = ({ id, s }) => { vus.push(C.useCourseVolet(id, s)); C.useCoursesVolets(); return null; };
  C.lancerCourse('cover.volet_salon', 0, st('open', 100, T0 - 60000));
  t = T0 + 10000;
  renderToStaticMarkup(createElement(Sonde, { id: 'cover.volet_salon', s: st('open', 100, T0 - 60000) }));
  renderToStaticMarkup(createElement(Sonde, { id: null, s: st('open', 100, T0 - 60000) }));
  assert.deepEqual([vus[0].enCourse, Math.round(vus[0].pos), vus[0].sens], [true, 50, 'fermeture'], 'à mi-course');
  assert.deepEqual([vus[1].enCourse, vus[1].pos], [false, 100], 'sans volet : la position publiée, aucune course');
});

/* ── Relecture des tâches 1 à 5 (13/10, docs/chantier-volets-plan-2-ecran.md) ── */

// Une course qui MONTE : sa cible est au-dessus de son départ.
const monte = (e) => !!(e && e.course && e.course.cible > e.course.depart);

test('relecture, point 1 — la montée ne se déduit que d’un `closed` à 0 % : sa chambre, qui bute à 1 %, ne s’ouvre jamais à l’écran', () => {
  // La suite réelle de sa chambre, au bout d'une fermeture : `open 100` → `closed 100` → `open 1`.
  let e = C.voirHA(null, st('open', 100, T0 - 3600000), T0 - 3600000);
  e = C.voirHA(e, st('closed', 100, T0), T0 + 1000);
  assert.deepEqual([e.course.depart, e.course.cible], [100, 0], 'la descente se joue');
  e = C.voirHA(e, st('open', 1, T0 + 53000), T0 + 53000);
  assert.ok(!monte(e), '`open 1` : la position qui arrive termine la descente');
  // L'ordre de fermeture envoyé à la chambre déjà à 1 % : `open 1` → `closed 1` → `open 1`.
  let c = C.voirHA(null, st('open', 1, T0 - 3600000), T0 - 3600000);
  c = C.voirHA(c, st('closed', 1, T0), T0 + 1000);
  assert.ok(!monte(c));
  const pendant = C.voirHA(c, st('open', 1, T0 + 60000), T0 + 60000);
  assert.ok(!monte(pendant) && C.affichage(pendant, 1, T0 + 61000).sens === null, '`open 1` pendant la tenue');
  const apres = C.voirHA(c, st('open', 1, T0 + 400000), T0 + 400000);
  assert.ok(!monte(apres), '`open 1` arrivé après la tenue : aucune montée');
  assert.equal(pos(apres, 1, T0 + 410000), 1);
  // Une carte montée entre les deux : elle voit `closed 1` en premier, puis `open 1`.
  const montee = C.voirHA(C.voirHA(null, st('closed', 1, T0), T0 + 5000), st('open', 1, T0 + 9000), T0 + 9000);
  assert.ok(!monte(montee), 'carte montée pendant la fermeture : aucune montée');
  // Un volet bloqué : `closed 60` → `open 60`.
  const bloque = C.voirHA(C.voirHA(null, st('closed', 60, T0 - 60000), T0 - 60000), st('open', 60, T0), T0);
  assert.equal(bloque.course, null, '`closed 60` → `open 60` : rien ne se lance');
  // La montée de Netatmo reste : `closed 0` → `open 0`.
  const bas = C.voirHA(C.voirHA(null, st('closed', 0, T0 - 3600000), T0 - 3600000), st('open', 0, T0), T0 + 2000);
  assert.deepEqual([bas.course.depart, bas.course.cible, bas.course.source], [0, 100, 'bascule']);
});

test('relecture, point 2 — un ordre du serveur plus récent remplace la course d’un ordre plus ancien', () => {
  const avant = C.voirHA(null, st('open', 100, T0 - 60000), T0 - 60000);
  const un = C.voirServeur(avant, { cible: 0, depuis: iso(T0), regle: 'planning' }, 100, T0 + 1000);
  const deux = C.voirServeur(un, { cible: 30, depuis: iso(T0 + 5000), regle: 'soleil' }, 100, T0 + 5000);
  assert.deepEqual([Math.round(deux.course.depart), deux.course.cible, deux.course.source, deux.joue], [75, 30, 'serveur', iso(T0 + 5000)],
    'la reprise est jouée, depuis la position dessinée');
});

test('relecture, point 4 — l’horloge recule en pleine course : rien ne fige l’écran, l’image s’arrête', () => {
  const e = C.geste(null, 0, 100, T0);
  assert.deepEqual(C.affichage(e, 100, T0 - 5000), { pos: 100, enCourse: false, sens: null, cible: null }, 'avant son départ, la course n’existe pas : la position publiée');
  const { b, m } = banc();
  const id = 'cover.volet_salon';
  m.voir(id, st('open', 100, T0 - 60000));
  C.lancerCourse(id, 0, st('open', 100, T0 - 60000));
  b.avancer(100);
  b.t = T0 - 3600000;                       // l'horloge du poste recule d'une heure
  b.avancer(100);
  assert.equal(b.rep.size, 0, 'plus d’image à 10 par seconde');
  assert.equal(m.lire(id).e.course, null, 'la course part');
});

test('relecture, point 5 — `opening` / `closing` ne prennent la cible du serveur que fraîche, et dans leur sens', () => {
  const avant = C.voirHA(null, st('open', 20, T0 - 60000), T0 - 60000);
  const voir = (etat, cible, age) => C.voirHA(avant, st(etat, 20, T0), T0, { manoeuvre: { cible, depuis: iso(T0 - age), regle: 'planning' } }).course.cible;
  assert.equal(voir('opening', 60, 5000), 60, 'fraîche et vers le haut : sa cible');
  assert.equal(voir('opening', 60, 200000), 100, 'plus de 180 s : le bout de la course');
  assert.equal(voir('opening', 0, 5000), 100, '`opening` vers 0 : sens contraire');
  assert.equal(voir('closing', 60, 5000), 0, '`closing` de 20 vers 60 : sens contraire');
  assert.equal(voir('closing', 10, 5000), 10);
});
