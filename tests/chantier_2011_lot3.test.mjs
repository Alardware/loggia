// ─────────────────────────────────────────────────────────────────────────────
// Chantier du 20/11, lot 3 (ADR 0383).
//
//  — P3 : la feuille Présence dit la journée de chacun (« Départ 08:12 ·
//    Travail 08:40 · Retour 18:30 ») et la pile de son téléphone.
//  — P6 : la fiche d'une enceinte qui sait se grouper offre « Jouer aussi
//    dans », une puce par enceinte de la même intégration, et « Tout dégrouper ».
//  — P7 : une tondeuse garée dans ses heures de repos le dit : « Heures de repos
//    jusqu'à 10:00 » (`non_work_hours`, « 09:00pm - 10:00am » chez Mammotion).
//  — P10 : la vue Système dit où la dernière sauvegarde est allée, emplacement
//    par emplacement (`backup/info` : `agents`, `failed_agent_ids`).
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });

const { mouvementsDuJour, texteJournee, telephoneDe, chargeDe } = await import('../src/journeepresence.js');
const { peutGrouper, candidatsGroupe, appelGroupe, appelsToutDegrouper, membresDe } = await import('../src/groupelecteurs.js');
const { plageRepos, finRepos, lignesEtat } = await import('../src/robotsfiche.js');
const { lieuxSauvegarde, aDireLieux } = await import('../src/sauvegardelieux.js');
const lire = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const jour = (h, m = 0, j = 0) => new Date(2026, 10, 21 + j, h, m, 0).getTime();
const MINUIT = jour(0);
const hh = (t) => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/* ════════════ P3 — LA JOURNÉE DE CHACUN ════════════ */

test('P3 — les mouvements depuis minuit : un par changement réel, un état muet n’en est pas un', () => {
  const serie = [
    { t: MINUIT - 3600000, etat: 'home' }, { t: jour(8, 12), etat: 'not_home' }, { t: jour(8, 40), etat: 'Travail' },
    { t: jour(12, 0), etat: 'unavailable' }, { t: jour(12, 5), etat: 'Travail' }, { t: jour(18, 30), etat: 'home' },
  ];
  const m = mouvementsDuJour(serie, MINUIT);
  assert.deepEqual(m.map(x => x.etat), ['not_home', 'Travail', 'home'], 'l’état d’avant minuit n’est pas un mouvement ; le retour de la zone muette non plus');
  assert.equal(texteJournee(m, hh), 'Départ 08:12 · Travail 08:40 · Retour 18:30', 'le nom de la zone tel quel');
  const long = [1, 2, 3, 4, 5, 6].map(i => ({ t: jour(i + 6), etat: i % 2 ? 'not_home' : 'home' }));
  assert.equal(mouvementsDuJour(long, MINUIT).length, 4, 'les quatre derniers');
  assert.equal(texteJournee(mouvementsDuJour(null, MINUIT), hh), '');
});

test('P3 — le téléphone : le device_tracker de l’application compagnon que la personne porte ; sa pile lue', () => {
  const plat = (id) => ({ 'device_tracker.velo': 'tile', 'device_tracker.tel': 'mobile_app' })[id] || null;
  assert.equal(telephoneDe({ attributes: { device_trackers: ['device_tracker.velo', 'device_tracker.tel'] } }, plat), 'device_tracker.tel');
  assert.equal(telephoneDe({ attributes: { device_trackers: ['device_tracker.velo'] } }, plat), null, 'un traceur d’objet n’est pas son téléphone');
  assert.equal(telephoneDe({ attributes: {} }, plat), null);
  assert.equal(chargeDe({ state: '18.4' }), 18);
  assert.equal(chargeDe({ state: 'unavailable' }), null);
});

test('P3 — la feuille : l’historique depuis minuit, le capteur battery de l’appareil du téléphone', () => {
  const f = lire('src/cartescustom/feuillepresence.jsx');
  assert.match(f, /'history\/period\/' \+ new Date\(minuitDe\(\)\)\.toISOString\(\)/);
  assert.match(f, /pickSibling\(LOGGIA_INDEX, S, tel, \{ domain: 'sensor', deviceClass: 'battery' \}\)/);
  assert.match(f, /tr\('téléphone \{n\} %', \{ n \}\)/);
  assert.match(f, /\{p\.mot \+ \(p\.lc \? ' · ' \+ relTime\(p\.lc\)\.toLowerCase\(\) : ''\)\}/, 'la ligne d’avant reste');
});

/* ════════════ P6 — GROUPER LES ENCEINTES ════════════ */

const G = 524288;
const lecteurs = {
  'media_player.salon': { state: 'playing', attributes: { friendly_name: 'Salon', supported_features: G | 1, group_members: ['media_player.salon', 'media_player.cuisine'] } },
  'media_player.cuisine': { state: 'idle', attributes: { friendly_name: 'Cuisine', supported_features: G } },
  'media_player.bureau': { state: 'idle', attributes: { friendly_name: 'Bureau', supported_features: G } },
  'media_player.tv': { state: 'off', attributes: { friendly_name: 'TV', supported_features: 1 } },
  'media_player.sonos': { state: 'idle', attributes: { friendly_name: 'Sonos', supported_features: G } },
  'media_player.muet': { state: 'unavailable', attributes: { friendly_name: 'Muet', supported_features: G } },
};
const plat = (id) => (id === 'media_player.sonos' ? 'sonos' : 'music_assistant');

test('P6 — avec qui : les enceintes qui savent se grouper, de la même intégration ; qui est déjà dedans', () => {
  const c = candidatsGroupe('media_player.salon', Object.keys(lecteurs), lecteurs, plat);
  assert.deepEqual(c, [{ id: 'media_player.bureau', nom: 'Bureau', dans: false }, { id: 'media_player.cuisine', nom: 'Cuisine', dans: true }]);
  assert.deepEqual(candidatsGroupe('media_player.tv', Object.keys(lecteurs), lecteurs, plat), [], 'un lecteur qui ne sait pas se grouper : rien');
  assert.equal(peutGrouper(lecteurs['media_player.muet']), false);
  assert.deepEqual(membresDe('media_player.salon', lecteurs), ['media_player.cuisine'], 'le meneur ne se compte pas');
});

test('P6 — les ordres : join pour joindre, unjoin pour retirer, et chacun quitte pour « Tout dégrouper »', () => {
  assert.deepEqual(appelGroupe('media_player.salon', 'media_player.bureau', true), { domaine: 'media_player', service: 'join', data: { entity_id: 'media_player.salon', group_members: ['media_player.bureau'] } });
  assert.deepEqual(appelGroupe('media_player.salon', 'media_player.cuisine', false), { domaine: 'media_player', service: 'unjoin', data: { entity_id: 'media_player.cuisine' } });
  assert.deepEqual(appelsToutDegrouper('media_player.salon', lecteurs).map(a => a.data.entity_id), ['media_player.cuisine']);
});

test('P6 — la fiche : le panneau après le minuteur, rien sur un écran bloqué', () => {
  const f = lire('src/fichemedia.jsx');
  const iMin = f.indexOf('{vivante && !v.bloque && v.minuteur && <PanneauMinuteur');
  const iGrp = f.indexOf('{vivante && !v.bloque && <PanneauGroupe id={id} v={v} />}');
  assert.ok(iMin > 0 && iGrp > iMin, 'après le minuteur (l’ordre Spotify puis Minuteur reste)');
  assert.match(f, /if \(!autres\.length\) return null;/, 'rien sur un lecteur qui ne sait pas se grouper');
});

/* ════════════ P7 — LA TONDEUSE AU REPOS ════════════ */

test('P7 — la plage de repos se lit en 12 h comme en 24 h, et peut passer minuit', () => {
  assert.deepEqual(plageRepos('09:00pm - 10:00am'), { debut: 21 * 60, fin: 10 * 60 });
  assert.deepEqual(plageRepos('21:00 - 10:00'), { debut: 21 * 60, fin: 10 * 60 });
  assert.deepEqual(plageRepos('12:00am - 06:30am'), { debut: 0, fin: 390 });
  assert.equal(plageRepos('toute la nuit'), null);
  assert.equal(plageRepos('10:00 - 10:00'), null);
  const p = plageRepos('09:00pm - 10:00am');
  assert.equal(finRepos(p, jour(23, 0)), jour(10, 0, 1), 'à 23 h : jusqu’à demain 10:00');
  assert.equal(finRepos(p, jour(9, 0)), jour(10, 0), 'à 9 h : jusqu’à 10:00');
  assert.equal(finRepos(p, jour(12, 0)), null, 'à midi : hors repos');
  assert.equal(finRepos(plageRepos('08:00 - 12:00'), jour(9, 0)), jour(12, 0), 'une plage du jour');
});

test('P7 — la ligne : garée ou au repos, dans ses heures ; jamais en tonte, jamais pour un aspirateur', () => {
  const soeurs = [{ domaine: 'sensor', cle: 'non_work_hours', etat: '09:00pm - 10:00am' }];
  const ligne = (o) => lignesEtat({ domaine: 'lawn_mower', phase: 'base', soeurs, maintenant: jour(23, 0), ...o }).find(l => l.cle === 'repos');
  assert.ok(ligne());
  assert.match(ligne().texte, /^Heures de repos jusqu’à 10:00$/);
  assert.equal(ligne().glyphe, 'moon');
  assert.ok(ligne({ phase: 'repos' }), 'au repos aussi');
  assert.equal(ligne({ phase: 'travail' }), undefined, 'elle tond : ce n’est pas la raison');
  assert.equal(ligne({ maintenant: jour(12, 0) }), undefined, 'hors des heures de repos');
  assert.equal(ligne({ domaine: 'vacuum' }), undefined);
  assert.equal(ligne({ soeurs: [] }), undefined, 'sans le capteur, rien');
});

/* ════════════ P10 — LA SAUVEGARDE PAR EMPLACEMENT ════════════ */

const info = { backups: [
  { backup_id: 'a', date: '2026-11-20T05:00:00+01:00', agents: { 'hassio.local': {}, 'cloud.cloud': {} }, failed_agent_ids: [] },
  { backup_id: 'b', date: '2026-11-21T05:00:00+01:00', agents: { 'hassio.local': {} }, failed_agent_ids: ['cloud.cloud'], failed_addons: [{ slug: 'x' }], failed_folders: [] },
] };

test('P10 — la plus récente : la machine copiée, Nabu Casa ratée, les éléments manqués', () => {
  const l = lieuxSauvegarde(info, []);
  assert.equal(l.t, Date.parse('2026-11-21T05:00:00+01:00'));
  assert.deepEqual(l.lieux, [{ id: 'hassio.local', ok: true, nom: 'Cette machine' }, { id: 'cloud.cloud', ok: false, nom: 'Nabu Casa' }]);
  assert.equal(l.manques, 1);
  assert.equal(l.echec, true);
  assert.equal(aDireLieux(l), true);
});

test('P10 — un autre emplacement prend le nom que Home Assistant lui donne ; une seule copie réussie ne dit rien', () => {
  const l = lieuxSauvegarde({ backups: [{ date: '2026-11-21T05:00:00Z', agents: { 'nas.maison': {} }, failed_agent_ids: [] }] }, [{ agent_id: 'nas.maison', name: 'NAS' }]);
  assert.deepEqual(l.lieux, [{ id: 'nas.maison', ok: true, nom: 'NAS' }]);
  assert.equal(aDireLieux(l), false);
  const manque = lieuxSauvegarde({ backups: [{ date: '2026-11-21T05:00:00Z', agents: { 'hassio.local': {} }, failed_agent_ids: [], failed_folders: ['media'] }] });
  assert.equal(manque.echec, true, 'copiée partout, mais un dossier manque : c’est un échec');
  assert.equal(aDireLieux(manque), true);
  assert.equal(lieuxSauvegarde({ backups: [] }), null);
  assert.equal(lieuxSauvegarde(null), null, 'refusé à un compte ordinaire : rien');
});

test('P10 — la vue Système : backup/info, la ligne sous « Dernière sauvegarde », l’ambre sur un échec', () => {
  const s = lire('src/views/systeme.jsx');
  assert.match(s, /useEtatServeur\(hass, 'backup\/info', 300000, ''\)/);
  assert.match(s, /useEtatServeur\(hass, 'backup\/agents\/info', 3600000, ''\)/);
  assert.match(s, /\{aDireLieux\(lieux\) && \(/);
  assert.match(s, /if \(lieux && lieux\.echec\) enDefaut = true;/);
});
