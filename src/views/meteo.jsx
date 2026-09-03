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
import { WeatherIco, haWeatherMode, haWeatherLabel, weatherEntity } from '../wxutil.jsx';
import { tr } from '../i18n.js';
import WeatherEffects from '../wxeffects.jsx';

/* Carte d'un JOUR de la semaine : sa propre animation en fond — pluie qui
 * tombe, etoiles, halo — et le degrade de sa condition. C'est la demande du
 * 02/09 : « mes cartes, mais avec leur animation correspondante ». */
function WxJour({ f, nom, mode, effets, deg, n }) {
  const mx = n(f.temperature), mn = n(f.templow);
  const pluie = n(f.precipitation);
  const proba = n(f.precipitation_probability);
  /* UN SEUL fond. La carte portait son propre dégradé — bleu en haut, presque
   * noir en bas — et la scène posait le sien par-dessus en se dissolvant : les
   * deux se croisaient en un bas de carte tout noir, qu'on prenait pour une
   * ombre (retour 03/09). La scène fait le ciel, la carte la surface. */
  return (
    <div style={{ position: 'relative', overflow: 'hidden', height: 168, borderRadius: 'var(--o-radius,20px)', border: 'none', background: 'var(--o-surfA)', padding: '15px 16px', display: 'flex', flexDirection: 'column' }}>
      {/* `offsetY` pousse les ornements sous le titre : les nuages de la
        * maquette, dessinés pour un grand panneau, tombaient sinon en plein
        * sur le nom du jour. L'ombre de texte fait le reste — un nuage blanc
        * qui dérive passera toujours quelque part. */}
      {effets && <WeatherEffects weather={mode} k={0.52} fadeStart={100} densite={0.55} offsetY={30} />}
      {/* Pas d'icône : la scène du fond dessine déjà le temps qu'il fera, et
        * les deux côte à côte faisaient doublon (retour 02/09). */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '.04em', color: '#fff', textShadow: '0 1px 3px rgba(6,14,30,.85), 0 2px 12px rgba(6,14,30,.5)' }}>{nom}</span>
      </div>
      <div style={{ position: 'relative', fontSize: 11.5, fontWeight: 700, color: 'rgba(255,255,255,.92)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textShadow: '0 1px 3px rgba(6,14,30,.85)' }}>{haWeatherLabel(String(f.condition))}</div>
      <div style={{ position: 'relative', marginTop: 'auto', display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1, color: '#fff', textShadow: '0 2px 4px rgba(6,14,30,.8), 0 4px 16px rgba(6,14,30,.45)' }}>{deg(mx)}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,.78)', textShadow: '0 1px 3px rgba(6,14,30,.8)' }}>{deg(mn)}</span>
      </div>
      {(pluie != null || proba != null) && (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, marginTop: 7, fontSize: 11.5, fontWeight: 800, color: '#dff1ff', textShadow: '0 1px 3px rgba(6,14,30,.8)' }}>
          <Fi i="raindrops" size={12} color="#dff1ff" />
          {proba != null ? Math.round(proba) + ' %' : ''}{(proba != null && pluie) ? ' · ' : ''}{pluie ? (Math.round(pluie * 10) / 10) + ' mm' : ''}
        </div>
      )}
    </div>
  );
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
  const uv = n(wa.uv_index);
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
                        <div style={{ margin: '3px 0 2px', display: 'flex', justifyContent: 'center' }}><WeatherIco wx={modeDe(f)} size={30} /></div>
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

      </div>
    </>
  );
}
