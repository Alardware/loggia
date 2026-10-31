/* Les cartes des vues personnalisées et de l’Accueil : leur catalogue, leur aperçu, leurs feuilles.
 * Sorti d’App.jsx tel quel (lot 5 de l’audit du 28/10, ADR 0283) : seuls les imports sont neufs. */
import { useState, useEffect, useMemo, useId } from 'react';
import { getHass, enHaids, cfgVal, LOGGIA_RESOLVED } from '../state.js';
import { enPanne } from '../outils.js';
import { wattsDe, kwhDe } from '../unites.js';
import { idsDe, sommeLue } from '../energieparts.js';
import { commander, estVanneCarte } from '../actions.js';
import { cvName, Fi, ListeChoix, nomCarte, CV_DOM_ICON, cvDomain, BottomSheet, TitreFeuille, cvEstTpl, Surface, NomFeuille, CroixFeuille, EntPicker, TplForm, cvId, cvKey, personPicture } from '../ui.jsx';
import { haWeatherMode, WxMini, WeatherIco, haWeatherLabel } from '../wxutil.jsx';
import { appuiBascule } from '../prises.js';
import { luminosite } from '../lumieres.js';
import { verdictMesure, zoneMesure, arrondiMesure } from '../confort.js';
import { motPresence } from '../presence.js';
import { phraseChauffeEau } from '../objets.js';
import { grouperJournal, useRoomLogbook, etatJournal } from '../historique.jsx';
import { CamLive } from '../camera.jsx';
import { CAM_AUTO, camDisposDe, camDispoDe } from '../camdispo.js';
import { niveauPile, couleurNiveau, CLASSES_MOUVEMENT, CLASSES_SURETE } from '../attention.js';
import { LISERE } from '../styles.js';
import { relTime } from '../format.js';
import { coverActif } from '../voletecran.js';
import { teinteClimat } from '../chauffageecran.js';
import { heureJournal } from '../evenement.js';
import { cleJour } from '../agenda.js';
import { tr, locale, trN } from '../i18n.js';
import { decMax, cvEstLumiere, useGardeSwitch, lavisCarte, hx, useAgenda, Segment } from '../app/noyau.jsx';
import { RM_ICO, RM_NAME, RmBascule } from '../cartes/briques.jsx';
import { useDemandeCoupure } from '../cartes/prise.jsx';
import { useHistorique24, useDomainCards, FicheRangee } from '../appareils/fiches.jsx';
import { CamSheet, CV_CADRE, texteDate, PlugIcon, cvIcoEntite, OUVRANT_DCS, ouvrantsDe, CvCard, CvAlarm } from './cartes.jsx';
import { jourAgenda, APPAREIL_ACTIF } from '../accueil/briques.jsx';

/* Carte caméra STANDARD (1×1) du catalogue : le flux dans une case de
 * grille, badge LIVE, nom en pied, l'agrandissement en popup. */
function CvCamera({ id, hass, label = null }) {
  const st = hass && hass.states ? hass.states[id] : null;
  const nom = label || cvName(st, id);
  const online = !!st && st.state !== 'unavailable';
  const vivant = !!(hass && hass.connection);
  const [grand, setGrand] = useState(false);
  return (
    <div className={'o-piece' + (!online ? ' o-panne' : '')} style={{ position: 'relative', height: '100%', minHeight: 172, borderRadius: 'var(--o-radius,18px)', overflow: 'hidden', background: 'linear-gradient(160deg,#16202e,#0b0f16)', border: LISERE, boxShadow: 'var(--o-shadow,0 10px 26px rgba(0,0,0,.3))' }}>
      {vivant
        ? <CamLive hass={hass} haid={id} online={online} nom={nom} />
        : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--o-text3)' }}><Fi i="video-camera" size={30} /></div>}
      {/* Toute la carte agrandit, comme la tuile de l'Accueil (20/09). */}
      <button type="button" aria-label={tr('Agrandir') + ' ' + nom} onClick={() => setGrand(true)}
        style={{ position: 'absolute', inset: 0, zIndex: 2, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }} />
      <div className="o-livebadge" style={{ position: 'absolute', top: 10, left: 10, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 9px', borderRadius: 999, background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(6px)', fontSize: 10, fontWeight: 800, letterSpacing: '.05em', color: '#fff' }}><span className="o-livedot" style={{ width: 6, height: 6, '--o-point-r': 3, borderRadius: '50%', background: 'var(--o-bad)' }} />LIVE</div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '24px 12px 10px', background: 'linear-gradient(to top,rgba(0,0,0,.72),transparent)', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nom}</span>
        <span style={{ width: 30, height: 30, borderRadius: 10, background: 'rgba(255,255,255,.16)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3" /></svg></span>
      </div>
      {grand && <CamSheet haid={id} nom={nom} hass={hass} onClose={() => setGrand(false)} />}
    </div>
  );
}

/* ── Combien de caméras par ligne (20/09) ────────────────────────────────────
 * « moi j'en ai 2 mais d'autres en ont peut-être plus, on pourrait ajouter un
 * réglage d'affichage comme ceux-ci » : un menu où chaque ligne porte le
 * SCHÉMA de sa disposition — la forme se reconnaît avant de se lire. Le menu
 * passe par `ListeChoix` comme tous les autres (jamais de liste native).
 * Le choix suit le type d'écran (`src/camdispo.js`). */
function SchemaCam({ n, size = 18 }) {
  // Une vignette par colonne, au ratio des tuiles (16/9), dans un carré.
  const g = 1.6, l = (size - g * (n - 1)) / n, h = Math.max(2.5, l * 9 / 16);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <rect key={i} x={i * (l + g)} y={(size - h) / 2} width={l} height={h} rx={Math.min(2, l / 3)} fill="currentColor" opacity={.78} />
      ))}
    </svg>
  );
}
const CAM_DISPO_NOMS = () => ({ auto: tr('Automatique'), 1: tr('1 par ligne'), 2: tr('2 par ligne'), 3: tr('3 par ligne'), 4: tr('4 par ligne') });
function ChoixCamDispo({ valeur, format, onChoisir }) {
  const noms = CAM_DISPO_NOMS();
  const colsDe = (id) => (id === 'auto' ? (CAM_AUTO[format] || 2) : parseInt(id, 10));
  const options = camDisposDe(format).map(id => ({ id, label: noms[id], ico: <SchemaCam n={colsDe(id)} /> }));
  const courant = camDispoDe(valeur, format);
  return (
    <ListeChoix value={courant} options={options} onChange={onChoisir} label={tr('Caméras par ligne')} recherche={false}>
      {(cur) => (<><SchemaCam n={colsDe(courant)} size={15} /><span>{(cur || { label: noms.auto }).label}</span></>)}
    </ListeChoix>
  );
}

/* Carte template d'une vue custom : le Jinja est evalue par Home Assistant,
 * jamais ici. `render_template` est une SOUSCRIPTION : HA re-evalue et pousse
 * une nouvelle valeur des qu'une entite referencee change — le direct est
 * gratuit, aucun poll. `report_errors` transforme un template invalide en
 * message d'erreur au lieu d'une souscription silencieusement morte. */
function CvTemplateCard({ def, hass }) {
  const [out, setOut] = useState(null);
  const [err, setErr] = useState(null);
  const conn = hass && hass.connection;
  useEffect(() => {
    setOut(null); setErr(null);
    if (!conn || !def.src) return;
    let unsub = null, mort = false;
    conn.subscribeMessage((msg) => {
      if (mort || !msg) return;
      if (msg.error) { setErr(String(msg.error)); return; }
      setErr(null);
      setOut(msg.result != null ? String(msg.result) : '');
    }, { type: 'render_template', template: def.src, report_errors: true })
      .then(u => { if (mort) { try { u(); } catch {} } else unsub = u; })
      .catch(e => { if (!mort) setErr(String((e && e.message) || e)); });
    return () => { mort = true; if (unsub) { try { unsub(); } catch {} } };
  }, [conn, def.src]);
  const attente = out == null && !err;
  return (
    <div className="o-piece" style={{ background: 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,18px)', padding: 16, boxShadow: 'var(--o-shadow,0 10px 26px rgba(0,0,0,.3))' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <span style={{ width: 40, height: 40, borderRadius: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--o-s1)', color: 'var(--o-text3)' }}><Fi i="brackets-curly" size={16} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{def.name || tr('Carte template') /* le repli de `nomCarte`, dans la langue de l'écran (audit du 03/10) */}</div>
          {err
            ? <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-bad)', marginTop: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 96, overflow: 'auto' }}>{err}</div>
            : <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 132, overflowY: 'auto', lineHeight: 1.45, opacity: attente ? .45 : 1 }}>{attente ? '…' : (out === '' ? '—' : out)}</div>}
        </div>
      </div>
    </div>
  );
}

/** Les cartes qui vont à une entité, la première étant proposée en premier.
 * Partout : COMPACTE (une ligne, contrôle primaire, rien dessous) et STANDARD
 * (les contrôles du domaine en dessous) — puis les spécialisées du domaine. */
function cvTypesPour(id) {
  const d = String(id).split('.')[0];
  // La CHIP ferme chaque liste : c'est la plus petite carte du catalogue, une
  // pastille pour une entité (retour 01/09).
  // Le « gros interrupteur » a quitté le catalogue le 31/08/2026 (retour
  // d'essai) — les cartes déjà posées continuent de se rendre (CvTyped).
  if (d === 'light' || d === 'switch' || d === 'fan') return ['compacte', 'riche', 'journal', 'chip'];
  if (d === 'cover' || d === 'climate' || d === 'media_player' || d === 'vacuum' || d === 'lawn_mower' || d === 'valve' || d === 'humidifier' || d === 'lock' || d === 'siren' || d === 'water_heater') return ['compacte', 'riche', 'journal', 'chip'];
  if (d === 'scene' || d === 'script' || d === 'button' || d === 'input_button' || d === 'automation') return ['compacte', 'riche', 'chip'];
  // La jauge a quitté le catalogue le 31/08/2026 (« il est moche ») — les
  // cartes déjà posées continuent de se rendre (CvTyped).
  if (d === 'sensor') return ['compacte', 'chiffre', 'graph', 'journal', 'chip'];
  if (d === 'binary_sensor') return ['compacte', 'chiffre', 'journal', 'chip'];
  if (d === 'person') return ['compacte', 'personne', 'journal', 'chip'];
  if (d === 'weather') return ['compacte', 'meteo', 'chip'];
  if (d === 'calendar') return ['agenda', 'calendrier', 'compacte', 'chip'];
  if (d === 'alarm_control_panel') return ['compacte', 'alarme', 'alarmeseule', 'riche', 'chip'];
  if (d === 'camera') return ['camera', 'compacte'];
  return ['compacte', 'riche', 'chip'];
}
const CV_TYPE_NOMS = () => ({ compacte: tr('Compacte'), riche: tr('Standard'), gros: tr('Gros interrupteur'), chiffre: tr('Grand chiffre'), jauge: tr('Jauge'), graph: tr('Graphique 24 h'), journal: tr('Journal'), personne: tr('Présence'), meteo: tr('Météo'), agenda: tr('Agenda'), alarme: tr('Alarme'), horloge: tr('Horloge'), presence: tr('Présence maison'), ouvrants: tr('Ouvrants'), energiemaison: tr('Énergie maison'), air: tr('Qualité air'), alarmeseule: tr('Alarme (seule)'), activite: tr('Activité récente'), camera: tr('Caméra'), calendrier: tr('Calendrier'), localisation: tr('Localisation'), chips: tr('Chips (groupe)'), chip: tr('Chip') });

/* Horloge : l'heure de la maison, sans entité — la carte se suffit. */
function CvClock() {
  const [, tic] = useState(0);
  useEffect(() => { const iv = setInterval(() => tic(n => n + 1), 15000); return () => clearInterval(iv); }, []);
  const d = new Date();
  const h = d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  const jour = d.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <div style={{ ...CV_CADRE, alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{h}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 6, textTransform: 'capitalize' }}>{jour}</div>
    </div>
  );
}

/* Grand chiffre : la valeur en très grand, l'unité, le nom. Un binaire dit son
 * état en toutes lettres ; la richesse d'un capteur, c'est sa lisibilité. */
/* `onOpen` (lot 13 de l'audit du 03/10) : la carte EST alors le bouton qui
 * ouvre la fiche — elle ne porte aucune commande à protéger —, nommée de ce
 * qu'elle affiche, le nom puis la valeur. Une enveloppe de `CvTyped` la
 * nommait « Ouvrir sensor.co2_sejour » : l'identifiant, épelé. Sans `onOpen`
 * (bibliothèque), elle n'est rien de tout cela. Même chose pour la jauge et
 * le graphique. En panne, le nom dit « Indisponible », comme `CvCard` — pas
 * le tiret de l'écran, ni « — ppm » : l'unité ne suit qu'une vraie valeur
 * (relecture du lot 13). */
function CvBigSensor({ id, hass, onOpen = null }) {
  const st = hass && hass.states ? hass.states[id] : null;
  const a = (st && st.attributes) || {};
  const dom = String(id).split('.')[0];
  const brut = st ? st.state : null;
  const mort = !st || brut === 'unavailable' || brut === 'unknown';
  // Une date, une heure (05/10, suite « dates partout ») : `texteDate`, pas
  // l'année de `parseFloat` en 54 px — et un corps qui la laisse tenir.
  const date = mort ? null : texteDate(st);
  let valeur, unite = '';
  if (mort) valeur = '—';
  else if (dom === 'binary_sensor') {
    const porte = ['door', 'window', 'garage_door', 'opening'].indexOf(a.device_class) >= 0;
    valeur = brut === 'on' ? (porte ? tr('Ouvert') : tr('Détecté')) : (porte ? tr('Fermé') : tr('RAS'));
  } else {
    const n = parseFloat(brut);
    valeur = date != null ? date : isNaN(n) ? brut : decMax(n, 1);
    unite = date != null ? '' : a.unit_of_measurement || '';
  }
  const nom = cvName(st, id);
  return (
    /* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-tabindex */
    <div className={'o-piece' + (mort ? ' o-panne' : '')} role={onOpen ? 'button' : undefined} tabIndex={onOpen ? 0 : undefined}
      aria-label={onOpen ? nomCarte(nom, mort ? tr('Indisponible') : (unite ? valeur + ' ' + unite : valeur)) : undefined} aria-haspopup={onOpen ? 'dialog' : undefined}
      onClick={onOpen ? () => onOpen(id) : undefined}
      onKeyDown={onOpen ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(id); } } : undefined}
      style={{ ...CV_CADRE, height: '100%', minHeight: 150, opacity: mort ? .55 : 1, cursor: onOpen ? 'pointer' : undefined }}>
      <span style={{ width: 40, height: 40, borderRadius: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--o-s1)', color: 'var(--o-text3)' }}><Fi i={CV_DOM_ICON[cvDomain(id)] || 'bolt'} size={17} /></span>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
        <div style={{ fontSize: date != null ? 'clamp(20px, 1vw + 14px, 28px)' : 'clamp(32px, 3vw + 12px, 54px)', fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', textAlign: 'center' }}>
          {valeur}{unite && <span style={{ fontSize: '.42em', fontWeight: 700, color: 'var(--o-text2)', marginLeft: 6 }}>{unite}</span>}
        </div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--o-text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nom}</div>
    </div>
  );
}

/* Jauge : un arc de cercle. Le pourcentage vient de l'unité « % », sinon des
 * bornes min/max de l'entité — des °C entre min_temp et max_temp se jaugent
 * aussi bien qu'une batterie. */
function CvGauge({ id, hass, onOpen = null }) {
  const st = hass && hass.states ? hass.states[id] : null;
  const a = (st && st.attributes) || {};
  const n = st ? parseFloat(st.state) : NaN;
  const mort = !st || isNaN(n);
  const min = a.min != null ? +a.min : (a.min_temp != null ? +a.min_temp : 0);
  const max = a.max != null ? +a.max : (a.max_temp != null ? +a.max_temp : (a.unit_of_measurement === '%' ? 100 : 100));
  const pct = mort ? 0 : Math.max(0, Math.min(1, (n - min) / (max - min || 1)));
  // Une pile : la règle de la maison (chantier Capteurs, C32).
  const niveau = a.device_class === 'battery' ? niveauPile(n) : null;
  const col = niveau ? couleurNiveau(niveau).col : 'var(--o-accent)';
  // Arc de 240° : de 150° à 390°, rayon 44, épaisseur 9.
  const arc = (p) => {
    const a0 = (150 * Math.PI) / 180, a1 = ((150 + 240 * p) * Math.PI) / 180;
    const x0 = 60 + 44 * Math.cos(a0), y0 = 60 + 44 * Math.sin(a0);
    const x1 = 60 + 44 * Math.cos(a1), y1 = 60 + 44 * Math.sin(a1);
    return `M ${x0} ${y0} A 44 44 0 ${240 * p > 180 ? 1 : 0} 1 ${x1} ${y1}`;
  };
  const valeur = mort ? '—' : decMax(n, 1);
  const unite = a.unit_of_measurement || '';
  const nom = cvName(st, id);
  return (
    /* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-tabindex */
    <div className={'o-piece' + (mort ? ' o-panne' : '')} role={onOpen ? 'button' : undefined} tabIndex={onOpen ? 0 : undefined}
      aria-label={onOpen ? nomCarte(nom, mort ? tr('Indisponible') : (unite ? valeur + ' ' + unite : valeur)) : undefined} aria-haspopup={onOpen ? 'dialog' : undefined}
      onClick={onOpen ? () => onOpen(id) : undefined}
      onKeyDown={onOpen ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(id); } } : undefined}
      style={{ ...CV_CADRE, height: '100%', minHeight: 150, alignItems: 'center', opacity: mort ? .55 : 1, cursor: onOpen ? 'pointer' : undefined }}>
      <div style={{ position: 'relative', width: 120, height: 104, flexShrink: 0 }}>
        <svg width="120" height="120" viewBox="0 0 120 120" style={{ position: 'absolute', top: -4 }}>
          <path d={arc(1)} fill="none" stroke="var(--o-s1)" strokeWidth="9" strokeLinecap="round" />
          {!mort && pct > 0.005 && <path d={arc(pct)} fill="none" stroke={col} strokeWidth="9" strokeLinecap="round" style={{ transition: 'stroke .3s' }} />}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: 6 }}>
          <span style={{ fontSize: 25, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{valeur}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text2)' }}>{unite}</span>
        </div>
      </div>
      <div style={{ marginTop: 'auto', width: '100%', textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'var(--o-text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nom}</div>
    </div>
  );
}

/* Gros interrupteur : toute la carte est le bouton — pensée pour la tablette
 * murale, où viser un petit toggle est une corvée. */
function CvBigToggle({ id, hass }) {
  const st = hass && hass.states ? hass.states[id] : null;
  // Muet — `unavailable` OU `unknown` — : la règle des cartes (`enPanne` ; audit du 19/10, point 3), il ne se commande pas.
  const mort = enPanne(id, st);
  const on = !mort && st.state === 'on';
  // L'or est réservé aux lumières ; une prise ou un appareil s'allume à l'accent, icône prise.
  const lum = cvEstLumiere(id);
  const rgbTok = lum ? 'var(--o-gold-rgb)' : 'var(--o-accent-rgb)';
  const txtCol = lum ? 'var(--o-warn)' : 'var(--o-accent-soft)';
  /* Posé sur une PRISE protégée — ou dont la protection n'est pas encore lue —,
   * il ne la coupe pas d'un appui (P5, relecture finale A4) : le premier appui
   * pose la demande, la carte dit « Couper la prise ? » et son bouton « Couper
   * {nom} » ; le second coupe ; Échap ou 6 secondes la défont, comme une prise
   * coupée entre-temps (F4). Pas de bouton dans le bouton : c'est lui qui reçoit
   * le second appui. Un switch que l'index ne classe pas encore suit la même règle
   * (F2). Et l'ordre est explicite — `turn_on`, `turn_off`, d'après l'état affiché
   * (F5) : un `toggle` inverse l'état RÉEL, et coupait sans question une prise
   * protégée rallumée deux secondes avant l'appui. */
  const gs = useGardeSwitch(hass && hass.states, id);
  const [demande, setDemande] = useDemandeCoupure(on);
  const enDemande = gs.garde && on && demande;
  const nom = cvName(st, id);
  const toggle = () => {
    const geste = appuiBascule({ on, garde: gs.garde, enDemande });
    if (geste === 'demander') { setDemande(true); return; }
    setDemande(false);
    commander(hass, id, on ? 'turn_off' : 'turn_on');
  };
  return (
    <button className={'o-piece' + (mort ? ' o-panne' : '')} onClick={toggle} disabled={mort} aria-label={enDemande ? tr('Couper') + ' ' + nom : undefined}
      style={{ ...CV_CADRE, height: '100%', minHeight: 150, width: '100%', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: mort ? 'default' : 'pointer', opacity: mort ? .55 : 1, transition: 'all .25s',
        ...(on ? { background: lavisCarte(rgbTok) } : {}) }}>
      <span style={{ width: 52, height: 52, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: on ? `rgba(${rgbTok},.2)` : 'var(--o-s1)', color: on ? txtCol : 'var(--o-text3)', boxShadow: on ? `0 0 22px rgba(${rgbTok},.4)` : 'none', transition: 'all .25s', flexShrink: 0 }}>
        {String(id).indexOf('switch.') === 0 && !lum ? <PlugIcon size={23} /> : <Fi i="power" size={23} />}
      </span>
      <span style={{ fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{nom}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: enDemande ? 'var(--o-text1)' : on ? txtCol : 'var(--o-text3)' }}>{mort ? tr('Indisponible') : enDemande ? tr('Couper la prise ?') : on ? tr('Allumé') : tr('Éteint')}</span>
      {/* La question s'annonce (point 13) ; le bouton porte alors le nom « Couper … ». */}
      <span className="o-vh" aria-live="polite">{enDemande ? tr('Couper la prise ?') : ''}</span>
    </button>
  );
}

/* Présence : la personne, son état, depuis quand. */
function CvPerson({ id, hass }) {
  const st = hass && hass.states ? hass.states[id] : null;
  const a = (st && st.attributes) || {};
  const nom = cvName(st, id);
  const home = !!st && st.state === 'home';
  const img = a.entity_picture || null;
  return (
    <div className="o-piece" style={{ ...CV_CADRE, height: '100%', minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
      <span style={{ position: 'relative', width: 58, height: 58, flexShrink: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', borderRadius: '50%', background: img ? `url("${img}") center/cover` : 'var(--o-s1)', color: home ? 'var(--o-text2)' : 'var(--o-text3)', fontSize: 19, fontWeight: 800, boxShadow: home ? '0 0 0 2.5px var(--o-ok), 0 0 12px rgba(var(--o-ok-rgb),.5)' : '0 0 0 2px var(--o-bd1)', opacity: home || !img ? 1 : .55 }}>{!img && nom.charAt(0).toUpperCase()}</span>
        <span style={{ position: 'absolute', right: -1, bottom: -1, width: 14, height: 14, borderRadius: '50%', background: home ? 'var(--o-ok)' : 'var(--o-text3)', border: '2.5px solid var(--o-surfA)' }} />
      </span>
      <span style={{ fontSize: 14, fontWeight: 800 }}>{nom}</span>
      {/* Dans une zone, son nom ; un traceur muet, « Inconnu » (G1-D8) — plus « Absent » pour tout ce qui n'est pas la maison. */}
      <span style={{ fontSize: 12, fontWeight: 700, color: home ? 'var(--o-ok)' : 'var(--o-text3)' }}>{motPresence(st)}{st && st.last_changed ? ' · ' + relTime(st.last_changed).toLowerCase() : ''}</span>
    </div>
  );
}

/* Météo : la vignette animée de l'accueil, en carte. */
function CvWeather({ id, hass }) {
  const st = hass && hass.states ? hass.states[id] : null;
  const a = (st && st.attributes) || {};
  const S = (hass && hass.states) || {};
  const nuit = S['sun.sun'] ? S['sun.sun'].state === 'below_horizon' : false;
  const wx = st ? haWeatherMode(st.state, nuit) : 'clouds';
  return (
    <div className="o-piece" style={{ ...CV_CADRE, height: '100%', minHeight: 150, position: 'relative', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <WxMini wx={wx} on={true} />
      <WeatherIco wx={wx} size={52} />
      <div style={{ position: 'relative', textAlign: 'center' }}>
        <div style={{ fontSize: 28, fontWeight: 800 }}>{a.temperature != null ? Math.round(a.temperature) : '—'}°</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)' }}>{st ? haWeatherLabel(st.state) : ''}</div>
      </div>
    </div>
  );
}

/* Agenda : les prochains événements d'UN calendrier — rangées à fond, la
 * prochaine échéance mise en avant (maquette Claude Design 31/08). */
/* CHIPS : l'état de la maison en pastilles, sur une seule rangée.
 *
 * La carte la plus dense du catalogue — ce que les autres disent en 184 px,
 * elle le résume en 88. Chaque pastille naît de ce qui EXISTE : pas de
 * lumière découverte, pas de pastille lumières. Elles ne pilotent rien : une
 * rangée aussi serrée invite au faux geste, la fiche est à un tap ailleurs. */
/* Valeur COURTE d'une entité pour une pastille : ce qui tient à côté de son
 * icône. Une porte n'a pas besoin de mot — son icône et sa couleur le disent
 * déjà ; un capteur, si. */
function chipTexte(id, st) {
  if (!st) return '—';
  const d = String(id).split('.')[0];
  // Sans valeur, rien à dire — comme une entité absente (05/10). La pastille
  // écrivait l'état BRUT, « unknown », « unavailable » en anglais ; pire, une
  // alarme injoignable s'y disait « Armée », une serrure « Déverrouillée ».
  if (st.state === 'unknown' || st.state === 'unavailable') return '—';
  // Scène, bouton, événement : leur état est la date du dernier déclenchement,
  // script et automatisation un on/off — elle dit ce que dit la tuile
  // (`CvCard`) : « — » jamais déclenché, `relTime` sinon, pas l'ISO en clair.
  if (['scene', 'script', 'button', 'input_button', 'automation', 'event'].indexOf(d) >= 0) return relTime(st.state) || '—';
  // Une date, une heure (capteur horodaté, entité `datetime`) : `texteDate`.
  const date = texteDate(st);
  if (date != null) return date;
  const a = st.attributes || {};
  const s = st.state;
  if (d === 'light' || d === 'switch' || d === 'input_boolean' || d === 'fan') return s === 'on' && luminosite(a) != null ? luminosite(a) + ' %' : '';
  if (d === 'climate') return a.current_temperature != null ? decMax(a.current_temperature, 1) + '°' : (a.temperature != null ? decMax(a.temperature, 1) + '°' : '');
  if (d === 'cover') return a.current_position != null ? a.current_position + ' %' : (s === 'open' ? tr('Ouvert') : tr('Fermé'));
  if (d === 'media_player') return s === 'playing' ? (a.media_title || tr('Lecture')) : '';
  if (d === 'alarm_control_panel') return s === 'disarmed' ? tr('Désarmée') : s === 'triggered' ? tr('ALERTE') : tr('Armée');
  // La zone telle quelle (G1-D8) ; un traceur muet a déjà rendu « — » plus haut.
  if (d === 'person' || d === 'device_tracker') return motPresence(st);
  // Un chauffe-eau, sa phrase (G1-D7) : « Éco · 52° → 55° », plus « eco » brut.
  if (d === 'water_heater') return phraseChauffeEau(st);
  if (d === 'binary_sensor') return '';
  if (d === 'sensor') { const n = parseFloat(s); return (isNaN(n) ? String(s) : decMax(n, 1)) + (a.unit_of_measurement ? ' ' + a.unit_of_measurement : ''); }
  if (d === 'lock') return s === 'locked' ? tr('Verrouillée') : tr('Déverrouillée');
  return String(s);
}
/* Une pastille est-elle « vive » ? Le même vocabulaire que les cartes : ce qui
 * est allumé, ouvert, en marche ou détecté attire l'œil. */
function chipVif(id, st) {
  if (!st) return false;
  const d = String(id).split('.')[0];
  const s = st.state;
  // Un volet, le verdict des cartes (V12) : celui qui bute à 1 % est fermé.
  if (d === 'cover') return coverActif(st);
  if (d === 'valve') return s === 'open' || s === 'opening';
  if (d === 'climate') return s !== 'off';
  if (d === 'media_player') return s === 'playing';
  if (d === 'lock') return s === 'unlocked';
  if (d === 'alarm_control_panel') return s !== 'disarmed';
  if (d === 'person' || d === 'device_tracker') return s === 'home';
  if (d === 'sensor') return false;
  return s === 'on';
}
/* UNE CHIP, une entité, une carte — la plus petite du catalogue.
 *
 * Elle ne remplit pas sa case : une pastille de 48 px flotte au milieu de la
 * rangée, comme les chips de Home Assistant posées seules. On en pose autant
 * qu'on veut, côte à côte ; c'est le format demandé le 01/09 : « une vraie
 * chip par entité et non rassemblé dans une carte ». */
function CvChip({ id, hass, dc = null }) {
  const S = (hass && hass.states) || {};
  const st = S[id];
  const d = String(id).split('.')[0];
  // Un climat prend la teinte de ses cartes (`teinteClimat`) ; seule l'alarme déclenchée reste rouge. L'or n'est qu'aux
  // lumières (`cvEstLumiere`) : une prise s'allume à l'accent (ADR 0261).
  const col = d === 'cover' ? 'var(--o-purple)' : d === 'climate' ? teinteClimat(st)
    : cvEstLumiere(id) ? 'var(--o-warn)'
      : d === 'alarm_control_panel' ? (st && st.state === 'triggered' ? 'var(--o-bad)' : st && st.state === 'disarmed' ? 'var(--o-ok)' : 'var(--o-warn2)')
        : 'var(--o-accent-soft)';
  // Sans teinte — une clim qui sèche ou ventile —, la puce reste neutre.
  const vif = chipVif(id, st) && !!col;
  const val = chipTexte(id, st);
  const nom = cvName(st, id);
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center' }}>
      {/* Son nom est déjà ce qu'elle affiche, le nom puis la valeur : il vient
        * de son texte. Elle dit seulement ouvrir une fiche (lot 13 de l'audit
        * du 03/10). */}
      {/* Le liseré des autres cartes (relecture du 04/10) : `border: 'none'`
        * en faisait la seule famille sans trait, et sous Atrium, dont le filet
        * `calc(1px - --o-bw)` s'efface dès que Liserés est actif, la seule
        * sans AUCUN contour. Le trait se prend dans les 48 px (border-box). */}
      <button onClick={(e) => { e.stopPropagation(); if (dc && dc.ouvrir) dc.ouvrir(id); }} title={nom}
        aria-haspopup={dc && dc.ouvrir ? 'dialog' : undefined}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minWidth: 0, height: 48, padding: '0 14px', borderRadius: 14, border: LISERE, cursor: 'pointer',
          background: vif ? hx(col, .16) : 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))',
          color: vif ? col : 'var(--o-text2)', boxShadow: 'var(--o-shadow,0 8px 20px rgba(0,0,0,.26))' }}>
        <Fi i={cvIcoEntite(d, id, st, nom) || 'bolt'} size={15} color={vif ? col : 'var(--o-text3)'} />
        <span style={{ flex: 1, minWidth: 0, textAlign: 'left', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--o-text1)' }}>{nom}</span>
        {val ? <span style={{ fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{val}</span> : null}
      </button>
    </div>
  );
}

function CvChips({ x = null, hass, dc = null, demo = null }) {
  const S = (hass && hass.states) || {};
  /* Une carte chips, c'est SES entités : celles qu'on lui a choisies, chacune
   * cliquable. Le résumé automatique de la maison a été retiré (retour
   * 01/09) — il donnait des pastilles muettes que personne n'avait demandées. */
  const ids = (x && Array.isArray(x.ids)) ? x.ids.filter(i => S[i]) : [];
  const idsSig = ids.join('|');
  const chips = useMemo(() => {
    if (demo) return demo;
    return ids.map(id => {
      const st = S[id];
      const d = String(id).split('.')[0];
      const col = d === 'cover' ? 'var(--o-purple)' : d === 'climate' ? teinteClimat(st)
        : cvEstLumiere(id) ? 'var(--o-warn)'
          : d === 'alarm_control_panel' ? (st.state === 'triggered' ? 'var(--o-bad)' : st.state === 'disarmed' ? 'var(--o-ok)' : 'var(--o-warn2)')
            : 'var(--o-accent-soft)';
      // Sans teinte — une clim qui sèche ou ventile —, la pastille reste neutre.
      const vif = chipVif(id, st) && !!col;
      return { id, ic: cvIcoEntite(d, id, st, cvName(st, id)) || 'bolt', txt: chipTexte(id, st), col, vif };
    });
  }, [hass, demo, idsSig]);
  const ouvrir = (c) => { if (c.id && dc && dc.ouvrir) dc.ouvrir(c.id); };
  return (
    /* `justifyContent: center` sur le CADRE, pas sur la rangée : CV_CADRE
     * empile en COLONNE, la rangée était donc collée en haut (retour 01/09).
     * C'est l'axe principal de la colonne qui centre verticalement. */
    <div className="o-piece" style={{ ...CV_CADRE, height: '100%', justifyContent: 'center', overflow: 'hidden' }}>
      {/* Elles défilent plutôt que de rétrécir : une pastille illisible ne dit
        * rien, et la rangée doit tenir sur 88 px quelle que soit la largeur. */}
      <div className="o-chipsrow" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', width: '100%' }}>
        {chips.length === 0 && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)' }}>{tr('Aucune pastille — le crayon en ajoute.')}</span>}
        {chips.map((c, i) => {
          const st = { display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, padding: '7px 11px', borderRadius: 10, whiteSpace: 'nowrap', fontSize: 12, fontWeight: 800, border: 'none', background: c.vif ? hx(c.col, .14) : 'var(--o-s1)', color: c.vif ? c.col : 'var(--o-text2)' };
          const dedans = <>{<Fi i={c.ic} size={12} color={c.vif ? c.col : 'var(--o-text3)'} />}{c.txt}</>;
          // Chaque pastille ouvre la fiche de son entité — la vitrine de la
          // bibliothèque est le seul cas sans fiche à ouvrir. Son nom dit
          // l'entité PUIS la valeur affichée (lot 13 de l'audit du 03/10) :
          // « 65 % » seul ne disait pas de quoi.
          return c.id
            ? <button key={c.id} onClick={(e) => { e.stopPropagation(); ouvrir(c); }} title={cvName(S[c.id], c.id)} aria-label={nomCarte(cvName(S[c.id], c.id), c.txt)} aria-haspopup={dc && dc.ouvrir ? 'dialog' : undefined} style={{ ...st, cursor: 'pointer' }}>{dedans}</button>
            : <span key={i} style={st}>{dedans}</span>;
        })}
      </div>
    </div>
  );
}

function CvAgenda({ id, hass }) {
  const events = useAgenda(hass, useMemo(() => [id], [id]));
  const st = hass && hass.states ? hass.states[id] : null;
  return (
    <div className="o-piece" style={{ ...CV_CADRE, height: '100%', overflow: 'hidden' }}>
      {/* Relecture du 04/10 : à 184 px (rangées de 8), le titre sur deux lignes
        * poussait le 3e événement hors du cadre (1366 px, tablette, téléphone).
        * Une ligne, tronquée — et `flexShrink: 0`, sans quoi `overflow: hidden`
        * ramène sa hauteur minimale à 0 et la colonne qui déborde l'écrase. */}
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cvName(st, id)} · {tr('7 prochains jours')}</div>
      {events.length === 0 && <div style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600, padding: '10px 0' }}>{tr('Rien de prévu')}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {events.slice(0, 3).map((e, i) => {
          const { jour, heure } = jourAgenda(e);
          return (
            /* Pastille à 4 px de haut et de bas (relecture du 04/10) : à 6, la
             * 3e descendait à 187 px, coupée par le bord d'une carte de 184. */
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 10px', borderRadius: 10, background: i === 0 ? 'rgba(var(--o-accent-rgb),.1)' : 'var(--o-s1)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.summary}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--o-text2)' }}>{jour}</div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 800, flexShrink: 0, color: i === 0 ? 'var(--o-accent-soft)' : 'var(--o-text2)' }}>{heure || tr('Tâche')}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
/* Activité récente : le journal de la MAISON — ouvrants, machines, volets,
 * serrures, alarme, capteurs muets — en pastilles colorées par domaine. */
function CvActivite({ hass, demoEvents = null }) {
  const S = (hass && hass.states) || {};
  const ids = useMemo(() => {
    const doms = ['cover.', 'vacuum.', 'lawn_mower.', 'lock.', 'alarm_control_panel.'];
    const l = Object.keys(S).filter(id => doms.some(d => id.indexOf(d) === 0)
      || (id.indexOf('binary_sensor.') === 0 && ['door', 'window', 'garage_door', 'opening', 'connectivity', 'motion'].indexOf((S[id].attributes || {}).device_class) >= 0));
    return l.slice(0, 40);
  }, [hass]);
  const reels = grouperJournal(useRoomLogbook(hass, ids));
  const events = demoEvents !== null ? demoEvents : reels;
  const pastille = (id) => {
    const dom = String(id).split('.')[0];
    const dcE = ((S[id] || {}).attributes || {}).device_class;
    if (dcE === 'connectivity') return 'var(--o-text3)';
    if (dom === 'cover') return 'var(--o-purple)';
    if (dom === 'vacuum' || dom === 'lawn_mower') return 'var(--o-ok)';
    if (dom === 'binary_sensor') return 'var(--o-warn)';
    if (dom === 'lock' || dom === 'alarm_control_panel') return 'var(--o-accent-soft)';
    return 'var(--o-accent-soft)';
  };
  const heure = (when) => { const ms = when < 1e12 ? when * 1000 : when; const d = new Date(ms); const auj = new Date(); return d.toDateString() === auj.toDateString() ? d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString(locale(), { weekday: 'short' }); };
  const nomDe = (id) => ((S[id] || {}).attributes || {}).friendly_name || String(id).split('.')[1];
  return (
    <div className="o-piece" style={{ ...CV_CADRE, height: '100%', minHeight: 172, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{tr('Activité récente')}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text3)' }}>{new Date().toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      {/* De l'AIR entre l'en-tête et les lignes — règle dure, comme partout. */}
      <div style={{ flex: 1, minHeight: 12 }} />
      {events.length === 0 && <div style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600, padding: '10px 0' }}>{tr('Rien à raconter')}</div>}
      {events.slice(0, 4).map((e, i) => (
        <div key={(e.when || 0) + '|' + i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: pastille(e.entity_id) }} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.message || (nomDe(e.entity_id) + ' ' + etatJournal(e.entity_id, e.state, S, events.findIndex(x => x.entity_id === e.entity_id) === i).toLowerCase())}{e.n > 1 ? ' ·×' + e.n : ''}</span>
          <span style={{ fontSize: 11, fontWeight: 600, flexShrink: 0, color: 'var(--o-text3)' }}>{heure(e.when)}</span>
        </div>
      ))}
    </div>
  );
}

/* Journal : les dernières entrées du logbook pour CETTE entité. */
function CvJournal({ id, hass }) {
  // Journal d'UNE entité : ne fusionner que les états identiques qui se
  // répètent — fusionner par entité viderait la carte de son sujet.
  const events = grouperJournal(useRoomLogbook(hass, useMemo(() => [id], [id])), (e) => (e.entity_id || '') + '|' + (e.state != null ? e.state : e.message));
  const S = (hass && hass.states) || {};
  const st = S[id];
  /* L'heure dit le jour quand ce n'est plus aujourd'hui (audit du 03/10) :
   * « 16:00 » seul datait du jour un événement de lundi. Le crochet ne rend
   * plus que les dernières 24 h et relit la minute : la ligne passe à
   * « hier » au premier coup de minuit. */
  return (
    <div className="o-piece" style={{ ...CV_CADRE, height: '100%', overflow: 'hidden' }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cvName(st, id)}</div>
      <div style={{ fontSize: 11, color: 'var(--o-text2)', fontWeight: 600, marginBottom: 4 }}>{tr('Journal')}</div>
      {events.length === 0 && <div style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600, padding: '10px 0' }}>{tr('Rien à raconter')}</div>}
      {events.slice(0, 3).map((e, i) => (
        <div key={(e.when || 0) + '|' + i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: 'var(--o-bw,1px) solid var(--o-bd3)' }}>
          <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: 'var(--o-text1)' }}>{e.state != null ? etatJournal(id, e.state, S, i === 0) : (e.message || '')}{e.n > 1 ? ' ·×' + e.n : ''}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--o-text3)', flexShrink: 0, whiteSpace: 'nowrap' }}>{heureJournal(e.when)}</span>
        </div>
      ))}
    </div>
  );
}

/* Graphique 24 h : l'historique du capteur en filigrane, la valeur en clair.
 * L'API historique de HA est un GET (pattern des autres lectures d'historique
 * du fichier) : relecture au montage puis toutes les cinq minutes. */
function CvHistory({ id, hass, demoPoints = null, onOpen = null }) {
  // La bibliothèque injecte un historique FACTICE : le hook tourne quand
  // même (ordre des hooks), ses données sont simplement ignorées.
  const pointsReels = useHistorique24(hass, id);
  const points = demoPoints !== null ? demoPoints : pointsReels;
  const st = hass && hass.states ? hass.states[id] : null;
  const a = (st && st.attributes) || {};
  const mort = !st || st.state === 'unavailable';
  // Une date, une heure (05/10, suite « dates partout ») : `texteDate`, sans
  // courbe ni min/max — la carte d'un capteur daté traçait l'année, et
  // l'écrivait en grand, « 2 026 ».
  const date = mort ? null : texteDate(st);
  const cur = st && date == null ? parseFloat(st.state) : NaN;
  // L'ÉNERGIE (kWh, compteur croissant) se raconte en BARRES par heure —
  // chaque barre est le delta du compteur sur l'heure. Le reste en courbe.
  const estEnergie = a.device_class === 'energy' || /Wh$/.test(a.unit_of_measurement || '');
  let chemin = '', aire = '', vmin = null, vmax = null, barres = null, totalJour = null;
  if (date == null && Array.isArray(points) && points.length > 1) {
    if (estEnergie) {
      const seaux = new Map();
      points.forEach(p => { const h = Math.floor(p.t / 3600000); const b = seaux.get(h) || { min: p.v, max: p.v }; b.min = Math.min(b.min, p.v); b.max = Math.max(b.max, p.v); seaux.set(h, b); });
      const parHeure = [...seaux.keys()].sort((x, y) => x - y).map(h => Math.max(0, seaux.get(h).max - seaux.get(h).min));
      // DIX barres au plus : des heures regroupées en tranches larges — vingt-
      // quatre barres fines « ressemblaient à rien » (retour d'essai).
      const N = Math.min(10, parHeure.length);
      barres = Array.from({ length: N }, (_, i) => {
        const de = Math.floor(i * parHeure.length / N), a = Math.floor((i + 1) * parHeure.length / N);
        return parHeure.slice(de, a).reduce((s, v) => s + v, 0);
      });
      totalJour = parHeure.reduce((s, v) => s + v, 0);
    } else {
      const t0 = points[0].t, t1 = points[points.length - 1].t || t0 + 1;
      vmin = Math.min(...points.map(p => p.v)); vmax = Math.max(...points.map(p => p.v));
      const spread = (vmax - vmin) || 1;
      const X = (t) => ((t - t0) / (t1 - t0 || 1)) * 100;
      const Y = (v) => 34 - ((v - vmin) / spread) * 28;
      chemin = points.map((p, i) => (i ? 'L' : 'M') + X(p.t).toFixed(1) + ' ' + Y(p.v).toFixed(1)).join(' ');
      aire = chemin + ` L 100 40 L 0 40 Z`;
    }
  }
  const bmax = barres && barres.length ? Math.max(...barres, 0.001) : 1;
  const valeur = date != null ? date : isNaN(cur) ? '—' : decMax(cur, 1);
  const unite = date != null ? '' : a.unit_of_measurement || '';
  const nom = cvName(st, id);
  return (
    /* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-tabindex */
    <div className={'o-piece' + (mort ? ' o-panne' : '')} role={onOpen ? 'button' : undefined} tabIndex={onOpen ? 0 : undefined}
      aria-label={onOpen ? nomCarte(nom, date == null && isNaN(cur) ? (mort ? tr('Indisponible') : null) : (unite ? valeur + ' ' + unite : valeur)) : undefined} aria-haspopup={onOpen ? 'dialog' : undefined}
      onClick={onOpen ? () => onOpen(id) : undefined}
      onKeyDown={onOpen ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(id); } } : undefined}
      style={{ ...CV_CADRE, height: '100%', minHeight: 150, position: 'relative', overflow: 'hidden', opacity: mort ? .55 : 1, cursor: onOpen ? 'pointer' : undefined }}>
      {chemin && (
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, width: '100%', height: '58%' }}>
          <path d={aire} fill="rgba(var(--o-accent-rgb),.10)" />
          <path d={chemin} fill="none" stroke="var(--o-accent)" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      {/* Barres en éléments pleins, coins nets — la dernière porte l'accent. */}
      {barres && barres.length > 0 && (
        <div aria-hidden="true" style={{ position: 'absolute', left: 12, right: 12, bottom: 10, height: '48%', display: 'flex', alignItems: 'flex-end', gap: 6 }}>
          {barres.map((v, i) => (
            <div key={i} style={{ flex: 1, minWidth: 0, height: Math.max(8, (v / bmax) * 100) + '%', borderRadius: 10, background: i === barres.length - 1 ? 'var(--o-accent-fond)' : 'rgba(var(--o-accent-rgb),.35)' }} />
          ))}
        </div>
      )}
      <div style={{ position: 'relative', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nom}</div>
      <div style={{ position: 'relative', fontSize: 25, fontWeight: 800, marginTop: 2 }}>{valeur}<span style={{ fontSize: 13, fontWeight: 700, color: 'var(--o-text2)', marginLeft: 4 }}>{unite}</span></div>
      <div style={{ position: 'relative', marginTop: 'auto', fontSize: 11, fontWeight: 600, color: 'var(--o-text3)' }}>
        {date != null ? null : points === null ? tr('Chargement…') : points === 'erreur' ? tr('Historique indisponible pour le moment') : points.length < 2 ? tr("Pas d'historique sur 24 h")
          : estEnergie ? tr('{n} sur 24 h', { n: decMax(totalJour, 1) + ' ' + (a.unit_of_measurement || 'kWh') })
            : (tr('min {a} · max {b}', { a: decMax(vmin, 1), b: decMax(vmax, 1) }))}
      </div>
    </div>
  );
}
/* Les entites que la BANNIERE et la carte Securite comptent, une par une
 * plutot que par domaine.
 *
 * Surveiller `binary_sensor.` en entier reveillerait l'accueil pour un
 * capteur de vibration ou une pile ; on ne prend que ce qui se lit a
 * l'ecran : les ouvrants, le mouvement (la ligne d'etat de Securite, v3.29),
 * la surete (« A surveiller »), plus les cameras et les panneaux d'alarme.
 * Sans cette liste, a l'inverse, la banniere lit des etats que rien ne la
 * fait relire : elle garde une fenetre ouverte a l'ecran apres sa fermeture,
 * et cache un media qui vient de demarrer.
 */
const bannerKeys = () => {
  const S = (getHass() || {}).states || {};
  const out = [];
  for (const id in S) {
    const p = id.indexOf('.');
    const dom = p > 0 ? id.slice(0, p) : '';
    if (dom === 'media_player' || dom === 'camera' || dom === 'alarm_control_panel' || APPAREIL_ACTIF[dom]) { out.push(id); continue; }
    if (dom !== 'binary_sensor') continue;
    const dc = (S[id].attributes || {}).device_class;
    if (OUVRANT_DCS.indexOf(dc) >= 0 || CLASSES_MOUVEMENT.indexOf(dc) >= 0 || CLASSES_SURETE.indexOf(dc) >= 0) out.push(id);
  }
  return out;
};
const airDe = (S) => {
  const par = (dcs) => Object.keys(S || {}).filter(id => id.indexOf('sensor.') === 0 && S[id] && dcs.indexOf((S[id].attributes || {}).device_class) >= 0 && !isNaN(parseFloat(S[id].state)));
  const maxDe = (ids) => ids.length ? ids.reduce((m, id) => parseFloat(S[id].state) > parseFloat(S[m].state) ? id : m, ids[0]) : null;
  const moyDe = (ids) => ids.length ? ids.reduce((s, id) => s + parseFloat(S[id].state), 0) / ids.length : null;
  const co2 = maxDe(par(['carbon_dioxide']));
  return {
    co2, co2V: co2 ? Math.round(parseFloat(S[co2].state)) : null,
    vocV: (() => { const v = maxDe(par(['volatile_organic_compounds', 'volatile_organic_compounds_parts'])); return v ? Math.round(parseFloat(S[v].state)) : null; })(),
    pmV: (() => { const v = maxDe(par(['pm25'])); return v ? Math.round(parseFloat(S[v].state)) : null; })(),
    humV: (() => { const v = moyDe(par(['humidity'])); return v != null ? Math.round(v) : null; })(),
  };
};
/* Qualité d'air : le CO₂ le plus haut de la maison en vedette, verdict en
 * badge, les autres mesures en sous-tuiles. */
function CvAir({ hass }) {
  const S = (hass && hass.states) || {};
  const air = airDe(S);
  // Le verdict de la table de confort, comme les cartes des capteurs.
  const vAir = air.co2V == null ? null : verdictMesure('co2', air.co2V);
  const [txt, col] = vAir ? [vAir.t, vAir.c] : ['—', 'var(--o-text3)'];
  const tuile = (l, v) => v != null && (
    <div style={{ flex: 1, minWidth: 0, padding: '5px 9px', borderRadius: 10, background: 'var(--o-s1)' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--o-text3)' }}>{l}</div>
      <div style={{ fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}>{v}</div>
    </div>
  );
  return (
    <div className="o-piece" style={{ ...CV_CADRE, height: '100%', minHeight: 172, overflow: 'hidden' }}>
      {/* Gabarit maison : icône hg, verdict hd, TITRE SOUS L'ICÔNE. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <span style={RM_ICO(hx(col, .14), col)}><Fi i="smog" size={16} /></span>
        <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 999, background: hx(col, .14), color: col }}>{txt}</span>
      </div>
      <div style={{ marginTop: 8 }}>
        <div style={RM_NAME}>{tr('Qualité air')}</div>
        <div style={{ fontSize: 19, fontWeight: 800, marginTop: 1 }}>{air.co2V != null ? air.co2V : '—'}<span style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-text2)', marginLeft: 5 }}>ppm CO₂</span></div>
        <div style={{ height: 5, borderRadius: 4, background: 'var(--o-bd1)', margin: '6px 0 7px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: Math.min(100, (air.co2V || 0) / 20) + '%', background: col, borderRadius: 4, transition: 'width .3s' }} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {tuile(tr('COV'), air.vocV != null ? air.vocV + ' ppb' : null)}
          {tuile('PM2.5', air.pmV != null ? air.pmV + ' µg' : null)}
          {tuile(tr('Humidité'), air.humV != null ? air.humV + ' %' : null)}
        </div>
      </div>
    </div>
  );
}
/* Toute la maisonnée, sans limite : la carte n'en montre que ce que 184 px
 * peuvent porter. Même patron que les autres feuilles (ADR 0055) : hauteur au
 * contenu, une croix en bout de ligne d'en-tête. Chaque ligne dit où est la
 * personne et depuis quand, comme la carte d'une personne seule. */
function FeuillePresence({ liste, onClose }) {
  const maison = liste.filter(p => p.home).length;
  return (
    <BottomSheet onClose={onClose}>
      <TitreFeuille marge={12}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
          <span style={{ fontSize: 17, fontWeight: 800 }}>{tr('Présence')}</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: maison ? 'var(--o-ok)' : 'var(--o-text3)' }}>{maison + ' / ' + liste.length}</span>
        </span>
      </TitreFeuille>
      <div role="list">
        {liste.map((p) => (
          <div key={p.haid} role="listitem" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderTop: 'var(--o-bw,1px) solid var(--o-bd3)' }}>
            <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: p.img ? `url("${p.img}") center/cover` : 'var(--o-s1)', fontSize: 12, fontWeight: 800, color: p.home ? 'var(--o-text2)' : 'var(--o-text3)', opacity: p.home || !p.img ? 1 : .55 }}>{!p.img && p.name.slice(0, 2).toUpperCase()}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
              <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: p.home ? 'var(--o-ok)' : 'var(--o-text3)' }}>{p.mot + (p.lc ? ' · ' + relTime(p.lc).toLowerCase() : '')}</span>
            </span>
            <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', flexShrink: 0, background: p.home ? 'var(--o-ok)' : 'var(--o-text3)', boxShadow: p.home ? '0 0 6px rgba(var(--o-ok-rgb),.6)' : 'none' }} />
          </div>
        ))}
      </div>
    </BottomSheet>
  );
}
/* Présence : toute la maisonnée. Jusqu'à trois personnes, une ligne chacune —
 * avatar, où, depuis quand. À partir de quatre, la ligne déborderait le format
 * standard (deux rangées de 88 px, règle du projet) : une grille d'avatars,
 * quatre par rangée, deux rangées — huit tiennent —, et « +n » sur la dernière
 * case au-delà (ADR 0088). L'ordre est celui de la configuration : une famille
 * connaît les places, et l'avatar estompé dit déjà l'absence. Un toucher ouvre
 * la feuille, où tout le monde tient sans limite. */
function CvPresence({ hass, gens = null }) {
  const S = (hass && hass.states) || {};
  const liste = (gens || peopleList()).map(p => {
    const st = S[p.haid];
    // `mot` : « À la maison », « Absent », le nom de sa zone, ou « Inconnu » quand son traceur se tait (G1-D8).
    return { ...p, home: !!st && st.state === 'home', lc: st && st.last_changed, mot: motPresence(st, tr('À la maison')) };
  });
  const maison = liste.filter(p => p.home).length;
  const [ouvert, setOuvert] = useState(false);
  const ouvrable = liste.length > 0;
  // Le compteur affiché en haut à droite, et lu dans le nom de la carte.
  const compteur = maison + ' / ' + liste.length;
  /* Relecture du lot 13 : un rôle bouton rend sa descendance
   * présentationnelle — qui est là (« Alice · À la maison ») ne se lisait
   * nulle part. Ces textes se lisent en DESCRIPTION, au focus : le nom et
   * l'état de chaque ligne (pas l'avatar, dont les initiales se liraient),
   * sinon la grille, dont chaque case porte déjà son nom. */
  const did = useId();
  const decrit = !ouvrable ? undefined : liste.length <= 3 ? liste.map(p => did + p.haid).join(' ') : did + '-g';
  const etat = (p) => p.mot;
  const avatar = (p, taille) => (
    <span aria-hidden="true" style={{ position: 'relative', width: taille, height: taille, flexShrink: 0 }}>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', borderRadius: '50%', background: p.img ? `url("${p.img}") center/cover` : 'var(--o-s1)', fontSize: 10, fontWeight: 800, color: p.home ? 'var(--o-text2)' : 'var(--o-text3)', opacity: p.home || !p.img ? 1 : .55 }}>{!p.img && p.name.slice(0, 2).toUpperCase()}</span>
      <span style={{ position: 'absolute', right: -2, bottom: -2, width: 9, height: 9, borderRadius: '50%', background: p.home ? 'var(--o-ok)' : 'var(--o-text3)', border: '2px solid var(--o-surfA)', boxShadow: p.home ? '0 0 6px rgba(var(--o-ok-rgb),.6)' : 'none' }} />
    </span>
  );
  return (<>
    {/* Ouvrable, la carte EST un bouton (rôle, tabulation, Entrée et Espace) :
      * elle ne porte aucune commande. Vide, elle n'est rien de tout cela.
      * Son nom est ce qu'elle affiche, « Présence, 1 / 2 », et elle dit
      * ouvrir une feuille (lot 13 de l'audit du 03/10) : « Ouvrir Présence »
      * taisait combien étaient là. */}
    {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
    <div className="o-piece o-carte-presence" role={ouvrable ? 'button' : undefined} tabIndex={ouvrable ? 0 : undefined} aria-label={ouvrable ? nomCarte(tr('Présence'), compteur) : undefined} aria-haspopup={ouvrable ? 'dialog' : undefined} aria-describedby={decrit}
      onClick={ouvrable ? () => setOuvert(true) : undefined}
      onKeyDown={ouvrable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOuvert(true); } } : undefined}
      style={{ ...CV_CADRE, height: '100%', minHeight: 172, overflow: 'hidden', cursor: ouvrable ? 'pointer' : 'default' }}>
      {/* Gabarit maison : icône hg, compteur hd, TITRE SOUS L'ICÔNE. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <span style={RM_ICO(maison ? 'rgba(var(--o-ok-rgb),.14)' : 'var(--o-s1)', maison ? 'var(--o-ok)' : 'var(--o-text3)')}><Fi i="users" size={16} /></span>
        {liste.length > 0 && <span style={{ fontSize: 11, fontWeight: 800, color: maison ? 'var(--o-ok)' : 'var(--o-text3)' }}>{compteur}</span>}
      </div>
      <div style={{ marginTop: 8 }}>
        <div style={RM_NAME}>{tr('Présence')}</div>
        {liste.length === 0 && <div style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600, padding: '10px 0' }}>{tr('Personne de configuré')}</div>}
        {liste.length <= 3 && liste.map((p) => (
          <div key={p.haid} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', borderTop: 'var(--o-bw,1px) solid var(--o-bd3)', marginTop: 2 }}>
            <span style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: p.img ? `url("${p.img}") center/cover` : 'var(--o-s1)', fontSize: 10, fontWeight: 800, color: p.home ? 'var(--o-text2)' : 'var(--o-text3)', opacity: p.home || !p.img ? 1 : .55 }}>{!p.img && p.name.slice(0, 2).toUpperCase()}</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} id={did + p.haid}>{p.name}<span className="o-presence-ou" style={{ fontWeight: 600, color: 'var(--o-text3)' }}> · {etat(p)}</span></span>
            <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: p.home ? 'var(--o-ok)' : 'var(--o-text3)', boxShadow: p.home ? '0 0 6px rgba(var(--o-ok-rgb),.6)' : 'none' }} />
          </div>
        ))}
        {liste.length > 3 && (
          <div className="o-presence-grille" id={did + '-g'} role="list" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '4px 4px', marginTop: 2 }}>
            {(liste.length > 8 ? liste.slice(0, 7) : liste).map((p) => (
              <div key={p.haid} role="listitem" title={p.name + ' · ' + etat(p)} aria-label={p.name + ' · ' + etat(p)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 0 }}>
                {avatar(p, 26)}
                <span className="o-presence-nom" aria-hidden="true" style={{ maxWidth: '100%', fontSize: 10.5, fontWeight: 700, color: p.home ? 'var(--o-text1)' : 'var(--o-text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
              </div>
            ))}
            {liste.length > 8 && (
              <div role="listitem" title={trN(liste.length - 7, '{n} autre personne', '{n} autres personnes')} aria-label={trN(liste.length - 7, '{n} autre personne', '{n} autres personnes')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 0 }}>
                <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--o-s1)', fontSize: 10.5, fontWeight: 800, color: 'var(--o-text2)' }}>{'+' + (liste.length - 7)}</span>
                <span className="o-presence-nom" aria-hidden="true" style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--o-text3)' }}>{'…'}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
    {ouvert && <FeuillePresence liste={liste} onClose={() => setOuvert(false)} />}
  </>);
}
/* Ouvrants : portes, fenêtres, garage — l'état de chaque ouverture, et le
 * verdict d'ensemble en tête. */
function CvOuvrants({ hass }) {
  const S = (hass && hass.states) || {};
  const os = ouvrantsDe(S);
  const ouverts = os.filter(o => o.on).length;
  const icoDe = (dc) => dc === 'window' ? 'window-alt' : dc === 'garage_door' ? 'garage' : 'door-closed';
  // Les ouverts d'abord : c'est eux qu'on cherche.
  const tri = [...os].sort((a, b) => (b.on ? 1 : 0) - (a.on ? 1 : 0));
  return (
    <div className="o-piece" style={{ ...CV_CADRE, height: '100%', minHeight: 172, overflow: 'hidden' }}>
      {/* Gabarit maison : icône hg, verdict hd, TITRE SOUS L'ICÔNE. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <span style={RM_ICO(ouverts ? 'rgba(var(--o-warn-rgb),.16)' : 'var(--o-s1)', ouverts ? 'var(--o-warn)' : 'var(--o-text3)')}><Fi i={ouverts ? 'door-open' : 'door-closed'} size={16} /></span>
        <span style={{ fontSize: 11, fontWeight: 800, color: ouverts ? 'var(--o-warn)' : 'var(--o-ok)' }}>{os.length === 0 ? '—' : ouverts === 0 ? tr('Tout fermé') : trN(ouverts, '{n} ouvert', '{n} ouverts')}</span>
      </div>
      <div style={{ marginTop: 10 }}>
        <div style={RM_NAME}>{tr('Ouvrants')}</div>
        {os.length === 0 && <div style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600, padding: '10px 0' }}>{tr('Aucun capteur d’ouverture')}</div>}
        {tri.slice(0, 3).map((o) => (
          <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', borderTop: 'var(--o-bw,1px) solid var(--o-bd3)', marginTop: 2 }}>
            <Fi i={o.on && o.dc === 'door' ? 'door-open' : icoDe(o.dc)} size={12} color={o.on ? 'var(--o-warn)' : 'var(--o-text3)'} />
            <span style={{ flex: 1, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.nom}</span>
            <span style={{ fontSize: 11, fontWeight: 800, flexShrink: 0, color: o.on ? 'var(--o-warn)' : 'var(--o-ok)' }}>{o.on ? (tr('Ouvert') + (o.lc ? ' ' + relTime(o.lc).toLowerCase() : '')) : tr('Fermée')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
/* Énergie maison : la consommation du moment en vedette, la part solaire en
 * badge, les flux en sous-tuiles. Les rôles viennent du tableau Énergie. */
function CvEnergie({ hass, roles = null }) {
  const S = (hass && hass.states) || {};
  const EN = roles || enHaids();
  /* En watts et en kWh, quelle que soit l'unité du capteur (audit du 03/10) :
   * un compteur P1/DSMR en kW s'affichait « 3 W », un compteur en Wh mille
   * fois trop grand. `null` sans valeur lisible : la tuile ne paraît pas. */
  const lit = (id, de) => (id && S[id] ? de(S[id]) : null);
  /* Tous les onduleurs, et le flux NET que Home Assistant nomme d'abord (chantier G3, ADR 0302). */
  const sol = sommeLue(idsDe(EN, 'solarNow'), (id) => lit(id, wattsDe));
  const net = sommeLue(idsDe(EN, 'consoNow'), (id) => lit(id, wattsDe));
  const grid = net != null ? net : lit(EN.gridNow, wattsDe);
  /* Sans compteur réseau lisible, la consommation de la maison est inconnue
   * (audit du 03/10) : `grid || 0` faisait du solaire seul TOUTE la maison,
   * la pastille annonçait « Solaire 100 % » dès que le compteur se taisait,
   * et la barre se peignait en réseau ; elle reste vide désormais. Un solaire
   * muet compte pour rien, lui : un onduleur éteint la nuit ne produit pas.
   * Le réseau garde son SIGNE (relecture du 03/10) : un compteur net passe
   * sous zéro à l'export, et `Math.max(0, grid)` faisait de « solaire 3000 W,
   * réseau −2000 W » une maison à 3000 W au lieu de 1000 — le double de
   * l'export, quand la vue Énergie dit 1000. */
  const maison = grid != null ? Math.max(0, Math.round((sol || 0) + grid)) : null;
  const part = maison && sol != null ? Math.round(Math.min(100, sol / maison * 100)) : null;
  const jour = lit(EN.consoJour, kwhDe);
  const tuile = (l, v, c) => v != null && (
    <div style={{ flex: 1, minWidth: 0, padding: '5px 9px', borderRadius: 10, background: 'var(--o-s1)' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--o-text3)' }}>{l}</div>
      <div style={{ fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap', color: c || 'var(--o-text)' }}>{v}</div>
    </div>
  );
  return (
    <div className="o-piece" style={{ ...CV_CADRE, height: '100%', minHeight: 172, overflow: 'hidden' }}>
      {/* Gabarit maison : icône hg, part solaire hd, TITRE SOUS L'ICÔNE. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <span style={RM_ICO('rgba(var(--o-accent-rgb),.14)', 'var(--o-accent-soft)')}><Fi i="bolt" size={16} /></span>
        {part != null && <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 999, background: 'rgba(var(--o-ok-rgb),.14)', color: 'var(--o-ok)' }}>{tr('Solaire')} {part} %</span>}
      </div>
      <div style={{ marginTop: 8 }}>
        <div style={RM_NAME}>{tr('Énergie maison')}</div>
        <div style={{ fontSize: 19, fontWeight: 800, marginTop: 1 }}>{maison != null ? maison : '—'}<span style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-text2)', marginLeft: 5 }}>W</span></div>
        <div style={{ display: 'flex', height: 5, borderRadius: 4, background: 'var(--o-bd1)', margin: '6px 0 7px', overflow: 'hidden' }}>
          <div style={{ width: (part || 0) + '%', background: 'var(--o-ok)', transition: 'width .3s' }} />
          <div style={{ width: (maison != null ? 100 - (part || 0) : 0) + '%', background: 'var(--o-accent-fond)', opacity: .8, transition: 'width .3s' }} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {tuile(tr('Solaire'), sol != null ? Math.round(sol) + ' W' : null, 'var(--o-ok)')}
          {tuile(tr('Réseau'), grid != null ? Math.round(grid) + ' W' : null, 'var(--o-accent-soft)')}
          {tuile(tr("Aujourd'hui"), jour != null ? decMax(jour, 1) + ' kWh' : null)}
        </div>
      </div>
    </div>
  );
}

/* Calendrier : le mois en grille — aujourd'hui à l'accent, un point sous
 * les jours qui portent un événement (7 prochains jours connus). */
function CvCalendrier({ id, hass, onOpen = null }) {
  const events = useAgenda(hass, useMemo(() => [id], [id]));
  const auj = new Date();
  // La SEMAINE courante (lundi → dimanche) : le mois entier étouffait dans le
  // format standard — la référence « April 21 » respire mieux (retour 31/08).
  const lundi = new Date(auj); lundi.setHours(0, 0, 0, 0); lundi.setDate(auj.getDate() - ((auj.getDay() + 6) % 7));
  const semaine = Array.from({ length: 7 }, (_, i) => { const d = new Date(lundi); d.setDate(lundi.getDate() + i); return d; });
  /* Combien d'evenements par jour, pas seulement s'il y en a : deux rendez-vous
   * ne se voient pas comme un seul. */
  const parJour = new Map();
  for (const e of events) {
    const k = cleJour(new Date(e.start.dateTime || (e.start.date + 'T00:00:00')));
    parJour.set(k, (parJour.get(k) || 0) + 1);
  }
  const mois = auj.toLocaleDateString(locale(), { month: 'long' });
  return (
    /* Meme motif que la tuile ci-dessus : tout est conditionne par `onOpen`.
     * La carte ne porte aucune commande : elle reste le bouton. Son nom est
     * ce qu'elle affiche, le mois et le quantieme, et elle dit ouvrir une
     * feuille (lot 13 de l'audit du 03/10) : son ancien nom, un geste,
     * taisait la date qu'on lit. */
    /* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-tabindex */
    <div className="o-piece" onClick={onOpen ? () => onOpen(id) : undefined} tabIndex={onOpen ? 0 : undefined}
      role={onOpen ? 'button' : undefined}
      onKeyDown={onOpen ? (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onOpen(id); } } : undefined}
      aria-label={onOpen ? nomCarte(tr('Calendrier'), mois + ' ' + auj.getDate()) : undefined} aria-haspopup={onOpen ? 'dialog' : undefined}
      style={{ ...CV_CADRE, height: '100%', minHeight: 172, overflow: 'hidden', cursor: onOpen ? 'pointer' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        {/* Le mois et le quantieme au MEME poids, l'un a gauche, l'autre a
          * droite. Le quantieme etait deux fois plus gras : il ecrasait le
          * mois, et la ligne se lisait comme un chiffre suivi d'une legende
          * plutot que comme une date. */}
        <span style={{ fontSize: 31, fontWeight: 300, lineHeight: 1.05, textTransform: 'capitalize', letterSpacing: '-.02em' }}>{mois}</span>
        <span style={{ fontSize: 31, fontWeight: 300, lineHeight: 1.05, letterSpacing: '-.02em' }}>{auj.getDate()}</span>
      </div>
      <div style={{ flex: 1, minHeight: 10 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', rowGap: 6, textAlign: 'center' }}>
        {semaine.map((d, i) => <span key={'e' + i} style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.04em', color: 'var(--o-text3)', textTransform: 'uppercase' }}>{d.toLocaleDateString(locale(), { weekday: 'narrow' })}</span>)}
        {/* Un point SOUS le jour, et le jour même dans un carré arrondi.
          *
          * C'était l'inverse : un anneau autour du chiffre, épaissi à deux
          * rendez-vous. L'anneau tenait sur une seule ligne, ce qui était son
          * seul mérite — il se confondait avec la pastille d'aujourd'hui, deux
          * cercles concentriques quand les deux tombaient ensemble, et il
          * serrait le chiffre qu'il devait mettre en avant.
          *
          * Le point coûte une ligne de quatre pixels. En échange, le chiffre
          * respire, la marque ne ressemble plus à la pastille, et deux points
          * disent « chargé » plus vite qu'un trait plus épais.
          *
          * Les jours passés s'effacent : la semaine se lit d'un coup, de ce
          * qui est fait vers ce qui vient. */}
        {semaine.map((d, i) => {
          const cJour = d.toDateString() === auj.toDateString();
          const passe = !cJour && d < auj;
          const n = parJour.get(cleJour(d)) || 0;
          return (
            <span key={'j' + i} style={{ justifySelf: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
              {/* Carré arrondi plutôt que rond : il tient le chiffre sans le
                * serrer, et ne peut pas se lire comme un point de plus. */}
              <span style={{ width: 26, height: 26, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: cJour ? 'var(--o-accent-fond)' : 'transparent' }}>
                <span style={{ fontSize: 12.5, fontWeight: cJour ? 700 : 500,
                  color: cJour ? '#fff' : 'var(--o-text1)', opacity: cJour ? 1 : passe ? .5 : .92 }}>{d.getDate()}</span>
              </span>
              {/* Aujourd'hui garde son point : sans lui, le jour le plus
                * important serait le seul muet sur ce qu'il contient. */}
              <span aria-hidden="true" style={{ height: 4, display: 'flex', gap: 3, alignItems: 'center' }}>
                {n > 0 && Array.from({ length: Math.min(n, 2) }).map((_, k) => (
                  <span key={k} style={{ width: 4, height: 4, borderRadius: '50%',
                    background: 'var(--o-accent-soft)', opacity: passe ? .35 : cJour ? 1 : .85 }} />
                ))}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
/* Localisation : la maison au centre, chacun placé par distance et cap —
 * AUCUNE tuile externe (règle du projet), l'échelle est logarithmique. */
function CvCarte({ hass, gensDemo = null }) {
  const S = (hass && hass.states) || {};
  const home = (() => { const z = S['zone.home']; const za = (z && z.attributes) || {}; return (za.latitude != null) ? { lat: za.latitude, lon: za.longitude } : null; })();
  const gens = (gensDemo || peopleList()).map(p => {
    const st = S[p.haid]; const a = (st && st.attributes) || {};
    return { ...p, home: !!st && st.state === 'home', lat: a.latitude, lon: a.longitude };
  });
  const km = (a, b) => { const R = 6371, dLa = (b.lat - a.lat) * Math.PI / 180, dLo = (b.lon - a.lon) * Math.PI / 180; const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  // L'unite de distance de l'installation (mi aux Etats-Unis) : le calcul reste en km,
  // seul l'affichage se convertit.
  const uniteDist = (hass && hass.config && hass.config.unit_system && hass.config.unit_system.length === 'mi') ? 'mi' : 'km';
  const versUniteDist = (valKm) => uniteDist === 'mi' ? valKm * 0.621371 : valKm;
  const cap = (a, b) => Math.atan2((b.lon - a.lon) * Math.cos(b.lat * Math.PI / 180), b.lat - a.lat);
  const maison = gens.filter(g => g.home).length;
  return (
    <div className="o-piece" style={{ ...CV_CADRE, height: '100%', minHeight: 172, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{tr('Localisation')}</span>
        <span style={{ fontSize: 11, fontWeight: 800, color: maison ? 'var(--o-ok)' : 'var(--o-text3)' }}>{gens.length ? maison + ' / ' + gens.length + ' ' + tr('à la maison') : '—'}</span>
      </div>
      <div style={{ flex: 1, position: 'relative', marginTop: 8, borderRadius: 14, background: 'radial-gradient(circle at 50% 50%, rgba(var(--o-accent-rgb),.08), transparent 70%), var(--o-s1)', overflow: 'hidden' }}>
        {/* cercles de distance (échelle log : ~1 km, ~10 km) */}
        {[34, 62].map((r) => <span key={r} aria-hidden="true" style={{ position: 'absolute', left: '50%', top: '50%', width: r * 2, height: r * 2, transform: 'translate(-50%,-50%)', borderRadius: '50%', border: '1px dashed var(--o-bd1)' }} />)}
        <span style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 26, height: 26, borderRadius: '50%', background: 'rgba(var(--o-accent-rgb),.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--o-accent-soft)' }}><Fi i="home" size={13} /></span>
        {gens.map((g, i) => {
          let x = 50, y = 50, dist = null;
          if (!g.home && home && g.lat != null && g.lon != null) {
            dist = km(home, { lat: g.lat, lon: g.lon });
            const r = Math.min(72, 16 + 30 * Math.log10(1 + dist));
            const c = cap(home, { lat: g.lat, lon: g.lon });
            x = 50 + (r * Math.sin(c)) / 2.2; y = 50 - (r * Math.cos(c)) / 1.4;
          } else if (g.home) { x = 50 + (i % 2 ? 9 : -9); y = 58; }
          else return null; // absent sans position : rien à placer
          return (
            <span key={g.haid} title={g.name + (dist != null ? ' · ' + Math.round(versUniteDist(dist)) + ' ' + uniteDist : '')}
              style={{ position: 'absolute', left: x + '%', top: y + '%', transform: 'translate(-50%,-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: g.img ? `url("${g.img}") center/cover` : 'var(--o-surfA)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: 'var(--o-text1)', boxShadow: g.home ? '0 0 0 2px var(--o-ok)' : '0 0 0 2px var(--o-bd1)' }}>{!g.img && g.name.slice(0, 2).toUpperCase()}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--o-text2)', whiteSpace: 'nowrap' }}>{g.name}{dist != null ? ' · ' + Math.round(versUniteDist(dist)) + ' ' + uniteDist : ''}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** La carte d'une entrée de vue custom, selon sa forme et son type. */
function CvTyped({ x, hass, dc }) {
  if (cvEstTpl(x)) return <CvTemplateCard def={x} hass={hass} />;
  // La chaîne nue EST la compacte : une ligne, le contrôle primaire, rien dessous.
  if (typeof x === 'string') return <CvCard id={x} hass={hass} onOpen={dc.ouvrir} dense />;
  const { t, id } = x;
  /* Les cartes capteur ouvrent la fiche 24 h au clic — elles n'ont aucun
   * contrôle interne à protéger. Chacune est elle-même le bouton, nommée de ce
   * qu'elle affiche (lot 13 de l'audit du 03/10) : l'enveloppe d'ici
   * s'appelait « Ouvrir sensor.co2_sejour », l'identifiant épelé. */
  const ouvreCapteur = String(id).split('.')[0] === 'sensor' ? dc.ouvrir : null;
  if (t === 'compacte') return <CvCard id={id} hass={hass} onOpen={dc.ouvrir} dense />;
  // La STANDARD : la carte riche des vues intégrées quand le domaine en a une
  // (volet à curseur, lumière au lavis, thermostat à consigne…) — la carte
  // générique pleine pour le reste (machines, prises…).
  if (t === 'riche') return dc.card(id);
  if (t === 'horloge') return <CvClock />;
  if (t === 'presence') return <CvPresence hass={hass} />;
  if (t === 'activite') return <CvActivite hass={hass} />;
  if (t === 'ouvrants') return <CvOuvrants hass={hass} />;
  if (t === 'energiemaison') return <CvEnergie hass={hass} />;
  if (t === 'air') return <CvAir hass={hass} />;
  if (t === 'chiffre') return <CvBigSensor id={id} hass={hass} onOpen={ouvreCapteur} />;
  if (t === 'jauge') return <CvGauge id={id} hass={hass} onOpen={ouvreCapteur} />;
  if (t === 'graph') return <CvHistory id={id} hass={hass} onOpen={ouvreCapteur} />;
  // Sur une vanne, la carte de la vanne : le gros interrupteur la rouvrait d'un appui (passe bis de l'étape 3 IoT, point 9).
  if (t === 'gros' && !estVanneCarte(id)) return <CvBigToggle id={id} hass={hass} />;
  if (t === 'personne') return <CvPerson id={id} hass={hass} />;
  if (t === 'meteo') return <CvWeather id={id} hass={hass} />;
  if (t === 'agenda') return <CvAgenda id={id} hass={hass} />;
  if (t === 'alarme') return <CvAlarm id={id} hass={hass} />;
  if (t === 'alarmeseule') return <CvAlarm id={id} hass={hass} sans />;
  if (t === 'camera') return <CvCamera id={id} hass={hass} />;
  if (t === 'calendrier') return <CvCalendrier id={id} hass={hass} onOpen={dc ? dc.ouvrir : null} />;
  if (t === 'localisation') return <CvCarte hass={hass} />;
  if (t === 'chip') return <CvChip id={id} hass={hass} dc={dc} />;
  if (t === 'chips') return <CvChips x={x} hass={hass} dc={dc} />;
  if (t === 'journal') return <CvJournal id={id} hass={hass} />;
  return <CvCard id={id} hass={hass} onOpen={dc.ouvrir} />;
}

/* ── Bibliothèque de cartes ──────────────────────────────────────────────────
 * Catalogue de TOUTES les cartes de Loggia sur données FICTIVES : on y voit
 * chaque famille même sans posséder les entités. Sert de banc d'essai pour
 * itérer sur le design. Le hass est un faux local — aucun appel ne part. */
const BIBLIO_ART = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2096%2096%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%234c1d95%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%230ea5e9%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%2296%22%20height%3D%2296%22%20fill%3D%22url(%23g)%22%2F%3E%3Ccircle%20cx%3D%2248%22%20cy%3D%2248%22%20r%3D%2226%22%20fill%3D%22%23111827%22%2F%3E%3Ccircle%20cx%3D%2248%22%20cy%3D%2248%22%20r%3D%225%22%20fill%3D%22%23f4f4f5%22%2F%3E%3C%2Fsvg%3E';
/* Les noms de la maison fictive passent par `tr()` (relecture du 03/10) : la
 * Bibliothèque s'ouvre sur une vraie installation, pour tout le monde, et une
 * page anglaise y lisait « Lampe salon », « Thermostat séjour », « Volet
 * chambre ». Comme ceux de la démo (`etiquette`, demo.js), ces noms sont les
 * NÔTRES, pas ceux qu'une maison a tapés ; les prénoms restent tels quels.
 * Appelée au montage (`useState`), la fonction trouve le catalogue chargé.
 * Trois noms rejoignent une clé qui existait : « Alarme maison » y était un
 * geste de scénario (« Alarm home »), l'alarme s'appelle donc « Alarme »
 * comme dans la démo ; « Import réseau » devient « Achat réseau » (« Grid
 * import ») ; « Porte d’entrée » prend l'apostrophe courbe de sa clé.
 * tests/biblio_langue.test.mjs refuse un nom écrit en clair. */
function biblioStates() {
  const il_y_a = (min) => new Date(Date.now() - min * 60000).toISOString();
  const s = (state, attributes) => ({ state: String(state), attributes: attributes || {}, last_changed: il_y_a(12), last_updated: il_y_a(12) });
  return {
    'light.biblio_rgb': s('on', { friendly_name: tr('Lampe salon'), brightness: 178, rgb_color: [255, 170, 60], supported_color_modes: ['rgb', 'color_temp'] }),
    'light.biblio_simple': s('on', { friendly_name: tr('Plafonnier couloir'), supported_color_modes: ['onoff'] }),
    'switch.biblio_prise': s('on', { friendly_name: tr('Prise cafetière') }),
    'climate.biblio': s('heat', { friendly_name: tr('Thermostat séjour'), current_temperature: 20.6, temperature: 21.5, hvac_action: 'heating', hvac_modes: ['off', 'heat', 'cool', 'auto'], preset_modes: ['eco', 'comfort', 'away'], preset_mode: 'comfort', min_temp: 7, max_temp: 30, target_temp_step: .5 }),
    // Un VOLET (sa classe, V3) : la carte des volets ; le garage garde l'ancienne carte — sans position, ni glissière ni pourcentage (19/10).
    'cover.biblio': s('open', { friendly_name: tr('Volet chambre'), current_position: 65, supported_features: 15, device_class: 'shutter' }),
    'cover.biblio_garage': s('closed', { friendly_name: tr('Garage'), supported_features: 11, device_class: 'garage' }),
    'media_player.biblio': s('playing', { friendly_name: tr('Enceinte bureau'), media_title: 'Clair de Lune', media_artist: 'Debussy', media_album_name: 'Suite bergamasque', volume_level: .4, supported_features: 20925, entity_picture: BIBLIO_ART }),
    'vacuum.biblio': s('docked', { friendly_name: tr('Aspirateur'), battery_level: 87, supported_features: 4 | 8 | 16 | 512 | 8192, fan_speed: 'standard', fan_speed_list: ['quiet', 'standard', 'turbo'] }),
    'lawn_mower.biblio': s('docked', { friendly_name: tr('Tondeuse'), battery_level: 64, supported_features: 1 | 2 | 4 }),
    'sensor.biblio_temp': s(21.4, { friendly_name: tr('Température séjour'), unit_of_measurement: '°C', device_class: 'temperature' }),
    'sensor.biblio_co2': s(640, { friendly_name: tr('CO₂ séjour'), unit_of_measurement: 'ppm', device_class: 'carbon_dioxide' }),
    'sensor.biblio_puissance': s(1840, { friendly_name: tr('Production solaire'), unit_of_measurement: 'W', device_class: 'power', min: 0, max: 3000 }),
    'person.biblio': s('home', { friendly_name: 'Camille' }),
    'alarm_control_panel.biblio': s('disarmed', { friendly_name: tr('Alarme') }),
    'lock.biblio': s('locked', { friendly_name: tr('Serrure entrée') }),
    'valve.biblio': s('open', { friendly_name: tr('Vanne arrosage') }),
    'scene.biblio': s(il_y_a(95), { friendly_name: tr('Scène cinéma') }),
    'binary_sensor.biblio_porte': s('off', { friendly_name: tr('Porte d’entrée'), device_class: 'door' }),
    // Agrégats : de quoi nourrir Présence, Ouvrants, Qualité d'air, Énergie.
    'person.biblio_2': s('not_home', { friendly_name: 'Alex' }),
    'binary_sensor.biblio_fenetre': s('off', { friendly_name: tr('Fenêtre chambre'), device_class: 'window' }),
    'binary_sensor.biblio_garage': s('on', { friendly_name: tr('Garage'), device_class: 'garage_door' }),
    'sensor.biblio_voc': s(78, { friendly_name: tr('COV bureau'), unit_of_measurement: 'ppb', device_class: 'volatile_organic_compounds' }),
    'sensor.biblio_pm25': s(6, { friendly_name: tr('PM2.5 bureau'), unit_of_measurement: 'µg/m³', device_class: 'pm25' }),
    'sensor.biblio_hum': s(47, { friendly_name: tr('Humidité séjour'), unit_of_measurement: '%', device_class: 'humidity' }),
    'sensor.biblio_solaire': s(486, { friendly_name: tr('Production solaire'), unit_of_measurement: 'W', device_class: 'power' }),
    'sensor.biblio_reseau': s(298, { friendly_name: tr('Achat réseau'), unit_of_measurement: 'W', device_class: 'power' }),
    'sensor.biblio_conso_jour': s(7.4, { friendly_name: tr('Conso du jour'), unit_of_measurement: 'kWh', device_class: 'energy' }),
    'camera.biblio_entree': s('idle', { friendly_name: tr('Caméra entrée') }),
    'camera.biblio_jardin': s('idle', { friendly_name: tr('Caméra jardin') }),
    'binary_sensor.biblio_mouvement': s('on', { friendly_name: tr('Mouvement couloir'), device_class: 'motion' }),
    'calendar.biblio': s('off', { friendly_name: tr('Maison') }),
    'zone.home': s('1', { friendly_name: tr('Maison'), latitude: 46.98, longitude: 1.92, radius: 100 }),
    'person.biblio_3': s('not_home', { friendly_name: 'Marie', latitude: 47.06, longitude: 2.05 }),
    /* Une maisonnee de neuf, pour voir la grille et son « +n » (ADR 0088).
     * Presents et absents meles : c'est l'avatar estompe qui doit se lire. */
    'person.biblio_4': s('home', { friendly_name: 'Sam' }),
    'person.biblio_5': s('not_home', { friendly_name: 'Noa' }),
    'person.biblio_6': s('home', { friendly_name: 'Lou' }),
    'person.biblio_7': s('not_home', { friendly_name: 'Éli' }),
    'person.biblio_8': s('home', { friendly_name: 'Maé' }),
    'person.biblio_9': s('not_home', { friendly_name: 'Zoé' }),
    'person.biblio_10': s('home', { friendly_name: 'Tom' }),
    'person.biblio_11': s('not_home', { friendly_name: 'Ana' }),
    'sensor.biblio_energie_hist': s(7.4, { friendly_name: tr('Énergie maison'), unit_of_measurement: 'kWh', device_class: 'energy' }),
    // Arrivees le 20/09, pour les familles que la bibliotheque ne montrait pas
    // encore : la sirene (retour du 16/09), la meteo (le ciel se fond dans le
    // theme depuis l'ADR 0059) et le soleil, qui dit s'il fait nuit.
    'siren.biblio': s('off', { friendly_name: tr('Sirène intérieure') }),
    'weather.biblio': s('partlycloudy', { friendly_name: tr('Maison'), temperature: 18.2, humidity: 62, temperature_unit: '°C' }),
    // Sans nom (relecture du 03/10) : `sun.sun` ne sert qu'à dire s'il fait
    // nuit, rien ne l'affiche, et « Soleil » est au catalogue un temps qu'il
    // fait (« Sunny »).
    'sun.sun': s('above_horizon'),
  };
}

/* ── LES BRIQUES DE L'ÉDITION, partagées par toutes les grilles ─────────────
 * Vues personnalisées et Favoris posent les mêmes cartes, avec les mêmes
 * gestes : elles doivent donc parler la même langue. Ces helpers vivaient
 * dans CustomView, où les Favoris ne pouvaient pas les atteindre. */

/* Largeur d'une carte : 1 (défaut) ou 2 emplacements côte à côte. Portée par
 * l'entrée typée (`w: 2`) ; une chaîne nue élargie devient sa forme typée. */
const cvW = (x) => (x && typeof x === 'object' && x.w === 2) ? 2 : 1;
/* DEUX tailles, pas trois : compacte (1 rangée de 88 px) ou standard (2).
 * Toute carte non compacte DOIT tenir dans la standard — le graphique, le
 * journal et les machines se compriment plutôt que de déborder. */
const CV_ROWS = { compacte: 1, horloge: 1, personne: 2, riche: 2, gros: 2, jauge: 2, chiffre: 2, meteo: 2, alarme: 2, tpl: 2, graph: 2, agenda: 2, journal: 2, presence: 2, ouvrants: 2, energiemaison: 2, air: 2, alarmeseule: 2, activite: 2, camera: 2, calendrier: 2, localisation: 2, chips: 1, chip: 1 };
const cvRowsDe = (x) => {
  if (typeof x === 'string') return 1;
  /* Un choix EXPLICITE l'emporte (06/10) : ailleurs dans Loggia, le bouton de
   * coin d'une carte bascule sa taille, et les vues perso ne le permettaient
   * pas — la hauteur y découlait du seul type de carte. « je veux comme pour
   * les autres vue […] les boutons pour la rendre compact ou grande ». */
  if (x.h === 1 || x.h === 2) return x.h;
  const d = String(x.id || '').split('.')[0];
  if (x.t === 'riche') {
    if (['climate', 'cover', 'media_player', 'valve', 'light', 'vacuum', 'lawn_mower'].indexOf(d) >= 0) return 2;
    return 1;
  }
  return CV_ROWS[x.t] || 2;
};
/* Bascule de largeur : une chaîne nue élargie se promeut en forme typée. */
const cvAvecW = (x) => (typeof x === 'string'
  ? { t: 'compacte', id: x, w: 2 }
  : (x.w === 2 ? (({ w, ...reste }) => reste)(x) : { ...x, w: 2 }));
/* Bascule de TAILLE, sur le même patron : compacte (1 rangée de 88 px) ou
 * standard (2). Revenir à la taille du type efface la clé plutôt que d'écrire
 * la valeur par défaut — une carte qui change de dessin retrouve alors la
 * sienne. */
const cvAvecH = (x) => {
  const sauf = (o) => (({ h, ...reste }) => reste)(o);
  if (typeof x === 'string') return { t: 'compacte', id: x, h: 2 };
  const vise = cvRowsDe(x) === 1 ? 2 : 1;
  const nu = sauf(x);
  return cvRowsDe(nu) === vise ? nu : { ...nu, h: vise };
};
/* Même entité, autre dessin : la largeur choisie survit au changement. */
const cvRetype = (x, t) => {
  const id = typeof x === 'string' ? x : x.id;
  const large = cvW(x) === 2;
  if (t === 'compacte' && !large) return id;
  return { t, id, ...(large ? { w: 2 } : {}) };
};
/* Le type d'une entrée posée, pour cocher le bon dessin dans la feuille. */
const cvTypeDe = (x) => (typeof x === 'string' ? 'compacte' : (x.t || 'compacte'));

const EDIT_BTN = { width: 26, height: 26, borderRadius: 10, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--o-s1)', color: 'var(--o-text1)', fontSize: 12, fontWeight: 800, padding: 0 };

/* Les domaines qu'une carte accepte — l'inverse de `cvTypesPour`, pour la
 * galerie : une carte choisie d'abord ne doit proposer que les entités
 * qu'elle sait dessiner. `null` = toutes. */
const CV_DOMAINES = {
  graph: ['sensor'], chiffre: ['sensor', 'binary_sensor'], personne: ['person'], meteo: ['weather'],
  agenda: ['calendar'], calendrier: ['calendar'], alarme: ['alarm_control_panel'], alarmeseule: ['alarm_control_panel'], camera: ['camera'],
};
/* La galerie : toutes les cartes de la maison, dans l'ordre où on les cherche.
 * `ex` est l'entité FICTIVE qui sert d'aperçu (états de la bibliothèque). */
const CV_GALERIE = () => [
  { t: 'compacte', lbl: tr('Compacte'), ex: 'light.biblio_rgb' },
  { t: 'riche', lbl: tr('Standard'), ex: 'light.biblio_rgb' },
  { t: 'graph', lbl: tr('Graphique 24 h'), ex: 'sensor.biblio_temp' },
  { t: 'chiffre', lbl: tr('Grand chiffre'), ex: 'sensor.biblio_co2' },
  { t: 'journal', lbl: tr('Journal'), ex: 'light.biblio_rgb' },
  { t: 'personne', lbl: tr('Présence'), ex: 'person.biblio' },
  { t: 'camera', lbl: tr('Caméra'), ex: 'camera.biblio_entree' },
  { t: 'alarme', lbl: tr('Alarme'), ex: 'alarm_control_panel.biblio' },
  { t: 'alarmeseule', lbl: tr('Alarme (seule)'), ex: 'alarm_control_panel.biblio' },
  { t: 'calendrier', lbl: tr('Calendrier'), ex: 'calendar.biblio' },
  { t: 'agenda', lbl: tr('Agenda'), ex: 'calendar.biblio' },
  { t: 'meteo', lbl: tr('Météo'), ex: null },
  { t: 'horloge', lbl: tr('Horloge'), ex: null, seule: true },
  { t: 'presence', lbl: tr('Présence maison'), ex: null, seule: true },
  { t: 'ouvrants', lbl: tr('Ouvrants'), ex: null, seule: true },
  { t: 'energiemaison', lbl: tr('Énergie maison'), ex: null, seule: true },
  { t: 'air', lbl: tr('Qualité air'), ex: null, seule: true },
  { t: 'activite', lbl: tr('Activité récente'), ex: null, seule: true },
  { t: 'localisation', lbl: tr('Localisation'), ex: null, seule: true },
  { t: 'chip', lbl: tr('Chip'), ex: 'light.biblio_rgb' },
  /* CHIPS (groupe) revient dans la galerie le 20/09 : la carte se rendait
   * toujours, ses outils d'édition étaient branchés (crayon → « Composer les
   * pastilles »), mais plus rien ne permettait de la POSER — on ne pouvait
   * l'obtenir que par un agencement hérité. */
  { t: 'chips', lbl: tr('Chips (groupe)'), ex: null, seule: true },
];

/* Un APERÇU de carte, au vrai gabarit (88 ou 184) et inerte : on regarde,
 * on ne pilote pas. Les vignettes de la galerie tournent sur les états
 * fictifs de la bibliothèque, celles d'une entité choisie sur ses vraies
 * données — ce qu'on voit est ce qu'on posera.
 *
 * Choisi, l'aperçu n'est PAS une puce (lot 15 de l’audit du 03/10) : le
 * bleu plein recouvrirait la carte qu'il montre. Il garde un cadre teinté,
 * un filet d'accent et `aria-pressed`. */
function CarteApercu({ x, hass, dc, lbl, actif = false, onClick }) {
  const h = cvRowsDe(x) === 1 ? 88 : 184;
  return (
    <div className="o-apercu" style={{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'center', width: '100%', textAlign: 'left', padding: 8, borderRadius: 14, cursor: 'pointer', background: actif ? 'rgba(var(--o-accent-rgb),.14)' : 'var(--o-s2)', border: '1px solid ' + (actif ? 'var(--o-accent-fond)' : 'var(--o-bd2)') }}>
      <span style={{ display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: actif ? 'var(--o-accent-soft)' : 'var(--o-text3)', margin: '0 2px 7px' }}>{lbl}</span>
      {/* L'aperçu est INERTE aussi au clavier et au lecteur d'écran (lot 13 de
        * l'audit du 03/10) : ses interrupteurs, curseurs et cartes-boutons se
        * tabulaient DANS ce bouton, et leurs noms s'ajoutaient au sien. Le
        * nom du choix est son libellé. `inert` en chaîne vide, comme le menu
        * latéral : React 18 ne le connaît pas comme booléen.
        *
        * Et le choix n'ENGLOBE plus l'aperçu (relecture du lot 13, 04/10) :
        * `ouvrir: null` n'y suffisait pas. La carte riche (`dc.card`) ferme
        * sur son propre `ouvrir` et pose sa surface ; la chip, la caméra
        * (« Agrandir »), l'alarme (ses modes), le volet, le thermostat ou le
        * lecteur gardent leurs boutons — autant de <button> dans ce <button>,
        * du HTML invalide que React signalait. Le geste passe par une
        * `Surface` SŒUR, posée AVANT l'aperçu : une feuille donne son premier
        * focus à son premier bouton, et un bouton inerte le refuse. Elle prend
        * aussi le filet de 1 px (`inset: -1`), comme le bouton d'avant ;
        * l'aperçu inerte laisse passer le clic jusqu'à elle. La racine centre
        * sa colonne, comme le bouton : un aperçu de 88 px qu'un voisin de 184
        * étire reste au milieu. `ouvrir: null` reste : une carte qui l'honore
        * n'y pose pas une surface de plus. */}
      <Surface popup={false} onClick={onClick} label={lbl} aria-pressed={actif} style={{ inset: -1 }} />
      <span className="o-cvfit" inert="" style={{ display: 'block', height: h, pointerEvents: 'none', overflow: 'hidden', borderRadius: 'var(--o-radius,18px)' }}>
        <CvTyped x={x} hass={hass} dc={{ ...dc, ouvrir: null }} />
      </span>
    </div>
  );
}

/* L'éditeur d'une carte CHIPS : on compose la rangée, pastille par pastille.
 * Sans aucune entité, la carte résume la maison toute seule — c'est son état
 * de départ, et le vider y revient. */

function ChipsEditSheet({ x, hass, onClose, onSave }) {
  const S = (hass && hass.states) || {};
  const [ids, setIds] = useState(Array.isArray(x.ids) ? x.ids : []);
  const poser = (l) => { setIds(l); onSave({ ...x, ids: l.length ? l : undefined }); };
  const bouger = (i, d) => { const l = ids.slice(); const j = i + d; if (j < 0 || j >= l.length) return; const t = l[i]; l[i] = l[j]; l[j] = t; poser(l); };
  return (
    <BottomSheet onClose={onClose}>
      {() => (<>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <NomFeuille><span style={{ flex: 1, minWidth: 0, fontSize: 19, fontWeight: 700 }}>{tr('Composer les pastilles')}</span></NomFeuille>
          <CroixFeuille />
        </div>
        {ids.length === 0
          ? <div style={{ padding: '12px 14px', borderRadius: 14, background: 'var(--o-s2)', fontSize: 12, fontWeight: 600, color: 'var(--o-text3)', marginBottom: 14 }}>{tr('Choisissez les pastilles de la rangée : sans elles, la carte reste vide.')}</div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              {ids.map((id, i) => (
                <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, background: 'var(--o-s2)' }}>
                  <Fi i={cvIcoEntite(String(id).split('.')[0], id, S[id], cvName(S[id], id)) || 'bolt'} size={13} color="var(--o-text2)" />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cvName(S[id], id)}</span>
                  <button onClick={() => bouger(i, -1)} aria-label={tr('Monter')} style={{ ...EDIT_BTN, opacity: i === 0 ? .35 : 1 }}><Fi i="angle-up" size={11} /></button>
                  <button onClick={() => bouger(i, 1)} aria-label={tr('Descendre')} style={{ ...EDIT_BTN, opacity: i === ids.length - 1 ? .35 : 1 }}><Fi i="angle-down" size={11} /></button>
                  <button onClick={() => poser(ids.filter(y => y !== id))} aria-label={tr('Retirer')} style={{ ...EDIT_BTN, background: 'var(--o-bad)', color: '#fff' }}>×</button>
                </div>
              ))}
            </div>}
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text3)', letterSpacing: '.04em', marginBottom: 8 }}>{tr('AJOUTER UNE PASTILLE')}</div>
        <EntPicker hass={hass} exclude={ids} onPick={(id) => poser([...ids, id])} autoFocus />
      </>)}
    </BottomSheet>
  );
}

/* La feuille d'AJOUT, commune aux vues personnalisées et aux Favoris.
 * Deux entrées comme Home Assistant : « Par entité » (on choisit l'appareil,
 * puis on VOIT les cartes qu'il accepte) et « Par carte » (la bibliothèque :
 * on choisit un dessin, puis l'entité qui ira dedans). Elle sert aussi à
 * CHANGER une carte posée : on lui passe l'entrée à remplacer. */
function CarteAjoutSheet({ hass, onClose, onPose, remplace = null }) {
  const [onglet, setOnglet] = useState('entite');
  const [pick, setPick] = useState(remplace ? (typeof remplace === 'string' ? remplace : remplace.id) : null);
  // Carte choisie AVANT son entité (galerie) : on attend alors l'entité.
  const [carteAttente, setCarteAttente] = useState(null);
  const dc = useDomainCards(hass);
  // Maison fictive de la bibliothèque : les vignettes de la galerie vivent
  // dessus, sans toucher à la vraie installation.
  const [Sb] = useState(biblioStates);
  const hb = useMemo(() => ({ states: Sb, connected: true, callService: () => {}, callApi: () => Promise.resolve([]), callWS: () => Promise.resolve(null) }), [Sb]);
  const dcb = useDomainCards(hb);
  const tab = (id, lbl) => (
    <button onClick={() => { setOnglet(id); setPick(null); setCarteAttente(null); }} style={{ flex: 1, padding: '10px 8px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 800, background: onglet === id ? 'var(--o-accent-fond)' : 'transparent', color: onglet === id ? '#fff' : 'var(--o-text2)' }}>{lbl}</button>
  );
  const grille = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: 10 };
  return (
    <BottomSheet onClose={onClose} onglets>
      {close => (<>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <NomFeuille><span style={{ flex: 1, minWidth: 0, fontSize: 19, fontWeight: 700 }}>{remplace ? tr('Changer la carte') : tr('Ajouter une carte')}</span></NomFeuille>
          <CroixFeuille />
        </div>
        {carteAttente ? (<>
          {/* Carte choisie dans la galerie : reste à dire QUELLE entité. */}
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{tr('Quelle entité pour cette carte ?')}</div>
          <EntPicker hass={hass} exclude={[]} domaines={CV_DOMAINES[carteAttente] || null} autoFocus
            onPick={(id) => { onPose(carteAttente === 'compacte' ? id : { t: carteAttente, id }); close(); }} />
          <button onClick={() => setCarteAttente(null)} style={{ marginTop: 12, padding: '8px 14px', borderRadius: 10, border: 'var(--o-bw,1px) solid var(--o-bd2)', background: 'var(--o-s1)', color: 'var(--o-text2)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>{tr('Annuler')}</button>
        </>) : pick ? (() => {
          /* Entité choisie : on MONTRE les cartes qu'elle accepte, au vrai
           * gabarit et avec ses vraies valeurs. */
          const st = hass && hass.states ? hass.states[pick] : null;
          const actuel = remplace ? cvTypeDe(remplace) : null;
          return (
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{tr('Quelle carte pour {nom} ?', { nom: cvName(st, pick) })}</div>
              <div style={grille}>
                {cvTypesPour(pick).map(t => (
                  <CarteApercu key={t} lbl={CV_TYPE_NOMS()[t]} hass={hass} dc={dc} actif={actuel ? t === actuel : false}
                    x={t === 'compacte' ? pick : { t, id: pick }}
                    onClick={() => { onPose(remplace ? cvRetype(remplace, t) : (t === 'compacte' ? pick : { t, id: pick })); close(); }} />
                ))}
              </div>
              {!remplace && <button onClick={() => setPick(null)} style={{ marginTop: 12, padding: '8px 14px', borderRadius: 10, border: 'var(--o-bw,1px) solid var(--o-bd2)', background: 'var(--o-s1)', color: 'var(--o-text2)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>{tr('Annuler')}</button>}
            </div>
          );
        })() : (<>
          {!remplace && <div style={{ display: 'flex', gap: 6, padding: 4, borderRadius: 14, background: 'var(--o-s2)', marginBottom: 14 }}>{tab('entite', tr('Par entité'))}{tab('carte', tr('Par carte'))}</div>}
          {onglet === 'entite' ? (<>
            <EntPicker hass={hass} exclude={[]} onPick={(id) => setPick(id)} autoFocus />
            <div style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600, marginTop: 10 }}>{tr('Choisissez une entité : les cartes qu’elle accepte s’affichent ensuite.')}</div>
          </>) : (<>
            {/* La bibliothèque : chaque carte se voit avant d'être posée. */}
            <div style={grille}>
              {CV_GALERIE().filter(c => c.seule || c.ex).map(c => (
                <CarteApercu key={c.t} lbl={c.lbl} hass={hb} dc={dcb}
                  x={c.seule ? { t: c.t, id: c.t + ':apercu' } : (c.t === 'compacte' ? c.ex : { t: c.t, id: c.ex })}
                  onClick={() => { if (c.seule) { onPose({ t: c.t, id: c.t + ':' + Date.now() }); close(); } else setCarteAttente(c.t); }} />
              ))}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text3)', letterSpacing: '.04em', margin: '18px 0 8px' }}>{tr('OU UNE CARTE TEMPLATE')}</div>
            <TplForm hass={hass} onAdd={(t) => { onPose(t); close(); }} />
          </>)}
        </>)}
      </>)}
    </BottomSheet>
  );
}

/* Le nom LU d'une carte de vue personnalisée, et d'un favori de l'Accueil
 * qui en a le format. C'était le `nomCarte` local de CustomView (son
 * histoire y reste) ; sorti tel quel en fonction de module à la relecture du
 * lot 13 de l'audit du 03/10, pour que la barre d'outils des favoris nomme
 * aussi la carte qu'elle touche — sans une copie qui divergerait. */
function nomCv(x, hass) {
  if (cvEstTpl(x)) return x.name || tr('Carte template');
  const id = cvId(x) || cvKey(x);
  const type = CV_TYPE_NOMS()[cvTypeDe(x)];
  if (String(id).indexOf('.') < 0) return type || id;
  const nom = cvName(hass && hass.states && hass.states[id], id);
  return cvTypeDe(x) === 'compacte' || !type ? nom : nom + ', ' + type;
}

/* La FICHE d'une carte posée (06/10), partagée par les vues personnalisées et
 * les favoris de l'Accueil. Elle reprend celle des vues de la maison, avec ce
 * qui a du sens ici : le dessin, la taille, la largeur, le retrait.
 *
 * Partagée et non recopiée : deux mécaniques pour un même geste finissent par
 * diverger — c'est exactement ce qu'on vient de corriger en donnant la tuile
 * des vues de la maison aux vues personnalisées. */
function FicheCarte({ x, nom, sous, onTaille, onLargeur, onChanger, onRetirer, onClose }) {
  const compacte = cvRowsDe(x) === 1;
  return (
    <BottomSheet onClose={onClose}>
      {close => (<>
        <TitreFeuille style={{ fontSize: 19, fontWeight: 700 }} marge={4}>{nom}</TitreFeuille>
        {sous && <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--o-text2)', marginBottom: 14 }}>{sous}</div>}

        <FicheRangee premiere titre={tr('Carte compacte')} desc={tr('Une rangée au lieu de deux : icône, nom, état et le contrôle.')}
          droite={<RmBascule on={compacte} nom={tr('Carte compacte')} onToggle={() => onTaille(x)} couleur="var(--o-accent)" />} />

        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', color: 'var(--o-text1)', opacity: .78, margin: '18px 0 8px' }}>{tr('LARGEUR')}</div>
        <Segment grandir value={cvW(x) === 2} onChange={() => onLargeur(x)} label={tr('Largeur')}
          options={[{ id: false, label: tr('Simple') }, { id: true, label: tr('Double') }]} />
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)', margin: '6px 2px 0' }}>{tr('Double : la carte prend deux emplacements côte à côte.')}</div>

        <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
          <button onClick={() => { close(); onChanger(x); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '11px 14px', borderRadius: 14, cursor: 'pointer', fontSize: 13, fontWeight: 700, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text1)' }}>
            <Fi i="pencil" size={12} />{cvTypeDe(x) === 'chips' ? tr('Composer les pastilles') : tr('Changer la carte')}</button>
          <button onClick={() => { onRetirer(x); close(); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '11px 14px', borderRadius: 14, cursor: 'pointer', fontSize: 13, fontWeight: 700, background: 'rgba(var(--o-bad-rgb),.12)', border: '1px solid rgba(var(--o-bad-rgb),.45)', color: 'var(--o-bad)' }}>
            <Fi i="cross-small" size={12} />{tr('Supprimer')}</button>
        </div>
        <CroixFeuille />
      </>)}
    </BottomSheet>
  );
}
// Configurable (Paramètres → Entités) : {name, haid} → la photo vient de
// la personne Home Assistant correspondante.
// Personnes suivies : choix de l'utilisateur, sinon celles que Home Assistant
// déclare (domaine `person`), sinon la liste d'origine. Évalué à l'appel et non
// au chargement du module — la découverte répond plus tard.
// Source UNIQUE des personnes suivies. Deux clés les décrivaient — héritées de
// deux constantes qui divergeaient déjà — d'où quatre avatars pour trois
// personnes. Ici : le choix de l'utilisateur, sinon la découverte, et rien
// d'autre. Les entités disparues sont écartées.
function peopleList() {
  const S = (getHass() || {}).states || null;
  const raw = cfgVal('loggia_people', null);
  const r = LOGGIA_RESOLVED && LOGGIA_RESOLVED.people;
  const list = (Array.isArray(raw) && raw.length) ? raw.filter(p => p && typeof p.haid === 'string' && p.haid && (!S || S[p.haid]))
    : (r && r.available && r.list.length) ? r.list
      : [];
  return list.map(p => ({
    name: p.name || p.haid.replace('person.', ''),
    haid: p.haid,
    // La photo du profil Home Assistant d'abord : c'est celle que l'utilisateur
    // a choisie, et elle n'a pas à être recopiée dans le dashboard.
    img: personPicture(S, p.haid) || null,
  }));
}
/* Le CO₂ de la bannière et du badge d'une pièce : LA table (confort.js, `zoneMesure('co2')` ; audit du 19/10, M16). Trois paliers
 * à part (`airPalier`) contredisaient ses cinq, et « QUALITÉ AIR · ÉLEVÉ » se lisait « bonne qualité ». Le mot de la zone, sa
 * couleur hors du bon ; discret dans le bon. Jugé sur le chiffre écrit, arrondi à l'unité (G1-D5, ADR 0300) : 1 149,6 ppm s'écrit
 * « 1 150 » et se dit « Moyen », comme sur la jauge. */
const zoneCo2 = (co2) => (co2 == null ? null : zoneMesure('co2', arrondiMesure('co2', co2)));
const motCo2 = (co2) => { const z = zoneCo2(co2); return z ? z.t.toLocaleUpperCase(locale()) : ''; };

export { CvCamera, ChoixCamDispo, CV_TYPE_NOMS, CvClock, CvBigSensor, CvBigToggle, CvPerson, CvWeather, chipTexte, CvChip, CvChips, CvActivite, CvHistory, bannerKeys, CvAir, CvPresence, CvOuvrants, CvEnergie, CvCalendrier, CvCarte, CvTyped, biblioStates, cvW, cvRowsDe, cvAvecW, cvAvecH, cvTypeDe, EDIT_BTN, ChipsEditSheet, CarteAjoutSheet, nomCv, FicheCarte, peopleList, zoneCo2, motCo2 };
