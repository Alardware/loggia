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
  assert.ok(fiche.includes('<CameraTile c={tuileCamera({ name: nom, haid, online, evenement }, 0, hass)} agrandir={false} />'), 'la tuile de l’Accueil, sans agrandissement (et son dernier evenement, ADR 0031)');
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
  // Depuis le 26/09, une icone CHOISIE a la main passe devant (`iconeChoisie`)
  // — sans rien changer d'autre. Le defaut, lui, n'a pas bouge.
  assert.ok(carte.includes("const ico = iconeChoisie(id) || (dom === 'camera' ? 'camera' : carteDePrise ? tp.ico : cvIcoEntite(dom, id, st, nom));"), 'appareil photo dans le carre, camera video en repere');
  assert.ok(carte.includes("RM_ICO(allume ? icoFond : 'var(--o-s1)', allume ? icoTexte : 'var(--o-text3)')"), 'la teinte de l’icone suit allume');
  assert.ok(carte.includes("color: direct ? icoTexte : 'var(--o-text3)'"), 'le repere en haut a droite aussi');
  // Le lavis suit toujours `allume` — une prise EN VEILLE fait seule exception
  // depuis le 26/09 : elle est allumee, mais elle ne travaille pas.
  assert.ok(carte.includes('(allume && LAVIS && (!carteDePrise || priseVive))'), 'le lavis suit allume, donc la camera en direct');
});

test('l’Accueil et la fiche dessinent la meme tuile camera', () => {
  assert.ok(src.includes('a.cams.map((cam, i) => tuileCamera({ ...cam, evenement: evenementDe(cam.haid) }, i, a.hass))'), 'l’Accueil passe par tuileCamera, avec le dernier evenement de chaque camera');
  const d = src.indexOf('function tuileCamera(');
  const corps = src.slice(d, src.indexOf('\n}', d));
  assert.ok(corps.includes('cle: cleCamera(cam, i)'), 'la cle de la tuile reste celle de cleCamera');
  // Depuis l'ADR 0031, la sous-ligne (Direct, Hors ligne, en cours, dernier
  // evenement) vit dans `sousCamera`, partagee avec la vue Securite.
  const dS = src.indexOf('function sousCamera(');
  const sous = src.slice(dS, src.indexOf(String.fromCharCode(10) + '}', dS));
  assert.ok(dS >= 0 && sous.includes("tr('Direct')") && sous.includes("tr('Hors ligne')") && corps.includes('sub: sousCamera(cam.online, cam.evenement || null),'), 'le point d’etat parle la langue du moment');
  assert.ok(src.includes('function CameraTile({ c, agrandir = true })'), 'la tuile sait se passer de son bouton');
  assert.ok(src.includes('{live && agrandir && ('), 'le bouton d’agrandissement ne s’affiche que si on le demande');
});

test('changer de camera pendant la negociation ne laisse pas d’abonnement derriere', () => {
  // Audit du 27/09. `startRtc` attend trois fois avant de tenir son
  // abonnement : `iceServers`, `createOffer`, `setLocalDescription`, puis
  // `subscribeMessage`. La garde existait déjà après la configuration ICE —
  // son commentaire explique même le piège — mais pas après l'abonnement.
  //
  // Si l'on change de caméra entre-temps, le nettoyage de l'effet appelle
  // `cleanupRtc` alors que `unsub` vaut encore `null` : il ne ferme que `pc`.
  // L'abonnement arrive ensuite, et plus personne ne le fermera. Un passage
  // rapide d'une caméra à l'autre en laissait un par passage — côté client
  // comme, possiblement, côté Home Assistant.
  const cam = readFileSync(join(RACINE, 'src', 'camera.jsx'), 'utf8');
  const i = cam.indexOf("{ type: 'camera/webrtc/offer'");
  assert.notEqual(i, -1, 'la négociation WebRTC a disparu');
  const apres = cam.slice(i, i + 1200);
  assert.match(apres, /if \(cancelled\) \{/,
    'plus de garde après l’abonnement : il survivra au changement de caméra');
  assert.match(apres, /try \{ unsub\(\); \}/, 'la garde ne ferme plus l’abonnement');
  assert.match(apres, /try \{ pc\.close\(\); \}/, 'la garde ne ferme plus la connexion');
  // `cleanupRtc` a pu être remis à `null` entre-temps : on ne s'appuie pas sur
  // lui, on ferme les deux à la main.
  assert.ok(!/if \(cancelled\) \{\s*cleanupRtc\(\)/.test(apres),
    'la garde repasse par `cleanupRtc`, qui peut déjà être à `null`');
});

test('le direct ne repart pas parce que le jeton a change', () => {
  /* La camera murale devenait noire toutes les demi-heures environ (audit du
   * 29/09). Ce n'etait ni le reseau ni la camera : Home Assistant renouvelle
   * son jeton d'acces, `token` figurait dans les dependances de l'effet, et
   * TOUTE la negociation WebRTC recommencait — session fermee, piste perdue,
   * ecran noir le temps d'en rouvrir une.
   *
   * L'effet ne se sert jamais de la VALEUR du jeton : il verifie seulement
   * qu'on est authentifie. Une dependance sur un booleen suffit, et elle ne
   * bascule qu'a la connexion ou a la deconnexion. */
  const cam = readFileSync(join(RACINE, 'src', 'camera.jsx'), 'utf8');
  assert.ok(cam.includes('const authentifie = !!token;'), 'le jeton n’est plus reduit a « authentifie ou pas »');
  // `regardee` s'y ajoute (lot 14 de l'audit du 03/10) : un booleen, lui aussi.
  assert.ok(cam.includes('}, [haid, online, authentifie, conn, regardee]);'), 'le direct depend a nouveau de la valeur du jeton');
  assert.ok(!/\}, \[[^\]]*\btoken\b[^\]]*\]/.test(cam), 'un effet depend encore de la valeur du jeton');

  /* La vignette, elle, a besoin du jeton COURANT pour signer son appel : il se
   * lit dans une reference au moment du `fetch`, ce qui la laisse hors des
   * dependances sans jamais envoyer un jeton perime. */
  assert.ok(cam.includes('jeton.current = token;') && cam.includes('Bearer ${jeton.current}'),
    'la vignette n’envoie plus le jeton courant');
  assert.ok(cam.includes('}, [haid, authentifie, refreshMs, kind, regardee]);'), 'la boucle de vignette repart sur chaque renouvellement');
});

test('« Absent » se traduit, comme « Présent » juste à côté', () => {
  /* Quatre endroits ecrivaient `tr('Présent') : 'Absent'` : le premier mot
   * traduit, le second en clair. Le filet i18n ne les voyait pas — ce sont des
   * expressions, pas des noeuds de texte JSX (audit du 29/09). */
  assert.ok(!/tr\('Présent'\)\s*:\s*'Absent'/.test(src), 'un « Absent » est reste en clair');
  assert.equal((src.match(/tr\('Absent'\)/g) || []).length >= 4, true, 'les quatre « Absent » ne passent plus par tr()');
});
