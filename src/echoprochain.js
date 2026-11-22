/* ── Le prochain réveil, minuteur et rappel d'une Echo (chantier du 20/11, P4 ; ADR 0382) ──
 *
 * Pur, chargé avec la fiche d'un lecteur. Les intégrations Alexa publient,
 * sur l'APPAREIL de l'enceinte, un capteur horodaté par sorte : la clé de
 * traduction le dit (`next_alarm` de l'intégration officielle, `alarm` de la
 * jumelle HACS ; de même pour `timer` et `reminder` — les clés que
 * `CLES_ECHO`, resolve.js, lisait déjà pour reconnaître une vraie Echo).
 * Jamais par le nom de l'entité. Une sorte sans date à venir ne dit rien :
 * « Réveil demain 06:45 · Minuteur 4 min · Rappel 18:00 ».
 */
import { tr, locale } from './i18n.js';

const SORTES = { next_alarm: 'reveil', alarm: 'reveil', next_timer: 'minuteur', timer: 'minuteur', next_reminder: 'rappel', reminder: 'rappel' };
const ORDRE = ['reveil', 'minuteur', 'rappel'];
const JOUR_MS = 86400000;

/** Le plus proche à venir de chaque sorte : `[{ sorte, t }]`, réveil d'abord. `cleDe(id)` : la clé de traduction de l'entité. */
export function prochainsEcho(ids, S, cleDe, maintenant = Date.now()) {
  const plus = {};
  (Array.isArray(ids) ? ids : []).forEach((id) => {
    if (String(id).indexOf('sensor.') !== 0) return;
    const sorte = SORTES[cleDe(id)];
    const st = S && S[id];
    const t = sorte && st ? Date.parse(st.state) : NaN;
    if (!Number.isFinite(t) || t <= maintenant) return;
    if (!plus[sorte] || t < plus[sorte]) plus[sorte] = t;
  });
  return ORDRE.filter(s => plus[s]).map(s => ({ sorte: s, t: plus[s] }));
}

const minuit = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** Ce qu'en dit la fiche : « Réveil demain 06:45 », « Minuteur 4 min », « Rappel jeu. 18:00 ». */
export function texteProchain(p, maintenant = Date.now()) {
  if (p.sorte === 'minuteur') {
    const s = Math.ceil((p.t - maintenant) / 1000);
    return tr('Minuteur {d}', { d: s < 60 ? tr('{n} s', { n: s }) : tr('{n} min', { n: Math.ceil(s / 60) }) });
  }
  const h = new Date(p.t).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  const jours = Math.round((minuit(p.t) - minuit(maintenant)) / JOUR_MS);
  const j = jours < 7 ? new Date(p.t).toLocaleDateString(locale(), { weekday: 'short' }) : new Date(p.t).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
  if (p.sorte === 'reveil') return jours === 0 ? tr('Réveil {h}', { h }) : jours === 1 ? tr('Réveil demain {h}', { h }) : tr('Réveil {j} {h}', { j, h });
  return jours === 0 ? tr('Rappel {h}', { h }) : jours === 1 ? tr('Rappel demain {h}', { h }) : tr('Rappel {j} {h}', { j, h });
}
