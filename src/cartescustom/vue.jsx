/* Une vue personnalisée, chargée à la demande.
 * Sorti d’App.jsx tel quel (lot 5 de l’audit du 28/10, ADR 0283) : seuls les imports sont neufs. */
import { useState, useEffect, useRef } from 'react';
import { cvKey, cvInp, Fi, cvEstTpl, BottomSheet, TitreFeuille, TplForm } from '../ui.jsx';
import { tr, trN } from '../i18n.js';
import { useDomainCards } from '../appareils/fiches.jsx';
import { OUTILS_VUES } from '../outilsvues.js';

// Emprunté au monolithe (outilsvues.js) : App.jsx le pose avant le premier rendu.
const {
  BandeauEdition, CarteAjoutSheet, ChipsEditSheet, CvTyped, EditableCard, FicheCarte, Header, cvAvecH, cvAvecW, cvRowsDe,
  cvTypeDe, cvTypeNoms, cvW, nomCv
} = OUTILS_VUES;
// Une liste-fonction se prête appelée (tests/listes_fonctions.test.mjs).
const CV_TYPE_NOMS = () => cvTypeNoms();

function CustomView({ cv, hass, edit = false, onSave }) {
  /* Le nom qu'on LIT d'une carte : son entite nommee, ou le titre d'un
   * template. La cle (`light.salon`, `graph:sensor.x`) est un identifiant, et
   * un lecteur d'ecran l'epelait (audit du 23/09). */
  /* Lot 13 de l'audit du 03/10 : une carte SANS entité (présence, horloge,
   * ouvrants…) se nomme par sa carte — sa clé, `presence:1791…`, s'épelait
   * encore ; et deux cartes d'une même entité (la compacte et le graphique)
   * ne portent plus le même nom : le type suit le nom, sauf la compacte. */
  const nomCarte = (x) => nomCv(x, hass);
  // Mode édition en place : la CARTE ENTIÈRE se saisit et se déplace (ses
  // contrôles sont inertes pendant l'édition), la barre d'outils de la carte
  // porte le changement de dessin, la largeur et le retrait. Tuile
  // « + Ajouter une carte », renommage inline.
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState(false);
  // Carte template en cours d'édition (crayon en mode édition) — TplForm prérempli, l'id survit.
  const [tplEdit, setTplEdit] = useState(null);
  const [nameDraft, setNameDraft] = useState(cv.name);
  // Carte posée dont on change le dessin (crayon), et carte chips dont on
  // compose la rangée.
  const [retype, setRetype] = useState(null);
  const [chipsEdit, setChipsEdit] = useState(null);
  /* La FICHE d'une carte (06/10), comme dans les vues de la maison : on clique
   * la tuile, elle s'ouvre, et tout s'y règle — le dessin, la taille, la
   * largeur, le retrait. */
  const [fiche, setFiche] = useState(null);
  useEffect(() => { setNameDraft(cv.name); setRenaming(false); setAdding(false); setTplEdit(null); setRetype(null); }, [cv.id, edit]);
  const setEnts = (ents) => onSave && onSave({ ...cv, ents });
  const dc = useDomainCards(hass);
  /* ── Déplacement : saisir la carte ─────────────────────────────────────────
   * Pointer capture sur le wrapper ; au mouvement, la carte sous le doigt
   * (elementFromPoint → wrapper [data-cvk]) désigne la place d'insertion. La
   * liste se réordonne EN DIRECT dans un état local — le doigt voit ce qu'il
   * fait — et l'enregistrement n'a lieu qu'au relâcher, comme les sliders. */
  const [dragCle, setDragCle] = useState(null);
  const [ordreDrag, setOrdreDrag] = useState(null);
  const grilleRef = useRef(null);
  /* Au doigt : APPUI LONG (200 ms, vibration) avant de saisir — sinon le
   * défilement déplaçait les cartes. Un doigt qui bouge avant l'échéance
   * défile normalement. */
  const dragTimer = useRef(null);
  const dragDebut = useRef(null);
  /* Ce qui distingue un CLIC d'un glisser : la carte a-t-elle pris l'appui, et
   * a-t-elle bougé ? Deux références, pas deux états : rien à redessiner. */
  const appuiRef = useRef(false);
  const bougeRef = useRef(false);
  /* Renvoie VRAI si la carte a pris l'appui (06/10). L'agencement des vues de
   * la maison en dit autant par sa référence de glisser : sans cette réponse,
   * un appui sur un bouton de coin passait pour un clic sur la carte, et la
   * fiche s'ouvrait à chaque bascule de taille ou de largeur. */
  const debutDrag = (e, x) => {
    if (!edit) return false;
    // ×, coin — mais pas la surface : c'est elle qu'on saisit (lot 13).
    if (e.target.closest && e.target.closest('button:not(.o-surface)')) return false;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    if (e.pointerType === 'touch') {
      dragDebut.current = { x: e.clientX, y: e.clientY, cle: cvKey(x) };
      clearTimeout(dragTimer.current);
      dragTimer.current = setTimeout(() => {
        if (!dragDebut.current) return;
        try { if (navigator.vibrate) navigator.vibrate(35); } catch {}
        setDragCle(dragDebut.current.cle);
        setOrdreDrag([...cv.ents]);
      }, 200);
      return true;
    }
    e.preventDefault();
    setDragCle(cvKey(x));
    setOrdreDrag([...cv.ents]);
    return true;
  };
  const mouvDrag = (e) => {
    if (dragCle == null && dragDebut.current) {
      // Avant l'échéance : un mouvement franc = défilement, on lâche.
      if (Math.abs(e.clientX - dragDebut.current.x) > 10 || Math.abs(e.clientY - dragDebut.current.y) > 10) {
        clearTimeout(dragTimer.current); dragDebut.current = null;
      }
      return;
    }
    if (dragCle == null || !ordreDrag) return;
    const sous = document.elementFromPoint(e.clientX, e.clientY);
    const cible = sous && sous.closest ? sous.closest('[data-cvk]') : null;
    if (!cible) return;
    const cleCible = cible.getAttribute('data-cvk');
    if (cleCible === dragCle) return;
    const de = ordreDrag.findIndex(x => cvKey(x) === dragCle);
    const vers = ordreDrag.findIndex(x => cvKey(x) === cleCible);
    if (de < 0 || vers < 0) return;
    const a = [...ordreDrag];
    const [pris] = a.splice(de, 1);
    a.splice(vers, 0, pris);
    bougeRef.current = true;
    setOrdreDrag(a);
  };
  const finDrag = () => {
    clearTimeout(dragTimer.current); dragDebut.current = null;
    if (dragCle != null && ordreDrag) setEnts(ordreDrag);
    setDragCle(null); setOrdreDrag(null);
  };
  const liste = ordreDrag || cv.ents;
  const basculerW = (x) => setEnts(cv.ents.map(y => cvKey(y) === cvKey(x) ? cvAvecW(x) : y));
  const basculerH = (x) => setEnts(cv.ents.map(y => cvKey(y) === cvKey(x) ? cvAvecH(x) : y));

  /* L'AGENCEMENT, dans la forme qu'attend `EditableCard` (06/10). Les vues de
   * la maison éditent leurs cartes par une tuile qu'on attrape et qu'on clique
   * — « je veux comme pour les vues lumieres, objets etc... ». Les vues
   * personnalisées avaient leur propre mécanique : une barre d'outils flottante
   * sur la carte. Plutôt que de dupliquer la tuile, on donne ici à celle des
   * autres vues l'interface qu'elle connaît, au-dessus de `cv.ents`.
   *
   * `dragEnd` doit dire si le relâcher était un CLIC : la tuile n'ouvre la
   * fiche que dans ce cas, sans quoi un glisser l'ouvrirait en arrivant. */
  const parCle = new Map(cv.ents.map(x => [cvKey(x), x]));
  const de = (cle) => parCle.get(cle);
  /* Sous le nom, le TYPE de carte — c'est ce qu'on vient changer ici, là où
   * une vue de la maison lit le domaine de son entité. Une carte sans type
   * nommé (un identifiant nu, posé par un ancien agencement) n'en affiche
   * aucun plutôt qu'un mot vide. */
  const sousCarte = (x) => CV_TYPE_NOMS()[cvTypeDe(x)] || null;
  const edCv = {
    dragId: dragCle,
    dragStart: (cle, e) => { appuiRef.current = debutDrag(e, de(cle)); bougeRef.current = false; },
    dragMove: mouvDrag,
    /* Un clic, c'est un appui PRIS PAR LA CARTE qui n'a rien déplacé. Sans la
     * première condition, appuyer sur un bouton de coin ouvrait la fiche ;
     * sans la seconde, déposer une carte l'ouvrait en arrivant. */
    dragEnd: () => {
      const clic = appuiRef.current && !bougeRef.current;
      appuiRef.current = false;
      bougeRef.current = false;
      finDrag();
      return clic;
    },
    move: (cle, pas) => {
      const i = cv.ents.findIndex(y => cvKey(y) === cle);
      const j = i + pas;
      if (i < 0 || j < 0 || j >= cv.ents.length) return;
      const a = [...cv.ents];
      const [pris] = a.splice(i, 1);
      a.splice(j, 0, pris);
      setEnts(a);
    },
    remove: (cle) => setEnts(cv.ents.filter(y => cvKey(y) !== cle)),
    estLarge: (cle) => cvW(de(cle)) === 2,
    basculerLarge: (cle) => basculerW(de(cle)),
    estCompact: (cle) => cvRowsDe(de(cle)) === 1,
    basculerCompact: (cle) => basculerH(de(cle)),
  };
  /* Au clavier (ADR 0068) : la carte a le focus en edition, les fleches la
   * deplacent d'un cran — meme regle que les sections de l'Accueil. */
  return (
    <main className="loggia-main" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <Header />
      <div className="loggia-content" style={{ padding: '26px 28px 56px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {edit && <BandeauEdition onAjouter={() => setAdding(true)}
          texte={tr('Mode édition : attrapez une carte pour la déplacer, cliquez-la pour la régler, ou ajoutez-en une.')} />}
        <div>
          {edit && renaming
            ? <div style={{ display: 'flex', gap: 10, alignItems: 'center', maxWidth: 420 }}>
                <input value={nameDraft} onChange={e => setNameDraft(e.target.value)}
                  aria-label={tr('Nom de la vue')} autoFocus style={cvInp} />
                <button onClick={() => { const n = nameDraft.trim(); if (n) onSave && onSave({ ...cv, name: n }); setRenaming(false); }} style={{ padding: '11px 16px', borderRadius: 10, background: 'var(--o-accent-fond)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', flexShrink: 0 }}>OK</button>
              </div>
            : <h1 style={{ margin: 0, fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 36, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 12 }}>
                {edit
                  ? <button onClick={() => setRenaming(true)} aria-label={tr('Renommer la vue') + ' ' + cv.name /* le nom AFFICHÉ reste dans le nom lu (lot 13 de l'audit du 03/10, WCAG 2.5.3) */}
                      style={{ font: 'inherit', color: 'inherit', background: 'none', border: 0, padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 12 }}>
                      {cv.name}<Fi i="pencil" size={16} color="var(--o-text3)" />
                    </button>
                  : cv.name}
              </h1>}
          <div style={{ fontSize: 14, color: 'var(--o-text2)', fontWeight: 600, marginTop: 4 }}>{trN(cv.ents.length, '{n} entité', '{n} entités')}</div>
        </div>
        {/* Grille DENSE : chaque carte déclare sa hauteur en rangées (.grid-custom
          * pose l'auto-flow dense et l'unité de rangée) — les trous se comblent. */}
        <div ref={grilleRef} className="grid-custom" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', columnGap: 16, rowGap: 8 }}>
          {liste.map((x) => {
            const cle = cvKey(x);
            const saisie = dragCle === cle;
            /* EN EDITION, la TUILE des autres vues (06/10) : on l'attrape pour
             * deplacer, on la clique pour ouvrir sa fiche. Elle remplace la
             * carte, comme dans Objets — la barre d'outils flottante qui se
             * posait dessus a disparu. */
            if (edit) {
              return (
                <div key={cle} data-cvk={cle} className={[cvW(x) === 2 ? 'o-cvw2' : '', saisie ? 'o-saisie' : ''].filter(Boolean).join(' ') || undefined}
                  style={{ position: 'relative', minWidth: 0, gridRow: 'span ' + cvRowsDe(x) }}>
                  <EditableCard ed={edCv} id={cle} nom={nomCarte(x)} hass={hass}
                    entite={typeof x === 'string' ? x : (x.id || cle)} sous={sousCarte(x)}
                    onEdit={() => setFiche(x)} />
                </div>
              );
            }
            return (
            <div key={cle} data-cvk={cle} className={cvW(x) === 2 ? 'o-cvw2' : undefined}
              style={{ position: 'relative', minWidth: 0, gridRow: 'span ' + cvRowsDe(x) }}>
              <div className="o-cvfit" style={{ height: '100%' }}>
                <CvTyped x={x} hass={hass} dc={dc} />
              </div>
            </div>
            );
          })}
          {edit && (
            <button onClick={() => setAdding(true)} style={{ minHeight: 88, borderRadius: 'var(--o-radius,18px)', border: '2px dashed rgba(var(--o-accent-rgb),.45)', background: 'rgba(var(--o-accent-rgb),.06)', color: 'var(--o-accent-soft)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 700, fontSize: 13 }}>
              <span style={{ fontSize: 19, lineHeight: 1 }}>+</span>{tr('Ajouter une carte')}
            </button>
          )}
        </div>
        {!edit && !cv.ents.length && <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 13, color: 'var(--o-text3)', fontWeight: 600 }}>{tr('Vue vide — activez le crayon (en haut) pour ajouter des cartes.')}</div>}
        {fiche && (
          <FicheCarte x={de(cvKey(fiche)) || fiche} nom={nomCarte(de(cvKey(fiche)) || fiche)} sous={sousCarte(de(cvKey(fiche)) || fiche)}
            onTaille={basculerH} onLargeur={basculerW}
            onChanger={(y) => (cvEstTpl(y) ? setTplEdit(y) : cvTypeDe(y) === 'chips' ? setChipsEdit(y) : setRetype(y))}
            onRetirer={(y) => edCv.remove(cvKey(y))} onClose={() => setFiche(null)} />
        )}
        {dc.sheets}
        {tplEdit && (
          <BottomSheet onClose={() => setTplEdit(null)}>
            {close => (<>
              <TitreFeuille style={{ fontSize: 19, fontWeight: 700 }} marge={12}>{tr('Modifier la carte template')}</TitreFeuille>
              <TplForm hass={hass} initial={tplEdit} onAdd={(t) => { setEnts(cv.ents.map(y => cvKey(y) === cvKey(tplEdit) ? t : y)); close(); }} />
            </>)}
          </BottomSheet>
        )}
        {/* Une carte chips arrive vide : on enchaîne sur son compositeur. */}
        {adding && <CarteAjoutSheet hass={hass} onClose={() => setAdding(false)} onPose={(e) => { setEnts([...cv.ents, e]); if (cvTypeDe(e) === 'chips') setChipsEdit(e); }} />}
        {retype && <CarteAjoutSheet hass={hass} remplace={retype} onClose={() => setRetype(null)} onPose={(e) => setEnts(cv.ents.map(y => cvKey(y) === cvKey(retype) ? e : y))} />}
        {chipsEdit && <ChipsEditSheet x={chipsEdit} hass={hass} onClose={() => setChipsEdit(null)}
          onSave={(n) => { setChipsEdit(n); setEnts(cv.ents.map(y => cvKey(y) === cvKey(chipsEdit) ? n : y)); }} />}
        </div>
    </main>
  );
}

export { CustomView };
