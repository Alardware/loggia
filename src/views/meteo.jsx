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
import { WX_ICON, WX_ICOLOR, WeatherIco, haWeatherMode, haWeatherLabel, weatherEntity } from '../wxutil.jsx';
import { tr } from '../i18n.js';

/* ── Cartes de detail, au gabarit de l'application Meteo d'Apple ────────────
 *
 * Toutes le meme cadre : un intitule en petites capitales avec son icone, une
 * valeur qui domine, une phrase qui l'explique, et parfois un dessin. Aucune
 * n'apparait sans sa donnee — une carte vide vaut moins que pas de carte.
 */
function WxCarte({ icone, titre, couleur, children }) {
  return (
    <div style={{ background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,20px)', padding: '16px 18px', boxShadow: 'var(--o-shadow,0 14px 36px rgba(0,0,0,.34))', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 168 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', color: 'var(--o-text3)' }}>
        <Fi i={icone} size={12} color={couleur || 'var(--o-text3)'} />{titre.toUpperCase()}
      </div>
      {children}
    </div>
  );
}
/** Grande valeur + unite, le chiffre qui porte la carte. */
function WxValeur({ v, unite, sous }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1 }}>{v}</span>
        {unite && <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--o-text3)' }}>{unite}</span>}
      </div>
      {sous && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 6, lineHeight: 1.35 }}>{sous}</div>}
    </div>
  );
}
/** Echelle degradee avec un curseur : la lecture d'Apple pour l'air et l'UV. */
function WxEchelle({ pct, grad }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div style={{ position: 'relative', height: 6, borderRadius: 3, background: grad, marginTop: 'auto' }}>
      <span style={{ position: 'absolute', top: -3, left: `calc(${p}% - 6px)`, width: 12, height: 12, borderRadius: '50%', background: '#fff', border: '2px solid var(--o-surfA)', boxShadow: '0 1px 4px rgba(0,0,0,.45)' }} />
    </div>
  );
}
/** Rose des vents : l'aiguille pointe d'ou vient le vent, comme chez Apple. */
function WxRose({ bearing, vitesse, rafales, unite }) {
  const a = bearing == null ? null : ((bearing % 360) + 360) % 360;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 'auto' }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{ fontSize: 26, fontWeight: 800, lineHeight: 1 }}>{vitesse == null ? '—' : Math.round(vitesse)}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-text3)' }}>{unite}</span>
        </div>
        {rafales != null && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 5 }}>{tr('Rafales {n}', { n: Math.round(rafales) })} {unite}</div>}
      </div>
      <svg width="66" height="66" viewBox="0 0 66 66" aria-hidden="true" style={{ flexShrink: 0 }}>
        <circle cx="33" cy="33" r="26" fill="none" stroke="var(--o-bd3)" strokeWidth="1" />
        {['N', 'E', 'S', 'O'].map((c, i) => {
          const rad = (i * 90 - 90) * Math.PI / 180;
          return <text key={c} x={33 + Math.cos(rad) * 31} y={33 + Math.sin(rad) * 31 + 3.5} textAnchor="middle" fontSize="8.5" fontWeight="800" fill="var(--o-text3)">{c}</text>;
        })}
        {a != null && (
          <g transform={`rotate(${a} 33 33)`}>
            <path d="M 33 13 L 37.5 33 L 33 29 L 28.5 33 Z" fill="var(--o-cyan)" />
            <path d="M 33 53 L 28.5 33 L 33 37 L 37.5 33 Z" fill="var(--o-bd1)" />
          </g>
        )}
        <circle cx="33" cy="33" r="2.5" fill="var(--o-text2)" />
      </svg>
    </div>
  );
}
/** L'arc du jour : ou en est le soleil entre son lever et son coucher. */
function WxArcSoleil({ lever, coucher }) {
  const maintenant = Date.now();
  const l = lever ? lever.getTime() : null, c = coucher ? coucher.getTime() : null;
  const f = (l != null && c != null && c > l) ? Math.max(0, Math.min(1, (maintenant - l) / (c - l))) : null;
  const hhmm = (d) => d ? String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') : '—';
  const rad = f == null ? null : Math.PI * (1 - f);
  return (
    <div style={{ marginTop: 'auto' }}>
      <svg viewBox="0 0 88 48" style={{ width: '100%', maxWidth: 160, height: 48, display: 'block' }} aria-hidden="true">
        <path d="M 8 42 A 36 36 0 0 1 80 42" fill="none" stroke="var(--o-bd3)" strokeWidth="2" strokeDasharray="3 4" />
        {f != null && <path d="M 8 42 A 36 36 0 0 1 80 42" fill="none" stroke="var(--o-gold)" strokeWidth="2"
          strokeDasharray={`${(Math.PI * 36 * f).toFixed(1)} 999`} />}
        <line x1="4" x2="84" y1="42" y2="42" stroke="var(--o-bd2)" strokeWidth="1" />
        {rad != null && <circle cx={44 + Math.cos(rad) * 36} cy={42 - Math.sin(rad) * 36} r="5" fill="var(--o-gold)" />}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontWeight: 700, color: 'var(--o-text2)', marginTop: 4 }}>
        <span>{tr('Lever')} {hhmm(lever)}</span><span>{tr('Coucher')} {hhmm(coucher)}</span>
      </div>
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
  const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  const jourCourt = (iso, i) => { try { return i === 0 ? tr('Auj.') : JOURS[new Date(iso).getDay()]; } catch (e) { return '—'; } };
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
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, minWidth: 0, flex: '1 1 300px' }}>
              <WeatherIco wx={mode} size={72} />
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
              {jours.length > 0 && (
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', color: 'var(--o-text3)', marginBottom: 8 }}>{tr('LA SEMAINE')}</div>
                  {(() => {
                    /* Les barres se lisent les unes par rapport aux autres :
                     * une seule echelle pour toute la semaine. */
                    const mins = jours.map(f => n(f.templow)).filter(v => v != null);
                    const maxs = jours.map(f => n(f.temperature)).filter(v => v != null);
                    const bas = mins.length ? Math.min(...mins) : 0;
                    const haut = maxs.length ? Math.max(...maxs) : 1;
                    const ampli = (haut - bas) || 1;
                    return jours.map((f, i) => {
                      const mn = n(f.templow), mx = n(f.temperature);
                      const g = mn != null ? (mn - bas) / ampli * 100 : 0;
                      const l = (mn != null && mx != null) ? Math.max(6, (mx - mn) / ampli * 100) : 100;
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '3px 0' }}>
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--o-text2)', width: 34, flexShrink: 0 }}>{jourCourt(f.datetime, i)}</span>
                          <Fi i={WX_ICON[modeDe(f)] || 'clouds'} size={13} color={WX_ICOLOR[modeDe(f)] || '#9fb4d6'} />
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--o-text3)', width: 26, textAlign: 'right', flexShrink: 0 }}>{deg(mn)}</span>
                          <span style={{ flex: 1, minWidth: 26, height: 4, borderRadius: 2, background: 'var(--o-s2)', position: 'relative' }}>
                            <span style={{ position: 'absolute', left: g + '%', width: l + '%', top: 0, bottom: 0, borderRadius: 2, background: 'linear-gradient(90deg,var(--o-cyan),var(--o-gold))' }} />
                          </span>
                          <span style={{ fontSize: 11.5, fontWeight: 800, width: 26, textAlign: 'right', flexShrink: 0 }}>{deg(mx)}</span>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* CARTES DE DÉTAIL — chacune n'existe que si sa donnee existe. */}
        <div className="grid-wxdays" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 14 }}>
          {air && (
            <Anim i={0}><WxCarte icone="wind" titre={tr("Qualité de l'air")} couleur="var(--o-ok)">
              <WxValeur v={Math.round(air.v)} sous={AIR_MOTS(air.v)} />
              <WxEchelle pct={Math.min(100, air.v / 3)} grad="linear-gradient(90deg,var(--o-ok),var(--o-gold) 40%,#ff8a4c 65%,var(--o-bad))" />
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
            <Anim i={3}><WxCarte icone="thermometer-half" titre={tr('Ressenti')} couleur="#ff8a4c">
              <WxValeur v={Math.round(ressenti)} unite="°C" sous={t == null ? null
                : Math.abs(ressenti - t) < 1 ? tr('Comme la température réelle.')
                  : ressenti > t ? tr('Plus chaud que le thermomètre, à cause de l’humidité.')
                    : tr('Plus frais que le thermomètre, à cause du vent.')} />
            </WxCarte></Anim>
          )}
          {uv != null && (
            <Anim i={4}><WxCarte icone="sun" titre={tr('Indice UV')} couleur="var(--o-gold)">
              <WxValeur v={Math.round(uv)} sous={UV_MOTS(uv)} />
              <WxEchelle pct={Math.min(100, uv / 11 * 100)} grad="linear-gradient(90deg,var(--o-ok),var(--o-gold) 35%,#ff8a4c 60%,var(--o-bad) 85%,var(--o-purple))" />
            </WxCarte></Anim>
          )}
          {hum != null && (
            <Anim i={5}><WxCarte icone="raindrops" titre={tr('Humidité')} couleur="var(--o-cyan)">
              <WxValeur v={Math.round(hum)} unite="%" sous={hum >= 70 ? tr('Air humide.') : hum <= 30 ? tr('Air sec.') : tr('Confortable.')} />
              <WxEchelle pct={hum} grad="linear-gradient(90deg,#ff8a4c,var(--o-ok) 45%,var(--o-cyan))" />
            </WxCarte></Anim>
          )}
          {pression != null && (
            <Anim i={6}><WxCarte icone="gauge" titre={tr('Pression')} couleur="var(--o-text2)">
              <WxValeur v={Math.round(pression)} unite="hPa" sous={pression >= 1020 ? tr('Anticyclone : temps stable.') : pression <= 1000 ? tr('Basse pression : perturbations.') : tr('Pression ordinaire.')} />
            </WxCarte></Anim>
          )}
          {visi != null && (
            <Anim i={7}><WxCarte icone="eye" titre={tr('Visibilité')} couleur="var(--o-text2)">
              <WxValeur v={Math.round(visi)} unite="km" sous={visi >= 10 ? tr('Dégagée.') : visi >= 4 ? tr('Réduite.') : tr('Faible — prudence sur la route.')} />
            </WxCarte></Anim>
          )}
        </div>
      </div>
    </>
  );
}
