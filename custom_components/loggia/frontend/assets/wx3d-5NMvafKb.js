import{j as H,W as L}from"./index-CS6ZVfMj.js";import{W as V,S as j,O as G,P as _,a as O,V as h,M as K,C as N}from"./three-BMduzymL.js";import{r as p}from"./vendor-nf7bT_Uh.js";const X=`
precision highp float;
varying vec2 vUv;
uniform vec2  uRes;
uniform float uTime;
uniform float uElev;      // sun elevation -1..1
uniform vec2  uSunPos;
uniform vec2  uMoonPos;
uniform float uCloud;
uniform float uDark;
uniform float uFog;
uniform float uRain;
uniform float uSnow;
uniform float uHail;
uniform float uWind;
uniform float uStars;
uniform float uFlash;
uniform float uBolt;
uniform float uBoltSeed;
uniform float uExc;
uniform float uIntensity;

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
  for(int i=0;i<4;i++){ s += a*vnoise(p); p = p*2.02 + 11.3; a *= 0.5; }
  return s;
}

// ---- precipitation ---------------------------------------------------------
float rainLayer(vec2 uv, float scale, float speed, float slant, float len, float seed, float amt){
  uv.x += uv.y * slant;
  vec2 g = vec2(uv.x * scale, uv.y * scale * 0.42);
  float col = floor(g.x);
  float sp = speed * (0.80 + 0.5 * hash21(vec2(col, seed))) * (0.58 + 0.52 * amt + 1.08 * amt * amt);
  float gy = g.y + uTime * sp;
  float row = floor(gy);
  vec2 id = vec2(col, row);
  if (hash21(id + seed * 1.7) > 0.10 + 0.32 * amt) return 0.0;
  float jx = hash21(id + seed + 5.13);
  float hb = hash21(id + seed + 17.71);   // per-drop brightness
  float hl = hash21(id + seed + 29.37);   // per-drop length
  float y = fract(gy);
  float d = abs(fract(g.x) - (0.12 + 0.76 * jx));
  // hairline at drizzle, cord at downpour — width grows with the square of amount
  float w = (0.012 + 0.014 * y) * (1.35 + 0.40 * amt);
  float body = smoothstep(w, w * 0.30, d);   // crisp edge, not a soft smear
  float lenA = len * (0.45 + 0.85 * hl) * (1.10 + 0.30 * amt);
  float along = smoothstep(lenA, 0.0, y) * smoothstep(0.0, 0.010, y);
  return body * pow(along, 1.25) * (0.30 + 1.05 * hb * hb);
}

float snowLayer(vec2 uv, float scale, float speed, float seed){
  vec2 g = vec2(uv.x * scale, uv.y * scale);
  vec2 id = floor(g);
  float r = hash21(id + seed);
  float r2 = hash21(id + seed + 4.7);
  if (r > 0.30) return 0.0;
  float fall = uTime * speed * (0.6 + 0.8 * r2);
  vec2 c = vec2(0.5 + 0.30 * sin(uTime * (0.5 + r2 * 0.7) + r * 37.0), fract(0.5 - fall));
  float d = length((fract(g) - c) * vec2(1.0, 1.0));
  return smoothstep(0.075 + 0.085 * r2, 0.0, d);
}

float boltShape(vec2 uv, float seed){
  float y = uv.y;
  float x = 0.5 + 0.30 * (hash21(vec2(seed, 1.0)) - 0.5)
          + 0.10 * sin(y * 6.0 + seed * 21.0)
          + 0.045 * sin(y * 17.0 + seed * 7.0)
          + 0.02 * sin(y * 41.0 + seed * 3.0);
  float d = abs(uv.x - x);
  float core = exp(-d * 700.0);
  float glow = exp(-d * 55.0) * 0.28;
  float mask = smoothstep(0.0, 0.28, 1.0 - y) * smoothstep(-0.05, 0.25, 1.0 - y);
  return (core + glow) * mask;
}

void main(){
  float aspect = uRes.x / max(uRes.y, 1.0);
  vec2 uv = vUv;
  vec2 su = vec2(uv.x * aspect, uv.y);

  // ---- sky -----------------------------------------------------------------
  float dayW   = smoothstep(0.00, 0.32, uElev);
  float duskW  = exp(-pow((uElev - 0.015) / 0.13, 2.0));
  float nightW = 1.0 - smoothstep(-0.22, 0.03, uElev);
  float sum = dayW + duskW + nightW + 1e-4;
  dayW /= sum; duskW /= sum; nightW /= sum;

  vec3 dayTop = vec3(0.17, 0.37, 0.70), dayBot = vec3(0.60, 0.78, 0.92);
  vec3 dusTop = vec3(0.10, 0.07, 0.26), dusBot = vec3(0.98, 0.41, 0.22);
  vec3 nitTop = vec3(0.015, 0.022, 0.070), nitBot = vec3(0.045, 0.065, 0.150);

  float h = pow(clamp(uv.y, 0.0, 1.0), 0.85);
  vec3 sky = dayW * mix(dayBot, dayTop, h)
           + duskW * mix(dusBot, dusTop, h)
           + nightW * mix(nitBot, nitTop, h);

  // ---- stars ---------------------------------------------------------------
  if (uStars > 0.001) {
    vec2 g = su * 120.0;
    vec2 id = floor(g);
    float r = hash21(id);
    if (r > 0.955) {
      float r2 = hash21(id + 7.31);
      float r3 = hash21(id + 19.7);
      vec2 c = vec2(hash21(id + 2.13), hash21(id + 5.77));
      float d = length(fract(g) - c);
      float size = 0.10 + 0.26 * r2 * r2;
      float tw = 0.55 + 0.45 * sin(uTime * (0.8 + 1.8 * r3) + r2 * 60.0);
      vec3 tint = mix(vec3(0.72, 0.80, 1.0), vec3(1.0, 0.92, 0.80), r3);
      sky += tint * smoothstep(size, 0.0, d) * tw * (0.35 + 0.9 * r2) * uStars * nightW * 3.0;
    }
    // milky haze
    sky += vec3(0.10, 0.12, 0.22) * uStars * nightW * fbm(su * 2.2) * 0.22;
  }

  // ---- luminary ------------------------------------------------------------
  vec2 sp = vec2(uSunPos.x * aspect, uSunPos.y);
  float ds = length(su - sp);
  float sunUp = smoothstep(-0.06, 0.06, uElev);
  vec3 sunCol = mix(vec3(1.0, 0.52, 0.20), vec3(1.0, 0.96, 0.86), smoothstep(0.02, 0.35, uElev));
  // a thick cloud deck hides the disc entirely; only the wide glow survives
  float discVis = 1.0 - smoothstep(0.30, 0.80, uCloud);
  sky += sunCol * sunUp * (
      (smoothstep(0.032, 0.014, ds) * 1.25 + exp(-ds * 26.0) * 0.55) * discVis
    + exp(-ds * 5.0) * 0.30 * (0.25 + 0.75 * discVis));

  vec2 mp = vec2(uMoonPos.x * aspect, uMoonPos.y);
  float dm = length(su - mp);
  sky += vec3(0.82, 0.87, 1.0) * (smoothstep(0.021, 0.014, dm) * 1.1 * discVis + exp(-dm * 11.0) * 0.16 * (0.3 + 0.7 * discVis)) * nightW;

  // ---- exceptional haze ----------------------------------------------------
  vec3 excCol = vec3(0.0);
  float excAmt = 0.0;
  if (uExc > 0.001) {
    float d1 = fbm(su * 2.0 + vec2(uTime * 0.10, uTime * 0.03));
    float d2 = fbm(su * 5.5 - vec2(uTime * 0.24, uTime * 0.05));
    excCol = mix(vec3(0.38, 0.11, 0.06), vec3(0.95, 0.55, 0.14), pow(d2, 1.4));
    excAmt = uExc * (0.45 + 0.45 * d1);
    sky = mix(sky, excCol, excAmt);
  }

  // storm skies lose their saturation, so cloud gaps stop reading as blue holes
  sky = mix(sky, vec3(dot(sky, vec3(0.30, 0.55, 0.15))), clamp(uDark * 0.55 + uCloud * 0.35, 0.0, 0.85));

  // ---- clouds --------------------------------------------------------------
  vec3 col = sky;
  if (uCloud > 0.001) {
    float t = uTime * (0.010 + uWind * 0.085);
    vec2 q = su * vec2(2.6, 4.3) + vec2(t, 0.0);
    float w = fbm(q * 0.55);
    float n = fbm(q + w * 1.15);
    float det = fbm(q * 3.4 + w * 1.7 + vec2(t * 1.7, 0.0));
    float nn = clamp((n * 0.70 + det * 0.30 - 0.30) / 0.40, 0.0, 1.0);
    float cov = smoothstep(0.80 - uCloud * 0.80, 1.00 - uCloud * 0.66, nn);
    float band = mix(smoothstep(-0.05, 0.24, uv.y), 1.0, uCloud * 0.85);
    cov = pow(cov, 1.2) * band * smoothstep(0.03, 0.20, uCloud);
    cov = mix(cov, 1.0, uCloud * uCloud * 0.62);

    float lit = smoothstep(0.08, 0.60, nn);
    vec3 bright = mix(vec3(0.97, 0.97, 0.99), sunCol * 1.05, 0.30 * sunUp);
    vec3 shade  = mix(vec3(0.62, 0.65, 0.71), vec3(0.055, 0.06, 0.085), nightW);
    shade = mix(shade, shade * 0.74, uDark);
    vec3 cc = mix(shade, bright, lit * (1.0 - uDark * 0.38));
    cc = mix(cc, cc * 0.5, nightW * 0.6);
    cc *= mix(0.92, 1.0, smoothstep(0.0, 0.55, uv.y));
    cc += sunCol * exp(-ds * 3.2) * 0.26 * sunUp * (1.0 - uDark * 0.6);

    col = mix(col, cc, cov * (0.62 + 0.38 * uCloud));
  }

  col *= mix(1.0, 0.50, uDark);

  if (uExc > 0.001) col = mix(col, excCol, excAmt * 0.72);

  // ---- lightning -----------------------------------------------------------
  if (uFlash > 0.001) {
    col += vec3(0.72, 0.76, 1.0) * uFlash * (0.30 + 0.55 * smoothstep(0.0, 1.0, uv.y));
    col += vec3(0.85, 0.88, 1.0) * boltShape(uv, uBoltSeed) * uBolt;
  }

  // ---- fog -----------------------------------------------------------------
  if (uFog > 0.001) {
    float f = fbm(su * vec2(1.6, 2.4) + vec2(uTime * 0.035, uTime * 0.012));
    float band = mix(0.55, 1.0, 1.0 - smoothstep(0.0, 0.85, uv.y));
    vec3 fogCol = mix(vec3(0.80, 0.82, 0.84), vec3(0.10, 0.11, 0.14), nightW);
    fogCol = mix(fogCol, fogCol * mix(vec3(1.0), sunCol, 0.5), 0.35 * sunUp);
    col = mix(col, fogCol, clamp(uFog * band * (0.55 + 0.55 * f), 0.0, 0.97));
  }

  // ---- precipitation -------------------------------------------------------
  float slant = 0.10 + uWind * 0.85;
  if (uRain > 0.001) {
    float r = 0.0;
    r += rainLayer(su, 76.0, 16.2, slant, 0.44, 3.0, uRain) * 0.55;
    r += rainLayer(su, 46.0, 12.6, slant, 0.38, 9.0, uRain) * 0.85;
    r += rainLayer(su, 27.0,  9.4, slant, 0.32, 17.0, uRain) * 1.1;
    vec3 rc = mix(vec3(0.90, 0.95, 1.02), vec3(0.28, 0.34, 0.48), nightW);
    col += rc * r * uIntensity * (0.85 + 0.55 * uRain);
    // a torrential downpour reads as a moving veil, not just more drops
    float veil = smoothstep(0.55, 1.0, uRain);
    if (veil > 0.001) {
      vec2 vu = su * vec2(2.2, 0.55) + vec2(uTime * 0.48 * slant, uTime * 0.82);
      col += rc * veil * (0.022 + 0.050 * fbm(vu * 3.0)) * uIntensity;
    }
  }
  if (uHail > 0.001) {
    float g = 0.0;
    g += rainLayer(su, 62.0, 26.0, slant * 0.5, 0.14, 31.0, uHail);
    g += rainLayer(su, 40.0, 20.0, slant * 0.5, 0.12, 43.0, uHail);
    col += vec3(0.90, 0.94, 1.0) * g * uHail * uIntensity * 0.85;
  }
  if (uSnow > 0.001) {
    float s = 0.0;
    s += snowLayer(su, 46.0, 0.55, 2.0) * 0.55;
    s += snowLayer(su, 29.0, 0.85, 8.0) * 0.85;
    s += snowLayer(su, 18.0, 1.30, 15.0) * 1.0;
    vec3 sc = mix(vec3(1.0), vec3(0.62, 0.70, 0.88), nightW * 0.7);
    col += sc * s * uSnow * uIntensity * 0.85;
  }

  // ---- wind streaks --------------------------------------------------------
  if (uWind > 0.35) {
    float amt = smoothstep(0.35, 1.0, uWind);
    vec2 wu = su * vec2(1.1, 26.0) + vec2(uTime * (1.4 + uWind * 2.2), 0.0);
    float st = fbm(wu * vec2(0.9, 0.5));
    float lines = smoothstep(0.72, 0.98, st) * smoothstep(0.02, 0.35, uv.y);
    col += mix(vec3(0.92, 0.94, 1.0), vec3(0.35, 0.40, 0.52), nightW) * lines * amt * 0.20;
  }

  // ---- finish --------------------------------------------------------------
  vec2 c = uv - 0.5;
  col *= 1.0 - dot(c, c) * 0.34;
  col += (hash21(uv * uRes + fract(uTime)) - 0.5) * 0.012;
  col = col / (1.0 + max(col - 0.80, vec3(0.0)));
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;function Z({condition:x="partlycloudy",hourEq:y=12,intensity:g=1}){const w=p.useRef(null),c=p.useRef({condition:x,hourEq:y,intensity:g});return c.current={condition:x,hourEq:y,intensity:g},p.useEffect(()=>{const l=w.current;if(!l)return;let b=!1,C=0,a;try{a=new V({antialias:!1})}catch{return}a.setPixelRatio(Math.max(1,Math.min(window.devicePixelRatio||1,1.5)));const d=a.domElement;d.style.cssText="position:absolute;inset:0;display:block;width:100%;height:100%;",l.appendChild(d);const W=new j,A=new G(-1,1,1,-1,0,1),e={uRes:{value:new h(1,1)},uTime:{value:0},uElev:{value:.6},uSunPos:{value:new h(.5,.8)},uMoonPos:{value:new h(.5,-.4)},uCloud:{value:0},uDark:{value:0},uFog:{value:0},uRain:{value:0},uSnow:{value:0},uHail:{value:0},uWind:{value:0},uStars:{value:0},uFlash:{value:0},uBolt:{value:0},uBoltSeed:{value:0},uExc:{value:0},uIntensity:{value:1}},k=new _(2,2),S=new O({uniforms:e,vertexShader:"varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",fragmentShader:X});W.add(new K(k,S));const M=()=>{const o=l.clientWidth||1,i=l.clientHeight||1;a.setSize(o,i,!1),e.uRes.value.set(o*a.getPixelRatio(),i*a.getPixelRatio())},R=new ResizeObserver(M);R.observe(l),M();const T=["cloud","dark","fog","rain","snow","hail","wind","stars","exc"],r={};T.forEach(o=>{r[o]=0});let u=.2;const E=new N;let s=0,v=0,m=2;const U=1e3/30;let P=0;function B(){if(b||(C=requestAnimationFrame(B),document.hidden))return;const o=Math.min(E.getDelta(),.05),i=E.elapsedTime;e.uTime.value=i;const f=L[c.current.condition]||L.partlycloudy;let n=c.current.hourEq;f.forceNight&&(n=23.2),f.forceDay&&(n=Math.min(Math.max(n,8),17));const D=(n-6)/12*Math.PI,z=Math.sin(D);u+=(z-u)*Math.min(1,o*2.2),e.uElev.value=u;const F=.68+.26*Math.sin((n-6)/12*Math.PI-Math.PI/2)*-1;e.uSunPos.value.set(F,.18+u*.72),e.uMoonPos.value.set(1-F,.18-u*.72),T.forEach(t=>{r[t]+=((f[t]||0)-r[t])*Math.min(1,o*2.4),e["u"+t[0].toUpperCase()+t.slice(1)].value=r[t]}),e.uIntensity.value=c.current.intensity;const q=f.strike||0;if(q>0){m-=o*q,m<=0&&(m=1.6+Math.random()*4.5,s=1,v=Math.random()<.75?1:0,e.uBoltSeed.value=Math.random()*100);const t=.55+.45*Math.sin(i*90);e.uFlash.value=s*t*.85,e.uBolt.value=v*Math.pow(s,.4)*t,s=Math.max(0,s-o*3.4),s<.02&&(v=0)}else s=0,v=0,e.uFlash.value+=(0-e.uFlash.value)*Math.min(1,o*6),e.uBolt.value=0;const I=typeof performance<"u"?performance.now():Date.now();I-P>=U&&(P=I,a.render(W,A))}return B(),()=>{b=!0,cancelAnimationFrame(C),R.disconnect(),k.dispose(),S.dispose(),a.dispose();try{l.removeChild(d)}catch{}}},[]),H.jsx("div",{ref:w,"aria-hidden":"true",style:{position:"absolute",inset:0}})}export{L as WX_PRESETS,Z as default};
