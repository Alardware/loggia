/* ── Y a-t-il un assistant, et comment s'appelle-t-il ? ─────────────────────
 *
 * Séparé de la feuille, et pour une raison mesurable : `App.jsx` a besoin de
 * cette réponse à CHAQUE rendu, pour savoir s'il dessine le bouton du bas. Il
 * l'importe donc statiquement — et un module importé des deux façons finit tout
 * entier dans le bundle de démarrage, feuille comprise. Le bundler le dit sans
 * détour ; ce fichier est la réponse.
 *
 * Ici : de quoi choisir l'assistant, et rien d'autre. La popup, l'orbe et Three.js restent de
 * l'autre côté, et ne se téléchargent que si l'on ouvre.
 */
import { useState, useEffect } from 'react';
import { cfgVal } from './state.js';

/** Le réglage tel qu'il est : l'identifiant d'une entité de conversation, un
 * nom de composant — l'ancienne forme, toujours valable —, ou ''. */
export const choixAssistant = () => {
  const v = cfgVal('loggia_assistant', '');
  const s = typeof v === 'string' ? v.trim() : '';
  // Un espace ou une majuscule dans un préfixe de commande WebSocket ne
  // pardonne pas : on n'accepte que ce qui peut vraiment en former un.
  if (s.indexOf('conversation.') === 0) return /^[a-z0-9_]+$/.test(s.slice(13)) ? s : '';
  return /^[a-z][a-z0-9_]*$/.test(s) ? s : '';
};

/** Le nom du composant réglé, ou '' — l'ancienne forme du réglage. */
export const nomAssistant = () => {
  const c = choixAssistant();
  return c.indexOf('.') < 0 ? c : '';
};

/**
 * Les entités de conversation de la maison, triées par nom.
 *
 * Assist lui-même, un modèle en ligne, un composant d'assistant : Home
 * Assistant les publie toutes de la même façon, sous `conversation.*`. Les
 * choisir dans une liste plutôt que taper un nom, c'est ne plus pouvoir se
 * tromper d'une lettre.
 */
export function conversationsDe(hass) {
  const etats = (hass && hass.states) || {};
  return Object.keys(etats)
    .filter((id) => id.indexOf('conversation.') === 0)
    .map((id) => ({ id, nom: String(((etats[id] || {}).attributes || {}).friendly_name || id) }))
    .sort((a, b) => a.nom.localeCompare(b.nom));
}

/** L'entité que désigne le réglage. Un nom de composant — l'ancienne forme —
 * désigne l'entité qui porte son nom, quand elle existe. */
export function entiteChoisie(hass) {
  const c = choixAssistant();
  if (!c) return '';
  if (c.indexOf('.') > 0) return c;
  const etats = (hass && hass.states) || {};
  return etats['conversation.' + c] ? 'conversation.' + c : '';
}

/* Le composant qui porte une entité. Le registre du frontal le dit quand on
 * l'a (`hass.entities`) ; sinon l'identifiant : un composant qui nomme son
 * entité d'après lui-même — le cas courant — s'y retrouve. */
function composantDe(hass, id) {
  const r = hass && hass.entities && hass.entities[id];
  return (r && r.platform) || id.split('.')[1] || '';
}

/**
 * L'assistant réglé est-il là, et comment lui parler ?
 *
 * Rend la clé que reçoit la popup, ou '' :
 *
 *   • le NOM DU COMPOSANT quand celui-ci parle son propre protocole —
 *     `<nom>/info` répond : la réponse arrive mot à mot, avec l'historique ;
 *   • l'IDENTIFIANT DE L'ENTITÉ sinon : la popup passe par l'API commune de
 *     Home Assistant, que toute entité de conversation comprend.
 *
 * Pour un nom de composant, on ne teste pas d'entité : le composant peut être
 * chargé sans en publier. `<nom>/info` répond ou ne répond pas, et c'est la
 * seule question qui vaille.
 *
 * Tant que la réponse n'est pas là, on garde la précédente. Un bouton qui
 * disparaît puis revient est pire qu'un changement qui arrive une seconde
 * plus tard — et changer d'assistant depuis la popup la fermerait.
 */
export function useAssistant(hass) {
  const [cle, setCle] = useState('');
  const choix = choixAssistant();
  const dispo = !!(hass && typeof hass.callWS === 'function' && choix);
  useEffect(() => {
    if (!dispo) { setCle(''); return undefined; }
    let vivant = true;
    const repond = (ns) => hass.callWS({ type: `${ns}/info` }).then(() => true, () => false);
    (async () => {
      let r = '';
      if (choix.indexOf('.') < 0) {
        r = (await repond(choix)) ? choix : '';
      } else {
        // L'agent intégré de Home Assistant n'a pas de protocole à lui :
        // inutile de le lui demander.
        const ns = composantDe(hass, choix);
        if (ns && ns !== 'conversation' && /^[a-z][a-z0-9_]*$/.test(ns) && await repond(ns)) r = ns;
        else if (hass.states && hass.states[choix]) r = choix;
      }
      if (vivant) setCle(r);
    })();
    return () => { vivant = false; };
    // `hass` change à chaque état de la maison ; sa disponibilité, non.
  }, [dispo, choix]);   // eslint-disable-line react-hooks/exhaustive-deps
  return dispo ? cle : '';
}
