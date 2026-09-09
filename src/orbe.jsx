/* ── L'orbe de l'assistant ─────────────────────────────────────────────────────────
 *
 * Le noyau de particules de l'assistant, porté depuis la page d'origine
 * (`orbe-flux-v10-halo-fin.html`) sans toucher aux shaders : ce sont eux qui
 * font le rendu, et les réécrire aurait été le meilleur moyen de perdre en
 * route ce qui fait sa signature.
 *
 * Ce qui a changé, et pourquoi.
 *
 * L'import de Three.js allait chercher jsdelivr. Sur une tablette de cuisine
 * sans internet, l'orbe ne s'affichait pas — un écran noir au centre du
 * dashboard, sans un mot. Elle prend maintenant le Three.js déjà embarqué par
 * Loggia, celui du fond météo, et ne demande donc rien au réseau.
 *
 * La page portait un HUD : compteur de particules, jauge de charge, liste des
 * modes, boutons de palette. Rien de tout cela n'est repris — ce sont les
 * commandes d'un banc d'essai, pas d'un assistant. Ne restent que le rendu et
 * l'API de pilotage.
 *
 * Cette API est reprise MOT POUR MOT, parce qu'elle était déjà bonne : un
 * vocabulaire qui dit ce que fait l'assistant — `idle`, `listening`,
 * `thinking`, `speaking` — et non le régime de rendu qu'il déclenche. Ce que
 * l'on a écrit contre l'orbe d'origine continue de marcher ici.
 *
 * Un dernier ajout, sans lequel elle n'aurait pas sa place dans une popup :
 * `dispose`. La page d'origine vivait tant que vivait son onglet ; ici l'orbe
 * s'ouvre et se ferme. Sans libération explicite, chaque ouverture laisserait
 * derrière elle un contexte WebGL, ses cibles de rendu et sa boucle
 * d'animation — le navigateur en tolère une poignée, puis refuse le suivant.
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { tr } from './i18n.js';

/**
 * Monte l'orbe dans `hote` et rend de quoi la piloter.
 *
 * Une fonction plutôt qu'un composant : le rendu tourne en dehors de React, à
 * soixante images par seconde, et n'a rien à faire dans un cycle de rendu.
 */
export function creerOrbe(hote) {
  let vivant = true;

  class MiniOrbit {
    constructor(camera, dom) {
      this.camera = camera; this.dom = dom;
      this.target = new THREE.Vector3();
      this.enablePan = false; this.enableDamping = true; this.dampingFactor = 0.06;
      this.minDistance = 1; this.maxDistance = 100;
      this.rotateSpeed = 0.5; this.zoomSpeed = 0.7;
      this.autoRotate = false; this.autoRotateSpeed = 0.3;
      const off = camera.position.clone().sub(this.target);
      this.r = off.length() || 5;
      this.theta = Math.atan2(off.x, off.z);
      this.phi = Math.acos(Math.max(-1, Math.min(1, off.y / this.r)));
      this.dTheta = 0; this.dPhi = 0; this.dR = 0;
      this._drag = false; this._x = 0; this._y = 0;
      dom.style.touchAction = 'none';
      dom.addEventListener('pointerdown', e => {
        this._drag = true; this._x = e.clientX; this._y = e.clientY;
        try { dom.setPointerCapture(e.pointerId); } catch { /* pointeur deja capture */ }
      });
      dom.addEventListener('pointerup', () => { this._drag = false; });
      dom.addEventListener('pointerleave', () => { this._drag = false; });
      dom.addEventListener('pointermove', e => {
        if (!this._drag) return;
        const w = dom.clientWidth || 1;
        this.dTheta -= 2 * Math.PI * (e.clientX - this._x) / w * this.rotateSpeed;
        this.dPhi   -= 2 * Math.PI * (e.clientY - this._y) / w * this.rotateSpeed;
        this._x = e.clientX; this._y = e.clientY;
      });
      dom.addEventListener('wheel', e => {
        e.preventDefault();
        this.dR += Math.sign(e.deltaY) * 0.28 * this.zoomSpeed;
      }, { passive: false });
    }
    update() {
      if (this.autoRotate) this.theta -= this.autoRotateSpeed * 0.012;
      this.theta += this.dTheta; this.phi += this.dPhi; this.r += this.dR;
      const k = this.enableDamping ? Math.max(0, 1 - this.dampingFactor * 3) : 0;
      this.dTheta *= k; this.dPhi *= k; this.dR *= k;
      this.phi = Math.max(0.08, Math.min(Math.PI - 0.08, this.phi));
      this.r = Math.max(this.minDistance, Math.min(this.maxDistance, this.r));
      const si = Math.sin(this.phi);
      this.camera.position.set(
        this.target.x + this.r * si * Math.sin(this.theta),
        this.target.y + this.r * Math.cos(this.phi),
        this.target.z + this.r * si * Math.cos(this.theta));
      this.camera.lookAt(this.target);
    }
  }

  /* ══ state ══ */
  const MODES = {
    repos:  { label:'REPOS',      flow:.35, turb:.35, energy:.30, spin:.10 },
    flux:   { label:'FLUX',       flow:1.0, turb:.65, energy:.60, spin:.22 },
    analyse:{ label:'ANALYSE',    flow:1.7, turb:.95, energy:.82, spin:.55 },
    turbu:  { label:'TURBULENCE', flow:2.0, turb:1.5, energy:.90, spin:.40 },
    surch:  { label:'SURCHARGE',  flow:2.8, turb:1.8, energy:1.0, spin:.85 },
    ecoute: { label:'ÉCOUTE',     flow:.85, turb:.42, energy:.55, spin:.14 },
    pense:  { label:'RÉFLEXION',  flow:2.1, turb:.80, energy:.86, spin:.72 },
    parle:  { label:'RÉPONSE',    flow:.75, turb:.34, energy:.42, spin:.16 }
  };
  const PAL = [
    { deep:[.02,.16,.62], mid:[.22,.66,1.0], hot:[.92,.99,1.0] },
    { deep:[.20,.06,.55], mid:[.62,.42,1.0], hot:[.99,.96,1.0] },
    { deep:[.52,.14,.01], mid:[1.0,.58,.12], hot:[1.0,.94,.76] }
  ];
  const S = { mode:'repos', level:1, charge:0, energy:.3, flow:.35, turb:.35, pulse:0, mic:0, micLevel:0, pal:0, count:0, curves:0, voice:0, busy:false,
              phase:0, iph:0, dir:1, force:null };
  const waves = [];

  /* ══ renderer ══ */
  const stage = hote;
  /* `alpha` et non le noir opaque de la page d'origine.
   * Elle occupait tout l'ecran : peindre le fond en noir n'y coutait rien.
   * Dans une popup, ce meme noir devient un DISQUE pose sur la feuille — on
   * voit le cadre de l'orbe avant de voir l'orbe. Le canevas est donc
   * transparent, et c'est la lumiere seule qui se depose. */
  const renderer = new THREE.WebGLRenderer({
    antialias:false, alpha:true, powerPreference:'high-performance',
    /* On garde `premultipliedAlpha` a sa valeur par defaut — VRAI — et la
     * passe finale rend donc des couleurs DEJA multipliees par leur opacite.
     * C'est le bon regime pour ce qui EMET de la lumiere : le navigateur
     * calcule `fond x (1 - a) + c`, donc le halo ajoute sa lumiere au lieu
     * d'en retirer.
     *
     * L'avoir mis a FAUX etait une erreur, et elle se voyait : en alpha droit
     * le calcul devient `fond x (1 - a) + c x a`. Comme `a` vaut ici l'eclat
     * de la couleur, `c x a` est de l'ordre de `a` au carre — negligeable la
     * ou `a` est faible. Le halo retirait donc du fond sans rien rendre, et
     * deposait un carre SOMBRE autour de l'orbe. Mesure sur un gris uni le
     * 09/09/2026 : le carre du canevas etait nettement plus fonce que la
     * plaque qui l'entourait. */
  });
  const DPR = Math.min(1.5, window.devicePixelRatio || 1);
  renderer.setPixelRatio(DPR);
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;
  // Aucun fond propre : ce qui n'est pas de la lumiere doit laisser voir la
  // feuille, pas une plaque de la couleur par defaut du navigateur.
  renderer.domElement.style.background = 'transparent';
  renderer.domElement.style.display = 'block';
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, .1, 60);
  camera.position.set(0, .25, 4.3);
  const controls = new MiniOrbit(camera, renderer.domElement);
  controls.enablePan = false; controls.enableDamping = true; controls.dampingFactor = .06;
  controls.minDistance = 2.2; controls.maxDistance = 9; controls.rotateSpeed = .5; controls.zoomSpeed = .7;
  controls.autoRotate = true; controls.autoRotateSpeed = .3;
  const orb = new THREE.Group(); scene.add(orb);

  /* ══ curve atlas: every vein baked into a float texture the vertex shader walks ══ */
  const CW = 256, CH = 64;                                  // samples per curve, max curves
  const curveData = new Float32Array(CW * CH * 4);
  const curveTex = new THREE.DataTexture(curveData, CW, CH, THREE.RGBAFormat, THREE.FloatType);
  curveTex.magFilter = curveTex.minFilter = THREE.NearestFilter;
  curveTex.generateMipmaps = false;

  const U = {
    uTime:{value:0}, uFlow:{value:.35}, uTurb:{value:.35}, uEnergy:{value:.3}, uPulse:{value:0}, uMic:{value:0},
    /* phases integrees : uFlow change de valeur, jamais la position acquise */
    uPhase:{value:0}, uIph:{value:0}, uDirS:{value:1},
    uCurves:{value:curveTex}, uCurveTex:{value:new THREE.Vector2(CW, CH)},
    uPointer:{value:new THREE.Vector3(0,0,9)}, uPointerOn:{value:0},
    uWaves:{value:[new THREE.Vector4(-9,0,0,0),new THREE.Vector4(-9,0,0,0),new THREE.Vector4(-9,0,0,0),new THREE.Vector4(-9,0,0,0)]},
    uDeep:{value:new THREE.Color()}, uMid:{value:new THREE.Color()}, uHot:{value:new THREE.Color()},
    uVoice:{value:0}, uPitch:{value:0}, uPx:{value:1}
  };

  const COMMON = `
  uniform float uTime, uFlow, uTurb, uEnergy, uPulse, uMic, uPointerOn, uPx, uVoice, uPitch, uPhase, uIph, uDirS;
  uniform vec3 uPointer, uDeep, uMid, uHot;
  uniform vec4 uWaves[4];
  uniform sampler2D uCurves; uniform vec2 uCurveTex;

  vec3 curveAt(float ci, float u){
    float x = clamp(u,0.0,1.0) * (uCurveTex.x - 1.0);
    float x0 = floor(x), f = x - x0;
    float v = (ci + 0.5) / uCurveTex.y;
    vec3 a = texture2D(uCurves, vec2((x0 + 0.5)/uCurveTex.x, v)).xyz;
    vec3 b = texture2D(uCurves, vec2((min(x0+1.0, uCurveTex.x-1.0) + 0.5)/uCurveTex.x, v)).xyz;
    return mix(a, b, f);
  }
  vec3 curl(vec3 p, float t){
    return vec3(
      sin(p.y*3.1 + t*1.30) * cos(p.z*2.7 - t*0.70),
      sin(p.z*3.7 - t*0.90) * cos(p.x*3.1 + t*1.10),
      sin(p.x*2.9 + t*1.05) * cos(p.y*3.3 - t*0.80)
    );
  }
  vec3 fieldWarp(vec3 p){
    vec3 n = normalize(p);
    for(int i=0;i<4;i++){
      float dr = length(p) - uWaves[i].x;
      float f = (1.0 - smoothstep(0.0, 0.26, abs(dr))) * uWaves[i].y;
      p += n * f * 0.16;
    }
    p += n * uPulse * 0.06;
    if(uPointerOn > 0.002){
      vec3 d = p - uPointer; float L = length(d);
      p += (d/max(L,1e-4)) * (1.0 - smoothstep(0.0, 0.55, L)) * 0.22 * uPointerOn;
    }
    return p;
  }
  vec3 heat(float h, float depth){
    vec3 c = mix(uDeep, uMid, clamp(h*1.45, 0.0, 1.0));
    c = mix(c, uHot, clamp((h-0.58)*2.45, 0.0, 1.0));
    return c * (0.45 + 0.55*depth);
  }`;

  const fluxMat = new THREE.ShaderMaterial({
    uniforms: U, transparent:true, depthWrite:false, depthTest:false, blending:THREE.AdditiveBlending,
    vertexShader: COMMON + `
      attribute float aCurve, aU, aSeed, aAng, aRad, aFray, aSize, aSpray, aLum, aSpd;
      varying float vHeat, vDepth, vAlpha, vRim, vImp, vShrink, vOut;
      void main(){
        /* travel along the vein */
        float sp = (0.030 + 0.055*aSeed) * aSpd;   /* les tracantes doublent la foule */
        float u = fract(aU + uPhase * sp);
        vec3 p  = curveAt(aCurve, u);
        vec3 pa = curveAt(aCurve, u + 0.012);
        vec3 T = normalize(pa - p + vec3(1e-5));
        vec3 R = normalize(p);
        vec3 N = normalize(cross(T, R));
        vec3 B = normalize(cross(T, N));

        /* Profondeur radiale du point de veine. Le coeur n'est pas un objet
           ajoute : c'est la ou les veines se rejoignent. On y resserre le tube
           pour que ca se tresse au lieu d'enfler, et on y chauffe la matiere. */
        float deep = 1.0 - smoothstep(0.15, 0.62, length(p));

        /* Influx : une bande etroite qui parcourt la veine. Chaque veine a sa
           phase, deux influx de vitesses differentes s'y succedent. La distance
           est circulaire — l'influx repasse par le depart sans discontinuite. */
        float vph = fract(sin(aCurve * 127.1) * 43758.5453);
        /* L'influx voyage EN RAYON, pas en longueur de veine : il part du coeur
           vers la surface quand elle parle, et fait le trajet inverse quand elle
           ecoute. Le terme en sin(u) est periodique — il decale l'arrivee de
           l'onde le long de chaque veine, sinon les veines rasantes, toutes au
           meme rayon, s'allumeraient d'un bloc comme un flash. */
        float trav = length(p)*1.15 + 0.20*sin(6.28318*u + vph*6.28318);
        float s1 = (fract(trav        - uIph        + vph*0.30 + 0.5) - 0.5) * uDirS;
        float s2 = (fract(trav*1.35   - uIph*0.67   + vph      + 0.5) - 0.5) * uDirS;
        /* front raide devant, trainee longue derriere : l'influx a un sens */
        float i1 = exp(-max(s1, 0.0)*150.0) * exp(min(s1, 0.0)*17.0);
        float i2 = exp(-max(s2, 0.0)*190.0) * exp(min(s2, 0.0)*24.0);
        float impAmp = 0.26 + 1.75*uVoice + 0.46*uEnergy;
        vImp = min(1.7, (i1 + 0.62*i2) * impAmp);

        /* tube profile: thin at birth, full-bodied mid-run, frayed at the tail */
        float body = smoothstep(0.0, 0.07, u) * (1.0 - 0.42*smoothstep(0.58, 1.0, u));
        float fray = smoothstep(0.60, 1.0, u)*aFray + smoothstep(0.34, 0.0, u)*aFray*0.55;
        /* Seule la poussiere s'effiloche. Une braise ou une tracante reste dans
           le courant de sa veine : projetee dehors, elle devient un point brillant
           et isole — une mouche. La brume garde donc exactement la meme etendue,
           mais elle n'est plus peuplee que de fines particules. */
        float leger = clamp(1.35 - aLum*0.55, 0.12, 1.0);
        float rad  = aRad * (0.42 + 0.85*body) + fray * (0.16 + 0.42*aSeed) * leger;
        rad += aSpray * fray * (0.55 + 1.35*aSeed) * leger;
        rad *= 1.0 + uVoice * (0.42 + 0.55*aSeed);
        rad *= mix(1.0, 0.74, deep);            /* tresse resserree au coeur */

        float ang = aAng + uPhase*(0.25 + aSeed*0.9)*0.35;
        /* ribbon cross-section: wide along the surface, thin radially */
        vec3 off = N * cos(ang) * rad * 1.55 + B * sin(ang) * rad * 0.52;

        vec3 pos = p + off + R * vImp * 0.016;   /* le passage souleve la matiere */
        float tScale = 0.020 + 0.042*min(uTurb, 2.2) + uVoice*0.030;
        /* aFray sert a deux choses : l'epaisseur de la brume (plus haut, dans rad)
           et l'agitation ici. Seule la seconde est reduite — baisser aFray lui-meme
           amincirait les veines, ce qui change l'orbe au lieu de la calmer. */
        pos += curl(pos*2.3 + vec3(aSeed*7.0), uTime*0.85) * tScale * (0.35 + (fray*1.1 + aSpray*1.6) * leger);
        pos += R * sin(uTime*5.0 + aSeed*30.0) * uMic * 0.045;
        pos *= 1.0 + uVoice*0.028 + uPitch*0.012;
        pos = fieldWarp(pos);
        /* Seul levier sur le halo : au-dela de la matiere de veine, ce qui reste
           n'appartient plus a l'orbe. Le seuil est place a 1,22 — les effilochures
           legitimes montent a ~1,2 — pour ne rien retirer au limbe ni au grain
           des veines, dont la geometrie reste celle d'avant. */
        vOut = clamp((length(pos) - 1.22) / 0.45, 0.0, 1.0);

        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        /* Profondeur DANS l'orbe, mesuree par rapport a son centre — surtout pas
           la distance a la camera. Avec des constantes absolues calees sur la
           butee de zoom, dezoomer eteignait la sphere (x0,06 mesure entre le
           cadrage par defaut et la butee). */
        float zc = modelViewMatrix[3].z;
        vDepth = clamp(0.5 + (mv.z - zc) / 2.6, 0.0, 1.0);
        /* distance a l'axe de vue : maximale sur la silhouette, quelle que soit
           l'orientation. C'est ce qui donne un bord au nuage. */
        vRim = clamp(length(mv.xy) / 1.24, 0.0, 1.0);

        float core = 1.0 - clamp(rad / (aRad*1.9 + 0.16), 0.0, 1.0);
        /* les braises se placent plus haut sur la rampe, la poussiere reste bleue :
           c'est cet ecart de temperature qui donne du volume au nuage */
        vHeat  = clamp(pow(core, 1.7)*1.45 + 0.04 + vImp*0.50 + (aLum-1.0)*0.10
                       + deep*0.18, 0.0, 1.0);
        /* la poussiere scintille a sa propre cadence, les braises restent fixes */
        float tw = mix(0.80 + 0.20*sin(uTime*(1.2 + aSeed*2.4) + aSeed*47.0),
                       1.0, smoothstep(0.55, 1.35, aLum));
        /* l'influx ajoute une quantite quasi absolue : il revele la poussiere */
        vAlpha = (0.42 + 0.58*body) * (1.0 - 0.45*aSpray) * tw * (aLum + vImp*0.75)
                 * (1.0 + deep*0.25);

        float ps = aSize * uPx * (0.72 + 0.55*uEnergy) * (1.0 + aSpray*0.7 + vImp*0.60) / max(-mv.z, 0.25);
        /* Sous un pixel le pilote cesse de retrecir le point. Sans compenser en
           alpha, la sphere se remettrait a briller en dezoomant : on rend l'aire
           perdue au lieu de la laisser au plancher. */
        vShrink = clamp(ps, 0.0, 1.0);
        gl_PointSize = max(ps, 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: COMMON + `
      varying float vHeat, vDepth, vAlpha, vRim, vImp, vShrink, vOut;
      void main(){
        vec2 q = gl_PointCoord - 0.5;
        float d = length(q);
        if (d > 0.5) discard;
        float glow = pow(1.0 - d*2.0, 2.1);
        float spark = smoothstep(0.20, 0.0, d);
        vec3 c = heat(clamp(vHeat + uPitch*0.11 + uVoice*0.06, 0.0, 1.0), vDepth);
        c = mix(c, uHot, clamp(spark * vHeat * 0.85 + vImp * 0.52, 0.0, 1.0));
        float a = glow * vAlpha * (0.15 + 0.13*uEnergy) * pow(0.14 + 0.86*vDepth, 1.55);
        a *= 1.0 - 0.42*smoothstep(0.7, 2.1, uTurb);
        a *= 1.0 + uVoice*1.15;
        /* le halo se concentre sur le limbe : la sphere cesse de s'effilocher */
        a *= 0.68 + 1.15 * pow(vRim, 3.2);
        a *= 1.0 + step(0.70, vHeat)*2.0;
        a *= vShrink*vShrink;      /* aire reelle, pas l'aire plancher */
        a *= 1.0 - 0.95*vOut*vOut;
        gl_FragColor = vec4(c * a * 1.5, 1.0);
      }`
  });

  /* faint suspended haze so the sphere reads as a volume */
  const hazeMat = new THREE.ShaderMaterial({
    uniforms: U, transparent:true, depthWrite:false, depthTest:false, blending:THREE.AdditiveBlending,
    vertexShader: COMMON + `
      attribute float aSeed, aSize;
      varying float vDepth, vSeed, vFar, vCore, vShrink;
      void main(){
        vec3 pos = position;
        pos += curl(pos*1.7 + vec3(aSeed*9.0), uTime*0.35) * (0.03 + 0.07*uTurb);
        pos = fieldWarp(pos);
        vec4 mv = modelViewMatrix * vec4(pos,1.0);
        /* Profondeur DANS l'orbe, mesuree par rapport a son centre — surtout pas
           la distance a la camera. Avec des constantes absolues calees sur la
           butee de zoom, dezoomer eteignait la sphere (x0,06 mesure entre le
           cadrage par defaut et la butee). */
        float zc = modelViewMatrix[3].z;
        vDepth = clamp(0.5 + (mv.z - zc) / 2.6, 0.0, 1.0);
        vSeed = aSeed;
        vFar = clamp((length(position) - 1.02) / 0.45, 0.0, 1.0);
        vCore = 1.0 - smoothstep(0.06, 0.52, length(position));
        float ps = aSize * uPx * (0.6 + 0.4*uEnergy) / max(-mv.z, 0.25);
        vShrink = clamp(ps, 0.0, 1.0);
        gl_PointSize = max(ps, 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: COMMON + `
      varying float vDepth, vSeed, vFar, vCore, vShrink;
      void main(){
        vec2 q = gl_PointCoord - 0.5; float d = length(q);
        if (d > 0.5) discard;
        float glow = pow(1.0 - d*2.0, 2.0);
        float fl = 0.55 + 0.45*sin(uTime*(1.6 + vSeed*5.0) + vSeed*40.0);
        vec3 c = mix(uDeep, uMid, 0.35 + 0.3*vSeed);
        c = mix(c, uMid, vCore*0.55);              /* la masse est un peu plus chaude */
        /* la masse centrale ne scintille pas : elle couve */
        float a = glow * (0.012 + 0.028*uEnergy) * mix(fl, 0.85, vCore) * pow(0.10 + 0.90*vDepth, 1.6);
        a *= 1.0 - 0.88*vFar*vFar;                 /* s'eteint au-dela du limbe */
        /* la masse couve : elle ne suit pas le regime comme le reste, sinon en
           Analyse/Surcharge elle devient une lampe au lieu d'un coeur */
        a *= 1.0 + pow(vCore, 1.4) * 9.0 / (1.0 + 1.1*uEnergy);
        a *= vShrink*vShrink;
        gl_FragColor = vec4(c * a * 1.4, 1.0);
      }`
  });

  /* ══ geometry ══ */
  /* Generateur seme. Sans lui, chaque chargement tirait une orbe differente :
     impossible de juger un changement, et deux de mes mesures s'en sont trouvees
     faussees. L'ouverture donne toujours la meme orbe ; RÉINIT en tire une autre. */
  let orbSeed = 1, __s = orbSeed;
  const rnd = () => {
    __s = __s + 0x6D2B79F5 | 0;
    let t = Math.imul(__s ^ __s >>> 15, 1 | __s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  const unit = () => { const u = rnd()*2-1, a = rnd()*6.2831, s = Math.sqrt(Math.max(0,1-u*u)); return new THREE.Vector3(Math.cos(a)*s, u, Math.sin(a)*s); };
  const noise = (x,y,z) => Math.sin(x*3.1)*Math.cos(y*2.7) + Math.sin(y*3.9)*Math.cos(z*3.1) + Math.sin(z*4.3)*Math.cos(x*2.3);

  let fluxMesh = null, hazeMesh = null;

  /* Une veine : un long arc qui enveloppe la sphere, dont l'axe de rotation
     derive en chemin — et qui PLONGE vers le coeur avant de ressortir. C'est ce
     trajet radial qui fait la difference entre un noyau et une coque : la matiere
     vient de quelque part et va quelque part. */
  function bakeCurve(row, family){
    const axis = family.clone().applyAxisAngle(unit(), (rnd()-.5)*1.0).normalize();
    let p0 = unit();
    p0.addScaledVector(axis, -p0.dot(axis)).normalize();
    const span = 3.0 + rnd()*3.6;
    const seed = rnd()*10;
    const rOut = .96 + rnd()*.10;
    /* Deux roles. Les plongeantes construisent le coeur ; les rasantes gardent
       la silhouette. Sans les secondes on perd le limbe, sans les premieres
       l'orbe reste creux. */
    const plunge = rnd() < .45;
    /* Les plongeantes tressent AUTOUR du coeur, elles ne le traversent pas :
       si elles convergent vers un point, la densite y explose et on obtient un
       noeud blanc au lieu d'une masse. */
    const rMin = plunge ? .24 + Math.pow(rnd(), 1.6)*.30 : .84 + rnd()*.14;
    /* le fond de la plongee ne tombe pas toujours a mi-parcours */
    const skew = .30 + rnd()*.40, kSkew = Math.log(.5)/Math.log(skew);
    /* exposant eleve = plongee BREVE : la veine longe la surface, pique, ressort.
       Un profil large la garderait a l'interieur sur toute sa longueur et la
       sphere perdrait sa silhouette. */
    const bow = plunge ? 2.4 + rnd()*2.2 : 1.3 + rnd()*1.0;
    const ax = new THREE.Vector3(), p = new THREE.Vector3();
    for (let k=0;k<CW;k++){
      const f = k/(CW-1), ang = span*f;
      ax.set(
        axis.x + noise(f*2.1+seed, seed, 0)*.13,
        axis.y + noise(0, f*2.4+seed, seed)*.13,
        axis.z + noise(seed, 0, f*1.7+seed)*.13
      ).normalize();
      p.copy(p0).applyAxisAngle(ax, ang);
      /* profil radial : 0 aux deux extremites (la veine part et revient de la
         surface), 1 au fond de la plongee, place en f = skew */
      const w = Math.pow(Math.sin(3.14159265 * Math.pow(f, kSkew)), bow);
      const r = rOut - (rOut - rMin)*w
        + .045*Math.sin(f*4.1+seed) + .022*Math.sin(f*9.3-seed*2.0);
      p.multiplyScalar(Math.max(.05, r));
      const o = (row*CW + k)*4;
      curveData[o] = p.x; curveData[o+1] = p.y; curveData[o+2] = p.z; curveData[o+3] = 1;
    }
    return span;
  }

  function build(level){
    __s = (orbSeed + level * 7919) | 0;   /* meme graine = meme orbe, niveau par niveau */
    if (fluxMesh){ orb.remove(fluxMesh); fluxMesh.geometry.dispose(); fluxMesh = null; }
    if (hazeMesh){ orb.remove(hazeMesh); hazeMesh.geometry.dispose(); hazeMesh = null; }

    const nCurves = Math.min(CH, 13 + level*3);
    const families = [unit(), unit(), unit(), unit(), unit()];
    const spans = [];
    for (let c=0;c<nCurves;c++) spans.push(bakeCurve(c, families[Math.floor(rnd()*families.length)]));
    curveTex.needsUpdate = true;

    const total = 240000 + level*55000;
    const spanSum = spans.reduce((a,b)=>a+b, 0);
    const pos = new Float32Array(total*3);
    const aCurve = new Float32Array(total), aU = new Float32Array(total), aSeed = new Float32Array(total);
    const aAng = new Float32Array(total), aRad = new Float32Array(total), aFray = new Float32Array(total);
    const aSize = new Float32Array(total), aSpray = new Float32Array(total);
    const aLum = new Float32Array(total), aSpd = new Float32Array(total);
    let wSum = 0;                                       // energie emise, pour renormaliser

    let i = 0;
    for (let c=0;c<nCurves && i<total;c++){
      const share = Math.floor(total * spans[c]/spanSum);
      const tube = .040 + Math.pow(rnd(),1.6)*.090;      // vein calibre
      const frayAmt = .45 + rnd()*.8;
      for (let k=0;k<share && i<total;k++,i++){
        aCurve[i] = c;
        aU[i] = rnd();
        aSeed[i] = rnd();
        aAng[i] = rnd()*6.2831;
        /* radius biased to the axis → dense white core, sparse rim */
        aRad[i] = tube * Math.pow(rnd(), 2.0) * (1 + (rnd()<.07 ? 2.6 : 0));
        aFray[i] = frayAmt * (.4 + rnd()*.9);
        aSpray[i] = rnd() < .07 ? .45 + rnd()*.75 : 0;
        /* Quatre populations, pas un continuum : un degrade uniforme se lit comme
           du grain, des classes tranchees se lisent comme de la matiere. */
        const r = rnd();
        let sz, lm, sd;
        if (r < .010)      { sz = 2.6 + rnd()*1.8; lm = 1.90 + rnd()*0.90; sd = 1.9 + rnd()*1.4; } // tracantes
        else if (r < .055) { sz = 1.6 + rnd()*1.0; lm = 1.25 + rnd()*0.60; sd = 0.9 + rnd()*0.6; } // braises
        else if (r < .300) { sz = 0.95+ rnd()*0.6; lm = 0.72 + rnd()*0.38; sd = 0.65+ rnd()*0.5; } // grains
        else               { sz = 0.58+ rnd()*0.47;lm = 0.34 + rnd()*0.28; sd = 0.45+ rnd()*0.5; } // poussiere
        aSize[i] = sz; aLum[i] = lm; aSpd[i] = sd;
        wSum += lm * sz * sz;                           // ~ lumiere deposee par la particule
      }
    }
    const n = i;
    /* On recale la luminance pour que le nuage garde l'eclat qu'il avait avant
       les classes : sinon changer la repartition change le reglage du bloom. */
    const k = 1.98 * n / Math.max(wSum, 1e-6);
    for (let j = 0; j < n; j++) aLum[j] *= k;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, n*3), 3));
    geo.setAttribute('aCurve', new THREE.BufferAttribute(aCurve.subarray(0,n), 1));
    geo.setAttribute('aU',     new THREE.BufferAttribute(aU.subarray(0,n), 1));
    geo.setAttribute('aSeed',  new THREE.BufferAttribute(aSeed.subarray(0,n), 1));
    geo.setAttribute('aAng',   new THREE.BufferAttribute(aAng.subarray(0,n), 1));
    geo.setAttribute('aRad',   new THREE.BufferAttribute(aRad.subarray(0,n), 1));
    geo.setAttribute('aFray',  new THREE.BufferAttribute(aFray.subarray(0,n), 1));
    geo.setAttribute('aSize',  new THREE.BufferAttribute(aSize.subarray(0,n), 1));
    geo.setAttribute('aSpray', new THREE.BufferAttribute(aSpray.subarray(0,n), 1));
    geo.setAttribute('aLum',   new THREE.BufferAttribute(aLum.subarray(0,n), 1));
    geo.setAttribute('aSpd',   new THREE.BufferAttribute(aSpd.subarray(0,n), 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4);
    fluxMesh = new THREE.Points(geo, fluxMat); orb.add(fluxMesh);

    /* haze */
    const hN = 7200 + level*1700;
    const hp = new Float32Array(hN*3), hs = new Float32Array(hN), hz = new Float32Array(hN);
    for (let k=0;k<hN;k++){
      const d = unit(), band = rnd();
      /* la frange exterieure est reduite : au-dela du limbe ce ne sont plus
         des particules en suspension, ce sont des points qui trainent */
      const r = band < .34 ? .05 + Math.pow(rnd(),1.3)*.44      // la masse centrale
              : (band < .62 ? .25 + Math.pow(rnd(),.6)*.80
              : (band < .94 ? .92 + rnd()*.20 : 1.06 + Math.pow(rnd(),2.6)*.34));
      hp[k*3]=d.x*r; hp[k*3+1]=d.y*r; hp[k*3+2]=d.z*r;
      hs[k] = rnd()<.035 ? 1.5+rnd()*1.4 : .45+rnd()*.7;
      hz[k] = rnd();
    }
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.BufferAttribute(hp,3));
    hg.setAttribute('aSize', new THREE.BufferAttribute(hs,1));
    hg.setAttribute('aSeed', new THREE.BufferAttribute(hz,1));
    hg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4);
    hazeMesh = new THREE.Points(hg, hazeMat); orb.add(hazeMesh);

    S.count = n; S.curves = nCurves;
  }

  /* ══ bloom ══ */
  const rtOpts = { type:THREE.HalfFloatType, minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter, depthBuffer:false };
  let rtScene = null, mips = [];
  const quadScene = new THREE.Scene(), quadCam = new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2,2)); quadScene.add(quad);
  const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const copyMat = new THREE.ShaderMaterial({ uniforms:{ tex:{value:null} }, vertexShader:VS,
    fragmentShader:'uniform sampler2D tex; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tex, vUv); }' });
  const blurMat = new THREE.ShaderMaterial({ uniforms:{ tex:{value:null}, dir:{value:new THREE.Vector2(1,0)}, texel:{value:new THREE.Vector2()} }, vertexShader:VS,
    fragmentShader:`uniform sampler2D tex; uniform vec2 dir, texel; varying vec2 vUv;
    void main(){ vec2 o = dir*texel; vec4 c = texture2D(tex,vUv)*0.2270270270;
      c += (texture2D(tex,vUv+o*1.3846153846)+texture2D(tex,vUv-o*1.3846153846))*0.3162162162;
      c += (texture2D(tex,vUv+o*3.2307692308)+texture2D(tex,vUv-o*3.2307692308))*0.0702702703;
      gl_FragColor = c; }` });
  const compMat = new THREE.ShaderMaterial({ uniforms:{ tScene:{value:null}, tB0:{value:null}, tB1:{value:null}, tB2:{value:null}, tB3:{value:null}, uExp:{value:1}, uBloom:{value:1} }, vertexShader:VS,
    fragmentShader:`uniform sampler2D tScene,tB0,tB1,tB2,tB3; uniform float uExp,uBloom; varying vec2 vUv;
    void main(){
      vec3 s = texture2D(tScene,vUv).rgb;
      /* Les quatre niveaux vont du plus fin (1/2) au plus large (1/16). Les
         ponderer croissant, comme avant, donnait tout le poids au plus etale :
         d'ou un halo epais autour de l'orbe. On inverse la pyramide — la lueur
         reste collee a la matiere au lieu de s'etaler dans le noir. */
      vec3 b = texture2D(tB0,vUv).rgb*0.82 + texture2D(tB1,vUv).rgb*0.58
             + texture2D(tB2,vUv).rgb*0.30 + texture2D(tB3,vUv).rgb*0.16;
      vec3 c = (s + b*uBloom) * uExp;
      /* Compresser chaque canal separement rapproche les canaux et delave la
         teinte : tout finit blanc. On compresse la LUMINANCE et on reporte le
         rapport sur la couleur, qui garde donc sa saturation. Seuls les tres
         hauts niveaux virent au blanc, comme une vraie source lumineuse. */
      float L = max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 1e-5);
      float Ln = 1.0 - exp(-L);
      vec3 hue = c * (Ln / L);
      vec3 burn = 1.0 - exp(-c);
      c = mix(hue, burn, smoothstep(1.6, 4.5, L) * 0.55);
      c = pow(clamp(c, 0.0, 1.0), vec3(0.94));
      /* Le plus large des quatre flous porte a lui seul jusqu'aux bords : il
         depose sur TOUT le carre un fond faible mais uniforme. Rien ne le
         voit sur fond noir — c'etait le cas de la page d'origine, qui
         occupait l'ecran. Pose sur autre chose, ce fond dessine le carre du
         canevas, quel que soit le regime de composition : plus clair en
         additif, plus sombre en alpha droit.
         On le retranche donc a la source. Ce qui reste sous le seuil vaut
         zero, et zero ne se compose pas. */
      c = max(c - 0.020, 0.0);
      /* Et la lumiere doit s'eteindre AVANT le bord du cadre.
         Le seuil ci-dessus vide les coins, pas le reste du pourtour : mesure
         du 09/09/2026, alpha maximum sur le bord = 17 sur 255. Faible, mais
         coupe net au ras du canevas — et c'est ce trait droit que l'on voit,
         pas l'orbe. On suit donc la forme du CADRE et non un cercle : la
         distance de Tchebychev vaut 1 sur tout le pourtour, coins compris, la
         ou un rayon les manquerait. La rampe commence a 0,86, bien au-dela de
         l'orbe elle-meme. */
      vec2 q = abs(vUv - 0.5) * 2.0;
      c *= 1.0 - smoothstep(0.86, 1.0, max(q.x, q.y));
      /* Ce qui sort d'ici n'est pas une image mais de la LUMIERE : sa couleur
         deja multipliee par son intensite, et cette intensite pour opacite.
         La ou l'orbe brille, elle couvre ; ailleurs, rien. */
      float a = clamp(max(max(c.r, c.g), c.b), 0.0, 1.0);
      gl_FragColor = vec4(c, a);
    }` });

  function resize(){
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    /* Sans le troisieme argument, three pose AUSSI la taille CSS du canevas.
     * La page d'origine s'en passait : sa feuille de style l'etirait a 100 %.
     * Ici rien ne l'etirait — le canevas gardait donc sa taille en pixels,
     * une fois et demie trop grande sur un ecran dense, et debordait de son
     * hote par le bas et la droite. */
    renderer.setSize(w, h);
    camera.aspect = w/h; camera.updateProjectionMatrix();
    U.uPx.value = h*DPR*.0105;
    const pw = Math.round(w*DPR), ph = Math.round(h*DPR);
    if (rtScene) rtScene.dispose();
    mips.forEach(m => { m.a.dispose(); m.b.dispose(); });
    rtScene = new THREE.WebGLRenderTarget(pw, ph, rtOpts);
    mips = [2,4,8,16].map(div => {
      const mw = Math.max(2, Math.round(pw/div)), mh = Math.max(2, Math.round(ph/div));
      return { a:new THREE.WebGLRenderTarget(mw,mh,rtOpts), b:new THREE.WebGLRenderTarget(mw,mh,rtOpts), w:mw, h:mh };
    });
  }
  window.addEventListener('resize', resize);
  const suiviTaille = window.ResizeObserver ? new ResizeObserver(() => resize()) : null;
  if (suiviTaille) suiviTaille.observe(stage);

  function composite(){
    renderer.setRenderTarget(rtScene); renderer.clear(); renderer.render(scene, camera);
    let src = rtScene.texture;
    for (const m of mips){
      quad.material = copyMat; copyMat.uniforms.tex.value = src;
      renderer.setRenderTarget(m.a); renderer.render(quadScene, quadCam);
      quad.material = blurMat; blurMat.uniforms.texel.value.set(1/m.w, 1/m.h);
      blurMat.uniforms.dir.value.set(1,0); blurMat.uniforms.tex.value = m.a.texture;
      renderer.setRenderTarget(m.b); renderer.render(quadScene, quadCam);
      blurMat.uniforms.dir.value.set(0,1); blurMat.uniforms.tex.value = m.b.texture;
      renderer.setRenderTarget(m.a); renderer.render(quadScene, quadCam);
      src = m.a.texture;
    }
    quad.material = compMat;
    compMat.uniforms.tScene.value = rtScene.texture;
    compMat.uniforms.tB0.value = mips[0].a.texture; compMat.uniforms.tB1.value = mips[1].a.texture;
    compMat.uniforms.tB2.value = mips[2].a.texture; compMat.uniforms.tB3.value = mips[3].a.texture;
    renderer.setRenderTarget(null); renderer.render(quadScene, quadCam);
  }

  /* ══ interaction ══ */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), ball = new THREE.Sphere(new THREE.Vector3(), 1.0), hit = new THREE.Vector3();
  const cv = renderer.domElement;
  let down = null;
  let ptLast = 0;                                    /* le tirage se relache a l'arret */
  cv.addEventListener('pointerdown', e => { down = { x:e.clientX, y:e.clientY }; cv.style.cursor='grabbing'; });
  cv.addEventListener('pointerup', e => { if (down && Math.hypot(e.clientX-down.x, e.clientY-down.y) < 6) inject(); down = null; cv.style.cursor='grab'; });
  cv.addEventListener('pointermove', e => {
    const b = cv.getBoundingClientRect();
    ndc.set(((e.clientX-b.left)/b.width)*2-1, -((e.clientY-b.top)/b.height)*2+1);
    ray.setFromCamera(ndc, camera);
    if (ray.ray.intersectSphere(ball, hit)){ orb.worldToLocal(hit); U.uPointer.value.copy(hit); U.uPointerOn.value = 1; ptLast = performance.now(); }
    else U.uPointerOn.value = 0;
  });
  cv.addEventListener('pointerleave', () => { U.uPointerOn.value = 0; });

  function inject(){
    waves.push({ r:0, life:1 });
    S.pulse = Math.min(1.7, S.pulse + 1.0);
    S.charge += .2;
    if (S.charge >= 1 && S.level < 6){ S.charge = 0; S.level++; build(S.level); waves.push({ r:0, life:1.4 }); S.pulse = 1.7; }
    else if (S.level >= 6) S.charge = 1;
  }
  function setMode(m){
    S.mode = m; S.pulse = Math.min(1.7, S.pulse + .55); waves.push({ r:0, life:.85 });
  }


  /* ===== BOUCLE ===== */

  /* ══ loop ══ */
  const clock = { last: performance.now(), dt(){ const n = performance.now(), d = (n - this.last)/1000; this.last = n; return d; } };
  let t = 0;
  const lerp = (a,b,k) => a + (b-a)*k;
  const curPal = { deep:[0,0,0], mid:[0,0,0], hot:[0,0,0] };
  curPal.deep = PAL[0].deep.slice(); curPal.mid = PAL[0].mid.slice(); curPal.hot = PAL[0].hot.slice();

  function frame(){
    if (!vivant) return;
    requestAnimationFrame(frame);
    const cw = Math.round(stage.clientWidth*DPR), ch = Math.round(stage.clientHeight*DPR);
    if (cv.width !== cw || cv.height !== ch) resize();
    if (!rtScene) return;

    const dt = Math.min(.05, clock.dt()); t += dt;
    const M = MODES[S.mode];

    /* Le micro et l'enveloppe reconstruite depuis le texte prononcé vivaient
       dans la page : elle parlait elle-même, avec la synthèse du navigateur.
       Ici c'est l'assistant qui parle, ailleurs, et l'amplitude arrive du dehors par
       `setLevel`. Le niveau du micro retombe donc doucement au lieu d'être
       mesuré — il reste utile le jour où l'on branchera la capture. */
    S.micLevel *= .9;
    /* Trois sources d'amplitude, par ordre de priorite : un niveau impose de
       l'exterieur (ORB.setLevel), l'enveloppe reconstruite depuis le texte
       prononce ici, ou — quand l'etat vient de Home Assistant sans amplitude —
       une enveloppe synthetique. Sans elle l'orbe resterait fige sur « parle ». */
    let speakAmp;
    if (S.force !== null) speakAmp = S.force;
    else if (S.mode === 'parle')
      /* L'enveloppe synthétique : sans elle, l'orbe resterait figée sur
         « parle » tant que personne ne lui donne d'amplitude. */
      speakAmp = Math.max(0, .34 + .30*Math.sin(t*7.3) + .22*Math.sin(t*11.9 + 1.7) + .14*Math.sin(t*19.1));
    else speakAmp = 0;
    const live = S.force !== null || S.mode === 'parle';
    const drive = Math.max(S.micLevel, Math.min(1, speakAmp));
    U.uVoice.value = speakAmp;
    U.uPitch.value = 0;

    const k = Math.min(1, dt*4.0);
    const vk = Math.min(1, dt*13.0);                       /* la voix agit vite */
    S.energy += ((M.energy + drive*.55 + S.pulse*.25) - S.energy)*(live ? vk : k);
    S.flow   += ((M.flow   + drive*1.9 + S.pulse*.8)  - S.flow)*(live ? vk : k);
    S.turb   += ((M.turb + drive*.75 + S.pulse*.45) - S.turb)*(live ? vk : k);
    if (live) controls.autoRotateSpeed = .2 + speakAmp*.9;
    S.pulse *= Math.pow(.15, dt);
    S.charge = Math.max(0, S.charge - dt*.02);
    if (S.mode === 'analyse' || S.mode === 'surch' || S.mode === 'pense') S.charge = Math.min(1, S.charge + dt*.035);
    if (S.charge >= 1 && S.level < 6){ S.charge = 0; S.level++; build(S.level); waves.push({ r:0, life:1.3 }); }

    /* On integre le deplacement au lieu de multiplier le temps par le debit :
       sinon un changement de debit repositionne d'un coup toute la population
       (l'ecart vaut uTime x delta, soit des dizaines de tours) et la structure
       se dissout en brouillard le temps de la transition. */
    if (performance.now() - ptLast > 450) U.uPointerOn.value *= Math.pow(.05, dt);

    S.phase += dt * S.flow;
    /* sens de l'influx : elle emet quand elle parle, elle absorbe quand elle
       ecoute. On lisse le retournement — l'onde ralentit, s'arrete, repart. */
    const dirT = (S.mode === 'ecoute' || S.micLevel > .03) ? -1 : 1;
    S.dir += (dirT - S.dir) * Math.min(1, dt*2.2);
    S.iph += dt * (0.22 + 0.15 * S.flow) * S.dir;
    U.uPhase.value = S.phase; U.uIph.value = S.iph;
    U.uDirS.value = S.dir >= 0 ? 1 : -1;

    const P = PAL[S.pal], pk = Math.min(1, dt*3.0);
    for (let i=0;i<3;i++){
      curPal.deep[i] = lerp(curPal.deep[i], P.deep[i], pk);
      curPal.mid[i]  = lerp(curPal.mid[i],  P.mid[i],  pk);
      curPal.hot[i]  = lerp(curPal.hot[i],  P.hot[i],  pk);
    }
    U.uDeep.value.setRGB(curPal.deep[0], curPal.deep[1], curPal.deep[2]);
    U.uMid.value.setRGB(curPal.mid[0], curPal.mid[1], curPal.mid[2]);
    U.uHot.value.setRGB(curPal.hot[0], curPal.hot[1], curPal.hot[2]);
    compMat.uniforms.uExp.value = 1.34 - S.energy*.16;
    compMat.uniforms.uBloom.value = 0.90 - S.energy*.34;

    U.uTime.value = t; U.uEnergy.value = S.energy; U.uFlow.value = S.flow; U.uTurb.value = S.turb;
    U.uPulse.value = S.pulse; U.uMic.value = drive;

    for (let i=waves.length-1;i>=0;i--){ const w = waves[i]; w.r += 1.9*dt; w.life -= dt*.8; if (w.life <= 0 || w.r > 2.6) waves.splice(i,1); }
    for (let i=0;i<4;i++){ const w = waves[i]; U.uWaves.value[i].set(w ? w.r : -9, w ? Math.max(0, w.life) : 0, 0, 0); }

    controls.autoRotateSpeed = .2 + M.spin*1.2;
    orb.rotation.x = Math.sin(t*.10)*.10;
    orb.rotation.z = Math.cos(t*.07)*.07;
    controls.update();
    composite();

  }
  resize(); build(1); frame();
  /* ── L'API de pilotage ────────────────────────────────────────────────────
   *
   * Reprise telle quelle de la page d'origine. Le vocabulaire dit ce que fait
   * l'assistant, pas le régime de rendu : c'est ce qui permet de changer le
   * second sans toucher à ce qui appelle le premier.
   */
  const ORB_MODE = { idle: 'repos', listening: 'ecoute', thinking: 'pense', speaking: 'parle' };
  const MODE_ORB = Object.fromEntries(Object.entries(ORB_MODE).map(([a, b]) => [b, a]));

  return {
    setState(nom) {
      const m = ORB_MODE[nom] || (MODES[nom] ? nom : null);
      if (m && m !== S.mode) setMode(m);
    },
    /* Le niveau force l'amplitude — la voix qu'on entend, le micro qu'on
     * écoute. Tant qu'il est posé, l'orbe ne respire plus toute seule. */
    setLevel(v) { S.force = Math.max(0, Math.min(1, +v || 0)); },
    releaseLevel() { S.force = null; },
    pulse() { waves.push({ r: 0, life: 1 }); S.pulse = Math.min(1.7, S.pulse + 1); },
    get state() { return MODE_ORB[S.mode] || S.mode; },
    /* Tout rendre. L'ordre compte : d'abord la boucle, sinon elle dessine sur
     * un contexte qu'on vient de libérer. */
    dispose() {
      if (!vivant) return;
      vivant = false;
      window.removeEventListener('resize', resize);
      if (suiviTaille) suiviTaille.disconnect();
      try {
        if (fluxMesh) fluxMesh.geometry.dispose();
        if (hazeMesh) hazeMesh.geometry.dispose();
        fluxMat.dispose(); hazeMat.dispose();
        copyMat.dispose(); blurMat.dispose(); compMat.dispose();
        curveTex.dispose();
        if (rtScene) rtScene.dispose();
        mips.forEach(m => { m.a.dispose(); m.b.dispose(); });
        renderer.dispose();
        if (cv.parentNode) cv.parentNode.removeChild(cv);
      } catch { /* un contexte déjà perdu n'a plus rien à rendre */ }
    },
  };
}

/**
 * L'orbe, côté React.
 *
 * `etat` suit ce que fait l'assistant, `niveau` l'amplitude de sa voix — `null` rend
 * à l'orbe sa respiration propre. `onToucher` sert au geste de la maquette :
 * toucher l'orbe pour parler.
 *
 * Le composant ne remonte JAMAIS l'orbe : la créer coûte un contexte WebGL et
 * quelques dizaines de milliers de particules. Elle naît au montage, meurt au
 * démontage, et reçoit ses ordres entre les deux.
 */
export default function Orbe({ etat = 'idle', niveau = null, onToucher = null, taille = 240 }) {
  /* Ni bord arrondi ni rognage : il n'y a plus rien a rogner. Le disque
   * venait du fond noir, pas d'un masque — le masque ne faisait que lui
   * donner sa forme ronde. */
  const cadre = {
    width: taille, height: taille, margin: '0 auto',
    display: 'block', position: 'relative',
  };
  const hoteRef = useRef(null);
  const orbeRef = useRef(null);

  useEffect(() => {
    if (!hoteRef.current) return undefined;
    let o = null;
    try {
      o = creerOrbe(hoteRef.current);
    } catch (e) {
      // Sans WebGL — machine ancienne, accélération coupée — le reste de la
      // popup doit continuer de fonctionner. On perd le décor, pas la parole.
      console.warn('Loggia : orbe indisponible', e);
      return undefined;
    }
    orbeRef.current = o;
    return () => { orbeRef.current = null; o.dispose(); };
  }, []);

  useEffect(() => { if (orbeRef.current) orbeRef.current.setState(etat); }, [etat]);
  useEffect(() => {
    const o = orbeRef.current;
    if (!o) return;
    if (niveau == null) o.releaseLevel(); else o.setLevel(niveau);
  }, [niveau]);

  return (
    /* Un vrai <button> quand on peut la toucher, un <div> sinon.
     *
     * Un `div` porteur de `role="button"` demande qu'on refasse à la main ce
     * qu'un bouton fait seul : le focus, la barre d'espace, l'annonce. Ce
     * n'est jamais tout à fait pareil, et c'est toujours le clavier qui paie. */
    onToucher ? (
      <button type="button" onClick={onToucher} aria-label={tr('Parler à l’assistant')}
        style={{ ...cadre, border: 'none', padding: 0, background: 'transparent', cursor: 'pointer' }}>
        <span ref={hoteRef} style={{ display: 'block', width: '100%', height: '100%' }} />
      </button>
    ) : (
      <div ref={hoteRef} style={cadre} />
    )
  );
}

/* ── En developpement, ce fichier force un rechargement complet ──────────────
 *
 * L'orbe nait dans un `useEffect(…, [])` : un contexte WebGL, une boucle
 * d'animation, quelques dizaines de milliers de particules. Le remplacement a
 * chaud de Vite echange bien le module, mais il ne rejoue PAS cet effet.
 * L'orbe qui tourne a l'ecran reste donc celle du chargement initial, batie
 * avec l'ancien code — on corrige, on regarde, et on voit l'ancien rendu.
 *
 * Ce n'est pas une hypothese : mesure du 09/09/2026 sur la demo, un temoin
 * pose sur `window` survivait a l'edition du fichier. Trois corrections
 * d'affilee ont ainsi paru sans effet, et la quatrieme a paru revenir en
 * arriere.
 *
 * Recharger tout est brutal, et c'est justement ce qu'il faut ici : l'orbe ne
 * sait pas se reconstruire a moitie. Le cout est nul — cette page se recharge
 * en une seconde, et on ne modifie pas ce fichier dix fois par minute.
 *
 * `import.meta.hot` vaut `undefined` au build : rien de ceci n'est livre.
 */
if (import.meta.hot) {
  import.meta.hot.accept(() => { window.location.reload(); });
}
