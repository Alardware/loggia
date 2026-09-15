// Les capteurs d'ouvrant (maquette du 15/09) : l'illustration en fond, l'etat
// « depuis », le repere colore, le bouton Historique — et la fiche qui suit.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
const en = readFileSync(join(RACINE, 'src', 'langues', 'en.js'), 'utf8');
const NL = String.fromCharCode(10);
const bloc = (debut, fin) => { const d = src.indexOf(debut); assert.ok(d >= 0, debut + ' introuvable'); const f = src.indexOf(fin, d + 1); return src.slice(d, f < 0 ? undefined : f); };

test('la carte d’un ouvrant : illustration, « depuis », repere, Historique — pour les classes d’ouvrant seulement', () => {
  const c = bloc('function RoomGenericCard(', NL + 'function ');
  assert.ok(c.includes("const ouvrant = dom === 'binary_sensor' && OUVRANT_DCS.indexOf(a.device_class) >= 0;"), 'porte, fenetre, garage, ouverture, portail');
  assert.ok(c.includes("{ouvrant && <IlluOuvrant type={a.device_class === 'window' ? 'fenetre' : 'porte'} ouvert={ouvert} />}"), 'l’illustration, fenetre ou porte');
  assert.ok(c.includes("tr('depuis {d}', { d: depuis })") && c.includes("dureeDepuis(Date.now() - new Date(st.last_changed || 0).getTime()"), '« Ouverte depuis 5 h 02 », d’apres last_changed');
  assert.ok(c.includes('useMinute(ouvrant && !mort);'), 'la duree se remet a jour chaque minute');
  assert.ok(c.includes("ouvert ? 'door-open' : 'door-closed'") && c.includes("'window-alt'"), 'le repere dit l’etat');
  assert.ok(c.includes("color: ouvrant ? (ouvert ? 'var(--o-warn)' : 'var(--o-ok)') : direct ? icoTexte : 'var(--o-text3)'"), 'ambre ouvert, vert ferme');
  assert.ok(c.includes(") || ouvert || avis != null;"), 'un ouvrant ouvert est allume : lavis et icone en ambre');
  assert.ok(c.includes("{tr('Historique')}</button>") && c.includes("paddingRight: ouvrant ? 64 : 0"), 'le bouton Historique, le texte laisse la place au dessin');
  const i = bloc('function IlluOuvrant(', NL + '}');
  assert.equal((i.match(/<svg /g) || []).length, 2, 'deux dessins : fenetre et porte');
  assert.ok(i.includes('polygon points="6,6 28,16 28,64 6,74"') && i.includes('polygon points="14,8 50,2 50,82 14,76"'), 'le battant pivote quand c’est ouvert');
  assert.ok(i.includes("color: ouvert ? 'var(--o-warn)' : 'var(--o-text3)'") && i.includes("pointerEvents: 'none'"), 'gris ferme, ambre ouvert, et le dessin ne gene pas le tap');
});

test('la fiche du capteur gagne le journal de ses changements', () => {
  const f = bloc('function RoomBinarySheet(', NL + '}');
  assert.ok(f.includes("<RoomActivityCard hass={hass} ids={[id]} titre={tr('Historique')}"), 'le journal de CE capteur, depuis Home Assistant');
});

test('les mots ont leur traduction', () => {
  ['depuis {d}', 'Les changements des dernières 24 h', 'h', 'j', 'min'].forEach(k => assert.ok(en.includes("  '" + k + "':"), k + ' manque dans en.js'));
});
