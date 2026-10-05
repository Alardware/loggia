/**
 * Plan de l'aspirateur, rendu cliquable.
 *
 * L'integration publie la carte comme une IMAGE : aucune coordonnee de piece,
 * aucune zone exploitable. Mais elle colore chaque piece differemment — on
 * retrouve donc les pieces en lisant les pixels, puis on superpose une zone
 * cliquable sur chacune.
 *
 * L'association region -> piece configuree se fait au premier clic et se
 * memorise par COULEUR : la couleur d'une piece ne change pas d'un
 * rafraichissement a l'autre, contrairement a sa position dans la liste.
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import { cfgVal, cfgSet, compteOrdinaire } from './state.js';
import { tr, trN } from './i18n.js';
import { detecterPieces } from './vacplan_pixels.js';

/** Cle de configuration : { "<couleur hex>": "<id de zone>" }. */
const CLE_ASSOC = 'loggia_vacplan';
/** Quart de tour applique a la carte : 0, 90, 180 ou 270. */
const CLE_ROT = 'loggia_vacrot';
/** Encombrement d'affichage de la carte, en pixels. */
const HAUT_MAX = 430;
const LARG_MAX = 560;

/**
 * Dessine l'image dans un canvas deja dimensionne pour la rotation voulue.
 *
 * Tourner l'image plutot que la balise qui l'affiche evite d'avoir a tourner
 * aussi les pastilles : la detection travaille sur le canvas, donc dans le
 * repere final, et les coordonnees trouvees sont directement les bonnes.
 */
function poser(ctx, img, rot, w, h) {
  ctx.save();
  if (rot === 90) { ctx.translate(w, 0); ctx.rotate(Math.PI / 2); }
  else if (rot === 180) { ctx.translate(w, h); ctx.rotate(Math.PI); }
  else if (rot === 270) { ctx.translate(0, h); ctx.rotate(-Math.PI / 2); }
  // Apres un quart de tour, les axes sont echanges : le dessin occupe h x w.
  ctx.drawImage(img, 0, 0, rot % 180 ? h : w, rot % 180 ? w : h);
  ctx.restore();
}

// Les pieces se lisent dans les pixels de la carte : `detecterPieces`, sortie
// telle quelle dans vacplan_pixels.js (lot 16, 05/10) pour se verifier sous
// node sans React ni canvas.

/**
 * `zones` arrive deja resolu par `vacRooms` : pieces declarees par le robot,
 * rattachees chacune a son interrupteur. Le plan n'a donc pas sa propre liste —
 * cliquer une zone ici et cliquer son bouton dans la liste font le meme geste.
 */
export default function VacPlan({ hass, haid, zones = [], selection = {}, onToggle }) {
  const pieces = zones;
  const [src, setSrc] = useState(null);
  const [regions, setRegions] = useState([]);
  const [aAssocier, setAAssocier] = useState(null);
  const [assoc, setAssoc] = useState(() => cfgVal(CLE_ASSOC, {}) || {});
  // Le robot oriente sa carte selon SA cartographie, sans rapport avec la
  // facon dont on regarde son logement. On la fait donc pivoter, et le choix
  // se retient.
  const [rot, setRot] = useState(() => {
    const v = Number(cfgVal(CLE_ROT, 0));
    return [0, 90, 180, 270].indexOf(v) >= 0 ? v : 0;
  });
  // Dimensions reelles de la carte, une fois pivotee : elles bornent
  // l'affichage.
  const [dims, setDims] = useState(null);
  const imgRef = useRef(null);
  const cvRef = useRef(null);
  const token = hass && hass.auth && hass.auth.data ? hass.auth.data.access_token : null;

  // Meme recuperation que HaImage : le jeton ne quitte pas l'origine Home
  // Assistant, et l'URL objet est liberee au demontage.
  useEffect(() => {
    if (!haid || !token) { setSrc(null); return undefined; }
    let vivant = true, precedent = null;
    const charger = async () => {
      try {
        const res = await fetch(`/api/image_proxy/${haid}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const blob = await res.blob();
        if (!vivant) return;
        const url = URL.createObjectURL(blob);
        setSrc(url);
        if (precedent) URL.revokeObjectURL(precedent);
        precedent = url;
      } catch { /* carte momentanement indisponible : on garde la precedente */ }
    };
    charger();
    // La carte bouge lentement : dix secondes suffisent, et l'analyse des
    // pixels n'est pas gratuite.
    const iv = setInterval(charger, 10000);
    return () => { vivant = false; clearInterval(iv); if (precedent) URL.revokeObjectURL(precedent); };
  }, [haid, token]);

  // Le robot a pu recartographier : on relit quand sa liste change.
  const sigPieces = pieces.map(p => p.id).join('|');

  /** Analyse a chaque nouvelle image : les pieces peuvent avoir ete redecoupees. */
  const analyser = () => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth) return;
    const quart = rot % 180 !== 0;
    const nw = quart ? img.naturalHeight : img.naturalWidth;
    const nh = quart ? img.naturalWidth : img.naturalHeight;
    setDims(d => (d && d.w === nw && d.h === nh) ? d : { w: nw, h: nh });
    // Canvas visible. La carte que publie le robot est minuscule (quelques
    // centaines de pixels) : l'afficher a sa taille la rend illisible, et
    // l'etirer telle quelle la rend floue. On la redessine donc sur un
    // multiple ENTIER de sa taille, sans lissage : les aplats gardent des
    // bords francs, et c'est le navigateur qui adoucit au dernier ajustement.
    const vue = cvRef.current;
    if (vue) {
      const k = Math.max(1, Math.min(8, Math.round(LARG_MAX / nw)));
      vue.width = nw * k; vue.height = nh * k;
      const ctx = vue.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      poser(ctx, img, rot, vue.width, vue.height);
    }
    try {
      const c = document.createElement('canvas');
      // On analyse une reduction : la detection porte sur des aplats, pas sur
      // du detail, et un plan de 1000 px couterait inutilement cher.
      const ech = Math.min(1, 420 / nw);
      c.width = Math.max(1, Math.round(nw * ech));
      c.height = Math.max(1, Math.round(nh * ech));
      const ctx = c.getContext('2d', { willReadFrequently: true });
      poser(ctx, img, rot, c.width, c.height);
      setRegions(detecterPieces(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height, pieces.length));
    } catch {
      // Image d'une autre origine : la lecture des pixels est refusee. On
      // retombe simplement sur une carte non cliquable.
      setRegions([]);
    }
  };

  // Nouvelle liste de pieces, ou quart de tour : on redessine et on relit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { analyser(); }, [sigPieces, rot]);

  const pivoter = () => {
    const v = (rot + 90) % 360;
    setRot(v);
    cfgSet({ [CLE_ROT]: v });
  };

  const associer = (couleur, zoneId) => {
    const neuf = { ...assoc, [couleur]: zoneId };
    setAssoc(neuf);
    cfgSet({ [CLE_ASSOC]: neuf });
    setAAssocier(null);
    const z = pieces.find(x => x.id === zoneId);
    if (z && onToggle) onToggle(z);
  };

  const zoneDe = (couleur) => pieces.find(z => z.id === assoc[couleur]) || null;
  /* Nommer une piece de la carte ecrit `loggia_vacplan`, la configuration de
   * la maison (03/10) : un compte Home Assistant ordinaire ne pourrait jamais
   * l'enregistrer. Il voit les pieces deja nommees et les cible ; les « ? »,
   * l'invite et « Reassocier les pieces » ne lui sont pas montres. Pivoter
   * reste : le quart de tour (`loggia_vacrot`) est de l'apparence. */
  const ordinaire = compteOrdinaire(hass);
  const libres = useMemo(
    () => pieces.filter(z => !Object.values(assoc).includes(z.id)),
    [pieces, assoc]
  );

  /* Pas d'etat « sans carte » ici (audit du 03/10) : la fiche du robot ne
   * monte ce plan que si elle a trouve une image (`idCarte ? planDe() : null`,
   * ficherobot.jsx). L'ancienne branche, jamais atteinte, envoyait vers la
   * section Entites des Parametres, qui n'existe plus. Une image qui ne se
   * charge pas donne « Carte indisponible », plus bas. */
  return (
    <div>
      {/* Encombrement borne en largeur ET en hauteur : sans cela la carte
          s'etire sur toute la largeur de l'ecran, hors de proportion avec ce
          qu'elle montre. */}
      <div style={{ position: 'relative', borderRadius: 'var(--o-radius,18px)', overflow: 'hidden', background: 'var(--o-well2)',
        maxWidth: dims ? Math.round(Math.min(LARG_MAX, HAUT_MAX * dims.w / dims.h)) + 'px' : undefined,
        margin: '0 auto' }}>
        {/* L'image sert de source au canvas ; c'est le canvas qui est affiche,
            deja pivote. */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
        {src && <img ref={imgRef} src={src} alt="" onLoad={analyser} style={{ display: 'none' }} />}
        {src
          /* eslint-disable-next-line jsx-a11y/no-interactive-element-to-noninteractive-role */
          ? <canvas ref={cvRef} role="img" aria-label={tr('Plan du logement')} style={{ display: 'block', width: '100%', height: 'auto' }} />
          : <div style={{ aspectRatio: '4/3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: 'var(--o-text3)' }}>{tr('Carte indisponible')}</div>}

        {regions.filter(r => !ordinaire || zoneDe(r.couleur)).map(r => {
          const z = zoneDe(r.couleur);
          const on = z ? !!selection[z.id] : false;
          // Le nom lu et l'info-bulle se disent dans la langue de l'écran (audit
          // du 03/10) : « Cibler Kitchen » sortait en français.
          return (
            <button key={r.couleur}
              onClick={() => (z ? onToggle && onToggle(z) : setAAssocier(r.couleur))}
              aria-pressed={on}
              aria-label={z ? (on ? tr('Retirer {nom}', { nom: z.name }) : tr('Cibler {nom}', { nom: z.name })) : tr('Associer cette pièce')}
              title={z ? z.name : tr('Cliquer pour nommer cette pièce')}
              style={{
                position: 'absolute',
                left: (r.x * 100) + '%', top: (r.y * 100) + '%',
                transform: 'translate(-50%,-50%)',
                minWidth: 34, minHeight: 26, padding: '4px 10px', borderRadius: 999,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', whiteSpace: 'nowrap',
                fontSize: 11, fontWeight: 800,
                /* Choisie : bleu plein, texte blanc, comme toute puce choisie.
                 * Sinon, une surface OPAQUE du thème : le plan est une image aux
                 * couleurs du robot, une surface translucide y laisserait le
                 * texte à la merci d'un aplat clair. Une pièce encore à nommer
                 * garde son liseré doré (lot 15 de l’audit du 03/10). */
                background: on ? 'var(--o-accent-fond)' : 'var(--o-bg)',
                color: on ? '#fff' : 'var(--o-text)',
                border: '1.5px solid ' + (on ? 'transparent' : z ? 'rgba(var(--o-text3-rgb),.6)' : 'rgba(var(--o-gold-rgb),.75)'),
                boxShadow: '0 2px 8px rgba(0,0,0,.45)',
                transition: 'background .15s, color .15s',
              }}>
              {z ? z.name : '?'}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 10, fontSize: 11, fontWeight: 600, color: 'var(--o-text3)', flexWrap: 'wrap' }}>
        <span>{regions.length ? trN(regions.length, '{n} pièce détectée', '{n} pièces détectées') : tr('Analyse de la carte…')}</span>
        {!ordinaire && regions.some(r => !zoneDe(r.couleur)) && <span style={{ color: 'var(--o-warn2)' }}>{tr('Clique une zone « ? » pour la nommer')}</span>}
        <span style={{ flex: 1 }} />
        <button onClick={pivoter} title={tr('Pivoter la carte d’un quart de tour')}
          style={{ padding: '5px 11px', borderRadius: 10, cursor: 'pointer', fontSize: 11, fontWeight: 700, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text2)' }}>
          {tr('Pivoter')}
        </button>
        {!ordinaire && Object.keys(assoc).length > 0 && (
          <button onClick={() => { setAssoc({}); cfgSet({ [CLE_ASSOC]: null }); }}
            style={{ padding: '5px 11px', borderRadius: 10, cursor: 'pointer', fontSize: 11, fontWeight: 700, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text2)' }}>{tr('Réassocier les pièces')}</button>
        )}
      </div>

      {aAssocier && (
        <div style={{ marginTop: 12, padding: '13px 14px', borderRadius: 14, background: 'var(--o-s2)', border: 'var(--o-bw,1px) solid var(--o-bd2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ width: 15, height: 15, borderRadius: 4, background: '#' + aAssocier, border: '1px solid rgba(255,255,255,.35)' }} />
            <span style={{ fontSize: 12, fontWeight: 700 }}>{tr('Quelle pièce est-ce ?')}</span>
            <button onClick={() => setAAssocier(null)} aria-label={tr('Annuler')}
              style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 10, cursor: 'pointer', fontSize: 11, fontWeight: 700, background: 'transparent', border: 'none', color: 'var(--o-text3)' }}>{tr('Annuler')}</button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {libres.length ? libres.map(z => (
              <button key={z.id} onClick={() => associer(aAssocier, z.id)}
                style={{ padding: '7px 13px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700, background: 'var(--o-s1)', border: '1px solid ' + (z.color || 'var(--o-bd2)'), color: z.color || 'var(--o-text1)' }}>
                {z.name}
              </button>
            )) : <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)' }}>{tr('Toutes les pièces configurées sont déjà associées.')}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
