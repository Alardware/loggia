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

/* Deux langues, traduites en entier — plutot que soixante a moitie.
 *
 * L'espagnol et l'allemand ont vecu jusqu'au 29/08/2026 : deux catalogues de
 * plus a maintenir a chaque phrase ajoutee, pour aucun utilisateur connu.
 * Retires a la demande de l'utilisateur ; ils reviendront si quelqu'un les
 * demande (l'historique git les garde).
 *
 * Ajouter une langue = un fichier dans `langues/`, une entree ici, une dans
 * CATALOGUES. Rien d'autre a toucher. */
export const LANGUES = [
  { code: 'auto', nom: 'Suivre Home Assistant' },
  { code: 'fr', nom: 'Français' },
  { code: 'en', nom: 'English' },
];

/* Le catalogue anglais n'est PAS importe ici : 40 Ko que le boot francophone
 * n'emporterait pour rien. L'amorce (main.jsx) le charge quand la langue
 * resolue le demande et le depose sur `window.__loggiaCatEN` avant d'evaluer
 * l'application. `chargerCatalogueTardif` couvre le cas restant : « auto » qui
 * bascule vers l'anglais a l'arrivee de hass. */
const CATALOGUES = {};
try { if (typeof window !== 'undefined' && window.__loggiaCatEN) CATALOGUES.en = window.__loggiaCatEN; } catch (e) { /* rien */ }

let _chargementEn = null;
function chargerCatalogueTardif(demande) {
  if (CATALOGUES.en || _chargementEn) return;
  _chargementEn = import('./langues/en.js').then(m => {
    CATALOGUES.en = m.default;
    // La demande etait l'anglais lui-meme : on bascule — le poll de hass (2 s)
    // redessine, les libelles suivent au tick d'apres. Pour une langue exotique
    // le code reste le sien, seul le FILET anglais devient disponible.
    if (demande === 'en') { _code = 'en'; _cat = m.default; }
  }).catch(() => { _chargementEn = null; });
}

/** Les langues proposees dans les reglages. */
export function languesDisponibles() {
  return LANGUES;
}

/* Le francais n'a pas de catalogue : c'est la langue des sources. */
export const LANGUE_SOURCE = 'fr';

/* Les textes de Loggia qui existent DEJA dans Home Assistant, et sous quelle cle.
 *
 * Cette table n'a pas ete ecrite a la main : chaque entree a ete trouvee en
 * cherchant, parmi les 4 900 traductions francaises de HA, celles dont la valeur
 * est EXACTEMENT le texte de Loggia. Une cle n'est donc jamais une approximation
 * — en francais elle rend le mot deja affiche, et dans les 63 autres langues elle
 * rend celui que Home Assistant emploie.
 *
 * C'est ce qui permet d'adopter le vocabulaire de HA sans rien changer au
 * francais : « Pieces » reste « Pieces » ici, et devient « Areas » en anglais,
 * « Bereiche » en allemand — les mots que l'utilisateur lit deja dans le reste de
 * son installation. Un dashboard a moitie francais chez un anglophone, il le
 * ferme.
 *
 * Deux correspondances ont ete ecartees a la relecture : HA traduit « Personne »
 * par « Person » (nous voulons « Nobody ») et « Retablir » par « Redo ». Un
 * rapprochement automatique ne dispense pas de verifier le sens.
 *
 * Les prefixes sont abreges pour rester lisibles ; `cleHA` les developpe. Seuls
 * les espaces de noms du CŒUR de HA sont retenus : une cle venant d'une
 * integration tierce disparaitrait avec elle.
 */
const ABREGES = {
  'K:': 'ui.common.',
  'D:': 'ui.card.',
  'M:': 'ui.components.',
  'P:': 'panel.',
};

function cleHA(court) {
  const c = String(court);
  if (c.charAt(0) === 'C') {
    // « C:vacuum:state.docked » → domaine, puis le reste du chemin.
    const p = c.split(':');
    return 'component.' + p[1] + '.entity_component._.' + p.slice(2).join(':');
  }
  const pre = c.slice(0, 2);
  return ABREGES[pre] ? ABREGES[pre] + c.slice(2) : c;
}

const CLES_HA = {
  // Vues et domaines
  'MAISON': 'C:group:state.home',
  'Pièces': 'M:area-filter.title',
  'Pièce': 'M:area-picker.area',
  'Énergie': 'P:energy',
  'Sécurité': 'P:security',
  'Météo': 'C:weather:name',
  'météo': 'C:weather:name',
  'Lumières': 'P:light',
  'Médias': 'P:media_browser',
  'Caméra': 'C:camera:name',
  'caméra': 'C:camera:name',
  'Aspirateur': 'C:vacuum:name',
  'Télécommande': 'C:remote:name',
  'Paramètres': 'P:config',
  'APERÇU': 'P:home',
  'ENTITÉ': 'M:entity.entity-picker.entity',
  'CHAÎNE': 'M:media-browser.class.channel',
  'Langue': 'M:media-browser.tts.language',
  'Mises à jour': 'D:updates.title',
  /* Ces quatre-la changent aussi le mot FRANCAIS : Home Assistant dit
   * « Appareils » la ou Loggia disait « Objets », « Ouverture » la ou il disait
   * « Volets ». C'est le but — un dashboard qui parle comme l'installation qui
   * l'heberge, dans toutes les langues. */
  'Scènes': 'M:navigation-picker.route.scenes',
  'Objets': 'M:navigation-picker.route.devices',
  'Climat': 'P:climate',
  'Volets': 'C:cover:name',
  'Vues': 'M:navigation-picker.views',
  'Automatisations': 'M:navigation-picker.route.automations',
  'Caméras': 'C:camera:name',

  // Etats
  'Allumé': 'C:fan:state.on',
  'Éteint': 'C:fan:state.off',
  'Ouvert': 'C:lock:state.open',
  'Fermé': 'C:group:state.closed',
  'En pause': 'C:timer:state.paused',
  'EN PAUSE': 'C:timer:state.paused',
  'En veille': 'C:media_player:state.standby',
  'Inactif': 'C:timer:state.idle',
  'Lecture en cours': 'C:media_player:state.playing',
  'Nettoyage': 'C:vacuum:state.cleaning',
  'Sur la base': 'C:lawn_mower:state.docked',
  'SUR LA BASE': 'C:lawn_mower:state.docked',
  "À la station d'accueil": 'C:vacuum:state.docked',
  'Erreur': 'C:vacuum:state.error',
  'Inconnu': 'C:light:state_attributes.color_mode.state.unknown',
  'ACTIF': 'C:timer:state.active',
  'En cours': 'C:update:state_attributes.in_progress.name',
  'Terminé': 'C:timer:state_attributes.last_transition.state.finished',
  'À jour': 'C:update:state.off',
  'À JOUR': 'C:update:state.off',
  'version installée': 'C:update:state_attributes.installed_version.name',
  'déclenchée': 'C:alarm_control_panel:state.triggered',
  'absent': 'C:group:state.not_home',
  'présent': 'D:alarm_control_panel.modes.armed_home',
  'Présent': 'D:alarm_control_panel.modes.armed_home',
  'nuit': 'D:weather.night',
  'Personne à la maison': 'D:home-summary.nobody_home',
  'personne à la maison': 'D:home-summary.nobody_home',
  'TOUT VA BIEN': 'D:home-summary.all_maintenance_good',
  'Séchage': 'C:humidifier:state_attributes.action.state.drying',

  // Modes
  'Mode': 'D:climate.mode',
  'ARRÊT': 'C:water_heater:state_attributes.operation_mode.state.off',
  'Arrêt': 'C:water_heater:state_attributes.operation_mode.state.off',
  'CONFORT': 'C:humidifier:state_attributes.mode.state.comfort',
  'Confort': 'C:humidifier:state_attributes.mode.state.comfort',
  'confort': 'C:humidifier:state_attributes.mode.state.comfort',
  'faible': 'D:fan.speed.low',

  // Commandes
  'Fermer': 'K:close',
  'Ouvrir': 'D:lock.open',
  'Annuler': 'K:cancel',
  'Enregistrer': 'K:save',
  'Supprimer': 'K:delete',
  'Modifier': 'K:edit',
  'Ajouter': 'K:add',
  'Renommer': 'K:rename',
  'Copier': 'K:copy',
  'Rafraîchir': 'K:refresh',
  'Rechercher': 'K:search',
  'Précédent': 'K:previous',
  'Masquer': 'K:hide',
  'Afficher': 'K:show',
  'Réinitialiser': 'K:reset',
  'Retour': 'K:back',
  'Chargement': 'K:loading',
  'Aucun': 'K:none',
  'Nom': 'K:name',
  'Exécuter': 'D:script.run',
  'Éteindre': 'D:common.turn_off',
  'Mettre en pause': 'D:timer.actions.pause',
  'Lecture': 'D:media_player.media_play',
  'Couper le son': 'D:media_player.media_volume_mute',
  'Répéter': 'C:media_player:state_attributes.repeat.name',
  'Aléatoire': 'C:media_player:state_attributes.shuffle.name',
  'Connexion': 'C:device_tracker:state_attributes.tracking_type.state.connection',

  // Mesures
  'Température': 'D:weather.attributes.temperature',
  'Humidité': 'D:weather.attributes.humidity',
  'Luminosité': 'D:light.brightness',
  'Position': 'D:cover.position',
  'Pression': 'C:weather:state_attributes.pressure.name',
  'Visibilité': 'D:weather.attributes.visibility',
  'Indice UV': 'C:weather:state_attributes.uv_index.name',
  'Point de rosée': 'D:weather.attributes.dew_point',
  'Prévision': 'C:weather:state_attributes.forecast.name',
  'État': 'D:humidifier.state',
  'batterie': 'C:device_tracker:state_attributes.battery.name',
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
  /* Une langue sans catalogue sortirait a moitie anglaise : mieux vaut la langue
   * des sources, entiere. */
  return (c === LANGUE_SOURCE || CATALOGUES[c]) ? c : LANGUE_SOURCE;
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

/* Les mots de Home Assistant, gardes d'une visite a l'autre.
 *
 * Le chargement est asynchrone, mais plusieurs modules construisent leurs
 * libelles A L'IMPORT — la navigation, les vues secondaires. Au premier
 * affichage dans une nouvelle langue, ces libelles sont donc figes en francais
 * meme si HA sait les traduire : constate en espagnol, ou « Areas » passait mais
 * « Lumieres » restait.
 *
 * Seules les valeurs des cles de `CLES_HA` sont gardees — quelques centaines
 * d'octets, contre 300 Ko pour tout le catalogue de HA. Indexees par le texte
 * francais, elles se lisent sans rien developper.
 */
const MEMO_HA = 'loggia-ha-';
/* Lu tout de suite : c'est ce qui rend les libelles justes des le premier rendu
 * des visites suivantes. */
let _haMemo = lireLS(MEMO_HA + _code);

function memoriserHA(code, tout) {
  const utile = {};
  Object.keys(CLES_HA).forEach(t => {
    const v = tout[cleHA(CLES_HA[t])];
    if (v) utile[t] = v;
  });
  if (!Object.keys(utile).length) return;
  const neuf = !_haMemo;
  _haMemo = utile;
  try { localStorage.setItem(MEMO_HA + code, JSON.stringify(utile)); } catch (e) { /* stockage plein : on repartira du reseau */ }
  /* Les mots de Home Assistant viennent d'arriver. Il fallait recharger pour que
   * les libelles batis a l'import en profitent ; ils sont devenus des fonctions,
   * un redessin suffit. La racine ecoute cet evenement. */
  if (neuf) {
    try { window.dispatchEvent(new CustomEvent('loggia-langue-prete', { detail: { langue: code } })); }
    catch (e) { /* pas de navigateur : rien a annoncer */ }
  }
}

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
      memoriserHA(code, tout);
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


export function preparerLangue(hass) {
  const avant = _code;
  /* La langue DEMANDEE peut etre l'anglais sans que son catalogue soit charge —
   * « auto » qui bascule a l'arrivee de hass, l'amorce n'a pas pu le prevoir.
   * On declenche le chargement ; `resoudre` sert le francais en attendant. */
  const choix = choixLangue();
  const demande = choix === 'auto' ? langueDeHA(hass) : choix;
  // Toute langue autre que le francais s'appuie sur l'anglais — en plein pour
  // « en », en filet pour une langue exotique servie par « auto ».
  if (demande && demande !== LANGUE_SOURCE) chargerCatalogueTardif(demande);
  _code = resoudre(hass);
  _cat = CATALOGUES[_code] || null;

  /* La langue a change : les mots de Home Assistant en memoire sont ceux de la
   * PRECEDENTE. `tr` les consulte en premier, si bien qu'un retour au francais
   * laissait « Lights », « Cover », « Settings » dans la navigation — un menu
   * moitie traduit. On reprend donc ceux de la nouvelle langue, deja gardes d'une
   * visite anterieure, et `chargerRessourcesHA` complete depuis le serveur. */
  if (_code !== avant) _haMemo = lireLS(MEMO_HA + _code);

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
    /* Plus de rechargement ici.
     *
     * Il servait a reconstruire les libelles batis a l'import — navigation,
     * themes, onglets — restes dans l'ancienne langue. Ces listes sont devenues
     * des fonctions, appelees au rendu : elles se disent dans la langue du
     * moment. La racine redessine sur `loggia-langue-changee`, et cela suffit. */
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
  /* Home Assistant est consulte DANS TOUTES LES LANGUES, francais compris. La
   * table ayant ete batie sur des correspondances exactes en francais, cela n'y
   * change presque rien — sauf les quelques mots ou Loggia s'ecartait du
   * vocabulaire de HA, et qui s'y rangent desormais. */
  let s = _haMemo ? (_haMemo[texte] || null) : null;
  const cle = CLES_HA[texte];
  if (!s && cle) s = localiserHA(cleHA(cle));
  if (!s && _cat) s = _cat[texte] || null;
  /* Le repli n'est PAS le francais.
   *
   * Home Assistant ne traduit que SON vocabulaire ; les phrases propres a Loggia
   * — « 4 lampes allumees », « Controle general », « Luminosite moyenne » — n'ont
   * aucun equivalent chez lui. Sur une installation allemande, elles restaient
   * donc en francais au milieu de l'allemand.
   *
   * L'anglais est la deuxieme langue de a peu pres tout le monde ; le francais ne
   * l'est de personne. Un dashboard allemand aux trois quarts, complete en
   * anglais, se lit. Complete en francais, il se ferme. */
  if (!s && _code !== LANGUE_SOURCE && CATALOGUES.en) s = CATALOGUES.en[texte] || null;
  if (!s) s = texte;
  if (params) {
    for (const k in params) s = s.split('{' + k + '}').join(String(params[k]));
  }
  return s;
}

/** Le mot de Home Assistant pour une cle DONNEE, ou `null`.
 *
 * Utile quand Loggia possede deja l'identifiant que HA emploie — les etats de la
 * meteo, par exemple : `partlycloudy` se traduit dans les 64 langues sans qu'on
 * ait a passer par le texte francais. */
export function trHA(cle) {
  if (_haMemo && _haMemo[cle]) return _haMemo[cle];
  return localiserHA(cle);
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
