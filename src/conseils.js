/* ── Les conseils d'énergie, et le geste qui les suit (07/11, usage étape 11) ──
 *
 * La vue Énergie disait ce qui s'était passé, pas quoi faire. Elle conseille
 * désormais d'après ce que Loggia sait déjà — le créneau des heures creuses
 * (tarif.js), le creux d'un prix qui varie, la couleur Tempo du lendemain, les
 * cycles de l'électroménager (prises.py) —, et chaque conseil se suit d'un
 * toucher : « Me prévenir », un RAPPEL tenu par Home Assistant
 * (`custom_components/loggia/rappels.py`) qui fait sonner, à l'heure dite, le
 * téléphone de celui qui l'a demandé — écran fermé. Son choix du 07/11 :
 * prévenir, jamais couper puis rallumer la prise ; beaucoup de machines ne
 * repartent pas seules au retour du courant.
 *
 * Un conseil ne s'affiche que s'il est VRAI maintenant : pas de créneau connu,
 * pas de conseil d'heure ; pas de téléphone pour ce compte (`peut`), pas de
 * bouton. Ici, ce qui se calcule et le magasin des rappels ; les pixels sont
 * dans `conseilsui.jsx`.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { magasin } from './prisesetat.js';
import { partDans } from './tarif.js';

/* ── Le magasin des rappels : `loggia/rappels/etat`, relu chaque minute ─────── */
const sansHeure = (r) => JSON.stringify(r, function (k, v) { return k === 'maintenant' && this === r ? undefined : v; });
const RAPPELS = magasin((h) => h.callWS({ type: 'loggia/rappels/etat' }), 60000, 60000, sansHeure);

/** `{ etat, erreur }` des rappels de CE compte ; `actif` faux : rien ne s'abonne. */
export function useRappels(actif = true) {
  useEffect(() => (actif ? RAPPELS.abonner() : undefined), [actif]);
  return useSyncExternalStore(RAPPELS.ecouter, RAPPELS.lire, RAPPELS.lire);
}

/** Poser ou annuler : la réponse du serveur (l'état neuf) remplace le cache. Rend la promesse de l'appel. */
export function ecrireRappel(hass, msg) {
  return new Promise((ok) => ok(hass.callWS(msg))).then((r) => { if (r && Array.isArray(r.rappels)) RAPPELS.poser(r); return r; });
}

/** Le rappel à venir de cet appareil (`entite` null : celui sans appareil), ou null. */
export function rappelDe(etat, entite = null, maintenantMs = Date.now()) {
  const liste = (etat && Array.isArray(etat.rappels)) ? etat.rappels : [];
  return liste.find(r => r && (r.entite || null) === (entite || null) && Number(r.quand) * 1000 > maintenantMs) || null;
}

/** L'instant `ms` tombe-t-il dans les heures calmes `{ debut, fin }` (« 22:00 », « 07:00 ») ? Elles passent souvent minuit. */
export function dansCalme(calme, ms) {
  const lire = (x) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(x || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const de = lire(calme && calme.debut), a = lire(calme && calme.fin);
  if (de == null || a == null || de === a || !Number.isFinite(ms)) return false;
  const d = new Date(ms), m = d.getHours() * 60 + d.getMinutes();
  return de < a ? m >= de && m < a : m >= de || m < a;
}

/**
 * Le moment où l'électricité est la moins chère : `{ sorte, enCours, debut, fin }`.
 * Les heures creuses d'abord (`hc`, `heuresCreusesAVenir`), sinon le creux d'un
 * prix qui varie (`creux`, `fenetreMoinsChere`). `null` quand rien ne le dit.
 */
export function momentEco({ hc = null, creux = null, maintenant = Date.now() } = {}) {
  if (hc && Number.isFinite(hc.debut) && Number.isFinite(hc.fin)) return { sorte: 'hc', enCours: !!hc.enHc, debut: hc.debut, fin: hc.fin };
  if (creux && Number.isFinite(creux.debut) && Number.isFinite(creux.fin) && creux.fin > maintenant) {
    return { sorte: 'creux', enCours: creux.debut <= maintenant, debut: creux.debut, fin: creux.fin };
  }
  return null;
}

const JOUR_MS = 86400000;

/**
 * Le dernier cycle, s'il a tourné en HEURES PLEINES : fini dans les dernières
 * vingt-quatre heures, et plus de la moitié de sa durée hors des heures creuses
 * (`plagesHc`, celles qui ont vraiment eu cours). `{ fin, surcout }` — ce qu'il
 * a coûté de plus qu'en heures creuses, à deux tarifs connus (`prix`
 * `{ hc, hp }`) : ses kWh, au prorata du temps passé en heures pleines ; `null`
 * sans prix. `null` sinon.
 */
export function dernierCycleHp(cycles, plagesHc, prix = null, maintenant = Date.now()) {
  const finis = (Array.isArray(cycles) ? cycles : [])
    .map(c => ({ debut: Date.parse(c && c.debut), fin: Date.parse(c && c.fin), kwh: c && c.kwh }))
    .filter(c => c.fin > c.debut && c.fin <= maintenant && maintenant - c.fin < JOUR_MS)
    .sort((x, y) => x.fin - y.fin);
  const c = finis[finis.length - 1];
  if (!c || !Array.isArray(plagesHc) || !plagesHc.length) return null;
  const hp = 1 - partDans(c.debut, c.fin, plagesHc);
  if (hp <= 0.5) return null;
  const surcout = prix && typeof c.kwh === 'number' && c.kwh > 0 && prix.hp > prix.hc ? c.kwh * hp * (prix.hp - prix.hc) : null;
  return { fin: c.fin, surcout };
}

/**
 * L'électroménager dont le serveur suit les cycles (`suivi`), au repos : ce que
 * les conseils proposent de lancer. `[{ id, cycles }]`, triés par entité.
 * `types` : les types d'électroménager (`ELECTROMENAGER`, prises.js).
 */
export function appareilsAuRepos(etat, types) {
  const t = (etat && etat.prises) || {};
  return Object.keys(t).sort()
    .filter(id => t[id] && t[id].suivi === true && (types || []).includes(t[id].type) && !(t[id].cycle && t[id].cycle.debut))
    .map(id => ({ id, cycles: t[id].cycles || [] }));
}
