/* Un binaire seul : sa carte dit le calme en neutre, sa fiche est celle d'une mesure, sans courbe (chantier Capteurs, étapes 2 et
 * 3, tâche 4 ; C26, § 5).
 *
 * Ce qui est garanti ici :
 *  - la carte (§ 5.1) : fermé, sans fumée, sans mouvement, intact — le gris doux (`--o-text2`) ; ouvert, l'ambre du dessin ; un
 *    mouvement, l'accent ; un danger qui sonne, le rouge ; muet, « Indisponible » en rouge et le liseré qui respire ;
 *  - « Tout va bien » sort de BIN_ETATS : `safety` éteint dit « Normal », `problem` éteint « Aucun problème » ;
 *  - la journée d'un binaire (journee.jsx, pur) : les bandes, le nombre de fois, « depuis », la dernière ouverture ;
 *  - la fiche (§ 5.2) : l'en-tête « {pièce} · {famille} », l'état en grand, « depuis », la bande du jour et son résumé, puis
 *    le dernier signal, la pile et L'appareil — sans les trois lignes de Home Assistant d'avant ; UNE lecture de l'historique ;
 *  - la coquille garde la feuille, la frontière Suspense dedans, et passe la pièce, la famille, l'épingle et L'appareil. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { monter } from './crochets.mjs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
register('data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?binaire_calme')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -'?binaire_calme'.length), ctx);",
  "  return { ...r, source: String(r.source) + ';export { RoomGenericCard, BRIQUES_CAPTEUR, BIN_ETATS };' };",
  '}',
].join('\n')));
const F = await import(new URL('../src/App.jsx?binaire_calme', import.meta.url).href);
const FC = await import('../src/fichecapteur.jsx');
const J = await import('../src/journee.jsx');
const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

const rendre = (Comp, props) => renderToStaticMarkup(createElement(Comp, props));
const st = (id, s, a) => ({ entity_id: id, state: s, attributes: a, last_changed: '2026-10-16T08:00:00Z', last_updated: '2026-10-16T09:00:00Z' });
const hassDe = (...etats) => ({ states: Object.fromEntries(etats.map(e => [e.entity_id, e])) });
const carte = (e) => rendre(F.RoomGenericCard, { id: e.entity_id, hass: hassDe(e), onOpen: () => {} });
// La couleur de l'élément qui écrit `mot` : celle de son style.
const couleurDe = (html, mot) => { const i = html.indexOf('>' + mot + '<'); const s = html.lastIndexOf('style="', i); return (/color:([^;"]+)/.exec(html.slice(s, i)) || [])[1] || null; };

test('C26 : la carte d’un binaire dit le calme en neutre — l’ambre pour un ouvert, l’accent pour un mouvement, le rouge pour un danger', () => {
  const cas = [
    [st('binary_sensor.porte', 'off', { friendly_name: 'Porte', device_class: 'door' }), 'Fermée', 'var(--o-text2)'],
    [st('binary_sensor.porte', 'on', { friendly_name: 'Porte', device_class: 'door' }), 'Ouverte', 'var(--o-warn)'],
    [st('binary_sensor.fumee', 'off', { friendly_name: 'Fumée', device_class: 'smoke' }), 'Aucune fumée', 'var(--o-text2)'],
    [st('binary_sensor.fumee', 'on', { friendly_name: 'Fumée', device_class: 'smoke' }), 'Fumée détectée', 'var(--o-bad)'],
    [st('binary_sensor.salon', 'off', { friendly_name: 'Salon', device_class: 'motion' }), 'Aucun mouvement', 'var(--o-text2)'],
    [st('binary_sensor.salon', 'on', { friendly_name: 'Salon', device_class: 'motion' }), 'Mouvement', 'var(--o-accent-soft)'],
    [st('binary_sensor.bureau', 'on', { friendly_name: 'Bureau', device_class: 'occupancy' }), 'Occupé', 'var(--o-accent-soft)'],
    [st('binary_sensor.boitier', 'off', { friendly_name: 'Boîtier', device_class: 'tamper' }), 'Intact', 'var(--o-text2)'],
  ];
  for (const [e, mot, couleur] of cas) {
    const html = carte(e);
    assert.equal(couleurDe(html, mot), couleur, mot);
  }
  // Muet : « Indisponible » en rouge, et le liseré qui respire (ADR 0048).
  const muet = carte(st('binary_sensor.porte', 'unavailable', { friendly_name: 'Porte', device_class: 'door' }));
  assert.ok(muet.includes('o-panne') && couleurDe(muet, 'Indisponible') === 'var(--o-bad)');
  // Un danger allume sa plaque et son lavis ; le calme, non.
  assert.ok(carte(cas[3][0]).includes('rgba(var(--o-bad-rgb),.16)') && !carte(cas[2][0]).includes('rgba(var(--o-bad-rgb),.16)'));
});

test('C26 : « Tout va bien » sort de BIN_ETATS — `safety` éteint dit « Normal », `problem` éteint « Aucun problème »', () => {
  const E = F.BIN_ETATS();
  assert.deepEqual([E.safety[1], E.problem[1]], ['Normal', 'Aucun problème']);
  assert.ok(!Object.values(E).some(x => x.includes('Tout va bien')));
  const d = APP.indexOf('const BIN_ETATS = () => ({');
  assert.ok(!APP.slice(d, APP.indexOf('});', d)).includes('Tout va bien'));
  assert.ok(carte(st('binary_sensor.alerte', 'off', { friendly_name: 'Alerte', device_class: 'safety' })).includes('>Normal<'));
});

test('la journée d’un binaire : ses bandes, combien de fois, depuis quand, la dernière ouverture', () => {
  const minuit = new Date(2026, 9, 16).getTime();
  const h = (x) => minuit + x * 3600000;
  const reponse = [[{ entity_id: 'binary_sensor.baie', state: 'off', last_changed: new Date(minuit).toISOString() },
    { state: 'on', last_changed: new Date(h(8)).toISOString() }, { state: 'off', last_changed: new Date(h(9)).toISOString() },
    { state: 'on', last_changed: new Date(h(20)).toISOString() }]];
  const etats = J.lireJournee(reponse)['binary_sensor.baie'];
  assert.equal(etats.length, 4);
  assert.equal(J.minuitDe(h(15)), minuit);
  assert.deepEqual(J.bandesDuJour(etats, minuit, h(22)), [{ a: 36.4, b: 40.9 }, { a: 90.9, b: 100 }], 'ouverte de 8 h à 9 h, puis depuis 20 h');
  assert.equal(J.foisDuJour(etats), 2);
  assert.equal(J.dernierPassage(etats, minuit), h(20));
  assert.equal(J.depuisDuJour(etats, minuit), h(20));
  // Rien n'a changé aujourd'hui : « depuis » ne se sait pas, et un état actif dès minuit compte une fois.
  const fixe = [{ t: minuit, s: 'on' }];
  assert.deepEqual([J.depuisDuJour(fixe, minuit), J.dernierPassage(fixe, minuit), J.foisDuJour(fixe)], [null, null, 1]);
  assert.deepEqual(J.lireJournee('erreur'), {});
});

/* La fiche telle que sa coquille (`FicheBinaire`, App.jsx) la monte : le `hass` vivant, les briques, la pièce et la famille. */
function hassFiche(etats, reponse) {
  const lectures = [];
  const hass = { ...hassDe(...etats), callApi: (m, chemin) => { lectures.push(chemin); return Promise.resolve(reponse); } };
  return { hass, lectures };
}

test('§ 5.2 : la fiche d’un binaire — l’état en grand, « depuis », la bande du jour, le dernier signal, la pile, L’appareil ; plus les lignes de Home Assistant', async () => {
  const minuit = J.minuitDe(Date.now());
  const ouverte = new Date(minuit + 60000).toISOString();
  const reponse = [[{ entity_id: 'binary_sensor.baie', state: 'off', last_changed: new Date(minuit).toISOString() }, { state: 'on', last_changed: ouverte }]];
  const { hass, lectures } = hassFiche([st('binary_sensor.baie', 'on', { friendly_name: 'Baie vitrée', device_class: 'door' })], reponse);
  const fiches = [];
  const m = monter(FC.RoomBinarySheet, { id: 'binary_sensor.baie', hass, briques: F.BRIQUES_CAPTEUR, piece: 'Séjour', famille: 'Porte', onFiche: (x) => fiches.push(x) });
  await new Promise(r => setTimeout(r, 0));
  m.rendre();
  const texte = m.texte();
  assert.equal(lectures.length, 1, 'une lecture, à l’ouverture');
  assert.ok(lectures[0].startsWith('history/period/' + new Date(minuit).toISOString() + '?filter_entity_id=binary_sensor.baie&minimal_response&no_attributes'), lectures[0]);
  const entete = m.trouver(e => e.props && e.props.sousNom !== undefined)[0];
  assert.equal(entete.props.sousNom, 'Séjour · Porte');
  assert.ok(texte.includes('Ouverte') && texte.includes('depuis '), texte.slice(0, 200));
  const bande = m.trouver(e => e.type === J.BandeJour)[0];
  assert.equal(bande.props.resume, 'ouverte une fois aujourd’hui');
  assert.equal(bande.props.bandes.length, 1, 'ouverte depuis une minute après minuit');
  for (const ancien of ['Relevé', 'Dernière valeur reçue', 'Zone déclarée dans Home Assistant', 'Depuis le journal de Home Assistant'])
    assert.ok(!texte.includes(ancien), ancien + ' : une ligne d’avant');
  assert.ok(texte.includes('Dernier signal') && texte.includes('L’appareil'));
  m.appuyer(m.trouver(e => e.type === 'button' && e.props.onClick && e.props.style && e.props.style.textAlign === 'left')[0]);
  assert.deepEqual(fiches, ['binary_sensor.baie'], 'L’appareil ouvre la fiche universelle');
});

test('la coquille garde la feuille et pose la frontière DEDANS ; elle passe la pièce, la famille, l’épingle et L’appareil', () => {
  const i = APP.indexOf('\nfunction FicheBinaire(');
  const coquille = APP.slice(i, APP.indexOf('\n}\n', i));
  assert.ok(coquille.includes('<FicheBinaireContent id={id} hass={H} briques={BRIQUES_CAPTEUR} piece={zoneDe(id)} famille={FAMILLES_BINAIRES()[classe] || null} onFiche={setFiche}'));
  assert.ok(coquille.includes('epingle={<BoutonEpingle id={id} />}') && coquille.includes('{fiche && <FicheAppareil id={fiche} hass={H} onClose={() => setFiche(null)} />}'));
});
