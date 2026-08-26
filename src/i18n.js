/* Traduire un dashboard deja ecrit en francais — en demandant d'abord a Home
 * Assistant.
 *
 * La methode habituelle — remplacer chaque texte par un identifiant, `t('nav.rooms')`
 * — supposerait de reecrire un millier de chaines d'un coup, et le moindre oubli
 * afficherait « nav.rooms » a l'ecran. Ici LA CLE EST LE TEXTE FRANCAIS : un texte
 * absent du catalogue sort tel quel, en francais. Une traduction incomplete reste
 * donc un dashboard qui fonctionne, et la conversion peut se faire par morceaux.
 *
 * TROIS SOURCES, DANS CET ORDRE :
 *
 *   1. HOME ASSISTANT. « Allume », « Ferme », « Luminosite », « En pause » : HA
 *      traduit deja ces mots dans une soixantaine de langues, et son vocabulaire
 *      est celui que l'utilisateur lit partout ailleurs dans son installation.
 *      Les reprendre evite a la fois un travail de traduction sans fin et un
 *      dashboard qui dirait « Ouvert » la ou HA dit « Ouverte ».
 *   2. Le catalogue de Loggia, pour ce qui lui est propre.
 *   3. Le francais des sources.
 *
 * Consequence : une installation en allemand, en espagnol ou en polonais recoit
 * les etats d'appareils et les commandes dans sa langue SANS qu'aucun catalogue
 * n'ait ete ecrit pour elle.
 *
 * LA FONCTION S'APPELLE `tr`, ET PAS `t`. Le dashboard utilisait deja `t` comme
 * nom local un peu partout — identifiant de minuterie, graduation d'axe, instant.
 * Un `t('Fermer')` tombant dans une de ces portees n'appelait pas la traduction
 * mais la variable locale : « t is not a function », et la vue entiere
 * disparaissait derriere l'ecran d'erreur.
 */
import { cfgVal, getHass } from './state.js';
import EN from './langues/en.js';

/* Ajouter une langue = un fichier dans `langues/`, une entree ici, une dans
 * CATALOGUES. Mais « Suivre Home Assistant » marche deja pour TOUTES les langues
 * que HA connait : ce qu'il traduit passe, le reste reste en francais. */
export const LANGUES = [
  { code: 'auto', nom: 'Suivre Home Assistant' },
  { code: 'fr', nom: 'Francais' },
  { code: 'en', nom: 'English' },
];

const CATALOGUES = { en: EN };

/** Toutes les langues proposables : celles que Home Assistant connait.
 *
 * HA en annonce une soixantaine, avec leur nom dans leur propre langue
 * (« Deutsch », « Polski »). Les proposer toutes n'est pas une promesse de
 * traduction complete : c'est HA qui fournit les etats et les commandes, et ce
 * qui lui manque reste en francais. Mieux vaut un dashboard aux trois quarts
 * allemand qu'un dashboard entierement francais chez quelqu'un qui ne le lit pas.
 */
export function languesDisponibles(hass) {
  const h = hass || getHass();
  const meta = h && h.translationMetadata && h.translationMetadata.translations;
  const liste = [{ code: 'auto', nom: 'Suivre Home Assistant' }];
  if (!meta) return liste.concat(LANGUES.slice(1));
  const codes = Object.keys(meta)
    .map(c => ({ code: c, nom: (meta[c] && meta[c].nativeName) || c }))
    .sort((a, b) => a.nom.localeCompare(b.nom));
  return liste.concat(codes);
}

/* Le francais n'a pas de catalogue : c'est la langue des sources. */
export const LANGUE_SOURCE = 'fr';

/* Les textes de Loggia qui existent DEJA dans Home Assistant, et sous quelle cle.
 *
 * N'y figure que ce dont le sens est exactement le meme. Les choix de vocabulaire
 * propres a Loggia n'y sont pas : HA nomme « Zones » ce que Loggia appelle
 * « Pieces », et prendre sa cle renommerait la vue jusqu'en francais.
 */
const CLES_HA = {
  // Etats d'appareils
  'Allumé': 'component.light.entity_component._.state.on',
  'Éteint': 'component.light.entity_component._.state.off',
  'Ouvert': 'component.cover.entity_component._.state.open',
  'Fermé': 'component.cover.entity_component._.state.closed',
  'En pause': 'component.media_player.entity_component._.state.paused',
  'Lecture en cours': 'component.media_player.entity_component._.state.playing',
  'Inactif': 'component.media_player.entity_component._.state.idle',
  'Nettoyage': 'component.vacuum.entity_component._.state.cleaning',
  'Sur la base': 'component.vacuum.entity_component._.state.docked',
  'Retour base': 'component.vacuum.entity_component._.state.returning',

  // Commandes
  'Fermer': 'ui.common.close',
  'Ouvrir': 'ui.card.cover.open_cover',
  'Arrêter': 'ui.card.cover.stop_cover',
  'Annuler': 'ui.common.cancel',
  'Enregistrer': 'ui.common.save',
  'Supprimer': 'ui.common.delete',
  'Modifier': 'ui.common.edit',
  'Ajouter': 'ui.common.add',
  'Renommer': 'ui.common.rename',
  'Copier': 'ui.common.copy',
  'Rafraîchir': 'ui.common.refresh',
  'Rechercher': 'ui.common.search',
  'Précédent': 'ui.common.previous',
  'Masquer': 'ui.common.hide',
  'Afficher': 'ui.common.show',
  'Réinitialiser': 'ui.common.reset',
  'Retour': 'ui.common.back',
  'Chargement': 'ui.common.loading',

  // Mesures
  'Luminosité': 'ui.card.light.brightness',
  'Position': 'ui.card.cover.position',
  'Nom': 'ui.common.name',
};

export function langueDeHA(hass) {
  const h = hass || getHass();
  const brut = (h && (h.language || (h.locale && h.locale.language)))
    || (typeof navigator !== 'undefined' && navigator.language)
    || LANGUE_SOURCE;
  return String(brut).slice(0, 2).toLowerCase();
}

/* Ce que l'utilisateur a choisi, sans le resoudre : 'auto', 'fr', 'en'. */
export function choixLangue() {
  return cfgVal('loggia-langue', 'auto') || 'auto';
}

const valide = (c) => !!(c && /^[a-z]{2}$/.test(c));

function resoudre(hass) {
  const choix = choixLangue();
  /* En « auto », TOUTE langue est acceptee, meme sans catalogue : Home Assistant
   * fournira les etats et les commandes, le reste restera en francais. Un choix
   * explicite, lui, doit correspondre a une langue que Loggia propose. */
  const c = choix === 'auto' ? langueDeHA(hass) : choix;
  return valide(c) ? c : LANGUE_SOURCE;
}

/* Cle ou la derniere langue REELLEMENT servie est notee. Voir `resoudreTot`. */
const MEMO = 'loggia-langue-active';

function lireLS(cle) {
  try {
    const v = localStorage.getItem(cle);
    if (v == null) return null;
    try { return JSON.parse(v); } catch (e) { return v; }
  } catch (e) { return null; }
}

/* La langue AVANT que quoi que ce soit ne soit charge.
 *
 * Plusieurs modules construisent des tableaux de libelles au niveau du fichier —
 * la navigation, la liste des themes. Ces `tr()` s'evaluent a l'import, bien avant
 * que `hass` existe : sans resolution des maintenant, ces libelles resteraient
 * figes pendant que le reste de l'ecran change de langue.
 *
 * Le stockage local suffit : le selecteur y ecrit le choix explicite, et
 * `preparerLangue` y note la langue effective une fois `hass` connu. Seul le tout
 * premier affichage, sur un appareil qui n'a jamais rien note, se rabat sur la
 * langue du navigateur. */
function resoudreTot() {
  const choix = lireLS('loggia-langue') || 'auto';
  if (choix !== 'auto') return valide(choix) ? choix : LANGUE_SOURCE;
  const memo = lireLS(MEMO);
  if (valide(memo)) return memo;
  const nav = (typeof navigator !== 'undefined' && navigator.language) || LANGUE_SOURCE;
  const c = String(nav).slice(0, 2).toLowerCase();
  return valide(c) ? c : LANGUE_SOURCE;
}

/* `tr` est appele des milliers de fois par rendu : la langue est resolue une fois
 * et gardee. `preparerLangue` la recalcule quand `hass` arrive. */
let _code = resoudreTot();
let _cat = CATALOGUES[_code] || null;

/* Les traductions de Home Assistant pour une langue AUTRE que celle du compte.
 * `hass.localize` ne parle que la langue de l'utilisateur ; pour une langue
 * choisie a la main, il faut les demander au serveur. */
let _ressourcesHA = null;
let _ressourcesPour = null;

/** Le mot de Home Assistant pour cette cle, ou `null` s'il n'en a pas. */
function localiserHA(cle, hass) {
  const h = hass || getHass();
  if (!h) return null;
  /* Quand Loggia suit la langue du compte, `localize` est deja charge et couvre
   * tout — y compris l'interface (`ui.*`), que le serveur n'expose pas. */
  if (_code === langueDeHA(h) && typeof h.localize === 'function') {
    try { return h.localize(cle) || null; } catch (e) { return null; }
  }
  if (_ressourcesHA && _ressourcesPour === _code) return _ressourcesHA[cle] || null;
  return null;
}

/* Le fichier de traductions de l'interface de Home Assistant, pour une langue.
 *
 * Les commandes — « Fermer », « Ouvrir », « Enregistrer » — vivent sous `ui.*`,
 * que le serveur n'expose PAS par WebSocket. Le frontend les charge depuis un
 * fichier statique dont `translationMetadata` donne l'empreinte. Les cles y sont
 * a plat, exactement comme celles que `localize` attend.
 */
function fichierInterfaceHA(hass, code) {
  const meta = hass && hass.translationMetadata && hass.translationMetadata.translations;
  const h = meta && meta[code] && meta[code].hash;
  if (!h) return Promise.resolve(null);
  return fetch('/static/translations/' + code + '-' + h + '.json')
    .then(r => (r.ok ? r.json() : null))
    .catch(() => null);
}

/* Charge les etats, les noms d'entites et les commandes dans la langue demandee.
 * Asynchrone : les premiers rendus se contentent du catalogue, puis l'ecran se
 * rafraichit. */
function chargerRessourcesHA(hass, code) {
  if (!hass || !hass.callWS || code === LANGUE_SOURCE || code === langueDeHA(hass)) return;
  if (_ressourcesPour === code) return;
  _ressourcesPour = code;
  const cats = ['entity_component', 'entity'];
  Promise.all(cats.map(category =>
    hass.callWS({ type: 'frontend/get_translations', language: code, category })
      .catch(() => null)).concat([fichierInterfaceHA(hass, code)]))
    .then(reponses => {
      const tout = {};
      reponses.forEach(r => {
        if (!r) return;
        // Le WebSocket repond `{resources}` ; le fichier statique, les cles nues.
        Object.assign(tout, r.resources || r);
      });
      if (!Object.keys(tout).length) return;
      _ressourcesHA = tout;
      /* Les libelles deja rendus datent d'avant : on previent l'application. */
      try {
        window.dispatchEvent(new CustomEvent('loggia-langue-prete', { detail: { langue: code } }));
      } catch (e) { /* pas de fenetre : rien a prevenir */ }
    })
    .catch(() => { /* sans ces ressources, le catalogue suffit */ });
}

/* La langue avec laquelle les tableaux de libelles ont ete CONSTRUITS. Elle ne
 * bouge plus : c'est le point de comparaison. */
const LANGUE_IMPORT = _code;
const RECHARGE = 'loggia-langue-recharge';

export function preparerLangue(hass) {
  const avant = _code;
  _code = resoudre(hass);
  _cat = CATALOGUES[_code] || null;

  /* Le memo n'est ecrit QUE sur une resolution fiable. Sans `hass`, « suivre Home
   * Assistant » se rabat sur le navigateur : figer cette valeur provisoire ferait
   * demarrer l'appareil suivant sur une langue qui n'a jamais ete choisie. */
  if (hass) {
    try { localStorage.setItem(MEMO, JSON.stringify(_code)); } catch (e) { /* sans memo, on repart du navigateur */ }
    chargerRessourcesHA(hass, _code);

    /* Plusieurs modules construisent leurs libelles AU MOMENT DE L'IMPORT —
     * la liste des vues secondaires, celle des themes. Si la langue reelle
     * differe de celle qui a servi a les construire, l'ecran melange les deux :
     * vu en direct, un menu moitie anglais moitie francais.
     *
     * Un rechargement les reconstruit juste. Le drapeau porte la langue visee,
     * donc un second passage sur la meme langue ne recharge pas : pas de boucle. */
    if (_code !== LANGUE_IMPORT) {
      let deja = null;
      try { deja = sessionStorage.getItem(RECHARGE); } catch (e) { deja = _code; }
      if (deja !== _code) {
        try {
          sessionStorage.setItem(RECHARGE, _code);
          location.reload();
        } catch (e) { /* pas de navigateur : rien a recharger */ }
      }
    }
  }
  // `index.html` porte `lang="fr"` en dur : sans cette ligne, un lecteur d'ecran
  // lirait de l'anglais avec la prononciation francaise, et la cesure serait
  // celle du francais.
  try {
    if (typeof document !== 'undefined') document.documentElement.lang = _code;
  } catch (e) { /* pas de DOM : rien a annoncer */ }
  return avant !== _code;
}

export function langue() {
  return _code;
}

/** Le texte dans la langue active. Absent partout → le francais d'origine.
 *
 * `params` remplace les reperes `{nom}` : `tr('{n} appareils', { n: 4 })`. Les
 * reperes restent lisibles dans le catalogue, ou l'ordre des mots change souvent
 * d'une langue a l'autre. */
export function tr(texte, params) {
  if (texte == null) return texte;
  let s = null;
  if (_code !== LANGUE_SOURCE) {
    /* Home Assistant d'abord : son vocabulaire est celui que l'utilisateur lit
     * dans le reste de son installation, et il couvre des langues pour
     * lesquelles Loggia n'a aucun catalogue. */
    const cle = CLES_HA[texte];
    if (cle) s = localiserHA(cle);
    if (!s && _cat) s = _cat[texte] || null;
  }
  if (!s) s = texte;
  if (params) {
    for (const k in params) s = s.split('{' + k + '}').join(String(params[k]));
  }
  return s;
}

/* Le tri alphabetique depend de la langue : en suedois « a trema » vient apres
 * « z ». Les listes triaient toutes sur 'fr' en dur. */
export function comparerTextes(a, b) {
  return String(a == null ? '' : a).localeCompare(String(b == null ? '' : b), langue());
}

/* Les dates et les heures etaient formatees sur 'fr-FR' en dur : le dashboard
 * affichait « Mardi 25 août » au milieu d'une interface anglaise. `Intl` fait
 * tout le travail — noms de jours, ordre jour/mois, 12 h ou 24 h — a condition
 * de lui donner la bonne locale. */
const LOCALES = { fr: 'fr-FR', en: 'en-GB' };

export function locale() {
  /* Une langue sans entree ici est rendue telle quelle : `Intl` sait quoi faire
   * de « de » ou de « pt », et se rabat seul sur la locale du navigateur si le
   * code ne lui dit rien. */
  return LOCALES[langue()] || langue() || LOCALES[LANGUE_SOURCE];
}
