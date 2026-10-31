/* La carte d'une mesure.
 * Sorti d’App.jsx tel quel (lot 5 de l’audit du 28/10, ADR 0283) : seuls les imports sont neufs. */
import { LOGGIA_INDEX, cfgVal } from '../state.js';
import { enPanne } from '../outils.js';
import { LAVIS } from '../theme.js';
import { uniteVentConnue, uniteTemp, signeTemp } from '../unites.js';
import { cvName, Surface, nomCarte } from '../ui.jsx';
import { cleMesure, jugeeDehors, versRepere, zoneMesure, phraseMesure, nomMesure, nomDitFamille, chiffreMesure, barreMesure, valeurEcrite } from '../confort.js';
import { CLE_NON_JUGEES, horsAir } from '../horsair.js';
import { LISERE, petitesCapitales } from '../styles.js';
import { nombre } from '../format.js';
import { Ico } from '../icones.jsx';
import { tr } from '../i18n.js';
import { soeursDe, estDehors, pieceLoggiaDe, useHass, lavisCarte } from '../app/noyau.jsx';
import { cvIcoEntite } from '../cartescustom/cartes.jsx';
import { RM_NAME, RM_CARD, RM_ICO, ChiffreHaut, RM_SUB, EM_CHIFFRE, EM_UNITE } from './briques.jsx';

/* ── La carte d'une MESURE (chantier Capteurs, § 3 ; C5, C6, C8, C11) ─────────
 *
 * La carte 1a de sa maquette « Cartes capteurs », aux tailles de la maison (184 ;
 * 176 de large au téléphone), pour une mesure de la table (`confort.js`) : CO₂,
 * température, humidité, bruit, luminosité, particules, COV, vent. La plaque
 * seule en haut à gauche ; 14 px plus bas, le nom et la phrase à gauche, le
 * chiffre à droite, aligné en bas sur la phrase, et sa famille dessous en
 * petites capitales — rien pour le CO₂, que l'unité dit déjà ; la barre des
 * zones au pied. HORS DU BON, la carte prend la couleur de sa zone : la plaque,
 * la phrase, un lavis de 0,1 en haut (0,16 pour la dernière zone), 0,03 en bas ;
 * une zone bonne s'écrit en neutre, sans teinte ni lavis (C5). Muette,
 * « Indisponible » en rouge et le liseré qui respire (ADR 0048), sans chiffre ni
 * barre. Un appui ouvre sa fiche. Son nom passe sur deux lignes au plus, entre deux
 * mots ; dans Objets, la vue lui donne celui de sa pièce, et la surface dit la famille
 * avec le chiffre (C13). Dehors (C15, révisé le 16/10), la température et l'humidité ont
 * les zones du dehors — la barre, le mot, les repères —, sans rien d'une alerte : ni teinte
 * ni lavis ; le CO₂, le bruit, les COV et la luminosité s'y écrivent en neutre, sans barre.
 * Sa carte ÉTROITE — sous 188 px de contenu, celle du téléphone — est celle de la
 * grille commune (`o-gabarit`, passe téléphone, ADR 0202 ; tâche 4 bis) : en haut, la
 * plaque, et à droite le chiffre (`ChiffreHaut`) et sa famille ; le nom en entier, deux
 * lignes au plus ; la phrase, sous sa forme courte ; la barre des zones à la place de la
 * ligne de commandes, ses chiffres en 9,5 px, ceux qui se toucheraient tus. Ce qui change
 * de place — le chiffre et sa famille, la phrase courte — s'écrit deux fois, et la
 * feuille n'en montre qu'une.
 */

/* La température d'un appareil dit aussi son humidité (C8) : l'hygromètre de son APPAREIL. */
const humiditeDe = (S, id) => soeursDe(id).find(e => e.indexOf('sensor.') === 0 && S[e] && (S[e].attributes || {}).device_class === 'humidity') || null;
/** Une mesure de la table : un capteur dont la classe — et l'unité, pour un COV — a une famille (`cleMesure`). */
const estMesure = (st) => !!st && !!cleMesure((st.attributes || {}).device_class, (st.attributes || {}).unit_of_measurement);
/* Une mesure DU DEHORS (C15, révisé le 16/10) : une famille de la table dans une pièce du dehors — le dehors se lit au nom
 * de sa zone Home Assistant (`estDehors`), comme ses sections —, ou un vent, d'où qu'il soit : sa section est Dehors. Elle se
 * lit sur les zones du dehors, et rien n'y est une alerte : ni teinte, ni lavis, ni « à regarder », ni conseil. */
const dehorsDe = (cle, id) => cle === 'vent' || (!!cle && estDehors(LOGGIA_INDEX && typeof LOGGIA_INDEX.areaNameOf === 'function' ? LOGGIA_INDEX.areaNameOf(id) : null));
/* Une mesure NEUTRE, que la table ne juge pas à dessein : un vent dans une unité qu'elle ne connaît pas (le Beaufort ;
 * correction bis, point 11) ; dehors, une famille qui n'y a pas de zones — le CO₂, le bruit, les COV, la luminosité. */
const ventInconnu = (cle, unite) => cle === 'vent' && !uniteVentConnue(unite);
const neutreDe = (cle, unite, dehors) => ventInconnu(cle, unite) || (dehors && !jugeeDehors(cle));
/* Une mesure HORS D'UNE PIÈCE de Loggia (C17, 16/10) n'est pas jugée : sans zone, ou dans une zone que Loggia ne compte pas — les
 * sondes d'une carte mère, d'une passerelle, un frigo —, elle est neutre : le chiffre, la courbe, le dernier signal ; jugée sur le
 * confort d'une pièce, elle était « Trop chaud » ou « Trop froid » pour toujours. Le vent et les particules se jugent partout, du
 * dehors par nature. Une entité que le registre ne connaît pas — la maison fictive de la Bibliothèque — garde la table : rien ne
 * dit où elle est. */
const horsPiece = (cle, id) => !!cle && cle !== 'vent' && cle !== 'pm25' && !!(LOGGIA_INDEX && LOGGIA_INDEX.entityMeta && LOGGIA_INDEX.entityMeta.has(id)) && !pieceLoggiaDe(id);
/* Une mesure qu'on NE JUGE PAS (audit du 19/10, H8 ; décision D5) : la découverte DEVINE — une température ou une humidité qui n'est
 * pas l'air de la pièce (`horsAir` : un diagnostic, un frigo, un processeur, la buse d'une imprimante, un point de rosée, l'appareil
 * d'une prise) — et le réglage « Ne pas juger cette mesure » de sa fiche CORRIGE, dans les deux sens (`loggia_mesures_nonjugees`,
 * réservé aux administrateurs, comme la configuration des pièces). Elle reste visible, neutre, sous son nom de Home Assistant. */
function nonJugee(S, id, cle) {
  const t = cfgVal(CLE_NON_JUGEES, null);
  if (t && typeof t === 'object' && typeof t[id] === 'boolean') return t[id];
  if (cle !== 'temp' && cle !== 'hum') return false;
  const em = LOGGIA_INDEX && LOGGIA_INDEX.entityMeta, dm = LOGGIA_INDEX && LOGGIA_INDEX.deviceMeta;
  const m = em && em.get(id);
  if (!m) return false;
  return horsAir(id, S, (e) => (em.get(e) || {}), m.deviceId && dm ? dm.get(m.deviceId) : null, soeursDe(id), LOGGIA_INDEX.areaNameOf(id));
}
/* Un nombre, LU STRICTEMENT (audit du 19/10) : « 21,5 » vaut 21,5 ; « 1,659 » ne vaut plus 1, « 21.4abc », « nan » ou une chaîne vide
 * ne valent rien. null sinon. */
function lireNombre(v) {
  const t = String(v == null ? '' : v).trim().replace(/^(-?\d+),(\d+)$/, '$1.$2');
  // Des chiffres, un point décimal, un exposant (« 1e-05 », que Home Assistant écrit) — pas « 0x10 », pas « Infinity ».
  return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t) ? Number(t) : null;
}
/** Une mesure qui peut être « à regarder » : une famille de la table, dans une pièce du dedans (C15, révisé ; C17). Elle seule peut
 *  changer le décompte : l'enveloppe des sections d'Objets › Capteurs ne s'abonne qu'à elle (correction bis 2, point 2). */
function mesureJugee(S, id) {
  const a = (S && S[id] && S[id].attributes) || {};
  const cle = cleMesure(a.device_class, a.unit_of_measurement);
  return !!cle && !dehorsDe(cle, id) && !horsPiece(cle, id) && !nonJugee(S, id, cle);
}

/* Ce que la carte, la compacte et la fiche d'une mesure lisent : sa famille, sa zone, sa phrase, son chiffre et sa
 * barre. Un capteur en Fahrenheit, un vent en m/s se lisent dans la table en Celsius et en km/h (`versTable`) ; les
 * chiffres s'écrivent dans l'unité du capteur (`uniteTable`). Tout capteur ouvre la fiche : celui qu'aucune famille ne
 * lit (une pression, une puissance) n'a ni zone ni barre, et son chiffre garde une décimale. `humId` : l'hygromètre
 * de son appareil, que la phrase d'une température redit (C8). Dehors (C15, révisé le 16/10 ; `dehors`), la
 * température et l'humidité se lisent sur les zones du dehors, le vent et les particules sur les leurs : la barre et le
 * mot de la zone restent, et rien n'est une alerte — la carte, la compacte et la fiche n'y prennent ni teinte ni lavis.
 * Une autre famille y est NEUTRE (`neutre`) — ni zone, ni barre, ni teinte. Le dehors se lit au nom de sa zone Home
 * Assistant (`estDehors`), comme ses sections.
 * Correction bis : un vent dans une unité que la table ne connaît pas (le Beaufort) est neutre lui aussi — sans zone,
 * `inconnue` (point 11) ; un état qui n'est pas un nombre (« erreur ») devient la phrase, que la surface lit (point 10) ;
 * `phraseRepli`, la forme de repli de la carte LARGE trop étroite pour la phrase entière (point 6).
 * Correction bis 2 : `famille`, celle que la carte (large et étroite), sa surface et la fiche écrivent, se tait quand le nom
 * affiché la dit déjà (« Chambre CO2 », « Salle de bain température » ; `nomDitFamille`, point 1).
 * C17 (16/10) : hors d'une pièce de Loggia — sans zone, ou dans une zone qu'elle ne compte pas —, une mesure est NEUTRE
 * (`horsPiece`) : ni zone, ni barre, ni teinte, ni « à regarder » ; le vent et les particules exceptés. */
function vueMesure(H, id, label = null, humId = null) {
  const S = (H && H.states) || {};
  const st = S[id] || null;
  const a = (st && st.attributes) || {};
  const muette = enPanne(id, st);
  const cle = cleMesure(a.device_class, a.unit_of_measurement);
  const n = st ? lireNombre(st.state) : null;
  const lu = !muette && n != null;
  const uT = uniteTemp(a, H);
  const uniteTable = cle === 'temp' ? uT : a.unit_of_measurement;
  const versTable = (x) => versRepere(cle, x, uniteTable);
  /* La zone et la barre se jugent sur le chiffre TEL QU'IL S'ÉCRIT (G1-D5, ADR 0300) : arrondi dans l'unité du capteur, puis
   * ramené au repère de la table. 39,6 % s'écrivait « 40 » et se disait « Bon » ; 40 est « Idéal » sur la jauge. */
  const v = lu ? (cle ? valeurEcrite(cle, n, uniteTable) : versTable(n)) : null;
  const inconnue = ventInconnu(cle, uniteTable);
  const dehors = dehorsDe(cle, id);
  const neutre = neutreDe(cle, uniteTable, dehors) || horsPiece(cle, id) || nonJugee(S, id, cle);
  const zone = cle && v != null && !neutre ? zoneMesure(cle, v, dehors) : null;
  const hum = lu && humId && S[humId] ? lireNombre(S[humId].state) : null;
  const phrase = muette ? tr('Indisponible') : !lu ? tr('Valeur illisible') : phraseMesure(cle, zone, hum);
  const repli = zone ? phraseMesure(cle, zone, hum, true) : null;
  const nom = label || cvName(st, id);
  const famille = nomMesure(cle);
  return {
    nom, muette, cle, famille: nomDitFamille(nom, famille) ? '' : famille, zone, neutre, inconnue, dehors,
    chiffre: !lu ? null : cle ? chiffreMesure(cle, n, uniteTable) : nombre(n, 1, 0), unite: cle === 'temp' ? signeTemp(uT) : (a.unit_of_measurement || ''),
    barre: zone ? barreMesure(cle, v, uniteTable, dehors) : null,
    phrase,
    phraseRepli: repli && repli !== phrase ? repli : null,
    // Sa forme courte, sur une carte étroite (tâche 4 bis) : une température qui a sa zone n'y redit pas l'humidité de son appareil.
    phraseCourte: !muette && zone && cle === 'temp' && hum != null ? phraseMesure(cle, zone) : null,
    hass: H, st, versTable, uniteTable,
  };
}

/* Le `hass` d'une carte : le relevé VIVANT, s'il connaît l'entité ; sinon celui qu'on lui a passé — la Bibliothèque des
 * cartes passe une maison fictive (`biblioStates`), que la vraie ne connaît pas : ses aperçus disaient « Indisponible »
 * (correction bis, point 7). */
const hassQuiConnait = (vivant, hass, id) => (vivant && vivant.states && vivant.states[id] ? vivant : hass || vivant);

/* La vue d'une mesure dans un `hass` VIVANT : elle s'abonne à SA mesure, et à l'hygromètre de son appareil pour une
 * température (la leçon des prises : les vues ne surveillent pas `sensor.`, qui bouge sans cesse ; une clé bruyante
 * ne surveille rien). `actif` faux : rien ne s'abonne, et rien ne se rend. */
function useVueMesure(hass, id, label = null, actif = true) {
  const S0 = (hass && hass.states) || {};
  const a0 = (S0[id] && S0[id].attributes) || {};
  const humId = actif && cleMesure(a0.device_class, a0.unit_of_measurement) === 'temp' ? humiditeDe(S0, id) : null;
  const vivant = useHass(actif ? [id, humId].filter(Boolean) : []);
  return actif ? vueMesure(hassQuiConnait(vivant, hass, id), id, label, humId) : null;
}

/* Le nom d'une carte de mesure (C13) : deux lignes au plus, passé à la ligne ENTRE deux mots ; une troisième ligne, ou
 * un mot plus large que la carte, finit en « … ». Ses lignes font 18 px : deux tiennent dans les 184 de la carte, avec la
 * phrase et la barre (38 + 14 + 2 × 18 + 18 + 8 + 34 = 148 px de contenu, pour 150). Sur une carte étroite, la grille
 * commune le règle (`o-gab-nom`, 14 px), sur des lignes de 16 (`--o-nom-ligne`, index.css). */
const NOM_MESURE = { ...RM_NAME, fontSize: 15, lineHeight: 'var(--o-nom-ligne, 18px)', whiteSpace: 'normal', overflowWrap: 'normal', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2 };

/* La largeur d'une PHRASE de carte large, en em (Manrope 600 ; mesurée le 16/10, « Idéal · 47 % d’humidité » à 1 % près), plus
 * 3 % de marge : la phrase d'une carte large rétrécit de 12 à 10,5 px dans sa colonne, puis cède la place à sa forme de repli
 * (`--o-larg`, correction bis, point 6). Une lettre absente de la table compte 0,6 em, une capitale 0,68. */
const EM_PHRASE = { i: .27, l: .27, j: .28, 'ł': .28, I: .27, '’': .27, "'": .24, '.': .29, ',': .29, '·': .25, ':': .33, ' ': .2, '\u00a0': .2, f: .37, r: .39, t: .42, 1: .42, '-': .42, m: .88, w: .79, M: .85, W: .96, '%': .9 };
const emPhrase = (s) => Math.round([...String(s)].reduce((n, c) => n + (EM_PHRASE[c] || (c !== c.toLowerCase() ? .68 : .6)), 0) * 103) / 100;

function RoomMesureCard({ id, hass, onOpen, label = null }) {
  const v = useVueMesure(hass, id, label);
  // Hors du bon, la couleur de la zone (C5) ; bonne, ou dehors — rien n'y est une alerte (C15, révisé) —, le neutre.
  const teinte = v.zone && !v.zone.bon && !v.dehors ? v.zone : null;
  const derniere = !!teinte && teinte.i === v.barre.zones.length - 1;
  const valeur = v.chiffre == null ? null : v.chiffre + (v.unite ? '\u00a0' + v.unite : '');
  /* La famille, sous le chiffre — le CO₂ compris (correction bis, point 8) : dans Objets, la carte porte le nom de sa pièce (C13).
   * La surface la dit avec le chiffre. Elle se tait quand le nom affiché la dit déjà — « Chambre CO2 », « Salle de bain
   * température » (`vueMesure`, correction bis 2, point 1) : sa maquette la taisait sous « CO₂ Chambre ». */
  const famille = v.famille;
  // Le plancher de la colonne du chiffre, sur la carte large (correction bis 2, point 4) ; avec l'écart de 10 px, ce que le nom lui laisse.
  const plancher = v.chiffre != null ? plancherChiffre(v.chiffre, v.unite) : 0;
  // L'encre de la phrase : le rouge d'une mesure muette, la couleur de la zone hors du bon, sinon le gris doux.
  const encre = v.muette ? 'var(--o-bad)' : teinte ? teinte.c : 'var(--o-text2)';
  return (
    /* Pas un `button` (ADR 0074) : le geste « ouvrir » passe par la SURFACE, nommée de ce que la carte affiche —
     * « CO₂ Chambre, 1 659 ppm, Confiné · aérez », « Séjour, Température 21,4 °C, Idéal ». */
    <div className={'o-rmcard o-gabarit' + (v.muette ? ' o-panne' : '')} data-mesure=""
      style={{ ...RM_CARD, position: 'relative', justifyContent: 'flex-start', cursor: onOpen ? 'pointer' : 'default',
        // Le lavis, seulement hors du bon : 0,1 en haut, 0,16 pour la dernière zone, 0,03 en bas.
        ...(teinte && LAVIS ? { background: lavisCarte(teinte.rgb, derniere ? .16 : .1, .03) } : null),
        border: LISERE }}>
      {onOpen && <Surface onClick={() => onOpen(id)} label={nomCarte(v.nom, valeur && famille ? famille + ' ' + valeur : valeur, v.phrase)} />}
      {/* La ligne du haut : la plaque ; sur une carte étroite (la grille commune, passe téléphone), le chiffre à droite et
        * sa famille dessous — la feuille n'en montre qu'une écriture. La famille y passe en minuscules, de 10 à 8 px, dans
        * la place que laisse la plaque (`--o-reserve`, 38 + 8 px), comme l'étiquette d'un chauffage. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <span style={RM_ICO(teinte ? 'rgba(' + teinte.rgb + ',.16)' : 'var(--o-s1)', teinte ? teinte.c : v.muette ? 'var(--o-text3)' : 'var(--o-text1)')}>
          <Ico name={cvIcoEntite('sensor', id, v.st, v.nom)} size={17} /></span>
        {v.chiffre != null && (
          <span className="o-seul-etroit" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 0 }}>
            <ChiffreHaut v={v.chiffre} u={v.unite || null} />
            {famille && <span aria-hidden="true" className="o-gab-etiquette" style={{ marginTop: 3, lineHeight: 1, whiteSpace: 'nowrap', color: 'var(--o-text3)', '--o-n': famille.length, '--o-reserve': '46px' }}>{famille}</span>}
          </span>
        )}
      </div>
      {/* La rangée de la carte d'une prise : le nom et la phrase à gauche, le chiffre à droite, aligné sur leur bas. Sur une
        * carte large (correction bis, point 6), la colonne du nom ne descend pas sous son mot le plus long (`o-mesure-gauche`,
        * index.css) : c'est d'abord le CHIFFRE qui rétrécit, jusqu'à son plancher de 14 px (correction bis 2, point 4) ;
        * au-delà, en dernier recours, le nom cède et finit en « … » (`--o-plancher`). Sur une carte étroite, le
        * chiffre se tait — il est en haut — et le nom et la phrase prennent toute la largeur (`o-gab-nom`, `o-gab-phrase`) ;
        * la longueur de la phrase (`--o-n`) règle sa taille, de 12 à 10,5 px. */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginTop: 'var(--o-milieu-haut, 14px)', '--o-plancher': plancher ? plancher + 10 + 'px' : undefined }}>
        <div className="o-mesure-gauche" style={{ flex: '1 1 0%', minWidth: 0 }}>
          <div className="o-mesure-nom o-gab-nom" style={NOM_MESURE}>{v.nom}</div>
          {/* La phrase de la carte LARGE, dans son cadre (`o-mesure-phrases`, index.css) : elle rétrécit de 12 à 10,5 px d'après sa
            * largeur estimée (`--o-larg`), puis cède sa place à sa forme de repli — « Idéal · 47 % », « Confiné » —, écrite une
            * seconde fois et tue au lecteur d'écran : la première, même effacée, reste lue en entier. */}
          <div className="o-mesure-phrases o-seul-large">
            <div className="o-mesure-phrase" data-longue={v.phraseRepli ? '' : undefined} style={{ ...RM_SUB, color: encre, '--o-larg': emPhrase(v.phrase) }}>{v.phrase}</div>
            {v.phraseRepli && <div aria-hidden="true" className="o-mesure-phrase" data-repli="" style={{ ...RM_SUB, color: encre, '--o-larg': emPhrase(v.phrase), '--o-larg-repli': emPhrase(v.phraseRepli) }}>{v.phraseRepli}</div>}
          </div>
          {/* Sur une carte étroite, la phrase de la grille commune, sous sa forme courte s'il y en a une : « Idéal », sans l'humidité
            * de l'appareil — elle a sa carte, et sa pastille dans la pièce. */}
          <div className="o-mesure-phrase-courte o-gab-phrase o-seul-etroit" style={{ ...RM_SUB, color: encre, '--o-n': Math.max(1, (v.phraseCourte || v.phrase).length) }}>{v.phraseCourte || v.phrase}</div>
        </div>
        {v.chiffre != null && <ChiffreMesure chiffre={v.chiffre} unite={v.unite} famille={famille} />}
      </div>
      {v.barre && <BarreMesure barre={v.barre} />}
    </div>
  );
}

/* Le chiffre : « 21,4 » en 25 px / 800 et son unité en 13, à droite du nom et de la phrase, aligné sur leur bas ;
 * dessous, sa famille en petites capitales : TEMPÉRATURE, HUMIDITÉ, CO₂… La surface le dit déjà. La carte large seule
 * l'écrit : une carte étroite écrit son chiffre en haut (`ChiffreHaut`), et sa famille dessous.
 * Il passe en premier tant qu'il y a la place ; un mot du nom plus large que sa colonne le fait CÉDER (correction bis,
 * point 6) : sa colonne rétrécit, et sa ligne — un conteneur large de sa taille estimée (`emLigne` : le chiffre, 3 px et
 * l'unité en 13 px, à 0,3 px près), qui ne dépasse jamais la colonne — l'écrit à la taille qui y tient, de 25 à 14 px, son
 * unité à 0,52 de lui (`o-mesure-ligne`, index.css).
 * Sa colonne a un PLANCHER (correction bis 2, point 4 ; à 1 280 px, « Schlafzimmerluftqualität CO2 » la menait à 0, et
 * « 1.659 ppm » sortait de la carte) : le chiffre en 14 px, sa plus petite taille. Au-delà, c'est le nom qui cède (la carte
 * pose `--o-plancher`). Sa famille, plus large que la colonne, peut prendre 8 des 10 px de l'écart, jamais plus : au-delà, elle
 * finit en « … » — elle passait sinon sur la phrase. */
const emLigne = (v, u) => Math.round(([...String(v)].reduce((s, c) => s + (/\d/.test(c) ? .6 : EM_CHIFFRE[c] || .98), 0)
  + (u ? (3 + 13 * [...String(u)].reduce((s, c) => s + (EM_UNITE[c] || .98), 0)) / 25 : 0)) * 1000) / 1000;
const plancherChiffre = (chiffre, unite) => Math.ceil(emLigne(chiffre, unite) * 14);
function ChiffreMesure({ chiffre, unite, famille }) {
  const em = emLigne(chiffre, unite);
  return (
    <span aria-hidden="true" className="o-mesure-chiffre o-seul-large"
      style={{ flex: '0 1 auto', minWidth: plancherChiffre(chiffre, unite), display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1, whiteSpace: 'nowrap' }}>
      <span className="o-mesure-ligne" style={{ display: 'block', width: Math.ceil(em * 25) + 'px', maxWidth: '100%', '--o-em': em }}>
        <span style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: '.12em', fontWeight: 800, color: 'var(--o-text)' }}>
          <span style={{ fontSize: '1em', letterSpacing: '-.02em' }}>{chiffre}</span>
          {unite && <span className="o-mesure-unite" style={{ fontSize: '.52em' }}>{unite}</span>}
        </span>
      </span>
      {famille && <span className="o-mesure-famille" style={{ ...petitesCapitales(10), marginTop: 5, maxWidth: 'calc(100% + 8px)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{famille}</span>}
    </span>
  );
}

/* Les repères qui toucheraient leur voisin sur la carte étroite la plus serrée (chantier Capteurs, tâche 4 bis) : 104 px
 * de contenu, une vue personnelle au téléphone de 320 px, les chiffres en 9,5 px — un chiffre fait 0,6 em, un séparateur
 * de milliers 0,2 em ; gardés dans la barre comme la feuille les garde (`demi`), et 2 px d'air au moins. De gauche à
 * droite : un repère qui toucherait le dernier gardé se tait (`data-serre`, index.css, sous 120 px de contenu). */
const REPERES_SERRES = 104;
function reperesSerres(reperes) {
  let fin = -Infinity;
  return reperes.map(r => {
    const l = [...r.t].reduce((s, c) => s + (/\d/.test(c) ? 5.7 : 1.9), 0), demi = r.t.length * 3.2;
    const x = Math.max(demi, Math.min(REPERES_SERRES - demi, r.pos / 100 * REPERES_SERRES));
    if (x - l / 2 < fin + 2) return true;
    fin = x + l / 2;
    return false;
  });
}

/* La barre des zones (§ 3), collée au pied, 8 px d'air au moins au-dessus d'elle — pour un nom de deux lignes (C13) :
 * une bande par zone de la table, sa part de l'échelle, 8 px de haut, 2 px entre elles, rayon 3 — la zone où l'on est
 * en couleur pleine, les autres à 0,28 ; un repère de 4 px sur 16 à la valeur, en `--o-text`, cerclé de la surface ;
 * dessous, les chiffres des repères (10,5 / 700, `--o-text3`), dans l'unité du capteur, gardés dans la barre. La
 * phrase et le chiffre sont déjà dits : elle ne se lit pas à voix haute. Sur une carte étroite, elle est la ligne du bas
 * de la grille commune : ses chiffres passent en 9,5 px, et ceux qui se toucheraient se taisent (`reperesSerres`). */
function BarreMesure({ barre }) {
  const serres = reperesSerres(barre.reperes);
  return (
    <div aria-hidden="true" className="o-mesure-barre" style={{ marginTop: 'auto', paddingTop: 'var(--o-pied-haut, 8px)' }}>
      <div style={{ position: 'relative', height: 16 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 4, height: 8, display: 'flex', gap: 2 }}>
          {barre.zones.map((z, k) => <span key={k} data-bande="" style={{ flexGrow: z.part, flexShrink: 1, flexBasis: 0, minWidth: 0, borderRadius: 3, background: 'rgba(' + z.rgb + ',' + (k === barre.i ? 1 : .28) + ')' }} />)}
        </div>
        <span data-repere="" style={{ position: 'absolute', top: 0, left: barre.pos + '%', width: 4, height: 16, marginLeft: -2, borderRadius: 2, background: 'var(--o-text)', boxShadow: '0 0 0 2px var(--o-surfB)' }} />
      </div>
      <div className="o-mesure-reperes" style={{ position: 'relative', height: 14, marginTop: 4, fontSize: 10.5, fontWeight: 700, lineHeight: '14px', color: 'var(--o-text3)', fontVariantNumeric: 'tabular-nums' }}>
        {barre.reperes.map((r, k) => {
          const demi = r.t.length * 3.2;
          return <span key={r.t} data-serre={serres[k] ? '' : undefined} style={{ position: 'absolute', left: 'clamp(' + demi + 'px, ' + r.pos + '%, calc(100% - ' + demi + 'px))', transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}>{r.t}</span>;
        })}
      </div>
    </div>
  );
}

export { estMesure, dehorsDe, horsPiece, nonJugee, lireNombre, mesureJugee, vueMesure, hassQuiConnait, useVueMesure, emPhrase, RoomMesureCard, ChiffreMesure, reperesSerres, BarreMesure };
