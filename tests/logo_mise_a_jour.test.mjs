// ─────────────────────────────────────────────────────────────────────────────
// LE VRAI LOGO D'UNE MISE À JOUR (27/10).
//
// « Pourquoi je n'ai pas les icônes sur toutes les mises à jour ? » Home
// Assistant Core avait un carré vide, MQTT son logo : l'image (`entity_picture`)
// ne chargeait pas, et la ligne la RETIRAIT sans rien remettre. Puis : « je veux
// leur vraie icône, pas des trucs inventés ». Le logo de l'intégration, comme
// l'interface de Home Assistant ; l'icône du groupe en tout dernier.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const P = readFileSync(new URL('../src/views/parametres.jsx', import.meta.url), 'utf8');
const i = P.indexOf('function LogoMaj(');
const logo = P.slice(i, P.indexOf('\n}\n', i));

test('l’image de Home Assistant, puis le logo de l’intégration, puis seulement l’icône du groupe', () => {
  assert.ok(i > 0, 'LogoMaj a disparu');
  assert.ok(logo.includes('const src = [pic, logoMarque(plateforme)].find(u => u && ko.indexOf(u) < 0);'), 'l’ordre des sources');
  assert.ok(logo.includes('onError={() => setKo(k => [...k, src])}'), 'une image en échec passe à la suivante');
  assert.ok(logo.includes('if (!src) return <Fi i={icone} size={14} />;'), 'l’icône du groupe en dernier');
  assert.ok(!P.includes('e.currentTarget.remove()'), 'retirer l’image laisse un carré vide');
  assert.ok(P.includes('<LogoMaj pic={u.pic} plateforme={u.plateforme} icone={gr.icone} />') && P.includes('plateforme: plateformeDe(id),'),
    'chaque ligne passe par LogoMaj, avec l’intégration qui publie la mise à jour');
});

test('le logo d’une intégration est celui des marques de Home Assistant', () => {
  const m = /const logoMarque = (\(domaine\) => [^\n]+);/.exec(P);
  assert.ok(m, 'logoMarque a disparu');
  // eslint-disable-next-line no-new-func
  const logoMarque = new Function('return ' + m[1])();
  assert.equal(logoMarque('hassio'), 'https://brands.home-assistant.io/_/hassio/icon.png');
  assert.equal(logoMarque('mqtt'), 'https://brands.home-assistant.io/_/mqtt/icon.png');
  assert.equal(logoMarque(null), null);
  assert.equal(logoMarque('../x'), null, 'un nom de domaine douteux ne fabrique pas d’adresse');
});
