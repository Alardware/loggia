import{j as De,t as rt}from"./boot-BBH1VEdZ.js";import{r as se}from"./vendor-nf7bT_Uh.js";import{W as nt,S as He,b as st,G as it,D as ot,R as lt,F as ut,N as ct,c as xe,d as we,e as L,V as be,a as ie,A as We,O as pt,M as dt,P as ht,f as vt,g as ze,h as Fe,L as Ge,H as mt,B as Ye,i as x,j as Xe}from"./three-BC6Dzy3a.js";import"./index-BSQn7cmC.js";function ft(oe){let k=!0;class le{constructor(a,r){this.camera=a,this.dom=r,this.target=new L,this.enablePan=!1,this.enableDamping=!0,this.dampingFactor=.06,this.minDistance=1,this.maxDistance=100,this.rotateSpeed=.5,this.zoomSpeed=.7,this.autoRotate=!1,this.autoRotateSpeed=.3;const d=a.position.clone().sub(this.target);this.r=d.length()||5,this.theta=Math.atan2(d.x,d.z),this.phi=Math.acos(Math.max(-1,Math.min(1,d.y/this.r))),this.dTheta=0,this.dPhi=0,this.dR=0,this._drag=!1,this._x=0,this._y=0,r.style.touchAction="none",r.addEventListener("pointerdown",s=>{this._drag=!0,this._x=s.clientX,this._y=s.clientY;try{r.setPointerCapture(s.pointerId)}catch{}}),r.addEventListener("pointerup",()=>{this._drag=!1}),r.addEventListener("pointerleave",()=>{this._drag=!1}),r.addEventListener("pointermove",s=>{if(!this._drag)return;const l=r.clientWidth||1;this.dTheta-=2*Math.PI*(s.clientX-this._x)/l*this.rotateSpeed,this.dPhi-=2*Math.PI*(s.clientY-this._y)/l*this.rotateSpeed,this._x=s.clientX,this._y=s.clientY}),r.addEventListener("wheel",s=>{s.preventDefault(),this.dR+=Math.sign(s.deltaY)*.28*this.zoomSpeed},{passive:!1})}update(){this.autoRotate&&(this.theta-=this.autoRotateSpeed*.012),this.theta+=this.dTheta,this.phi+=this.dPhi,this.r+=this.dR;const a=this.enableDamping?Math.max(0,1-this.dampingFactor*3):0;this.dTheta*=a,this.dPhi*=a,this.dR*=a,this.phi=Math.max(.08,Math.min(Math.PI-.08,this.phi)),this.r=Math.max(this.minDistance,Math.min(this.maxDistance,this.r));const r=Math.sin(this.phi);this.camera.position.set(this.target.x+this.r*r*Math.sin(this.theta),this.target.y+this.r*Math.cos(this.phi),this.target.z+this.r*r*Math.cos(this.theta)),this.camera.lookAt(this.target)}}const K={repos:{label:"REPOS",flow:.35,turb:.35,energy:.3,spin:.1},flux:{label:"FLUX",flow:1,turb:.65,energy:.6,spin:.22},analyse:{label:"ANALYSE",flow:1.7,turb:.95,energy:.82,spin:.55},turbu:{label:"TURBULENCE",flow:2,turb:1.5,energy:.9,spin:.4},surch:{label:"SURCHARGE",flow:2.8,turb:1.8,energy:1,spin:.85},ecoute:{label:"ÉCOUTE",flow:.85,turb:.42,energy:.55,spin:.14},pense:{label:"RÉFLEXION",flow:2.1,turb:.8,energy:.86,spin:.72},parle:{label:"RÉPONSE",flow:.75,turb:.34,energy:.42,spin:.16}},U=[{deep:[.02,.16,.62],mid:[.22,.66,1],hot:[.92,.99,1]},{deep:[.2,.06,.55],mid:[.62,.42,1],hot:[.99,.96,1]},{deep:[.52,.14,.01],mid:[1,.58,.12],hot:[1,.94,.76]}],e={mode:"repos",level:1,charge:0,energy:.3,flow:.35,turb:.35,pulse:0,micLevel:0,pal:0,count:0,curves:0,phase:0,iph:0,dir:1,force:null},f=[],g=oe,c=new nt({antialias:!1,alpha:!1,powerPreference:"high-performance"}),V=Math.min(1.5,window.devicePixelRatio||1);c.setPixelRatio(V),c.setClearColor(0,1),c.autoClear=!1,g.appendChild(c.domElement);const Ee=new He,H=new st(36,1,.1,60);H.position.set(0,.25,4.3);const y=new le(H,c.domElement);y.enablePan=!1,y.enableDamping=!0,y.dampingFactor=.06,y.minDistance=2.2,y.maxDistance=9,y.rotateSpeed=.5,y.zoomSpeed=.7,y.autoRotate=!0,y.autoRotateSpeed=.3;const C=new it;Ee.add(C);const W=256,ue=64,Q=new Float32Array(W*ue*4),G=new ot(Q,W,ue,lt,ut);G.magFilter=G.minFilter=ct,G.generateMipmaps=!1;const o={uTime:{value:0},uFlow:{value:.35},uTurb:{value:.35},uEnergy:{value:.3},uPulse:{value:0},uMic:{value:0},uPhase:{value:0},uIph:{value:0},uDirS:{value:1},uCurves:{value:G},uCurveTex:{value:new be(W,ue)},uPointer:{value:new L(0,0,9)},uPointerOn:{value:0},uWaves:{value:[new we(-9,0,0,0),new we(-9,0,0,0),new we(-9,0,0,0),new we(-9,0,0,0)]},uDeep:{value:new xe},uMid:{value:new xe},uHot:{value:new xe},uVoice:{value:0},uPitch:{value:0},uPx:{value:1}},ce=`
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
  }`,Te=new ie({uniforms:o,transparent:!0,depthWrite:!1,depthTest:!1,blending:We,vertexShader:ce+`
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
      }`,fragmentShader:ce+`
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
      }`}),Be=new ie({uniforms:o,transparent:!0,depthWrite:!1,depthTest:!1,blending:We,vertexShader:ce+`
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
      }`,fragmentShader:ce+`
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
      }`});let Oe=1,Y=Oe;const n=()=>{Y=Y+1831565813|0;let t=Math.imul(Y^Y>>>15,1|Y);return t=t+Math.imul(t^t>>>7,61|t)^t,((t^t>>>14)>>>0)/4294967296},D=()=>{const t=n()*2-1,a=n()*6.2831,r=Math.sqrt(Math.max(0,1-t*t));return new L(Math.cos(a)*r,t,Math.sin(a)*r)},ye=(t,a,r)=>Math.sin(t*3.1)*Math.cos(a*2.7)+Math.sin(a*3.9)*Math.cos(r*3.1)+Math.sin(r*4.3)*Math.cos(t*2.3);let z=null,F=null;function Je(t,a){const r=a.clone().applyAxisAngle(D(),(n()-.5)*1).normalize();let d=D();d.addScaledVector(r,-d.dot(r)).normalize();const s=3+n()*3.6,l=n()*10,w=.96+n()*.1,R=n()<.45,T=R?.24+Math.pow(n(),1.6)*.3:.84+n()*.14,X=.3+n()*.4,B=Math.log(.5)/Math.log(X),O=R?2.4+n()*2.2:1.3+n()*1,i=new L,v=new L;for(let I=0;I<W;I++){const M=I/(W-1),ve=s*M;i.set(r.x+ye(M*2.1+l,l,0)*.13,r.y+ye(0,M*2.4+l,l)*.13,r.z+ye(l,0,M*1.7+l)*.13).normalize(),v.copy(d).applyAxisAngle(i,ve);const me=Math.pow(Math.sin(3.14159265*Math.pow(M,B)),O),m=w-(w-T)*me+.045*Math.sin(M*4.1+l)+.022*Math.sin(M*9.3-l*2);v.multiplyScalar(Math.max(.05,m));const h=(t*W+I)*4;Q[h]=v.x,Q[h+1]=v.y,Q[h+2]=v.z,Q[h+3]=1}return s}function Se(t){Y=Oe+t*7919|0,z&&(C.remove(z),z.geometry.dispose(),z=null),F&&(C.remove(F),F.geometry.dispose(),F=null);const a=Math.min(ue,13+t*3),r=[D(),D(),D(),D(),D()],d=[];for(let u=0;u<a;u++)d.push(Je(u,r[Math.floor(n()*r.length)]));G.needsUpdate=!0;const s=24e4+t*55e3,l=d.reduce((u,j)=>u+j,0),w=new Float32Array(s*3),R=new Float32Array(s),T=new Float32Array(s),X=new Float32Array(s),B=new Float32Array(s),O=new Float32Array(s),i=new Float32Array(s),v=new Float32Array(s),I=new Float32Array(s),M=new Float32Array(s),ve=new Float32Array(s);let me=0,m=0;for(let u=0;u<a&&m<s;u++){const j=Math.floor(s*d[u]/l),ae=.04+Math.pow(n(),1.6)*.09,re=.45+n()*.8;for(let Ve=0;Ve<j&&m<s;Ve++,m++){R[m]=u,T[m]=n(),X[m]=n(),B[m]=n()*6.2831,O[m]=ae*Math.pow(n(),2)*(1+(n()<.07?2.6:0)),i[m]=re*(.4+n()*.9),I[m]=n()<.07?.45+n()*.75:0;const Ce=n();let N,J,ne;Ce<.01?(N=2.6+n()*1.8,J=1.9+n()*.9,ne=1.9+n()*1.4):Ce<.055?(N=1.6+n()*1,J=1.25+n()*.6,ne=.9+n()*.6):Ce<.3?(N=.95+n()*.6,J=.72+n()*.38,ne=.65+n()*.5):(N=.58+n()*.47,J=.34+n()*.28,ne=.45+n()*.5),v[m]=N,M[m]=J,ve[m]=ne,me+=J*N*N}}const h=m,at=1.98*h/Math.max(me,1e-6);for(let u=0;u<h;u++)M[u]*=at;const b=new Ye;b.setAttribute("position",new x(w.subarray(0,h*3),3)),b.setAttribute("aCurve",new x(R.subarray(0,h),1)),b.setAttribute("aU",new x(T.subarray(0,h),1)),b.setAttribute("aSeed",new x(X.subarray(0,h),1)),b.setAttribute("aAng",new x(B.subarray(0,h),1)),b.setAttribute("aRad",new x(O.subarray(0,h),1)),b.setAttribute("aFray",new x(i.subarray(0,h),1)),b.setAttribute("aSize",new x(v.subarray(0,h),1)),b.setAttribute("aSpray",new x(I.subarray(0,h),1)),b.setAttribute("aLum",new x(M.subarray(0,h),1)),b.setAttribute("aSpd",new x(ve.subarray(0,h),1)),b.boundingSphere=new ze(new L,4),z=new Xe(b,Te),C.add(z);const fe=7200+t*1700,ge=new Float32Array(fe*3),je=new Float32Array(fe),Ne=new Float32Array(fe);for(let u=0;u<fe;u++){const j=D(),ae=n(),re=ae<.34?.05+Math.pow(n(),1.3)*.44:ae<.62?.25+Math.pow(n(),.6)*.8:ae<.94?.92+n()*.2:1.06+Math.pow(n(),2.6)*.34;ge[u*3]=j.x*re,ge[u*3+1]=j.y*re,ge[u*3+2]=j.z*re,je[u]=n()<.035?1.5+n()*1.4:.45+n()*.7,Ne[u]=n()}const te=new Ye;te.setAttribute("position",new x(ge,3)),te.setAttribute("aSize",new x(je,1)),te.setAttribute("aSeed",new x(Ne,1)),te.boundingSphere=new ze(new L,4),F=new Xe(te,Be),C.add(F),e.count=h,e.curves=a}const Me={type:mt,minFilter:Ge,magFilter:Ge,depthBuffer:!1};let P=null,E=[];const Z=new He,pe=new pt(-1,1,1,-1,0,1),de=new dt(new ht(2,2));Z.add(de);const Ae="varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",Pe=new ie({uniforms:{tex:{value:null}},vertexShader:Ae,fragmentShader:"uniform sampler2D tex; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tex, vUv); }"}),_=new ie({uniforms:{tex:{value:null},dir:{value:new be(1,0)},texel:{value:new be}},vertexShader:Ae,fragmentShader:`uniform sampler2D tex; uniform vec2 dir, texel; varying vec2 vUv;
    void main(){ vec2 o = dir*texel; vec4 c = texture2D(tex,vUv)*0.2270270270;
      c += (texture2D(tex,vUv+o*1.3846153846)+texture2D(tex,vUv-o*1.3846153846))*0.3162162162;
      c += (texture2D(tex,vUv+o*3.2307692308)+texture2D(tex,vUv-o*3.2307692308))*0.0702702703;
      gl_FragColor = c; }`}),A=new ie({uniforms:{tScene:{value:null},tB0:{value:null},tB1:{value:null},tB2:{value:null},tB3:{value:null},uExp:{value:1},uBloom:{value:1},uBg:{value:new xe}},vertexShader:Ae,fragmentShader:`uniform sampler2D tScene,tB0,tB1,tB2,tB3; uniform float uExp,uBloom; uniform vec3 uBg; varying vec2 vUv;
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
      float d = distance(vUv, vec2(0.5));
      gl_FragColor = vec4(uBg*(1.0 - 0.55*d) + c, 1.0);
    }`});function $(){const t=g.clientWidth,a=g.clientHeight;if(!t||!a)return;c.setSize(t,a,!1),H.aspect=t/a,H.updateProjectionMatrix(),o.uPx.value=a*V*.0105;const r=Math.round(t*V),d=Math.round(a*V);P&&P.dispose(),E.forEach(s=>{s.a.dispose(),s.b.dispose()}),P=new Fe(r,d,Me),E=[2,4,8,16].map(s=>{const l=Math.max(2,Math.round(r/s)),w=Math.max(2,Math.round(d/s));return{a:new Fe(l,w,Me),b:new Fe(l,w,Me),w:l,h:w}})}window.addEventListener("resize",$);const he=window.ResizeObserver?new ResizeObserver(()=>$()):null;he&&he.observe(g);function Ke(){c.setRenderTarget(P),c.clear(),c.render(Ee,H);let t=P.texture;for(const a of E)de.material=Pe,Pe.uniforms.tex.value=t,c.setRenderTarget(a.a),c.render(Z,pe),de.material=_,_.uniforms.texel.value.set(1/a.w,1/a.h),_.uniforms.dir.value.set(1,0),_.uniforms.tex.value=a.a.texture,c.setRenderTarget(a.b),c.render(Z,pe),_.uniforms.dir.value.set(0,1),_.uniforms.tex.value=a.b.texture,c.setRenderTarget(a.a),c.render(Z,pe),t=a.a.texture;de.material=A,A.uniforms.tScene.value=P.texture,A.uniforms.tB0.value=E[0].a.texture,A.uniforms.tB1.value=E[1].a.texture,A.uniforms.tB2.value=E[2].a.texture,A.uniforms.tB3.value=E[3].a.texture,c.setRenderTarget(null),c.render(Z,pe)}const ke=new vt,Ue=new be,Qe=new ze(new L,1),Re=new L,S=c.domElement;let ee=null,_e=0;S.addEventListener("pointerdown",t=>{ee={x:t.clientX,y:t.clientY},S.style.cursor="grabbing"}),S.addEventListener("pointerup",t=>{ee&&Math.hypot(t.clientX-ee.x,t.clientY-ee.y)<6&&Ze(),ee=null,S.style.cursor="grab"}),S.addEventListener("pointermove",t=>{const a=S.getBoundingClientRect();Ue.set((t.clientX-a.left)/a.width*2-1,-((t.clientY-a.top)/a.height)*2+1),ke.setFromCamera(Ue,H),ke.ray.intersectSphere(Qe,Re)?(C.worldToLocal(Re),o.uPointer.value.copy(Re),o.uPointerOn.value=1,_e=performance.now()):o.uPointerOn.value=0}),S.addEventListener("pointerleave",()=>{o.uPointerOn.value=0});function Ze(){f.push({r:0,life:1}),e.pulse=Math.min(1.7,e.pulse+1),e.charge+=.2,e.charge>=1&&e.level<6?(e.charge=0,e.level++,Se(e.level),f.push({r:0,life:1.4}),e.pulse=1.7):e.level>=6&&(e.charge=1)}function $e(t){e.mode=t,e.pulse=Math.min(1.7,e.pulse+.55),f.push({r:0,life:.85})}const et={last:performance.now(),dt(){const t=performance.now(),a=(t-this.last)/1e3;return this.last=t,a}};let q=0;const Le=(t,a,r)=>t+(a-t)*r,p={deep:[0,0,0],mid:[0,0,0],hot:[0,0,0]};p.deep=U[0].deep.slice(),p.mid=U[0].mid.slice(),p.hot=U[0].hot.slice();function qe(){if(!k)return;requestAnimationFrame(qe);const t=Math.round(g.clientWidth*V),a=Math.round(g.clientHeight*V);if((S.width!==t||S.height!==a)&&$(),!P)return;const r=Math.min(.05,et.dt());q+=r;const d=K[e.mode];e.micLevel*=.9;let s;e.force!==null?s=e.force:e.mode==="parle"?s=Math.max(0,.34+.3*Math.sin(q*7.3)+.22*Math.sin(q*11.9+1.7)+.14*Math.sin(q*19.1)):s=0;const l=e.force!==null||e.mode==="parle",w=Math.max(e.micLevel,Math.min(1,s));o.uVoice.value=s,o.uPitch.value=0;const R=Math.min(1,r*4),T=Math.min(1,r*13);e.energy+=(d.energy+w*.55+e.pulse*.25-e.energy)*(l?T:R),e.flow+=(d.flow+w*1.9+e.pulse*.8-e.flow)*(l?T:R),e.turb+=(d.turb+w*.75+e.pulse*.45-e.turb)*(l?T:R),l&&(y.autoRotateSpeed=.2+s*.9),e.pulse*=Math.pow(.15,r),e.charge=Math.max(0,e.charge-r*.02),(e.mode==="analyse"||e.mode==="surch"||e.mode==="pense")&&(e.charge=Math.min(1,e.charge+r*.035)),e.charge>=1&&e.level<6&&(e.charge=0,e.level++,Se(e.level),f.push({r:0,life:1.3})),performance.now()-_e>450&&(o.uPointerOn.value*=Math.pow(.05,r)),e.phase+=r*e.flow;const X=e.mode==="ecoute"||e.micLevel>.03?-1:1;e.dir+=(X-e.dir)*Math.min(1,r*2.2),e.iph+=r*(.22+.15*e.flow)*e.dir,o.uPhase.value=e.phase,o.uIph.value=e.iph,o.uDirS.value=e.dir>=0?1:-1;const B=U[e.pal],O=Math.min(1,r*3);for(let i=0;i<3;i++)p.deep[i]=Le(p.deep[i],B.deep[i],O),p.mid[i]=Le(p.mid[i],B.mid[i],O),p.hot[i]=Le(p.hot[i],B.hot[i],O);o.uDeep.value.setRGB(p.deep[0],p.deep[1],p.deep[2]),o.uMid.value.setRGB(p.mid[0],p.mid[1],p.mid[2]),o.uHot.value.setRGB(p.hot[0],p.hot[1],p.hot[2]),A.uniforms.uBg.value.setRGB(p.deep[0]*.012,p.deep[1]*.014,p.deep[2]*.022),A.uniforms.uExp.value=1.34-e.energy*.16,A.uniforms.uBloom.value=.9-e.energy*.34,o.uTime.value=q,o.uEnergy.value=e.energy,o.uFlow.value=e.flow,o.uTurb.value=e.turb,o.uPulse.value=e.pulse,o.uMic.value=w;for(let i=f.length-1;i>=0;i--){const v=f[i];v.r+=1.9*r,v.life-=r*.8,(v.life<=0||v.r>2.6)&&f.splice(i,1)}for(let i=0;i<4;i++){const v=f[i];o.uWaves.value[i].set(v?v.r:-9,v?Math.max(0,v.life):0,0,0)}y.autoRotateSpeed=.2+d.spin*1.2,C.rotation.x=Math.sin(q*.1)*.1,C.rotation.z=Math.cos(q*.07)*.07,y.update(),Ke()}$(),Se(1),qe();const Ie={idle:"repos",listening:"ecoute",thinking:"pense",speaking:"parle"},tt=Object.fromEntries(Object.entries(Ie).map(([t,a])=>[a,t]));return{setState(t){const a=Ie[t]||(K[t]?t:null);a&&a!==e.mode&&$e(a)},setLevel(t){e.force=Math.max(0,Math.min(1,+t||0))},releaseLevel(){e.force=null},pulse(){f.push({r:0,life:1}),e.pulse=Math.min(1.7,e.pulse+1)},get state(){return tt[e.mode]||e.mode},dispose(){if(k){k=!1,window.removeEventListener("resize",$),he&&he.disconnect();try{z&&z.geometry.dispose(),F&&F.geometry.dispose(),Te.dispose(),Be.dispose(),Pe.dispose(),_.dispose(),A.dispose(),G.dispose(),P&&P.dispose(),E.forEach(t=>{t.a.dispose(),t.b.dispose()}),c.dispose(),S.parentNode&&S.parentNode.removeChild(S)}catch{}}}}}function yt({etat:oe="idle",niveau:k=null,onToucher:le=null,taille:K=240}){const U={width:K,height:K,margin:"0 auto",borderRadius:"50%",overflow:"hidden",position:"relative"},e=se.useRef(null),f=se.useRef(null);return se.useEffect(()=>{if(!e.current)return;let g=null;try{g=ft(e.current)}catch(c){console.warn("Loggia : orbe indisponible",c);return}return f.current=g,()=>{f.current=null,g.dispose()}},[]),se.useEffect(()=>{f.current&&f.current.setState(oe)},[oe]),se.useEffect(()=>{const g=f.current;g&&(k==null?g.releaseLevel():g.setLevel(k))},[k]),le?De.jsx("button",{type:"button",onClick:le,"aria-label":rt("Parler à l’assistant"),style:{...U,border:"none",padding:0,background:"transparent",cursor:"pointer"},children:De.jsx("span",{ref:e,style:{display:"block",width:"100%",height:"100%"}})}):De.jsx("div",{ref:e,style:U})}export{ft as creerOrbe,yt as default};
