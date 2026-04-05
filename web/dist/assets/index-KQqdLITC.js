var Vl=Object.defineProperty;var Xo=t=>{throw TypeError(t)};var Jl=(t,n,r)=>n in t?Vl(t,n,{enumerable:!0,configurable:!0,writable:!0,value:r}):t[n]=r;var mn=(t,n,r)=>Jl(t,typeof n!="symbol"?n+"":n,r),Da=(t,n,r)=>n.has(t)||Xo("Cannot "+r);var F=(t,n,r)=>(Da(t,n,"read from private field"),r?r.call(t):n.get(t)),gt=(t,n,r)=>n.has(t)?Xo("Cannot add the same private member more than once"):n instanceof WeakSet?n.add(t):n.set(t,r),bt=(t,n,r,a)=>(Da(t,n,"write to private field"),a?a.call(t,r):n.set(t,r),r),Ft=(t,n,r)=>(Da(t,n,"access private method"),r);(function(){const n=document.createElement("link").relList;if(n&&n.supports&&n.supports("modulepreload"))return;for(const o of document.querySelectorAll('link[rel="modulepreload"]'))a(o);new MutationObserver(o=>{for(const s of o)if(s.type==="childList")for(const i of s.addedNodes)i.tagName==="LINK"&&i.rel==="modulepreload"&&a(i)}).observe(document,{childList:!0,subtree:!0});function r(o){const s={};return o.integrity&&(s.integrity=o.integrity),o.referrerPolicy&&(s.referrerPolicy=o.referrerPolicy),o.crossOrigin==="use-credentials"?s.credentials="include":o.crossOrigin==="anonymous"?s.credentials="omit":s.credentials="same-origin",s}function a(o){if(o.ep)return;o.ep=!0;const s=r(o);fetch(o.href,s)}})();const Zl=!1;var ko=Array.isArray,Kl=Array.prototype.indexOf,Or=Array.prototype.includes,Fa=Array.from,Si=Object.defineProperty,ar=Object.getOwnPropertyDescriptor,Ci=Object.getOwnPropertyDescriptors,Ql=Object.prototype,es=Array.prototype,So=Object.getPrototypeOf,Vo=Object.isExtensible;function Xr(t){return typeof t=="function"}const Wn=()=>{};function ts(t){return t()}function Ma(t){for(var n=0;n<t.length;n++)t[n]()}function Mi(){var t,n,r=new Promise((a,o)=>{t=a,n=o});return{promise:r,resolve:t,reject:n}}function ns(t,n){if(Array.isArray(t))return t;if(!(Symbol.iterator in t))return Array.from(t);const r=[];for(const a of t)if(r.push(a),r.length===n)break;return r}const Ht=2,Rr=4,da=8,Co=1<<24,Xn=16,Sn=32,wr=64,ro=128,pn=512,qt=1024,Yt=2048,On=4096,on=8192,dn=16384,Mr=32768,ao=1<<25,Vn=65536,oo=1<<17,rs=1<<18,Hr=1<<19,Ti=1<<20,Fn=1<<25,kr=65536,io=1<<21,Aa=1<<22,or=1<<23,An=Symbol("$state"),Pi=Symbol("legacy props"),as=Symbol(""),Ln=new class extends Error{constructor(){super(...arguments);mn(this,"name","StaleReactionError");mn(this,"message","The reaction that called `getAbortSignal()` was re-run or destroyed")}};var yi;const Mo=!!((yi=globalThis.document)!=null&&yi.contentType)&&globalThis.document.contentType.includes("xml");function os(t){throw new Error("https://svelte.dev/e/lifecycle_outside_component")}function is(){throw new Error("https://svelte.dev/e/async_derived_orphan")}function ls(t,n,r){throw new Error("https://svelte.dev/e/each_key_duplicate")}function ss(t){throw new Error("https://svelte.dev/e/effect_in_teardown")}function cs(){throw new Error("https://svelte.dev/e/effect_in_unowned_derived")}function us(t){throw new Error("https://svelte.dev/e/effect_orphan")}function ds(){throw new Error("https://svelte.dev/e/effect_update_depth_exceeded")}function vs(t){throw new Error("https://svelte.dev/e/props_invalid_value")}function fs(){throw new Error("https://svelte.dev/e/state_descriptors_fixed")}function ps(){throw new Error("https://svelte.dev/e/state_prototype_fixed")}function gs(){throw new Error("https://svelte.dev/e/state_unsafe_mutation")}function hs(){throw new Error("https://svelte.dev/e/svelte_boundary_reset_onerror")}const _s=1,bs=2,Ii=4,ms=8,$s=16,xs=1,ys=2,Ei=4,ws=8,ks=16,Ss=1,Cs=2,Dt=Symbol(),zi="http://www.w3.org/1999/xhtml",Ms="http://www.w3.org/2000/svg",Ts="@attach";function Ps(){console.warn("https://svelte.dev/e/select_multiple_invalid_value")}function Is(){console.warn("https://svelte.dev/e/svelte_boundary_reset_noop")}function Ni(t){return t===this.v}function Fi(t,n){return t!=t?n==n:t!==n||t!==null&&typeof t=="object"||typeof t=="function"}function Ai(t){return!Fi(t,this.v)}let Gr=!1,Es=!1;function zs(){Gr=!0}let jt=null;function Lr(t){jt=t}function wt(t,n=!1,r){jt={p:jt,i:!1,c:null,e:null,s:t,x:null,r:_t,l:Gr&&!n?{s:null,u:null,$:[]}:null}}function kt(t){var n=jt,r=n.e;if(r!==null){n.e=null;for(var a of r)ll(a)}return t!==void 0&&(n.x=t),n.i=!0,jt=n.p,t??{}}function Wr(){return!Gr||jt!==null&&jt.l===null}let pr=[];function ji(){var t=pr;pr=[],Ma(t)}function Un(t){if(pr.length===0&&!ea){var n=pr;queueMicrotask(()=>{n===pr&&ji()})}pr.push(t)}function Ns(){for(;pr.length>0;)ji()}function Oi(t){var n=_t;if(n===null)return ht.f|=or,t;if((n.f&Mr)===0&&(n.f&Rr)===0)throw t;rr(t,n)}function rr(t,n){for(;n!==null;){if((n.f&ro)!==0){if((n.f&Mr)===0)throw t;try{n.b.error(t);return}catch(r){t=r}}n=n.parent}throw t}const Fs=-7169;function Ot(t,n){t.f=t.f&Fs|n}function To(t){(t.f&pn)!==0||t.deps===null?Ot(t,qt):Ot(t,On)}function Ri(t){if(t!==null)for(const n of t)(n.f&Ht)===0||(n.f&kr)===0||(n.f^=kr,Ri(n.deps))}function Li(t,n,r){(t.f&Yt)!==0?n.add(t):(t.f&On)!==0&&r.add(t),Ri(t.deps),Ot(t,qt)}function Po(t,n,r){if(t==null)return n(void 0),r&&r(void 0),Wn;const a=Jn(()=>t.subscribe(n,r));return a.unsubscribe?()=>a.unsubscribe():a}const Pr=[];function As(t,n){return{subscribe:bn(t,n).subscribe}}function bn(t,n=Wn){let r=null;const a=new Set;function o(c){if(Fi(t,c)&&(t=c,r)){const l=!Pr.length;for(const u of a)u[1](),Pr.push(u,t);if(l){for(let u=0;u<Pr.length;u+=2)Pr[u][0](Pr[u+1]);Pr.length=0}}}function s(c){o(c(t))}function i(c,l=Wn){const u=[c,l];return a.add(u),a.size===1&&(r=n(o,s)||Wn),c(t),()=>{a.delete(u),a.size===0&&r&&(r(),r=null)}}return{set:o,update:s,subscribe:i}}function qi(t,n,r){const a=!Array.isArray(t),o=a?[t]:t;if(!o.every(Boolean))throw new Error("derived() expects stores as input, got a falsy value");const s=n.length<2;return As(r,(i,c)=>{let l=!1;const u=[];let f=0,m=Wn;const _=()=>{if(f)return;m();const g=n(a?u[0]:u,i,c);s?i(g):m=typeof g=="function"?g:Wn},p=o.map((g,$)=>Po(g,w=>{u[$]=w,f&=~(1<<$),l&&_()},()=>{f|=1<<$}));return l=!0,_(),function(){Ma(p),m(),l=!1}})}function tn(t){let n;return Po(t,r=>n=r)(),n}let _a=!1,lo=Symbol();function Nt(t,n,r){const a=r[n]??(r[n]={store:null,source:Zi(void 0),unsubscribe:Wn});if(a.store!==t&&!(lo in r))if(a.unsubscribe(),a.store=t??null,t==null)a.source.v=void 0,a.unsubscribe=Wn;else{var o=!0;a.unsubscribe=Po(t,s=>{o?a.source.v=s:b(a.source,s)}),o=!1}return t&&lo in r?tn(t):e(a.source)}function cr(){const t={};function n(){pa(()=>{for(var r in t)t[r].unsubscribe();Si(t,lo,{enumerable:!1,value:!0})})}return[t,n]}function js(t){var n=_a;try{return _a=!1,[t(),_a]}finally{_a=n}}const Kn=new Set;let Qe=null,Ut=null,so=null,ea=!1,Ha=!1,Er=null,xa=null;var Jo=0;let Os=1;var Nr,Fr,qn,Tn,oa,sn,ia,tr,Bn,Pn,Ar,_r,Rt,ya,Bi,wa,co,uo,Di;const Ea=class Ea{constructor(){gt(this,Rt);mn(this,"id",Os++);mn(this,"current",new Map);mn(this,"previous",new Map);gt(this,Nr,new Set);gt(this,Fr,new Set);gt(this,qn,new Map);gt(this,Tn,new Map);gt(this,oa,null);gt(this,sn,[]);gt(this,ia,[]);gt(this,tr,new Set);gt(this,Bn,new Set);gt(this,Pn,new Map);mn(this,"is_fork",!1);gt(this,Ar,!1);gt(this,_r,new Set)}skip_effect(n){F(this,Pn).has(n)||F(this,Pn).set(n,{d:[],m:[]})}unskip_effect(n){var r=F(this,Pn).get(n);if(r){F(this,Pn).delete(n);for(var a of r.d)Ot(a,Yt),this.schedule(a);for(a of r.m)Ot(a,On),this.schedule(a)}}capture(n,r,a=!1){r!==Dt&&!this.previous.has(n)&&this.previous.set(n,r),(n.f&or)===0&&(this.current.set(n,[n.v,a]),Ut==null||Ut.set(n,n.v))}activate(){Qe=this}deactivate(){Qe=null,Ut=null}flush(){try{Ha=!0,Qe=this,Ft(this,Rt,wa).call(this)}finally{Jo=0,so=null,Er=null,xa=null,Ha=!1,Qe=null,Ut=null,ir.clear()}}discard(){for(const n of F(this,Fr))n(this);F(this,Fr).clear(),Kn.delete(this)}register_created_effect(n){F(this,ia).push(n)}increment(n,r){let a=F(this,qn).get(r)??0;if(F(this,qn).set(r,a+1),n){let o=F(this,Tn).get(r)??0;F(this,Tn).set(r,o+1)}}decrement(n,r,a){let o=F(this,qn).get(r)??0;if(o===1?F(this,qn).delete(r):F(this,qn).set(r,o-1),n){let s=F(this,Tn).get(r)??0;s===1?F(this,Tn).delete(r):F(this,Tn).set(r,s-1)}F(this,Ar)||a||(bt(this,Ar,!0),Un(()=>{bt(this,Ar,!1),this.flush()}))}transfer_effects(n,r){for(const a of n)F(this,tr).add(a);for(const a of r)F(this,Bn).add(a);n.clear(),r.clear()}oncommit(n){F(this,Nr).add(n)}ondiscard(n){F(this,Fr).add(n)}settled(){return(F(this,oa)??bt(this,oa,Mi())).promise}static ensure(){if(Qe===null){const n=Qe=new Ea;Ha||(Kn.add(Qe),ea||Un(()=>{Qe===n&&n.flush()}))}return Qe}apply(){{Ut=null;return}}schedule(n){var o;if(so=n,(o=n.b)!=null&&o.is_pending&&(n.f&(Rr|da|Co))!==0&&(n.f&Mr)===0){n.b.defer_effect(n);return}for(var r=n;r.parent!==null;){r=r.parent;var a=r.f;if(Er!==null&&r===_t&&(ht===null||(ht.f&Ht)===0))return;if((a&(wr|Sn))!==0){if((a&qt)===0)return;r.f^=qt}}F(this,sn).push(r)}};Nr=new WeakMap,Fr=new WeakMap,qn=new WeakMap,Tn=new WeakMap,oa=new WeakMap,sn=new WeakMap,ia=new WeakMap,tr=new WeakMap,Bn=new WeakMap,Pn=new WeakMap,Ar=new WeakMap,_r=new WeakMap,Rt=new WeakSet,ya=function(){return this.is_fork||F(this,Tn).size>0},Bi=function(){for(const a of F(this,_r))for(const o of F(a,Tn).keys()){for(var n=!1,r=o;r.parent!==null;){if(F(this,Pn).has(r)){n=!0;break}r=r.parent}if(!n)return!0}return!1},wa=function(){var c,l;if(Jo++>1e3&&(Kn.delete(this),Ls()),!Ft(this,Rt,ya).call(this)){for(const u of F(this,tr))F(this,Bn).delete(u),Ot(u,Yt),this.schedule(u);for(const u of F(this,Bn))Ot(u,On),this.schedule(u)}const n=F(this,sn);bt(this,sn,[]),this.apply();var r=Er=[],a=[],o=xa=[];for(const u of n)try{Ft(this,Rt,co).call(this,u,r,a)}catch(f){throw Wi(u),f}if(Qe=null,o.length>0){var s=Ea.ensure();for(const u of o)s.schedule(u)}if(Er=null,xa=null,Ft(this,Rt,ya).call(this)||Ft(this,Rt,Bi).call(this)){Ft(this,Rt,uo).call(this,a),Ft(this,Rt,uo).call(this,r);for(const[u,f]of F(this,Pn))Gi(u,f)}else{F(this,qn).size===0&&Kn.delete(this),F(this,tr).clear(),F(this,Bn).clear();for(const u of F(this,Nr))u(this);F(this,Nr).clear(),Zo(a),Zo(r),(c=F(this,oa))==null||c.resolve()}var i=Qe;if(F(this,sn).length>0){const u=i??(i=this);F(u,sn).push(...F(this,sn).filter(f=>!F(u,sn).includes(f)))}i!==null&&(Kn.add(i),Ft(l=i,Rt,wa).call(l)),Kn.has(this)||Ft(this,Rt,Di).call(this)},co=function(n,r,a){n.f^=qt;for(var o=n.first;o!==null;){var s=o.f,i=(s&(Sn|wr))!==0,c=i&&(s&qt)!==0,l=c||(s&on)!==0||F(this,Pn).has(o);if(!l&&o.fn!==null){i?o.f^=qt:(s&Rr)!==0?r.push(o):ga(o)&&((s&Xn)!==0&&F(this,Bn).add(o),Dr(o));var u=o.first;if(u!==null){o=u;continue}}for(;o!==null;){var f=o.next;if(f!==null){o=f;break}o=o.parent}}},uo=function(n){for(var r=0;r<n.length;r+=1)Li(n[r],F(this,tr),F(this,Bn))},Di=function(){var f,m,_;for(const p of Kn){var n=p.id<this.id,r=[];for(const[g,[$,w]]of this.current){if(p.current.has(g)){var a=p.current.get(g)[0];if(n&&$!==a)p.current.set(g,[$,w]);else continue}r.push(g)}var o=[...p.current.keys()].filter(g=>!this.current.has(g));if(o.length===0)n&&p.discard();else if(r.length>0){p.activate();var s=new Set,i=new Map;for(var c of r)Hi(c,o,s,i);i=new Map;var l=[...p.current.keys()].filter(g=>this.current.has(g)?this.current.get(g)[0]!==g:!0);for(const g of F(this,ia))(g.f&(dn|on|oo))===0&&Io(g,l,i)&&((g.f&(Aa|Xn))!==0?(Ot(g,Yt),p.schedule(g)):F(p,tr).add(g));if(F(p,sn).length>0){p.apply();for(var u of F(p,sn))Ft(f=p,Rt,co).call(f,u,[],[]);bt(p,sn,[])}p.deactivate()}}for(const p of Kn)F(p,_r).has(this)&&(F(p,_r).delete(this),F(p,_r).size===0&&!Ft(m=p,Rt,ya).call(m)&&(p.activate(),Ft(_=p,Rt,wa).call(_)))};let Sr=Ea;function Rs(t){var n=ea;ea=!0;try{for(var r;;){if(Ns(),Qe===null)return r;Qe.flush()}}finally{ea=n}}function Ls(){try{ds()}catch(t){rr(t,so)}}let $n=null;function Zo(t){var n=t.length;if(n!==0){for(var r=0;r<n;){var a=t[r++];if((a.f&(dn|on))===0&&ga(a)&&($n=new Set,Dr(a),a.deps===null&&a.first===null&&a.nodes===null&&a.teardown===null&&a.ac===null&&ul(a),($n==null?void 0:$n.size)>0)){ir.clear();for(const o of $n){if((o.f&(dn|on))!==0)continue;const s=[o];let i=o.parent;for(;i!==null;)$n.has(i)&&($n.delete(i),s.push(i)),i=i.parent;for(let c=s.length-1;c>=0;c--){const l=s[c];(l.f&(dn|on))===0&&Dr(l)}}$n.clear()}}$n=null}}function Hi(t,n,r,a){if(!r.has(t)&&(r.add(t),t.reactions!==null))for(const o of t.reactions){const s=o.f;(s&Ht)!==0?Hi(o,n,r,a):(s&(Aa|Xn))!==0&&(s&Yt)===0&&Io(o,n,a)&&(Ot(o,Yt),Eo(o))}}function Io(t,n,r){const a=r.get(t);if(a!==void 0)return a;if(t.deps!==null)for(const o of t.deps){if(Or.call(n,o))return!0;if((o.f&Ht)!==0&&Io(o,n,r))return r.set(o,!0),!0}return r.set(t,!1),!1}function Eo(t){Qe.schedule(t)}function Gi(t,n){if(!((t.f&Sn)!==0&&(t.f&qt)!==0)){(t.f&Yt)!==0?n.d.push(t):(t.f&On)!==0&&n.m.push(t),Ot(t,qt);for(var r=t.first;r!==null;)Gi(r,n),r=r.next}}function Wi(t){Ot(t,qt);for(var n=t.first;n!==null;)Wi(n),n=n.next}function qs(t){let n=0,r=lr(0),a;return()=>{Fo()&&(e(r),Ao(()=>(n===0&&(a=Jn(()=>t(()=>ta(r)))),n+=1,()=>{Un(()=>{n-=1,n===0&&(a==null||a(),a=void 0,ta(r))})})))}}var Bs=Vn|Hr;function Ds(t,n,r,a){new Hs(t,n,r,a)}var fn,wo,In,br,nn,En,cn,xn,Dn,mr,nr,jr,la,sa,Hn,za,Bt,Gs,Ws,Us,vo,ka,Sa,fo;class Hs{constructor(n,r,a,o){gt(this,Bt);mn(this,"parent");mn(this,"is_pending",!1);mn(this,"transform_error");gt(this,fn);gt(this,wo,null);gt(this,In);gt(this,br);gt(this,nn);gt(this,En,null);gt(this,cn,null);gt(this,xn,null);gt(this,Dn,null);gt(this,mr,0);gt(this,nr,0);gt(this,jr,!1);gt(this,la,new Set);gt(this,sa,new Set);gt(this,Hn,null);gt(this,za,qs(()=>(bt(this,Hn,lr(F(this,mr))),()=>{bt(this,Hn,null)})));var s;bt(this,fn,n),bt(this,In,r),bt(this,br,i=>{var c=_t;c.b=this,c.f|=ro,a(i)}),this.parent=_t.b,this.transform_error=o??((s=this.parent)==null?void 0:s.transform_error)??(i=>i),bt(this,nn,Tr(()=>{Ft(this,Bt,vo).call(this)},Bs))}defer_effect(n){Li(n,F(this,la),F(this,sa))}is_rendered(){return!this.is_pending&&(!this.parent||this.parent.is_rendered())}has_pending_snippet(){return!!F(this,In).pending}update_pending_count(n,r){Ft(this,Bt,fo).call(this,n,r),bt(this,mr,F(this,mr)+n),!(!F(this,Hn)||F(this,jr))&&(bt(this,jr,!0),Un(()=>{bt(this,jr,!1),F(this,Hn)&&qr(F(this,Hn),F(this,mr))}))}get_effect_pending(){return F(this,za).call(this),e(F(this,Hn))}error(n){var r=F(this,In).onerror;let a=F(this,In).failed;if(!r&&!a)throw n;F(this,En)&&(Vt(F(this,En)),bt(this,En,null)),F(this,cn)&&(Vt(F(this,cn)),bt(this,cn,null)),F(this,xn)&&(Vt(F(this,xn)),bt(this,xn,null));var o=!1,s=!1;const i=()=>{if(o){Is();return}o=!0,s&&hs(),F(this,xn)!==null&&xr(F(this,xn),()=>{bt(this,xn,null)}),Ft(this,Bt,Sa).call(this,()=>{Ft(this,Bt,vo).call(this)})},c=l=>{try{s=!0,r==null||r(l,i),s=!1}catch(u){rr(u,F(this,nn)&&F(this,nn).parent)}a&&bt(this,xn,Ft(this,Bt,Sa).call(this,()=>{try{return an(()=>{var u=_t;u.b=this,u.f|=ro,a(F(this,fn),()=>l,()=>i)})}catch(u){return rr(u,F(this,nn).parent),null}}))};Un(()=>{var l;try{l=this.transform_error(n)}catch(u){rr(u,F(this,nn)&&F(this,nn).parent);return}l!==null&&typeof l=="object"&&typeof l.then=="function"?l.then(c,u=>rr(u,F(this,nn)&&F(this,nn).parent)):c(l)})}}fn=new WeakMap,wo=new WeakMap,In=new WeakMap,br=new WeakMap,nn=new WeakMap,En=new WeakMap,cn=new WeakMap,xn=new WeakMap,Dn=new WeakMap,mr=new WeakMap,nr=new WeakMap,jr=new WeakMap,la=new WeakMap,sa=new WeakMap,Hn=new WeakMap,za=new WeakMap,Bt=new WeakSet,Gs=function(){try{bt(this,En,an(()=>F(this,br).call(this,F(this,fn))))}catch(n){this.error(n)}},Ws=function(n){const r=F(this,In).failed;r&&bt(this,xn,an(()=>{r(F(this,fn),()=>n,()=>()=>{})}))},Us=function(){const n=F(this,In).pending;n&&(this.is_pending=!0,bt(this,cn,an(()=>n(F(this,fn)))),Un(()=>{var r=bt(this,Dn,document.createDocumentFragment()),a=Yn();r.append(a),bt(this,En,Ft(this,Bt,Sa).call(this,()=>an(()=>F(this,br).call(this,a)))),F(this,nr)===0&&(F(this,fn).before(r),bt(this,Dn,null),xr(F(this,cn),()=>{bt(this,cn,null)}),Ft(this,Bt,ka).call(this,Qe))}))},vo=function(){try{if(this.is_pending=this.has_pending_snippet(),bt(this,nr,0),bt(this,mr,0),bt(this,En,an(()=>{F(this,br).call(this,F(this,fn))})),F(this,nr)>0){var n=bt(this,Dn,document.createDocumentFragment());Ro(F(this,En),n);const r=F(this,In).pending;bt(this,cn,an(()=>r(F(this,fn))))}else Ft(this,Bt,ka).call(this,Qe)}catch(r){this.error(r)}},ka=function(n){this.is_pending=!1,n.transfer_effects(F(this,la),F(this,sa))},Sa=function(n){var r=_t,a=ht,o=jt;_n(F(this,nn)),hn(F(this,nn)),Lr(F(this,nn).ctx);try{return Sr.ensure(),n()}catch(s){return Oi(s),null}finally{_n(r),hn(a),Lr(o)}},fo=function(n,r){var a;if(!this.has_pending_snippet()){this.parent&&Ft(a=this.parent,Bt,fo).call(a,n,r);return}bt(this,nr,F(this,nr)+n),F(this,nr)===0&&(Ft(this,Bt,ka).call(this,r),F(this,cn)&&xr(F(this,cn),()=>{bt(this,cn,null)}),F(this,Dn)&&(F(this,fn).before(F(this,Dn)),bt(this,Dn,null)))};function Ui(t,n,r,a){const o=Wr()?va:zo;var s=t.filter(_=>!_.settled);if(r.length===0&&s.length===0){a(n.map(o));return}var i=_t,c=Ys(),l=s.length===1?s[0].promise:s.length>1?Promise.all(s.map(_=>_.promise)):null;function u(_){c();try{a(_)}catch(p){(i.f&dn)===0&&rr(p,i)}Ta()}if(r.length===0){l.then(()=>u(n.map(o)));return}var f=Yi();function m(){Promise.all(r.map(_=>Xs(_))).then(_=>u([...n.map(o),..._])).catch(_=>rr(_,i)).finally(()=>f())}l?l.then(()=>{c(),m(),Ta()}):m()}function Ys(){var t=_t,n=ht,r=jt,a=Qe;return function(s=!0){_n(t),hn(n),Lr(r),s&&(t.f&dn)===0&&(a==null||a.activate(),a==null||a.apply())}}function Ta(t=!0){_n(null),hn(null),Lr(null),t&&(Qe==null||Qe.deactivate())}function Yi(){var t=_t,n=t.b,r=Qe,a=n.is_rendered();return n.update_pending_count(1,r),r.increment(a,t),(o=!1)=>{n.update_pending_count(-1,r),r.decrement(a,t,o)}}function va(t){var n=Ht|Yt,r=ht!==null&&(ht.f&Ht)!==0?ht:null;return _t!==null&&(_t.f|=Hr),{ctx:jt,deps:null,effects:null,equals:Ni,f:n,fn:t,reactions:null,rv:0,v:Dt,wv:0,parent:r??_t,ac:null}}function Xs(t,n,r){let a=_t;a===null&&is();var o=void 0,s=lr(Dt),i=!ht,c=new Map;return ic(()=>{var p;var l=_t,u=Mi();o=u.promise;try{Promise.resolve(t()).then(u.resolve,u.reject).finally(Ta)}catch(g){u.reject(g),Ta()}var f=Qe;if(i){if((l.f&Mr)!==0)var m=Yi();if(a.b.is_rendered())(p=c.get(f))==null||p.reject(Ln),c.delete(f);else{for(const g of c.values())g.reject(Ln);c.clear()}c.set(f,u)}const _=(g,$=void 0)=>{if(m){var w=$===Ln;m(w)}if(!($===Ln||(l.f&dn)!==0)){if(f.activate(),$)s.f|=or,qr(s,$);else{(s.f&or)!==0&&(s.f^=or),qr(s,g);for(const[k,L]of c){if(c.delete(k),k===f)break;L.reject(Ln)}}f.deactivate()}};u.promise.then(_,g=>_(null,g||"unknown"))}),pa(()=>{for(const l of c.values())l.reject(Ln)}),new Promise(l=>{function u(f){function m(){f===o?l(s):u(o)}f.then(m,m)}u(o)})}function S(t){const n=va(t);return fl(n),n}function zo(t){const n=va(t);return n.equals=Ai,n}function Vs(t){var n=t.effects;if(n!==null){t.effects=null;for(var r=0;r<n.length;r+=1)Vt(n[r])}}function Js(t){for(var n=t.parent;n!==null;){if((n.f&Ht)===0)return(n.f&dn)===0?n:null;n=n.parent}return null}function No(t){var n,r=_t;_n(Js(t));try{t.f&=~kr,Vs(t),n=_l(t)}finally{_n(r)}return n}function Xi(t){var n=t.v,r=No(t);if(!t.equals(r)&&(t.wv=gl(),(!(Qe!=null&&Qe.is_fork)||t.deps===null)&&(t.v=r,Qe==null||Qe.capture(t,n,!0),t.deps===null))){Ot(t,qt);return}sr||(Ut!==null?(Fo()||Qe!=null&&Qe.is_fork)&&Ut.set(t,r):To(t))}function Zs(t){var n,r;if(t.effects!==null)for(const a of t.effects)(a.teardown||a.ac)&&((n=a.teardown)==null||n.call(a),(r=a.ac)==null||r.abort(Ln),a.teardown=Wn,a.ac=null,ra(a,0),jo(a))}function Vi(t){if(t.effects!==null)for(const n of t.effects)n.teardown&&Dr(n)}let po=new Set;const ir=new Map;let Ji=!1;function lr(t,n){var r={f:0,v:t,reactions:null,equals:Ni,rv:0,wv:0};return r}function Z(t,n){const r=lr(t);return fl(r),r}function Zi(t,n=!1,r=!0){var o;const a=lr(t);return n||(a.equals=Ai),Gr&&r&&jt!==null&&jt.l!==null&&((o=jt.l).s??(o.s=[])).push(a),a}function b(t,n,r=!1){ht!==null&&(!kn||(ht.f&oo)!==0)&&Wr()&&(ht.f&(Ht|Xn|Aa|oo))!==0&&(gn===null||!Or.call(gn,t))&&gs();let a=r?At(n):n;return qr(t,a,xa)}function qr(t,n,r=null){if(!t.equals(n)){var a=t.v;sr?ir.set(t,n):ir.set(t,a),t.v=n;var o=Sr.ensure();if(o.capture(t,a),(t.f&Ht)!==0){const s=t;(t.f&Yt)!==0&&No(s),Ut===null&&To(s)}t.wv=gl(),Ki(t,Yt,r),Wr()&&_t!==null&&(_t.f&qt)!==0&&(_t.f&(Sn|wr))===0&&(vn===null?cc([t]):vn.push(t)),!o.is_fork&&po.size>0&&!Ji&&Ks()}return n}function Ks(){Ji=!1;for(const t of po)(t.f&qt)!==0&&Ot(t,On),ga(t)&&Dr(t);po.clear()}function Ko(t,n=1){var r=e(t),a=n===1?r++:r--;return b(t,r),a}function ta(t){b(t,t.v+1)}function Ki(t,n,r){var a=t.reactions;if(a!==null)for(var o=Wr(),s=a.length,i=0;i<s;i++){var c=a[i],l=c.f;if(!(!o&&c===_t)){var u=(l&Yt)===0;if(u&&Ot(c,n),(l&Ht)!==0){var f=c;Ut==null||Ut.delete(f),(l&kr)===0&&(l&pn&&(c.f|=kr),Ki(f,On,r))}else if(u){var m=c;(l&Xn)!==0&&$n!==null&&$n.add(m),r!==null?r.push(m):Eo(m)}}}}function At(t){if(typeof t!="object"||t===null||An in t)return t;const n=So(t);if(n!==Ql&&n!==es)return t;var r=new Map,a=ko(t),o=Z(0),s=yr,i=c=>{if(yr===s)return c();var l=ht,u=yr;hn(null),ni(s);var f=c();return hn(l),ni(u),f};return a&&r.set("length",Z(t.length)),new Proxy(t,{defineProperty(c,l,u){(!("value"in u)||u.configurable===!1||u.enumerable===!1||u.writable===!1)&&fs();var f=r.get(l);return f===void 0?i(()=>{var m=Z(u.value);return r.set(l,m),m}):b(f,u.value,!0),!0},deleteProperty(c,l){var u=r.get(l);if(u===void 0){if(l in c){const f=i(()=>Z(Dt));r.set(l,f),ta(o)}}else b(u,Dt),ta(o);return!0},get(c,l,u){var p;if(l===An)return t;var f=r.get(l),m=l in c;if(f===void 0&&(!m||(p=ar(c,l))!=null&&p.writable)&&(f=i(()=>{var g=At(m?c[l]:Dt),$=Z(g);return $}),r.set(l,f)),f!==void 0){var _=e(f);return _===Dt?void 0:_}return Reflect.get(c,l,u)},getOwnPropertyDescriptor(c,l){var u=Reflect.getOwnPropertyDescriptor(c,l);if(u&&"value"in u){var f=r.get(l);f&&(u.value=e(f))}else if(u===void 0){var m=r.get(l),_=m==null?void 0:m.v;if(m!==void 0&&_!==Dt)return{enumerable:!0,configurable:!0,value:_,writable:!0}}return u},has(c,l){var _;if(l===An)return!0;var u=r.get(l),f=u!==void 0&&u.v!==Dt||Reflect.has(c,l);if(u!==void 0||_t!==null&&(!f||(_=ar(c,l))!=null&&_.writable)){u===void 0&&(u=i(()=>{var p=f?At(c[l]):Dt,g=Z(p);return g}),r.set(l,u));var m=e(u);if(m===Dt)return!1}return f},set(c,l,u,f){var H;var m=r.get(l),_=l in c;if(a&&l==="length")for(var p=u;p<m.v;p+=1){var g=r.get(p+"");g!==void 0?b(g,Dt):p in c&&(g=i(()=>Z(Dt)),r.set(p+"",g))}if(m===void 0)(!_||(H=ar(c,l))!=null&&H.writable)&&(m=i(()=>Z(void 0)),b(m,At(u)),r.set(l,m));else{_=m.v!==Dt;var $=i(()=>At(u));b(m,$)}var w=Reflect.getOwnPropertyDescriptor(c,l);if(w!=null&&w.set&&w.set.call(f,u),!_){if(a&&typeof l=="string"){var k=r.get("length"),L=Number(l);Number.isInteger(L)&&L>=k.v&&b(k,L+1)}ta(o)}return!0},ownKeys(c){e(o);var l=Reflect.ownKeys(c).filter(m=>{var _=r.get(m);return _===void 0||_.v!==Dt});for(var[u,f]of r)f.v!==Dt&&!(u in c)&&l.push(u);return l},setPrototypeOf(){ps()}})}function Qo(t){try{if(t!==null&&typeof t=="object"&&An in t)return t[An]}catch{}return t}function Qs(t,n){return Object.is(Qo(t),Qo(n))}var Cr,Qi,el,tl;function ec(){if(Cr===void 0){Cr=window,Qi=/Firefox/.test(navigator.userAgent);var t=Element.prototype,n=Node.prototype,r=Text.prototype;el=ar(n,"firstChild").get,tl=ar(n,"nextSibling").get,Vo(t)&&(t.__click=void 0,t.__className=void 0,t.__attributes=null,t.__style=void 0,t.__e=void 0),Vo(r)&&(r.__t=void 0)}}function Yn(t=""){return document.createTextNode(t)}function Br(t){return el.call(t)}function fa(t){return tl.call(t)}function v(t,n){return Br(t)}function U(t,n=!1){{var r=Br(t);return r instanceof Comment&&r.data===""?fa(r):r}}function d(t,n=1,r=!1){let a=t;for(;n--;)a=fa(a);return a}function tc(t){t.textContent=""}function nl(){return!1}function rl(t,n,r){return document.createElementNS(n??zi,t,void 0)}function al(t,n){if(n){const r=document.body;t.autofocus=!0,Un(()=>{document.activeElement===r&&t.focus()})}}let ei=!1;function nc(){ei||(ei=!0,document.addEventListener("reset",t=>{Promise.resolve().then(()=>{var n;if(!t.defaultPrevented)for(const r of t.target.elements)(n=r.__on_r)==null||n.call(r)})},{capture:!0}))}function ja(t){var n=ht,r=_t;hn(null),_n(null);try{return t()}finally{hn(n),_n(r)}}function ol(t,n,r,a=r){t.addEventListener(n,()=>ja(r));const o=t.__on_r;o?t.__on_r=()=>{o(),a(!0)}:t.__on_r=()=>a(!0),nc()}function il(t){_t===null&&(ht===null&&us(),cs()),sr&&ss()}function rc(t,n){var r=n.last;r===null?n.last=n.first=t:(r.next=t,t.prev=r,n.last=t)}function Cn(t,n){var r=_t;r!==null&&(r.f&on)!==0&&(t|=on);var a={ctx:jt,deps:null,nodes:null,f:t|Yt|pn,first:null,fn:n,last:null,next:null,parent:r,b:r&&r.b,prev:null,teardown:null,wv:0,ac:null};Qe==null||Qe.register_created_effect(a);var o=a;if((t&Rr)!==0)Er!==null?Er.push(a):Sr.ensure().schedule(a);else if(n!==null){try{Dr(a)}catch(i){throw Vt(a),i}o.deps===null&&o.teardown===null&&o.nodes===null&&o.first===o.last&&(o.f&Hr)===0&&(o=o.first,(t&Xn)!==0&&(t&Vn)!==0&&o!==null&&(o.f|=Vn))}if(o!==null&&(o.parent=r,r!==null&&rc(o,r),ht!==null&&(ht.f&Ht)!==0&&(t&wr)===0)){var s=ht;(s.effects??(s.effects=[])).push(o)}return a}function Fo(){return ht!==null&&!kn}function pa(t){const n=Cn(da,null);return Ot(n,qt),n.teardown=t,n}function Xt(t){il();var n=_t.f,r=!ht&&(n&Sn)!==0&&(n&Mr)===0;if(r){var a=jt;(a.e??(a.e=[])).push(t)}else return ll(t)}function ll(t){return Cn(Rr|Ti,t)}function ac(t){return il(),Cn(da|Ti,t)}function oc(t){Sr.ensure();const n=Cn(wr|Hr,t);return(r={})=>new Promise(a=>{r.outro?xr(n,()=>{Vt(n),a(void 0)}):(Vt(n),a(void 0))})}function Oa(t){return Cn(Rr,t)}function ic(t){return Cn(Aa|Hr,t)}function Ao(t,n=0){return Cn(da|n,t)}function te(t,n=[],r=[],a=[]){Ui(a,n,r,o=>{Cn(da,()=>t(...o.map(e)))})}function Tr(t,n=0){var r=Cn(Xn|n,t);return r}function sl(t,n=0){var r=Cn(Co|n,t);return r}function an(t){return Cn(Sn|Hr,t)}function cl(t){var n=t.teardown;if(n!==null){const r=sr,a=ht;ti(!0),hn(null);try{n.call(null)}finally{ti(r),hn(a)}}}function jo(t,n=!1){var r=t.first;for(t.first=t.last=null;r!==null;){const o=r.ac;o!==null&&ja(()=>{o.abort(Ln)});var a=r.next;(r.f&wr)!==0?r.parent=null:Vt(r,n),r=a}}function lc(t){for(var n=t.first;n!==null;){var r=n.next;(n.f&Sn)===0&&Vt(n),n=r}}function Vt(t,n=!0){var r=!1;(n||(t.f&rs)!==0)&&t.nodes!==null&&t.nodes.end!==null&&(sc(t.nodes.start,t.nodes.end),r=!0),Ot(t,ao),jo(t,n&&!r),ra(t,0);var a=t.nodes&&t.nodes.t;if(a!==null)for(const s of a)s.stop();cl(t),t.f^=ao,t.f|=dn;var o=t.parent;o!==null&&o.first!==null&&ul(t),t.next=t.prev=t.teardown=t.ctx=t.deps=t.fn=t.nodes=t.ac=t.b=null}function sc(t,n){for(;t!==null;){var r=t===n?null:fa(t);t.remove(),t=r}}function ul(t){var n=t.parent,r=t.prev,a=t.next;r!==null&&(r.next=a),a!==null&&(a.prev=r),n!==null&&(n.first===t&&(n.first=a),n.last===t&&(n.last=r))}function xr(t,n,r=!0){var a=[];dl(t,a,!0);var o=()=>{r&&Vt(t),n&&n()},s=a.length;if(s>0){var i=()=>--s||o();for(var c of a)c.out(i)}else o()}function dl(t,n,r){if((t.f&on)===0){t.f^=on;var a=t.nodes&&t.nodes.t;if(a!==null)for(const c of a)(c.is_global||r)&&n.push(c);for(var o=t.first;o!==null;){var s=o.next,i=(o.f&Vn)!==0||(o.f&Sn)!==0&&(t.f&Xn)!==0;dl(o,n,i?r:!1),o=s}}}function Oo(t){vl(t,!0)}function vl(t,n){if((t.f&on)!==0){t.f^=on,(t.f&qt)===0&&(Ot(t,Yt),Sr.ensure().schedule(t));for(var r=t.first;r!==null;){var a=r.next,o=(r.f&Vn)!==0||(r.f&Sn)!==0;vl(r,o?n:!1),r=a}var s=t.nodes&&t.nodes.t;if(s!==null)for(const i of s)(i.is_global||n)&&i.in()}}function Ro(t,n){if(t.nodes)for(var r=t.nodes.start,a=t.nodes.end;r!==null;){var o=r===a?null:fa(r);n.append(r),r=o}}let Ca=!1,sr=!1;function ti(t){sr=t}let ht=null,kn=!1;function hn(t){ht=t}let _t=null;function _n(t){_t=t}let gn=null;function fl(t){ht!==null&&(gn===null?gn=[t]:gn.push(t))}let rn=null,ln=0,vn=null;function cc(t){vn=t}let pl=1,gr=0,yr=gr;function ni(t){yr=t}function gl(){return++pl}function ga(t){var n=t.f;if((n&Yt)!==0)return!0;if(n&Ht&&(t.f&=~kr),(n&On)!==0){for(var r=t.deps,a=r.length,o=0;o<a;o++){var s=r[o];if(ga(s)&&Xi(s),s.wv>t.wv)return!0}(n&pn)!==0&&Ut===null&&Ot(t,qt)}return!1}function hl(t,n,r=!0){var a=t.reactions;if(a!==null&&!(gn!==null&&Or.call(gn,t)))for(var o=0;o<a.length;o++){var s=a[o];(s.f&Ht)!==0?hl(s,n,!1):n===s&&(r?Ot(s,Yt):(s.f&qt)!==0&&Ot(s,On),Eo(s))}}function _l(t){var $;var n=rn,r=ln,a=vn,o=ht,s=gn,i=jt,c=kn,l=yr,u=t.f;rn=null,ln=0,vn=null,ht=(u&(Sn|wr))===0?t:null,gn=null,Lr(t.ctx),kn=!1,yr=++gr,t.ac!==null&&(ja(()=>{t.ac.abort(Ln)}),t.ac=null);try{t.f|=io;var f=t.fn,m=f();t.f|=Mr;var _=t.deps,p=Qe==null?void 0:Qe.is_fork;if(rn!==null){var g;if(p||ra(t,ln),_!==null&&ln>0)for(_.length=ln+rn.length,g=0;g<rn.length;g++)_[ln+g]=rn[g];else t.deps=_=rn;if(Fo()&&(t.f&pn)!==0)for(g=ln;g<_.length;g++)(($=_[g]).reactions??($.reactions=[])).push(t)}else!p&&_!==null&&ln<_.length&&(ra(t,ln),_.length=ln);if(Wr()&&vn!==null&&!kn&&_!==null&&(t.f&(Ht|On|Yt))===0)for(g=0;g<vn.length;g++)hl(vn[g],t);if(o!==null&&o!==t){if(gr++,o.deps!==null)for(let w=0;w<r;w+=1)o.deps[w].rv=gr;if(n!==null)for(const w of n)w.rv=gr;vn!==null&&(a===null?a=vn:a.push(...vn))}return(t.f&or)!==0&&(t.f^=or),m}catch(w){return Oi(w)}finally{t.f^=io,rn=n,ln=r,vn=a,ht=o,gn=s,Lr(i),kn=c,yr=l}}function uc(t,n){let r=n.reactions;if(r!==null){var a=Kl.call(r,t);if(a!==-1){var o=r.length-1;o===0?r=n.reactions=null:(r[a]=r[o],r.pop())}}if(r===null&&(n.f&Ht)!==0&&(rn===null||!Or.call(rn,n))){var s=n;(s.f&pn)!==0&&(s.f^=pn,s.f&=~kr),To(s),Zs(s),ra(s,0)}}function ra(t,n){var r=t.deps;if(r!==null)for(var a=n;a<r.length;a++)uc(t,r[a])}function Dr(t){var n=t.f;if((n&dn)===0){Ot(t,qt);var r=_t,a=Ca;_t=t,Ca=!0;try{(n&(Xn|Co))!==0?lc(t):jo(t),cl(t);var o=_l(t);t.teardown=typeof o=="function"?o:null,t.wv=pl;var s;Zl&&Es&&(t.f&Yt)!==0&&t.deps}finally{Ca=a,_t=r}}}async function dc(){await Promise.resolve(),Rs()}function e(t){var n=t.f,r=(n&Ht)!==0;if(ht!==null&&!kn){var a=_t!==null&&(_t.f&dn)!==0;if(!a&&(gn===null||!Or.call(gn,t))){var o=ht.deps;if((ht.f&io)!==0)t.rv<gr&&(t.rv=gr,rn===null&&o!==null&&o[ln]===t?ln++:rn===null?rn=[t]:rn.push(t));else{(ht.deps??(ht.deps=[])).push(t);var s=t.reactions;s===null?t.reactions=[ht]:Or.call(s,ht)||s.push(ht)}}}if(sr&&ir.has(t))return ir.get(t);if(r){var i=t;if(sr){var c=i.v;return((i.f&qt)===0&&i.reactions!==null||ml(i))&&(c=No(i)),ir.set(i,c),c}var l=(i.f&pn)===0&&!kn&&ht!==null&&(Ca||(ht.f&pn)!==0),u=(i.f&Mr)===0;ga(i)&&(l&&(i.f|=pn),Xi(i)),l&&!u&&(Vi(i),bl(i))}if(Ut!=null&&Ut.has(t))return Ut.get(t);if((t.f&or)!==0)throw t.v;return t.v}function bl(t){if(t.f|=pn,t.deps!==null)for(const n of t.deps)(n.reactions??(n.reactions=[])).push(t),(n.f&Ht)!==0&&(n.f&pn)===0&&(Vi(n),bl(n))}function ml(t){if(t.v===Dt)return!0;if(t.deps===null)return!1;for(const n of t.deps)if(ir.has(n)||(n.f&Ht)!==0&&ml(n))return!0;return!1}function Jn(t){var n=kn;try{return kn=!0,t()}finally{kn=n}}function fr(t){if(!(typeof t!="object"||!t||t instanceof EventTarget)){if(An in t)go(t);else if(!Array.isArray(t))for(let n in t){const r=t[n];typeof r=="object"&&r&&An in r&&go(r)}}}function go(t,n=new Set){if(typeof t=="object"&&t!==null&&!(t instanceof EventTarget)&&!n.has(t)){n.add(t),t instanceof Date&&t.getTime();for(let a in t)try{go(t[a],n)}catch{}const r=So(t);if(r!==Object.prototype&&r!==Array.prototype&&r!==Map.prototype&&r!==Set.prototype&&r!==Date.prototype){const a=Ci(r);for(let o in a){const s=a[o].get;if(s)try{s.call(t)}catch{}}}}}function vc(t){return t.endsWith("capture")&&t!=="gotpointercapture"&&t!=="lostpointercapture"}const fc=["beforeinput","click","change","dblclick","contextmenu","focusin","focusout","input","keydown","keyup","mousedown","mousemove","mouseout","mouseover","mouseup","pointerdown","pointermove","pointerout","pointerover","pointerup","touchend","touchmove","touchstart"];function pc(t){return fc.includes(t)}const gc={formnovalidate:"formNoValidate",ismap:"isMap",nomodule:"noModule",playsinline:"playsInline",readonly:"readOnly",defaultvalue:"defaultValue",defaultchecked:"defaultChecked",srcobject:"srcObject",novalidate:"noValidate",allowfullscreen:"allowFullscreen",disablepictureinpicture:"disablePictureInPicture",disableremoteplayback:"disableRemotePlayback"};function hc(t){return t=t.toLowerCase(),gc[t]??t}const _c=["touchstart","touchmove"];function bc(t){return _c.includes(t)}const hr=Symbol("events"),$l=new Set,ho=new Set;function xl(t,n,r,a={}){function o(s){if(a.capture||_o.call(n,s),!s.cancelBubble)return ja(()=>r==null?void 0:r.call(this,s))}return t.startsWith("pointer")||t.startsWith("touch")||t==="wheel"?Un(()=>{n.addEventListener(t,o,a)}):n.addEventListener(t,o,a),o}function Mt(t,n,r,a,o){var s={capture:a,passive:o},i=xl(t,n,r,s);(n===document.body||n===window||n===document||n instanceof HTMLMediaElement)&&pa(()=>{n.removeEventListener(t,i,s)})}function x(t,n,r){(n[hr]??(n[hr]={}))[t]=r}function Tt(t){for(var n=0;n<t.length;n++)$l.add(t[n]);for(var r of ho)r(t)}let ri=null;function _o(t){var w,k;var n=this,r=n.ownerDocument,a=t.type,o=((w=t.composedPath)==null?void 0:w.call(t))||[],s=o[0]||t.target;ri=t;var i=0,c=ri===t&&t[hr];if(c){var l=o.indexOf(c);if(l!==-1&&(n===document||n===window)){t[hr]=n;return}var u=o.indexOf(n);if(u===-1)return;l<=u&&(i=l)}if(s=o[i]||t.target,s!==n){Si(t,"currentTarget",{configurable:!0,get(){return s||r}});var f=ht,m=_t;hn(null),_n(null);try{for(var _,p=[];s!==null;){var g=s.assignedSlot||s.parentNode||s.host||null;try{var $=(k=s[hr])==null?void 0:k[a];$!=null&&(!s.disabled||t.target===s)&&$.call(s,t)}catch(L){_?p.push(L):_=L}if(t.cancelBubble||g===n||g===null)break;s=g}if(_){for(let L of p)queueMicrotask(()=>{throw L});throw _}}finally{t[hr]=n,delete t.currentTarget,hn(f),_n(m)}}}var wi;const Ga=((wi=globalThis==null?void 0:globalThis.window)==null?void 0:wi.trustedTypes)&&globalThis.window.trustedTypes.createPolicy("svelte-trusted-html",{createHTML:t=>t});function mc(t){return(Ga==null?void 0:Ga.createHTML(t))??t}function yl(t){var n=rl("template");return n.innerHTML=mc(t.replaceAll("<!>","<!---->")),n.content}function aa(t,n){var r=_t;r.nodes===null&&(r.nodes={start:t,end:n,a:null,t:null})}function I(t,n){var r=(n&Ss)!==0,a=(n&Cs)!==0,o,s=!t.startsWith("<!>");return()=>{o===void 0&&(o=yl(s?t:"<!>"+t),r||(o=Br(o)));var i=a||Qi?document.importNode(o,!0):o.cloneNode(!0);if(r){var c=Br(i),l=i.lastChild;aa(c,l)}else aa(i,i);return i}}function $c(t,n,r="svg"){var a=!t.startsWith("<!>"),o=`<${r}>${a?t:"<!>"+t}</${r}>`,s;return()=>{if(!s){var i=yl(o),c=Br(i);s=Br(c)}var l=s.cloneNode(!0);return aa(l,l),l}}function Lo(t,n){return $c(t,n,"svg")}function pe(){var t=document.createDocumentFragment(),n=document.createComment(""),r=Yn();return t.append(n,r),aa(n,r),t}function h(t,n){t!==null&&t.before(n)}function et(t,n){var r=n==null?"":typeof n=="object"?`${n}`:n;r!==(t.__t??(t.__t=t.nodeValue))&&(t.__t=r,t.nodeValue=`${r}`)}function xc(t,n){return yc(t,n)}const ba=new Map;function yc(t,{target:n,anchor:r,props:a={},events:o,context:s,intro:i=!0,transformError:c}){ec();var l=void 0,u=oc(()=>{var f=r??n.appendChild(Yn());Ds(f,{pending:()=>{}},p=>{wt({});var g=jt;s&&(g.c=s),o&&(a.$$events=o),l=t(p,a)||{},kt()},c);var m=new Set,_=p=>{for(var g=0;g<p.length;g++){var $=p[g];if(!m.has($)){m.add($);var w=bc($);for(const H of[n,document]){var k=ba.get(H);k===void 0&&(k=new Map,ba.set(H,k));var L=k.get($);L===void 0?(H.addEventListener($,_o,{passive:w}),k.set($,1)):k.set($,L+1)}}}};return _(Fa($l)),ho.add(_),()=>{var w;for(var p of m)for(const k of[n,document]){var g=ba.get(k),$=g.get(p);--$==0?(k.removeEventListener(p,_o),g.delete(p),g.size===0&&ba.delete(k)):g.set(p,$)}ho.delete(_),f!==r&&((w=f.parentNode)==null||w.removeChild(f))}});return wc.set(l,u),l}let wc=new WeakMap;var yn,zn,un,$r,ca,ua,Na;class ha{constructor(n,r=!0){mn(this,"anchor");gt(this,yn,new Map);gt(this,zn,new Map);gt(this,un,new Map);gt(this,$r,new Set);gt(this,ca,!0);gt(this,ua,n=>{if(F(this,yn).has(n)){var r=F(this,yn).get(n),a=F(this,zn).get(r);if(a)Oo(a),F(this,$r).delete(r);else{var o=F(this,un).get(r);o&&(F(this,zn).set(r,o.effect),F(this,un).delete(r),o.fragment.lastChild.remove(),this.anchor.before(o.fragment),a=o.effect)}for(const[s,i]of F(this,yn)){if(F(this,yn).delete(s),s===n)break;const c=F(this,un).get(i);c&&(Vt(c.effect),F(this,un).delete(i))}for(const[s,i]of F(this,zn)){if(s===r||F(this,$r).has(s))continue;const c=()=>{if(Array.from(F(this,yn).values()).includes(s)){var u=document.createDocumentFragment();Ro(i,u),u.append(Yn()),F(this,un).set(s,{effect:i,fragment:u})}else Vt(i);F(this,$r).delete(s),F(this,zn).delete(s)};F(this,ca)||!a?(F(this,$r).add(s),xr(i,c,!1)):c()}}});gt(this,Na,n=>{F(this,yn).delete(n);const r=Array.from(F(this,yn).values());for(const[a,o]of F(this,un))r.includes(a)||(Vt(o.effect),F(this,un).delete(a))});this.anchor=n,bt(this,ca,r)}ensure(n,r){var a=Qe,o=nl();if(r&&!F(this,zn).has(n)&&!F(this,un).has(n))if(o){var s=document.createDocumentFragment(),i=Yn();s.append(i),F(this,un).set(n,{effect:an(()=>r(i)),fragment:s})}else F(this,zn).set(n,an(()=>r(this.anchor)));if(F(this,yn).set(a,n),o){for(const[c,l]of F(this,zn))c===n?a.unskip_effect(l):a.skip_effect(l);for(const[c,l]of F(this,un))c===n?a.unskip_effect(l.effect):a.skip_effect(l.effect);a.oncommit(F(this,ua)),a.ondiscard(F(this,Na))}else F(this,ua).call(this,a)}}yn=new WeakMap,zn=new WeakMap,un=new WeakMap,$r=new WeakMap,ca=new WeakMap,ua=new WeakMap,Na=new WeakMap;function je(t,n,r=!1){var a=new ha(t),o=r?Vn:0;function s(i,c){a.ensure(i,c)}Tr(()=>{var i=!1;n((c,l=0)=>{i=!0,s(l,c)}),i||s(-1,null)},o)}const kc=Symbol("NaN");function Sc(t,n,r){var a=new ha(t),o=!Wr();Tr(()=>{var s=n();s!==s&&(s=kc),o&&s!==null&&typeof s=="object"&&(s={}),a.ensure(s,r)})}function zt(t,n){return n}function Cc(t,n,r){for(var a=[],o=n.length,s,i=n.length,c=0;c<o;c++){let m=n[c];xr(m,()=>{if(s){if(s.pending.delete(m),s.done.add(m),s.pending.size===0){var _=t.outrogroups;bo(t,Fa(s.done)),_.delete(s),_.size===0&&(t.outrogroups=null)}}else i-=1},!1)}if(i===0){var l=a.length===0&&r!==null;if(l){var u=r,f=u.parentNode;tc(f),f.append(u),t.items.clear()}bo(t,n,!l)}else s={pending:new Set(n),done:new Set},(t.outrogroups??(t.outrogroups=new Set)).add(s)}function bo(t,n,r=!0){var a;if(t.pending.size>0){a=new Set;for(const i of t.pending.values())for(const c of i)a.add(t.items.get(c).e)}for(var o=0;o<n.length;o++){var s=n[o];if(a!=null&&a.has(s)){s.f|=Fn;const i=document.createDocumentFragment();Ro(s,i)}else Vt(n[o],r)}}var ai;function $t(t,n,r,a,o,s=null){var i=t,c=new Map,l=(n&Ii)!==0;if(l){var u=t;i=u.appendChild(Yn())}var f=null,m=zo(()=>{var H=r();return ko(H)?H:H==null?[]:Fa(H)}),_,p=new Map,g=!0;function $(H){(L.effect.f&dn)===0&&(L.pending.delete(H),L.fallback=f,Mc(L,_,i,n,a),f!==null&&(_.length===0?(f.f&Fn)===0?Oo(f):(f.f^=Fn,Qr(f,null,i)):xr(f,()=>{f=null})))}function w(H){L.pending.delete(H)}var k=Tr(()=>{_=e(m);for(var H=_.length,P=new Set,E=Qe,Q=nl(),O=0;O<H;O+=1){var z=_[O],re=a(z,O),W=g?null:c.get(re);W?(W.v&&qr(W.v,z),W.i&&qr(W.i,O),Q&&E.unskip_effect(W.e)):(W=Tc(c,g?i:ai??(ai=Yn()),z,re,O,o,n,r),g||(W.e.f|=Fn),c.set(re,W)),P.add(re)}if(H===0&&s&&!f&&(g?f=an(()=>s(i)):(f=an(()=>s(ai??(ai=Yn()))),f.f|=Fn)),H>P.size&&ls(),!g)if(p.set(E,P),Q){for(const[Se,Pe]of c)P.has(Se)||E.skip_effect(Pe.e);E.oncommit($),E.ondiscard(w)}else $(E);e(m)}),L={effect:k,items:c,pending:p,outrogroups:null,fallback:f};g=!1}function Vr(t){for(;t!==null&&(t.f&Sn)===0;)t=t.next;return t}function Mc(t,n,r,a,o){var W,Se,Pe,Ke,Ge,Ye,B,y,N;var s=(a&ms)!==0,i=n.length,c=t.items,l=Vr(t.effect.first),u,f=null,m,_=[],p=[],g,$,w,k;if(s)for(k=0;k<i;k+=1)g=n[k],$=o(g,k),w=c.get($).e,(w.f&Fn)===0&&((Se=(W=w.nodes)==null?void 0:W.a)==null||Se.measure(),(m??(m=new Set)).add(w));for(k=0;k<i;k+=1){if(g=n[k],$=o(g,k),w=c.get($).e,t.outrogroups!==null)for(const ne of t.outrogroups)ne.pending.delete(w),ne.done.delete(w);if((w.f&on)!==0&&(Oo(w),s&&((Ke=(Pe=w.nodes)==null?void 0:Pe.a)==null||Ke.unfix(),(m??(m=new Set)).delete(w))),(w.f&Fn)!==0)if(w.f^=Fn,w===l)Qr(w,null,r);else{var L=f?f.next:l;w===t.effect.last&&(t.effect.last=w.prev),w.prev&&(w.prev.next=w.next),w.next&&(w.next.prev=w.prev),Qn(t,f,w),Qn(t,w,L),Qr(w,L,r),f=w,_=[],p=[],l=Vr(f.next);continue}if(w!==l){if(u!==void 0&&u.has(w)){if(_.length<p.length){var H=p[0],P;f=H.prev;var E=_[0],Q=_[_.length-1];for(P=0;P<_.length;P+=1)Qr(_[P],H,r);for(P=0;P<p.length;P+=1)u.delete(p[P]);Qn(t,E.prev,Q.next),Qn(t,f,E),Qn(t,Q,H),l=H,f=Q,k-=1,_=[],p=[]}else u.delete(w),Qr(w,l,r),Qn(t,w.prev,w.next),Qn(t,w,f===null?t.effect.first:f.next),Qn(t,f,w),f=w;continue}for(_=[],p=[];l!==null&&l!==w;)(u??(u=new Set)).add(l),p.push(l),l=Vr(l.next);if(l===null)continue}(w.f&Fn)===0&&_.push(w),f=w,l=Vr(w.next)}if(t.outrogroups!==null){for(const ne of t.outrogroups)ne.pending.size===0&&(bo(t,Fa(ne.done)),(Ge=t.outrogroups)==null||Ge.delete(ne));t.outrogroups.size===0&&(t.outrogroups=null)}if(l!==null||u!==void 0){var O=[];if(u!==void 0)for(w of u)(w.f&on)===0&&O.push(w);for(;l!==null;)(l.f&on)===0&&l!==t.fallback&&O.push(l),l=Vr(l.next);var z=O.length;if(z>0){var re=(a&Ii)!==0&&i===0?r:null;if(s){for(k=0;k<z;k+=1)(B=(Ye=O[k].nodes)==null?void 0:Ye.a)==null||B.measure();for(k=0;k<z;k+=1)(N=(y=O[k].nodes)==null?void 0:y.a)==null||N.fix()}Cc(t,O,re)}}s&&Un(()=>{var ne,ye;if(m!==void 0)for(w of m)(ye=(ne=w.nodes)==null?void 0:ne.a)==null||ye.apply()})}function Tc(t,n,r,a,o,s,i,c){var l=(i&_s)!==0?(i&$s)===0?Zi(r,!1,!1):lr(r):null,u=(i&bs)!==0?lr(o):null;return{v:l,i:u,e:an(()=>(s(n,l??r,u??o,c),()=>{t.delete(a)}))}}function Qr(t,n,r){if(t.nodes)for(var a=t.nodes.start,o=t.nodes.end,s=n&&(n.f&Fn)===0?n.nodes.start:r;a!==null;){var i=fa(a);if(s.before(a),a===o)return;a=i}}function Qn(t,n,r){n===null?t.effect.first=r:n.next=r,r===null?t.effect.last=n:r.prev=n}function Ie(t,n,r,a,o){var c;var s=(c=n.$$slots)==null?void 0:c[r],i=!1;s===!0&&(s=n.children,i=!0),s===void 0||s(t,i?()=>a:a)}function wl(t,n,...r){var a=new ha(t);Tr(()=>{const o=n()??null;a.ensure(o,o&&(s=>o(s,...r)))},Vn)}function mo(t,n,r){var a=new ha(t);Tr(()=>{var o=n()??null;a.ensure(o,o&&(s=>r(s,o)))},Vn)}function Pc(t,n,r,a,o,s){var i=null,c=t,l=new ha(c,!1);Tr(()=>{const u=n()||null;var f=Ms;if(u===null){l.ensure(null,null);return}return l.ensure(u,m=>{if(u){if(i=rl(u,f),aa(i,i),a){var _=i.appendChild(Yn());a(i,_)}_t.nodes.end=i,m.before(i)}}),()=>{}},Vn),pa(()=>{})}function Ic(t,n){var r=void 0,a;sl(()=>{r!==(r=n())&&(a&&(Vt(a),a=null),r&&(a=an(()=>{Oa(()=>r(t))})))})}function kl(t){var n,r,a="";if(typeof t=="string"||typeof t=="number")a+=t;else if(typeof t=="object")if(Array.isArray(t)){var o=t.length;for(n=0;n<o;n++)t[n]&&(r=kl(t[n]))&&(a&&(a+=" "),a+=r)}else for(r in t)t[r]&&(a&&(a+=" "),a+=r);return a}function Ec(){for(var t,n,r=0,a="",o=arguments.length;r<o;r++)(t=arguments[r])&&(n=kl(t))&&(a&&(a+=" "),a+=n);return a}function zc(t){return typeof t=="object"?Ec(t):t??""}const oi=[...` 	
\r\f \v\uFEFF`];function Nc(t,n,r){var a=t==null?"":""+t;if(n&&(a=a?a+" "+n:n),r){for(var o of Object.keys(r))if(r[o])a=a?a+" "+o:o;else if(a.length)for(var s=o.length,i=0;(i=a.indexOf(o,i))>=0;){var c=i+s;(i===0||oi.includes(a[i-1]))&&(c===a.length||oi.includes(a[c]))?a=(i===0?"":a.substring(0,i))+a.substring(c+1):i=c}}return a===""?null:a}function ii(t,n=!1){var r=n?" !important;":";",a="";for(var o of Object.keys(t)){var s=t[o];s!=null&&s!==""&&(a+=" "+o+": "+s+r)}return a}function Wa(t){return t[0]!=="-"||t[1]!=="-"?t.toLowerCase():t}function Fc(t,n){if(n){var r="",a,o;if(Array.isArray(n)?(a=n[0],o=n[1]):a=n,t){t=String(t).replaceAll(/\s*\/\*.*?\*\/\s*/g,"").trim();var s=!1,i=0,c=!1,l=[];a&&l.push(...Object.keys(a).map(Wa)),o&&l.push(...Object.keys(o).map(Wa));var u=0,f=-1;const $=t.length;for(var m=0;m<$;m++){var _=t[m];if(c?_==="/"&&t[m-1]==="*"&&(c=!1):s?s===_&&(s=!1):_==="/"&&t[m+1]==="*"?c=!0:_==='"'||_==="'"?s=_:_==="("?i++:_===")"&&i--,!c&&s===!1&&i===0){if(_===":"&&f===-1)f=m;else if(_===";"||m===$-1){if(f!==-1){var p=Wa(t.substring(u,f).trim());if(!l.includes(p)){_!==";"&&m++;var g=t.substring(u,m).trim();r+=" "+g+";"}}u=m+1,f=-1}}}}return a&&(r+=ii(a)),o&&(r+=ii(o,!0)),r=r.trim(),r===""?null:r}return t==null?null:String(t)}function We(t,n,r,a,o,s){var i=t.__className;if(i!==r||i===void 0){var c=Nc(r,a,s);c==null?t.removeAttribute("class"):n?t.className=c:t.setAttribute("class",c),t.__className=r}else if(s&&o!==s)for(var l in s){var u=!!s[l];(o==null||u!==!!o[l])&&t.classList.toggle(l,u)}return s}function Ua(t,n={},r,a){for(var o in r){var s=r[o];n[o]!==s&&(r[o]==null?t.style.removeProperty(o):t.style.setProperty(o,s,a))}}function Ue(t,n,r,a){var o=t.__style;if(o!==n){var s=Fc(n,a);s==null?t.removeAttribute("style"):t.style.cssText=s,t.__style=n}else a&&(Array.isArray(a)?(Ua(t,r==null?void 0:r[0],a[0]),Ua(t,r==null?void 0:r[1],a[1],"important")):Ua(t,r,a));return a}function wn(t,n,r=!1){if(t.multiple){if(n==null)return;if(!ko(n))return Ps();for(var a of t.options)a.selected=n.includes(na(a));return}for(a of t.options){var o=na(a);if(Qs(o,n)){a.selected=!0;return}}(!r||n!==void 0)&&(t.selectedIndex=-1)}function Gn(t){var n=new MutationObserver(()=>{wn(t,t.__value)});n.observe(t,{childList:!0,subtree:!0,attributes:!0,attributeFilter:["value"]}),pa(()=>{n.disconnect()})}function zr(t,n,r=n){var a=new WeakSet,o=!0;ol(t,"change",s=>{var i=s?"[selected]":":checked",c;if(t.multiple)c=[].map.call(t.querySelectorAll(i),na);else{var l=t.querySelector(i)??t.querySelector("option:not([disabled])");c=l&&na(l)}r(c),t.__value=c,Qe!==null&&a.add(Qe)}),Oa(()=>{var s=n();if(t===document.activeElement){var i=Qe;if(a.has(i))return}if(wn(t,s,o),o&&s===void 0){var c=t.querySelector(":checked");c!==null&&(s=na(c),r(s))}t.__value=s,o=!1}),Gn(t)}function na(t){return"__value"in t?t.__value:t.value}const Jr=Symbol("class"),Zr=Symbol("style"),Sl=Symbol("is custom element"),Cl=Symbol("is html"),Ac=Mo?"option":"OPTION",jc=Mo?"select":"SELECT",Oc=Mo?"progress":"PROGRESS";function Et(t,n){var r=qo(t);r.value===(r.value=n??void 0)||t.value===n&&(n!==0||t.nodeName!==Oc)||(t.value=n??"")}function Rc(t,n){n?t.hasAttribute("selected")||t.setAttribute("selected",""):t.removeAttribute("selected")}function ut(t,n,r,a){var o=qo(t);o[n]!==(o[n]=r)&&(n==="loading"&&(t[as]=r),r==null?t.removeAttribute(n):typeof r!="string"&&Ml(t).includes(n)?t[n]=r:t.setAttribute(n,r))}function Lc(t,n,r,a,o=!1,s=!1){var i=qo(t),c=i[Sl],l=!i[Cl],u=n||{},f=t.nodeName===Ac;for(var m in n)m in r||(r[m]=null);r.class?r.class=zc(r.class):r[Jr]&&(r.class=null),r[Zr]&&(r.style??(r.style=null));var _=Ml(t);for(const P in r){let E=r[P];if(f&&P==="value"&&E==null){t.value=t.__value="",u[P]=E;continue}if(P==="class"){var p=t.namespaceURI==="http://www.w3.org/1999/xhtml";We(t,p,E,a,n==null?void 0:n[Jr],r[Jr]),u[P]=E,u[Jr]=r[Jr];continue}if(P==="style"){Ue(t,E,n==null?void 0:n[Zr],r[Zr]),u[P]=E,u[Zr]=r[Zr];continue}var g=u[P];if(!(E===g&&!(E===void 0&&t.hasAttribute(P)))){u[P]=E;var $=P[0]+P[1];if($!=="$$")if($==="on"){const Q={},O="$$"+P;let z=P.slice(2);var w=pc(z);if(vc(z)&&(z=z.slice(0,-7),Q.capture=!0),!w&&g){if(E!=null)continue;t.removeEventListener(z,u[O],Q),u[O]=null}if(w)x(z,t,E),Tt([z]);else if(E!=null){let re=function(W){u[P].call(this,W)};var H=re;u[O]=xl(z,t,re,Q)}}else if(P==="style")ut(t,P,E);else if(P==="autofocus")al(t,!!E);else if(!c&&(P==="__value"||P==="value"&&E!=null))t.value=t.__value=E;else if(P==="selected"&&f)Rc(t,E);else{var k=P;l||(k=hc(k));var L=k==="defaultValue"||k==="defaultChecked";if(E==null&&!c&&!L)if(i[P]=null,k==="value"||k==="checked"){let Q=t;const O=n===void 0;if(k==="value"){let z=Q.defaultValue;Q.removeAttribute(k),Q.defaultValue=z,Q.value=Q.__value=O?z:null}else{let z=Q.defaultChecked;Q.removeAttribute(k),Q.defaultChecked=z,Q.checked=O?z:!1}}else t.removeAttribute(P);else L||_.includes(k)&&(c||typeof E!="string")?(t[k]=E,k in i&&(i[k]=Dt)):typeof E!="function"&&ut(t,k,E)}}}return u}function li(t,n,r=[],a=[],o=[],s,i=!1,c=!1){Ui(o,r,a,l=>{var u=void 0,f={},m=t.nodeName===jc,_=!1;if(sl(()=>{var g=n(...l.map(e)),$=Lc(t,u,g,s,i,c);_&&m&&"value"in g&&wn(t,g.value);for(let k of Object.getOwnPropertySymbols(f))g[k]||Vt(f[k]);for(let k of Object.getOwnPropertySymbols(g)){var w=g[k];k.description===Ts&&(!u||w!==u[k])&&(f[k]&&Vt(f[k]),f[k]=an(()=>Ic(t,()=>w))),$[k]=w}u=$}),m){var p=t;Oa(()=>{wn(p,u.value,!0),Gn(p)})}_=!0})}function qo(t){return t.__attributes??(t.__attributes={[Sl]:t.nodeName.includes("-"),[Cl]:t.namespaceURI===zi})}var si=new Map;function Ml(t){var n=t.getAttribute("is")||t.nodeName,r=si.get(n);if(r)return r;si.set(n,r=[]);for(var a,o=t,s=Element.prototype;s!==o;){a=Ci(o);for(var i in a)a[i].set&&r.push(i);o=So(o)}return r}function Bo(t,n,r=n){var a=new WeakSet;ol(t,"input",async o=>{var s=o?t.defaultValue:t.value;if(s=Ya(t)?Xa(s):s,r(s),Qe!==null&&a.add(Qe),await dc(),s!==(s=n())){var i=t.selectionStart,c=t.selectionEnd,l=t.value.length;if(t.value=s??"",c!==null){var u=t.value.length;i===c&&c===l&&u>l?(t.selectionStart=u,t.selectionEnd=u):(t.selectionStart=i,t.selectionEnd=Math.min(c,u))}}}),Jn(n)==null&&t.value&&(r(Ya(t)?Xa(t.value):t.value),Qe!==null&&a.add(Qe)),Ao(()=>{var o=n();if(t===document.activeElement){var s=Qe;if(a.has(s))return}Ya(t)&&o===Xa(t.value)||t.type==="date"&&!o&&!t.value||o!==t.value&&(t.value=o??"")})}function Ya(t){var n=t.type;return n==="number"||n==="range"}function Xa(t){return t===""?null:+t}function ci(t,n){return t===n||(t==null?void 0:t[An])===n}function jn(t={},n,r,a){var o=jt.r,s=_t;return Oa(()=>{var i,c;return Ao(()=>{i=c,c=[],Jn(()=>{t!==r(...c)&&(n(t,...c),i&&ci(r(...i),t)&&n(null,...i))})}),()=>{let l=s;for(;l!==o&&l.parent!==null&&l.parent.f&ao;)l=l.parent;const u=()=>{c&&ci(r(...c),t)&&n(null,...c)},f=l.teardown;l.teardown=()=>{u(),f==null||f()}}}),t}function qc(t=!1){const n=jt,r=n.l.u;if(!r)return;let a=()=>fr(n.s);if(t){let o=0,s={};const i=va(()=>{let c=!1;const l=n.s;for(const u in l)l[u]!==s[u]&&(s[u]=l[u],c=!0);return c&&o++,o});a=()=>e(i)}r.b.length&&ac(()=>{ui(n,a),Ma(r.b)}),Xt(()=>{const o=Jn(()=>r.m.map(ts));return()=>{for(const s of o)typeof s=="function"&&s()}}),r.a.length&&Xt(()=>{ui(n,a),Ma(r.a)})}function ui(t,n){if(t.l.s)for(const r of t.l.s)e(r);n()}const Bc={get(t,n){if(!t.exclude.includes(n))return e(t.version),n in t.special?t.special[n]():t.props[n]},set(t,n,r){if(!(n in t.special)){var a=_t;try{_n(t.parent_effect),t.special[n]=He({get[n](){return t.props[n]}},n,Ei)}finally{_n(a)}}return t.special[n](r),Ko(t.version),!0},getOwnPropertyDescriptor(t,n){if(!t.exclude.includes(n)&&n in t.props)return{enumerable:!0,configurable:!0,value:t.props[n]}},deleteProperty(t,n){return t.exclude.includes(n)||(t.exclude.push(n),Ko(t.version)),!0},has(t,n){return t.exclude.includes(n)?!1:n in t.props},ownKeys(t){return Reflect.ownKeys(t.props).filter(n=>!t.exclude.includes(n))}};function Te(t,n){return new Proxy({props:t,exclude:n,special:{},version:lr(0),parent_effect:_t},Bc)}const Dc={get(t,n){let r=t.props.length;for(;r--;){let a=t.props[r];if(Xr(a)&&(a=a()),typeof a=="object"&&a!==null&&n in a)return a[n]}},set(t,n,r){let a=t.props.length;for(;a--;){let o=t.props[a];Xr(o)&&(o=o());const s=ar(o,n);if(s&&s.set)return s.set(r),!0}return!1},getOwnPropertyDescriptor(t,n){let r=t.props.length;for(;r--;){let a=t.props[r];if(Xr(a)&&(a=a()),typeof a=="object"&&a!==null&&n in a){const o=ar(a,n);return o&&!o.configurable&&(o.configurable=!0),o}}},has(t,n){if(n===An||n===Pi)return!1;for(let r of t.props)if(Xr(r)&&(r=r()),r!=null&&n in r)return!0;return!1},ownKeys(t){const n=[];for(let r of t.props)if(Xr(r)&&(r=r()),!!r){for(const a in r)n.includes(a)||n.push(a);for(const a of Object.getOwnPropertySymbols(r))n.includes(a)||n.push(a)}return n}};function ze(...t){return new Proxy({props:t},Dc)}function He(t,n,r,a){var H;var o=!Gr||(r&ys)!==0,s=(r&ws)!==0,i=(r&ks)!==0,c=a,l=!0,u=()=>(l&&(l=!1,c=i?Jn(a):a),c);let f;if(s){var m=An in t||Pi in t;f=((H=ar(t,n))==null?void 0:H.set)??(m&&n in t?P=>t[n]=P:void 0)}var _,p=!1;s?[_,p]=js(()=>t[n]):_=t[n],_===void 0&&a!==void 0&&(_=u(),f&&(o&&vs(),f(_)));var g;if(o?g=()=>{var P=t[n];return P===void 0?u():(l=!0,P)}:g=()=>{var P=t[n];return P!==void 0&&(c=void 0),P===void 0?c:P},o&&(r&Ei)===0)return g;if(f){var $=t.$$legacy;return(function(P,E){return arguments.length>0?((!o||!E||$||p)&&f(E?g():P),P):g()})}var w=!1,k=((r&xs)!==0?va:zo)(()=>(w=!1,g()));s&&e(k);var L=_t;return(function(P,E){if(arguments.length>0){const Q=E?e(k):o&&s?At(P):P;return b(k,Q),w=!0,c!==void 0&&(c=Q),P}return sr&&w||(L.f&dn)!==0?k.v:e(k)})}function Tl(t){jt===null&&os(),Gr&&jt.l!==null?Hc(jt).m.push(t):Xt(()=>{const n=Jn(t);if(typeof n=="function")return n})}function Hc(t){var n=t.l;return n.u??(n.u={a:[],b:[],m:[]})}const Gc="5";var ki;typeof window<"u"&&((ki=window.__svelte??(window.__svelte={})).v??(ki.v=new Set)).add(Gc);function Wt(){return typeof window<"u"&&window.__JUCE__&&window.__JUCE__.backend}function Wc(){Wt()&&window.__JUCE__.backend.emitEvent("closeApplication",{})}function Uc(t,n){if(!Wt()){console.warn("[bridge] No JUCE backend — savePanelAs ignored");return}window.__JUCE__.backend.emitEvent("savePanelAs",{panelId:String(t),data:n})}function Yc(t,n,r){if(!Wt()){console.warn("[bridge] No JUCE backend — savePanel ignored");return}window.__JUCE__.backend.emitEvent("savePanel",{panelId:String(t),filePath:n,data:r})}function Xc(){if(!Wt()){console.warn("[bridge] No JUCE backend — openPanel ignored");return}window.__JUCE__.backend.emitEvent("openPanel",{})}function Vc(t){Wt()&&window.__JUCE__.backend.emitEvent("openPanelFile",{filePath:t})}function Jc(){Wt()&&window.__JUCE__.backend.emitEvent("loadOpenPanels",{})}function Zc(t){Wt()&&window.__JUCE__.backend.emitEvent("updateOpenPanels",t)}function di(t){if(!Wt()){console.warn("[bridge] No JUCE backend — browseImage ignored");return}window.__JUCE__.backend.emitEvent("browseImage",{requestId:t})}function Kc(t){if(!Wt())return()=>{};const n=window.__JUCE__.backend.addEventListener("imageBrowsed",t);return()=>window.__JUCE__.backend.removeEventListener(n)}function Qc(t){if(!Wt()){console.warn("[bridge] No JUCE backend — requestFileInfo ignored");return}window.__JUCE__.backend.emitEvent("requestFileInfo",{filePath:t})}function eu(t){if(!Wt())return()=>{};const n=window.__JUCE__.backend.addEventListener("fileInfo",t);return()=>window.__JUCE__.backend.removeEventListener(n)}function tu(t,n){if(!Wt()){console.warn("[bridge] No JUCE backend — requestFileData ignored");return}window.__JUCE__.backend.emitEvent("requestFileData",{requestId:t,filePath:n})}function nu(t){if(!Wt())return()=>{};const n=window.__JUCE__.backend.addEventListener("fileData",t);return()=>window.__JUCE__.backend.removeEventListener(n)}function ru(t){if(!Wt())return()=>{};const n=window.__JUCE__.backend.addEventListener("panelSaved",t);return()=>window.__JUCE__.backend.removeEventListener(n)}function au(t){if(!Wt())return()=>{};const n=window.__JUCE__.backend.addEventListener("panelOpened",t);return()=>window.__JUCE__.backend.removeEventListener(n)}function ou(t){if(!Wt())return()=>{};const n=window.__JUCE__.backend.addEventListener("openPanelPaths",t);return()=>window.__JUCE__.backend.removeEventListener(n)}let Pl=1;function Il(t=null){const n=Pl++;return{id:n,name:t??`Untitled ${n}`,scriptId:`panel_${n}`,author:"",version:"1.0.0",description:"",enabled:!0,locked:!1,filePath:null,width:600,height:400,resizable:!1,minWidth:0,minHeight:0,maxWidth:0,maxHeight:0,lockAspectRatio:!1,bgLayerOrder:["solid","gradient","image","texture"],bgSolid:!0,bgColour:"FF333333",bgGradientEnabled:!1,bgGradientOpacity:100,bgGradientName:"",bgGradient:{type:"linear",angle:90,centerX:50,centerY:50,radiusX:50,radiusY:50,edge:0,stops:[{color:"FF0000",position:0},{color:"0000FF",position:100}]},bgImageEnabled:!1,bgImage:"",bgImageOpacity:100,bgImageFit:"fill",bgImageAlign:"center",bgImageOffsetX:0,bgImageOffsetY:0,bgImageBlend:"normal",bgImageBlur:0,bgImageTint:"FFFFFF",bgImageFlipH:!1,bgImageFlipV:!1,bgImageRotation:0,bgImageGrayscale:!1,bgImageSaturation:100,bgImageBrightness:100,bgImageContrast:100,bgImageTileScale:1,bgTextureEnabled:!1,bgTexture:"",bgTextureOpacity:100,bgTextureFit:"tile",bgTextureAlign:"center",bgTextureOffsetX:0,bgTextureOffsetY:0,bgTextureBlend:"normal",bgTextureBlur:0,bgTextureTint:"FFFFFF",bgTextureFlipH:!1,bgTextureFlipV:!1,bgTextureRotation:0,bgTextureGrayscale:!1,bgTextureSaturation:100,bgTextureBrightness:100,bgTextureContrast:100,bgTextureTileScale:1,gridEnabled:!0,gridSize:10,gridColour:"33FFFFFF",gridLineWidth:1,gridType:"lines",gridSubdivision:1,gridOriginX:0,gridOriginY:0,snapToGrid:!0,notepad:{notes:[{name:"Note 1",content:""}],activeNoteIndex:0},viewer:{images:[],activeImageIndex:0},modified:!1,controls:[]}}const Rn=bn(null),er=bn(100),vi=bn(10),Gt=bn([]),Jt=bn(null),Do=qi([Gt,Jt],([t,n])=>t.find(r=>r.id===n)??null);function Ho(t=null){const n=t??Il();return Gt.update(r=>[...r,n]),Jt.set(n.id),n}function $o(t){Gt.update(n=>{const r=n.findIndex(o=>o.id===t),a=n.filter(o=>o.id!==t);return Jt.update(o=>{if(o!==t)return o;if(a.length===0)return null;const s=Math.min(r,a.length-1);return a[s].id}),a}),xo()}function iu(t){Jt.set(t)}function Me(t,n){Gt.update(r=>r.map(a=>{if(a.id!==t)return a;if(a.lockAspectRatio&&a.width>0&&a.height>0){const o=a.width/a.height;"width"in n&&!("height"in n)?n.height=Math.round(n.width/o):"height"in n&&!("width"in n)&&(n.width=Math.round(n.height*o))}return{...a,...n,modified:!0}}))}function El(t){const{id:n,modified:r,...a}=t;return JSON.stringify(a,null,2)}function lu(t,n,r){const a=JSON.parse(t),o=Pl++;return{...Il(),...a,id:o,filePath:n,name:r||a.name||`Untitled ${o}`,modified:!1}}function zl(){const t=tn(Do);t&&(t.filePath?Yc(String(t.id),t.filePath,El(t)):Nl())}function Nl(){const t=tn(Do);t&&Uc(String(t.id),El(t))}function su(){Xc()}function xo(){const n=tn(Gt).filter(r=>r.filePath).map(r=>r.filePath);Zc(n)}function cu(){ru(t=>{const n=parseInt(t.panelId,10),r={filePath:t.filePath,modified:!1};t.name&&(r.name=t.name),Gt.update(a=>a.map(o=>o.id===n?{...o,...r}:o)),xo()}),au(t=>{const n=tn(Gt).find(a=>a.filePath===t.filePath);if(n){Jt.set(n.id);return}const r=lu(t.data,t.filePath,t.name);Ho(r),xo()}),ou(t=>{if(Array.isArray(t))for(const n of t)Vc(n)}),Jc()}const Va={Core:{_type:"Core",name:"",controlType:"",visible:!0,enabled:!0,locked:!1,zIndex:0,alwaysOnTop:!1,layer:"Main"},Transform:{_type:"Transform",x:0,y:0,width:100,height:40,opacity:1,rotation:0},Background:{_type:"Background",mode:"solid",_children:{Fill:{_type:"Fill",mode:"solid",colour:"FF3A3A3A"}}},Text:{_type:"Text",content:"",_children:{Fill:{_type:"Fill",mode:"solid",colour:"FFFFFFFF"},Font:{_type:"Font",family:"Arial",weight:"Regular",style:"Normal",size:12},Position:{_type:"Position",justification:"centred",paddingLeft:4,paddingRight:4,paddingTop:2,paddingBottom:2}}},Border:{_type:"Border",enabled:!1,style:"solid",thickness:1,_children:{Fill:{_type:"Fill",colour:"FF888888"},Corners:{_type:"Corners",radius:0}}},Grid:{_type:"Grid",enabled:!0,visible:!0,columns:0,rows:0,cellWidth:0,cellHeight:0,snap:!1,size:10,colour:"33FFFFFF",lineWidth:1,style:"lines",_children:{Cells:{_type:"Cells"},Points:{_type:"Points"}}},Mouse:{_type:"Mouse",cursor:"default",interceptClicks:!0,interceptChildClicks:!1,bringToFrontOnClick:!1,draggable:!1,hitTestShape:"rectangle",focusable:!1,focusOutline:!1,tabIndex:-1},Icon:{_type:"Icon",source:"builtin",name:"",size:16,_children:{Fill:{_type:"Fill",mode:"solid",colour:"FFFFFFFF"}}},Shadow:{_type:"Shadow",enabled:!1,type:"drop",offsetX:0,offsetY:2,blur:4,spread:0,_children:{Fill:{_type:"Fill",colour:"66000000"}}},Children:{_type:"Children",layout:"none",gap:0,padding:0},States:{_type:"States",_children:{}},Scripts:{_type:"Scripts"},Animations:{_type:"Animations",_children:{}}},fi={Background:{sections:["Background"],defaultOverrides:{}},Label:{sections:["Background","Text"],defaultOverrides:{Transform:{width:100,height:24},Text:{content:"Label"}}},Button:{sections:["Background","Text","Border","Mouse","States","Scripts"],defaultOverrides:{Transform:{width:120,height:40},Text:{content:"Click Me"},Mouse:{cursor:"pointer",interceptClicks:!0,focusable:!0,tabIndex:0},Border:{enabled:!0}},defaultStates:["Hover","Pressed","Disabled","Focused"]},Container:{sections:["Background","Border","Grid","Children"],defaultOverrides:{Transform:{width:300,height:200},Grid:{enabled:!0,snap:!0,size:10}}}};let uu=1;function Ja(t){return JSON.parse(JSON.stringify(t))}function Kr(t,n){if(!n)return t;for(const[r,a]of Object.entries(n))r==="_children"||r==="_type"||(t[r]=a);return t}function du(t,n={}){var c,l;const r=fi[t];if(!r)throw new Error(`Unknown component type: "${t}". Available: ${Object.keys(fi).join(", ")}`);const a=`ctrl_${uu++}`,o={},s=Ja(Va.Core);s.id=a,s.controlType=t,s.name=n.name||`${t}_${a.replace("ctrl_","")}`,Kr(s,n.Core),o.Core=s;const i=Ja(Va.Transform);Kr(i,(c=r.defaultOverrides)==null?void 0:c.Transform),Kr(i,n.Transform),o.Transform=i;for(const u of r.sections){const f=Va[u];if(!f){console.warn(`[createControl] No defaults for section "${u}"`);continue}const m=Ja(f);Kr(m,(l=r.defaultOverrides)==null?void 0:l[u]),Kr(m,n[u]),o[u]=m}if(r.defaultStates&&o.States){o.States._children||(o.States._children={});for(const u of r.defaultStates)o.States._children[u]={_type:u}}return{_type:"Control",_children:o}}function Nn(t,n){var r;return((r=t==null?void 0:t._children)==null?void 0:r[n])??null}function vu(t,n){var r;return((r=t==null?void 0:t._children)==null?void 0:r[n])!=null}const fu=qi([Gt,Jt,Rn],([t,n,r])=>{if(r==null)return null;const a=t.find(o=>o.id===n);return a?a.controls.find(o=>{var s,i;return((i=(s=o._children)==null?void 0:s.Core)==null?void 0:i.id)===r})??null:null});function ma(t,n={}){const r=tn(Jt);if(r==null)return null;const a=du(t,n),o=a._children.Core.id;return Gt.update(s=>s.map(i=>i.id!==r?i:{...i,controls:[...i.controls,a],modified:!0})),Rn.set(o),a}function pu(t){const n=tn(Jt);n!=null&&(Gt.update(r=>r.map(a=>a.id!==n?a:{...a,controls:a.controls.filter(o=>{var s,i;return((i=(s=o._children)==null?void 0:s.Core)==null?void 0:i.id)!==t}),modified:!0})),tn(Rn)===t&&Rn.set(null))}function gu(t){const n=tn(Jt);if(n==null)return null;const r=tn(Gt).find(i=>i.id===n);if(!r)return null;const a=r.controls.find(i=>{var c,l;return((l=(c=i._children)==null?void 0:c.Core)==null?void 0:l.id)===t});if(!a)return null;const o=JSON.parse(JSON.stringify(a)),s=`ctrl_${Date.now()}`;return o._children.Core.id=s,o._children.Core.name=`${o._children.Core.name}_copy`,o._children.Transform&&(o._children.Transform.x+=20,o._children.Transform.y+=20),Gt.update(i=>i.map(c=>c.id!==n?c:{...c,controls:[...c.controls,o],modified:!0})),Rn.set(s),o}function en(t,n,r){const a=tn(Jt);a!=null&&Gt.update(o=>o.map(s=>{if(s.id!==a)return s;const i=s.controls.map(c=>{var u,f;if(((f=(u=c._children)==null?void 0:u.Core)==null?void 0:f.id)!==t)return c;const l=JSON.parse(JSON.stringify(c));return hu(l,n,r),l});return{...s,controls:i,modified:!0}}))}function hu(t,n,r){var i;const a=n.split(".");if(a.length===0)return;let o=(i=t._children)==null?void 0:i[a[0]];if(!o)return;for(let c=1;c<a.length-1;c++)if(o._children&&o._children[a[c]])o=o._children[a[c]];else return;const s=a[a.length-1];o[s]=r}var _u=I('<div class="dropdown-separator svelte-ilvwri"></div>'),bu=I('<span class="item-shortcut svelte-ilvwri"> </span>'),mu=I('<button class="dropdown-item svelte-ilvwri"><span class="item-label svelte-ilvwri"> </span> <!></button>'),$u=I('<div class="dropdown svelte-ilvwri"></div>'),xu=I('<div class="menu-wrapper svelte-ilvwri"><button> </button> <!></div>'),yu=I('<nav class="menubar svelte-ilvwri"></nav>');function wu(t,n){wt(n,!0);const r={File:[{label:"New Panel",shortcut:"Ctrl+N",action:()=>Ho()},{label:"Open Panel",shortcut:"Ctrl+O",action:()=>su()},{type:"separator"},{label:"Save",shortcut:"Ctrl+S",action:()=>zl()},{label:"Save As...",shortcut:"Ctrl+Shift+S",action:()=>Nl()},{type:"separator"},{label:"Close Panel",shortcut:"Ctrl+W",action:()=>{const f=tn(Jt);f!=null&&$o(f)}},{type:"separator"},{label:"Close Program",shortcut:"Alt+F4",action:()=>Wc()}],Edit:[{label:"Undo",shortcut:"Ctrl+Z",action:()=>{}},{label:"Redo",shortcut:"Ctrl+Y",action:()=>{}},{type:"separator"},{label:"Cut",shortcut:"Ctrl+X",action:()=>{}},{label:"Copy",shortcut:"Ctrl+C",action:()=>{}},{label:"Paste",shortcut:"Ctrl+V",action:()=>{}},{type:"separator"},{label:"Select All",shortcut:"Ctrl+A",action:()=>{}}],View:[{label:"Zoom In",shortcut:"Ctrl++",action:()=>{}},{label:"Zoom Out",shortcut:"Ctrl+-",action:()=>{}},{label:"Fit to Window",shortcut:"Ctrl+0",action:()=>{}},{type:"separator"},{label:"Toggle Grid",action:()=>{}},{label:"Toggle Snap",action:()=>{}}],Insert:[{label:"Background",action:()=>ma("Background")},{label:"Label",action:()=>ma("Label")},{label:"Button",action:()=>ma("Button")},{label:"Container",action:()=>ma("Container")}],Panel:[{label:"Panel Properties...",action:()=>{}},{label:"Export Settings...",action:()=>{}}],Build:[{label:"Build VST3",action:()=>{}},{label:"Build Standalone",action:()=>{}},{type:"separator"},{label:"Build Settings...",action:()=>{}}],Help:[{label:"Documentation",action:()=>{}},{label:"About CEditor",action:()=>{}}]},a=Object.keys(r);let o=Z(null);function s(f){b(o,e(o)===f?null:f,!0)}function i(f){f.action&&f.action(),b(o,null)}function c(f){e(o)&&!f.target.closest(".menubar")&&b(o,null)}function l(f){e(o)!==null&&b(o,f,!0)}var u=yu();Mt("click",Cr,c),$t(u,21,()=>a,zt,(f,m)=>{var _=xu(),p=v(_);let g;var $=v(p),w=d(p,2);{var k=L=>{var H=$u();$t(H,21,()=>r[e(m)],zt,(P,E)=>{var Q=pe(),O=U(Q);{var z=W=>{var Se=_u();h(W,Se)},re=W=>{var Se=mu(),Pe=v(Se),Ke=v(Pe),Ge=d(Pe,2);{var Ye=B=>{var y=bu(),N=v(y);te(()=>et(N,e(E).shortcut)),h(B,y)};je(Ge,B=>{e(E).shortcut&&B(Ye)})}te(()=>et(Ke,e(E).label)),x("click",Se,()=>i(e(E))),h(W,Se)};je(O,W=>{e(E).type==="separator"?W(z):W(re,-1)})}h(P,Q)}),h(L,H)};je(w,L=>{e(o)===e(m)&&L(k)})}te(()=>{g=We(p,1,"menu-item svelte-ilvwri",null,g,{active:e(o)===e(m)}),et($,e(m))}),x("click",p,()=>s(e(m))),Mt("mouseenter",p,()=>l(e(m))),h(f,_)}),h(t,u),kt()}Tt(["click"]);zs();/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 * 
 * Copyright (c) 2026 Lucide Icons and Contributors
 * 
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 * 
 * ---
 * 
 * The following Lucide icons are derived from the Feather project:
 * 
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 * 
 * The MIT License (MIT) (for the icons listed above)
 * 
 * Copyright (c) 2013-present Cole Bemis
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 * 
 */const ku={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":2,"stroke-linecap":"round","stroke-linejoin":"round"};/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 * 
 * Copyright (c) 2026 Lucide Icons and Contributors
 * 
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 * 
 * ---
 * 
 * The following Lucide icons are derived from the Feather project:
 * 
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 * 
 * The MIT License (MIT) (for the icons listed above)
 * 
 * Copyright (c) 2013-present Cole Bemis
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 * 
 */const Su=t=>{for(const n in t)if(n.startsWith("aria-")||n==="role"||n==="title")return!0;return!1};/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 * 
 * Copyright (c) 2026 Lucide Icons and Contributors
 * 
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 * 
 * ---
 * 
 * The following Lucide icons are derived from the Feather project:
 * 
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 * 
 * The MIT License (MIT) (for the icons listed above)
 * 
 * Copyright (c) 2013-present Cole Bemis
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 * 
 */const pi=(...t)=>t.filter((n,r,a)=>!!n&&n.trim()!==""&&a.indexOf(n)===r).join(" ").trim();var Cu=Lo("<svg><!><!></svg>");function Ne(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]),a=Te(r,["name","color","size","strokeWidth","absoluteStrokeWidth","iconNode"]);wt(n,!1);let o=He(n,"name",8,void 0),s=He(n,"color",8,"currentColor"),i=He(n,"size",8,24),c=He(n,"strokeWidth",8,2),l=He(n,"absoluteStrokeWidth",8,!1),u=He(n,"iconNode",24,()=>[]);qc();var f=Cu();li(f,(p,g,$)=>({...ku,...p,...a,width:i(),height:i(),stroke:s(),"stroke-width":g,class:$}),[()=>Su(a)?void 0:{"aria-hidden":"true"},()=>(fr(l()),fr(c()),fr(i()),Jn(()=>l()?Number(c())*24/Number(i()):c())),()=>(fr(pi),fr(o()),fr(r),Jn(()=>pi("lucide-icon","lucide",o()?`lucide-${o()}`:"",r.class)))]);var m=v(f);$t(m,1,u,zt,(p,g)=>{var $=S(()=>ns(e(g),2));let w=()=>e($)[0],k=()=>e($)[1];var L=pe(),H=U(L);Pc(H,w,!0,(P,E)=>{li(P,()=>({...k()}))}),h(p,L)});var _=d(m);Ie(_,n,"default",{}),h(t,f),kt()}function Mu(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"}]];Ne(t,ze({name:"activity"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function Tu(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"M12 17V3"}],["path",{d:"m6 11 6 6 6-6"}],["path",{d:"M19 21H5"}]];Ne(t,ze({name:"arrow-down-to-line"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function Pu(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"m12 19-7-7 7-7"}],["path",{d:"M19 12H5"}]];Ne(t,ze({name:"arrow-left"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function Iu(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"M2 10v3"}],["path",{d:"M6 6v11"}],["path",{d:"M10 3v18"}],["path",{d:"M14 8v7"}],["path",{d:"M18 5v13"}],["path",{d:"M22 10v3"}]];Ne(t,ze({name:"audio-lines"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function Eu(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["circle",{cx:"9",cy:"9",r:"7"}],["circle",{cx:"15",cy:"15",r:"7"}]];Ne(t,ze({name:"blend"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function zu(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"}]];Ne(t,ze({name:"bold"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function Nu(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"}],["path",{d:"m3.3 7 8.7 5 8.7-5"}],["path",{d:"M12 22V12"}]];Ne(t,ze({name:"box"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function Fu(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2"}],["path",{d:"M12 9v6"}],["path",{d:"M16 15v6"}],["path",{d:"M16 3v6"}],["path",{d:"M3 15h18"}],["path",{d:"M3 9h18"}],["path",{d:"M8 15v6"}],["path",{d:"M8 3v6"}]];Ne(t,ze({name:"brick-wall"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function Au(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"M20 6 9 17l-5-5"}]];Ne(t,ze({name:"check"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function Go(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"m6 9 6 6 6-6"}]];Ne(t,ze({name:"chevron-down"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function ju(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"m18 15-6-6-6 6"}]];Ne(t,ze({name:"chevron-up"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function Ou(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"m9 18 6-6-6-6"}]];Ne(t,ze({name:"chevron-right"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function gi(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["circle",{cx:"12",cy:"12",r:"10"}]];Ne(t,ze({name:"circle"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function Ru(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["rect",{width:"14",height:"14",x:"8",y:"8",rx:"2",ry:"2"}],["path",{d:"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"}]];Ne(t,ze({name:"copy"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function Lu(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"}],["path",{d:"M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"}]];Ne(t,ze({name:"droplets"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function qu(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z"}]];Ne(t,ze({name:"funnel"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function Za(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2"}],["path",{d:"M3 9h18"}],["path",{d:"M3 15h18"}],["path",{d:"M9 3v18"}],["path",{d:"M15 3v18"}]];Ne(t,ze({name:"grid-3x3"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function Bu(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"M16 5h6"}],["path",{d:"M19 2v6"}],["path",{d:"M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5"}],["path",{d:"m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"}],["circle",{cx:"9",cy:"9",r:"2"}]];Ne(t,ze({name:"image-plus"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function Fl(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",ry:"2"}],["circle",{cx:"9",cy:"9",r:"2"}],["path",{d:"m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"}]];Ne(t,ze({name:"image"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function Du(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["line",{x1:"19",x2:"10",y1:"4",y2:"4"}],["line",{x1:"14",x2:"5",y1:"20",y2:"20"}],["line",{x1:"15",x2:"9",y1:"4",y2:"20"}]];Ne(t,ze({name:"italic"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function Hu(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"}],["path",{d:"M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"}],["path",{d:"M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"}]];Ne(t,ze({name:"layers"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function Gu(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["rect",{width:"7",height:"9",x:"3",y:"3",rx:"1"}],["rect",{width:"7",height:"5",x:"14",y:"3",rx:"1"}],["rect",{width:"7",height:"9",x:"14",y:"12",rx:"1"}],["rect",{width:"7",height:"5",x:"3",y:"16",rx:"1"}]];Ne(t,ze({name:"layout-dashboard"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function Wu(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["rect",{width:"7",height:"7",x:"3",y:"3",rx:"1"}],["rect",{width:"7",height:"7",x:"14",y:"3",rx:"1"}],["rect",{width:"7",height:"7",x:"14",y:"14",rx:"1"}],["rect",{width:"7",height:"7",x:"3",y:"14",rx:"1"}]];Ne(t,ze({name:"layout-grid"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function Uu(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"}],["path",{d:"M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"}]];Ne(t,ze({name:"link"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function Yu(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"M11 5h10"}],["path",{d:"M11 12h10"}],["path",{d:"M11 19h10"}],["path",{d:"M4 4h1v5"}],["path",{d:"M4 9h2"}],["path",{d:"M6.5 20H3.4c0-1 2.6-1.925 2.6-3.5a1.5 1.5 0 0 0-2.6-1.02"}]];Ne(t,ze({name:"list-ordered"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function Xu(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"M3 5h.01"}],["path",{d:"M3 12h.01"}],["path",{d:"M3 19h.01"}],["path",{d:"M8 5h13"}],["path",{d:"M8 12h13"}],["path",{d:"M8 19h13"}]];Ne(t,ze({name:"list"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function Vu(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["rect",{width:"18",height:"11",x:"3",y:"11",rx:"2",ry:"2"}],["path",{d:"M7 11V7a5 5 0 0 1 9.9-1"}]];Ne(t,ze({name:"lock-open"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function Ju(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["rect",{width:"18",height:"11",x:"3",y:"11",rx:"2",ry:"2"}],["path",{d:"M7 11V7a5 5 0 0 1 10 0v4"}]];Ne(t,ze({name:"lock"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function Zu(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"m12 15 4 4"}],["path",{d:"M2.352 10.648a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l6.029-6.029a1 1 0 1 1 3 3l-6.029 6.029a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l6.365-6.367A1 1 0 0 0 8.716 4.282z"}],["path",{d:"m5 8 4 4"}]];Ne(t,ze({name:"magnet"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function Al(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"M8 3H5a2 2 0 0 0-2 2v3"}],["path",{d:"M21 8V5a2 2 0 0 0-2-2h-3"}],["path",{d:"M3 16v3a2 2 0 0 0 2 2h3"}],["path",{d:"M16 21h3a2 2 0 0 0 2-2v-3"}]];Ne(t,ze({name:"maximize"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function Ku(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["rect",{width:"20",height:"14",x:"2",y:"3",rx:"2"}],["line",{x1:"8",x2:"16",y1:"21",y2:"21"}],["line",{x1:"12",x2:"12",y1:"17",y2:"21"}]];Ne(t,ze({name:"monitor"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function Qu(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"}]];Ne(t,ze({name:"moon"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function ed(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z"}]];Ne(t,ze({name:"mouse-pointer-2"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function td(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"M12.586 12.586 19 19"}],["path",{d:"M3.688 3.037a.497.497 0 0 0-.651.651l6.5 15.999a.501.501 0 0 0 .947-.062l1.569-6.083a2 2 0 0 1 1.448-1.479l6.124-1.579a.5.5 0 0 0 .063-.947z"}]];Ne(t,ze({name:"mouse-pointer"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function jl(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"M12 2v20"}],["path",{d:"m15 19-3 3-3-3"}],["path",{d:"m19 9 3 3-3 3"}],["path",{d:"M2 12h20"}],["path",{d:"m5 9-3 3 3 3"}],["path",{d:"m9 5 3-3 3 3"}]];Ne(t,ze({name:"move"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function nd(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"M11 7 6 2"}],["path",{d:"M18.992 12H2.041"}],["path",{d:"M21.145 18.38A3.34 3.34 0 0 1 20 16.5a3.3 3.3 0 0 1-1.145 1.88c-.575.46-.855 1.02-.855 1.595A2 2 0 0 0 20 22a2 2 0 0 0 2-2.025c0-.58-.285-1.13-.855-1.595"}],["path",{d:"m8.5 4.5 2.148-2.148a1.205 1.205 0 0 1 1.704 0l7.296 7.296a1.205 1.205 0 0 1 0 1.704l-7.592 7.592a3.615 3.615 0 0 1-5.112 0l-3.888-3.888a3.615 3.615 0 0 1 0-5.112L5.67 7.33"}]];Ne(t,ze({name:"paint-bucket"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function hi(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"m14.622 17.897-10.68-2.913"}],["path",{d:"M18.376 2.622a1 1 0 1 1 3.002 3.002L17.36 9.643a.5.5 0 0 0 0 .707l.944.944a2.41 2.41 0 0 1 0 3.408l-.944.944a.5.5 0 0 1-.707 0L8.354 7.348a.5.5 0 0 1 0-.707l.944-.944a2.41 2.41 0 0 1 3.408 0l.944.944a.5.5 0 0 0 .707 0z"}],["path",{d:"M9 8c-1.804 2.71-3.97 3.46-6.583 3.948a.507.507 0 0 0-.302.819l7.32 8.883a1 1 0 0 0 1.185.204C12.735 20.405 16 16.792 16 15"}]];Ne(t,ze({name:"paintbrush"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function rd(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2"}],["path",{d:"M3 15h18"}]];Ne(t,ze({name:"panel-bottom"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function ad(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2"}],["path",{d:"M15 3v18"}]];Ne(t,ze({name:"panel-right"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function Ol(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"m12 9-8.414 8.414A2 2 0 0 0 3 18.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 3.828 21h1.344a2 2 0 0 0 1.414-.586L15 12"}],["path",{d:"m18 9 .4.4a1 1 0 1 1-3 3l-3.8-3.8a1 1 0 1 1 3-3l.4.4 3.4-3.4a1 1 0 1 1 3 3z"}],["path",{d:"m2 22 .414-.414"}]];Ne(t,ze({name:"pipette"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function Ra(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"M5 12h14"}],["path",{d:"M12 5v14"}]];Ne(t,ze({name:"plus"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function Rl(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["rect",{width:"20",height:"12",x:"2",y:"6",rx:"2"}]];Ne(t,ze({name:"rectangle-horizontal"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function od(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"m15 14 5-5-5-5"}],["path",{d:"M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"}]];Ne(t,ze({name:"redo-2"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function id(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"M4 7V4h16v3"}],["path",{d:"M5 20h6"}],["path",{d:"M13 4 8 20"}],["path",{d:"m15 15 5 5"}],["path",{d:"m20 15-5 5"}]];Ne(t,ze({name:"remove-formatting"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function Ll(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"}],["path",{d:"M3 3v5h5"}]];Ne(t,ze({name:"rotate-ccw"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function ld(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"}],["path",{d:"M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"}],["path",{d:"M7 3v4a1 1 0 0 0 1 1h7"}]];Ne(t,ze({name:"save"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function sd(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"M14 17H5"}],["path",{d:"M19 7h-9"}],["circle",{cx:"17",cy:"17",r:"3"}],["circle",{cx:"7",cy:"7",r:"3"}]];Ne(t,ze({name:"settings-2"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function cd(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"M10 5H3"}],["path",{d:"M12 19H3"}],["path",{d:"M14 3v4"}],["path",{d:"M16 17v4"}],["path",{d:"M21 12h-9"}],["path",{d:"M21 19h-5"}],["path",{d:"M21 5h-7"}],["path",{d:"M8 10v4"}],["path",{d:"M8 12H3"}]];Ne(t,ze({name:"sliders-horizontal"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function ud(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"}],["path",{d:"M20 2v4"}],["path",{d:"M22 4h-4"}],["circle",{cx:"4",cy:"20",r:"2"}]];Ne(t,ze({name:"sparkles"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function dd(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"M5 3a2 2 0 0 0-2 2"}],["path",{d:"M19 3a2 2 0 0 1 2 2"}],["path",{d:"M21 19a2 2 0 0 1-2 2"}],["path",{d:"M5 21a2 2 0 0 1-2-2"}],["path",{d:"M9 3h1"}],["path",{d:"M9 21h1"}],["path",{d:"M14 3h1"}],["path",{d:"M14 21h1"}],["path",{d:"M3 9v1"}],["path",{d:"M21 9v1"}],["path",{d:"M3 14v1"}],["path",{d:"M21 14v1"}]];Ne(t,ze({name:"square-dashed"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function vd(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"M4 10c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2"}],["path",{d:"M10 16c-1.1 0-2-.9-2-2v-4c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2"}],["rect",{width:"8",height:"8",x:"14",y:"14",rx:"2"}]];Ne(t,ze({name:"square-stack"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function ql(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2"}]];Ne(t,ze({name:"square"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function fd(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"M16 4H9a3 3 0 0 0-2.83 4"}],["path",{d:"M14 12a4 4 0 0 1 0 8H6"}],["line",{x1:"4",x2:"20",y1:"12",y2:"12"}]];Ne(t,ze({name:"strikethrough"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function pd(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["circle",{cx:"12",cy:"12",r:"4"}],["path",{d:"M12 2v2"}],["path",{d:"M12 20v2"}],["path",{d:"m4.93 4.93 1.41 1.41"}],["path",{d:"m17.66 17.66 1.41 1.41"}],["path",{d:"M2 12h2"}],["path",{d:"M20 12h2"}],["path",{d:"m6.34 17.66-1.41 1.41"}],["path",{d:"m19.07 4.93-1.41 1.41"}]];Ne(t,ze({name:"sun"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function gd(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"M21 5H3"}],["path",{d:"M21 12H9"}],["path",{d:"M21 19H7"}]];Ne(t,ze({name:"text-align-end"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function hd(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"M21 5H3"}],["path",{d:"M17 12H7"}],["path",{d:"M19 19H5"}]];Ne(t,ze({name:"text-align-center"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function _d(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"M21 5H3"}],["path",{d:"M15 12H3"}],["path",{d:"M17 19H3"}]];Ne(t,ze({name:"text-align-start"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function bd(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"}]];Ne(t,ze({name:"thermometer"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function md(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"M10 11v6"}],["path",{d:"M14 11v6"}],["path",{d:"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"}],["path",{d:"M3 6h18"}],["path",{d:"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"}]];Ne(t,ze({name:"trash-2"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function $d(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"M13.73 4a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"}]];Ne(t,ze({name:"triangle"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function Bl(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"M12 4v16"}],["path",{d:"M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2"}],["path",{d:"M9 20h6"}]];Ne(t,ze({name:"type"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function xd(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"M6 4v6a6 6 0 0 0 12 0V4"}],["line",{x1:"4",x2:"20",y1:"20",y2:"20"}]];Ne(t,ze({name:"underline"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function yd(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"M9 14 4 9l5-5"}],["path",{d:"M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"}]];Ne(t,ze({name:"undo-2"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function La(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"M18 6 6 18"}],["path",{d:"m6 6 12 12"}]];Ne(t,ze({name:"x"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function wd(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["path",{d:"M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"}]];Ne(t,ze({name:"zap"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function Dl(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["circle",{cx:"11",cy:"11",r:"8"}],["line",{x1:"21",x2:"16.65",y1:"21",y2:"16.65"}],["line",{x1:"11",x2:"11",y1:"8",y2:"14"}],["line",{x1:"8",x2:"14",y1:"11",y2:"11"}]];Ne(t,ze({name:"zoom-in"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}function kd(t,n){const r=Te(n,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v1.0.1 - ISC
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const a=[["circle",{cx:"11",cy:"11",r:"8"}],["line",{x1:"21",x2:"16.65",y1:"21",y2:"16.65"}],["line",{x1:"8",x2:"14",y1:"11",y2:"11"}]];Ne(t,ze({name:"zoom-out"},()=>r,{get iconNode(){return a},children:(o,s)=>{var i=pe(),c=U(i);Ie(c,n,"default",{}),h(o,i)},$$slots:{default:!0}}))}var Sd=I("<button><!></button>"),Cd=I('<button class="icon-btn svelte-84a5bx"><!></button>'),Md=I('<div class="icon-panel svelte-84a5bx"><div class="tool-section svelte-84a5bx"></div> <div class="separator svelte-84a5bx"></div> <div class="component-section svelte-84a5bx"></div> <div class="spacer svelte-84a5bx"></div> <div class="separator svelte-84a5bx"></div> <div class="panel-toggles svelte-84a5bx"><button title="Toggle Display Panel"><!></button> <button title="Toggle Properties Panel"><!></button></div></div>');function Td(t,n){let r=He(n,"showDisplayPanel",3,!0),a=He(n,"showPropertiesPanel",3,!0),o=He(n,"onToggleDisplay",3,()=>{}),s=He(n,"onToggleProperties",3,()=>{}),i=Z("select");const c=[{id:"select",icon:ed,label:"Select"},{id:"move",icon:jl,label:"Move"},{id:"zoom",icon:Dl,label:"Zoom"}],l=[{id:"button",icon:Rl,label:"Button"},{id:"label",icon:Bl,label:"Label"},{id:"slider",icon:cd,label:"Slider"},{id:"combobox",icon:Go,label:"ComboBox"},{id:"backdrop",icon:ql,label:"Backdrop"},{id:"grid",icon:Wu,label:"Grid"},{id:"envelope",icon:Mu,label:"Envelope"},{id:"filter",icon:Iu,label:"Filter"}];var u=Md(),f=v(u);$t(f,21,()=>c,zt,(H,P)=>{var E=Sd();let Q;var O=v(E);mo(O,()=>e(P).icon,(z,re)=>{re(z,{size:18,strokeWidth:1.5})}),te(()=>{Q=We(E,1,"icon-btn svelte-84a5bx",null,Q,{active:e(i)===e(P).id}),ut(E,"title",e(P).label)}),x("click",E,()=>b(i,e(P).id,!0)),h(H,E)});var m=d(f,4);$t(m,21,()=>l,zt,(H,P)=>{var E=Cd(),Q=v(E);mo(Q,()=>e(P).icon,(O,z)=>{z(O,{size:18,strokeWidth:1.5})}),te(()=>ut(E,"title",e(P).label)),h(H,E)});var _=d(m,6),p=v(_);let g;var $=v(p);rd($,{size:18,strokeWidth:1.5});var w=d(p,2);let k;var L=v(w);ad(L,{size:18,strokeWidth:1.5}),te(()=>{g=We(p,1,"icon-btn svelte-84a5bx",null,g,{active:r()}),k=We(w,1,"icon-btn svelte-84a5bx",null,k,{active:a()})}),x("click",p,function(...H){var P;(P=o())==null||P.apply(this,H)}),x("click",w,function(...H){var P;(P=s())==null||P.apply(this,H)}),h(t,u)}Tt(["click"]);function $a(t,n){const r=[...t].sort((i,c)=>i.position-c.position);let a=typeof n=="number"?n:n==="hard"?100:0;if(a=Math.max(0,Math.min(100,a)),a===0)return r.map(i=>`#${i.color} ${i.position}%`).join(", ");const o=a/100,s=[];for(let i=0;i<r.length;i++){const c=r[i],l=r[i+1];if(!l)s.push(`#${c.color} ${c.position}%`);else{const u=(c.position+l.position)/2,f=c.position+(u-c.position)*o,m=l.position-(l.position-u)*o;s.push(`#${c.color} ${c.position}%`),s.push(`#${c.color} ${f}%`),s.push(`#${l.color} ${m}%`)}}return s.join(", ")}function Ur(t,n="rectangle"){var l,u,f,m,_;if(!t||!t.stops||t.stops.length<2)return"#333333";const r=$a(t.stops,t.edge??"soft"),a=t.angle??90,o=t.centerX??50,s=t.centerY??50,i=t.radiusX??50,c=n==="circle"||n==="square"?i:t.radiusY??50;switch(t.type){case"linear":return`linear-gradient(${a}deg, ${r})`;case"radial":return`radial-gradient(ellipse ${i}% ${c}% at ${o}% ${s}%, ${r})`;case"conical":return`conic-gradient(from ${a}deg at ${o}% ${s}%, ${r})`;case"radialRamp":{const g=[...t.stops].sort((w,k)=>w.position-k.position).map(w=>({...w,position:parseFloat((w.position/100*i).toFixed(1))})),$=$a(g,t.edge??0);return`repeating-radial-gradient(ellipse at ${o}% ${s}%, ${$})`}case"linearRamp":{const p=[...t.stops].sort((k,L)=>k.position-L.position),g=i,$=p.map(k=>({...k,position:parseFloat((k.position/100*g).toFixed(1))})),w=$a($,t.edge??0);return`repeating-linear-gradient(${a}deg, ${w})`}case"squareRamp":return"#333";case"duotone":{const p=[...t.stops].sort((w,k)=>w.position-k.position),g=((l=p[0])==null?void 0:l.color)||"000000",$=((u=p[p.length-1])==null?void 0:u.color)||"FFFFFF";return`linear-gradient(${a}deg, #${g} 0%, #${$} 100%)`}case"tricolor":{const p=[...t.stops].sort((k,L)=>k.position-L.position),g=((f=p[0])==null?void 0:f.color)||"000000",$=((m=p[Math.floor(p.length/2)])==null?void 0:m.color)||"888888",w=((_=p[p.length-1])==null?void 0:_.color)||"FFFFFF";return`linear-gradient(${a}deg, #${g} 0%, #${$} 50%, #${w} 100%)`}case"banding":{const p=$a(t.stops,"hard");return`linear-gradient(${a}deg, ${p})`}case"reflected":{const p=[...t.stops].sort(($,w)=>$.position-w.position),g=[];for(let $=p.length-1;$>=0;$--){const w=50-p[$].position/100*50;g.push(`#${p[$].color} ${w}%`)}for(let $=1;$<p.length;$++){const w=50+p[$].position/100*50;g.push(`#${p[$].color} ${w}%`)}return`linear-gradient(${a}deg, ${g.join(", ")})`}case"mesh":case"volumeMesh":return(t.meshPoints||t.stops.map((g,$)=>({x:$/Math.max(t.stops.length-1,1)*80+10,y:$%2*60+20,color:g.color}))).map(g=>`radial-gradient(circle at ${g.x}% ${g.y}%, #${g.color} 0%, transparent 70%)`).join(", ");default:return`linear-gradient(${t.angle}deg, ${r})`}}function Hl(t){return""}function Gl(t){return(t==null?void 0:t.type)==="volumeMesh"?"blur(50px)":""}function Pd(t,n){const r=[...t].sort((p,g)=>p.position-g.position);if(n<=r[0].position)return r[0].color;if(n>=r[r.length-1].position)return r[r.length-1].color;let a=r[0],o=r[r.length-1];for(let p=0;p<r.length-1;p++)if(n>=r[p].position&&n<=r[p+1].position){a=r[p],o=r[p+1];break}const s=(n-a.position)/(o.position-a.position),i=parseInt(a.color.slice(0,2),16),c=parseInt(a.color.slice(2,4),16),l=parseInt(a.color.slice(4,6),16),u=parseInt(o.color.slice(0,2),16),f=parseInt(o.color.slice(2,4),16),m=parseInt(o.color.slice(4,6),16),_=p=>Math.round(p).toString(16).padStart(2,"0").toUpperCase();return _(i+(u-i)*s)+_(c+(f-c)*s)+_(l+(m-l)*s)}function Id(t,n){const r=[...t].sort((_,p)=>_.position-p.position);if(n<=r[0].position){const _=r[0].color;return[parseInt(_.slice(0,2),16),parseInt(_.slice(2,4),16),parseInt(_.slice(4,6),16)]}if(n>=r[r.length-1].position){const _=r[r.length-1].color;return[parseInt(_.slice(0,2),16),parseInt(_.slice(2,4),16),parseInt(_.slice(4,6),16)]}let a=r[0],o=r[r.length-1];for(let _=0;_<r.length-1;_++)if(n>=r[_].position&&n<=r[_+1].position){a=r[_],o=r[_+1];break}const s=(n-a.position)/(o.position-a.position),i=parseInt(a.color.slice(0,2),16),c=parseInt(a.color.slice(2,4),16),l=parseInt(a.color.slice(4,6),16),u=parseInt(o.color.slice(0,2),16),f=parseInt(o.color.slice(2,4),16),m=parseInt(o.color.slice(4,6),16);return[Math.round(i+(u-i)*s),Math.round(c+(f-c)*s),Math.round(l+(m-l)*s)]}function Wl(t,n=256,r=256){const a=document.createElement("canvas");a.width=n,a.height=r;const o=a.getContext("2d"),s=o.createImageData(n,r),i=(t.centerX??50)/100*n,c=(t.centerY??50)/100*r,l=(t.radiusX??50)/100*n,u=(t.radiusY??50)/100*r,f=t.stops||[];for(let m=0;m<r;m++)for(let _=0;_<n;_++){const p=Math.abs(_-i)/(l||1),g=Math.abs(m-c)/(u||1);let $=Math.max(p,g);$=$%1;const w=$*100,[k,L,H]=Id(f,w),P=(m*n+_)*4;s.data[P]=k,s.data[P+1]=L,s.data[P+2]=H,s.data[P+3]=255}return o.putImageData(s,0,0),a.toDataURL()}const Pa=bn({});let Ed=0;const Ia=new Map;let _i=!1;function zd(){_i||(_i=!0,nu(t=>{const{requestId:n,data:r}=t,a=Ia.get(n);a&&(Ia.delete(n),Pa.update(o=>({...o,[a]:r})))}))}function bi(t){if(!t||tn(Pa)[t])return;if(!Wt()){Pa.update(a=>({...a,[t]:t}));return}zd();for(const a of Ia.values())if(a===t)return;const r=`file_${++Ed}`;Ia.set(r,t),tu(r,t)}var Nd=I('<span class="modified-dot svelte-17p2z4b">●</span>'),Fd=I('<div><span class="tab-name svelte-17p2z4b"> <!></span> <button class="tab-close svelte-17p2z4b" title="Close"><!></button></div>'),Ad=I('<div class="tab-bar svelte-17p2z4b"><div class="tabs svelte-17p2z4b"></div> <button class="new-tab-btn svelte-17p2z4b" title="New Panel"><!></button></div>');function jd(t,n){wt(n,!0);const r=()=>Nt(Gt,"$panels",o),a=()=>Nt(Jt,"$activePanelId",o),[o,s]=cr();let i=S(r),c=S(a);function l(p,g){p.button===1&&(p.preventDefault(),$o(g))}var u=Ad(),f=v(u);$t(f,21,()=>e(i),p=>p.id,(p,g)=>{var $=Fd();let w;var k=v($),L=v(k),H=d(L);{var P=O=>{var z=Nd();h(O,z)};je(H,O=>{e(g).modified&&O(P)})}var E=d(k,2),Q=v(E);La(Q,{size:12,strokeWidth:1.5}),te(()=>{w=We($,1,"tab svelte-17p2z4b",null,w,{active:e(g).id===e(c)}),et(L,`${e(g).name??""} `)}),x("click",$,()=>iu(e(g).id)),x("mousedown",$,O=>l(O,e(g).id)),x("click",E,O=>{O.stopPropagation(),$o(e(g).id)}),h(p,$)});var m=d(f,2),_=v(m);Ra(_,{size:14,strokeWidth:1.5}),x("click",m,()=>Ho()),h(t,u),kt(),s()}Tt(["click","mousedown"]);var Od=I('<div class="bg-renderer svelte-tbpnsn"></div>');function Rd(t,n){wt(n,!0);let r=He(n,"background",3,null),a=S(()=>{var c,l,u;if(!r())return"background: transparent;";const s=r().mode||"solid",i=(c=r()._children)==null?void 0:c.Fill;if(s==="solid"&&(i!=null&&i.colour))return`background: #${i.colour.slice(-6)};`;if(s==="gradient"&&((u=(l=r()._children)==null?void 0:l.Fill)!=null&&u.Gradient)){const f=r()._children.Fill.Gradient;return`background: ${Ur(f)};`}return"background: transparent;"});var o=Od();te(()=>Ue(o,e(a))),h(t,o),kt()}var Ld=I('<div class="resize-handle svelte-1aohjhs"></div>'),qd=I("<div></div>"),Bd=I('<div><!> <span class="control-label svelte-1aohjhs"> </span> <!></div> <!>',1);function Dd(t,n){wt(n,!0);const r=()=>Nt(Rn,"$selectedComponentId",a),[a,o]=cr();let s=He(n,"scale",3,1),i=He(n,"snapToGrid",3,!1),c=He(n,"gridSize",3,10),l=He(n,"allControls",19,()=>[]),u=He(n,"onDragStart",3,null),f=He(n,"onDragEnd",3,null),m=S(()=>Nn(n.control,"Core")),_=S(()=>Nn(n.control,"Transform")),p=S(()=>Nn(n.control,"Background")),g=S(()=>{var C;return((C=e(m))==null?void 0:C.id)!=null&&r()===e(m).id}),$=S(()=>{var C;return((C=e(m))==null?void 0:C.locked)===!0}),w=S(()=>{var C;return((C=e(m))==null?void 0:C.visible)!==!1}),k=Z(!1),L=Z(At({x:0,y:0})),H=Z(At({x:0,y:0})),P=Z(!1),E=Z(""),Q=Z(At({x:0,y:0})),O=Z(At({x:0,y:0,w:0,h:0})),z=Z(null),re=Z(null),W=Z(null),Se=Z(null),Pe=S(()=>{var C;return e(z)??((C=e(_))==null?void 0:C.x)??0}),Ke=S(()=>{var C;return e(re)??((C=e(_))==null?void 0:C.y)??0}),Ge=S(()=>{var C;return e(W)??((C=e(_))==null?void 0:C.width)??100}),Ye=S(()=>{var C;return e(Se)??((C=e(_))==null?void 0:C.height)??40});const B=10,y=5;function N(C){return!i()||c()<=0?C:Math.round(C/c())*c()}let ne=Z(At([]));function ye(C,q,V,ae){var ve;if(!l()||l().length===0)return[];const X=[],de={left:C,centerX:C+V/2,right:C+V,top:q,centerY:q+ae/2,bottom:q+ae};for(const fe of l()){const me=Nn(fe,"Core"),$e=Nn(fe,"Transform");if(!$e||(me==null?void 0:me.id)===((ve=e(m))==null?void 0:ve.id))continue;const Be=$e.x,J=$e.y,ke=$e.width,qe=$e.height,xe={left:Be,centerX:Be+ke/2,right:Be+ke,top:J,centerY:J+qe/2,bottom:J+qe};for(const[,ge]of Object.entries(de))if(!(ge===de.top||ge===de.centerY||ge===de.bottom))for(const[,K]of Object.entries(xe))K===xe.top||K===xe.centerY||K===xe.bottom||Math.abs(ge-K)<y&&X.push({type:"vertical",pos:K});for(const[,ge]of Object.entries(de))if(!(ge===de.left||ge===de.centerX||ge===de.right))for(const[,K]of Object.entries(xe))K===xe.left||K===xe.centerX||K===xe.right||Math.abs(ge-K)<y&&X.push({type:"horizontal",pos:K})}return X}function Ee(C){var q,V,ae,X;C.button===0&&(C.stopPropagation(),Rn.set(((q=e(m))==null?void 0:q.id)??null),!(e($)||e(P))&&(b(k,!0),b(L,{x:C.clientX,y:C.clientY},!0),b(H,{x:((V=e(_))==null?void 0:V.x)??0,y:((ae=e(_))==null?void 0:ae.y)??0},!0),b(z,e(H).x,!0),b(re,e(H).y,!0),(X=u())==null||X(),window.addEventListener("mousemove",M),window.addEventListener("mouseup",G)))}function M(C){if(!e(k))return;const q=(C.clientX-e(L).x)/s(),V=(C.clientY-e(L).y)/s();let ae=e(H).x+q,X=e(H).y+V;i()&&c()>0&&(ae=N(ae),X=N(X)),b(z,Math.round(ae),!0),b(re,Math.round(X),!0),b(ne,ye(e(z),e(re),e(Ge),e(Ye)),!0)}function G(){var C,q;e(k)&&(window.removeEventListener("mousemove",M),window.removeEventListener("mouseup",G),(C=e(m))!=null&&C.id&&(e(z)!==e(H).x||e(re)!==e(H).y)&&(en(e(m).id,"Transform.x",e(z)),en(e(m).id,"Transform.y",e(re))),b(k,!1),b(z,null),b(re,null),b(ne,[],!0),(q=f())==null||q())}function ce(C,q){var V,ae,X,de;e($)||(q.stopPropagation(),q.preventDefault(),b(P,!0),b(E,C,!0),b(Q,{x:q.clientX,y:q.clientY},!0),b(O,{x:((V=e(_))==null?void 0:V.x)??0,y:((ae=e(_))==null?void 0:ae.y)??0,w:((X=e(_))==null?void 0:X.width)??100,h:((de=e(_))==null?void 0:de.height)??40},!0),b(z,e(O).x,!0),b(re,e(O).y,!0),b(W,e(O).w,!0),b(Se,e(O).h,!0),window.addEventListener("mousemove",ue),window.addEventListener("mouseup",he))}function ue(C){if(!e(P))return;const q=(C.clientX-e(Q).x)/s(),V=(C.clientY-e(Q).y)/s(),ae=C.shiftKey;let{x:X,y:de,w:ve,h:fe}=e(O);const me=e(E);if(me.includes("r")&&(ve+=q),me.includes("l")&&(X+=q,ve-=q),me.includes("b")&&(fe+=V),me.includes("t")&&(de+=V,fe-=V),ae&&me.length===2){const $e=e(O).w/e(O).h;Math.abs(q)>Math.abs(V)?(fe=ve/$e,me.includes("t")&&(de=e(O).y+e(O).h-fe)):(ve=fe*$e,me.includes("l")&&(X=e(O).x+e(O).w-ve))}ve<B&&(ve=B,me.includes("l")&&(X=e(O).x+e(O).w-B)),fe<B&&(fe=B,me.includes("t")&&(de=e(O).y+e(O).h-B)),i()&&c()>0&&(X=N(X),de=N(de),ve=N(ve)||c(),fe=N(fe)||c()),b(z,Math.round(X),!0),b(re,Math.round(de),!0),b(W,Math.round(ve),!0),b(Se,Math.round(fe),!0),b(ne,ye(e(z),e(re),e(W),e(Se)),!0)}function he(){var C;e(P)&&(window.removeEventListener("mousemove",ue),window.removeEventListener("mouseup",he),(C=e(m))!=null&&C.id&&(en(e(m).id,"Transform.x",e(z)),en(e(m).id,"Transform.y",e(re)),en(e(m).id,"Transform.width",e(W)),en(e(m).id,"Transform.height",e(Se))),b(P,!1),b(E,""),b(z,null),b(re,null),b(W,null),b(Se,null),b(ne,[],!0))}const be=[{id:"tl",cursor:"nwse-resize"},{id:"t",cursor:"ns-resize"},{id:"tr",cursor:"nesw-resize"},{id:"l",cursor:"ew-resize"},{id:"r",cursor:"ew-resize"},{id:"bl",cursor:"nesw-resize"},{id:"b",cursor:"ns-resize"},{id:"br",cursor:"nwse-resize"}];function tt(C){return`width:6px;height:6px;${{tl:"top:-3px;left:-3px;",t:"top:-3px;left:calc(50% - 3px);",tr:"top:-3px;right:-3px;",l:"top:calc(50% - 3px);left:-3px;",r:"top:calc(50% - 3px);right:-3px;",bl:"bottom:-3px;left:-3px;",b:"bottom:-3px;left:calc(50% - 3px);",br:"bottom:-3px;right:-3px;"}[C]}`}var Je=Bd(),we=U(Je);let Ze;var ct=v(we);{var Ce=C=>{Rd(C,{get background(){return e(p)}})};je(ct,C=>{e(p)&&C(Ce)})}var Fe=d(ct,2),A=v(Fe),se=d(Fe,2);{var j=C=>{var q=pe(),V=U(q);$t(V,17,()=>be,ae=>ae.id,(ae,X)=>{var de=Ld();te(ve=>Ue(de,`${ve??""} cursor:${e(X).cursor??""};`),[()=>tt(e(X).id)]),x("mousedown",de,ve=>ce(e(X).id,ve)),h(ae,de)}),h(C,q)};je(se,C=>{e(g)&&!e($)&&C(j)})}var T=d(we,2);{var D=C=>{var q=pe(),V=U(q);$t(V,17,()=>e(ne),zt,(ae,X)=>{var de=qd();let ve;te(()=>{ve=We(de,1,"snap-guide svelte-1aohjhs",null,ve,{vertical:e(X).type==="vertical",horizontal:e(X).type==="horizontal"}),Ue(de,e(X).type==="vertical"?`left:${e(X).pos}px;`:`top:${e(X).pos}px;`)}),h(ae,de)}),h(C,q)};je(T,C=>{(e(k)||e(P))&&e(ne).length>0&&C(D)})}te(()=>{var C,q,V;Ze=We(we,1,"canvas-control svelte-1aohjhs",null,Ze,{selected:e(g),"hidden-component":!e(w),locked:e($)}),Ue(we,`left:${e(Pe)??""}px; top:${e(Ke)??""}px; width:${e(Ge)??""}px; height:${e(Ye)??""}px; opacity:${((C=e(_))==null?void 0:C.opacity)??1??""}; ${(q=e(_))!=null&&q.rotation?`transform:rotate(${e(_).rotation}deg);`:""}`),et(A,((V=e(m))==null?void 0:V.name)??"")}),x("mousedown",we,Ee),h(t,Je),kt(),o()}Tt(["mousedown"]);var Hd=I('<div class="bg-layer svelte-17bi2u2"></div>'),Gd=I('<div class="bg-layer svelte-17bi2u2"></div>'),Wd=I('<div class="bg-layer svelte-17bi2u2"></div>'),Ud=I('<div class="bg-layer svelte-17bi2u2"></div>'),Yd=I('<div class="grid-overlay svelte-17bi2u2"></div>'),Xd=I('<div class="canvas-viewport svelte-17bi2u2"><div class="zoom-container svelte-17bi2u2"><div class="panel-surface svelte-17bi2u2"><!> <!> <!></div></div></div>'),Vd=I('<div class="empty-state svelte-17bi2u2"><span class="empty-text svelte-17bi2u2">No panel open</span> <span class="empty-hint svelte-17bi2u2">File → New Panel or press the + tab</span></div>'),Jd=I('<div class="editor-wrapper svelte-17bi2u2" tabindex="-1"><div class="tab-bar-area svelte-17bi2u2"><!></div> <div class="canvas-area svelte-17bi2u2"><!></div></div>');function Zd(t,n){wt(n,!0);const r=()=>Nt(Gt,"$panels",c),a=()=>Nt(Jt,"$activePanelId",c),o=()=>Nt(er,"$editorZoom",c),s=()=>Nt(Pa,"$fileCache",c),i=()=>Nt(Rn,"$selectedComponentId",c),[c,l]=cr();let u=S(()=>r().find(y=>y.id===a())??null),f=S(o),m=S(()=>e(f)/100),_=S(()=>{var y;return((y=e(u))==null?void 0:y.gridEnabled)??!1}),p=S(()=>{var y;return((y=e(u))==null?void 0:y.gridSize)??10}),g=S(()=>{var y;return((y=e(u))==null?void 0:y.snapToGrid)??!1}),$=S(()=>{var y;return((y=e(u))==null?void 0:y.gridColour)??"33FFFFFF"}),w=S(()=>{var y;return((y=e(u))==null?void 0:y.gridLineWidth)??1});function k(y){const N=y.replace(/^#/,"");if(N.length===8){const M=parseInt(N.slice(0,2),16)/255,G=parseInt(N.slice(2,4),16),ce=parseInt(N.slice(4,6),16),ue=parseInt(N.slice(6,8),16);return`rgba(${G},${ce},${ue},${M.toFixed(3)})`}const ne=parseInt(N.slice(0,2),16),ye=parseInt(N.slice(2,4),16),Ee=parseInt(N.slice(4,6),16);return`rgba(${ne},${ye},${Ee},0.06)`}let L=S(()=>{var ce,ue,he,be;if(!e(_)||e(p)<=0)return"";const y=k(e($)),N=e(w),ne=((ce=e(u))==null?void 0:ce.gridType)??"lines",ye=((ue=e(u))==null?void 0:ue.gridSubdivision)??1,Ee=((he=e(u))==null?void 0:he.gridOriginX)??0,M=((be=e(u))==null?void 0:be.gridOriginY)??0;if(ne==="dots")return`
        background-image: radial-gradient(circle, ${y} ${N}px, transparent ${N}px);
        background-size: ${e(p)}px ${e(p)}px;
        background-position: ${Ee}px ${M}px;
      `;if(ne==="crosses"){const tt=Math.max(1,Math.floor(e(p)*.15));return`
        background-image:
          linear-gradient(${y} ${N}px, transparent ${N}px),
          linear-gradient(90deg, ${y} ${N}px, transparent ${N}px);
        background-size: ${e(p)}px ${tt}px, ${tt}px ${e(p)}px;
        background-position: ${Ee}px ${M}px;
      `}if(ne==="isometric"){const tt=e(p),Je=Math.round(tt*1.732);return`
        background-image:
          linear-gradient(30deg, ${y} ${N}px, transparent ${N}px),
          linear-gradient(150deg, ${y} ${N}px, transparent ${N}px),
          linear-gradient(270deg, ${y} ${N}px, transparent ${N}px);
        background-size: ${Je}px ${tt}px;
        background-position: ${Ee}px ${M}px;
      `}let G=`
      background-image:
        linear-gradient(${y} ${N}px, transparent ${N}px),
        linear-gradient(90deg, ${y} ${N}px, transparent ${N}px);
      background-size: ${e(p)}px ${e(p)}px;
      background-position: ${Ee}px ${M}px;
    `;if(ye>1){const tt=e(p)/ye,Je=k(e($)).replace(/[\d.]+\)$/,we=>(parseFloat(we)*.4).toFixed(3)+")");G=`
        background-image:
          linear-gradient(${y} ${N}px, transparent ${N}px),
          linear-gradient(90deg, ${y} ${N}px, transparent ${N}px),
          linear-gradient(${Je} 1px, transparent 1px),
          linear-gradient(90deg, ${Je} 1px, transparent 1px);
        background-size: ${e(p)}px ${e(p)}px, ${e(p)}px ${e(p)}px, ${tt}px ${tt}px, ${tt}px ${tt}px;
        background-position: ${Ee}px ${M}px;
      `}return G}),H=S(()=>{if(!e(u)||e(u).bgSolid===!1)return"";const y=String(e(u).bgColour||"FF2A2A2A");if(y.length===8){const N=parseInt(y.slice(0,2),16)/255;return`background: #${y.slice(2)}; opacity: ${N.toFixed(3)};`}return`background: #${y};`}),P=S(()=>{if(!e(u)||!e(u).bgGradientEnabled||!e(u).bgGradient)return null;const y=(e(u).bgGradientOpacity??100)/100;return`background: ${Ur(e(u).bgGradient)}; opacity: ${y};`});function E(y,N,ne,ye,Ee,M,G,ce,ue,he){const be=[],Je={"top-left":"left top",top:"center top","top-right":"right top",left:"left center",center:"center center",right:"right center","bottom-left":"left bottom",bottom:"center bottom","bottom-right":"right bottom"}[N]||"center center",we=[];if(ce){const Ze=Math.abs(ce*Math.PI/180),ct=Math.cos(Ze),Ce=Math.sin(Ze),Fe=ue||1,A=he||1,se=Fe*ct+A*Ce,j=Fe*Ce+A*ct,T=Math.max(se/Fe,j/A);we.push(`rotate(${ce}deg)`),T>1&&we.push(`scale(${T.toFixed(4)})`)}switch(Ee&&we.push("scaleX(-1)"),M&&we.push("scaleY(-1)"),(ne||ye)&&we.push(`translate(${ne||0}px, ${ye||0}px)`),we.length&&be.push(`transform: ${we.join(" ")};`),y){case"fill":be.push("background-size: cover;"),be.push(`background-position: ${Je};`),be.push("background-repeat: no-repeat;");break;case"fit":be.push("background-size: contain;"),be.push(`background-position: ${Je};`),be.push("background-repeat: no-repeat;");break;case"stretch":be.push("background-size: 100% 100%;"),be.push("background-repeat: no-repeat;");break;case"tile":{const Ze=(G||1)*25;be.push(`background-size: ${Ze}%;`),be.push(`background-position: ${Je};`),be.push("background-repeat: repeat;");break}case"original":be.push("background-size: auto;"),be.push(`background-position: ${Je};`),be.push("background-repeat: no-repeat;");break;default:be.push("background-size: cover;"),be.push("background-repeat: no-repeat;")}return be.join(" ")}Xt(()=>{var y,N,ne,ye;(y=e(u))!=null&&y.bgImageEnabled&&((N=e(u))!=null&&N.bgImage)&&bi(e(u).bgImage),(ne=e(u))!=null&&ne.bgTextureEnabled&&((ye=e(u))!=null&&ye.bgTexture)&&bi(e(u).bgTexture)});let Q=S(()=>{if(!e(u)||!e(u).bgImageEnabled||!e(u).bgImage)return null;const y=s()[e(u).bgImage];if(!y)return null;const N=E(e(u).bgImageFit,e(u).bgImageAlign,e(u).bgImageOffsetX,e(u).bgImageOffsetY,e(u).bgImageFlipH,e(u).bgImageFlipV,e(u).bgImageTileScale,e(u).bgImageRotation,e(u).width,e(u).height),ne=(e(u).bgImageOpacity??100)/100,ye=e(u).bgImageBlend||"normal",Ee=e(u).bgImageBlur||0,M=e(u).bgImageSaturation??100,G=e(u).bgImageBrightness??100,ce=e(u).bgImageContrast??100,ue=e(u).bgImageTint??"FFFFFF";let he=`background-image: url('${y}'); ${N}`;he+=` opacity: ${ne}; mix-blend-mode: ${ye};`;const be=[];if(Ee>0&&be.push(`blur(${Ee}px)`),e(u).bgImageGrayscale&&be.push("grayscale(100%)"),M!==100&&be.push(`saturate(${M}%)`),G!==100&&be.push(`brightness(${G}%)`),ce!==100&&be.push(`contrast(${ce}%)`),be.length&&(he+=` filter: ${be.join(" ")};`),ue&&ue!=="FFFFFF"){const tt=parseInt(ue.slice(0,2),16),Je=parseInt(ue.slice(2,4),16),we=parseInt(ue.slice(4,6),16);he+=` box-shadow: inset 0 0 0 9999px rgba(${tt},${Je},${we},0.3);`}return he}),O=S(()=>{if(!e(u)||!e(u).bgTextureEnabled||!e(u).bgTexture)return null;const y=s()[e(u).bgTexture];if(!y)return null;const N=E(e(u).bgTextureFit,e(u).bgTextureAlign,e(u).bgTextureOffsetX,e(u).bgTextureOffsetY,e(u).bgTextureFlipH,e(u).bgTextureFlipV,e(u).bgTextureTileScale,e(u).bgTextureRotation,e(u).width,e(u).height),ne=(e(u).bgTextureOpacity??100)/100,ye=e(u).bgTextureBlend||"normal",Ee=e(u).bgTextureBlur||0,M=e(u).bgTextureSaturation??100,G=e(u).bgTextureBrightness??100,ce=e(u).bgTextureContrast??100,ue=e(u).bgTextureTint??"FFFFFF";let he=`background-image: url('${y}'); ${N}`;he+=` opacity: ${ne}; mix-blend-mode: ${ye};`;const be=[];if(Ee>0&&be.push(`blur(${Ee}px)`),e(u).bgTextureGrayscale&&be.push("grayscale(100%)"),M!==100&&be.push(`saturate(${M}%)`),G!==100&&be.push(`brightness(${G}%)`),ce!==100&&be.push(`contrast(${ce}%)`),be.length&&(he+=` filter: ${be.join(" ")};`),ue&&ue!=="FFFFFF"){const tt=parseInt(ue.slice(0,2),16),Je=parseInt(ue.slice(2,4),16),we=parseInt(ue.slice(4,6),16);he+=` box-shadow: inset 0 0 0 9999px rgba(${tt},${Je},${we},0.3);`}return he});function z(y){(y.target===y.currentTarget||y.target.classList.contains("panel-surface"))&&Rn.set(null)}function re(y){var M,G,ce,ue,he,be;if(!e(u))return;const N=i();if(!N)return;const ne=e(u).controls.find(tt=>{var Je,we;return((we=(Je=tt._children)==null?void 0:Je.Core)==null?void 0:we.id)===N});if(!ne)return;const ye=(G=(M=ne._children)==null?void 0:M.Core)==null?void 0:G.locked;if(y.key==="Delete"||y.key==="Backspace"){y.preventDefault(),pu(N);return}if((y.ctrlKey||y.metaKey)&&y.key==="d"){y.preventDefault(),gu(N);return}if(ye)return;const Ee=y.shiftKey?e(p):1;y.key==="ArrowLeft"?(y.preventDefault(),en(N,"Transform.x",(((ce=ne._children.Transform)==null?void 0:ce.x)??0)-Ee)):y.key==="ArrowRight"?(y.preventDefault(),en(N,"Transform.x",(((ue=ne._children.Transform)==null?void 0:ue.x)??0)+Ee)):y.key==="ArrowUp"?(y.preventDefault(),en(N,"Transform.y",(((he=ne._children.Transform)==null?void 0:he.y)??0)-Ee)):y.key==="ArrowDown"&&(y.preventDefault(),en(N,"Transform.y",(((be=ne._children.Transform)==null?void 0:be.y)??0)+Ee))}var W=Jd(),Se=v(W),Pe=v(Se);jd(Pe,{});var Ke=d(Se,2),Ge=v(Ke);{var Ye=y=>{var N=Xd(),ne=v(N),ye=v(ne),Ee=v(ye);$t(Ee,17,()=>e(u).bgLayerOrder??["solid","gradient","image","texture"],zt,(ue,he)=>{var be=pe(),tt=U(be);{var Je=Ce=>{var Fe=Hd();te(()=>Ue(Fe,e(H))),h(Ce,Fe)},we=Ce=>{var Fe=Gd();te(()=>Ue(Fe,e(P))),h(Ce,Fe)},Ze=Ce=>{var Fe=Wd();te(()=>Ue(Fe,e(Q))),h(Ce,Fe)},ct=Ce=>{var Fe=Ud();te(()=>Ue(Fe,e(O))),h(Ce,Fe)};je(tt,Ce=>{e(he)==="solid"&&e(H)?Ce(Je):e(he)==="gradient"&&e(P)?Ce(we,1):e(he)==="image"&&e(Q)?Ce(Ze,2):e(he)==="texture"&&e(O)&&Ce(ct,3)})}h(ue,be)});var M=d(Ee,2);{var G=ue=>{var he=Yd();te(()=>Ue(he,e(L))),h(ue,he)};je(M,ue=>{e(L)&&ue(G)})}var ce=d(M,2);$t(ce,17,()=>e(u).controls,ue=>{var he,be;return(be=(he=ue._children)==null?void 0:he.Core)==null?void 0:be.id},(ue,he)=>{Dd(ue,{get control(){return e(he)},get scale(){return e(m)},get snapToGrid(){return e(g)},get gridSize(){return e(p)},get allControls(){return e(u).controls}})}),te(()=>{Ue(ne,`transform: scale(${e(m)??""}); transform-origin: center center;`),Ue(ye,`width: ${e(u).width??""}px; height: ${e(u).height??""}px;`)}),x("click",N,z),x("click",ye,z),h(y,N)},B=y=>{var N=Vd();h(y,N)};je(Ge,y=>{e(u)?y(Ye):y(B,-1)})}x("keydown",W,re),h(t,W),kt(),l()}Tt(["keydown","click"]);var Kd=I('<div class="common-bar svelte-pu4s69"><div class="prop-group svelte-pu4s69"><div class="color-swatch svelte-pu4s69" style="background: #3A3A3A;" title="Fill colour"></div> <span class="prop-value svelte-pu4s69">3A3A3A</span></div> <div class="divider svelte-pu4s69"></div> <div class="prop-group svelte-pu4s69"><span class="prop-label svelte-pu4s69">Arial</span> <span class="prop-value svelte-pu4s69">14</span></div> <div class="divider svelte-pu4s69"></div> <div class="prop-group toggle-group svelte-pu4s69"><button class="toggle-btn svelte-pu4s69" title="Bold">B</button> <button class="toggle-btn svelte-pu4s69" title="Italic">I</button> <button class="toggle-btn svelte-pu4s69" title="Underline">U</button></div> <div class="divider svelte-pu4s69"></div> <div class="prop-group toggle-group svelte-pu4s69"><button class="toggle-btn svelte-pu4s69" title="Align left">≡</button> <button class="toggle-btn active svelte-pu4s69" title="Align center">☰</button> <button class="toggle-btn svelte-pu4s69" title="Align right">≡</button></div> <div class="spacer svelte-pu4s69"></div> <div class="prop-group svelte-pu4s69"><span class="prop-label-sm svelte-pu4s69">Opacity</span> <span class="prop-value svelte-pu4s69">100%</span></div></div>');function Qd(t){var n=Kd();h(t,n)}var ev=I('<input class="zoom-input svelte-o5r682" type="text"/>'),tv=I('<span class="zoom-value svelte-o5r682" title="Double-click to type a value"> </span>'),nv=I('<div class="zoom-bar svelte-o5r682"><div class="scrollbar-area svelte-o5r682"></div> <div class="zoom-controls svelte-o5r682"><button class="zoom-btn svelte-o5r682" title="Zoom out">−</button> <!> <button class="zoom-btn svelte-o5r682" title="Zoom in">+</button> <span class="inc-label svelte-o5r682">Dec/Inc</span> <input class="inc-input svelte-o5r682" type="number" min="1" max="100"/> <div class="divider svelte-o5r682"></div> <button class="zoom-btn icon svelte-o5r682" title="Reset to 100%">⊡</button> <button class="zoom-btn icon svelte-o5r682" title="Fit to window"><!></button></div></div>');function rv(t,n){wt(n,!0);const r=()=>Nt(er,"$editorZoom",i),a=()=>Nt(vi,"$editorZoomIncrement",i),o=()=>Nt(Gt,"$panels",i),s=()=>Nt(Jt,"$activePanelId",i),[i,c]=cr();let l=Z(!1),u=Z("100"),f=S(r),m=S(a),_=S(()=>o().find(B=>B.id===s())??null);function p(){er.update(B=>Math.min(400,B+a()))}function g(){er.update(B=>Math.max(10,B-a()))}function $(){er.set(100)}function w(){b(u,String(e(f)),!0),b(l,!0)}function k(){b(l,!1);const B=parseInt(e(u),10);isNaN(B)||er.set(Math.max(10,Math.min(400,B)))}function L(B){B.key==="Enter"?k():B.key==="Escape"&&b(l,!1)}function H(B){const y=parseInt(B.target.value,10);!isNaN(y)&&y>0&&vi.set(Math.min(100,y))}function P(){if(!e(_))return;const B=document.querySelector(".canvas-viewport");if(!B){er.set(100);return}const y=B.clientWidth-40,N=B.clientHeight-40,ne=y/e(_).width,ye=N/e(_).height,Ee=Math.min(ne,ye),M=Math.max(10,Math.min(400,Math.round(Ee*100)));er.set(M)}var E=nv(),Q=d(v(E),2),O=v(Q),z=d(O,2);{var re=B=>{var y=ev();al(y,!0),Mt("blur",y,k),x("keydown",y,L),Bo(y,()=>e(u),N=>b(u,N)),h(B,y)},W=B=>{var y=tv(),N=v(y);te(()=>et(N,`${e(f)??""}%`)),x("dblclick",y,w),h(B,y)};je(z,B=>{e(l)?B(re):B(W,-1)})}var Se=d(z,2),Pe=d(Se,4),Ke=d(Pe,4),Ge=d(Ke,2),Ye=v(Ge);Al(Ye,{size:12,strokeWidth:1.5}),te(()=>Et(Pe,e(m))),x("click",O,g),x("click",Se,p),x("change",Pe,H),x("click",Ke,$),x("click",Ge,P),h(t,E),kt(),c()}Tt(["click","keydown","dblclick","change"]);var av=I('<div class="band-checkerboard svelte-6w7hwg"></div>'),ov=I('<div class="band-wrapper svelte-6w7hwg"><div role="slider" tabindex="-1"><!> <div class="band-gradient svelte-6w7hwg"></div> <div class="thumb svelte-6w7hwg"></div> <span class="band-label svelte-6w7hwg"> </span></div></div>'),iv=I('<div class="color-chooser svelte-6w7hwg"><div class="checkerboard svelte-6w7hwg"></div> <div class="color-overlay svelte-6w7hwg"></div> <div class="hex-corner svelte-6w7hwg"><input class="hex-input svelte-6w7hwg" type="text" spellcheck="false"/></div> <div class="bands-container svelte-6w7hwg"></div></div>');function lv(t,n){wt(n,!0);let r=He(n,"color",3,"333333"),a=He(n,"alpha",3,1),o=He(n,"stepSize",3,10),s=Z(0),i=Z(0),c=Z(20),l=Z(1),u=Z(null),f=Z(""),m=Z(!1),_=!1;function p(j,T,D){T/=100,D/=100;const C=ae=>(ae+j/30)%12,q=T*Math.min(D,1-D),V=ae=>D-q*Math.max(-1,Math.min(C(ae)-3,9-C(ae),1));return[Math.round(V(0)*255),Math.round(V(8)*255),Math.round(V(4)*255)]}function g(j,T,D){j/=255,T/=255,D/=255;const C=Math.max(j,T,D),q=Math.min(j,T,D);let V=0,ae=0,X=(C+q)/2;if(C!==q){const de=C-q;switch(ae=X>.5?de/(2-C-q):de/(C+q),C){case j:V=((T-D)/de+(T<D?6:0))*60;break;case T:V=((D-j)/de+2)*60;break;case D:V=((j-T)/de+4)*60;break}}return[V,ae*100,X*100]}function $(j){return j=j.replace(/^#/,""),[parseInt(j.slice(0,2),16),parseInt(j.slice(2,4),16),parseInt(j.slice(4,6),16)]}function w(j,T,D){const C=q=>q.toString(16).padStart(2,"0").toUpperCase();return C(j)+C(T)+C(D)}function k(j){const[T,D,C]=$(j),[q,V,ae]=g(T,D,C);T===D&&D===C||(b(s,q,!0),b(i,V,!0)),b(c,ae,!0)}Xt(()=>{const j=r(),T=a();if(_){_=!1;return}k(j),b(l,T,!0)});let L=S(()=>p(e(s),e(i),e(c))),H=S(()=>w(e(L)[0],e(L)[1],e(L)[2])),P=S(()=>Math.round(e(l)*255).toString(16).padStart(2,"0").toUpperCase()),E=S(()=>e(P)+e(H)),Q=S(()=>"#"+e(E)),O=S(()=>`hsla(${e(s)}, ${e(i)}%, ${e(c)}%, ${e(l)})`),z=S(()=>(()=>{const j=[];for(let T=0;T<=360;T+=30)j.push(`hsl(${T}, ${e(i)}%, ${e(c)}%)`);return`linear-gradient(to right, ${j.join(", ")})`})()),re=S(()=>`linear-gradient(to right, hsl(${e(s)}, 100%, ${e(c)}%), hsl(${e(s)}, 0%, ${e(c)}%))`),W=S(()=>`linear-gradient(to right, hsl(${e(s)}, ${e(i)}%, 0%), hsl(${e(s)}, ${e(i)}%, 50%), hsl(${e(s)}, ${e(i)}%, 100%))`),Se=S(()=>`linear-gradient(to right, hsla(${e(s)}, ${e(i)}%, ${e(c)}%, 1), hsla(${e(s)}, ${e(i)}%, ${e(c)}%, 0))`),Pe=S(()=>e(s)/360),Ke=S(()=>1-e(i)/100),Ge=S(()=>e(c)/100),Ye=S(()=>1-e(l)),B=S(()=>`hsl(${e(s)}, ${e(i)}%, ${e(c)}%)`),y=S(()=>`hsla(${e(s)}, ${e(i)}%, ${e(c)}%, ${e(l)})`);function N(){n.onchange&&(_=!0,n.onchange(e(E)))}function ne(j,T){const D=T.getBoundingClientRect();return Math.max(0,Math.min(j.clientX-D.left,D.width))/D.width}function ye(j,T){b(u,j,!0),M(T)}function Ee(j,T){const D=o()/100*T;return Math.round(j/D)*D}function M(j){if(!e(u))return;const T=document.querySelector(`[data-band="${e(u)}"]`);if(!T)return;const D=ne(j,T);switch(e(u)){case"hue":b(s,Ee(D*360,360),!0);break;case"saturation":b(i,Ee((1-D)*100,100),!0);break;case"lightness":b(c,Ee(D*100,100),!0);break;case"alpha":b(l,Ee((1-D)*100,100)/100);break}N()}function G(){b(u,null)}function ce(j){b(m,!0),b(f,e(Q),!0),j.target.select()}function ue(){b(m,!1),be()}function he(j){j.key==="Enter"?j.target.blur():j.key==="Escape"&&(b(m,!1),b(f,e(Q),!0))}function be(){let j=e(f).replace(/^#/,"").replace(/[^0-9A-Fa-f]/g,"");j.length===8?(b(l,parseInt(j.slice(0,2),16)/255),k(j.slice(2,8)),N()):j.length===6&&(k(j),N())}const tt=[{id:"hue",label:"H"},{id:"saturation",label:"S"},{id:"lightness",label:"B"},{id:"alpha",label:"A"}];function Je(j){switch(j){case"hue":return e(z);case"saturation":return e(re);case"lightness":return e(W);case"alpha":return e(Se)}}function we(j){switch(j){case"hue":return e(Pe);case"saturation":return e(Ke);case"lightness":return e(Ge);case"alpha":return e(Ye)}}function Ze(j){return e(j==="alpha"?y:B)}var ct=iv();Mt("mousemove",Cr,function(...j){var T;(T=e(u)?M:void 0)==null||T.apply(this,j)}),Mt("mouseup",Cr,function(...j){var T;(T=e(u)?G:void 0)==null||T.apply(this,j)});var Ce=d(v(ct),2),Fe=d(Ce,2),A=v(Fe),se=d(Fe,2);$t(se,21,()=>tt,zt,(j,T)=>{var D=ov(),C=v(D);let q;var V=v(C);{var ae=me=>{var $e=av();h(me,$e)};je(V,me=>{e(T).id==="alpha"&&me(ae)})}var X=d(V,2),de=d(X,2),ve=d(de,2),fe=v(ve);te((me,$e,Be,J)=>{q=We(C,1,"band svelte-6w7hwg",null,q,{"is-alpha":e(T).id==="alpha"}),ut(C,"data-band",e(T).id),ut(C,"aria-valuenow",me),Ue(X,`background: ${$e??""}`),Ue(de,`left: ${Be??""}%; background: ${J??""}`),et(fe,e(T).label)},[()=>we(e(T).id)*100,()=>Je(e(T).id),()=>we(e(T).id)*100,()=>Ze(e(T).id)]),x("mousedown",C,me=>ye(e(T).id,me)),h(j,D)}),te(()=>{Ue(Ce,`background: ${e(O)??""}`),Et(A,e(m)?e(f):e(Q))}),Mt("focus",A,ce),Mt("blur",A,ue),x("keydown",A,he),x("input",A,j=>b(f,j.target.value,!0)),h(t,ct),kt()}Tt(["keydown","input","mousedown"]);var sv=I("<button> </button>"),cv=I('<button class="harmony-swatch svelte-3j5puu"></button>'),uv=I("<button> </button>"),dv=I('<div class="depth-preview svelte-3j5puu"><span class="depth-swatch svelte-3j5puu"></span> <span class="depth-arrow svelte-3j5puu">→</span> <span class="depth-swatch svelte-3j5puu"></span> <span class="depth-hex svelte-3j5puu"> </span></div>'),vv=I('<div class="color-settings svelte-3j5puu"><div class="section svelte-3j5puu"><div class="section-label svelte-3j5puu">Format</div> <div class="format-row svelte-3j5puu"><select class="combo format-combo svelte-3j5puu"><option>Hex</option><option>RGB</option><option>ARGB</option><option>RGBA</option><option>HSL</option><option>HSLA</option></select> <div class="value-row svelte-3j5puu"><span class="value-text svelte-3j5puu"> </span> <button class="copy-btn svelte-3j5puu" title="Copy to clipboard"><!></button></div></div></div> <div class="section svelte-3j5puu"><div class="section-label svelte-3j5puu">Step</div> <div class="step-row svelte-3j5puu"></div></div> <div class="section svelte-3j5puu"><div class="section-label svelte-3j5puu">Harmony</div> <select class="combo svelte-3j5puu"><option>Complementary</option><option>Analogous</option><option>Triadic</option><option>Split-Complementary</option><option>Tetradic</option></select> <div class="harmony-swatches svelte-3j5puu"><button class="harmony-swatch current svelte-3j5puu"></button> <!></div></div> <div class="section svelte-3j5puu"><div class="section-label svelte-3j5puu">Quick Actions</div> <div class="actions-row svelte-3j5puu"><button class="action-btn svelte-3j5puu" title="Darken 10%"><!></button> <button class="action-btn svelte-3j5puu" title="Lighten 10%"><!></button> <button class="action-btn svelte-3j5puu" title="Desaturate -15%"><!></button> <button class="action-btn svelte-3j5puu" title="Saturate +15%"><!></button> <button class="action-btn svelte-3j5puu" title="Grayscale"><span class="action-text svelte-3j5puu">G</span></button> <button class="action-btn svelte-3j5puu" title="Invert"><!></button></div></div> <div class="section svelte-3j5puu"><div class="section-label svelte-3j5puu">Opacity</div> <div class="opacity-row svelte-3j5puu"></div></div> <div class="section svelte-3j5puu"><div class="section-label svelte-3j5puu">Depth</div> <select class="combo svelte-3j5puu"><option>8-bit (256)</option><option>16-bit (65K)</option><option>24-bit (16M)</option><option>32-bit (16M+A)</option></select> <!></div></div>');function fv(t,n){wt(n,!0);let r=He(n,"color",3,"FF0000"),a=He(n,"alpha",3,1),o=He(n,"stepSize",15,10),s=Z("hex"),i=Z("complementary"),c=Z("24"),l=Z(!1);function u(Y){return Y=Y.replace(/^#/,""),[parseInt(Y.slice(0,2),16),parseInt(Y.slice(2,4),16),parseInt(Y.slice(4,6),16)]}function f(Y,ee,ie){Y/=255,ee/=255,ie/=255;const Re=Math.max(Y,ee,ie),Le=Math.min(Y,ee,ie);let nt=0,yt=0,R=(Re+Le)/2;if(Re!==Le){const oe=Re-Le;switch(yt=R>.5?oe/(2-Re-Le):oe/(Re+Le),Re){case Y:nt=((ee-ie)/oe+(ee<ie?6:0))*60;break;case ee:nt=((ie-Y)/oe+2)*60;break;case ie:nt=((Y-ee)/oe+4)*60;break}}return[Math.round(nt),Math.round(yt*100),Math.round(R*100)]}function m(Y,ee,ie){ee/=100,ie/=100;const Re=yt=>(yt+Y/30)%12,Le=ee*Math.min(ie,1-ie),nt=yt=>ie-Le*Math.max(-1,Math.min(Re(yt)-3,9-Re(yt),1));return[Math.round(nt(0)*255),Math.round(nt(8)*255),Math.round(nt(4)*255)]}function _(Y,ee,ie){const Re=Le=>Math.max(0,Math.min(255,Math.round(Le))).toString(16).padStart(2,"0").toUpperCase();return Re(Y)+Re(ee)+Re(ie)}function p(Y,ee=a()){if(n.onApplyColor){const ie=Math.round(ee*255).toString(16).padStart(2,"0").toUpperCase();n.onApplyColor(ie+Y)}}let g=S(()=>u(r())),$=S(()=>f(e(g)[0],e(g)[1],e(g)[2])),w=Z(0),k=Z(0);Xt(()=>{const[Y,ee,ie]=e(g),[Re,Le]=e($);(Y!==ee||ee!==ie)&&(b(w,Re,!0),b(k,Le,!0))});let L=S(()=>[e(w),e(k),e($)[2]]),H=S(()=>Math.round(a()*255)),P=S(()=>a().toFixed(2)),E=S(()=>(()=>{const[Y,ee,ie]=e(g),[Re,Le,nt]=e(L);switch(e(s)){case"hex":return`#${e(H).toString(16).padStart(2,"0").toUpperCase()}${r()}`;case"rgb":return`rgb(${Y}, ${ee}, ${ie})`;case"argb":return`argb(${e(H)}, ${Y}, ${ee}, ${ie})`;case"rgba":return`rgba(${Y}, ${ee}, ${ie}, ${e(P)})`;case"hsl":return`hsl(${Re}, ${Le}%, ${nt}%)`;case"hsla":return`hsla(${Re}, ${Le}%, ${nt}%, ${e(P)})`;default:return`#${r()}`}})());async function Q(){try{await navigator.clipboard.writeText(e(E)),b(l,!0),setTimeout(()=>b(l,!1),1200)}catch{}}function O(Y,ee){return((Y+ee)%360+360)%360}function z(Y,ee,ie){const[Re,Le,nt]=m(Y,ee,ie);return _(Re,Le,nt)}let re=S(()=>(()=>{const[Y,ee,ie]=e(L);switch(e(i)){case"complementary":return[z(O(Y,180),ee,ie)];case"analogous":return[z(O(Y,-30),ee,ie),z(O(Y,30),ee,ie)];case"triadic":return[z(O(Y,120),ee,ie),z(O(Y,240),ee,ie)];case"split":return[z(O(Y,150),ee,ie),z(O(Y,210),ee,ie)];case"tetradic":return[z(O(Y,90),ee,ie),z(O(Y,180),ee,ie),z(O(Y,270),ee,ie)];default:return[]}})());function W(){const[Y,ee,ie]=e(g);p(_(255-Y,255-ee,255-ie))}function Se(){const[Y,ee,ie]=e(g),Re=Math.round(.299*Y+.587*ee+.114*ie);p(_(Re,Re,Re))}function Pe(){const[Y,ee,ie]=e(L),Re=Math.min(100,ie+10),[Le,nt,yt]=m(Y,ee,Re);p(_(Le,nt,yt))}function Ke(){const[Y,ee,ie]=e(L),Re=Math.max(0,ie-10),[Le,nt,yt]=m(Y,ee,Re);p(_(Le,nt,yt))}function Ge(){const[Y,ee,ie]=e(L),Re=Math.max(0,ee-15),[Le,nt,yt]=m(Y,Re,ie);p(_(Le,nt,yt))}function Ye(){const[Y,ee,ie]=e(L),Re=Math.min(100,ee+15),[Le,nt,yt]=m(Y,Re,ie);p(_(Le,nt,yt))}function B(Y){p(r(),Y)}function y(Y,ee){const ie=(1<<ee)-1;return Math.round(Y/255*ie)*255/ie}function N(Y,ee,ie,Re){switch(Re){case"8":return[y(Y,3),y(ee,3),y(ie,2)];case"16":return[y(Y,5),y(ee,6),y(ie,5)];default:return[Y,ee,ie]}}let ne=S(()=>N(e(g)[0],e(g)[1],e(g)[2],e(c))),ye=S(()=>_(e(ne)[0],e(ne)[1],e(ne)[2])),Ee=S(()=>e(c)==="8"||e(c)==="16");var M=vv(),G=v(M),ce=d(v(G),2),ue=v(ce),he=v(ue);he.value=he.__value="hex";var be=d(he);be.value=be.__value="rgb";var tt=d(be);tt.value=tt.__value="argb";var Je=d(tt);Je.value=Je.__value="rgba";var we=d(Je);we.value=we.__value="hsl";var Ze=d(we);Ze.value=Ze.__value="hsla";var ct=d(ue,2),Ce=v(ct),Fe=v(Ce),A=d(Ce,2),se=v(A);{var j=Y=>{Au(Y,{size:12,strokeWidth:1.5})},T=Y=>{Ru(Y,{size:12,strokeWidth:1.5})};je(se,Y=>{e(l)?Y(j):Y(T,-1)})}var D=d(G,2),C=d(v(D),2);$t(C,20,()=>[1,5,10,20,25],zt,(Y,ee)=>{var ie=sv();let Re;var Le=v(ie);te(()=>{Re=We(ie,1,"step-btn svelte-3j5puu",null,Re,{active:o()===ee}),et(Le,`${ee??""}%`)}),x("click",ie,()=>o(ee)),h(Y,ie)});var q=d(D,2),V=d(v(q),2),ae=v(V);ae.value=ae.__value="complementary";var X=d(ae);X.value=X.__value="analogous";var de=d(X);de.value=de.__value="triadic";var ve=d(de);ve.value=ve.__value="split";var fe=d(ve);fe.value=fe.__value="tetradic";var me=d(V,2),$e=v(me),Be=d($e,2);$t(Be,17,()=>e(re),zt,(Y,ee)=>{var ie=cv();te(()=>{Ue(ie,`background: #${e(ee)??""}`),ut(ie,"title",`#${e(ee)??""} — click to apply`)}),x("click",ie,()=>p(e(ee))),h(Y,ie)});var J=d(q,2),ke=d(v(J),2),qe=v(ke),xe=v(qe);Qu(xe,{size:13,strokeWidth:1.5});var ge=d(qe,2),K=v(ge);pd(K,{size:13,strokeWidth:1.5});var Oe=d(ge,2),lt=v(Oe);bd(lt,{size:13,strokeWidth:1.5});var it=d(Oe,2),St=v(it);Lu(St,{size:13,strokeWidth:1.5});var xt=d(it,2),Pt=d(xt,2),dt=v(Pt);Ll(dt,{size:13,strokeWidth:1.5});var vt=d(J,2),ft=d(v(vt),2);$t(ft,20,()=>[0,.25,.5,.75,1],zt,(Y,ee)=>{var ie=uv();let Re;var Le=v(ie);te((nt,yt)=>{Re=We(ie,1,"opacity-btn svelte-3j5puu",null,Re,nt),et(Le,`${yt??""}%`)},[()=>({active:Math.abs(a()-ee)<.01}),()=>Math.round(ee*100)]),x("click",ie,()=>B(ee)),h(Y,ie)});var pt=d(vt,2),mt=d(v(pt),2),ot=v(mt);ot.value=ot.__value="8";var rt=d(ot);rt.value=rt.__value="16";var le=d(rt);le.value=le.__value="24";var Ae=d(le);Ae.value=Ae.__value="32";var _e=d(mt,2);{var De=Y=>{var ee=dv(),ie=v(ee),Re=d(ie,4),Le=d(Re,2),nt=v(Le);te(()=>{Ue(ie,`background: #${r()??""}`),Ue(Re,`background: #${e(ye)??""}`),et(nt,`#${e(ye)??""}`)}),h(Y,ee)};je(_e,Y=>{e(Ee)&&Y(De)})}te(()=>{et(Fe,e(E)),Ue($e,`background: #${r()??""}`),ut($e,"title",`Current: #${r()??""}`)}),zr(ue,()=>e(s),Y=>b(s,Y)),x("click",A,Q),zr(V,()=>e(i),Y=>b(i,Y)),x("click",qe,Ke),x("click",ge,Pe),x("click",Oe,Ge),x("click",it,Ye),x("click",xt,Se),x("click",Pt,W),zr(mt,()=>e(c),Y=>b(c,Y)),h(t,M),kt()}Tt(["click"]);var pv=Lo('<line stroke="rgba(255,255,255,0.15)" stroke-width="0.3" stroke-dasharray="1,1.5"></line>'),gv=I('<div class="center-handle svelte-ki4x81"></div>'),hv=I('<div class="radius-handle perp svelte-ki4x81"></div>'),_v=I('<div class="radius-handle svelte-ki4x81"></div> <!>',1),bv=I("<div></div>"),mv=I('<div class="shape-container svelte-ki4x81"><div><div class="gradient-bg svelte-ki4x81"></div> <svg class="axis-svg svelte-ki4x81" viewBox="0 0 100 100" preserveAspectRatio="none"><line stroke="rgba(255,255,255,0.3)" stroke-width="0.4" stroke-dasharray="1.5,1"></line><!></svg> <!> <!> <!></div></div>'),$v=Lo('<line stroke="rgba(255,255,255,0.15)" stroke-width="0.3" stroke-dasharray="1,1.5"></line>'),xv=I('<div class="center-handle svelte-ki4x81"></div>'),yv=I('<div class="radius-handle svelte-ki4x81"></div> <div class="radius-handle perp svelte-ki4x81"></div>',1),wv=I("<div></div>"),kv=I('<div class="gradient-surface full svelte-ki4x81"></div>  <div class="axis-overlay axis-host svelte-ki4x81"><svg class="axis-svg svelte-ki4x81" viewBox="0 0 100 100" preserveAspectRatio="none"><line stroke="rgba(255,255,255,0.3)" stroke-width="0.4" stroke-dasharray="1.5,1"></line><!></svg> <!> <!> <!></div>',1),Sv=I('<div class="gradient-editor svelte-ki4x81"><div class="checkerboard svelte-ki4x81"></div> <!></div>');function Cv(t,n){wt(n,!0);let r=S(()=>n.gradient),a=S(()=>n.selectedStop??0),o=S(()=>n.shape??"rectangle"),s=S(()=>n.onchange),i=S(()=>n.onSelectStop),c=Z(At([])),l=Z(50),u=Z(50),f=Z(50),m=Z(50),_=Z(!1),p=Z(null),g=Z(0),$=Z(100),w=Z(100);Tl(()=>{if(!e(p))return;const T=new ResizeObserver(([D])=>{b($,D.contentRect.width,!0),b(w,D.contentRect.height,!0)});return T.observe(e(p)),()=>T.disconnect()}),Xt(()=>{b(g,Math.floor(Math.min(e($),e(w))*.85),!0)});let k=S(()=>e(o)==="ellipse"?Math.floor(e($)*.85):e(g)),L=S(()=>e(o)==="ellipse"?Math.floor(e(w)*.85):e(g)),H=!1;Xt(()=>{const T=e(r);!e(_)&&!H&&T&&(T.stops&&b(c,T.stops.map(D=>({...D})),!0),b(l,T.centerX??50,!0),b(u,T.centerY??50,!0),b(f,T.radiusX??50,!0),b(m,T.radiusY??50,!0)),H=!1});let P=S(()=>({...e(r),stops:e(c),centerX:e(l),centerY:e(u),radiusX:e(f),radiusY:e(m)})),E=S(()=>e(P).type==="squareRamp"?`url(${Wl(e(P),256,256)})`:Ur(e(P),e(o))),Q=S(()=>Gl(e(P))),O=S(()=>Hl(e(P))),z=S(()=>e(o)==="circle"?"shape-circle":e(o)==="square"?"shape-square":e(o)==="ellipse"?"shape-ellipse":e(o)==="triangle"?"shape-triangle":""),re=S(()=>e(o)!=="rectangle"),W=S(()=>["radial","radialRamp"].includes(e(r).type)),Se=S(()=>["radial","radialRamp","conical"].includes(e(r).type)),Pe=S(()=>["radial","radialRamp"].includes(e(r).type)),Ke=S(()=>(()=>{switch(e(r).type){case"radial":case"radialRamp":return 90;case"conical":return e(r).angle??0;default:return e(r).angle??90}})()),Ge=S(()=>(e(Ke)-90)*Math.PI/180),Ye=S(()=>e(Se)?e(l):50),B=S(()=>e(Se)?e(u):50),y=S(()=>(()=>{if(e(o)!=="rectangle")return 48;const T=e(Ye),D=e(B),C=Math.cos(e(Ge)),q=Math.sin(e(Ge));let V=1/0;return Math.abs(C)>.001&&(V=Math.min(V,Math.abs((C>0?100-T:T)/C))),Math.abs(q)>.001&&(V=Math.min(V,Math.abs((q>0?100-D:D)/q))),Math.min(V*.95,50)})()),N=S(()=>(()=>{if(e(W))return{x:e(Ye),y:e(B)};const T=Math.cos(e(Ge)),D=Math.sin(e(Ge));return{x:e(Ye)-T*e(y),y:e(B)-D*e(y)}})()),ne=S(()=>(()=>{if(e(W))return{x:e(Ye)+e(f),y:e(B)};const T=Math.cos(e(Ge)),D=Math.sin(e(Ge));return{x:e(Ye)+T*e(y),y:e(B)+D*e(y)}})()),ye=Z(null);function Ee(T){const D=e(ye);if(!D)return 50;const C=D.getBoundingClientRect(),q=(T.clientX-C.left)/C.width*100,V=(T.clientY-C.top)/C.height*100,ae=e(ne).x-e(N).x,X=e(ne).y-e(N).y,de=ae*ae+X*X;if(de<.001)return 0;const ve=((q-e(N).x)*ae+(V-e(N).y)*X)/de;return Math.max(0,Math.min(100,Math.round(ve*100)))}function M(T){const D=T.position/100,C=e(N).x+(e(ne).x-e(N).x)*D,q=e(N).y+(e(ne).y-e(N).y)*D;return`left: ${C}%; top: ${q}%; background: #${T.color}`}let G=S(()=>({x1:e(N).x,y1:e(N).y,x2:e(ne).x,y2:e(ne).y})),ce=S(()=>e(Pe)&&(e(o)==="rectangle"||e(o)==="ellipse")),ue=S(()=>e(Pe)?{x:e(Ye),y:e(B)+e(m)}:{x:e(Ye),y:e(B)}),he=S(()=>({x1:e(Ye),y1:e(B),x2:e(ue).x,y2:e(ue).y}));function be(){e(s)&&e(s)({...e(r),stops:e(c),centerX:e(l),centerY:e(u),radiusX:e(f),radiusY:e(m)})}function tt(T,D){D.preventDefault(),D.stopPropagation(),b(_,!0),e(i)&&e(i)(T);function C(V){const ae=Ee(V);b(c,e(c).map((X,de)=>de===T?{...X,position:ae}:X),!0)}function q(){document.removeEventListener("mousemove",C),document.removeEventListener("mouseup",q),b(_,!1),Ze=!0,H=!0,be()}document.addEventListener("mousemove",C),document.addEventListener("mouseup",q)}function Je(T){T.preventDefault(),T.stopPropagation(),b(_,!0);function D(q){const V=e(ye);if(!V)return;const ae=V.getBoundingClientRect();b(l,Math.max(0,Math.min(100,Math.round((q.clientX-ae.left)/ae.width*100))),!0),b(u,Math.max(0,Math.min(100,Math.round((q.clientY-ae.top)/ae.height*100))),!0)}function C(){document.removeEventListener("mousemove",D),document.removeEventListener("mouseup",C),b(_,!1),Ze=!0,H=!0,be()}document.addEventListener("mousemove",D),document.addEventListener("mouseup",C)}function we(T,D){D.preventDefault(),D.stopPropagation(),b(_,!0);function C(V){const ae=e(ye);if(!ae)return;const X=ae.getBoundingClientRect(),de=(V.clientX-X.left)/X.width*100,ve=(V.clientY-X.top)/X.height*100;T==="x"?b(f,Math.max(1,Math.round(Math.abs(de-e(l)))),!0):b(m,Math.max(1,Math.round(Math.abs(ve-e(u)))),!0)}function q(){document.removeEventListener("mousemove",C),document.removeEventListener("mouseup",q),b(_,!1),Ze=!0,H=!0,be()}document.addEventListener("mousemove",C),document.addEventListener("mouseup",q)}let Ze=!1;function ct(T){if(Ze){Ze=!1;return}if(T.target.closest(".stop-thumb")||T.target.closest(".center-handle")||T.target.closest(".radius-handle"))return;const D=Ee(T),C=Pd(e(c),D),q=[...e(c),{color:C,position:D}];b(c,q,!0),H=!0,e(s)&&e(s)({...e(r),stops:q}),e(i)&&e(i)(q.length-1)}function Ce(T,D){if(D.preventDefault(),D.stopPropagation(),e(c).length<=2)return;const C=e(c).filter((q,V)=>V!==T);b(c,C,!0),H=!0,e(s)&&e(s)({...e(r),stops:C}),e(i)&&e(i)(Math.min(T,C.length-1))}var Fe=Sv(),A=d(v(Fe),2);{var se=T=>{var D=mv(),C=v(D),q=v(C),V=d(q,2),ae=v(V),X=d(ae);{var de=J=>{var ke=pv();te(()=>{ut(ke,"x1",e(he).x1),ut(ke,"y1",e(he).y1),ut(ke,"x2",e(he).x2),ut(ke,"y2",e(he).y2)}),h(J,ke)};je(X,J=>{e(ce)&&J(de)})}var ve=d(V,2);{var fe=J=>{var ke=gv();te(()=>Ue(ke,`left: ${e(Ye)??""}%; top: ${e(B)??""}%`)),x("mousedown",ke,Je),h(J,ke)};je(ve,J=>{e(Se)&&J(fe)})}var me=d(ve,2);{var $e=J=>{var ke=_v(),qe=U(ke),xe=d(qe,2);{var ge=K=>{var Oe=hv();te(()=>Ue(Oe,`left: ${e(ue).x??""}%; top: ${e(ue).y??""}%`)),x("mousedown",Oe,lt=>we("y",lt)),h(K,Oe)};je(xe,K=>{(e(o)==="rectangle"||e(o)==="ellipse")&&K(ge)})}te(()=>Ue(qe,`left: ${e(ne).x??""}%; top: ${e(ne).y??""}%`)),x("mousedown",qe,K=>we("x",K)),h(J,ke)};je(me,J=>{e(Pe)&&J($e)})}var Be=d(me,2);$t(Be,17,()=>e(c),zt,(J,ke,qe)=>{var xe=bv();let ge;te(K=>{ge=We(xe,1,"stop-thumb svelte-ki4x81",null,ge,{selected:qe===e(a)}),Ue(xe,K)},[()=>M(e(ke))]),x("mousedown",xe,K=>tt(qe,K)),x("contextmenu",xe,K=>Ce(qe,K)),h(J,xe)}),jn(C,J=>b(ye,J),()=>e(ye)),te(()=>{We(C,1,`gradient-surface ${e(z)??""} axis-host`,"svelte-ki4x81"),Ue(C,`width: ${e(k)??""}px; height: ${e(L)??""}px;`),Ue(q,`background: ${e(E)??""}; background-size: 100% 100%;${e(Q)?` filter: ${e(Q)};`:""}${e(O)?` background-blend-mode: ${e(O)};`:""}`),ut(ae,"x1",e(G).x1),ut(ae,"y1",e(G).y1),ut(ae,"x2",e(G).x2),ut(ae,"y2",e(G).y2)}),x("click",C,ct),h(T,D)},j=T=>{var D=kv(),C=U(D),q=d(C,2),V=v(q),ae=v(V),X=d(ae);{var de=J=>{var ke=$v();te(()=>{ut(ke,"x1",e(he).x1),ut(ke,"y1",e(he).y1),ut(ke,"x2",e(he).x2),ut(ke,"y2",e(he).y2)}),h(J,ke)};je(X,J=>{e(ce)&&J(de)})}var ve=d(V,2);{var fe=J=>{var ke=xv();te(()=>Ue(ke,`left: ${e(Ye)??""}%; top: ${e(B)??""}%`)),x("mousedown",ke,Je),h(J,ke)};je(ve,J=>{e(Se)&&J(fe)})}var me=d(ve,2);{var $e=J=>{var ke=yv(),qe=U(ke),xe=d(qe,2);te(()=>{Ue(qe,`left: ${e(ne).x??""}%; top: ${e(ne).y??""}%`),Ue(xe,`left: ${e(ue).x??""}%; top: ${e(ue).y??""}%`)}),x("mousedown",qe,ge=>we("x",ge)),x("mousedown",xe,ge=>we("y",ge)),h(J,ke)};je(me,J=>{e(Pe)&&J($e)})}var Be=d(me,2);$t(Be,17,()=>e(c),zt,(J,ke,qe)=>{var xe=wv();let ge;te(K=>{ge=We(xe,1,"stop-thumb svelte-ki4x81",null,ge,{selected:qe===e(a)}),Ue(xe,K)},[()=>M(e(ke))]),x("mousedown",xe,K=>tt(qe,K)),x("contextmenu",xe,K=>Ce(qe,K)),h(J,xe)}),jn(q,J=>b(ye,J),()=>e(ye)),te(()=>{Ue(C,`background: ${e(E)??""}; background-size: 100% 100%;${e(Q)?` filter: ${e(Q)};`:""}${e(O)?` background-blend-mode: ${e(O)};`:""}`),ut(ae,"x1",e(G).x1),ut(ae,"y1",e(G).y1),ut(ae,"x2",e(G).x2),ut(ae,"y2",e(G).y2)}),x("click",q,ct),h(T,D)};je(A,T=>{e(re)?T(se):T(j,-1)})}jn(Fe,T=>b(p,T),()=>e(p)),h(t,Fe),kt()}Tt(["click","mousedown","contextmenu"]);var Mv=I('<div class="section-label svelte-10tq9kx">Angle</div> <div class="input-row svelte-10tq9kx"><div class="num-input-wrap svelte-10tq9kx"><button class="pos-arrow left svelte-10tq9kx" tabindex="-1">&#9664;</button> <input class="num-input svelte-10tq9kx" type="number" min="0" max="360"/> <button class="pos-arrow right svelte-10tq9kx" tabindex="-1">&#9654;</button></div> <span class="input-suffix svelte-10tq9kx">°</span></div>',1),Tv=I('<div class="section-label svelte-10tq9kx" style="margin-top: 4px">Center</div> <div class="input-row svelte-10tq9kx"><span class="input-prefix svelte-10tq9kx">X</span> <div class="num-input-wrap svelte-10tq9kx"><button class="pos-arrow left svelte-10tq9kx" tabindex="-1">&#9664;</button> <input class="num-input svelte-10tq9kx" type="number" min="0" max="100"/> <button class="pos-arrow right svelte-10tq9kx" tabindex="-1">&#9654;</button></div> <span class="input-prefix svelte-10tq9kx" style="margin-left: 4px">Y</span> <div class="num-input-wrap svelte-10tq9kx"><button class="pos-arrow left svelte-10tq9kx" tabindex="-1">&#9664;</button> <input class="num-input svelte-10tq9kx" type="number" min="0" max="100"/> <button class="pos-arrow right svelte-10tq9kx" tabindex="-1">&#9654;</button></div></div>',1),Pv=I('<span class="input-prefix svelte-10tq9kx">X</span>'),Iv=I('<span class="input-prefix svelte-10tq9kx" style="margin-left: 4px">Y</span> <div class="num-input-wrap svelte-10tq9kx"><button class="pos-arrow left svelte-10tq9kx" tabindex="-1">&#9664;</button> <input class="num-input svelte-10tq9kx" type="number" min="1" max="200"/> <button class="pos-arrow right svelte-10tq9kx" tabindex="-1">&#9654;</button></div>',1),Ev=I('<div class="section-label svelte-10tq9kx" style="margin-top: 4px">Radius</div> <div class="input-row svelte-10tq9kx"><!> <div class="num-input-wrap svelte-10tq9kx"><button class="pos-arrow left svelte-10tq9kx" tabindex="-1">&#9664;</button> <input class="num-input svelte-10tq9kx" type="number" min="1" max="200"/> <button class="pos-arrow right svelte-10tq9kx" tabindex="-1">&#9654;</button></div> <!></div>',1),zv=I('<div class="section svelte-10tq9kx"><!> <!> <!></div>'),Nv=I('<button class="stop-delete svelte-10tq9kx" title="Delete stop"><!></button>'),Fv=I('<div><button class="stop-color svelte-10tq9kx" title="Click to edit color"></button> <span class="stop-hex svelte-10tq9kx"> </span> <div class="stop-pos-wrap svelte-10tq9kx"><button class="pos-arrow left svelte-10tq9kx" tabindex="-1" title="Decrease">&#9664;</button> <input class="stop-pos svelte-10tq9kx" type="number" min="0" max="100"/> <button class="pos-arrow right svelte-10tq9kx" tabindex="-1" title="Increase">&#9654;</button></div> <span class="stop-pct svelte-10tq9kx">%</span> <!></div>'),Av=I("<button></button>"),jv=I('<div class="gradient-settings svelte-10tq9kx"><div class="section svelte-10tq9kx"><div class="section-label svelte-10tq9kx">Type</div> <select class="combo svelte-10tq9kx"><optgroup label="Basic"><option>Linear</option> <option>Radial</option> <option>Conical</option></optgroup><optgroup label="Multi-point"><option>Radial Ramp</option> <option>Linear Ramp</option> <option>Square Ramp</option> <option>Reflected</option> <option>Mesh</option> <option>Volume Mesh</option></optgroup><optgroup label="Preset"><option>Duotone</option> <option>Tricolor</option> <option>Banding</option></optgroup></select></div> <!> <div class="section svelte-10tq9kx"><div class="section-label svelte-10tq9kx">Shape</div> <div class="toggle-row svelte-10tq9kx"><button title="Circle"><!></button> <button title="Ellipse"><!></button> <button title="Square"><!></button> <button title="Rectangle"><!></button> <button title="Triangle"><!></button></div></div> <div class="section svelte-10tq9kx"><div class="section-label svelte-10tq9kx">Edge</div> <div class="input-row svelte-10tq9kx"><div class="num-input-wrap svelte-10tq9kx"><button class="pos-arrow left svelte-10tq9kx" tabindex="-1">&#9664;</button> <input class="num-input svelte-10tq9kx" type="number" min="0" max="100"/> <button class="pos-arrow right svelte-10tq9kx" tabindex="-1">&#9654;</button></div> <span class="input-suffix svelte-10tq9kx">%</span></div></div> <div class="section stops-section svelte-10tq9kx"><div class="section-label svelte-10tq9kx">Stops</div> <div class="stops-list svelte-10tq9kx"></div> <button class="add-stop-btn svelte-10tq9kx"><!> Add</button></div> <div class="section svelte-10tq9kx"><div class="section-label svelte-10tq9kx">Presets</div> <div class="gradient-swatches-grid svelte-10tq9kx"></div></div></div>');function Ov(t,n){wt(n,!0);let r=S(()=>n.gradient),a=S(()=>n.selectedStop??0),o=S(()=>n.shape??"rectangle"),s=S(()=>n.onchange),i=S(()=>n.onSelectStop),c=S(()=>n.onEditStopColor),l=S(()=>n.onShapeChange),u=S(()=>n.gradientSwatches??[]),f=S(()=>n.onGradientPresetClick),m=S(()=>n.onGradientPresetDblClick),_=S(()=>n.onGradientPresetRightClick);function p(K){e(s)({...e(r),...K})}function g(K,Oe){const lt=e(r).stops.map((it,St)=>St===K?{...it,...Oe}:it);e(s)({...e(r),stops:lt})}function $(K){if(e(r).stops.length<=2)return;const Oe=e(r).stops.filter((lt,it)=>it!==K);e(s)({...e(r),stops:Oe}),e(i)&&e(i)(Math.min(K,Oe.length-1))}function w(){var pt,mt;const K=[...e(r).stops].sort((ot,rt)=>ot.position-rt.position);let Oe=0,lt=0,it=100;for(let ot=0;ot<K.length-1;ot++){const rt=K[ot+1].position-K[ot].position;rt>Oe&&(Oe=rt,lt=K[ot].position,it=K[ot+1].position)}const St=Math.round((lt+it)/2),xt=((pt=K.find(ot=>ot.position===lt))==null?void 0:pt.color)||"888888",Pt=((mt=K.find(ot=>ot.position===it))==null?void 0:mt.color)||"888888",dt=(ot,rt)=>Math.round((parseInt(ot,16)+parseInt(rt,16))/2).toString(16).padStart(2,"0"),vt=dt(xt.slice(0,2),Pt.slice(0,2))+dt(xt.slice(2,4),Pt.slice(2,4))+dt(xt.slice(4,6),Pt.slice(4,6)),ft=[...e(r).stops,{color:vt.toUpperCase(),position:St}];e(s)({...e(r),stops:ft}),e(i)&&e(i)(ft.length-1)}let k=S(()=>["linear","linearRamp","conical","reflected","duotone","tricolor","banding"].includes(e(r).type)),L=S(()=>["radial","conical","radialRamp","squareRamp","mesh","volumeMesh"].includes(e(r).type)),H=S(()=>["radial","radialRamp","linearRamp","squareRamp"].includes(e(r).type)),P=S(()=>[...e(r).stops].map((K,Oe)=>({...K,origIdx:Oe})).sort((K,Oe)=>K.position-Oe.position));function E(K){K.key==="Enter"&&K.target.blur()}var Q=jv(),O=v(Q),z=d(v(O),2),re=v(z),W=v(re);W.value=W.__value="linear";var Se=d(W,2);Se.value=Se.__value="radial";var Pe=d(Se,2);Pe.value=Pe.__value="conical";var Ke=d(re),Ge=v(Ke);Ge.value=Ge.__value="radialRamp";var Ye=d(Ge,2);Ye.value=Ye.__value="linearRamp";var B=d(Ye,2);B.value=B.__value="squareRamp";var y=d(B,2);y.value=y.__value="reflected";var N=d(y,2);N.value=N.__value="mesh";var ne=d(N,2);ne.value=ne.__value="volumeMesh";var ye=d(Ke),Ee=v(ye);Ee.value=Ee.__value="duotone";var M=d(Ee,2);M.value=M.__value="tricolor";var G=d(M,2);G.value=G.__value="banding";var ce;Gn(z);var ue=d(O,2);{var he=K=>{var Oe=zv(),lt=v(Oe);{var it=vt=>{var ft=Mv(),pt=d(U(ft),2),mt=v(pt),ot=v(mt),rt=d(ot,2),le=d(rt,2);te(()=>Et(rt,e(r).angle)),x("click",ot,()=>p({angle:Math.max(0,(e(r).angle??90)-1)})),x("keydown",rt,E),x("change",rt,Ae=>p({angle:parseInt(Ae.target.value)||0})),x("click",le,()=>p({angle:Math.min(360,(e(r).angle??90)+1)})),h(vt,ft)};je(lt,vt=>{e(k)&&vt(it)})}var St=d(lt,2);{var xt=vt=>{var ft=Tv(),pt=d(U(ft),2),mt=d(v(pt),2),ot=v(mt),rt=d(ot,2),le=d(rt,2),Ae=d(mt,4),_e=v(Ae),De=d(_e,2),Y=d(De,2);te(()=>{Et(rt,e(r).centerX),Et(De,e(r).centerY)}),x("click",ot,()=>p({centerX:Math.max(0,(e(r).centerX??50)-1)})),x("keydown",rt,E),x("change",rt,ee=>p({centerX:parseInt(ee.target.value)||50})),x("click",le,()=>p({centerX:Math.min(100,(e(r).centerX??50)+1)})),x("click",_e,()=>p({centerY:Math.max(0,(e(r).centerY??50)-1)})),x("keydown",De,E),x("change",De,ee=>p({centerY:parseInt(ee.target.value)||50})),x("click",Y,()=>p({centerY:Math.min(100,(e(r).centerY??50)+1)})),h(vt,ft)};je(St,vt=>{e(L)&&vt(xt)})}var Pt=d(St,2);{var dt=vt=>{var ft=Ev(),pt=d(U(ft),2),mt=v(pt);{var ot=ee=>{var ie=Pv();h(ee,ie)};je(mt,ee=>{(e(o)==="rectangle"||e(o)==="ellipse")&&ee(ot)})}var rt=d(mt,2),le=v(rt),Ae=d(le,2),_e=d(Ae,2),De=d(rt,2);{var Y=ee=>{var ie=Iv(),Re=d(U(ie),2),Le=v(Re),nt=d(Le,2),yt=d(nt,2);te(()=>Et(nt,e(r).radiusY)),x("click",Le,()=>p({radiusY:Math.max(1,(e(r).radiusY??50)-1)})),x("change",nt,R=>p({radiusY:parseInt(R.target.value)||50})),x("click",yt,()=>p({radiusY:Math.min(200,(e(r).radiusY??50)+1)})),h(ee,ie)};je(De,ee=>{(e(o)==="rectangle"||e(o)==="ellipse")&&ee(Y)})}te(()=>Et(Ae,e(r).radiusX)),x("click",le,()=>p({radiusX:Math.max(1,(e(r).radiusX??50)-1)})),x("keydown",Ae,E),x("change",Ae,ee=>p({radiusX:parseInt(ee.target.value)||50})),x("click",_e,()=>p({radiusX:Math.min(200,(e(r).radiusX??50)+1)})),h(vt,ft)};je(Pt,vt=>{e(H)&&vt(dt)})}h(K,Oe)};je(ue,K=>{(e(k)||e(L)||e(H))&&K(he)})}var be=d(ue,2),tt=d(v(be),2),Je=v(tt);let we;var Ze=v(Je);gi(Ze,{size:13,strokeWidth:1.5});var ct=d(Je,2);let Ce;var Fe=v(ct);gi(Fe,{size:13,strokeWidth:1.5,style:"transform: scaleX(1.4)"});var A=d(ct,2);let se;var j=v(A);ql(j,{size:13,strokeWidth:1.5});var T=d(A,2);let D;var C=v(T);Rl(C,{size:13,strokeWidth:1.5});var q=d(T,2);let V;var ae=v(q);$d(ae,{size:13,strokeWidth:1.5});var X=d(be,2),de=d(v(X),2),ve=v(de),fe=v(ve),me=d(fe,2),$e=d(me,2),Be=d(X,2),J=d(v(Be),2);$t(J,21,()=>e(P),zt,(K,Oe)=>{var lt=Fv();let it;var St=v(lt),xt=d(St,2),Pt=v(xt),dt=d(xt,2),vt=v(dt),ft=d(vt,2),pt=d(ft,2),mt=d(dt,4);{var ot=rt=>{var le=Nv(),Ae=v(le);La(Ae,{size:10,strokeWidth:2}),x("click",le,()=>$(e(Oe).origIdx)),h(rt,le)};je(mt,rt=>{e(r).stops.length>2&&rt(ot)})}te(()=>{it=We(lt,1,"stop-row svelte-10tq9kx",null,it,{selected:e(Oe).origIdx===e(a)}),Ue(St,`background: #${e(Oe).color??""}`),et(Pt,`#${e(Oe).color??""}`),Et(ft,e(Oe).position)}),x("click",St,()=>{e(i)&&e(i)(e(Oe).origIdx),e(c)&&e(c)(e(Oe).origIdx)}),x("click",vt,()=>g(e(Oe).origIdx,{position:Math.max(0,e(Oe).position-1)})),x("keydown",ft,E),x("change",ft,rt=>g(e(Oe).origIdx,{position:parseInt(rt.target.value)||0})),x("click",pt,()=>g(e(Oe).origIdx,{position:Math.min(100,e(Oe).position+1)})),h(K,lt)});var ke=d(J,2),qe=v(ke);Ra(qe,{size:11,strokeWidth:2});var xe=d(Be,2),ge=d(v(xe),2);$t(ge,21,()=>e(u),zt,(K,Oe,lt)=>{var it=Av();let St;te(xt=>{St=We(it,1,"gradient-swatch svelte-10tq9kx",null,St,{empty:!e(Oe)}),Ue(it,xt),ut(it,"title",e(Oe)?`${e(Oe).type} gradient — click to load, right-click to replace, double-click to clear`:"Click to store current gradient")},[()=>e(Oe)?`background: ${Ur(e(Oe))}`:""]),x("click",it,()=>e(f)&&e(f)(lt)),x("dblclick",it,()=>e(m)&&e(m)(lt)),x("contextmenu",it,xt=>e(_)&&e(_)(lt,xt)),h(K,it)}),te(()=>{ce!==(ce=e(r).type)&&(z.value=(z.__value=e(r).type)??"",wn(z,e(r).type)),we=We(Je,1,"toggle-btn svelte-10tq9kx",null,we,{active:e(o)==="circle"}),Ce=We(ct,1,"toggle-btn svelte-10tq9kx",null,Ce,{active:e(o)==="ellipse"}),se=We(A,1,"toggle-btn svelte-10tq9kx",null,se,{active:e(o)==="square"}),D=We(T,1,"toggle-btn svelte-10tq9kx",null,D,{active:e(o)==="rectangle"}),V=We(q,1,"toggle-btn svelte-10tq9kx",null,V,{active:e(o)==="triangle"}),Et(me,e(r).edge??0)}),x("change",z,K=>p({type:K.target.value})),x("click",Je,()=>e(l)&&e(l)("circle")),x("click",ct,()=>e(l)&&e(l)("ellipse")),x("click",A,()=>e(l)&&e(l)("square")),x("click",T,()=>e(l)&&e(l)("rectangle")),x("click",q,()=>e(l)&&e(l)("triangle")),x("click",fe,()=>p({edge:Math.max(0,(e(r).edge??0)-1)})),x("keydown",me,E),x("change",me,K=>p({edge:parseInt(K.target.value)||0})),x("click",$e,()=>p({edge:Math.min(100,(e(r).edge??0)+1)})),x("click",ke,w),h(t,Q),kt()}Tt(["change","click","keydown","dblclick","contextmenu"]);var Rv=I('<div class="shape-container svelte-lf5wz7"><div></div></div>'),Lv=I('<div class="gradient-fill svelte-lf5wz7"></div>'),qv=I('<div class="mini-preview svelte-lf5wz7"><button class="back-btn svelte-lf5wz7" title="Back to Gradient"><!> <span>Gradient</span></button> <div class="preview-area svelte-lf5wz7"><div class="checkerboard svelte-lf5wz7"></div> <!></div></div>');function Bv(t,n){wt(n,!0);let r=S(()=>n.gradient),a=S(()=>n.shape??"rectangle"),o=S(()=>n.onBack),s=S(()=>{var O;return((O=e(r))==null?void 0:O.type)==="squareRamp"?`url(${Wl(e(r),256,256)})`:Ur(e(r),e(a))}),i=S(()=>Gl(e(r))),c=S(()=>Hl(e(r))),l=S(()=>e(a)!=="rectangle"),u=S(()=>e(a)==="circle"?"shape-circle":e(a)==="square"?"shape-square":e(a)==="ellipse"?"shape-ellipse":e(a)==="triangle"?"shape-triangle":""),f=Z(null),m=Z(0),_=Z(0),p=Z(0);Tl(()=>{if(!e(f))return;const O=new ResizeObserver(([z])=>{const{width:re,height:W}=z.contentRect;b(_,re,!0),b(p,W,!0),b(m,Math.floor(Math.min(re,W)*.85),!0)});return O.observe(e(f)),()=>O.disconnect()});let g=S(()=>e(a)==="ellipse"?Math.floor(e(_)*.85):e(m)),$=S(()=>e(a)==="ellipse"?Math.floor(e(p)*.85):e(m));var w=qv(),k=v(w),L=v(k);Pu(L,{size:12,strokeWidth:2});var H=d(k,2),P=d(v(H),2);{var E=O=>{var z=Rv(),re=v(z);jn(z,W=>b(f,W),()=>e(f)),te(()=>{We(re,1,`gradient-fill ${e(u)??""}`,"svelte-lf5wz7"),Ue(re,`background: ${e(s)??""};${e(i)?` filter: ${e(i)};`:""}${e(c)?` background-blend-mode: ${e(c)};`:""} width: ${e(g)??""}px; height: ${e($)??""}px;`)}),h(O,z)},Q=O=>{var z=Lv();te(()=>Ue(z,`background: ${e(s)??""};${e(i)?` filter: ${e(i)};`:""}${e(c)?` background-blend-mode: ${e(c)};`:""}`)),h(O,z)};je(P,O=>{e(l)?O(E):O(Q,-1)})}x("click",k,function(...O){var z;(z=e(o))==null||z.apply(this,O)}),h(t,w),kt()}Tt(["click"]);var Dv=I('<button class="note-tab-close svelte-1lt2j28" title="Close note"><!></button>'),Hv=I('<button title="Double-click to rename"><span class="note-tab-label svelte-1lt2j28"> </span> <!></button>'),Gv=I('<div class="notepad-editor svelte-1lt2j28"><div class="note-tabs svelte-1lt2j28"><!> <button class="note-tab-add svelte-1lt2j28" title="Add note"><!></button></div> <div class="editor-area svelte-1lt2j28" contenteditable="true" spellcheck="false"></div></div>');function Wv(t,n){wt(n,!0);let r=He(n,"notes",31,()=>At([])),a=He(n,"activeNoteIndex",15,0),o=Z(null),s=Z(-1);Xt(()=>{const E=a();if(e(o)&&E!==e(s)){b(s,E,!0);const Q=r()[E];e(o).innerHTML=Q?Q.content:""}});function i(){if(!e(o)||!r()[a()])return;const E=e(o).innerHTML;r()[a()].content!==E&&(r(r()[a()].content=E,!0),n.onchange&&n.onchange(r()))}function c(){i()}function l(E){i(),a(E)}function u(){const E=`Note ${r().length+1}`;r([...r(),{name:E,content:""}]),a(r().length-1),n.onchange&&n.onchange(r())}function f(E,Q){Q.stopPropagation(),!(r().length<=1)&&(i(),r(r().filter((O,z)=>z!==E)),a()>=r().length?a(r().length-1):a()>E&&a(a()-1),b(s,-1),n.onchange&&n.onchange(r()))}function m(E){const Q=r()[E].name,O=prompt("Rename note:",Q);O&&O.trim()&&(r(r()[E].name=O.trim(),!0),r([...r()]),n.onchange&&n.onchange(r()))}function _(E){if(E.ctrlKey||E.metaKey)switch(E.key.toLowerCase()){case"b":E.preventDefault(),document.execCommand("bold");break;case"i":E.preventDefault(),document.execCommand("italic");break;case"u":E.preventDefault(),document.execCommand("underline");break}E.key==="Tab"&&(E.preventDefault(),document.execCommand("insertText",!1,"    "))}function p(){return e(o)}var g={getEditorElement:p},$=Gv(),w=v($),k=v(w);$t(k,17,r,zt,(E,Q,O)=>{var z=Hv();let re;var W=v(z),Se=v(W),Pe=d(W,2);{var Ke=Ge=>{var Ye=Dv(),B=v(Ye);La(B,{size:10}),x("click",Ye,y=>f(O,y)),h(Ge,Ye)};je(Pe,Ge=>{r().length>1&&Ge(Ke)})}te(()=>{re=We(z,1,"note-tab svelte-1lt2j28",null,re,{active:O===a()}),et(Se,e(Q).name)}),x("click",z,()=>l(O)),x("dblclick",z,()=>m(O)),h(E,z)});var L=d(k,2),H=v(L);Ra(H,{size:12});var P=d(w,2);return jn(P,E=>b(o,E),()=>e(o)),x("click",L,u),x("input",P,c),x("keydown",P,_),h(t,$),kt(g)}Tt(["click","dblclick","input","keydown"]);var Uv=I("<option> </option>"),Yv=I("<option> </option>"),Xv=I('<div class="notepad-settings svelte-1aixn3k"><div class="section svelte-1aixn3k"><div class="section-label svelte-1aixn3k">Font</div> <select class="combo svelte-1aixn3k"></select></div> <div class="section svelte-1aixn3k"><div class="section-label svelte-1aixn3k">Size</div> <div class="input-row svelte-1aixn3k"><select class="combo size-combo svelte-1aixn3k"></select> <input type="number" class="size-input svelte-1aixn3k" min="6" max="72"/></div></div> <div class="section svelte-1aixn3k"><div class="section-label svelte-1aixn3k">Format</div> <div class="toolbar-row svelte-1aixn3k"><button class="tool-btn svelte-1aixn3k" title="Bold (Ctrl+B)"><!></button> <button class="tool-btn svelte-1aixn3k" title="Italic (Ctrl+I)"><!></button> <button class="tool-btn svelte-1aixn3k" title="Underline (Ctrl+U)"><!></button> <button class="tool-btn svelte-1aixn3k" title="Strikethrough"><!></button> <button class="tool-btn svelte-1aixn3k" title="Clear formatting"><!></button></div></div> <div class="section svelte-1aixn3k"><div class="section-label svelte-1aixn3k">Align</div> <div class="toolbar-row svelte-1aixn3k"><button class="tool-btn svelte-1aixn3k" title="Align left"><!></button> <button class="tool-btn svelte-1aixn3k" title="Align center"><!></button> <button class="tool-btn svelte-1aixn3k" title="Align right"><!></button></div></div> <div class="section svelte-1aixn3k"><div class="section-label svelte-1aixn3k">Lists</div> <div class="toolbar-row svelte-1aixn3k"><button class="tool-btn svelte-1aixn3k" title="Bullet list"><!></button> <button class="tool-btn svelte-1aixn3k" title="Numbered list"><!></button></div></div> <div class="section svelte-1aixn3k"><div class="section-label svelte-1aixn3k">Text Color</div> <button class="pick-color-btn svelte-1aixn3k"><!> Pick from Colors</button></div></div>');function Vv(t,n){wt(n,!0);let r=Z("Consolas"),a=Z(12);const o=["Arial","Verdana","Helvetica","Tahoma","Georgia","Times New Roman","Courier New","Consolas","Lucida Console","Segoe UI","Trebuchet MS","Impact"],s=[8,9,10,11,12,14,16,18,20,24,28,32,36,48],i={8:1,9:1,10:2,11:2,12:3,14:3,16:4,18:4,20:5,24:5,28:6,32:6,36:7,48:7};function c(){var Fe;const Ce=(Fe=n.getEditorElement)==null?void 0:Fe.call(n);Ce&&Ce.focus()}function l(Ce,Fe=null){c(),document.execCommand(Ce,!1,Fe)}function u(){l("fontName",e(r))}function f(){var A;const Ce=i[e(a)]??3;l("fontSize",String(Ce));const Fe=(A=n.getEditorElement)==null?void 0:A.call(n);if(Fe){const se=Fe.querySelectorAll(`font[size="${Ce}"]`);for(const j of se)j.removeAttribute("size"),j.style.fontSize=`${e(a)}px`}}function m(Ce){Ce.key==="Enter"&&(Ce.target.blur(),f())}function _(Ce){Ce.target.select()}var p=Xv(),g=v(p),$=d(v(g),2);$t($,21,()=>o,zt,(Ce,Fe)=>{var A=Uv(),se=v(A),j={};te(()=>{Ue(A,`font-family: '${e(Fe)??""}'`),et(se,e(Fe)),j!==(j=e(Fe))&&(A.value=(A.__value=e(Fe))??"")}),h(Ce,A)});var w=d(g,2),k=d(v(w),2),L=v(k);$t(L,21,()=>s,zt,(Ce,Fe)=>{var A=Yv(),se=v(A),j={};te(()=>{et(se,`${e(Fe)??""}px`),j!==(j=e(Fe))&&(A.value=(A.__value=e(Fe))??"")}),h(Ce,A)});var H=d(L,2),P=d(w,2),E=d(v(P),2),Q=v(E),O=v(Q);zu(O,{size:13});var z=d(Q,2),re=v(z);Du(re,{size:13});var W=d(z,2),Se=v(W);xd(Se,{size:13});var Pe=d(W,2),Ke=v(Pe);fd(Ke,{size:13});var Ge=d(Pe,2),Ye=v(Ge);id(Ye,{size:13});var B=d(P,2),y=d(v(B),2),N=v(y),ne=v(N);_d(ne,{size:13});var ye=d(N,2),Ee=v(ye);hd(Ee,{size:13});var M=d(ye,2),G=v(M);gd(G,{size:13});var ce=d(B,2),ue=d(v(ce),2),he=v(ue),be=v(he);Xu(be,{size:13});var tt=d(he,2),Je=v(tt);Yu(Je,{size:13});var we=d(ce,2),Ze=d(v(we),2),ct=v(Ze);Ol(ct,{size:13}),x("change",$,u),zr($,()=>e(r),Ce=>b(r,Ce)),x("change",L,f),zr(L,()=>e(a),Ce=>b(a,Ce)),Mt("focus",H,_),x("keydown",H,m),x("change",H,f),Bo(H,()=>e(a),Ce=>b(a,Ce)),x("click",Q,()=>l("bold")),x("click",z,()=>l("italic")),x("click",W,()=>l("underline")),x("click",Pe,()=>l("strikeThrough")),x("click",Ge,()=>l("removeFormat")),x("click",N,()=>l("justifyLeft")),x("click",ye,()=>l("justifyCenter")),x("click",M,()=>l("justifyRight")),x("click",he,()=>l("insertUnorderedList")),x("click",tt,()=>l("insertOrderedList")),x("click",Ze,function(...Ce){var Fe;(Fe=n.onPickColor)==null||Fe.apply(this,Ce)}),h(t,p),kt()}Tt(["change","keydown","click"]);var Jv=I('<button title="Double-click to rename"><span class="image-tab-label svelte-1tkdscr"> </span> <span class="image-tab-close svelte-1tkdscr" role="button" tabindex="-1" title="Close image"><!></span></button>'),Zv=I('<img class="viewer-image svelte-1tkdscr" draggable="false"/>'),Kv=I('<div class="empty-message svelte-1tkdscr">Click + to load an image</div>'),Qv=I('<div class="viewer-editor svelte-1tkdscr"><div class="image-tabs svelte-1tkdscr"><!> <button class="image-tab-add svelte-1tkdscr" title="Load image"><!></button></div> <div><!></div></div>');function ef(t,n){wt(n,!0);let r=He(n,"images",31,()=>At([])),a=He(n,"activeImageIndex",15,0),o=Z(null),s=Z(0),i=Z(0);Xt(()=>{if(!e(o))return;const A=new ResizeObserver(se=>{for(const j of se)b(s,j.contentRect.width,!0),b(i,j.contentRect.height,!0)});return A.observe(e(o)),()=>A.disconnect()});let c=Z(At(new Map));function l(A){return e(c).has(A)||e(c).set(A,{zoom:100,panX:0,panY:0}),e(c).get(A)}let u=S(()=>(()=>{const A=l(a());return{zoom:A.zoom,panX:A.panX,panY:A.panY}})()),f=Z(!1);function m(A){b(f,A,!0),A&&w(),!A&&n.onColorHover&&n.onColorHover(null)}function _(){return e(f)}let p=null,g=null,$=null;function w(){const A=r()[a()];if(!A||!A.dataUrl||$===A.dataUrl)return;p=document.createElement("canvas"),p.width=A.naturalWidth,p.height=A.naturalHeight,g=p.getContext("2d",{willReadFrequently:!0});const se=new Image;se.onload=()=>{g.drawImage(se,0,0),$=A.dataUrl},se.src=A.dataUrl}function k(A){const se=r()[a()];if(!se||!e(o))return null;const j=e(o).getBoundingClientRect(),T=l(a()),D=T.zoom/100,C=j.width/2,q=j.height/2,V=A.clientX-j.left,ae=A.clientY-j.top,X=(V-C-T.panX)/D+se.naturalWidth/2,de=(ae-q-T.panY)/D+se.naturalHeight/2;return X<0||de<0||X>=se.naturalWidth||de>=se.naturalHeight?null:{x:Math.floor(X),y:Math.floor(de)}}function L(A,se){var T;if(!g||$!==((T=r()[a()])==null?void 0:T.dataUrl))return null;const j=g.getImageData(A,se,1,1).data;return((1<<24)+(j[0]<<16)+(j[1]<<8)+j[2]).toString(16).slice(1).toUpperCase()}function H(A){const se=k(A);if(!se)return;const j=L(se.x,se.y);j&&n.onColorPicked&&n.onColorPicked(j),b(f,!1),n.onColorHover&&n.onColorHover(null)}function P(A){if(!e(f))return;const se=k(A);if(!se){n.onColorHover&&n.onColorHover(null);return}const j=L(se.x,se.y);n.onColorHover&&n.onColorHover(j)}let E=Z(!1),Q=Z(0),O=Z(0),z=Z(0),re=Z(0);function W(A){a(A)}function Se(){const A=document.createElement("input");A.type="file",A.accept="image/*",A.onchange=se=>{const j=se.target.files[0];if(!j)return;const T=new FileReader;T.onload=()=>{const D={name:j.name,dataUrl:T.result,naturalWidth:0,naturalHeight:0},C=new Image;C.onload=()=>{D.naturalWidth=C.naturalWidth,D.naturalHeight=C.naturalHeight,r([...r(),D]),a(r().length-1),ne(a()),n.onchange&&n.onchange(r())},C.src=T.result},T.readAsDataURL(j)},A.click()}function Pe(A,se){se.stopPropagation(),!(r().length<=0)&&(r(r().filter((j,T)=>T!==A)),e(c).delete(A),r().length===0?a(0):a()>=r().length?a(r().length-1):a()>A&&a(a()-1),n.onchange&&n.onchange(r()))}function Ke(A){const se=r()[A].name,j=prompt("Rename image:",se);j&&j.trim()&&(r(r()[A].name=j.trim(),!0),r([...r()]),n.onchange&&n.onchange(r()))}function Ge(){const A=l(a());A.zoom=Math.min(A.zoom+10,1600),b(c,new Map(e(c)),!0)}function Ye(){const A=l(a());A.zoom=Math.max(A.zoom-10,10),b(c,new Map(e(c)),!0)}function B(A){const se=l(a());se.zoom=Math.max(10,Math.min(1600,A)),b(c,new Map(e(c)),!0)}function y(){return l(a()).zoom}function N(){const A=l(a());A.zoom=100,A.panX=0,A.panY=0,b(c,new Map(e(c)),!0)}function ne(A){const se=A??a(),j=r()[se];if(!j||!j.naturalWidth||!e(s)||!e(i))return;const T=e(s)/j.naturalWidth,D=e(i)/j.naturalHeight,C=Math.min(T,D,1)*100,q=l(se);q.zoom=Math.round(C),q.panX=0,q.panY=0,b(c,new Map(e(c)),!0)}function ye(A){if(A.button!==0)return;if(e(f)){A.preventDefault(),H(A);return}const se=l(a());b(E,!0),b(Q,A.clientX,!0),b(O,A.clientY,!0),b(z,se.panX,!0),b(re,se.panY,!0),A.preventDefault()}function Ee(A){if(!e(E))return;const se=l(a());se.panX=e(z)+(A.clientX-e(Q)),se.panY=e(re)+(A.clientY-e(O)),b(c,new Map(e(c)),!0)}function M(){b(E,!1)}function G(A){A.preventDefault();const se=l(a()),j=A.deltaY>0?-10:10;se.zoom=Math.max(10,Math.min(1600,se.zoom+j)),b(c,new Map(e(c)),!0)}var ce={setEyedropper:m,isEyedropper:_,zoomIn:Ge,zoomOut:Ye,setZoom:B,getZoom:y,zoom100:N,fitToSection:ne},ue=Qv();Mt("mousemove",Cr,Ee),Mt("mouseup",Cr,M);var he=v(ue),be=v(he);$t(be,17,r,zt,(A,se,j)=>{var T=Jv();let D;var C=v(T),q=v(C),V=d(C,2),ae=v(V);La(ae,{size:10}),te(()=>{D=We(T,1,"image-tab svelte-1tkdscr",null,D,{active:j===a()}),et(q,e(se).name)}),x("click",T,()=>W(j)),x("dblclick",T,()=>Ke(j)),x("click",V,X=>Pe(j,X)),h(A,T)});var tt=d(be,2),Je=v(tt);Ra(Je,{size:12});var we=d(he,2);let Ze;var ct=v(we);{var Ce=A=>{var se=Zv();te(()=>{ut(se,"src",r()[a()].dataUrl),ut(se,"alt",r()[a()].name),Ue(se,`
          transform: translate(${e(u).panX??""}px, ${e(u).panY??""}px) scale(${e(u).zoom/100});
          transform-origin: center center;
        `)}),h(A,se)},Fe=A=>{var se=Kv();h(A,se)};je(ct,A=>{r().length>0&&r()[a()]?A(Ce):A(Fe,-1)})}return jn(we,A=>b(o,A),()=>e(o)),te(()=>Ze=We(we,1,"viewer-canvas svelte-1tkdscr",null,Ze,{dragging:e(E),eyedropper:e(f)})),x("click",tt,Se),x("mousedown",we,ye),x("mousemove",we,P),Mt("wheel",we,G),h(t,ue),kt(ce)}Tt(["click","dblclick","mousedown","mousemove"]);var tf=I('<div class="section color-preview-section svelte-12jhwcb"><div class="section-label svelte-12jhwcb">Preview</div> <div class="color-preview-row svelte-12jhwcb"><div class="color-preview-swatch svelte-12jhwcb"></div> <span class="color-preview-hex svelte-12jhwcb"> </span></div></div>'),nf=I('<div class="viewer-settings svelte-12jhwcb"><div class="section svelte-12jhwcb"><div class="section-label svelte-12jhwcb">Actions</div> <button class="action-btn svelte-12jhwcb"><!> Load Image</button> <button><!> Eyedropper</button></div> <!> <div class="section svelte-12jhwcb"><div class="section-label svelte-12jhwcb">Zoom</div> <div class="zoom-display svelte-12jhwcb"><input type="number" class="zoom-input svelte-12jhwcb" min="10" max="1600"/> <span class="zoom-pct svelte-12jhwcb">%</span></div> <div class="toolbar-row svelte-12jhwcb"><button class="tool-btn svelte-12jhwcb" title="Zoom Out"><!></button> <button class="tool-btn svelte-12jhwcb" title="Zoom In"><!></button> <button class="tool-btn svelte-12jhwcb" title="100%"><!></button> <button class="tool-btn svelte-12jhwcb" title="Fit to View"><!></button></div></div> <div class="status-area svelte-12jhwcb"><input type="text" class="status-box svelte-12jhwcb" readonly=""/></div></div>');function rf(t,n){wt(n,!0);let r=He(n,"statusMessage",3,""),a=He(n,"hoverColor",3,null),o=Z(100);Xt(()=>{const M=setInterval(()=>{var ce,ue;const G=(ce=n.getViewerRef)==null?void 0:ce.call(n);G&&b(o,((ue=G.getZoom)==null?void 0:ue.call(G))??100,!0)},100);return()=>clearInterval(M)});function s(){var M,G,ce;(ce=(G=(M=n.getViewerRef)==null?void 0:M.call(n))==null?void 0:G.zoomIn)==null||ce.call(G)}function i(){var M,G,ce;(ce=(G=(M=n.getViewerRef)==null?void 0:M.call(n))==null?void 0:G.zoomOut)==null||ce.call(G)}function c(){var M,G,ce;(ce=(G=(M=n.getViewerRef)==null?void 0:M.call(n))==null?void 0:G.zoom100)==null||ce.call(G)}function l(){var M,G,ce;(ce=(G=(M=n.getViewerRef)==null?void 0:M.call(n))==null?void 0:G.fitToSection)==null||ce.call(G)}function u(){var M,G,ce,ue;((ce=(G=(M=n.getViewerRef)==null?void 0:M.call(n))==null?void 0:G.addImage)==null?void 0:ce.call(G))??((ue=document.querySelector(".image-tab-add"))==null||ue.click())}function f(){var ce,ue,he;const M=(ce=n.getViewerRef)==null?void 0:ce.call(n);if(!M)return;const G=((ue=M.isEyedropper)==null?void 0:ue.call(M))??!1;(he=M.setEyedropper)==null||he.call(M,!G)}let m=S(()=>(()=>{var M,G,ce;return e(o),((ce=(G=(M=n.getViewerRef)==null?void 0:M.call(n))==null?void 0:G.isEyedropper)==null?void 0:ce.call(G))??!1})());function _(M){var ce,ue,he;const G=parseInt(M.target.value,10);isNaN(G)||(he=(ue=(ce=n.getViewerRef)==null?void 0:ce.call(n))==null?void 0:ue.setZoom)==null||he.call(ue,G)}function p(M){M.key==="Enter"&&(M.target.blur(),_(M))}function g(M){M.target.select()}var $=nf(),w=v($),k=d(v(w),2),L=v(k);Bu(L,{size:13});var H=d(k,2);let P;var E=v(H);Ol(E,{size:13});var Q=d(w,2);{var O=M=>{var G=tf(),ce=d(v(G),2),ue=v(ce),he=d(ue,2),be=v(he);te(()=>{Ue(ue,`background: #${a()??""}`),et(be,`#${a()??""}`)}),h(M,G)};je(Q,M=>{a()&&M(O)})}var z=d(Q,2),re=d(v(z),2),W=v(re),Se=d(re,2),Pe=v(Se),Ke=v(Pe);kd(Ke,{size:13});var Ge=d(Pe,2),Ye=v(Ge);Dl(Ye,{size:13});var B=d(Ge,2),y=v(B);Ll(y,{size:13});var N=d(B,2),ne=v(N);Al(ne,{size:13});var ye=d(z,2),Ee=v(ye);te(()=>{P=We(H,1,"action-btn eyedropper-btn svelte-12jhwcb",null,P,{active:e(m)}),Et(W,e(o)),Et(Ee,r())}),x("click",k,u),x("click",H,f),Mt("focus",W,g),x("keydown",W,p),x("change",W,_),x("click",Pe,i),x("click",Ge,s),x("click",B,c),x("click",N,l),h(t,$),kt()}Tt(["click","keydown","change"]);const mi=2e3,Wo=bn([]);let af=1;function of(){const t=new Date;return String(t.getHours()).padStart(2,"0")+":"+String(t.getMinutes()).padStart(2,"0")+":"+String(t.getSeconds()).padStart(2,"0")+"."+String(t.getMilliseconds()).padStart(3,"0")}function Yr(t,n,r){const a=r.map(o=>typeof o=="string"?o:JSON.stringify(o,null,2)??String(o)).join(" ");Wo.update(o=>{const s=[...o,{id:af++,timestamp:of(),level:t,source:n,message:a}];return s.length>mi?s.slice(s.length-mi):s})}function Ka(){Wo.set([])}const lf=console.log,sf=console.warn,cf=console.error,uf=console.info,df=console.debug;console.log=(...t)=>{lf(...t),Yr("log","js",t)};console.warn=(...t)=>{sf(...t),Yr("warn","js",t)};console.error=(...t)=>{cf(...t),Yr("error","js",t)};console.info=(...t)=>{uf(...t),Yr("info","js",t)};console.debug=(...t)=>{df(...t),Yr("debug","js",t)};function vf(){Wt()&&window.__JUCE__.backend.addEventListener("debugLog",t=>{const n=t.level||"log",r=t.message||JSON.stringify(t);Yr(n,"c++",[r])})}var ff=I("<option> </option>"),pf=I('<div><span class="log-time svelte-1mot0gd"> </span> <span> </span> <span class="log-level svelte-1mot0gd"> </span> <span class="log-msg svelte-1mot0gd"> </span></div>'),gf=I('<div class="empty-msg svelte-1mot0gd">No console output</div>'),hf=I('<div class="console-panel svelte-1mot0gd"><div class="console-toolbar svelte-1mot0gd"><button class="tool-btn svelte-1mot0gd" title="Clear console"><!></button> <div class="toolbar-separator svelte-1mot0gd"></div> <select class="level-filter svelte-1mot0gd"></select> <div class="filter-box svelte-1mot0gd"><!> <input type="text" class="filter-input svelte-1mot0gd" placeholder="Filter..."/></div> <div class="toolbar-spacer svelte-1mot0gd"></div> <span class="entry-count svelte-1mot0gd"> </span> <button title="Scroll to bottom"><!></button></div> <div class="console-log svelte-1mot0gd"><!> <!></div></div>');function _f(t,n){wt(n,!0);const r=()=>Nt(Wo,"$consoleEntries",a),[a,o]=cr();let s=Z(null),i=Z(!0),c=Z(""),l=Z("all");const u=["all","log","info","debug","warn","error"];let f=S(()=>(()=>{let y=r();if(e(l)!=="all"&&(y=y.filter(N=>N.level===e(l))),e(c)){const N=e(c).toLowerCase();y=y.filter(ne=>ne.message.toLowerCase().includes(N)||ne.source.toLowerCase().includes(N))}return y})());Xt(()=>{e(f).length,e(i)&&e(s)&&requestAnimationFrame(()=>{e(s).scrollTop=e(s).scrollHeight})});function m(){if(!e(s))return;const{scrollTop:y,scrollHeight:N,clientHeight:ne}=e(s);b(i,N-y-ne<24)}function _(){b(i,!0),e(s)&&(e(s).scrollTop=e(s).scrollHeight)}function p(y){y.target.select()}function g(y){return y==="error"?"lvl-error":y==="warn"?"lvl-warn":y==="info"?"lvl-info":y==="debug"?"lvl-debug":"lvl-log"}function $(y){return y==="c++"?"C++":y==="js"?"JS":"APP"}var w=hf(),k=v(w),L=v(k),H=v(L);md(H,{size:12});var P=d(L,4);$t(P,21,()=>u,zt,(y,N)=>{var ne=ff(),ye=v(ne),Ee={};te(M=>{et(ye,M),Ee!==(Ee=e(N))&&(ne.value=(ne.__value=e(N))??"")},[()=>e(N)==="all"?"All Levels":e(N).charAt(0).toUpperCase()+e(N).slice(1)]),h(y,ne)});var E=d(P,2),Q=v(E);qu(Q,{size:10});var O=d(Q,2),z=d(E,4),re=v(z),W=d(z,2);let Se;var Pe=v(W);Tu(Pe,{size:12});var Ke=d(k,2),Ge=v(Ke);$t(Ge,17,()=>e(f),y=>y.id,(y,N)=>{var ne=pf(),ye=v(ne),Ee=v(ye),M=d(ye,2),G=v(M),ce=d(M,2),ue=v(ce),he=d(ce,2),be=v(he);te((tt,Je,we)=>{We(ne,1,`log-entry ${tt??""}`,"svelte-1mot0gd"),et(Ee,e(N).timestamp),We(M,1,`log-source ${e(N).source??""}`,"svelte-1mot0gd"),et(G,Je),et(ue,we),et(be,e(N).message)},[()=>g(e(N).level),()=>$(e(N).source),()=>e(N).level.toUpperCase().padEnd(5)]),h(y,ne)});var Ye=d(Ge,2);{var B=y=>{var N=gf();h(y,N)};je(Ye,y=>{e(f).length===0&&y(B)})}jn(Ke,y=>b(s,y),()=>e(s)),te(()=>{et(re,e(f).length),Se=We(W,1,"tool-btn svelte-1mot0gd",null,Se,{active:e(i)})}),x("click",L,function(...y){Ka==null||Ka.apply(this,y)}),zr(P,()=>e(l),y=>b(l,y)),Mt("focus",O,p),Bo(O,()=>e(c),y=>b(c,y)),x("click",W,_),Mt("scroll",Ke,m),h(t,w),kt(),o()}Tt(["click"]);const qa=bn(null);function Ul(t,n){const r=(n||"333333").replace(/^#/,"");let a,o;return r.length===8?(o=parseInt(r.slice(0,2),16)/255,a=r.slice(2,8)):(o=1,a=r.slice(0,6)),qa.set({...t,_initialColor:a,_initialAlpha:o}),{color:a,alpha:o}}function bf(t){const n=tn(qa);if(n)if(n.type==="panel"){const r=tn(Jt);if(r==null)return;Me(r,{[n.prop]:t,modified:!0})}else n.type==="control"&&en(n.controlId,n.path,t)}function mf(){qa.set(null)}const yo=bn(null);var $f=I("<button> </button>"),xf=I('<div class="gradient-mini svelte-12apuct"><!></div>'),yf=I('<div class="notepad-color-mini svelte-12apuct"><div class="notepad-color-preview svelte-12apuct"></div> <div class="notepad-color-hex svelte-12apuct"> </div> <button class="notepad-color-back svelte-12apuct">Back to Notepad</button></div>'),wf=I("<button></button>"),kf=I("<button></button>"),Sf=I("<button></button>"),Cf=I('<div class="notepad-layout svelte-12apuct"><div class="notepad-editor-area svelte-12apuct"><!></div> <div class="notepad-sidebar svelte-12apuct"><div class="sidebar-settings svelte-12apuct"><!></div> <div class="sidebar-swatches svelte-12apuct"><div class="swatches-label svelte-12apuct">Colors</div> <div class="swatches-grid svelte-12apuct"></div></div></div></div>'),Mf=I('<div class="placeholder svelte-12apuct">Open or create a panel to use the Notepad</div>'),Tf=I('<div class="viewer-layout svelte-12apuct"><div class="viewer-canvas-area svelte-12apuct"><!></div> <div class="viewer-sidebar svelte-12apuct"><div class="sidebar-settings svelte-12apuct"><!></div></div></div>'),Pf=I('<div class="placeholder svelte-12apuct">Open or create a panel to use the Viewer</div>'),If=I('<div class="display-panel svelte-12apuct"><div class="tab-bar svelte-12apuct"></div> <div class="tab-content svelte-12apuct"><div class="tab-pane svelte-12apuct"><div class="colors-layout svelte-12apuct"><div><!></div> <!> <!> <div class="colors-sidebar svelte-12apuct"><div class="sidebar-settings svelte-12apuct"><!></div> <div class="sidebar-swatches svelte-12apuct"><div class="swatches-label svelte-12apuct">Colors</div> <div class="swatches-grid svelte-12apuct"></div></div></div></div></div> <div class="tab-pane svelte-12apuct"><div class="gradient-layout svelte-12apuct"><div class="gradient-preview svelte-12apuct"><!></div> <div class="gradient-sidebar svelte-12apuct"><div class="sidebar-settings svelte-12apuct"><!></div> <div class="sidebar-swatches svelte-12apuct"><div class="swatches-label svelte-12apuct">Colors</div> <div class="swatches-grid svelte-12apuct"></div></div></div></div></div> <div class="tab-pane svelte-12apuct"><!></div> <div class="tab-pane svelte-12apuct"><!></div> <div class="tab-pane svelte-12apuct"><div class="placeholder svelte-12apuct">Tools</div></div> <div class="tab-pane svelte-12apuct"><!></div></div></div>');function Ef(t,n){var yt;wt(n,!0);const r=()=>Nt(yo,"$displayTabRequest",s),a=()=>Nt(Do,"$activePanel",s),o=()=>Nt(qa,"$colorTarget",s),[s,i]=cr();let c=S(()=>n.onTabChange),l=Z("colors");Xt(()=>{const R=r();R&&(be(R.tab),yo.set(null))});let u=Z(At(((yt=a())==null?void 0:yt.bgColour)??"333333")),f=Z(1),m=null;Xt(()=>{const R=o();R&&R._initialColor&&R!==m&&(m=R,b(l,"colors"),b(u,R._initialColor,!0),b(f,R._initialAlpha??1,!0)),R||(m=null)});let _=Z(10),p=At(Array(24).fill(null)),g=Z(0),$=Z("rectangle"),w=At(Array(24).fill(null));const k={type:"linear",angle:90,centerX:50,centerY:50,radiusX:50,radiusY:50,edge:0,stops:[{color:"FF0000",position:0},{color:"0000FF",position:100}]};let L=Z(At(JSON.parse(JSON.stringify(k)))),H=Z(At([{name:"Note 1",content:""}])),P=Z(0),E=Z(null),Q=Z(At([])),O=Z(0),z=Z(null),re=Z(""),W=Z(null),Se=Z(null);Xt(()=>{const R=a();if(R&&R.id!==e(Se)){b(Se,R.id,!0),b(L,R.bgGradient?JSON.parse(JSON.stringify(R.bgGradient)):JSON.parse(JSON.stringify(k)),!0);const oe=R.notepad;oe?(b(H,JSON.parse(JSON.stringify(oe.notes)),!0),b(P,oe.activeNoteIndex??0,!0)):(b(H,[{name:"Note 1",content:""}],!0),b(P,0));const Xe=R.viewer;Xe?(b(Q,JSON.parse(JSON.stringify(Xe.images)),!0),b(O,Xe.activeImageIndex??0,!0)):(b(Q,[],!0),b(O,0))}});let Pe=Z(null),Ke=Z(!1),Ge=Z(null),Ye=Z("DDDDDD"),B=S(()=>(()=>{if(e(Pe)===null)return e(L);const R=e(L).stops.map((oe,Xe)=>Xe===e(Pe)?{...oe,color:e(u)}:oe);return{...e(L),stops:R}})());function y(R){if(R.length>=8?(b(f,parseInt(R.slice(0,2),16)/255),b(u,R.slice(2,8),!0)):(b(f,1),b(u,R.slice(0,6),!0)),e(Pe)===null){if(!e(Ke))if(o())bf(R);else{const oe=a();oe&&Me(oe.id,{bgColour:e(u),modified:!0})}}}function N(R){b(H,R,!0);const oe=a();oe&&Me(oe.id,{notepad:{notes:JSON.parse(JSON.stringify(R)),activeNoteIndex:e(P)},modified:!0})}function ne(R){b(Q,R,!0);const oe=a();oe&&Me(oe.id,{viewer:{images:JSON.parse(JSON.stringify(R)),activeImageIndex:e(O)},modified:!0})}function ye(R){const oe=p.findIndex(Xe=>Xe===null);oe!==-1?(p[oe]=R,b(re,`#${R} saved to swatch ${oe+1}`)):b(re,`#${R} — no empty swatch (double-click one to clear)`)}function Ee(R){b(L,R,!0);const oe=a();oe&&Me(oe.id,{bgGradient:R,modified:!0})}function M(R){e(L).stops[R]&&(b(Pe,R,!0),b(u,e(L).stops[R].color,!0),b(f,1),b(l,"colors"))}function G(){if(e(Pe)===null)return;const R=e(L).stops.map((Xe,at)=>at===e(Pe)?{...Xe,color:e(u)}:Xe);b(L,{...e(L),stops:R},!0);const oe=a();oe&&Me(oe.id,{bgGradient:e(L),modified:!0})}function ce(){G();const R=a();R&&(b(u,R.bgColour,!0),b(f,1)),b(Pe,null),b(l,"gradient"),e(c)&&e(c)("gradient")}function ue(){const R=window.getSelection();R&&R.rangeCount>0&&b(Ge,R.getRangeAt(0).cloneRange(),!0),b(Ke,!0),b(l,"colors"),e(c)&&e(c)("colors")}function he(){const R=e(u);b(Ye,R,!0);const oe=e(Ge);b(Ge,null);const Xe=a();Xe&&(b(u,Xe.bgColour,!0),b(f,1)),b(Ke,!1),b(l,"notepad"),e(c)&&e(c)("notepad"),requestAnimationFrame(()=>{var st,It;const at=(It=(st=e(E))==null?void 0:st.getEditorElement)==null?void 0:It.call(st);if(at&&oe){at.focus();const Zt=window.getSelection();Zt.removeAllRanges(),Zt.addRange(oe),document.execCommand("foreColor",!1,"#"+R)}})}function be(R){if(e(Pe)!==null&&R!=="colors"){G(),b(Pe,null);const oe=a();oe&&(b(u,oe.bgColour,!0),b(f,1))}if(e(Ke)&&R!=="colors"){b(Ge,null),b(Ke,!1);const oe=a();oe&&(b(u,oe.bgColour,!0),b(f,1))}if(o()&&R!=="colors"){mf();const oe=a();oe&&(b(u,oe.bgColour,!0),b(f,1))}b(l,R,!0),e(c)&&e(c)(R)}function tt(R){p[R]?y("FF"+p[R]):p[R]=e(u)}function Je(R){p[R]=null}function we(R,oe){oe.preventDefault(),p[R]=e(u)}function Ze(R){const oe=e(L),Xe=a();if(p[R]){if(Xe){const at=oe.stops.map((st,It)=>It===e(g)?{...st,color:p[R]}:st);Me(Xe.id,{bgGradient:{...oe,stops:at},modified:!0})}}else oe.stops[e(g)]&&(p[R]=oe.stops[e(g)].color)}function ct(R){var oe,Xe;if(p[R]){b(Ye,p[R],!0);const at=(Xe=(oe=e(E))==null?void 0:oe.getEditorElement)==null?void 0:Xe.call(oe);at&&(at.focus(),document.execCommand("foreColor",!1,"#"+p[R]))}else p[R]=e(Ye)}function Ce(R){w[R]?(b(L,JSON.parse(JSON.stringify(w[R])),!0),Ee(e(L))):w[R]=JSON.parse(JSON.stringify(e(L)))}function Fe(R){w[R]=null}function A(R,oe){oe.preventDefault(),w[R]=JSON.parse(JSON.stringify(e(L)))}const se=[{id:"colors",label:"Colors"},{id:"gradient",label:"Gradient"},{id:"notepad",label:"Notepad"},{id:"viewer",label:"Viewer"},{id:"tools",label:"Tools"},{id:"console",label:"Console"}];var j=If(),T=v(j);$t(T,21,()=>se,zt,(R,oe)=>{var Xe=$f();let at;var st=v(Xe);te(()=>{at=We(Xe,1,"tab svelte-12apuct",null,at,{active:e(l)===e(oe).id}),et(st,e(oe).label)}),x("click",Xe,()=>be(e(oe).id)),h(R,Xe)});var D=d(T,2),C=v(D);let q;var V=v(C),ae=v(V);let X;var de=v(ae);lv(de,{get color(){return e(u)},get alpha(){return e(f)},get stepSize(){return e(_)},onchange:y});var ve=d(ae,2);{var fe=R=>{var oe=xf(),Xe=v(oe);Bv(Xe,{get gradient(){return e(B)},get shape(){return e($)},onBack:ce}),h(R,oe)};je(ve,R=>{e(Pe)!==null&&e(L)&&R(fe)})}var me=d(ve,2);{var $e=R=>{var oe=yf(),Xe=v(oe),at=d(Xe,2),st=v(at),It=d(at,2);te(()=>{Ue(Xe,`background: #${e(u)??""}`),et(st,`#${e(u)??""}`)}),x("click",It,he),h(R,oe)};je(me,R=>{e(Ke)&&R($e)})}var Be=d(me,2),J=v(Be),ke=v(J);fv(ke,{get color(){return e(u)},get alpha(){return e(f)},onApplyColor:y,get stepSize(){return e(_)},set stepSize(R){b(_,R,!0)}});var qe=d(J,2),xe=d(v(qe),2);$t(xe,21,()=>p,zt,(R,oe,Xe)=>{var at=wf();let st;te(()=>{st=We(at,1,"swatch svelte-12apuct",null,st,{empty:!e(oe)}),Ue(at,e(oe)?`background: #${e(oe)}`:""),ut(at,"title",e(oe)?`#${e(oe)} — right-click to replace, double-click to clear`:"Click to store current color")}),x("click",at,()=>tt(Xe)),x("dblclick",at,()=>Je(Xe)),x("contextmenu",at,It=>we(Xe,It)),h(R,at)});var ge=d(C,2);let K;var Oe=v(ge),lt=v(Oe),it=v(lt);Cv(it,{get gradient(){return e(L)},get selectedStop(){return e(g)},get shape(){return e($)},onchange:Ee,onSelectStop:R=>b(g,R,!0)});var St=d(lt,2),xt=v(St),Pt=v(xt);Ov(Pt,{get gradient(){return e(L)},get selectedStop(){return e(g)},get shape(){return e($)},onchange:Ee,onSelectStop:R=>b(g,R,!0),onEditStopColor:M,onShapeChange:R=>b($,R,!0),get gradientSwatches(){return w},onGradientPresetClick:Ce,onGradientPresetDblClick:Fe,onGradientPresetRightClick:A});var dt=d(xt,2),vt=d(v(dt),2);$t(vt,21,()=>p,zt,(R,oe,Xe)=>{var at=kf();let st;te(()=>{st=We(at,1,"swatch svelte-12apuct",null,st,{empty:!e(oe)}),Ue(at,e(oe)?`background: #${e(oe)}`:""),ut(at,"title",e(oe)?`#${e(oe)} — click to assign to selected stop`:"Click to store stop color")}),x("click",at,()=>Ze(Xe)),x("dblclick",at,()=>Je(Xe)),x("contextmenu",at,It=>we(Xe,It)),h(R,at)});var ft=d(ge,2);let pt;var mt=v(ft);{var ot=R=>{var oe=Cf(),Xe=v(oe),at=v(Xe);jn(Wv(at,{onchange:N,get notes(){return e(H)},set notes(Kt){b(H,Kt,!0)},get activeNoteIndex(){return e(P)},set activeNoteIndex(Kt){b(P,Kt,!0)}}),Kt=>b(E,Kt,!0),()=>e(E));var st=d(Xe,2),It=v(st),Zt=v(It);Vv(Zt,{getEditorElement:()=>{var Kt,Zn;return(Zn=(Kt=e(E))==null?void 0:Kt.getEditorElement)==null?void 0:Zn.call(Kt)},onPickColor:ue});var Qt=d(It,2),ur=d(v(Qt),2);$t(ur,21,()=>p,zt,(Kt,Zn,Ba)=>{var dr=Sf();let Yo;te(()=>{Yo=We(dr,1,"swatch svelte-12apuct",null,Yo,{empty:!e(Zn)}),Ue(dr,e(Zn)?`background: #${e(Zn)}`:""),ut(dr,"title",e(Zn)?`#${e(Zn)} — click to apply as text color`:"Click to store current color")}),x("click",dr,()=>ct(Ba)),x("dblclick",dr,()=>Je(Ba)),x("contextmenu",dr,Xl=>we(Ba,Xl)),h(Kt,dr)}),h(R,oe)},rt=R=>{var oe=Mf();h(R,oe)};je(mt,R=>{a()?R(ot):R(rt,-1)})}var le=d(ft,2);let Ae;var _e=v(le);{var De=R=>{var oe=Tf(),Xe=v(oe),at=v(Xe);jn(ef(at,{onchange:ne,onColorPicked:ye,onColorHover:Qt=>b(W,Qt,!0),get images(){return e(Q)},set images(Qt){b(Q,Qt,!0)},get activeImageIndex(){return e(O)},set activeImageIndex(Qt){b(O,Qt,!0)}}),Qt=>b(z,Qt,!0),()=>e(z));var st=d(Xe,2),It=v(st),Zt=v(It);rf(Zt,{getViewerRef:()=>e(z),get statusMessage(){return e(re)},get hoverColor(){return e(W)}}),h(R,oe)},Y=R=>{var oe=Pf();h(R,oe)};je(_e,R=>{a()?R(De):R(Y,-1)})}var ee=d(le,2);let ie;var Re=d(ee,2);let Le;var nt=v(Re);_f(nt,{}),te(()=>{q=Ue(C,"",q,{display:e(l)==="colors"?"block":"none"}),X=We(ae,1,"colors-preview svelte-12apuct",null,X,{split:e(Pe)!==null||e(Ke)}),K=Ue(ge,"",K,{display:e(l)==="gradient"?"block":"none"}),pt=Ue(ft,"",pt,{display:e(l)==="notepad"?"block":"none"}),Ae=Ue(le,"",Ae,{display:e(l)==="viewer"?"block":"none"}),ie=Ue(ee,"",ie,{display:e(l)==="tools"?"block":"none"}),Le=Ue(Re,"",Le,{display:e(l)==="console"?"block":"none"})}),h(t,j),kt(),i()}Tt(["click","dblclick","contextmenu"]);const Uo=bn("");function zf(t){Uo.set(t)}function Nf(){Uo.set("")}var Ff=I('<div class="num-input svelte-16ngfpx"><button class="num-btn svelte-16ngfpx" title="Decrease">&minus;</button> <input class="num-field svelte-16ngfpx" type="number"/> <button class="num-btn svelte-16ngfpx" title="Increase">+</button></div>');function Ct(t,n){wt(n,!0);let r=He(n,"value",3,0),a=He(n,"step",3,1),o=He(n,"min",3,void 0),s=He(n,"max",3,void 0),i=He(n,"onchange",3,null);function c(k){return o()!=null&&k<o()&&(k=o()),s()!=null&&k>s()&&(k=s()),k}function l(k){var H;const L=c(k);(H=i())==null||H(L)}function u(){l((r()??0)-a())}function f(){l((r()??0)+a())}function m(k){const L=Number(k.target.value);isNaN(L)||l(L)}function _(k){k.target.select()}var p=Ff(),g=v(p),$=d(g,2),w=d($,2);te(()=>{Et($,r()),ut($,"step",a()),ut($,"min",o()),ut($,"max",s())}),x("click",g,u),Mt("focus",$,_),x("change",$,m),x("click",w,f),h(t,p),kt()}Tt(["click","change"]);var Af=I('<div role="group"><span class="property-label svelte-1ju67x2"> </span> <div class="property-input svelte-1ju67x2"><!></div></div>');function Ve(t,n){wt(n,!0);let r=He(n,"label",3,""),a=He(n,"span",3,1),o=He(n,"disabled",3,!1),s=He(n,"hint",3,"");var i=Af();let c;var l=v(i),u=v(l),f=d(l,2),m=v(f);wl(m,()=>n.children),te(()=>{c=We(i,1,"property-cell svelte-1ju67x2",null,c,{"span-1":a()===1,"span-2":a()===2,"span-4":a()===4,disabled:o()}),et(u,r())}),Mt("mouseenter",i,()=>s()&&zf(s())),Mt("mouseleave",i,()=>s()&&Nf()),h(t,i),kt()}var jf=I('<div class="property-grid svelte-166v1jb"><!></div>'),Of=I('<div class="property-section svelte-166v1jb"><button class="property-section-header svelte-166v1jb"><svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 3l3 4 3-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg> <span class="header-line svelte-166v1jb"></span> <span class="property-section-title"> </span></button> <!></div>');function Lt(t,n){wt(n,!0);let r=He(n,"title",3,""),a=He(n,"collapsed",15,!1),o=He(n,"ontoggle",3,null);function s(){var g;a(!a()),(g=o())==null||g(a())}var i=Of(),c=v(i),l=v(c);let u;var f=d(l,4),m=v(f),_=d(c,2);{var p=g=>{var $=jf(),w=v($);wl(w,()=>n.children),h(g,$)};je(_,g=>{a()||g(p)})}te(()=>{u=We(l,0,"chevron svelte-166v1jb",null,u,{collapsed:a()}),et(m,r())}),x("click",c,s),h(t,i),kt()}Tt(["click"]);var Rf=I("<button> </button>");function Mn(t,n){wt(n,!0);let r=He(n,"value",3,!1),a=He(n,"onchange",3,null);function o(){var l;(l=a())==null||l(!r())}var s=Rf();let i;var c=v(s);te(()=>{i=We(s,1,"property-toggle svelte-f6ymfy",null,i,{on:r()}),et(c,r()?"On":"Off")}),x("click",s,o),h(t,s),kt()}Tt(["click"]);var Lf=I('<div class="property-color svelte-12hw957"><button class="mini-swatch svelte-12hw957" title="Pick colour"></button> <input class="color-hex svelte-12hw957" type="text"/></div>');function Qa(t,n){wt(n,!0);let r=He(n,"value",3,"000000"),a=He(n,"onchange",3,null),o=He(n,"onswatchclick",3,null);function s(f){var m;(m=a())==null||m(f.target.value)}function i(f){f.target.select()}var c=Lf(),l=v(c),u=d(l,2);te(f=>{Ue(l,`background:#${f??""}`),Et(u,r())},[()=>r().slice(-6)]),x("click",l,()=>{var f;return(f=o())==null?void 0:f()}),Mt("focus",u,i),x("change",u,s),h(t,c),kt()}Tt(["click","change"]);var qf=I('<button><span class="align-dot svelte-bn9o6"></span></button>'),Bf=I('<div class="alignment-picker svelte-bn9o6"></div>');function $i(t,n){wt(n,!0);let r=He(n,"value",3,"center"),a=He(n,"onchange",3,null);const o=["top-left","top","top-right","left","center","right","bottom-left","bottom","bottom-right"];function s(c){var l;(l=a())==null||l(c)}var i=Bf();$t(i,21,()=>o,zt,(c,l)=>{var u=qf();let f;te(()=>{f=We(u,1,"align-cell svelte-bn9o6",null,f,{active:r()===e(l)}),ut(u,"title",e(l))}),x("click",u,()=>s(e(l))),h(c,u)}),h(t,i),kt()}Tt(["click"]);var Df=I('<div class="property-scrub svelte-2j4xs3"><span class="scrub-label svelte-2j4xs3"> </span> <div class="scrub-track svelte-2j4xs3"><div class="scrub-fill svelte-2j4xs3"></div> <div class="scrub-thumb svelte-2j4xs3"></div></div> <input class="scrub-value svelte-2j4xs3" type="text"/></div>');function Ir(t,n){wt(n,!0);let r=He(n,"value",3,100),a=He(n,"min",3,0),o=He(n,"max",3,200),s=He(n,"step",3,1),i=He(n,"label",3,""),c=He(n,"onchange",3,null),l=Z(null),u=Z(!1);function f(z){return(z-a())/(o()-a())*100}function m(z){if(!e(l))return r();const re=e(l).getBoundingClientRect(),W=Math.max(0,Math.min(1,(z-re.left)/re.width));let Se=a()+W*(o()-a());return Se=Math.round(Se/s())*s(),Math.max(a(),Math.min(o(),Se))}function _(z){var W;b(u,!0),e(l).setPointerCapture(z.pointerId);const re=m(z.clientX);re!==r()&&((W=c())==null||W(re))}function p(z){var W;if(!e(u))return;const re=m(z.clientX);re!==r()&&((W=c())==null||W(re))}function g(){b(u,!1)}function $(z){z.target.select()}function w(z){var W;let re=parseFloat(z.target.value);isNaN(re)||(re=Math.max(a(),Math.min(o(),re)),(W=c())==null||W(re))}var k=Df(),L=v(k),H=v(L),P=d(L,2),E=v(P),Q=d(E,2);jn(P,z=>b(l,z),()=>e(l));var O=d(P,2);te((z,re,W)=>{et(H,i()),Ue(E,`width:${z??""}%`),Ue(Q,`left:${re??""}%`),Et(O,W)},[()=>f(r()),()=>f(r()),()=>Math.round(r())]),x("pointerdown",P,_),x("pointermove",P,p),x("pointerup",P,g),Mt("lostpointercapture",P,g),Mt("focus",O,$),x("change",O,w),h(t,k),kt()}Tt(["pointerdown","pointermove","pointerup","change"]);const Yl=bn({});function vr(t,n){Yl.update(r=>({...r,[t]:n}))}var Hf=I('<input class="val svelte-3rgj88" type="text"/>'),Gf=I('<input type="text"/>'),Wf=I('<div class="validation-row svelte-3rgj88"><span> </span></div>'),Uf=I('<input class="val svelte-3rgj88" type="text" placeholder="Author name"/>'),Yf=I('<input class="val svelte-3rgj88" type="text"/>'),Xf=I('<textarea class="val val-textarea svelte-3rgj88" rows="3" placeholder="Panel description..."></textarea>'),Vf=I("<!> <!> <!> <!> <!> <!>",1),Jf=I("<!> <!>",1),Zf=I("<!> <!>",1),Kf=I("<!> <!> <!> <!> <!> <!>",1),Qf=I('<div class="info-row svelte-3rgj88"><span class="info-label svelte-3rgj88">Panel ID</span> <span class="info-value svelte-3rgj88"> </span></div> <div class="info-row svelte-3rgj88"><span class="info-label svelte-3rgj88">File</span> <span class="info-value svelte-3rgj88"> </span></div> <div class="info-row svelte-3rgj88"><span class="info-label svelte-3rgj88">Size</span> <span class="info-value svelte-3rgj88"> </span></div> <div class="info-row svelte-3rgj88"><span class="info-label svelte-3rgj88">Created</span> <span class="info-value svelte-3rgj88"> </span></div> <div class="info-row svelte-3rgj88"><span class="info-label svelte-3rgj88">Modified</span> <span class="info-value svelte-3rgj88"> </span></div>',1),ep=I("<!> <!> <!> <!> <!>",1),tp=I('<div class="bg-layer-buttons svelte-3rgj88"><button title="Solid fill"><!> <span class="bg-layer-label svelte-3rgj88">Solid</span></button> <button title="Gradient overlay"><!> <span class="bg-layer-label svelte-3rgj88">Gradient</span></button> <button title="Image overlay"><!> <span class="bg-layer-label svelte-3rgj88">Image</span></button> <button title="Texture overlay"><!> <span class="bg-layer-label svelte-3rgj88">Texture</span></button></div>'),np=I('<div><span class="zorder-label svelte-3rgj88"> </span> <span class="zorder-status svelte-3rgj88"> </span> <button class="zorder-btn svelte-3rgj88" title="Move up (front)"><!></button> <button class="zorder-btn svelte-3rgj88" title="Move down (back)"><!></button></div>'),rp=I('<div class="zorder-hint svelte-3rgj88">Front</div> <!> <div class="zorder-hint svelte-3rgj88">Back</div>',1),ap=I('<button class="bg-swatch svelte-3rgj88" title="Pick colour"></button>'),op=I('<input class="val svelte-3rgj88" type="text"/>'),ip=I("<!> <!>",1),lp=I('<button class="bg-swatch svelte-3rgj88" title="Edit gradient"></button>'),sp=I('<input class="val svelte-3rgj88" type="text" placeholder="Unnamed"/>'),cp=I("<!> <!> <!>",1),up=I('<div class="bg-file-row svelte-3rgj88"><button class="bg-browse-btn svelte-3rgj88" title="Browse...">...</button> <input class="val svelte-3rgj88" type="text" placeholder="No image selected"/></div>'),dp=I('<select class="val svelte-3rgj88"><option>Fill</option><option>Fit</option><option>Stretch</option><option>Tile</option><option>Original</option></select>'),vp=I('<div class="bg-props-layout svelte-3rgj88"><div class="bg-props-left svelte-3rgj88"><span class="bg-props-label svelte-3rgj88">Align</span> <!></div> <div class="bg-props-right svelte-3rgj88"><!> <!> <!></div></div> <!> <!> <!> <!>',1),fp=I('<select class="val svelte-3rgj88"><option>Normal</option><option>Multiply</option><option>Screen</option><option>Overlay</option><option>Darken</option><option>Lighten</option><option>Dodge</option><option>Burn</option><option>Soft Light</option><option>Hard Light</option><option>Difference</option><option>Exclusion</option><option>Hue</option><option>Saturation</option><option>Color</option><option>Luminosity</option></select>'),pp=I('<!> <!> <!> <!> <div class="bg-effects-layout svelte-3rgj88"><div class="bg-scrub-group svelte-3rgj88"><!> <!> <!></div> <div class="bg-grayscale-col svelte-3rgj88"><span class="bg-props-label svelte-3rgj88">Gray</span> <button title="Toggle grayscale">B/W</button></div></div>',1),gp=I("<!> <!>",1),hp=I("<!> <!>",1),_p=I('<div class="bg-file-row svelte-3rgj88"><button class="bg-browse-btn svelte-3rgj88" title="Browse...">...</button> <input class="val svelte-3rgj88" type="text" placeholder="No texture selected"/></div>'),bp=I('<select class="val svelte-3rgj88"><option>Fill</option><option>Fit</option><option>Stretch</option><option>Tile</option><option>Original</option></select>'),mp=I('<div class="bg-props-layout svelte-3rgj88"><div class="bg-props-left svelte-3rgj88"><span class="bg-props-label svelte-3rgj88">Align</span> <!></div> <div class="bg-props-right svelte-3rgj88"><!> <!> <!></div></div> <!> <!> <!> <!>',1),$p=I('<select class="val svelte-3rgj88"><option>Normal</option><option>Multiply</option><option>Screen</option><option>Overlay</option><option>Darken</option><option>Lighten</option><option>Dodge</option><option>Burn</option><option>Soft Light</option><option>Hard Light</option><option>Difference</option><option>Exclusion</option><option>Hue</option><option>Saturation</option><option>Color</option><option>Luminosity</option></select>'),xp=I('<!> <!> <!> <!> <div class="bg-effects-layout svelte-3rgj88"><div class="bg-scrub-group svelte-3rgj88"><!> <!> <!></div> <div class="bg-grayscale-col svelte-3rgj88"><span class="bg-props-label svelte-3rgj88">Gray</span> <button title="Toggle grayscale">B/W</button></div></div>',1),yp=I("<!> <!>",1),wp=I("<!> <!>",1),kp=I("<!> <!> <!> <!>",1),Sp=I("<!> <!> <!>",1),Cp=I('<select class="val svelte-3rgj88"><option>Lines</option><option>Dots</option><option>Crosses</option><option>Isometric</option></select>'),Mp=I("<!> <!> <!> <!> <!> <!>",1),Tp=I("<!> <!>",1),Pp=I("<!> <!> <!>",1),Ip=I('<div class="placeholder svelte-3rgj88">No export settings configured</div>'),Ep=I('<div class="placeholder svelte-3rgj88"> </div>');function xi(t,n){wt(n,!0);const r=()=>Nt(Gt,"$panels",s),a=()=>Nt(Jt,"$activePanelId",s),o=()=>Nt(Yl,"$sectionCollapse",s),[s,i]=cr();let c=He(n,"tabId",3,""),l=S(()=>r().find(M=>M.id===a())??null),u=S(()=>o()["bg-image"]??!0),f=S(()=>o()["bg-texture"]??!0),m=Z(null),_=Z(null);eu(M=>{b(m,M,!0)}),Xt(()=>{var G;const M=(G=e(l))==null?void 0:G.filePath;M&&M!==e(_)&&(b(_,M,!0),Qc(M)),M||(b(m,null),b(_,null))});function p(M){return M==null?"—":M<1024?`${M} B`:M<1024*1024?`${(M/1024).toFixed(1)} KB`:`${(M/(1024*1024)).toFixed(2)} MB`}function g(M){if(!M)return"—";const G=new Date(M);return G.toLocaleDateString()+" "+G.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}function $(M,G){Ul({type:"panel",prop:M},G)}const w=new Set(["bgColour","gridColour","name","scriptId","author","version","description","bgMode","bgImage","bgImageFit","bgImageAlign","bgImageBlend","bgImageTint","bgTexture","bgTextureFit","bgTextureAlign","bgTextureBlend","bgTextureTint","bgGradientName"]);function k(M,G){if(!e(l))return;let ce=G.target.value;if(!w.has(M)){const ue=Number(ce);!isNaN(ue)&&ce!==""&&(ce=ue)}Me(e(l).id,{[M]:ce})}Kc(M=>{e(l)&&(M.requestId==="bgImage"?Me(e(l).id,{bgImage:M.filePath}):M.requestId==="bgTexture"&&Me(e(l).id,{bgTexture:M.filePath}))});function L(){di("bgImage")}function H(){di("bgTexture")}const P={solid:"Solid",gradient:"Gradient",image:"Image",texture:"Texture"};function E(){var M;return((M=e(l))==null?void 0:M.bgLayerOrder)??["solid","gradient","image","texture"]}function Q(M,G){if(!e(l))return;const ce=[...E()],ue=ce.indexOf(M),he=ue+G;he<0||he>=ce.length||([ce[ue],ce[he]]=[ce[he],ce[ue]],Me(e(l).id,{bgLayerOrder:ce}))}function O(M){return e(l)?M==="solid"?e(l).bgSolid!==!1:M==="gradient"?e(l).bgGradientEnabled===!0:M==="image"?e(l).bgImageEnabled===!0:M==="texture"?e(l).bgTextureEnabled===!0:!1:!1}function z(M){if(!e(l))return;const G={[M]:!e(l)[M]};M==="resizable"&&!e(l).resizable&&(e(l).minWidth===0&&(G.minWidth=e(l).width),e(l).minHeight===0&&(G.minHeight=e(l).height),e(l).maxWidth===0&&(G.maxWidth=e(l).width),e(l).maxHeight===0&&(G.maxHeight=e(l).height)),Me(e(l).id,G)}let re=Z(!1),W=Z(""),Se=Z("green"),Pe=Z("");function Ke(M){if(!M)return{level:"red",msg:"ID cannot be empty"};if(!/^[a-zA-Z_]/.test(M))return{level:"red",msg:"Must start with a letter or underscore"};if(!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(M))return{level:"red",msg:"Only letters, numbers and underscores allowed"};const G=r().find(ce=>ce.id!==e(l).id&&ce.scriptId===M);return G?{level:"red",msg:`ID "${M}" is already used by "${G.name}"`}:/^[A-Z]/.test(M)?{level:"yellow",msg:"Convention: start with lowercase (camelCase or snake_case)"}:{level:"green",msg:"Valid identifier"}}function Ge(M){const G=Ke(M);b(Se,G.level,!0),b(Pe,G.msg,!0)}function Ye(M){b(re,!0),b(W,e(l).scriptId??"",!0),Ge(e(W)),M.target.select()}function B(M){b(W,M.target.value,!0),Ge(e(W))}function y(M){M.key==="Enter"?M.target.blur():M.key==="Escape"&&(b(W,e(l).scriptId??"",!0),b(re,!1),M.target.blur())}function N(){e(Se)!=="red"&&e(W)&&e(W)!==e(l).scriptId&&Me(e(l).id,{scriptId:e(W)}),b(re,!1),b(Pe,"")}var ne=pe(),ye=U(ne);{var Ee=M=>{var G=pe(),ce=U(G);{var ue=we=>{var Ze=ep(),ct=U(Ze);Lt(ct,{title:"Identity",children:(j,T)=>{var D=Vf(),C=U(D);Ve(C,{label:"Name",span:2,hint:"Display name of the panel",children:(fe,me)=>{var $e=Hf();te(()=>Et($e,e(l).name)),x("change",$e,Be=>k("name",Be)),h(fe,$e)},$$slots:{default:!0}});var q=d(C,2);Ve(q,{label:"Id",span:2,hint:"Unique script identifier. Use camelCase or snake_case.",children:(fe,me)=>{var $e=Gf();let Be;te(()=>{Be=We($e,1,"val svelte-3rgj88",null,Be,{"val-error":e(re)&&e(Se)==="red","val-warn":e(re)&&e(Se)==="yellow","val-ok":e(re)&&e(Se)==="green"}),Et($e,e(re)?e(W):e(l).scriptId??"")}),Mt("focus",$e,Ye),x("input",$e,B),x("keydown",$e,y),Mt("blur",$e,N),h(fe,$e)},$$slots:{default:!0}});var V=d(q,2);{var ae=fe=>{var me=Wf(),$e=v(me);let Be;var J=v($e);te(()=>{Be=We($e,1,"validation-msg svelte-3rgj88",null,Be,{"msg-red":e(Se)==="red","msg-yellow":e(Se)==="yellow","msg-green":e(Se)==="green"}),et(J,e(Pe))}),h(fe,me)};je(V,fe=>{e(re)&&e(Pe)&&fe(ae)})}var X=d(V,2);Ve(X,{label:"Author",span:2,hint:"Author of this panel",children:(fe,me)=>{var $e=Uf();te(()=>Et($e,e(l).author??"")),x("change",$e,Be=>k("author",Be)),h(fe,$e)},$$slots:{default:!0}});var de=d(X,2);Ve(de,{label:"Version",span:2,hint:"Version string, e.g. 1.0.0",children:(fe,me)=>{var $e=Yf();te(()=>Et($e,e(l).version??"1.0.0")),x("change",$e,Be=>k("version",Be)),h(fe,$e)},$$slots:{default:!0}});var ve=d(de,2);Ve(ve,{label:"Description",span:4,hint:"Optional description or notes about this panel",children:(fe,me)=>{var $e=Xf();te(()=>Et($e,e(l).description??"")),x("change",$e,Be=>k("description",Be)),h(fe,$e)},$$slots:{default:!0}}),h(j,D)},$$slots:{default:!0}});var Ce=d(ct,2);Lt(Ce,{title:"State",children:(j,T)=>{var D=Jf(),C=U(D);Ve(C,{label:"Enabled",span:2,hint:"Enable or disable all interaction on this panel at runtime",children:(V,ae)=>{Mn(V,{get value(){return e(l).enabled},onchange:()=>z("enabled")})},$$slots:{default:!0}});var q=d(C,2);Ve(q,{label:"Locked",span:2,hint:"Lock panel to prevent editing in the designer",children:(V,ae)=>{Mn(V,{get value(){return e(l).locked},onchange:()=>z("locked")})},$$slots:{default:!0}}),h(j,D)},$$slots:{default:!0}});var Fe=d(Ce,2);Lt(Fe,{title:"Size",children:(j,T)=>{var D=Zf(),C=U(D);Ve(C,{label:"Width",span:2,hint:"Panel width in pixels",children:(V,ae)=>{Ct(V,{get value(){return e(l).width},step:1,min:1,onchange:X=>Me(e(l).id,{width:X})})},$$slots:{default:!0}});var q=d(C,2);Ve(q,{label:"Height",span:2,hint:"Panel height in pixels",children:(V,ae)=>{Ct(V,{get value(){return e(l).height},step:1,min:1,onchange:X=>Me(e(l).id,{height:X})})},$$slots:{default:!0}}),h(j,D)},$$slots:{default:!0}});var A=d(Fe,2);{let j=S(()=>o()["core-constraints"]??!0);Lt(A,{title:"Constraints",get collapsed(){return e(j)},ontoggle:T=>vr("core-constraints",T),children:(T,D)=>{var C=Kf(),q=U(C);Ve(q,{label:"Lock Ratio",span:2,hint:"Keep width/height ratio when resizing",children:(fe,me)=>{Mn(fe,{get value(){return e(l).lockAspectRatio},onchange:()=>z("lockAspectRatio")})},$$slots:{default:!0}});var V=d(q,2);Ve(V,{label:"Resizable",span:2,hint:"Allow end-user to resize at runtime. When Off, min/max are set to current size.",children:(fe,me)=>{Mn(fe,{get value(){return e(l).resizable},onchange:()=>z("resizable")})},$$slots:{default:!0}});var ae=d(V,2);{let fe=S(()=>!e(l).resizable);Ve(ae,{label:"Min W",span:2,hint:"Minimum width when resizable",get disabled(){return e(fe)},children:(me,$e)=>{{let Be=S(()=>e(l).resizable?e(l).minWidth:e(l).width);Ct(me,{get value(){return e(Be)},step:1,min:0,onchange:J=>Me(e(l).id,{minWidth:J})})}},$$slots:{default:!0}})}var X=d(ae,2);{let fe=S(()=>!e(l).resizable);Ve(X,{label:"Min H",span:2,hint:"Minimum height when resizable",get disabled(){return e(fe)},children:(me,$e)=>{{let Be=S(()=>e(l).resizable?e(l).minHeight:e(l).height);Ct(me,{get value(){return e(Be)},step:1,min:0,onchange:J=>Me(e(l).id,{minHeight:J})})}},$$slots:{default:!0}})}var de=d(X,2);{let fe=S(()=>!e(l).resizable);Ve(de,{label:"Max W",span:2,hint:"Maximum width when resizable. 0 = no limit.",get disabled(){return e(fe)},children:(me,$e)=>{{let Be=S(()=>e(l).resizable?e(l).maxWidth:e(l).width);Ct(me,{get value(){return e(Be)},step:1,min:0,onchange:J=>Me(e(l).id,{maxWidth:J})})}},$$slots:{default:!0}})}var ve=d(de,2);{let fe=S(()=>!e(l).resizable);Ve(ve,{label:"Max H",span:2,hint:"Maximum height when resizable. 0 = no limit.",get disabled(){return e(fe)},children:(me,$e)=>{{let Be=S(()=>e(l).resizable?e(l).maxHeight:e(l).height);Ct(me,{get value(){return e(Be)},step:1,min:0,onchange:J=>Me(e(l).id,{maxHeight:J})})}},$$slots:{default:!0}})}h(T,C)},$$slots:{default:!0}})}var se=d(A,2);{let j=S(()=>o()["core-info"]??!0);Lt(se,{title:"Info",get collapsed(){return e(j)},ontoggle:T=>vr("core-info",T),children:(T,D)=>{var C=Qf(),q=U(C),V=d(v(q),2),ae=v(V),X=d(q,2),de=d(v(X),2),ve=v(de),fe=d(X,2),me=d(v(fe),2),$e=v(me),Be=d(fe,2),J=d(v(Be),2),ke=v(J),qe=d(Be,2),xe=d(v(qe),2),ge=v(xe);te((K,Oe,lt)=>{et(ae,e(l).id),ut(de,"title",e(l).filePath??""),et(ve,e(l).filePath??"Not saved"),et($e,K),et(ke,Oe),et(ge,lt)},[()=>e(m)?p(e(m).size):"—",()=>e(m)?g(e(m).created):"—",()=>e(m)?g(e(m).modified):"—"]),h(T,C)},$$slots:{default:!0}})}h(we,Ze)},he=we=>{var Ze=Sp(),ct=U(Ze);Lt(ct,{title:"Background",children:(A,se)=>{var j=tp(),T=v(j);let D;var C=v(T);nd(C,{size:14,strokeWidth:1.5});var q=d(T,2);let V;var ae=v(q);Eu(ae,{size:14,strokeWidth:1.5});var X=d(q,2);let de;var ve=v(X);Fl(ve,{size:14,strokeWidth:1.5});var fe=d(X,2);let me;var $e=v(fe);Fu($e,{size:14,strokeWidth:1.5}),te(()=>{D=We(T,1,"bg-layer-btn svelte-3rgj88",null,D,{active:e(l).bgSolid!==!1}),V=We(q,1,"bg-layer-btn svelte-3rgj88",null,V,{active:e(l).bgGradientEnabled===!0}),de=We(X,1,"bg-layer-btn svelte-3rgj88",null,de,{active:e(l).bgImageEnabled===!0}),me=We(fe,1,"bg-layer-btn svelte-3rgj88",null,me,{active:e(l).bgTextureEnabled===!0})}),x("click",T,()=>Me(e(l).id,{bgSolid:e(l).bgSolid===!1})),x("click",q,()=>Me(e(l).id,{bgGradientEnabled:!e(l).bgGradientEnabled})),x("click",X,()=>Me(e(l).id,{bgImageEnabled:!e(l).bgImageEnabled})),x("click",fe,()=>Me(e(l).id,{bgTextureEnabled:!e(l).bgTextureEnabled})),h(A,j)},$$slots:{default:!0}});var Ce=d(ct,2);{let A=S(()=>o()["bg-zorder"]??!0);Lt(Ce,{title:"Z-Order",get collapsed(){return e(A)},ontoggle:se=>vr("bg-zorder",se),children:(se,j)=>{var T=rp(),D=d(U(T),2);$t(D,17,()=>[...E()].reverse(),zt,(C,q,V)=>{const ae=S(()=>E().length-1-V);var X=np();let de;var ve=v(X),fe=v(ve),me=d(ve,2),$e=v(me),Be=d(me,2),J=v(Be);ju(J,{size:12,strokeWidth:1.5});var ke=d(Be,2),qe=v(ke);Go(qe,{size:12,strokeWidth:1.5}),te((xe,ge,K)=>{de=We(X,1,"zorder-row svelte-3rgj88",null,de,xe),et(fe,P[e(q)]),et($e,ge),Be.disabled=K,ke.disabled=e(ae)===0},[()=>({enabled:O(e(q))}),()=>O(e(q))?"on":"off",()=>e(ae)===E().length-1]),x("click",Be,()=>Q(e(q),1)),x("click",ke,()=>Q(e(q),-1)),h(C,X)}),h(se,T)},$$slots:{default:!0}})}var Fe=d(Ce,2);$t(Fe,16,()=>[...E()].reverse(),A=>A,(A,se)=>{var j=kp(),T=U(j);{var D=ve=>{Lt(ve,{title:"Solid",children:(fe,me)=>{var $e=ip(),Be=U($e);Ve(Be,{label:"",span:2,hint:"Background fill colour — click swatch to open colour picker",children:(ke,qe)=>{var xe=ap();te(ge=>Ue(xe,`background:#${ge??""}`),[()=>String(e(l).bgColour??"333333").slice(-6)]),x("click",xe,()=>$("bgColour",e(l).bgColour)),x("contextmenu",xe,ge=>{ge.preventDefault()}),h(ke,xe)},$$slots:{default:!0}});var J=d(Be,2);Ve(J,{label:"",span:2,hint:"Hex colour value — type to change",children:(ke,qe)=>{var xe=op();te(ge=>Et(xe,ge),[()=>String(e(l).bgColour??"333333")]),Mt("focus",xe,ge=>ge.target.select()),x("change",xe,ge=>Me(e(l).id,{bgColour:ge.target.value})),h(ke,xe)},$$slots:{default:!0}}),h(fe,$e)},$$slots:{default:!0}})};je(T,ve=>{se==="solid"&&e(l).bgSolid!==!1&&ve(D)})}var C=d(T,2);{var q=ve=>{Lt(ve,{title:"Gradient",children:(fe,me)=>{var $e=cp(),Be=U($e);Ve(Be,{label:"",span:2,hint:"Gradient preview — click to edit",children:(qe,xe)=>{var ge=lp();te(K=>Ue(ge,`background:${K??""}`),[()=>Ur(e(l).bgGradient)]),x("click",ge,()=>yo.set({tab:"gradient"})),h(qe,ge)},$$slots:{default:!0}});var J=d(Be,2);Ve(J,{label:"",span:2,hint:"Gradient name",children:(qe,xe)=>{var ge=sp();te(()=>Et(ge,e(l).bgGradientName??"")),Mt("focus",ge,K=>K.target.select()),x("change",ge,K=>Me(e(l).id,{bgGradientName:K.target.value})),h(qe,ge)},$$slots:{default:!0}});var ke=d(J,2);Ve(ke,{label:"Opacity",span:4,hint:"Gradient layer opacity (0–100%)",children:(qe,xe)=>{{let ge=S(()=>e(l).bgGradientOpacity??100);Ct(qe,{get value(){return e(ge)},step:1,min:0,max:100,onchange:K=>Me(e(l).id,{bgGradientOpacity:K})})}},$$slots:{default:!0}}),h(fe,$e)},$$slots:{default:!0}})};je(C,ve=>{se==="gradient"&&e(l).bgGradientEnabled===!0&&ve(q)})}var V=d(C,2);{var ae=ve=>{var fe=hp(),me=U(fe);Lt(me,{title:"Image",get collapsed(){return e(u)},ontoggle:J=>vr("bg-image",J),children:(J,ke)=>{var qe=up(),xe=v(qe),ge=d(xe,2);te(()=>Et(ge,e(l).bgImage??"")),x("click",xe,L),Mt("focus",ge,K=>K.target.select()),x("change",ge,K=>Me(e(l).id,{bgImage:K.target.value})),h(J,qe)},$$slots:{default:!0}});var $e=d(me,2);{var Be=J=>{var ke=gp(),qe=U(ke);Lt(qe,{title:"Geometry",children:(ge,K)=>{var Oe=vp(),lt=U(Oe),it=v(lt),St=d(v(it),2);{let le=S(()=>e(l).bgImageAlign??"center");$i(St,{get value(){return e(le)},onchange:Ae=>Me(e(l).id,{bgImageAlign:Ae})})}var xt=d(it,2),Pt=v(xt);Ve(Pt,{label:"Fit",span:1,hint:"How the image fills the panel area",children:(le,Ae)=>{var _e=dp(),De=v(_e);De.value=De.__value="fill";var Y=d(De);Y.value=Y.__value="fit";var ee=d(Y);ee.value=ee.__value="stretch";var ie=d(ee);ie.value=ie.__value="tile";var Re=d(ie);Re.value=Re.__value="original";var Le;Gn(_e),te(()=>{Le!==(Le=e(l).bgImageFit??"fill")&&(_e.value=(_e.__value=e(l).bgImageFit??"fill")??"",wn(_e,e(l).bgImageFit??"fill"))}),x("change",_e,nt=>Me(e(l).id,{bgImageFit:nt.target.value})),h(le,_e)},$$slots:{default:!0}});var dt=d(Pt,2);Ve(dt,{label:"Offset X",span:1,hint:"Horizontal offset from anchor in pixels",children:(le,Ae)=>{{let _e=S(()=>e(l).bgImageOffsetX??0);Ct(le,{get value(){return e(_e)},step:1,onchange:De=>Me(e(l).id,{bgImageOffsetX:De})})}},$$slots:{default:!0}});var vt=d(dt,2);Ve(vt,{label:"Offset Y",span:1,hint:"Vertical offset from anchor in pixels",children:(le,Ae)=>{{let _e=S(()=>e(l).bgImageOffsetY??0);Ct(le,{get value(){return e(_e)},step:1,onchange:De=>Me(e(l).id,{bgImageOffsetY:De})})}},$$slots:{default:!0}});var ft=d(lt,2);Ve(ft,{label:"Flip H",span:1,hint:"Flip image horizontally",children:(le,Ae)=>{{let _e=S(()=>e(l).bgImageFlipH??!1);Mn(le,{get value(){return e(_e)},onchange:()=>Me(e(l).id,{bgImageFlipH:!e(l).bgImageFlipH})})}},$$slots:{default:!0}});var pt=d(ft,2);Ve(pt,{label:"Flip V",span:1,hint:"Flip image vertically",children:(le,Ae)=>{{let _e=S(()=>e(l).bgImageFlipV??!1);Mn(le,{get value(){return e(_e)},onchange:()=>Me(e(l).id,{bgImageFlipV:!e(l).bgImageFlipV})})}},$$slots:{default:!0}});var mt=d(pt,2);Ve(mt,{label:"Angle",span:2,hint:"Rotate the image in degrees",children:(le,Ae)=>{{let _e=S(()=>e(l).bgImageRotation??0);Ct(le,{get value(){return e(_e)},step:1,min:-360,max:360,onchange:De=>Me(e(l).id,{bgImageRotation:De})})}},$$slots:{default:!0}});var ot=d(mt,2);{var rt=le=>{Ve(le,{label:"Scale",span:4,hint:"Tile size multiplier",children:(Ae,_e)=>{{let De=S(()=>e(l).bgImageTileScale??1);Ct(Ae,{get value(){return e(De)},step:.1,min:.1,onchange:Y=>Me(e(l).id,{bgImageTileScale:Y})})}},$$slots:{default:!0}})};je(ot,le=>{(e(l).bgImageFit??"fill")==="tile"&&le(rt)})}h(ge,Oe)},$$slots:{default:!0}});var xe=d(qe,2);Lt(xe,{title:"Color Effects",children:(ge,K)=>{var Oe=pp(),lt=U(Oe);Ve(lt,{label:"Blend",span:1,hint:"Blend mode for compositing",children:(le,Ae)=>{var _e=fp(),De=v(_e);De.value=De.__value="normal";var Y=d(De);Y.value=Y.__value="multiply";var ee=d(Y);ee.value=ee.__value="screen";var ie=d(ee);ie.value=ie.__value="overlay";var Re=d(ie);Re.value=Re.__value="darken";var Le=d(Re);Le.value=Le.__value="lighten";var nt=d(Le);nt.value=nt.__value="color-dodge";var yt=d(nt);yt.value=yt.__value="color-burn";var R=d(yt);R.value=R.__value="soft-light";var oe=d(R);oe.value=oe.__value="hard-light";var Xe=d(oe);Xe.value=Xe.__value="difference";var at=d(Xe);at.value=at.__value="exclusion";var st=d(at);st.value=st.__value="hue";var It=d(st);It.value=It.__value="saturation";var Zt=d(It);Zt.value=Zt.__value="color";var Qt=d(Zt);Qt.value=Qt.__value="luminosity";var ur;Gn(_e),te(()=>{ur!==(ur=e(l).bgImageBlend??"normal")&&(_e.value=(_e.__value=e(l).bgImageBlend??"normal")??"",wn(_e,e(l).bgImageBlend??"normal"))}),x("change",_e,Kt=>Me(e(l).id,{bgImageBlend:Kt.target.value})),h(le,_e)},$$slots:{default:!0}});var it=d(lt,2);Ve(it,{label:"Opacity",span:1,hint:"Image layer opacity (0–100%)",children:(le,Ae)=>{{let _e=S(()=>e(l).bgImageOpacity??100);Ct(le,{get value(){return e(_e)},step:1,min:0,max:100,onchange:De=>Me(e(l).id,{bgImageOpacity:De})})}},$$slots:{default:!0}});var St=d(it,2);Ve(St,{label:"Blur",span:1,hint:"Blur amount in pixels",children:(le,Ae)=>{{let _e=S(()=>e(l).bgImageBlur??0);Ct(le,{get value(){return e(_e)},step:1,min:0,onchange:De=>Me(e(l).id,{bgImageBlur:De})})}},$$slots:{default:!0}});var xt=d(St,2);Ve(xt,{label:"Tint",span:1,hint:"Colour tint applied over the image",children:(le,Ae)=>{{let _e=S(()=>String(e(l).bgImageTint??"FFFFFF"));Qa(le,{get value(){return e(_e)},onchange:De=>Me(e(l).id,{bgImageTint:De}),onswatchclick:()=>$("bgImageTint",e(l).bgImageTint??"FFFFFF")})}},$$slots:{default:!0}});var Pt=d(xt,2),dt=v(Pt),vt=v(dt);{let le=S(()=>e(l).bgImageSaturation??100);Ir(vt,{label:"Sat",get value(){return e(le)},min:0,max:200,onchange:Ae=>Me(e(l).id,{bgImageSaturation:Ae})})}var ft=d(vt,2);{let le=S(()=>e(l).bgImageBrightness??100);Ir(ft,{label:"Bri",get value(){return e(le)},min:0,max:200,onchange:Ae=>Me(e(l).id,{bgImageBrightness:Ae})})}var pt=d(ft,2);{let le=S(()=>e(l).bgImageContrast??100);Ir(pt,{label:"Con",get value(){return e(le)},min:0,max:200,onchange:Ae=>Me(e(l).id,{bgImageContrast:Ae})})}var mt=d(dt,2),ot=d(v(mt),2);let rt;te(()=>rt=We(ot,1,"bg-grayscale-btn svelte-3rgj88",null,rt,{active:e(l).bgImageGrayscale??!1})),x("click",ot,()=>Me(e(l).id,{bgImageGrayscale:!e(l).bgImageGrayscale})),h(ge,Oe)},$$slots:{default:!0}}),h(J,ke)};je($e,J=>{e(u)||J(Be)})}h(ve,fe)};je(V,ve=>{se==="image"&&e(l).bgImageEnabled===!0&&ve(ae)})}var X=d(V,2);{var de=ve=>{var fe=wp(),me=U(fe);Lt(me,{title:"Texture",get collapsed(){return e(f)},ontoggle:J=>vr("bg-texture",J),children:(J,ke)=>{var qe=_p(),xe=v(qe),ge=d(xe,2);te(()=>Et(ge,e(l).bgTexture??"")),x("click",xe,H),Mt("focus",ge,K=>K.target.select()),x("change",ge,K=>Me(e(l).id,{bgTexture:K.target.value})),h(J,qe)},$$slots:{default:!0}});var $e=d(me,2);{var Be=J=>{var ke=yp(),qe=U(ke);Lt(qe,{title:"Geometry",children:(ge,K)=>{var Oe=mp(),lt=U(Oe),it=v(lt),St=d(v(it),2);{let le=S(()=>e(l).bgTextureAlign??"center");$i(St,{get value(){return e(le)},onchange:Ae=>Me(e(l).id,{bgTextureAlign:Ae})})}var xt=d(it,2),Pt=v(xt);Ve(Pt,{label:"Fit",span:1,hint:"How the texture fills the panel area",children:(le,Ae)=>{var _e=bp(),De=v(_e);De.value=De.__value="fill";var Y=d(De);Y.value=Y.__value="fit";var ee=d(Y);ee.value=ee.__value="stretch";var ie=d(ee);ie.value=ie.__value="tile";var Re=d(ie);Re.value=Re.__value="original";var Le;Gn(_e),te(()=>{Le!==(Le=e(l).bgTextureFit??"tile")&&(_e.value=(_e.__value=e(l).bgTextureFit??"tile")??"",wn(_e,e(l).bgTextureFit??"tile"))}),x("change",_e,nt=>Me(e(l).id,{bgTextureFit:nt.target.value})),h(le,_e)},$$slots:{default:!0}});var dt=d(Pt,2);Ve(dt,{label:"Offset X",span:1,hint:"Horizontal offset from anchor in pixels",children:(le,Ae)=>{{let _e=S(()=>e(l).bgTextureOffsetX??0);Ct(le,{get value(){return e(_e)},step:1,onchange:De=>Me(e(l).id,{bgTextureOffsetX:De})})}},$$slots:{default:!0}});var vt=d(dt,2);Ve(vt,{label:"Offset Y",span:1,hint:"Vertical offset from anchor in pixels",children:(le,Ae)=>{{let _e=S(()=>e(l).bgTextureOffsetY??0);Ct(le,{get value(){return e(_e)},step:1,onchange:De=>Me(e(l).id,{bgTextureOffsetY:De})})}},$$slots:{default:!0}});var ft=d(lt,2);Ve(ft,{label:"Flip H",span:1,hint:"Flip texture horizontally",children:(le,Ae)=>{{let _e=S(()=>e(l).bgTextureFlipH??!1);Mn(le,{get value(){return e(_e)},onchange:()=>Me(e(l).id,{bgTextureFlipH:!e(l).bgTextureFlipH})})}},$$slots:{default:!0}});var pt=d(ft,2);Ve(pt,{label:"Flip V",span:1,hint:"Flip texture vertically",children:(le,Ae)=>{{let _e=S(()=>e(l).bgTextureFlipV??!1);Mn(le,{get value(){return e(_e)},onchange:()=>Me(e(l).id,{bgTextureFlipV:!e(l).bgTextureFlipV})})}},$$slots:{default:!0}});var mt=d(pt,2);Ve(mt,{label:"Angle",span:2,hint:"Rotate the texture in degrees",children:(le,Ae)=>{{let _e=S(()=>e(l).bgTextureRotation??0);Ct(le,{get value(){return e(_e)},step:1,min:-360,max:360,onchange:De=>Me(e(l).id,{bgTextureRotation:De})})}},$$slots:{default:!0}});var ot=d(mt,2);{var rt=le=>{Ve(le,{label:"Scale",span:4,hint:"Tile size multiplier",children:(Ae,_e)=>{{let De=S(()=>e(l).bgTextureTileScale??1);Ct(Ae,{get value(){return e(De)},step:.1,min:.1,onchange:Y=>Me(e(l).id,{bgTextureTileScale:Y})})}},$$slots:{default:!0}})};je(ot,le=>{(e(l).bgTextureFit??"tile")==="tile"&&le(rt)})}h(ge,Oe)},$$slots:{default:!0}});var xe=d(qe,2);Lt(xe,{title:"Color Effects",children:(ge,K)=>{var Oe=xp(),lt=U(Oe);Ve(lt,{label:"Blend",span:1,hint:"Blend mode for compositing",children:(le,Ae)=>{var _e=$p(),De=v(_e);De.value=De.__value="normal";var Y=d(De);Y.value=Y.__value="multiply";var ee=d(Y);ee.value=ee.__value="screen";var ie=d(ee);ie.value=ie.__value="overlay";var Re=d(ie);Re.value=Re.__value="darken";var Le=d(Re);Le.value=Le.__value="lighten";var nt=d(Le);nt.value=nt.__value="color-dodge";var yt=d(nt);yt.value=yt.__value="color-burn";var R=d(yt);R.value=R.__value="soft-light";var oe=d(R);oe.value=oe.__value="hard-light";var Xe=d(oe);Xe.value=Xe.__value="difference";var at=d(Xe);at.value=at.__value="exclusion";var st=d(at);st.value=st.__value="hue";var It=d(st);It.value=It.__value="saturation";var Zt=d(It);Zt.value=Zt.__value="color";var Qt=d(Zt);Qt.value=Qt.__value="luminosity";var ur;Gn(_e),te(()=>{ur!==(ur=e(l).bgTextureBlend??"normal")&&(_e.value=(_e.__value=e(l).bgTextureBlend??"normal")??"",wn(_e,e(l).bgTextureBlend??"normal"))}),x("change",_e,Kt=>Me(e(l).id,{bgTextureBlend:Kt.target.value})),h(le,_e)},$$slots:{default:!0}});var it=d(lt,2);Ve(it,{label:"Opacity",span:1,hint:"Texture layer opacity (0–100%)",children:(le,Ae)=>{{let _e=S(()=>e(l).bgTextureOpacity??100);Ct(le,{get value(){return e(_e)},step:1,min:0,max:100,onchange:De=>Me(e(l).id,{bgTextureOpacity:De})})}},$$slots:{default:!0}});var St=d(it,2);Ve(St,{label:"Blur",span:1,hint:"Blur amount in pixels",children:(le,Ae)=>{{let _e=S(()=>e(l).bgTextureBlur??0);Ct(le,{get value(){return e(_e)},step:1,min:0,onchange:De=>Me(e(l).id,{bgTextureBlur:De})})}},$$slots:{default:!0}});var xt=d(St,2);Ve(xt,{label:"Tint",span:1,hint:"Colour tint applied over the texture",children:(le,Ae)=>{{let _e=S(()=>String(e(l).bgTextureTint??"FFFFFF"));Qa(le,{get value(){return e(_e)},onchange:De=>Me(e(l).id,{bgTextureTint:De}),onswatchclick:()=>$("bgTextureTint",e(l).bgTextureTint??"FFFFFF")})}},$$slots:{default:!0}});var Pt=d(xt,2),dt=v(Pt),vt=v(dt);{let le=S(()=>e(l).bgTextureSaturation??100);Ir(vt,{label:"Sat",get value(){return e(le)},min:0,max:200,onchange:Ae=>Me(e(l).id,{bgTextureSaturation:Ae})})}var ft=d(vt,2);{let le=S(()=>e(l).bgTextureBrightness??100);Ir(ft,{label:"Bri",get value(){return e(le)},min:0,max:200,onchange:Ae=>Me(e(l).id,{bgTextureBrightness:Ae})})}var pt=d(ft,2);{let le=S(()=>e(l).bgTextureContrast??100);Ir(pt,{label:"Con",get value(){return e(le)},min:0,max:200,onchange:Ae=>Me(e(l).id,{bgTextureContrast:Ae})})}var mt=d(dt,2),ot=d(v(mt),2);let rt;te(()=>rt=We(ot,1,"bg-grayscale-btn svelte-3rgj88",null,rt,{active:e(l).bgTextureGrayscale??!1})),x("click",ot,()=>Me(e(l).id,{bgTextureGrayscale:!e(l).bgTextureGrayscale})),h(ge,Oe)},$$slots:{default:!0}}),h(J,ke)};je($e,J=>{e(f)||J(Be)})}h(ve,fe)};je(X,ve=>{se==="texture"&&e(l).bgTextureEnabled===!0&&ve(de)})}h(A,j)}),h(we,Ze)},be=we=>{var Ze=Pp(),ct=U(Ze);Lt(ct,{title:"Grid",children:(A,se)=>{var j=Mp(),T=U(j);Ve(T,{label:"Show",span:2,hint:"Show or hide the grid overlay",children:(X,de)=>{Mn(X,{get value(){return e(l).gridEnabled},onchange:()=>z("gridEnabled")})},$$slots:{default:!0}});var D=d(T,2);Ve(D,{label:"Snap",span:2,hint:"Snap components to grid when moving or resizing",children:(X,de)=>{Mn(X,{get value(){return e(l).snapToGrid},onchange:()=>z("snapToGrid")})},$$slots:{default:!0}});var C=d(D,2);Ve(C,{label:"Size",span:2,hint:"Grid cell size in pixels",children:(X,de)=>{Ct(X,{get value(){return e(l).gridSize},step:1,min:1,onchange:ve=>Me(e(l).id,{gridSize:ve})})},$$slots:{default:!0}});var q=d(C,2);Ve(q,{label:"Thickness",span:2,hint:"Grid line thickness in pixels",children:(X,de)=>{{let ve=S(()=>e(l).gridLineWidth??1);Ct(X,{get value(){return e(ve)},step:1,min:1,max:10,onchange:fe=>Me(e(l).id,{gridLineWidth:fe})})}},$$slots:{default:!0}});var V=d(q,2);Ve(V,{label:"Type",span:2,hint:"Grid line style",children:(X,de)=>{var ve=Cp(),fe=v(ve);fe.value=fe.__value="lines";var me=d(fe);me.value=me.__value="dots";var $e=d(me);$e.value=$e.__value="crosses";var Be=d($e);Be.value=Be.__value="isometric";var J;Gn(ve),te(()=>{J!==(J=e(l).gridType??"lines")&&(ve.value=(ve.__value=e(l).gridType??"lines")??"",wn(ve,e(l).gridType??"lines"))}),x("change",ve,ke=>Me(e(l).id,{gridType:ke.target.value})),h(X,ve)},$$slots:{default:!0}});var ae=d(V,2);Ve(ae,{label:"Colour",span:2,hint:"Grid line colour (AARRGGBB hex)",children:(X,de)=>{{let ve=S(()=>e(l).gridColour??"33FFFFFF");Qa(X,{get value(){return e(ve)},onchange:fe=>Me(e(l).id,{gridColour:fe}),onswatchclick:()=>$("gridColour",e(l).gridColour??"33FFFFFF")})}},$$slots:{default:!0}}),h(A,j)},$$slots:{default:!0}});var Ce=d(ct,2);{let A=S(()=>o()["grid-subdivision"]??!0);Lt(Ce,{title:"Subdivision",get collapsed(){return e(A)},ontoggle:se=>vr("grid-subdivision",se),children:(se,j)=>{Ve(se,{label:"Divisions",span:4,hint:"Number of subdivisions per grid cell (1 = none)",children:(T,D)=>{{let C=S(()=>e(l).gridSubdivision??1);Ct(T,{get value(){return e(C)},step:1,min:1,max:10,onchange:q=>Me(e(l).id,{gridSubdivision:q})})}},$$slots:{default:!0}})},$$slots:{default:!0}})}var Fe=d(Ce,2);{let A=S(()=>o()["grid-origin"]??!0);Lt(Fe,{title:"Origin",get collapsed(){return e(A)},ontoggle:se=>vr("grid-origin",se),children:(se,j)=>{var T=Tp(),D=U(T);Ve(D,{label:"Offset X",span:2,hint:"Shift grid origin horizontally in pixels",children:(q,V)=>{{let ae=S(()=>e(l).gridOriginX??0);Ct(q,{get value(){return e(ae)},step:1,onchange:X=>Me(e(l).id,{gridOriginX:X})})}},$$slots:{default:!0}});var C=d(D,2);Ve(C,{label:"Offset Y",span:2,hint:"Shift grid origin vertically in pixels",children:(q,V)=>{{let ae=S(()=>e(l).gridOriginY??0);Ct(q,{get value(){return e(ae)},step:1,onchange:X=>Me(e(l).id,{gridOriginY:X})})}},$$slots:{default:!0}}),h(se,T)},$$slots:{default:!0}})}h(we,Ze)},tt=we=>{Lt(we,{title:"Export",children:(Ze,ct)=>{var Ce=Ip();h(Ze,Ce)},$$slots:{default:!0}})},Je=we=>{var Ze=Ep(),ct=v(Ze);te(()=>et(ct,`Panel: ${c()??""}`)),h(we,Ze)};je(ce,we=>{c()==="core"?we(ue):c()==="background"?we(he,1):c()==="grid"?we(be,2):c()==="export"?we(tt,3):we(Je,-1)})}h(M,G)};je(ye,M=>{e(l)&&M(Ee)})}h(t,ne),kt(),i()}Tt(["change","input","keydown","click","contextmenu"]);var zp=I('<div class="prop-card svelte-x4mvaq"><div class="prop-row svelte-x4mvaq"><span class="lbl svelte-x4mvaq">Name</span> <input class="val svelte-x4mvaq" type="text"/></div> <div class="prop-row svelte-x4mvaq"><span class="lbl svelte-x4mvaq">Type</span> <span class="val readonly svelte-x4mvaq"> </span></div> <div class="prop-row svelte-x4mvaq"><span class="lbl svelte-x4mvaq">Visible</span> <button> </button></div> <div class="prop-row svelte-x4mvaq"><span class="lbl svelte-x4mvaq">Enabled</span> <button> </button></div> <div class="prop-row svelte-x4mvaq"><span class="lbl svelte-x4mvaq">Locked</span> <button> </button></div> <div class="prop-row svelte-x4mvaq"><span class="lbl svelte-x4mvaq">Z-Index</span> <!></div> <div class="prop-row svelte-x4mvaq"><span class="lbl svelte-x4mvaq">Layer</span> <input class="val svelte-x4mvaq" type="text"/></div></div>');function eo(t,n){wt(n,!0);let r=He(n,"control",3,null),a=S(()=>Nn(r(),"Core"));function o(m,_){var p;(p=e(a))!=null&&p.id&&en(e(a).id,`Core.${m}`,_)}function s(m,_){const p=_.target;let g=p.type==="number"?Number(p.value):p.value;o(m,g)}function i(m){var _;o(m,!((_=e(a))!=null&&_[m]))}function c(m){m.target.select()}var l=pe(),u=U(l);{var f=m=>{var _=zp(),p=v(_),g=d(v(p),2),$=d(p,2),w=d(v($),2),k=v(w),L=d($,2),H=d(v(L),2);let P;var E=v(H),Q=d(L,2),O=d(v(Q),2);let z;var re=v(O),W=d(Q,2),Se=d(v(W),2);let Pe;var Ke=v(Se),Ge=d(W,2),Ye=d(v(Ge),2);Ct(Ye,{get value(){return e(a).zIndex},step:1,min:0,onchange:N=>o("zIndex",N)});var B=d(Ge,2),y=d(v(B),2);te(()=>{Et(g,e(a).name),et(k,e(a).controlType),P=We(H,1,"toggle-val svelte-x4mvaq",null,P,{on:e(a).visible}),et(E,e(a).visible?"On":"Off"),z=We(O,1,"toggle-val svelte-x4mvaq",null,z,{on:e(a).enabled}),et(re,e(a).enabled?"On":"Off"),Pe=We(Se,1,"toggle-val svelte-x4mvaq",null,Pe,{on:e(a).locked}),et(Ke,e(a).locked?"On":"Off"),Et(y,e(a).layer)}),Mt("focus",g,c),x("change",g,N=>s("name",N)),x("click",H,()=>i("visible")),x("click",O,()=>i("enabled")),x("click",Se,()=>i("locked")),Mt("focus",y,c),x("change",y,N=>s("layer",N)),h(m,_)};je(u,m=>{e(a)&&m(f)})}h(t,l),kt()}Tt(["change","click"]);var Np=I('<div class="prop-card svelte-117e023"><div class="prop-row-pair svelte-117e023"><div class="prop-row half svelte-117e023"><span class="lbl svelte-117e023">X</span> <!></div> <div class="prop-row half svelte-117e023"><span class="lbl svelte-117e023">Y</span> <!></div></div> <div class="prop-row-pair svelte-117e023"><div class="prop-row half svelte-117e023"><span class="lbl svelte-117e023">W</span> <!></div> <div class="prop-row half svelte-117e023"><span class="lbl svelte-117e023">H</span> <!></div></div> <div class="prop-row-pair svelte-117e023"><div class="prop-row half svelte-117e023"><span class="lbl svelte-117e023">Opacity</span> <!></div> <div class="prop-row half svelte-117e023"><span class="lbl svelte-117e023">Rot</span> <!></div></div></div>');function to(t,n){wt(n,!0);let r=He(n,"control",3,null),a=S(()=>Nn(r(),"Core")),o=S(()=>Nn(r(),"Transform"));function s(u,f){var m;(m=e(a))!=null&&m.id&&en(e(a).id,`Transform.${u}`,f)}var i=pe(),c=U(i);{var l=u=>{var f=Np(),m=v(f),_=v(m),p=d(v(_),2);Ct(p,{get value(){return e(o).x},step:1,onchange:W=>s("x",W)});var g=d(_,2),$=d(v(g),2);Ct($,{get value(){return e(o).y},step:1,onchange:W=>s("y",W)});var w=d(m,2),k=v(w),L=d(v(k),2);Ct(L,{get value(){return e(o).width},step:1,min:10,onchange:W=>s("width",W)});var H=d(k,2),P=d(v(H),2);Ct(P,{get value(){return e(o).height},step:1,min:10,onchange:W=>s("height",W)});var E=d(w,2),Q=v(E),O=d(v(Q),2);Ct(O,{get value(){return e(o).opacity},step:.05,min:0,max:1,onchange:W=>s("opacity",W)});var z=d(Q,2),re=d(v(z),2);Ct(re,{get value(){return e(o).rotation},step:1,onchange:W=>s("rotation",W)}),h(u,f)};je(c,u=>{e(o)&&u(l)})}h(t,i),kt()}var Fp=I('<div class="prop-card svelte-1wx6vjp"><div class="prop-row svelte-1wx6vjp"><span class="lbl svelte-1wx6vjp">Mode</span> <select class="val svelte-1wx6vjp"><option>Solid</option><option>Gradient</option><option>Image</option></select></div> <div class="prop-row svelte-1wx6vjp"><span class="lbl svelte-1wx6vjp">Colour</span> <div class="color-input svelte-1wx6vjp"><button class="mini-swatch svelte-1wx6vjp" title="Pick colour"></button> <input class="val svelte-1wx6vjp" type="text"/></div></div></div>');function no(t,n){wt(n,!0);let r=He(n,"control",3,null),a=S(()=>Nn(r(),"Core")),o=S(()=>Nn(r(),"Background")),s=S(()=>{var g,$;return($=(g=e(o))==null?void 0:g._children)==null?void 0:$.Fill});function i(){var g,$;!((g=e(a))!=null&&g.id)||!(($=e(s))!=null&&$.colour)||Ul({type:"control",controlId:e(a).id,path:"Background.Fill.colour"},e(s).colour)}function c(g){var $;($=e(a))!=null&&$.id&&en(e(a).id,"Background.mode",g.target.value)}function l(g){var w;if(!((w=e(a))!=null&&w.id))return;let $=g.target.value.replace(/^#/,"").toUpperCase();$.length===6&&($="FF"+$),en(e(a).id,"Background.Fill.colour",$)}function u(g){g.target.select()}let f=S(()=>{var g;return(g=e(s))!=null&&g.colour?e(s).colour.slice(-6):"3A3A3A"});var m=pe(),_=U(m);{var p=g=>{var $=Fp(),w=v($),k=d(v(w),2),L=v(k);L.value=L.__value="solid";var H=d(L);H.value=H.__value="gradient";var P=d(H);P.value=P.__value="image";var E;Gn(k);var Q=d(w,2),O=d(v(Q),2),z=v(O),re=d(z,2);te(()=>{E!==(E=e(o).mode)&&(k.value=(k.__value=e(o).mode)??"",wn(k,e(o).mode)),Ue(z,`background:#${e(f)??""}`),Et(re,e(f))}),x("change",k,c),x("click",z,i),Mt("focus",re,u),x("change",re,l),h(g,$)};je(_,g=>{e(o)&&g(p)})}h(t,m),kt()}Tt(["change","click"]);var Ap=I("<button><!></button>"),jp=I('<div class="placeholder svelte-2rmaxa"> </div>'),Op=I('<div class="card-header svelte-2rmaxa"><span class="card-title svelte-2rmaxa"> </span></div> <div class="card-content svelte-2rmaxa"><!></div>',1),Rp=I('<div class="placeholder svelte-2rmaxa"> </div>'),Lp=I('<div class="multi-card-content svelte-2rmaxa"><!></div>'),qp=I('<div class="multi-card svelte-2rmaxa"><button class="multi-card-header svelte-2rmaxa"><!> <span class="multi-card-title svelte-2rmaxa"> </span></button> <!></div>'),Bp=I('<div class="multi-scroll svelte-2rmaxa"></div>'),Dp=I('<div class="icon-tabs svelte-2rmaxa"><!> <div class="tab-spacer svelte-2rmaxa"></div> <button><!></button></div> <div class="card-area svelte-2rmaxa"><div class="props-toolbar svelte-2rmaxa"><button class="toolbar-btn svelte-2rmaxa" disabled="" title="Undo"><!></button> <button class="toolbar-btn svelte-2rmaxa" disabled="" title="Redo"><!></button> <div class="toolbar-divider svelte-2rmaxa"></div> <button title="Save panel"><!></button> <button><!></button> <div class="toolbar-divider svelte-2rmaxa"></div> <button><!></button> <button><!></button></div> <!> <div class="info-bar svelte-2rmaxa"><div class="info-header svelte-2rmaxa">Info</div> <span class="info-text svelte-2rmaxa"> </span></div></div>',1),Hp=I('<div class="empty-panel svelte-2rmaxa"><span class="empty-text svelte-2rmaxa">No panel open</span></div>'),Gp=I('<div class="properties-panel svelte-2rmaxa"><!></div>');function Wp(t,n){wt(n,!0);const r=()=>Nt(Gt,"$panels",c),a=()=>Nt(Jt,"$activePanelId",c),o=()=>Nt(Rn,"$selectedComponentId",c),s=()=>Nt(fu,"$selectedControl",c),i=()=>Nt(Uo,"$propertyHint",c),[c,l]=cr();let u=He(n,"width",3,280),f=S(()=>r().find(B=>B.id===a())??null),m=S(o),_=S(()=>e(m)!=null?"component":"panel"),p=Z("single"),g=Z("core"),$=Z(At(new Set(["core"]))),w=Z(At({}));Xt(()=>{if(e(_)){const B="core";b(g,B),b($,new Set([B]),!0)}});const k=[{id:"core",icon:Gu,label:"Core"},{id:"background",icon:hi,label:"Background"},{id:"grid",icon:Za,label:"Grid"},{id:"export",icon:Ku,label:"Export"}],L=[{id:"core",icon:Nu,label:"Core",section:"Core"},{id:"transform",icon:jl,label:"Transform",section:"Transform"},{id:"background",icon:hi,label:"Background",section:"Background"},{id:"text",icon:Bl,label:"Text",section:"Text"},{id:"border",icon:dd,label:"Border",section:"Border"},{id:"mouse",icon:td,label:"Mouse",section:"Mouse"},{id:"grid",icon:Za,label:"Grid",section:"Grid"},{id:"icon",icon:Fl,label:"Icon",section:"Icon"},{id:"effects",icon:ud,label:"Effects",section:"Shadow"},{id:"actions",icon:wd,label:"Scripts",section:"Scripts"},{id:"links",icon:Uu,label:"Links",section:null},{id:"specific",icon:sd,label:"Type",section:null}];let H=S(()=>s()?L.filter(B=>!B.section||vu(s(),B.section)):L.filter(B=>B.id==="core"||B.id==="transform")),P=S(()=>e(_)==="panel"?k:e(H)),E=S(()=>e(p)==="single"?e(P).filter(B=>B.id===e(g)):e(P).filter(B=>e($).has(B.id)));function Q(B){return e(p)==="single"?B===e(g):e($).has(B)}function O(B,y){y.ctrlKey||y.metaKey?(z(B),e($).size>1&&b(p,"multi")):e(p)==="single"?b(g,B,!0):z(B)}function z(B){b($,new Set(e($)),!0),e($).has(B)?e($).size>1&&e($).delete(B):e($).add(B),e($).size===1&&b(g,[...e($)][0],!0)}function re(){e(p)==="single"?(b(p,"multi"),b($,new Set([e(g)]),!0)):(b(p,"single"),e($).size>0&&b(g,[...e($)][0],!0))}function W(B){return e(w)[B]===!0}function Se(B){b(w,{...e(w),[B]:!e(w)[B]},!0)}var Pe=Gp(),Ke=v(Pe);{var Ge=B=>{var y=Dp(),N=U(y),ne=v(N);$t(ne,17,()=>e(P),J=>J.id,(J,ke)=>{var qe=Ap();let xe;var ge=v(qe);mo(ge,()=>e(ke).icon,(K,Oe)=>{Oe(K,{size:20,strokeWidth:1.5})}),te(K=>{xe=We(qe,1,"tab-icon svelte-2rmaxa",null,xe,K),ut(qe,"title",e(ke).label)},[()=>({active:Q(e(ke).id)})]),x("click",qe,K=>O(e(ke).id,K)),h(J,qe)});var ye=d(ne,4);let Ee;var M=v(ye);{var G=J=>{Hu(J,{size:16,strokeWidth:1.5})},ce=J=>{vd(J,{size:16,strokeWidth:1.5})};je(M,J=>{e(p)==="single"?J(G):J(ce,-1)})}var ue=d(N,2),he=v(ue),be=v(he),tt=v(be);yd(tt,{size:18,strokeWidth:1.5});var Je=d(be,2),we=v(Je);od(we,{size:18,strokeWidth:1.5});var Ze=d(Je,4);let ct;var Ce=v(Ze);ld(Ce,{size:18,strokeWidth:1.5});var Fe=d(Ze,2);let A;var se=v(Fe);{var j=J=>{Ju(J,{size:18,strokeWidth:1.5})},T=J=>{Vu(J,{size:18,strokeWidth:1.5})};je(se,J=>{e(f).locked?J(j):J(T,-1)})}var D=d(Fe,4);let C;var q=v(D);Za(q,{size:18,strokeWidth:1.5});var V=d(D,2);let ae;var X=v(V);Zu(X,{size:18,strokeWidth:1.5});var de=d(he,2);{var ve=J=>{var ke=pe(),qe=U(ke);Sc(qe,()=>e(g),xe=>{var ge=Op(),K=U(ge),Oe=v(K),lt=v(Oe),it=d(K,2),St=v(it);{var xt=dt=>{xi(dt,{get tabId(){return e(g)}})},Pt=dt=>{var vt=pe(),ft=U(vt);{var pt=le=>{eo(le,{get control(){return s()}})},mt=le=>{to(le,{get control(){return s()}})},ot=le=>{no(le,{get control(){return s()}})},rt=le=>{var Ae=jp(),_e=v(Ae);te(De=>et(_e,`Component: ${De??""}`),[()=>{var De;return((De=e(P).find(Y=>Y.id===e(g)))==null?void 0:De.label)??""}]),h(le,Ae)};je(ft,le=>{e(g)==="core"?le(pt):e(g)==="transform"?le(mt,1):e(g)==="background"?le(ot,2):le(rt,-1)})}h(dt,vt)};je(St,dt=>{e(_)==="panel"?dt(xt):dt(Pt,-1)})}te(dt=>et(lt,dt),[()=>{var dt;return((dt=e(P).find(vt=>vt.id===e(g)))==null?void 0:dt.label)??""}]),h(xe,ge)}),h(J,ke)},fe=J=>{var ke=Bp();$t(ke,21,()=>e(E),qe=>qe.id,(qe,xe)=>{var ge=qp(),K=v(ge),Oe=v(K);{var lt=pt=>{Ou(pt,{size:16,strokeWidth:1.5})},it=S(()=>W(e(xe).id)),St=pt=>{Go(pt,{size:16,strokeWidth:1.5})};je(Oe,pt=>{e(it)?pt(lt):pt(St,-1)})}var xt=d(Oe,2),Pt=v(xt),dt=d(K,2);{var vt=pt=>{var mt=Lp(),ot=v(mt);{var rt=Ae=>{xi(Ae,{get tabId(){return e(xe).id}})},le=Ae=>{var _e=pe(),De=U(_e);{var Y=Le=>{eo(Le,{get control(){return s()}})},ee=Le=>{to(Le,{get control(){return s()}})},ie=Le=>{no(Le,{get control(){return s()}})},Re=Le=>{var nt=pe(),yt=U(nt);{var R=st=>{eo(st,{get control(){return s()}})},oe=st=>{to(st,{get control(){return s()}})},Xe=st=>{no(st,{get control(){return s()}})},at=st=>{var It=Rp(),Zt=v(It);te(()=>et(Zt,`Component: ${e(xe).label??""}`)),h(st,It)};je(yt,st=>{e(xe).id==="core"?st(R):e(xe).id==="transform"?st(oe,1):e(xe).id==="background"?st(Xe,2):st(at,-1)})}h(Le,nt)};je(De,Le=>{e(xe).id==="core"?Le(Y):e(xe).id==="transform"?Le(ee,1):e(xe).id==="background"?Le(ie,2):Le(Re,-1)})}h(Ae,_e)};je(ot,Ae=>{e(_)==="panel"?Ae(rt):Ae(le,-1)})}h(pt,mt)},ft=S(()=>!W(e(xe).id));je(dt,pt=>{e(ft)&&pt(vt)})}te(()=>et(Pt,e(xe).label)),x("click",K,()=>Se(e(xe).id)),h(qe,ge)}),h(J,ke)};je(de,J=>{e(p)==="single"?J(ve):J(fe,-1)})}var me=d(de,2),$e=d(v(me),2),Be=v($e);te(()=>{Ee=We(ye,1,"tab-icon mode-toggle svelte-2rmaxa",null,Ee,{active:e(p)==="multi"}),ut(ye,"title",e(p)==="single"?"Switch to multi view":"Switch to single view"),ct=We(Ze,1,"toolbar-btn svelte-2rmaxa",null,ct,{active:e(f).modified}),A=We(Fe,1,"toolbar-btn svelte-2rmaxa",null,A,{active:e(f).locked}),ut(Fe,"title",e(f).locked?"Unlock panel":"Lock panel"),C=We(D,1,"toolbar-btn svelte-2rmaxa",null,C,{active:e(f).gridEnabled}),ut(D,"title",e(f).gridEnabled?"Hide grid":"Show grid"),ae=We(V,1,"toolbar-btn svelte-2rmaxa",null,ae,{active:e(f).snapToGrid}),ut(V,"title",e(f).snapToGrid?"Disable snap":"Enable snap"),et(Be,i()||"Hover a property for details")}),x("click",ye,re),x("click",Ze,()=>zl()),x("click",Fe,()=>Me(e(f).id,{locked:!e(f).locked})),x("click",D,()=>Me(e(f).id,{gridEnabled:!e(f).gridEnabled})),x("click",V,()=>Me(e(f).id,{snapToGrid:!e(f).snapToGrid})),h(B,y)},Ye=B=>{var y=Hp();h(B,y)};je(Ke,B=>{e(f)?B(Ge):B(Ye,-1)})}te(()=>Ue(Pe,`width: ${u()??""}px;`)),h(t,Pe),kt(),l()}Tt(["click"]);var Up=I('<div class="status-bar svelte-1gvod6j"><span class="status-item svelte-1gvod6j">Ready</span> <span class="spacer svelte-1gvod6j"></span> <span class="status-item dim svelte-1gvod6j">No selection</span> <span class="status-item dim svelte-1gvod6j">CEditor v0.1.0</span></div>');function Yp(t){var n=Up();h(t,n)}var Xp=I('<div></div> <div class="properties-area svelte-1n46o8q"><!></div>',1),Vp=I('<div class="app svelte-1n46o8q"><div class="menubar-area svelte-1n46o8q"><!></div> <div class="icon-panel-area svelte-1n46o8q"><!></div> <div class="center-area svelte-1n46o8q"><div class="editor-canvas-area svelte-1n46o8q"><!></div> <div class="common-bar-area svelte-1n46o8q"><!></div> <div class="zoom-bar-area svelte-1n46o8q"><!></div> <div></div> <div class="display-panel-area svelte-1n46o8q"><!></div></div> <!> <div class="statusbar-area svelte-1n46o8q"><!></div></div>');function Jp(t,n){wt(n,!0),cu(),vf();let r=Z(280),a=Z(!1),o=Z(480),s=Z(!1),i=Z(!0),c=Z(!0);const l={colors:480,gradient:580};function u(B){const y=l[B];y&&b(o,y,!0)}function f(B){b(a,!0);const y=B.clientX,N=e(r);function ne(Ee){const M=y-Ee.clientX;b(r,Math.max(220,Math.min(500,N+M)),!0)}function ye(){b(a,!1),window.removeEventListener("mousemove",ne),window.removeEventListener("mouseup",ye)}window.addEventListener("mousemove",ne),window.addEventListener("mouseup",ye)}function m(B){b(s,!0);const y=B.clientY,N=e(o);function ne(Ee){const M=y-Ee.clientY;b(o,Math.max(80,Math.min(900,N+M)),!0)}function ye(){b(s,!1),window.removeEventListener("mousemove",ne),window.removeEventListener("mouseup",ye)}window.addEventListener("mousemove",ne),window.addEventListener("mouseup",ye)}var _=Vp(),p=v(_),g=v(p);wu(g,{});var $=d(p,2),w=v($);Td(w,{get showDisplayPanel(){return e(i)},get showPropertiesPanel(){return e(c)},onToggleDisplay:()=>b(i,!e(i)),onToggleProperties:()=>b(c,!e(c))});var k=d($,2),L=v(k),H=v(L);Zd(H,{});var P=d(L,2),E=v(P);Qd(E);var Q=d(P,2),O=v(Q);rv(O,{});var z=d(Q,2);let re;var W=d(z,2),Se=v(W);Ef(Se,{onTabChange:u});var Pe=d(k,2);{var Ke=B=>{var y=Xp(),N=U(y);let ne;var ye=d(N,2),Ee=v(ye);Wp(Ee,{get width(){return e(r)}}),te(()=>ne=We(N,1,"resize-handle svelte-1n46o8q",null,ne,{active:e(a)})),x("mousedown",N,f),h(B,y)};je(Pe,B=>{e(c)&&B(Ke)})}var Ge=d(Pe,2),Ye=v(Ge);Yp(Ye),te(()=>{Ue(_,`--props-width: ${e(c)?e(r)+"px":"0px"}; --resize-width: ${e(c)?"8px":"0px"}`),re=We(z,1,"display-resize-handle svelte-1n46o8q",null,re,{active:e(s)}),Ue(z,`display: ${e(i)?"block":"none"}`),Ue(W,`flex: 0 0 ${e(o)??""}px; display: ${e(i)?"block":"none"}`)}),x("mousedown",z,m),h(t,_),kt()}Tt(["mousedown"]);xc(Jp,{target:document.getElementById("app")});
