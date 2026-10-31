/* Les images relues en boucle ne s'empilent plus (audit de consolidation du 28/10, B7).
 *
 * La vignette d'une caméra se relit toutes les `refreshMs`, la carte d'un
 * robot toutes les dix secondes. Sur un appareil lent, chaque tour lançait sa
 * requête sans attendre la précédente : elles s'empilaient, et le démontage
 * les laissait courir.
 *  - camera.jsx : la réponse d'un tour dépassé est déjà jetée (`mien !== tour`) ;
 *    la requête d'avant est donc ABANDONNÉE au tour suivant — rien ne change à
 *    l'écran.
 *  - vacplan.jsx : la carte affichait même une réponse lente ; un tour ne part
 *    donc pas tant que la requête d'avant n'est pas revenue.
 * Les deux abandonnent leur requête au démontage. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lire = (p) => readFileSync(new URL('../src/' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('la vignette d’une caméra abandonne la requête d’avant, et la dernière au démontage', () => {
  const s = lire('camera.jsx');
  assert.ok(s.includes('if (enVol) enVol.abort();\n      const ctrl = enVol = new AbortController();'), 'la requête d’avant n’est plus abandonnée');
  assert.ok(s.includes('signal: ctrl.signal'), 'le fetch ne porte plus son signal');
  assert.ok(s.includes('if (!alive || mien !== tour) return;'), 'une réponse dépassée est de nouveau affichée');
  assert.ok(s.includes('return () => { alive = false; clearInterval(id); if (enVol) enVol.abort(); };'), 'le démontage laisse courir la requête');
});

test('la carte d’un robot attend sa requête, et l’abandonne au démontage', () => {
  const s = lire('vacplan.jsx');
  assert.ok(s.includes('if (enVol) return;\n      const ctrl = enVol = new AbortController();'), 'un tour repart sans attendre la requête d’avant');
  assert.ok(s.includes('signal: ctrl.signal') && s.includes('finally { if (enVol === ctrl) enVol = null; }'), 'le fetch ne porte plus son signal, ou la place ne se libère plus');
  assert.ok(s.includes('if (enVol) enVol.abort(); if (precedent) URL.revokeObjectURL(precedent);'), 'le démontage laisse courir la requête');
});
