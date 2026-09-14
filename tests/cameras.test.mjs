// ─────────────────────────────────────────────────────────────────────────────
// L'identité d'une tuile caméra.
//
// Loggia accepte qu'une caméra soit déclarée par son seul nom, sans entité :
// la tuile prend alors son rendu de repli. Ces caméras-là n'ont pas de `haid`,
// et `key={c.haid || c.id}` valait donc `undefined` pour toutes.
//
// React s'en plaignait dans la console, mais le vrai dégât était plus discret :
// sans clé distincte, il ne peut plus dire quelle tuile est laquelle. L'état
// local d'une tuile — sa popup d'agrandissement ouverte — peut alors se
// retrouver sur sa voisine dès que l'ordre de la liste change.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleCamera } from '../src/present.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');

test('une caméra sans entité reçoit quand même une clé', () => {
  // Le cas de la démo, et de toute caméra déclarée par son nom seul.
  const k = cleCamera({ name: 'Jardin', online: true }, 0);
  assert.equal(typeof k, 'string', 'la clé n’est pas une chaîne');
  assert.ok(k, 'la clé est vide : React ne distinguera plus les tuiles');
});

test('deux caméras homonymes sans entité gardent des clés distinctes', () => {
  // Rien n'interdit deux « Entrée ». Sans le rang pour les départager, elles
  // partageraient une clé et React les confondrait.
  assert.notEqual(cleCamera({ name: 'Entrée' }, 0), cleCamera({ name: 'Entrée' }, 1),
    'deux caméras du même nom partagent une clé');
});

test('une caméra sans nom ni entité reste identifiable', () => {
  const a = cleCamera({}, 0), b = cleCamera({}, 1);
  assert.ok(a && b, 'une caméra sans nom perd sa clé');
  assert.notEqual(a, b, 'deux caméras anonymes partagent une clé');
  // Et rien ne doit jeter sur une entrée absente : la liste vient de la
  // configuration de l'utilisateur, pas d'un schéma garanti.
  assert.ok(cleCamera(null, 0), 'une entrée nulle fait perdre la clé');
});

test('l’entité prime quand elle existe', () => {
  // Un entity_id est déjà unique, et il survit à un changement d'ordre —
  // contrairement au rang. Il doit donc passer avant.
  assert.equal(cleCamera({ haid: 'camera.jardin', name: 'Jardin' }, 3), 'camera.jardin',
    'la clé n’est plus l’entité quand la caméra en a une : elle bougera avec l’ordre');
});

test('toute une liste de caméras sans entité reste sans doublon', () => {
  const liste = [{ name: 'Entrée' }, { name: 'Entrée' }, {}, { name: 'Jardin' }, { haid: 'camera.rue' }];
  const cles = liste.map(cleCamera);
  assert.equal(new Set(cles).size, liste.length, `clés en double : ${cles.join(', ')}`);
});

test('la tuile est rendue avec cette clé, pas avec l’entité seule', () => {
  const i = src.indexOf('<CameraTile key=');
  assert.notEqual(i, -1, 'le rendu des tuiles caméra a disparu');
  assert.match(src.slice(i, i + 60), /key=\{c\.cle\}/,
    'la tuile reprend une clé qui peut valoir undefined pour les caméras sans entité');
  assert.match(src, /cle: cleCamera\(cam, i\)/,
    'la clé n’est plus posée là où la liste se construit');
});

test('le repli de démonstration a des clés fixes, pas traduites', () => {
  const i = src.indexOf('const CAMERAS = () => [');
  assert.notEqual(i, -1, 'la liste de repli a disparu');
  const bloc = src.slice(i, src.indexOf('\n];', i));
  // Ces deux entrées n'ont pas d'entité non plus. Et leur `label` passe par
  // `tr()` : une clé bâtie dessus changerait à chaque changement de langue et
  // remonterait les tuiles pour rien.
  assert.equal((bloc.match(/cle: '[^']+'/g) || []).length, 2,
    'les caméras de repli n’ont plus toutes une clé fixe');
  assert.ok(!/cle: tr\(/.test(bloc), 'la clé de repli passe par tr() : elle changera avec la langue');
});

test('la vue Sécurité n’affiche que les caméras qui ont une entité', () => {
  const i = src.indexOf('const camList = rCams.map(');
  assert.notEqual(i, -1, 'camList a disparu');
  const corps = src.slice(i, src.indexOf(';', src.indexOf('.filter(', i)));
  // C'est ce filtre — et lui seul — qui rend sûre la clé `c.haid` du rendu de
  // cette vue. Le retirer y ramènerait exactement le défaut corrigé ici.
  assert.match(corps, /\.filter\(c => c && c\.haid\)/,
    'la vue Sécurité accepte des caméras sans entité : sa clé de liste redeviendra undefined');
});

test('la fiche camera : le flux, comment on le voit, les modes, la Securite', () => {
  const debut = src.indexOf('function CamSheet(');
  const fin = src.indexOf('function CameraTile(', debut);
  assert.ok(debut > 0 && fin > debut, 'la fiche precede la tuile');
  const fiche = src.slice(debut, fin);
  assert.ok(fiche.includes('<FicheEntete '), 'le squelette commun des fiches');
  assert.ok(fiche.includes('cameraModes(LOGGIA_INDEX, S, haid)'), 'les modes viennent du registre, pas d’une liste');
  assert.ok(fiche.includes('<CameraTile c={tuileCamera({ name: nom, haid, online }, 0, hass)} agrandir={false} />'), 'la tuile de l’Accueil, sans agrandissement');
  assert.ok(!fiche.includes('<CamLive '), 'pas de second dessin du flux');
  assert.ok(fiche.includes("onNav('securite')"), 'le chemin vers la vue Securite');
  assert.ok(!fiche.includes('borderRadius: 999'), 'pas de pilule : arrondi 9');
  const d = src.indexOf('const CAM_MODES = () => ({');
  const table = src.slice(d, src.indexOf('});', d));
  ['mouvement', 'suivi', 'pleurs', 'prive'].forEach(cle => assert.ok(table.includes(cle + ': [tr('), 'titre et phrase pour ' + cle));
  assert.ok(!table.includes('20 s') && !table.includes('sans filmer'), 'on ne promet que ce que l’entite fait');
});

test('depuis une piece, la fiche camera sait aller a la Securite', () => {
  const rv = src.indexOf('function RoomView(');
  const room = src.slice(rv, src.indexOf('\nfunction ', rv + 1));
  assert.ok(room.includes('useDomainCards(hass, { onNav })'), 'RoomView passe onNav aux fiches');
  assert.ok(src.includes('function useDomainCards(hass, { onNav = null } = {})'), 'les autres appels restent sans');
  assert.ok(src.includes('onClose={() => setCamPop(null)} onNav={onNav} />'), 'la fiche recoit onNav');
});

test('la carte camera porte sa couleur : lavis, icone et repere en bleu quand elle est en direct', () => {
  const d = src.indexOf('function RoomGenericCard(');
  const carte = src.slice(d, src.indexOf('\nfunction ', d + 1));
  assert.ok(carte.includes("const direct = dom === 'camera' && !mort && (s === 'streaming' || s === 'recording' || s === 'idle');"), 'l’etat « en direct » est nomme');
  assert.ok(carte.includes("const allume = !mort && (danger || direct || (actif"), 'une camera en direct est allumee : lavis compris');
  assert.ok(carte.includes("const ico = dom === 'camera' ? 'camera' : cvIcoEntite(dom, id, st, nom);"), 'appareil photo dans le carre, camera video en repere');
  assert.ok(carte.includes("RM_ICO(allume ? icoFond : 'var(--o-s1)', allume ? icoTexte : 'var(--o-text3)')"), 'la teinte de l’icone suit allume');
  assert.ok(carte.includes("color: direct ? icoTexte : 'var(--o-text3)'"), 'le repere en haut a droite aussi');
  assert.ok(carte.includes('(allume && LAVIS ?'), 'le lavis suit allume, donc la camera en direct');
});

test('l’Accueil et la fiche dessinent la meme tuile camera', () => {
  assert.ok(src.includes('a.cams.map((cam, i) => tuileCamera(cam, i, a.hass))'), 'l’Accueil passe par tuileCamera');
  const d = src.indexOf('function tuileCamera(');
  const corps = src.slice(d, src.indexOf('\n}', d));
  assert.ok(corps.includes('cle: cleCamera(cam, i)'), 'la cle de la tuile reste celle de cleCamera');
  assert.ok(corps.includes("tr('Direct')") && corps.includes("tr('Hors ligne')"), 'le point d’etat parle la langue du moment');
  assert.ok(src.includes('function CameraTile({ c, agrandir = true })'), 'la tuile sait se passer de son bouton');
  assert.ok(src.includes('{live && agrandir && ('), 'le bouton d’agrandissement ne s’affiche que si on le demande');
});
