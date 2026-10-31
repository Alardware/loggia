/* Chantier G1 (30/10), défaut D9 de la comparaison avec Gladys : NON corrigé (ADR 0300, décision finale de G1b).
 *
 * D9 disait : avec plusieurs `alarm_control_panel`, « armée » veut dire « n'importe quel panneau armé » — le garage seul armé,
 * ouvrir la porte de la maison dit « Ouvert, alarme armée ». Quatre règles de rattachement ont été essayées (zone, étage,
 * appareil) : chacune perdait une intrusion. Home Assistant ne dit JAMAIS quel secteur couvre quel ouvrant ; tout filtrage
 * peut taire une vraie intrusion. La règle d'avant G1 revient : un panneau armé, n'importe quel ouvrant prévient. Une alerte
 * de trop vaut mieux qu'une intrusion perdue. Ces tests l'épinglent ; le serveur aussi (tests/python/test_g1_alarme_secteurs.py). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
const A = await import('../src/attention.js');
const ST = await import('../src/state.js');
const lire = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const etat = (s, a = {}) => ({ state: s, attributes: a });
const porte = (s = 'on') => etat(s, { device_class: 'door', friendly_name: 'Porte' });
const ouvrants = (S) => A.pointsAttention({ S }).filter(p => p.cle.indexOf('ouvrant:') === 0).map(p => p.cle).sort();
const P = 'alarm_control_panel.';

test('D9 non corrigé : deux panneaux, un seul armé — n’importe quelle porte prévient', () => {
  const portes = { 'binary_sensor.porte_entree': porte(), 'binary_sensor.porte_garage': porte(), 'binary_sensor.fenetre_salon': porte() };
  const TOUTES = ['ouvrant:binary_sensor.fenetre_salon', 'ouvrant:binary_sensor.porte_entree', 'ouvrant:binary_sensor.porte_garage'];
  assert.deepEqual(ouvrants({ ...portes, [P + 'maison']: etat('disarmed'), [P + 'garage']: etat('armed_away') }), TOUTES, 'le garage seul armé');
  assert.deepEqual(ouvrants({ ...portes, [P + 'maison']: etat('armed_custom_bypass'), [P + 'garage']: etat('disarmed') }), TOUTES, 'la maison seule armée');
  assert.deepEqual(ouvrants({ ...portes, [P + 'maison']: etat('disarmed'), [P + 'garage']: etat('disarmed') }), [], 'tout désarmé : rien');
});

test('D9 non corrigé : la centrale rangée dans « Cave », armée, et un second panneau désarmé dans « Entrée » — la porte de l’Entrée prévient', () => {
  assert.deepEqual(ouvrants({ [P + 'principale']: etat('armed_away'), [P + 'second']: etat('disarmed'), 'binary_sensor.porte_entree': porte() }),
    ['ouvrant:binary_sensor.porte_entree']);
});

test('D9 non corrigé : une centrale filaire désarmée, simple passerelle de ses capteurs, et Alarmo armé — la porte prévient', () => {
  /* La règle « par appareil » taisait ce cas : la porte est un capteur de la centrale, désarmée ; Alarmo, sur son propre appareil,
   * est armé. Plus aucun rattachement : la porte prévient. */
  assert.deepEqual(ouvrants({ [P + 'centrale_filaire']: etat('disarmed'), [P + 'alarmo']: etat('armed_away'), 'binary_sensor.centrale_filaire_zone_3': porte() }),
    ['ouvrant:binary_sensor.centrale_filaire_zone_3']);
});

test('D9 non corrigé : un panneau muet ne compte jamais comme armé — rien de nouveau, rien de perdu', () => {
  // Un vrai panneau désarmé et une entité morte : rien.
  for (const muet of ['unavailable', 'unknown']) {
    assert.deepEqual(ouvrants({ [P + 'maison']: etat('disarmed'), [P + 'ancienne']: etat(muet), 'binary_sensor.porte_entree': porte() }), [], muet);
  }
  // Un vrai panneau armé et une entité morte : la porte prévient.
  assert.deepEqual(ouvrants({ [P + 'maison']: etat('armed_away'), [P + 'ancienne']: etat('unavailable'), 'binary_sensor.porte_entree': porte() }),
    ['ouvrant:binary_sensor.porte_entree']);
});

test('D9 non corrigé : plus aucun code de rattachement, à l’écran ni au serveur', () => {
  assert.equal(A.panneauxCouvrants, undefined, 'panneauxCouvrants est parti');
  assert.equal(ST.lieuDe, undefined, 'lieuDe est parti');
  for (const f of ['src/attention.js', 'src/state.js', 'src/accueil/dashboard.jsx', 'src/views/securite.jsx', 'custom_components/loggia/alertes.py']) {
    assert.ok(!/panneauxCouvrants|panneaux_couvrants|lieuDe|_lieux\(/.test(lire(f)), f);
  }
});
