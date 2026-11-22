// ─────────────────────────────────────────────────────────────────────────────
// Chantier du 20/11, lot 2 (ADR 0382) : six gestes du quotidien.
//
//  — P1 : un armement qu'Alarmo refuse (un ouvrant ouvert) laisse l'état
//    `disarmed` et publie `open_sensors` ; trois secondes après le geste, la
//    carte le dit et offre « Armer quand même » (`alarmo.arm`, `force`), pour
//    Alarmo seulement, sur un geste seulement.
//  — P2 : qui a armé ou désarmé — Loggia (le journal de la présence, à 15 s
//    près), sinon `changed_by`.
//  — P4 : le prochain réveil, minuteur et rappel d'une Echo, sous le volume.
//  — P5 : une flèche ou un volume qu'on garde enfoncé se répète.
//  — P11 : « Relancer l'intégration » quand elle se tait entière, pour un
//    administrateur, en deux temps.
//  — P13 : « Sauvegarder avant d'installer », pour les mises à jour qui le
//    savent (bit 8).
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });

const { auteurAlarme, texteAuteur, refusArmement, appelForcer, ouvertsPublies } = await import('../src/alarmegeste.js');
const { prochainsEcho, texteProchain } = await import('../src/echoprochain.js');
const { armerRepetition } = await import('../src/maintien.js');
const { accepteSauvegarde, donneesInstall } = await import('../src/miseajour.js');
const { capaciteDe } = await import('../src/actions.js');
const lire = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const bloc = (txt, debut, fin) => { const i = txt.indexOf(debut); assert.ok(i >= 0, debut); return txt.slice(i, txt.indexOf(fin, i + debut.length)); };

/* ════════════ P1 — L'ARMEMENT REFUSÉ ════════════ */

const ALARME = 'alarm_control_panel.maison';
const S = { 'binary_sensor.fenetre': { state: 'on', attributes: { friendly_name: 'Fenêtre chambre' } } };
const panneau = (etat, attrs = {}) => ({ state: etat, attributes: { friendly_name: 'Maison', ...attrs }, last_changed: '2026-11-21T07:00:00Z' });

test('P1 — trois secondes après le geste, un panneau resté désarmé qui publie ses ouvrants a refusé', () => {
  const geste = { svc: 'alarm_arm_away', t: 1000 };
  const st = panneau('disarmed', { open_sensors: { 'binary_sensor.fenetre': 'on' } });
  assert.equal(refusArmement(geste, st, S, 2000), null, 'trop tôt : Alarmo n’a peut-être pas répondu');
  assert.deepEqual(refusArmement(geste, st, S, 4500), { noms: ['Fenêtre chambre'], mode: 'away' });
  assert.equal(refusArmement(geste, st, S, 62000), null, 'au bout d’une minute, la carte se tait');
  assert.equal(refusArmement(geste, panneau('arming', { open_sensors: { 'binary_sensor.fenetre': 'on' } }), S, 4500), null, 'il s’arme : pas de refus');
  assert.equal(refusArmement(geste, panneau('disarmed', { open_sensors: null }), S, 4500), null, 'rien de publié : on ne devine pas');
  assert.equal(refusArmement(null, st, S, 4500), null, 'sans geste de la carte, rien');
  assert.deepEqual(ouvertsPublies(panneau('disarmed', { open_sensors: ['binary_sensor.fenetre', 'binary_sensor.inconnu'] }), S), ['Fenêtre chambre', 'binary_sensor.inconnu'], 'une liste aussi');
});

test('P1 — « Armer quand même » : alarmo.arm, force, le mode et le code du geste', () => {
  assert.deepEqual(appelForcer(ALARME, { noms: ['x'], mode: 'night' }, '1234'),
    { domaine: 'alarmo', service: 'arm', data: { entity_id: ALARME, mode: 'night', force: true, code: '1234' } });
  assert.deepEqual(appelForcer(ALARME, { noms: ['x'], mode: 'home' }).data, { entity_id: ALARME, mode: 'home', force: true });
  assert.equal(appelForcer(ALARME, { noms: ['x'], mode: null }), null, 'un mode inconnu ne se force pas');
  assert.equal(appelForcer(ALARME, null), null);
});

test('P1 — la carte : Alarmo seulement, sur un geste seulement, le refus à la place du message', () => {
  const c = bloc(lire('src/cartescustom/cartes.jsx'), 'function CvAlarm(', '\n}\n');
  assert.match(c, /const forcer = refus && plateformeDe\(id\) === 'alarmo' \? appelForcer\(id, refus, geste && geste\.code\) : null;/);
  assert.match(c, /setGeste\(svc === 'alarm_disarm' \? null : \{ svc, code: c \|\| null, t: Date\.now\(\) \}\)/, 'désarmer efface le geste');
  assert.match(c, /if \(refus\) message = \{ texte: tr\('Pas armée, encore ouvert : \{noms\}'/);
  // Le forçage ne part que d'un toucher : la seule ligne qui appelle `forcer` est un onClick.
  const appels = c.split('\n').filter(l => l.indexOf('forcer.domaine') >= 0);
  assert.equal(appels.length, 1);
  assert.match(appels[0], /onClick=\{\(\) => \{ if \(hass && hass\.callService\) hass\.callService\(forcer\.domaine/);
});

/* ════════════ P2 — L'AUTEUR ════════════ */

test('P2 — Loggia d’abord (le journal de la présence, à 15 s près), sinon changed_by', () => {
  const st = panneau('disarmed', { changed_by: 'Camille' });
  const t = Date.parse(st.last_changed) / 1000;
  assert.deepEqual(auteurAlarme(st, ALARME, []), { qui: 'Camille' });
  assert.deepEqual(auteurAlarme(st, ALARME, [{ ts: t + 4, module: 'presence', regle: 'retour', cibles: [ALARME], simule: false }]), { loggia: 'retour' });
  assert.deepEqual(auteurAlarme(st, ALARME, [{ ts: t - 2, module: 'presence', regle: 'depart', cibles: [ALARME] }]), { loggia: 'depart' });
  assert.deepEqual(auteurAlarme(st, ALARME, [{ ts: t + 40, module: 'presence', regle: 'retour', cibles: [ALARME] }]), { qui: 'Camille' }, 'trop loin : une autre fois');
  assert.deepEqual(auteurAlarme(st, ALARME, [{ ts: t, module: 'presence', regle: 'retour', cibles: [ALARME], simule: true }]), { qui: 'Camille' }, 'une simulation n’a rien fait');
  assert.deepEqual(auteurAlarme(st, ALARME, [{ ts: t, module: 'presence', regle: 'retour', cibles: ['alarm_control_panel.autre'] }]), { qui: 'Camille' });
  assert.equal(auteurAlarme(panneau('disarmed'), ALARME, null), null, 'personne : rien n’est dit');
  assert.equal(auteurAlarme(panneau('disarmed', { changed_by: '  ' }), ALARME, []), null);
  assert.equal(texteAuteur({ qui: 'Camille' }), 'par Camille');
  assert.equal(texteAuteur({ loggia: 'retour' }), 'par Loggia, au retour');
  assert.equal(texteAuteur({ loggia: 'depart' }), 'par Loggia, au départ');
  assert.equal(texteAuteur(null), '');
});

test('P2 — la carte lit le journal de la présence, et se tait pendant l’armement et l’alerte', () => {
  const c = bloc(lire('src/cartescustom/cartes.jsx'), 'function CvAlarm(', '\n}\n');
  assert.match(c, /useEtatServeur\(hass, 'loggia\/presence\/etat', 60000, ''\)/);
  assert.match(c, /const auteur = mort \|\| !s \|\| s === 'triggered' \|\| s === 'arming' \|\| s === 'pending' \? null : auteurAlarme\(st, id, presence && presence\.journal\);/);
  assert.match(c, /\{auteur && !\(message && message\.texte\) && <div data-auteur=""/);
});

/* ════════════ P4 — LE RÉVEIL DE L'ECHO ════════════ */

const MAINTENANT = new Date(2026, 10, 21, 20, 0, 0).getTime();
const a = (j, h, m) => new Date(2026, 10, 21 + j, h, m, 0).toISOString();
const CLES = { 'sensor.r': 'next_alarm', 'sensor.r2': 'alarm', 'sensor.m': 'timer', 'sensor.p': 'next_reminder', 'sensor.x': null };
const cleDe = (id) => CLES[id] || null;

test('P4 — le plus proche à venir de chaque sorte, par la clé de traduction, réveil d’abord', () => {
  const etats = {
    'sensor.r': { state: a(1, 6, 45) }, 'sensor.r2': { state: a(2, 7, 0) },
    'sensor.m': { state: new Date(MAINTENANT - 5000).toISOString() },
    'sensor.p': { state: a(0, 21, 30) }, 'sensor.x': { state: a(0, 20, 30) },
  };
  const p = prochainsEcho(Object.keys(etats), etats, cleDe, MAINTENANT);
  assert.deepEqual(p.map(x => x.sorte), ['reveil', 'rappel'], 'le minuteur passé ne dit rien, une entité sans clé non plus');
  assert.equal(p[0].t, Date.parse(a(1, 6, 45)), 'le plus proche des deux réveils');
  assert.deepEqual(prochainsEcho(['sensor.r'], { 'sensor.r': { state: 'unknown' } }, cleDe, MAINTENANT), []);
  assert.deepEqual(prochainsEcho(['media_player.r'], { 'media_player.r': { state: a(1, 6, 45) } }, () => 'next_alarm', MAINTENANT), [], 'un capteur seulement');
});

test('P4 — ce que dit la fiche : aujourd’hui, demain, un jour de la semaine, le minuteur qui reste', () => {
  assert.equal(texteProchain({ sorte: 'reveil', t: Date.parse(a(1, 6, 45)) }, MAINTENANT), 'Réveil demain 06:45');
  assert.equal(texteProchain({ sorte: 'reveil', t: Date.parse(a(0, 22, 5)) }, MAINTENANT), 'Réveil 22:05');
  const jeudi = Date.parse(a(3, 18, 0));
  assert.equal(texteProchain({ sorte: 'rappel', t: jeudi }, MAINTENANT), 'Rappel ' + new Date(jeudi).toLocaleDateString('fr-FR', { weekday: 'short' }) + ' 18:00');
  assert.equal(texteProchain({ sorte: 'minuteur', t: MAINTENANT + 250000 }, MAINTENANT), 'Minuteur 5 min');
  assert.equal(texteProchain({ sorte: 'minuteur', t: MAINTENANT + 40000 }, MAINTENANT), 'Minuteur 40 s');
});

test('P4 — la fiche d’une Echo le dit sous le volume ; la démo en porte un', () => {
  const f = lire('src/fichemedia.jsx');
  assert.match(f, /\{vivante && lecteur\.alexa && \(\(\) => \{/);
  assert.match(f, /prochainsEcho\(entitesAppareilDe\(id\), S, cleTraduction, t\)/);
  assert.ok(f.indexOf('data-echo-prochains') > f.indexOf('data-plafond-ligne'), 'sous le volume');
  assert.match(lire('src/demo.js'), /\/_prochaine_alarme\$\/\.test\(id\) \? 'next_alarm'/);
});

/* ════════════ P5 — L'APPUI MAINTENU ════════════ */

function horloge() {
  const files = [];
  return { files, poser: (f, ms) => { files.push({ f, ms }); return files.length - 1; }, retirer: (i) => { if (files[i]) files[i].f = null; },
    avancer() { const x = files.find(y => y.f); if (!x) return false; const f = x.f; x.f = null; f(); return true; } };
}

test('P5 — une touche part tout de suite, se répète après un temps, s’arrête au relâchement', () => {
  const h = horloge();
  let n = 0;
  const arreter = armerRepetition(() => { n += 1; }, { delai: 450, pas: 180, max: 40, horloge: h });
  assert.equal(n, 1, 'un appui bref reste UNE touche');
  assert.equal(h.files[0].ms, 450);
  h.avancer(); assert.equal(n, 2);
  assert.equal(h.files[1].ms, 180);
  h.avancer(); h.avancer(); assert.equal(n, 4);
  arreter();
  assert.equal(h.avancer(), false, 'relâché : plus rien ne part');
  assert.equal(n, 4);
});

test('P5 — un plafond : un relâchement perdu ne fait pas monter le volume sans fin', () => {
  const h = horloge();
  let n = 0;
  armerRepetition(() => { n += 1; }, { max: 5, horloge: h });
  // Borné : sans plafond, la répétition ne finirait jamais — le test doit le dire, pas tourner sans fin.
  for (let i = 0; i < 100 && h.avancer(); i += 1);
  assert.equal(n, 6, 'la première touche, puis cinq répétitions au plus');
});

test('P5 — arrêtée pendant l’envoi (la fiche se ferme sur la touche), plus rien ne part', () => {
  const h = horloge();
  let n = 0;
  let arreter = null;
  arreter = armerRepetition(() => { n += 1; if (n === 2) arreter(); }, { horloge: h });
  for (let i = 0; i < 100 && h.avancer(); i += 1);
  assert.equal(n, 2);
});

test('P5 — le pavé : les flèches et le volume se répètent, OK et les autres touches non', () => {
  const f = lire('src/fichemedia.jsx');
  assert.match(f, /<button key=\{g\} type="button" \{\.\.\.repete\(\(\) => toucher\(g\)\)\} aria-label=\{noms\[g\]\}/, 'les flèches');
  assert.match(f, /\['vol_moins', 'vol_plus'\]\.filter\(sait\)\.map\(g => touche\(g, DESSIN_TOUCHE\[g\], noms\[g\], \(\) => toucher\(g\), true\)\)/, 'le volume');
  assert.match(f, /<button type="button" onClick=\{\(\) => toucher\('ok'\)\}/, 'OK : une touche par appui');
  const r = bloc(f, 'function useRepete()', '\n}\n');
  for (const arret of ['onPointerUp: arreter', 'onPointerLeave: arreter', 'onPointerCancel: arreter', "addEventListener('visibilitychange'", "addEventListener('blur'"]) assert.ok(r.indexOf(arret) >= 0, arret);
  assert.match(r, /onClick: \(e\) => \{ if \(!e \|\| !e\.detail\) envoyer\(\); \}/, 'le clavier : une touche ; le clic qui suit un toucher, rien');
});

/* ════════════ P11 — RELANCER L'INTÉGRATION ════════════ */

test('P11 — un bouton pour un administrateur, quand l’intégration se tait entière, en deux temps', () => {
  const a11 = lire('src/aidepanne.jsx');
  assert.match(a11, /relance: !!\(integrationMuette && !compteOrdinaire\(h\)\)/);
  assert.match(a11, /\{aide\.relance && <RelancerIntegration id=\{id\} hass=\{hass\} \/>\}/);
  const r = bloc(a11, 'function RelancerIntegration(', '\n}\n');
  assert.match(r, /h\.callService\('homeassistant', 'reload_config_entry', \{ entity_id: id \}\)/);
  assert.match(r, /if \(!arme\) \{ setArme\(true\); minuterie\.current = setTimeout\(\(\) => setArme\(false\), 4000\); return; \}/, 'le premier toucher arme seulement');
  assert.match(r, /\.then\(\(\) => setIssue\('ok'\), \(\) => setIssue\('refus'\)\)/, 'dit fait à la réponse');
  assert.ok(!/useEffect\([^)]*callService/.test(r), 'rien ne se relance tout seul');
});

/* ════════════ P13 — SAUVEGARDER AVANT D'INSTALLER ════════════ */

test('P13 — le bit 8 dit qui sait sauvegarder ; `backup` ne part qu’à elles, et si la bascule est mise', () => {
  assert.equal(accepteSauvegarde({ attributes: { supported_features: 8 } }), true);
  assert.equal(accepteSauvegarde({ attributes: { supported_features: 25 } }), true);
  assert.equal(accepteSauvegarde({ attributes: { supported_features: 23 } }), false);
  assert.equal(accepteSauvegarde({ attributes: {} }), false);
  assert.deepEqual(donneesInstall({ id: 'update.core', sauvegarde: true }, true), { entity_id: 'update.core', backup: true });
  assert.deepEqual(donneesInstall({ id: 'update.core', sauvegarde: true }, false), { entity_id: 'update.core' });
  assert.deepEqual(donneesInstall({ id: 'update.zigbee', sauvegarde: false }, true), { entity_id: 'update.zigbee' });
  assert.ok(capaciteDe('update', 'install', { entity_id: 'update.core', backup: true }).accepte.indexOf('backup') >= 0, 'le champ n’est pas perdu en chemin');
});

test('P13 — les Paramètres : une bascule, mise par défaut, pour « Installer » comme pour « Tout installer »', () => {
  const p = lire('src/views/parametres.jsx');
  assert.match(p, /const \[updSauver, setUpdSauver\] = useState\(true\);/);
  assert.match(p, /const updInstaller = \(u\) => commanderService\(hass, u\.id, 'update', 'install', donneesInstall\(u, updSauver\)\);/);
  assert.ok(!/updCall\('install'/.test(p), 'plus aucune installation sans la bascule');
  assert.match(p, /\{ups\.some\(u => u\.avail && u\.sauvegarde\) && \(/, 'montrée seulement si une mise à jour le sait');
  assert.match(p, /sauvegarde: accepteSauvegarde\(s\)/);
});
