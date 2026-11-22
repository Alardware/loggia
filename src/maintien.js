/* ── Une touche qu'on garde enfoncée se répète (chantier du 20/11, P5 ; ADR 0382) ──
 *
 * Pur, sans React : l'horloge se donne, un test la remplace. Le pavé de la
 * télécommande (fichemedia.jsx) l'arme au `pointerdown` d'une flèche ou d'un
 * volume et l'arrête au relâchement, à la sortie du doigt, quand la page se
 * cache ou que la fiche se ferme. Une touche part tout de suite — un appui bref
 * reste UNE touche —, puis se répète après un temps, comme une vraie
 * télécommande. Le plafond est un garde-fou : un relâchement perdu ne fait pas
 * monter le volume sans fin.
 */
const MAINTIEN = { delai: 450, pas: 180, max: 40 };

const HORLOGE = { poser: (f, ms) => setTimeout(f, ms), retirer: (t) => clearTimeout(t) };

/** `envoyer` tout de suite, puis après `delai`, toutes les `pas` ms, `max` fois au plus. Rend `arreter`. */
export function armerRepetition(envoyer, { delai = MAINTIEN.delai, pas = MAINTIEN.pas, max = MAINTIEN.max, horloge = HORLOGE } = {}) {
  let n = 0;
  let t = null;
  let fini = false;
  const arreter = () => { fini = true; if (t != null) horloge.retirer(t); t = null; };
  const tour = () => {
    t = null;
    if (fini) return;
    if (n >= max) { arreter(); return; }
    n += 1;
    envoyer();
    // Arrêtée PENDANT l'envoi (la fiche se ferme sur la touche) : `fini` est mis, le tour suivant s'arrête net.
    t = horloge.poser(tour, pas);
  };
  envoyer();
  t = horloge.poser(tour, delai);
  return arreter;
}
