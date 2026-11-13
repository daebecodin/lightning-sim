var T=Object.freeze({VERSION:0,STATE:1,PROGRESS:2,NX:3,NY:4,NZ:5,SEED:6,NODE_COUNT:7,POS_PTR:8,PARENT_PTR:9,STEP_PTR:10,FIELD_PTR:11,SUBTREE_PTR:12,GDIST_PTR:13,FLAGS_PTR:14,MAIN_COUNT:15,MAIN_PTR:16,TOTAL_STEPS:17,STALL_EVENTS:18,FORCED_STEPS:19,LONGEST_STALL:20,SOLVE_SWEEPS:21,CHARGE_COUNT:22,CHARGE_PTR:23,CLOUD_BASE:24,GROUND_COUNT:25,GROUND_POS_PTR:26,GROUND_PARENT_PTR:27,GROUND_STEP_PTR:28,GROUND_GRID:29,LIVE_BYTES:30,COUNT:31}),Fe=3,ee=Object.freeze({IDLE:0,SOLVING:1,GROWING:2,ATTACHED:3,FAILED:-1}),oe=Object.freeze({MAIN:1,FORCED:2,GROUND:4,ROOT:8});async function Ne(a){let e=await WebAssembly.compile(a),t={};for(let s of WebAssembly.Module.imports(e)){if(s.kind!=="function")throw new Error(`unsupported wasm import ${s.module}.${s.name} (${s.kind})`);(t[s.module]||={})[s.name]=s.name==="proc_exit"?o=>{throw new Error(`wasm called proc_exit(${o})`)}:()=>0}let r=await WebAssembly.instantiate(e,t);return typeof r.exports._initialize=="function"&&r.exports._initialize(),new _e(r)}var _e=class{constructor(e){if(this.exports=e.exports,this.memory=e.exports.memory,this._buffer=null,this.memoryGrowths=0,this._headerPtr=this.exports.ls_header()>>>0,this._refresh(),this._hdr[T.VERSION]!==Fe)throw new Error(`wasm API version ${this._hdr[T.VERSION]} does not match bindings ${Fe}`)}_refresh(){let e=this.memory.buffer;e!==this._buffer&&(this._buffer&&this.memoryGrowths++,this._buffer=e,this._u32=new Uint32Array(e),this._hdr=new Uint32Array(e,this._headerPtr,T.COUNT),this._hdrI=new Int32Array(e,this._headerPtr,T.COUNT),this._hdrF=new Float32Array(e,this._headerPtr,T.COUNT))}init(e,t,r,s,o=0){let n=this.exports.ls_init(e,t,r,s>>>0,o);return this._refresh(),n}reset(e){let t=this.exports.ls_reset(e>>>0);return this._refresh(),t}step(e){let t=this.exports.ls_step(e|0);return this._refresh(),t}destroy(){this.exports.ls_destroy(),this._refresh()}get state(){return this._refresh(),this._hdrI[T.STATE]}get progress(){return this._refresh(),this._hdrF[T.PROGRESS]}get nodeCount(){return this._refresh(),this._hdr[T.NODE_COUNT]}get memoryBytes(){return this.memory.buffer.byteLength}header(e){return this._refresh(),this._hdr[e]}views(){this._refresh();let e=this._hdr,t=this._buffer,r=e[T.NODE_COUNT],s=e[T.MAIN_COUNT],o=e[T.GROUND_COUNT],n=e[T.CHARGE_COUNT],i=this._hdrI[T.STATE]===ee.ATTACHED,c=(l,h,u)=>new l(t,h,u);return{nodeCount:r,positions:c(Float32Array,e[T.POS_PTR],r*3),parents:c(Int32Array,e[T.PARENT_PTR],r),steps:c(Uint32Array,e[T.STEP_PTR],r),fields:c(Float32Array,e[T.FIELD_PTR],r),flags:c(Uint8Array,e[T.FLAGS_PTR],r),subtrees:c(Uint32Array,e[T.SUBTREE_PTR],i?r:0),groundDist:c(Float32Array,e[T.GDIST_PTR],i?r:0),mainPath:c(Uint32Array,e[T.MAIN_PTR],s),charges:c(Float32Array,e[T.CHARGE_PTR],n*6),groundCount:o,groundPositions:c(Float32Array,e[T.GROUND_POS_PTR],o*2),groundParents:c(Int32Array,e[T.GROUND_PARENT_PTR],o),groundSteps:c(Uint32Array,e[T.GROUND_STEP_PTR],o)}}stats(){this._refresh();let e=this._hdr;return{nx:e[T.NX],ny:e[T.NY],nz:e[T.NZ],seed:e[T.SEED],nodes:e[T.NODE_COUNT],mainNodes:e[T.MAIN_COUNT],groundNodes:e[T.GROUND_COUNT],totalSteps:e[T.TOTAL_STEPS],stallEvents:e[T.STALL_EVENTS],forcedSteps:e[T.FORCED_STEPS],longestStall:e[T.LONGEST_STALL],solveSweeps:e[T.SOLVE_SWEEPS],cloudBase:this._hdrF[T.CLOUD_BASE],groundGrid:e[T.GROUND_GRID],liveBytes:e[T.LIVE_BYTES],memoryBytes:this.memoryBytes,memoryGrowths:this.memoryGrowths}}snapshot(){let e=this.views(),t={stats:this.stats()};for(let r of["positions","parents","steps","fields","flags","subtrees","groundDist","mainPath","charges","groundPositions","groundParents","groundSteps"])t[r]=e[r].slice();return t}};function ze(a){return Object.values(a).filter(e=>ArrayBuffer.isView(e)).map(e=>e.buffer)}function De(a,e){let t=null,r=0,s=null;function o(c){return t||(t=fetch(c).then(l=>{if(!l.ok)throw new Error(`failed to fetch ${c}: ${l.status}`);return l.arrayBuffer()}).then(Ne),t.catch(()=>{t=null})),t}let n=()=>new Promise(c=>setTimeout(c,0));async function i(c){let{id:l,wasmUrl:h,seed:u,nx:g,ny:E,nz:p,eta:d}=c;r=l;let w=performance.now(),v=await o(h);if(r!==l)return;let x;s&&s.nx===g&&s.ny===E&&s.nz===p&&s.eta===d?x=v.reset(u):(x=v.init(g,E,p,u,d),s={nx:g,ny:E,nz:p,eta:d});let R=32,P=0;for(;x===ee.SOLVING||x===ee.GROWING;){let O=performance.now();x=v.step(R);let N=performance.now()-O;if(N<8?R=Math.min(R*2,4096):N>24&&(R=Math.max(R>>1,1)),P++,a({type:"progress",id:l,phase:x===ee.SOLVING?"field":"leader",progress:v.progress,nodes:v.nodeCount}),await n(),r!==l)return}if(x!==ee.ATTACHED){a({type:"error",id:l,message:`simulation ended in state ${x}`});return}let L=v.snapshot();L.stats.computeMs=performance.now()-w,L.stats.slices=P,L.stats.thread=e,a({type:"result",id:l,snap:L},ze(L))}return{handle(c){c.type==="prepare"?i(c).catch(l=>a({type:"error",id:c.id,message:String(l&&l.message||l)})):c.type==="cancel"&&(r=0)}}}var ht=new URL("assets/sim-worker.js",document.baseURI),ut=new URL("wasm/lightning_sim.wasm",document.baseURI).href,me=class{constructor({useWorker:e=!0}={}){if(this.nextId=1,this.pending=null,this.worker=null,this.inline=null,this.workerAlive=!1,e&&typeof Worker<"u")try{this.worker=new Worker(ht,{type:"module"}),this.worker.onmessage=t=>{this.workerAlive=!0,this._onMessage(t.data)},this.worker.onerror=t=>this._onWorkerError(t)}catch{this.worker=null}this.worker||this._useInline()}get thread(){return this.inline?"main":"worker"}_useInline(){this.worker&&(this.worker.terminate(),this.worker=null),this.inline=De(e=>queueMicrotask(()=>this._onMessage(e)),"main")}_onWorkerError(e){if(e&&e.preventDefault&&e.preventDefault(),!this.workerAlive){this._useInline(),this.pending&&this.inline.handle(this.pending.job);return}let t=this.pending;this.pending=null,t&&t.reject(new Error(e&&e.message||"simulation worker failed"))}prepare({seed:e,nx:t,ny:r,nz:s,eta:o=0},n){if(this.pending){let l=new Error("superseded");l.superseded=!0,this.pending.reject(l)}let i=this.nextId++,c={type:"prepare",id:i,wasmUrl:ut,seed:e,nx:t,ny:r,nz:s,eta:o};return new Promise((l,h)=>{this.pending={id:i,resolve:l,reject:h,onProgress:n,job:c},this.inline?this.inline.handle(c):this.worker.postMessage(c)})}_onMessage(e){let t=this.pending;!t||e.id!==t.id||(e.type==="progress"?t.onProgress&&t.onProgress(e):e.type==="result"?(this.pending=null,t.resolve(e.snap)):e.type==="error"&&(this.pending=null,t.reject(new Error(e.message))))}};var Z=Object.freeze({height:1600,flatRadius:90,groundCell:.3}),te=Object.freeze({low:{label:"Low",grid:[48,96,48],pixelRatio:.75,clouds:240,rain:5e3,ice:1500,grass:4e4,sparks:500,bloomRes:.5},medium:{label:"Medium",grid:[64,128,64],pixelRatio:1,clouds:460,rain:1e4,ice:3e3,grass:11e4,sparks:1100,bloomRes:.5},high:{label:"High",grid:[96,192,96],pixelRatio:1.75,clouds:760,rain:18e3,ice:5e3,grass:22e4,sparks:2e3,bloomRes:.75}});function U(a){return a=Math.imul(a^a>>>16,2146121005),a=Math.imul(a^a>>>15,2221713035),a^=a>>>16,(a>>>0)/4294967296}function fe(a,e){return U(Math.imul(a,668265261)^Math.imul(e,374761393)|0)}function z(a){let e=a>>>0;return()=>{e=e+1831565813|0;let t=Math.imul(e^e>>>15,1|e);return t=t+Math.imul(t^t>>>7,61|t)^t,((t^t>>>14)>>>0)/4294967296}}function ke(a,e){let t=Math.floor(a),r=Math.floor(e),s=a-t,o=e-r,n=s*s*(3-2*s),i=o*o*(3-2*o),c=fe(t,r),l=fe(t+1,r),h=fe(t,r+1),u=fe(t+1,r+1);return c+(l-c)*n+(h-c)*i+(c-l-h+u)*n*i}function Ue(a,e){let t=(s,o)=>(ke(s/950+11.3,o/950-4.1)-.5)*46+(ke(s/310-7.7,o/310+2.9)-.5)*14+(ke(s/120+3.1,o/120+9.4)-.5)*4,r=t(a,e);return(s,o)=>{let i=(Math.hypot(s-a,o-e)-Z.flatRadius)/420;return i=i<0?0:i>1?1:i,i=i*i*(3-2*i),(t(s,o)-r)*i}}var se=(a,e,t)=>a<e?e:a>t?t:a,G=(a,e,t)=>{let r=se((t-a)/(e-a),0,1);return r*r*(3-2*r)},_=(a,e,t)=>a+(e-a)*t;var ae=3;function Ve(a){let{nx:e,ny:t,nz:r,seed:s}=a.stats,o=Z.height/t,n=a.parents.length,{positions:i,parents:c,steps:l,fields:h,flags:u,subtrees:g,groundDist:E,mainPath:p}=a,d=new Float32Array(n*3);for(let m=0;m<n;m++){let Y=u[m]&(oe.ROOT|oe.GROUND)?0:.3*o,Q=s*7919+m*3|0;d[3*m]=(i[3*m]-e/2+.5)*o+(U(Q)-.5)*2*Y,d[3*m+1]=i[3*m+1]*o+(U(Q+1)-.5)*1.2*Y,d[3*m+2]=(i[3*m+2]-r/2+.5)*o+(U(Q+2)-.5)*2*Y}let w=n-1;for(let m=0;m<n;m++)m!==w&&d[3*m+1]<.4*o&&(d[3*m+1]=.4*o);let v=new Float32Array(n),x=Math.log2(Math.max(8,n*.35)),R=1e-9;for(let m=0;m<n;m++)R=Math.max(R,h[m]);for(let m=0;m<n;m++)v[m]=u[m]&oe.MAIN?1:Math.min(.85,Math.log2(g[m])/x);let P=(n-1)*ae,L=new Float32Array(P*3),O=new Float32Array(P*3),N=new Float32Array(P*4),M=new Float32Array(P),k=[0,0,0],A=[0,0,0],H=0;for(let m=1;m<n;m++){let W=c[m],Y=d[3*W],Q=d[3*W+1],de=d[3*W+2],Oe=d[3*m],Ge=d[3*m+1],Ie=d[3*m+2],nt=Math.hypot(Oe-Y,Ge-Q,Ie-de),He=E[W]*o,lt=E[m]*o,ct=u[m]&oe.MAIN?1:0;k[0]=Y,k[1]=Q,k[2]=de;for(let re=1;re<=ae;re++){let pe=re/ae;if(A[0]=Y+(Oe-Y)*pe,A[1]=Q+(Ge-Q)*pe,A[2]=de+(Ie-de)*pe,re<ae){let Me=s*31337+m*16+re*3|0,Ae=.17*nt;A[0]+=(U(Me)-.5)*2*Ae,A[1]+=(U(Me+1)-.5)*2*Ae,A[2]+=(U(Me+2)-.5)*2*Ae,A[1]<.05&&(A[1]=.05)}L.set(k,3*H),O.set(A,3*H),N[4*H]=l[m],N[4*H+1]=He+(lt-He)*(pe-.5/ae),N[4*H+2]=v[m],N[4*H+3]=Math.min(1,h[m]/R),M[H]=ct,H++,k[0]=A[0],k[1]=A[1],k[2]=A[2]}}let $=p.length,ue=new Float32Array($*3),Ce=new Uint32Array($),Te=new Float32Array($);for(let m=0;m<$;m++){let W=p[m];ue[3*m]=d[3*W],ue[3*m+1]=d[3*W+1],ue[3*m+2]=d[3*W+2],Ce[m]=l[W],Te[m]=E[W]*o}let Be=[];for(let m=0;m<a.charges.length/6;m++)Be.push({x:(a.charges[6*m]-e/2+.5)*o,y:a.charges[6*m+1]*o,z:(a.charges[6*m+2]-r/2+.5)*o,radius:a.charges[6*m+3]*o,q:a.charges[6*m+5]});let J=a.groundParents.length,Le=new Float32Array(J*2);for(let m=0;m<J*2;m++)Le[m]=a.groundPositions[m]*Z.groundCell;let Se=new Uint32Array(J).fill(1);for(let m=J-1;m>0;m--)Se[a.groundParents[m]]+=Se[m];let Re=1;for(let m=0;m<J;m++)Re=Math.max(Re,a.groundSteps[m]);let be=0;for(let m=0;m<n;m++)be=Math.max(be,l[m]);return{seed:s,cell:o,nodeCount:n,stats:a.stats,wpos:d,steps:l,parents:c,flags:u,segCount:P,aA:L,aB:O,aInfo:N,aMain:M,mainCount:$,mainPos:ue,mainStep:Ce,mainGDist:Te,mainLength:Te[0],totalSteps:be,root:[d[0],d[1],d[2]],strike:[d[3*w],0,d[3*w+2]],cloudBaseY:a.stats.cloudBase*o,worldWidth:e*o,charges:Be,ground:{count:J,pos:Le,parents:a.groundParents,steps:a.groundSteps,subtree:Se,maxStep:Re,size:a.stats.groundGrid*Z.groundCell}}}var S=Object.freeze({total:28,leaderStart:4.4,attach:21.6,connect:.34,restrike:.62}),dt=5;function We(a){let e=a.mainCount,t=Math.max(1,e-1-Math.min(dt,e-2)),r=a.mainStep[t],s=new Uint32Array(r+2);for(let p=0;p<=t;p++)s[Math.min(a.mainStep[p],r)+1]++;for(let p=1;p<s.length;p++)s[p]+=s[p-1];let o=new Float32Array(r+1);for(let p=0;p<=r;p++)o[p]=.5*(p/Math.max(1,r))+.5*((s[p+1]-1)/t);let n=z(Math.imul(a.seed,2654435761)+17),i=S.leaderStart,c=S.attach-S.connect,l=[],h=i,u=-1;for(;h<c;){let p=se((h-i)/(c-i-.05),0,1),d=0,w=r;for(;d<w;){let x=d+w+1>>1;o[x]<=p?d=x:w=x-1}if(d>u){let x=Math.max(0,s[d+1]-1),R=l.length?l[l.length-1].tipIndex:0;l.push({t:h,reveal:d,prev:u,tipIndex:x,advance:x-R,grew:d-u}),u=d}let v=n();h+=v<.12?.26+n()*.16:.07+n()*.12}if(!l.length||l[l.length-1].reveal<r){let p=l.length?l[l.length-1].tipIndex:0;l.push({t:c,reveal:r,prev:u,tipIndex:t,advance:t-p,grew:r-u})}let g=(()=>{for(let p=0;p<e;p++)if(a.mainPos[3*p+1]<a.cloudBaseY)return p;return 0})();function E(p){let d={t:p,phase:"intro",reveal:-1,prevReveal:-1,sinceBurst:99,eventIndex:-1,tipIndex:0,upDist:-1,strokeT:p-S.attach,leaderProgress:0};if(p<i)return d;if(p>=S.attach)return d.phase=p<S.attach+1.9?"stroke":"aftermath",d.reveal=1e9,d.prevReveal=1e9,d.tipIndex=e-1,d.eventIndex=l.length-1,d.upDist=1e9,d.leaderProgress=1,d;let w=0,v=l.length-1;if(l[0].t>p)return d.phase="leader",d;for(;w<v;){let R=w+v+1>>1;l[R].t<=p?w=R:v=R-1}let x=l[w];if(d.phase="leader",d.eventIndex=w,d.reveal=x.reveal,d.prevReveal=x.prev,d.sinceBurst=p-x.t,d.tipIndex=x.tipIndex,d.leaderProgress=se((p-i)/(S.attach-i),0,1),p>c){let R=(p-c)/S.connect;d.upDist=R*R*a.mainGDist[t]}return d}return{events:l,evaluate:E,capIndex:t,capStep:r,tipAtCloudBase:g}}import*as q from"three";import{EffectComposer as Et}from"three/addons/postprocessing/EffectComposer.js";import{RenderPass as Tt}from"three/addons/postprocessing/RenderPass.js";import{UnrealBloomPass as St}from"three/addons/postprocessing/UnrealBloomPass.js";import{OutputPass as Rt}from"three/addons/postprocessing/OutputPass.js";import*as V from"three";function $e(){return{uTime:{value:0},uFogColor:{value:new V.Color(.012,.016,.024)},uFogDensity:{value:4e-4},uAmbient:{value:new V.Color(.02,.026,.038)},uTipPos:{value:new V.Vector3},uTipLight:{value:new V.Color(0,0,0)},uTipRange:{value:110},uStrikePos:{value:new V.Vector3},uFlash:{value:new V.Color(0,0,0)},uStrokeT:{value:-100}}}var D=`
uniform float uTime;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec3 uAmbient;
uniform vec3 uTipPos;
uniform vec3 uTipLight;
uniform float uTipRange;
uniform vec3 uStrikePos;
uniform vec3 uFlash;
uniform float uStrokeT;

vec3 sceneLight(vec3 P, vec3 N) {
  vec3 L = uAmbient * (0.65 + 0.35 * N.y);
  vec3 d = uTipPos - P;
  float r2 = dot(d, d);
  L += uTipLight * (0.25 + 0.75 * max(dot(N, d * inversesqrt(r2 + 1e-3)), 0.0)) / (1.0 + r2 / (uTipRange * uTipRange));
  vec3 f = uStrikePos + vec3(0.0, 160.0, 0.0) - P;
  float f2 = dot(f, f);
  L += uFlash * (0.3 + 0.7 * max(dot(N, f * inversesqrt(f2)), 0.0)) / (1.0 + f2 / (650.0 * 650.0));
  return L;
}

// Unshadowed, direction-free version for particles and cloud puffs.
vec3 sceneGlow(vec3 P) {
  vec3 d = uTipPos - P;
  vec3 f = uStrikePos + vec3(0.0, 300.0, 0.0) - P;
  return uTipLight / (1.0 + dot(d, d) / (uTipRange * uTipRange)) + uFlash / (1.0 + dot(f, f) / (900.0 * 900.0));
}

vec3 withFog(vec3 c, float dist) {
  return mix(uFogColor, c, exp(-uFogDensity * dist));
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
`;function ie(a,e,t){let r=document.createElement("canvas");r.width=r.height=a;let s=r.getContext("2d");s.clearRect(0,0,a,a);let o=(i,c,l,h)=>{let u=s.createRadialGradient(i,c,0,i,c,l);u.addColorStop(0,`rgba(255,255,255,${h})`),u.addColorStop(.5,`rgba(255,255,255,${h*.45})`),u.addColorStop(1,"rgba(255,255,255,0)"),s.fillStyle=u,s.fillRect(i-l,c-l,2*l,2*l)};if(e===0){let i=s.createRadialGradient(a/2,a/2,0,a/2,a/2,a/2);i.addColorStop(0,"rgba(255,255,255,1)"),i.addColorStop(.08,"rgba(255,255,255,0.55)"),i.addColorStop(.25,"rgba(255,255,255,0.14)"),i.addColorStop(.6,"rgba(255,255,255,0.03)"),i.addColorStop(1,"rgba(255,255,255,0)"),s.fillStyle=i,s.fillRect(0,0,a,a)}else for(let i=0;i<e;i++){let c=t()*Math.PI*2,l=Math.sqrt(t())*a*.3,h=a*(.07+t()*.12);o(a/2+Math.cos(c)*l,a/2+Math.sin(c)*l,h,.22+t()*.3)}let n=new V.CanvasTexture(r);return n.colorSpace=V.NoColorSpace,n}import*as I from"three";var pt=`
${D}
attribute vec3 aA;
attribute vec3 aB;
attribute vec4 aInfo;   // growth step, channel distance to ground (m), width class, field
attribute float aMain;
uniform float uReveal;      // growth steps revealed so far (simulation time)
uniform float uPrevReveal;  // value before the latest burst
uniform float uBurst;       // 1 at a burst, decays in real time
uniform float uUpDist;      // upward connecting leader reach along the channel (m)
uniform float uLeaderGain;
uniform float uRestrike;
uniform float uPixel;       // world size of one pixel at distance 1
uniform float uMaxWidth;    // widest a ribbon may get, per unit distance
uniform float uTipSpan;
varying vec3 vColor;
varying float vSide;

void main() {
  float stepI = aInfo.x, gdist = aInfo.y, wc = aInfo.z, field = aInfo.w;

  // ---- leader phase
  float shown = step(stepI, uReveal);
  float upward = aMain * step(gdist, uUpDist) * (1.0 - shown);
  float fresh = step(uPrevReveal + 0.5, stepI) * shown * uBurst;
  float nearTip = exp(-max(uReveal - stepI, 0.0) / uTipSpan);
  float shimmer = 0.8 + 0.2 * sin(uTime * 31.0 + stepI * 1.7);
  float leader = (0.15 + 0.5 * nearTip + 2.2 * fresh) * mix(0.3, 1.0, wc) * (0.7 + 0.6 * field) * shimmer * shown;
  leader += upward * 2.2;
  leader *= uLeaderGain;

  // ---- return stroke: a wave that leaves the ground at uStrokeT = 0
  float ts = uStrokeT - gdist / 9000.0;
  float on = step(0.0, ts);
  float tsp = max(ts, 0.0);
  float mainEnv = 11.0 * exp(-tsp / 0.12) + 3.0 * exp(-tsp / 0.5) + 0.5 * exp(-tsp / 0.9);
  float branchEnv = (6.0 * exp(-tsp / 0.08) + 0.9 * exp(-tsp / 0.32)) * mix(0.12, 1.0, wc);
  float stroke = on * mix(branchEnv, mainEnv, aMain) + aMain * uRestrike * 5.0;

  float intensity = leader + stroke;
  vec3 cool = vec3(0.46, 0.54, 1.0);
  vec3 hot = vec3(1.0, 0.94, 0.98);
  vec3 col = mix(cool, hot, clamp(stroke * 0.3 + fresh * 0.7 + upward, 0.0, 1.0));

  // ---- camera-facing ribbon in view space
  vec3 a = (modelViewMatrix * vec4(aA, 1.0)).xyz;
  vec3 b = (modelViewMatrix * vec4(aB, 1.0)).xyz;
  vec3 p = mix(a, b, position.x);
  vec3 t = normalize(b - a + vec3(1e-5));
  vec3 side = normalize(cross(t, normalize(p)));
  float dist = length(p);
  float w = mix(0.16, 0.7, wc) * (1.0 + 0.5 * fresh) + on * aMain * 1.3 * exp(-tsp / 0.45) + on * (1.0 - aMain) * 0.5 * wc * exp(-tsp / 0.2);
  float minW = 0.75 * dist * uPixel;
  // Keep distant channels at least a pixel and a half wide, dimming them
  // instead of letting them alias away.
  intensity *= clamp(w / minW, 0.35, 1.0);
  w = min(max(w, minW), dist * uMaxWidth);
  p += side * w * position.y + t * w * 0.2 * (position.x * 2.0 - 1.0);

  intensity *= exp(-uFogDensity * dist * 0.85);
  vColor = col * intensity;
  vSide = position.y;
  gl_Position = intensity < 0.002 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * vec4(p, 1.0);
}`,mt=`
varying vec3 vColor;
varying float vSide;
void main() {
  float s2 = vSide * vSide;
  float edge = (1.0 - s2) * (1.0 - s2);   // fade to exactly zero at the ribbon edge
  float core = exp(-s2 * 9.0);
  float halo = exp(-s2 * 2.2) * 0.3;
  gl_FragColor = vec4(vColor * (core + halo) * edge, 1.0);
}`,ve=class{constructor(e){this.uniforms={...e,uReveal:{value:-1},uPrevReveal:{value:-1},uBurst:{value:0},uUpDist:{value:-1},uLeaderGain:{value:1},uRestrike:{value:0},uPixel:{value:.001},uMaxWidth:{value:.02},uTipSpan:{value:40}},this.material=new I.ShaderMaterial({uniforms:this.uniforms,vertexShader:pt,fragmentShader:mt,blending:I.AdditiveBlending,depthWrite:!1,transparent:!0,side:I.DoubleSide}),this.mesh=new I.Mesh(new I.BufferGeometry,this.material),this.mesh.frustumCulled=!1,this.mesh.renderOrder=20}setBolt(e){this.mesh.geometry.dispose();let t=new I.InstancedBufferGeometry;t.setAttribute("position",new I.BufferAttribute(new Float32Array([0,-1,0,1,-1,0,1,1,0,0,1,0]),3)),t.setIndex([0,1,2,0,2,3]),t.setAttribute("aA",new I.InstancedBufferAttribute(e.aA,3)),t.setAttribute("aB",new I.InstancedBufferAttribute(e.aB,3)),t.setAttribute("aInfo",new I.InstancedBufferAttribute(e.aInfo,4)),t.setAttribute("aMain",new I.InstancedBufferAttribute(e.aMain,1)),t.instanceCount=e.segCount,this.mesh.geometry=t,this.uniforms.uTipSpan.value=Math.max(12,e.totalSteps*.04)}};import*as y from"three";function qe(a){let e=new y.ShaderMaterial({uniforms:{...a},side:y.BackSide,depthWrite:!1,depthTest:!1,vertexShader:`
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * vec4((modelViewMatrix * vec4(position, 0.0)).xyz, 1.0);
        gl_Position = p.xyww;
      }`,fragmentShader:`
      ${D}
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        // Overcast: a faint brighter band just above the horizon where the
        // far edge of the storm lets some light through.
        vec3 overhead = vec3(0.010, 0.013, 0.020);
        vec3 band = vec3(0.060, 0.075, 0.095);
        float k = exp(-abs(h - 0.02) * 9.0);
        vec3 col = mix(overhead, band, k);
        float under = fbm(d.xz / max(h + 0.15, 0.05) * 1.3);
        col *= 0.75 + 0.5 * under;
        // The underside of the cloud deck catches the return stroke.
        col += uFlash * (0.012 + 0.03 * under) * smoothstep(-0.05, 0.35, h);
        col = mix(col, uFogColor, smoothstep(0.05, -0.12, h));
        gl_FragColor = vec4(col, 1.0);
      }`}),t=new y.Mesh(new y.SphereGeometry(1,24,16),e);return t.frustumCulled=!1,t.renderOrder=-10,t}var ft=`
${D}
attribute vec4 aPuff;   // centre xyz, size
attribute vec2 aSeed;   // rotation, shade
uniform vec4 uGlow[4];  // xyz + intensity of in-cloud flickers
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec3 centre = aPuff.xyz;
  float size = aPuff.w;
  vec4 mv = viewMatrix * vec4(centre, 1.0);
  float c = cos(aSeed.x), s = sin(aSeed.x);
  vec2 corner = mat2(c, -s, s, c) * position.xy;
  mv.xy += corner * size;
  gl_Position = projectionMatrix * mv;
  vUv = position.xy * 0.5 + 0.5;
  float dist = length(mv.xyz);
  // The leader tip is a weak source; the return stroke lights the whole deck.
  vec3 dTip = uTipPos - centre;
  vec3 dStrike = uStrikePos + vec3(0.0, 300.0, 0.0) - centre;
  vec3 lit = uAmbient * 1.1 + uTipLight * 0.07 / (1.0 + dot(dTip, dTip) / (140.0 * 140.0))
           + uFlash * 0.9 / (1.0 + dot(dStrike, dStrike) / (900.0 * 900.0));
  for (int i = 0; i < 4; i++) {
    vec3 d = uGlow[i].xyz - centre;
    lit += vec3(0.55, 0.62, 1.0) * uGlow[i].w / (1.0 + dot(d, d) / (230.0 * 230.0));
  }
  vColor = withFog(vec3(0.35 + 1.0 * aSeed.y * aSeed.y) * lit, dist);
  // Puffs fade out as the camera flies through them.
  vAlpha = smoothstep(size * 0.12, size * 0.8, dist) * (0.45 + 0.3 * aSeed.y);
}`,vt=`
uniform sampler2D uMap;
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float a = texture2D(uMap, vUv).a * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor, a);
}`;function je(a,e){let t=z(49421),r={...a,uMap:{value:ie(256,48,t)},uGlow:{value:[new y.Vector4,new y.Vector4,new y.Vector4,new y.Vector4]}},s=new y.ShaderMaterial({uniforms:r,vertexShader:ft,fragmentShader:vt,transparent:!0,depthWrite:!1,side:y.DoubleSide}),o=new y.InstancedBufferGeometry;o.setAttribute("position",new y.BufferAttribute(new Float32Array([-1,-1,0,1,-1,0,1,1,0,-1,1,0]),3)),o.setIndex([0,1,2,0,2,3]);let n=new Float32Array(e*4),i=new Float32Array(e*2);o.setAttribute("aPuff",new y.InstancedBufferAttribute(n,4)),o.setAttribute("aSeed",new y.InstancedBufferAttribute(i,2)),o.instanceCount=e;let c=new y.Mesh(o,s);c.frustumCulled=!1,c.renderOrder=5;function l(h){let u=z(h.seed^24301),g=h.cloudBaseY,E=1900,p=h.root[0],d=h.root[2];for(let w=0;w<e;w++){let v=w<e*.45,x=v?900*Math.sqrt(u()):900+3600*Math.pow(u(),.8),R=u()*Math.PI*2,P=v?150+u()*190:320+u()*520,L=u()<.55;n[4*w]=p+Math.cos(R)*x,n[4*w+1]=L?g+P*(.35+u()*.25):g+P*.5+u()*(E-g),n[4*w+2]=d+Math.sin(R)*x,n[4*w+3]=P,i[2*w]=u()*6.283,i[2*w+1]=u()}o.attributes.aPuff.needsUpdate=!0,o.attributes.aSeed.needsUpdate=!0}return{mesh:c,uniforms:r,layout:l}}function Xe(a,e){let t=z(41394),r=new Float32Array(e*2*3),s=new Float32Array(e*2),o=new Float32Array(e*2);for(let h=0;h<e;h++){let u=t(),g=t(),E=t(),p=.75+t()*.5;for(let d=0;d<2;d++)r.set([u,g,E],(2*h+d)*3),s[2*h+d]=d,o[2*h+d]=p}let n=new y.BufferGeometry;n.setAttribute("position",new y.BufferAttribute(r,3)),n.setAttribute("aEnd",new y.BufferAttribute(s,1)),n.setAttribute("aSpeed",new y.BufferAttribute(o,1));let i={...a,uAmount:{value:1},uCamVel:{value:new y.Vector3}},c=new y.ShaderMaterial({uniforms:i,transparent:!0,depthWrite:!1,blending:y.AdditiveBlending,vertexShader:`
      ${D}
      attribute float aEnd;
      attribute float aSpeed;
      uniform float uAmount;
      uniform vec3 uCamVel;
      varying vec3 vColor;
      const vec3 BOX = vec3(110.0, 80.0, 110.0);
      void main() {
        vec3 fall = vec3(2.2, -9.5 * aSpeed, 0.9);
        vec3 p = position * BOX + fall * uTime;
        p = cameraPosition + (fract((p - cameraPosition) / BOX) - 0.5) * BOX;
        // Streak length follows the velocity relative to the camera, like a
        // real exposure would.
        vec3 rel = fall - uCamVel;
        p -= rel * 0.014 * aEnd;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        float dist = length(mv.xyz);
        float fade = smoothstep(55.0, 20.0, dist) * smoothstep(0.6, 2.5, dist);
        vec3 lit = uAmbient * 2.0 + min(sceneGlow(p), vec3(1.2)) * 0.4;
        vColor = lit * fade * uAmount * (1.0 - 0.6 * aEnd) * 0.45;
        gl_Position = projectionMatrix * mv;
      }`,fragmentShader:`
      varying vec3 vColor;
      void main() { gl_FragColor = vec4(vColor, 1.0); }`}),l=new y.LineSegments(n,c);return l.frustumCulled=!1,l.renderOrder=12,{mesh:l,uniforms:i}}function Ye(a,e){let t=z(462),r=new Float32Array(e*3),s=new Float32Array(e);for(let l=0;l<e;l++)r.set([t(),t(),t()],l*3),s[l]=t();let o=new y.BufferGeometry;o.setAttribute("position",new y.BufferAttribute(r,3)),o.setAttribute("aSeed",new y.BufferAttribute(s,1));let n={...a,uAmount:{value:1},uScale:{value:600}},i=new y.ShaderMaterial({uniforms:n,transparent:!0,depthWrite:!1,blending:y.AdditiveBlending,vertexShader:`
      ${D}
      attribute float aSeed;
      uniform float uAmount;
      uniform float uScale;
      varying vec3 vColor;
      const vec3 BOX = vec3(70.0, 70.0, 70.0);
      void main() {
        // Graupel and ice crystals: slow fall, turbulent drift.
        vec3 drift = vec3(sin(uTime * 0.7 + aSeed * 40.0), 0.0, cos(uTime * 0.5 + aSeed * 23.0)) * 1.6;
        vec3 p = position * BOX + vec3(1.5, -2.4 - aSeed * 1.5, 0.6) * uTime + drift;
        p = cameraPosition + (fract((p - cameraPosition) / BOX) - 0.5) * BOX;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        float dist = length(mv.xyz);
        float fade = smoothstep(35.0, 8.0, dist) * smoothstep(0.4, 1.5, dist);
        float glint = 0.6 + 0.4 * sin(uTime * (5.0 + aSeed * 9.0) + aSeed * 100.0);
        vColor = (uAmbient * 5.0 + sceneGlow(p) * 0.9) * fade * glint * uAmount;
        gl_PointSize = clamp(uScale * (0.05 + 0.07 * aSeed) / dist, 1.0, 6.0);
        gl_Position = projectionMatrix * mv;
      }`,fragmentShader:`
      varying vec3 vColor;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.1, length(c));
        gl_FragColor = vec4(vColor * a, 1.0);
      }`}),c=new y.Points(o,i);return c.frustumCulled=!1,c.renderOrder=13,{mesh:c,uniforms:n}}import*as b from"three";function Qe(a){let e=new b.ShaderMaterial({uniforms:{...a},vertexShader:`
      varying vec3 vWorld;
      varying vec3 vNormal;
      void main() {
        vWorld = position;
        vNormal = normal;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,fragmentShader:`
      ${D}
      varying vec3 vWorld;
      varying vec3 vNormal;
      void main() {
        float dist = length(vWorld - cameraPosition);
        float patches = fbm(vWorld.xz * 0.0035);
        float mid = fbm(vWorld.xz * 0.045 + 3.7);
        float fine = vnoise(vWorld.xz * 1.9) * smoothstep(120.0, 10.0, dist);
        vec3 green = vec3(0.10, 0.115, 0.055);
        vec3 straw = vec3(0.30, 0.25, 0.13);
        vec3 soil = vec3(0.09, 0.07, 0.05);
        vec3 albedo = mix(green, straw, smoothstep(0.32, 0.68, patches));
        albedo = mix(albedo, soil, smoothstep(0.6, 0.82, mid) * 0.45);
        albedo *= 0.72 + 0.5 * mid + 0.25 * fine;
        vec3 col = albedo * sceneLight(vWorld, normalize(vNormal));
        gl_FragColor = vec4(withFog(col, dist), 1.0);
      }`}),t=new b.Mesh(new b.BufferGeometry,e);t.frustumCulled=!1;function r(s,o,n){let l=new b.PlaneGeometry(11e3,11e3,220,220);l.rotateX(-Math.PI/2);let h=l.attributes.position;for(let u=0;u<h.count;u++){let g=h.getX(u)+o,E=h.getZ(u)+n;h.setXYZ(u,g,s(g,E),E)}l.computeVertexNormals(),t.geometry.dispose(),t.geometry=l}return{mesh:t,rebuild:r}}function gt(a){let t=document.createElement("canvas");t.width=t.height=512;let r=t.getContext("2d");r.fillStyle="#000",r.fillRect(0,0,512,512);let s=512/a.size,o=512/2,n=h=>o+a.pos[2*h]*s,i=h=>o+a.pos[2*h+1]*s;r.lineCap="round",r.globalCompositeOperation="lighten";let c=Math.log2(Math.max(4,a.count));for(let h=0;h<2;h++)for(let u=1;u<a.count;u++){let g=a.parents[u],E=Math.round(255*Math.min(1,a.steps[u]/a.maxStep)),p=Math.log2(a.subtree[u]+1)/c;h===0?(r.strokeStyle=`rgb(${Math.round(150+105*p)},${E},0)`,r.shadowColor=`rgb(${Math.round(120+100*p)},${E},0)`,r.shadowBlur=5+9*p,r.lineWidth=3+9*p):(r.strokeStyle=`rgb(255,${E},${Math.round(120+135*p)})`,r.shadowBlur=0,r.lineWidth=1.2+3.5*p),r.beginPath(),r.moveTo(n(g),i(g)),r.lineTo(n(u),i(u)),r.stroke()}r.shadowBlur=0;let l=r.createRadialGradient(o,o,0,o,o,512*.06);return l.addColorStop(0,"rgb(255,0,255)"),l.addColorStop(.6,"rgb(230,0,120)"),l.addColorStop(1,"rgb(0,0,0)"),r.fillStyle=l,r.beginPath(),r.arc(o,o,512*.06,0,Math.PI*2),r.fill(),t}var Ke=`
uniform sampler2D uScorch;
uniform float uScorchSize;
// Returns vec3(char, ember heat, reveal) at a world position.
vec3 scorchAt(vec2 xz) {
  vec2 uv = (xz - uStrikePos.xz) / uScorchSize + 0.5;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0 || uStrokeT < 0.0) return vec3(0.0);
  vec4 s = texture2D(uScorch, uv);
  // The discharge spreads outward over about half a second.
  float reveal = smoothstep(s.g - 0.06, s.g + 0.04, uStrokeT / 0.5);
  float local = max(uStrokeT - s.g * 0.5, 0.0);
  float heat = s.b * reveal * (1.6 * exp(-local / 0.5) + 0.8 * exp(-local / 8.0));
  return vec3(s.r * reveal, heat, reveal);
}
vec3 emberColor(float heat) {
  // black body-ish ramp: deep red -> orange -> pale yellow
  return vec3(1.0, 0.33, 0.07) * heat * 2.4 + vec3(0.9, 0.75, 0.45) * max(heat - 0.8, 0.0) * 3.0;
}`;function Ze(a){let e=new b.CanvasTexture(document.createElement("canvas"));e.colorSpace=b.NoColorSpace;let t={uScorch:{value:e},uScorchSize:{value:28.8}},r=new b.ShaderMaterial({uniforms:{...a,...t},transparent:!0,depthWrite:!1,blending:b.CustomBlending,blendSrc:b.OneFactor,blendDst:b.OneMinusSrcAlphaFactor,polygonOffset:!0,polygonOffsetFactor:-2,polygonOffsetUnits:-2,vertexShader:`
      varying vec3 vWorld;
      void main() {
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
      }`,fragmentShader:`
      ${D}
      ${Ke}
      varying vec3 vWorld;
      void main() {
        vec3 s = scorchAt(vWorld.xz);
        float flicker = 0.8 + 0.2 * vnoise(vWorld.xz * 6.0 + uTime * 2.5);
        float alpha = clamp(s.x * 0.92, 0.0, 1.0);
        vec3 glow = emberColor(s.y * flicker);
        float dist = length(vWorld - cameraPosition);
        gl_FragColor = vec4(glow * exp(-uFogDensity * dist), alpha);
      }`}),s=new b.PlaneGeometry(1,1);s.rotateX(-Math.PI/2);let o=new b.Mesh(s,r);o.renderOrder=2;function n(i){e.image=gt(i.ground),e.needsUpdate=!0,t.uScorchSize.value=i.ground.size,o.scale.set(i.ground.size,1,i.ground.size),o.position.set(i.strike[0],.04,i.strike[2])}return{mesh:o,uniforms:t,setBolt:n}}var wt=`
${D}
${Ke}
attribute vec3 aBase;
attribute vec4 aBlade;   // height, width, yaw, tint
varying vec3 vColor;
void main() {
  float t = position.y;
  float h = aBlade.x;
  vec3 s = scorchAt(aBase.xz);
  float burn = s.x;
  h *= 1.0 - 0.82 * burn;

  // wind
  float phase = dot(aBase.xz, vec2(0.13, 0.08)) + uTime * 1.9 + aBlade.z;
  float gust = 0.55 + 0.45 * sin(dot(aBase.xz, vec2(0.021, 0.017)) - uTime * 0.6);
  float sway = (sin(phase) * 0.6 + sin(phase * 2.7 + 1.3) * 0.25) * gust;
  vec2 bend = vec2(0.85, 0.5) * (0.28 + 0.3 * sway);

  // pressure wave from the return stroke flattens the grass as it passes
  vec2 away = aBase.xz - uStrikePos.xz;
  float r = length(away);
  away /= max(r, 0.01);
  float ts = max(uStrokeT, 0.0);
  float front = (r - ts * 75.0) / 8.0;
  bend += away * 1.5 * exp(-front * front) * step(0.0, uStrokeT) * exp(-ts * 1.1) / (1.0 + r * 0.02);

  float c = cos(aBlade.z), sn = sin(aBlade.z);
  vec3 p = aBase + vec3(c, 0.0, sn) * position.x * aBlade.y;
  float curve = t * t;
  p.xz += bend * h * curve;
  p.y += h * t * (1.0 - 0.25 * min(dot(bend, bend), 1.0) * curve);

  vec3 n = normalize(vec3(-sn * 0.35 + bend.x * 0.4, 1.0, c * 0.35 + bend.y * 0.4));
  vec3 root = vec3(0.05, 0.06, 0.028);
  vec3 tip = mix(vec3(0.21, 0.22, 0.09), vec3(0.42, 0.36, 0.18), aBlade.w);
  vec3 albedo = mix(root, tip, t);
  albedo = mix(albedo, vec3(0.012, 0.01, 0.009), min(burn * 1.3, 1.0));
  vec3 col = albedo * sceneLight(p, n) * (0.55 + 0.45 * t);
  // charred stems smoulder near the base
  col += emberColor(s.y) * (1.0 - t) * 0.6;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vColor = withFog(col, length(mv.xyz));
  gl_Position = projectionMatrix * mv;
}`;function Je(a,e,t){let r=[[0,1],[.4,.82],[.75,.5]],s=[],o=[];for(let[g,E]of r)s.push(-.5*E,g,0,.5*E,g,0);s.push(0,1,0),o.push(0,1,2,1,3,2,2,3,4,3,5,4,4,5,6);let n=new b.InstancedBufferGeometry;n.setAttribute("position",new b.BufferAttribute(new Float32Array(s),3)),n.setIndex(o);let i=new Float32Array(t*3),c=new Float32Array(t*4);n.setAttribute("aBase",new b.InstancedBufferAttribute(i,3)),n.setAttribute("aBlade",new b.InstancedBufferAttribute(c,4)),n.instanceCount=t;let l=new b.ShaderMaterial({uniforms:{...a,...e},vertexShader:wt,fragmentShader:`
      varying vec3 vColor;
      void main() { gl_FragColor = vec4(vColor, 1.0); }`,side:b.DoubleSide}),h=new b.Mesh(n,l);h.frustumCulled=!1;function u(g,E){let p=z(g.seed^27221),d=Z.flatRadius-6;for(let w=0;w<t;w++){let v=d*Math.pow(p(),.72),x=p()*Math.PI*2,R=g.strike[0]+Math.cos(x)*v,P=g.strike[2]+Math.sin(x)*v,L=.6+.8*p();i[3*w]=R,i[3*w+1]=E(R,P),i[3*w+2]=P,c[4*w]=(.38+.5*p())*L*(1-.6*Math.pow(v/d,6)),c[4*w+1]=.05+.06*p()+.05*(v/d),c[4*w+2]=p()*Math.PI*2,c[4*w+3]=p()}n.attributes.aBase.needsUpdate=!0,n.attributes.aBlade.needsUpdate=!0}return{mesh:h,setBolt:u}}import*as C from"three";var yt=`
${D}
attribute vec3 aVel;
attribute vec4 aParam;   // delay, life, size, seed
uniform vec3 uGravity;
uniform float uDrag;
uniform float uWobble;
uniform float uScale;
varying vec3 vColor;
void main() {
  float t = uStrokeT - aParam.x;
  float life = aParam.y;
  float alive = step(0.0, t) * step(t, life);
  float e = 1.0 - exp(-uDrag * t);
  // ballistic flight with linear drag
  vec3 p = position + (aVel - uGravity / uDrag) * e / uDrag + uGravity * t / uDrag;
  p.xz += uWobble * vec2(sin(t * 2.3 + aParam.w * 50.0), cos(t * 1.9 + aParam.w * 31.0)) * t;
  float landed = step(p.y, 0.06);
  p.y = max(p.y, 0.06);
  float k = clamp(t / life, 0.0, 1.0);
  float heat = (1.0 - k) * (1.0 - 0.6 * landed);
  vec3 col = mix(vec3(1.0, 0.25, 0.04), vec3(1.0, 0.85, 0.6), heat * heat) * (0.3 + 3.2 * heat * heat);
  col *= 0.75 + 0.25 * sin(t * 40.0 + aParam.w * 90.0);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float dist = length(mv.xyz);
  vColor = col * alive * exp(-uFogDensity * dist);
  gl_PointSize = clamp(uScale * aParam.z / dist, 1.0, 14.0);
  gl_Position = alive > 0.5 ? projectionMatrix * mv : vec4(2.0, 2.0, 2.0, 1.0);
}`,xt=`
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  gl_FragColor = vec4(vColor * smoothstep(0.5, 0.0, d), 1.0);
}`;function et(a,e,t){let r=new C.BufferGeometry,s=new Float32Array(e*3),o=new Float32Array(e*3),n=new Float32Array(e*4);r.setAttribute("position",new C.BufferAttribute(s,3)),r.setAttribute("aVel",new C.BufferAttribute(o,3)),r.setAttribute("aParam",new C.BufferAttribute(n,4));let i={...a,uGravity:{value:new C.Vector3(0,-9.8,0)},uDrag:{value:1.2},uWobble:{value:0},uScale:{value:600},...t},c=new C.ShaderMaterial({uniforms:i,vertexShader:yt,fragmentShader:xt,transparent:!0,depthWrite:!1,blending:C.AdditiveBlending}),l=new C.Points(r,c);return l.frustumCulled=!1,l.renderOrder=18,{mesh:l,uniforms:i,pos:s,vel:o,param:n,geometry:r,count:e}}function tt(a,e){let t=et(a,e,{});return t.setBolt=r=>{let s=z(r.seed^20903);for(let o=0;o<e;o++){let n=s()*Math.PI*2,i=.25+s()*.75,c=6+38*Math.pow(s(),2.2),l=Math.sqrt(Math.max(0,1-i*i));t.pos.set([r.strike[0]+(s()-.5)*.8,.2,r.strike[2]+(s()-.5)*.8],3*o),t.vel.set([Math.cos(n)*l*c,i*c*.9,Math.sin(n)*l*c],3*o),t.param.set([s()*.12+(s()<.15?s()*.7:0),.5+2.6*Math.pow(s(),1.6),.07+.1*s(),s()],4*o)}for(let o of["position","aVel","aParam"])t.geometry.attributes[o].needsUpdate=!0},t}function st(a,e){let t=et(a,e,{});return t.uniforms.uGravity.value.set(.5,1.1,.2),t.uniforms.uDrag.value=.9,t.uniforms.uWobble.value=.18,t.setBolt=r=>{let s=z(r.seed^3643),o=r.ground;for(let n=0;n<e;n++){let i=Math.floor(s()*o.count);t.pos.set([r.strike[0]+o.pos[2*i]+(s()-.5)*.3,.1,r.strike[2]+o.pos[2*i+1]+(s()-.5)*.3],3*n),t.vel.set([(s()-.5)*.8,.5+s()*1.6,(s()-.5)*.8],3*n),t.param.set([.3+s()*5.2,1.6+s()*2.8,.035+.04*s(),s()],4*n)}for(let n of["position","aVel","aParam"])t.geometry.attributes[n].needsUpdate=!0},t}function rt(a){let e=z(1552),t=ie(128,0,e),r=ie(128,14,e),s=(n,i,c)=>{let l=new C.SpriteMaterial({map:n,blending:i,depthWrite:!1,transparent:!0,color:0}),h=new C.Sprite(l);return h.renderOrder=c,h.visible=!1,a.add(h),h},o={corona:s(t,C.AdditiveBlending,21),halo:s(t,C.AdditiveBlending,19),flare:s(t,C.AdditiveBlending,22),smoke:[]};o.flare.material.depthTest=!1;for(let n=0;n<16;n++){let i=s(r,C.NormalBlending,17);i.userData={delay:.15+n*.28+e()*.2,ox:(e()-.5)*3,oz:(e()-.5)*3,rise:1.4+e()*1.2,rot:e()*6.28,grow:1.2+e()},i.material.rotation=i.userData.rot,o.smoke.push(i)}return o}var ot=1.25,bt=[.7,2.9,1.9,3.8],ge=class{constructor(e){this.canvas=e,this.gl=new q.WebGLRenderer({canvas:e,antialias:!1,powerPreference:"high-performance"}),this.gl.toneMapping=q.ACESFilmicToneMapping,this.gl.toneMappingExposure=ot,this.gl.setClearColor(0,1),this.scene=new q.Scene,this.camera=new q.PerspectiveCamera(62,1,.3,14e3),this.shared=$e(),this.sky=qe(this.shared),this.terrain=Qe(this.shared),this.scorch=Ze(this.shared),this.lightning=new ve(this.shared),this.glows=rt(this.scene),this.scene.add(this.sky,this.terrain.mesh,this.scorch.mesh,this.lightning.mesh),this.composer=new Et(this.gl),this.composer.addPass(new Tt(this.scene,this.camera)),this.bloom=new St(new q.Vector2(256,256),.6,.7,.92),this.composer.addPass(this.bloom),this.composer.addPass(new Rt),this.detail=null,this.bolt=null,this.qualityKey=null}setQuality(e){if(e===this.qualityKey)return;this.qualityKey=e;let t=this.quality=te[e];if(this.detail)for(let r of Object.values(this.detail))this.scene.remove(r.mesh),r.mesh.geometry.dispose(),r.mesh.material.dispose();this.detail={clouds:je(this.shared,t.clouds),rain:Xe(this.shared,t.rain),ice:Ye(this.shared,t.ice),grass:Je(this.shared,this.scorch.uniforms,t.grass),sparks:tt(this.shared,t.sparks),embers:st(this.shared,Math.round(t.sparks*.35))};for(let r of Object.values(this.detail))this.scene.add(r.mesh);this.bolt&&this._applyBolt(),this.resize()}setBolt(e,t){this.bolt=e,this.heightAt=t,this.lightning.setBolt(e),this.terrain.rebuild(t,e.strike[0],e.strike[2]),this.scorch.setBolt(e),this.shared.uStrikePos.value.set(e.strike[0],0,e.strike[2]),this.detail&&this._applyBolt()}_applyBolt(){let e=this.detail,t=this.bolt;e.clouds.layout(t),e.grass.setBolt(t,this.heightAt),e.sparks.setBolt(t),e.embers.setBolt(t)}resize(){let e=this.canvas.clientWidth||window.innerWidth,t=this.canvas.clientHeight||window.innerHeight,r=this.quality||te.medium,s=Math.min(window.devicePixelRatio||1,r.pixelRatio);this.gl.setPixelRatio(s),this.gl.setSize(e,t,!1),this.composer.setPixelRatio(s),this.composer.setSize(e,t),this.bloom.resolution.set(e*s*r.bloomRes,t*s*r.bloomRes),this.camera.aspect=e/t,this.camera.fov=e/t<1?78:62,this.camera.updateProjectionMatrix(),this.pixelHeight=t*s}render(e,t,r){let s=this.bolt;if(!s||!this.detail)return;let o=this.shared,n=this.detail,i=this.lightning.uniforms,c=t.strokeT,l=c>=0,h=r.inCloud,u=Math.exp(-t.sinceBurst/.075);o.uTime.value=e,o.uStrokeT.value=c,i.uReveal.value=t.reveal,i.uPrevReveal.value=t.prevReveal,i.uBurst.value=u,i.uUpDist.value=t.upDist,i.uLeaderGain.value=l?Math.exp(-c/.35):1;let g=c-S.restrike,E=g>0?Math.exp(-g/.17)*(1-Math.exp(-g/.025)):0;i.uRestrike.value=E;let p=2*Math.tan(this.camera.fov*Math.PI/360);i.uPixel.value=p/this.pixelHeight,i.uMaxWidth.value=p*.008;let d=Math.min(t.tipIndex,s.mainCount-1),w=o.uTipPos.value.set(s.mainPos[3*d],s.mainPos[3*d+1],s.mainPos[3*d+2]),v;if(t.phase==="intro"){let M=G(S.leaderStart-2.6,S.leaderStart,e),k=Math.pow(Math.max(0,Math.sin(e*9.1)*Math.sin(e*5.3+1)*Math.sin(e*2.2+.4)),2);v=M*(.15+2.2*k),o.uTipRange.value=110,o.uTipLight.value.setRGB(.32*v,.42*v,1*v)}else l?(w.set(s.strike[0],1.6,s.strike[2]),o.uTipRange.value=15,v=(1.6*Math.exp(-c/3.5)+.5)*(.85+.15*Math.sin(e*11)*Math.sin(e*7.3))*G(.15,.8,c),o.uTipLight.value.setRGB(1*v,.36*v,.08*v)):(v=1.1+4*u+(t.upDist>0?2.5:0),o.uTipRange.value=110,o.uTipLight.value.setRGB(.32*v,.42*v,1*v));let x=l?4.2*Math.exp(-c/.14)+1.5*Math.exp(-c/.55)+.1*Math.exp(-c/2)+E*2:0;o.uFlash.value.setRGB(.78*x,.84*x,1*x),o.uFogDensity.value=_(3e-4,.0052,h);let R=o.uFogColor.value.setRGB(_(.013,.0085,h),_(.017,.0105,h),_(.026,.016,h)),P=h*(l?0:.0035*v)+x*_(.004,.02,h);R.r+=.6*P,R.g+=.7*P,R.b+=1*P,n.rain.uniforms.uAmount.value=_(1,.3,h),n.rain.uniforms.uCamVel.value.copy(r.velocity),n.ice.uniforms.uAmount.value=h,n.ice.uniforms.uScale.value=this.pixelHeight*.7,n.sparks.uniforms.uScale.value=n.embers.uniforms.uScale.value=this.pixelHeight*.9;let L=n.clouds.uniforms.uGlow.value;for(let M=0;M<4;M++){let k=s.charges[M%s.charges.length],A=Math.sin(e*(1.3+M*.37)+M*2.1)*Math.sin(e*(.53+M*.21)+M),H=Math.pow(Math.max(0,A),4)*.6*(.7+.3*Math.sin(e*23+M*5))*(l?Math.exp(-c/2):1),$=e-bt[M];$>0&&$<1.5&&(H+=9*(Math.exp(-$/.16)+.6*Math.exp(-Math.abs($-.3)/.1))),L[M].set(k.x,k.y-70,k.z,H+(l?7*Math.exp(-c/.28)+E*3:0))}let O=this.glows,N=t.phase==="leader"||t.phase==="intro"&&v>.02;if(O.corona.visible=O.halo.visible=N,N){let M=o.uTipPos.value,k=.5*v;O.corona.position.copy(M),O.corona.scale.setScalar(9+9*u+2*U(e*60|0)),O.corona.material.color.setRGB(.5*k,.6*k,1*k);let A=.012*v*(.3+h);O.halo.position.copy(M),O.halo.scale.setScalar(_(60,140,h)),O.halo.material.color.setRGB(.45*A,.55*A,1*A)}if(O.flare.visible=l&&c<2.5,O.flare.visible){let M=2.4*Math.exp(-c/.16)+.5*Math.exp(-c/.7)+E*1;O.flare.position.set(s.strike[0],2.5,s.strike[2]),O.flare.scale.setScalar(40+60*Math.exp(-c/.2)),O.flare.material.color.setRGB(.85*M,.9*M,1*M)}for(let M of O.smoke){let k=M.userData,A=c-k.delay;if(M.visible=l&&A>0&&A<7,!M.visible)continue;M.position.set(s.strike[0]+k.ox*(1+A)+A*1.3,.6+k.rise*Math.pow(A,.8),s.strike[2]+k.oz*(1+A)+A*.5),M.scale.setScalar(2.2+1.5*k.grow*A),M.material.rotation=k.rot+A*.12,M.material.opacity=.17*G(0,.6,A)*(1-G(3,7,A));let H=.045+.05*v/(1+A*1.5)+x*.05;M.material.color.setRGB(H*1,H*.82,H*.7)}this.gl.toneMappingExposure=ot*(l?1-.7*Math.exp(-c/1.2):1)*(t.phase==="aftermath"?_(1,1.9,G(2,5,c)):1),this.bloom.strength=.55,this.composer.render()}};import*as K from"three";var Mt=new K.Vector3,we=class{constructor(e){this.camera=e,this.pos=new K.Vector3,this.posLag=new K.Vector3,this.look=new K.Vector3,this.lookLag=new K.Vector3,this.velocity=new K.Vector3,this.inCloud=1,this.time=-1,this.bolt=null}setBolt(e,t,r){this.bolt=e,this.timeline=t,this.heightAt=r;let s=U(e.seed*13+5)*Math.PI*2;this.baseAngle=s,this.time=-1}_targets(e,t,r,s){let o=this.bolt,n=o.root,i=o.strike,c=Math.min(t.tipIndex,o.mainCount-1),l=o.mainPos[3*c],h=o.mainPos[3*c+1],u=o.mainPos[3*c+2],g=this.baseAngle+e*.045,E=Math.cos(g),p=Math.sin(g);if(e<S.leaderStart){let w=e/S.leaderStart,v=_(150,62,w*w*(3-2*w));r.set(n[0]+E*v,n[1]+_(34,16,w),n[2]+p*v),s.set(n[0],n[1]-6,n[2])}else if(e<S.attach){let v=G(260,40,h),x=_(40,58,v),R=_(27,13,v);r.set(l+E*x,h+R,u+p*x),s.set(l,h-_(24,6,v),u)}else{let w=e-S.attach,v=G(.9,2.7,w),x=_(_(58,82,G(0,1.2,w)),15,v),R=_(_(13,9,G(0,1.2,w)),7.5,v),P=_(_(8,95,G(.05,.9,w)),.2,v);r.set(i[0]+E*x,R,i[2]+p*x),s.set(i[0],P,i[2])}let d=this.heightAt(r.x,r.z)+2.6;r.y<d&&(r.y=d)}_snap(e,t){this._targets(e,t,this.pos,this.look),this.posLag.copy(this.pos),this.lookLag.copy(this.look),this.velocity.set(0,0,0)}update(e,t){if(!this.bolt)return;let r=e-this.time;if(this.time<0||r<0||r>.25){let s=Math.max(0,e-4);this._snap(s,t(s));for(let o=s+1/60;o<e;o+=1/60)this._advance(o,1/60,t(o));this._advance(e,1/60,t(e))}else r>0&&this._advance(e,r,t(e));this.time=e,this._apply(e)}_advance(e,t,r){let s=Mt,o=new K.Vector3;this._targets(e,r,s,o);let n=e-S.attach,i=n>0?_(.45,1.1,G(.5,3,n)):e<S.leaderStart?.9:.42,c=n>0?_(.3,.6,G(.5,3,n)):.3,l=this.pos.x,h=this.pos.y,u=this.pos.z,g=1-Math.exp(-t/(i*.5)),E=1-Math.exp(-t/(c*.5));this.posLag.lerp(s,g),this.pos.lerp(this.posLag,g),this.lookLag.lerp(o,E),this.look.lerp(this.lookLag,E),t>0&&this.velocity.set((this.pos.x-l)/t,(this.pos.y-h)/t,(this.pos.z-u)/t)}_apply(e){let t=this.camera;t.position.copy(this.pos);let r=e-S.attach,s=r>0?.9*Math.exp(-r/.35):0,o=(n,i)=>Math.sin(e*n+i)*.6+Math.sin(e*n*2.3+i*1.7)*.4;t.position.x+=o(.7,1)*.25+o(31,.3)*s,t.position.y+=o(.9,2)*.2+o(37,1.1)*s,t.position.z+=o(.6,4)*.25+o(29,2.2)*s,t.up.set(0,1,0),t.lookAt(this.look),t.rotateZ(o(.35,5)*.012),this.inCloud=G(this.bolt.cloudBaseY-70,this.bolt.cloudBaseY+30,t.position.y),t.updateMatrixWorld()}};var ye=class{constructor(){this.ctx=null,this.muted=!1,this.oneShots=new Set,this.lastT=-1,this.lastEvent=-1}get running(){return!!this.ctx&&this.ctx.state==="running"}async start(){this.ctx||this._build(),this.ctx.state!=="running"&&await this.ctx.resume()}async suspend(){this.ctx&&this.ctx.state==="running"&&await this.ctx.suspend()}setMuted(e){this.muted=e,this.ctx&&this.master.gain.setTargetAtTime(e?0:.85,this.ctx.currentTime,.05)}_noiseBuffer(e,t){let r=this.ctx,s=Math.floor(e*r.sampleRate),o=r.createBuffer(1,s,r.sampleRate),n=o.getChannelData(0),i=0;for(let l=0;l<s;l++){let h=Math.random()*2-1;t?(i=(i+.02*h)/1.02,n[l]=i*3.5):n[l]=h}let c=Math.floor(.05*r.sampleRate);for(let l=0;l<c;l++){let h=l/c;n[l]=n[l]*h+n[s-c+l]*(1-h)}return o}_loop(e,t){let r=this.ctx.createBufferSource();r.buffer=e,r.loop=!0,r.loopEnd=e.duration-.05;let s=r;for(let o of t)s.connect(o),s=o;return s.connect(this.bus),r.start(),r}_build(){let e=this.ctx=new(window.AudioContext||window.webkitAudioContext);this.bus=e.createGain(),this.bus.gain.value=.9;let t=e.createDynamicsCompressor();t.threshold.value=-12,t.knee.value=8,t.ratio.value=16,t.attack.value=.002,t.release.value=.25,this.master=e.createGain(),this.master.gain.value=this.muted?0:.85,this.bus.connect(t).connect(this.master).connect(e.destination),this.white=this._noiseBuffer(3.7,!1),this.brown=this._noiseBuffer(5.3,!0);let r=(n,i,c=.7)=>{let l=e.createBiquadFilter();return l.type=n,l.frequency.value=i,l.Q.value=c,l},s=(n=0)=>{let i=e.createGain();return i.gain.value=n,i};this.windFilter=r("bandpass",420,.5),this.windGain=s(),this._loop(this.brown,[this.windFilter,this.windGain]),this.rumbleGain=s(),this._loop(this.brown,[r("lowpass",110),this.rumbleGain]),this.rainGain=s(),this._loop(this.white,[r("highpass",2600),r("lowpass",9500),this.rainGain]),this.hissFilter=r("bandpass",6200,1.4),this.hissGain=s(),this._loop(this.white,[this.hissFilter,this.hissGain]),this.humGain=s();let o=r("lowpass",420,.8);o.connect(this.humGain).connect(this.bus),this.humOsc=[];for(let[n,i,c,l]of[["sawtooth",1,-7,.5],["sawtooth",1,8,.5],["sine",2,0,.6]]){let h=e.createOscillator();h.type=n,h.frequency.value=50*i,h.detune.value=c;let u=s(l);h.connect(u).connect(o),h.start(),this.humOsc.push({o:h,mult:i})}}reset(){if(this.lastT=-1,this.lastEvent=-1,!this.ctx)return;let e=this.ctx.currentTime;for(let t of this.oneShots)try{t.gain.gain.cancelScheduledValues(e),t.gain.gain.setTargetAtTime(0,e,.02),t.src.stop(e+.15)}catch{}this.oneShots.clear()}_oneShot(e,t,r,s,o=Math.random()*2){let n=this.ctx,i=n.currentTime,c=n.createBufferSource();c.buffer=e,c.loop=!0;let l=n.createGain();l.gain.value=0;let h=c;for(let g of r)h.connect(g),h=g;h.connect(l).connect(this.bus),s(l.gain,i),c.start(i,o%(e.duration-.1)),c.stop(i+t);let u={src:c,gain:l};return this.oneShots.add(u),c.onended=()=>{this.oneShots.delete(u),l.disconnect()},u}_filter(e,t,r=.7){let s=this.ctx.createBiquadFilter();return s.type=e,s.frequency.value=t,s.Q.value=r,s}_stepTick(e){let t=.05+.2*e;this._oneShot(this.white,.12,[this._filter("bandpass",3200+Math.random()*2600,2.5)],(r,s)=>{r.setValueAtTime(0,s),r.linearRampToValueAtTime(t,s+.003),r.exponentialRampToValueAtTime(8e-4,s+.09)})}_crackAndThunder(){let e=this.ctx;this._oneShot(this.white,.6,[this._filter("highpass",1400)],(u,g)=>{u.setValueAtTime(0,g),u.linearRampToValueAtTime(.95,g+.002),u.exponentialRampToValueAtTime(.12,g+.07),u.exponentialRampToValueAtTime(.001,g+.5)}),this._oneShot(this.white,1.2,[this._filter("bandpass",260,.6)],(u,g)=>{u.setValueAtTime(0,g),u.linearRampToValueAtTime(.9,g+.006),u.exponentialRampToValueAtTime(.001,g+1)});let t=e.currentTime,r=e.createOscillator(),s=e.createGain();r.frequency.setValueAtTime(82,t),r.frequency.exponentialRampToValueAtTime(30,t+.5),s.gain.setValueAtTime(0,t),s.gain.linearRampToValueAtTime(.8,t+.01),s.gain.exponentialRampToValueAtTime(.001,t+.7),r.connect(s).connect(this.bus),r.start(t),r.stop(t+.8);let o={src:r,gain:s};this.oneShots.add(o),r.onended=()=>{this.oneShots.delete(o),s.disconnect()};let n=this._filter("lowpass",950,.5);n.frequency.setValueAtTime(950,t),n.frequency.exponentialRampToValueAtTime(85,t+6);let i=e.createDelay(1),c=e.createGain(),l=e.createGain();i.delayTime.value=.37,c.gain.value=.38,n.connect(l),n.connect(i),i.connect(c).connect(i),i.connect(l);let h=this._oneShot(this.brown,7.4,[n],(u,g)=>{let E=[[0,0],[.04,1],[.45,.45],[.85,.8],[1.5,.35],[2.2,.6],[3,.28],[3.7,.4],[4.8,.18],[5.6,.22],[7.2,1e-4]];u.setValueAtTime(0,g);for(let[p,d]of E)u.linearRampToValueAtTime(d*.95,g+p)});n.disconnect(h.gain),l.connect(h.gain)}update(e,t,r,s){if(!this.running)return;let o=this.ctx.currentTime,n=(L,O,N=.08)=>L.setTargetAtTime(O,o,N),i=t.strokeT,c=i>=0,l=r.inCloud,h=Math.min(1,r.velocity.length()/70),u=t.leaderProgress,g=G(0,1.2,e),E=1-G(S.total-1.6,S.total,e),p=c?1-.75*Math.exp(-i/.6):1,d=g*E;n(this.windGain.gain,d*p*_(.22,.12,l)*(.6+.9*h)*(.85+.15*Math.sin(e*.7)),.15),n(this.windFilter.frequency,_(520,260,l)+380*h,.2),n(this.rumbleGain.gain,d*p*_(.1,.5,l),.3),n(this.rainGain.gain,d*p*_(.085,.02,l)*(c?1.25:1),.2);let w=t.phase==="leader",v=t.phase==="intro"?G(S.leaderStart-2.5,S.leaderStart,e)*.25:0,x=Math.exp(-t.sinceBurst/.06);n(this.hissGain.gain,d*(w?.018+.05*u+.05*x:v*.03),.03),n(this.hissFilter.frequency,5200+2600*u,.1);let R=w?.05+.22*Math.pow(u,1.6):v*.1;n(this.humGain.gain,d*R*(.9+.1*Math.sin(e*17)),c?.02:.12);let P=48+74*Math.pow(u,1.4);for(let L of this.humOsc)n(L.o.frequency,P*L.mult,.15);if(this.lastT>=0&&e>this.lastT){if(w&&t.eventIndex>this.lastEvent&&t.eventIndex>=0){let L=s.events[t.eventIndex];this._stepTick(se(.25+.25*L.advance,0,1))}this.lastT<S.attach&&e>=S.attach&&this._crackAndThunder()}this.lastEvent=t.eventIndex,this.lastT=e}};var B=a=>document.getElementById(a),At={intro:"inside the cloud",leader:"leader descending",stroke:"return stroke",aftermath:"aftermath"},xe=class{constructor(e){this.h=e,this.el={veil:B("veil"),prep:B("prep"),prepFill:B("prep-fill"),prepLabel:B("prep-label"),start:B("start"),startLabel:B("start-label"),error:B("error"),hud:B("hud"),play:B("play"),iconPlay:B("icon-play"),iconPause:B("icon-pause"),restart:B("restart"),clock:B("clock"),phase:B("phase"),seed:B("seed"),reseed:B("reseed"),quality:B("quality"),mute:B("mute"),iconSound:B("icon-sound"),iconMuted:B("icon-muted"),scrubFill:B("scrub-fill"),scrubMark:B("scrub-mark"),stats:B("simstats")};let t=this.el;t.start.addEventListener("click",()=>this.h.start()),t.play.addEventListener("click",()=>this.h.togglePlay()),t.restart.addEventListener("click",()=>this.h.restart()),t.reseed.addEventListener("click",()=>this.h.setSeed(Math.random()*4294967296>>>0)),t.seed.addEventListener("change",()=>{let s=Number(t.seed.value);Number.isFinite(s)&&this.h.setSeed(Math.min(4294967295,Math.max(0,Math.floor(s)))>>>0)}),t.seed.addEventListener("keydown",s=>{s.key==="Enter"&&t.seed.blur(),s.stopPropagation()}),t.quality.addEventListener("change",()=>this.h.setQuality(t.quality.value)),t.mute.addEventListener("click",()=>this.h.toggleMute()),window.addEventListener("keydown",s=>{s.target instanceof HTMLInputElement||s.target instanceof HTMLSelectElement||(s.code==="Space"?(s.preventDefault(),this.h.togglePlay()):s.key==="r"||s.key==="R"?this.h.restart():(s.key==="m"||s.key==="M")&&this.h.toggleMute())}),this.idleTimer=0,this.playing=!1;let r=()=>this._wake();window.addEventListener("pointermove",r,{passive:!0}),window.addEventListener("pointerdown",r,{passive:!0}),window.addEventListener("keydown",r)}_wake(){this.el.hud.classList.remove("idle"),clearTimeout(this.idleTimer),this.playing&&(this.idleTimer=setTimeout(()=>this.el.hud.classList.add("idle"),2600))}setSeed(e){this.el.seed.value=String(e)}setQuality(e){this.el.quality.value=e}setMuted(e){this.el.iconSound.hidden=e,this.el.iconMuted.hidden=!e,this.el.mute.setAttribute("aria-pressed",String(e)),this.el.mute.setAttribute("aria-label",e?"Unmute sound":"Mute sound")}showPreparing(e){let t=this.el;t.error.hidden=!0,t.prep.hidden=!1,t.start.hidden=!0,t.prepFill.style.width="0%",t.prepLabel.textContent="Starting the simulation",e||t.veil.classList.remove("gone"),t.phase.textContent="preparing"}setProgress(e,t){let r=this.el;r.prepFill.style.width=`${Math.round(t*100)}%`;let s=e==="field"?"Solving the electric potential field":"Growing the leader toward the ground";r.prepLabel.textContent=`${s}  ${Math.round(t*100)}%`,r.phase.textContent=`preparing ${Math.round(t*100)}%`}showReady(e="Play"){let t=this.el;t.prep.hidden=!0,t.start.hidden=!1,t.startLabel.textContent=e,t.phase.textContent="ready"}hideVeil(){this.el.veil.classList.add("gone")}showError(e){let t=this.el;t.veil.classList.remove("gone"),t.prep.hidden=!0,t.error.hidden=!1,t.error.textContent=e}setPlaying(e){this.playing=e,this.el.iconPlay.hidden=e,this.el.iconPause.hidden=!e,this.el.play.setAttribute("aria-label",e?"Pause":"Play"),this._wake()}setTime(e,t,r,s){let o=this.el;o.clock.textContent=`${e.toFixed(1)} / ${t.toFixed(1)}`,o.phase.textContent=e>=t?"end":At[r]||"",o.scrubFill.style.width=`${100*e/t}%`,o.scrubMark.style.left=`${100*s/t}%`}setStats(e){this.el.stats.textContent=e}};var ne=new URLSearchParams(location.search),f={seed:ne.has("seed")?Number(ne.get("seed"))>>>0:1787,quality:te[ne.get("q")]?ne.get("q"):Math.min(screen.width,screen.height)<700?"low":"medium",t:0,playing:!1,started:!1,ready:!1,bolt:null,timeline:null,dirty:!0,frames:0,errors:[]},_t=document.getElementById("view"),X;try{X=new ge(_t)}catch(a){throw document.getElementById("error").hidden=!1,document.getElementById("error").textContent="WebGL 2 is not available in this browser, so the scene cannot be drawn.",document.getElementById("prep").hidden=!0,a}var le=new we(X.camera),j=new ye,at=new me({useWorker:ne.get("worker")!=="0"}),Pe=a=>f.timeline.evaluate(a),F=new xe({start:()=>ce(f.t>=S.total?0:f.t),togglePlay:()=>{f.ready&&(f.playing?he():ce(f.t>=S.total?0:f.t))},restart:()=>{f.ready&&ce(0)},setSeed:a=>{f.seed=a,Ee()},setQuality:a=>{f.quality=a,X.setQuality(a),Ee()},toggleMute:()=>{j.setMuted(!j.muted),F.setMuted(j.muted)}});F.setSeed(f.seed);F.setQuality(f.quality);X.setQuality(f.quality);async function Ee(){let a=f.started;he(),f.ready=!1,F.setSeed(f.seed),F.showPreparing(f.started);let[e,t,r]=te[f.quality].grid,s;try{s=await at.prepare({seed:f.seed,nx:e,ny:t,nz:r},c=>F.setProgress(c.phase,c.progress))}catch(c){if(c.superseded)return;f.errors.push(String(c.message||c)),F.showError(`The simulation could not run: ${c.message||c}`);return}let o=Ve(s),n=Ue(o.strike[0],o.strike[2]);f.bolt=o,f.timeline=We(o),X.setBolt(o,n),le.setBolt(o,f.timeline,n),j.reset(),f.t=0,f.ready=!0,f.dirty=!0;let i=s.stats;F.setStats(`C++ / WebAssembly simulation: ${i.nx}x${i.ny}x${i.nz} potential grid, ${i.nodes.toLocaleString()} channel cells in ${i.totalSteps.toLocaleString()} growth steps, ${i.mainNodes} on the main channel, ${i.stallEvents} stall recoveries, ${i.groundNodes} ground discharge cells, ${Math.round(i.computeMs)} ms `+(i.thread==="worker"?"in a Web Worker":"on the main thread (no worker available)")),F.setTime(0,S.total,"intro",S.attach),a?ce(0):F.showReady("Play")}function ce(a){f.ready&&(f.started=!0,(a!==f.t||a===0)&&(f.t=a,j.reset()),f.playing=!0,f.lastNow=performance.now(),j.start().catch(e=>f.errors.push(`audio: ${e.message||e}`)),F.hideVeil(),F.setPlaying(!0))}function he(){f.playing=!1,j.suspend(),F.setPlaying(!1),f.dirty=!0}function it(a){if(requestAnimationFrame(it),!f.ready)return;if(f.playing){let t=Math.min(.1,Math.max(0,(a-f.lastNow)/1e3));f.lastNow=a,f.t+=t,f.t>=S.total&&(f.t=S.total,he(),F.showReady("Replay"),document.getElementById("veil").classList.remove("gone")),f.dirty=!0}if(!f.dirty)return;f.dirty=!1;let e=Pe(f.t);le.update(f.t,Pe),X.render(f.t,e,le),f.playing&&j.update(f.t,e,le,f.timeline),F.setTime(f.t,S.total,e.phase,S.attach),f.frames++}window.addEventListener("resize",()=>{X.resize(),f.dirty=!0});document.addEventListener("visibilitychange",()=>{document.hidden&&f.playing&&he()});window.addEventListener("error",a=>f.errors.push(String(a.message)));window.addEventListener("unhandledrejection",a=>f.errors.push(String(a.reason&&a.reason.message||a.reason)));window.__ride={app:f,TIMES:S,renderer:X,rig:le,audio:j,sim:at,seek(a){f.t=Math.max(0,Math.min(S.total,a)),j.reset(),f.dirty=!0},play:ce,pause:he,prepare:Ee,state:()=>f.timeline?Pe(f.t):null};X.resize();Ee();requestAnimationFrame(it);
