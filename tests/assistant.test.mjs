// ─────────────────────────────────────────────────────────────────────────────
// Le bouton de l'assistant : deux gestes sur le même bouton.
//
// Appui COURT : la conversation écrite s'ouvre.
// Appui LONG  : l'orbe paraît en miniature contre le bouton et la voix
//               s'active — le geste du bouton d'accueil d'autrefois.
//
// Tout ce qui est vérifié ici casse EN SILENCE. Rien n'échoue, rien ne se
// plaint : le bouton répond toujours, et c'est la nuance qui disparaît.
//
//   • sans la garde du clic, chaque appui long ouvrirait AUSSI la conversation
//     par-dessus l'orbe — le navigateur envoie le `click` après le `pointerup`,
//     et rien dans l'événement ne dit combien de temps le doigt est resté posé ;
//   • sans la tolérance de dix pixels, tout début de défilement partant du
//     bouton appellerait la voix ;
//   • sans le relâchement au clavier, une frappe bien plus tard serait avalée
//     par un appui long terminé depuis longtemps ;
//   • si l'orbe cessait d'être demandée à la volée, Three.js entrerait dans le
//     premier chargement — 450 ko avant le premier pixel (`poids.test.mjs`
//     tient l'autre bout de cette corde) ;
//   • si le contexte cessait de passer `onAssistant`, l'assistant
//     disparaîtrait purement et simplement du poste fixe, où il n'y a pas de
//     barre du bas pour le porter ;
//   • et sans la règle CSS, le même geste aurait deux entrées sur le même
//     écran de téléphone.
//
// Mesuré le 09/09/2026 dans le navigateur : appui court → conversation ;
// maintien 380 ms → miniature de 96 px centrée sur le bouton, au-dessus dans
// la barre du bas, au-dessous dans l'en-tête ; relâchement → miniature partie
// et AUCUNE conversation ; glissement de 60 px → aucune miniature.
//
// La voix elle-même n'est pas branchée : ce fichier garde le geste et son
// retour visible, pas l'écoute.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const APP = readFileSync(join(SRC, 'App.jsx'), 'utf8');
const CSS = readFileSync(join(SRC, 'index.css'), 'utf8');

/** Le corps de `BoutonAssistant`, par équilibrage des accolades.
 *
 * Compter les lignes se tromperait, et chercher dans tout `App.jsx` mentirait
 * dans l'autre sens : « 380 » et « 35 » y vivent ailleurs, pour d'autres
 * gestes. Ce test doit parler de CE bouton.
 */
function corpsDuBouton() {
  const debut = APP.indexOf('function BoutonAssistant(');
  assert.notEqual(debut, -1, 'BoutonAssistant a disparu');
  // Après la parenthèse fermante, et non à la première accolade : celle-ci
  // ouvre la déstructuration des paramètres, et l'équilibrage s'arrêterait au
  // bout d'une ligne.
  let i = APP.indexOf('{', APP.indexOf(') {', debut));
  let n = 0;
  for (; i < APP.length; i += 1) {
    if (APP[i] === '{') n += 1;
    else if (APP[i] === '}') { n -= 1; if (n === 0) return APP.slice(debut, i + 1); }
  }
  throw new Error('accolade de fin introuvable');
}

const BOUTON = corpsDuBouton();

test('le bouton écoute le pointeur, pas seulement le clic', () => {
  // Sans `pointercancel`, un appel entrant ou un geste système laisserait la
  // voix active et l'orbe à l'écran, sans personne pour la refermer.
  for (const geste of ['onPointerDown:', 'onPointerMove:', 'onPointerUp:', 'onPointerCancel:']) {
    assert.ok(BOUTON.includes(geste), 'geste manquant : ' + geste);
  }
});

test('maintenir le bouton ne surligne pas le texte d’à côté', () => {
  /* `mousedown` a pour effet par défaut d'amorcer un glissement de sélection
   * dans le document. `user-select: none` sur le bouton empêche de
   * sélectionner SON contenu — pas de partir de lui pour surligner ce qu'il y
   * a autour : la date de l'en-tête, les étiquettes de la barre du bas.
   *
   * Le refuser coupe la sélection à la racine, et n'empêche ni le
   * `pointerdown` qui arme l'appui long, ni le `click` qui suit. */
  assert.match(BOUTON, /onMouseDown: \(e\) => e\.preventDefault\(\)/);
});

test('le clic qui suit un appui long n’ouvre pas la conversation', () => {
  assert.match(BOUTON, /onClick: \(\) => \{ if \(long\.current\) \{ long\.current = false; return; \} onAssistant\(\); \}/);
});

test('le clavier relâche le drapeau', () => {
  // Enter et Espace produisent un `click` sans `pointerdown` : sans ce
  // relâchement, le drapeau laissé par un appui long avalerait la frappe.
  assert.match(BOUTON, /onKeyDown: \(\) => \{ long\.current = false; \}/);
});

test('le seuil et la vibration sont ceux du reste du dashboard', () => {
  // 380 ms et 35 ms : les mêmes que la prise en main d'une section en mode
  // édition. Deux durées différentes pour le même geste se sentent.
  assert.match(BOUTON, /\}, 380\);/);
  assert.match(BOUTON, /navigator\.vibrate\(35\)/);
});

test('un début de défilement n’appelle pas la voix', () => {
  assert.match(BOUTON, /Math\.abs\(e\.clientX - depart\.current\.x\) > 10 \|\| Math\.abs\(e\.clientY - depart\.current\.y\) > 10/);
  assert.match(BOUTON, /clearTimeout\(minuteur\.current\);\s*\n\s*depart\.current = null;/);
});

test('la miniature sort du bon côté', () => {
  // Au-dessus quand le bouton est en bas de l'écran, au-dessous quand il est
  // dans l'en-tête. À contresens, elle sortirait de l'écran.
  assert.match(BOUTON, /bottom: sens === 'haut' \? '100%' : 'auto'/);
  assert.match(BOUTON, /top: sens === 'haut' \? 'auto' : '100%'/);
});

test('l’orbe n’est demandée qu’à l’appui', () => {
  // Un import statique la ferait entrer dans le premier chargement avec
  // Three.js derrière elle.
  assert.doesNotMatch(APP, /^import .*from '\.\/orbe\.jsx'/m);
  assert.match(APP, /const OrbeMini = lazy\(\(\) => import\('\.\/orbe\.jsx'\)\)/);
  // Et le téléchargement part dès l'appui : sinon elle arriverait après le seuil.
  assert.match(BOUTON, /import\('\.\/orbe\.jsx'\)\.catch\(/);
});

// ─────────────────────────────────────────────────────────────────────────────
// La feuille de l'assistant renonce au verre depoli.
//
// Le canevas WebGL est promu en couche de composition a part, et le flou
// d'arriere-plan ne s'applique pas sous elle : on voit le tableau de bord NET
// dans la boite exacte du canevas — un carre autour de l'orbe.
//
// Mesure du 09/09/2026, thème Frosted Glass : filtre retire, carre disparu ;
// filtre deplace dans une couche fille, carre toujours la ; `will-change:
// backdrop-filter`, carre toujours la. Il n'y a pas d'astuce CSS — tant qu'un
// fond translucide se trouve derriere le canevas, sa boite se voit.
//
// La couleur, elle, ne change pas : `--o-surfA` posee sur une base pleine
// donne exactement la teinte qu'elle avait sur fond sombre.
// ─────────────────────────────────────────────────────────────────────────────

const UI = readFileSync(join(SRC, 'ui.jsx'), 'utf8');
const FEUILLE = readFileSync(join(SRC, 'views', 'assistant.jsx'), 'utf8');

test('la feuille qui porte l’orbe est opaque', () => {
  assert.match(FEUILLE, /<BottomSheet onClose=\{onClose\} opaque>/,
    'sans `opaque`, le carre revient sous le theme Frosted Glass');
  assert.match(UI, /export function BottomSheet\(\{ onClose, children, opaque = false \}\)/);
  assert.match(UI, /background: opaque \? 'linear-gradient\(var\(--o-surfA\), var\(--o-surfA\)\), var\(--o-bg\)' : 'var\(--o-surfA\)'/);
  assert.match(UI, /className=\{opaque \? 'o-sheet o-sheet-opaque' : 'o-sheet'\}/);
  // Et la regle qui desarme le flou du theme, sans quoi la classe ne sert a rien.
  assert.match(CSS, /html\.loggia-frosted \.o-sheet-opaque \{ -webkit-backdrop-filter: none; backdrop-filter: none; \}/);
});

// ─────────────────────────────────────────────────────────────────────────────
// Le poste fixe.
//
// La barre du bas n'existe qu'en dessous de 820 px, ou sur un écran tactile.
// Au-dessus, sans entrée dans l'en-tête, l'assistant n'existe pas du tout.
// ─────────────────────────────────────────────────────────────────────────────

test('l’en-tête reçoit de quoi ouvrir l’assistant', () => {
  assert.match(APP, /onAssistant: assistantNs \? \(\) => setAssistantOuvert\(true\) : null/,
    'le contexte ne passe plus `onAssistant` : l’assistant disparaît du poste fixe');
  assert.match(APP, /rooms = \[\], onAssistant = null, onDictee = null, hass: hassCtx = null \} = ctx;/,
    'l’en-tête ne lit plus ce qu’il faut pour ouvrir ni pour dicter');
  assert.match(APP, /\{onAssistant && <BoutonAssistant onAssistant=\{onAssistant\} onDictee=\{onDictee\} hass=\{hassCtx\} sens="bas" variante="entete" \/>\}/);
});

// ─────────────────────────────────────────────────────────────────────────────
// La voix.
//
// L'assistant ne transcrit pas : sa commande `chat` ne prend que du texte, et
// son `identity/voice` sert aux empreintes vocales. C'est le pipeline Assist de
// Home Assistant qui écoute, et Loggia qui lui passe le son — voir `voix.js`.
//
// L'appui long écoute AVANT que la conversation existe. La phrase dictée doit
// donc attendre quelque part, et partir une seule fois : deux rendus de suite
// l'enverraient deux fois, et l'assistant répondrait en double.
// ─────────────────────────────────────────────────────────────────────────────

const VOIX = readFileSync(join(SRC, 'voix.js'), 'utf8');

test('le module d’écoute reste hors du paquet d’amorçage', () => {
  // Il ouvre un micro, un contexte audio et un pipeline. Rien de tout cela ne
  // doit être analysé par quelqu'un qui vient juste regarder ses lumières.
  assert.doesNotMatch(APP, /^import .*from '\.\/voix\.js'/m);
  assert.match(BOUTON, /import\('\.\/voix\.js'\)\.then\(/);
});

test('l’appui long écoute vraiment', () => {
  assert.match(BOUTON, /voixMod\.ecouter\(hass, \{ onNiveau: setNiveau \}\)/);
  // Le doigt peut repartir pendant que le micro s'ouvre : sans cette garde, le
  // micro resterait ouvert après le relâchement.
  assert.match(BOUTON, /if \(!long\.current\) \{ s2\.annuler\(\); return; \}/);
  // Relâcher ferme le son, pas la transcription : la phrase arrive après.
  assert.match(BOUTON, /session\.current\.arreter\(\)/);
  assert.match(BOUTON, /<OrbeMini etat="listening" niveau=\{niveau\} taille=\{ORBE_MINI\} \/>/);
});

test('la phrase dictée traverse jusqu’à la conversation', () => {
  assert.match(APP, /const poserQuestion = \(dit\) => \{ setQuestionVocale\(dit\); setAssistantOuvert\(true\); \};/);
  assert.match(APP, /<AssistantSheet hass=\{hass\} ns=\{assistantNs\} question=\{questionVocale\}/);
  // Fermer efface la question : sans cela, rouvrir la popup la reposerait.
  assert.match(APP, /setAssistantOuvert\(false\); setQuestionVocale\(''\);/);
  assert.match(FEUILLE, /export default function AssistantSheet\(\{ hass, ns, onClose, question = '' \}\)/);
  assert.match(FEUILLE, /if \(posee\.current \|\| !question \|\| !ws\) return;\s*\n\s*posee\.current = true;/);
});

test('le micro ne s’affiche que s’il peut servir', () => {
  // Mesuré : en HTTP local, `isSecureContext` est faux et `mediaDevices` vaut
  // `undefined`. Un bouton posé là n'aurait rien pu faire.
  assert.match(VOIX, /if \(!window\.isSecureContext\) return \{ ok: false, raison: 'https' \};/);
  assert.match(FEUILLE, /const micro = voixDisponible\(\);/);
  assert.match(FEUILLE, /\{micro\.ok && \(/);
});

test('le son part au format que le pipeline attend', () => {
  // Mono, 16 kHz, entiers 16 bits signés, précédés de l'identifiant de canal.
  assert.match(VOIX, /const TAUX = 16000;/);
  assert.match(VOIX, /input: \{ sample_rate: TAUX \}/);
  assert.match(VOIX, /trame\[0\] = idBinaire;/);
  // La trame vide — l'identifiant seul — dit « c'est fini ».
  assert.match(VOIX, /socket\.send\(new Uint8Array\(\[idBinaire\]\)\)/);
});

test('le pipeline choisi sait transcrire', () => {
  /* Relevé sur l'installation : le pipeline nommé « Home Assistant » n'a AUCUN
   * moteur de transcription, et deux autres en ont un. Prendre le préféré sans
   * regarder aurait donné un pipeline muet et une erreur incompréhensible. */
  assert.match(VOIX, /tous\.filter\(\(p\) => p && p\.stt_engine\)/);
  assert.match(VOIX, /if \(!equipes\.length\) return null;/);
});

test('la reponse se dit quand la question etait parlee', () => {
  /* Et seulement dans ce cas. Faire parler la maison parce qu'on a ecrit une
   * phrase serait une surprise, et une mauvaise. */
  assert.match(FEUILLE, /const envoyerTexte = async \(brut, \{ parle = false \} = \{\}\) => \{/);
  assert.match(FEUILLE, /vocalRef\.current = parle;/);
  assert.match(FEUILLE, /if \(dit\) envoyerTexte\(dit, \{ parle: true \}\);/);
  assert.match(FEUILLE, /envoyerTexte\(question, \{ parle: true \}\);/);
  assert.match(FEUILLE, /if \(vocalRef\.current\) dire\(reponseRef\.current\); else setEtat\('idle'\);/);
  // Le texte parle vient d'une reference, pas de l'etat : lu au `done`,
  // l'etat rendrait la valeur du rendu precedent.
  assert.match(FEUILLE, /reponseRef\.current \+= evt\.text \|\| '';/);
});

test('la voix vient du composant, pas d une URL bricolee', () => {
  // `speak` synthetise cote serveur et rend une URL de meme origine : pas de
  // jeton a manipuler dans la popup.
  assert.match(FEUILLE, /ws\.callWS\(\{ type: `\$\{ns\}\/speak`, text: t \}\)/);
  assert.match(FEUILLE, /const parti = await jouer\(r\.url, \(\) => setEtat\('idle'\)\);/);
  // Sans voix configuree la commande echoue : la reponse doit rester lisible.
  assert.match(FEUILLE, /\} catch \{[\s\S]{0,60}setEtat\('idle'\);/);
});

test('la voix se tait avec la popup', () => {
  /* TROIS fois, et il faut les compter — le même piège que pour le micro.
   *
   * `dire()` coupe la phrase précédente avant d'en commencer une nouvelle, et
   * le nettoyage coupe tout à la fermeture. Une seule expression, sans
   * compter, se satisfaisait de celle de `dire` : retirer celle du nettoyage
   * laissait l'assistant finir sa phrase alors que la conversation était
   * fermée, et le test ne bronchait pas. Constaté en mutant ce test.
   *
   * La troisième est celle d'« Arrêter » : le bouton restait affiché pendant
   * qu'elle parlait, et n'y faisait rien. */
  const coupures = FEUILLE.split('couperLecture();').length - 1;
  assert.equal(coupures, 3, 'la voix doit se couper avant une nouvelle phrase, à la fermeture ET sur « Arrêter »');
});

// ─────────────────────────────────────────────────────────────────────────────
// Le mobile, où rien de tout cela ne marchait.
//
// Deux règles que seul le téléphone applique vraiment, et qui rendaient la voix
// muette sans qu'aucune erreur ne paraisse nulle part.
//
//   • un contexte audio y naît SUSPENDU. Le geste a déjà servi à demander le
//     micro, et `onaudioprocess` ne part jamais : on capte, on n'envoie rien,
//     Home Assistant ne transcrit rien, l'assistant ne répond pas ;
//   • un élément audio ne démarre que s'il a été débloqué PAR un geste. La
//     réponse arrive des secondes plus tard : trop tard pour demander.
//
// Sur un poste fixe les deux passent — le contexte démarre actif, et le
// navigateur finit par autoriser la lecture au vu de l'usage du site. D'où un
// défaut qui ne se voyait que sur téléphone.
// ─────────────────────────────────────────────────────────────────────────────

test('le contexte audio est réveillé avant de capter', () => {
  assert.match(VOIX, /if \(ctx\.state === 'suspended'\) \{ try \{ await ctx\.resume\(\); \}/);
  // Et s'il refuse de se réveiller, on le DIT plutôt que de capter dans le vide.
  assert.match(VOIX, /throw new Error\('suspendu'\);/);
  assert.match(VOIX, /raison === 'suspendu'/);
});

test('la lecture se débloque pendant le geste, jamais après', () => {
  // Les deux gestes qui mènent à une réponse parlée : le micro du champ de
  // saisie, et le maintien du bouton.
  assert.match(FEUILLE, /preparerLecture\(\);/);
  assert.match(BOUTON, /voixMod\.preparerLecture\(\);/);
  assert.match(VOIX, /const SILENCE = 'data:audio\/wav;base64,/);
  /* Et la lecture RÉUTILISE l'élément débloqué : elle lui pose une adresse.
   *
   * En construire un neuf pour chaque réponse annulerait tout le mécanisme —
   * le nouveau n'aurait jamais été touché par un geste, et le navigateur le
   * refuserait. C'est le seul point qui compte vraiment ici. */
  assert.match(VOIX, /lecteur\.src = url;/);
  assert.doesNotMatch(VOIX, /new Audio\(url\)/);
  assert.doesNotMatch(FEUILLE, /new Audio\(/,
    'la popup ne doit plus fabriquer son propre élément audio');
});

test('un refus de lecture ne laisse pas la conversation figée', () => {
  // `jouer` rend faux : sans ce retour, l'orbe resterait en « parle » pour
  // toujours et le champ de saisie serait bloque.
  assert.match(VOIX, /return false;      \/\/ autoplay refuse/);
  assert.match(FEUILLE, /if \(!parti\) setEtat\('idle'\);/);
});

test('le micro se referme toujours', () => {
  // Un micro laissé ouvert allume la pastille rouge de l'onglet, et l'y laisse.
  // La forme du nettoyage a change quand la voix s'y est ajoutee : on vise ce
  // qu'il FAIT, pas comment il est ecrit sur une ligne ou sur quatre.
  assert.match(FEUILLE, /if \(sessionRef\.current\) \{ try \{ sessionRef\.current\.annuler\(\); \}/);
  assert.match(BOUTON, /if \(session\.current\) \{ try \{ session\.current\.annuler\(\); \}/);
  /* DEUX fois, et il faut les compter.
   *
   * `ranger()` libère quand tout se termine, `arreter()` quand on coupe court
   * avant la transcription. Une seule expression, sans compter, se satisfaisait
   * de l'une ou de l'autre : retirer celle de `ranger` — le chemin normal —
   * passait sans un mot. Constaté en mutant ce test le 09/09/2026. */
  const relaches = VOIX.split('flux.getTracks().forEach((t) => t.stop());').length - 1;
  assert.equal(relaches, 3,
    'le micro doit être relâché à la fermeture, à l’arrêt, ET si le contexte audio refuse de se réveiller');
});

/** Le contenu d'un bloc `@media`, par équilibrage des accolades.
 *
 * Chercher `.o-hdr-assist` dans TOUT le fichier ne prouverait rien : la règle
 * tactile porte le même sélecteur, et une expression qui les confond passe
 * alors que la moitié du garde-fou a disparu. C'est arrivé — la première
 * version de ce test laissait retirer la règle des 820 px sans broncher.
 */
function blocMedia(requete) {
  const debut = CSS.indexOf(requete);
  assert.notEqual(debut, -1, 'bloc absent : ' + requete);
  let i = CSS.indexOf('{', debut);
  let n = 0;
  for (; i < CSS.length; i += 1) {
    if (CSS[i] === '{') n += 1;
    else if (CSS[i] === '}') { n -= 1; if (n === 0) return CSS.slice(debut, i + 1); }
  }
  throw new Error('accolade de fin introuvable : ' + requete);
}

test('un seul bouton d’assistant par écran', () => {
  // Les deux règles ensemble : la largeur ET le tactile, exactement là où la
  // barre du bas paraît. Une seule des deux laisserait le doublon — sur une
  // tablette large pour l'une, sur un téléphone pour l'autre.
  const etroit = blocMedia('@media (max-width: 820px)');
  assert.match(etroit, /\.loggia-mobilenav \{ display: flex !important; \}/,
    'ce bloc n’est plus celui qui montre la barre du bas');
  assert.match(etroit, /\.o-hdr-assist \{ display: none !important; \}/,
    'sous 820 px, la barre du bas et l’en-tête offriraient deux fois le même geste');
  assert.match(CSS, /html\.loggia-tactile \.o-hdr-assist \{ display: none !important; \}/,
    'sur un écran tactile large, le doublon revient');
  const tactile = CSS.indexOf('html.loggia-tactile .loggia-mobilenav');
  const tactileAssist = CSS.indexOf('html.loggia-tactile .o-hdr-assist');
  assert.ok(tactile !== -1 && tactileAssist > tactile,
    'la règle tactile de l’en-tête doit accompagner celle de la barre du bas');
});
