// Les scenarios de Loggia (16/09, ADR 0027) : le module pur qui les DIT —
// nom, teinte, resume, dernier lancement — et ce que l'ecran en fait.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GESTES_SCENARIO, FAMILLES, IDS_INTEGRES, TEINTES_SCENARIO, ICONES_SCENARIO,
  nomScenario, teinteScenario, libelleAction, resumeScenario, nombreActions, nombreCibles,
  libelleDernier, scenariosVisibles, scenariosAccueil, actionVide, scenarioVide, versEnregistrement,
} from '../src/scenarios.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const police = readFileSync(join(RACINE, 'public', 'fonts', 'uicons-regular-rounded.css'), 'utf8');
const css = readFileSync(join(RACINE, 'src', 'index.css'), 'utf8');

test('aucun geste ne desarme ni ne deverrouille, et chaque famille a ses gestes', () => {
  const tous = Object.values(GESTES_SCENARIO).flat();
  assert.ok(!tous.includes('desarmer') && !tous.includes('deverrouiller'));
  assert.deepEqual(FAMILLES, Object.keys(GESTES_SCENARIO));
  assert.deepEqual(GESTES_SCENARIO.alarme, ['absent', 'nuit', 'maison']);
  assert.equal(IDS_INTEGRES.length, 8);
});

test('un scenario de Loggia se nomme dans la langue du moment, un perso par son nom', () => {
  assert.equal(nomScenario({ id: 'nuit', nom: null }), 'Bonne nuit');
  assert.equal(nomScenario({ id: 'nuit', nom: 'Dodo' }), 'Dodo');
  assert.equal(nomScenario({ id: 'perso_apero', nom: 'Apéro' }), 'Apéro');
  assert.equal(nomScenario({ id: 'perso_x' }), 'perso_x');
  assert.equal(nomScenario(null), '');
});

test('la teinte : un jeton connu, l’accent sinon', () => {
  assert.equal(teinteScenario({ teinte: 'chambre' }).col, 'var(--o-piece-chambre)');
  assert.equal(teinteScenario({ teinte: 'fuchsia' }).id, 'accent');
  assert.equal(teinteScenario(null).id, 'accent');
  for (const t of TEINTES_SCENARIO) {
    if (t.rgb.startsWith('var(')) assert.ok(css.includes(t.rgb.slice(4, -1) + ':'), t.id + ' : le jeton rgb existe dans index.css');
  }
});

test('une action se dit en quelques mots, avec sa portee et sa condition', () => {
  assert.equal(libelleAction({ famille: 'lumieres', geste: 'eteindre', portee: 'maison' }), 'Lumières éteintes');
  assert.equal(libelleAction({ famille: 'lumieres', geste: 'allumer', portee: 'piece', piece: 'Salon', valeur: 10 }), 'Lumières à 10 % · Salon');
  assert.equal(libelleAction({ famille: 'lumieres', geste: 'allumer', portee: 'vie', valeur: 60, si: 'nuit' }), 'Lumières à 60 % · pièces de vie (la nuit)');
  assert.equal(libelleAction({ famille: 'lumieres', geste: 'allumer', portee: 'piece' }), 'Lumières à 100 % · pièce à choisir');
  assert.equal(libelleAction({ famille: 'volets', geste: 'fermer' }), 'Volets fermés');
  assert.equal(libelleAction({ famille: 'medias', geste: 'allumer_tv', portee: 'piece', piece: 'Salon' }), 'TV allumée · Salon');
  assert.equal(libelleAction({ famille: 'chauffage', geste: 'eco' }), 'Chauffage éco');
  assert.equal(libelleAction({ famille: 'alarme', geste: 'absent' }), 'Alarme absent');
  assert.equal(libelleAction({ famille: 'serrures', geste: 'verrouiller', si: 'jour' }), 'Portes verrouillées (le jour)');
  assert.equal(libelleAction({ famille: 'piscine', geste: 'vider' }), '');
  assert.equal(libelleAction(null), '');
});

test('le resume : ce que le serveur a resolu, sinon les actions, sinon rien ; un lien dit ce qu’il lance', () => {
  const s = { actions: [{ famille: 'lumieres', geste: 'eteindre' }, { famille: 'volets', geste: 'fermer' }] };
  assert.equal(resumeScenario(s), 'Lumières éteintes · Volets fermés');
  assert.equal(resumeScenario({ ...s, resume: [{ famille: 'alarme', geste: 'nuit', n: 1 }] }), 'Alarme nuit');
  assert.equal(resumeScenario({ actions: [] }), 'Aucune action');
  assert.equal(resumeScenario({ lien: 'script.good_night' }, { 'script.good_night': 'Good night' }), 'Lance Good night');
  assert.equal(resumeScenario({ lien: 'scene.x' }), 'Lance scene.x');
  assert.equal(resumeScenario(null), '');
});

test('combien d’actions, combien de cibles', () => {
  assert.equal(nombreActions({ actions: [{}, {}, {}] }), 3);
  assert.equal(nombreActions({ lien: 'scene.x', actions: [] }), 1);
  assert.equal(nombreCibles({ resume: [{ n: 3 }, { n: 2 }, { n: 0 }] }), 5);
  assert.equal(nombreCibles({ actions: [{}] }), null);
  assert.equal(nombreCibles({ lien: 'scene.x', resume: [{ n: 4 }] }), null);
});

test('quand il a tourne : jamais, a l’instant, il y a n min, une heure, hier, il y a n j', () => {
  const now = new Date(2026, 8, 16, 21, 30, 0).getTime();
  const s = (secondesAvant) => now / 1000 - secondesAvant;
  assert.equal(libelleDernier(null, now), '—');
  assert.equal(libelleDernier(s(-5), now), '—', 'un futur ne se dit pas');
  assert.equal(libelleDernier(s(20), now), "À l'instant");
  assert.equal(libelleDernier(s(12 * 60), now), 'Il y a 12 min');
  assert.equal(libelleDernier(s(3 * 3600), now), '18:30');
  assert.equal(libelleDernier(s(24 * 3600), now), 'hier');
  assert.equal(libelleDernier(s(3 * 86400 + 60), now), 'Il y a 3 j');
});

test('visibles et sur l’accueil : un scenario masque disparait, un scenario sans accueil reste dans la vue', () => {
  const liste = [{ id: 'a' }, { id: 'b', masque: true }, { id: 'c', accueil: false }, null, { nom: 'sans id' }];
  assert.deepEqual(scenariosVisibles(liste).map(s => s.id), ['a', 'c']);
  assert.deepEqual(scenariosAccueil(liste).map(s => s.id), ['a']);
  assert.deepEqual(scenariosVisibles(undefined), []);
});

test('ce que la fiche envoie : le scenario sans ce qu’il a calcule', () => {
  const s = {
    id: 'nuit', nom: '  ', icone: 'moon', teinte: 'chambre', lien: null, piece: null, integre: true, modifie: false,
    resume: [{ n: 3 }], dernier: 12, suggestion: 'scene.x', piece_effective: 'Salon', lien_absent: false,
    actions: [{ famille: 'lumieres', geste: 'eteindre', portee: 'maison', sauf_veilleuses: true, valeur: 30 },
      { famille: 'lumieres', geste: 'allumer', portee: 'piece', piece: 'Salon', valeur: 10, si: 'nuit' },
      { famille: 'volets', geste: 'fermer', portee: 'piece', valeur: 4, si: 'toujours' }],
  };
  assert.deepEqual(versEnregistrement(s), {
    id: 'nuit', nom: null, icone: 'moon', teinte: 'chambre', lien: null, piece: null, accueil: true, masque: false,
    actions: [{ famille: 'lumieres', geste: 'eteindre', portee: 'maison', sauf_veilleuses: true, valeur: 30 },
      { famille: 'lumieres', geste: 'allumer', portee: 'piece', piece: 'Salon', valeur: 10, si: 'nuit' },
      { famille: 'volets', geste: 'fermer', portee: 'piece' }],
  });
  assert.deepEqual(versEnregistrement({ nom: 'Apéro', lien: 'scene.apero', actions: [{ famille: 'medias', geste: 'lecture' }] }).actions, [], 'un lien : plus d’actions');
  assert.equal(versEnregistrement({ nom: 'x', accueil: false, masque: true }).accueil, false);
  assert.deepEqual(actionVide('volets'), { famille: 'volets', geste: 'ouvrir', portee: 'maison' });
  assert.deepEqual(actionVide('piscine'), { famille: 'lumieres', geste: 'eteindre', portee: 'maison' });
  assert.equal(scenarioVide().icone, 'sparkles');
});

test('les quarante icones existent dans la police regular, par pages de dix', () => {
  assert.equal(ICONES_SCENARIO.length, 40);
  assert.equal(new Set(ICONES_SCENARIO).size, 40, 'sans doublon');
  for (const ic of ICONES_SCENARIO) assert.ok(police.includes('.fi-rr-' + ic + ':before'), ic + ' manque a la police');
});
