/* ── Y a-t-il un assistant, et comment s'appelle-t-il ? ─────────────────────
 *
 * Séparé de la feuille, et pour une raison mesurable : `App.jsx` a besoin de
 * cette réponse à CHAQUE rendu, pour savoir s'il dessine le bouton du bas. Il
 * l'importe donc statiquement — et un module importé des deux façons finit tout
 * entier dans le bundle de démarrage, feuille comprise. Le bundler le dit sans
 * détour ; ce fichier est la réponse.
 *
 * Ici : deux fonctions et rien d'autre. La popup, l'orbe et Three.js restent de
 * l'autre côté, et ne se téléchargent que si l'on ouvre.
 */
import { useState, useEffect } from 'react';
import { cfgVal } from './state.js';

/** Le nom réglé de l'assistant, ou '' si la maison n'en a pas. */
export const nomAssistant = () => {
  const v = cfgVal('loggia_assistant', '');
  // Un espace ou une majuscule dans un préfixe de commande WebSocket ne
  // pardonne pas : on n'accepte que ce qui peut vraiment en former un.
  return (typeof v === 'string' && /^[a-z][a-z0-9_]*$/.test(v.trim())) ? v.trim() : '';
};

/**
 * L'assistant réglé est-il là ?
 *
 * On ne teste pas une entité : le composant peut être chargé sans en publier.
 * `<nom>/info` répond ou ne répond pas, et c'est la seule question qui vaille.
 * Tant qu'on n'a pas la réponse, on ne montre rien — un bouton qui apparaît
 * puis disparaît est pire qu'un bouton qui arrive une seconde plus tard.
 */
export function useAssistant(hass) {
  const [presente, setPresente] = useState(null);
  const ns = nomAssistant();
  const dispo = !!(hass && typeof hass.callWS === 'function' && ns);
  useEffect(() => {
    if (!dispo) { setPresente(false); return undefined; }
    let vivant = true;
    hass.callWS({ type: `${ns}/info` })
      .then(() => { if (vivant) setPresente(true); })
      .catch(() => { if (vivant) setPresente(false); });
    return () => { vivant = false; };
    // `hass` change à chaque état de la maison ; sa disponibilité, non.
  }, [dispo, ns]);   // eslint-disable-line react-hooks/exhaustive-deps
  return presente ? ns : '';
}
