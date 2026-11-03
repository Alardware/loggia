/* Ce que fait un poêle à granulés, dit dans la langue de l'écran (01/11, ADR 0308).
 *
 * Un poêle MCZ (intégration `maestro_mcz`) envoie son état tel que son nuage
 * l'écrit, en italien : « Start 1 a Freddo », « Potenza 3 », « Spegnimento ».
 * Le composant reconnaît CE capteur à son identifiant stable et pose le drapeau
 * `etat_poele` dans l'index (`estEtatPoele`, state.js) ; l'écran ne lit jamais
 * un nom. Les valeurs ci-dessous sont celles relevées sur dix jours d'un poêle,
 * et celles de la même famille (« a Caldo », « Pulizia … ») ; une valeur
 * inconnue s'écrit telle quelle.
 *
 * Pur : le seul import est `tr`.
 */
import { tr } from './i18n.js';

/** L'état d'un poêle, traduit ; la valeur reçue, telle quelle, si elle n'est pas connue. */
export function texteEtatPoele(brut) {
  const texte = String(brut == null ? '' : brut).trim();
  const v = texte.toLowerCase().replace(/\s+/g, ' ');
  // Une alarme : son code, que la notice du poêle explique (« A01 - Mancata Accensione » → « Alarme A01 »).
  const alarme = /^([ae]\d{2})\b/.exec(v);
  if (alarme) return tr('Alarme {code}', { code: alarme[1].toUpperCase() });
  // En chauffe, à l'une de ses cinq puissances.
  const puissance = /^potenza (\d)$/.exec(v);
  if (puissance) return tr('Chauffe · puissance {n}', { n: puissance[1] });
  // La séquence d'allumage : charge de granulés, deux départs, stabilisation — à froid comme à chaud.
  if (/^(load|start [12]) a (freddo|caldo)$/.test(v) || v === 'stabilizzazione') return tr('Allumage');
  // Le nettoyage du brasier, avant l'allumage ou en chauffe.
  if (/^clean a (freddo|caldo)$/.test(v) || /^pulizia\b/.test(v)) return tr('Nettoyage');
  if (v === 'spegnimento') return tr('Extinction');
  if (v === 'raffreddamento') return tr('Refroidissement');
  // En veille : la pièce a sa consigne, il repartira seul.
  if (v === 'standby' || v === 'stand-by' || v === 'auto eco') return tr('En veille');
  if (v === 'spento') return tr('Éteint');
  return texte;
}
