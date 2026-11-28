/* ── L'espèce d'une plante, par Open Plantbook (ADR 0390) ────────────────────────────────────────────────────────────────────
 *
 * Un administrateur choisit l'espèce d'une plante dans sa fiche. Loggia ne parle pas à Open Plantbook : il passe par l'intégration
 * `openplantbook` de Home Assistant, qui garde les clés du compte. Deux actions, leur réponse lue directement (`return_response`) :
 *  1. `openplantbook.search` (`alias` : ce qu'on tape) rend `{ pid: display_pid }` ;
 *  2. `openplantbook.get` (`species` : le `pid` choisi) rend la fiche de l'espèce — ses plages (`min_soil_moist`, `max_soil_moist`,
 *     `min_temp`, `max_temp` en °C, `min_light_lux`, `max_light_lux`, `min_soil_ec`, `max_soil_ec`), `display_pid` et `image_url`.
 *     L'intégration la recopie aussi dans l'entité `openplantbook.<pid>`, relue à défaut de réponse.
 * Ce que `get` rend, Loggia le GARDE dans `loggia_plants` (`espece`) : l'entité de l'espèce s'efface avec le cache de l'intégration
 * et ne survit pas à un redémarrage de Home Assistant. La plante se juge ensuite sur ces plages (`plagesPlante`, plantes.js).
 *
 * Pur : pas de React. Chargé avec la fiche de la plante, jamais au démarrage.
 */
import { especeValide } from './plantes.js';

export const CLE_PLANTES = 'loggia_plants';

/** Open Plantbook est-il là, ses deux actions publiées (règle 46) ? Les services vivants de Home Assistant font foi ; sans eux, ceux
 *  que l'index du composant a lus au démarrage. */
export function plantbookDisponible(hass, index = null) {
  const a = (s) => !!(s && s.openplantbook && s.openplantbook.search && s.openplantbook.get);
  const vivants = hass && hass.services && typeof hass.services === 'object' && Object.keys(hass.services).length ? hass.services : null;
  return vivants ? a(vivants) : a(index && index.services);
}

// La réponse d'une action, telle que Home Assistant la rend (`{ context, response }`), ou nue.
const reponse = (r) => (r && typeof r === 'object' && r.response && typeof r.response === 'object' ? r.response : r && typeof r === 'object' ? r : {});

/** Les espèces trouvées, dans l'ordre d'Open Plantbook : `[{ pid, nom }]` — trente au plus. */
export function resultatsRecherche(r) {
  const o = reponse(r);
  return Object.keys(o).filter(pid => pid && typeof o[pid] === 'string').slice(0, 30).map(pid => ({ pid, nom: o[pid] || pid }));
}

/* Le dessin d'une espèce, par son GENRE (le premier mot du `pid`) : une famille de formes d'intérieur par dessin de
 * `public/plantes/`. Un genre absent prend le dessin neutre, `plante`. Quelques espèces ne ressemblent pas à leur genre. */
const GENRES_DESSIN = {
  monstera: 'monstera thaumatophyllum rhaphidophora amydrium',
  ficus: 'ficus citrus olea laurus coffea gardenia camellia murraya myrtus radermachera',
  sansevieria: 'sansevieria',
  cactus: 'opuntia echinocactus echinopsis mammillaria cereus cleistocactus ferocactus gymnocalycium astrophytum rebutia pilosocereus espostoa stenocereus carnegiea myrtillocactus parodia notocactus melocactus trichocereus euphorbia',
  succulente: 'echeveria crassula sedum sempervivum graptopetalum graptoveria aeonium pachyphytum kalanchoe lithops portulacaria',
  aloe: 'aloe agave haworthia haworthiopsis gasteria dyckia',
  pothos: 'epipremnum scindapsus philodendron syngonium hedera hoya tradescantia ceropegia dischidia callisia cissus plectranthus schlumbergera rhipsalis epiphyllum senecio curio',
  fougere: 'nephrolepis asplenium adiantum pteris davallia platycerium polypodium phlebodium blechnum cyrtomium microsorum polystichum dryopteris athyrium',
  palmier: 'chamaedorea dypsis howea rhapis phoenix livistona washingtonia chamaerops trachycarpus caryota ravenea archontophoenix areca cycas zamia',
  orchidee: 'phalaenopsis dendrobium oncidium cattleya vanda cymbidium paphiopedilum miltonia miltoniopsis zygopetalum ludisia masdevallia odontoglossum brassia epidendrum laelia',
  spathiphyllum: 'spathiphyllum zantedeschia',
  anthurium: 'anthurium',
  calathea: 'calathea goeppertia maranta ctenanthe stromanthe aglaonema dieffenbachia aspidistra alocasia colocasia caladium xanthosoma strelitzia musa',
  zamioculcas: 'zamioculcas',
  chlorophytum: 'chlorophytum carex ophiopogon liriope cyperus acorus allium',
  aromatique: 'ocimum mentha petroselinum thymus rosmarinus salvia origanum melissa coriandrum anethum lavandula capsicum solanum fragaria fittonia hypoestes coleus',
  pilea: 'pilea peperomia hydrocotyle oxalis begonia',
  schefflera: 'schefflera heptapleurum brassaia pachira fatsia polyscias',
  dracaena: 'dracaena cordyline yucca beaucarnea pandanus nolina',
};
const ESPECES_DESSIN = { 'dracaena trifasciata': 'sansevieria', 'dracaena angolensis': 'sansevieria', 'philodendron bipinnatifidum': 'monstera',
  'philodendron selloum': 'monstera', 'ficus pumila': 'pothos', 'plectranthus scutellarioides': 'aromatique', 'euphorbia pulcherrima': 'plante' };

/** Le dessin de la carte pour une espèce d'Open Plantbook (son `pid`) : une clé de `PLANT_ART` — `plante` quand son genre n'a pas de
 *  dessin. Un hybride (« x graptoveria ») se lit par son genre. */
export function dessinEspece(pid) {
  const p = String(pid || '').toLowerCase().trim().replace(/\s+/g, ' ');
  if (ESPECES_DESSIN[p]) return ESPECES_DESSIN[p];
  const genre = p.split(' ').filter(m => m !== 'x' && m !== '×').map(m => m.replace(/[^a-z]/g, ''))[0] || '';
  return Object.keys(GENRES_DESSIN).find(k => GENRES_DESSIN[k].split(' ').includes(genre)) || 'plante';
}

/** L'espèce lue dans la fiche d'Open Plantbook : `{ pid, nom, image, plages, dessin }` (`especeValide`), ou null. Une plage illisible —
 *  un seuil manquant, le bas au-dessus du haut — reste à la table générale. Le dessin se choisit ici, avec l'espèce, et se garde avec
 *  elle : la carte, au démarrage, n'emporte pas la table des genres. */
export function especeDeOpb(d) {
  if (!d || typeof d !== 'object' || typeof d.pid !== 'string' || !d.pid) return null;
  const n = (x) => { const v = typeof x === 'number' ? x : typeof x === 'string' && x.trim() ? Number(x) : NaN; return Number.isFinite(v) ? v : null; };
  const p = (k) => [n(d['min_' + k]), n(d['max_' + k])];
  return especeValide({ pid: d.pid, nom: typeof d.display_pid === 'string' && d.display_pid ? d.display_pid : d.pid, image: d.image_url,
    plages: { hum: p('soil_moist'), temp: p('temp'), lux: p('light_lux'), cond: p('soil_ec') }, dessin: dessinEspece(d.pid) });
}

// L'entité de l'espèce, à défaut de réponse : celle du domaine `openplantbook` qui porte ce `pid`.
const entiteEspece = (S, pid) => {
  const id = Object.keys(S || {}).find(e => e.indexOf('openplantbook.') === 0 && S[e] && S[e].attributes && S[e].attributes.pid === pid);
  return id ? S[id].attributes : null;
};
/* Un appel, borné à 20 s : Open Plantbook est sur Internet, et une réponse qui ne vient jamais laisserait « Recherche… » à l'écran et
 * les espèces trouvées hors d'atteinte. Passé le délai, c'est l'intégration qui ne répond pas. */
const DELAI_PLANTBOOK = 20000;
const appel = (hass, service, service_data) => new Promise((ok, ko) => {
  const t = setTimeout(() => ko(new Error('délai dépassé')), DELAI_PLANTBOOK);
  Promise.resolve().then(() => hass.callWS({ type: 'call_service', domain: 'openplantbook', service, service_data, return_response: true }))
    .then((r) => { clearTimeout(t); ok(r); }, (e) => { clearTimeout(t); ko(e); });
});

/** Chercher une espèce : `[{ pid, nom }]`. */
export function chercherEspeces(hass, alias) {
  return appel(hass, 'search', { alias }).then(resultatsRecherche);
}

/** Lire une espèce : `{ pid, nom, image, plages }`, ou null si Open Plantbook ne la connaît pas. */
export function lireEspece(hass, pid) {
  return appel(hass, 'get', { species: pid }).then(r => especeDeOpb(reponse(r)) || especeDeOpb(entiteEspece(hass && hass.states, pid)));
}

/** `loggia_plants` avec l'espèce de la plante `base` posée — ou retirée (`espece` nul). Une plante découverte sans configuration y
 *  entre par sa base seule, marquée `decouverte` : la ligne ne fait que la compléter — ni nom ni pièce figés, et sans sa plante elle se
 *  tait (`plantesMaison`). Retirer l'espèce retire une telle ligne ; une ligne écrite à la main reste, sans espèce. Les autres lignes
 *  ne bougent pas. */
export function poserEspece(brut, base, espece) {
  const l = Array.isArray(brut) ? brut.slice() : [];
  const i = l.findIndex(p => p && typeof p === 'object' && p.base === base);
  if (i < 0) return espece ? l.concat([{ base, decouverte: true, espece }]) : l;
  const reste = { ...l[i] };
  delete reste.espece;
  if (espece) l[i] = { ...reste, espece };
  else if (reste.decouverte && Object.keys(reste).every(k => k === 'base' || k === 'decouverte')) l.splice(i, 1);
  else l[i] = reste;
  return l;
}

/** Ce qui a mal tourné, en un mot : 'limite' quand Open Plantbook refuse pour le quota du compte, 'panne' sinon. */
export function genreErreur(e) {
  const m = String((e && (e.message || e.code)) || '');
  return /rate.?limit/i.test(m) ? 'limite' : 'panne';
}
