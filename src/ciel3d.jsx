// Ciel profond étoilé (handoff Claude Design, bundle « Lentille gravitationnelle », 20/08/2026).
// Catalogue J2000 + shader GLSL copiés VERBATIM du prototype — ne pas les réécrire.
// Ajouts Loggia : scintillement des étoiles (même formule que le fond météo) et dérive lente.
// Les astérismes (lignes), les noms d'étoiles et la boucle de Barnard sont volontairement absents.
import * as THREE from 'three';
import { useEffect, useRef } from 'react';

const RA0 = 83.8, DEC0 = -1.5;

const RAW = [
  ['Betelgeuse', 88.7929,  7.4071, 0.45, [1.00, 0.56, 0.32], 1.0],
  ['Rigel',      78.6345, -8.2016, 0.18, [0.72, 0.80, 1.00], 1.0],
  ['Bellatrix',  81.2828,  6.3497, 1.64, [0.76, 0.84, 1.00], 0.9],
  ['Mintaka',    83.0016, -0.2991, 2.25, [0.74, 0.83, 1.00], 0.8],
  ['Alnilam',    84.0534, -1.2019, 1.69, [0.72, 0.82, 1.00], 0.9],
  ['Alnitak',    85.1897, -1.9426, 1.74, [0.74, 0.82, 1.00], 0.9],
  ['Saiph',      86.9391, -9.6696, 2.07, [0.78, 0.86, 1.00], 0.8],
  ['Meissa',     83.7845,  9.9342, 3.39, [0.78, 0.86, 1.00], 0.5],
  ['Hatysa',     83.8582, -5.9099, 2.77, [0.76, 0.84, 1.00], 0.6],
  ['η Ori',      81.1193, -2.3970, 3.36, [0.78, 0.85, 1.00], 0.4],
  ['σ Ori',      84.6866, -2.6000, 3.77, [0.78, 0.85, 1.00], 0.4],
  ['τ Ori',      79.4014, -6.8443, 3.60, [0.80, 0.86, 1.00], 0.4],
  ['μ Ori',      90.5959,  9.6491, 4.12, [0.94, 0.92, 0.86], 0.3],
  ['θ¹ Ori',     83.8186, -5.3897, 4.98, [0.82, 0.88, 1.00], 0.3],
  ['π¹ Ori',     73.7128, 10.1503, 4.65, [0.92, 0.92, 0.90], 0.2],
  ['π² Ori',     72.6539,  8.9002, 4.36, [0.96, 0.90, 0.82], 0.2],
  ['π³ Ori',     72.4600,  6.9611, 3.19, [1.00, 0.94, 0.80], 0.4],
  ['π⁴ Ori',     72.8010,  5.6050, 3.69, [0.82, 0.88, 1.00], 0.3],
  ['π⁵ Ori',     73.5628,  2.4408, 3.72, [0.80, 0.87, 1.00], 0.3],
  ['π⁶ Ori',     74.6220,  1.7140, 4.47, [1.00, 0.78, 0.52], 0.2],
];

const STARS = RAW.map(([n, ra, dec, m, c, sp]) => ({
  n, m, c, sp,
  x: -(ra - RA0) * Math.cos(dec * Math.PI / 180),
  y: dec - DEC0,
}));
const S = n => STARS.find(s => s.n === n);

const LINES = [
  ['Betelgeuse', 'Bellatrix'],
  ['Bellatrix', 'Mintaka'], ['Betelgeuse', 'Alnitak'],
  ['Mintaka', 'Alnilam'], ['Alnilam', 'Alnitak'],
  ['Alnitak', 'Saiph'], ['Mintaka', 'Rigel'],
  ['Saiph', 'Rigel'],
  ['Meissa', 'Betelgeuse'], ['Meissa', 'Bellatrix'],
  ['Betelgeuse', 'μ Ori'],
  ['Bellatrix', 'π³ Ori'],
  ['π¹ Ori', 'π² Ori'], ['π² Ori', 'π³ Ori'], ['π³ Ori', 'π⁴ Ori'],
  ['π⁴ Ori', 'π⁵ Ori'], ['π⁵ Ori', 'π⁶ Ori'],
];

const LABELLED = ['Betelgeuse', 'Rigel', 'Bellatrix', 'Mintaka', 'Alnilam', 'Alnitak', 'Saiph', 'Meissa', 'Hatysa'];

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform vec2  uRes;
uniform float uTime;
uniform vec2  uCenter;
uniform float uSpan;      // degrees across screen height
uniform float uExposure;
uniform float uNebula;
uniform float uDust;
uniform float uLimitMag;
uniform float uLoop;
uniform vec4  uStar[20];   // x, y, magnitude, spikeAmount
uniform vec3  uStarCol[20];

float hash21(vec2 p){
  vec2 q = fract(p * vec2(443.8975, 441.4232));
  q += dot(q, q + 19.19);
  return fract((q.x + q.y) * q.x);
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash21(i), hash21(i+vec2(1,0)), u.x),
             mix(hash21(i+vec2(0,1)), hash21(i+vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++){ s += a*vnoise(p); p = p*2.03 + 7.7; a *= 0.5; }
  return s;
}
float ridge(vec2 p){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++){ s += a*(1.0 - abs(vnoise(p)*2.0-1.0)); p = p*2.07 + 3.3; a *= 0.5; }
  return s;
}

// emission blob in sky degrees
float cloud(vec2 p, vec2 c, vec2 r, float freq, float warp, float pw){
  vec2 d = (p - c) / r;
  float q = dot(d, d);
  if (q > 6.0) return 0.0;
  vec2 w = vec2(fbm(d * freq * 0.55 + 11.0), fbm(d * freq * 0.55 + 31.0)) - 0.5;
  float n = fbm(d * freq + w * warp);
  return exp(-q * 1.15) * pow(clamp(n, 0.0, 1.0), pw);
}

void main(){
  float aspect = uRes.x / max(uRes.y, 1.0);
  vec2 uv = vUv;
  vec2 p = uCenter + vec2((uv.x - 0.5) * aspect, uv.y - 0.5) * uSpan;
  vec2 sPix = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);   // screen-height units

  vec3 col = vec3(0.006, 0.008, 0.017);

  // ---- interstellar dust: absorbs everything behind it ---------------------
  float dustField = fbm(p * 0.16 + 4.0) * 0.65 + ridge(p * 0.09) * 0.5;
  float lane = exp(-pow((p.x + 0.6) / 7.5, 2.0)) * 0.5 + 0.5;
  float dust = clamp((dustField - 0.42) * 1.9, 0.0, 1.0) * lane * uDust;

  // ---- background field stars ---------------------------------------------
  float cell = 42.0;
  for (int oy = -1; oy <= 1; oy++) {
    for (int ox = -1; ox <= 1; ox++) {
      vec2 g = sPix * cell;
      vec2 id = floor(g) + vec2(float(ox), float(oy));
      float h = hash21(id);
      if (h > 0.78) continue;
      float h2 = hash21(id + 5.1), h3 = hash21(id + 13.7);
      float mag = 4.2 + 5.6 * pow(h2, 0.7);
      if (mag > uLimitMag) continue;
      vec2 c = (id + vec2(hash21(id + 2.3), hash21(id + 8.9))) / cell;
      float r = length(sPix - c);
      float flux = pow(10.0, -0.4 * (mag - 2.0));
      vec3 tint = mix(vec3(0.70, 0.79, 1.0), vec3(1.0, 0.82, 0.62), h3);
      // scintillement : les étoiles faibles bougent le plus (seeing atmosphérique)
      float tw = 0.55 + 0.45 * sin(uTime * (0.8 + 1.8 * h3) + h2 * 60.0);
      float twAmt = mix(0.35, 1.0, clamp((mag - 4.0) / 4.0, 0.0, 1.0));
      float twk = mix(1.0, tw, twAmt);
      col += tint * flux * (exp(-r * r * 260000.0) * 1.15 * twk + exp(-r * 620.0) * 0.016);
    }
  }
  col *= mix(1.0, 0.42, dust);

  // ---- nebulae ------------------------------------------------------------
  vec3 neb = vec3(0.0);

  // Barnard's Loop — a 9° arc of Hα around the whole complex
  {
    vec2 d = p - vec2(-0.45, -0.5);
    float rr = length(d);
    float band = exp(-pow((rr - 9.2) / 1.25, 2.0));
    float ang = atan(d.y, d.x);
    float arc = smoothstep(-2.6, -1.4, ang) * smoothstep(2.9, 1.2, ang);
    band *= 0.35 + 0.65 * fbm(d * 0.55 + 21.0);
    neb += vec3(0.95, 0.17, 0.13) * band * arc * 0.11 * uLoop;
  }

  // M42 / M43 — the Loggia Nebula
  {
    vec2 c = vec2(-0.02, -3.89);
    float body = cloud(p, c, vec2(1.05, 0.85), 3.2, 1.4, 1.5);
    float core = cloud(p, c + vec2(0.02, 0.03), vec2(0.30, 0.26), 5.0, 0.9, 1.1);
    float wings = cloud(p, c, vec2(2.3, 1.9), 1.5, 1.8, 2.1);
    neb += vec3(0.98, 0.34, 0.55) * (body * 1.15 + wings * 0.6);
    neb += vec3(0.55, 0.95, 0.86) * core * 1.5;
    neb += vec3(1.00, 0.94, 0.86) * cloud(p, c, vec2(0.11, 0.10), 6.0, 0.4, 0.7) * 2.2;
    // dark bay in front of the Trapezium
    float bay = cloud(p, c + vec2(0.16, 0.14), vec2(0.26, 0.17), 4.0, 1.0, 1.3);
    neb *= 1.0 - clamp(bay * 0.7, 0.0, 0.75);
  }

  // NGC 1977, the Running Man — reflection, so blue
  neb += vec3(0.42, 0.56, 1.0) * cloud(p, vec2(-0.05, -3.30), vec2(0.62, 0.44), 3.6, 1.3, 1.6) * 0.55;

  // NGC 2024, the Flame
  neb += vec3(1.00, 0.52, 0.22) * cloud(p, vec2(-1.68, -0.35), vec2(0.34, 0.40), 4.4, 1.1, 1.4) * 0.9;

  // IC 434 around the Horsehead, then the dark pillar itself
  neb += vec3(0.90, 0.24, 0.30) * cloud(p, vec2(-1.42, -1.05), vec2(0.75, 0.30), 3.0, 1.0, 1.5) * 0.5;
  {
    vec2 d = (p - vec2(-1.45, -0.98)) / vec2(0.16, 0.20);
    float head = exp(-dot(d, d) * 1.6) * (0.5 + 0.5 * fbm(d * 3.0));
    neb *= 1.0 - clamp(head * 0.85, 0.0, 0.9);
  }

  // IC 2118, the Witch Head, lit by Rigel
  neb += vec3(0.34, 0.50, 1.0) * cloud(p, vec2(7.9, -5.3), vec2(1.5, 1.9), 2.2, 1.6, 2.0) * 0.30;

  // the wider molecular cloud glow
  neb += vec3(0.55, 0.18, 0.22) * cloud(p, vec2(-0.6, -2.2), vec2(5.5, 6.5), 1.0, 1.7, 2.4) * 0.09;

  col += neb * uNebula * mix(1.0, 0.45, dust);

  // ---- catalogue stars ----------------------------------------------------
  for (int i = 0; i < 20; i++) {
    vec4 s = uStar[i];
    vec2 ds = (p - s.xy) / uSpan;
    float r = length(ds);
    if (r > 0.5) continue;
    float flux = pow(10.0, -0.4 * (s.z - 2.3));
    float twb = 0.86 + 0.14 * sin(uTime * (1.1 + 0.9 * fract(s.x * 0.37 + s.y * 0.11)) + s.z * 12.0);
    float core = exp(-r * r * 190000.0) * 1.7 * twb;
    float halo = exp(-r * 320.0) * 0.055 + exp(-r * 46.0) * 0.010;
    float spike = s.w * 0.055 * twb * (
        exp(-abs(ds.x) * 40.0 - abs(ds.y) * 900.0)
      + exp(-abs(ds.y) * 40.0 - abs(ds.x) * 900.0));
    col += uStarCol[i] * flux * (core + halo + spike);
  }

  // ---- finish -------------------------------------------------------------
  col *= uExposure;
  vec2 vg = uv - 0.5;
  col *= 1.0 - dot(vg, vg) * 0.42;
  col += (hash21(uv * uRes + fract(uTime)) - 0.5) * 0.008;
  col = col / (1.0 + max(col - 0.85, vec3(0.0)));
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export default function CielEtoile({ drift = true, exposure = 1.38, limitMag = 8.8 }) {
  const hostRef = useRef(null);
  const propsRef = useRef({ drift, exposure });
  propsRef.current = { drift, exposure };
  useEffect(() => {
    const host = hostRef.current; if (!host) return undefined;
    let disposed = false, rafId = 0;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: false }); } catch (e) { return undefined; }
    renderer.setPixelRatio(Math.max(1, Math.min(window.devicePixelRatio || 1, 1.5)));
    const canvas = renderer.domElement;
    canvas.style.cssText = 'position:absolute;inset:0;display:block;width:100%;height:100%;';
    host.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const starVec = STARS.slice(0, 20).map(s => new THREE.Vector4(s.x, s.y, s.m, s.sp));
    const starCol = STARS.slice(0, 20).map(s => new THREE.Vector3(...s.c));
    const BASE = { cx: 0.6, cy: 1.0, span: 30 };
    const U = {
      uRes: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uCenter: { value: new THREE.Vector2(BASE.cx, BASE.cy) },
      uSpan: { value: BASE.span },
      uExposure: { value: exposure },
      uNebula: { value: 1.0 },
      uDust: { value: 0.75 },
      uLimitMag: { value: limitMag },
      uLoop: { value: 0 },
      uStar: { value: starVec },
      uStarCol: { value: starCol },
    };
    const geo = new THREE.PlaneGeometry(2, 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: FRAG,
    });
    scene.add(new THREE.Mesh(geo, mat));

    const resize = () => {
      const w = host.clientWidth || 1, h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      U.uRes.value.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    const clock = new THREE.Clock();
    // Plafond de rendu : le temps avance toujours, le GPU souffle.
    const MS_PAR_IMAGE = 1000 / 30;
    let dernierRendu = 0;
    function frame() {
      if (disposed) return;
      rafId = requestAnimationFrame(frame);
      // Onglet caché ou veille ambiante par-dessus : le rendu ne servirait à personne.
      if (document.hidden || document.documentElement.classList.contains('loggia-ambient-on')) return;
      const t = clock.elapsedTime;
      clock.getDelta();
      U.uTime.value = t;
      U.uExposure.value = propsRef.current.exposure;
      if (propsRef.current.drift) {
        U.uCenter.value.set(BASE.cx + Math.sin(t * 0.012) * 1.6, BASE.cy + Math.cos(t * 0.009) * 0.8);
      } else {
        U.uCenter.value.set(BASE.cx, BASE.cy);
      }
      const maintenant = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      if (maintenant - dernierRendu >= MS_PAR_IMAGE) {
        dernierRendu = maintenant;
        renderer.render(scene, camera);
      }
    }
    frame();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      ro.disconnect();
      geo.dispose(); mat.dispose(); renderer.dispose();
      try { host.removeChild(canvas); } catch (e) {}
    };
  }, []);
  return <div ref={hostRef} aria-hidden="true" style={{ position: 'absolute', inset: 0 }} />;
}
