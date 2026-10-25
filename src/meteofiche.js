/* ── Ce que la fiche météo seule calcule (sa maquette « Cartes météo », cadre 1b, 20/10) ──
 *
 * La semaine en barres, les six tuiles, les risques, et les mots du vent, des
 * nuages et de l'UV. Chargé avec la fiche, jamais au démarrage : le widget du
 * rail n'en a pas besoin (meteo.js porte sa part). Pur, testé à sec
 * (tests/meteo_fiche.test.mjs). Rien ne s'invente : sans prévision, pas de
 * semaine ; sans attribut, pas de tuile. */
import { tr } from './i18n.js';
import { degres, modeMeteo, soleilMeteo, memeJourQue, lectureDate, nombreOuNull, heureRonde, jourCourt, mmArrondi, aVenir, pleut } from './meteo.js';

const neige = (p) => /snow/.test(String(p.condition || ''));

/* La semaine : sept jours au plus, à partir d'aujourd'hui, chacun une barre
 * entre son minimum et son maximum sur l'ÉCHELLE DE LA SEMAINE (le plus froid
 * des minimums, le plus chaud des maximums). Aujourd'hui porte le repère de la
 * température du moment. La probabilité de pluie s'écrit dès 20 %. */
export function semaineMeteo(jours, temperature, maintenant, soleil = null) {
  const J = (jours || []).map(p => ({ p, t: lectureDate(p) })).filter(x => !isNaN(x.t) && (memeJourQue(x.t, maintenant) || x.t > maintenant)).sort((a, b) => a.t - b.t).slice(0, 7);
  if (J.length < 2) return [];
  const maxs = J.map(x => nombreOuNull(x.p.temperature)).filter(v => v != null);
  const mins = J.map(x => nombreOuNull(x.p.templow)).filter(v => v != null);
  const bas = Math.min(...mins, ...maxs), haut = Math.max(...maxs, ...mins);
  const etendue = haut - bas || 1;
  const pc = (v) => Math.max(0, Math.min(1, (v - bas) / etendue));
  const temp = nombreOuNull(temperature);
  return J.map((x, i) => {
    const mx = nombreOuNull(x.p.temperature), mn = nombreOuNull(x.p.templow);
    const proba = nombreOuNull(x.p.precipitation_probability);
    const auj = i === 0 && memeJourQue(x.t, maintenant);
    return {
      cle: x.p.datetime, libelle: auj ? tr('Auj.') : jourCourt(x.t), mode: modeMeteo(x.p.condition, false),
      min: degres(mn), max: degres(mx), pluie: proba != null && proba >= 20 ? Math.round(proba) + ' %' : null,
      gauche: mn != null && mx != null ? pc(mn) : null, largeur: mn != null && mx != null ? pc(mx) - pc(mn) : null,
      maintenant: auj && temp != null ? pc(temp) : null,
    };
  });
}

export const motVent = (k) => (k < 6 ? tr('très léger') : k < 20 ? tr('léger') : k < 39 ? tr('modéré') : k < 50 ? tr('assez fort') : k < 62 ? tr('fort') : tr('très fort'));
export const motNuages = (c) => (c <= 10 ? tr('Ciel clair') : c < 40 ? tr('Peu nuageux') : c < 70 ? tr('Nuageux') : tr('Couvert'));
/* L'échelle UV de l'OMS : faible 0-2, modéré 3-5, élevé 6-7, très élevé 8-10, extrême 11+. */
export const zoneUV = (uv) => (uv <= 2 ? 0 : uv <= 5 ? 1 : uv <= 7 ? 2 : uv <= 10 ? 3 : 4);
const MOTS_UV = () => [tr('Faible'), tr('Modéré'), tr('Élevé'), tr('Très élevé'), tr('Extrême')];
const DIRECTIONS = () => [tr('Du nord'), tr('Du nord-est'), tr('De l’est'), tr('Du sud-est'), tr('Du sud'), tr('Du sud-ouest'), tr('De l’ouest'), tr('Du nord-ouest')];

/* Les six tuiles de la popup — vent, humidité, UV, nuages, pluie du jour,
 * soleil — chacune seulement si l'entité la donne. La flèche du vent pointe
 * là où il va (bearing + 180). La pluie du jour dit ses heures quand la
 * prévision horaire les connaît. */
export function tuilesMeteo({ attributs = {}, jours = null, heures = null, maintenant = Date.now(), soleil = null } = {}) {
  const a = attributs || {};
  const out = [];
  const vent = nombreOuNull(a.wind_speed);
  if (vent != null) {
    const dir = nombreOuNull(a.wind_bearing);
    const k = Math.round(vent);
    const mots = dir != null ? DIRECTIONS()[Math.round(dir / 45) % 8] + ' · ' + motVent(k) : motVent(k);
    out.push({ cle: 'vent', titre: tr('Vent'), valeur: k + ' ' + (a.wind_speed_unit || 'km/h'), sous: mots, fleche: dir != null ? (dir + 180) % 360 : null });
  }
  const hum = nombreOuNull(a.humidity);
  if (hum != null) out.push({ cle: 'humidite', titre: tr('Humidité'), valeur: Math.round(hum) + ' %', sous: null });
  const uv = nombreOuNull(a.uv_index);
  if (uv != null) { const z = zoneUV(uv); out.push({ cle: 'uv', titre: tr('UV'), valeur: String(Math.round(uv * 10) / 10), sous: MOTS_UV()[z], uv: { zone: z, position: Math.min(1, (uv + 0.5) / 13) } }); }
  const nuages = nombreOuNull(a.cloud_coverage);
  if (nuages != null) out.push({ cle: 'nuages', titre: tr('Nuages'), valeur: Math.round(nuages) + ' %', sous: motNuages(nuages) });
  const auj = (jours || []).find(p => { const t = lectureDate(p); return !isNaN(t) && memeJourQue(t, maintenant); });
  const cumul = auj ? nombreOuNull(auj.precipitation) : null;
  if (cumul != null) {
    const hp = aVenir(heures, maintenant).filter(x => memeJourQue(x.t, maintenant) && pleut(x.p));
    const sous = !hp.length ? (cumul > 0 ? tr('Dans la journée') : tr('Aucune prévue')) : tr('Surtout de {a} à {b}', { a: heureRonde(hp[0].t), b: heureRonde(hp[hp.length - 1].t + 3600000) });
    out.push({ cle: 'pluie', titre: tr('Pluie aujourd’hui'), valeur: mmArrondi(cumul) + ' ' + (a.precipitation_unit || 'mm'), sous });
  }
  const s = soleilMeteo(maintenant, soleil);
  if (s) out.push({ cle: 'soleil', titre: tr('Soleil'), valeur: s.heure, sous: s.jour ? tr('Coucher · lever à {h}', { h: s.autre }) : tr('Lever · coucher à {h}', { h: s.autre }) });
  return out;
}

/* Les risques sur les prochaines heures : la plus forte probabilité de pluie
 * et de neige, et le gel — la part des heures à 0° ou moins. Sans
 * probabilité ni température, rien. */
export function risquesMeteo(heures, maintenant = Date.now()) {
  const H = aVenir(heures, maintenant).slice(0, 12);
  const probas = H.map(x => nombreOuNull(x.p.precipitation_probability)).filter(v => v != null);
  const temps = H.map(x => nombreOuNull(x.p.temperature)).filter(v => v != null);
  if (!probas.length && !temps.length) return [];
  const max = (l) => (l.length ? Math.max(0, Math.min(100, Math.round(Math.max(...l)))) : 0);
  const pluie = max(H.filter(x => !neige(x.p)).map(x => nombreOuNull(x.p.precipitation_probability)).filter(v => v != null));
  const neigeP = max(H.filter(x => neige(x.p)).map(x => nombreOuNull(x.p.precipitation_probability)).filter(v => v != null));
  const gel = temps.length ? Math.round(100 * temps.filter(v => 0 >= v).length / temps.length) : 0;
  return [{ cle: 'pluie', titre: tr('Pluie'), valeur: pluie }, { cle: 'neige', titre: tr('Neige'), valeur: neigeP }, { cle: 'gel', titre: tr('Gel'), valeur: gel }];
}

