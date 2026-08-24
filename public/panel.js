/**
 * Panneau Loggia : l'application en plein ecran, sans passer par Lovelace.
 *
 * Le montage precedent — une carte `iframe` dans un dashboard YAML — dependait
 * de deux modules tiers pour occuper l'ecran : kiosk-mode pour masquer l'entete,
 * card-mod pour etirer la carte. Ils arrivent apres une quarantaine d'autres
 * ressources, et rien ne garantit qu'ils s'appliquent a temps.
 *
 * En acces distant, le service worker sert ces fichiers depuis le cache et tout
 * arrive dans le meme ordre. En acces local, l'adresse est en HTTP : le service
 * worker ne s'installe pas — les contextes non securises l'interdisent — et
 * chaque ouverture retelecharge les ressources dans un ordre variable. D'ou des
 * bandes en haut et en bas sur le reseau domestique, et jamais en mobile.
 *
 * Un panneau natif n'a besoin d'aucun de ces modules : Home Assistant lui donne
 * toute la zone de contenu, et il n'y dessine qu'un cadre.
 */
class LoggiaPanel extends HTMLElement {
  /** Home Assistant pose ces proprietes ; seule `panel` porte notre configuration. */
  set panel(valeur) {
    this._panel = valeur;
    this._monter();
  }

  get panel() {
    return this._panel;
  }

  // `hass` et `narrow` sont poses a chaque changement d'etat. Le cadre lit
  // l'objet du document parent lui-meme : les ignorer evite un travail inutile
  // a chaque mise a jour d'entite.
  set hass(_) {}
  set narrow(_) {}
  set route(_) {}

  connectedCallback() {
    this._monter();
  }

  disconnectedCallback() {
    if (!this._veille || !this._surChangement) return;
    if (this._veille.removeEventListener) this._veille.removeEventListener('change', this._surChangement);
    else this._veille.removeListener(this._surChangement);
  }

  /**
   * Place le panneau selon la largeur de l'ecran.
   *
   * Etroit : la barre laterale est un tiroir pose PAR-DESSUS la page, donc on
   * peut sortir du flux et couvrir l'ecran entier — encoche comprise. Reste
   * dans le flux, Home Assistant n'accorde que la zone situee sous la barre
   * d'etat, et le dashboard s'affiche decale vers le bas.
   *
   * Large : la barre laterale occupe la gauche. Sortir du flux la recouvrirait,
   * on garde donc la hauteur de la fenetre sans toucher a la mise en page.
   *
   * Meme seuil que l'ancien montage Lovelace, pour un rendu identique.
   */
  _placer() {
    const etroit = window.matchMedia('(max-width: 870px)').matches;
    // Pas de `z-index` : le tiroir de la barre laterale doit continuer de
    // s'ouvrir par-dessus.
    this.style.cssText = etroit
      ? 'position:fixed;inset:0;background:#0b101b;'
      // `dvh` suit la hauteur reellement visible, barres comprises ; `vh` reste
      // en repli pour les navigateurs qui ne le connaissent pas.
      : 'display:block;width:100%;height:100vh;height:100dvh;background:#0b101b;';
  }

  _monter() {
    if (this._cadre || !this._panel) return;
    const url = (this._panel.config || {}).url;
    if (!url) return;
    this._placer();
    // La largeur change en tournant l'appareil, ou en repliant la barre
    // laterale sur un ordinateur.
    this._veille = window.matchMedia('(max-width: 870px)');
    this._surChangement = () => this._placer();
    if (this._veille.addEventListener) this._veille.addEventListener('change', this._surChangement);
    else this._veille.addListener(this._surChangement);   // Safari ancien
    const cadre = document.createElement('iframe');
    cadre.src = url;
    cadre.title = 'Loggia';
    cadre.setAttribute('allow', 'fullscreen; autoplay; encrypted-media');
    cadre.style.cssText = 'display:block;width:100%;height:100%;border:0;';
    this.appendChild(cadre);
    this._cadre = cadre;
  }
}

if (!customElements.get('loggia-panel')) {
  customElements.define('loggia-panel', LoggiaPanel);
}
