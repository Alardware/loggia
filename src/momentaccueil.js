/* Les ACTIONS DU MOMENT, en tête de l'Accueil (04/11, étape 1 du rapport sur l'usage).
 *
 * La phrase du bandeau dit ce qui est ; ces boutons disent ce qu'on fait
 * d'habitude à cette heure-là, et seulement si c'est utile : le matin, des
 * volets fermés s'ouvrent ; le soir, des volets ouverts se ferment ; tard, des
 * lumières allumées appellent « Bonne nuit ». En journée, ou quand tout est
 * déjà en ordre, rien : pas de bouton qui ne servirait à rien, pas de « tout
 * va bien ». Rien ne part seul — c'est le toucher qui agit. */
import { tr } from './i18n.js';
import { coverFerme } from './voletecran.js';
import { nomScenario } from './scenarios.js';

export const MAX_ACTIONS = 3;

/** Le moment de la journée : le coucher du soleil avance le soir en hiver. */
export function momentDeLaJournee(heure, soleilCouche = false) {
  if (heure >= 23 || heure < 5) return 'nuit';
  if (heure < 11) return 'matin';
  if (heure >= 19 || (soleilCouche && heure >= 16)) return 'soir';
  return 'jour';
}

function position(st) {
  const p = Number(st && st.attributes && st.attributes.current_position);
  if (Number.isFinite(p)) return p;
  return st && st.state === 'closed' ? 0 : 100;
}

/** Les actions à proposer maintenant, dans l'ordre, trois au plus. */
export function actionsDuMoment({ heure, S, volets = [], lumieres = 0, scenarios = [] }) {
  if (!S) return [];
  const soleil = S['sun.sun'];
  const moment = momentDeLaJournee(heure, !!(soleil && soleil.state === 'below_horizon'));
  const vivants = volets
    .map(v => ({ id: v && v.haid, st: v && v.haid ? S[v.haid] : null }))
    .filter(v => v.st && v.st.state !== 'unavailable' && v.st.state !== 'unknown');
  const fermes = vivants.filter(v => coverFerme(v.st, position(v.st)));
  const ouverts = vivants.filter(v => !coverFerme(v.st, position(v.st)));
  const out = [];
  if (moment === 'matin' && fermes.length) {
    out.push({ cle: 'ouvrir', libelle: tr('Ouvrir les volets'), icone: 'blinds-open', volets: fermes.map(v => v.id), service: 'open_cover' });
  }
  if ((moment === 'soir' || moment === 'nuit') && ouverts.length) {
    out.push({ cle: 'fermer', libelle: tr('Fermer les volets'), icone: 'blinds', volets: ouverts.map(v => v.id), service: 'close_cover' });
  }
  const nuit = (Array.isArray(scenarios) ? scenarios : []).find(s => s && s.id === 'nuit');
  if (nuit && lumieres > 0 && (heure >= 21 || heure < 5)) {
    out.push({ cle: 'nuit', libelle: nomScenario(nuit), icone: nuit.icone || 'moon', scenario: 'nuit' });
  }
  return out.slice(0, MAX_ACTIONS);
}
