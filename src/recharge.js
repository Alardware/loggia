/* Un module chargé à la demande qui manque ne fait plus tomber l'écran
 * (audit du 03/10).
 *
 * Le paquet ne garde que deux générations de bundles (ADR 0072), et les
 * règles 3 et 4 de `pack_frontend.py` en retirent encore ce que plus rien ne
 * sert : une page restée ouverte pendant une mise à jour HACS peut réclamer un
 * fichier qui n'existe plus. Paramètres, Système, la fiche robot, l'assistant,
 * l'accueil de première installation et même le fond météo n'avaient aucune
 * barrière, et personne n'écoutait `vite:preloadError` : le 404 démontait
 * TOUT l'arbre — « Loggia n'a pas pu s'afficher », quatre boutons, dont
 * « Réglages d'usine ». Le bon geste était le premier, « Recharger » :
 * l'`index.html` relu nomme les bundles du jour. L'ADR 0072 le disait déjà
 * (« celui qui en saute deux recharge la page ») ; rien ne le faisait.
 *
 * Ce module fait ce geste, UNE fois, à la place de l'utilisateur :
 *  - `lazyRecharge` remplace `lazy` partout dans src/ (un test refuse l'autre) ;
 *  - `ecouterPrechargement` couvre les imports à la demande hors React — un
 *    catalogue de langue demandé en cours de route, la voix, le
 *    préchargement de l'orbe. Le catalogue que l'amorce (`main.jsx`) charge
 *    AVANT l'écran part, lui, avant l'écouteur : son échec retombe déjà sur
 *    le français. Vite émet `vite:preloadError` sur tout échec d'un import à
 *    la demande qu'il a compilé, et un `preventDefault` lui fait rendre
 *    `undefined` au lieu de lever. L'import retenu se reconnaît donc à ce
 *    vide : l'écran attend le départ de la page, sans montrer d'erreur
 *    entre-temps.
 *
 * « Une fois » : la date du dernier rechargement automatique, en
 * `sessionStorage` — elle survit au rechargement, et meurt avec l'onglet. Un
 * nouvel échec dans la fenêtre qui suit n'est plus une page périmée mais un
 * paquet cassé : l'erreur se dit, au lieu de recharger en boucle. Un
 * chargement réussi efface la date, PASSÉ la fenêtre seulement : un module
 * sain chargé juste avant un module vraiment absent l'aurait effacée, et la
 * boucle revenait. Sans `sessionStorage`, « une fois » ne se garantit pas :
 * on ne recharge pas. Hors ligne non plus — la page d'erreur du navigateur
 * remplacerait la nôtre. La clé est nommée sur la page « cookies » du site
 * (tests/pages_legales.test.mjs).
 *
 * Un DÉCOR (le fond météo, l'orbe) introuvable même après le rechargement ne
 * rend rien : pas d'écran d'erreur pour un décor. Le premier échec recharge
 * quand même — c'est la page qui est périmée, pas le décor, et l'écouteur de
 * Vite ne sait pas quel module a manqué.
 *
 * LA PAGE NE PART QUE SI LE SERVEUR LA SERT (18/11, son retour : « si j'ouvre
 * une popup rien ne s'affiche, je dois relancer l'app »). Home Assistant
 * venait de redémarrer. L'appli garde la page ouverte, et HA répond bien avant
 * d'avoir rechargé Loggia : le composant publie ses fichiers à la FIN de sa
 * mise en route (`__init__.py`, le panneau en dernier) — jusque-là, tout
 * fichier de Loggia rend 404. La première popup demandée dans cette fenêtre
 * échouait, la page repartait AUSSITÔT, retombait sur le même 404 et restait
 * sur « 404: Not Found » : plus une ligne de notre code pour réessayer, seule
 * la relance de l'appli réparait. Hors ligne, c'était l'inverse : pas de
 * rechargement, mais une erreur gravée dans le chargement à la demande — la
 * fiche restait cassée au retour du réseau. Désormais la décision se prend à
 * l'instant (l'écouteur de Vite doit savoir s'il retient l'erreur), et le
 * départ attend que la page elle-même réponde : sa propre adresse, demandée
 * sans cache, redemandée après chaque pause. La popup garde son repli
 * d'ici là. La date du rechargement se pose au DÉPART, pas à l'échec : la
 * fenêtre anti-boucle compte depuis la page neuve, quelle qu'ait été l'attente.
 */
import { lazy } from 'react';

/** La date du dernier rechargement automatique, en millisecondes. */
export const CLE_RECHARGE = 'loggia_recharge_module';
/* Assez pour qu'une tablette lente se recharge et redemande ses modules ;
 * bien trop court pour qu'une seconde mise à jour HACS tombe dedans. */
export const FENETRE_RECHARGE = 2 * 60 * 1000;
/* Les pauses entre deux questions au serveur, en millisecondes : rapprochées
 * d'abord (un redémarrage de HA dure de quelques secondes à une minute), puis
 * la dernière, répétée, tant qu'il ne sert pas la page. */
export const PAUSES_ATTENTE = [2000, 3000, 5000, 10000, 15000];

/* Le décor qui manque se rend vide. `Rien` et non `RIEN` : un nom en
 * capitales désigne, dans ce dépôt, une liste-fonction qu'on appelle
 * toujours (tests/listes_fonctions.test.mjs) ; ceci est un composant. */
const Rien = () => null;

/* Le navigateur, lu à l'appel et non à l'import : les tests chargent ce module
 * sous Node, où `window` n'existe pas. */
const NAVIGATEUR = {
  stockage: () => window.sessionStorage,
  recharger: () => window.location.reload(),
  enLigne: () => typeof navigator === 'undefined' || navigator.onLine !== false,
  maintenant: () => Date.now(),
  /* La page elle-même est-elle servie ? Son adresse, en HEAD (rien à
   * télécharger) et sans cache (le 404 du redémarrage ne doit pas passer pour
   * la page d'hier). 405 : le serveur répond, sans accepter HEAD. */
  pageServie: async () => {
    const r = await fetch(window.location.href, { method: 'HEAD', cache: 'no-store', credentials: 'same-origin' });
    return r.ok || r.status === 405;
  },
  attendre: (ms) => new Promise((r) => setTimeout(r, ms)),
};

/** La règle, liée à un monde : le navigateur, ou celui d'un test. */
export function creerRecharge(monde = NAVIGATEUR) {
  // Le rechargement est décidé : cette page partira dès que le serveur la sert.
  let parti = false;
  // L'âge de la date posée, ou null sans date lisible.
  const age = (s) => {
    const t = Number(s.getItem(CLE_RECHARGE));
    return t > 0 ? monde.maintenant() - t : null;
  };
  const recent = (a) => a != null && a >= 0 && a < FENETRE_RECHARGE;

  // Hors ligne, inutile de demander : la réponse ne viendrait pas.
  const servie = async () => {
    if (!monde.enLigne()) return false;
    try { return (await monde.pageServie()) === true; } catch { return false; }
  };
  /* Attend que la page soit servie, puis part. Un échec du départ lui-même
   * (stockage plein, rechargement refusé) laisse la page telle quelle : ses
   * popups gardent leur repli, comme pendant l'attente. */
  const partirQuandServie = async () => {
    for (let i = 0; !(await servie()); i += 1) {
      await monde.attendre(PAUSES_ATTENTE[Math.min(i, PAUSES_ATTENTE.length - 1)]);
    }
    try {
      monde.stockage().setItem(CLE_RECHARGE, String(monde.maintenant()));
      monde.recharger();
    } catch { /* la page reste */ }
  };

  /** Décide le rechargement, sauf si c'est déjà fait dans la fenêtre. Rend true s'il est décidé ; la page part dès qu'elle est servie. */
  const rechargerUneFois = () => {
    if (parti) return true;
    try {
      if (recent(age(monde.stockage()))) return false;
    } catch { return false; }
    parti = true;
    partirQuandServie();
    return true;
  };

  const reussi = () => {
    try {
      const s = monde.stockage();
      const a = age(s);
      if (a != null && !recent(a)) s.removeItem(CLE_RECHARGE);
    } catch { /* rien à effacer */ }
  };

  /* Ce que `lazy` attend : le module. À l'échec, une attente sans fin si la
   * page repart (`Suspense` garde son repli d'ici là), le décor vide, ou
   * l'erreur d'origine pour l'écran de secours. */
  const charger = async (chargeur, { decor = false } = {}) => {
    const echec = (e) => {
      if (rechargerUneFois()) return new Promise(() => {});
      if (decor) return { default: Rien };
      throw e;
    };
    let m;
    try { m = await chargeur(); } catch (e) { return echec(e); }
    // `undefined` : l'écouteur a retenu l'erreur de Vite pour recharger.
    if (m == null) return echec(new Error('import à la demande vide'));
    reussi();
    return m;
  };

  /* Même règle pour les imports hors React. Rend de quoi retirer l'écouteur. */
  const ecouter = (cible) => {
    if (!cible || typeof cible.addEventListener !== 'function') return () => {};
    const surEchec = (ev) => { if (rechargerUneFois()) ev.preventDefault(); };
    cible.addEventListener('vite:preloadError', surEchec);
    return () => cible.removeEventListener('vite:preloadError', surEchec);
  };

  return { rechargerUneFois, charger, ecouter };
}

const ICI = creerRecharge();

/** `lazy`, avec le rechargement unique. `{ decor: true }` : l'échec définitif ne rend rien. */
export function lazyRecharge(chargeur, options) {
  return lazy(() => ICI.charger(chargeur, options));
}

/** Posé une fois par l'amorce (`boot.jsx`), avant le premier rendu. */
export function ecouterPrechargement(cible) {
  return ICI.ecouter(cible);
}
