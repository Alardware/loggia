/* TEST AJOUTÉ (chantier IoT, tâche 11, 18/10 ; § 11 de la conception) — les textes de l'étape 1 dans les sept langues.
 *  - Chaque bloc du chantier (« … (chantier IoT, tâche N, 18/10) ») existe dans les six catalogues, avec les MÊMES clés, dans le
 *    même ordre — un texte traduit en anglais et oublié en néerlandais se verrait ici avant l'écran.
 *  - En polonais, chaque bloc porte « Textes nouveaux, à relire par Seba882. » : sa traduction ne se réécrit pas
 *    (tests/polonais_seba882.test.mjs), le nouveau se signale. Soixante et un textes à relire.
 *  - Un gabarit de pluriel (le second de `trN`) a ses formes polonaises : `few`, `many`, `other`.
 *  - Les vingt-deux clés que l'étape a fait partir (tâches 8 et 9) n'existent plus dans aucun catalogue. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const LANGUES = ['en', 'de', 'nl', 'it', 'es', 'pl'];
const TEXTE = Object.fromEntries(LANGUES.map(l => [l, readFileSync(join(RACINE, 'src', 'langues', l + '.js'), 'utf8')]));
const CAT = Object.fromEntries(await Promise.all(LANGUES.map(async l => [l, (await import(pathToFileURL(join(RACINE, 'src', 'langues', l + '.js')).href)).default])));
const MARQUE = '  //   Textes nouveaux, à relire par Seba882.';

/* Les blocs du chantier d'un catalogue : `{ titre, marque, cles }`, lus dans le texte — un bloc va de sa ligne de titre à la ligne
 * vide (ou à la fin de l'objet) qui le suit. */
function blocs(texte) {
  const lignes = texte.split('\n');
  const out = [];
  lignes.forEach((l, i) => {
    // ASSERTION MODIFIÉE (passe bis du 18/10) : le bloc de la passe bis (« … (chantier IoT, passe bis, 18/10) ») se lit comme les autres.
    // ASSERTION MODIFIÉE (passe bis 2 du 18/10) : et celui de la passe bis 2.
    if (!/^ {2}\/\/ .*\(chantier IoT, (tâche \d+|passe bis( 2)?), 18\/10\)$/.test(l)) return;
    const b = { titre: l.trim(), marque: lignes[i + 1] === MARQUE, cles: [] };
    for (let j = i + 1; j < lignes.length && lignes[j].trim() !== '' && lignes[j] !== '};'; j++) {
      const m = /^ {2}'((?:[^'\\]|\\.)*)':/.exec(lignes[j]);
      if (m) b.cles.push(m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\'));
    }
    out.push(b);
  });
  return out;
}

test('chaque bloc du chantier est dans les six catalogues, avec les mêmes clés', () => {
  const reference = blocs(TEXTE.en);
  assert.deepEqual(reference.map(b => b.titre.replace(/^\/\/ /, '')), [
    "La phrase d'un robot (chantier IoT, tâche 2, 18/10)",
    "Les refus d'un départ de robot (chantier IoT, tâche 4, 18/10)",
    "La carte d'un robot (chantier IoT, tâche 6, 18/10)",
    "L'en-tête d'Objets › IoT (chantier IoT, tâche 7, 18/10)",
    "La fiche d'un robot (chantier IoT, tâche 8, 18/10)",
    "Le Planning, l'Historique et l'Entretien d'un robot (chantier IoT, tâche 9, 18/10)",
    // ASSERTION MODIFIÉE (passe bis du 18/10, points A et 14) : un script maison refusé, son nom au journal, la carte au vouvoiement.
    'Un script maison refusé (point A), son nom au journal, la carte du logement au vouvoiement (point 14) (chantier IoT, passe bis, 18/10)',
    // ASSERTION MODIFIÉE (passe bis 2 du 18/10, points D, E et I) : la tondeuse sans zone allumée, la réponse qui tarde, le passage retenu.
    'La tondeuse sans zone allumée (point D), la réponse qui tarde (point E), le passage retenu (point I) (chantier IoT, passe bis 2, 18/10)',
  ]);
  for (const l of LANGUES) {
    assert.deepEqual(blocs(TEXTE[l]).map(b => [b.titre, b.cles]), reference.map(b => [b.titre, b.cles]), l + ' : un bloc ou une clé diffère');
    for (const b of reference) for (const k of b.cles) assert.ok(CAT[l][k] != null && CAT[l][k] !== '', l + ' : « ' + k + ' » sans traduction');
  }
});

test('le polonais nouveau se signale à Seba882 : soixante-sept textes à relire', () => {
  const pl = blocs(TEXTE.pl);
  assert.ok(pl.every(b => b.marque), 'un bloc polonais sans la marque de relecture : ' + pl.filter(b => !b.marque).map(b => b.titre).join(' | '));
  /* ASSERTION MODIFIÉE (passe bis du 18/10, points 15, A et 14) : deux textes de l'Entretien partent (« Tout est en ordre. » et sa
   * suite : plus de phrase permanente), trois arrivent (le refus d'un script, son nom au journal, « Touchez une zone « ? » … »).
   * ASSERTION MODIFIÉE (passe bis 2 du 18/10, points D, E et I) : six arrivent — la phrase et le refus d'une tondeuse sans zone allumée,
   * le refus d'une bascule sans réponse, la ligne d'un passage retenu, et les deux causes que le serveur écrit au journal.
   * ASSERTION MODIFIEE (26/10, petit paquet) : « Départ non lancé — le robot ne répond pas » quitte le bloc des refus (tâche 4) — le
   * robot muet se refuse aussi pour un geste, la phrase neutre va en fin de catalogue ; l'ancienne quitte aussi pl.js (une clé
   * orpheline, comme à l'étape de l'eau). Soixante-huit devient soixante-sept (titre compris). */
  assert.deepEqual(pl.map(b => b.cles.length), [11, 4, 1, 1, 25, 16, 3, 6]);
  assert.equal(pl.reduce((n, b) => n + b.cles.length, 0), 67);
});

test('un gabarit de pluriel du chantier a ses formes polonaises', () => {
  const nouvelles = new Set(blocs(TEXTE.pl).flatMap(b => b.cles));
  const fichiers = [];
  (function parcourir(d) {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) { if (f !== 'langues') parcourir(p); } else if (/\.jsx?$/.test(f)) fichiers.push(p);
    }
  })(join(RACINE, 'src'));
  const pluriels = new Set();
  for (const f of fichiers) {
    for (const m of readFileSync(f, 'utf8').matchAll(/\btrN\([^,()]+,\s*'((?:[^'\\]|\\.)*)',\s*'((?:[^'\\]|\\.)*)'/g)) if (nouvelles.has(m[2])) pluriels.add(m[2]);
  }
  // Les cinq de l'étape ; sans eux, une lecture cassée rendrait le test toujours vert.
  assert.deepEqual([...pluriels].sort(), ['Nettoyer {n} pièces', 'Tondre {n} zones', '{n} en marche', '{n} passages', '{n} pièces à changer bientôt.'].sort());
  for (const k of pluriels) {
    const v = CAT.pl[k];
    assert.ok(v && typeof v === 'object' && ['few', 'many', 'other'].every(f => typeof v[f] === 'string' && v[f]), '« ' + k + ' » : il faut few, many et other en polonais');
  }
});

/* TEST AJOUTÉ (passe bis du 18/10, point 14) : « vous » partout, le principe de sa maquette (« plus de « Sélectionne » ni
 * d'« Appuie » ») — la carte du logement disait « Clique une zone « ? » pour la nommer ». Aucun texte des fichiers de l'étape ne
 * tutoie. */
test('point 14 : aucun texte de l’étape ne tutoie — « Touchez une zone « ? » pour la nommer »', () => {
  const FICHIERS = ['ficherobot.jsx', 'robotsfiche.js', 'robots.js', 'robotsetat.js', 'refusrobots.js', 'enteteiot.jsx', 'vacplan.jsx'];
  const textes = FICHIERS.flatMap(f => [...readFileSync(join(RACINE, 'src', f), 'utf8').matchAll(/\btrN?\(\s*(?:[^,()]+,\s*)?'((?:[^'\\]|\\.)*)'/g)].map(m => [f, m[1]]));
  assert.ok(textes.length > 100, 'la lecture des textes a échoué');
  const tutoie = textes.filter(([, t]) => /^(Clique|Touche|Appuie|Sélectionne|Choisis|Glisse|Ajoute|Ouvre|Tape|Fais|Va)\b/.test(t) || /\b(tu|ton|ta|tes|toi|te)\b/i.test(t));
  assert.deepEqual(tutoie, [], 'tutoiement');
  assert.ok(textes.some(([f, t]) => f === 'vacplan.jsx' && t === 'Touchez une zone « ? » pour la nommer'));
  /* TEST AJOUTÉ (passe bis 2 du 18/10, point K) : l'allemand et l'espagnol, à la forme de politesse eux aussi, dans TOUS les textes de
   * l'étape — l'Entretien disait « Tippe… » et « Toca… », le Planning « schalte sie ab » et « desactívalas ».
   * ASSERTION MODIFIÉE (passe bis de l'étape 2, 19/10) : son choix du 19/10, le tutoiement comme HA — l'allemand et l'espagnol tutoient
   * dans TOUS les textes de l'étape, comme l'interface de Home Assistant et le reste de Loggia (le français reste au « vous »). */
  const etape = new Set(blocs(TEXTE.en).flatMap(b => b.cles));
  const de = [...etape].map(k => CAT.de[k]).filter(v => typeof v === 'string');
  const es = [...etape].map(k => CAT.es[k]).filter(v => typeof v === 'string');
  assert.ok(de.length > 60 && es.length > 60, 'la lecture des blocs a échoué');
  assert.deepEqual(de.filter(v => /\b(Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihnen)\b/.test(v) || /\b(Tippen|Wählen|Drücken|Schalten|Berühren|Öffnen|Folgen|Starten|Achten|Stellen|Aktivieren|Ändern) Sie\b|\bschalten Sie\b/.test(v)), [], 'l’allemand vouvoie');
  assert.deepEqual(es.filter(v => /\b(usted|ustedes)\b/i.test(v) || /\b(toque|elija|pulse|abra|cambie|siga|inicie|rellene|indique|compruebe)\b|modifíquelo|páselo|desactível[ao]s/.test(v)), [], 'l’espagnol vouvoie');
  assert.ok(CAT.de['Touchez « Remplacé » après l’intervention : son compteur repart à 100 %.'].startsWith('Tippe '));
  assert.ok(CAT.es['Si l’application du fabricant programme aussi des passages, coupez-les : sinon il part deux fois.'].includes('desactívalas'));
});

test('les clés que l’étape a fait partir n’existent plus dans aucun catalogue', () => {
  const parties = [
    // Tâche 8 : la fiche d'avant.
    'À la base · en charge', 'Démarrer · {n} zones', 'Démarrer · 1 zone', '{n} sélectionnées', '{n} sélectionnée', 'Voir les zones', 'Dernier passage',
    '{n} sessions', '{n} session', 'Entretien recommandé', 'Sélectionne une zone', 'Fiche de l’appareil',
    // Tâche 9 : le planning, l'historique et l'entretien d'avant.
    'Sessions', 'Aucune session ces 14 derniers jours.', '{n} éléments à remplacer bientôt.', '1 élément à remplacer bientôt.', 'Rien à remplacer pour le moment.',
    'Appuie sur le bouton après l’intervention pour remettre le compteur à neuf.', 'Compteurs', 'Dans la plage « Ne pas déranger » : ce passage ne partira pas.',
    'Aucun départ planifié entre {a} et {b}', 'Une plage où Loggia ne lance jamais le robot',
    // ASSERTION MODIFIÉE (passe bis du 18/10, points 15 et 14) : plus de « Tout va bien » permanent dans l'Entretien ; plus de tutoiement.
    'Tout est en ordre.', 'Touchez « Remplacé » après une intervention : le compteur repart à 100 %.', 'Clique une zone « ? » pour la nommer',
  ];
  assert.equal(parties.length, 25);
  for (const l of LANGUES) assert.deepEqual(parties.filter(k => k in CAT[l]), [], l);
});
