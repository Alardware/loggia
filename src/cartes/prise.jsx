/* La carte d'une prise.
 * Sorti d’App.jsx tel quel (lot 5 de l’audit du 28/10, ADR 0283) : seuls les imports sont neufs. */
import { useState, useEffect, useRef } from 'react';
import { LAVIS } from '../theme.js';
import { wattsDe } from '../unites.js';
import { commanderService } from '../actions.js';
import { cvName, Surface, nomCarte, Fi } from '../ui.jsx';
import { DEMANDE_PRISE_MS, clesDesPrises, TYPES_PRISE, typeDePrise, ligneDePrise, phrasePrise, puissancePrise, cheminsCourbe, appuiBascule, kwhPrise, insecable } from '../prises.js';
import { useEtatPrises, useMesuresPrise, prisesDe, gardeDePrise, finMinuteur } from '../prisesetat.js';
import { useOptimiste } from '../optimiste.js';
import { minuitLocal } from '../jourstat.js';
import { LISERE } from '../styles.js';
import { fmtWatts } from '../format.js';
import { Ico } from '../icones.jsx';
import { tr } from '../i18n.js';
import { priseDe, useHass, lavisCarte } from '../app/noyau.jsx';
import { PlugIcon } from '../cartescustom/cartes.jsx';
import { RM_BTN, RM_SUB, RM_CARD, RM_ICO, GlypheCarte, RmBascule, ChiffreHaut, RM_NAME } from './briques.jsx';
import { ValeurEtiquette } from './chauffage.jsx';

/* ── La carte d'une PRISE (chantier Prises, § 3.1-3.2 ; sa maquette « Cartes
 * prises », cadre 1a ; ADR 0193) ─────────────────────────────────────────────
 *
 * Dans le cadre des cartes de la maison (`RM_CARD`, le liseré, le lavis, la
 * surface qui ouvre la fiche, `o-panne` muette), à leurs tailles (184 ; 176
 * de large au téléphone) : la plaque de l'appareil en haut à gauche, le
 * cadenas d'une prise protégée et la bascule rose à droite ; 14 px plus bas
 * le nom, la puissance en grand à sa droite et la phrase du § 4 dessous ; au
 * pied, « Aujourd'hui », ses kWh, et la courbe du jour. Seulement pour une
 * PRISE (P1, `priseDe`) : les autres switch gardent la carte générique.
 *
 * Couper À LA MAIN une prise protégée demande d'abord (P5) — ou dont la
 * protection n'est pas encore lue : dans le doute, on demande, mais le cadenas
 * ne s'affiche que pour une protection connue (A3) : la question
 * prend la place de la phrase, Annuler et Couper celle du pied — une carte de
 * 184 px ne loge pas les trois sous la phrase. La demande prend le focus, se
 * défait seule au bout de 6 s, et rend le focus à la bascule. Ni animation,
 * ni étiquette du type au-dessus du nom (P11) : la fiche dit le type.
 *
 * Sur une carte étroite (le téléphone, sous 188 px de contenu), la grille
 * commune (`o-gabarit`, index.css ; passe téléphone, T10, T11, T17) : la
 * puissance monte en haut à droite (`ChiffreHaut`), le nom et la phrase — sa
 * forme courte quand la bascule dit déjà l'état — passent sur toute la largeur,
 * et la ligne de commandes porte la bascule et les kWh du jour, « Aujourd'hui »
 * dessous. Une prise PROTÉGÉE n'y a pas d'interrupteur : une pastille,
 * « Protégée », que l'on touche pour ouvrir la fiche. La courbe, le pied et la
 * demande sur place restent à la carte large ; une prise gardée dont la
 * protection n'est pas encore lue ouvre sa fiche au toucher de la bascule.
 */
const PAS_DE_PRISE = { prise: false, puissance: null, energie: null };
// Annuler et Couper : 40 px de haut, arrondi 10, le gris doux, sans bordure (le `ChipButton` de sa maquette) ; leur mot, sans glyphe.
const RM_PRISE_BTN = { ...RM_BTN, height: 40, padding: '0 6px', borderRadius: 10, border: 'none', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };

/* La demande À DEUX APPUIS (P5, relecture finale A4), pour les cartes qui n'ont
 * pas la place des deux boutons de `RoomPriseCard` : la compacte sans fiche à
 * ouvrir, le gros interrupteur d'une vue personnalisée. Le premier appui pose
 * la demande — la phrase d'état dit « Couper la prise ? » —, le second coupe ;
 * Échap ou 6 secondes la défont. Pas de bouton dans le bouton : c'est la
 * bascule elle-même qui reçoit le second appui.
 *
 * `allumee` : la prise l'est encore. Coupée ou muette entre-temps, la question n'a plus
 * d'objet — et ne doit pas attendre, tapie, qu'une automatisation la rallume dans les
 * six secondes : « Couper la prise ? » reviendrait de nulle part, et l'appui suivant, pris
 * pour le second, couperait sans que personne ait rien demandé (relecture finale, F4 ;
 * la fiche et la carte font de même). */
function useDemandeCoupure(allumee = true) {
  const [demande, setDemande] = useState(false);
  useEffect(() => { if (demande && !allumee) setDemande(false); }, [demande, allumee]);
  useEffect(() => {
    if (!demande) return undefined;
    const fin = setTimeout(() => setDemande(false), DEMANDE_PRISE_MS);
    const echap = (ev) => { if (ev.key === 'Escape') setDemande(false); };
    document.addEventListener('keydown', echap);
    return () => { clearTimeout(fin); document.removeEventListener('keydown', echap); };
  }, [demande]);
  return [demande, setDemande];
}

/** Ce que la carte et la compacte d'une prise lisent (§ 3.1, 3.3, § 4) : sa
 * règle (`priseDe`), l'état du serveur (prisesetat.js), la mesure du moment
 * et — `jour`, la carte seulement — celles du jour. `actif` faux : rien ne
 * s'abonne, et rien ne se rend.
 *
 * Elle s'abonne à SA bascule et à SON capteur de puissance (relecture finale,
 * A2) : les vues qui la portent ne surveillent pas `sensor.` — il jitte sans
 * cesse et redessinerait tout l'écran —, et sans cet abonnement « 146 W »
 * restait figé jusqu'au prochain changement d'un `switch.`. Seule la carte se
 * redessine, à 10 W près (clé bruyante, ADR 0119). Les états se lisent dans
 * CE `hass` vivant, pas dans celui du parent : il faut les DEUX clés, sinon une
 * carte redessinée par son parent après un geste lirait un relevé vieux de deux
 * secondes, où la bascule n'a pas encore bougé. Inactive, la liste est vide : ni
 * relevé ni intervalle (`useHass`), une compacte qui n'est pas une prise ne paie rien. */
function useVuePrise(hass, id, label = null, actif = true, { jour: avecJour = true } = {}) {
  // Ce que le parent a lu : la règle des prises s'y lit (le registre, pas les mesures) ; les ÉTATS, eux, se lisent plus bas dans le hass vivant.
  let S = (hass && hass.states) || {};
  const prise = actif ? priseDe(S, id) : PAS_DE_PRISE;
  const { cles, bruyantes } = clesDesPrises(actif ? [{ id, puissance: prise.puissance }] : []);
  const vivant = useHass(cles, bruyantes);
  if (vivant && vivant.states) S = vivant.states;
  const st = S[id] || null;
  const { etat, minuteurs } = useEtatPrises(actif);
  const jour = useMesuresPrise(prise.puissance, prise.energie, actif && avecJour);
  const [ov, poser] = useOptimiste(st ? st.state : null);
  if (!actif) return null;
  const maintenant = Date.now();
  const e = prisesDe(etat, id);
  const g = gardeDePrise(etat, id);
  const nom = label || cvName(st, id);
  // `muette`, et non `muet` : des tests extraient la PREMIÈRE ligne qui déclare `muet` dans App.jsx, celle de la fabrique des cartes (croquettes_popup, distributeur_finition).
  const muette = !st || st.state === 'unavailable' || st.state === 'unknown';
  // Le geste d'abord (`useOptimiste`, il expire) : « Coupée depuis » l'heure du geste.
  const enAvance = !muette && ov != null && ov !== (st.state === 'on');
  const vu = enAvance ? { ...st, state: ov ? 'on' : 'off', last_changed: new Date(maintenant).toISOString() } : st;
  const on = !muette && vu.state === 'on';
  // En WATTS, quelle que soit l'unité du capteur (audit du 03/10), dans celui que la règle retient (P1).
  const watts = prise.puissance && S[prise.puissance] ? wattsDe(S[prise.puissance]) : null;
  const type = e && TYPES_PRISE[e.type] ? e.type : typeDePrise(nom, null, id);
  // Une fin passée n'est plus un minuteur (audit du 19/10, point 5) : « Se coupe à 20:40 » le temps que le sondage l'apprenne.
  const ligne = ligneDePrise({ st: vu, mesure: !!prise.puissance, watts, minuteur: finMinuteur(minuteurs, id, maintenant),
    cycle: e && e.cycle, cycles: e ? e.cycles : [], type, maintenant });
  return {
    // `protegee` : la protection CONNUE — elle seule met le cadenas ; `garde` : ce que couper à la main doit demander, protection inconnue comprise (A3).
    nom, muet: muette, on, type, tp: TYPES_PRISE[type], protegee: g.protegee, garde: g.garde, puissance: prise.puissance,
    // Le chiffre : allumée, vivante, mesurée ; active à 1 W ou plus (le lavis). Sans mesure, rien.
    watts: on && watts != null ? watts : null, vive: on && (watts == null || watts >= 1),
    mesure: !!(prise.puissance || prise.energie), jour, maintenant, phrase: phrasePrise(ligne, { maintenant }),
    /* La forme courte de la carte étroite (passe téléphone, T17) : « Depuis le 4 sept. », seulement quand l'état se VOIT déjà — sans
     * protection (la bascule le dit) ou allumée (la plaque teintée, la puissance). Protégée et COUPÉE, la pastille « Protégée » ne dit
     * rien de l'état, et seul le gris de la plaque le laisse deviner : « Coupée depuis le 5 oct. » reste entière (correction bis, point 2). */
    phraseCourte: phrasePrise(ligne, { maintenant, courte: !g.protegee || on }),
    commander: (allumer) => { poser(allumer); commanderService(hass, id, 'homeassistant', allumer ? 'turn_on' : 'turn_off', { entity_id: id }); },
  };
}

/* La demande se défait : le focus qui y était reste DANS la carte, posé AVANT que
 * ses boutons ne disparaissent (sinon il tomberait sur la page, `<body>`).
 *
 * Où il va (passe téléphone, corrections bis 2, point 1). La carte d'une prise
 * écrit sa bascule deux fois (`o-seul-large`, `o-seul-etroit`) et la feuille en
 * cache une ; mais PENDANT la demande, la ligne de commandes étroite n'est pas
 * rendue : il ne reste que la bascule de la carte large. Sur une carte devenue
 * étroite pendant les 6 s de la demande, celle-là est cachée (`display: none`,
 * aucun rectangle) et ne prendrait pas le focus. Dans l'ordre :
 *  1. la bascule qui se VOIT ;
 *  2. sinon la SURFACE de la carte (`.o-surface`, le bouton qui l'ouvre) : la
 *     carte la pose dès qu'elle a `onOpen`, et son seul appelant le passe. */
function defaireDemande(el, setDemande) {
  const pied = el && el.querySelector('[data-demande]');
  if (pied && pied.contains(document.activeElement)) {
    const bascule = [...el.querySelectorAll('[role="switch"]')].find(n => n.getClientRects().length);
    const cible = bascule || el.querySelector('.o-surface');
    if (cible) cible.focus();
  }
  setDemande(false);
}

/* La puissance d'une carte LARGE : « 146 » en 25 px / 800 et « W » en 15 à droite du nom
 * ET de la phrase, alignée sur leur bas comme le pourcentage d'une lumière et celui
 * d'un volet. Elle ne remonte plus de 7 px dans l'air du dessus (la marge négative,
 * retirée le 14/10) : c'est la rangée, alignée par le bas, qui la pose. Une carte
 * étroite l'écrit en haut (`ChiffreHaut`, passe téléphone), et la feuille n'en montre
 * qu'une (`o-seul-large`). La surface la dit déjà. */
function ChiffrePrise({ w }) {
  const { v, u } = puissancePrise(w);
  return (
    <span aria-hidden="true" className="o-prise-chiffre o-seul-large"
      style={{ display: 'flex', flexShrink: 0, alignItems: 'baseline', gap: 3, fontWeight: 800, lineHeight: 1, whiteSpace: 'nowrap', color: 'var(--o-text)' }}>
      <span style={{ fontSize: 25, letterSpacing: '-.02em' }}>{v}</span><span style={{ fontSize: 15 }}>{u}</span>
    </span>
  );
}

/* La courbe du jour (§ 3.1, P8) : de minuit à maintenant, les moyennes sur
 * 5 minutes puis la puissance du moment ; la ligne de base en `--o-bd1`,
 * l'aire à .22 de la teinte, la ligne de 1,5 px — grises pour une prise
 * muette, comme sa plaque : ce qu'elle a tiré avant de se taire, sans la
 * couleur de ce qui vit. Dessinée en 240 × 36, étirée à la largeur de la
 * carte ; elle prend la hauteur qui reste au pied, de 18 à 36 px (`flex`),
 * 28 dans une carte sans hauteur imposée. */
function CourbeJour({ points, watts, maintenant, tp, muet = false }) {
  const pts = Array.isArray(points) ? (watts == null ? points : [...points, { t: maintenant, w: watts }]) : [];
  const c = cheminsCourbe(pts, { largeur: 240, hauteur: 36, debut: minuitLocal(maintenant), fin: maintenant });
  return (
    <svg aria-hidden="true" className="o-prise-courbe" viewBox="0 0 240 36" preserveAspectRatio="none"
      style={{ display: 'block', width: '100%', flex: '1 1 28px', minHeight: 18, maxHeight: 36, marginTop: 6, overflow: 'visible' }}>
      <line x1="0" y1="36" x2="240" y2="36" vectorEffect="non-scaling-stroke" style={{ stroke: 'var(--o-bd1)', strokeWidth: 1 }} />
      {c && <path d={c.aire} style={{ fill: muet ? 'var(--o-s2)' : 'rgba(' + tp.rgb + ',.22)' }} />}
      {c && <path d={c.ligne} vectorEffect="non-scaling-stroke" style={{ fill: 'none', stroke: muet ? 'var(--o-text3)' : tp.col, strokeWidth: 1.5, strokeLinejoin: 'round', strokeLinecap: 'round' }} />}
    </svg>
  );
}

function RoomPriseCard({ id, hass, onOpen, titre = null }) {
  const v = useVuePrise(hass, id, titre);
  const [demande, setDemande] = useState(false);
  const racine = useRef(null);
  // La demande prend le focus (Annuler) et se défait seule au bout de 6 s.
  useEffect(() => {
    if (!demande) return undefined;
    const el = racine.current;
    const annuler = el && el.querySelector('[data-annuler]');
    if (annuler) annuler.focus();
    const t = setTimeout(() => defaireDemande(el, setDemande), DEMANDE_PRISE_MS);
    /* Échap la défait, comme la compacte et le gros interrupteur (audit du 19/10, point 9) — à la CAPTURE, et arrêté : posée
     * dans une feuille, la carte ne la ferme pas en même temps (la feuille ferme sur Échap, ui.jsx). */
    const echap = (ev) => { if (ev.key !== 'Escape') return; if (ev.stopPropagation) ev.stopPropagation(); defaireDemande(el, setDemande); };
    document.addEventListener('keydown', echap, true);
    return () => { clearTimeout(t); document.removeEventListener('keydown', echap, true); };
  }, [demande]);
  // Coupée ou muette entre-temps, la question n'a plus d'objet — et elle TOMBE : rallumée dans les 6 s, elle ne revient pas (F4, comme la fiche).
  useEffect(() => { if (demande && !v.on) setDemande(false); }, [demande, v.on]);
  const enDemande = demande && v.on;
  // Allumée et gardée — protégée, ou protection pas encore lue (A3) : elle demande, elle ne coupe pas d'un appui.
  const toucher = () => { if (v.on && v.garde) setDemande(true); else v.commander(!v.on); };
  const tp = v.tp;
  // La plaque : la teinte de l'appareil allumée et vivante ; coupée, le gris lisible ; muette, le gris éteint.
  const [fond, encre] = v.muet ? ['var(--o-s1)', 'var(--o-text3)'] : v.on ? ['rgba(' + tp.rgb + ',.18)', tp.col] : ['var(--o-s1)', 'var(--o-text2)'];
  const chiffre = v.watts != null && !enDemande;
  /* La bascule de la carte ÉTROITE (passe téléphone, T10) : allumée et gardée — protection pas encore lue —, elle ouvre la fiche, qui
   * demande (`appuiBascule`, comme la compacte) ; ailleurs, le geste de la carte large. La carte étroite ne demande pas sur place. */
  const toucherEtroite = () => { if (appuiBascule({ on: v.on, garde: v.garde, ouvrable: !!onOpen }) === 'fiche') onOpen(id); else toucher(); };
  const pp = chiffre ? puissancePrise(v.watts) : null;
  const phrase = (texte, classe) => <div className={classe} style={{ ...RM_SUB, color: v.muet ? 'var(--o-bad)' : 'var(--o-text2)', '--o-n': Math.max(1, texte.length) }}>{texte}</div>;
  return (
    <div ref={racine} className={'o-rmcard o-gabarit' + (v.muet ? ' o-panne' : '')} data-prise=""
      style={{ ...RM_CARD, position: 'relative', cursor: onOpen ? 'pointer' : 'default',
        // Active (allumée, 1 W ou plus) : le lavis de son appareil, 0,16 en haut, 0,04 en bas.
        ...(v.vive && LAVIS ? { background: lavisCarte(tp.rgb, .16) } : null),
        border: LISERE }}>
      {onOpen && <Surface onClick={() => onOpen(id)} label={nomCarte(v.nom, v.phrase, v.watts == null ? null : fmtWatts(v.watts))} />}
      {/* La ligne du haut. Carte large : la plaque, le cadenas d'une prise protégée, la bascule. Carte étroite : la plaque, et la puissance
        * à droite — le cadenas descend dans la pastille, la bascule dans la ligne de commandes. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ ...RM_ICO(fond, encre), marginRight: 'auto' }}><GlypheCarte id={id} size={17}>{tp.ico ? <Ico name={tp.ico} size={17} /> : <PlugIcon size={17} />}</GlypheCarte></span>
        {v.protegee && <span role="img" aria-label={tr('Protégée')} title={tr('Protégée')} className="o-seul-large" style={{ display: 'flex', alignItems: 'center', height: 26, color: 'var(--o-text3)' }}><Fi i="lock" size={12} /></span>}
        <RmBascule className="o-seul-large" on={v.on} nom={v.nom} onToggle={toucher} inerte={v.muet} />
        {chiffre && <ChiffreHaut v={pp.v} u={pp.u} />}
      </div>
      {/* Le nom et la phrase à gauche, la puissance à droite, en bas : la disposition de la carte d'une lumière et de celle d'un volet
        * (sa demande du 14/10, « aligne aussi la puissance des prises en bas »). Pendant la demande, la question prend la place de la
        * phrase et la puissance se tait : la colonne a toute la largeur. Sur une carte étroite, la puissance du bas se tait, et la phrase
        * prend sa forme courte quand elle en a une (T17). */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginTop: 'var(--o-milieu-haut, 14px)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="o-gab-nom" style={{ ...RM_NAME, fontSize: 15 }}>{v.nom}</div>
          {enDemande
            ? <div className="o-gab-phrase" style={{ ...RM_SUB, fontSize: 12.5, fontWeight: 700, color: 'var(--o-text1)' }}>{tr('Couper la prise ?')}</div>
            : v.phraseCourte === v.phrase ? phrase(v.phrase, 'o-gab-phrase')
              : <>{phrase(v.phrase, 'o-gab-phrase o-seul-large')}{phrase(v.phraseCourte, 'o-gab-phrase o-seul-etroit')}</>}
        </div>
        {chiffre && <ChiffrePrise w={v.watts} />}
      </div>
      {/* La question s'annonce (point 13) : elle remplace la phrase sans que le focus y aille toujours. */}
      <span className="o-vh" aria-live="polite">{enDemande ? tr('Couper la prise ?') : ''}</span>
      {/* Annuler et Couper : leur mot, la demande d'une carte large ; le mot dit aussi leur nom et leur bulle. */}
      {enDemande ? (
        <div role="group" aria-label={tr('Couper la prise ?')} data-demande="" style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 10 }}>
          <button type="button" data-annuler="" aria-label={tr('Annuler')} title={tr('Annuler')} onClick={(e) => { e.stopPropagation(); defaireDemande(racine.current, setDemande); }}
            className="o-rmbtn" style={RM_PRISE_BTN}>{tr('Annuler')}</button>
          <button type="button" aria-label={tr('Couper') + ' ' + v.nom} title={tr('Couper')} onClick={(e) => { e.stopPropagation(); defaireDemande(racine.current, setDemande); v.commander(false); }}
            className="o-rmbtn" style={{ ...RM_PRISE_BTN, color: 'var(--o-bad)' }}>{tr('Couper')}</button>
        </div>
      ) : (<>
        {/* Le pied d'une carte large : « Aujourd'hui », ses kWh, et la courbe du jour. */}
        {v.mesure && (
          <div className="o-prise-pied o-seul-large" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', flex: '1 1 auto', minHeight: 0, paddingTop: 'var(--o-pied-haut, 14px)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 11, fontWeight: 700, lineHeight: '13px', color: 'var(--o-text3)' }}>
              <span>{tr('Aujourd’hui')}</span>
              <span style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--o-text2)', whiteSpace: 'nowrap' }}>{v.jour.kwh == null ? '—' : kwhPrise(v.jour.kwh)}</span>
            </div>
            {v.puissance && <CourbeJour points={v.jour.points} watts={v.watts} maintenant={v.maintenant} tp={tp} muet={v.muet} />}
          </div>
        )}
        {/* La ligne de commandes d'une carte étroite (T10, T11), 44 px collés au pied : la bascule — ou, protégée, la pastille, sans
          * interrupteur, que l'on touche pour ouvrir la fiche —, et les kWh du jour, « Aujourd'hui » dessous. Une prise sans mesure n'a
          * que sa bascule. */}
        <div className="o-seul-etroit" data-pastille={v.protegee ? '' : undefined}
          style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto', paddingTop: 'var(--o-pied-haut, 14px)', minHeight: 'calc(var(--o-pied-haut, 14px) + 44px)', '--o-reserve': v.protegee ? undefined : '54px' }}>
          {v.protegee
            ? <span role="img" aria-label={tr('Protégée')} title={tr('Protégée')} className="o-gab-pastille"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0, height: 26, padding: '0 7px', borderRadius: 9, background: 'var(--o-s1)', color: 'var(--o-text2)', '--o-n': tr('Protégée').length }}>
              <Fi i="lock" size={12} /><span aria-hidden="true" className="o-gab-pastille-mot" style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{tr('Protégée')}</span></span>
            : <RmBascule on={v.on} nom={v.nom} onToggle={toucherEtroite} inerte={v.muet} />}
          {v.mesure && <ValeurEtiquette valeur={v.jour.kwh == null ? '—' : insecable(kwhPrise(v.jour.kwh))} dit={tr('Aujourd’hui')} etiquette={tr('Aujourd’hui')} kwh />}
        </div>
      </>)}
    </div>
  );
}

export { useDemandeCoupure, useVuePrise, RoomPriseCard };
