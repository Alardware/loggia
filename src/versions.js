/* ── Les versions précédentes de la configuration (29/10, ADR 0285) ──
 *
 * « Revenir à la version d’avant » : le composant garde une copie de la
 * configuration ENTIÈRE avant les écritures — au plus une par quart d’heure,
 * les dix dernières — dans un fichier à part (versions.py). Deux commandes,
 * réservées aux administrateurs de Home Assistant comme l’import : la liste,
 * sans contenu, et le retour à l’une d’elles, qui garde d’abord l’état du
 * moment.
 *
 * Ce module n’est lu que par Paramètres, chargé à la demande. Il n’importe du
 * démarrage que ce que Paramètres en importe déjà (`tr`, `locale`) : chaque
 * nom de plus que le démarrage exporte vers un morceau à la demande le fait
 * grossir. Ses refus, il les dit donc lui-même (`texteVersion`).
 */
import { tr, locale } from './i18n.js';

export const WS_VERSIONS_LISTE = 'loggia/versions/liste';
const WS_VERSIONS_RENDRE = 'loggia/versions/rendre';
// versions.py, MAX_VERSIONS.
const MAX_VERSIONS = 10;
// Le carnet des réglages en attente (enattente.js, `CLE`) : il rejouerait par-dessus le retour des réglages d’avant.
export const CLE_CARNET = 'loggia_enattente';

/** Les refus des deux commandes, par leur code (versions.py, store.py). */
export const REFUS_VERSIONS = {
  // Le fichier des copies illisible, et pas encore mis de côté : rien ne s’y écrit avant un redémarrage.
  versions_indisponibles: () => tr('Versions précédentes indisponibles — leur fichier est illisible'),
  // Dix copies au plus : celle qu’on voulait a pu partir pendant que la page était ouverte.
  version_inconnue: () => tr('Version introuvable — une plus récente l’a remplacée'),
  version_illisible: () => tr('Version illisible — cette copie est abîmée'),
};

/** La phrase d’un refus des versions, ou null : ce n’en est pas un. */
export function texteVersion(err) {
  const code = err && typeof err.code === 'string' ? err.code : '';
  return Object.prototype.hasOwnProperty.call(REFUS_VERSIONS, code) ? REFUS_VERSIONS[code]() : null;
}

const MINUTE = 60000;
const HEURE = 60 * MINUTE;
const JOUR = 24 * HEURE;

/** « il y a 2 h » dans la journée, sinon le jour et l’heure — dans la langue de l’écran. */
export function quandVersion(iso, maintenant = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  const ecart = maintenant - t;
  // Une horloge d’écran en avance sur le serveur ne dit jamais « dans 3 min ».
  if (ecart < MINUTE) return tr('À l’instant');
  const relatif = new Intl.RelativeTimeFormat(locale(), { numeric: 'always', style: 'short' });
  if (ecart < HEURE) return relatif.format(-Math.floor(ecart / MINUTE), 'minute');
  if (ecart < JOUR) return relatif.format(-Math.floor(ecart / HEURE), 'hour');
  return new Date(t).toLocaleString(locale(), { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

/** Ce que la copie précède : l’enregistrement d’un compte, ou un retour en arrière. */
export function motifVersion(v) {
  const nom = v && typeof v.compte === 'string' && v.compte ? v.compte : null;
  if (v && v.motif === 'retour') return nom ? tr('Avant un retour en arrière de {nom}', { nom }) : tr('Avant un retour en arrière');
  return nom ? tr('Avant un enregistrement de {nom}', { nom }) : tr('Avant un enregistrement');
}

/** La réponse de `loggia/versions/liste`, réduite à ce que l’écran affiche. */
export function versionsDe(reponse) {
  const liste = reponse && Array.isArray(reponse.versions) ? reponse.versions : [];
  return liste
    .filter((v) => v && typeof v.id === 'string' && v.id && typeof v.date === 'string')
    .slice(0, MAX_VERSIONS)
    .map((v) => ({
      id: v.id,
      date: v.date,
      compte: typeof v.compte === 'string' && v.compte ? v.compte : null,
      taille: Number.isFinite(v.taille) ? v.taille : 0,
      motif: v.motif === 'retour' ? 'retour' : 'ecriture',
    }));
}

export const listerVersions = async (hass) => versionsDe(await hass.callWS({ type: WS_VERSIONS_LISTE }));

/**
 * Remet une copie. Le composant fait tout sous son verrou ; un refus remonte
 * tel quel, sans rien toucher ici.
 *
 * Accepté, le navigateur oublie ce qu’il gardait des clés que le retour a
 * changées — le composant les nomme (`cles`), comme son signal — et son carnet
 * des réglages en attente. Une copie locale remonterait sinon au serveur par
 * `completerDepuisLocal` (config.js) dès qu’une clé y manque, et le carnet
 * rejouerait ses réglages : le retour serait défait au rechargement. Ce que
 * l’appareil sait de lui-même ne passe jamais par le serveur, et reste.
 * L’appelant recharge la page.
 */
export async function rendreVersion(hass, id) {
  const r = await hass.callWS({ type: WS_VERSIONS_RENDRE, version: id });
  const cles = r && Array.isArray(r.cles) ? r.cles.filter((k) => typeof k === 'string') : [];
  try {
    for (const k of [...cles, CLE_CARNET]) localStorage.removeItem(k);
  } catch { /* le serveur fait foi de toute façon */ }
  return r;
}
