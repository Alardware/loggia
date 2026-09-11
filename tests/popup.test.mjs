// ─────────────────────────────────────────────────────────────────────────────
// La popup de l'assistant, depuis 09/2026 : l'écran « Parler » de la maquette
// Sentinel Mobile, et le choix de l'entité de conversation.
//
// L'orbe au centre, la phrase dessous, le gros micro, les suggestions ; la
// conversation monte en feuille par-dessus. Ce qui suit casse sans bruit :
// l'écran s'affiche toujours, c'est une nuance qui s'en va.
//
// Le geste du bouton et la voix elle-même sont gardés par `assistant.test.mjs`.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const FEUILLE = readFileSync(join(SRC, 'views', 'assistant.jsx'), 'utf8');
const VOIX = readFileSync(join(SRC, 'voix.js'), 'utf8');
const ASSIST = readFileSync(join(SRC, 'assistant.js'), 'utf8');
const EN = readFileSync(join(SRC, 'langues', 'en.js'), 'utf8');

test('le sous-titre suit l’écoute', () => {
  // Il restait sur « Prête » micro ouvert : l'écoute se suit par `ecoute`, et
  // `etat` ne la connaît pas.
  assert.ok(FEUILLE.includes("const etiquette = ecoute ? tr('Écoute…')"),
    'micro ouvert, le sous-titre ne dit plus qu’elle écoute');
});

test('« Arrêter » fait taire la voix', () => {
  /* Le bouton restait affiché pendant qu'elle parlait, et n'y faisait rien :
   * `cancel` vise un message en cours, et une réponse déjà écrite n'en est
   * plus un. */
  const debut = FEUILLE.indexOf('const annuler = () => {');
  assert.notEqual(debut, -1, 'annuler a disparu');
  const corps = FEUILLE.slice(debut, FEUILLE.indexOf('  };', debut));
  assert.ok(corps.includes('couperLecture();'), '« Arrêter » ne coupe plus la voix');
  assert.ok(corps.includes('vocalRef.current = false;'),
    'une réponse arrêtée partirait quand même en voix à son `done`');
  assert.ok(corps.includes('tourRef.current += 1;'),
    'les fragments d’une réponse arrêtée continueraient de remplir la bulle');
  // La garde de CHAQUE chemin : le flux du protocole, et la réponse d'un bloc.
  const flux = FEUILLE.slice(FEUILLE.indexOf('const surEvenement = (evt) => {'));
  assert.ok(flux.slice(0, 200).includes('if (tour !== tourRef.current) return;'),
    'rien n’écarte plus les fragments d’un tour abandonné');
  const bloc = FEUILLE.slice(FEUILLE.indexOf("type: 'conversation/process'"));
  assert.ok(bloc.slice(0, 400).includes('if (tour !== tourRef.current) return;'),
    'une réponse d’un bloc arrivée après « Arrêter » s’afficherait quand même');
});

test('la popup s’ouvre sur une invitation, pas sur hier', () => {
  // L'historique ramène les messages de la veille : la ligne sous l'orbe ne
  // doit pas les reprendre comme si elle venait de les dire.
  assert.ok(FEUILLE.includes('const [legende, setLegende] = useState(null);'));
  assert.ok(FEUILLE.includes("setLegende({ genre: 'question', texte: t });"));
  assert.ok(FEUILLE.includes("setLegende({ genre: 'reponse', texte: reponseRef.current });"));
});

test('l’orbe prend la couleur du sujet, puis revient à la sienne', () => {
  assert.ok(FEUILLE.includes('setTeinte(teinteDe(reponseRef.current));'),
    'la réponse ne donne plus sa teinte à l’orbe');
  assert.ok(FEUILLE.includes('teinte={teinteVue}'), 'l’orbe ne reçoit plus la teinte');
  // L'alerte d'abord ; le cyan pendant qu'elle parle ; le sujet ensuite.
  assert.ok(FEUILLE.includes("const teinteVue = teinte === 'alerte' ? 'alerte' : (etat === 'speaking' ? 'parle' : teinte);"),
    'l’ordre des couleurs a changé : une alerte attendrait la fin de la phrase, ou la voix perdrait son cyan');
  // Et elle la rend : sans ce retour, une question sur le chauffage
  // laisserait l'orbe orangée jusqu'à la fermeture.
  assert.ok(FEUILLE.includes("setTimeout(() => setTeinte('base'), TEINTE_MS)"));
  // Une nouvelle question repart de la couleur propre.
  assert.ok(FEUILLE.includes("setTeinte('base');"));
});

test('le mot allumé suit la lecture réelle', () => {
  // La position vient du fichier que l'on entend, pas d'une horloge à part :
  // une voix plus lente ou un fichier qui tarde ne décalent pas le surlignage.
  assert.ok(VOIX.includes('export function positionLecture()'));
  assert.ok(FEUILLE.includes('const p = positionLecture();'));
  assert.ok(FEUILLE.includes('motAuTemps(poids, p.t / p.d)'));
});

test('sans micro, le gros bouton invite à écrire', () => {
  /* En HTTP local, pas de capture audio. Le gros bouton ne peut pas être un
   * micro qui ne ferait rien : il ouvre la conversation, et la phrase dessous
   * dit pourquoi la voix manque. */
  assert.ok(FEUILLE.includes('{!micro.ok && ('));
  assert.ok(FEUILLE.includes('raisonLisible(micro.raison, tr)'));
});

test('la conversation fermée ne laisse rien sous le clavier', () => {
  /* Montée en feuille par-dessus l'écran, elle n'existe que quand on l'ouvre.
   * Cachée seulement, ses boutons resteraient dans l'ordre de tabulation — et
   * le piège de focus de la feuille, qui boucle entre le premier et le dernier
   * de la liste, bouclerait sur un bouton invisible. */
  assert.ok(FEUILLE.includes("{fil !== 'ferme' && ("));
  // L'écran recouvert se cache une fois la feuille montée, pour la même raison.
  assert.ok(FEUILLE.includes("visibility: fil === 'ouvert' ? 'hidden' : 'visible'"));
});

test('les suggestions sont traduites', () => {
  const debut = FEUILLE.indexOf('const SUGGESTIONS = [');
  assert.notEqual(debut, -1, 'plus de suggestions');
  const bloc = FEUILLE.slice(debut, FEUILLE.indexOf('];', debut));
  const textes = [...bloc.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.equal(textes.length, 8, 'quatre libellés et leurs quatre questions');
  // Sans traduction, un anglophone lirait des boutons en français.
  for (const t of textes) assert.ok(EN.includes("'" + t + "':"), 'sans traduction : ' + t);
});

// ─────────────────────────────────────────────────────────────────────────────
// Le choix de l'entité de conversation.
//
// Toute entité `conversation.*` se choisit — Assist, un modèle en ligne, un
// composant. Celle dont le composant parle son propre protocole en profite ;
// les autres passent par l'API commune de Home Assistant.
// ─────────────────────────────────────────────────────────────────────────────

test('une entité de conversation passe par l’API commune', () => {
  assert.ok(FEUILLE.includes("type: 'conversation/process', text: t, agent_id: entite"),
    'une entité sans protocole n’a plus de chemin pour répondre');
  // Et ce chemin est bien pris : l'entité se reconnaît à son point, et l'envoi
  // bifurque AVANT d'ouvrir le flux d'un protocole qu'elle n'a pas.
  assert.ok(FEUILLE.includes("const entite = ns && ns.indexOf('.') > 0 ? ns : null;"));
  const branche = FEUILLE.indexOf('if (entite) {', FEUILLE.indexOf('const envoyerTexte = async'));
  assert.ok(branche > 0 && FEUILLE.indexOf("type: 'conversation/process'", branche) - branche < 500,
    'la bifurcation vers l’API commune a disparu');
  assert.ok(branche < FEUILLE.indexOf('const message = { type: `${ns}/chat`'),
    'l’entité passerait par le protocole d’un composant qu’elle n’a pas');
  // Et sa réponse se dit par le pipeline de la maison : elle n'a pas de voix à elle.
  assert.ok(FEUILLE.includes('entite ? await synthese(ws, t) : await ws.callWS({ type: `${ns}/speak`, text: t })'));
  assert.ok(VOIX.includes("start_stage: 'tts', end_stage: 'tts'"));
});

test('le fil ne se recharge pas à chaque état de la maison', () => {
  /* `hass` change à chaque état de la maison. En dépendance de l'historique,
   * il le relisait sans cesse — et une entité sans historique aurait vu son
   * fil vidé à chaque fois. On dépend de la LIAISON, pas de l'objet. */
  assert.ok(FEUILLE.includes('}, [lie, ns]);'));
});

test('changer d’assistant ne ferme pas la popup', () => {
  // La clé précédente tient jusqu'à la réponse : remise à vide pendant la
  // vérification, elle démontait la popup ouverte.
  assert.equal(ASSIST.split("setCle('')").length - 1, 1,
    'la clé ne se vide que quand il n’y a plus d’assistant du tout');
  assert.ok(ASSIST.includes('if (vivant) setCle(r);'));
});

test('l’ancienne forme du réglage reste valable', () => {
  // Un nom de composant, réglé avant que la liste existe, continue de marcher,
  // et désigne l'entité qui porte son nom.
  assert.ok(ASSIST.includes("return /^[a-z][a-z0-9_]*$/.test(s) ? s : '';"));
  assert.ok(ASSIST.includes("return etats['conversation.' + c] ? 'conversation.' + c : '';"));
});

test('on change d’assistant depuis la popup', () => {
  assert.ok(FEUILLE.includes('conversationsDe(hass)'));
  assert.ok(FEUILLE.includes('if (id !== actuelle) cfgSet({ loggia_assistant: id });'));
  // Pas en pleine réponse : elle continuerait d'arriver dans le fil d'un autre.
  assert.ok(FEUILLE.includes('disabled={occupe} aria-expanded={menu}'));
});

test('l’écran « Parler » a une hauteur fixe, barre du bas comprise', () => {
  /* L'orbe prend ce qui reste : sans hauteur fixe, il ne reste rien, et elle
   * se replie à sa taille minimale sous le micro. Sur écran tactile, la barre
   * du bas recouvre la feuille — elle s'y retire deux fois. */
  const CSS = readFileSync(join(SRC, 'index.css'), 'utf8');
  assert.ok(CSS.includes('.o-assist { height: min(760px, calc(88vh - 56px - var(--o-safe-bottom, 0px))); }'));
  assert.ok(CSS.includes('html.loggia-tactile .o-assist { height: min(760px, calc(94vh - 2 * var(--o-navh, 60px) - 56px)); }'));
  assert.ok(FEUILLE.includes('className="o-assist"'));
  // Et l'orbe prend TOUTE la zone, largeur et hauteur : dans un carré taillé
  // sur le plus petit côté, elle restait petite au milieu d'un grand vide.
  assert.ok(FEUILLE.includes('<Orbe etat={etatVu} niveau={niveau} remplir teinte={teinteVue} />'));
});
