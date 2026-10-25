/* La fiche d'un volet : ce qui se calcule (chantier Volets, § 3.5 à 3.8, 4, 7).
 *
 * `src/voletsfiche.js` est pur et chargé avec la fiche. Ce qui est garanti
 * ici, à sec, en français (lundi 12 octobre 2026, 15:00 à la maison) :
 *  - le type tiré de la classe, « pièce · type » sous le nom ;
 *  - la phrase longue de chaque ligne du § 4, et le prochain mouvement ;
 *  - la porte devant (ouverte, fermée, muette, la règle coupée) ;
 *  - le Planning : la note, la semaine du jumeau, les jours (V5 : les jours
 *    propres remplacent ceux de la maison), les patchs — des tables
 *    ENTIÈRES — et V11 (une façade, une porte allument leur règle) ;
 *  - l'Historique : les points, la courbe en escalier, les manœuvres
 *    regroupées à 4 min sur une séquence Netatmo réelle, et qui les a faites. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
const F = await import('../src/voletsfiche.js');

const MAINTENANT = '2026-10-12T15:00:00+02:00';
const ETAT = (o = {}) => ({ maintenant: MAINTENANT, soleil_jours: [{ date: '2026-10-12', lever: '2026-10-12T07:47:00+02:00', coucher: '2026-10-12T20:24:00+02:00' }],
  config: { planning: { actif: true, mode: 'auto', ouverture: { decalage: 30 }, fermeture: { decalage: 30 }, jours: [0, 1, 2, 3, 4, 5, 6], volets: {} },
    soleil: { actif: true, temp_entite: 'sensor.temperature_exterieure', volets: {} }, baies: { actif: true, volets: {} } }, ...o });
const mvt = (sens, heure, decalage = 30) => ({ sens, heure, source: sens === 'ouverture' ? 'lever' : 'coucher', decalage });
const vol = (o = {}) => ({ regle: 'comme', a_venir: [], protection: null, abri: false, attente: null, porte: null, orientation: null, manoeuvre: null, ...o });

test('l’en-tête : le type tiré de la classe, « pièce · type » ; sans pièce, le type seul', () => {
  assert.equal(F.sousNomVolet('Cuisine', 'shutter'), 'Cuisine · volet roulant');
  assert.equal(F.sousNomVolet(null, 'shutter'), 'Volet roulant');
  assert.deepEqual(['blind', 'awning', 'curtain', 'shade', 'damper', undefined].map(F.typeVolet), ['store', 'store banne', 'rideau', 'store intérieur', 'volet', 'volet']);
  assert.equal(F.saitSePlacer({ attributes: { supported_features: 15 } }), true);
  assert.equal(F.saitSePlacer({ attributes: { supported_features: 3 } }), false, 'ouvrir, fermer, sans position : la fenêtre ne se glisse pas');
});

test('§ 4, la phrase longue : chaque ligne, en entier', () => {
  const L = (l, o = {}) => F.phraseLongue(l, { etat: ETAT(), ...o });
  assert.equal(L({ ligne: 1 }), 'Indisponible');
  assert.equal(L({ ligne: 2, sens: 'fermeture', cible: 0 }), 'En fermeture · vers 0 %');
  assert.equal(L({ ligne: 2, sens: 'ouverture', cible: 60 }), 'En ouverture · vers 60 %');
  assert.equal(L({ ligne: 3 }), 'À l’abri du vent · reste ouvert tant qu’il souffle');
  assert.equal(L({ ligne: 4, jusqua: '2026-10-12T18:30:00+02:00' }), 'Protection solaire · remonte vers 18:30');
  assert.equal(L({ ligne: 4, jusqua: null }), 'Protection solaire · remonte quand le soleil quitte la façade');
  assert.equal(L({ ligne: 5, porte: 'binary_sensor.baie_vitree' }, { nomPorte: 'Baie vitrée' }), 'Fermeture en attente · Baie vitrée est ouverte');
  assert.equal(L({ ligne: 6, mouvement: mvt('ouverture', '2026-10-13T08:17:00+02:00') }), 'Ouverture demain à 08:17 · lever du soleil +30 min');
  assert.equal(L({ ligne: 6, mouvement: mvt('fermeture', '2026-10-12T20:24:00+02:00', 0) }), 'Fermeture à 20:24 · coucher du soleil');
  assert.equal(L({ ligne: 6, mouvement: mvt('fermeture', '2026-10-12T19:54:00+02:00', -30) }), 'Fermeture à 19:54 · coucher du soleil −30 min', 'le vrai signe moins');
  assert.equal(L({ ligne: 7 }), 'Manuel · ne suit pas le soleil');
  assert.equal(L({ ligne: 8 }, { pos: 60 }), 'Ouvert à 60 %');
});

test('la rangée « Prochain mouvement » : la protection, le mouvement utile, le prochain prévu, sinon rien', () => {
  assert.deepEqual(F.prochainFiche({ v: vol({ protection: { jusqu_a: '2026-10-12T18:30:00+02:00', position: 30, orientation: 270 } }), etat: ETAT() }),
    { valeur: 'Vers 18:30', sous: 'Remontée · le soleil quitte la façade' });
  assert.deepEqual(F.prochainFiche({ v: vol({ a_venir: [mvt('fermeture', '2026-10-12T20:54:00+02:00')] }), etat: ETAT() }),
    { valeur: '20:54', sous: 'Fermeture · coucher du soleil +30 min' });
  assert.equal(F.prochainFiche({ v: vol({ a_venir: [mvt('ouverture', '2026-10-13T08:17:00+02:00')] }), etat: ETAT() }).valeur, 'Demain 08:17');
  assert.equal(F.prochainFiche({ v: vol({ a_venir: [mvt('ouverture', '2026-10-19T08:26:00+02:00')] }), etat: ETAT() }).valeur, 'Lun. 08:26');
  // Sa chambre, fermée : la fermeture du soir part quand même — la rangée la dit.
  assert.equal(F.prochainFiche({ v: vol({ regle: 'perso', a_venir: [mvt('fermeture', '2026-10-12T20:54:00+02:00')] }), etat: ETAT(), ferme: true }).valeur, '20:54');
  assert.deepEqual(F.prochainFiche({ v: vol({ regle: 'jamais' }), etat: ETAT() }), { valeur: 'Aucun', sous: 'Ce volet ne suit pas le soleil' });
  assert.deepEqual(F.prochainFiche({ v: vol(), etat: ETAT({ soleil_jours: [] }) }), { valeur: '—', sous: null }, 'sans heures du soleil, on ne sait pas');
});

test('la rangée « Porte devant » : ouverte avant une fermeture, fermée, muette, la règle coupée', () => {
  const ferme = mvt('fermeture', '2026-10-12T20:54:00+02:00');
  assert.deepEqual(F.porteFiche({ entite: 'binary_sensor.baie_vitree', etat: 'ouverte' }, 'Baie vitrée', { prochain: ferme, ref: MAINTENANT }),
    { valeur: 'Baie vitrée · ouverte', couleur: 'var(--o-warn)', sous: 'Si elle l’est encore à 20:54, la fermeture attendra.' });
  assert.equal(F.porteFiche({ entite: 'x', etat: 'ouverte' }, 'Baie vitrée', { prochain: mvt('ouverture', '2026-10-13T08:17:00+02:00') }).sous, 'Le volet ne ferme pas sur une porte ouverte.');
  assert.deepEqual(F.porteFiche({ entite: 'x', etat: 'fermee' }, 'Baie vitrée', {}), { valeur: 'Baie vitrée · fermée', couleur: 'var(--o-ok)', sous: 'Le volet ne ferme pas sur une porte ouverte.' });
  assert.deepEqual(F.porteFiche({ entite: 'x', etat: 'muette' }, 'Baie vitrée', {}), { valeur: 'Baie vitrée · muette', couleur: 'var(--o-text3)', sous: 'Un capteur muet ne retient rien : le volet fermera.' });
  assert.equal(F.porteFiche({ entite: 'x', etat: 'ouverte' }, 'Baie vitrée', { regleActive: false }).sous, 'Coupée pour toute la maison', 'la porte reste dite, la règle coupée aussi (§ 6.1)');
  assert.equal(F.porteFiche(null, 'x', {}), null);
});

test('le Planning : la note de chaque cas, dans cet ordre', () => {
  const plan = ETAT().config.planning;
  assert.equal(F.notePlanning(plan, 'comme'), 'Ouvre au lever du soleil +30 min et ferme au coucher +30 min, comme les autres volets.');
  assert.equal(F.notePlanning({ ...plan, ouverture: { decalage: 0 }, fermeture: { decalage: 0 } }, 'comme'), 'Ouvre au lever du soleil et ferme au coucher, comme les autres volets.');
  assert.equal(F.notePlanning(plan, 'perso'), 'Ses propres heures et ses propres jours, réglés plus bas.');
  assert.equal(F.notePlanning(plan, 'jamais'), 'Ce volet ne bouge qu’à la main, ou par la protection solaire et le vent fort.');
  assert.equal(F.notePlanning({ ...plan, mode: 'manuel' }, 'perso'), 'Le mode de la maison est sur Manuel : aucun volet ne bouge seul.');
  assert.equal(F.notePlanning({ ...plan, actif: false }, 'jamais'), 'Le lever et le coucher sont coupés pour toute la maison.');
});

test('la semaine : le segment de l’ouverture à la fermeture, « Reste fermé », « … », « — »', () => {
  const lignes = F.lignesSemaine([
    { date: '2026-10-12', ouverture: '07:47', fermeture: '20:24' },
    { date: '2026-10-13', ouverture: '07:48', fermeture: null },
    { date: '2026-10-14', ouverture: null, fermeture: '20:21' },
  ], false);
  assert.equal(lignes[0].heures, '07:47 – 20:24');
  assert.ok(Math.abs(lignes[0].gauche - 467 / 1440 * 100) < 1e-9 && Math.abs(lignes[0].largeur - (1224 - 467) / 1440 * 100) < 1e-9);
  assert.equal(lignes[1].heures, '07:48 – …');
  assert.ok(Math.abs(lignes[1].gauche + lignes[1].largeur - 100) < 1e-9, 'sans fermeture, jusqu’à 24 h');
  assert.deepEqual([lignes[2].heures, lignes[2].gauche], ['Reste fermé', null]);
  assert.deepEqual(F.lignesSemaine([{ date: '2026-10-12', ouverture: '07:47', fermeture: '20:24' }], true)[0], { date: '2026-10-12', gauche: null, largeur: null, heures: '—' });
  assert.equal(F.lundiDe('2026-10-14T10:00:00+02:00'), '2026-10-12');
  assert.equal(F.lundiDe('2026-10-18T23:59:00+02:00'), '2026-10-12', 'le dimanche finit la semaine');
  assert.equal(F.lundiDe(null), null);
});

test('les jours d’un sens (V5) : les jours propres remplacent ceux de la maison ; sans eux, ceux de la maison', () => {
  const plan = { actif: true, jours: [0, 1, 2, 3, 4], volets: { 'cover.chambre': { perso: true, jours_ouverture: [0, 2, 5] } } };
  const on = (l) => l.filter(x => x.on).map(x => x.jour);
  assert.deepEqual(on(F.joursDuSens(plan, 'cover.chambre', 'ouverture')), [0, 2, 5], 'le samedi est coché pour lui : il s’ouvrira, la maison non');
  assert.equal(F.joursDuSens(plan, 'cover.chambre', 'ouverture').some(x => 'inerte' in x), false, 'aucune puce inerte');
  assert.deepEqual(on(F.joursDuSens(plan, 'cover.chambre', 'fermeture')), [0, 1, 2, 3, 4], 'sans jours propres : ceux de la maison');
  /* ASSERTION RETIRÉE (19/10) : la règle d'avant V5, où les jours propres RESTREIGNAIENT ceux de la maison
   * (`'restreignent'`, `JOURS_PROPRES`), était du code mort — partie, avec « La maison ne bouge pas ce jour-là ». */
  assert.equal(F.JOURS_PROPRES, undefined, 'plus de second régime');
  // Sa chambre : une liste propre VIDE, jamais dans ce sens.
  assert.deepEqual(on(F.joursDuSens({ volets: { c: { perso: true, jours_ouverture: [] } } }, 'c', 'ouverture')), []);
});

/* TITRE MODIFIÉ (relecture des tâches 6 à 12, point 8) : il promettait des tables « relues sur la
 * configuration affichée », et ne lisait que les patchs. Ce qu'il tient : chaque patch porte sa table
 * ENTIÈRE, bâtie sur la configuration qu'on lui donne. La relecture, et les patchs comptés, sont à la
 * fin du fichier (« les écritures d’une fiche… », `fileEcritures`). */
// ASSERTIONS MODIFIÉES (25/10, fusion volet par volet) : un patch ne porte plus que SON volet ; le serveur fusionne, `null` retire.
test('écrire : chaque patch ne porte que son volet, bâti sur la configuration qu’on lui donne', () => {
  const plan = { actif: true, jours: [0, 1, 2, 3, 4, 5, 6], ouverture: { decalage: 30 }, fermeture: { decalage: 30 },
    volets: { 'cover.salon': { ouverture: 30, fermeture: 30 }, 'cover.chambre': { perso: true, ouverture: null, fermeture: 30, jours_ouverture: [] } } };
  assert.deepEqual(F.patchRegle(plan, 'cover.salon', 'comme'), { planning: { volets: { 'cover.salon': null } } }, 'ce volet seulement : le serveur fusionne, null le retire');
  assert.deepEqual(F.patchRegle(plan, 'cover.cuisine', 'perso').planning.volets['cover.cuisine'], { perso: true, ouverture: null, fermeture: null });
  assert.deepEqual(F.patchRegle(plan, 'cover.salon', 'perso').planning.volets['cover.salon'], { ouverture: 30, fermeture: 30, perso: true }, 'l’ancienne forme garde ses décalages');
  assert.deepEqual(F.patchRegle(plan, 'cover.salon', 'jamais').planning.volets['cover.salon'], { exclu: true });
  // ± 15 min ; vide, le décalage de la maison sert de départ ; de −120 à +240.
  assert.equal(F.patchDecalage(plan, 'cover.chambre', 'ouverture', 1).planning.volets['cover.chambre'].ouverture, 45);
  assert.equal(F.patchDecalage(plan, 'cover.chambre', 'fermeture', -1).planning.volets['cover.chambre'].fermeture, 15);
  assert.equal(F.patchDecalage({ ...plan, volets: { c: { perso: true, ouverture: 240 } } }, 'c', 'ouverture', 1).planning.volets.c.ouverture, 240);
  assert.equal(F.patchDecalage({ ...plan, volets: { c: { perso: true, ouverture: -120 } } }, 'c', 'ouverture', -1).planning.volets.c.ouverture, -120);
  // Un jour décoché ; recoché, la liste redevient celle de la maison et s'efface.
  const sans = F.patchJour(plan, 'cover.salon', 'fermeture', 5);
  assert.deepEqual(sans.planning.volets['cover.salon'].jours_fermeture, [0, 1, 2, 3, 4, 6]);
  const avec = F.patchJour(sans.planning, 'cover.salon', 'fermeture', 5);
  assert.equal(avec.planning.volets['cover.salon'].jours_fermeture, null);
  assert.deepEqual(F.patchMode('nuit'), { planning: { mode: 'nuit' } });
});

test('V11 : choisir une façade allume la protection, une porte « Volet bloqué » ; « Aucune » n’éteint rien', () => {
  const config = { soleil: { actif: false, volets: { 'cover.salon': { orientation: 225, ouverture: 80 } } }, baies: { actif: false, volets: { 'cover.salon': 'binary_sensor.baie_vitree' } } };
  assert.deepEqual(F.patchFacade(config, 'cover.bureau', 270), { soleil: { volets: { 'cover.bureau': { orientation: 270, ouverture: 90 } }, actif: true } });
  assert.deepEqual(F.patchFacade(config, 'cover.salon', 180).soleil.volets['cover.salon'], { orientation: 180, ouverture: 80 }, 'son ouverture reste');
  assert.deepEqual(F.patchFacade(config, 'cover.salon', null), { soleil: { volets: { 'cover.salon': null } } }, 'Aucune : rien ne s’allume, rien ne s’éteint');
  assert.deepEqual(F.patchPorte(config, 'cover.bureau', 'binary_sensor.porte'), { baies: { volets: { 'cover.bureau': 'binary_sensor.porte' }, actif: true } });
  assert.deepEqual(F.patchPorte(config, 'cover.salon', null), { baies: { volets: { 'cover.salon': null } } });
  assert.equal(F.facadeDe(225).facade, 'Façade sud-ouest');
  assert.equal(F.facadeDe(232).nom, 'Sud-ouest', 'la plus proche');
  assert.equal(F.facadeDe(null), null);
  assert.equal(F.avertissementSoleil({ soleil: { actif: false } }, 270), 'Coupée pour toute la maison');
  assert.equal(F.avertissementSoleil({ soleil: { actif: true, temp_entite: '' } }, 270), 'Choisissez le thermomètre du dehors dans Paramètres');
  assert.equal(F.avertissementSoleil({ soleil: { actif: false } }, null), null);
  // La fusion locale, miroir du serveur : une section reçoit le patch ; sa table `volets` se fusionne volet par volet, `null` retire.
  assert.deepEqual(F.fusionConfig({ soleil: { actif: false, position: 30, volets: { a: 1, b: 2 } } }, { soleil: { volets: { a: 3 }, actif: true } }),
    { soleil: { actif: true, position: 30, volets: { a: 3, b: 2 } } });
  assert.deepEqual(F.fusionConfig({ baies: { volets: { a: 'x', b: 'y' } } }, { baies: { volets: { a: null } } }), { baies: { volets: { b: 'y' } } });
});

test('les portes proposées : celles de sa pièce d’abord, puis « Autres capteurs », puis « Aucune »', () => {
  const S = { 'binary_sensor.baie_vitree': { state: 'on', attributes: { device_class: 'door', friendly_name: 'Baie vitrée' } },
    'binary_sensor.fenetre_salon': { state: 'off', attributes: { device_class: 'window', friendly_name: 'Fenêtre salon' } },
    'binary_sensor.porte_entree': { state: 'off', attributes: { device_class: 'door', friendly_name: 'Porte d’entrée' } },
    'binary_sensor.mouvement': { state: 'off', attributes: { device_class: 'motion', friendly_name: 'Mouvement' } } };
  const piece = { 'binary_sensor.baie_vitree': 'Salon', 'binary_sensor.fenetre_salon': 'Salon', 'binary_sensor.porte_entree': 'Entrée' };
  assert.deepEqual(F.optionsPortes(S, 'Salon', (id) => piece[id] || null).map(o => [o.id, o.groupe || null]), [
    ['binary_sensor.baie_vitree', 'Salon'], ['binary_sensor.fenetre_salon', 'Salon'], ['binary_sensor.porte_entree', 'Autres capteurs'], ['', null]]);
});

/* ── L'Historique ── */
const T = (hm, jour = '2026-10-12') => Date.parse(jour + 'T' + hm + '+02:00');
const e = (state, position, hm, jour) => ({ state, attributes: position == null ? {} : { current_position: position }, last_updated: new Date(T(hm, jour)).toISOString(), last_changed: new Date(T(hm, jour)).toISOString() });

test('les points : last_updated, unavailable ignoré, l’état vivant en dernier', () => {
  const p = F.pointsHistorique([e('open', 100, '08:00'), e('unavailable', null, '09:00'), { ...e('open', 60, '10:00'), last_changed: new Date(T('08:00')).toISOString() }], e('open', 60, '15:00'));
  assert.deepEqual(p.map(x => [x.t, x.pos]), [[T('08:00'), 100], [T('10:00'), 60], [T('15:00'), 60]], 'une position qui bouge sans changer d’état garde son instant');
  assert.deepEqual(F.pointsHistorique([e('closed', null, '07:00')]).map(x => x.pos), [0], 'sans position : closed vaut 0');
});

test('la courbe en escalier, du bord gauche à « maintenant »', () => {
  const debut = T('15:00', '2026-10-11'), fin = T('15:00');
  const c = F.courbeVolet([{ t: T('08:00', '2026-10-11'), pos: 100 }, { t: T('21:00', '2026-10-11'), pos: 0 }, { t: T('09:00'), pos: 100 }], debut, fin);
  assert.equal(c.ligne, 'M0.0 0.0H100.0V100.0H300.0V0.0H400');
  assert.equal(c.aire, c.ligne + 'V100H0.0Z');
  assert.equal(F.courbeVolet([], debut, fin), null);
});

test('les manœuvres : une séquence Netatmo réelle fait UNE manœuvre, à l’heure de son premier changement', () => {
  assert.deepEqual([F.REGROUPEMENT_MS, F.AVANT_MS, F.APRES_MS], [240000, 180000, 60000], 'les fenêtres du § 7 : 4 min, −180 s, +60 s');
  // 09/10, sa chambre : `closed 100` à 19:29:08, puis la position, `open 1`, à 19:30:01.
  const pts = F.pointsHistorique([e('open', 100, '08:30', '2026-10-09'), { ...e('closed', 100, '19:29:08', '2026-10-09') }, e('open', 1, '19:30:01', '2026-10-09')]);
  const m = F.manoeuvres(pts, { id: 'cover.volet_chambre' });
  assert.equal(m.length, 1);
  assert.deepEqual([m[0].t, m[0].pos, m[0].quoi, m[0].qui], [T('19:29:08', '2026-10-09'), 1, 'Fermé', null], 'sans journal, on ne dit pas qui');
  // 12/10 : `open 0` à 08:30:34 (la bascule), puis `open 100` à 08:33:05.
  const matin = F.pointsHistorique([e('closed', 0, '06:00'), e('open', 0, '08:30:34'), e('open', 100, '08:33:05')]);
  assert.deepEqual(F.manoeuvres(matin, { id: 'v' }).map(x => [x.t, x.quoi]), [[T('08:30:34'), 'Ouvert']]);
  // Un groupe qui revient à la position d'avant n'est pas une manœuvre ; au-delà de 4 min, deux manœuvres.
  const aller = F.pointsHistorique([e('open', 100, '10:00'), e('open', 50, '10:01'), e('open', 100, '10:03')]);
  assert.deepEqual(F.manoeuvres(aller, { id: 'v' }), []);
  const deux = F.pointsHistorique([e('open', 100, '10:00'), e('open', 50, '10:01'), e('open', 30, '10:06')]);
  assert.deepEqual(F.manoeuvres(deux, { id: 'v' }).map(x => x.quoi), ['Mis à 30 %', 'Mis à 50 %'], 'de la plus récente à la plus ancienne');
});

test('qui : la ligne du journal de −180 s à +60 s ; sinon « À la main » si le journal couvre l’heure ; sinon rien', () => {
  const pts = F.pointsHistorique([e('open', 100, '06:00'), e('closed', 100, '20:54:30'), e('open', 1, '20:56:00')]);
  const ts = (hm) => T(hm) / 1000;
  const planning = { module: 'volets', regle: 'planning', quoi: 'fermer', cibles: ['cover.volet_chambre'], n: 1, simule: false, ts: ts('20:54:00'), cible: 0 };
  const [avec] = F.manoeuvres(pts, { id: 'cover.volet_chambre', journal: [planning], couvreDepuis: ts('00:00') });
  assert.deepEqual([avec.qui.mot, avec.qui.glyphe, avec.t], ['Soleil', 'sunset', T('20:54:00')], 'l’heure affichée est celle de la ligne');
  const [main] = F.manoeuvres(pts, { id: 'cover.volet_chambre', journal: [], couvreDepuis: ts('00:00') });
  assert.deepEqual([main.qui.mot, main.qui.glyphe, main.qui.sous], ['À la main', 'hand', 'à la main']);
  const [inconnu] = F.manoeuvres(pts, { id: 'cover.volet_chambre', journal: [], couvreDepuis: ts('21:00') });
  assert.equal(inconnu.qui, null, 'le journal ne couvre plus cette heure : pas de pastille');
  const [simulee] = F.manoeuvres(pts, { id: 'cover.volet_chambre', journal: [{ ...planning, simule: true }], couvreDepuis: ts('00:00') });
  assert.equal(simulee.qui.mot, 'À la main', 'une ligne simulée n’a rien commandé');
  const [loin] = F.manoeuvres(pts, { id: 'cover.volet_chambre', journal: [{ ...planning, ts: ts('20:50:00') }], couvreDepuis: ts('00:00') });
  assert.equal(loin.qui.mot, 'À la main', '270 s avant : hors de la fenêtre');
});

test('qui, et pourquoi : soleil, protection (façade et dehors), vent, alerte, scénario, rattrapage', () => {
  const q = (l, o) => F.quiDeLigne({ cibles: ['v'], n: 1, ...l }, o);
  assert.deepEqual([q({ module: 'volets', regle: 'planning', quoi: 'ouvrir' }).glyphe, q({ module: 'volets', regle: 'planning', quoi: 'fermer' }).glyphe], ['sunrise', 'sunset']);
  assert.deepEqual(q({ module: 'volets', regle: 'soleil', quoi: 'proteger', orientation: 270, dehors: 26 }), { mot: 'Protection solaire', sous: 'protection solaire', glyphe: 'sun', motif: 'Soleil sur la façade ouest, 26° dehors' });
  assert.equal(q({ module: 'volets', regle: 'soleil', quoi: 'proteger', orientation: 225, dehors: null }).motif, 'Soleil sur la façade sud-ouest');
  assert.equal(q({ module: 'volets', regle: 'soleil', quoi: 'proteger' }).motif, null, 'une ancienne ligne : « Fermé », rien de plus (§ 6.4)');
  assert.equal(q({ module: 'volets', regle: 'soleil', quoi: 'rouvrir' }).motif, 'Le soleil a quitté la façade');
  assert.deepEqual(q({ module: 'volets', regle: 'vent', quoi: 'ouvrir', g: { motif: [['vent {v}', { v: 62 }]] } }), { mot: 'Vent fort', sous: 'vent fort', glyphe: 'wind', motif: 'Vent à 62' });
  /* ASSERTION MODIFIÉE (tâche 12 bis) : le nom vient de Home Assistant, son article est inconnu —
   * « Après la fermeture de Baie vitrée » se lisait mal ; la tournure est neutre. */
  assert.equal(q({ module: 'volets', regle: 'rattrapage', quoi: 'fermer', motif: 'baie refermee' }, { porte: 'binary_sensor.baie_vitree', nomPorte: () => 'Baie vitrée' }).motif, 'Après fermeture : Baie vitrée');
  assert.equal(q({ module: 'volets', regle: 'rattrapage', quoi: 'ouvrir', motif: 'volet revenu' }).motif, 'Le volet est revenu');
  assert.deepEqual([q({ module: 'alertes', regle: 'danger', quoi: 'fermer' }).glyphe, q({ module: 'scenarios', regle: 'nuit', quoi: 'Nuit' }).motif], ['triangle-warning', 'Nuit']);
  assert.equal(q({ module: 'interrupteurs', regle: 'Variateur', quoi: 'bouton' }).mot, 'À la main', 'V6 : ce que Loggia n’a pas commandé');
});

test('l’heure d’une manœuvre, à la maison : « 17:40 », « Hier 22:10 », « Ven. 15:00 » ; le compte', () => {
  const fuseau = 'Europe/Paris';
  const ici = T('15:00');
  assert.equal(F.heureManoeuvre(T('09:05'), ici, fuseau), '09:05');
  assert.equal(F.heureManoeuvre(T('22:10', '2026-10-11'), ici, fuseau), 'Hier 22:10');
  assert.equal(F.heureManoeuvre(T('15:00', '2026-10-09'), ici, fuseau), 'Ven. 15:00');
  assert.equal(F.heureManoeuvre(T('00:30'), T('23:30', '2026-10-11'), 'UTC'), '22:30', 'le fuseau de la maison, pas celui du navigateur');
  assert.equal(F.compteManoeuvres(5, '24h'), '5 sur 24 h');
  assert.equal(F.compteManoeuvres(3, '7j'), '3 sur 7 jours');
  assert.equal(F.compteManoeuvres(23, '7j'), '8 sur 23');
});

/* ── Tâche 12 bis : les finitions des relectures (13/10) ── */

test('relecture des tâches 6 à 12, point 4 — sans bascule, la ligne se cherche jusqu’à 360 s avant ; « À la main » seulement si le journal couvre la fenêtre utilisée', () => {
  const ts = (hm) => T(hm) / 1000;
  /* Le bureau : la protection le descend à 30 % à 13:05:00 ; Netatmo publie la position 185 s
   * après, SANS changer l'état (`open 100` → `open 30`) — le groupe date de 13:08:05. */
  const pts = F.pointsHistorique([e('open', 100, '08:30'), e('open', 30, '13:08:05')]);
  const proteger = { module: 'volets', regle: 'soleil', quoi: 'proteger', cibles: ['cover.volet_bureau'], n: 1, simule: false, ts: ts('13:05:00'), cible: 30, orientation: 270, dehors: 26 };
  const [m] = F.manoeuvres(pts, { id: 'cover.volet_bureau', journal: [proteger], couvreDepuis: ts('00:00') });
  assert.deepEqual([m.qui.mot, m.t], ['Protection solaire', T('13:05:00')], '185 s avant, sans bascule : c’est elle, à son heure');
  const [loin] = F.manoeuvres(pts, { id: 'cover.volet_bureau', journal: [{ ...proteger, ts: ts('13:02:00') }], couvreDepuis: ts('00:00') });
  assert.equal(loin.qui.mot, 'À la main', '365 s avant : hors de la fenêtre, même élargie');
  // Le journal couvre depuis 13:03:00 ; la fenêtre utilisée part de 13:02:05 : on ne sait pas.
  assert.equal(F.manoeuvres(pts, { id: 'cover.volet_bureau', journal: [], couvreDepuis: ts('13:03:00') })[0].qui, null);
  assert.equal(F.manoeuvres(pts, { id: 'cover.volet_bureau', journal: [], couvreDepuis: ts('13:02:05') })[0].qui.mot, 'À la main');
  // Une bascule date le groupe de l'ordre : la fenêtre reste de 180 s, la couverture se juge sur elle.
  const bascule = F.pointsHistorique([e('open', 100, '06:00'), e('closed', 100, '20:54:30'), e('open', 1, '20:56:00')]);
  assert.equal(F.manoeuvres(bascule, { id: 'v', journal: [], couvreDepuis: ts('20:52:00') })[0].qui, null, 'la fenêtre part de 20:51:30');
  assert.equal(F.manoeuvres(bascule, { id: 'v', journal: [], couvreDepuis: ts('20:51:30') })[0].qui.mot, 'À la main');
  assert.equal(F.AVANT_SANS_BASCULE_MS, 360000, 'la fenêtre élargie : 360 s');
});

test('relecture des tâches 6 à 12, point 4 — une ligne du journal ne fait qu’une manœuvre (la fenêtre élargie n’en vole pas une autre)', () => {
  /* Sa chambre : la fermeture du soir (ligne de 20:54, bascule à 20:54:30, position à 20:56) ; puis,
   * rouverte à la main, la position arrive SANS bascule à 21:00 : la ligne de 20:54 est dans ses
   * 360 s, mais elle a déjà fait la fermeture. Non-régression : vert avant le correctif. */
  const ts = (hm) => T(hm) / 1000;
  const pts = F.pointsHistorique([e('open', 100, '06:00'), e('closed', 100, '20:54:30'), e('open', 1, '20:56:00'), e('open', 100, '21:00:00')]);
  const fermer = { module: 'volets', regle: 'planning', quoi: 'fermer', cibles: ['cover.volet_chambre'], n: 1, simule: false, ts: ts('20:54:00'), cible: 0 };
  const [main, soir] = F.manoeuvres(pts, { id: 'cover.volet_chambre', journal: [fermer], couvreDepuis: ts('00:00') });
  assert.deepEqual([soir.quoi, soir.qui.mot], ['Fermé', 'Soleil']);
  assert.deepEqual([main.quoi, main.qui.mot], ['Ouvert', 'À la main']);
});

test('relecture des tâches 6 à 12, point 7 — en « Fermeture nuit », la note le dit (un volet « Jamais » garde la sienne)', () => {
  const plan = { ...ETAT().config.planning, mode: 'nuit' };
  const nuit = 'Le mode de la maison est sur Fermeture nuit : il ferme le soir et laisse fermé le matin.';
  assert.equal(F.notePlanning(plan, 'comme'), nuit, 'plus « Ouvre au lever du soleil… »');
  assert.equal(F.notePlanning(plan, 'perso'), nuit, 'ses heures d’ouverture ne servent pas en Fermeture nuit');
  assert.equal(F.notePlanning(plan, 'jamais'), 'Ce volet ne bouge qu’à la main, ou par la protection solaire et le vent fort.', 'il ne ferme pas le soir');
  assert.equal(F.notePlanning({ ...plan, actif: false }, 'comme'), 'Le lever et le coucher sont coupés pour toute la maison.');
});

test('relecture des tâches 6 à 12, points 2 et 8 — les écritures d’une fiche : une relecture avant la première d’une série, chaque patch sur la réponse de la précédente, jamais deux en vol ; les patchs comptés', async () => {
  const lus = [], partis = [];
  let enVol = 0, auPlus = 0;
  // Ce qu'un AUTRE appareil vient d'écrire, que le dernier sondage n'a pas vu.
  let serveur = { planning: { actif: true, volets: { 'cover.autre': { exclu: true } } } };
  const relire = async () => { lus.push(serveur); return serveur; };
  const repondre = (patch, ok) => new Promise((fin) => {
    enVol += 1; auPlus = Math.max(auPlus, enVol); partis.push(patch);
    setTimeout(() => { enVol -= 1; if (!ok) { fin(null); return; } serveur = F.fusionConfig(serveur, patch); fin({ config: serveur }); }, 5);
  });
  const envoyer = (patch) => repondre(patch, true);
  const ecrire = F.fileEcritures(relire);
  const plus = (c) => F.patchDecalage(c.planning, 'cover.chambre', 'ouverture', 1);
  const r = await Promise.all([ecrire(plus, envoyer), ecrire(plus, envoyer), ecrire(plus, envoyer)]);
  assert.equal(lus.length, 1, 'une seule relecture, avant la première écriture de la série');
  assert.equal(partis.length, 3, 'trois patchs envoyés, pas un de plus');
  assert.equal(auPlus, 1, 'jamais deux écritures en vol');
  assert.deepEqual(partis.map(p => p.planning.volets['cover.chambre'].ouverture), [15, 30, 45], 'chacun bâti sur la réponse de la précédente');
  // ASSERTION MODIFIÉE (25/10, fusion volet par volet) : chaque patch ne porte que son volet ; c'est la fusion du serveur qui garde l'autre appareil.
  assert.ok(partis.every(p => Object.keys(p.planning.volets).join() === 'cover.chambre'), 'chaque patch ne porte que son volet');
  assert.ok(serveur.planning.volets['cover.autre'] && serveur.planning.volets['cover.autre'].exclu, 'la fusion du serveur garde le réglage de l’autre appareil');
  assert.equal(r[2].config.planning.volets['cover.chambre'].ouverture, 45, 'chacun rend la réponse du serveur');
  // La série finie, la suivante relit.
  await ecrire(plus, envoyer);
  assert.deepEqual([lus.length, partis.length], [2, 4]);
  // Une écriture refusée : rien n'en entre dans la table, et la suivante relit avant de bâtir.
  let refus = true;
  const parfois = (patch) => { const ok = !refus; refus = false; return repondre(patch, ok); };
  const avant = serveur.planning.volets['cover.chambre'].ouverture;
  const [non, oui] = await Promise.all([ecrire(plus, parfois), ecrire(plus, parfois)]);
  assert.equal(non, null);
  assert.equal(oui.config.planning.volets['cover.chambre'].ouverture, avant + 15, 'bâtie sur la relecture, pas sur le patch refusé');
  assert.deepEqual([lus.length, partis.length, auPlus], [4, 6, 1], 'une relecture avant la série, une après le refus');
  // Un geste qui n'a rien à écrire n'envoie rien.
  assert.equal(await ecrire(() => null, envoyer), null);
  assert.equal(partis.length, 6);
});

test('relecture des tâches 6 à 12, point 1 — une rafale du clavier finit après 500 ms sans touche', () => {
  assert.equal(F.RAFALE_MS, 500);
});
