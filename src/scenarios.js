/* Les scenarios : ce que la maison fait d'un seul geste (ADR 0027).
 *
 * Le serveur (`scenarios.py`) compose, garde et lance. Ce module ne fait que
 * DIRE les choses — le nom d'un scenario de Loggia dans la langue du moment,
 * sa teinte, ce qu'il fait en une ligne, quand il a tourne — et porter les
 * listes que la fiche propose. Pur : pas de React, pas de Home Assistant,
 * donc testable a sec.
 */
import { tr } from './i18n.js';

export const FAMILLES = ['lumieres', 'volets', 'medias', 'chauffage', 'alarme', 'serrures'];
/* Suffixe `_SCENARIO` : le nom nu est une liste-fonction ailleurs (les
 * interrupteurs), et tests/listes_fonctions.test.mjs le traque partout. */
export const GESTES_SCENARIO = {
  lumieres: ['eteindre', 'allumer'],
  volets: ['ouvrir', 'fermer'],
  medias: ['eteindre', 'pause', 'lecture', 'allumer_tv'],
  chauffage: ['confort', 'eco'],
  alarme: ['absent', 'nuit', 'maison'],
  serrures: ['verrouiller'],
};
export const PORTEES = ['maison', 'piece', 'vie'];
export const CONDITIONS = [null, 'nuit', 'jour'];
export const IDS_INTEGRES = ['reveil', 'depart', 'retour', 'nuit', 'cinema', 'musique', 'invites', 'tout_eteindre'];

/* Des FONCTIONS, pas des tables : appelees au rendu, elles parlent la langue
 * du moment (meme raison que `CAMERAS()` dans App.jsx). */
export const NOMS_INTEGRES = () => ({
  reveil: tr('Réveil'), depart: tr('Je pars'), retour: tr('Je rentre'), nuit: tr('Bonne nuit'),
  cinema: tr('Cinéma'), musique: tr('Musique'), invites: tr('Invités'), tout_eteindre: tr('Tout éteindre'),
});
export const NOMS_FAMILLES = () => ({
  lumieres: tr('Lumières'), volets: tr('Volets'), medias: tr('Médias'),
  chauffage: tr('Chauffage'), alarme: tr('Alarme'), serrures: tr('Serrures'),
});
export const NOMS_GESTES = () => ({
  lumieres: { eteindre: tr('Éteindre'), allumer: tr('Allumer') },
  volets: { ouvrir: tr('Ouvrir'), fermer: tr('Fermer') },
  medias: { eteindre: tr('Éteindre'), pause: tr('Mettre en pause'), lecture: tr('Lancer la lecture'), allumer_tv: tr('Allumer la TV') },
  chauffage: { confort: tr('Confort'), eco: tr('Éco') },
  alarme: { absent: tr('Armer absent'), nuit: tr('Armer nuit'), maison: tr('Armer maison') },
  serrures: { verrouiller: tr('Verrouiller') },
});
export const NOMS_PORTEES = () => ({ maison: tr('Toute la maison'), piece: tr('Une pièce'), vie: tr('Pièces de vie') });
export const NOMS_CONDITIONS = () => ({ toujours: tr('Toujours'), nuit: tr('La nuit'), jour: tr('Le jour') });
export const ICONES_FAMILLES = { lumieres: 'bulb', volets: 'blinds', medias: 'tv-music', chauffage: 'flame', alarme: 'shield-check', serrures: 'lock' };

/* Les memes jetons que les pieces, nommes par leur couleur : un scenario n'est
 * pas une chambre. « Gris » : pour ce qui eteint. */
export const TEINTES_SCENARIO = [
  { id: 'accent', label: 'Accent', col: 'var(--o-accent)', rgb: 'var(--o-accent-rgb)' },
  { id: 'ambre', label: 'Ambre', col: 'var(--o-piece-ambre)', rgb: 'var(--o-piece-ambre-rgb)' },
  { id: 'tendre', label: 'Rose', col: 'var(--o-piece-tendre)', rgb: 'var(--o-piece-tendre-rgb)' },
  { id: 'chambre', label: 'Violet', col: 'var(--o-piece-chambre)', rgb: 'var(--o-piece-chambre-rgb)' },
  { id: 'bain', label: 'Bleu', col: 'var(--o-piece-bain)', rgb: 'var(--o-piece-bain-rgb)' },
  { id: 'vert', label: 'Vert', col: 'var(--o-piece-vert)', rgb: 'var(--o-piece-vert-rgb)' },
  { id: 'gris', label: 'Gris', col: 'var(--o-text3)', rgb: '140,152,180' },
];

/* Quarante icones, par pages de dix (comme les pieces) — toutes dans la
 * police regular, tests/scenarios.test.mjs le verifie. */
export const ICONES_SCENARIO = [
  'sunrise', 'sunset', 'moon', 'moon-stars', 'cloud-moon', 'running', 'exit', 'door-open', 'home', 'key',
  'film', 'clapperboard', 'popcorn', 'music', 'headphones', 'radio', 'guitar', 'users', 'glass-cheers', 'cocktail',
  'utensils', 'hat-chef', 'mug-hot', 'book-open-reader', 'bed', 'baby', 'paw', 'gamepad', 'laptop', 'briefcase',
  'plane-departure', 'suitcase-alt', 'umbrella-beach', 'snowflake', 'flame', 'power', 'sparkles', 'broom', 'shield-check', 'palette',
];

export function nomScenario(s) {
  if (!s) return '';
  return s.nom || NOMS_INTEGRES()[s.id] || s.id || '';
}

export function teinteScenario(s) {
  return TEINTES_SCENARIO.find(t => t.id === (s && s.teinte)) || TEINTES_SCENARIO[0];
}

/** Une action en quelques mots : « Lumières à 30 % · Salon (la nuit) ». */
export function libelleAction(a) {
  if (!a || !a.famille) return '';
  const f = a.famille, g = a.geste;
  let base = '';
  if (f === 'lumieres') base = g === 'eteindre' ? tr('Lumières éteintes') : tr('Lumières à {n} %', { n: a.valeur != null ? a.valeur : 100 });
  else if (f === 'volets') base = g === 'ouvrir' ? tr('Volets ouverts') : tr('Volets fermés');
  else if (f === 'medias') base = g === 'eteindre' ? tr('Médias éteints') : g === 'pause' ? tr('Médias en pause') : g === 'lecture' ? tr('Enceinte en lecture') : tr('TV allumée');
  else if (f === 'chauffage') base = g === 'confort' ? tr('Chauffage confort') : tr('Chauffage éco');
  else if (f === 'alarme') base = g === 'absent' ? tr('Alarme absent') : g === 'nuit' ? tr('Alarme nuit') : tr('Alarme maison');
  else if (f === 'serrures') base = tr('Portes verrouillées');
  else return '';
  if (a.portee === 'piece') base += ' · ' + (a.piece || tr('pièce à choisir'));
  else if (a.portee === 'vie') base += ' · ' + tr('pièces de vie');
  if (a.si === 'nuit') base += ' ' + tr('(la nuit)');
  else if (a.si === 'jour') base += ' ' + tr('(le jour)');
  return base;
}

/** Ce qu'un scenario fait, en une ligne. `nomsLiens` : {haid: nom lisible}. */
export function resumeScenario(s, nomsLiens = {}) {
  if (!s) return '';
  if (s.lien) return tr('Lance {x}', { x: (nomsLiens && nomsLiens[s.lien]) || s.lien });
  const actions = (Array.isArray(s.resume) && s.resume.length) ? s.resume : (s.actions || []);
  const mots = actions.map(libelleAction).filter(Boolean);
  return mots.length ? mots.join(' · ') : tr('Aucune action');
}

/** Combien d'actions, et combien d'entites elles toucheraient maintenant
 * (null quand le serveur ne l'a pas dit). */
export function nombreActions(s) {
  if (!s) return 0;
  return s.lien ? 1 : (s.actions || []).length;
}
export function nombreCibles(s) {
  if (!s || s.lien || !Array.isArray(s.resume)) return null;
  return s.resume.reduce((n, r) => n + (Number(r && r.n) || 0), 0);
}

/** Quand il a tourne : « — », « À l'instant », « Il y a 12 min », « 23:04 »,
 * « hier », « Il y a 3 j ». `ts` en secondes (le serveur), `maintenant` en
 * millisecondes (Date.now). */
export function libelleDernier(ts, maintenant = Date.now(), locale = 'fr-FR') {
  if (!ts) return '—';
  const d = maintenant / 1000 - ts;
  if (d < 0) return '—';
  if (d < 60) return tr("À l'instant");
  if (d < 3600) return tr('Il y a {n} min', { n: Math.floor(d / 60) });
  const quand = new Date(ts * 1000), now = new Date(maintenant);
  const memeJour = quand.getFullYear() === now.getFullYear() && quand.getMonth() === now.getMonth() && quand.getDate() === now.getDate();
  if (memeJour) return quand.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const veille = new Date(now); veille.setDate(now.getDate() - 1);
  if (quand.getFullYear() === veille.getFullYear() && quand.getMonth() === veille.getMonth() && quand.getDate() === veille.getDate()) return tr('hier');
  return tr('Il y a {n} j', { n: Math.max(1, Math.floor(d / 86400)) });
}

export function scenariosVisibles(liste) {
  return (Array.isArray(liste) ? liste : []).filter(s => s && s.id && !s.masque);
}
export function scenariosAccueil(liste) {
  return scenariosVisibles(liste).filter(s => s.accueil !== false);
}

export function actionVide(famille) {
  const f = GESTES_SCENARIO[famille] ? famille : 'lumieres';
  return { famille: f, geste: GESTES_SCENARIO[f][0], portee: 'maison' };
}
export function scenarioVide() {
  return { nom: '', icone: 'sparkles', teinte: 'accent', lien: null, piece: null, actions: [], accueil: true, masque: false, integre: false };
}

/** Ce que la fiche envoie au serveur : le scenario sans ce qu'il a calcule.
 * Un nom vide vaut `null` — pour un scenario de Loggia, « celui d'origine ». */
export function versEnregistrement(s) {
  const out = {
    nom: (s.nom || '').trim() || null, icone: s.icone || 'sparkles', teinte: s.teinte || 'accent',
    lien: s.lien || null, piece: s.piece || null, accueil: s.accueil !== false, masque: !!s.masque,
    actions: s.lien ? [] : (s.actions || []).map(a => {
      const b = { famille: a.famille, geste: a.geste, portee: a.portee || 'maison' };
      if (b.portee === 'piece' && a.piece) b.piece = a.piece;
      if (a.valeur != null && (a.famille === 'lumieres' || a.famille === 'chauffage')) b.valeur = a.valeur;
      if (a.si === 'nuit' || a.si === 'jour') b.si = a.si;
      if (a.sauf_veilleuses) b.sauf_veilleuses = true;
      return b;
    }),
  };
  if (s.id) out.id = s.id;
  return out;
}
