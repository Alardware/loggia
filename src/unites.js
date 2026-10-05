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
  return u === '°F' || u === 'F' ? 'F' : 'C';
}

export function versCelsius(valeur, unite) {
  if (valeur == null) return valeur;
  return unite === 'F' ? (valeur - 32) * 5 / 9 : valeur;
}

export function deCelsius(valeur, unite) {
  if (valeur == null) return valeur;
  return unite === 'F' ? valeur * 9 / 5 + 32 : valeur;
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

export function versKmh(valeur, unite) {
  if (valeur == null) return valeur;
  return unite === 'mph' ? valeur * 1.609344 : valeur;
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
