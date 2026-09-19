/* ── La vue Systeme ─────────────────────────────────────────────────────────
 *
 * Chargee a la demande : on l'ouvre pour regarder l'etat de la machine, pas au
 * demarrage du tableau de bord. Elle ne partage avec le reste que la lecture de
 * l'historique (`historique.jsx`) — le journal de la maison l'a quittee le 17/09.
 *
 * La page d'une machine Home Assistant OS (ADR 0037) : les mesures en tuiles, la
 * charge de la derniere heure, les versions, les modules complementaires, le
 * journal et le reseau. Tout ce qui se CALCULE vit dans `systeme.js`, teste a
 * sec ; ici il ne reste que les lectures et le dessin.
 *
 * RIEN NE S'AFFICHE SANS SOURCE. Les capteurs viennent de la table de
 * `sysconf.js` ; le Superviseur (`supervisor/api`) ne repond qu'a un
 * administrateur, sur une installation qui en a un. Un bloc sans donnee ne se
 * dessine pas — ni tirets, ni valeurs de decor.
 *
 * `SystemeContent` est l'export par defaut, comme `views/meteo.jsx`. */
import { useState, useEffect, useRef } from 'react';
import { Fi, Gauge, Bascule, BottomSheet, TitreFeuille } from '../ui.jsx';
import { tr } from '../i18n.js';
import { useSysHist } from '../historique.jsx';
import { sysSensors, sysNames } from '../sysconf.js';
import { LOGGIA_INDEX } from '../state.js';
import {
  tuilesMesures, seaux, resumeSerie, lignesVersions, derniereSauvegarde, momentLisible, modulesComplementaires,
  interfaceReseau, debitLisible, baseDeDonnees, etatCloud, journalSysteme, alertesSysteme, nomCarte, dureeLisible,
  depuisDemarrage, dureeCapteur, enOctets, tailleLisible, paireTailles, nombre,
} from '../systeme.js';

/* Le gabarit des cartes de la maison, repris de `RM_CARD` (App.jsx) : l'icone
 * en haut a gauche, la metrique ou la bascule en haut a droite, le titre SOUS
 * l'icone, le contenu ensuite ; hauteur standard, sans bordure. La vue est un
 * morceau a part : elle ne peut pas importer le monolithe, elle en recopie les
 * valeurs — tests/systeme_hoas.test.mjs verifie qu'elles restent les memes. */
const SYS_FOND = 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))';
const SYS_CARTE = { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 172, padding: 16, borderRadius: 'var(--o-radius,18px)', background: SYS_FOND, border: 'none', boxShadow: 'var(--o-shadow,0 6px 16px rgba(0,0,0,.26))', boxSizing: 'border-box', minWidth: 0 };
const SYS_ICO = (rgb, col) => ({ width: 38, height: 38, borderRadius: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(' + rgb + ',.16)', color: col });
const SYS_NOM = { fontSize: 14, fontWeight: 700, color: 'var(--o-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const SYS_SOUS = { fontSize: 12, fontWeight: 600, color: 'var(--o-text3)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const SYS_PANNEAU = { background: SYS_FOND, border: 'none', borderRadius: 'var(--o-radius,18px)', padding: '18px 20px', boxShadow: 'var(--o-shadow,0 10px 26px rgba(0,0,0,.3))', boxSizing: 'border-box', minWidth: 0 };
const SYS_BADGE = (rgb, col) => ({ flexShrink: 0, padding: '4px 9px', borderRadius: 9, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', background: 'rgba(' + rgb + ',.14)', color: col });
const COULEUR_NIVEAU = { warn: 'var(--o-warn2)', bad: 'var(--o-bad)' };
const ESPACE = String.fromCharCode(160);

/* ── Les lectures ────────────────────────────────────────────────────────────
 * Home Assistant REMPLACE son objet `hass` a chaque changement d'etat : un
 * effet qui en dependrait relancerait ses requetes plusieurs fois par seconde.
 * Chaque lecture passe donc par une reference vivante, comme `useEtatServeur`,
 * et ne depend que d'un booleen et du tour de rafraichissement. */
function useHassVivant(hass) {
  const ref = useRef(hass);
  useEffect(() => { ref.current = hass; });
  return ref;
}

const POINTS_SUPERVISEUR = ['/host/info', '/os/info', '/core/info', '/supervisor/info', '/addons', '/backups', '/network/info'];

/* Le Superviseur : sept lectures, puis les mesures des modules DEMARRES. Un
 * point qui ne repond pas (pas d'administrateur, pas de Superviseur) vaut
 * `null`, et son bloc ne se dessine pas. */
function useSuperviseur(hass, tour) {
  const [d, setD] = useState({});
  const hRef = useHassVivant(hass);
  const connecte = !!(hass && typeof hass.callWS === 'function');
  useEffect(() => {
    let vivant = true;
    if (!connecte) return undefined;
    const lire = (endpoint) => hRef.current.callWS({ type: 'supervisor/api', endpoint, method: 'get' }).catch(() => null);
    Promise.all(POINTS_SUPERVISEUR.map(lire)).then(([host, os, core, supervisor, addons, backups, network]) => {
      if (!vivant) return;
      const liste = (addons && addons.addons) || null;
      setD(avant => ({ ...avant, host, os, core, supervisor, addons: liste, backups: (backups && backups.backups) || null, network }));
      const demarres = (liste || []).filter(a => a && a.state === 'started');
      Promise.all(demarres.map(a => lire('/addons/' + a.slug + '/stats').then(s => [a.slug, s]))).then(paires => {
        if (!vivant) return;
        const stats = {};
        paires.forEach(([slug, s]) => { if (s) stats[slug] = s; });
        setD(avant => ({ ...avant, stats }));
      });
    });
    return () => { vivant = false; };
  }, [connecte, tour, hRef]);
  return d;
}

/* Une commande WebSocket lue une fois par tour : le journal d'erreurs, l'etat
 * de Nabu Casa. */
function useLectureWS(hass, type, tour) {
  const [r, setR] = useState(null);
  const hRef = useHassVivant(hass);
  const connecte = !!(hass && typeof hass.callWS === 'function');
  useEffect(() => {
    let vivant = true;
    if (!connecte) return undefined;
    hRef.current.callWS({ type }).then(x => { if (vivant) setR(x); }).catch(() => { if (vivant) setR(null); });
    return () => { vivant = false; };
  }, [connecte, type, tour, hRef]);
  return r;
}

/* Ce que l'enregistreur dit de sa base. `system_health/info` est un FLUX : il
 * rend d'abord ce qu'il sait, puis les verifications lentes une a une, puis
 * « finish ». Lu une seule fois a l'ouverture — il sonde aussi le cloud, et la
 * taille d'une base ne bouge pas a la minute. */
function useInfoBase(hass) {
  const [info, setInfo] = useState(null);
  const hRef = useHassVivant(hass);
  const connecte = !!(hass && hass.connection && typeof hass.connection.subscribeMessage === 'function');
  useEffect(() => {
    if (!connecte) return undefined;
    let fini = false, stop = null;
    const fermer = (f) => { try { f(); } catch { /* deja ferme */ } };
    const arreter = () => { fini = true; if (stop) { fermer(stop); stop = null; } };
    hRef.current.connection.subscribeMessage((ev) => {
      if (fini || !ev) return;
      if (ev.type === 'initial' && ev.data && ev.data.recorder) setInfo(ev.data.recorder.info || null);
      if (ev.type === 'update' && ev.domain === 'recorder' && ev.success) setInfo(avant => ({ ...(avant || {}), [ev.key]: ev.data }));
      if (ev.type === 'finish') arreter();
    }, { type: 'system_health/info' }).then(u => { if (fini) fermer(u); else stop = u; }).catch(() => { /* pas d'administrateur : la ligne ne s'affiche pas */ });
    return arreter;
  }, [connecte, hRef]);
  return info;
}

/* Le logbook des entites systeme (mises a jour, machine en ligne), 24 h. */
function useJournalEntites(hass, ids, tour) {
  const [r, setR] = useState(null);
  const hRef = useHassVivant(hass);
  const connecte = !!(hass && typeof hass.callApi === 'function');
  useEffect(() => {
    let vivant = true;
    if (!connecte || !ids) { setR(null); return undefined; }
    const debut = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    hRef.current.callApi('GET', 'logbook/' + debut + '?entity=' + encodeURIComponent(ids))
      .then(res => { if (vivant) setR(Array.isArray(res) ? res : null); })
      .catch(() => { if (vivant) setR(null); });
    return () => { vivant = false; };
  }, [connecte, ids, tour, hRef]);
  return r;
}

/* ── Les morceaux ──────────────────────────────────────────────────────────── */
function EntetePanneau({ titre, sous = null, droite = null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>{titre}</div>
        {sous && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 2 }}>{sous}</div>}
      </div>
      {droite}
    </div>
  );
}

/* Une mesure : l'icone a gauche, le chiffre a droite, le titre dessous, la
 * jauge en pied. La ligne du dessous est TOUJOURS reservee, pour que les titres
 * s'alignent d'une tuile a l'autre. Au telephone la rangee reste sur une ligne
 * (index.css) : l'icone passe au-dessus, le titre court remplace le long. */
function TuileMesure({ t }) {
  const col = COULEUR_NIVEAU[t.niveau] || t.couleur;
  return (
    <div className="sys-mesure" style={SYS_CARTE}>
      <div className="sys-mesure-tete" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <span className="sys-mesure-ico" style={SYS_ICO(t.rgb, t.couleur)}><Fi i={t.icone} size={17} color={t.couleur} /></span>
        <span className="sys-mesure-val" style={{ fontSize: 24, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: t.niveau === 'ok' ? 'var(--o-text)' : col }}>{t.valeur}</span>
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="sys-mesure-titre" style={SYS_NOM}>{t.titre}</div>
        <div className="sys-mesure-court" style={{ ...SYS_NOM, display: 'none' }}>{t.court}</div>
        <div className="sys-mesure-sous" style={SYS_SOUS}>{t.sous || ESPACE}</div>
        <Gauge pct={t.pct} color={col} h={5} style={{ marginTop: 12 }} />
      </div>
    </div>
  );
}

/* La charge de la derniere heure, une barre par minute. L'echelle suit le pic :
 * un processeur a 18 % dessinerait sinon soixante traits au ras du sol.
 *
 * Le panneau prend la HAUTEUR de son voisin, la carte Versions (retour du
 * 17/09) : la grille etire les deux, et ce sont les barres qui absorbent la
 * difference. Elles vivent dans un cadre positionne — des hauteurs en pourcent
 * ne se resolvent que contre une boite de taille connue (index.css). */
function PanneauCharge({ series, releve }) {
  const [mode, setMode] = useState(series[0].cle);
  const s = series.find(x => x.cle === mode) || series[0];
  const vals = seaux(s.points, releve);
  const r = resumeSerie(vals);
  const haut = r ? Math.max(r.pic * 1.15, 5) : 100;
  const bascule = series.length > 1 && (
    <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 10, background: 'var(--o-s2)', flexShrink: 0 }}>
      {series.map(x => (
        <button key={x.cle} type="button" onClick={() => setMode(x.cle)} aria-pressed={x.cle === s.cle}
          style={{ padding: '5px 10px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', background: x.cle === s.cle ? 'var(--o-accent-fond)' : 'transparent', color: x.cle === s.cle ? '#fff' : 'var(--o-text2)' }}>{x.nom}</button>
      ))}
    </div>
  );
  return (
    <div className="sys-charge" style={{ ...SYS_PANNEAU, display: 'flex', flexDirection: 'column' }}>
      <EntetePanneau titre={tr('Charge') + ' · ' + tr('60 dernières minutes')}
        sous={r ? tr('moy. {n} %', { n: nombre(r.moyenne) }) + ' · ' + tr('pic {n} %', { n: nombre(r.pic) }) : null} droite={bascule} />
      {r ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
            {/* Le chiffre du MOMENT, celui de la tuile — la derniere barre, elle, est une moyenne de minute. */}
            <span style={{ fontSize: 30, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: s.couleur }}>{nombre(s.actuel != null ? s.actuel : r.dernier)} %</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-text2)' }}>{s.nom}</span>
          </div>
          <div className="sys-barres-cadre">
            <div className="sys-barres" role="img" aria-label={s.nom + ' · ' + tr('60 dernières minutes')}>
              {vals.map((v, i) => (
                <span key={i} style={{ flex: 1, minWidth: 0, borderRadius: 3, height: v == null ? 2 : Math.max(3, v / haut * 100) + '%', background: v == null ? 'var(--o-bd1)' : i === vals.length - 1 ? s.couleur : 'rgba(' + s.rgb + ',.5)' }} />
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, fontWeight: 700, color: 'var(--o-text3)' }}>
            <span>{tr('−60 min')}</span><span>{tr('−30 min')}</span><span>{tr('maintenant')}</span>
          </div>
        </div>
      ) : <div style={{ flex: 1, minHeight: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: 'var(--o-text3)' }}>{tr('historique indisponible')}</div>}
    </div>
  );
}

function PanneauVersions({ lignes, sauvegarde, maintenant }) {
  return (
    <div style={SYS_PANNEAU}>
      <EntetePanneau titre={tr('Versions')} />
      {lignes.map(l => (
        <div key={l.cle} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.nom}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)', fontVariantNumeric: 'tabular-nums', marginTop: 1 }}>{l.version}</div>
          </div>
          {l.etat === 'ajour' && <span style={SYS_BADGE('var(--o-ok-rgb)', 'var(--o-ok)')}>{tr('À jour')}</span>}
          {l.etat === 'dispo' && <span style={SYS_BADGE('var(--o-accent-rgb)', 'var(--o-accent-soft)')}>{l.cible ? tr('{v} dispo', { v: l.cible }) : tr('Mise à jour')}</span>}
        </div>
      ))}
      {sauvegarde && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, paddingTop: 14, borderTop: '1px solid var(--o-bd1)' }}>
          <Fi i="cloud-check" size={16} color="var(--o-ok)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)' }}>{sauvegarde.complete ? tr('Dernière sauvegarde complète') : tr('Dernière sauvegarde')}</div>
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 1 }}>{[momentLisible(sauvegarde.t, maintenant), tailleLisible(sauvegarde.octets)].filter(Boolean).join(' · ')}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function LigneJauge({ lib, pct, val, couleur }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
      <span style={{ width: 27, flexShrink: 0, fontSize: 10, fontWeight: 800, letterSpacing: '.04em', color: 'var(--o-text3)' }}>{lib}</span>
      <Gauge pct={pct} color={couleur} h={4} style={{ flex: 1, minWidth: 0 }} />
      <span style={{ minWidth: 46, textAlign: 'right', flexShrink: 0, fontSize: 11, fontWeight: 700, color: 'var(--o-text2)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{val}</span>
    </div>
  );
}

/* Un module complementaire, au gabarit : son icone, sa bascule, son nom, puis
 * ce qu'il consomme. ARRETER demande un second geste — couper Zigbee2MQTT ou
 * le serveur SSH d'un doigt distrait se paie cher ; demarrer n'en demande pas. */
function CarteModule({ m, arme, occupe, onBascule }) {
  /* L'icone du module se PRECHARGE : tant qu'elle n'est pas arrivee — ou si
   * elle n'arrive jamais — la piece de puzzle tient la place. */
  const [image, setImage] = useState(null);
  const { icone, slug } = m;
  useEffect(() => {
    if (!icone) return undefined;
    let vivant = true;
    const src = '/api/hassio/addons/' + slug + '/icon';
    const im = new Image();
    im.onload = () => { if (vivant) setImage(src); };
    im.src = src;
    return () => { vivant = false; };
  }, [icone, slug]);
  const etat = m.erreur ? tr('En erreur') : !m.demarre ? tr('Arrêté') : m.version ? 'v' + m.version : ESPACE;
  return (
    <div className={'sys-module' + (m.erreur ? ' o-panne' : '')} style={SYS_CARTE}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        {image
          ? <img src={image} alt="" draggable={false} style={{ width: 38, height: 38, borderRadius: 14, objectFit: 'cover', flexShrink: 0, opacity: m.demarre ? 1 : .55 }} />
          : <span style={SYS_ICO(m.demarre ? 'var(--o-accent-rgb)' : '140,152,180', m.demarre ? 'var(--o-accent-soft)' : 'var(--o-text3)')}><Fi i="puzzle" size={17} /></span>}
        {arme
          ? <button type="button" onClick={onBascule} style={{ padding: '6px 9px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', background: 'rgba(var(--o-bad-rgb),.2)', color: 'var(--o-bad)' }}>{tr('Arrêter ?')}</button>
          : <span style={{ opacity: occupe ? .45 : 1, pointerEvents: occupe ? 'none' : 'auto', display: 'inline-flex' }}><Bascule on={m.demarre} cb={onBascule} nom={(m.demarre ? tr('Arrêter') : tr('Démarrer')) + ' ' + m.nom} /></span>}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={SYS_NOM}>{m.nom}</div>
        <div style={{ ...SYS_SOUS, color: m.erreur ? 'var(--o-bad)' : 'var(--o-text3)' }}>
          {etat}{m.demarre && m.cible && <span style={{ color: 'var(--o-accent-soft)' }}>{' → ' + m.cible}</span>}
        </div>
        {m.cpu != null && <LigneJauge lib="CPU" pct={Math.min(100, m.cpu)} val={nombre(m.cpu, m.cpu < 10 ? 1 : 0) + ' %'} couleur="var(--o-accent-soft)" />}
        {m.ram != null && <LigneJauge lib="RAM" pct={m.ramPct != null ? m.ramPct : 0} val={tailleLisible(m.ram)} couleur="var(--o-purple)" />}
      </div>
    </div>
  );
}

function PanneauReseau({ lignes, type }) {
  return (
    <div style={SYS_PANNEAU}>
      <EntetePanneau titre={tr('Réseau & stockage')} droite={type ? <span style={SYS_BADGE('var(--o-ok-rgb)', 'var(--o-ok)')}>{type}</span> : null} />
      {lignes.map(l => (
        <div key={l.cle} style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '8px 0' }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: 'var(--o-text2)' }}>{l.nom}</span>
          <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: l.couleur || 'var(--o-text)' }}>{l.valeur}</span>
        </div>
      ))}
    </div>
  );
}

const NIVEAUX_JOURNAL = {
  info: ['var(--o-accent-rgb)', 'var(--o-accent-soft)'],
  avert: ['var(--o-warn2-rgb)', 'var(--o-warn2)'],
  erreur: ['var(--o-bad-rgb)', 'var(--o-bad)'],
};

/* Le journal DEFILE dans sa carte (retour du 17/09) : il se tient a cote du
 * reseau, a sa hauteur, et toute la journee se parcourt sans allonger la page.
 * La liste ne pese rien dans le calcul de la rangee (base nulle) : c'est le
 * voisin — ou la hauteur minimale de la carte — qui fixe la taille. */
function PanneauJournal({ journal, indisponible }) {
  const heure = (t) => { const d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const mots = { info: tr('INFO'), avert: tr('AVERT.'), erreur: tr('ERREUR') };
  return (
    <div className="sys-journal" style={{ ...SYS_PANNEAU, display: 'flex', flexDirection: 'column' }}>
      <EntetePanneau titre={tr('Journal')} droite={journal.total > 0 ? <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-text2)', whiteSpace: 'nowrap' }}>{(journal.total > 1 ? tr('{n} événements', { n: journal.total }) : tr('{n} événement', { n: journal.total })) + ' · ' + tr('{n} h', { n: 24 })}</span> : null} />
      <div className="sys-journal-liste" style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto' }}>
      {journal.lignes.length
        ? journal.lignes.map((l, i) => {
            const [rgb, col] = NIVEAUX_JOURNAL[l.niveau] || NIVEAUX_JOURNAL.info;
            return (
              <div key={l.t + ':' + i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 0' }}>
                <span style={{ width: 38, flexShrink: 0, fontSize: 11, fontWeight: 700, color: 'var(--o-text3)', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{heure(l.t)}</span>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: col, flexShrink: 0, marginTop: 5 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.titre}</div>
                  {/* Deux lignes au plus : au telephone, une seule coupait le message avant son sens. */}
                  {l.detail && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 1, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{l.detail}</div>}
                </div>
                <span style={SYS_BADGE(rgb, col)}>{mots[l.niveau] || mots.info}</span>
              </div>
            );
          })
        : <div style={{ padding: '6px 0', fontSize: 12, fontWeight: 600, color: 'var(--o-text3)' }}>{indisponible ? tr('Journal indisponible sur cet accès.') : tr('Aucun événement système sur 24 h.')}</div>}
      </div>
    </div>
  );
}

/* L'alimentation, en deux temps : le premier geste arme, le second confirme.
 * Elle quitte la page pour une feuille — la maquette n'a pas de barre, et trois
 * boutons qui eteignent la maison n'ont pas a rester sous le pouce. */
function FeuilleAlimentation({ onAction, onClose }) {
  const [arme, setArme] = useState(null);
  const minuterie = useRef(null);
  useEffect(() => () => { if (minuterie.current) clearTimeout(minuterie.current); }, []);
  const actions = [
    { id: 'ha', label: tr('Redémarrer HA'), desc: tr('Relance le cœur sans toucher à la machine · ~40 s'), rgb: 'var(--o-warn-rgb)', col: 'var(--o-warn)', domaine: 'homeassistant', service: 'restart' },
    { id: 'reboot', label: tr('Redémarrer'), desc: tr('Redémarrage complet de la machine · 2 à 3 min hors ligne'), rgb: 'var(--o-warn-rgb)', col: 'var(--o-warn)', domaine: 'hassio', service: 'host_reboot' },
    { id: 'shutdown', label: tr('Éteindre'), desc: tr('Arrêt complet · rallumage physique requis'), rgb: 'var(--o-bad-rgb)', col: 'var(--o-bad)', domaine: 'hassio', service: 'host_shutdown' },
  ];
  const taper = (ac, close) => {
    if (minuterie.current) clearTimeout(minuterie.current);
    if (arme === ac.id) { setArme(null); onAction(ac.domaine, ac.service); close(); return; }
    setArme(ac.id);
    minuterie.current = setTimeout(() => setArme(null), 4000);
  };
  return (
    <BottomSheet onClose={onClose}>
      {(close) => (
        <div>
          <TitreFeuille style={{ fontSize: 17, fontWeight: 800 }}>{tr('Alimentation')}</TitreFeuille>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 3, marginBottom: 14 }}>{tr('Deux gestes : le premier arme, le second confirme.')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {actions.map(ac => (
              <button key={ac.id} type="button" onClick={() => taper(ac, close)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, border: 'none', cursor: 'pointer', textAlign: 'left', color: 'inherit', font: 'inherit', background: arme === ac.id ? 'rgba(' + ac.rgb + ',.22)' : 'var(--o-s1)' }}>
                <span style={SYS_ICO(ac.rgb, ac.col)}><Fi i={ac.id === 'shutdown' ? 'power' : 'refresh'} size={16} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: arme === ac.id ? ac.col : 'var(--o-text)' }}>{arme === ac.id ? tr('Confirmer ?') : ac.label}</span>
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 2 }}>{ac.desc}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

const BOUTON_TETE = { width: 36, height: 36, borderRadius: 10, border: 'none', cursor: 'pointer', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--o-s2)', color: 'var(--o-text1)' };

function SystemeContent({ hass }) {
  const S = (hass && hass.states) || {};
  const num = (id) => { const s = id ? S[id] : null; if (!s) return null; const v = parseFloat(s.state); return isNaN(v) ? null : v; };
  const octetsDe = (id) => { const s = id ? S[id] : null; return s ? enOctets(num(id), s.attributes && s.attributes.unit_of_measurement) : null; };
  const premier = (...ids) => ids.find(id => num(id) != null) || null;
  const H = sysSensors().host || {};

  // ── Le tour de rafraichissement : a la main, et chaque minute tant que la page se regarde.
  const [tour, setTour] = useState(0);
  const [releve, setReleve] = useState(() => Date.now());
  const rafraichir = () => { setTour(t => t + 1); setReleve(Date.now()); };
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') { setTour(x => x + 1); setReleve(Date.now()); } }, 60000);
    return () => clearInterval(t);
  }, []);
  // « Rafraîchi il y a … » avance seul, sans attendre un changement d'état.
  const [, setBattement] = useState(0);
  useEffect(() => { const t = setInterval(() => setBattement(x => x + 1), 5000); return () => clearInterval(t); }, []);
  const maintenant = Date.now();

  // ── Les lectures
  const sup = useSuperviseur(hass, tour);
  const erreursHA = useLectureWS(hass, 'system_log/list', tour);
  const cloud = useLectureWS(hass, 'cloud/status', tour);
  const infoBase = useInfoBase(hass);
  const cpuId = premier(H.cpu, H.cpuAlt);
  const memId = premier(H.memPct, H.memPctAlt);
  const hist = useSysHist(hass, [cpuId, memId], 1, tour);
  const idsJournal = [H.online, ...Object.keys(S).filter(id => id.indexOf('update.') === 0)].filter(Boolean).slice(0, 30).join(',');
  const logbook = useJournalEntites(hass, idsJournal, tour);

  // ── Les mesures
  const cpu = num(cpuId);
  const memUtilise = octetsDe(H.memUsed), memLibre = octetsDe(H.memFree);
  const memTotal = memUtilise != null && memLibre != null ? memUtilise + memLibre : null;
  const memPct = num(memId) != null ? num(memId) : (memTotal > 0 ? memUtilise / memTotal * 100 : null);
  const gio = (v) => (v != null && !isNaN(v) ? Number(v) * 1024 ** 3 : null);
  const disqueTotal = sup.host ? gio(sup.host.disk_total) : null;
  const disqueUtilise = sup.host ? gio(sup.host.disk_used) : null;
  const disquePct = disqueTotal > 0 && disqueUtilise != null ? disqueUtilise / disqueTotal * 100 : num(premier(H.disk, H.diskAlt));
  const swapUtilise = octetsDe(H.swapUsed), swapLibre = octetsDe(H.swapFree);
  const swapTotal = swapUtilise != null && swapLibre != null ? swapUtilise + swapLibre : null;
  const temp = num(H.temp);
  const serieCpu = resumeSerie(seaux(hist[cpuId], releve));
  const tuiles = tuilesMesures({ cpu, cpuMoyenne: serieCpu ? serieCpu.moyenne : null, memPct, memUtilise, memTotal, temp,
    disquePct, disqueUtilise, disqueTotal, swapPct: num(H.swapPct), swapUtilise, swapTotal });

  // ── La machine
  const etatDe = (id) => (id && S[id] ? String(S[id].state).toLowerCase() : null);
  const enLigne = ['on', 'home', 'online', 'connected'].indexOf(etatDe(H.online)) >= 0 || cpuId != null || !!sup.host;
  const depuis = depuisDemarrage(sup.host && sup.host.boot_timestamp, maintenant);
  const duree = depuis != null ? dureeLisible(depuis) : dureeCapteur(H.uptime && S[H.uptime] ? S[H.uptime].state : null, maintenant);
  const sousTitre = [
    nomCarte(sup.os && sup.os.board) || sysNames().host,
    sup.host && sup.host.operating_system,
    enLigne ? (duree ? tr('en ligne depuis {d}', { d: duree }) : tr('en ligne')) : tr('hors ligne'),
  ].filter(Boolean).join(' · ');

  // ── Les panneaux
  const versions = lignesVersions({ S, core: sup.core, supervisor: sup.supervisor, os: sup.os,
    versionCore: (hass && hass.config && hass.config.version) || null, versionLoggia: (LOGGIA_INDEX && LOGGIA_INDEX.componentVersion) || null });
  const sauvegarde = derniereSauvegarde(sup.backups);
  const modules = modulesComplementaires(sup.addons, sup.stats);
  const reseau = interfaceReseau(sup.network);
  const base = baseDeDonnees(infoBase);
  const nabu = etatCloud(cloud);
  const lignesReseau = [
    reseau && { cle: 'ip', nom: tr('Adresse IP locale'), valeur: reseau.ip },
    debitLisible(S[H.netIn]) && { cle: 'rx', nom: tr('Débit entrant'), valeur: debitLisible(S[H.netIn]) },
    debitLisible(S[H.netOut]) && { cle: 'tx', nom: tr('Débit sortant'), valeur: debitLisible(S[H.netOut]) },
    base && { cle: 'base', nom: tr('Base de données'), valeur: [tailleLisible(base.octets), base.moteur].filter(Boolean).join(' · ') },
    nabu && { cle: 'nabu', nom: 'Nabu Casa', valeur: nabu === 'connecte' ? tr('Connecté') : nabu === 'connexion' ? tr('Connexion…') : tr('Déconnecté'), couleur: nabu === 'connecte' ? 'var(--o-ok)' : 'var(--o-warn2)' },
  ].filter(Boolean);
  // Le journal defile : toute la journee, pas seulement ses huit dernieres lignes.
  const journal = journalSysteme({ erreurs: Array.isArray(erreursHA) ? erreursHA : null, logbook, maintenant, max: 60 });
  const alertes = alertesSysteme({ memPct, memTexte: paireTailles(memUtilise, memTotal), disquePct, temp, enLigne, modules: modules.liste });
  const series = [
    cpuId && { cle: 'cpu', nom: tr('Processeur'), points: hist[cpuId], actuel: cpu, rgb: 'var(--o-accent-rgb)', couleur: 'var(--o-accent-soft)' },
    memId && { cle: 'memoire', nom: tr('Mémoire'), points: hist[memId], actuel: num(memId), rgb: 'var(--o-purple-rgb)', couleur: 'var(--o-purple)' },
  ].filter(Boolean);

  // ── Les gestes
  const [feuille, setFeuille] = useState(false);
  const [arme, setArme] = useState(null);
  const [occupe, setOccupe] = useState(null);
  const minuterie = useRef(null);
  useEffect(() => () => { if (minuterie.current) clearTimeout(minuterie.current); }, []);
  const basculerModule = (m) => {
    if (minuterie.current) clearTimeout(minuterie.current);
    if (m.demarre && arme !== m.slug) { setArme(m.slug); minuterie.current = setTimeout(() => setArme(null), 4000); return; }
    setArme(null);
    if (!hass || typeof hass.callWS !== 'function') return;
    setOccupe(m.slug);
    hass.callWS({ type: 'supervisor/api', endpoint: '/addons/' + m.slug + '/' + (m.demarre ? 'stop' : 'start'), method: 'post', timeout: null })
      .catch(() => { /* le Superviseur a refuse : le releve suivant dira l'etat reel */ })
      .then(() => { setOccupe(null); rafraichir(); });
  };

  const sec = Math.max(0, Math.round((maintenant - releve) / 1000));
  const ilYA = sec < 60 ? tr('il y a {n} s', { n: sec }) : tr('il y a {n} min', { n: Math.round(sec / 60) });
  const nonAdmin = !!(hass && hass.user && hass.user.is_admin === false);

  return (
    <div className="loggia-content" style={{ padding: '26px 28px 56px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="o-obj-head" style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 36, fontWeight: 500 }}>{tr('Système')}</h1>
          <div style={{ fontSize: 13, color: 'var(--o-text2)', fontWeight: 600, marginTop: 5 }}>{sousTitre}</div>
        </div>
        <span style={{ flex: 1 }} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, padding: '6px 12px', borderRadius: 999, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', background: alertes.length ? 'rgba(var(--o-warn2-rgb),.14)' : 'rgba(var(--o-ok-rgb),.14)', color: alertes.length ? 'var(--o-warn2)' : 'var(--o-ok)' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: alertes.length ? 'var(--o-warn2)' : 'var(--o-ok)' }} />{alertes.length ? tr('{n} à surveiller', { n: alertes.length }) : tr('Tout fonctionne')}
        </span>
        <span className="sys-releve" style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)', whiteSpace: 'nowrap' }}>{tr('Rafraîchi')} {ilYA}</span>
        <button type="button" onClick={rafraichir} aria-label={tr('Rafraîchir')} title={tr('Rafraîchir')} style={BOUTON_TETE}><Fi i="refresh" size={14} /></button>
        <button type="button" onClick={() => setFeuille(true)} aria-label={tr('Alimentation')} title={tr('Alimentation')} style={BOUTON_TETE}><Fi i="power" size={14} /></button>
      </div>

      {/* Ce qui demande un regard : rare, et dit en clair. */}
      {alertes.length > 0 && (
        <div style={{ ...SYS_PANNEAU, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {alertes.map(a => (
            <div key={a.cle} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, fontWeight: 600 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, marginTop: 6, background: COULEUR_NIVEAU[a.niveau] || 'var(--o-warn2)' }} />
              <span style={{ minWidth: 0 }}>{a.texte}</span>
            </div>
          ))}
        </div>
      )}

      {tuiles.length > 0
        ? <div className="grid-sys-mesures" style={{ '--sys-n': tuiles.length }}>{tuiles.map(t => <TuileMesure key={t.cle} t={t} />)}</div>
        : <div style={{ ...SYS_PANNEAU, fontSize: 13, fontWeight: 600, color: 'var(--o-text2)' }}>{tr('Aucun capteur de charge trouvé : active l’intégration System Monitor (ou Glances) pour suivre le processeur, la mémoire et la température.')}</div>}

      {(series.length > 0 || versions.length > 0) && (
        <div className="grid-sys-duo">
          {series.length > 0 && <PanneauCharge series={series} releve={releve} />}
          {versions.length > 0 && <PanneauVersions lignes={versions} sauvegarde={sauvegarde} maintenant={maintenant} />}
        </div>
      )}

      {/* Les modules SANS cadre (retour du 17/09) : ce sont deja des cartes, un
        * panneau autour n'ajoutait qu'une boite dans une boite. Un titre de
        * section, le compte a droite, puis la grille sur toute la largeur. */}
      {modules.total > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: 0, fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 19, color: 'var(--o-text2)' }}>{tr('Modules complémentaires')}</div>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-text2)', whiteSpace: 'nowrap' }}>{tr('{n} en cours sur {t}', { n: modules.enCours, t: modules.total })}</span>
          </div>
          <div className="grid-sys-modules">
            {modules.liste.map(m => <CarteModule key={m.slug} m={m} arme={arme === m.slug} occupe={occupe === m.slug} onBascule={() => basculerModule(m)} />)}
          </div>
        </div>
      )}

      {/* Le journal et le reseau cote a cote, sur les colonnes du graphe et des versions. */}
      <div className="grid-sys-duo">
        <PanneauJournal journal={journal} indisponible={erreursHA === null && logbook === null} />
        {lignesReseau.length > 0 && <PanneauReseau lignes={lignesReseau} type={reseau && reseau.type} />}
      </div>
      {nonAdmin && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)' }}>{tr('Les versions, les modules et le réseau se lisent auprès du Superviseur : il ne répond qu’à un compte administrateur.')}</div>}

      {feuille && <FeuilleAlimentation onClose={() => setFeuille(false)} onAction={(domaine, service) => { if (hass && hass.callService) hass.callService(domaine, service, {}); }} />}
    </div>
  );
}

export default SystemeContent;
