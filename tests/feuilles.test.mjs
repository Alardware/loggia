// ─────────────────────────────────────────────────────────────────────────────
// Une seule croix, la même partout, en dernier sur la ligne d'en-tête.
//
// Retours du 19/09 : « toutes les popups n'ont pas le même bouton pour fermer
// ni au même endroit, ça va pas » — il y en avait cinq sortes, et des
// « Annuler » en bas qui ne faisaient que fermer. Puis, quand la croix est
// montée à côté de la poignée : « pourquoi ils ne sont pas alignés ? et
// horizontalement » — l'épingle et la roue restaient sur la ligne du titre.
// La croix est donc UN composant, `CroixFeuille` (ui.jsx) : 34 px, rayon 10,
// le fond de l'épingle, posé en dernier sur la ligne d'en-tête de chaque
// feuille ; il ferme la feuille qui le contient.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const UI = lire('src', 'ui.jsx');
const APP = lire('src', 'App.jsx');
const sources = () => {
  const fichiers = [];
  const parcourir = (d) => readdirSync(join(RACINE, d), { withFileTypes: true }).forEach(e => {
    if (e.isDirectory()) parcourir(join(d, e.name));
    else if (/\.jsx?$/.test(e.name)) fichiers.push(join(d, e.name));
  });
  parcourir('src');
  return fichiers.map(f => [f.replace(/\\/g, '/'), readFileSync(join(RACINE, f), 'utf8')]);
};
const fonction = (src, nom) => {
  const i = src.indexOf('function ' + nom + '(');
  const j = src.indexOf('\nfunction ', i + 1);
  return src.slice(i, j < 0 ? undefined : j);
};

test('la croix commune : la taille et le fond de l’épingle ; elle ferme sa feuille', () => {
  const c = fonction(UI, 'CroixFeuille');
  assert.ok(c.includes('width: 34, height: 34, borderRadius: 10') && c.includes("background: 'var(--o-s1)'"), 'la croix n’a plus la taille de ses voisins');
  assert.ok(c.includes('const fermer = useContext(FermerCtx);') && c.includes('data-croix=""'));
  assert.ok(fonction(APP, 'BoutonEpingle').includes('width: 34, height: 34, borderRadius: 10'), 'l’épingle a changé de taille : la croix ne s’aligne plus sur elle');
  const b = fonction(UI, 'BottomSheet');
  assert.ok(b.includes('<FermerCtx.Provider value={close}>'), 'la croix ne sait plus quelle feuille fermer');
  assert.ok(!b.includes("aria-label={tr('Fermer')}"), 'la feuille dessine de nouveau sa croix à part, au-dessus de l’en-tête');
  assert.ok(b.includes('{title ? <TitreFeuille style={{ fontSize: 17, fontWeight: 800 }} marge={12}>{title}</TitreFeuille> : null}'), 'une feuille qui ne passe qu’un titre n’a plus sa ligne');
  // Au clavier, on arrive sur le contenu, pas sur « Fermer » ; la recherche garde son champ.
  assert.ok(b.includes('el.contains(document.activeElement)') && b.includes("!n.hasAttribute('data-croix')"));
});

test('chaque feuille porte la croix sur sa ligne d’en-tête', () => {
  // ASSERTION MODIFIÉE (sa maquette « Cartes météo », 20/10) : la fiche météo, chargée à la demande, porte sa croix (EnteteFiche, fichemeteo.jsx).
  // Chaque <BottomSheet> de src/ : la croix vient de CroixFeuille, de
  // TitreFeuille, de FicheEntete, du `title` passé à la feuille, ou de la
  // fiche du robot qu'elle contient.
  const sans = [];
  for (const [f, s] of sources()) {
    let i = s.indexOf('<BottomSheet');
    while (i >= 0) {
      const fin = s.indexOf('</BottomSheet>', i);
      const bloc = s.slice(i, fin < 0 ? undefined : fin);
      const ouverture = s.slice(i, s.indexOf('\n', i));
      // ASSERTION MODIFIÉE (chantier Lumières, tâche 8) : la fiche d'une lumière, chargée à la demande, porte sa croix (EnteteFiche).
      // ASSERTION MODIFIÉE (passe téléphone, corrections bis, point 1) : la coquille d'un lecteur garde le BottomSheet (App.jsx) ; son contenu, chargé à la demande, porte sa croix (CroixFeuille, fichemedia.jsx).
      // Le nom du contenu ne vaut que pour la COQUILLE : la croix de ce lecteur est lue DANS fichemedia.jsx, plus bas (corrections bis 2, point 2).
      // ASSERTION MODIFIÉE (chantier Capteurs, tâche 6) : la fiche d'une mesure, chargée à la demande, porte sa croix (EnteteFiche).
      // ASSERTION MODIFIÉE (chantier Capteurs, étapes 2 et 3, tâche 5 ; C27) : la popup d'un groupe garde sa feuille ; son contenu, chargé à la demande, porte sa croix (EnteteFiche, fichegroupe.jsx).
      // ASSERTION MODIFIÉE (chantier Capteurs, correction bis, point 3) : les coquilles d'un capteur binaire et de la fiche de confort d'une pièce gardent leur
      // BottomSheet ; leurs contenus, chargés à la demande, portent leur croix — lue DANS leur module, plus bas, comme celle de tout contenu accepté ici sur son nom.
      // ASSERTION MODIFIÉE (chantier Mode enfant, tâche 5 ; E19) : la feuille « Réglages parent » : son contenu (`ContenuEnfant`) bâtit l'en-tête avec le commun
      // (`EnteteFiche`, dont la croix ferme la ligne : vérifié plus haut) — lu DANS le module, plus bas.
      // ASSERTION MODIFIÉE (passe bis du 17/10, point 10) : son BottomSheet est la coquille `FicheEnfant` de fichemedia.jsx (la frontière Suspense dedans), le contenu reste à la demande.
      // ASSERTION MODIFIÉE (audit des prises, 19/10) : la feuille d'un switch ordinaire garde sa coquille (App.jsx) ; son contenu, chargé à la
      // demande (ficheswitch.jsx), porte sa croix et son nom par l'en-tête des fiches (`FicheEntete`, passé dans ses briques), lu plus bas.
      // ASSERTION MODIFIÉE (boot, 19/10) : la feuille du Calendrier garde sa coquille (App.jsx) ; son contenu, chargé à la demande
      // (feuillecalendrier.jsx), porte sa croix (`CroixFeuille`, en dernier sur sa ligne d'en-tête), lue DANS son module, plus bas.
      // ASSERTION MODIFIÉE (étape 3 IoT, 25/10 ; I27) : la popup d'une vanne : son contenu (`ContenuVanne`, fichevanne.jsx) porte l'en-tête commun — sa croix et son nom (`EnteteFiche`).
      if (!/<CroixFeuille|<TitreFeuille|<FicheEntete|<ContenuEnfant|<FicheRobotContent|<FicheDistributeurContent|<FicheChauffageContent|<FicheVoletContent|<FichePriseContent|<FicheLumiereContent|<FicheMediaContent|<FicheMeteoContenu|<FicheCapteurContent|<FicheBinaireContent|<FicheConfortContent|<FichePlanteContent|<FicheGroupeContent|<FicheSwitchContent|<FeuilleCalendrierContent|<ContenuVanne/.test(bloc) && !/ title=\{/.test(ouverture)) sans.push(f + ':' + s.slice(0, i).split('\n').length);
      i = s.indexOf('<BottomSheet', i + 1);
    }
  }
  assert.deepEqual(sans, [], 'une feuille n’a plus de croix');
  // L'en-tête des fiches : l'épingle, puis la croix.
  const e = fonction(APP, 'FicheEntete');
  assert.ok(e.indexOf('<BoutonEpingle id={id} />') >= 0 && e.indexOf('<BoutonEpingle id={id} />') < e.indexOf('<CroixFeuille />'), 'la croix n’est plus en dernier');
  // La fiche du robot : l'épingle, la roue, puis la croix — sur la même ligne.
  /* ASSERTION MODIFIÉE (chantier IoT, tâche 8, 18/10 ; I15) : la fiche du robot prend l'en-tête commun (`EnteteFiche`, dont l'épingle,
   * la roue puis la croix ferment la ligne : vérifié juste dessous) et ne bâtit plus le sien à la main ; sa seconde feuille, la carte
   * du logement, a sa ligne de titre (`TitreFeuille`, sa croix au bout). */
  const robot = lire('src', 'ficherobot.jsx');
  assert.equal(robot.split('<EnteteFiche nom={nom} plaque={plaque} sousNom={sousNom} epingle={epingle} reglages').length - 1, 1, 'la fiche du robot a perdu l’en-tête commun, et sa croix avec');
  assert.ok(!/<CroixFeuille|<NomFeuille/.test(robot), 'un second en-tête, bâti à la main, dans la fiche du robot');
  // La fiche du distributeur (ADR 0155, 05/10) : son en-tête vient du socle commun — l'épingle, la roue, puis la croix.
  const commune = lire('src', 'fichecommune.jsx');
  const t = commune.slice(commune.indexOf('export function EnteteFiche('), commune.indexOf('\n}\n', commune.indexOf('export function EnteteFiche(')));
  assert.ok(t.indexOf('{!enReglages && epingle}') > 0 && t.indexOf("aria-label={tr('Réglages')}") > t.indexOf('{!enReglages && epingle}')
    && t.indexOf('<CroixFeuille />') > t.indexOf("aria-label={tr('Réglages')}"), 'la croix du distributeur a quitté la fin de sa ligne');
  assert.ok(lire('src', 'fichedistributeur.jsx').includes('<EnteteFiche nom={nom}'), 'la fiche du distributeur a perdu l’en-tête commun');
  // La fiche d'un chauffage (plan 2 du chantier Chauffage, tâche 8) : le même en-tête commun — l'épingle, puis la croix.
  assert.ok(lire('src', 'fichechauffage.jsx').includes('<EnteteFiche nom={nom}'), 'la fiche du chauffage a perdu l’en-tête commun');
  // ASSERTION AJOUTÉE (étape 3 IoT, 25/10 ; I27) : la popup d'une vanne, le même en-tête commun — l'épingle, puis la croix.
  assert.ok(lire('src', 'fichevanne.jsx').includes('<EnteteFiche nom={v.nom} epingle={epingle}'), 'la popup de la vanne a perdu l’en-tête commun');
  /* ASSERTION AJOUTÉE (passe téléphone, corrections bis 2, point 2) : la fiche d'un lecteur. La liste plus haut accepte `<FicheMediaContent` sur son seul
   * nom — c'est la coquille, dans App.jsx, qui garde le BottomSheet — ; la croix, elle, vit DANS le contenu chargé à la demande (fichemedia.jsx), qui bâtit
   * son en-tête à la main. On la lit là, en dernier sur la ligne : le nom, l'épingle, puis la croix. Retirée de ce module, plus rien n'échouait. */
  // ASSERTION MODIFIÉE (chantier Médias, tâche 6 ; M12) : la fiche d'un lecteur prend l'en-tête commun (`EnteteFiche`, sa croix en dernier : vérifié plus haut) ;
  // la bascule et l'épingle lui viennent de la coquille, et plus rien n'y est bâti à la main.
  const media = lire('src', 'fichemedia.jsx');
  assert.equal(media.split('<EnteteFiche nom={v.nom}').length - 1, 1, 'la fiche d’un lecteur a perdu l’en-tête commun, et sa croix avec');
  assert.ok(!/<CroixFeuille|<NomFeuille/.test(media), 'un second en-tête, bâti à la main, dans la fiche d’un lecteur');
  /* ASSERTION AJOUTÉE (chantier Capteurs, correction bis, point 16) : les autres contenus que la liste plus haut accepte sur leur seul nom. La croix d'une
   * lumière, d'une prise, d'un volet, d'un chauffage et d'une mesure vient de l'en-tête commun (`EnteteFiche`, fichecommune.jsx, dont la croix ferme la ligne :
   * vérifié plus haut) ; celle d'un capteur binaire, de `FicheEntete`, que sa coquille lui passe (sa croix en dernier : vérifié plus haut) ; celle de la fiche
   * de confort d'une pièce, de `CroixFeuille`. On les lit DANS leur module : retirées de fichelumiere.jsx ou de ficheprise.jsx, plus rien n'échouait. */
  // ASSERTION MODIFIÉE (chantier Capteurs, étapes 2 et 3, tâche 4 ; C26) : la fiche d'un capteur binaire prend l'en-tête commun, comme celle d'une mesure.
  for (const [module, croix] of [['fichelumiere.jsx', '<EnteteFiche nom='], ['ficheprise.jsx', '<EnteteFiche nom='], ['fichevolet.jsx', '<EnteteFiche nom='], ['fichechauffage.jsx', '<EnteteFiche nom='],
    ['fichecapteur.jsx', '<EnteteFiche nom={vue.nom}'], ['fichecapteur.jsx', '<EnteteFiche nom={a.friendly_name || id}'], ['ficheconfort.jsx', '<CroixFeuille />'], ['fichegroupe.jsx', '<EnteteFiche nom={nom}'], ['ficheswitch.jsx', '<FicheEntete titre={nom}'],
    // La fiche d'une plante (chantier Capteurs, étapes 2 et 3, tâche 10 ; C31).
    ['ficheplante.jsx', '<EnteteFiche nom={pl.name}'],
    // La feuille « Réglages parent » du mode enfant (chantier Mode enfant, tâche 5 ; E19).
    ['ficheenfant.jsx', '<EnteteFiche nom='],
    // ASSERTION MODIFIÉE (boot, 19/10) : la feuille du Calendrier, sortie d'App.jsx — sa croix ferme toujours sa ligne d'en-tête.
    ['feuillecalendrier.jsx', '<CroixFeuille />']]) {
    assert.equal(lire('src', module).split(croix).length - 1, 1, module + ' : sa feuille n’a plus sa croix (' + croix + ')');
  }
});

test('aucune autre croix : la commune, la commande d’un volet, le formulaire d’événement', () => {
  const croix = [];
  for (const [f, s] of sources()) {
    const n = (s.match(/aria-label=\{tr\('Fermer'\)\}/g) || []).length;
    if (n) croix.push(f + ' × ' + n);
  }
  /* La troisieme est arrivee le 02/10 avec l'agenda : elle ferme la FICHE
   * d'un evenement, une carte posee DANS la feuille, et non la feuille
   * elle-meme. `CroixFeuille` fermerait la feuille entiere — ce n'est pas
   * ce qu'on demande ici. */
  /* La quatrieme est arrivee le 03/10 avec les rappels : meme cas que celle
   * du formulaire d'evenement — elle ferme le PANNEAU d'ajout pose dans la
   * carte, et non une feuille. */
  /* La commande « Fermer » d'un volet ne compte plus ici depuis le lot 13 de
   * l'audit du 03/10 : son nom dit le volet (« Fermer Volet salon »), il n'a
   * plus la forme d'une croix. Elle reste épinglée plus bas ; App.jsx, lui,
   * n'a plus aucune croix à part. */
  // ASSERTION MODIFIÉE (chantier Prises, tâche 2) : la croix de la fiche d'un événement a suivi la feuille dans son fichier.
  assert.deepEqual(croix.sort(), ['src/feuilleagenda.jsx × 1', 'src/formevenement.jsx × 1', 'src/rappelsrail.jsx × 1', 'src/ui.jsx × 1']);
  const rap = readFileSync(join(RACINE, 'src', 'rappelsrail.jsx'), 'utf8');
  assert.ok(rap.includes("<button onClick={onClose} aria-label={tr('Fermer')}"), 'la croix du formulaire de rappel');
  // ASSERTION MODIFIÉE (19/10) : la commande suit ce que le cover accepte (`gestesCover`) ; son nom dit toujours le volet.
  assert.ok(APP.includes("<button aria-label={tr('Fermer') + ' ' + nom} title={tr('Fermer')} onClick={(e) => { e.stopPropagation(); envoyer(gestes.descendre, 0); }}"), 'la commande du volet');
  /* Le formulaire a quitte `App.jsx` le 02/10 : l'agenda du rail en avait
   * besoin, et un second formulaire aurait duplique sa validation. */
  const form = readFileSync(join(RACINE, 'src', 'formevenement.jsx'), 'utf8');
  assert.ok(form.includes("<button onClick={onClose} aria-label={tr('Fermer')}"), 'la croix du formulaire d’événement');
  assert.ok(!APP.includes('FICHE_X') && !/<FicheEntete [^\n]*close=/.test(APP), 'l’en-tête des fiches a retrouvé sa croix à part');
});

test('plus de bouton en bas qui ne fait que fermer', () => {
  /* `onClose` aussi (lot 13 de l'audit du 03/10) : les éditeurs d'un profil
   * et d'une vue (parametres.jsx) fermaient par lui, et leurs deux
   * « Annuler » passaient sous ce filet. */
  const fautifs = [];
  for (const [f, s] of sources()) {
    if (/<button[^>]*onClick=\{(close|onClose|onFermer)\}[^>]*>\s*(\{tr\('(Annuler|Terminé|Fermer)'\)\}|Annuler|Fermer)\s*<\/button>/.test(s)) fautifs.push(f);
  }
  assert.deepEqual(fautifs, [], 'un « Annuler » ou un « Terminé » ferme encore la feuille, à côté de la croix');
});

test('aucune modale faite main : un voile qui se ferme passe par BottomSheet', () => {
  /* Lot 13 de l'audit du 03/10. Les éditeurs d'un profil et d'une vue
   * (parametres.jsx) posaient leur propre voile — `position: 'fixed',
   * inset: 0`, fermé par `onClose` — : ni dialogue, ni nom, ni Échap, ni fond
   * inerte, et Tab filait derrière lui vers la page restée vivante.
   * `BottomSheet` (ui.jsx) apporte tout cela d'un coup. Un plein-écran qui se
   * FERME passe donc par lui, ou figure ci-dessous avec sa raison. Les autres
   * ne se ferment pas : l'écran de veille (son seul geste réveille),
   * l'accueil d'une installation neuve, le calque du fond photo. */
  const EXCEPTIONS = {
    /* Le pavé du code administrateur : centré au-dessus de tout, ce n'est pas
     * une feuille. Il tient seul ce qu'une feuille promet — relu ici, pour
     * que l'exception ne survive pas à ses raisons. */
    'src/pinmodal.jsx': (s) => s.includes("role=\"dialog\" aria-label={tr('Code administrateur')}")
      && s.includes("if (e.key === 'Escape')") && s.includes('inerterAutour(voileRef.current)'),
  };
  // La balise ouvrante ENTIÈRE : ses attributs avant le style, et après.
  const ouvrante = (s, i) => {
    const debut = s.lastIndexOf('<', i);
    let prof = 0;
    for (let k = debut; k < s.length; k++) {
      if (s[k] === '{') prof++;
      else if (s[k] === '}') prof--;
      else if (s[k] === '>' && prof === 0) return s.slice(debut, k + 1);
    }
    return s.slice(debut);
  };
  const fautives = [];
  let voiles = 0;
  for (const [f, s] of sources()) {
    if (f === 'src/ui.jsx') continue;
    // Les deux ordres d'écriture : un voile retourné ne passe pas dessous.
    for (const m of s.matchAll(/position: 'fixed', inset: 0\b|inset: 0, position: 'fixed'/g)) {
      voiles++;
      // Il se ferme : il reçoit onClose / onFermer, ou appelle close() / fermer().
      if (!/\bon(Close|Fermer)\b|\b(close|fermer)\(\)/.test(ouvrante(s, m.index))) continue;
      if (EXCEPTIONS[f]) assert.ok(EXCEPTIONS[f](s), f + ' : l’exception ne tient plus ce qu’une feuille promet (dialogue nommé, Échap, fond inerte)');
      else fautives.push(f + ':' + s.slice(0, m.index).split('\n').length);
    }
  }
  assert.ok(voiles >= 3, 'le balayage ne voit plus les plein-écran : il est cassé, et ce test toujours vert');
  assert.deepEqual(fautives, [], 'une modale faite main : rends-la dans <BottomSheet title=…>');
});

test('le navigateur de médias garde son retour, et la croix au bout de sa ligne', () => {
  // ASSERTION MODIFIÉE (chantier Médias, tâche 1 ; § 10) : le navigateur vit dans navigateurmedias.jsx, le morceau de la fiche d'un lecteur, chargé à la demande.
  const n = fonction(lire('src', 'navigateurmedias.jsx'), 'NavigateurMedias');
  assert.ok(n.includes('{pile.length > 1 && (') && n.includes("<button onClick={remonter} aria-label={tr('Revenir')} style={btnRond}>"), 'le retour a disparu');
  assert.ok(n.includes('<CroixFeuille />'));
});

test('chaque feuille dit son nom : sa ligne de titre, ou NomFeuille posé sur le sien', () => {
  /* Audit du 03/10. `BottomSheet` pose toujours `aria-labelledby` vers un id
   * que seules `TitreFeuille` et `FicheEntete` portaient. Dix-huit feuilles
   * bâtissent leur en-tête à la main — la recherche, les fiches d'un capteur,
   * d'un lecteur, d'un appareil, d'un robot, l'agenda, l'assistant… — et
   * s'annonçaient « dialogue », sans nom : le contrôle de la croix, juste
   * au-dessus, les laissait passer, elles ont toutes la leur. */
  const sans = [];
  for (const [f, s] of sources()) {
    let i = s.indexOf('<BottomSheet');
    while (i >= 0) {
      const fin = s.indexOf('</BottomSheet>', i);
      const bloc = s.slice(i, fin < 0 ? undefined : fin);
      const ouverture = s.slice(i, s.indexOf('\n', i));
      // ASSERTION MODIFIÉE (chantier Lumières, tâche 8) : la fiche d'une lumière, chargée à la demande, porte son nom (EnteteFiche).
      // ASSERTION MODIFIÉE (passe téléphone, corrections bis, point 1) : la coquille d'un lecteur garde le BottomSheet (App.jsx) ; son contenu, chargé à la demande, porte son nom (NomFeuille, fichemedia.jsx).
      // Le nom du contenu ne vaut que pour la COQUILLE : le nom de ce lecteur est lu DANS fichemedia.jsx, plus bas (corrections bis 2, point 2).
      // ASSERTION MODIFIÉE (chantier Capteurs, tâche 6) : la fiche d'une mesure, chargée à la demande, porte son nom (EnteteFiche).
      // ASSERTION MODIFIÉE (chantier Capteurs, correction bis, point 3) : les contenus d'un capteur binaire et de la fiche de confort d'une pièce portent leur nom, lu plus bas.
      // ASSERTION MODIFIÉE (chantier Capteurs, étapes 2 et 3, tâche 5 ; C27) : la popup d'un groupe porte son nom dans son contenu (EnteteFiche, fichegroupe.jsx).
      // ASSERTION MODIFIÉE (chantier Mode enfant, tâche 5 ; E19) : la feuille « Réglages parent » se nomme dans son contenu (`ContenuEnfant`, par l'en-tête commun qui porte NomFeuille), lu plus bas.
      // ASSERTION MODIFIÉE (passe bis du 17/10, point 10) : ce BottomSheet est la coquille `FicheEnfant` de fichemedia.jsx ; le contenu, à la demande, porte toujours le nom.
      // ASSERTION MODIFIÉE (audit des prises, 19/10) : la feuille d'un switch ordinaire garde sa coquille (App.jsx) ; son contenu, chargé à la
      // demande (ficheswitch.jsx), porte sa croix et son nom par l'en-tête des fiches (`FicheEntete`, passé dans ses briques), lu plus bas.
      // ASSERTION MODIFIÉE (boot, 19/10) : la feuille du Calendrier garde sa coquille (App.jsx) ; son contenu, chargé à la demande
      // (feuillecalendrier.jsx), porte son nom (`NomFeuille` sur le mois), lu DANS son module, plus bas.
      // ASSERTION MODIFIÉE (étape 3 IoT, 25/10 ; I27) : la popup d'une vanne : son contenu (`ContenuVanne`, fichevanne.jsx) porte l'en-tête commun — sa croix et son nom (`EnteteFiche`).
      if (!/<TitreFeuille|<FicheEntete|<NomFeuille|<ContenuEnfant|<FicheRobotContent|<FicheDistributeurContent|<FicheChauffageContent|<FicheVoletContent|<FichePriseContent|<FicheLumiereContent|<FicheMediaContent|<FicheMeteoContenu|<FicheCapteurContent|<FicheBinaireContent|<FicheConfortContent|<FichePlanteContent|<FicheGroupeContent|<FicheSwitchContent|<FeuilleCalendrierContent|<ContenuVanne/.test(bloc) && !/ title=\{/.test(ouverture)) sans.push(f + ':' + s.slice(0, i).split('\n').length);
      i = s.indexOf('<BottomSheet', i + 1);
    }
  }
  assert.deepEqual(sans, [], 'une feuille s’annonce « dialogue », sans nom');
  /* La fiche du robot se nomme DANS son contenu, chargé à la demande : ses
   * deux en-têtes — le robot, et « ne répond plus » — portent le nom. */
  /* ASSERTION MODIFIÉE (chantier IoT, tâche 8, 18/10 ; I15) : ses deux en-têtes sont l'en-tête commun (`EnteteFiche`, qui porte
   * NomFeuille : vérifié juste dessous) ; la carte du logement, sa seconde feuille, se nomme par sa ligne de titre. */
  const robot = lire('src', 'ficherobot.jsx');
  const contenu = robot.slice(robot.indexOf('export default function FicheRobotContent('));
  assert.equal((contenu.match(/<EnteteFiche /g) || []).length, 2, 'un en-tête de la fiche du robot ne nomme plus sa feuille');
  assert.ok(contenu.includes("<TitreFeuille style={{ fontSize: 19, fontWeight: 700 }}>{tr('Carte du logement')}</TitreFeuille>"), 'la carte du logement ne se nomme plus');
  /* La fiche du distributeur aussi (ADR 0155, 05/10) : son seul en-tête,
   * EnteteFiche, porte le nom — réglages compris, et en panne. */
  const commune = lire('src', 'fichecommune.jsx');
  const t = commune.slice(commune.indexOf('export function EnteteFiche('), commune.indexOf('\n}\n', commune.indexOf('export function EnteteFiche(')));
  assert.equal((t.match(/<NomFeuille>/g) || []).length, 1, 'l’en-tête de la fiche du distributeur ne nomme plus sa feuille');
  assert.equal((lire('src', 'fichedistributeur.jsx').match(/<EnteteFiche /g) || []).length, 1, 'un second en-tête, sans nom, dans la fiche du distributeur');
  // La fiche d'un chauffage aussi (plan 2 du chantier Chauffage, tâche 8) : un seul en-tête, EnteteFiche.
  assert.equal((lire('src', 'fichechauffage.jsx').match(/<EnteteFiche /g) || []).length, 1, 'un second en-tête, sans nom, dans la fiche du chauffage');
  // La fiche d'un volet aussi (plan 2 du chantier Volets, tâche 10).
  assert.equal((lire('src', 'fichevolet.jsx').match(/<EnteteFiche /g) || []).length, 1, 'un second en-tête, sans nom, dans la fiche du volet');
  // La fiche d'une mesure aussi (chantier Capteurs, tâche 6) : un seul en-tête, EnteteFiche.
  // ASSERTION MODIFIÉE (chantier Capteurs, étapes 2 et 3, tâche 4 ; C26) : deux fiches dans le module, un en-tête chacune — la mesure et le binaire.
  assert.equal((lire('src', 'fichecapteur.jsx').match(/<EnteteFiche /g) || []).length, 2, 'un second en-tête, sans nom, dans la fiche d’une mesure ou d’un binaire');
  // ASSERTION MODIFIÉE (chantier Médias, tâche 6 ; M12) : la fiche d'un lecteur se nomme par l'en-tête commun, un seul.
  assert.equal((lire('src', 'fichemedia.jsx').match(/<EnteteFiche /g) || []).length, 1, 'un second en-tête, sans nom, dans la fiche d’un lecteur');
  // ASSERTION AJOUTÉE (chantier Capteurs, correction bis, points 3 et 16) : une lumière et une prise (EnteteFiche), un capteur binaire (FicheEntete), la fiche de confort d'une pièce (NomFeuille).
  // ASSERTION MODIFIÉE (chantier Capteurs, étapes 2 et 3, tâche 4 ; C26) : le capteur binaire se nomme par l'en-tête commun.
  // ASSERTION MODIFIÉE (chantier Mode enfant, tâche 5 ; E19) : la feuille « Réglages parent » (ficheenfant.jsx), un seul en-tête commun.
  // ASSERTION MODIFIÉE (boot, 19/10) : la feuille du Calendrier (feuillecalendrier.jsx), sortie d'App.jsx — `NomFeuille` sur le mois, inchangé.
  for (const [module, nom] of [['fichelumiere.jsx', '<EnteteFiche '], ['ficheprise.jsx', '<EnteteFiche '], ['fichecapteur.jsx', '<EnteteFiche nom={a.friendly_name || id}'], ['ficheconfort.jsx', '<NomFeuille>'], ['fichegroupe.jsx', '<EnteteFiche '], ['ficheswitch.jsx', '<FicheEntete titre={nom}'], ['ficheplante.jsx', '<EnteteFiche '], ['ficheenfant.jsx', '<EnteteFiche '], ['feuillecalendrier.jsx', '<NomFeuille>']]) {
    assert.equal(lire('src', module).split(nom).length - 1, 1, module + ' : sa feuille ne se nomme plus (' + nom + ')');
  }
});

test('NomFeuille pose l’id sur le titre existant, et ne dessine rien', async () => {
  const debut = UI.indexOf('export function NomFeuille(');
  assert.ok(debut >= 0, 'NomFeuille a disparu');
  const n = UI.slice(debut, UI.indexOf('\n}\n', debut) + 2);
  assert.ok(n.includes('const idTitre = useIdTitreFeuille();') && n.includes('cloneElement(Children.only(children), { id: idTitre || undefined })'),
    'NomFeuille ne pose plus l’id sur son enfant');
  assert.ok(!n.includes('CroixFeuille') && !n.includes('<div') && !n.includes('<span'),
    'NomFeuille dessine quelque chose : une boîte autour du titre, ou une seconde croix sur la ligne');
  /* Le crochet ne s'appelle que DANS une feuille. Appelé dans le composant qui
   * rend `BottomSheet`, il lirait le contexte d'AU-DESSUS : aucun id, aucun
   * nom — et rien à l'écran pour s'en apercevoir. */
  const appels = [];
  for (const [f, s] of sources()) {
    const k = (s.match(/useIdTitreFeuille\(\)/g) || []).length;
    if (k) appels.push(f + ' × ' + k);
  }
  assert.deepEqual(appels.sort(), ['src/App.jsx × 1', 'src/ui.jsx × 3'],
    'le crochet du nom est appelé ailleurs que dans TitreFeuille, FicheEntete et NomFeuille');
  // Une ligne de titre qui s'en va rend l'id : celle qui la remplace le reprend.
  assert.ok(UI.includes('rendre: (jeton) => { if (prisPar.current === jeton) prisPar.current = null; },')
    && UI.includes('return () => { if (ctx) ctx.rendre(moi); };'),
    'un titre démonté garde l’id : celui qui le remplace ne nomme plus la feuille');
  // Au rendu : l'enfant sort tel quel — ni boîte autour, ni croix à côté.
  const { composant, rendre } = await import('./rendu.mjs');
  const { createElement } = await import('react');
  const NomFeuille = await composant('ui.jsx', 'NomFeuille');
  assert.equal(rendre(NomFeuille, { children: createElement('span', null, 'Salon') }), '<span>Salon</span>');
});
