/* La carte d'un robot : l'aspirateur et la tondeuse.
 * Sorti d’App.jsx tel quel (lot 5 de l’audit du 28/10, ADR 0283) : seuls les imports sont neufs. */
import { LOGGIA_INDEX } from '../state.js';
import { enPanne } from '../outils.js';
import { LAVIS } from '../theme.js';
import { pickSibling } from '../discovery.js';
import { airesTondeuse, phaseRobot, batterieRobot, phraseRobot, PHASE_GESTE, gestePermis, commandesEnVol } from '../robots.js';
import { bipeRobot, apresCommandeRobot, lancerRobot, signalerRobot, useEtatRobots, useBipe, useGeste, vueCarnetRobot, departRobot, poserGeste, GARDE_DEPART_MS, oublierGeste, gesteEnVol } from '../robotsetat.js';
import { commanderService } from '../actions.js';
import { Surface, nomCarte, Fi } from '../ui.jsx';
import { couleurPile } from '../attention.js';
import { petitesCapitales, LISERE } from '../styles.js';
import { Ico } from '../icones.jsx';
import { tr } from '../i18n.js';
import { useHass, HASS_POLL_MS, lavisCarte } from '../app/noyau.jsx';
import { RM_BTN, ChiffreHaut, RM_CARD, RM_ICO, GlypheCarte, RM_MILIEU, RM_NAME, RM_SUB } from './briques.jsx';
import { hassQuiConnait } from './mesure.jsx';

/* ── Les robots : l'aspirateur et la tondeuse (chantier IoT, étape 1 ; sa maquette « Cartes IoT », 1a ; I5 à I9, I12, I33) ──
 *
 * La carte d'un robot au gabarit commun (`o-gabarit`, ADR 0202), ses deux écritures :
 *  - large (184 × 225) : la plaque seule en haut ; 10 px plus bas, la rangée `RM_MILIEU` — le nom et la phrase à gauche, la
 *    batterie NOMMÉE à droite, alignées sur leur bas ; au pied, une ou deux puces de 44 px qui se partagent la largeur —
 *    38 + 10 + 40 + 9 + 44 = 141 px des 150 de contenu ;
 *  - étroite (1c, sous 188 px de contenu) : la plaque et la batterie nommée en haut, le nom entier, la phrase, UNE ligne de
 *    puces en glyphes — 38 + 10 + 32 + 2 + 15 + 9 + 44 = 150.
 * La couleur n'alerte que : au travail, la plaque à 0,18 et le lavis de 0,14 à 0,03 dans la teinte du robot — l'accent pour
 * l'aspirateur, le vert pour la tondeuse (I8) ; au repos, le gris, sans lavis ; muet, le liseré qui respire (`o-panne`).
 * Les puces sont celles de la phase et des bits de l'appareil (`commandesRobot`, I9), chacune par son service explicite —
 * jamais `toggle` — ; « Démarrer » passe par le serveur (`lancerRobot`), qui note le départ au carnet. Les pièces se
 * choisissent dans la popup, pas ici. Le geste d'abord (I33) : l'avance PARTAGÉE d'optimiste.js, une par robot, que la carte, la
 * compacte, la popup et la fiche universelle lisent ensemble (`useVueRobot` ; passe bis 2 du 18/10, point N). */

// La teinte d'un robot au travail (I8) : son lavis, et l'encre de sa plaque — celle de sa phrase (robots.js).
const TEINTE_ROBOT = { vacuum: ['var(--o-accent-rgb)', 'var(--o-accent-soft)'], lawn_mower: ['var(--o-ok-rgb)', 'var(--o-ok)'] };
/* La puce de sa maquette (`ChipButton`) au pied d'une carte : 44 px, arrondi 10, le gris doux, sans bordure, le glyphe et le mot
 * à 7 px ; choisie — la base pendant le retour —, le bleu plein et le blanc. Positionnée (`RM_BTN`) : peinte après la surface,
 * elle reçoit son clic. */
const RM_PUCE_ROBOT = { ...RM_BTN, height: 44, padding: '0 8px', borderRadius: 10, border: 'none', minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 12.5 };
const RM_PUCE_CHOISIE = { background: 'var(--o-accent-fond)', color: '#fff' };

/* « Localiser », que le SERVEUR décide (petit paquet du 25/10) : son script maison s'il en désigne un qui répond (`vacuumScripts.localiser`,
 * l'aspirateur principal qu'il retient), sinon `vacuum.locate` — d'après la description de la maison sur le disque, plus d'après le cache
 * de cet onglet. Un seul appui ; puis « Il bipe : suivez le son » trois secondes, quand Home Assistant a ACCEPTÉ (I7). Un serveur d'avant
 * (`invalid_format` : son schéma refuse `localiser` ; `unknown_command`) : le service d'ici, sans toast ; un autre refus remonte au toast,
 * comme toute commande (`signalerRobot`). La carte, la compacte, la popup et la fiche universelle passent toutes ici. Rend ce qui a pris. */
function localiserRobot(H, id, domaine) {
  const bip = () => (bipeRobot(id), apresCommandeRobot(), true);
  // Le service par le moteur d'actions (`commanderService`) : la capacité vérifiée, un refus au toast ; réglé non nul quand Home Assistant a accepté.
  const direct = () => Promise.resolve(commanderService(H, id, domaine, 'locate', { entity_id: id })).then((r) => r != null && bip());
  return lancerRobot(H, id, [], { localiser: true, depart: false, direct }).then((etat) => !etat || bip(),
    (e) => (e && e.code === 'invalid_format' ? direct() : (signalerRobot(e), false)));
}

/* Ce que la carte, la compacte, la popup et « En ce moment » lisent d'un robot, dans un `hass` VIVANT (I7, I33, I35) : la carte
 * s'abonne à SON entité et à ses sœurs de batterie et de charge (`useHass`) ; la phase, l'avance d'un geste comprise ; la batterie
 * (l'attribut, sinon la sœur) ; ce que le carnet du serveur sait (robotsetat.js : les pièces du passage, ou celles que cet onglet
 * vient de lancer, sa dernière erreur, le prochain passage qui partira) ; « Il bipe » ; la phrase et les puces (robots.js), chacune
 * avec son geste. `actif` faux : rien ne s'abonne, et rien ne se rend.
 *
 * Le geste en vol (passe bis du 18/10, point 1) n'est plus à la carte : c'est l'avance PARTAGÉE d'optimiste.js, PAR ROBOT
 * (robotsetat.js, `poserGeste` ; passe bis 2, point N), que la carte large, l'étroite, la compacte, la popup et la fiche
 * universelle lisent ensemble — deux appuis rapprochés sur « Pause » relançaient le robot, la puce ayant basculé sous le doigt sur
 * « Reprendre ». Son filet, le modèle de celui du volume (`useVueLecteur`) : la latence de l'appareil, cinq secondes, et un relevé du
 * pont ; un départ par le serveur le GARDE tant que `loggia/robots/lancer` n'a pas répondu, borné (point E). Une réponse de Home
 * Assistant le lève, passé 1,5 s — sa phase, ou son `last_changed` —, et pour de bon : la maison revenue à la phase d'avant ne le
 * réarme pas (point G). Un refus ne fait tomber que SON geste, par son jeton (point F). Tant qu'il vole, la puce qui l'a lancé reste
 * sur lui et ne fait rien, et rien n'offre l'inverse (`commandesEnVol`, `gestePermis`) ; un second appui le lit au moment même,
 * avant que l'écran ne se redessine. Une tondeuse à aires dont aucune n'est allumée n'offre pas « Démarrer », et sa phrase le dit
 * (`sansZone`, point D) : toucher la carte ouvre la fiche, où l'on choisit. */
const FILET_ROBOT_MS = 5000;
function useVueRobot(hass, id, label = null, actif = true, { rapide = false } = {}) {
  const S0 = (hass && hass.states) || {};
  const domaine = String(id).split('.')[0];
  const soeur = (domain, deviceClass) => (actif ? pickSibling(LOGGIA_INDEX, S0, id, { domain, deviceClass }) : null);
  const idBat = soeur('sensor', 'battery');
  const idCharge = soeur('binary_sensor', 'battery_charging');
  // Les aires d'une tondeuse (point D), suivies comme ses sœurs : l'une s'allume, « Démarrer » revient.
  const aires = actif && domaine === 'lawn_mower' ? airesTondeuse(LOGGIA_INDEX, id) : [];
  const vivant = useHass(actif ? [id, idBat, idCharge, ...aires].filter(Boolean) : []);
  const H = hassQuiConnait(vivant, hass, id);
  const S = (H && H.states) || {};
  const st = actif ? S[id] || null : null;
  const reelle = phaseRobot(domaine, st ? st.state : null);
  const change = st ? st.last_changed || null : null;
  const { etat } = useEtatRobots(actif, { rapide });
  const bipe = useBipe(actif ? id : null);
  const enVol = useGeste(actif ? id : null, reelle, change);
  if (!actif) return null;
  const maintenant = Date.now();
  // Muet : la règle de toute la maison (`enPanne`) ; un geste n'y change rien.
  const panne = enPanne(id, st);
  const geste = panne ? null : enVol;
  const phase = panne ? 'absent' : geste ? geste.phase || reelle : reelle;
  const a = (st && st.attributes) || {};
  const sansZone = aires.length > 0 && !aires.some(x => S[x] && S[x].state === 'on');
  // L'attribut d'abord, la sœur ensuite ; bornée de 0 à 100, et une valeur vide est inconnue — pas « 0 % » (passe bis du 18/10, point 8).
  const batterie = batterieRobot(a, idBat && S[idBat] ? S[idBat].state : null);
  const charge = !!(idCharge && S[idCharge] && S[idCharge].state === 'on');
  const carnet = vueCarnetRobot(etat, id, maintenant, departRobot(id, maintenant), { sansZone });
  // Le carnet porte exactement ce que la phrase lit : `pieces`, `tout`, `libelle`, `erreur`, `prochain`.
  const phrase = phraseRobot({ domaine, phase, depuis: st && st.last_changed, bipe, ...carnet, charge, sansZone, maintenant });
  const service = (svc) => { commanderService(H, id, domaine, svc, { entity_id: id }); apresCommandeRobot(); };
  /* Le geste en vol, l'avance partagée : `cle` (la puce), la phase qu'il annonce, la phase réelle d'avant lui et son `last_changed` ;
   * `mot` : celui de la puce de la popup (« Nettoyer 2 pièces ») ; `garde` : un départ par le serveur, tenu jusqu'à sa réponse.
   * Rend son jeton : un refus n'oublie que lui (`oublier`). */
  const poser = (cle, { mot = null, garde = false } = {}) => poserGeste(id, { cle, phase: PHASE_GESTE[cle] || null, depuis: reelle, mot, change },
    FILET_ROBOT_MS + HASS_POLL_MS, { garde: garde ? GARDE_DEPART_MS : 0 });
  const oublier = (jeton) => oublierGeste(id, jeton);
  // Le geste est-il permis MAINTENANT ? Lu au magasin à l'appui même : un second appui arrive avant que l'écran ne se redessine.
  const permis = (cle) => !enPanne(id, st) && gestePermis(cle, gesteEnVol(id, reelle, change));
  const agir = (p) => {
    if (p.enVol || !permis(p.cle)) return;
    if (p.cle === 'demarrer') {
      // Jamais `start_mowing` sans aire allumée (point D) : le serveur le refuserait, et le repli direct ne part pas non plus.
      if (sansZone) return;
      const jeton = poser('demarrer', { garde: true });
      lancerRobot(H, id, [], { geste: jeton, direct: () => commanderService(H, id, domaine, p.service, { entity_id: id }) })
        .catch((e) => { oublier(jeton); signalerRobot(e); });
    } else if (p.cle === 'localiser') {
      // Le geste partagé, sans garde (passe bis 2 du 20/10) : un second appui ne rebipe pas, rien d'autre n'est retenu ; refusé, il tombe.
      const j = poser('localiser');
      localiserRobot(H, id, domaine).then((ok) => ok || oublier(j));
    } else { poser(p.cle); service(p.service); }
  };
  return {
    id, domaine, st, hass: H, nom: label || a.friendly_name || id, phase, batterie, charge, phrase, carnet, etat, bipe, sansZone,
    travail: phase === 'travail', panne, teinte: TEINTE_ROBOT[domaine] || TEINTE_ROBOT.vacuum,
    cmd: commandesEnVol(domaine, phase, a.supported_features, geste, { depart: !sansZone }).map(p => ({ ...p, agir: () => agir(p) })),
    // Pour la popup : le geste en vol (le même que celui de la carte), le poser — son jeton rendu —, l'oublier, et savoir s'il en
    // permet un autre.
    geste, avancer: poser, oublier, permis,
  };
}

/* Le chiffre NOMMÉ d'une carte large (I6) : la batterie en grand — 25 px / 800, « % » en 15 — et son nom dessous, en petites
 * capitales (10 px / 800, `--o-text3`) : 25 + 5 + 10 = 40 px, la hauteur de la rangée. À la première rangée, deuxième colonne de
 * `RM_MILIEU`, aligné sur le bas du nom et de la phrase. Sa couleur : la règle des piles (`couleurPile`) — neutre, sauf sous le
 * seuil. Caché au lecteur d'écran : la surface le dit. */
function ChiffreNomme({ v, u = '%', nom, couleur = 'var(--o-text)' }) {
  return (
    <span aria-hidden="true" className="o-seul-large" style={{ gridColumn: 2, gridRow: 1, marginLeft: 10, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 3, fontWeight: 800, lineHeight: 1, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: couleur }}>
        <span style={{ fontSize: 25, letterSpacing: '-.02em' }}>{v}</span><span style={{ fontSize: 15 }}>{u}</span>
      </span>
      <span style={{ ...petitesCapitales(10), marginTop: 5, lineHeight: '10px', whiteSpace: 'nowrap' }}>{nom}</span>
    </span>
  );
}
/* Le même, sur la carte ÉTROITE : en haut à droite, le chiffre de la grille (`ChiffreHaut`, 22 px) et son nom en 9,5 px dessous —
 * 22 + 2 + 11 = 35 px, dans les 38 de la plaque (I6). Le nom s'y écrit en minuscules, comme les étiquettes de 1c. La marge du chiffre
 * passe de 4 à 3 px (passe bis du 18/10, point 16) : 4 + 35 = 39 grandissait la rangée du haut d'un pixel, et un nom sur deux lignes
 * poussait le pied hors des 150 px de contenu ; 3 + 35 = 38, la hauteur de la plaque. */
function ChiffreNommeHaut({ v, u = '%', nom, couleur = 'var(--o-text)' }) {
  return (
    <span aria-hidden="true" className="o-seul-etroit" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
      <ChiffreHaut v={v} u={u} couleur={couleur} haut={3} />
      <span style={{ fontSize: 9.5, fontWeight: 700, lineHeight: '11px', marginTop: 2, color: 'var(--o-text3)', whiteSpace: 'nowrap' }}>{nom}</span>
    </span>
  );
}

/* La plaque d'un robot (I8), sur sa carte comme en tête de sa fiche : la teinte à 0,18 au travail ; au repos le gris doux ; muet, le
 * gris éteint. Rend `[fond, encre]`. */
const plaqueRobot = (v) => (v.panne ? ['var(--o-s1)', 'var(--o-text3)'] : v.travail ? ['rgba(' + v.teinte[0] + ',.18)', v.teinte[1]] : ['var(--o-s1)', 'var(--o-text1)']);

function RoomRobotCard({ id, hass, onOpen, label = null }) {
  const v = useVueRobot(hass, id, label);
  const dom = v.domaine;
  const [fond, encrePlaque] = plaqueRobot(v);
  // Une batterie d'avant la panne ne se donne pas pour vraie.
  const pile = v.panne ? null : v.batterie;
  const couleur = couleurPile(pile, 'var(--o-text)');
  const n = v.cmd.length;
  return (
    /* La carte n'est pas un bouton (ADR 0074) : la surface, premier enfant, dit ce que la carte affiche — le nom, la phrase, la
     * batterie — et les puces, positionnées, passent au-dessus d'elle. */
    <div className={'o-rmcard o-gabarit' + (v.panne ? ' o-panne' : '')} data-robot="" style={{ ...RM_CARD, position: 'relative', cursor: onOpen ? 'pointer' : 'default',
      ...(v.travail && LAVIS ? { background: lavisCarte(v.teinte[0], .14, .03) } : null), border: LISERE }}>
      {onOpen && <Surface onClick={() => onOpen(id)} label={nomCarte(v.nom, v.phrase.texte, pile == null ? null : tr('batterie {p} %', { p: pile }))} />}
      {/* La ligne du haut : la plaque, et la batterie nommée de la carte étroite. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <span style={RM_ICO(fond, encrePlaque)}><GlypheCarte id={id} size={17}><Ico name={dom === 'vacuum' ? 'vacuum' : 'mower'} size={17} /></GlypheCarte></span>
        {pile != null && <ChiffreNommeHaut v={pile} nom={tr('Batterie')} couleur={couleur} />}
      </div>
      {/* La rangée du milieu, 10 px sous la plaque : le nom et la phrase à gauche — sur une carte étroite, toute la largeur, la phrase
        * de 12 à 10,5 px selon sa longueur (`--o-n`) —, la batterie nommée de la carte large à droite. */}
      <div style={{ ...RM_MILIEU, marginTop: 'var(--o-milieu-haut, 10px)' }}>
        <div style={{ minWidth: 0 }}>
          <div className="o-gab-nom" style={{ ...RM_NAME, fontSize: 15 }}>{v.nom}</div>
          <div className="o-gab-phrase" style={{ ...RM_SUB, color: v.phrase.encre, '--o-n': Math.max(1, v.phrase.texte.length) }}>{v.phrase.texte}</div>
        </div>
        {pile != null && <ChiffreNomme v={pile} nom={tr('Batterie')} couleur={couleur} />}
      </div>
      {/* Le pied (I9), collé en bas par la marge auto : une ou deux puces qui se partagent la largeur. Deux n'ont que leur glyphe
        * sous 200 px de contenu (index.css) ; le mot reste dans leur nom, qui nomme aussi l'appareil — « Pause Tondeuse ». */}
      {n > 0 && (
        <div className="o-puces-robot" data-n={n} style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 'var(--o-pied-haut, 9px)' }}>
          {/* Un geste en vol (passe bis du 18/10, point 1) : sa puce reste à sa place, choisie, et ne fait plus rien (`aria-disabled`,
            * le focus reste) — un second appui ne la retourne pas. */}
          {v.cmd.map(p => (
            <button key={p.cle} type="button" aria-label={p.mot + ' ' + v.nom} title={p.mot} aria-disabled={p.enVol ? 'true' : undefined} onClick={(e) => { e.stopPropagation(); p.agir(); }}
              className="o-rmbtn" style={{ ...RM_PUCE_ROBOT, ...(p.choisie ? RM_PUCE_CHOISIE : null) }}>
              <Fi i={p.glyphe} size={14} /><span className="o-puce-robot-mot">{p.mot}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export { RM_PUCE_ROBOT, RM_PUCE_CHOISIE, localiserRobot, useVueRobot, ChiffreNomme, ChiffreNommeHaut, plaqueRobot, RoomRobotCard };
