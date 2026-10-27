/* ── La fiche d'un robot : aspirateur ou tondeuse (ADR 0042 ; chantier IoT, étape 1 — I15, I16, I2 A, I4 A) ──
 *
 * UNE fiche pour les deux robots, une FEUILLE à onglets — Accueil, Planning (si
 * le composant répond), Historique, Entretien (s'il a une pièce ou un
 * compteur) — sur le socle commun des fiches (`fichecommune.jsx`, ADR 0155) :
 * l'en-tête (la plaque aux couleurs de la carte, le nom, « {pièce} · robot
 * aspirateur », l'épingle, la roue des réglages — elle reste, I4 A — et UNE
 * croix), la barre d'onglets au motif ARIA, les panneaux, la page des réglages.
 *
 * L'Accueil est « Où, puis go » (sa maquette « Cartes IoT », 1b ; I16) : le mot
 * d'état et sa phrase, la batterie ; « OÙ », une puce par pièce — seulement si
 * Loggia sait commander des pièces —, la puce principale et la seconde ; « Voir
 * la carte » (I2 A), qui ouvre le plan du logement dans une SECONDE feuille ;
 * deux tuiles, et l'entretien qui presse. L'onglet Carte d'avant part : la
 * carte est un « où » de plus.
 *
 * La fiche reçoit la VUE de la carte (`useVueRobot`, App.jsx) : la phase et
 * l'avance d'un geste, la phrase, les puces, la batterie, « Il bipe », le
 * carnet du serveur (robotsetat.js, 15 s fiche ouverte) — la carte et la fiche
 * disent la même chose. Un départ nouveau part par le serveur (`lancerRobot`),
 * qui note les pièces ; un script maison (`vacuumScripts`) passe devant, comme
 * avant. Rien sans source : un onglet sans donnée n'existe pas, et aucune pièce,
 * surface ni durée n'est inventée.
 *
 * Chargée à la demande par `FicheRobot` (App.jsx) ; elle emporte le plan du
 * logement (`vacplan.jsx`), demandé seulement si le robot publie une carte.
 */
import { useState, useEffect, useRef, useMemo, useId, Suspense } from 'react';
import { lazyRecharge } from './recharge.js';
import { tr, trSens, locale, comparerTextes } from './i18n.js';
import { Fi, Bascule, BottomSheet, TitreFeuille, nomCarte, ListeChoix } from './ui.jsx';
import { LOGGIA_INDEX, loggiaEnt, vacRooms, vacOption, compteOrdinaire, cfgVal } from './state.js';
import { commanderService } from './actions.js';
import { useLoggia, useEntities } from './runtime.js';
import { premierJourSemaine } from './horloge.js';
import { petitesCapitales, LISERE } from './styles.js';
import { estRefus, raisonEchec, enregistrerRefus } from './refus.js';
import { REFUS_ROBOTS } from './refusrobots.js';
import { lancerRobot, lireEtatRobots, poserEtatRobots, apresCommandeRobot, signalerRobot } from './robotsetat.js';
import { glyphePile } from './piles.js';
import { couleurPile } from './attention.js';
import { BITS_ROBOT, serviceRetour, dureeLisible, ordreJours, heureValide, dansLaPlage, nomJour } from './robots.js';
import {
  decrireSoeurs, commandeZones, zonesTondeuse, piecesUsure, alerteEntretien, phraseEntretien, compteursRobot, sessionsRobot,
  rangeesHistorique, reglagesRobot, ficheTechnique, resumeZones, zonePlanning, nouveauPlanning, capteurPluie, decalerHeure,
  etatAccueil, libelleDepart, sessionsCarnet, septJours, tuileProchain, tuileSemaine, nomDeScript, passageRetenu,
  piecesDeLaVue, lignesPieces, commandeZonesHA, passagesRobot, publieRooms,
  ROLES_SCRIPTS, libelleRole, scriptDepartDesigne, scriptVivant, optionsScripts,
} from './robotsfiche.js';
import {
  PETITES_CAPITALES, CHAMP_HEURE, LIGNE, SOUS, filet, BoutonConfirme, PasAPas, PuceJour,
  EnteteFiche, FicheOnglets, PanneauOnglet, PageReglagesAppareil, OngletEntretien, focaliser,
} from './fichecommune.jsx';

/* Les refus d'un départ (`loggia/robots/lancer`, chantier IoT, I3 A) : un
 * robot muet ou déjà en route, des pièces que son intégration ne sait pas
 * viser, une zone qui n'est pas la sienne — enregistrés au chargement de la
 * fiche, comme ceux du chauffage : le démarrage n'en porte rien
 * (refusrobots.js). */
enregistrerRefus(REFUS_ROBOTS);

/* Par `lazyRecharge` (audit du 03/10) : un plan qu'une mise à jour HACS a
 * retiré pendant que la page restait ouverte recharge la page une fois, au
 * lieu de faire tomber tout l'écran. */
const VacPlan = lazyRecharge(() => import('./vacplan.jsx'));

/* Les panneaux de sa maquette (§ 7.5) : `--o-s3`, le liseré du réglage, rayon 18, 12 px entre eux. */
const PANNEAU = { background: 'var(--o-s3)', border: LISERE, borderRadius: 18, padding: 18, boxSizing: 'border-box', minWidth: 0 };
/* Le cadre d'une tuile de l'Accueil : celui d'un panneau, sans sa marge — index.css la tient, et la change au téléphone. */
const CADRE_TUILE = { background: 'var(--o-s3)', border: LISERE, borderRadius: 18, boxSizing: 'border-box', minWidth: 0 };
// Les puces de 48 px de l'Accueil (§ 7.6) : la principale en accent — le bleu plein et le blanc —, la seconde en gris doux. Leur
// corps et leur marge vivent dans index.css (`.rb-a-puce`) : au téléphone, la place les change, sans priorité forcée (tâche 13).
// Le rayon 10, celui de la puce de sa maquette (`ChipButton` ; passe bis du 18/10, point 13).
const PUCE_GRANDE = { height: 48, borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, minWidth: 0 };
const PUCE_PRINCIPALE = { ...PUCE_GRANDE, flex: 1, background: 'var(--o-accent-fond)', color: '#fff' };
const PUCE_SECONDE = { ...PUCE_GRANDE, flexShrink: 0, background: 'var(--o-s1)', color: 'var(--o-text1)' };

/* L'historique d'état du robot, lu une fois puis à chaque changement d'état (une
 * session qui finit doit apparaître) — la source de l'Historique quand le
 * composant n'a pas de carnet. Home Assistant REMPLACE `hass` à chaque état :
 * l'appel lit le `hass` du moment par une référence vivante. */
function useHistoriqueRobot(hass, idRobot, idSurface, etat, jours = 14) {
  const [reponse, setReponse] = useState(null);
  const hRef = useRef(hass);
  useEffect(() => { hRef.current = hass; });
  const connecte = !!(hass && typeof hass.callApi === 'function');
  useEffect(() => {
    if (!connecte || !idRobot) { setReponse(null); return undefined; }
    let vivant = true;
    const debut = new Date(Date.now() - jours * 86400000).toISOString();
    const ids = [idRobot, idSurface].filter(Boolean).join(',');
    hRef.current.callApi('GET', 'history/period/' + debut + '?filter_entity_id=' + encodeURIComponent(ids) + '&end_time=' + encodeURIComponent(new Date().toISOString()) + '&minimal_response&no_attributes')
      .then(r => { if (vivant) setReponse(Array.isArray(r) ? r : []); })
      .catch(() => { if (vivant) setReponse('erreur'); });
    return () => { vivant = false; };
  }, [connecte, idRobot, idSurface, etat, jours]);
  return reponse;
}

/* ════════════ L'accueil du robot (1b ; I16, § 7.6) ════════════ */

/* Une puce de « Où » (44 px, 12,5 / 700, 0 12px, le rayon 10 de sa maquette) : choisie, le bleu plein et le blanc (règle des puces) ;
 * son point de 8 px — la couleur de la pièce, qui la relie au plan — devant, à 7 px. Inerte au travail : elle montre ce qui se
 * nettoie, sans opacité, le gris de texte pour les autres. Grille des pièces (26/10, ADR 0218) : elle prend TOUTE la largeur de sa
 * case (ou de la ligne, pour « Tout »), 44 px de haut partout — une cible tactile ; un nom trop long se coupe sur sa ligne, en
 * points de suspension, et garde son nom entier en `title` et en `aria-label`. */
const PuceOu = ({ on, inerte = false, couleur = null, onClick, children }) => (
  <button type="button" onClick={inerte ? undefined : onClick} aria-pressed={on} aria-disabled={inerte || undefined}
    title={typeof children === 'string' ? children : undefined} aria-label={typeof children === 'string' ? children : undefined}
    style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 7, width: '100%', minWidth: 0, height: 44, padding: '0 12px', borderRadius: 10, border: 'none', cursor: inerte ? 'default' : 'pointer',
      boxSizing: 'border-box', textAlign: 'left', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap', background: on ? 'var(--o-accent-fond)' : 'var(--o-s1)', color: on ? '#fff' : inerte ? 'var(--o-text2)' : 'var(--o-text1)' }}>
    {couleur && <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: couleur, flexShrink: 0 }} />}
    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</span>
  </button>
);

/* La grille des pièces (26/10) : des colonnes de largeur ÉGALE, autant qu'il en tient à 104 px au moins — deux au téléphone (popup de
 * 360 à 390 px), trois dans la popup de bureau. Mesuré en démo, à 320, 360, 390 et 1280 px de large (ADR 0218). Pas de cadre : la
 * grille est posée dans le panneau de tête, comme les puces avant elle. */
const GRILLE_PIECES = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 8, marginTop: 12 };

/* Une tuile de l'Accueil (14 × 16) : son nom 12 / 700 au gris secondaire, la valeur 20 / 800, la ligne 12 / 600 ; elle ouvre un
 * onglet. Sans onglet où mener (pas de Planning), elle n'est pas un bouton : un bouton qui ne fait rien ne s'offre pas. */
function Tuile({ nom, titre, sous, onClick }) {
  const Balise = onClick ? 'button' : 'div';
  // Sa marge et le corps de sa valeur (20 / 800, UNE ligne) : index.css (`.rb-a-tuile`, `.rb-a-tuile-titre`), que le téléphone règle.
  return (
    <Balise {...(onClick ? { type: 'button', onClick } : null)} className="rb-a-tuile" style={{ ...CADRE_TUILE, cursor: onClick ? 'pointer' : 'default', textAlign: 'left', fontFamily: 'inherit', color: 'inherit' }}>
      <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--o-text2)' }}>{nom}</span>
      <span className="rb-a-tuile-titre">{titre}</span>
      <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sous}</span>
    </Balise>
  );
}

function OngletAccueil({ vue, etat, zones, choisir, enRoute, toutChoisi, basculerZone, toutPrendre, principale, seconde, aUneCarte, ouvrirCarte, prochain, semaine, alerte, allerA, retenu = null, lignes = [] }) {
  return (
    <div className="rb-accueil" style={{ gap: 12 }}>
      {/* Le panneau de tête (18 px) : le mot d'état et sa phrase, la batterie à droite ; muet, le liseré qui respire — un seul signal. */}
      <div className={'rb-a-hero' + (vue.panne ? ' o-panne' : '')} style={PANNEAU}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.15, color: etat.encre }}>{etat.mot}</div>
            {etat.phrase && <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--o-text2)', marginTop: 6 }}>{etat.phrase}</div>}
          </div>
          {vue.batterie != null && !vue.panne && (
            <div aria-label={tr('batterie {p} %', { p: vue.batterie })} role="img" style={{ flexShrink: 0, textAlign: 'right' }}>
              {/* La règle unique des piles (`couleurPile`, ADR 0206), comme la carte : neutre, sauf sous le seuil (passe bis du 18/10, point 8). */}
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 3, fontWeight: 800, lineHeight: 1, color: couleurPile(vue.batterie, 'var(--o-text)') }}>
                <Fi i={glyphePile(vue.batterie)} size={14} color="var(--o-text3)" style={{ marginRight: 4 }} />
                <span style={{ fontSize: 25, letterSpacing: '-.02em' }}>{vue.batterie}</span><span style={{ fontSize: 15 }}>%</span>
              </div>
              <div style={{ ...petitesCapitales(10), marginTop: 5 }}>{tr('Batterie')}</div>
            </div>
          )}
        </div>
        {/* « OÙ » : seulement si Loggia sait commander des pièces (I16). « Tout le logement » est choisie quand aucune pièce ne l'est.
          * Muet, rien ne se choisit : le départ ne partirait pas — « Où » ne se dessine pas (passe bis du 18/10, point 12). */}
        {choisir && zones.length > 0 && !vue.panne && (<>
          <div style={{ ...PETITES_CAPITALES, marginTop: 18 }}>{tr('Où')}</div>
          {/* « Tout le logement » (« Tout le jardin ») sur toute la ligne, à part ; puis la grille des pièces, un peu d'air entre les deux
            * (26/10). L'ordre du DOM est l'ordre visuel : la tabulation suit les lignes de la grille. */}
          <div className="rb-a-ou-tout" style={{ marginTop: 8 }}>
            <PuceOu on={toutChoisi} inerte={enRoute} onClick={toutPrendre}>{vue.domaine === 'lawn_mower' ? tr('Tout le jardin') : tr('Tout le logement')}</PuceOu>
          </div>
          <div className="rb-a-pieces" style={GRILLE_PIECES}>
            {zones.map(z => <PuceOu key={z.id} on={!!z.choisie} inerte={enRoute || z.inerte} couleur={z.couleur} onClick={() => basculerZone(z)}>{z.nom}</PuceOu>)}
          </div>
        </>)}
        {/* Les lignes de « Où » (tranche robots 2, § 3.1 ; `lignesPieces`) : sous les puces, ou à leur place — ses scripts qui gardent
          * la main, l'association à faire dans Home Assistant, la carte refaite (en ambre), des pièces sur une autre carte. Rien sans
          * raison. Muet, rien : le liseré est le seul signal. */}
        {!vue.panne && lignes.map((l, i) => (
          <div key={l.cle + i} className="rb-a-ligne" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 12, fontSize: 12, fontWeight: 600, lineHeight: 1.45, color: l.encre }}>
            <Fi i={l.glyphe} size={12} style={{ marginTop: 2, flexShrink: 0 }} /><span style={{ minWidth: 0 }}>{l.texte}</span>
          </div>
        ))}
        {/* Au téléphone (index.css, sous 360 px de panneau), la seconde ne garde que son glyphe — son mot reste son nom — et la
          * principale passe en 13 px : « Nettoyer tout le logement » tient sur sa ligne. */}
        {/* Un geste en vol (passe bis du 18/10, point 1) : sa puce garde son mot, choisie, et ne fait rien (`aria-disabled` : le focus
          * reste), jusqu'à la réponse de Home Assistant. Une puce sans geste possible n'est pas là (point 12) : rien d'inerte. */}
        {(principale || seconde) && <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          {principale && (
            <button type="button" className="rb-a-puce rb-a-principale" onClick={principale.agir || undefined}
              aria-disabled={principale.enVol ? 'true' : undefined} style={PUCE_PRINCIPALE}>
              <Fi i={principale.glyphe} size={14} /><span className="rb-a-libelle">{principale.mot}</span>
            </button>
          )}
          {seconde && (
            <button type="button" className="rb-a-puce rb-a-seconde" onClick={seconde.agir || undefined} aria-disabled={seconde.enVol ? 'true' : undefined} aria-label={seconde.mot} title={seconde.mot}
              style={{ ...PUCE_SECONDE, ...(seconde.choisie ? { background: 'var(--o-accent-fond)', color: '#fff' } : null) }}>
              <Fi i={seconde.glyphe} size={13} /><span className="rb-a-mot">{seconde.mot}</span>
            </button>
          )}
        </div>}
      </div>

      {/* La carte du logement (I2 A) : une rangée à chevron, qui l'ouvre dans une seconde feuille. */}
      {aUneCarte && (
        <button type="button" onClick={ouvrirCarte} style={{ ...PANNEAU, ...LIGNE, padding: '14px 16px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: 'inherit', width: '100%' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0 }}><Fi i="map" size={15} color="var(--o-text2)" /><span style={{ fontSize: 14, fontWeight: 700 }}>{tr('Voir la carte')}</span></span>
          <Fi i="angle-small-right" size={16} color="var(--o-text3)" />
        </button>
      )}

      <div className="rb-a-tuiles" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
        <Tuile nom={tr('Prochain passage')} titre={prochain.titre} sous={prochain.sous} onClick={prochain.onglet ? () => allerA(prochain.onglet) : null} />
        <Tuile nom={tr('7 derniers jours')} titre={semaine.titre} sous={semaine.sous} onClick={() => allerA('historique')} />
      </div>

      {/* Un passage du planning RETENU récemment (passe bis 2 du 18/10, point I) : une ligne sobre, qui ouvre le Planning — on y règle
        * ce qui l'a retenu. Seulement s'il y en a eu un ce dernier jour, et si aucun n'est parti depuis. */}
      {retenu && (
        <button type="button" className="rb-a-retenu" onClick={() => allerA('planning')}
          style={{ ...PANNEAU, ...LIGNE, padding: '12px 16px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: 'inherit', width: '100%' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <Fi i="calendar-clock" size={15} color="var(--o-text2)" />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--o-text1)', minWidth: 0 }}>{tr('Passage de {h} retenu : {pourquoi}', { h: retenu.heure, pourquoi: retenu.pourquoi })}</span>
          </span>
          <Fi i="angle-small-right" size={16} color="var(--o-text3)" />
        </button>
      )}

      {/* L'entretien qui presse (sous 35 %) : l'ambre à 0,08, son filet à 0,3 ; il ouvre l'Entretien. */}
      {alerte && (
        <button type="button" className="rb-a-alerte" onClick={() => allerA('entretien')}
          style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 14px 12px 16px', borderRadius: 18, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: 'inherit',
            background: 'rgba(var(--o-warn-rgb),.08)', border: '1px solid rgba(var(--o-warn-rgb),.3)' }}>
          <Fi i="triangle-warning" size={15} color="var(--o-warn)" />
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700 }}>{tr('{nom} à {n} % · à changer bientôt', { nom: alerte.nom, n: alerte.pct })}</span>
          <Fi i="angle-small-right" size={16} color="var(--o-text3)" />
        </button>
      )}
    </div>
  );
}

/* Une zone choisie : bleu plein, texte blanc, comme toute puce choisie
 * (retour du 18/09). Sa couleur reste en petit carre — c'est elle qui la
 * relie a la carte, comme dans la liste des zones. */
const Puce = ({ on, children, onClick, disabled = false, couleur = null }) => (
  <button type="button" onClick={onClick} aria-pressed={on} disabled={disabled}
    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 15px', borderRadius: 12, cursor: disabled ? 'default' : 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap', opacity: disabled ? .5 : 1,
      border: '1px solid ' + (on ? 'transparent' : 'var(--o-bd2)'),
      background: on ? 'var(--o-accent-fond)' : 'var(--o-s2)',
      color: on ? '#fff' : 'var(--o-text1)' }}>
    {couleur && <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 3, background: couleur, flexShrink: 0 }} />}
    {children}
  </button>
);


/* ════════════ L'historique (I19 ; sa maquette 1d) ════════════
 *
 * Les sept jours GLISSANTS — Passages, Durée, Surface (si le robot la publie) —, puis la liste : la session en cours en tête, puis
 * chaque passage, avec ses pièces, son heure et sa durée, son motif et son issue (`rangeesHistorique`). Les barres de la semaine
 * du calendrier partent. La source : le carnet du serveur (I3 A), sinon l'historique d'état. */

function OngletHistorique({ rangees, resume, uniteSurface = 'm²', chargee, erreur = false }) {
  // Un historique qui ne se lit pas n'est pas un historique vide (audit 18/09).
  if (erreur) return <div role="alert" style={{ ...PANNEAU, fontSize: 13, fontWeight: 600, color: 'var(--o-text2)' }}>{tr('Historique indisponible pour le moment')}</div>;
  if (!chargee) return <div style={{ ...PANNEAU, fontSize: 13, fontWeight: 600, color: 'var(--o-text2)' }}>{tr('Lecture de l’historique…')}</div>;
  // L'unité DU capteur, jamais « m² » écrit en dur : « 500 m² » pour des pieds carrés (audit du 03/10).
  const chiffres = [[tr('Passages'), String(resume.n)], [tr('Durée'), dureeLisible(resume.dureeMin)], ...(resume.surface != null ? [[tr('Surface'), resume.surface + ' ' + uniteSurface]] : [])];
  return (
    <div className="rb-histo" style={{ gap: 12 }}>
      <div style={{ ...PANNEAU, padding: '16px 18px' }}>
        <div style={PETITES_CAPITALES}>{tr('7 derniers jours')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(' + chiffres.length + ', minmax(0, 1fr))', gap: 12, marginTop: 10 }}>
          {chiffres.map(([nom, v]) => (
            <div key={nom}><div style={{ fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{v}</div><div style={{ fontSize: 12, color: 'var(--o-text2)', marginTop: 2 }}>{nom}</div></div>
          ))}
        </div>
      </div>
      <div style={{ ...PANNEAU, padding: 0, overflow: 'hidden' }}>
        {rangees.length === 0 && <div style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600, color: 'var(--o-text2)' }}>{tr('Aucun passage ces 7 derniers jours.')}</div>}
        {rangees.map((r, i) => (
          <div key={r.cle} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: filet(i) }}>
            <span style={{ width: 44, height: 36, borderRadius: 10, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--o-s1)', fontSize: 11.5, fontWeight: 800, color: 'var(--o-text1)' }}>{r.badge}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.quoi}</div>
              <div style={{ fontSize: 12, color: 'var(--o-text2)', marginTop: 2 }}>{r.ligne}</div>
              {r.motif && <div style={{ fontSize: 11.5, color: 'var(--o-text3)', marginTop: 2 }}>{r.motif}</div>}
            </div>
            <div style={{ flexShrink: 0, textAlign: 'right' }}>
              {r.surface != null && <div style={{ fontSize: 14, fontWeight: 800 }}>{r.surface + ' ' + uniteSurface}</div>}
              <div style={{ fontSize: 11.5, fontWeight: 700, color: r.encre, marginTop: r.surface != null ? 2 : 0 }}>{r.mot}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ════════════ L'entretien (I20 ; sa maquette 1d) ════════════
 *
 * La brique est celle du socle commun (`OngletEntretien`, fichecommune.jsx), que le distributeur reprend telle quelle (passe bis de
 * l'étape 2, 19/10) : la phrase seulement quand une pièce presse (passe bis du 18/10, point 15 : jamais de « Tout va bien »
 * permanent), une rangée par pièce, « Remplacé » qui DEMANDE, puis les compteurs. Le robot lui passe ses pièces d'usure
 * (`piecesUsure` : un bouton indisponible est écarté), ses compteurs et sa phrase (`phraseEntretien`). */

/* ════════════ Le planning (I18 ; sa maquette 1c) ════════════
 *
 * Aucun robot ne publie son planning : c'est Loggia qui le tient, côté serveur,
 * et qui lance le robot à l'heure (ADR 0043). L'onglet n'existe que si le
 * composant répond. Le planning PRÉVIENT : un passage pris dans « Ne pas
 * déranger » le dit, en ambre, et le prochain passage de l'Accueil le saute ;
 * la plage se dit en clair et se règle par pas de 30 min ; tant qu'un passage
 * est actif, une ligne rappelle que l'application du fabricant ne doit pas en
 * programmer aussi. Un compte ordinaire LIT le planning, sans rien régler (le
 * planning est de la configuration de Loggia, que le composant garde aux
 * administrateurs — ADR 0144) ; la pluie de l'appareil reste à tous : c'est
 * une commande de l'appareil. */

const REGLAGES_NEUFS = { calme: { actif: false, debut: '22:00', fin: '07:00' }, pluie: { actif: false } };
// « De − 22:00 + à − 07:00 + » : l'heure en 15 / 800 sur 52 px ; les puces de 40 px, nommées par ce qu'elles font.
const HEURE_PLAGE = { minWidth: 52, textAlign: 'center', fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums' };
const MOT_PLAGE = { fontSize: 12, fontWeight: 700, color: 'var(--o-text3)' };
const PasHeure = ({ nom, glyphe, onClick }) => (
  <button type="button" aria-label={nom} title={nom} onClick={onClick || undefined} disabled={!onClick}
    style={{ width: 40, height: 40, borderRadius: 10, border: 'none', padding: 0, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      cursor: onClick ? 'pointer' : 'default', background: 'var(--o-s1)', color: 'var(--o-text1)', opacity: onClick ? 1 : .4 }}><Fi i={glyphe} size={14} /></button>
);
/* Un jour d'un passage (sa maquette 1c ; passe bis du 18/10, point 13) : la puce de sa maquette (`ChipButton`), PLEINE LARGEUR de sa
 * colonne, 34 px de haut, le rayon 10, la lettre du jour en 11,5 / 800 — nommée par le jour entier ; choisi, le bleu plein et le
 * blanc ; d'un passage éteint, à demi effacée. Plus les pastilles rondes communes (`PuceJour`) : la feuille d'un passage les garde. */
const JourPassage = ({ j, on, onClick, disabled = false, attenue = false }) => (
  <button type="button" onClick={disabled ? undefined : onClick} aria-pressed={on} disabled={disabled} aria-label={nomJour(j, locale(), 'long')} title={nomJour(j, locale(), 'long')}
    style={{ width: '100%', height: 34, borderRadius: 10, border: 'none', padding: 0, cursor: disabled ? 'default' : 'pointer', fontSize: 11.5, fontWeight: 800, fontFamily: 'inherit',
      opacity: attenue ? .5 : 1, background: on ? 'var(--o-accent-fond)' : 'var(--o-s1)', color: on ? '#fff' : 'var(--o-text1)' }}>{nomJour(j, locale(), 'narrow')}</button>
);

/* La forme d'une zone de passage (R5) : une zone de Home Assistant, ou des segments (la forme d'avant) ; un passage ne mêle pas les
 * deux — le serveur le refuserait (`lire_zones`). */
const formeZone = (z) => (z && typeof z.zone === 'string' && z.zone ? 'zone' : 'segments');

function FeuillePlanning({ depart, neuf, zones, domaine, aDesAires, onEnregistrer, onSupprimer, onClose }) {
  const [p, setP] = useState(depart);
  const jours = ordreJours(premierJourSemaine(locale()));
  const basculerJour = (j) => setP(x => ({ ...x, jours: x.jours.indexOf(j) >= 0 ? x.jours.filter(y => y !== j) : [...x.jours, j].sort() }));
  /* Un passage d'avant s'édite encore (passe bis du 20/10, point 2) : ses zones ABSENTES des puces (ses segments d'alors, quand les
   * puces sont devenues les zones de Home Assistant) se montrent, choisies, avec leurs noms d'alors — toucher l'une la retire ; et
   * toucher une puce d'une AUTRE forme remplace l'ancienne forme au lieu de la mêler, que le serveur refuserait. */
  const absentes = (p.zones || []).filter(y => !zones.some(z => z.id === y.id)).map(y => ({ id: y.id, nom: y.nom || y.id, couleur: null, absente: true }));
  const basculerZone = (z) => setP(x => {
    if (x.zones.some(y => y.id === z.id)) return { ...x, zones: x.zones.filter(y => y.id !== z.id) };
    const neuve = zonePlanning(z);
    return { ...x, zones: [...x.zones.filter(y => formeZone(y) === formeZone(neuve)), neuve] };
  });
  const valide = heureValide(p.heure) && p.jours.length > 0;
  return (
    <BottomSheet onClose={onClose}>
      {close => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <TitreFeuille style={{ fontSize: 19, fontWeight: 700 }}>{neuf ? tr('Nouveau passage') : tr('Modifier le passage')}</TitreFeuille>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontSize: 14.5, fontWeight: 700 }}>{tr('Heure')}</span>
            <input type="time" value={p.heure} aria-label={tr('Heure')} onChange={(e) => setP(x => ({ ...x, heure: e.target.value }))} style={CHAMP_HEURE} />
          </div>
          <div>
            <div style={{ ...PETITES_CAPITALES, marginBottom: 9 }}>{tr('Jours')}</div>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>{jours.map(j => <PuceJour key={j} j={j} taille={38} on={p.jours.indexOf(j) >= 0} onClick={() => basculerJour(j)} />)}</div>
          </div>
          {(zones.length > 0 || absentes.length > 0) && (
            <div>
              <div style={{ ...PETITES_CAPITALES, marginBottom: 9 }}>{tr('Zones')}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[...zones, ...absentes].map(z => <Puce key={z.id} on={p.zones.some(y => y.id === z.id)} couleur={z.couleur} onClick={() => basculerZone(z)}>{z.nom}</Puce>)}
              </div>
              {p.zones.length === 0 && <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--o-text2)', marginTop: 9 }}>{resumeZones(p, { domaine, aDesAires })}</div>}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {!neuf && <BoutonConfirme libelle={tr('Supprimer')} onConfirme={() => { onSupprimer(p); close(); }} />}
            {/* Cette feuille se pose dans <body>, hors de la fiche (`.rb-aspirateur`, `.rb-tondeuse`) : les jetons du robot (`--rb-*`)
              * n'y existent pas — « Enregistrer » était peint de rien, du blanc sur le fond en thème clair. Le bleu plein du thème
              * (passe bis du 18/10, point 11). */}
            <button type="button" disabled={!valide} onClick={() => { onEnregistrer(p); close(); }}
              style={{ flex: 1, padding: '14px 12px', borderRadius: 14, border: 'none', cursor: valide ? 'pointer' : 'default', fontSize: 14.5, fontWeight: 800, fontFamily: 'inherit', background: 'var(--o-accent-fond)', color: '#fff', opacity: valide ? 1 : .45 }}>{tr('Enregistrer')}</button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

function OngletPlanning({ hass, domaine, robot, zones, planning }) {
  const { etat, setEtat, err, setErr, vivant } = planning;
  const [feuille, setFeuille] = useState(null); // { p, neuf }
  const cfg = (etat && etat.config) || { plannings: [], robots: {} };
  const tous = cfg.plannings || [];
  const miens = tous.filter(p => p.robot === robot.id).sort((a, b) => comparerTextes(String(a.heure), String(b.heure)));
  const reglages = { ...REGLAGES_NEUFS, ...((cfg.robots || {})[robot.id] || {}) };
  const calme = reglages.calme;
  const aDesAires = domaine === 'lawn_mower' && zones.length > 0;
  const pluieNative = domaine === 'lawn_mower' ? capteurPluie(robot.soeurs) : null;
  const jours = ordreJours(premierJourSemaine(locale()));
  const h = hass && typeof hass.callWS === 'function' ? hass : null;
  const ordinaire = compteOrdinaire(hass);

  const enregistrer = async (patch, optimiste) => {
    if (!h || ordinaire) return;
    setEtat(e => (e ? { ...e, config: optimiste(e.config || { plannings: [], robots: {} }) } : e));
    try {
      const r = await h.callWS({ type: 'loggia/robots/config', patch });
      if (vivant.current && r && r.config) { setEtat(e => (e ? { ...e, config: r.config } : e)); setErr(''); }
    } catch (e) {
      // Un planning de trop se dit par son code, dans la langue de l'écran ; un passage dont la forme est refusée (`invalid_format` :
      // deux formes de zones mêlées, une heure illisible) se dit d'une phrase traduite, jamais du motif brut du composant (passe bis
      // du 20/10, point 2) ; le motif n'en sort qu'en dernier recours, dans une phrase traduite (audit du 03/10, refus.js).
      setErr(e && e.code === 'unauthorized' ? tr('Réservé aux administrateurs.') : e && e.code === 'invalid_format' ? tr('Passage non enregistré — sa forme n’est pas celle que le composant attend.')
        : estRefus(e) ? raisonEchec(e) : tr('Enregistrement impossible.'));
    }
  };
  const poserPlannings = (liste) => enregistrer({ plannings: liste }, c => ({ ...c, plannings: liste }));
  const poserPlanning = (p) => poserPlannings(tous.some(x => x.id === p.id) ? tous.map(x => (x.id === p.id ? p : x)) : [...tous, p]);
  const retirerPlanning = (p) => poserPlannings(tous.filter(x => x.id !== p.id));
  const poserReglage = (cle, valeur) => enregistrer({ robots: { [robot.id]: { [cle]: valeur } } },
    c => ({ ...c, robots: { ...(c.robots || {}), [robot.id]: { ...reglages, [cle]: { ...reglages[cle], ...valeur } } } }));
  // Un pas de 30 min ; celui qui rendrait la plage vide (début = fin : elle ne retiendrait plus rien) ne s'offre pas.
  const pas = (cle, minutes) => {
    const suite = decalerHeure(calme[cle], minutes);
    return suite === calme[cle === 'debut' ? 'fin' : 'debut'] ? null : () => poserReglage('calme', { [cle]: suite });
  };
  const filetPanneau = { marginTop: 14, paddingTop: 14, borderTop: 'var(--o-bw,1px) solid var(--o-bd3)', display: 'flex', alignItems: 'center', gap: 12 };

  return (
    <div className="rb-planning" style={{ gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <div style={PETITES_CAPITALES}>{tr('Passages planifiés')}</div>
          {!ordinaire && (
            <button type="button" onClick={() => setFeuille({ p: nouveauPlanning(robot.id), neuf: true })}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', padding: '12px 0', margin: '-12px 0', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 800, color: 'var(--o-accent-soft)' }}><Fi i="add" size={12} />{tr('Ajouter')}</button>
          )}
        </div>
        {err && <div role="alert" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--o-bad)' }}>{err}</div>}
        {miens.length === 0 && <div style={{ ...PANNEAU, padding: '14px 16px', fontSize: 13, fontWeight: 600, color: 'var(--o-text2)' }}>{tr('Aucun passage planifié. Loggia lance le robot à l’heure dite, même écran éteint.')}</div>}
        {miens.map(p => {
          const retenu = p.actif && dansLaPlage(reglages.calme, p.heure);
          const zonesTxt = resumeZones(p, { domaine, aDesAires });
          // Éteint : l'heure au gris de texte éteint (sa maquette), les jours en retrait.
          const lignes = (<>
            <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums', color: p.actif ? 'var(--o-text)' : 'var(--o-text3)' }}>{p.heure}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{zonesTxt}</div>
          </>);
          return (
            <div key={p.id} role="group" aria-label={tr('Passage de {h}', { h: p.heure })} style={{ ...PANNEAU, padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {/* Son nom est ce qu'il affiche, l'heure puis les zones (lot 13
                  * de l'audit du 03/10) : « Modifier le passage 09:00 » taisait
                  * les zones, et ses mots ne sont pas sur la carte (WCAG 2.5.3).
                  * Ce qu'il fait, la feuille le dit en titre. */}
                {ordinaire ? <div style={{ flex: 1, minWidth: 0 }}>{lignes}</div> : (
                  <button type="button" onClick={() => setFeuille({ p, neuf: false })} aria-label={nomCarte(p.heure, zonesTxt)} aria-haspopup="dialog"
                    style={{ flex: 1, minWidth: 0, textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', color: 'inherit' }}>{lignes}</button>
                )}
                {!ordinaire ? <Bascule on={!!p.actif} nom={tr('Passage de {h}', { h: p.heure })} cb={() => poserPlanning({ ...p, actif: !p.actif })} />
                  : !p.actif ? <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--o-text3)' }}>{tr('Éteint')}</span> : null}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6, marginTop: 12 }}>
                {jours.map(j => <JourPassage key={j} j={j} disabled={ordinaire} attenue={!p.actif} on={(p.jours || []).indexOf(j) >= 0}
                  onClick={() => poserPlanning({ ...p, jours: (p.jours || []).indexOf(j) >= 0 ? p.jours.filter(y => y !== j) : [...(p.jours || []), j].sort() })} />)}
              </div>
              {retenu && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12, fontWeight: 700, color: 'var(--o-warn)' }}>
                  <Fi i="triangle-warning" size={12} /><span>{tr('Dans « Ne pas déranger » : ce passage n’aura pas lieu.')}</span>
                </div>
              )}
            </div>
          );
        })}
        {/* Deux programmateurs lanceraient deux fois : celui du fabricant se coupe (I18). */}
        {miens.some(p => p.actif) && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', lineHeight: 1.45 }}>{tr('Si l’application du fabricant programme aussi des passages, coupez-les : sinon il part deux fois.')}</div>}
      </div>

      <div style={{ ...PANNEAU, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{tr('Ne pas déranger')}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 2 }}>{calme.actif ? tr('Aucun départ entre {a} et {b}', { a: calme.debut, b: calme.fin }) : tr('Les passages partent à toute heure')}</div>
          </div>
          {!ordinaire && <Bascule on={!!calme.actif} nom={tr('Ne pas déranger')} cb={() => poserReglage('calme', { actif: !calme.actif })} />}
        </div>
        {!ordinaire && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <span style={{ ...MOT_PLAGE, width: 22 }}>{tr('De')}</span>
            <PasHeure nom={tr('Début plus tôt')} glyphe="minus-small" onClick={pas('debut', -30)} />
            <span style={HEURE_PLAGE}>{calme.debut}</span>
            <PasHeure nom={tr('Début plus tard')} glyphe="plus-small" onClick={pas('debut', 30)} />
            <span style={{ ...MOT_PLAGE, marginLeft: 10 }}>{tr('à')}</span>
            <PasHeure nom={tr('Fin plus tôt')} glyphe="minus-small" onClick={pas('fin', -30)} />
            <span style={HEURE_PLAGE}>{calme.fin}</span>
            <PasHeure nom={tr('Fin plus tard')} glyphe="plus-small" onClick={pas('fin', 30)} />
          </div>
        )}
        {/* La pluie, sous « Ne pas déranger ». Le robot a son capteur : c'est LUI
          * qui rentre, l'interrupteur est le sien. Sinon la météo de la maison
          * retient le départ — et sans météo, rien à proposer. */}
        {pluieNative && (
          <div style={filetPanneau}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>{tr('Capteur de pluie')}</span>
              <span style={SOUS}>{tr('Le robot rentre de lui-même s’il pleut')}</span>
            </span>
            <Bascule on={pluieNative.actif} nom={tr('Capteur de pluie')} cb={() => commanderService(hass, pluieNative.id, 'switch', pluieNative.actif ? 'turn_off' : 'turn_on', { entity_id: pluieNative.id })} />
          </div>
        )}
        {domaine === 'lawn_mower' && !pluieNative && etat && etat.meteo && (
          <div style={filetPanneau}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>{tr('Pluie')}</span>
              <span style={SOUS}>{tr('Pas de départ planifié quand la météo annonce la pluie')}</span>
            </span>
            {!ordinaire ? <Bascule on={!!reglages.pluie.actif} nom={tr('Pluie')} cb={() => poserReglage('pluie', { actif: !reglages.pluie.actif })} />
              : !reglages.pluie.actif ? <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--o-text3)' }}>{tr('Éteint')}</span> : null}
          </div>
        )}
      </div>

      {feuille && <FeuillePlanning depart={feuille.p} neuf={feuille.neuf} zones={zones} domaine={domaine} aDesAires={aDesAires}
        onEnregistrer={poserPlanning} onSupprimer={retirerPlanning} onClose={() => setFeuille(null)} />}
    </div>
  );
}

/* ════════════ Les scripts de la maison, dans la roue (sa décision du 20/10 : « Mon script garde la main ») ════════════
 *
 * Une rangée par rôle (`ROLES_SCRIPTS`) : le script désigné pour l'aspirateur PRINCIPAL, lu dans l'ÉTAT que le serveur rend
 * (`pieces[robot].scripts`, sa vérité ; un serveur d'avant, la description que l'écran tient). Un administrateur choisit dans une
 * `ListeChoix` — les scripts de Home Assistant, ceux du robot en tête — et le RÔLE part SEUL au serveur (`loggia/robots/scripts`,
 * passe bis 2 du 20/10), qui le fond dans la description de la maison TELLE QU'ELLE EST SUR LE DISQUE. La roue écrivait
 * `loggia_entities` ENTIÈRE par `cfgSet` depuis le cache de l'onglet — vide ou périmé tant que `loggia/config/get` n'avait pas
 * répondu (l'application mobile, un navigateur neuf) —, et une désignation depuis un onglet lent effaçait les dix-neuf autres clés
 * de sa maison (relecture de contrôle du 20/10). Plus rien de la description ne quitte l'écran : rien ne peut rendre `null`, et la
 * copie du navigateur ne repart jamais ; l'état rendu se pose (`poserEtatRobots`), les autres écrans relisent la clé que le serveur
 * leur signale (ADR 0067). Tant que le composant n'a pas répondu (`pret` : son état est là — la notion de l'onglet Planning), les
 * rangées ATTENDENT : désactivées, `aria-disabled`, « … » à la place d'un « Aucun » qui mentirait. Un compte ordinaire lit les
 * rangées sans rien régler (ADR 0144) ; chaque refus du serveur dit SA raison (`raisonEchec` : `unauthorized` nomme la clé
 * « loggia_entities », un plafond dit « trop volumineux », un composant d'avant « ne répond pas »).
 * Des RANGÉES du panneau des réglages de l'appareil (l'emplacement `avant` de `PageReglagesAppareil`, sous la puissance), pas un
 * panneau à part : un emplacement de plus dans `fichecommune.jsx` coûtait neuf octets au démarrage, et la borne ne se relève pas. */
const CHAMP_CHOIX = { flex: '0 1 240px', minWidth: 120, padding: '8px 12px', borderRadius: 12, border: 'var(--o-bw,1px) solid var(--o-bd2)', background: 'var(--o-s2)', color: 'var(--o-text1)', fontSize: 13, fontWeight: 700 };
// Un composant d'avant cette passe (`unknown_command`), ou dont le module des robots n'a pas démarré : la roue n'a personne à qui parler.
const SANS_ROUE = new Set(['unknown_command', 'not_available']);

function PanneauScripts({ hass, scripts, ordinaire = false, pret = false }) {
  const [err, setErr] = useState('');
  const S = (hass && hass.states) || {};
  const designes = scripts && typeof scripts === 'object' ? scripts : {};
  const options = optionsScripts(S, designes);
  const nomDe = (id) => (id && S[id] && S[id].attributes && S[id].attributes.friendly_name) || id || tr('Aucun');
  // Le rôle seul part ; l'état rendu — les rôles désignés compris — remplace celui du magasin, pour la carte comme pour la fiche.
  const designer = (role, id) => {
    setErr('');
    if (!pret || !hass || typeof hass.callWS !== 'function') { setErr(tr('Enregistrement impossible — le composant ne répond pas.')); return; }
    Promise.resolve(hass.callWS({ type: 'loggia/robots/scripts', role, script: id || null }))
      .then((etat) => { poserEtatRobots(etat); })
      .catch((e) => setErr(e && SANS_ROUE.has(e.code) ? tr('Enregistrement impossible — le composant ne répond pas.') : raisonEchec(e, 'loggia_entities')));
  };
  const filetRangee = 'var(--o-bw,1px) solid var(--o-bd3)';
  return (
    <div role="group" aria-label={tr('Scripts de la maison')}>
      <div style={{ padding: '14px 18px 8px', borderTop: filetRangee }}>
        <div style={PETITES_CAPITALES}>{tr('Scripts de la maison')}</div>
        <div style={{ ...SOUS, marginTop: 4, lineHeight: 1.45 }}>{tr('Désignez vos scripts par rôle : Loggia les lance, et vous gardez la main sur les pièces.')}</div>
      </div>
      {ROLES_SCRIPTS.map((role, i) => (
        <div key={role} aria-disabled={pret ? undefined : 'true'} style={{ ...LIGNE, borderTop: i ? filetRangee : 'none' }}>
          <span style={{ fontSize: 14.5, fontWeight: 700, minWidth: 0, overflowWrap: 'anywhere', color: pret ? undefined : 'var(--o-text3)' }}>{libelleRole(role)}</span>
          {ordinaire
            ? <span style={{ fontSize: 13, fontWeight: 700, color: pret && designes[role] ? 'var(--o-text1)' : 'var(--o-text3)', textAlign: 'right', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pret ? nomDe(designes[role]) : '…'}</span>
            : <ListeChoix label={libelleRole(role)} value={pret ? designes[role] || '' : ''} options={pret ? options : []} vide="…" disabled={!pret} onChange={(id) => designer(role, id)} style={CHAMP_CHOIX} />}
        </div>
      ))}
      {err && <div role="alert" style={{ padding: '4px 18px 12px', fontSize: 12.5, fontWeight: 700, color: 'var(--o-bad)' }}>{err}</div>}
    </div>
  );
}

/* ════════════ La vue ════════════ */

/* Ce que la carte et la fiche partagent (`useVueRobot`, App.jsx) arrive par `vue` ; la coquille passe aussi la plaque de la carte et
 * « {pièce} · robot aspirateur » (`sousNom`). Sans robot (l'entité a disparu) : l'en-tête, qui dit qu'il ne répond plus. */
export default function FicheRobotContent({ hass, idRobot, domaine = 'vacuum', vue, plaque = null, sousNom = null, onFiche = null, epingle = null }) {
  const S = (hass && hass.states) || {};
  const { resolved } = useLoggia();
  const entVac = useEntities('vacuum', null) || {};
  const entRooms = useEntities('vacuumRooms', null);
  const entScripts = useEntities('vacuumScripts', null);
  /* Ses pièces et ses scripts (`loggia_entities`) : la description de la maison que l'écran tient (`useEntities`), sinon la table du
   * serveur (`loggiaEnt`), sinon ce que le stockage de l'appareil en garde (`cfgVal`) — chez lui les trois disent la même chose ; la
   * démo, sans serveur, n'a que la dernière (tranche robots 2, variante `scripts`). */
  const descrLocale = cfgVal('loggia_entities', null) || {};
  const rooms = entRooms || loggiaEnt('vacuumRooms', null) || descrLocale.vacuumRooms || [];
  const st = idRobot ? S[idRobot] : null;
  const soeurs = decrireSoeurs(LOGGIA_INDEX, S, idRobot);
  const meta = LOGGIA_INDEX && idRobot ? LOGGIA_INDEX.entityMeta.get(idRobot) : null;
  const appareil = meta && meta.deviceId && LOGGIA_INDEX.deviceMeta ? LOGGIA_INDEX.deviceMeta.get(meta.deviceId) : null;
  const plateforme = meta ? meta.platform : null;
  const nom = vue.nom;
  const robot = { id: idRobot, st, soeurs, nom };

  const vac = domaine === 'vacuum' && resolved && resolved.vacuum && resolved.vacuum.available && resolved.vacuum.main === idRobot ? resolved.vacuum : null;
  const idCarte = domaine === 'vacuum' ? ((vac && vac.map) || (entVac.map && S[entVac.map] ? entVac.map : null) || (soeurs.find(s => s.domaine === 'image') || {}).id || null) : null;
  const idSurface = (vac && vac.area_cleaned) || (soeurs.find(s => s.domaine === 'sensor' && (s.classe === 'area' || /^(m²|m2|ft²|sq ft)$/.test(s.unite || '')) && !/total/.test(s.texte)) || {}).id || null;
  // L'unite reelle du capteur (m² ou ft² selon l'installation), jamais supposee.
  const uniteSurface = (idSurface && S[idSurface] && S[idSurface].attributes && S[idSurface].attributes.unit_of_measurement) || 'm²';
  // La caméra de l'aspirateur n'est plus ici (sa réponse du 18/10, « Elle part de la popup ») : elle reste dans Sécurité.

  /* Les zones. Aspirateur : les pièces que le robot annonce, rattachées aux zones configurées (interrupteur, couleur). Tondeuse : les
   * interrupteurs d'aire de son appareil — ses sœurs visibles : une aire masquée n'en est pas une, ici comme au serveur. Le choix
   * reste DANS la fiche (I16) : choisir une aire n'allume plus son interrupteur ; c'est le départ qui allume les choisies et éteint
   * les autres, comme le planning. Seuls les interrupteurs de pièces d'un script maison (`vacuumScripts`) se basculent sur-le-champ :
   * c'est ce que lit le script — la règle d'aujourd'hui.
   * UNE règle pour « où » d'une tondeuse (passe bis du 18/10, point 2) : jamais Loggia ne rallume une aire que la personne n'a pas
   * touchée. Ses puces partent PRÉ-CHOISIES selon les aires allumées (`choixLocal` nul : rien n'est touché, elles suivent la maison) ;
   * « Tout le jardin » les choisit toutes, explicitement ; aucune choisie, pas de départ. */
  const pieces = domaine === 'vacuum' ? vacRooms(hass, idRobot, rooms) : [];
  const aires = domaine === 'lawn_mower' ? zonesTondeuse(soeurs) : [];
  /* Les pièces selon Home Assistant (tranche robots 2 ; R2, R3, ADR 0218) : ce que le serveur lit de l'association de l'entité —
   * les ZONES de Home Assistant, la source 2 —, derrière ses scripts (sa réponse Q1 A : ils gardent la main) et devant ce que le robot
   * publie (la source 3). Un serveur d'avant cette tranche n'a pas `pieces` : la règle d'aujourd'hui, corrigée du bit et de la liste
   * (R1, R4). */
  const piecesServeur = domaine === 'vacuum' && vue.etat && vue.etat.pieces && typeof vue.etat.pieces === 'object' ? vue.etat.pieces[idRobot] || null : null;
  /* Les scripts maison (`vacuumScripts`) sont ceux de l'aspirateur PRINCIPAL (celui du serveur, ci-dessous) et de lui seul (passe bis 2 du
   * 18/10, point C) : la popup d'un autre aspirateur ne les montre pas, et le serveur les lui refuserait (`script_inconnu`). L'ÉTAT du
   * serveur d'abord (`pieces[robot].scripts`, passe bis 2 du 20/10 : ce que la roue vient d'écrire s'y lit sur-le-champ, et le cache de
   * la description n'a plus voix au chapitre), sinon la description que l'écran tient — un serveur d'avant, la démo. */
  const designesServeur = piecesServeur && piecesServeur.scripts && typeof piecesServeur.scripts === 'object' ? piecesServeur.scripts : null;
  /* L'aspirateur principal est celui que le SERVEUR retient (`principal` de son état, petit paquet du 25/10) : la découverte prend le
   * premier aspirateur (`resolved.vacuum.main`), le serveur aucun quand deux aspirateurs n'en nomment pas — et l'écran proposait des
   * scripts qu'il ignorait. Sans réponse du serveur, aucun script ; la roue ATTEND seulement, désactivée, sur celui que l'écran résout. */
  const etatServeur = vue.etat && typeof vue.etat === 'object' ? vue.etat : null;
  const principal = domaine === 'vacuum' && !!etatServeur && etatServeur.principal === idRobot;
  const roue = etatServeur ? principal : !!vac;
  const scripts = principal ? (designesServeur || entScripts || loggiaEnt('vacuumScripts', null) || descrLocale.vacuumScripts || {}) : {};
  /* Sa décision du 20/10 (« Mon script garde la main ») : dès qu'un script de DÉPART est désigné et présent (`scriptDepart` :
   * 'pieces' ou 'depart'), Loggia ne prend jamais la main sur les pièces — ni zones de Home Assistant, ni pièces publiées. Les puces
   * sont ses interrupteurs quand le script des pièces est désigné et qu'une pièce en a un ; sinon, aucune puce, et une ligne dit à un
   * administrateur où désigner (la roue). La même règle qu'au serveur (`_script_depart`), des mêmes mots. */
  const scriptDepart = domaine === 'vacuum' ? scriptDepartDesigne(scripts, S) : null;
  const parInterrupteurs = scriptDepart === 'pieces' && pieces.some(p => p.toggle);
  const parZones =!scriptDepart && !!piecesServeur && Array.isArray(piecesServeur.zones) && piecesServeur.zones.length > 0;
  const bits = Number(st && st.attributes && st.attributes.supported_features) || 0;
  const [choixLocal, setChoixLocal] = useState(null); // id de pièce ou d'aire → vrai ; null : rien de touché
  const choixAires = choixLocal || Object.fromEntries(aires.filter(a => a.actif).map(a => [a.id, true]));
  // La commande des pièces publiées : celle de l'intégration, bornée par le bit, la version de Home Assistant et `rooms` (R1, R4, Q2 A).
  const commande = (segments) => commandeZones({ plateforme, services: LOGGIA_INDEX && LOGGIA_INDEX.services, idRobot, segments, bits,
    versionHa: hass && hass.config ? hass.config.version : null, publie: publieRooms(st), passages: passagesRobot(soeurs) });
  /* Chez Ecovacs, la liste que le robot publie fait foi (Q2) : sans `rooms` publié à l'instant, aucune puce par commande — le serveur
   * refuserait le départ (`pieces_perimees`), et une puce qui ne part pas n'existe pas (passe bis du 20/10, point 7). */
  const parCommande = domaine === 'vacuum' && !scriptDepart && !parZones && pieces.some(p => (p.segments || []).length)
    && (plateforme !== 'ecovacs' || publieRooms(st)) && !!commande([1]);
  const choisir = domaine === 'lawn_mower' ? aires.length > 0 : (parInterrupteurs || parZones || parCommande);
  const enRoute = vue.phase === 'travail' || vue.phase === 'pause' || vue.phase === 'retour';
  // Les passages du carnet du serveur (I3 A) ; null : un composant d'avant ce chantier, l'historique d'état les remplace.
  const duCarnet = sessionsCarnet(vue.etat, idRobot);
  // Au travail, les puces montrent ce qui se nettoie : les zones du passage, au carnet.
  const enCours = (duCarnet || []).find(x => x.issue === 'en_cours') || null;
  const duPassage = new Set(enCours ? enCours.zones.map(z => z.id) : []);
  /* Les zones de Home Assistant en puces (R6) : leur nom ; la teinte et l'icône CHOISIES d'une pièce de Loggia du même nom
   * (`loggia_rooms`, lu ici, à la demande — rien au démarrage), sinon la couleur d'une pièce configurée, sinon la palette ; les pièces
   * de Loggia d'abord, dans leur ordre (§ 3.1). */
  const zonesHA = parZones ? piecesDeLaVue(piecesServeur, rooms, cfgVal('loggia_rooms', null), LOGGIA_INDEX) : [];
  /* Une pièce que Loggia ne sait pas viser n'est pas une puce (passe bis du 18/10, point 6) : sans segment, la commande de
   * l'intégration ne la vise pas — choisie, elle faisait partir le robot pour tout le logement ; sans interrupteur, le script
   * maison ne la lit pas. */
  // Un aspirateur sans « Où » (rien à choisir) n'a aucune zone : rien d'inerte, ni ici ni dans la seconde feuille.
  const zones = domaine === 'lawn_mower'
    ? aires.map(z => ({ id: z.id, nom: z.nom, couleur: null, inerte: false, choisie: enRoute ? duPassage.has(z.id) : !!choixAires[z.id] }))
    : !choisir ? []
      : parZones ? zonesHA.map(z => ({ ...z, inerte: false, choisie: enRoute ? duPassage.has(z.id) : !!(choixLocal && choixLocal[z.id]) }))
        : pieces.filter(p => (parInterrupteurs ? !!p.toggle : (p.segments || []).length > 0)).map(p => ({ id: p.id, nom: p.name, couleur: p.color || null, piece: p, inerte: false,
          choisie: enRoute && !parInterrupteurs ? duPassage.has(p.id) : parInterrupteurs ? !!(p.toggle && S[p.toggle] && S[p.toggle].state === 'on') : !!(choixLocal && choixLocal[p.id]) }));
  const nChoisies = zones.filter(z => z.choisie).length;
  // Une tondeuse dont TOUTES les aires sont choisies « tond tout le jardin » ; un aspirateur sans pièce choisie nettoie tout le logement.
  const toutLeJardin = domaine === 'lawn_mower' && zones.length > 0 && nChoisies === zones.length;
  // Ce qu'un PLANNING peut viser : le serveur n'a ni script maison ni sélection à l'écran — il lui faut les zones de Home Assistant
  // (R5), ou les segments et une intégration qu'il sait commander. Un script de départ désigné : aucune (sa décision du 20/10 — le
  // serveur retiendrait le passage ; la feuille n'en propose pas).
  const zonesPlanifiables = domaine === 'lawn_mower' || parZones ? zones : scriptDepart ? [] : (commande([1]) ? zones.filter(z => ((z.piece && z.piece.segments) || []).length > 0) : []);
  const appel = (d, s, data) => commanderService(hass, (data || {}).entity_id, d, s, data || {});
  const basculerZone = (z) => {
    if (!choisir || z.inerte || enRoute) return;
    if (parInterrupteurs) appel('input_boolean', z.choisie ? 'turn_off' : 'turn_on', { entity_id: z.piece.toggle });
    else if (domaine === 'lawn_mower') setChoixLocal(s => { const base = s || choixAires; return { ...base, [z.id]: !base[z.id] }; });
    else setChoixLocal(s => ({ ...(s || {}), [z.id]: !(s && s[z.id]) }));
  };
  // « Tout le logement » : aucune pièce — tout se nettoie ; « Tout le jardin » : TOUTES les aires visibles, choisies (point 2).
  const toutPrendre = () => {
    if (enRoute) return;
    if (parInterrupteurs) zones.filter(z => z.choisie && z.piece.toggle).forEach(z => appel('input_boolean', 'turn_off', { entity_id: z.piece.toggle }));
    else if (domaine === 'lawn_mower') setChoixLocal(Object.fromEntries(aires.map(a => [a.id, true])));
    else setChoixLocal({});
  };

  /* Les gestes. Un script maison fait souvent plus que le service standard : on le garde quand il existe (`vacuumScripts`), et l'on
   * retombe sinon sur le service du domaine, disponible chez tout le monde ; l'avance du geste se dit sur la carte comme ici.
   * Le script part PAR LE SERVEUR (passe bis du 18/10, point A ; sa réponse « Par le serveur ») : `loggia/robots/lancer` le lance
   * s'il est celui de ce RÔLE (`role`, la clé de Paramètres — passe bis 2, point J), sous les droits de la personne, et un départ par
   * script note au carnet son nom (« Nettoyer la buanderie ») ; un serveur d'avant ce chantier : en direct, comme avant. Ce qui part
   * par le serveur garde son geste jusqu'à sa réponse (point E). Refusé, SON geste retombe — pas celui qui l'a remplacé (point F) —,
   * et le refus va au toast, sa phrase avec. */
  const refusDe = (jeton) => (e) => { vue.oublier(jeton); signalerRobot(e); };
  const nomRobot = (st && st.attributes && st.attributes.friendly_name) || nom;
  /* Les lignes de « Où » (tranche robots 2, § 3.1) : ses scripts qui gardent la main, le script des pièces à désigner (sa décision du
   * 20/10), l'association à faire, la carte refaite, une autre carte. Un serveur d'avant cette tranche n'a pas `pieces` : seules les
   * lignes des scripts, que l'écran sait seul, se disent alors. */
  const lignes = domaine === 'vacuum' ? lignesPieces({ pieces: piecesServeur || (scriptDepart ? {} : null), admin: !compteOrdinaire(hass), nomRobot, parInterrupteurs,
    scriptDepart: !!scriptDepart, scriptPieces: scriptDepart === 'pieces' }) : [];
  const parScript = (sc, role, jeton, { zones: visees = [] } = {}) => {
    const estDepart = role === 'nettoyer_tout' || role === 'pieces_selectionnees';
    return lancerRobot(hass, idRobot, visees, { script: sc, role, depart: estDepart, geste: jeton, libelle: estDepart ? nomDeScript(S[sc], nomRobot) : null,
      direct: () => appel('script', 'turn_on', { entity_id: sc }) }).catch(refusDe(jeton));
  };
  // Un geste de la popup : son script maison par le serveur, gardé jusqu'à sa réponse, s'il en a un ; sinon le service du domaine.
  const gesteOu = (cle, role, service) => {
    const sc = domaine === 'vacuum' ? scripts[role] : null;
    if (scriptVivant(S, sc)) parScript(sc, role, vue.avancer(cle, { garde: true }));
    else { vue.avancer(cle); appel(domaine, service, { entity_id: idRobot }); }
    apresCommandeRobot();
  };
  const depart = domaine === 'lawn_mower' ? 'start_mowing' : 'start';
  /* Un départ NOUVEAU part par le serveur (I3 A) : il envoie la commande de l'intégration et note les pièces au carnet, pour tous
   * les écrans ; un serveur d'avant ce chantier, en direct. Une tondeuse : ses aires choisies — « Tout le jardin », toutes ses
   * aires —, que le serveur allume avant de tondre en éteignant les autres (point 2) ; en direct, chaque bascule ATTENDUE avant
   * `start_mowing` (Home Assistant répond quand le service a fini). */
  const appelAttendu = (d, s, data) => Promise.resolve(hass && typeof hass.callService === 'function' ? hass.callService(d, s, data) : null);
  const lancer = () => {
    // Un geste en vol (passe bis du 18/10, point 1) : un second appui — un doigt qui hésite, un double-clic — ne relance rien.
    if (!vue.permis('demarrer')) return;
    const choisies = zones.filter(z => z.choisie);
    // Une tondeuse à aires sans aire choisie ne part jamais (passe bis 2 du 18/10, point D) : pas de `start_mowing` d'ici non plus.
    if (domaine === 'lawn_mower' && aires.length && !choisies.length) return;
    /* La puce garde le mot de son départ tant qu'il vole : « Nettoyer 2 pièces », pas « Mettre en pause » sous le doigt — et tant
     * que le serveur n'a pas répondu (sa garde, point E). Son jeton : un refus n'oublie que lui (point F). */
    const jeton = vue.avancer('demarrer', { mot: libelleDepart(domaine, choisir && !toutLeJardin ? nChoisies : 0), garde: true });
    const refus = refusDe(jeton);
    if (domaine === 'lawn_mower') {
      const visees = choisies.map(z => ({ id: z.id, nom: z.nom, segments: [] }));
      lancerRobot(hass, idRobot, visees, { tout: toutLeJardin || !aires.length, geste: jeton, direct: async () => {
        const ids = visees.map(z => z.id);
        if (ids.length) {
          await appelAttendu('switch', 'turn_on', { entity_id: ids });
          const autres = aires.map(a => a.id).filter(a => ids.indexOf(a) < 0);
          if (autres.length) await appelAttendu('switch', 'turn_off', { entity_id: autres });
        }
        appel('lawn_mower', depart, { entity_id: idRobot });
      } }).catch(refus);
      setChoixLocal(null);
      return;
    }
    if (choisies.length) {
      // Les pièces choisies par leurs interrupteurs : le script des pièces, par le serveur, avec leurs noms (point A).
      if (parInterrupteurs) {
        parScript(scripts.pieces_selectionnees, 'pieces_selectionnees', jeton, { zones: choisies.map(z => ({ id: z.id, nom: z.nom, segments: [] })) });
        apresCommandeRobot();
        return;
      }
      /* Des ZONES de Home Assistant (tranche robots 2, R4, R5) : par le serveur, qui vérifie l'association avant d'appeler
       * `vacuum.clean_area` et note les zones au carnet ; un serveur sans `lancer`, en direct par le même service — le bit est là. */
      if (parZones) {
        const visees = choisies.map(z => ({ id: z.id, nom: z.nom, segments: [], zone: z.zone }));
        const c = commandeZonesHA({ idRobot, zones: visees });
        lancerRobot(hass, idRobot, visees, { geste: jeton, direct: () => appel(c.domaine, c.service, c.data) }).catch(refus);
        setChoixLocal(null);
        return;
      }
      // Des pièces qu'il ne sait pas viser ne retombent JAMAIS sur « tout le logement » (point 6) : le départ se refuse, comme au serveur.
      // Chez Ecovacs, une liste que le robot ne publie plus à l'instant est une liste PÉRIMÉE avant tout (passe bis du 20/10, point 3).
      if (plateforme === 'ecovacs' && !publieRooms(st)) { refus(Object.assign(new Error('liste des pieces perimee : ' + idRobot), { code: 'pieces_perimees' })); return; }
      const c = choisies.every(z => ((z.piece && z.piece.segments) || []).length) ? commande(choisies.flatMap(z => z.piece.segments || [])) : null;
      if (!c) { refus(Object.assign(new Error('pieces inconnues : ' + idRobot), { code: 'pieces_inconnues' })); return; }
      lancerRobot(hass, idRobot, choisies.map(z => ({ id: z.id, nom: z.nom, segments: z.piece.segments || [] })), { geste: jeton, direct: () => appel(c.domaine, c.service, c.data) }).catch(refus);
      setChoixLocal(null);
      return;
    }
    const sc = scripts.nettoyer_tout;
    if (scriptVivant(S, sc)) { parScript(sc, 'nettoyer_tout', jeton); apresCommandeRobot(); return; }
    lancerRobot(hass, idRobot, [], { geste: jeton, direct: () => appel('vacuum', depart, { entity_id: idRobot }) }).catch(refus);
  };
  /* La puce principale et la seconde (I16, § 7.6) : partir — « Nettoyer 2 pièces » — sur la base, à l'arrêt ou en erreur ; « Mettre
   * en pause » au travail ; « Reprendre » en pause et au retour. La seconde : « Localiser » sur la base (si le bit), « Base » sinon —
   * choisie pendant le retour. Chacune selon les bits de l'appareil (la vue de la carte). Une puce sans geste possible ne se dessine
   * pas (passe bis du 18/10, point 12), comme sur la carte : muet, ou un bit qui manque, elle vaut null — plus de puce inerte. */
  const puce = (cle) => vue.cmd.find(p => p.cle === cle) || null;
  // Partir : le bit de départ de l'appareil — en erreur aussi, la popup offre de repartir (la carte, elle, n'offre que la base).
  const peutPartir = !!(bits & (BITS_ROBOT[domaine] || BITS_ROBOT.vacuum).demarrer);
  const pause = puce('pause'), reprendre = puce('reprendre'), base = puce('base'), localiser = puce('localiser');
  /* Le geste en vol (passe bis du 18/10, point 1) : celui de la carte, au magasin partagé (`vue.geste`). La puce qui l'a lancé reste
   * sur lui — son mot, choisie, sans rien faire — jusqu'à la réponse de Home Assistant : deux appuis sur « Mettre en pause » ne
   * relancent pas le robot. Chaque geste se demande au magasin à l'appui même (`vue.permis`). */
  const enVol = vue.geste;
  // Chaque geste se demande au magasin à l'appui même (`vue.permis`) ; son script maison, s'il en a un, part avec son rôle (point J).
  const geste = (cle, role, service) => () => { if (vue.permis(cle)) gesteOu(cle, role, service); };
  const MOT_GESTE = { pause: () => tr('Mettre en pause'), reprendre: () => tr('Reprendre'), demarrer: () => libelleDepart(domaine, 0) };
  const principale = vue.panne ? null
    : enVol && MOT_GESTE[enVol.cle] ? { mot: enVol.mot || MOT_GESTE[enVol.cle](), glyphe: enVol.cle === 'pause' ? 'pause' : 'play', enVol: true, agir: null }
      : vue.phase === 'travail' ? (pause ? { mot: tr('Mettre en pause'), glyphe: 'pause', agir: geste('pause', 'pause', 'pause') } : null)
        : vue.phase === 'pause' || vue.phase === 'retour' ? (reprendre ? { mot: tr('Reprendre'), glyphe: 'play', agir: geste('reprendre', 'reprendre', depart) } : null)
          // Une tondeuse sans aire choisie ne part pas (point 2) : la puce ne s'offre pas — « Tout le jardin » est là pour tout choisir.
          : !peutPartir || (domaine === 'lawn_mower' && choisir && nChoisies === 0) ? null
            : { mot: libelleDepart(domaine, choisir && !toutLeJardin ? nChoisies : 0), glyphe: 'play', agir: lancer };
  /* « Localiser » : le geste de la carte (`localiserRobot`, App.jsx — passe bis 2 du 20/10) : son script maison s'il en désigne un qui
   * répond, sinon `locate`, et « Il bipe » à la réponse ; le geste partagé SANS garde — en vol, la puce ne fait rien (un second appui ne
   * rebipe pas), et « Nettoyer tout le logement » reste offert. Un script gardé bloquait le départ sept secondes, la puce inerte. */
  const seconde = vue.panne ? null
    : enVol && enVol.cle === 'base' ? { mot: tr('Base'), glyphe: 'home', choisie: true, enVol: true, agir: null }
      : vue.phase === 'base' ? (localiser ? { mot: tr('Localiser'), glyphe: 'marker', enVol: !!localiser.enVol, agir: localiser.enVol ? null : localiser.agir } : null)
        : base ? { mot: tr('Base'), glyphe: 'home', choisie: base.choisie, agir: geste('base', 'retour_base', serviceRetour(domaine)) } : null;

  // L'historique d'état : la source quand le composant n'a pas de carnet (I19) — lu seulement alors.
  const reponse = useHistoriqueRobot(hass, duCarnet ? null : idRobot, idSurface, st ? st.state : null);
  const histoErreur = !duCarnet && reponse === 'erreur';
  const brut = histoErreur ? null : reponse;
  const sessions = useMemo(() => {
    if (!brut) return [];
    const de = (id) => (brut.find(l => l && l[0] && l[0].entity_id === id) || []);
    return sessionsRobot(de(idRobot), { domaine, surfaces: idSurface ? de(idSurface) : [] });
  }, [brut, idRobot, idSurface, domaine]);
  const usure = piecesUsure(soeurs);
  const compteurs = compteursRobot(soeurs);
  const reglages = reglagesRobot(soeurs);
  const fiche = ficheTechnique(appareil, soeurs);
  const maintenant = Date.now();
  // La surface du passage : celle du carnet (le maximum de son capteur), sinon ce que publie le capteur pendant le passage.
  const surfaceVue = enCours && enCours.surface != null ? enCours.surface : enRoute && idSurface && S[idSurface] && !isNaN(parseFloat(S[idSurface].state)) ? Math.round(parseFloat(S[idSurface].state)) : null;
  const depuis = vue.panne ? (st && st.last_changed ? Date.parse(st.last_changed) : null) : enCours ? enCours.debut : (vue.phase === 'travail' && st && st.last_changed ? Date.parse(st.last_changed) : null);
  const etat = etatAccueil({ domaine, phase: vue.phase, bipe: vue.bipe, erreur: vue.carnet.erreur, pieces: vue.carnet.pieces, tout: vue.carnet.tout, libelle: vue.carnet.libelle, charge: vue.charge,
    surface: surfaceVue, unite: uniteSurface, depuis, choisir, maintenant });

  /* Le planning : tenu par le composant (ADR 0043), lu dans l'état des robots (robotsetat.js, 15 s fiche ouverte). Sans réponse de sa
   * part, ni onglet ni prochain passage. Une écriture pose la configuration rendue dans l'état, pour la carte comme pour la fiche. */
  const [errPlanning, setErrPlanning] = useState('');
  const vivant = useRef(true);
  useEffect(() => { vivant.current = true; return () => { vivant.current = false; }; }, []);
  /* La réponse d'un enregistrement se pose sur l'état FRAIS du magasin (passe bis du 18/10, point 7), pas sur celui du dernier rendu de
   * la fiche : un relevé arrivé entre l'écriture et sa réponse — un passage qui commence — n'est pas effacé. */
  const planning = {
    etat: vue.etat, err: errPlanning, setErr: setErrPlanning, vivant,
    setEtat: (f) => { const suite = typeof f === 'function' ? f(lireEtatRobots().etat || vue.etat) : f; if (suite) poserEtatRobots(suite); },
  };

  const onglets = [
    ['accueil', tr('Accueil'), 'home'],
    ...(vue.etat ? [['planning', tr('Planning'), 'calendar-clock']] : []),
    ['historique', tr('Historique'), 'time-past'],
    ...(usure.length || compteurs.length ? [['entretien', tr('Entretien'), 'wrench-simple']] : []),
  ];
  const [onglet, setOnglet] = useState('accueil');
  const [carteOuverte, setCarteOuverte] = useState(false);
  /* Ce qui relie chaque onglet à son panneau (audit du 03/10). Avant le retour anticipé ci-dessous : un hook ne se saute jamais. */
  const idOnglets = useId();
  const actuel = onglet === 'reglages' || onglets.some(o => o[0] === onglet) ? onglet : 'accueil';
  const avecOnglets = actuel !== 'reglages' && onglets.length > 1;
  const aller = (o) => { setOnglet(o); focaliser(idOnglets + '-t-' + o); };

  if (!idRobot || !st) {
    return <EnteteFiche nom={nom} plaque={plaque} sousNom={sousNom} panne={tr('Ce robot ne répond plus.')} />;
  }

  const prochain = { ...tuileProchain(vue.carnet.prochain, { domaine, aDesAires: domaine === 'lawn_mower' && zones.length > 0, maintenant, loc: locale() }), onglet: vue.etat ? 'planning' : null };
  // Les sept jours glissants (I19) : la tuile de l'Accueil, et l'Historique — ses chiffres et ses rangées.
  const sept = septJours(duCarnet || sessions, maintenant);
  const semaine = tuileSemaine(sept, uniteSurface);
  const rangees = rangeesHistorique(sept.sessions, { domaine, maintenant, loc: locale() });
  const a = (st && st.attributes) || {};
  const vitesses = domaine === 'vacuum' && Array.isArray(a.fan_speed_list) ? a.fan_speed_list : [];
  const iv = vitesses.indexOf(a.fan_speed);
  const puissance = vitesses.length > 1 ? (
    <div style={{ ...LIGNE, borderTop: 'var(--o-bw,1px) solid var(--o-bd3)' }}>
      <span><span style={{ display: 'block', fontSize: 14.5, fontWeight: 700 }}>{tr('Puissance')}</span><span style={SOUS}>{tr('Niveau d’aspiration')}</span></span>
      <PasAPas nom={tr('Puissance')} valeur={iv >= 0 ? trSens(vacOption(a.fan_speed)) : '—'} peutMoins={iv > 0} peutPlus={iv >= 0 && iv < vitesses.length - 1}
        moins={() => appel('vacuum', 'set_fan_speed', { entity_id: idRobot, fan_speed: vitesses[iv - 1] })} plus={() => appel('vacuum', 'set_fan_speed', { entity_id: idRobot, fan_speed: vitesses[iv + 1] })} />
    </div>
  ) : null;

  return (
    <>
      <div className={'rb-fiche ' + (domaine === 'lawn_mower' ? 'rb-tondeuse' : 'rb-aspirateur')} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* L'en-tête des fiches : la plaque, le nom, « {pièce} · robot aspirateur », l'épingle, la roue des réglages (I4 A) — et UNE croix. */}
        <EnteteFiche nom={nom} plaque={plaque} sousNom={sousNom} epingle={epingle} reglages enReglages={actuel === 'reglages'} idRoue={idOnglets + '-roue'}
          onReglages={() => { setOnglet('reglages'); focaliser(idOnglets + '-retour'); }} />
        {avecOnglets && <FicheOnglets idBase={idOnglets} nom={nom} onglets={onglets} actuel={actuel} onChoisir={setOnglet} />}
        {actuel !== 'reglages' && (
          <PanneauOnglet idBase={idOnglets} actuel={actuel} avecOnglets={avecOnglets}>
            {actuel === 'accueil' && <OngletAccueil vue={vue} etat={etat} zones={zones} choisir={choisir} enRoute={enRoute}
              toutChoisi={enRoute ? !!(enCours && enCours.tout) : domaine === 'lawn_mower' ? toutLeJardin : nChoisies === 0}
              basculerZone={basculerZone} toutPrendre={toutPrendre} principale={principale} seconde={seconde} aUneCarte={!!idCarte} ouvrirCarte={() => setCarteOuverte(true)}
              prochain={prochain} semaine={semaine} alerte={alerteEntretien(usure)} allerA={aller} retenu={passageRetenu(vue.etat, idRobot, maintenant)} lignes={lignes} />}
            {actuel === 'planning' && <OngletPlanning hass={hass} domaine={domaine} robot={robot} zones={zonesPlanifiables} planning={planning} />}
            {actuel === 'historique' && <OngletHistorique rangees={rangees} resume={sept} uniteSurface={uniteSurface} chargee={!!duCarnet || !!brut} erreur={histoErreur} />}
            {actuel === 'entretien' && <OngletEntretien hass={hass} pieces={usure} compteurs={compteurs} phrase={phraseEntretien(usure)} />}
          </PanneauOnglet>
        )}
        {/* La puissance, puis les scripts de la maison (l'aspirateur principal seul) : des rangées du panneau des réglages de l'appareil. */}
        {actuel === 'reglages' && <PageReglagesAppareil hass={hass} nom={nom} libelleNom={tr('Nom du robot')} reglages={reglages} fiche={fiche} idRetour={idOnglets + '-retour'}
          avant={<>{puissance}{roue ? <PanneauScripts hass={hass} scripts={scripts} ordinaire={compteOrdinaire(hass)} pret={!!vue.etat} /> : null}</>}
          retour={() => { setOnglet('accueil'); focaliser(idOnglets + '-roue'); }} onFiche={onFiche ? () => onFiche(idRobot) : null} />}
      </div>
      {/* La carte du logement (I2 A), dans une SECONDE feuille montée APRÈS le contenu : elle se pose dans <body> à la suite de celle du
        * robot — plus loin dans le DOM, donc au-dessus. On y touche les pièces comme les puces de « Où », et le choix s'y retrouve.
        * Le plan seul : la caméra du robot part de la popup, à sa demande du 18/10 ; elle reste dans Sécurité. */}
      {carteOuverte && idCarte && (
        <BottomSheet onClose={() => setCarteOuverte(false)}>
          {() => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Sa ligne de titre porte sa croix (`TitreFeuille`) : elle ferme cette feuille-ci, la fiche reste ouverte dessous. */}
              <TitreFeuille style={{ fontSize: 19, fontWeight: 700 }}>{tr('Carte du logement')}</TitreFeuille>
              <Suspense fallback={<div style={{ aspectRatio: '16/10', borderRadius: 14, background: 'var(--o-well2)' }} />}>
                {/* Les pièces du plan sont celles de « Où » (§ 3.4) : les zones de Home Assistant quand elles sont la source, sinon ce que le
                  * robot publie ; une association du plan écrite par segment se reprend d'elle-même quand c'est sans équivoque (R7, vacplan.jsx). */}
                <VacPlan hass={hass} haid={idCarte} zones={parZones ? zonesHA.map(z => ({ id: z.id, name: z.nom, color: z.couleur, icon: z.icone, segments: z.segments })) : choisir ? pieces : []}
                  nPieces={parZones ? zonesHA.reduce((n, z) => n + Math.max(1, z.segments.length), 0) : pieces.length}
                  selection={Object.fromEntries(zones.map(z => [z.id, !!z.choisie]))}
                  onToggle={(p) => { const z = zones.find(x => x.id === p.id); if (z) basculerZone(z); }} />
              </Suspense>
            </div>
          )}
        </BottomSheet>
      )}
    </>
  );
}
