// L'Accueil ne garde que l'essentiel (16/09, ADR 0035) : la tuile Alarme en
// tete de la banniere, plus de grand panneau, « En ce moment » sans prises,
// les modes en icones au telephone, la sirene reconnue meme en interrupteur.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tuileAlarme, estSirene, ICONES_ARMEMENT } from '../src/attention.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
const css = readFileSync(join(RACINE, 'src', 'index.css'), 'utf8');
const en = readFileSync(join(RACINE, 'src', 'langues', 'en.js'), 'utf8');
const NL = String.fromCharCode(10);
const bloc = (debut, fin) => { const d = src.indexOf(debut); assert.ok(d >= 0, debut + ' introuvable'); const f = src.indexOf(fin, d + 1); return src.slice(d, f < 0 ? undefined : f); };
const home = bloc('function Dashboard(', NL + '}');

test('la tuile Alarme : l’etat et le mode, l’icone du mode, la couleur — ou rien', () => {
  assert.deepEqual(tuileAlarme({ state: 'disarmed' }), { texte: 'Désarmée', icone: 'shield', couleur: 'var(--o-ok)', rgb: 'var(--o-ok-rgb)' });
  assert.deepEqual(tuileAlarme({ state: 'armed_night' }), { texte: 'Armée · Nuit', icone: 'moon', couleur: 'var(--o-purple)', rgb: 'var(--o-purple-rgb)' });
  assert.deepEqual(tuileAlarme({ state: 'armed_away' }), { texte: 'Armée · Absent', icone: 'plane-departure', couleur: 'var(--o-warn2)', rgb: 'var(--o-warn2-rgb)' });
  assert.deepEqual(tuileAlarme({ state: 'armed_home' }), { texte: 'Armée · Maison', icone: 'home', couleur: 'var(--o-accent-soft)', rgb: 'var(--o-accent-rgb)' });
  assert.deepEqual(tuileAlarme({ state: 'armed_vacation' }), { texte: 'Armée · Vacances', icone: 'umbrella-beach', couleur: 'var(--o-warn2)', rgb: 'var(--o-warn2-rgb)' });
  assert.deepEqual(tuileAlarme({ state: 'arming' }), { texte: 'Activation…', icone: 'shield', couleur: 'var(--o-warn)', rgb: 'var(--o-warn-rgb)' });
  assert.deepEqual(tuileAlarme({ state: 'pending' }).texte, 'Activation…');
  assert.deepEqual(tuileAlarme({ state: 'triggered' }), { texte: 'Déclenchée', icone: 'bell-ring', couleur: 'var(--o-bad)', rgb: 'var(--o-bad-rgb)' });
  assert.deepEqual(tuileAlarme({ state: 'armed_custom_bypass' }), { texte: 'Armée', icone: 'shield-check', couleur: 'var(--o-warn2)', rgb: 'var(--o-warn2-rgb)' }, 'un mode inconnu reste une alarme armee');
  assert.equal(tuileAlarme({ state: 'unavailable' }), null);
  assert.equal(tuileAlarme(null), null);
  assert.deepEqual(Object.keys(ICONES_ARMEMENT), ['alarm_disarm', 'alarm_arm_home', 'alarm_arm_away', 'alarm_arm_night', 'alarm_arm_vacation'], 'une icone par armement');
});

test('une sirene : le domaine siren, ou un interrupteur qui se nomme ainsi', () => {
  assert.equal(estSirene('siren.interieure', { attributes: {} }), true);
  assert.equal(estSirene('switch.sirene_interieure', { attributes: { friendly_name: 'Sirène intérieure' } }), true, 'par l’identifiant');
  assert.equal(estSirene('switch.zigbee_0x1234', { attributes: { friendly_name: 'Sirène du garage' } }), true, 'par le nom, accent compris');
  assert.equal(estSirene('input_boolean.siren_test', null), true);
  assert.equal(estSirene('switch.camera_entree_voyant', { attributes: { friendly_name: 'Caméra entrée Voyant' } }), false);
  assert.equal(estSirene('binary_sensor.sirene', { attributes: { friendly_name: 'Sirène' } }), false, 'un capteur n’est pas une sirene');
  assert.equal(estSirene(null, null), false);
});

test('la banniere : l’alarme d’abord, d’un tap vers la vue ; « en ce moment » compte l’essentiel', () => {
  const c = home.slice(home.indexOf('const cases = [];'), home.indexOf('if (!cases.length) return null;'));
  assert.ok(c.indexOf('key="al"') >= 0 && c.indexOf('key="al"') < c.indexOf('key="ex"'), 'l’alarme avant le reseau');
  assert.ok(c.includes('if (alarmeTuile) cases.push(') && c.includes('<Fi i={alarmeTuile.icone} color={alarmeTuile.couleur} size={17} />') && c.includes("{tr('ALARME')}"), 'la tuile, d’apres tuileAlarme');
  assert.ok(home.includes("al: () => onNav && onNav('securite'),") && home.includes("libelles = { al: tr('Voir la sécurité'),"), 'un tap mene a la vue Securite');
  assert.ok(home.includes('const alarmeTuile = tuileAlarme(alarmRailId && dashHass && dashHass.states ? dashHass.states[alarmRailId] : null);'), 'd’apres l’etat du panneau');
  assert.ok(c.includes('if (nEnCours > 0) cases.push(') && c.includes("{tr('EN CE MOMENT')}") && !c.includes('APPAREILS ACTIFS'), 'la tuile compte ce qui tourne vraiment, plus les prises');
  assert.ok(home.includes("if (al && S[al].state === 'triggered') alerte = true;") && !home.includes("tr('Alarme désarmée')"), 'la phrase des faits ne repete plus l’alarme');
});

test('plus de grand panneau Securite sur l’Accueil', () => {
  assert.ok(src.includes("const ACC_MAIN = ['favoris', 'scenes', 'pieces', 'cameras'];"), 'plus de section securite');
  assert.ok(src.includes("const ACC_NOMS = () => ({ attention: tr('À surveiller'), favoris: tr('Favoris'),"), 'ni son nom');
  assert.ok(src.includes("const tete = (zone === 'main' ? [] : ['attention']).filter(s => manquants.indexOf(s) >= 0);"), 'rien en tete de la colonne');
  assert.ok(!home.includes('carteSecurite') && !home.includes('<TuilesSecurite') && !home.includes('<RailArm') && !home.includes('<RailSerrure') && !home.includes('comptesSec'), 'la carte, ses tuiles, ses boutons et la glissiere ont quitte l’Accueil');
  assert.ok(!src.includes('function RailArm(') && !src.includes('function RailSerrure(') && !src.includes('function serrureRailId('), 'et leur code avec');
  assert.ok(src.includes('function TuilesSecurite('), 'la rangee de tuiles vit dans la vue Securite');
});

test('« En ce moment » : l’essentiel, calcule avant le rendu', () => {
  const m = home.slice(home.indexOf('const momentRows = [];'), home.indexOf('const nEnCours = momentRows.length;'));
  assert.ok(home.indexOf('const momentRows = [];') < home.indexOf(NL + '  return (' + NL), 'avant le return : la banniere lit le compte');
  assert.ok(m.includes("if (dom !== 'vacuum' && dom !== 'lawn_mower') return;"), 'les machines seulement — plus de prise, de ventilateur, de vanne');
  assert.ok(!m.includes('lampes') && !m.includes("commande(id, dom, 'turn_off')") && !m.includes('close_valve'), 'plus de geste generique');
  assert.ok(m.includes('const np = mpRead(S0, id); if (!np.playing) return;') && m.includes('if (mLv && mLv.active && (!a || aEnt(notifIds().dishwasher)))') && m.includes("['heating', 'cooling'].indexOf((S0[z.haid].attributes || {}).hvac_action) >= 0"), 'lecture, lave-vaisselle, chauffage');
  assert.ok(m.includes("const bouge = e.state === 'opening' || e.state === 'closing';") && m.includes('if (!bouge) return;') && !m.includes('ni ouvert ni fermé'), 'un volet en mouvement seulement');
  assert.ok(home.includes("railPanel(tr('En ce moment'), tr('Lecture, machines, chauffage, volets en mouvement'),"), 'le sous-titre dit ce qu’il montre');
});

test('les modes de l’alarme : l’icone, et le mot qui s’efface au telephone', () => {
  const c = bloc('function CvAlarm(', NL + '}');
  assert.ok(c.includes('<Fi i={ICONES_ARMEMENT[svc] || \'shield\'} size={13} />') && c.includes('<span className="o-armchip-txt">{lbl}</span>') && c.includes('aria-label={lbl} aria-pressed={actif} className="o-armchip"'), 'icone + mot, le mot lisible par les lecteurs d’ecran');
  assert.ok(c.includes("{(cpt && svcVise === svc) ? <span>{cpt.reste + ' s'}</span> :"), 'le decompte reste visible partout');
  assert.ok(css.includes('.o-armchip-txt { display: none !important; }'), 'au telephone, l’icone seule');
});

test('la sirene : reconnue meme en interrupteur, choisie si configuree, pilotee dans son domaine', () => {
  const vue = bloc('function SecuriteContent(', NL + '}');
  assert.ok(vue.includes("const sireneChoisie = loggiaEnt('sirene', null);") && vue.includes('...Object.keys(S).filter(id => id !== sireneChoisie && S[id] && estSirene(id, S[id]))'), 'le choix, puis la detection');
  const c = bloc('function CvSirene(', NL + '}');
  assert.ok(c.includes("const dom = String(id).split('.')[0];") && c.includes('commanderService(hass, id, dom, svc,') && c.includes("if (dom === 'siren' && ((+a.supported_features || 0) & SIRENE_DUREE))"), 'un switch s’allume comme un switch ; la duree n’existe que pour siren');
  assert.ok(src.includes("securite: [...secBaseKeys(), 'camera.', 'siren.', 'switch.', ...secKeys,"), 'les interrupteurs sont relus sur la vue');
  for (const k of ['ALARME', 'Armée · Maison', 'Armée · Absent', 'Armée · Nuit', 'Armée · Vacances', 'Déclenchée', 'EN CE MOMENT', 'Lecture, machines, chauffage, volets en mouvement']) {
    assert.ok(en.includes("'" + k + "':"), k + ' manque a en.js');
  }
});
