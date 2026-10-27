/* ── L'arrivée d'eau, calculée (chantier IoT, étape 3 ; sa maquette « Cartes IoT », 1a et 1f ; I11, I27, I30, I31, § 6) ──
 *
 * Ce que la carte et la popup d'une vanne montrent, à sec : quelle vanne est une vanne d'eau, ses détecteurs de fuite, la phrase
 * qui dit la suite (§ 6, `phraseVanne`), la plaque, le geste — et quand il DEMANDE —, la tête de la popup qui dit pourquoi elle est
 * fermée, les rangées des détecteurs, le journal du jour. Chargé à la demande avec la carte (cartevanne.jsx) et la popup
 * (fichevanne.jsx) : le démarrage n'en porte rien (lot14_chargement).
 *
 * La règle de sûreté, écrite une fois ici pour les deux : FERMER est le sens sûr, d'un appui, jamais une question ; ROUVRIR demande
 * après une fuite (« La fuite est réparée ? »), et tant qu'un détecteur voit encore de l'eau (« Rouvrir quand même ? ») — la
 * personne décide, la maison jamais. Ouvrir une vanne de GAZ demande toujours. Un service explicite : `valve.close_valve` /
 * `open_valve`, ou `switch.turn_off` / `turn_on` pour une prise désignée — jamais `toggle`.
 */
import { tr, trN, trSens, comparerTextes } from './i18n.js';
import { quandLumiere } from './lumieres.js';
import { couleurPile } from './attention.js';

/** Le filet d'un geste sur une vanne (I33) : 30 s — une vanne motorisée tourne en 5 à 20 s — et un relevé du pont de 2 s. */
export const VANNE_MS = 32000;
const MUETS = ['unavailable', 'unknown'];
const PLATEFORMES_CALCULEES = ['template', 'group'];

/** « ouverte », « fermee », ou null : un état muet, ou qui ne dit rien. Une prise désignée : éteinte = eau coupée. */
export function sensVanne(id, etat) {
  const dom = String(id).split('.')[0];
  if (dom === 'valve') return etat === 'closed' || etat === 'closing' ? 'fermee' : etat === 'open' || etat === 'opening' ? 'ouverte' : null;
  if (dom === 'switch') return etat === 'off' ? 'fermee' : etat === 'on' ? 'ouverte' : null;
  return null;
}
/** La vanne choisie dans Paramètres › Alertes (« Quelle vanne »), ou ''. */
export function vanneDesignee(cfg) {
  const e = cfg && cfg.actions && cfg.actions.vanne && cfg.actions.vanne.entite;
  return typeof e === 'string' ? e : '';
}
/** 'eau', 'gaz', 'vanne' (une autre vanne : la carte simple), ou null (ce n'est pas une vanne). I31. */
export function genreVanne(id, st, designee) {
  if (id && id === designee) return 'eau';
  if (String(id).indexOf('valve.') !== 0) return null;
  const dc = st && st.attributes ? st.attributes.device_class : null;
  return dc === 'water' ? 'eau' : dc === 'gas' ? 'gaz' : 'vanne';
}
/** Le service d'un geste : `[domaine, service]`, explicite. */
export function serviceVanne(id, sens) {
  const prise = String(id).indexOf('switch.') === 0;
  if (sens === 'fermer') return prise ? ['switch', 'turn_off'] : ['valve', 'close_valve'];
  return prise ? ['switch', 'turn_on'] : ['valve', 'open_valve'];
}

const nomDe = (S, id) => (S[id] && S[id].attributes && S[id].attributes.friendly_name) || id;
/** Les détecteurs de fuite de la maison, rangés par leur nom — la règle du serveur (`eau_calcul.est_detecteur`, ADR 0022) : un
 *  `moisture` d'appareil, ni un modèle, ni un groupe, ni le besoin d'eau d'une plante. `plateforme(id)` : l'index ; `plantes` : les bases. */
export function detecteursEau(S, { plateforme = () => null, plantes = [] } = {}) {
  const etats = S || {};
  const bases = (plantes || []).filter(b => typeof b === 'string' && b);
  const plante = (id) => bases.some(b => id.indexOf(b) === 0 && (id.length === b.length || id.charAt(b.length) === '_'));
  return Object.keys(etats).filter(id => id.indexOf('binary_sensor.') === 0 && ((etats[id] || {}).attributes || {}).device_class === 'moisture'
    && PLATEFORMES_CALCULEES.indexOf(plateforme(id)) < 0 && !plante(id))
    .sort((x, y) => comparerTextes(String(nomDe(etats, x)), String(nomDe(etats, y))));
}

const ms = (x) => (typeof x === 'number' ? x : Date.parse(x));
const memeJour = (a, b) => { const x = new Date(a), y = new Date(b); return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate(); };

/**
 * La vue d'une vanne, pour sa carte et sa popup : `{ id, nom, genre, sens, mouvement, mort, fuite, mouillees, detecteurs, depuis,
 * cause, phrase, plaque, lavis, geste }`. `etat` : la réponse de `loggia/eau/etat` (ou null : le serveur muet) ; `enVol` : le geste
 * partagé en vol (`{ sens }`) ; `designee` : « Quelle vanne ».
 */
export function vueVanne({ id, S, etat = null, designee = '', plateforme, plantes, enVol = null, maintenant = Date.now(), nom = null }) {
  const etats = S || {};
  const st = etats[id] || null;
  const genre = genreVanne(id, st, designee) || 'vanne';
  const eau = genre === 'eau';
  const mort = !st || MUETS.indexOf(st.state) >= 0;
  const sens = mort ? null : sensVanne(id, st.state);
  // La vanne tourne (passe bis, point 2) : `closing` compte comme fermée pour le carnet, mais la puce ne propose pas de la rouvrir.
  const bouge = st && st.state === 'closing' ? 'fermer' : st && st.state === 'opening' ? 'ouvrir' : null;
  const mouvement = enVol ? enVol.sens : bouge;
  const detecteurs = eau ? detecteursEau(etats, { plateforme, plantes }) : [];
  const mouillees = detecteurs.filter(d => etats[d] && etats[d].state === 'on').map(d => ({ id: d, nom: nomDe(etats, d) }));
  // « aucune fuite » ne se promet que si chaque détecteur répond : un détecteur muet ne voit rien (vu dans la démo, variante `muet`).
  const tousRepondent = detecteurs.length > 0 && detecteurs.every(d => etats[d] && MUETS.indexOf(etats[d].state) < 0);
  const serveur = etat && etat.vannes ? etat.vannes[id] || null : null;
  // La cause ne vaut que pour la fermeture que le serveur a vue : une vanne rouverte d'ailleurs n'est pas « fermée sur fuite ».
  const cause = sens === 'fermee' && serveur && serveur.ferme ? serveur : null;
  const depuis = cause && typeof cause.depuis === 'number' ? cause.depuis * 1000 : st ? ms(st.last_changed) : NaN;
  const fuite = eau && !!cause && cause.cause === 'fuite';
  let phrase;
  if (mort) {
    const q = st ? quandLumiere(st.last_changed, maintenant) : null;
    phrase = { texte: q ? tr('Indisponible depuis {h}', { h: q }) : tr('Indisponible'), encre: 'var(--o-bad)', panne: true };
  } else if (eau && sens === 'ouverte' && mouillees.length) phrase = { texte: tr('Ouverte · fuite : {nom}', { nom: mouillees[0].nom }), encre: 'var(--o-bad)' };
  else if (mouvement) phrase = { texte: mouvement === 'fermer' ? tr('Fermeture…') : tr('Ouverture…'), encre: 'var(--o-text2)' };
  else if (sens === 'ouverte') phrase = { texte: eau && tousRepondent ? tr('Ouverte · aucune fuite') : tr('Ouverte'), encre: 'var(--o-text2)' };
  else if (!eau) phrase = { texte: tr('Fermée'), encre: 'var(--o-text2)' };
  else if (fuite && isFinite(depuis)) phrase = { texte: memeJour(depuis, maintenant) ? tr('Fermée · fuite à {h}', { h: quandLumiere(depuis, maintenant) }) : tr('Fermée · fuite depuis {quand}', { quand: quandLumiere(depuis, maintenant) }), encre: 'var(--o-bad)' };
  else if (!isFinite(depuis)) phrase = { texte: tr('Fermée'), encre: 'var(--o-text2)' };
  else phrase = { texte: memeJour(depuis, maintenant) ? tr('Fermée à {h}', { h: quandLumiere(depuis, maintenant) }) : tr('Fermée depuis {quand}', { quand: quandLumiere(depuis, maintenant) }), encre: 'var(--o-text2)' };
  const plaque = mort ? ['var(--o-s1)', 'var(--o-text3)']
    : eau && sens === 'ouverte' ? ['rgba(var(--o-cyan-rgb),.16)', 'var(--o-cyan)']
      : fuite ? ['rgba(var(--o-bad-rgb),.16)', 'var(--o-bad)']
        : sens === 'ouverte' ? ['var(--o-s1)', 'var(--o-text1)'] : ['var(--o-s1)', 'var(--o-text2)'];
  // Le geste : rien d'inerte — un appareil muet n'a pas de puce, ni un sens que la vanne ne sait pas faire (`supported_features` :
  // OPEN = 1, CLOSE = 2 ; passe bis, point 15). Fermer d'un appui ; rouvrir l'eau demande après une fuite, tant qu'il y a de l'eau, et
  // tant que le carnet ne dit pas POURQUOI elle est fermée (passe bis, point 3 : muet, pas encore lu, sans fiche, en retard — avant le
  // redémarrage de Home Assistant, une vanne d'eau fermée demande toujours), et quand elle s'est fermée D'ELLE-MÊME (cause
  // « appareil » : sans personne ni automatisation, un détecteur intégré le plus souvent ; choix sûr du 25/10) ; ouvrir le gaz
  // demande toujours. Pendant que la vanne tourne, la puce reste sur son sens, choisie et INERTE (`inerte` ; passe bis, point 2).
  let geste = null;
  const f = st && st.attributes ? st.attributes.supported_features : null;
  const sait = (bit) => String(id).indexOf('valve.') !== 0 || typeof f !== 'number' || (f & bit) !== 0;
  if (!mort && sens) {
    const fermer = bouge ? bouge === 'fermer' : sens === 'ouverte';
    const sure = cause && cause.cause && cause.cause !== 'appareil';
    const demander = fermer || bouge ? null : eau ? (mouillees.length ? 'mouillee' : fuite ? 'fuite' : sure ? null : 'inconnu') : genre === 'gaz' ? 'gaz' : null;
    if (sait(fermer ? 2 : 1)) {
      geste = { sens: fermer ? 'fermer' : 'ouvrir', mot: eau ? (fermer ? tr('Fermer l’eau') : tr('Rouvrir l’eau')) : (fermer ? tr('Fermer') : tr('Ouvrir')),
        rouge: eau && fermer && !bouge, demander, inerte: !!bouge };
    }
  }
  return { id, nom: nom || nomDe(etats, id), genre, sens, mouvement, mort, fuite, mouillees, detecteurs, tousRepondent, depuis: isFinite(depuis) ? depuis : null,
    cause: cause ? cause.cause : null, causeDe: cause, phrase, plaque, lavis: fuite, geste };
}

/**
 * La question d'un geste qui demande : `{ texte, non, oui }`. `carte` : celle de la carte large, sur sa ligne de 44 px — « La fuite
 * est réparée ? » · « Annuler » · « Rouvrir » ; sinon celle de la popup, qui nomme le détecteur sec et depuis quand (`detecteurs` :
 * ceux du serveur, `noms`). Un détecteur encore mouillé l'emporte : « {nom} voit encore de l'eau. Rouvrir quand même ? ».
 */
export function questionVanne(v, { carte = false, detecteurs = {}, noms = {}, maintenant = Date.now() } = {}) {
  const d = v && v.geste ? v.geste.demander : null;
  if (d === 'gaz') return { texte: tr('Ouvrir le gaz ?'), non: tr('Annuler'), oui: tr('Ouvrir') };
  // Le carnet ne dit pas pourquoi elle est fermée (passe bis, point 3) : la question seule, sans promettre une fuite réparée.
  if (d === 'inconnu') return carte ? { texte: tr('Rouvrir l’eau ?'), non: tr('Annuler'), oui: tr('Rouvrir') } : { texte: tr('Rouvrir l’eau ?'), non: tr('Pas encore'), oui: tr('Oui, rouvrir l’eau') };
  if (d === 'mouillee') return { texte: tr('{nom} voit encore de l’eau. Rouvrir quand même ?', { nom: v.mouillees[0].nom }), non: carte ? tr('Annuler') : tr('Pas encore'), oui: tr('Rouvrir quand même') };
  if (carte) return { texte: tr('La fuite est réparée ?'), non: tr('Annuler'), oui: tr('Rouvrir') };
  const id = v && v.causeDe ? v.causeDe.detecteur : null;
  const sec = id && detecteurs[id] && typeof detecteurs[id].sec_depuis === 'number' ? detecteurs[id].sec_depuis * 1000 : null;
  const nom = id ? noms[id] || (v.causeDe && v.causeDe.nom) : null;
  return { texte: sec != null && nom ? tr('Le détecteur {nom} est sec depuis {h}. La fuite est réparée ?', { nom, h: quandLumiere(sec, maintenant) }) : tr('La fuite est réparée ?'),
    non: tr('Pas encore'), oui: tr('Oui, rouvrir l’eau') };
}

/** La tête de la popup (1f) : le mot (28 / 800), sa phrase, et `alerte` (le fond rouge à 0,08) — elle dit POURQUOI. */
export function teteVanne(v, serveur, maintenant = Date.now()) {
  if (v.mort) return { mot: tr('Indisponible'), phrase: v.phrase.texte, alerte: false };
  if (v.mouvement) return { mot: v.mouvement === 'fermer' ? tr('Fermeture…') : tr('Ouverture…'), phrase: '', alerte: false };
  if (v.sens === 'ouverte') {
    const phrase = v.mouillees.length ? tr('Fuite : {nom}', { nom: v.mouillees[0].nom }) : v.genre === 'eau' && v.tousRepondent ? tr('Aucune fuite détectée') : '';
    return { mot: tr('Ouverte'), phrase, alerte: v.mouillees.length > 0 };
  }
  const h = v.depuis != null ? quandLumiere(v.depuis, maintenant) : null;
  const c = v.causeDe;
  // « fuite : {nom} » : le nom vient de Home Assistant, et dit souvent déjà « fuite » (« Fuite sous l'évier »).
  const pourquoi = !c ? null : c.cause === 'fuite' ? (c.nom ? tr('fuite : {nom}', { nom: c.nom }) : tr('fuite')) : c.cause === 'personne' ? tr('fermée à la main')
    : c.cause === 'automatisme' ? tr('par la maison') : tr('sur l’appareil');
  const phrase = h ? (pourquoi ? tr('Depuis {h} · {pourquoi}', { h, pourquoi }) : tr('Depuis {h}', { h })) : (pourquoi || '');
  return { mot: tr('Fermée'), phrase, alerte: v.fuite };
}

/**
 * Les rangées des détecteurs (1f) : `{ id, nom, ligne: [{ texte, encre }], etat, encre }` — « Cuisine · pile 76 % · sec depuis
 * 14:40 » ; l'état « Sec » NEUTRE (le calme se dit en neutre, ADR 0204), « Fuite » en rouge, « Indisponible » gris. La pile suit la
 * règle de la maison (`couleurPile`) ; « sec depuis » ne se dit que le jour même.
 */
export function rangeesDetecteurs(ids, S, serveur = {}, { piece = () => null, pile = () => null, maintenant = Date.now() } = {}) {
  const etats = S || {};
  return (ids || []).map(id => {
    const s = etats[id] ? etats[id].state : null;
    const muet = !etats[id] || MUETS.indexOf(s) >= 0;
    const p = piece(id), n = muet ? null : pile(id);
    const sec = serveur && serveur[id] && typeof serveur[id].sec_depuis === 'number' ? serveur[id].sec_depuis * 1000 : null;
    const ligne = [p ? { texte: p, encre: null } : null, n != null ? { texte: tr('pile {p} %', { p: n }), encre: couleurPile(n, null) } : null,
      !muet && s === 'off' && sec != null && memeJour(sec, maintenant) ? { texte: tr('sec depuis {h}', { h: quandLumiere(sec, maintenant) }), encre: null } : null].filter(Boolean);
    return { id, nom: nomDe(etats, id), ligne, mouille: !muet && s === 'on', muet,
      // « Sec » a un sens : celui d'un détecteur, pas le mode « sécher » d'une clim (`trSens`).
      etat: muet ? tr('Indisponible') : s === 'on' ? tr('Fuite') : trSens('Sec · détecteur'), encre: muet ? 'var(--o-text3)' : s === 'on' ? 'var(--o-bad)' : 'var(--o-text2)' };
  }).sort((x, y) => comparerTextes(x.nom, y.nom));
}
/** Le résumé des détecteurs : ceux qui voient de l'eau d'abord, puis les muets, sinon le compte — un fait, jamais « Tout va bien ». */
export function resumeDetecteurs(rangees) {
  const r = rangees || [];
  const mouilles = r.filter(x => x.mouille).length, muets = r.filter(x => x.muet).length;
  if (mouilles) return trN(mouilles, '{n} détecteur voit de l’eau', '{n} détecteurs voient de l’eau');
  if (muets) return trN(muets, '{n} détecteur indisponible', '{n} détecteurs indisponibles');
  return trN(r.length, '{n} détecteur · sec', '{n} détecteurs · tous secs');
}

/**
 * Le journal du jour d'une vanne (1f) : les lignes du carnet qui la nomment, elle ou un de ses détecteurs (`ids`), les plus récentes
 * d'abord — `{ heure, quoi, note, qui, glyphe }`. Une personne se nomme par la règle commune aux prises et aux lumières (`personnes` :
 * `{ user_id: nom }`), « Un compte » sinon ; Loggia ne se dit pas pour ce qu'elle ne peut pas prouver.
 */
export function journalEau(journal, ids, { personnes = {}, nomDe: nom = (x) => x, pieceDe = () => null } = {}) {
  const garde = new Set(ids || []);
  const note = (id) => [nom(id), pieceDe(id)].filter(Boolean).join(' · ') || null;
  return (Array.isArray(journal) ? journal : []).filter(l => l && garde.has(l.entity_id) && typeof l.when === 'number')
    .sort((x, y) => y.when - x.when)
    .map(l => {
      const heure = quandLumiere(l.when * 1000, l.when * 1000);
      if (l.quoi === 'fuite' || l.quoi === 'sec') return { heure, quoi: l.quoi === 'fuite' ? tr('Fuite détectée') : tr('Détecteur sec'), note: note(l.entity_id), qui: tr('Détecteur'), glyphe: 'raindrops' };
      const quoi = l.quoi === 'fermee' ? tr('Eau fermée') : tr('Eau rouverte');
      if (l.cause === 'fuite') return { heure, quoi, note: tr('Fermeture sur fuite'), qui: tr('Automatisme'), glyphe: 'magic-wand' };
      if (l.cause === 'automatisme') return { heure, quoi, note: l.nom ? tr('« {nom} »', { nom: l.nom }) : null, qui: tr('Automatisme'), glyphe: 'magic-wand' };
      if (l.cause === 'personne') return { heure, quoi, note: null, qui: (l.user_id && personnes[l.user_id]) || tr('Un compte'), glyphe: 'user' };
      return { heure, quoi, note: null, qui: tr('Appareil'), glyphe: 'cube' };
    });
}
