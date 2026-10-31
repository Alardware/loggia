/* La disposition des cartes : l’agencement enregistré (`layoutOf`, `setLayout`, `applyLayout`) et `useLayoutEditor`, qui range les cartes en édition comme à l’affichage — il reste donc au démarrage.
 * Sorti d’App.jsx tel quel (lot 5 de l’audit du 28/10, ADR 0283) : seuls les imports sont neufs. */
import { useState, useRef, useMemo } from 'react';
import { formatEcran, vueFormat, patchFormat, possede, echangerPartout, sansPart } from '../disposition.js';
import { refletCarte } from '../refletcarte.js';
import { cfgVal, cfgSet, appareilPropre, LOGGIA_INDEX, getHass } from '../state.js';
import { roomEntitiesBrutes } from '../app/decouverte.jsx';
import { useCoarse, useWide } from '../app/ecran.jsx';

// Cartes masquées par l'utilisateur (croix en mode édition), persistées.

/**
 * Agencement d'une piece : ce que l'utilisateur a retire, ajoute, reordonne.
 *
 * La decouverte propose, l'utilisateur dispose. Sans agencement enregistre, une
 * piece affiche exactement ce que la decouverte a trouve — c'est le cas d'une
 * installation neuve, et cela doit le rester apres une remise a zero.
 */
// Agencements, indexes par perimetre. Les pieces en ont un par nom de piece,
// la vue Objets un seul — meme forme, meme code.
function layoutsOf(cfgKey) {
  const v = cfgVal(cfgKey, null);
  return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
}
function layoutOf(cfgKey, scope) {
  const l = layoutsOf(cfgKey)[scope];
  return (l && typeof l === 'object') ? l : {};
}
function setLayout(cfgKey, scope, patch) {
  const all = { ...layoutsOf(cfgKey) };
  const cur = { ...(all[scope] || {}) };
  Object.keys(patch).forEach(k => { if (patch[k] == null) delete cur[k]; else cur[k] = patch[k]; });
  if (!Object.keys(cur).length) delete all[scope];
  else all[scope] = cur;
  cfgSet({ [cfgKey]: Object.keys(all).length ? all : null });
  return all;
}

const ROOM_LAYOUT_KEY = 'loggia_roomlayout';
const roomLayoutOf = (roomName) => layoutOf(ROOM_LAYOUT_KEY, roomName);

/** Nom choisi pour un element dans ce perimetre, ou null. */
function labelIn(layout, id) {
  const v = layout && layout.labels && layout.labels[id];
  return (typeof v === 'string' && v.trim()) ? v : null;
}
const roomLabelOf = (roomName, id) => labelIn(roomLayoutOf(roomName), id);

/** Applique un agencement a la liste proposee par la decouverte. */
function applyLayout(L, derived) {
  const removed = L.removed || [];
  const ids = derived.filter(id => removed.indexOf(id) < 0);
  (L.added || []).forEach(id => { if (removed.indexOf(id) < 0 && ids.indexOf(id) < 0) ids.push(id); });
  const order = L.order || [];
  if (!order.length) return ids;
  // Ce qui n'a pas de rang connu passe apres, sans changer d'ordre entre eux :
  // un appareil apparu depuis ne vient pas se glisser au milieu.
  const rang = (id) => { const i = order.indexOf(id); return i < 0 ? order.length + ids.indexOf(id) : i; };
  return ids.slice().sort((a, b) => rang(a) - rang(b));
}


/**
 * Editeur d'agencement — commun aux vues ordonnables (pieces, objets).
 *
 * `derived` est ce que la decouverte propose ; le hook rend `ids`, la liste
 * telle que l'utilisateur l'a arrangee, et les gestes pour la modifier.
 *
 * Le glisser-deposer suit le patron eprouve : une copie flottante suit le
 * pointeur, la grille ne bouge pas, et rien n'est enregistre avant le depot.
 */
function useLayoutEditor(cfgKey, scope, derived) {
  const [rev, setRev] = useState(0);
  const gridRef = useRef(null);
  const dragRef = useRef(null);
  const [dragId, setDragId] = useState(null);
  // L'ordre PENDANT le geste : les autres cartes se rangent en direct autour
  // de la place visee ; la configuration n'est ecrite qu'a la depose.
  const [ordreTemp, setOrdreTemp] = useState(null);

  const sig = derived.join('|');
  /* La disposition suit le TYPE d'ecran, le contenu suit la maison (retour du
   * 18/09, voir disposition.js) : `layout` est l'agencement tel que CE format
   * le voit, et `write` range chaque cle a sa place. */
  const format = formatEcran(useCoarse(), useWide(1180));
  /* Un écran qui range SA mise en page passe devant son format (ADR 0222) :
   * appareil → type d'écran → ordinateur, réglage par réglage. */
  const appareil = appareilPropre();
  const layout = vueFormat(layoutOf(cfgKey, scope), format, appareil);
  const ids = useMemo(() => applyLayout(vueFormat(layoutOf(cfgKey, scope), format, appareil), derived), [cfgKey, scope, sig, rev, format, appareil]);
  const edits = (layout.removed || []).length + (layout.added || []).length
    + ((layout.order || []).length ? 1 : 0) + Object.keys(layout.labels || {}).length
    + (layout.larges || []).length + (layout.compacts || []).length;

  const vide = (a) => (a && a.length) ? a : null;
  const write = (patch) => { setLayout(cfgKey, scope, patchFormat(layoutOf(cfgKey, scope), format, patch, appareil)); setRev(v => v + 1); };

  // Retirer : on inscrit dans `removed`. Un element ajoute a la main quitte
  // simplement `added` — inutile de le retenir deux fois.
  const remove = (id) => {
    const etaitAjoute = (layout.added || []).indexOf(id) >= 0;
    write({
      added: vide((layout.added || []).filter(x => x !== id)),
      removed: etaitAjoute ? vide(layout.removed) : vide([...(layout.removed || []).filter(x => x !== id), id]),
      // L'ordre n'est nettoyé que s'il est À CE FORMAT (ADR 0221) : celui de
      // l'ordinateur, réécrit ici, figerait le téléphone sur une copie.
      ...(possede(layoutOf(cfgKey, scope), format, 'order', appareil) ? { order: vide((layout.order || []).filter(x => x !== id)) } : {}),
    });
    refleterCarte(cfgKey, id, false);
  };

  // Ajouter, ou retirer si deja present : la feuille de selection est une bascule.
  const toggle = (id) => {
    if (ids.indexOf(id) >= 0) { remove(id); return; }
    // Un identifiant ne peut se trouver dans `removed` que s'il etait propose :
    // lever le retrait suffit alors, sans rien ajouter.
    const etaitRetire = (layout.removed || []).indexOf(id) >= 0;
    write(etaitRetire
      ? { removed: vide((layout.removed || []).filter(x => x !== id)) }
      : { added: vide([...(layout.added || []), id]) });
    refleterCarte(cfgKey, id, true);
  };

  // Deplacer au clavier. On enregistre l'ordre COMPLET : un ordre partiel se
  // reinterprete mal des qu'un element apparait ou disparait.
  const move = (id, delta) => {
    const list = ids.slice();
    const i = list.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return;
    list.splice(j, 0, list.splice(i, 1)[0]);
    write({ order: list });
  };

  /**
   * Changer l'entite d'une carte, et son nom, en UNE seule ecriture.
   *
   * L'identifiant d'une carte EST son entite : en changer veut donc dire la
   * remplacer partout, position et libelle compris. Retirer puis rajouter
   * perdrait les deux, et deux `write` successifs liraient le meme `layout`
   * perime — le second effacerait le premier.
   */
  const replace = (id, neuf, nom) => {
    const cible = (neuf && neuf !== id) ? neuf : id;
    const labels = { ...(layout.labels || {}) };
    const propre = String(nom == null ? (labels[id] || '') : nom).trim();
    delete labels[id];
    if (propre) labels[cible] = propre; else delete labels[cible];
    const patchLabels = Object.keys(labels).length ? labels : null;
    if (cible === id) { write({ labels: patchLabels }); return; }

    // L'ancien ne doit pas revenir par la decouverte ; le nouveau ne doit pas
    // rester barre s'il en venait.
    let added = (layout.added || []).filter(x => x !== id && x !== cible);
    if (derived.indexOf(cible) < 0) added = [...added, cible];
    let removed = (layout.removed || []).filter(x => x !== id && x !== cible);
    if (derived.indexOf(id) >= 0) removed = [...removed, id];
    // L'ordre garde la place de la carte. S'il etait vide, on fige l'ordre
    // affiche : sans lui la carte remplacee sauterait en fin de grille. Les
    // AUTRES formats la gardent aussi : l'identifiant change partout.
    const base = (layout.order || []).length ? layout.order : ids;
    const tout = layoutOf(cfgKey, scope);
    const partout = echangerPartout(tout, id, cible);
    // Un ordre hérité de l'ordinateur a déjà changé partout : le recopier ici
    // couperait ce format de l'ordinateur (ADR 0221).
    const ordre = possede(tout, format, 'order', appareil) ? { order: vide(base.map(x => (x === id ? cible : x))) } : {};
    setLayout(cfgKey, scope, { ...partout, ...patchFormat({ ...tout, ...partout }, format, { added: vide(added), removed: vide(removed), ...ordre, labels: patchLabels }, appareil) });
    setRev(v => v + 1);
  };
  const rename = (id, nom) => replace(id, id, nom);

  /* « Toutes les cartes » : la liste automatique revient partout ; sur une
   * tablette ou un téléphone, l'ordre et les tailles reviennent à ceux de
   * l'ordinateur — la part s'en va, au lieu d'y écrire des vides qui ne
   * suivraient plus jamais rien (ADR 0221). */
  const reset = () => {
    if (format === 'pc' && !appareil) { write({ removed: null, added: null, order: null, labels: null, larges: null, compacts: null, types: null }); return; }
    setLayout(cfgKey, scope, { removed: null, added: null, labels: null, types: null, ...sansPart(layoutOf(cfgKey, scope), format, appareil) });
    setRev(v => v + 1);
  };
  const labelOf = (id) => labelIn(layout, id);
  /* Largeur d'une carte : double = deux emplacements côte à côte, sur toutes
   * les vues à grille. Rangée dans le layout, comme l'ordre et les libellés. */
  const estLarge = (id) => (layout.larges || []).indexOf(id) >= 0;
  const basculerLarge = (id) => {
    const l = layout.larges || [];
    write({ larges: vide(l.indexOf(id) >= 0 ? l.filter(x => x !== id) : [...l, id]) });
  };
  /* Taille d'une carte : compacte = une rangee de 88 px (icone, nom, etat, le
   * controle), standard = deux. C'est ce que bascule le bouton de coin de la
   * carte d'edition (retour user du 15/09 : « le bouton passe la carte en
   * compact »). Rangee dans l'agencement, comme la largeur. */
  const estCompact = (id) => (layout.compacts || []).indexOf(id) >= 0;
  const basculerCompact = (id) => {
    const l = layout.compacts || [];
    write({ compacts: vide(l.indexOf(id) >= 0 ? l.filter(x => x !== id) : [...l, id]) });
  };
  // Plus de TYPE de carte par entite (14/09) : une seule carte, la standard.
  // La cle `types` des anciens agencements reste, sans effet.

  /* Saisir : a la souris, tout de suite ; au doigt, apres un appui court
   * (~200 ms, vibration a la prise) — un doigt qui bouge avant l'echeance
   * defile la page, c'est tout. Une fois saisie, la carte SUIT le pointeur
   * partout, dans tous les sens, tant qu'on la tient (retour user du 14/09 :
   * « je dois pouvoir la bouger n'importe ou tant que je la tiens »), et les
   * autres se rangent en direct autour de la place visee. */
  const saisir = (d) => {
    d.parti = true;
    // La copie qui suit le pointeur. On retire ses commandes : un fantome ne
    // se clique pas.
    d.fantome = d.hote.cloneNode(true);
    Array.prototype.slice.call(d.fantome.querySelectorAll('[data-drag-ui]')).forEach(n => n.remove());
    const r = d.hote.getBoundingClientRect();
    const st = d.fantome.style;
    st.position = 'fixed'; st.left = r.left + 'px'; st.top = r.top + 'px';
    st.width = r.width + 'px'; st.height = r.height + 'px'; st.margin = '0';
    st.pointerEvents = 'none'; st.zIndex = '9999'; st.opacity = '.96';
    st.transform = 'scale(1.04)'; st.transition = 'none'; st.outline = 'none';
    st.boxShadow = '0 22px 48px rgba(0,0,0,.55)';
    d.doc.body.appendChild(d.fantome);
    // Une fois saisie, la page ne defile plus sous la carte.
    d.bloque = (ev) => { try { ev.preventDefault(); } catch {} };
    try { d.doc.addEventListener('touchmove', d.bloque, { passive: false }); } catch {}
    setDragId(d.id);
  };
  const dragStart = (id, e) => {
    const grid = gridRef.current;
    // La carte elle-meme est la prise : on remonte jusqu'a sa case `data-id`.
    const hote = e.currentTarget && (e.currentTarget.closest ? e.currentTarget.closest('[data-id]') : e.currentTarget.parentNode);
    if (!grid || !hote) return;
    const doc = hote.ownerDocument || document;
    const tactile = e.pointerType === 'touch';
    const d = { id, grid, hote, doc, fantome: null, x0: e.clientX, y0: e.clientY, temp: ids.slice(), parti: false, tactile, pret: !tactile };
    dragRef.current = d;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    if (tactile) {
      d.timer = setTimeout(() => {
        const dd = dragRef.current;
        if (!dd || dd !== d) return;
        dd.pret = true;
        try { if (navigator.vibrate) navigator.vibrate(35); } catch {}
        saisir(dd);
      }, 200);
    } else {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const dragMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (d.tactile && !d.pret) {
      // Le doigt bouge avant l'echeance : c'est un defilement, pas une prise.
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) { clearTimeout(d.timer); dragRef.current = null; }
      return;
    }
    if (!d.parti) {
      // En deca du seuil, l'intention est de cliquer, pas de deplacer.
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
      saisir(d);
    }
    // Ecriture directe du style : un rendu React a chaque mouvement saccaderait.
    d.fantome.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(1.04)';
    // La place visee : la case la plus proche du pointeur, mesuree A CHAQUE
    // mouvement — les autres cartes viennent de se ranger, leurs reperes ont bouge.
    let proche = null, dist = Infinity;
    Array.prototype.slice.call(d.grid.querySelectorAll('[data-id]')).forEach(el => {
      const b = el.getBoundingClientRect();
      const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
      const dd = (e.clientX - cx) * (e.clientX - cx) + (e.clientY - cy) * (e.clientY - cy);
      if (dd < dist) { dist = dd; proche = el.getAttribute('data-id'); }
    });
    if (proche == null || proche === d.id) return;
    const i = d.temp.indexOf(d.id), j = d.temp.indexOf(proche);
    if (i < 0 || j < 0 || i === j) return;
    const l = d.temp.slice();
    l.splice(j, 0, l.splice(i, 1)[0]);
    d.temp = l;
    setOrdreTemp(l);
  };

  /** Rend true si le geste etait un appui bref — donc un clic, non un deplacement. */
  const dragEnd = () => {
    const d = dragRef.current;
    dragRef.current = null;
    setDragId(null);
    setOrdreTemp(null);
    if (!d) return false;
    clearTimeout(d.timer);
    try { if (d.bloque) d.doc.removeEventListener('touchmove', d.bloque); } catch {}
    if (!d.parti) return true;
    try { if (d.fantome) d.fantome.remove(); } catch {}
    // Reposee a sa place : rien a enregistrer, on ne salit pas la configuration.
    if (d.temp.join('|') !== ids.join('|')) write({ order: d.temp });
    return false;
  };

  // Relire l'agencement apres une ecriture faite ailleurs (un deplacement de
  // piece a piece, ecrit d'un bloc pour toutes les pieces).
  const rafraichir = () => setRev(v => v + 1);

  return { ids: ordreTemp || ids, edits, layout, gridRef, dragId, dragStart, dragMove, dragEnd, remove, toggle, move, rename, replace, reset, rafraichir, labelOf, estLarge, basculerLarge, estCompact, basculerCompact };
}

/* Les pieces de la maison : celles de la configuration, puis les zones Home
 * Assistant qu'elle ne nomme pas. */
function piecesDeLaMaison() {
  const cfg = cfgVal('loggia_rooms', null);
  const noms = Array.isArray(cfg) ? cfg.map(r => r && r.room).filter(Boolean) : [];
  ((LOGGIA_INDEX && LOGGIA_INDEX.areaList) || []).forEach(z => { if (z && z.name && noms.indexOf(z.name) < 0) noms.push(z.name); });
  return noms;
}
/* UNE CARTE, DEUX VUES (20/10, refletcarte.js) : retirer ou remettre un appareil
 * dans Objets le fait aussi dans sa pièce, et inversement — « c'est logique ». */
function refleterCarte(cfgKey, id, present) {
  if (cfgKey !== OBJ_LAYOUT_KEY && cfgKey !== ROOM_LAYOUT_KEY) return;
  const hass = getHass();
  const r = refletCarte({
    source: cfgKey === OBJ_LAYOUT_KEY ? 'objets' : 'piece', id, present,
    pieces: cfgKey === OBJ_LAYOUT_KEY
      ? piecesDeLaMaison().map(p => ({ nom: p, derive: roomEntitiesBrutes(hass, p).indexOf(id) >= 0, L: layoutOf(ROOM_LAYOUT_KEY, p) }))
      : [],
    objets: layoutOf(OBJ_LAYOUT_KEY, 'objets'),
  });
  if (!r) return;
  const poser = (cle, parts) => {
    const all = { ...layoutsOf(cle) };
    Object.entries(parts).forEach(([s, L]) => { if (Object.keys(L).length) all[s] = L; else delete all[s]; });
    cfgSet({ [cle]: Object.keys(all).length ? all : null });
  };
  if (r.pieces) poser(ROOM_LAYOUT_KEY, r.pieces);
  if (r.objets) poser(OBJ_LAYOUT_KEY, { objets: r.objets });
}
// L'agencement de la vue : ordre, retraits, ajouts, noms — la meme cle qu'avant la refonte.
const OBJ_LAYOUT_KEY = 'loggia_objlayout';

export { layoutsOf, layoutOf, ROOM_LAYOUT_KEY, roomLabelOf, useLayoutEditor, piecesDeLaMaison, OBJ_LAYOUT_KEY };
