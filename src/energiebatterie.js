/* ── La batterie de la maison : sa puissance, son niveau, son autonomie (chantier G3, E1 et E6 ; ADR 0302) ──
 *
 * Lu par la vue Énergie seule (chargée à la demande, ADR 0274) : le démarrage
 * n'en porte rien. Les conventions de signe sont dites dans `energieparts.js`.
 */
import { tr } from './i18n.js';
import { idsDe, sommeLue, fini } from './energieparts.js';

/**
 * La puissance de la batterie de la maison, AU SENS DE LOGGIA : positive en
 * charge, négative quand elle rend à la maison.
 *
 * Dans l'ordre : `batNow`, déjà au sens de Loggia (la fiche, ou un voisin de
 * l'ancien chemin) ; la somme des `stat_rate` de Home Assistant, inversée ;
 * la différence des deux sens (`power_config`, deux capteurs toujours
 * positifs). `null` quand rien ne se lit.
 */
export function puissanceBatterie(EN, lire) {
  const E = EN || {};
  /* Les deux conventions se SOMMENT (relecture du 30/10, point 4) : une
   * batterie « inversée » (au sens de Loggia) et une autre au sens de Home
   * Assistant dans la même maison. La fiche, elle, vide la famille entière :
   * elle ne s'ajoute jamais à ce que le tableau déclare. */
  const directe = sommeLue(idsDe(E, 'batNow'), lire);
  const ha = sommeLue(idsDe(E, 'batRate'), lire);
  if (directe != null || ha != null) { const w = (directe || 0) - (ha || 0); return w === 0 ? 0 : w; }
  const c = sommeLue(idsDe(E, 'batChargeNow'), lire);
  const d = sommeLue(idsDe(E, 'batDechargeNow'), lire);
  if (c == null && d == null) return null;
  return Math.max(0, c || 0) - Math.max(0, d || 0);
}

/** Toutes les capacités connues (kWh) : leur somme ; une seule inconnue et l'on ne sait pas. */
function capacites(batteries) {
  const liste = Array.isArray(batteries) ? batteries : [];
  if (!liste.length || liste.some(b => !b || !(fini(b.capacite) > 0))) return null;
  return liste;
}

/**
 * Le niveau de charge de la maison, en %. Plusieurs batteries dont la
 * capacité est connue : la moyenne PONDÉRÉE par la capacité — une batterie de
 * 5 kWh vide ne vaut pas la moitié d'une maison de 15 kWh. Sinon la moyenne de
 * ce qui se lit.
 */
export function niveauBatterie({ EN = {}, batteries = [], lire }) {
  const avec = capacites(batteries);
  if (avec) {
    let e = 0, c = 0;
    for (const b of avec) {
      const s = fini(lire(b.soc));
      if (s == null) { e = null; break; }
      e += s * b.capacite; c += b.capacite;
    }
    if (e != null && c > 0) return e / c;
  }
  const lus = idsDe(EN, 'batSoc').map(id => fini(lire(id))).filter(v => v != null);
  return lus.length ? lus.reduce((a, b) => a + b, 0) / lus.length : null;
}

/** Ce que les batteries tiennent encore, en kWh : niveau × capacité, quand TOUTES les capacités sont connues. */
export function reserveBatterieKwh({ batteries = [], lire }) {
  const avec = capacites(batteries);
  if (!avec) return null;
  let kwh = 0;
  for (const b of avec) {
    const s = fini(lire(b.soc));
    if (s == null) return null;
    kwh += Math.max(0, Math.min(100, s)) / 100 * b.capacite;
  }
  return kwh;
}

/* En dessous, la consommation n'est que du bruit de mesure : une durée tirée de là n'aurait pas de sens. */
const CONSO_MIN_W = 50;

/**
 * Ce que la MAISON consomme, pour l'autonomie (relecture du 30/10, point 2).
 * La consommation de la vue se déduit du réseau et du soleil : elle oublie ce
 * que la batterie REND (le soir, 50 W de réseau pour 850 W de maison) et compte
 * ce qui la CHARGE. La maison, c'est cette consommation moins la puissance de
 * la batterie (positive en charge). Un capteur de la maison (`mesuree`) fait
 * foi tel quel. `null` sous 50 W, ou sans rien de lisible.
 */
export function consoPourAutonomie({ consoW = null, batW = null, mesuree = false } = {}) {
  const c = fini(consoW);
  if (c == null) return null;
  const w = mesuree ? c : c - (fini(batW) || 0);
  return w >= CONSO_MIN_W ? w : null;
}

/** L'autonomie, en heures : ce que la batterie tient ÷ ce que la maison consomme. `null` sans réserve ou sans consommation. */
export function autonomieBatterie({ reserveKwh = null, consoW = null } = {}) {
  const r = fini(reserveKwh), w = fini(consoW);
  if (r == null || w == null || w <= 0) return null;
  return r * 1000 / w;
}

/** « ≈ 3 h de réserve » : en minutes sous l'heure, en heures sous deux jours, en jours au-delà. */
export function texteAutonomie(h) {
  const v = fini(h);
  if (v == null || v < 0) return null;
  let duree;
  if (v < 1) duree = tr('{n} min', { n: Math.max(10, Math.round(v * 6) * 10) });
  else if (v < 48) duree = tr('{n} h', { n: Math.round(v) });
  else duree = tr('{n} j', { n: Math.round(v / 24) });
  return tr('≈ {d} de réserve', { d: duree });
}
