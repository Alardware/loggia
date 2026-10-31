/* ── L'énergie d'un chauffage, dans l'Historique de sa fiche (30/10) ──────────
 *
 * L'idée vient d'une intégration Adax pour Gladys : l'énergie d'aujourd'hui et
 * d'hier, et les dernières heures en barres. Ici, lue dans les statistiques de
 * Home Assistant — celles du compteur de l'appareil (`change`, en kWh), sinon
 * la puissance moyenne de chaque tranche (`mean`, en W) —, comme la fiche d'une
 * prise (`kwhParHeure`, prisesfiche.js). Deux lectures : les heures finies
 * depuis la veille (ou six jours avant, sur 7 jours), puis les tranches de
 * 5 minutes depuis l'heure d'avant — l'heure en cours n'a pas encore de
 * statistique horaire, et la précédente arrive quelques minutes après sa fin.
 *
 * `useStatsEnergie` lit ; le reste compte, sans rien lire (les tests).
 */
import { useState, useEffect, useRef } from 'react';

const HEURE_MS = 3600000;
const debutDe = (x) => (typeof x.start === 'number' ? x.start : Date.parse(x.start));
// La fin d'une tranche ; sans elle, une heure (la période qu'on a demandée la plus longue).
const finDe = (x, debut) => {
  const f = typeof x.end === 'number' ? x.end : Date.parse(x.end);
  return Number.isFinite(f) && f > debut ? f : debut + HEURE_MS;
};
// Minuit, à l'heure du navigateur, `n` jours plus tôt : un jour d'hiver et un jour d'été n'ont pas 24 h.
function minuitAvant(maintenant, n = 0) {
  const d = new Date(maintenant);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - n).getTime();
}

/**
 * Les lignes d'une lecture horaire avant `coupe`, puis celles d'une lecture
 * sur 5 minutes à partir de `coupe` : rien ne se compte deux fois. Une liste
 * qui n'en est pas une ne se lit pas.
 */
export function fusionStats(heures, cinq, coupe) {
  const sortie = {};
  for (const [id, l] of Object.entries(heures || {})) {
    if (Array.isArray(l)) sortie[id] = l.filter(x => x && debutDe(x) < coupe);
  }
  for (const [id, l] of Object.entries(cinq || {})) {
    if (Array.isArray(l)) sortie[id] = [...(sortie[id] || []), ...l.filter(x => x && debutDe(x) >= coupe)];
  }
  return sortie;
}

/**
 * Les kWh de chaque tranche lue, `{ tranches: [{ debut, kwh }], estime }` : ce
 * que compte le compteur s'il porte des sommes, sinon la puissance moyenne de
 * la tranche multipliée par sa durée (`estime` vrai). Un compteur remis à zéro
 * ne compte pas en négatif.
 */
export function tranchesKwh(stats, energie, puissance) {
  const lignes = (id) => (id && stats && Array.isArray(stats[id]) ? stats[id] : []);
  const somme = lignes(energie).filter(x => x && typeof x.change === 'number' && Number.isFinite(x.change));
  if (somme.length) return { tranches: somme.map(x => ({ debut: debutDe(x), kwh: Math.max(0, x.change) })), estime: false };
  const moyennes = lignes(puissance).filter(x => x && typeof x.mean === 'number' && Number.isFinite(x.mean));
  return {
    tranches: moyennes.map(x => { const d = debutDe(x); return { debut: d, kwh: Math.max(0, x.mean) * (finDe(x, d) - d) / HEURE_MS / 1000 }; }),
    estime: moyennes.length > 0,
  };
}

/**
 * Le bilan de l'Historique : `aujourdhui` et `hier` en kWh (null sans aucune
 * tranche lue — « rien lu » n'est pas « zéro »), leurs tranches (pour le prix
 * de chaque heure), et les barres — les 24 heures jusqu'à l'heure en cours,
 * ou les 7 jours jusqu'à aujourd'hui (`jours`) —, `[{ debut, kwh }]`, avec
 * leur total.
 */
export function bilanEnergie(tranches, { maintenant, jours = 1 }) {
  const liste = Array.isArray(tranches) ? tranches.filter(x => x && Number.isFinite(x.debut) && Number.isFinite(x.kwh)) : [];
  const minuit = minuitAvant(maintenant), veille = minuitAvant(maintenant, 1);
  const entre = (a, b) => liste.filter(x => x.debut >= a && x.debut < b);
  const somme = (l) => l.reduce((s, x) => s + x.kwh, 0);
  const bornes = jours > 1
    ? Array.from({ length: 7 }, (_, i) => [minuitAvant(maintenant, 6 - i), minuitAvant(maintenant, 5 - i)])
    : Array.from({ length: 24 }, (_, i) => { const h = Math.floor(maintenant / HEURE_MS) * HEURE_MS - (23 - i) * HEURE_MS; return [h, h + HEURE_MS]; });
  const barres = bornes.map(([a, b]) => ({ debut: a, kwh: somme(entre(a, b)) }));
  const vide = !liste.length;
  const duJour = entre(minuit, Infinity), dHier = entre(veille, minuit);
  return {
    aujourdhui: vide ? null : somme(duJour), hier: vide ? null : somme(dHier),
    trancheJour: duJour, trancheHier: dHier,
    barres, total: vide ? null : somme(barres),
  };
}

/**
 * Les statistiques des compteurs (`ids` : le compteur, la puissance, les
 * compteurs des tarifs), relues toutes les 5 minutes : null tant que rien
 * n'est lu, 'erreur' tant qu'aucune lecture n'a réussi — ensuite, la dernière
 * réussie tient (l'enregistreur qui hoquette ne fait pas clignoter le panneau,
 * comme la fiche d'une prise).
 */
export function useStatsEnergie(hass, ids, jours) {
  const [lu, setLu] = useState(null);
  const source = useRef(hass);
  source.current = hass;
  const cle = [...new Set((ids || []).filter(Boolean))].join('|');
  useEffect(() => {
    let vivant = true;
    let reussie = false;
    setLu(null);
    const rate = () => { if (vivant && !reussie) setLu('erreur'); };
    const lire = () => {
      const h = source.current;
      if (!cle || !h || typeof h.callWS !== 'function') { rate(); return; }
      const maintenant = Date.now();
      const coupe = Math.floor(maintenant / HEURE_MS) * HEURE_MS - HEURE_MS;
      // `new Promise` : un `callWS` qui lève avant de répondre est un échec comme un autre.
      const lecture = (period, depuis) => new Promise((ok) => ok(h.callWS({ type: 'recorder/statistics_during_period',
        start_time: new Date(depuis).toISOString(), statistic_ids: cle.split('|'), period, types: ['change', 'mean'],
        units: { power: 'W', energy: 'kWh' } })));
      Promise.all([lecture('hour', minuitAvant(maintenant, jours > 1 ? 6 : 1)), lecture('5minute', coupe)]).then(([a, b]) => {
        const bonne = (x) => x && typeof x === 'object' && !Array.isArray(x);
        if (!bonne(a) || !bonne(b)) { rate(); return; }
        reussie = true;
        if (vivant) setLu(fusionStats(a, b, coupe));
      }, rate);
    };
    lire();
    const minuterie = setInterval(lire, 300000);
    return () => { vivant = false; clearInterval(minuterie); };
  }, [cle, jours]);
  return lu;
}
