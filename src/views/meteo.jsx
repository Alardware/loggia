/**
 * Vue Meteo, chargee a la demande.
 *
 * Sortie de App.jsx pour ne plus etre analysee au demarrage : personne
 * n'atterrit ici en ouvrant le dashboard. Elle ne depend que des primitives
 * partagees et des utilitaires meteo — jamais de App.jsx, ce qui creerait un
 * cycle et ramenerait le monolithe dans ce morceau.
 */
import { useState, useEffect, lazy, Suspense } from 'react';
// Meme chargement differe qu'ailleurs : three.js ne doit pas revenir dans le
// chemin critique par la porte de derriere.
const WeatherGL = lazy(() => import('../wx3d.jsx'));
import { REDUCE_MOTION, Fi, Anim, ViewEditBar } from '../ui.jsx';
import { WX_PRESETS } from '../wxpresets.js';
import { WX_ICON, WX_ICOLOR, WeatherIco, haWeatherMode, haWeatherLabel, weatherEntity } from '../wxutil.jsx';
import { tr } from '../i18n.js';

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
  const [panel, setPanel] = useState(true);
  const [portee, setPortee] = useState('7j');
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
  const pression = n(wa.pressure);
  const uv = n(wa.uv_index);
  const visi = n(wa.visibility);
  const deg = (v, u = '°') => v == null ? '—' : Math.round(v) + u;
  const hm = (iso) => { try { const d = new Date(iso); return d.getHours() + ' h ' + String(d.getMinutes()).padStart(2, '0'); } catch (e) { return '—'; } };
  const heure = (iso) => { try { return new Date(iso).getHours() + ' h'; } catch (e) { return '—'; } };
  const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const jour = (iso, i) => { try { return i === 0 ? "Aujourd’hui" : JOURS[new Date(iso).getDay()]; } catch (e) { return '—'; } };
  const modeDe = (f) => haWeatherMode(String(f && f.condition), false);
  // Pas d'horodatage de releve : `last_changed` est ce qui s'en approche le plus.
  const depuis = (() => {
    if (!wEnt || !wEnt.last_changed) return null;
    const min = Math.round((Date.now() - new Date(wEnt.last_changed).getTime()) / 60000);
    if (!isFinite(min) || min < 0) return null;
    return min < 1 ? "à l’instant" : min < 60 ? 'il y a ' + min + ' min' : 'il y a ' + Math.round(min / 60) + ' h';
  })();

  const carte = { background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,20px)', padding: '20px 22px', boxShadow: 'var(--o-shadow,0 14px 36px rgba(0,0,0,.34))' };
  const Ligne = ({ titre, sous, valeur, couleur, part }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 0', borderTop: 'var(--o-bw,1px) solid var(--o-bd3)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{titre}</div>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--o-text3)', marginTop: 2 }}>{sous}</div>
      </div>
      {part != null && (
        <div style={{ width: 128, height: 4, borderRadius: 3, background: 'var(--o-s2)', overflow: 'hidden', flexShrink: 0 }}>
          <div style={{ width: Math.max(0, Math.min(100, part)) + '%', height: '100%', background: couleur || 'var(--o-accent)' }} />
        </div>
      )}
      <div style={{ fontSize: 15, fontWeight: 800, color: couleur || 'var(--o-text1)', whiteSpace: 'nowrap' }}>{valeur}</div>
    </div>
  );
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

  const prochaines = (hourly || []).slice(0, 5);
  const jours = (daily || []).slice(0, 7);

  return (
    <div className="loggia-content" style={{ padding: '26px 28px 56px', display: 'flex', flexDirection: 'column', gap: 22 }}>
      {edit && <ViewEditBar texte={tr('Mode édition : choisis l’entité météo de cette vue.')} onEnt={onEnt} />}

      <div>
        <h1 style={{ margin: 0, fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 36, fontWeight: 500 }}>{tr('Météo')}</h1>
        <div style={{ fontSize: 13.5, color: 'var(--o-text2)', fontWeight: 600, marginTop: 4 }}>
          {(wa.friendly_name || wId)}{depuis ? ' · relevé ' + depuis : ''} · Home Assistant
        </div>
      </div>

      <div style={{ ...carte, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'flex-start', gap: 26, flexWrap: 'wrap' }}>
        {effets && (
          <div className="o-wx-card" aria-hidden="true">
            <Suspense fallback={null}><WeatherGL condition={cond3d} hourEq={new Date().getHours()} /></Suspense>
            <div className="o-wx-card-veil" />
          </div>
        )}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'flex-start', gap: 18, flex: 1, minWidth: 260 }}>
          <WeatherIco wx={mode} size={72} />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-.02em' }}>{deg(t, '')}</span>
              <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--o-text3)' }}>°C</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{label}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
              {ressenti != null && chip('thermometer-half', 'Ressenti ' + deg(ressenti), '#ff8a4c')}
              {vent != null && chip('wind', 'Vent ' + Math.round(vent) + ' km/h', '#9fb4d6')}
              {hum != null && chip('raindrops', 'Humidité ' + Math.round(hum) + ' %', 'var(--o-cyan)')}
              {uv != null && chip('sun', 'UV ' + Math.round(uv), 'var(--o-gold)')}
            </div>
          </div>
        </div>
        {prochaines.length > 0 && (
          <div style={{ position: 'relative', zIndex: 1, minWidth: 210 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', color: 'var(--o-text3)', marginBottom: 9 }}>PROCHAINES HEURES</div>
            {prochaines.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '4px 0' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-text2)', width: 38 }}>{heure(f.datetime)}</span>
                <Fi i={WX_ICON[modeDe(f)] || 'clouds'} size={14} color={WX_ICOLOR[modeDe(f)] || '#9fb4d6'} />
                <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--o-text3)', flex: 1 }}>
                  {f.precipitation_probability != null ? Math.round(f.precipitation_probability) + ' %'
                    : f.precipitation != null ? (Math.round(f.precipitation * 10) / 10) + ' mm' : ''}
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 800 }}>{deg(n(f.temperature))}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="o-bar" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 'var(--o-radius,20px)', background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 8px 5px 11px', borderRadius: 10, background: 'var(--o-s2)' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text2)', whiteSpace: 'nowrap' }}>{tr('Prévision')}</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {[['24h', '24 h'], ['7j', '7 jours']].map(([id, lb]) => (
              <button key={id} onClick={() => setPortee(id)} style={{ padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, background: portee === id ? 'rgba(var(--o-accent-rgb),.18)' : 'transparent', color: portee === id ? 'var(--o-accent-soft)' : 'var(--o-text2)' }}>{lb}</button>
            ))}
          </div>
        </div>
        <span style={{ flex: 1 }} />
        <button onClick={() => setPanel(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 10, cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700, border: panel ? 'var(--o-bw,1px) solid rgba(var(--o-accent-rgb),.44)' : 'var(--o-bw,1px) solid var(--o-bd1)', background: panel ? 'rgba(var(--o-accent-rgb),.14)' : 'var(--o-s2)', color: panel ? 'var(--o-accent-soft)' : 'var(--o-text2)' }}>
          <Fi i="sliders-v" size={13} /><span className="o-barlabel">{panel ? 'Masquer les réglages' : 'Réglages de la vue'}</span>
        </button>
      </div>

      {panel && (
        <div style={carte}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Conditions</div>
            <span style={{ fontSize: 11, fontWeight: 800, padding: '4px 11px', borderRadius: 999, background: 'var(--o-s2)', color: 'var(--o-text2)', whiteSpace: 'nowrap' }}>{wId}</span>
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)', marginBottom: 8 }}>{tr('Relevés de l’entité météo')}</div>
          {ressenti != null && <Ligne titre="Ressenti" sous="Température apparente, vent et humidité inclus" valeur={deg(ressenti) + ' C'} couleur="#ff8a4c" />}
          {hum != null && <Ligne titre={tr('Humidité')} sous="Confortable entre 40 et 60 %" valeur={Math.round(hum) + ' %'} couleur="var(--o-ok)" part={hum} />}
          {vent != null && <Ligne titre="Vent" sous={rafales != null ? 'Rafales à ' + Math.round(rafales) + ' km/h' : 'Vitesse moyenne'} valeur={Math.round(vent) + ' km/h'} />}
          {pression != null && <Ligne titre="Pression" sous="Au niveau de la mer" valeur={Math.round(pression) + ' hPa'} />}
          {uv != null && <Ligne titre="Indice UV" sous="Protection conseillée au-delà de 6" valeur={Math.round(uv) + (uv >= 6 ? ' · élevé' : ' · modéré')} couleur={uv >= 6 ? 'var(--o-warn2)' : 'var(--o-ok)'} part={Math.min(100, uv * 9)} />}
          {sun && sun.attributes && sun.attributes.next_rising && (
            <Ligne titre="Lever · coucher" sous={isNight ? 'Nuit en cours' : 'Journée en cours'}
              valeur={hm(sun.attributes.next_rising) + ' · ' + hm(sun.attributes.next_setting)} couleur="var(--o-gold)" />
          )}
          {visi != null && <Ligne titre="Visibilité" sous="Portée de vue au sol" valeur={Math.round(visi) + ' km'} />}
        </div>
      )}

      <div style={{ fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 19, color: 'var(--o-text2)' }}>
        {portee === '24h' ? 'Prochaines heures' : 'Prévision 7 jours'}
      </div>
      {portee === '24h' ? (
        (hourly && hourly.length)
          ? <div className="grid-wxdays" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12 }}>
              {hourly.slice(0, 12).map((f, i) => (
                <Anim key={i} i={i} base={140}><div style={{ ...carte, padding: '14px 15px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <Fi i={WX_ICON[modeDe(f)] || 'clouds'} size={17} color={WX_ICOLOR[modeDe(f)] || '#9fb4d6'} />
                    <div style={{ fontSize: 12.5, fontWeight: 800 }}>{heure(f.datetime)}</div>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, marginTop: 9 }}>{deg(n(f.temperature))}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--o-text3)', marginTop: 2 }}>
                    {f.precipitation != null ? (Math.round(f.precipitation * 10) / 10) + ' mm' : '—'}
                  </div>
                </div></Anim>
              ))}
            </div>
          : <div style={{ ...carte, fontSize: 13, fontWeight: 600, color: 'var(--o-text3)' }}>{tr('Prévision horaire indisponible pour cette entité.')}</div>
      ) : (
        (jours.length)
          ? <div className="grid-wxdays" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12 }}>
              {jours.map((f, i) => (
                <Anim key={i} i={i} base={140}><div style={{ ...carte, padding: '15px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Fi i={WX_ICON[modeDe(f)] || 'clouds'} size={19} color={WX_ICOLOR[modeDe(f)] || '#9fb4d6'} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{jour(f.datetime, i)}</div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--o-text3)' }}>{haWeatherLabel(String(f.condition))}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginTop: 11 }}>
                    <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--o-gold)' }}>{deg(n(f.temperature))}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--o-text3)' }}>
                      mini {deg(n(f.templow))}{f.precipitation != null ? ' · ' + (Math.round(f.precipitation * 10) / 10) + ' mm' : ''}
                    </span>
                  </div>
                </div></Anim>
              ))}
            </div>
          : <div style={{ ...carte, fontSize: 13, fontWeight: 600, color: 'var(--o-text3)' }}>{tr('Prévision journalière indisponible pour cette entité.')}</div>
      )}
    </div>
  );
}
