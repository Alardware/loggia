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
import { cfgVal, cfgSet } from './state.js';
import { tr } from './i18n.js';

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

// Quantification : le rendu de la carte est legerement bruite (anti-aliasing,
// compression), deux pixels d'une meme piece ne sont jamais identiques au bit
// pres. On regroupe par paliers de 24 niveaux.
const PALIER = 24;
const quant = (v) => Math.min(255, Math.round(v / PALIER) * PALIER);
const hex = (r, g, b) => [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');

/**
 * Regions colorees d'une image.
 *
 * Ne retient que les teintes franches et suffisamment etendues : le fond, les
 * murs, le trajet du robot (blanc) et les hachures sont soit trop sombres, soit
 * trop desatures, soit trop rares pour passer les seuils.
 */
/**
 * Distance de TEINTE, clarte mise de cote.
 *
 * Les hachures et le trace du robot eclaircissent une piece sans en changer la
 * couleur : en RGB brut leur ecart (~45) depasse celui de deux pastels voisins
 * (~40), impossible a departager. Rapporter chaque canal a la somme des trois
 * annule la clarte et ne garde que la teinte.
 */
function ecart(a, b) {
  const sa = (a[0] + a[1] + a[2]) || 1, sb = (b[0] + b[1] + b[2]) || 1;
  const dr = a[0] / sa - b[0] / sb, dg = a[1] / sa - b[1] / sb;
  return Math.sqrt(dr * dr + dg * dg);
}

/**
 * @param {number} attendu  Nombre de pieces que le robot declare. On ne garde
 *   que les regions les plus etendues jusqu'a ce compte : au-dela, ce sont des
 *   variantes de teinte, pas des pieces.
 */
export function detecterPieces(data, w, h, attendu = 0) {
  const seaux = new Map();
  // Un pixel sur deux dans chaque direction : quatre fois moins de travail,
  // pour un resultat identique a cette echelle.
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4;
      if (data[i + 3] < 200) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      // Trop sombre (murs, fond) ou trop gris (trajet, hachures) : ce n'est pas
      // une piece.
      if (max < 90 || max - min < 18) continue;
      const k = hex(quant(r), quant(g), quant(b));
      let s = seaux.get(k);
      if (!s) { s = { n: 0, sx: 0, sy: 0, pts: [] }; seaux.set(k, s); }
      s.n++;
      s.sx += x; s.sy += y;
      s.pts.push(x, y);
    }
  }
  const total = (w * h) / 4;
  // Regroupement des teintes voisines : une piece hachuree ou parcourue par le
  // robot produit plusieurs paliers qui sont la MEME piece.
  const groupes = [];
  [...seaux.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .forEach(([couleur, s]) => {
      const rgb = [parseInt(couleur.slice(0, 2), 16), parseInt(couleur.slice(2, 4), 16), parseInt(couleur.slice(4, 6), 16)];
      // 0,020 : mesure sur une carte hachuree — au-dela, deux pastels
      // distincts fusionnent ; en deca, une meme piece se scinde.
      const proche = groupes.find(g => ecart(g.rgb, rgb) < 0.020);
      if (proche) {
        proche.n += s.n; proche.sx += s.sx; proche.sy += s.sy;
        for (let i = 0; i < s.pts.length; i++) proche.pts.push(s.pts[i]);
      } else {
        groupes.push({ couleur, rgb, n: s.n, sx: s.sx, sy: s.sy, pts: s.pts.slice() });
      }
    });
  const retenus = groupes.filter(g => g.n / total > 0.012);
  // Le robot fait foi sur le NOMBRE de pieces.
  const gardes = attendu > 0 ? retenus.slice(0, attendu) : retenus;
  return gardes
    .map(g => [g.couleur, g])
    .map(([couleur, s]) => {
      // Centre de masse, puis le point REEL de la piece qui s'en approche le
      // plus : sur une forme en L, le centre de masse tombe dans le vide.
      const cx = s.sx / s.n, cy = s.sy / s.n;
      let bx = s.pts[0], by = s.pts[1], best = Infinity;
      for (let i = 0; i < s.pts.length; i += 2) {
        const dx = s.pts[i] - cx, dy = s.pts[i + 1] - cy;
        const d = dx * dx + dy * dy;
        if (d < best) { best = d; bx = s.pts[i]; by = s.pts[i + 1]; }
      }
      // En fractions de l'image : le rendu peut etre a n'importe quelle taille.
      return { couleur, part: s.n / total, x: bx / w, y: by / h };
    })
    .sort((a, b) => b.part - a.part);
}

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
      } catch (e) { /* carte momentanement indisponible : on garde la precedente */ }
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
    } catch (e) {
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
  const libres = useMemo(
    () => pieces.filter(z => !Object.values(assoc).includes(z.id)),
    [pieces, assoc]
  );

  if (!haid) {
    return (
      <div style={{ padding: '28px 10px', textAlign: 'center', fontSize: 12.5, fontWeight: 600, color: 'var(--o-text3)' }}>
        Aucune carte : désigne l’entité <b>image</b> du robot dans Paramètres → Entités.
      </div>
    );
  }

  return (
    <div>
      {/* Encombrement borne en largeur ET en hauteur : sans cela la carte
          s'etire sur toute la largeur de l'ecran, hors de proportion avec ce
          qu'elle montre. */}
      <div style={{ position: 'relative', borderRadius: 'var(--o-radius,16px)', overflow: 'hidden', background: 'var(--o-well2)',
        maxWidth: dims ? Math.round(Math.min(LARG_MAX, HAUT_MAX * dims.w / dims.h)) + 'px' : undefined,
        margin: '0 auto' }}>
        {/* L'image sert de source au canvas ; c'est le canvas qui est affiche,
            deja pivote. */}
        {src && <img ref={imgRef} src={src} alt="" onLoad={analyser} style={{ display: 'none' }} />}
        {src
          ? <canvas ref={cvRef} role="img" aria-label="Plan du logement" style={{ display: 'block', width: '100%', height: 'auto' }} />
          : <div style={{ aspectRatio: '4/3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: 'var(--o-text3)' }}>Carte indisponible</div>}

        {regions.map(r => {
          const z = zoneDe(r.couleur);
          const on = z ? !!selection[z.id] : false;
          return (
            <button key={r.couleur}
              onClick={() => (z ? onToggle && onToggle(z) : setAAssocier(r.couleur))}
              aria-pressed={on}
              aria-label={z ? ((on ? 'Retirer ' : 'Cibler ') + z.name) : 'Associer cette pièce'}
              title={z ? z.name : 'Cliquer pour nommer cette pièce'}
              style={{
                position: 'absolute',
                left: (r.x * 100) + '%', top: (r.y * 100) + '%',
                transform: 'translate(-50%,-50%)',
                minWidth: 34, minHeight: 26, padding: '4px 10px', borderRadius: 999,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', whiteSpace: 'nowrap',
                fontSize: 11, fontWeight: 800,
                background: on ? 'rgba(255,255,255,.94)' : 'rgba(8,13,22,.82)',
                color: on ? '#0b101b' : 'rgba(255,255,255,.88)',
                border: '1.5px solid ' + (on ? '#fff' : z ? 'rgba(255,255,255,.42)' : 'rgba(255,214,102,.75)'),
                boxShadow: '0 2px 8px rgba(0,0,0,.45)',
                transition: 'background .15s, color .15s',
              }}>
              {z ? z.name : '?'}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10, fontSize: 11, fontWeight: 600, color: 'var(--o-text3)', flexWrap: 'wrap' }}>
        <span>{regions.length ? (regions.length > 1 ? tr('{n} pièces détectées', { n: regions.length }) : tr('{n} pièce détectée', { n: regions.length })) : 'Analyse de la carte…'}</span>
        {regions.some(r => !zoneDe(r.couleur)) && <span style={{ color: 'var(--o-warn2)' }}>{tr('Clique une zone « ? » pour la nommer')}</span>}
        <span style={{ flex: 1 }} />
        <button onClick={pivoter} title={tr('Pivoter la carte d’un quart de tour')}
          style={{ padding: '5px 11px', borderRadius: 9, cursor: 'pointer', fontSize: 11, fontWeight: 700, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text2)' }}>
          Pivoter
        </button>
        {Object.keys(assoc).length > 0 && (
          <button onClick={() => { setAssoc({}); cfgSet({ [CLE_ASSOC]: null }); }}
            style={{ padding: '5px 11px', borderRadius: 9, cursor: 'pointer', fontSize: 11, fontWeight: 700, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text2)' }}>{tr('Réassocier les pièces')}</button>
        )}
      </div>

      {aAssocier && (
        <div style={{ marginTop: 12, padding: '13px 14px', borderRadius: 12, background: 'var(--o-s2)', border: 'var(--o-bw,1px) solid var(--o-bd2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
            <span style={{ width: 15, height: 15, borderRadius: 4, background: '#' + aAssocier, border: '1px solid rgba(255,255,255,.35)' }} />
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>{tr('Quelle pièce est-ce ?')}</span>
            <button onClick={() => setAAssocier(null)} aria-label="Annuler"
              style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700, background: 'transparent', border: 'none', color: 'var(--o-text3)' }}>Annuler</button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {libres.length ? libres.map(z => (
              <button key={z.id} onClick={() => associer(aAssocier, z.id)}
                style={{ padding: '7px 13px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700, background: 'var(--o-s1)', border: '1px solid ' + (z.color || 'var(--o-bd2)'), color: z.color || 'var(--o-text1)' }}>
                {z.name}
              </button>
            )) : <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--o-text3)' }}>{tr('Toutes les pièces configurées sont déjà associées.')}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
