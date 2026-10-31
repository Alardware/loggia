/* Les fiches : leur squelette, la fiche appareil universelle, les épingles, l'historique 24 h, et les coquilles des fiches chargées à la demande.
 * Sorti d’App.jsx tel quel (lot 5 de l’audit du 28/10, ADR 0283) : seuls les imports sont neufs. */
import { useState, Suspense, useRef, useEffect } from 'react';
import { lazyRecharge } from '../recharge.js';
import { LOGGIA_INDEX, compteOrdinaire, loggiaEnt, cfgVal, normRooms } from '../state.js';
import { gestesCover, positionPubliee, enPanne } from '../outils.js';
import { uniteTemp, versCelsius } from '../unites.js';
import { consigneClimat, plageClimat } from '../consigne.js';
import { pickSibling, siblingsOf } from '../discovery.js';
import { DOMAINES_ROBOT } from '../robots.js';
import { apresCommandeRobot } from '../robotsetat.js';
import { commander, commanderService, estVanneCarte } from '../actions.js';
import { brancherVidage } from '../config.js';
import { useLoggia } from '../runtime.js';
import { BottomSheet, Fi, useIdTitreFeuille, CroixFeuille, cvName, cvId, NomFeuille, TitreFeuille } from '../ui.jsx';
import { appuiBascule } from '../prises.js';
import { gardeDeSwitch, lireEtatPrises } from '../prisesetat.js';
import { glypheLecteur } from '../lecteur.js';
import { nomsMembres } from '../groupes.js';
import { estVigilance } from '../vigilance.js';
import { useDerniersEvenements } from '../historique.jsx';
import { useOptimiste } from '../optimiste.js';
import { couleurPile } from '../attention.js';
import { LISERE } from '../styles.js';
import { relTime } from '../format.js';
import { carteDistributeur, lireDistributeur } from '../distributeur.js';
import { lireEtatDistributeur, useEtatDistributeur, useDistribution, lancerDistribution, poserEtatDistributeur } from '../distributeuretat.js';
import { useEtatChauffage, chauffageParCle, chauffageDe } from '../chauffageetat.js';
import { coverFerme, coverOuvert, estVolet, iconeSelonEtat } from '../voletecran.js';
import { useEtatVolets, voletDe } from '../voletsetat.js';
import { consigneVoisine } from '../chauffageecran.js';
import { Ico } from '../icones.jsx';
import { reduireDerniers } from '../evenement.js';
import { tr, locale, comparerTextes } from '../i18n.js';
import { useHass, dec, useGardeSwitch, decMax, lireEpingles, basculerEpingle, FICHE_PILOTABLES, hx, soeursDe, ctxCapteurs, NOMS_GROUPES, cvEstLumiere, priseDe, indexLu, nomDeCle, climateZones, plantesDeLaMaison, capteursPlante, plantPiece, distributeurConfigure, croqKeys } from '../app/noyau.jsx';
import { GlypheCarte, RmJauge, RmBascule, BIN_ETATS, FAMILLES_BINAIRES, IlluOuvrant, ROOM_GENERIQUES } from '../cartes/briques.jsx';
import { modesClimat, RM_INERTE, motModeClimat, RoomPilotCard, RoomClimateCard, RoomPilotSheet } from '../cartes/chauffage.jsx';
import { CarteVanne, RoomFeederCard, PLAQUE_DISTRIBUTEUR } from '../cartes/distributeur.jsx';
// L'eau chaude et la borne (chantier G3, E2 et E3) : leurs coquilles, leurs cartes et popups à la demande.
import { CarteEauChaude, FicheEauChaude, CarteBorne, FicheBorne } from '../cartes/eauborne.jsx';
import { RoomGenericCard } from '../cartes/generique.jsx';
import { pilesDeLaMaisonCarte, membresDeLaMaison, RoomPilesCard, RoomGroupeCard, RoomVigilanceCard } from '../cartes/groupe.jsx';
import { useVueLumiere, RoomLightCard } from '../cartes/lumiere.jsx';
import { useVueLecteur, BRIQUES_MEDIA, RoomMediaCard } from '../cartes/media.jsx';
import { hassQuiConnait, dehorsDe, horsPiece, nonJugee, useVueMesure, estMesure, RoomMesureCard, lireNombre } from '../cartes/mesure.jsx';
import { RoomPlantCard } from '../cartes/plante.jsx';
import { useDemandeCoupure, RoomPriseCard } from '../cartes/prise.jsx';
import { useVueRobot, localiserRobot, plaqueRobot, RoomRobotCard } from '../cartes/robot.jsx';
import { RoomVoletCard, RoomCoverCard } from '../cartes/volet.jsx';
import { useSeconde, armChips, texteDate, CV_CADRE, FAN_FR, CvAlarm, CvCard, cvIcoEntite, FeuilleCalendrier, CamSheet, PlugIcon, SaisieCodeAlarme } from '../cartescustom/cartes.jsx';

// Carte du robot rendue cliquable : chargee a la demande, elle n'interesse
// que la vue Aspirateur et embarque son analyse d'image.
/* Aspirateur : on l'ouvre pour regarder le robot, pas au demarrage. */
// La fiche d'un robot — aspirateur ou tondeuse (ADR 0042, en feuille depuis le
// 18/09) : une seule, chargee a la demande par `FicheRobot`.
const FicheRobotContent = lazyRecharge(() => import('../ficherobot.jsx'));
// La fiche du distributeur, à onglets comme celle du robot (ADR 0155, 05/10) :
// chargée à la demande par `FicheDistributeur`, la coquille posée ici.
const FicheDistributeurContent = lazyRecharge(() => import('../fichedistributeur.jsx'));
// La fiche d'un chauffage, à onglets elle aussi (plan 2 du chantier Chauffage,
// tâche 8) : chargée à la demande par `FicheChauffage`, avec la semaine, le
// calcul du planning (chauffageplanning.js, chauffage.js) et son historique
// (tâche 10 bis D) — le démarrage n'en embarque rien : la carte écrit sa
// phrase avec `chauffageecran.js` (tâche 10 bis A).
const FicheChauffageContent = lazyRecharge(() => import('../fichechauffage.jsx'));
// La fiche d'un VOLET (chantier Volets, § 3.5) : chargée à la demande par
// `FicheVolet`, avec sa semaine (le jumeau voletsplanning.js), son historique et
// ses mots — le démarrage n'en embarque rien.
const FicheVoletContent = lazyRecharge(() => import('../fichevolet.jsx'));
// La fiche d'une PRISE (chantier Prises, § 3.5) : chargée à la demande par `FichePrise`, avec ses calculs
// (prisesfiche.js) — le démarrage n'en embarque rien.
const FichePriseContent = lazyRecharge(() => import('../ficheprise.jsx'));
// La feuille d'un switch qui n'est pas une prise, et son minuteur (audit des prises, 19/10) : chargée à la demande par
// `RoomSwitchSheet` — le démarrage n'en embarque rien.
const FicheSwitchContent = lazyRecharge(() => import('../ficheswitch.jsx'));
// La fiche d'une LUMIÈRE (chantier Lumières, § 3.5) : chargée à la demande par `FicheLumiere` — le démarrage n'en embarque rien.
const FicheLumiereContent = lazyRecharge(() => import('../fichelumiere.jsx'));
/* La feuille du Calendrier (audit des lumières, 19/10 : la borne du démarrage) : le mois entier et le choix des agendas se chargent
 * à la demande par `FeuilleCalendrier` — l'Accueil n'en montre que la carte du rail, le démarrage n'en embarque rien. */
const FeuilleCalendrierContent = lazyRecharge(() => import('../feuillecalendrier.jsx'));
// Les fiches d'un CAPTEUR (chantier Capteurs, C12) : chargées à la demande par `FicheCapteur` et `FicheBinaire` — le démarrage n'en embarque rien.
const FicheCapteurContent = lazyRecharge(() => import('../fichecapteur.jsx'));
const FicheBinaireContent = lazyRecharge(() => import('../fichecapteur.jsx').then(m => ({ default: m.RoomBinarySheet })));
// La feuille d'un LECTEUR (passe téléphone, T16) : chargée à la demande par `FicheMedia` — le démarrage n'en embarque rien.
const FicheMediaContent = lazyRecharge(() => import('../fichemedia.jsx'));
// La fiche météo (sa maquette « Cartes météo », cadre 1b, 20/10) : à la demande, comme les autres fiches.
const FicheMeteoContenu = lazyRecharge(() => import('../fichemeteo.jsx'));
// Les popups des groupes de capteurs (chantier Capteurs, étape 2 ; C27) : à l'ouverture d'une carte de groupe.
const FicheGroupeContent = lazyRecharge(() => import('../fichegroupe.jsx'));
// La fiche d'une plante (chantier Capteurs, étape 3 ; C31, C34) : à l'ouverture de sa carte — le démarrage n'en embarque rien.
const FichePlanteContent = lazyRecharge(() => import('../ficheplante.jsx'));

/* La feuille d'un LECTEUR (passe téléphone, T16 : la borne du démarrage) : la
 * coquille. Le contenu se charge à la demande (`fichemedia.jsx`) et n'importe
 * jamais App.jsx : la coquille lui passe ce qui n'existe qu'ici (`BRIQUES_MEDIA` :
 * la lecture d'un lecteur, l'épingle, le groupe segmenté).
 * Comme `FicheLumiere`, elle GARDE la feuille et pose la frontière Suspense
 * DEDANS : un morceau qui ne se charge pas (hors ligne, page périmée) se dit dans
 * la feuille, par sa barrière (`Barriere`, ui.jsx) — et non à la place de la vue
 * Objets entière (correction bis, point 1). Le repli tient la hauteur d'une fiche
 * (260 px), comme celui des autres feuilles chargées à la demande. */
/* La place (chantier Médias, § 10) : la phrase pour Alexa, les favoris, le navigateur et les applications vivent dans le morceau
 * de la fiche (fichemedia.jsx, navigateurmedias.jsx) — ils y étaient seuls à servir. Il ne reste ici que ce qui n'existe qu'ici.
 * La fiche de sa maquette (tâche 6 ; M12) : la coquille lui passe la VUE du lecteur — celle de sa carte (`useVueLecteur` : la lecture
 * fusionnée du jumeau, les avances d'un geste, la teinte, la phrase, les ordres explicites, le `hass` vivant) —, le glyphe de sa carte
 * (l'icône choisie devant), l'épingle, l'ouverture de la fiche universelle, et ses briques (`BRIQUES_MEDIA`, plus bas : la bascule, la
 * barre, le groupe segmenté, le dégradé du volume). `mpRead`, la lecture d'avant, est parti (tâche 9) : la lecture d'un lecteur vit
 * dans lecteur.js, pour la carte, la fiche, l'en-tête et l'Accueil. */
/* ── La fiche météo (sa maquette « Cartes météo », cadre 1b, 20/10) ──
 * La coquille garde la feuille et pose la frontière Suspense dedans ; le
 * contenu (fichemeteo.jsx) reçoit le `hass` VIVANT de l'entité et du soleil,
 * l'épingle, et l'ouverture de la fiche universelle (« L'appareil »), qui se
 * pose par-dessus. Le widget du rail l'ouvre, par `dc.ouvrir`. */
function FicheMeteo({ id, hass, onClose }) {
  const H = hassQuiConnait(useHass([id, 'sun.sun']), hass, id);
  const [fiche, setFiche] = useState(null);
  return (
    <BottomSheet onClose={onClose}>
      {() => (<>
        <Suspense fallback={<div style={{ minHeight: 260 }} />}>
          <FicheMeteoContenu id={id} hass={H} onFiche={setFiche} epingle={<BoutonEpingle id={id} />} />
        </Suspense>
        {fiche && <FicheAppareil id={fiche} hass={H} onClose={() => setFiche(null)} />}
      </>)}
    </BottomSheet>
  );
}

function FicheMedia({ id, hass, onClose }) {
  const vue = useVueLecteur(hass, id);
  const [fiche, setFiche] = useState(null);
  return (
    <BottomSheet onClose={onClose}>
      {() => (<>
        <Suspense fallback={<div style={{ minHeight: 260 }} />}>
          <FicheMediaContent id={id} vue={vue} briques={BRIQUES_MEDIA} onFiche={setFiche}
            glyphe={<GlypheCarte id={id} size={18}><Fi i={glypheLecteur(vue.l)} size={18} /></GlypheCarte>} epingle={<BoutonEpingle id={id} />} />
        </Suspense>
        {fiche && <FicheAppareil id={fiche} hass={vue.hass} onClose={() => setFiche(null)} />}
      </>)}
    </BottomSheet>
  );
}

/* ── Le squelette des fiches (maquettes du 14/09) ─────────────────────────
 *
 * Un titre en italique, une ligne d'etat dessous, la croix a droite (la
 * meme dans toutes les feuilles : CroixFeuille) ; puis
 * une commande principale, des puces, et des RANGEES : un titre, une phrase
 * qui dit ce que ca fait, et a droite la valeur, la bascule ou le bouton. */
function FicheEntete({ titre, sous, id = null, droite = null }) {
  /* C'est cette ligne qui NOMME la feuille : sans elle, un lecteur d'écran
   * annonce « dialogue » et rien d'autre à l'ouverture de n'importe quelle
   * fiche (audit du 27/09). `id` reste celui de l'entité, pour l'épingle. */
  const idTitre = useIdTitreFeuille();
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div id={idTitre || undefined} style={{ fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 24, fontWeight: 500, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{titre}</div>
        {sous ? <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--o-text3)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sous}</div> : null}
      </div>
      {droite}
      {id && <BoutonEpingle id={id} />}
      <CroixFeuille />
    </div>
  );
}
const FicheLibelle = ({ children, droite = null }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '20px 0 8px' }}>
    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: 'var(--o-text3)' }}>{children}</span>
    {droite}
  </div>
);
/* Hors ligne, le bloc de l'appareil porte le liseré de sa carte (ADR 0048,
 * 05/10) — et le SEUL : « Indisponible » reste en text3. Une fiche sans bloc
 * à elle (prise, serrure, capteur binaire, lumière, volet, plante,
 * distributeur) prête ce rôle à la rangée de l'appareil (`panne`) : le fond
 * et l'arrondi du bloc CONSIGNE du thermostat, pour que le liseré ait un
 * bord où tourner. Vivante, la rangée ne change pas. */
const FICHE_BLOC = { padding: '14px 16px', borderRadius: 14, background: 'var(--o-s1)' };
function FicheRangee({ titre, desc, droite, premiere = false, panne = false }) {
  return (
    <div className={panne ? 'o-panne' : undefined} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '13px 0', borderTop: premiere || panne ? 'none' : 'var(--o-bw,1px) solid var(--o-bd3)', ...(panne ? FICHE_BLOC : null) }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{titre}</div>
        {desc ? <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)', marginTop: 2 }}>{desc}</div> : null}
      </div>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>{droite}</div>
    </div>
  );
}
const FicheValeur = ({ children, couleur = 'var(--o-text)' }) => (
  <span style={{ fontSize: 14, fontWeight: 800, color: couleur, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{children}</span>
);
// Ce qu'une rangée montre À LA PLACE de sa commande quand l'appareil ne répond plus.
const FicheIndispo = () => <FicheValeur couleur="var(--o-text3)">{tr('Indisponible')}</FicheValeur>;
const FicheBouton = ({ children, onClick, icone = null, title = null }) => (
  <button onClick={onClick} title={title || undefined} aria-label={title || undefined} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10, border: LISERE, background: 'var(--o-s1)', color: 'var(--o-text1)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' }}>{icone && <Fi i={icone} size={12} />}{children}</button>
);
/* Des puces exclusives, arrondi 9 — pas de pilules. Choisie : bleu plein,
 * texte blanc, quel que soit l'appareil (retour du 18/09). */
function FichePuces({ options, valeur, onChoix }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {options.map(o => { const on = o.id === valeur; return (
        <button key={o.id} onClick={() => onChoix(o.id)} aria-pressed={on} style={{ padding: '8px 14px', borderRadius: 9, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, border: 'var(--o-bw,1px) solid ' + (on ? 'transparent' : 'var(--o-bd2)'), background: on ? 'var(--o-accent-fond)' : 'var(--o-s1)', color: on ? '#fff' : 'var(--o-text1)' }}>{o.nom}</button>
      ); })}
    </div>
  );
}
const heureDe = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const h = d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? h : d.toLocaleDateString(locale(), { day: '2-digit', month: 'short' }) + ' ' + h;
};
/* La zone Home Assistant d'une entite, par son nom — celle de la grille. */
const zoneDe = (id) => { const z = ((LOGGIA_INDEX && LOGGIA_INDEX.areaList) || []).find(a => (a.entities || []).indexOf(id) >= 0); return z ? z.name : null; };
const pileDe = (S, id) => { const sid = pickSibling(LOGGIA_INDEX, S, id, { domain: 'sensor', deviceClass: 'battery' }); const n = sid && S[sid] ? parseFloat(S[sid].state) : NaN; return isNaN(n) ? null : Math.round(n); };
const RangeeDernier = ({ st }) => <FicheRangee titre={tr('Dernier changement')} desc={tr('Depuis le journal de Home Assistant')} droite={<FicheValeur couleur="var(--o-text2)">{heureDe(st && st.last_changed)}</FicheValeur>} />;
// La rangée Pile d'une fiche : la règle de la maison (chantier Capteurs, C32).
const RangeePile = ({ n }) => (n == null ? null : <FicheRangee titre={tr('Pile')} desc={tr('Capteur sans fil')} droite={<FicheValeur couleur={couleurPile(n, 'var(--o-text)')}>{n} %</FicheValeur>} />);

// La feuille d'un ouvrant qui n'est PAS un volet (maquettes du 14/09) : sa
// position, ses puces, Stop — ce que son `supported_features` permet. Un volet
// a sa fiche à onglets (`FicheVolet`, chantier Volets).
function RoomCoverSheet({ id, hass, onClose }) {
  const S = (hass && hass.states) || null;
  const st = S ? S[id] : null;
  const a = (st && st.attributes) || {};
  const gestes = gestesCover(st);
  const publiee = positionPubliee(st);
  const realPos = publiee != null ? Math.max(0, Math.min(100, Math.round(publiee))) : (st && st.state === 'open' ? 100 : 0);
  const [ov, setOv] = useOptimiste(realPos);
  const pos = ov != null ? ov : realPos;
  const ferme = coverFerme(st, pos);
  /* Même définition que RoomCoverCard (05/10). Morte, la fiche disait
   * « Fermé », allumait la puce « Fermé » (sans position, `realPos` vaut 0)
   * et laissait la jauge, les puces et Stop partir vers une entité morte.
   * `unknown` aussi (`enPanne`, 19/10). Ses commandes suivent son
   * `supported_features`, comme la carte : sans SET_POSITION, ni jauge ni
   * « Mi-course ». Un refus de Home Assistant retire l'avance. */
  const mort = enPanne(id, st);
  const envoyer = (g, avance) => { if (mort || !g) return; if (avance != null) setOv(avance); commander(hass, id, g.capacite, g.valeur, null, null, () => setOv(null)); };
  const poser = (v) => { if (gestes.placer) envoyer({ capacite: gestes.placer, valeur: v }, v); };
  const nom = a.friendly_name || id;
  const zone = zoneDe(id);
  const etatTxt = ferme ? tr('Fermé') : coverOuvert(pos) ? tr('Ouvert') : tr('Ouvert à {n} %', { n: pos });
  /* Cette fiche n'est plus que celle des ouvrants qui ne sont PAS des volets
   * (V3) : garage, portail, velux, ouvrant sans classe. Le planning ne les
   * pilote pas (ADR 0137) : la rangée « Auto lever / coucher · Suit le
   * soleil » était fausse, elle est partie (sa décision du 19/10). Un ouvrant
   * SANS classe dit pourquoi Loggia le laisse : c'est là qu'on le cherche. */
  const sansClasse = !!st && !a.device_class;
  const chips = [gestes.descendre && { id: 'ferme', nom: tr('Fermé') }, gestes.placer && { id: 'mi', nom: tr('Mi-course') }, gestes.monter && { id: 'ouvert', nom: tr('Ouvert') }].filter(Boolean);
  // La puce choisie suit le meme verdict : sinon « Ferme » restait creuse sur
  // un volet ferme a 1 %, et aucune des trois n'etait allumee.
  const chip = ferme ? 'ferme' : coverOuvert(pos) ? 'ouvert' : pos === 50 ? 'mi' : null;
  return (
    <BottomSheet onClose={onClose}>
      {() => (<>
        <FicheEntete titre={nom} sous={[zone, mort ? tr('Indisponible') : etatTxt].filter(Boolean).join(' · ')} id={id} />
        {!mort && <>
        {gestes.placer && <>
        <FicheLibelle droite={<span style={{ fontSize: 18, fontWeight: 800, color: pos ? 'var(--o-purple)' : 'var(--o-text3)' }}>{pos} %</span>}>{tr('POSITION')}</FicheLibelle>
        <RmJauge v={pos} couleur="var(--o-purple)" grade="linear-gradient(90deg,rgba(var(--o-purple-rgb),.75),var(--o-purple))" label={tr('Position') + ' ' + nom} onCommit={poser} marge={0} />
        </>}
        {chips.length > 0 && <div style={{ marginTop: 12 }}>
          <FichePuces options={chips} valeur={chip} onChoix={(c) => { if (c === 'ferme') envoyer(gestes.descendre, 0); else if (c === 'ouvert') envoyer(gestes.monter, 100); else poser(50); }} />
        </div>}
        </>}
        <div style={{ marginTop: 14 }}>
          {sansClasse && <FicheRangee premiere titre={tr('Pas piloté par Loggia')}
            desc={tr('Il n’a pas de classe dans Home Assistant. Donnez-lui la classe Volet ou Store pour qu’il suive le planning.')} />}
          <FicheRangee premiere={!sansClasse} panne={mort} titre={tr('Position')} desc={tr('Course mesurée par le moteur')} droite={mort ? <FicheIndispo /> : <FicheValeur couleur="var(--o-purple)">{publiee != null ? realPos + ' %' : etatTxt}</FicheValeur>} />
          {!mort && gestes.stop && <FicheRangee titre={tr('Stop')} desc={tr('Arrête le moteur là où il est')} droite={<FicheBouton icone="square" onClick={() => envoyer(gestes.stop, null)}>{tr('Stop')}</FicheBouton>} />}
          <RangeeDernier st={st} />
        </div>
      </>)}
    </BottomSheet>
  );
}

// Fiche thermostat (maquettes du 14/09) : le bloc consigne, les modes, les
// rangees qui expliquent, et la journee de temperature.
function RoomClimateSheet({ id, hass, onClose }) {
  const S = (hass && hass.states) || {};
  const st = S[id] || null;
  const a = (st && st.attributes) || {};
  const uT = uniteTemp(a, hass);
  // Meme regle que la carte (audit du 03/10) : pas de 20 invente. Sans
  // consigne unique, la plage d'un `heat_cool` se montre, sans se piloter.
  const realTarget = consigneClimat(a);
  const plage = realTarget == null ? plageClimat(a) : null;
  const etatSt = st && st.state;
  const [ov, setOv] = useOptimiste([realTarget, etatSt].join('|'));
  const target = ov != null ? ov : realTarget;
  const reglable = target != null;
  const cur = a.current_temperature;
  const mode = st ? st.state : 'off';
  const off = mode === 'off';
  // Même définition que la carte (lot 16, 05/10) : la fiche qu'elle ouvre
  // disait « Au repos », interrupteur allumé, sur un appareil en panne.
  const mort = !st || st.state === 'unavailable';
  const heating = a.hvac_action === 'heating';
  const cooling = a.hvac_action === 'cooling';
  const all = modesClimat(a, ['off', 'heat']);
  const [ovOn, setOvOn] = useOptimiste(etatSt);
  const marche = ovOn != null ? ovOn : !off;
  const modeMarche = ['heat', 'auto', 'heat_cool', 'cool'].find(m => all.indexOf(m) >= 0) || all.find(m => m !== 'off') || 'heat';
  const basculer = () => { const nv = !marche; setOvOn(nv); commander(hass, id, 'set_hvac_mode', nv ? modeMarche : 'off'); };
  // Les bornes viennent de l'entite, pas d'une constante ; on affiche ce qui
  // a ete envoye, pas ce qui a ete demande. Sans consigne lisible, rien ne part.
  const setT = (d) => { if (!reglable) return; const v = commander(hass, id, 'set_temperature', consigneVoisine(target, d, a, uT) ?? target + d, 'temperature'); if (v != null) setOv(v); };
  const fmt = (t) => dec(Number(t), 1) + ' °' + uT;
  const nom = a.friendly_name || id;
  const zone = zoneDe(id);
  const etatTxt = mort ? tr('Indisponible') : !marche ? tr('Éteint') : heating ? tr('Chauffe') : cooling ? tr('Refroidit') : tr('Au repos');
  const presets = Array.isArray(a.preset_modes) ? a.preset_modes.slice(0, 8) : [];
  const ptsTemp = useHistorique24(hass, id, 'current_temperature');
  // Les ouvrants de la piece : une fenetre ouverte, et le radiateur chauffe la rue.
  const ouverts = zone
    ? ((((LOGGIA_INDEX && LOGGIA_INDEX.areaList) || []).find(z => z.name === zone) || { entities: [] }).entities || [])
      .filter(e => e.indexOf('binary_sensor.') === 0 && S[e] && S[e].state === 'on' && ['window', 'door', 'garage_door', 'opening'].indexOf((S[e].attributes || {}).device_class) >= 0)
      .map(e => cvName(S[e], e))
    : [];
  const rond = { width: 44, height: 44, borderRadius: 12, background: 'var(--o-s2)', border: LISERE, color: 'var(--o-text)', fontSize: 20, fontWeight: 700, cursor: 'pointer', flexShrink: 0 };
  return (
    <BottomSheet onClose={onClose}>
      {() => (<>
        <FicheEntete titre={nom} sous={[zone, etatTxt, reglable ? tr('consigne {t} °{u}', { t: dec(Number(target), 1), u: uT }) : null].filter(Boolean).join(' · ')} id={id} />
        {/* Hors ligne, le bloc de l'appareil porte le liseré de sa carte (ADR
            0048, 05/10) : la carte soufflait en rouge, la fiche ne disait
            « Indisponible » qu'en text3, le niveau du normal. Comme la tuile
            de CamSheet et la fiche du robot : un liseré, aucune autre couleur. */}
        <div className={mort ? 'o-panne' : undefined} style={{ marginTop: 16, padding: '14px 16px', borderRadius: 14, background: 'var(--o-s1)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: 'var(--o-text3)' }}>{tr('CONSIGNE')}</div>
            <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.02em', color: marche && !mort ? 'var(--o-warn)' : 'var(--o-text3)', lineHeight: 1.1, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{reglable ? fmt(target) : '—'}</div>
            {plage && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)', marginTop: 3 }}>{tr('Plage {bas} – {haut}, réglée dans Home Assistant', { bas: fmt(plage.bas), haut: fmt(plage.haut) })}</div>}
            {cur != null && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)', marginTop: 3 }}>{tr('Mesurée {t} dans la pièce', { t: fmt(cur) })}</div>}
          </div>
          <button aria-label={tr('Baisser la consigne')} disabled={!reglable} onClick={() => setT(-0.5)} style={reglable ? rond : { ...rond, ...RM_INERTE }}>−</button>
          <button aria-label={tr('Monter la consigne')} disabled={!reglable} onClick={() => setT(0.5)} style={reglable ? rond : { ...rond, ...RM_INERTE }}>+</button>
        </div>
        {!mort && <div style={{ marginTop: 12 }}>
          {presets.length > 0
            ? <FichePuces options={presets.map(p => ({ id: p, nom: p }))} valeur={a.preset_mode && a.preset_mode !== 'unknown' ? a.preset_mode : null} onChoix={(p) => commander(hass, id, 'set_preset_mode', p)} />
            : <FichePuces options={all.map(m => ({ id: m, nom: motModeClimat(m) }))} valeur={mode} onChoix={(m) => commander(hass, id, 'set_hvac_mode', m)} />}
        </div>}
        <div style={{ marginTop: 14 }}>
          <FicheRangee premiere titre={tr('Chauffe')} desc={tr('Coupe la zone sans toucher à la consigne')}
            droite={mort ? <FicheValeur couleur="var(--o-text3)">{tr('Indisponible')}</FicheValeur> : <RmBascule on={marche} nom={nom} onToggle={basculer} />} />
          {cur != null && <FicheRangee titre={tr('Température mesurée')} desc={tr('Relevée par le thermostat')} droite={<FicheValeur>{fmt(cur)}</FicheValeur>} />}
          {zone && <FicheRangee titre={tr('Fenêtre ouverte')} desc={ouverts.length ? ouverts.join(', ') : tr('Rien d’ouvert dans la pièce')} droite={<FicheValeur couleur={ouverts.length ? 'var(--o-warn)' : 'var(--o-ok)'}>{ouverts.length ? tr('oui') : tr('non')}</FicheValeur>} />}
          <RangeeDernier st={st} />
        </div>
        <FicheLibelle>{tr('TEMPÉRATURE · 24 H')}</FicheLibelle>
        <Courbe24 points={ptsTemp} couleur="var(--o-orange)" unite="°" />
      </>)}
    </BottomSheet>
  );
}

/* La fiche d'une LUMIÈRE (chantier Lumières, § 3.5 ; L8) : la coquille. Une
 * feuille sans onglets, sa hauteur suit son contenu. La fiche se charge à la
 * demande (`fichelumiere.jsx`) et n'importe jamais App.jsx : la coquille lui
 * passe la VUE de la lampe — celle de sa carte (`useVueLumiere` : le geste
 * d'abord, la teinte, la phrase, les ordres, le `hass` vivant) —, sa pièce,
 * l'épingle, le glyphe de sa carte, la bascule et la barre de la maison, et
 * l'ouverture de la fiche universelle de l'appareil. */
function FicheLumiere({ id, hass, onClose }) {
  const vue = useVueLumiere(hass, id);
  const [fiche, setFiche] = useState(null);
  return (
    <BottomSheet onClose={onClose}>
      {() => (<>
        <Suspense fallback={<div style={{ minHeight: 260 }} />}>
          <FicheLumiereContent id={id} vue={vue} piece={zoneDe(id)} onFiche={setFiche} bascule={RmBascule} jauge={RmJauge}
            glyphe={<GlypheCarte id={id} size={18}><Fi i="bulb" size={18} /></GlypheCarte>} epingle={<BoutonEpingle id={id} />} />
        </Suspense>
        {fiche && <FicheAppareil id={fiche} hass={vue.hass} onClose={() => setFiche(null)} />}
      </>)}
    </BottomSheet>
  );
}

/* La feuille d'un switch qui n'est PAS une prise (chantier Prises, P1) : la coquille. Une prise ouvre sa fiche (`FichePrise`) ;
 * ici arrivent le poêle, un radiateur, un relais. Le contenu — alimenté, le minuteur, le dernier changement — se charge à la
 * demande (`ficheswitch.jsx`, audit des prises, 19/10) et n'importe jamais App.jsx : la coquille garde la feuille et la frontière
 * Suspense, et lui passe les briques des fiches d'ici (`BRIQUES_SWITCH`). */
const BRIQUES_SWITCH = { FicheEntete, FicheRangee, FicheValeur, FicheBouton, FicheIndispo, RmBascule, RangeeDernier, useSeconde, zoneDe };
function RoomSwitchSheet({ id, hass, onClose }) {
  return (
    <BottomSheet onClose={onClose}>
      {() => (
        <Suspense fallback={<div style={{ minHeight: 180 }} />}>
          <FicheSwitchContent id={id} hass={hass} briques={BRIQUES_SWITCH} />
        </Suspense>
      )}
    </BottomSheet>
  );
}

// Fiche serrure (maquettes du 14/09) : verrouillee, pile, dernier changement.
function RoomLockSheet({ id, hass, onClose }) {
  const S = (hass && hass.states) || {};
  const st = S[id] || null;
  const a = (st && st.attributes) || {};
  const s2 = st ? st.state : null;
  const realLocked = s2 === 'locked';
  const [ov, setOv] = useOptimiste(s2);
  const locked = ov != null ? ov : realLocked;
  const basculer = () => { const nv = !locked; setOv(nv); commanderService(hass, id, 'lock', nv ? 'lock' : 'unlock', { entity_id: id }); };
  const nom = a.friendly_name || id;
  const zone = zoneDe(id);
  /* `enPanne`, comme sa carte (05/10) : morte, la fiche disait bien
   * « Indisponible », mais l'interrupteur restait et envoyait `lock.lock`
   * dans le vide. Et `open` / `opening` — des états VIVANTS — tombaient sur
   * « Indisponible » : ils ont leurs mots, ceux de CvCard. */
  const mort = enPanne(id, st);
  const etat = mort ? tr('Indisponible') : ({ locked: tr('Verrouillée'), unlocked: tr('Déverrouillée'), locking: tr('Verrouillage…'), unlocking: tr('Déverrouillage…'), jammed: tr('Bloquée'), open: tr('Ouverte'), opening: tr('Ouverture…') })[s2] || String(s2);
  return (
    <BottomSheet onClose={onClose}>
      {() => (<>
        <FicheEntete titre={nom} sous={[zone, etat].filter(Boolean).join(' · ')} id={id} />
        <div style={{ marginTop: 14 }}>
          <FicheRangee premiere panne={mort} titre={tr('Verrouillée')} desc={tr('Le pêne bouge tout de suite ; l’état revient du moteur')} droite={mort ? <FicheIndispo /> : <RmBascule on={locked} nom={nom} onToggle={basculer} />} />
          <RangeePile n={pileDe(S, id)} />
          <RangeeDernier st={st} />
        </div>
      </>)}
    </BottomSheet>
  );
}

/** Une entité quelconque, rendue par son domaine — le legо de la fiche.
 * `surEpingle` (fiche seulement) affiche la punaise : épingler remonte la
 * ligne en tête de fiche ET l'invite sur la carte de l'appareil. */
function LigneEntite({ id, hass, nom = null, surEpingle = null, epingle = false }) {
  const st = hass && hass.states ? hass.states[id] : null;
  const a = (st && st.attributes) || {};
  const dom = String(id).split('.')[0];
  const label = nom || (a.friendly_name || id).replace(/^[^:]*: ?/, '');
  const call = (d, s, data) => commanderService(hass, id, d, s, { entity_id: id, ...(data || {}) });
  const mort = !st || st.state === 'unavailable';
  /* Optimisme : l'écran répond au doigt, Home Assistant confirme après.
   * Sans lui, chaque clic attend l'aller-retour Zigbee PUIS le poll — mou.
   * `opt` tient une FENÊTRE FIXE (pas « jusqu'au premier changement d'état ») :
   * Zigbee2MQTT rejoue parfois l'ancienne valeur après la confirmation, et
   * suivre ce rapport retardé faisait clignoter 1 → 2 → 1 à l'écran. */
  const [opt, setOpt] = useState(null);
  // Alarme : le code demandé en place, quand le panneau l'exige.
  const [demandeCode, setDemandeCode] = useState(null);
  const [codeSaisi, setCodeSaisi] = useState('');
  const commitRef = useRef(null);
  const filetRef = useRef(null);
  /* Une consigne qui attend son calme (450 ms) ne meurt ni avec la fiche ni
   * avec l'onglet : ce qui reste a envoyer part au demontage et des que la
   * page se cache (ADR 0066). Fermer la fiche juste apres un « + » perdait
   * la valeur sans un mot. */
  const attenteRef = useRef(null); // envoie la consigne en attente, ou null
  const viderAttente = () => { clearTimeout(commitRef.current); const f = attenteRef.current; attenteRef.current = null; if (f) f(); };
  useEffect(() => {
    const debrancher = brancherVidage(viderAttente);
    return () => { debrancher(); viderAttente(); clearTimeout(filetRef.current); };
  }, []);
  const poserOpt = (v) => { setOpt(v); clearTimeout(filetRef.current); filetRef.current = setTimeout(() => setOpt(null), 4000); };
  /* La ligne d'un switch épinglé — la sortie 2 d'une multiprise, dans la fiche de l'appareil ou sur sa carte (`Epingles`) — passe
   * par la même garde que partout (relecture finale, F3) : une prise allumée et gardée ne se coupe pas d'un appui. Pas de place
   * pour deux boutons sur une ligne, ni de fiche à ouvrir d'ici : deux appuis, comme la compacte sans fiche — le premier pose la
   * question à la place du nom, le second coupe ; Échap, 6 secondes, ou une prise coupée entre-temps la défont. Ordre explicite
   * (`turn_on`, `turn_off`, d'après l'état affiché) : un `toggle` inverse l'état RÉEL. */
  const allume = opt != null ? opt === 'on' : (!!st && st.state === 'on');
  const gs = useGardeSwitch(hass && hass.states, id, dom === 'switch');
  const [demande, setDemande] = useDemandeCoupure(allume);
  const enDemande = gs.garde && allume && demande;
  let controle = null, wrap = false;
  if ((dom === 'switch' || dom === 'input_boolean' || dom === 'siren') && enPanne(id, st)) {
    // Muet — `unavailable` OU `unknown` (`enPanne`, la règle des cartes ; audit du 19/10, point 3) : il se lit, il ne se commande pas.
    controle = <FicheIndispo />;
  } else if (dom === 'switch' || dom === 'input_boolean' || dom === 'siren') {
    const on = allume;
    const basculer = () => {
      const geste = appuiBascule({ on, garde: gs.garde, enDemande });
      if (geste === 'demander') { setDemande(true); return; }
      setDemande(false);
      poserOpt(on ? 'off' : 'on'); call('homeassistant', on ? 'turn_off' : 'turn_on');
    };
    controle = <span role="switch" aria-checked={on} tabIndex={0} aria-label={enDemande ? tr('Couper') + ' ' + label : label} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); basculer(); } }} onClick={basculer} style={{ width: 42, height: 24, borderRadius: 14, background: on ? 'var(--o-accent-fond)' : 'var(--o-bd1)', position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'background .25s' }}><span style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .3s cubic-bezier(.34,1.56,.64,1)' }} /></span>;
  } else if (dom === 'number' || dom === 'input_number') {
    const v = opt != null ? +opt : (st ? parseFloat(st.state) : NaN);
    const pas = a.step != null ? +a.step : 1;
    const borne = (x) => Math.min(a.max != null ? +a.max : Infinity, Math.max(a.min != null ? +a.min : -Infinity, x));
    // Des clics rapprochés ne partent qu'une fois : la valeur bouge à l'écran,
    // l'appel de service attend 450 ms de calme — comme les sliders au pointerup.
    const poser = (x) => {
      const nv = Math.round(borne(x) * 100) / 100;
      poserOpt(nv);
      clearTimeout(commitRef.current);
      attenteRef.current = () => call(dom, 'set_value', { value: nv });
      commitRef.current = setTimeout(viderAttente, 450);
    };
    const btn = { width: 30, height: 30, borderRadius: 10, border: LISERE, background: 'var(--o-s1)', color: 'var(--o-text)', fontWeight: 800, fontSize: 15, cursor: 'pointer', flexShrink: 0 };
    controle = (<>
      <button style={btn} aria-label={'− ' + label} onClick={() => !isNaN(v) && poser(v - pas)}>−</button>
      <span style={{ minWidth: 44, textAlign: 'center', fontSize: 13, fontWeight: 800, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{isNaN(v) ? '—' : decMax(v, 2)}{a.unit_of_measurement ? ' ' + a.unit_of_measurement : ''}</span>
      <button style={btn} aria-label={'+ ' + label} onClick={() => !isNaN(v) && poser(v + pas)}>+</button>
    </>);
  } else if (dom === 'select' || dom === 'input_select') {
    const opts = Array.isArray(a.options) ? a.options : [];
    const cur = opt != null ? opt : (st ? st.state : null);
    wrap = true;
    controle = (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '70%' }}>
        {opts.slice(0, 8).map(o => { const on = cur === o; return (
          <button key={o} onClick={() => { poserOpt(o); call(dom, 'select_option', { option: o }); }} aria-pressed={on}
            style={{ padding: '5px 11px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 700, border: '1px solid ' + (on ? 'transparent' : 'var(--o-bd1)'), background: on ? 'var(--o-accent-fond)' : 'var(--o-s2)', color: on ? '#fff' : 'var(--o-text1)' }}>{o}</button>
        ); })}
      </div>
    );
  } else if (dom === 'alarm_control_panel') {
    /* Alarme : les trois gestes, et le code quand le panneau l'exige — sans
     * quoi Home Assistant refuse la commande sans un mot. */
    const cur = opt != null ? opt : (st ? st.state : null);
    const codeF = !!a.code_format;
    const modes = armChips(a, cur); // ceux que le panneau offre vraiment
    const etatApres = { alarm_disarm: 'disarmed', alarm_arm_home: 'armed_home', alarm_arm_away: 'armed_away', alarm_arm_night: 'armed_night', alarm_arm_vacation: 'armed_vacation' };
    const agir = (svc) => {
      const faut = svc === 'alarm_disarm' ? codeF : (codeF && a.code_arm_required !== false);
      if (faut) { setDemandeCode({ svc }); setCodeSaisi(''); return; }
      poserOpt(etatApres[svc]); call('alarm_control_panel', svc);
    };
    const valider = () => { if (!codeSaisi) return; poserOpt(etatApres[demandeCode.svc]); call('alarm_control_panel', demandeCode.svc, { code: codeSaisi }); setDemandeCode(null); setCodeSaisi(''); };
    wrap = true;
    controle = demandeCode ? (
      <SaisieCodeAlarme code={codeSaisi} setCode={setCodeSaisi} onValider={valider} onAnnuler={() => setDemandeCode(null)} serre
        style={{ flex: 1, minWidth: 0, justifyContent: 'flex-end' }} />
    ) : (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {modes.map(([lab, svc, actif]) => (
          <button key={svc} onClick={() => agir(svc)} aria-pressed={actif}
            style={{ padding: '5px 11px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700, border: 'none', background: actif ? 'var(--o-accent-fond)' : 'var(--o-s1)', color: actif ? '#fff' : 'var(--o-text1)' }}>{lab}</button>
        ))}
      </div>
    );
  } else if (dom === 'button' || dom === 'input_button' || dom === 'scene' || dom === 'script') {
    const svc = dom === 'scene' || dom === 'script' ? [dom, 'turn_on'] : [dom, 'press'];
    controle = <button onClick={() => call(svc[0], svc[1])} style={{ padding: '7px 13px', borderRadius: 10, background: 'rgba(var(--o-accent-rgb),.14)', border: 'none', color: 'var(--o-accent-soft)', fontWeight: 700, fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>{tr('Exécuter')}</button>;
  } else if (dom === 'binary_sensor') {
    const on = !!st && st.state === 'on';
    const grave = ['smoke', 'gas', 'moisture', 'problem', 'safety', 'carbon_monoxide'].indexOf(a.device_class) >= 0;
    controle = <span style={{ fontSize: 12, fontWeight: 800, color: on ? (grave ? 'var(--o-bad)' : 'var(--o-warn)') : 'var(--o-text3)' }}>{on ? tr('Détecté') : tr('RAS')}</span>;
  } else {
    // sensor et le reste : la valeur, lisible. Une valeur VIDE ou inconnue ne
    // mérite pas sa ligne — le vide n'informe personne.
    const brut = st ? st.state : null;
    if (brut === '' || brut === 'unknown' || brut == null) return null;
    const n = parseFloat(brut);
    // Une date, une heure : `texteDate` (05/10, suite « dates partout »). Seul
    // l'ISO à T passait par `relTime` : une date seule s'écrivait « 2 026 »,
    // une heure « 07:30 » un « 7 ».
    const rel = texteDate(st);
    const bat = a.device_class === 'battery' && !isNaN(n);
    controle = (
      <span style={{ fontSize: 13, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: bat ? couleurPile(n, 'var(--o-text)') : 'var(--o-text)' }}>
        {mort ? '—' : rel || (isNaN(n) ? String(brut) : decMax(n, 2))}{!rel && a.unit_of_measurement ? ' ' + a.unit_of_measurement : ''}
      </span>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderTop: 'var(--o-bw,1px) solid var(--o-bd3)', opacity: mort ? .5 : 1, flexWrap: wrap ? 'wrap' : 'nowrap' }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{enDemande ? tr('Couper la prise ?') : label}</span>
      {controle}
      {surEpingle && (
        <button onClick={() => surEpingle(id)} title={epingle ? tr('Désépingler') : tr('Épingler sur la carte')} aria-pressed={epingle}
          style={{ width: 26, height: 26, borderRadius: 10, flexShrink: 0, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: epingle ? 'rgba(var(--o-accent-rgb),.18)' : 'transparent', color: epingle ? 'var(--o-accent-soft)' : 'var(--o-text3)', opacity: epingle ? 1 : .55 }}>
          <Fi i="thumbtack" size={12} />
        </button>
      )}
    </div>
  );
}
/* La punaise des FICHES DE DOMAINE (lumière, volet, climat, média, capteur) :
 * épingle l'entité de la fiche — favoris de l'accueil et carte de l'appareil.
 * La fiche appareil universelle a la sienne, ligne par ligne. */
function BoutonEpingle({ id }) {
  const [eps, setEps] = useState(lireEpingles);
  // Un favori peut être une chaîne (carte compacte) ou une entrée typée
  // {t, id} depuis que la section s'édite : on compare donc l'ENTITÉ.
  const on = eps.some(x => cvId(x) === id);
  const tap = () => setEps(basculerEpingle(id));
  return (
    <button onClick={tap} title={on ? tr('Désépingler') : tr('Épingler sur la carte')} aria-pressed={on}
      style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: on ? 'rgba(var(--o-accent-rgb),.18)' : 'var(--o-s1)', color: on ? 'var(--o-accent-soft)' : 'var(--o-text3)' }}>
      <Fi i="thumbtack" size={13} />
    </button>
  );
}
function Epingles({ pourId, hass, max = 3, avecAncre = false }) {
  const { index } = useLoggia();
  const S = (hass && hass.states) || {};
  const eps = lireEpingles();
  if (!eps.length || !index || !index.entityMeta) return null;
  const meta = index.entityMeta.get(pourId);
  const devId = meta && meta.deviceId;
  if (!devId) return null;
  // `avecAncre` : les cartes machines (Objets) ont une ancre arbitraire — elle
  // aussi peut être épinglée ; une CvCard, elle, montre déjà son entité.
  const liste = eps.filter(eid => (avecAncre || eid !== pourId) && (index.entityMeta.get(eid) || {}).deviceId === devId && S[eid]).slice(0, max);
  if (!liste.length) return null;
  // La carte parente s'ouvre au clic : les épingles agissent SANS ouvrir.
  return (
    <div role="presentation" onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()} style={{ marginTop: 10 }}>
      {liste.map(eid => <LigneEntite key={eid} id={eid} hass={hass} nom={(index.entityMeta.get(eid) || {}).name || undefined} />)}
    </div>
  );
}

/* Héros MACHINE de la fiche appareil : le rendu de la fiche native — l'état en
 * grand centré, le « il y a … », la batterie, l'illustration au centre, les
 * boutons ronds et la vitesse centrés. Réservé à la FICHE : les cartes des
 * vues gardent leur gabarit maison. */
/* Cadran a graduations.
 *
 * Un arc epais dit « combien » ; une couronne de traits dit « combien » ET
 * donne une echelle a lire — c'est la difference entre une barre et un
 * instrument. Les traits franchis prennent la couleur, les autres restent en
 * creux, et une pastille marque le point atteint.
 *
 * 72 traits : assez pour que la couronne se lise comme continue, assez peu
 * pour qu'un trait vaille un cran visible (5 %).
 */
function CadranGradue({ pct, valeur, unite, couleur, taille = 126, traits = 60 }) {
  const p = Math.max(0, Math.min(1, pct || 0));
  const C = taille / 2, RE = C - 4, RI = RE - 15;
  const actifs = Math.round(traits * p);
  const ang = (i) => (i / traits) * 2 * Math.PI - Math.PI / 2;   // depart a midi
  return (
    <div style={{ position: 'relative', width: taille, height: taille, flexShrink: 0 }}>
      <svg width={taille} height={taille} aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
        {Array.from({ length: traits }, (_, i) => {
          const t = ang(i), on = i < actifs;
          return <line key={i} x1={C + RI * Math.cos(t)} y1={C + RI * Math.sin(t)}
            x2={C + RE * Math.cos(t)} y2={C + RE * Math.sin(t)}
            stroke={on ? couleur : 'var(--o-bd1)'} strokeWidth="2.4" strokeLinecap="round"
            style={{ transition: 'stroke .35s' }} />;
        })}
        {/* La pastille : elle dit ou on en est sans compter les traits. */}
        {p > 0 && (() => { const t = ang(actifs - 1), r = (RE + RI) / 2;
          return <circle cx={C + r * Math.cos(t)} cy={C + r * Math.sin(t)} r="6"
            fill={couleur} stroke="var(--o-s2, var(--o-bg2))" strokeWidth="3" />; })()}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0 }}>
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1 }}>{valeur}</div>
        {unite && <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text1)', opacity: .85, marginTop: 3 }}>{unite}</div>}
      </div>
    </div>
  );
}

/* Les mots des commandes d'un robot dans la fiche universelle (« L'appareil ») : les siens, plus longs que ceux des puces de la carte ;
 * « Pause », « Reprendre » et « Localiser » sont déjà les mots des puces (`commandesRobot`). */
const MOTS_FICHE_ROBOT = { demarrer: (d) => (d === 'vacuum' ? tr('Démarrer le nettoyage') : tr('Lancer la tonte')), base: () => tr('Renvoyer au dock') };
/* La fiche universelle d'un robot (« L'appareil », dans les réglages de sa popup). Ses gestes passent par la VUE de la carte
 * (`useVueRobot` ; passe bis 2 du 18/10, point B) : le geste partagé, « Démarrer » par le serveur et sa garde, ses refus — deux appuis
 * rapprochés y relançaient le robot, et plus aucun service de départ ne part d'ici en direct. « Stop » et « Localiser » restent les
 * siens. La batterie se lit comme ailleurs (`batterieRobot` : de 0 à 100, vide = inconnue), et un robot muet ne la montre pas. */
function FicheMachineHero({ id, hass }) {
  const vr = useVueRobot(hass, id);
  const st = vr.st;
  const a = (st && st.attributes) || {};
  const dom = vr.domaine;
  const s = st ? st.state : null;
  const mort = vr.panne;
  const en = dom === 'vacuum' ? s === 'cleaning' : s === 'mowing';
  const f = a.supported_features || 0;
  const bat = mort ? null : vr.batterie;
  const etat = ({ docked: tr('Sur la base'), cleaning: tr('Nettoyage'), mowing: tr('Tonte'), returning: tr('Retour à la base'), paused: tr('En pause'), idle: tr('Inactif'), error: tr('Erreur') })[s] || (s == null ? '—' : String(s));
  // Les puces de la carte, chacune son geste (`agir`) ; un geste en vol garde la sienne, choisie, et ne fait rien.
  const btns = vr.cmd.map(p => ({ cle: p.cle, gi: p.glyphe, lbl: MOTS_FICHE_ROBOT[p.cle] ? MOTS_FICHE_ROBOT[p.cle](dom) : p.mot, agir: p.agir, enVol: !!p.enVol, choisie: !!p.choisie }));
  if (dom === 'vacuum' && (f & 8) && (s === 'cleaning' || s === 'returning' || s === 'paused')) {
    btns.splice(Math.min(1, btns.length), 0, { cle: 'stop', gi: 'stop', lbl: tr('Stop'), agir: () => { commanderService(vr.hass, id, dom, 'stop', { entity_id: id }); apresCommandeRobot(); } });
  }
  if (dom === 'vacuum' && (f & 512) && !btns.some(b => b.cle === 'localiser')) btns.push({ cle: 'localiser', gi: 'marker', lbl: tr('Localiser'), agir: () => localiserRobot(vr.hass, id, dom) });
  /* La couleur dit l'etat, pas le niveau : un robot qui travaille est vert
   * meme a 30 %, une batterie a plat est rouge meme sur la base. */
  const colDial = mort ? 'var(--o-text3)'
    : s === 'error' ? 'var(--o-bad)'
      : (bat != null && bat < 20) ? 'var(--o-bad)'
        : en ? 'var(--o-ok)'
          : s === 'returning' ? 'var(--o-warn)'
            : 'var(--o-accent-soft)';
  const vitesses = (dom === 'vacuum' && Array.isArray(a.fan_speed_list)) ? a.fan_speed_list : [];
  return (
    <div className={mort ? 'o-panne' : undefined} style={{ ...CV_CADRE, opacity: mort ? .55 : 1 }}>
      {/* L'objet a gauche, sa mesure a droite : on reconnait l'appareil avant
        * de lire son chiffre, comme sur une etagere. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
        <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div aria-hidden="true" style={{ width: 140, height: 140, backgroundImage: `url("${dom === 'vacuum' ? DEVICE_ART.vacuum : DEVICE_ART.mower}")`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', opacity: mort ? .4 : 1 }} />
          <div style={{ textAlign: 'center', minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.01em', lineHeight: 1.15 }}>{mort ? tr('Indisponible') : etat}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text2)', marginTop: 2 }}>{relTime(st && (st.last_changed || st.last_updated)) || '—'}</div>
          </div>
        </div>
        {bat != null && (
          <CadranGradue pct={bat / 100} valeur={Math.round(bat)} unite={tr('Batterie')} couleur={colDial} />
        )}
      </div>
      {btns.length > 0 && !mort && (
        <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'center' }}>
          {btns.map((b, bi) => {
            const plein = bi === 0 || b.choisie;
            return (
              <button key={b.cle} type="button" title={b.lbl} aria-label={b.lbl} aria-disabled={b.enVol ? 'true' : undefined} onClick={() => b.agir()}
                style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0, border: plein ? 'none' : 'var(--o-bw,1px) solid var(--o-bd2)', background: plein ? 'var(--o-accent-fond)' : 'var(--o-s1)', color: plein ? '#fff' : 'var(--o-text1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}><Fi i={b.gi} size={15} /></button>
            );
          })}
        </div>
      )}
      {/* La vitesse en rangee, pas en menu : quatre crans qui se COMPARENT —
        * la hauteur des barres dit lequel souffle plus fort, ce qu'un menu
        * deroulant ne montre qu'un a la fois. */}
      {vitesses.length > 1 && !mort && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', color: 'var(--o-text1)', opacity: .78, marginBottom: 7 }}>{tr('VITESSE')}</div>
          <div style={{ display: 'flex', gap: 7 }}>
            {vitesses.map((v, vi) => {
              const on = v === a.fan_speed;
              return (
                <button key={v} onClick={() => { commander(hass, id, 'set_fan_speed', v); }}
                  aria-pressed={on} style={{ flex: 1, minWidth: 0, padding: '9px 4px 8px', borderRadius: 14, cursor: 'pointer',
                    border: on ? 'none' : 'var(--o-bw,1px) solid var(--o-bd2)', background: on ? 'var(--o-accent-fond)' : 'var(--o-s1)',
                    color: on ? '#fff' : 'var(--o-text1)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, transition: 'background .2s' }}>
                  <span aria-hidden="true" style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 15 }}>
                    {[0, 1, 2, 3].map(k => (
                      <span key={k} style={{ width: 3, borderRadius: 2, height: 5 + k * 3.2,
                        background: 'currentColor', opacity: k <= vi ? 1 : .22 }} />
                    ))}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{FAN_FR()[v] || v}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* La fiche d'un robot — aspirateur ou tondeuse — dans une feuille, comme les
 * autres appareils (ajustement de l'ADR 0042, 18/09) : le meme rendu sur PC,
 * tablette et telephone. Le contenu (onglets, planning, entretien, reglages)
 * est charge a la demande, DANS une frontiere Suspense — sans elle, un clic
 * finissait dans l'ecran d'erreur. La fiche vit a son rythme : le poll de la
 * vue derriere ne connait pas les entites soeurs du robot, et sans cet
 * abonnement une jauge ou une bascule resterait figee. */
function FicheRobot({ id, hass, onClose }) {
  const domaine = String(id).split('.')[0];
  const hassLive = useHass([id, ...siblingsOf(LOGGIA_INDEX, id)]);
  const H = hassLive || hass;
  /* La VUE de la carte (chantier IoT, I15) : la phase et l'avance d'un geste, la phrase, les puces, la batterie, « Il bipe », le
   * carnet du serveur — relu toutes les 15 s tant que la fiche est ouverte. La plaque et « {pièce} · robot aspirateur » viennent
   * d'ici aussi : la carte et la fiche se ressemblent. */
  const vue = useVueRobot(H, id, null, true, { rapide: true });
  const [fond, encre] = plaqueRobot(vue);
  const plaque = { fond, encre, glyphe: <GlypheCarte id={id} size={18}><Ico name={domaine === 'vacuum' ? 'vacuum' : 'mower'} size={18} /></GlypheCarte> };
  // « Salon · robot aspirateur » ; sans zone, le genre seul, une majuscule devant — « Robot aspirateur », comme « Distributeur » (passe bis du 18/10, point 17).
  const genre = domaine === 'lawn_mower' ? tr('robot tondeuse') : tr('robot aspirateur');
  const zone = zoneDe(id);
  const sousNom = zone ? zone + ' · ' + genre : genre.charAt(0).toLocaleUpperCase(locale()) + genre.slice(1);
  // La fiche universelle (Stop, Localiser, toutes les entites) s'ouvre
  // par-dessus, depuis les reglages du robot.
  const [fiche, setFiche] = useState(null);
  return (
    <BottomSheet onClose={onClose} onglets>
      {() => (<>
        <Suspense fallback={<div style={{ minHeight: 260 }} />}>
          <FicheRobotContent hass={H} idRobot={id} domaine={domaine} vue={vue} plaque={plaque} sousNom={sousNom} onFiche={setFiche} epingle={<BoutonEpingle id={id} />} />
        </Suspense>
        {fiche && <FicheAppareil id={fiche} hass={H} onClose={() => setFiche(null)} />}
      </>)}
    </BottomSheet>
  );
}

function FicheAppareil({ id, hass, onClose }) {
  const { index } = useLoggia();
  const dc = useDomainCards(hass);
  const [diagOuvert, setDiagOuvert] = useState(false);
  // Épingles : état local pour un retour visuel immédiat, cfgSet pour la maison.
  const [eps, setEps] = useState(lireEpingles);
  const basculer = (eid) => setEps(basculerEpingle(eid));
  const S = (hass && hass.states) || {};
  const meta = index && index.entityMeta ? index.entityMeta.get(id) : null;
  const devId = meta && meta.deviceId;
  // Toutes les entités vivantes du même appareil ; sans registre, l'entité seule.
  const soeurs = [];
  if (devId && index && index.entityMeta) {
    index.entityMeta.forEach((m, eid) => {
      if (m.deviceId === devId && S[eid] && !m.hidden && !m.disabled && eid.indexOf('update.') !== 0 && eid.indexOf('device_tracker.') !== 0) soeurs.push({ id: eid, m });
    });
  }
  if (!soeurs.length) soeurs.push({ id, m: meta || {} });
  // La fiche vit à son rythme : le poll de la vue derrière ne connaît pas ces
  // entités-là — sans cet abonnement, un stepper resterait figé après le clic.
  const hassLive = useHass(soeurs.map(x => x.id));
  const H = hassLive || hass;
  const domDe = (e) => String(e).split('.')[0];
  const nomCourt = (x) => (x.m && x.m.name) || ((S[x.id] && S[x.id].attributes && S[x.id].attributes.friendly_name) || x.id);
  const nomApp = (meta && meta.device) || cvName(S[id], id);
  const dm = devId && index && index.deviceMeta ? index.deviceMeta.get(devId) : null;
  // Les pilotables en tête — l'entité tapée d'abord ; le reste par catégorie du registre.
  // Un capteur DATÉ tapé arrive ici, pas sur la fiche 24 h (05/10, suite
  // « dates partout ») : il prend la tête, en tuile, comme un pilotable —
  // sans quoi sa date dormait dans une section repliée, ou parmi les
  // diagnostics (« dernier démarrage »).
  const pilotables = soeurs.filter(x => (FICHE_PILOTABLES.indexOf(domDe(x.id)) >= 0 && !x.m.category) || (x.id === id && domDe(id) === 'sensor'))
    .sort((a, b) => (a.id === id ? -1 : 0) - (b.id === id ? -1 : 0));
  const restantes = soeurs.filter(x => pilotables.indexOf(x) < 0);
  // Les épinglées quittent leur section : elles vivent en tête, pas en double.
  /* La lecture compare l'ENTITÉ, comme l'écriture le faisait déjà. Avec
   * `indexOf`, une épingle au format `{t, id}` ne se reconnaissait pas : la
   * ligne s'affichait « non épinglée », et le clic pour l'épingler la
   * RETIRAIT — `basculer`, lui, la trouvait. */
  const estEpinglee = (eid) => eps.some(x => cvId(x) === eid);
  const epinglees = restantes.filter(x => estEpinglee(x.id));
  const libres = restantes.filter(x => !estEpinglee(x.id));
  const principal = libres.filter(x => !x.m.category);
  const config = libres.filter(x => x.m.category === 'config');
  const diag = libres.filter(x => x.m.category === 'diagnostic');
  const triNom = (a, b) => comparerTextes(String(nomCourt(a)), String(nomCourt(b)));
  // Chaque section se replie d'un tap sur son titre. REPLIÉES par défaut :
  // la fiche s'ouvre sur l'essentiel (état, actions, épingles), le détail se
  // déplie à la demande. Les épingles, choisies par le foyer, restent visibles.
  const [replies, setReplies] = useState({});
  const section = (titre2, liste, defOuvert = false) => {
    if (!liste.length) return false;
    const ouvert = replies[titre2] != null ? replies[titre2] : defOuvert;
    return (
      <>
        <button onClick={() => setReplies(r => ({ ...r, [titre2]: !ouvert }))} aria-expanded={ouvert}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', padding: 0, margin: '16px 0 2px', cursor: 'pointer' }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: 'var(--o-text3)' }}>{titre2 + (ouvert ? '' : ' · ' + liste.length)}</span>
          <Fi i={ouvert ? 'angle-up' : 'angle-down'} size={11} color="var(--o-text3)" />
        </button>
        {ouvert && liste.sort(triNom).map(x => <LigneEntite key={x.id} id={x.id} hass={H} nom={nomCourt(x)} surEpingle={basculer} epingle={estEpinglee(x.id)} />)}
      </>
    );
  };
  return (
    <BottomSheet onClose={onClose}>
      {() => (<>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <NomFeuille><div style={{ fontSize: 19, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nomApp}</div></NomFeuille>
            {dm && (dm.manufacturer || dm.model) && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[dm.manufacturer, dm.model].filter(Boolean).join(' · ')}</div>}
          </div>
          {/* Épingler l'entité TAPÉE : elle vit en carte de tête, hors des
            * lignes — sans ce bouton, l'entité principale était inépinglable. */}
          <BoutonEpingle id={id} />
          <CroixFeuille />
        </div>
        {pilotables.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
            {/* Alarme : la carte à trois modes (et le code si le panneau
              * l'exige) — la compacte ne porte que le geste rapide. */}
            {pilotables.slice(0, 3).map(x => (domDe(x.id) === 'vacuum' || domDe(x.id) === 'lawn_mower')
              ? <FicheMachineHero key={x.id} id={x.id} hass={H} />
              : domDe(x.id) === 'alarm_control_panel'
                ? <CvAlarm key={x.id} id={x.id} hass={H} sans />
                : <CvCard key={x.id} id={x.id} hass={H} onOpen={x.id !== id ? dc.ouvrir : null} />)}
          </div>
        )}
        {section(tr('ÉPINGLES'), epinglees, true)}
        {section(tr('COMMANDES'), principal)}
        {section(tr('RÉGLAGES'), config)}
        {diag.length > 0 && (
          <>
            <button onClick={() => setDiagOuvert(o => !o)} style={{ marginTop: 16, padding: '8px 13px', borderRadius: 10, background: 'var(--o-s2)', border: 'var(--o-bw,1px) solid var(--o-bd3)', color: 'var(--o-text2)', fontWeight: 700, fontSize: 12, cursor: 'pointer', alignSelf: 'flex-start' }}>
              {(diagOuvert ? tr('Masquer') : tr('Afficher')) + ' ' + tr('{n} diagnostics', { n: diag.length })}
            </button>
            {diagOuvert && diag.sort(triNom).map(x => <LigneEntite key={x.id} id={x.id} hass={H} nom={nomCourt(x)} surEpingle={basculer} />)}
          </>
        )}
        {dc.sheets}
      </>)}
    </BottomSheet>
  );
}

/* ── Historique 24 h ─────────────────────────────────────────────────────────
 * Le GET history/period, partagé entre la carte graphique et les fiches.
 * `attribut` : pour un climat, la température vécue est un ATTRIBUT
 * (current_temperature) — la requête part alors sans minimal_response ni
 * no_attributes, plus lourde, réservée à une fiche ouverte. */
/* Cache module : plusieurs cartes demandent le même historique (les pièces de
 * l'accueil, une fiche rouverte) — cinq minutes de mémoire évitent de refaire
 * le même GET à chaque navigation. */
const HISTO_CACHE = new Map();
/* La SEULE porte d'écriture, et elle purge (lot 15 de l'audit du 03/10).
 * Aucune lecture ne sert une série de plus de cinq minutes, mais la Map la
 * gardait jusqu'au rechargement : une tablette allumée des jours y entassait
 * toutes les entités jamais ouvertes. La série « montrée » qu'un GET raté
 * garde une demi-heure vit dans l'effet (`montree`), pas ici. */
const HISTO_FRAIS_MS = 5 * 60000;
function histoRanger(cle, entree, maintenant = Date.now()) {
  for (const [k, e] of HISTO_CACHE) if (maintenant - e.t >= HISTO_FRAIS_MS) HISTO_CACHE.delete(k);
  HISTO_CACHE.set(cle, entree);
}
function useHistorique24(hass, id, attribut = null) {
  const cle = id ? id + '|' + (attribut || '') : null;
  const enCache = cle && HISTO_CACHE.get(cle);
  const [points, setPoints] = useState(enCache && Date.now() - enCache.t < HISTO_FRAIS_MS ? enCache.serie : null);
  const api = hass && hass.callApi ? 1 : 0;
  useEffect(() => {
    if (!api || !id) return;
    let mort = false;
    const frais = HISTO_CACHE.get(cle);
    const recent = !!frais && Date.now() - frais.t < HISTO_FRAIS_MS;
    if (recent) setPoints(frais.serie);
    /* La dernière série MONTRÉE pour cette entité, et l'heure où elle a été lue
     * (audit du 03/10). Un GET raté la garde : HA qui redémarre ou un Wi-Fi qui
     * saute changeaient la courbe en « Historique indisponible » jusqu'au
     * sondage suivant, cinq minutes plus tard, alors que la série d'avant
     * disait encore la journée. Une demi-heure au plus : au-delà, elle ne dit
     * plus « les dernières 24 h », et l'erreur se dit. Sans série déjà montrée
     * — une fiche ouverte pendant la panne —, l'erreur se dit aussi : une série
     * du cache vieille d'une heure passerait pour la journée. */
    let montree = recent ? frais : null;
    const lire = () => {
      const debut = new Date(Date.now() - 24 * 3600e3).toISOString();
      const q = 'history/period/' + debut + '?filter_entity_id=' + encodeURIComponent(id) + (attribut ? '' : '&minimal_response&no_attributes');
      hass.callApi('GET', q)
        .then(r => {
          if (mort) return;
          const brut = Array.isArray(r) && r[0] ? r[0] : [];
          const serie = brut
            .map(p => ({ t: new Date(p.last_changed || p.last_updated || 0).getTime(), v: parseFloat(attribut ? (p.attributes ? p.attributes[attribut] : NaN) : p.state) }))
            .filter(p => !isNaN(p.v));
          const lue = { t: Date.now(), serie };
          histoRanger(cle, lue);
          montree = lue;
          setPoints(serie);
        }).catch(() => { if (!mort) setPoints(montree && Date.now() - montree.t < 30 * 60000 ? montree.serie : 'erreur'); });
    };
    if (!recent) lire();
    const iv = setInterval(lire, 5 * 60000);
    return () => { mort = true; clearInterval(iv); };
  }, [api, id, attribut]);
  return points;
}

/* La courbe d'une fiche : le filigrane de la carte graphique, en plus grand,
 * avec ses bornes et son axe du temps. */
function Courbe24({ points, couleur = 'var(--o-accent)', unite = '' }) {
  let chemin = '', aire = '', vmin = null, vmax = null;
  if (Array.isArray(points) && points.length > 1) {
    const t0 = points[0].t, t1 = points[points.length - 1].t || t0 + 1;
    vmin = Math.min(...points.map(p => p.v)); vmax = Math.max(...points.map(p => p.v));
    const plat = vmax === vmin; // une valeur constante se trace au milieu, pas collée en bas
    const spread = (vmax - vmin) || 1;
    const X = (t) => ((t - t0) / (t1 - t0 || 1)) * 100;
    const Y = (v) => plat ? 21 : 36 - ((v - vmin) / spread) * 30;
    chemin = points.map((p, i) => (i ? 'L' : 'M') + X(p.t).toFixed(1) + ' ' + Y(p.v).toFixed(1)).join(' ');
    aire = chemin + ' L 100 40 L 0 40 Z';
  }
  const fmt = (x) => decMax(x, 1);
  return (
    <div>
      <div style={{ position: 'relative', height: 110, borderRadius: 14, background: 'var(--o-s1)', overflow: 'hidden' }}>
        {chemin ? (
          <svg viewBox="0 0 100 40" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            <path d={aire} fill={hx(couleur, .12)} />
            <path d={chemin} fill="none" stroke={couleur} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
          </svg>
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: 'var(--o-text3)' }}>
            {points === null ? tr('Chargement…') : points === 'erreur' ? tr('Historique indisponible pour le moment') : tr("Pas d'historique sur 24 h")}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 7, fontSize: 11, fontWeight: 600, color: 'var(--o-text3)' }}>
        <span>{tr('il y a 24 h')}</span>
        {vmin != null && <span style={{ fontWeight: 700, color: 'var(--o-text2)' }}>{tr('min {a} · max {b}', { a: fmt(vmin) + unite, b: fmt(vmax) + unite })}</span>}
        <span>{tr('maintenant')}</span>
      </div>
    </div>
  );
}

/* Les fiches d'un CAPTEUR (chantier Capteurs, plan 1 ; C12), chargées à la
 * demande (`fichecapteur.jsx`). Elles n'importent jamais App.jsx : les
 * coquilles leur passent les briques des fiches d'ici (`BRIQUES_CAPTEUR`) —
 * les mots d'un capteur binaire par une fonction, appelés au rendu dans la
 * langue du moment.
 *
 * La fiche d'une MESURE (§ 4) : la coquille porte la feuille — sans onglets, sa
 * hauteur suit son contenu — et passe à la fiche la VUE de sa carte
 * (`useVueMesure` : le `hass` vivant, la zone, la phrase, le chiffre, la barre),
 * sa pièce, l'épingle, le glyphe de sa carte et l'ouverture de la fiche
 * universelle de l'appareil. Tout capteur qui n'est pas daté l'ouvre (`ouvrir`).
 * La fiche d'un capteur binaire a la même coquille (correction bis, point 3) : la
 * feuille ici, la frontière Suspense dedans — un morceau introuvable se dit dans la
 * feuille, jamais à la place de la vue Objets ; le repli tient 260 px. */
// Ce que les deux fiches lisent d'ici : l'histoire de 24 h d'une mesure, les mots d'un binaire, sa pile, les entités de son appareil.
/* `jugement` : ce que le réglage « Ne pas juger cette mesure » lit (D5) — possible (une famille de la table, dans une pièce du dedans),
 * réservé à qui configure la maison, et l'état en vigueur (la devinette, ou la correction). */
const BRIQUES_CAPTEUR = { useHistorique24, soeursDe, etatsBinaires: () => BIN_ETATS(), pileDe,
  jugement: (H, id, cle) => ({ possible: !!cle && !dehorsDe(cle, id) && !horsPiece(cle, id), reglable: !compteOrdinaire(H), nonJugee: nonJugee((H && H.states) || {}, id, cle) }) };
function FicheCapteur({ id, hass, onClose }) {
  const vue = useVueMesure(hass, id);
  const [fiche, setFiche] = useState(null);
  return (
    <BottomSheet onClose={onClose}>
      {() => (<>
        <Suspense fallback={<div style={{ minHeight: 260 }} />}>
          <FicheCapteurContent id={id} vue={vue} piece={zoneDe(id)} onFiche={setFiche} briques={BRIQUES_CAPTEUR}
            glyphe={<GlypheCarte id={id} size={18}><Ico name={cvIcoEntite('sensor', id, vue.st, vue.nom)} size={18} /></GlypheCarte>} epingle={<BoutonEpingle id={id} />} />
        </Suspense>
        {fiche && <FicheAppareil id={fiche} hass={vue.hass} onClose={() => setFiche(null)} />}
      </>)}
    </BottomSheet>
  );
}
/* La coquille d'un capteur binaire (C26, § 5.2) : le `hass` VIVANT de son capteur, sa pièce et sa famille, l'épingle, le glyphe de
 * sa carte, et L'appareil — la fiche universelle, par-dessus. */
function FicheBinaire({ id, hass, onClose }) {
  const H = hassQuiConnait(useHass([id]), hass, id);
  const st = (H && H.states && H.states[id]) || null;
  const classe = ((st && st.attributes) || {}).device_class;
  const [fiche, setFiche] = useState(null);
  return (
    <BottomSheet onClose={onClose}>
      {() => (<>
        <Suspense fallback={<div style={{ minHeight: 260 }} />}>
          <FicheBinaireContent id={id} hass={H} briques={BRIQUES_CAPTEUR} piece={zoneDe(id)} famille={FAMILLES_BINAIRES()[classe] || null} onFiche={setFiche}
            glyphe={<GlypheCarte id={id} size={18}><Ico name={cvIcoEntite('binary_sensor', id, st, cvName(st, id))} size={18} /></GlypheCarte>} epingle={<BoutonEpingle id={id} />} />
        </Suspense>
        {fiche && <FicheAppareil id={fiche} hass={H} onClose={() => setFiche(null)} />}
      </>)}
    </BottomSheet>
  );
}
/* La popup d'un groupe (C27) : une feuille sans onglets, à la hauteur de son contenu ; le contenu se charge à la demande, DANS
 * la feuille (le patron de `FicheMedia`). La coquille lui passe le `hass` vivant de ses membres et du soleil, leurs noms et
 * leurs pièces, et les briques d'ici ; une rangée ouvre la fiche de son binaire, par-dessus. */
const BRIQUES_GROUPE = { etatsBinaires: () => BIN_ETATS(), pileDe, soeursDe, Dessin: IlluOuvrant };
function FicheGroupe({ groupe, hass, onClose }) {
  // Piles (C32) : la liste de piles.js, et une rangée ouvre la fiche de l'APPAREIL ; un groupe de binaires, la fiche de son binaire.
  const piles = groupe === 'piles';
  const membres = piles ? pilesDeLaMaisonCarte((hass && hass.states) || {}).map(p => p.id) : membresDeLaMaison((hass && hass.states) || {})[groupe] || [];
  const H = hassQuiConnait(useHass([...membres, 'sun.sun']), hass, membres[0]);
  const S = (H && H.states) || {};
  const ctx = ctxCapteurs();
  // Présence : le JOURNAL sur 24 h, la source de sa carte (M19) — à 00:30, l'historique depuis minuit ne disait plus la même chose.
  const derniers = useDerniersEvenements(H, groupe === 'presence' ? membres : [], reduireDerniers);
  const [membre, setMembre] = useState(null);
  return (
    <BottomSheet onClose={onClose}>
      {() => (<>
        <Suspense fallback={<div style={{ minHeight: 260 }} />}>
          <FicheGroupeContent groupe={groupe} nom={NOMS_GROUPES()[groupe]} ids={membres} hass={H} noms={nomsMembres(membres, S, ctx)} pieces={new Map(membres.map(id => [id, ctx.piece(id)]))}
            briques={BRIQUES_GROUPE} onMembre={setMembre} piles={piles ? pilesDeLaMaisonCarte(S) : null} derniers={derniers} ctx={ctx} />
        </Suspense>
        {/* Un monoxyde en ppm (ADR 0251) est une MESURE : sa fiche est celle d'une mesure. */}
        {membre && (piles ? <FicheAppareil id={membre} hass={H} onClose={() => setMembre(null)} /> : membre.indexOf('sensor.') === 0 ? <FicheCapteur id={membre} hass={H} onClose={() => setMembre(null)} /> : <FicheBinaire id={membre} hass={H} onClose={() => setMembre(null)} />)}
      </>)}
    </BottomSheet>
  );
}

function useDomainCards(hass, { onNav = null } = {}) {
  const S = (hass && hass.states) || {};
  const [lightPop, setLightPop] = useState(null);
  const [climPop, setClimPop] = useState(null);
  const [pilotPop, setPilotPop] = useState(null);
  const [coverPop, setCoverPop] = useState(null);
  const [mediaPop, setMediaPop] = useState(null);
  const [meteoPop, setMeteoPop] = useState(null);
  const [sensPop, setSensPop] = useState(null);
  const [appPop, setAppPop] = useState(null);
  // Une vanne (étape 3 IoT, I27) ouvre SA popup, chargée à la demande ; tout le reste, la fiche universelle.
  const FicheApp = estVanneCarte(appPop) ? CarteVanne : FicheAppareil;
  const [calPop, setCalPop] = useState(null);
  const [camPop, setCamPop] = useState(null);
  const [prisePop, setPrisePop] = useState(null);
  const [lockPop, setLockPop] = useState(null);
  const [binPop, setBinPop] = useState(null);
  const [robotPop, setRobotPop] = useState(null);
  const [groupePop, setGroupePop] = useState(null);
  const [eauPop, setEauPop] = useState(null);
  const [bornePop, setBornePop] = useState(false);
  // La fiche du domaine, depuis n'importe quelle carte — la compacte ouvre la
  // même popup que la riche. Tout ce qui n'a pas de fiche dédiée reçoit la
  // FICHE APPAREIL UNIVERSELLE : l'appareil entier, rendu par le registre.
  const ouvrir = (id) => {
    const d = String(id).split('.')[0];
    // Le calendrier n'ouvre pas une fiche d'entite : un agenda n'a ni etat ni
    // commande, il a un mois.
    if (d === 'calendar') { setCalPop(id); return; }
    if (d === 'camera') { setCamPop(id); return; }
    const st = S[id];
    /* Une lumière — un `light.*` de la maison, ou un switch déclaré lumière (L11) — ouvre SA fiche, même tout ou
     * rien : le minuteur, le journal du jour et l'appareil y sont (chantier Lumières, § 3.5). */
    if (d === 'light' || (d === 'switch' && cvEstLumiere(id))) setLightPop(id);
    else if (d === 'climate') setClimPop(id);
    else if (d === 'cover') setCoverPop(id);
    else if (d === 'media_player') setMediaPop(id);
    // Le widget météo ouvre SA fiche (sa maquette, 20/10) : la phrase, les heures, la semaine, la vigilance ; « L'appareil » y mène à la fiche universelle.
    else if (d === 'weather') setMeteoPop(id);
    // Un capteur DATÉ n'a pas de courbe à montrer (05/10, suite « dates
    // partout ») : sa fiche 24 h écrivait l'année en 44 px au-dessus d'une
    // courbe d'années. Il ouvre son APPAREIL, comme une lampe sans réglage —
    // sa fiche le met en tête, en tuile qui dit sa date.
    else if (d === 'sensor' && texteDate(st) == null) setSensPop(id);
    /* Une prise ouvre sa fiche, qui demande avant de couper ; un autre switch, sa feuille d'avant, dont la bascule ne demande
     * rien. Un switch que l'index ne classe pas encore — le NAS, les premières secondes — suit la règle commune (F2, `gardeDeSwitch`) :
     * si l'état des prises le nomme, ou n'a pas encore répondu, c'est la fiche. Le choix se fait ICI, à l'ouverture, et tient :
     * la feuille ne change pas sous les doigts quand la réponse arrive. */
    // La prise désignée comme vanne d'eau (étape 3 IoT, I31) ouvre la popup de l'eau, comme une vanne : par `appPop`, plus bas.
    else if (d === 'switch' && !cvEstLumiere(id) && !estVanneCarte(id)) setPrisePop({ id, fiche: gardeDeSwitch(lireEtatPrises(), id, { reconnue: priseDe(S, id).prise, indexLu: indexLu() }) });
    else if (d === 'lock') setLockPop(id);
    else if (d === 'binary_sensor') setBinPop(id);
    // Un robot a sa fiche a lui (ADR 0042) : accueil, zones, planning,
    // historique, entretien, reglages — une feuille, comme les autres appareils.
    else if (DOMAINES_ROBOT.indexOf(d) >= 0) setRobotPop(id);
    // Un chauffe-eau a SA popup (chantier G3, E2) : la consigne, le mode, l'arrêt.
    else if (d === 'water_heater') setEauPop(id);
    else setAppPop(id);
  };
  // ── Les cartes que Loggia compose lui-meme — distributeur, plantes, zones
  // fil pilote — rendues ICI pour que toute vue puisse les poser (composeur
  // du 15/09), avec leurs fiches. Objets ne fait plus que les demander. ──
  const [feederPop, setFeederPop] = useState(false);
  const [plantPop, setPlantPop] = useState(null);
  /* Le distributeur (ADR 0155 ; étape 2 du chantier IoT, 19/10) : ce que sa carte montre, lu sur l'APPAREIL désigné et la réponse
   * du serveur (`carteDistributeur`, distributeur.js) — la carte, sa compacte et la bibliothèque du composeur le lisent pareil. */
  const distributeur = () => carteDistributeur({ index: LOGGIA_INDEX, states: S, cfg: loggiaEnt('feeder', null), etat: lireEtatDistributeur().etat });
  // Les plantes : découvertes ou configurées (C29) — la lecture que tout partage (`lirePlante`).
  const plante = (base) => lirePlante(hass, base);
  const nom = (k) => nomDeCle(S, k);
  /* Toute cle rend sa carte : une entite, une zone (`zone:`), le distributeur
   * (`obj:feeder`), une plante (`plant:`) — dans n'importe quelle vue.
   * `chip` : la compacte, une rangee. */
  const card = (id, label = null, zone = null, chip = false) => {
    const k = String(id || '');
    if (zone || k.indexOf('zone:') === 0) {
      const z = zone || climateZones(S).find(x => x.id === k.slice(5));
      return z ? <RoomPilotCard zone={z} hass={hass} onOpen={setPilotPop} titre={label} /> : null;
    }
    if (k === 'obj:feeder') return <CarteDistributeur chip={chip} hass={hass} nom={label || tr('Distributeur')} onOpen={() => setFeederPop(true)} />;
    // La borne de recharge trouvée par la découverte (chantier G3, E3) : un appareil, sa carte.
    if (k === 'obj:borne') return <CarteBorne chip={chip} hass={hass} label={label} onOpen={() => setBornePop(true)} />;
    // Un groupe de capteurs (chantier Capteurs, étape 2 ; C20) : Ouvertures, Sécurité, Présence.
    if (k === 'groupe:piles') return <RoomPilesCard hass={hass} onOpen={() => setGroupePop('piles')} label={label} chip={chip} />;
    if (k.indexOf('groupe:') === 0) return <RoomGroupeCard groupe={k.slice(7)} hass={hass} onOpen={() => setGroupePop(k.slice(7))} label={label} chip={chip} />;
    if (k.indexOf('plant:') === 0) {
      const pl = plante(k.slice(6));
      if (!pl) return null;
      return <RoomPlantCard chip={chip} pl={pl} nom={label || pl.name} onOpen={() => setPlantPop(pl)} />;
    }
    // La vigilance météo (chantier Capteurs, C28) : sa carte, large ou compacte, avant la carte générique d'un binaire.
    if (estVigilance(k, S[k], LOGGIA_INDEX && LOGGIA_INDEX.entityMeta ? LOGGIA_INDEX.entityMeta.get(k) : null)) return <RoomVigilanceCard id={id} hass={hass} onOpen={ouvrir} label={label} chip={chip} />;
    // Une vanne (étape 3 IoT, I31), large ou compacte : `CvCard` lui donne sa carte, chargée à la demande — avant la carte d'une prise.
    if (chip || estVanneCarte(k)) return <CvCard id={id} hass={hass} label={label} onOpen={ouvrir} dense={chip} />;
    const d = k.split('.')[0];
    // Une prise qui n'est pas une lumiere n'est plus une carte lumiere : elle
    // rejoint les autres appareils, au gabarit, avec sa puissance.
    const lumiere = d === 'light' || (d === 'switch' && cvEstLumiere(id));
    return lumiere ? <RoomLightCard id={id} hass={hass} onOpen={ouvrir} label={label} />
      : d === 'cover' ? (estVolet(S[k]) ? <RoomVoletCard id={id} hass={hass} onOpen={setCoverPop} titre={label} /> : <RoomCoverCard id={id} hass={hass} onOpen={setCoverPop} titre={label} />)
        : d === 'climate' ? <RoomClimateCard id={id} hass={hass} onOpen={setClimPop} label={label} />
          : d === 'media_player' ? <RoomMediaCard id={id} hass={hass} onOpen={setMediaPop} label={label} />
            : (d === 'vacuum' || d === 'lawn_mower') ? <RoomRobotCard id={id} hass={hass} onOpen={ouvrir} label={label} />
              : d === 'water_heater' ? <CarteEauChaude id={id} hass={hass} onOpen={ouvrir} label={label} />
              // Une mesure de la table a sa carte (chantier Capteurs, C6) : la pièce n'en gagne aucune, la carte d'avant change.
              : (d === 'sensor' && estMesure(S[k])) ? <RoomMesureCard id={id} hass={hass} onOpen={ouvrir} label={label} />
              : (d === 'switch' && priseDe(S, k).prise) ? <RoomPriseCard id={id} hass={hass} onOpen={ouvrir} titre={label} />
              : ROOM_GENERIQUES.indexOf(d) >= 0 ? <RoomGenericCard id={id} hass={hass} onOpen={ouvrir} label={label} />
                : <CvCard id={id} hass={hass} label={label} onOpen={ouvrir} />;
  };
  const sheets = (
    <>
      {lightPop && <FicheLumiere id={lightPop} hass={hass} onClose={() => setLightPop(null)} />}
      {/* Un thermostat, ou un module fil pilote découvert, que l'état du
        * planning de chauffe connaît ouvre SA fiche à onglets, planning
        * allumé ou non (plan 2, choix 10) ; sinon l'ancienne feuille, telle
        * quelle — une zone décrite à la main aussi. */}
      {climPop && <FeuilleChauffage entite={climPop} hass={hass} onClose={() => setClimPop(null)}
        ancienne={<RoomClimateSheet id={climPop} hass={hass} onClose={() => setClimPop(null)} />} />}
      {pilotPop && (() => {
        const z = climateZones(S).find(x => x.id === pilotPop);
        if (!z) return null;
        const ancienne = <RoomPilotSheet zone={z} hass={hass} onClose={() => setPilotPop(null)} />;
        return z.decouvert ? <FeuilleChauffage entite={z.modeEnt} hass={hass} onClose={() => setPilotPop(null)} ancienne={ancienne} /> : ancienne;
      })()}
      {/* Un VOLET ouvre sa fiche à onglets (chantier Volets, § 3.5) ; le garage et le portail, leur feuille d'avant (V3). */}
      {coverPop && (estVolet(S[coverPop]) ? <FicheVolet id={coverPop} hass={hass} onClose={() => setCoverPop(null)} />
        : <RoomCoverSheet id={coverPop} hass={hass} onClose={() => setCoverPop(null)} />)}
      {mediaPop && <FicheMedia id={mediaPop} hass={hass} onClose={() => setMediaPop(null)} />}
      {meteoPop && <FicheMeteo id={meteoPop} hass={hass} onClose={() => setMeteoPop(null)} />}
      {sensPop && <FicheCapteur id={sensPop} hass={hass} onClose={() => setSensPop(null)} />}
      {appPop && <FicheApp id={appPop} hass={hass} fiche onClose={() => setAppPop(null)} />}
      {calPop && <FeuilleCalendrier hass={hass} onClose={() => setCalPop(null)} />}
      {camPop && <CamSheet haid={camPop} nom={cvName(S[camPop], camPop)} hass={hass} onClose={() => setCamPop(null)} onNav={onNav} />}
      {/* Une PRISE (P1) ouvre sa fiche (chantier Prises, § 3.5), comme un switch que l'index ne classe pas encore et que l'état des prises garde (F2) ; un autre switch, sa feuille d'avant. */}
      {prisePop && (priseDe(S, prisePop.id).prise || prisePop.fiche ? <FichePrise id={prisePop.id} hass={hass} onClose={() => setPrisePop(null)} />
        : <RoomSwitchSheet id={prisePop.id} hass={hass} onClose={() => setPrisePop(null)} />)}
      {lockPop && <RoomLockSheet id={lockPop} hass={hass} onClose={() => setLockPop(null)} />}
      {binPop && <FicheBinaire id={binPop} hass={hass} onClose={() => setBinPop(null)} />}
      {robotPop && <FicheRobot id={robotPop} hass={hass} onClose={() => setRobotPop(null)} />}
      {feederPop && <FicheDistributeur hass={hass} onClose={() => setFeederPop(false)} />}
      {plantPop && <FichePlante pl={plantPop} hass={hass} onClose={() => setPlantPop(null)} />}
      {groupePop && <FicheGroupe groupe={groupePop} hass={hass} onClose={() => setGroupePop(null)} />}
      {eauPop && <FicheEauChaude id={eauPop} hass={hass} onClose={() => setEauPop(null)} />}
      {bornePop && <FicheBorne hass={hass} onClose={() => setBornePop(false)} />}
    </>
  );
  const fermer = () => { setLightPop(null); setClimPop(null); setPilotPop(null); setCoverPop(null); setMediaPop(null); setSensPop(null); setAppPop(null); setCamPop(null); setPrisePop(null); setLockPop(null); setBinPop(null); setRobotPop(null); setGroupePop(null); setFeederPop(false); setPlantPop(null); setEauPop(null); setBornePop(false); };
  /* La COMPACTE d'une entite : une rangee — icone, nom, etat, le controle —
   * qui ouvre la meme fiche que la riche. Une zone fil pilote n'en a pas. */
  const compact = (id, label = null) => card(id, label, null, true);
  return { card, compact, nom, plante, distributeur, sheets, fermer, ouvrir };
}

/* ════════════ VUE OBJETS — hub des appareils connectés (réf. « Objets connectés ») ════════════ */
// Illustrations filigrane des appareils médias (même style flat que PLANT_ART, ancrées à droite).
/* Les dessins de la vue Énergie, des postes et de la fiche d’un robot (chantier Capteurs, étapes 2 et 3, C34 : la réserve) :
 * des fichiers de public/dessins, recopiés à côté de la page comme les polices — le démarrage n’en garde que l’adresse. En
 * adresses data:, ils pesaient plus de 18 Ko au démarrage. */
const adresseDessin = (nom) => './dessins/' + nom + '.svg';
const DEVICE_ART = Object.fromEntries(['appletv', 'echo', 'vacuum', 'mower', 'feeder'].map(n => [n, adresseDessin(n)]));
/* Ce que la carte, la compacte, la fiche et la section Plantes et piles lisent d'une plante (chantier Capteurs, C29 à C31) : ses
 * capteurs — ceux de son appareil, sinon ceux de sa base —, ses mesures, sa pile, et si son capteur de sol se tait (`mort`, et depuis
 * quand). `temp` est TOUJOURS en Celsius ici, comme pour confort.js/systeme.js : les seuils de verdictsPlante (objets.js) raisonnent en
 * Celsius ; `uniteTemp` ne sert qu'à réécrire le chiffre dans l'unité réelle du capteur. */
function lirePlante(hass, base) {
  const S = (hass && hass.states) || {};
  const p = plantesDeLaMaison(S).find(x => x.base === base);
  if (!p) return null;
  const c = capteursPlante(S, p);
  const numDe = (id) => { const e = id && S[id]; if (!e) return null; const n = parseFloat(e.state); return isNaN(n) ? null : n; };
  const muet = (id) => !!id && (!S[id] || S[id].state === 'unavailable' || S[id].state === 'unknown');
  const uT = uniteTemp(c.temp && S[c.temp] ? S[c.temp].attributes : null, hass);
  /* La lumière du JOUR (audit du 19/10, M6 ; relectures du lot 3) : le maximum que la plante de Home Assistant tient (`max_brightness`,
   * un vrai nombre — `null` n'est pas 0), sinon le lux du moment, le soleil à 20° au moins (`elevation`) : à l'aube comme à 18 h en
   * octobre, 150 lx ne disent rien de la journée. Sans élévation, la lumière ne presse pas. */
  const lux = numDe(c.lux);
  const maxJour = S[base] && S[base].attributes ? lireNombre(S[base].attributes.max_brightness) : null;
  const sun = S['sun.sun'];
  const soleil = !!sun && lireNombre((sun.attributes || {}).elevation) >= 20;
  return { base, name: p.nom, mort: muet(c.hum), muetDepuis: muet(c.hum) && S[c.hum] ? (Date.parse(S[c.hum].last_changed) || null) : null, img: p.img,
    room: p.piece || (p.capteurs ? null : plantPiece(S, p.base, null)), hum: numDe(c.hum), cond: numDe(c.cond), lux, luxJour: maxJour != null ? maxJour : soleil ? lux : null,
    temp: versCelsius(numDe(c.temp), uT), uniteTemp: uT, bat: numDe(c.bat), ids: c };
}

/* La fiche d'une plante (chantier Capteurs, étape 3 ; C31) : la coquille garde la feuille — sans onglets, à la hauteur de son contenu —
 * et pose la frontière Suspense DEDANS (le patron de `FicheMedia`) ; le contenu (ficheplante.jsx), à la demande, lit la plante dans le
 * `hass` VIVANT de ses capteurs ; L'appareil ouvre la fiche universelle par-dessus. Pas d'épingle : une plante n'est pas une entité. */
function FichePlante({ pl, hass, onClose }) {
  const ids = Object.values(pl.ids || {}).filter(Boolean);
  const H = hassQuiConnait(useHass(ids), hass, ids[0]);
  const vive = lirePlante(H, pl.base) || pl;
  const [fiche, setFiche] = useState(null);
  return (
    <BottomSheet onClose={onClose}>
      {() => (<>
        <Suspense fallback={<div style={{ minHeight: 260 }} />}>
          <FichePlanteContent pl={vive} hass={H} onFiche={setFiche} />
        </Suspense>
        {fiche && <FicheAppareil id={fiche} hass={H} onClose={() => setFiche(null)} />}
      </>)}
    </BottomSheet>
  );
}

/* Ce que la carte du distributeur et sa compacte lisent (étape 2 du chantier IoT, 19/10) : sa vue (`carteDistributeur`), sur le
 * `hass` de la vue, que le poll suit (`croqKeys`) ; l'abonnement au cache de l'état serveur (distributeuretat.js) tant qu'elle est
 * montée — c'est lui qui donne son prochain repas et sa réserve, relu toutes les 60 s, et rien ne l'interroge quand aucune carte
 * n'est à l'écran ; « Distribuer », le geste partagé (`lancerDistribution`) : un appui pendant le verrou — d'ici ou d'ailleurs — ne
 * part pas, et le verrou tient jusqu'à la réponse de Home Assistant. */
function useVueDistributeur(hass, nom) {
  const { etat } = useEtatDistributeur(distributeurConfigure());
  const enVol = useDistribution();
  const c = carteDistributeur({ index: LOGGIA_INDEX, states: (hass && hass.states) || {}, cfg: loggiaEnt('feeder', null), etat });
  return { ...c, nom, enVol, distribuer: () => { lancerDistribution(hass, c.envoi); } };
}
/* La carte du distributeur, large ou compacte (`chip`), sur sa vue. */
function CarteDistributeur({ chip, hass, nom, onOpen }) {
  return <RoomFeederCard v={useVueDistributeur(hass, nom)} chip={chip} onOpen={onOpen} />;
}

/* La fiche du distributeur — une feuille à onglets comme celle du robot
 * (ADR 0155, 05/10) : Accueil, Repas, Historique, Entretien s'il y a des
 * consommables (étape 2 du chantier IoT, 19/10), et la roue Réglages. L'en-tête
 * prend la plaque de la carte et « {pièce} · distributeur » (I21).
 * Le contenu (fichedistributeur.jsx) se charge à la demande, DANS une
 * frontière Suspense ; ici ne reste que la coquille, sur le patron de
 * `FicheRobot` :
 *  - la réponse du serveur, demandée AVEC le détail tant que la fiche est
 *    ouverte (15 s), par le cache partagé avec la carte ;
 *  - un abonnement à ses entités ET aux automatisations reconnues : le poll de
 *    la vue derrière ne les connaît pas, et sans lui une bascule resterait
 *    figée (régression du 01/10 : 6 007 ms) ;
 *  - l'épingle de l'ENTITÉ principale (la commande désignée, sinon celle de
 *    l'appareil, sinon la portion) : `BoutonEpingle` épingle une entité sur la
 *    carte de son appareil, `obj:feeder` n'en a pas ;
 *  - la fiche universelle de l'appareil, par-dessus, depuis ses réglages.
 * Plus de liste de repas ici : l'ancienne liste de Paramètres a cessé d'être
 * un planning (elle ne sert plus que d'indice, côté serveur). */
function FicheDistributeur({ hass, onClose }) {
  const conf = loggiaEnt('feeder', null);
  const lu = lireDistributeur(LOGGIA_INDEX, (hass && hass.states) || {}, conf);
  const { etat, erreur } = useEtatDistributeur(distributeurConfigure(), { detail: true });
  const autos = etat && Array.isArray(etat.automatisations) ? etat.automatisations.map(a => a && a.entity_id).filter(x => typeof x === 'string') : [];
  const hassLive = useHass([...croqKeys(), ...lu.soeurs.map(x => x.id), ...autos]);
  const H = hassLive || hass;
  const [fiche, setFiche] = useState(null);
  const ficheId = (conf && typeof conf.haid === 'string' && conf.haid) || (lu.commande && lu.commande.entity_id) || (lu.portion && lu.portion.entity_id) || null;
  /* La plaque de sa carte et « {pièce} · distributeur » (étape 2 du chantier IoT, I21) : la zone de son entité principale ; sans zone,
   * « Distributeur ». Grise quand l'appareil ne répond plus, comme sur la carte. */
  const zone = ficheId && LOGGIA_INDEX && typeof LOGGIA_INDEX.areaNameOf === 'function' ? LOGGIA_INDEX.areaNameOf(ficheId) : null;
  const [fond, encre] = lu.enLigne.mort && lu.enLigne.raison !== 'reservoir' ? ['var(--o-s1)', 'var(--o-text3)'] : PLAQUE_DISTRIBUTEUR;
  return (
    <BottomSheet onClose={onClose} onglets>
      {() => (<>
        <Suspense fallback={<div style={{ minHeight: 260 }} />}>
          <FicheDistributeurContent hass={H} etat={etat} erreur={erreur} cfg={conf} onFiche={setFiche} onEtat={poserEtatDistributeur}
            epingle={ficheId ? <BoutonEpingle id={ficheId} /> : null} plaque={{ fond, encre, icone: 'paw' }} sousNom={zone ? zone + ' · ' + tr('distributeur') : tr('Distributeur')} />
        </Suspense>
        {fiche && <FicheAppareil id={fiche} hass={H} onClose={() => setFiche(null)} />}
      </>)}
    </BottomSheet>
  );
}

/* La sonde de la pièce d'un chauffage, `{ id, attribut }` : celle que ses
 * fiches d'avant lisaient. Un thermostat se mesure lui-même
 * (`current_temperature`, comme `RoomClimateSheet`) ; un module fil pilote par
 * le capteur que la découverte lui a trouvé — son voisin, sinon celui de sa
 * pièce (`resolveClimate`, spec § 3.2). null sans rien de lisible : la fiche
 * ne montre alors ni température ni courbe. */
function sondeDuChauffage(S, entite) {
  const st = S[entite];
  const mesure = st && st.attributes ? st.attributes.current_temperature : null;
  if (String(entite).indexOf('climate.') === 0 && mesure != null && String(mesure).trim() !== '' && Number.isFinite(Number(mesure))) {
    return { id: entite, attribut: 'current_temperature' };
  }
  const z = climateZones(S).find(x => x && (x.modeEnt === entite || x.haid === entite));
  return z && z.tempSensor ? { id: z.tempSensor, attribut: null } : null;
}
/* Le capteur de la PIÈCE d'un thermostat (30/10) : celui que Loggia montre
 * sur la carte de sa pièce (`rooms`, sa sonde de température), pour mesurer
 * l'écart du capteur de l'appareil. Jamais l'appareil lui-même, ni un capteur
 * de son appareil — un poêle publie sa propre « température ambiante », la
 * comparer à elle-même ne dirait rien. null sans pièce, sans capteur, ou hors
 * d'un `climate` (`sondeDuChauffage` garde la sonde qu'on AFFICHE). */
function sondePieceDuChauffage(S, entite) {
  if (String(entite).indexOf('climate.') !== 0 || !LOGGIA_INDEX) return null;
  // Les pièces de Loggia, complétées par la découverte (`normRooms`), rapprochées par le NOM de la zone, comme une vue de pièce.
  const nom = String(pieceDuChauffage(entite) || '').trim().toLowerCase();
  const r = nom ? normRooms(cfgVal('loggia_rooms', null)).find(x => x && String(x.room || '').trim().toLowerCase() === nom) : null;
  const id = r && r.haid && typeof r.haid.temp === 'string' ? r.haid.temp : null;
  if (!id || id === entite || !S[id]) return null;
  const meta = LOGGIA_INDEX.entityMeta && typeof LOGGIA_INDEX.entityMeta.get === 'function' ? LOGGIA_INDEX.entityMeta : null;
  const appareil = (x) => (meta && meta.get(x) ? meta.get(x).deviceId || null : null);
  if (appareil(entite) && appareil(id) === appareil(entite)) return null;
  return { id, attribut: null };
}
/* Les compteurs d'un chauffage, pour l'énergie de son Historique (30/10) : le
 * capteur d'énergie de son APPAREIL (`device_class` energy), et sa puissance —
 * celle que lit la carte d'un module (`puissance`), sinon celle de l'appareil.
 * null sans l'un ni l'autre (un poêle à granulés n'a pas de compteur). */
function compteursDuChauffage(S, entite, puissance) {
  const meta = LOGGIA_INDEX && LOGGIA_INDEX.entityMeta && typeof LOGGIA_INDEX.entityMeta.forEach === 'function' ? LOGGIA_INDEX.entityMeta : null;
  const appareil = meta && meta.get(entite) ? meta.get(entite).deviceId || null : null;
  let energie = null, watts = puissance || null;
  if (appareil) {
    meta.forEach((m, eid) => {
      if (!m || m.deviceId !== appareil || m.disabled || String(eid).indexOf('sensor.') !== 0 || !S[eid]) return;
      const classe = (S[eid].attributes || {}).device_class;
      if (classe === 'energy' && !energie) energie = eid;
      if (classe === 'power' && !watts) watts = eid;
    });
  }
  return energie || watts ? { energie, puissance: watts } : null;
}
/* La zone d'un module fil pilote découvert, celle de sa carte : son capteur
 * de puissance, que lit sa carte (`chauffeDeZone`) — la plaque de l'en-tête
 * de sa fiche chauffe comme la sienne (tâche 10 bis B) —, et l'identifiant
 * de sa carte, sous lequel on lui a choisi une icône. null sans module. */
function zoneDuChauffage(S, entite) {
  return climateZones(S).find(x => x && x.decouvert && x.modeEnt === entite) || null;
}
// La pièce d'un chauffage, celle de Home Assistant : « Bureau · fil pilote » sous le nom de sa fiche.
const pieceDuChauffage = (id) => (LOGGIA_INDEX && typeof LOGGIA_INDEX.areaNameOf === 'function' && LOGGIA_INDEX.areaNameOf(id)) || null;

/* La fiche d'un chauffage (plan 2 du chantier Chauffage, tâche 8 ; choix 10
 * et 13) — une feuille à onglets comme celles du robot et du distributeur :
 * Accueil, Planning, Historique. Le contenu (fichechauffage.jsx) se charge à
 * la demande, DANS une frontière Suspense ; ici ne reste que la coquille :
 *  - l'état du moteur, relu toutes les 15 s tant que la fiche est ouverte
 *    (`rapide`), dans le cache que partagent les cartes ;
 *  - un abonnement à l'appareil et à la sonde de sa pièce : la vue derrière
 *    ne les surveille pas forcément ;
 *  - l'épingle de l'entité, et la sonde de la pièce — la fiche dessine
 *    elle-même la courbe de son Historique (tâche 10 bis D, cadre 3d) : la
 *    coquille ne lit plus l'historique 24 h, et le contenu, chargé à la
 *    demande, n'importe jamais App.jsx ;
 *  - le mot d'un mode `hvac` (`motModeClimat`), pour un appareil qui sait
 *    refroidir (tâche 10) : celui de la fiche d'avant, sans en recopier la
 *    table — les clés « Froid » et « Sec » n'ont qu'un appel chacune
 *    (tests/froid_sec_deux_sens.test.mjs) ;
 *  - la fiche universelle de l'appareil, par-dessus : sa consommation,
 *    l'interrupteur d'un module, toutes ses entités ;
 *  - pour l'en-tête (tâche 10 bis B), la pièce et le capteur de puissance
 *    d'un module : sa plaque chauffe comme celle de sa carte ; et l'icône
 *    choisie pour sa carte (`GlypheCarte`, le même identifiant : `zone:` et
 *    l'id de la zone d'un module, l'entité d'un thermostat — relecture de la
 *    partie B) ;
 *  - ouverte par sa CLÉ (`cle` : « En ce moment », tâche 12), l'entité vient
 *    de l'état — nulle pour un chauffage INTROUVABLE dans Home Assistant : ni
 *    sonde, ni module, ni épingle, et rien ne se lit dans `hass.states`. Sa
 *    fiche est le seul chemin vers « Supprimer son planning » : elle s'ouvre
 *    sur son Planning, où est ce geste. Par sa clé, elle se ferme d'elle-même
 *    quand le chauffage quitte l'état — son planning supprimé — au lieu de
 *    rester vide (`FermerSeule`). Ouverte par son entité (une carte), rien
 *    ne change. */
function FermerSeule({ fermer }) {
  // Rien à dessiner : la feuille se ferme — son animation, puis `onClose`.
  useEffect(() => { fermer(); }, [fermer]);
  return null;
}
function FicheChauffage({ entite: demandee = null, cle = null, hass, onClose }) {
  const { etat } = useEtatChauffage(true, { rapide: true });
  const ch = cle ? chauffageParCle(etat, cle) : chauffageDe(etat, demandee);
  // Par sa clé, l'entité vient de l'état : nulle pour un chauffage introuvable.
  const entite = demandee || (ch && ch.entite) || null;
  const S = (hass && hass.states) || {};
  const sonde = entite ? sondeDuChauffage(S, entite) : null;
  const zone = entite ? zoneDuChauffage(S, entite) : null;
  const puissance = (zone && zone.puissance) || null;
  const idCarte = zone ? 'zone:' + zone.id : entite;
  const hassLive = useHass([entite, sonde ? sonde.id : '', puissance || '']);
  const H = hassLive || hass;
  const [fiche, setFiche] = useState(null);
  return (
    <BottomSheet onClose={onClose} onglets>
      {(fermer) => (<>
        {ch ? (
          <Suspense fallback={<div style={{ minHeight: 260 }} />}>
            <FicheChauffageContent hass={H} ch={ch} etat={etat} sonde={sonde} sondePiece={entite ? sondePieceDuChauffage(S, entite) : null} onFiche={setFiche} motHvac={motModeClimat}
              piece={pieceDuChauffage(entite)} puissance={puissance} compteurs={entite ? compteursDuChauffage(S, entite, puissance) : null}
              glyphe={(defaut) => <GlypheCarte id={idCarte} size={18}>{defaut}</GlypheCarte>}
              epingle={entite ? <BoutonEpingle id={entite} /> : null} ongletDepart={entite ? undefined : 'planning'} />
          </Suspense>
        ) : cle && etat ? <FermerSeule fermer={fermer} /> : (
          /* Le chauffage a quitté l'état le temps d'une réponse : la feuille
           * garde son nom et sa croix. */
          <TitreFeuille style={{ fontSize: 17, fontWeight: 800 }}>{entite ? cvName(H && H.states ? H.states[entite] : null, entite) : tr('Chauffage')}</TitreFeuille>
        )}
        {fiche && <FicheAppareil id={fiche} hass={H} onClose={() => setFiche(null)} />}
      </>)}
    </BottomSheet>
  );
}

/* La feuille que la fabrique ouvre pour un chauffage : SA fiche dès que l'état
 * du planning de chauffe le connaît — planning allumé ou non (choix 10) —,
 * sinon `ancienne`, telle quelle. L'abonnement tient le cache à jour même
 * ouverte depuis une compacte, qui ne le lit pas : un état arrivé après
 * l'ouverture remplace l'ancienne feuille par la fiche. */
function FeuilleChauffage({ entite, hass, onClose, ancienne }) {
  const { etat } = useEtatChauffage();
  return chauffageDe(etat, entite) ? <FicheChauffage entite={entite} hass={hass} onClose={onClose} /> : ancienne;
}

/* La fiche d'un VOLET (chantier Volets, § 3.5 à 3.8) — une feuille à onglets
 * comme celle du chauffage : Accueil, Planning, Historique. Le contenu
 * (fichevolet.jsx) se charge à la demande ; ici ne reste que la coquille :
 *  - l'état des volets, relu toutes les 15 s tant qu'elle est ouverte
 *    (`rapide`), dans le cache que partagent les cartes, et son `erreur` ;
 *  - un abonnement au volet et à la porte devant lui : la vue derrière ne les
 *    surveille pas forcément ;
 *  - l'épingle, l'icône choisie pour sa carte (`GlypheCarte`), sa pièce ;
 *  - la fiche universelle de l'appareil, par-dessus.
 * Chargée à la demande, la fiche n'importe jamais App.jsx. */
function FicheVolet({ id, hass, onClose }) {
  // `erreur` : le serveur muet — le Planning le dit au lieu d'attendre (19/10).
  const { etat, erreur } = useEtatVolets(true, { rapide: true });
  const v = voletDe(etat, id);
  const porte = (v && v.porte && v.porte.entite) || '';
  const hassLive = useHass([id, porte]);
  const H = hassLive || hass;
  const [fiche, setFiche] = useState(null);
  return (
    <BottomSheet onClose={onClose} onglets>
      {() => (<>
        <Suspense fallback={<div style={{ minHeight: 260 }} />}>
          <FicheVoletContent hass={H} id={id} etat={etat} erreur={erreur} piece={zoneDe(id)} onFiche={setFiche}
            glyphe={(defaut, vue) => <GlypheCarte id={id} size={18} selon={vue ? (n) => iconeSelonEtat(n, vue) : null}>{defaut}</GlypheCarte>} epingle={<BoutonEpingle id={id} />} />
        </Suspense>
        {fiche && <FicheAppareil id={fiche} hass={H} onClose={() => setFiche(null)} />}
      </>)}
    </BottomSheet>
  );
}

/* La fiche d'une PRISE (chantier Prises, § 3.5) : une feuille SANS onglets — sa
 * hauteur suit son contenu. La coquille passe à la fiche, chargée à la demande,
 * ce que le démarrage sait déjà : la règle (`priseDe` : ses capteurs, suivis en
 * direct), sa pièce, l'épingle, l'icône choisie pour sa carte — le dessin de
 * prise de Loggia pour une prise ordinaire —, la bascule de la maison ; et elle
 * ouvre la fiche universelle de l'appareil. */
function FichePrise({ id, hass, onClose }) {
  const prise = priseDe((hass && hass.states) || {}, id);
  const hassLive = useHass([id, prise.puissance, prise.energie].filter(Boolean));
  const H = hassLive || hass;
  const [fiche, setFiche] = useState(null);
  return (
    <BottomSheet onClose={onClose}>
      {() => (<>
        <Suspense fallback={<div style={{ minHeight: 260 }} />}>
          <FichePriseContent hass={H} id={id} prise={prise} piece={zoneDe(id)} onFiche={setFiche} bascule={RmBascule}
            glyphe={(defaut) => <GlypheCarte id={id} size={18}>{defaut || <PlugIcon size={18} />}</GlypheCarte>} epingle={<BoutonEpingle id={id} />} />
        </Suspense>
        {fiche && <FicheAppareil id={fiche} hass={H} onClose={() => setFiche(null)} />}
      </>)}
    </BottomSheet>
  );
}

export { FeuilleCalendrierContent, FicheMedia, FicheEntete, FicheRangee, FicheValeur, FicheBouton, heureDe, zoneDe, pileDe, RangeePile, RoomCoverSheet, RoomClimateSheet, BRIQUES_SWITCH, RoomSwitchSheet, RoomLockSheet, LigneEntite, BoutonEpingle, Epingles, FicheMachineHero, FicheRobot, FicheAppareil, useHistorique24, Courbe24, BRIQUES_CAPTEUR, FicheCapteur, FicheBinaire, BRIQUES_GROUPE, FicheGroupe, useDomainCards, adresseDessin, lirePlante, FichePlante, CarteDistributeur, FicheDistributeur, FicheChauffage, FichePrise };
