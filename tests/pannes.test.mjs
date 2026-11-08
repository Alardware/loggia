// ─────────────────────────────────────────────────────────────────────────────
// Une panne qui s'explique (06/11, étape 9 du rapport sur l'usage) : ce qui se tait, la piste, la page de Home Assistant.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aidePanne, integrationDeLaPanne, nomIntegration, reseauDe, genrePanne } from '../src/pannes.js';

const src = (f) => readFileSync(new URL('../src/' + f, import.meta.url), 'utf8');
const MUET = { state: 'unavailable', attributes: {} };
const PONT = { fabricant: 'Zigbee2MQTT', modele: 'Bridge' };

test('une entité qui répond n’a pas d’aide', () => {
  assert.equal(aidePanne({ id: 'light.a', st: { state: 'on' } }), null);
  assert.equal(aidePanne({ id: 'light.a', st: { state: 'unknown' } }), null, 'inconnu n’est pas injoignable');
  assert.equal(aidePanne({}), null);
});

test('l’intégration, par son nom : Zigbee2MQTT derrière son pont, un nom inconnu en capitale', () => {
  assert.equal(integrationDeLaPanne('mqtt', PONT), 'zigbee2mqtt');
  assert.equal(integrationDeLaPanne('mqtt', { fabricant: 'Zigbee2MQTT', modele: 'Group' }), 'mqtt', 'un groupe n’est pas le pont');
  assert.equal(nomIntegration('zigbee2mqtt'), 'Zigbee2MQTT');
  assert.equal(nomIntegration('zha'), 'Zigbee (ZHA)');
  assert.equal(nomIntegration('ma_passerelle'), 'Ma passerelle');
  assert.deepEqual(['zha', 'shelly', 'tuya', 'bthome', 'inconnue'].map(reseauDe), ['maille', 'wifi', 'service_en_ligne', 'portee_courte', null]);
  assert.deepEqual(['light.a', 'switch.a', 'cover.a', 'binary_sensor.a', 'climate.a', 'media_player.a', 'camera.a', 'vacuum.a'].map(id => genrePanne(id)),
    ['lampe', 'appareil', 'volet', 'capteur', 'thermostat', 'lecteur', 'camera', 'appareil']);
  assert.equal(genrePanne('switch.a', true), 'prise');
});

test('la piste suit le réseau ; une intégration entière se dit elle-même', () => {
  const zigbee = aidePanne({ id: 'binary_sensor.fumee', st: MUET, plateforme: 'mqtt', pont: PONT });
  assert.equal(zigbee.titre, 'Le capteur ne répond plus');
  assert.match(zigbee.conseil, /^Vérifiez son alimentation \(pile ou prise\), et qu’un autre appareil Zigbee branché sur secteur/);
  assert.equal(aidePanne({ id: 'light.a', st: MUET, plateforme: 'shelly' }).conseil, 'Vérifiez son alimentation et sa connexion au Wi-Fi.');
  assert.match(aidePanne({ id: 'climate.a', st: MUET, plateforme: 'netatmo' }).conseil, /service en ligne du fabricant \(Netatmo\)/);
  // L'intégration Alexa de Home Assistant (celle de l'Echo de la démo) : le service d'Amazon.
  assert.match(aidePanne({ id: 'media_player.echo', st: MUET, plateforme: 'alexa_devices' }).conseil, /service en ligne du fabricant \(Alexa Devices\)/);
  assert.equal(aidePanne({ id: 'sensor.a', st: MUET }).conseil, 'Vérifiez son alimentation, puis son intégration dans Home Assistant.');
  assert.match(aidePanne({ id: 'switch.p', st: MUET, plateforme: 'zha', estPrise: true }).conseil, /^Vérifiez qu’elle est branchée et à portée du réseau Zigbee\. Loggia la reprendra/);
  const toute = aidePanne({ id: 'light.a', st: MUET, plateforme: 'hue', integrationMuette: true });
  assert.equal(toute.titre, 'Philips Hue ne répond plus');
  assert.match(toute.conseil, /c’est l’intégration qu’il faut regarder/);
});

test('la page de Home Assistant : celle de l’appareil, sinon de l’intégration — à un administrateur seulement', () => {
  assert.equal(aidePanne({ id: 'light.a', st: MUET, plateforme: 'zha', appareil: 'abc 1', admin: true }).chemin, '/config/devices/device/abc%201');
  assert.equal(aidePanne({ id: 'light.a', st: MUET, plateforme: 'zha', admin: true }).chemin, '/config/integrations/integration/zha');
  assert.equal(aidePanne({ id: 'light.a', st: MUET, plateforme: 'zha', appareil: 'abc' }).chemin, null, 'un compte ordinaire : pas de lien');
});

test('les branchements : sous l’en-tête commun, sous FicheEntete et FicheAppareil, la prise garde ses mots', () => {
  const fc = src('fichecommune.jsx');
  assert.match(fc, /\{!enReglages && <AidePanneFiche \/>\}/);
  const f = src('appareils/fiches.jsx');
  assert.match(f, /\{id && <AidePanne id=\{id\} \/>\}/, 'FicheEntete');
  assert.match(f, /<AidePanne id=\{id\} hass=\{hass\} \/>/, 'FicheAppareil');
  assert.match(f, /<FicheEntite\.Provider value=\{ouverte \? \{ id: ouverte, hass, prise: /);
  assert.match(src('chrome/entete.jsx'), /<FicheEntite\.Provider value=\{\{ id: fichePrise, hass: getHass\(\), prise: true \}\}>/);
  assert.match(src('ficheprise.jsx'), /<LienPanne id=\{id\} hass=\{hass\} \/>/);
  const a = src('aidepanne.jsx');
  assert.match(a, /return v && v\.id && !v\.prise \? <AidePanne/, 'la fiche d’une prise dit la sienne');
  assert.match(a, /if \(typeof window === 'undefined' \|\| window\.__loggiaDemo\) return null;/, 'pas de lien dans la démo');
  assert.match(a, /admin: !compteOrdinaire\(h\)/);
});

test('« À surveiller » : toujours l’intégration ENTIÈRE (sa décision du 16/09)', () => {
  const at = src('attention.js');
  assert.match(at, /if \(i\.kind === 'integration'\) \{/);
  assert.doesNotMatch(at, /i\.kind === 'appareils'\) \{\s*ajouter/, 'pas d’appareil isolé');
});
