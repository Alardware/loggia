// Les capteurs d'ouvrant (retour user du 15/09) : la carte d'avant, plus une
// illustration en filigrane — posee comme celle des plantes — qui suit l'etat.
// Pas de bouton Historique, pas de « depuis » : ce n'etait pas demande.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
const NL = String.fromCharCode(10);
const bloc = (debut, fin) => { const d = src.indexOf(debut); assert.ok(d >= 0, debut + ' introuvable'); const f = src.indexOf(fin, d + 1); return src.slice(d, f < 0 ? undefined : f); };

test('la carte d’un ouvrant : celle d’avant, plus le filigrane qui suit l’etat', () => {
  const c = bloc('function RoomGenericCard(', NL + 'function ');
  assert.ok(c.includes("const ouvrant = dom === 'binary_sensor' && OUVRANT_DCS.indexOf(a.device_class) >= 0;"), 'porte, fenetre, garage, ouverture, portail');
  assert.ok(c.includes("{ouvrant && <IlluOuvrant type={a.device_class === 'window' ? 'fenetre' : 'porte'} ouvert={ouvert} />}"), 'l’illustration, fenetre ou porte, ouverte ou fermee');
  assert.ok(!c.includes("tr('Historique')") && !c.includes('depuis {d}') && !c.includes('useMinute') && !c.includes('reperOuvrant'), 'rien d’autre n’a bouge : ni bouton, ni duree, ni repere');
  assert.ok(c.includes("'video-camera' : 'square'}") && c.includes("color: direct ? icoTexte : 'var(--o-text3)'"), 'le repere en haut a droite est celui d’avant');
  assert.ok(c.includes('<div style={RM_NAME}>{nom}</div>'), 'le nom sans retrait : le filigrane est derriere, comme la plante');
  const i = bloc('function IlluOuvrant(', NL + '}');
  assert.ok(i.includes("position: 'absolute', right: 8, bottom: 8, height: 100") && i.includes("pointerEvents: 'none'"), 'en filigrane bas droite, comme la plante');
  assert.ok(i.includes("color: ouvert ? 'var(--o-warn)' : 'var(--o-text3)'") && i.includes('opacity: ouvert ? .6 : .28'), 'gris ferme, ambre ouvert');
  assert.equal((i.match(/<svg /g) || []).length, 2, 'deux dessins : fenetre et porte');
  assert.ok(i.includes('polygon points="6,6 28,16 28,64 6,74"') && i.includes('polygon points="14,8 50,2 50,82 14,76"'), 'le battant pivote quand c’est ouvert');
});

test('la fiche du capteur est restee celle d’avant', () => {
  const f = bloc('function RoomBinarySheet(', NL + '}');
  assert.ok(!f.includes('RoomActivityCard'), 'pas de journal ajoute');
  assert.ok(!src.includes('dureeDepuis'), 'plus de duree nulle part');
});
