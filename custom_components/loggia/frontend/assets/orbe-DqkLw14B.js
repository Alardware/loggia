import{j as Ce,t as st}from"./boot-ChxAXy9V.js";import{r as K}from"./vendor-nf7bT_Uh.js";import{W as nt,S as We,b as it,G as ot,D as lt,R as ut,F as ct,N as pt,c as ze,d as be,e as E,V as we,a as ie,A as Ge,O as dt,M as ht,P as vt,f as mt,g as De,h as Te,L as Ye,H as ft,B as Xe,i as x,j as Je}from"./three-BC6Dzy3a.js";import"./index-C9PScfa8.js";function gt(oe){let B=!0;class le{constructor(a,r){this.camera=a,this.dom=r,this.target=new E,this.enablePan=!1,this.enableDamping=!0,this.dampingFactor=.06,this.minDistance=1,this.maxDistance=100,this.rotateSpeed=.5,this.zoomSpeed=.7,this.autoRotate=!1,this.autoRotateSpeed=.3;const u=a.position.clone().sub(this.target);this.r=u.length()||5,this.theta=Math.atan2(u.x,u.z),this.phi=Math.acos(Math.max(-1,Math.min(1,u.y/this.r))),this.dTheta=0,this.dPhi=0,this.dR=0,this._drag=!1,this._x=0,this._y=0,r.style.touchAction="none",r.addEventListener("pointerdown",n=>{this._drag=!0,this._x=n.clientX,this._y=n.clientY;try{r.setPointerCapture(n.pointerId)}catch{}}),r.addEventListener("pointerup",()=>{this._drag=!1}),r.addEventListener("pointerleave",()=>{this._drag=!1}),r.addEventListener("pointermove",n=>{if(!this._drag)return;const c=r.clientWidth||1;this.dTheta-=2*Math.PI*(n.clientX-this._x)/c*this.rotateSpeed,this.dPhi-=2*Math.PI*(n.clientY-this._y)/c*this.rotateSpeed,this._x=n.clientX,this._y=n.clientY}),r.addEventListener("wheel",n=>{n.preventDefault(),this.dR+=Math.sign(n.deltaY)*.28*this.zoomSpeed},{passive:!1})}update(a=1/60){this.autoRotate&&(this.theta-=this.autoRotateSpeed*.72*a),this.theta+=this.dTheta,this.phi+=this.dPhi,this.r+=this.dR;const r=this.enableDamping?Math.max(0,1-this.dampingFactor*3):0;this.dTheta*=r,this.dPhi*=r,this.dR*=r,this.phi=Math.max(.08,Math.min(Math.PI-.08,this.phi)),this.r=Math.max(this.minDistance,Math.min(this.maxDistance,this.r));const u=Math.sin(this.phi);this.camera.position.set(this.target.x+this.r*u*Math.sin(this.theta),this.target.y+this.r*Math.cos(this.phi),this.target.z+this.r*u*Math.cos(this.theta)),this.camera.lookAt(this.target)}}const Q={repos:{label:"REPOS",flow:.32,turb:.3,energy:.28,spin:.1},flux:{label:"FLUX",flow:1,turb:.65,energy:.6,spin:.22},analyse:{label:"ANALYSE",flow:1.7,turb:.95,energy:.82,spin:.55},turbu:{label:"TURBULENCE",flow:2,turb:1.5,energy:.9,spin:.4},surch:{label:"SURCHARGE",flow:2.8,turb:1.8,energy:1,spin:.85},ecoute:{label:"ÉCOUTE",flow:.85,turb:.42,energy:.55,spin:.14},pense:{label:"RÉFLEXION",flow:2.1,turb:.8,energy:.86,spin:.72},parle:{label:"RÉPONSE",flow:.75,turb:.34,energy:.42,spin:.16}},U=[{deep:[.02,.16,.62],mid:[.22,.66,1],hot:[.92,.99,1]},{deep:[.2,.06,.55],mid:[.62,.42,1],hot:[.99,.96,1]},{deep:[.52,.14,.01],mid:[1,.58,.12],hot:[1,.94,.76]}],ue={parle:{deep:[.02,.28,.4],mid:[.31,.85,.92],hot:[.86,.99,1]},chaud:{deep:[.55,.22,.02],mid:[.98,.62,.38],hot:[1,.94,.82]},froid:{deep:[0,.3,.5],mid:[.42,.86,1],hot:[.94,1,1]},bien:{deep:[.02,.36,.05],mid:[.2,.9,.3],hot:[.7,1,.62]},alerte:{deep:[.55,.02,.02],mid:[1,.16,.12],hot:[1,.5,.42]}},e={mode:"repos",level:1,charge:0,energy:.3,flow:.35,turb:.35,pulse:0,micLevel:0,pal:0,count:0,curves:0,phase:0,iph:0,dir:1,force:null,teinte:null},f=[],g=oe,i=new nt({antialias:!1,alpha:!0,powerPreference:"high-performance"}),R=Math.min(1.5,window.devicePixelRatio||1);i.setPixelRatio(R),i.setClearColor(0,0),i.autoClear=!1,i.domElement.style.background="transparent",i.domElement.style.display="block",g.appendChild(i.domElement);const Fe=new We,H=new it(36,1,.1,60);H.position.set(0,.25,4.2);const y=new le(H,i.domElement);y.enablePan=!1,y.enableDamping=!0,y.dampingFactor=.06,y.minDistance=2.2,y.maxDistance=9,y.rotateSpeed=.5,y.zoomSpeed=.7,y.autoRotate=!0,y.autoRotateSpeed=.3;const C=new ot;Fe.add(C);const W=256,ce=64,Z=new Float32Array(W*ce*4),G=new lt(Z,W,ce,ut,ct);G.magFilter=G.minFilter=pt,G.generateMipmaps=!1;const l={uTime:{value:0},uFlow:{value:.35},uTurb:{value:.35},uEnergy:{value:.3},uPulse:{value:0},uMic:{value:0},uPhase:{value:0},uIph:{value:0},uDirS:{value:1},uCurves:{value:G},uCurveTex:{value:new we(W,ce)},uPointer:{value:new E(0,0,9)},uPointerOn:{value:0},uWaves:{value:[new be(-9,0,0,0),new be(-9,0,0,0),new be(-9,0,0,0),new be(-9,0,0,0)]},uDeep:{value:new ze},uMid:{value:new ze},uHot:{value:new ze},uVoice:{value:0},uPitch:{value:0},uPx:{value:1}},pe=`
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
  }`,Oe=new ie({uniforms:l,transparent:!0,depthWrite:!1,depthTest:!1,blending:Ge,vertexShader:pe+`
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
      }`,fragmentShader:pe+`
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
      }`}),qe=new ie({uniforms:l,transparent:!0,depthWrite:!1,depthTest:!1,blending:Ge,vertexShader:pe+`
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
      }`,fragmentShader:pe+`
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
      }`});let ke=1,Y=ke;const s=()=>{Y=Y+1831565813|0;let t=Math.imul(Y^Y>>>15,1|Y);return t=t+Math.imul(t^t>>>7,61|t)^t,((t^t>>>14)>>>0)/4294967296},z=()=>{const t=s()*2-1,a=s()*6.2831,r=Math.sqrt(Math.max(0,1-t*t));return new E(Math.cos(a)*r,t,Math.sin(a)*r)},ye=(t,a,r)=>Math.sin(t*3.1)*Math.cos(a*2.7)+Math.sin(a*3.9)*Math.cos(r*3.1)+Math.sin(r*4.3)*Math.cos(t*2.3);let D=null,T=null;function Ke(t,a){const r=a.clone().applyAxisAngle(z(),(s()-.5)*1).normalize();let u=z();u.addScaledVector(r,-u.dot(r)).normalize();const n=3+s()*3.6,c=s()*10,b=.96+s()*.1,L=s()<.45,O=L?.24+Math.pow(s(),1.6)*.3:.84+s()*.14,X=.3+s()*.4,q=Math.log(.5)/Math.log(X),k=L?2.4+s()*2.2:1.3+s()*1,o=new E,v=new E;for(let j=0;j<W;j++){const M=j/(W-1),me=n*M;o.set(r.x+ye(M*2.1+c,c,0)*.13,r.y+ye(0,M*2.4+c,c)*.13,r.z+ye(c,0,M*1.7+c)*.13).normalize(),v.copy(u).applyAxisAngle(o,me);const fe=Math.pow(Math.sin(3.14159265*Math.pow(M,q)),k),m=b-(b-O)*fe+.045*Math.sin(M*4.1+c)+.022*Math.sin(M*9.3-c*2);v.multiplyScalar(Math.max(.05,m));const d=(t*W+j)*4;Z[d]=v.x,Z[d+1]=v.y,Z[d+2]=v.z,Z[d+3]=1}return n}function Se(t){Y=ke+t*7919|0,D&&(C.remove(D),D.geometry.dispose(),D=null),T&&(C.remove(T),T.geometry.dispose(),T=null);const a=Math.min(ce,13+t*3),r=[z(),z(),z(),z(),z()],u=[];for(let p=0;p<a;p++)u.push(Ke(p,r[Math.floor(s()*r.length)]));G.needsUpdate=!0;const n=24e4+t*55e3,c=u.reduce((p,N)=>p+N,0),b=new Float32Array(n*3),L=new Float32Array(n),O=new Float32Array(n),X=new Float32Array(n),q=new Float32Array(n),k=new Float32Array(n),o=new Float32Array(n),v=new Float32Array(n),j=new Float32Array(n),M=new Float32Array(n),me=new Float32Array(n);let fe=0,m=0;for(let p=0;p<a&&m<n;p++){const N=Math.floor(n*u[p]/c),re=.04+Math.pow(s(),1.6)*.09,se=.45+s()*.8;for(let He=0;He<N&&m<n;He++,m++){L[m]=p,O[m]=s(),X[m]=s(),q[m]=s()*6.2831,k[m]=re*Math.pow(s(),2)*(1+(s()<.07?2.6:0)),o[m]=se*(.4+s()*.9),j[m]=s()<.07?.45+s()*.75:0;const Re=s();let V,J,ne;Re<.01?(V=2.6+s()*1.8,J=1.9+s()*.9,ne=1.9+s()*1.4):Re<.055?(V=1.6+s()*1,J=1.25+s()*.6,ne=.9+s()*.6):Re<.3?(V=.95+s()*.6,J=.72+s()*.38,ne=.65+s()*.5):(V=.58+s()*.47,J=.34+s()*.28,ne=.45+s()*.5),v[m]=V,M[m]=J,me[m]=ne,fe+=J*V*V}}const d=m,rt=1.98*d/Math.max(fe,1e-6);for(let p=0;p<d;p++)M[p]*=rt;const w=new Xe;w.setAttribute("position",new x(b.subarray(0,d*3),3)),w.setAttribute("aCurve",new x(L.subarray(0,d),1)),w.setAttribute("aU",new x(O.subarray(0,d),1)),w.setAttribute("aSeed",new x(X.subarray(0,d),1)),w.setAttribute("aAng",new x(q.subarray(0,d),1)),w.setAttribute("aRad",new x(k.subarray(0,d),1)),w.setAttribute("aFray",new x(o.subarray(0,d),1)),w.setAttribute("aSize",new x(v.subarray(0,d),1)),w.setAttribute("aSpray",new x(j.subarray(0,d),1)),w.setAttribute("aLum",new x(M.subarray(0,d),1)),w.setAttribute("aSpd",new x(me.subarray(0,d),1)),w.boundingSphere=new De(new E,4),D=new Je(w,Oe),C.add(D);const ge=7200+t*1700,xe=new Float32Array(ge*3),Ne=new Float32Array(ge),Ve=new Float32Array(ge);for(let p=0;p<ge;p++){const N=z(),re=s(),se=re<.34?.05+Math.pow(s(),1.3)*.44:re<.62?.25+Math.pow(s(),.6)*.8:re<.94?.92+s()*.2:1.06+Math.pow(s(),2.6)*.34;xe[p*3]=N.x*se,xe[p*3+1]=N.y*se,xe[p*3+2]=N.z*se,Ne[p]=s()<.035?1.5+s()*1.4:.45+s()*.7,Ve[p]=s()}const ae=new Xe;ae.setAttribute("position",new x(xe,3)),ae.setAttribute("aSize",new x(Ne,1)),ae.setAttribute("aSeed",new x(Ve,1)),ae.boundingSphere=new De(new E,4),T=new Je(ae,qe),C.add(T),e.count=d,e.curves=a}const Me={type:ft,minFilter:Ye,magFilter:Ye,depthBuffer:!1};let P=null,F=[];const $=new We,de=new dt(-1,1,1,-1,0,1),he=new ht(new vt(2,2));$.add(he);const Ae="varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",Pe=new ie({uniforms:{tex:{value:null}},vertexShader:Ae,fragmentShader:"uniform sampler2D tex; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tex, vUv); }"}),_=new ie({uniforms:{tex:{value:null},dir:{value:new we(1,0)},texel:{value:new we}},vertexShader:Ae,fragmentShader:`uniform sampler2D tex; uniform vec2 dir, texel; varying vec2 vUv;
    void main(){ vec2 o = dir*texel; vec4 c = texture2D(tex,vUv)*0.2270270270;
      c += (texture2D(tex,vUv+o*1.3846153846)+texture2D(tex,vUv-o*1.3846153846))*0.3162162162;
      c += (texture2D(tex,vUv+o*3.2307692308)+texture2D(tex,vUv-o*3.2307692308))*0.0702702703;
      gl_FragColor = c; }`}),A=new ie({uniforms:{tScene:{value:null},tB0:{value:null},tB1:{value:null},tB2:{value:null},tB3:{value:null},uExp:{value:1},uBloom:{value:1},uAspect:{value:1}},vertexShader:Ae,fragmentShader:`uniform sampler2D tScene,tB0,tB1,tB2,tB3; uniform float uExp,uBloom,uAspect; varying vec2 vUv;
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
      /* Et l'orbe s'estompe vers ses franges, EN CERCLE cette fois.
         La distance se compte en demi-cotes du PETIT cote du cadre : elle
         vaut 1 sur le cercle inscrit, qui touche le bord la ou il est le plus
         proche. La lumiere y vaut zero — donc sur tout le pourtour — et
         decroit des 0,6 : le coeur de l'orbe reste entier, ses franges
         s'eteignent doucement au lieu de se couper net. */
      vec2 e = (vUv - 0.5) * 2.0 * vec2(max(uAspect, 1.0), max(1.0 / uAspect, 1.0));
      c *= 1.0 - smoothstep(0.6, 1.0, length(e));
      /* Ce qui sort d'ici n'est pas une image mais de la LUMIERE : sa couleur
         deja multipliee par son intensite, et cette intensite pour opacite.
         La ou l'orbe brille, elle couvre ; ailleurs, rien. */
      float a = clamp(max(max(c.r, c.g), c.b), 0.0, 1.0);
      gl_FragColor = vec4(c, a);
    }`});function ee(){const t=g.clientWidth,a=g.clientHeight;if(!t||!a)return;i.setSize(t,a),H.aspect=t/a,H.updateProjectionMatrix(),A.uniforms.uAspect.value=t/a,l.uPx.value=a*R*.0105;const r=Math.round(t*R),u=Math.round(a*R);P&&P.dispose(),F.forEach(n=>{n.a.dispose(),n.b.dispose()}),P=new Te(r,u,Me),F=[2,4,8,16].map(n=>{const c=Math.max(2,Math.round(r/n)),b=Math.max(2,Math.round(u/n));return{a:new Te(c,b,Me),b:new Te(c,b,Me),w:c,h:b}})}window.addEventListener("resize",ee);const ve=window.ResizeObserver?new ResizeObserver(()=>ee()):null;ve&&ve.observe(g);function Qe(){i.setRenderTarget(P),i.clear(),i.render(Fe,H);let t=P.texture;for(const a of F)he.material=Pe,Pe.uniforms.tex.value=t,i.setRenderTarget(a.a),i.render($,de),he.material=_,_.uniforms.texel.value.set(1/a.w,1/a.h),_.uniforms.dir.value.set(1,0),_.uniforms.tex.value=a.a.texture,i.setRenderTarget(a.b),i.render($,de),_.uniforms.dir.value.set(0,1),_.uniforms.tex.value=a.b.texture,i.setRenderTarget(a.a),i.render($,de),t=a.a.texture;he.material=A,A.uniforms.tScene.value=P.texture,A.uniforms.tB0.value=F[0].a.texture,A.uniforms.tB1.value=F[1].a.texture,A.uniforms.tB2.value=F[2].a.texture,A.uniforms.tB3.value=F[3].a.texture,i.setRenderTarget(null),i.render($,de)}const Be=new mt,Ue=new we,Ze=new De(new E,1),Le=new E,S=i.domElement;let te=null,_e=0;S.addEventListener("pointerdown",t=>{te={x:t.clientX,y:t.clientY},S.style.cursor="grabbing"}),S.addEventListener("pointerup",t=>{te&&Math.hypot(t.clientX-te.x,t.clientY-te.y)<6&&$e(),te=null,S.style.cursor="grab"}),S.addEventListener("pointermove",t=>{const a=S.getBoundingClientRect();Ue.set((t.clientX-a.left)/a.width*2-1,-((t.clientY-a.top)/a.height)*2+1),Be.setFromCamera(Ue,H),Be.ray.intersectSphere(Ze,Le)?(C.worldToLocal(Le),l.uPointer.value.copy(Le),l.uPointerOn.value=1,_e=performance.now()):l.uPointerOn.value=0}),S.addEventListener("pointerleave",()=>{l.uPointerOn.value=0});function $e(){f.push({r:0,life:1}),e.pulse=Math.min(1.7,e.pulse+1),e.charge+=.2,e.charge>=1&&e.level<6?(e.charge=0,e.level++,Se(e.level),f.push({r:0,life:1.4}),e.pulse=1.7):e.level>=6&&(e.charge=1)}function et(t){e.mode=t,e.pulse=Math.min(1.7,e.pulse+.55),f.push({r:0,life:.85})}const tt={last:performance.now(),dt(){const t=performance.now(),a=(t-this.last)/1e3;return this.last=t,a}};let I=0;const Ee=(t,a,r)=>t+(a-t)*r,h={deep:[0,0,0],mid:[0,0,0],hot:[0,0,0]};h.deep=U[0].deep.slice(),h.mid=U[0].mid.slice(),h.hot=U[0].hot.slice();function Ie(){if(!B)return;requestAnimationFrame(Ie);const t=Math.round(g.clientWidth*R),a=Math.round(g.clientHeight*R);if((S.width!==t||S.height!==a)&&ee(),!P)return;const r=Math.min(.05,tt.dt());I+=r;const u=Q[e.mode];e.micLevel*=.9;let n;e.force!==null?n=e.force:e.mode==="parle"?n=Math.max(0,.34+.3*Math.sin(I*7.3)+.22*Math.sin(I*11.9+1.7)+.14*Math.sin(I*19.1)):n=0;const c=e.force!==null||e.mode==="parle",b=Math.max(e.micLevel,Math.min(1,n));l.uVoice.value=n,l.uPitch.value=0;const L=Math.min(1,r*4),O=Math.min(1,r*13);e.energy+=(u.energy+b*.55+e.pulse*.25-e.energy)*(c?O:L),e.flow+=(u.flow+b*1.9+e.pulse*.8-e.flow)*(c?O:L),e.turb+=(u.turb+b*.75+e.pulse*.45-e.turb)*(c?O:L),c&&(y.autoRotateSpeed=.2+n*.9),e.pulse*=Math.pow(.15,r),e.charge=Math.max(0,e.charge-r*.02),(e.mode==="analyse"||e.mode==="surch"||e.mode==="pense")&&(e.charge=Math.min(1,e.charge+r*.035)),e.charge>=1&&e.level<6&&(e.charge=0,e.level++,Se(e.level),f.push({r:0,life:1.3})),performance.now()-_e>450&&(l.uPointerOn.value*=Math.pow(.05,r)),e.phase+=r*e.flow;const X=e.mode==="ecoute"||e.micLevel>.03?-1:1;e.dir+=(X-e.dir)*Math.min(1,r*2.2),e.iph+=r*(.22+.15*e.flow)*e.dir,l.uPhase.value=e.phase,l.uIph.value=e.iph,l.uDirS.value=e.dir>=0?1:-1;const q=e.teinte&&ue[e.teinte]||U[e.pal],k=Math.min(1,r*3);for(let o=0;o<3;o++)h.deep[o]=Ee(h.deep[o],q.deep[o],k),h.mid[o]=Ee(h.mid[o],q.mid[o],k),h.hot[o]=Ee(h.hot[o],q.hot[o],k);l.uDeep.value.setRGB(h.deep[0],h.deep[1],h.deep[2]),l.uMid.value.setRGB(h.mid[0],h.mid[1],h.mid[2]),l.uHot.value.setRGB(h.hot[0],h.hot[1],h.hot[2]),A.uniforms.uExp.value=1.34-e.energy*.16,A.uniforms.uBloom.value=.9-e.energy*.34,l.uTime.value=I,l.uEnergy.value=e.energy,l.uFlow.value=e.flow,l.uTurb.value=e.turb,l.uPulse.value=e.pulse,l.uMic.value=b;for(let o=f.length-1;o>=0;o--){const v=f[o];v.r+=1.9*r,v.life-=r*.8,(v.life<=0||v.r>2.6)&&f.splice(o,1)}for(let o=0;o<4;o++){const v=f[o];l.uWaves.value[o].set(v?v.r:-9,v?Math.max(0,v.life):0,0,0)}y.autoRotateSpeed=(e.mode==="repos"?.08:.2)+u.spin*1.2,C.rotation.x=Math.sin(I*.1)*.1,C.rotation.z=Math.cos(I*.07)*.07,y.update(r),Qe()}ee(),Se(1),Ie();const je={idle:"repos",listening:"ecoute",thinking:"pense",speaking:"parle"},at=Object.fromEntries(Object.entries(je).map(([t,a])=>[a,t]));return{setState(t){const a=je[t]||(Q[t]?t:null);a&&a!==e.mode&&et(a)},setLevel(t){e.force=Math.max(0,Math.min(1,+t||0))},releaseLevel(){e.force=null},setTeinte(t){e.teinte=Object.prototype.hasOwnProperty.call(ue,t)?t:null},pulse(){f.push({r:0,life:1}),e.pulse=Math.min(1.7,e.pulse+1)},get state(){return at[e.mode]||e.mode},get teinte(){return e.teinte||"base"},dispose(){if(B){B=!1,window.removeEventListener("resize",ee),ve&&ve.disconnect();try{D&&D.geometry.dispose(),T&&T.geometry.dispose(),Oe.dispose(),qe.dispose(),Pe.dispose(),_.dispose(),A.dispose(),G.dispose(),P&&P.dispose(),F.forEach(t=>{t.a.dispose(),t.b.dispose()}),i.dispose(),S.parentNode&&S.parentNode.removeChild(S)}catch{}}}}}function St({etat:oe="idle",niveau:B=null,onToucher:le=null,taille:Q=240,teinte:U="base",remplir:ue=!1}){const e=ue?{width:"100%",height:"100%",display:"block",position:"relative"}:{width:Q,height:Q,margin:"0 auto",display:"block",position:"relative"},f=K.useRef(null),g=K.useRef(null);return K.useEffect(()=>{if(!f.current)return;let i=null;try{i=gt(f.current)}catch(R){console.warn("Loggia : orbe indisponible",R);return}return g.current=i,()=>{g.current=null,i.dispose()}},[]),K.useEffect(()=>{g.current&&g.current.setState(oe)},[oe]),K.useEffect(()=>{g.current&&g.current.setTeinte(U)},[U]),K.useEffect(()=>{const i=g.current;i&&(B==null?i.releaseLevel():i.setLevel(B))},[B]),le?Ce.jsx("button",{type:"button",onClick:le,"aria-label":st("Parler à l’assistant"),style:{...e,border:"none",padding:0,background:"transparent",cursor:"pointer"},children:Ce.jsx("span",{ref:f,style:{display:"block",width:"100%",height:"100%"}})}):Ce.jsx("div",{ref:f,style:e})}export{gt as creerOrbe,St as default};
