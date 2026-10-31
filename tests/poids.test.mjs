// ─────────────────────────────────────────────────────────────────────────────
// Ce qu'on télécharge avant de pouvoir lire l'écran.
//
// Le fond météo 3D est chargé « à la demande » : `lazy(() => import('./wx3d'))`.
// Mais il était monté dès le premier rendu du tableau de bord, ce qui
// déclenchait aussitôt son import — 448 ko de Three.js, 113 ko compressés, en
// concurrence avec le contenu qu'on est venu lire. La paresse ne servait à
// rien : elle décalait le téléchargement de quelques millisecondes, pas d'une
// peinture.
//
// Mesuré dans la démo, après correction : première peinture à 23 548 ms (la
// page était masquée jusque-là), `wx3d` demandé à 24 156, `three` à 24 169 —
// six cents millisecondes APRÈS le contenu, et le décor s'affiche quand même.
//
// L'autre défaut de cette famille échappe à `no-unused-vars` : un fichier
// ENTIER que personne n'importe. La règle raisonne à l'intérieur d'un module,
// jamais entre eux. `src/ciel3d.jsx` — un ciel étoilé de 284 lignes, avec sa
// propre copie de Three.js — était là depuis le premier commit sans qu'aucune
// ligne ne l'appelle. Il ne pesait rien dans le bundle, puisque le bundler ne
// l'atteignait pas non plus ; il pesait sur qui lit le dossier.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MONOLITHE, VUES_SORTIES } from './monolithe.mjs'; // App.jsx + les vues sorties du boot (ADR 0274)

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(RACINE, 'src');
const ANTISLASH = String.fromCharCode(92);

/** Tous les modules du dossier `src`. */
function modules(dossier = SRC) {
  const out = [];
  for (const f of readdirSync(dossier)) {
    const p = join(dossier, f);
    if (statSync(p).isDirectory()) { out.push(...modules(p)); continue; }
    if (/\.(js|jsx)$/.test(f)) out.push(p);
  }
  return out;
}

/** Résout une cible relative vers un fichier existant, ou null. */
function resoudre(base, cible) {
  const brut = resolve(base, cible);
  for (const suff of ['', '.js', '.jsx', '/index.js', '/index.jsx']) {
    try { if (statSync(brut + suff).isFile()) return brut + suff; } catch (e) { /* essai suivant */ }
  }
  return null;
}

/* Deux motifs, jamais un seul.
 *
 * Une première version les mêlait : `import` puis un « ... from » facultatif.
 * Sur `import('./wx3d.jsx')` il n'y a pas de `from`, alors le moteur étendait
 * la partie facultative jusqu'au `from` suivant — trois cents lignes plus bas —
 * et capturait la chaîne de CET import-là. Les imports à la demande
 * disparaissaient tous, et les fichiers qu'ils seuls atteignent passaient pour
 * orphelins. Le `[^;]*?` du motif statique borne la recherche à l'instruction. */
const STATIQUE = /import\s[^;]*?\sfrom\s*['"](\.[^'"]+)['"]/g;
const NU = /import\s*['"](\.[^'"]+)['"]/g;
const DYNAMIQUE = /import\s*\(\s*['"](\.[^'"]+)['"]/g;

/** Les cibles importées par un fichier. `dynamiques` inclut `import('./x')`. */
function importsDe(chemin, dynamiques) {
  const src = readFileSync(chemin, 'utf8');
  const base = dirname(chemin);
  const motifs = dynamiques ? [STATIQUE, NU, DYNAMIQUE] : [STATIQUE, NU];
  const cibles = motifs.flatMap(m => [...src.matchAll(m)].map(x => x[1]));
  return [...new Set(cibles)].map(c => resoudre(base, c)).filter(Boolean);
}

/** Tout ce qu'on atteint depuis `depart`. */
function atteignables(dynamiques, depart = join(SRC, 'main.jsx')) {
  const vus = new Set();
  const file = [depart];
  while (file.length) {
    const p = file.pop();
    if (vus.has(p)) continue;
    vus.add(p);
    file.push(...importsDe(p, dynamiques));
  }
  return vus;
}

const court = (p) => relative(RACINE, p).split(ANTISLASH).join('/');

/* Le troisieme defaut de cette famille — l'import que plus personne ne lit —
 * est verifie dans `tests/dependances.test.mjs` (24/09, plan S8). Il lancait
 * ici une TROISIEME passe ESLint sur tout `src/` ; la-bas il partage celle qui
 * existait deja. Il y est d'ailleurs chez lui : ce fichier tient l'inventaire
 * de ce qu'ESLint voit et qui ne doit pas bouger. */

test('aucun module de src n’est injoignable depuis l’entrée', () => {
  // `no-unused-vars` raisonne DANS un module ; il ne voit jamais qu'un fichier
  // entier n'est appelé par personne. C'est le seul filet contre cette famille.
  const vus = atteignables(true);
  const orphelins = modules().filter(p => !vus.has(p)).map(court).sort();
  assert.deepEqual(orphelins, [],
    'ces fichiers ne sont atteints par aucun import : soit on les branche, soit on les retire');
});

test('Three.js n’est jamais atteint sans passer par un import à la demande', () => {
  /* On part de `boot.jsx`, pas de `main.jsx`.
   *
   * `main.jsx` n'importe RIEN statiquement, et c'est voulu : la démo doit
   * s'installer avant que l'application ne s'évalue, donc tout y passe par
   * `await import(...)`. Une première version de ce test partait de là — le
   * graphe direct était vide, et il passait sans rien vérifier. Il a fallu le
   * casser exprès, en rendant `wx3d` statique, pour s'apercevoir qu'il restait
   * muet.
   *
   * `boot.jsx` est le morceau qui part en premier chez l'utilisateur : 702 ko.
   * C'est lui qui ne doit pas tirer Three.js avec lui. */
  const eager = atteignables(false, join(SRC, 'boot.jsx'));
  const lourds = [...eager].filter(p => /from ['"]three['"]/.test(readFileSync(p, 'utf8'))).map(court);
  assert.deepEqual(lourds, [],
    'Three.js entre dans le premier chargement : 448 ko qui retardent l’écran qu’on vient lire');
});

test('les Scènes Hue ne sont jamais atteintes sans passer par un import à la demande', () => {
  /* Le 11/10 (tâche 6 bis du chantier Chauffage), la bibliothèque des
   * ambiances et sa section sont sorties du boot : 16 287 octets, la place des
   * cartes du chauffage. Un seul import STATIQUE de `scenes.jsx`, d'où que ce
   * soit dans le boot, les y ramènerait en silence — le budget de
   * `lot14_chargement` ne le verrait qu'une fois la marge mangée. */
  const scenes = join(SRC, 'scenes.jsx');
  assert.ok(!atteignables(false, join(SRC, 'boot.jsx')).has(scenes),
    'scenes.jsx est importé statiquement : la bibliothèque Hue revient dans le boot');
  assert.ok(atteignables(true, join(SRC, 'boot.jsx')).has(scenes),
    'plus aucun import n’atteint scenes.jsx : les ambiances Hue ont disparu de l’écran');
});

test('la fiche et le calcul du chauffage ne sont atteints qu’à la demande', () => {
  /* Tâche 10 bis A du chantier Chauffage : la carte « 1a » n'a plus la barre
   * du jour — elle vit dans la fiche, chargée à la demande, comme la semaine
   * et le calcul (choix 4). Un import STATIQUE de l'un d'eux, d'où que ce soit
   * dans le boot, les y ramènerait en silence.
   * ASSERTION MODIFIÉE (tâche 10 bis D) : `barreplanning.jsx` sort de la
   * liste — l'Historique de sa maquette (cadre 3d) dessine sa propre bande
   * de 6 px, et la barre de la carte n'avait plus d'autre usager : partie
   * (« soit on les branche, soit on les retire », plus haut). */
  const boot = atteignables(false, join(SRC, 'boot.jsx'));
  const tout = atteignables(true, join(SRC, 'boot.jsx'));
  assert.ok(!existsSync(join(SRC, 'barreplanning.jsx')), 'la barre de la carte est revenue : qui la lit ?');
  for (const f of ['chauffageplanning.js', 'chauffage.js', 'fichechauffage.jsx']) {
    assert.ok(!boot.has(join(SRC, f)), f + ' est importé statiquement : il entre dans le boot');
    assert.ok(tout.has(join(SRC, f)), f + ' : plus aucun import ne l’atteint');
  }
});

test('la barre « Maison » du planning de chauffe n’est atteinte qu’à la demande', () => {
  /* Tâche 11 du chantier Chauffage : Objets › Chauffage la charge à la
   * première ouverture du filtre (`lazyRecharge`, App.jsx) — ni l'Accueil ni
   * une carte ne l'affichent, et le boot n'a plus de place
   * (lot14_chargement). Un import STATIQUE, d'où que ce soit dans le boot,
   * l'y ramènerait en silence. */
  const barre = join(SRC, 'barremaison.jsx');
  assert.ok(existsSync(barre), 'la barre « Maison » a disparu');
  assert.ok(!atteignables(false, join(SRC, 'boot.jsx')).has(barre), 'barremaison.jsx est importé statiquement : la barre entre dans le boot');
  assert.ok(atteignables(true, join(SRC, 'boot.jsx')).has(barre), 'plus aucun import n’atteint barremaison.jsx : la barre a disparu de l’écran');
  /* AJOUTÉ (relecture des tâches 11 et 12) : les refus de la configuration et
   * de la maison (refuschauffage.js), que seules la fiche et la barre
   * reçoivent, sont sortis du boot — 918 octets. */
  const refus = join(SRC, 'refuschauffage.js');
  assert.ok(!atteignables(false, join(SRC, 'boot.jsx')).has(refus), 'refuschauffage.js est importé statiquement : ses refus reviennent dans le boot');
  assert.ok(atteignables(true, join(SRC, 'boot.jsx')).has(refus), 'plus aucun import n’atteint refuschauffage.js');
});

/* TEST AJOUTÉ (chantier IoT, tâche 7, 18/10 ; I14) : l'en-tête d'Objets › IoT
 * se charge à la première ouverture du filtre, comme ceux des médias et des
 * lumières ; un import statique l'amènerait au démarrage. */
test('l’en-tête d’Objets › IoT n’est atteint qu’à la demande', () => {
  const entete = join(SRC, 'enteteiot.jsx');
  assert.ok(!atteignables(false, join(SRC, 'boot.jsx')).has(entete), 'enteteiot.jsx est importé statiquement : il entre dans le boot');
  assert.ok(atteignables(true, join(SRC, 'boot.jsx')).has(entete), 'plus aucun import n’atteint enteteiot.jsx');
});

/* TEST AJOUTÉ (chantier IoT, tâche 4, 18/10 ; I3 A) : les refus d'un départ
 * de robot (refusrobots.js) n'arrivent qu'après un geste de départ ; ils se
 * chargent avec la fiche d'un robot, jamais au démarrage. */
test('les refus d’un départ de robot ne sont atteints qu’à la demande', () => {
  const refus = join(SRC, 'refusrobots.js');
  assert.ok(!atteignables(false, join(SRC, 'boot.jsx')).has(refus), 'refusrobots.js est importé statiquement : ses refus entrent dans le boot');
  assert.ok(atteignables(true, join(SRC, 'boot.jsx')).has(refus), 'plus aucun import n’atteint refusrobots.js');
});

test('la feuille de l’agenda n’est atteinte qu’à la demande', () => {
  /* Plan 2 du chantier Prises, tâche 2 (la borne du démarrage) : la feuille
   * — Mois, Semaine, Jour, le mini-mois, la fiche d'un événement — quitte
   * agendarail.jsx pour feuilleagenda.jsx, chargée quand la carte l'ouvre :
   * 20 735 octets rendus au boot, la place des cartes des prises. Un import
   * STATIQUE, d'où que ce soit dans le boot, l'y ramènerait en silence. */
  const feuille = join(SRC, 'feuilleagenda.jsx');
  assert.ok(existsSync(feuille), 'la feuille de l’agenda a disparu');
  assert.ok(!atteignables(false, join(SRC, 'boot.jsx')).has(feuille), 'feuilleagenda.jsx est importé statiquement : la feuille revient dans le boot');
  assert.ok(atteignables(true, join(SRC, 'boot.jsx')).has(feuille), 'plus aucun import n’atteint feuilleagenda.jsx : la feuille a disparu de l’écran');
});

test('la fiche d’une lumière n’est atteinte qu’à la demande', () => {
  /* Plan 2 du chantier Lumières, tâche 2 (la borne du démarrage) : la feuille
   * d'une lumière et ses palettes quittent App.jsx pour fichelumiere.jsx,
   * chargée quand une lampe s'ouvre — 2 733 octets de moins au boot, la place
   * des cartes des lumières. Un import STATIQUE l'y ramènerait en silence. */
  const fiche = join(SRC, 'fichelumiere.jsx');
  assert.ok(existsSync(fiche), 'la fiche d’une lumière a disparu');
  assert.ok(!atteignables(false, join(SRC, 'boot.jsx')).has(fiche), 'fichelumiere.jsx est importé statiquement : la fiche revient dans le boot');
  assert.ok(atteignables(true, join(SRC, 'boot.jsx')).has(fiche), 'plus aucun import n’atteint fichelumiere.jsx : la fiche a disparu de l’écran');
});

/* TEST AJOUTÉ (boot, 19/10 : audit des lumières, la borne du démarrage) : la
 * feuille du Calendrier — le mois entier, le choix des agendas — quitte App.jsx
 * pour feuillecalendrier.jsx, chargée quand la carte du rail l'ouvre :
 * 1 102 358 → 1 093 023 octets au boot, la place des corrections des lumières.
 * Un import STATIQUE, d'où que ce soit dans le boot, l'y ramènerait en silence. */
test('la feuille du Calendrier n’est atteinte qu’à la demande', () => {
  const feuille = join(SRC, 'feuillecalendrier.jsx');
  assert.ok(existsSync(feuille), 'la feuille du Calendrier a disparu');
  assert.ok(!atteignables(false, join(SRC, 'boot.jsx')).has(feuille), 'feuillecalendrier.jsx est importé statiquement : la feuille revient dans le boot');
  assert.ok(atteignables(true, join(SRC, 'boot.jsx')).has(feuille), 'plus aucun import n’atteint feuillecalendrier.jsx : la feuille a disparu de l’écran');
});

test('la feuille d’un lecteur n’est atteinte qu’à la demande', () => {
  /* Passe téléphone, tâche 1 (la borne du démarrage, T16) : la feuille d'un
   * lecteur et l'accent tiré de sa pochette quittent App.jsx pour fichemedia.jsx,
   * chargée quand un lecteur s'ouvre — 11 386 octets de moins au boot, la place
   * de la carte étroite. Un import STATIQUE l'y ramènerait en silence. */
  const feuille = join(SRC, 'fichemedia.jsx');
  assert.ok(existsSync(feuille), 'la feuille d’un lecteur a disparu');
  assert.ok(!atteignables(false, join(SRC, 'boot.jsx')).has(feuille), 'fichemedia.jsx est importé statiquement : la feuille revient dans le boot');
  assert.ok(atteignables(true, join(SRC, 'boot.jsx')).has(feuille), 'plus aucun import n’atteint fichemedia.jsx : la feuille a disparu de l’écran');
  /* ASSERTION AJOUTÉE (chantier Médias, tâche 1 ; § 10) : ce que seule la fiche emploie la suit — le navigateur de médias et les
   * favoris (navigateurmedias.jsx), les applications d'une TV (applis.js) et les marques de leurs logos (marques.js). Un import
   * STATIQUE de l'un d'eux, d'où que ce soit dans le boot, les y ramènerait en silence. La table des touches (telecommande.js) et
   * la phrase d'une Echo (favlecture.js) restent au démarrage : l'appariement des lecteurs (resolve.js) lit `cibleAlexa`. */
  for (const f of ['navigateurmedias.jsx', 'applis.js', 'marques.js']) {
    assert.ok(existsSync(join(SRC, f)), f + ' a disparu');
    assert.ok(!atteignables(false, join(SRC, 'boot.jsx')).has(join(SRC, f)), f + ' est importé statiquement : il revient dans le boot');
    assert.ok(atteignables(true, join(SRC, 'boot.jsx')).has(join(SRC, f)), 'plus aucun import n’atteint ' + f);
  }
});

test('les aides du mode enfant sur la carte d’un lecteur ne sont atteintes qu’à la demande', () => {
  /* Passe bis du chantier Mode enfant (17/10, point 14) : la pastille « Mode
   * enfant », le glyphe du haut de la carte étroite, le pied du temps d'écran et
   * la puce « Revient à » quittent App.jsx pour carteenfant.jsx, chargé quand un
   * lecteur est sous profil — le boot était à 3 143 octets de sa borne. Un import
   * STATIQUE, d'où que ce soit dans le boot, les y ramènerait en silence. */
  const carte = join(SRC, 'carteenfant.jsx');
  assert.ok(existsSync(carte), 'carteenfant.jsx a disparu');
  assert.ok(!atteignables(false, join(SRC, 'boot.jsx')).has(carte), 'carteenfant.jsx est importé statiquement : les aides du mode enfant reviennent dans le boot');
  assert.ok(atteignables(true, join(SRC, 'boot.jsx')).has(carte), 'plus aucun import n’atteint carteenfant.jsx : la pastille a disparu de la carte');
});

test('les fiches d’un capteur et la fiche de confort d’une pièce ne sont atteintes qu’à la demande', () => {
  /* Plan 1 du chantier Capteurs, tâche 1 (la borne du démarrage, C12) : la
   * fiche d'une mesure et celle d'un capteur binaire quittent App.jsx pour
   * fichecapteur.jsx, la fiche de confort d'une pièce pour ficheconfort.jsx —
   * chargées quand on les ouvre : la place de la carte d'une mesure. Un import
   * STATIQUE, d'où que ce soit dans le boot, les y ramènerait en silence. */
  // Et ce que calcule la fiche d'une mesure (tâche 6), qu'elle seule importe.
  // ASSERTION MODIFIÉE (chantier Capteurs, étapes 2 et 3, tâche 4) : et la journée d'un binaire, que lisent sa fiche et les popups des groupes.
  // ASSERTION MODIFIÉE (chantier Capteurs, étapes 2 et 3, tâche 5) : et les popups des groupes.
  // ASSERTION MODIFIÉE (chantier Capteurs, étapes 2 et 3, tâche 10 ; C34) : et la fiche d'une plante.
  for (const f of ['fichecapteur.jsx', 'mesuresfiche.js', 'ficheconfort.jsx', 'journee.jsx', 'fichegroupe.jsx', 'ficheplante.jsx']) {
    const fiche = join(SRC, f);
    assert.ok(existsSync(fiche), f + ' a disparu');
    assert.ok(!atteignables(false, join(SRC, 'boot.jsx')).has(fiche), f + ' est importé statiquement : la fiche revient dans le boot');
    assert.ok(atteignables(true, join(SRC, 'boot.jsx')).has(fiche), 'plus aucun import n’atteint ' + f + ' : la fiche a disparu de l’écran');
  }
});

test('la fiche d’un robot, celle du distributeur et ce qu’elles seules calculent ne sont atteintes qu’à la demande', () => {
  /* TEST AJOUTÉ (chantier IoT, tâche 1, 18/10 ; § 12 de la conception, la place d'abord) : le boot n'était plus qu'à 420 octets de
   * sa borne. `robots.js` ne garde que ce que le démarrage emploie — la phase, le retour à la base, les jours, les heures et le
   * prochain passage — et `distributeur.js` la lecture de la carte ; les sœurs, l'entretien, les sessions, les réglages et la fiche
   * technique d'un robot partent dans `robotsfiche.js`, l'historique reconstruit, son résumé, le planning affiché, les libellés et
   * les candidats de Paramètres d'un distributeur dans `distributeurfiche.js`. Un import STATIQUE de l'un d'eux, d'où que ce soit
   * dans le boot, les y ramènerait en silence. */
  const boot = atteignables(false, join(SRC, 'boot.jsx'));
  const tout = atteignables(true, join(SRC, 'boot.jsx'));
  for (const f of ['ficherobot.jsx', 'robotsfiche.js', 'vacplan.jsx', 'fichedistributeur.jsx', 'distributeurfiche.js']) {
    assert.ok(existsSync(join(SRC, f)), f + ' a disparu');
    assert.ok(!boot.has(join(SRC, f)), f + ' est importé statiquement : il entre dans le boot');
    assert.ok(tout.has(join(SRC, f)), 'plus aucun import n’atteint ' + f);
  }
  // Ce qui est parti ne revient pas en copie : le démarrage ne porte ni l'entretien ni les sessions d'un robot, ni l'historique d'un distributeur.
  const robots = readFileSync(join(SRC, 'robots.js'), 'utf8');
  for (const nom of ['decrireSoeurs', 'commandeZones', 'piecesUsure', 'sessionsRobot', 'reglagesRobot', 'ficheTechnique']) {
    assert.ok(!robots.includes('export function ' + nom + '('), nom + ' est revenu dans robots.js : il entre dans le boot');
  }
  const distributeur = readFileSync(join(SRC, 'distributeur.js'), 'utf8');
  /* ASSERTION MODIFIÉE (étape 2 IoT, 19/10 ; I10, § 6) : `mesurePortion` revient au démarrage, avec la réserve en jours — la CARTE
   * dit « Distribuer 12 g » et « ≈ 8 j » (tests/distributeur_carte.test.mjs). Le reste de la fiche ne revient pas. */
  // ASSERTION MODIFIÉE (étape 2 IoT, 19/10 ; I25) : le résumé de l'Historique devient `septJoursRepas` — il reste dans la fiche.
  /* ASSERTION MODIFIÉE (passe bis 2 de l'étape 2, 19/10 ; point F de la passe bis) : et ce que seule la popup lit — les consommables, les
   * réglages, le select du mode — ou que seul le serveur emploie — les cibles de commande, les notes d'une entité désignée ailleurs —,
   * déplacé vers distributeurfiche.js pour un démarrage neutre : un import statique les ramènerait au démarrage en silence. */
  for (const nom of ['scriptsCandidats', 'planningAffiche', 'libelleHeures', 'repasDepuisHistorique', 'septJoursRepas', 'compteDuJour',
    'consommablesDistributeur', 'reglagesDistributeur', 'selectMode', 'ciblesDeCommande', 'notesAppareil']) {
    assert.ok(!distributeur.includes('export function ' + nom + '('), nom + ' est revenu dans distributeur.js : il entre dans le boot');
  }
});

test('les dessins des plantes sont des fichiers servis à côté de la page : le démarrage n’en garde que l’adresse', () => {
  /* Chantier Capteurs, étapes 2 et 3, tâche 1 (C34, la place d'abord) : les deux dessins de PLANT_ART pesaient 6 778 octets
   * au démarrage, en adresses `data:`. Ils deviennent deux fichiers de `public/plantes/`, recopiés à côté de la page comme
   * les polices ; la carte d'une plante n'en garde que l'adresse, relative à la page. */
  const app = (MONOLITHE + VUES_SORTIES);
  const i = app.indexOf('const PLANT_ART = {');
  assert.notEqual(i, -1, 'PLANT_ART a disparu : la carte d’une plante perd son dessin');
  const bloc = app.slice(i, app.indexOf('};', i) + 2);
  assert.equal(bloc, "const PLANT_ART = { schefflera: './plantes/schefflera.svg', dracaena: './plantes/dracaena.svg' };");
  assert.ok(!app.includes("%3Cpath d='M75 170 L80 145") && !app.includes("%3Cpath d='M75 185 L80 155"), 'un dessin de plante est revenu en adresse data:');
  for (const nom of ['schefflera', 'dracaena']) {
    const f = join(RACINE, 'public', 'plantes', nom + '.svg');
    assert.ok(existsSync(f), nom + '.svg manque : la carte montrerait un cadre vide');
    const svg = readFileSync(f, 'utf8');
    assert.ok(svg.startsWith("<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'>") && svg.endsWith('</svg>\n'), nom + '.svg n’est pas le dessin d’avant');
  }
  /* La réserve de C34, prise dès cette tâche : la carte d'un groupe, mesurée, ne tenait pas dans la marge que laissent les plantes.
   * Les vingt-trois dessins de la vue Énergie, des postes et de la fiche d'un robot (VIEW_ART, DEVICE_ART : plus de 18 Ko au
   * démarrage) deviennent des fichiers de `public/dessins/`, de la même façon. */
  assert.ok(!app.includes("data:image/svg+xml,%3Csvg viewBox='0 0 200 200'"), 'un de ces dessins est resté en adresse data: dans App.jsx');
  assert.ok(app.includes("const adresseDessin = (nom) => './dessins/' + nom + '.svg';"));
  const vues = /const VIEW_ART = Object\.fromEntries\(\[([^\]]+)\]/.exec(app), appareils = /const DEVICE_ART = Object\.fromEntries\(\[([^\]]+)\]/.exec(app);
  assert.ok(vues && appareils, 'VIEW_ART et DEVICE_ART gardent leurs clés');
  const noms = [...vues[1].matchAll(/'(\w+)'/g), ...appareils[1].matchAll(/'(\w+)'/g)].map(m => m[1]);
  assert.equal(noms.length, 23);
  for (const nom of noms) {
    const f = join(RACINE, 'public', 'dessins', nom + '.svg');
    assert.ok(existsSync(f) && readFileSync(f, 'utf8').startsWith('<svg ') && readFileSync(f, 'utf8').endsWith('</svg>\n'), nom + '.svg manque ou n’est pas un dessin');
  }
});

test('le fond météo attend la première peinture', () => {
  const app = (MONOLITHE + VUES_SORTIES);
  const i = app.indexOf('<WeatherGL');
  assert.notEqual(i, -1, 'le fond météo a disparu');
  // La garde de montage : la ligne au-dessus du calque du ciel. (Le 17/10, elle
  // a perdu `!REDUCE_MOTION` : le ciel du handoff reste, immobile, quand le
  // mouvement est réduit — mais il attend toujours la peinture.)
  const calque = app.lastIndexOf("<div className={'o-wx3d'", i);
  assert.notEqual(calque, -1, 'le calque du ciel a disparu');
  const garde = app.slice(app.lastIndexOf('\n', app.lastIndexOf('\n', calque) - 1), calque);
  assert.match(garde, /fondPret/,
    'le fond météo se monte de nouveau au premier rendu : son import repart avant la peinture');
  assert.match(app, /onPaintReady\(\(\) => \{ if \(vivant\) setFondPret\(true\); \}\);/,
    'plus rien ne relâche le fond après la peinture : il ne s’afficherait jamais');
});

// ─────────────────────────────────────────────────────────────────────────────
// Rien d'étranger dans `src/`.
//
// `src/App.jsx.avant-atrium` — 552 ko, une copie de travail du 19 août — y a
// dormi des semaines. Rien ne la voyait : le linter ne lit que `.js` et `.jsx`,
// le test des modules injoignables aussi, et le bundler ne l'atteignait pas.
// Son extension la faisait passer entre toutes les mailles. Elle ne se
// signalait qu'en polluant les recherches — une requête sur le code tombait
// dessus, et sur du code qui n'existe plus.
//
// Elle n'a pas été supprimée : le dépôt commence le 24 août, elle date du 19,
// et elle diffère du premier commit par 6845 lignes. C'était le seul exemplaire
// d'un état qui n'est dans aucun commit. Elle vit maintenant hors de `src/`.
// ─────────────────────────────────────────────────────────────────────────────

const EXTENSIONS = new Set(['js', 'jsx', 'css', 'svg', 'webp']);

test('src ne contient que du code et ses ressources', () => {
  const etrangers = [];
  const parcourir = (dossier) => {
    for (const f of readdirSync(dossier)) {
      const p = join(dossier, f);
      if (statSync(p).isDirectory()) { parcourir(p); continue; }
      const ext = f.split('.').pop();
      if (!EXTENSIONS.has(ext)) etrangers.push(court(p));
    }
  };
  parcourir(SRC);
  assert.deepEqual(etrangers.sort(), [],
    'un fichier étranger dort dans src : aucun outil ne le lit, et il ne se signalera qu’en polluant les recherches');
});
