/* La teinte d'une pochette (chantier Médias, tâche 2 ; M8).
 *
 * Ce qui est garanti ici, sans navigateur (pochette.js est pur dans sa règle, et le chargement de l'image se remplace) :
 *  - la teinte dominante de pixels RGBA : une pochette unie rend sa couleur, relevée en saturation et recentrée en lumière
 *    (l'algorithme qui vivait dans la fiche) ; des pixels transparents ne pèsent rien ; rien d'opaque rend `null` ;
 *  - le cache se fait par TITRE et ARTISTE, pas par adresse : la même clé ne charge qu'une fois, quelle que soit l'adresse ;
 *  - un canvas souillé, une image qui ne charge pas : `null`, et le rose de la maison (`TEINTE_REPLI`). */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { teinteDesPixels, cleTeinte, rgbTexte, teintePochette, oublierTeintes, TEINTE_REPLI } = await import('../src/pochette.js');

/** Des pixels unis : `n` pixels RGBA de la couleur `[r, g, b]`, à l'opacité `a` (0 à 255). */
const unis = ([r, g, b], n = 64, a = 255) => { const d = new Uint8ClampedArray(n * 4); for (let i = 0; i < n; i++) { d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = a; } return d; };

test('M8 : la teinte dominante — une pochette unie rend sa couleur, saturée à 0,48 au moins, la lumière entre 0,4 et 0,58', () => {
  // Un orange saturé : il reste orange, recentré en lumière seulement.
  const orange = teinteDesPixels(unis([255, 140, 0]));
  assert.ok(orange[0] > orange[1] && orange[1] > orange[2], 'la teinte reste orange : ' + orange.join(','));
  // Un gris n'a aucune saturation : il en reçoit (0,48), et sa lumière remonte — jamais une pochette terne.
  const gris = teinteDesPixels(unis([40, 40, 40]));
  assert.ok(Math.max(...gris) - Math.min(...gris) > 60, 'le gris devient une teinte : ' + gris.join(','));
  // Un pixel transparent ne pèse rien ; rien d'opaque : null.
  assert.equal(teinteDesPixels(unis([255, 0, 0], 64, 10)), null);
  assert.equal(teinteDesPixels(new Uint8ClampedArray(0)), null);
  assert.equal(teinteDesPixels(null), null);
  // Un pixel sur quatre est lu : une pochette dont seul le premier pixel de chaque groupe est bleu rend du bleu.
  const d = unis([255, 255, 255], 64); for (let i = 0; i < 64; i += 4) { d[i * 4] = 0; d[i * 4 + 1] = 0; d[i * 4 + 2] = 255; }
  const bleu = teinteDesPixels(d);
  assert.ok(bleu[2] > bleu[0], 'le bleu domine : ' + bleu.join(','));
});

test('M8 : le cache par titre et artiste — la même clé ne charge qu’une fois, quelle que soit l’adresse', async () => {
  oublierTeintes();
  const charges = [];
  const charger = (url) => { charges.push(url); return Promise.resolve(unis([200, 30, 60])); };
  const cle = cleTeinte({ title: 'Clair de Lune', artist: 'Debussy', art: '/api/media_player_proxy/a?token=1' });
  assert.equal(cle, 'Clair de Lune|Debussy');
  const t1 = await teintePochette('/api/media_player_proxy/a?token=1', cle, { charger });
  const t2 = await teintePochette('/api/media_player_proxy/a?token=2', cle, { charger });
  assert.deepEqual(t1, t2);
  assert.ok(t1[0] > t1[1] && t1[0] > t1[2], 'un rouge : ' + t1.join(','));
  assert.deepEqual(charges, ['/api/media_player_proxy/a?token=1'], 'l’adresse change à chaque état : un seul chargement');
  // Deux appels avant la réponse partagent la même promesse.
  oublierTeintes();
  const lents = [];
  const lent = (url) => new Promise((r) => { lents.push(() => r(unis([10, 200, 80]))); });
  const p1 = teintePochette('/x', 'k', { charger: lent }), p2 = teintePochette('/y', 'k', { charger: lent });
  assert.equal(lents.length, 1, 'un chargement en cours se partage');
  lents[0]();
  assert.deepEqual(await p1, await p2);
  // Sans titre ni artiste, l'adresse fait clé ; sans rien, pas de clé, pas de teinte.
  assert.equal(cleTeinte({ art: '/api/x' }), '/api/x');
  assert.equal(cleTeinte({}), null);
  assert.equal(cleTeinte(null), null);
  assert.equal(await teintePochette(null, 'k'), null);
});

test('M8 : un canvas souillé ou une image qui ne charge pas rend null — et le rose de la maison', async () => {
  oublierTeintes();
  assert.equal(await teintePochette('/souille', 'souille', { charger: () => Promise.resolve(null) }), null, 'souillé (CORS) : null');
  assert.equal(await teintePochette('/erreur', 'erreur', { charger: () => Promise.reject(new Error('404')) }), null, 'une image qui ne charge pas : null, sans erreur');
  assert.equal(await teintePochette('/erreur', 'erreur', { charger: () => { throw new Error('ne doit pas recharger'); } }), null, 'le null se garde en cache aussi');
  assert.equal(TEINTE_REPLI, 'var(--o-rose-rgb)');
  assert.equal(rgbTexte(null), TEINTE_REPLI);
  assert.equal(rgbTexte([1, 2, 3]), '1,2,3');
  // Hors navigateur (ni Image ni document), le chargeur du module rend null sans lever.
  assert.equal(await teintePochette('/sans-navigateur', 'sans'), null);
});
