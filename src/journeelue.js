/* ── La journée LUE d'un capteur binaire : l'historique du jour, et depuis quand (audit des capteurs du 19/10, lot 4) ──
 *
 * Ce que la carte Ouvertures, qui vit au démarrage, partage avec les popups des groupes et la fiche d'un binaire, chargées à la
 * demande : UNE lecture de l'historique du jour (`useJournee`) et l'heure du dernier VRAI changement (`depuisQuand`). La puce de
 * la carte disait « Baie · 23:48 », l'heure du redémarrage, quand sa popup disait l'heure de l'historique : elles lisent ici la
 * même chose. Le reste de la journée — la bande, son résumé, les passages — reste dans journee.jsx, hors du démarrage. Sans JSX.
 */
import { useState, useEffect, useRef } from 'react';

/** Minuit, heure locale, du jour de l'instant `t` (ms). */
export function minuitDe(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** La réponse de `history/period` (format minimal) : `{ id: [{ t, s }] }`, chaque liste dans l'ordre du temps. */
export function lireJournee(reponse) {
  const out = {};
  (Array.isArray(reponse) ? reponse : []).forEach(liste => {
    if (!Array.isArray(liste) || !liste.length || !liste[0] || !liste[0].entity_id) return;
    out[liste[0].entity_id] = liste.map(p => ({ t: Date.parse(p.last_changed || p.last_updated), s: String(p.state) })).filter(p => Number.isFinite(p.t)).sort((a, b) => a.t - b.t);
  });
  return out;
}

/** Depuis quand l'état est ce qu'il est : l'instant du dernier changement aujourd'hui, après minuit ; null s'il n'a pas changé. */
export function depuisDuJour(etats, debut) {
  const l = (etats || []).filter((p, i) => p.t > debut && (i === 0 || p.s !== etats[i - 1].s));
  return l.length ? l[l.length - 1].t : null;
}

/** Depuis quand (§ 9 ; passe bis du 17/10, point 4) : l'historique du jour fait foi. LU, et sans changement aujourd'hui — fermée
 *  depuis hier, ouverte depuis hier —, l'heure se TAIT (null) : `last_changed` vaudrait celle du redémarrage de Home Assistant (ADR
 *  0031). La popup d'un groupe et la carte Ouvertures le lisent toutes deux (audit du 19/10, lot 4) : la puce et la rangée disent
 *  la même heure.
 *  - Le dernier état LU n'est pas l'état d'aujourd'hui : l'enregistreur n'écrit qu'à intervalles (`commit_interval`, 5 s), et la
 *    lecture faite quand la porte s'ouvre ne porte pas encore son ouverture — « Porte · 08:05 » pour une porte rouverte à 14:00
 *    (relecture du lot 4). Ce changement-là est vrai, et c'est `last_changed` qui le date.
 *  - Rien de lu — pas encore, en erreur, un membre que l'historique ignore : on ne sait pas, l'heure se TAIT, partout (relecture
 *    du lot 4 : la popup retombait sur `last_changed`, l'heure du redémarrage, quand la carte se taisait). */
export function depuisQuand(etats, debut, st) {
  if (!etats || !etats.length) return null;
  const dernier = etats[etats.length - 1];
  if (st && st.state != null && String(st.state) !== dernier.s) {
    const t = Date.parse(st.last_changed);
    return Number.isFinite(t) && t > debut ? t : null;
  }
  return depuisDuJour(etats, debut);
}

/**
 * La journée de quelques binaires : UNE lecture à l'ouverture — relue si la liste change, et à MINUIT (relecture du lot 4 : la carte
 * Ouvertures, toujours montée, gardait la journée de la veille — « 18 oct. 22:00 » sur la carte, rien dans la popup). Un minuteur
 * fait rendre à minuit, nettoyé au démontage ; le jour fait partie des dépendances de la lecture. `null` tant qu'elle n'est pas lue,
 * 'erreur' si elle ne se lit pas, sinon `{ debut, etats: { id: [{ t, s }] } }`.
 */
export function useJournee(hass, ids) {
  const [lu, setLu] = useState(null);
  const [, setTic] = useState(0);
  const hRef = useRef(hass);
  hRef.current = hass;
  const sig = (ids || []).filter(Boolean).join(',');
  const connecte = !!(hass && typeof hass.callApi === 'function');
  const jour = minuitDe(Date.now());
  useEffect(() => {
    // Le lendemain, une seconde après minuit : l'heure d'été ne compte pas, `minuitDe` relit le calendrier.
    const lendemain = new Date(jour);
    lendemain.setDate(lendemain.getDate() + 1);
    const t = setTimeout(() => setTic(x => x + 1), Math.max(1000, lendemain.getTime() - Date.now() + 1000));
    // Sous Node (les tests), un minuteur d'un jour ne retient pas le processus ; le navigateur n'a pas `unref`.
    if (t && typeof t.unref === 'function') t.unref();
    return () => clearTimeout(t);
  }, [jour]);
  useEffect(() => {
    if (!connecte || !sig) { setLu(sig ? null : { debut: jour, etats: {} }); return undefined; }
    let vivant = true;
    const debut = jour;
    new Promise((ok) => ok(hRef.current.callApi('GET', 'history/period/' + new Date(debut).toISOString() + '?filter_entity_id=' + encodeURIComponent(sig) + '&minimal_response&no_attributes')))
      .then((r) => { if (vivant) setLu({ debut, etats: lireJournee(r) }); }, () => { if (vivant) setLu('erreur'); });
    return () => { vivant = false; };
  }, [connecte, sig, jour]);
  // Une lecture d'un autre jour ne se montre pas : la suivante arrive.
  return lu && lu !== 'erreur' && lu.debut !== jour ? null : lu;
}
