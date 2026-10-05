/* Un thermostat en panne se dit en panne, dans sa fiche aussi (lot 16, 05/10).
 *
 * La carte savait (« Indisponible », liseré de panne, pas d'interrupteur) ; la
 * fiche qu'elle ouvre disait « Au repos », l'interrupteur « Chauffe » ALLUMÉ
 * en rose et des puces de mode à toucher — chacune envoyait `set_hvac_mode` à
 * une entité morte. Sans entité du tout (retirée de Home Assistant), elle
 * disait « Éteint » et cochait la puce « Arrêt ».
 *
 * Et `hvac_modes` se lisait sans filtre à trois endroits, quand `zoneModes`
 * le filtrait déjà : une chaîne faisait tomber la vue (`all.map`), un
 * `null` dans la liste dessinait une puce vide. Une seule règle maintenant,
 * `modesClimat`.
 *
 * On REND la carte et la fiche (React côté serveur, ADR 0069). App.jsx
 * n'exporte que l'application : un crochet de chargement, pour CE test seul,
 * lui ajoute l'export des deux composants sous `?lot16` — le fichier n'est
 * pas touché. */
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

/* Le JSX passe par jsx-hooks.mjs (le crochet suivant) sur le chemin sans
 * `?lot16` ; on n'ajoute qu'une ligne d'export au module rendu. */
const EXPOSE = 'data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?lot16')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -6), ctx);",
  "  return { ...r, source: String(r.source) + ';export { RoomClimateSheet as __Fiche, RoomClimateCard as __Carte };' };",
  '}',
].join('\n'));
register('./jsx-hooks.mjs', import.meta.url);
register(EXPOSE);
const { __Fiche: Fiche, __Carte: Carte } = await import(new URL('../src/App.jsx?lot16', import.meta.url).href);

const ID = 'climate.salon';
const vivant = (attrs = {}, etat = 'heat') => ({ entity_id: ID, state: etat, last_changed: '2026-10-05T08:00:00Z', attributes: {
  friendly_name: 'Thermostat salon', hvac_modes: ['off', 'heat', 'auto'], min_temp: 7, max_temp: 30,
  current_temperature: 20.1, temperature: 19, hvac_action: 'idle', ...attrs } });
/* Ce que Home Assistant publie d'une entité indisponible : les attributs de
 * CAPACITÉ restent (hvac_modes, bornes), ceux d'ÉTAT partent (consigne,
 * mesure, hvac_action) — `Entity.__async_calculate_state`. */
const mort = { entity_id: ID, state: 'unavailable', last_changed: '2026-10-05T08:00:00Z', attributes: {
  friendly_name: 'Thermostat salon', hvac_modes: ['off', 'heat', 'auto'], min_temp: 7, max_temp: 30 } };
const hassDe = (st) => ({ states: st ? { [ID]: st } : {}, callService: () => { throw new Error('rien ne doit partir'); } });
const fiche = (st) => renderToStaticMarkup(createElement(Fiche, { id: ID, hass: hassDe(st), onClose: () => {} }));
const carte = (st) => renderToStaticMarkup(createElement(Carte, { id: ID, hass: hassDe(st), onOpen: () => {} }));
// Les puces de FichePuces ; l'épingle de l'en-tête porte aussi aria-pressed,
// mais après son `title`.
const puces = (html) => (html.match(/<button aria-pressed="(true|false)"/g) || []);
const lesBoutons = (html, nom) => (html.match(new RegExp('<button[^>]*aria-label="' + nom + '"[^>]*>', 'g')) || []);
const panne = (html) => (html.match(/o-panne/g) || []).length;
// Le sous-arbre de la <div> qui porte le liseré de panne, équilibré sur ses
// <div> : un enveloppant de plus ou l'ordre des attributs n'y changent rien.
const blocPanne = (html) => {
  const m = /<div\b[^>]*\bclass="[^"]*\bo-panne\b[^"]*"[^>]*>/.exec(html);
  if (!m) return '';
  const re = /<div\b|<\/div>/g; re.lastIndex = m.index;
  for (let r, prof = 0; (r = re.exec(html));) { prof += r[0] === '</div>' ? -1 : 1; if (!prof) return html.slice(m.index, re.lastIndex); }
  return html.slice(m.index);
};
// Le bloc de l'appareil (CONSIGNE, ses − / +), pas toute la fiche ni une rangée.
const surLeBlocConsigne = (html) => { const b = blocPanne(html);
  return b.includes('CONSIGNE') && b.includes('aria-label="Monter la consigne"') && !b.includes('Coupe la zone'); };

test('témoin : vivante, la fiche dit son état, sa bascule et sa puce', () => {
  const html = fiche(vivant());
  assert.ok(html.includes('Au repos'), 'le texte d’état d’un thermostat vivant');
  assert.ok(html.includes('aria-checked="true"'), 'la bascule « Chauffe » allumée');
  assert.equal(puces(html).filter(p => p.includes('true')).length, 1, 'la puce du mode courant');
  assert.ok(!html.includes('Indisponible'));
  assert.equal(panne(html), 0, 'vivante, la fiche ne porte pas le liseré du hors-ligne');
  assert.ok(html.includes('var(--o-warn)'), 'vivante et en marche, la consigne est en --o-warn');
});

test('indisponible : la fiche le dit, sans interrupteur ni puce à toucher', () => {
  const html = fiche(mort);
  assert.ok(html.includes('Indisponible'), 'la fiche doit dire « Indisponible », comme la carte');
  assert.ok(!html.includes('Au repos'), 'un appareil en panne n’est pas « au repos »');
  assert.ok(!html.includes('role="switch"') && !html.includes('aria-checked="true"'), 'aucun interrupteur « Chauffe » allumé sur une entité morte');
  assert.equal(puces(html).length, 0, 'aucune puce de mode à toucher : chacune enverrait set_hvac_mode dans le vide');
  // Les − / + restent inertes : la consigne est un attribut d'ÉTAT, absent.
  for (const nom of ['Baisser la consigne', 'Monter la consigne']) {
    const b = lesBoutons(html, nom);
    assert.equal(b.length, 1, nom);
    assert.ok(/disabled=""/.test(b[0]), nom + ' doit rester inerte');
  }
  assert.ok(html.includes('—'), 'pas de chiffre de consigne');
  // Le « — » ne repasse pas en orange : `mode` vaut 'unavailable', donc
  // `marche` est vrai (05/10, relecture du lot 16).
  assert.ok(!html.includes('var(--o-warn)'), 'la consigne d’une fiche morte reste éteinte (--o-text3)');
  // Le signal du hors-ligne (ADR 0048) : la carte souffle en rouge, la fiche
  // aussi — UN liseré, sur le bloc de l'appareil (CONSIGNE), comme la tuile
  // de CamSheet et la fiche du robot ; « Indisponible » reste en text3.
  assert.equal(panne(html), 1, 'un seul liseré de panne dans la fiche');
  assert.ok(surLeBlocConsigne(html), 'le liseré est sur le bloc CONSIGNE');
  // La carte d'où l'on vient dit la même chose.
  const c = carte(mort);
  assert.ok(c.includes('Indisponible') && c.includes('o-panne'));
});

test('entité retirée : la fiche ne dit ni « Éteint » ni « Arrêt » coché', () => {
  const html = fiche(null);
  assert.ok(html.includes('Indisponible'), 'sans entité, la fiche dit « Indisponible », comme la carte');
  assert.ok(!html.includes('Éteint'), 'une entité absente n’est pas « éteinte »');
  assert.equal(puces(html).length, 0, 'aucune puce, pas même « Arrêt » cochée');
  assert.ok(!html.includes('aria-checked'), 'aucun interrupteur');
  assert.equal(panne(html), 1, 'sans entité, le liseré de panne aussi, comme la carte');
  assert.ok(surLeBlocConsigne(html), 'sans entité, le liseré est sur le bloc CONSIGNE');
  assert.ok(carte(null).includes('o-panne'), 'la carte d’une entité retirée porte le liseré');
  assert.equal(carte(null).includes('Indisponible'), true);
});

test('hvac_modes : une chaîne ne fait plus tomber la vue, un null ne fait plus de puce vide', () => {
  // Une chaîne : `all.map` / `all.find` n'existaient pas.
  for (const modes of ['fan_only', 'heat', 5, { a: 1 }]) {
    assert.doesNotThrow(() => fiche(vivant({ hvac_modes: modes }, 'fan_only')), 'fiche, hvac_modes = ' + JSON.stringify(modes));
    assert.doesNotThrow(() => carte(vivant({ hvac_modes: modes }, 'fan_only')), 'carte, hvac_modes = ' + JSON.stringify(modes));
    // Le repli d'avant, inchangé : Arrêt et Chauffage.
    assert.equal(puces(fiche(vivant({ hvac_modes: modes }, 'fan_only'))).length, 2, 'le repli [off, heat]');
  }
  // Mêlée : seuls les vrais mots font une puce.
  const html = fiche(vivant({ hvac_modes: ['off', null, 7, '', 'heat'] }));
  assert.equal(puces(html).length, 2, 'ni null, ni nombre, ni chaîne vide ne font une puce');
  assert.ok(!/<button[^>]*aria-pressed="(true|false)"[^>]*>\s*<\/button>/.test(html), 'aucune puce vide');
  // Une liste VIDE reste vide (le repli ne la remplace pas, comme avant).
  assert.equal(puces(fiche(vivant({ hvac_modes: [] }))).length, 0);
});

test('une seule règle pour lire hvac_modes', () => {
  const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const lectures = APP.match(/\.hvac_modes\b/g) || [];
  assert.equal(lectures.length, 1, 'hvac_modes ne se lit plus qu’à un endroit : modesClimat');
  assert.ok(/function modesClimat\(/.test(APP));
  // Les quatre lecteurs, chacun à sa place ; un cinquième reste permis.
  assert.equal(APP.split("const all = modesClimat(a, ['off', 'heat']);").length - 1, 2, 'la carte et la fiche, repli [off, heat]');
  assert.ok(APP.includes('const modes = modesClimat(st.attributes, []);'), 'l’Accueil (roomClimInfo), repli []');
  assert.ok(APP.includes('return modesClimat(st && st.attributes, []);'), 'zoneModes, repli []');
});
