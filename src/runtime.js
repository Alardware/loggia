// ─────────────────────────────────────────────────────────────────────────────
// Contexte d'execution Loggia.
//
// Fait descendre jusqu'aux vues ce que la decouverte a trouve et ce que
// l'utilisateur a configure, sans traverser trois niveaux de props. Les vues
// appellent useLoggia() et lisent `resolved.<domaine>` au lieu d'une constante
// figee.
//
// Tant que la decouverte n'a pas repondu, `ready` est faux et `resolved` est
// null : les vues doivent alors se comporter comme avant (repli sur leurs
// constantes historiques), ce qui evite tout ecran vide au demarrage.
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useContext } from 'react';
import { resolveAll } from './resolve.js';
import { viewAvailability, allAvailable } from './views.js';

// Avant que la decouverte reponde, toutes les vues sont declarees disponibles :
// masquer d'abord pour reafficher ensuite ferait clignoter la navigation.
const EMPTY = { ready: false, index: null, caps: null, states: {}, userCfg: {}, resolved: null, views: allAvailable() };

export const LoggiaContext = createContext(EMPTY);

/** A appeler dans une vue : `const { resolved } = useLoggia();` */
export function useLoggia() {
  return useContext(LoggiaContext);
}

/**
 * Entites d'un domaine, telles que l'utilisateur les a enregistrees.
 *
 * Source : la cle `loggia_entities` de sa configuration serveur, alimentee par
 * `loggiaConfig.adopt()`. Le `fallback` n'est la que pour la transition : il
 * pointe les constantes historiques, dont les entites n'existent de toute facon
 * pas chez un tiers — auquel cas les vues retombent sur la decouverte.
 *
 * Une fois tous les domaines bascules, les constantes disparaissent et ce
 * parametre devient inutile.
 */
export function useEntities(domain, fallback = null) {
  const { userCfg } = useContext(LoggiaContext);
  const e = userCfg && userCfg.loggia_entities;
  const v = e && e[domain];
  return (v == null) ? fallback : v;
}

/**
 * Construit la valeur du contexte. Appel couteux (parcours des entites) :
 * a memoiser sur l'etat de la decouverte et la configuration utilisateur,
 * jamais a chaque rendu.
 */
export function buildRuntime({ discovery, userCfg, states }) {
  const ready = !!(discovery && discovery.ready);
  if (!ready) return { ...EMPTY, userCfg: userCfg || {}, states: states || {} };
  const ctx = {
    index: discovery.index,
    caps: discovery.caps,
    // Preferences du tableau de bord Energie natif : seule description standard
    // de l'installation electrique. Null si l'utilisateur ne l'a pas configure.
    energyPrefs: (discovery.raw && discovery.raw.energyPrefs) || null,
    states: states || {},
    userCfg: userCfg || {},
  };
  let resolved = null;
  try {
    resolved = resolveAll(ctx);
  } catch (e) {
    // Une resolution qui echoue ne doit jamais empecher le dashboard de
    // s'afficher : les vues retombent sur leurs constantes.
    console.warn('Loggia : resolution indisponible', e);
  }
  const full = { ready: true, ...ctx, resolved };
  // Une vue masquee a tort est un bug visible ; une vue affichee a tort se
  // contente d'etre vide. En cas de doute, on affiche.
  //
  // Le doute couvre DEUX cas : la disponibilite qui leve, et la resolution qui
  // a echoue juste avant. Dans ce second cas les capacites viennent d'un etat
  // qu'on ne sait plus juger — s'en servir pour masquer serait pire que tout.
  let views;
  if (!resolved) {
    views = allAvailable();
  } else {
    try {
      views = viewAvailability(full);
    } catch (e) {
      console.warn('Loggia : disponibilite des vues indisponible', e);
      views = allAvailable();
    }
  }
  full.views = views;
  return full;
}
