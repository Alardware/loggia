// Trois cartes a la place du bandeau (16/09, ADR 0034) : la carte Alarme du
// catalogue avec un message entre le nom et les boutons, une carte Sirene,
// la carte Presence deplacee — et rien d'invente.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { messageAlarme } from '../src/attention.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
const demo = readFileSync(join(RACINE, 'src', 'demo.js'), 'utf8');
const en = readFileSync(join(RACINE, 'src', 'langues', 'en.js'), 'utf8');
const NL = String.fromCharCode(10);
const bloc = (debut, fin) => { const d = src.indexOf(debut); assert.ok(d >= 0, debut + ' introuvable'); const f = src.indexOf(fin, d + 1); return src.slice(d, f < 0 ? undefined : f); };
const S = { 'binary_sensor.porte': { state: 'on', attributes: { friendly_name: 'Porte d’entrée' } }, 'binary_sensor.baie': { state: 'on', attributes: { friendly_name: 'Baie du salon' } } };
const comptes = { portes: { total: 1, ouverts: 1, noms: ['Porte d’entrée'] }, fenetres: { total: 2, ouverts: 1, noms: ['Baie du salon'] }, ok: false };
const al = (state, attributes = {}) => ({ state, attributes });

test('le message de la carte Alarme : rien quand elle est desarmee, meme un ouvrant ouvert', () => {
  assert.equal(messageAlarme(al('disarmed'), comptes, S), null);
  assert.equal(messageAlarme(null, comptes, S), null);
  assert.equal(messageAlarme(al('armed_away'), { ok: true }, S), null, 'armee, rien d’ouvert : rien a dire');
});

test('armee ou en cours d’armement : les ouvrants ouverts, nommes', () => {
  assert.deepEqual(messageAlarme(al('arming'), comptes, S), { niveau: 'warn', texte: '2 ouvrants ouverts : Porte d’entrée, Baie du salon' });
  assert.deepEqual(messageAlarme(al('armed_night'), { portes: { total: 1, ouverts: 1, noms: ['Porte d’entrée'] } }, S), { niveau: 'warn', texte: '1 ouvrant ouvert : Porte d’entrée' });
  assert.deepEqual(messageAlarme(al('pending'), { fenetres: { noms: ['Baie du salon'] } }, S), { niveau: 'warn', texte: '1 ouvrant ouvert : Baie du salon' });
});

test('le panneau qui parle (Alarmo) prime : open_sensors et bypassed_sensors, nommes par leurs etats', () => {
  assert.deepEqual(messageAlarme(al('armed_away', { open_sensors: { 'binary_sensor.baie': 'open' } }), comptes, S), { niveau: 'warn', texte: '1 ouvrant ouvert : Baie du salon' }, 'le panneau sait mieux que nos comptes');
  assert.deepEqual(messageAlarme(al('armed_home', { bypassed_sensors: ['binary_sensor.porte'] }), { ok: true }, S), { niveau: 'warn', texte: '1 capteur contourné' });
  assert.deepEqual(messageAlarme(al('armed_home', { bypassed_sensors: ['binary_sensor.porte', 'binary_sensor.baie'] }), comptes, S).texte, '2 ouvrants ouverts : Porte d’entrée, Baie du salon · 2 capteurs contournés');
  assert.deepEqual(messageAlarme(al('armed_away', { open_sensors: [{ entity_id: 'binary_sensor.x', name: 'Cave' }] }), { ok: true }, S), { niveau: 'warn', texte: '1 ouvrant ouvert : Cave' }, 'une liste d’objets nommes vaut aussi');
});

test('declenchee : par quoi, si le panneau le dit', () => {
  assert.deepEqual(messageAlarme(al('triggered'), comptes, S), { niveau: 'danger', texte: 'Alarme déclenchée' });
  assert.deepEqual(messageAlarme(al('triggered', { open_sensors: { 'binary_sensor.porte': 'open' } }), comptes, S), { niveau: 'danger', texte: 'Déclenchée par Porte d’entrée' });
  assert.equal(messageAlarme(al('triggered', { open_sensors: { 'binary_sensor.inconnu': 'open' } }), comptes, null).texte, 'Déclenchée par binary_sensor.inconnu', 'sans etat pour le nommer : son identifiant');
});

test('la carte Alarme du catalogue porte le message entre le nom et les boutons', () => {
  assert.ok(src.includes('function CvAlarm({ id, hass, sans = false, message = null, label = null }) {'), 'la prop');
  const c = bloc('function CvAlarm(', NL + '}');
  const iNom = c.indexOf('<div style={RM_NAME}>{label || cvName(st, id)}</div>');
  const iMsg = c.indexOf('{message && message.texte && (');
  const iChips = c.indexOf('{CHIPS.map(([lbl, svc, actif]) => (');
  assert.ok(iNom >= 0 && iMsg > iNom && iChips > iMsg, 'le nom, puis le message, puis les boutons');
  assert.ok(c.includes("background: message.niveau === 'danger' ? 'rgba(var(--o-bad-rgb),.12)' : 'rgba(var(--o-warn-rgb),.12)'") && c.includes('<Fi i="triangle-warning" size={13}'), 'ambre ou rouge, avec son signe');
});

test('la carte Sirene : gabarit maison, bascule, tuiles d’apres les attributs seulement, test sonore', () => {
  const c = bloc('function CvSirene(', NL + '}');
  assert.ok(c.includes('<span style={RM_ICO(on ? \'rgba(var(--o-bad-rgb),.16)\' : \'var(--o-s1)\', col)}><Fi i="bell-ring" size={16} /></span>') && c.includes("{!mort && <RmBascule on={on} nom={nom} onToggle={() => call(on ? 'turn_off' : 'turn_on')} />}") && c.includes('<div style={RM_NAME}>{nom}</div>'), 'icone en haut a gauche, bascule a droite, nom sous l’icone');
  assert.ok(c.includes("{erreur || (mort ? tr('Indisponible') : on ? tr('Sirène active') : tr('Sirène au repos'))}"), 'l’etat, rouge quand elle sonne — ou ce qui a empeche le test');
  assert.ok(c.includes("if (Array.isArray(a.available_tones) && a.available_tones.length) tuiles.push([tr('Sonneries'), String(a.available_tones.length)]);") && c.includes("if (typeof a.volume_level === 'number') tuiles.push([tr('Volume'), Math.round(a.volume_level * 100) + ' %']);"), 'les tuiles ne disent que ce que l’entite expose');
  assert.ok(!c.includes('dB') && !c.includes('entrée'), 'ni decibels ni delai d’entree inventes');
  // ADR 0065 : les trois secondes sont tenues par le composant (`sirene.py`),
  // plus rien ne s'eteint depuis l'onglet — fermer l'ecran n'a plus d'effet.
  assert.ok(c.includes("hass.callWS({ type: 'loggia/sirene/tester', entity_id: id })"), 'le test part du composant');
  assert.ok(!c.includes("call('turn_off')") && !c.includes("{ duration: 3 }") && !src.includes('SIRENE_DUREE'), 'plus d’extinction ni de duree comptees dans l’onglet');
  assert.ok(c.includes("e && e.code === 'unauthorized' ? tr('Ce compte ne pilote pas cet appareil.') : tr('Le test n’a pas pu partir.')"), 'un refus se dit sur la carte');
  assert.ok(demo.includes("msg.type === 'loggia/sirene/tester'"), 'la demo simule le composant');
  assert.ok(c.includes("{test ? tr('Test en cours…') : tr('Test sonore (3 s)')}"), 'le bouton');
});

test('la vue : la rangee des trois cartes remplace le bandeau, la presence y descend', () => {
  const vue = bloc('function SecuriteContent(', NL + '}');
  assert.ok(!vue.includes('armBtn') && !vue.includes('alarmShort') && !vue.includes('setAlarm') && !vue.includes('alarmRevertRef') && !vue.includes('demandeCode') && !vue.includes('réglages rapides'), 'le bandeau et son optimisme ont disparu');
  assert.ok(vue.includes('estSirene(id, S[id])') && vue.includes('const msgAlarme = messageAlarme(alarmId ? S[alarmId] : null, comptesSecVue, S);'), 'les sirenes de la maison, le message de l’alarme');
  assert.ok(vue.includes("if (k.indexOf('alarm_control_panel.') === 0) return <CvAlarm id={k} hass={hass} sans message={k === alarmId ? msgAlarme : null} label={ed.labelOf(k)} />;"), 'ta carte Alarme, avec son message');
  assert.ok(vue.includes('if (S[k] && estSirene(k, S[k])) return <CvSirene id={k} hass={hass} label={ed.labelOf(k)} />;'), 'une carte par sirene');
  assert.ok(vue.includes("if (k === 'carte:presence') return <CvPresence hass={hass} />;") && vue.includes("...(people.length ? ['carte:presence'] : [])"), 'la presence, dans les cartes de la vue');
  assert.ok(vue.includes("if (k === 'sect:ouvrants') return tr('Ouvrants');") && !vue.includes("tr('Ouvrants et présence')"), 'la section des ouvrants ne parle plus de presence');
  assert.ok(vue.includes("{tr('Alarme')} {alarmWord} · {resumeSecurite(comptesSecVue)}") && vue.includes('const cptAlarme = armCompte(alarmId ? S[alarmId] : null);'), 'la sous-ligne garde le decompte');
  assert.ok(src.includes("securite: [...secBaseKeys(), 'camera.', 'siren.', 'switch.', ...secKeys,"), 'les sirenes sont relues sur la vue');
});

test('la demo a une sirene, et les mots ont leur traduction', () => {
  assert.ok(demo.includes("'siren.interieure': s('off', { friendly_name: 'Sirène intérieure', supported_features: 7, available_tones: ['alarme', 'carillon'] }),"), 'deux sonneries, pas de duree geree');
  for (const k of ['Sirène active', 'Sirène au repos', 'Test sonore (3 s)', 'Test en cours…', 'Le test n’a pas pu partir.', 'Sonneries', 'Déclenchée par {noms}', '{n} ouvrants ouverts : {noms}', '1 ouvrant ouvert : {noms}', '{n} capteurs contournés', '1 capteur contourné']) {
    assert.ok(en.includes("'" + k + "':"), k + ' manque a en.js');
  }
});
