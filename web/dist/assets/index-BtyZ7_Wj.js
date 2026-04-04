var zl=Object.defineProperty;var Ii=e=>{throw TypeError(e)};var Nl=(e,t,r)=>t in e?zl(e,t,{enumerable:!0,configurable:!0,writable:!0,value:r}):e[t]=r;var cn=(e,t,r)=>Nl(e,typeof t!="symbol"?t+"":t,r),To=(e,t,r)=>t.has(e)||Ii("Cannot "+r);var C=(e,t,r)=>(To(e,t,"read from private field"),r?r.call(e):t.get(e)),De=(e,t,r)=>t.has(e)?Ii("Cannot add the same private member more than once"):t instanceof WeakSet?t.add(e):t.set(e,r),Ue=(e,t,r,o)=>(To(e,t,"write to private field"),o?o.call(e,r):t.set(e,r),r),ft=(e,t,r)=>(To(e,t,"access private method"),r);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const i of document.querySelectorAll('link[rel="modulepreload"]'))o(i);new MutationObserver(i=>{for(const l of i)if(l.type==="childList")for(const a of l.addedNodes)a.tagName==="LINK"&&a.rel==="modulepreload"&&o(a)}).observe(document,{childList:!0,subtree:!0});function r(i){const l={};return i.integrity&&(l.integrity=i.integrity),i.referrerPolicy&&(l.referrerPolicy=i.referrerPolicy),i.crossOrigin==="use-credentials"?l.credentials="include":i.crossOrigin==="anonymous"?l.credentials="omit":l.credentials="same-origin",l}function o(i){if(i.ep)return;i.ep=!0;const l=r(i);fetch(i.href,l)}})();const Pl=!1;var ui=Array.isArray,Tl=Array.prototype.indexOf,Mr=Array.prototype.includes,$o=Array.from,la=Object.defineProperty,Xn=Object.getOwnPropertyDescriptor,sa=Object.getOwnPropertyDescriptors,Il=Object.prototype,Al=Array.prototype,di=Object.getPrototypeOf,Ai=Object.isExtensible;function jr(e){return typeof e=="function"}const An=()=>{};function Fl(e){return e()}function mo(e){for(var t=0;t<e.length;t++)e[t]()}function ca(){var e,t,r=new Promise((o,i)=>{e=o,t=i});return{promise:r,resolve:e,reject:t}}function jl(e,t){if(Array.isArray(e))return e;if(!(Symbol.iterator in e))return Array.from(e);const r=[];for(const o of e)if(r.push(o),r.length===t)break;return r}const Nt=2,Er=4,Qr=8,vi=1<<24,On=16,pn=32,fr=64,Yo=128,rn=512,kt=1024,At=2048,Sn=4096,Yt=8192,Qt=16384,mr=32768,Uo=1<<25,Zn=65536,Wo=1<<17,Rl=1<<18,Ir=1<<19,ua=1<<20,kn=1<<25,pr=65536,Xo=1<<21,ko=1<<22,Vn=1<<23,Cn=Symbol("$state"),da=Symbol("legacy props"),Ol=Symbol(""),zn=new class extends Error{constructor(){super(...arguments);cn(this,"name","StaleReactionError");cn(this,"message","The reaction that called `getAbortSignal()` was re-run or destroyed")}};var oa;const fi=!!((oa=globalThis.document)!=null&&oa.contentType)&&globalThis.document.contentType.includes("xml");function ql(e){throw new Error("https://svelte.dev/e/lifecycle_outside_component")}function Ll(){throw new Error("https://svelte.dev/e/async_derived_orphan")}function Dl(e,t,r){throw new Error("https://svelte.dev/e/each_key_duplicate")}function Hl(e){throw new Error("https://svelte.dev/e/effect_in_teardown")}function Bl(){throw new Error("https://svelte.dev/e/effect_in_unowned_derived")}function Gl(e){throw new Error("https://svelte.dev/e/effect_orphan")}function Yl(){throw new Error("https://svelte.dev/e/effect_update_depth_exceeded")}function Ul(e){throw new Error("https://svelte.dev/e/props_invalid_value")}function Wl(){throw new Error("https://svelte.dev/e/state_descriptors_fixed")}function Xl(){throw new Error("https://svelte.dev/e/state_prototype_fixed")}function Vl(){throw new Error("https://svelte.dev/e/state_unsafe_mutation")}function Jl(){throw new Error("https://svelte.dev/e/svelte_boundary_reset_onerror")}const Zl=1,Kl=2,va=4,Ql=8,es=16,ts=1,ns=2,fa=4,rs=8,os=16,is=1,as=2,Mt=Symbol(),pa="http://www.w3.org/1999/xhtml",ls="http://www.w3.org/2000/svg",ss="@attach";function cs(){console.warn("https://svelte.dev/e/select_multiple_invalid_value")}function us(){console.warn("https://svelte.dev/e/svelte_boundary_reset_noop")}function ha(e){return e===this.v}function ga(e,t){return e!=e?t==t:e!==t||e!==null&&typeof e=="object"||typeof e=="function"}function _a(e){return!ga(e,this.v)}let Ar=!1,ds=!1;function vs(){Ar=!0}let gt=null;function zr(e){gt=e}function lt(e,t=!1,r){gt={p:gt,i:!1,c:null,e:null,s:e,x:null,r:Ge,l:Ar&&!t?{s:null,u:null,$:[]}:null}}function st(e){var t=gt,r=t.e;if(r!==null){t.e=null;for(var o of r)Ba(o)}return e!==void 0&&(t.x=e),t.i=!0,gt=t.p,e??{}}function eo(){return!Ar||gt!==null&&gt.l===null}let or=[];function ma(){var e=or;or=[],mo(e)}function Fn(e){if(or.length===0&&!Hr){var t=or;queueMicrotask(()=>{t===or&&ma()})}or.push(e)}function fs(){for(;or.length>0;)ma()}function ba(e){var t=Ge;if(t===null)return He.f|=Vn,e;if((t.f&mr)===0&&(t.f&Er)===0)throw e;Wn(e,t)}function Wn(e,t){for(;t!==null;){if((t.f&Yo)!==0){if((t.f&mr)===0)throw e;try{t.b.error(e);return}catch(r){e=r}}t=t.parent}throw e}const ps=-7169;function mt(e,t){e.f=e.f&ps|t}function pi(e){(e.f&rn)!==0||e.deps===null?mt(e,kt):mt(e,Sn)}function wa(e){if(e!==null)for(const t of e)(t.f&Nt)===0||(t.f&pr)===0||(t.f^=pr,wa(t.deps))}function ya(e,t,r){(e.f&At)!==0?t.add(e):(e.f&Sn)!==0&&r.add(e),wa(e.deps),mt(e,kt)}function hi(e,t,r){if(e==null)return t(void 0),r&&r(void 0),An;const o=qn(()=>e.subscribe(t,r));return o.unsubscribe?()=>o.unsubscribe():o}const wr=[];function hs(e,t){return{subscribe:er(e,t).subscribe}}function er(e,t=An){let r=null;const o=new Set;function i(s){if(ga(e,s)&&(e=s,r)){const c=!wr.length;for(const u of o)u[1](),wr.push(u,e);if(c){for(let u=0;u<wr.length;u+=2)wr[u][0](wr[u+1]);wr.length=0}}}function l(s){i(s(e))}function a(s,c=An){const u=[s,c];return o.add(u),o.size===1&&(r=t(i,l)||An),s(e),()=>{o.delete(u),o.size===0&&r&&(r(),r=null)}}return{set:i,update:l,subscribe:a}}function xa(e,t,r){const o=!Array.isArray(e),i=o?[e]:e;if(!i.every(Boolean))throw new Error("derived() expects stores as input, got a falsy value");const l=t.length<2;return hs(r,(a,s)=>{let c=!1;const u=[];let g=0,h=An;const p=()=>{if(g)return;h();const f=t(o?u[0]:u,a,s);l?a(f):h=typeof f=="function"?f:An},_=i.map((f,w)=>hi(f,b=>{u[w]=b,g&=~(1<<w),c&&p()},()=>{g|=1<<w}));return c=!0,p(),function(){mo(_),h(),c=!1}})}function Ut(e){let t;return hi(e,r=>t=r)(),t}let lo=!1,Vo=Symbol();function wt(e,t,r){const o=r[t]??(r[t]={store:null,source:Ia(void 0),unsubscribe:An});if(o.store!==e&&!(Vo in r))if(o.unsubscribe(),o.store=e??null,e==null)o.source.v=void 0,o.unsubscribe=An;else{var i=!0;o.unsubscribe=hi(e,l=>{i?o.source.v=l:m(o.source,l)}),i=!1}return e&&Vo in r?Ut(e):n(o.source)}function tr(){const e={};function t(){ro(()=>{for(var r in e)e[r].unsubscribe();la(e,Vo,{enumerable:!1,value:!0})})}return[e,t]}function gs(e){var t=lo;try{return lo=!1,[e(),lo]}finally{lo=t}}const Hn=new Set;let Me=null,It=null,Jo=null,Hr=!1,Io=!1,yr=null,vo=null;var Fi=0;let _s=1;var $r,kr,Nn,_n,Wr,Vt,Xr,Yn,Pn,mn,Cr,lr,yt,fo,$a,po,Zo,Ko,ka;const wo=class wo{constructor(){De(this,yt);cn(this,"id",_s++);cn(this,"current",new Map);cn(this,"previous",new Map);De(this,$r,new Set);De(this,kr,new Set);De(this,Nn,new Map);De(this,_n,new Map);De(this,Wr,null);De(this,Vt,[]);De(this,Xr,[]);De(this,Yn,new Set);De(this,Pn,new Set);De(this,mn,new Map);cn(this,"is_fork",!1);De(this,Cr,!1);De(this,lr,new Set)}skip_effect(t){C(this,mn).has(t)||C(this,mn).set(t,{d:[],m:[]})}unskip_effect(t){var r=C(this,mn).get(t);if(r){C(this,mn).delete(t);for(var o of r.d)mt(o,At),this.schedule(o);for(o of r.m)mt(o,Sn),this.schedule(o)}}capture(t,r,o=!1){r!==Mt&&!this.previous.has(t)&&this.previous.set(t,r),(t.f&Vn)===0&&(this.current.set(t,[t.v,o]),It==null||It.set(t,t.v))}activate(){Me=this}deactivate(){Me=null,It=null}flush(){try{Io=!0,Me=this,ft(this,yt,po).call(this)}finally{Fi=0,Jo=null,yr=null,vo=null,Io=!1,Me=null,It=null,Jn.clear()}}discard(){for(const t of C(this,kr))t(this);C(this,kr).clear(),Hn.delete(this)}register_created_effect(t){C(this,Xr).push(t)}increment(t,r){let o=C(this,Nn).get(r)??0;if(C(this,Nn).set(r,o+1),t){let i=C(this,_n).get(r)??0;C(this,_n).set(r,i+1)}}decrement(t,r,o){let i=C(this,Nn).get(r)??0;if(i===1?C(this,Nn).delete(r):C(this,Nn).set(r,i-1),t){let l=C(this,_n).get(r)??0;l===1?C(this,_n).delete(r):C(this,_n).set(r,l-1)}C(this,Cr)||o||(Ue(this,Cr,!0),Fn(()=>{Ue(this,Cr,!1),this.flush()}))}transfer_effects(t,r){for(const o of t)C(this,Yn).add(o);for(const o of r)C(this,Pn).add(o);t.clear(),r.clear()}oncommit(t){C(this,$r).add(t)}ondiscard(t){C(this,kr).add(t)}settled(){return(C(this,Wr)??Ue(this,Wr,ca())).promise}static ensure(){if(Me===null){const t=Me=new wo;Io||(Hn.add(Me),Hr||Fn(()=>{Me===t&&t.flush()}))}return Me}apply(){{It=null;return}}schedule(t){var i;if(Jo=t,(i=t.b)!=null&&i.is_pending&&(t.f&(Er|Qr|vi))!==0&&(t.f&mr)===0){t.b.defer_effect(t);return}for(var r=t;r.parent!==null;){r=r.parent;var o=r.f;if(yr!==null&&r===Ge&&(He===null||(He.f&Nt)===0))return;if((o&(fr|pn))!==0){if((o&kt)===0)return;r.f^=kt}}C(this,Vt).push(r)}};$r=new WeakMap,kr=new WeakMap,Nn=new WeakMap,_n=new WeakMap,Wr=new WeakMap,Vt=new WeakMap,Xr=new WeakMap,Yn=new WeakMap,Pn=new WeakMap,mn=new WeakMap,Cr=new WeakMap,lr=new WeakMap,yt=new WeakSet,fo=function(){return this.is_fork||C(this,_n).size>0},$a=function(){for(const o of C(this,lr))for(const i of C(o,_n).keys()){for(var t=!1,r=i;r.parent!==null;){if(C(this,mn).has(r)){t=!0;break}r=r.parent}if(!t)return!0}return!1},po=function(){var s,c;if(Fi++>1e3&&(Hn.delete(this),bs()),!ft(this,yt,fo).call(this)){for(const u of C(this,Yn))C(this,Pn).delete(u),mt(u,At),this.schedule(u);for(const u of C(this,Pn))mt(u,Sn),this.schedule(u)}const t=C(this,Vt);Ue(this,Vt,[]),this.apply();var r=yr=[],o=[],i=vo=[];for(const u of t)try{ft(this,yt,Zo).call(this,u,r,o)}catch(g){throw Ma(u),g}if(Me=null,i.length>0){var l=wo.ensure();for(const u of i)l.schedule(u)}if(yr=null,vo=null,ft(this,yt,fo).call(this)||ft(this,yt,$a).call(this)){ft(this,yt,Ko).call(this,o),ft(this,yt,Ko).call(this,r);for(const[u,g]of C(this,mn))Sa(u,g)}else{C(this,Nn).size===0&&Hn.delete(this),C(this,Yn).clear(),C(this,Pn).clear();for(const u of C(this,$r))u(this);C(this,$r).clear(),ji(o),ji(r),(s=C(this,Wr))==null||s.resolve()}var a=Me;if(C(this,Vt).length>0){const u=a??(a=this);C(u,Vt).push(...C(this,Vt).filter(g=>!C(u,Vt).includes(g)))}a!==null&&(Hn.add(a),ft(c=a,yt,po).call(c)),Hn.has(this)||ft(this,yt,ka).call(this)},Zo=function(t,r,o){t.f^=kt;for(var i=t.first;i!==null;){var l=i.f,a=(l&(pn|fr))!==0,s=a&&(l&kt)!==0,c=s||(l&Yt)!==0||C(this,mn).has(i);if(!c&&i.fn!==null){a?i.f^=kt:(l&Er)!==0?r.push(i):io(i)&&((l&On)!==0&&C(this,Pn).add(i),Tr(i));var u=i.first;if(u!==null){i=u;continue}}for(;i!==null;){var g=i.next;if(g!==null){i=g;break}i=i.parent}}},Ko=function(t){for(var r=0;r<t.length;r+=1)ya(t[r],C(this,Yn),C(this,Pn))},ka=function(){var g,h,p;for(const _ of Hn){var t=_.id<this.id,r=[];for(const[f,[w,b]]of this.current){if(_.current.has(f)){var o=_.current.get(f)[0];if(t&&w!==o)_.current.set(f,[w,b]);else continue}r.push(f)}var i=[..._.current.keys()].filter(f=>!this.current.has(f));if(i.length===0)t&&_.discard();else if(r.length>0){_.activate();var l=new Set,a=new Map;for(var s of r)Ca(s,i,l,a);a=new Map;var c=[..._.current.keys()].filter(f=>this.current.has(f)?this.current.get(f)[0]!==f:!0);for(const f of C(this,Xr))(f.f&(Qt|Yt|Wo))===0&&gi(f,c,a)&&((f.f&(ko|On))!==0?(mt(f,At),_.schedule(f)):C(_,Yn).add(f));if(C(_,Vt).length>0){_.apply();for(var u of C(_,Vt))ft(g=_,yt,Zo).call(g,u,[],[]);Ue(_,Vt,[])}_.deactivate()}}for(const _ of Hn)C(_,lr).has(this)&&(C(_,lr).delete(this),C(_,lr).size===0&&!ft(h=_,yt,fo).call(h)&&(_.activate(),ft(p=_,yt,po).call(p)))};let hr=wo;function ms(e){var t=Hr;Hr=!0;try{for(var r;;){if(fs(),Me===null)return r;Me.flush()}}finally{Hr=t}}function bs(){try{Yl()}catch(e){Wn(e,Jo)}}let un=null;function ji(e){var t=e.length;if(t!==0){for(var r=0;r<t;){var o=e[r++];if((o.f&(Qt|Yt))===0&&io(o)&&(un=new Set,Tr(o),o.deps===null&&o.first===null&&o.nodes===null&&o.teardown===null&&o.ac===null&&Ua(o),(un==null?void 0:un.size)>0)){Jn.clear();for(const i of un){if((i.f&(Qt|Yt))!==0)continue;const l=[i];let a=i.parent;for(;a!==null;)un.has(a)&&(un.delete(a),l.push(a)),a=a.parent;for(let s=l.length-1;s>=0;s--){const c=l[s];(c.f&(Qt|Yt))===0&&Tr(c)}}un.clear()}}un=null}}function Ca(e,t,r,o){if(!r.has(e)&&(r.add(e),e.reactions!==null))for(const i of e.reactions){const l=i.f;(l&Nt)!==0?Ca(i,t,r,o):(l&(ko|On))!==0&&(l&At)===0&&gi(i,t,o)&&(mt(i,At),_i(i))}}function gi(e,t,r){const o=r.get(e);if(o!==void 0)return o;if(e.deps!==null)for(const i of e.deps){if(Mr.call(t,i))return!0;if((i.f&Nt)!==0&&gi(i,t,r))return r.set(i,!0),!0}return r.set(e,!1),!1}function _i(e){Me.schedule(e)}function Sa(e,t){if(!((e.f&pn)!==0&&(e.f&kt)!==0)){(e.f&At)!==0?t.d.push(e):(e.f&Sn)!==0&&t.m.push(e),mt(e,kt);for(var r=e.first;r!==null;)Sa(r,t),r=r.next}}function Ma(e){mt(e,kt);for(var t=e.first;t!==null;)Ma(t),t=t.next}function ws(e){let t=0,r=Kn(0),o;return()=>{wi()&&(n(r),yi(()=>(t===0&&(o=qn(()=>e(()=>Br(r)))),t+=1,()=>{Fn(()=>{t-=1,t===0&&(o==null||o(),o=void 0,Br(r))})})))}}var ys=Zn|Ir;function xs(e,t,r,o){new $s(e,t,r,o)}var nn,ci,bn,sr,Ht,wn,Jt,dn,Tn,cr,Un,Sr,Vr,Jr,In,yo,Ct,ks,Cs,Ss,Qo,ho,go,ei;class $s{constructor(t,r,o,i){De(this,Ct);cn(this,"parent");cn(this,"is_pending",!1);cn(this,"transform_error");De(this,nn);De(this,ci,null);De(this,bn);De(this,sr);De(this,Ht);De(this,wn,null);De(this,Jt,null);De(this,dn,null);De(this,Tn,null);De(this,cr,0);De(this,Un,0);De(this,Sr,!1);De(this,Vr,new Set);De(this,Jr,new Set);De(this,In,null);De(this,yo,ws(()=>(Ue(this,In,Kn(C(this,cr))),()=>{Ue(this,In,null)})));var l;Ue(this,nn,t),Ue(this,bn,r),Ue(this,sr,a=>{var s=Ge;s.b=this,s.f|=Yo,o(a)}),this.parent=Ge.b,this.transform_error=i??((l=this.parent)==null?void 0:l.transform_error)??(a=>a),Ue(this,Ht,oo(()=>{ft(this,Ct,Qo).call(this)},ys))}defer_effect(t){ya(t,C(this,Vr),C(this,Jr))}is_rendered(){return!this.is_pending&&(!this.parent||this.parent.is_rendered())}has_pending_snippet(){return!!C(this,bn).pending}update_pending_count(t,r){ft(this,Ct,ei).call(this,t,r),Ue(this,cr,C(this,cr)+t),!(!C(this,In)||C(this,Sr))&&(Ue(this,Sr,!0),Fn(()=>{Ue(this,Sr,!1),C(this,In)&&Nr(C(this,In),C(this,cr))}))}get_effect_pending(){return C(this,yo).call(this),n(C(this,In))}error(t){var r=C(this,bn).onerror;let o=C(this,bn).failed;if(!r&&!o)throw t;C(this,wn)&&(Ft(C(this,wn)),Ue(this,wn,null)),C(this,Jt)&&(Ft(C(this,Jt)),Ue(this,Jt,null)),C(this,dn)&&(Ft(C(this,dn)),Ue(this,dn,null));var i=!1,l=!1;const a=()=>{if(i){us();return}i=!0,l&&Jl(),C(this,dn)!==null&&dr(C(this,dn),()=>{Ue(this,dn,null)}),ft(this,Ct,go).call(this,()=>{ft(this,Ct,Qo).call(this)})},s=c=>{try{l=!0,r==null||r(c,a),l=!1}catch(u){Wn(u,C(this,Ht)&&C(this,Ht).parent)}o&&Ue(this,dn,ft(this,Ct,go).call(this,()=>{try{return Gt(()=>{var u=Ge;u.b=this,u.f|=Yo,o(C(this,nn),()=>c,()=>a)})}catch(u){return Wn(u,C(this,Ht).parent),null}}))};Fn(()=>{var c;try{c=this.transform_error(t)}catch(u){Wn(u,C(this,Ht)&&C(this,Ht).parent);return}c!==null&&typeof c=="object"&&typeof c.then=="function"?c.then(s,u=>Wn(u,C(this,Ht)&&C(this,Ht).parent)):s(c)})}}nn=new WeakMap,ci=new WeakMap,bn=new WeakMap,sr=new WeakMap,Ht=new WeakMap,wn=new WeakMap,Jt=new WeakMap,dn=new WeakMap,Tn=new WeakMap,cr=new WeakMap,Un=new WeakMap,Sr=new WeakMap,Vr=new WeakMap,Jr=new WeakMap,In=new WeakMap,yo=new WeakMap,Ct=new WeakSet,ks=function(){try{Ue(this,wn,Gt(()=>C(this,sr).call(this,C(this,nn))))}catch(t){this.error(t)}},Cs=function(t){const r=C(this,bn).failed;r&&Ue(this,dn,Gt(()=>{r(C(this,nn),()=>t,()=>()=>{})}))},Ss=function(){const t=C(this,bn).pending;t&&(this.is_pending=!0,Ue(this,Jt,Gt(()=>t(C(this,nn)))),Fn(()=>{var r=Ue(this,Tn,document.createDocumentFragment()),o=jn();r.append(o),Ue(this,wn,ft(this,Ct,go).call(this,()=>Gt(()=>C(this,sr).call(this,o)))),C(this,Un)===0&&(C(this,nn).before(r),Ue(this,Tn,null),dr(C(this,Jt),()=>{Ue(this,Jt,null)}),ft(this,Ct,ho).call(this,Me))}))},Qo=function(){try{if(this.is_pending=this.has_pending_snippet(),Ue(this,Un,0),Ue(this,cr,0),Ue(this,wn,Gt(()=>{C(this,sr).call(this,C(this,nn))})),C(this,Un)>0){var t=Ue(this,Tn,document.createDocumentFragment());ki(C(this,wn),t);const r=C(this,bn).pending;Ue(this,Jt,Gt(()=>r(C(this,nn))))}else ft(this,Ct,ho).call(this,Me)}catch(r){this.error(r)}},ho=function(t){this.is_pending=!1,t.transfer_effects(C(this,Vr),C(this,Jr))},go=function(t){var r=Ge,o=He,i=gt;ln(C(this,Ht)),an(C(this,Ht)),zr(C(this,Ht).ctx);try{return hr.ensure(),t()}catch(l){return ba(l),null}finally{ln(r),an(o),zr(i)}},ei=function(t,r){var o;if(!this.has_pending_snippet()){this.parent&&ft(o=this.parent,Ct,ei).call(o,t,r);return}Ue(this,Un,C(this,Un)+t),C(this,Un)===0&&(ft(this,Ct,ho).call(this,r),C(this,Jt)&&dr(C(this,Jt),()=>{Ue(this,Jt,null)}),C(this,Tn)&&(C(this,nn).before(C(this,Tn)),Ue(this,Tn,null)))};function Ea(e,t,r,o){const i=eo()?to:mi;var l=e.filter(p=>!p.settled);if(r.length===0&&l.length===0){o(t.map(i));return}var a=Ge,s=Ms(),c=l.length===1?l[0].promise:l.length>1?Promise.all(l.map(p=>p.promise)):null;function u(p){s();try{o(p)}catch(_){(a.f&Qt)===0&&Wn(_,a)}bo()}if(r.length===0){c.then(()=>u(t.map(i)));return}var g=za();function h(){Promise.all(r.map(p=>Es(p))).then(p=>u([...t.map(i),...p])).catch(p=>Wn(p,a)).finally(()=>g())}c?c.then(()=>{s(),h(),bo()}):h()}function Ms(){var e=Ge,t=He,r=gt,o=Me;return function(l=!0){ln(e),an(t),zr(r),l&&(e.f&Qt)===0&&(o==null||o.activate(),o==null||o.apply())}}function bo(e=!0){ln(null),an(null),zr(null),e&&(Me==null||Me.deactivate())}function za(){var e=Ge,t=e.b,r=Me,o=t.is_rendered();return t.update_pending_count(1,r),r.increment(o,e),(i=!1)=>{t.update_pending_count(-1,r),r.decrement(o,e,i)}}function to(e){var t=Nt|At,r=He!==null&&(He.f&Nt)!==0?He:null;return Ge!==null&&(Ge.f|=Ir),{ctx:gt,deps:null,effects:null,equals:ha,f:t,fn:e,reactions:null,rv:0,v:Mt,wv:0,parent:r??Ge,ac:null}}function Es(e,t,r){let o=Ge;o===null&&Ll();var i=void 0,l=Kn(Mt),a=!He,s=new Map;return Ls(()=>{var _;var c=Ge,u=ca();i=u.promise;try{Promise.resolve(e()).then(u.resolve,u.reject).finally(bo)}catch(f){u.reject(f),bo()}var g=Me;if(a){if((c.f&mr)!==0)var h=za();if(o.b.is_rendered())(_=s.get(g))==null||_.reject(zn),s.delete(g);else{for(const f of s.values())f.reject(zn);s.clear()}s.set(g,u)}const p=(f,w=void 0)=>{if(h){var b=w===zn;h(b)}if(!(w===zn||(c.f&Qt)!==0)){if(g.activate(),w)l.f|=Vn,Nr(l,w);else{(l.f&Vn)!==0&&(l.f^=Vn),Nr(l,f);for(const[y,R]of s){if(s.delete(y),y===g)break;R.reject(zn)}}g.deactivate()}};u.promise.then(p,f=>p(null,f||"unknown"))}),ro(()=>{for(const c of s.values())c.reject(zn)}),new Promise(c=>{function u(g){function h(){g===i?c(l):u(i)}g.then(h,h)}u(i)})}function T(e){const t=to(e);return Va(t),t}function mi(e){const t=to(e);return t.equals=_a,t}function zs(e){var t=e.effects;if(t!==null){e.effects=null;for(var r=0;r<t.length;r+=1)Ft(t[r])}}function Ns(e){for(var t=e.parent;t!==null;){if((t.f&Nt)===0)return(t.f&Qt)===0?t:null;t=t.parent}return null}function bi(e){var t,r=Ge;ln(Ns(e));try{e.f&=~pr,zs(e),t=Qa(e)}finally{ln(r)}return t}function Na(e){var t=e.v,r=bi(e);if(!e.equals(r)&&(e.wv=Za(),(!(Me!=null&&Me.is_fork)||e.deps===null)&&(e.v=r,Me==null||Me.capture(e,t,!0),e.deps===null))){mt(e,kt);return}Qn||(It!==null?(wi()||Me!=null&&Me.is_fork)&&It.set(e,r):pi(e))}function Ps(e){var t,r;if(e.effects!==null)for(const o of e.effects)(o.teardown||o.ac)&&((t=o.teardown)==null||t.call(o),(r=o.ac)==null||r.abort(zn),o.teardown=An,o.ac=null,Yr(o,0),xi(o))}function Pa(e){if(e.effects!==null)for(const t of e.effects)t.teardown&&Tr(t)}let ti=new Set;const Jn=new Map;let Ta=!1;function Kn(e,t){var r={f:0,v:e,reactions:null,equals:ha,rv:0,wv:0};return r}function U(e,t){const r=Kn(e);return Va(r),r}function Ia(e,t=!1,r=!0){var i;const o=Kn(e);return t||(o.equals=_a),Ar&&r&&gt!==null&&gt.l!==null&&((i=gt.l).s??(i.s=[])).push(o),o}function m(e,t,r=!1){He!==null&&(!fn||(He.f&Wo)!==0)&&eo()&&(He.f&(Nt|On|ko|Wo))!==0&&(on===null||!Mr.call(on,e))&&Vl();let o=r?pt(t):t;return Nr(e,o,vo)}function Nr(e,t,r=null){if(!e.equals(t)){var o=e.v;Qn?Jn.set(e,t):Jn.set(e,o),e.v=t;var i=hr.ensure();if(i.capture(e,o),(e.f&Nt)!==0){const l=e;(e.f&At)!==0&&bi(l),It===null&&pi(l)}e.wv=Za(),Aa(e,At,r),eo()&&Ge!==null&&(Ge.f&kt)!==0&&(Ge.f&(pn|fr))===0&&(tn===null?Bs([e]):tn.push(e)),!i.is_fork&&ti.size>0&&!Ta&&Ts()}return t}function Ts(){Ta=!1;for(const e of ti)(e.f&kt)!==0&&mt(e,Sn),io(e)&&Tr(e);ti.clear()}function Ri(e,t=1){var r=n(e),o=t===1?r++:r--;return m(e,r),o}function Br(e){m(e,e.v+1)}function Aa(e,t,r){var o=e.reactions;if(o!==null)for(var i=eo(),l=o.length,a=0;a<l;a++){var s=o[a],c=s.f;if(!(!i&&s===Ge)){var u=(c&At)===0;if(u&&mt(s,t),(c&Nt)!==0){var g=s;It==null||It.delete(g),(c&pr)===0&&(c&rn&&(s.f|=pr),Aa(g,Sn,r))}else if(u){var h=s;(c&On)!==0&&un!==null&&un.add(h),r!==null?r.push(h):_i(h)}}}}function pt(e){if(typeof e!="object"||e===null||Cn in e)return e;const t=di(e);if(t!==Il&&t!==Al)return e;var r=new Map,o=ui(e),i=U(0),l=vr,a=s=>{if(vr===l)return s();var c=He,u=vr;an(null),Di(l);var g=s();return an(c),Di(u),g};return o&&r.set("length",U(e.length)),new Proxy(e,{defineProperty(s,c,u){(!("value"in u)||u.configurable===!1||u.enumerable===!1||u.writable===!1)&&Wl();var g=r.get(c);return g===void 0?a(()=>{var h=U(u.value);return r.set(c,h),h}):m(g,u.value,!0),!0},deleteProperty(s,c){var u=r.get(c);if(u===void 0){if(c in s){const g=a(()=>U(Mt));r.set(c,g),Br(i)}}else m(u,Mt),Br(i);return!0},get(s,c,u){var _;if(c===Cn)return e;var g=r.get(c),h=c in s;if(g===void 0&&(!h||(_=Xn(s,c))!=null&&_.writable)&&(g=a(()=>{var f=pt(h?s[c]:Mt),w=U(f);return w}),r.set(c,g)),g!==void 0){var p=n(g);return p===Mt?void 0:p}return Reflect.get(s,c,u)},getOwnPropertyDescriptor(s,c){var u=Reflect.getOwnPropertyDescriptor(s,c);if(u&&"value"in u){var g=r.get(c);g&&(u.value=n(g))}else if(u===void 0){var h=r.get(c),p=h==null?void 0:h.v;if(h!==void 0&&p!==Mt)return{enumerable:!0,configurable:!0,value:p,writable:!0}}return u},has(s,c){var p;if(c===Cn)return!0;var u=r.get(c),g=u!==void 0&&u.v!==Mt||Reflect.has(s,c);if(u!==void 0||Ge!==null&&(!g||(p=Xn(s,c))!=null&&p.writable)){u===void 0&&(u=a(()=>{var _=g?pt(s[c]):Mt,f=U(_);return f}),r.set(c,u));var h=n(u);if(h===Mt)return!1}return g},set(s,c,u,g){var q;var h=r.get(c),p=c in s;if(o&&c==="length")for(var _=u;_<h.v;_+=1){var f=r.get(_+"");f!==void 0?m(f,Mt):_ in s&&(f=a(()=>U(Mt)),r.set(_+"",f))}if(h===void 0)(!p||(q=Xn(s,c))!=null&&q.writable)&&(h=a(()=>U(void 0)),m(h,pt(u)),r.set(c,h));else{p=h.v!==Mt;var w=a(()=>pt(u));m(h,w)}var b=Reflect.getOwnPropertyDescriptor(s,c);if(b!=null&&b.set&&b.set.call(g,u),!p){if(o&&typeof c=="string"){var y=r.get("length"),R=Number(c);Number.isInteger(R)&&R>=y.v&&m(y,R+1)}Br(i)}return!0},ownKeys(s){n(i);var c=Reflect.ownKeys(s).filter(h=>{var p=r.get(h);return p===void 0||p.v!==Mt});for(var[u,g]of r)g.v!==Mt&&!(u in s)&&c.push(u);return c},setPrototypeOf(){Xl()}})}function Oi(e){try{if(e!==null&&typeof e=="object"&&Cn in e)return e[Cn]}catch{}return e}function Is(e,t){return Object.is(Oi(e),Oi(t))}var gr,Fa,ja,Ra;function As(){if(gr===void 0){gr=window,Fa=/Firefox/.test(navigator.userAgent);var e=Element.prototype,t=Node.prototype,r=Text.prototype;ja=Xn(t,"firstChild").get,Ra=Xn(t,"nextSibling").get,Ai(e)&&(e.__click=void 0,e.__className=void 0,e.__attributes=null,e.__style=void 0,e.__e=void 0),Ai(r)&&(r.__t=void 0)}}function jn(e=""){return document.createTextNode(e)}function Pr(e){return ja.call(e)}function no(e){return Ra.call(e)}function d(e,t){return Pr(e)}function oe(e,t=!1){{var r=Pr(e);return r instanceof Comment&&r.data===""?no(r):r}}function v(e,t=1,r=!1){let o=e;for(;t--;)o=no(o);return o}function Fs(e){e.textContent=""}function Oa(){return!1}function qa(e,t,r){return document.createElementNS(t??pa,e,void 0)}function La(e,t){if(t){const r=document.body;e.autofocus=!0,Fn(()=>{document.activeElement===r&&e.focus()})}}let qi=!1;function js(){qi||(qi=!0,document.addEventListener("reset",e=>{Promise.resolve().then(()=>{var t;if(!e.defaultPrevented)for(const r of e.target.elements)(t=r.__on_r)==null||t.call(r)})},{capture:!0}))}function Co(e){var t=He,r=Ge;an(null),ln(null);try{return e()}finally{an(t),ln(r)}}function Da(e,t,r,o=r){e.addEventListener(t,()=>Co(r));const i=e.__on_r;i?e.__on_r=()=>{i(),o(!0)}:e.__on_r=()=>o(!0),js()}function Ha(e){Ge===null&&(He===null&&Gl(),Bl()),Qn&&Hl()}function Rs(e,t){var r=t.last;r===null?t.last=t.first=e:(r.next=e,e.prev=r,t.last=e)}function hn(e,t){var r=Ge;r!==null&&(r.f&Yt)!==0&&(e|=Yt);var o={ctx:gt,deps:null,nodes:null,f:e|At|rn,first:null,fn:t,last:null,next:null,parent:r,b:r&&r.b,prev:null,teardown:null,wv:0,ac:null};Me==null||Me.register_created_effect(o);var i=o;if((e&Er)!==0)yr!==null?yr.push(o):hr.ensure().schedule(o);else if(t!==null){try{Tr(o)}catch(a){throw Ft(o),a}i.deps===null&&i.teardown===null&&i.nodes===null&&i.first===i.last&&(i.f&Ir)===0&&(i=i.first,(e&On)!==0&&(e&Zn)!==0&&i!==null&&(i.f|=Zn))}if(i!==null&&(i.parent=r,r!==null&&Rs(i,r),He!==null&&(He.f&Nt)!==0&&(e&fr)===0)){var l=He;(l.effects??(l.effects=[])).push(i)}return o}function wi(){return He!==null&&!fn}function ro(e){const t=hn(Qr,null);return mt(t,kt),t.teardown=e,t}function Wt(e){Ha();var t=Ge.f,r=!He&&(t&pn)!==0&&(t&mr)===0;if(r){var o=gt;(o.e??(o.e=[])).push(e)}else return Ba(e)}function Ba(e){return hn(Er|ua,e)}function Os(e){return Ha(),hn(Qr|ua,e)}function qs(e){hr.ensure();const t=hn(fr|Ir,e);return(r={})=>new Promise(o=>{r.outro?dr(t,()=>{Ft(t),o(void 0)}):(Ft(t),o(void 0))})}function So(e){return hn(Er,e)}function Ls(e){return hn(ko|Ir,e)}function yi(e,t=0){return hn(Qr|t,e)}function se(e,t=[],r=[],o=[]){Ea(o,t,r,i=>{hn(Qr,()=>e(...i.map(n)))})}function oo(e,t=0){var r=hn(On|t,e);return r}function Ga(e,t=0){var r=hn(vi|t,e);return r}function Gt(e){return hn(pn|Ir,e)}function Ya(e){var t=e.teardown;if(t!==null){const r=Qn,o=He;Li(!0),an(null);try{t.call(null)}finally{Li(r),an(o)}}}function xi(e,t=!1){var r=e.first;for(e.first=e.last=null;r!==null;){const i=r.ac;i!==null&&Co(()=>{i.abort(zn)});var o=r.next;(r.f&fr)!==0?r.parent=null:Ft(r,t),r=o}}function Ds(e){for(var t=e.first;t!==null;){var r=t.next;(t.f&pn)===0&&Ft(t),t=r}}function Ft(e,t=!0){var r=!1;(t||(e.f&Rl)!==0)&&e.nodes!==null&&e.nodes.end!==null&&(Hs(e.nodes.start,e.nodes.end),r=!0),mt(e,Uo),xi(e,t&&!r),Yr(e,0);var o=e.nodes&&e.nodes.t;if(o!==null)for(const l of o)l.stop();Ya(e),e.f^=Uo,e.f|=Qt;var i=e.parent;i!==null&&i.first!==null&&Ua(e),e.next=e.prev=e.teardown=e.ctx=e.deps=e.fn=e.nodes=e.ac=e.b=null}function Hs(e,t){for(;e!==null;){var r=e===t?null:no(e);e.remove(),e=r}}function Ua(e){var t=e.parent,r=e.prev,o=e.next;r!==null&&(r.next=o),o!==null&&(o.prev=r),t!==null&&(t.first===e&&(t.first=o),t.last===e&&(t.last=r))}function dr(e,t,r=!0){var o=[];Wa(e,o,!0);var i=()=>{r&&Ft(e),t&&t()},l=o.length;if(l>0){var a=()=>--l||i();for(var s of o)s.out(a)}else i()}function Wa(e,t,r){if((e.f&Yt)===0){e.f^=Yt;var o=e.nodes&&e.nodes.t;if(o!==null)for(const s of o)(s.is_global||r)&&t.push(s);for(var i=e.first;i!==null;){var l=i.next,a=(i.f&Zn)!==0||(i.f&pn)!==0&&(e.f&On)!==0;Wa(i,t,a?r:!1),i=l}}}function $i(e){Xa(e,!0)}function Xa(e,t){if((e.f&Yt)!==0){e.f^=Yt,(e.f&kt)===0&&(mt(e,At),hr.ensure().schedule(e));for(var r=e.first;r!==null;){var o=r.next,i=(r.f&Zn)!==0||(r.f&pn)!==0;Xa(r,i?t:!1),r=o}var l=e.nodes&&e.nodes.t;if(l!==null)for(const a of l)(a.is_global||t)&&a.in()}}function ki(e,t){if(e.nodes)for(var r=e.nodes.start,o=e.nodes.end;r!==null;){var i=r===o?null:no(r);t.append(r),r=i}}let _o=!1,Qn=!1;function Li(e){Qn=e}let He=null,fn=!1;function an(e){He=e}let Ge=null;function ln(e){Ge=e}let on=null;function Va(e){He!==null&&(on===null?on=[e]:on.push(e))}let Bt=null,Xt=0,tn=null;function Bs(e){tn=e}let Ja=1,ir=0,vr=ir;function Di(e){vr=e}function Za(){return++Ja}function io(e){var t=e.f;if((t&At)!==0)return!0;if(t&Nt&&(e.f&=~pr),(t&Sn)!==0){for(var r=e.deps,o=r.length,i=0;i<o;i++){var l=r[i];if(io(l)&&Na(l),l.wv>e.wv)return!0}(t&rn)!==0&&It===null&&mt(e,kt)}return!1}function Ka(e,t,r=!0){var o=e.reactions;if(o!==null&&!(on!==null&&Mr.call(on,e)))for(var i=0;i<o.length;i++){var l=o[i];(l.f&Nt)!==0?Ka(l,t,!1):t===l&&(r?mt(l,At):(l.f&kt)!==0&&mt(l,Sn),_i(l))}}function Qa(e){var w;var t=Bt,r=Xt,o=tn,i=He,l=on,a=gt,s=fn,c=vr,u=e.f;Bt=null,Xt=0,tn=null,He=(u&(pn|fr))===0?e:null,on=null,zr(e.ctx),fn=!1,vr=++ir,e.ac!==null&&(Co(()=>{e.ac.abort(zn)}),e.ac=null);try{e.f|=Xo;var g=e.fn,h=g();e.f|=mr;var p=e.deps,_=Me==null?void 0:Me.is_fork;if(Bt!==null){var f;if(_||Yr(e,Xt),p!==null&&Xt>0)for(p.length=Xt+Bt.length,f=0;f<Bt.length;f++)p[Xt+f]=Bt[f];else e.deps=p=Bt;if(wi()&&(e.f&rn)!==0)for(f=Xt;f<p.length;f++)((w=p[f]).reactions??(w.reactions=[])).push(e)}else!_&&p!==null&&Xt<p.length&&(Yr(e,Xt),p.length=Xt);if(eo()&&tn!==null&&!fn&&p!==null&&(e.f&(Nt|Sn|At))===0)for(f=0;f<tn.length;f++)Ka(tn[f],e);if(i!==null&&i!==e){if(ir++,i.deps!==null)for(let b=0;b<r;b+=1)i.deps[b].rv=ir;if(t!==null)for(const b of t)b.rv=ir;tn!==null&&(o===null?o=tn:o.push(...tn))}return(e.f&Vn)!==0&&(e.f^=Vn),h}catch(b){return ba(b)}finally{e.f^=Xo,Bt=t,Xt=r,tn=o,He=i,on=l,zr(a),fn=s,vr=c}}function Gs(e,t){let r=t.reactions;if(r!==null){var o=Tl.call(r,e);if(o!==-1){var i=r.length-1;i===0?r=t.reactions=null:(r[o]=r[i],r.pop())}}if(r===null&&(t.f&Nt)!==0&&(Bt===null||!Mr.call(Bt,t))){var l=t;(l.f&rn)!==0&&(l.f^=rn,l.f&=~pr),pi(l),Ps(l),Yr(l,0)}}function Yr(e,t){var r=e.deps;if(r!==null)for(var o=t;o<r.length;o++)Gs(e,r[o])}function Tr(e){var t=e.f;if((t&Qt)===0){mt(e,kt);var r=Ge,o=_o;Ge=e,_o=!0;try{(t&(On|vi))!==0?Ds(e):xi(e),Ya(e);var i=Qa(e);e.teardown=typeof i=="function"?i:null,e.wv=Ja;var l;Pl&&ds&&(e.f&At)!==0&&e.deps}finally{_o=o,Ge=r}}}async function Ys(){await Promise.resolve(),ms()}function n(e){var t=e.f,r=(t&Nt)!==0;if(He!==null&&!fn){var o=Ge!==null&&(Ge.f&Qt)!==0;if(!o&&(on===null||!Mr.call(on,e))){var i=He.deps;if((He.f&Xo)!==0)e.rv<ir&&(e.rv=ir,Bt===null&&i!==null&&i[Xt]===e?Xt++:Bt===null?Bt=[e]:Bt.push(e));else{(He.deps??(He.deps=[])).push(e);var l=e.reactions;l===null?e.reactions=[He]:Mr.call(l,He)||l.push(He)}}}if(Qn&&Jn.has(e))return Jn.get(e);if(r){var a=e;if(Qn){var s=a.v;return((a.f&kt)===0&&a.reactions!==null||tl(a))&&(s=bi(a)),Jn.set(a,s),s}var c=(a.f&rn)===0&&!fn&&He!==null&&(_o||(He.f&rn)!==0),u=(a.f&mr)===0;io(a)&&(c&&(a.f|=rn),Na(a)),c&&!u&&(Pa(a),el(a))}if(It!=null&&It.has(e))return It.get(e);if((e.f&Vn)!==0)throw e.v;return e.v}function el(e){if(e.f|=rn,e.deps!==null)for(const t of e.deps)(t.reactions??(t.reactions=[])).push(e),(t.f&Nt)!==0&&(t.f&rn)===0&&(Pa(t),el(t))}function tl(e){if(e.v===Mt)return!0;if(e.deps===null)return!1;for(const t of e.deps)if(Jn.has(t)||(t.f&Nt)!==0&&tl(t))return!0;return!1}function qn(e){var t=fn;try{return fn=!0,e()}finally{fn=t}}function rr(e){if(!(typeof e!="object"||!e||e instanceof EventTarget)){if(Cn in e)ni(e);else if(!Array.isArray(e))for(let t in e){const r=e[t];typeof r=="object"&&r&&Cn in r&&ni(r)}}}function ni(e,t=new Set){if(typeof e=="object"&&e!==null&&!(e instanceof EventTarget)&&!t.has(e)){t.add(e),e instanceof Date&&e.getTime();for(let o in e)try{ni(e[o],t)}catch{}const r=di(e);if(r!==Object.prototype&&r!==Array.prototype&&r!==Map.prototype&&r!==Set.prototype&&r!==Date.prototype){const o=sa(r);for(let i in o){const l=o[i].get;if(l)try{l.call(e)}catch{}}}}}function Us(e){return e.endsWith("capture")&&e!=="gotpointercapture"&&e!=="lostpointercapture"}const Ws=["beforeinput","click","change","dblclick","contextmenu","focusin","focusout","input","keydown","keyup","mousedown","mousemove","mouseout","mouseover","mouseup","pointerdown","pointermove","pointerout","pointerover","pointerup","touchend","touchmove","touchstart"];function Xs(e){return Ws.includes(e)}const Vs={formnovalidate:"formNoValidate",ismap:"isMap",nomodule:"noModule",playsinline:"playsInline",readonly:"readOnly",defaultvalue:"defaultValue",defaultchecked:"defaultChecked",srcobject:"srcObject",novalidate:"noValidate",allowfullscreen:"allowFullscreen",disablepictureinpicture:"disablePictureInPicture",disableremoteplayback:"disableRemotePlayback"};function Js(e){return e=e.toLowerCase(),Vs[e]??e}const Zs=["touchstart","touchmove"];function Ks(e){return Zs.includes(e)}const ar=Symbol("events"),nl=new Set,ri=new Set;function rl(e,t,r,o={}){function i(l){if(o.capture||oi.call(t,l),!l.cancelBubble)return Co(()=>r==null?void 0:r.call(this,l))}return e.startsWith("pointer")||e.startsWith("touch")||e==="wheel"?Fn(()=>{t.addEventListener(e,i,o)}):t.addEventListener(e,i,o),i}function zt(e,t,r,o,i){var l={capture:o,passive:i},a=rl(e,t,r,l);(t===document.body||t===window||t===document||t instanceof HTMLMediaElement)&&ro(()=>{t.removeEventListener(e,a,l)})}function $(e,t,r){(t[ar]??(t[ar]={}))[e]=r}function vt(e){for(var t=0;t<e.length;t++)nl.add(e[t]);for(var r of ri)r(e)}let Hi=null;function oi(e){var b,y;var t=this,r=t.ownerDocument,o=e.type,i=((b=e.composedPath)==null?void 0:b.call(e))||[],l=i[0]||e.target;Hi=e;var a=0,s=Hi===e&&e[ar];if(s){var c=i.indexOf(s);if(c!==-1&&(t===document||t===window)){e[ar]=t;return}var u=i.indexOf(t);if(u===-1)return;c<=u&&(a=c)}if(l=i[a]||e.target,l!==t){la(e,"currentTarget",{configurable:!0,get(){return l||r}});var g=He,h=Ge;an(null),ln(null);try{for(var p,_=[];l!==null;){var f=l.assignedSlot||l.parentNode||l.host||null;try{var w=(y=l[ar])==null?void 0:y[o];w!=null&&(!l.disabled||e.target===l)&&w.call(l,e)}catch(R){p?_.push(R):p=R}if(e.cancelBubble||f===t||f===null)break;l=f}if(p){for(let R of _)queueMicrotask(()=>{throw R});throw p}}finally{e[ar]=t,delete e.currentTarget,an(g),ln(h)}}}var ia;const Ao=((ia=globalThis==null?void 0:globalThis.window)==null?void 0:ia.trustedTypes)&&globalThis.window.trustedTypes.createPolicy("svelte-trusted-html",{createHTML:e=>e});function Qs(e){return(Ao==null?void 0:Ao.createHTML(e))??e}function ol(e){var t=qa("template");return t.innerHTML=Qs(e.replaceAll("<!>","<!---->")),t.content}function Ur(e,t){var r=Ge;r.nodes===null&&(r.nodes={start:e,end:t,a:null,t:null})}function D(e,t){var r=(t&is)!==0,o=(t&as)!==0,i,l=!e.startsWith("<!>");return()=>{i===void 0&&(i=ol(l?e:"<!>"+e),r||(i=Pr(i)));var a=o||Fa?document.importNode(i,!0):i.cloneNode(!0);if(r){var s=Pr(a),c=a.lastChild;Ur(s,c)}else Ur(a,a);return a}}function ec(e,t,r="svg"){var o=!e.startsWith("<!>"),i=`<${r}>${o?e:"<!>"+e}</${r}>`,l;return()=>{if(!l){var a=ol(i),s=Pr(a);l=Pr(s)}var c=l.cloneNode(!0);return Ur(c,c),c}}function Ci(e,t){return ec(e,t,"svg")}function ue(){var e=document.createDocumentFragment(),t=document.createComment(""),r=jn();return e.append(t,r),Ur(t,r),e}function x(e,t){e!==null&&e.before(t)}function Be(e,t){var r=t==null?"":typeof t=="object"?`${t}`:t;r!==(e.__t??(e.__t=e.nodeValue))&&(e.__t=r,e.nodeValue=`${r}`)}function tc(e,t){return nc(e,t)}const so=new Map;function nc(e,{target:t,anchor:r,props:o={},events:i,context:l,intro:a=!0,transformError:s}){As();var c=void 0,u=qs(()=>{var g=r??t.appendChild(jn());xs(g,{pending:()=>{}},_=>{lt({});var f=gt;l&&(f.c=l),i&&(o.$$events=i),c=e(_,o)||{},st()},s);var h=new Set,p=_=>{for(var f=0;f<_.length;f++){var w=_[f];if(!h.has(w)){h.add(w);var b=Ks(w);for(const q of[t,document]){var y=so.get(q);y===void 0&&(y=new Map,so.set(q,y));var R=y.get(w);R===void 0?(q.addEventListener(w,oi,{passive:b}),y.set(w,1)):y.set(w,R+1)}}}};return p($o(nl)),ri.add(p),()=>{var b;for(var _ of h)for(const y of[t,document]){var f=so.get(y),w=f.get(_);--w==0?(y.removeEventListener(_,oi),f.delete(_),f.size===0&&so.delete(y)):f.set(_,w)}ri.delete(p),g!==r&&((b=g.parentNode)==null||b.removeChild(g))}});return rc.set(c,u),c}let rc=new WeakMap;var vn,yn,Zt,ur,Zr,Kr,xo;class Si{constructor(t,r=!0){cn(this,"anchor");De(this,vn,new Map);De(this,yn,new Map);De(this,Zt,new Map);De(this,ur,new Set);De(this,Zr,!0);De(this,Kr,t=>{if(C(this,vn).has(t)){var r=C(this,vn).get(t),o=C(this,yn).get(r);if(o)$i(o),C(this,ur).delete(r);else{var i=C(this,Zt).get(r);i&&(C(this,yn).set(r,i.effect),C(this,Zt).delete(r),i.fragment.lastChild.remove(),this.anchor.before(i.fragment),o=i.effect)}for(const[l,a]of C(this,vn)){if(C(this,vn).delete(l),l===t)break;const s=C(this,Zt).get(a);s&&(Ft(s.effect),C(this,Zt).delete(a))}for(const[l,a]of C(this,yn)){if(l===r||C(this,ur).has(l))continue;const s=()=>{if(Array.from(C(this,vn).values()).includes(l)){var u=document.createDocumentFragment();ki(a,u),u.append(jn()),C(this,Zt).set(l,{effect:a,fragment:u})}else Ft(a);C(this,ur).delete(l),C(this,yn).delete(l)};C(this,Zr)||!o?(C(this,ur).add(l),dr(a,s,!1)):s()}}});De(this,xo,t=>{C(this,vn).delete(t);const r=Array.from(C(this,vn).values());for(const[o,i]of C(this,Zt))r.includes(o)||(Ft(i.effect),C(this,Zt).delete(o))});this.anchor=t,Ue(this,Zr,r)}ensure(t,r){var o=Me,i=Oa();if(r&&!C(this,yn).has(t)&&!C(this,Zt).has(t))if(i){var l=document.createDocumentFragment(),a=jn();l.append(a),C(this,Zt).set(t,{effect:Gt(()=>r(a)),fragment:l})}else C(this,yn).set(t,Gt(()=>r(this.anchor)));if(C(this,vn).set(o,t),i){for(const[s,c]of C(this,yn))s===t?o.unskip_effect(c):o.skip_effect(c);for(const[s,c]of C(this,Zt))s===t?o.unskip_effect(c.effect):o.skip_effect(c.effect);o.oncommit(C(this,Kr)),o.ondiscard(C(this,xo))}else C(this,Kr).call(this,o)}}vn=new WeakMap,yn=new WeakMap,Zt=new WeakMap,ur=new WeakMap,Zr=new WeakMap,Kr=new WeakMap,xo=new WeakMap;function xe(e,t,r=!1){var o=new Si(e),i=r?Zn:0;function l(a,s){o.ensure(a,s)}oo(()=>{var a=!1;t((s,c=0)=>{a=!0,l(c,s)}),a||l(-1,null)},i)}function ht(e,t){return t}function oc(e,t,r){for(var o=[],i=t.length,l,a=t.length,s=0;s<i;s++){let h=t[s];dr(h,()=>{if(l){if(l.pending.delete(h),l.done.add(h),l.pending.size===0){var p=e.outrogroups;ii(e,$o(l.done)),p.delete(l),p.size===0&&(e.outrogroups=null)}}else a-=1},!1)}if(a===0){var c=o.length===0&&r!==null;if(c){var u=r,g=u.parentNode;Fs(g),g.append(u),e.items.clear()}ii(e,t,!c)}else l={pending:new Set(t),done:new Set},(e.outrogroups??(e.outrogroups=new Set)).add(l)}function ii(e,t,r=!0){var o;if(e.pending.size>0){o=new Set;for(const a of e.pending.values())for(const s of a)o.add(e.items.get(s).e)}for(var i=0;i<t.length;i++){var l=t[i];if(o!=null&&o.has(l)){l.f|=kn;const a=document.createDocumentFragment();ki(l,a)}else Ft(t[i],r)}}var Bi;function it(e,t,r,o,i,l=null){var a=e,s=new Map,c=(t&va)!==0;if(c){var u=e;a=u.appendChild(jn())}var g=null,h=mi(()=>{var q=r();return ui(q)?q:q==null?[]:$o(q)}),p,_=new Map,f=!0;function w(q){(R.effect.f&Qt)===0&&(R.pending.delete(q),R.fallback=g,ic(R,p,a,t,o),g!==null&&(p.length===0?(g.f&kn)===0?$i(g):(g.f^=kn,Dr(g,null,a)):dr(g,()=>{g=null})))}function b(q){R.pending.delete(q)}var y=oo(()=>{p=n(h);for(var q=p.length,z=new Set,N=Me,O=Oa(),M=0;M<q;M+=1){var P=p[M],Q=o(P,M),H=f?null:s.get(Q);H?(H.v&&Nr(H.v,P),H.i&&Nr(H.i,M),O&&N.unskip_effect(H.e)):(H=ac(s,f?a:Bi??(Bi=jn()),P,Q,M,i,t,r),f||(H.e.f|=kn),s.set(Q,H)),z.add(Q)}if(q===0&&l&&!g&&(f?g=Gt(()=>l(a)):(g=Gt(()=>l(Bi??(Bi=jn()))),g.f|=kn)),q>z.size&&Dl(),!f)if(_.set(N,z),O){for(const[A,K]of s)z.has(A)||N.skip_effect(K.e);N.oncommit(w),N.ondiscard(b)}else w(N);n(h)}),R={effect:y,items:s,pending:_,outrogroups:null,fallback:g};f=!1}function Rr(e){for(;e!==null&&(e.f&pn)===0;)e=e.next;return e}function ic(e,t,r,o,i){var H,A,K,pe,de,L,G,j,W;var l=(o&Ql)!==0,a=t.length,s=e.items,c=Rr(e.effect.first),u,g=null,h,p=[],_=[],f,w,b,y;if(l)for(y=0;y<a;y+=1)f=t[y],w=i(f,y),b=s.get(w).e,(b.f&kn)===0&&((A=(H=b.nodes)==null?void 0:H.a)==null||A.measure(),(h??(h=new Set)).add(b));for(y=0;y<a;y+=1){if(f=t[y],w=i(f,y),b=s.get(w).e,e.outrogroups!==null)for(const te of e.outrogroups)te.pending.delete(b),te.done.delete(b);if((b.f&Yt)!==0&&($i(b),l&&((pe=(K=b.nodes)==null?void 0:K.a)==null||pe.unfix(),(h??(h=new Set)).delete(b))),(b.f&kn)!==0)if(b.f^=kn,b===c)Dr(b,null,r);else{var R=g?g.next:c;b===e.effect.last&&(e.effect.last=b.prev),b.prev&&(b.prev.next=b.next),b.next&&(b.next.prev=b.prev),Bn(e,g,b),Bn(e,b,R),Dr(b,R,r),g=b,p=[],_=[],c=Rr(g.next);continue}if(b!==c){if(u!==void 0&&u.has(b)){if(p.length<_.length){var q=_[0],z;g=q.prev;var N=p[0],O=p[p.length-1];for(z=0;z<p.length;z+=1)Dr(p[z],q,r);for(z=0;z<_.length;z+=1)u.delete(_[z]);Bn(e,N.prev,O.next),Bn(e,g,N),Bn(e,O,q),c=q,g=O,y-=1,p=[],_=[]}else u.delete(b),Dr(b,c,r),Bn(e,b.prev,b.next),Bn(e,b,g===null?e.effect.first:g.next),Bn(e,g,b),g=b;continue}for(p=[],_=[];c!==null&&c!==b;)(u??(u=new Set)).add(c),_.push(c),c=Rr(c.next);if(c===null)continue}(b.f&kn)===0&&p.push(b),g=b,c=Rr(b.next)}if(e.outrogroups!==null){for(const te of e.outrogroups)te.pending.size===0&&(ii(e,$o(te.done)),(de=e.outrogroups)==null||de.delete(te));e.outrogroups.size===0&&(e.outrogroups=null)}if(c!==null||u!==void 0){var M=[];if(u!==void 0)for(b of u)(b.f&Yt)===0&&M.push(b);for(;c!==null;)(c.f&Yt)===0&&c!==e.fallback&&M.push(c),c=Rr(c.next);var P=M.length;if(P>0){var Q=(o&va)!==0&&a===0?r:null;if(l){for(y=0;y<P;y+=1)(G=(L=M[y].nodes)==null?void 0:L.a)==null||G.measure();for(y=0;y<P;y+=1)(W=(j=M[y].nodes)==null?void 0:j.a)==null||W.fix()}oc(e,M,Q)}}l&&Fn(()=>{var te,ve;if(h!==void 0)for(b of h)(ve=(te=b.nodes)==null?void 0:te.a)==null||ve.apply()})}function ac(e,t,r,o,i,l,a,s){var c=(a&Zl)!==0?(a&es)===0?Ia(r,!1,!1):Kn(r):null,u=(a&Kl)!==0?Kn(i):null;return{v:c,i:u,e:Gt(()=>(l(t,c??r,u??i,s),()=>{e.delete(o)}))}}function Dr(e,t,r){if(e.nodes)for(var o=e.nodes.start,i=e.nodes.end,l=t&&(t.f&kn)===0?t.nodes.start:r;o!==null;){var a=no(o);if(l.before(o),o===i)return;o=a}}function Bn(e,t,r){t===null?e.effect.first=r:t.next=r,r===null?e.effect.last=t:r.prev=t}function ge(e,t,r,o,i){var s;var l=(s=t.$$slots)==null?void 0:s[r],a=!1;l===!0&&(l=t.children,a=!0),l===void 0||l(e,a?()=>o:o)}function ai(e,t,r){var o=new Si(e);oo(()=>{var i=t()??null;o.ensure(i,i&&(l=>r(l,i)))},Zn)}function lc(e,t,r,o,i,l){var a=null,s=e,c=new Si(s,!1);oo(()=>{const u=t()||null;var g=ls;if(u===null){c.ensure(null,null);return}return c.ensure(u,h=>{if(u){if(a=qa(u,g),Ur(a,a),o){var p=a.appendChild(jn());o(a,p)}Ge.nodes.end=a,h.before(a)}}),()=>{}},Zn),ro(()=>{})}function sc(e,t){var r=void 0,o;Ga(()=>{r!==(r=t())&&(o&&(Ft(o),o=null),r&&(o=Gt(()=>{So(()=>r(e))})))})}function il(e){var t,r,o="";if(typeof e=="string"||typeof e=="number")o+=e;else if(typeof e=="object")if(Array.isArray(e)){var i=e.length;for(t=0;t<i;t++)e[t]&&(r=il(e[t]))&&(o&&(o+=" "),o+=r)}else for(r in e)e[r]&&(o&&(o+=" "),o+=r);return o}function cc(){for(var e,t,r=0,o="",i=arguments.length;r<i;r++)(e=arguments[r])&&(t=il(e))&&(o&&(o+=" "),o+=t);return o}function uc(e){return typeof e=="object"?cc(e):e??""}const Gi=[...` 	
\r\f \v\uFEFF`];function dc(e,t,r){var o=e==null?"":""+e;if(t&&(o=o?o+" "+t:t),r){for(var i of Object.keys(r))if(r[i])o=o?o+" "+i:i;else if(o.length)for(var l=i.length,a=0;(a=o.indexOf(i,a))>=0;){var s=a+l;(a===0||Gi.includes(o[a-1]))&&(s===o.length||Gi.includes(o[s]))?o=(a===0?"":o.substring(0,a))+o.substring(s+1):a=s}}return o===""?null:o}function Yi(e,t=!1){var r=t?" !important;":";",o="";for(var i of Object.keys(e)){var l=e[i];l!=null&&l!==""&&(o+=" "+i+": "+l+r)}return o}function Fo(e){return e[0]!=="-"||e[1]!=="-"?e.toLowerCase():e}function vc(e,t){if(t){var r="",o,i;if(Array.isArray(t)?(o=t[0],i=t[1]):o=t,e){e=String(e).replaceAll(/\s*\/\*.*?\*\/\s*/g,"").trim();var l=!1,a=0,s=!1,c=[];o&&c.push(...Object.keys(o).map(Fo)),i&&c.push(...Object.keys(i).map(Fo));var u=0,g=-1;const w=e.length;for(var h=0;h<w;h++){var p=e[h];if(s?p==="/"&&e[h-1]==="*"&&(s=!1):l?l===p&&(l=!1):p==="/"&&e[h+1]==="*"?s=!0:p==='"'||p==="'"?l=p:p==="("?a++:p===")"&&a--,!s&&l===!1&&a===0){if(p===":"&&g===-1)g=h;else if(p===";"||h===w-1){if(g!==-1){var _=Fo(e.substring(u,g).trim());if(!c.includes(_)){p!==";"&&h++;var f=e.substring(u,h).trim();r+=" "+f+";"}}u=h+1,g=-1}}}}return o&&(r+=Yi(o)),i&&(r+=Yi(i,!0)),r=r.trim(),r===""?null:r}return e==null?null:String(e)}function qe(e,t,r,o,i,l){var a=e.__className;if(a!==r||a===void 0){var s=dc(r,o,l);s==null?e.removeAttribute("class"):t?e.className=s:e.setAttribute("class",s),e.__className=r}else if(l&&i!==l)for(var c in l){var u=!!l[c];(i==null||u!==!!i[c])&&e.classList.toggle(c,u)}return l}function jo(e,t={},r,o){for(var i in r){var l=r[i];t[i]!==l&&(r[i]==null?e.style.removeProperty(i):e.style.setProperty(i,l,o))}}function ke(e,t,r,o){var i=e.__style;if(i!==t){var l=vc(t,o);l==null?e.removeAttribute("style"):e.style.cssText=l,e.__style=t}else o&&(Array.isArray(o)?(jo(e,r==null?void 0:r[0],o[0]),jo(e,r==null?void 0:r[1],o[1],"important")):jo(e,r,o));return o}function _r(e,t,r=!1){if(e.multiple){if(t==null)return;if(!ui(t))return cs();for(var o of e.options)o.selected=t.includes(Gr(o));return}for(o of e.options){var i=Gr(o);if(Is(i,t)){o.selected=!0;return}}(!r||t!==void 0)&&(e.selectedIndex=-1)}function ao(e){var t=new MutationObserver(()=>{_r(e,e.__value)});t.observe(e,{childList:!0,subtree:!0,attributes:!0,attributeFilter:["value"]}),ro(()=>{t.disconnect()})}function xr(e,t,r=t){var o=new WeakSet,i=!0;Da(e,"change",l=>{var a=l?"[selected]":":checked",s;if(e.multiple)s=[].map.call(e.querySelectorAll(a),Gr);else{var c=e.querySelector(a)??e.querySelector("option:not([disabled])");s=c&&Gr(c)}r(s),e.__value=s,Me!==null&&o.add(Me)}),So(()=>{var l=t();if(e===document.activeElement){var a=Me;if(o.has(a))return}if(_r(e,l,i),i&&l===void 0){var s=e.querySelector(":checked");s!==null&&(l=Gr(s),r(l))}e.__value=l,i=!1}),ao(e)}function Gr(e){return"__value"in e?e.__value:e.value}const Or=Symbol("class"),qr=Symbol("style"),al=Symbol("is custom element"),ll=Symbol("is html"),fc=fi?"option":"OPTION",pc=fi?"select":"SELECT",hc=fi?"progress":"PROGRESS";function Et(e,t){var r=Mi(e);r.value===(r.value=t??void 0)||e.value===t&&(t!==0||e.nodeName!==hc)||(e.value=t??"")}function gc(e,t){t?e.hasAttribute("selected")||e.setAttribute("selected",""):e.removeAttribute("selected")}function Ve(e,t,r,o){var i=Mi(e);i[t]!==(i[t]=r)&&(t==="loading"&&(e[Ol]=r),r==null?e.removeAttribute(t):typeof r!="string"&&sl(e).includes(t)?e[t]=r:e.setAttribute(t,r))}function _c(e,t,r,o,i=!1,l=!1){var a=Mi(e),s=a[al],c=!a[ll],u=t||{},g=e.nodeName===fc;for(var h in t)h in r||(r[h]=null);r.class?r.class=uc(r.class):r[Or]&&(r.class=null),r[qr]&&(r.style??(r.style=null));var p=sl(e);for(const z in r){let N=r[z];if(g&&z==="value"&&N==null){e.value=e.__value="",u[z]=N;continue}if(z==="class"){var _=e.namespaceURI==="http://www.w3.org/1999/xhtml";qe(e,_,N,o,t==null?void 0:t[Or],r[Or]),u[z]=N,u[Or]=r[Or];continue}if(z==="style"){ke(e,N,t==null?void 0:t[qr],r[qr]),u[z]=N,u[qr]=r[qr];continue}var f=u[z];if(!(N===f&&!(N===void 0&&e.hasAttribute(z)))){u[z]=N;var w=z[0]+z[1];if(w!=="$$")if(w==="on"){const O={},M="$$"+z;let P=z.slice(2);var b=Xs(P);if(Us(P)&&(P=P.slice(0,-7),O.capture=!0),!b&&f){if(N!=null)continue;e.removeEventListener(P,u[M],O),u[M]=null}if(b)$(P,e,N),vt([P]);else if(N!=null){let Q=function(H){u[z].call(this,H)};var q=Q;u[M]=rl(P,e,Q,O)}}else if(z==="style")Ve(e,z,N);else if(z==="autofocus")La(e,!!N);else if(!s&&(z==="__value"||z==="value"&&N!=null))e.value=e.__value=N;else if(z==="selected"&&g)gc(e,N);else{var y=z;c||(y=Js(y));var R=y==="defaultValue"||y==="defaultChecked";if(N==null&&!s&&!R)if(a[z]=null,y==="value"||y==="checked"){let O=e;const M=t===void 0;if(y==="value"){let P=O.defaultValue;O.removeAttribute(y),O.defaultValue=P,O.value=O.__value=M?P:null}else{let P=O.defaultChecked;O.removeAttribute(y),O.defaultChecked=P,O.checked=M?P:!1}}else e.removeAttribute(z);else R||p.includes(y)&&(s||typeof N!="string")?(e[y]=N,y in a&&(a[y]=Mt)):typeof N!="function"&&Ve(e,y,N)}}}return u}function Ui(e,t,r=[],o=[],i=[],l,a=!1,s=!1){Ea(i,r,o,c=>{var u=void 0,g={},h=e.nodeName===pc,p=!1;if(Ga(()=>{var f=t(...c.map(n)),w=_c(e,u,f,l,a,s);p&&h&&"value"in f&&_r(e,f.value);for(let y of Object.getOwnPropertySymbols(g))f[y]||Ft(g[y]);for(let y of Object.getOwnPropertySymbols(f)){var b=f[y];y.description===ss&&(!u||b!==u[y])&&(g[y]&&Ft(g[y]),g[y]=Gt(()=>sc(e,()=>b))),w[y]=b}u=w}),h){var _=e;So(()=>{_r(_,u.value,!0),ao(_)})}p=!0})}function Mi(e){return e.__attributes??(e.__attributes={[al]:e.nodeName.includes("-"),[ll]:e.namespaceURI===pa})}var Wi=new Map;function sl(e){var t=e.getAttribute("is")||e.nodeName,r=Wi.get(t);if(r)return r;Wi.set(t,r=[]);for(var o,i=e,l=Element.prototype;l!==i;){o=sa(i);for(var a in o)o[a].set&&r.push(a);i=di(i)}return r}function Ei(e,t,r=t){var o=new WeakSet;Da(e,"input",async i=>{var l=i?e.defaultValue:e.value;if(l=Ro(e)?Oo(l):l,r(l),Me!==null&&o.add(Me),await Ys(),l!==(l=t())){var a=e.selectionStart,s=e.selectionEnd,c=e.value.length;if(e.value=l??"",s!==null){var u=e.value.length;a===s&&s===c&&u>c?(e.selectionStart=u,e.selectionEnd=u):(e.selectionStart=a,e.selectionEnd=Math.min(s,u))}}}),qn(t)==null&&e.value&&(r(Ro(e)?Oo(e.value):e.value),Me!==null&&o.add(Me)),yi(()=>{var i=t();if(e===document.activeElement){var l=Me;if(o.has(l))return}Ro(e)&&i===Oo(e.value)||e.type==="date"&&!i&&!e.value||i!==e.value&&(e.value=i??"")})}function Ro(e){var t=e.type;return t==="number"||t==="range"}function Oo(e){return e===""?null:+e}function Xi(e,t){return e===t||(e==null?void 0:e[Cn])===t}function Rn(e={},t,r,o){var i=gt.r,l=Ge;return So(()=>{var a,s;return yi(()=>{a=s,s=[],qn(()=>{e!==r(...s)&&(t(e,...s),a&&Xi(r(...a),e)&&t(null,...a))})}),()=>{let c=l;for(;c!==i&&c.parent!==null&&c.parent.f&Uo;)c=c.parent;const u=()=>{s&&Xi(r(...s),e)&&t(null,...s)},g=c.teardown;c.teardown=()=>{u(),g==null||g()}}}),e}function mc(e=!1){const t=gt,r=t.l.u;if(!r)return;let o=()=>rr(t.s);if(e){let i=0,l={};const a=to(()=>{let s=!1;const c=t.s;for(const u in c)c[u]!==l[u]&&(l[u]=c[u],s=!0);return s&&i++,i});o=()=>n(a)}r.b.length&&Os(()=>{Vi(t,o),mo(r.b)}),Wt(()=>{const i=qn(()=>r.m.map(Fl));return()=>{for(const l of i)typeof l=="function"&&l()}}),r.a.length&&Wt(()=>{Vi(t,o),mo(r.a)})}function Vi(e,t){if(e.l.s)for(const r of e.l.s)n(r);t()}const bc={get(e,t){if(!e.exclude.includes(t))return n(e.version),t in e.special?e.special[t]():e.props[t]},set(e,t,r){if(!(t in e.special)){var o=Ge;try{ln(e.parent_effect),e.special[t]=We({get[t](){return e.props[t]}},t,fa)}finally{ln(o)}}return e.special[t](r),Ri(e.version),!0},getOwnPropertyDescriptor(e,t){if(!e.exclude.includes(t)&&t in e.props)return{enumerable:!0,configurable:!0,value:e.props[t]}},deleteProperty(e,t){return e.exclude.includes(t)||(e.exclude.push(t),Ri(e.version)),!0},has(e,t){return e.exclude.includes(t)?!1:t in e.props},ownKeys(e){return Reflect.ownKeys(e.props).filter(t=>!e.exclude.includes(t))}};function he(e,t){return new Proxy({props:e,exclude:t,special:{},version:Kn(0),parent_effect:Ge},bc)}const wc={get(e,t){let r=e.props.length;for(;r--;){let o=e.props[r];if(jr(o)&&(o=o()),typeof o=="object"&&o!==null&&t in o)return o[t]}},set(e,t,r){let o=e.props.length;for(;o--;){let i=e.props[o];jr(i)&&(i=i());const l=Xn(i,t);if(l&&l.set)return l.set(r),!0}return!1},getOwnPropertyDescriptor(e,t){let r=e.props.length;for(;r--;){let o=e.props[r];if(jr(o)&&(o=o()),typeof o=="object"&&o!==null&&t in o){const i=Xn(o,t);return i&&!i.configurable&&(i.configurable=!0),i}}},has(e,t){if(t===Cn||t===da)return!1;for(let r of e.props)if(jr(r)&&(r=r()),r!=null&&t in r)return!0;return!1},ownKeys(e){const t=[];for(let r of e.props)if(jr(r)&&(r=r()),!!r){for(const o in r)t.includes(o)||t.push(o);for(const o of Object.getOwnPropertySymbols(r))t.includes(o)||t.push(o)}return t}};function be(...e){return new Proxy({props:e},wc)}function We(e,t,r,o){var q;var i=!Ar||(r&ns)!==0,l=(r&rs)!==0,a=(r&os)!==0,s=o,c=!0,u=()=>(c&&(c=!1,s=a?qn(o):o),s);let g;if(l){var h=Cn in e||da in e;g=((q=Xn(e,t))==null?void 0:q.set)??(h&&t in e?z=>e[t]=z:void 0)}var p,_=!1;l?[p,_]=gs(()=>e[t]):p=e[t],p===void 0&&o!==void 0&&(p=u(),g&&(i&&Ul(),g(p)));var f;if(i?f=()=>{var z=e[t];return z===void 0?u():(c=!0,z)}:f=()=>{var z=e[t];return z!==void 0&&(s=void 0),z===void 0?s:z},i&&(r&fa)===0)return f;if(g){var w=e.$$legacy;return(function(z,N){return arguments.length>0?((!i||!N||w||_)&&g(N?f():z),z):f()})}var b=!1,y=((r&ts)!==0?to:mi)(()=>(b=!1,f()));l&&n(y);var R=Ge;return(function(z,N){if(arguments.length>0){const O=N?n(y):i&&l?pt(z):z;return m(y,O),b=!0,s!==void 0&&(s=O),z}return Qn&&b||(R.f&Qt)!==0?y.v:n(y)})}function cl(e){gt===null&&ql(),Ar&&gt.l!==null?yc(gt).m.push(e):Wt(()=>{const t=qn(e);if(typeof t=="function")return t})}function yc(e){var t=e.l;return t.u??(t.u={a:[],b:[],m:[]})}const xc="5";var aa;typeof window<"u"&&((aa=window.__svelte??(window.__svelte={})).v??(aa.v=new Set)).add(xc);function gn(){return typeof window<"u"&&window.__JUCE__&&window.__JUCE__.backend}function $c(){gn()&&window.__JUCE__.backend.emitEvent("closeApplication",{})}function kc(e,t){if(!gn()){console.warn("[bridge] No JUCE backend — savePanelAs ignored");return}window.__JUCE__.backend.emitEvent("savePanelAs",{panelId:String(e),data:t})}function Cc(e,t,r){if(!gn()){console.warn("[bridge] No JUCE backend — savePanel ignored");return}window.__JUCE__.backend.emitEvent("savePanel",{panelId:String(e),filePath:t,data:r})}function Sc(){if(!gn()){console.warn("[bridge] No JUCE backend — openPanel ignored");return}window.__JUCE__.backend.emitEvent("openPanel",{})}function Mc(e){gn()&&window.__JUCE__.backend.emitEvent("openPanelFile",{filePath:e})}function Ec(){gn()&&window.__JUCE__.backend.emitEvent("loadOpenPanels",{})}function zc(e){gn()&&window.__JUCE__.backend.emitEvent("updateOpenPanels",e)}function Nc(e){if(!gn())return()=>{};const t=window.__JUCE__.backend.addEventListener("panelSaved",e);return()=>window.__JUCE__.backend.removeEventListener(t)}function Pc(e){if(!gn())return()=>{};const t=window.__JUCE__.backend.addEventListener("panelOpened",e);return()=>window.__JUCE__.backend.removeEventListener(t)}function Tc(e){if(!gn())return()=>{};const t=window.__JUCE__.backend.addEventListener("openPanelPaths",e);return()=>window.__JUCE__.backend.removeEventListener(t)}let ul=1;function dl(e=null){const t=ul++;return{id:t,name:e??`Untitled ${t}`,filePath:null,width:600,height:400,bgColour:"333333",bgMode:"solid",bgGradient:{type:"linear",angle:90,centerX:50,centerY:50,radiusX:50,radiusY:50,edge:0,stops:[{color:"FF0000",position:0},{color:"0000FF",position:100}]},gridEnabled:!0,gridSize:10,gridColour:"33FFFFFF",snapToGrid:!0,notepad:{notes:[{name:"Note 1",content:""}],activeNoteIndex:0},viewer:{images:[],activeImageIndex:0},modified:!1,controls:[]}}const Mn=er(null),Gn=er(100),Ji=er(10),Pt=er([]),jt=er(null),zi=xa([Pt,jt],([e,t])=>e.find(r=>r.id===t)??null);function Ni(e=null){const t=e??dl();return Pt.update(r=>[...r,t]),jt.set(t.id),t}function li(e){Pt.update(t=>{const r=t.findIndex(i=>i.id===e),o=t.filter(i=>i.id!==e);return jt.update(i=>{if(i!==e)return i;if(o.length===0)return null;const l=Math.min(r,o.length-1);return o[l].id}),o}),si()}function Ic(e){jt.set(e)}function Kt(e,t){Pt.update(r=>r.map(o=>o.id===e?{...o,...t}:o))}function vl(e){const{id:t,modified:r,...o}=e;return JSON.stringify(o,null,2)}function Ac(e,t,r){const o=JSON.parse(e),i=ul++;return{...dl(),...o,id:i,filePath:t,name:r||o.name||`Untitled ${i}`,modified:!1}}function Fc(){const e=Ut(zi);e&&(e.filePath?Cc(String(e.id),e.filePath,vl(e)):fl())}function fl(){const e=Ut(zi);e&&kc(String(e.id),vl(e))}function jc(){Sc()}function si(){const t=Ut(Pt).filter(r=>r.filePath).map(r=>r.filePath);zc(t)}function Rc(){Nc(e=>{const t=parseInt(e.panelId,10),r={filePath:e.filePath,modified:!1};e.name&&(r.name=e.name),Pt.update(o=>o.map(i=>i.id===t?{...i,...r}:i)),si()}),Pc(e=>{const t=Ut(Pt).find(o=>o.filePath===e.filePath);if(t){jt.set(t.id);return}const r=Ac(e.data,e.filePath,e.name);Ni(r),si()}),Tc(e=>{if(Array.isArray(e))for(const t of e)Mc(t)}),Ec()}const qo={Core:{_type:"Core",name:"",controlType:"",visible:!0,enabled:!0,locked:!1,zIndex:0,alwaysOnTop:!1,layer:"Main"},Transform:{_type:"Transform",x:0,y:0,width:100,height:40,opacity:1,rotation:0},Background:{_type:"Background",mode:"solid",_children:{Fill:{_type:"Fill",mode:"solid",colour:"FF3A3A3A"}}},Text:{_type:"Text",content:"",_children:{Fill:{_type:"Fill",mode:"solid",colour:"FFFFFFFF"},Font:{_type:"Font",family:"Arial",weight:"Regular",style:"Normal",size:12},Position:{_type:"Position",justification:"centred",paddingLeft:4,paddingRight:4,paddingTop:2,paddingBottom:2}}},Border:{_type:"Border",enabled:!1,style:"solid",thickness:1,_children:{Fill:{_type:"Fill",colour:"FF888888"},Corners:{_type:"Corners",radius:0}}},Grid:{_type:"Grid",enabled:!0,visible:!0,columns:0,rows:0,cellWidth:0,cellHeight:0,snap:!1,size:10,colour:"33FFFFFF",lineWidth:1,style:"lines",_children:{Cells:{_type:"Cells"},Points:{_type:"Points"}}},Mouse:{_type:"Mouse",cursor:"default",interceptClicks:!0,interceptChildClicks:!1,bringToFrontOnClick:!1,draggable:!1,hitTestShape:"rectangle",focusable:!1,focusOutline:!1,tabIndex:-1},Icon:{_type:"Icon",source:"builtin",name:"",size:16,_children:{Fill:{_type:"Fill",mode:"solid",colour:"FFFFFFFF"}}},Shadow:{_type:"Shadow",enabled:!1,type:"drop",offsetX:0,offsetY:2,blur:4,spread:0,_children:{Fill:{_type:"Fill",colour:"66000000"}}},Children:{_type:"Children",layout:"none",gap:0,padding:0},States:{_type:"States",_children:{}},Scripts:{_type:"Scripts"},Animations:{_type:"Animations",_children:{}}},Zi={Background:{sections:["Background"],defaultOverrides:{}},Label:{sections:["Background","Text"],defaultOverrides:{Transform:{width:100,height:24},Text:{content:"Label"}}},Button:{sections:["Background","Text","Border","Mouse","States","Scripts"],defaultOverrides:{Transform:{width:120,height:40},Text:{content:"Click Me"},Mouse:{cursor:"pointer",interceptClicks:!0,focusable:!0,tabIndex:0},Border:{enabled:!0}},defaultStates:["Hover","Pressed","Disabled","Focused"]},Container:{sections:["Background","Border","Grid","Children"],defaultOverrides:{Transform:{width:300,height:200},Grid:{enabled:!0,snap:!0,size:10}}}};let Oc=1;function Lo(e){return JSON.parse(JSON.stringify(e))}function Lr(e,t){if(!t)return e;for(const[r,o]of Object.entries(t))r==="_children"||r==="_type"||(e[r]=o);return e}function qc(e,t={}){var s,c;const r=Zi[e];if(!r)throw new Error(`Unknown component type: "${e}". Available: ${Object.keys(Zi).join(", ")}`);const o=`ctrl_${Oc++}`,i={},l=Lo(qo.Core);l.id=o,l.controlType=e,l.name=t.name||`${e}_${o.replace("ctrl_","")}`,Lr(l,t.Core),i.Core=l;const a=Lo(qo.Transform);Lr(a,(s=r.defaultOverrides)==null?void 0:s.Transform),Lr(a,t.Transform),i.Transform=a;for(const u of r.sections){const g=qo[u];if(!g){console.warn(`[createControl] No defaults for section "${u}"`);continue}const h=Lo(g);Lr(h,(c=r.defaultOverrides)==null?void 0:c[u]),Lr(h,t[u]),i[u]=h}if(r.defaultStates&&i.States){i.States._children||(i.States._children={});for(const u of r.defaultStates)i.States._children[u]={_type:u}}return{_type:"Control",_children:i}}function $n(e,t){var r;return((r=e==null?void 0:e._children)==null?void 0:r[t])??null}function Lc(e,t){var r;return((r=e==null?void 0:e._children)==null?void 0:r[t])!=null}const Dc=xa([Pt,jt,Mn],([e,t,r])=>{if(r==null)return null;const o=e.find(i=>i.id===t);return o?o.controls.find(i=>{var l,a;return((a=(l=i._children)==null?void 0:l.Core)==null?void 0:a.id)===r})??null:null});function co(e,t={}){const r=Ut(jt);if(r==null)return null;const o=qc(e,t),i=o._children.Core.id;return Pt.update(l=>l.map(a=>a.id!==r?a:{...a,controls:[...a.controls,o],modified:!0})),Mn.set(i),o}function Hc(e){const t=Ut(jt);t!=null&&(Pt.update(r=>r.map(o=>o.id!==t?o:{...o,controls:o.controls.filter(i=>{var l,a;return((a=(l=i._children)==null?void 0:l.Core)==null?void 0:a.id)!==e}),modified:!0})),Ut(Mn)===e&&Mn.set(null))}function Bc(e){const t=Ut(jt);if(t==null)return null;const r=Ut(Pt).find(a=>a.id===t);if(!r)return null;const o=r.controls.find(a=>{var s,c;return((c=(s=a._children)==null?void 0:s.Core)==null?void 0:c.id)===e});if(!o)return null;const i=JSON.parse(JSON.stringify(o)),l=`ctrl_${Date.now()}`;return i._children.Core.id=l,i._children.Core.name=`${i._children.Core.name}_copy`,i._children.Transform&&(i._children.Transform.x+=20,i._children.Transform.y+=20),Pt.update(a=>a.map(s=>s.id!==t?s:{...s,controls:[...s.controls,i],modified:!0})),Mn.set(l),i}function Lt(e,t,r){const o=Ut(jt);o!=null&&Pt.update(i=>i.map(l=>{if(l.id!==o)return l;const a=l.controls.map(s=>{var u,g;if(((g=(u=s._children)==null?void 0:u.Core)==null?void 0:g.id)!==e)return s;const c=JSON.parse(JSON.stringify(s));return Gc(c,t,r),c});return{...l,controls:a,modified:!0}}))}function Gc(e,t,r){var a;const o=t.split(".");if(o.length===0)return;let i=(a=e._children)==null?void 0:a[o[0]];if(!i)return;for(let s=1;s<o.length-1;s++)if(i._children&&i._children[o[s]])i=i._children[o[s]];else return;const l=o[o.length-1];i[l]=r}var Yc=D('<div class="dropdown-separator svelte-ilvwri"></div>'),Uc=D('<span class="item-shortcut svelte-ilvwri"> </span>'),Wc=D('<button class="dropdown-item svelte-ilvwri"><span class="item-label svelte-ilvwri"> </span> <!></button>'),Xc=D('<div class="dropdown svelte-ilvwri"></div>'),Vc=D('<div class="menu-wrapper svelte-ilvwri"><button> </button> <!></div>'),Jc=D('<nav class="menubar svelte-ilvwri"><div class="app-icon svelte-ilvwri" title="CEditor"></div> <!></nav>');function Zc(e,t){lt(t,!0);const r={File:[{label:"New Panel",shortcut:"Ctrl+N",action:()=>Ni()},{label:"Open Panel",shortcut:"Ctrl+O",action:()=>jc()},{type:"separator"},{label:"Save",shortcut:"Ctrl+S",action:()=>Fc()},{label:"Save As...",shortcut:"Ctrl+Shift+S",action:()=>fl()},{type:"separator"},{label:"Close Panel",shortcut:"Ctrl+W",action:()=>{const h=Ut(jt);h!=null&&li(h)}},{type:"separator"},{label:"Close Program",shortcut:"Alt+F4",action:()=>$c()}],Edit:[{label:"Undo",shortcut:"Ctrl+Z",action:()=>{}},{label:"Redo",shortcut:"Ctrl+Y",action:()=>{}},{type:"separator"},{label:"Cut",shortcut:"Ctrl+X",action:()=>{}},{label:"Copy",shortcut:"Ctrl+C",action:()=>{}},{label:"Paste",shortcut:"Ctrl+V",action:()=>{}},{type:"separator"},{label:"Select All",shortcut:"Ctrl+A",action:()=>{}}],View:[{label:"Zoom In",shortcut:"Ctrl++",action:()=>{}},{label:"Zoom Out",shortcut:"Ctrl+-",action:()=>{}},{label:"Fit to Window",shortcut:"Ctrl+0",action:()=>{}},{type:"separator"},{label:"Toggle Grid",action:()=>{}},{label:"Toggle Snap",action:()=>{}}],Insert:[{label:"Background",action:()=>co("Background")},{label:"Label",action:()=>co("Label")},{label:"Button",action:()=>co("Button")},{label:"Container",action:()=>co("Container")}],Panel:[{label:"Panel Properties...",action:()=>{}},{label:"Export Settings...",action:()=>{}}],Build:[{label:"Build VST3",action:()=>{}},{label:"Build Standalone",action:()=>{}},{type:"separator"},{label:"Build Settings...",action:()=>{}}],Help:[{label:"Documentation",action:()=>{}},{label:"About CEditor",action:()=>{}}]},o=Object.keys(r);let i=U(null);function l(h){m(i,n(i)===h?null:h,!0)}function a(h){h.action&&h.action(),m(i,null)}function s(h){n(i)&&!h.target.closest(".menubar")&&m(i,null)}function c(h){n(i)!==null&&m(i,h,!0)}var u=Jc();zt("click",gr,s);var g=v(d(u),2);it(g,17,()=>o,ht,(h,p)=>{var _=Vc(),f=d(_);let w;var b=d(f),y=v(f,2);{var R=q=>{var z=Xc();it(z,21,()=>r[n(p)],ht,(N,O)=>{var M=ue(),P=oe(M);{var Q=A=>{var K=Yc();x(A,K)},H=A=>{var K=Wc(),pe=d(K),de=d(pe),L=v(pe,2);{var G=j=>{var W=Uc(),te=d(W);se(()=>Be(te,n(O).shortcut)),x(j,W)};xe(L,j=>{n(O).shortcut&&j(G)})}se(()=>Be(de,n(O).label)),$("click",K,()=>a(n(O))),x(A,K)};xe(P,A=>{n(O).type==="separator"?A(Q):A(H,-1)})}x(N,M)}),x(q,z)};xe(y,q=>{n(i)===n(p)&&q(R)})}se(()=>{w=qe(f,1,"menu-item svelte-ilvwri",null,w,{active:n(i)===n(p)}),Be(b,n(p))}),$("click",f,()=>l(n(p))),zt("mouseenter",f,()=>c(n(p))),x(h,_)}),x(e,u),st()}vt(["click"]);vs();/**
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
 */const Kc={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":2,"stroke-linecap":"round","stroke-linejoin":"round"};/**
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
 */const Qc=e=>{for(const t in e)if(t.startsWith("aria-")||t==="role"||t==="title")return!0;return!1};/**
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
 */const Ki=(...e)=>e.filter((t,r,o)=>!!t&&t.trim()!==""&&o.indexOf(t)===r).join(" ").trim();var eu=Ci("<svg><!><!></svg>");function we(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]),o=he(r,["name","color","size","strokeWidth","absoluteStrokeWidth","iconNode"]);lt(t,!1);let i=We(t,"name",8,void 0),l=We(t,"color",8,"currentColor"),a=We(t,"size",8,24),s=We(t,"strokeWidth",8,2),c=We(t,"absoluteStrokeWidth",8,!1),u=We(t,"iconNode",24,()=>[]);mc();var g=eu();Ui(g,(_,f,w)=>({...Kc,..._,...o,width:a(),height:a(),stroke:l(),"stroke-width":f,class:w}),[()=>Qc(o)?void 0:{"aria-hidden":"true"},()=>(rr(c()),rr(s()),rr(a()),qn(()=>c()?Number(s())*24/Number(a()):s())),()=>(rr(Ki),rr(i()),rr(r),qn(()=>Ki("lucide-icon","lucide",i()?`lucide-${i()}`:"",r.class)))]);var h=d(g);it(h,1,u,ht,(_,f)=>{var w=T(()=>jl(n(f),2));let b=()=>n(w)[0],y=()=>n(w)[1];var R=ue(),q=oe(R);lc(q,b,!0,(z,N)=>{Ui(z,()=>({...y()}))}),x(_,R)});var p=v(h);ge(p,t,"default",{}),x(e,g),st()}function tu(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"}]];we(e,be({name:"activity"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function nu(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M12 17V3"}],["path",{d:"m6 11 6 6 6-6"}],["path",{d:"M19 21H5"}]];we(e,be({name:"arrow-down-to-line"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function ru(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"m12 19-7-7 7-7"}],["path",{d:"M19 12H5"}]];we(e,be({name:"arrow-left"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function ou(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M2 10v3"}],["path",{d:"M6 6v11"}],["path",{d:"M10 3v18"}],["path",{d:"M14 8v7"}],["path",{d:"M18 5v13"}],["path",{d:"M22 10v3"}]];we(e,be({name:"audio-lines"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function iu(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"}]];we(e,be({name:"bold"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function au(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"}],["path",{d:"m3.3 7 8.7 5 8.7-5"}],["path",{d:"M12 22V12"}]];we(e,be({name:"box"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function lu(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M20 6 9 17l-5-5"}]];we(e,be({name:"check"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function pl(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"m6 9 6 6 6-6"}]];we(e,be({name:"chevron-down"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function su(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"m9 18 6-6-6-6"}]];we(e,be({name:"chevron-right"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function Qi(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["circle",{cx:"12",cy:"12",r:"10"}]];we(e,be({name:"circle"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function cu(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["rect",{width:"14",height:"14",x:"8",y:"8",rx:"2",ry:"2"}],["path",{d:"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"}]];we(e,be({name:"copy"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function uu(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"}],["path",{d:"M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"}]];we(e,be({name:"droplets"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function du(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z"}]];we(e,be({name:"funnel"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function ea(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2"}],["path",{d:"M3 9h18"}],["path",{d:"M3 15h18"}],["path",{d:"M9 3v18"}],["path",{d:"M15 3v18"}]];we(e,be({name:"grid-3x3"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function vu(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M16 5h6"}],["path",{d:"M19 2v6"}],["path",{d:"M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5"}],["path",{d:"m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"}],["circle",{cx:"9",cy:"9",r:"2"}]];we(e,be({name:"image-plus"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function fu(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",ry:"2"}],["circle",{cx:"9",cy:"9",r:"2"}],["path",{d:"m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"}]];we(e,be({name:"image"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function pu(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["line",{x1:"19",x2:"10",y1:"4",y2:"4"}],["line",{x1:"14",x2:"5",y1:"20",y2:"20"}],["line",{x1:"15",x2:"9",y1:"4",y2:"20"}]];we(e,be({name:"italic"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function hu(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"}],["path",{d:"M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"}],["path",{d:"M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"}]];we(e,be({name:"layers"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function gu(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["rect",{width:"7",height:"9",x:"3",y:"3",rx:"1"}],["rect",{width:"7",height:"5",x:"14",y:"3",rx:"1"}],["rect",{width:"7",height:"9",x:"14",y:"12",rx:"1"}],["rect",{width:"7",height:"5",x:"3",y:"16",rx:"1"}]];we(e,be({name:"layout-dashboard"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function _u(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["rect",{width:"7",height:"7",x:"3",y:"3",rx:"1"}],["rect",{width:"7",height:"7",x:"14",y:"3",rx:"1"}],["rect",{width:"7",height:"7",x:"14",y:"14",rx:"1"}],["rect",{width:"7",height:"7",x:"3",y:"14",rx:"1"}]];we(e,be({name:"layout-grid"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function mu(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"}],["path",{d:"M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"}]];we(e,be({name:"link"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function bu(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M11 5h10"}],["path",{d:"M11 12h10"}],["path",{d:"M11 19h10"}],["path",{d:"M4 4h1v5"}],["path",{d:"M4 9h2"}],["path",{d:"M6.5 20H3.4c0-1 2.6-1.925 2.6-3.5a1.5 1.5 0 0 0-2.6-1.02"}]];we(e,be({name:"list-ordered"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function wu(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M3 5h.01"}],["path",{d:"M3 12h.01"}],["path",{d:"M3 19h.01"}],["path",{d:"M8 5h13"}],["path",{d:"M8 12h13"}],["path",{d:"M8 19h13"}]];we(e,be({name:"list"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function hl(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M8 3H5a2 2 0 0 0-2 2v3"}],["path",{d:"M21 8V5a2 2 0 0 0-2-2h-3"}],["path",{d:"M3 16v3a2 2 0 0 0 2 2h3"}],["path",{d:"M16 21h3a2 2 0 0 0 2-2v-3"}]];we(e,be({name:"maximize"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function yu(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["rect",{width:"20",height:"14",x:"2",y:"3",rx:"2"}],["line",{x1:"8",x2:"16",y1:"21",y2:"21"}],["line",{x1:"12",x2:"12",y1:"17",y2:"21"}]];we(e,be({name:"monitor"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function xu(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"}]];we(e,be({name:"moon"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function $u(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z"}]];we(e,be({name:"mouse-pointer-2"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function ku(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M12.586 12.586 19 19"}],["path",{d:"M3.688 3.037a.497.497 0 0 0-.651.651l6.5 15.999a.501.501 0 0 0 .947-.062l1.569-6.083a2 2 0 0 1 1.448-1.479l6.124-1.579a.5.5 0 0 0 .063-.947z"}]];we(e,be({name:"mouse-pointer"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function gl(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M12 2v20"}],["path",{d:"m15 19-3 3-3-3"}],["path",{d:"m19 9 3 3-3 3"}],["path",{d:"M2 12h20"}],["path",{d:"m5 9-3 3 3 3"}],["path",{d:"m9 5 3-3 3 3"}]];we(e,be({name:"move"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function ta(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"m14.622 17.897-10.68-2.913"}],["path",{d:"M18.376 2.622a1 1 0 1 1 3.002 3.002L17.36 9.643a.5.5 0 0 0 0 .707l.944.944a2.41 2.41 0 0 1 0 3.408l-.944.944a.5.5 0 0 1-.707 0L8.354 7.348a.5.5 0 0 1 0-.707l.944-.944a2.41 2.41 0 0 1 3.408 0l.944.944a.5.5 0 0 0 .707 0z"}],["path",{d:"M9 8c-1.804 2.71-3.97 3.46-6.583 3.948a.507.507 0 0 0-.302.819l7.32 8.883a1 1 0 0 0 1.185.204C12.735 20.405 16 16.792 16 15"}]];we(e,be({name:"paintbrush"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function _l(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"m12 9-8.414 8.414A2 2 0 0 0 3 18.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 3.828 21h1.344a2 2 0 0 0 1.414-.586L15 12"}],["path",{d:"m18 9 .4.4a1 1 0 1 1-3 3l-3.8-3.8a1 1 0 1 1 3-3l.4.4 3.4-3.4a1 1 0 1 1 3 3z"}],["path",{d:"m2 22 .414-.414"}]];we(e,be({name:"pipette"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function Mo(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M5 12h14"}],["path",{d:"M12 5v14"}]];we(e,be({name:"plus"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function ml(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["rect",{width:"20",height:"12",x:"2",y:"6",rx:"2"}]];we(e,be({name:"rectangle-horizontal"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function Cu(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M4 7V4h16v3"}],["path",{d:"M5 20h6"}],["path",{d:"M13 4 8 20"}],["path",{d:"m15 15 5 5"}],["path",{d:"m20 15-5 5"}]];we(e,be({name:"remove-formatting"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function bl(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"}],["path",{d:"M3 3v5h5"}]];we(e,be({name:"rotate-ccw"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function Su(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M14 17H5"}],["path",{d:"M19 7h-9"}],["circle",{cx:"17",cy:"17",r:"3"}],["circle",{cx:"7",cy:"7",r:"3"}]];we(e,be({name:"settings-2"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function Mu(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M10 5H3"}],["path",{d:"M12 19H3"}],["path",{d:"M14 3v4"}],["path",{d:"M16 17v4"}],["path",{d:"M21 12h-9"}],["path",{d:"M21 19h-5"}],["path",{d:"M21 5h-7"}],["path",{d:"M8 10v4"}],["path",{d:"M8 12H3"}]];we(e,be({name:"sliders-horizontal"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function Eu(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"}],["path",{d:"M20 2v4"}],["path",{d:"M22 4h-4"}],["circle",{cx:"4",cy:"20",r:"2"}]];we(e,be({name:"sparkles"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function zu(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M5 3a2 2 0 0 0-2 2"}],["path",{d:"M19 3a2 2 0 0 1 2 2"}],["path",{d:"M21 19a2 2 0 0 1-2 2"}],["path",{d:"M5 21a2 2 0 0 1-2-2"}],["path",{d:"M9 3h1"}],["path",{d:"M9 21h1"}],["path",{d:"M14 3h1"}],["path",{d:"M14 21h1"}],["path",{d:"M3 9v1"}],["path",{d:"M21 9v1"}],["path",{d:"M3 14v1"}],["path",{d:"M21 14v1"}]];we(e,be({name:"square-dashed"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function Nu(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M4 10c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2"}],["path",{d:"M10 16c-1.1 0-2-.9-2-2v-4c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2"}],["rect",{width:"8",height:"8",x:"14",y:"14",rx:"2"}]];we(e,be({name:"square-stack"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function wl(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2"}]];we(e,be({name:"square"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function Pu(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M16 4H9a3 3 0 0 0-2.83 4"}],["path",{d:"M14 12a4 4 0 0 1 0 8H6"}],["line",{x1:"4",x2:"20",y1:"12",y2:"12"}]];we(e,be({name:"strikethrough"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function Tu(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["circle",{cx:"12",cy:"12",r:"4"}],["path",{d:"M12 2v2"}],["path",{d:"M12 20v2"}],["path",{d:"m4.93 4.93 1.41 1.41"}],["path",{d:"m17.66 17.66 1.41 1.41"}],["path",{d:"M2 12h2"}],["path",{d:"M20 12h2"}],["path",{d:"m6.34 17.66-1.41 1.41"}],["path",{d:"m19.07 4.93-1.41 1.41"}]];we(e,be({name:"sun"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function Iu(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M21 5H3"}],["path",{d:"M21 12H9"}],["path",{d:"M21 19H7"}]];we(e,be({name:"text-align-end"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function Au(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M21 5H3"}],["path",{d:"M17 12H7"}],["path",{d:"M19 19H5"}]];we(e,be({name:"text-align-center"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function Fu(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M21 5H3"}],["path",{d:"M15 12H3"}],["path",{d:"M17 19H3"}]];we(e,be({name:"text-align-start"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function ju(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"}]];we(e,be({name:"thermometer"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function Ru(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M10 11v6"}],["path",{d:"M14 11v6"}],["path",{d:"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"}],["path",{d:"M3 6h18"}],["path",{d:"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"}]];we(e,be({name:"trash-2"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function Ou(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M13.73 4a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"}]];we(e,be({name:"triangle"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function yl(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M12 4v16"}],["path",{d:"M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2"}],["path",{d:"M9 20h6"}]];we(e,be({name:"type"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function qu(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M6 4v6a6 6 0 0 0 12 0V4"}],["line",{x1:"4",x2:"20",y1:"20",y2:"20"}]];we(e,be({name:"underline"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function Eo(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M18 6 6 18"}],["path",{d:"m6 6 12 12"}]];we(e,be({name:"x"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function Lu(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"}]];we(e,be({name:"zap"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function xl(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["circle",{cx:"11",cy:"11",r:"8"}],["line",{x1:"21",x2:"16.65",y1:"21",y2:"16.65"}],["line",{x1:"11",x2:"11",y1:"8",y2:"14"}],["line",{x1:"8",x2:"14",y1:"11",y2:"11"}]];we(e,be({name:"zoom-in"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}function Du(e,t){const r=he(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["circle",{cx:"11",cy:"11",r:"8"}],["line",{x1:"21",x2:"16.65",y1:"21",y2:"16.65"}],["line",{x1:"8",x2:"14",y1:"11",y2:"11"}]];we(e,be({name:"zoom-out"},()=>r,{get iconNode(){return o},children:(i,l)=>{var a=ue(),s=oe(a);ge(s,t,"default",{}),x(i,a)},$$slots:{default:!0}}))}var Hu=D("<button><!></button>"),Bu=D('<button class="icon-btn svelte-84a5bx"><!></button>'),Gu=D('<div class="icon-panel svelte-84a5bx"><div class="tool-section svelte-84a5bx"></div> <div class="separator svelte-84a5bx"></div> <div class="component-section svelte-84a5bx"></div></div>');function Yu(e){let t=U("select");const r=[{id:"select",icon:$u,label:"Select"},{id:"move",icon:gl,label:"Move"},{id:"zoom",icon:xl,label:"Zoom"}],o=[{id:"button",icon:ml,label:"Button"},{id:"label",icon:yl,label:"Label"},{id:"slider",icon:Mu,label:"Slider"},{id:"combobox",icon:pl,label:"ComboBox"},{id:"backdrop",icon:wl,label:"Backdrop"},{id:"grid",icon:_u,label:"Grid"},{id:"envelope",icon:tu,label:"Envelope"},{id:"filter",icon:ou,label:"Filter"}];var i=Gu(),l=d(i);it(l,21,()=>r,ht,(s,c)=>{var u=Hu();let g;var h=d(u);ai(h,()=>n(c).icon,(p,_)=>{_(p,{size:18,strokeWidth:1.5})}),se(()=>{g=qe(u,1,"icon-btn svelte-84a5bx",null,g,{active:n(t)===n(c).id}),Ve(u,"title",n(c).label)}),$("click",u,()=>m(t,n(c).id,!0)),x(s,u)});var a=v(l,4);it(a,21,()=>o,ht,(s,c)=>{var u=Bu(),g=d(u);ai(g,()=>n(c).icon,(h,p)=>{p(h,{size:18,strokeWidth:1.5})}),se(()=>Ve(u,"title",n(c).label)),x(s,u)}),x(e,i)}vt(["click"]);var Uu=D('<span class="modified-dot svelte-17p2z4b">●</span>'),Wu=D('<div><span class="tab-name svelte-17p2z4b"> <!></span> <button class="tab-close svelte-17p2z4b" title="Close"><!></button></div>'),Xu=D('<div class="tab-bar svelte-17p2z4b"><div class="tabs svelte-17p2z4b"></div> <button class="new-tab-btn svelte-17p2z4b" title="New Panel"><!></button></div>');function Vu(e,t){lt(t,!0);const r=()=>wt(Pt,"$panels",i),o=()=>wt(jt,"$activePanelId",i),[i,l]=tr();let a=T(r),s=T(o);function c(_,f){_.button===1&&(_.preventDefault(),li(f))}var u=Xu(),g=d(u);it(g,21,()=>n(a),_=>_.id,(_,f)=>{var w=Wu();let b;var y=d(w),R=d(y),q=v(R);{var z=M=>{var P=Uu();x(M,P)};xe(q,M=>{n(f).modified&&M(z)})}var N=v(y,2),O=d(N);Eo(O,{size:12,strokeWidth:1.5}),se(()=>{b=qe(w,1,"tab svelte-17p2z4b",null,b,{active:n(f).id===n(s)}),Be(R,`${n(f).name??""} `)}),$("click",w,()=>Ic(n(f).id)),$("mousedown",w,M=>c(M,n(f).id)),$("click",N,M=>{M.stopPropagation(),li(n(f).id)}),x(_,w)});var h=v(g,2),p=d(h);Mo(p,{size:14,strokeWidth:1.5}),$("click",h,()=>Ni()),x(e,u),st(),l()}vt(["click","mousedown"]);function uo(e,t){const r=[...e].sort((a,s)=>a.position-s.position);let o=typeof t=="number"?t:t==="hard"?100:0;if(o=Math.max(0,Math.min(100,o)),o===0)return r.map(a=>`#${a.color} ${a.position}%`).join(", ");const i=o/100,l=[];for(let a=0;a<r.length;a++){const s=r[a],c=r[a+1];if(!c)l.push(`#${s.color} ${s.position}%`);else{const u=(s.position+c.position)/2,g=s.position+(u-s.position)*i,h=c.position-(c.position-u)*i;l.push(`#${s.color} ${s.position}%`),l.push(`#${s.color} ${g}%`),l.push(`#${c.color} ${h}%`)}}return l.join(", ")}function zo(e,t="rectangle"){var c,u,g,h,p;if(!e||!e.stops||e.stops.length<2)return"#333333";const r=uo(e.stops,e.edge??"soft"),o=e.angle??90,i=e.centerX??50,l=e.centerY??50,a=e.radiusX??50,s=t==="circle"||t==="square"?a:e.radiusY??50;switch(e.type){case"linear":return`linear-gradient(${o}deg, ${r})`;case"radial":return`radial-gradient(ellipse ${a}% ${s}% at ${i}% ${l}%, ${r})`;case"conical":return`conic-gradient(from ${o}deg at ${i}% ${l}%, ${r})`;case"radialRamp":{const f=[...e.stops].sort((b,y)=>b.position-y.position).map(b=>({...b,position:parseFloat((b.position/100*a).toFixed(1))})),w=uo(f,e.edge??0);return`repeating-radial-gradient(ellipse at ${i}% ${l}%, ${w})`}case"linearRamp":{const _=[...e.stops].sort((y,R)=>y.position-R.position),f=a,w=_.map(y=>({...y,position:parseFloat((y.position/100*f).toFixed(1))})),b=uo(w,e.edge??0);return`repeating-linear-gradient(${o}deg, ${b})`}case"squareRamp":return"#333";case"duotone":{const _=[...e.stops].sort((b,y)=>b.position-y.position),f=((c=_[0])==null?void 0:c.color)||"000000",w=((u=_[_.length-1])==null?void 0:u.color)||"FFFFFF";return`linear-gradient(${o}deg, #${f} 0%, #${w} 100%)`}case"tricolor":{const _=[...e.stops].sort((y,R)=>y.position-R.position),f=((g=_[0])==null?void 0:g.color)||"000000",w=((h=_[Math.floor(_.length/2)])==null?void 0:h.color)||"888888",b=((p=_[_.length-1])==null?void 0:p.color)||"FFFFFF";return`linear-gradient(${o}deg, #${f} 0%, #${w} 50%, #${b} 100%)`}case"banding":{const _=uo(e.stops,"hard");return`linear-gradient(${o}deg, ${_})`}case"reflected":{const _=[...e.stops].sort((w,b)=>w.position-b.position),f=[];for(let w=_.length-1;w>=0;w--){const b=50-_[w].position/100*50;f.push(`#${_[w].color} ${b}%`)}for(let w=1;w<_.length;w++){const b=50+_[w].position/100*50;f.push(`#${_[w].color} ${b}%`)}return`linear-gradient(${o}deg, ${f.join(", ")})`}case"mesh":case"volumeMesh":return(e.meshPoints||e.stops.map((f,w)=>({x:w/Math.max(e.stops.length-1,1)*80+10,y:w%2*60+20,color:f.color}))).map(f=>`radial-gradient(circle at ${f.x}% ${f.y}%, #${f.color} 0%, transparent 70%)`).join(", ");default:return`linear-gradient(${e.angle}deg, ${r})`}}function $l(e){return""}function kl(e){return(e==null?void 0:e.type)==="volumeMesh"?"blur(50px)":""}function Ju(e,t){const r=[...e].sort((_,f)=>_.position-f.position);if(t<=r[0].position)return r[0].color;if(t>=r[r.length-1].position)return r[r.length-1].color;let o=r[0],i=r[r.length-1];for(let _=0;_<r.length-1;_++)if(t>=r[_].position&&t<=r[_+1].position){o=r[_],i=r[_+1];break}const l=(t-o.position)/(i.position-o.position),a=parseInt(o.color.slice(0,2),16),s=parseInt(o.color.slice(2,4),16),c=parseInt(o.color.slice(4,6),16),u=parseInt(i.color.slice(0,2),16),g=parseInt(i.color.slice(2,4),16),h=parseInt(i.color.slice(4,6),16),p=_=>Math.round(_).toString(16).padStart(2,"0").toUpperCase();return p(a+(u-a)*l)+p(s+(g-s)*l)+p(c+(h-c)*l)}function Zu(e,t){const r=[...e].sort((p,_)=>p.position-_.position);if(t<=r[0].position){const p=r[0].color;return[parseInt(p.slice(0,2),16),parseInt(p.slice(2,4),16),parseInt(p.slice(4,6),16)]}if(t>=r[r.length-1].position){const p=r[r.length-1].color;return[parseInt(p.slice(0,2),16),parseInt(p.slice(2,4),16),parseInt(p.slice(4,6),16)]}let o=r[0],i=r[r.length-1];for(let p=0;p<r.length-1;p++)if(t>=r[p].position&&t<=r[p+1].position){o=r[p],i=r[p+1];break}const l=(t-o.position)/(i.position-o.position),a=parseInt(o.color.slice(0,2),16),s=parseInt(o.color.slice(2,4),16),c=parseInt(o.color.slice(4,6),16),u=parseInt(i.color.slice(0,2),16),g=parseInt(i.color.slice(2,4),16),h=parseInt(i.color.slice(4,6),16);return[Math.round(a+(u-a)*l),Math.round(s+(g-s)*l),Math.round(c+(h-c)*l)]}function Cl(e,t=256,r=256){const o=document.createElement("canvas");o.width=t,o.height=r;const i=o.getContext("2d"),l=i.createImageData(t,r),a=(e.centerX??50)/100*t,s=(e.centerY??50)/100*r,c=(e.radiusX??50)/100*t,u=(e.radiusY??50)/100*r,g=e.stops||[];for(let h=0;h<r;h++)for(let p=0;p<t;p++){const _=Math.abs(p-a)/(c||1),f=Math.abs(h-s)/(u||1);let w=Math.max(_,f);w=w%1;const b=w*100,[y,R,q]=Zu(g,b),z=(h*t+p)*4;l.data[z]=y,l.data[z+1]=R,l.data[z+2]=q,l.data[z+3]=255}return i.putImageData(l,0,0),o.toDataURL()}var Ku=D('<div class="bg-renderer svelte-tbpnsn"></div>');function Qu(e,t){lt(t,!0);let r=We(t,"background",3,null),o=T(()=>{var s,c,u;if(!r())return"background: transparent;";const l=r().mode||"solid",a=(s=r()._children)==null?void 0:s.Fill;if(l==="solid"&&(a!=null&&a.colour))return`background: #${a.colour.slice(-6)};`;if(l==="gradient"&&((u=(c=r()._children)==null?void 0:c.Fill)!=null&&u.Gradient)){const g=r()._children.Fill.Gradient;return`background: ${zo(g)};`}return"background: transparent;"});var i=Ku();se(()=>ke(i,n(o))),x(e,i),st()}var ed=D('<div class="resize-handle svelte-1aohjhs"></div>'),td=D("<div></div>"),nd=D('<div><!> <span class="control-label svelte-1aohjhs"> </span> <!></div> <!>',1);function rd(e,t){lt(t,!0);const r=()=>wt(Mn,"$selectedComponentId",o),[o,i]=tr();let l=We(t,"scale",3,1),a=We(t,"snapToGrid",3,!1),s=We(t,"gridSize",3,10),c=We(t,"allControls",19,()=>[]),u=We(t,"onDragStart",3,null),g=We(t,"onDragEnd",3,null),h=T(()=>$n(t.control,"Core")),p=T(()=>$n(t.control,"Transform")),_=T(()=>$n(t.control,"Background")),f=T(()=>{var S;return((S=n(h))==null?void 0:S.id)!=null&&r()===n(h).id}),w=T(()=>{var S;return((S=n(h))==null?void 0:S.locked)===!0}),b=T(()=>{var S;return((S=n(h))==null?void 0:S.visible)!==!1}),y=U(!1),R=U(pt({x:0,y:0})),q=U(pt({x:0,y:0})),z=U(!1),N=U(""),O=U(pt({x:0,y:0})),M=U(pt({x:0,y:0,w:0,h:0})),P=U(null),Q=U(null),H=U(null),A=U(null),K=T(()=>{var S;return n(P)??((S=n(p))==null?void 0:S.x)??0}),pe=T(()=>{var S;return n(Q)??((S=n(p))==null?void 0:S.y)??0}),de=T(()=>{var S;return n(H)??((S=n(p))==null?void 0:S.width)??100}),L=T(()=>{var S;return n(A)??((S=n(p))==null?void 0:S.height)??40});const G=10,j=5;function W(S){return!a()||s()<=0?S:Math.round(S/s())*s()}let te=U(pt([]));function ve(S,X,ne,J){var Pe;if(!c()||c().length===0)return[];const ae=[],fe={left:S,centerX:S+ne/2,right:S+ne,top:X,centerY:X+J/2,bottom:X+J};for(const et of c()){const Te=$n(et,"Core"),nt=$n(et,"Transform");if(!nt||(Te==null?void 0:Te.id)===((Pe=n(h))==null?void 0:Pe.id))continue;const tt=nt.x,$e=nt.y,Fe=nt.width,rt=nt.height,Je={left:tt,centerX:tt+Fe/2,right:tt+Fe,top:$e,centerY:$e+rt/2,bottom:$e+rt};for(const[,Re]of Object.entries(fe))if(!(Re===fe.top||Re===fe.centerY||Re===fe.bottom))for(const[,ce]of Object.entries(Je))ce===Je.top||ce===Je.centerY||ce===Je.bottom||Math.abs(Re-ce)<j&&ae.push({type:"vertical",pos:ce});for(const[,Re]of Object.entries(fe))if(!(Re===fe.left||Re===fe.centerX||Re===fe.right))for(const[,ce]of Object.entries(Je))ce===Je.left||ce===Je.centerX||ce===Je.right||Math.abs(Re-ce)<j&&ae.push({type:"horizontal",pos:ce})}return ae}function ye(S){var X,ne,J,ae;S.button===0&&(S.stopPropagation(),Mn.set(((X=n(h))==null?void 0:X.id)??null),!(n(w)||n(z))&&(m(y,!0),m(R,{x:S.clientX,y:S.clientY},!0),m(q,{x:((ne=n(p))==null?void 0:ne.x)??0,y:((J=n(p))==null?void 0:J.y)??0},!0),m(P,n(q).x,!0),m(Q,n(q).y,!0),(ae=u())==null||ae(),window.addEventListener("mousemove",V),window.addEventListener("mouseup",ie)))}function V(S){if(!n(y))return;const X=(S.clientX-n(R).x)/l(),ne=(S.clientY-n(R).y)/l();let J=n(q).x+X,ae=n(q).y+ne;a()&&s()>0&&(J=W(J),ae=W(ae)),m(P,Math.round(J),!0),m(Q,Math.round(ae),!0),m(te,ve(n(P),n(Q),n(de),n(L)),!0)}function ie(){var S,X;n(y)&&(window.removeEventListener("mousemove",V),window.removeEventListener("mouseup",ie),(S=n(h))!=null&&S.id&&(n(P)!==n(q).x||n(Q)!==n(q).y)&&(Lt(n(h).id,"Transform.x",n(P)),Lt(n(h).id,"Transform.y",n(Q))),m(y,!1),m(P,null),m(Q,null),m(te,[],!0),(X=g())==null||X())}function _e(S,X){var ne,J,ae,fe;n(w)||(X.stopPropagation(),X.preventDefault(),m(z,!0),m(N,S,!0),m(O,{x:X.clientX,y:X.clientY},!0),m(M,{x:((ne=n(p))==null?void 0:ne.x)??0,y:((J=n(p))==null?void 0:J.y)??0,w:((ae=n(p))==null?void 0:ae.width)??100,h:((fe=n(p))==null?void 0:fe.height)??40},!0),m(P,n(M).x,!0),m(Q,n(M).y,!0),m(H,n(M).w,!0),m(A,n(M).h,!0),window.addEventListener("mousemove",Ee),window.addEventListener("mouseup",Le))}function Ee(S){if(!n(z))return;const X=(S.clientX-n(O).x)/l(),ne=(S.clientY-n(O).y)/l(),J=S.shiftKey;let{x:ae,y:fe,w:Pe,h:et}=n(M);const Te=n(N);if(Te.includes("r")&&(Pe+=X),Te.includes("l")&&(ae+=X,Pe-=X),Te.includes("b")&&(et+=ne),Te.includes("t")&&(fe+=ne,et-=ne),J&&Te.length===2){const nt=n(M).w/n(M).h;Math.abs(X)>Math.abs(ne)?(et=Pe/nt,Te.includes("t")&&(fe=n(M).y+n(M).h-et)):(Pe=et*nt,Te.includes("l")&&(ae=n(M).x+n(M).w-Pe))}Pe<G&&(Pe=G,Te.includes("l")&&(ae=n(M).x+n(M).w-G)),et<G&&(et=G,Te.includes("t")&&(fe=n(M).y+n(M).h-G)),a()&&s()>0&&(ae=W(ae),fe=W(fe),Pe=W(Pe)||s(),et=W(et)||s()),m(P,Math.round(ae),!0),m(Q,Math.round(fe),!0),m(H,Math.round(Pe),!0),m(A,Math.round(et),!0),m(te,ve(n(P),n(Q),n(H),n(A)),!0)}function Le(){var S;n(z)&&(window.removeEventListener("mousemove",Ee),window.removeEventListener("mouseup",Le),(S=n(h))!=null&&S.id&&(Lt(n(h).id,"Transform.x",n(P)),Lt(n(h).id,"Transform.y",n(Q)),Lt(n(h).id,"Transform.width",n(H)),Lt(n(h).id,"Transform.height",n(A))),m(z,!1),m(N,""),m(P,null),m(Q,null),m(H,null),m(A,null),m(te,[],!0))}const at=[{id:"tl",cursor:"nwse-resize"},{id:"t",cursor:"ns-resize"},{id:"tr",cursor:"nesw-resize"},{id:"l",cursor:"ew-resize"},{id:"r",cursor:"ew-resize"},{id:"bl",cursor:"nesw-resize"},{id:"b",cursor:"ns-resize"},{id:"br",cursor:"nwse-resize"}];function je(S){return`width:6px;height:6px;${{tl:"top:-3px;left:-3px;",t:"top:-3px;left:calc(50% - 3px);",tr:"top:-3px;right:-3px;",l:"top:calc(50% - 3px);left:-3px;",r:"top:calc(50% - 3px);right:-3px;",bl:"bottom:-3px;left:-3px;",b:"bottom:-3px;left:calc(50% - 3px);",br:"bottom:-3px;right:-3px;"}[S]}`}var Xe=nd(),ze=oe(Xe);let Ae;var Ze=d(ze);{var me=S=>{Qu(S,{get background(){return n(_)}})};xe(Ze,S=>{n(_)&&S(me)})}var Ne=v(Ze,2),I=d(Ne),le=v(Ne,2);{var F=S=>{var X=ue(),ne=oe(X);it(ne,17,()=>at,J=>J.id,(J,ae)=>{var fe=ed();se(Pe=>ke(fe,`${Pe??""} cursor:${n(ae).cursor??""};`),[()=>je(n(ae).id)]),$("mousedown",fe,Pe=>_e(n(ae).id,Pe)),x(J,fe)}),x(S,X)};xe(le,S=>{n(f)&&!n(w)&&S(F)})}var E=v(ze,2);{var Y=S=>{var X=ue(),ne=oe(X);it(ne,17,()=>n(te),ht,(J,ae)=>{var fe=td();let Pe;se(()=>{Pe=qe(fe,1,"snap-guide svelte-1aohjhs",null,Pe,{vertical:n(ae).type==="vertical",horizontal:n(ae).type==="horizontal"}),ke(fe,n(ae).type==="vertical"?`left:${n(ae).pos}px;`:`top:${n(ae).pos}px;`)}),x(J,fe)}),x(S,X)};xe(E,S=>{(n(y)||n(z))&&n(te).length>0&&S(Y)})}se(()=>{var S,X,ne;Ae=qe(ze,1,"canvas-control svelte-1aohjhs",null,Ae,{selected:n(f),"hidden-component":!n(b),locked:n(w)}),ke(ze,`left:${n(K)??""}px; top:${n(pe)??""}px; width:${n(de)??""}px; height:${n(L)??""}px; opacity:${((S=n(p))==null?void 0:S.opacity)??1??""}; ${(X=n(p))!=null&&X.rotation?`transform:rotate(${n(p).rotation}deg);`:""}`),Be(I,((ne=n(h))==null?void 0:ne.name)??"")}),$("mousedown",ze,ye),x(e,Xe),st(),i()}vt(["mousedown"]);var od=D('<div class="grid-overlay svelte-17bi2u2"></div>'),id=D('<span class="panel-label svelte-17bi2u2"> </span>'),ad=D('<div class="canvas-viewport svelte-17bi2u2"><div class="zoom-container svelte-17bi2u2"><div class="panel-surface svelte-17bi2u2"><!> <!> <!></div></div></div>'),ld=D('<div class="empty-state svelte-17bi2u2"><span class="empty-text svelte-17bi2u2">No panel open</span> <span class="empty-hint svelte-17bi2u2">File → New Panel or press the + tab</span></div>'),sd=D('<div class="editor-wrapper svelte-17bi2u2" tabindex="-1"><div class="tab-bar-area svelte-17bi2u2"><!></div> <div class="canvas-area svelte-17bi2u2"><!></div></div>');function cd(e,t){lt(t,!0);const r=()=>wt(Pt,"$panels",a),o=()=>wt(jt,"$activePanelId",a),i=()=>wt(Gn,"$editorZoom",a),l=()=>wt(Mn,"$selectedComponentId",a),[a,s]=tr();let c=T(()=>r().find(A=>A.id===o())??null),u=T(i),g=T(()=>n(u)/100),h=T(()=>{var A;return((A=n(c))==null?void 0:A.gridEnabled)??!1}),p=T(()=>{var A;return((A=n(c))==null?void 0:A.gridSize)??10}),_=T(()=>{var A;return((A=n(c))==null?void 0:A.snapToGrid)??!1}),f=T(()=>{var A;return((A=n(c))==null?void 0:A.gridColour)??"33FFFFFF"});function w(A){const K=A.replace(/^#/,"");if(K.length===8){const G=parseInt(K.slice(0,2),16)/255,j=parseInt(K.slice(2,4),16),W=parseInt(K.slice(4,6),16),te=parseInt(K.slice(6,8),16);return`rgba(${j},${W},${te},${G.toFixed(3)})`}const pe=parseInt(K.slice(0,2),16),de=parseInt(K.slice(2,4),16),L=parseInt(K.slice(4,6),16);return`rgba(${pe},${de},${L},0.06)`}let b=T(()=>{if(!n(h)||n(p)<=0)return"";const A=w(n(f));return`
      background-image:
        linear-gradient(${A} 1px, transparent 1px),
        linear-gradient(90deg, ${A} 1px, transparent 1px);
      background-size: ${n(p)}px ${n(p)}px;
      background-position: 0 0;
    `}),y=T(()=>n(c)?n(c).bgMode==="solid"?`background: #${n(c).bgColour||"2A2A2A"};`:`background: #${n(c).bgColour||"2A2A2A"};`:"");function R(A){(A.target===A.currentTarget||A.target.classList.contains("panel-surface"))&&Mn.set(null)}function q(A){var G,j,W,te,ve,ye;if(!n(c))return;const K=l();if(!K)return;const pe=n(c).controls.find(V=>{var ie,_e;return((_e=(ie=V._children)==null?void 0:ie.Core)==null?void 0:_e.id)===K});if(!pe)return;const de=(j=(G=pe._children)==null?void 0:G.Core)==null?void 0:j.locked;if(A.key==="Delete"||A.key==="Backspace"){A.preventDefault(),Hc(K);return}if((A.ctrlKey||A.metaKey)&&A.key==="d"){A.preventDefault(),Bc(K);return}if(de)return;const L=A.shiftKey?n(p):1;A.key==="ArrowLeft"?(A.preventDefault(),Lt(K,"Transform.x",(((W=pe._children.Transform)==null?void 0:W.x)??0)-L)):A.key==="ArrowRight"?(A.preventDefault(),Lt(K,"Transform.x",(((te=pe._children.Transform)==null?void 0:te.x)??0)+L)):A.key==="ArrowUp"?(A.preventDefault(),Lt(K,"Transform.y",(((ve=pe._children.Transform)==null?void 0:ve.y)??0)-L)):A.key==="ArrowDown"&&(A.preventDefault(),Lt(K,"Transform.y",(((ye=pe._children.Transform)==null?void 0:ye.y)??0)+L))}var z=sd(),N=d(z),O=d(N);Vu(O,{});var M=v(N,2),P=d(M);{var Q=A=>{var K=ad(),pe=d(K),de=d(pe),L=d(de);{var G=ve=>{var ye=od();se(()=>ke(ye,n(b))),x(ve,ye)};xe(L,ve=>{n(b)&&ve(G)})}var j=v(L,2);it(j,17,()=>n(c).controls,ve=>{var ye,V;return(V=(ye=ve._children)==null?void 0:ye.Core)==null?void 0:V.id},(ve,ye)=>{rd(ve,{get control(){return n(ye)},get scale(){return n(g)},get snapToGrid(){return n(_)},get gridSize(){return n(p)},get allControls(){return n(c).controls}})});var W=v(j,2);{var te=ve=>{var ye=id(),V=d(ye);se(()=>Be(V,`${n(c).name??""} — ${n(c).width??""} x ${n(c).height??""}`)),x(ve,ye)};xe(W,ve=>{n(c).controls.length===0&&ve(te)})}se(()=>{ke(pe,`transform: scale(${n(g)??""}); transform-origin: center center;`),ke(de,`width: ${n(c).width??""}px; height: ${n(c).height??""}px; ${n(y)??""}`)}),$("click",K,R),$("click",de,R),x(A,K)},H=A=>{var K=ld();x(A,K)};xe(P,A=>{n(c)?A(Q):A(H,-1)})}$("keydown",z,q),x(e,z),st(),s()}vt(["keydown","click"]);var ud=D('<div class="common-bar svelte-pu4s69"><div class="prop-group svelte-pu4s69"><div class="color-swatch svelte-pu4s69" style="background: #3A3A3A;" title="Fill colour"></div> <span class="prop-value svelte-pu4s69">3A3A3A</span></div> <div class="divider svelte-pu4s69"></div> <div class="prop-group svelte-pu4s69"><span class="prop-label svelte-pu4s69">Arial</span> <span class="prop-value svelte-pu4s69">14</span></div> <div class="divider svelte-pu4s69"></div> <div class="prop-group toggle-group svelte-pu4s69"><button class="toggle-btn svelte-pu4s69" title="Bold">B</button> <button class="toggle-btn svelte-pu4s69" title="Italic">I</button> <button class="toggle-btn svelte-pu4s69" title="Underline">U</button></div> <div class="divider svelte-pu4s69"></div> <div class="prop-group toggle-group svelte-pu4s69"><button class="toggle-btn svelte-pu4s69" title="Align left">≡</button> <button class="toggle-btn active svelte-pu4s69" title="Align center">☰</button> <button class="toggle-btn svelte-pu4s69" title="Align right">≡</button></div> <div class="spacer svelte-pu4s69"></div> <div class="prop-group svelte-pu4s69"><span class="prop-label-sm svelte-pu4s69">Opacity</span> <span class="prop-value svelte-pu4s69">100%</span></div></div>');function dd(e){var t=ud();x(e,t)}var vd=D('<input class="zoom-input svelte-o5r682" type="text"/>'),fd=D('<span class="zoom-value svelte-o5r682" title="Double-click to type a value"> </span>'),pd=D('<div class="zoom-bar svelte-o5r682"><div class="scrollbar-area svelte-o5r682"></div> <div class="zoom-controls svelte-o5r682"><button class="zoom-btn svelte-o5r682" title="Zoom out">−</button> <!> <button class="zoom-btn svelte-o5r682" title="Zoom in">+</button> <span class="inc-label svelte-o5r682">Dec/Inc</span> <input class="inc-input svelte-o5r682" type="number" min="1" max="100"/> <div class="divider svelte-o5r682"></div> <button class="zoom-btn icon svelte-o5r682" title="Reset to 100%">⊡</button> <button class="zoom-btn icon svelte-o5r682" title="Fit to window"><!></button></div></div>');function hd(e,t){lt(t,!0);const r=()=>wt(Gn,"$editorZoom",a),o=()=>wt(Ji,"$editorZoomIncrement",a),i=()=>wt(Pt,"$panels",a),l=()=>wt(jt,"$activePanelId",a),[a,s]=tr();let c=U(!1),u=U("100"),g=T(r),h=T(o),p=T(()=>i().find(G=>G.id===l())??null);function _(){Gn.update(G=>Math.min(400,G+o()))}function f(){Gn.update(G=>Math.max(10,G-o()))}function w(){Gn.set(100)}function b(){m(u,String(n(g)),!0),m(c,!0)}function y(){m(c,!1);const G=parseInt(n(u),10);isNaN(G)||Gn.set(Math.max(10,Math.min(400,G)))}function R(G){G.key==="Enter"?y():G.key==="Escape"&&m(c,!1)}function q(G){const j=parseInt(G.target.value,10);!isNaN(j)&&j>0&&Ji.set(Math.min(100,j))}function z(){if(!n(p))return;const G=document.querySelector(".canvas-viewport");if(!G){Gn.set(100);return}const j=G.clientWidth-40,W=G.clientHeight-40,te=j/n(p).width,ve=W/n(p).height,ye=Math.min(te,ve),V=Math.max(10,Math.min(400,Math.round(ye*100)));Gn.set(V)}var N=pd(),O=v(d(N),2),M=d(O),P=v(M,2);{var Q=G=>{var j=vd();La(j,!0),zt("blur",j,y),$("keydown",j,R),Ei(j,()=>n(u),W=>m(u,W)),x(G,j)},H=G=>{var j=fd(),W=d(j);se(()=>Be(W,`${n(g)??""}%`)),$("dblclick",j,b),x(G,j)};xe(P,G=>{n(c)?G(Q):G(H,-1)})}var A=v(P,2),K=v(A,4),pe=v(K,4),de=v(pe,2),L=d(de);hl(L,{size:12,strokeWidth:1.5}),se(()=>Et(K,n(h))),$("click",M,f),$("click",A,_),$("change",K,q),$("click",pe,w),$("click",de,z),x(e,N),st(),s()}vt(["click","keydown","dblclick","change"]);var gd=D('<div class="band-checkerboard svelte-6w7hwg"></div>'),_d=D('<div class="band-wrapper svelte-6w7hwg"><div role="slider" tabindex="-1"><!> <div class="band-gradient svelte-6w7hwg"></div> <div class="thumb svelte-6w7hwg"></div> <span class="band-label svelte-6w7hwg"> </span></div></div>'),md=D('<div class="color-chooser svelte-6w7hwg"><div class="checkerboard svelte-6w7hwg"></div> <div class="color-overlay svelte-6w7hwg"></div> <div class="hex-corner svelte-6w7hwg"><input class="hex-input svelte-6w7hwg" type="text" spellcheck="false"/></div> <div class="bands-container svelte-6w7hwg"></div></div>');function bd(e,t){lt(t,!0);let r=We(t,"color",3,"333333"),o=We(t,"alpha",3,1),i=We(t,"stepSize",3,10),l=U(0),a=U(0),s=U(20),c=U(1),u=U(null),g=U(""),h=U(!1),p=!1;function _(F,E,Y){E/=100,Y/=100;const S=J=>(J+F/30)%12,X=E*Math.min(Y,1-Y),ne=J=>Y-X*Math.max(-1,Math.min(S(J)-3,9-S(J),1));return[Math.round(ne(0)*255),Math.round(ne(8)*255),Math.round(ne(4)*255)]}function f(F,E,Y){F/=255,E/=255,Y/=255;const S=Math.max(F,E,Y),X=Math.min(F,E,Y);let ne=0,J=0,ae=(S+X)/2;if(S!==X){const fe=S-X;switch(J=ae>.5?fe/(2-S-X):fe/(S+X),S){case F:ne=((E-Y)/fe+(E<Y?6:0))*60;break;case E:ne=((Y-F)/fe+2)*60;break;case Y:ne=((F-E)/fe+4)*60;break}}return[ne,J*100,ae*100]}function w(F){return F=F.replace(/^#/,""),[parseInt(F.slice(0,2),16),parseInt(F.slice(2,4),16),parseInt(F.slice(4,6),16)]}function b(F,E,Y){const S=X=>X.toString(16).padStart(2,"0").toUpperCase();return S(F)+S(E)+S(Y)}function y(F){const[E,Y,S]=w(F),[X,ne,J]=f(E,Y,S);E===Y&&Y===S||(m(l,X,!0),m(a,ne,!0)),m(s,J,!0)}Wt(()=>{const F=r(),E=o();if(p){p=!1;return}y(F),m(c,E,!0)});let R=T(()=>_(n(l),n(a),n(s))),q=T(()=>b(n(R)[0],n(R)[1],n(R)[2])),z=T(()=>Math.round(n(c)*255).toString(16).padStart(2,"0").toUpperCase()),N=T(()=>n(z)+n(q)),O=T(()=>"#"+n(N)),M=T(()=>`hsla(${n(l)}, ${n(a)}%, ${n(s)}%, ${n(c)})`),P=T(()=>(()=>{const F=[];for(let E=0;E<=360;E+=30)F.push(`hsl(${E}, ${n(a)}%, ${n(s)}%)`);return`linear-gradient(to right, ${F.join(", ")})`})()),Q=T(()=>`linear-gradient(to right, hsl(${n(l)}, 100%, ${n(s)}%), hsl(${n(l)}, 0%, ${n(s)}%))`),H=T(()=>`linear-gradient(to right, hsl(${n(l)}, ${n(a)}%, 0%), hsl(${n(l)}, ${n(a)}%, 50%), hsl(${n(l)}, ${n(a)}%, 100%))`),A=T(()=>`linear-gradient(to right, hsla(${n(l)}, ${n(a)}%, ${n(s)}%, 1), hsla(${n(l)}, ${n(a)}%, ${n(s)}%, 0))`),K=T(()=>n(l)/360),pe=T(()=>1-n(a)/100),de=T(()=>n(s)/100),L=T(()=>1-n(c)),G=T(()=>`hsl(${n(l)}, ${n(a)}%, ${n(s)}%)`),j=T(()=>`hsla(${n(l)}, ${n(a)}%, ${n(s)}%, ${n(c)})`);function W(){t.onchange&&(p=!0,t.onchange(n(N)))}function te(F,E){const Y=E.getBoundingClientRect();return Math.max(0,Math.min(F.clientX-Y.left,Y.width))/Y.width}function ve(F,E){m(u,F,!0),V(E)}function ye(F,E){const Y=i()/100*E;return Math.round(F/Y)*Y}function V(F){if(!n(u))return;const E=document.querySelector(`[data-band="${n(u)}"]`);if(!E)return;const Y=te(F,E);switch(n(u)){case"hue":m(l,ye(Y*360,360),!0);break;case"saturation":m(a,ye((1-Y)*100,100),!0);break;case"lightness":m(s,ye(Y*100,100),!0);break;case"alpha":m(c,ye((1-Y)*100,100)/100);break}W()}function ie(){m(u,null)}function _e(F){m(h,!0),m(g,n(O),!0),F.target.select()}function Ee(){m(h,!1),at()}function Le(F){F.key==="Enter"?F.target.blur():F.key==="Escape"&&(m(h,!1),m(g,n(O),!0))}function at(){let F=n(g).replace(/^#/,"").replace(/[^0-9A-Fa-f]/g,"");F.length===8?(m(c,parseInt(F.slice(0,2),16)/255),y(F.slice(2,8)),W()):F.length===6&&(y(F),W())}const je=[{id:"hue",label:"H"},{id:"saturation",label:"S"},{id:"lightness",label:"B"},{id:"alpha",label:"A"}];function Xe(F){switch(F){case"hue":return n(P);case"saturation":return n(Q);case"lightness":return n(H);case"alpha":return n(A)}}function ze(F){switch(F){case"hue":return n(K);case"saturation":return n(pe);case"lightness":return n(de);case"alpha":return n(L)}}function Ae(F){return n(F==="alpha"?j:G)}var Ze=md();zt("mousemove",gr,function(...F){var E;(E=n(u)?V:void 0)==null||E.apply(this,F)}),zt("mouseup",gr,function(...F){var E;(E=n(u)?ie:void 0)==null||E.apply(this,F)});var me=v(d(Ze),2),Ne=v(me,2),I=d(Ne),le=v(Ne,2);it(le,21,()=>je,ht,(F,E)=>{var Y=_d(),S=d(Y);let X;var ne=d(S);{var J=Te=>{var nt=gd();x(Te,nt)};xe(ne,Te=>{n(E).id==="alpha"&&Te(J)})}var ae=v(ne,2),fe=v(ae,2),Pe=v(fe,2),et=d(Pe);se((Te,nt,tt,$e)=>{X=qe(S,1,"band svelte-6w7hwg",null,X,{"is-alpha":n(E).id==="alpha"}),Ve(S,"data-band",n(E).id),Ve(S,"aria-valuenow",Te),ke(ae,`background: ${nt??""}`),ke(fe,`left: ${tt??""}%; background: ${$e??""}`),Be(et,n(E).label)},[()=>ze(n(E).id)*100,()=>Xe(n(E).id),()=>ze(n(E).id)*100,()=>Ae(n(E).id)]),$("mousedown",S,Te=>ve(n(E).id,Te)),x(F,Y)}),se(()=>{ke(me,`background: ${n(M)??""}`),Et(I,n(h)?n(g):n(O))}),zt("focus",I,_e),zt("blur",I,Ee),$("keydown",I,Le),$("input",I,F=>m(g,F.target.value,!0)),x(e,Ze),st()}vt(["keydown","input","mousedown"]);var wd=D("<button> </button>"),yd=D('<button class="harmony-swatch svelte-3j5puu"></button>'),xd=D("<button> </button>"),$d=D('<div class="depth-preview svelte-3j5puu"><span class="depth-swatch svelte-3j5puu"></span> <span class="depth-arrow svelte-3j5puu">→</span> <span class="depth-swatch svelte-3j5puu"></span> <span class="depth-hex svelte-3j5puu"> </span></div>'),kd=D('<div class="color-settings svelte-3j5puu"><div class="section svelte-3j5puu"><div class="section-label svelte-3j5puu">Format</div> <div class="format-row svelte-3j5puu"><select class="combo format-combo svelte-3j5puu"><option>Hex</option><option>RGB</option><option>ARGB</option><option>RGBA</option><option>HSL</option><option>HSLA</option></select> <div class="value-row svelte-3j5puu"><span class="value-text svelte-3j5puu"> </span> <button class="copy-btn svelte-3j5puu" title="Copy to clipboard"><!></button></div></div></div> <div class="section svelte-3j5puu"><div class="section-label svelte-3j5puu">Step</div> <div class="step-row svelte-3j5puu"></div></div> <div class="section svelte-3j5puu"><div class="section-label svelte-3j5puu">Harmony</div> <select class="combo svelte-3j5puu"><option>Complementary</option><option>Analogous</option><option>Triadic</option><option>Split-Complementary</option><option>Tetradic</option></select> <div class="harmony-swatches svelte-3j5puu"><button class="harmony-swatch current svelte-3j5puu"></button> <!></div></div> <div class="section svelte-3j5puu"><div class="section-label svelte-3j5puu">Quick Actions</div> <div class="actions-row svelte-3j5puu"><button class="action-btn svelte-3j5puu" title="Darken 10%"><!></button> <button class="action-btn svelte-3j5puu" title="Lighten 10%"><!></button> <button class="action-btn svelte-3j5puu" title="Desaturate -15%"><!></button> <button class="action-btn svelte-3j5puu" title="Saturate +15%"><!></button> <button class="action-btn svelte-3j5puu" title="Grayscale"><span class="action-text svelte-3j5puu">G</span></button> <button class="action-btn svelte-3j5puu" title="Invert"><!></button></div></div> <div class="section svelte-3j5puu"><div class="section-label svelte-3j5puu">Opacity</div> <div class="opacity-row svelte-3j5puu"></div></div> <div class="section svelte-3j5puu"><div class="section-label svelte-3j5puu">Depth</div> <select class="combo svelte-3j5puu"><option>8-bit (256)</option><option>16-bit (65K)</option><option>24-bit (16M)</option><option>32-bit (16M+A)</option></select> <!></div></div>');function Cd(e,t){lt(t,!0);let r=We(t,"color",3,"FF0000"),o=We(t,"alpha",3,1),i=We(t,"stepSize",15,10),l=U("hex"),a=U("complementary"),s=U("24"),c=U(!1);function u(Z){return Z=Z.replace(/^#/,""),[parseInt(Z.slice(0,2),16),parseInt(Z.slice(2,4),16),parseInt(Z.slice(4,6),16)]}function g(Z,ee,re){Z/=255,ee/=255,re/=255;const Se=Math.max(Z,ee,re),Ye=Math.min(Z,ee,re);let k=0,B=0,Ce=(Se+Ye)/2;if(Se!==Ye){const Oe=Se-Ye;switch(B=Ce>.5?Oe/(2-Se-Ye):Oe/(Se+Ye),Se){case Z:k=((ee-re)/Oe+(ee<re?6:0))*60;break;case ee:k=((re-Z)/Oe+2)*60;break;case re:k=((Z-ee)/Oe+4)*60;break}}return[Math.round(k),Math.round(B*100),Math.round(Ce*100)]}function h(Z,ee,re){ee/=100,re/=100;const Se=B=>(B+Z/30)%12,Ye=ee*Math.min(re,1-re),k=B=>re-Ye*Math.max(-1,Math.min(Se(B)-3,9-Se(B),1));return[Math.round(k(0)*255),Math.round(k(8)*255),Math.round(k(4)*255)]}function p(Z,ee,re){const Se=Ye=>Math.max(0,Math.min(255,Math.round(Ye))).toString(16).padStart(2,"0").toUpperCase();return Se(Z)+Se(ee)+Se(re)}function _(Z,ee=o()){if(t.onApplyColor){const re=Math.round(ee*255).toString(16).padStart(2,"0").toUpperCase();t.onApplyColor(re+Z)}}let f=T(()=>u(r())),w=T(()=>g(n(f)[0],n(f)[1],n(f)[2])),b=U(0),y=U(0);Wt(()=>{const[Z,ee,re]=n(f),[Se,Ye]=n(w);(Z!==ee||ee!==re)&&(m(b,Se,!0),m(y,Ye,!0))});let R=T(()=>[n(b),n(y),n(w)[2]]),q=T(()=>Math.round(o()*255)),z=T(()=>o().toFixed(2)),N=T(()=>(()=>{const[Z,ee,re]=n(f),[Se,Ye,k]=n(R);switch(n(l)){case"hex":return`#${n(q).toString(16).padStart(2,"0").toUpperCase()}${r()}`;case"rgb":return`rgb(${Z}, ${ee}, ${re})`;case"argb":return`argb(${n(q)}, ${Z}, ${ee}, ${re})`;case"rgba":return`rgba(${Z}, ${ee}, ${re}, ${n(z)})`;case"hsl":return`hsl(${Se}, ${Ye}%, ${k}%)`;case"hsla":return`hsla(${Se}, ${Ye}%, ${k}%, ${n(z)})`;default:return`#${r()}`}})());async function O(){try{await navigator.clipboard.writeText(n(N)),m(c,!0),setTimeout(()=>m(c,!1),1200)}catch{}}function M(Z,ee){return((Z+ee)%360+360)%360}function P(Z,ee,re){const[Se,Ye,k]=h(Z,ee,re);return p(Se,Ye,k)}let Q=T(()=>(()=>{const[Z,ee,re]=n(R);switch(n(a)){case"complementary":return[P(M(Z,180),ee,re)];case"analogous":return[P(M(Z,-30),ee,re),P(M(Z,30),ee,re)];case"triadic":return[P(M(Z,120),ee,re),P(M(Z,240),ee,re)];case"split":return[P(M(Z,150),ee,re),P(M(Z,210),ee,re)];case"tetradic":return[P(M(Z,90),ee,re),P(M(Z,180),ee,re),P(M(Z,270),ee,re)];default:return[]}})());function H(){const[Z,ee,re]=n(f);_(p(255-Z,255-ee,255-re))}function A(){const[Z,ee,re]=n(f),Se=Math.round(.299*Z+.587*ee+.114*re);_(p(Se,Se,Se))}function K(){const[Z,ee,re]=n(R),Se=Math.min(100,re+10),[Ye,k,B]=h(Z,ee,Se);_(p(Ye,k,B))}function pe(){const[Z,ee,re]=n(R),Se=Math.max(0,re-10),[Ye,k,B]=h(Z,ee,Se);_(p(Ye,k,B))}function de(){const[Z,ee,re]=n(R),Se=Math.max(0,ee-15),[Ye,k,B]=h(Z,Se,re);_(p(Ye,k,B))}function L(){const[Z,ee,re]=n(R),Se=Math.min(100,ee+15),[Ye,k,B]=h(Z,Se,re);_(p(Ye,k,B))}function G(Z){_(r(),Z)}function j(Z,ee){const re=(1<<ee)-1;return Math.round(Z/255*re)*255/re}function W(Z,ee,re,Se){switch(Se){case"8":return[j(Z,3),j(ee,3),j(re,2)];case"16":return[j(Z,5),j(ee,6),j(re,5)];default:return[Z,ee,re]}}let te=T(()=>W(n(f)[0],n(f)[1],n(f)[2],n(s))),ve=T(()=>p(n(te)[0],n(te)[1],n(te)[2])),ye=T(()=>n(s)==="8"||n(s)==="16");var V=kd(),ie=d(V),_e=v(d(ie),2),Ee=d(_e),Le=d(Ee);Le.value=Le.__value="hex";var at=v(Le);at.value=at.__value="rgb";var je=v(at);je.value=je.__value="argb";var Xe=v(je);Xe.value=Xe.__value="rgba";var ze=v(Xe);ze.value=ze.__value="hsl";var Ae=v(ze);Ae.value=Ae.__value="hsla";var Ze=v(Ee,2),me=d(Ze),Ne=d(me),I=v(me,2),le=d(I);{var F=Z=>{lu(Z,{size:12,strokeWidth:1.5})},E=Z=>{cu(Z,{size:12,strokeWidth:1.5})};xe(le,Z=>{n(c)?Z(F):Z(E,-1)})}var Y=v(ie,2),S=v(d(Y),2);it(S,20,()=>[1,5,10,20,25],ht,(Z,ee)=>{var re=wd();let Se;var Ye=d(re);se(()=>{Se=qe(re,1,"step-btn svelte-3j5puu",null,Se,{active:i()===ee}),Be(Ye,`${ee??""}%`)}),$("click",re,()=>i(ee)),x(Z,re)});var X=v(Y,2),ne=v(d(X),2),J=d(ne);J.value=J.__value="complementary";var ae=v(J);ae.value=ae.__value="analogous";var fe=v(ae);fe.value=fe.__value="triadic";var Pe=v(fe);Pe.value=Pe.__value="split";var et=v(Pe);et.value=et.__value="tetradic";var Te=v(ne,2),nt=d(Te),tt=v(nt,2);it(tt,17,()=>n(Q),ht,(Z,ee)=>{var re=yd();se(()=>{ke(re,`background: #${n(ee)??""}`),Ve(re,"title",`#${n(ee)??""} — click to apply`)}),$("click",re,()=>_(n(ee))),x(Z,re)});var $e=v(X,2),Fe=v(d($e),2),rt=d(Fe),Je=d(rt);xu(Je,{size:13,strokeWidth:1.5});var Re=v(rt,2),ce=d(Re);Tu(ce,{size:13,strokeWidth:1.5});var Ie=v(Re,2),ct=d(Ie);ju(ct,{size:13,strokeWidth:1.5});var ot=v(Ie,2),xt=d(ot);uu(xt,{size:13,strokeWidth:1.5});var $t=v(ot,2),ut=v($t,2),Tt=d(ut);bl(Tt,{size:13,strokeWidth:1.5});var dt=v($e,2),bt=v(d(dt),2);it(bt,20,()=>[0,.25,.5,.75,1],ht,(Z,ee)=>{var re=xd();let Se;var Ye=d(re);se((k,B)=>{Se=qe(re,1,"opacity-btn svelte-3j5puu",null,Se,k),Be(Ye,`${B??""}%`)},[()=>({active:Math.abs(o()-ee)<.01}),()=>Math.round(ee*100)]),$("click",re,()=>G(ee)),x(Z,re)});var Dt=v(dt,2),St=v(d(Dt),2),Ke=d(St);Ke.value=Ke.__value="8";var Qe=v(Ke);Qe.value=Qe.__value="16";var Rt=v(Qe);Rt.value=Rt.__value="24";var Ot=v(Rt);Ot.value=Ot.__value="32";var Ln=v(St,2);{var sn=Z=>{var ee=$d(),re=d(ee),Se=v(re,4),Ye=v(Se,2),k=d(Ye);se(()=>{ke(re,`background: #${r()??""}`),ke(Se,`background: #${n(ve)??""}`),Be(k,`#${n(ve)??""}`)}),x(Z,ee)};xe(Ln,Z=>{n(ye)&&Z(sn)})}se(()=>{Be(Ne,n(N)),ke(nt,`background: #${r()??""}`),Ve(nt,"title",`Current: #${r()??""}`)}),xr(Ee,()=>n(l),Z=>m(l,Z)),$("click",I,O),xr(ne,()=>n(a),Z=>m(a,Z)),$("click",rt,pe),$("click",Re,K),$("click",Ie,de),$("click",ot,L),$("click",$t,A),$("click",ut,H),xr(St,()=>n(s),Z=>m(s,Z)),x(e,V),st()}vt(["click"]);var Sd=Ci('<line stroke="rgba(255,255,255,0.15)" stroke-width="0.3" stroke-dasharray="1,1.5"></line>'),Md=D('<div class="center-handle svelte-ki4x81"></div>'),Ed=D('<div class="radius-handle perp svelte-ki4x81"></div>'),zd=D('<div class="radius-handle svelte-ki4x81"></div> <!>',1),Nd=D("<div></div>"),Pd=D('<div class="shape-container svelte-ki4x81"><div><div class="gradient-bg svelte-ki4x81"></div> <svg class="axis-svg svelte-ki4x81" viewBox="0 0 100 100" preserveAspectRatio="none"><line stroke="rgba(255,255,255,0.3)" stroke-width="0.4" stroke-dasharray="1.5,1"></line><!></svg> <!> <!> <!></div></div>'),Td=Ci('<line stroke="rgba(255,255,255,0.15)" stroke-width="0.3" stroke-dasharray="1,1.5"></line>'),Id=D('<div class="center-handle svelte-ki4x81"></div>'),Ad=D('<div class="radius-handle svelte-ki4x81"></div> <div class="radius-handle perp svelte-ki4x81"></div>',1),Fd=D("<div></div>"),jd=D('<div class="gradient-surface full svelte-ki4x81"></div>  <div class="axis-overlay axis-host svelte-ki4x81"><svg class="axis-svg svelte-ki4x81" viewBox="0 0 100 100" preserveAspectRatio="none"><line stroke="rgba(255,255,255,0.3)" stroke-width="0.4" stroke-dasharray="1.5,1"></line><!></svg> <!> <!> <!></div>',1),Rd=D('<div class="gradient-editor svelte-ki4x81"><div class="checkerboard svelte-ki4x81"></div> <!></div>');function Od(e,t){lt(t,!0);let r=T(()=>t.gradient),o=T(()=>t.selectedStop??0),i=T(()=>t.shape??"rectangle"),l=T(()=>t.onchange),a=T(()=>t.onSelectStop),s=U(pt([])),c=U(50),u=U(50),g=U(50),h=U(50),p=U(!1),_=U(null),f=U(0),w=U(100),b=U(100);cl(()=>{if(!n(_))return;const E=new ResizeObserver(([Y])=>{m(w,Y.contentRect.width,!0),m(b,Y.contentRect.height,!0)});return E.observe(n(_)),()=>E.disconnect()}),Wt(()=>{m(f,Math.floor(Math.min(n(w),n(b))*.85),!0)});let y=T(()=>n(i)==="ellipse"?Math.floor(n(w)*.85):n(f)),R=T(()=>n(i)==="ellipse"?Math.floor(n(b)*.85):n(f)),q=!1;Wt(()=>{const E=n(r);!n(p)&&!q&&E&&(E.stops&&m(s,E.stops.map(Y=>({...Y})),!0),m(c,E.centerX??50,!0),m(u,E.centerY??50,!0),m(g,E.radiusX??50,!0),m(h,E.radiusY??50,!0)),q=!1});let z=T(()=>({...n(r),stops:n(s),centerX:n(c),centerY:n(u),radiusX:n(g),radiusY:n(h)})),N=T(()=>n(z).type==="squareRamp"?`url(${Cl(n(z),256,256)})`:zo(n(z),n(i))),O=T(()=>kl(n(z))),M=T(()=>$l(n(z))),P=T(()=>n(i)==="circle"?"shape-circle":n(i)==="square"?"shape-square":n(i)==="ellipse"?"shape-ellipse":n(i)==="triangle"?"shape-triangle":""),Q=T(()=>n(i)!=="rectangle"),H=T(()=>["radial","radialRamp"].includes(n(r).type)),A=T(()=>["radial","radialRamp","conical"].includes(n(r).type)),K=T(()=>["radial","radialRamp"].includes(n(r).type)),pe=T(()=>(()=>{switch(n(r).type){case"radial":case"radialRamp":return 90;case"conical":return n(r).angle??0;default:return n(r).angle??90}})()),de=T(()=>(n(pe)-90)*Math.PI/180),L=T(()=>n(A)?n(c):50),G=T(()=>n(A)?n(u):50),j=T(()=>(()=>{if(n(i)!=="rectangle")return 48;const E=n(L),Y=n(G),S=Math.cos(n(de)),X=Math.sin(n(de));let ne=1/0;return Math.abs(S)>.001&&(ne=Math.min(ne,Math.abs((S>0?100-E:E)/S))),Math.abs(X)>.001&&(ne=Math.min(ne,Math.abs((X>0?100-Y:Y)/X))),Math.min(ne*.95,50)})()),W=T(()=>(()=>{if(n(H))return{x:n(L),y:n(G)};const E=Math.cos(n(de)),Y=Math.sin(n(de));return{x:n(L)-E*n(j),y:n(G)-Y*n(j)}})()),te=T(()=>(()=>{if(n(H))return{x:n(L)+n(g),y:n(G)};const E=Math.cos(n(de)),Y=Math.sin(n(de));return{x:n(L)+E*n(j),y:n(G)+Y*n(j)}})()),ve=U(null);function ye(E){const Y=n(ve);if(!Y)return 50;const S=Y.getBoundingClientRect(),X=(E.clientX-S.left)/S.width*100,ne=(E.clientY-S.top)/S.height*100,J=n(te).x-n(W).x,ae=n(te).y-n(W).y,fe=J*J+ae*ae;if(fe<.001)return 0;const Pe=((X-n(W).x)*J+(ne-n(W).y)*ae)/fe;return Math.max(0,Math.min(100,Math.round(Pe*100)))}function V(E){const Y=E.position/100,S=n(W).x+(n(te).x-n(W).x)*Y,X=n(W).y+(n(te).y-n(W).y)*Y;return`left: ${S}%; top: ${X}%; background: #${E.color}`}let ie=T(()=>({x1:n(W).x,y1:n(W).y,x2:n(te).x,y2:n(te).y})),_e=T(()=>n(K)&&(n(i)==="rectangle"||n(i)==="ellipse")),Ee=T(()=>n(K)?{x:n(L),y:n(G)+n(h)}:{x:n(L),y:n(G)}),Le=T(()=>({x1:n(L),y1:n(G),x2:n(Ee).x,y2:n(Ee).y}));function at(){n(l)&&n(l)({...n(r),stops:n(s),centerX:n(c),centerY:n(u),radiusX:n(g),radiusY:n(h)})}function je(E,Y){Y.preventDefault(),Y.stopPropagation(),m(p,!0),n(a)&&n(a)(E);function S(ne){const J=ye(ne);m(s,n(s).map((ae,fe)=>fe===E?{...ae,position:J}:ae),!0)}function X(){document.removeEventListener("mousemove",S),document.removeEventListener("mouseup",X),m(p,!1),Ae=!0,q=!0,at()}document.addEventListener("mousemove",S),document.addEventListener("mouseup",X)}function Xe(E){E.preventDefault(),E.stopPropagation(),m(p,!0);function Y(X){const ne=n(ve);if(!ne)return;const J=ne.getBoundingClientRect();m(c,Math.max(0,Math.min(100,Math.round((X.clientX-J.left)/J.width*100))),!0),m(u,Math.max(0,Math.min(100,Math.round((X.clientY-J.top)/J.height*100))),!0)}function S(){document.removeEventListener("mousemove",Y),document.removeEventListener("mouseup",S),m(p,!1),Ae=!0,q=!0,at()}document.addEventListener("mousemove",Y),document.addEventListener("mouseup",S)}function ze(E,Y){Y.preventDefault(),Y.stopPropagation(),m(p,!0);function S(ne){const J=n(ve);if(!J)return;const ae=J.getBoundingClientRect(),fe=(ne.clientX-ae.left)/ae.width*100,Pe=(ne.clientY-ae.top)/ae.height*100;E==="x"?m(g,Math.max(1,Math.round(Math.abs(fe-n(c)))),!0):m(h,Math.max(1,Math.round(Math.abs(Pe-n(u)))),!0)}function X(){document.removeEventListener("mousemove",S),document.removeEventListener("mouseup",X),m(p,!1),Ae=!0,q=!0,at()}document.addEventListener("mousemove",S),document.addEventListener("mouseup",X)}let Ae=!1;function Ze(E){if(Ae){Ae=!1;return}if(E.target.closest(".stop-thumb")||E.target.closest(".center-handle")||E.target.closest(".radius-handle"))return;const Y=ye(E),S=Ju(n(s),Y),X=[...n(s),{color:S,position:Y}];m(s,X,!0),q=!0,n(l)&&n(l)({...n(r),stops:X}),n(a)&&n(a)(X.length-1)}function me(E,Y){if(Y.preventDefault(),Y.stopPropagation(),n(s).length<=2)return;const S=n(s).filter((X,ne)=>ne!==E);m(s,S,!0),q=!0,n(l)&&n(l)({...n(r),stops:S}),n(a)&&n(a)(Math.min(E,S.length-1))}var Ne=Rd(),I=v(d(Ne),2);{var le=E=>{var Y=Pd(),S=d(Y),X=d(S),ne=v(X,2),J=d(ne),ae=v(J);{var fe=$e=>{var Fe=Sd();se(()=>{Ve(Fe,"x1",n(Le).x1),Ve(Fe,"y1",n(Le).y1),Ve(Fe,"x2",n(Le).x2),Ve(Fe,"y2",n(Le).y2)}),x($e,Fe)};xe(ae,$e=>{n(_e)&&$e(fe)})}var Pe=v(ne,2);{var et=$e=>{var Fe=Md();se(()=>ke(Fe,`left: ${n(L)??""}%; top: ${n(G)??""}%`)),$("mousedown",Fe,Xe),x($e,Fe)};xe(Pe,$e=>{n(A)&&$e(et)})}var Te=v(Pe,2);{var nt=$e=>{var Fe=zd(),rt=oe(Fe),Je=v(rt,2);{var Re=ce=>{var Ie=Ed();se(()=>ke(Ie,`left: ${n(Ee).x??""}%; top: ${n(Ee).y??""}%`)),$("mousedown",Ie,ct=>ze("y",ct)),x(ce,Ie)};xe(Je,ce=>{(n(i)==="rectangle"||n(i)==="ellipse")&&ce(Re)})}se(()=>ke(rt,`left: ${n(te).x??""}%; top: ${n(te).y??""}%`)),$("mousedown",rt,ce=>ze("x",ce)),x($e,Fe)};xe(Te,$e=>{n(K)&&$e(nt)})}var tt=v(Te,2);it(tt,17,()=>n(s),ht,($e,Fe,rt)=>{var Je=Nd();let Re;se(ce=>{Re=qe(Je,1,"stop-thumb svelte-ki4x81",null,Re,{selected:rt===n(o)}),ke(Je,ce)},[()=>V(n(Fe))]),$("mousedown",Je,ce=>je(rt,ce)),$("contextmenu",Je,ce=>me(rt,ce)),x($e,Je)}),Rn(S,$e=>m(ve,$e),()=>n(ve)),se(()=>{qe(S,1,`gradient-surface ${n(P)??""} axis-host`,"svelte-ki4x81"),ke(S,`width: ${n(y)??""}px; height: ${n(R)??""}px;`),ke(X,`background: ${n(N)??""}; background-size: 100% 100%;${n(O)?` filter: ${n(O)};`:""}${n(M)?` background-blend-mode: ${n(M)};`:""}`),Ve(J,"x1",n(ie).x1),Ve(J,"y1",n(ie).y1),Ve(J,"x2",n(ie).x2),Ve(J,"y2",n(ie).y2)}),$("click",S,Ze),x(E,Y)},F=E=>{var Y=jd(),S=oe(Y),X=v(S,2),ne=d(X),J=d(ne),ae=v(J);{var fe=$e=>{var Fe=Td();se(()=>{Ve(Fe,"x1",n(Le).x1),Ve(Fe,"y1",n(Le).y1),Ve(Fe,"x2",n(Le).x2),Ve(Fe,"y2",n(Le).y2)}),x($e,Fe)};xe(ae,$e=>{n(_e)&&$e(fe)})}var Pe=v(ne,2);{var et=$e=>{var Fe=Id();se(()=>ke(Fe,`left: ${n(L)??""}%; top: ${n(G)??""}%`)),$("mousedown",Fe,Xe),x($e,Fe)};xe(Pe,$e=>{n(A)&&$e(et)})}var Te=v(Pe,2);{var nt=$e=>{var Fe=Ad(),rt=oe(Fe),Je=v(rt,2);se(()=>{ke(rt,`left: ${n(te).x??""}%; top: ${n(te).y??""}%`),ke(Je,`left: ${n(Ee).x??""}%; top: ${n(Ee).y??""}%`)}),$("mousedown",rt,Re=>ze("x",Re)),$("mousedown",Je,Re=>ze("y",Re)),x($e,Fe)};xe(Te,$e=>{n(K)&&$e(nt)})}var tt=v(Te,2);it(tt,17,()=>n(s),ht,($e,Fe,rt)=>{var Je=Fd();let Re;se(ce=>{Re=qe(Je,1,"stop-thumb svelte-ki4x81",null,Re,{selected:rt===n(o)}),ke(Je,ce)},[()=>V(n(Fe))]),$("mousedown",Je,ce=>je(rt,ce)),$("contextmenu",Je,ce=>me(rt,ce)),x($e,Je)}),Rn(X,$e=>m(ve,$e),()=>n(ve)),se(()=>{ke(S,`background: ${n(N)??""}; background-size: 100% 100%;${n(O)?` filter: ${n(O)};`:""}${n(M)?` background-blend-mode: ${n(M)};`:""}`),Ve(J,"x1",n(ie).x1),Ve(J,"y1",n(ie).y1),Ve(J,"x2",n(ie).x2),Ve(J,"y2",n(ie).y2)}),$("click",X,Ze),x(E,Y)};xe(I,E=>{n(Q)?E(le):E(F,-1)})}Rn(Ne,E=>m(_,E),()=>n(_)),x(e,Ne),st()}vt(["click","mousedown","contextmenu"]);var qd=D('<div class="section-label svelte-10tq9kx">Angle</div> <div class="input-row svelte-10tq9kx"><div class="num-input-wrap svelte-10tq9kx"><button class="pos-arrow left svelte-10tq9kx" tabindex="-1">&#9664;</button> <input class="num-input svelte-10tq9kx" type="number" min="0" max="360"/> <button class="pos-arrow right svelte-10tq9kx" tabindex="-1">&#9654;</button></div> <span class="input-suffix svelte-10tq9kx">°</span></div>',1),Ld=D('<div class="section-label svelte-10tq9kx" style="margin-top: 4px">Center</div> <div class="input-row svelte-10tq9kx"><span class="input-prefix svelte-10tq9kx">X</span> <div class="num-input-wrap svelte-10tq9kx"><button class="pos-arrow left svelte-10tq9kx" tabindex="-1">&#9664;</button> <input class="num-input svelte-10tq9kx" type="number" min="0" max="100"/> <button class="pos-arrow right svelte-10tq9kx" tabindex="-1">&#9654;</button></div> <span class="input-prefix svelte-10tq9kx" style="margin-left: 4px">Y</span> <div class="num-input-wrap svelte-10tq9kx"><button class="pos-arrow left svelte-10tq9kx" tabindex="-1">&#9664;</button> <input class="num-input svelte-10tq9kx" type="number" min="0" max="100"/> <button class="pos-arrow right svelte-10tq9kx" tabindex="-1">&#9654;</button></div></div>',1),Dd=D('<span class="input-prefix svelte-10tq9kx">X</span>'),Hd=D('<span class="input-prefix svelte-10tq9kx" style="margin-left: 4px">Y</span> <div class="num-input-wrap svelte-10tq9kx"><button class="pos-arrow left svelte-10tq9kx" tabindex="-1">&#9664;</button> <input class="num-input svelte-10tq9kx" type="number" min="1" max="200"/> <button class="pos-arrow right svelte-10tq9kx" tabindex="-1">&#9654;</button></div>',1),Bd=D('<div class="section-label svelte-10tq9kx" style="margin-top: 4px">Radius</div> <div class="input-row svelte-10tq9kx"><!> <div class="num-input-wrap svelte-10tq9kx"><button class="pos-arrow left svelte-10tq9kx" tabindex="-1">&#9664;</button> <input class="num-input svelte-10tq9kx" type="number" min="1" max="200"/> <button class="pos-arrow right svelte-10tq9kx" tabindex="-1">&#9654;</button></div> <!></div>',1),Gd=D('<div class="section svelte-10tq9kx"><!> <!> <!></div>'),Yd=D('<button class="stop-delete svelte-10tq9kx" title="Delete stop"><!></button>'),Ud=D('<div><button class="stop-color svelte-10tq9kx" title="Click to edit color"></button> <span class="stop-hex svelte-10tq9kx"> </span> <div class="stop-pos-wrap svelte-10tq9kx"><button class="pos-arrow left svelte-10tq9kx" tabindex="-1" title="Decrease">&#9664;</button> <input class="stop-pos svelte-10tq9kx" type="number" min="0" max="100"/> <button class="pos-arrow right svelte-10tq9kx" tabindex="-1" title="Increase">&#9654;</button></div> <span class="stop-pct svelte-10tq9kx">%</span> <!></div>'),Wd=D("<button></button>"),Xd=D('<div class="gradient-settings svelte-10tq9kx"><div class="section svelte-10tq9kx"><div class="section-label svelte-10tq9kx">Type</div> <select class="combo svelte-10tq9kx"><optgroup label="Basic"><option>Linear</option> <option>Radial</option> <option>Conical</option></optgroup><optgroup label="Multi-point"><option>Radial Ramp</option> <option>Linear Ramp</option> <option>Square Ramp</option> <option>Reflected</option> <option>Mesh</option> <option>Volume Mesh</option></optgroup><optgroup label="Preset"><option>Duotone</option> <option>Tricolor</option> <option>Banding</option></optgroup></select></div> <!> <div class="section svelte-10tq9kx"><div class="section-label svelte-10tq9kx">Shape</div> <div class="toggle-row svelte-10tq9kx"><button title="Circle"><!></button> <button title="Ellipse"><!></button> <button title="Square"><!></button> <button title="Rectangle"><!></button> <button title="Triangle"><!></button></div></div> <div class="section svelte-10tq9kx"><div class="section-label svelte-10tq9kx">Edge</div> <div class="input-row svelte-10tq9kx"><div class="num-input-wrap svelte-10tq9kx"><button class="pos-arrow left svelte-10tq9kx" tabindex="-1">&#9664;</button> <input class="num-input svelte-10tq9kx" type="number" min="0" max="100"/> <button class="pos-arrow right svelte-10tq9kx" tabindex="-1">&#9654;</button></div> <span class="input-suffix svelte-10tq9kx">%</span></div></div> <div class="section stops-section svelte-10tq9kx"><div class="section-label svelte-10tq9kx">Stops</div> <div class="stops-list svelte-10tq9kx"></div> <button class="add-stop-btn svelte-10tq9kx"><!> Add</button></div> <div class="section svelte-10tq9kx"><div class="section-label svelte-10tq9kx">Presets</div> <div class="gradient-swatches-grid svelte-10tq9kx"></div></div></div>');function Vd(e,t){lt(t,!0);let r=T(()=>t.gradient),o=T(()=>t.selectedStop??0),i=T(()=>t.shape??"rectangle"),l=T(()=>t.onchange),a=T(()=>t.onSelectStop),s=T(()=>t.onEditStopColor),c=T(()=>t.onShapeChange),u=T(()=>t.gradientSwatches??[]),g=T(()=>t.onGradientPresetClick),h=T(()=>t.onGradientPresetDblClick),p=T(()=>t.onGradientPresetRightClick);function _(ce){n(l)({...n(r),...ce})}function f(ce,Ie){const ct=n(r).stops.map((ot,xt)=>xt===ce?{...ot,...Ie}:ot);n(l)({...n(r),stops:ct})}function w(ce){if(n(r).stops.length<=2)return;const Ie=n(r).stops.filter((ct,ot)=>ot!==ce);n(l)({...n(r),stops:Ie}),n(a)&&n(a)(Math.min(ce,Ie.length-1))}function b(){var Dt,St;const ce=[...n(r).stops].sort((Ke,Qe)=>Ke.position-Qe.position);let Ie=0,ct=0,ot=100;for(let Ke=0;Ke<ce.length-1;Ke++){const Qe=ce[Ke+1].position-ce[Ke].position;Qe>Ie&&(Ie=Qe,ct=ce[Ke].position,ot=ce[Ke+1].position)}const xt=Math.round((ct+ot)/2),$t=((Dt=ce.find(Ke=>Ke.position===ct))==null?void 0:Dt.color)||"888888",ut=((St=ce.find(Ke=>Ke.position===ot))==null?void 0:St.color)||"888888",Tt=(Ke,Qe)=>Math.round((parseInt(Ke,16)+parseInt(Qe,16))/2).toString(16).padStart(2,"0"),dt=Tt($t.slice(0,2),ut.slice(0,2))+Tt($t.slice(2,4),ut.slice(2,4))+Tt($t.slice(4,6),ut.slice(4,6)),bt=[...n(r).stops,{color:dt.toUpperCase(),position:xt}];n(l)({...n(r),stops:bt}),n(a)&&n(a)(bt.length-1)}let y=T(()=>["linear","linearRamp","conical","reflected","duotone","tricolor","banding"].includes(n(r).type)),R=T(()=>["radial","conical","radialRamp","squareRamp","mesh","volumeMesh"].includes(n(r).type)),q=T(()=>["radial","radialRamp","linearRamp","squareRamp"].includes(n(r).type)),z=T(()=>[...n(r).stops].map((ce,Ie)=>({...ce,origIdx:Ie})).sort((ce,Ie)=>ce.position-Ie.position));function N(ce){ce.key==="Enter"&&ce.target.blur()}var O=Xd(),M=d(O),P=v(d(M),2),Q=d(P),H=d(Q);H.value=H.__value="linear";var A=v(H,2);A.value=A.__value="radial";var K=v(A,2);K.value=K.__value="conical";var pe=v(Q),de=d(pe);de.value=de.__value="radialRamp";var L=v(de,2);L.value=L.__value="linearRamp";var G=v(L,2);G.value=G.__value="squareRamp";var j=v(G,2);j.value=j.__value="reflected";var W=v(j,2);W.value=W.__value="mesh";var te=v(W,2);te.value=te.__value="volumeMesh";var ve=v(pe),ye=d(ve);ye.value=ye.__value="duotone";var V=v(ye,2);V.value=V.__value="tricolor";var ie=v(V,2);ie.value=ie.__value="banding";var _e;ao(P);var Ee=v(M,2);{var Le=ce=>{var Ie=Gd(),ct=d(Ie);{var ot=dt=>{var bt=qd(),Dt=v(oe(bt),2),St=d(Dt),Ke=d(St),Qe=v(Ke,2),Rt=v(Qe,2);se(()=>Et(Qe,n(r).angle)),$("click",Ke,()=>_({angle:Math.max(0,(n(r).angle??90)-1)})),$("keydown",Qe,N),$("change",Qe,Ot=>_({angle:parseInt(Ot.target.value)||0})),$("click",Rt,()=>_({angle:Math.min(360,(n(r).angle??90)+1)})),x(dt,bt)};xe(ct,dt=>{n(y)&&dt(ot)})}var xt=v(ct,2);{var $t=dt=>{var bt=Ld(),Dt=v(oe(bt),2),St=v(d(Dt),2),Ke=d(St),Qe=v(Ke,2),Rt=v(Qe,2),Ot=v(St,4),Ln=d(Ot),sn=v(Ln,2),Z=v(sn,2);se(()=>{Et(Qe,n(r).centerX),Et(sn,n(r).centerY)}),$("click",Ke,()=>_({centerX:Math.max(0,(n(r).centerX??50)-1)})),$("keydown",Qe,N),$("change",Qe,ee=>_({centerX:parseInt(ee.target.value)||50})),$("click",Rt,()=>_({centerX:Math.min(100,(n(r).centerX??50)+1)})),$("click",Ln,()=>_({centerY:Math.max(0,(n(r).centerY??50)-1)})),$("keydown",sn,N),$("change",sn,ee=>_({centerY:parseInt(ee.target.value)||50})),$("click",Z,()=>_({centerY:Math.min(100,(n(r).centerY??50)+1)})),x(dt,bt)};xe(xt,dt=>{n(R)&&dt($t)})}var ut=v(xt,2);{var Tt=dt=>{var bt=Bd(),Dt=v(oe(bt),2),St=d(Dt);{var Ke=ee=>{var re=Dd();x(ee,re)};xe(St,ee=>{(n(i)==="rectangle"||n(i)==="ellipse")&&ee(Ke)})}var Qe=v(St,2),Rt=d(Qe),Ot=v(Rt,2),Ln=v(Ot,2),sn=v(Qe,2);{var Z=ee=>{var re=Hd(),Se=v(oe(re),2),Ye=d(Se),k=v(Ye,2),B=v(k,2);se(()=>Et(k,n(r).radiusY)),$("click",Ye,()=>_({radiusY:Math.max(1,(n(r).radiusY??50)-1)})),$("change",k,Ce=>_({radiusY:parseInt(Ce.target.value)||50})),$("click",B,()=>_({radiusY:Math.min(200,(n(r).radiusY??50)+1)})),x(ee,re)};xe(sn,ee=>{(n(i)==="rectangle"||n(i)==="ellipse")&&ee(Z)})}se(()=>Et(Ot,n(r).radiusX)),$("click",Rt,()=>_({radiusX:Math.max(1,(n(r).radiusX??50)-1)})),$("keydown",Ot,N),$("change",Ot,ee=>_({radiusX:parseInt(ee.target.value)||50})),$("click",Ln,()=>_({radiusX:Math.min(200,(n(r).radiusX??50)+1)})),x(dt,bt)};xe(ut,dt=>{n(q)&&dt(Tt)})}x(ce,Ie)};xe(Ee,ce=>{(n(y)||n(R)||n(q))&&ce(Le)})}var at=v(Ee,2),je=v(d(at),2),Xe=d(je);let ze;var Ae=d(Xe);Qi(Ae,{size:13,strokeWidth:1.5});var Ze=v(Xe,2);let me;var Ne=d(Ze);Qi(Ne,{size:13,strokeWidth:1.5,style:"transform: scaleX(1.4)"});var I=v(Ze,2);let le;var F=d(I);wl(F,{size:13,strokeWidth:1.5});var E=v(I,2);let Y;var S=d(E);ml(S,{size:13,strokeWidth:1.5});var X=v(E,2);let ne;var J=d(X);Ou(J,{size:13,strokeWidth:1.5});var ae=v(at,2),fe=v(d(ae),2),Pe=d(fe),et=d(Pe),Te=v(et,2),nt=v(Te,2),tt=v(ae,2),$e=v(d(tt),2);it($e,21,()=>n(z),ht,(ce,Ie)=>{var ct=Ud();let ot;var xt=d(ct),$t=v(xt,2),ut=d($t),Tt=v($t,2),dt=d(Tt),bt=v(dt,2),Dt=v(bt,2),St=v(Tt,4);{var Ke=Qe=>{var Rt=Yd(),Ot=d(Rt);Eo(Ot,{size:10,strokeWidth:2}),$("click",Rt,()=>w(n(Ie).origIdx)),x(Qe,Rt)};xe(St,Qe=>{n(r).stops.length>2&&Qe(Ke)})}se(()=>{ot=qe(ct,1,"stop-row svelte-10tq9kx",null,ot,{selected:n(Ie).origIdx===n(o)}),ke(xt,`background: #${n(Ie).color??""}`),Be(ut,`#${n(Ie).color??""}`),Et(bt,n(Ie).position)}),$("click",xt,()=>{n(a)&&n(a)(n(Ie).origIdx),n(s)&&n(s)(n(Ie).origIdx)}),$("click",dt,()=>f(n(Ie).origIdx,{position:Math.max(0,n(Ie).position-1)})),$("keydown",bt,N),$("change",bt,Qe=>f(n(Ie).origIdx,{position:parseInt(Qe.target.value)||0})),$("click",Dt,()=>f(n(Ie).origIdx,{position:Math.min(100,n(Ie).position+1)})),x(ce,ct)});var Fe=v($e,2),rt=d(Fe);Mo(rt,{size:11,strokeWidth:2});var Je=v(tt,2),Re=v(d(Je),2);it(Re,21,()=>n(u),ht,(ce,Ie,ct)=>{var ot=Wd();let xt;se($t=>{xt=qe(ot,1,"gradient-swatch svelte-10tq9kx",null,xt,{empty:!n(Ie)}),ke(ot,$t),Ve(ot,"title",n(Ie)?`${n(Ie).type} gradient — click to load, right-click to replace, double-click to clear`:"Click to store current gradient")},[()=>n(Ie)?`background: ${zo(n(Ie))}`:""]),$("click",ot,()=>n(g)&&n(g)(ct)),$("dblclick",ot,()=>n(h)&&n(h)(ct)),$("contextmenu",ot,$t=>n(p)&&n(p)(ct,$t)),x(ce,ot)}),se(()=>{_e!==(_e=n(r).type)&&(P.value=(P.__value=n(r).type)??"",_r(P,n(r).type)),ze=qe(Xe,1,"toggle-btn svelte-10tq9kx",null,ze,{active:n(i)==="circle"}),me=qe(Ze,1,"toggle-btn svelte-10tq9kx",null,me,{active:n(i)==="ellipse"}),le=qe(I,1,"toggle-btn svelte-10tq9kx",null,le,{active:n(i)==="square"}),Y=qe(E,1,"toggle-btn svelte-10tq9kx",null,Y,{active:n(i)==="rectangle"}),ne=qe(X,1,"toggle-btn svelte-10tq9kx",null,ne,{active:n(i)==="triangle"}),Et(Te,n(r).edge??0)}),$("change",P,ce=>_({type:ce.target.value})),$("click",Xe,()=>n(c)&&n(c)("circle")),$("click",Ze,()=>n(c)&&n(c)("ellipse")),$("click",I,()=>n(c)&&n(c)("square")),$("click",E,()=>n(c)&&n(c)("rectangle")),$("click",X,()=>n(c)&&n(c)("triangle")),$("click",et,()=>_({edge:Math.max(0,(n(r).edge??0)-1)})),$("keydown",Te,N),$("change",Te,ce=>_({edge:parseInt(ce.target.value)||0})),$("click",nt,()=>_({edge:Math.min(100,(n(r).edge??0)+1)})),$("click",Fe,b),x(e,O),st()}vt(["change","click","keydown","dblclick","contextmenu"]);var Jd=D('<div class="shape-container svelte-lf5wz7"><div></div></div>'),Zd=D('<div class="gradient-fill svelte-lf5wz7"></div>'),Kd=D('<div class="mini-preview svelte-lf5wz7"><button class="back-btn svelte-lf5wz7" title="Back to Gradient"><!> <span>Gradient</span></button> <div class="preview-area svelte-lf5wz7"><div class="checkerboard svelte-lf5wz7"></div> <!></div></div>');function Qd(e,t){lt(t,!0);let r=T(()=>t.gradient),o=T(()=>t.shape??"rectangle"),i=T(()=>t.onBack),l=T(()=>{var M;return((M=n(r))==null?void 0:M.type)==="squareRamp"?`url(${Cl(n(r),256,256)})`:zo(n(r),n(o))}),a=T(()=>kl(n(r))),s=T(()=>$l(n(r))),c=T(()=>n(o)!=="rectangle"),u=T(()=>n(o)==="circle"?"shape-circle":n(o)==="square"?"shape-square":n(o)==="ellipse"?"shape-ellipse":n(o)==="triangle"?"shape-triangle":""),g=U(null),h=U(0),p=U(0),_=U(0);cl(()=>{if(!n(g))return;const M=new ResizeObserver(([P])=>{const{width:Q,height:H}=P.contentRect;m(p,Q,!0),m(_,H,!0),m(h,Math.floor(Math.min(Q,H)*.85),!0)});return M.observe(n(g)),()=>M.disconnect()});let f=T(()=>n(o)==="ellipse"?Math.floor(n(p)*.85):n(h)),w=T(()=>n(o)==="ellipse"?Math.floor(n(_)*.85):n(h));var b=Kd(),y=d(b),R=d(y);ru(R,{size:12,strokeWidth:2});var q=v(y,2),z=v(d(q),2);{var N=M=>{var P=Jd(),Q=d(P);Rn(P,H=>m(g,H),()=>n(g)),se(()=>{qe(Q,1,`gradient-fill ${n(u)??""}`,"svelte-lf5wz7"),ke(Q,`background: ${n(l)??""};${n(a)?` filter: ${n(a)};`:""}${n(s)?` background-blend-mode: ${n(s)};`:""} width: ${n(f)??""}px; height: ${n(w)??""}px;`)}),x(M,P)},O=M=>{var P=Zd();se(()=>ke(P,`background: ${n(l)??""};${n(a)?` filter: ${n(a)};`:""}${n(s)?` background-blend-mode: ${n(s)};`:""}`)),x(M,P)};xe(z,M=>{n(c)?M(N):M(O,-1)})}$("click",y,function(...M){var P;(P=n(i))==null||P.apply(this,M)}),x(e,b),st()}vt(["click"]);var ev=D('<button class="note-tab-close svelte-1lt2j28" title="Close note"><!></button>'),tv=D('<button title="Double-click to rename"><span class="note-tab-label svelte-1lt2j28"> </span> <!></button>'),nv=D('<div class="notepad-editor svelte-1lt2j28"><div class="note-tabs svelte-1lt2j28"><!> <button class="note-tab-add svelte-1lt2j28" title="Add note"><!></button></div> <div class="editor-area svelte-1lt2j28" contenteditable="true" spellcheck="false"></div></div>');function rv(e,t){lt(t,!0);let r=We(t,"notes",31,()=>pt([])),o=We(t,"activeNoteIndex",15,0),i=U(null),l=U(-1);Wt(()=>{const N=o();if(n(i)&&N!==n(l)){m(l,N,!0);const O=r()[N];n(i).innerHTML=O?O.content:""}});function a(){if(!n(i)||!r()[o()])return;const N=n(i).innerHTML;r()[o()].content!==N&&(r(r()[o()].content=N,!0),t.onchange&&t.onchange(r()))}function s(){a()}function c(N){a(),o(N)}function u(){const N=`Note ${r().length+1}`;r([...r(),{name:N,content:""}]),o(r().length-1),t.onchange&&t.onchange(r())}function g(N,O){O.stopPropagation(),!(r().length<=1)&&(a(),r(r().filter((M,P)=>P!==N)),o()>=r().length?o(r().length-1):o()>N&&o(o()-1),m(l,-1),t.onchange&&t.onchange(r()))}function h(N){const O=r()[N].name,M=prompt("Rename note:",O);M&&M.trim()&&(r(r()[N].name=M.trim(),!0),r([...r()]),t.onchange&&t.onchange(r()))}function p(N){if(N.ctrlKey||N.metaKey)switch(N.key.toLowerCase()){case"b":N.preventDefault(),document.execCommand("bold");break;case"i":N.preventDefault(),document.execCommand("italic");break;case"u":N.preventDefault(),document.execCommand("underline");break}N.key==="Tab"&&(N.preventDefault(),document.execCommand("insertText",!1,"    "))}function _(){return n(i)}var f={getEditorElement:_},w=nv(),b=d(w),y=d(b);it(y,17,r,ht,(N,O,M)=>{var P=tv();let Q;var H=d(P),A=d(H),K=v(H,2);{var pe=de=>{var L=ev(),G=d(L);Eo(G,{size:10}),$("click",L,j=>g(M,j)),x(de,L)};xe(K,de=>{r().length>1&&de(pe)})}se(()=>{Q=qe(P,1,"note-tab svelte-1lt2j28",null,Q,{active:M===o()}),Be(A,n(O).name)}),$("click",P,()=>c(M)),$("dblclick",P,()=>h(M)),x(N,P)});var R=v(y,2),q=d(R);Mo(q,{size:12});var z=v(b,2);return Rn(z,N=>m(i,N),()=>n(i)),$("click",R,u),$("input",z,s),$("keydown",z,p),x(e,w),st(f)}vt(["click","dblclick","input","keydown"]);var ov=D("<option> </option>"),iv=D("<option> </option>"),av=D('<div class="notepad-settings svelte-1aixn3k"><div class="section svelte-1aixn3k"><div class="section-label svelte-1aixn3k">Font</div> <select class="combo svelte-1aixn3k"></select></div> <div class="section svelte-1aixn3k"><div class="section-label svelte-1aixn3k">Size</div> <div class="input-row svelte-1aixn3k"><select class="combo size-combo svelte-1aixn3k"></select> <input type="number" class="size-input svelte-1aixn3k" min="6" max="72"/></div></div> <div class="section svelte-1aixn3k"><div class="section-label svelte-1aixn3k">Format</div> <div class="toolbar-row svelte-1aixn3k"><button class="tool-btn svelte-1aixn3k" title="Bold (Ctrl+B)"><!></button> <button class="tool-btn svelte-1aixn3k" title="Italic (Ctrl+I)"><!></button> <button class="tool-btn svelte-1aixn3k" title="Underline (Ctrl+U)"><!></button> <button class="tool-btn svelte-1aixn3k" title="Strikethrough"><!></button> <button class="tool-btn svelte-1aixn3k" title="Clear formatting"><!></button></div></div> <div class="section svelte-1aixn3k"><div class="section-label svelte-1aixn3k">Align</div> <div class="toolbar-row svelte-1aixn3k"><button class="tool-btn svelte-1aixn3k" title="Align left"><!></button> <button class="tool-btn svelte-1aixn3k" title="Align center"><!></button> <button class="tool-btn svelte-1aixn3k" title="Align right"><!></button></div></div> <div class="section svelte-1aixn3k"><div class="section-label svelte-1aixn3k">Lists</div> <div class="toolbar-row svelte-1aixn3k"><button class="tool-btn svelte-1aixn3k" title="Bullet list"><!></button> <button class="tool-btn svelte-1aixn3k" title="Numbered list"><!></button></div></div> <div class="section svelte-1aixn3k"><div class="section-label svelte-1aixn3k">Text Color</div> <button class="pick-color-btn svelte-1aixn3k"><!> Pick from Colors</button></div></div>');function lv(e,t){lt(t,!0);let r=U("Consolas"),o=U(12);const i=["Arial","Verdana","Helvetica","Tahoma","Georgia","Times New Roman","Courier New","Consolas","Lucida Console","Segoe UI","Trebuchet MS","Impact"],l=[8,9,10,11,12,14,16,18,20,24,28,32,36,48],a={8:1,9:1,10:2,11:2,12:3,14:3,16:4,18:4,20:5,24:5,28:6,32:6,36:7,48:7};function s(){var Ne;const me=(Ne=t.getEditorElement)==null?void 0:Ne.call(t);me&&me.focus()}function c(me,Ne=null){s(),document.execCommand(me,!1,Ne)}function u(){c("fontName",n(r))}function g(){var I;const me=a[n(o)]??3;c("fontSize",String(me));const Ne=(I=t.getEditorElement)==null?void 0:I.call(t);if(Ne){const le=Ne.querySelectorAll(`font[size="${me}"]`);for(const F of le)F.removeAttribute("size"),F.style.fontSize=`${n(o)}px`}}function h(me){me.key==="Enter"&&(me.target.blur(),g())}function p(me){me.target.select()}var _=av(),f=d(_),w=v(d(f),2);it(w,21,()=>i,ht,(me,Ne)=>{var I=ov(),le=d(I),F={};se(()=>{ke(I,`font-family: '${n(Ne)??""}'`),Be(le,n(Ne)),F!==(F=n(Ne))&&(I.value=(I.__value=n(Ne))??"")}),x(me,I)});var b=v(f,2),y=v(d(b),2),R=d(y);it(R,21,()=>l,ht,(me,Ne)=>{var I=iv(),le=d(I),F={};se(()=>{Be(le,`${n(Ne)??""}px`),F!==(F=n(Ne))&&(I.value=(I.__value=n(Ne))??"")}),x(me,I)});var q=v(R,2),z=v(b,2),N=v(d(z),2),O=d(N),M=d(O);iu(M,{size:13});var P=v(O,2),Q=d(P);pu(Q,{size:13});var H=v(P,2),A=d(H);qu(A,{size:13});var K=v(H,2),pe=d(K);Pu(pe,{size:13});var de=v(K,2),L=d(de);Cu(L,{size:13});var G=v(z,2),j=v(d(G),2),W=d(j),te=d(W);Fu(te,{size:13});var ve=v(W,2),ye=d(ve);Au(ye,{size:13});var V=v(ve,2),ie=d(V);Iu(ie,{size:13});var _e=v(G,2),Ee=v(d(_e),2),Le=d(Ee),at=d(Le);wu(at,{size:13});var je=v(Le,2),Xe=d(je);bu(Xe,{size:13});var ze=v(_e,2),Ae=v(d(ze),2),Ze=d(Ae);_l(Ze,{size:13}),$("change",w,u),xr(w,()=>n(r),me=>m(r,me)),$("change",R,g),xr(R,()=>n(o),me=>m(o,me)),zt("focus",q,p),$("keydown",q,h),$("change",q,g),Ei(q,()=>n(o),me=>m(o,me)),$("click",O,()=>c("bold")),$("click",P,()=>c("italic")),$("click",H,()=>c("underline")),$("click",K,()=>c("strikeThrough")),$("click",de,()=>c("removeFormat")),$("click",W,()=>c("justifyLeft")),$("click",ve,()=>c("justifyCenter")),$("click",V,()=>c("justifyRight")),$("click",Le,()=>c("insertUnorderedList")),$("click",je,()=>c("insertOrderedList")),$("click",Ae,function(...me){var Ne;(Ne=t.onPickColor)==null||Ne.apply(this,me)}),x(e,_),st()}vt(["change","keydown","click"]);var sv=D('<button title="Double-click to rename"><span class="image-tab-label svelte-1tkdscr"> </span> <span class="image-tab-close svelte-1tkdscr" role="button" tabindex="-1" title="Close image"><!></span></button>'),cv=D('<img class="viewer-image svelte-1tkdscr" draggable="false"/>'),uv=D('<div class="empty-message svelte-1tkdscr">Click + to load an image</div>'),dv=D('<div class="viewer-editor svelte-1tkdscr"><div class="image-tabs svelte-1tkdscr"><!> <button class="image-tab-add svelte-1tkdscr" title="Load image"><!></button></div> <div><!></div></div>');function vv(e,t){lt(t,!0);let r=We(t,"images",31,()=>pt([])),o=We(t,"activeImageIndex",15,0),i=U(null),l=U(0),a=U(0);Wt(()=>{if(!n(i))return;const I=new ResizeObserver(le=>{for(const F of le)m(l,F.contentRect.width,!0),m(a,F.contentRect.height,!0)});return I.observe(n(i)),()=>I.disconnect()});let s=U(pt(new Map));function c(I){return n(s).has(I)||n(s).set(I,{zoom:100,panX:0,panY:0}),n(s).get(I)}let u=T(()=>(()=>{const I=c(o());return{zoom:I.zoom,panX:I.panX,panY:I.panY}})()),g=U(!1);function h(I){m(g,I,!0),I&&b(),!I&&t.onColorHover&&t.onColorHover(null)}function p(){return n(g)}let _=null,f=null,w=null;function b(){const I=r()[o()];if(!I||!I.dataUrl||w===I.dataUrl)return;_=document.createElement("canvas"),_.width=I.naturalWidth,_.height=I.naturalHeight,f=_.getContext("2d",{willReadFrequently:!0});const le=new Image;le.onload=()=>{f.drawImage(le,0,0),w=I.dataUrl},le.src=I.dataUrl}function y(I){const le=r()[o()];if(!le||!n(i))return null;const F=n(i).getBoundingClientRect(),E=c(o()),Y=E.zoom/100,S=F.width/2,X=F.height/2,ne=I.clientX-F.left,J=I.clientY-F.top,ae=(ne-S-E.panX)/Y+le.naturalWidth/2,fe=(J-X-E.panY)/Y+le.naturalHeight/2;return ae<0||fe<0||ae>=le.naturalWidth||fe>=le.naturalHeight?null:{x:Math.floor(ae),y:Math.floor(fe)}}function R(I,le){var E;if(!f||w!==((E=r()[o()])==null?void 0:E.dataUrl))return null;const F=f.getImageData(I,le,1,1).data;return((1<<24)+(F[0]<<16)+(F[1]<<8)+F[2]).toString(16).slice(1).toUpperCase()}function q(I){const le=y(I);if(!le)return;const F=R(le.x,le.y);F&&t.onColorPicked&&t.onColorPicked(F),m(g,!1),t.onColorHover&&t.onColorHover(null)}function z(I){if(!n(g))return;const le=y(I);if(!le){t.onColorHover&&t.onColorHover(null);return}const F=R(le.x,le.y);t.onColorHover&&t.onColorHover(F)}let N=U(!1),O=U(0),M=U(0),P=U(0),Q=U(0);function H(I){o(I)}function A(){const I=document.createElement("input");I.type="file",I.accept="image/*",I.onchange=le=>{const F=le.target.files[0];if(!F)return;const E=new FileReader;E.onload=()=>{const Y={name:F.name,dataUrl:E.result,naturalWidth:0,naturalHeight:0},S=new Image;S.onload=()=>{Y.naturalWidth=S.naturalWidth,Y.naturalHeight=S.naturalHeight,r([...r(),Y]),o(r().length-1),te(o()),t.onchange&&t.onchange(r())},S.src=E.result},E.readAsDataURL(F)},I.click()}function K(I,le){le.stopPropagation(),!(r().length<=0)&&(r(r().filter((F,E)=>E!==I)),n(s).delete(I),r().length===0?o(0):o()>=r().length?o(r().length-1):o()>I&&o(o()-1),t.onchange&&t.onchange(r()))}function pe(I){const le=r()[I].name,F=prompt("Rename image:",le);F&&F.trim()&&(r(r()[I].name=F.trim(),!0),r([...r()]),t.onchange&&t.onchange(r()))}function de(){const I=c(o());I.zoom=Math.min(I.zoom+10,1600),m(s,new Map(n(s)),!0)}function L(){const I=c(o());I.zoom=Math.max(I.zoom-10,10),m(s,new Map(n(s)),!0)}function G(I){const le=c(o());le.zoom=Math.max(10,Math.min(1600,I)),m(s,new Map(n(s)),!0)}function j(){return c(o()).zoom}function W(){const I=c(o());I.zoom=100,I.panX=0,I.panY=0,m(s,new Map(n(s)),!0)}function te(I){const le=I??o(),F=r()[le];if(!F||!F.naturalWidth||!n(l)||!n(a))return;const E=n(l)/F.naturalWidth,Y=n(a)/F.naturalHeight,S=Math.min(E,Y,1)*100,X=c(le);X.zoom=Math.round(S),X.panX=0,X.panY=0,m(s,new Map(n(s)),!0)}function ve(I){if(I.button!==0)return;if(n(g)){I.preventDefault(),q(I);return}const le=c(o());m(N,!0),m(O,I.clientX,!0),m(M,I.clientY,!0),m(P,le.panX,!0),m(Q,le.panY,!0),I.preventDefault()}function ye(I){if(!n(N))return;const le=c(o());le.panX=n(P)+(I.clientX-n(O)),le.panY=n(Q)+(I.clientY-n(M)),m(s,new Map(n(s)),!0)}function V(){m(N,!1)}function ie(I){I.preventDefault();const le=c(o()),F=I.deltaY>0?-10:10;le.zoom=Math.max(10,Math.min(1600,le.zoom+F)),m(s,new Map(n(s)),!0)}var _e={setEyedropper:h,isEyedropper:p,zoomIn:de,zoomOut:L,setZoom:G,getZoom:j,zoom100:W,fitToSection:te},Ee=dv();zt("mousemove",gr,ye),zt("mouseup",gr,V);var Le=d(Ee),at=d(Le);it(at,17,r,ht,(I,le,F)=>{var E=sv();let Y;var S=d(E),X=d(S),ne=v(S,2),J=d(ne);Eo(J,{size:10}),se(()=>{Y=qe(E,1,"image-tab svelte-1tkdscr",null,Y,{active:F===o()}),Be(X,n(le).name)}),$("click",E,()=>H(F)),$("dblclick",E,()=>pe(F)),$("click",ne,ae=>K(F,ae)),x(I,E)});var je=v(at,2),Xe=d(je);Mo(Xe,{size:12});var ze=v(Le,2);let Ae;var Ze=d(ze);{var me=I=>{var le=cv();se(()=>{Ve(le,"src",r()[o()].dataUrl),Ve(le,"alt",r()[o()].name),ke(le,`
          transform: translate(${n(u).panX??""}px, ${n(u).panY??""}px) scale(${n(u).zoom/100});
          transform-origin: center center;
        `)}),x(I,le)},Ne=I=>{var le=uv();x(I,le)};xe(Ze,I=>{r().length>0&&r()[o()]?I(me):I(Ne,-1)})}return Rn(ze,I=>m(i,I),()=>n(i)),se(()=>Ae=qe(ze,1,"viewer-canvas svelte-1tkdscr",null,Ae,{dragging:n(N),eyedropper:n(g)})),$("click",je,A),$("mousedown",ze,ve),$("mousemove",ze,z),zt("wheel",ze,ie),x(e,Ee),st(_e)}vt(["click","dblclick","mousedown","mousemove"]);var fv=D('<div class="section color-preview-section svelte-12jhwcb"><div class="section-label svelte-12jhwcb">Preview</div> <div class="color-preview-row svelte-12jhwcb"><div class="color-preview-swatch svelte-12jhwcb"></div> <span class="color-preview-hex svelte-12jhwcb"> </span></div></div>'),pv=D('<div class="viewer-settings svelte-12jhwcb"><div class="section svelte-12jhwcb"><div class="section-label svelte-12jhwcb">Actions</div> <button class="action-btn svelte-12jhwcb"><!> Load Image</button> <button><!> Eyedropper</button></div> <!> <div class="section svelte-12jhwcb"><div class="section-label svelte-12jhwcb">Zoom</div> <div class="zoom-display svelte-12jhwcb"><input type="number" class="zoom-input svelte-12jhwcb" min="10" max="1600"/> <span class="zoom-pct svelte-12jhwcb">%</span></div> <div class="toolbar-row svelte-12jhwcb"><button class="tool-btn svelte-12jhwcb" title="Zoom Out"><!></button> <button class="tool-btn svelte-12jhwcb" title="Zoom In"><!></button> <button class="tool-btn svelte-12jhwcb" title="100%"><!></button> <button class="tool-btn svelte-12jhwcb" title="Fit to View"><!></button></div></div> <div class="status-area svelte-12jhwcb"><input type="text" class="status-box svelte-12jhwcb" readonly=""/></div></div>');function hv(e,t){lt(t,!0);let r=We(t,"statusMessage",3,""),o=We(t,"hoverColor",3,null),i=U(100);Wt(()=>{const V=setInterval(()=>{var _e,Ee;const ie=(_e=t.getViewerRef)==null?void 0:_e.call(t);ie&&m(i,((Ee=ie.getZoom)==null?void 0:Ee.call(ie))??100,!0)},100);return()=>clearInterval(V)});function l(){var V,ie,_e;(_e=(ie=(V=t.getViewerRef)==null?void 0:V.call(t))==null?void 0:ie.zoomIn)==null||_e.call(ie)}function a(){var V,ie,_e;(_e=(ie=(V=t.getViewerRef)==null?void 0:V.call(t))==null?void 0:ie.zoomOut)==null||_e.call(ie)}function s(){var V,ie,_e;(_e=(ie=(V=t.getViewerRef)==null?void 0:V.call(t))==null?void 0:ie.zoom100)==null||_e.call(ie)}function c(){var V,ie,_e;(_e=(ie=(V=t.getViewerRef)==null?void 0:V.call(t))==null?void 0:ie.fitToSection)==null||_e.call(ie)}function u(){var V,ie,_e,Ee;((_e=(ie=(V=t.getViewerRef)==null?void 0:V.call(t))==null?void 0:ie.addImage)==null?void 0:_e.call(ie))??((Ee=document.querySelector(".image-tab-add"))==null||Ee.click())}function g(){var _e,Ee,Le;const V=(_e=t.getViewerRef)==null?void 0:_e.call(t);if(!V)return;const ie=((Ee=V.isEyedropper)==null?void 0:Ee.call(V))??!1;(Le=V.setEyedropper)==null||Le.call(V,!ie)}let h=T(()=>(()=>{var V,ie,_e;return n(i),((_e=(ie=(V=t.getViewerRef)==null?void 0:V.call(t))==null?void 0:ie.isEyedropper)==null?void 0:_e.call(ie))??!1})());function p(V){var _e,Ee,Le;const ie=parseInt(V.target.value,10);isNaN(ie)||(Le=(Ee=(_e=t.getViewerRef)==null?void 0:_e.call(t))==null?void 0:Ee.setZoom)==null||Le.call(Ee,ie)}function _(V){V.key==="Enter"&&(V.target.blur(),p(V))}function f(V){V.target.select()}var w=pv(),b=d(w),y=v(d(b),2),R=d(y);vu(R,{size:13});var q=v(y,2);let z;var N=d(q);_l(N,{size:13});var O=v(b,2);{var M=V=>{var ie=fv(),_e=v(d(ie),2),Ee=d(_e),Le=v(Ee,2),at=d(Le);se(()=>{ke(Ee,`background: #${o()??""}`),Be(at,`#${o()??""}`)}),x(V,ie)};xe(O,V=>{o()&&V(M)})}var P=v(O,2),Q=v(d(P),2),H=d(Q),A=v(Q,2),K=d(A),pe=d(K);Du(pe,{size:13});var de=v(K,2),L=d(de);xl(L,{size:13});var G=v(de,2),j=d(G);bl(j,{size:13});var W=v(G,2),te=d(W);hl(te,{size:13});var ve=v(P,2),ye=d(ve);se(()=>{z=qe(q,1,"action-btn eyedropper-btn svelte-12jhwcb",null,z,{active:n(h)}),Et(H,n(i)),Et(ye,r())}),$("click",y,u),$("click",q,g),zt("focus",H,f),$("keydown",H,_),$("change",H,p),$("click",K,a),$("click",de,l),$("click",G,s),$("click",W,c),x(e,w),st()}vt(["click","keydown","change"]);const na=2e3,Pi=er([]);let gv=1;function _v(){const e=new Date;return String(e.getHours()).padStart(2,"0")+":"+String(e.getMinutes()).padStart(2,"0")+":"+String(e.getSeconds()).padStart(2,"0")+"."+String(e.getMilliseconds()).padStart(3,"0")}function Fr(e,t,r){const o=r.map(i=>typeof i=="string"?i:JSON.stringify(i,null,2)??String(i)).join(" ");Pi.update(i=>{const l=[...i,{id:gv++,timestamp:_v(),level:e,source:t,message:o}];return l.length>na?l.slice(l.length-na):l})}function Do(){Pi.set([])}const mv=console.log,bv=console.warn,wv=console.error,yv=console.info,xv=console.debug;console.log=(...e)=>{mv(...e),Fr("log","js",e)};console.warn=(...e)=>{bv(...e),Fr("warn","js",e)};console.error=(...e)=>{wv(...e),Fr("error","js",e)};console.info=(...e)=>{yv(...e),Fr("info","js",e)};console.debug=(...e)=>{xv(...e),Fr("debug","js",e)};function $v(){gn()&&window.__JUCE__.backend.addEventListener("debugLog",e=>{const t=e.level||"log",r=e.message||JSON.stringify(e);Fr(t,"c++",[r])})}var kv=D("<option> </option>"),Cv=D('<div><span class="log-time svelte-1mot0gd"> </span> <span> </span> <span class="log-level svelte-1mot0gd"> </span> <span class="log-msg svelte-1mot0gd"> </span></div>'),Sv=D('<div class="empty-msg svelte-1mot0gd">No console output</div>'),Mv=D('<div class="console-panel svelte-1mot0gd"><div class="console-toolbar svelte-1mot0gd"><button class="tool-btn svelte-1mot0gd" title="Clear console"><!></button> <div class="toolbar-separator svelte-1mot0gd"></div> <select class="level-filter svelte-1mot0gd"></select> <div class="filter-box svelte-1mot0gd"><!> <input type="text" class="filter-input svelte-1mot0gd" placeholder="Filter..."/></div> <div class="toolbar-spacer svelte-1mot0gd"></div> <span class="entry-count svelte-1mot0gd"> </span> <button title="Scroll to bottom"><!></button></div> <div class="console-log svelte-1mot0gd"><!> <!></div></div>');function Ev(e,t){lt(t,!0);const r=()=>wt(Pi,"$consoleEntries",o),[o,i]=tr();let l=U(null),a=U(!0),s=U(""),c=U("all");const u=["all","log","info","debug","warn","error"];let g=T(()=>(()=>{let j=r();if(n(c)!=="all"&&(j=j.filter(W=>W.level===n(c))),n(s)){const W=n(s).toLowerCase();j=j.filter(te=>te.message.toLowerCase().includes(W)||te.source.toLowerCase().includes(W))}return j})());Wt(()=>{n(g).length,n(a)&&n(l)&&requestAnimationFrame(()=>{n(l).scrollTop=n(l).scrollHeight})});function h(){if(!n(l))return;const{scrollTop:j,scrollHeight:W,clientHeight:te}=n(l);m(a,W-j-te<24)}function p(){m(a,!0),n(l)&&(n(l).scrollTop=n(l).scrollHeight)}function _(j){j.target.select()}function f(j){return j==="error"?"lvl-error":j==="warn"?"lvl-warn":j==="info"?"lvl-info":j==="debug"?"lvl-debug":"lvl-log"}function w(j){return j==="c++"?"C++":j==="js"?"JS":"APP"}var b=Mv(),y=d(b),R=d(y),q=d(R);Ru(q,{size:12});var z=v(R,4);it(z,21,()=>u,ht,(j,W)=>{var te=kv(),ve=d(te),ye={};se(V=>{Be(ve,V),ye!==(ye=n(W))&&(te.value=(te.__value=n(W))??"")},[()=>n(W)==="all"?"All Levels":n(W).charAt(0).toUpperCase()+n(W).slice(1)]),x(j,te)});var N=v(z,2),O=d(N);du(O,{size:10});var M=v(O,2),P=v(N,4),Q=d(P),H=v(P,2);let A;var K=d(H);nu(K,{size:12});var pe=v(y,2),de=d(pe);it(de,17,()=>n(g),j=>j.id,(j,W)=>{var te=Cv(),ve=d(te),ye=d(ve),V=v(ve,2),ie=d(V),_e=v(V,2),Ee=d(_e),Le=v(_e,2),at=d(Le);se((je,Xe,ze)=>{qe(te,1,`log-entry ${je??""}`,"svelte-1mot0gd"),Be(ye,n(W).timestamp),qe(V,1,`log-source ${n(W).source??""}`,"svelte-1mot0gd"),Be(ie,Xe),Be(Ee,ze),Be(at,n(W).message)},[()=>f(n(W).level),()=>w(n(W).source),()=>n(W).level.toUpperCase().padEnd(5)]),x(j,te)});var L=v(de,2);{var G=j=>{var W=Sv();x(j,W)};xe(L,j=>{n(g).length===0&&j(G)})}Rn(pe,j=>m(l,j),()=>n(l)),se(()=>{Be(Q,n(g).length),A=qe(H,1,"tool-btn svelte-1mot0gd",null,A,{active:n(a)})}),$("click",R,function(...j){Do==null||Do.apply(this,j)}),xr(z,()=>n(c),j=>m(c,j)),zt("focus",M,_),Ei(M,()=>n(s),j=>m(s,j)),$("click",H,p),zt("scroll",pe,h),x(e,b),st(),i()}vt(["click"]);const No=er(null);function Sl(e,t){const r=(t||"333333").replace(/^#/,"");let o,i;return r.length===8?(i=parseInt(r.slice(0,2),16)/255,o=r.slice(2,8)):(i=1,o=r.slice(0,6)),No.set({...e,_initialColor:o,_initialAlpha:i}),{color:o,alpha:i}}function zv(e){const t=Ut(No);if(t)if(t.type==="panel"){const r=Ut(jt);if(r==null)return;t.prop==="gridColour"?Kt(r,{[t.prop]:e,modified:!0}):Kt(r,{[t.prop]:e.slice(2,8),modified:!0})}else t.type==="control"&&Lt(t.controlId,t.path,e)}function Nv(){No.set(null)}var Pv=D("<button> </button>"),Tv=D('<div class="gradient-mini svelte-12apuct"><!></div>'),Iv=D('<div class="notepad-color-mini svelte-12apuct"><div class="notepad-color-preview svelte-12apuct"></div> <div class="notepad-color-hex svelte-12apuct"> </div> <button class="notepad-color-back svelte-12apuct">Back to Notepad</button></div>'),Av=D("<button></button>"),Fv=D("<button></button>"),jv=D("<button></button>"),Rv=D('<div class="notepad-layout svelte-12apuct"><div class="notepad-editor-area svelte-12apuct"><!></div> <div class="notepad-sidebar svelte-12apuct"><div class="sidebar-settings svelte-12apuct"><!></div> <div class="sidebar-swatches svelte-12apuct"><div class="swatches-label svelte-12apuct">Colors</div> <div class="swatches-grid svelte-12apuct"></div></div></div></div>'),Ov=D('<div class="placeholder svelte-12apuct">Open or create a panel to use the Notepad</div>'),qv=D('<div class="viewer-layout svelte-12apuct"><div class="viewer-canvas-area svelte-12apuct"><!></div> <div class="viewer-sidebar svelte-12apuct"><div class="sidebar-settings svelte-12apuct"><!></div></div></div>'),Lv=D('<div class="placeholder svelte-12apuct">Open or create a panel to use the Viewer</div>'),Dv=D('<div class="display-panel svelte-12apuct"><div class="tab-bar svelte-12apuct"></div> <div class="tab-content svelte-12apuct"><div class="tab-pane svelte-12apuct"><div class="colors-layout svelte-12apuct"><div><!></div> <!> <!> <div class="colors-sidebar svelte-12apuct"><div class="sidebar-settings svelte-12apuct"><!></div> <div class="sidebar-swatches svelte-12apuct"><div class="swatches-label svelte-12apuct">Colors</div> <div class="swatches-grid svelte-12apuct"></div></div></div></div></div> <div class="tab-pane svelte-12apuct"><div class="gradient-layout svelte-12apuct"><div class="gradient-preview svelte-12apuct"><!></div> <div class="gradient-sidebar svelte-12apuct"><div class="sidebar-settings svelte-12apuct"><!></div> <div class="sidebar-swatches svelte-12apuct"><div class="swatches-label svelte-12apuct">Colors</div> <div class="swatches-grid svelte-12apuct"></div></div></div></div></div> <div class="tab-pane svelte-12apuct"><!></div> <div class="tab-pane svelte-12apuct"><!></div> <div class="tab-pane svelte-12apuct"><div class="placeholder svelte-12apuct">Tools</div></div> <div class="tab-pane svelte-12apuct"><!></div></div></div>');function Hv(e,t){var Ye;lt(t,!0);const r=()=>wt(zi,"$activePanel",i),o=()=>wt(No,"$colorTarget",i),[i,l]=tr();let a=T(()=>t.onTabChange),s=U("colors"),c=U(pt(((Ye=r())==null?void 0:Ye.bgColour)??"333333")),u=U(1);Wt(()=>{const k=o();k&&k._initialColor&&(m(s,"colors"),m(c,k._initialColor,!0),m(u,k._initialAlpha??1,!0))});let g=U(10),h=pt(Array(24).fill(null)),p=U(0),_=U("rectangle"),f=pt(Array(24).fill(null));const w={type:"linear",angle:90,centerX:50,centerY:50,radiusX:50,radiusY:50,edge:0,stops:[{color:"FF0000",position:0},{color:"0000FF",position:100}]};let b=U(pt(JSON.parse(JSON.stringify(w)))),y=U(pt([{name:"Note 1",content:""}])),R=U(0),q=U(null),z=U(pt([])),N=U(0),O=U(null),M=U(""),P=U(null),Q=U(null);Wt(()=>{const k=r();if(k&&k.id!==n(Q)){m(Q,k.id,!0),m(b,k.bgGradient?JSON.parse(JSON.stringify(k.bgGradient)):JSON.parse(JSON.stringify(w)),!0);const B=k.notepad;B?(m(y,JSON.parse(JSON.stringify(B.notes)),!0),m(R,B.activeNoteIndex??0,!0)):(m(y,[{name:"Note 1",content:""}],!0),m(R,0));const Ce=k.viewer;Ce?(m(z,JSON.parse(JSON.stringify(Ce.images)),!0),m(N,Ce.activeImageIndex??0,!0)):(m(z,[],!0),m(N,0))}});let H=U(null),A=U(!1),K=U(null),pe=U("DDDDDD"),de=T(()=>(()=>{if(n(H)===null)return n(b);const k=n(b).stops.map((B,Ce)=>Ce===n(H)?{...B,color:n(c)}:B);return{...n(b),stops:k}})());function L(k){if(k.length>=8?(m(u,parseInt(k.slice(0,2),16)/255),m(c,k.slice(2,8),!0)):(m(u,1),m(c,k.slice(0,6),!0)),n(H)===null){if(!n(A))if(o())zv(k);else{const B=r();B&&Kt(B.id,{bgColour:n(c),modified:!0})}}}function G(k){m(y,k,!0);const B=r();B&&Kt(B.id,{notepad:{notes:JSON.parse(JSON.stringify(k)),activeNoteIndex:n(R)},modified:!0})}function j(k){m(z,k,!0);const B=r();B&&Kt(B.id,{viewer:{images:JSON.parse(JSON.stringify(k)),activeImageIndex:n(N)},modified:!0})}function W(k){const B=h.findIndex(Ce=>Ce===null);B!==-1?(h[B]=k,m(M,`#${k} saved to swatch ${B+1}`)):m(M,`#${k} — no empty swatch (double-click one to clear)`)}function te(k){m(b,k,!0);const B=r();B&&Kt(B.id,{bgGradient:k,modified:!0})}function ve(k){n(b).stops[k]&&(m(H,k,!0),m(c,n(b).stops[k].color,!0),m(u,1),m(s,"colors"))}function ye(){if(n(H)===null)return;const k=n(b).stops.map((Ce,Oe)=>Oe===n(H)?{...Ce,color:n(c)}:Ce);m(b,{...n(b),stops:k},!0);const B=r();B&&Kt(B.id,{bgGradient:n(b),modified:!0})}function V(){ye();const k=r();k&&(m(c,k.bgColour,!0),m(u,1)),m(H,null),m(s,"gradient"),n(a)&&n(a)("gradient")}function ie(){const k=window.getSelection();k&&k.rangeCount>0&&m(K,k.getRangeAt(0).cloneRange(),!0),m(A,!0),m(s,"colors"),n(a)&&n(a)("colors")}function _e(){const k=n(c);m(pe,k,!0);const B=n(K);m(K,null);const Ce=r();Ce&&(m(c,Ce.bgColour,!0),m(u,1)),m(A,!1),m(s,"notepad"),n(a)&&n(a)("notepad"),requestAnimationFrame(()=>{var _t,qt;const Oe=(qt=(_t=n(q))==null?void 0:_t.getEditorElement)==null?void 0:qt.call(_t);if(Oe&&B){Oe.focus();const br=window.getSelection();br.removeAllRanges(),br.addRange(B),document.execCommand("foreColor",!1,"#"+k)}})}function Ee(k){if(n(H)!==null&&k!=="colors"){ye(),m(H,null);const B=r();B&&(m(c,B.bgColour,!0),m(u,1))}if(n(A)&&k!=="colors"){m(K,null),m(A,!1);const B=r();B&&(m(c,B.bgColour,!0),m(u,1))}if(o()&&k!=="colors"){Nv();const B=r();B&&(m(c,B.bgColour,!0),m(u,1))}m(s,k,!0),n(a)&&n(a)(k)}function Le(k){h[k]?L("FF"+h[k]):h[k]=n(c)}function at(k){h[k]=null}function je(k,B){B.preventDefault(),h[k]=n(c)}function Xe(k){const B=n(b),Ce=r();if(h[k]){if(Ce){const Oe=B.stops.map((_t,qt)=>qt===n(p)?{..._t,color:h[k]}:_t);Kt(Ce.id,{bgGradient:{...B,stops:Oe},modified:!0})}}else B.stops[n(p)]&&(h[k]=B.stops[n(p)].color)}function ze(k){var B,Ce;if(h[k]){m(pe,h[k],!0);const Oe=(Ce=(B=n(q))==null?void 0:B.getEditorElement)==null?void 0:Ce.call(B);Oe&&(Oe.focus(),document.execCommand("foreColor",!1,"#"+h[k]))}else h[k]=n(pe)}function Ae(k){f[k]?(m(b,JSON.parse(JSON.stringify(f[k])),!0),te(n(b))):f[k]=JSON.parse(JSON.stringify(n(b)))}function Ze(k){f[k]=null}function me(k,B){B.preventDefault(),f[k]=JSON.parse(JSON.stringify(n(b)))}const Ne=[{id:"colors",label:"Colors"},{id:"gradient",label:"Gradient"},{id:"notepad",label:"Notepad"},{id:"viewer",label:"Viewer"},{id:"tools",label:"Tools"},{id:"console",label:"Console"}];var I=Dv(),le=d(I);it(le,21,()=>Ne,ht,(k,B)=>{var Ce=Pv();let Oe;var _t=d(Ce);se(()=>{Oe=qe(Ce,1,"tab svelte-12apuct",null,Oe,{active:n(s)===n(B).id}),Be(_t,n(B).label)}),$("click",Ce,()=>Ee(n(B).id)),x(k,Ce)});var F=v(le,2),E=d(F);let Y;var S=d(E),X=d(S);let ne;var J=d(X);bd(J,{get color(){return n(c)},get alpha(){return n(u)},get stepSize(){return n(g)},onchange:L});var ae=v(X,2);{var fe=k=>{var B=Tv(),Ce=d(B);Qd(Ce,{get gradient(){return n(de)},get shape(){return n(_)},onBack:V}),x(k,B)};xe(ae,k=>{n(H)!==null&&n(b)&&k(fe)})}var Pe=v(ae,2);{var et=k=>{var B=Iv(),Ce=d(B),Oe=v(Ce,2),_t=d(Oe),qt=v(Oe,2);se(()=>{ke(Ce,`background: #${n(c)??""}`),Be(_t,`#${n(c)??""}`)}),$("click",qt,_e),x(k,B)};xe(Pe,k=>{n(A)&&k(et)})}var Te=v(Pe,2),nt=d(Te),tt=d(nt);Cd(tt,{get color(){return n(c)},get alpha(){return n(u)},onApplyColor:L,get stepSize(){return n(g)},set stepSize(k){m(g,k,!0)}});var $e=v(nt,2),Fe=v(d($e),2);it(Fe,21,()=>h,ht,(k,B,Ce)=>{var Oe=Av();let _t;se(()=>{_t=qe(Oe,1,"swatch svelte-12apuct",null,_t,{empty:!n(B)}),ke(Oe,n(B)?`background: #${n(B)}`:""),Ve(Oe,"title",n(B)?`#${n(B)} — right-click to replace, double-click to clear`:"Click to store current color")}),$("click",Oe,()=>Le(Ce)),$("dblclick",Oe,()=>at(Ce)),$("contextmenu",Oe,qt=>je(Ce,qt)),x(k,Oe)});var rt=v(E,2);let Je;var Re=d(rt),ce=d(Re),Ie=d(ce);Od(Ie,{get gradient(){return n(b)},get selectedStop(){return n(p)},get shape(){return n(_)},onchange:te,onSelectStop:k=>m(p,k,!0)});var ct=v(ce,2),ot=d(ct),xt=d(ot);Vd(xt,{get gradient(){return n(b)},get selectedStop(){return n(p)},get shape(){return n(_)},onchange:te,onSelectStop:k=>m(p,k,!0),onEditStopColor:ve,onShapeChange:k=>m(_,k,!0),get gradientSwatches(){return f},onGradientPresetClick:Ae,onGradientPresetDblClick:Ze,onGradientPresetRightClick:me});var $t=v(ot,2),ut=v(d($t),2);it(ut,21,()=>h,ht,(k,B,Ce)=>{var Oe=Fv();let _t;se(()=>{_t=qe(Oe,1,"swatch svelte-12apuct",null,_t,{empty:!n(B)}),ke(Oe,n(B)?`background: #${n(B)}`:""),Ve(Oe,"title",n(B)?`#${n(B)} — click to assign to selected stop`:"Click to store stop color")}),$("click",Oe,()=>Xe(Ce)),$("dblclick",Oe,()=>at(Ce)),$("contextmenu",Oe,qt=>je(Ce,qt)),x(k,Oe)});var Tt=v(rt,2);let dt;var bt=d(Tt);{var Dt=k=>{var B=Rv(),Ce=d(B),Oe=d(Ce);Rn(rv(Oe,{onchange:G,get notes(){return n(y)},set notes(en){m(y,en,!0)},get activeNoteIndex(){return n(R)},set activeNoteIndex(en){m(R,en,!0)}}),en=>m(q,en,!0),()=>n(q));var _t=v(Ce,2),qt=d(_t),br=d(qt);lv(br,{getEditorElement:()=>{var en,Dn;return(Dn=(en=n(q))==null?void 0:en.getEditorElement)==null?void 0:Dn.call(en)},onPickColor:ie});var En=v(qt,2),Ml=v(d(En),2);it(Ml,21,()=>h,ht,(en,Dn,Po)=>{var nr=jv();let Ti;se(()=>{Ti=qe(nr,1,"swatch svelte-12apuct",null,Ti,{empty:!n(Dn)}),ke(nr,n(Dn)?`background: #${n(Dn)}`:""),Ve(nr,"title",n(Dn)?`#${n(Dn)} — click to apply as text color`:"Click to store current color")}),$("click",nr,()=>ze(Po)),$("dblclick",nr,()=>at(Po)),$("contextmenu",nr,El=>je(Po,El)),x(en,nr)}),x(k,B)},St=k=>{var B=Ov();x(k,B)};xe(bt,k=>{r()?k(Dt):k(St,-1)})}var Ke=v(Tt,2);let Qe;var Rt=d(Ke);{var Ot=k=>{var B=qv(),Ce=d(B),Oe=d(Ce);Rn(vv(Oe,{onchange:j,onColorPicked:W,onColorHover:En=>m(P,En,!0),get images(){return n(z)},set images(En){m(z,En,!0)},get activeImageIndex(){return n(N)},set activeImageIndex(En){m(N,En,!0)}}),En=>m(O,En,!0),()=>n(O));var _t=v(Ce,2),qt=d(_t),br=d(qt);hv(br,{getViewerRef:()=>n(O),get statusMessage(){return n(M)},get hoverColor(){return n(P)}}),x(k,B)},Ln=k=>{var B=Lv();x(k,B)};xe(Rt,k=>{r()?k(Ot):k(Ln,-1)})}var sn=v(Ke,2);let Z;var ee=v(sn,2);let re;var Se=d(ee);Ev(Se,{}),se(()=>{Y=ke(E,"",Y,{display:n(s)==="colors"?"block":"none"}),ne=qe(X,1,"colors-preview svelte-12apuct",null,ne,{split:n(H)!==null||n(A)}),Je=ke(rt,"",Je,{display:n(s)==="gradient"?"block":"none"}),dt=ke(Tt,"",dt,{display:n(s)==="notepad"?"block":"none"}),Qe=ke(Ke,"",Qe,{display:n(s)==="viewer"?"block":"none"}),Z=ke(sn,"",Z,{display:n(s)==="tools"?"block":"none"}),re=ke(ee,"",re,{display:n(s)==="console"?"block":"none"})}),x(e,I),st(),l()}vt(["click","dblclick","contextmenu"]);var Bv=D('<div class="num-input svelte-16ngfpx"><button class="num-btn svelte-16ngfpx" title="Decrease">&minus;</button> <input class="num-field svelte-16ngfpx" type="number"/> <button class="num-btn svelte-16ngfpx" title="Increase">+</button></div>');function xn(e,t){lt(t,!0);let r=We(t,"value",3,0),o=We(t,"step",3,1),i=We(t,"min",3,void 0),l=We(t,"max",3,void 0),a=We(t,"onchange",3,null);function s(y){return i()!=null&&y<i()&&(y=i()),l()!=null&&y>l()&&(y=l()),y}function c(y){var q;const R=s(y);(q=a())==null||q(R)}function u(){c((r()??0)-o())}function g(){c((r()??0)+o())}function h(y){const R=Number(y.target.value);isNaN(R)||c(R)}function p(y){y.target.select()}var _=Bv(),f=d(_),w=v(f,2),b=v(w,2);se(()=>{Et(w,r()),Ve(w,"step",o()),Ve(w,"min",i()),Ve(w,"max",l())}),$("click",f,u),zt("focus",w,p),$("change",w,h),$("click",b,g),x(e,_),st()}vt(["click","change"]);var Gv=D('<div class="prop-card svelte-3rgj88"><div class="prop-row svelte-3rgj88"><span class="lbl svelte-3rgj88">Name</span> <input class="val svelte-3rgj88" type="text"/></div> <div class="prop-row-pair svelte-3rgj88"><div class="prop-row half svelte-3rgj88"><span class="lbl svelte-3rgj88">Width</span> <!></div> <div class="prop-row half svelte-3rgj88"><span class="lbl svelte-3rgj88">Height</span> <!></div></div></div>'),Yv=D('<div class="prop-card svelte-3rgj88"><div class="prop-row svelte-3rgj88"><span class="lbl svelte-3rgj88">Mode</span> <select class="val svelte-3rgj88"><option>Solid</option><option>Gradient</option><option>Image</option></select></div> <div class="prop-row svelte-3rgj88"><span class="lbl svelte-3rgj88">Colour</span> <div class="color-input svelte-3rgj88"><button class="mini-swatch svelte-3rgj88" title="Pick colour"></button> <input class="val svelte-3rgj88" type="text"/></div></div></div>'),Uv=D('<div class="prop-card svelte-3rgj88"><div class="prop-row svelte-3rgj88"><span class="lbl svelte-3rgj88">Show Grid</span> <button> </button></div> <div class="prop-row svelte-3rgj88"><span class="lbl svelte-3rgj88">Grid Size</span> <!></div> <div class="prop-row svelte-3rgj88"><span class="lbl svelte-3rgj88">Snap</span> <button> </button></div> <div class="prop-row svelte-3rgj88"><span class="lbl svelte-3rgj88">Colour</span> <div class="color-input svelte-3rgj88"><button class="mini-swatch svelte-3rgj88" title="Pick colour"></button> <input class="val svelte-3rgj88" type="text"/></div></div></div>'),Wv=D('<div class="placeholder svelte-3rgj88">Export settings (VST3, Standalone, etc.)</div>'),Xv=D('<div class="placeholder svelte-3rgj88"> </div>');function ra(e,t){lt(t,!0);const r=()=>wt(Pt,"$panels",i),o=()=>wt(jt,"$activePanelId",i),[i,l]=tr();let a=We(t,"tabId",3,""),s=T(()=>r().find(f=>f.id===o())??null);function c(f,w){Sl({type:"panel",prop:f},w)}function u(f,w){if(!n(s))return;let b=w.target.value;const y=Number(b);!isNaN(y)&&b!==""&&(b=y),Kt(n(s).id,{[f]:b})}function g(f){n(s)&&Kt(n(s).id,{[f]:!n(s)[f]})}var h=ue(),p=oe(h);{var _=f=>{var w=ue(),b=oe(w);{var y=O=>{var M=Gv(),P=d(M),Q=v(d(P),2),H=v(P,2),A=d(H),K=v(d(A),2);xn(K,{get value(){return n(s).width},step:1,min:1,onchange:L=>Kt(n(s).id,{width:L})});var pe=v(A,2),de=v(d(pe),2);xn(de,{get value(){return n(s).height},step:1,min:1,onchange:L=>Kt(n(s).id,{height:L})}),se(()=>Et(Q,n(s).name)),$("change",Q,L=>u("name",L)),x(O,M)},R=O=>{var M=Yv(),P=d(M),Q=v(d(P),2),H=d(Q);H.value=H.__value="solid";var A=v(H);A.value=A.__value="gradient";var K=v(A);K.value=K.__value="image";var pe;ao(Q);var de=v(P,2),L=v(d(de),2),G=d(L),j=v(G,2);se(()=>{pe!==(pe=n(s).bgMode)&&(Q.value=(Q.__value=n(s).bgMode)??"",_r(Q,n(s).bgMode)),ke(G,`background:#${n(s).bgColour??""}`),Et(j,n(s).bgColour)}),$("change",Q,W=>u("bgMode",W)),$("click",G,()=>c("bgColour",n(s).bgColour)),$("change",j,W=>u("bgColour",W)),x(O,M)},q=O=>{var M=Uv(),P=d(M),Q=v(d(P),2);let H;var A=d(Q),K=v(P,2),pe=v(d(K),2);xn(pe,{get value(){return n(s).gridSize},step:1,min:1,onchange:V=>Kt(n(s).id,{gridSize:V})});var de=v(K,2),L=v(d(de),2);let G;var j=d(L),W=v(de,2),te=v(d(W),2),ve=d(te),ye=v(ve,2);se(V=>{H=qe(Q,1,"toggle-val svelte-3rgj88",null,H,{on:n(s).gridEnabled}),Be(A,n(s).gridEnabled?"On":"Off"),G=qe(L,1,"toggle-val svelte-3rgj88",null,G,{on:n(s).snapToGrid}),Be(j,n(s).snapToGrid?"On":"Off"),ke(ve,`background:#${V??""}`),Et(ye,n(s).gridColour??"33FFFFFF")},[()=>(n(s).gridColour??"33FFFFFF").slice(-6)]),$("click",Q,()=>g("gridEnabled")),$("click",L,()=>g("snapToGrid")),$("click",ve,()=>c("gridColour",n(s).gridColour??"33FFFFFF")),$("change",ye,V=>u("gridColour",V)),x(O,M)},z=O=>{var M=Wv();x(O,M)},N=O=>{var M=Xv(),P=d(M);se(()=>Be(P,`Panel: ${a()??""}`)),x(O,M)};xe(b,O=>{a()==="identity"?O(y):a()==="background"?O(R,1):a()==="grid"?O(q,2):a()==="export"?O(z,3):O(N,-1)})}x(f,w)};xe(p,f=>{n(s)&&f(_)})}x(e,h),st(),l()}vt(["change","click"]);var Vv=D('<div class="prop-card svelte-x4mvaq"><div class="prop-row svelte-x4mvaq"><span class="lbl svelte-x4mvaq">Name</span> <input class="val svelte-x4mvaq" type="text"/></div> <div class="prop-row svelte-x4mvaq"><span class="lbl svelte-x4mvaq">Type</span> <span class="val readonly svelte-x4mvaq"> </span></div> <div class="prop-row svelte-x4mvaq"><span class="lbl svelte-x4mvaq">Visible</span> <button> </button></div> <div class="prop-row svelte-x4mvaq"><span class="lbl svelte-x4mvaq">Enabled</span> <button> </button></div> <div class="prop-row svelte-x4mvaq"><span class="lbl svelte-x4mvaq">Locked</span> <button> </button></div> <div class="prop-row svelte-x4mvaq"><span class="lbl svelte-x4mvaq">Z-Index</span> <!></div> <div class="prop-row svelte-x4mvaq"><span class="lbl svelte-x4mvaq">Layer</span> <input class="val svelte-x4mvaq" type="text"/></div></div>');function Ho(e,t){lt(t,!0);let r=We(t,"control",3,null),o=T(()=>$n(r(),"Core"));function i(h,p){var _;(_=n(o))!=null&&_.id&&Lt(n(o).id,`Core.${h}`,p)}function l(h,p){const _=p.target;let f=_.type==="number"?Number(_.value):_.value;i(h,f)}function a(h){var p;i(h,!((p=n(o))!=null&&p[h]))}function s(h){h.target.select()}var c=ue(),u=oe(c);{var g=h=>{var p=Vv(),_=d(p),f=v(d(_),2),w=v(_,2),b=v(d(w),2),y=d(b),R=v(w,2),q=v(d(R),2);let z;var N=d(q),O=v(R,2),M=v(d(O),2);let P;var Q=d(M),H=v(O,2),A=v(d(H),2);let K;var pe=d(A),de=v(H,2),L=v(d(de),2);xn(L,{get value(){return n(o).zIndex},step:1,min:0,onchange:W=>i("zIndex",W)});var G=v(de,2),j=v(d(G),2);se(()=>{Et(f,n(o).name),Be(y,n(o).controlType),z=qe(q,1,"toggle-val svelte-x4mvaq",null,z,{on:n(o).visible}),Be(N,n(o).visible?"On":"Off"),P=qe(M,1,"toggle-val svelte-x4mvaq",null,P,{on:n(o).enabled}),Be(Q,n(o).enabled?"On":"Off"),K=qe(A,1,"toggle-val svelte-x4mvaq",null,K,{on:n(o).locked}),Be(pe,n(o).locked?"On":"Off"),Et(j,n(o).layer)}),zt("focus",f,s),$("change",f,W=>l("name",W)),$("click",q,()=>a("visible")),$("click",M,()=>a("enabled")),$("click",A,()=>a("locked")),zt("focus",j,s),$("change",j,W=>l("layer",W)),x(h,p)};xe(u,h=>{n(o)&&h(g)})}x(e,c),st()}vt(["change","click"]);var Jv=D('<div class="prop-card svelte-117e023"><div class="prop-row-pair svelte-117e023"><div class="prop-row half svelte-117e023"><span class="lbl svelte-117e023">X</span> <!></div> <div class="prop-row half svelte-117e023"><span class="lbl svelte-117e023">Y</span> <!></div></div> <div class="prop-row-pair svelte-117e023"><div class="prop-row half svelte-117e023"><span class="lbl svelte-117e023">W</span> <!></div> <div class="prop-row half svelte-117e023"><span class="lbl svelte-117e023">H</span> <!></div></div> <div class="prop-row-pair svelte-117e023"><div class="prop-row half svelte-117e023"><span class="lbl svelte-117e023">Opacity</span> <!></div> <div class="prop-row half svelte-117e023"><span class="lbl svelte-117e023">Rot</span> <!></div></div></div>');function Bo(e,t){lt(t,!0);let r=We(t,"control",3,null),o=T(()=>$n(r(),"Core")),i=T(()=>$n(r(),"Transform"));function l(u,g){var h;(h=n(o))!=null&&h.id&&Lt(n(o).id,`Transform.${u}`,g)}var a=ue(),s=oe(a);{var c=u=>{var g=Jv(),h=d(g),p=d(h),_=v(d(p),2);xn(_,{get value(){return n(i).x},step:1,onchange:H=>l("x",H)});var f=v(p,2),w=v(d(f),2);xn(w,{get value(){return n(i).y},step:1,onchange:H=>l("y",H)});var b=v(h,2),y=d(b),R=v(d(y),2);xn(R,{get value(){return n(i).width},step:1,min:10,onchange:H=>l("width",H)});var q=v(y,2),z=v(d(q),2);xn(z,{get value(){return n(i).height},step:1,min:10,onchange:H=>l("height",H)});var N=v(b,2),O=d(N),M=v(d(O),2);xn(M,{get value(){return n(i).opacity},step:.05,min:0,max:1,onchange:H=>l("opacity",H)});var P=v(O,2),Q=v(d(P),2);xn(Q,{get value(){return n(i).rotation},step:1,onchange:H=>l("rotation",H)}),x(u,g)};xe(s,u=>{n(i)&&u(c)})}x(e,a),st()}var Zv=D('<div class="prop-card svelte-1wx6vjp"><div class="prop-row svelte-1wx6vjp"><span class="lbl svelte-1wx6vjp">Mode</span> <select class="val svelte-1wx6vjp"><option>Solid</option><option>Gradient</option><option>Image</option></select></div> <div class="prop-row svelte-1wx6vjp"><span class="lbl svelte-1wx6vjp">Colour</span> <div class="color-input svelte-1wx6vjp"><button class="mini-swatch svelte-1wx6vjp" title="Pick colour"></button> <input class="val svelte-1wx6vjp" type="text"/></div></div></div>');function Go(e,t){lt(t,!0);let r=We(t,"control",3,null),o=T(()=>$n(r(),"Core")),i=T(()=>$n(r(),"Background")),l=T(()=>{var f,w;return(w=(f=n(i))==null?void 0:f._children)==null?void 0:w.Fill});function a(){var f,w;!((f=n(o))!=null&&f.id)||!((w=n(l))!=null&&w.colour)||Sl({type:"control",controlId:n(o).id,path:"Background.Fill.colour"},n(l).colour)}function s(f){var w;(w=n(o))!=null&&w.id&&Lt(n(o).id,"Background.mode",f.target.value)}function c(f){var b;if(!((b=n(o))!=null&&b.id))return;let w=f.target.value.replace(/^#/,"").toUpperCase();w.length===6&&(w="FF"+w),Lt(n(o).id,"Background.Fill.colour",w)}function u(f){f.target.select()}let g=T(()=>{var f;return(f=n(l))!=null&&f.colour?n(l).colour.slice(-6):"3A3A3A"});var h=ue(),p=oe(h);{var _=f=>{var w=Zv(),b=d(w),y=v(d(b),2),R=d(y);R.value=R.__value="solid";var q=v(R);q.value=q.__value="gradient";var z=v(q);z.value=z.__value="image";var N;ao(y);var O=v(b,2),M=v(d(O),2),P=d(M),Q=v(P,2);se(()=>{N!==(N=n(i).mode)&&(y.value=(y.__value=n(i).mode)??"",_r(y,n(i).mode)),ke(P,`background:#${n(g)??""}`),Et(Q,n(g))}),$("change",y,s),$("click",P,a),zt("focus",Q,u),$("change",Q,c),x(f,w)};xe(p,f=>{n(i)&&f(_)})}x(e,h),st()}vt(["change","click"]);var Kv=D("<button><!></button>"),Qv=D('<div class="placeholder svelte-2rmaxa"> </div>'),ef=D('<div class="card-header svelte-2rmaxa"><span class="card-title svelte-2rmaxa"> </span> <span class="card-context svelte-2rmaxa"> </span></div> <div class="card-content svelte-2rmaxa"><!></div>',1),tf=D('<div class="placeholder svelte-2rmaxa"> </div>'),nf=D('<div class="multi-card-content svelte-2rmaxa"><!></div>'),rf=D('<div class="multi-card svelte-2rmaxa"><button class="multi-card-header svelte-2rmaxa"><!> <span class="multi-card-title svelte-2rmaxa"> </span></button> <!></div>'),of=D('<div class="multi-scroll svelte-2rmaxa"></div>'),af=D('<div class="icon-tabs svelte-2rmaxa"><!> <div class="tab-spacer svelte-2rmaxa"></div> <button><!></button></div> <div class="card-area svelte-2rmaxa"><!></div>',1),lf=D('<div class="empty-panel svelte-2rmaxa"><span class="empty-text svelte-2rmaxa">No panel open</span></div>'),sf=D('<div class="properties-panel svelte-2rmaxa"><!></div>');function cf(e,t){lt(t,!0);const r=()=>wt(Pt,"$panels",a),o=()=>wt(jt,"$activePanelId",a),i=()=>wt(Mn,"$selectedComponentId",a),l=()=>wt(Dc,"$selectedControl",a),[a,s]=tr();let c=We(t,"width",3,280),u=T(()=>r().find(L=>L.id===o())??null),g=T(i),h=T(()=>n(g)!=null?"component":"panel"),p=U("single"),_=U("identity"),f=U(pt(new Set(["identity"]))),w=U(pt({}));Wt(()=>{if(n(h)){const L=n(h)==="component"?"core":"identity";m(_,L,!0),m(f,new Set([L]),!0)}});const b=[{id:"identity",icon:gu,label:"Panel"},{id:"background",icon:ta,label:"Background"},{id:"grid",icon:ea,label:"Grid"},{id:"export",icon:yu,label:"Export"}],y=[{id:"core",icon:au,label:"Core",section:"Core"},{id:"transform",icon:gl,label:"Transform",section:"Transform"},{id:"background",icon:ta,label:"Background",section:"Background"},{id:"text",icon:yl,label:"Text",section:"Text"},{id:"border",icon:zu,label:"Border",section:"Border"},{id:"mouse",icon:ku,label:"Mouse",section:"Mouse"},{id:"grid",icon:ea,label:"Grid",section:"Grid"},{id:"icon",icon:fu,label:"Icon",section:"Icon"},{id:"effects",icon:Eu,label:"Effects",section:"Shadow"},{id:"actions",icon:Lu,label:"Scripts",section:"Scripts"},{id:"links",icon:mu,label:"Links",section:null},{id:"specific",icon:Su,label:"Type",section:null}];let R=T(()=>l()?y.filter(L=>!L.section||Lc(l(),L.section)):y.filter(L=>L.id==="core"||L.id==="transform")),q=T(()=>n(h)==="panel"?b:n(R)),z=T(()=>n(p)==="single"?n(q).filter(L=>L.id===n(_)):n(q).filter(L=>n(f).has(L.id)));function N(L){return n(p)==="single"?L===n(_):n(f).has(L)}function O(L,G){G.ctrlKey||G.metaKey?(M(L),n(f).size>1&&m(p,"multi")):n(p)==="single"?m(_,L,!0):M(L)}function M(L){m(f,new Set(n(f)),!0),n(f).has(L)?n(f).size>1&&n(f).delete(L):n(f).add(L),n(f).size===1&&m(_,[...n(f)][0],!0)}function P(){n(p)==="single"?(m(p,"multi"),m(f,new Set([n(_)]),!0)):(m(p,"single"),n(f).size>0&&m(_,[...n(f)][0],!0))}function Q(L){return n(w)[L]===!0}function H(L){m(w,{...n(w),[L]:!n(w)[L]},!0)}var A=sf(),K=d(A);{var pe=L=>{var G=af(),j=oe(G),W=d(j);it(W,17,()=>n(q),je=>je.id,(je,Xe)=>{var ze=Kv();let Ae;var Ze=d(ze);ai(Ze,()=>n(Xe).icon,(me,Ne)=>{Ne(me,{size:16,strokeWidth:1.5})}),se(me=>{Ae=qe(ze,1,"tab-icon svelte-2rmaxa",null,Ae,me),Ve(ze,"title",n(Xe).label)},[()=>({active:N(n(Xe).id)})]),$("click",ze,me=>O(n(Xe).id,me)),x(je,ze)});var te=v(W,4);let ve;var ye=d(te);{var V=je=>{hu(je,{size:16,strokeWidth:1.5})},ie=je=>{Nu(je,{size:16,strokeWidth:1.5})};xe(ye,je=>{n(p)==="single"?je(V):je(ie,-1)})}var _e=v(j,2),Ee=d(_e);{var Le=je=>{var Xe=ue(),ze=oe(Xe);it(ze,17,()=>n(z),Ae=>Ae.id,(Ae,Ze)=>{var me=ef(),Ne=oe(me),I=d(Ne),le=d(I),F=v(I,2),E=d(F),Y=v(Ne,2),S=d(Y);{var X=J=>{ra(J,{get tabId(){return n(Ze).id}})},ne=J=>{var ae=ue(),fe=oe(ae);{var Pe=tt=>{Ho(tt,{get control(){return l()}})},et=tt=>{Bo(tt,{get control(){return l()}})},Te=tt=>{Go(tt,{get control(){return l()}})},nt=tt=>{var $e=Qv(),Fe=d($e);se(()=>Be(Fe,`Component: ${n(Ze).label??""}`)),x(tt,$e)};xe(fe,tt=>{n(Ze).id==="core"?tt(Pe):n(Ze).id==="transform"?tt(et,1):n(Ze).id==="background"?tt(Te,2):tt(nt,-1)})}x(J,ae)};xe(S,J=>{n(h)==="panel"?J(X):J(ne,-1)})}se(()=>{Be(le,n(Ze).label),Be(E,n(h)==="panel"?"Panel":"Component")}),x(Ae,me)}),x(je,Xe)},at=je=>{var Xe=of();it(Xe,21,()=>n(z),ze=>ze.id,(ze,Ae)=>{var Ze=rf(),me=d(Ze),Ne=d(me);{var I=J=>{su(J,{size:14,strokeWidth:1.5})},le=T(()=>Q(n(Ae).id)),F=J=>{pl(J,{size:14,strokeWidth:1.5})};xe(Ne,J=>{n(le)?J(I):J(F,-1)})}var E=v(Ne,2),Y=d(E),S=v(me,2);{var X=J=>{var ae=nf(),fe=d(ae);{var Pe=Te=>{ra(Te,{get tabId(){return n(Ae).id}})},et=Te=>{var nt=ue(),tt=oe(nt);{var $e=Re=>{Ho(Re,{get control(){return l()}})},Fe=Re=>{Bo(Re,{get control(){return l()}})},rt=Re=>{Go(Re,{get control(){return l()}})},Je=Re=>{var ce=ue(),Ie=oe(ce);{var ct=ut=>{Ho(ut,{get control(){return l()}})},ot=ut=>{Bo(ut,{get control(){return l()}})},xt=ut=>{Go(ut,{get control(){return l()}})},$t=ut=>{var Tt=tf(),dt=d(Tt);se(()=>Be(dt,`Component: ${n(Ae).label??""}`)),x(ut,Tt)};xe(Ie,ut=>{n(Ae).id==="core"?ut(ct):n(Ae).id==="transform"?ut(ot,1):n(Ae).id==="background"?ut(xt,2):ut($t,-1)})}x(Re,ce)};xe(tt,Re=>{n(Ae).id==="core"?Re($e):n(Ae).id==="transform"?Re(Fe,1):n(Ae).id==="background"?Re(rt,2):Re(Je,-1)})}x(Te,nt)};xe(fe,Te=>{n(h)==="panel"?Te(Pe):Te(et,-1)})}x(J,ae)},ne=T(()=>!Q(n(Ae).id));xe(S,J=>{n(ne)&&J(X)})}se(()=>Be(Y,n(Ae).label)),$("click",me,()=>H(n(Ae).id)),x(ze,Ze)}),x(je,Xe)};xe(Ee,je=>{n(p)==="single"?je(Le):je(at,-1)})}se(()=>{ve=qe(te,1,"tab-icon mode-toggle svelte-2rmaxa",null,ve,{active:n(p)==="multi"}),Ve(te,"title",n(p)==="single"?"Switch to multi view":"Switch to single view")}),$("click",te,P),x(L,G)},de=L=>{var G=lf();x(L,G)};xe(K,L=>{n(u)?L(pe):L(de,-1)})}se(()=>ke(A,`width: ${c()??""}px;`)),x(e,A),st(),s()}vt(["click"]);var uf=D('<div class="status-bar svelte-1gvod6j"><span class="status-item svelte-1gvod6j">Ready</span> <span class="spacer svelte-1gvod6j"></span> <span class="status-item dim svelte-1gvod6j">No selection</span> <span class="status-item dim svelte-1gvod6j">CEditor v0.1.0</span></div>');function df(e){var t=uf();x(e,t)}var vf=D('<div class="app svelte-1n46o8q"><div class="menubar-area svelte-1n46o8q"><!></div> <div class="icon-panel-area svelte-1n46o8q"><!></div> <div class="center-area svelte-1n46o8q"><div class="editor-canvas-area svelte-1n46o8q"><!></div> <div class="common-bar-area svelte-1n46o8q"><!></div> <div class="zoom-bar-area svelte-1n46o8q"><!></div> <div></div> <div class="display-panel-area svelte-1n46o8q"><!></div></div> <div></div> <div class="properties-area svelte-1n46o8q"><!></div> <div class="statusbar-area svelte-1n46o8q"><!></div></div>');function ff(e,t){lt(t,!0),Rc(),$v();let r=U(280),o=U(!1),i=U(480),l=U(!1);const a={colors:480,gradient:580};function s(G){const j=a[G];j&&m(i,j,!0)}function c(G){m(o,!0);const j=G.clientX,W=n(r);function te(ye){const V=j-ye.clientX;m(r,Math.max(220,Math.min(500,W+V)),!0)}function ve(){m(o,!1),window.removeEventListener("mousemove",te),window.removeEventListener("mouseup",ve)}window.addEventListener("mousemove",te),window.addEventListener("mouseup",ve)}function u(G){m(l,!0);const j=G.clientY,W=n(i);function te(ye){const V=j-ye.clientY;m(i,Math.max(80,Math.min(900,W+V)),!0)}function ve(){m(l,!1),window.removeEventListener("mousemove",te),window.removeEventListener("mouseup",ve)}window.addEventListener("mousemove",te),window.addEventListener("mouseup",ve)}var g=vf(),h=d(g),p=d(h);Zc(p,{});var _=v(h,2),f=d(_);Yu(f);var w=v(_,2),b=d(w),y=d(b);cd(y,{});var R=v(b,2),q=d(R);dd(q);var z=v(R,2),N=d(z);hd(N,{});var O=v(z,2);let M;var P=v(O,2),Q=d(P);Hv(Q,{onTabChange:s});var H=v(w,2);let A;var K=v(H,2),pe=d(K);cf(pe,{get width(){return n(r)}});var de=v(K,2),L=d(de);df(L),se(()=>{ke(g,`--props-width: ${n(r)??""}px`),M=qe(O,1,"display-resize-handle svelte-1n46o8q",null,M,{active:n(l)}),ke(P,`flex: 0 0 ${n(i)??""}px;`),A=qe(H,1,"resize-handle svelte-1n46o8q",null,A,{active:n(o)})}),$("mousedown",O,u),$("mousedown",H,c),x(e,g),st()}vt(["mousedown"]);tc(ff,{target:document.getElementById("app")});
