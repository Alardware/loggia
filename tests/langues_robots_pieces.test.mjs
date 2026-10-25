/* TEST AJOUTÉ (chantier IoT, tranche robots 2, 19/10 ; § 11 de la conception) — les textes de la tranche dans les sept langues.
 *  - Le bloc de la tranche (« … (chantier IoT, tranche robots 2, 19/10) ») existe dans les six catalogues, avec les MÊMES clés, dans
 *    le même ordre ; chaque clé a une traduction.
 *  - En polonais, le bloc porte « Textes nouveaux, à relire par Seba882. » ; le gabarit de pluriel (« {n} pièces sur une autre
 *    carte… ») a ses formes `few`, `many`, `other`.
 *  - Le français vouvoie ; l'allemand, l'espagnol, l'italien et le néerlandais TUTOIENT (sa décision du 19/10, comme l'interface de
 *    Home Assistant) ; les noms des zones, des cartes et des robots ne se traduisent pas (ce sont des repères).
 *  - Chaque clé a un lecteur : l'écran (`robotsfiche.js`, `refusrobots.js`) ou le journal du serveur (`robots.py`, les causes d'un
 *    passage retenu) — aucune clé dormante. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const LANGUES = ['en', 'de', 'nl', 'it', 'es', 'pl'];
const TEXTE = Object.fromEntries(LANGUES.map(l => [l, readFileSync(join(RACINE, 'src', 'langues', l + '.js'), 'utf8')]));
const CAT = Object.fromEntries(await Promise.all(LANGUES.map(async l => [l, (await import(pathToFileURL(join(RACINE, 'src', 'langues', l + '.js')).href)).default])));
const MARQUE = '  //   Textes nouveaux, à relire par Seba882.';
const TITRE = '// Les pièces sans rien configurer (chantier IoT, tranche robots 2, 19/10)';
/* TEST AJOUTÉ (passe bis de la tranche robots 2, 20/10) : le second bloc — sa décision « Mon script garde la main » (la roue, les
 * lignes de « Où », le refus) et la phrase du passage refusé —, dans les six catalogues, les mêmes règles. */
const TITRE_BIS = '// Les pièces sans rien configurer — passe bis (chantier IoT, tranche robots 2, 20/10)';

/* Le bloc de la tranche d'un catalogue : `{ marque, cles }` — de sa ligne de titre à la ligne vide (ou à la fin de l'objet) qui le suit. */
function bloc(texte, titre = TITRE) {
  const lignes = texte.split('\n');
  const i = lignes.findIndex(l => l.trim() === titre);
  if (i < 0) return null;
  const b = { marque: lignes[i + 1] === MARQUE, cles: [] };
  for (let j = i + 1; j < lignes.length && lignes[j].trim() !== '' && lignes[j] !== '};'; j++) {
    const m = /^ {2}'((?:[^'\\]|\\.)*)':/.exec(lignes[j]);
    if (m) b.cles.push(m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\'));
  }
  return b;
}

const CLES = [
  'Vos scripts gardent la main pour les pièces.',
  'Associez une fois les pièces du robot aux zones de Home Assistant : Paramètres › Appareils et services › Entités › {robot} › roue › « Associer les segments aux zones ».',
  'Les pièces du robot ne sont pas encore associées aux zones de Home Assistant.',
  'Associez les pièces aux zones de Home Assistant pour les nommer comme vos pièces.',
  'La carte du robot a changé : refaites l’association dans Home Assistant.',
  '{n} pièce sur une autre carte ({carte}) — changez de carte dans les réglages du robot.',
  '{n} pièces sur une autre carte ({carte}) — changez de carte dans les réglages du robot.',
  'Départ non lancé — associez d’abord les pièces du robot aux zones dans Home Assistant',
  'Départ non lancé — cette zone n’a plus de pièce associée',
  'Départ non lancé — ces pièces sont sur une autre carte du robot',
  'Départ non lancé — la liste des pièces du robot a changé : rouvrez la fiche',
  'association absente',
  'zone sans pièce associée',
  'autre carte',
  'pièces inconnues de cette intégration',
  'liste des pièces du robot périmée',
];

const CLES_BIS = [
  'Désignez votre script des pièces sélectionnées dans la roue : les puces de « Où » seront vos interrupteurs.',
  'Votre script des pièces est désigné, mais aucune pièce de la maison n’a d’interrupteur : les puces de « Où » ne peuvent pas être les vôtres.',
  'Départ non lancé — vos scripts gardent la main pour les pièces',
  'Scripts de la maison',
  'Désignez vos scripts par rôle : Loggia les lance, et vous gardez la main sur les pièces.',
  'Pièces sélectionnées',
  'Scripts du robot',
  'Autres scripts',
  'Passage non enregistré — sa forme n’est pas celle que le composant attend.',
];
const TOUTES = [...CLES, ...CLES_BIS];

test('les deux blocs de la tranche sont dans les six catalogues, avec les mêmes clés, chacune traduite', () => {
  for (const l of LANGUES) {
    for (const [titre, cles] of [[TITRE, CLES], [TITRE_BIS, CLES_BIS]]) {
      const b = bloc(TEXTE[l], titre);
      assert.ok(b, l + ' : le bloc « ' + titre + ' » manque');
      assert.deepEqual(b.cles, cles, l + ' : une clé diffère (' + titre + ')');
      for (const k of cles) {
        const v = CAT[l][k];
        assert.ok(v != null && v !== '' && (typeof v === 'string' || typeof v === 'object'), l + ' : « ' + k + ' » sans traduction');
        if (typeof v === 'string') assert.ok(v !== k || /^(autre carte)$/.test(k), l + ' : « ' + k + ' » recopiée en français');
      }
    }
  }
});

test('le polonais nouveau se signale à Seba882, et le gabarit de pluriel a ses formes', () => {
  const b = bloc(TEXTE.pl);
  assert.ok(b && b.marque, 'le bloc polonais sans la marque de relecture');
  const v = CAT.pl['{n} pièces sur une autre carte ({carte}) — changez de carte dans les réglages du robot.'];
  assert.ok(v && typeof v === 'object' && ['few', 'many', 'other'].every(f => typeof v[f] === 'string' && v[f].includes('{carte}')), 'few, many et other en polonais, le nom de la carte dans chaque forme');
  assert.equal(b.cles.length, 16, 'seize textes à relire');
  const bis = bloc(TEXTE.pl, TITRE_BIS);
  assert.ok(bis && bis.marque, 'le bloc polonais de la passe bis sans la marque de relecture');
  assert.equal(bis.cles.length, 9, 'neuf textes de plus à relire');
});

test('le français vouvoie ; l’allemand, l’espagnol, l’italien et le néerlandais tutoient, comme Home Assistant', () => {
  const tutoieFr = TOUTES.filter(t => /^(Clique|Touche|Appuie|Sélectionne|Choisis|Associe|Change|Refais|Rouvre|Désigne)\b/.test(t) || /\b(tu|ton|ta|tes|toi|te)\b/i.test(t));
  assert.deepEqual(tutoieFr, [], 'le français tutoie');
  const de = TOUTES.map(k => CAT.de[k]).filter(v => typeof v === 'string');
  assert.deepEqual(de.filter(v => /\b(Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihnen)\b/.test(v) || /\b(Ordnen|Wechseln|Erneuern|Öffnen|Wählen) Sie\b/.test(v)), [], 'l’allemand vouvoie');
  assert.ok(de.some(v => /\b(Deine|deine|Ordne|wechsle|öffne|Wähle)\b/.test(v)), 'l’allemand tutoie quelque part');
  const es = TOUTES.map(k => CAT.es[k]).filter(v => typeof v === 'string');
  assert.deepEqual(es.filter(v => /\b(usted|ustedes)\b/i.test(v) || /\b(asocie|cambie|rehaga|vuelva|elija)\b/.test(v)), [], 'l’espagnol vouvoie');
  assert.ok(es.some(v => /\b(Tus|tus|Asocia|cambia|rehaz|vuelve|Elige)\b/.test(v)), 'l’espagnol tutoie quelque part');
  const it = TOUTES.map(k => CAT.it[k]).filter(v => typeof v === 'string');
  assert.deepEqual(it.filter(v => /\b(Lei|Suoi|Sue|Suo|Sua)\b/.test(v) || /\b(associ|cambi|rifaccia|riapra|scelga)\b/.test(v)), [], 'l’italien vouvoie');
  const nl = TOUTES.map(k => CAT.nl[k]).filter(v => typeof v === 'string');
  assert.deepEqual(nl.filter(v => /\b(u|uw)\b/i.test(v)), [], 'le néerlandais vouvoie');
  // Les repères — `{robot}`, `{carte}`, `{n}` — traversent chaque langue.
  for (const l of LANGUES) {
    const chemin = CAT[l][CLES[1]];
    assert.ok(typeof chemin === 'string' && chemin.includes('{robot}') && chemin.includes('›'), l + ' : le chemin exact garde le nom du robot et ses flèches');
    const une = CAT[l][CLES[5]];
    assert.ok(typeof une === 'string' && une.includes('{n}') && une.includes('{carte}'), l + ' : le singulier garde ses repères');
  }
});

test('chaque clé de la tranche a un lecteur : l’écran, ou le journal du serveur', () => {
  const ecran = ['robotsfiche.js', 'refusrobots.js', 'ficherobot.jsx'].map(f => readFileSync(join(RACINE, 'src', f), 'utf8')).join('\n');
  const serveur = readFileSync(join(RACINE, 'custom_components', 'loggia', 'robots.py'), 'utf8');
  const sans = TOUTES.filter(k => !ecran.includes("'" + k.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'") && !serveur.includes('"' + k + '"'));
  assert.deepEqual(sans, [], 'des clés dormantes');
  // Le détail du passage retenu derrière ses scripts est la phrase même de la popup : une seule clé, déjà traduite.
  assert.ok(serveur.includes('"Vos scripts gardent la main pour les pièces."'), 'le planning retenu dit la phrase de la popup');
});
