/**
 * Vue Meteo, chargee a la demande.
 *
 * Sortie de App.jsx pour ne plus etre analysee au demarrage : personne
 * n'atterrit ici en ouvrant le dashboard. Elle ne depend que des primitives
 * partagees et des utilitaires meteo — jamais de App.jsx, ce qui creerait un
 * cycle et ramenerait le monolithe dans ce morceau.
 *
 * Depuis le 02/09, elle suit le GABARIT DE L'ACCUEIL : meme banniere sous le
 * meme ciel, la temperature et la vigilance a gauche la ou l'accueil salue,
 * les prochaines heures et la semaine a droite la ou l'accueil aligne les
 * avatars. Dessous, des cartes de detail — air, vent, soleil, ressenti — qui
 * ne s'affichent que si l'installation publie de quoi les remplir.
 */
import { useState, useEffect, lazy, Suspense } from 'react';
// Meme chargement differe qu'ailleurs : three.js ne doit pas revenir dans le
// chemin critique par la porte de derriere.
const WeatherGL = lazy(() => import('../wx3d.jsx'));
import { REDUCE_MOTION, Fi, Anim, ViewEditBar } from '../ui.jsx';
import { WX_PRESETS } from '../wxpresets.js';
import { WX_ICON, WX_ICOLOR, WX_BG, WxMini, haWeatherMode, haWeatherLabel, weatherEntity } from '../wxutil.jsx';
import { tr } from '../i18n.js';

/* ── Cartes de detail, au gabarit de l'application Meteo d'Apple ────────────
 *
 * Meme squelette pour toutes : un intitule en petites capitales, la valeur qui
 * domine, un mot qui la juge, et un DESSIN qui occupe le pied de la carte.
 * C'est le dessin qui fait la difference entre une fiche technique et une
 * carte qu'on lit d'un coup d'oeil — il tient donc toute la largeur, et
 * chaque carte a la meme hauteur pour que la grille reste droite.
 */
function WxCarte({ icone, titre, couleur, valeur, unite, mot, children }) {
  return (
    <div style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,20px)', padding: '15px 17px 16px', boxShadow: 'var(--o-shadow,0 14px 36px rgba(0,0,0,.34))', display: 'flex', flexDirection: 'column', height: 186 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', color: 'var(--o-text3)' }}>
        <Fi i={icone} size={12} color={couleur} />{titre.toUpperCase()}
      </div>
      {valeur !== undefined && (
        <div style={{ marginTop: 11 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1 }}>{valeur}</span>
            {unite && <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--o-text3)' }}>{unite}</span>}
          </div>
          {mot && <div style={{ fontSize: 12.5, fontWeight: 700, color: couleur, marginTop: 5 }}>{mot}</div>}
        </div>
      )}
      <div style={{ marginTop: 'auto', paddingTop: 12 }}>{children}</div>
    </div>
  );
}

/* Echelle graduee : la barre epaisse d'Apple, avec ses reperes et un curseur
 * cercle. Les bornes se lisent dessous — une echelle sans bornes ne veut rien
 * dire. */
function WxEchelle({ pct, grad, gauche, droite }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div>
      <div style={{ position: 'relative', height: 9, borderRadius: 5, background: grad }}>
        {[25, 50, 75].map(g => <span key={g} style={{ position: 'absolute', left: g + '%', top: 2, bottom: 2, width: 1, background: 'rgba(0,0,0,.28)' }} />)}
        <span style={{ position: 'absolute', top: '50%', left: `calc(${p}% - 7px)`, width: 14, height: 14, marginTop: -7, borderRadius: '50%', background: '#fff', boxShadow: '0 0 0 2.5px var(--o-surfA), 0 2px 6px rgba(0,0,0,.5)' }} />
      </div>
      {(gauche || droite) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, fontWeight: 700, color: 'var(--o-text3)', marginTop: 6 }}>
          <span>{gauche}</span><span>{droite}</span>
        </div>
      )}
    </div>
  );
}

const WX_CARDINAUX = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
/* Rose des vents : le disque gradue, l'aiguille qui montre d'ou vient le
 * vent, et la vitesse AU CENTRE — comme la boussole d'Apple. */
function WxRose({ bearing, vitesse, rafales, unite }) {
  const a = bearing == null ? null : ((bearing % 360) + 360) % 360;
  const card = a == null ? null : WX_CARDINAUX[Math.round(a / 45) % 8];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <svg width="104" height="104" viewBox="0 0 104 104" aria-hidden="true" style={{ flexShrink: 0, margin: '-16px 0 -10px' }}>
        {/* graduations : un trait tous les 15 degres, plus marque aux quarts */}
        {Array.from({ length: 24 }, (_, i) => {
          const rad = (i * 15 - 90) * Math.PI / 180;
          const gros = i % 6 === 0;
          const r1 = gros ? 33 : 37, r2 = 41;
          return <line key={i} x1={52 + Math.cos(rad) * r1} y1={52 + Math.sin(rad) * r1} x2={52 + Math.cos(rad) * r2} y2={52 + Math.sin(rad) * r2}
            stroke={gros ? 'var(--o-text3)' : 'var(--o-bd2)'} strokeWidth={gros ? 1.6 : 1} strokeLinecap="round" />;
        })}
        {['N', 'E', 'S', 'O'].map((c, i) => {
          const rad = (i * 90 - 90) * Math.PI / 180;
          return <text key={c} x={52 + Math.cos(rad) * 48} y={52 + Math.sin(rad) * 48 + 3.5} textAnchor="middle" fontSize="9.5" fontWeight="800" fill="var(--o-text2)">{c}</text>;
        })}
        {a != null && (
          <g transform={`rotate(${a} 52 52)`}>
            <path d="M 52 14 L 58 34 L 52 30 L 46 34 Z" fill="var(--o-cyan)" />
            <path d="M 52 90 L 46 70 L 52 74 L 58 70 Z" fill="var(--o-bd1)" />
          </g>
        )}
        <circle cx="52" cy="52" r="21" fill="var(--o-s2)" stroke="var(--o-bd3)" strokeWidth="1" />
        <text x="52" y="50" textAnchor="middle" fontSize="17" fontWeight="800" fill="var(--o-text)">{vitesse == null ? '—' : Math.round(vitesse)}</text>
        <text x="52" y="62" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="var(--o-text3)">{unite}</text>
      </svg>
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {card && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.07em', color: 'var(--o-text3)' }}>{tr('DIRECTION')}</div>
            <div style={{ fontSize: 14, fontWeight: 800, marginTop: 2 }}>{card} <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--o-text3)' }}>{Math.round(a)}°</span></div>
          </div>
        )}
        {rafales != null && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.07em', color: 'var(--o-text3)' }}>{tr('RAFALES')}</div>
            <div style={{ fontSize: 14, fontWeight: 800, marginTop: 2 }}>{Math.round(rafales)} <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--o-text3)' }}>{unite}</span></div>
          </div>
        )}
      </div>
    </div>
  );
}

/* L'arc du jour : le ciel se colore de l'aube au crepuscule, le soleil est a
 * sa place sur la courbe, et l'horizon separe le jour de la nuit. */
function WxArcSoleil({ lever, coucher }) {
  const maintenant = Date.now();
  const l = lever ? lever.getTime() : null, c = coucher ? coucher.getTime() : null;
  const f = (l != null && c != null && c > l) ? Math.max(0, Math.min(1, (maintenant - l) / (c - l))) : null;
  const hhmm = (d) => d ? String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') : '—';
  const rad = f == null ? null : Math.PI * (1 - f);
  const x = rad == null ? null : 60 + Math.cos(rad) * 52;
  const y = rad == null ? null : 62 - Math.sin(rad) * 44;
  const reste = (c != null && maintenant < c) ? Math.round((c - maintenant) / 60000) : null;
  return (
    <div>
      <svg viewBox="0 0 120 72" style={{ width: '100%', height: 74, display: 'block' }} aria-hidden="true">
        <defs>
          <linearGradient id="wx-arc" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ff8a4c" /><stop offset="50%" stopColor="var(--o-gold)" /><stop offset="100%" stopColor="#ff8a4c" />
          </linearGradient>
        </defs>
        <path d="M 8 62 A 52 44 0 0 1 112 62" fill="none" stroke="var(--o-bd3)" strokeWidth="2.5" strokeDasharray="2 5" strokeLinecap="round" />
        {f != null && <path d="M 8 62 A 52 44 0 0 1 112 62" fill="none" stroke="url(#wx-arc)" strokeWidth="2.5" strokeLinecap="round"
          pathLength="100" strokeDasharray={`${(f * 100).toFixed(1)} 100`} />}
        <line x1="2" x2="118" y1="62" y2="62" stroke="var(--o-bd2)" strokeWidth="1" />
        {x != null && (<>
          <circle cx={x} cy={y} r="10" fill="var(--o-gold)" opacity=".18" />
          <circle cx={x} cy={y} r="5.5" fill="var(--o-gold)" />
        </>)}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6, fontSize: 11.5, fontWeight: 700, color: 'var(--o-text2)' }}>
        <span>{hhmm(lever)}</span>
        {reste != null && <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--o-text3)', whiteSpace: 'nowrap' }}>{reste >= 60 ? tr('encore {n} h de jour', { n: Math.round(reste / 60) }) : tr('encore {n} min', { n: reste })}</span>}
        <span>{hhmm(coucher)}</span>
      </div>
    </div>
  );
}

/* Barometre : l'aiguille sur un demi-cadran de 950 a 1050 hPa. */
function WxBarometre({ hpa }) {
  const p = Math.max(0, Math.min(1, (hpa - 950) / 100));
  const rad = Math.PI * (1 - p);
  return (
    <svg viewBox="0 0 120 64" style={{ width: '100%', height: 64, display: 'block' }} aria-hidden="true">
      <defs>
        <linearGradient id="wx-baro" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--o-accent)" /><stop offset="100%" stopColor="var(--o-ok)" />
        </linearGradient>
      </defs>
      <path d="M 12 54 A 48 48 0 0 1 108 54" fill="none" stroke="var(--o-s4)" strokeWidth="8" strokeLinecap="round" />
      <path d="M 12 54 A 48 48 0 0 1 108 54" fill="none" stroke="url(#wx-baro)" strokeWidth="8" strokeLinecap="round" pathLength="100" strokeDasharray={`${(p * 100).toFixed(1)} 100`} />
      <line x1="60" y1="54" x2={60 + Math.cos(rad) * 38} y2={54 - Math.sin(rad) * 38} stroke="var(--o-text)" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="60" cy="54" r="4" fill="var(--o-text)" />
      <text x="12" y="62" fontSize="9" fontWeight="700" fill="var(--o-text3)">950</text>
      <text x="108" y="62" fontSize="9" fontWeight="700" fill="var(--o-text3)" textAnchor="end">1050</text>
    </svg>
  );
}

/* Thermometre du ressenti : les deux temperatures sur la meme reglette, pour
 * que l'ecart se VOIE au lieu de se calculer. */
function WxRessenti({ reel, ressenti }) {
  const bas = Math.min(reel, ressenti) - 6, haut = Math.max(reel, ressenti) + 6;
  const pos = (v) => ((v - bas) / ((haut - bas) || 1)) * 100;
  return (
    <div>
      <div style={{ position: 'relative', height: 9, borderRadius: 5, background: 'linear-gradient(90deg,var(--o-cyan),var(--o-ok) 45%,var(--o-gold) 72%,#ff8a4c)' }}>
        <span style={{ position: 'absolute', top: -4, left: `calc(${pos(reel)}% - 1px)`, width: 2, height: 17, borderRadius: 1, background: 'var(--o-text2)' }} />
        <span style={{ position: 'absolute', top: '50%', left: `calc(${pos(ressenti)}% - 7px)`, width: 14, height: 14, marginTop: -7, borderRadius: '50%', background: '#fff', boxShadow: '0 0 0 2.5px var(--o-surfA), 0 2px 6px rgba(0,0,0,.5)' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, fontWeight: 700, color: 'var(--o-text3)', marginTop: 6 }}>
        <span>{tr('Thermomètre')} {Math.round(reel)}°</span><span>{tr('Ressenti')} {Math.round(ressenti)}°</span>
      </div>
    </div>
  );
}

/* Carte d'un JOUR de la semaine : sa propre animation en fond — pluie qui
 * tombe, etoiles, halo — et le degrade de sa condition. C'est la demande du
 * 02/09 : « mes cartes, mais avec leur animation correspondante ». */
function WxJour({ f, nom, mode, effets, deg, n }) {
  const mx = n(f.temperature), mn = n(f.templow);
  const pluie = n(f.precipitation);
  const proba = n(f.precipitation_probability);
  return (
    <div style={{ position: 'relative', overflow: 'hidden', height: 156, borderRadius: 'var(--o-radius,20px)', border: 'var(--o-bw,1px) solid var(--o-bd2)', background: WX_BG[mode] || WX_BG.clouds, boxShadow: 'var(--o-shadow,0 14px 36px rgba(0,0,0,.34))', padding: '15px 16px', display: 'flex', flexDirection: 'column' }}>
      {effets && <WxMini wx={mode} on />}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '.04em' }}>{nom}</span>
        <Fi i={WX_ICON[mode] || 'clouds'} size={20} color={WX_ICOLOR[mode] || '#9fb4d6'} />
      </div>
      <div style={{ position: 'relative', fontSize: 11.5, fontWeight: 600, color: 'var(--o-text2)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{haWeatherLabel(String(f.condition))}</div>
      <div style={{ position: 'relative', marginTop: 'auto', display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1 }}>{deg(mx)}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--o-text2)' }}>{deg(mn)}</span>
      </div>
      {(pluie != null || proba != null) && (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, marginTop: 7, fontSize: 11.5, fontWeight: 700, color: 'var(--o-cyan)' }}>
          <Fi i="raindrops" size={12} color="var(--o-cyan)" />
          {proba != null ? Math.round(proba) + ' %' : ''}{(proba != null && pluie) ? ' · ' : ''}{pluie ? (Math.round(pluie * 10) / 10) + ' mm' : ''}
        </div>
      )}
    </div>
  );
}

/** Qualite de l'air : le capteur d'indice de l'installation, s'il y en a un. */
function trouverAir(S) {
  const ids = Object.keys(S || {});
  const parClasse = ids.find(id => S[id].attributes && S[id].attributes.device_class === 'aqi');
  const parNom = ids.find(id => id.indexOf('sensor.') === 0 && /(air_quality|aqi|qualite_air)/i.test(id));
  const id = parClasse || parNom;
  if (!id) return null;
  const v = parseFloat(S[id].state);
  return isNaN(v) ? null : { id, v, nom: (S[id].attributes && S[id].attributes.friendly_name) || id };
}
/** Vigilance meteo : Meteo-France et consorts publient un capteur d'alerte. */
function trouverAlerte(S) {
  const id = Object.keys(S || {}).find(k => /(weather_alert|vigilance|alerte_meteo)/i.test(k));
  if (!id) return null;
  const st = S[id];
  const brut = String(st.state || '').toLowerCase();
  if (!brut || brut === 'vert' || brut === 'green' || brut === 'none' || brut === 'unavailable' || brut === 'unknown') return null;
  const coul = /rouge|red/.test(brut) ? 'var(--o-bad)' : /orange/.test(brut) ? 'var(--o-warn2)' : 'var(--o-warn)';
  // Les risques nommes sont dans les attributs, un par type (« Vent violent »…).
  const a = st.attributes || {};
  const ignore = ['friendly_name', 'icon', 'attribution', 'device_class', 'unit_of_measurement'];
  const risques = Object.keys(a)
    .filter(k => ignore.indexOf(k) < 0 && typeof a[k] === 'string' && /jaune|orange|rouge|yellow|red/i.test(a[k]))
    .map(k => k.replace(/_/g, ' '));
  return { texte: a.friendly_name || tr('Vigilance météo'), niveau: st.state, coul, risques };
}

export default /* ══════ VUE MÉTÉO ══════ */
function MeteoContent({ hass, edit = false, onEnt, wxFx = true }) {
  const S = (hass && hass.states) || {};
  const wId = weatherEntity(hass);
  const wEnt = wId ? S[wId] : null;
  const wa = (wEnt && wEnt.attributes) || {};
  const sun = S['sun.sun'];
  const isNight = sun ? sun.state === 'below_horizon' : false;
  const mode = wEnt ? haWeatherMode(wEnt.state, isNight) : 'clouds';
  const label = wEnt ? haWeatherLabel(wEnt.state) : '—';
  const [hourly, setHourly] = useState(null);
  const [daily, setDaily] = useState(null);

  // L'attribut `forecast` n'existe plus (HA >=2024.3) : on passe par le service.
  useEffect(() => {
    let alive = true;
    if (!hass || !hass.callWS || !wId) return undefined;
    const get = (type) => hass.callWS({
      type: 'call_service', domain: 'weather', service: 'get_forecasts',
      target: { entity_id: wId }, service_data: { type }, return_response: true,
    }).then(r => {
      const resp = r && (r.response || r);
      const e = resp && resp[wId];
      return (e && Array.isArray(e.forecast)) ? e.forecast : null;
    }).catch(() => null);
    Promise.all([get('hourly'), get('daily')]).then(([h, d]) => { if (alive) { setHourly(h); setDaily(d); } });
    return () => { alive = false; };
  }, [wId]);

  const n = (v) => (typeof v === 'number' && !isNaN(v)) ? v : null;
  const t = n(wa.temperature);
  const ressenti = n(wa.apparent_temperature);
  const hum = n(wa.humidity);
  const vent = n(wa.wind_speed);
  const rafales = n(wa.wind_gust_speed);
  const bearing = n(wa.wind_bearing);
  const pression = n(wa.pressure);
  const uv = n(wa.uv_index);
  const visi = n(wa.visibility);
  const uVent = wa.wind_speed_unit || 'km/h';
  const deg = (v, u = '°') => v == null ? '—' : Math.round(v) + u;
  const heure = (iso) => { try { return new Date(iso).getHours() + ' h'; } catch (e) { return '—'; } };
  const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  // Sur une carte, le jour a la place de s'écrire en entier.
  const jourLong = (iso, i) => { try { return i === 0 ? tr("Aujourd’hui") : tr(JOURS[new Date(iso).getDay()]); } catch (e) { return '—'; } };
  /* La nuit se déduit de l'HEURE du créneau, pas de l'instant présent : une
   * prévision de 23 h dessinait un grand soleil parce qu'on demandait toujours
   * « fait-il nuit maintenant ? ». */
  const nuitA = (iso) => { try { const h = new Date(iso).getHours(); return h >= 21 || h < 7; } catch (e) { return false; } };
  const modeDe = (f) => haWeatherMode(String(f && f.condition), nuitA(f && f.datetime));
  const dateDe = (iso) => { try { const d = new Date(iso); return isNaN(d.getTime()) ? null : d; } catch (e) { return null; } };
  // Pas d'horodatage de releve : `last_changed` est ce qui s'en approche le plus.
  const depuis = (() => {
    if (!wEnt || !wEnt.last_changed) return null;
    const min = Math.round((Date.now() - new Date(wEnt.last_changed).getTime()) / 60000);
    if (!isFinite(min) || min < 0) return null;
    return min < 1 ? "à l’instant" : min < 60 ? 'il y a ' + min + ' min' : 'il y a ' + Math.round(min / 60) + ' h';
  })();

  const carte = { background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,20px)', padding: '20px 22px', boxShadow: 'var(--o-shadow,0 14px 36px rgba(0,0,0,.34))' };
  const chip = (icone, texte, coul) => (
    <span style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 999, background: 'var(--o-s2)', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
      <Fi i={icone} size={13} color={coul} />{texte}
    </span>
  );

  if (!wId) {
    return (
      <div className="loggia-content" style={{ padding: '26px 28px 56px' }}>
        <h1 style={{ margin: 0, fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 36, fontWeight: 500 }}>{tr('Météo')}</h1>
        <div style={{ ...carte, marginTop: 20, color: 'var(--o-text2)', fontWeight: 600, fontSize: 13.5 }}>
          Aucune entité météo dans Home Assistant. Cette vue n’a rien à afficher.
        </div>
      </div>
    );
  }

  // Meme mapping que l'Accueil : l'etat HA brut d'abord, le mode ensuite.
  const WX3D_MODE = { sun: 'sunny', partly: 'partlycloudy', clouds: 'cloudy', wind: 'windy', rain: 'rainy', snow: 'snowy', storm: 'lightning-rainy', night: 'clear-night' };
  const cond3d = (wEnt && WX_PRESETS[wEnt.state]) ? wEnt.state : (WX3D_MODE[mode] || 'partlycloudy');
  const effets = !REDUCE_MOTION && wxFx;

  const prochaines = (hourly || []).slice(0, 6);
  const jours = (daily || []).slice(0, 7);
  const alerte = trouverAlerte(S);
  const air = trouverAir(S);
  const lever = dateDe(sun && sun.attributes && sun.attributes.next_rising);
  const coucher = dateDe(sun && sun.attributes && sun.attributes.next_setting);
  /* Le soleil publie les PROCHAINS evenements : en pleine journee, le prochain
   * lever est celui de demain et l'arc partirait a l'envers. On recule d'un
   * jour quand l'ordre n'a pas de sens. */
  const leverDuJour = (lever && coucher && lever > coucher) ? new Date(lever.getTime() - 86400000) : lever;

  const AIR_MOTS = (v) => v <= 50 ? tr('Bonne') : v <= 100 ? tr('Moyenne') : v <= 150 ? tr('Médiocre') : v <= 200 ? tr('Mauvaise') : tr('Très mauvaise');
  const UV_MOTS = (v) => v < 3 ? tr('Faible') : v < 6 ? tr('Modéré') : v < 8 ? tr('Élevé') : v < 11 ? tr('Très élevé') : tr('Extrême');

  return (
    <>
      {/* Le ciel de l'accueil, derriere la banniere — meme hauteur, meme voile. */}
      {effets && (
        <div className="o-wx3d" aria-hidden="true">
          <Suspense fallback={null}><WeatherGL condition={cond3d} hourEq={new Date().getHours()} /></Suspense>
          <div className="o-wx3d-veil" />
        </div>)}
      <div className="loggia-content" style={{ position: 'relative', zIndex: 1, padding: '26px 28px 56px', display: 'flex', flexDirection: 'column', gap: 26 }}>
        {edit && <ViewEditBar texte={tr('Mode édition : choisis l’entité météo de cette vue.')} onEnt={onEnt} />}

        {/* BANNIÈRE — le gabarit de l'accueil : ce qu'il faut savoir a gauche,
          * ce qui vient a droite. */}
        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--o-radius,22px)', padding: '22px 8px' }}>
          <div className="o-banner-row" style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
            {/* Pas d'icône ici : le ciel derrière dit déjà le temps qu'il fait
              * (retour 02/09). La place revient au chiffre. */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, minWidth: 0, flex: '1 1 300px' }}>
              <div style={{ minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--o-text2)' }}>{(wa.friendly_name || wId)}{depuis ? ' · ' + depuis : ''}</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                  <span className="o-greet-name" style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.05 }}>{deg(t, '')}</span>
                  <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--o-text3)' }}>°C</span>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{label}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                  {ressenti != null && chip('thermometer-half', tr('Ressenti') + ' ' + deg(ressenti), '#ff8a4c')}
                  {vent != null && chip('wind', tr('Vent {n} km/h', { n: Math.round(vent) }), '#9fb4d6')}
                  {hum != null && chip('raindrops', tr('Humidité') + ' ' + Math.round(hum) + ' %', 'var(--o-cyan)')}
                  {uv != null && chip('sun', 'UV ' + Math.round(uv), 'var(--o-gold)')}
                </div>
                {/* La vigilance passe avant tout le reste : c'est la seule
                  * information de cette vue qui demande d'agir. */}
                {alerte && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 12, padding: '9px 13px', borderRadius: 12, background: 'var(--o-s2)', border: '1px solid ' + alerte.coul }}>
                    <Fi i="exclamation-triangle" size={14} color={alerte.coul} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 800, color: alerte.coul }}>{alerte.texte} · {alerte.niveau}</div>
                      {alerte.risques.length > 0 && <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--o-text2)' }}>{alerte.risques.join(' · ')}</div>}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* À DROITE, la ou l'accueil aligne les avatars : les heures qui
              * viennent, puis la semaine. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flexShrink: 0, minWidth: 232 }}>
              {prochaines.length > 0 && (
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', color: 'var(--o-text3)', marginBottom: 8 }}>{tr('PROCHAINES HEURES')}</div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {prochaines.map((f, i) => (
                      <div key={i} style={{ flex: 1, minWidth: 0, textAlign: 'center', padding: '9px 4px', borderRadius: 12, background: 'var(--o-s2)' }}>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--o-text3)' }}>{heure(f.datetime)}</div>
                        <div style={{ margin: '5px 0 4px' }}><Fi i={WX_ICON[modeDe(f)] || 'clouds'} size={15} color={WX_ICOLOR[modeDe(f)] || '#9fb4d6'} /></div>
                        <div style={{ fontSize: 12.5, fontWeight: 800 }}>{deg(n(f.temperature))}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* LA SEMAINE — une carte par jour, chacune animée par SA condition :
          * la pluie tombe sur le jour de pluie, les étoiles brillent sur la
          * nuit claire (retour 02/09). */}
        {jours.length > 0 && (<>
          <div style={{ fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 19, color: 'var(--o-text2)' }}>{tr('Prévision 7 jours')}</div>
          <div className="grid-wxdays" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(168px,1fr))', gap: 14 }}>
            {jours.map((f, i) => (
              <Anim key={i} i={i} base={140}>
                <WxJour f={f} nom={jourLong(f.datetime, i)} mode={modeDe(f)} effets={effets} deg={deg} n={n} />
              </Anim>
            ))}
          </div>
        </>)}

        {/* CARTES DE DÉTAIL — chacune n'existe que si sa donnee existe. */}
        <div className="grid-wxdays" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(232px,1fr))', gap: 14 }}>
          {air && (
            <Anim i={0}><WxCarte icone="wind" titre={tr("Qualité de l'air")} couleur="var(--o-ok)" valeur={Math.round(air.v)} mot={AIR_MOTS(air.v)}>
              <WxEchelle pct={Math.min(100, air.v / 3)} grad="linear-gradient(90deg,var(--o-ok),var(--o-gold) 40%,#ff8a4c 65%,var(--o-bad))"
                gauche={tr('Bonne')} droite={tr('Mauvaise')} />
            </WxCarte></Anim>
          )}
          {vent != null && (
            <Anim i={1}><WxCarte icone="wind" titre={tr('Vent')} couleur="var(--o-cyan)">
              <WxRose bearing={bearing} vitesse={vent} rafales={rafales} unite={uVent} />
            </WxCarte></Anim>
          )}
          {(leverDuJour || coucher) && (
            <Anim i={2}><WxCarte icone="sun" titre={tr('Soleil')} couleur="var(--o-gold)">
              <WxArcSoleil lever={leverDuJour} coucher={coucher} />
            </WxCarte></Anim>
          )}
          {ressenti != null && (
            <Anim i={3}><WxCarte icone="thermometer-half" titre={tr('Ressenti')} couleur="#ff8a4c" valeur={Math.round(ressenti)} unite="°C"
              mot={t == null ? null
                : Math.abs(ressenti - t) < 1 ? tr('Comme la température réelle.')
                  : ressenti > t ? tr('Plus chaud, à cause de l’humidité.')
                    : tr('Plus frais, à cause du vent.')}>
              {t != null && <WxRessenti reel={t} ressenti={ressenti} />}
            </WxCarte></Anim>
          )}
          {uv != null && (
            <Anim i={4}><WxCarte icone="sun" titre={tr('Indice UV')} couleur="var(--o-gold)" valeur={Math.round(uv)} mot={UV_MOTS(uv)}>
              <WxEchelle pct={Math.min(100, uv / 11 * 100)} grad="linear-gradient(90deg,var(--o-ok),var(--o-gold) 35%,#ff8a4c 60%,var(--o-bad) 85%,var(--o-purple))"
                gauche="0" droite="11+" />
            </WxCarte></Anim>
          )}
          {hum != null && (
            <Anim i={5}><WxCarte icone="raindrops" titre={tr('Humidité')} couleur="var(--o-cyan)" valeur={Math.round(hum)} unite="%"
              mot={hum >= 70 ? tr('Air humide.') : hum <= 30 ? tr('Air sec.') : tr('Confortable.')}>
              <WxEchelle pct={hum} grad="linear-gradient(90deg,#ff8a4c,var(--o-ok) 45%,var(--o-cyan))" gauche={tr('Sec')} droite={tr('Humide')} />
            </WxCarte></Anim>
          )}
          {pression != null && (
            <Anim i={6}><WxCarte icone="gauge" titre={tr('Pression')} couleur="var(--o-text2)" valeur={Math.round(pression)} unite="hPa"
              mot={pression >= 1020 ? tr('Anticyclone : temps stable.') : pression <= 1000 ? tr('Basse pression : perturbations.') : tr('Pression ordinaire.')}>
              <WxBarometre hpa={pression} />
            </WxCarte></Anim>
          )}
          {visi != null && (
            <Anim i={7}><WxCarte icone="eye" titre={tr('Visibilité')} couleur="var(--o-text2)" valeur={Math.round(visi)} unite="km"
              mot={visi >= 10 ? tr('Dégagée.') : visi >= 4 ? tr('Réduite.') : tr('Faible — prudence sur la route.')}>
              <WxEchelle pct={Math.min(100, visi / 20 * 100)} grad="linear-gradient(90deg,#ff8a4c,var(--o-gold) 35%,var(--o-ok))" gauche="0" droite="20 km" />
            </WxCarte></Anim>
          )}
        </div>
      </div>
    </>
  );
}
