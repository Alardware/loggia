// Table des conditions meteo, extraite de wx3d.jsx pour qu'App.jsx puisse la
// lire SANS embarquer three.js. Valeurs copiees a l'identique : le HANDOFF
// les designe comme specification, elles ne se retouchent pas.
export const WX_PRESETS = {
  'clear-night':     { label: 'Clear, night',    cloud: 0.00, dark: 0.0, fog: 0.00, rain: 0, snow: 0, hail: 0, wind: 0.05, stars: 1.0, exc: 0, forceNight: true },
  'sunny':           { label: 'Sunny',           cloud: 0.04, dark: 0.0, fog: 0.00, rain: 0, snow: 0, hail: 0, wind: 0.08, stars: 0.0, exc: 0, forceDay: true },
  'partlycloudy':    { label: 'Partly cloudy',   cloud: 0.52, dark: 0.05, fog: 0.00, rain: 0, snow: 0, hail: 0, wind: 0.18, stars: 0.6, exc: 0 },
  'cloudy':          { label: 'Cloudy',          cloud: 0.88, dark: 0.32, fog: 0.04, rain: 0, snow: 0, hail: 0, wind: 0.14, stars: 0.0, exc: 0 },
  'fog':             { label: 'Fog',             cloud: 0.55, dark: 0.20, fog: 0.86, rain: 0, snow: 0, hail: 0, wind: 0.06, stars: 0.0, exc: 0 },
  'rainy':           { label: 'Rainy',           cloud: 0.86, dark: 0.38, fog: 0.10, rain: 0.42, snow: 0, hail: 0, wind: 0.22, stars: 0.0, exc: 0 },
  'pouring':         { label: 'Pouring',         cloud: 1.00, dark: 0.66, fog: 0.26, rain: 1.00, snow: 0, hail: 0, wind: 0.40, stars: 0.0, exc: 0 },
  'lightning':       { label: 'Lightning',       cloud: 0.95, dark: 0.72, fog: 0.10, rain: 0, snow: 0, hail: 0, wind: 0.30, stars: 0.0, exc: 0, strike: 1 },
  'lightning-rainy': { label: 'Lightning, rainy',cloud: 1.00, dark: 0.75, fog: 0.20, rain: 0.85, snow: 0, hail: 0, wind: 0.45, stars: 0.0, exc: 0, strike: 1.2 },
  'hail':            { label: 'Hail',            cloud: 0.96, dark: 0.58, fog: 0.16, rain: 0.20, snow: 0, hail: 0.90, wind: 0.34, stars: 0.0, exc: 0 },
  'snowy':           { label: 'Snowy',           cloud: 0.92, dark: 0.26, fog: 0.30, rain: 0, snow: 0.95, hail: 0, wind: 0.16, stars: 0.0, exc: 0 },
  'snowy-rainy':     { label: 'Snowy, rainy',    cloud: 0.94, dark: 0.40, fog: 0.28, rain: 0.45, snow: 0.60, hail: 0, wind: 0.24, stars: 0.0, exc: 0 },
  'windy':           { label: 'Windy',           cloud: 0.10, dark: 0.05, fog: 0.00, rain: 0, snow: 0, hail: 0, wind: 0.85, stars: 0.7, exc: 0 },
  'windy-variant':   { label: 'Windy, cloudy',   cloud: 0.80, dark: 0.30, fog: 0.05, rain: 0, snow: 0, hail: 0, wind: 0.95, stars: 0.0, exc: 0 },
  'exceptional':     { label: 'Exceptional',     cloud: 0.62, dark: 0.55, fog: 0.22, rain: 0, snow: 0, hail: 0, wind: 0.55, stars: 0.0, exc: 0.85 },
};
