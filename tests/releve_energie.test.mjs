/* Les courbes de l'Énergie se relisent (audit du 03/10).
 *
 * « Les dernières 24 heures » étaient lues une fois, au montage de la vue, et
 * jamais plus : `useSysHist(hass, ids, 24, 0)` — une clé de relecture figée à
 * zéro. Sur une tablette ouverte au mur, la courbe s'arrêtait à l'heure de
 * l'arrivée sur la page. Le tour et la fusion vivent dans `src/releve.js`,
 * pur : on les exécute pour de vrai, avec un document et une horloge tenus à
 * la main. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { armerReleve, seriesRelues, GARDE_SERIE } from '../src/releve.js';

const lire = (...p) => readFileSync(new URL('../' + p.join('/'), import.meta.url), 'utf8');

class Document extends EventTarget {
  constructor() { super(); this.visibilityState = 'visible'; }
}
const montrer = (doc, etat) => { doc.visibilityState = etat; doc.dispatchEvent(new Event('visibilitychange')); };

/** Une horloge tenue à la main : le temps n'avance que quand le test le dit. */
function horloge() {
  const actifs = new Map();
  let n = 0;
  return {
    actifs,
    setInterval(f, ms) { n += 1; actifs.set(n, { f, ms }); return n; },
    clearInterval(id) { actifs.delete(id); },
    tic() { for (const { f } of [...actifs.values()]) f(); },
  };
}

test('armerReleve : un tour toutes les cinq minutes tant que la page se voit, aucun quand elle est cachée', () => {
  const doc = new Document();
  const h = horloge();
  let n = 0;
  const arreter = armerReleve(() => { n += 1; }, 5 * 60000, doc, h);
  assert.equal(n, 0, 'le montage a déjà sa lecture : armer ne relit pas');
  assert.deepEqual([...h.actifs.values()].map(a => a.ms), [5 * 60000], 'un seul minuteur, de cinq minutes');
  h.tic(); h.tic();
  assert.equal(n, 2, 'visible : chaque tour relit');
  montrer(doc, 'hidden');
  h.tic(); h.tic(); h.tic();
  assert.equal(n, 2, 'cachée : aucune requête, même au bout de quinze minutes');
  montrer(doc, 'visible');
  assert.equal(n, 3, 'au retour, le tour manqué part tout de suite — une seule fois pour trois');
  assert.equal(h.actifs.size, 1, 'le minuteur repart du retour, il ne se double pas');
  montrer(doc, 'visible');
  assert.equal(n, 3, 'un second retour, sans tour manqué, ne relit rien');
  montrer(doc, 'hidden');
  montrer(doc, 'visible');
  assert.equal(n, 3, 'cachée moins d’un tour : rien de manqué, rien à rattraper');
  h.tic();
  assert.equal(n, 4);
  montrer(doc, 'hidden');
  h.tic();
  arreter();
  assert.equal(h.actifs.size, 0, 'démonté : plus de minuteur');
  montrer(doc, 'visible');
  assert.equal(n, 4, 'démonté : le tour manqué ne part plus — l’écoute est retirée avec le minuteur');
});

test('armerReleve : sans document ni durée rien ne se branche, et un tour qui échoue n’arrête pas les suivants', () => {
  const h = horloge();
  assert.doesNotThrow(() => armerReleve(() => {}, 1000, null, h)());
  assert.doesNotThrow(() => armerReleve(() => {}, 0, new Document(), h)());
  assert.equal(h.actifs.size, 0, 'hors navigateur, ou sans durée : aucun minuteur');
  let n = 0;
  const arreter = armerReleve(() => { n += 1; if (n === 1) throw new Error('boum'); }, 1000, new Document(), h);
  assert.doesNotThrow(() => h.tic());
  h.tic();
  assert.equal(n, 2, 'le deuxième tour part malgré le premier');
  arreter();
});

test('seriesRelues : une lecture ratée garde la courbe d’avant, une lecture réussie la remplace', () => {
  const p = (t, v) => ({ last_changed: new Date(t).toISOString(), state: String(v) });
  const avant = { 'sensor.a': [{ t: 1, v: 1 }, { t: 2, v: 2 }], 'sensor.b': [{ t: 1, v: 5 }, { t: 2, v: 6 }] };
  const apres = seriesRelues(avant, [
    { id: 'sensor.a', arr: [p(1000, 3), p(2000, 'unavailable'), p(3000, 4)] },
    { id: 'sensor.b', arr: null },
    { id: 'sensor.c', arr: null },
    { id: 'sensor.d', arr: [p(1000, 7)] },
  ]);
  assert.deepEqual(apres['sensor.a'], [{ t: 1000, v: 3 }, { t: 3000, v: 4 }], 'relue : la nouvelle courbe, sans les états illisibles');
  assert.equal(apres['sensor.b'], avant['sensor.b'], 'ratée : la courbe d’avant reste — le panneau ne se vide pas pour un raté du réseau');
  assert.ok(!('sensor.c' in apres), 'jamais lue : pas de courbe inventée');
  assert.ok(!('sensor.d' in apres), 'un seul point : rien à tracer');
  assert.deepEqual(seriesRelues(avant, [{ id: 'sensor.a', arr: [] }]), {},
    'relue et vide : absente, pas l’ancienne ; plus demandée : absente aussi');
  assert.deepEqual(seriesRelues(null, null), {});
});

test('la vue Énergie fait avancer ses deux séries au même tour, et coupe le minuteur au démontage', () => {
  const app = lire('src', 'App.jsx');
  assert.match(app, /import \{ armerReleve \} from '\.\/releve\.js';/);
  const i = app.indexOf('\nfunction EnergieContent(');
  assert.notEqual(i, -1, 'la vue Énergie a disparu');
  const vue = app.slice(i, app.indexOf('\nfunction ', i + 1));
  assert.ok(!/useSysHist\([^)]*, 0\)/.test(vue), 'une clé de relecture figée à 0 : les courbes ne bougent plus après le montage');
  assert.ok(vue.includes('useEffect(() => armerReleve(() => setTourEn(x => x + 1), 5 * 60000), []);'),
    'un tour toutes les cinq minutes ; l’effet rend l’arrêt, le démontage coupe le minuteur');
  assert.ok(vue.includes('useSysHist(hass, puissIds, 24, tourEn)') && vue.includes('useSysHist(hass, consoIds, 24, tourEn)'),
    'la puissance et la consommation suivent le même tour');
  // Le tour ne sert que si l'historique le lit comme une dépendance.
  const h = lire('src', 'historique.jsx');
  const j = h.indexOf('export function useSysHist(');
  assert.notEqual(j, -1, 'useSysHist a disparu');
  const corps = h.slice(j, h.indexOf('\n}', j));
  assert.ok(corps.includes('}, [connecte, key, hours, refreshKey]);'), 'useSysHist ne relit plus quand la clé change');
  assert.ok(corps.includes('.catch(() => ({ id, arr: null }))') && corps.includes('setData(avant => seriesRelues(avant, rs, (id) => maintenant - (lus.current[id] || 0) < garde));'),
    'un raté redevient un historique vide : la courbe d’avant serait effacée au premier raté du réseau');
  assert.doesNotMatch(lire('src', 'releve.js'), /^import /m, 'releve.js est pur : ni React, ni Home Assistant');
});

test('une courbe gardée après un raté expire (relecture du 03/10)', () => {
  const avant = { 'sensor.a': [{ t: 1, v: 1 }, { t: 2, v: 2 }] };
  const rate = [{ id: 'sensor.a', arr: null }];
  assert.deepEqual(seriesRelues(avant, rate, () => true), avant, 'encore fraîche : gardée');
  assert.deepEqual(seriesRelues(avant, rate, () => false), {},
    'trop vieille : la carte « Les dernières 24 heures » restait figée sur l’heure du dernier succès');
  assert.equal(GARDE_SERIE, 30 * 60 * 1000, 'la borne de l’historique 24 h');
  const h = lire('src', 'historique.jsx');
  assert.ok(h.includes("rs.forEach(r => { if (r && Array.isArray(r.arr)) lus.current[r.id] = maintenant; });"), 'seule une lecture RÉUSSIE rafraîchit l’âge');
  assert.ok(h.includes('const garde = Math.min(GARDE_SERIE, hours * 3600 * 1000 / 4);'));
});
