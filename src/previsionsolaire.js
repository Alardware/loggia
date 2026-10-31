/* ── La production solaire prévue (chantier G3, E7 ; ADR 0302) ───────────────
 *
 * Forecast.Solar et Solcast ne publient pas leur prévision dans un capteur que
 * le tableau Énergie connaîtrait : on les RATTACHE à un onduleur
 * (`config_entry_solar_forecast`), et Home Assistant sert la prévision par une
 * commande à lui, `energy/solar_forecast` — la même que son propre tableau
 * Énergie. Elle répond, pour chaque entrée : `{ wh_hours: { instant ISO: Wh } }`.
 *
 * On n'en garde que deux chiffres : ce qui est prévu AUJOURD'HUI et DEMAIN, en
 * kWh, au jour de l'écran. Rien n'est relu sans entrée rattachée : une maison
 * sans prévision n'envoie pas la commande.
 *
 * La vue Énergie seule s'en sert (elle se charge à la demande, ADR 0274).
 */
import { useEffect, useRef, useState } from 'react';

const jourDe = (d) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();

/** `{ aujourdhui, demain }` en kWh — chacun `null` quand rien ne le prévoit. Seules les entrées rattachées comptent. */
export function totauxPrevision(reponse, entrees, maintenant = Date.now()) {
  const vide = { aujourdhui: null, demain: null };
  if (!reponse || typeof reponse !== 'object' || !Array.isArray(entrees) || !entrees.length) return vide;
  const ici = new Date(maintenant);
  const auj = jourDe(ici);
  const lendemain = jourDe(new Date(ici.getFullYear(), ici.getMonth(), ici.getDate() + 1, 12));
  const out = { ...vide };
  for (const e of entrees) {
    const heures = reponse[e] && reponse[e].wh_hours;
    if (!heures || typeof heures !== 'object') continue;
    for (const [instant, wh] of Object.entries(heures)) {
      const t = Date.parse(instant);
      const v = Number(wh);
      if (!Number.isFinite(t) || !Number.isFinite(v)) continue;
      const j = jourDe(new Date(t));
      if (j === auj) out.aujourdhui = (out.aujourdhui || 0) + v / 1000;
      else if (j === lendemain) out.demain = (out.demain || 0) + v / 1000;
    }
  }
  return out;
}

/** La prévision du jour et du lendemain, relue à chaque `tour` ; `{ aujourdhui: null, demain: null }` sans entrée ni réponse. */
export function usePrevisionSolaire(hass, entrees, tour = 0) {
  const [reponse, setReponse] = useState(null);
  // Le `hass` du moment, sans relancer l'effet à chaque état qui bouge (le patron de `useEtatsHist`).
  const vivant = useRef(hass);
  vivant.current = hass;
  const cle = (entrees || []).join(',');
  const connecte = hass ? 1 : 0;
  useEffect(() => {
    let actif = true;
    const h = vivant.current;
    if (!cle || !h || typeof h.callWS !== 'function') { setReponse(null); return undefined; }
    Promise.resolve()
      .then(() => h.callWS({ type: 'energy/solar_forecast' }))
      .then(r => { if (actif) setReponse(r && typeof r === 'object' ? r : null); })
      .catch(() => { if (actif) setReponse(null); });
    return () => { actif = false; };
  }, [cle, connecte, tour]);
  return totauxPrevision(reponse, entrees);
}
