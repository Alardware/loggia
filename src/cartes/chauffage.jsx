/* Les cartes du chauffage : le climat, le fil pilote.
 * Sorti d’App.jsx tel quel (lot 5 de l’audit du 28/10, ADR 0283) : seuls les imports sont neufs. */
import { LAVIS } from '../theme.js';
import { uniteTemp, versCelsius, wattsDe, deCelsius } from '../unites.js';
import { consigneClimat, pasConsigne } from '../consigne.js';
import { commander, planAction as actionsPlan, actionCtx, commanderService } from '../actions.js';
import { estRefus } from '../refus.js';
import { Surface, nomCarte, Fi, BottomSheet, NomFeuille, CroixFeuille } from '../ui.jsx';
import { useOptimiste } from '../optimiste.js';
import { LISERE } from '../styles.js';
import { nombre } from '../format.js';
import { commanderChauffage, useEtatChauffage, chauffageDe, refroidit } from '../chauffageetat.js';
import { plaqueMode, estMuet, consigneVoisine, decalageEn, modeVoisin, enChauffe, phrasePlanning, consigneAtteinte, motMode, etiquetteCarte, mesureLisible, moduleMuet, modeDuModule, etatModule, couleurMode } from '../chauffageecran.js';
import { tr, trHA } from '../i18n.js';
import { lavisCarte, estClimate, readZone, pilotFamille, dec, decMax } from '../app/noyau.jsx';
import { useHistorique24, BoutonEpingle, Courbe24 } from '../appareils/fiches.jsx';
import { MenuDeroulant } from '../cartescustom/cartes.jsx';
import { RM_ICO, RM_CARD, GlypheCarte, RmBascule, ChiffreHaut, RM_MILIEU, RM_NAME, RM_SUB, RM_BTN } from './briques.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Le pont vers le moteur d'actions.
//
// `hass` porte a la fois les etats et la liste des services : de quoi bâtir le
// contexte que le moteur attend, partout ou une vue a deja `hass` sous la main.
// ─────────────────────────────────────────────────────────────────────────────

// Thermostat (maquettes du 14/09) : nom sous l'icone, etat en sous-titre, − / +.
// Bornes de REPLI du cadran du radiateur fil pilote : une entite qui publie
// les siennes fait foi.
const RM_TMIN = 5, RM_TMAX = 30;
// Un bouton ± sans consigne a regler garde sa place — la carte garde son
// gabarit — mais s'efface et ne repond plus (audit du 03/10).
const RM_INERTE = { opacity: .4, cursor: 'default' };
/* ── Les cartes « 1a » du chauffage (maquette « Cartes chauffage », son choix
 * du 11/10 ; chantier Chauffage, tâche 10 bis A) ─────────────────────────────
 *
 * Dans le cadre des cartes de la maison (`RM_CARD`, le liseré, le lavis, la
 * surface, la bascule rose) : l'icône seule en haut à gauche, la bascule
 * seule à droite ; 14 px plus bas le nom et l'état — une phrase —, et à
 * droite la température de la pièce en grand ; en bas, − et + autour de la
 * valeur et de son étiquette. Plus de pastille AUTO ni de barre du jour : la
 * phrase et l'étiquette disent le planning, la fiche montre la journée.
 *
 * − et + : des carrés de 44 px, arrondis 12, `--o-s1`, sans bordure, le
 * glyphe de 16 px (le `ChipButton` de la maquette). Sur une carte large, une
 * largeur fixe de 44 px. Sur une carte étroite — deux colonnes au téléphone,
 * la grille commune (passe téléphone, T9, T18) —, 44 px à partir de 142 px de
 * contenu (le téléphone de 390 px dans Objets) ; en dessous, ils cèdent, jamais
 * sous 28 px de large ni sous 44 de haut, et un mot de mode trop long leur
 * prend de la place (`--o-pas`, `--o-mot`, index.css). Le texte se réduit
 * aussi (retour du 12/10 : « réduire la taille du texte que ça tienne
 * correctement sans écraser les boutons »). Ils gardent `RM_BTN` et sa
 * position : peints après la surface, ils reçoivent leur clic. */
const RM_PAS = { flex: '0 0 auto', width: 'var(--o-pas, 44px)', height: 44, padding: 0, borderRadius: 12, border: 'none', background: 'var(--o-s1)', display: 'flex', alignItems: 'center', justifyContent: 'center' };
/* La valeur entre − et + et son étiquette : exactement la place qui reste
 * entre les deux boutons — jamais sous eux ; un mot trop long y passe à la
 * ligne. Jamais positionnée : un appui sur elle ouvre la fiche. */
const RM_VALEUR = { flex: '1 1 0%', minWidth: 0, textAlign: 'center', lineHeight: 1.15 };
// La valeur en 15 px / 800, précédée pour un module du point de son mode (8 px, 6 px d'écart).
const RM_VALEUR_LIGNE = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 15, fontWeight: 800 };
const RM_POINT = (c) => ({ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: c });
/* L'étiquette, 3 px sous la valeur : Mode, Planning, Manuel, Consigne — en
 * petites capitales sur une carte large, en minuscules sur une carte étroite
 * (passe téléphone, T9). Elle reste sous la valeur : à 360 px, « 20,9° » (la
 * pièce) et « 20,0° » (la consigne) se retrouvaient côte à côte sans un mot
 * pour les distinguer (relecture de la partie A) ; seul un mot de mode trop
 * long l'efface (`motLong`, plus bas). Sa taille vient de la feuille
 * (`o-gab-etiquette`, index.css, que pose `ValeurEtiquette`), d'après
 * `--o-taille` — 10 px sur une carte large, 9 px et un espacement resserré
 * au-delà de neuf lettres (« Harmonogram », « Programación ») — et `--o-n`,
 * sa longueur : sur une carte étroite, elle rétrécit comme la valeur, de 10 à
 * 8 px, et passe sur deux lignes, ENTRE deux mots, si elle ne tient toujours
 * pas, jamais sous les boutons. Un mot ne se coupe jamais (revue du 14/10,
 * R8 : « CONSIG / NE » à 320 px) : un seul mot trop long finit en « … ». */
const RM_ETIQUETTE = (mot) => ({ fontWeight: 800, letterSpacing: mot.length > 9 ? '.04em' : '.08em', textTransform: 'uppercase', color: 'var(--o-text3)',
  marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', '--o-taille': (mot.length > 9 ? 9 : 10) + 'px', '--o-n': Math.max(1, mot.length) });
/* Un mot de mode de plus de 13 lettres passe sur deux lignes ou plus d'une
 * carte étroite : la rangée de 44 px n'y loge plus son étiquette, qui s'efface
 * (`data-long`, index.css) — l'état de la carte dit le reste. Mesuré à 320 px :
 * « Frost protection » et « Vorstbeveiliging » (16 lettres) débordaient avec
 * le seuil de 16 (relecture de la dernière passe). */
const motLong = (mot) => mot.length > 13;
/* La couleur de l'état sous le nom : l'ambre d'une fenêtre qui coupe,
 * l'orange de la chauffe, le bleu du froid, le gris d'un chauffage éteint ou
 * en panne, sinon le gris doux. Le rouge reste aux alertes. */
const couleurEtatChauffage = ({ fenetre = false, chauffe = false, froid = false, eteint = false }) => (
  fenetre ? 'var(--o-warn)' : chauffe ? 'var(--o-warn2)' : froid ? 'var(--o-cold)' : eteint ? 'var(--o-text3)' : 'var(--o-text2)');
/* La plaque de l'icône : l'orange de la chauffe, le bleu du froid, le gris
 * d'un chauffage éteint ou en panne ; un module, la teinte de son mode (son
 * lavis à .16, son encre) ; sinon le neutre. La règle vit dans
 * `chauffageecran.js` (`plaqueMode`) : l'en-tête de la fiche la lit aussi
 * (tâche 10 bis B). */
const plaqueChauffage = (o) => { const [fond, encre] = plaqueMode(o); return RM_ICO(fond, encre); };
/* Le mot de l'étiquette sous la valeur (`etiquetteCarte`, chauffageecran.js). */
const motEtiquette = (cle) => (cle === 'planning' ? tr('Planning') : cle === 'manuel' ? tr('Manuel') : cle === 'mode' ? tr('Mode') : tr('Consigne'));
/* La température de la pièce, en grand à droite du nom — 25 px / 800, et un
 * « ° » de 15 px un peu plus bas —, au format de la langue (« 20,9 ») ; au gris
 * doux quand le chauffage est éteint. Sans mesure lisible, rien : jamais un
 * chiffre inventé (ADR 0030). À la première rangée de la grille du milieu, à
 * droite du nom, sur une carte large ; une carte étroite l'écrit en haut
 * (`ChiffreHaut`, passe téléphone), et la feuille n'en montre qu'une. */
function TemperaturePiece({ v, eteint }) {
  if (v == null) return null;
  return (
    <div className="o-seul-large" style={{ gridColumn: 2, gridRow: 1, marginLeft: 'var(--o-piece-ecart, 10px)', display: 'flex', alignItems: 'flex-start', fontWeight: 800, lineHeight: 1, color: eteint ? 'var(--o-text2)' : 'var(--o-text)' }}>
      <span style={{ fontSize: 'var(--o-piece-taille, 25px)', letterSpacing: '-.02em' }}>{nombre(v, 1)}</span><span style={{ fontSize: 'var(--o-piece-degre, 15px)', marginTop: 2 }}>°</span>
    </div>
  );
}
/* Le planning de chauffe ALLUMÉ, la carte d'un chauffage ne commande plus son
 * appareil : − / + et la bascule posent une REPRISE EN MAIN jusqu'au prochain
 * changement (plan 2 du chantier Chauffage, choix 8 ; spec § 5.4). Le moteur
 * décide et commande ; sa réponse est l'état, qui remplace le cache
 * (`commanderChauffage`). Refusée, l'avance de la carte se retire (`annuler`)
 * et le refus se dit au toast global, le canal de toutes les cartes : par son
 * code (`texteRefus`, refus.js — « Le planning de ce chauffage est éteint. »),
 * une coupure comme une commande d'appareil perdue. `signaler` n'existe que
 * pour les tests, comme celui d'`ecrireRegle` : le rejet non repris ferait
 * échouer un test de Node. */
function reprendreLaMain(hass, ch, quoi, annuler, signaler = (err) => { Promise.reject(err); }) {
  return commanderChauffage(hass, { type: 'loggia/chauffage/main', chauffage: ch.cle, ...quoi, fin: 'prochain' }).catch((e) => {
    annuler();
    signaler(estRefus(e) ? e : Object.assign(new Error((e && e.message) || 'service'), { code: 'service_error' }));
  });
}
function RoomClimateCard({ id, hass, onOpen, label = null }) {
  const st = hass && hass.states ? hass.states[id] : null;
  const a = (st && st.attributes) || {};
  // target vient deja de l'entite dans l'unite reelle de l'installation (HA ne
  // propose pas de consigne en Celsius sur un thermostat regle en Fahrenheit) :
  // seul le symbole affiche etait fige en dur.
  const uT = uniteTemp(a, hass);
  /* Pas de consigne inventee (audit du 03/10). En `heat_cool`, et a l'arret
   * chez bien des integrations, `temperature` vaut null : la carte retombait
   * sur 20, et le « + » ENVOYAIT 20,5 — une consigne que personne n'avait
   * choisie. Rien de lisible = « — » et des boutons inertes, comme la
   * compacte ; `src/consigne.js` dit pourquoi la plage ne se pilote pas ici. */
  const realTarget = consigneClimat(a);
  const etatSt = st && st.state;
  const [ov, setOv] = useOptimiste([realTarget, etatSt].join('|'));
  const target = ov != null ? ov : realTarget;
  const reglable = target != null;
  const mode = st ? st.state : 'off';
  const off = mode === 'off';
  // Muet — `unknown` comme `unavailable`, comme le module, la fiche et le moteur (relecture de la dernière passe).
  const mort = !st || estMuet(st.state);
  const cooling = a.hvac_action === 'cooling';
  const all = modesClimat(a, ['off', 'heat']);
  /* Le planning de chauffe (plan 2 du chantier Chauffage, choix 8) : ALLUMÉ,
   * la carte dit jusqu'à quand il décide et reprend la main par le moteur au
   * lieu de commander l'appareil ; éteint, ou l'état du moteur pas encore lu (un Home
   * Assistant pas redémarré), elle fait exactement ce qu'elle faisait. En
   * « Observer sans agir » aussi : le moteur n'envoie alors AUCUN ordre, une
   * reprise en main pas plus que le reste (spec § 5.5), et il n'est pas encore
   * le chef (§ 11) — passés par lui, ses gestes n'arriveraient plus à
   * l'appareil. */
  const { etat } = useEtatChauffage();
  const ch = chauffageDe(etat, id);
  // Une pompe à chaleur qui refroidit : le moteur attend, la carte commande l'appareil (audit du 19/10).
  const auPlanning = !!(ch && ch.planning && !etat.simulation && !refroidit(ch));
  // Le décalage de son capteur (30/10) : au planning, la carte dit et règle la consigne de la PIÈCE.
  const dec = auPlanning ? decalageEn(ch, uT) : 0;
  // Bascule optimiste, comme la lampe : arrêt ↔ le mode de marche de l'entité.
  const [ovOn, setOvOn] = useOptimiste(etatSt);
  const marche = ovOn != null ? ovOn : !off;
  const modeMarche = ['heat', 'auto', 'heat_cool', 'cool'].find(m => all.indexOf(m) >= 0) || all.find(m => m !== 'off') || 'heat';
  // Au planning, une reprise en main : Confort pour allumer, Arrêt pour éteindre.
  const basculer = () => { const nv = !marche; setOvOn(nv); if (auPlanning) reprendreLaMain(hass, ch, { mode: nv ? 'confort' : 'arret' }, () => setOvOn(null)); else commander(hass, id, 'set_hvac_mode', nv ? modeMarche : 'off'); };
  const nom = label || a.friendly_name || id;
  // Les bornes viennent de l'entite, pas d'une constante : la climatisation de
  // l'installation d'essai monte a 35, la ou le code plafonnait a 30. Le pas
  // aussi lui appartient. On affiche ce qui a ete envoye, pas ce qui a ete
  // demande — sinon la consigne affichee mentirait des qu'elle est bornee.
  // Sans consigne lisible, rien ne part : un « + » sur du vide n'est pas 20,5.
  const setT = (d) => { if (!reglable) return; const v = commander(hass, id, 'set_temperature', consigneVoisine(target, d, a, uT) ?? target + d, 'temperature'); if (v != null) setOv(v); };
  /* Au planning, la consigne visée part en reprise en main, en °C : le
   * serveur ne parle qu'en Celsius (ADR 0128). Elle va d'un cran du pas qu'il
   * appliquera (`consigneVoisine`) — à ± 0,5, « − » sur un appareil au degré,
   * ou en °F, redevenait la même consigne —, dans les bornes de l'appareil,
   * celles que `commander` appliquerait. Une consigne qui ne bouge pas (une
   * borne) ne pose pas de reprise en main : le chauffage quitterait son
   * planning pour rien. Un VTherm ne reçoit jamais de consigne (son
   * préréglage passerait à « none », spec § 3.1 ; le serveur la refuse) :
   * − / + y passent d'un cran de mode — à partir de celui qu'il REÇOIT
   * (`applique`, relecture de la partie B, point c). */
  const reprendreT = (d) => {
    if (!reglable) return;
    if (ch.famille === 'vtherm') { const m = modeVoisin(ch.modes, ch.applique || ch.mode, d); if (m) reprendreLaMain(hass, ch, { mode: m }, () => {}); return; }
    const vise = consigneVoisine(target, d, a, uT);
    const p = vise != null && actionsPlan(id, 'set_temperature', vise, actionCtx(hass));
    if (!p || !p.ok || p.data.temperature === target) return;
    setOv(p.data.temperature);
    reprendreLaMain(hass, ch, { temperature: Math.round((versCelsius(p.data.temperature, uT) - decalageEn(ch, 'C')) * 10) / 10 }, () => setOv(null));
  };
  /* La carte « 1a » (maquette « Cartes chauffage », tâche 10 bis A). L'état,
   * une phrase qui ne redit pas le bas de la carte (son choix du 12/10, « Ne
   * pas répéter le bas ») : au planning, jusqu'à quand (`phrasePlanning`) —
   * l'étiquette dit PLANNING ou MANUEL ; sinon ce que fait l'appareil —
   * « Consigne atteinte » seulement MESURÉ (`consigneAtteinte` : la pièce
   * lisible, et proche de la consigne, 0,2 °C ou 0,4 °F), « Au repos » sinon :
   * un `idle` dans une pièce à 16° pour 20° n'a rien atteint. « Chauffe » suit
   * LA règle des cartes et d'Objets (`enChauffe`). La consigne entre − et + :
   * une décimale et « ° » (« 20,0° »), dans la police du texte ; « — » sans
   * consigne lisible. Au planning, celle de la pièce (`dec`, 30/10). */
  const consigne = target != null ? nombre(Number(target) - dec, 1) + '°' : '—';
  const chauffe = enChauffe({ famille: 'thermostat', muet: mort, marche, action: a.hvac_action });
  const froid = !mort && marche && cooling;
  const eteint = mort || !marche;
  const fenetre = !mort && auPlanning && ch.source === 'fenetre';
  const sub = mort ? tr('Indisponible')
    : auPlanning ? phrasePlanning(ch, etat, Date.now())
      : !marche ? tr('Éteint') : chauffe ? tr('Chauffe') : cooling ? tr('Refroidit')
        : target != null && consigneAtteinte(a.current_temperature, target, mode, uT) ? tr('Consigne atteinte') : tr('Au repos');
  /* L'étiquette sous la valeur dit QUI décide (`etiquetteCarte`, réserve de
   * la carte prise à la tâche 10 bis B). Au planning, celle du fil pilote :
   * PLANNING quand le planning décide — sa propre bande Arrêt comprise —,
   * MANUEL repris en main — la bascule qui coupe comprise —, MODE fenêtre
   * ouverte. À l'arrêt ou fenêtre ouverte, la valeur dit le mode que le
   * moteur applique, « Arrêt », « Éco », comme celle d'un module : jamais un
   * chiffre sous « MODE » — celui qu'il ENVOIE (`applique`, relecture de la
   * partie B : l'Arrêt d'un thermostat sans `off` est son Hors-gel). Planning
   * éteint, CONSIGNE, comme avant.
   * « Consigne » et « Mode » sont déjà dits au lecteur d'écran devant la
   * valeur (`o-vh`) : l'étiquette ne les répète pas ; PLANNING et MANUEL se
   * lisent, l'état ne dit plus que « jusqu’à 22:30 ». */
  const parMode = auPlanning && (eteint || fenetre);
  const motDuMode = !parMode ? null : mort ? '—' : fenetre ? (motMode(ch.applique || ch.mode) || '—') : motMode('arret');
  const cleEtiquette = etiquetteCarte({ consigne: true, auPlanning, source: auPlanning ? ch.source : null, eteint });
  const etiquette = motEtiquette(cleEtiquette);
  const etiquetteDite = cleEtiquette === 'planning' || cleEtiquette === 'manuel';
  /* Plus de `role="button"` autour de l'interrupteur et des − / + (lot 13 de
   * l'audit du 03/10, ADR 0074) : la fiche s'ouvre par la surface, nommée de
   * ce que la carte affiche (« Thermostat salon, jusqu’à 22:30 »).
   * Voir la carte du volet, juste au-dessus. */
  const piece = mesureLisible(a.current_temperature);
  return (
    <div className={'o-rmcard o-gabarit' + (mort ? ' o-panne' : '')} data-chauffage="" style={{ ...RM_CARD, position: 'relative', cursor: onOpen ? 'pointer' : 'default',
      // Teinte d'état : l'orange de la chauffe, le bleu du froid — jamais au simple mode.
      ...((chauffe || froid) && LAVIS ? { background: lavisCarte(chauffe ? 'var(--o-warn2-rgb)' : 'var(--o-cold-rgb)') } : null),
      // Le liseré du réglage, comme lumière et volet (04/10).
      border: LISERE }}>
      {onOpen && <Surface onClick={() => onOpen(id)} label={nomCarte(nom, sub)} />}
      {/* La ligne du haut. Carte large : la plaque, la bascule. Carte étroite (passe téléphone, T13) : la plaque et la température de la
        * pièce — la marche et l'arrêt passent dans la fiche. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <span style={plaqueChauffage({ chauffe, froid, eteint })}><GlypheCarte id={id} size={17}><Fi i="thermometer-half" size={17} /></GlypheCarte></span>
        {!mort && <RmBascule className="o-seul-large" on={marche} nom={nom} onToggle={basculer} />}
        {piece != null && <ChiffreHaut v={nombre(piece, 1)} degre lu couleur={eteint ? 'var(--o-text2)' : 'var(--o-text)'} />}
      </div>
      <div style={RM_MILIEU}>
        <div style={{ minWidth: 0 }}>
          <div className="o-gab-nom" style={RM_NAME}>{nom}</div>
          <div className="o-gab-phrase" style={{ ...RM_SUB, color: couleurEtatChauffage({ fenetre, chauffe, froid, eteint }), '--o-n': Math.max(1, String(sub).length) }}>{sub}</div>
        </div>
        <TemperaturePiece v={piece} eteint={eteint} />
      </div>
      {/* LA RANGÉE DU BAS DESCEND PAR SA MARGE AUTO (la maquette). Une marge
        * auto prend l'espace libre AVANT le `space-between` du cadre : sans
        * espace libre elle vaut 0, et ne pousse rien dehors — la leçon du
        * 09/10, quand une marge fixe poussait le corps du volet 12 px sous sa
        * zone. Les 14 px de rembourrage de la maquette tiennent dans les
        * 150 px de contenu de la carte, liseré ôté (38 + 14 + 38 + 14 + 44 =
        * 148) ; sur une carte étroite, 10 et 9 px, le nom sur deux lignes et
        * l'état dessous (38 + 10 + 32 + 2 + 15 + 9 + 44 = 150, index.css).
        * − et + SEULS sont positionnés (RM_BTN), pas leur rangée : la
        * consigne et les écarts restent sous la surface, un appui sur
        * « 20,0° » ouvre la fiche, comme avant (relecture du lot 13). − et +
        * reçoivent leurs clics, et nomment le thermostat. La consigne se LIT :
        * un `aria-label` sur un <span> sans rôle est interdit (ARIA 1.2) ; le
        * mot passe en texte masqué, le chiffre reste ce que l'on voit (lot 13
        * de l'audit du 03/10) — et l'étiquette visible, qui le répète, se tait. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--o-pas-ecart, 8px)', marginTop: 'auto', paddingTop: 'var(--o-pied-haut, 14px)', '--o-mot': motLePlusLong(parMode ? motDuMode : consigne) }}>
        <button aria-label={tr('Baisser la consigne') + ' ' + nom} disabled={!reglable} onClick={(e) => { e.stopPropagation(); if (auPlanning) reprendreT(-0.5); else setT(-0.5); }} className="o-rmbtn" style={{ ...RM_BTN, ...RM_PAS, ...(reglable ? null : RM_INERTE) }}><Fi i="minus-small" size={16} /></button>
        {/* Le mot d'un mode s'écrit plein, comme celui d'un module ; la consigne d'un thermostat éteint, effacée. */}
        <ValeurEtiquette valeur={parMode ? motDuMode : consigne} dit={parMode ? tr('Mode') : tr('Consigne')} etiquette={etiquette} lue={etiquetteDite}
          long={parMode && motLong(motDuMode)} couleur={parMode || !eteint ? 'var(--o-text)' : 'var(--o-text3)'} />
        <button aria-label={tr('Monter la consigne') + ' ' + nom} disabled={!reglable} onClick={(e) => { e.stopPropagation(); if (auPlanning) reprendreT(0.5); else setT(0.5); }} className="o-rmbtn" style={{ ...RM_BTN, ...RM_PAS, ...(reglable ? null : RM_INERTE) }}><Fi i="plus-small" size={16} /></button>
      </div>
    </div>
  );
}

// Radiateur fil pilote (chambres) : consigne = input_number, mode = input_select, auto = input_boolean.
/* Les modes d'un radiateur fil pilote sont LUS SUR SON ENTITE.
 *
 * Ils etaient ecrits en dur — « Confort », « Eco », « Hors-Gel », « Arret » —
 * c'est-a-dire les options de l'`input_select` d'UNE installation. Chez
 * quelqu'un qui aurait nomme les siennes « Comfort » ou « Frost », le bouton
 * envoyait une option inexistante : Home Assistant refusait, sans rien dire.
 *
 * `attributes.options` porte la liste reelle. On l'envoie telle quelle. */
function pilotOptions(S, modeEnt) {
  const st = S && modeEnt && S[modeEnt];
  const o = st && st.attributes && st.attributes.options;
  return Array.isArray(o) ? o.filter(x => typeof x === 'string' && x) : [];
}

/** Les modes d'une zone, quelle que soit sa famille.
 *
 * Un vrai thermostat porte ses modes dans `hvac_modes` — c'est l'equivalent
 * standard des options d'un `input_select`. Les avoir oublies avait vide la
 * barre de modes du poele : il ne restait plus que la consigne. */
function zoneModes(S, zone) {
  if (!zone) return [];
  if (estClimate(zone)) {
    const st = S && S[zone.haid];
    return modesClimat(st && st.attributes, []);
  }
  return pilotOptions(S, zone.modeEnt);
}

/** Les modes HVAC d'un `climate`, filtrés : des mots, rien d'autre. Une
 * seule règle pour la carte, la fiche, l'Accueil et zoneModes (lot 16,
 * 05/10) : carte et fiche lisaient `hvac_modes` brut — une chaîne faisait
 * tomber la vue (`all.map`), un `null` dessinait une puce vide. Une liste
 * vide reste vide ; seule une non-liste prend le repli. */
function modesClimat(attrs, repli) {
  const m = attrs && attrs.hvac_modes;
  return Array.isArray(m) ? m.filter(x => typeof x === 'string' && x) : repli;
}

/** Le mot d'un mode HVAC, pour les deux fiches qui en montrent — le fil
 * pilote et le thermostat (audit du 03/10). Celui de Home Assistant d'abord :
 * il traduit les modes dans toutes ses langues, et c'est le mot que
 * l'utilisateur lit partout ailleurs. Sans lui — la démo, une langue choisie
 * dont les ressources n'ont pas encore répondu —, celui de Loggia.
 *
 * La fiche du thermostat avait sa table à elle, sans Home Assistant, et sa
 * clé « Froid » servait aussi la jauge de température (16 °C) et le blanc de
 * 6 500 K, « Sec » la jauge d'humidité : l'allemand, qui les avait traduites
 * en modes, écrivait « Kühlen » sous 16 °C. Ici « Froid » et « Sec » ne sont
 * plus que des modes ; la sensation a ses clés (`trSens`, confort.js). */
function motModeClimat(mode) {
  const ha = trHA('component.climate.entity_component._.state.' + mode);
  if (ha) return ha;
  const loggia = { off: tr('Arrêt'), heat: tr('Chauffage'), cool: tr('Froid'), auto: tr('Auto'), heat_cool: tr('Auto'), dry: tr('Sec'), fan_only: tr('Ventil') };
  return Object.prototype.hasOwnProperty.call(loggia, mode) ? loggia[mode] : mode;
}

/** Le mot affiche pour un mode. Les options d'un `input_select` sont deja des
 * mots choisis par l'utilisateur, on ne les touche pas. */
function zoneModeLabel(zone, mode) {
  if (!estClimate(zone)) return mode;
  return motModeClimat(mode);
}
/* La VALEUR entre − et + — le mot d'un mode (plan 2 du chantier Chauffage),
 * ou la consigne —, dans la police du texte, en 800 (cartes 1a,
 * `RM_VALEUR_LIGNE`), sa taille choisie par la feuille (`o-gab-valeur`,
 * index.css, que pose `ValeurEtiquette`) d'après deux mesures posées ici :
 *  - `--o-taille`, celle d'une carte LARGE : les 15 px de la maquette, 12 ou
 *    10 px pour un mot long ;
 *  - `--o-n`, sa longueur : sur une carte ÉTROITE, la police se réduit,
 *    entre 10 et 15 px, pour que le mot tienne sur UNE ligne entre les deux
 *    boutons, qui lui cèdent de la place quand il est long — jamais sous
 *    28 px (`--o-mot`, passe téléphone, T18).
 * Un mot ne se coupe jamais (revue du 14/10, R8 : « Wyłączone » devenait
 * « Wyłączon / e » à 360 px) : celui qui ne tient pas même à 10 px finit en
 * « … », jamais par-dessus les boutons ; « Ochrona przed zamarzaniem », le
 * Hors-gel polonais (nouveau, à faire relire à Seba882), passe à la ligne entre
 * ses mots. La mise en page s'adapte au texte, jamais l'inverse. */
const MOT_MODE = (mot) => ({ minWidth: 0, '--o-taille': (mot.length > 16 ? 10 : mot.length > 10 ? 12 : 15) + 'px', '--o-n': Math.max(1, mot.length),
  lineHeight: mot.length > 10 ? 1.1 : 1.15, overflow: 'hidden', textOverflow: 'ellipsis' });
/* La longueur du plus long mot d'une valeur (passe téléphone, T18) : sur une carte étroite, la place de la valeur s'élargit pour lui, et
 * − et + lui cèdent (`--o-mot`, index.css) — « Frostschutz », « Wyłączone » ne finissent plus en « … » à 390 et 360 px. */
const motLePlusLong = (mot) => String(mot).split(/\s+/).reduce((n, m) => Math.max(n, m.length), 0);
/* La paire « valeur / étiquette » d'une carte (passe téléphone, § 2.2) : la consigne ou le mode entre − et + d'un chauffage, les kWh
 * du jour à droite de la bascule d'une prise (`kwh` : à droite, de 13 à 11 px). La valeur dit d'abord, au lecteur d'écran, ce qu'elle
 * est (`dit`, en texte masqué : « Consigne 22,0° ») ; l'étiquette visible ne le répète pas (`aria-hidden`), sauf quand elle dit QUI
 * décide (`lue` : Planning, Manuel). Leurs tailles vivent dans la feuille (`o-gab-valeur`, `o-gab-etiquette`) : celles de la maquette
 * sur une carte large ; sur une carte étroite, elles rétrécissent d'après la place qui reste et leur longueur, et l'étiquette passe en
 * minuscules. Un mot ne se coupe jamais : il passe à la ligne entre deux mots, sinon il finit en « … ». `long` : un mot de mode trop
 * long, qui efface l'étiquette d'une carte étroite (`data-long`). `point` : ce qui précède la valeur (le point d'un mode). Jamais
 * positionnée : un appui sur elle ouvre la fiche. */
function ValeurEtiquette({ valeur, dit = null, etiquette, lue = false, long = false, point = null, couleur = 'var(--o-text)', kwh = false }) {
  return (
    <div style={kwh ? { ...RM_VALEUR, textAlign: 'right' } : RM_VALEUR}>
      <div style={{ ...RM_VALEUR_LIGNE, ...(kwh ? { justifyContent: 'flex-end' } : null), color: couleur }}>
        {point}
        <span className="o-gab-valeur" data-kwh={kwh ? '' : undefined} style={MOT_MODE(valeur)}>{dit != null && <span className="o-vh">{dit + ' '}</span>}{valeur}</span>
      </div>
      <div aria-hidden={lue ? undefined : 'true'} className="o-gab-etiquette" data-long={long ? '' : undefined} style={RM_ETIQUETTE(etiquette)}>{etiquette}</div>
    </div>
  );
}
/**
 * Une zone de chauffage — un module fil pilote découvert, ou une zone
 * décrite à la main — lue par UNE règle, celle de sa carte ET du compte
 * « · n chauffent » d'Objets (relecture de la dernière passe) :
 * `{ muet, watts, chauffe }`.
 *  - muet : le `select` d'un module manque ou ne dit rien (`moduleMuet`) ; le
 *    thermostat d'une zone décrite à la main manque, ou ne dit rien
 *    (`estMuet` : `unavailable`, `unknown`) ;
 *  - watts : la puissance d'un module (`wattsDe`), null sans capteur ;
 *  - chauffe : LA règle `enChauffe` — un module, plus de 10 W mesurés ; une
 *    zone décrite en marche, sa pièce sous sa consigne.
 * `z` : son état lu (`readZone`). `marche` et `consigne` : ce que la carte
 * affiche, son avance optimiste comprise ; à défaut, l'état lu.
 */
function chauffeDeZone(S, zone, z = readZone(S, zone), { marche = z.mode !== 'off', consigne = z.target != null ? z.target : null } = {}) {
  // `muette`, pas `muet` : des tests du distributeur découpent App.jsx au premier « const muet = ».
  if (zone.decouvert) {
    const muette = moduleMuet(S && S[zone.modeEnt]);
    const watts = zone.puissance && S ? wattsDe(S[zone.puissance]) : null;
    return { muet: muette, watts, chauffe: enChauffe({ famille: 'module', muet: muette, watts }) };
  }
  const muette = !!(estClimate(zone) && (!S || !S[zone.haid] || estMuet(S[zone.haid].state)));
  return { muet: muette, watts: null, chauffe: enChauffe({ famille: 'zone', muet: muette, marche, mesure: z.current, consigne }) };
}
function RoomPilotCard({ zone, hass, onOpen, titre = null }) {
  const S = (hass && hass.states) || null;
  const z = readZone(S, zone);
  const uT = uniteTemp(null, hass);
  const [ov, setOv] = useOptimiste([z.target, z.mode].join('|'));
  /* Pas de 19 invente (audit du 03/10) : un `input_number` absent ou
   * indisponible laisse la consigne VIDE — « — » et des boutons inertes —
   * au lieu d'afficher 19 et d'envoyer 19,5 au premier « + ». Sans entite
   * de consigne, rien a regler non plus : l'appel partait vers personne. */
  const target = ov != null ? ov : (z.target != null ? z.target : null);
  const reglable = target != null && !!zone.tempCible;
  /* Un MODULE fil pilote découvert (plan 2 du chantier Chauffage, choix 8)
   * n'a pas de consigne : entre − et +, son MODE, que − / + font passer au
   * mode voisin, du plus froid au plus chaud — Arrêt, Hors-gel, Éco,
   * Confort −2, −1, Confort. Le moteur le dit : au planning, le mode qu'il
   * applique (`applique` : un module sans Éco reçoit son Hors-gel ; sans ce
   * champ, le mode voulu), et chaque geste est une reprise en main ; planning éteint, le
   * mode que l'option du module représente, et l'ordre part au module,
   * l'option telle qu'il l'écrit — en « Observer sans agir » aussi, le moteur
   * n'envoyant rien (voir RoomClimateCard). Sans l'état du moteur, − / +
   * restent inertes. Une zone décrite à la main ne fait pas interroger le
   * moteur et ne lit pas son état : elle reste ce qu'elle était. */
  const estModule = !!zone.decouvert;
  const { etat } = useEtatChauffage(estModule);
  const ch = estModule ? chauffageDe(etat, zone.modeEnt) : null;
  const auPlanning = !!(ch && ch.planning && !etat.simulation);
  const modeLu = !ch ? null : auPlanning ? ch.applique || ch.mode : modeDuModule(ch.options, z.modeBrut);
  const [ovMode, setOvMode] = useOptimiste(modeLu);
  const mode = ovMode != null ? ovMode : modeLu;
  const off = mode ? mode === 'arret' : z.mode === 'off';
  // Bascule : arrêt ↔ confort (ou le premier mode qui n'est pas l'arrêt),
  // optimiste comme partout. Les autres modes vivent dans la fiche. Un module
  // que le moteur connaît bascule par la même voie que − / +.
  const [ovOn, setOvOn] = useOptimiste(z.mode);
  const marche = ovOn != null ? ovOn : !off;
  /* En panne, en chauffe : LA lecture de sa zone, celle du compte « · n
   * chauffent » d'Objets (`chauffeDeZone`, relecture de la dernière passe).
   * En panne, un MODULE muet — son `select` manque ou ne dit rien —, ou le
   * thermostat d'une zone décrite à la main qui ne répond plus : la carte le
   * dit comme celle d'un thermostat en panne, « Indisponible », le liseré de
   * panne, sa bascule s'efface et − / + ne répondent plus. « Chauffe » : un
   * module la MESURE — son capteur de puissance, plus de 10 W, même à
   * l'Arrêt (`etatModule` dit le reste) ; une zone décrite à la main, en
   * marche, sa pièce sous la consigne que la carte affiche. */
  const { muet: mort, watts, chauffe } = chauffeDeZone(S, zone, z, { marche, consigne: target });
  const call = (d, s, data) => commanderService(hass, (data || {}).entity_id, d, s, data || {});
  // Bornes de repli en Celsius (RM_TMIN/RM_TMAX), reconverties vers l'unite reelle :
  // aucune entite ne borne un input_number, rien d'autre ne protege ce cadran.
  const setT = (d) => { const v = pasConsigne(target, d, deCelsius(RM_TMIN, uT), deCelsius(RM_TMAX, uT)); if (v == null || !reglable) return; setOv(v); call('input_number', 'set_value', { entity_id: zone.tempCible, value: v }); };
  const options = zoneModes(S, zone);
  const poserMode = (m) => {
    if (estClimate(zone)) commander(hass, zone.haid, 'set_hvac_mode', m);
    else call('input_select', 'select_option', { entity_id: zone.modeEnt, option: m });
  };
  /* Un mode au module : au planning, s'il le comprend (le moteur le dit) ;
   * planning éteint, si son option existe — jamais à un module muet. Sinon le
   * bouton reste inerte. L'avance se retire au refus du moteur ; l'ordre
   * direct a le filet de `useOptimiste`, comme toute commande d'appareil. */
  const ordonnable = (m) => !!(m && ch && !mort && (auPlanning ? Array.isArray(ch.modes) && ch.modes.indexOf(m) >= 0 : ch.options && ch.options[m]));
  const ordonner = (m, annuler) => {
    setOvMode(m);
    if (auPlanning) reprendreLaMain(hass, ch, { mode: m }, () => { setOvMode(null); if (annuler) annuler(); });
    else poserMode(ch.options[m]);
  };
  const moins = ch && modeVoisin(ch.modes, mode, -1), plus = ch && modeVoisin(ch.modes, mode, 1);
  const baisse = estModule ? ordonnable(moins) : reglable, monte = estModule ? ordonnable(plus) : reglable;
  const modeArret = options.find(o => pilotFamille(o) === 'off') || 'off';
  const modeMarche = options.find(o => pilotFamille(o) === 'confort') || options.find(o => pilotFamille(o) !== 'off') || null;
  const basculer = () => {
    const nv = !marche; setOvOn(nv);
    const cible = nv ? 'confort' : 'arret';
    if (ordonnable(cible)) { ordonner(cible, () => setOvOn(null)); return; }
    const m = nv ? modeMarche : modeArret; if (m) poserMode(m);
  };
  const nom = titre || zone.name;
  // La consigne d'une zone décrite, entre les deux boutons qui la bougent : « 19,0° », « 19,5° ».
  const consigne = target != null ? nombre(Number(target), 1) + '°' : '—';
  // Un module n'a pas de consigne : son mode, « Éco », « Confort −1 » — muet, « — ».
  const motDuMode = (!mort && motMode(mode)) || '—';
  const etatCarte = estModule ? etatModule(watts, marche ? mode : 'arret') : !marche ? 'eteint' : chauffe ? 'chauffe' : 'repos';
  const eteint = mort || !marche;
  const fenetre = !mort && auPlanning && ch.source === 'fenetre';
  /* L'état, une phrase (cartes 1a). Au planning, jusqu'à quand
   * (`phrasePlanning`) — sans redire l'étiquette ni la valeur (son choix du
   * 12/10, « Ne pas répéter le bas »). Hors du planning, un module dit
   * « Chauffe » quand il MESURE plus de 10 W (choix 8 : la mesure passe avant
   * l'ordre, à l'Arrêt aussi), « Éteint » à l'Arrêt ; sinon ce qu'il en est
   * du planning — « Sans planning » éteint (son étiquette dit déjà MANUEL,
   * l'état ne le redit pas, tâche 10 bis B), « Observer sans agir » observé ;
   * l'état du moteur pas encore lu, rien : la carte n'en sait rien (une
   * espace insécable garde la ligne ; `nomCarte` ne la lit pas) — relecture
   * de la partie B. Une zone décrite à la main garde ses mots. */
  const sub = mort ? tr('Indisponible')
    : !estModule ? (chauffe ? tr('Chauffe') : etatCarte === 'eteint' ? tr('Éteint') : tr('Au repos'))
      : auPlanning ? phrasePlanning(ch, etat, Date.now())
        : chauffe ? tr('Chauffe') : etatCarte === 'eteint' ? tr('Éteint')
          : !ch ? ' ' : ch.planning === true && etat.simulation ? tr('Observer sans agir') : tr('Sans planning');
  /* L'étiquette sous la valeur dit QUI décide (`etiquetteCarte`) : la
   * consigne d'une zone décrite ; au planning, PLANNING — le planning, sa
   * propre bande Arrêt comprise, et la maison —, MANUEL — une reprise en main,
   * la bascule qui coupe comprise —, MODE — une fenêtre ouverte, dont la
   * valeur dit l'Arrêt ou l'Éco qu'elle impose ; planning éteint, MODE à
   * l'arrêt, MANUEL sinon. « Consigne » et « Mode » sont déjà dits au lecteur
   * d'écran devant la valeur (`o-vh`) : l'étiquette ne les répète pas. */
  const cleEtiquette = etiquetteCarte({ consigne: !estModule, auPlanning, source: auPlanning ? ch.source : null, eteint });
  const etiquette = motEtiquette(cleEtiquette);
  const etiquetteDite = cleEtiquette === 'planning' || cleEtiquette === 'manuel';
  const piece = mesureLisible(z.current);
  return (
    /* Même structure que le thermostat (lot 13 de l'audit du 03/10, ADR
     * 0074) : la surface ouvre la fiche de la zone et dit ce que la carte
     * affiche (« Chambre, jusqu’à 22:30 ») ; l'interrupteur, déjà
     * positionné, et les boutons − / + — eux seuls, pas leur rangée
     * (relecture du lot 13) — passent au-dessus d'elle. La valeur et son
     * étiquette, du texte, restent dessous : un appui sur elles ouvre la
     * fiche, comme avant. */
    <div className={'o-rmcard o-gabarit' + (mort ? ' o-panne' : '')} data-chauffage="" style={{ ...RM_CARD, position: 'relative', cursor: onOpen ? 'pointer' : 'default',
      // Teinte d'état : l'orange de la chauffe — mesurée, jamais au simple mode.
      ...(chauffe && LAVIS ? { background: lavisCarte('var(--o-warn2-rgb)') } : null),
      border: LISERE }}>
      {onOpen && <Surface onClick={() => onOpen(zone.id)} label={nomCarte(nom, sub)} />}
      {/* La ligne du haut. Carte large : la plaque, la bascule. Carte étroite (passe téléphone, T13) : la plaque et la température de la
        * pièce — la marche et l'arrêt passent dans la fiche. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <span style={plaqueChauffage({ chauffe, eteint, mode: estModule ? mode : null })}><GlypheCarte id={'zone:' + zone.id} size={17}><Fi i="heat" size={17} /></GlypheCarte></span>
        {!mort && (modeMarche || off) && <RmBascule className="o-seul-large" on={marche} nom={nom} onToggle={basculer} />}
        {piece != null && <ChiffreHaut v={nombre(piece, 1)} degre lu couleur={eteint ? 'var(--o-text2)' : 'var(--o-text)'} />}
      </div>
      <div style={RM_MILIEU}>
        <div style={{ minWidth: 0 }}>
          <div className="o-gab-nom" style={RM_NAME}>{nom}</div>
          <div className="o-gab-phrase" style={{ ...RM_SUB, color: couleurEtatChauffage({ fenetre, chauffe, eteint }), '--o-n': Math.max(1, String(sub).length) }}>{sub}</div>
        </div>
        <TemperaturePiece v={piece} eteint={eteint} />
      </div>
      {/* La rangée du bas, celle du thermostat (sa marge auto, ses boutons
        * seuls positionnés). Un module nomme ses boutons et sa valeur par son
        * MODE, précédé de son point : il n'a pas de consigne, et « Baisser la
        * consigne » aurait menti. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--o-pas-ecart, 8px)', marginTop: 'auto', paddingTop: 'var(--o-pied-haut, 14px)', '--o-mot': motLePlusLong(estModule ? motDuMode : consigne) }}>
        <button aria-label={(estModule ? tr('Mode plus froid') : tr('Baisser la consigne')) + ' ' + nom} disabled={!baisse} onClick={(e) => { e.stopPropagation(); if (estModule) ordonner(moins); else setT(-0.5); }} className="o-rmbtn" style={{ ...RM_BTN, ...RM_PAS, ...(baisse ? null : RM_INERTE) }}><Fi i="minus-small" size={16} /></button>
        {/* Le point du mode ne s'écrit que pour la carte large : la plaque de l'icône porte déjà sa couleur. Un mot de plus de 13 lettres
          * (« Frost protection », « Ochrona przed zamarzaniem ») tient sur deux lignes ou plus d'une carte étroite : son étiquette s'y efface
          * (`motLong`, `data-long`), la rangée garde ses 44 px. */}
        <ValeurEtiquette valeur={estModule ? motDuMode : consigne} dit={estModule ? tr('Mode') : tr('Consigne')} etiquette={etiquette} lue={etiquetteDite}
          long={estModule && motLong(motDuMode)} couleur={estModule || !eteint ? 'var(--o-text)' : 'var(--o-text3)'}
          point={estModule && !mort && motMode(mode) ? <span aria-hidden="true" className="o-chauffage-point o-seul-large" style={RM_POINT(couleurMode(mode))} /> : null} />
        <button aria-label={(estModule ? tr('Mode plus chaud') : tr('Monter la consigne')) + ' ' + nom} disabled={!monte} onClick={(e) => { e.stopPropagation(); if (estModule) ordonner(plus); else setT(0.5); }} className="o-rmbtn" style={{ ...RM_BTN, ...RM_PAS, ...(monte ? null : RM_INERTE) }}><Fi i="plus-small" size={16} /></button>
      </div>
    </div>
  );
}

function RoomPilotSheet({ zone, hass, onClose }) {
  const S = (hass && hass.states) || null;
  const z = readZone(S, zone);
  const uT = uniteTemp(null, hass);
  const [ov, setOv] = useOptimiste([z.target, z.mode, z.auto].join('|'));
  // Meme regle que la carte (audit du 03/10) : pas de 19 invente, ni au
  // cadran ni dans l'appel du premier « + ».
  const target = ov != null ? ov : (z.target != null ? z.target : null);
  const reglable = target != null && !!zone.tempCible;
  const off = z.mode === 'off';
  const heating = !off && z.current != null && target != null && z.current < target;
  const call = (d, s, data) => commanderService(hass, (data || {}).entity_id, d, s, data || {});
  const tMinReel = deCelsius(RM_TMIN, uT), tMaxReel = deCelsius(RM_TMAX, uT);
  const setT = (d) => { const v = pasConsigne(target, d, tMinReel, tMaxReel); if (v == null || !reglable) return; setOv(v); call('input_number', 'set_value', { entity_id: zone.tempCible, value: v }); };
  // La température vécue : le capteur de la zone s'il existe (état numérique, requête légère),
  // sinon l'attribut current_temperature du climate.
  const ptsTemp = useHistorique24(hass, zone.tempSensor || (estClimate(zone) ? zone.haid : null), zone.tempSensor ? null : 'current_temperature');
  const pct = target == null ? 0 : Math.max(0, Math.min(1, (target - tMinReel) / (tMaxReel - tMinReel)));
  const R = 54, ARC = 2 * Math.PI * R * 0.75;
  /* Même définition que RoomPilotCard (05/10). Thermostat mort, la fiche
   * disait « AU REPOS » en ambre et ses puces de mode (`hvac_modes` survit à
   * la panne) envoyaient `set_hvac_mode` dans le vide. Le liseré fait le tour
   * du cadran. */
  const mort = !!(estClimate(zone) && (!S || !S[zone.haid] || S[zone.haid].state === 'unavailable'));
  const col = off || mort ? 'var(--o-text3)' : 'var(--o-warn)';
  return (
    <BottomSheet onClose={onClose}>
      {() => (<>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <NomFeuille><span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 800, letterSpacing: '.06em', color: 'var(--o-text2)' }}><Fi i="thermometer-half" size={13} color="var(--o-orange)" />{zone.name.toUpperCase()}</span></NomFeuille>
          {estClimate(zone) && <BoutonEpingle id={zone.haid} />}
          {zone.autoEnt && <span onClick={() => call('input_boolean', z.auto ? 'turn_off' : 'turn_on', { entity_id: zone.autoEnt })} role="switch" tabIndex={0} aria-label={z.auto ? tr('Désactiver la programmation automatique') : tr('Activer la programmation automatique')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); call('input_boolean', z.auto ? 'turn_off' : 'turn_on', { entity_id: zone.autoEnt }); } }} aria-checked={!!z.auto} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}><span style={{ fontSize: 12, fontWeight: 700, color: z.auto ? 'var(--o-accent-soft)' : 'var(--o-text3)' }}>{tr('Auto')}</span><span style={{ width: 42, height: 24, borderRadius: 14, background: z.auto ? 'var(--o-accent-fond)' : 'var(--o-bd1)', position: 'relative', transition: 'background .25s' }}><span style={{ position: 'absolute', top: 3, left: z.auto ? 21 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .32s cubic-bezier(.34,1.56,.64,1)' }} /></span></span>}
          <CroixFeuille />
        </div>
        <div className={mort ? 'o-panne' : undefined} style={{ position: 'relative', width: 230, height: 230, margin: '10px auto 0', borderRadius: mort ? '50%' : undefined }}>
          <svg width="230" height="230" viewBox="0 0 130 130" style={{ position: 'absolute', inset: 0, transform: 'rotate(135deg)' }}>
            <circle cx="65" cy="65" r={R} fill="none" stroke="var(--o-bd1)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${ARC} 999`} />
            <circle cx="65" cy="65" r={R} fill="none" stroke={col} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${ARC * pct} 999`} style={{ transition: 'stroke-dasharray .35s' }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 46, fontWeight: 800, letterSpacing: '-.02em', color: off ? 'var(--o-text3)' : 'var(--o-text)', lineHeight: 1 }}>{target != null ? <>{dec(target, 1)}<span style={{ fontSize: 25 }}>°</span></> : '—'}</div>
            {z.current != null && <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--o-text2)', marginTop: 5 }}>{tr('actuel {n}°', { n: decMax(z.current, 1) })}</div>}
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', marginTop: 6, textTransform: 'uppercase', color: off || mort ? 'var(--o-text3)' : heating ? 'var(--o-warn2)' : 'var(--o-warn)' }}>{mort ? tr('Indisponible') : off ? tr('ÉTEINT') : heating ? tr('CHAUFFE') : tr('AU REPOS')}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, margin: '10px 0 18px' }}>
          <button aria-label={tr('Baisser la consigne')} disabled={!reglable} onClick={() => setT(-0.5)} style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--o-s1)', border: LISERE, color: 'var(--o-text)', fontSize: 19, fontWeight: 700, cursor: 'pointer', ...(reglable ? null : RM_INERTE) }}>−</button>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)', textAlign: 'center', lineHeight: 1.35 }}>{tr('± par')}<br />{tr('pas de 0,5°')}</span>
          <button aria-label={tr('Monter la consigne')} disabled={!reglable} onClick={() => setT(0.5)} style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--o-s1)', border: LISERE, color: 'var(--o-text)', fontSize: 19, fontWeight: 700, cursor: 'pointer', ...(reglable ? null : RM_INERTE) }}>+</button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!mort && zoneModes(S, zone).map((opt) => { const on = z.modeBrut === opt; return (
            <button key={opt} onClick={() => { if (estClimate(zone)) commander(hass, zone.haid, 'set_hvac_mode', opt); else call('input_select', 'select_option', { entity_id: zone.modeEnt, option: opt }); }} style={{ flex: 1, padding: '12px 8px', borderRadius: 14, cursor: 'pointer', fontWeight: 700, fontSize: 12, border: 'var(--o-bw,1px) solid ' + (on ? 'transparent' : 'var(--o-bd2)'), background: on ? 'var(--o-accent-fond)' : 'var(--o-s1)', color: on ? '#fff' : 'var(--o-text1)' }}>{zoneModeLabel(zone, opt)}</button>
          ); })}
        </div>
        {/* Préréglage du thermostat (Turbo, Comfort, Overnight…) : le sélecteur
          * de la fiche native — les noms viennent de l'entité. */}
        {estClimate(zone) && !mort && (() => { const at = (S && S[zone.haid] && S[zone.haid].attributes) || {}; return Array.isArray(at.preset_modes) && at.preset_modes.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
            <MenuDeroulant icone="settings-sliders" etiquette={tr('Préréglage')} valeur={at.preset_mode && at.preset_mode !== 'unknown' ? at.preset_mode : null}
              options={at.preset_modes.slice(0, 10)} surChoix={(p) => commander(hass, zone.haid, 'set_preset_mode', p)} />
          </div>
        ); })()}
        {(zone.tempSensor || estClimate(zone)) && (<>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: 'var(--o-text3)', margin: '18px 0 9px' }}>{tr('TEMPÉRATURE · 24 H')}</div>
          <Courbe24 points={ptsTemp} couleur="var(--o-orange)" unite="°" />
        </>)}
      </>)}
    </BottomSheet>
  );
}

export { RM_INERTE, motLong, reprendreLaMain, RoomClimateCard, modesClimat, motModeClimat, MOT_MODE, motLePlusLong, ValeurEtiquette, chauffeDeZone, RoomPilotCard, RoomPilotSheet };
