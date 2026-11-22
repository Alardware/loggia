/* Les images relues en boucle ne s'empilent plus (audit de consolidation du 28/10, B7).
 *
 * La vignette d'une caméra se relit toutes les `refreshMs`, la carte d'un
 * robot toutes les dix secondes. Sur un appareil lent, chaque tour lançait sa
 * requête sans attendre la précédente : elles s'empilaient, et le démontage
 * les laissait courir.
 *  - camera.jsx : la requête d'avant était ABANDONNÉE au tour suivant. Sur une
 *    caméra qui met plus d'un tour à répondre, aucune image n'arrivait donc
 *    jamais (audit du 12/11, B9) : comme la carte d'un robot, un tour ne part
 *    plus tant que la requête d'avant n'est pas revenue — au-delà de vingt
 *    secondes, elle est abandonnée pour que la suivante parte.
 *  - vacplan.jsx : la carte affichait même une réponse lente ; un tour ne part
 *    donc pas tant que la requête d'avant n'est pas revenue.
 * Les deux abandonnent leur requête au démontage. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lire = (p) => readFileSync(new URL('../src/' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// ASSERTIONS MODIFIÉES (13/11, audit du 12/11, lot 2a, B9) : la vignette ATTEND sa requête au lieu de l'abandonner à chaque tour.
test('la vignette d’une caméra attend sa requête, l’abandonne après vingt secondes, et au démontage', () => {
  const s = lire('camera.jsx');
  assert.ok(s.includes('if (enVol) { if (Date.now() - depart < ATTENTE_MAX) return; enVol.abort(); }\n      const ctrl = enVol = new AbortController();'), 'un tour repart sans attendre la requête d’avant, ou ne l’abandonne plus jamais');
  assert.ok(s.includes('const ATTENTE_MAX = 20000;'));
  assert.ok(s.includes('signal: ctrl.signal') && s.includes('finally { if (enVol === ctrl) enVol = null; }'), 'le fetch ne porte plus son signal, ou la place ne se libère plus');
  assert.ok(s.includes('if (!alive || enVol !== ctrl) return;'), 'la réponse d’une requête abandonnée est de nouveau affichée');
  assert.ok(s.includes('return () => { alive = false; clearInterval(id); if (enVol) enVol.abort(); };'), 'le démontage laisse courir la requête');
});

test('la carte d’un robot attend sa requête, et l’abandonne au démontage', () => {
  const s = lire('vacplan.jsx');
  assert.ok(s.includes('if (enVol) return;\n      const ctrl = enVol = new AbortController();'), 'un tour repart sans attendre la requête d’avant');
  assert.ok(s.includes('signal: ctrl.signal') && s.includes('finally { if (enVol === ctrl) enVol = null; }'), 'le fetch ne porte plus son signal, ou la place ne se libère plus');
  assert.ok(s.includes('if (enVol) enVol.abort(); if (precedent) URL.revokeObjectURL(precedent);'), 'le démontage laisse courir la requête');
});
