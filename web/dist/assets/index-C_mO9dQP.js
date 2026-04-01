var Ms=Object.defineProperty;var Ri=e=>{throw TypeError(e)};var Ss=(e,t,n)=>t in e?Ms(e,t,{enumerable:!0,configurable:!0,writable:!0,value:n}):e[t]=n;var vt=(e,t,n)=>Ss(e,typeof t!="symbol"?t+"":t,n),Wr=(e,t,n)=>t.has(e)||Ri("Cannot "+n);var p=(e,t,n)=>(Wr(e,t,"read from private field"),n?n.call(e):t.get(e)),X=(e,t,n)=>t.has(e)?Ri("Cannot add the same private member more than once"):t instanceof WeakSet?t.add(e):t.set(e,n),ne=(e,t,n,r)=>(Wr(e,t,"write to private field"),r?r.call(e,n):t.set(e,n),n),ge=(e,t,n)=>(Wr(e,t,"access private method"),n);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const i of document.querySelectorAll('link[rel="modulepreload"]'))r(i);new MutationObserver(i=>{for(const a of i)if(a.type==="childList")for(const s of a.addedNodes)s.tagName==="LINK"&&s.rel==="modulepreload"&&r(s)}).observe(document,{childList:!0,subtree:!0});function n(i){const a={};return i.integrity&&(a.integrity=i.integrity),i.referrerPolicy&&(a.referrerPolicy=i.referrerPolicy),i.crossOrigin==="use-credentials"?a.credentials="include":i.crossOrigin==="anonymous"?a.credentials="omit":a.credentials="same-origin",a}function r(i){if(i.ep)return;i.ep=!0;const a=n(i);fetch(i.href,a)}})();const ks=!1;var hi=Array.isArray,Es=Array.prototype.indexOf,jn=Array.prototype.includes,Tr=Array.from,oa=Object.defineProperty,tn=Object.getOwnPropertyDescriptor,ua=Object.getOwnPropertyDescriptors,Ps=Object.prototype,Ns=Array.prototype,_i=Object.getPrototypeOf,Di=Object.isExtensible;function Wn(e){return typeof e=="function"}const Ft=()=>{};function Cs(e){return e()}function kr(e){for(var t=0;t<e.length;t++)e[t]()}function ca(){var e,t,n=new Promise((r,i)=>{e=r,t=i});return{promise:n,resolve:e,reject:t}}function As(e,t){if(Array.isArray(e))return e;if(!(Symbol.iterator in e))return Array.from(e);const n=[];for(const r of e)if(n.push(r),n.length===t)break;return n}const Pe=2,In=4,ur=8,gi=1<<24,Gt=16,mt=32,xn=64,Qr=128,ot=512,Me=1024,ze=2048,zt=4096,Ye=8192,tt=16384,En=32768,Hi=1<<25,an=65536,Jr=1<<17,Ts=1<<18,Hn=1<<19,da=1<<20,At=1<<25,Mn=65536,ei=1<<21,zr=1<<22,nn=1<<23,Bt=Symbol("$state"),fa=Symbol("legacy props"),zs=Symbol(""),Ot=new class extends Error{constructor(){super(...arguments);vt(this,"name","StaleReactionError");vt(this,"message","The reaction that called `getAbortSignal()` was re-run or destroyed")}};var aa;const bi=!!((aa=globalThis.document)!=null&&aa.contentType)&&globalThis.document.contentType.includes("xml");function js(){throw new Error("https://svelte.dev/e/async_derived_orphan")}function Is(e,t,n){throw new Error("https://svelte.dev/e/each_key_duplicate")}function Os(e){throw new Error("https://svelte.dev/e/effect_in_teardown")}function Ls(){throw new Error("https://svelte.dev/e/effect_in_unowned_derived")}function Rs(e){throw new Error("https://svelte.dev/e/effect_orphan")}function Ds(){throw new Error("https://svelte.dev/e/effect_update_depth_exceeded")}function Hs(e){throw new Error("https://svelte.dev/e/props_invalid_value")}function Fs(){throw new Error("https://svelte.dev/e/state_descriptors_fixed")}function Bs(){throw new Error("https://svelte.dev/e/state_prototype_fixed")}function qs(){throw new Error("https://svelte.dev/e/state_unsafe_mutation")}function Ws(){throw new Error("https://svelte.dev/e/svelte_boundary_reset_onerror")}const Gs=1,Vs=2,va=4,Us=8,Zs=16,Ys=1,Ks=2,pa=4,Xs=8,Qs=16,Js=1,el=2,ke=Symbol(),ha="http://www.w3.org/1999/xhtml",tl="http://www.w3.org/2000/svg",nl="@attach";function rl(){console.warn("https://svelte.dev/e/select_multiple_invalid_value")}function il(){console.warn("https://svelte.dev/e/svelte_boundary_reset_noop")}function _a(e){return e===this.v}function ga(e,t){return e!=e?t==t:e!==t||e!==null&&typeof e=="object"||typeof e=="function"}function ba(e){return!ga(e,this.v)}let cr=!1,al=!1;function sl(){cr=!0}let Ee=null;function On(e){Ee=e}function wt(e,t=!1,n){Ee={p:Ee,i:!1,c:null,e:null,s:e,x:null,r:ee,l:cr&&!t?{s:null,u:null,$:[]}:null}}function yt(e){var t=Ee,n=t.e;if(n!==null){t.e=null;for(var r of n)Wa(r)}return t.i=!0,Ee=t.p,{}}function dr(){return!cr||Ee!==null&&Ee.l===null}let vn=[];function ma(){var e=vn;vn=[],kr(e)}function qt(e){if(vn.length===0&&!Yn){var t=vn;queueMicrotask(()=>{t===vn&&ma()})}vn.push(e)}function ll(){for(;vn.length>0;)ma()}function $a(e){var t=ee;if(t===null)return Q.f|=nn,e;if((t.f&En)===0&&(t.f&In)===0)throw e;en(e,t)}function en(e,t){for(;t!==null;){if((t.f&Qr)!==0){if((t.f&En)===0)throw e;try{t.b.error(e);return}catch(n){e=n}}t=t.parent}throw e}const ol=-7169;function be(e,t){e.f=e.f&ol|t}function mi(e){(e.f&ot)!==0||e.deps===null?be(e,Me):be(e,zt)}function wa(e){if(e!==null)for(const t of e)(t.f&Pe)===0||(t.f&Mn)===0||(t.f^=Mn,wa(t.deps))}function ya(e,t,n){(e.f&ze)!==0?t.add(e):(e.f&zt)!==0&&n.add(e),wa(e.deps),be(e,Me)}function $i(e,t,n){if(e==null)return t(void 0),n&&n(void 0),Ft;const r=kn(()=>e.subscribe(t,n));return r.unsubscribe?()=>r.unsubscribe():r}const Pn=[];function ul(e,t){return{subscribe:Fn(e,t).subscribe}}function Fn(e,t=Ft){let n=null;const r=new Set;function i(l){if(ga(e,l)&&(e=l,n)){const c=!Pn.length;for(const u of r)u[1](),Pn.push(u,e);if(c){for(let u=0;u<Pn.length;u+=2)Pn[u][0](Pn[u+1]);Pn.length=0}}}function a(l){i(l(e))}function s(l,c=Ft){const u=[l,c];return r.add(u),r.size===1&&(n=t(i,a)||Ft),l(e),()=>{r.delete(u),r.size===0&&n&&(n(),n=null)}}return{set:i,update:a,subscribe:s}}function cl(e,t,n){const r=!Array.isArray(e),i=r?[e]:e;if(!i.every(Boolean))throw new Error("derived() expects stores as input, got a falsy value");const a=t.length<2;return ul(n,(s,l)=>{let c=!1;const u=[];let d=0,h=Ft;const v=()=>{if(d)return;h();const f=t(r?u[0]:u,s,l);a?s(f):h=typeof f=="function"?f:Ft},_=i.map((f,y)=>$i(f,g=>{u[y]=g,d&=~(1<<y),c&&v()},()=>{d|=1<<y}));return c=!0,v(),function(){kr(_),h(),c=!1}})}function xa(e){let t;return $i(e,n=>t=n)(),t}let br=!1,ti=Symbol();function He(e,t,n){const r=n[t]??(n[t]={store:null,source:ja(void 0),unsubscribe:Ft});if(r.store!==e&&!(ti in n))if(r.unsubscribe(),r.store=e??null,e==null)r.source.v=void 0,r.unsubscribe=Ft;else{var i=!0;r.unsubscribe=$i(e,a=>{i?r.source.v=a:C(r.source,a)}),i=!1}return e&&ti in n?xa(e):o(r.source)}function Bn(){const e={};function t(){pr(()=>{for(var n in e)e[n].unsubscribe();oa(e,ti,{enumerable:!1,value:!0})})}return[e,t]}function dl(e){var t=br;try{return br=!1,[e(),br]}finally{br=t}}const Yt=new Set;let B=null,Te=null,ni=null,Yn=!1,Gr=!1,Nn=null,$r=null;var Fi=0;let fl=1;var Cn,An,Lt,kt,rr,Qe,ir,Qt,Rt,Et,Tn,gn,$e,wr,Ma,yr,ri,ii,Sa;const Nr=class Nr{constructor(){X(this,$e);vt(this,"id",fl++);vt(this,"current",new Map);vt(this,"previous",new Map);X(this,Cn,new Set);X(this,An,new Set);X(this,Lt,new Map);X(this,kt,new Map);X(this,rr,null);X(this,Qe,[]);X(this,ir,[]);X(this,Qt,new Set);X(this,Rt,new Set);X(this,Et,new Map);vt(this,"is_fork",!1);X(this,Tn,!1);X(this,gn,new Set)}skip_effect(t){p(this,Et).has(t)||p(this,Et).set(t,{d:[],m:[]})}unskip_effect(t){var n=p(this,Et).get(t);if(n){p(this,Et).delete(t);for(var r of n.d)be(r,ze),this.schedule(r);for(r of n.m)be(r,zt),this.schedule(r)}}capture(t,n,r=!1){n!==ke&&!this.previous.has(t)&&this.previous.set(t,n),(t.f&nn)===0&&(this.current.set(t,[t.v,r]),Te==null||Te.set(t,t.v))}activate(){B=this}deactivate(){B=null,Te=null}flush(){try{Gr=!0,B=this,ge(this,$e,yr).call(this)}finally{Fi=0,ni=null,Nn=null,$r=null,Gr=!1,B=null,Te=null,rn.clear()}}discard(){for(const t of p(this,An))t(this);p(this,An).clear(),Yt.delete(this)}register_created_effect(t){p(this,ir).push(t)}increment(t,n){let r=p(this,Lt).get(n)??0;if(p(this,Lt).set(n,r+1),t){let i=p(this,kt).get(n)??0;p(this,kt).set(n,i+1)}}decrement(t,n,r){let i=p(this,Lt).get(n)??0;if(i===1?p(this,Lt).delete(n):p(this,Lt).set(n,i-1),t){let a=p(this,kt).get(n)??0;a===1?p(this,kt).delete(n):p(this,kt).set(n,a-1)}p(this,Tn)||r||(ne(this,Tn,!0),qt(()=>{ne(this,Tn,!1),this.flush()}))}transfer_effects(t,n){for(const r of t)p(this,Qt).add(r);for(const r of n)p(this,Rt).add(r);t.clear(),n.clear()}oncommit(t){p(this,Cn).add(t)}ondiscard(t){p(this,An).add(t)}settled(){return(p(this,rr)??ne(this,rr,ca())).promise}static ensure(){if(B===null){const t=B=new Nr;Gr||(Yt.add(B),Yn||qt(()=>{B===t&&t.flush()}))}return B}apply(){{Te=null;return}}schedule(t){var i;if(ni=t,(i=t.b)!=null&&i.is_pending&&(t.f&(In|ur|gi))!==0&&(t.f&En)===0){t.b.defer_effect(t);return}for(var n=t;n.parent!==null;){n=n.parent;var r=n.f;if(Nn!==null&&n===ee&&(Q===null||(Q.f&Pe)===0))return;if((r&(xn|mt))!==0){if((r&Me)===0)return;n.f^=Me}}p(this,Qe).push(n)}};Cn=new WeakMap,An=new WeakMap,Lt=new WeakMap,kt=new WeakMap,rr=new WeakMap,Qe=new WeakMap,ir=new WeakMap,Qt=new WeakMap,Rt=new WeakMap,Et=new WeakMap,Tn=new WeakMap,gn=new WeakMap,$e=new WeakSet,wr=function(){return this.is_fork||p(this,kt).size>0},Ma=function(){for(const r of p(this,gn))for(const i of p(r,kt).keys()){for(var t=!1,n=i;n.parent!==null;){if(p(this,Et).has(n)){t=!0;break}n=n.parent}if(!t)return!0}return!1},yr=function(){var l,c;if(Fi++>1e3&&(Yt.delete(this),pl()),!ge(this,$e,wr).call(this)){for(const u of p(this,Qt))p(this,Rt).delete(u),be(u,ze),this.schedule(u);for(const u of p(this,Rt))be(u,zt),this.schedule(u)}const t=p(this,Qe);ne(this,Qe,[]),this.apply();var n=Nn=[],r=[],i=$r=[];for(const u of t)try{ge(this,$e,ri).call(this,u,n,r)}catch(d){throw Pa(u),d}if(B=null,i.length>0){var a=Nr.ensure();for(const u of i)a.schedule(u)}if(Nn=null,$r=null,ge(this,$e,wr).call(this)||ge(this,$e,Ma).call(this)){ge(this,$e,ii).call(this,r),ge(this,$e,ii).call(this,n);for(const[u,d]of p(this,Et))Ea(u,d)}else{p(this,Lt).size===0&&Yt.delete(this),p(this,Qt).clear(),p(this,Rt).clear();for(const u of p(this,Cn))u(this);p(this,Cn).clear(),Bi(r),Bi(n),(l=p(this,rr))==null||l.resolve()}var s=B;if(p(this,Qe).length>0){const u=s??(s=this);p(u,Qe).push(...p(this,Qe).filter(d=>!p(u,Qe).includes(d)))}s!==null&&(Yt.add(s),ge(c=s,$e,yr).call(c)),Yt.has(this)||ge(this,$e,Sa).call(this)},ri=function(t,n,r){t.f^=Me;for(var i=t.first;i!==null;){var a=i.f,s=(a&(mt|xn))!==0,l=s&&(a&Me)!==0,c=l||(a&Ye)!==0||p(this,Et).has(i);if(!c&&i.fn!==null){s?i.f^=Me:(a&In)!==0?n.push(i):_r(i)&&((a&Gt)!==0&&p(this,Rt).add(i),Dn(i));var u=i.first;if(u!==null){i=u;continue}}for(;i!==null;){var d=i.next;if(d!==null){i=d;break}i=i.parent}}},ii=function(t){for(var n=0;n<t.length;n+=1)ya(t[n],p(this,Qt),p(this,Rt))},Sa=function(){var d,h,v;for(const _ of Yt){var t=_.id<this.id,n=[];for(const[f,[y,g]]of this.current){if(_.current.has(f)){var r=_.current.get(f)[0];if(t&&y!==r)_.current.set(f,[y,g]);else continue}n.push(f)}var i=[..._.current.keys()].filter(f=>!this.current.has(f));if(i.length===0)t&&_.discard();else if(n.length>0){_.activate();var a=new Set,s=new Map;for(var l of n)ka(l,i,a,s);s=new Map;var c=[..._.current.keys()].filter(f=>this.current.has(f)?this.current.get(f)[0]!==f:!0);for(const f of p(this,ir))(f.f&(tt|Ye|Jr))===0&&wi(f,c,s)&&((f.f&(zr|Gt))!==0?(be(f,ze),_.schedule(f)):p(_,Qt).add(f));if(p(_,Qe).length>0){_.apply();for(var u of p(_,Qe))ge(d=_,$e,ri).call(d,u,[],[]);ne(_,Qe,[])}_.deactivate()}}for(const _ of Yt)p(_,gn).has(this)&&(p(_,gn).delete(this),p(_,gn).size===0&&!ge(h=_,$e,wr).call(h)&&(_.activate(),ge(v=_,$e,yr).call(v)))};let Sn=Nr;function vl(e){var t=Yn;Yn=!0;try{for(var n;;){if(ll(),B===null)return n;B.flush()}}finally{Yn=t}}function pl(){try{Ds()}catch(e){en(e,ni)}}let pt=null;function Bi(e){var t=e.length;if(t!==0){for(var n=0;n<t;){var r=e[n++];if((r.f&(tt|Ye))===0&&_r(r)&&(pt=new Set,Dn(r),r.deps===null&&r.first===null&&r.nodes===null&&r.teardown===null&&r.ac===null&&Za(r),(pt==null?void 0:pt.size)>0)){rn.clear();for(const i of pt){if((i.f&(tt|Ye))!==0)continue;const a=[i];let s=i.parent;for(;s!==null;)pt.has(s)&&(pt.delete(s),a.push(s)),s=s.parent;for(let l=a.length-1;l>=0;l--){const c=a[l];(c.f&(tt|Ye))===0&&Dn(c)}}pt.clear()}}pt=null}}function ka(e,t,n,r){if(!n.has(e)&&(n.add(e),e.reactions!==null))for(const i of e.reactions){const a=i.f;(a&Pe)!==0?ka(i,t,n,r):(a&(zr|Gt))!==0&&(a&ze)===0&&wi(i,t,r)&&(be(i,ze),yi(i))}}function wi(e,t,n){const r=n.get(e);if(r!==void 0)return r;if(e.deps!==null)for(const i of e.deps){if(jn.call(t,i))return!0;if((i.f&Pe)!==0&&wi(i,t,n))return n.set(i,!0),!0}return n.set(e,!1),!1}function yi(e){B.schedule(e)}function Ea(e,t){if(!((e.f&mt)!==0&&(e.f&Me)!==0)){(e.f&ze)!==0?t.d.push(e):(e.f&zt)!==0&&t.m.push(e),be(e,Me);for(var n=e.first;n!==null;)Ea(n,t),n=n.next}}function Pa(e){be(e,Me);for(var t=e.first;t!==null;)Pa(t),t=t.next}function hl(e){let t=0,n=sn(0),r;return()=>{Si()&&(o(n),Ga(()=>(t===0&&(r=kn(()=>e(()=>Kn(n)))),t+=1,()=>{qt(()=>{t-=1,t===0&&(r==null||r(),r=void 0,Kn(n))})})))}}var _l=an|Hn;function gl(e,t,n,r){new bl(e,t,n,r)}var lt,pi,Pt,bn,Ve,Nt,Je,ht,Dt,mn,Jt,zn,ar,sr,Ht,Cr,Se,ml,$l,wl,ai,xr,Mr,si;class bl{constructor(t,n,r,i){X(this,Se);vt(this,"parent");vt(this,"is_pending",!1);vt(this,"transform_error");X(this,lt);X(this,pi,null);X(this,Pt);X(this,bn);X(this,Ve);X(this,Nt,null);X(this,Je,null);X(this,ht,null);X(this,Dt,null);X(this,mn,0);X(this,Jt,0);X(this,zn,!1);X(this,ar,new Set);X(this,sr,new Set);X(this,Ht,null);X(this,Cr,hl(()=>(ne(this,Ht,sn(p(this,mn))),()=>{ne(this,Ht,null)})));var a;ne(this,lt,t),ne(this,Pt,n),ne(this,bn,s=>{var l=ee;l.b=this,l.f|=Qr,r(s)}),this.parent=ee.b,this.transform_error=i??((a=this.parent)==null?void 0:a.transform_error)??(s=>s),ne(this,Ve,hr(()=>{ge(this,Se,ai).call(this)},_l))}defer_effect(t){ya(t,p(this,ar),p(this,sr))}is_rendered(){return!this.is_pending&&(!this.parent||this.parent.is_rendered())}has_pending_snippet(){return!!p(this,Pt).pending}update_pending_count(t,n){ge(this,Se,si).call(this,t,n),ne(this,mn,p(this,mn)+t),!(!p(this,Ht)||p(this,zn))&&(ne(this,zn,!0),qt(()=>{ne(this,zn,!1),p(this,Ht)&&Ln(p(this,Ht),p(this,mn))}))}get_effect_pending(){return p(this,Cr).call(this),o(p(this,Ht))}error(t){var n=p(this,Pt).onerror;let r=p(this,Pt).failed;if(!n&&!r)throw t;p(this,Nt)&&(je(p(this,Nt)),ne(this,Nt,null)),p(this,Je)&&(je(p(this,Je)),ne(this,Je,null)),p(this,ht)&&(je(p(this,ht)),ne(this,ht,null));var i=!1,a=!1;const s=()=>{if(i){il();return}i=!0,a&&Ws(),p(this,ht)!==null&&wn(p(this,ht),()=>{ne(this,ht,null)}),ge(this,Se,Mr).call(this,()=>{ge(this,Se,ai).call(this)})},l=c=>{try{a=!0,n==null||n(c,s),a=!1}catch(u){en(u,p(this,Ve)&&p(this,Ve).parent)}r&&ne(this,ht,ge(this,Se,Mr).call(this,()=>{try{return Ze(()=>{var u=ee;u.b=this,u.f|=Qr,r(p(this,lt),()=>c,()=>s)})}catch(u){return en(u,p(this,Ve).parent),null}}))};qt(()=>{var c;try{c=this.transform_error(t)}catch(u){en(u,p(this,Ve)&&p(this,Ve).parent);return}c!==null&&typeof c=="object"&&typeof c.then=="function"?c.then(l,u=>en(u,p(this,Ve)&&p(this,Ve).parent)):l(c)})}}lt=new WeakMap,pi=new WeakMap,Pt=new WeakMap,bn=new WeakMap,Ve=new WeakMap,Nt=new WeakMap,Je=new WeakMap,ht=new WeakMap,Dt=new WeakMap,mn=new WeakMap,Jt=new WeakMap,zn=new WeakMap,ar=new WeakMap,sr=new WeakMap,Ht=new WeakMap,Cr=new WeakMap,Se=new WeakSet,ml=function(){try{ne(this,Nt,Ze(()=>p(this,bn).call(this,p(this,lt))))}catch(t){this.error(t)}},$l=function(t){const n=p(this,Pt).failed;n&&ne(this,ht,Ze(()=>{n(p(this,lt),()=>t,()=>()=>{})}))},wl=function(){const t=p(this,Pt).pending;t&&(this.is_pending=!0,ne(this,Je,Ze(()=>t(p(this,lt)))),qt(()=>{var n=ne(this,Dt,document.createDocumentFragment()),r=Wt();n.append(r),ne(this,Nt,ge(this,Se,Mr).call(this,()=>Ze(()=>p(this,bn).call(this,r)))),p(this,Jt)===0&&(p(this,lt).before(n),ne(this,Dt,null),wn(p(this,Je),()=>{ne(this,Je,null)}),ge(this,Se,xr).call(this,B))}))},ai=function(){try{if(this.is_pending=this.has_pending_snippet(),ne(this,Jt,0),ne(this,mn,0),ne(this,Nt,Ze(()=>{p(this,bn).call(this,p(this,lt))})),p(this,Jt)>0){var t=ne(this,Dt,document.createDocumentFragment());Ni(p(this,Nt),t);const n=p(this,Pt).pending;ne(this,Je,Ze(()=>n(p(this,lt))))}else ge(this,Se,xr).call(this,B)}catch(n){this.error(n)}},xr=function(t){this.is_pending=!1,t.transfer_effects(p(this,ar),p(this,sr))},Mr=function(t){var n=ee,r=Q,i=Ee;dt(p(this,Ve)),ct(p(this,Ve)),On(p(this,Ve).ctx);try{return Sn.ensure(),t()}catch(a){return $a(a),null}finally{dt(n),ct(r),On(i)}},si=function(t,n){var r;if(!this.has_pending_snippet()){this.parent&&ge(r=this.parent,Se,si).call(r,t,n);return}ne(this,Jt,p(this,Jt)+t),p(this,Jt)===0&&(ge(this,Se,xr).call(this,n),p(this,Je)&&wn(p(this,Je),()=>{ne(this,Je,null)}),p(this,Dt)&&(p(this,lt).before(p(this,Dt)),ne(this,Dt,null)))};function Na(e,t,n,r){const i=dr()?fr:xi;var a=e.filter(v=>!v.settled);if(n.length===0&&a.length===0){r(t.map(i));return}var s=ee,l=yl(),c=a.length===1?a[0].promise:a.length>1?Promise.all(a.map(v=>v.promise)):null;function u(v){l();try{r(v)}catch(_){(s.f&tt)===0&&en(_,s)}Er()}if(n.length===0){c.then(()=>u(t.map(i)));return}var d=Ca();function h(){Promise.all(n.map(v=>xl(v))).then(v=>u([...t.map(i),...v])).catch(v=>en(v,s)).finally(()=>d())}c?c.then(()=>{l(),h(),Er()}):h()}function yl(){var e=ee,t=Q,n=Ee,r=B;return function(a=!0){dt(e),ct(t),On(n),a&&(e.f&tt)===0&&(r==null||r.activate(),r==null||r.apply())}}function Er(e=!0){dt(null),ct(null),On(null),e&&(B==null||B.deactivate())}function Ca(){var e=ee,t=e.b,n=B,r=t.is_rendered();return t.update_pending_count(1,n),n.increment(r,e),(i=!1)=>{t.update_pending_count(-1,n),n.decrement(r,e,i)}}function fr(e){var t=Pe|ze,n=Q!==null&&(Q.f&Pe)!==0?Q:null;return ee!==null&&(ee.f|=Hn),{ctx:Ee,deps:null,effects:null,equals:_a,f:t,fn:e,reactions:null,rv:0,v:ke,wv:0,parent:n??ee,ac:null}}function xl(e,t,n){let r=ee;r===null&&js();var i=void 0,a=sn(ke),s=!Q,l=new Map;return Il(()=>{var _;var c=ee,u=ca();i=u.promise;try{Promise.resolve(e()).then(u.resolve,u.reject).finally(Er)}catch(f){u.reject(f),Er()}var d=B;if(s){if((c.f&En)!==0)var h=Ca();if(r.b.is_rendered())(_=l.get(d))==null||_.reject(Ot),l.delete(d);else{for(const f of l.values())f.reject(Ot);l.clear()}l.set(d,u)}const v=(f,y=void 0)=>{if(h){var g=y===Ot;h(g)}if(!(y===Ot||(c.f&tt)!==0)){if(d.activate(),y)a.f|=nn,Ln(a,y);else{(a.f&nn)!==0&&(a.f^=nn),Ln(a,f);for(const[b,z]of l){if(l.delete(b),b===d)break;z.reject(Ot)}}d.deactivate()}};u.promise.then(v,f=>v(null,f||"unknown"))}),pr(()=>{for(const c of l.values())c.reject(Ot)}),new Promise(c=>{function u(d){function h(){d===i?c(a):u(i)}d.then(h,h)}u(i)})}function G(e){const t=fr(e);return Xa(t),t}function xi(e){const t=fr(e);return t.equals=ba,t}function Ml(e){var t=e.effects;if(t!==null){e.effects=null;for(var n=0;n<t.length;n+=1)je(t[n])}}function Sl(e){for(var t=e.parent;t!==null;){if((t.f&Pe)===0)return(t.f&tt)===0?t:null;t=t.parent}return null}function Mi(e){var t,n=ee;dt(Sl(e));try{e.f&=~Mn,Ml(e),t=ts(e)}finally{dt(n)}return t}function Aa(e){var t=e.v,n=Mi(e);if(!e.equals(n)&&(e.wv=Ja(),(!(B!=null&&B.is_fork)||e.deps===null)&&(e.v=n,B==null||B.capture(e,t,!0),e.deps===null))){be(e,Me);return}ln||(Te!==null?(Si()||B!=null&&B.is_fork)&&Te.set(e,n):mi(e))}function kl(e){var t,n;if(e.effects!==null)for(const r of e.effects)(r.teardown||r.ac)&&((t=r.teardown)==null||t.call(r),(n=r.ac)==null||n.abort(Ot),r.teardown=Ft,r.ac=null,er(r,0),Ei(r))}function Ta(e){if(e.effects!==null)for(const t of e.effects)t.teardown&&Dn(t)}let li=new Set;const rn=new Map;let za=!1;function sn(e,t){var n={f:0,v:e,reactions:null,equals:_a,rv:0,wv:0};return n}function J(e,t){const n=sn(e);return Xa(n),n}function ja(e,t=!1,n=!0){var i;const r=sn(e);return t||(r.equals=ba),cr&&n&&Ee!==null&&Ee.l!==null&&((i=Ee.l).s??(i.s=[])).push(r),r}function C(e,t,n=!1){Q!==null&&(!gt||(Q.f&Jr)!==0)&&dr()&&(Q.f&(Pe|Gt|zr|Jr))!==0&&(ut===null||!jn.call(ut,e))&&qs();let r=n?Tt(t):t;return Ln(e,r,$r)}function Ln(e,t,n=null){if(!e.equals(t)){var r=e.v;ln?rn.set(e,t):rn.set(e,r),e.v=t;var i=Sn.ensure();if(i.capture(e,r),(e.f&Pe)!==0){const a=e;(e.f&ze)!==0&&Mi(a),Te===null&&mi(a)}e.wv=Ja(),Ia(e,ze,n),dr()&&ee!==null&&(ee.f&Me)!==0&&(ee.f&(mt|xn))===0&&(st===null?Rl([e]):st.push(e)),!i.is_fork&&li.size>0&&!za&&El()}return t}function El(){za=!1;for(const e of li)(e.f&Me)!==0&&be(e,zt),_r(e)&&Dn(e);li.clear()}function qi(e,t=1){var n=o(e),r=t===1?n++:n--;return C(e,n),r}function Kn(e){C(e,e.v+1)}function Ia(e,t,n){var r=e.reactions;if(r!==null)for(var i=dr(),a=r.length,s=0;s<a;s++){var l=r[s],c=l.f;if(!(!i&&l===ee)){var u=(c&ze)===0;if(u&&be(l,t),(c&Pe)!==0){var d=l;Te==null||Te.delete(d),(c&Mn)===0&&(c&ot&&(l.f|=Mn),Ia(d,zt,n))}else if(u){var h=l;(c&Gt)!==0&&pt!==null&&pt.add(h),n!==null?n.push(h):yi(h)}}}}function Tt(e){if(typeof e!="object"||e===null||Bt in e)return e;const t=_i(e);if(t!==Ps&&t!==Ns)return e;var n=new Map,r=hi(e),i=J(0),a=yn,s=l=>{if(yn===a)return l();var c=Q,u=yn;ct(null),Ui(a);var d=l();return ct(c),Ui(u),d};return r&&n.set("length",J(e.length)),new Proxy(e,{defineProperty(l,c,u){(!("value"in u)||u.configurable===!1||u.enumerable===!1||u.writable===!1)&&Fs();var d=n.get(c);return d===void 0?s(()=>{var h=J(u.value);return n.set(c,h),h}):C(d,u.value,!0),!0},deleteProperty(l,c){var u=n.get(c);if(u===void 0){if(c in l){const d=s(()=>J(ke));n.set(c,d),Kn(i)}}else C(u,ke),Kn(i);return!0},get(l,c,u){var _;if(c===Bt)return e;var d=n.get(c),h=c in l;if(d===void 0&&(!h||(_=tn(l,c))!=null&&_.writable)&&(d=s(()=>{var f=Tt(h?l[c]:ke),y=J(f);return y}),n.set(c,d)),d!==void 0){var v=o(d);return v===ke?void 0:v}return Reflect.get(l,c,u)},getOwnPropertyDescriptor(l,c){var u=Reflect.getOwnPropertyDescriptor(l,c);if(u&&"value"in u){var d=n.get(c);d&&(u.value=o(d))}else if(u===void 0){var h=n.get(c),v=h==null?void 0:h.v;if(h!==void 0&&v!==ke)return{enumerable:!0,configurable:!0,value:v,writable:!0}}return u},has(l,c){var v;if(c===Bt)return!0;var u=n.get(c),d=u!==void 0&&u.v!==ke||Reflect.has(l,c);if(u!==void 0||ee!==null&&(!d||(v=tn(l,c))!=null&&v.writable)){u===void 0&&(u=s(()=>{var _=d?Tt(l[c]):ke,f=J(_);return f}),n.set(c,u));var h=o(u);if(h===ke)return!1}return d},set(l,c,u,d){var O;var h=n.get(c),v=c in l;if(r&&c==="length")for(var _=u;_<h.v;_+=1){var f=n.get(_+"");f!==void 0?C(f,ke):_ in l&&(f=s(()=>J(ke)),n.set(_+"",f))}if(h===void 0)(!v||(O=tn(l,c))!=null&&O.writable)&&(h=s(()=>J(void 0)),C(h,Tt(u)),n.set(c,h));else{v=h.v!==ke;var y=s(()=>Tt(u));C(h,y)}var g=Reflect.getOwnPropertyDescriptor(l,c);if(g!=null&&g.set&&g.set.call(d,u),!v){if(r&&typeof c=="string"){var b=n.get("length"),z=Number(c);Number.isInteger(z)&&z>=b.v&&C(b,z+1)}Kn(i)}return!0},ownKeys(l){o(i);var c=Reflect.ownKeys(l).filter(h=>{var v=n.get(h);return v===void 0||v.v!==ke});for(var[u,d]of n)d.v!==ke&&!(u in l)&&c.push(u);return c},setPrototypeOf(){Bs()}})}function Wi(e){try{if(e!==null&&typeof e=="object"&&Bt in e)return e[Bt]}catch{}return e}function Pl(e,t){return Object.is(Wi(e),Wi(t))}var Qn,Oa,La,Ra;function Nl(){if(Qn===void 0){Qn=window,Oa=/Firefox/.test(navigator.userAgent);var e=Element.prototype,t=Node.prototype,n=Text.prototype;La=tn(t,"firstChild").get,Ra=tn(t,"nextSibling").get,Di(e)&&(e.__click=void 0,e.__className=void 0,e.__attributes=null,e.__style=void 0,e.__e=void 0),Di(n)&&(n.__t=void 0)}}function Wt(e=""){return document.createTextNode(e)}function Rn(e){return La.call(e)}function vr(e){return Ra.call(e)}function m(e,t){return Rn(e)}function V(e,t=!1){{var n=Rn(e);return n instanceof Comment&&n.data===""?vr(n):n}}function w(e,t=1,n=!1){let r=e;for(;t--;)r=vr(r);return r}function Cl(e){e.textContent=""}function Da(){return!1}function Ha(e,t,n){return document.createElementNS(t??ha,e,void 0)}function Fa(e,t){if(t){const n=document.body;e.autofocus=!0,qt(()=>{document.activeElement===n&&e.focus()})}}let Gi=!1;function Al(){Gi||(Gi=!0,document.addEventListener("reset",e=>{Promise.resolve().then(()=>{var t;if(!e.defaultPrevented)for(const n of e.target.elements)(t=n.__on_r)==null||t.call(n)})},{capture:!0}))}function jr(e){var t=Q,n=ee;ct(null),dt(null);try{return e()}finally{ct(t),dt(n)}}function Ba(e,t,n,r=n){e.addEventListener(t,()=>jr(n));const i=e.__on_r;i?e.__on_r=()=>{i(),r(!0)}:e.__on_r=()=>r(!0),Al()}function qa(e){ee===null&&(Q===null&&Rs(),Ls()),ln&&Os()}function Tl(e,t){var n=t.last;n===null?t.last=t.first=e:(n.next=e,e.prev=n,t.last=e)}function xt(e,t){var n=ee;n!==null&&(n.f&Ye)!==0&&(e|=Ye);var r={ctx:Ee,deps:null,nodes:null,f:e|ze|ot,first:null,fn:t,last:null,next:null,parent:n,b:n&&n.b,prev:null,teardown:null,wv:0,ac:null};B==null||B.register_created_effect(r);var i=r;if((e&In)!==0)Nn!==null?Nn.push(r):Sn.ensure().schedule(r);else if(t!==null){try{Dn(r)}catch(s){throw je(r),s}i.deps===null&&i.teardown===null&&i.nodes===null&&i.first===i.last&&(i.f&Hn)===0&&(i=i.first,(e&Gt)!==0&&(e&an)!==0&&i!==null&&(i.f|=an))}if(i!==null&&(i.parent=n,n!==null&&Tl(i,n),Q!==null&&(Q.f&Pe)!==0&&(e&xn)===0)){var a=Q;(a.effects??(a.effects=[])).push(i)}return r}function Si(){return Q!==null&&!gt}function pr(e){const t=xt(ur,null);return be(t,Me),t.teardown=e,t}function Jn(e){qa();var t=ee.f,n=!Q&&(t&mt)!==0&&(t&En)===0;if(n){var r=Ee;(r.e??(r.e=[])).push(e)}else return Wa(e)}function Wa(e){return xt(In|da,e)}function zl(e){return qa(),xt(ur|da,e)}function jl(e){Sn.ensure();const t=xt(xn|Hn,e);return(n={})=>new Promise(r=>{n.outro?wn(t,()=>{je(t),r(void 0)}):(je(t),r(void 0))})}function ki(e){return xt(In,e)}function Il(e){return xt(zr|Hn,e)}function Ga(e,t=0){return xt(ur|t,e)}function ue(e,t=[],n=[],r=[]){Na(r,t,n,i=>{xt(ur,()=>e(...i.map(o)))})}function hr(e,t=0){var n=xt(Gt|t,e);return n}function Va(e,t=0){var n=xt(gi|t,e);return n}function Ze(e){return xt(mt|Hn,e)}function Ua(e){var t=e.teardown;if(t!==null){const n=ln,r=Q;Vi(!0),ct(null);try{t.call(null)}finally{Vi(n),ct(r)}}}function Ei(e,t=!1){var n=e.first;for(e.first=e.last=null;n!==null;){const i=n.ac;i!==null&&jr(()=>{i.abort(Ot)});var r=n.next;(n.f&xn)!==0?n.parent=null:je(n,t),n=r}}function Ol(e){for(var t=e.first;t!==null;){var n=t.next;(t.f&mt)===0&&je(t),t=n}}function je(e,t=!0){var n=!1;(t||(e.f&Ts)!==0)&&e.nodes!==null&&e.nodes.end!==null&&(Ll(e.nodes.start,e.nodes.end),n=!0),be(e,Hi),Ei(e,t&&!n),er(e,0);var r=e.nodes&&e.nodes.t;if(r!==null)for(const a of r)a.stop();Ua(e),e.f^=Hi,e.f|=tt;var i=e.parent;i!==null&&i.first!==null&&Za(e),e.next=e.prev=e.teardown=e.ctx=e.deps=e.fn=e.nodes=e.ac=e.b=null}function Ll(e,t){for(;e!==null;){var n=e===t?null:vr(e);e.remove(),e=n}}function Za(e){var t=e.parent,n=e.prev,r=e.next;n!==null&&(n.next=r),r!==null&&(r.prev=n),t!==null&&(t.first===e&&(t.first=r),t.last===e&&(t.last=n))}function wn(e,t,n=!0){var r=[];Ya(e,r,!0);var i=()=>{n&&je(e),t&&t()},a=r.length;if(a>0){var s=()=>--a||i();for(var l of r)l.out(s)}else i()}function Ya(e,t,n){if((e.f&Ye)===0){e.f^=Ye;var r=e.nodes&&e.nodes.t;if(r!==null)for(const l of r)(l.is_global||n)&&t.push(l);for(var i=e.first;i!==null;){var a=i.next,s=(i.f&an)!==0||(i.f&mt)!==0&&(e.f&Gt)!==0;Ya(i,t,s?n:!1),i=a}}}function Pi(e){Ka(e,!0)}function Ka(e,t){if((e.f&Ye)!==0){e.f^=Ye,(e.f&Me)===0&&(be(e,ze),Sn.ensure().schedule(e));for(var n=e.first;n!==null;){var r=n.next,i=(n.f&an)!==0||(n.f&mt)!==0;Ka(n,i?t:!1),n=r}var a=e.nodes&&e.nodes.t;if(a!==null)for(const s of a)(s.is_global||t)&&s.in()}}function Ni(e,t){if(e.nodes)for(var n=e.nodes.start,r=e.nodes.end;n!==null;){var i=n===r?null:vr(n);t.append(n),n=i}}let Sr=!1,ln=!1;function Vi(e){ln=e}let Q=null,gt=!1;function ct(e){Q=e}let ee=null;function dt(e){ee=e}let ut=null;function Xa(e){Q!==null&&(ut===null?ut=[e]:ut.push(e))}let Ue=null,Xe=0,st=null;function Rl(e){st=e}let Qa=1,pn=0,yn=pn;function Ui(e){yn=e}function Ja(){return++Qa}function _r(e){var t=e.f;if((t&ze)!==0)return!0;if(t&Pe&&(e.f&=~Mn),(t&zt)!==0){for(var n=e.deps,r=n.length,i=0;i<r;i++){var a=n[i];if(_r(a)&&Aa(a),a.wv>e.wv)return!0}(t&ot)!==0&&Te===null&&be(e,Me)}return!1}function es(e,t,n=!0){var r=e.reactions;if(r!==null&&!(ut!==null&&jn.call(ut,e)))for(var i=0;i<r.length;i++){var a=r[i];(a.f&Pe)!==0?es(a,t,!1):t===a&&(n?be(a,ze):(a.f&Me)!==0&&be(a,zt),yi(a))}}function ts(e){var y;var t=Ue,n=Xe,r=st,i=Q,a=ut,s=Ee,l=gt,c=yn,u=e.f;Ue=null,Xe=0,st=null,Q=(u&(mt|xn))===0?e:null,ut=null,On(e.ctx),gt=!1,yn=++pn,e.ac!==null&&(jr(()=>{e.ac.abort(Ot)}),e.ac=null);try{e.f|=ei;var d=e.fn,h=d();e.f|=En;var v=e.deps,_=B==null?void 0:B.is_fork;if(Ue!==null){var f;if(_||er(e,Xe),v!==null&&Xe>0)for(v.length=Xe+Ue.length,f=0;f<Ue.length;f++)v[Xe+f]=Ue[f];else e.deps=v=Ue;if(Si()&&(e.f&ot)!==0)for(f=Xe;f<v.length;f++)((y=v[f]).reactions??(y.reactions=[])).push(e)}else!_&&v!==null&&Xe<v.length&&(er(e,Xe),v.length=Xe);if(dr()&&st!==null&&!gt&&v!==null&&(e.f&(Pe|zt|ze))===0)for(f=0;f<st.length;f++)es(st[f],e);if(i!==null&&i!==e){if(pn++,i.deps!==null)for(let g=0;g<n;g+=1)i.deps[g].rv=pn;if(t!==null)for(const g of t)g.rv=pn;st!==null&&(r===null?r=st:r.push(...st))}return(e.f&nn)!==0&&(e.f^=nn),h}catch(g){return $a(g)}finally{e.f^=ei,Ue=t,Xe=n,st=r,Q=i,ut=a,On(s),gt=l,yn=c}}function Dl(e,t){let n=t.reactions;if(n!==null){var r=Es.call(n,e);if(r!==-1){var i=n.length-1;i===0?n=t.reactions=null:(n[r]=n[i],n.pop())}}if(n===null&&(t.f&Pe)!==0&&(Ue===null||!jn.call(Ue,t))){var a=t;(a.f&ot)!==0&&(a.f^=ot,a.f&=~Mn),mi(a),kl(a),er(a,0)}}function er(e,t){var n=e.deps;if(n!==null)for(var r=t;r<n.length;r++)Dl(e,n[r])}function Dn(e){var t=e.f;if((t&tt)===0){be(e,Me);var n=ee,r=Sr;ee=e,Sr=!0;try{(t&(Gt|gi))!==0?Ol(e):Ei(e),Ua(e);var i=ts(e);e.teardown=typeof i=="function"?i:null,e.wv=Qa;var a;ks&&al&&(e.f&ze)!==0&&e.deps}finally{Sr=r,ee=n}}}async function Hl(){await Promise.resolve(),vl()}function o(e){var t=e.f,n=(t&Pe)!==0;if(Q!==null&&!gt){var r=ee!==null&&(ee.f&tt)!==0;if(!r&&(ut===null||!jn.call(ut,e))){var i=Q.deps;if((Q.f&ei)!==0)e.rv<pn&&(e.rv=pn,Ue===null&&i!==null&&i[Xe]===e?Xe++:Ue===null?Ue=[e]:Ue.push(e));else{(Q.deps??(Q.deps=[])).push(e);var a=e.reactions;a===null?e.reactions=[Q]:jn.call(a,Q)||a.push(Q)}}}if(ln&&rn.has(e))return rn.get(e);if(n){var s=e;if(ln){var l=s.v;return((s.f&Me)===0&&s.reactions!==null||rs(s))&&(l=Mi(s)),rn.set(s,l),l}var c=(s.f&ot)===0&&!gt&&Q!==null&&(Sr||(Q.f&ot)!==0),u=(s.f&En)===0;_r(s)&&(c&&(s.f|=ot),Aa(s)),c&&!u&&(Ta(s),ns(s))}if(Te!=null&&Te.has(e))return Te.get(e);if((e.f&nn)!==0)throw e.v;return e.v}function ns(e){if(e.f|=ot,e.deps!==null)for(const t of e.deps)(t.reactions??(t.reactions=[])).push(e),(t.f&Pe)!==0&&(t.f&ot)===0&&(Ta(t),ns(t))}function rs(e){if(e.v===ke)return!0;if(e.deps===null)return!1;for(const t of e.deps)if(rn.has(t)||(t.f&Pe)!==0&&rs(t))return!0;return!1}function kn(e){var t=gt;try{return gt=!0,e()}finally{gt=t}}function dn(e){if(!(typeof e!="object"||!e||e instanceof EventTarget)){if(Bt in e)oi(e);else if(!Array.isArray(e))for(let t in e){const n=e[t];typeof n=="object"&&n&&Bt in n&&oi(n)}}}function oi(e,t=new Set){if(typeof e=="object"&&e!==null&&!(e instanceof EventTarget)&&!t.has(e)){t.add(e),e instanceof Date&&e.getTime();for(let r in e)try{oi(e[r],t)}catch{}const n=_i(e);if(n!==Object.prototype&&n!==Array.prototype&&n!==Map.prototype&&n!==Set.prototype&&n!==Date.prototype){const r=ua(n);for(let i in r){const a=r[i].get;if(a)try{a.call(e)}catch{}}}}}function Fl(e){return e.endsWith("capture")&&e!=="gotpointercapture"&&e!=="lostpointercapture"}const Bl=["beforeinput","click","change","dblclick","contextmenu","focusin","focusout","input","keydown","keyup","mousedown","mousemove","mouseout","mouseover","mouseup","pointerdown","pointermove","pointerout","pointerover","pointerup","touchend","touchmove","touchstart"];function ql(e){return Bl.includes(e)}const Wl={formnovalidate:"formNoValidate",ismap:"isMap",nomodule:"noModule",playsinline:"playsInline",readonly:"readOnly",defaultvalue:"defaultValue",defaultchecked:"defaultChecked",srcobject:"srcObject",novalidate:"noValidate",allowfullscreen:"allowFullscreen",disablepictureinpicture:"disablePictureInPicture",disableremoteplayback:"disableRemotePlayback"};function Gl(e){return e=e.toLowerCase(),Wl[e]??e}const Vl=["touchstart","touchmove"];function Ul(e){return Vl.includes(e)}const hn=Symbol("events"),is=new Set,ui=new Set;function as(e,t,n,r={}){function i(a){if(r.capture||ci.call(t,a),!a.cancelBubble)return jr(()=>n==null?void 0:n.call(this,a))}return e.startsWith("pointer")||e.startsWith("touch")||e==="wheel"?qt(()=>{t.addEventListener(e,i,r)}):t.addEventListener(e,i,r),i}function _n(e,t,n,r,i){var a={capture:r,passive:i},s=as(e,t,n,a);(t===document.body||t===window||t===document||t instanceof HTMLMediaElement)&&pr(()=>{t.removeEventListener(e,s,a)})}function q(e,t,n){(t[hn]??(t[hn]={}))[e]=n}function Mt(e){for(var t=0;t<e.length;t++)is.add(e[t]);for(var n of ui)n(e)}let Zi=null;function ci(e){var g,b;var t=this,n=t.ownerDocument,r=e.type,i=((g=e.composedPath)==null?void 0:g.call(e))||[],a=i[0]||e.target;Zi=e;var s=0,l=Zi===e&&e[hn];if(l){var c=i.indexOf(l);if(c!==-1&&(t===document||t===window)){e[hn]=t;return}var u=i.indexOf(t);if(u===-1)return;c<=u&&(s=c)}if(a=i[s]||e.target,a!==t){oa(e,"currentTarget",{configurable:!0,get(){return a||n}});var d=Q,h=ee;ct(null),dt(null);try{for(var v,_=[];a!==null;){var f=a.assignedSlot||a.parentNode||a.host||null;try{var y=(b=a[hn])==null?void 0:b[r];y!=null&&(!a.disabled||e.target===a)&&y.call(a,e)}catch(z){v?_.push(z):v=z}if(e.cancelBubble||f===t||f===null)break;a=f}if(v){for(let z of _)queueMicrotask(()=>{throw z});throw v}}finally{e[hn]=t,delete e.currentTarget,ct(d),dt(h)}}}var sa;const Vr=((sa=globalThis==null?void 0:globalThis.window)==null?void 0:sa.trustedTypes)&&globalThis.window.trustedTypes.createPolicy("svelte-trusted-html",{createHTML:e=>e});function Zl(e){return(Vr==null?void 0:Vr.createHTML(e))??e}function ss(e){var t=Ha("template");return t.innerHTML=Zl(e.replaceAll("<!>","<!---->")),t.content}function tr(e,t){var n=ee;n.nodes===null&&(n.nodes={start:e,end:t,a:null,t:null})}function R(e,t){var n=(t&Js)!==0,r=(t&el)!==0,i,a=!e.startsWith("<!>");return()=>{i===void 0&&(i=ss(a?e:"<!>"+e),n||(i=Rn(i)));var s=r||Oa?document.importNode(i,!0):i.cloneNode(!0);if(n){var l=Rn(s),c=s.lastChild;tr(l,c)}else tr(s,s);return s}}function Yl(e,t,n="svg"){var r=!e.startsWith("<!>"),i=`<${n}>${r?e:"<!>"+e}</${n}>`,a;return()=>{if(!a){var s=ss(i),l=Rn(s);a=Rn(l)}var c=a.cloneNode(!0);return tr(c,c),c}}function Kl(e,t){return Yl(e,t,"svg")}function Y(){var e=document.createDocumentFragment(),t=document.createComment(""),n=Wt();return e.append(t,n),tr(t,n),e}function $(e,t){e!==null&&e.before(t)}function me(e,t){var n=t==null?"":typeof t=="object"?`${t}`:t;n!==(e.__t??(e.__t=e.nodeValue))&&(e.__t=n,e.nodeValue=`${n}`)}function Xl(e,t){return Ql(e,t)}const mr=new Map;function Ql(e,{target:t,anchor:n,props:r={},events:i,context:a,intro:s=!0,transformError:l}){Nl();var c=void 0,u=jl(()=>{var d=n??t.appendChild(Wt());gl(d,{pending:()=>{}},_=>{wt({});var f=Ee;a&&(f.c=a),i&&(r.$$events=i),c=e(_,r)||{},yt()},l);var h=new Set,v=_=>{for(var f=0;f<_.length;f++){var y=_[f];if(!h.has(y)){h.add(y);var g=Ul(y);for(const O of[t,document]){var b=mr.get(O);b===void 0&&(b=new Map,mr.set(O,b));var z=b.get(y);z===void 0?(O.addEventListener(y,ci,{passive:g}),b.set(y,1)):b.set(y,z+1)}}}};return v(Tr(is)),ui.add(v),()=>{var g;for(var _ of h)for(const b of[t,document]){var f=mr.get(b),y=f.get(_);--y==0?(b.removeEventListener(_,ci),f.delete(_),f.size===0&&mr.delete(b)):f.set(_,y)}ui.delete(v),d!==n&&((g=d.parentNode)==null||g.removeChild(d))}});return Jl.set(c,u),c}let Jl=new WeakMap;var _t,Ct,et,$n,lr,or,Ar;class Ci{constructor(t,n=!0){vt(this,"anchor");X(this,_t,new Map);X(this,Ct,new Map);X(this,et,new Map);X(this,$n,new Set);X(this,lr,!0);X(this,or,t=>{if(p(this,_t).has(t)){var n=p(this,_t).get(t),r=p(this,Ct).get(n);if(r)Pi(r),p(this,$n).delete(n);else{var i=p(this,et).get(n);i&&(p(this,Ct).set(n,i.effect),p(this,et).delete(n),i.fragment.lastChild.remove(),this.anchor.before(i.fragment),r=i.effect)}for(const[a,s]of p(this,_t)){if(p(this,_t).delete(a),a===t)break;const l=p(this,et).get(s);l&&(je(l.effect),p(this,et).delete(s))}for(const[a,s]of p(this,Ct)){if(a===n||p(this,$n).has(a))continue;const l=()=>{if(Array.from(p(this,_t).values()).includes(a)){var u=document.createDocumentFragment();Ni(s,u),u.append(Wt()),p(this,et).set(a,{effect:s,fragment:u})}else je(s);p(this,$n).delete(a),p(this,Ct).delete(a)};p(this,lr)||!r?(p(this,$n).add(a),wn(s,l,!1)):l()}}});X(this,Ar,t=>{p(this,_t).delete(t);const n=Array.from(p(this,_t).values());for(const[r,i]of p(this,et))n.includes(r)||(je(i.effect),p(this,et).delete(r))});this.anchor=t,ne(this,lr,n)}ensure(t,n){var r=B,i=Da();if(n&&!p(this,Ct).has(t)&&!p(this,et).has(t))if(i){var a=document.createDocumentFragment(),s=Wt();a.append(s),p(this,et).set(t,{effect:Ze(()=>n(s)),fragment:a})}else p(this,Ct).set(t,Ze(()=>n(this.anchor)));if(p(this,_t).set(r,t),i){for(const[l,c]of p(this,Ct))l===t?r.unskip_effect(c):r.skip_effect(c);for(const[l,c]of p(this,et))l===t?r.unskip_effect(c.effect):r.skip_effect(c.effect);r.oncommit(p(this,or)),r.ondiscard(p(this,Ar))}else p(this,or).call(this,r)}}_t=new WeakMap,Ct=new WeakMap,et=new WeakMap,$n=new WeakMap,lr=new WeakMap,or=new WeakMap,Ar=new WeakMap;function xe(e,t,n=!1){var r=new Ci(e),i=n?an:0;function a(s,l){r.ensure(s,l)}hr(()=>{var s=!1;t((l,c=0)=>{s=!0,a(c,l)}),s||a(-1,null)},i)}function bt(e,t){return t}function eo(e,t,n){for(var r=[],i=t.length,a,s=t.length,l=0;l<i;l++){let h=t[l];wn(h,()=>{if(a){if(a.pending.delete(h),a.done.add(h),a.pending.size===0){var v=e.outrogroups;di(e,Tr(a.done)),v.delete(a),v.size===0&&(e.outrogroups=null)}}else s-=1},!1)}if(s===0){var c=r.length===0&&n!==null;if(c){var u=n,d=u.parentNode;Cl(d),d.append(u),e.items.clear()}di(e,t,!c)}else a={pending:new Set(t),done:new Set},(e.outrogroups??(e.outrogroups=new Set)).add(a)}function di(e,t,n=!0){var r;if(e.pending.size>0){r=new Set;for(const s of e.pending.values())for(const l of s)r.add(e.items.get(l).e)}for(var i=0;i<t.length;i++){var a=t[i];if(r!=null&&r.has(a)){a.f|=At;const s=document.createDocumentFragment();Ni(a,s)}else je(t[i],n)}}var Yi;function Be(e,t,n,r,i,a=null){var s=e,l=new Map,c=(t&va)!==0;if(c){var u=e;s=u.appendChild(Wt())}var d=null,h=xi(()=>{var O=n();return hi(O)?O:O==null?[]:Tr(O)}),v,_=new Map,f=!0;function y(O){(z.effect.f&tt)===0&&(z.pending.delete(O),z.fallback=d,to(z,v,s,t,r),d!==null&&(v.length===0?(d.f&At)===0?Pi(d):(d.f^=At,Zn(d,null,s)):wn(d,()=>{d=null})))}function g(O){z.pending.delete(O)}var b=hr(()=>{v=o(h);for(var O=v.length,M=new Set,S=B,j=Da(),P=0;P<O;P+=1){var A=v[P],ie=r(A,P),K=f?null:l.get(ie);K?(K.v&&Ln(K.v,A),K.i&&Ln(K.i,P),j&&S.unskip_effect(K.e)):(K=no(l,f?s:Yi??(Yi=Wt()),A,ie,P,i,t,n),f||(K.e.f|=At),l.set(ie,K)),M.add(ie)}if(O===0&&a&&!d&&(f?d=Ze(()=>a(s)):(d=Ze(()=>a(Yi??(Yi=Wt()))),d.f|=At)),O>M.size&&Is(),!f)if(_.set(S,M),j){for(const[N,L]of l)M.has(N)||S.skip_effect(L.e);S.oncommit(y),S.ondiscard(g)}else y(S);o(h)}),z={effect:b,items:l,pending:_,outrogroups:null,fallback:d};f=!1}function Gn(e){for(;e!==null&&(e.f&mt)===0;)e=e.next;return e}function to(e,t,n,r,i){var K,N,L,I,U,de,H,F,ve;var a=(r&Us)!==0,s=t.length,l=e.items,c=Gn(e.effect.first),u,d=null,h,v=[],_=[],f,y,g,b;if(a)for(b=0;b<s;b+=1)f=t[b],y=i(f,b),g=l.get(y).e,(g.f&At)===0&&((N=(K=g.nodes)==null?void 0:K.a)==null||N.measure(),(h??(h=new Set)).add(g));for(b=0;b<s;b+=1){if(f=t[b],y=i(f,b),g=l.get(y).e,e.outrogroups!==null)for(const fe of e.outrogroups)fe.pending.delete(g),fe.done.delete(g);if((g.f&Ye)!==0&&(Pi(g),a&&((I=(L=g.nodes)==null?void 0:L.a)==null||I.unfix(),(h??(h=new Set)).delete(g))),(g.f&At)!==0)if(g.f^=At,g===c)Zn(g,null,n);else{var z=d?d.next:c;g===e.effect.last&&(e.effect.last=g.prev),g.prev&&(g.prev.next=g.next),g.next&&(g.next.prev=g.prev),Kt(e,d,g),Kt(e,g,z),Zn(g,z,n),d=g,v=[],_=[],c=Gn(d.next);continue}if(g!==c){if(u!==void 0&&u.has(g)){if(v.length<_.length){var O=_[0],M;d=O.prev;var S=v[0],j=v[v.length-1];for(M=0;M<v.length;M+=1)Zn(v[M],O,n);for(M=0;M<_.length;M+=1)u.delete(_[M]);Kt(e,S.prev,j.next),Kt(e,d,S),Kt(e,j,O),c=O,d=j,b-=1,v=[],_=[]}else u.delete(g),Zn(g,c,n),Kt(e,g.prev,g.next),Kt(e,g,d===null?e.effect.first:d.next),Kt(e,d,g),d=g;continue}for(v=[],_=[];c!==null&&c!==g;)(u??(u=new Set)).add(c),_.push(c),c=Gn(c.next);if(c===null)continue}(g.f&At)===0&&v.push(g),d=g,c=Gn(g.next)}if(e.outrogroups!==null){for(const fe of e.outrogroups)fe.pending.size===0&&(di(e,Tr(fe.done)),(U=e.outrogroups)==null||U.delete(fe));e.outrogroups.size===0&&(e.outrogroups=null)}if(c!==null||u!==void 0){var P=[];if(u!==void 0)for(g of u)(g.f&Ye)===0&&P.push(g);for(;c!==null;)(c.f&Ye)===0&&c!==e.fallback&&P.push(c),c=Gn(c.next);var A=P.length;if(A>0){var ie=(r&va)!==0&&s===0?n:null;if(a){for(b=0;b<A;b+=1)(H=(de=P[b].nodes)==null?void 0:de.a)==null||H.measure();for(b=0;b<A;b+=1)(ve=(F=P[b].nodes)==null?void 0:F.a)==null||ve.fix()}eo(e,P,ie)}}a&&qt(()=>{var fe,Le;if(h!==void 0)for(g of h)(Le=(fe=g.nodes)==null?void 0:fe.a)==null||Le.apply()})}function no(e,t,n,r,i,a,s,l){var c=(s&Gs)!==0?(s&Zs)===0?ja(n,!1,!1):sn(n):null,u=(s&Vs)!==0?sn(i):null;return{v:c,i:u,e:Ze(()=>(a(t,c??n,u??i,l),()=>{e.delete(r)}))}}function Zn(e,t,n){if(e.nodes)for(var r=e.nodes.start,i=e.nodes.end,a=t&&(t.f&At)===0?t.nodes.start:n;r!==null;){var s=vr(r);if(a.before(r),r===i)return;r=s}}function Kt(e,t,n){t===null?e.effect.first=n:t.next=n,n===null?e.effect.last=t:n.prev=t}function re(e,t,n,r,i){var l;var a=(l=t.$$slots)==null?void 0:l[n],s=!1;a===!0&&(a=t.children,s=!0),a===void 0||a(e,s?()=>r:r)}function fi(e,t,n){var r=new Ci(e);hr(()=>{var i=t()??null;r.ensure(i,i&&(a=>n(a,i)))},an)}function ro(e,t,n,r,i,a){var s=null,l=e,c=new Ci(l,!1);hr(()=>{const u=t()||null;var d=tl;if(u===null){c.ensure(null,null);return}return c.ensure(u,h=>{if(u){if(s=Ha(u,d),tr(s,s),r){var v=s.appendChild(Wt());r(s,v)}ee.nodes.end=s,h.before(s)}}),()=>{}},an),pr(()=>{})}function io(e,t){var n=void 0,r;Va(()=>{n!==(n=t())&&(r&&(je(r),r=null),n&&(r=Ze(()=>{ki(()=>n(e))})))})}function ls(e){var t,n,r="";if(typeof e=="string"||typeof e=="number")r+=e;else if(typeof e=="object")if(Array.isArray(e)){var i=e.length;for(t=0;t<i;t++)e[t]&&(n=ls(e[t]))&&(r&&(r+=" "),r+=n)}else for(n in e)e[n]&&(r&&(r+=" "),r+=n);return r}function ao(){for(var e,t,n=0,r="",i=arguments.length;n<i;n++)(e=arguments[n])&&(t=ls(e))&&(r&&(r+=" "),r+=t);return r}function so(e){return typeof e=="object"?ao(e):e??""}const Ki=[...` 	
\r\f \v\uFEFF`];function lo(e,t,n){var r=e==null?"":""+e;if(t&&(r=r?r+" "+t:t),n){for(var i of Object.keys(n))if(n[i])r=r?r+" "+i:i;else if(r.length)for(var a=i.length,s=0;(s=r.indexOf(i,s))>=0;){var l=s+a;(s===0||Ki.includes(r[s-1]))&&(l===r.length||Ki.includes(r[l]))?r=(s===0?"":r.substring(0,s))+r.substring(l+1):s=l}}return r===""?null:r}function Xi(e,t=!1){var n=t?" !important;":";",r="";for(var i of Object.keys(e)){var a=e[i];a!=null&&a!==""&&(r+=" "+i+": "+a+n)}return r}function Ur(e){return e[0]!=="-"||e[1]!=="-"?e.toLowerCase():e}function oo(e,t){if(t){var n="",r,i;if(Array.isArray(t)?(r=t[0],i=t[1]):r=t,e){e=String(e).replaceAll(/\s*\/\*.*?\*\/\s*/g,"").trim();var a=!1,s=0,l=!1,c=[];r&&c.push(...Object.keys(r).map(Ur)),i&&c.push(...Object.keys(i).map(Ur));var u=0,d=-1;const y=e.length;for(var h=0;h<y;h++){var v=e[h];if(l?v==="/"&&e[h-1]==="*"&&(l=!1):a?a===v&&(a=!1):v==="/"&&e[h+1]==="*"?l=!0:v==='"'||v==="'"?a=v:v==="("?s++:v===")"&&s--,!l&&a===!1&&s===0){if(v===":"&&d===-1)d=h;else if(v===";"||h===y-1){if(d!==-1){var _=Ur(e.substring(u,d).trim());if(!c.includes(_)){v!==";"&&h++;var f=e.substring(u,h).trim();n+=" "+f+";"}}u=h+1,d=-1}}}}return r&&(n+=Xi(r)),i&&(n+=Xi(i,!0)),n=n.trim(),n===""?null:n}return e==null?null:String(e)}function qe(e,t,n,r,i,a){var s=e.__className;if(s!==n||s===void 0){var l=lo(n,r,a);l==null?e.removeAttribute("class"):t?e.className=l:e.setAttribute("class",l),e.__className=n}else if(a&&i!==a)for(var c in a){var u=!!a[c];(i==null||u!==!!i[c])&&e.classList.toggle(c,u)}return a}function Zr(e,t={},n,r){for(var i in n){var a=n[i];t[i]!==a&&(n[i]==null?e.style.removeProperty(i):e.style.setProperty(i,a,r))}}function Fe(e,t,n,r){var i=e.__style;if(i!==t){var a=oo(t,r);a==null?e.removeAttribute("style"):e.style.cssText=a,e.__style=t}else r&&(Array.isArray(r)?(Zr(e,n==null?void 0:n[0],r[0]),Zr(e,n==null?void 0:n[1],r[1],"important")):Zr(e,n,r));return r}function nr(e,t,n=!1){if(e.multiple){if(t==null)return;if(!hi(t))return rl();for(var r of e.options)r.selected=t.includes(Xn(r));return}for(r of e.options){var i=Xn(r);if(Pl(i,t)){r.selected=!0;return}}(!n||t!==void 0)&&(e.selectedIndex=-1)}function Ai(e){var t=new MutationObserver(()=>{nr(e,e.__value)});t.observe(e,{childList:!0,subtree:!0,attributes:!0,attributeFilter:["value"]}),pr(()=>{t.disconnect()})}function Yr(e,t,n=t){var r=new WeakSet,i=!0;Ba(e,"change",a=>{var s=a?"[selected]":":checked",l;if(e.multiple)l=[].map.call(e.querySelectorAll(s),Xn);else{var c=e.querySelector(s)??e.querySelector("option:not([disabled])");l=c&&Xn(c)}n(l),e.__value=l,B!==null&&r.add(B)}),ki(()=>{var a=t();if(e===document.activeElement){var s=B;if(r.has(s))return}if(nr(e,a,i),i&&a===void 0){var l=e.querySelector(":checked");l!==null&&(a=Xn(l),n(a))}e.__value=a,i=!1}),Ai(e)}function Xn(e){return"__value"in e?e.__value:e.value}const Vn=Symbol("class"),Un=Symbol("style"),os=Symbol("is custom element"),us=Symbol("is html"),uo=bi?"option":"OPTION",co=bi?"select":"SELECT",fo=bi?"progress":"PROGRESS";function fn(e,t){var n=Ti(e);n.value===(n.value=t??void 0)||e.value===t&&(t!==0||e.nodeName!==fo)||(e.value=t??"")}function vo(e,t){t?e.hasAttribute("selected")||e.setAttribute("selected",""):e.removeAttribute("selected")}function $t(e,t,n,r){var i=Ti(e);i[t]!==(i[t]=n)&&(t==="loading"&&(e[zs]=n),n==null?e.removeAttribute(t):typeof n!="string"&&cs(e).includes(t)?e[t]=n:e.setAttribute(t,n))}function po(e,t,n,r,i=!1,a=!1){var s=Ti(e),l=s[os],c=!s[us],u=t||{},d=e.nodeName===uo;for(var h in t)h in n||(n[h]=null);n.class?n.class=so(n.class):n[Vn]&&(n.class=null),n[Un]&&(n.style??(n.style=null));var v=cs(e);for(const M in n){let S=n[M];if(d&&M==="value"&&S==null){e.value=e.__value="",u[M]=S;continue}if(M==="class"){var _=e.namespaceURI==="http://www.w3.org/1999/xhtml";qe(e,_,S,r,t==null?void 0:t[Vn],n[Vn]),u[M]=S,u[Vn]=n[Vn];continue}if(M==="style"){Fe(e,S,t==null?void 0:t[Un],n[Un]),u[M]=S,u[Un]=n[Un];continue}var f=u[M];if(!(S===f&&!(S===void 0&&e.hasAttribute(M)))){u[M]=S;var y=M[0]+M[1];if(y!=="$$")if(y==="on"){const j={},P="$$"+M;let A=M.slice(2);var g=ql(A);if(Fl(A)&&(A=A.slice(0,-7),j.capture=!0),!g&&f){if(S!=null)continue;e.removeEventListener(A,u[P],j),u[P]=null}if(g)q(A,e,S),Mt([A]);else if(S!=null){let ie=function(K){u[M].call(this,K)};var O=ie;u[P]=as(A,e,ie,j)}}else if(M==="style")$t(e,M,S);else if(M==="autofocus")Fa(e,!!S);else if(!l&&(M==="__value"||M==="value"&&S!=null))e.value=e.__value=S;else if(M==="selected"&&d)vo(e,S);else{var b=M;c||(b=Gl(b));var z=b==="defaultValue"||b==="defaultChecked";if(S==null&&!l&&!z)if(s[M]=null,b==="value"||b==="checked"){let j=e;const P=t===void 0;if(b==="value"){let A=j.defaultValue;j.removeAttribute(b),j.defaultValue=A,j.value=j.__value=P?A:null}else{let A=j.defaultChecked;j.removeAttribute(b),j.defaultChecked=A,j.checked=P?A:!1}}else e.removeAttribute(M);else z||v.includes(b)&&(l||typeof S!="string")?(e[b]=S,b in s&&(s[b]=ke)):typeof S!="function"&&$t(e,b,S)}}}return u}function Qi(e,t,n=[],r=[],i=[],a,s=!1,l=!1){Na(i,n,r,c=>{var u=void 0,d={},h=e.nodeName===co,v=!1;if(Va(()=>{var f=t(...c.map(o)),y=po(e,u,f,a,s,l);v&&h&&"value"in f&&nr(e,f.value);for(let b of Object.getOwnPropertySymbols(d))f[b]||je(d[b]);for(let b of Object.getOwnPropertySymbols(f)){var g=f[b];b.description===nl&&(!u||g!==u[b])&&(d[b]&&je(d[b]),d[b]=Ze(()=>io(e,()=>g))),y[b]=g}u=y}),h){var _=e;ki(()=>{nr(_,u.value,!0),Ai(_)})}v=!0})}function Ti(e){return e.__attributes??(e.__attributes={[os]:e.nodeName.includes("-"),[us]:e.namespaceURI===ha})}var Ji=new Map;function cs(e){var t=e.getAttribute("is")||e.nodeName,n=Ji.get(t);if(n)return n;Ji.set(t,n=[]);for(var r,i=e,a=Element.prototype;a!==i;){r=ua(i);for(var s in r)r[s].set&&n.push(s);i=_i(i)}return n}function ho(e,t,n=t){var r=new WeakSet;Ba(e,"input",async i=>{var a=i?e.defaultValue:e.value;if(a=Kr(e)?Xr(a):a,n(a),B!==null&&r.add(B),await Hl(),a!==(a=t())){var s=e.selectionStart,l=e.selectionEnd,c=e.value.length;if(e.value=a??"",l!==null){var u=e.value.length;s===l&&l===c&&u>c?(e.selectionStart=u,e.selectionEnd=u):(e.selectionStart=s,e.selectionEnd=Math.min(l,u))}}}),kn(t)==null&&e.value&&(n(Kr(e)?Xr(e.value):e.value),B!==null&&r.add(B)),Ga(()=>{var i=t();if(e===document.activeElement){var a=B;if(r.has(a))return}Kr(e)&&i===Xr(e.value)||e.type==="date"&&!i&&!e.value||i!==e.value&&(e.value=i??"")})}function Kr(e){var t=e.type;return t==="number"||t==="range"}function Xr(e){return e===""?null:+e}function _o(e=!1){const t=Ee,n=t.l.u;if(!n)return;let r=()=>dn(t.s);if(e){let i=0,a={};const s=fr(()=>{let l=!1;const c=t.s;for(const u in c)c[u]!==a[u]&&(a[u]=c[u],l=!0);return l&&i++,i});r=()=>o(s)}n.b.length&&zl(()=>{ea(t,r),kr(n.b)}),Jn(()=>{const i=kn(()=>n.m.map(Cs));return()=>{for(const a of i)typeof a=="function"&&a()}}),n.a.length&&Jn(()=>{ea(t,r),kr(n.a)})}function ea(e,t){if(e.l.s)for(const n of e.l.s)o(n);t()}const go={get(e,t){if(!e.exclude.includes(t))return o(e.version),t in e.special?e.special[t]():e.props[t]},set(e,t,n){if(!(t in e.special)){var r=ee;try{dt(e.parent_effect),e.special[t]=De({get[t](){return e.props[t]}},t,pa)}finally{dt(r)}}return e.special[t](n),qi(e.version),!0},getOwnPropertyDescriptor(e,t){if(!e.exclude.includes(t)&&t in e.props)return{enumerable:!0,configurable:!0,value:e.props[t]}},deleteProperty(e,t){return e.exclude.includes(t)||(e.exclude.push(t),qi(e.version)),!0},has(e,t){return e.exclude.includes(t)?!1:t in e.props},ownKeys(e){return Reflect.ownKeys(e.props).filter(t=>!e.exclude.includes(t))}};function te(e,t){return new Proxy({props:e,exclude:t,special:{},version:sn(0),parent_effect:ee},go)}const bo={get(e,t){let n=e.props.length;for(;n--;){let r=e.props[n];if(Wn(r)&&(r=r()),typeof r=="object"&&r!==null&&t in r)return r[t]}},set(e,t,n){let r=e.props.length;for(;r--;){let i=e.props[r];Wn(i)&&(i=i());const a=tn(i,t);if(a&&a.set)return a.set(n),!0}return!1},getOwnPropertyDescriptor(e,t){let n=e.props.length;for(;n--;){let r=e.props[n];if(Wn(r)&&(r=r()),typeof r=="object"&&r!==null&&t in r){const i=tn(r,t);return i&&!i.configurable&&(i.configurable=!0),i}}},has(e,t){if(t===Bt||t===fa)return!1;for(let n of e.props)if(Wn(n)&&(n=n()),n!=null&&t in n)return!0;return!1},ownKeys(e){const t=[];for(let n of e.props)if(Wn(n)&&(n=n()),!!n){for(const r in n)t.includes(r)||t.push(r);for(const r of Object.getOwnPropertySymbols(n))t.includes(r)||t.push(r)}return t}};function se(...e){return new Proxy({props:e},bo)}function De(e,t,n,r){var O;var i=!cr||(n&Ks)!==0,a=(n&Xs)!==0,s=(n&Qs)!==0,l=r,c=!0,u=()=>(c&&(c=!1,l=s?kn(r):r),l);let d;if(a){var h=Bt in e||fa in e;d=((O=tn(e,t))==null?void 0:O.set)??(h&&t in e?M=>e[t]=M:void 0)}var v,_=!1;a?[v,_]=dl(()=>e[t]):v=e[t],v===void 0&&r!==void 0&&(v=u(),d&&(i&&Hs(),d(v)));var f;if(i?f=()=>{var M=e[t];return M===void 0?u():(c=!0,M)}:f=()=>{var M=e[t];return M!==void 0&&(l=void 0),M===void 0?l:M},i&&(n&pa)===0)return f;if(d){var y=e.$$legacy;return(function(M,S){return arguments.length>0?((!i||!S||y||_)&&d(S?f():M),M):f()})}var g=!1,b=((n&Ys)!==0?fr:xi)(()=>(g=!1,f()));a&&o(b);var z=ee;return(function(M,S){if(arguments.length>0){const j=S?o(b):i&&a?Tt(M):M;return C(b,j),g=!0,l!==void 0&&(l=j),M}return ln&&g||(z.f&tt)!==0?b.v:o(b)})}const mo="5";var la;typeof window<"u"&&((la=window.__svelte??(window.__svelte={})).v??(la.v=new Set)).add(mo);let $o=1;function wo(e=null){const t=$o++;return{id:t,name:e??`Untitled ${t}`,width:600,height:400,bgColour:"333333",bgMode:"solid",gridEnabled:!0,gridSize:10,snapToGrid:!0,modified:!1,controls:[]}}const yo=Fn(null),Xt=Fn(100),ta=Fn(10),Vt=Fn([]),jt=Fn(null),xo=cl([Vt,jt],([e,t])=>e.find(n=>n.id===t)??null);function ds(e=null){const t=e??wo();return Vt.update(n=>[...n,t]),jt.set(t.id),t}function vi(e){Vt.update(t=>{const n=t.findIndex(i=>i.id===e),r=t.filter(i=>i.id!==e);return jt.update(i=>{if(i!==e)return i;if(r.length===0)return null;const a=Math.min(n,r.length-1);return r[a].id}),r})}function Mo(e){jt.set(e)}function Pr(e,t){Vt.update(n=>n.map(r=>r.id===e?{...r,...t}:r))}var So=R('<div class="dropdown-separator svelte-ilvwri"></div>'),ko=R('<span class="item-shortcut svelte-ilvwri"> </span>'),Eo=R('<button class="dropdown-item svelte-ilvwri"><span class="item-label svelte-ilvwri"> </span> <!></button>'),Po=R('<div class="dropdown svelte-ilvwri"></div>'),No=R('<div class="menu-wrapper svelte-ilvwri"><button> </button> <!></div>'),Co=R('<nav class="menubar svelte-ilvwri"><div class="app-icon svelte-ilvwri" title="CEditor"></div> <!></nav>');function Ao(e,t){wt(t,!0);const n={File:[{label:"New Panel",shortcut:"Ctrl+N",action:()=>ds()},{label:"Open Panel",shortcut:"Ctrl+O",action:()=>{}},{type:"separator"},{label:"Save",shortcut:"Ctrl+S",action:()=>{}},{label:"Save As...",shortcut:"Ctrl+Shift+S",action:()=>{}},{type:"separator"},{label:"Close Panel",shortcut:"Ctrl+W",action:()=>{const h=xa(jt);h!=null&&vi(h)}}],Edit:[{label:"Undo",shortcut:"Ctrl+Z",action:()=>{}},{label:"Redo",shortcut:"Ctrl+Y",action:()=>{}},{type:"separator"},{label:"Cut",shortcut:"Ctrl+X",action:()=>{}},{label:"Copy",shortcut:"Ctrl+C",action:()=>{}},{label:"Paste",shortcut:"Ctrl+V",action:()=>{}},{type:"separator"},{label:"Select All",shortcut:"Ctrl+A",action:()=>{}}],View:[{label:"Zoom In",shortcut:"Ctrl++",action:()=>{}},{label:"Zoom Out",shortcut:"Ctrl+-",action:()=>{}},{label:"Fit to Window",shortcut:"Ctrl+0",action:()=>{}},{type:"separator"},{label:"Toggle Grid",action:()=>{}},{label:"Toggle Snap",action:()=>{}}],Insert:[{label:"Button",action:()=>{}},{label:"Label",action:()=>{}},{label:"Slider",action:()=>{}},{label:"ComboBox",action:()=>{}},{label:"Backdrop",action:()=>{}},{label:"Grid",action:()=>{}},{label:"Envelope",action:()=>{}},{label:"Filter",action:()=>{}}],Panel:[{label:"Panel Properties...",action:()=>{}},{label:"Export Settings...",action:()=>{}}],Build:[{label:"Build VST3",action:()=>{}},{label:"Build Standalone",action:()=>{}},{type:"separator"},{label:"Build Settings...",action:()=>{}}],Help:[{label:"Documentation",action:()=>{}},{label:"About CEditor",action:()=>{}}]},r=Object.keys(n);let i=J(null);function a(h){C(i,o(i)===h?null:h,!0)}function s(h){h.action&&h.action(),C(i,null)}function l(h){o(i)&&!h.target.closest(".menubar")&&C(i,null)}function c(h){o(i)!==null&&C(i,h,!0)}var u=Co();_n("click",Qn,l);var d=w(m(u),2);Be(d,17,()=>r,bt,(h,v)=>{var _=No(),f=m(_);let y;var g=m(f),b=w(f,2);{var z=O=>{var M=Po();Be(M,21,()=>n[o(v)],bt,(S,j)=>{var P=Y(),A=V(P);{var ie=N=>{var L=So();$(N,L)},K=N=>{var L=Eo(),I=m(L),U=m(I),de=w(I,2);{var H=F=>{var ve=ko(),fe=m(ve);ue(()=>me(fe,o(j).shortcut)),$(F,ve)};xe(de,F=>{o(j).shortcut&&F(H)})}ue(()=>me(U,o(j).label)),q("click",L,()=>s(o(j))),$(N,L)};xe(A,N=>{o(j).type==="separator"?N(ie):N(K,-1)})}$(S,P)}),$(O,M)};xe(b,O=>{o(i)===o(v)&&O(z)})}ue(()=>{y=qe(f,1,"menu-item svelte-ilvwri",null,y,{active:o(i)===o(v)}),me(g,o(v))}),q("click",f,()=>a(o(v))),_n("mouseenter",f,()=>c(o(v))),$(h,_)}),$(e,u),yt()}Mt(["click"]);sl();/**
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
 */const To={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":2,"stroke-linecap":"round","stroke-linejoin":"round"};/**
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
 */const zo=e=>{for(const t in e)if(t.startsWith("aria-")||t==="role"||t==="title")return!0;return!1};/**
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
 */const na=(...e)=>e.filter((t,n,r)=>!!t&&t.trim()!==""&&r.indexOf(t)===n).join(" ").trim();var jo=Kl("<svg><!><!></svg>");function le(e,t){const n=te(t,["children","$$slots","$$events","$$legacy"]),r=te(n,["name","color","size","strokeWidth","absoluteStrokeWidth","iconNode"]);wt(t,!1);let i=De(t,"name",8,void 0),a=De(t,"color",8,"currentColor"),s=De(t,"size",8,24),l=De(t,"strokeWidth",8,2),c=De(t,"absoluteStrokeWidth",8,!1),u=De(t,"iconNode",24,()=>[]);_o();var d=jo();Qi(d,(_,f,y)=>({...To,..._,...r,width:s(),height:s(),stroke:a(),"stroke-width":f,class:y}),[()=>zo(r)?void 0:{"aria-hidden":"true"},()=>(dn(c()),dn(l()),dn(s()),kn(()=>c()?Number(l())*24/Number(s()):l())),()=>(dn(na),dn(i()),dn(n),kn(()=>na("lucide-icon","lucide",i()?`lucide-${i()}`:"",n.class)))]);var h=m(d);Be(h,1,u,bt,(_,f)=>{var y=G(()=>As(o(f),2));let g=()=>o(y)[0],b=()=>o(y)[1];var z=Y(),O=V(z);ro(O,g,!0,(M,S)=>{Qi(M,()=>({...b()}))}),$(_,z)});var v=w(h);re(v,t,"default",{}),$(e,d),yt()}function Io(e,t){const n=te(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const r=[["path",{d:"M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"}]];le(e,se({name:"activity"},()=>n,{get iconNode(){return r},children:(i,a)=>{var s=Y(),l=V(s);re(l,t,"default",{}),$(i,s)},$$slots:{default:!0}}))}function Oo(e,t){const n=te(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const r=[["path",{d:"M2 10v3"}],["path",{d:"M6 6v11"}],["path",{d:"M10 3v18"}],["path",{d:"M14 8v7"}],["path",{d:"M18 5v13"}],["path",{d:"M22 10v3"}]];le(e,se({name:"audio-lines"},()=>n,{get iconNode(){return r},children:(i,a)=>{var s=Y(),l=V(s);re(l,t,"default",{}),$(i,s)},$$slots:{default:!0}}))}function Lo(e,t){const n=te(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const r=[["path",{d:"M20 6 9 17l-5-5"}]];le(e,se({name:"check"},()=>n,{get iconNode(){return r},children:(i,a)=>{var s=Y(),l=V(s);re(l,t,"default",{}),$(i,s)},$$slots:{default:!0}}))}function fs(e,t){const n=te(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const r=[["path",{d:"m6 9 6 6 6-6"}]];le(e,se({name:"chevron-down"},()=>n,{get iconNode(){return r},children:(i,a)=>{var s=Y(),l=V(s);re(l,t,"default",{}),$(i,s)},$$slots:{default:!0}}))}function Ro(e,t){const n=te(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const r=[["path",{d:"m9 18 6-6-6-6"}]];le(e,se({name:"chevron-right"},()=>n,{get iconNode(){return r},children:(i,a)=>{var s=Y(),l=V(s);re(l,t,"default",{}),$(i,s)},$$slots:{default:!0}}))}function Do(e,t){const n=te(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const r=[["rect",{width:"14",height:"14",x:"8",y:"8",rx:"2",ry:"2"}],["path",{d:"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"}]];le(e,se({name:"copy"},()=>n,{get iconNode(){return r},children:(i,a)=>{var s=Y(),l=V(s);re(l,t,"default",{}),$(i,s)},$$slots:{default:!0}}))}function Ho(e,t){const n=te(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const r=[["circle",{cx:"12",cy:"12",r:"10"}],["line",{x1:"22",x2:"18",y1:"12",y2:"12"}],["line",{x1:"6",x2:"2",y1:"12",y2:"12"}],["line",{x1:"12",x2:"12",y1:"6",y2:"2"}],["line",{x1:"12",x2:"12",y1:"22",y2:"18"}]];le(e,se({name:"crosshair"},()=>n,{get iconNode(){return r},children:(i,a)=>{var s=Y(),l=V(s);re(l,t,"default",{}),$(i,s)},$$slots:{default:!0}}))}function Fo(e,t){const n=te(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const r=[["path",{d:"M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"}],["path",{d:"M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"}]];le(e,se({name:"droplets"},()=>n,{get iconNode(){return r},children:(i,a)=>{var s=Y(),l=V(s);re(l,t,"default",{}),$(i,s)},$$slots:{default:!0}}))}function Bo(e,t){const n=te(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const r=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2"}],["path",{d:"M3 9h18"}],["path",{d:"M3 15h18"}],["path",{d:"M9 3v18"}],["path",{d:"M15 3v18"}]];le(e,se({name:"grid-3x3"},()=>n,{get iconNode(){return r},children:(i,a)=>{var s=Y(),l=V(s);re(l,t,"default",{}),$(i,s)},$$slots:{default:!0}}))}function qo(e,t){const n=te(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const r=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",ry:"2"}],["circle",{cx:"9",cy:"9",r:"2"}],["path",{d:"m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"}]];le(e,se({name:"image"},()=>n,{get iconNode(){return r},children:(i,a)=>{var s=Y(),l=V(s);re(l,t,"default",{}),$(i,s)},$$slots:{default:!0}}))}function Wo(e,t){const n=te(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const r=[["path",{d:"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"}],["path",{d:"M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"}],["path",{d:"M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"}]];le(e,se({name:"layers"},()=>n,{get iconNode(){return r},children:(i,a)=>{var s=Y(),l=V(s);re(l,t,"default",{}),$(i,s)},$$slots:{default:!0}}))}function Go(e,t){const n=te(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const r=[["rect",{width:"7",height:"9",x:"3",y:"3",rx:"1"}],["rect",{width:"7",height:"5",x:"14",y:"3",rx:"1"}],["rect",{width:"7",height:"9",x:"14",y:"12",rx:"1"}],["rect",{width:"7",height:"5",x:"3",y:"16",rx:"1"}]];le(e,se({name:"layout-dashboard"},()=>n,{get iconNode(){return r},children:(i,a)=>{var s=Y(),l=V(s);re(l,t,"default",{}),$(i,s)},$$slots:{default:!0}}))}function Vo(e,t){const n=te(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const r=[["rect",{width:"7",height:"7",x:"3",y:"3",rx:"1"}],["rect",{width:"7",height:"7",x:"14",y:"3",rx:"1"}],["rect",{width:"7",height:"7",x:"14",y:"14",rx:"1"}],["rect",{width:"7",height:"7",x:"3",y:"14",rx:"1"}]];le(e,se({name:"layout-grid"},()=>n,{get iconNode(){return r},children:(i,a)=>{var s=Y(),l=V(s);re(l,t,"default",{}),$(i,s)},$$slots:{default:!0}}))}function Uo(e,t){const n=te(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const r=[["path",{d:"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"}],["path",{d:"M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"}]];le(e,se({name:"link"},()=>n,{get iconNode(){return r},children:(i,a)=>{var s=Y(),l=V(s);re(l,t,"default",{}),$(i,s)},$$slots:{default:!0}}))}function Zo(e,t){const n=te(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const r=[["path",{d:"M8 3H5a2 2 0 0 0-2 2v3"}],["path",{d:"M21 8V5a2 2 0 0 0-2-2h-3"}],["path",{d:"M3 16v3a2 2 0 0 0 2 2h3"}],["path",{d:"M16 21h3a2 2 0 0 0 2-2v-3"}]];le(e,se({name:"maximize"},()=>n,{get iconNode(){return r},children:(i,a)=>{var s=Y(),l=V(s);re(l,t,"default",{}),$(i,s)},$$slots:{default:!0}}))}function Yo(e,t){const n=te(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const r=[["rect",{width:"20",height:"14",x:"2",y:"3",rx:"2"}],["line",{x1:"8",x2:"16",y1:"21",y2:"21"}],["line",{x1:"12",x2:"12",y1:"17",y2:"21"}]];le(e,se({name:"monitor"},()=>n,{get iconNode(){return r},children:(i,a)=>{var s=Y(),l=V(s);re(l,t,"default",{}),$(i,s)},$$slots:{default:!0}}))}function Ko(e,t){const n=te(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const r=[["path",{d:"M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"}]];le(e,se({name:"moon"},()=>n,{get iconNode(){return r},children:(i,a)=>{var s=Y(),l=V(s);re(l,t,"default",{}),$(i,s)},$$slots:{default:!0}}))}function Xo(e,t){const n=te(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const r=[["path",{d:"M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z"}]];le(e,se({name:"mouse-pointer-2"},()=>n,{get iconNode(){return r},children:(i,a)=>{var s=Y(),l=V(s);re(l,t,"default",{}),$(i,s)},$$slots:{default:!0}}))}function Qo(e,t){const n=te(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const r=[["path",{d:"M12 2v20"}],["path",{d:"m15 19-3 3-3-3"}],["path",{d:"m19 9 3 3-3 3"}],["path",{d:"M2 12h20"}],["path",{d:"m5 9-3 3 3 3"}],["path",{d:"m9 5 3-3 3 3"}]];le(e,se({name:"move"},()=>n,{get iconNode(){return r},children:(i,a)=>{var s=Y(),l=V(s);re(l,t,"default",{}),$(i,s)},$$slots:{default:!0}}))}function ra(e,t){const n=te(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const r=[["path",{d:"m14.622 17.897-10.68-2.913"}],["path",{d:"M18.376 2.622a1 1 0 1 1 3.002 3.002L17.36 9.643a.5.5 0 0 0 0 .707l.944.944a2.41 2.41 0 0 1 0 3.408l-.944.944a.5.5 0 0 1-.707 0L8.354 7.348a.5.5 0 0 1 0-.707l.944-.944a2.41 2.41 0 0 1 3.408 0l.944.944a.5.5 0 0 0 .707 0z"}],["path",{d:"M9 8c-1.804 2.71-3.97 3.46-6.583 3.948a.507.507 0 0 0-.302.819l7.32 8.883a1 1 0 0 0 1.185.204C12.735 20.405 16 16.792 16 15"}]];le(e,se({name:"paintbrush"},()=>n,{get iconNode(){return r},children:(i,a)=>{var s=Y(),l=V(s);re(l,t,"default",{}),$(i,s)},$$slots:{default:!0}}))}function Jo(e,t){const n=te(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const r=[["path",{d:"M5 12h14"}],["path",{d:"M12 5v14"}]];le(e,se({name:"plus"},()=>n,{get iconNode(){return r},children:(i,a)=>{var s=Y(),l=V(s);re(l,t,"default",{}),$(i,s)},$$slots:{default:!0}}))}function eu(e,t){const n=te(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const r=[["rect",{width:"20",height:"12",x:"2",y:"6",rx:"2"}]];le(e,se({name:"rectangle-horizontal"},()=>n,{get iconNode(){return r},children:(i,a)=>{var s=Y(),l=V(s);re(l,t,"default",{}),$(i,s)},$$slots:{default:!0}}))}function tu(e,t){const n=te(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const r=[["path",{d:"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"}],["path",{d:"M3 3v5h5"}]];le(e,se({name:"rotate-ccw"},()=>n,{get iconNode(){return r},children:(i,a)=>{var s=Y(),l=V(s);re(l,t,"default",{}),$(i,s)},$$slots:{default:!0}}))}function nu(e,t){const n=te(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const r=[["path",{d:"M14 17H5"}],["path",{d:"M19 7h-9"}],["circle",{cx:"17",cy:"17",r:"3"}],["circle",{cx:"7",cy:"7",r:"3"}]];le(e,se({name:"settings-2"},()=>n,{get iconNode(){return r},children:(i,a)=>{var s=Y(),l=V(s);re(l,t,"default",{}),$(i,s)},$$slots:{default:!0}}))}function ru(e,t){const n=te(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const r=[["path",{d:"M10 5H3"}],["path",{d:"M12 19H3"}],["path",{d:"M14 3v4"}],["path",{d:"M16 17v4"}],["path",{d:"M21 12h-9"}],["path",{d:"M21 19h-5"}],["path",{d:"M21 5h-7"}],["path",{d:"M8 10v4"}],["path",{d:"M8 12H3"}]];le(e,se({name:"sliders-horizontal"},()=>n,{get iconNode(){return r},children:(i,a)=>{var s=Y(),l=V(s);re(l,t,"default",{}),$(i,s)},$$slots:{default:!0}}))}function iu(e,t){const n=te(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const r=[["path",{d:"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"}],["path",{d:"M20 2v4"}],["path",{d:"M22 4h-4"}],["circle",{cx:"4",cy:"20",r:"2"}]];le(e,se({name:"sparkles"},()=>n,{get iconNode(){return r},children:(i,a)=>{var s=Y(),l=V(s);re(l,t,"default",{}),$(i,s)},$$slots:{default:!0}}))}function au(e,t){const n=te(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const r=[["path",{d:"M5 3a2 2 0 0 0-2 2"}],["path",{d:"M19 3a2 2 0 0 1 2 2"}],["path",{d:"M21 19a2 2 0 0 1-2 2"}],["path",{d:"M5 21a2 2 0 0 1-2-2"}],["path",{d:"M9 3h1"}],["path",{d:"M9 21h1"}],["path",{d:"M14 3h1"}],["path",{d:"M14 21h1"}],["path",{d:"M3 9v1"}],["path",{d:"M21 9v1"}],["path",{d:"M3 14v1"}],["path",{d:"M21 14v1"}]];le(e,se({name:"square-dashed"},()=>n,{get iconNode(){return r},children:(i,a)=>{var s=Y(),l=V(s);re(l,t,"default",{}),$(i,s)},$$slots:{default:!0}}))}function su(e,t){const n=te(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const r=[["path",{d:"M4 10c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2"}],["path",{d:"M10 16c-1.1 0-2-.9-2-2v-4c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2"}],["rect",{width:"8",height:"8",x:"14",y:"14",rx:"2"}]];le(e,se({name:"square-stack"},()=>n,{get iconNode(){return r},children:(i,a)=>{var s=Y(),l=V(s);re(l,t,"default",{}),$(i,s)},$$slots:{default:!0}}))}function lu(e,t){const n=te(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const r=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2"}]];le(e,se({name:"square"},()=>n,{get iconNode(){return r},children:(i,a)=>{var s=Y(),l=V(s);re(l,t,"default",{}),$(i,s)},$$slots:{default:!0}}))}function ou(e,t){const n=te(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const r=[["circle",{cx:"12",cy:"12",r:"4"}],["path",{d:"M12 2v2"}],["path",{d:"M12 20v2"}],["path",{d:"m4.93 4.93 1.41 1.41"}],["path",{d:"m17.66 17.66 1.41 1.41"}],["path",{d:"M2 12h2"}],["path",{d:"M20 12h2"}],["path",{d:"m6.34 17.66-1.41 1.41"}],["path",{d:"m19.07 4.93-1.41 1.41"}]];le(e,se({name:"sun"},()=>n,{get iconNode(){return r},children:(i,a)=>{var s=Y(),l=V(s);re(l,t,"default",{}),$(i,s)},$$slots:{default:!0}}))}function uu(e,t){const n=te(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const r=[["path",{d:"M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"}]];le(e,se({name:"thermometer"},()=>n,{get iconNode(){return r},children:(i,a)=>{var s=Y(),l=V(s);re(l,t,"default",{}),$(i,s)},$$slots:{default:!0}}))}function vs(e,t){const n=te(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const r=[["path",{d:"M12 4v16"}],["path",{d:"M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2"}],["path",{d:"M9 20h6"}]];le(e,se({name:"type"},()=>n,{get iconNode(){return r},children:(i,a)=>{var s=Y(),l=V(s);re(l,t,"default",{}),$(i,s)},$$slots:{default:!0}}))}function cu(e,t){const n=te(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const r=[["path",{d:"M18 6 6 18"}],["path",{d:"m6 6 12 12"}]];le(e,se({name:"x"},()=>n,{get iconNode(){return r},children:(i,a)=>{var s=Y(),l=V(s);re(l,t,"default",{}),$(i,s)},$$slots:{default:!0}}))}function du(e,t){const n=te(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const r=[["path",{d:"M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"}]];le(e,se({name:"zap"},()=>n,{get iconNode(){return r},children:(i,a)=>{var s=Y(),l=V(s);re(l,t,"default",{}),$(i,s)},$$slots:{default:!0}}))}function fu(e,t){const n=te(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const r=[["circle",{cx:"11",cy:"11",r:"8"}],["line",{x1:"21",x2:"16.65",y1:"21",y2:"16.65"}],["line",{x1:"11",x2:"11",y1:"8",y2:"14"}],["line",{x1:"8",x2:"14",y1:"11",y2:"11"}]];le(e,se({name:"zoom-in"},()=>n,{get iconNode(){return r},children:(i,a)=>{var s=Y(),l=V(s);re(l,t,"default",{}),$(i,s)},$$slots:{default:!0}}))}var vu=R("<button><!></button>"),pu=R('<button class="icon-btn svelte-84a5bx"><!></button>'),hu=R('<div class="icon-panel svelte-84a5bx"><div class="tool-section svelte-84a5bx"></div> <div class="separator svelte-84a5bx"></div> <div class="component-section svelte-84a5bx"></div></div>');function _u(e){let t=J("select");const n=[{id:"select",icon:Xo,label:"Select"},{id:"move",icon:Qo,label:"Move"},{id:"zoom",icon:fu,label:"Zoom"}],r=[{id:"button",icon:eu,label:"Button"},{id:"label",icon:vs,label:"Label"},{id:"slider",icon:ru,label:"Slider"},{id:"combobox",icon:fs,label:"ComboBox"},{id:"backdrop",icon:lu,label:"Backdrop"},{id:"grid",icon:Vo,label:"Grid"},{id:"envelope",icon:Io,label:"Envelope"},{id:"filter",icon:Oo,label:"Filter"}];var i=hu(),a=m(i);Be(a,21,()=>n,bt,(l,c)=>{var u=vu();let d;var h=m(u);fi(h,()=>o(c).icon,(v,_)=>{_(v,{size:18,strokeWidth:1.5})}),ue(()=>{d=qe(u,1,"icon-btn svelte-84a5bx",null,d,{active:o(t)===o(c).id}),$t(u,"title",o(c).label)}),q("click",u,()=>C(t,o(c).id,!0)),$(l,u)});var s=w(a,4);Be(s,21,()=>r,bt,(l,c)=>{var u=pu(),d=m(u);fi(d,()=>o(c).icon,(h,v)=>{v(h,{size:18,strokeWidth:1.5})}),ue(()=>$t(u,"title",o(c).label)),$(l,u)}),$(e,i)}Mt(["click"]);var gu=R('<span class="modified-dot svelte-17p2z4b">●</span>'),bu=R('<div><span class="tab-name svelte-17p2z4b"> <!></span> <button class="tab-close svelte-17p2z4b" title="Close"><!></button></div>'),mu=R('<div class="tab-bar svelte-17p2z4b"><div class="tabs svelte-17p2z4b"></div> <button class="new-tab-btn svelte-17p2z4b" title="New Panel"><!></button></div>');function $u(e,t){wt(t,!0);const n=()=>He(Vt,"$panels",i),r=()=>He(jt,"$activePanelId",i),[i,a]=Bn();let s=G(n),l=G(r);function c(_,f){_.button===1&&(_.preventDefault(),vi(f))}var u=mu(),d=m(u);Be(d,21,()=>o(s),_=>_.id,(_,f)=>{var y=bu();let g;var b=m(y),z=m(b),O=w(z);{var M=P=>{var A=gu();$(P,A)};xe(O,P=>{o(f).modified&&P(M)})}var S=w(b,2),j=m(S);cu(j,{size:12,strokeWidth:1.5}),ue(()=>{g=qe(y,1,"tab svelte-17p2z4b",null,g,{active:o(f).id===o(l)}),me(z,`${o(f).name??""} `)}),q("click",y,()=>Mo(o(f).id)),q("mousedown",y,P=>c(P,o(f).id)),q("click",S,P=>{P.stopPropagation(),vi(o(f).id)}),$(_,y)});var h=w(d,2),v=m(h);Jo(v,{size:14,strokeWidth:1.5}),q("click",h,()=>ds()),$(e,u),yt(),a()}Mt(["click","mousedown"]);var wu=R('<div class="canvas-viewport svelte-17bi2u2"><div class="zoom-container svelte-17bi2u2"><div class="panel-surface svelte-17bi2u2"><span class="panel-label svelte-17bi2u2"> </span></div></div></div>'),yu=R('<div class="empty-state svelte-17bi2u2"><span class="empty-text svelte-17bi2u2">No panel open</span> <span class="empty-hint svelte-17bi2u2">File → New Panel or press the + tab</span></div>'),xu=R('<div class="editor-wrapper svelte-17bi2u2"><div class="tab-bar-area svelte-17bi2u2"><!></div> <div class="canvas-area svelte-17bi2u2"><!></div></div>');function Mu(e,t){wt(t,!0);const n=()=>He(Vt,"$panels",a),r=()=>He(jt,"$activePanelId",a),i=()=>He(Xt,"$editorZoom",a),[a,s]=Bn();let l=G(()=>n().find(b=>b.id===r())??null),c=G(i),u=G(()=>o(c)/100);var d=xu(),h=m(d),v=m(h);$u(v,{});var _=w(h,2),f=m(_);{var y=b=>{var z=wu(),O=m(z),M=m(O),S=m(M),j=m(S);ue(()=>{Fe(O,`transform: scale(${o(u)??""}); transform-origin: center center;`),Fe(M,`width: ${o(l).width??""}px; height: ${o(l).height??""}px;`),me(j,`${o(l).name??""} — ${o(l).width??""} x ${o(l).height??""}`)}),$(b,z)},g=b=>{var z=yu();$(b,z)};xe(f,b=>{o(l)?b(y):b(g,-1)})}$(e,d),yt(),s()}var Su=R('<div class="common-bar svelte-pu4s69"><div class="prop-group svelte-pu4s69"><div class="color-swatch svelte-pu4s69" style="background: #3A3A3A;" title="Fill colour"></div> <span class="prop-value svelte-pu4s69">3A3A3A</span></div> <div class="divider svelte-pu4s69"></div> <div class="prop-group svelte-pu4s69"><span class="prop-label svelte-pu4s69">Arial</span> <span class="prop-value svelte-pu4s69">14</span></div> <div class="divider svelte-pu4s69"></div> <div class="prop-group toggle-group svelte-pu4s69"><button class="toggle-btn svelte-pu4s69" title="Bold">B</button> <button class="toggle-btn svelte-pu4s69" title="Italic">I</button> <button class="toggle-btn svelte-pu4s69" title="Underline">U</button></div> <div class="divider svelte-pu4s69"></div> <div class="prop-group toggle-group svelte-pu4s69"><button class="toggle-btn svelte-pu4s69" title="Align left">≡</button> <button class="toggle-btn active svelte-pu4s69" title="Align center">☰</button> <button class="toggle-btn svelte-pu4s69" title="Align right">≡</button></div> <div class="spacer svelte-pu4s69"></div> <div class="prop-group svelte-pu4s69"><span class="prop-label-sm svelte-pu4s69">Opacity</span> <span class="prop-value svelte-pu4s69">100%</span></div></div>');function ku(e){var t=Su();$(e,t)}var Eu=R('<input class="zoom-input svelte-o5r682" type="text"/>'),Pu=R('<span class="zoom-value svelte-o5r682" title="Double-click to type a value"> </span>'),Nu=R('<div class="zoom-bar svelte-o5r682"><div class="scrollbar-area svelte-o5r682"></div> <div class="zoom-controls svelte-o5r682"><button class="zoom-btn svelte-o5r682" title="Zoom out">−</button> <!> <button class="zoom-btn svelte-o5r682" title="Zoom in">+</button> <span class="inc-label svelte-o5r682">Dec/Inc</span> <input class="inc-input svelte-o5r682" type="number" min="1" max="100"/> <div class="divider svelte-o5r682"></div> <button class="zoom-btn icon svelte-o5r682" title="Reset to 100%">⊡</button> <button class="zoom-btn icon svelte-o5r682" title="Fit to window"><!></button></div></div>');function Cu(e,t){wt(t,!0);const n=()=>He(Xt,"$editorZoom",s),r=()=>He(ta,"$editorZoomIncrement",s),i=()=>He(Vt,"$panels",s),a=()=>He(jt,"$activePanelId",s),[s,l]=Bn();let c=J(!1),u=J("100"),d=G(n),h=G(r),v=G(()=>i().find(H=>H.id===a())??null);function _(){Xt.update(H=>Math.min(400,H+r()))}function f(){Xt.update(H=>Math.max(10,H-r()))}function y(){Xt.set(100)}function g(){C(u,String(o(d)),!0),C(c,!0)}function b(){C(c,!1);const H=parseInt(o(u),10);isNaN(H)||Xt.set(Math.max(10,Math.min(400,H)))}function z(H){H.key==="Enter"?b():H.key==="Escape"&&C(c,!1)}function O(H){const F=parseInt(H.target.value,10);!isNaN(F)&&F>0&&ta.set(Math.min(100,F))}function M(){if(!o(v))return;const H=document.querySelector(".canvas-viewport");if(!H){Xt.set(100);return}const F=H.clientWidth-40,ve=H.clientHeight-40,fe=F/o(v).width,Le=ve/o(v).height,Ie=Math.min(fe,Le),Ke=Math.max(10,Math.min(400,Math.round(Ie*100)));Xt.set(Ke)}var S=Nu(),j=w(m(S),2),P=m(j),A=w(P,2);{var ie=H=>{var F=Eu();Fa(F,!0),_n("blur",F,b),q("keydown",F,z),ho(F,()=>o(u),ve=>C(u,ve)),$(H,F)},K=H=>{var F=Pu(),ve=m(F);ue(()=>me(ve,`${o(d)??""}%`)),q("dblclick",F,g),$(H,F)};xe(A,H=>{o(c)?H(ie):H(K,-1)})}var N=w(A,2),L=w(N,4),I=w(L,4),U=w(I,2),de=m(U);Zo(de,{size:12,strokeWidth:1.5}),ue(()=>fn(L,o(h))),q("click",P,f),q("click",N,_),q("change",L,O),q("click",I,y),q("click",U,M),$(e,S),yt(),l()}Mt(["click","keydown","dblclick","change"]);var Au=R('<div class="band-checkerboard svelte-6w7hwg"></div>'),Tu=R('<div class="band-wrapper svelte-6w7hwg"><div role="slider" tabindex="-1"><!> <div class="band-gradient svelte-6w7hwg"></div> <div class="thumb svelte-6w7hwg"></div> <span class="band-label svelte-6w7hwg"> </span></div></div>'),zu=R('<div class="color-chooser svelte-6w7hwg"><div class="checkerboard svelte-6w7hwg"></div> <div class="color-overlay svelte-6w7hwg"></div> <div class="hex-corner svelte-6w7hwg"><input class="hex-input svelte-6w7hwg" type="text" spellcheck="false"/></div> <div class="bands-container svelte-6w7hwg"></div></div>');function ju(e,t){wt(t,!0);let n=De(t,"color",3,"333333"),r=De(t,"alpha",3,1),i=De(t,"stepSize",3,10),a=J(0),s=J(0),l=J(20),c=J(1),u=J(null),d=J(""),h=J(!1),v=!1;function _(T,D,Z){D/=100,Z/=100;const ce=ye=>(ye+T/30)%12,ae=D*Math.min(Z,1-Z),_e=ye=>Z-ae*Math.max(-1,Math.min(ce(ye)-3,9-ce(ye),1));return[Math.round(_e(0)*255),Math.round(_e(8)*255),Math.round(_e(4)*255)]}function f(T,D,Z){T/=255,D/=255,Z/=255;const ce=Math.max(T,D,Z),ae=Math.min(T,D,Z);let _e=0,ye=0,it=(ce+ae)/2;if(ce!==ae){const Ge=ce-ae;switch(ye=it>.5?Ge/(2-ce-ae):Ge/(ce+ae),ce){case T:_e=((D-Z)/Ge+(D<Z?6:0))*60;break;case D:_e=((Z-T)/Ge+2)*60;break;case Z:_e=((T-D)/Ge+4)*60;break}}return[_e,ye*100,it*100]}function y(T){return T=T.replace(/^#/,""),[parseInt(T.slice(0,2),16),parseInt(T.slice(2,4),16),parseInt(T.slice(4,6),16)]}function g(T,D,Z){const ce=ae=>ae.toString(16).padStart(2,"0").toUpperCase();return ce(T)+ce(D)+ce(Z)}function b(T){const[D,Z,ce]=y(T),[ae,_e,ye]=f(D,Z,ce);D===Z&&Z===ce||(C(a,ae,!0),C(s,_e,!0)),C(l,ye,!0)}Jn(()=>{const T=n(),D=r();if(v){v=!1;return}b(T),C(c,D,!0)});let z=G(()=>_(o(a),o(s),o(l))),O=G(()=>g(o(z)[0],o(z)[1],o(z)[2])),M=G(()=>Math.round(o(c)*255).toString(16).padStart(2,"0").toUpperCase()),S=G(()=>o(M)+o(O)),j=G(()=>"#"+o(S)),P=G(()=>`hsla(${o(a)}, ${o(s)}%, ${o(l)}%, ${o(c)})`),A=G(()=>(()=>{const T=[];for(let D=0;D<=360;D+=30)T.push(`hsl(${D}, ${o(s)}%, ${o(l)}%)`);return`linear-gradient(to right, ${T.join(", ")})`})()),ie=G(()=>`linear-gradient(to right, hsl(${o(a)}, 100%, ${o(l)}%), hsl(${o(a)}, 0%, ${o(l)}%))`),K=G(()=>`linear-gradient(to right, hsl(${o(a)}, ${o(s)}%, 0%), hsl(${o(a)}, ${o(s)}%, 50%), hsl(${o(a)}, ${o(s)}%, 100%))`),N=G(()=>`linear-gradient(to right, hsla(${o(a)}, ${o(s)}%, ${o(l)}%, 1), hsla(${o(a)}, ${o(s)}%, ${o(l)}%, 0))`),L=G(()=>o(a)/360),I=G(()=>1-o(s)/100),U=G(()=>o(l)/100),de=G(()=>1-o(c)),H=G(()=>`hsl(${o(a)}, ${o(s)}%, ${o(l)}%)`),F=G(()=>`hsla(${o(a)}, ${o(s)}%, ${o(l)}%, ${o(c)})`);function ve(){t.onchange&&(v=!0,t.onchange(o(S)))}function fe(T,D){const Z=D.getBoundingClientRect();return Math.max(0,Math.min(T.clientX-Z.left,Z.width))/Z.width}function Le(T,D){C(u,T,!0),Ke(D)}function Ie(T,D){const Z=i()/100*D;return Math.round(T/Z)*Z}function Ke(T){if(!o(u))return;const D=document.querySelector(`[data-band="${o(u)}"]`);if(!D)return;const Z=fe(T,D);switch(o(u)){case"hue":C(a,Ie(Z*360,360),!0);break;case"saturation":C(s,Ie((1-Z)*100,100),!0);break;case"lightness":C(l,Ie(Z*100,100),!0);break;case"alpha":C(c,Ie((1-Z)*100,100)/100);break}ve()}function We(){C(u,null)}function Ut(T){C(h,!0),C(d,o(j),!0),T.target.select()}function It(){C(h,!1),Oe()}function he(T){T.key==="Enter"?T.target.blur():T.key==="Escape"&&(C(h,!1),C(d,o(j),!0))}function Oe(){let T=o(d).replace(/^#/,"").replace(/[^0-9A-Fa-f]/g,"");T.length===8?(C(c,parseInt(T.slice(0,2),16)/255),b(T.slice(2,8)),ve()):T.length===6&&(b(T),ve())}const Ne=[{id:"hue",label:"H"},{id:"saturation",label:"S"},{id:"lightness",label:"B"},{id:"alpha",label:"A"}];function we(T){switch(T){case"hue":return o(A);case"saturation":return o(ie);case"lightness":return o(K);case"alpha":return o(N)}}function Re(T){switch(T){case"hue":return o(L);case"saturation":return o(I);case"lightness":return o(U);case"alpha":return o(de)}}function Ce(T){return o(T==="alpha"?F:H)}var nt=zu();_n("mousemove",Qn,function(...T){var D;(D=o(u)?Ke:void 0)==null||D.apply(this,T)}),_n("mouseup",Qn,function(...T){var D;(D=o(u)?We:void 0)==null||D.apply(this,T)});var St=w(m(nt),2),Zt=w(St,2),rt=m(Zt),on=w(Zt,2);Be(on,21,()=>Ne,bt,(T,D)=>{var Z=Tu(),ce=m(Z);let ae;var _e=m(ce);{var ye=ft=>{var cn=Au();$(ft,cn)};xe(_e,ft=>{o(D).id==="alpha"&&ft(ye)})}var it=w(_e,2),Ge=w(it,2),at=w(Ge,2),un=m(at);ue((ft,cn,Ir,gr)=>{ae=qe(ce,1,"band svelte-6w7hwg",null,ae,{"is-alpha":o(D).id==="alpha"}),$t(ce,"data-band",o(D).id),$t(ce,"aria-valuenow",ft),Fe(it,`background: ${cn??""}`),Fe(Ge,`left: ${Ir??""}%; background: ${gr??""}`),me(un,o(D).label)},[()=>Re(o(D).id)*100,()=>we(o(D).id),()=>Re(o(D).id)*100,()=>Ce(o(D).id)]),q("mousedown",ce,ft=>Le(o(D).id,ft)),$(T,Z)}),ue(()=>{Fe(St,`background: ${o(P)??""}`),fn(rt,o(h)?o(d):o(j))}),_n("focus",rt,Ut),_n("blur",rt,It),q("keydown",rt,he),q("input",rt,T=>C(d,T.target.value,!0)),$(e,nt),yt()}Mt(["keydown","input","mousedown"]);var Iu=R("<button> </button>"),Ou=R('<button class="harmony-swatch svelte-3j5puu"></button>'),Lu=R("<button> </button>"),Ru=R('<div class="depth-preview svelte-3j5puu"><span class="depth-swatch svelte-3j5puu"></span> <span class="depth-arrow svelte-3j5puu">→</span> <span class="depth-swatch svelte-3j5puu"></span> <span class="depth-hex svelte-3j5puu"> </span></div>'),Du=R('<div class="color-settings svelte-3j5puu"><div class="section svelte-3j5puu"><div class="section-label svelte-3j5puu">Format</div> <div class="format-row svelte-3j5puu"><select class="combo format-combo svelte-3j5puu"><option>Hex</option><option>RGB</option><option>ARGB</option><option>RGBA</option><option>HSL</option><option>HSLA</option></select> <div class="value-row svelte-3j5puu"><span class="value-text svelte-3j5puu"> </span> <button class="copy-btn svelte-3j5puu" title="Copy to clipboard"><!></button></div></div></div> <div class="section svelte-3j5puu"><div class="section-label svelte-3j5puu">Step</div> <div class="step-row svelte-3j5puu"></div></div> <div class="section svelte-3j5puu"><div class="section-label svelte-3j5puu">Harmony</div> <select class="combo svelte-3j5puu"><option>Complementary</option><option>Analogous</option><option>Triadic</option><option>Split-Complementary</option><option>Tetradic</option></select> <div class="harmony-swatches svelte-3j5puu"><button class="harmony-swatch current svelte-3j5puu"></button> <!></div></div> <div class="section svelte-3j5puu"><div class="section-label svelte-3j5puu">Quick Actions</div> <div class="actions-row svelte-3j5puu"><button class="action-btn svelte-3j5puu" title="Darken 10%"><!></button> <button class="action-btn svelte-3j5puu" title="Lighten 10%"><!></button> <button class="action-btn svelte-3j5puu" title="Saturate +15%"><!></button> <button class="action-btn svelte-3j5puu" title="Desaturate -15%"><!></button> <button class="action-btn svelte-3j5puu" title="Grayscale"><span class="action-text svelte-3j5puu">G</span></button> <button class="action-btn svelte-3j5puu" title="Invert"><!></button></div></div> <div class="section svelte-3j5puu"><div class="section-label svelte-3j5puu">Opacity</div> <div class="opacity-row svelte-3j5puu"></div></div> <div class="section svelte-3j5puu"><div class="section-label svelte-3j5puu">Depth</div> <select class="combo svelte-3j5puu"><option>8-bit (256)</option><option>16-bit (65K)</option><option>24-bit (16M)</option><option>32-bit (16M+A)</option></select> <!></div></div>');function Hu(e,t){wt(t,!0);let n=De(t,"color",3,"FF0000"),r=De(t,"alpha",3,1),i=De(t,"stepSize",15,10),a=J("hex"),s=J("complementary"),l=J("24"),c=J(!1);function u(x){return x=x.replace(/^#/,""),[parseInt(x.slice(0,2),16),parseInt(x.slice(2,4),16),parseInt(x.slice(4,6),16)]}function d(x,E,k){x/=255,E/=255,k/=255;const W=Math.max(x,E,k),oe=Math.min(x,E,k);let pe=0,Ae=0,Li=(W+oe)/2;if(W!==oe){const qn=W-oe;switch(Ae=Li>.5?qn/(2-W-oe):qn/(W+oe),W){case x:pe=((E-k)/qn+(E<k?6:0))*60;break;case E:pe=((k-x)/qn+2)*60;break;case k:pe=((x-E)/qn+4)*60;break}}return[Math.round(pe),Math.round(Ae*100),Math.round(Li*100)]}function h(x,E,k){E/=100,k/=100;const W=Ae=>(Ae+x/30)%12,oe=E*Math.min(k,1-k),pe=Ae=>k-oe*Math.max(-1,Math.min(W(Ae)-3,9-W(Ae),1));return[Math.round(pe(0)*255),Math.round(pe(8)*255),Math.round(pe(4)*255)]}function v(x,E,k){const W=oe=>Math.max(0,Math.min(255,Math.round(oe))).toString(16).padStart(2,"0").toUpperCase();return W(x)+W(E)+W(k)}function _(x,E=r()){if(t.onApplyColor){const k=Math.round(E*255).toString(16).padStart(2,"0").toUpperCase();t.onApplyColor(k+x)}}let f=G(()=>u(n())),y=G(()=>d(o(f)[0],o(f)[1],o(f)[2])),g=J(0),b=J(0);Jn(()=>{const[x,E,k]=o(f),[W,oe]=o(y);(x!==E||E!==k)&&(C(g,W,!0),C(b,oe,!0))});let z=G(()=>[o(g),o(b),o(y)[2]]),O=G(()=>Math.round(r()*255)),M=G(()=>r().toFixed(2)),S=G(()=>(()=>{const[x,E,k]=o(f),[W,oe,pe]=o(z);switch(o(a)){case"hex":return`#${o(O).toString(16).padStart(2,"0").toUpperCase()}${n()}`;case"rgb":return`rgb(${x}, ${E}, ${k})`;case"argb":return`argb(${o(O)}, ${x}, ${E}, ${k})`;case"rgba":return`rgba(${x}, ${E}, ${k}, ${o(M)})`;case"hsl":return`hsl(${W}, ${oe}%, ${pe}%)`;case"hsla":return`hsla(${W}, ${oe}%, ${pe}%, ${o(M)})`;default:return`#${n()}`}})());async function j(){try{await navigator.clipboard.writeText(o(S)),C(c,!0),setTimeout(()=>C(c,!1),1200)}catch{}}function P(x,E){return((x+E)%360+360)%360}function A(x,E,k){const[W,oe,pe]=h(x,E,k);return v(W,oe,pe)}let ie=G(()=>(()=>{const[x,E,k]=o(z);switch(o(s)){case"complementary":return[A(P(x,180),E,k)];case"analogous":return[A(P(x,-30),E,k),A(P(x,30),E,k)];case"triadic":return[A(P(x,120),E,k),A(P(x,240),E,k)];case"split":return[A(P(x,150),E,k),A(P(x,210),E,k)];case"tetradic":return[A(P(x,90),E,k),A(P(x,180),E,k),A(P(x,270),E,k)];default:return[]}})());function K(){const[x,E,k]=o(f);_(v(255-x,255-E,255-k))}function N(){const[x,E,k]=o(f),W=Math.round(.299*x+.587*E+.114*k);_(v(W,W,W))}function L(){const[x,E,k]=o(z),W=Math.min(100,k+10),[oe,pe,Ae]=h(x,E,W);_(v(oe,pe,Ae))}function I(){const[x,E,k]=o(z),W=Math.max(0,k-10),[oe,pe,Ae]=h(x,E,W);_(v(oe,pe,Ae))}function U(){const[x,E,k]=o(z),W=Math.max(0,E-15),[oe,pe,Ae]=h(x,W,k);_(v(oe,pe,Ae))}function de(){const[x,E,k]=o(z),W=Math.min(100,E+15),[oe,pe,Ae]=h(x,W,k);_(v(oe,pe,Ae))}function H(x){_(n(),x)}function F(x,E){const k=(1<<E)-1;return Math.round(x/255*k)*255/k}function ve(x,E,k,W){switch(W){case"8":return[F(x,3),F(E,3),F(k,2)];case"16":return[F(x,5),F(E,6),F(k,5)];default:return[x,E,k]}}let fe=G(()=>ve(o(f)[0],o(f)[1],o(f)[2],o(l))),Le=G(()=>v(o(fe)[0],o(fe)[1],o(fe)[2])),Ie=G(()=>o(l)==="8"||o(l)==="16");var Ke=Du(),We=m(Ke),Ut=w(m(We),2),It=m(Ut),he=m(It);he.value=he.__value="hex";var Oe=w(he);Oe.value=Oe.__value="rgb";var Ne=w(Oe);Ne.value=Ne.__value="argb";var we=w(Ne);we.value=we.__value="rgba";var Re=w(we);Re.value=Re.__value="hsl";var Ce=w(Re);Ce.value=Ce.__value="hsla";var nt=w(It,2),St=m(nt),Zt=m(St),rt=w(St,2),on=m(rt);{var T=x=>{Lo(x,{size:12,strokeWidth:1.5})},D=x=>{Do(x,{size:12,strokeWidth:1.5})};xe(on,x=>{o(c)?x(T):x(D,-1)})}var Z=w(We,2),ce=w(m(Z),2);Be(ce,20,()=>[1,5,10,20,25],bt,(x,E)=>{var k=Iu();let W;var oe=m(k);ue(()=>{W=qe(k,1,"step-btn svelte-3j5puu",null,W,{active:i()===E}),me(oe,`${E??""}%`)}),q("click",k,()=>i(E)),$(x,k)});var ae=w(Z,2),_e=w(m(ae),2),ye=m(_e);ye.value=ye.__value="complementary";var it=w(ye);it.value=it.__value="analogous";var Ge=w(it);Ge.value=Ge.__value="triadic";var at=w(Ge);at.value=at.__value="split";var un=w(at);un.value=un.__value="tetradic";var ft=w(_e,2),cn=m(ft),Ir=w(cn,2);Be(Ir,17,()=>o(ie),bt,(x,E)=>{var k=Ou();ue(()=>{Fe(k,`background: #${o(E)??""}`),$t(k,"title",`#${o(E)??""} — click to apply`)}),q("click",k,()=>_(o(E))),$(x,k)});var gr=w(ae,2),ps=w(m(gr),2),Or=m(ps),hs=m(Or);Ko(hs,{size:13,strokeWidth:1.5});var Lr=w(Or,2),_s=m(Lr);ou(_s,{size:13,strokeWidth:1.5});var Rr=w(Lr,2),gs=m(Rr);Fo(gs,{size:13,strokeWidth:1.5});var Dr=w(Rr,2),bs=m(Dr);uu(bs,{size:13,strokeWidth:1.5});var zi=w(Dr,2),ji=w(zi,2),ms=m(ji);tu(ms,{size:13,strokeWidth:1.5});var Ii=w(gr,2),$s=w(m(Ii),2);Be($s,20,()=>[0,.25,.5,.75,1],bt,(x,E)=>{var k=Lu();let W;var oe=m(k);ue((pe,Ae)=>{W=qe(k,1,"opacity-btn svelte-3j5puu",null,W,pe),me(oe,`${Ae??""}%`)},[()=>({active:Math.abs(r()-E)<.01}),()=>Math.round(E*100)]),q("click",k,()=>H(E)),$(x,k)});var ws=w(Ii,2),Hr=w(m(ws),2),Fr=m(Hr);Fr.value=Fr.__value="8";var Br=w(Fr);Br.value=Br.__value="16";var qr=w(Br);qr.value=qr.__value="24";var Oi=w(qr);Oi.value=Oi.__value="32";var ys=w(Hr,2);{var xs=x=>{var E=Ru(),k=m(E),W=w(k,4),oe=w(W,2),pe=m(oe);ue(()=>{Fe(k,`background: #${n()??""}`),Fe(W,`background: #${o(Le)??""}`),me(pe,`#${o(Le)??""}`)}),$(x,E)};xe(ys,x=>{o(Ie)&&x(xs)})}ue(()=>{me(Zt,o(S)),Fe(cn,`background: #${n()??""}`),$t(cn,"title",`Current: #${n()??""}`)}),Yr(It,()=>o(a),x=>C(a,x)),q("click",rt,j),Yr(_e,()=>o(s),x=>C(s,x)),q("click",Or,I),q("click",Lr,L),q("click",Rr,de),q("click",Dr,U),q("click",zi,N),q("click",ji,K),Yr(Hr,()=>o(l),x=>C(l,x)),$(e,Ke),yt()}Mt(["click"]);var Fu=R("<button> </button>"),Bu=R("<button></button>"),qu=R('<div class="colors-layout svelte-12apuct"><div class="colors-preview svelte-12apuct"><!></div> <div class="colors-sidebar svelte-12apuct"><div class="sidebar-settings svelte-12apuct"><!></div> <div class="sidebar-swatches svelte-12apuct"><div class="swatches-grid svelte-12apuct"></div></div></div></div>'),Wu=R('<div class="placeholder svelte-12apuct">Gradient Editor</div>'),Gu=R('<div class="placeholder svelte-12apuct">Notepad</div>'),Vu=R('<div class="placeholder svelte-12apuct">Picture Viewer</div>'),Uu=R('<div class="placeholder svelte-12apuct">Tools</div>'),Zu=R('<div class="placeholder svelte-12apuct">Console Output</div>'),Yu=R('<div class="display-panel svelte-12apuct"><div class="tab-bar svelte-12apuct"></div> <div class="tab-content svelte-12apuct"><!></div></div>');function Ku(e,t){var K;wt(t,!0);const n=()=>He(xo,"$activePanel",r),[r,i]=Bn();let a=J("colors"),s=J(Tt(((K=n())==null?void 0:K.bgColour)??"333333")),l=J(1),c=J(10),u=Tt(Array(24).fill(null));function d(N){N.length>=8?(C(l,parseInt(N.slice(0,2),16)/255),C(s,N.slice(2,8),!0)):(C(l,1),C(s,N.slice(0,6),!0));const L=n();L&&Pr(L.id,{bgColour:o(s),modified:!0})}function h(N){const L=n();L&&Pr(L.id,{bgColour:N,modified:!0})}function v(N){u[N]?h(u[N]):u[N]=o(s)}function _(N){u[N]=null}function f(N,L){L.preventDefault(),u[N]=o(s)}const y=[{id:"colors",label:"Colors"},{id:"gradient",label:"Gradient"},{id:"notepad",label:"Notepad"},{id:"viewer",label:"Viewer"},{id:"tools",label:"Tools"},{id:"console",label:"Console"}];var g=Yu(),b=m(g);Be(b,21,()=>y,bt,(N,L)=>{var I=Fu();let U;var de=m(I);ue(()=>{U=qe(I,1,"tab svelte-12apuct",null,U,{active:o(a)===o(L).id}),me(de,o(L).label)}),q("click",I,()=>C(a,o(L).id,!0)),$(N,I)});var z=w(b,2),O=m(z);{var M=N=>{var L=qu(),I=m(L),U=m(I);ju(U,{get color(){return o(s)},get alpha(){return o(l)},get stepSize(){return o(c)},onchange:d});var de=w(I,2),H=m(de),F=m(H);Hu(F,{get color(){return o(s)},get alpha(){return o(l)},onApplyColor:d,get stepSize(){return o(c)},set stepSize(Le){C(c,Le,!0)}});var ve=w(H,2),fe=m(ve);Be(fe,21,()=>u,bt,(Le,Ie,Ke)=>{var We=Bu();let Ut;ue(()=>{Ut=qe(We,1,"swatch svelte-12apuct",null,Ut,{empty:!o(Ie)}),Fe(We,o(Ie)?`background: #${o(Ie)}`:""),$t(We,"title",o(Ie)?`#${o(Ie)} — right-click to replace, double-click to clear`:"Click to store current color")}),q("click",We,()=>v(Ke)),q("dblclick",We,()=>_(Ke)),q("contextmenu",We,It=>f(Ke,It)),$(Le,We)}),$(N,L)},S=N=>{var L=Wu();$(N,L)},j=N=>{var L=Gu();$(N,L)},P=N=>{var L=Vu();$(N,L)},A=N=>{var L=Uu();$(N,L)},ie=N=>{var L=Zu();$(N,L)};xe(O,N=>{o(a)==="colors"?N(M):o(a)==="gradient"?N(S,1):o(a)==="notepad"?N(j,2):o(a)==="viewer"?N(P,3):o(a)==="tools"?N(A,4):o(a)==="console"&&N(ie,5)})}$(e,g),yt(),i()}Mt(["click","dblclick","contextmenu"]);var Xu=R('<div class="prop-card svelte-3rgj88"><div class="prop-row svelte-3rgj88"><span class="lbl svelte-3rgj88">Name</span> <input class="val svelte-3rgj88" type="text"/></div> <div class="prop-row-pair svelte-3rgj88"><div class="prop-row half svelte-3rgj88"><span class="lbl svelte-3rgj88">Width</span> <input class="val svelte-3rgj88" type="number"/></div> <div class="prop-row half svelte-3rgj88"><span class="lbl svelte-3rgj88">Height</span> <input class="val svelte-3rgj88" type="number"/></div></div></div>'),Qu=R('<div class="prop-card svelte-3rgj88"><div class="prop-row svelte-3rgj88"><span class="lbl svelte-3rgj88">Mode</span> <select class="val svelte-3rgj88"><option>Solid</option><option>Gradient</option><option>Image</option></select></div> <div class="prop-row svelte-3rgj88"><span class="lbl svelte-3rgj88">Colour</span> <div class="color-input svelte-3rgj88"><div class="mini-swatch svelte-3rgj88"></div> <input class="val svelte-3rgj88" type="text"/></div></div></div>'),Ju=R('<div class="prop-card svelte-3rgj88"><div class="prop-row svelte-3rgj88"><span class="lbl svelte-3rgj88">Show Grid</span> <button> </button></div> <div class="prop-row svelte-3rgj88"><span class="lbl svelte-3rgj88">Grid Size</span> <input class="val svelte-3rgj88" type="number"/></div> <div class="prop-row svelte-3rgj88"><span class="lbl svelte-3rgj88">Snap</span> <button> </button></div></div>'),ec=R('<div class="placeholder svelte-3rgj88">Export settings (VST3, Standalone, etc.)</div>'),tc=R('<div class="placeholder svelte-3rgj88"> </div>');function ia(e,t){wt(t,!0);const n=()=>He(Vt,"$panels",i),r=()=>He(jt,"$activePanelId",i),[i,a]=Bn();let s=De(t,"tabId",3,""),l=G(()=>n().find(_=>_.id===r())??null);function c(_,f){if(!o(l))return;let y=f.target.value;const g=Number(y);!isNaN(g)&&y!==""&&(y=g),Pr(o(l).id,{[_]:y})}function u(_){o(l)&&Pr(o(l).id,{[_]:!o(l)[_]})}var d=Y(),h=V(d);{var v=_=>{var f=Y(),y=V(f);{var g=S=>{var j=Xu(),P=m(j),A=w(m(P),2),ie=w(P,2),K=m(ie),N=w(m(K),2),L=w(K,2),I=w(m(L),2);ue(()=>{fn(A,o(l).name),fn(N,o(l).width),fn(I,o(l).height)}),q("change",A,U=>c("name",U)),q("change",N,U=>c("width",U)),q("change",I,U=>c("height",U)),$(S,j)},b=S=>{var j=Qu(),P=m(j),A=w(m(P),2),ie=m(A);ie.value=ie.__value="solid";var K=w(ie);K.value=K.__value="gradient";var N=w(K);N.value=N.__value="image";var L;Ai(A);var I=w(P,2),U=w(m(I),2),de=m(U),H=w(de,2);ue(()=>{L!==(L=o(l).bgMode)&&(A.value=(A.__value=o(l).bgMode)??"",nr(A,o(l).bgMode)),Fe(de,`background:#${o(l).bgColour??""}`),fn(H,o(l).bgColour)}),q("change",A,F=>c("bgMode",F)),q("change",H,F=>c("bgColour",F)),$(S,j)},z=S=>{var j=Ju(),P=m(j),A=w(m(P),2);let ie;var K=m(A),N=w(P,2),L=w(m(N),2),I=w(N,2),U=w(m(I),2);let de;var H=m(U);ue(()=>{ie=qe(A,1,"toggle-val svelte-3rgj88",null,ie,{on:o(l).gridEnabled}),me(K,o(l).gridEnabled?"On":"Off"),fn(L,o(l).gridSize),de=qe(U,1,"toggle-val svelte-3rgj88",null,de,{on:o(l).snapToGrid}),me(H,o(l).snapToGrid?"On":"Off")}),q("click",A,()=>u("gridEnabled")),q("change",L,F=>c("gridSize",F)),q("click",U,()=>u("snapToGrid")),$(S,j)},O=S=>{var j=ec();$(S,j)},M=S=>{var j=tc(),P=m(j);ue(()=>me(P,`Panel: ${s()??""}`)),$(S,j)};xe(y,S=>{s()==="identity"?S(g):s()==="background"?S(b,1):s()==="grid"?S(z,2):s()==="export"?S(O,3):S(M,-1)})}$(_,f)};xe(h,_=>{o(l)&&_(v)})}$(e,d),yt(),a()}Mt(["change","click"]);var nc=R("<button><!></button>"),rc=R('<div class="placeholder svelte-2rmaxa"> </div>'),ic=R('<div class="card-header svelte-2rmaxa"><span class="card-title svelte-2rmaxa"> </span> <span class="card-context svelte-2rmaxa"> </span></div> <div class="card-content svelte-2rmaxa"><!></div>',1),ac=R('<div class="placeholder svelte-2rmaxa"> </div>'),sc=R('<div class="multi-card-content svelte-2rmaxa"><!></div>'),lc=R('<div class="multi-card svelte-2rmaxa"><button class="multi-card-header svelte-2rmaxa"><!> <span class="multi-card-title svelte-2rmaxa"> </span></button> <!></div>'),oc=R('<div class="multi-scroll svelte-2rmaxa"></div>'),uc=R('<div class="icon-tabs svelte-2rmaxa"><!> <div class="tab-spacer svelte-2rmaxa"></div> <button><!></button></div> <div class="card-area svelte-2rmaxa"><!></div>',1),cc=R('<div class="empty-panel svelte-2rmaxa"><span class="empty-text svelte-2rmaxa">No panel open</span></div>'),dc=R('<div class="properties-panel svelte-2rmaxa"><!></div>');function fc(e,t){wt(t,!0);const n=()=>He(Vt,"$panels",a),r=()=>He(jt,"$activePanelId",a),i=()=>He(yo,"$selectedComponentId",a),[a,s]=Bn();let l=De(t,"width",3,280),c=G(()=>n().find(I=>I.id===r())??null),u=G(i),d=G(()=>o(u)!=null?"component":"panel"),h=J("single"),v=J("identity"),_=J(Tt(new Set(["identity"]))),f=J(Tt({}));Jn(()=>{o(d)&&(C(v,"identity"),C(_,new Set(["identity"]),!0))});const y=[{id:"identity",icon:Go,label:"Panel"},{id:"background",icon:ra,label:"Background"},{id:"grid",icon:Bo,label:"Grid"},{id:"export",icon:Yo,label:"Export"}],g=[{id:"identity",icon:Ho,label:"Identity"},{id:"background",icon:ra,label:"Background"},{id:"text",icon:vs,label:"Text"},{id:"border",icon:au,label:"Border"},{id:"icon",icon:qo,label:"Icon"},{id:"effects",icon:iu,label:"Effects"},{id:"actions",icon:du,label:"Actions"},{id:"links",icon:Uo,label:"Links"},{id:"specific",icon:nu,label:"Type"}];let b=G(()=>o(d)==="panel"?y:g),z=G(()=>o(h)==="single"?o(b).filter(I=>I.id===o(v)):o(b).filter(I=>o(_).has(I.id)));function O(I){return o(h)==="single"?I===o(v):o(_).has(I)}function M(I,U){U.ctrlKey||U.metaKey?(S(I),o(_).size>1&&C(h,"multi")):o(h)==="single"?C(v,I,!0):S(I)}function S(I){C(_,new Set(o(_)),!0),o(_).has(I)?o(_).size>1&&o(_).delete(I):o(_).add(I),o(_).size===1&&C(v,[...o(_)][0],!0)}function j(){o(h)==="single"?(C(h,"multi"),C(_,new Set([o(v)]),!0)):(C(h,"single"),o(_).size>0&&C(v,[...o(_)][0],!0))}function P(I){return o(f)[I]===!0}function A(I){C(f,{...o(f),[I]:!o(f)[I]},!0)}var ie=dc(),K=m(ie);{var N=I=>{var U=uc(),de=V(U),H=m(de);Be(H,17,()=>o(b),he=>he.id,(he,Oe)=>{var Ne=nc();let we;var Re=m(Ne);fi(Re,()=>o(Oe).icon,(Ce,nt)=>{nt(Ce,{size:16,strokeWidth:1.5})}),ue(Ce=>{we=qe(Ne,1,"tab-icon svelte-2rmaxa",null,we,Ce),$t(Ne,"title",o(Oe).label)},[()=>({active:O(o(Oe).id)})]),q("click",Ne,Ce=>M(o(Oe).id,Ce)),$(he,Ne)});var F=w(H,4);let ve;var fe=m(F);{var Le=he=>{Wo(he,{size:16,strokeWidth:1.5})},Ie=he=>{su(he,{size:16,strokeWidth:1.5})};xe(fe,he=>{o(h)==="single"?he(Le):he(Ie,-1)})}var Ke=w(de,2),We=m(Ke);{var Ut=he=>{var Oe=Y(),Ne=V(Oe);Be(Ne,17,()=>o(z),we=>we.id,(we,Re)=>{var Ce=ic(),nt=V(Ce),St=m(nt),Zt=m(St),rt=w(St,2),on=m(rt),T=w(nt,2),D=m(T);{var Z=ae=>{ia(ae,{get tabId(){return o(Re).id}})},ce=ae=>{var _e=rc(),ye=m(_e);ue(()=>me(ye,`Component: ${o(Re).label??""}`)),$(ae,_e)};xe(D,ae=>{o(d)==="panel"?ae(Z):ae(ce,-1)})}ue(()=>{me(Zt,o(Re).label),me(on,o(d)==="panel"?"Panel":"Component")}),$(we,Ce)}),$(he,Oe)},It=he=>{var Oe=oc();Be(Oe,21,()=>o(z),Ne=>Ne.id,(Ne,we)=>{var Re=lc(),Ce=m(Re),nt=m(Ce);{var St=ae=>{Ro(ae,{size:14,strokeWidth:1.5})},Zt=G(()=>P(o(we).id)),rt=ae=>{fs(ae,{size:14,strokeWidth:1.5})};xe(nt,ae=>{o(Zt)?ae(St):ae(rt,-1)})}var on=w(nt,2),T=m(on),D=w(Ce,2);{var Z=ae=>{var _e=sc(),ye=m(_e);{var it=at=>{ia(at,{get tabId(){return o(we).id}})},Ge=at=>{var un=ac(),ft=m(un);ue(()=>me(ft,`Component: ${o(we).label??""}`)),$(at,un)};xe(ye,at=>{o(d)==="panel"?at(it):at(Ge,-1)})}$(ae,_e)},ce=G(()=>!P(o(we).id));xe(D,ae=>{o(ce)&&ae(Z)})}ue(()=>me(T,o(we).label)),q("click",Ce,()=>A(o(we).id)),$(Ne,Re)}),$(he,Oe)};xe(We,he=>{o(h)==="single"?he(Ut):he(It,-1)})}ue(()=>{ve=qe(F,1,"tab-icon mode-toggle svelte-2rmaxa",null,ve,{active:o(h)==="multi"}),$t(F,"title",o(h)==="single"?"Switch to multi view":"Switch to single view")}),q("click",F,j),$(I,U)},L=I=>{var U=cc();$(I,U)};xe(K,I=>{o(c)?I(N):I(L,-1)})}ue(()=>Fe(ie,`width: ${l()??""}px;`)),$(e,ie),yt(),s()}Mt(["click"]);var vc=R('<div class="status-bar svelte-1gvod6j"><span class="status-item svelte-1gvod6j">Ready</span> <span class="spacer svelte-1gvod6j"></span> <span class="status-item dim svelte-1gvod6j">No selection</span> <span class="status-item dim svelte-1gvod6j">CEditor v0.1.0</span></div>');function pc(e){var t=vc();$(e,t)}var hc=R('<div class="app svelte-1n46o8q"><div class="menubar-area svelte-1n46o8q"><!></div> <div class="icon-panel-area svelte-1n46o8q"><!></div> <div class="center-area svelte-1n46o8q"><div class="editor-canvas-area svelte-1n46o8q"><!></div> <div class="common-bar-area svelte-1n46o8q"><!></div> <div class="zoom-bar-area svelte-1n46o8q"><!></div> <div></div> <div class="display-panel-area svelte-1n46o8q"><!></div></div> <div></div> <div class="properties-area svelte-1n46o8q"><!></div> <div class="statusbar-area svelte-1n46o8q"><!></div></div>');function _c(e){let t=J(280),n=J(!1),r=J(180),i=J(!1);function a(I){C(n,!0);const U=I.clientX,de=o(t);function H(ve){const fe=U-ve.clientX;C(t,Math.max(220,Math.min(500,de+fe)),!0)}function F(){C(n,!1),window.removeEventListener("mousemove",H),window.removeEventListener("mouseup",F)}window.addEventListener("mousemove",H),window.addEventListener("mouseup",F)}function s(I){C(i,!0);const U=I.clientY,de=o(r);function H(ve){const fe=U-ve.clientY;C(r,Math.max(80,Math.min(500,de+fe)),!0)}function F(){C(i,!1),window.removeEventListener("mousemove",H),window.removeEventListener("mouseup",F)}window.addEventListener("mousemove",H),window.addEventListener("mouseup",F)}var l=hc(),c=m(l),u=m(c);Ao(u,{});var d=w(c,2),h=m(d);_u(h);var v=w(d,2),_=m(v),f=m(_);Mu(f,{});var y=w(_,2),g=m(y);ku(g);var b=w(y,2),z=m(b);Cu(z,{});var O=w(b,2);let M;var S=w(O,2),j=m(S);Ku(j,{});var P=w(v,2);let A;var ie=w(P,2),K=m(ie);fc(K,{get width(){return o(t)}});var N=w(ie,2),L=m(N);pc(L),ue(()=>{Fe(l,`--props-width: ${o(t)??""}px`),M=qe(O,1,"display-resize-handle svelte-1n46o8q",null,M,{active:o(i)}),Fe(S,`flex: 0 0 ${o(r)??""}px;`),A=qe(P,1,"resize-handle svelte-1n46o8q",null,A,{active:o(n)})}),q("mousedown",O,s),q("mousedown",P,a),$(e,l)}Mt(["mousedown"]);Xl(_c,{target:document.getElementById("app")});
