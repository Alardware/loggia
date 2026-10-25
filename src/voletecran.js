/* ── Ce que l'écran dit d'un volet (chantier Volets, docs/chantier-volets.md) ──
 *
 * Pur : ni React ni Home Assistant, testable à sec (tests/voletecran.test.mjs).
 * Il est dans le paquet de démarrage — la carte, la compacte et l'en-tête
 * d'Objets s'en servent — et ne garde donc que ce qu'ELLES disent. Les mots de
 * la fiche (la phrase longue, le type, le prochain mouvement, les manœuvres)
 * vivent dans `voletsfiche.js`, chargé avec elle : une seule DÉCISION
 * (`ligneVolet`, le tableau du § 4), deux jeux de mots — le démarrage n'avait
 * plus que 3 ko de marge le 12/10 (tests/lot14_chargement.test.mjs).
 *
 * Les heures se lisent dans la partie MURALE des instants ISO que le serveur
 * écrit à l'heure de la maison (`finMurale`, chauffageecran.js) : jamais dans
 * le fuseau du navigateur.
 */
import { tr } from './i18n.js';
import { finMurale } from './chauffageecran.js';
import { gestesCover, positionPubliee } from './outils.js';

/* ── Le seuil de fermeture (V12, sa demande du 12/10) ─────────────────────────
 *
 * « même dans netatmo l'application le volet est à 1 % et ne descend pas plus
 * alors que celui-ci en physique il est bien fermé, tu peux le retirer des
 * réglages d'ailleurs ». Ce n'est plus un réglage : deux pour cent, la valeur
 * de l'ADR 0105, mesurée sur sa chambre. La clé `loggia_coverseuil` n'est plus
 * lue. Il joue aux DEUX bouts — un volet qui plafonne à 99 % est « Ouvert ».
 *
 * L'état de Home Assistant reste l'autorité quand il dit `closed`. Le
 * POURCENTAGE affiché, lui, reste le vrai : le mot est un verdict, le chiffre
 * une mesure (« 1 % », « Fermé »).
 */
export const SEUIL_FERME = 2;

// `st` peut manquer (entité absente) : seule la position tranche alors.
export function coverFerme(st, pos) {
  if (st && st.state === 'closed') return true;
  if (st && st.state === 'open' && pos >= 100) return false;
  return pos <= SEUIL_FERME;
}
export const coverOuvert = (pos) => pos >= 100 - SEUIL_FERME;

/* ── Ce qu'est un volet (V3) ──────────────────────────────────────────────────
 *
 * Par sa `device_class` : MIROIR de custom_components/loggia/ouvrants.py —
 * tests/ouvrants_miroir.test.mjs refuse que les deux listes divergent. Un
 * garage, un portail, une porte, une fenêtre de toit n'en sont pas ; une
 * classe absente non plus (ADR 0137). Ils gardent leur carte et leur fiche
 * (`RoomCoverCard`, `RoomCoverSheet`). La liste vivait dans views/volets.jsx,
 * chargé avec Paramètres : la carte, au démarrage, en a besoin.
 */
export const CLASSES_VOLETS = ['shutter', 'blind', 'shade', 'curtain', 'awning'];
export const estVolet = (st) => !!(st && st.attributes && CLASSES_VOLETS.indexOf(st.attributes.device_class) >= 0);

// Muet (§ 3.1) : sans état, `unavailable` ou `unknown` — la carte dit « Indisponible ».
export const estMuetVolet = (st) => !st || st.state === 'unavailable' || st.state === 'unknown';

/** La position publiée, de 0 à 100 — celle des lames d'un store qui ne fait
 * que s'incliner (`positionPubliee`, outils.js) ; sans position, l'état suffit
 * aux deux bouts (`open` 100, `closed` 0) — un volet qui ne sait pas se placer
 * n'en connaît pas d'autre. null : muet, ou en mouvement sans position. */
export function positionDe(st) {
  if (estMuetVolet(st)) return null;
  const p = positionPubliee(st);
  if (p != null) return Math.max(0, Math.min(100, Math.round(p)));
  return st.state === 'open' ? 100 : st.state === 'closed' ? 0 : null;
}

/* La position que la carte peut CROIRE (19/10) : publiée, et d'accord avec
 * l'état. `closed` fait foi (`coverFerme`) : chez lui, Netatmo bascule l'état
 * d'abord et publie la position une à trois minutes après — un `closed` qui
 * dit encore 100 % n'a pas de position sûre, et se dessine fermé, à 0, comme
 * un volet qui ne sait pas se placer (« Fermé · 100 % » sur une plaque grise
 * ne se lisait pas). `sure` faux : rien ne prouve le bout atteint, Monter et
 * Descendre restent offerts — un volet sans position arrêté à mi-course reste
 * `open`, il n'est pas pour autant en haut. */
function positionSure(st) {
  const pos = positionDe(st);
  const publie = pos != null && positionPubliee(st) != null;
  if (publie && st.state === 'closed' && pos > SEUIL_FERME) return { pos: 0, sure: false };
  return { pos, sure: publie };
}

/** Un cover OUVERT au sens de V12, pour tout ce qui le dit sans dessiner sa
 * course — le lavis d'une carte d'appareil, une pastille vive, un objet
 * « actif » d'Objets : ni muet ni fermé (`coverFerme` sur sa position
 * publiée). Sa chambre, qui bute à 1 %, ne l'est pas ; en mouvement sans
 * position, il n'est pas encore fermé (relecture du 13/10, point 6). */
export function coverActif(st) {
  const pos = positionDe(st);
  if (pos == null) return !!st && (st.state === 'opening' || st.state === 'closing');
  return !coverFerme(st, pos);
}

/** L'icône CHOISIE suit l'état quand elle a des variantes (sa demande du 25/10,
 * qui revient sur V7) : les quatre dessins du volet roulant — montée et
 * descente pendant la course, ouvert ou fermé sinon. Une autre icône reste. */
const ROULANT = ['shutter-up', 'shutter-open', 'shutter-closed', 'shutter-down'];
export const iconeSelonEtat = (n, vue) => (!vue || vue.muet || ROULANT.indexOf(n) < 0 ? n
  : vue.enCourse ? (vue.ligne && vue.ligne.sens === 'ouverture' ? 'shutter-up' : 'shutter-down')
    : vue.ferme ? 'shutter-closed' : 'shutter-open');

/** Le glyphe d'un volet sans icône choisie (V7) : fermé, entrouvert, ouvert. */
const glypheVolet = (pos, ferme, ouvert) => (pos == null || ferme ? 'blinds' : ouvert ? 'blinds-open' : 'blinds-raised');

/** La plaque de l'icône (§ 3.1, 3.5) : `[fond, encre]` — le violet d'un volet
 * ouvert, le gris d'un volet fermé ou muet. La carte et la fiche la lisent ici. */
export const plaqueVolet = (allume) => (allume ? ['rgba(var(--o-purple-rgb),.16)', 'var(--o-purple)'] : ['var(--o-s1)', 'var(--o-text2)']);

/* ── La phrase d'état (§ 4) ───────────────────────────────────────────────────
 *
 * Un mouvement « utile » (le `nextMove` de sa maquette) : le premier à venir,
 * sauf une ouverture d'un volet déjà ouvert et une fermeture d'un volet déjà
 * fermé — sa chambre, qui bute à 1 %, n'« attend » pas la fermeture du soir. */
export function mouvementUtile(aVenir, ferme, ouvert) {
  return (Array.isArray(aVenir) ? aVenir : [])
    .find(m => !!m && (m.sens === 'ouverture' ? !ouvert : m.sens === 'fermeture' && !ferme)) || null;
}

/* Rien de prévu (ligne 7) : « Jamais », le mode Manuel, le planning coupé, ou
 * des heures à lui sans aucun jour — le serveur n'a rien à venir alors qu'il
 * connaît le soleil. Sans heures du soleil (`soleil_jours` vide), `a_venir`
 * est vide aussi : on ne sait pas, la carte dit le mot d'aujourd'hui (§ 6.2). */
function rienDePrevu(v, etat) {
  const plan = etat && etat.config && etat.config.planning;
  if (!plan) return false;
  if (v.regle === 'jamais' || !plan.actif || plan.mode === 'manuel') return true;
  const soleil = Array.isArray(etat.soleil_jours) && etat.soleil_jours.length > 0;
  return soleil && !(Array.isArray(v.a_venir) && v.a_venir.length > 0);
}

/**
 * La ligne du tableau du § 4 qui s'applique — la première —, et ce qu'il faut
 * pour la dire : `{ ligne, … }`. `course` : l'affichage de la course
 * (voletcourse.js) ; `v` : l'entrée du volet dans `loggia/volets/etat`
 * (`volets[entity_id]`, § 6.1), null pour un serveur d'avant ; `etat` : la
 * réponse entière ; `ferme`, `ouvert` : le verdict de la position AFFICHÉE.
 *  1 muet · 2 course · 3 abri (vent fort) · 4 protection solaire ·
 *  5 attente (porte ouverte) · 6 un mouvement utile · 7 rien de prévu ·
 *  8 le mot d'aujourd'hui.
 */
export function ligneVolet({ muet = false, course = null, v = null, etat = null, ferme = false, ouvert = false }) {
  if (muet) return { ligne: 1 };
  if (course && course.enCourse) return { ligne: 2, sens: course.sens, cible: course.cible };
  if (v && v.abri) return { ligne: 3 };
  if (v && v.protection) return { ligne: 4, jusqua: v.protection.jusqu_a || null };
  if (v && v.attente && v.attente.motif === 'baie ouverte') return { ligne: 5, porte: v.porte ? v.porte.entite : null };
  const m = v ? mouvementUtile(v.a_venir, ferme, ouvert) : null;
  if (m) return { ligne: 6, mouvement: m };
  if (v && rienDePrevu(v, etat)) return { ligne: 7 };
  return { ligne: 8 };
}

/** Le mot d'aujourd'hui (ligne 8) : Fermé, Ouvert, Ouvert à {n} %. */
export function motPosition(ferme, ouvert, pos) {
  if (ferme) return tr('Fermé');
  return ouvert || pos == null ? tr('Ouvert') : tr('Ouvert à {n} %', { n: pos });
}

/* « Ouvre à 20:24 », « Ferme demain à 07:48 », « Ouvre lundi à 07:46 » : le
 * jour comparé à « maintenant » à l'horloge de la maison. Les phrases restent
 * ENTIÈRES au catalogue : « mañana a las 07:48 » ne se colle pas. */
function quandCourt(m, ref) {
  const f = finMurale(m.heure, ref);
  if (!f) return null;
  const mots = { heure: f.heure, jour: f.jour };
  if (m.sens === 'ouverture') {
    return f.demain ? tr('Ouvre demain à {heure}', mots) : f.jour ? tr('Ouvre {jour} à {heure}', mots) : tr('Ouvre à {heure}', mots);
  }
  return f.demain ? tr('Ferme demain à {heure}', mots) : f.jour ? tr('Ferme {jour} à {heure}', mots) : tr('Ferme à {heure}', mots);
}

/** La phrase COURTE d'une ligne (carte, compacte, surface). */
function phraseCourte(l, { pos = null, ferme = false, ouvert = false, etat = null } = {}) {
  switch (l && l.ligne) {
    case 1: return tr('Indisponible');
    case 2: return l.sens === 'ouverture' ? tr('En ouverture') : tr('En fermeture');
    case 3: return tr('À l’abri du vent');
    case 4: return tr('Protection solaire');
    case 5: return tr('Fermeture en attente');
    case 6: return quandCourt(l.mouvement, etat && etat.maintenant) || motPosition(ferme, ouvert, pos);
    case 7: return tr('Manuel');
    default: return motPosition(ferme, ouvert, pos);
  }
}

/**
 * Tout ce que la carte et la compacte affichent d'un volet, d'un seul calcul :
 * `st` l'état de Home Assistant, `course` l'affichage de sa course
 * (`useCourseVolet`), `v` son entrée dans l'état du serveur, `etat` la réponse.
 * La position est celle de la course pendant qu'elle court ou tient, sinon la
 * publiée — arrondie : la carte écrit un entier. Pendant une course, le
 * verdict suit la position DESSINÉE, pas l'état publié : chez lui, l'état
 * bascule à `closed` alors que la position vaut encore 100 (§ 0), et la carte
 * se serait éteinte au premier dixième de la descente.
 *
 * `gestes` : ce que le volet accepte (`gestesCover`, son `supported_features`) —
 * un bouton qu'il refuserait est inerte, jamais un toast « Commande non
 * exécutée » (19/10).
 */
export function vueVolet({ st, course = null, v = null, etat = null }) {
  const muet = estMuetVolet(st);
  const pilote = !!course && course.cible != null && course.pos != null;
  const lue = positionSure(st);
  const brute = pilote ? course.pos : lue.pos;
  const pos = muet || brute == null ? null : Math.round(brute);
  const ferme = pos != null && coverFerme(pilote ? null : st, pos);
  const ouvert = pos != null && !ferme && coverOuvert(pos);
  const enCourse = !muet && !!(course && course.enCourse);
  const ligne = ligneVolet({ muet, course, v, etat, ferme, ouvert });
  const gestes = gestesCover(st);
  // Le bout n'est atteint que si on le SAIT : la course arrivée, ou une position publiée d'accord avec l'état.
  const auBout = pilote || lue.sure;
  return {
    muet, pos, ferme, ouvert, enCourse, ligne, gestes,
    phrase: phraseCourte(ligne, { pos, ferme, ouvert, etat }),
    allume: pos != null && !ferme,
    glyphe: glypheVolet(pos, ferme, ouvert),
    // Monter est inerte en haut, sûr, hors course, Descendre en bas ; tout est inerte muet, ou ce que le volet ne sait pas faire.
    peutMonter: !muet && !!gestes.monter && (enCourse || !ouvert || !auBout),
    peutDescendre: !muet && !!gestes.descendre && (enCourse || !ferme || !auBout),
    peutArreter: !muet && !!gestes.stop,
  };
}
