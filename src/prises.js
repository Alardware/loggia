/**
 * Ce qu'il y a AU BOUT d'une prise (26/09).
 *
 * Une prise commandée ne dit rien d'elle-même : Home Assistant publie `on` ou
 * `off`, et c'est tout. Toutes portaient donc le même dessin et le même mot —
 * « Allumée ». Or « allumée » ne veut rien dire seule : un NAS allumé travaille,
 * une cafetière allumée chauffe, un lave-vaisselle allumé peut aussi bien être
 * en veille à 1 W. Trois situations, un seul mot, aucune couleur.
 *
 * Ce module porte la connaissance manquante : ce qu'est l'appareil, la couleur
 * et le glyphe qui le disent, et ce que sa consommation raconte de lui.
 *
 * Trois règles qu'il ne franchit pas :
 *   — il est PUR : aucun DOM, aucun état, aucune lecture de configuration ;
 *   — il ne connaît que des JETONS de couleur, jamais une couleur en dur, pour
 *     que les quinze thèmes restent maîtres chez eux ;
 *   — il ne devine rien qu'il ne puisse voir. Sans capteur de puissance, une
 *     prise reste une prise allumée : pas de phase inventée, pas de barre de
 *     progression tirée d'une moyenne.
 *
 * Depuis le chantier Prises (13/10, docs/chantier-prises.md), il dit aussi CE
 * QU'EST une prise (P1, § 6.4 : `estPrise`, le jumeau d'un module du serveur,
 * tenus d'accord par tests/fixtures/prises_parite.json) et la phrase d'état de
 * sa carte et de sa fiche (§ 4 : `ligneDePrise`, `phrasePrise`), le chiffre
 * de sa puissance et le dessin de sa courbe du jour (§ 3.1 : `puissancePrise`,
 * `cheminsCourbe`). Il est dans le paquet de démarrage : la carte, la
 * compacte et Objets s'en servent.
 */

import { tr, locale } from './i18n.js';
import { nombre, fmtWatts } from './format.js';

/**
 * Les appareils que Loggia sait reconnaître : la couleur qui les dit (un
 * jeton, et son « r,g,b » pour les lavis) et leur glyphe — un nom de la
 * fonte, ou un appareil dessiné (`icones.jsx`) ; `null`, le dessin de prise
 * de Loggia.
 *
 * Depuis le chantier Prises (P10, P11), ni mouvement ni mot à eux : la
 * maquette est immobile, et la phrase d'état (§ 4) dit ce que fait l'appareil
 * — « En marche depuis 08:50 » —, plus les mots d'avant. Il y
 * avait eu, avant, une lueur qui respirait derrière l'icône : « derrière
 * l'icône il y a un pulse lumineux, j'en veux pas, je veux les icônes que je
 * t'ai données » (26/09). Les glyphes restent ceux-là (P12).
 */
export const TYPES_PRISE = {
  nas: { col: 'var(--o-purple)', rgb: 'var(--o-purple-rgb)', ico: 'database' },
  pc: { col: 'var(--o-piece-ambre)', rgb: 'var(--o-piece-ambre-rgb)', ico: 'computer' },
  // Le cyan de sa maquette « Cartes prises » (chantier Prises, P12) : ses couleurs s'appliquent en entier.
  lv: { col: 'var(--o-cyan)', rgb: 'var(--o-cyan-rgb)', ico: 'dishwasher' },
  ll: { col: 'var(--o-piece-tendre)', rgb: 'var(--o-piece-tendre-rgb)', ico: 'washer' },
  sl: { col: 'var(--o-gold)', rgb: 'var(--o-gold-rgb)', ico: 'dryer' },
  /* Le fer, demande par Seba882 (issue #6) : « un fer sur prise commandée,
   * c'est souvent la raison même pour laquelle la prise est là — vérifier
   * depuis le travail qu'il est bien éteint ». Et la veille lui va mieux qu'à
   * tout le reste : un fer ne consomme rien, ou tire 2 000 W.
   *
   * Il était parti avec le revert de la première v3.78.0 et n'était jamais
   * revenu — son DESSIN est rentré avec le catalogue du 30/09, mais rien ne le
   * reconnaissait plus. Une prise nommée « fer à repasser » restait générique. */
  fer: { col: 'var(--o-orange)', rgb: 'var(--o-orange-rgb)', ico: 'iron' },
  frigo: { col: 'var(--o-cold)', rgb: 'var(--o-cold-rgb)', ico: 'fridge' },
  tv: { col: 'var(--o-piece-chambre)', rgb: 'var(--o-piece-chambre-rgb)', ico: 'tv-set' },
  cafe: { col: 'var(--o-warn)', rgb: 'var(--o-warn-rgb)', ico: 'coffee-machine' },
  radia: { col: 'var(--o-warn2)', rgb: 'var(--o-warn2-rgb)', ico: 'radiator' },
  box: { col: 'var(--o-accent-soft)', rgb: 'var(--o-accent-soft-rgb)', ico: 'hub' },
  ve: { col: 'var(--o-ok)', rgb: 'var(--o-ok-rgb)', ico: 'charging-station' },
  siren: { col: 'var(--o-bad)', rgb: 'var(--o-bad-rgb)', ico: 'bell-ring' },
  prise: { col: 'var(--o-accent-soft)', rgb: 'var(--o-accent-soft-rgb)', ico: null },
};

/** Le nom de chaque appareil, dans la langue affichée. */
export const NOMS_PRISE = () => ({
  nas: tr('Serveur NAS'),
  pc: tr('Ordinateur'),
  lv: tr('Lave-vaisselle'),
  ll: tr('Lave-linge'),
  sl: tr('Sèche-linge'),
  fer: tr('Fer à repasser'),
  frigo: tr('Réfrigérateur'),
  tv: tr('Télévision'),
  cafe: tr('Cafetière'),
  radia: tr('Radiateur'),
  box: tr('Box internet'),
  ve: tr('Borne de recharge'),
  siren: tr('Sirène'),
  prise: tr('Prise'),
});

/** Les mots qui trahissent un appareil. L'ORDRE compte : « sèche-linge » avant
 *  « linge », et « lave-vaisselle » avant « lave ».
 *
 *  Le polonais s'ajoute au français et à l'anglais. Deux mots y demandent la
 *  même prudence d'ordre que « sèche-linge » : `suszarka` désigne aussi bien un
 *  sèche-linge qu'un sèche-cheveux, et vient donc AVANT `pralka` — une prise
 *  nommée « suszarka » est plus souvent un sèche-linge qu'autre chose, mais ne
 *  doit jamais passer pour un lave-linge. `ekspres` est le mot courant pour la
 *  machine à café ; il ne veut rien dire d'autre sur une prise.
 *
 *  Les accents polonais se réduisent comme les français (`lodówka` → `lodowka`)
 *  une fois le `ł` traité dans `aplati` — les mots s'écrivent donc à plat ici.
 *
 *  L'allemand, le néerlandais, l'italien et l'espagnol suivent (audit du 19/10) :
 *  à chaque type ses mots, à la suite des siens, les mots polonais intouchés.
 *  La PREMIÈRE ligne rend une prise ordinaire : ce sont les faux amis, lus
 *  avant tout le reste — un sèche-cheveux n'est pas un sèche-linge (`dryer`,
 *  `suszarka`), la recharge d'un vélo n'est pas une borne (`recharge`), une
 *  lampe en fer forgé n'est pas un fer. `projecteur` (un projecteur de jardin)
 *  et `tour` (un ventilateur tour) sont partis : trop de sens pour un seul mot.
 */
const MOTS_PRISE = [
  ['prise', ['hair dryer', 'seche cheveux', 'suszarka do wlosow', 'fer forge', 'chemin de fer', 'velo', 'trottinette', 'bike', 'ebike', 'e bike', 'scooter', 'fahrrad', 'fiets', 'bici', 'bicicletta', 'bicicleta', 'monopattino', 'patinete', 'rower', 'hulajnoga']],
  ['lv', ['lave vaisselle', 'lavevaisselle', 'dishwasher', 'vaisselle', 'zmywarka', 'lv', 'geschirrspuler', 'spulmaschine', 'geschirrspulmaschine', 'vaatwasser', 'vaatwasmachine', 'lavastoviglie', 'lavavajillas', 'lavaplatos']],
  ['sl', ['seche linge', 'sechelinge', 'dryer', 'tumble', 'suszarka', 'sl', 'trockner', 'waschetrockner', 'droger', 'wasdroger', 'droogtrommel', 'asciugatrice', 'secadora']],
  ['ll', ['lave linge', 'lavelinge', 'machine a laver', 'washer', 'washing', 'lessive', 'pralka', 'll', 'waschmaschine', 'waschautomat', 'wasmachine', 'lavatrice', 'lavadora']],
  ['fer', ['fer a repasser', 'fer', 'repassage', 'centrale vapeur', 'iron', 'zelazko', 'bugeleisen', 'dampfbugeleisen', 'strijkijzer', 'strijkbout', 'ferro da stiro', 'ferro stiro', 'plancha de vapor', 'centro de planchado']],
  ['frigo', ['frigo', 'refrigerateur', 'fridge', 'refrigerator', 'congelateur', 'freezer', 'lodowka', 'zamrazarka', 'chlodziarka', 'kuhlschrank', 'gefrierschrank', 'gefriertruhe', 'kuhltruhe', 'koelkast', 'vriezer', 'diepvries', 'frigorifero', 'congelatore', 'frigorifico', 'nevera', 'congelador', 'refrigerador']],
  ['cafe', ['cafetiere', 'machine a cafe', 'coffee', 'expresso', 'espresso', 'percolateur', 'ekspres', 'kaffeemaschine', 'kaffeevollautomat', 'koffiezetapparaat', 'koffiemachine', 'macchina caffe', 'macchina del caffe', 'caffettiera', 'cafetera', 'maquina de cafe', 'maquina cafe']],
  ['ve', ['borne', 'recharge', 'wallbox', 'chargeur voiture', 'voiture electrique', 'ev charger', 'stacja ladowania', 'ladesaule', 'elektroauto', 'laadpaal', 'colonnina', 'punto de recarga', 'cargador coche']],
  ['nas', ['nas', 'synology', 'serveur', 'server', 'homelab', 'unraid', 'serwer', 'servidor']],
  ['pc', ['pc', 'ordinateur', 'computer', 'imac', 'macbook', 'desktop', 'workstation', 'komputer', 'unite centrale', 'rechner', 'ordenador', 'computadora']],
  ['tv', ['tv', 'tele', 'television', 'televiseur', 'oled', 'videoprojecteur', 'telewizor', 'video projecteur', 'projecteur video', 'beamer', 'fernseher', 'televisie', 'televisore', 'televisione', 'televisor']],
  ['box', ['box', 'routeur', 'router', 'fibre', 'livebox', 'freebox', 'bbox', 'modem', 'fritzbox', 'fritz box', 'enrutador']],
  ['radia', ['radiateur', 'convecteur', 'chauffage', 'seche serviette', 'heater', 'radiator', 'grzejnik', 'kaloryfer', 'ogrzewanie', 'seche serviettes', 'heizung', 'heizkorper', 'heizlufter', 'handtuchwarmer', 'kachel', 'handdoekradiator', 'radiatore', 'termosifone', 'stufa', 'scaldasalviette', 'radiador', 'calefactor', 'estufa', 'toallero']],
  ['siren', ['sirene', 'siren', 'alarme sonore', 'syrena', 'sirena']],
];

/** Le nom reduit a ses MOTS, separes par une espace, borne aux deux bouts.
 *
 *  Compare en sous-chaine, `iron` se cache dans « environnement », `box` dans
 *  « boxe », `tele` dans « telephone ». Decouper sur tout ce qui n'est ni
 *  lettre ni chiffre regle le cas general — et rend inutiles les espaces qu'il
 *  fallait ecrire a la main dans ` lv `, ` ll `, ` sl `.
 *
 *  Les mots composes marchent pareil : « lave vaisselle » se retrouve tel quel
 *  dans « prise lave vaisselle cuisine », separateurs normalises des deux
 *  cotes.
 */
const enMots = (s) => ' ' + aplati(s).replace(/[^a-z0-9]+/g, ' ').trim() + ' ';

/** Sans accents, sans casse : « Prise Réfrigérateur » et « prise refrigerateur »
 *  doivent se reconnaître pareil. */
const aplati = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  // Le « l barre » polonais n'a PAS de decomposition NFD : `ł` reste `ł` la ou
  // `ó` devient `o`. Sans cette ligne, « chłodziarka » se couperait en deux au
  // decoupage en mots.
  .replace(/ł/g, 'l').replace(/Ł/g, 'L')
  .toLowerCase();

/**
 * L'appareil derrière une prise, d'après son nom.
 *
 * Rien d'autre n'est disponible côté navigateur : Home Assistant ne publie ni
 * marque ni modèle pour une prise commandée, et sa `device_class` ne connaît
 * que « outlet » et « switch ». Le nom que l'utilisateur a donné est donc la
 * seule source — et c'est une bonne source, parce qu'il l'a écrit pour lui.
 *
 * `impose` court-circuite tout : c'est le type qu'on a choisi à la main.
 * Aucune correspondance : « prise », qui ne prétend rien.
 */
export function typeDePrise(nom, impose = null, indice = '') {
  if (impose && TYPES_PRISE[impose]) return impose;
  // Le nom AFFICHE, puis l'identifiant : une prise peut s'appeler « Prise 3 »
  // et s'appeler `switch.lave_vaisselle` dessous. Les deux comptent.
  const n = enMots(aplati(nom) + ' ' + aplati(indice));
  for (const [type, mots] of MOTS_PRISE) {
    for (const m of mots) if (n.indexOf(enMots(m)) >= 0) return type;
  }
  return 'prise';
}

/* ── Ce qu'est une prise (chantier Prises, P1, § 6.4) ─────────────────────────
 *
 * Une prise est un SWITCH QUI MESURE : son appareil porte un capteur `power`
 * ou `energy` sans catégorie, ou bien il a la classe `outlet`. Ni un switch de
 * configuration, ni l'interrupteur d'un module fil pilote (un chauffage), ni
 * un switch déclaré lumière, ni le pont de Zigbee2MQTT (Paramètres ›
 * Interrupteurs), ni une sirène (Sécurité). Depuis l'audit du 19/10, ni le
 * voyant ou le verrou enfant qu'un appareil publie SANS catégorie à côté de sa
 * sortie (`sortiesDe`), ni le relais d'un compteur de la maison
 * (`compteursMaison`). Les autres switch rejoignent IoT.
 *
 * La MÊME règle est écrite côté serveur (son jumeau Python, plan 1) : la
 * fixture partagée `tests/fixtures/prises_parite.json` les tient d'accord.
 * Les arguments sont ceux de la fixture : l'entité, son appareil (fabricant,
 * modèle, nom facultatif, ou `null`), ses sœurs — les entités du même
 * appareil, le switch en moins —, trois verdicts que l'appelant connaît mieux
 * qu'ici (la lumière déclarée, le module fil pilote, la sirène : `estSirene`)
 * et, s'il les a, les compteurs de la maison.
 */

/** Le pont de Zigbee2MQTT : reconnu à son APPAREIL — fabricant « Zigbee2MQTT »,
 *  modèle « Bridge », au caractère près comme le jumeau du serveur (un groupe
 *  Zigbee2MQTT, modèle « Group », n'est pas le pont) —, jamais à un nom
 *  d'entité. */
export function estPontZigbee(appareil) {
  return !!appareil && appareil.fabricant === 'Zigbee2MQTT' && appareil.modele === 'Bridge';
}

/** Les mots d'un nom, à plat, sans doublon. */
const motsDe = (nom) => new Set(enMots(nom).split(' ').filter(Boolean));
/** Les mots d'un identifiant, domaine ôté : `switch.shelly_2pm_switch_0` → shelly, 2pm, switch, 0. */
const motsId = (s) => motsDe(String(s.entity_id || '').replace(/^[^.]*\./, ''));
/** Les mots que TOUS les ensembles partagent. */
const communs = (ens) => (ens.length ? [...ens[0]].filter(m => ens.every(x => x.has(m))) : []);
const dans = (c, id) => !!c && (typeof c.has === 'function' ? c.has(id) : Array.isArray(c) && c.indexOf(id) >= 0);

/** Ce qui dit un switch de RÉGLAGE — le voyant, le verrou enfant, l'état au
 *  retour du courant —, en sept langues, lu dans le nom et l'identifiant. Il
 *  ne sert que sur un appareil qui porte PLUSIEURS switch sans catégorie
 *  (ESPHome `athom_plug_led`, LocalTuya « Verrou enfant ») : une prise seule
 *  nommée « Bandeau LED » reste une prise. Le jumeau du serveur a la même liste. */
const MOTS_REGLAGE = 'led|voyant|indicateur|indicator|status light|backlight|retroeclairage|verrou|verrouillage|securite enfant|lock|comportement|power on behavior|power on behaviour|restore|restauration|kindersicherung|tastensperre|sperre|anzeige|kontrollleuchte|statusleuchte|einschaltverhalten|kinderslot|kinderbeveiliging|vergrendeling|statuslampje|inschakelgedrag|blocco|sicurezza bambini|indicatore|spia|ripristino|bloqueo|indicador|luz indicadora|blokada|dioda|wskaznik|kontrolka|podswietlenie'.split('|');
const reglage = (s) => { const n = enMots((s.nom || '') + ' ' + (s.entity_id || '')); return MOTS_REGLAGE.some(m => n.indexOf(' ' + m + ' ') >= 0); };

/** Les SORTIES d'un appareil : ses switch sans catégorie. S'il en porte
 *  plusieurs, ceux de classe `outlet` s'il y en a ; sinon tous, moins les
 *  réglages — jamais aucun. Ce qui n'est pas une sortie n'est pas une prise. */
function sortiesDe(tous) {
  const sw = tous.filter(s => !s.entity_category && String(s.entity_id || '').indexOf('switch.') === 0);
  if (sw.length < 2) return sw;
  const outlet = sw.filter(s => s.device_class === 'outlet');
  const vraies = sw.filter(s => !reglage(s));
  return outlet.length ? outlet : vraies.length ? vraies : sw;
}

/** Les capteurs `classe` d'un appareil : des `sensor.` sans catégorie, par identifiant. */
const mesuresDe = (tous, classe) => tous.filter(s => !s.entity_category && s.device_class === classe && String(s.entity_id || '').indexOf('sensor.') === 0)
  .sort((a, b) => (a.entity_id < b.entity_id ? -1 : a.entity_id > b.entity_id ? 1 : 0));

/**
 * Le capteur de classe `classe` qui revient à la sortie `e`, ou `null`.
 *
 * UNE sortie sur l'appareil : seul, le capteur est le sien, quel que soit son
 * nom. Plusieurs — l'appareil qui porte tous les capteurs d'énergie de la
 * maison, comme celui du poêle chez lui —, celui dont le nom partage le plus
 * de mots avec le sien, le premier par identifiant à égalité ; aucun mot
 * commun, aucun : on ne dessine jamais la puissance de la maison sur une prise.
 *
 * PLUSIEURS sorties — une multiprise, un Shelly 2PM, un double relais Fibaro
 * (audit du 19/10) : Home Assistant préfixe chaque entité du nom de son
 * appareil, et toutes les sorties partageaient ce mot avec le compteur
 * COMMUN. Les mots de l'appareil ne comptent donc plus (son nom, s'il est
 * donné ; ceux que toutes les sorties partagent, dans leur nom ou leur
 * identifiant). À égalité, le numéro de canal de l'identifiant départage
 * (`switch_0` ↔ `switch_0_power`, `relais` ↔ `consumption_w`, `relais_2` ↔
 * `consumption_w_2`) ; sinon aucun. Et un capteur que deux sorties réclament
 * n'est à aucune : la sortie d'une multiprise n'emprunte jamais le compteur
 * commun à toutes.
 */
function capteurDe(e, tous, sorties, classe, nomAppareil) {
  const candidats = mesuresDe(tous, classe);
  if (sorties.length < 2) {
    if (candidats.length === 1) return candidats[0].entity_id;
    const siens = motsDe(e.nom);
    let pris = null, meilleur = 0;
    for (const s of candidats) {
      let n = 0;
      for (const m of motsDe(s.nom)) if (siens.has(m)) n += 1;
      if (n > meilleur) { pris = s.entity_id; meilleur = n; }
    }
    return pris;
  }
  const exclus = new Set([...motsDe(nomAppareil), ...communs(sorties.map(s => motsDe(s.nom))), ...communs(sorties.map(motsId))]);
  const canal = (s) => [...motsId(s)].filter(m => !exclus.has(m) && /^\d+$/.test(m)).pop() || '';
  const choix = (o) => {
    const siens = [...motsDe(o.nom)].filter(m => !exclus.has(m));
    const score = (s) => { const m = motsDe(s.nom); return siens.filter(x => m.has(x)).length; };
    const meilleur = Math.max(0, ...candidats.map(score));
    let pairs = candidats.filter(s => score(s) === meilleur);
    if (pairs.length > 1 || !meilleur) pairs = pairs.filter(s => canal(s) === canal(o));
    return pairs.length === 1 ? pairs[0].entity_id : null;
  };
  const c = choix(e);
  return c && sorties.some(o => o !== e && choix(o) === c) ? null : c;
}

/** L'appareil d'une multiprise mesure-t-il ses sorties ? Un de ses capteurs
 *  porte les mots que partagent les identifiants de toutes les sorties (le
 *  nom de l'appareil, que Home Assistant préfixe), ou le nom de l'appareil
 *  s'il est donné. L'appareil de la maison — `switch.poele` et un autre switch
 *  à côté des capteurs `energie_*` — n'en a aucun. */
function mesureSesSorties(tous, sorties, nomAppareil) {
  const ids = communs(sorties.map(motsId));
  const app = [...motsDe(nomAppareil)];
  return [...mesuresDe(tous, 'power'), ...mesuresDe(tous, 'energy')].some(s => {
    const i = motsId(s), n = motsDe(s.nom);
    return (ids.length > 0 && ids.every(m => i.has(m))) || (app.length > 0 && app.every(m => n.has(m)));
  });
}

/**
 * Les COMPTEURS DE LA MAISON (décision du 19/10) : les capteurs que le tableau
 * de bord Énergie de Home Assistant (`energy/get_prefs`) déclare sources — le
 * réseau (ancien format, `flow_from` / `flow_to`, et récent, une source par
 * connexion), le solaire, la batterie, le gaz —, énergies et puissances
 * nommées. Leur appareil n'a pas de prise : le relais d'un Shelly EM, le poêle
 * posé sur l'appareil qui porte l'énergie de toute la maison. Triés ; sans
 * préférences, aucun.
 */
export function compteursMaison(prefs) {
  const vus = new Set();
  const liste = (x) => (Array.isArray(x) ? x : []);
  const lire = (o) => {
    if (!o || typeof o !== 'object') return;
    for (const k of ['stat_energy_from', 'stat_energy_to', 'stat_rate']) if (typeof o[k] === 'string' && o[k]) vus.add(o[k]);
  };
  for (const s of liste(prefs && prefs.energy_sources)) {
    if (!s || ['grid', 'solar', 'battery', 'gas'].indexOf(s.type) < 0) continue;
    lire(s);
    if (s.power_config && typeof s.power_config === 'object') for (const v of Object.values(s.power_config)) if (typeof v === 'string' && v) vus.add(v);
    for (const f of [...liste(s.flow_from), ...liste(s.flow_to), ...liste(s.power)]) lire(f);
  }
  return [...vus].sort();
}

/**
 * `{ prise, puissance, energie }` : une prise, et ses capteurs — chacun un
 * identifiant, ou `null`. Une prise « sans mesure » (aucun capteur retenu)
 * reste une prise si sa classe est `outlet`, ou si elle est la sortie d'une
 * multiprise dont l'appareil MESURE (P1 : le compteur commun mesure bien ce
 * qu'elle alimente, il n'est seulement pas à elle seule) ; sinon ce n'en est
 * pas une. Ce qui n'est pas une prise n'a pas de capteur.
 *
 * `appareil.nom` (facultatif) : le nom de l'appareil, dont les mots ne
 * départagent pas deux sorties. `compteurs` (liste ou `Set`, facultatif) :
 * `compteursMaison` — un switch posé sur l'appareil d'un compteur de la
 * maison n'est pas une prise, même `outlet`. Sans eux, rien ne change.
 */
export function estPrise({ entite = null, appareil = null, soeurs = [], lumiere = false, filPilote = false, sirene = false, compteurs = null } = {}) {
  const e = entite || {};
  const rien = { prise: false, puissance: null, energie: null };
  if (String(e.entity_id || '').indexOf('switch.') !== 0 || e.entity_category || lumiere || filPilote || sirene || estPontZigbee(appareil)) return rien;
  const tous = [e, ...(Array.isArray(soeurs) ? soeurs : []).filter(s => s && typeof s === 'object')];
  if (tous.some(s => dans(compteurs, s.entity_id))) return rien;
  const sorties = sortiesDe(tous);
  if (sorties.indexOf(e) < 0) return rien;
  const nomApp = appareil && appareil.nom;
  const puissance = capteurDe(e, tous, sorties, 'power', nomApp);
  const energie = capteurDe(e, tous, sorties, 'energy', nomApp);
  return puissance || energie || e.device_class === 'outlet' || (sorties.length > 1 && mesureSesSorties(tous, sorties, nomApp))
    ? { prise: true, puissance, energie } : rien;
}

/* ── La phrase d'état (chantier Prises, § 4) ──────────────────────────────────
 *
 * La DÉCISION d'abord (`ligneDePrise`), les mots ensuite (`phrasePrise`) :
 * la première ligne du tableau du § 4 qui s'applique. Elles remplacent les
 * mots d'avant (« Éteinte », « En veille », « Chauffe »…, P10).
 *
 *   1 muette (`unavailable`, `unknown`)          Indisponible depuis 14:20
 *   2 coupée                                     Coupée depuis 20:40
 *   3 un minuteur                                Se coupe à 21:10
 *   4 électroménager, un cycle fini aujourd'hui,
 *     moins de 2 W et aucun cycle en cours       Terminé à 16:14 · 1,08 kWh
 *   5 un cycle en cours                          En marche depuis 13:40
 *   6 allumée, sous 1 W                          À l'arrêt
 *   7 allumée, avec une mesure                   En marche depuis 08:50
 *   8 allumée, sans mesure                       Allumée depuis 08:50
 *
 * « Depuis » est le `last_changed` du switch ; une heure, aujourd'hui, une
 * date sinon (« le 2 sept. »), l'année au-delà d'un an. Les heures sont
 * celles du navigateur — ses écrans sont chez lui ; la démo fixe la sienne.
 */

/** Les appareils dont le cycle se repère (P3) : lave-vaisselle, lave-linge, sèche-linge. */
export const ELECTROMENAGER = ['lv', 'll', 'sl'];

const memeJour = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

/**
 * La ligne du § 4 qui s'applique. `st` : l'état du switch ; `mesure` : il a un
 * capteur de puissance ; `watts` : sa valeur, ou `null` ; `minuteur` : la fin
 * du minuteur en millisecondes, ou `null` ; `cycle` et `cycles` : ceux de
 * l'état du serveur (`{ debut }`, `[{ debut, fin, kwh }]`) ; `type` : le type
 * retenu. Rend `{ ligne, depuis?, fin?, kwh? }`.
 */
export function ligneDePrise({ st = null, mesure = false, watts = null, minuteur = null, cycle = null, cycles = [], type = 'prise', maintenant = Date.now() } = {}) {
  const s = st ? st.state : null;
  const depuis = st ? st.last_changed || null : null;
  if (!st || s === 'unavailable' || s === 'unknown') return { ligne: 1, depuis };
  if (s !== 'on') return { ligne: 2, depuis };
  // Un minuteur échu, pas encore relu, n'est plus un minuteur : jamais « dans 0 min » (audit des prises, 19/10).
  if (minuteur && minuteur > maintenant) return { ligne: 3, fin: minuteur };
  const w = typeof watts === 'number' && isFinite(watts) ? watts : null;
  /* Un cycle EN COURS l'emporte sur celui d'avant (relecture des tâches 1 à 6,
   * point 3) : avec un cycle le matin et un second commencé à 13:40, une pause
   * sous 2 W dirait « Terminé à 09:30 » au lieu de « En marche depuis 13:40 ».
   * La ligne 4 ne vaut donc que sans cycle en cours. */
  const enCours = !!(cycle && cycle.debut);
  if (ELECTROMENAGER.includes(type) && !enCours) {
    const fini = (Array.isArray(cycles) ? cycles : []).filter(c => c && c.fin && memeJour(c.fin, maintenant))
      .sort((a, b) => Date.parse(b.fin) - Date.parse(a.fin))[0];
    if (fini && w != null && w < 2) return { ligne: 4, fin: fini.fin, kwh: typeof fini.kwh === 'number' ? fini.kwh : null };
  }
  if (enCours) return { ligne: 5, depuis: cycle.debut };
  if (mesure && w != null && w < 1) return { ligne: 6 };
  return { ligne: mesure ? 7 : 8, depuis };
}

const heureDe = (t) => new Date(t).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });

/** « Depuis » : l'heure si c'est aujourd'hui, sinon « le 2 sept. » — l'année au-delà d'un an. */
export function quandPrise(t, maintenant = Date.now()) {
  const ms = typeof t === 'number' ? t : Date.parse(t);
  if (!isFinite(ms)) return '—';
  if (memeJour(ms, maintenant)) return heureDe(ms);
  const forme = { day: 'numeric', month: 'short' };
  if (maintenant - ms > 365 * 86400000) forme.year = 'numeric';
  return tr('le {d}', { d: new Date(ms).toLocaleDateString(locale(), forme) });
}

/** Des kilowattheures : deux décimales sous 10, une au-delà (sa maquette). */
export const kwhPrise = (k) => nombre(k, k < 10 ? 2 : 1) + ' kWh';

/** Une durée en minutes : « 30 min », « 1 h », « 1 h 05 ». */
export function dureePrise(min) {
  const m = Math.max(0, Math.round(Number(min) || 0));
  if (m < 60) return tr('{n} min', { n: m });
  return m % 60 ? tr('{h} h {m}', { h: Math.floor(m / 60), m: String(m % 60).padStart(2, '0') }) : tr('{h} h', { h: m / 60 });
}

/**
 * Le temps qu'il reste avant `fin` (ms), pour un minuteur qui se DÉCOMPTE (sa
 * demande du 20/10) : à la seconde sous l'heure — « 14 min 32 s », « 32 s »,
 * « 30 min » quand elle tombe pile —, à la minute au-delà — « 1 h 30 », la minute
 * entamée comptée comme avant. Une seconde entamée compte entière : le décompte
 * ne saute jamais. Jamais négatif.
 */
export function decompte(fin, maintenant = Date.now()) {
  const s = Math.max(0, Math.ceil((Number(fin) - maintenant) / 1000));
  if (s >= 3600) return dureePrise(Math.ceil(s / 60));
  const m = Math.floor(s / 60), r = s % 60;
  if (!m) return tr('{n} s', { n: r });
  return r ? tr('{m} min {s} s', { m, s: r }) : tr('{n} min', { n: m });
}

/**
 * Un nombre et son unité ne se séparent pas en bout de ligne (relecture finale, F7) :
 * l'espace qui les lie devient INSÉCABLE (U+00A0) — « 1,08 kWh », « 4 W », « 30 min »,
 * « 1 h 05 ». Pour les PHRASES seulement (la carte, la fiche, la confirmation, le
 * journal) : `kwhPrise`, `fmtWatts` et `dureePrise` gardent leur espace ordinaire — la
 * tuile d'énergie coupe le chiffre et l'unité dessus (`lastIndexOf(' ')`) pour écrire l'un
 * en grand et l'autre en petit, et d'autres vues s'en servent. Elle prend l'ATOME
 * « nombre unité », jamais la phrase : les espaces autour restent des espaces.
 */
export const insecable = (atome) => String(atome).replace(/ /g, '\u00A0');

/**
 * Les mots d'une ligne. Courts sur la carte ; `longue` dans la fiche, où les
 * trois premières lignes en disent plus (§ 4) : « Depuis 14:20 · la prise ne
 * répond plus », « Depuis 20:40 », « Se coupe à 21:10 · dans 30 min ».
 * `courte` : la carte ÉTROITE (passe téléphone, T17), où l'état se voit déjà —
 * « En marche depuis le 4 sept. » et « Coupée depuis le 14 sept. » deviennent
 * « Depuis le 4 sept. ». À l'heure, la phrase reste entière ; la panne et le
 * cycle gardent la leur. Cette fonction ne juge pas si l'état se voit : c'est à
 * l'APPELANT de ne passer `courte` que pour une prise sans protection (la
 * bascule le dit) ou allumée. Protégée et coupée, la pastille « Protégée » ne
 * dit rien de l'état : `useVuePrise` (App.jsx) ne la passe pas, et la phrase
 * reste « Coupée depuis le 14 sept. ».
 */
export function phrasePrise(l, { longue = false, courte = false, maintenant = Date.now() } = {}) {
  const q = (t) => quandPrise(t, maintenant);
  const autreJour = (t) => { const ms = typeof t === 'number' ? t : Date.parse(t); return courte && isFinite(ms) && !memeJour(ms, maintenant); };
  switch (l && l.ligne) {
    case 1: return longue ? tr('Depuis {h}', { h: q(l.depuis) }) + ' · ' + tr('la prise ne répond plus') : tr('Indisponible depuis {h}', { h: q(l.depuis) });
    case 2: return longue || autreJour(l.depuis) ? tr('Depuis {h}', { h: q(l.depuis) }) : tr('Coupée depuis {h}', { h: q(l.depuis) });
    // Le nombre et son unité ne se séparent pas en bout de ligne (F7) : « 1,08 » puis « kWh » à la ligne, sur une carte de 360 px.
    // Dans la fiche, le temps qu'il reste se décompte à la seconde (20/10) ; la carte garde la forme courte.
    case 3: return tr('Se coupe à {h}', { h: heureDe(l.fin) }) + (longue ? ' · ' + tr('dans {d}', { d: insecable(decompte(l.fin, maintenant)) }) : '');
    case 4: return [tr('Terminé à {h}', { h: heureDe(l.fin) }), l.kwh == null ? null : insecable(kwhPrise(l.kwh))].filter(Boolean).join(' · ');
    case 5: return tr('En marche depuis {h}', { h: q(l.depuis) });
    case 6: return tr('À l’arrêt');
    case 7: return autreJour(l.depuis) ? tr('Depuis {h}', { h: q(l.depuis) }) : tr('En marche depuis {h}', { h: q(l.depuis) });
    default: return tr('Allumée depuis {h}', { h: q(l && l.depuis) });
  }
}

/**
 * Ce qu'il faut surveiller pour que des prises VIVENT à l'écran (relecture
 * finale, A2) : leurs bascules, et leurs capteurs de puissance — ceux-ci aussi
 * en clés BRUYANTES, dont la signature s'arrondit à 10 W (`useHass`, ADR 0119).
 * `prises` : `[{ id, puissance }]`, la règle de `priseDe`. Rend
 * `{ cles, bruyantes }` ; une liste vide ne surveille rien.
 */
export function clesDesPrises(prises) {
  const liste = Array.isArray(prises) ? prises : [];
  const bruyantes = [...new Set(liste.map(p => p && p.puissance).filter(Boolean))];
  return { cles: [...liste.map(p => p && p.id).filter(Boolean), ...bruyantes], bruyantes };
}

/* ── La garde d'un appui sur la bascule (P5) ──────────────────────────────────
 *
 * Couper À LA MAIN une prise protégée demande d'abord ; allumer, jamais. Dans
 * le doute — la protection n'est pas encore lue — on demande aussi
 * (`gardeDePrise`, prisesetat.js). Trois endroits n'ont pas la place de la
 * question de la carte : la compacte, le gros interrupteur d'une vue
 * personnalisée, la carte d'une prise que l'index ne connaît pas encore. Cette
 * décision, une fois, pour eux : */

/** Combien de temps la question « Couper la prise ? » reste posée : 6 s, puis elle se défait seule — celle de la carte, de la compacte et de la fiche. */
export const DEMANDE_PRISE_MS = 6000;

/**
 * Ce que fait un appui sur la bascule d'une prise :
 *  - 'basculer' : le geste d'abord — l'allumer, ou la couper sans garde ;
 *  - 'fiche' : allumée et gardée, une fiche s'ouvre — elle demande ;
 *  - 'demander' : allumée et gardée, sans fiche à ouvrir — la carte demande sur
 *    place, sa phrase dit « Couper la prise ? » ;
 *  - 'couper' : la demande était posée, le second appui coupe.
 * Jamais « rien » : une bascule ne reste pas sans effet.
 * `ouvrable` : la carte sait ouvrir une fiche ; `enDemande` : la question est posée.
 */
export function appuiBascule({ on = false, garde = false, ouvrable = false, enDemande = false } = {}) {
  if (!on || !garde) return 'basculer';
  if (ouvrable) return 'fiche';
  return enDemande ? 'couper' : 'demander';
}

/* ── Le type, écrit sous le nom de la fiche (§ 3.5) ───────────────────────────
 * « Bureau · serveur », « Cuisine · électroménager ». Les noms des appareils
 * (`NOMS_PRISE()`) servent à « Ce qu'elle alimente » ; ici, une famille. */
export function typeEcrit(type) {
  if (['lv', 'll', 'sl', 'fer', 'frigo', 'cafe'].includes(type)) return tr('électroménager');
  const mots = { nas: tr('serveur'), pc: tr('ordinateur'), radia: tr('chauffage'), tv: tr('télévision'), box: tr('box internet'), ve: tr('borne de recharge') };
  return mots[type] || tr('prise');
}

/* ── Le chiffre et la courbe de la carte (§ 3.1) ──────────────────────────────
 * « 146 » et « W », « 1,95 » et « kW » : le format de `fmtWatts` — deux
 * décimales en kilowatts, l'unité choisie APRÈS l'arrondi —, coupé en deux
 * parce que la carte écrit le nombre en 25 px et l'unité en 15. */
export function puissancePrise(w) {
  const t = fmtWatts(w);
  const i = t.lastIndexOf(' ');
  return i < 0 ? { v: t, u: '' } : { v: t.slice(0, i), u: t.slice(i + 1) };
}

/**
 * Les deux tracés d'une courbe de puissance, dans une boîte `largeur` ×
 * `hauteur` : `ligne`, et `aire` qui la referme sur la ligne de base. Le temps
 * de `debut` à `fin` en abscisse, de 0 à `max` en ordonnée — le plus haut
 * point si `max` n'est pas donné, 1 W au moins (une journée à zéro reste une
 * ligne plate en bas). Moins de deux points lisibles : rien à tracer (null).
 */
export function cheminsCourbe(points, { largeur, hauteur, debut, fin, max = null } = {}) {
  const pts = (Array.isArray(points) ? points : []).filter(p => p && Number.isFinite(p.t) && Number.isFinite(p.w));
  if (pts.length < 2 || !(fin > debut)) return null;
  const haut = max > 0 ? max : Math.max(1, ...pts.map(p => p.w));
  const borne = (v) => Math.min(1, Math.max(0, v));
  const x = (t) => Math.round(borne((t - debut) / (fin - debut)) * largeur * 10) / 10;
  const y = (w) => Math.round((1 - borne(w / haut)) * hauteur * 10) / 10;
  const ligne = pts.map((p, i) => (i ? 'L' : 'M') + x(p.t) + ' ' + y(p.w)).join(' ');
  return { ligne, aire: ligne + ' L' + x(pts[pts.length - 1].t) + ' ' + hauteur + ' L' + x(pts[0].t) + ' ' + hauteur + ' Z' };
}
