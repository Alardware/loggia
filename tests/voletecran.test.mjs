/* Ce que l'écran dit d'un volet (chantier Volets, § 3.1, 4, V3, V12).
 *
 * `src/voletecran.js` est pur et dans le paquet de démarrage : le verdict
 * Fermé / Ouvert au seuil FIXE de 2 % (V12, sa demande du 12/10), ce qu'est un
 * volet (sa classe, V3), et la phrase de la carte — chaque ligne du tableau
 * du § 4, dans son ordre, et le mouvement « utile ».
 *
 * Les heures sont écrites comme le serveur les écrit (§ 6.1) : des instants à
 * l'heure de la maison. Lundi 12 octobre 2026, 15:00 à la maison. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// La langue AVANT l'import : i18n et les dates la lisent au chargement.
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
const V = await import('../src/voletecran.js');
const lire = (...p) => readFileSync(new URL('../' + p.join('/'), import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const MAINTENANT = '2026-10-12T15:00:00+02:00';
const st = (state, position, extra = {}) => ({ state, attributes: { device_class: 'shutter', supported_features: 15,
  ...(position == null ? {} : { current_position: position }), ...extra }, last_updated: MAINTENANT, last_changed: MAINTENANT });
const SOLEIL = [{ date: '2026-10-12', lever: '2026-10-12T07:47:00+02:00', coucher: '2026-10-12T20:24:00+02:00' }];
const etat = (o = {}) => ({ maintenant: MAINTENANT, soleil_jours: SOLEIL,
  config: { planning: { actif: true, mode: 'auto', ouverture: { decalage: 30 }, fermeture: { decalage: 30 }, jours: [0, 1, 2, 3, 4, 5, 6], volets: {} } }, ...o });
const mvt = (sens, heure) => ({ sens, heure, source: sens === 'ouverture' ? 'lever' : 'coucher', decalage: 30 });
const vol = (o = {}) => ({ regle: 'comme', a_venir: [], protection: null, abri: false, attente: null, porte: null, orientation: null, manoeuvre: null, ...o });
const phrase = (s, v, e = etat(), course = null) => V.vueVolet({ st: s, v, etat: e, course }).phrase;

test('V12 : le seuil est FIXE, à 2 % — aux deux bouts, et l’état publié « closed » fait foi', () => {
  assert.equal(V.SEUIL_FERME, 2);
  assert.equal(V.coverFerme(st('open', 1), 1), true, 'sa chambre bute à 1 % : fermée');
  assert.equal(V.coverFerme(st('open', 2), 2), true);
  assert.equal(V.coverFerme(st('open', 3), 3), false);
  assert.equal(V.coverFerme(st('closed', 100), 100), true, 'Home Assistant dit closed : fermé, quelle que soit la position');
  assert.equal(V.coverFerme(st('open', 100), 100), false);
  assert.equal(V.coverFerme(null, 0), true, 'sans état, la position seule tranche');
  assert.equal(V.coverOuvert(98), true, '98 % : « Ouvert », la même butée à l’envers');
  assert.equal(V.coverOuvert(97), false);
});

test('V12 : la clé loggia_coverseuil n’est plus lue, le réglage a quitté Paramètres', () => {
  for (const f of ['src/voletecran.js', 'src/App.jsx', 'src/views/volets.jsx', 'src/views/parametres.jsx']) {
    assert.ok(!/cfgVal\('loggia_coverseuil'|loggia_coverseuil:/.test(lire(f)), f + ' lit ou écrit encore le seuil réglable');
  }
  assert.ok(!lire('src/views/volets.jsx').includes('VoletsAffichage'), 'le réglage « Considérer fermé en dessous de » est revenu');
  assert.ok(!lire('src/views/parametres.jsx').includes('VoletsAffichage'), 'Paramètres rend encore le réglage du seuil');
  assert.ok(!lire('src/App.jsx').includes('function coverSeuil('), 'le seuil réglable est revenu dans App.jsx');
});

test('V3 : un volet se reconnaît à sa classe — ni garage, ni portail, ni fenêtre de toit, ni sans classe', () => {
  for (const c of ['shutter', 'blind', 'shade', 'curtain', 'awning']) assert.equal(V.estVolet({ state: 'open', attributes: { device_class: c } }), true, c);
  for (const c of ['garage', 'gate', 'door', 'window', 'damper', undefined]) assert.equal(V.estVolet({ state: 'open', attributes: { device_class: c } }), false, String(c));
  assert.equal(V.estVolet(null), false);
});

test('la position publiée : current_position, sinon les deux bouts ; muet, rien', () => {
  assert.equal(V.positionDe(st('open', 60)), 60);
  assert.equal(V.positionDe(st('open', 60.4)), 60);
  assert.equal(V.positionDe(st('open', null)), 100);
  assert.equal(V.positionDe(st('closed', null)), 0);
  assert.equal(V.positionDe(st('opening', null)), null);
  for (const s of ['unavailable', 'unknown']) assert.equal(V.positionDe(st(s, 40)), null, s);
  assert.equal(V.positionDe(null), null);
});

test('§ 4, ligne 1 : muet — « Indisponible », même en pleine course', () => {
  const c = { pos: 40, enCourse: true, sens: 'fermeture', cible: 0 };
  for (const s of [st('unavailable', 40), st('unknown', null), null]) {
    assert.equal(V.estMuetVolet(s), true);
    const vue = V.vueVolet({ st: s, v: vol({ abri: true }), etat: etat(), course: c });
    assert.equal(vue.phrase, 'Indisponible');
    assert.equal(vue.pos, null, 'le chiffre devient « — »');
    assert.equal(vue.peutMonter || vue.peutDescendre, false, 'les trois boutons sont inertes');
    assert.equal(vue.allume, false);
  }
});

test('§ 4, ligne 2 : une course — « En ouverture », « En fermeture », avant tout le reste', () => {
  const v = vol({ abri: true, protection: { jusqu_a: null, position: 30, orientation: 270 } });
  assert.equal(phrase(st('open', 60), v, etat(), { pos: 70, enCourse: true, sens: 'ouverture', cible: 100 }), 'En ouverture');
  assert.equal(phrase(st('open', 60), v, etat(), { pos: 50, enCourse: true, sens: 'fermeture', cible: 0 }), 'En fermeture');
  // Arrivée, la cible tient : ce n'est plus une course.
  assert.equal(phrase(st('open', 60), vol({ a_venir: [mvt('fermeture', '2026-10-12T20:54:00+02:00')] }), etat(), { pos: 0, enCourse: false, sens: null, cible: 0 }), 'Fermé');
});

test('§ 4, lignes 3 à 5 : l’abri, la protection, l’attente d’une porte — dans cet ordre', () => {
  const tout = vol({ abri: true, protection: { jusqu_a: '2026-10-12T18:30:00+02:00', position: 30, orientation: 270 },
    attente: { sens: 'fermer', motif: 'baie ouverte', expire: '2026-10-13T08:17:00+02:00' }, a_venir: [mvt('fermeture', '2026-10-12T20:54:00+02:00')] });
  assert.equal(phrase(st('open', 100), tout), 'À l’abri du vent');
  assert.equal(phrase(st('open', 30), { ...tout, abri: false }), 'Protection solaire');
  assert.equal(phrase(st('open', 100), { ...tout, abri: false, protection: null }), 'Fermeture en attente');
  // Une attente qui n'est pas une porte (un volet revenu) ne se dit pas ici.
  assert.equal(phrase(st('open', 100), { ...tout, abri: false, protection: null, attente: { sens: 'ouvrir', motif: null, expire: null } }), 'Ferme à 20:54');
  const l = V.ligneVolet({ v: { ...tout, abri: false, protection: null, porte: { entite: 'binary_sensor.baie_vitree', etat: 'ouverte' } }, etat: etat() });
  assert.deepEqual(l, { ligne: 5, porte: 'binary_sensor.baie_vitree' });
});

test('§ 4, ligne 6 : le prochain mouvement utile, le jour à l’heure de la maison', () => {
  const ce_soir = mvt('fermeture', '2026-10-12T20:54:00+02:00');
  const demain = mvt('ouverture', '2026-10-13T08:17:00+02:00');
  const lundi = mvt('ouverture', '2026-10-19T08:26:00+02:00');
  assert.equal(phrase(st('open', 60), vol({ a_venir: [ce_soir, demain] })), 'Ferme à 20:54');
  assert.equal(phrase(st('closed', 0), vol({ a_venir: [ce_soir, demain] })), 'Ouvre demain à 08:17', 'une fermeture d’un volet fermé se saute');
  assert.equal(phrase(st('open', 100), vol({ a_venir: [demain, ce_soir].reverse() })), 'Ferme à 20:54');
  assert.equal(phrase(st('closed', 0), vol({ a_venir: [lundi] })), 'Ouvre lundi à 08:26', 'au-delà de demain, le nom du jour');
  assert.equal(phrase(st('open', 100), vol({ a_venir: [mvt('fermeture', '2026-10-13T20:22:00+02:00')] })), 'Ferme demain à 20:22');
  // Sa chambre : fermée à 1 %, aucune ouverture, ses fermetures sautées — le mot d'aujourd'hui (§ 4, exemple).
  assert.equal(phrase(st('open', 1), vol({ regle: 'perso', a_venir: [ce_soir, mvt('fermeture', '2026-10-13T20:52:00+02:00')] })), 'Fermé');
  // Ouverte à la main, elle dit sa fermeture.
  assert.equal(phrase(st('open', 100), vol({ regle: 'perso', a_venir: [ce_soir] })), 'Ferme à 20:54');
  assert.equal(V.mouvementUtile([demain], false, true), null, 'une ouverture d’un volet ouvert se saute');
  assert.equal(V.mouvementUtile(null, false, false), null);
});

test('§ 4, ligne 7 : rien de prévu — Jamais, Manuel, planning coupé, heures à lui sans aucun jour', () => {
  assert.equal(phrase(st('open', 60), vol({ regle: 'jamais' })), 'Manuel');
  const plan = (o) => etat({ config: { planning: { ...etat().config.planning, ...o } } });
  assert.equal(phrase(st('open', 60), vol(), plan({ mode: 'manuel' })), 'Manuel');
  assert.equal(phrase(st('open', 60), vol(), plan({ actif: false })), 'Manuel');
  assert.equal(phrase(st('open', 60), vol({ regle: 'perso', a_venir: [] })), 'Manuel', 'le soleil est connu, rien n’est prévu');
});

test('§ 4, ligne 8 : sans heures du soleil, ou sans état du serveur, le mot d’aujourd’hui', () => {
  // V12 : le chiffre reste la mesure, seul le mot change.
  assert.equal(phrase(st('open', 1), null), 'Fermé');
  assert.equal(V.vueVolet({ st: st('open', 1) }).pos, 1);
  assert.deepEqual([V.motPosition(true, false, 1), V.motPosition(false, true, 100), V.motPosition(false, false, 60)], ['Fermé', 'Ouvert', 'Ouvert à 60 %']);
  assert.equal(phrase(st('open', 60), vol({ a_venir: [] }), etat({ soleil_jours: [] })), 'Ouvert à 60 %');
  assert.equal(phrase(st('open', 100), null, null), 'Ouvert');
  assert.equal(phrase(st('closed', 0), null, null), 'Fermé');
  assert.equal(phrase(st('open', 98), null, null), 'Ouvert', '98 % : la butée haute');
});

test('pendant une course, le verdict suit la position DESSINÉE, pas l’état qui a basculé', () => {
  // Netatmo : `closed` alors que la position vaut encore 100 ; la course descend, elle est à 60.
  const vue = V.vueVolet({ st: st('closed', 100), course: { pos: 60, enCourse: true, sens: 'fermeture', cible: 0 } });
  assert.equal(vue.pos, 60);
  assert.equal(vue.ferme, false, 'la carte s’éteindrait au premier dixième de la descente');
  assert.equal(vue.allume, true);
  assert.equal(vue.glyphe, 'blinds-raised');
  assert.deepEqual([vue.peutMonter, vue.peutDescendre], [true, true], 'en course, rien n’est inerte');
});

test('l’icône et la plaque suivent le verdict (V7 : sans icône choisie)', () => {
  assert.equal(V.vueVolet({ st: st('closed', 0) }).glyphe, 'blinds');
  assert.equal(V.vueVolet({ st: st('open', 60) }).glyphe, 'blinds-raised');
  assert.equal(V.vueVolet({ st: st('open', 100) }).glyphe, 'blinds-open');
  assert.deepEqual(V.plaqueVolet(true), ['rgba(var(--o-purple-rgb),.16)', 'var(--o-purple)']);
  assert.deepEqual(V.plaqueVolet(false), ['var(--o-s1)', 'var(--o-text2)']);
  const haut = V.vueVolet({ st: st('open', 100) });
  assert.deepEqual([haut.peutMonter, haut.peutDescendre], [false, true], 'Monter est inerte à 100 % hors course');
  const bas = V.vueVolet({ st: st('closed', 0) });
  assert.deepEqual([bas.peutMonter, bas.peutDescendre], [true, false], 'Descendre est inerte à 0 % hors course');
});

test('relecture du 13/10, point 6 — `coverActif` : le verdict V12 de tout ce qui dit « ouvert », « actif » ou « vif »', () => {
  assert.equal(V.coverActif(st('open', 1)), false, 'sa chambre, qui bute à 1 % : fermée, donc ni active ni vive');
  assert.equal(V.coverActif(st('open', 3)), true);
  assert.equal(V.coverActif(st('closed', 100)), false, 'Home Assistant dit closed : il fait foi');
  assert.equal(V.coverActif(st('open', null)), true, 'sans position, l’état suffit');
  assert.equal(V.coverActif(st('closed', null)), false);
  assert.equal(V.coverActif(st('opening', null)), true, 'en mouvement sans position : pas encore fermé');
  assert.equal(V.coverActif(st('closing', null)), true);
  assert.equal(V.coverActif(st('closing', 1)), false);
  assert.equal(V.coverActif(st('unavailable', 60)), false, 'muet : rien');
  assert.equal(V.coverActif(null), false);
});
