/* ── L'index des réglages : ce qu'on cherche dans les Paramètres (07/11, usage étape 12) ──
 *
 * « On tape veille et on y est. » Les Paramètres ont onze sections, deux mises
 * en page (l'ordinateur, maquette v3 ; le téléphone, maquette v4) et plus de
 * cent rangées : un réglage se cherchait de mémoire. Cet index les nomme, et
 * la recherche — en tête des Paramètres, et dans Ctrl+K (son choix du 07/11 :
 * « les deux ») — y mène : la section s'ouvre, la rangée s'allume un instant.
 *
 * Chaque réglage : sa section (`s`), les mots de sa rangée (`t`, des clés du
 * catalogue — le premier qu'on trouve à l'écran l'emporte : le même réglage
 * s'appelle « Barre du bas » sur l'ordinateur et « Barre de navigation » au
 * téléphone), le nom qu'on lit dans les résultats (`l`, le premier mot sinon),
 * l'onglet des Règles qui le montre (`o`), et `a` s'il vit sous « Avancé »,
 * replié. On ne cherche pas dans les phrases : un mot du nom suffit, et les
 * phrases changeraient les résultats d'une langue à l'autre.
 *
 * Un nom qui change à l'écran sans changer ici ne se trouverait plus : le test
 * (`tests/reglages_recherche.test.mjs`) exige que chaque mot soit écrit, tel
 * quel, dans le code des Paramètres.
 */
import { tr } from './i18n.js';

/* « Réduire les animations » : le défilement va droit au but. La même lecture que celle d'ui.jsx — ce module reste
 * sans JSX, pour que Ctrl+K et ses tests le lisent tel quel. */
const REDUCE_MOTION = (() => { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { return false; } })();

/** Les sections, et le nom qu'elles portent dans les Paramètres. */
export const SECTIONS_REGLAGES = {
  users: 'Profils', apparence: 'Apparence', connexion: 'Connexion HA', auto: 'Automatisations', alertes: 'Alertes',
  maj: 'Mises à jour', inter: 'Interrupteurs', regles: 'Règles', vues: 'Vues', appareils: 'Appareils', about: 'À propos',
};
/** Celles qu'un profil ouvre seulement avec son droit (les autres s'ouvrent à tous). */
const SECTIONS_A_DROIT = ['auto', 'alertes', 'maj', 'inter', 'regles', 'vues'];

const r = (s, cle, t, extra = {}) => ({ id: s + '/' + cle, s, t, ...extra });
export const REGLAGES = [
  // Apparence
  r('apparence', 'theme', ['Thème']),
  r('apparence', 'mode', ['Clair ou foncé', 'Mode d’affichage']),
  r('apparence', 'suivre-ha', ['Suivre Home Assistant']),
  r('apparence', 'taille-texte', ['Taille du texte']),
  r('apparence', 'accent', ['Accent', "Couleur d'accent"]),
  r('apparence', 'teinte', ['Teinte des cartes actives', "Teinte d'état"]),
  r('apparence', 'arrondi', ['Arrondi']),
  r('apparence', 'ombres', ['Ombres', 'Ombres portées'], { l: 'Ombres portées' }),
  r('apparence', 'liseres', ['Liserés']),
  r('apparence', 'verre', ['Verre', 'Verre des cartes'], { l: 'Verre des cartes' }),
  r('apparence', 'fond', ["Fond d'écran"]),
  r('apparence', 'ciel', ['Ciel animé']),
  r('apparence', 'veille', ['Écran de veille']),
  r('apparence', 'veille-plage', ['Quand', 'Plage horaire'], { l: 'Plage horaire' }),
  r('apparence', 'photos', ['Photos en fond']),
  r('apparence', 'reveil-camera', ['Réveil par la caméra']),
  r('apparence', 'nuit-ecran', ['La nuit', 'Nuit de l’écran'], { l: 'Nuit de l’écran' }),
  r('apparence', 'assombrir', ['De combien', 'Assombrir'], { l: 'Assombrir' }),
  r('apparence', 'retour-accueil', ['Retour à l’accueil']),
  r('apparence', 'sonnette', ['Sonnette', 'Caméra en grand à la sonnette'], { l: 'Caméra en grand à la sonnette' }),
  r('apparence', 'langue', ['Langue']),
  r('apparence', 'barre', ['Barre du bas', 'Barre de navigation'], { l: 'Barre de navigation' }),
  // Sous « Avancé », replié (son choix du 07/11) : ce qu'on règle une fois.
  r('apparence', 'demarrage', ['Ouvrir Loggia au démarrage', "Page d'accueil"], { a: true }),
  r('apparence', 'plan-3d', ['Plan 3D', 'Plan 3D de la maison'], { l: 'Plan 3D de la maison', a: true }),
  r('apparence', 'marges', ['Marges de l’écran', 'Marge du haut'], { l: 'Marges de l’écran', a: true }),
  // Profils
  r('users', 'code-admin', ['Accès', 'Code administrateur'], { l: 'Code administrateur' }),
  r('users', 'mode-enfant', ['Mode enfant']),
  r('users', 'roles', ['Rôles']),
  // Alertes
  r('alertes', 'qui-recoit', ['Qui reçoit quoi']),
  r('alertes', 'calme', ['Le calme', 'Heures calmes'], { l: 'Heures calmes' }),
  r('alertes', 'ce-qui-alerte', ['Ce qui alerte']),
  r('alertes', 'maison-reagit', ['Sur un danger, la maison agit', 'La maison réagit'], { l: 'La maison réagit' }),
  r('alertes', 'fuite', ['L’eau se coupe sur une fuite', 'Fermer en cas de fuite'], { l: 'Fermer en cas de fuite' }),
  r('alertes', 'secours', ['Téléphone de secours', 'Téléphone'], { l: 'Téléphone de secours' }),
  r('alertes', 'essai', ['Un essai', 'Envoyer un essai'], { l: 'Envoyer un essai' }),
  // Règles, par onglet
  r('regles', 'observer', ['Observer sans agir']),
  r('regles', 'soleil', ['Lever et coucher du soleil'], { o: 'volets' }),
  r('regles', 'protection', ['Protection solaire'], { o: 'volets' }),
  r('regles', 'vent', ['Vent fort'], { o: 'volets' }),
  r('regles', 'velux', ['Fenêtres de toit (velux)'], { o: 'volets' }),
  r('regles', 'bloque', ['Volet bloqué'], { o: 'volets' }),
  r('regles', 'fenetre', ['Fenêtre ouverte, chauffage coupé'], { o: 'fenetres' }),
  r('regles', 'depart', ['Départ et retour'], { o: 'presence' }),
  r('regles', 'veilleuse', ['Veilleuse'], { o: 'nuit' }),
  r('regles', 'extinction', ['Extinction du soir'], { o: 'nuit' }),
  r('regles', 'eclairage', ['Éclairage nocturne'], { o: 'nuit' }),
  r('regles', 'air', ['Air vicié'], { o: 'veilles' }),
  r('regles', 'piles', ['Piles faibles'], { o: 'veilles' }),
  r('regles', 'consommables', ['Consommables'], { o: 'veilles' }),
  r('regles', 'creuses', ['Heures creuses'], { o: 'veilles' }),
  r('regles', 'collecte', ['Rappel de collecte'], { o: 'veilles' }),
  r('regles', 'journal', ['Journal']),
  // Appareils (les écrans)
  r('appareils', 'cet-ecran', ['Cet écran']),
  r('appareils', 'nom-ecran', ['Son nom', 'Nom de cet écran'], { l: 'Nom de cet écran' }),
  r('appareils', 'rangement', ['Son rangement', 'Mise en page'], { l: 'Mise en page' }),
  r('appareils', 'apparence-propre', ['Sa propre apparence']),
  r('appareils', 'autres', ['Les autres écrans']),
  // Connexion
  r('connexion', 'adresses', ['Adresses du serveur']),
  r('connexion', 'bascule', ['Bascule automatique']),
  r('connexion', 'rafraichir', ['Intervalle de rafraîchissement']),
  r('connexion', 'assistant', ['Assistant vocal']),
  // Vues
  r('vues', 'integrees', ['Vues intégrées']),
  r('vues', 'mes-vues', ['Mes vues']),
  // À propos
  r('about', 'installation', ['Installation']),
  r('about', 'diagnostics', ['Diagnostics']),
  r('about', 'signaler', ['Signaler un problème']),
  r('about', 'cache', ['Cache de cet écran', 'Cache local'], { l: 'Cache de cet écran' }),
  r('about', 'remise', ['Tout remettre à zéro']),
];
export const REGLAGE_PAR_ID = Object.fromEntries(REGLAGES.map(e => [e.id, e]));

/** Une section s'ouvre-t-elle à ce profil ? `admin` : tout ; sinon son droit, pour celles qui en ont un. */
export const sectionOuverte = (s, droits = [], admin = false) => admin || SECTIONS_A_DROIT.indexOf(s) < 0 || (droits || []).indexOf(s) >= 0;

/**
 * Les options de la recherche, pour les sections `dispo` : les sections
 * elles-mêmes d'abord (`sections`), puis chaque réglage, groupé par section.
 * `{ id, label, groupe }` — la forme des menus (`ChampSuggere`, `ListeChoix`).
 */
export function optionsReglages(dispo, { sections = true } = {}) {
  const ok = (s) => (dispo || []).indexOf(s) >= 0;
  const tete = sections ? Object.keys(SECTIONS_REGLAGES).filter(ok)
    .map(s => ({ id: 'section:' + s, label: tr(SECTIONS_REGLAGES[s]), groupe: tr('Sections des paramètres') })) : [];
  return tete.concat(REGLAGES.filter(e => ok(e.s)).map(e => ({ id: e.id, label: tr(e.l || e.t[0]), groupe: tr(SECTIONS_REGLAGES[e.s]) })));
}

/** La section d'un identifiant d'option (`section:alertes`, `alertes/calme`), ou null. */
export function sectionDe(id) {
  if (typeof id !== 'string') return null;
  if (id.indexOf('section:') === 0) return SECTIONS_REGLAGES[id.slice(8)] ? id.slice(8) : null;
  return REGLAGE_PAR_ID[id] ? REGLAGE_PAR_ID[id].s : null;
}

/* ── Trouver la rangée, et la montrer ─────────────────────────────────────── */

/* Ce qu'on allume : la rangée entière, pas son seul titre. Les rangées de
 * l'ordinateur (`o-optrow`), du téléphone (`o-ligne-tel`, `o-choix-tel`), une
 * règle (`o-regle-tete`) ; un titre de panneau ou de carte, sa carte. */
const RANGEE = '.o-optrow, .o-ligne-tel, .o-choix-tel, .o-regle-tete, section';

/* Le texte PROPRE d'un élément : ses nœuds de texte, sans ceux de ses enfants. Le titre d'une rangée marquée
 * « Cet écran » porte la pastille EN LUI (« Marge du haut » + « Cet écran ») : son texte entier ne valait plus
 * le nom, et la recherche ne la trouvait pas (essai du 07/11 au téléphone). */
const textePropre = (el) => (el.childNodes
  ? Array.prototype.filter.call(el.childNodes, n => n.nodeType === 3).map(n => n.nodeValue).join('')
  : el.textContent || '').trim();

/**
 * L'élément qui porte le nom du réglage dans `racine` (le contenu des
 * Paramètres), ou null : son texte propre égal, mot pour mot, à l'un de ses
 * mots traduits — le premier mot trouvé l'emporte. Les menus de navigation (le
 * rail, les onglets) ne comptent pas : ils nomment des sections.
 */
export function trouverRangee(racine, entree) {
  if (!racine || !entree || !Array.isArray(entree.t) || typeof racine.querySelectorAll !== 'function') return null;
  const elements = racine.querySelectorAll('h1, h2, h3, span, div, button, label');
  for (const mot of entree.t) {
    const voulu = tr(mot).trim();
    for (const el of elements) {
      if (el.closest && el.closest('nav')) continue;
      if (textePropre(el) === voulu) return el;
    }
  }
  return null;
}

/** La rangée à allumer pour l'élément trouvé. */
export const rangeeDe = (el) => (el && el.closest ? el.closest(RANGEE) || el : el);

/**
 * La montrer : au milieu de l'écran, allumée 1,8 s (`o-reglage-trouve`,
 * index.css), le focus sur son premier bouton — le clavier y est aussi, sans
 * ouvrir le clavier du téléphone (jamais un champ). Rend la rangée.
 */
export function montrerRangee(el) {
  const rangee = rangeeDe(el);
  if (!rangee) return null;
  try { rangee.scrollIntoView({ block: 'center', behavior: REDUCE_MOTION ? 'auto' : 'smooth' }); } catch { /* un vieux moteur */ }
  if (rangee.classList) {
    rangee.classList.add('o-reglage-trouve');
    setTimeout(() => { try { rangee.classList.remove('o-reglage-trouve'); } catch { /* démontée */ } }, 1800);
  }
  const bouton = rangee.querySelector && rangee.querySelector('button, [role="switch"]');
  if (bouton && typeof bouton.focus === 'function') { try { bouton.focus({ preventScroll: true }); } catch { /* rien */ } }
  return rangee;
}

/** Demander les Paramètres sur un réglage, d'ailleurs (Ctrl+K) : la section et le réglage dans la mémoire de session, et un signal pour des Paramètres déjà ouverts. */
export function demanderReglage(id) {
  const s = sectionDe(id);
  if (!s) return;
  try {
    sessionStorage.setItem('loggia-par-section', s);
    if (REGLAGE_PAR_ID[id]) sessionStorage.setItem('loggia-par-reglage', id); else sessionStorage.removeItem('loggia-par-reglage');
  } catch { /* stockage indisponible : la section seule */ }
  try { window.dispatchEvent(new Event('loggia-par-reglage')); } catch { /* rien */ }
}
