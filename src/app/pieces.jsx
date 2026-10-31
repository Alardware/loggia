/* L’habillage d’une pièce : son modèle, sa teinte, son icône.
 * Sorti d’App.jsx tel quel (lot 5 de l’audit du 28/10, ADR 0283) : seuls les imports sont neufs. */
import { LOGGIA_INDEX, cfgVal } from '../state.js';
import { capteurBruit } from '../confort.js';
import { Ico } from '../icones.jsx';
import { rmNorm } from './noyau.jsx';

/* Le thème est sorti dans `src/theme.js` (27/09, audit point 9) : les couleurs,
 * les quatorze préréglages, la pose sur la racine et la garde de contraste.
 * Rien n'y est un composant — c'est pour cela qu'il part en premier. */

/**
 * Les icones de Home Assistant, traduites vers la police du dashboard.
 *
 * Une zone de Home Assistant porte l'icone que l'utilisateur lui a choisie,
 * sous la forme « mdi:sofa ». Le dashboard, lui, dessine avec UICons. Cette
 * table fait le pont : elle permet de NOMMER SES PIECES COMME ON VEUT, puisque
 * l'icone ne se deduit plus des mots du nom.
 *
 * Chaque cible a ete verifiee contre les TROIS sources que `Ico` consulte, et
 * dans cet ordre : `CUSTOM_SVG` (des dessins maison, dont `couch`, `teddy-bear`
 * et `bed-alt`), `FI_MAP` (des alias), puis la police REGULAR — `fi-rr-`, et
 * non `fi-sr-`. Chercher un nom dans le seul CSS de la police solide fait
 * conclure a tort qu'il n'existe pas.
 */
const MDI_VERS_UICON = {
  sofa: 'couch', 'sofa-outline': 'couch', 'seat-outline': 'couch', 'sofa-single': 'couch',
  'silverware-fork-knife': 'utensils', 'countertop': 'utensils', stove: 'utensils',
  'fridge': 'utensils', 'coffee': 'coffee', 'food': 'restaurant',
  bed: 'bed-alt', 'bed-king': 'bed-alt', 'bed-queen': 'bed-alt', 'sleep': 'bed-alt',
  'teddy-bear': 'teddy-bear', 'baby-carriage': 'baby-carriage', 'baby': 'baby-carriage',
  'shower-head': 'hot-tub', shower: 'hot-tub', bathtub: 'hot-tub', 'toilet': 'hot-tub',
  desk: 'briefcase', 'desktop-tower-monitor': 'computer', 'laptop': 'computer',
  monitor: 'computer', briefcase: 'briefcase',
  tree: 'tree', flower: 'flower-tulip', 'flower-outline': 'flower-tulip',
  'grass': 'leaf', leaf: 'leaf', 'weather-sunny': 'sun',
  garage: 'garage', 'garage-variant': 'garage', car: 'car',
  'home-outline': 'home', home: 'home', 'door': 'door-open', 'door-open': 'door-open',
  'lan': 'network-cloud', 'router-network': 'network-cloud', 'wifi': 'network-cloud',
  'shield-home': 'shield-check', 'shield': 'shield-check', 'cctv': 'shield-check',
  'flash': 'bolt', 'lightning-bolt': 'bolt', 'transmission-tower': 'bolt',
  orbit: 'settings-sliders', cog: 'settings-sliders', 'tools': 'settings-sliders',
  'bookshelf': 'book', book: 'book',
};

/** « mdi:teddy-bear » → « teddy-bear », si la police sait le dessiner. */
function uiconDeMdi(mdi) {
  if (!mdi || typeof mdi !== 'string') return null;
  const cle = mdi.replace(/^mdi:/, '').trim();
  return MDI_VERS_UICON[cle] || null;
}

const PIECES = [
  { name: 'Séjour', bg: 'rgba(var(--o-accent-rgb),.16)', box: 44, rad: 13, icon: <Ico name="couch" color="var(--o-accent)" size={22} />, status: { kind: 'active', n: 2 }, temp: '18.1°', tc: 'var(--o-accent-soft)', hum: '63%', badge: '412 ppm', bc: 'var(--o-ok)', bbg: 'rgba(var(--o-ok-rgb),.14)' },
  { name: 'Cuisine', bg: 'rgba(var(--o-piece-ambre-rgb),.16)', box: 44, rad: 13, icon: <Ico name="utensils" color="var(--o-piece-ambre)" size={22} />, status: { kind: 'active', n: 1 }, temp: '22.0°', tc: 'var(--o-piece-ambre)', hum: '53%', badge: '486 ppm', bc: 'var(--o-ok)', bbg: 'rgba(var(--o-ok-rgb),.14)' },
  { name: 'Chambre', bg: 'rgba(var(--o-piece-chambre-rgb),.16)', box: 44, rad: 13, icon: <Ico name="bed-alt" color="var(--o-piece-chambre)" size={22} />, status: { kind: 'repos' }, temp: '18.1°', tc: 'var(--o-piece-chambre)', hum: '60%', badge: '529 ppm', bc: 'var(--o-warn)', bbg: 'rgba(var(--o-warn-rgb),.14)' },
  { name: 'Chambre enfant', bg: 'rgba(var(--o-piece-tendre-rgb),.16)', box: 44, rad: 13, icon: <Ico name="teddy-bear" color="var(--o-piece-tendre)" size={22} />, status: { kind: 'repos' }, temp: '18.1°', tc: 'var(--o-piece-tendre)', hum: '61%', badge: '641 ppm', bc: 'var(--o-warn2)', bbg: 'rgba(var(--o-warn2-rgb),.14)' },
  { name: 'Bureau', bg: 'rgba(var(--o-piece-ambre-rgb),.16)', box: 44, rad: 13, icon: <Ico name="briefcase" color="var(--o-piece-ambre)" size={22} />, status: { kind: 'repos' }, temp: '17.8°', tc: 'var(--o-piece-ambre)', hum: '64%', badge: '712 ppm', bc: 'var(--o-warn2)', bbg: 'rgba(var(--o-warn2-rgb),.14)' },
  { name: 'Salle de bain', bg: 'rgba(var(--o-piece-bain-rgb),.16)', box: 44, rad: 13, icon: <Ico name="hot-tub" color="var(--o-piece-bain)" size={22} />, status: { kind: 'repos' }, temp: '15.5°', tc: 'var(--o-piece-bain)', hum: '80%', badge: '498 ppm', bc: 'var(--o-ok)', bbg: 'rgba(var(--o-ok-rgb),.14)' },
  { name: 'Extérieur', bg: 'rgba(var(--o-piece-vert-rgb),.16)', box: 36, rad: 11, icon: <Ico name="tree" color="var(--o-piece-vert)" size={22} />, status: { kind: 'ext' }, temp: '6.2°', tc: 'var(--o-accent-soft)', hum: '84%', badge: 'Vent 12', bc: 'var(--o-text2)', bbg: 'var(--o-bd3)' },
];
// Les appareils d'une pièce viennent des CONFIGS d'Loggia (lumières découvertes, zones climat, volets, médias) :
// ça écarte d'office le bruit HA (LED d'équipement, *_announcement, communications, prises techniques…).
/* Le capteur de bruit d'une piece (ADR 0039) : parmi les entites de sa ZONE
 * Home Assistant. La configuration des pieces ne nomme que la temperature,
 * l'humidite et le CO2 ; le bruit se decouvre, et une piece sans sonometre n'a
 * simplement pas de pastille Bruit. */
function capteurBruitPiece(S, roomName) {
  const cible = rmNorm(roomName);
  const zone = ((LOGGIA_INDEX && LOGGIA_INDEX.areaList) || []).find(z => rmNorm(z.name) === cible);
  return zone ? capteurBruit(zone.entities, S) : null;
}

/**
 * Habillage d'une piece : icone, couleur, teinte de fond.
 *
 * Trois sources, dans l'ordre : l'icone que Home Assistant porte sur la ZONE,
 * puis la table des pieces connues, puis une reconnaissance par mots. Un nom
 * inconnu recoit un habillage neutre plutot que d'etre ignore.
 *
 * Cette fonction vit au niveau du module parce que DEUX vues en ont besoin —
 * les cartes de l'accueil et la barre de navigation entre pieces. Chacune
 * avait sa propre regle : la carte reconnaissait « Chambre Lino » par le mot
 * « chambre », la barre exigeait une egalite exacte et retombait sur une
 * maison. La meme piece portait donc deux icones selon l'endroit.
 */
/* Les mots sont ceux des SEPT langues (23/09/2026).
 *
 * La table ne connaissait que le francais et l'anglais. Une maison allemande
 * dont les zones s'appellent « Wohnzimmer » et « Kueche » recevait donc la
 * maison neutre partout : Loggia parle sa langue, mais ne reconnait pas ses
 * pieces. Le nom est compare EN MINUSCULES et sans retirer les accents — les
 * formes accentuees sont donc ecrites telles quelles, et les variantes sans
 * accent (kueche, bano, lazienka) ajoutees a cote.
 *
 * L'ordre compte : la chambre d'enfant passe avant la chambre, sans quoi elle
 * ne serait jamais atteinte. Meme vocabulaire que `LIGHT_ROOM`, qui range deja
 * les luminaires ainsi — lui n'a que le francais et l'anglais, parce qu'il lit
 * des `entity_id`, pas des noms de zone. */
const PARENTE = [
  [/enfant|kid|child|bebe|bébé|nursery|kinderzimmer|kinderkamer|cameretta|infantil|dzieci/, 'Chambre enfant'],
  [/chambre|bedroom|schlafzimmer|slaapkamer|camera|dormitorio|sypialnia/, 'Chambre'],
  [/sejour|séjour|salon|salón|living|wohnzimmer|woonkamer|soggiorno|salotto|sala\b|pok[oó]j dzienny/, 'Séjour'],
  [/cuisine|kitchen|küche|kueche|keuken|cucina|cocina|kuchnia/, 'Cuisine'],
  [/bureau|office|atelier|büro|buero|kantoor|studio|ufficio|despacho|oficina|biuro|gabinet/, 'Bureau'],
  [/sdb|bain|douche|bathroom|salle d ?'?eau|badezimmer|badkamer|bagno|baño|bano|łazienka|lazienka|\bbad\b/, 'Salle de bain'],
  [/exter|extér|jardin|terrasse|balcon|outdoor|garten|tuin|giardino|jardín|ogr[oó]d|terras|terrazza|terraza|taras|balkon/, 'Extérieur'],
];

/* Les teintes qu'une piece peut choisir (fiche « Ajouter une piece », maquette
 * du 15/09) : les memes jetons que les modeles, rien d'autre — une couleur
 * libre ne suivrait aucun theme. */
const TEINTES_PIECE = [
  { id: 'accent', label: 'Accent', col: 'var(--o-accent-soft)', rgb: 'var(--o-accent-soft-rgb)' },
  { id: 'ambre', label: 'Ambre', col: 'var(--o-piece-ambre)', rgb: 'var(--o-piece-ambre-rgb)' },
  { id: 'tendre', label: 'Tendre', col: 'var(--o-piece-tendre)', rgb: 'var(--o-piece-tendre-rgb)' },
  { id: 'chambre', label: 'Chambre', col: 'var(--o-piece-chambre)', rgb: 'var(--o-piece-chambre-rgb)' },
  { id: 'bain', label: 'Bain', col: 'var(--o-piece-bain)', rgb: 'var(--o-piece-bain-rgb)' },
  { id: 'vert', label: 'Vert', col: 'var(--o-piece-vert)', rgb: 'var(--o-piece-vert-rgb)' },
];
/* Les icones proposees a une piece : trente, par pages de dix — deux lignes
 * de cinq, retour user du 15/09 — toutes rendables, dessin maison ou police
 * regular (tests/icones.test.mjs le verifie). « bath » n'existe pas dans la
 * police : la baignoire est `hot-tub`, comme le modele Salle de bain. */
const ICONES_PIECE = [
  'couch', 'utensils', 'bed-alt', 'teddy-bear', 'briefcase', 'hot-tub', 'home', 'house-chimney', 'tree', 'paw',
  'garage', 'car', 'door-open', 'computer', 'gamepad', 'book', 'coffee', 'baby-carriage', 'flower-tulip', 'leaf',
  'sun', 'umbrella-beach', 'swimmer', 'gym', 'music-alt', 'film', 'hammer', 'box', 'bolt', 'flame',
];

/** Le modele de piece le plus proche d'un nom, ou null. */
function modeleDePiece(nom) {
  const exact = PIECES.find(x => x.name === nom);
  if (exact) return exact;
  const parent = PARENTE.find(([re]) => re.test(String(nom).toLowerCase()));
  return (parent && PIECES.find(x => x.name === parent[1])) || null;
}

/**
 * La couleur d'une piece.
 *
 * Elle se lit sur l'icone du modele, PAS sur `tc` : pour le Sejour et
 * l'Exterieur les deux different — un arbre vert devenait bleu clair.
 */
function couleurDePiece(modele) {
  return (modele && modele.icon && modele.icon.props && modele.icon.props.color)
    || (modele && modele.tc) || 'var(--o-accent)';
}

/* Ce que la configuration dit d'une piece en plus de ses capteurs : l'icone
 * (un nom de la police) et la teinte (un identifiant de `TEINTES_PIECE`). Lu
 * dans `loggia_rooms` tel quel — `normRooms` garde ces champs, Parametres
 * les conserve a l'enregistrement. */
function personnalisationPiece(nom) {
  const raw = cfgVal('loggia_rooms', null);
  const r = Array.isArray(raw) ? raw.find(x => x && x.room === nom) : null;
  return {
    icon: (r && typeof r.icon === 'string' && r.icon) || null,
    teinte: (r && TEINTES_PIECE.some(t => t.id === r.teinte)) ? r.teinte : null,
  };
}
/* La teinte d'une piece : celle qu'elle a choisie, sinon celle de son modele
 * (lue sur l'icone, PAS sur `tc` — voir `couleurDePiece`), sinon l'accent. */
function teinteDePiece(nom, modele) {
  const perso = personnalisationPiece(nom);
  const choisie = perso.teinte && TEINTES_PIECE.find(t => t.id === perso.teinte);
  if (choisie) return { ...choisie, choisie: true };
  const col = couleurDePiece(modele);
  return { ...(TEINTES_PIECE.find(t => t.col === col) || TEINTES_PIECE[0]), choisie: false };
}

/* L'habillage d'une piece : nom, lavis, icone, couleur. L'icone choisie dans
 * la fiche prime, puis celle de la zone Home Assistant (`mdi`), puis le
 * modele, puis une maison. Une teinte choisie s'applique EN ENTIER — lavis,
 * icone et releve (`tc`) — jamais reduite a l'icone ; sans choix, le modele
 * garde exactement ses couleurs d'avant. */
function habillagePiece(nom, mdi) {
  const modele = modeleDePiece(nom);
  const perso = personnalisationPiece(nom);
  const teinte = teinteDePiece(nom, modele);
  const glyphe = perso.icon || uiconDeMdi(mdi) || (modele && modele.icon && modele.icon.props && modele.icon.props.name) || 'home';
  const base = modele || { box: 44, rad: 13, status: { kind: 'repos' } };
  const propre = teinte.choisie || !modele;
  return {
    ...base,
    name: nom,
    bg: propre ? 'rgba(' + teinte.rgb + ',.16)' : modele.bg,
    tc: propre ? teinte.col : modele.tc,
    icon: <Ico name={glyphe} color={teinte.col} size={22} />,
    col: teinte.col,
    rgb: teinte.rgb,
    glyphe,
    teinte: teinte.id,
  };
}

export { PIECES, capteurBruitPiece, TEINTES_PIECE, ICONES_PIECE, habillagePiece };
