/* Lot 5 du chantier du 20/11, point A8 : caméras — le son, l'orientation, le mode privé visible.
 *
 * Deux étages : les modules purs (`camson.js`, `camcmd.js`) se lisent à sec, avec un faux index des registres ; le
 * branchement (`CamLive`, la tuile de la vue Sécurité) se lit dans les sources, comme les tests voisins. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aDuSon, prendreLeSon, rendreLeSon } from '../src/camson.js';
import { camPrivee, ptzDe } from '../src/camcmd.js';

const lire = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

/** Un index minimal : `meta` = { id: { deviceId, platform, translationKey, disabled } }. */
const indexDe = (meta) => ({ entityMeta: new Map(Object.entries(meta)) });
const etats = (...ids) => Object.fromEntries(ids.map(id => [id, { state: 'on', attributes: {} }]));

// ── Le son ──────────────────────────────────────────────────────────────────

test('aDuSon : les pistes du flux WebRTC, puis celles d’un lecteur HLS, puis rien de sûr', () => {
  const piste = (readyState = 'live') => ({ readyState });
  assert.equal(aDuSon({ srcObject: { getAudioTracks: () => [piste()] } }), true, 'une piste audio vivante');
  assert.equal(aDuSon({ srcObject: { getAudioTracks: () => [] } }), false, 'un flux sans piste audio : pas de bouton');
  assert.equal(aDuSon({ srcObject: { getAudioTracks: () => [piste('ended')] } }), false, 'une piste finie ne compte pas');
  assert.equal(aDuSon({ srcObject: null, audioTracks: { length: 1 } }), true, 'HLS natif : la liste des pistes audio');
  assert.equal(aDuSon({ srcObject: null, audioTracks: { length: 0 } }), false);
  assert.equal(aDuSon({ srcObject: null, mozHasAudio: true }), true);
  assert.equal(aDuSon({ srcObject: null }), null, 'rien à lire : on ne le sait pas, on n’invente pas de bouton');
  assert.equal(aDuSon(null), null);
});

test('une seule caméra est écoutée : en écouter une seconde coupe la première', () => {
  const coupees = [];
  prendreLeSon('A', () => coupees.push('A'));
  prendreLeSon('B', () => coupees.push('B'));
  assert.deepEqual(coupees, ['A'], 'B prend le son, A est coupée, B ne l’est pas');
  prendreLeSon('B', () => coupees.push('B'));
  assert.deepEqual(coupees, ['A'], 'reprendre son propre son ne coupe rien');
  prendreLeSon('C', () => coupees.push('C'));
  assert.deepEqual(coupees, ['A', 'B']);
  rendreLeSon('A'); // A n'écoute plus depuis longtemps : sans effet sur C
  prendreLeSon('D', () => coupees.push('D'));
  assert.deepEqual(coupees, ['A', 'B', 'C'], 'rendre le son d’une autre ne libère pas celui de C');
  rendreLeSon('D');
  prendreLeSon('F', () => coupees.push('F'));
  assert.deepEqual(coupees, ['A', 'B', 'C'], 'un son rendu : plus personne à couper');
  rendreLeSon('F');
});

// ── Le mode privé ───────────────────────────────────────────────────────────

const UNIFI = indexDe({
  'camera.porte': { deviceId: 'd1', platform: 'unifiprotect', translationKey: null },
  'switch.porte_privacy': { deviceId: 'd1', platform: 'unifiprotect', translationKey: 'privacy_mode' },
  'switch.porte_motion': { deviceId: 'd1', platform: 'unifiprotect', translationKey: 'motion' },
  'camera.jardin': { deviceId: 'd2', platform: 'unifiprotect', translationKey: null },
  'switch.jardin_privacy': { deviceId: 'd2', platform: 'unifiprotect', translationKey: 'privacy_mode' },
});

test('camPrivee : l’interrupteur privacy_mode de SON appareil, allumé — jamais celui d’un voisin', () => {
  const S = { ...etats('switch.porte_privacy', 'switch.porte_motion'), 'switch.jardin_privacy': { state: 'off' } };
  assert.equal(camPrivee(UNIFI, S, 'camera.porte'), true);
  assert.equal(camPrivee(UNIFI, S, 'camera.jardin'), false, 'l’interrupteur de la porte ne rend pas le jardin privé');
  assert.equal(camPrivee(UNIFI, { 'switch.porte_privacy': { state: 'off' } }, 'camera.porte'), false);
  assert.equal(camPrivee(UNIFI, { 'switch.porte_privacy': { state: 'unavailable' } }, 'camera.porte'), false, 'indisponible : on n’en tire rien');
  assert.equal(camPrivee(UNIFI, {}, 'camera.porte'), false, 'pas d’état : pas privé');
  assert.equal(camPrivee(UNIFI, S, null), false);
  assert.equal(camPrivee(null, S, 'camera.porte'), false, 'sans index');
});

test('camPrivee reconnaît à la clé de traduction, pas au nom : un interrupteur « privacy » sans clé n’est pas lu', () => {
  const i = indexDe({
    'camera.x': { deviceId: 'd', platform: 'autre', translationKey: null },
    'switch.x_privacy': { deviceId: 'd', platform: 'autre', translationKey: null },
  });
  assert.equal(camPrivee(i, etats('switch.x_privacy'), 'camera.x'), false);
  const off = indexDe({
    'camera.x': { deviceId: 'd' },
    'switch.x_priv': { deviceId: 'd', translationKey: 'privacy_mode', disabled: true },
  });
  assert.equal(camPrivee(off, etats('switch.x_priv'), 'camera.x'), false, 'une entité désactivée n’existe pas');
});

// ── L'orientation ───────────────────────────────────────────────────────────

const REOLINK = indexDe({
  'camera.cour': { deviceId: 'r', platform: 'reolink', translationKey: null },
  'button.cour_haut': { deviceId: 'r', platform: 'reolink', translationKey: 'ptz_up' },
  'button.cour_bas': { deviceId: 'r', platform: 'reolink', translationKey: 'ptz_down' },
  'button.cour_gauche': { deviceId: 'r', platform: 'reolink', translationKey: 'ptz_left' },
  'button.cour_droite': { deviceId: 'r', platform: 'reolink', translationKey: 'ptz_right' },
  'button.cour_stop': { deviceId: 'r', platform: 'reolink', translationKey: 'ptz_stop' },
  'button.cour_redemarrer': { deviceId: 'r', platform: 'reolink', translationKey: null },
});

test('ptzDe Reolink : les quatre sens et l’arrêt, en mode continu (maintenir pour bouger)', () => {
  const S = etats(...[...REOLINK.entityMeta.keys()]);
  assert.deepEqual(ptzDe(REOLINK, S, 'camera.cour'), {
    mode: 'continu', haut: 'button.cour_haut', bas: 'button.cour_bas', gauche: 'button.cour_gauche', droite: 'button.cour_droite', stop: 'button.cour_stop',
  });
});

test('ptzDe : une caméra qu’on ne saurait pas arrêter ne se pilote pas', () => {
  const sans = indexDe({ ...Object.fromEntries(REOLINK.entityMeta), 'button.cour_stop': { deviceId: 'r', platform: 'reolink', translationKey: 'ptz_stop', disabled: true } });
  assert.equal(ptzDe(sans, etats(...[...sans.entityMeta.keys()]), 'camera.cour'), null);
});

test('ptzDe Tapo (tplink) : un cran par appui, rien à arrêter', () => {
  const i = indexDe({
    'camera.tapo': { deviceId: 't', platform: 'tplink', translationKey: 'live_view' },
    'button.tapo_g': { deviceId: 't', platform: 'tplink', translationKey: 'pan_left' },
    'button.tapo_d': { deviceId: 't', platform: 'tplink', translationKey: 'pan_right' },
    'button.tapo_h': { deviceId: 't', platform: 'tplink', translationKey: 'tilt_up' },
  });
  assert.deepEqual(ptzDe(i, etats('button.tapo_g', 'button.tapo_d', 'button.tapo_h'), 'camera.tapo'),
    { mode: 'pas', gauche: 'button.tapo_g', droite: 'button.tapo_d', haut: 'button.tapo_h' }, 'les sens que l’appareil a, pas ceux qu’il n’a pas');
});

test('ptzDe : sans signe sûr, pas de croix — UniFi Protect, ONVIF, une caméra sans appareil, un bouton d’une autre plateforme', () => {
  assert.equal(ptzDe(UNIFI, etats('switch.porte_privacy'), 'camera.porte'), null, 'UniFi Protect n’a pas de commande de direction');
  const onvif = indexDe({ 'camera.o': { deviceId: 'o', platform: 'onvif', translationKey: null }, 'button.o_x': { deviceId: 'o', platform: 'onvif', translationKey: 'ptz_up' } });
  assert.equal(ptzDe(onvif, etats('button.o_x'), 'camera.o'), null, 'ONVIF ne dit pas si la caméra bouge : service sans entité');
  assert.equal(ptzDe(indexDe({ 'camera.n': { platform: 'reolink' } }), etats('camera.n'), 'camera.n'), null, 'sans appareil, rien à lire');
  const autre = indexDe({
    'camera.c': { deviceId: 'c', platform: 'reolink', translationKey: null },
    'button.c_x': { deviceId: 'c', platform: 'autre', translationKey: 'ptz_up' },
    'button.c_s': { deviceId: 'c', platform: 'reolink', translationKey: 'ptz_stop' },
  });
  assert.equal(ptzDe(autre, etats('button.c_x', 'button.c_s'), 'camera.c'), null, 'un bouton d’une autre intégration n’est pas une direction');
  assert.equal(ptzDe(REOLINK, {}, 'camera.cour'), null, 'des boutons sans état ne sont pas là');
});

test('camcmd.js ne lit aucun entity_id : la table est faite de plateformes et de clés de traduction', () => {
  const s = lire('src/camcmd.js').split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  assert.ok(!/['"](button|switch|camera)\.[a-z_]+['"]/.test(s), 'un entity_id est écrit dans camcmd.js');
});

// ── Le branchement ──────────────────────────────────────────────────────────

test('CamLive : une caméra privée ne demande plus de flux, et le DIT', () => {
  const s = lire('src/camera.jsx');
  assert.ok(s.includes('export function CamLive({ hass, haid, online: enLigne = true, nom = \'\' }) {'));
  assert.ok(s.includes('const prive = camPrivee(LOGGIA_INDEX, hass && hass.states, haid);\n  const online = enLigne && !prive;'), 'privée = comme hors ligne pour le flux');
  assert.ok(s.includes('}, [haid, online, authentifie, conn, regardee]);'), 'l’effet du direct garde ses dépendances');
  assert.ok(s.indexOf('if (prive) return <PanneauPrive nom={nom} />;') < s.indexOf("if (mode === 'off') return null;"), 'le mot « Privé » passe avant le repli muet d’une caméra hors ligne');
  assert.ok(s.includes("{mode === 'video' && <BoutonSon vidRef={vidRef} nom={nom} />}"), 'le son : en direct vidéo seulement');
  assert.ok(s.includes('<CamOrientation hass={hass} haid={haid} nom={nom} />'));
});

test('le son : muet par défaut, un toucher le rend, une seule caméra, coupé en quittant', () => {
  const s = lire('src/camcommandes.jsx');
  const son = s.slice(s.indexOf('export function BoutonSon'), s.indexOf('// Le sens, son glyphe'));
  assert.ok(son.includes('if (!present) return null;'), 'pas de bouton sans son dans le flux');
  assert.ok(son.includes('aDuSon(vidRef.current) === true'));
  assert.ok(son.includes('v.muted = false;') && son.includes('prendreLeSon(cle,'), 'le toucher rend le son et prend la place de l’autre');
  assert.ok(son.includes('return () => { if (v) v.muted = true; rendreLeSon(cle); };'), 'quitter coupe le son');
  assert.ok(son.includes('p.catch(() => { v.muted = true;'), 'un son refusé par le navigateur ne reste pas affiché « écoute »');
  assert.ok(s.includes("const CHOISI = { background: 'var(--o-accent-fond)' };"), 'choisi = bleu plein');
  assert.ok(/<video [^>]*autoPlay muted playsInline/.test(lire('src/camera.jsx')), 'la balise reste muette tant que personne ne demande');
});

test('la croix : dans la fiche seulement, maintenir pour bouger avec arrêt au relâchement, un cran par appui sinon', () => {
  const s = lire('src/camcommandes.jsx');
  assert.ok(s.includes("r.closest('[role=\"dialog\"]')"), 'la fiche est reconnue à sa feuille');
  assert.ok(s.includes('{fiche && ('), 'sur la tuile, rien : tout le cadre agrandit');
  assert.ok(s.includes('onPointerDown: (e) => demarrer(e, b.sens), onPointerUp: arreter, onPointerCancel: arreter, onLostPointerCapture: arreter'), 'le mouvement s’arrête au relâchement, quoi qu’il arrive au doigt');
  assert.ok(s.includes('if (ptz.stop) presser(ptz.stop);'), 'l’arrêt est le bouton d’arrêt de l’intégration');
  assert.ok(s.includes('{ onClick: (e) => { e.stopPropagation(); presser(ptz[b.sens]); } }'), 'un cran par appui pour les caméras à pas');
  assert.ok(s.includes('m.enCours && m.ptz && m.ptz.stop'), 'la croix qui disparaît en plein mouvement arrête la caméra');
  assert.ok(s.includes('if (!ptz) return null;'), 'rien sans de quoi bouger');
});

test('la vue Sécurité : « Privé » à la place de « Hors ligne », sur le tag et la sous-ligne', () => {
  const s = lire('src/views/securite.jsx');
  assert.ok(s.includes('const prive = camPrivee(LOGGIA_INDEX, S, c.haid);'));
  assert.ok(s.includes("return prive ? { ...tuile, online: true, tag: tr('Privé').toUpperCase(), sub: <SousPrive /> } : tuile;"), 'privée : le tag et la sous-ligne disent Privé, la tuile n’est pas grisée comme une panne');
  assert.ok(s.includes('sub: sousCamera(online, ev),') && s.includes("tr('HORS LIGNE')"), 'une vraie panne garde son « Hors ligne » (ligne épinglée par evenement.test.mjs)');
  assert.ok(s.includes('online: cameraEnLigne(c, S)'), 'le compteur garde la règle commune de l’Accueil (audit du 12/11)');
});
