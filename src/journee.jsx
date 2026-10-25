/* ── La journée d'un capteur binaire (chantier Capteurs, étape 2 ; § 4.1, § 5.2, § 9) ─────────────
 *
 * La fiche d'un binaire et les popups des groupes lisent l'historique du JOUR,
 * de minuit à maintenant, tous les membres d'un coup : UNE lecture, à l'ouverture
 * (`history/period/{minuit}?filter_entity_id=…&minimal_response&no_attributes`,
 * la forme de `useHistorique24`). Elle fait foi pour « depuis » et pour « dernière
 * ouverture » — `last_changed` vaut l'heure du redémarrage de Home Assistant (ADR
 * 0031). Une lecture qui échoue n'est pas une journée vide : « erreur ».
 *
 * La bande du jour : 8 px, de 0 h à maintenant ; les moments actifs — ouverts, en
 * mouvement, en alerte — en `--o-accent-soft` ; dessous, « 0 h · {résumé} ·
 * maintenant ». Elle ne se lit pas à voix haute : le résumé la dit.
 *
 * Les fonctions sont pures, sans React ; seuls `useJournee` et `BandeJour` en
 * ont besoin. Chargé à la demande, avec les fiches qui le lisent.
 */
import { minuitDe, lireJournee, depuisDuJour, depuisQuand, useJournee } from './journeelue.js';
import { tr, trN } from './i18n.js';
import { CLASSES_OUVRANT } from './attention.js';

/* La lecture du jour et « depuis quand » vivent dans journeelue.js, que la carte Ouvertures lit au démarrage (lot 4) ; ce module
 * les redonne, pour ses lecteurs d'avant. */
export { minuitDe, lireJournee, depuisDuJour, depuisQuand, useJournee };

/** Les moments actifs de la journée, en pourcentage de la journée écoulée : `[{ a, b }]`. */
export function bandesDuJour(etats, debut, maintenant, actif = (s) => s === 'on') {
  const duree = Math.max(1, maintenant - debut);
  const out = [];
  (etats || []).forEach((p, i) => {
    if (!actif(p.s)) return;
    const a = Math.max(debut, p.t), b = Math.min(maintenant, i + 1 < etats.length ? etats[i + 1].t : maintenant);
    if (b > a) out.push({ a: Math.round((a - debut) / duree * 1000) / 10, b: Math.round((b - debut) / duree * 1000) / 10 });
  });
  return out;
}

/** Combien de fois l'état est devenu actif aujourd'hui — un état actif dès minuit compte une fois. */
export function foisDuJour(etats, actif = (s) => s === 'on') {
  return (etats || []).filter((p, i) => actif(p.s) && (i === 0 || !actif(etats[i - 1].s))).length;
}

/** Le dernier instant où l'état est devenu actif aujourd'hui, après minuit ; null sinon. */
export function dernierPassage(etats, debut, actif = (s) => s === 'on') {
  const l = (etats || []).filter((p, i) => p.t > debut && actif(p.s) && (i === 0 || !actif(etats[i - 1].s)));
  return l.length ? l[l.length - 1].t : null;
}

/* Les familles, pour le résumé de la bande : les ouvrants de LA table des classes (attention.js, audit du 19/10). */
const OUVRANTS = CLASSES_OUVRANT;
const PRESENCES = ['occupancy', 'presence'];

/** Le résumé de la bande du jour d'un binaire : « ouverte 2 fois aujourd'hui », « mouvements aujourd'hui », « présence
 *  aujourd'hui », « en alerte une fois aujourd'hui » — et, sans rien d'actif, « fermée toute la journée », « calme toute la journée ». */
export function resumeJour(classe, etats) {
  if (classe === 'motion') return tr('mouvements aujourd’hui');
  if (PRESENCES.indexOf(classe) >= 0) return tr('présence aujourd’hui');
  const n = foisDuJour(etats);
  if (OUVRANTS.indexOf(classe) >= 0) return n ? trN(n, 'ouverte une fois aujourd’hui', 'ouverte {n} fois aujourd’hui') : tr('fermée toute la journée');
  return n ? trN(n, 'en alerte une fois aujourd’hui', 'en alerte {n} fois aujourd’hui') : tr('calme toute la journée');
}

/** L'heure d'un instant, « 22:25 », dans la langue de l'écran. */
export const heure = (t, locale) => new Date(t).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

/* La bande du jour (§ 4.1) : 8 px, de 0 h à maintenant, les moments actifs en `--o-accent-soft` ; dessous, « 0 h · {résumé} ·
 * maintenant ». Le résumé se lit ; la bande, non. Des `span` mis en bloc par le style, jamais des `div` : les rangées des popups des
 * groupes sont des BOUTONS, et un bouton n'admet que du contenu en ligne (passe bis du 17/10, point 7). */
export function BandeJour({ bandes, resume }) {
  return (
    <span style={{ display: 'block', marginTop: 10 }}>
      <span aria-hidden="true" style={{ display: 'block', position: 'relative', height: 8, borderRadius: 4, background: 'var(--o-s1)', overflow: 'hidden' }}>
        {bandes.map((b, k) => <span key={k} data-bande="" style={{ position: 'absolute', top: 0, bottom: 0, left: b.a + '%', width: Math.max(.8, b.b - b.a) + '%', background: 'var(--o-accent-soft)' }} />)}
      </span>
      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 5, fontSize: 11, fontWeight: 700, color: 'var(--o-text3)' }}>
        <span aria-hidden="true">{tr('0 h')}</span><span style={{ color: 'var(--o-text2)', textAlign: 'center' }}>{resume}</span><span aria-hidden="true">{tr('maintenant')}</span>
      </span>
    </span>
  );
}
