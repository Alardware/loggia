/**
 * Utilitaires meteo : table d'icones, libelles francais, entite meteo.
 *
 * Partages entre l'Accueil et la vue Meteo chargee a la demande. Extraits
 * de App.jsx pour qu'un morceau differe n'ait pas a le reimporter.
 */
/* Meteocons, la serie COMPLETE fournie le 02/09 (www/weather_icons) : les
 * memes dessins que le paquet npm, mais dans leur version d'origine — six
 * animations sur la pluie la ou la version optimisee n'en gardait qu'une, et
 * huit conditions de plus (brouillard, grele, gresil, tornade, aube,
 * crepuscule, pluie d'orage, pluie battante). Embarquees dans le bundle
 * plutot que servies depuis  : la demo et une installation neuve les
 * ont aussi. */
import wxClearDay from './assets/wx/clear-day.svg';
import wxClearNight from './assets/wx/clear-night.svg';
import wxPartly from './assets/wx/partly-cloudy-day.svg';
import wxPartlyNight from './assets/wx/partly-cloudy-night.svg';
import wxCloudy from './assets/wx/cloudy.svg';
import wxRain from './assets/wx/rain.svg';
import wxRainFort from './assets/wx/extreme-rain.svg';
import wxSnow from './assets/wx/snow.svg';
import wxSleet from './assets/wx/sleet.svg';
import wxHail from './assets/wx/hail.svg';
import wxStorm from './assets/wx/thunderstorms.svg';
import wxStormRain from './assets/wx/thunderstorms-rain.svg';
import wxWind from './assets/wx/wind.svg';
import wxFog from './assets/wx/fog.svg';
import wxTornado from './assets/wx/tornado.svg';
import wxAube from './assets/wx/sunrise.svg';
import wxCrepuscule from './assets/wx/sunset.svg';
import { loggiaEnt, LOGGIA_RESOLVED } from './state.js';
import { REDUCE_MOTION } from './ui.jsx';
import { tr, trHA } from './i18n.js';

// Entité météo : le choix de l'utilisateur, sinon celle qu'a retenue la
// résolution, sinon la première du domaine `weather`. Null si l'installation
// n'en déclare aucune.
export function weatherEntity(hass) {
  const S = (hass && hass.states) || null;
  const c = loggiaEnt('weather', null);
  const pick = Array.isArray(c) ? c.find(id => typeof id === 'string' && id.indexOf('weather.') === 0)
    : (typeof c === 'string' && c.indexOf('weather.') === 0) ? c : null;
  if (pick && (!S || S[pick])) return pick;
  const r = LOGGIA_RESOLVED && LOGGIA_RESOLVED.weather;
  if (r && r.available && (!S || S[r.main])) return r.main;
  if (S) return Object.keys(S).find(id => id.indexOf('weather.') === 0) || null;
  return null;
}

/* Les glyphes de police (, ) ont disparu le 02/09 : toute
 * condition meteo du dashboard passe desormais par , donc par les
 * Meteocons animees. Deux jeux d'icones pour la meme chose, c'etait un doublon
 * qui finissait par se voir. */

// Icônes météo Meteocons (basmilius) animées via <object> (les animations CSS du SVG tournent).
const WX_METEO = {
  sun: wxClearDay, partly: wxPartly, partlynight: wxPartlyNight, clouds: wxCloudy, wind: wxWind,
  rain: wxRain, pluieforte: wxRainFort, snow: wxSnow, gresil: wxSleet, grele: wxHail,
  storm: wxStorm, storrain: wxStormRain, night: wxClearNight, brouillard: wxFog, tornade: wxTornado,
  aube: wxAube, crepuscule: wxCrepuscule,
};

export function WeatherIco({ wx, size = 42 }) {
  return <object type="image/svg+xml" data={WX_METEO[wx] || wxCloudy} width={size} height={size} tabIndex={-1} aria-label={tr('météo')} style={{ pointerEvents: 'none', display: 'block' }} />;
}

// Mappe une condition météo HA → mode d'effet WeatherFx (suit l'entité).
export function haWeatherMode(cond, isNight) {
  cond = (cond || '').toLowerCase();
  if (/pour|rain/.test(cond)) return 'rain';
  if (/snow|hail/.test(cond)) return 'snow';
  if (/lightn|thunder|storm/.test(cond)) return 'storm';
  if (/wind/.test(cond)) return 'wind';
  if (isNight) return 'night';
  if (/sunny|clear/.test(cond)) return 'sun';
  if (/partl/.test(cond)) return 'partly';
  return 'clouds';
}

export function haWeatherLabel(cond) {
  /* Home Assistant nomme deja ces etats, dans ses 64 langues : `partlycloudy`
   * devient « Partiellement nuageux », « Teilweise bewolkt », « Parcialmente
   * nublado ». La table francaise ci-dessous ne sert que s'il ne repond pas. */
  const viaHA = trHA('component.weather.entity_component._.state.' + String(cond || '').toLowerCase());
  if (viaHA) return viaHA;
  const m = { 'clear-night': tr('Nuit claire'), sunny: tr('Ensoleillé'), partlycloudy: tr('Partiellement nuageux'), cloudy: tr('Nuageux'), rainy: tr('Pluie'), pouring: tr('Forte pluie'), snowy: tr('Neige'), 'snowy-rainy': tr('Neige fondue'), fog: tr('Brouillard'), windy: tr('Venteux'), 'windy-variant': tr('Venteux'), hail: tr('Grêle'), lightning: tr('Orage'), 'lightning-rainy': tr('Orage'), exceptional: tr('Exceptionnel') };
  /* Une condition inconnue n'est pas « Nuageux » : c'est une condition inconnue.
   * Le repli annoncait un ciel couvert alors qu'on ne savait rien du temps.
   * Les appelants savent deja se passer de reponse — ils affichent « — ». */
  return m[(cond || '').toLowerCase()] || null;
}

export const WX_BG = {
  sun: 'linear-gradient(150deg, rgba(56,150,255,.42), rgba(130,205,255,.14) 55%, var(--o-surfB))',
  partly: 'linear-gradient(150deg, rgba(86,150,210,.32), rgba(150,175,205,.12) 60%, var(--o-surfB))',
  clouds: 'linear-gradient(150deg, rgba(140,160,190,.24), var(--o-surfB))',
  wind: 'linear-gradient(150deg, rgba(150,170,195,.22), var(--o-surfB))',
  rain: 'linear-gradient(150deg, rgba(70,105,150,.40), rgba(90,120,160,.12) 60%, var(--o-surfB))',
  snow: 'linear-gradient(150deg, rgba(195,215,240,.36), var(--o-surfB))',
  storm: 'linear-gradient(150deg, rgba(118,98,185,.38), rgba(70,60,110,.14) 60%, var(--o-surfB))',
  night: 'linear-gradient(150deg, rgba(44,66,130,.42), rgba(20,30,60,.15) 60%, var(--o-surfB))',
};
/* Mini-scene animee de la vignette meteo (accueil) : la condition se VOIT —
 * pluie qui tombe, etoiles, halo de soleil, eclair — dans la vignette meme,
 * derriere le chiffre. Une poignee de spans en transform/opacity, rien
 * d'autre ; l'interrupteur « Effets meteo animes » et prefers-reduced-motion
 * la coupent net. Idee reprise du Weather Showcase de GlassHome. */
export function WxMini({ wx, on }) {
  if (!on || REDUCE_MOTION) return null;
  const S = { position: 'absolute', pointerEvents: 'none' };
  const gouttes = (n, couleur, epais) => Array.from({ length: n }, (_, i) => (
    <span key={i} style={{ ...S, top: -6, left: (8 + i * 23) % 140, width: epais, height: 9, borderRadius: 4, background: couleur, animation: `o-wxm-fall ${1.1 + (i % 3) * .35}s linear ${i * .28}s infinite` }} />
  ));
  let scene = null;
  if (wx === 'rain') scene = gouttes(6, 'rgba(160,200,255,.75)', 1.5);
  else if (wx === 'storm') scene = (<>
    {gouttes(4, 'rgba(180,170,255,.7)', 1.5)}
    <span style={{ ...S, inset: 0, background: 'radial-gradient(80% 90% at 60% 0%, rgba(210,200,255,.9), rgba(210,200,255,0) 70%)', animation: 'o-wxm-flash 5.2s linear infinite' }} />
  </>);
  else if (wx === 'snow') scene = Array.from({ length: 6 }, (_, i) => (
    <span key={i} style={{ ...S, top: -6, left: (12 + i * 22) % 140, width: 3.5, height: 3.5, borderRadius: '50%', background: 'rgba(240,248,255,.9)', animation: `o-wxm-snow ${2.6 + (i % 3) * .7}s linear ${i * .5}s infinite` }} />
  ));
  else if (wx === 'sun') scene = <span style={{ ...S, top: -14, left: -10, width: 66, height: 66, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,205,100,.55), rgba(255,205,100,0) 68%)', animation: 'o-wxm-glow 3.6s ease-in-out infinite' }} />;
  else if (wx === 'night') scene = Array.from({ length: 5 }, (_, i) => (
    <span key={i} style={{ ...S, top: 5 + (i * 13) % 34, left: (10 + i * 31) % 145, width: 2.5, height: 2.5, borderRadius: '50%', background: '#dfe9ff', boxShadow: '0 0 5px rgba(200,220,255,.9)', animation: `o-wxm-twinkle ${2 + (i % 3) * .8}s ease-in-out ${i * .55}s infinite` }} />
  ));
  else if (wx === 'wind') scene = Array.from({ length: 3 }, (_, i) => (
    <span key={i} style={{ ...S, top: 12 + i * 15, left: 0, width: 26, height: 1.5, borderRadius: 4, background: 'rgba(190,210,235,.6)', animation: `o-wxm-wind ${2.2 + i * .5}s linear ${i * .7}s infinite` }} />
  ));
  else if (wx === 'partly' || wx === 'clouds') scene = Array.from({ length: 2 }, (_, i) => (
    <span key={i} style={{ ...S, top: 8 + i * 22, left: -20, width: 34, height: 11, borderRadius: 10, background: `rgba(200,215,235,${.18 - i * .06})`, filter: 'blur(1.5px)', animation: `o-wxm-drift ${17 + i * 8}s linear ${-i * 9}s infinite` }} />
  ));
  if (!scene) return null;
  return <span aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 14 }}>{scene}</span>;
}
