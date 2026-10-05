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
      if (!/<CroixFeuille|<TitreFeuille|<FicheEntete|<FicheRobotContent|<FicheDistributeurContent/.test(bloc) && !/ title=\{/.test(ouverture)) sans.push(f + ':' + s.slice(0, i).split('\n').length);
      i = s.indexOf('<BottomSheet', i + 1);
    }
  }
  assert.deepEqual(sans, [], 'une feuille n’a plus de croix');
  // L'en-tête des fiches : l'épingle, puis la croix.
  const e = fonction(APP, 'FicheEntete');
  assert.ok(e.indexOf('<BoutonEpingle id={id} />') >= 0 && e.indexOf('<BoutonEpingle id={id} />') < e.indexOf('<CroixFeuille />'), 'la croix n’est plus en dernier');
  // La fiche du robot : l'épingle, la roue, puis la croix — sur la même ligne.
  const robot = lire('src', 'ficherobot.jsx');
  const r = robot.slice(robot.indexOf("onClick={() => setOnglet('reglages')} aria-label={tr('Réglages')}"));
  assert.ok(r.indexOf('<CroixFeuille />') > 0 && r.indexOf('<CroixFeuille />') < r.indexOf('\n      </div>'), 'la croix du robot a quitté la ligne de la roue');
  // La fiche du distributeur (ADR 0155, 05/10) : son en-tête vient du socle commun — l'épingle, la roue, puis la croix.
  const commune = lire('src', 'fichecommune.jsx');
  const t = commune.slice(commune.indexOf('export function EnteteFiche('), commune.indexOf('\n}\n', commune.indexOf('export function EnteteFiche(')));
  assert.ok(t.indexOf('{!enReglages && epingle}') > 0 && t.indexOf("aria-label={tr('Réglages')}") > t.indexOf('{!enReglages && epingle}')
    && t.indexOf('<CroixFeuille />') > t.indexOf("aria-label={tr('Réglages')}"), 'la croix du distributeur a quitté la fin de sa ligne');
  assert.ok(lire('src', 'fichedistributeur.jsx').includes('<EnteteFiche nom={nom}'), 'la fiche du distributeur a perdu l’en-tête commun');
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
  assert.deepEqual(croix.sort(), ['src/agendarail.jsx × 1', 'src/formevenement.jsx × 1', 'src/rappelsrail.jsx × 1', 'src/ui.jsx × 1']);
  const rap = readFileSync(join(RACINE, 'src', 'rappelsrail.jsx'), 'utf8');
  assert.ok(rap.includes("<button onClick={onClose} aria-label={tr('Fermer')}"), 'la croix du formulaire de rappel');
  assert.ok(APP.includes("<button aria-label={tr('Fermer') + ' ' + nom} title={tr('Fermer')} onClick={(e) => { e.stopPropagation(); setOv(0); commander(hass, id, 'close'); }}"), 'la commande du volet');
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
  const n = fonction(APP, 'NavigateurMedias');
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
      if (!/<TitreFeuille|<FicheEntete|<NomFeuille|<FicheRobotContent|<FicheDistributeurContent/.test(bloc) && !/ title=\{/.test(ouverture)) sans.push(f + ':' + s.slice(0, i).split('\n').length);
      i = s.indexOf('<BottomSheet', i + 1);
    }
  }
  assert.deepEqual(sans, [], 'une feuille s’annonce « dialogue », sans nom');
  /* La fiche du robot se nomme DANS son contenu, chargé à la demande : ses
   * deux en-têtes — le robot, et « ne répond plus » — portent le nom. */
  const robot = lire('src', 'ficherobot.jsx');
  const contenu = robot.slice(robot.indexOf('export default function FicheRobotContent('));
  assert.equal((contenu.match(/<NomFeuille>/g) || []).length, 2, 'un en-tête de la fiche du robot ne nomme plus sa feuille');
  /* La fiche du distributeur aussi (ADR 0155, 05/10) : son seul en-tête,
   * EnteteFiche, porte le nom — réglages compris, et en panne. */
  const commune = lire('src', 'fichecommune.jsx');
  const t = commune.slice(commune.indexOf('export function EnteteFiche('), commune.indexOf('\n}\n', commune.indexOf('export function EnteteFiche(')));
  assert.equal((t.match(/<NomFeuille>/g) || []).length, 1, 'l’en-tête de la fiche du distributeur ne nomme plus sa feuille');
  assert.equal((lire('src', 'fichedistributeur.jsx').match(/<EnteteFiche /g) || []).length, 1, 'un second en-tête, sans nom, dans la fiche du distributeur');
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
