/* Une vraie pièce ne montre que ce qu'elle mesure (audit du 03/10).
 *
 * La vue Pièce comblait une mesure manquante par la valeur de vitrine du
 * modèle (`PIECES`, App.jsx) — `base.temp`, `base.hum` —, et la fiche de
 * confort relisait ces chaînes : une chambre sans hygromètre affichait
 * « Humidité 60 % ». La barre disait 100, « Confortable » ; la fiche, 78,
 * « Correct », avec un conseil sur un air qu'aucun capteur ne mesure.
 *
 * Le modèle garde ses valeurs : elles habillent l'écran d'avant la
 * connexion, et seulement lui.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/* L'indice formate ses valeurs (« 19,4 °C ») : la langue est fixée AVANT le
 * premier import, comme dans pieces_confort. */
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
const { mesuresFiche, indiceConfort } = await import('../src/confort.js');

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
const NL = String.fromCharCode(10);
const bloc = (debut, fin) => { const d = app.indexOf(debut); assert.ok(d >= 0, debut + ' introuvable'); const f = app.indexOf(fin, d + 1); return app.slice(d, f < 0 ? undefined : f); };

// La Chambre du modèle, telle que la vue Pièce la passait à la fiche.
const VITRINE = { temp: '18.1°', hum: '60%', badge: '529 ppm' };

test('une vraie pièce ne lit que ses capteurs : une mesure absente reste null', () => {
  assert.deepEqual(mesuresFiche({ temp: 19.4, hum: null, co2: null }, VITRINE), { temp: 19.4, hum: null, co2: null }, 'l’humidité du modèle comble encore le trou');
  // Un capteur indisponible : `deriveAccueil` le lit null, jamais zéro.
  assert.deepEqual(mesuresFiche({ temp: null, hum: 47, co2: 612 }, VITRINE), { temp: null, hum: 47, co2: 612 }, 'la température du modèle comble encore le trou');
  assert.deepEqual(mesuresFiche({}, VITRINE), { temp: null, hum: null, co2: null }, 'une pièce sans capteur emprunte au modèle');
  assert.deepEqual(mesuresFiche({ temp: NaN, hum: '', co2: undefined }, VITRINE), { temp: null, hum: null, co2: null }, 'une valeur illisible passe pour une mesure');
  // L'inverse de la règle du zéro : un VRAI 0 mesuré (une loggia l'hiver) reste 0, pas un tiret.
  assert.deepEqual(mesuresFiche({ temp: 0, hum: 0, co2: null }, VITRINE), { temp: 0, hum: 0, co2: null }, 'un zéro mesuré a été pris pour une absence');
});

test('la fiche dit le même indice que la barre', () => {
  const live = { temp: 19.4, hum: null, co2: null };
  // La barre (RoomView) ne lit que `live` : la fiche doit tomber sur le même mot.
  const barre = indiceConfort({ temp: live.temp, hum: live.hum, co2: live.co2 });
  const fiche = indiceConfort(mesuresFiche(live, VITRINE));
  assert.equal(barre.indice, 100);
  assert.deepEqual(fiche, barre, 'la fiche compte une humidité que la barre ignore');
  assert.deepEqual(fiche.mesures.map(m => m.cle), ['temp'], 'une seule jauge : celle du thermomètre');
});

test('l’écran d’avant la connexion garde ses valeurs de vitrine', () => {
  assert.deepEqual(mesuresFiche(null, VITRINE), { temp: 18.1, hum: 60, co2: 529 }, 'sans live, les tuiles d’exemple n’ouvrent plus une fiche remplie');
  assert.deepEqual(mesuresFiche(undefined, { temp: '21,5°', hum: '—', badge: null }), { temp: 21.5, hum: null, co2: null }, 'la virgule se lit ; un tiret n’est pas un zéro');
  assert.deepEqual(mesuresFiche(null, null), { temp: null, hum: null, co2: null });
  const pieces = bloc('const PIECES = [', NL + '];');
  assert.ok(pieces.includes("{ name: 'Chambre',") && pieces.includes("temp: '18.1°'") && pieces.includes("hum: '60%'") && pieces.includes("badge: '529 ppm'"), 'les valeurs de vitrine ont quitté PIECES');
  assert.ok(app.includes('? a.rooms.map(r => r.name) : PIECES.map(p => p.name);'), 'l’Accueil ne s’en sert plus sans données live');
});

test('la vue Pièce, la fiche et l’Accueil ne prêtent plus rien du modèle', () => {
  assert.ok(!app.includes(': base.temp') && !app.includes(': base.hum'), 'la vue Pièce reprend encore les valeurs du modèle');
  assert.ok(app.includes("temp: lv && lv.temp != null ? dec(lv.temp, 1) + '°' : null, hum: lv && lv.hum != null ? Math.round(lv.hum) + '%' : null,"), 'une mesure absente de la vue Pièce ne reste pas null');
  const fiche = bloc('function RoomComfortModal(', NL + '}');
  assert.ok(fiche.includes('const mesures = mesuresFiche(live, piece);') && fiche.includes('temp: versCelsius(mesures.temp, uniteT),') && fiche.includes('hum: mesures.hum,') && fiche.includes('co2: mesures.co2,'), 'la fiche ne passe pas par mesuresFiche');
  assert.ok(!fiche.includes('parseNum(piece.'), 'la fiche relit encore les chaînes de la pièce');
  assert.ok(app.includes("{ ...p, temp: '—', hum: '—', badge: null, live: { temp: null, hum: null, co2: null } }"), 'une pièce sans capteurs de l’Accueil garde les valeurs du modèle');
});
