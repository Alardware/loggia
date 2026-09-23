/* Les composants se testent par rendu (ADR 0069, 22/09).
 *
 * Jusqu'ici aucun composant `.jsx` n'etait execute par un test : on relisait
 * leur texte. Ici, React rend le HTML, et l'on affirme sur ce que l'ecran
 * montre — un role, un nom, un texte — pas sur la forme du code. */
import test from 'node:test';
import assert from 'node:assert/strict';

import { composant, rendre } from './rendu.mjs';

const verdict = (t, c) => ({ t, c });
const CONFORT = {
  indice: 72,
  verdict: verdict('Confortable', 'var(--o-ok)'),
  mesures: [
    { cle: 'temp', nom: 'Température', valeur: '21,4 °C', icone: 'thermometer-half', verdict: verdict('Idéal', 'var(--o-ok)') },
    { cle: 'co2', nom: 'CO₂', valeur: '1 480 ppm', icone: 'wind', verdict: verdict('Élevé', 'var(--o-warn2)') },
  ],
};

test('la barre de confort : un bouton nomme, l’indice sur 100, une pastille par mesure', async () => {
  const BarreConfort = await composant('barreconfort.jsx', 'BarreConfort');
  const html = rendre(BarreConfort, { confort: CONFORT, onOpen: () => {} });
  assert.ok(html.includes('role="button"') && html.includes('tabindex="0"'), 'un bouton, au clavier aussi');
  assert.ok(html.includes('aria-label="Historique du confort"'), 'son nom');
  assert.ok(html.includes('<span class="n">72</span>') && html.includes('/ 100') && html.includes('Confortable'), 'l’indice et son mot');
  assert.equal((html.match(/class="o-confort-mesure"/g) || []).length, 2, 'une pastille par mesure');
  assert.ok(html.includes('--conf-n:2') || html.includes('--conf-n: 2'), 'la rangee sait combien elle porte');
  assert.ok(html.includes('1 480 ppm') && html.includes('Élevé'), 'la valeur et le verdict de chaque mesure');
  assert.ok(html.includes('aria-hidden="true"'), 'l’anneau et le point ne se lisent pas');
});

test('la barre de confort sans confort : rien', async () => {
  const BarreConfort = await composant('barreconfort.jsx', 'BarreConfort');
  assert.equal(rendre(BarreConfort, { confort: null, onOpen: () => {} }), '');
});

test('la carte meteo du rail : rien sans entite meteo, et rien d’invente sans prevision', async () => {
  const CarteMeteo = await composant('cartemeteo.jsx', 'CarteMeteo');
  assert.equal(rendre(CarteMeteo, { hass: { states: {} } }), '', 'sans entite meteo, la carte n’existe pas');
  const hass = { states: { 'weather.maison': { entity_id: 'weather.maison', state: 'cloudy', attributes: { friendly_name: 'Maison', temperature: 18.3 } } } };
  const html = rendre(CarteMeteo, { hass });
  assert.equal(typeof html, 'string');
  assert.ok(!/Max|Min/.test(html), 'pas de Max · Min sans prevision quotidienne (ADR 0038)');
});

test('le choix de la langue : un menu, chaque langue dans sa langue, son nom traduit dessous (ADR 0070)', async () => {
  const ListeChoix = await composant('ui.jsx', 'ListeChoix');
  const { LANGUES } = await import('../src/langues/index.js');
  const { tr } = await import('../src/i18n.js');
  const options = LANGUES.map(l => ({ id: l.code, label: l.code === 'auto' ? tr('Suivre Home Assistant') : l.nom, sub: l.enFrancais ? tr(l.enFrancais) : undefined }));
  const html = rendre(ListeChoix, { label: 'Langue', value: 'de', options, onChange: () => {} });
  assert.ok(html.includes('aria-label="Langue : Deutsch"'), 'le bouton dit la langue choisie, dans sa langue');
  assert.ok(html.includes('Deutsch') && !html.includes('DE<'), 'le nom natif, pas un code en capitales');
  assert.ok(!html.includes('<select'), 'jamais un select natif');
  assert.equal(options.length, 8, 'auto + sept langues');
  assert.ok(options.every(o => o.id === 'auto' || o.sub), 'chaque langue porte son nom traduit en petit');
});

test('le premier lancement : ses textes passent tous par la traduction', async () => {
  /* Rien n'executait cet ecran : ses phrases etaient ecrites en clair, dont
   * trois sur plusieurs lignes — invisibles au filet qui ne lisait qu'une
   * ligne a la fois. Le rendu verifie ici qu'elles sortent bien, et qu'aucun
   * repere de gabarit ne reste a l'ecran. */
  const Onboarding = await composant('Onboarding.jsx');
  const runtime = {
    caps: { totals: { entities: 412, areasUsed: 7, domains: 19 } },
    views: { pieces: { ok: true }, scenes: { ok: true }, croquettes: { ok: false, reason: 'Aucun distributeur.' } },
    resolved: {
      rooms: {
        rooms: [],
        suggested: [{ id: 'a1', name: 'Salon', ambiance: 3, temp: 'sensor.t' }],
        technical: [{ id: 'a2', name: 'Baie', entities: 12 }, { id: 'a3', name: 'Garage', entities: 4 }],
      },
      alarm: { available: false }, weather: { available: false }, energy: { available: false },
    },
  };
  const html = rendre(Onboarding, { runtime, onDone: () => {}, onSkip: () => {} });
  assert.ok(html.includes('Bienvenue') && html.includes('Commencer') && html.includes('Passer'),
    'les boutons et le titre de la premiere etape');
  assert.ok(html.includes('ÉTAPE 1 SUR 3'), 'le compteur d’etapes est rempli, pas laisse en gabarit');
  assert.ok(html.includes('412') && html.includes('ENTITÉS'), 'ce que la lecture a trouve');
  assert.ok(html.includes('Rien n&#x27;est à saisir') || html.includes("Rien n'est à saisir"),
    'la phrase de bienvenue, ecrite sur plusieurs lignes');
  assert.ok(!html.includes('{n}') && !html.includes('{a}') && !html.includes('{b}'),
    'aucun repere de gabarit ne reste a l’ecran');
});

test('l’en-tete d’une regle : le nom, la description, et un interrupteur qui dit son etat', async () => {
  const RegleEntete = await composant('ui.jsx', 'RegleEntete');
  const html = rendre(RegleEntete, { nom: 'Volet bloqué', desc: 'Ne pas fermer sur une porte ouverte.', on: true, cb: () => {} });
  assert.ok(html.includes('Volet bloqué') && html.includes('Ne pas fermer sur une porte ouverte.'), 'le nom et la description');
  assert.ok(html.includes('aria-checked="true"') || html.includes('aria-pressed="true"'), 'l’etat se lit');
});
