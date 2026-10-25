/* Ce qu'un modele 3D dit de la maison (chantier Plan 3D, 17/10).
 *
 * Partage par l'ecran du plan (`plan3d.jsx`) et par l'import
 * (`plan3dimport.jsx`) : les deux doivent reconnaitre les MEMES appareils et
 * les MEMES pieces, sinon l'apercu de l'import mentirait.
 *
 * Rien ici ne connait une maison : n'importe quel modele s'importe. Ce que
 * le modele porte lui-meme est lu d'abord, et les liaisons faites a la main
 * (`liens`, sur le serveur) priment :
 *
 *   liens = { '<nom de l'objet>': { entite: 'light.salon' }
 *                              | { piece: 'cuisine' }        (id de zone)
 *                              | { aucun: true } }           (ne plus relier)
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const DOMAINES = ['light', 'switch', 'cover', 'fan', 'climate', 'media_player', 'binary_sensor', 'lock'];
export const ENTITE = new RegExp('^(' + DOMAINES.join('|') + ')\\.[a-z0-9_]+$');

/* GLTFLoader retire les points des noms (`light.x` -> `lightx`) : le nom
 * d'origine reste dans `userData.name`. */
export const nomDe = (o) => (o && ((o.userData && o.userData.name) || o.name)) || '';
export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/** Le noeud qui porte les pieces : la racine, ou son unique enfant. */
const hautDe = (racine) => (racine.children.length === 1 && racine.children[0].children.length ? racine.children[0] : racine);

/** Ce que le modele dit de lui-meme, corrige par les liaisons manuelles. */
export function indexerModele(racine, liens = {}, options = {}) {
  const L = liens || {};
  const entites = new Map();     // entity_id -> { id, noeuds[], meshes[], ampoules[], volet, manuel }
  const entiteDe = new Map();    // noeud -> entity_id
  const pieceDe = new Map();     // noeud -> cle de piece (norm)
  racine.updateMatrixWorld(true);

  const ajouter = (id, o, manuel) => {
    const e = entites.get(id) || { id, noeuds: [], meshes: [], ampoules: [], manuel: false };
    e.noeuds.push(o); e.manuel = e.manuel || manuel;
    entites.set(id, e); entiteDe.set(o, id);
  };
  /* Seul le noeud le plus haut est l'appareil : `light.salon_cordon`, sous
   * `light.salon`, n'en est qu'une piece. */
  /* Un objet delie (`aucun`) emporte son contenu : sans cela, ses pieces
   * (`light.salon_cloche_1`…) deviendraient chacune un appareil. Une liaison
   * manuelle a l'interieur reste possible. */
  const chercher = (o, auto) => {
    const n = nomDe(o); const l = L[n];
    if (l && l.entite) { ajouter(l.entite, o, true); return; }
    if (l && l.piece) pieceDe.set(o, norm(l.piece));
    const encore = auto && !(l && l.aucun);
    if (encore && !(l && l.piece) && ENTITE.test(n)) { ajouter(n, o, false); return; }
    o.children.forEach((c) => chercher(c, encore));
  };
  chercher(racine, true);

  /* Un modele « a plat » (un .obj, ou un export qui a perdu ses groupes) : les
   * morceaux d'une lampe y sont des FRERES — `light.salon_cordon`,
   * `light.salon_1` a cote de `light.salon` —, et chacun passait pour un
   * appareil (63 au lieu de 11 sur le premier .obj reel, 18/10). Chacun va a
   * l'appareil le plus long dont il prolonge le nom : un appareil du modele,
   * ou un appareil qui EXISTE chez Home Assistant (`connus`) — les appliques
   * `switch.exterieur_applique_1` vont a `switch.exterieur` meme quand aucun
   * objet ne porte ce nom-la. Un morceau qui existe lui-meme chez Home
   * Assistant reste un appareil (deux lampes `light.salon` et `light.salon_2`).
   * Sans la liste de Home Assistant, on ne devine rien. */
  const connus = new Set(options.connus || []);
  if (connus.size) {
    const auto = [...entites.keys()].filter((id) => !entites.get(id).manuel);
    const candidats = new Set([...auto, ...connus]);
    const parentDe = (id) => {
      let p = null;
      for (const c of candidats) if (c !== id && id.startsWith(c + '_') && (!p || c.length > p.length)) p = c;
      return p;
    };
    for (const id of auto) {
      if (connus.has(id)) continue;
      let racineId = id; let p = parentDe(id);
      while (p) { racineId = p; p = connus.has(p) ? null : parentDe(p); }
      if (racineId === id) continue;
      const morceau = entites.get(id);
      entites.delete(id);
      morceau.noeuds.forEach((o) => ajouter(racineId, o, false));
    }
  }

  for (const e of entites.values()) {
    for (const noeud of e.noeuds) {
      noeud.traverse((o) => {
        if (!o.isMesh) return;
        /* Un materiau par appareil : deux lampes qui partageaient le meme
         * s'allumaient ensemble (trouve sur le premier modele reel). */
        o.material = o.material.clone();
        e.meshes.push(o);
        /* Un fil, un cordon, un cable de suspension : trop fin pour etre vise,
         * il laisse passer le toucher vers ce qu'il y a derriere (la table). */
        const t = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
        o.userData.fin = [t.x, t.y, t.z].filter((cote) => 0.03 > cote).length >= 2;
        const em = o.material.emissive;
        if (em && em.r + em.g + em.b > 0) e.ampoules.push(o);
      });
    }
    /* Une lampe reliee a la main sur un objet sans materiau lumineux (un
     * modele de Sweet Home 3D) : tout l'objet s'eclaire. */
    if (!e.ampoules.length && e.manuel && /^(light|switch)\./.test(e.id)) {
      for (const m of e.meshes) { m.material.emissive = new THREE.Color(0xffc98a); m.material.emissiveIntensity = 0; e.ampoules.push(m); }
    }
    if (e.id.startsWith('cover.')) e.volet = indexerVolet(e.noeuds[0]);
    /* Un ouvrant : une porte, une fenetre, un portail — relie a un capteur
     * d'ouverture, ou a un `cover` qui n'est pas un volet a lames. */
    if (/^binary_sensor\./.test(e.id) || (e.id.startsWith('cover.') && !e.volet)) e.ouvrants = e.noeuds.map((n) => indexerOuvrant(n, racine));
  }

  /* Les pieces trouvees seules : les enfants du haut qui ne sont pas des
   * appareils et n'ont pas ete delies. */
  const haut = hautDe(racine);
  for (const g of haut.children) {
    const l = L[nomDe(g)];
    if (!pieceDe.has(g) && !entiteDe.has(g) && !(l && l.aucun)) pieceDe.set(g, norm(nomDe(g)));
  }
  const sols = [];
  racine.traverse((o) => {
    if (!o.isMesh || !/^sol_/.test(nomDe(o)) || entiteDe.has(o)) return;
    o.material = o.material.clone();
    sols.push({ mesh: o, base: o.material.color.clone(), boite: new THREE.Box3().setFromObject(o) });
  });
  /* Un battant (`*_ouvrant`, la convention du correctif) que rien ne relie :
   * Loggia ne sait pas s'il est ouvert, il le montre FERME — un modele
   * enregistre fenetres ouvertes les aurait sinon laissees ouvertes a vie. */
  const dejaRelies = new Set();
  for (const e of entites.values()) (e.ouvrants || []).forEach((o) => dejaRelies.add(o.noeud));
  racine.traverse((o) => {
    if (dejaRelies.has(o) || entiteDe.has(o) || !/_ouvrant(_\d+)?$/.test(nomDe(o))) return;
    let dansUnAppareil = false;
    for (let p = o.parent; p; p = p.parent) if (entiteDe.has(p)) dansUnAppareil = true;
    if (!dansUnAppareil) poserOuvrant(indexerOuvrant(o, racine), 0);
  });
  const idx = { racine, haut, entites, entiteDe, pieceDe, sols, liens: L, diagonale: new THREE.Box3().setFromObject(racine).getSize(new THREE.Vector3()).length() || 1 };
  idx.solsPieces = solsDesPieces(idx);
  return idx;
}

/** Un volet : un tablier fait de lames `*_lame_N`, une lame finale, des
 * coulisses `*_coulisse_*` et un coffre `*_coffre`. Un modele enregistre
 * OUVERT a ses lames empilees dans le coffre : on les etale nous-memes, du bas
 * du coffre au bas des coulisses. */
function indexerVolet(noeud) {
  const lames = []; let finale = null; const coulisses = []; let coffre = null;
  noeud.traverse((o) => {
    if (!o.isMesh) return;
    const n = nomDe(o);
    if (/_lame_finale$/.test(n)) finale = o;
    else if (/_lame_\d+$/.test(n)) lames.push(o);
    else if (/_coulisse(_\d+)?$/.test(n)) coulisses.push(o);
    else if (/_coffre$/.test(n)) coffre = o;
  });
  if (!lames.length) return null;
  const rang = (o) => Number((nomDe(o).match(/_(\d+)$/) || [0, 0])[1]);
  lames.sort((a, b) => rang(a) - rang(b));   // lame 1 en haut
  const boite = (o) => new THREE.Box3().setFromObject(o);
  const pile = new THREE.Box3(); lames.forEach((l) => pile.union(boite(l)));
  const haut = coffre ? boite(coffre).min.y : pile.max.y;
  const bas = coulisses.length ? Math.min(...coulisses.map((c) => boite(c).min.y)) : haut - lames.length * (pile.max.y - pile.min.y);
  const pas = Math.max(0.001, (haut - bas) / lames.length);
  const base = (o) => {
    const echelle = new THREE.Vector3(); o.parent.getWorldScale(echelle);
    return { o, local: o.position.y, monde: boite(o).getCenter(new THREE.Vector3()).y, echelle: echelle.y || 1 };
  };
  return { lames: lames.map(base), finale: finale ? base(finale) : null, haut, pas };
}

/** Un ouvrant pivote sur SON ORIGINE, autour de la verticale : c'est la
 * charniere (les battants du correctif de Claude Design, 17/10, y sont poses).
 *  — enregistre TOURNE (une fenetre a 80°) : cet angle est l'ouverture, et
 *    fermer le ramene a 0° ;
 *  — enregistre a plat (une porte) : il s'ouvre a 90°, du cote ou il ne
 *    rentre pas dans un mur. */
const VERTICALE = new THREE.Vector3(0, 1, 0);
function indexerOuvrant(noeud, racine) {
  const base = noeud.quaternion.clone();
  const angles = new THREE.Euler().setFromQuaternion(base, 'YXZ');
  if (Math.abs(angles.y) > 0.09) {
    const plat = angles.clone(); plat.y = 0;
    return { noeud, ferme: new THREE.Quaternion().setFromEuler(plat), ouvert: base };
  }
  const murs = [];
  /* La piece que la porte NOMME (`porte_chambre_ouvrant` → `sol_chambre`) :
   * une porte de chambre s'ouvre dans la chambre. La plus longue gagne
   * (`porte_chambre_lino` est a la chambre de Lino, pas a la chambre). */
  const nom = norm(nomDe(noeud));
  let sienne = null; let longueur = 0;
  racine.traverse((o) => {
    if (!o.isMesh) return;
    const n = nomDe(o);
    if (/^(mur|facade|cloison)/.test(n)) murs.push(new THREE.Box3().setFromObject(o));
    const piece = /^sol_/.test(n) ? norm(n.replace(/^sol_/, '').replace(/_\d+$/, '')) : '';
    if (piece && nom.includes(piece) && piece.length > longueur) { sienne = new THREE.Box3().setFromObject(o); longueur = piece.length; }
  });
  const essai = (signe) => {
    const q = new THREE.Quaternion().setFromAxisAngle(VERTICALE, signe * Math.PI / 2).multiply(base);
    noeud.quaternion.copy(q); noeud.updateMatrixWorld(true);
    /* Le centre se prend sur la boite REELLE : rognee de 2 cm, une porte de
     * 4 cm d'epaisseur devient une boite vide, dont le « centre » vaut 0. */
    const reelle = new THREE.Box3().setFromObject(noeud);
    const c = reelle.getCenter(new THREE.Vector3());
    const rognee = reelle.clone().expandByScalar(-0.01);
    const b = rognee.isEmpty() ? reelle : rognee;
    let gene = 0;
    murs.forEach((m) => { const i = b.clone().intersect(m); if (!i.isEmpty()) { const t = i.getSize(new THREE.Vector3()); gene += t.x * t.y * t.z; } });
    const dedans = !!sienne && c.x >= sienne.min.x && c.x <= sienne.max.x && c.z >= sienne.min.z && c.z <= sienne.max.z;
    return { gene, q, dedans };
  };
  const a = essai(1); const b = essai(-1);
  noeud.quaternion.copy(base); noeud.updateMatrixWorld(true);
  const choix = a.dedans !== b.dedans ? (a.dedans ? a : b) : (b.gene < a.gene ? b : a);
  return { noeud, ferme: base, ouvert: choix.q };
}

const AMBRE = new THREE.Color(0xffb347);
/** Pose un ouvrant a `part` (0 = ferme, 1 = ouvert). Ouvert, il prend une
 * teinte ambre — la porte dessinee des pieces, ambre ouverte, grise fermee. */
export function poserOuvrant(o, part, meshes) {
  const p = Math.max(0, Math.min(1, Number(part) || 0));
  o.noeud.quaternion.slerpQuaternions(o.ferme, o.ouvert, p);
  (meshes || []).forEach((m) => { if (m.material && m.material.emissive) { m.material.emissive.copy(AMBRE); m.material.emissiveIntensity = p > 0 ? 0.35 : 0; } });
}

/** Pose un objet a la hauteur `y` (monde), ses parents n'etant pas tournes. */
function poserY(b, y) { b.o.position.y = b.local + (y - b.monde) / b.echelle; }

/** Pose un volet a `ouvert` (0 = ferme, 100 = ouvert). */
export function poserVolet(v, ouvert) {
  if (!v) return;
  const ferme = 1 - Math.max(0, Math.min(100, Number(ouvert))) / 100;
  const n = Math.round(ferme * v.lames.length);
  v.lames.forEach((l, i) => {
    l.o.visible = i < n;
    if (i < n) poserY(l, v.haut - (i + 0.5) * v.pas);
  });
  if (v.finale) poserY(v.finale, v.haut - (n + 0.5) * v.pas);
}

/** Les pieces de chaque sol, de la plus sure a la moins sure :
 *  1. une liaison manuelle du sol lui-meme ;
 *  2. son propre nom (`sol_sejour_1` dit « Sejour ») ;
 *  3. les groupes qui le recouvrent vu du dessus (15 % au moins), du plus
 *     couvrant au moins couvrant — une salle a manger sans zone renvoie
 *     ainsi au sejour qui partage son sol.
 * Les groupes qui couvrent la moitie de la maison (structure, menuiseries)
 * ne sont pas des pieces. */
function solsDesPieces(idx) {
  const surface = (b) => Math.max(0, b.max.x - b.min.x) * Math.max(0, b.max.z - b.min.z);
  const recouvre = (a, b) => Math.max(0, Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x)) * Math.max(0, Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z));
  const maison = new THREE.Box3();
  idx.sols.forEach((s) => maison.union(s.boite));
  const boites = [];
  for (const [g, cle] of idx.pieceDe) {
    const b = new THREE.Box3().setFromObject(g);
    if (!b.isEmpty() && surface(b) < 0.5 * surface(maison)) boites.push([cle, b]);
  }
  for (const s of idx.sols) {
    const l = idx.liens[nomDe(s.mesh)];
    const manuel = l && l.piece ? [norm(l.piece)] : [];
    const propre = norm(nomDe(s.mesh).replace(/^sol_/, '').replace(/_\d+$/, ''));
    s.groupes = [...manuel, propre, ...boites
      .map(([cle, b]) => [cle, recouvre(s.boite, b) / (surface(s.boite) || 1)])
      .filter(([, r]) => r >= 0.15)
      .sort((a, b) => b[1] - a[1])
      .map(([cle]) => cle)];
  }
  return idx.sols;
}

/** La piece Loggia d'une cle : par id de zone, sinon par nom. */
function pieceDeCle(cle, pieces) {
  return (pieces || []).find((p) => (p.area && norm(p.area) === cle) || norm(p.name) === cle) || null;
}

/** La piece Loggia d'un sol : la premiere de ses cles qui en est une. */
export function pieceDuSol(s, pieces) {
  for (const cle of s.groupes) { const p = pieceDeCle(cle, pieces); if (p) return p; }
  return null;
}

/** Ce qu'un toucher designe. `chemin` va de la scene a l'objet touche.
 * Rend { entite } | { piece } | null, et l'objet a relier en mode edition. */
export function designer(idx, chemin, point, pieces) {
  const appareil = chemin.find((o) => idx.entiteDe.has(o));
  /* L'objet a relier : on remonte depuis le maillage touche tant que le
   * parent reste un OBJET — pas le haut du modele, pas une piece, pas un
   * fourre-tout comme « menuiseries » (139 enfants). */
  let cible = chemin[chemin.length - 1];
  if (appareil) cible = appareil;
  else {
    for (let i = chemin.length - 2; i >= 0; i--) {
      const p = chemin[i];
      if (p === idx.haut || p === idx.racine || idx.pieceDe.has(p) || p.children.length > 30 || !p.parent) break;
      /* « murs », « sols », « menuiseries » : un groupe qui s'etend sur plus du
       * tiers de la maison n'est pas UN objet (vu le 18/10 : toucher un pan
       * de mur designait tous les murs a la fois). */
      if (new THREE.Box3().setFromObject(p).getSize(new THREE.Vector3()).length() > idx.diagonale / 3) break;
      cible = p;
    }
  }
  if (appareil) return { entite: idx.entiteDe.get(appareil), cible };
  for (let i = chemin.length - 1; i >= 0; i--) {
    const cle = idx.pieceDe.get(chemin[i]);
    const p = cle ? pieceDeCle(cle, pieces) : null;
    if (p) return { piece: p, cible };
  }
  const sous = point && idx.solsPieces.find((s) => point.x >= s.boite.min.x && point.x <= s.boite.max.x && point.z >= s.boite.min.z && point.z <= s.boite.max.z);
  const p = sous ? pieceDuSol(sous, pieces) : null;
  return p ? { piece: p, cible } : { cible };
}

/** Le resume d'un modele, pour l'apercu de l'import et l'aide. */
export function resumer(idx, pieces) {
  const cles = new Set();
  idx.solsPieces.forEach((s) => { const p = pieceDuSol(s, pieces); if (p) cles.add(p.name); });
  for (const cle of idx.pieceDe.values()) { const p = pieceDeCle(cle, pieces); if (p) cles.add(p.name); }
  return { appareils: [...idx.entites.keys()], pieces: [...cles] };
}

/* ── Lire un fichier ───────────────────────────────────────────────────── */

class PlanIllisible extends Error {
  constructor(code) { super(code); this.code = code; }
}

function chargeurGltf(manager) {
  return new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
}

/** Un .glb deja en memoire : la scene. Refuse le Draco, que Loggia ne lit pas. */
export function lireGlb(buffer) {
  return new Promise((ok, ko) => {
    try {
      const vue = new DataView(buffer);
      if (buffer.byteLength >= 20 && vue.getUint32(0, true) === 0x46546c67) {
        const long = vue.getUint32(12, true);
        const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, long)));
        const requis = [...(json.extensionsRequired || []), ...(json.extensionsUsed || [])];
        if (requis.includes('KHR_draco_mesh_compression')) { ko(new PlanIllisible('plan_draco')); return; }
      }
    } catch { /* l'analyse dira ce qui ne va pas */ }
    chargeurGltf().parse(buffer, '', (g) => ok(g.scene), () => ko(new PlanIllisible('plan_format')));
  });
}

/** Les fichiers choisis a l'import : un .glb, un .gltf et ses morceaux, ou
 * un .obj avec son .mtl et ses images. Rend { racine, glb } — `glb` quand le
 * fichier en etait deja un, pour l'envoyer tel quel (sa compression gardee). */
export async function lireFichiers(fichiers) {
  const liste = [...fichiers];
  const ext = (f) => (f.name.split('.').pop() || '').toLowerCase();
  const glb = liste.find((f) => ext(f) === 'glb');
  if (glb) {
    const buffer = await glb.arrayBuffer();
    return { racine: await lireGlb(buffer), glb: buffer, nom: glb.name };
  }
  /* Les morceaux se retrouvent par leur nom de fichier, quel que soit le
   * chemin que le .gltf ou le .mtl ecrit devant. */
  const urls = new Map(liste.map((f) => [f.name.toLowerCase(), URL.createObjectURL(f)]));
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((u) => urls.get(decodeURIComponent(u).split(/[\\/]/).pop().toLowerCase()) || u);
  try {
    const gltf = liste.find((f) => ext(f) === 'gltf');
    if (gltf) {
      const texte = await gltf.text();
      if (/KHR_draco_mesh_compression/.test(texte)) throw new PlanIllisible('plan_draco');
      const g = await new Promise((ok, ko) => chargeurGltf(manager).parse(texte, '', ok, ko));
      return { racine: g.scene, glb: null, nom: gltf.name.replace(/\.gltf$/i, '.glb') };
    }
    const obj = liste.find((f) => ext(f) === 'obj');
    if (obj) {
      const [{ OBJLoader }, { MTLLoader }] = await Promise.all([
        import('three/examples/jsm/loaders/OBJLoader.js'),
        import('three/examples/jsm/loaders/MTLLoader.js'),
      ]);
      const chargeur = new OBJLoader(manager);
      const mtl = liste.find((f) => ext(f) === 'mtl');
      /* Un .obj qui annonce son .mtl sans qu'on le joigne s'affichait tout
       * BLANC (le premier import reel, 18/10) : ce sont les couleurs qui
       * manquent, on le dit plutot que d'enregistrer un plan delave. */
      const texteObj = await obj.text();
      if (!mtl && /^mtllib\s/m.test(texteObj)) throw new PlanIllisible('plan_sans_mtl');
      if (mtl) {
        const materiaux = new MTLLoader(manager).parse(await mtl.text(), '');
        materiaux.preload();
        chargeur.setMaterials(materiaux);
      }
      const racine = chargeur.parse(texteObj);
      await attendreTextures(manager);
      return { racine, glb: null, nom: obj.name.replace(/\.obj$/i, '.glb'), aPlat: true };
    }
    throw new PlanIllisible('plan_format');
  } finally {
    setTimeout(() => urls.forEach((u) => URL.revokeObjectURL(u)), 30000);
  }
}

function attendreTextures(manager) {
  return new Promise((ok) => {
    let fini = false;
    const finir = () => { if (!fini) { fini = true; ok(); } };
    manager.onLoad = finir;
    setTimeout(finir, 4000);
  });
}

/** Une scene en un seul .glb, pret a envoyer. */
export async function versGlb(racine) {
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
  return new GLTFExporter().parseAsync(racine, { binary: true, onlyVisible: false });
}
