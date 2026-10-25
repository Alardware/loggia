/* Le plan de la maison en 3D (chantier Plan 3D, 17/10).
 *
 * Ce que le plan montre : les lumieres (l'ampoule et une lueur dans la
 * piece), les volets (les lames suivent `current_position`), la temperature
 * de chaque piece (le sol prend la teinte de sa zone de confort). Les portes
 * et fenetres viendront d'un correctif a part — rien ici ne les anime.
 *
 * Toucher n'agit JAMAIS sur un appareil : une lampe ou un volet ouvre sa
 * fiche (`onEntite`), le reste d'une piece ouvre la piece (`onPiece`). En
 * mode edition, le toucher designe l'objet a relier (`onObjet`) et l'encadre.
 *
 * Le fichier arrive par `charger()` (une promesse d'ArrayBuffer) : la route
 * authentifiee du composant, ou le modele de la demo. Ce qu'il contient est
 * lu par `plan3dmodele.js`, le meme code que l'apercu de l'import.
 *
 * Le rendu se fait a la demande : une image quand la camera bouge, qu'un
 * etat change ou que la taille change — pas de boucle qui tourne pour rien. */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { tr } from './i18n.js';
import { indexerModele, poserVolet, poserOuvrant, pieceDuSol, designer, resumer, lireGlb, nomDe } from './plan3dmodele.js';
import { estMuetVolet, positionDe } from './voletecran.js';
import { afficherCourse, useCoursesVolets } from './voletcourse.js';

/** Lit un `var(--o-x)` sur la page : le GLSL ne connait pas les variables CSS. */
function couleurCss(valeur, hote) {
  if (!valeur) return null;
  let v = String(valeur).trim();
  const m = v.match(/^var\((--[^,)]+)/);
  if (m) v = getComputedStyle(hote || document.documentElement).getPropertyValue(m[1]).trim();
  if (!v) return null;
  try { return new THREE.Color(v); } catch { return null; }
}

/* La position d'un cover à l'écran : la course jouée s'il en court une (un
 * geste, un ordre du serveur, `opening` / `closing` — voletcourse.js), sinon la
 * position publiée. `null` : muet, absent, ou en mouvement sans position. */
function positionCourse(id, st) {
  if (estMuetVolet(st)) return null;
  const c = afficherCourse(id, st);
  return c && c.pos != null ? c.pos : positionDe(st);
}

/* Un volet dont on ne sait rien : la pose du modèle tel qu'il a été dessiné —
 * ni ouvert, ni fermé par nous. `poserVolet` déplace les lames depuis leur
 * place d'origine (`local`) : on les y remet. */
function voletNeutre(v) {
  if (!v) return;
  v.lames.forEach((l) => { l.o.visible = true; l.o.position.y = l.local; });
  if (v.finale) v.finale.o.position.y = v.finale.local;
}

function etatLumiere(st) {
  if (!st || st.state !== 'on') return null;
  const a = st.attributes || {};
  const bri = a.brightness != null ? Math.max(0.15, Number(a.brightness) / 255) : 1;
  const rgb = Array.isArray(a.rgb_color) ? new THREE.Color(a.rgb_color[0] / 255, a.rgb_color[1] / 255, a.rgb_color[2] / 255) : null;
  return { bri, rgb };
}

/**
 * @param charger   () => Promise<ArrayBuffer> ; rejette `{ code: 'plan_absent' }` sans plan
 * @param cle       change quand le plan change (sa version) : on recharge
 * @param liens     liaisons manuelles (cf. plan3dmodele.js)
 * @param pieces    [{ name, area, teinte }] — `teinte` : une couleur CSS ou `var(--o-…)`
 * @param vide      ce qu'on montre sans plan (le bouton d'import pour un administrateur)
 */
export default function Plan3D({ hass, charger, cle = '', liens = null, pieces = [], edition = false, selection = null,
  onPiece, onEntite, onObjet, onPret, vide = null, hauteur = null }) {
  const hoteRef = useRef(null);
  const sceneRef = useRef(null);   // { appliquer, encadrer }
  const [etat, setEtat] = useState('charge');   // charge | pret | absent | erreur | draco | sansgl
  const rappels = useRef({});
  rappels.current = { onPiece, onEntite, onObjet, onPret, pieces, edition, charger };
  const hassRef = useRef(hass);
  hassRef.current = hass;
  const liensCle = JSON.stringify(liens || {});

  useEffect(() => {
    const hote = hoteRef.current;
    if (!hote) return undefined;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch { setEtat('sansgl'); return undefined; }
    let fini = false;
    setEtat('charge');
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';
    hote.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 400);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x50505a, 1.5));
    const soleil = new THREE.DirectionalLight(0xffffff, 1.4);
    soleil.position.set(6, 12, 5);
    soleil.castShadow = true;
    /* Une carte d'ombre plus petite au telephone : le rendu se fait a la
     * demande, mais chaque image la recalcule. */
    const fin = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    soleil.shadow.mapSize.set(fin ? 1024 : 2048, fin ? 1024 : 2048);
    soleil.shadow.bias = -0.0005;
    soleil.shadow.normalBias = 0.02;
    scene.add(soleil);
    scene.add(soleil.target);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.maxPolarAngle = Math.PI * 0.45;   // jamais sous le sol
    controls.minPolarAngle = 0.05;

    let demande = 0;
    const rendre = () => {
      if (demande || fini) return;
      demande = requestAnimationFrame(() => { demande = 0; if (!fini) renderer.render(scene, camera); });
    };
    controls.addEventListener('change', rendre);

    let idx = null; const lueurs = new Map(); let cadre = null;

    /* Le cadrage : la maison entiere, a la taille REELLE du cadre (lue ici,
     * pas seulement par le ResizeObserver, qui ne tire pas toujours). Il se
     * refait quand la taille change, tant qu'on n'a pas bouge la vue. */
    let bouge = false;
    controls.addEventListener('start', () => { bouge = true; });
    const cadrer = () => {
      if (!idx) return;
      const w = hote.clientWidth || 1; const h = hote.clientHeight || 1;
      camera.aspect = w / h; camera.updateProjectionMatrix();
      const boite = new THREE.Box3().setFromObject(idx.racine);
      const centre = boite.getCenter(new THREE.Vector3());
      const r = boite.getSize(new THREE.Vector3()).length() / 2 || 1;
      controls.target.copy(centre);
      camera.near = r / 100; camera.far = r * 20; camera.updateProjectionMatrix();
      /* La vue par defaut (sa capture du 18/10) : DE DESSUS, un peu inclinee,
       * face au long cote de la maison — toutes les pieces se lisent comme sur
       * un plan, les murs gardent leur epaisseur. La meme sur tous les ecrans ;
       * c'est la distance qui s'adapte, pour que la maison entiere tienne. */
      const taillePlan = boite.getSize(new THREE.Vector3());
      const longX = taillePlan.x >= taillePlan.z;
      const sens = (longX ? new THREE.Vector3(0, 2.2, 1) : new THREE.Vector3(1, 2.2, 0)).normalize();
      /* Le soleil suit la maison : ses ombres douces donnent le relief. */
      soleil.position.copy(centre).add(new THREE.Vector3(-0.35 * r, 1.6 * r, 0.6 * r));
      soleil.target.position.copy(centre);
      soleil.target.updateMatrixWorld();
      const ombre = soleil.shadow.camera;
      ombre.left = -r; ombre.right = r; ombre.top = r; ombre.bottom = -r;
      ombre.near = 0.1; ombre.far = r * 4;
      ombre.updateProjectionMatrix();
      const coins = [];
      for (const x of [boite.min.x, boite.max.x]) for (const y of [boite.min.y, boite.max.y]) for (const z of [boite.min.z, boite.max.z]) coins.push(new THREE.Vector3(x, y, z));
      const tient = (d) => {
        camera.position.copy(centre).addScaledVector(sens, d);
        camera.lookAt(centre);
        camera.updateMatrixWorld();
        return coins.every((c) => { const p = c.clone().project(camera); return Math.abs(p.x) <= 0.97 && Math.abs(p.y) <= 0.97 && p.z < 1; });
      };
      /* La distance la plus courte ou les huit coins tiennent dans le cadre. */
      let pres = r * 0.3; let loin = r * 8;
      for (let i = 0; i < 24; i++) { const m = (pres + loin) / 2; if (tient(m)) loin = m; else pres = m; }
      const recul = loin;
      tient(recul);
      controls.minDistance = r * 0.5;
      controls.maxDistance = Math.max(r * 3, recul * 1.5);
      controls.update();
    };

    const taille = () => {
      const w = hote.clientWidth || 1; const h = hote.clientHeight || 1;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (!bouge) cadrer();
      rendre();
    };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(taille) : null;
    if (ro) ro.observe(hote);
    taille();


    /* Les etats de HA sur le modele. Appele a chaque nouveau `hass`. */
    const appliquer = (H) => {
      if (!idx) return;
      const S = (H && H.states) || {};
      for (const e of idx.entites.values()) {
        const st = S[e.id];
        /* Une porte, une fenetre, un portail : ouvert = capteur `on`, ou la
         * position d'un `cover` (un portail a moitie ouvert l'est a moitie). */
        if (e.ouvrants && e.ouvrants.length) {
          /* Un `cover` muet ou absent (`positionDe` nulle) : fermé et sans
           * lueur, comme un capteur muet — on ne dessine pas ce qu'on ignore. */
          const pos = e.id.startsWith('cover.') ? positionCourse(e.id, st) : null;
          const part = e.id.startsWith('cover.')
            ? (pos != null ? pos / 100 : 0)
            : (st && st.state === 'on' ? 1 : 0);
          e.ouvrants.forEach((o) => poserOuvrant(o, part, e.meshes));
          continue;
        }
        if (e.id.startsWith('cover.')) {
          /* Un volet muet ou absent était dessiné ouvert à 100 % (19/10) : il
           * reprend la pose du modèle, neutre. Sinon, la position que la carte
           * dessine — la course jouée comprise (voletcourse.js). */
          const pos = positionCourse(e.id, st);
          if (pos == null) voletNeutre(e.volet);
          else poserVolet(e.volet, pos);
          continue;
        }
        if (!e.ampoules.length) continue;
        const l = /^(light|switch)\./.test(e.id) ? etatLumiere(st) : null;
        for (const m of e.ampoules) {
          m.material.emissiveIntensity = l ? 0.6 + 0.6 * l.bri : 0;
          if (l && l.rgb) m.material.emissive.copy(l.rgb);
        }
        const lueur = lueurs.get(e.id);
        if (lueur) { lueur.intensity = l ? 5 * l.bri : 0; if (l && l.rgb) lueur.color.copy(l.rgb); }
      }
      const ps = rappels.current.pieces;
      for (const s of idx.solsPieces) {
        const p = pieceDuSol(s, ps);
        const c = p && p.teinte ? couleurCss(p.teinte, hote) : null;
        if (c) s.mesh.material.color.copy(s.base).lerp(c, 0.4);
        else s.mesh.material.color.copy(s.base);
      }
      rendre();
    };
    /* Le cadre de l'objet choisi en mode edition. */
    /* Le cadre ET une teinte : un trait d'un pixel autour d'un accoudoir ne
     * se voit pas. La teinte passe par une copie du materiau, rendue au
     * depart — un materiau partage aurait teinte tous ses voisins. */
    let teints = [];
    const encadrer = (nom) => {
      if (cadre) { scene.remove(cadre); cadre.geometry.dispose(); cadre = null; }
      teints.forEach(([m, orig]) => { m.material.dispose(); m.material = orig; });
      teints = [];
      appliquer(hassRef.current);   // l'objet rendu reprend son etat (une lampe allumee)
      if (idx && nom) {
        let o = null;
        idx.racine.traverse((x) => { if (!o && nomDe(x) === nom) o = x; });
        if (o) {
          const accent = couleurCss('var(--o-accent)', hote) || new THREE.Color('#3b82f6');
          cadre = new THREE.BoxHelper(o, accent);
          cadre.material.depthTest = false;
          cadre.renderOrder = 10;
          scene.add(cadre);
          o.traverse((m) => {
            if (!m.isMesh || !m.material || !m.material.emissive) return;
            const copie = m.material.clone();
            copie.emissive = accent.clone(); copie.emissiveIntensity = 0.55;
            teints.push([m, m.material]); m.material = copie;
          });
        }
      }
      rendre();
    };
    sceneRef.current = { appliquer, encadrer };

    Promise.resolve()
      .then(() => rappels.current.charger())
      .then((buffer) => lireGlb(buffer))
      .then((racine) => {
        if (fini) return;
        scene.add(racine);
        idx = indexerModele(racine, JSON.parse(liensCle), { connus: Object.keys((hassRef.current && hassRef.current.states) || {}) });
        /* Tout porte et recoit une ombre, sauf le verre (une vitre opaque a
         * l'ombre noircirait les pieces derriere elle). */
        racine.traverse((o) => {
          if (!o.isMesh) return;
          const transparent = o.material && (o.material.transparent || o.material.opacity < 1);
          o.castShadow = !transparent; o.receiveShadow = true;
        });
        /* Une lueur par lampe : le materiau seul allume l'ampoule, pas la piece. */
        for (const e of idx.entites.values()) {
          if (!e.ampoules.length || !/^(light|switch)\./.test(e.id)) continue;
          const b = new THREE.Box3();
          e.ampoules.forEach((m) => b.expandByObject(m));
          const p = new THREE.PointLight(0xffc98a, 0, 5, 1.6);
          b.getCenter(p.position);
          scene.add(p);
          lueurs.set(e.id, p);
        }
        cadrer();
        controls.update();
        setEtat('pret');
        appliquer(hassRef.current);
        if (rappels.current.onPret) rappels.current.onPret({ ...resumer(idx, rappels.current.pieces), racine, camera, controls });
      })
      .catch((err) => {
        if (fini) return;
        const code = err && err.code;
        setEtat(code === 'plan_absent' ? 'absent' : code === 'plan_draco' ? 'draco' : 'erreur');
      });

    /* Toucher : un clic court, pas la fin d'une rotation. Un toucher lent
     * reste un toucher : il n'y a pas d'appui long. */
    let depart = null;
    const ray = new THREE.Raycaster(); const pt = new THREE.Vector2();
    const bas = (ev) => { depart = { x: ev.clientX, y: ev.clientY, t: performance.now() }; };
    const haut = (ev) => {
      if (!depart || !idx) return;
      const d = Math.hypot(ev.clientX - depart.x, ev.clientY - depart.y);
      const court = performance.now() - depart.t < 900;
      depart = null;
      if (d > 6 || !court) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pt.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(pt, camera);
      const touche = ray.intersectObject(idx.racine, true).find((h) => h.object.visible && h.object.isMesh && !h.object.userData.fin);
      if (!touche) return;
      const chemin = [];
      for (let o = touche.object; o; o = o.parent) chemin.unshift(o);
      const R = rappels.current;
      const vise = designer(idx, chemin, touche.point, R.pieces);
      if (R.edition) {
        const nom = nomDe(vise.cible);
        if (R.onObjet && nom) R.onObjet({ nom, entite: vise.entite || null, piece: vise.piece ? vise.piece.name : null, manuel: idx.liens[nom] || null });
        return;
      }
      if (vise.entite) { if (R.onEntite) R.onEntite(vise.entite); return; }
      if (vise.piece && R.onPiece) R.onPiece(vise.piece.name);
    };
    renderer.domElement.addEventListener('pointerdown', bas);
    renderer.domElement.addEventListener('pointerup', haut);

    return () => {
      fini = true;
      sceneRef.current = null;
      if (demande) cancelAnimationFrame(demande);
      if (ro) ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', bas);
      renderer.domElement.removeEventListener('pointerup', haut);
      controls.dispose();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
      });
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
  }, [cle, liensCle]);

  /* Une image par pas d'une course de volet (10 par seconde, pendant une
   * course seulement) : le plan suit le volet comme sa carte. */
  const courses = useCoursesVolets();
  useEffect(() => { if (sceneRef.current) sceneRef.current.appliquer(hass); }, [hass, pieces, etat, courses]);
  useEffect(() => { if (sceneRef.current) sceneRef.current.encadrer(edition ? selection : null); }, [edition, selection, etat]);

  const message = etat === 'erreur' ? tr('Le plan n’a pas pu être lu.')
    : etat === 'draco' ? tr('Ce plan est compressé en Draco, que Loggia ne lit pas encore. Exportez-le sans compression, ou compressé en meshopt.')
    : etat === 'sansgl' ? tr('Cet appareil ne sait pas afficher la 3D.')
    : null;
  return (
    /* Les proportions d'un PLAN (4/3), pas une hauteur fixe : vue de dessus,
     * une maison est presque carree, et un cadre de 762 × 420 la laissait au
     * milieu d'un grand vide — il fallait zoomer a chaque fois (18/10). La
     * hauteur de l'ecran reste un plafond. */
    <div style={{ position: 'relative', ...(hauteur ? { height: hauteur } : { aspectRatio: '4 / 3', maxHeight: '72vh', minHeight: 260 }), borderRadius: 16, overflow: 'hidden', background: 'var(--o-s1)', border: 'var(--o-bw, 1px) solid var(--o-bd1)' }}>
      <div ref={hoteRef} style={{ position: 'absolute', inset: 0, visibility: etat === 'pret' ? 'visible' : 'hidden' }} aria-label={tr('Plan de la maison')} role="img" />
      {etat === 'charge' && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'var(--o-text3)' }}>{tr('Chargement du plan…')}</div>}
      {etat === 'absent' && <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, textAlign: 'center' }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--o-text1)' }}>{tr('Aucun plan pour cet étage.')}</span>
        {vide}
      </div>}
      {message && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'var(--o-text2)' }}>{message}</div>}
    </div>
  );
}

/** Le chargeur ordinaire : la route authentifiee du composant. */
export function chargeurServeur(hass, etage) {
  return async () => {
    const jeton = hass && hass.auth && hass.auth.data && hass.auth.data.access_token;
    const r = await fetch('/api/loggia/plan/' + encodeURIComponent(etage), { headers: jeton ? { Authorization: 'Bearer ' + jeton } : {} });
    if (r.status === 404) { const e = new Error('plan_absent'); e.code = 'plan_absent'; throw e; }
    if (!r.ok) { const e = new Error('plan_erreur'); e.code = 'plan_erreur'; throw e; }
    return r.arrayBuffer();
  };
}
