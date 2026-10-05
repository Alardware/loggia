// ─────────────────────────────────────────────────────────────────────────────
// Cinquante-six omissions volontaires, et pas une de plus.
//
// `react-hooks/exhaustive-deps` signalait 57 dépendances manquantes. Elles ont
// été lues une par une : aucune n'était un oubli. Toutes suivent le même choix,
// pris cinquante-sept fois et écrit nulle part.
//
// Home Assistant REMPLACE son objet `hass` à chaque changement d'état de la
// maison — plusieurs fois par seconde quand quelqu'un traverse une pièce. Un
// effet qui en dépend se relance à ce rythme : il rouvre son sondage, refait sa
// requête, réabonne son écoute. Le code dépend donc d'une SIGNATURE stable —
// `sig`, `nsig`, `csig`, `Object.keys(S).length`, `ids.join('|')` — qui ne
// bouge que quand le contenu utile bouge. La règle ne sait pas suivre ce
// détour, et redemande l'objet qu'on évite exprès.
//
// Ajouter la dépendance manquante serait, dans plusieurs cas, ÉCRIRE le bug :
// `parametres.jsx` mesure la latence une fois quand l'onglet s'ouvre, avec
// `}, [tab])` ; y ajouter `lat`, que la mesure elle-même met à jour, relancerait
// la mesure en boucle.
//
// Là où la péremption mordrait vraiment, le code utilise déjà une référence
// vivante : `ciel3d.jsx` lit `propsRef.current.exposure` dans sa boucle
// d'animation, et `useEtatServeur` fait de même pour son sondage.
//
// Reste le vrai danger : cinquante-six avertissements permanents rendent la
// règle inaudible. Le cinquante-septième — celui qui serait un vrai oubli —
// passerait au milieu sans que personne le voie. Ce test est là pour ça : il
// fige l'inventaire vérifié. Un nouveau manquement fait échouer la suite en le
// nommant ; un manquement corrigé la fait échouer aussi, pour qu'on descende le
// compteur plutôt que de le laisser mentir.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESLint } from 'eslint';
import { readFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

/* L'inventaire relu le 7 septembre 2026, par fichier et par dépendance.
 *
 * Il en comptait 46 pour `App.jsx`. Nommer les expressions posées en dur dans
 * les tableaux en a retiré deux : `finGrille` et `jours` lisaient
 * `debutGrille.getTime()`, ils lisent maintenant la constante `debutMs`, qui
 * EST une dépendance en bonne et due forme. La règle ne réclame plus rien là.
 *
 * C'est le gain qu'on n'attendait pas d'un simple renommage : tant qu'un
 * tableau contenait une expression, la règle refusait de le vérifier ENTIER —
 * y compris les dépendances correctement nommées à côté. */
const VERIFIE = {
  /* Passé de 43 à 41 en retirant le code mort, puis à 38 : le journal
   * d'activité et la vue Système ont quitté `App.jsx`. Aucun manquement n'a
   * disparu ni apparu — les mêmes, rangés ailleurs. C'est ce qu'on attend d'un
   * déplacement, et c'est ce que cette liste sert à prouver.
   * Puis à 33 (14/09/2026) : les vues Lumières, Climat, Médias et l'ancienne
   * Objets ont quitté `App.jsx`, leurs cinq omissions avec elles — celles-là
   * ont disparu, pas déménagé : la vue Objets n'en a aucune.
   * Puis à 32 : la fiche « Modifier l'entité » (mode édition, 14/09) n'a plus
   * de champ ENTITÉ, ni le `useMemo` qui listait ses options.
   * Lot 15 de l'audit du 03/10 : `autoOn` (les repas) et `derivedCovers`
   * (les volets) sont partis avec les miroirs qui les recopiaient — les deux
   * états passent par `useOptimiste`. Disparus, pas déménagés. */
  'src/App.jsx': [
    'S', 'S', 'S',
    'S and dc', 'S and ids', 'S, domaineOk, and nomEnt',
    'a and dashHass', 'ancre', 'api and plage', 'applyUser',
    'choisis and tousCals', 'cle and hass', 'cv.name',
    'dc', 'debutGrille and finGrille', 'derived',
    'discovery', 'discovery',
    'hass', 'hass', 'hass',
    'hass and live', 'hass, ids, and metrics', 'hidden', 'keys and noisyKeys',
    'loggiaRuntime.index', 'noms', 'seulement',
    'vuesAutorisees',
  ],
  'src/historique.jsx': ['hass', 'ids'],
  /* `src/views/systeme.jsx` figurait ici avec « HIST_IDS, SYS.host.online, and
   * hass ». La vue a été refaite (17/09/2026, ADR 0037) : toutes ses lectures
   * passent par une référence vivante, comme `useEtatServeur` — l'omission a
   * disparu, elle n'a pas déménagé. */
  /* `src/ciel3d.jsx` figurait ici avec « exposure and limitMag ». Le fichier a
   * disparu : un ciel étoilé de 284 lignes qu'aucun import n'atteignait. */
  'src/ui.jsx': ['cur'],
  /* `lireObserve` (18/09/2026) : l'interrupteur « Observer sans agir » des
   * Regles relit les quatre modules toutes les cinq secondes. La fonction est
   * recreee a chaque rendu — et le rendu suit chaque changement d'etat de la
   * maison : la mettre dans le tableau relancerait l'intervalle a ce rythme.
   * Un `hass` de moins (lot 15 de l'audit du 03/10) : la purge faite main des
   * automatisations est partie, `useOptimiste` la remplace. */
  'src/views/parametres.jsx': [
    'entTouched and readEnt', 'h', 'hass', 'hass',
    'hass and updBusy', 'lat and ping', 'lireObserve',
  ],
  /* `onCompte` (18/09/2026) : la section remonte ses chiffres a l'en-tete de
   * la page. Le parent recree ce rappel a chaque rendu, et chaque appel le
   * fait rendre : la dependance tournerait en boucle. Seuls les chiffres
   * relancent l'effet. */
  'src/views/interrupteurs.jsx': ['onCompte'],
  /* `ws` (03/10/2026) : la relecture des listes de taches tient a `pret`, un
   * 0/1 qui dit si le lien websocket repond. `hass.callWS` est RELIE a chaque
   * rendu — le mettre dans le tableau relancerait la lecture a chaque etat qui
   * bouge dans la maison, c'est-a-dire sans arret. */
  'src/rappelsrail.jsx': ['ws'],
};

const APOSTROPHE = String.fromCharCode(39);
const ANTISLASH = String.fromCharCode(92);

/* UNE seule passe ESLint pour tout le fichier (24/09, plan S8).
 *
 * Les deux relevés ci-dessous lisent les MÊMES messages : celui des
 * expressions posées en dur, et celui des dépendances omises. Chacun lançait
 * sa propre passe sur tout `src/` — 45 s à deux, la quasi-totalité du temps de
 * la suite. La promesse est retenue : le second relevé attend le premier au
 * lieu de refaire le travail. Aucune garantie ne change.
 *
 * Le dossier par son chemin ABSOLU, et non `'src'` : ESLint résoudrait
 * relativement au répertoire courant, qui n'a pas à être celui du dépôt. */
let passeEnCours = null;
const passe = () => (passeEnCours = passeEnCours
  || new ESLint({ cwd: RACINE }).lintFiles([join(RACINE, 'src')]));

/** Les expressions posées en dur dans un tableau de dépendances, s'il en reste. */
async function expressions() {
  const out = [];
  for (const f of await passe()) {
    const nom = relative(RACINE, f.filePath).split(ANTISLASH).join('/');
    const lignes = readFileSync(f.filePath, 'utf8').split(String.fromCharCode(10));
    for (const m of f.messages) {
      if (m.ruleId !== 'react-hooks/exhaustive-deps') continue;
      if (!/complex expression/.test(m.message)) continue;
      const l = lignes[m.line - 1] || '';
      out.push(`${nom}:${m.line} → ${l.slice(m.column - 1, (m.endColumn || m.column + 40) - 1)}`);
    }
  }
  return out;
}

test('aucune expression posée en dur dans un tableau de dépendances', async () => {
  // Il y en avait 38, sur 26 crochets. Tant qu'un tableau en contient une, la
  // règle refuse de le vérifier ENTIER — les dépendances correctement nommées
  // à côté cessent d'être contrôlées avec lui. C'est ce qui masquait deux
  // manquements du calendrier, apparus dès que les expressions ont eu un nom.
  assert.deepEqual(await expressions(), [],
    'une expression est revenue dans un tableau de dépendances : donne-lui un nom, sinon tout le tableau cesse d’être vérifié');
});

/** Ce que l'outil voit aujourd'hui, dans la même forme. */
async function releve() {
  const par = {};
  for (const f of await passe()) {
    // Relatif à la racine du dépôt, jamais à un nom de dossier : sur un poste
    // de développement le projet s'appelle « OrionV2-source », sur le runner
    // d'intégration « loggia ». Découper sur un nom en dur passait ici et
    // échouait partout ailleurs — c'est exactement ce qui est arrivé.
    const nom = relative(RACINE, f.filePath).split(ANTISLASH).join('/');
    for (const m of f.messages) {
      if (m.ruleId !== 'react-hooks/exhaustive-deps') continue;
      const d = m.message.match(/missing dependenc[a-z]*: (.*?)\. Either/);
      if (d) (par[nom] = par[nom] || []).push(d[1].split(APOSTROPHE).join(''));
    }
  }
  for (const k of Object.keys(par)) par[k].sort();
  return par;
}

test('aucune dépendance omise en plus de celles qui ont été relues', async () => {
  const vu = await releve();
  const fichiers = new Set([...Object.keys(VERIFIE), ...Object.keys(vu)]);
  const nouveaux = [];
  const disparus = [];
  for (const f of fichiers) {
    // On compare des multi-ensembles : cinq `hass` dans un fichier ne sont pas
    // un seul `hass`, et remplacer une omission par une autre ne doit pas
    // passer pour un statu quo.
    const attendu = [...(VERIFIE[f] || [])];
    for (const d of vu[f] || []) {
      const i = attendu.indexOf(d);
      if (i < 0) nouveaux.push(`${f} → ${d}`); else attendu.splice(i, 1);
    }
    for (const d of attendu) disparus.push(`${f} → ${d}`);
  }
  assert.deepEqual(nouveaux, [],
    'un effet omet une dépendance qui n’a jamais été relue : soit elle est voulue et il faut le dire ici, soit c’est un oubli');
  assert.deepEqual(disparus, [],
    'une omission de la liste a été corrigée — retire-la de VERIFIE, sinon le compteur ment');
});

// ─────────────────────────────────────────────────────────────────────────────
// Six vues sondaient le serveur avec le même code, à la ligne près.
//
// Même premier appel, même intervalle, même drapeau « vivant », même `[!!h]`.
// Six copies, c'est six endroits où corriger la fermeture périmée — et le
// septième qu'on écrirait demain en recopiant le sixième.
// ─────────────────────────────────────────────────────────────────────────────

const VUES_SONDEUSES = ['fenetres', 'volets', 'nuit', 'presence', 'veilles', 'interrupteurs'];

test('aucune vue ne refait son propre sondage', () => {
  for (const v of VUES_SONDEUSES) {
    const src = readFileSync(join(RACINE, 'src', 'views', v + '.jsx'), 'utf8');
    assert.ok(!/const t = setInterval\(lire/.test(src),
      `${v}.jsx a repris une boucle de sondage locale`);
    assert.match(src, /useEtatServeur\(hass,/,
      `${v}.jsx n’utilise plus le sondage partagé`);
  }
});

test('le sondage lit le hass du moment, pas celui du premier rendu', () => {
  const ui = readFileSync(join(RACINE, 'src', 'ui.jsx'), 'utf8');
  const i = ui.indexOf('export function useEtatServeur(');
  assert.notEqual(i, -1, 'le sondage partagé a disparu');
  const corps = ui.slice(i, ui.indexOf('\n}', i));
  // Home Assistant remplace son objet à chaque changement d'état. Capturer
  // celui du premier rendu marche — la connexion, elle, survit — mais par
  // chance, pas par construction.
  assert.match(corps, /const lire = \(\) => hRef\.current\.callWS/,
    'la boucle rappelle un hass capturé : elle tient de nouveau à une propriété non écrite');
  assert.ok(!/\}, \[!!/.test(corps),
    'la dépendance redevient une expression que l’outil ne sait pas vérifier');
});

// ─────────────────────────────────────────────────────────────────────────────
// Troisième défaut de la même famille : l'import que plus personne ne lit.
//
// Découper un fichier laisse du gravier derrière lui. La 2.97.16 a livré cinq
// imports morts dans la vue Système — `LOGGIA_RESOLVED`, `loggiaEnt`, `peut`,
// `sysKeys`, `SYS_SLOTS` — sans que rien ne proteste : `no-unused-vars` est
// réglé sur « avertissement », et l'avertissement se tenait au milieu de
// trente-neuf autres. Il était là. Personne ne le lisait.
//
// Un import mort ne coûte pas que de la lecture : il maintient une arête dans
// le graphe des modules. `import { CamLive, HaImage }` retient `camera.jsx`
// même si `HaImage` n'est plus appelé nulle part, et un jour cette arête sera
// la seule à garder un module entier dans le bundle de démarrage.
//
// Ce test promeut le seul avertissement `no-unused-vars` en échec. Les autres
// règles restent ce qu'elles sont — celles des dépendances de hooks sont
// délibérément tolérées, et `tests/dependances.test.mjs` en tient l'inventaire.
// ─────────────────────────────────────────────────────────────────────────────

test('aucun nom déclaré ne reste sans lecteur', async () => {
  const morts = [];
  for (const f of await passe()) {
    for (const m of f.messages) {
      if (m.ruleId !== 'no-unused-vars') continue;
      morts.push(relative(RACINE, f.filePath).split(ANTISLASH).join('/') + ':' + m.line + ' → ' + m.message.split(' is defined')[0]);
    }
  }
  assert.deepEqual(morts.sort(), [],
    'un nom déclaré n’est lu nulle part : un découpage a laissé son gravier');
});

// ─────────────────────────────────────────────────────────────────────────────
// Lot 16 (05/10) : hors des dépendances d'effet, ESLint ne doit RIEN dire.
//
// `lint:tout` sortait 53 avertissements : les 48 exhaustive-deps relues plus
// haut, et cinq qui n'en étaient pas. D'abord deux faux positifs
// control-has-associated-label : le champ Alexa et la recherche d'icônes ont
// leur `<label htmlFor>`, que la règle ne suit pas. Ensuite un
// no-noninteractive-tabindex sur la carte Présence, où rôle et tabIndex sont
// posés ENSEMBLE (ADR 0147). Enfin deux directives qui ne couvraient rien :
// l'une visait la div au lieu du champ, l'autre nommait une règle déjà
// satisfaite. Une directive inutile ne dit rien aujourd'hui, et elle tait
// demain le vrai défaut qui viendra se poser sur sa ligne.
//
// `npm test` ne lance pas le lint : sans ces deux tests, seule la CI le
// verrait. Ils lisent la passe déjà faite ici, et n'en lancent pas une
// troisième (plan S8, 24/09).
// ─────────────────────────────────────────────────────────────────────────────

test('hors des dépendances d’effet, eslint ne sort rien : ni jsx-a11y, ni directive inutile', async () => {
  const autres = [];
  for (const f of await passe()) {
    const nom = relative(RACINE, f.filePath).split(ANTISLASH).join('/');
    for (const m of f.messages) {
      if (m.ruleId === 'react-hooks/exhaustive-deps') continue;
      autres.push(`${nom}:${m.line} ${m.ruleId || (m.fatal ? 'analyse' : 'directive')} → ${m.message}`);
    }
  }
  assert.deepEqual(autres, [],
    'un avertissement autre qu’exhaustive-deps est revenu : un vrai défaut se corrige ; un faux positif prend sa directive SUR la ligne qu’il vise, et une directive qui ne couvre plus rien se retire');
});

test('le compte d’eslint tient sous le cliquet de la CI, et le cliquet ne remonte pas', async () => {
  const wf = readFileSync(join(RACINE, '.github', 'workflows', 'validate.yml'), 'utf8');
  const m = wf.match(/\n {6}- run: npm run lint:tout -- --max-warnings (\d+)\n/);
  assert.ok(m, 'le cliquet a disparu de validate.yml');
  let n = 0;
  for (const f of await passe()) n += f.warningCount;
  assert.ok(n <= Number(m[1]), `eslint sort ${n} avertissements, le cliquet de la CI en tolère ${m[1]} : la PR serait rouge`);
  // Le lot 16 a ramené le compte à 48 et serré le cliquet d'autant. Au-dessus,
  // un avertissement est entré sans que personne le décide.
  assert.ok(Number(m[1]) <= 48, `le cliquet de la CI est à ${m[1]}, au-dessus des 48 du lot 16 : il ne doit que descendre`);
});

test('le chemin chaud ne recalcule plus pour rien', () => {
  // Audit du 27/09, point 7. Trois calculs repartaient à CHAQUE rendu :
  // `deriveAccueil` (cent trente lignes — pièces, lumières, chauffage,
  // volets, plantes, machines, alarme, caméras, médias), `deriveNotifs`, et le
  // compte d'appareils de la barre latérale, qui boucle sur toutes les
  // entités de la maison avec un test sur huit préfixes de domaine.
  //
  // Ce n'est pas le changement d'état qui coûtait : quand la maison bouge,
  // refaire le calcul est juste. C'est tout le reste. Mesuré sur la
  // démonstration, `hass` IDENTIQUE d'un bout à l'autre : un aller-retour en
  // mode édition provoquait quatre recalculs complets des trois. Après :
  // zéro, et quatre bascules de lampe en provoquent toujours quatre — le
  // chemin légitime est intact.
  const app = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
  assert.match(app, /const accueil = useMemo\(\(\) => \{/, '`deriveAccueil` est de nouveau appelée dans le rendu');
  assert.match(app, /\}, \[view, activeRoom, hass, cfg, loggiaRuntime\.resolved, loggiaRuntime\.index\]\);/,
    'les dépendances de l’Accueil ont changé : vérifier qu’elles restent COMPLÈTES');
  assert.match(app, /const vivantes = useMemo\(\(\) => \{/, '`deriveNotifs` est de nouveau appelée dans le rendu');
  assert.match(app, /const nbAppareils = useMemo\(\(\) => \{/, 'le compte d’appareils reboucle à chaque rendu');
  // La vue Objets sert CINQ entrées de menu. Sa chaîne — balayage complet des
  // entités, tri, deux passes de comptage — repartait même quand seul un état
  // LOCAL avait bougé : changer de puce de filtre rescannait la maison.
  assert.match(app, /const tousObjets = useMemo\(\(\) => objetsDeLaMaison\(hass, ajoutes, epingles\), \[hass, ajoutes, epingles\]\);/,
    'la liste des objets n’est plus mémoïsée');
  for (const [quoi, motif] of [
    ['le tri', /const derived = useMemo\(/],
    ['la table par clé', /const parCle = useMemo\(/],
    ['les puces', /const puces = useMemo\(\(\) => pucesObjets\(objets\), \[objets\]\);/],
    ['les compteurs', /const stats = useMemo\(\(\) => statsObjets\(objets\), \[objets\]\);/],
  ]) assert.match(app, motif, quoi + ' de la vue Objets n’est plus mémoïsé');
  /* Et les ENTRÉES sont stabilisées par leur signature. Sans cela, `ajoutes`,
   * `ordrePieces` et les épingles sont des valeurs neuves à chaque rendu :
   * mémoïser dessus ne servirait à rien, tout en ajoutant des avertissements à
   * l'inventaire ci-dessus — que ce fichier garde court exprès. */
  for (const [quoi, motif] of [
    ['les ajouts', /const ajoutes = useMemo\(\(\) => \(ajoutesSig \? ajoutesSig\.split\('\|'\) : \[\]\), \[ajoutesSig\]\);/],
    ['l’ordre des pièces', /const ordrePieces = useMemo\(\(\) => \(ordreSig \? ordreSig\.split\('\|'\) : \[\]\), \[ordreSig\]\);/],
    ['les épingles', /const epingles = useMemo\(\(\) => new Set\(epinglesSig \? epinglesSig\.split\('\|'\) : \[\]\), \[epinglesSig\]\);/],
  ]) assert.match(app, motif, quoi + ' n’est plus stabilisé par sa signature : la mémoïsation ne sert plus à rien');
});
