/* <loggia-ciel> — le ciel de la bannière de l'Accueil, en WebGL.
 *
 * Handoff « Loggia themes redesign » (ciel-meteo.js, 17/10/2026). RÈGLE : le
 * shader FS, la table des ciels (wxpresets.js) et le dessin des particules
 * sont la SPÉCIFICATION, copiés tels quels. Seul l'hôte est adapté à Loggia,
 * pour garder ce que l'ancien ciel avait appris (lot 14 de l'audit du 03/10,
 * ADR 0180) :
 *   - le lever et le coucher sont les VRAIS (attributs lever / coucher, calculés
 *     par Loggia), au lieu de ceux du 9 octobre ;
 *   - la boucle dort jusqu'à l'échéance de l'image suivante au lieu de réveiller
 *     le navigateur à chaque rafraîchissement, et s'arrête sous la veille et
 *     onglet caché, pas seulement hors du cadre ;
 *   - le shader se compile hors du fil principal quand le pilote le permet
 *     (KHR_parallel_shader_compile) : l'Accueil ne fige plus à froid ;
 *   - au démontage, le contexte WebGL est rendu, pas laissé au ramasse-miettes ;
 *   - la couleur du fond se lit quel que soit son format (le thème « Suivre
 *     HA » ne la donne pas forcément en #rrggbb) ;
 *   - le vent qui pousse les nuages repart de zéro quand personne ne regarde :
 *     sur une tablette allumée des semaines, sa coordonnée finirait par user
 *     la précision du float (ticket #25, mesuré : tests/wx3d_hash.test.mjs) ;
 *   - sous 440 px de haut (le téléphone), le fondu garde les proportions du
 *     bandeau d'origine au lieu de se tasser sous ses 250 premiers pixels ;
 *   - les étoiles SCINTILLENT chacune à son rythme (18/10, sa demande : « elles
 *     doivent scintiller, pas clignoter ») : deuxième retouche du shader après
 *     le repli du #25 — leur rythme venait du tirage qui les fait paraître, le
 *     même pour toutes (voir tests/ciel_etoiles) ;
 *   - deux restes sans lecteur (une variable de grêle, les `e` des `catch`)
 *     sont partis : la règle d'eslint du projet les refuse.
 *
 * Un seul fragment shader dessine tout : le dégradé du ciel selon la hauteur
 * du soleil (jour, aube et crépuscule dorés, nuit), le soleil et son halo, la
 * lune et les étoiles, une couche de nuages éclairée du côté du soleil, la
 * pluie, la neige, le brouillard et les éclairs.
 *
 * Attributs : meteo = clair | nuageux | couvert | pluie | orage | neige | brouillard | vent
 *             heure = « auto » (l'horloge) ou un nombre de 0 à 24.
 *             qualite = auto | plein | leger | fixe (auto mesure la fluidité et descend d'un cran si l'appareil rame).
 * Les changements de météo se fondent en une seconde et demie. Mouvement
 * réduit : l'image reste, le temps s'arrête. Hors écran : rien ne tourne. */
import { cielDe } from './wxpresets.js';

(() => {
  if (typeof customElements === 'undefined' || customElements.get('loggia-ciel')) return;
  // Hors de tout navigateur qui dessine (la veille, un onglet caché) : rien ne doit tourner.
  const auRepos = () => document.hidden || document.documentElement.classList.contains('loggia-ambient-on');
  // Réveil 4 ms avant l'échéance — la tolérance que l'image s'accorde : le rafraîchissement suivant
  // tombe toujours dans sa fenêtre, et chaque image ne coûte qu'UNE demande à l'écran.
  const AVANCE_MS = 4;
  const VS = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
  const FS = `precision highp float;
uniform vec2 uRes;uniform float uTime;uniform vec3 uSun;uniform vec3 uMoon;
uniform float uCover,uRain,uSnow,uFog,uStorm,uFlash,uZone,uDrift,uWind,uExc;uniform vec3 uFond;uniform vec2 uFlashP;uniform float uPhase;
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
// Repli avant le hash (cf. issue loggia #25) : le vent fait grandir la coordonnee sans fin ;
// sans repli, fract(p*456.) epuise la precision du float et le ciel se casse en rectangles.
float hn(vec2 p){return hash(mod(p,256.));}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);float a=hn(i),b=hn(i+vec2(1.,0.)),c=hn(i+vec2(0.,1.)),d=hn(i+vec2(1.,1.));return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);for(int i=0;i<OCT;i++){v+=a*noise(p);p=m*p;a*=.5;}return v;}
float rainL(vec2 p,float t,float cols,float spd,float len,float w,float sd){
  p.x+=p.y*.22;float cx=p.x*cols;float ci=floor(cx);
  float r1=hash(vec2(ci,sd)),r2=hash(vec2(ci,sd+17.));
  float y=(p.y+t*spd*(.75+.5*r1))/len+r2*13.;float seg=floor(y);float rr=hash(vec2(ci,seg+sd*3.1));
  float fy=fract(y);float s=.22+.25*rr;float tail=smoothstep(s,0.,fy)*smoothstep(0.,.03,fy);
  float off=(hash(vec2(seg,ci+sd))-.5)*.5;float dx=abs(fract(cx)-.5-off);
  return step(.48,rr)*tail*smoothstep(w,w*.15,dx);
}
float snowL(vec2 p,float t,float sc,float spd,float rad,float sd){
  p*=sc;p.y+=t*spd*sc*.1;p.x+=sin(t*.45+p.y*.55+sd)*.55;
  vec2 ci=floor(p);vec2 f=fract(p)-.5;float r=hash(ci+sd);
  vec2 o=(vec2(hash(ci+sd+1.3),hash(ci+sd+2.9))-.5)*.6;o.x+=sin(t*(.7+r)+r*20.)*.1;
  float d=length(f-o);float sz=rad*(.45+.75*hash(ci+sd+4.4));
  return step(.3,r)*exp(-d*d/(sz*sz));
}
void main(){
  vec2 uv=gl_FragCoord.xy/uRes;float asp=uRes.x/uRes.y;vec2 p=vec2(uv.x*asp,uv.y);
  float e=uSun.z;float day=smoothstep(-.18,.12,e);float dusk=exp(-pow(e/.17,2.));float night=1.-smoothstep(-.25,0.,e);float wet=clamp(uRain+uStorm*.5,0.,1.);float dusk0=dusk;dusk*=1.-min(1.,wet*3.)*.88;
  float hv=clamp((uv.y-uZone)/(1.-uZone),0.,1.);float h=pow(1.-hv,1.6);
  vec3 zen=mix(vec3(.012,.02,.05),vec3(.15,.37,.74),day);zen=mix(zen,vec3(.2,.24,.46),dusk*.75);
  vec3 hor=mix(vec3(.035,.06,.13),vec3(.6,.77,.94),day);hor=mix(hor,vec3(.98,.56,.33),dusk);
  vec3 col=mix(zen,hor,h);
  float g0=dot(col,vec3(.3,.59,.11));col=mix(col,vec3(g0)*vec3(.95,.98,1.04),uCover*.55);col*=1.-uCover*.25*day;col=mix(col,vec3(.7,.73,.78),smoothstep(.62,.95,uCover)*.5*day);
  vec2 sp=vec2(uSun.x*asp,uSun.y);float d=length(p-sp);
  vec3 sunCol=mix(vec3(1.,.55,.25),vec3(1.,.97,.9),smoothstep(0.,.35,e));float vis=smoothstep(-.06,.02,e);
  float zone=smoothstep(uZone,uZone+.12,uv.y);
  col+=sunCol*(exp(-d*3.2)*.5*(.45+.55*zone)+exp(-d*14.)*.6*zone)*vis*(1.-uCover*.7)*(1.-wet*.85);
  col+=sunCol*smoothstep(.034,.027,d)*vis*zone*(1.-smoothstep(.55,.85,uCover))*1.4;
  vec2 mp=vec2(uMoon.x*asp,uMoon.y);float md=length(p-mp);float mv=uMoon.z*night*(1.-smoothstep(.55,.85,uCover));
  // Lune : vraie phase (terminateur sur une sphere), mers de la face visible, Tycho et Copernic, lumiere cendree.
  float mR=.042,mTh=uPhase*6.2832,mFr=.5-.5*cos(mTh);
  col+=vec3(.75,.82,1.)*exp(-md*9.)*.22*mv*(.15+.85*mFr)*(1.-uCover*.8);
  if(mv>.001&&md<mR*1.3){
    vec2 m=(p-mp)/mR;float mr=length(m),mpx=1./(mR*uRes.y);
    float mDisc=1.-smoothstep(1.-1.5*mpx,1.+.5*mpx,mr);
    float mz=sqrt(max(0.,1.-mr*mr));vec3 mN=vec3(m,mz);
    vec3 mL=vec3(sin(mTh),0.,-cos(mTh));float mca=cos(-.35),msa=sin(-.35);mL.xy=vec2(mca*mL.x-msa*mL.y,msa*mL.x+mca*mL.y);
    float mLit=smoothstep(-.03,.09,dot(mN,mL));
    vec2 a;float mare=0.;
    a=(m-vec2(-.52,.1))*vec2(1.5,1.);mare+=.75*exp(-dot(a,a)/.1);
    a=m-vec2(-.25,.42);mare+=.85*exp(-dot(a,a)/.048);
    a=m-vec2(.17,.43);mare+=.8*exp(-dot(a,a)/.02);
    a=m-vec2(.3,.14);mare+=.8*exp(-dot(a,a)/.03);
    a=m-vec2(.66,.3);mare+=.85*exp(-dot(a,a)/.009);
    a=m-vec2(.52,-.13);mare+=.6*exp(-dot(a,a)/.017);
    a=m-vec2(.35,-.31);mare+=.55*exp(-dot(a,a)/.007);
    a=m-vec2(-.16,-.36);mare+=.6*exp(-dot(a,a)/.022);
    a=(m-vec2(0.,.72))*vec2(.45,2.2);mare+=.5*exp(-dot(a,a)/.04);
    mare=clamp(mare*(.72+.56*noise(m*6.+3.1)),0.,1.);
    a=m-vec2(-.12,-.68);float tyc=exp(-dot(a,a)/.0012);a=m-vec2(-.28,.12);float cop=exp(-dot(a,a)/.0009);
    vec3 surf=mix(vec3(.95,.93,.88)*(.86+.14*noise(m*12.+7.7)),vec3(.56,.56,.58),mare*.72)+vec3(.14)*(tyc+cop*.6);
    surf*=.86+.14*mz;
    vec3 mDark=col*.72+vec3(.06,.07,.09)*(1.-mFr)*(.55+.45*(1.-mare));
    col=mix(col,mix(mDark,surf,mLit),mDisc*mv*(1.-uCover*.85));
  }
  vec2 g=p*90.;vec2 gi=floor(g);float r=hash(gi);
  float star=step(.985,r)*smoothstep(.13,0.,length(fract(g)-.5-(vec2(hash(gi+3.),hash(gi+7.))-.5)*.5));
  // Scintillement (retouche du 18/10, la 2e du shader apres le repli du #25) : le rythme venait de r, que
  // step(.985,r) borne pour toute etoile visible a [.985,1] -- meme frequence, meme phase, toutes pulsaient
  // ensemble, de 10 a 100 %. Deux tirages a part, deux ondes melees, une amplitude douce ; des periodes
  // entieres sur l'heure, pour que uTime (t % 3600) revienne a zero sans faire sauter les etoiles.
  float r2=hash(gi+11.),r3=hash(gi+23.),kh=6.2831853/3600.;
  star*=.64+.2*(.6*sin(uTime*kh*floor(500.+r2*2600.)+r3*6.2831853)+.4*sin(uTime*kh*floor(1300.+r3*3400.)+r2*6.2831853));
  col+=vec3(.9,.95,1.)*star*night*(1.-uCover)*smoothstep(.12,.55,uv.y)*1.3;
  float yy=uv.y+.22;vec2 cp=vec2((uv.x-.5)*asp/yy*(1.-.45*smoothstep(.5,1.,uWind)),1./yy)*1.15*clamp(2.4/asp,1.,1.8);vec2 wind=vec2(-uDrift,0.);
  vec2 q=vec2(fbm(cp*1.3+wind),fbm(cp*1.3+wind+5.2));float n=fbm(cp*2.1+q*1.4+wind*1.6);
  float th=mix(.8,.26,uCover);float dens=smoothstep(th,th+.3,n);
  vec2 toS=normalize(vec2(sp.x-p.x,sp.y-p.y)+1e-4);float n2=fbm(cp*2.1+q*1.4+wind*1.6+toS*.09);
  float lit=clamp((n-n2)*4.+.55,0.,1.);lit=mix(lit,.5+(lit-.5)*.3,wet);
  float ov=smoothstep(.62,.95,uCover);float sf=max(ov,.65*smoothstep(.25,.5,uCover));vec3 cDay=mix(mix(vec3(.6,.64,.71),vec3(.74,.77,.82),sf),mix(vec3(1.),vec3(.93,.94,.96),sf),lit);vec3 cDusk=mix(vec3(.36,.29,.38),vec3(1.,.66,.46),lit);
  vec3 cNight=mix(vec3(.04,.06,.1),vec3(.2,.24,.34),lit*uMoon.z);
  vec3 cc=mix(cNight,cDay,day);cc=mix(cc,cDusk,dusk*.8);cc*=1.-uCover*.35*(1.-lit)*(1.-sf*.75);cc=mix(cc,cc*.55,uStorm);float gc=dot(cc,vec3(.3,.59,.11));cc=mix(cc,vec3(gc)*vec3(.94,.97,1.03),wet*.75);cc*=1.-wet*(.28+.22*dusk0);
  col=mix(col,cc,clamp(dens*1.1,0.,1.));
  if(wet>.01){float sn=fbm(cp*3.4+vec2(-uDrift*6.,7.3));col=mix(col,vec3(.27,.3,.34)*(.25+.75*day),smoothstep(.5,.78,sn)*wet*.5);}
  float fd=length((uv-uFlashP)*vec2(asp,1.));col+=vec3(.75,.8,1.)*uFlash*(.12+1.1*exp(-fd*fd*2.5))*(.25+.75*dens);
  float fog=uFog*(.35+.65*h);vec3 fc=mix(vec3(.08,.1,.14),vec3(.78,.82,.86),day);fc=mix(fc,vec3(.9,.7,.6),dusk*.4);
  col=mix(col,fc,clamp(fog,0.,.92));
  col=mix(col,mix(col,fc,.5),uRain*.22*(1.-uv.y*.6));
  if(uExc>.01){float dn=fbm(cp*.9+vec2(-uDrift*1.3,3.1));vec3 ec=mix(vec3(.45,.2,.09),vec3(.93,.62,.32),h*.6+dn*.4)*(.3+.7*day);col=mix(col,ec,uExc*(.45+.35*dn));}
  col=mix(col,mix(col,vec3(.86,.89,.93)*(.5+.5*day),.45),uSnow*.14);
  float gF=dot(col,vec3(.3,.59,.11));col=mix(col,vec3(gF)*vec3(.93,.97,1.03),wet*.5);col*=1.-wet*.18*dusk0;
  float lumF=dot(uFond,vec3(.3,.59,.11));
  float f=smoothstep(uZone+.14,0.,uv.y);if(lumF>.5)f=pow(smoothstep(uZone+.08,0.,uv.y),1.8);
  if(lumF>.5)col=pow(mix(sqrt(max(col,0.)),sqrt(uFond),f),vec3(2.));else col=mix(col,uFond,f);
  gl_FragColor=vec4(col,1.);
}`;
  // Les ciels et les 15 conditions de Home Assistant : src/wxpresets.js (copiés du handoff).
  // Phase de la lune : 0 nouvelle, .5 pleine. « auto » = date reelle (lunaison moyenne depuis la nouvelle lune du 6/01/2000).
  const PHASES = { pleine: .5, gibbeuse: .38, quartier: .25, croissant: .13 };
  const phaseLune = (v) => PHASES[v] != null ? PHASES[v] : ((((Date.now() - Date.UTC(2000, 0, 6, 18, 14)) / 864e5 / 29.530588853) % 1) + 1) % 1;
  const preset = cielDe;
  const NIV = { plein: { k: .72, oct: 5, cap: 60, pf: 1, simple: false, kp: 2, lec: 450 }, leger: { k: .45, oct: 3, cap: 30, pf: .5, simple: true, kp: 1.25, lec: 1000 }, fixe: { k: .6, oct: 5, cap: 0, pf: .35, simple: false, kp: 1.5, lec: 0 } };
  const CLE = 'loggia-ciel-niveau-v2', UNI = ['uRes', 'uTime', 'uSun', 'uMoon', 'uCover', 'uRain', 'uSnow', 'uFog', 'uStorm', 'uFlash', 'uZone', 'uFond', 'uDrift', 'uWind', 'uExc', 'uFlashP', 'uPhase'];
  const LEVER0 = 8.1, COUCHER0 = 19.35; // 9 octobre, ciel de France : le repli quand Loggia ne connaît pas la position
  function astres(hr, LEVER = LEVER0, COUCHER = COUCHER0) {
    const t = (hr - LEVER) / (COUCHER - LEVER);
    const sun = { x: .08 + .84 * Math.max(0, Math.min(1, t)), e: 0 };
    if (t >= 0 && t <= 1) sun.e = Math.sin(Math.PI * t) * .62;
    else { const nl = 24 - (COUCHER - LEVER); const tn = ((hr - COUCHER + 24) % 24) / nl; sun.e = -Math.sin(Math.PI * Math.max(0, Math.min(1, tn))) * .5 - .02; sun.x = t < 0 ? .06 : .94; }
    const nl = 24 - (COUCHER - LEVER); const tn = ((hr - COUCHER + 24) % 24) / nl;
    const me = tn <= 1 ? Math.sin(Math.PI * tn) * .5 : 0;
    return { sun: [sun.x, sun.e, sun.e], moon: [.12 + .76 * Math.min(1, tn), me, Math.max(0, Math.min(1, me / .1))] };
  }
  class LoggiaCiel extends HTMLElement {
    static get observedAttributes() { return ['meteo', 'heure', 'fond', 'qualite', 'lune', 'lever', 'coucher']; }
    connectedCallback() {
      this.style.display = 'block'; this.style.position = this.style.position || 'absolute'; this.style.inset = '0';
      const cv = document.createElement('canvas'); cv.style.cssText = 'display:block;width:100%;height:100%';
      this.appendChild(cv); this.cv = cv;
      const pc = document.createElement('canvas'); pc.style.cssText = 'position:absolute;inset:0;display:block;width:100%;height:100%;pointer-events:none';
      this.appendChild(pc); this.pc = pc; this.px = pc.getContext('2d'); this.drops = []; this.flakes = []; this.sprites();
      const gl = cv.getContext('webgl', { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power' });
      const hp = gl && gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
      if (!gl || !hp || !hp.precision) { this.secours(); return; }
      this.gl = gl; this.perte = gl.getExtension('WEBGL_lose_context'); this.para = gl.getExtension('KHR_parallel_shader_compile');
      this.buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW); this.progs = {};
      this.cur = { ...(preset(this.getAttribute('meteo'))) };
      this.flash = 0; this.nextFlash = 3; this.t0 = performance.now(); this.last = this.t0; this.visible = true;
      this.calme = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(this);
      this.io = new IntersectionObserver((es) => { this.visible = es[es.length - 1].isIntersecting; this.reveil(); }); this.io.observe(this);
      // La veille pose puis retire sa classe sur <html> ; l'onglet se cache et revient.
      this.mo = new MutationObserver(() => this.reveil()); this.mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      this.onVis = () => this.reveil(); document.addEventListener('visibilitychange', this.onVis);
      this.appliquer();
    }
    disconnectedCallback() {
      this.arret(); clearInterval(this.veille); this.veille = 0; clearTimeout(this.compileT); this.compileT = 0;
      if (this.ro) this.ro.disconnect(); if (this.io) this.io.disconnect(); if (this.mo) this.mo.disconnect();
      if (this.onVis) document.removeEventListener('visibilitychange', this.onVis);
      this.liberer();
    }
    liberer() {
      // Le contexte se REND (lot 14) : sans loseContext, chaque visite de l'Accueil laissait le sien au
      // ramasse-miettes (jusqu'à 5 encore vivants sur la vue suivante). Programmes et tampon partent avant.
      const gl = this.gl; this.gl = null; this.pret = false;
      if (gl) {
        try { for (const k in this.progs) if (this.progs[k]) gl.deleteProgram(this.progs[k].pr); if (this.buf) gl.deleteBuffer(this.buf); } catch { /* contexte déjà perdu */ }
        try { if (this.perte) this.perte.loseContext(); } catch { /* rien */ }
      }
      this.progs = {}; this.buf = null; this.u = null;
      if (this.cv) this.cv.remove(); if (this.pc) this.pc.remove(); this.cv = this.pc = this.px = null;
    }
    soleil() {
      const l = parseFloat(this.getAttribute('lever')), c = parseFloat(this.getAttribute('coucher'));
      return l >= 0 && c <= 24 && c - l > 1 ? [l, c] : [];
    }
    arret() { cancelAnimationFrame(this.raf); this.raf = 0; clearTimeout(this.minuteur); this.minuteur = 0; }
    reveil() {
      // Personne ne regarde : plus rien ne se planifie. Le vent repart alors de presque rien — le saut ne
      // se voit pas, et sa coordonnée ne grandit plus des semaines durant (ticket #25).
      if (!this.visible || auRepos()) { this.arret(); if (this.drift > 1000) this.drift = Math.random() * 8; return; }
      if (this.nom === 'fixe') this.veiller(); else this.loop();
    }
    attributeChangedCallback(n) {
      if (n === 'qualite') { if (this.cfg) this.appliquer(); return; }
      if (this.secoursOn) { this.secours(); return; }
      if (!this.gl || !this.cfg) return;
      if (this.nom === 'fixe') { this.dirty = true; this.veiller(); } else if (!this.raf) this.loop();
    }
    resize() {
      if (!this.gl || !this.cfg) return;
      const k = Math.min(window.devicePixelRatio || 1, 1.5) * this.cfg.k;
      this.cv.width = Math.max(1, Math.round(this.clientWidth * k)); this.cv.height = Math.max(1, Math.round(this.clientHeight * k));
      this.gl.viewport(0, 0, this.cv.width, this.cv.height);
      const kp = Math.min(window.devicePixelRatio || 1, this.cfg.kp || 2); this.kp = kp;
      this.pc.width = Math.max(1, Math.round(this.clientWidth * kp)); this.pc.height = Math.max(1, Math.round(this.clientHeight * kp));
      this.W = this.clientWidth; this.H = this.clientHeight; this.seed();
      if (this.nom === 'fixe') { this.dirty = true; this.veiller(); } else if (!this.raf) this.loop();
    }
    compiler(oct, suite) {
      // Le pilote compile en parallèle quand il le peut (KHR_parallel_shader_compile) : on attend sa fin
      // sans rien lui demander d'autre — toute question sur le programme le ferait attendre, et figerait
      // l'Accueil 1 à 5 s à froid (lot 14). Sans l'extension, rien à gagner : on compile et on suit.
      const gl = this.gl;
      if (oct in this.progs) { suite(); return; }
      const sh = (type, src) => { const x = gl.createShader(type); gl.shaderSource(x, src); gl.compileShader(x); return x; };
      const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, '#define OCT ' + oct + '\n' + FS);
      const pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
      const fin = () => {
        this.compileT = 0;
        if (this.gl !== gl) return; // démonté entre-temps : liberer() a tout rendu
        if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) {
          [vs, fs].forEach((x) => { if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(x)); });
          this.progs[oct] = null;
        } else { const u = {}; UNI.forEach((n) => { u[n] = gl.getUniformLocation(pr, n); }); this.progs[oct] = { pr, u, loc: gl.getAttribLocation(pr, 'a') }; }
        suite();
      };
      const attend = () => { if (this.gl !== gl) { this.compileT = 0; return; } if (gl.getProgramParameter(pr, this.para.COMPLETION_STATUS_KHR)) fin(); else this.compileT = setTimeout(attend, 16); };
      if (this.para) attend(); else fin();
    }
    prog(oct) {
      const gl = this.gl, p = this.progs[oct]; if (!p) return null;
      gl.useProgram(p.pr); gl.bindBuffer(gl.ARRAY_BUFFER, this.buf); gl.enableVertexAttribArray(p.loc); gl.vertexAttribPointer(p.loc, 2, gl.FLOAT, false, 0, 0);
      this.u = p.u; return p;
    }
    appliquer() {
      const q = this.getAttribute('qualite') || 'auto';
      this.auto = !NIV[q];
      let n = NIV[q] ? q : null;
      if (!n) { try { const s = JSON.parse(localStorage.getItem(CLE) || 'null'); if (s && NIV[s.n] && Date.now() - s.t < 864e5) n = s.n === 'fixe' ? 'leger' : s.n; } catch { /* rien */ } }
      if (!n) { const nv = navigator, faible = (nv.deviceMemory && nv.deviceMemory <= 2) || (nv.hardwareConcurrency && nv.hardwareConcurrency <= 2) || (nv.connection && nv.connection.saveData); n = faible ? 'leger' : 'plein'; }
      this.niveau(n);
    }
    niveau(n) {
      if (!this.gl) return;
      this.nom = n; this.cfg = NIV[n]; this.mesures = []; this.mauvais = 0; this.bons = 0; this.depuis = performance.now(); this.mesureT = this.depuis + 3000; this.dataset.niveau = n;
      if (this.auto) { try { localStorage.setItem('loggia-ciel-actuel', n); } catch { /* rien */ } }
      this.arret(); clearInterval(this.veille); this.veille = 0; clearTimeout(this.compileT); this.compileT = 0; this.pret = false;
      this.compiler(this.cfg.oct, () => {
        if (!this.gl || this.nom !== n) return;
        if (!this.prog(this.cfg.oct)) { this.secours(); return; }
        this.pret = true;
        if (n === 'fixe') { this.veille = setInterval(() => this.veiller(), 1000); }
        this.resize();
      });
    }
    veiller() {
      if (!this.gl || !this.pret || !this.visible || !this.isConnected || this.nom !== 'fixe' || auRepos()) return;
      if (this.auto && !document.hidden && performance.now() - this.depuis > 3e5) { this.niveau('leger'); return; }
      const v = getComputedStyle(this).getPropertyValue('--o-bg').trim(), now = performance.now();
      if (v !== this.fondV) { this.fondV = v; this.dirty = true; }
      if (!this.dirty && now - (this.derniere || 0) < 120000) return;
      this.dirty = false; this.derniere = now; this.fondT = 0;
      Object.assign(this.cur, preset(this.getAttribute('meteo'))); this.flash = 0;
      if (this.drift == null) this.drift = .48;
      this.frame(now, 0, 40);
    }
    mesurer(now, brut) {
      // Qualité auto : on ne descend que sur une lenteur DURABLE (2 fenêtres en plein, 3 en léger),
      // jamais sur un à-coup (chargement, onglet repris) ; et on retente le niveau au-dessus.
      if (now < this.mesureT || brut > 250 || this.nom === 'fixe' || document.hidden) return false;
      const m = this.mesures; m.push(brut); if (m.length < 120) return false;
      const med = m.slice().sort((a, b) => a - b)[60]; this.mesures = [];
      if (med <= (this.nom === 'plein' ? 26 : 70)) {
        this.mauvais = 0; this.bons++;
        if (this.nom === 'plein' && this.bons === 2) { try { localStorage.setItem(CLE, JSON.stringify({ n: 'plein', t: Date.now() })); } catch { /* rien */ } }
        if (this.nom === 'leger' && med <= 36 && !this.echecPlein && now - this.depuis > 6e5) { this.niveau('plein'); return true; }
        return false;
      }
      this.bons = 0; if (++this.mauvais < (this.nom === 'plein' ? 2 : 3)) return false;
      if (this.nom === 'plein') this.echecPlein = true;
      const n = this.nom === 'plein' ? 'leger' : 'fixe';
      try { localStorage.setItem(CLE, JSON.stringify({ n, t: Date.now() })); } catch { /* rien */ }
      this.niveau(n); return true;
    }
    secours() {
      this.secoursOn = true; this.arret(); clearInterval(this.veille); this.veille = 0; clearTimeout(this.compileT); this.compileT = 0; this.liberer();
      const A = astres(this.heure(), ...this.soleil()), j = A.sun[2] > .04, p = preset(this.getAttribute('meteo')), gris = p.cover > .7;
      const haut = j ? (gris ? '#7f8a99' : '#3f74b8') : '#0f1c36', bas = j ? (gris ? '#a9b2be' : '#86ade0') : '#25395f';
      this.style.background = 'linear-gradient(180deg,' + haut + ' 0%,' + bas + ' 52%,var(--o-bg) 100%)';
    }
    sprites() {
      // Flocons blancs pour fond sombre ; sur fond clair, coeur blanc et bord ardoise pour rester lisibles.
      const mk = (soft, clair) => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
        if (!clair && soft) { g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(.45, 'rgba(255,255,255,.22)'); g.addColorStop(1, 'rgba(255,255,255,0)'); }
        else if (!clair) { g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.35, 'rgba(255,255,255,.85)'); g.addColorStop(.7, 'rgba(255,255,255,.18)'); g.addColorStop(1, 'rgba(255,255,255,0)'); }
        else if (soft) { g.addColorStop(0, 'rgba(250,252,255,.5)'); g.addColorStop(.5, 'rgba(112,126,148,.22)'); g.addColorStop(1, 'rgba(112,126,148,0)'); }
        else { g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.32, 'rgba(250,252,255,.92)'); g.addColorStop(.52, 'rgba(96,110,132,.55)'); g.addColorStop(1, 'rgba(96,110,132,0)'); }
        x.fillStyle = g; x.fillRect(0, 0, 64, 64); return c; };
      this.spNet = mk(false); this.spFlou = mk(true); this.spNetC = mk(false, true); this.spFlouC = mk(true, true);
    }
    seed() {
      const W = this.W || 1, H = this.H || 1, R = Math.random;
      const nd = Math.round(W * H / 620), nf = Math.round(W * H / 1500);
      this.drops = []; for (let i = 0; i < nd; i++) { const z = Math.pow(R(), 1.7); this.drops.push({ x: R() * W * 1.1 - W * .05, y: R() * H * .62, z, s: 700 + 1300 * z + (R() - .5) * 260, l: (9 + 34 * z) * (.8 + .4 * R()), w: .45 + 1.35 * z, a: .09 + .33 * z, se: R(), att: 0 }); }
      this.flakes = []; for (let i = 0; i < nf; i++) { const z = Math.pow(R(), 1.5); const bok = z > .92; this.flakes.push({ x: R() * W, y: R() * H * .62, z, r: bok ? 6 + R() * 6 : .9 + 3.2 * z, s: 14 + 62 * z, amp: 5 + 26 * z, fr: .12 + .3 * R(), ph: R() * 6.28, a: bok ? .32 : .55 + .45 * z, bok, se: R() }); }
      this.rideaux = null; this.hailP = []; for (let i = 0, nh = Math.round(W * H / 2000); i < nh; i++) { const z = Math.pow(R(), 2.6); this.hailP.push({ x: R() * W * 1.1 - W * .05, y: R() * H * .62, z, s: 300 + 520 * z + R() * 220, v: 760 + 760 * z + R() * 300, l: 3 + 7 * z, w: 1 + 2.2 * z, a: .28 + .55 * Math.pow(R(), .7) * (.5 + .5 * z), ang: (R() - .5) * .34, ph: R() * 6.28, fw: 1.5 + R() * 2.5, wa: .4 + R() * 1.4, tw: 3 + R() * 6, se: R(), att: 0 }); }
      this.gusts = []; for (let i = 0, n = Math.max(2, Math.round(W / 480)); i < n; i++) { const g = {}; this.gust(g); g.age = -R() * 2.6; this.gusts.push(g); }
    }
    gust(g) {
      const W = this.W || 1, H = this.H || 1, R = Math.random;
      Object.assign(g, { x: R() * W * .85 - W * .1, y: H * (.06 + R() * .5), l: 90 + R() * 230, s: 380 + R() * 560, w: .7 + R() * .6, a: .1 + R() * .1, amp: 2 + R() * 6, wl: 30 + R() * 55, ph: R() * 6.28, life: .9 + R() * 1.2, age: -(3 + R() * 7) });
    }
    precip(dt, t, day) {
      const x = this.px, W = this.W, H = this.H, k = this.kp; if (!x) return;
      x.setTransform(k, 0, 0, k, 0, 0); x.clearRect(0, 0, W, H);
      const carte = this.getAttribute('fond') === 'carte'; const fin = carte ? H * 1.3 : H * .97, debut = carte ? H * 1.2 : H * .5;
      const fade = (y) => (y < debut ? 1 : y > fin ? 0 : 1 - (y - debut) / (fin - debut));
      const rain = this.cur.rain * (this.cur.drops ?? 1), snow = this.cur.snow, wd = this.cur.wind || 0; // drops 0 : ciel de pluie sans gouttes (grele)
      // Encre des particules selon ce qu'il y a DERRIERE, bande par bande (ciel lu sur la toile WebGL, puis fond
      // de page) : claire sur fond sombre, ardoise sur fond clair. Theme clair ou sombre, a toute heure, par tout temps.
      const fo = this.fond || [0, 0, 0], lf = fo[0] * .3 + fo[1] * .59 + fo[2] * .11, NL = 10, Lm = this.lum;
      const TT = this.tt || (this.tt = new Float32Array(NL)), INK = this.ink || (this.ink = []);
      for (let i = 0; i < NL; i++) { const l = Lm ? Lm[i] : (lf > .5 && day > .45 ? .75 : .2); let v = Math.min(1, Math.max(0, (l - .42) / .2)); v = v * v * (3 - 2 * v); TT[i] = v; INK[i] = Math.round(228 - 170 * v) + ',' + Math.round(236 - 166 * v) + ',' + Math.round(250 - 160 * v); }
      const ty = (y) => { const q = y / H * NL - .5, i = Math.max(0, Math.min(NL - 1, Math.floor(q))), j = Math.min(NL - 1, i + 1), u = Math.max(0, Math.min(1, q - i)); return TT[i] + (TT[j] - TT[i]) * u; };
      const encre = (al) => { const g = x.createLinearGradient(0, 0, 0, H); for (let i = 0; i < NL; i++) g.addColorStop((i + .5) / NL, 'rgba(' + INK[i] + ',' + Math.max(0, al * (1 - .2 * TT[i])).toFixed(3) + ')'); return g; };
      const RC = INK[3], RA = 1;
      const sl = .14 + .5 * Math.max(0, wd - .35);
      const gu = this.calme || this.nom === 'fixe' ? 0 : Math.min(1, Math.max(0, (wd - .55) / .45)), gs = gu * gu * (3 - 2 * gu);
      const hvR = Math.min(1, this.cur.heavy || 0) * Math.min(1, (this.cur.rain || 0) * 1.5);
      if (hvR > .01 && !(this.cfg && this.cfg.simple)) {
        // Averse : de larges rideaux de pluie obliques qui passent avec le vent, effaces vers le bas comme les gouttes.
        const al0 = hvR * .075 * (.55 + .45 * day) * (1 - .2 * TT[3]);
        const C = this.rideaux || (this.rideaux = [0, 1, 2].map((i) => ({ x: (i + .25 + Math.random() * .4) * W * .42, w: W * (.13 + Math.random() * .12), a: .55 + Math.random() * .45, ph: Math.random() * 6.28 })));
        x.setTransform(k, 0, k * sl, k, 0, 0);
        for (const r of C) {
          r.x += (24 + 64 * wd) * dt;
          if (r.x - r.w > W) { r.w = W * (.13 + Math.random() * .12); r.x = -sl * fin - Math.random() * W * .3; r.a = .55 + Math.random() * .45; }
          const al = al0 * r.a * (.65 + .35 * Math.sin(t * .45 + r.ph)); if (al < .004) continue;
          const g = x.createLinearGradient(r.x - r.w, 0, r.x, 0);
          g.addColorStop(0, 'rgba(' + RC + ',0)'); g.addColorStop(.5, 'rgba(' + RC + ',' + al.toFixed(3) + ')'); g.addColorStop(1, 'rgba(' + RC + ',0)');
          x.fillStyle = g; x.fillRect(r.x - r.w, 0, r.w, fin);
        }
        x.setTransform(k, 0, 0, k, 0, 0);
        if (debut < H) { x.globalCompositeOperation = 'destination-out'; const m = x.createLinearGradient(0, debut, 0, fin); m.addColorStop(0, 'rgba(0,0,0,0)'); m.addColorStop(1, 'rgba(0,0,0,1)'); x.fillStyle = m; x.fillRect(0, debut, W, H - debut); x.globalCompositeOperation = 'source-over'; }
      }
      if (gs > .01 && this.gusts) {
        const lum = .55 + .45 * day; x.lineCap = 'round';
        for (const g of this.gusts) {
          g.age += dt; if (g.age > g.life) this.gust(g);
          if (g.age < 0) continue;
          g.x += g.s * dt;
          const al = g.a * Math.sin(Math.PI * Math.min(1, g.age / g.life)) * fade(g.y) * gs * lum; if (al < .005) continue;
          const gr = x.createLinearGradient(g.x - g.l, g.y, g.x, g.y);
          const gv = ty(g.y), gc = Math.round(228 - 170 * gv) + ',' + Math.round(236 - 166 * gv) + ',' + Math.round(250 - 160 * gv), ga = (al * (1 - .25 * gv)).toFixed(3);
          gr.addColorStop(0, 'rgba(' + gc + ',0)'); gr.addColorStop(.75, 'rgba(' + gc + ',' + ga + ')'); gr.addColorStop(1, 'rgba(' + gc + ',0)');
          x.strokeStyle = gr; x.lineWidth = g.w; x.beginPath();
          for (let i = 0; i <= 12; i++) { const px = g.x - g.l + g.l * i / 12, py = g.y + Math.sin(px / g.wl + g.ph + t * 1.5) * g.amp; if (i) x.lineTo(px, py); else x.moveTo(px, py); }
          x.stroke();
        }
      }
      if (rain > .01) {
        // Pluie : fine, serree, presque droite. Averse (heavy) : gouttes plus longues, plus vives, plus rapides,
        // qui arrivent par vagues. Rendu groupe : une poignee de traces par image (6 opacites x 3 epaisseurs).
        const rr = Math.min(1, rain), hv = this.cur.heavy || 0, n = Math.min(this.drops.length, Math.round(this.drops.length * Math.pow(rr, 1.6) / .8 * (this.cfg ? this.cfg.pf : 1)));
        const vague = 1 - hv * .2 * (.5 + .5 * Math.sin(t * .83) * Math.sin(t * .31 + 1.7));
        const lum = .55 + .45 * day + this.flash * .35, ka = (.45 + .55 * rr) * (1 + .32 * hv) * vague * lum * RA, kl = (.5 + .4 * rr) * (1 + .55 * hv), kv = (.68 + .27 * rr) * (1 + .3 * hv), kw = .8 + .4 * hv, AM = .42 * (1 + .3 * hv);
        const simple = this.cfg && this.cfg.simple, NB = 6, B = this.rainB || (this.rainB = []);
        for (let i = 0; i < NB * 3; i++) B[i] = [];
        // grains 1 (grele) : le meme champ que la pluie, mais chaque goutte devient un grelon court, epais et vif.
        const hw = Math.max(0, Math.min(1, this.cur.hail || 0)), vg = this.getAttribute('grele') || 'a', gr = vg === 'c' ? hw : 0, hz = Math.min(1, hw / .3), ks = 1 - (vg === 'a' ? .55 + .25 * (1 - (TT[1] + TT[2] + TT[3]) / 3) : 1) * (vg === 'a' ? hz : hw), kh = 1 - .4 * hz, GB = this.grB || (this.grB = []); for (let i = 0; i < 9; i++) GB[i] = [];
        // Plocs : le haut des cartes (selecteur data-ploc) recoit les gouttes. Zones relevees toutes les 500 ms.
        const selP = this.getAttribute('data-ploc'), nowP = performance.now();
        if (selP && (!this.zT || nowP - this.zT > 500)) {
          this.zT = nowP; const me = this.getBoundingClientRect(), Z = [];
          try { document.querySelectorAll(selP).forEach((el) => { const r = el.getBoundingClientRect(), top = r.top - me.top; if (top > 8 && top < fin - 4 && r.width > 40) Z.push(r.left - me.left + 14, r.right - me.left - 14, top); }); } catch { /* selecteur invalide */ }
          this.zones = Z;
        }
        const ZP = selP && !simple && !this.calme && this.nom !== 'fixe' && this.zones && this.zones.length ? this.zones : null;
        let fadeR = fade, finD = fin;
        if (ZP) { let zm = 0; for (let zi = 2; zi < ZP.length; zi += 3) zm = Math.max(zm, ZP[zi]); const dR = Math.max(debut, zm - 30), fR = Math.min(H + 20, Math.max(dR + 40, zm + 60)); fadeR = (y) => (y < dR ? 1 : y > fR ? 0 : 1 - (y - dR) / (fR - dR)); finD = Math.min(H + 20, fR); }
        // Densite irreguliere, plus douce que la grele : de 45 % a 100 % selon l'endroit et le moment.
        const Ir = (px) => { const u = px / W; return .8 + .14 * Math.sin(u * 6.1 - t * .33 + .4) + .1 * Math.sin(u * 13.7 + t * .52 + 2.6) + .1 * Math.sin(t * .23 + 1.1) * Math.sin(t * .097 + 2.9); };
        const bin = (al, w, xa, ya, xb, yb) => { if (al < .012) return; const k = Math.min(NB - 1, Math.floor(Math.sqrt(al / AM) * NB)); w *= kw; B[(w < .8 ? 0 : w < 1.3 ? 1 : 2) * NB + k].push(xa, ya, xb, yb); };
        for (let i = 0; i < n; i++) {
          const d = this.drops[i], L = d.l * kl * kh;
          if (d.att > 0) { d.att -= dt; continue; }
          const yP = d.y; d.y += d.s * kv * dt; d.x += d.s * kv * dt * sl;
          if (ZP && d.z > .28) for (let zi = 0; zi < ZP.length; zi += 3) { const zt = ZP[zi + 2]; if (yP < zt && d.y >= zt) { const xi = d.x - (d.y - zt) * sl; if (xi > ZP[zi] && xi < ZP[zi + 1]) { const aI = d.a * fadeR(zt) * Math.min(1, Math.max(0, (Ir(xi) - (d.se ?? .5)) / .2 + .5)) * ka; if (aI > .03 && Math.random() < .35) this.ploc(xi, zt, d.z, aI); d.y = finD + L + 2; break; } } }
          if (d.y - L > finD) { d.y = -Math.random() * H * .12; d.x = Math.random() * W * 1.1 - W * .12 - sl * H * .5; d.att = Math.random() < .25 ? Math.random() * .5 : 0; }
          const f0 = fadeR(d.y); if (f0 <= 0) continue; const f = f0 * Math.min(1, Math.max(0, (Ir(d.x) - (d.se ?? .5)) / .2 + .5)); if (f < .01) continue;
          if (gr > .02) { const Lg = 3 + 8 * d.z, wg = 1.3 + 1.7 * d.z, ag = Math.min(.9, d.a * f * ka * 1.7) * gr; if (ag > .02) GB[(wg < 1.8 ? 0 : wg < 2.4 ? 1 : 2) * 3 + (ag < .25 ? 0 : ag < .45 ? 1 : 2)].push(d.x - Lg * sl, d.y - Lg, d.x, d.y); }
          if (ks < .02) continue;
          const al = d.a * f * ka * ks, x0 = d.x - L * sl, y0 = d.y - L;
          if (simple) { bin(al * .8, d.w, x0, y0, d.x, d.y); continue; }
          const xm = d.x - L * sl * .45, ym = d.y - L * .45;
          bin(al * .3, d.w, x0, y0, xm, ym); bin(al, d.w, xm, ym, d.x, d.y);
        }
        x.lineCap = 'butt';
        for (let wb = 0; wb < 3; wb++) for (let k = 0; k < NB; k++) {
          const s = B[wb * NB + k]; if (!s.length) continue;
          x.strokeStyle = encre(AM * Math.pow((k + .5) / NB, 2)); x.lineWidth = [.6, 1.05, 1.6][wb];
          x.beginPath(); for (let j = 0; j < s.length; j += 4) { x.moveTo(s[j], s[j + 1]); x.lineTo(s[j + 2], s[j + 3]); } x.stroke();
        }
        if (this.plocs && this.plocs.length) {
          const P = this.plocs, DP = [[], [], []], CR = [[], [], []]; let j = 0;
          for (let i = 0; i < P.length; i++) {
            const s = P[i]; s.age += dt; if (s.age > s.life) continue; P[j++] = s;
            const u = s.age / s.life, al = s.a * (1 - u), b = al < .2 ? 0 : al < .38 ? 1 : 2;
            if (u < .45) { const ww = s.w * (.45 + u * 1.5); CR[b].push(s.x - ww, s.y - .6, s.x + ww, s.y - .6); }
            for (let q = 0; q < s.parts.length; q += 3) { const tt = s.age, py = s.y + s.parts[q + 1] * tt + 900 * tt * tt; if (py <= s.y) DP[b].push(s.x + s.parts[q] * tt, py, s.parts[q + 2]); }
          }
          P.length = j;
          for (let b = 0; b < 3; b++) {
            const A = [.2, .34, .52][b];
            if (CR[b].length) { x.lineCap = 'round'; x.strokeStyle = encre(A); x.lineWidth = 1; x.beginPath(); const s = CR[b]; for (let q = 0; q < s.length; q += 4) { x.moveTo(s[q], s[q + 1]); x.lineTo(s[q + 2], s[q + 3]); } x.stroke(); }
            if (DP[b].length) { x.fillStyle = encre(Math.min(.9, A * 1.15)); x.beginPath(); const s = DP[b]; for (let q = 0; q < s.length; q += 3) { x.moveTo(s[q] + s[q + 2], s[q + 1]); x.arc(s[q], s[q + 1], s[q + 2], 0, 6.2832); } x.fill(); }
          }
        }
        if (gr > .02) { x.lineCap = 'round'; for (let wb = 0; wb < 3; wb++) for (let ab = 0; ab < 3; ab++) { const s = GB[wb * 3 + ab]; if (!s.length) continue; x.strokeStyle = encre([.26, .45, .66][ab]); x.lineWidth = [1.4, 2.1, 2.7][wb]; x.beginPath(); for (let j = 0; j < s.length; j += 4) { x.moveTo(s[j], s[j + 1]); x.lineTo(s[j + 2], s[j + 3]); } x.stroke(); } }
      }
      const hail = this.cur.hail || 0, vgH = this.getAttribute('grele') || 'a';
      if (hail > .01 && this.hailP && vgH !== 'c') {
        // Grele : grains courts, epais et vifs, qui tombent plus vite que la pluie.
        const n = Math.round(this.hailP.length * Math.min(1, hail) * (this.cfg ? this.cfg.pf : 1));
        const lum = .6 + .4 * day + this.flash * .6;
        // Intensite irreguliere : la grele tombe par paquets qui derivent avec le vent, et par vagues.
        const Iw = (px) => { const u = px / W; return .5 + .28 * Math.sin(u * 7.9 - t * .37 + 1.3) + .2 * Math.sin(u * 17.3 + t * .61 + 4.1) + .22 * Math.sin(t * .29 + 2.2) * Math.sin(t * .113 + .7); };
        if (vgH === 'b') {
          // Billes : un grelon rond et net, suivi d'un flou de mouvement aussi large que lui ; plus lent que la pluie.
          const T = this.hT || (this.hT = []); for (let i = 0; i < 6; i++) T[i] = [];
          for (let i = 0; i < n; i++) {
            const p = this.hailP[i], vy = p.s * .56, vx = vy * sl * .5;
            p.y += vy * dt; p.x += vx * dt;
            if (p.y - 12 > fin) { p.y = -Math.random() * H * .1; p.x = Math.random() * W * 1.1 - W * .1 - sl * H * .25; }
            const f = fade(p.y); if (f <= 0) continue;
            const al = p.a * f * lum, r = .8 + 1.5 * p.z;
            T[(r < 1.5 ? 0 : 3) + (al < .3 ? 0 : al < .5 ? 1 : 2)].push(p.x, p.y, r, vx * .018, vy * .018);
          }
          x.lineCap = 'round';
          for (let q = 0; q < 6; q++) {
            const s = T[q]; if (!s.length) continue; const A = [.3, .48, .7][q % 3];
            x.strokeStyle = encre(A * .5); x.lineWidth = q < 3 ? 2.2 : 3.6; x.beginPath();
            for (let j = 0; j < s.length; j += 5) { x.moveTo(s[j] - s[j + 3], s[j + 1] - s[j + 4]); x.lineTo(s[j], s[j + 1]); } x.stroke();
            x.fillStyle = encre(A); x.beginPath();
            for (let j = 0; j < s.length; j += 5) { x.moveTo(s[j] + s[j + 2], s[j + 1]); x.arc(s[j], s[j + 1], s[j + 2], 0, 6.2832); } x.fill();
          }
        } else {
        // Grelons : rapides et nets, une tete vive et une courte trainee (une image de deplacement : ni pointilles
        // ni files), presque droits, sans balancement : la vitesse et l'eclat les distinguent de la neige.
        const TB = this.hTB || (this.hTB = []), HD = this.hHD || (this.hHD = []); for (let i = 0; i < 9; i++) TB[i] = []; for (let i = 0; i < 3; i++) HD[i] = [];
        for (let i = 0; i < n; i++) {
          const p = this.hailP[i];
          if (p.att > 0) { p.att -= dt; continue; }
          const vy = p.v || p.s, vx = vy * (sl * .5 + (p.ang || 0) * .25);
          p.y += vy * dt; p.x += vx * dt;
          if (p.y - 30 > fin) { p.y = -Math.random() * H * .35; p.x = Math.random() * W * 1.1 - W * .1 - sl * H * .25; p.att = Math.random() < .35 ? Math.random() * 1.4 : 0; }
          const f = fade(p.y); if (f <= 0) continue;
          const vis = Math.min(1, Math.max(0, (Iw(p.x) - (p.se ?? .5)) / .18 + .5)); if (vis < .02) continue;
          const al = p.a * f * vis * lum * (.85 + .15 * Math.sin(t * (p.tw || 4) + (p.ph || 0) * 1.7)), L = vy * .015, w = p.w;
          const ab = al < .3 ? 0 : al < .5 ? 1 : 2, wb = w < 1.5 ? 0 : w < 2.1 ? 1 : 2;
          const x0 = p.x - vx * .015, y0 = p.y - L, xm = p.x - vx * .006, ym = p.y - L * .4;
          TB[wb * 3 + ab].push(x0, y0, xm, ym, xm, ym, p.x, p.y); HD[ab].push(p.x, p.y, w * .62);
        }
        x.lineCap = 'round';
        for (let wb = 0; wb < 3; wb++) for (let ab = 0; ab < 3; ab++) {
          const s = TB[wb * 3 + ab]; if (!s.length) continue; const A = [.26, .42, .6][ab];
          x.lineWidth = [1.1, 1.7, 2.3][wb];
          x.strokeStyle = encre(A * .35); x.beginPath(); for (let j = 0; j < s.length; j += 8) { x.moveTo(s[j], s[j + 1]); x.lineTo(s[j + 2], s[j + 3]); } x.stroke();
          x.strokeStyle = encre(A); x.beginPath(); for (let j = 0; j < s.length; j += 8) { x.moveTo(s[j + 4], s[j + 5]); x.lineTo(s[j + 6], s[j + 7]); } x.stroke();
        }
        for (let ab = 0; ab < 3; ab++) { const d = HD[ab]; if (!d.length) continue; x.fillStyle = encre(Math.min(.9, [.26, .42, .6][ab] * 1.35)); x.beginPath(); for (let j = 0; j < d.length; j += 3) { x.moveTo(d[j] + d[j + 2], d[j + 1]); x.arc(d[j], d[j + 1], d[j + 2], 0, 6.2832); } x.fill(); }
        }
      }
      if (snow > .01) {
        const n = Math.min(this.flakes.length, Math.round(this.flakes.length * Math.min(1, snow) / .82 * (this.cfg ? this.cfg.pf : 1)));
        const lum = .6 + .4 * day;
        const rafS = 1 + .7 * Math.max(0, Math.sin(t * .41 + .6) * Math.sin(t * .157 + 2.1)), Is = (px) => { const u = px / W; return .78 + .16 * Math.sin(u * 5.3 - t * .12 + .9) + .1 * Math.sin(u * 11.9 + t * .19 + 3.3) + .1 * Math.sin(t * .11 + .4); };
        for (let i = 0; i < n; i++) {
          const p = this.flakes[i];
          p.y += p.s * dt; p.x += (8 + 260 * Math.max(0, wd - .2)) * rafS * dt;
          if (p.y - p.r > fin) { p.y = -p.r - Math.random() * H * .2; p.x = Math.random() * W; }
          if (p.x > W + 20) p.x -= W + 40;
          const f0 = fade(p.y); if (f0 <= 0) continue; const f = f0 * Math.min(1, Math.max(0, (Is(p.x) - (p.se ?? .5)) / .25 + .5)); if (f < .01) continue;
          const px = p.x + Math.sin(t * p.fr * 6.283 + p.ph) * p.amp;
          const a0 = p.a * f * lum * Math.min(1, snow), v = ty(p.y), sz = p.r * (p.bok ? 3 : 2.6);
          if (v < .97) { x.globalAlpha = a0 * (1 - v); x.drawImage(p.bok ? this.spFlou : this.spNet, px - sz / 2, p.y - sz / 2, sz, sz); }
          if (v > .03) { x.globalAlpha = a0 * v * .9; x.drawImage(p.bok ? this.spFlouC : this.spNetC, px - sz / 2, p.y - sz / 2, sz, sz); }
        }
        x.globalAlpha = 1;
      }
      if (this.bolt && this.flash > .02) {
        const b = this.bolt, al = Math.min(1, this.flash);
        const grad = (a) => { const g = x.createLinearGradient(0, b.y0, 0, b.y1); g.addColorStop(0, 'rgba(' + a); g.addColorStop(.7, 'rgba(' + a.replace(/,([\d.]+)\)$/, (m, v) => ',' + (v * .6).toFixed(3) + ')')); g.addColorStop(1, 'rgba(' + a.replace(/,([\d.]+)\)$/, ',0)')); return g; };
        const path = (pts) => { x.moveTo(pts[0], pts[1]); for (let j = 2; j < pts.length; j += 2) x.lineTo(pts[j], pts[j + 1]); };
        x.lineJoin = 'round'; x.lineCap = 'round';
        x.strokeStyle = grad('190,205,255,' + (al * .22).toFixed(3) + ')'); x.lineWidth = 8; x.beginPath(); path(b.main); x.stroke();
        x.strokeStyle = grad('225,232,255,' + (al * .6).toFixed(3) + ')'); x.lineWidth = 1.1; x.beginPath(); for (const r of b.br) path(r); x.stroke();
        x.strokeStyle = grad('255,255,255,' + (al * .95).toFixed(3) + ')'); x.lineWidth = 1.9; x.beginPath(); path(b.main); x.stroke();
      }
    }
    ploc(x0, y0, z, aI) {
      // Une goutte sur l'arete d'une carte : 2 a 4 gouttelettes qui rebondissent de quelques pixels.
      const P = this.plocs || (this.plocs = []); if (P.length > 160) return;
      const parts = []; for (let i = 0, n = 2 + Math.floor(Math.random() * 3); i < n; i++) { const a = -Math.PI / 2 + (Math.random() - .5) * 2.3, v = (50 + Math.random() * 60) * (.7 + .5 * z); parts.push(Math.cos(a) * v, Math.sin(a) * v, .55 + Math.random() * .5 * (.6 + z)); }
      P.push({ x: x0, y: y0, age: 0, life: .2 + Math.random() * .1, parts, w: 2.5 + 4.5 * z, a: Math.min(.75, (aI || .3) * 1.8) });
    }
    eclair() {
      // Un trait de foudre : deplacement du point milieu, puis 1 a 3 ramifications.
      const W = this.W || 1, H = this.H || 1, P = this.flashP || [.5, .75], R = Math.random;
      const x0 = P[0] * W, y0 = (1 - P[1]) * H, y1 = H * (.5 + R() * .15);
      const seg = (xa, ya, xb, yb, d, out) => { if (d <= 0) { out.push(xb, yb); return; } const xm = (xa + xb) / 2 + (R() - .5) * Math.abs(yb - ya) * .5, ym = (ya + yb) / 2 + (R() - .5) * 5; seg(xa, ya, xm, ym, d - 1, out); seg(xm, ym, xb, yb, d - 1, out); };
      const main = [x0, y0]; seg(x0, y0, x0 + (R() - .5) * W * .1, y1, 6, main);
      const br = []; const np = main.length / 2;
      for (let k = 0, nb = 1 + Math.floor(R() * 3); k < nb; k++) { const j = 2 * (6 + Math.floor(R() * Math.max(1, np - 20))); const xa = main[j], ya = main[j + 1], len = (y1 - ya) * (.3 + R() * .35); const r = [xa, ya]; seg(xa, ya, xa + (R() < .5 ? -1 : 1) * len * (.4 + R() * .5), ya + len, 4, r); br.push(r); }
      return { main, br, y0, y1 };
    }
    heure() {
      const a = this.getAttribute('heure');
      if (a && a !== 'auto' && !isNaN(parseFloat(a))) return ((parseFloat(a) % 24) + 24) % 24;
      const d = new Date(); return d.getHours() + d.getMinutes() / 60;
    }
    loop() {
      if (this.raf || this.minuteur || !this.gl || !this.pret || !this.cfg || this.nom === 'fixe' || !this.visible || !this.isConnected || auRepos()) return;
      this.mesureT = Math.max(this.mesureT || 0, performance.now() + 2000);
      this.planifie();
    }
    planifie() {
      // Lot 14 : la boucle dort (setTimeout) jusqu'à peu avant l'échéance, puis l'écran donne l'instant
      // (rAF). Demander une image à CHAQUE rafraîchissement réveillait le navigateur 130 fois par seconde
      // sur un écran à 130 Hz, pour en dessiner le plafond.
      if (this.raf || this.minuteur || !this.gl || !this.pret || !this.visible || !this.isConnected || auRepos()) return;
      const cap = this.cfg.cap, reste = cap ? 1000 / cap - AVANCE_MS - (performance.now() - this.last) : 0;
      if (reste > 0) this.minuteur = setTimeout(() => { this.minuteur = 0; this.planifie(); }, reste);
      else this.raf = requestAnimationFrame(this.tick || (this.tick = (now) => this.image(now)));
    }
    image(now) {
        this.raf = 0;
        if (!this.isConnected || !this.visible || !this.gl || !this.pret || auRepos()) return;
        const cap = this.cfg.cap;
        if (cap && now - this.last < 1000 / cap - 4) { this.planifie(); return; }
        const brut = now - this.last;
        const dt = Math.min(.1, brut / 1000); this.last = now;
        const tgt = preset(this.getAttribute('meteo'));
        const f = 1 - Math.exp(-dt * 2.2);
        let moving = false;
        for (const k in tgt) { const dv = tgt[k] - this.cur[k]; if (Math.abs(dv) > .002) moving = true; this.cur[k] += dv * f; }
        const t = this.calme ? 40 : (now - this.t0) / 1000;
        if (this.drift == null) this.drift = this.calme ? .48 : 0;
        if (!this.calme) this.drift += dt * (.012 + .118 * Math.max(0, (this.cur.wind || 0) - .25));
        if (this.cur.storm > .5 && !this.calme) {
          this.nextFlash -= dt;
          if (this.nextFlash <= 0) { this.flashT = 0; this.nextFlash = 2.2 + Math.random() * 5; this.flashP = [.1 + Math.random() * .8, .5 + Math.random() * .42]; this.bolt = Math.random() < .6 ? this.eclair() : null; }
          if (this.flashT != null) { this.flashT += dt; const x = this.flashT; this.flash = x < .08 ? x / .08 : x < .16 ? 1 - (x - .08) / .08 * .8 : x < .24 ? .2 + (x - .16) / .08 * .6 : Math.max(0, .8 - (x - .24) * 3.5); if (x > .5) { this.flashT = null; this.flash = 0; } }
        } else this.flash = 0;
        this.frame(now, this.calme ? 0 : dt, t);
        if (this.auto && !this.calme && this.mesurer(now, brut)) return;
        if (!this.calme || moving) this.planifie();
    }
    lireCiel() {
      // Luminance du ciel rendu, en 10 bandes de haut en bas (3 colonnes x 3 lignes par bande).
      const gl = this.gl, cv = this.cv; if (!gl || !cv || !cv.width || !cv.height) return;
      const w = cv.width, h = cv.height, NL = 10, L = new Float32Array(NL);
      const buf = this.lbuf && this.lbuf.length === h * 4 ? this.lbuf : (this.lbuf = new Uint8Array(h * 4));
      try {
        for (const fx of [.2, .5, .8]) {
          gl.readPixels(Math.floor(w * fx), 0, 1, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
          for (let i = 0; i < NL; i++) for (let j = 0; j < 3; j++) { const row = Math.max(0, Math.min(h - 1, Math.round((1 - (i + (j + .5) / 3) / NL) * (h - 1)))), o = row * 4; L[i] += (buf[o] * .3 + buf[o + 1] * .59 + buf[o + 2] * .11) / 255 / 9; }
        }
        this.lum = L;
      } catch { /* lecture impossible : estimation par le theme */ }
    }
    couleur(v) {
      // #rgb, #rrggbb, rgb(), un nom… : le canevas 2D normalise ce qu'il comprend en #rrggbb ou rgba().
      const x = this.px; if (!v || !x) return null;
      x.fillStyle = '#000'; x.fillStyle = v; const n = String(x.fillStyle);
      let m = n.match(/^#([0-9a-f]{6})$/i); if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
      m = n.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i); return m ? [m[1], m[2], m[3]].map((c) => Math.min(1, parseFloat(c) / 255)) : null;
    }
    frame(now, dt, t) {
      const A = astres(this.heure(), ...this.soleil()); const gl = this.gl, u = this.u;
      // Le handoff garde 250 px de ciel pur et fond le reste : il est dessiné pour un bandeau de 440 px. Au
      // téléphone (36vh, ~304 px), il ne restait que ~97 px de fondu, contre ~213 avec l'ancien ciel. Sous
      // 440 px, la zone garde donc les proportions du bandeau d'origine (ciel pur sur ~57 %, fondu dessous).
      const b = Math.max(0, 1 - 250 / Math.max(440, this.clientHeight));
      if (!this.fondT || now - this.fondT > 400) { this.fondT = now; const v = getComputedStyle(this).getPropertyValue('--o-bg').trim(); this.fond = this.couleur(v) || [0.04, 0.06, 0.1]; }
      gl.uniform3f(u.uFond, this.fond[0], this.fond[1], this.fond[2]);
      A.sun[1] = b + .09 + Math.max(-.2, A.sun[2] / .62) * (.88 - b); A.moon[1] = b + .12 + (A.moon[1] / .5) * (.84 - b);
      // Garder la lune et le soleil entiers sous l'en-tete qui recouvre le haut du ciel (data-marge-haut, en px).
      const hC = Math.max(1, this.clientHeight), mh = parseFloat(this.getAttribute('data-marge-haut')) || 0;
      A.moon[1] = Math.min(A.moon[1], 1 - .042 - (mh + 10) / hC); A.sun[1] = Math.min(A.sun[1], 1 - .034 - (mh + 14) / hC);
      gl.uniform1f(u.uZone, b);
      gl.uniform2f(u.uRes, this.cv.width, this.cv.height); gl.uniform1f(u.uTime, t % 3600);
      gl.uniform3f(u.uSun, A.sun[0], A.sun[1], A.sun[2]); gl.uniform3f(u.uMoon, A.moon[0], A.moon[1], A.moon[2]);
      gl.uniform1f(u.uCover, this.cur.cover); gl.uniform1f(u.uRain, this.cur.rain); gl.uniform1f(u.uSnow, this.cur.snow);
      gl.uniform1f(u.uFog, this.cur.fog); gl.uniform1f(u.uStorm, this.cur.storm); gl.uniform1f(u.uFlash, this.flash); gl.uniform1f(u.uDrift, this.drift); gl.uniform1f(u.uWind, this.cur.wind || 0); gl.uniform1f(u.uExc, this.cur.exc || 0); const FP = this.flashP || [.5, .75]; gl.uniform2f(u.uFlashP, FP[0], FP[1]); gl.uniform1f(u.uPhase, phaseLune(this.getAttribute('lune')));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (!this.lumT || now - this.lumT > ((this.cfg && this.cfg.lec) || 450)) { this.lumT = now; this.lireCiel(); }
      this.precip(dt, t, Math.max(0, Math.min(1, (A.sun[2] + .18) / .3)));
    }
  }
  customElements.define('loggia-ciel', LoggiaCiel);
})();
