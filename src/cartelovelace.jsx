/* ── Poser une carte Lovelace dans Loggia ───────────────────────────────────
 *
 * Le catalogue de Loggia est riche, mais FERMÉ : impossible d'y mettre une
 * `mini-graph-card`, une `apexcharts-card`, ou même une `tile` de Home
 * Assistant. Tout l'écosystème restait dehors.
 *
 * Home Assistant expose `window.loadCardHelpers()`, qui rend un objet avec
 * `createCardElement(config)`. L'élément obtenu est un élément DOM ordinaire
 * auquel il faut AFFECTER `.hass` — et le réaffecter à chaque changement
 * d'état, sinon la carte reste figée sur ce qu'elle a vu en naissant.
 *
 * Trois choses peuvent mal tourner, et aucune ne doit emporter la vue :
 *   1. les aides ne se chargent pas (vieille version, contexte sans Lovelace) ;
 *   2. le type n'existe pas — ressource absente, nom mal écrit ;
 *   3. la carte lève une erreur en se construisant.
 * Chacune donne un message à sa place, jamais une page blanche.
 *
 * LE THÈME. Une carte Home Assistant lit SES variables (`--primary-color`,
 * `--card-background-color`…), pas celles de Loggia (`--o-*`). Sans pont, elle
 * détonnerait. `PONT_THEME` les fait pointer sur les nôtres : la carte garde sa
 * mise en page, elle prend nos couleurs.
 */
import { useEffect, useRef, useState } from 'react';
import { tr } from './i18n.js';

/* Les variables que les cartes de Home Assistant lisent le plus, renvoyées sur
 * celles de Loggia. Posées sur le conteneur : elles ne fuient pas au-dehors, et
 * un thème qui change les met toutes à jour sans qu'on y touche. */
const PONT_THEME = {
  '--primary-color': 'var(--o-accent)',
  '--accent-color': 'var(--o-accent)',
  '--primary-text-color': 'var(--o-text)',
  '--secondary-text-color': 'var(--o-text2)',
  '--disabled-text-color': 'var(--o-text3)',
  '--card-background-color': 'var(--o-surfA)',
  '--ha-card-background': 'var(--o-surfA)',
  '--ha-card-border-color': 'var(--o-bd2)',
  '--ha-card-border-radius': 'var(--o-radius,18px)',
  '--ha-card-box-shadow': 'var(--o-shadow)',
  '--divider-color': 'var(--o-bd2)',
  '--secondary-background-color': 'var(--o-s1)',
  '--state-icon-color': 'var(--o-text1)',
  '--paper-item-icon-color': 'var(--o-text1)',
  '--error-color': 'var(--o-bad)',
  '--warning-color': 'var(--o-warn)',
  '--success-color': 'var(--o-ok)',
};

/** Les aides de Home Assistant, chargées une fois pour toute la page. */
let aidesPromesse = null;
function chargerAides() {
  if (!aidesPromesse) {
    aidesPromesse = (typeof window !== 'undefined' && typeof window.loadCardHelpers === 'function')
      ? window.loadCardHelpers()
      : Promise.resolve(null);
  }
  return aidesPromesse;
}


/**
 * Une carte Lovelace, rendue dans Loggia.
 *
 * `config` est l'objet que Home Assistant attend — `{ type: 'tile', entity: … }`.
 * Un objet sans `type` n'est pas une carte : on le dit plutôt que de laisser
 * Home Assistant lever une erreur obscure.
 */
export default function CarteLovelace({ config = null, hass = null }) {
  const hote = useRef(null);
  const carte = useRef(null);
  const [erreur, setErreur] = useState(null);
  /* Référence VIVANTE sur `hass` : la carte reçoit le sien à la naissance, mais
   * l'état de la maison n'a pas à faire renaître la carte. Le second effet le
   * lui repasse ensuite, à chaque changement. */
  const hassRef = useRef(hass);
  hassRef.current = hass;
  /* La configuration arrive souvent recréée à l'identique à chaque rendu : sans
   * cette signature, on détruirait et rebâtirait la carte en boucle. */
  const sig = config ? JSON.stringify(config) : '';

  useEffect(() => {
    let vivant = true;
    carte.current = null;
    setErreur(null);
    const boite = hote.current;
    if (boite) boite.replaceChildren();
    if (!sig) { setErreur('vide'); return undefined; }

    let cfg = null;
    try { cfg = JSON.parse(sig); } catch { cfg = null; }
    if (!cfg || !cfg.type) { setErreur('type'); return undefined; }

    chargerAides().then((aides) => {
      if (!vivant) return;
      if (!aides || typeof aides.createCardElement !== 'function') { setErreur('aides'); return; }
      let el = null;
      try {
        el = aides.createCardElement(cfg);
      } catch {
        /* Un type inconnu lève ici : la ressource n'est pas installée, ou le nom
         * est mal écrit. La vue qui nous contient ne doit pas tomber avec. */
        setErreur('type');
        return;
      }
      try { el.setConfig(cfg); } catch { /* beaucoup de cartes le font déjà seules */ }
      if (hassRef.current) el.hass = hassRef.current;
      carte.current = el;
      if (hote.current) hote.current.replaceChildren(el);
    }, () => { if (vivant) setErreur('aides'); });

    return () => { vivant = false; };
  }, [sig]);

  /* `hass` change à CHAQUE état de la maison. Un effet à part, sinon on
   * reconstruirait la carte entière au lieu de lui passer la nouvelle valeur. */
  useEffect(() => { if (carte.current && hass) carte.current.hass = hass; }, [hass]);

  if (erreur) return <Panne quoi={erreur} type={config && config.type} />;
  return <div ref={hote} style={PONT_THEME} />;
}

/* Un message à la place de la carte : on dit CE QUI manque, parce que « ça ne
 * marche pas » n'aide personne à le réparer. */
function Panne({ quoi, type }) {
  const texte = quoi === 'aides' ? tr('Home Assistant n’a pas fourni ses cartes.')
    : quoi === 'vide' ? tr('Aucune carte configurée.')
      : tr('Carte « {t} » introuvable. La ressource est-elle installée ?', { t: type || '?' });
  return (
    <div style={{ padding: 14, borderRadius: 'var(--o-radius,18px)', background: 'var(--o-s1)', border: '1px dashed var(--o-bd2)', fontSize: 12.5, color: 'var(--o-text2)', fontWeight: 600 }}>
      {texte}
    </div>
  );
}
