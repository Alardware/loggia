/* La démo des volets (chantier Volets, § 9) : les quatre volets de la
 * maquette, le soleil du jour, l'état du § 6.1 calculé par le jumeau, une
 * semaine d'historique et de journal qui se répondent, les manœuvres.
 *
 * L'horloge est réglée (`maisonVoletsDemo({ quand })`) : lundi 12 octobre
 * 2026 à la maison. La démo parle l'heure du navigateur — on compare donc la
 * partie MURALE des instants (`slice(0, 19)`), quel que soit le fuseau de la
 * machine qui passe le test. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
const { maisonVoletsDemo } = await import('../src/demo.js');
const DEMO = readFileSync(new URL('../src/demo.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const A = (h, m) => new Date(2026, 9, 12, h, m, 0, 0).getTime();   // lundi 12/10, à la maison
const mural = (iso) => (typeof iso === 'string' ? iso.slice(0, 19) : iso);
const VOLETS = ['cover.volet_cuisine', 'cover.volet_salon', 'cover.volet_bureau', 'cover.volet_chambre'];
// Les cas ajoutés le 19/10 : un store banne, un rideau sans position, un volet muet, un volet « façon Netatmo ».
const AUTRES = ['cover.store_banne', 'cover.rideau_chambre', 'cover.volet_entree', 'cover.volet_sdb'];

test('les quatre volets de la maquette, à leurs positions ; la baie vitrée du salon ouverte', () => {
  const m = maisonVoletsDemo({ quand: A(15, 0) });
  const pos = (id) => m.states[id].attributes.current_position;
  assert.deepEqual(VOLETS.map(pos), [60, 100, 30, 0]);
  for (const id of VOLETS) assert.equal(m.states[id].attributes.device_class, 'shutter', id);
  assert.equal(m.states['binary_sensor.baie_vitree'].state, 'on');
  assert.equal(m.states['sun.sun'].state, 'above_horizon');
  assert.ok(m.states['sensor.temperature_exterieure'], 'le thermomètre du dehors existe : la configuration ne vise plus un fantôme');
});

test('le soleil : 07:47 et 20:24 aujourd’hui, +1,4 min et −1,8 min par jour ; la nuit, sous l’horizon', () => {
  const e = maisonVoletsDemo({ quand: A(15, 0) }).etat();
  assert.equal(mural(e.maintenant), '2026-10-12T15:00:00');
  assert.equal(e.soleil_jours[0].date, '2026-10-12', 'du lundi de la semaine…');
  assert.equal(e.soleil_jours.at(-1).date, '2026-10-19', '… à aujourd’hui + 7');
  assert.deepEqual([mural(e.soleil_jours[0].lever), mural(e.soleil_jours[0].coucher)], ['2026-10-12T07:47:00', '2026-10-12T20:24:00']);
  assert.deepEqual([mural(e.soleil_jours[1].lever), mural(e.soleil_jours[1].coucher)], ['2026-10-13T07:48:24', '2026-10-13T20:22:12']);
  assert.ok(e.soleil.elevation > 20 && e.soleil.azimut > 180 && e.soleil.azimut < 255, 'l’après-midi, le soleil est haut, au sud-ouest');
  assert.equal(maisonVoletsDemo({ quand: A(23, 0) }).states['sun.sun'].state, 'below_horizon');
});

test('l’état du § 6.1 : la règle et les mouvements à venir du jumeau, la protection, la porte, l’attente', () => {
  const e = maisonVoletsDemo({ quand: A(15, 0) }).etat();
  const v = e.volets;
  // ASSERTION MODIFIÉE (audit du 19/10) : tous les volets PAR LEUR CLASSE, comme le serveur — les quatre de la
  // maquette et les quatre cas ajoutés ; ni le garage ni le portail.
  assert.deepEqual(Object.keys(v).sort(), [...VOLETS, ...AUTRES].sort());
  for (const id of [...VOLETS, ...AUTRES]) {
    assert.deepEqual(Object.keys(v[id]).sort(), ['a_venir', 'abri', 'attente', 'manoeuvre', 'orientation', 'porte', 'protection', 'regle'], id);
  }
  assert.deepEqual([v['cover.volet_cuisine'].regle, v['cover.volet_chambre'].regle], ['comme', 'perso']);
  const [premier] = v['cover.volet_cuisine'].a_venir;
  assert.deepEqual([premier.sens, mural(premier.heure), premier.source, premier.decalage], ['fermeture', '2026-10-12T20:54:00', 'coucher', 30]);
  assert.deepEqual(v['cover.volet_chambre'].a_venir.slice(0, 2).map(x => [x.sens, mural(x.heure)]),
    [['fermeture', '2026-10-12T20:54:00'], ['ouverture', '2026-10-13T08:18:24']], 'ses heures à elle : +30 min, du lundi au vendredi');
  const b = v['cover.volet_bureau'];
  assert.deepEqual([mural(b.protection.jusqu_a), b.protection.position, b.protection.orientation, b.orientation], ['2026-10-12T18:30:00', 100, 270, 270]);
  assert.deepEqual(e.abaisses, ['cover.volet_bureau']);
  const s = v['cover.volet_salon'];
  assert.deepEqual([s.porte, s.orientation, s.attente], [{ entite: 'binary_sensor.baie_vitree', etat: 'ouverte' }, 225, null]);
  assert.equal(v['cover.volet_cuisine'].porte, null);
  // Le soir : la fermeture de 20:54 attend la baie. Après 18:30, la protection ne dit plus son heure ;
  // le soleil couché (20:24), elle ne tient plus rien (relecture du 13/10, point 7).
  const soir = maisonVoletsDemo({ quand: A(21, 30) }).etat().volets;
  assert.deepEqual([soir['cover.volet_salon'].attente.sens, soir['cover.volet_salon'].attente.motif], ['fermer', 'baie ouverte']);
  assert.equal(mural(soir['cover.volet_salon'].attente.expire), '2026-10-13T08:18:24');
  assert.equal(maisonVoletsDemo({ quand: A(19, 30) }).etat().volets['cover.volet_bureau'].protection.jusqu_a, null);
  assert.equal(soir['cover.volet_bureau'].protection, null);
  // La configuration ne vise que des entités qui existent.
  const cfg = e.config;
  const m = maisonVoletsDemo({ quand: A(15, 0) });
  for (const id of [cfg.soleil.temp_entite, ...Object.keys(cfg.soleil.volets), ...Object.keys(cfg.baies.volets), ...Object.values(cfg.baies.volets), ...Object.keys(cfg.planning.volets)]) {
    assert.ok(m.states[id], id + ' n’existe pas dans la démo');
  }
});

test('la semaine : l’historique finit sur la position de chaque volet, et le journal le commande', () => {
  const m = maisonVoletsDemo({ quand: A(15, 0) });
  for (const id of VOLETS) {
    const [liste] = m.historique(id, 7);
    assert.ok(liste.length > 10, id + ' : sept jours de mouvements');
    assert.equal(liste[0].entity_id, id);
    assert.equal(liste.at(-1).attributes.current_position, m.states[id].attributes.current_position, id + ' : l’histoire n’aboutit pas à sa position');
  }
  const journal = m.etat().journal;
  // Le bureau : sa dernière ligne est la protection d'aujourd'hui, façade et dehors compris (§ 6.4).
  const bureau = journal.filter(l => l.cibles.includes('cover.volet_bureau'));
  assert.deepEqual([bureau[0].regle, bureau[0].quoi, bureau[0].cible, bureau[0].orientation, bureau[0].dehors], ['soleil', 'proteger', 30, 270, 26.4]);
  assert.equal(new Date(bureau[0].ts * 1000).getHours(), 13);
  // Le salon : avant-hier, sa fermeture a attendu la baie, puis s'est faite.
  const rattrapage = journal.find(l => l.regle === 'rattrapage');
  assert.deepEqual([rattrapage.cibles, rattrapage.motif, rattrapage.cible], [['cover.volet_salon'], 'baie refermee', 0]);
  assert.equal(new Date(rattrapage.ts * 1000).getDate(), 10);
  // Chaque ordre du planning porte sa cible.
  assert.ok(journal.filter(l => l.regle === 'planning').every(l => l.cible === (l.quoi === 'ouvrir' ? 100 : 0)));
});

test('loggia/volets/manoeuvres : les lignes du volet, les plus récentes d’abord ; ce qu’il refuse', async () => {
  const m = maisonVoletsDemo({ quand: A(15, 0) });
  const r = await m.manoeuvres({ type: 'loggia/volets/manoeuvres', entity_id: 'cover.volet_bureau', depuis: A(0, 0) / 1000 });
  assert.ok(r.lignes.length >= 2 && r.lignes.every(l => l.cibles.includes('cover.volet_bureau') && l.ts >= A(0, 0) / 1000));
  assert.ok(r.lignes.every((l, i) => i === 0 || r.lignes[i - 1].ts >= l.ts), 'les plus récentes d’abord');
  assert.ok(r.couvre_depuis < A(0, 0) / 1000 - 6 * 86400, 'le journal couvre la semaine');
  for (const mauvais of [{ entity_id: 'cover.volet_bureau' }, { entity_id: 'cover.volet_bureau', depuis: -1 }, { depuis: 0 }]) {
    await assert.rejects(m.manoeuvres({ type: 'loggia/volets/manoeuvres', ...mauvais }), (e) => e.code === 'invalid_format');
  }
});

test('la démo répond comme le serveur : le compte ordinaire est refusé, le faux moteur publie sa course', () => {
  assert.ok(DEMO.includes("if (ordinaire) return Promise.reject({ code: 'unauthorized', message: 'Unauthorized' });\n        return Promise.resolve({ config: voletsPatch(msg.patch) });"));
  assert.ok(DEMO.includes("if (msg && msg.type === 'loggia/volets/manoeuvres') return manoeuvresVoletsDemo(msg, states);"));
  const moteur = DEMO.slice(DEMO.indexOf('const moteurVolet = '), DEMO.indexOf('// La consigne d\'un `climate`'));
  assert.ok(moteur.includes('pos + 3') && moteur.includes('}, 500));') && moteur.includes("const sens = voulue > depart ? 'opening' : 'closing';"), '6 % par seconde, une position toutes les 500 ms, opening / closing');
  assert.ok(moteur.includes("if (service === 'stop_cover') { toucher(x, depart > 0 ? 'open' : 'closed', { current_position: depart }); return; }"), 'Stop arrête là où il est');
});

/* ── Relecture des tâches 1 à 5 (13/10, docs/chantier-volets-plan-2-ecran.md) ── */

test('relecture du 13/10, point 7 — la nuit, la protection ne tient rien : à 00:30, aucun volet n’est monté par elle', () => {
  const m = maisonVoletsDemo({ quand: A(0, 30) });
  const e = m.etat();
  assert.deepEqual(VOLETS.filter(id => e.volets[id].protection), [], 'le soleil couché, aucune protection');
  assert.deepEqual(e.abaisses, []);
  assert.deepEqual(m.regles().tenues, {}, 'le journal ne la dit pas tenue non plus');
  const minutes = (ts) => { const d = new Date(ts * 1000); return d.getHours() * 60 + d.getMinutes(); };
  const protections = e.journal.filter(l => l.regle === 'soleil' && l.quoi === 'proteger');
  assert.ok(protections.length > 0 && protections.every(l => minutes(l.ts) >= 7 * 60 + 30 && minutes(l.ts) <= 20 * 60 + 40), 'chaque protection, le soleil levé');
  // Le bureau : fermé hier soir, remis à 30 % par un geste à la main (sans ligne) — pas par la protection.
  const [liste] = m.historique('cover.volet_bureau', 1);
  assert.deepEqual(liste.slice(-2).map(p => p.attributes.current_position), [0, 30]);
  const derniere = e.journal.find(l => l.cibles.includes('cover.volet_bureau'));
  assert.deepEqual([derniere.regle, derniere.quoi, new Date(derniere.ts * 1000).getDate()], ['planning', 'fermer', 11], 'sa dernière ligne : la fermeture d’hier soir');
  // Le matin, la protection ne commence jamais avant le lever du soleil (07:47).
  const matin = maisonVoletsDemo({ quand: A(8, 0) }).etat().journal.find(l => l.quoi === 'proteger');
  assert.equal(minutes(matin.ts), 7 * 60 + 47);
});

test('relecture du 13/10, point 8 — la ligne simulée de la chambre est datée une heure après le coucher, jamais « il y a une heure »', () => {
  const simulee = (quand) => maisonVoletsDemo({ quand }).regles().journal.find(l => l.simule && l.cibles.includes('cover.volet_chambre'));
  const quand = (l) => { const d = new Date(l.ts * 1000); return [d.getDate(), d.getHours(), d.getMinutes()]; };
  assert.deepEqual(quand(simulee(A(15, 0))), [11, 21, 25], 'l’après-midi : hier, une heure après le coucher (20:25:48)');
  assert.deepEqual(quand(simulee(A(22, 0))), [12, 21, 24], 'le soir : ce soir, une heure après le coucher (20:24)');
});

test('relecture du 13/10, point 9 — le faux moteur, déjà à la position demandée en pleine course, s’arrête et le dit', () => {
  const moteur = DEMO.slice(DEMO.indexOf('const moteurVolet = '), DEMO.indexOf('// La consigne d\'un `climate`'));
  assert.ok(moteur.includes("if (voulue === depart) { if (cur.state === 'opening' || cur.state === 'closing') toucher(x, depart > 0 ? 'open' : 'closed', { current_position: depart }); return; }"),
    '`set_cover_position` à la position courante : `open` / `closed`, jamais `opening` à l’arrêt');
});

/* ── Audit du 19/10 : la démo porte les cas que l'écran sait afficher ── */

const { estVolet, estMuetVolet, coverFerme, positionDe } = await import('../src/voletecran.js');

test('audit du 19/10 — un store banne, un rideau sans position, un volet muet, un volet « façon Netatmo », un garage, un portail', () => {
  const S = maisonVoletsDemo({ quand: A(15, 0) }).states;
  const vu = (id) => [S[id].state, S[id].attributes.device_class, S[id].attributes.supported_features, 'current_position' in S[id].attributes];
  assert.deepEqual(vu('cover.store_banne'), ['closed', 'awning', 15, true]);
  assert.deepEqual(vu('cover.rideau_chambre'), ['closed', 'curtain', 3, false], 'sans position : ouvrir et fermer seulement');
  assert.deepEqual(vu('cover.volet_entree').slice(0, 2), ['unavailable', 'shutter']);
  assert.ok(estMuetVolet(S['cover.volet_entree']), 'la carte le dit « Indisponible »');
  assert.deepEqual(vu('cover.volet_sdb'), ['open', 'shutter', 15, true]);
  assert.deepEqual(vu('cover.porte_garage'), ['closed', 'garage', 3, false]);
  assert.deepEqual(vu('cover.portail'), ['closed', 'gate', 3, false]);
  // Les commandes groupées (`voletsCommandables`, App.jsx) prennent les volets par leur classe : jamais le garage ni le portail.
  const groupe = Object.keys(S).filter(id => id.startsWith('cover.') && estVolet(S[id])).sort();
  assert.deepEqual(groupe, [...VOLETS, ...AUTRES].sort());
  // Rangés dans des pièces existantes, et plus aucun nom fantôme.
  for (const fantome of ["'cover.salon'", "'cover.cuisine'", "'cover.chambre'"]) assert.ok(!DEMO.includes(fantome), fantome + ' revient');
  for (const [id, zone] of [['cover.store_banne', 'salon'], ['cover.rideau_chambre', 'chambre'], ['cover.volet_entree', 'entree'],
    ['cover.porte_garage', 'entree'], ['cover.portail', 'entree'], ['cover.volet_sdb', 'sdb']]) {
    const z = DEMO.slice(DEMO.indexOf('    ' + zone + ': ['), DEMO.indexOf('],', DEMO.indexOf('    ' + zone + ': [')));
    assert.ok(z.includes("'" + id + "'"), id + ' n’est pas dans la zone ' + zone);
  }
});

test('audit du 19/10 — l’état des volets ne publie plus `prochains`, que le serveur a retiré', () => {
  const e = maisonVoletsDemo({ quand: A(15, 0) }).etat();
  assert.ok(!('prochains' in e));
  assert.ok(!DEMO.includes('prochains:'), 'la démo le rebâtit encore');
});

test('audit du 19/10 — le faux moteur : un volet muet ne bouge pas, un rideau sans position ne publie pas de position, le volet « façon Netatmo » bascule d’abord', () => {
  const moteur = DEMO.slice(DEMO.indexOf('const moteurVolet = '), DEMO.indexOf('// La consigne d\'un `climate`'));
  assert.ok(moteur.includes("if (cur.state === 'unavailable' || cur.state === 'unknown') return;"), 'un volet muet ne répond pas');
  assert.ok(moteur.includes("toucher(x, vers === 'open' ? 'opening' : 'closing');") && moteur.includes('toucher(x, vers); }, 17000));'), 'sans position : opening / closing, puis open / closed, sans position');
  const netatmo = moteur.slice(moteur.indexOf('if (VOLETS_NETATMO_DEMO.has(x)) {'), moteur.indexOf('if (voulue === depart) {'));
  assert.ok(netatmo.includes("toucher(x, voulue > 0 ? 'open' : 'closed', { current_position: depart });"), 'la bascule, la position d’avant');
  assert.ok(!netatmo.includes("'opening'") && !netatmo.includes("'closing'"), 'jamais opening ni closing');
  assert.ok(netatmo.includes("const arrivee = voulue === 0 ? 1 : voulue;") && netatmo.includes("toucher(x, 'open', { current_position: arrivee });"), 'une fermeture finit open à 1 %');
  // Ce 1 % se lit « fermé », à l'écran (seuil fixe de 2 %).
  const sdb = { state: 'open', attributes: { current_position: 1, device_class: 'shutter' } };
  assert.equal(coverFerme(sdb, positionDe(sdb)), true);
});

test('audit du 19/10 — un scénario de volets de la démo ne vise que des volets : ni le garage, ni le portail, ni un volet muet', () => {
  const corps = DEMO.slice(DEMO.indexOf('function scnCibles('), DEMO.indexOf('\n}\n', DEMO.indexOf('function scnCibles(')));
  assert.ok(corps.includes("if (a.famille === 'volets') return estVolet(states[id]) && !estMuetVolet(states[id]) &&"), corps.slice(0, 200));
});

/* La démo RECOPIE ce qu'est un volet (19/10) : l'importer de voletecran.js
 * tirait du démarrage un morceau partagé de 43 849 octets, hors de la borne de
 * lot14. La copie ne doit pas diverger de l'original. */
test('la copie de la démo dit la même chose que voletecran.js', async () => {
  const D = await import('../src/demo.js');
  const E = await import('../src/voletecran.js');
  assert.deepEqual(D.CLASSES_VOLETS_DEMO, E.CLASSES_VOLETS);
  const cas = [null, { state: 'open', attributes: {} }, { state: 'unknown', attributes: { device_class: 'shutter' } },
    { state: 'unavailable', attributes: { device_class: 'awning' } }, { state: 'open', attributes: { device_class: 'garage' } },
    { state: 'closed', attributes: { device_class: 'curtain' } }];
  for (const st of cas) {
    assert.equal(D.estVoletDemo(st), E.estVolet(st), JSON.stringify(st));
    assert.equal(D.estMuetVoletDemo(st), E.estMuetVolet(st), JSON.stringify(st));
  }
  assert.ok(!/from '\.\/voletecran\.js'/.test(readFileSync(new URL('../src/demo.js', import.meta.url), 'utf8')), 'la démo importe de nouveau voletecran.js');
});
