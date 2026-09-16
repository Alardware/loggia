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
  assert.ok(src.includes('function CvAlarm({ id, hass, sans = false, message = null }) {'), 'la prop');
  const c = bloc('function CvAlarm(', NL + '}');
  const iNom = c.indexOf('<div style={RM_NAME}>{cvName(st, id)}</div>');
  const iMsg = c.indexOf('{message && message.texte && (');
  const iChips = c.indexOf('{CHIPS.map(([lbl, svc, actif]) => (');
  assert.ok(iNom >= 0 && iMsg > iNom && iChips > iMsg, 'le nom, puis le message, puis les boutons');
  assert.ok(c.includes("background: message.niveau === 'danger' ? 'rgba(var(--o-bad-rgb),.12)' : 'rgba(var(--o-warn-rgb),.12)'") && c.includes('<Fi i="triangle-warning" size={13}'), 'ambre ou rouge, avec son signe');
});

test('la carte Sirene : gabarit maison, bascule, tuiles d’apres les attributs seulement, test sonore', () => {
  const c = bloc('function CvSirene(', NL + '}');
  assert.ok(c.includes('<span style={RM_ICO(on ? \'rgba(var(--o-bad-rgb),.16)\' : \'var(--o-s1)\', col)}><Fi i="bell-ring" size={16} /></span>') && c.includes("{!mort && <RmBascule on={on} nom={nom} onToggle={() => call(on ? 'turn_off' : 'turn_on')} />}") && c.includes('<div style={RM_NAME}>{nom}</div>'), 'icone en haut a gauche, bascule a droite, nom sous l’icone');
  assert.ok(c.includes("{mort ? tr('Indisponible') : on ? tr('Sirène active') : tr('Sirène au repos')}"), 'l’etat, rouge quand elle sonne');
  assert.ok(c.includes("if (Array.isArray(a.available_tones) && a.available_tones.length) tuiles.push([tr('Sonneries'), String(a.available_tones.length)]);") && c.includes("if (typeof a.volume_level === 'number') tuiles.push([tr('Volume'), Math.round(a.volume_level * 100) + ' %']);"), 'les tuiles ne disent que ce que l’entite expose');
  assert.ok(!c.includes('dB') && !c.includes('entrée'), 'ni decibels ni delai d’entree inventes');
  assert.ok(c.includes("if ((+a.supported_features || 0) & SIRENE_DUREE) { call('turn_on', { duration: 3 }); setTimeout(() => setTest(false), 3000); return; }") && c.includes("setTimeout(() => { call('turn_off'); setTest(false); }, 3000);") && src.includes('const SIRENE_DUREE = 16;'), 'trois secondes : par duration, sinon a la main');
  assert.ok(c.includes("{test ? tr('Test en cours…') : tr('Test sonore (3 s)')}"), 'le bouton');
});

test('la vue : la rangee des trois cartes remplace le bandeau, la presence y descend', () => {
  const vue = bloc('function SecuriteContent(', NL + '}');
  assert.ok(!vue.includes('armBtn') && !vue.includes('alarmShort') && !vue.includes('setAlarm') && !vue.includes('alarmRevertRef') && !vue.includes('demandeCode') && !vue.includes('réglages rapides'), 'le bandeau et son optimisme ont disparu');
  assert.ok(vue.includes("const sirenes = Object.keys(S).filter(id => id.indexOf('siren.') === 0 && S[id]);") && vue.includes('const msgAlarme = messageAlarme(alarmId ? S[alarmId] : null, comptesSecVue, S);'), 'les sirenes de la maison, le message de l’alarme');
  assert.ok(vue.includes('{alarmId && <Anim i={0}><div style={{ height: \'100%\', minHeight: 184 }}><CvAlarm id={alarmId} hass={hass} sans message={msgAlarme} /></div></Anim>}'), 'ta carte Alarme, avec son message');
  assert.ok(vue.includes('{sirenes.map((id, i) => <Anim key={id} i={1 + i}><div style={{ height: \'100%\', minHeight: 184 }}><CvSirene id={id} hass={hass} /></div></Anim>)}'), 'une carte par sirene');
  assert.ok(vue.includes('{people.length > 0 && <Anim i={1 + sirenes.length}><div style={{ height: \'100%\', minHeight: 184 }}><CvPresence hass={hass} /></div></Anim>}'), 'la presence, dans la rangee');
  assert.ok(vue.includes("{tr('Ouvrants')}</div>") && !vue.includes("tr('Ouvrants et présence')"), 'la section des ouvrants ne parle plus de presence');
  assert.ok(vue.includes("{tr('Alarme')} {alarmWord} · {resumeSecurite(comptesSecVue)}") && vue.includes('const cptAlarme = armCompte(alarmId ? S[alarmId] : null);'), 'la sous-ligne garde le decompte');
  assert.ok(src.includes("securite: [...secBaseKeys(), 'camera.', 'siren.', ...secKeys,"), 'les sirenes sont relues sur la vue');
});

test('la demo a une sirene, et les mots ont leur traduction', () => {
  assert.ok(demo.includes("'siren.interieure': s('off', { friendly_name: 'Sirène intérieure', supported_features: 7, available_tones: ['alarme', 'carillon'] }),"), 'deux sonneries, pas de duree geree');
  for (const k of ['Sirène active', 'Sirène au repos', 'Test sonore (3 s)', 'Test en cours…', 'Sonneries', 'Déclenchée par {noms}', '{n} ouvrants ouverts : {noms}', '1 ouvrant ouvert : {noms}', '{n} capteurs contournés', '1 capteur contourné']) {
    assert.ok(en.includes("'" + k + "':"), k + ' manque a en.js');
  }
});
