/* Chantier G1 (30/10), défauts D7 et D8 de la comparaison avec Gladys (audit/gladys-integrations-3010.md ; ADR 0300).
 *
 * D7 — un chauffe-eau (`water_heater`) s'écrivait par son état BRUT, en anglais — « eco » dans les sept langues — et comptait
 *      « actif » faute de `hvac_action`. Sur la carte générique : ses sept modes standard traduits, un mode du fabricant tel quel,
 *      la température relevée et la consigne ; actif seulement si un attribut connu dit qu'il chauffe. (La carte « Eau chaude »
 *      complète est le chantier G3.)
 * D8 — toute personne hors de la maison était « Absent » : dans une zone de Home Assistant, on écrit le nom de la zone, tel
 *      quel ; un traceur muet (`unavailable`, `unknown`) est « Inconnu », comme pour presence.py, où un téléphone muet n'est
 *      pas une maison vide. */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
register('data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?g1p')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -'?g1p'.length), ctx);",
  "  return { ...r, source: String(r.source) + ';export { CvCard, CvPerson, CvPresence, chipTexte };' };",
  '}',
].join('\n')));
const { setLoggiaState } = await import('../src/state.js');
const F = await import(new URL('../src/App.jsx?g1p', import.meta.url).href);
const O = await import('../src/objets.js');
const P = await import('../src/presence.js');
const { etatJournal } = await import('../src/historique.jsx');
const lire = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null });

const st = (id, s, a = {}) => ({ entity_id: id, state: s, last_changed: new Date().toISOString(), attributes: a });
const hassDe = (...etats) => ({ states: Object.fromEntries(etats.map(e => [e.entity_id, e])), callService: () => Promise.resolve() });
const texte = (html) => html.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|');

/* ── D7 ────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */

test('D7 : les sept modes standard d’un chauffe-eau se traduisent ; celui d’un fabricant reste tel quel', () => {
  assert.deepEqual(['eco', 'electric', 'gas', 'heat_pump', 'high_demand', 'performance', 'off'].map(O.modeChauffeEau),
    ['Éco', 'Électrique', 'Gaz', 'Pompe à chaleur', 'Forte demande', 'Performance', 'Arrêt']);
  assert.equal(O.modeChauffeEau('Boost 2h'), 'Boost 2h', 'un mode propre au fabricant');
  // Les clés des sept langues existent : le français n'est pas la seule écriture.
  for (const code of ['en', 'de', 'nl', 'it', 'es', 'pl']) {
    const cat = lire('src/langues/' + code + '.js');
    for (const cle of ['Éco', 'Électrique', 'Gaz', 'Pompe à chaleur', 'Forte demande', 'Performance', 'Arrêt']) {
      assert.ok(cat.includes("\n  '" + cle + "': "), code + ' : « ' + cle + ' » manque');
    }
  }
});

test('D7 : la phrase dit le mode, la température relevée et la consigne quand elles existent', () => {
  assert.equal(O.phraseChauffeEau(st('water_heater.ballon', 'heat_pump', { current_temperature: 52.4, temperature: 55 })), 'Pompe à chaleur · 52,4° → 55°');
  assert.equal(O.phraseChauffeEau(st('water_heater.ballon', 'eco', { temperature: 55 })), 'Éco · — → 55°');
  assert.equal(O.phraseChauffeEau(st('water_heater.ballon', 'eco', {})), 'Éco');
  assert.equal(O.phraseChauffeEau(st('water_heater.ballon', 'off', { current_temperature: 41, temperature: 55 })), 'Arrêt · 41°', 'arrêté, la consigne se tait');
});

test('D7 : un chauffe-eau n’est actif que si un attribut connu dit qu’il chauffe', () => {
  assert.equal(O.objetActif({ domaine: 'water_heater', etat: 'eco', attributs: {} }), false, 'un mode n’est pas une chauffe');
  assert.equal(O.objetActif({ domaine: 'water_heater', etat: 'performance', attributs: { current_temperature: 50 } }), false);
  assert.equal(O.objetActif({ domaine: 'water_heater', etat: 'eco', attributs: { hvac_action: 'heating' } }), true);
  assert.equal(O.objetActif({ domaine: 'water_heater', etat: 'eco', attributs: { hvac_action: 'idle' } }), false);
  assert.equal(O.objetActif({ domaine: 'water_heater', etat: 'off', attributs: { hvac_action: 'heating' } }), false, 'arrêté, jamais');
  // Le climat ne change pas : sans `hvac_action`, allumé veut dire actif.
  assert.equal(O.objetActif({ domaine: 'climate', etat: 'heat', attributs: {} }), true);
  assert.equal(O.objetActif({ domaine: 'climate', etat: 'heat', attributs: { hvac_action: 'idle' } }), false);
});

test('D7 : la carte générique et la pastille écrivent la phrase, plus l’état brut', async () => {
  const ballon = st('water_heater.ballon', 'eco', { friendly_name: 'Ballon', current_temperature: 52, temperature: 55 });
  /* ASSERTION MODIFIÉE (31/10, G3-E2) : la carte générique d'un chauffe-eau passe la main à la carte « Eau chaude » du chantier G3
   * (ADR 0302), chargée à la demande — rendue ici, sur le serveur, elle n'est que son repli. La phrase se vérifie donc sur cette
   * carte, rendue directement : la même (`phraseChauffeEau`), jamais « eco » brut. La pastille ne change pas. */
  const html = renderToStaticMarkup(createElement(F.CvCard, { id: ballon.entity_id, hass: hassDe(ballon), onOpen: () => {} }));
  assert.ok(!/\|eco\|/.test(texte(html)), 'plus de « eco » brut');
  const { default: CarteEau } = await import('../src/carteeau.jsx');
  const carte = (e) => texte(renderToStaticMarkup(createElement(CarteEau, { id: e.entity_id, hass: hassDe(e), onOpen: () => {} })));
  assert.ok(carte(ballon).includes('|Éco · 52° → 55°|'), carte(ballon));
  assert.ok(!/\|eco\|/.test(carte(ballon)), 'plus de « eco » brut');
  assert.equal(F.chipTexte('water_heater.ballon', ballon), 'Éco · 52° → 55°');
  // Un mode d'usine, tel quel.
  const usine = st('water_heater.ballon', 'Boost 2h', { friendly_name: 'Ballon' });
  assert.ok(carte(usine).includes('|Boost 2h|'), carte(usine));
});

/* ── D8 ────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */

test('D8 : maison, absent, une zone écrite telle quelle, un traceur muet « Inconnu »', () => {
  const mot = (s) => P.motPresence(s == null ? null : { state: s });
  assert.deepEqual(['home', 'not_home', 'Travail', 'École de Léa', 'unavailable', 'unknown', '', null].map(mot),
    ['Présent', 'Absent', 'Travail', 'École de Léa', 'Inconnu', 'Inconnu', 'Inconnu', 'Inconnu']);
  assert.equal(P.motPresence({ state: 'home' }, 'À la maison'), 'À la maison', 'chaque carte garde son mot de la maison');
  assert.deepEqual(['home', 'not_home', 'Travail', 'unknown'].map(s => P.lieuPresence({ state: s }).cle), ['maison', 'absent', 'zone', 'inconnu']);
});

test('D8 : la carte d’une personne, la carte générique, la pastille et le journal le disent', () => {
  const travail = st('person.alex', 'Travail', { friendly_name: 'Alex' });
  const muet = st('person.sam', 'unknown', { friendly_name: 'Sam' });
  const carte = (e) => texte(renderToStaticMarkup(createElement(F.CvPerson, { id: e.entity_id, hass: hassDe(e) })));
  assert.ok(carte(travail).includes('|Travail · '), carte(travail));
  assert.ok(carte(muet).includes('|Inconnu · '), carte(muet));
  const generique = (e) => texte(renderToStaticMarkup(createElement(F.CvCard, { id: e.entity_id, hass: hassDe(e), onOpen: () => {} })));
  assert.ok(generique(travail).includes('|Travail|'), generique(travail));
  assert.ok(generique(muet).includes('|Inconnu|'), generique(muet));
  // Un traceur, de même — il écrivait « not_home » en anglais.
  const tel = st('device_tracker.telephone_alex', 'not_home', { friendly_name: 'Téléphone' });
  assert.ok(generique(tel).includes('|Absent|'), generique(tel));
  assert.equal(F.chipTexte('person.alex', travail), 'Travail');
  assert.deepEqual([etatJournal('person.alex', 'Travail', {}), etatJournal('person.sam', 'unavailable', {}), etatJournal('person.sam', 'not_home', {})],
    ['Travail', 'Inconnu', 'Absent']);
});

test('D8 : la carte Présence et sa feuille, l’avatar de l’Accueil', () => {
  const S = hassDe(st('person.alex', 'Travail', { friendly_name: 'Alex' }), st('person.sam', 'unavailable', { friendly_name: 'Sam' }), st('person.lea', 'home', { friendly_name: 'Léa' }));
  const gens = [{ name: 'Alex', haid: 'person.alex' }, { name: 'Sam', haid: 'person.sam' }, { name: 'Léa', haid: 'person.lea' }];
  const html = texte(renderToStaticMarkup(createElement(F.CvPresence, { hass: S, gens })));
  assert.ok(html.includes(' · Travail|') && html.includes(' · Inconnu|') && html.includes(' · À la maison|'), html);
  assert.ok(!html.includes('Absent'), 'personne n’est « Absent » ici');
  const galerie = lire('src/cartescustom/galerie.jsx');
  assert.ok(galerie.includes('{p.mot + (p.lc ?'), 'la feuille Présence écrit le mot de la ligne');
  const accueil = lire('src/accueil/dashboard.jsx');
  assert.ok(accueil.includes('title: `${p.name} · ${motPresence({ state: p.etat })}`'), 'l’avatar de l’Accueil');
  assert.ok(lire('src/app/derive.jsx').includes('etat: S[p.haid] ? S[p.haid].state : null'), 'l’Accueil garde l’état de la personne');
});
