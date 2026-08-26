/**
 * Utilitaires meteo : table d'icones, libelles francais, entite meteo.
 *
 * Partages entre l'Accueil et la vue Meteo chargee a la demande. Extraits
 * de App.jsx pour qu'un morceau differe n'ait pas a le reimporter.
 */
import wxClearDay from '@bybas/weather-icons/production/fill/all/clear-day.svg';
import wxClearNight from '@bybas/weather-icons/production/fill/all/clear-night.svg';
import wxPartly from '@bybas/weather-icons/production/fill/all/partly-cloudy-day.svg';
import wxCloudy from '@bybas/weather-icons/production/fill/all/cloudy.svg';
import wxRain from '@bybas/weather-icons/production/fill/all/rain.svg';
import wxSnow from '@bybas/weather-icons/production/fill/all/snow.svg';
import wxStorm from '@bybas/weather-icons/production/fill/all/thunderstorms.svg';
import wxWind from '@bybas/weather-icons/production/fill/all/wind.svg';
import { loggiaEnt, LOGGIA_RESOLVED } from './state.js';
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

// Mode météo → icône Flaticon (condition-aware, comme V1)
export const WX_ICON = { sun: 'sun', partly: 'cloud-sun', clouds: 'clouds', wind: 'wind', rain: 'cloud-showers-heavy', snow: 'cloud-snow', storm: 'thunderstorm', night: 'moon-stars' };

export const WX_ICOLOR = { sun: 'var(--o-gold)', partly: '#9fb4d6', clouds: '#9fb4d6', wind: '#9fb4d6', rain: 'var(--o-accent-soft)', snow: '#bcd6f0', storm: 'var(--o-purple)', night: '#aeb9e0' };

// Icônes météo Meteocons (basmilius) animées via <object> (les animations CSS du SVG tournent).
const WX_METEO = { sun: wxClearDay, partly: wxPartly, clouds: wxCloudy, wind: wxWind, rain: wxRain, snow: wxSnow, storm: wxStorm, night: wxClearNight };

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
  const m = { 'clear-night': 'Nuit claire', sunny: 'Ensoleillé', partlycloudy: 'Partiellement nuageux', cloudy: 'Nuageux', rainy: tr('Pluie'), pouring: 'Forte pluie', snowy: 'Neige', 'snowy-rainy': 'Neige fondue', fog: 'Brouillard', windy: 'Venteux', 'windy-variant': 'Venteux', hail: 'Grêle', lightning: 'Orage', 'lightning-rainy': 'Orage', exceptional: 'Exceptionnel' };
  return m[(cond || '').toLowerCase()] || 'Nuageux';
}
