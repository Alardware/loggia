// ─────────────────────────────────────────────────────────────────────────────
// La veille et le premier lancement refaits sur la maquette du 01/11 (handoff
// « Loggia Prototype ») : l'heure et ses secondes, le ciel des prochaines
// heures, un seul point qui mérite l'œil, la température de chaque pièce ; et
// un premier lancement en points — bienvenue, ce qui a été trouvé, le code
// administrateur s'il manque, le type d'écran, tout est prêt.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composant, rendre } from './rendu.mjs';

const { trouvailles, etapesPremierLancement } = await import(new URL('../src/Onboarding.jsx', import.meta.url).href);

test('ce que Loggia a trouvé : une ligne par famille présente, jamais une famille vide', () => {
  const runtime = {
    caps: { counts: { light: 9 }, devices: { cover: [{ name: 'Salon' }, { name: 'Chambre' }], camera: [{ name: 'Entrée' }] } },
    resolved: {
      rooms: { suggested: [{ name: 'Salon' }, { name: 'Cuisine' }] },
      energy: { available: true, source: 'tableau', devices: [1, 2, 3] },
      alarm: { available: false },
    },
  };
  const l = trouvailles(runtime);
  assert.deepEqual(l.map(x => x.cle), ['pieces', 'lumieres', 'volets', 'cameras', 'energie'], 'l’ordre ou les familles ont changé');
  assert.equal(l[0].titre, '2 pièces');
  assert.equal(l[0].detail, 'Salon, Cuisine');
  assert.equal(l[3].titre, '1 caméra', 'le singulier');
  assert.ok(l.every(x => /^[a-z-]+$/.test(x.ton)), 'une teinte est un jeton du thème, jamais une couleur');
  assert.deepEqual(trouvailles(null), [], 'sans lecture, rien');
});

test('le code administrateur n’est demandé que s’il n’existe pas', () => {
  assert.deepEqual(etapesPremierLancement(false), ['bienvenue', 'trouve', 'code', 'ecran', 'pret']);
  assert.deepEqual(etapesPremierLancement(true), ['bienvenue', 'trouve', 'ecran', 'pret']);
});

test('le toucher qui sort de la veille n’actionne rien dessous', async () => {
  const { avalerGesteSuivant } = await import(new URL('../src/app/hooks.jsx', import.meta.url).href);
  const fenetre = new EventTarget();
  const lacher = avalerGesteSuivant(fenetre);
  const dessous = [];
  fenetre.addEventListener('click', () => dessous.push('clic'));
  const fin = new Event('touchend', { cancelable: true });
  fenetre.dispatchEvent(fin);
  assert.ok(fin.defaultPrevented, 'la fin du toucher est annulée : le navigateur n’en tire pas de clic');
  const clic = new Event('click', { cancelable: true });
  fenetre.dispatchEvent(clic);
  assert.ok(clic.defaultPrevented);
  assert.deepEqual(dessous, [], 'le clic du réveil n’atteint pas l’interrupteur caché');
  fenetre.dispatchEvent(new Event('click', { cancelable: true }));
  assert.deepEqual(dessous, ['clic'], 'le geste suivant passe');
  lacher();
});

test('la veille : les secondes en exposant, la température de chaque pièce, un seul point', async () => {
  const AmbientOverlay = await composant('ecranveille.jsx', 'AmbientOverlay');
  const html = rendre(AmbientOverlay, {
    wx: 'clouds', wxFx: false, weatherTemp: 12.4, weatherLabel: 'Nuageux', ast: 'triggered',
    notifs: [{ k: 'n1', c: 'var(--o-bad)', t: 'Fuite', m: 'Cuisine' }],
    rooms: [{ room: 'Salon', haid: { temp: 'sensor.ts' } }, { room: 'Jardin', haid: { temp: 'sensor.tj' } }, { room: 'Chambre', haid: {} }, { room: 'Cuisine', haid: { temp: 'sensor.tk' } }],
    hass: { states: { 'sensor.ts': { state: '21.4' }, 'sensor.tj': { state: '9' }, 'sensor.tk': { state: '22.8' } } },
  });
  assert.ok(html.includes('12,4°'), 'la température du dehors garde sa décimale');
  assert.match(html, /font-size:22px[^"]*">\d\d<\/span>/, 'les secondes en exposant');
  assert.ok(html.includes('21,4°') && html.includes('22,8°'), 'la température de chaque pièce');
  assert.ok(!html.includes('Jardin') && !html.includes('>Chambre<'), 'le dehors et une pièce sans mesure n’ont pas de case');
  assert.ok(html.includes('Alarme déclenchée') && !html.includes('Fuite · Cuisine'), 'l’alarme déclenchée prend la place du point');
  assert.ok(html.includes('Touchez l’écran pour revenir'));
  assert.ok(!html.includes('allumée') && !html.includes('intérieur'), 'les puces de l’ancienne veille sont parties');
});
