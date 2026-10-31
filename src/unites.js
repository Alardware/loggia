/* ── Lire la vraie unité, jamais la supposer ─────────────────────────────────
 *
 * Home Assistant convertit déjà une température ou une vitesse de vent dans
 * l'unité choisie par l'installation (°F aux États-Unis, mph, in...) : la
 * VALEUR qui arrive est donc toujours la bonne. Le bug n'était pas un chiffre
 * faux, c'était le code qui comparait ce chiffre à des seuils écrits en
 * Celsius ou qui collait "°C" à côté sans vérifier — un Américain lisait
 * « forte chaleur » à 2 °C parce que 35,6 °F avait franchi un seuil pensé
 * pour des degrés Celsius.
 *
 * Les seuils du code restent en Celsius et en km/h : plus simples à lire et
 * à comparer entre eux. C'est la VALEUR qui se convertit vers ce repère
 * commun avant toute comparaison, jamais l'inverse. */

/** Celsius ou Fahrenheit d'une entité de température, repli sur l'unité de
 * l'installation puis sur le Celsius — jamais une supposition silencieuse.
 * `temperature_unit` (entité `weather`) et `unit_of_measurement` (un capteur
 * ordinaire, ex. la température CPU) ne portent pas le même nom. */
export function uniteTemp(attrs, hass) {
  const u = (attrs && (attrs.temperature_unit || attrs.unit_of_measurement))
    || (hass && hass.config && hass.config.unit_system && hass.config.unit_system.temperature);
  /* Le kelvin (audit du 19/10) : une température en K se lisait comme des °C — 294 « Trop chaud ». Seule l'unité de l'ENTITÉ le dit ;
   * une installation n'est jamais réglée en kelvins. */
  return u === '°F' || u === 'F' ? 'F' : u === 'K' && attrs && attrs.unit_of_measurement === 'K' ? 'K' : 'C';
}

/** Le signe d'une unité de température : « °C », « °F », mais « K » — un kelvin n'a pas de degré (audit du 19/10). */
export const signeTemp = (u) => (u === 'K' ? 'K' : '°' + u);

export function versCelsius(valeur, unite) {
  if (valeur == null) return valeur;
  return unite === 'F' ? (valeur - 32) * 5 / 9 : unite === 'K' ? valeur - 273.15 : valeur;
}

export function deCelsius(valeur, unite) {
  if (valeur == null) return valeur;
  return unite === 'F' ? valeur * 9 / 5 + 32 : unite === 'K' ? valeur + 273.15 : valeur;
}

/** La moyenne de températures venues de capteurs DIFFÉRENTS, `[{ v, unite }]`
 * (`unite` : 'C' ou 'F', telle que `uniteTemp` la rend), redite dans
 * `uniteCible`. Chaque mesure passe par le Celsius AVANT l'addition :
 * additionner 21 (°C) et 70 (°F) ne veut rien dire. Une mesure absente ou
 * illisible (vide, « unknown », des espaces — `Number(' ')` vaudrait 0) ne
 * compte pas, et sans aucune mesure la réponse est `null` — jamais un zéro
 * inventé (ADR 0030). Audit du 03/10 : la salutation de l'Accueil faisait la
 * moyenne des nombres bruts, puis collait « °C » derrière. */
export function moyenneTemperatures(mesures, uniteCible = 'C') {
  const celsius = (mesures || [])
    .filter(m => m && m.v != null && String(m.v).trim() !== '' && Number.isFinite(Number(m.v)))
    .map(m => versCelsius(Number(m.v), m.unite));
  if (!celsius.length) return null;
  return deCelsius(celsius.reduce((s, x) => s + x, 0) / celsius.length, uniteCible);
}

/** km/h ou mph d'une entité `weather`. HA ne connaît que ces deux-là pour le vent. */
export function uniteVent(attrs) {
  const u = attrs && attrs.wind_speed_unit;
  return u === 'mph' ? 'mph' : 'km/h';
}

/* Un CAPTEUR de vent, lui, publie dans l'unité de son intégration (chantier
 * Capteurs, § 6) : des m/s, des nœuds, des pieds par seconde. Une unité absente
 * ou inconnue se lit en km/h, facteur 1, comme avant — mais la carte d'une mesure
 * ne la juge pas (`uniteVentConnue`, correction bis, point 11) : un Beaufort lu
 * en km/h, « 9 », serait « Calme » quand c'est une tempête. */
const VERS_KMH = { 'm/s': 3.6, mph: 1.609344, kn: 1.852, 'ft/s': 1.09728 };

/** Une unité de vent que la table sait ramener au km/h : km/h, m/s, mph, nœuds, pieds par seconde. */
export function uniteVentConnue(unite) {
  return unite === 'km/h' || Object.prototype.hasOwnProperty.call(VERS_KMH, unite);
}

export function versKmh(valeur, unite) {
  if (valeur == null) return valeur;
  return valeur * (VERS_KMH[unite] || 1);
}

/** L'inverse : des km/h redits dans l'unité du capteur (les chiffres sous la barre d'une carte). */
export function deKmh(valeur, unite) {
  if (valeur == null) return valeur;
  return valeur / (VERS_KMH[unite] || 1);
}

/* ── Le monoxyde de carbone : le ppm (G1-D6, 30/10 ; ADR 0300) ───────────────
 *
 * La table juge le monoxyde en ppm (`PALIERS.co`, confort.js), mais Home
 * Assistant accepte aussi des mg/m³, des µg/m³ (Airly) et des ppb : 300 µg/m³,
 * un air sain, se lisait « 300 ppm · Danger ». Comme pour la température, c'est
 * la VALEUR qui se ramène au ppm, à 25 °C et 1 atm (volume molaire 24,45 L,
 * masse molaire du CO 28,01 g/mol) : mg/m³ × 24,45 / 28,01 ≈ 0,873, µg/m³ mille
 * fois moins, ppb ÷ 1000. Une unité absente ou inconnue ne se devine PAS : rien
 * ne dit des ppm, et la mesure reste hors de la table. Le serveur lit la même
 * table (`unites.py`, `UNITES_CO`). */
const VERS_PPM_CO = { ppm: 1, ppb: 0.001, 'mg/m³': 24.45 / 28.01, 'µg/m³': 24.45 / 28010 };

/** L'unité d'un monoxyde, ramenée à son écriture de Home Assistant — « PPM », « ug/m3 », le mu grec (μ) au lieu du micro (µ) —,
 *  ou null si la table ne sait pas la convertir. */
export function uniteCo(unite) {
  if (unite == null) return null;
  const u = String(unite).trim().toLowerCase().replace(/μ/g, 'µ').replace(/^ug\//, 'µg/').replace(/\/m3$/, '/m³');
  return Object.prototype.hasOwnProperty.call(VERS_PPM_CO, u) ? u : null;
}

/** Une valeur de monoxyde, en ppm ; null dans une unité que la table ne connaît pas. */
export function versPpmCo(valeur, unite) {
  const u = uniteCo(unite);
  if (valeur == null || !u) return null;
  return valeur * VERS_PPM_CO[u];
}

/** L'inverse : des ppm redits dans l'unité du capteur (les chiffres sous la barre d'une carte). */
export function dePpmCo(valeur, unite) {
  const u = uniteCo(unite);
  if (valeur == null || !u) return null;
  return valeur / VERS_PPM_CO[u];
}

/* ── Puissance et énergie : le watt et le kilowattheure (audit du 03/10) ────
 *
 * Même principe que la température : l'affichage et les seuils de Loggia
 * comptent en WATTS pour une puissance et en kWh pour une énergie, et c'est
 * la VALEUR qui se ramène à ce repère, jamais l'inverse. Un compteur P1/DSMR
 * publie sa puissance en kW : 2,75 kW s'affichait « 3 W » sur la vue
 * Énergie, « ↓ 1 W » sur l'Accueil, les seuils « > 5 W » ne se franchissaient
 * jamais et le solaire ne paraissait jamais actif. La découverte (resolve.js)
 * choisit le capteur par sa seule `device_class`, et c'est juste : c'est à la
 * LECTURE de regarder l'unité.
 *
 * Une unité absente ou inconnue se lit TELLE QUELLE, facteur 1 — pas `null`.
 * C'est ce que Loggia faisait avant : un modèle (template) sans unité, ou qui
 * écrit « Watt », garde le chiffre que son propriétaire a choisi dans
 * Paramètres, au lieu d'un « — » qui le punirait d'un défaut qu'il n'a pas.
 * La règle du zéro (ADR 0030) porte sur la VALEUR : illisible, elle rend
 * `null`. La puissance apparente d'un Linky (VA) se lit comme des watts,
 * comme avant : le cos φ d'une maison en est proche, et la cacher priverait
 * du schéma les installations branchées sur la téléinformation.
 *
 * Les tables reprennent les unités que Home Assistant connaît
 * (UnitOfPower, UnitOfEnergy), calories comprises : 4,184 J, comme son
 * convertisseur — un réseau de chaleur publie en Gcal. */
const VERS_WATTS = { mW: 0.001, W: 1, kW: 1000, MW: 1e6, GW: 1e9, TW: 1e12, 'BTU/h': 0.29307107, VA: 1, kVA: 1000 };
const VERS_KWH = {
  mWh: 1e-6, Wh: 0.001, kWh: 1, MWh: 1000, GWh: 1e6, TWh: 1e9,
  J: 1 / 3.6e6, kJ: 1 / 3600, MJ: 1 / 3.6, GJ: 1000 / 3.6,
  cal: 4.184 / 3.6e6, kcal: 4.184 / 3600, Mcal: 4.184 / 3.6, Gcal: 4184 / 3.6,
};
/* Les unités écrites à la main : « KW », « kwh ». « mw » et « mwh » restent
 * ambigus (milli ou méga, un milliard d'écart) et ne se devinent pas. */
const VERS_WATTS_BAS = { w: 1, kw: 1000, va: 1, kva: 1000 };
const VERS_KWH_BAS = { wh: 0.001, kwh: 1 };

function facteur(table, bas, unite) {
  const u = unite == null ? '' : String(unite).trim();
  if (!u) return 1;
  if (Object.prototype.hasOwnProperty.call(table, u)) return table[u];
  const l = u.toLowerCase();
  return Object.prototype.hasOwnProperty.call(bas, l) ? bas[l] : 1;
}

/** Ce qui ramène l'unité d'une puissance au watt : 1000 pour des kW, 1 pour
 * une unité absente ou inconnue. Sert aussi à l'historique, qui arrive sans
 * ses attributs. */
export function facteurWatts(unite) { return facteur(VERS_WATTS, VERS_WATTS_BAS, unite); }

/** Ce qui ramène l'unité d'une énergie au kWh : 0,001 pour des Wh. */
export function facteurKwh(unite) { return facteur(VERS_KWH, VERS_KWH_BAS, unite); }

function lireEn(st, facteurDe) {
  if (!st || st.state == null) return null;
  const n = parseFloat(st.state);
  if (!isFinite(n)) return null;
  return n * facteurDe(st.attributes && st.attributes.unit_of_measurement);
}

/** La puissance d'une entité, en WATTS. `null` sans valeur lisible
 * (`unavailable`, `unknown`, texte, entité absente) : « — », jamais un zéro
 * inventé. Le signe reste : un compteur net passe sous zéro quand on exporte. */
export function wattsDe(st) { return lireEn(st, facteurWatts); }

/** L'énergie d'une entité, en kWh. Mêmes règles que `wattsDe`. */
export function kwhDe(st) { return lireEn(st, facteurKwh); }
