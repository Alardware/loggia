/* Audit du 19/10, côté écran des volets : Paramètres › Règles › Volets, le
 * journal, l'historique d'une pièce, le plan 3D.
 *
 * Langue française fixée AVANT l'import : la machine de la CI ne doit pas
 * changer les mots. */
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composant } from './rendu.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const VOL = lire('src', 'views', 'volets.jsx');

const defaire = await composant('views/volets.jsx', 'defaire');
const rangeeDe = await composant('views/volets.jsx', 'rangeeDe');
const etatJournal = await composant('historique.jsx', 'etatJournal');

/* ── 1. Paramètres › Règles › Volets ── */

test('V10 : un compte ordinaire lit les réglages, ne les écrit pas, et le refus nomme sa clé sous la rangée', () => {
  assert.ok(VOL.includes('const ordinaire = compteOrdinaire(hass);'), 'le compte ordinaire n’est plus reconnu');
  const e = VOL.slice(VOL.indexOf('const enregistrer = async'), VOL.indexOf('/* Le refus de cette rangée'));
  // Rien ne part : le refus se dit tout de suite, sans aller-retour ni valeur affichée qui ment.
  assert.ok(e.indexOf("if (ordinaire) { setRefus({ ou, texte: refusLecture() }); return; }") < e.indexOf('setEtat('), 'l’écriture part avant la garde');
  assert.ok(VOL.includes("raisonEchec(Object.assign(new Error('Unauthorized'), { code: 'unauthorized' }), 'loggia_volets')"), 'le refus ne nomme plus loggia_volets');
  // Un refus du serveur annule l'avance, et se dit sous la rangée — il ne s'efface plus au relevé suivant.
  assert.ok(e.includes('defaire(x.config, avant, patch)') && e.includes("setRefus({ ou, texte: raisonEchec(e, 'loggia_volets') });"));
  assert.ok(!e.includes('setErr('), 'le refus repasse par `err`, que le relevé suivant efface en 5 s');
  // Chaque réglage a son refus sous lui.
  for (const ou of ['planning.actif', 'planning.ouverture', 'planning.fermeture', 'planning.jours', 'soleil.actif', 'soleil.position',
    'soleil.elevation_min', 'soleil.temp_min', 'soleil.temp_entite', 'vent.actif', 'vent.entite', 'vent.seuil', 'velux.actif', 'baies.actif',
    'verification.tentatives']) {
    assert.ok(VOL.includes("{alerte('" + ou + "')}"), 'pas de refus sous ' + ou);
  }
  // Les champs sont inertes : pas de saisie, un appui dit le refus.
  assert.equal((VOL.match(/inerte=\{ordinaire\} cb=\{n => enregistrer/g) || []).length, 6, 'un champ nombre reste modifiable');
  assert.ok(VOL.includes('readOnly={inerte} aria-disabled={inerte || undefined} onClick={inerte ? () => cb(v) : undefined}'));
  assert.ok(VOL.includes("if (ordinaire) { setRefus({ ou: section + '.' + champNom, texte: refusLecture() }); return; }"), 'le choix d’un capteur s’ouvre encore');
});

test('V10 : la rangée d’un patch, et l’avance défaite champ par champ', () => {
  assert.equal(rangeeDe({ planning: { jours: [1] } }), 'planning.jours');
  assert.equal(rangeeDe({ planning: { ouverture: { decalage: 30 } } }), 'planning.ouverture');
  assert.equal(rangeeDe({ soleil: { temp_entite: 'sensor.x' } }), 'soleil.temp_entite');
  const avant = { planning: { actif: true, jours: [0, 1, 2], ouverture: { decalage: 10 } }, soleil: { actif: false } };
  const avance = { planning: { actif: true, jours: [0, 1], ouverture: { decalage: 10 } }, soleil: { actif: false, temp_entite: 'sensor.x' } };
  assert.deepEqual(defaire(avance, avant, { planning: { jours: [0, 1] } }), { ...avance, planning: { ...avance.planning, jours: [0, 1, 2] } });
  // Un champ qui n'existait pas avant le geste repart.
  assert.deepEqual(defaire(avance, avant, { soleil: { temp_entite: 'sensor.x' } }).soleil, { actif: false });
});

test('les puces des jours et des tentatives disent leur état (`aria-pressed`)', () => {
  const jours = VOL.slice(VOL.indexOf('{JOURS_COURTS().map('), VOL.indexOf('{alerte(\'planning.jours\')}'));
  assert.ok(jours.includes('aria-pressed={on}') && jours.includes('type="button"'), 'les jours');
  assert.ok(VOL.includes('aria-pressed={tentatives === n}'), 'les tentatives');
  // Le mode n'a plus de puce dans Paramètres (décision du 19/10) : il s'y dit.
  assert.ok(!VOL.includes('enregistrer({ planning: { mode: id } })'));
});

test('le thermomètre et l’anémomètre se disent par leur nom, pas par leur identifiant', () => {
  assert.ok(VOL.includes('{sol.temp_entite ? nomEntite(sol.temp_entite) : tr(\'Choisir un capteur…\')}'));
  assert.ok(VOL.includes('{vent.entite ? nomEntite(vent.entite) : tr(\'Choisir un capteur…\')}'));
  assert.ok(!VOL.includes('{sol.temp_entite ||') && !VOL.includes('{vent.entite ||'), 'un entity_id brut revient');
  assert.ok(VOL.includes('cvName(hass.states[id], id)'), 'le friendly_name, comme ailleurs');
});

test('la protection solaire sans aucune façade le dit ; aucun jour choisi le dit', () => {
  assert.ok(VOL.includes("{tr('Aucun volet n’a de façade : la protection solaire ne baissera rien. La façade se choisit dans la popup d’un volet.')}"));
  assert.ok(VOL.includes('const sansFacade = !!sol.actif &&'), 'l’avertissement ne suit plus la règle allumée');
  assert.ok(VOL.includes('{joursActifs.length === 0 && (') && VOL.includes("{tr('Aucun jour choisi : le planning ne bouge les volets aucun jour.')}"));
});

test('les décalages de la maison ont les bornes de la popup : −120 à +240 min', () => {
  assert.equal((VOL.match(/min=\{-120\} max=\{240\}/g) || []).length, 2);
  assert.ok(!VOL.includes('min={-120} max={120}'));
});

test('la vérification dit l’attente d’un volet qui a répondu (ADR 0192)', () => {
  assert.ok(!VOL.includes('Deux minutes après un ordre, un volet joignable qui n’a pas bougé se voit redemander. Après'), 'l’ancien texte, faux depuis l’ADR 0192');
  assert.ok(VOL.includes('est attendu jusqu’à six minutes'));
});

/* ── 2. Le journal ── */

test('le journal traduit la règle qui tient un volet, comme ses autres mots', () => {
  const j = lire('src', 'views', 'journal.jsx');
  assert.ok(j.includes("mot(tenues[id], 'regle')"), 'la règle d’une tenue passe par mot()');
  assert.ok(!j.includes('{tenues[id].regle}'), 'la règle s’affiche brute');
});

/* ── 3. L'historique ── */

test('l’historique : un volet publié « open » à 1 % se dit fermé, comme sa carte ; un état muet se traduit', () => {
  const S = { 'cover.chambre_test': { state: 'open', attributes: { current_position: 1, device_class: 'shutter' } },
    'cover.salon_test': { state: 'open', attributes: { current_position: 60, device_class: 'shutter' } } };
  assert.equal(etatJournal('cover.chambre_test', 'open', S, true), 'Fermé', 'sa dernière ligne suit la position d’aujourd’hui');
  assert.equal(etatJournal('cover.chambre_test', 'open', S, false), 'Ouvert', 'une ligne plus ancienne garde le mot de son état');
  assert.equal(etatJournal('cover.salon_test', 'open', S, true), 'Ouvert');
  assert.equal(etatJournal('cover.salon_test', 'closed', S, true), 'Fermé');
  assert.equal(etatJournal('cover.salon_test', 'unavailable', S), 'Indisponible');
  assert.equal(etatJournal('cover.salon_test', 'unknown', S), 'Inconnu');
  assert.equal(etatJournal('light.test', 'unavailable', {}), 'Indisponible', 'jamais « unavailable » en anglais');
  const h = lire('src', 'historique.jsx');
  assert.ok(h.includes('etatJournal(e.entity_id, e.state, S, dernieres.has(e))'), 'la carte d’activité ne dit pas quelle ligne est la dernière');
});

/* ── 4. Le plan 3D ── */

test('le plan 3D : un volet muet ou absent est neutre, un volet qui bouge suit la course jouée', () => {
  const p = lire('src', 'plan3d.jsx');
  assert.ok(!p.includes("(st && st.state === 'closed' ? 0 : 100)"), 'un volet sans état est de nouveau dessiné ouvert à 100 %');
  assert.ok(p.includes('if (pos == null) voletNeutre(e.volet);'), 'un volet muet');
  assert.ok(p.includes('if (estMuetVolet(st)) return null;') && p.includes('const c = afficherCourse(id, st);'), 'la course jouée');
  assert.ok(p.includes('const courses = useCoursesVolets();') && p.includes('[hass, pieces, etat, courses]'), 'le plan ne se redessine pas pendant une course');
  assert.ok(p.includes('? (pos != null ? pos / 100 : 0)'), 'un portail muet est dessiné ouvert');
});
