/* Le focus qu'un changement d'écran laisse tomber (audit du 03/10).
 *
 * Une vue se remonte EN ENTIER quand on en change : `App` pose `key={view}`
 * sur son conteneur. Le bouton qui venait de servir — « Ouvrir la pièce
 * Salon », une tuile des Paramètres, un retour — part avec l'ancienne vue, et
 * le navigateur renvoie le focus sur <body>. Au clavier, la tabulation
 * suivante repartait du haut de la page, menu compris ; au lecteur d'écran,
 * rien n'était annoncé : la page avait changé sans un mot.
 *
 * On ne reprend la main QUE si le focus est tombé. Un clic dans le menu
 * latéral garde son bouton — il existe toujours, et l'en déloger ferait
 * perdre sa place à qui parcourt le menu.
 *
 * Ni React ni état ici : le module se vérifie sur un faux document
 * (tests/focus_vue.test.mjs), sans navigateur. */

const docCourant = () => (typeof document !== 'undefined' ? document : null);

/** Le focus est-il tombé ? Sur <body> ou sur rien ; sur un élément sorti du
 *  document (certains navigateurs le désignent encore un instant) ; ou dans un
 *  morceau devenu inerte — au téléphone, le tiroir du menu se referme sur le
 *  bouton qu'on vient de toucher, qui garde le focus sans plus servir à rien. */
export function focusPerdu(doc = docCourant()) {
  if (!doc) return false;
  const a = doc.activeElement;
  if (!a || a === doc.body || a === doc.documentElement) return true;
  if (a.isConnected === false) return true;
  return !!(a.closest && a.closest('[inert]'));
}

/** Le titre d'une vue : le premier <h1> de son <main>. Chaque vue en porte un
 *  — l'Accueil le réserve aux lecteurs d'écran (`o-vh`) — et l'en-tête commun
 *  n'en a aucun : le premier est donc le bon. */
export function titreDeVue(racine) {
  if (!racine || typeof racine.querySelector !== 'function') return null;
  return racine.querySelector('main h1') || racine.querySelector('h1');
}

/** Pose le focus sans faire défiler la page. Un titre n'est pas focalisable :
 *  il le devient par script seulement (`tabindex="-1"`), jamais à la
 *  tabulation — React ne gère pas cet attribut sur nos titres, il ne le
 *  retirera pas. `voir` ramène la cible à l'écran, mais seulement quand son
 *  anneau se voit, c'est-à-dire au clavier : au doigt ou à la souris, la page
 *  ne bouge pas sous la main. */
export function poserFocus(el, voir = false) {
  if (!el || typeof el.focus !== 'function') return false;
  try {
    if (el.tabIndex < 0 && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
  } catch { return false; }
  // Un navigateur qui ignore `:focus-visible` lève ici : la cible a déjà le focus.
  try { if (voir && el.matches(':focus-visible')) el.scrollIntoView({ block: 'nearest' }); } catch { /* sélecteur inconnu */ }
  return true;
}

/** Après un changement d'écran : reposer le focus sur ce que `trouver()`
 *  désigne, s'il est tombé. La cible peut tarder — Paramètres et Système se
 *  chargent à la demande, et une vue attend la découverte de la maison avant
 *  d'avoir son titre : on réessaie, trois secondes au plus. On renonce dès que
 *  le focus a été repris ailleurs : qui a déjà tabulé ne doit pas être ramené
 *  en arrière. Rend de quoi annuler — le nettoyage d'un effet, pour qu'un
 *  écran quitté ne vole pas le focus du suivant. */
export function reposerFocus(trouver, { voir = false, essais = 30, pas = 100, doc = docCourant() } = {}) {
  let t = 0, n = 0;
  const essayer = () => {
    if (!focusPerdu(doc)) return;
    const el = trouver();
    if (el) poserFocus(el, voir);
    if (!focusPerdu(doc)) return;
    n += 1;
    if (n < essais) t = setTimeout(essayer, pas);
  };
  essayer();
  return () => clearTimeout(t);
}

/** À la fermeture d'une feuille (relecture du lot 13) : le focus revient au
 *  bouton qui l'a ouverte. Il peut être parti avec ce qu'il désignait —
 *  « Supprimer » retire la ligne d'un profil et son « Modifier ce profil »,
 *  comme toute feuille qui supprime ce qui l'a ouverte. `focus()` sur un nœud
 *  détaché ne fait rien : le focus tombait sur <body>, sans anneau, et le
 *  lecteur d'écran perdait sa place sans un mot. Repli, s'il est tombé :
 *  `hote`, la feuille qui contenait celle-ci (le planning du robot s'ouvre
 *  depuis sa fiche : tout le reste, titre compris, y est inerte), sinon le
 *  titre de la vue. */
export function rendreFocus(prev, hote = null, doc = docCourant()) {
  if (prev && prev.isConnected !== false && typeof prev.focus === 'function') {
    try { prev.focus({ preventScroll: true }); } catch { /* il reste où il est */ }
    return;
  }
  if (!focusPerdu(doc)) return;
  poserFocus(hote && hote.isConnected !== false ? hote : titreDeVue(doc));
}
