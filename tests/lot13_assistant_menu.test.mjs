// ─────────────────────────────────────────────────────────────────────────────
// Le choix de l'assistant passe par la liste de Loggia (lot 13 de l'audit du
// 03/10).
//
// Le nom de l'en-tête ouvrait un menu fait main : un bouton à `aria-expanded`
// sans `aria-haspopup`, des boutons à `aria-pressed` dans un groupe, aucune
// flèche au clavier, l'assistant choisi en teinte d'accent et non en bleu
// plein, une liste à sa taille à elle. Il passe par `ListeChoix`, comme tous
// les menus — à qui il fallait, d'abord, une prop `disabled` : on ne change pas
// d'assistant pendant qu'elle écoute ou répond, la réponse continuerait
// d'arriver dans le fil d'un autre.
//
// Le bouton garde son dessin (le titre, son chevron), son nom — le titre lu
// d'abord, WCAG 2.5.3 — et sa bulle.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { composant, rendre } from './rendu.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const UI = lire('src', 'ui.jsx');
const FEUILLE = lire('src', 'views', 'assistant.jsx');
const LISTE = UI.slice(UI.indexOf('export function ListeChoix('), UI.indexOf('export function ChampSuggere('));

const OPTIONS = [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }];
// La balise ouvrante du bouton qui porte la liste.
const boutonListe = (html) => (html.match(/<button[^>]*aria-haspopup="listbox"[^>]*>/) || [''])[0];

test('ListeChoix sait se figer : bouton désactivé, liste qui ne s’ouvre pas', async () => {
  const ListeChoix = await composant('ui.jsx', 'ListeChoix');
  const fige = boutonListe(rendre(ListeChoix, { label: 'Liste', value: 'a', options: OPTIONS, onChange: () => {}, disabled: true }));
  assert.ok(fige, 'la liste n’a plus son bouton');
  assert.ok(/\sdisabled=""/.test(fige), 'désactivée, la liste garde un bouton actif');
  assert.ok(fige.includes('aria-expanded="false"'));
  assert.ok(/cursor:\s*default/.test(fige), 'un bouton désactivé garde la main de « cliquable »');
  // L'ouverture est déduite, pas seulement refusée au clic : désactivée en
  // cours de route, la liste se referme dès ce rendu-là, et son état aussi —
  // sinon elle se rouvrirait d'elle-même au retour.
  assert.ok(LISTE.includes('const open = ouverte && !disabled;'), 'la liste resterait ouverte une fois désactivée');
  assert.ok(LISTE.includes('if (disabled) return;'), 'une liste désactivée s’ouvrirait encore');
  assert.ok(LISTE.includes('useEffect(() => { if (disabled) { setOpen(false); setFiltre(\'\'); setActif(-1); } }, [disabled]);'),
    'la liste se rouvrirait d’elle-même une fois réactivée');
});

test('sans les nouveaux réglages, rien ne change pour les autres listes', async () => {
  const ListeChoix = await composant('ui.jsx', 'ListeChoix');
  const b = boutonListe(rendre(ListeChoix, { label: 'Liste', value: 'a', options: OPTIONS, onChange: () => {} }));
  assert.ok(b && !/\sdisabled/.test(b) && !/\stitle=/.test(b), 'une liste ordinaire a pris un réglage qu’on ne lui a pas donné');
  assert.ok(/cursor:\s*pointer/.test(b));
  assert.ok(b.includes('aria-label="Liste'), 'le nom composé « liste : choix » a changé');
});

test('le nom et la bulle d’un bouton dessiné par l’appelant', async () => {
  const ListeChoix = await composant('ui.jsx', 'ListeChoix');
  const b = boutonListe(rendre(ListeChoix, { label: 'Liste', value: 'a', options: OPTIONS, onChange: () => {}, nom: 'Alpha — Liste', title: 'Liste' }));
  assert.ok(b.includes('aria-label="Alpha — Liste"'), '`nom` ne remplace pas le nom composé');
  assert.ok(b.includes('title="Liste"'), 'la bulle ne passe pas');
});

test('l’assistant se choisit dans la liste de Loggia, plus dans un menu fait main', async () => {
  const { cfgSet } = await import('../src/state.js');
  cfgSet({ loggia_assistant: 'conversation.alpha' });
  const AssistantSheet = await composant('views/assistant.jsx');
  const { tr } = await import('../src/i18n.js');
  const deux = {
    'conversation.alpha': { attributes: { friendly_name: 'Alpha' } },
    'conversation.beta': { attributes: { friendly_name: 'Beta' } },
  };
  const html = rendre(AssistantSheet, { hass: { states: deux, user: { is_admin: true } }, ns: 'conversation.alpha', onClose: () => {} });
  const b = boutonListe(html);
  assert.ok(b, 'le nom de l’en-tête n’ouvre pas une liste (aria-haspopup="listbox")');
  // Le nom commence par ce qui se lit — le titre — et dit à quoi sert le bouton.
  assert.ok(b.includes('aria-label="Alpha — ' + tr('Choisir l’assistant') + '"'), 'le nom ne commence plus par le titre affiché');
  assert.ok(b.includes('title="' + tr('Choisir l’assistant') + '"'), 'la bulle au survol est partie');
  assert.ok(!/\sdisabled/.test(b), 'au repos, le choix est figé');
  // Le dessin : le titre et son chevron, sans fond ni bordure.
  const i = html.indexOf(b);
  const contenu = html.slice(i, html.indexOf('</button>', i));
  assert.ok(contenu.includes('>Alpha</span>'), 'le titre n’est plus dans le bouton');
  assert.ok(/background:\s*none/.test(b) && /border:\s*0/.test(b) && /min-height:\s*36px/.test(b), 'le bouton-titre a changé de dessin');
  // Et le menu fait main est parti.
  assert.ok(!FEUILLE.includes('setMenu') && !FEUILLE.includes('aria-pressed={sur}'), 'le menu fait main est revenu');
  assert.ok(FEUILLE.includes('<ListeChoix value={actuelle} options={optionsChoix} onChange={choisir}'));
  // Figé pendant qu'elle écoute ou répond — `disabled`, qui la referme aussi.
  assert.ok(FEUILLE.includes('disabled={occupe || ecoute}'), 'on changerait d’assistant en pleine réponse');
  cfgSet({ loggia_assistant: null });
});
