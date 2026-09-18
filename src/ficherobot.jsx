/* ── La fiche d'un robot : aspirateur ou tondeuse (ADR 0042) ─────────────────
 *
 * Quinze maquettes fournies le 17/09 (« pour les robots aspirateur et
 * tondeuse ») : l'accueil du robot — l'anneau de batterie, l'état, « Démarrer »,
 * les zones, la semaine, l'entretien qui presse —, puis la carte et ses zones,
 * l'historique, l'entretien, les réglages. UNE fiche pour les deux robots : ce
 * qui les sépare n'est pas leur nature mais ce qu'ils savent dire.
 *
 * Une FEUILLE, comme les autres appareils (ajustement du 18/09) : la carte du
 * robot l'ouvre, partout, et le rendu est le même sur PC, tablette et
 * téléphone — l'agencement du téléphone, que l'utilisateur préfère.
 *
 * Les maquettes donnent la DISPOSITION ; les teintes sont celles de Loggia —
 * l'accent du thème pour l'aspirateur, le vert d'état pour la tondeuse. Tout
 * ce qui se calcule vit dans `robots.js`, testé à sec. Rien sans source : un
 * onglet sans donnée n'existe pas, une jauge sans total ne se dessine pas, et
 * aucune pièce, surface ni durée n'est inventée.
 *
 * Chargée à la demande par `FicheRobot` (App.jsx) ; elle emporte le plan du
 * logement (`vacplan.jsx`), demandé seulement si une carte existe.
 */
import { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { tr, locale } from './i18n.js';
import { Fi, Bascule, Gauge, BottomSheet, useEtatServeur } from './ui.jsx';
import { LOGGIA_INDEX, loggiaEnt, vacRooms, vacOption } from './state.js';
import { commanderService } from './actions.js';
import { useLoggia, useEntities } from './runtime.js';
import { CamLive } from './camera.jsx';
import { premierJourSemaine } from './horloge.js';
import { petitesCapitales } from './styles.js';
import {
  decrireSoeurs, phaseRobot, motEtatRobot, enCharge, batterieRobot, actionPrincipale, serviceRetour, commandeZones,
  zonesTondeuse, piecesUsure, alerteEntretien, compteursRobot, sessionsRobot, motIssue, resumeSemaine, dureeLisible,
  etiquetteJour, reglagesRobot, ficheTechnique, ordreJours, nomJour, heureValide, resumeZones, zonePlanning, nouveauPlanning,
  prochainPassage, etiquetteProchain, dansLaPlage, capteurPluie,
} from './robots.js';

const VacPlan = lazy(() => import('./vacplan.jsx'));

const FOND = 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))';
const PANNEAU = { background: FOND, border: 'none', borderRadius: 'var(--o-radius,18px)', padding: '18px 20px', boxShadow: 'var(--o-shadow,0 10px 26px rgba(0,0,0,.3))', boxSizing: 'border-box', minWidth: 0 };
const TITRE_SECTION = { fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 19, color: 'var(--o-text2)' };
const PETITES_CAPITALES = petitesCapitales(10.5);
const BOUTON_DOUX = { padding: '9px 14px', borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, background: 'var(--o-s1)', color: 'var(--o-text1)', fontFamily: 'inherit' };
const COULEUR_NIVEAU = { bas: 'var(--o-bad)', moyen: 'var(--o-warn)', bon: 'var(--rb-doux)' };

/* L'état d'UN robot, relu à chaque rendu : l'entité, ses sœurs, et ce que
 * `robots.js` en tire. Du calcul à plat, sans effet. */
function lireRobot(hass, domaine, idRobot) {
  const S = (hass && hass.states) || {};
  const st = idRobot ? S[idRobot] : null;
  const soeurs = decrireSoeurs(LOGGIA_INDEX, S, idRobot);
  const meta = LOGGIA_INDEX && idRobot ? LOGGIA_INDEX.entityMeta.get(idRobot) : null;
  const appareil = meta && meta.deviceId && LOGGIA_INDEX.deviceMeta ? LOGGIA_INDEX.deviceMeta.get(meta.deviceId) : null;
  const etat = st ? st.state : null;
  return {
    id: idRobot, st, soeurs, appareil, etat, plateforme: meta ? meta.platform : null,
    nom: (st && st.attributes && st.attributes.friendly_name) || (domaine === 'lawn_mower' ? tr('Tondeuse') : tr('Aspirateur')),
    phase: phaseRobot(domaine, etat), batterie: batterieRobot(st, soeurs), charge: enCharge(soeurs),
  };
}

/* L'historique du robot, lu une fois puis à chaque changement d'état (une
 * session qui finit doit apparaître). Home Assistant REMPLACE `hass` à chaque
 * état : l'appel lit le `hass` du moment par une référence vivante. */
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

/* ════════════ Les briques ════════════ */

/* L'anneau de batterie. La couleur dit l'ÉTAT, pas le niveau (règle de la fiche
 * des robots) : la panne et la batterie à plat d'abord, puis le travail, le
 * retour ; sinon la teinte du robot. */
function Anneau({ pct, phase }) {
  const couleur = phase === 'erreur' || pct < 20 ? 'var(--o-bad)' : phase === 'travail' ? 'var(--o-ok)' : phase === 'retour' || phase === 'pause' ? 'var(--o-warn)' : 'var(--rb-doux)';
  const R = 42, C = 2 * Math.PI * R;
  return (
    <div role="img" aria-label={tr('Batterie') + ' ' + pct + ' %'} style={{ position: 'relative', width: 104, height: 104, flexShrink: 0 }}>
      <svg viewBox="0 0 104 104" width="104" height="104" aria-hidden="true">
        <circle cx="52" cy="52" r={R} fill="none" stroke="var(--o-bd1)" strokeWidth="8" />
        <circle cx="52" cy="52" r={R} fill="none" stroke={couleur} strokeWidth="8" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)} transform="rotate(-90 52 52)" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{pct}<span style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-text2)' }}> %</span></div>
        <div style={{ ...PETITES_CAPITALES, fontSize: 9, marginTop: 4 }}>{tr('Batterie')}</div>
      </div>
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

const Case = ({ on }) => (
  <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: 7, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
    border: on ? 'none' : '2px solid var(--o-bd1)', background: on ? 'var(--o-accent-fond)' : 'transparent', color: '#fff' }}>{on && <Fi i="check" size={12} color="#fff" />}</span>
);

/* Un geste qui ne se rattrape pas (remettre un compteur à neuf) : deux appuis. */
function BoutonConfirme({ libelle, onConfirme }) {
  const [arme, setArme] = useState(false);
  useEffect(() => { if (!arme) return undefined; const t = setTimeout(() => setArme(false), 4000); return () => clearTimeout(t); }, [arme]);
  return (
    <button type="button" onClick={() => { if (arme) { setArme(false); onConfirme(); } else setArme(true); }}
      style={{ ...BOUTON_DOUX, background: arme ? 'rgba(var(--o-bad-rgb),.16)' : 'var(--o-s1)', color: arme ? 'var(--o-bad)' : 'var(--o-text1)' }}>{arme ? tr('Confirmer ?') : libelle}</button>
  );
}

/* ════════════ L'accueil du robot ════════════ */

function OngletAccueil({ domaine, robot, zones, nChoisies, basculerZone, peutChoisir, lancer, rentrer, resume, derniere, prochain, alerte, aUneCarte, allerA }) {
  // Deux tuiles, comme sur les maquettes : ce qui VIENT quand un passage est
  // planifié, sinon ce qui s'est passé (l'historique garde le reste).
  const passage = prochain ? { ...prochain, nom: tr('Prochain passage'), vers: 'planning' } : derniere ? { ...derniere, nom: tr('Dernier passage'), vers: 'historique' } : null;
  const action = actionPrincipale(domaine, robot.etat, peutChoisir ? nChoisies : 0);
  const enRoute = robot.phase === 'travail' || robot.phase === 'pause' || robot.phase === 'retour';
  const sousEtat = zones.length
    ? (zones.length > 1 ? tr('{n} zones', { n: zones.length }) : tr('{n} zone', { n: zones.length })) + (peutChoisir ? ' · ' + (nChoisies > 1 ? tr('{n} sélectionnées', { n: nChoisies }) : tr('{n} sélectionnée', { n: nChoisies })) : '')
    : null;
  return (
    <div className="rb-accueil">
      <div className="rb-a-hero" style={PANNEAU}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          {robot.batterie != null && <Anneau pct={robot.batterie} phase={robot.phase} />}
          <div style={{ minWidth: 0 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, background: 'var(--o-s2)', color: 'var(--o-text1)' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: robot.phase === 'erreur' || robot.phase === 'absent' ? 'var(--o-bad)' : enRoute ? 'var(--o-ok)' : 'var(--o-text3)' }} />{motEtatRobot(domaine, robot.etat, { enCharge: robot.charge })}
            </span>
            {sousEtat && <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--o-text2)', marginTop: 9 }}>{sousEtat}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button type="button" onClick={lancer} disabled={!action.service}
            style={{ flex: 1, padding: '15px 12px', borderRadius: 14, border: 'none', cursor: action.service ? 'pointer' : 'default', fontSize: 14.5, fontWeight: 800, fontFamily: 'inherit', background: 'var(--rb-fond)', color: '#fff', opacity: action.service ? 1 : .5 }}>{action.libelle}</button>
          <button type="button" onClick={rentrer} disabled={robot.phase === 'base' || robot.phase === 'absent'}
            style={{ padding: '15px 20px', borderRadius: 14, border: 'none', cursor: 'pointer', fontSize: 14.5, fontWeight: 800, fontFamily: 'inherit', background: 'var(--o-s1)', color: 'var(--o-text1)', opacity: robot.phase === 'base' || robot.phase === 'absent' ? .5 : 1 }}>{tr('Base')}</button>
        </div>
      </div>

      {(zones.length > 0 || aUneCarte) && (
        <div className="rb-a-zones" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
            <div style={TITRE_SECTION}>{tr('Zones')}</div>
            <button type="button" onClick={() => allerA('zones')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 2px', border: 'none', background: 'none', cursor: 'pointer', font: 'inherit', fontSize: 12.5, fontWeight: 700, color: 'var(--rb-doux)' }}>{aUneCarte ? tr('Voir la carte') : tr('Voir les zones')}<Fi i="angle-right" size={10} color="var(--rb-doux)" /></button>
          </div>
          {zones.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {zones.map(z => <Puce key={z.id} on={!!z.choisie} disabled={!peutChoisir || z.inerte} couleur={z.couleur} onClick={() => basculerZone(z)}>{z.nom}</Puce>)}
            </div>
          )}
        </div>
      )}

      {(resume || passage) && (
        <div className="rb-a-tuiles" style={{ display: 'grid', gridTemplateColumns: 'repeat(' + ((resume ? 1 : 0) + (passage ? 1 : 0)) + ', minmax(0, 1fr))', gap: 12 }}>
          {passage && (
            <button type="button" onClick={() => allerA(passage.vers)} style={{ ...PANNEAU, padding: '14px 16px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: 'inherit' }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--o-text2)' }}>{passage.nom}</div>
              <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.01em', marginTop: 5 }}>{passage.titre}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{passage.sous}</div>
            </button>
          )}
          {resume && (
            <div style={{ ...PANNEAU, padding: '14px 16px' }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--o-text2)' }}>{tr('Cette semaine')}</div>
              <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.01em', marginTop: 5 }}>{resume.surface != null ? resume.surface + ' m²' : dureeLisible(resume.dureeMin)}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 3 }}>{resume.n > 1 ? tr('{n} sessions', { n: resume.n }) : tr('{n} session', { n: resume.n })}</div>
            </div>
          )}
        </div>
      )}

      {alerte && (
        <button type="button" className="rb-a-alerte" onClick={() => allerA('entretien')}
          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderRadius: 'var(--o-radius,18px)', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: 'inherit', background: 'rgba(var(--o-warn-rgb),.13)' }}>
          <span style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--o-warn-rgb),.2)' }}><Fi i="triangle-warning" size={16} color="var(--o-warn)" /></span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 800 }}>{tr('Entretien recommandé')}</span>
            <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--o-text2)', marginTop: 2 }}>{tr('{nom} à {n} %', { nom: alerte.nom, n: alerte.pct })}</span>
          </span>
          <Fi i="angle-right" size={12} color="var(--o-text2)" />
        </button>
      )}
    </div>
  );
}

/* ════════════ La carte et les zones ════════════ */

function OngletZones({ domaine, robot, zones, nChoisies, basculerZone, peutChoisir, lancer, carte, camera }) {
  const travail = domaine === 'lawn_mower' ? tr('Tonte') : tr('Nettoyage');
  const enRoute = robot.phase === 'travail' || robot.phase === 'pause';
  return (
    <div className="rb-zones">
      {carte && <div style={{ ...PANNEAU, padding: 14 }}>{carte}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
        {zones.length > 0 && (
          <div style={{ ...PANNEAU, padding: '4px 0' }}>
            {zones.map((z, i) => (
              <button key={z.id} type="button" onClick={() => basculerZone(z)} disabled={!peutChoisir || z.inerte} aria-pressed={!!z.choisie}
                style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '14px 18px', border: 'none', borderTop: i ? 'var(--o-bw,1px) solid var(--o-bd3)' : 'none', background: 'none', cursor: peutChoisir && !z.inerte ? 'pointer' : 'default', textAlign: 'left', fontFamily: 'inherit', color: 'inherit', opacity: z.inerte ? .5 : 1 }}>
                {peutChoisir && <Case on={!!z.choisie} />}
                <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{z.nom}</span>
                {z.couleur && <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 4, background: z.couleur, flexShrink: 0 }} />}
              </button>
            ))}
          </div>
        )}
        {peutChoisir && !enRoute && (
          <button type="button" onClick={lancer} disabled={!nChoisies}
            style={{ padding: '15px 12px', borderRadius: 14, border: 'none', cursor: nChoisies ? 'pointer' : 'default', fontSize: 14.5, fontWeight: 800, fontFamily: 'inherit', background: 'var(--rb-fond)', color: '#fff', opacity: nChoisies ? 1 : .45 }}>
            {nChoisies ? travail + ' · ' + (nChoisies > 1 ? tr('{n} zones', { n: nChoisies }) : tr('{n} zone', { n: nChoisies })) : tr('Sélectionne une zone')}
          </button>
        )}
        {camera}
      </div>
    </div>
  );
}

/* ════════════ L'historique ════════════ */

function OngletHistorique({ domaine, sessions, resume, chargee, erreur = false }) {
  // Un historique qui ne se lit pas n'est pas un historique vide (audit 18/09).
  if (erreur) return <div role="alert" style={{ ...PANNEAU, fontSize: 13, fontWeight: 600, color: 'var(--o-text2)' }}>{tr('Historique indisponible pour le moment')}</div>;
  if (!chargee) return <div style={{ ...PANNEAU, fontSize: 13, fontWeight: 600, color: 'var(--o-text2)' }}>{tr('Lecture de l’historique…')}</div>;
  const parSurface = resume.surface != null;
  const max = Math.max(1, ...resume.jours.map(j => (parSurface ? j.surface : j.dureeMin)));
  const heure = (t) => new Date(t).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  const jourLong = (t) => { const e = etiquetteJour(t, Date.now(), locale()); return e === tr('Auj.') ? tr("Aujourd'hui") : e === tr('Hier') ? tr('Hier') : new Date(t).toLocaleDateString(locale(), { weekday: 'long' }).replace(/^./, c => c.toUpperCase()); };
  return (
    <div className="rb-histo">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
        <div style={{ borderRadius: 'var(--o-radius,18px)', padding: '16px 20px', background: 'rgba(var(--rb-rgb),.14)', display: 'grid', gridTemplateColumns: 'repeat(' + (parSurface ? 3 : 2) + ', minmax(0, 1fr))', gap: 10 }}>
          {parSurface && <div><div style={PETITES_CAPITALES}>{tr('Surface')}</div><div style={{ fontSize: 21, fontWeight: 800, marginTop: 4 }}>{resume.surface} m²</div></div>}
          <div><div style={PETITES_CAPITALES}>{tr('Durée')}</div><div style={{ fontSize: 21, fontWeight: 800, marginTop: 4 }}>{dureeLisible(resume.dureeMin)}</div></div>
          <div><div style={PETITES_CAPITALES}>{tr('Sessions')}</div><div style={{ fontSize: 21, fontWeight: 800, marginTop: 4 }}>{resume.n}</div></div>
        </div>
        <div role="img" aria-label={tr('Cette semaine')} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6, alignItems: 'end', height: 86 }}>
          {resume.jours.map(j => {
            const v = parSurface ? j.surface : j.dureeMin;
            return (
              <div key={j.date.getTime()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 6, height: '100%' }}>
                <div style={{ width: '100%', height: Math.max(4, Math.round(60 * v / max)), borderRadius: 8, background: j.aujourdhui ? 'var(--rb-fond)' : v ? 'rgba(var(--rb-rgb),.22)' : 'var(--o-s2)' }} />
                <span style={{ ...PETITES_CAPITALES, fontSize: 9.5, color: j.aujourdhui ? 'var(--o-text)' : 'var(--o-text3)' }}>{j.date.toLocaleDateString(locale(), { weekday: 'narrow' })}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ ...PANNEAU, padding: '4px 0' }}>
        {sessions.length === 0 && <div style={{ padding: '16px 20px', fontSize: 13, fontWeight: 600, color: 'var(--o-text2)' }}>{tr('Aucune session ces 14 derniers jours.')}</div>}
        {sessions.slice(0, 12).map((s, i) => (
          <div key={s.debut} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 18px', borderTop: i ? 'var(--o-bw,1px) solid var(--o-bd3)' : 'none' }}>
            <span style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 800, background: s.issue === 'termine' || s.issue === 'en_cours' ? 'rgba(var(--rb-rgb),.14)' : 'rgba(var(--o-warn-rgb),.16)', color: s.issue === 'termine' || s.issue === 'en_cours' ? 'var(--rb-doux)' : 'var(--o-warn)' }}>{etiquetteJour(s.debut, Date.now(), locale())}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{domaine === 'lawn_mower' ? tr('Tonte') : tr('Nettoyage')}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{jourLong(s.debut)} {heure(s.debut)} · {dureeLisible(s.dureeMin)}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              {s.surface != null && <div style={{ fontSize: 14, fontWeight: 800 }}>{s.surface} m²</div>}
              <div style={{ fontSize: 12, fontWeight: 700, color: s.issue === 'termine' ? 'var(--o-text2)' : s.issue === 'en_cours' ? 'var(--o-ok)' : s.issue === 'erreur' ? 'var(--o-bad)' : 'var(--o-warn)' }}>{motIssue(s.issue)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ════════════ L'entretien ════════════ */

function OngletEntretien({ hass, pieces, compteurs }) {
  const presse = pieces.filter(p => p.niveau === 'bas').length;
  const aReset = pieces.some(p => p.reset);
  const presser = (id) => commanderService(hass, id, 'button', 'press', { entity_id: id });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {pieces.length > 0 && (
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--o-text2)', lineHeight: 1.5, maxWidth: 640 }}>
          {presse ? (presse > 1 ? tr('{n} éléments à remplacer bientôt.', { n: presse }) : tr('1 élément à remplacer bientôt.')) : tr('Rien à remplacer pour le moment.')}
          {aReset ? ' ' + tr('Appuie sur le bouton après l’intervention pour remettre le compteur à neuf.') : ''}
        </div>
      )}
      {pieces.length > 0 && (
        <div className="rb-pieces">
          {pieces.map(p => (
            <div key={p.id} style={PANNEAU}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ fontSize: 15, fontWeight: 800, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nom}</div>
                {p.pct != null && <div style={{ fontSize: 19, fontWeight: 800, color: COULEUR_NIVEAU[p.niveau], fontVariantNumeric: 'tabular-nums' }}>{p.pct} %</div>}
              </div>
              {p.texte && <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--o-text2)', marginTop: 3 }}>{p.texte}</div>}
              {p.pct != null && <Gauge pct={p.pct} color={COULEUR_NIVEAU[p.niveau]} h={5} style={{ marginTop: 12 }} />}
              {p.reset && <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}><BoutonConfirme libelle={tr('Remplacé')} onConfirme={() => presser(p.reset)} /></div>}
            </div>
          ))}
        </div>
      )}
      {compteurs.length > 0 && (<>
        <div style={TITRE_SECTION}>{tr('Compteurs')}</div>
        <div style={{ ...PANNEAU, padding: '4px 0', maxWidth: 640 }}>
          {compteurs.map((c, i) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '13px 18px', borderTop: i ? 'var(--o-bw,1px) solid var(--o-bd3)' : 'none' }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--o-text2)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nom}</span>
              <span style={{ fontSize: 14, fontWeight: 800, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{c.valeur.toLocaleString(locale(), { maximumFractionDigits: 1 })}{c.unite ? ' ' + c.unite : ''}</span>
            </div>
          ))}
        </div>
      </>)}
    </div>
  );
}

/* ════════════ Les réglages ════════════ */

const PasAPas = ({ valeur, moins, plus, peutMoins = true, peutPlus = true }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: 4, borderRadius: 12, background: 'var(--o-s2)', flexShrink: 0 }}>
    <button type="button" onClick={moins} disabled={!peutMoins} aria-label={tr('Moins')} style={{ width: 32, height: 32, borderRadius: 9, border: 'none', cursor: 'pointer', background: 'var(--o-s1)', color: 'var(--o-text1)', fontSize: 16, fontWeight: 800, opacity: peutMoins ? 1 : .4 }}>−</button>
    <span style={{ minWidth: 64, padding: '0 6px', textAlign: 'center', fontSize: 13.5, fontWeight: 800, whiteSpace: 'nowrap' }}>{valeur}</span>
    <button type="button" onClick={plus} disabled={!peutPlus} aria-label={tr('Plus')} style={{ width: 32, height: 32, borderRadius: 9, border: 'none', cursor: 'pointer', background: 'var(--o-s1)', color: 'var(--o-text1)', fontSize: 16, fontWeight: 800, opacity: peutPlus ? 1 : .4 }}>+</button>
  </span>
);

function LigneReglage({ hass, r }) {
  const appel = (domaine, service, data) => commanderService(hass, r.id, domaine, service, { entity_id: r.id, ...data });
  let commande = null;
  if (r.type === 'bascule') commande = <Bascule on={r.actif} nom={r.nom} cb={() => appel('switch', r.actif ? 'turn_off' : 'turn_on', {})} />;
  else if (r.type === 'choix') {
    const i = r.options.indexOf(r.valeur);
    commande = <PasAPas valeur={vacOption(r.valeur)} peutMoins={i > 0} peutPlus={i >= 0 && i < r.options.length - 1}
      moins={() => appel('select', 'select_option', { option: r.options[i - 1] })} plus={() => appel('select', 'select_option', { option: r.options[i + 1] })} />;
  } else {
    const v = r.valeur;
    commande = <PasAPas valeur={String(v).replace('.', ',') + (r.unite ? ' ' + r.unite : '')} peutMoins={r.min == null || v - r.pas >= r.min} peutPlus={r.max == null || v + r.pas <= r.max}
      moins={() => appel('number', 'set_value', { value: Math.round((v - r.pas) * 1000) / 1000 })} plus={() => appel('number', 'set_value', { value: Math.round((v + r.pas) * 1000) / 1000 })} />;
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '13px 18px', borderTop: 'var(--o-bw,1px) solid var(--o-bd3)' }}>
      <span style={{ fontSize: 14.5, fontWeight: 700, minWidth: 0 }}>{r.nom}</span>{commande}
    </div>
  );
}

function PageReglages({ hass, domaine, robot, reglages, fiche, retour, onFiche = null }) {
  const [tout, setTout] = useState(false);
  const a = (robot.st && robot.st.attributes) || {};
  const vitesses = domaine === 'vacuum' && Array.isArray(a.fan_speed_list) ? a.fan_speed_list : [];
  const iv = vitesses.indexOf(a.fan_speed);
  const regler = (v) => commanderService(hass, robot.id, 'vacuum', 'set_fan_speed', { entity_id: robot.id, fan_speed: v });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
      <div style={{ ...PANNEAU, padding: '4px 0' }}>
        <div style={{ padding: '13px 18px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)' }}>{tr('Nom du robot')}</div>
          <div style={{ fontSize: 15.5, fontWeight: 800, marginTop: 2 }}>{robot.nom}</div>
        </div>
        {vitesses.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '13px 18px', borderTop: 'var(--o-bw,1px) solid var(--o-bd3)' }}>
            <span><span style={{ display: 'block', fontSize: 14.5, fontWeight: 700 }}>{tr('Puissance')}</span><span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 2 }}>{tr('Niveau d’aspiration')}</span></span>
            <PasAPas valeur={iv >= 0 ? vacOption(a.fan_speed) : '—'} peutMoins={iv > 0} peutPlus={iv >= 0 && iv < vitesses.length - 1} moins={() => regler(vitesses[iv - 1])} plus={() => regler(vitesses[iv + 1])} />
          </div>
        )}
        {reglages.principaux.map(r => <LigneReglage key={r.id} hass={hass} r={r} />)}
      </div>
      {(fiche.length > 0 || onFiche) && (
        <div style={{ ...PANNEAU, padding: '4px 0' }}>
          {fiche.map((l, i) => (
            <div key={l.cle} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '13px 18px', borderTop: i ? 'var(--o-bw,1px) solid var(--o-bd3)' : 'none' }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--o-text2)' }}>{l.nom}</span>
              <span style={{ fontSize: 14, fontWeight: 800, textAlign: 'right', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.valeur}</span>
            </div>
          ))}
          {/* La carte du robot mène à cette vue, plus à sa fiche : l'épingle, les
            * commandes de l'appareil et toutes ses entités restent à un geste. */}
          {onFiche && (
            <button type="button" onClick={onFiche}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%', padding: '13px 18px', border: 'none', borderTop: fiche.length ? 'var(--o-bw,1px) solid var(--o-bd3)' : 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit', textAlign: 'left' }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700 }}>{tr('Fiche de l’appareil')}</span>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 2 }}>{tr('L’épingle, les commandes et toutes ses entités')}</span>
              </span>
              <Fi i="angle-right" size={12} color="var(--o-text2)" />
            </button>
          )}
        </div>
      )}
      {reglages.autres.length > 0 && (
        <div style={{ ...PANNEAU, padding: '4px 0' }}>
          <button type="button" onClick={() => setTout(v => !v)} aria-expanded={tout}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%', padding: '14px 18px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit', textAlign: 'left' }}>
            <span style={{ fontSize: 14.5, fontWeight: 700 }}>{tr('Tous les réglages de l’appareil')} · {reglages.autres.length}</span>
            <Fi i={tout ? 'angle-small-up' : 'angle-small-down'} size={14} color="var(--o-text2)" />
          </button>
          {tout && reglages.autres.map(r => <LigneReglage key={r.id} hass={hass} r={r} />)}
        </div>
      )}
      <button type="button" onClick={retour} style={{ ...BOUTON_DOUX, padding: '14px 12px', fontSize: 14, borderRadius: 14 }}>{tr('Retour')}</button>
    </div>
  );
}

/* ════════════ Le planning ════════════
 *
 * Aucun robot ne publie son planning : c'est Loggia qui le tient, côté serveur,
 * et qui lance le robot à l'heure (ADR 0043). L'onglet n'existe que si le
 * composant répond. */

const CHAMP_HEURE = { padding: '9px 12px', borderRadius: 12, border: 'var(--o-bw,1px) solid var(--o-bd2)', background: 'var(--o-s2)', color: 'var(--o-text1)', fontSize: 15, fontWeight: 700, fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums', colorScheme: 'inherit' };
const REGLAGES_NEUFS = { calme: { actif: false, debut: '22:00', fin: '07:00' }, pluie: { actif: false } };

const PuceJour = ({ j, on, onClick, taille = 30 }) => (
  <button type="button" onClick={onClick} aria-pressed={on} aria-label={nomJour(j, locale(), 'long')} title={nomJour(j, locale(), 'long')}
    style={{ width: taille, height: taille, borderRadius: '50%', border: 'none', cursor: 'pointer', flexShrink: 0, padding: 0, fontSize: 11.5, fontWeight: 800, fontFamily: 'inherit',
      background: on ? 'var(--o-accent-fond)' : 'var(--o-s2)', color: on ? '#fff' : 'var(--o-text3)' }}>{nomJour(j, locale(), 'narrow')}</button>
);

/* Un champ d'heure qui ne rend la valeur que lorsqu'elle est entière. */
function ChampHeure({ valeur, onValide, nom }) {
  const [v, setV] = useState(valeur);
  useEffect(() => { setV(valeur); }, [valeur]);
  return <input type="time" value={v} aria-label={nom} style={CHAMP_HEURE}
    onChange={(e) => { const n = e.target.value; setV(n); if (heureValide(n) && n !== valeur) onValide(n); }} />;
}

function FeuillePlanning({ depart, neuf, zones, domaine, aDesAires, onEnregistrer, onSupprimer, onClose }) {
  const [p, setP] = useState(depart);
  const jours = ordreJours(premierJourSemaine(locale()));
  const basculerJour = (j) => setP(x => ({ ...x, jours: x.jours.indexOf(j) >= 0 ? x.jours.filter(y => y !== j) : [...x.jours, j].sort() }));
  const basculerZone = (z) => setP(x => ({ ...x, zones: x.zones.some(y => y.id === z.id) ? x.zones.filter(y => y.id !== z.id) : [...x.zones, zonePlanning(z)] }));
  const valide = heureValide(p.heure) && p.jours.length > 0;
  return (
    <BottomSheet onClose={onClose}>
      {close => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ fontSize: 19, fontWeight: 700 }}>{neuf ? tr('Nouveau passage') : tr('Modifier le passage')}</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontSize: 14.5, fontWeight: 700 }}>{tr('Heure')}</span>
            <input type="time" value={p.heure} aria-label={tr('Heure')} onChange={(e) => setP(x => ({ ...x, heure: e.target.value }))} style={CHAMP_HEURE} />
          </div>
          <div>
            <div style={{ ...PETITES_CAPITALES, marginBottom: 9 }}>{tr('Jours')}</div>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>{jours.map(j => <PuceJour key={j} j={j} taille={38} on={p.jours.indexOf(j) >= 0} onClick={() => basculerJour(j)} />)}</div>
          </div>
          {zones.length > 0 && (
            <div>
              <div style={{ ...PETITES_CAPITALES, marginBottom: 9 }}>{tr('Zones')}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {zones.map(z => <Puce key={z.id} on={p.zones.some(y => y.id === z.id)} couleur={z.couleur} onClick={() => basculerZone(z)}>{z.nom}</Puce>)}
              </div>
              {p.zones.length === 0 && <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--o-text2)', marginTop: 9 }}>{resumeZones(p, { domaine, aDesAires })}</div>}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {!neuf && <BoutonConfirme libelle={tr('Supprimer')} onConfirme={() => { onSupprimer(p); close(); }} />}
            <button type="button" disabled={!valide} onClick={() => { onEnregistrer(p); close(); }}
              style={{ flex: 1, padding: '14px 12px', borderRadius: 14, border: 'none', cursor: valide ? 'pointer' : 'default', fontSize: 14.5, fontWeight: 800, fontFamily: 'inherit', background: 'var(--rb-fond)', color: '#fff', opacity: valide ? 1 : .45 }}>{tr('Enregistrer')}</button>
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
  const miens = tous.filter(p => p.robot === robot.id).sort((a, b) => String(a.heure).localeCompare(String(b.heure)));
  const reglages = { ...REGLAGES_NEUFS, ...((cfg.robots || {})[robot.id] || {}) };
  const aDesAires = domaine === 'lawn_mower' && zones.length > 0;
  const pluieNative = domaine === 'lawn_mower' ? capteurPluie(robot.soeurs) : null;
  const jours = ordreJours(premierJourSemaine(locale()));
  const h = hass && typeof hass.callWS === 'function' ? hass : null;

  const enregistrer = async (patch, optimiste) => {
    if (!h) return;
    setEtat(e => (e ? { ...e, config: optimiste(e.config || { plannings: [], robots: {} }) } : e));
    try {
      const r = await h.callWS({ type: 'loggia/robots/config', patch });
      if (vivant.current && r && r.config) { setEtat(e => (e ? { ...e, config: r.config } : e)); setErr(''); }
    } catch (e) {
      setErr(e && e.code === 'unauthorized' ? tr('Réservé aux administrateurs.') : ((e && (e.message || e.code)) || tr('Enregistrement impossible.')));
    }
  };
  const poserPlannings = (liste) => enregistrer({ plannings: liste }, c => ({ ...c, plannings: liste }));
  const poserPlanning = (p) => poserPlannings(tous.some(x => x.id === p.id) ? tous.map(x => (x.id === p.id ? p : x)) : [...tous, p]);
  const retirerPlanning = (p) => poserPlannings(tous.filter(x => x.id !== p.id));
  const poserReglage = (cle, valeur) => enregistrer({ robots: { [robot.id]: { [cle]: valeur } } },
    c => ({ ...c, robots: { ...(c.robots || {}), [robot.id]: { ...reglages, [cle]: { ...reglages[cle], ...valeur } } } }));
  const LIGNE = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '13px 18px' };
  const sous = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 2 };

  return (
    <div className="rb-planning">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
          <div style={TITRE_SECTION}>{tr('Passages planifiés')}</div>
          <button type="button" onClick={() => setFeuille({ p: nouveauPlanning(robot.id), neuf: true })}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 2px', border: 'none', background: 'none', cursor: 'pointer', font: 'inherit', fontSize: 12.5, fontWeight: 700, color: 'var(--rb-doux)' }}><Fi i="plus" size={10} color="var(--rb-doux)" />{tr('Ajouter')}</button>
        </div>
        {err && <div role="alert" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--o-bad)' }}>{err}</div>}
        {miens.length === 0 && <div style={{ ...PANNEAU, fontSize: 13, fontWeight: 600, color: 'var(--o-text2)' }}>{tr('Aucun passage planifié. Loggia lance le robot à l’heure dite, même écran éteint.')}</div>}
        {miens.map(p => {
          const retenu = p.actif && dansLaPlage(reglages.calme, p.heure);
          return (
            <div key={p.id} style={{ ...PANNEAU, padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button type="button" onClick={() => setFeuille({ p, neuf: false })} aria-label={tr('Modifier le passage') + ' ' + p.heure}
                  style={{ flex: 1, minWidth: 0, textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', color: 'inherit', opacity: p.actif ? 1 : .55 }}>
                  <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{p.heure}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--o-text2)', marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resumeZones(p, { domaine, aDesAires })}</div>
                </button>
                <Bascule on={!!p.actif} nom={tr('Passage de {h}', { h: p.heure })} cb={() => poserPlanning({ ...p, actif: !p.actif })} />
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 12, opacity: p.actif ? 1 : .55 }}>
                {jours.map(j => <PuceJour key={j} j={j} on={(p.jours || []).indexOf(j) >= 0}
                  onClick={() => poserPlanning({ ...p, jours: (p.jours || []).indexOf(j) >= 0 ? p.jours.filter(y => y !== j) : [...(p.jours || []), j].sort() })} />)}
              </div>
              {retenu && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-warn)', marginTop: 10 }}>{tr('Dans la plage « Ne pas déranger » : ce passage ne partira pas.')}</div>}
            </div>
          );
        })}
      </div>

      <div style={{ ...PANNEAU, padding: '4px 0', alignSelf: 'start' }}>
        <div style={LIGNE}>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700 }}>{tr('Ne pas déranger')}</span>
            <span style={sous}>{reglages.calme.actif ? tr('Aucun départ planifié entre {a} et {b}', { a: reglages.calme.debut, b: reglages.calme.fin }) : tr('Une plage où Loggia ne lance jamais le robot')}</span>
          </span>
          <Bascule on={!!reglages.calme.actif} nom={tr('Ne pas déranger')} cb={() => poserReglage('calme', { actif: !reglages.calme.actif })} />
        </div>
        {reglages.calme.actif && (
          <div style={{ ...LIGNE, justifyContent: 'flex-start', paddingTop: 0, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--o-text2)' }}>{tr('De')}</span>
            <ChampHeure valeur={reglages.calme.debut} nom={tr('Début')} onValide={(v) => poserReglage('calme', { debut: v })} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--o-text2)' }}>{tr('à')}</span>
            <ChampHeure valeur={reglages.calme.fin} nom={tr('Fin')} onValide={(v) => poserReglage('calme', { fin: v })} />
          </div>
        )}
        {/* La pluie. Le robot a son capteur : c'est LUI qui rentre, l'interrupteur
          * est le sien. Sinon la météo de la maison retient le départ — et sans
          * météo, rien à proposer. */}
        {pluieNative && (
          <div style={{ ...LIGNE, borderTop: 'var(--o-bw,1px) solid var(--o-bd3)' }}>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700 }}>{tr('Capteur de pluie')}</span>
              <span style={sous}>{tr('Le robot rentre de lui-même s’il pleut')}</span>
            </span>
            <Bascule on={pluieNative.actif} nom={tr('Capteur de pluie')} cb={() => commanderService(hass, pluieNative.id, 'switch', pluieNative.actif ? 'turn_off' : 'turn_on', { entity_id: pluieNative.id })} />
          </div>
        )}
        {domaine === 'lawn_mower' && !pluieNative && etat && etat.meteo && (
          <div style={{ ...LIGNE, borderTop: 'var(--o-bw,1px) solid var(--o-bd3)' }}>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700 }}>{tr('Pluie')}</span>
              <span style={sous}>{tr('Pas de départ planifié quand la météo annonce la pluie')}</span>
            </span>
            <Bascule on={!!reglages.pluie.actif} nom={tr('Pluie')} cb={() => poserReglage('pluie', { actif: !reglages.pluie.actif })} />
          </div>
        )}
      </div>

      {feuille && <FeuillePlanning depart={feuille.p} neuf={feuille.neuf} zones={zones} domaine={domaine} aDesAires={aDesAires}
        onEnregistrer={poserPlanning} onSupprimer={retirerPlanning} onClose={() => setFeuille(null)} />}
    </div>
  );
}

/* ════════════ La vue ════════════ */

export default function FicheRobotContent({ hass, idRobot, domaine = 'vacuum', onFiche = null, onClose = null, epingle = null }) {
  const S = (hass && hass.states) || {};
  const { resolved } = useLoggia();
  const entVac = useEntities('vacuum', null) || {};
  const entRooms = useEntities('vacuumRooms', null);
  const robot = lireRobot(hass, domaine, idRobot);

  const vac = domaine === 'vacuum' && resolved && resolved.vacuum && resolved.vacuum.available && resolved.vacuum.main === idRobot ? resolved.vacuum : null;
  const idCarte = domaine === 'vacuum' ? ((vac && vac.map) || (entVac.map && S[entVac.map] ? entVac.map : null) || (robot.soeurs.find(s => s.domaine === 'image') || {}).id || null) : null;
  const idSurface = (vac && vac.area_cleaned) || (robot.soeurs.find(s => s.domaine === 'sensor' && (s.classe === 'area' || /^(m²|m2|ft²)$/.test(s.unite || '')) && !/total/.test(s.texte)) || {}).id || null;
  const idCam = domaine === 'vacuum' && entVac.camera && S[entVac.camera] ? entVac.camera : null;

  /* Les zones. Aspirateur : les pièces que le robot annonce, rattachées aux
   * zones configurées (interrupteur, couleur). Tondeuse : les interrupteurs
   * d'aire de son appareil. */
  const pieces = domaine === 'vacuum' ? vacRooms(hass, idRobot, entRooms || []) : [];
  const aires = domaine === 'lawn_mower' ? zonesTondeuse(robot.soeurs) : [];
  const scripts = loggiaEnt('vacuumScripts', null) || {};
  const parInterrupteurs = domaine === 'vacuum' && pieces.some(p => p.toggle) && !!(scripts.pieces_selectionnees && S[scripts.pieces_selectionnees]);
  const [choixLocal, setChoixLocal] = useState({}); // sans interrupteur : id de pièce → vrai
  const commande = (segments) => commandeZones({ plateforme: robot.plateforme, services: LOGGIA_INDEX && LOGGIA_INDEX.services, idRobot, segments });
  const parCommande = domaine === 'vacuum' && !parInterrupteurs && pieces.some(p => (p.segments || []).length) && !!commande([1]);
  const peutChoisir = domaine === 'lawn_mower' ? aires.length > 0 : (parInterrupteurs || parCommande);
  const zones = domaine === 'lawn_mower'
    ? aires.map(z => ({ id: z.id, nom: z.nom, choisie: z.actif, couleur: null, inerte: false }))
    : pieces.map(p => ({ id: p.id, nom: p.name, couleur: p.color || null, piece: p, inerte: parInterrupteurs ? !p.toggle : false,
        choisie: parInterrupteurs ? !!(p.toggle && S[p.toggle] && S[p.toggle].state === 'on') : !!choixLocal[p.id] }));
  const nChoisies = zones.filter(z => z.choisie).length;
  // Ce qu'un PLANNING peut viser : le serveur n'a ni script maison ni sélection
  // à l'écran — il lui faut les segments et une intégration qu'il sait commander.
  const zonesPlanifiables = domaine === 'lawn_mower' ? zones : (commande([1]) ? zones.filter(z => ((z.piece && z.piece.segments) || []).length > 0) : []);
  const appel = (d, s, data) => commanderService(hass, (data || {}).entity_id, d, s, data || {});
  const basculerZone = (z) => {
    if (!peutChoisir || z.inerte) return;
    if (domaine === 'lawn_mower') appel('switch', z.choisie ? 'turn_off' : 'turn_on', { entity_id: z.id });
    else if (parInterrupteurs) appel('input_boolean', z.choisie ? 'turn_off' : 'turn_on', { entity_id: z.piece.toggle });
    else setChoixLocal(s => ({ ...s, [z.id]: !s[z.id] }));
  };

  /* Les gestes. Un script maison fait souvent plus que le service standard : on
   * le garde quand il existe (`vacuumScripts`), et l'on retombe sinon sur le
   * service du domaine, disponible chez tout le monde. */
  const scriptOu = (cle, service) => {
    const sc = domaine === 'vacuum' ? scripts[cle] : null;
    if (sc && S[sc]) appel('script', 'turn_on', { entity_id: sc });
    else appel(domaine, service, { entity_id: idRobot });
  };
  const lancer = () => {
    const action = actionPrincipale(domaine, robot.etat, peutChoisir ? nChoisies : 0);
    if (!action.service) return;
    if (action.cle === 'pause') { scriptOu('pause', 'pause'); return; }
    if (action.cle === 'reprendre') { scriptOu('reprendre', action.service); return; }
    if (domaine === 'vacuum' && nChoisies > 0) {
      if (parInterrupteurs) { appel('script', 'turn_on', { entity_id: scripts.pieces_selectionnees }); return; }
      const c = commande(zones.filter(z => z.choisie).flatMap(z => z.piece.segments || []));
      if (c) { appel(c.domaine, c.service, c.data); return; }
    }
    scriptOu('nettoyer_tout', action.service);
  };
  const rentrer = () => scriptOu('retour_base', serviceRetour(domaine));

  // L'historique, l'entretien, les réglages.
  const reponse = useHistoriqueRobot(hass, idRobot, idSurface, robot.etat);
  const histoErreur = reponse === 'erreur';
  const brut = histoErreur ? null : reponse;
  // Le planning : tenu par le composant. Sans réponse de sa part, ni onglet ni tuile.
  const planning = useEtatServeur(hass, 'loggia/robots/etat', 15000, '');
  const sessions = useMemo(() => {
    if (!brut) return [];
    const de = (id) => (brut.find(l => l && l[0] && l[0].entity_id === id) || []);
    return sessionsRobot(de(idRobot), { domaine, surfaces: idSurface ? de(idSurface) : [] });
  }, [brut, idRobot, idSurface, domaine]);
  const resume = useMemo(() => resumeSemaine(sessions, Date.now(), premierJourSemaine(locale())), [sessions]);
  const usure = piecesUsure(robot.soeurs);
  const compteurs = compteursRobot(robot.soeurs);
  const reglages = reglagesRobot(robot.soeurs);
  const fiche = ficheTechnique(robot.appareil, robot.soeurs);

  const onglets = [
    ['accueil', tr('Accueil'), 'home'],
    ...(zones.length || idCarte ? [['zones', idCarte ? tr('Carte') : tr('Zones'), 'map']] : []),
    ...(planning.etat ? [['planning', tr('Planning'), 'calendar-clock']] : []),
    ['historique', tr('Historique'), 'time-past'],
    ...(usure.length || compteurs.length ? [['entretien', tr('Entretien'), 'wrench-simple']] : []),
  ];
  const [onglet, setOnglet] = useState('accueil');
  const actuel = onglet === 'reglages' || onglets.some(o => o[0] === onglet) ? onglet : 'accueil';

  if (!idRobot || !robot.st) {
    return (
      <div className="o-panne" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 14px 6px 6px', borderRadius: 30 }}>
        <button type="button" onClick={onClose || undefined} aria-label={tr('Fermer')} title={tr('Fermer')} style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--o-s1)', border: 'none', color: 'var(--o-text1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--o-text2)' }}>{tr('Ce robot ne répond plus.')}</div>
      </div>
    );
  }

  const planDe = () => (
    <Suspense fallback={<div style={{ aspectRatio: '16/10', borderRadius: 14, background: 'var(--o-well2)' }} />}>
      <VacPlan hass={hass} haid={idCarte} zones={pieces} selection={Object.fromEntries(zones.map(z => [z.id, !!z.choisie]))} onToggle={(p) => { const z = zones.find(x => x.id === p.id); if (z) basculerZone(z); }} />
    </Suspense>
  );
  const camera = idCam ? (
    <div style={{ ...PANNEAU, padding: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>{tr('Caméra')}</div>
      <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', aspectRatio: '16/10', background: 'var(--o-well2)' }}><CamLive hass={hass} haid={idCam} /></div>
    </div>
  ) : null;
  // Le prochain départ planifié, s'il y en a un.
  const echeance = planning.etat ? prochainPassage((planning.etat.config || {}).plannings, idRobot, Date.now()) : null;
  const prochain = echeance ? {
    titre: etiquetteProchain(echeance.date, Date.now(), locale()),
    sous: resumeZones(echeance.planning, { domaine, aDesAires: domaine === 'lawn_mower' && zones.length > 0 }),
  } : null;
  // Le dernier passage FINI : un robot en plein travail en a un aussi.
  const finie = sessions.find(x => x.issue !== 'en_cours') || null;
  const derniere = finie ? {
    titre: etiquetteJour(finie.debut, Date.now(), locale()) + ' ' + new Date(finie.debut).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }),
    sous: [dureeLisible(finie.dureeMin), finie.surface != null ? finie.surface + ' m²' : null, motIssue(finie.issue)].filter(Boolean).join(' · '),
  } : null;

  return (
    <div className={'rb-fiche ' + (domaine === 'lawn_mower' ? 'rb-tondeuse' : 'rb-aspirateur')} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* L'en-tête des fiches : fermer, le nom, l'épingle — et la roue des réglages. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="button" onClick={onClose || undefined} aria-label={tr('Fermer')} title={tr('Fermer')} style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--o-s1)', border: 'none', color: 'var(--o-text1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 19, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{actuel === 'reglages' ? tr('Réglages') : robot.nom}</div>
          {actuel === 'reglages' && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{robot.nom}</div>}
        </div>
        {actuel !== 'reglages' && epingle}
        {actuel !== 'reglages' && (
          <button type="button" onClick={() => setOnglet('reglages')} aria-label={tr('Réglages')} title={tr('Réglages')}
            style={{ width: 34, height: 34, borderRadius: 10, border: 'none', cursor: 'pointer', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--o-s1)', color: 'var(--o-text1)' }}><Fi i="settings" size={14} /></button>
        )}
      </div>

      {actuel !== 'reglages' && onglets.length > 1 && (
        <div role="tablist" aria-label={robot.nom} className="rb-onglets" style={{ '--rb-n': onglets.length }}>
          {onglets.map(([id, nom, icone]) => (
            <button key={id} type="button" role="tab" aria-selected={actuel === id} onClick={() => setOnglet(id)} className="rb-onglet"
              style={{ background: actuel === id ? 'var(--o-accent-fond)' : 'transparent', color: actuel === id ? '#fff' : 'var(--o-text2)' }}>
              <Fi i={icone} size={15} /><span>{nom}</span>
            </button>
          ))}
        </div>
      )}

      {actuel === 'accueil' && <OngletAccueil domaine={domaine} robot={robot} zones={zones} nChoisies={nChoisies} basculerZone={basculerZone} peutChoisir={peutChoisir} lancer={lancer} rentrer={rentrer}
        resume={brut ? resume : null} derniere={derniere} prochain={prochain} alerte={alerteEntretien(usure)} aUneCarte={!!idCarte} allerA={setOnglet} />}
      {actuel === 'zones' && <OngletZones domaine={domaine} robot={robot} zones={zones} nChoisies={nChoisies} basculerZone={basculerZone} peutChoisir={peutChoisir} lancer={lancer} carte={idCarte ? planDe() : null} camera={camera} />}
      {actuel === 'planning' && <OngletPlanning hass={hass} domaine={domaine} robot={robot} zones={zonesPlanifiables} planning={planning} />}
      {actuel === 'historique' && <OngletHistorique domaine={domaine} sessions={sessions} resume={resume} chargee={!!brut} erreur={histoErreur} />}
      {actuel === 'entretien' && <OngletEntretien hass={hass} pieces={usure} compteurs={compteurs} />}
      {actuel === 'reglages' && <PageReglages hass={hass} domaine={domaine} robot={robot} reglages={reglages} fiche={fiche} retour={() => setOnglet('accueil')} onFiche={onFiche ? () => onFiche(idRobot) : null} />}
    </div>
  );
}
