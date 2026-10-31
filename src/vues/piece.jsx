/* La vue d’une pièce, sa navigation, ses fiches de confort et du dehors.
 * Sorti d’App.jsx tel quel (lot 5 de l’audit du 28/10, ADR 0283) : seuls les imports sont neufs. */
import { Suspense, useState, useEffect, useRef, cloneElement, useMemo } from 'react';
import { lazyRecharge } from '../recharge.js';
import { LOGGIA_INDEX, normRooms, cfgVal, ctxLumieres } from '../state.js';
import { uniteTemp, uniteVent, versCelsius, versKmh, signeTemp } from '../unites.js';
import { PAINT_READY, BottomSheet, Fi, NomFeuille, CroixFeuille, REDUCE_MOTION, Anim, editBtn } from '../ui.jsx';
import { weatherEntity, WeatherIco } from '../wxutil.jsx';
import { BarreConfort } from '../barreconfort.jsx';
import { lumieresDe } from '../lumieres.js';
import { indiceConfort } from '../confort.js';
import { tr, trN } from '../i18n.js';
import { hx, rmNorm, dec, nomDeCle, climateZones } from '../app/noyau.jsx';
import { useDomainCards } from '../appareils/fiches.jsx';
import { roomEntitiesBrutes } from '../app/decouverte.jsx';
import { useLayoutEditor, ROOM_LAYOUT_KEY, roomLabelOf } from '../edition/disposition.jsx';
import { habillagePiece, capteurBruitPiece } from '../app/pieces.jsx';
import { Header } from '../chrome/entete.jsx';
import { BandeauEdition, EditableCard, CarteAjout } from '../edition/briques.jsx';
import { ComposeurCartes, CardEditSheet } from '../edition/coquilles.jsx';

// La fiche de confort d'une PIÈCE (ADR 0039 ; chantier Capteurs, tâche 1) : chargée à la demande par `RoomComfortModal`.
const FicheConfortContent = lazyRecharge(() => import('../ficheconfort.jsx'));

// ════════════ POPUP CONFORT PIÈCE (temp / humidité / CO2 + barres dégradées + courbe 24h) ════════════
// La fiche vit dans ficheconfort.jsx, chargée à la demande (chantier Capteurs, plan 1, tâche 1) ; la courbe du
// jour reste ici : la fiche de l’Extérieur la dessine aussi.

// Sparkline 24h (SVG, auto-échelle, trait + aire). points = tableau de nombres.
function Sparkline({ points, color }) {
  if (!points || points.length < 2) return null;
  const W = 300, H = 46, pad = 3;
  const lo = Math.min(...points), hi = Math.max(...points), span = (hi - lo) || 1;
  const xs = points.map((_, i) => pad + i / (points.length - 1) * (W - 2 * pad));
  const ys = points.map(v => pad + (1 - (v - lo) / span) * (H - 2 * pad));
  const line = xs.map((x, i) => (i ? 'L' : 'M') + x.toFixed(1) + ' ' + ys[i].toFixed(1)).join(' ');
  const area = line + ' L' + xs[xs.length - 1].toFixed(1) + ' ' + H + ' L' + xs[0].toFixed(1) + ' ' + H + ' Z';
  return (
    /* Sans texte qui la dise, la courbe se tait : le chiffre et « 24 dernières heures » sont écrits à côté (audit du 19/10, lot 4). */
    <svg aria-hidden="true" focusable="false" viewBox={'0 0 ' + W + ' ' + H} preserveAspectRatio="none" style={{ width: '100%', height: 46, display: 'block' }}>
      <path className="o-fadein" style={{ animationDelay: '.5s', animationPlayState: PAINT_READY ? 'running' : 'paused' }} d={area} fill={color} opacity=".13" />
      <path className="o-draw" pathLength="1" style={{ animationPlayState: PAINT_READY ? 'running' : 'paused' }} d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* La fiche de confort d’une PIÈCE (ADR 0039) : chargée à la demande (`ficheconfort.jsx`, chantier Capteurs, plan 1,
 * tâche 1 : la borne du démarrage). Elle n’importe jamais App.jsx : la coquille lui passe la courbe du jour et la
 * teinte de ses pastilles. Comme `FicheMedia`, la coquille GARDE la feuille et pose la frontière Suspense DEDANS
 * (correction bis, point 3) : un morceau qui ne se charge pas se dit dans la feuille, par sa barrière — et non à la
 * place de la vue de la pièce. Le repli tient la hauteur d’une fiche (260 px). */
function RoomComfortModal({ piece, hass, onClose, bruitId = null }) {
  return (
    <BottomSheet onClose={onClose}>
      {() => (
        <Suspense fallback={<div style={{ minHeight: 260 }} />}>
          <FicheConfortContent piece={piece} hass={hass} bruitId={bruitId} briques={{ Sparkline, hx }} />
        </Suspense>
      )}
    </BottomSheet>
  );
}

// Conseils météo pour la tuile Extérieur (pas de "verdict à surveiller" — on ne contrôle pas le dehors).
// `temp` et `wind` arrivent déjà convertis en Celsius et km/h : les seuils ci-dessous
// comparent toujours le même repère, quelle que soit l'unité de l'installation.
// `windAffiche`/`uniteV` restent dans l'unité réelle, pour ne pas mentir au lecteur.
function outdoorTips(mode, temp, wind, isNight, rainProb, windAffiche, uniteV) {
  const T = [];
  if (mode === 'rain') T.push(['raindrops', 'var(--o-cyan)', tr('Pluie prévue, prenez un parapluie')]);
  else if (rainProb != null && rainProb >= 50) T.push(['raindrops', 'var(--o-cyan)', tr('Risque de pluie ({p} %), parapluie conseillé', { p: rainProb })]);
  if (mode === 'storm') T.push(['bolt', 'var(--o-purple)', tr('Orage, limitez les sorties')]);
  if (mode === 'snow') T.push(['snowflake', '#bcd6f0', tr('Neige, prudence sur la route')]);
  if (temp != null) {
    if (temp <= 2) T.push(['snowflake', 'var(--o-cold)', tr('Risque de gel, couvrez-vous bien')]);
    else if (temp < 10) T.push(['thermometer-half', '#38bdf8', tr('Frais dehors, prenez une veste')]);
    else if (temp >= 30) T.push(['humidity', 'var(--o-orange)', tr('Forte chaleur, pensez à vous hydrater')]);
    else if (temp >= 25) T.push(['sun', 'var(--o-lampe)', tr('Il fait chaud, vêtements légers conseillés')]);
  }
  if ((mode === 'sun' || mode === 'partly') && !isNight && temp != null && temp >= 22) T.push(['sun', 'var(--o-gold)', tr('Grand soleil, crème solaire et lunettes')]);
  if (wind != null && wind >= 30) T.push(['wind', '#9fb4d6', tr('Vent fort ({v} {u}), sois prudent', { v: Math.round(windAffiche != null ? windAffiche : wind), u: uniteV || 'km/h' })]);
  if (isNight) T.push(['moon-stars', '#aeb9e0', tr('Nuit tombée, pensez à l’éclairage extérieur')]);
  if (!T.length) T.push(['sun', 'var(--o-ok)', tr('Conditions agréables, profitez du dehors')]);
  return T;
}

function OutdoorModal({ piece, hass, mode, label, weatherTemp, sunset, onClose }) {
  const live = piece.live || null;
  const parseNum = (s) => { if (s == null) return null; const n = parseFloat(String(s).replace(',', '.')); return isNaN(n) ? null : n; };
  const temp = live && live.temp != null ? live.temp : (weatherTemp != null ? weatherTemp : parseNum(piece.temp));
  const hum = live && live.hum != null ? live.hum : parseNum(piece.hum);
  const wId = weatherEntity(hass);
  const wa = (wId && hass && hass.states && hass.states[wId] && hass.states[wId].attributes) || {};
  const wind = wa.wind_speed != null ? wa.wind_speed : null;
  // L'unité réelle de l'installation (°F, mph...) : jamais supposée en Celsius/km-h.
  const tUnite = uniteTemp(wa, hass);
  const vUnite = uniteVent(wa);
  // L'attribut weather.forecast n'existe plus (HA ≥2024.3) → prévision via le service get_forecasts.
  const [rainProb, setRainProb] = useState(null);
  useEffect(() => {
    let alive = true;
    // wId est null tant que la découverte n'a pas répondu : on rejoue l'appel
    // quand l'entité météo est connue, d'où sa présence dans les dépendances.
    if (!hass || !hass.callWS || !wId) return;
    hass.callWS({ type: 'call_service', domain: 'weather', service: 'get_forecasts', target: { entity_id: wId }, service_data: { type: 'hourly' }, return_response: true })
      .then(r => {
        if (!alive) return;
        const resp = r && (r.response || r); const ent = resp && resp[wId];
        const fc = ent && Array.isArray(ent.forecast) && ent.forecast.length ? ent.forecast[0] : null;
        if (fc && fc.precipitation_probability != null) setRainProb(Math.round(fc.precipitation_probability));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [piece.name, wId]);
  const isNight = mode === 'night';
  const tips = outdoorTips(mode, versCelsius(temp, tUnite), versKmh(wind, vUnite), isNight, rainProb, wind, vUnite);

  const [pts, setPts] = useState(null);
  const [hs, setHs] = useState('loading');
  useEffect(() => {
    let alive = true; const id = live && live.tempId;
    if (!hass || !hass.callApi || !id) { setHs('none'); return; }
    const start = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    hass.callApi('GET', 'history/period/' + start + '?filter_entity_id=' + encodeURIComponent(id) + '&minimal_response&no_attributes')
      .then(res => { if (!alive) return; const arr = (res && res[0]) ? res[0] : []; const p = arr.map(s => parseFloat(s.state)).filter(v => !isNaN(v)); if (p.length >= 2) { setPts(p); setHs('done'); } else setHs('none'); })
      .catch(() => { if (alive) setHs('error'); });
    return () => { alive = false; };
  }, [piece.name]);

  const chip = (ico, val) => val == null ? null : (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--o-s3)', border: 'var(--o-bw,1px) solid var(--o-bd3)', borderRadius: 14, padding: '9px 13px' }}>
      <Fi i={ico} size={15} color="var(--o-text2)" /><span style={{ fontSize: 13, fontWeight: 700, color: 'var(--o-text)' }}>{val}</span>
    </div>
  );
  const hd = { fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: 'var(--o-text3)' };

  return (
    <BottomSheet onClose={onClose}>
      {() => (<>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 38, height: 38, borderRadius: 14, background: piece.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{piece.icon}</span>
          <NomFeuille><span style={{ flex: 1, fontSize: 19, fontWeight: 700, color: 'var(--o-text)' }}>{tr('Extérieur')}</span></NomFeuille>
          <CroixFeuille />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '8px 0 2px' }}>
          <WeatherIco wx={mode || 'clouds'} size={64} />
          <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-.02em', marginTop: 4, color: 'var(--o-text)' }}>{temp != null ? Math.round(temp) : '—'}<span style={{ fontSize: 19, fontWeight: 600, opacity: .8 }}>°{tUnite}</span></div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--o-text2)' }}>{label || '—'}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', margin: '14px 0 4px' }}>
          {chip('humidity', hum != null ? Math.round(hum) + ' %' : null)}
          {chip('wind', wind != null ? Math.round(wind) + ' ' + vUnite : null)}
          {chip('sunset', sunset ? tr('Coucher') + ' ' + sunset : null)}
        </div>
        <div style={{ ...hd, margin: '18px 0 10px' }}>{tr('RECOMMANDATIONS')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tips.map((t, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--o-s3)', border: 'var(--o-bw,1px) solid var(--o-bd3)', borderRadius: 14, padding: '13px 15px' }}>
              <span style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: hx(t[1], .16), color: t[1] }}><Fi i={t[0]} size={16} /></span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--o-text)', lineHeight: 1.35 }}>{t[2]}</span>
            </div>
          ))}
        </div>
        {hs === 'done' && pts && (
          <div style={{ marginTop: 20 }}>
            <div style={{ ...hd, marginBottom: 8 }}>{tr('TEMPÉRATURE · 24 H')}</div>
            <Sparkline points={pts} color="var(--o-accent-soft)" />
          </div>
        )}
      </>)}
    </BottomSheet>
  );
}

// Barre de navigation entre pièces (maquette Claude Design 21/08) : icône, nom et
// température de chaque pièce ; la pièce courante est encadrée en accent.
function RoomNav({ room, onNav, hass }) {
  const wrapRef = useRef(null);
  const S = (hass && hass.states) || {};
  // Meme habillage que les cartes de l'accueil. Cette barre exigeait une
  // egalite EXACTE avec la table des pieces : « Chambre Lino » n'y figurant
  // pas, elle retombait sur une maison, la ou la carte montrait un lit. La
  // meme piece portait deux icones selon l'endroit.
  const zones = (LOGGIA_INDEX && LOGGIA_INDEX.areaList) || [];
  const list = normRooms(cfgVal('loggia_rooms', null)).map(r => {
    const st = r.haid && r.haid.temp ? S[r.haid.temp] : null;
    const v = st ? parseFloat(st.state) : NaN;
    // L'icone de la zone Home Assistant, retrouvee par le nom ou par le
    // capteur que la piece utilise deja — comme pour les cartes.
    const ix = LOGGIA_INDEX;
    const zone = zones.find(z => rmNorm(z.name) === rmNorm(r.room))
      || (ix && ix.areaOf && r.haid ? zones.find(z => z.id === [r.haid.temp, r.haid.humidity]
          .filter(Boolean).map(ix.areaOf).find(Boolean)) : null);
    const p = habillagePiece(r.room, zone && zone.icon);
    return { name: r.room, temp: isNaN(v) ? null : v, icon: p.icon, col: p.col };
  });
  useEffect(() => {
    const w = wrapRef.current; if (!w) return;
    const el = w.querySelector('[data-room-active="1"]');
    if (!el) return;
    /* Defiler la BARRE, jamais la page.
     *
     * `scrollIntoView` fait defiler TOUS les ancetres scrollables, y compris
     * le document — et `block: 'nearest'` n'y change rien des que l'element
     * sort du champ. Cette barre etant en haut de la vue, tout redeclenchement
     * de l'effet ramenait l'utilisateur en haut de page. Or il se redeclenche
     * a chaque changement de configuration, `rooms` etant reconstruit.
     *
     * On pose donc `scrollLeft` a la main : la barre bouge, la page reste.
     *
     * La position se mesure DANS la barre (audit du 03/10) : `offsetLeft`
     * partait du corps de la page, barre laterale comprise — sur ordinateur, la
     * puce choisie finissait coupee de 27 px a gauche, hors du cadre. */
    const dansBarre = w.scrollLeft + el.getBoundingClientRect().left - w.getBoundingClientRect().left;
    const cible = dansBarre - (w.clientWidth - el.offsetWidth) / 2;
    try { w.scrollTo({ left: Math.max(0, cible), behavior: REDUCE_MOTION ? 'auto' : 'smooth' }); }
    catch { w.scrollLeft = Math.max(0, cible); }
  }, [room]);
  /* La piece choisie n'etait qu'un fond d'accent (audit du 03/10) : un
   * lecteur d'ecran lisait une suite de boutons sans nom commun ni
   * position. Le groupe porte le nom tr('Pièces') (cle existante, aucune
   * traduction neuve, le polonais reste tel que relu) et la puce ouverte
   * `aria-current="page"` : chaque piece est une vue, `room:` + son nom. */
  return (
    <div ref={wrapRef} className="o-room-scroll" role="group" aria-label={tr('Pièces')} style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2, minWidth: 0 }}>
      {list.map(r => {
        const on = r.name === room;
        return (
          <button key={r.name} data-room-active={on ? '1' : undefined} aria-current={on ? 'page' : undefined} onClick={() => onNav('room:' + r.name)} style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, padding: '7px 12px', borderRadius: 10, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background .18s, border-color .18s', border: 'var(--o-bw,1px) solid ' + (on ? 'transparent' : 'var(--o-bd2)'), background: on ? 'var(--o-accent-fond)' : 'var(--o-s2)', color: on ? '#fff' : 'var(--o-text1)' }}>
            {r.icon ? <span style={{ display: 'flex', width: 15, height: 15, alignItems: 'center', justifyContent: 'center' }}>{cloneElement(r.icon, { size: 15, color: on ? '#fff' : 'var(--o-text3)' })}</span> : <Fi i="home" size={14} color={on ? '#fff' : 'var(--o-text3)'} />}
            <span style={{ fontSize: 12, fontWeight: on ? 800 : 700 }}>{r.name}</span>
            {r.temp != null && <span style={{ fontSize: 12, fontWeight: 600, color: on ? '#fff' : 'var(--o-text3)' }}>{dec(r.temp, 1)}°</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ── Journal d'activite d'une piece ──────────────────────────────────────────
 * Le logbook de Home Assistant, restreint aux entites de la piece.
 * `logbook/event_stream` est une SOUSCRIPTION : un premier paquet livre les
 * dernieres 24 h, puis HA pousse chaque evenement nouveau — aucun poll, meme
 * regime que les cartes template. Le logbook ecarte deja de lui-meme les
 * capteurs continus (temperatures…) : ce qui arrive est un CHANGEMENT digne
 * d'etre raconte. Idee reprise de GlassHome. */

function RoomView({ room, rooms = [], piece, hass, onNav, edit = false }) {
  const [addSheet, setAddSheet] = useState(false);
  // Carte dont la fiche est ouverte, ou null.
  const [cardEdit, setCardEdit] = useState(null);

  // Ce que la decouverte propose pour cette piece, avant agencement.
  const derived = useMemo(() => roomEntitiesBrutes(hass, room), [hass, room]);
  // Meme editeur que la vue Objets : retrait, ajout, ordre, intertitres.
  const ed = useLayoutEditor(ROOM_LAYOUT_KEY, room, derived);
  const ents = ed.ids;
  const addSection = () => ed.toggle('sect:' + Date.now().toString(36));

  const S0 = (hass && hass.states) || {};
  // Une zone par son préfixe : celle d'un module fil pilote porte l'entity_id
  // de son select, point compris (`zone:select.…`).
  const origineDe = (k) => k.indexOf('sect:') === 0 ? tr('Section')
    : (k.indexOf('zone:') === 0 || (k.indexOf(':') > 0 && k.indexOf('.') < 0)) ? nomDeCle(S0, k)
      : ((S0[k] && S0[k].attributes && S0[k].attributes.friendly_name) || k);
  const nomDe = (k) => ed.labelOf(k) || origineDe(k);

  // Decoupage en sections : un intertitre ouvre un bloc.
  const blocs = [];
  ents.forEach(k => {
    if (k.indexOf('sect:') === 0) blocs.push({ titre: k, cartes: [] });
    else {
      if (!blocs.length) blocs.push({ titre: null, cartes: [] });
      blocs[blocs.length - 1].cartes.push(k);
    }
  });
  const [comfort, setComfort] = useState(false);
  const dc = useDomainCards(hass, { onNav });
  useEffect(() => { setComfort(false); dc.fermer(); }, [room]);
  /* `loggia_roomhidden` ne se lit plus (audit du 19/10, lot 4) : plus rien ne l'écrivait depuis que le retrait passe par l'agencement
   * de la pièce, et il ne vivait que sur un appareil. « Tout réafficher » remet l'agencement, rien d'autre. */
  const live = piece && piece.live;
  const onOpenComfort = () => setComfort(true);
  /* LA BARRE DE CONFORT (ADR 0039) remplace les réglages rapides — luminosité
   * du groupe, couleur, volets : les cartes de la pièce pilotent déjà tout
   * cela. Elle dit si l'on est BIEN dans la pièce : un indice sur 100, puis
   * une pastille par mesure que la pièce possède. Le bruit se trouve dans la
   * zone Home Assistant de la pièce ; sans aucune mesure, pas de barre. */
  const S = (hass && hass.states) || {};
  // Les lumières de la maison parmi celles de la pièce (L11, ADR 0261) : un switch déclaré lumière compte, comme sur la tuile de l'Accueil.
  const lightIds = lumieresDe(S, { ...ctxLumieres(), ids: ents });
  const lightsOn = lightIds.filter(id => S[id] && S[id].state === 'on');
  const bruitId = capteurBruitPiece(S, room);
  // Même règle que la fiche de confort : la pastille de la barre suit l'unité réelle du capteur.
  const uniteTPiece = uniteTemp(live && live.tempId && S[live.tempId] ? S[live.tempId].attributes : null, hass);
  const confortPiece = indiceConfort({ temp: versCelsius(live && live.temp, uniteTPiece), hum: live && live.hum, co2: live && live.co2, bruit: bruitId ? parseFloat(S[bruitId].state) : null }, uniteTPiece);
  return (
    <main className="loggia-main" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <Header />
      <div className="loggia-content" style={{ padding: '26px 28px 56px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {edit && <BandeauEdition ed={ed} onAjouter={() => setAddSheet(true)} toutes={() => ed.reset()} />}
        {/* Le titre d'une pièce se pose à la MEME hauteur que la salutation de
          * l'Accueil (01/10). Mesuré sur l'installation : la salutation tombe à
          * +40 px du haut du contenu — 26 px de marge, plus les 14 px que la
          * bannière s'ajoute en dedans. D'où CES 14 px ici, et non un padding
          * plus grand : sous 760 px, `.loggia-content` est repassé à 16 px par
          * un `!important`, et un padding inscrit à la main n'alignerait plus
          * rien. Une marge, elle, suit les deux écrans.
          *
          * Elle ne vaut que si le titre arrive EN PREMIER : en édition, le
          * bandeau passe devant. */}
        {/* titre + navigation entre pièces + pastille de confort, sur une même ligne */}
        {/* Au meme niveau que les autres vues (10/10) : le titre tombait 14 px plus
          * bas que celui d Objets ou de Securite, qui n ont que le rembourrage
          * de la page. La marge ne servait qu a ecarter du bandeau d edition,
          * qui porte deja le sien. */}
        <div className="o-room-head" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flexShrink: 0 }}>
            <h1 style={{ margin: 0, fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 36, fontWeight: 500 }}>{room}</h1>
            <div style={{ fontSize: 13, color: 'var(--o-text2)', fontWeight: 600, marginTop: 5 }}>
              {lightsOn.length ? trN(lightsOn.length, '{n} lampe allumée', '{n} lampes allumées') : tr('Tout est éteint')}
              {live && live.temp != null ? ' · ' + dec(live.temp, 1) + ' ' + signeTemp(uniteTPiece) : ''}
              {/* « HR » est l'abréviation FRANÇAISE de l'humidité relative — RH, rF,
                * UR ailleurs : elle se traduit avec son nombre (audit du 03/10). */}
              {live && live.hum != null ? ' · ' + tr('{n} % HR', { n: Math.round(live.hum) }) : ''}
              {live && live.co2 != null ? ' · ' + Math.round(live.co2) + ' ppm' : ''}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}><RoomNav room={room} onNav={onNav} hass={hass} /></div>
        </div>

        {/* le confort de la pièce : l'indice, puis une pastille par mesure ; un tap ouvre la fiche et son historique */}
        {confortPiece && <BarreConfort confort={confortPiece} onOpen={onOpenComfort} />}

        {ents.length > 0 && <div style={{ fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 19, color: 'var(--o-text2)' }}>{tr('Appareils de la pièce')}</div>}
        {/* appareils de la pièce — mêmes cartes que les vues dédiées */}
        {ents.length
          ? <div ref={ed.gridRef} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {blocs.map((bloc, bi) => (
              // Hors édition, un intertitre sans carte ne s'affiche pas.
              (!edit && bloc.titre && !bloc.cartes.length) ? null : (
              <div key={bloc.titre || 'b' + bi} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {bloc.titre && (edit
                  ? <EditableCard plat ed={ed} id={bloc.titre} nom={nomDe(bloc.titre)} onEdit={setCardEdit}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 19, color: 'var(--o-text2)' }}>
                        <Fi i="apps" size={16} color="var(--o-ok)" />{nomDe(bloc.titre)}
                      </div>
                    </EditableCard>
                  : <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 19, color: 'var(--o-text2)' }}>
                      <Fi i="apps" size={16} color="var(--o-ok)" />{nomDe(bloc.titre)}
                    </div>)}
                <div className="grid-roomdev grid-dense" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(232px,1fr))', columnGap: 16, rowGap: 8 }}>
              {bloc.cartes.map(id => {
                const zone = id.indexOf('zone:') === 0 ? climateZones(S).find(z => z.id === id.slice(5)) : null;
                const lbl = roomLabelOf(room, id);
                const compacte = !zone && ed.estCompact(id);
                const card = compacte ? dc.compact(id, lbl) : dc.card(id, lbl, zone);
                if (!edit) return <Anim key={id} i={ents.indexOf(id)} className={(ed.estLarge(id) ? 'o-cvw2 ' : '') + (compacte ? 'o-cvrow1' : '')}>{card}</Anim>;
                return <EditableCard key={id} ed={ed} id={id} nom={nomDe(id)} onEdit={setCardEdit} hass={hass}>{card}</EditableCard>;
              })}
              {edit && bi === blocs.length - 1 && <CarteAjout onClick={() => setAddSheet(true)} />}
                </div>
              </div>)
            ))}
            </div>
          : <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 13, color: 'var(--o-text3)', fontWeight: 600 }}>{tr('Aucun appareil détecté pour cette pièce.')}<br /><span style={{ fontSize: 12 }}>{tr('Loggia regroupe les entités dont le nom contient « {room} ».', { room })}</span></div>}
        {/* Pas de journal sous les appareils : retire le 14/09 (retour user).
          * Le journal vit dans la vue Securite, avec ses ouvrants et son alarme. */}
        {/* Les fiches des cartes (lumière, volet, climat…) : dc.card pose
          * l'état, dc.sheets MONTE la fiche — sans lui, taper une carte ne
          * faisait rien (« popup inactif », retour du 30/08). */}
        {dc.sheets}
        {addSheet && <ComposeurCartes piece={room} dc={dc} hass={hass} present={ents} onToggle={ed.toggle} onClose={() => setAddSheet(false)}
          pied={<button onClick={addSection} style={editBtn(false)}>{tr('Ajouter un titre')}</button>} />}
        {cardEdit && <CardEditSheet ed={ed} id={cardEdit} nom={nomDe(cardEdit)} origine={origineDe(cardEdit)} hass={hass} piece={room} onClose={() => setCardEdit(null)} />}
        {comfort && piece && <RoomComfortModal piece={piece} hass={hass} bruitId={bruitId} onClose={() => setComfort(false)} />}
      </div>
    </main>
  );
}

export { Sparkline, RoomComfortModal, OutdoorModal, RoomView };
