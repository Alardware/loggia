// ─────────────────────────────────────────────────────────────────────────────
// « Je pars » montre d'abord ce qui restera ouvert (04/11, étape 2 du rapport sur l'usage).
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
const D = await import('../src/depart.js');
const src = (f) => readFileSync(new URL('../src/' + f, import.meta.url), 'utf8');

const bin = (dc, state, nom) => ({ state, attributes: { device_class: dc, friendly_name: nom } });
const cov = (dc, state, pos, nom) => ({ state, attributes: { device_class: dc, friendly_name: nom, ...(pos == null ? {} : { current_position: pos }) } });

test('rien d’ouvert : rien à dire, « Je pars » part tout de suite', () => {
  const r = D.restesAvantDepart({ 'binary_sensor.f': bin('window', 'off', 'Fenêtre'), 'cover.g': cov('garage', 'closed', 0, 'Garage') });
  assert.deepEqual(r, { portails: [], ouverts: [] });
  assert.equal(D.resteQuelqueChose(r), false);
  assert.equal(D.resteQuelqueChose(D.restesAvantDepart(null)), false);
});

test('les portes avant les fenêtres, chacune avec son nom', () => {
  const r = D.restesAvantDepart({
    'binary_sensor.a': bin('window', 'on', 'Fenêtre de la chambre'),
    'binary_sensor.b': bin('door', 'on', 'Porte d’entrée'),
    'binary_sensor.c': bin('opening', 'on', 'Velux'),
    'binary_sensor.d': bin('motion', 'on', 'Mouvement'),
  });
  assert.deepEqual(r.ouverts.map(o => [o.nom, o.famille]), [['Porte d’entrée', 'portes'], ['Fenêtre de la chambre', 'fenetres'], ['Velux', 'fenetres']]);
  assert.ok(D.resteQuelqueChose(r));
});

test('un garage ou un portail motorisé ouvert se ferme d’ici ; les volets ne comptent pas', () => {
  const r = D.restesAvantDepart({
    'cover.garage': cov('garage', 'open', 100, 'Garage'),
    'cover.portail': cov('gate', 'open', null, 'Portail'),
    'cover.salon': cov('shutter', 'open', 100, 'Volet du salon'),
    'cover.ferme': cov('gate', 'closed', 0, 'Portillon'),
    'cover.fermeture': cov('garage', 'closing', 40, 'Garage 2'),
  });
  assert.deepEqual(r.portails.map(p => p.id), ['cover.garage', 'cover.portail']);
  assert.deepEqual(r.ouverts, []);
});

test('mêmes exclusions que la rangée sûreté : injoignable, masqué, groupe', () => {
  const S = {
    'binary_sensor.muet': bin('door', 'unavailable', 'Muet'),
    'binary_sensor.masque': bin('door', 'on', 'Masqué'),
    'binary_sensor.groupe': { state: 'on', attributes: { device_class: 'window', entity_id: ['binary_sensor.a'] } },
    'binary_sensor.plateforme': bin('window', 'on', 'Groupe HA'),
    'cover.masque': cov('garage', 'open', 100, 'Garage masqué'),
  };
  const r = D.restesAvantDepart(S, {
    masque: (id) => id.endsWith('.masque'),
    plateforme: (id) => id === 'binary_sensor.plateforme' ? 'group' : null,
  });
  assert.deepEqual(r, { portails: [], ouverts: [] });
});

test('le capteur de porte que porte un garage motorisé se tait : le garage le dit déjà', () => {
  const S = { 'cover.garage': cov('garage', 'open', 100, 'Garage'), 'binary_sensor.garage': bin('garage_door', 'on', 'Porte du garage') };
  const r = D.restesAvantDepart(S, { voisins: (id) => id === 'binary_sensor.garage' ? ['binary_sensor', 'cover'] : [] });
  assert.deepEqual(r.portails.map(p => p.id), ['cover.garage']);
  assert.deepEqual(r.ouverts, []);
  const seul = D.restesAvantDepart({ 'binary_sensor.garage': bin('garage_door', 'on', 'Porte du garage') });
  assert.deepEqual(seul.ouverts.map(o => o.id), ['binary_sensor.garage'], 'sans moteur, il reste seul à le dire');
});

test('« Je pars » passe par la feuille, les autres scénarios partent tout de suite', () => {
  const s = src('app/scenarios.jsx');
  // ASSERTION MODIFIÉE (05/11, étape 4) : « Bonne nuit » passe par la même feuille que « Je pars ».
  assert.ok(s.includes("if (AVANT_DE_LANCER.includes(id) && resteQuelqueChose(restesMaintenant(hass))) { setAvant(id); return; }"));
  assert.ok(s.includes('avant, partir, renoncer: () => setAvant(null) };'));
  const f = src('app/depart.jsx');
  assert.ok(f.includes('onClick={() => sc.partir(sc.avant)}'), 'c’est la feuille qui lance');
  assert.ok(f.includes("'cover', 'close_cover'"), 'un portail se ferme d’ici');
  assert.ok(!/tr\('Annuler'\)/.test(f), 'pas d’« Annuler » qui ne fait que fermer : la croix suffit');
  for (const v of ['accueil/briques.jsx', 'vues/scenarios.jsx']) assert.ok(src(v).includes('<FeuilleDepart hass={hass} sc={sc} />'), v);
});

test('« Bonne nuit » sur le même modèle : la feuille, son titre, son bouton — et les actions du moment n’y échappent pas', () => {
  const f = src('app/depart.jsx');
  assert.ok(f.includes("export const AVANT_DE_LANCER = ['depart', 'nuit'];"));
  assert.ok(f.includes("{nuit ? tr('Avant de dormir') : tr('Avant de partir')}"));
  assert.ok(f.includes("{nuit ? (reste ? tr('{nom} quand même', { nom }) : nom) : (reste ? tr('Partir quand même') : tr('Partir'))}"));
  const m = src('accueil/actionsmoment.jsx');
  assert.ok(m.includes('if (a.scenario && AVANT_DE_LANCER.includes(a.scenario) && resteQuelqueChose(restesMaintenant(hass))) { setAvant(a); return; }'),
    'le bouton « Bonne nuit » de l’Accueil lançait le scénario sans regarder ce qui reste ouvert');
  assert.ok(m.includes('<FeuilleDepart hass={hass} sc={feuille} />'));
});
