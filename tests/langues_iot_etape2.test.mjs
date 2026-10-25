/* TEST AJOUTÉ (étape 2 IoT, tâche 7, 19/10 ; § 11 de la conception) — les textes de l'étape 2, le distributeur, dans les sept langues.
 *  - Chaque bloc de l'étape (« … (chantier IoT, étape 2, tâche N, 19/10) ») existe dans les six catalogues, avec les MÊMES clés, dans
 *    le même ordre — un texte traduit en anglais et oublié en néerlandais se verrait ici avant l'écran.
 *  - En polonais, chaque bloc porte « Textes nouveaux, à relire par Seba882. » : sa traduction ne se réécrit pas
 *    (tests/polonais_seba882.test.mjs), le nouveau se signale. Trente-deux textes à relire.
 *  - Un gabarit de pluriel de l'étape (le second de `trN`) a ses formes polonaises : `few`, `many`, `other`.
 *  - « Vous » partout, le principe de sa maquette : aucun texte de l'étape ne tutoie ; l'allemand et l'espagnol sont à la forme de
 *    politesse.
 *  - Les dix-huit clés que l'étape a fait partir (tâches 3, 4 et 5) n'existent plus dans aucun catalogue. */
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

/* Les blocs de l'étape d'un catalogue : `{ titre, marque, cles }`, lus dans le texte — un bloc va de sa ligne de titre à la ligne vide
 * (ou à la fin de l'objet) qui le suit. */
function blocs(texte) {
  const lignes = texte.split('\n');
  const out = [];
  lignes.forEach((l, i) => {
    // ASSERTION MODIFIÉE (passe bis de l'étape 2, 19/10) : le bloc de la passe bis est un bloc de l'étape.
    if (!/^ {2}\/\/ .*\(chantier IoT, étape 2, (tâche \d+|passe bis), 19\/10\)$/.test(l)) return;
    const b = { titre: l.trim(), marque: lignes[i + 1] === MARQUE, cles: [] };
    for (let j = i + 1; j < lignes.length && lignes[j].trim() !== '' && lignes[j] !== '};'; j++) {
      const m = /^ {2}'((?:[^'\\]|\\.)*)':/.exec(lignes[j]);
      if (m) b.cles.push(m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\'));
    }
    out.push(b);
  });
  return out;
}

test('chaque bloc de l’étape est dans les six catalogues, avec les mêmes clés', () => {
  const reference = blocs(TEXTE.en);
  assert.deepEqual(reference.map(b => b.titre.replace(/^\/\/ /, '')), [
    'La phrase du distributeur (chantier IoT, étape 2, tâche 1, 19/10)',
    'La carte du distributeur (chantier IoT, étape 2, tâche 3, 19/10)',
    "La popup du distributeur : le socle et l'Accueil (chantier IoT, étape 2, tâche 4, 19/10)",
    'La popup du distributeur : Repas et Historique (chantier IoT, étape 2, tâche 5, 19/10)',
    // ASSERTION MODIFIÉE (passe bis de l'étape 2, 19/10 ; point D) : « Repas · un repas », le titre d'UN repas de source inconnue.
    "Passe bis de l'étape 2 : un repas de source inconnue, au singulier (chantier IoT, étape 2, passe bis, 19/10)",
  ]);
  for (const l of LANGUES) {
    assert.deepEqual(blocs(TEXTE[l]).map(b => [b.titre, b.cles]), reference.map(b => [b.titre, b.cles]), l + ' : un bloc ou une clé diffère');
    for (const b of reference) for (const k of b.cles) assert.ok(CAT[l][k] != null && CAT[l][k] !== '', l + ' : « ' + k + ' » sans traduction');
  }
});

test('le polonais nouveau se signale à Seba882 : trente-deux textes à relire', () => {
  const pl = blocs(TEXTE.pl);
  assert.ok(pl.every(b => b.marque), 'un bloc polonais sans la marque de relecture : ' + pl.filter(b => !b.marque).map(b => b.titre).join(' | '));
  /* ASSERTION MODIFIÉE (passe bis de l'étape 2, 19/10 ; points D et G) : « ≈ {n} jour de réserve », au singulier inatteignable, part du
   * bloc de la tâche 4 (17) ; « Repas · un repas » arrive dans le bloc de la passe bis (1) — trente-deux textes à relire, toujours. */
  assert.deepEqual(pl.map(b => b.cles.length), [9, 2, 17, 3, 1]);
  assert.equal(pl.reduce((n, b) => n + b.cles.length, 0), 32);
});

test('un gabarit de pluriel de l’étape a ses formes polonaises', () => {
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
  // Les deux de l'étape ; sans eux, une lecture cassée rendrait le test toujours vert.
  assert.deepEqual([...pluriels].sort(), ['{n} repas · {g} g', '≈ {n} jours de réserve'].sort());
  for (const k of pluriels) {
    const v = CAT.pl[k];
    assert.ok(v && typeof v === 'object' && ['few', 'many', 'other'].every(f => typeof v[f] === 'string' && v[f]), '« ' + k + ' » : il faut few, many et other en polonais');
  }
});

/* ASSERTION MODIFIÉE (passe bis de l'étape 2, 19/10) : son choix du 19/10, le tutoiement comme HA — le français reste au « vous » (le
 * principe de sa maquette), l'allemand et l'espagnol TUTOIENT, comme l'interface de Home Assistant et le reste de Loggia. */
test('« vous » partout : aucun texte de l’étape ne tutoie, l’allemand et l’espagnol au tutoiement, comme HA', () => {
  const etape = [...new Set(blocs(TEXTE.en).flatMap(b => b.cles))];
  assert.equal(etape.length, 32, 'la lecture des blocs a échoué');
  assert.deepEqual(etape.filter(t => /^(Clique|Touche|Appuie|Sélectionne|Choisis|Glisse|Ajoute|Ouvre|Tape|Fais|Va|Remets|Sers)\b/.test(t) || /\b(tu|ton|ta|tes|toi|te)\b/i.test(t)), [], 'le français tutoie');
  assert.ok(etape.includes('Ce sont vos automatisations qui servent'), 'témoin : le « vous » de sa maquette');
  const de = etape.map(k => CAT.de[k]).filter(v => typeof v === 'string');
  const es = etape.map(k => CAT.es[k]).filter(v => typeof v === 'string');
  assert.deepEqual(de.filter(v => /\b(Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihnen)\b/.test(v) || /\b(Tippen|Wählen|Drücken|Schalten|Berühren|Öffnen|Füllen|Folgen|Achten|Stellen|Aktivieren|Ändern) Sie\b/.test(v)), [], 'l’allemand vouvoie');
  assert.deepEqual(es.filter(v => /\b(usted|ustedes)\b/i.test(v) || /\b(toque|elija|pulse|abra|cambie|rellene|indique|compruebe|siga)\b|modifíquelo|páselo|desactível[ao]s/.test(v)), [], 'l’espagnol vouvoie');
  assert.ok(CAT.de['Ce sont vos automatisations qui servent'].startsWith('Deine ') && CAT.es['Ce sont vos automatisations qui servent'].includes(' tus '), 'le tutoiement');
});

/* TEST AJOUTÉ (étape 2 IoT, tâche 8, 19/10) : la vérification dans `?demo` a montré, sur le même onglet, « Ihre Automatisierungen
 * übernehmen das Füttern » au-dessus de « DEINE AUTOMATISIERUNGEN » — les textes de la popup qui existaient avant l'étape tutoyaient
 * encore en allemand et en espagnol. Tous ceux que la carte et la popup du distributeur écrivent, et les refus de son planning, passent
 * à la forme de politesse, comme ceux du robot (passe bis 2 du 18/10, point K) ; le néerlandais, l'italien et le polonais gardent la
 * leur.
 * ASSERTION MODIFIÉE (passe bis de l'étape 2, 19/10) : son choix du 19/10, le tutoiement comme HA — c'est l'inverse qui tient : TOUS
 * ces textes tutoient, les anciens ayant repris leur valeur d'avant l'étape (celle de la base), les nouveaux étant réécrits ; un même
 * onglet ne mêle plus deux formes. */
test('tâche 8 : tous les textes du distributeur, en allemand et en espagnol, au tutoiement, comme HA', () => {
  const FICHIERS = ['fichedistributeur.jsx', 'distributeur.js', 'distributeurfiche.js', 'distributeuretat.js'];
  const cles = new Set(['Planning non enregistré — {n} repas au plus', 'Repas non ajouté — Loggia ne sait pas commander ce distributeur',
    'Repas non ajouté — l’appareil ou vos automatisations programment déjà les repas']);
  for (const f of FICHIERS) {
    for (const m of readFileSync(join(RACINE, 'src', f), 'utf8').matchAll(/\btr(?:N|Sens)?\(\s*(?:[^,()]+,\s*)?'((?:[^'\\]|\\.)*)'(?:,\s*'((?:[^'\\]|\\.)*)')?/g)) {
      cles.add(m[1].replace(/\\'/g, "'"));
      if (m[2]) cles.add(m[2].replace(/\\'/g, "'"));
    }
  }
  assert.ok(cles.size > 100, 'la lecture des textes a échoué : ' + cles.size);
  const val = (v) => (v && typeof v === 'object' ? Object.values(v).join(' / ') : v);
  const de = [...cles].map(k => [k, val(CAT.de[k])]).filter(([, v]) => typeof v === 'string'
    && (/\b(Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihnen)\b/.test(v) || /\b(Tippen|Wählen|Drücken|Schalten|Berühren|Öffnen|Legen|Geben|Fügen|Prüfen|Aktivieren|Ändern|Achten|Stellen|Passen) Sie\b|\bschalten Sie\b/.test(v)));
  const es = [...cles].map(k => [k, val(CAT.es[k])]).filter(([, v]) => typeof v === 'string'
    && (/\b(usted|ustedes)\b/i.test(v) || /\b(toque|elija|pulse|abra|cambie|compruebe|indique|rellene|active|desactive)\b|modifíquelo|páselo|desactível[ao]s/.test(v)));
  assert.deepEqual(de, [], 'l’allemand vouvoie');
  assert.deepEqual(es, [], 'l’espagnol vouvoie');
  assert.deepEqual([CAT.de['Vos automatisations'], CAT.es['Vos automatisations']], ['Deine Automatisierungen', 'Tus automatizaciones']);
  // Les textes anciens ont repris leur valeur : un seul changement d'étape ne se voit plus dans ces deux catalogues.
  assert.ok(CAT.de['Deux sources distribuent : vérifiez qu’un repas ne part pas deux fois.'].includes('Achte darauf') && CAT.es['Deux sources distribuent : vérifiez qu’un repas ne part pas deux fois.'].includes('comprueba'));
});

test('les clés que l’étape a fait partir n’existent plus dans aucun catalogue', () => {
  const parties = [
    // Tâche 3 : la carte d'avant.
    'Réservoir aux trois quarts', 'Réservoir {p} %', 'dernier repas {h}', 'prochaine ration {h}',
    // Tâche 4 : l'Accueil d'avant — « Réservoir rempli » dans Entretien, les portions sur le bouton, la phrase du jour.
    'Environ {n} jours de réserve', 'Réservoir rempli', 'Remet le niveau du bac à 100 %.', 'Distribuer {n} portion', 'Distribuer {n} portions',
    'Aujourd’hui : {n} repas · {g} g', 'Aujourd’hui : {n} repas', 'Aujourd’hui : {g} g', 'Taille de la portion',
    // Tâche 5 : le Planning et l'Historique d'avant.
    'Mode de distribution', 'Les automatisations de Home Assistant qui commandent ce distributeur.', 'Programmé · source d’un repas',
    'Manuel · source d’un repas', 'Aucun repas ces derniers jours.',
  ];
  assert.equal(parties.length, 18);
  for (const l of LANGUES) {
    const restent = parties.filter(k => Object.prototype.hasOwnProperty.call(CAT[l], k));
    assert.deepEqual(restent, [], l + ' : une clé partie est restée');
  }
});
