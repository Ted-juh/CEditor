var qd=Object.defineProperty;var Ol=e=>{throw TypeError(e)};var Yd=(e,t,r)=>t in e?qd(e,t,{enumerable:!0,configurable:!0,writable:!0,value:r}):e[t]=r;var mn=(e,t,r)=>Yd(e,typeof t!="symbol"?t+"":t,r),Hi=(e,t,r)=>t.has(e)||Ol("Cannot "+r);var de=(e,t,r)=>(Hi(e,t,"read from private field"),r?r.call(e):t.get(e)),vt=(e,t,r)=>t.has(e)?Ol("Cannot add the same private member more than once"):t instanceof WeakSet?t.add(e):t.set(e,r),ht=(e,t,r,o)=>(Hi(e,t,"write to private field"),o?o.call(e,r):t.set(e,r),r),St=(e,t,r)=>(Hi(e,t,"access private method"),r);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const i of document.querySelectorAll('link[rel="modulepreload"]'))o(i);new MutationObserver(i=>{for(const a of i)if(a.type==="childList")for(const l of a.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&o(l)}).observe(document,{childList:!0,subtree:!0});function r(i){const a={};return i.integrity&&(a.integrity=i.integrity),i.referrerPolicy&&(a.referrerPolicy=i.referrerPolicy),i.crossOrigin==="use-credentials"?a.credentials="include":i.crossOrigin==="anonymous"?a.credentials="omit":a.credentials="same-origin",a}function o(i){if(i.ep)return;i.ep=!0;const a=r(i);fetch(i.href,a)}})();const Xd=!1;var Za=Array.isArray,Hd=Array.prototype.indexOf,Vr=Array.prototype.includes,Ci=Array.from,js=Object.defineProperty,sr=Object.getOwnPropertyDescriptor,Ns=Object.getOwnPropertyDescriptors,Ud=Object.prototype,Wd=Array.prototype,Ja=Object.getPrototypeOf,Bl=Object.isExtensible;function lo(e){return typeof e=="function"}const Wn=()=>{};function Vd(e){return e()}function mi(e){for(var t=0;t<e.length;t++)e[t]()}function Ls(){var e,t,r=new Promise((o,i)=>{e=o,t=i});return{promise:r,resolve:e,reject:t}}function zi(e,t){if(Array.isArray(e))return e;if(!(Symbol.iterator in e))return Array.from(e);const r=[];for(const o of e)if(r.push(o),r.length===t)break;return r}const Bt=2,Kr=4,Fo=8,Qa=1<<24,Kn=16,kn=32,Tr=64,$a=128,fn=512,Lt=1024,Ut=2048,Ln=4096,tn=8192,cn=16384,Ir=32768,xa=1<<25,Zn=65536,wa=1<<17,Kd=1<<18,to=1<<19,Rs=1<<20,In=1<<25,Er=65536,ka=1<<21,Mi=1<<22,cr=1<<23,jn=Symbol("$state"),Ds=Symbol("legacy props"),Zd=Symbol(""),qn=new class extends Error{constructor(){super(...arguments);mn(this,"name","StaleReactionError");mn(this,"message","The reaction that called `getAbortSignal()` was re-run or destroyed")}};var Fs;const el=!!((Fs=globalThis.document)!=null&&Fs.contentType)&&globalThis.document.contentType.includes("xml");function Jd(e){throw new Error("https://svelte.dev/e/lifecycle_outside_component")}function Qd(){throw new Error("https://svelte.dev/e/async_derived_orphan")}function eu(e,t,r){throw new Error("https://svelte.dev/e/each_key_duplicate")}function tu(e){throw new Error("https://svelte.dev/e/effect_in_teardown")}function nu(){throw new Error("https://svelte.dev/e/effect_in_unowned_derived")}function ru(e){throw new Error("https://svelte.dev/e/effect_orphan")}function ou(){throw new Error("https://svelte.dev/e/effect_update_depth_exceeded")}function iu(e){throw new Error("https://svelte.dev/e/props_invalid_value")}function au(){throw new Error("https://svelte.dev/e/state_descriptors_fixed")}function lu(){throw new Error("https://svelte.dev/e/state_prototype_fixed")}function su(){throw new Error("https://svelte.dev/e/state_unsafe_mutation")}function cu(){throw new Error("https://svelte.dev/e/svelte_boundary_reset_onerror")}const du=1,uu=2,Gs=4,vu=8,fu=16,hu=1,pu=2,Os=4,gu=8,bu=16,mu=1,_u=2,Ot=Symbol(),Bs="http://www.w3.org/1999/xhtml",qs="http://www.w3.org/2000/svg",yu="http://www.w3.org/1998/Math/MathML",$u="@attach";function xu(){console.warn("https://svelte.dev/e/select_multiple_invalid_value")}function wu(){console.warn("https://svelte.dev/e/svelte_boundary_reset_noop")}function Ys(e){return e===this.v}function Xs(e,t){return e!=e?t==t:e!==t||e!==null&&typeof e=="object"||typeof e=="function"}function Hs(e){return!Xs(e,this.v)}let no=!1,ku=!1;function Cu(){no=!0}let Et=null;function Zr(e){Et=e}function Ve(e,t=!1,r){Et={p:Et,i:!1,c:null,e:null,s:e,x:null,r:ut,l:no&&!t?{s:null,u:null,$:[]}:null}}function Ke(e){var t=Et,r=t.e;if(r!==null){t.e=null;for(var o of r)pc(o)}return e!==void 0&&(t.x=e),t.i=!0,Et=t.p,e??{}}function ro(){return!no||Et!==null&&Et.l===null}let _r=[];function Us(){var e=_r;_r=[],mi(e)}function Vn(e){if(_r.length===0&&!po){var t=_r;queueMicrotask(()=>{t===_r&&Us()})}_r.push(e)}function zu(){for(;_r.length>0;)Us()}function Ws(e){var t=ut;if(t===null)return ft.f|=cr,e;if((t.f&Ir)===0&&(t.f&Kr)===0)throw e;ar(e,t)}function ar(e,t){for(;t!==null;){if((t.f&$a)!==0){if((t.f&Ir)===0)throw e;try{t.b.error(e);return}catch(r){e=r}}t=t.parent}throw e}const Mu=-7169;function At(e,t){e.f=e.f&Mu|t}function tl(e){(e.f&fn)!==0||e.deps===null?At(e,Lt):At(e,Ln)}function Vs(e){if(e!==null)for(const t of e)(t.f&Bt)===0||(t.f&Er)===0||(t.f^=Er,Vs(t.deps))}function Ks(e,t,r){(e.f&Ut)!==0?t.add(e):(e.f&Ln)!==0&&r.add(e),Vs(e.deps),At(e,Lt)}function nl(e,t,r){if(e==null)return t(void 0),r&&r(void 0),Wn;const o=Jn(()=>e.subscribe(t,r));return o.unsubscribe?()=>o.unsubscribe():o}const Rr=[];function Su(e,t){return{subscribe:Ft(e,t).subscribe}}function Ft(e,t=Wn){let r=null;const o=new Set;function i(s){if(Xs(e,s)&&(e=s,r)){const c=!Rr.length;for(const d of o)d[1](),Rr.push(d,e);if(c){for(let d=0;d<Rr.length;d+=2)Rr[d][0](Rr[d+1]);Rr.length=0}}}function a(s){i(s(e))}function l(s,c=Wn){const d=[s,c];return o.add(d),o.size===1&&(r=t(i,a)||Wn),s(e),()=>{o.delete(d),o.size===0&&r&&(r(),r=null)}}return{set:i,update:a,subscribe:l}}function Io(e,t,r){const o=!Array.isArray(e),i=o?[e]:e;if(!i.every(Boolean))throw new Error("derived() expects stores as input, got a falsy value");const a=t.length<2;return Su(r,(l,s)=>{let c=!1;const d=[];let u=0,p=Wn;const v=()=>{if(u)return;p();const g=t(o?d[0]:d,l,s);a?l(g):p=typeof g=="function"?g:Wn},b=i.map((g,_)=>nl(g,y=>{d[_]=y,u&=~(1<<_),c&&v()},()=>{u|=1<<_}));return c=!0,v(),function(){mi(b),p(),c=!1}})}function He(e){let t;return nl(e,r=>t=r)(),t}let Zo=!1,Ca=Symbol();function Ye(e,t,r){const o=r[t]??(r[t]={store:null,source:lc(void 0),unsubscribe:Wn});if(o.store!==e&&!(Ca in r))if(o.unsubscribe(),o.store=e??null,e==null)o.source.v=void 0,o.unsubscribe=Wn;else{var i=!0;o.unsubscribe=nl(e,a=>{i?o.source.v=a:w(o.source,a)}),i=!1}return e&&Ca in r?He(e):n(o.source)}function It(){const e={};function t(){No(()=>{for(var r in e)e[r].unsubscribe();js(e,Ca,{enumerable:!1,value:!0})})}return[e,t]}function Pu(e){var t=Zo;try{return Zo=!1,[e(),Zo]}finally{Zo=t}}const tr=new Set;let rt=null,Ht=null,za=null,po=!1,Ui=!1,Or=null,li=null;var ql=0;let Tu=1;var Xr,Hr,Yn,Sn,zo,rn,Mo,or,Xn,Pn,Ur,wr,Nt,si,Zs,ci,Ma,Sa,Js;const xi=class xi{constructor(){vt(this,Nt);mn(this,"id",Tu++);mn(this,"current",new Map);mn(this,"previous",new Map);vt(this,Xr,new Set);vt(this,Hr,new Set);vt(this,Yn,new Map);vt(this,Sn,new Map);vt(this,zo,null);vt(this,rn,[]);vt(this,Mo,[]);vt(this,or,new Set);vt(this,Xn,new Set);vt(this,Pn,new Map);mn(this,"is_fork",!1);vt(this,Ur,!1);vt(this,wr,new Set)}skip_effect(t){de(this,Pn).has(t)||de(this,Pn).set(t,{d:[],m:[]})}unskip_effect(t){var r=de(this,Pn).get(t);if(r){de(this,Pn).delete(t);for(var o of r.d)At(o,Ut),this.schedule(o);for(o of r.m)At(o,Ln),this.schedule(o)}}capture(t,r,o=!1){r!==Ot&&!this.previous.has(t)&&this.previous.set(t,r),(t.f&cr)===0&&(this.current.set(t,[t.v,o]),Ht==null||Ht.set(t,t.v))}activate(){rt=this}deactivate(){rt=null,Ht=null}flush(){try{Ui=!0,rt=this,St(this,Nt,ci).call(this)}finally{ql=0,za=null,Or=null,li=null,Ui=!1,rt=null,Ht=null,dr.clear()}}discard(){for(const t of de(this,Hr))t(this);de(this,Hr).clear(),tr.delete(this)}register_created_effect(t){de(this,Mo).push(t)}increment(t,r){let o=de(this,Yn).get(r)??0;if(de(this,Yn).set(r,o+1),t){let i=de(this,Sn).get(r)??0;de(this,Sn).set(r,i+1)}}decrement(t,r,o){let i=de(this,Yn).get(r)??0;if(i===1?de(this,Yn).delete(r):de(this,Yn).set(r,i-1),t){let a=de(this,Sn).get(r)??0;a===1?de(this,Sn).delete(r):de(this,Sn).set(r,a-1)}de(this,Ur)||o||(ht(this,Ur,!0),Vn(()=>{ht(this,Ur,!1),this.flush()}))}transfer_effects(t,r){for(const o of t)de(this,or).add(o);for(const o of r)de(this,Xn).add(o);t.clear(),r.clear()}oncommit(t){de(this,Xr).add(t)}ondiscard(t){de(this,Hr).add(t)}settled(){return(de(this,zo)??ht(this,zo,Ls())).promise}static ensure(){if(rt===null){const t=rt=new xi;Ui||(tr.add(rt),po||Vn(()=>{rt===t&&t.flush()}))}return rt}apply(){{Ht=null;return}}schedule(t){var i;if(za=t,(i=t.b)!=null&&i.is_pending&&(t.f&(Kr|Fo|Qa))!==0&&(t.f&Ir)===0){t.b.defer_effect(t);return}for(var r=t;r.parent!==null;){r=r.parent;var o=r.f;if(Or!==null&&r===ut&&(ft===null||(ft.f&Bt)===0))return;if((o&(Tr|kn))!==0){if((o&Lt)===0)return;r.f^=Lt}}de(this,rn).push(r)}};Xr=new WeakMap,Hr=new WeakMap,Yn=new WeakMap,Sn=new WeakMap,zo=new WeakMap,rn=new WeakMap,Mo=new WeakMap,or=new WeakMap,Xn=new WeakMap,Pn=new WeakMap,Ur=new WeakMap,wr=new WeakMap,Nt=new WeakSet,si=function(){return this.is_fork||de(this,Sn).size>0},Zs=function(){for(const o of de(this,wr))for(const i of de(o,Sn).keys()){for(var t=!1,r=i;r.parent!==null;){if(de(this,Pn).has(r)){t=!0;break}r=r.parent}if(!t)return!0}return!1},ci=function(){var s,c;if(ql++>1e3&&(tr.delete(this),Fu()),!St(this,Nt,si).call(this)){for(const d of de(this,or))de(this,Xn).delete(d),At(d,Ut),this.schedule(d);for(const d of de(this,Xn))At(d,Ln),this.schedule(d)}const t=de(this,rn);ht(this,rn,[]),this.apply();var r=Or=[],o=[],i=li=[];for(const d of t)try{St(this,Nt,Ma).call(this,d,r,o)}catch(u){throw tc(d),u}if(rt=null,i.length>0){var a=xi.ensure();for(const d of i)a.schedule(d)}if(Or=null,li=null,St(this,Nt,si).call(this)||St(this,Nt,Zs).call(this)){St(this,Nt,Sa).call(this,o),St(this,Nt,Sa).call(this,r);for(const[d,u]of de(this,Pn))ec(d,u)}else{de(this,Yn).size===0&&tr.delete(this),de(this,or).clear(),de(this,Xn).clear();for(const d of de(this,Xr))d(this);de(this,Xr).clear(),Yl(o),Yl(r),(s=de(this,zo))==null||s.resolve()}var l=rt;if(de(this,rn).length>0){const d=l??(l=this);de(d,rn).push(...de(this,rn).filter(u=>!de(d,rn).includes(u)))}l!==null&&(tr.add(l),St(c=l,Nt,ci).call(c)),tr.has(this)||St(this,Nt,Js).call(this)},Ma=function(t,r,o){t.f^=Lt;for(var i=t.first;i!==null;){var a=i.f,l=(a&(kn|Tr))!==0,s=l&&(a&Lt)!==0,c=s||(a&tn)!==0||de(this,Pn).has(i);if(!c&&i.fn!==null){l?i.f^=Lt:(a&Kr)!==0?r.push(i):Lo(i)&&((a&Kn)!==0&&de(this,Xn).add(i),Qr(i));var d=i.first;if(d!==null){i=d;continue}}for(;i!==null;){var u=i.next;if(u!==null){i=u;break}i=i.parent}}},Sa=function(t){for(var r=0;r<t.length;r+=1)Ks(t[r],de(this,or),de(this,Xn))},Js=function(){var u,p,v;for(const b of tr){var t=b.id<this.id,r=[];for(const[g,[_,y]]of this.current){if(b.current.has(g)){var o=b.current.get(g)[0];if(t&&_!==o)b.current.set(g,[_,y]);else continue}r.push(g)}var i=[...b.current.keys()].filter(g=>!this.current.has(g));if(i.length===0)t&&b.discard();else if(r.length>0){b.activate();var a=new Set,l=new Map;for(var s of r)Qs(s,i,a,l);l=new Map;var c=[...b.current.keys()].filter(g=>this.current.has(g)?this.current.get(g)[0]!==g:!0);for(const g of de(this,Mo))(g.f&(cn|tn|wa))===0&&rl(g,c,l)&&((g.f&(Mi|Kn))!==0?(At(g,Ut),b.schedule(g)):de(b,or).add(g));if(de(b,rn).length>0){b.apply();for(var d of de(b,rn))St(u=b,Nt,Ma).call(u,d,[],[]);ht(b,rn,[])}b.deactivate()}}for(const b of tr)de(b,wr).has(this)&&(de(b,wr).delete(this),de(b,wr).size===0&&!St(p=b,Nt,si).call(p)&&(b.activate(),St(v=b,Nt,ci).call(v)))};let Fr=xi;function Eu(e){var t=po;po=!0;try{for(var r;;){if(zu(),rt===null)return r;rt.flush()}}finally{po=t}}function Fu(){try{ou()}catch(e){ar(e,za)}}let _n=null;function Yl(e){var t=e.length;if(t!==0){for(var r=0;r<t;){var o=e[r++];if((o.f&(cn|tn))===0&&Lo(o)&&(_n=new Set,Qr(o),o.deps===null&&o.first===null&&o.nodes===null&&o.teardown===null&&o.ac===null&&_c(o),(_n==null?void 0:_n.size)>0)){dr.clear();for(const i of _n){if((i.f&(cn|tn))!==0)continue;const a=[i];let l=i.parent;for(;l!==null;)_n.has(l)&&(_n.delete(l),a.push(l)),l=l.parent;for(let s=a.length-1;s>=0;s--){const c=a[s];(c.f&(cn|tn))===0&&Qr(c)}}_n.clear()}}_n=null}}function Qs(e,t,r,o){if(!r.has(e)&&(r.add(e),e.reactions!==null))for(const i of e.reactions){const a=i.f;(a&Bt)!==0?Qs(i,t,r,o):(a&(Mi|Kn))!==0&&(a&Ut)===0&&rl(i,t,o)&&(At(i,Ut),ol(i))}}function rl(e,t,r){const o=r.get(e);if(o!==void 0)return o;if(e.deps!==null)for(const i of e.deps){if(Vr.call(t,i))return!0;if((i.f&Bt)!==0&&rl(i,t,r))return r.set(i,!0),!0}return r.set(e,!1),!1}function ol(e){rt.schedule(e)}function ec(e,t){if(!((e.f&kn)!==0&&(e.f&Lt)!==0)){(e.f&Ut)!==0?t.d.push(e):(e.f&Ln)!==0&&t.m.push(e),At(e,Lt);for(var r=e.first;r!==null;)ec(r,t),r=r.next}}function tc(e){At(e,Lt);for(var t=e.first;t!==null;)tc(t),t=t.next}function Iu(e){let t=0,r=vr(0),o;return()=>{cl()&&(n(r),dl(()=>(t===0&&(o=Jn(()=>e(()=>go(r)))),t+=1,()=>{Vn(()=>{t-=1,t===0&&(o==null||o(),o=void 0,go(r))})})))}}var Au=Zn|to;function ju(e,t,r,o){new Nu(e,t,r,o)}var vn,Ka,Tn,kr,Zt,En,on,yn,Hn,Cr,ir,Wr,So,Po,Un,wi,Rt,Lu,Ru,Du,Pa,di,ui,Ta;class Nu{constructor(t,r,o,i){vt(this,Rt);mn(this,"parent");mn(this,"is_pending",!1);mn(this,"transform_error");vt(this,vn);vt(this,Ka,null);vt(this,Tn);vt(this,kr);vt(this,Zt);vt(this,En,null);vt(this,on,null);vt(this,yn,null);vt(this,Hn,null);vt(this,Cr,0);vt(this,ir,0);vt(this,Wr,!1);vt(this,So,new Set);vt(this,Po,new Set);vt(this,Un,null);vt(this,wi,Iu(()=>(ht(this,Un,vr(de(this,Cr))),()=>{ht(this,Un,null)})));var a;ht(this,vn,t),ht(this,Tn,r),ht(this,kr,l=>{var s=ut;s.b=this,s.f|=$a,o(l)}),this.parent=ut.b,this.transform_error=i??((a=this.parent)==null?void 0:a.transform_error)??(l=>l),ht(this,Zt,Ar(()=>{St(this,Rt,Pa).call(this)},Au))}defer_effect(t){Ks(t,de(this,So),de(this,Po))}is_rendered(){return!this.is_pending&&(!this.parent||this.parent.is_rendered())}has_pending_snippet(){return!!de(this,Tn).pending}update_pending_count(t,r){St(this,Rt,Ta).call(this,t,r),ht(this,Cr,de(this,Cr)+t),!(!de(this,Un)||de(this,Wr))&&(ht(this,Wr,!0),Vn(()=>{ht(this,Wr,!1),de(this,Un)&&Jr(de(this,Un),de(this,Cr))}))}get_effect_pending(){return de(this,wi).call(this),n(de(this,Un))}error(t){var r=de(this,Tn).onerror;let o=de(this,Tn).failed;if(!r&&!o)throw t;de(this,En)&&(Wt(de(this,En)),ht(this,En,null)),de(this,on)&&(Wt(de(this,on)),ht(this,on,null)),de(this,yn)&&(Wt(de(this,yn)),ht(this,yn,null));var i=!1,a=!1;const l=()=>{if(i){wu();return}i=!0,a&&cu(),de(this,yn)!==null&&Mr(de(this,yn),()=>{ht(this,yn,null)}),St(this,Rt,ui).call(this,()=>{St(this,Rt,Pa).call(this)})},s=c=>{try{a=!0,r==null||r(c,l),a=!1}catch(d){ar(d,de(this,Zt)&&de(this,Zt).parent)}o&&ht(this,yn,St(this,Rt,ui).call(this,()=>{try{return Qt(()=>{var d=ut;d.b=this,d.f|=$a,o(de(this,vn),()=>c,()=>l)})}catch(d){return ar(d,de(this,Zt).parent),null}}))};Vn(()=>{var c;try{c=this.transform_error(t)}catch(d){ar(d,de(this,Zt)&&de(this,Zt).parent);return}c!==null&&typeof c=="object"&&typeof c.then=="function"?c.then(s,d=>ar(d,de(this,Zt)&&de(this,Zt).parent)):s(c)})}}vn=new WeakMap,Ka=new WeakMap,Tn=new WeakMap,kr=new WeakMap,Zt=new WeakMap,En=new WeakMap,on=new WeakMap,yn=new WeakMap,Hn=new WeakMap,Cr=new WeakMap,ir=new WeakMap,Wr=new WeakMap,So=new WeakMap,Po=new WeakMap,Un=new WeakMap,wi=new WeakMap,Rt=new WeakSet,Lu=function(){try{ht(this,En,Qt(()=>de(this,kr).call(this,de(this,vn))))}catch(t){this.error(t)}},Ru=function(t){const r=de(this,Tn).failed;r&&ht(this,yn,Qt(()=>{r(de(this,vn),()=>t,()=>()=>{})}))},Du=function(){const t=de(this,Tn).pending;t&&(this.is_pending=!0,ht(this,on,Qt(()=>t(de(this,vn)))),Vn(()=>{var r=ht(this,Hn,document.createDocumentFragment()),o=Nn();r.append(o),ht(this,En,St(this,Rt,ui).call(this,()=>Qt(()=>de(this,kr).call(this,o)))),de(this,ir)===0&&(de(this,vn).before(r),ht(this,Hn,null),Mr(de(this,on),()=>{ht(this,on,null)}),St(this,Rt,di).call(this,rt))}))},Pa=function(){try{if(this.is_pending=this.has_pending_snippet(),ht(this,ir,0),ht(this,Cr,0),ht(this,En,Qt(()=>{de(this,kr).call(this,de(this,vn))})),de(this,ir)>0){var t=ht(this,Hn,document.createDocumentFragment());fl(de(this,En),t);const r=de(this,Tn).pending;ht(this,on,Qt(()=>r(de(this,vn))))}else St(this,Rt,di).call(this,rt)}catch(r){this.error(r)}},di=function(t){this.is_pending=!1,t.transfer_effects(de(this,So),de(this,Po))},ui=function(t){var r=ut,o=ft,i=Et;gn(de(this,Zt)),pn(de(this,Zt)),Zr(de(this,Zt).ctx);try{return Fr.ensure(),t()}catch(a){return Ws(a),null}finally{gn(r),pn(o),Zr(i)}},Ta=function(t,r){var o;if(!this.has_pending_snippet()){this.parent&&St(o=this.parent,Rt,Ta).call(o,t,r);return}ht(this,ir,de(this,ir)+t),de(this,ir)===0&&(St(this,Rt,di).call(this,r),de(this,on)&&Mr(de(this,on),()=>{ht(this,on,null)}),de(this,Hn)&&(de(this,vn).before(de(this,Hn)),ht(this,Hn,null)))};function nc(e,t,r,o){const i=ro()?Ao:il;var a=e.filter(v=>!v.settled);if(r.length===0&&a.length===0){o(t.map(i));return}var l=ut,s=Gu(),c=a.length===1?a[0].promise:a.length>1?Promise.all(a.map(v=>v.promise)):null;function d(v){s();try{o(v)}catch(b){(l.f&cn)===0&&ar(b,l)}_i()}if(r.length===0){c.then(()=>d(t.map(i)));return}var u=rc();function p(){Promise.all(r.map(v=>Ou(v))).then(v=>d([...t.map(i),...v])).catch(v=>ar(v,l)).finally(()=>u())}c?c.then(()=>{s(),p(),_i()}):p()}function Gu(){var e=ut,t=ft,r=Et,o=rt;return function(a=!0){gn(e),pn(t),Zr(r),a&&(e.f&cn)===0&&(o==null||o.activate(),o==null||o.apply())}}function _i(e=!0){gn(null),pn(null),Zr(null),e&&(rt==null||rt.deactivate())}function rc(){var e=ut,t=e.b,r=rt,o=t.is_rendered();return t.update_pending_count(1,r),r.increment(o,e),(i=!1)=>{t.update_pending_count(-1,r),r.decrement(o,e,i)}}function Ao(e){var t=Bt|Ut,r=ft!==null&&(ft.f&Bt)!==0?ft:null;return ut!==null&&(ut.f|=to),{ctx:Et,deps:null,effects:null,equals:Ys,f:t,fn:e,reactions:null,rv:0,v:Ot,wv:0,parent:r??ut,ac:null}}function Ou(e,t,r){let o=ut;o===null&&Qd();var i=void 0,a=vr(Ot),l=!ft,s=new Map;return Qu(()=>{var b;var c=ut,d=Ls();i=d.promise;try{Promise.resolve(e()).then(d.resolve,d.reject).finally(_i)}catch(g){d.reject(g),_i()}var u=rt;if(l){if((c.f&Ir)!==0)var p=rc();if(o.b.is_rendered())(b=s.get(u))==null||b.reject(qn),s.delete(u);else{for(const g of s.values())g.reject(qn);s.clear()}s.set(u,d)}const v=(g,_=void 0)=>{if(p){var y=_===qn;p(y)}if(!(_===qn||(c.f&cn)!==0)){if(u.activate(),_)a.f|=cr,Jr(a,_);else{(a.f&cr)!==0&&(a.f^=cr),Jr(a,g);for(const[S,T]of s){if(s.delete(S),S===u)break;T.reject(qn)}}u.deactivate()}};d.promise.then(v,g=>v(null,g||"unknown"))}),No(()=>{for(const c of s.values())c.reject(qn)}),new Promise(c=>{function d(u){function p(){u===i?c(a):d(i)}u.then(p,p)}d(i)})}function P(e){const t=Ao(e);return xc(t),t}function il(e){const t=Ao(e);return t.equals=Hs,t}function Bu(e){var t=e.effects;if(t!==null){e.effects=null;for(var r=0;r<t.length;r+=1)Wt(t[r])}}function qu(e){for(var t=e.parent;t!==null;){if((t.f&Bt)===0)return(t.f&cn)===0?t:null;t=t.parent}return null}function al(e){var t,r=ut;gn(qu(e));try{e.f&=~Er,Bu(e),t=zc(e)}finally{gn(r)}return t}function oc(e){var t=e.v,r=al(e);if(!e.equals(r)&&(e.wv=kc(),(!(rt!=null&&rt.is_fork)||e.deps===null)&&(e.v=r,rt==null||rt.capture(e,t,!0),e.deps===null))){At(e,Lt);return}fr||(Ht!==null?(cl()||rt!=null&&rt.is_fork)&&Ht.set(e,r):tl(e))}function Yu(e){var t,r;if(e.effects!==null)for(const o of e.effects)(o.teardown||o.ac)&&((t=o.teardown)==null||t.call(o),(r=o.ac)==null||r.abort(qn),o.teardown=Wn,o.ac=null,yo(o,0),ul(o))}function ic(e){if(e.effects!==null)for(const t of e.effects)t.teardown&&Qr(t)}let Ea=new Set;const dr=new Map;let ac=!1;function vr(e,t){var r={f:0,v:e,reactions:null,equals:Ys,rv:0,wv:0};return r}function ae(e,t){const r=vr(e);return xc(r),r}function lc(e,t=!1,r=!0){var i;const o=vr(e);return t||(o.equals=Hs),no&&r&&Et!==null&&Et.l!==null&&((i=Et.l).s??(i.s=[])).push(o),o}function w(e,t,r=!1){ft!==null&&(!xn||(ft.f&wa)!==0)&&ro()&&(ft.f&(Bt|Kn|Mi|wa))!==0&&(hn===null||!Vr.call(hn,e))&&su();let o=r?zt(t):t;return Jr(e,o,li)}function Jr(e,t,r=null){if(!e.equals(t)){var o=e.v;fr?dr.set(e,t):dr.set(e,o),e.v=t;var i=Fr.ensure();if(i.capture(e,o),(e.f&Bt)!==0){const a=e;(e.f&Ut)!==0&&al(a),Ht===null&&tl(a)}e.wv=kc(),sc(e,Ut,r),ro()&&ut!==null&&(ut.f&Lt)!==0&&(ut.f&(kn|Tr))===0&&(un===null?tv([e]):un.push(e)),!i.is_fork&&Ea.size>0&&!ac&&Xu()}return t}function Xu(){ac=!1;for(const e of Ea)(e.f&Lt)!==0&&At(e,Ln),Lo(e)&&Qr(e);Ea.clear()}function Fa(e,t=1){var r=n(e),o=t===1?r++:r--;return w(e,r),o}function go(e){w(e,e.v+1)}function sc(e,t,r){var o=e.reactions;if(o!==null)for(var i=ro(),a=o.length,l=0;l<a;l++){var s=o[l],c=s.f;if(!(!i&&s===ut)){var d=(c&Ut)===0;if(d&&At(s,t),(c&Bt)!==0){var u=s;Ht==null||Ht.delete(u),(c&Er)===0&&(c&fn&&(s.f|=Er),sc(u,Ln,r))}else if(d){var p=s;(c&Kn)!==0&&_n!==null&&_n.add(p),r!==null?r.push(p):ol(p)}}}}function zt(e){if(typeof e!="object"||e===null||jn in e)return e;const t=Ja(e);if(t!==Ud&&t!==Wd)return e;var r=new Map,o=Za(e),i=ae(0),a=Sr,l=s=>{if(Sr===a)return s();var c=ft,d=Sr;pn(null),Wl(a);var u=s();return pn(c),Wl(d),u};return o&&r.set("length",ae(e.length)),new Proxy(e,{defineProperty(s,c,d){(!("value"in d)||d.configurable===!1||d.enumerable===!1||d.writable===!1)&&au();var u=r.get(c);return u===void 0?l(()=>{var p=ae(d.value);return r.set(c,p),p}):w(u,d.value,!0),!0},deleteProperty(s,c){var d=r.get(c);if(d===void 0){if(c in s){const u=l(()=>ae(Ot));r.set(c,u),go(i)}}else w(d,Ot),go(i);return!0},get(s,c,d){var b;if(c===jn)return e;var u=r.get(c),p=c in s;if(u===void 0&&(!p||(b=sr(s,c))!=null&&b.writable)&&(u=l(()=>{var g=zt(p?s[c]:Ot),_=ae(g);return _}),r.set(c,u)),u!==void 0){var v=n(u);return v===Ot?void 0:v}return Reflect.get(s,c,d)},getOwnPropertyDescriptor(s,c){var d=Reflect.getOwnPropertyDescriptor(s,c);if(d&&"value"in d){var u=r.get(c);u&&(d.value=n(u))}else if(d===void 0){var p=r.get(c),v=p==null?void 0:p.v;if(p!==void 0&&v!==Ot)return{enumerable:!0,configurable:!0,value:v,writable:!0}}return d},has(s,c){var v;if(c===jn)return!0;var d=r.get(c),u=d!==void 0&&d.v!==Ot||Reflect.has(s,c);if(d!==void 0||ut!==null&&(!u||(v=sr(s,c))!=null&&v.writable)){d===void 0&&(d=l(()=>{var b=u?zt(s[c]):Ot,g=ae(b);return g}),r.set(c,d));var p=n(d);if(p===Ot)return!1}return u},set(s,c,d,u){var I;var p=r.get(c),v=c in s;if(o&&c==="length")for(var b=d;b<p.v;b+=1){var g=r.get(b+"");g!==void 0?w(g,Ot):b in s&&(g=l(()=>ae(Ot)),r.set(b+"",g))}if(p===void 0)(!v||(I=sr(s,c))!=null&&I.writable)&&(p=l(()=>ae(void 0)),w(p,zt(d)),r.set(c,p));else{v=p.v!==Ot;var _=l(()=>zt(d));w(p,_)}var y=Reflect.getOwnPropertyDescriptor(s,c);if(y!=null&&y.set&&y.set.call(u,d),!v){if(o&&typeof c=="string"){var S=r.get("length"),T=Number(c);Number.isInteger(T)&&T>=S.v&&w(S,T+1)}go(i)}return!0},ownKeys(s){n(i);var c=Reflect.ownKeys(s).filter(p=>{var v=r.get(p);return v===void 0||v.v!==Ot});for(var[d,u]of r)u.v!==Ot&&!(d in s)&&c.push(d);return c},setPrototypeOf(){lu()}})}function Xl(e){try{if(e!==null&&typeof e=="object"&&jn in e)return e[jn]}catch{}return e}function Hu(e,t){return Object.is(Xl(e),Xl(t))}var Rn,cc,dc,uc;function Uu(){if(Rn===void 0){Rn=window,cc=/Firefox/.test(navigator.userAgent);var e=Element.prototype,t=Node.prototype,r=Text.prototype;dc=sr(t,"firstChild").get,uc=sr(t,"nextSibling").get,Bl(e)&&(e.__click=void 0,e.__className=void 0,e.__attributes=null,e.__style=void 0,e.__e=void 0),Bl(r)&&(r.__t=void 0)}}function Nn(e=""){return document.createTextNode(e)}function An(e){return dc.call(e)}function jo(e){return uc.call(e)}function h(e,t){return An(e)}function W(e,t=!1){{var r=An(e);return r instanceof Comment&&r.data===""?jo(r):r}}function f(e,t=1,r=!1){let o=e;for(;t--;)o=jo(o);return o}function Wu(e){e.textContent=""}function vc(){return!1}function ll(e,t,r){return document.createElementNS(t??Bs,e,void 0)}function sl(e,t){if(t){const r=document.body;e.autofocus=!0,Vn(()=>{document.activeElement===r&&e.focus()})}}let Hl=!1;function Vu(){Hl||(Hl=!0,document.addEventListener("reset",e=>{Promise.resolve().then(()=>{var t;if(!e.defaultPrevented)for(const r of e.target.elements)(t=r.__on_r)==null||t.call(r)})},{capture:!0}))}function Si(e){var t=ft,r=ut;pn(null),gn(null);try{return e()}finally{pn(t),gn(r)}}function fc(e,t,r,o=r){e.addEventListener(t,()=>Si(r));const i=e.__on_r;i?e.__on_r=()=>{i(),o(!0)}:e.__on_r=()=>o(!0),Vu()}function hc(e){ut===null&&(ft===null&&ru(),nu()),fr&&tu()}function Ku(e,t){var r=t.last;r===null?t.last=t.first=e:(r.next=e,e.prev=r,t.last=e)}function Cn(e,t){var r=ut;r!==null&&(r.f&tn)!==0&&(e|=tn);var o={ctx:Et,deps:null,nodes:null,f:e|Ut|fn,first:null,fn:t,last:null,next:null,parent:r,b:r&&r.b,prev:null,teardown:null,wv:0,ac:null};rt==null||rt.register_created_effect(o);var i=o;if((e&Kr)!==0)Or!==null?Or.push(o):Fr.ensure().schedule(o);else if(t!==null){try{Qr(o)}catch(l){throw Wt(o),l}i.deps===null&&i.teardown===null&&i.nodes===null&&i.first===i.last&&(i.f&to)===0&&(i=i.first,(e&Kn)!==0&&(e&Zn)!==0&&i!==null&&(i.f|=Zn))}if(i!==null&&(i.parent=r,r!==null&&Ku(i,r),ft!==null&&(ft.f&Bt)!==0&&(e&Tr)===0)){var a=ft;(a.effects??(a.effects=[])).push(i)}return o}function cl(){return ft!==null&&!xn}function No(e){const t=Cn(Fo,null);return At(t,Lt),t.teardown=e,t}function Pt(e){hc();var t=ut.f,r=!ft&&(t&kn)!==0&&(t&Ir)===0;if(r){var o=Et;(o.e??(o.e=[])).push(e)}else return pc(e)}function pc(e){return Cn(Kr|Rs,e)}function Zu(e){return hc(),Cn(Fo|Rs,e)}function Ju(e){Fr.ensure();const t=Cn(Tr|to,e);return(r={})=>new Promise(o=>{r.outro?Mr(t,()=>{Wt(t),o(void 0)}):(Wt(t),o(void 0))})}function Pi(e){return Cn(Kr,e)}function Qu(e){return Cn(Mi|to,e)}function dl(e,t=0){return Cn(Fo|t,e)}function te(e,t=[],r=[],o=[]){nc(o,t,r,i=>{Cn(Fo,()=>e(...i.map(n)))})}function Ar(e,t=0){var r=Cn(Kn|t,e);return r}function gc(e,t=0){var r=Cn(Qa|t,e);return r}function Qt(e){return Cn(kn|to,e)}function bc(e){var t=e.teardown;if(t!==null){const r=fr,o=ft;Ul(!0),pn(null);try{t.call(null)}finally{Ul(r),pn(o)}}}function ul(e,t=!1){var r=e.first;for(e.first=e.last=null;r!==null;){const i=r.ac;i!==null&&Si(()=>{i.abort(qn)});var o=r.next;(r.f&Tr)!==0?r.parent=null:Wt(r,t),r=o}}function ev(e){for(var t=e.first;t!==null;){var r=t.next;(t.f&kn)===0&&Wt(t),t=r}}function Wt(e,t=!0){var r=!1;(t||(e.f&Kd)!==0)&&e.nodes!==null&&e.nodes.end!==null&&(mc(e.nodes.start,e.nodes.end),r=!0),At(e,xa),ul(e,t&&!r),yo(e,0);var o=e.nodes&&e.nodes.t;if(o!==null)for(const a of o)a.stop();bc(e),e.f^=xa,e.f|=cn;var i=e.parent;i!==null&&i.first!==null&&_c(e),e.next=e.prev=e.teardown=e.ctx=e.deps=e.fn=e.nodes=e.ac=e.b=null}function mc(e,t){for(;e!==null;){var r=e===t?null:jo(e);e.remove(),e=r}}function _c(e){var t=e.parent,r=e.prev,o=e.next;r!==null&&(r.next=o),o!==null&&(o.prev=r),t!==null&&(t.first===e&&(t.first=o),t.last===e&&(t.last=r))}function Mr(e,t,r=!0){var o=[];yc(e,o,!0);var i=()=>{r&&Wt(e),t&&t()},a=o.length;if(a>0){var l=()=>--a||i();for(var s of o)s.out(l)}else i()}function yc(e,t,r){if((e.f&tn)===0){e.f^=tn;var o=e.nodes&&e.nodes.t;if(o!==null)for(const s of o)(s.is_global||r)&&t.push(s);for(var i=e.first;i!==null;){var a=i.next,l=(i.f&Zn)!==0||(i.f&kn)!==0&&(e.f&Kn)!==0;yc(i,t,l?r:!1),i=a}}}function vl(e){$c(e,!0)}function $c(e,t){if((e.f&tn)!==0){e.f^=tn,(e.f&Lt)===0&&(At(e,Ut),Fr.ensure().schedule(e));for(var r=e.first;r!==null;){var o=r.next,i=(r.f&Zn)!==0||(r.f&kn)!==0;$c(r,i?t:!1),r=o}var a=e.nodes&&e.nodes.t;if(a!==null)for(const l of a)(l.is_global||t)&&l.in()}}function fl(e,t){if(e.nodes)for(var r=e.nodes.start,o=e.nodes.end;r!==null;){var i=r===o?null:jo(r);t.append(r),r=i}}let vi=!1,fr=!1;function Ul(e){fr=e}let ft=null,xn=!1;function pn(e){ft=e}let ut=null;function gn(e){ut=e}let hn=null;function xc(e){ft!==null&&(hn===null?hn=[e]:hn.push(e))}let Jt=null,nn=0,un=null;function tv(e){un=e}let wc=1,yr=0,Sr=yr;function Wl(e){Sr=e}function kc(){return++wc}function Lo(e){var t=e.f;if((t&Ut)!==0)return!0;if(t&Bt&&(e.f&=~Er),(t&Ln)!==0){for(var r=e.deps,o=r.length,i=0;i<o;i++){var a=r[i];if(Lo(a)&&oc(a),a.wv>e.wv)return!0}(t&fn)!==0&&Ht===null&&At(e,Lt)}return!1}function Cc(e,t,r=!0){var o=e.reactions;if(o!==null&&!(hn!==null&&Vr.call(hn,e)))for(var i=0;i<o.length;i++){var a=o[i];(a.f&Bt)!==0?Cc(a,t,!1):t===a&&(r?At(a,Ut):(a.f&Lt)!==0&&At(a,Ln),ol(a))}}function zc(e){var _;var t=Jt,r=nn,o=un,i=ft,a=hn,l=Et,s=xn,c=Sr,d=e.f;Jt=null,nn=0,un=null,ft=(d&(kn|Tr))===0?e:null,hn=null,Zr(e.ctx),xn=!1,Sr=++yr,e.ac!==null&&(Si(()=>{e.ac.abort(qn)}),e.ac=null);try{e.f|=ka;var u=e.fn,p=u();e.f|=Ir;var v=e.deps,b=rt==null?void 0:rt.is_fork;if(Jt!==null){var g;if(b||yo(e,nn),v!==null&&nn>0)for(v.length=nn+Jt.length,g=0;g<Jt.length;g++)v[nn+g]=Jt[g];else e.deps=v=Jt;if(cl()&&(e.f&fn)!==0)for(g=nn;g<v.length;g++)((_=v[g]).reactions??(_.reactions=[])).push(e)}else!b&&v!==null&&nn<v.length&&(yo(e,nn),v.length=nn);if(ro()&&un!==null&&!xn&&v!==null&&(e.f&(Bt|Ln|Ut))===0)for(g=0;g<un.length;g++)Cc(un[g],e);if(i!==null&&i!==e){if(yr++,i.deps!==null)for(let y=0;y<r;y+=1)i.deps[y].rv=yr;if(t!==null)for(const y of t)y.rv=yr;un!==null&&(o===null?o=un:o.push(...un))}return(e.f&cr)!==0&&(e.f^=cr),p}catch(y){return Ws(y)}finally{e.f^=ka,Jt=t,nn=r,un=o,ft=i,hn=a,Zr(l),xn=s,Sr=c}}function nv(e,t){let r=t.reactions;if(r!==null){var o=Hd.call(r,e);if(o!==-1){var i=r.length-1;i===0?r=t.reactions=null:(r[o]=r[i],r.pop())}}if(r===null&&(t.f&Bt)!==0&&(Jt===null||!Vr.call(Jt,t))){var a=t;(a.f&fn)!==0&&(a.f^=fn,a.f&=~Er),tl(a),Yu(a),yo(a,0)}}function yo(e,t){var r=e.deps;if(r!==null)for(var o=t;o<r.length;o++)nv(e,r[o])}function Qr(e){var t=e.f;if((t&cn)===0){At(e,Lt);var r=ut,o=vi;ut=e,vi=!0;try{(t&(Kn|Qa))!==0?ev(e):ul(e),bc(e);var i=zc(e);e.teardown=typeof i=="function"?i:null,e.wv=wc;var a;Xd&&ku&&(e.f&Ut)!==0&&e.deps}finally{vi=o,ut=r}}}async function rv(){await Promise.resolve(),Eu()}function n(e){var t=e.f,r=(t&Bt)!==0;if(ft!==null&&!xn){var o=ut!==null&&(ut.f&cn)!==0;if(!o&&(hn===null||!Vr.call(hn,e))){var i=ft.deps;if((ft.f&ka)!==0)e.rv<yr&&(e.rv=yr,Jt===null&&i!==null&&i[nn]===e?nn++:Jt===null?Jt=[e]:Jt.push(e));else{(ft.deps??(ft.deps=[])).push(e);var a=e.reactions;a===null?e.reactions=[ft]:Vr.call(a,ft)||a.push(ft)}}}if(fr&&dr.has(e))return dr.get(e);if(r){var l=e;if(fr){var s=l.v;return((l.f&Lt)===0&&l.reactions!==null||Sc(l))&&(s=al(l)),dr.set(l,s),s}var c=(l.f&fn)===0&&!xn&&ft!==null&&(vi||(ft.f&fn)!==0),d=(l.f&Ir)===0;Lo(l)&&(c&&(l.f|=fn),oc(l)),c&&!d&&(ic(l),Mc(l))}if(Ht!=null&&Ht.has(e))return Ht.get(e);if((e.f&cr)!==0)throw e.v;return e.v}function Mc(e){if(e.f|=fn,e.deps!==null)for(const t of e.deps)(t.reactions??(t.reactions=[])).push(e),(t.f&Bt)!==0&&(t.f&fn)===0&&(ic(t),Mc(t))}function Sc(e){if(e.v===Ot)return!0;if(e.deps===null)return!1;for(const t of e.deps)if(dr.has(t)||(t.f&Bt)!==0&&Sc(t))return!0;return!1}function Jn(e){var t=xn;try{return xn=!0,e()}finally{xn=t}}function mr(e){if(!(typeof e!="object"||!e||e instanceof EventTarget)){if(jn in e)Ia(e);else if(!Array.isArray(e))for(let t in e){const r=e[t];typeof r=="object"&&r&&jn in r&&Ia(r)}}}function Ia(e,t=new Set){if(typeof e=="object"&&e!==null&&!(e instanceof EventTarget)&&!t.has(e)){t.add(e),e instanceof Date&&e.getTime();for(let o in e)try{Ia(e[o],t)}catch{}const r=Ja(e);if(r!==Object.prototype&&r!==Array.prototype&&r!==Map.prototype&&r!==Set.prototype&&r!==Date.prototype){const o=Ns(r);for(let i in o){const a=o[i].get;if(a)try{a.call(e)}catch{}}}}}function ov(e){return e.endsWith("capture")&&e!=="gotpointercapture"&&e!=="lostpointercapture"}const iv=["beforeinput","click","change","dblclick","contextmenu","focusin","focusout","input","keydown","keyup","mousedown","mousemove","mouseout","mouseover","mouseup","pointerdown","pointermove","pointerout","pointerover","pointerup","touchend","touchmove","touchstart"];function av(e){return iv.includes(e)}const lv={formnovalidate:"formNoValidate",ismap:"isMap",nomodule:"noModule",playsinline:"playsInline",readonly:"readOnly",defaultvalue:"defaultValue",defaultchecked:"defaultChecked",srcobject:"srcObject",novalidate:"noValidate",allowfullscreen:"allowFullscreen",disablepictureinpicture:"disablePictureInPicture",disableremoteplayback:"disableRemotePlayback"};function sv(e){return e=e.toLowerCase(),lv[e]??e}const cv=["touchstart","touchmove"];function dv(e){return cv.includes(e)}const $r=Symbol("events"),Pc=new Set,Aa=new Set;function Tc(e,t,r,o={}){function i(a){if(o.capture||ja.call(t,a),!a.cancelBubble)return Si(()=>r==null?void 0:r.call(this,a))}return e.startsWith("pointer")||e.startsWith("touch")||e==="wheel"?Vn(()=>{t.addEventListener(e,i,o)}):t.addEventListener(e,i,o),i}function Qe(e,t,r,o,i){var a={capture:o,passive:i},l=Tc(e,t,r,a);(t===document.body||t===window||t===document||t instanceof HTMLMediaElement)&&No(()=>{t.removeEventListener(e,l,a)})}function z(e,t,r){(t[$r]??(t[$r]={}))[e]=r}function tt(e){for(var t=0;t<e.length;t++)Pc.add(e[t]);for(var r of Aa)r(e)}let Vl=null;function ja(e){var y,S;var t=this,r=t.ownerDocument,o=e.type,i=((y=e.composedPath)==null?void 0:y.call(e))||[],a=i[0]||e.target;Vl=e;var l=0,s=Vl===e&&e[$r];if(s){var c=i.indexOf(s);if(c!==-1&&(t===document||t===window)){e[$r]=t;return}var d=i.indexOf(t);if(d===-1)return;c<=d&&(l=c)}if(a=i[l]||e.target,a!==t){js(e,"currentTarget",{configurable:!0,get(){return a||r}});var u=ft,p=ut;pn(null),gn(null);try{for(var v,b=[];a!==null;){var g=a.assignedSlot||a.parentNode||a.host||null;try{var _=(S=a[$r])==null?void 0:S[o];_!=null&&(!a.disabled||e.target===a)&&_.call(a,e)}catch(T){v?b.push(T):v=T}if(e.cancelBubble||g===t||g===null)break;a=g}if(v){for(let T of b)queueMicrotask(()=>{throw T});throw v}}finally{e[$r]=t,delete e.currentTarget,pn(u),gn(p)}}}var Is;const Wi=((Is=globalThis==null?void 0:globalThis.window)==null?void 0:Is.trustedTypes)&&globalThis.window.trustedTypes.createPolicy("svelte-trusted-html",{createHTML:e=>e});function uv(e){return(Wi==null?void 0:Wi.createHTML(e))??e}function Ec(e){var t=ll("template");return t.innerHTML=uv(e.replaceAll("<!>","<!---->")),t.content}function hr(e,t){var r=ut;r.nodes===null&&(r.nodes={start:e,end:t,a:null,t:null})}function G(e,t){var r=(t&mu)!==0,o=(t&_u)!==0,i,a=!e.startsWith("<!>");return()=>{i===void 0&&(i=Ec(a?e:"<!>"+e),r||(i=An(i)));var l=o||cc?document.importNode(i,!0):i.cloneNode(!0);if(r){var s=An(l),c=l.lastChild;hr(s,c)}else hr(l,l);return l}}function vv(e,t,r="svg"){var o=!e.startsWith("<!>"),i=`<${r}>${o?e:"<!>"+e}</${r}>`,a;return()=>{if(!a){var l=Ec(i),s=An(l);a=An(s)}var c=a.cloneNode(!0);return hr(c,c),c}}function $t(e,t){return vv(e,t,"svg")}function fv(e=""){{var t=Nn(e+"");return hr(t,t),t}}function ue(){var e=document.createDocumentFragment(),t=document.createComment(""),r=Nn();return e.append(t,r),hr(t,r),e}function m(e,t){e!==null&&e.before(t)}function Re(e,t){var r=t==null?"":typeof t=="object"?`${t}`:t;r!==(e.__t??(e.__t=e.nodeValue))&&(e.__t=r,e.nodeValue=`${r}`)}function hv(e,t){return pv(e,t)}const Jo=new Map;function pv(e,{target:t,anchor:r,props:o={},events:i,context:a,intro:l=!0,transformError:s}){Uu();var c=void 0,d=Ju(()=>{var u=r??t.appendChild(Nn());ju(u,{pending:()=>{}},b=>{Ve({});var g=Et;a&&(g.c=a),i&&(o.$$events=i),c=e(b,o)||{},Ke()},s);var p=new Set,v=b=>{for(var g=0;g<b.length;g++){var _=b[g];if(!p.has(_)){p.add(_);var y=dv(_);for(const I of[t,document]){var S=Jo.get(I);S===void 0&&(S=new Map,Jo.set(I,S));var T=S.get(_);T===void 0?(I.addEventListener(_,ja,{passive:y}),S.set(_,1)):S.set(_,T+1)}}}};return v(Ci(Pc)),Aa.add(v),()=>{var y;for(var b of p)for(const S of[t,document]){var g=Jo.get(S),_=g.get(b);--_==0?(S.removeEventListener(b,ja),g.delete(b),g.size===0&&Jo.delete(S)):g.set(b,_)}Aa.delete(v),u!==r&&((y=u.parentNode)==null||y.removeChild(u))}});return gv.set(c,d),c}let gv=new WeakMap;var $n,Fn,an,zr,To,Eo,ki;class Ro{constructor(t,r=!0){mn(this,"anchor");vt(this,$n,new Map);vt(this,Fn,new Map);vt(this,an,new Map);vt(this,zr,new Set);vt(this,To,!0);vt(this,Eo,t=>{if(de(this,$n).has(t)){var r=de(this,$n).get(t),o=de(this,Fn).get(r);if(o)vl(o),de(this,zr).delete(r);else{var i=de(this,an).get(r);i&&(de(this,Fn).set(r,i.effect),de(this,an).delete(r),i.fragment.lastChild.remove(),this.anchor.before(i.fragment),o=i.effect)}for(const[a,l]of de(this,$n)){if(de(this,$n).delete(a),a===t)break;const s=de(this,an).get(l);s&&(Wt(s.effect),de(this,an).delete(l))}for(const[a,l]of de(this,Fn)){if(a===r||de(this,zr).has(a))continue;const s=()=>{if(Array.from(de(this,$n).values()).includes(a)){var d=document.createDocumentFragment();fl(l,d),d.append(Nn()),de(this,an).set(a,{effect:l,fragment:d})}else Wt(l);de(this,zr).delete(a),de(this,Fn).delete(a)};de(this,To)||!o?(de(this,zr).add(a),Mr(l,s,!1)):s()}}});vt(this,ki,t=>{de(this,$n).delete(t);const r=Array.from(de(this,$n).values());for(const[o,i]of de(this,an))r.includes(o)||(Wt(i.effect),de(this,an).delete(o))});this.anchor=t,ht(this,To,r)}ensure(t,r){var o=rt,i=vc();if(r&&!de(this,Fn).has(t)&&!de(this,an).has(t))if(i){var a=document.createDocumentFragment(),l=Nn();a.append(l),de(this,an).set(t,{effect:Qt(()=>r(l)),fragment:a})}else de(this,Fn).set(t,Qt(()=>r(this.anchor)));if(de(this,$n).set(o,t),i){for(const[s,c]of de(this,Fn))s===t?o.unskip_effect(c):o.skip_effect(c);for(const[s,c]of de(this,an))s===t?o.unskip_effect(c.effect):o.skip_effect(c.effect);o.oncommit(de(this,Eo)),o.ondiscard(de(this,ki))}else de(this,Eo).call(this,o)}}$n=new WeakMap,Fn=new WeakMap,an=new WeakMap,zr=new WeakMap,To=new WeakMap,Eo=new WeakMap,ki=new WeakMap;function xe(e,t,r=!1){var o=new Ro(e),i=r?Zn:0;function a(l,s){o.ensure(l,s)}Ar(()=>{var l=!1;t((s,c=0)=>{l=!0,a(c,s)}),l||a(-1,null)},i)}const bv=Symbol("NaN");function mv(e,t,r){var o=new Ro(e),i=!ro();Ar(()=>{var a=t();a!==a&&(a=bv),i&&a!==null&&typeof a=="object"&&(a={}),o.ensure(a,r)})}function at(e,t){return t}function _v(e,t,r){for(var o=[],i=t.length,a,l=t.length,s=0;s<i;s++){let p=t[s];Mr(p,()=>{if(a){if(a.pending.delete(p),a.done.add(p),a.pending.size===0){var v=e.outrogroups;Na(e,Ci(a.done)),v.delete(a),v.size===0&&(e.outrogroups=null)}}else l-=1},!1)}if(l===0){var c=o.length===0&&r!==null;if(c){var d=r,u=d.parentNode;Wu(u),u.append(d),e.items.clear()}Na(e,t,!c)}else a={pending:new Set(t),done:new Set},(e.outrogroups??(e.outrogroups=new Set)).add(a)}function Na(e,t,r=!0){var o;if(e.pending.size>0){o=new Set;for(const l of e.pending.values())for(const s of l)o.add(e.items.get(s).e)}for(var i=0;i<t.length;i++){var a=t[i];if(o!=null&&o.has(a)){a.f|=In;const l=document.createDocumentFragment();fl(a,l)}else Wt(t[i],r)}}var Kl;function Xe(e,t,r,o,i,a=null){var l=e,s=new Map,c=(t&Gs)!==0;if(c){var d=e;l=d.appendChild(Nn())}var u=null,p=il(()=>{var I=r();return Za(I)?I:I==null?[]:Ci(I)}),v,b=new Map,g=!0;function _(I){(T.effect.f&cn)===0&&(T.pending.delete(I),T.fallback=u,yv(T,v,l,t,o),u!==null&&(v.length===0?(u.f&In)===0?vl(u):(u.f^=In,fo(u,null,l)):Mr(u,()=>{u=null})))}function y(I){T.pending.delete(I)}var S=Ar(()=>{v=n(p);for(var I=v.length,$=new Set,x=rt,D=vc(),j=0;j<I;j+=1){var R=v[j],k=o(R,j),M=g?null:s.get(k);M?(M.v&&Jr(M.v,R),M.i&&Jr(M.i,j),D&&x.unskip_effect(M.e)):(M=$v(s,g?l:Kl??(Kl=Nn()),R,k,j,i,t,r),g||(M.e.f|=In),s.set(k,M)),$.add(k)}if(I===0&&a&&!u&&(g?u=Qt(()=>a(l)):(u=Qt(()=>a(Kl??(Kl=Nn()))),u.f|=In)),I>$.size&&eu(),!g)if(b.set(x,$),D){for(const[L,F]of s)$.has(L)||x.skip_effect(F.e);x.oncommit(_),x.ondiscard(y)}else _(x);n(p)}),T={effect:S,items:s,pending:b,outrogroups:null,fallback:u};g=!1}function so(e){for(;e!==null&&(e.f&kn)===0;)e=e.next;return e}function yv(e,t,r,o,i){var M,L,F,Y,q,oe,ee,Z,N;var a=(o&vu)!==0,l=t.length,s=e.items,c=so(e.effect.first),d,u=null,p,v=[],b=[],g,_,y,S;if(a)for(S=0;S<l;S+=1)g=t[S],_=i(g,S),y=s.get(_).e,(y.f&In)===0&&((L=(M=y.nodes)==null?void 0:M.a)==null||L.measure(),(p??(p=new Set)).add(y));for(S=0;S<l;S+=1){if(g=t[S],_=i(g,S),y=s.get(_).e,e.outrogroups!==null)for(const C of e.outrogroups)C.pending.delete(y),C.done.delete(y);if((y.f&tn)!==0&&(vl(y),a&&((Y=(F=y.nodes)==null?void 0:F.a)==null||Y.unfix(),(p??(p=new Set)).delete(y))),(y.f&In)!==0)if(y.f^=In,y===c)fo(y,null,r);else{var T=u?u.next:c;y===e.effect.last&&(e.effect.last=y.prev),y.prev&&(y.prev.next=y.next),y.next&&(y.next.prev=y.prev),nr(e,u,y),nr(e,y,T),fo(y,T,r),u=y,v=[],b=[],c=so(u.next);continue}if(y!==c){if(d!==void 0&&d.has(y)){if(v.length<b.length){var I=b[0],$;u=I.prev;var x=v[0],D=v[v.length-1];for($=0;$<v.length;$+=1)fo(v[$],I,r);for($=0;$<b.length;$+=1)d.delete(b[$]);nr(e,x.prev,D.next),nr(e,u,x),nr(e,D,I),c=I,u=D,S-=1,v=[],b=[]}else d.delete(y),fo(y,c,r),nr(e,y.prev,y.next),nr(e,y,u===null?e.effect.first:u.next),nr(e,u,y),u=y;continue}for(v=[],b=[];c!==null&&c!==y;)(d??(d=new Set)).add(c),b.push(c),c=so(c.next);if(c===null)continue}(y.f&In)===0&&v.push(y),u=y,c=so(y.next)}if(e.outrogroups!==null){for(const C of e.outrogroups)C.pending.size===0&&(Na(e,Ci(C.done)),(q=e.outrogroups)==null||q.delete(C));e.outrogroups.size===0&&(e.outrogroups=null)}if(c!==null||d!==void 0){var j=[];if(d!==void 0)for(y of d)(y.f&tn)===0&&j.push(y);for(;c!==null;)(c.f&tn)===0&&c!==e.fallback&&j.push(c),c=so(c.next);var R=j.length;if(R>0){var k=(o&Gs)!==0&&l===0?r:null;if(a){for(S=0;S<R;S+=1)(ee=(oe=j[S].nodes)==null?void 0:oe.a)==null||ee.measure();for(S=0;S<R;S+=1)(N=(Z=j[S].nodes)==null?void 0:Z.a)==null||N.fix()}_v(e,j,k)}}a&&Vn(()=>{var C,le;if(p!==void 0)for(y of p)(le=(C=y.nodes)==null?void 0:C.a)==null||le.apply()})}function $v(e,t,r,o,i,a,l,s){var c=(l&du)!==0?(l&fu)===0?lc(r,!1,!1):vr(r):null,d=(l&uu)!==0?vr(i):null;return{v:c,i:d,e:Qt(()=>(a(t,c??r,d??i,s),()=>{e.delete(o)}))}}function fo(e,t,r){if(e.nodes)for(var o=e.nodes.start,i=e.nodes.end,a=t&&(t.f&In)===0?t.nodes.start:r;o!==null;){var l=jo(o);if(a.before(o),o===i)return;o=l}}function nr(e,t,r){t===null?e.effect.first=r:t.next=r,r===null?e.effect.last=t:r.prev=t}function xv(e,t,r=!1,o=!1,i=!1,a=!1){var l=e,s="";if(r)var c=e;te(()=>{var d=ut;if(s!==(s=t()??"")){if(r){d.nodes=null,c.innerHTML=s,s!==""&&hr(An(c),c.lastChild);return}if(d.nodes!==null&&(mc(d.nodes.start,d.nodes.end),d.nodes=null),s!==""){var u=o?qs:i?yu:void 0,p=ll(o?"svg":i?"math":"template",u);p.innerHTML=s;var v=o||i?p:p.content;if(hr(An(v),v.lastChild),o||i)for(;An(v);)l.before(An(v));else l.before(v)}}})}function Me(e,t,r,o,i){var s;var a=(s=t.$$slots)==null?void 0:s[r],l=!1;a===!0&&(a=t.children,l=!0),a===void 0||a(e,l?()=>o:o)}function Fc(e,t,...r){var o=new Ro(e);Ar(()=>{const i=t()??null;o.ensure(i,i&&(a=>i(a,...r)))},Zn)}function $o(e,t,r){var o=new Ro(e);Ar(()=>{var i=t()??null;o.ensure(i,i&&(a=>r(a,i)))},Zn)}function wv(e,t,r,o,i,a){var l=null,s=e,c=new Ro(s,!1);Ar(()=>{const d=t()||null;var u=qs;if(d===null){c.ensure(null,null);return}return c.ensure(d,p=>{if(d){if(l=ll(d,u),hr(l,l),o){var v=l.appendChild(Nn());o(l,v)}ut.nodes.end=l,p.before(l)}}),()=>{}},Zn),No(()=>{})}function kv(e,t){var r=void 0,o;gc(()=>{r!==(r=t())&&(o&&(Wt(o),o=null),r&&(o=Qt(()=>{Pi(()=>r(e))})))})}function Ic(e){var t,r,o="";if(typeof e=="string"||typeof e=="number")o+=e;else if(typeof e=="object")if(Array.isArray(e)){var i=e.length;for(t=0;t<i;t++)e[t]&&(r=Ic(e[t]))&&(o&&(o+=" "),o+=r)}else for(r in e)e[r]&&(o&&(o+=" "),o+=r);return o}function Cv(){for(var e,t,r=0,o="",i=arguments.length;r<i;r++)(e=arguments[r])&&(t=Ic(e))&&(o&&(o+=" "),o+=t);return o}function zv(e){return typeof e=="object"?Cv(e):e??""}const Zl=[...` 	
\r\f \v\uFEFF`];function Mv(e,t,r){var o=e==null?"":""+e;if(t&&(o=o?o+" "+t:t),r){for(var i of Object.keys(r))if(r[i])o=o?o+" "+i:i;else if(o.length)for(var a=i.length,l=0;(l=o.indexOf(i,l))>=0;){var s=l+a;(l===0||Zl.includes(o[l-1]))&&(s===o.length||Zl.includes(o[s]))?o=(l===0?"":o.substring(0,l))+o.substring(s+1):l=s}}return o===""?null:o}function Jl(e,t=!1){var r=t?" !important;":";",o="";for(var i of Object.keys(e)){var a=e[i];a!=null&&a!==""&&(o+=" "+i+": "+a+r)}return o}function Vi(e){return e[0]!=="-"||e[1]!=="-"?e.toLowerCase():e}function Sv(e,t){if(t){var r="",o,i;if(Array.isArray(t)?(o=t[0],i=t[1]):o=t,e){e=String(e).replaceAll(/\s*\/\*.*?\*\/\s*/g,"").trim();var a=!1,l=0,s=!1,c=[];o&&c.push(...Object.keys(o).map(Vi)),i&&c.push(...Object.keys(i).map(Vi));var d=0,u=-1;const _=e.length;for(var p=0;p<_;p++){var v=e[p];if(s?v==="/"&&e[p-1]==="*"&&(s=!1):a?a===v&&(a=!1):v==="/"&&e[p+1]==="*"?s=!0:v==='"'||v==="'"?a=v:v==="("?l++:v===")"&&l--,!s&&a===!1&&l===0){if(v===":"&&u===-1)u=p;else if(v===";"||p===_-1){if(u!==-1){var b=Vi(e.substring(d,u).trim());if(!c.includes(b)){v!==";"&&p++;var g=e.substring(d,p).trim();r+=" "+g+";"}}d=p+1,u=-1}}}}return o&&(r+=Jl(o)),i&&(r+=Jl(i,!0)),r=r.trim(),r===""?null:r}return e==null?null:String(e)}function Te(e,t,r,o,i,a){var l=e.__className;if(l!==r||l===void 0){var s=Mv(r,o,a);s==null?e.removeAttribute("class"):t?e.className=s:e.setAttribute("class",s),e.__className=r}else if(a&&i!==a)for(var c in a){var d=!!a[c];(i==null||d!==!!i[c])&&e.classList.toggle(c,d)}return a}function Ki(e,t={},r,o){for(var i in r){var a=r[i];t[i]!==a&&(r[i]==null?e.style.removeProperty(i):e.style.setProperty(i,a,o))}}function Ge(e,t,r,o){var i=e.__style;if(i!==t){var a=Sv(t,o);a==null?e.removeAttribute("style"):e.style.cssText=a,e.__style=t}else o&&(Array.isArray(o)?(Ki(e,r==null?void 0:r[0],o[0]),Ki(e,r==null?void 0:r[1],o[1],"important")):Ki(e,r,o));return o}function Qn(e,t,r=!1){if(e.multiple){if(t==null)return;if(!Za(t))return xu();for(var o of e.options)o.selected=t.includes(bo(o));return}for(o of e.options){var i=bo(o);if(Hu(i,t)){o.selected=!0;return}}(!r||t!==void 0)&&(e.selectedIndex=-1)}function jr(e){var t=new MutationObserver(()=>{Qn(e,e.__value)});t.observe(e,{childList:!0,subtree:!0,attributes:!0,attributeFilter:["value"]}),No(()=>{t.disconnect()})}function qr(e,t,r=t){var o=new WeakSet,i=!0;fc(e,"change",a=>{var l=a?"[selected]":":checked",s;if(e.multiple)s=[].map.call(e.querySelectorAll(l),bo);else{var c=e.querySelector(l)??e.querySelector("option:not([disabled])");s=c&&bo(c)}r(s),e.__value=s,rt!==null&&o.add(rt)}),Pi(()=>{var a=t();if(e===document.activeElement){var l=rt;if(o.has(l))return}if(Qn(e,a,i),i&&a===void 0){var s=e.querySelector(":checked");s!==null&&(a=bo(s),r(a))}e.__value=a,i=!1}),jr(e)}function bo(e){return"__value"in e?e.__value:e.value}const co=Symbol("class"),uo=Symbol("style"),Ac=Symbol("is custom element"),jc=Symbol("is html"),Pv=el?"option":"OPTION",Tv=el?"select":"SELECT",Ev=el?"progress":"PROGRESS";function Ct(e,t){var r=hl(e);r.value===(r.value=t??void 0)||e.value===t&&(t!==0||e.nodeName!==Ev)||(e.value=t??"")}function Fv(e,t){t?e.hasAttribute("selected")||e.setAttribute("selected",""):e.removeAttribute("selected")}function fe(e,t,r,o){var i=hl(e);i[t]!==(i[t]=r)&&(t==="loading"&&(e[Zd]=r),r==null?e.removeAttribute(t):typeof r!="string"&&Nc(e).includes(t)?e[t]=r:e.setAttribute(t,r))}function Iv(e,t,r,o,i=!1,a=!1){var l=hl(e),s=l[Ac],c=!l[jc],d=t||{},u=e.nodeName===Pv;for(var p in t)p in r||(r[p]=null);r.class?r.class=zv(r.class):r[co]&&(r.class=null),r[uo]&&(r.style??(r.style=null));var v=Nc(e);for(const $ in r){let x=r[$];if(u&&$==="value"&&x==null){e.value=e.__value="",d[$]=x;continue}if($==="class"){var b=e.namespaceURI==="http://www.w3.org/1999/xhtml";Te(e,b,x,o,t==null?void 0:t[co],r[co]),d[$]=x,d[co]=r[co];continue}if($==="style"){Ge(e,x,t==null?void 0:t[uo],r[uo]),d[$]=x,d[uo]=r[uo];continue}var g=d[$];if(!(x===g&&!(x===void 0&&e.hasAttribute($)))){d[$]=x;var _=$[0]+$[1];if(_!=="$$")if(_==="on"){const D={},j="$$"+$;let R=$.slice(2);var y=av(R);if(ov(R)&&(R=R.slice(0,-7),D.capture=!0),!y&&g){if(x!=null)continue;e.removeEventListener(R,d[j],D),d[j]=null}if(y)z(R,e,x),tt([R]);else if(x!=null){let k=function(M){d[$].call(this,M)};var I=k;d[j]=Tc(R,e,k,D)}}else if($==="style")fe(e,$,x);else if($==="autofocus")sl(e,!!x);else if(!s&&($==="__value"||$==="value"&&x!=null))e.value=e.__value=x;else if($==="selected"&&u)Fv(e,x);else{var S=$;c||(S=sv(S));var T=S==="defaultValue"||S==="defaultChecked";if(x==null&&!s&&!T)if(l[$]=null,S==="value"||S==="checked"){let D=e;const j=t===void 0;if(S==="value"){let R=D.defaultValue;D.removeAttribute(S),D.defaultValue=R,D.value=D.__value=j?R:null}else{let R=D.defaultChecked;D.removeAttribute(S),D.defaultChecked=R,D.checked=j?R:!1}}else e.removeAttribute($);else T||v.includes(S)&&(s||typeof x!="string")?(e[S]=x,S in l&&(l[S]=Ot)):typeof x!="function"&&fe(e,S,x)}}}return d}function Ql(e,t,r=[],o=[],i=[],a,l=!1,s=!1){nc(i,r,o,c=>{var d=void 0,u={},p=e.nodeName===Tv,v=!1;if(gc(()=>{var g=t(...c.map(n)),_=Iv(e,d,g,a,l,s);v&&p&&"value"in g&&Qn(e,g.value);for(let S of Object.getOwnPropertySymbols(u))g[S]||Wt(u[S]);for(let S of Object.getOwnPropertySymbols(g)){var y=g[S];S.description===$u&&(!d||y!==d[S])&&(u[S]&&Wt(u[S]),u[S]=Qt(()=>kv(e,()=>y))),_[S]=y}d=_}),p){var b=e;Pi(()=>{Qn(b,d.value,!0),jr(b)})}v=!0})}function hl(e){return e.__attributes??(e.__attributes={[Ac]:e.nodeName.includes("-"),[jc]:e.namespaceURI===Bs})}var es=new Map;function Nc(e){var t=e.getAttribute("is")||e.nodeName,r=es.get(t);if(r)return r;es.set(t,r=[]);for(var o,i=e,a=Element.prototype;a!==i;){o=Ns(i);for(var l in o)o[l].set&&r.push(l);i=Ja(i)}return r}function ln(e,t,r=t){var o=new WeakSet;fc(e,"input",async i=>{var a=i?e.defaultValue:e.value;if(a=Zi(e)?Ji(a):a,r(a),rt!==null&&o.add(rt),await rv(),a!==(a=t())){var l=e.selectionStart,s=e.selectionEnd,c=e.value.length;if(e.value=a??"",s!==null){var d=e.value.length;l===s&&s===c&&d>c?(e.selectionStart=d,e.selectionEnd=d):(e.selectionStart=l,e.selectionEnd=Math.min(s,d))}}}),Jn(t)==null&&e.value&&(r(Zi(e)?Ji(e.value):e.value),rt!==null&&o.add(rt)),dl(()=>{var i=t();if(e===document.activeElement){var a=rt;if(o.has(a))return}Zi(e)&&i===Ji(e.value)||e.type==="date"&&!i&&!e.value||i!==e.value&&(e.value=i??"")})}function Zi(e){var t=e.type;return t==="number"||t==="range"}function Ji(e){return e===""?null:+e}function ts(e,t){return e===t||(e==null?void 0:e[jn])===t}function Kt(e={},t,r,o){var i=Et.r,a=ut;return Pi(()=>{var l,s;return dl(()=>{l=s,s=[],Jn(()=>{e!==r(...s)&&(t(e,...s),l&&ts(r(...l),e)&&t(null,...l))})}),()=>{let c=a;for(;c!==i&&c.parent!==null&&c.parent.f&xa;)c=c.parent;const d=()=>{s&&ts(r(...s),e)&&t(null,...s)},u=c.teardown;c.teardown=()=>{d(),u==null||u()}}}),e}function Av(e=!1){const t=Et,r=t.l.u;if(!r)return;let o=()=>mr(t.s);if(e){let i=0,a={};const l=Ao(()=>{let s=!1;const c=t.s;for(const d in c)c[d]!==a[d]&&(a[d]=c[d],s=!0);return s&&i++,i});o=()=>n(l)}r.b.length&&Zu(()=>{ns(t,o),mi(r.b)}),Pt(()=>{const i=Jn(()=>r.m.map(Vd));return()=>{for(const a of i)typeof a=="function"&&a()}}),r.a.length&&Pt(()=>{ns(t,o),mi(r.a)})}function ns(e,t){if(e.l.s)for(const r of e.l.s)n(r);t()}const jv={get(e,t){if(!e.exclude.includes(t))return n(e.version),t in e.special?e.special[t]():e.props[t]},set(e,t,r){if(!(t in e.special)){var o=ut;try{gn(e.parent_effect),e.special[t]=K({get[t](){return e.props[t]}},t,Os)}finally{gn(o)}}return e.special[t](r),Fa(e.version),!0},getOwnPropertyDescriptor(e,t){if(!e.exclude.includes(t)&&t in e.props)return{enumerable:!0,configurable:!0,value:e.props[t]}},deleteProperty(e,t){return e.exclude.includes(t)||(e.exclude.push(t),Fa(e.version)),!0},has(e,t){return e.exclude.includes(t)?!1:t in e.props},ownKeys(e){return Reflect.ownKeys(e.props).filter(t=>!e.exclude.includes(t))}};function ze(e,t){return new Proxy({props:e,exclude:t,special:{},version:vr(0),parent_effect:ut},jv)}const Nv={get(e,t){let r=e.props.length;for(;r--;){let o=e.props[r];if(lo(o)&&(o=o()),typeof o=="object"&&o!==null&&t in o)return o[t]}},set(e,t,r){let o=e.props.length;for(;o--;){let i=e.props[o];lo(i)&&(i=i());const a=sr(i,t);if(a&&a.set)return a.set(r),!0}return!1},getOwnPropertyDescriptor(e,t){let r=e.props.length;for(;r--;){let o=e.props[r];if(lo(o)&&(o=o()),typeof o=="object"&&o!==null&&t in o){const i=sr(o,t);return i&&!i.configurable&&(i.configurable=!0),i}}},has(e,t){if(t===jn||t===Ds)return!1;for(let r of e.props)if(lo(r)&&(r=r()),r!=null&&t in r)return!0;return!1},ownKeys(e){const t=[];for(let r of e.props)if(lo(r)&&(r=r()),!!r){for(const o in r)t.includes(o)||t.push(o);for(const o of Object.getOwnPropertySymbols(r))t.includes(o)||t.push(o)}return t}};function Se(...e){return new Proxy({props:e},Nv)}function K(e,t,r,o){var I;var i=!no||(r&pu)!==0,a=(r&gu)!==0,l=(r&bu)!==0,s=o,c=!0,d=()=>(c&&(c=!1,s=l?Jn(o):o),s);let u;if(a){var p=jn in e||Ds in e;u=((I=sr(e,t))==null?void 0:I.set)??(p&&t in e?$=>e[t]=$:void 0)}var v,b=!1;a?[v,b]=Pu(()=>e[t]):v=e[t],v===void 0&&o!==void 0&&(v=d(),u&&(i&&iu(),u(v)));var g;if(i?g=()=>{var $=e[t];return $===void 0?d():(c=!0,$)}:g=()=>{var $=e[t];return $!==void 0&&(s=void 0),$===void 0?s:$},i&&(r&Os)===0)return g;if(u){var _=e.$$legacy;return(function($,x){return arguments.length>0?((!i||!x||_||b)&&u(x?g():$),$):g()})}var y=!1,S=((r&hu)!==0?Ao:il)(()=>(y=!1,g()));a&&n(S);var T=ut;return(function($,x){if(arguments.length>0){const D=x?n(S):i&&a?zt($):$;return w(S,D),y=!0,s!==void 0&&(s=D),$}return fr&&y||(T.f&cn)!==0?S.v:n(S)})}function Lc(e){Et===null&&Jd(),no&&Et.l!==null?Lv(Et).m.push(e):Pt(()=>{const t=Jn(e);if(typeof t=="function")return t})}function Lv(e){var t=e.l;return t.u??(t.u={a:[],b:[],m:[]})}const Rv="5";var As;typeof window<"u"&&((As=window.__svelte??(window.__svelte={})).v??(As.v=new Set)).add(Rv);function qt(){return typeof window<"u"&&window.__JUCE__&&window.__JUCE__.backend}function Dv(){qt()&&window.__JUCE__.backend.emitEvent("closeApplication",{})}function Gv(e,t){if(!qt()){console.warn("[bridge] No JUCE backend — savePanelAs ignored");return}window.__JUCE__.backend.emitEvent("savePanelAs",{panelId:String(e),data:t})}function Ov(e,t,r){if(!qt()){console.warn("[bridge] No JUCE backend — savePanel ignored");return}window.__JUCE__.backend.emitEvent("savePanel",{panelId:String(e),filePath:t,data:r})}function Bv(){if(!qt()){console.warn("[bridge] No JUCE backend — openPanel ignored");return}window.__JUCE__.backend.emitEvent("openPanel",{})}function qv(e){qt()&&window.__JUCE__.backend.emitEvent("openPanelFile",{filePath:e})}function Yv(){qt()&&window.__JUCE__.backend.emitEvent("loadOpenPanels",{})}function Xv(e){qt()&&window.__JUCE__.backend.emitEvent("updateOpenPanels",e)}function rs(e){if(!qt()){console.warn("[bridge] No JUCE backend — browseImage ignored");return}window.__JUCE__.backend.emitEvent("browseImage",{requestId:e})}function Hv(e){if(!qt())return()=>{};const t=window.__JUCE__.backend.addEventListener("imageBrowsed",e);return()=>window.__JUCE__.backend.removeEventListener(t)}function Uv(e){if(!qt()){console.warn("[bridge] No JUCE backend — requestFileInfo ignored");return}window.__JUCE__.backend.emitEvent("requestFileInfo",{filePath:e})}function Wv(e){if(!qt())return()=>{};const t=window.__JUCE__.backend.addEventListener("fileInfo",e);return()=>window.__JUCE__.backend.removeEventListener(t)}function Vv(e,t){if(!qt()){console.warn("[bridge] No JUCE backend — requestFileData ignored");return}window.__JUCE__.backend.emitEvent("requestFileData",{requestId:e,filePath:t})}function Kv(e){if(!qt())return()=>{};const t=window.__JUCE__.backend.addEventListener("fileData",e);return()=>window.__JUCE__.backend.removeEventListener(t)}function Zv(e){if(!qt())return()=>{};const t=window.__JUCE__.backend.addEventListener("panelSaved",e);return()=>window.__JUCE__.backend.removeEventListener(t)}function Jv(e){if(!qt())return()=>{};const t=window.__JUCE__.backend.addEventListener("panelOpened",e);return()=>window.__JUCE__.backend.removeEventListener(t)}function Qv(e){if(!qt())return()=>{};const t=window.__JUCE__.backend.addEventListener("openPanelPaths",e);return()=>window.__JUCE__.backend.removeEventListener(t)}let Rc=1;function Dc(e=null){const t=Rc++;return{id:t,name:e??`Untitled ${t}`,scriptId:`panel_${t}`,author:"",version:"1.0.0",description:"",enabled:!0,locked:!1,filePath:null,width:600,height:400,resizable:!1,minWidth:0,minHeight:0,maxWidth:0,maxHeight:0,lockAspectRatio:!1,bgLayerOrder:["solid","gradient","image","texture"],bgSolid:!0,bgColour:"FF333333",bgGradientEnabled:!1,bgGradientOpacity:100,bgGradientName:"",bgGradient:{type:"linear",angle:90,centerX:50,centerY:50,radiusX:50,radiusY:50,edge:0,stops:[{color:"FF0000",position:0},{color:"0000FF",position:100}]},bgImageEnabled:!1,bgImage:"",bgImageOpacity:100,bgImageFit:"fill",bgImageAlign:"center",bgImageOffsetX:0,bgImageOffsetY:0,bgImageBlend:"normal",bgImageBlur:0,bgImageTint:"FFFFFF",bgImageFlipH:!1,bgImageFlipV:!1,bgImageRotation:0,bgImageGrayscale:!1,bgImageSaturation:100,bgImageBrightness:100,bgImageContrast:100,bgImageTileScale:1,bgTextureEnabled:!1,bgTexture:"",bgTextureOpacity:100,bgTextureFit:"tile",bgTextureAlign:"center",bgTextureOffsetX:0,bgTextureOffsetY:0,bgTextureBlend:"normal",bgTextureBlur:0,bgTextureTint:"FFFFFF",bgTextureFlipH:!1,bgTextureFlipV:!1,bgTextureRotation:0,bgTextureGrayscale:!1,bgTextureSaturation:100,bgTextureBrightness:100,bgTextureContrast:100,bgTextureTileScale:1,gridEnabled:!0,gridSize:10,gridColour:"33FFFFFF",gridLineWidth:1,gridType:"lines",gridSubdivision:1,gridSubColour:"55FFFFFF",gridCentered:!1,gridOriginX:0,gridOriginY:0,snapToGrid:!0,notepad:{notes:[{name:"Note 1",content:""}],activeNoteIndex:0},viewer:{images:[],activeImageIndex:0},modified:!1,controls:[]}}const wt=Ft(new Set),Gc=Io(wt,e=>e.size>0?[...e][0]:null),Dn=Ft(null);function eo(e,t=!1){t?wt.update(r=>{const o=new Set(r);return o.has(e)?o.delete(e):o.add(e),o}):wt.set(new Set([e])),Dn.set(e)}function os(){wt.set(new Set),Dn.set(null)}const Qi=Ft({x:0,y:0,active:!1}),en=Ft(100),xo=Ft(10),yt=Ft([]),bt=Ft(null),wn=Io([yt,bt],([e,t])=>e.find(r=>r.id===t)??null);function pl(e=null){const t=e??Dc();return yt.update(r=>[...r,t]),bt.set(t.id),t}function La(e){yt.update(t=>{const r=t.findIndex(i=>i.id===e),o=t.filter(i=>i.id!==e);return bt.update(i=>{if(i!==e)return i;if(o.length===0)return null;const a=Math.min(r,o.length-1);return o[a].id}),o}),Ra()}function ef(e){bt.set(e)}function st(e,t){yt.update(r=>r.map(o=>{if(o.id!==e)return o;if(o.lockAspectRatio&&o.width>0&&o.height>0){const i=o.width/o.height;"width"in t&&!("height"in t)?t.height=Math.round(t.width/i):"height"in t&&!("width"in t)&&(t.width=Math.round(t.height*i))}return{...o,...t,modified:!0}}))}function Oc(e){const{id:t,modified:r,...o}=e;return JSON.stringify(o,null,2)}function tf(e,t,r){const o=JSON.parse(e),i=Rc++;return{...Dc(),...o,id:i,filePath:t,name:r||o.name||`Untitled ${i}`,modified:!1}}function Bc(){const e=He(wn);e&&(e.filePath?Ov(String(e.id),e.filePath,Oc(e)):qc())}function qc(){const e=He(wn);e&&Gv(String(e.id),Oc(e))}function nf(){Bv()}function Ra(){const t=He(yt).filter(r=>r.filePath).map(r=>r.filePath);Xv(t)}function rf(){Zv(e=>{const t=parseInt(e.panelId,10),r={filePath:e.filePath,modified:!1};e.name&&(r.name=e.name),yt.update(o=>o.map(i=>i.id===t?{...i,...r}:i)),Ra()}),Jv(e=>{const t=He(yt).find(o=>o.filePath===e.filePath);if(t){bt.set(t.id);return}const r=tf(e.data,e.filePath,e.name);pl(r),Ra()}),Qv(e=>{if(Array.isArray(e))for(const t of e)qv(t)}),Yv()}const ea={Core:{_type:"Core",name:"",controlType:"",visible:!0,enabled:!0,locked:!1,zIndex:0,alwaysOnTop:!1,layer:"Main"},Transform:{_type:"Transform",x:0,y:0,width:100,height:40,minWidth:0,minHeight:0,maxWidth:0,maxHeight:0,aspectLock:!1,opacity:1,rotation:0},Background:{_type:"Background",mode:"solid",_children:{Fill:{_type:"Fill",mode:"solid",colour:"FF3A3A3A"},Border:{_type:"Border",enabled:!0,linked:!0,style:"solid",thickness:2,dotRadius:2,colour:"FFFFFFFF",fillSolid:!0,fillGradient:!1,fillImage:!1,fillOverlay:!1,imageSrc:"",overlaySrc:"",gradient:null,doubleGap:2,top:{style:"solid",thickness:2,dotRadius:2,doubleGap:2,colour:"FFFFFFFF",fillSolid:!0,fillGradient:!1,fillImage:!1,fillOverlay:!1,imageSrc:"",overlaySrc:"",gradient:null},right:{style:"solid",thickness:2,dotRadius:2,doubleGap:2,colour:"FFFFFFFF",fillSolid:!0,fillGradient:!1,fillImage:!1,fillOverlay:!1,imageSrc:"",overlaySrc:"",gradient:null},bottom:{style:"solid",thickness:2,dotRadius:2,doubleGap:2,colour:"FFFFFFFF",fillSolid:!0,fillGradient:!1,fillImage:!1,fillOverlay:!1,imageSrc:"",overlaySrc:"",gradient:null},left:{style:"solid",thickness:2,dotRadius:2,doubleGap:2,colour:"FFFFFFFF",fillSolid:!0,fillGradient:!1,fillImage:!1,fillOverlay:!1,imageSrc:"",overlaySrc:"",gradient:null}},Corners:{_type:"Corners",linked:!0,borderEnabled:!0,radius:0,style:"rounded",direction:"outward",borderStyle:"solid",thickness:2,dotRadius:2,doubleGap:2,doubleAnchor:"center",doubleDirection:"outward",colour:"FFFFFFFF",fillSolid:!0,fillGradient:!1,fillImage:!1,fillOverlay:!1,imageSrc:"",overlaySrc:"",gradient:null,cornerGradientMode:"radial",cornerGradientFlip:!1,cornerGradientInheritSide:"A",topLeft:{radius:0,borderEnabled:!0,style:"rounded",direction:"outward",borderStyle:"solid",thickness:2,dotRadius:2,doubleGap:2,doubleAnchor:"center",doubleDirection:"outward",colour:"FFFFFFFF",fillSolid:!0,fillGradient:!1,fillImage:!1,fillOverlay:!1,imageSrc:"",overlaySrc:"",gradient:null,cornerGradientMode:"radial",cornerGradientFlip:!1,cornerGradientInheritSide:"A"},topRight:{radius:0,borderEnabled:!0,style:"rounded",direction:"outward",borderStyle:"solid",thickness:2,dotRadius:2,doubleGap:2,doubleAnchor:"center",doubleDirection:"outward",colour:"FFFFFFFF",fillSolid:!0,fillGradient:!1,fillImage:!1,fillOverlay:!1,imageSrc:"",overlaySrc:"",gradient:null,cornerGradientMode:"radial",cornerGradientFlip:!1,cornerGradientInheritSide:"A"},bottomLeft:{radius:0,borderEnabled:!0,style:"rounded",direction:"outward",borderStyle:"solid",thickness:2,dotRadius:2,doubleGap:2,doubleAnchor:"center",doubleDirection:"outward",colour:"FFFFFFFF",fillSolid:!0,fillGradient:!1,fillImage:!1,fillOverlay:!1,imageSrc:"",overlaySrc:"",gradient:null,cornerGradientMode:"radial",cornerGradientFlip:!1,cornerGradientInheritSide:"A"},bottomRight:{radius:0,borderEnabled:!0,style:"rounded",direction:"outward",borderStyle:"solid",thickness:2,dotRadius:2,doubleGap:2,doubleAnchor:"center",doubleDirection:"outward",colour:"FFFFFFFF",fillSolid:!0,fillGradient:!1,fillImage:!1,fillOverlay:!1,imageSrc:"",overlaySrc:"",gradient:null,cornerGradientMode:"radial",cornerGradientFlip:!1,cornerGradientInheritSide:"A"}}}},Text:{_type:"Text",content:"",_children:{Fill:{_type:"Fill",mode:"solid",colour:"FFFFFFFF"},Font:{_type:"Font",family:"Arial",weight:"Regular",style:"Normal",size:12},Position:{_type:"Position",justification:"centred",paddingLeft:4,paddingRight:4,paddingTop:2,paddingBottom:2}}},Grid:{_type:"Grid",enabled:!0,visible:!0,columns:0,rows:0,cellWidth:0,cellHeight:0,snap:!1,size:10,colour:"33FFFFFF",lineWidth:1,style:"lines",_children:{Cells:{_type:"Cells"},Points:{_type:"Points"}}},Mouse:{_type:"Mouse",cursor:"default",interceptClicks:!0,interceptChildClicks:!1,bringToFrontOnClick:!1,draggable:!1,hitTestShape:"rectangle",focusable:!1,focusOutline:!1,tabIndex:-1},Icon:{_type:"Icon",source:"builtin",name:"",size:16,_children:{Fill:{_type:"Fill",mode:"solid",colour:"FFFFFFFF"}}},Effects:{_type:"Effects",_children:{Shadows:{_type:"Shadows",items:[{enabled:!1,type:"drop",offsetX:0,offsetY:2,blur:4,spread:0,colour:"66000000"}]},Bevel:{_type:"Bevel",enabled:!1,style:"outer-bevel",depth:100,size:5,softness:0,angle:135,highlightColour:"FFFFFF",highlightOpacity:75,shadowColour:"000000",shadowOpacity:75},Filters:{_type:"Filters",blur:0,brightness:100,contrast:100,saturation:100,hueRotate:0,grayscale:0,sepia:0,invert:0},Blend:{_type:"Blend",mode:"normal"}}},Children:{_type:"Children",layout:"none",gap:0,padding:0},States:{_type:"States",_children:{}},Scripts:{_type:"Scripts"},Animations:{_type:"Animations",_children:{}}},is={Background:{sections:["Background"],defaultOverrides:{}},Label:{sections:["Background","Text"],defaultOverrides:{Transform:{width:100,height:24},Text:{content:"Label"}}},Button:{sections:["Background","Text","Mouse","States","Scripts"],defaultOverrides:{Transform:{width:120,height:40},Text:{content:"Click Me"},Mouse:{cursor:"pointer",interceptClicks:!0,focusable:!0,tabIndex:0},Background:{_children:{Border:{enabled:!0}}}},defaultStates:["Hover","Pressed","Disabled","Focused"]},Container:{sections:["Background","Grid","Children"],defaultOverrides:{Transform:{width:300,height:200},Grid:{enabled:!0,snap:!0,size:10}}},TestBox:{sections:["Background"],defaultOverrides:{Transform:{width:80,height:80},Background:{_children:{Fill:{colour:"FF5B9BD5"}}}}}};let of=Date.now();function fi(e){return JSON.parse(JSON.stringify(e))}function Gr(e,t){if(!t)return e;for(const[r,o]of Object.entries(t))if(r!=="_type")if(r==="_children"&&typeof o=="object"&&e._children)for(const[i,a]of Object.entries(o))e._children[i]?Gr(e._children[i],a):e._children[i]=fi(a);else e[r]=o;return e}function af(e,t={}){var s,c;const r=is[e];if(!r)throw new Error(`Unknown component type: "${e}". Available: ${Object.keys(is).join(", ")}`);const o=`ctrl_${of++}`,i={},a=fi(ea.Core);a.id=o,a.controlType=e,a.name=t.name||`${e}_${o.replace("ctrl_","")}`,Gr(a,t.Core),i.Core=a;const l=fi(ea.Transform);Gr(l,(s=r.defaultOverrides)==null?void 0:s.Transform),Gr(l,t.Transform),i.Transform=l;for(const d of r.sections){const u=ea[d];if(!u){console.warn(`[createControl] No defaults for section "${d}"`);continue}const p=fi(u);Gr(p,(c=r.defaultOverrides)==null?void 0:c[d]),Gr(p,t[d]),i[d]=p}if(r.defaultStates&&i.States){i.States._children||(i.States._children={});for(const d of r.defaultStates)i.States._children[d]={_type:d}}return{_type:"Control",_children:i}}function jt(e,t){var r;return((r=e==null?void 0:e._children)==null?void 0:r[t])??null}function lf(e,t){var r;return((r=e==null?void 0:e._children)==null?void 0:r[t])!=null}const sf=Io([yt,bt,Gc,wt,Dn],([e,t,r,o,i])=>{const a=o.size>1&&i?i:r;if(a==null)return null;const l=e.find(s=>s.id===t);return l?l.controls.find(s=>{var c,d;return((d=(c=s._children)==null?void 0:c.Core)==null?void 0:d.id)===a})??null:null});Io([yt,bt,wt],([e,t,r])=>{if(r.size===0)return[];const o=e.find(i=>i.id===t);return o?o.controls.filter(i=>{var a,l;return r.has((l=(a=i._children)==null?void 0:a.Core)==null?void 0:l.id)}):[]});function Do(e,t){const r=He(bt),o=He(wt);r==null||o.size===0||yt.update(i=>i.map(a=>{if(a.id!==r)return a;const l=a.controls.map(s=>{var d,u;if(!o.has((u=(d=s._children)==null?void 0:d.Core)==null?void 0:u.id))return s;const c=JSON.parse(JSON.stringify(s));return Xc(c,e,t),c});return{...a,controls:l,modified:!0}}))}function vo(e,t={}){const r=He(bt);if(r==null)return null;const o=He(yt).find(l=>l.id===r);if(o&&!t.Transform){const l=o.controls.length*20;t={...t,Transform:{x:20+l,y:20+l}}}const i=af(e,t),a=i._children.Core.id;return yt.update(l=>l.map(s=>s.id!==r?s:{...s,controls:[...s.controls,i],modified:!0})),eo(a),i}function gl(e){const t=He(bt);t!=null&&(yt.update(r=>r.map(o=>o.id!==t?o:{...o,controls:o.controls.filter(i=>{var a,l;return((l=(a=i._children)==null?void 0:a.Core)==null?void 0:l.id)!==e}),modified:!0})),wt.update(r=>{if(!r.has(e))return r;const o=new Set(r);return o.delete(e),o}),He(Dn)===e&&Dn.set(null))}function Yc(e){const t=He(bt);if(t==null)return null;const r=typeof e=="string"?[e]:[...e],o=He(yt).find(l=>l.id===t);if(!o)return null;const i=[];for(const l of r){const s=o.controls.find(u=>{var p,v;return((v=(p=u._children)==null?void 0:p.Core)==null?void 0:v.id)===l});if(!s)continue;const c=JSON.parse(JSON.stringify(s)),d=`ctrl_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;c._children.Core.id=d,c._children.Core.name=`${c._children.Core.name}_copy`,c._children.Transform&&(c._children.Transform.x+=20,c._children.Transform.y+=20),i.push(c)}if(i.length===0)return null;yt.update(l=>l.map(s=>s.id!==t?s:{...s,controls:[...s.controls,...i],modified:!0}));const a=new Set(i.map(l=>l._children.Core.id));return wt.set(a),i}function et(e,t,r){const o=He(bt);o!=null&&yt.update(i=>i.map(a=>{if(a.id!==o)return a;const l=a.controls.map(s=>{var d,u;if(((u=(d=s._children)==null?void 0:d.Core)==null?void 0:u.id)!==e)return s;const c=JSON.parse(JSON.stringify(s));return Xc(c,t,r),c});return{...a,controls:l,modified:!0}}))}function Xc(e,t,r){var l;const o=t.split(".");if(o.length===0)return;let i=(l=e._children)==null?void 0:l[o[0]];if(!i)return;for(let s=1;s<o.length-1;s++){const c=o[s];if(i._children&&i._children[c]!==void 0)i=i._children[c];else if(i[c]!==void 0)i=i[c];else return}const a=o[o.length-1];i[a]=r}const Da=Ft(!1),Ga=Ft(!1),cf=50,ta=new Map;let wo=!1,ur=null,Pr=null;function Ti(e){return ta.has(e)||ta.set(e,{undoStack:[],redoStack:[]}),ta.get(e)}function bl(){const e=He(bt);if(e==null){Da.set(!1),Ga.set(!1);return}const t=Ti(e);Da.set(t.undoStack.length>0),Ga.set(t.redoStack.length>0)}function ko(e){const{id:t,modified:r,...o}=e;return JSON.stringify(o)}function Hc(e,t){const r=JSON.parse(t);wo=!0,yt.update(o=>o.map(i=>i.id!==e?i:{...i,...r,modified:!0})),wo=!1,Pr=t}function Uc(){if(wo)return;clearTimeout(ur),ur=null;const e=He(bt);if(e==null)return;const t=He(yt).find(i=>i.id===e);if(!t)return;const r=ko(t);if(r===Pr)return;const o=Ti(e);o.undoStack.push(Pr),o.undoStack.length>cf&&o.undoStack.shift(),o.redoStack.length=0,Pr=r,bl()}function df(){wo||(ur&&clearTimeout(ur),ur=setTimeout(Uc,400))}function mo(){ur&&(clearTimeout(ur),ur=null,Uc());const e=He(bt);if(e==null)return;const t=Ti(e);if(t.undoStack.length===0)return;const r=He(yt).find(i=>i.id===e);if(!r)return;t.redoStack.push(ko(r));const o=t.undoStack.pop();Hc(e,o),bl()}function _o(){const e=He(bt);if(e==null)return;const t=Ti(e);if(t.redoStack.length===0)return;const r=He(yt).find(i=>i.id===e);if(!r)return;t.undoStack.push(ko(r));const o=t.redoStack.pop();Hc(e,o),bl()}function uf(){const e=He(bt);if(e!=null){const t=He(yt).find(r=>r.id===e);t&&(Pr=ko(t))}bt.subscribe(t=>{if(t==null){Pr=null;return}const r=He(yt).find(o=>o.id===t);r&&(Pr=ko(r))}),yt.subscribe(()=>{wo||df()})}let Br=[];function Ei(){const e=He(wt);if(e.size===0)return;const t=He(yt).find(r=>r.id===He(bt));t&&(Br=t.controls.filter(r=>{var o,i;return e.has((i=(o=r._children)==null?void 0:o.Core)==null?void 0:i.id)}).map(r=>JSON.parse(JSON.stringify(r))))}function ml(){Ei();const e=[...He(wt)];for(const t of e)gl(t)}function _l(e=null){if(Br.length===0)return;const t=He(bt);if(t==null)return;const r=[];yt.update(o=>o.map(i=>{var c;if(i.id!==t)return i;let a=20,l=20;if(e){let d=1/0,u=1/0,p=-1/0,v=-1/0;for(const _ of Br){const y=(c=_._children)==null?void 0:c.Transform;y&&(d=Math.min(d,y.x),u=Math.min(u,y.y),p=Math.max(p,y.x+(y.width||0)),v=Math.max(v,y.y+(y.height||0)))}const b=(d+p)/2,g=(u+v)/2;a=e.x-b,l=e.y-g}const s=Br.map(d=>{const u=JSON.parse(JSON.stringify(d)),p=`ctrl_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;return u._children.Core.id=p,u._children.Core.name=u._children.Core.name.replace(/_copy$/,"")+"_copy",u._children.Transform&&(u._children.Transform.x+=a,u._children.Transform.y+=l),r.push(p),u});return Br=s.map(d=>JSON.parse(JSON.stringify(d))),{...i,controls:[...i.controls,...s],modified:!0}})),wt.set(new Set(r))}function vf(){return Br.length>0}function yl(){var r,o;const e=He(yt).find(i=>i.id===He(bt));if(!e)return;const t=new Set;for(const i of e.controls){const a=(o=(r=i._children)==null?void 0:r.Core)==null?void 0:o.id;a&&t.add(a)}wt.set(t)}const Wc=Ft(0);function Vc(){Wc.update(e=>e+1)}var ff=G('<div class="dropdown-separator svelte-ilvwri"></div>'),hf=G('<span class="item-shortcut svelte-ilvwri"> </span>'),pf=G('<button class="dropdown-item svelte-ilvwri"><span class="item-label svelte-ilvwri"> </span> <!></button>'),gf=G('<div class="dropdown svelte-ilvwri"></div>'),bf=G('<div class="menu-wrapper svelte-ilvwri"><button> </button> <!></div>'),mf=G('<nav class="menubar svelte-ilvwri"></nav>');function _f(e,t){Ve(t,!0);const r={File:[{label:"New Panel",shortcut:"Ctrl+N",action:()=>pl()},{label:"Open Panel",shortcut:"Ctrl+O",action:()=>nf()},{type:"separator"},{label:"Save",shortcut:"Ctrl+S",action:()=>Bc()},{label:"Save As...",shortcut:"Ctrl+Shift+S",action:()=>qc()},{type:"separator"},{label:"Close Panel",shortcut:"Ctrl+W",action:()=>{const u=He(bt);u!=null&&La(u)}},{type:"separator"},{label:"Close Program",shortcut:"Alt+F4",action:()=>Dv()}],Edit:[{label:"Undo",shortcut:"Ctrl+Z",action:()=>mo()},{label:"Redo",shortcut:"Ctrl+Y",action:()=>_o()},{type:"separator"},{label:"Cut",shortcut:"Ctrl+X",action:()=>ml()},{label:"Copy",shortcut:"Ctrl+C",action:()=>Ei()},{label:"Paste",shortcut:"Ctrl+V",action:()=>_l()},{type:"separator"},{label:"Select All",shortcut:"Ctrl+A",action:()=>yl()}],View:[{label:"Zoom In",shortcut:"Ctrl++",action:()=>en.update(u=>Math.min(400,u+He(xo)))},{label:"Zoom Out",shortcut:"Ctrl+-",action:()=>en.update(u=>Math.max(10,u-He(xo)))},{label:"Reset Zoom",action:()=>en.set(100)},{label:"Fit to Window",shortcut:"Ctrl+0",action:()=>{const u=He(wn);if(!u)return;const p=document.querySelector(".canvas-viewport");if(!p)return;const v=Math.min((p.clientWidth-80)/u.width,(p.clientHeight-80)/u.height);en.set(Math.max(10,Math.min(400,Math.round(v*100))))}},{label:"Zoom to Selection",shortcut:"Ctrl+Shift+P",action:()=>Vc()},{type:"separator"},{label:"Toggle Grid",action:()=>{const u=He(wn);u&&st(u.id,{gridEnabled:!u.gridEnabled})}},{label:"Toggle Snap",action:()=>{const u=He(wn);u&&st(u.id,{snapToGrid:!u.snapToGrid})}}],Insert:[{label:"Background",action:()=>vo("Background")},{label:"Label",action:()=>vo("Label")},{label:"Button",action:()=>vo("Button")},{label:"Container",action:()=>vo("Container")},{type:"separator"},{label:"TestBox",action:()=>vo("TestBox")}],Panel:[{label:"Panel Properties...",action:()=>{}},{label:"Export Settings...",action:()=>{}}],Build:[{label:"Build VST3",action:()=>{}},{label:"Build Standalone",action:()=>{}},{type:"separator"},{label:"Build Settings...",action:()=>{}}],Help:[{label:"Keyboard Shortcuts",shortcut:"F1",action:()=>{document.dispatchEvent(new KeyboardEvent("keydown",{key:"F1",bubbles:!0}))}},{label:"About CEditor",action:()=>{}}]},o=Object.keys(r);let i=ae(null);function a(u){w(i,n(i)===u?null:u,!0)}function l(u){u.action&&u.action(),w(i,null)}function s(u){n(i)&&!u.target.closest(".menubar")&&w(i,null)}function c(u){n(i)!==null&&w(i,u,!0)}var d=mf();Qe("click",Rn,s),Xe(d,21,()=>o,at,(u,p)=>{var v=bf(),b=h(v);let g;var _=h(b),y=f(b,2);{var S=T=>{var I=gf();Xe(I,21,()=>r[n(p)],at,($,x)=>{var D=ue(),j=W(D);{var R=M=>{var L=ff();m(M,L)},k=M=>{var L=pf(),F=h(L),Y=h(F),q=f(F,2);{var oe=ee=>{var Z=hf(),N=h(Z);te(()=>Re(N,n(x).shortcut)),m(ee,Z)};xe(q,ee=>{n(x).shortcut&&ee(oe)})}te(()=>Re(Y,n(x).label)),z("click",L,()=>l(n(x))),m(M,L)};xe(j,M=>{n(x).type==="separator"?M(R):M(k,-1)})}m($,D)}),m(T,I)};xe(y,T=>{n(i)===n(p)&&T(S)})}te(()=>{g=Te(b,1,"menu-item svelte-ilvwri",null,g,{active:n(i)===n(p)}),Re(_,n(p))}),z("click",b,()=>a(n(p))),Qe("mouseenter",b,()=>c(n(p))),m(u,v)}),m(e,d),Ke()}tt(["click"]);Cu();/**
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
 */const yf={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":2,"stroke-linecap":"round","stroke-linejoin":"round"};/**
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
 */const $f=e=>{for(const t in e)if(t.startsWith("aria-")||t==="role"||t==="title")return!0;return!1};/**
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
 */const as=(...e)=>e.filter((t,r,o)=>!!t&&t.trim()!==""&&o.indexOf(t)===r).join(" ").trim();var xf=$t("<svg><!><!></svg>");function Pe(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]),o=ze(r,["name","color","size","strokeWidth","absoluteStrokeWidth","iconNode"]);Ve(t,!1);let i=K(t,"name",8,void 0),a=K(t,"color",8,"currentColor"),l=K(t,"size",8,24),s=K(t,"strokeWidth",8,2),c=K(t,"absoluteStrokeWidth",8,!1),d=K(t,"iconNode",24,()=>[]);Av();var u=xf();Ql(u,(b,g,_)=>({...yf,...b,...o,width:l(),height:l(),stroke:a(),"stroke-width":g,class:_}),[()=>$f(o)?void 0:{"aria-hidden":"true"},()=>(mr(c()),mr(s()),mr(l()),Jn(()=>c()?Number(s())*24/Number(l()):s())),()=>(mr(as),mr(i()),mr(r),Jn(()=>as("lucide-icon","lucide",i()?`lucide-${i()}`:"",r.class)))]);var p=h(u);Xe(p,1,d,at,(b,g)=>{var _=P(()=>zi(n(g),2));let y=()=>n(_)[0],S=()=>n(_)[1];var T=ue(),I=W(T);wv(I,y,!0,($,x)=>{Ql($,()=>({...S()}))}),m(b,T)});var v=f(p);Me(v,t,"default",{}),m(e,u),Ke()}function wf(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"}]];Pe(e,Se({name:"activity"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function kf(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["rect",{width:"6",height:"14",x:"4",y:"5",rx:"2"}],["rect",{width:"6",height:"10",x:"14",y:"7",rx:"2"}],["path",{d:"M17 22v-5"}],["path",{d:"M17 7V2"}],["path",{d:"M7 22v-3"}],["path",{d:"M7 5V2"}]];Pe(e,Se({name:"align-horizontal-distribute-center"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Cf(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["rect",{width:"6",height:"14",x:"4",y:"5",rx:"2"}],["rect",{width:"6",height:"10",x:"14",y:"7",rx:"2"}],["path",{d:"M10 2v20"}],["path",{d:"M20 2v20"}]];Pe(e,Se({name:"align-horizontal-distribute-end"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function zf(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["rect",{width:"6",height:"14",x:"4",y:"5",rx:"2"}],["rect",{width:"6",height:"10",x:"14",y:"7",rx:"2"}],["path",{d:"M4 2v20"}],["path",{d:"M14 2v20"}]];Pe(e,Se({name:"align-horizontal-distribute-start"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Mf(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["rect",{width:"6",height:"14",x:"2",y:"5",rx:"2"}],["rect",{width:"6",height:"10",x:"16",y:"7",rx:"2"}],["path",{d:"M12 2v20"}]];Pe(e,Se({name:"align-horizontal-justify-center"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Sf(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["rect",{width:"6",height:"14",x:"2",y:"5",rx:"2"}],["rect",{width:"6",height:"10",x:"12",y:"7",rx:"2"}],["path",{d:"M22 2v20"}]];Pe(e,Se({name:"align-horizontal-justify-end"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Pf(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["rect",{width:"6",height:"14",x:"6",y:"5",rx:"2"}],["rect",{width:"6",height:"10",x:"16",y:"7",rx:"2"}],["path",{d:"M2 2v20"}]];Pe(e,Se({name:"align-horizontal-justify-start"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Tf(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["rect",{width:"6",height:"14",x:"3",y:"5",rx:"2"}],["rect",{width:"6",height:"10",x:"15",y:"7",rx:"2"}],["path",{d:"M3 2v20"}],["path",{d:"M21 2v20"}]];Pe(e,Se({name:"align-horizontal-space-between"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Ef(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M22 17h-3"}],["path",{d:"M22 7h-5"}],["path",{d:"M5 17H2"}],["path",{d:"M7 7H2"}],["rect",{x:"5",y:"14",width:"14",height:"6",rx:"2"}],["rect",{x:"7",y:"4",width:"10",height:"6",rx:"2"}]];Pe(e,Se({name:"align-vertical-distribute-center"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Ff(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["rect",{width:"14",height:"6",x:"5",y:"14",rx:"2"}],["rect",{width:"10",height:"6",x:"7",y:"4",rx:"2"}],["path",{d:"M2 20h20"}],["path",{d:"M2 10h20"}]];Pe(e,Se({name:"align-vertical-distribute-end"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function If(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["rect",{width:"14",height:"6",x:"5",y:"14",rx:"2"}],["rect",{width:"10",height:"6",x:"7",y:"4",rx:"2"}],["path",{d:"M2 14h20"}],["path",{d:"M2 4h20"}]];Pe(e,Se({name:"align-vertical-distribute-start"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Af(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["rect",{width:"14",height:"6",x:"5",y:"16",rx:"2"}],["rect",{width:"10",height:"6",x:"7",y:"2",rx:"2"}],["path",{d:"M2 12h20"}]];Pe(e,Se({name:"align-vertical-justify-center"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function jf(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["rect",{width:"14",height:"6",x:"5",y:"12",rx:"2"}],["rect",{width:"10",height:"6",x:"7",y:"2",rx:"2"}],["path",{d:"M2 22h20"}]];Pe(e,Se({name:"align-vertical-justify-end"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Nf(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["rect",{width:"14",height:"6",x:"5",y:"16",rx:"2"}],["rect",{width:"10",height:"6",x:"7",y:"6",rx:"2"}],["path",{d:"M2 2h20"}]];Pe(e,Se({name:"align-vertical-justify-start"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Lf(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["rect",{width:"14",height:"6",x:"5",y:"15",rx:"2"}],["rect",{width:"10",height:"6",x:"7",y:"3",rx:"2"}],["path",{d:"M2 21h20"}],["path",{d:"M2 3h20"}]];Pe(e,Se({name:"align-vertical-space-between"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Rf(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M12 17V3"}],["path",{d:"m6 11 6 6 6-6"}],["path",{d:"M19 21H5"}]];Pe(e,Se({name:"arrow-down-to-line"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Df(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"m12 19-7-7 7-7"}],["path",{d:"M19 12H5"}]];Pe(e,Se({name:"arrow-left"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Gf(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M2 10v3"}],["path",{d:"M6 6v11"}],["path",{d:"M10 3v18"}],["path",{d:"M14 8v7"}],["path",{d:"M18 5v13"}],["path",{d:"M22 10v3"}]];Pe(e,Se({name:"audio-lines"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Of(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["circle",{cx:"9",cy:"9",r:"7"}],["circle",{cx:"15",cy:"15",r:"7"}]];Pe(e,Se({name:"blend"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Bf(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"}]];Pe(e,Se({name:"bold"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function qf(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"}],["path",{d:"m3.3 7 8.7 5 8.7-5"}],["path",{d:"M12 22V12"}]];Pe(e,Se({name:"box"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Yf(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2"}],["path",{d:"M12 9v6"}],["path",{d:"M16 15v6"}],["path",{d:"M16 3v6"}],["path",{d:"M3 15h18"}],["path",{d:"M3 9h18"}],["path",{d:"M8 15v6"}],["path",{d:"M8 3v6"}]];Pe(e,Se({name:"brick-wall"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Xf(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["rect",{x:"8",y:"8",width:"8",height:"8",rx:"2"}],["path",{d:"M4 10a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2"}],["path",{d:"M14 20a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2"}]];Pe(e,Se({name:"bring-to-front"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Kc(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M20 6 9 17l-5-5"}]];Pe(e,Se({name:"check"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function $l(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"m6 9 6 6 6-6"}]];Pe(e,Se({name:"chevron-down"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Hf(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"m18 15-6-6-6 6"}]];Pe(e,Se({name:"chevron-up"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Uf(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"m9 18 6-6-6-6"}]];Pe(e,Se({name:"chevron-right"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Oa(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["circle",{cx:"12",cy:"12",r:"10"}]];Pe(e,Se({name:"circle"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Wf(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2"}],["path",{d:"M9 3v18"}],["path",{d:"M15 3v18"}]];Pe(e,Se({name:"columns-3"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Zc(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["rect",{width:"14",height:"14",x:"8",y:"8",rx:"2",ry:"2"}],["path",{d:"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"}]];Pe(e,Se({name:"copy"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Vf(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"}],["path",{d:"M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"}]];Pe(e,Se({name:"droplets"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Kf(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"}],["path",{d:"M14.084 14.158a3 3 0 0 1-4.242-4.242"}],["path",{d:"M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"}],["path",{d:"m2 2 20 20"}]];Pe(e,Se({name:"eye-off"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Zf(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"}],["circle",{cx:"12",cy:"12",r:"3"}]];Pe(e,Se({name:"eye"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Jf(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"m3 7 5 5-5 5V7"}],["path",{d:"m21 7-5 5 5 5V7"}],["path",{d:"M12 20v2"}],["path",{d:"M12 14v2"}],["path",{d:"M12 8v2"}],["path",{d:"M12 2v2"}]];Pe(e,Se({name:"flip-horizontal-2"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Qf(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"m17 3-5 5-5-5h10"}],["path",{d:"m17 21-5-5-5 5h10"}],["path",{d:"M4 12H2"}],["path",{d:"M10 12H8"}],["path",{d:"M16 12h-2"}],["path",{d:"M22 12h-2"}]];Pe(e,Se({name:"flip-vertical-2"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Jc(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["line",{x1:"22",x2:"2",y1:"6",y2:"6"}],["line",{x1:"22",x2:"2",y1:"18",y2:"18"}],["line",{x1:"6",x2:"6",y1:"2",y2:"22"}],["line",{x1:"18",x2:"18",y1:"2",y2:"22"}]];Pe(e,Se({name:"frame"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function eh(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z"}]];Pe(e,Se({name:"funnel"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Ba(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2"}],["path",{d:"M3 9h18"}],["path",{d:"M3 15h18"}],["path",{d:"M9 3v18"}],["path",{d:"M15 3v18"}]];Pe(e,Se({name:"grid-3x3"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function th(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M3 7V5c0-1.1.9-2 2-2h2"}],["path",{d:"M17 3h2c1.1 0 2 .9 2 2v2"}],["path",{d:"M21 17v2c0 1.1-.9 2-2 2h-2"}],["path",{d:"M7 21H5c-1.1 0-2-.9-2-2v-2"}],["rect",{width:"7",height:"5",x:"7",y:"7",rx:"1"}],["rect",{width:"7",height:"5",x:"10",y:"12",rx:"1"}]];Pe(e,Se({name:"group"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function nh(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M16 5h6"}],["path",{d:"M19 2v6"}],["path",{d:"M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5"}],["path",{d:"m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"}],["circle",{cx:"9",cy:"9",r:"2"}]];Pe(e,Se({name:"image-plus"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function xl(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",ry:"2"}],["circle",{cx:"9",cy:"9",r:"2"}],["path",{d:"m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"}]];Pe(e,Se({name:"image"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function rh(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["line",{x1:"19",x2:"10",y1:"4",y2:"4"}],["line",{x1:"14",x2:"5",y1:"20",y2:"20"}],["line",{x1:"15",x2:"9",y1:"4",y2:"20"}]];Pe(e,Se({name:"italic"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Qc(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"}],["path",{d:"M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"}],["path",{d:"M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"}]];Pe(e,Se({name:"layers"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function oh(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["rect",{width:"7",height:"9",x:"3",y:"3",rx:"1"}],["rect",{width:"7",height:"5",x:"14",y:"3",rx:"1"}],["rect",{width:"7",height:"9",x:"14",y:"12",rx:"1"}],["rect",{width:"7",height:"5",x:"3",y:"16",rx:"1"}]];Pe(e,Se({name:"layout-dashboard"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function ed(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["rect",{width:"7",height:"7",x:"3",y:"3",rx:"1"}],["rect",{width:"7",height:"7",x:"14",y:"3",rx:"1"}],["rect",{width:"7",height:"7",x:"14",y:"14",rx:"1"}],["rect",{width:"7",height:"7",x:"3",y:"14",rx:"1"}]];Pe(e,Se({name:"layout-grid"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function wl(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"}],["path",{d:"M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"}]];Pe(e,Se({name:"link"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function ih(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M11 5h10"}],["path",{d:"M11 12h10"}],["path",{d:"M11 19h10"}],["path",{d:"M4 4h1v5"}],["path",{d:"M4 9h2"}],["path",{d:"M6.5 20H3.4c0-1 2.6-1.925 2.6-3.5a1.5 1.5 0 0 0-2.6-1.02"}]];Pe(e,Se({name:"list-ordered"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function ah(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M3 5h.01"}],["path",{d:"M3 12h.01"}],["path",{d:"M3 19h.01"}],["path",{d:"M8 5h13"}],["path",{d:"M8 12h13"}],["path",{d:"M8 19h13"}]];Pe(e,Se({name:"list"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function td(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["rect",{width:"18",height:"11",x:"3",y:"11",rx:"2",ry:"2"}],["path",{d:"M7 11V7a5 5 0 0 1 9.9-1"}]];Pe(e,Se({name:"lock-open"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function nd(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["rect",{width:"18",height:"11",x:"3",y:"11",rx:"2",ry:"2"}],["path",{d:"M7 11V7a5 5 0 0 1 10 0v4"}]];Pe(e,Se({name:"lock"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function rd(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"m12 15 4 4"}],["path",{d:"M2.352 10.648a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l6.029-6.029a1 1 0 1 1 3 3l-6.029 6.029a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l6.365-6.367A1 1 0 0 0 8.716 4.282z"}],["path",{d:"m5 8 4 4"}]];Pe(e,Se({name:"magnet"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function od(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M8 3H5a2 2 0 0 0-2 2v3"}],["path",{d:"M21 8V5a2 2 0 0 0-2-2h-3"}],["path",{d:"M3 16v3a2 2 0 0 0 2 2h3"}],["path",{d:"M16 21h3a2 2 0 0 0 2-2v-3"}]];Pe(e,Se({name:"maximize"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function lh(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["rect",{width:"20",height:"14",x:"2",y:"3",rx:"2"}],["line",{x1:"8",x2:"16",y1:"21",y2:"21"}],["line",{x1:"12",x2:"12",y1:"17",y2:"21"}]];Pe(e,Se({name:"monitor"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function sh(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"}]];Pe(e,Se({name:"moon"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function ch(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z"}]];Pe(e,Se({name:"mouse-pointer-2"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function dh(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M14 4.1 12 6"}],["path",{d:"m5.1 8-2.9-.8"}],["path",{d:"m6 12-1.9 2"}],["path",{d:"M7.2 2.2 8 5.1"}],["path",{d:"M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z"}]];Pe(e,Se({name:"mouse-pointer-click"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function uh(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M12.586 12.586 19 19"}],["path",{d:"M3.688 3.037a.497.497 0 0 0-.651.651l6.5 15.999a.501.501 0 0 0 .947-.062l1.569-6.083a2 2 0 0 1 1.448-1.479l6.124-1.579a.5.5 0 0 0 .063-.947z"}]];Pe(e,Se({name:"mouse-pointer"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function vh(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M8 18L12 22L16 18"}],["path",{d:"M12 2V22"}]];Pe(e,Se({name:"move-down"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function fh(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"m18 8 4 4-4 4"}],["path",{d:"M2 12h20"}],["path",{d:"m6 8-4 4 4 4"}]];Pe(e,Se({name:"move-horizontal"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function hh(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M8 6L12 2L16 6"}],["path",{d:"M12 2V22"}]];Pe(e,Se({name:"move-up"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function id(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M12 2v20"}],["path",{d:"m15 19-3 3-3-3"}],["path",{d:"m19 9 3 3-3 3"}],["path",{d:"M2 12h20"}],["path",{d:"m5 9-3 3 3 3"}],["path",{d:"m9 5 3-3 3 3"}]];Pe(e,Se({name:"move"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function ph(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M11 7 6 2"}],["path",{d:"M18.992 12H2.041"}],["path",{d:"M21.145 18.38A3.34 3.34 0 0 1 20 16.5a3.3 3.3 0 0 1-1.145 1.88c-.575.46-.855 1.02-.855 1.595A2 2 0 0 0 20 22a2 2 0 0 0 2-2.025c0-.58-.285-1.13-.855-1.595"}],["path",{d:"m8.5 4.5 2.148-2.148a1.205 1.205 0 0 1 1.704 0l7.296 7.296a1.205 1.205 0 0 1 0 1.704l-7.592 7.592a3.615 3.615 0 0 1-5.112 0l-3.888-3.888a3.615 3.615 0 0 1 0-5.112L5.67 7.33"}]];Pe(e,Se({name:"paint-bucket"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function ls(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"m14.622 17.897-10.68-2.913"}],["path",{d:"M18.376 2.622a1 1 0 1 1 3.002 3.002L17.36 9.643a.5.5 0 0 0 0 .707l.944.944a2.41 2.41 0 0 1 0 3.408l-.944.944a.5.5 0 0 1-.707 0L8.354 7.348a.5.5 0 0 1 0-.707l.944-.944a2.41 2.41 0 0 1 3.408 0l.944.944a.5.5 0 0 0 .707 0z"}],["path",{d:"M9 8c-1.804 2.71-3.97 3.46-6.583 3.948a.507.507 0 0 0-.302.819l7.32 8.883a1 1 0 0 0 1.185.204C12.735 20.405 16 16.792 16 15"}]];Pe(e,Se({name:"paintbrush"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function gh(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2"}],["path",{d:"M3 15h18"}]];Pe(e,Se({name:"panel-bottom"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function bh(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2"}],["path",{d:"M9 3v18"}],["path",{d:"m16 15-3-3 3-3"}]];Pe(e,Se({name:"panel-left-close"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function mh(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2"}],["path",{d:"M15 3v18"}]];Pe(e,Se({name:"panel-right"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function _h(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M12 17v5"}],["path",{d:"M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89"}],["path",{d:"m2 2 20 20"}],["path",{d:"M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11"}]];Pe(e,Se({name:"pin-off"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function yh(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M12 17v5"}],["path",{d:"M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"}]];Pe(e,Se({name:"pin"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function ad(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"m12 9-8.414 8.414A2 2 0 0 0 3 18.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 3.828 21h1.344a2 2 0 0 0 1.414-.586L15 12"}],["path",{d:"m18 9 .4.4a1 1 0 1 1-3 3l-3.8-3.8a1 1 0 1 1 3-3l.4.4 3.4-3.4a1 1 0 1 1 3 3z"}],["path",{d:"m2 22 .414-.414"}]];Pe(e,Se({name:"pipette"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Fi(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M5 12h14"}],["path",{d:"M12 5v14"}]];Pe(e,Se({name:"plus"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function ld(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["rect",{width:"20",height:"12",x:"2",y:"6",rx:"2"}]];Pe(e,Se({name:"rectangle-horizontal"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function $h(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"m15 14 5-5-5-5"}],["path",{d:"M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"}]];Pe(e,Se({name:"redo-2"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function xh(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M4 7V4h16v3"}],["path",{d:"M5 20h6"}],["path",{d:"M13 4 8 20"}],["path",{d:"m15 15 5 5"}],["path",{d:"m20 15-5 5"}]];Pe(e,Se({name:"remove-formatting"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function sd(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"}],["path",{d:"M3 3v5h5"}]];Pe(e,Se({name:"rotate-ccw"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function qa(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"}],["path",{d:"m14.5 12.5 2-2"}],["path",{d:"m11.5 9.5 2-2"}],["path",{d:"m8.5 6.5 2-2"}],["path",{d:"m17.5 15.5 2-2"}]];Pe(e,Se({name:"ruler"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function wh(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"}],["path",{d:"M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"}],["path",{d:"M7 3v4a1 1 0 0 0 1 1h7"}]];Pe(e,Se({name:"save"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function kh(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"}],["path",{d:"M14 15H9v-5"}],["path",{d:"M16 3h5v5"}],["path",{d:"M21 3 9 15"}]];Pe(e,Se({name:"scaling"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Ch(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["rect",{x:"14",y:"14",width:"8",height:"8",rx:"2"}],["rect",{x:"2",y:"2",width:"8",height:"8",rx:"2"}],["path",{d:"M7 14v1a2 2 0 0 0 2 2h1"}],["path",{d:"M14 7h1a2 2 0 0 1 2 2v1"}]];Pe(e,Se({name:"send-to-back"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function zh(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M14 17H5"}],["path",{d:"M19 7h-9"}],["circle",{cx:"17",cy:"17",r:"3"}],["circle",{cx:"7",cy:"7",r:"3"}]];Pe(e,Se({name:"settings-2"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Mh(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M10 5H3"}],["path",{d:"M12 19H3"}],["path",{d:"M14 3v4"}],["path",{d:"M16 17v4"}],["path",{d:"M21 12h-9"}],["path",{d:"M21 19h-5"}],["path",{d:"M21 5h-7"}],["path",{d:"M8 10v4"}],["path",{d:"M8 12H3"}]];Pe(e,Se({name:"sliders-horizontal"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Sh(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"}],["path",{d:"M20 2v4"}],["path",{d:"M22 4h-4"}],["circle",{cx:"4",cy:"20",r:"2"}]];Pe(e,Se({name:"sparkles"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Ph(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M4 10c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2"}],["path",{d:"M10 16c-1.1 0-2-.9-2-2v-4c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2"}],["rect",{width:"8",height:"8",x:"14",y:"14",rx:"2"}]];Pe(e,Se({name:"square-stack"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function cd(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2"}]];Pe(e,Se({name:"square"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Th(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["rect",{width:"20",height:"6",x:"2",y:"4",rx:"2"}],["rect",{width:"20",height:"6",x:"2",y:"14",rx:"2"}]];Pe(e,Se({name:"stretch-horizontal"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Eh(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["rect",{width:"6",height:"20",x:"4",y:"2",rx:"2"}],["rect",{width:"6",height:"20",x:"14",y:"2",rx:"2"}]];Pe(e,Se({name:"stretch-vertical"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Fh(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M16 4H9a3 3 0 0 0-2.83 4"}],["path",{d:"M14 12a4 4 0 0 1 0 8H6"}],["line",{x1:"4",x2:"20",y1:"12",y2:"12"}]];Pe(e,Se({name:"strikethrough"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Ih(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["circle",{cx:"12",cy:"12",r:"4"}],["path",{d:"M12 2v2"}],["path",{d:"M12 20v2"}],["path",{d:"m4.93 4.93 1.41 1.41"}],["path",{d:"m17.66 17.66 1.41 1.41"}],["path",{d:"M2 12h2"}],["path",{d:"M20 12h2"}],["path",{d:"m6.34 17.66-1.41 1.41"}],["path",{d:"m19.07 4.93-1.41 1.41"}]];Pe(e,Se({name:"sun"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Ah(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M21 5H3"}],["path",{d:"M21 12H9"}],["path",{d:"M21 19H7"}]];Pe(e,Se({name:"text-align-end"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function jh(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M21 5H3"}],["path",{d:"M17 12H7"}],["path",{d:"M19 19H5"}]];Pe(e,Se({name:"text-align-center"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Nh(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M21 5H3"}],["path",{d:"M15 12H3"}],["path",{d:"M17 19H3"}]];Pe(e,Se({name:"text-align-start"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Lh(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"}]];Pe(e,Se({name:"thermometer"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Rh(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M10 11v6"}],["path",{d:"M14 11v6"}],["path",{d:"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"}],["path",{d:"M3 6h18"}],["path",{d:"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"}]];Pe(e,Se({name:"trash-2"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Dh(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M13.73 4a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"}]];Pe(e,Se({name:"triangle"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function dd(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M12 4v16"}],["path",{d:"M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2"}],["path",{d:"M9 20h6"}]];Pe(e,Se({name:"type"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Gh(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M6 4v6a6 6 0 0 0 12 0V4"}],["line",{x1:"4",x2:"20",y1:"20",y2:"20"}]];Pe(e,Se({name:"underline"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Oh(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M9 14 4 9l5-5"}],["path",{d:"M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"}]];Pe(e,Se({name:"undo-2"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Bh(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71"}],["path",{d:"m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71"}],["line",{x1:"8",x2:"8",y1:"2",y2:"5"}],["line",{x1:"2",x2:"5",y1:"8",y2:"8"}],["line",{x1:"16",x2:"16",y1:"19",y2:"22"}],["line",{x1:"19",x2:"22",y1:"16",y2:"16"}]];Pe(e,Se({name:"unlink"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Ii(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M18 6 6 18"}],["path",{d:"m6 6 12 12"}]];Pe(e,Se({name:"x"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function qh(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["path",{d:"M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"}]];Pe(e,Se({name:"zap"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function ud(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["circle",{cx:"11",cy:"11",r:"8"}],["line",{x1:"21",x2:"16.65",y1:"21",y2:"16.65"}],["line",{x1:"11",x2:"11",y1:"8",y2:"14"}],["line",{x1:"8",x2:"14",y1:"11",y2:"11"}]];Pe(e,Se({name:"zoom-in"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}function Yh(e,t){const r=ze(t,["children","$$slots","$$events","$$legacy"]);/**
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
 */const o=[["circle",{cx:"11",cy:"11",r:"8"}],["line",{x1:"21",x2:"16.65",y1:"21",y2:"16.65"}],["line",{x1:"8",x2:"14",y1:"11",y2:"11"}]];Pe(e,Se({name:"zoom-out"},()=>r,{get iconNode(){return o},children:(i,a)=>{var l=ue(),s=W(l);Me(s,t,"default",{}),m(i,l)},$$slots:{default:!0}}))}var Xh=G("<button><!></button>"),Hh=G('<button class="icon-btn svelte-84a5bx"><!></button>'),Uh=G('<div class="icon-panel svelte-84a5bx"><div class="tool-section svelte-84a5bx"></div> <div class="separator svelte-84a5bx"></div> <div class="component-section svelte-84a5bx"></div> <div class="spacer svelte-84a5bx"></div> <div class="separator svelte-84a5bx"></div> <div class="panel-toggles svelte-84a5bx"><button title="Toggle Display Panel"><!></button> <button title="Toggle Component Tree"><!></button> <button title="Toggle Properties Panel"><!></button></div></div>');function Wh(e,t){let r=K(t,"showDisplayPanel",3,!0),o=K(t,"showPropertiesPanel",3,!0),i=K(t,"showTreePanel",3,!0),a=K(t,"onToggleDisplay",3,()=>{}),l=K(t,"onToggleProperties",3,()=>{}),s=K(t,"onToggleTree",3,()=>{}),c=ae("select");const d=[{id:"select",icon:ch,label:"Select"},{id:"move",icon:id,label:"Move"},{id:"zoom",icon:ud,label:"Zoom"}],u=[{id:"button",icon:ld,label:"Button"},{id:"label",icon:dd,label:"Label"},{id:"slider",icon:Mh,label:"Slider"},{id:"combobox",icon:$l,label:"ComboBox"},{id:"backdrop",icon:cd,label:"Backdrop"},{id:"grid",icon:ed,label:"Grid"},{id:"envelope",icon:wf,label:"Envelope"},{id:"filter",icon:Gf,label:"Filter"}];var p=Uh(),v=h(p);Xe(v,21,()=>d,at,(R,k)=>{var M=Xh();let L;var F=h(M);$o(F,()=>n(k).icon,(Y,q)=>{q(Y,{size:18,strokeWidth:1.5})}),te(()=>{L=Te(M,1,"icon-btn svelte-84a5bx",null,L,{active:n(c)===n(k).id}),fe(M,"title",n(k).label)}),z("click",M,()=>w(c,n(k).id,!0)),m(R,M)});var b=f(v,4);Xe(b,21,()=>u,at,(R,k)=>{var M=Hh(),L=h(M);$o(L,()=>n(k).icon,(F,Y)=>{Y(F,{size:18,strokeWidth:1.5})}),te(()=>fe(M,"title",n(k).label)),m(R,M)});var g=f(b,6),_=h(g);let y;var S=h(_);gh(S,{size:18,strokeWidth:1.5});var T=f(_,2);let I;var $=h(T);bh($,{size:18,strokeWidth:1.5});var x=f(T,2);let D;var j=h(x);mh(j,{size:18,strokeWidth:1.5}),te(()=>{y=Te(_,1,"icon-btn svelte-84a5bx",null,y,{active:r()}),I=Te(T,1,"icon-btn svelte-84a5bx",null,I,{active:i()}),D=Te(x,1,"icon-btn svelte-84a5bx",null,D,{active:o()})}),z("click",_,function(...R){var k;(k=a())==null||k.apply(this,R)}),z("click",T,function(...R){var k;(k=s())==null||k.apply(this,R)}),z("click",x,function(...R){var k;(k=l())==null||k.apply(this,R)}),m(e,p)}tt(["click"]);function Qo(e,t){const r=[...e].sort((l,s)=>l.position-s.position);let o=typeof t=="number"?t:t==="hard"?100:0;if(o=Math.max(0,Math.min(100,o)),o===0)return r.map(l=>`#${l.color} ${l.position}%`).join(", ");const i=o/100,a=[];for(let l=0;l<r.length;l++){const s=r[l],c=r[l+1];if(!c)a.push(`#${s.color} ${s.position}%`);else{const d=(s.position+c.position)/2,u=s.position+(d-s.position)*i,p=c.position-(c.position-d)*i;a.push(`#${s.color} ${s.position}%`),a.push(`#${s.color} ${u}%`),a.push(`#${c.color} ${p}%`)}}return a.join(", ")}function oo(e,t="rectangle"){var c,d,u,p,v;if(!e||!e.stops||e.stops.length<2)return"#333333";const r=Qo(e.stops,e.edge??"soft"),o=e.angle??90,i=e.centerX??50,a=e.centerY??50,l=e.radiusX??50,s=t==="circle"||t==="square"?l:e.radiusY??50;switch(e.type){case"linear":return`linear-gradient(${o}deg, ${r})`;case"radial":return`radial-gradient(ellipse ${l}% ${s}% at ${i}% ${a}%, ${r})`;case"conical":return`conic-gradient(from ${o}deg at ${i}% ${a}%, ${r})`;case"radialRamp":{const g=[...e.stops].sort((y,S)=>y.position-S.position).map(y=>({...y,position:parseFloat((y.position/100*l).toFixed(1))})),_=Qo(g,e.edge??0);return`repeating-radial-gradient(ellipse at ${i}% ${a}%, ${_})`}case"linearRamp":{const b=[...e.stops].sort((S,T)=>S.position-T.position),g=l,_=b.map(S=>({...S,position:parseFloat((S.position/100*g).toFixed(1))})),y=Qo(_,e.edge??0);return`repeating-linear-gradient(${o}deg, ${y})`}case"squareRamp":return"#333";case"duotone":{const b=[...e.stops].sort((y,S)=>y.position-S.position),g=((c=b[0])==null?void 0:c.color)||"000000",_=((d=b[b.length-1])==null?void 0:d.color)||"FFFFFF";return`linear-gradient(${o}deg, #${g} 0%, #${_} 100%)`}case"tricolor":{const b=[...e.stops].sort((S,T)=>S.position-T.position),g=((u=b[0])==null?void 0:u.color)||"000000",_=((p=b[Math.floor(b.length/2)])==null?void 0:p.color)||"888888",y=((v=b[b.length-1])==null?void 0:v.color)||"FFFFFF";return`linear-gradient(${o}deg, #${g} 0%, #${_} 50%, #${y} 100%)`}case"banding":{const b=Qo(e.stops,"hard");return`linear-gradient(${o}deg, ${b})`}case"reflected":{const b=[...e.stops].sort((_,y)=>_.position-y.position),g=[];for(let _=b.length-1;_>=0;_--){const y=50-b[_].position/100*50;g.push(`#${b[_].color} ${y}%`)}for(let _=1;_<b.length;_++){const y=50+b[_].position/100*50;g.push(`#${b[_].color} ${y}%`)}return`linear-gradient(${o}deg, ${g.join(", ")})`}case"mesh":case"volumeMesh":return(e.meshPoints||e.stops.map((g,_)=>({x:_/Math.max(e.stops.length-1,1)*80+10,y:_%2*60+20,color:g.color}))).map(g=>`radial-gradient(circle at ${g.x}% ${g.y}%, #${g.color} 0%, transparent 70%)`).join(", ");default:return`linear-gradient(${e.angle}deg, ${r})`}}function vd(e){return""}function fd(e){return(e==null?void 0:e.type)==="volumeMesh"?"blur(50px)":""}function Vh(e,t){const r=[...e].sort((b,g)=>b.position-g.position);if(t<=r[0].position)return r[0].color;if(t>=r[r.length-1].position)return r[r.length-1].color;let o=r[0],i=r[r.length-1];for(let b=0;b<r.length-1;b++)if(t>=r[b].position&&t<=r[b+1].position){o=r[b],i=r[b+1];break}const a=(t-o.position)/(i.position-o.position),l=parseInt(o.color.slice(0,2),16),s=parseInt(o.color.slice(2,4),16),c=parseInt(o.color.slice(4,6),16),d=parseInt(i.color.slice(0,2),16),u=parseInt(i.color.slice(2,4),16),p=parseInt(i.color.slice(4,6),16),v=b=>Math.round(b).toString(16).padStart(2,"0").toUpperCase();return v(l+(d-l)*a)+v(s+(u-s)*a)+v(c+(p-c)*a)}function Kh(e,t){const r=[...e].sort((v,b)=>v.position-b.position);if(t<=r[0].position){const v=r[0].color;return[parseInt(v.slice(0,2),16),parseInt(v.slice(2,4),16),parseInt(v.slice(4,6),16)]}if(t>=r[r.length-1].position){const v=r[r.length-1].color;return[parseInt(v.slice(0,2),16),parseInt(v.slice(2,4),16),parseInt(v.slice(4,6),16)]}let o=r[0],i=r[r.length-1];for(let v=0;v<r.length-1;v++)if(t>=r[v].position&&t<=r[v+1].position){o=r[v],i=r[v+1];break}const a=(t-o.position)/(i.position-o.position),l=parseInt(o.color.slice(0,2),16),s=parseInt(o.color.slice(2,4),16),c=parseInt(o.color.slice(4,6),16),d=parseInt(i.color.slice(0,2),16),u=parseInt(i.color.slice(2,4),16),p=parseInt(i.color.slice(4,6),16);return[Math.round(l+(d-l)*a),Math.round(s+(u-s)*a),Math.round(c+(p-c)*a)]}function hd(e,t=256,r=256){const o=document.createElement("canvas");o.width=t,o.height=r;const i=o.getContext("2d"),a=i.createImageData(t,r),l=(e.centerX??50)/100*t,s=(e.centerY??50)/100*r,c=(e.radiusX??50)/100*t,d=(e.radiusY??50)/100*r,u=e.stops||[];for(let p=0;p<r;p++)for(let v=0;v<t;v++){const b=Math.abs(v-l)/(c||1),g=Math.abs(p-s)/(d||1);let _=Math.max(b,g);_=_%1;const y=_*100,[S,T,I]=Kh(u,y),$=(p*t+v)*4;a.data[$]=S,a.data[$+1]=T,a.data[$+2]=I,a.data[$+3]=255}return i.putImageData(a,0,0),o.toDataURL()}function ss(e){const t=String(e).replace(/^#/,"");if(t.length===8){const a=parseInt(t.slice(0,2),16)/255,l=parseInt(t.slice(2,4),16),s=parseInt(t.slice(4,6),16),c=parseInt(t.slice(6,8),16);return`rgba(${l},${s},${c},${a.toFixed(3)})`}const r=parseInt(t.slice(0,2),16),o=parseInt(t.slice(2,4),16),i=parseInt(t.slice(4,6),16);return`rgba(${r},${o},${i},0.06)`}function Zh(e,t,r,o,i,a,l,s,c,d){const u=[],v={"top-left":"left top",top:"center top","top-right":"right top",left:"left center",center:"center center",right:"right center","bottom-left":"left bottom",bottom:"center bottom","bottom-right":"right bottom"}[t]||"center center",b=[];if(s){const g=Math.abs(s*Math.PI/180),_=Math.cos(g),y=Math.sin(g),S=c||1,T=d||1,I=S*_+T*y,$=S*y+T*_,x=Math.max(I/S,$/T);b.push(`rotate(${s}deg)`),x>1&&b.push(`scale(${x.toFixed(4)})`)}switch(i&&b.push("scaleX(-1)"),a&&b.push("scaleY(-1)"),(r||o)&&b.push(`translate(${r||0}px, ${o||0}px)`),b.length&&u.push(`transform: ${b.join(" ")};`),e){case"fill":u.push("background-size: cover;"),u.push(`background-position: ${v};`),u.push("background-repeat: no-repeat;");break;case"fit":u.push("background-size: contain;"),u.push(`background-position: ${v};`),u.push("background-repeat: no-repeat;");break;case"stretch":u.push("background-size: 100% 100%;"),u.push("background-repeat: no-repeat;");break;case"tile":{const g=(l||1)*25;u.push(`background-size: ${g}%;`),u.push(`background-position: ${v};`),u.push("background-repeat: repeat;");break}case"original":u.push("background-size: auto;"),u.push(`background-position: ${v};`),u.push("background-repeat: no-repeat;");break;default:u.push("background-size: cover;"),u.push("background-repeat: no-repeat;")}return u.join(" ")}function Jh(e){if(!e||e.bgSolid===!1)return"";const t=String(e.bgColour||"FF2A2A2A");if(t.length===8){const r=parseInt(t.slice(0,2),16)/255;return`background: #${t.slice(2)}; opacity: ${r.toFixed(3)};`}return`background: #${t};`}function Qh(e){if(!e||!e.bgGradientEnabled||!e.bgGradient)return null;const t=(e.bgGradientOpacity??100)/100;return`background: ${oo(e.bgGradient)}; opacity: ${t};`}function cs(e,t,r){if(!e||!r)return null;const o=e[`bg${t}Enabled`],i=e[`bg${t}`];if(!o||!i)return null;const a=Zh(e[`bg${t}Fit`],e[`bg${t}Align`],e[`bg${t}OffsetX`],e[`bg${t}OffsetY`],e[`bg${t}FlipH`],e[`bg${t}FlipV`],e[`bg${t}TileScale`],e[`bg${t}Rotation`],e.width,e.height),l=(e[`bg${t}Opacity`]??100)/100,s=e[`bg${t}Blend`]||"normal",c=e[`bg${t}Blur`]||0,d=e[`bg${t}Saturation`]??100,u=e[`bg${t}Brightness`]??100,p=e[`bg${t}Contrast`]??100,v=e[`bg${t}Tint`]??"FFFFFF";let b=`background-image: url('${r}'); ${a}`;b+=` opacity: ${l}; mix-blend-mode: ${s};`;const g=[];if(c>0&&g.push(`blur(${c}px)`),e[`bg${t}Grayscale`]&&g.push("grayscale(100%)"),d!==100&&g.push(`saturate(${d}%)`),u!==100&&g.push(`brightness(${u}%)`),p!==100&&g.push(`contrast(${p}%)`),g.length&&(b+=` filter: ${g.join(" ")};`),v&&v!=="FFFFFF"){const _=parseInt(v.slice(0,2),16),y=parseInt(v.slice(2,4),16),S=parseInt(v.slice(4,6),16);b+=` box-shadow: inset 0 0 0 9999px rgba(${_},${y},${S},0.3);`}return b}function ep(e,t){if(!e)return{x:0,y:0};let r=e.gridOriginX??0,o=e.gridOriginY??0;if(e.gridCentered&&t>0){const i=e.gridSubdivision??1,a=i>1?t*i:t,l=Math.round(e.width/a),s=Math.round(e.height/a);r=-(l*a-e.width)/2,o=-(s*a-e.height)/2}return{x:r,y:o}}function tp(e,{gridEnabled:t,gridSize:r,gridColour:o,gridLineWidth:i}){if(!t||r<=0)return"";const a=ss(o),l=i,s=(e==null?void 0:e.gridType)??"lines",c=(e==null?void 0:e.gridSubdivision)??1;let d=(e==null?void 0:e.gridOriginX)??0,u=(e==null?void 0:e.gridOriginY)??0;if(e!=null&&e.gridCentered){const p=c>1?r*c:r,v=Math.round(e.width/p),b=Math.round(e.height/p);d=-(v*p-e.width)/2-1.5,u=-(b*p-e.height)/2-1.5}if(s==="dots")return`
      background-image: radial-gradient(circle, ${a} ${l}px, transparent ${l}px);
      background-size: ${r}px ${r}px;
      background-position: ${d}px ${u}px;
    `;if(s==="crosses"){const p=Math.max(2,Math.round(r*.2)),v=`<svg xmlns='http://www.w3.org/2000/svg' width='${r}' height='${r}'><line x1='${r/2-p}' y1='${r/2}' x2='${r/2+p}' y2='${r/2}' stroke='${a}' stroke-width='${l}'/><line x1='${r/2}' y1='${r/2-p}' x2='${r/2}' y2='${r/2+p}' stroke='${a}' stroke-width='${l}'/></svg>`;return`
      background-image: url("data:image/svg+xml,${encodeURIComponent(v)}");
      background-size: ${r}px ${r}px;
      background-position: ${d}px ${u}px;
    `}if(c>1){const p=r*c,v=Math.max(l+1,l*2),b=ss((e==null?void 0:e.gridSubColour)??"55FFFFFF");return`
      background-image:
        linear-gradient(${b} ${v}px, transparent ${v}px),
        linear-gradient(90deg, ${b} ${v}px, transparent ${v}px),
        linear-gradient(${a} ${l}px, transparent ${l}px),
        linear-gradient(90deg, ${a} ${l}px, transparent ${l}px);
      background-size: ${p}px ${p}px, ${p}px ${p}px, ${r}px ${r}px, ${r}px ${r}px;
      background-position: ${d}px ${u}px;
    `}return`
    background-image:
      linear-gradient(${a} ${l}px, transparent ${l}px),
      linear-gradient(90deg, ${a} ${l}px, transparent ${l}px);
    background-size: ${r}px ${r}px;
    background-position: ${d}px ${u}px;
  `}function np(e,t){var R,k;const{panel:r,panelLocked:o,gridSize:i,editorZoom:a,editorZoomIncrement:l,selectedComponentIds:s,fitToWindow:c,zoomToSelection:d,selectAll:u,pasteSelection:p,copySelection:v,cutSelection:b,duplicateControl:g,removeControl:_,updateControlProperty:y,deleteSelectedGuide:S}=t;if(!r)return;const T=e.ctrlKey||e.metaKey;if(T&&(e.key==="="||e.key==="+")){e.preventDefault(),a.update(M=>Math.min(400,M+l));return}if(T&&e.key==="-"){e.preventDefault(),a.update(M=>Math.max(10,M-l));return}if(T&&e.key==="0"){e.preventDefault(),c();return}if(T&&e.shiftKey&&(e.key==="P"||e.key==="p")){e.preventDefault(),d();return}if(T&&e.key==="a"){e.preventDefault(),u();return}if(T&&e.key==="v"){e.preventDefault(),p();return}if((e.key==="Delete"||e.key==="Backspace")&&S()){e.preventDefault();return}const I=s;if(I.size===0)return;const $=r.controls.filter(M=>{var L,F;return I.has((F=(L=M._children)==null?void 0:L.Core)==null?void 0:F.id)});if($.length===0)return;if(T&&e.key==="c"){e.preventDefault(),v();return}if(T&&e.key==="x"){e.preventDefault(),b();return}if(e.key==="Delete"||e.key==="Backspace"){e.preventDefault();for(const M of[...I])_(M);return}if(T&&e.key==="d"){e.preventDefault(),g(I);return}if(o||$.some(M=>{var L,F;return(F=(L=M._children)==null?void 0:L.Core)==null?void 0:F.locked}))return;const x={ArrowLeft:"x",ArrowRight:"x",ArrowUp:"y",ArrowDown:"y"}[e.key];if(!x)return;const D=e.key==="ArrowLeft"||e.key==="ArrowUp"?-1:1,j=(e.shiftKey?i:1)*D;e.preventDefault();for(const M of $){const L=((k=(R=M._children)==null?void 0:R.Transform)==null?void 0:k[x])??0;y(M._children.Core.id,`Transform.${x}`,L+j)}}function rp(e,t,r){const o=new Set;for(const i of e){const a=r(i,"Transform"),l=r(i,"Core");!a||!l||a.x<t.x+t.w&&a.x+a.width>t.x&&a.y<t.y+t.h&&a.y+a.height>t.y&&o.add(l.id)}return o}function op(e,t,r){return e.find(o=>{var a;const i=(a=o._children)==null?void 0:a.Transform;return i?t>=i.x&&t<=i.x+i.width&&r>=i.y&&r<=i.y+i.height:!1})??null}function ip(e,{getViewport:t,onRightClick:r}){let o={x:0,y:0,scrollX:0,scrollY:0},i=!1,a=-1;function l(v){const b=t();b&&(e.isPanning=!0,i=!1,a=v.button,o={x:v.clientX,y:v.clientY,scrollX:b.scrollLeft,scrollY:b.scrollTop},window.addEventListener("mousemove",s),window.addEventListener("mouseup",c))}function s(v){const b=t();if(!e.isPanning||!b)return;const g=v.clientX-o.x,_=v.clientY-o.y;(Math.abs(g)>2||Math.abs(_)>2)&&(i=!0),b.scrollLeft=o.scrollX-g,b.scrollTop=o.scrollY-_}function c(v){const b=a===2,g=i;e.isPanning=!1,a=-1,window.removeEventListener("mousemove",s),window.removeEventListener("mouseup",c),b&&!g&&v&&(r==null||r(v.clientX,v.clientY))}function d(v){return v.button===1?(v.preventDefault(),l(v),!0):v.button===2?(l(v),!0):v.button===0&&e.spaceHeld?(v.preventDefault(),v.stopPropagation(),l(v),!0):!1}function u(v){v.key===" "&&!v.repeat&&!v.target.closest("input, textarea")&&(e.spaceHeld=!0)}function p(v){v.key===" "&&(e.spaceHeld=!1,e.isPanning&&c())}return{handleMouseDown:d,handleKeyDown:u,handleKeyUp:p}}function ap(e,{getSurface:t,getScale:r,isBlocked:o,onSelect:i}){function a(){const d=Math.min(e.start.x,e.end.x),u=Math.min(e.start.y,e.end.y),p=Math.max(e.start.x,e.end.x),v=Math.max(e.start.y,e.end.y);return{x:d,y:u,w:p-d,h:v-u}}function l(d){if(d.button!==0||o!=null&&o())return;const u=t();if(!u||d.target!==u&&!d.target.classList.contains("grid-overlay")&&!d.target.classList.contains("bg-layer"))return;d.preventDefault();const p=u.getBoundingClientRect(),v=r(),b=(d.clientX-p.left)/v,g=(d.clientY-p.top)/v;e.isActive=!0,e.start={x:b,y:g},e.end={x:b,y:g},window.addEventListener("mousemove",s),window.addEventListener("mouseup",c)}function s(d){if(!e.isActive)return;const u=t();if(!u)return;const p=u.getBoundingClientRect(),v=r();e.end={x:(d.clientX-p.left)/v,y:(d.clientY-p.top)/v}}function c(){e.isActive&&(window.removeEventListener("mousemove",s),window.removeEventListener("mouseup",c),e.isActive=!1,i==null||i(a()),window.addEventListener("click",d=>{var u,p;(p=(u=d.target)==null?void 0:u.closest)!=null&&p.call(u,".panel-surface, .canvas-viewport")&&(d.stopPropagation(),d.preventDefault())},{once:!0,capture:!0}))}return{handleMouseDown:l,getRect:a}}const lp=10,sp=400,kl=e=>Math.max(lp,Math.min(sp,e));function cp(e,t,r=80){if(!e||!t)return null;const o=t.clientWidth-r,i=t.clientHeight-r,a=o/e.width,l=i/e.height;return kl(Math.round(Math.min(a,l)*100))}function dp(e,t){var l,s,c;if(!e||!t||t.size===0)return null;let r=1/0,o=1/0,i=-1/0,a=-1/0;for(const d of e.controls){if(!t.has((s=(l=d._children)==null?void 0:l.Core)==null?void 0:s.id))continue;const u=(c=d._children)==null?void 0:c.Transform;u&&(r=Math.min(r,u.x),o=Math.min(o,u.y),i=Math.max(i,u.x+u.width),a=Math.max(a,u.y+u.height))}return r===1/0?null:{minX:r,minY:o,maxX:i,maxY:a}}function up(e,t,r,o=60){if(!e||!t)return null;const i=dp(e,r);if(!i)return null;const a=i.maxX-i.minX,l=i.maxY-i.minY,s=t.clientWidth-o*2,c=t.clientHeight-o*2,d=kl(Math.round(Math.min(s/a,c/l)*100)),u=d/100,p=(i.minX+i.maxX)/2,v=(i.minY+i.maxY)/2;return{zoom:d,scrollLeft:p*u+40-t.clientWidth/2,scrollTop:v*u+40-t.clientHeight/2}}function vp(e,t,r,o=10){if(!e)return null;const i=e.getBoundingClientRect(),a=t.clientX-i.left+e.scrollLeft,l=t.clientY-i.top+e.scrollTop,s=t.deltaY<0?o:-o,c=kl(r+s);if(c===r)return null;const d=c/r;return{zoom:c,scrollLeft:a*d-(t.clientX-i.left),scrollTop:l*d-(t.clientY-i.top)}}function fp({getViewport:e,getPanel:t,getSelection:r,editorZoom:o,getZoom:i}){function a(d,u=!1){if(!d)return;o.set(d.zoom);const p=e();if(!p)return;const v=()=>{p&&(p.scrollLeft=d.scrollLeft,p.scrollTop=d.scrollTop)};u?requestAnimationFrame(v):v()}function l(d){const u=e(),p=t();!u||!p||!d.ctrlKey&&!d.metaKey||(d.preventDefault(),a(vp(u,d,i())))}function s(){const d=t(),u=e(),p=cp(d,u);p!=null&&o.set(p)}function c(){const d=t(),u=e();a(up(d,u,r()),!0)}return{handleWheel:l,fitToWindow:s,zoomToSelection:c}}function hp(e,t){const r=t();if(!r)return()=>{};const o=()=>{e.scrollLeft=r.scrollLeft,e.scrollTop=r.scrollTop},i=()=>{e.width=r.clientWidth,e.height=r.clientHeight},a=new ResizeObserver(i);return r.addEventListener("scroll",o,{passive:!0}),a.observe(r),o(),i(),()=>{r.removeEventListener("scroll",o),a.disconnect()}}const yi=Ft({});let pp=0;const $i=new Map;let ds=!1;function gp(){ds||(ds=!0,Kv(e=>{const{requestId:t,data:r}=e,o=$i.get(t);o&&($i.delete(t),yi.update(i=>({...i,[o]:r})))}))}function us(e){if(!e||He(yi)[e])return;if(!qt()){yi.update(o=>({...o,[e]:e}));return}gp();for(const o of $i.values())if(o===e)return;const r=`file_${++pp}`;$i.set(r,e),Vv(r,e)}var bp=G('<span class="modified-dot svelte-17p2z4b">●</span>'),mp=G('<div><span class="tab-name svelte-17p2z4b"> <!></span> <button class="tab-close svelte-17p2z4b" title="Close"><!></button></div>'),_p=G('<div class="tab-bar svelte-17p2z4b"><div class="tabs svelte-17p2z4b"></div> <button class="new-tab-btn svelte-17p2z4b" title="New Panel"><!></button></div>');function yp(e,t){Ve(t,!0);const r=()=>Ye(yt,"$panels",i),o=()=>Ye(bt,"$activePanelId",i),[i,a]=It();let l=P(r),s=P(o);function c(b,g){b.button===1&&(b.preventDefault(),La(g))}var d=_p(),u=h(d);Xe(u,21,()=>n(l),b=>b.id,(b,g)=>{var _=mp();let y;var S=h(_),T=h(S),I=f(T);{var $=j=>{var R=bp();m(j,R)};xe(I,j=>{n(g).modified&&j($)})}var x=f(S,2),D=h(x);Ii(D,{size:12,strokeWidth:1.5}),te(()=>{y=Te(_,1,"tab svelte-17p2z4b",null,y,{active:n(g).id===n(s)}),Re(T,`${n(g).name??""} `)}),z("click",_,()=>ef(n(g).id)),z("mousedown",_,j=>c(j,n(g).id)),z("click",x,j=>{j.stopPropagation(),La(n(g).id)}),m(b,_)});var p=f(u,2),v=h(p);Fi(v,{size:14,strokeWidth:1.5}),z("click",p,()=>pl()),m(e,d),Ke(),a()}tt(["click","mousedown"]);const vs=Object.freeze({radius:0,borderEnabled:!0,style:"rounded",direction:"outward",borderStyle:"solid",thickness:2,dotRadius:2,doubleGap:2,doubleAnchor:"center",doubleDirection:"outward",colour:"FFFFFFFF"}),$p={tl:"topLeft",tr:"topRight",br:"bottomRight",bl:"bottomLeft"};function fs(e){return{radius:e.radius||0,borderEnabled:e.borderEnabled!==!1,style:e.style||"rounded",direction:e.direction||"outward",borderStyle:e.borderStyle||"solid",thickness:e.thickness||2,dotRadius:e.dotRadius||2,doubleGap:e.doubleGap??2,doubleAnchor:e.doubleAnchor||"center",doubleDirection:e.doubleDirection||"outward",colour:e.colour||"FFFFFFFF"}}function xr(e,t){if(!e)return{...vs};if(e.linked)return fs(e);const r=e[$p[t]];return r?fs(r):{...vs}}function xp(e,t,r,o,i,a,l){const s=e.style||"rounded",c=e.direction||"outward",d=o,u=r+i;if(r<=0)switch(t){case"tl":return`M ${d} ${d}`;case"tr":return`M ${a-d} ${d}`;case"br":return`M ${a-d} ${l-d}`;case"bl":return`M ${d} ${l-d}`}if(s==="rounded"){const p=Math.max(0,u-d);if(p<=0)switch(t){case"tl":return`M ${d} ${d}`;case"tr":return`M ${a-d} ${d}`;case"br":return`M ${a-d} ${l-d}`;case"bl":return`M ${d} ${l-d}`}const v=c==="inward"?0:1;switch(t){case"tl":return`M ${d} ${p+d} A ${p} ${p} 0 0 ${v} ${p+d} ${d}`;case"tr":return`M ${a-p-d} ${d} A ${p} ${p} 0 0 ${v} ${a-d} ${p+d}`;case"br":return`M ${a-d} ${l-p-d} A ${p} ${p} 0 0 ${v} ${a-p-d} ${l-d}`;case"bl":return`M ${p+d} ${l-d} A ${p} ${p} 0 0 ${v} ${d} ${l-p-d}`}}if(s==="chamfer")switch(t){case"tl":return`M ${d} ${u} L ${u} ${d}`;case"tr":return`M ${a-u} ${d} L ${a-d} ${u}`;case"br":return`M ${a-d} ${l-u} L ${a-u} ${l-d}`;case"bl":return`M ${u} ${l-d} L ${d} ${l-u}`}if(s==="notch")switch(t){case"tl":return`M ${d} ${u} L ${u} ${u} L ${u} ${d}`;case"tr":return`M ${a-u} ${d} L ${a-u} ${u} L ${a-d} ${u}`;case"br":return`M ${a-d} ${l-u} L ${a-u} ${l-u} L ${a-u} ${l-d}`;case"bl":return`M ${u} ${l-d} L ${u} ${l-u} L ${d} ${l-u}`}switch(t){case"tl":return`M ${d} ${u} L ${d} ${d} L ${u} ${d}`;case"tr":return`M ${a-u} ${d} L ${a-d} ${d} L ${a-d} ${u}`;case"br":return`M ${a-d} ${l-u} L ${a-d} ${l-d} L ${a-u} ${l-d}`;case"bl":return`M ${u} ${l-d} L ${d} ${l-d} L ${d} ${l-u}`}}function wp(e,t,r){const{tl:o,tr:i,br:a,bl:l}=e,s=[],c=ei(o,"tl",t,r);s.push(`M ${c.start}`),s.push(c.path);const d=ei(i,"tr",t,r);s.push(`L ${d.start}`),s.push(d.path);const u=ei(a,"br",t,r);s.push(`L ${u.start}`),s.push(u.path);const p=ei(l,"bl",t,r);return s.push(`L ${p.start}`),s.push(p.path),s.push("Z"),`clip-path: path('${s.join(" ")}');`}function ei(e,t,r,o){const i=e.radius||0,a=e.style||"rounded",l=e.direction||"outward";if(i===0||a==="straight")switch(t){case"tl":return{start:"0 0",path:""};case"tr":return{start:`${r} 0`,path:""};case"br":return{start:`${r} ${o}`,path:""};case"bl":return{start:`0 ${o}`,path:""}}if(a==="rounded"&&l==="inward")switch(t){case"tl":return{start:`0 ${i}`,path:`A ${i} ${i} 0 0 0 ${i} 0`};case"tr":return{start:`${r-i} 0`,path:`A ${i} ${i} 0 0 0 ${r} ${i}`};case"br":return{start:`${r} ${o-i}`,path:`A ${i} ${i} 0 0 0 ${r-i} ${o}`};case"bl":return{start:`${i} ${o}`,path:`A ${i} ${i} 0 0 0 0 ${o-i}`}}if(a==="rounded")switch(t){case"tl":return{start:`0 ${i}`,path:`A ${i} ${i} 0 0 1 ${i} 0`};case"tr":return{start:`${r-i} 0`,path:`A ${i} ${i} 0 0 1 ${r} ${i}`};case"br":return{start:`${r} ${o-i}`,path:`A ${i} ${i} 0 0 1 ${r-i} ${o}`};case"bl":return{start:`${i} ${o}`,path:`A ${i} ${i} 0 0 1 0 ${o-i}`}}if(a==="chamfer"){const s=i;switch(t){case"tl":return{start:`0 ${s}`,path:`L ${s} 0`};case"tr":return{start:`${r-s} 0`,path:`L ${r} ${s}`};case"br":return{start:`${r} ${o-s}`,path:`L ${r-s} ${o}`};case"bl":return{start:`${s} ${o}`,path:`L 0 ${o-s}`}}}if(a==="notch")switch(t){case"tl":return{start:`0 ${i}`,path:`L ${i} ${i} L ${i} 0`};case"tr":return{start:`${r-i} 0`,path:`L ${r-i} ${i} L ${r} ${i}`};case"br":return{start:`${r} ${o-i}`,path:`L ${r-i} ${o-i} L ${r-i} ${o}`};case"bl":return{start:`${i} ${o}`,path:`L ${i} ${o-i} L 0 ${o-i}`}}switch(t){case"tl":return{start:"0 0",path:""};case"tr":return{start:`${r} 0`,path:""};case"br":return{start:`${r} ${o}`,path:""};case"bl":return{start:`0 ${o}`,path:""}}}function kp(e,t,r){const o=(e??0)*Math.PI/180,i=t/2,a=r/2,l=Math.sin(o)*t/2,s=-Math.cos(o)*r/2;return{x1:i-l,y1:a-s,x2:i+l,y2:a+s}}function pd(e){const t=e.replace("#","").slice(-6);return[parseInt(t.slice(0,2),16),parseInt(t.slice(2,4),16),parseInt(t.slice(4,6),16)]}function gd(e,t,r){const o=i=>Math.max(0,Math.min(255,Math.round(i))).toString(16).padStart(2,"0");return`#${o(e)}${o(t)}${o(r)}`}function ti(e,t=.55){const[r,o,i]=pd(e);return gd(r*t,o*t,i*t)}function ni(e,t=.4){const[r,o,i]=pd(e);return gd(r+(255-r)*t,o+(255-o)*t,i+(255-i)*t)}function bd(e,t,r,o,i=2){const a="none",l="butt";if(e==="dashed")return{totalThick:t,layers:[{thick:t,colour:r,dasharray:`${t*3} ${t*2}`,offset:0,linecap:l}]};if(e==="dotted"){const s=Math.max(1,i*2),c=Math.max(1,t);return{totalThick:s,layers:[{thick:s,colour:r,dasharray:`0.001 ${c+s}`,offset:0,linecap:"round"}]}}if(e==="groove"){const s=Math.max(1,t/2);return{totalThick:t,layers:[{thick:s,colour:ti(r),dasharray:a,offset:-s/2,linecap:l},{thick:s,colour:ni(r),dasharray:a,offset:s/2,linecap:l}]}}if(e==="ridge"){const s=Math.max(1,t/2);return{totalThick:t,layers:[{thick:s,colour:ni(r),dasharray:a,offset:-s/2,linecap:l},{thick:s,colour:ti(r),dasharray:a,offset:s/2,linecap:l}]}}return e==="inset"?{totalThick:t,layers:[{thick:t,colour:o==="top"||o==="left"?ti(r):ni(r),dasharray:a,offset:0,linecap:l}]}:e==="outset"?{totalThick:t,layers:[{thick:t,colour:o==="bottom"||o==="right"?ti(r):ni(r),dasharray:a,offset:0,linecap:l}]}:{totalThick:t,layers:[{thick:t,colour:r,dasharray:a,offset:0,linecap:l}]}}const na=new Set(["groove","ridge","inset","outset"]),Cp={tl:["top","left"],tr:["top","right"],br:["bottom","right"],bl:["bottom","left"]};function ri(e,t){if(!(e!=null&&e.enabled))return!1;if(e.linked)return!0;const r=e[t];return r&&r.style!=="none"&&r.thickness>0}function oi(e,t){return xr(e,t).borderEnabled}function ii(e,t){const r=e!=null&&e.linked?e:(e==null?void 0:e[t])??e,o=(r==null?void 0:r.thickness)||2,i=(r==null?void 0:r.dotRadius)||2,a=`#${((r==null?void 0:r.colour)||"FFFFFFFF").slice(-6)}`,l=(r==null?void 0:r.style)||"solid";return bd(l,o,a,t,i)}function zp(e,t,r){var v,b;const o=xr(t,r),i=o.thickness||2,a=o.dotRadius||2,l=`#${(o.colour||"FFFFFFFF").slice(-6)}`,s=o.borderStyle||"solid",c=r==="tl"||r==="tr"?"top":"bottom";let d=s;if(e&&!e.linked){const[g,_]=Cp[r],y=(v=e[g])==null?void 0:v.style,S=(b=e[_])==null?void 0:b.style;y&&y!=="none"&&na.has(y)?d=y:S&&S!=="none"&&na.has(S)&&(d=S)}else e!=null&&e.linked&&na.has(e.style)&&(d=e.style);const u=bd(d,i,l,c,a),{layers:p}=u;for(const g of p)if(s==="dashed")g.dasharray=`${g.thick*3} ${g.thick*2}`,g.linecap="butt";else if(s==="dotted"){const _=Math.max(1,a*2);g.thick=_,g.dasharray=`0.001 ${Math.max(1,i)+_}`,g.linecap="round"}else g.dasharray="none",g.linecap="butt";return{totalThick:u.totalThick,layers:p}}function rr(e,t,r,o){if(!e)return Math.max(r,o*2);const i=(t==null?void 0:t.style)||"rounded",a=(t==null?void 0:t.direction)||"outward";return i==="rounded"&&a==="inward"?r+o/2:r}function Mp(e,t,r,o,i,a){return{tl:{px:0,py:0,cx:r,cy:r,arcStart:{x:r,y:0},arcEnd:{x:0,y:r}},tr:{px:e,py:0,cx:e-o,cy:o,arcStart:{x:e-o,y:0},arcEnd:{x:e,y:o}},br:{px:e,py:t,cx:e-i,cy:t-i,arcStart:{x:e-i,y:t},arcEnd:{x:e,y:t-i}},bl:{px:0,py:t,cx:a,cy:t-a,arcStart:{x:a,y:t},arcEnd:{x:0,y:t-a}}}}function Sp(e,t,r,o,i,a,l){if(t==="rounded"){if(r==="inward"){let d,u;switch(e){case"tl":d=i,u=i;break;case"tr":d=a-i,u=i;break;case"br":d=a-i,u=l-i;break;case"bl":d=i,u=l-i;break}return{cornerShape:"rounded",isInward:!0,arcCx:d,arcCy:u,gradAxis:null}}let s,c;switch(e){case"tl":s=o+i,c=o+i;break;case"tr":s=a-o-i,c=o+i;break;case"br":s=a-o-i,c=l-o-i;break;case"bl":s=o+i,c=l-o-i;break}return{cornerShape:"rounded",isInward:!1,arcCx:s,arcCy:c,gradAxis:null}}if(t==="chamfer"){const s=i+o/2;let c;switch(e){case"tl":c={x1:s+i/2,y1:s+i/2,x2:s-i/2,y2:s-i/2};break;case"tr":c={x1:a-s-i/2,y1:s+i/2,x2:a-s+i/2,y2:s-i/2};break;case"br":c={x1:a-s-i/2,y1:l-s-i/2,x2:a-s+i/2,y2:l-s+i/2};break;case"bl":c={x1:s+i/2,y1:l-s-i/2,x2:s-i/2,y2:l-s+i/2};break}return{cornerShape:"linear",isInward:!1,arcCx:void 0,arcCy:void 0,gradAxis:c}}if(t==="straight"){let s;switch(e){case"tl":s={x1:o+i,y1:o+i,x2:0,y2:0};break;case"tr":s={x1:a-o-i,y1:o+i,x2:a,y2:0};break;case"br":s={x1:a-o-i,y1:l-o-i,x2:a,y2:l};break;case"bl":s={x1:o+i,y1:l-o-i,x2:0,y2:l};break}return{cornerShape:"linear",isInward:!1,arcCx:void 0,arcCy:void 0,gradAxis:s}}if(t==="notch"){let s;switch(e){case"tl":s={x1:0,y1:0,x2:o+i,y2:o+i};break;case"tr":s={x1:a,y1:0,x2:a-o-i,y2:o+i};break;case"br":s={x1:a,y1:l,x2:a-o-i,y2:l-o-i};break;case"bl":s={x1:0,y1:l,x2:o+i,y2:l-o-i};break}return{cornerShape:"linear",isInward:!1,arcCx:void 0,arcCy:void 0,gradAxis:s}}return{cornerShape:"rounded",isInward:!1,arcCx:void 0,arcCy:void 0,gradAxis:null}}function hs(e,t,r,o){const i=[],a=xr(o,"tl"),l=xr(o,"tr"),s=xr(o,"br"),c=xr(o,"bl"),d=a.radius,u=l.radius,p=s.radius,v=c.radius,b=oi(o,"tl"),g=oi(o,"tr"),_=oi(o,"br"),y=oi(o,"bl"),S=b?1:0,T=g?1:0,I=_?1:0,$=y?1:0;if(ri(r,"top")){const{totalThick:j,layers:R}=ii(r,"top"),k=j/2,M=rr(b,a,d,j),L=rr(g,l,u,j);for(const F of R){const Y=k+F.offset;i.push({kind:"side",key:"top",d:`M ${M+k-S} ${Y} L ${e-L-k+T} ${Y}`,thick:F.thick,colour:F.colour,dasharray:F.dasharray,linecap:F.linecap})}}if(ri(r,"right")){const{totalThick:j,layers:R}=ii(r,"right"),k=j/2,M=rr(g,l,u,j),L=rr(_,s,p,j);for(const F of R){const Y=e-k-F.offset;i.push({kind:"side",key:"right",d:`M ${Y} ${M+k-T} L ${Y} ${t-L-k+I}`,thick:F.thick,colour:F.colour,dasharray:F.dasharray,linecap:F.linecap})}}if(ri(r,"bottom")){const{totalThick:j,layers:R}=ii(r,"bottom"),k=j/2,M=rr(_,s,p,j),L=rr(y,c,v,j);for(const F of R){const Y=t-k-F.offset;i.push({kind:"side",key:"bottom",d:`M ${e-M-k+I} ${Y} L ${L+k-$} ${Y}`,thick:F.thick,colour:F.colour,dasharray:F.dasharray,linecap:F.linecap})}}if(ri(r,"left")){const{totalThick:j,layers:R}=ii(r,"left"),k=j/2,M=rr(y,c,v,j),L=rr(b,a,d,j);for(const F of R){const Y=k+F.offset;i.push({kind:"side",key:"left",d:`M ${Y} ${t-M-k+$} L ${Y} ${L+k-S}`,thick:F.thick,colour:F.colour,dasharray:F.dasharray,linecap:F.linecap})}}const x=[{pos:"tl",key:"topLeft",on:b,R:d,cn:{...a,radius:d}},{pos:"tr",key:"topRight",on:g,R:u,cn:{...l,radius:u}},{pos:"br",key:"bottomRight",on:_,R:p,cn:{...s,radius:p}},{pos:"bl",key:"bottomLeft",on:y,R:v,cn:{...c,radius:v}}],D=Mp(e,t,d,u,p,v);for(const{pos:j,key:R,on:k,R:M,cn:L}of x){if(!k)continue;const{totalThick:F,layers:Y}=zp(r,o,j),q=F/2,oe=L.style||"rounded",ee=L.direction||"outward",Z=Sp(j,oe,ee,M,q,e,t);for(const N of Y){const C=q+N.offset,le=xp(L,j,M,C,q,e,t);i.push({kind:"corner",key:R,pos:j,d:le,thick:N.thick,colour:N.colour,dasharray:N.dasharray,linecap:N.linecap,cornerShape:Z.cornerShape,radialIsInward:Z.isInward,gradAxis:Z.gradAxis,geom:{...D[j],R:M,thickness:F,arcCx:Z.arcCx,arcCy:Z.arcCy}})}}return i}function ps(e){if(!(e!=null&&e.enabled))return 0;if(e.linked)return e.style==="double"?e.doubleGap??2:0;for(const t of["top","right","bottom","left"]){const r=e[t];if((r==null?void 0:r.style)==="double")return r.doubleGap??2}return 0}var Pp=$t("<stop></stop>"),Tp=$t('<linearGradient gradientUnits="userSpaceOnUse"></linearGradient>'),Ep=$t("<stop></stop>"),Fp=$t('<linearGradient gradientUnits="userSpaceOnUse" x1="0" x2="0" y2="0"></linearGradient>'),Ip=$t("<stop></stop>"),Ap=$t('<linearGradient gradientUnits="userSpaceOnUse" y1="0" y2="0"></linearGradient>'),jp=$t("<stop></stop>"),Np=$t('<linearGradient gradientUnits="userSpaceOnUse" x1="0" x2="0"></linearGradient>'),Lp=$t("<stop></stop>"),Rp=$t('<linearGradient gradientUnits="userSpaceOnUse" y1="0" x2="0" y2="0"></linearGradient>'),Dp=$t("<stop></stop>"),Gp=$t('<radialGradient gradientUnits="userSpaceOnUse"></radialGradient>'),Op=$t("<stop></stop>"),Bp=$t('<linearGradient gradientUnits="userSpaceOnUse"></linearGradient>'),qp=$t("<stop></stop>"),Yp=$t('<linearGradient gradientUnits="userSpaceOnUse"></linearGradient>'),Xp=$t('<pattern patternUnits="userSpaceOnUse"><image preserveAspectRatio="xMidYMid slice"></image></pattern>'),Hp=$t('<pattern patternUnits="userSpaceOnUse"><image preserveAspectRatio="xMidYMid slice"></image></pattern>'),Up=$t('<path fill="none" stroke-linejoin="round"></path>'),Wp=$t('<path fill="none" stroke-linejoin="round"></path>'),Vp=$t("<g></g>"),Kp=$t('<svg class="bg-border svelte-tbpnsn" xmlns="http://www.w3.org/2000/svg"><defs></defs><g></g><!></svg>'),Zp=G('<div class="bg-fill svelte-tbpnsn"></div> <!>',1);function Jp(e,t){Ve(t,!0);let r=K(t,"background",3,null),o=K(t,"width",3,0),i=K(t,"height",3,0),a=P(()=>{var F,Y;return(Y=(F=r())==null?void 0:F._children)==null?void 0:Y.Fill}),l=P(()=>{var F,Y;return(Y=(F=r())==null?void 0:F._children)==null?void 0:Y.Border}),s=P(()=>{var F,Y;return(Y=(F=r())==null?void 0:F._children)==null?void 0:Y.Corners});const c=F=>xr(n(s),F);let d=P(()=>{var Y,q;if(!r())return"background: transparent;";const F=r().mode||"solid";return F==="solid"&&((Y=n(a))!=null&&Y.colour)?`background: #${n(a).colour.slice(-6)};`:F==="gradient"&&((q=n(a))!=null&&q.Gradient)?`background: ${oo(n(a).Gradient)};`:"background: transparent;"}),u=P(()=>{if(!n(s)||o()<=0||i()<=0)return"";const F=c("tl"),Y=c("tr"),q=c("br"),oe=c("bl");if([F,Y,q,oe].some(B=>B.radius<=0?!1:B.style==="chamfer"||B.style==="notch"||B.style==="rounded"&&B.direction==="inward"))return wp({tl:F,tr:Y,br:q,bl:oe},o(),i());const Z=B=>B.radius>0&&B.style==="rounded"&&B.direction!=="inward"?B.radius:0,N=Z(F),C=Z(Y),le=Z(q),Q=Z(oe);return N===0&&C===0&&le===0&&Q===0?"":`border-radius: ${N}px ${C}px ${le}px ${Q}px;`}),p=P(()=>["position:absolute; inset:0; box-sizing:border-box; pointer-events:none;",n(d),n(u)].filter(Boolean).join(" ")),v=P(()=>{var F;return((F=n(l))==null?void 0:F.enabled)&&o()>0&&i()>0}),b=P(()=>n(v)?hs(o(),i(),n(l),n(s)):[]),g=P(()=>{if(!n(v))return[];const F=ps(n(l));if(F<=0)return[];const Y=o()-2*F,q=i()-2*F;return Y<=0||q<=0?[]:hs(Y,q,n(l),n(s))}),_=P(()=>ps(n(l)));function y(F){return F.kind==="side"?n(l)?n(l).linked?n(l):n(l)[F.key]??n(l):null:n(s)?n(s).linked?n(s):n(s)[F.key]??n(s):null}function S(F){return F?{solid:F.fillSolid!==!1,gradient:!!(F.fillGradient&&F.gradient),image:!!(F.fillImage&&F.imageSrc),overlay:!!(F.fillOverlay&&F.overlaySrc)}:{solid:!0,gradient:!1,image:!1,overlay:!1}}let T=P(()=>[...n(b),...n(g)]);function I(F,Y){const q=Y!=="B";switch(F){case"tl":return q?"top":"left";case"tr":return q?"top":"right";case"br":return q?"bottom":"right";case"bl":return q?"bottom":"left"}return"top"}function $(F){const Y=y(F);return(Y==null?void 0:Y.cornerGradientMode)??"radial"}let x=P(()=>{const F=[],Y=new Set;for(const q of n(T)){const oe=y(q);if(!oe)continue;const ee=S(oe),Z=`${q.kind}_${q.key}`;if(ee.gradient)if(q.kind==="corner"){const N=$(q),C=!!oe.cornerGradientFlip;if(N!=="inherit"){if(N==="tangential"&&q.cornerShape==="rounded"){const le=`grad_${Z}`;Y.has(le)||(Y.add(le),F.push({id:le,type:"cornerTangential",data:oe.gradient,geom:q.geom,flip:C}))}else if(q.cornerShape==="rounded"){const le=q.radialIsInward?!C:C,Q=`grad_${Z}`;Y.has(Q)||(Y.add(Q),F.push({id:Q,type:"cornerRadial",data:oe.gradient,geom:q.geom,flip:le}))}else if(q.cornerShape==="linear"){const le=`grad_${Z}`;Y.has(le)||(Y.add(le),F.push({id:le,type:"cornerLinear",data:oe.gradient,gradAxis:q.gradAxis,flip:C}))}}}else{const N=`grad_${Z}`;if(!Y.has(N)){Y.add(N);const C=oe.thickness||2;F.push({id:N,type:"sideGradient",data:oe.gradient,sideKey:q.key,thickness:C})}}ee.image&&!Y.has(`img_${Z}`)&&(Y.add(`img_${Z}`),F.push({id:`img_${Z}`,type:"image",data:oe.imageSrc})),ee.overlay&&!Y.has(`ovr_${Z}`)&&(Y.add(`ovr_${Z}`),F.push({id:`ovr_${Z}`,type:"overlay",data:oe.overlaySrc}))}return F});function D(F){var Y;return(Y=F==null?void 0:F.stops)!=null&&Y.length?[...F.stops].sort((q,oe)=>q.position-oe.position):[]}function j(F){const Y=y(F);if(!Y)return[{stroke:F.colour}];const q=S(Y),oe=`${F.kind}_${F.key}`,ee=[];if(q.solid&&ee.push({stroke:F.colour}),q.gradient)if(F.kind==="corner")if($(F)==="inherit"){const N=I(F.pos,Y.cornerGradientInheritSide);ee.push({stroke:`url(#grad_side_${N})`})}else ee.push({stroke:`url(#grad_${oe})`});else ee.push({stroke:`url(#grad_${oe})`});return q.image&&ee.push({stroke:`url(#img_${oe})`}),q.overlay&&ee.push({stroke:`url(#ovr_${oe})`}),ee.length===0&&ee.push({stroke:"none"}),ee}var R=Zp(),k=W(R),M=f(k,2);{var L=F=>{var Y=Kp(),q=h(Y);Xe(q,21,()=>n(x),N=>N.id,(N,C)=>{var le=ue(),Q=W(le);{var B=ke=>{const _e=P(()=>D(n(C).data)),ie=P(()=>{var A;return kp((A=n(C).data)==null?void 0:A.angle,o(),i())});var ce=ue(),se=W(ce);{var pe=A=>{var U=Tp();Xe(U,21,()=>n(_e),at,(re,ve)=>{var ye=Pp();te(()=>{fe(ye,"offset",`${n(ve).position??""}%`),fe(ye,"stop-color",`#${n(ve).color??""}`)}),m(re,ye)}),te(()=>{fe(U,"id",n(C).id),fe(U,"x1",n(ie).x1),fe(U,"y1",n(ie).y1),fe(U,"x2",n(ie).x2),fe(U,"y2",n(ie).y2)}),m(A,U)};xe(se,A=>{n(_e).length>=2&&A(pe)})}m(ke,ce)},E=ke=>{const _e=P(()=>D(n(C).data)),ie=P(()=>n(C).thickness);var ce=ue(),se=W(ce);{var pe=A=>{var U=ue(),re=W(U);{var ve=ge=>{var he=Fp();Xe(he,21,()=>n(_e),at,(Ce,be)=>{var $e=Ep();te(()=>{fe($e,"offset",`${n(be).position??""}%`),fe($e,"stop-color",`#${n(be).color??""}`)}),m(Ce,$e)}),te(()=>{fe(he,"id",n(C).id),fe(he,"y1",n(ie))}),m(ge,he)},ye=ge=>{var he=Ap();Xe(he,21,()=>n(_e),at,(Ce,be)=>{var $e=Ip();te(()=>{fe($e,"offset",`${n(be).position??""}%`),fe($e,"stop-color",`#${n(be).color??""}`)}),m(Ce,$e)}),te(()=>{fe(he,"id",n(C).id),fe(he,"x1",o()-n(ie)),fe(he,"x2",o())}),m(ge,he)},O=ge=>{var he=Np();Xe(he,21,()=>n(_e),at,(Ce,be)=>{var $e=jp();te(()=>{fe($e,"offset",`${n(be).position??""}%`),fe($e,"stop-color",`#${n(be).color??""}`)}),m(Ce,$e)}),te(()=>{fe(he,"id",n(C).id),fe(he,"y1",i()-n(ie)),fe(he,"y2",i())}),m(ge,he)},X=ge=>{var he=Rp();Xe(he,21,()=>n(_e),at,(Ce,be)=>{var $e=Lp();te(()=>{fe($e,"offset",`${n(be).position??""}%`),fe($e,"stop-color",`#${n(be).color??""}`)}),m(Ce,$e)}),te(()=>{fe(he,"id",n(C).id),fe(he,"x1",n(ie))}),m(ge,he)};xe(re,ge=>{n(C).sideKey==="top"?ge(ve):n(C).sideKey==="right"?ge(ye,1):n(C).sideKey==="bottom"?ge(O,2):n(C).sideKey==="left"&&ge(X,3)})}m(A,U)};xe(se,A=>{n(_e).length>=2&&A(pe)})}m(ke,ce)},H=ke=>{const _e=P(()=>D(n(C).data)),ie=P(()=>n(C).geom.R),ce=P(()=>n(C).geom.thickness),se=P(()=>Math.max(.01,n(ie)-n(ce)/2)),pe=P(()=>n(ie)+n(ce)/2);var A=ue(),U=W(A);{var re=ve=>{var ye=Gp();Xe(ye,21,()=>n(_e),at,(O,X)=>{const ge=P(()=>n(C).flip?100-n(X).position:n(X).position);var he=Dp();te(()=>{fe(he,"offset",`${n(ge)??""}%`),fe(he,"stop-color",`#${n(X).color??""}`)}),m(O,he)}),te(()=>{fe(ye,"id",n(C).id),fe(ye,"cx",n(C).geom.arcCx),fe(ye,"cy",n(C).geom.arcCy),fe(ye,"fx",n(C).geom.arcCx),fe(ye,"fy",n(C).geom.arcCy),fe(ye,"fr",n(se)),fe(ye,"r",n(pe))}),m(ve,ye)};xe(U,ve=>{n(_e).length>=2&&ve(re)})}m(ke,A)},J=ke=>{const _e=P(()=>D(n(C).data)),ie=P(()=>n(C).flip?n(C).geom.arcEnd:n(C).geom.arcStart),ce=P(()=>n(C).flip?n(C).geom.arcStart:n(C).geom.arcEnd);var se=ue(),pe=W(se);{var A=U=>{var re=Bp();Xe(re,21,()=>n(_e),at,(ve,ye)=>{var O=Op();te(()=>{fe(O,"offset",`${n(ye).position??""}%`),fe(O,"stop-color",`#${n(ye).color??""}`)}),m(ve,O)}),te(()=>{fe(re,"id",n(C).id),fe(re,"x1",n(ie).x),fe(re,"y1",n(ie).y),fe(re,"x2",n(ce).x),fe(re,"y2",n(ce).y)}),m(U,re)};xe(pe,U=>{n(_e).length>=2&&U(A)})}m(ke,se)},Ae=ke=>{const _e=P(()=>D(n(C).data)),ie=P(()=>n(C).gradAxis);var ce=ue(),se=W(ce);{var pe=A=>{var U=Yp();Xe(U,21,()=>n(_e),at,(re,ve)=>{const ye=P(()=>n(C).flip?100-n(ve).position:n(ve).position);var O=qp();te(()=>{fe(O,"offset",`${n(ye)??""}%`),fe(O,"stop-color",`#${n(ve).color??""}`)}),m(re,O)}),te(()=>{fe(U,"id",n(C).id),fe(U,"x1",n(ie).x1),fe(U,"y1",n(ie).y1),fe(U,"x2",n(ie).x2),fe(U,"y2",n(ie).y2)}),m(A,U)};xe(se,A=>{n(_e).length>=2&&A(pe)})}m(ke,ce)},me=ke=>{var _e=Xp(),ie=h(_e);te(()=>{fe(_e,"id",n(C).id),fe(_e,"width",o()),fe(_e,"height",i()),fe(ie,"href",n(C).data),fe(ie,"width",o()),fe(ie,"height",i())}),m(ke,_e)},ne=ke=>{var _e=Hp(),ie=h(_e);te(()=>{fe(_e,"id",n(C).id),fe(_e,"width",o()),fe(_e,"height",i()),fe(ie,"href",n(C).data),fe(ie,"width",o()),fe(ie,"height",i())}),m(ke,_e)};xe(Q,ke=>{n(C).type==="gradient"?ke(B):n(C).type==="sideGradient"?ke(E,1):n(C).type==="cornerRadial"?ke(H,2):n(C).type==="cornerTangential"?ke(J,3):n(C).type==="cornerLinear"?ke(Ae,4):n(C).type==="image"?ke(me,5):n(C).type==="overlay"&&ke(ne,6)})}m(N,le)});var oe=f(q);Xe(oe,21,()=>n(b),at,(N,C)=>{var le=ue(),Q=W(le);Xe(Q,17,()=>j(n(C)),at,(B,E,H,J)=>{var Ae=Up();te(()=>{fe(Ae,"d",n(C).d),fe(Ae,"stroke",n(E).stroke),fe(Ae,"stroke-width",n(C).thick),fe(Ae,"stroke-dasharray",n(C).dasharray==="none"?void 0:n(C).dasharray),fe(Ae,"stroke-linecap",n(C).linecap||"butt")}),m(B,Ae)}),m(N,le)});var ee=f(oe);{var Z=N=>{var C=Vp();Xe(C,21,()=>n(g),at,(le,Q)=>{var B=ue(),E=W(B);Xe(E,17,()=>j(n(Q)),at,(H,J,Ae,me)=>{var ne=Wp();te(()=>{fe(ne,"d",n(Q).d),fe(ne,"stroke",n(J).stroke),fe(ne,"stroke-width",n(Q).thick),fe(ne,"stroke-dasharray",n(Q).dasharray==="none"?void 0:n(Q).dasharray),fe(ne,"stroke-linecap",n(Q).linecap||"butt")}),m(H,ne)}),m(le,B)}),te(()=>fe(C,"transform",`translate(${n(_)??""},${n(_)??""})`)),m(N,C)};xe(ee,N=>{n(g).length>0&&N(Z)})}te(()=>fe(Y,"viewBox",`0 0 ${o()??""} ${i()??""}`)),m(F,Y)};xe(M,F=>{n(v)&&(n(b).length>0||n(g).length>0)&&F(L)})}te(()=>Ge(k,n(p))),m(e,R),Ke()}function Cl(e,t){let r=t;try{const i=localStorage.getItem(e);i!==null&&(r=JSON.parse(i))}catch{}const o=Ft(r);return o.subscribe(i=>{try{localStorage.setItem(e,JSON.stringify(i))}catch{}}),o}const Ya=Cl("ce.showRulers",!0),Xa=Cl("ce.showGuides",!0),Ha=Cl("ce.showDistances",!0),Go=Ft({}),Yr=Ft(null),lr=Ft(null);function Qp(){const e=He(Yr);return e?(zl(e.orientation,e.index),Yr.set(null),!0):!1}const Nr=Io([Go,bt],([e,t])=>e[t]??{horizontal:[],vertical:[]});function gs(e,t){const r=He(bt);r!=null&&Go.update(o=>{const i={...o[r]??{horizontal:[],vertical:[]}};return i[e]=[...i[e],Math.round(t)],{...o,[r]:i}})}function zl(e,t){const r=He(bt);r!=null&&Go.update(o=>{const i={...o[r]??{horizontal:[],vertical:[]}};return i[e]=i[e].filter((a,l)=>l!==t),{...o,[r]:i}})}function eg(){const e=He(bt);e!=null&&Go.update(t=>({...t,[e]:{horizontal:[],vertical:[]}}))}function md(e,t,r){const o=He(bt);o!=null&&Go.update(i=>{const a={...i[o]??{horizontal:[],vertical:[]}};return a[e]=a[e].map((l,s)=>s===t?Math.round(r):l),{...i,[o]:a}})}const bs=5;function tg(e,t,r,o,i){const{x:a,y:l,w:s,h:c}=e,d={x:a,y:l,guides:[]},u=[{offset:0,val:a},{offset:s/2,val:a+s/2},{offset:s,val:a+s}],p=[{offset:0,val:l},{offset:c/2,val:l+c/2},{offset:c,val:l+c}];let v=bs,b=bs,g=null,_=null,y=null,S=null;if(r)for(const $ of r){const x=i($,"Core"),D=i($,"Transform");if(!D||(x==null?void 0:x.id)===t)continue;const j=D.x,R=D.y,k=D.width,M=D.height,L=[j,j+k/2,j+k],F=[R,R+M/2,R+M];for(const Y of u)for(const q of L){const oe=Math.abs(Y.val-q);oe<v&&(v=oe,g=q-Y.offset,y=q)}for(const Y of p)for(const q of F){const oe=Math.abs(Y.val-q);oe<b&&(b=oe,_=q-Y.offset,S=q)}}const T=(o==null?void 0:o.vertical)??[];for(const $ of T)for(const x of u){const D=Math.abs(x.val-$);D<v&&(v=D,g=$-x.offset,y=$)}const I=(o==null?void 0:o.horizontal)??[];for(const $ of I)for(const x of p){const D=Math.abs(x.val-$);D<b&&(b=D,_=$-x.offset,S=$)}return g!==null&&(d.x=g,d.guides.push({type:"vertical",pos:y})),_!==null&&(d.y=_,d.guides.push({type:"horizontal",pos:S})),d}function ng(e,t,r,o,i,a){const l=[];if(!o)return l;const{x:s,y:c,w:d,h:u}=e,p=s,v=s+d,b=c,g=c+u,_=s+d/2,y=c+u/2;let S=null,T=null,I=null,$=null;for(const k of o){const M=a(k,"Core"),L=a(k,"Transform");if(!L||(M==null?void 0:M.id)===t||r.has(M==null?void 0:M.id))continue;const F=L.x,Y=L.x+L.width,q=L.y,oe=L.y+L.height,ee=g>q&&b<oe,Z=v>F&&p<Y;if(ee&&Y<=p){const N=p-Y;(!S||N<S.gap)&&(S={gap:N})}if(ee&&F>=v){const N=F-v;(!T||N<T.gap)&&(T={gap:N})}if(Z&&oe<=b){const N=b-oe;(!I||N<I.gap)&&(I={gap:N})}if(Z&&q>=g){const N=q-g;(!$||N<$.gap)&&($={gap:N})}}const x=S?S.gap:p,D=T?T.gap:i.width-v,j=I?I.gap:b,R=$?$.gap:i.height-g;return x>0&&l.push({axis:"h",side:"left",dist:Math.round(x),x:p-x,y,length:x}),D>0&&l.push({axis:"h",side:"right",dist:Math.round(D),x:v,y,length:D}),j>0&&l.push({axis:"v",side:"top",dist:Math.round(j),x:_,y:b-j,length:j}),R>0&&l.push({axis:"v",side:"bottom",dist:Math.round(R),x:_,y:g,length:R}),l}function rg(e){var o,i;const t=(o=e==null?void 0:e._children)==null?void 0:o.Shadows;if(!((i=t==null?void 0:t.items)!=null&&i.length))return"";const r=t.items.filter(a=>a.enabled).map(a=>{const l=a.type==="inner"||a.type==="inner-glow"?"inset ":"",s=a.type==="outer-glow"||a.type==="inner-glow"?0:a.offsetX,c=a.type==="outer-glow"||a.type==="inner-glow"?0:a.offsetY;return`${l}${s}px ${c}px ${a.blur}px ${a.spread}px #${a.colour.slice(-6)}`});return r.length?`box-shadow: ${r.join(", ")};`:""}function og(e){var r,o;const t=(o=(r=e==null?void 0:e._children)==null?void 0:r.Blend)==null?void 0:o.mode;return t&&t!=="normal"?`mix-blend-mode: ${t};`:""}function ig(e){var o;const t=(o=e==null?void 0:e._children)==null?void 0:o.Filters;if(!t)return"";const r=[];return t.blur>0&&r.push(`blur(${t.blur}px)`),t.brightness!==100&&r.push(`brightness(${t.brightness}%)`),t.contrast!==100&&r.push(`contrast(${t.contrast}%)`),t.saturation!==100&&r.push(`saturate(${t.saturation}%)`),t.hueRotate!==0&&r.push(`hue-rotate(${t.hueRotate}deg)`),t.grayscale>0&&r.push(`grayscale(${t.grayscale}%)`),t.sepia>0&&r.push(`sepia(${t.sepia}%)`),t.invert>0&&r.push(`invert(${t.invert}%)`),r.length?`filter: ${r.join(" ")};`:""}function ag(e,t,r,o,i){let{x:a,y:l,w:s,h:c}=e;if(t.includes("r")&&(s+=r),t.includes("l")&&(a+=r,s-=r),t.includes("b")&&(c+=o),t.includes("t")&&(l+=o,c-=o),i.aspectLock&&t.length===2){const d=i.aspectRatio??e.w/e.h;Math.abs(r)>Math.abs(o)?(c=s/d,t.includes("t")&&(l=e.y+e.h-c)):(s=c*d,t.includes("l")&&(a=e.x+e.w-s))}return s<i.minW&&(s=i.minW,t.includes("l")&&(a=e.x+e.w-i.minW)),c<i.minH&&(c=i.minH,t.includes("t")&&(l=e.y+e.h-i.minH)),i.maxW>0&&s>i.maxW&&(s=i.maxW,t.includes("l")&&(a=e.x+e.w-i.maxW)),i.maxH>0&&c>i.maxH&&(c=i.maxH,t.includes("t")&&(l=e.y+e.h-i.maxH)),{x:a,y:l,w:s,h:c}}function lg(e,t,r,o){return t<=0?e:{x:r(e.x),y:o(e.y),w:Math.round(e.w/t)*t||t,h:Math.round(e.h/t)*t||t}}function ms(e,t,r){return t<=0?e:Math.round((e-r)/t)*t+r}function _s(e,t,r,o){const i=e==null?void 0:e.getBoundingClientRect();return i?{x:(t-i.left)/o,y:(r-i.top)/o}:null}function ys(e,t,r,o){return Math.atan2(o-t,r-e)}function sg(e,t,r,o){const i=(t-e)*(180/Math.PI);let a=r+i;return o&&(a=Math.round(a/15)*15),a}function cg(e){let t=e%360;return t<0&&(t+=360),Math.round(t*10)/10}const Ua=8,ho=Ua/2,dn=-ho,dg={tl:`top:${dn}px;left:${dn}px;`,t:`top:${dn}px;left:calc(50% - ${ho}px);`,tr:`top:${dn}px;right:${dn}px;`,l:`top:calc(50% - ${ho}px);left:${dn}px;`,r:`top:calc(50% - ${ho}px);right:${dn}px;`,bl:`bottom:${dn}px;left:${dn}px;`,b:`bottom:${dn}px;left:calc(50% - ${ho}px);`,br:`bottom:${dn}px;right:${dn}px;`};function ug(e){return`width:${Ua}px;height:${Ua}px;${dg[e]}`}var vg=G('<div class="resize-handle svelte-1aohjhs"></div>'),fg=G('<!>  <div class="rotate-zone rotate-tl svelte-1aohjhs"></div> <div class="rotate-zone rotate-tr svelte-1aohjhs"></div> <div class="rotate-zone rotate-bl svelte-1aohjhs"></div> <div class="rotate-zone rotate-br svelte-1aohjhs"></div>',1),hg=G("<div></div>"),pg=G('<div class="dist-line dist-h svelte-1aohjhs"></div> <div class="dist-label svelte-1aohjhs"> </div>',1),gg=G('<div class="dist-line dist-v svelte-1aohjhs"></div> <div class="dist-label svelte-1aohjhs"> </div>',1),bg=G("<!> <!>",1),mg=G('<div><div class="control-content svelte-1aohjhs"><!></div> <!></div> <!>',1);function _g(e,t){Ve(t,!0);const r=()=>Ye(wt,"$selectedComponentIds",s),o=()=>Ye(Dn,"$keyObjectId",s),i=()=>Ye(Qi,"$multiDragDelta",s),a=()=>Ye(Nr,"$guides",s),l=()=>Ye(Ha,"$showDistances",s),[s,c]=It();let d=K(t,"scale",3,1),u=K(t,"snapToGrid",3,!1),p=K(t,"gridSize",3,10),v=K(t,"gridOriginX",3,0),b=K(t,"gridOriginY",3,0),g=K(t,"panelLocked",3,!1),_=K(t,"allControls",19,()=>[]),y=K(t,"panelWidth",3,0),S=K(t,"panelHeight",3,0),T=K(t,"onDragStart",3,null),I=K(t,"onDragEnd",3,null),$=P(()=>jt(t.control,"Core")),x=P(()=>jt(t.control,"Transform")),D=P(()=>jt(t.control,"Background")),j=P(()=>jt(t.control,"Effects")),R=P(()=>{var V;return((V=n($))==null?void 0:V.id)!=null&&r().has(n($).id)}),k=P(()=>{var V;return((V=n($))==null?void 0:V.id)!=null&&o()===n($).id&&r().size>1}),M=P(()=>{var V;return((V=n($))==null?void 0:V.locked)===!0}),L=P(()=>{var V;return((V=n($))==null?void 0:V.visible)!==!1}),F=P(()=>g()||n(M)),Y=ae(!1),q=ae(zt({x:0,y:0})),oe=ae(zt({x:0,y:0})),ee=ae(!1),Z=ae(""),N=ae(zt({x:0,y:0})),C=ae(zt({x:0,y:0,w:0,h:0})),le=ae(null),Q=ae(null),B=ae(null),E=ae(null),H=P(()=>!n(Y)&&n(R)&&i().active?i().x:0),J=P(()=>!n(Y)&&n(R)&&i().active?i().y:0),Ae=P(()=>{var V;return(n(le)??((V=n(x))==null?void 0:V.x)??0)+n(H)}),me=P(()=>{var V;return(n(Q)??((V=n(x))==null?void 0:V.y)??0)+n(J)}),ne=P(()=>{var V;return n(B)??((V=n(x))==null?void 0:V.width)??100}),ke=P(()=>{var V;return n(E)??((V=n(x))==null?void 0:V.height)??40});const _e=10,ie=V=>u()?ms(V,p(),v()):V,ce=V=>u()?ms(V,p(),b()):V;let se=ae(zt([])),pe=ae(zt([]));function A(V,Fe,je,Ee){var Be;return tg({x:V,y:Fe,w:je,h:Ee},(Be=n($))==null?void 0:Be.id,_(),a(),jt)}function U(V,Fe,je,Ee){var Ne,it;const Be=He(wt);return Be.size>1&&!n(k)&&o()!==((Ne=n($))==null?void 0:Ne.id)?[]:ng({x:V,y:Fe,w:je,h:Ee},(it=n($))==null?void 0:it.id,Be,_(),{width:y(),height:S()},jt)}function re(V){var je,Ee,Be,Ne,it;if(V.button!==0)return;if(V.stopPropagation(),V.ctrlKey||V.metaKey?eo((je=n($))==null?void 0:je.id,!0):n(R)||eo((Ee=n($))==null?void 0:Ee.id,!1),n(F)||n(ee)){window.addEventListener("click",pt=>{var mt,gt;(gt=(mt=pt.target)==null?void 0:mt.closest)!=null&&gt.call(mt,".panel-surface, .canvas-viewport")&&(pt.stopPropagation(),pt.preventDefault())},{once:!0,capture:!0});return}w(Y,!0),w(q,{x:V.clientX,y:V.clientY},!0),w(oe,{x:((Be=n(x))==null?void 0:Be.x)??0,y:((Ne=n(x))==null?void 0:Ne.y)??0},!0),w(le,n(oe).x,!0),w(Q,n(oe).y,!0),(it=T())==null||it(),window.addEventListener("mousemove",ve),window.addEventListener("mouseup",ye)}function ve(V){if(!n(Y))return;const Fe=(V.clientX-n(q).x)/d(),je=(V.clientY-n(q).y)/d();let Ee=n(oe).x+Fe,Be=n(oe).y+je;u()&&p()>0&&(Ee=ie(Ee),Be=ce(Be));const Ne=A(Ee,Be,n(ne),n(ke));w(le,Math.round(Ne.x),!0),w(Q,Math.round(Ne.y),!0),w(se,Ne.guides,!0),w(pe,l()?U(n(le),n(Q),n(ne),n(ke)):[],!0),He(wt).size>1&&Qi.set({x:n(le)-n(oe).x,y:n(Q)-n(oe).y,active:!0})}function ye(){var je,Ee,Be,Ne;if(!n(Y))return;window.removeEventListener("mousemove",ve),window.removeEventListener("mouseup",ye);const V=n(le)-n(oe).x,Fe=n(Q)-n(oe).y;if(V!==0||Fe!==0){const it=He(wt);if(it.size>1&&it.has((je=n($))==null?void 0:je.id))for(const pt of _()){const mt=(Ee=jt(pt,"Core"))==null?void 0:Ee.id;if(!mt||mt===n($).id||!it.has(mt))continue;const gt=jt(pt,"Transform");gt&&(et(mt,"Transform.x",gt.x+V),et(mt,"Transform.y",gt.y+Fe))}(Be=n($))!=null&&Be.id&&(et(n($).id,"Transform.x",n(le)),et(n($).id,"Transform.y",n(Q)))}Qi.set({x:0,y:0,active:!1}),w(Y,!1),w(le,null),w(Q,null),w(se,[],!0),w(pe,[],!0),(Ne=I())==null||Ne(),window.addEventListener("click",it=>{var pt,mt;(mt=(pt=it.target)==null?void 0:pt.closest)!=null&&mt.call(pt,".panel-surface, .canvas-viewport")&&(it.stopPropagation(),it.preventDefault())},{once:!0,capture:!0})}function O(V,Fe){var je,Ee,Be,Ne;n(F)||(Fe.stopPropagation(),Fe.preventDefault(),w(ee,!0),w(Z,V,!0),w(N,{x:Fe.clientX,y:Fe.clientY},!0),w(C,{x:((je=n(x))==null?void 0:je.x)??0,y:((Ee=n(x))==null?void 0:Ee.y)??0,w:((Be=n(x))==null?void 0:Be.width)??100,h:((Ne=n(x))==null?void 0:Ne.height)??40},!0),w(le,n(C).x,!0),w(Q,n(C).y,!0),w(B,n(C).w,!0),w(E,n(C).h,!0),window.addEventListener("mousemove",X),window.addEventListener("mouseup",ge))}function X(V){var Ne,it,pt,mt,gt;if(!n(ee))return;const Fe=(V.clientX-n(N).x)/d(),je=(V.clientY-n(N).y)/d();let Ee=ag(n(C),n(Z),Fe,je,{aspectLock:V.shiftKey||((Ne=n(x))==null?void 0:Ne.aspectLock)===!0,aspectRatio:n(C).w/n(C).h,minW:Math.max(_e,((it=n(x))==null?void 0:it.minWidth)||0),minH:Math.max(_e,((pt=n(x))==null?void 0:pt.minHeight)||0),maxW:((mt=n(x))==null?void 0:mt.maxWidth)||0,maxH:((gt=n(x))==null?void 0:gt.maxHeight)||0});u()&&(Ee=lg(Ee,p(),ie,ce));const Be=A(Ee.x,Ee.y,Ee.w,Ee.h);w(le,Math.round(Be.x),!0),w(Q,Math.round(Be.y),!0),w(B,Math.round(Ee.w),!0),w(E,Math.round(Ee.h),!0),w(se,Be.guides,!0),w(pe,l()?U(n(le),n(Q),n(B),n(E)):[],!0)}function ge(){var V;n(ee)&&(window.removeEventListener("mousemove",X),window.removeEventListener("mouseup",ge),(V=n($))!=null&&V.id&&(et(n($).id,"Transform.x",n(le)),et(n($).id,"Transform.y",n(Q)),et(n($).id,"Transform.width",n(B)),et(n($).id,"Transform.height",n(E))),w(ee,!1),w(Z,""),w(le,null),w(Q,null),w(B,null),w(E,null),w(se,[],!0),w(pe,[],!0),window.addEventListener("click",Fe=>{var je,Ee;(Ee=(je=Fe.target)==null?void 0:je.closest)!=null&&Ee.call(je,".panel-surface, .canvas-viewport")&&(Fe.stopPropagation(),Fe.preventDefault())},{once:!0,capture:!0}))}let he=ae(!1),Ce=ae(0),be=ae(0),$e=ae(null);function Le(V){var Be;if(n(F))return;V.stopPropagation(),V.preventDefault(),w(he,!0),w(be,((Be=n(x))==null?void 0:Be.rotation)??0,!0),w($e,n(be),!0);const Fe=n(Ae)+n(ne)/2,je=n(me)+n(ke)/2,Ee=_s(V.target.closest(".panel-surface"),V.clientX,V.clientY,d());Ee&&(w(Ce,ys(Fe,je,Ee.x,Ee.y),!0),window.addEventListener("mousemove",Ie),window.addEventListener("mouseup",De))}function Ie(V){if(!n(he))return;const Fe=n(Ae)+n(ne)/2,je=n(me)+n(ke)/2,Ee=_s(document.querySelector(".panel-surface"),V.clientX,V.clientY,d());if(!Ee)return;const Be=ys(Fe,je,Ee.x,Ee.y);w($e,sg(n(Ce),Be,n(be),V.shiftKey),!0)}function De(){var V;n(he)&&(window.removeEventListener("mousemove",Ie),window.removeEventListener("mouseup",De),(V=n($))!=null&&V.id&&n($e)!==n(be)&&et(n($).id,"Transform.rotation",cg(n($e))),w(he,!1),w($e,null),window.addEventListener("click",Fe=>{var je,Ee;(Ee=(je=Fe.target)==null?void 0:je.closest)!=null&&Ee.call(je,".panel-surface, .canvas-viewport")&&(Fe.stopPropagation(),Fe.preventDefault())},{once:!0,capture:!0}))}let Ue=P(()=>{var V;return n($e)??((V=n(x))==null?void 0:V.rotation)??0});const qe=[{id:"tl",cursor:"nwse-resize"},{id:"t",cursor:"ns-resize"},{id:"tr",cursor:"nesw-resize"},{id:"l",cursor:"ew-resize"},{id:"r",cursor:"ew-resize"},{id:"bl",cursor:"nesw-resize"},{id:"b",cursor:"ns-resize"},{id:"br",cursor:"nwse-resize"}],Ze=ug;let ot=P(()=>rg(n(j))),Dt=P(()=>og(n(j))),Yt=P(()=>ig(n(j)));var lt=mg(),nt=W(lt);let xt;var we=h(nt),We=h(we);{var dt=V=>{Jp(V,{get background(){return n(D)},get width(){return n(ne)},get height(){return n(ke)}})};xe(We,V=>{n(D)&&V(dt)})}var Mt=f(we,2);{var Gt=V=>{var Fe=fg(),je=W(Fe);Xe(je,17,()=>qe,pt=>pt.id,(pt,mt)=>{var gt=vg();te(Xt=>Ge(gt,`${Xt??""} cursor:${n(mt).cursor??""};`),[()=>Ze(n(mt).id)]),z("mousedown",gt,Xt=>O(n(mt).id,Xt)),m(pt,gt)});var Ee=f(je,2),Be=f(Ee,2),Ne=f(Be,2),it=f(Ne,2);z("mousedown",Ee,Le),z("mousedown",Be,Le),z("mousedown",Ne,Le),z("mousedown",it,Le),m(V,Fe)};xe(Mt,V=>{n(R)&&!n(F)&&V(Gt)})}var kt=f(nt,2);{var Je=V=>{var Fe=bg(),je=W(Fe);Xe(je,17,()=>n(se),at,(Be,Ne)=>{var it=hg();let pt;te(()=>{pt=Te(it,1,"snap-guide svelte-1aohjhs",null,pt,{vertical:n(Ne).type==="vertical",horizontal:n(Ne).type==="horizontal"}),Ge(it,n(Ne).type==="vertical"?`left:${n(Ne).pos}px;`:`top:${n(Ne).pos}px;`)}),m(Be,it)});var Ee=f(je,2);Xe(Ee,17,()=>n(pe),at,(Be,Ne)=>{var it=ue(),pt=W(it);{var mt=Xt=>{var Gn=pg(),zn=W(Gn),bn=f(zn,2),On=h(bn);te(()=>{Ge(zn,`left:${n(Ne).x??""}px; top:${n(Ne).y??""}px; width:${n(Ne).length??""}px;`),Ge(bn,`left:${n(Ne).side==="left"?n(Ne).x+n(Ne).length-20:n(Ne).x+20}px; top:${n(Ne).y??""}px;`),Re(On,n(Ne).dist)}),m(Xt,Gn)},gt=Xt=>{var Gn=gg(),zn=W(Gn),bn=f(zn,2),On=h(bn);te(()=>{Ge(zn,`left:${n(Ne).x??""}px; top:${n(Ne).y??""}px; height:${n(Ne).length??""}px;`),Ge(bn,`left:${n(Ne).x??""}px; top:${n(Ne).side==="top"?n(Ne).y+n(Ne).length-20:n(Ne).y+20}px;`),Re(On,n(Ne).dist)}),m(Xt,Gn)};xe(pt,Xt=>{n(Ne).axis==="h"?Xt(mt):Xt(gt,-1)})}m(Be,it)}),m(V,Fe)};xe(kt,V=>{(n(Y)||n(ee))&&V(Je)})}te(()=>{var V;xt=Te(nt,1,"canvas-control svelte-1aohjhs",null,xt,{selected:n(R)&&!g(),"key-object":n(k)&&!g(),"hidden-component":!n(L),locked:n(F)}),Ge(nt,`left:${n(Ae)??""}px; top:${n(me)??""}px; width:${n(ne)??""}px; height:${n(ke)??""}px; opacity:${((V=n(x))==null?void 0:V.opacity)??1??""}; ${n(Ue)?`transform:rotate(${n(Ue)}deg); transform-origin:center center;`:""} ${n(ot)??""} ${n(Dt)??""}`),Ge(we,n(Yt))}),z("mousedown",nt,re),m(e,lt),Ke(),c()}tt(["mousedown"]);var yg=G('<div><div class="guide-hit-zone guide-hit-h svelte-1yeoofk"></div> <span> </span></div>'),$g=G('<div><div class="guide-hit-zone guide-hit-v svelte-1yeoofk"></div> <span> </span></div>'),xg=G('<div class="guide-wrapper svelte-1yeoofk"><!> <!></div>');function wg(e,t){Ve(t,!0);const r=()=>Ye(Nr,"$guides",a),o=()=>Ye(lr,"$draggingGuide",a),i=()=>Ye(Yr,"$selectedGuide",a),[a,l]=It();let s=K(t,"scale",3,1);K(t,"panelWidth",3,0),K(t,"panelHeight",3,0);let c=P(()=>r().horizontal),d=P(()=>r().vertical),u=P(()=>1/s()),p=P(()=>Math.max(3,8/s())),v=P(()=>Math.max(9,11/s()));function b(k,M){var L;Yr.set({orientation:k,index:M}),(L=document.querySelector(".editor-wrapper"))==null||L.focus()}let g=ae(0),_=ae(0);function y(k,M,L,F){F.button===0&&(F.stopPropagation(),F.preventDefault(),b(k,M),w(_,L,!0),w(g,k==="horizontal"?F.clientY:F.clientX,!0),lr.set({orientation:k,index:M,pos:L}),window.addEventListener("mousemove",S),window.addEventListener("mouseup",T))}function S(k){const M=o();if(!M)return;const L=(M.orientation==="horizontal"?k.clientY-n(g):k.clientX-n(g))/s();lr.set({...M,pos:Math.round(n(_)+L)})}function T(){window.removeEventListener("mousemove",S),window.removeEventListener("mouseup",T);const k=o();k&&k.pos!==n(_)&&md(k.orientation,k.index,k.pos),lr.set(null)}function I(k,M,L){L.preventDefault(),L.stopPropagation(),zl(k,M);const F=i();F&&F.orientation===k&&F.index===M&&Yr.set(null)}function $(k,M,L){const F=o();return F&&F.orientation===k&&F.index===M?F.pos:L}function x(k,M){const L=i();return L!=null&&L.orientation===k&&L.index===M}var D=xg(),j=h(D);Xe(j,17,()=>n(c),at,(k,M,L)=>{var F=yg();let Y;var q=h(F),oe=f(q,2);let ee;var Z=h(oe);te((N,C,le,Q)=>{Y=Te(F,1,"guide-line guide-h svelte-1yeoofk",null,Y,N),Ge(F,`top:${C??""}px; left:0; right:0; border-top-width:${n(u)??""}px;`),Ge(q,`height:${n(p)??""}px;`),ee=Te(oe,1,"guide-label svelte-1yeoofk",null,ee,le),Ge(oe,`font-size:${n(v)??""}px;`),Re(Z,Q)},[()=>({selected:x("horizontal",L)}),()=>$("horizontal",L,n(M)),()=>({"label-selected":x("horizontal",L)}),()=>$("horizontal",L,n(M))]),z("mousedown",q,N=>y("horizontal",L,n(M),N)),z("contextmenu",q,N=>I("horizontal",L,N)),z("mousedown",oe,N=>y("horizontal",L,n(M),N)),z("contextmenu",oe,N=>I("horizontal",L,N)),m(k,F)});var R=f(j,2);Xe(R,17,()=>n(d),at,(k,M,L)=>{var F=$g();let Y;var q=h(F),oe=f(q,2);let ee;var Z=h(oe);te((N,C,le,Q)=>{Y=Te(F,1,"guide-line guide-v svelte-1yeoofk",null,Y,N),Ge(F,`left:${C??""}px; top:0; bottom:0; border-left-width:${n(u)??""}px;`),Ge(q,`width:${n(p)??""}px;`),ee=Te(oe,1,"guide-label svelte-1yeoofk",null,ee,le),Ge(oe,`font-size:${n(v)??""}px;`),Re(Z,Q)},[()=>({selected:x("vertical",L)}),()=>$("vertical",L,n(M)),()=>({"label-selected":x("vertical",L)}),()=>$("vertical",L,n(M))]),z("mousedown",q,N=>y("vertical",L,n(M),N)),z("contextmenu",q,N=>I("vertical",L,N)),z("mousedown",oe,N=>y("vertical",L,n(M),N)),z("contextmenu",oe,N=>I("vertical",L,N)),m(k,F)}),m(e,D),Ke(),l()}tt(["mousedown","contextmenu"]);var kg=G('<div class="bg-layer svelte-r03jgu"></div>'),Cg=G('<div class="grid-overlay svelte-r03jgu"></div>'),zg=G('<div class="marquee svelte-r03jgu"></div>'),Mg=G('<div class="panel-surface svelte-r03jgu"><!> <!> <!> <!> <!></div>');function Sg(e,t){Ve(t,!0);const r=()=>Ye(Xa,"$showGuides",o),[o,i]=It();let a=K(t,"scale",3,1),l=K(t,"snapToGrid",3,!1),s=K(t,"gridSize",3,10),c=K(t,"gridOrigin",19,()=>({x:0,y:0})),d=K(t,"panelLocked",3,!1),u=K(t,"bgLayers",19,()=>({})),p=K(t,"gridStyle",3,""),v=K(t,"onmousedown",3,null),b=K(t,"onclick",3,null),g=K(t,"oncontextmenu",3,null),_=K(t,"surfaceRef",15,null);const y=["solid","gradient","image","texture"];var S=Mg(),T=h(S);Xe(T,17,()=>t.panel.bgLayerOrder??y,at,(M,L)=>{var F=ue(),Y=W(F);{var q=oe=>{var ee=kg();te(()=>Ge(ee,u()[n(L)])),m(oe,ee)};xe(Y,oe=>{u()[n(L)]&&oe(q)})}m(M,F)});var I=f(T,2);{var $=M=>{var L=Cg();te(()=>Ge(L,p())),m(M,L)};xe(I,M=>{p()&&M($)})}var x=f(I,2);{var D=M=>{wg(M,{get scale(){return a()},get panelWidth(){return t.panel.width},get panelHeight(){return t.panel.height}})};xe(x,M=>{r()&&M(D)})}var j=f(x,2);Xe(j,17,()=>t.panel.controls,M=>{var L,F;return(F=(L=M._children)==null?void 0:L.Core)==null?void 0:F.id},(M,L)=>{_g(M,{get control(){return n(L)},get scale(){return a()},get snapToGrid(){return l()},get gridSize(){return s()},get gridOriginX(){return c().x},get gridOriginY(){return c().y},get panelLocked(){return d()},get allControls(){return t.panel.controls},get panelWidth(){return t.panel.width},get panelHeight(){return t.panel.height}})});var R=f(j,2);{var k=M=>{var L=zg();te(()=>Ge(L,`left:${t.marqueeRect.x??""}px; top:${t.marqueeRect.y??""}px; width:${t.marqueeRect.w??""}px; height:${t.marqueeRect.h??""}px;`)),m(M,L)};xe(R,M=>{t.marquee.isActive&&t.marqueeRect.w>1&&M(k)})}Kt(S,M=>_(M),()=>_()),te(()=>Ge(S,`width: ${t.panel.width??""}px; height: ${t.panel.height??""}px; transform: scale(${a()??""}); transform-origin: 0 0;`)),z("click",S,function(...M){var L;(L=b())==null||L.apply(this,M)}),z("mousedown",S,function(...M){var L;(L=v())==null||L.apply(this,M)}),z("contextmenu",S,function(...M){var L;(L=g())==null||L.apply(this,M)}),m(e,S),Ke(),i()}tt(["click","mousedown","contextmenu"]);function Tt(){const e=He(wn);if(!e)return[];const t=He(wt);return e.controls.filter(r=>{var o,i;return t.has((i=(o=r._children)==null?void 0:o.Core)==null?void 0:i.id)}).map(r=>{const o=jt(r,"Transform");return{id:r._children.Core.id,x:o.x,y:o.y,width:o.width,height:o.height}})}function io(e,t,r=null){if(e==="region"&&r)return{x:r.x,y:r.y,width:0,height:0};if(e==="key-object"){const s=He(Dn),c=t.find(d=>d.id===s);if(c)return{x:c.x,y:c.y,width:c.width,height:c.height}}if(e==="guides"){const s=He(Nr),c=Math.min(...t.map($=>$.x)),d=Math.min(...t.map($=>$.y)),u=Math.max(...t.map($=>$.x+$.width)),p=Math.max(...t.map($=>$.y+$.height)),v=(c+u)/2,b=(d+p)/2,g=[...s.vertical??[]].sort(($,x)=>$-x),_=[...s.horizontal??[]].sort(($,x)=>$-x);let y=c,S=u-c;if(g.length>=2){const $=g.filter(R=>R<=v),x=g.filter(R=>R>=v),D=$.length>0?$[$.length-1]:g[0],j=x.length>0?x[0]:g[g.length-1];y=D,S=j-D}else g.length===1&&(y=g[0],S=0);let T=d,I=p-d;if(_.length>=2){const $=_.filter(R=>R<=b),x=_.filter(R=>R>=b),D=$.length>0?$[$.length-1]:_[0],j=x.length>0?x[0]:_[_.length-1];T=D,I=j-D}else _.length===1&&(T=_[0],I=0);return{x:y,y:T,width:S,height:I}}const o=Math.min(...t.map(s=>s.x)),i=Math.min(...t.map(s=>s.y)),a=Math.max(...t.map(s=>s.x+s.width)),l=Math.max(...t.map(s=>s.y+s.height));return{x:o,y:i,width:a-o,height:l-i}}function Pg(e,t=null){const r=Tt();if(r.length===0)return;const o=io(e,r,t);for(const i of r)et(i.id,"Transform.x",o.x)}function Tg(e,t=null){const r=Tt();if(r.length===0)return;const o=io(e,r,t),i=o.x+o.width/2;for(const a of r)et(a.id,"Transform.x",Math.round(i-a.width/2))}function Eg(e,t=null){const r=Tt();if(r.length===0)return;const o=io(e,r,t),i=o.x+o.width;for(const a of r)et(a.id,"Transform.x",i-a.width)}function Fg(e,t=null){const r=Tt();if(r.length===0)return;const o=io(e,r,t);for(const i of r)et(i.id,"Transform.y",o.y)}function Ig(e,t=null){const r=Tt();if(r.length===0)return;const o=io(e,r,t),i=o.y+o.height/2;for(const a of r)et(a.id,"Transform.y",Math.round(i-a.height/2))}function Ag(e,t=null){const r=Tt();if(r.length===0)return;const o=io(e,r,t),i=o.y+o.height;for(const a of r)et(a.id,"Transform.y",i-a.height)}function ra(){const e=Tt();if(e.length<3)return;const t=[...e].sort((a,l)=>a.x-l.x),r=t[0].x,i=(t[t.length-1].x-r)/(t.length-1);for(let a=1;a<t.length-1;a++)et(t[a].id,"Transform.x",Math.round(r+i*a))}function oa(){const e=Tt();if(e.length<3)return;const t=[...e].sort((a,l)=>a.x+a.width/2-(l.x+l.width/2)),r=t[0].x+t[0].width/2,i=(t[t.length-1].x+t[t.length-1].width/2-r)/(t.length-1);for(let a=1;a<t.length-1;a++){const l=r+i*a;et(t[a].id,"Transform.x",Math.round(l-t[a].width/2))}}function ia(){const e=Tt();if(e.length<3)return;const t=[...e].sort((a,l)=>a.x+a.width-(l.x+l.width)),r=t[0].x+t[0].width,i=(t[t.length-1].x+t[t.length-1].width-r)/(t.length-1);for(let a=1;a<t.length-1;a++){const l=r+i*a;et(t[a].id,"Transform.x",Math.round(l-t[a].width))}}function aa(){const e=Tt();if(e.length<3)return;const t=[...e].sort((a,l)=>a.y-l.y),r=t[0].y,i=(t[t.length-1].y-r)/(t.length-1);for(let a=1;a<t.length-1;a++)et(t[a].id,"Transform.y",Math.round(r+i*a))}function la(){const e=Tt();if(e.length<3)return;const t=[...e].sort((a,l)=>a.y+a.height/2-(l.y+l.height/2)),r=t[0].y+t[0].height/2,i=(t[t.length-1].y+t[t.length-1].height/2-r)/(t.length-1);for(let a=1;a<t.length-1;a++){const l=r+i*a;et(t[a].id,"Transform.y",Math.round(l-t[a].height/2))}}function sa(){const e=Tt();if(e.length<3)return;const t=[...e].sort((a,l)=>a.y+a.height-(l.y+l.height)),r=t[0].y+t[0].height,i=(t[t.length-1].y+t[t.length-1].height-r)/(t.length-1);for(let a=1;a<t.length-1;a++){const l=r+i*a;et(t[a].id,"Transform.y",Math.round(l-t[a].height))}}function jg(e=null,t=!1){const r=Tt();if(r.length<2)return;const o=[...r].sort((i,a)=>i.x-a.x);if(t){const i=Math.min(...o.map(a=>a.y));for(const a of o)et(a.id,"Transform.y",i)}if(e!=null){let i=o[0].x+o[0].width+e;for(let a=1;a<o.length;a++)et(o[a].id,"Transform.x",Math.round(i)),i+=o[a].width+e}else{if(o.length<3)return;const i=o.reduce((d,u)=>d+u.width,0),a=o[0].x,s=(o[o.length-1].x+o[o.length-1].width-a-i)/(o.length-1);let c=o[0].x+o[0].width+s;for(let d=1;d<o.length-1;d++)et(o[d].id,"Transform.x",Math.round(c)),c+=o[d].width+s}}function Ng(e=null,t=!1){const r=Tt();if(r.length<2)return;const o=[...r].sort((i,a)=>i.y-a.y);if(t){const i=Math.min(...o.map(a=>a.x));for(const a of o)et(a.id,"Transform.x",i)}if(e!=null){let i=o[0].y+o[0].height+e;for(let a=1;a<o.length;a++)et(o[a].id,"Transform.y",Math.round(i)),i+=o[a].height+e}else{if(o.length<3)return;const i=o.reduce((d,u)=>d+u.height,0),a=o[0].y,s=(o[o.length-1].y+o[o.length-1].height-a-i)/(o.length-1);let c=o[0].y+o[0].height+s;for(let d=1;d<o.length-1;d++)et(o[d].id,"Transform.y",Math.round(c)),c+=o[d].height+s}}function Ai(e){const t=He(wn);if(!t)return;const r=He(wt);if(r.size===0)return;const o=e([...t.controls],r);st(t.id,{controls:o})}function hi(){Ai((e,t)=>{const r=e.filter(i=>{var a,l;return t.has((l=(a=i._children)==null?void 0:a.Core)==null?void 0:l.id)});return[...e.filter(i=>{var a,l;return!t.has((l=(a=i._children)==null?void 0:a.Core)==null?void 0:l.id)}),...r]})}function pi(){Ai((e,t)=>{var o,i,a,l;const r=[...e];for(let s=r.length-2;s>=0;s--)t.has((i=(o=r[s]._children)==null?void 0:o.Core)==null?void 0:i.id)&&!t.has((l=(a=r[s+1]._children)==null?void 0:a.Core)==null?void 0:l.id)&&([r[s],r[s+1]]=[r[s+1],r[s]]);return r})}function gi(){Ai((e,t)=>{var o,i,a,l;const r=[...e];for(let s=1;s<r.length;s++)t.has((i=(o=r[s]._children)==null?void 0:o.Core)==null?void 0:i.id)&&!t.has((l=(a=r[s-1]._children)==null?void 0:a.Core)==null?void 0:l.id)&&([r[s],r[s-1]]=[r[s-1],r[s]]);return r})}function bi(){Ai((e,t)=>{const r=e.filter(i=>{var a,l;return t.has((l=(a=i._children)==null?void 0:a.Core)==null?void 0:l.id)}),o=e.filter(i=>{var a,l;return!t.has((l=(a=i._children)==null?void 0:a.Core)==null?void 0:l.id)});return[...r,...o]})}function Ml(e){const t=He(Dn),r=e.find(o=>o.id===t);return r?{width:r.width,height:r.height}:{width:e[0].width,height:e[0].height}}function ca(){const e=Tt();if(e.length<2)return;const t=Ml(e);for(const r of e)et(r.id,"Transform.width",t.width)}function da(){const e=Tt();if(e.length<2)return;const t=Ml(e);for(const r of e)et(r.id,"Transform.height",t.height)}function ua(){const e=Tt();if(e.length<2)return;const t=Ml(e);for(const r of e)et(r.id,"Transform.width",t.width),et(r.id,"Transform.height",t.height)}function va(){const e=He(wn);if(!e)return;const t=e.gridSize||10;let r=e.gridOriginX??0,o=e.gridOriginY??0;if(e.gridCentered&&t>0){const a=e.gridSubdivision??1,l=a>1?t*a:t,s=Math.round(e.width/l),c=Math.round(e.height/l);r=-(s*l-e.width)/2,o=-(c*l-e.height)/2}const i=Tt();for(const a of i){const l=Math.round((a.x-r)/t)*t+r,s=Math.round((a.y-o)/t)*t+o;et(a.id,"Transform.x",l),et(a.id,"Transform.y",s)}}function fa(){const e=He(Nr),t=[...e.vertical??[]].sort((i,a)=>i-a),r=[...e.horizontal??[]].sort((i,a)=>i-a);if(t.length===0&&r.length===0)return;const o=Tt();for(const i of o){if(t.length>0){let a=1/0,l=i.x;for(const s of[i.x,i.x+i.width/2,i.x+i.width])for(const c of t){const d=Math.abs(s-c);d<a&&(a=d,l=c-(s-i.x))}et(i.id,"Transform.x",Math.round(l))}if(r.length>0){let a=1/0,l=i.y;for(const s of[i.y,i.y+i.height/2,i.y+i.height])for(const c of r){const d=Math.abs(s-c);d<a&&(a=d,l=c-(s-i.y))}et(i.id,"Transform.y",Math.round(l))}}}function ha(){const e=Tt();if(e.length<2)return;const t=Math.min(...e.map(i=>i.x)),r=Math.max(...e.map(i=>i.x+i.width)),o=(t+r)/2;for(const i of e){const a=o-(i.x+i.width-o);et(i.id,"Transform.x",Math.round(a))}}function pa(){const e=Tt();if(e.length<2)return;const t=Math.min(...e.map(i=>i.y)),r=Math.max(...e.map(i=>i.y+i.height)),o=(t+r)/2;for(const i of e){const a=o-(i.y+i.height-o);et(i.id,"Transform.y",Math.round(a))}}function Lg(e=3,t=10,r=10){const o=Tt();if(o.length<2)return;const i=[...o].sort((d,u)=>{const p=Math.round(d.y/20),v=Math.round(u.y/20);return p!==v?p-v:d.x-u.x}),a=i[0].x,l=i[0].y,s=Math.max(...i.map(d=>d.width)),c=Math.max(...i.map(d=>d.height));for(let d=0;d<i.length;d++){const u=d%e,p=Math.floor(d/e),v=a+u*(s+t),b=l+p*(c+r);et(i[d].id,"Transform.x",Math.round(v)),et(i[d].id,"Transform.y",Math.round(b))}}function Rg(e=100,t=0){const r=Tt();if(r.length<2)return;const o=Math.min(...r.map(p=>p.x)),i=Math.min(...r.map(p=>p.y)),a=Math.max(...r.map(p=>p.x+p.width)),l=Math.max(...r.map(p=>p.y+p.height)),s=(o+a)/2,c=(i+l)/2,d=2*Math.PI/r.length,u=t*Math.PI/180;for(let p=0;p<r.length;p++){const v=u+d*p,b=s+e*Math.cos(v)-r[p].width/2,g=c+e*Math.sin(v)-r[p].height/2;et(r[p].id,"Transform.x",Math.round(b)),et(r[p].id,"Transform.y",Math.round(g))}}const Co=Ft(null);var Dg=G('<button class="ctx-item svelte-175jt6n">Cut<span class="ctx-shortcut svelte-175jt6n">Ctrl+X</span></button> <button class="ctx-item svelte-175jt6n">Copy<span class="ctx-shortcut svelte-175jt6n">Ctrl+C</span></button>',1),Gg=G('<button class="ctx-item svelte-175jt6n">Paste Here<span class="ctx-shortcut svelte-175jt6n">Ctrl+V</span></button>'),Og=G('<div class="ctx-submenu svelte-175jt6n"><button class="ctx-item svelte-175jt6n">Bring to Front</button> <button class="ctx-item svelte-175jt6n">Bring Forward</button> <button class="ctx-item svelte-175jt6n">Send Backward</button> <button class="ctx-item svelte-175jt6n">Send to Back</button></div>'),Bg=G('<div class="ctx-separator svelte-175jt6n"></div> <button class="ctx-item svelte-175jt6n">Duplicate<span class="ctx-shortcut svelte-175jt6n">Ctrl+D</span></button> <button class="ctx-item ctx-danger svelte-175jt6n">Delete<span class="ctx-shortcut svelte-175jt6n">Del</span></button> <div class="ctx-separator svelte-175jt6n"></div> <button class="ctx-item svelte-175jt6n">Align &amp; Layout...</button> <div class="ctx-sub-wrapper svelte-175jt6n"><button class="ctx-item svelte-175jt6n">Order<span class="ctx-arrow svelte-175jt6n">&#9656;</span></button> <!></div> <div class="ctx-separator svelte-175jt6n"></div> <button class="ctx-item svelte-175jt6n"> </button>',1),qg=G('<div class="ctx-separator svelte-175jt6n"></div> <button class="ctx-item svelte-175jt6n">Select All<span class="ctx-shortcut svelte-175jt6n">Ctrl+A</span></button>',1),Yg=G('<div class="ctx-separator svelte-175jt6n"></div> <button class="ctx-item svelte-175jt6n">Clear All Guides</button>',1),Xg=G('<div class="ctx-backdrop svelte-175jt6n"></div> <div class="ctx-menu svelte-175jt6n"><!> <!> <!> <!> <!></div>',1);function Hg(e,t){Ve(t,!0);const r=()=>Ye(wt,"$selectedComponentIds",i),o=()=>Ye(Nr,"$guides",i),[i,a]=It();let l=K(t,"target",15,null),s=K(t,"panel",3,null),c=ae(null);function d(){l(null),w(c,null)}function u(){ml(),d()}function p(){Ei(),d()}function v(){_l(l()?{x:l().panelX,y:l().panelY}:null),d()}function b(){for(const j of[...r()])gl(j);d()}function g(){yl(),d()}function _(){Yc(r()),d()}function y(){Co.set({tab:"align"}),d()}function S(j){j(),d()}function T(){var j,R,k;for(const M of r()){const L=(j=s())==null?void 0:j.controls.find(Y=>{var q,oe;return((oe=(q=Y._children)==null?void 0:q.Core)==null?void 0:oe.id)===M}),F=((k=(R=L==null?void 0:L._children)==null?void 0:R.Core)==null?void 0:k.locked)??!1;et(M,"Core.locked",!F)}d()}let I=P(()=>r().size===0||!s()?!1:s().controls.filter(j=>{var R,k;return r().has((k=(R=j._children)==null?void 0:R.Core)==null?void 0:k.id)}).every(j=>{var R,k;return((k=(R=j._children)==null?void 0:R.Core)==null?void 0:k.locked)===!0}));var $=ue(),x=W($);{var D=j=>{var R=Xg(),k=W(R),M=f(k,2),L=h(M);{var F=B=>{var E=Dg(),H=W(E),J=f(H,2);z("click",H,u),z("click",J,p),m(B,E)};xe(L,B=>{r().size>0&&B(F)})}var Y=f(L,2);{var q=B=>{var E=Gg();z("click",E,v),m(B,E)},oe=P(()=>vf());xe(Y,B=>{n(oe)&&B(q)})}var ee=f(Y,2);{var Z=B=>{var E=Bg(),H=f(W(E),2),J=f(H,2),Ae=f(J,4),me=f(Ae,2),ne=f(h(me),2);{var ke=ce=>{var se=Og(),pe=h(se),A=f(pe,2),U=f(A,2),re=f(U,2);z("click",pe,()=>S(hi)),z("click",A,()=>S(pi)),z("click",U,()=>S(gi)),z("click",re,()=>S(bi)),m(ce,se)};xe(ne,ce=>{n(c)==="order"&&ce(ke)})}var _e=f(me,4),ie=h(_e);te(()=>Re(ie,n(I)?"Unlock":"Lock")),z("click",H,_),z("click",J,b),z("click",Ae,y),Qe("mouseenter",me,()=>w(c,"order")),Qe("mouseleave",me,()=>w(c,null)),z("click",_e,T),m(B,E)};xe(ee,B=>{r().size>0&&B(Z)})}var N=f(ee,2);{var C=B=>{var E=qg(),H=f(W(E),2);z("click",H,g),m(B,E)};xe(N,B=>{s()&&s().controls.length>0&&B(C)})}var le=f(N,2);{var Q=B=>{var E=Yg(),H=f(W(E),2);z("click",H,()=>{eg(),d()}),m(B,E)};xe(le,B=>{(o().horizontal.length>0||o().vertical.length>0)&&B(Q)})}te(()=>Ge(M,`left:${l().screenX??""}px; top:${l().screenY??""}px;`)),z("mousedown",k,d),z("contextmenu",k,B=>{B.preventDefault(),d()}),m(j,R)};xe(x,j=>{l()&&j(D)})}m(e,$),Ke(),a()}tt(["mousedown","contextmenu","click"]);var Ug=G('<div><div class="marker-tab svelte-6ko4yi"></div></div>'),Wg=G('<div><canvas class="ruler-canvas svelte-6ko4yi"></canvas> <!></div>');function $s(e,t){Ve(t,!0);const r=()=>Ye(Nr,"$guides",a),o=()=>Ye(lr,"$draggingGuide",a),i=()=>Ye(Yr,"$selectedGuide",a),[a,l]=It(),s=20,c=[1,2,5,10,20,50,100,200,500,1e3];let d=K(t,"orientation",3,"horizontal"),u=K(t,"length",3,0),p=K(t,"scrollOffset",3,0),v=K(t,"scale",3,1),b=K(t,"onGuideCreate",3,null),g=ae(null),_=P(()=>d()==="horizontal"),y=P(()=>n(_)?r().vertical:r().horizontal),S=P(()=>n(_)?"vertical":"horizontal");function T(ee){return ee*v()-p()+40}function I(ee){for(const Z of c)if(Z*ee>=50)return Z;return 1e3}Pt(()=>{if(!n(g)||u()<=0)return;const ee=window.devicePixelRatio||1,Z=n(_)?u():s,N=n(_)?s:u();n(g).width=Z*ee,n(g).height=N*ee,n(g).style.width=`${Z}px`,n(g).style.height=`${N}px`;const C=n(g).getContext("2d");C.scale(ee,ee),C.clearRect(0,0,Z,N),C.fillStyle="#222",C.fillRect(0,0,Z,N),C.strokeStyle="#444",C.lineWidth=1,n(_)?(C.beginPath(),C.moveTo(0,N-.5),C.lineTo(Z,N-.5),C.stroke()):(C.beginPath(),C.moveTo(Z-.5,0),C.lineTo(Z-.5,N),C.stroke());const le=I(v()),Q=le>=10||le>=5?5:2,B=le/Q,E=(p()-40)/v(),H=(p()+(n(_)?Z:N)-40)/v(),J=Math.floor(E/B)*B;C.fillStyle="#999",C.font="9px sans-serif",C.textBaseline=n(_)?"top":"middle",C.textAlign=n(_)?"center":"left";for(let Ae=J;Ae<=H;Ae+=B){const me=Ae*v()-p()+40,ne=Math.abs(Ae-Math.round(Ae/le)*le)<.01,ke=ne?10:5;if(C.strokeStyle=ne?"#888":"#555",C.lineWidth=1,C.beginPath(),n(_)){const _e=Math.round(me)+.5;C.moveTo(_e,N-ke),C.lineTo(_e,N)}else{const _e=Math.round(me)+.5;C.moveTo(Z-ke,_e),C.lineTo(Z,_e)}if(C.stroke(),ne){const _e=String(Math.round(Ae));n(_)?C.fillText(_e,me,2):(C.save(),C.translate(2,me),C.rotate(-Math.PI/2),C.textAlign="center",C.textBaseline="top",C.fillText(_e,0,0),C.restore())}}});function $(ee){if(ee.button!==0||ee.target.closest(".guide-marker"))return;ee.preventDefault();const Z=()=>{},N=C=>{var Q,B,E,H;window.removeEventListener("mousemove",Z),window.removeEventListener("mouseup",N);const le=n(g).getBoundingClientRect();if(n(_)){if(C.clientY<=le.bottom)return;const J=(Q=n(g).closest(".canvas-area"))==null?void 0:Q.querySelector(".canvas-viewport");if(!J)return;const Ae=J.getBoundingClientRect(),me=(C.clientY-Ae.top+J.scrollTop-40)/v();(B=b())==null||B("horizontal",me)}else{if(C.clientX<=le.right)return;const J=(E=n(g).closest(".canvas-area"))==null?void 0:E.querySelector(".canvas-viewport");if(!J)return;const Ae=J.getBoundingClientRect(),me=(C.clientX-Ae.left+J.scrollLeft-40)/v();(H=b())==null||H("vertical",me)}};window.addEventListener("mousemove",Z),window.addEventListener("mouseup",N)}let x=ae(0),D=ae(0);function j(ee,Z,N){N.button===0&&(N.stopPropagation(),N.preventDefault(),w(D,Z,!0),w(x,n(_)?N.clientX:N.clientY,!0),lr.set({orientation:n(S),index:ee,pos:Z}),window.addEventListener("mousemove",R),window.addEventListener("mouseup",k))}function R(ee){const Z=o();if(!Z)return;const N=(n(_)?ee.clientX-n(x):ee.clientY-n(x))/v();lr.set({...Z,pos:Math.round(n(D)+N)})}function k(){window.removeEventListener("mousemove",R),window.removeEventListener("mouseup",k);const ee=o();ee&&ee.pos!==n(D)&&md(ee.orientation,ee.index,ee.pos),lr.set(null)}function M(ee,Z){Z.preventDefault(),Z.stopPropagation(),zl(n(S),ee)}function L(ee,Z){const N=o();return N&&N.orientation===n(S)&&N.index===ee?T(N.pos):T(Z)}var F=Wg();let Y;var q=h(F);Kt(q,ee=>w(g,ee),()=>n(g));var oe=f(q,2);Xe(oe,17,()=>n(y),at,(ee,Z,N)=>{var C=Ug();let le;te((Q,B)=>{var E,H;le=Te(C,1,"guide-marker svelte-6ko4yi",null,le,{selected:((E=i())==null?void 0:E.orientation)===n(S)&&((H=i())==null?void 0:H.index)===N,"is-horizontal":n(_),"is-vertical":!n(_)}),Ge(C,Q),fe(C,"title",`${B??""}px — drag to move, right-click to remove`)},[()=>n(_)?`left:${L(N,n(Z))}px;`:`top:${L(N,n(Z))}px;`,()=>Math.round(n(Z))]),z("mousedown",C,Q=>j(N,n(Z),Q)),z("contextmenu",C,Q=>M(N,Q)),m(ee,C)}),te(()=>{Y=Te(F,1,"ruler-wrapper svelte-6ko4yi",null,Y,{horizontal:n(_),vertical:!n(_)}),Ge(q,`cursor: ${n(_)?"row-resize":"col-resize"};`)}),z("mousedown",q,$),m(e,F),Ke(),l()}tt(["mousedown","contextmenu"]);var Vg=G('<!> <!> <div class="ruler-corner svelte-17bi2u2"></div>',1),Kg=G('<div><div class="zoom-container svelte-17bi2u2"><!></div></div> <!> <!>',1),Zg=G('<div class="empty-state svelte-17bi2u2"><span class="empty-text svelte-17bi2u2">No panel open</span> <span class="empty-hint svelte-17bi2u2">File → New Panel or press the + tab</span></div>'),Jg=G('<div tabindex="-1"><div class="tab-bar-area svelte-17bi2u2"><!></div> <div class="canvas-area svelte-17bi2u2"><!></div></div>');function Qg(e,t){Ve(t,!0);const r=()=>Ye(yt,"$panels",u),o=()=>Ye(bt,"$activePanelId",u),i=()=>Ye(en,"$editorZoom",u),a=()=>Ye(yi,"$fileCache",u),l=()=>Ye(wt,"$selectedComponentIds",u),s=()=>Ye(Wc,"$zoomToSelectionSignal",u),c=()=>Ye(xo,"$editorZoomIncrement",u),d=()=>Ye(Ya,"$showRulers",u),[u,p]=It();let v=P(()=>r().find(ie=>ie.id===o())??null),b=P(i),g=P(()=>n(b)/100),_=zt({scrollLeft:0,scrollTop:0,width:0,height:0});Pt(()=>hp(_,()=>n(k)));let y=P(()=>{var ie;return((ie=n(v))==null?void 0:ie.gridEnabled)??!1}),S=P(()=>{var ie;return((ie=n(v))==null?void 0:ie.gridSize)??10}),T=P(()=>{var ie;return((ie=n(v))==null?void 0:ie.snapToGrid)??!1}),I=P(()=>{var ie;return((ie=n(v))==null?void 0:ie.locked)??!1}),$=P(()=>ep(n(v),n(S))),x=P(()=>{var ie;return((ie=n(v))==null?void 0:ie.gridColour)??"33FFFFFF"}),D=P(()=>{var ie;return((ie=n(v))==null?void 0:ie.gridLineWidth)??1}),j=P(()=>tp(n(v),{gridEnabled:n(y),gridSize:n(S),gridColour:n(x),gridLineWidth:n(D)}));Pt(()=>{var ie,ce,se,pe;(ie=n(v))!=null&&ie.bgImageEnabled&&((ce=n(v))!=null&&ce.bgImage)&&us(n(v).bgImage),(se=n(v))!=null&&se.bgTextureEnabled&&((pe=n(v))!=null&&pe.bgTexture)&&us(n(v).bgTexture)});let R=P(()=>{var ie,ce;return{solid:Jh(n(v)),gradient:Qh(n(v)),image:cs(n(v),"Image",(ie=n(v))!=null&&ie.bgImage?a()[n(v).bgImage]:null),texture:cs(n(v),"Texture",(ce=n(v))!=null&&ce.bgTexture?a()[n(v).bgTexture]:null)}}),k=ae(null),M=ae(null),L=zt({isPanning:!1,spaceHeld:!1});const F=ip(L,{getViewport:()=>n(k),onRightClick:(ie,ce)=>B(ie,ce)});let Y=zt({isActive:!1,start:{x:0,y:0},end:{x:0,y:0}});const q=ap(Y,{getSurface:()=>n(M),getScale:()=>n(g),isBlocked:()=>L.spaceHeld,onSelect:ie=>{if(ie.w<3&&ie.h<3){os();return}const ce=n(v)?rp(n(v).controls,ie,jt):new Set;wt.set(ce)}});let oe=P(()=>q.getRect());const ee=fp({getViewport:()=>n(k),getPanel:()=>n(v),getSelection:()=>l(),getZoom:()=>i(),editorZoom:en});let Z=0;Pt(()=>{const ie=s();ie>Z&&(Z=ie,ee.zoomToSelection())});function N(ie){F.handleKeyDown(ie),np(ie,{panel:n(v),panelLocked:n(I),gridSize:n(S),editorZoom:en,editorZoomIncrement:c(),selectedComponentIds:l(),fitToWindow:ee.fitToWindow,zoomToSelection:ee.zoomToSelection,selectAll:yl,pasteSelection:_l,copySelection:Ei,cutSelection:ml,duplicateControl:Yc,removeControl:gl,updateControlProperty:et,deleteSelectedGuide:Qp})}function C(ie){L.spaceHeld||(ie.target===ie.currentTarget||ie.target.classList.contains("panel-surface"))&&os()}let le=ae(null);function Q(ie){ie.preventDefault()}function B(ie,ce){var ve,ye;if(!n(v)||!n(M)){w(le,null);return}const se=n(M).getBoundingClientRect(),pe=(ie-se.left)/n(g),A=(ce-se.top)/n(g),U=op(n(v).controls,pe,A),re=(ye=(ve=U==null?void 0:U._children)==null?void 0:ve.Core)==null?void 0:ye.id;re&&!l().has(re)&&eo(re),w(le,{screenX:ie,screenY:ce,panelX:pe,panelY:A},!0)}var E=Jg();let H;var J=h(E),Ae=h(J);yp(Ae,{});var me=f(J,2),ne=h(me);{var ke=ie=>{var ce=Kg(),se=W(ce);let pe;var A=h(se),U=h(A);Sg(U,{get panel(){return n(v)},get scale(){return n(g)},get snapToGrid(){return n(T)},get gridSize(){return n(S)},get gridOrigin(){return n($)},get panelLocked(){return n(I)},get bgLayers(){return n(R)},get gridStyle(){return n(j)},get marquee(){return Y},get marqueeRect(){return n(oe)},onclick:C,get onmousedown(){return q.handleMouseDown},oncontextmenu:Q,get surfaceRef(){return n(M)},set surfaceRef(O){w(M,O,!0)}}),Kt(se,O=>w(k,O),()=>n(k));var re=f(se,2);{var ve=O=>{var X=Vg(),ge=W(X);$s(ge,{orientation:"horizontal",get length(){return _.width},get scrollOffset(){return _.scrollLeft},get scale(){return n(g)},onGuideCreate:(Ce,be)=>gs(Ce,be)});var he=f(ge,2);$s(he,{orientation:"vertical",get length(){return _.height},get scrollOffset(){return _.scrollTop},get scale(){return n(g)},onGuideCreate:(Ce,be)=>gs(Ce,be)}),m(O,X)};xe(re,O=>{d()&&O(ve)})}var ye=f(re,2);Hg(ye,{get panel(){return n(v)},get target(){return n(le)},set target(O){w(le,O,!0)}}),te(()=>{pe=Te(se,1,"canvas-viewport svelte-17bi2u2",null,pe,{"with-rulers":d()}),Ge(A,`width: ${n(v).width*n(g)+80}px; height: ${n(v).height*n(g)+80}px;`)}),z("click",se,C),z("contextmenu",se,Q),z("mousedown",se,function(...O){var X;(X=F.handleMouseDown)==null||X.apply(this,O)}),Qe("wheel",se,function(...O){var X;(X=ee.handleWheel)==null||X.apply(this,O)}),m(ie,ce)},_e=ie=>{var ce=Zg();m(ie,ce)};xe(ne,ie=>{n(v)?ie(ke):ie(_e,-1)})}te(()=>H=Te(E,1,"editor-wrapper svelte-17bi2u2",null,H,{panning:L.isPanning||L.spaceHeld})),z("keydown",E,N),z("keyup",E,function(...ie){var ce;(ce=F.handleKeyUp)==null||ce.apply(this,ie)}),m(e,E),Ke(),p()}tt(["keydown","keyup","click","contextmenu","mousedown"]);var e1=G('<div class="common-bar svelte-pu4s69"><div class="prop-group svelte-pu4s69"><div class="color-swatch svelte-pu4s69" style="background: #3A3A3A;" title="Fill colour"></div> <span class="prop-value svelte-pu4s69">3A3A3A</span></div> <div class="divider svelte-pu4s69"></div> <div class="prop-group svelte-pu4s69"><span class="prop-label svelte-pu4s69">Arial</span> <span class="prop-value svelte-pu4s69">14</span></div> <div class="divider svelte-pu4s69"></div> <div class="prop-group toggle-group svelte-pu4s69"><button class="toggle-btn svelte-pu4s69" title="Bold">B</button> <button class="toggle-btn svelte-pu4s69" title="Italic">I</button> <button class="toggle-btn svelte-pu4s69" title="Underline">U</button></div> <div class="divider svelte-pu4s69"></div> <div class="prop-group toggle-group svelte-pu4s69"><button class="toggle-btn svelte-pu4s69" title="Align left">≡</button> <button class="toggle-btn active svelte-pu4s69" title="Align center">☰</button> <button class="toggle-btn svelte-pu4s69" title="Align right">≡</button></div> <div class="spacer svelte-pu4s69"></div> <div class="prop-group svelte-pu4s69"><span class="prop-label-sm svelte-pu4s69">Opacity</span> <span class="prop-value svelte-pu4s69">100%</span></div></div>');function t1(e){var t=e1();m(e,t)}var n1=G('<input class="zoom-input svelte-o5r682" type="text"/>'),r1=G('<span class="zoom-value svelte-o5r682" title="Double-click to type a value"> </span>'),o1=G('<div class="zoom-bar svelte-o5r682"><div class="scrollbar-area svelte-o5r682"></div> <div class="zoom-controls svelte-o5r682"><button class="zoom-btn svelte-o5r682" title="Zoom out">−</button> <!> <button class="zoom-btn svelte-o5r682" title="Zoom in">+</button> <span class="inc-label svelte-o5r682">Dec/Inc</span> <input class="inc-input svelte-o5r682" type="number" min="1" max="100"/> <div class="divider svelte-o5r682"></div> <button class="zoom-btn icon svelte-o5r682" title="Reset to 100%">⊡</button> <button class="zoom-btn icon svelte-o5r682" title="Fit to window"><!></button> <div class="divider svelte-o5r682"></div> <button title="Toggle Rulers"><!></button> <button title="Toggle Guide Lines"><!></button> <button title="Toggle Distance Labels"><!></button></div></div>');function i1(e,t){Ve(t,!0);const r=()=>Ye(en,"$editorZoom",d),o=()=>Ye(xo,"$editorZoomIncrement",d),i=()=>Ye(yt,"$panels",d),a=()=>Ye(bt,"$activePanelId",d),l=()=>Ye(Ya,"$showRulers",d),s=()=>Ye(Xa,"$showGuides",d),c=()=>Ye(Ha,"$showDistances",d),[d,u]=It();let p=ae(!1),v=ae("100"),b=P(r),g=P(o),_=P(()=>i().find(ne=>ne.id===a())??null);function y(){en.update(ne=>Math.min(400,ne+o()))}function S(){en.update(ne=>Math.max(10,ne-o()))}function T(){en.set(100)}function I(){w(v,String(n(b)),!0),w(p,!0)}function $(){w(p,!1);const ne=parseInt(n(v),10);isNaN(ne)||en.set(Math.max(10,Math.min(400,ne)))}function x(ne){ne.key==="Enter"?$():ne.key==="Escape"&&w(p,!1)}function D(ne){const ke=parseInt(ne.target.value,10);!isNaN(ke)&&ke>0&&xo.set(Math.min(100,ke))}function j(){if(!n(_))return;const ne=document.querySelector(".canvas-viewport");if(!ne){en.set(100);return}const ke=ne.clientWidth-40,_e=ne.clientHeight-40,ie=ke/n(_).width,ce=_e/n(_).height,se=Math.min(ie,ce),pe=Math.max(10,Math.min(400,Math.round(se*100)));en.set(pe)}var R=o1(),k=f(h(R),2),M=h(k),L=f(M,2);{var F=ne=>{var ke=n1();sl(ke,!0),Qe("blur",ke,$),z("keydown",ke,x),ln(ke,()=>n(v),_e=>w(v,_e)),m(ne,ke)},Y=ne=>{var ke=r1(),_e=h(ke);te(()=>Re(_e,`${n(b)??""}%`)),z("dblclick",ke,I),m(ne,ke)};xe(L,ne=>{n(p)?ne(F):ne(Y,-1)})}var q=f(L,2),oe=f(q,4),ee=f(oe,4),Z=f(ee,2),N=h(Z);od(N,{size:12,strokeWidth:1.5});var C=f(Z,4);let le;var Q=h(C);qa(Q,{size:12,strokeWidth:1.5});var B=f(C,2);let E;var H=h(B);Wf(H,{size:12,strokeWidth:1.5});var J=f(B,2);let Ae;var me=h(J);fh(me,{size:12,strokeWidth:1.5}),te(()=>{Ct(oe,n(g)),le=Te(C,1,"zoom-btn icon svelte-o5r682",null,le,{"toggle-on":l()}),E=Te(B,1,"zoom-btn icon svelte-o5r682",null,E,{"toggle-on":s()}),Ae=Te(J,1,"zoom-btn icon svelte-o5r682",null,Ae,{"toggle-on":c()})}),z("click",M,S),z("click",q,y),z("change",oe,D),z("click",ee,T),z("click",Z,j),z("click",C,()=>Ya.update(ne=>!ne)),z("click",B,()=>Xa.update(ne=>!ne)),z("click",J,()=>Ha.update(ne=>!ne)),m(e,R),Ke(),u()}tt(["click","keydown","dblclick","change"]);function ji(e){const t=e.replace(/^#/,"");return[parseInt(t.slice(0,2),16),parseInt(t.slice(2,4),16),parseInt(t.slice(4,6),16)]}function Lr(e,t,r){const o=i=>Math.max(0,Math.min(255,Math.round(i))).toString(16).padStart(2,"0").toUpperCase();return o(e)+o(t)+o(r)}function _d(e,t,r){e/=255,t/=255,r/=255;const o=Math.max(e,t,r),i=Math.min(e,t,r);let a=0,l=0;const s=(o+i)/2;if(o!==i){const c=o-i;switch(l=s>.5?c/(2-o-i):c/(o+i),o){case e:a=((t-r)/c+(t<r?6:0))*60;break;case t:a=((r-e)/c+2)*60;break;case r:a=((e-t)/c+4)*60;break}}return[a,l*100,s*100]}function Ni(e,t,r){t/=100,r/=100;const o=l=>(l+e/30)%12,i=t*Math.min(r,1-r),a=l=>r-i*Math.max(-1,Math.min(o(l)-3,9-o(l),1));return[Math.round(a(0)*255),Math.round(a(8)*255),Math.round(a(4)*255)]}function a1(e,t,r){const[o,i,a]=Ni(e,t,r);return Lr(o,i,a)}function Wa(e){return Math.round(e*255).toString(16).padStart(2,"0").toUpperCase()}function Dr(e,t){const r=(1<<t)-1;return Math.round(e/255*r)*255/r}function l1(e,t,r,o){switch(o){case"8":return[Dr(e,3),Dr(t,3),Dr(r,2)];case"16":return[Dr(e,5),Dr(t,6),Dr(r,5)];default:return[e,t,r]}}function s1(e,t){const r=[];for(let o=0;o<=360;o+=30)r.push(`hsl(${o}, ${e}%, ${t}%)`);return`linear-gradient(to right, ${r.join(", ")})`}function c1(e,t){return`linear-gradient(to right, hsl(${e}, 100%, ${t}%), hsl(${e}, 0%, ${t}%))`}function d1(e,t){return`linear-gradient(to right, hsl(${e}, ${t}%, 0%), hsl(${e}, ${t}%, 50%), hsl(${e}, ${t}%, 100%))`}function u1(e,t,r){return`linear-gradient(to right, hsla(${e}, ${t}%, ${r}%, 1), hsla(${e}, ${t}%, ${r}%, 0))`}var v1=G('<div class="band-checkerboard svelte-6w7hwg"></div>'),f1=G('<div class="band-wrapper svelte-6w7hwg"><div role="slider" tabindex="-1"><!> <div class="band-gradient svelte-6w7hwg"></div> <div class="thumb svelte-6w7hwg"></div> <span class="band-label svelte-6w7hwg"> </span></div></div>'),h1=G('<div class="color-chooser svelte-6w7hwg"><div class="checkerboard svelte-6w7hwg"></div> <div class="color-overlay svelte-6w7hwg"></div> <div class="hex-corner svelte-6w7hwg"><input class="hex-input svelte-6w7hwg" type="text" spellcheck="false"/></div> <div class="bands-container svelte-6w7hwg"></div></div>');function p1(e,t){Ve(t,!0);let r=K(t,"color",3,"333333"),o=K(t,"alpha",3,1),i=K(t,"stepSize",3,10),a=ae(0),l=ae(0),s=ae(20),c=ae(1),d=ae(null),u=ae(""),p=ae(!1),v=!1;function b(ce){const[se,pe,A]=ji(ce),[U,re,ve]=_d(se,pe,A);se===pe&&pe===A||(w(a,U,!0),w(l,re,!0)),w(s,ve,!0)}Pt(()=>{const ce=r(),se=o();if(v){v=!1;return}b(ce),w(c,se,!0)});let g=P(()=>Ni(n(a),n(l),n(s))),_=P(()=>Lr(n(g)[0],n(g)[1],n(g)[2])),y=P(()=>Wa(n(c))+n(_)),S=P(()=>"#"+n(y)),T=P(()=>`hsla(${n(a)}, ${n(l)}%, ${n(s)}%, ${n(c)})`),I=P(()=>s1(n(l),n(s))),$=P(()=>c1(n(a),n(s))),x=P(()=>d1(n(a),n(l))),D=P(()=>u1(n(a),n(l),n(s))),j=P(()=>n(a)/360),R=P(()=>1-n(l)/100),k=P(()=>n(s)/100),M=P(()=>1-n(c)),L=P(()=>`hsl(${n(a)}, ${n(l)}%, ${n(s)}%)`),F=P(()=>`hsla(${n(a)}, ${n(l)}%, ${n(s)}%, ${n(c)})`);function Y(){t.onchange&&(v=!0,t.onchange(n(y)))}function q(ce,se){const pe=se.getBoundingClientRect();return Math.max(0,Math.min(ce.clientX-pe.left,pe.width))/pe.width}function oe(ce,se){w(d,ce,!0),Z(se)}function ee(ce,se){const pe=i()/100*se;return Math.round(ce/pe)*pe}function Z(ce){if(!n(d))return;const se=document.querySelector(`[data-band="${n(d)}"]`);if(!se)return;const pe=q(ce,se);switch(n(d)){case"hue":w(a,ee(pe*360,360),!0);break;case"saturation":w(l,ee((1-pe)*100,100),!0);break;case"lightness":w(s,ee(pe*100,100),!0);break;case"alpha":w(c,ee((1-pe)*100,100)/100);break}Y()}function N(){w(d,null)}function C(ce){w(p,!0),w(u,n(S),!0),ce.target.select()}function le(){w(p,!1),B()}function Q(ce){ce.key==="Enter"?ce.target.blur():ce.key==="Escape"&&(w(p,!1),w(u,n(S),!0))}function B(){let ce=n(u).replace(/^#/,"").replace(/[^0-9A-Fa-f]/g,"");ce.length===8?(w(c,parseInt(ce.slice(0,2),16)/255),b(ce.slice(2,8)),Y()):ce.length===6&&(b(ce),Y())}const E=[{id:"hue",label:"H"},{id:"saturation",label:"S"},{id:"lightness",label:"B"},{id:"alpha",label:"A"}];function H(ce){switch(ce){case"hue":return n(I);case"saturation":return n($);case"lightness":return n(x);case"alpha":return n(D)}}function J(ce){switch(ce){case"hue":return n(j);case"saturation":return n(R);case"lightness":return n(k);case"alpha":return n(M)}}function Ae(ce){return n(ce==="alpha"?F:L)}var me=h1();Qe("mousemove",Rn,function(...ce){var se;(se=n(d)?Z:void 0)==null||se.apply(this,ce)}),Qe("mouseup",Rn,function(...ce){var se;(se=n(d)?N:void 0)==null||se.apply(this,ce)});var ne=f(h(me),2),ke=f(ne,2),_e=h(ke),ie=f(ke,2);Xe(ie,21,()=>E,at,(ce,se)=>{var pe=f1(),A=h(pe);let U;var re=h(A);{var ve=he=>{var Ce=v1();m(he,Ce)};xe(re,he=>{n(se).id==="alpha"&&he(ve)})}var ye=f(re,2),O=f(ye,2),X=f(O,2),ge=h(X);te((he,Ce,be,$e)=>{U=Te(A,1,"band svelte-6w7hwg",null,U,{"is-alpha":n(se).id==="alpha"}),fe(A,"data-band",n(se).id),fe(A,"aria-valuenow",he),Ge(ye,`background: ${Ce??""}`),Ge(O,`left: ${be??""}%; background: ${$e??""}`),Re(ge,n(se).label)},[()=>J(n(se).id)*100,()=>H(n(se).id),()=>J(n(se).id)*100,()=>Ae(n(se).id)]),z("mousedown",A,he=>oe(n(se).id,he)),m(ce,pe)}),te(()=>{Ge(ne,`background: ${n(T)??""}`),Ct(_e,n(p)?n(u):n(S))}),Qe("focus",_e,C),Qe("blur",_e,le),z("keydown",_e,Q),z("input",_e,ce=>w(u,ce.target.value,!0)),m(e,me),Ke()}tt(["keydown","input","mousedown"]);function g1(e,t){return((e+t)%360+360)%360}function b1(e,t,r,o){const i=a=>a1(g1(e,a),t,r);switch(o){case"complementary":return[i(180)];case"analogous":return[i(-30),i(30)];case"triadic":return[i(120),i(240)];case"split":return[i(150),i(210)];case"tetradic":return[i(90),i(180),i(270)];default:return[]}}function m1(e){const[t,r,o]=ji(e);return Lr(255-t,255-r,255-o)}function _1(e){const[t,r,o]=ji(e),i=Math.round(.299*t+.587*r+.114*o);return Lr(i,i,i)}const yd=e=>Math.max(0,Math.min(100,e));function xs(e,t,r,o){const[i,a,l]=Ni(e,t,yd(r+o));return Lr(i,a,l)}function ws(e,t,r,o){const[i,a,l]=Ni(e,yd(t+o),r);return Lr(i,a,l)}var y1=G("<button> </button>"),$1=G('<button class="harmony-swatch svelte-3j5puu"></button>'),x1=G("<button> </button>"),w1=G('<div class="depth-preview svelte-3j5puu"><span class="depth-swatch svelte-3j5puu"></span> <span class="depth-arrow svelte-3j5puu">→</span> <span class="depth-swatch svelte-3j5puu"></span> <span class="depth-hex svelte-3j5puu"> </span></div>'),k1=G('<div class="color-settings svelte-3j5puu"><div class="section svelte-3j5puu"><div class="section-label svelte-3j5puu">Format</div> <div class="format-row svelte-3j5puu"><select class="combo format-combo svelte-3j5puu"><option>Hex</option><option>RGB</option><option>ARGB</option><option>RGBA</option><option>HSL</option><option>HSLA</option></select> <div class="value-row svelte-3j5puu"><span class="value-text svelte-3j5puu"> </span> <button class="copy-btn svelte-3j5puu" title="Copy to clipboard"><!></button></div></div></div> <div class="section svelte-3j5puu"><div class="section-label svelte-3j5puu">Step</div> <div class="step-row svelte-3j5puu"></div></div> <div class="section svelte-3j5puu"><div class="section-label svelte-3j5puu">Harmony</div> <select class="combo svelte-3j5puu"><option>Complementary</option><option>Analogous</option><option>Triadic</option><option>Split-Complementary</option><option>Tetradic</option></select> <div class="harmony-swatches svelte-3j5puu"><button class="harmony-swatch current svelte-3j5puu"></button> <!></div></div> <div class="section svelte-3j5puu"><div class="section-label svelte-3j5puu">Quick Actions</div> <div class="actions-row svelte-3j5puu"><button class="action-btn svelte-3j5puu" title="Darken 10%"><!></button> <button class="action-btn svelte-3j5puu" title="Lighten 10%"><!></button> <button class="action-btn svelte-3j5puu" title="Desaturate -15%"><!></button> <button class="action-btn svelte-3j5puu" title="Saturate +15%"><!></button> <button class="action-btn svelte-3j5puu" title="Grayscale"><span class="action-text svelte-3j5puu">G</span></button> <button class="action-btn svelte-3j5puu" title="Invert"><!></button></div></div> <div class="section svelte-3j5puu"><div class="section-label svelte-3j5puu">Opacity</div> <div class="opacity-row svelte-3j5puu"></div></div> <div class="section svelte-3j5puu"><div class="section-label svelte-3j5puu">Depth</div> <select class="combo svelte-3j5puu"><option>8-bit (256)</option><option>16-bit (65K)</option><option>24-bit (16M)</option><option>32-bit (16M+A)</option></select> <!></div></div>');function C1(e,t){Ve(t,!0);let r=K(t,"color",3,"FF0000"),o=K(t,"alpha",3,1),i=K(t,"stepSize",15,10),a=ae("hex"),l=ae("complementary"),s=ae("24"),c=ae(!1);function d(V,Fe=o()){var je;(je=t.onApplyColor)==null||je.call(t,Wa(Fe)+V)}let u=P(()=>ji(r())),p=P(()=>_d(n(u)[0],n(u)[1],n(u)[2])),v=ae(0),b=ae(0);Pt(()=>{const[V,Fe,je]=n(u),[Ee,Be]=n(p);(V!==Fe||Fe!==je)&&(w(v,Ee,!0),w(b,Be,!0))});let g=P(()=>[Math.round(n(v)),Math.round(n(b)),Math.round(n(p)[2])]),_=P(()=>Math.round(o()*255)),y=P(()=>o().toFixed(2)),S=P(()=>(()=>{const[V,Fe,je]=n(u),[Ee,Be,Ne]=n(g);switch(n(a)){case"hex":return`#${Wa(o())}${r()}`;case"rgb":return`rgb(${V}, ${Fe}, ${je})`;case"argb":return`argb(${n(_)}, ${V}, ${Fe}, ${je})`;case"rgba":return`rgba(${V}, ${Fe}, ${je}, ${n(y)})`;case"hsl":return`hsl(${Ee}, ${Be}%, ${Ne}%)`;case"hsla":return`hsla(${Ee}, ${Be}%, ${Ne}%, ${n(y)})`;default:return`#${r()}`}})());async function T(){try{await navigator.clipboard.writeText(n(S)),w(c,!0),setTimeout(()=>w(c,!1),1200)}catch{}}let I=P(()=>b1(n(g)[0],n(g)[1],n(g)[2],n(l)));function $(){d(m1(r()))}function x(){d(_1(r()))}function D(){d(xs(n(g)[0],n(g)[1],n(g)[2],10))}function j(){d(xs(n(g)[0],n(g)[1],n(g)[2],-10))}function R(){d(ws(n(g)[0],n(g)[1],n(g)[2],15))}function k(){d(ws(n(g)[0],n(g)[1],n(g)[2],-15))}function M(V){d(r(),V)}let L=P(()=>l1(n(u)[0],n(u)[1],n(u)[2],n(s))),F=P(()=>Lr(n(L)[0],n(L)[1],n(L)[2])),Y=P(()=>n(s)==="8"||n(s)==="16");var q=k1(),oe=h(q),ee=f(h(oe),2),Z=h(ee),N=h(Z);N.value=N.__value="hex";var C=f(N);C.value=C.__value="rgb";var le=f(C);le.value=le.__value="argb";var Q=f(le);Q.value=Q.__value="rgba";var B=f(Q);B.value=B.__value="hsl";var E=f(B);E.value=E.__value="hsla";var H=f(Z,2),J=h(H),Ae=h(J),me=f(J,2),ne=h(me);{var ke=V=>{Kc(V,{size:12,strokeWidth:1.5})},_e=V=>{Zc(V,{size:12,strokeWidth:1.5})};xe(ne,V=>{n(c)?V(ke):V(_e,-1)})}var ie=f(oe,2),ce=f(h(ie),2);Xe(ce,20,()=>[1,5,10,20,25],at,(V,Fe)=>{var je=y1();let Ee;var Be=h(je);te(()=>{Ee=Te(je,1,"step-btn svelte-3j5puu",null,Ee,{active:i()===Fe}),Re(Be,`${Fe??""}%`)}),z("click",je,()=>i(Fe)),m(V,je)});var se=f(ie,2),pe=f(h(se),2),A=h(pe);A.value=A.__value="complementary";var U=f(A);U.value=U.__value="analogous";var re=f(U);re.value=re.__value="triadic";var ve=f(re);ve.value=ve.__value="split";var ye=f(ve);ye.value=ye.__value="tetradic";var O=f(pe,2),X=h(O),ge=f(X,2);Xe(ge,17,()=>n(I),at,(V,Fe)=>{var je=$1();te(()=>{Ge(je,`background: #${n(Fe)??""}`),fe(je,"title",`#${n(Fe)??""} — click to apply`)}),z("click",je,()=>d(n(Fe))),m(V,je)});var he=f(se,2),Ce=f(h(he),2),be=h(Ce),$e=h(be);sh($e,{size:13,strokeWidth:1.5});var Le=f(be,2),Ie=h(Le);Ih(Ie,{size:13,strokeWidth:1.5});var De=f(Le,2),Ue=h(De);Lh(Ue,{size:13,strokeWidth:1.5});var qe=f(De,2),Ze=h(qe);Vf(Ze,{size:13,strokeWidth:1.5});var ot=f(qe,2),Dt=f(ot,2),Yt=h(Dt);sd(Yt,{size:13,strokeWidth:1.5});var lt=f(he,2),nt=f(h(lt),2);Xe(nt,20,()=>[0,.25,.5,.75,1],at,(V,Fe)=>{var je=x1();let Ee;var Be=h(je);te((Ne,it)=>{Ee=Te(je,1,"opacity-btn svelte-3j5puu",null,Ee,Ne),Re(Be,`${it??""}%`)},[()=>({active:Math.abs(o()-Fe)<.01}),()=>Math.round(Fe*100)]),z("click",je,()=>M(Fe)),m(V,je)});var xt=f(lt,2),we=f(h(xt),2),We=h(we);We.value=We.__value="8";var dt=f(We);dt.value=dt.__value="16";var Mt=f(dt);Mt.value=Mt.__value="24";var Gt=f(Mt);Gt.value=Gt.__value="32";var kt=f(we,2);{var Je=V=>{var Fe=w1(),je=h(Fe),Ee=f(je,4),Be=f(Ee,2),Ne=h(Be);te(()=>{Ge(je,`background: #${r()??""}`),Ge(Ee,`background: #${n(F)??""}`),Re(Ne,`#${n(F)??""}`)}),m(V,Fe)};xe(kt,V=>{n(Y)&&V(Je)})}te(()=>{Re(Ae,n(S)),Ge(X,`background: #${r()??""}`),fe(X,"title",`Current: #${r()??""}`)}),qr(Z,()=>n(a),V=>w(a,V)),z("click",me,T),qr(pe,()=>n(l),V=>w(l,V)),z("click",be,j),z("click",Le,D),z("click",De,k),z("click",qe,R),z("click",ot,x),z("click",Dt,$),qr(we,()=>n(s),V=>w(s,V)),m(e,q),Ke()}tt(["click"]);var z1=G('<div class="shape-container svelte-lf5wz7"><div></div></div>'),M1=G('<div class="gradient-fill svelte-lf5wz7"></div>'),S1=G('<div class="mini-preview svelte-lf5wz7"><button class="back-btn svelte-lf5wz7" title="Back to Gradient"><!> <span>Gradient</span></button> <div class="preview-area svelte-lf5wz7"><div class="checkerboard svelte-lf5wz7"></div> <!></div></div>');function P1(e,t){Ve(t,!0);let r=P(()=>t.gradient),o=P(()=>t.shape??"rectangle"),i=P(()=>t.onBack),a=P(()=>{var j;return((j=n(r))==null?void 0:j.type)==="squareRamp"?`url(${hd(n(r),256,256)})`:oo(n(r),n(o))}),l=P(()=>fd(n(r))),s=P(()=>vd(n(r))),c=P(()=>n(o)!=="rectangle"),d=P(()=>n(o)==="circle"?"shape-circle":n(o)==="square"?"shape-square":n(o)==="ellipse"?"shape-ellipse":n(o)==="triangle"?"shape-triangle":""),u=ae(null),p=ae(0),v=ae(0),b=ae(0);Lc(()=>{if(!n(u))return;const j=new ResizeObserver(([R])=>{const{width:k,height:M}=R.contentRect;w(v,k,!0),w(b,M,!0),w(p,Math.floor(Math.min(k,M)*.85),!0)});return j.observe(n(u)),()=>j.disconnect()});let g=P(()=>n(o)==="ellipse"?Math.floor(n(v)*.85):n(p)),_=P(()=>n(o)==="ellipse"?Math.floor(n(b)*.85):n(p));var y=S1(),S=h(y),T=h(S);Df(T,{size:12,strokeWidth:2});var I=f(S,2),$=f(h(I),2);{var x=j=>{var R=z1(),k=h(R);Kt(R,M=>w(u,M),()=>n(u)),te(()=>{Te(k,1,`gradient-fill ${n(d)??""}`,"svelte-lf5wz7"),Ge(k,`background: ${n(a)??""};${n(l)?` filter: ${n(l)};`:""}${n(s)?` background-blend-mode: ${n(s)};`:""} width: ${n(g)??""}px; height: ${n(_)??""}px;`)}),m(j,R)},D=j=>{var R=M1();te(()=>Ge(R,`background: ${n(a)??""};${n(l)?` filter: ${n(l)};`:""}${n(s)?` background-blend-mode: ${n(s)};`:""}`)),m(j,R)};xe($,j=>{n(c)?j(x):j(D,-1)})}z("click",S,function(...j){var R;(R=n(i))==null||R.apply(this,j)}),m(e,y),Ke()}tt(["click"]);const ks=2e3,Sl=Ft([]);let T1=1;function E1(){const e=new Date;return String(e.getHours()).padStart(2,"0")+":"+String(e.getMinutes()).padStart(2,"0")+":"+String(e.getSeconds()).padStart(2,"0")+"."+String(e.getMilliseconds()).padStart(3,"0")}function ao(e,t,r){const o=r.map(i=>typeof i=="string"?i:JSON.stringify(i,null,2)??String(i)).join(" ");Sl.update(i=>{const a=[...i,{id:T1++,timestamp:E1(),level:e,source:t,message:o}];return a.length>ks?a.slice(a.length-ks):a})}function ga(){Sl.set([])}const F1=console.log,I1=console.warn,A1=console.error,j1=console.info,N1=console.debug;console.log=(...e)=>{F1(...e),ao("log","js",e)};console.warn=(...e)=>{I1(...e),ao("warn","js",e)};console.error=(...e)=>{A1(...e),ao("error","js",e)};console.info=(...e)=>{j1(...e),ao("info","js",e)};console.debug=(...e)=>{N1(...e),ao("debug","js",e)};function L1(){qt()&&window.__JUCE__.backend.addEventListener("debugLog",e=>{const t=e.level||"log",r=e.message||JSON.stringify(e);ao(t,"c++",[r])})}var R1=G("<option> </option>"),D1=G('<div><span class="log-time svelte-1mot0gd"> </span> <span> </span> <span class="log-level svelte-1mot0gd"> </span> <span class="log-msg svelte-1mot0gd"> </span></div>'),G1=G('<div class="empty-msg svelte-1mot0gd">No console output</div>'),O1=G('<div class="console-panel svelte-1mot0gd"><div class="console-toolbar svelte-1mot0gd"><button class="tool-btn svelte-1mot0gd" title="Clear console"><!></button> <button class="tool-btn svelte-1mot0gd" title="Copy all visible entries to clipboard"><!></button> <div class="toolbar-separator svelte-1mot0gd"></div> <select class="level-filter svelte-1mot0gd"></select> <div class="filter-box svelte-1mot0gd"><!> <input type="text" class="filter-input svelte-1mot0gd" placeholder="Filter..."/></div> <div class="toolbar-spacer svelte-1mot0gd"></div> <span class="entry-count svelte-1mot0gd"> </span> <button title="Scroll to bottom"><!></button></div> <div class="console-log svelte-1mot0gd"><!> <!></div></div>');function B1(e,t){Ve(t,!0);const r=()=>Ye(Sl,"$consoleEntries",o),[o,i]=It();let a=ae(!1);async function l(){const E=n(v).map(H=>`${H.timestamp} [${H.source.toUpperCase()}] ${H.level.toUpperCase().padEnd(5)} ${H.message}`).join(`
`);try{await navigator.clipboard.writeText(E),w(a,!0),setTimeout(()=>w(a,!1),1500)}catch{const J=document.createElement("textarea");J.value=E,document.body.appendChild(J),J.select(),document.execCommand("copy"),document.body.removeChild(J),w(a,!0),setTimeout(()=>w(a,!1),1500)}}let s=ae(null),c=ae(!0),d=ae(""),u=ae("all");const p=["all","log","info","debug","warn","error"];let v=P(()=>(()=>{let E=r();if(n(u)!=="all"&&(E=E.filter(H=>H.level===n(u))),n(d)){const H=n(d).toLowerCase();E=E.filter(J=>J.message.toLowerCase().includes(H)||J.source.toLowerCase().includes(H))}return E})());Pt(()=>{n(v).length,n(c)&&n(s)&&requestAnimationFrame(()=>{n(s).scrollTop=n(s).scrollHeight})});function b(){if(!n(s))return;const{scrollTop:E,scrollHeight:H,clientHeight:J}=n(s);w(c,H-E-J<24)}function g(){w(c,!0),n(s)&&(n(s).scrollTop=n(s).scrollHeight)}function _(E){E.target.select()}function y(E){return E==="error"?"lvl-error":E==="warn"?"lvl-warn":E==="info"?"lvl-info":E==="debug"?"lvl-debug":"lvl-log"}function S(E){return E==="c++"?"C++":E==="js"?"JS":"APP"}var T=O1(),I=h(T),$=h(I),x=h($);Rh(x,{size:12});var D=f($,2),j=h(D);{var R=E=>{Kc(E,{size:12})},k=E=>{Zc(E,{size:12})};xe(j,E=>{n(a)?E(R):E(k,-1)})}var M=f(D,4);Xe(M,21,()=>p,at,(E,H)=>{var J=R1(),Ae=h(J),me={};te(ne=>{Re(Ae,ne),me!==(me=n(H))&&(J.value=(J.__value=n(H))??"")},[()=>n(H)==="all"?"All Levels":n(H).charAt(0).toUpperCase()+n(H).slice(1)]),m(E,J)});var L=f(M,2),F=h(L);eh(F,{size:10});var Y=f(F,2),q=f(L,4),oe=h(q),ee=f(q,2);let Z;var N=h(ee);Rf(N,{size:12});var C=f(I,2),le=h(C);Xe(le,17,()=>n(v),E=>E.id,(E,H)=>{var J=D1(),Ae=h(J),me=h(Ae),ne=f(Ae,2),ke=h(ne),_e=f(ne,2),ie=h(_e),ce=f(_e,2),se=h(ce);te((pe,A,U)=>{Te(J,1,`log-entry ${pe??""}`,"svelte-1mot0gd"),Re(me,n(H).timestamp),Te(ne,1,`log-source ${n(H).source??""}`,"svelte-1mot0gd"),Re(ke,A),Re(ie,U),Re(se,n(H).message)},[()=>y(n(H).level),()=>S(n(H).source),()=>n(H).level.toUpperCase().padEnd(5)]),m(E,J)});var Q=f(le,2);{var B=E=>{var H=G1();m(E,H)};xe(Q,E=>{n(v).length===0&&E(B)})}Kt(C,E=>w(s,E),()=>n(s)),te(()=>{Re(oe,n(v).length),Z=Te(ee,1,"tool-btn svelte-1mot0gd",null,Z,{active:n(c)})}),z("click",$,function(...E){ga==null||ga.apply(this,E)}),z("click",D,l),qr(M,()=>n(u),E=>w(u,E)),Qe("focus",Y,_),ln(Y,()=>n(d),E=>w(d,E)),z("click",ee,g),Qe("scroll",C,b),m(e,T),Ke(),i()}tt(["click"]);var q1=G('<div class="section-divider svelte-vjzlzd"></div> <div class="align-section svelte-vjzlzd"><div class="section-label svelte-vjzlzd">Position</div> <div class="region-row svelte-vjzlzd"><span class="input-label svelte-vjzlzd">X</span> <input class="spacing-input svelte-vjzlzd" type="number"/></div> <div class="region-row svelte-vjzlzd"><span class="input-label svelte-vjzlzd">Y</span> <input class="spacing-input svelte-vjzlzd" type="number"/></div></div>',1),Y1=G('<input class="spacing-input svelte-vjzlzd" type="number" min="0"/> <span class="unit svelte-vjzlzd">px</span>',1),X1=G('<input class="spacing-input svelte-vjzlzd" type="number" min="0"/> <span class="unit svelte-vjzlzd">px</span>',1),H1=G('<div class="align-panel svelte-vjzlzd"><div class="align-section svelte-vjzlzd"><div class="section-label svelte-vjzlzd">Align To</div> <div class="mode-group svelte-vjzlzd"><button title="Align to Selection"><!> <span>Selection</span></button> <button title="Align to Region"><!> <span>Region</span></button> <button title="Align to Key Object"><!> <span>Key Object</span></button> <button title="Align to Guide Lines"><!> <span>Guides</span></button></div></div> <!> <div class="section-divider svelte-vjzlzd"></div> <div class="align-section svelte-vjzlzd"><div class="section-label svelte-vjzlzd">Align</div> <div class="btn-row svelte-vjzlzd"><button class="action-btn svelte-vjzlzd" title="Align Left Edges"><!></button> <button class="action-btn svelte-vjzlzd" title="Align Horizontal Centers"><!></button> <button class="action-btn svelte-vjzlzd" title="Align Right Edges"><!></button></div> <div class="btn-row svelte-vjzlzd"><button class="action-btn svelte-vjzlzd" title="Align Top Edges"><!></button> <button class="action-btn svelte-vjzlzd" title="Align Vertical Centers"><!></button> <button class="action-btn svelte-vjzlzd" title="Align Bottom Edges"><!></button></div></div> <div class="section-divider svelte-vjzlzd"></div> <div class="align-section svelte-vjzlzd"><div class="section-label svelte-vjzlzd">Distribute</div> <div class="btn-row svelte-vjzlzd"><button class="action-btn svelte-vjzlzd" title="Distribute Left Edges"><!></button> <button class="action-btn svelte-vjzlzd" title="Distribute Horizontal Centers"><!></button> <button class="action-btn svelte-vjzlzd" title="Distribute Right Edges"><!></button></div> <div class="btn-row svelte-vjzlzd"><button class="action-btn svelte-vjzlzd" title="Distribute Top Edges"><!></button> <button class="action-btn svelte-vjzlzd" title="Distribute Vertical Centers"><!></button> <button class="action-btn svelte-vjzlzd" title="Distribute Bottom Edges"><!></button></div></div> <div class="section-divider svelte-vjzlzd"></div> <div class="align-section svelte-vjzlzd"><div class="section-label svelte-vjzlzd">Spacing</div> <div class="spacing-row svelte-vjzlzd"><button class="action-btn svelte-vjzlzd"><!></button> <button> </button> <!></div> <div class="spacing-row svelte-vjzlzd"><button class="action-btn svelte-vjzlzd"><!></button> <button> </button> <!></div> <div class="spacing-row svelte-vjzlzd"><button title="Also align on the opposite axis"> </button></div></div> <div class="section-divider svelte-vjzlzd"></div> <div class="align-section svelte-vjzlzd"><div class="section-label svelte-vjzlzd">Order</div> <div class="btn-row svelte-vjzlzd"><button class="action-btn svelte-vjzlzd" title="Bring to Front"><!></button> <button class="action-btn svelte-vjzlzd" title="Bring Forward"><!></button></div> <div class="btn-row svelte-vjzlzd"><button class="action-btn svelte-vjzlzd" title="Send to Back"><!></button> <button class="action-btn svelte-vjzlzd" title="Send Backward"><!></button></div></div> <div class="section-divider svelte-vjzlzd"></div> <div class="align-section svelte-vjzlzd"><div class="section-label svelte-vjzlzd">Size</div> <div class="btn-row svelte-vjzlzd"><button class="action-btn svelte-vjzlzd" title="Match Width"><!></button> <button class="action-btn svelte-vjzlzd" title="Match Height"><!></button> <button class="action-btn svelte-vjzlzd" title="Match Both"><!></button></div> <div class="btn-row svelte-vjzlzd"><button class="action-btn svelte-vjzlzd" title="Snap to Grid"><!></button> <button class="action-btn svelte-vjzlzd" title="Snap to Guides"><!></button> <button class="action-btn svelte-vjzlzd" title="Flip Horizontal"><!></button> <button class="action-btn svelte-vjzlzd" title="Flip Vertical"><!></button></div></div> <div class="section-divider svelte-vjzlzd"></div> <div class="align-section svelte-vjzlzd"><div class="section-label svelte-vjzlzd">Layout</div> <div class="layout-row svelte-vjzlzd"><button class="action-btn svelte-vjzlzd" title="Arrange in Grid"><!></button> <span class="input-label svelte-vjzlzd">Cols</span> <input class="spacing-input sm svelte-vjzlzd" type="number" min="1"/> <span class="input-label svelte-vjzlzd">Gap</span> <input class="spacing-input sm svelte-vjzlzd" type="number" min="0"/> <span class="unit svelte-vjzlzd">x</span> <input class="spacing-input sm svelte-vjzlzd" type="number" min="0"/></div> <div class="layout-row svelte-vjzlzd"><button class="action-btn svelte-vjzlzd" title="Arrange in Circle"><!></button> <span class="input-label svelte-vjzlzd">R</span> <input class="spacing-input sm svelte-vjzlzd" type="number" min="1"/> <span class="input-label svelte-vjzlzd">Angle</span> <input class="spacing-input sm svelte-vjzlzd" type="number"/> <span class="unit svelte-vjzlzd">&deg;</span></div></div></div>');function U1(e,t){Ve(t,!0);const r=()=>Ye(wt,"$selectedComponentIds",a),o=()=>Ye(Dn,"$keyObjectId",a),i=()=>Ye(Nr,"$guides",a),[a,l]=It();let s=ae("selection"),c=ae(0),d=ae(0),u=P(()=>({x:n(c),y:n(d)})),p=ae(!1),v=ae(!1),b=ae(10),g=ae(10),_=ae(!1),y=ae(3),S=ae(10),T=ae(10),I=ae(100),$=ae(0),x=P(()=>r().size),D=P(()=>n(s)==="region"||n(s)==="guides"?n(x)>=1:n(x)>=2),j=P(()=>n(x)>=3),R=P(()=>n(x)>=2),k=P(()=>n(x)>=1),M=P(()=>n(x)>=2),L=P(()=>n(x)>=2),F=P(()=>n(x)>=2),Y=P(()=>n(x)>=2),q=P(()=>o()!=null&&r().has(o()));var oe=H1(),ee=h(oe),Z=f(h(ee),2),N=h(Z);let C;var le=h(N);th(le,{size:14,strokeWidth:1.5});var Q=f(N,2);let B;var E=h(Q);Jc(E,{size:14,strokeWidth:1.5});var H=f(Q,2);let J;var Ae=h(H);dh(Ae,{size:14,strokeWidth:1.5});var me=f(H,2);let ne;var ke=h(me);qa(ke,{size:14,strokeWidth:1.5});var _e=f(ee,2);{var ie=Oe=>{var er=q1(),pr=f(W(er),2),Mn=f(h(pr),2),Dl=f(h(Mn),2),Bd=f(Mn,2),Gl=f(h(Bd),2);Qe("focus",Dl,gr=>gr.target.select()),ln(Dl,()=>n(c),gr=>w(c,gr)),Qe("focus",Gl,gr=>gr.target.select()),ln(Gl,()=>n(d),gr=>w(d,gr)),m(Oe,er)};xe(_e,Oe=>{n(s)==="region"&&Oe(ie)})}var ce=f(_e,4),se=f(h(ce),2),pe=h(se),A=h(pe);Pf(A,{size:16,strokeWidth:1.5});var U=f(pe,2),re=h(U);Mf(re,{size:16,strokeWidth:1.5});var ve=f(U,2),ye=h(ve);Sf(ye,{size:16,strokeWidth:1.5});var O=f(se,2),X=h(O),ge=h(X);Nf(ge,{size:16,strokeWidth:1.5});var he=f(X,2),Ce=h(he);Af(Ce,{size:16,strokeWidth:1.5});var be=f(he,2),$e=h(be);jf($e,{size:16,strokeWidth:1.5});var Le=f(ce,4),Ie=f(h(Le),2),De=h(Ie),Ue=h(De);zf(Ue,{size:16,strokeWidth:1.5});var qe=f(De,2),Ze=h(qe);kf(Ze,{size:16,strokeWidth:1.5});var ot=f(qe,2),Dt=h(ot);Cf(Dt,{size:16,strokeWidth:1.5});var Yt=f(Ie,2),lt=h(Yt),nt=h(lt);If(nt,{size:16,strokeWidth:1.5});var xt=f(lt,2),we=h(xt);Ef(we,{size:16,strokeWidth:1.5});var We=f(xt,2),dt=h(We);Ff(dt,{size:16,strokeWidth:1.5});var Mt=f(Le,4),Gt=f(h(Mt),2),kt=h(Gt),Je=h(kt);Tf(Je,{size:16,strokeWidth:1.5});var V=f(kt,2);let Fe;var je=h(V),Ee=f(V,2);{var Be=Oe=>{var er=Y1(),pr=W(er);Qe("focus",pr,Mn=>Mn.target.select()),ln(pr,()=>n(b),Mn=>w(b,Mn)),m(Oe,er)};xe(Ee,Oe=>{n(p)&&Oe(Be)})}var Ne=f(Gt,2),it=h(Ne),pt=h(it);Lf(pt,{size:16,strokeWidth:1.5});var mt=f(it,2);let gt;var Xt=h(mt),Gn=f(mt,2);{var zn=Oe=>{var er=X1(),pr=W(er);Qe("focus",pr,Mn=>Mn.target.select()),ln(pr,()=>n(g),Mn=>w(g,Mn)),m(Oe,er)};xe(Gn,Oe=>{n(v)&&Oe(zn)})}var bn=f(Ne,2),On=h(bn);let Oo;var kd=h(On),Fl=f(Mt,4),Il=f(h(Fl),2),Bo=h(Il),Cd=h(Bo);Xf(Cd,{size:16,strokeWidth:1.5});var Di=f(Bo,2),zd=h(Di);hh(zd,{size:16,strokeWidth:1.5});var Md=f(Il,2),qo=h(Md),Sd=h(qo);Ch(Sd,{size:16,strokeWidth:1.5});var Gi=f(qo,2),Pd=h(Gi);vh(Pd,{size:16,strokeWidth:1.5});var Al=f(Fl,4),jl=f(h(Al),2),Yo=h(jl),Td=h(Yo);Th(Td,{size:16,strokeWidth:1.5});var Xo=f(Yo,2),Ed=h(Xo);Eh(Ed,{size:16,strokeWidth:1.5});var Oi=f(Xo,2),Fd=h(Oi);kh(Fd,{size:16,strokeWidth:1.5});var Id=f(jl,2),Ho=h(Id),Ad=h(Ho);rd(Ad,{size:16,strokeWidth:1.5});var Uo=f(Ho,2),jd=h(Uo);qa(jd,{size:16,strokeWidth:1.5});var Wo=f(Uo,2),Nd=h(Wo);Jf(Nd,{size:16,strokeWidth:1.5});var Bi=f(Wo,2),Ld=h(Bi);Qf(Ld,{size:16,strokeWidth:1.5});var Rd=f(Al,4),Nl=f(h(Rd),2),Vo=h(Nl),Dd=h(Vo);ed(Dd,{size:16,strokeWidth:1.5});var qi=f(Vo,4),Yi=f(qi,4),Ll=f(Yi,4),Gd=f(Nl,2),Ko=h(Gd),Od=h(Ko);Oa(Od,{size:16,strokeWidth:1.5});var Xi=f(Ko,4),Rl=f(Xi,4);te(()=>{C=Te(N,1,"mode-btn svelte-vjzlzd",null,C,{active:n(s)==="selection"}),B=Te(Q,1,"mode-btn svelte-vjzlzd",null,B,{active:n(s)==="region"}),J=Te(H,1,"mode-btn svelte-vjzlzd",null,J,{active:n(s)==="key-object"}),H.disabled=!n(q),ne=Te(me,1,"mode-btn svelte-vjzlzd",null,ne,{active:n(s)==="guides"}),me.disabled=i().vertical.length===0&&i().horizontal.length===0,pe.disabled=!n(D),U.disabled=!n(D),ve.disabled=!n(D),X.disabled=!n(D),he.disabled=!n(D),be.disabled=!n(D),De.disabled=!n(j),qe.disabled=!n(j),ot.disabled=!n(j),lt.disabled=!n(j),xt.disabled=!n(j),We.disabled=!n(j),kt.disabled=n(p)?!n(R):!n(j),fe(kt,"title",n(p)?`H-spacing: ${n(b)}px`:"Equal H-Spacing"),Fe=Te(V,1,"toggle-btn svelte-vjzlzd",null,Fe,{active:n(p)}),Re(je,n(p)?"Fixed":"Auto"),it.disabled=n(v)?!n(R):!n(j),fe(it,"title",n(v)?`V-spacing: ${n(g)}px`:"Equal V-Spacing"),gt=Te(mt,1,"toggle-btn svelte-vjzlzd",null,gt,{active:n(v)}),Re(Xt,n(v)?"Fixed":"Auto"),Oo=Te(On,1,"toggle-btn svelte-vjzlzd",null,Oo,{active:n(_)}),Re(kd,n(_)?"Align":"Free"),Bo.disabled=!n(k),Di.disabled=!n(k),qo.disabled=!n(k),Gi.disabled=!n(k),Yo.disabled=!n(M),Xo.disabled=!n(M),Oi.disabled=!n(M),Ho.disabled=n(x)<1,Uo.disabled=n(x)<1||i().vertical.length===0&&i().horizontal.length===0,Wo.disabled=!n(L),Bi.disabled=!n(L),Vo.disabled=!n(F),Ko.disabled=!n(Y)}),z("click",N,()=>w(s,"selection")),z("click",Q,()=>w(s,"region")),z("click",H,()=>w(s,"key-object")),z("click",me,()=>w(s,"guides")),z("click",pe,()=>Pg(n(s),n(u))),z("click",U,()=>Tg(n(s),n(u))),z("click",ve,()=>Eg(n(s),n(u))),z("click",X,()=>Fg(n(s),n(u))),z("click",he,()=>Ig(n(s),n(u))),z("click",be,()=>Ag(n(s),n(u))),z("click",De,function(...Oe){ra==null||ra.apply(this,Oe)}),z("click",qe,function(...Oe){oa==null||oa.apply(this,Oe)}),z("click",ot,function(...Oe){ia==null||ia.apply(this,Oe)}),z("click",lt,function(...Oe){aa==null||aa.apply(this,Oe)}),z("click",xt,function(...Oe){la==null||la.apply(this,Oe)}),z("click",We,function(...Oe){sa==null||sa.apply(this,Oe)}),z("click",kt,()=>jg(n(p)?n(b):null,n(_))),z("click",V,()=>w(p,!n(p))),z("click",it,()=>Ng(n(v)?n(g):null,n(_))),z("click",mt,()=>w(v,!n(v))),z("click",On,()=>w(_,!n(_))),z("click",Bo,function(...Oe){hi==null||hi.apply(this,Oe)}),z("click",Di,function(...Oe){pi==null||pi.apply(this,Oe)}),z("click",qo,function(...Oe){bi==null||bi.apply(this,Oe)}),z("click",Gi,function(...Oe){gi==null||gi.apply(this,Oe)}),z("click",Yo,function(...Oe){ca==null||ca.apply(this,Oe)}),z("click",Xo,function(...Oe){da==null||da.apply(this,Oe)}),z("click",Oi,function(...Oe){ua==null||ua.apply(this,Oe)}),z("click",Ho,function(...Oe){va==null||va.apply(this,Oe)}),z("click",Uo,function(...Oe){fa==null||fa.apply(this,Oe)}),z("click",Wo,function(...Oe){ha==null||ha.apply(this,Oe)}),z("click",Bi,function(...Oe){pa==null||pa.apply(this,Oe)}),z("click",Vo,()=>Lg(n(y),n(S),n(T))),Qe("focus",qi,Oe=>Oe.target.select()),ln(qi,()=>n(y),Oe=>w(y,Oe)),Qe("focus",Yi,Oe=>Oe.target.select()),ln(Yi,()=>n(S),Oe=>w(S,Oe)),Qe("focus",Ll,Oe=>Oe.target.select()),ln(Ll,()=>n(T),Oe=>w(T,Oe)),z("click",Ko,()=>Rg(n(I),n($))),Qe("focus",Xi,Oe=>Oe.target.select()),ln(Xi,()=>n(I),Oe=>w(I,Oe)),Qe("focus",Rl,Oe=>Oe.target.select()),ln(Rl,()=>n($),Oe=>w($,Oe)),m(e,oe),Ke(),l()}tt(["click"]);var W1=G("<button></button>"),V1=G('<div class="sidebar-swatches svelte-19fqeek"><div class="swatches-label svelte-19fqeek"> </div> <div class="swatches-grid svelte-19fqeek"></div></div>');function Pl(e,t){Ve(t,!0);let r=K(t,"swatches",19,()=>[]),o=K(t,"label",3,"Colors"),i=K(t,"onclick",3,null),a=K(t,"ondblclick",3,null),l=K(t,"oncontextmenu",3,null),s=K(t,"getTitle",3,null);function c(b){return b?`#${b} — right-click to replace, double-click to clear`:"Click to store current color"}var d=V1(),u=h(d),p=h(u),v=f(u,2);Xe(v,21,r,at,(b,g,_)=>{var y=W1();let S;te(T=>{S=Te(y,1,"swatch svelte-19fqeek",null,S,{empty:!n(g)}),Ge(y,n(g)?`background: #${n(g)}`:""),fe(y,"title",T)},[()=>{var T;return((T=s())==null?void 0:T(n(g),_))??c(n(g))}]),z("click",y,()=>{var T;return(T=i())==null?void 0:T(_)}),z("dblclick",y,()=>{var T;return(T=a())==null?void 0:T(_)}),z("contextmenu",y,T=>{var I;return(I=l())==null?void 0:I(_,T)}),m(b,y)}),te(()=>Re(p,o())),m(e,d),Ke()}tt(["click","dblclick","contextmenu"]);var K1=G('<button title="Double-click to rename"><span class="image-tab-label svelte-1tkdscr"> </span> <span class="image-tab-close svelte-1tkdscr" role="button" tabindex="-1" title="Close image"><!></span></button>'),Z1=G('<img class="viewer-image svelte-1tkdscr" draggable="false"/>'),J1=G('<div class="empty-message svelte-1tkdscr">Click + to load an image</div>'),Q1=G('<div class="viewer-editor svelte-1tkdscr"><div class="image-tabs svelte-1tkdscr"><!> <button class="image-tab-add svelte-1tkdscr" title="Load image"><!></button></div> <div><!></div></div>');function e0(e,t){Ve(t,!0);let r=K(t,"images",31,()=>zt([])),o=K(t,"activeImageIndex",15,0),i=ae(null),a=ae(0),l=ae(0);Pt(()=>{if(!n(i))return;const A=new ResizeObserver(U=>{for(const re of U)w(a,re.contentRect.width,!0),w(l,re.contentRect.height,!0)});return A.observe(n(i)),()=>A.disconnect()});let s=ae(zt(new Map));function c(A){return n(s).has(A)||n(s).set(A,{zoom:100,panX:0,panY:0}),n(s).get(A)}let d=P(()=>(()=>{const A=c(o());return{zoom:A.zoom,panX:A.panX,panY:A.panY}})()),u=ae(!1);function p(A){w(u,A,!0),A&&y(),!A&&t.onColorHover&&t.onColorHover(null)}function v(){return n(u)}let b=null,g=null,_=null;function y(){const A=r()[o()];if(!A||!A.dataUrl||_===A.dataUrl)return;b=document.createElement("canvas"),b.width=A.naturalWidth,b.height=A.naturalHeight,g=b.getContext("2d",{willReadFrequently:!0});const U=new Image;U.onload=()=>{g.drawImage(U,0,0),_=A.dataUrl},U.src=A.dataUrl}function S(A){const U=r()[o()];if(!U||!n(i))return null;const re=n(i).getBoundingClientRect(),ve=c(o()),ye=ve.zoom/100,O=re.width/2,X=re.height/2,ge=A.clientX-re.left,he=A.clientY-re.top,Ce=(ge-O-ve.panX)/ye+U.naturalWidth/2,be=(he-X-ve.panY)/ye+U.naturalHeight/2;return Ce<0||be<0||Ce>=U.naturalWidth||be>=U.naturalHeight?null:{x:Math.floor(Ce),y:Math.floor(be)}}function T(A,U){var ve;if(!g||_!==((ve=r()[o()])==null?void 0:ve.dataUrl))return null;const re=g.getImageData(A,U,1,1).data;return((1<<24)+(re[0]<<16)+(re[1]<<8)+re[2]).toString(16).slice(1).toUpperCase()}function I(A){const U=S(A);if(!U)return;const re=T(U.x,U.y);re&&t.onColorPicked&&t.onColorPicked(re),w(u,!1),t.onColorHover&&t.onColorHover(null)}function $(A){if(!n(u))return;const U=S(A);if(!U){t.onColorHover&&t.onColorHover(null);return}const re=T(U.x,U.y);t.onColorHover&&t.onColorHover(re)}let x=ae(!1),D=ae(0),j=ae(0),R=ae(0),k=ae(0);function M(A){o(A)}function L(){const A=document.createElement("input");A.type="file",A.accept="image/*",A.onchange=U=>{const re=U.target.files[0];if(!re)return;const ve=new FileReader;ve.onload=()=>{const ye={name:re.name,dataUrl:ve.result,naturalWidth:0,naturalHeight:0},O=new Image;O.onload=()=>{ye.naturalWidth=O.naturalWidth,ye.naturalHeight=O.naturalHeight,r([...r(),ye]),o(r().length-1),C(o()),t.onchange&&t.onchange(r())},O.src=ve.result},ve.readAsDataURL(re)},A.click()}function F(A,U){U.stopPropagation(),!(r().length<=0)&&(r(r().filter((re,ve)=>ve!==A)),n(s).delete(A),r().length===0?o(0):o()>=r().length?o(r().length-1):o()>A&&o(o()-1),t.onchange&&t.onchange(r()))}function Y(A){const U=r()[A].name,re=prompt("Rename image:",U);re&&re.trim()&&(r(r()[A].name=re.trim(),!0),r([...r()]),t.onchange&&t.onchange(r()))}function q(){const A=c(o());A.zoom=Math.min(A.zoom+10,1600),w(s,new Map(n(s)),!0)}function oe(){const A=c(o());A.zoom=Math.max(A.zoom-10,10),w(s,new Map(n(s)),!0)}function ee(A){const U=c(o());U.zoom=Math.max(10,Math.min(1600,A)),w(s,new Map(n(s)),!0)}function Z(){return c(o()).zoom}function N(){const A=c(o());A.zoom=100,A.panX=0,A.panY=0,w(s,new Map(n(s)),!0)}function C(A){const U=A??o(),re=r()[U];if(!re||!re.naturalWidth||!n(a)||!n(l))return;const ve=n(a)/re.naturalWidth,ye=n(l)/re.naturalHeight,O=Math.min(ve,ye,1)*100,X=c(U);X.zoom=Math.round(O),X.panX=0,X.panY=0,w(s,new Map(n(s)),!0)}function le(A){if(A.button!==0)return;if(n(u)){A.preventDefault(),I(A);return}const U=c(o());w(x,!0),w(D,A.clientX,!0),w(j,A.clientY,!0),w(R,U.panX,!0),w(k,U.panY,!0),A.preventDefault()}function Q(A){if(!n(x))return;const U=c(o());U.panX=n(R)+(A.clientX-n(D)),U.panY=n(k)+(A.clientY-n(j)),w(s,new Map(n(s)),!0)}function B(){w(x,!1)}function E(A){A.preventDefault();const U=c(o()),re=A.deltaY>0?-10:10;U.zoom=Math.max(10,Math.min(1600,U.zoom+re)),w(s,new Map(n(s)),!0)}var H={setEyedropper:p,isEyedropper:v,zoomIn:q,zoomOut:oe,setZoom:ee,getZoom:Z,zoom100:N,fitToSection:C},J=Q1();Qe("mousemove",Rn,Q),Qe("mouseup",Rn,B);var Ae=h(J),me=h(Ae);Xe(me,17,r,at,(A,U,re)=>{var ve=K1();let ye;var O=h(ve),X=h(O),ge=f(O,2),he=h(ge);Ii(he,{size:10}),te(()=>{ye=Te(ve,1,"image-tab svelte-1tkdscr",null,ye,{active:re===o()}),Re(X,n(U).name)}),z("click",ve,()=>M(re)),z("dblclick",ve,()=>Y(re)),z("click",ge,Ce=>F(re,Ce)),m(A,ve)});var ne=f(me,2),ke=h(ne);Fi(ke,{size:12});var _e=f(Ae,2);let ie;var ce=h(_e);{var se=A=>{var U=Z1();te(()=>{fe(U,"src",r()[o()].dataUrl),fe(U,"alt",r()[o()].name),Ge(U,`
          transform: translate(${n(d).panX??""}px, ${n(d).panY??""}px) scale(${n(d).zoom/100});
          transform-origin: center center;
        `)}),m(A,U)},pe=A=>{var U=J1();m(A,U)};xe(ce,A=>{r().length>0&&r()[o()]?A(se):A(pe,-1)})}return Kt(_e,A=>w(i,A),()=>n(i)),te(()=>ie=Te(_e,1,"viewer-canvas svelte-1tkdscr",null,ie,{dragging:n(x),eyedropper:n(u)})),z("click",ne,L),z("mousedown",_e,le),z("mousemove",_e,$),Qe("wheel",_e,E),m(e,J),Ke(H)}tt(["click","dblclick","mousedown","mousemove"]);var t0=G('<div class="section color-preview-section svelte-12jhwcb"><div class="section-label svelte-12jhwcb">Preview</div> <div class="color-preview-row svelte-12jhwcb"><div class="color-preview-swatch svelte-12jhwcb"></div> <span class="color-preview-hex svelte-12jhwcb"> </span></div></div>'),n0=G('<div class="viewer-settings svelte-12jhwcb"><div class="section svelte-12jhwcb"><div class="section-label svelte-12jhwcb">Actions</div> <button class="action-btn svelte-12jhwcb"><!> Load Image</button> <button><!> Eyedropper</button></div> <!> <div class="section svelte-12jhwcb"><div class="section-label svelte-12jhwcb">Zoom</div> <div class="zoom-display svelte-12jhwcb"><input type="number" class="zoom-input svelte-12jhwcb" min="10" max="1600"/> <span class="zoom-pct svelte-12jhwcb">%</span></div> <div class="toolbar-row svelte-12jhwcb"><button class="tool-btn svelte-12jhwcb" title="Zoom Out"><!></button> <button class="tool-btn svelte-12jhwcb" title="Zoom In"><!></button> <button class="tool-btn svelte-12jhwcb" title="100%"><!></button> <button class="tool-btn svelte-12jhwcb" title="Fit to View"><!></button></div></div> <div class="status-area svelte-12jhwcb"><input type="text" class="status-box svelte-12jhwcb" readonly=""/></div></div>');function r0(e,t){Ve(t,!0);let r=K(t,"statusMessage",3,""),o=K(t,"hoverColor",3,null),i=ae(100);Pt(()=>{const B=setInterval(()=>{var H,J;const E=(H=t.getViewerRef)==null?void 0:H.call(t);E&&w(i,((J=E.getZoom)==null?void 0:J.call(E))??100,!0)},100);return()=>clearInterval(B)});function a(){var B,E,H;(H=(E=(B=t.getViewerRef)==null?void 0:B.call(t))==null?void 0:E.zoomIn)==null||H.call(E)}function l(){var B,E,H;(H=(E=(B=t.getViewerRef)==null?void 0:B.call(t))==null?void 0:E.zoomOut)==null||H.call(E)}function s(){var B,E,H;(H=(E=(B=t.getViewerRef)==null?void 0:B.call(t))==null?void 0:E.zoom100)==null||H.call(E)}function c(){var B,E,H;(H=(E=(B=t.getViewerRef)==null?void 0:B.call(t))==null?void 0:E.fitToSection)==null||H.call(E)}function d(){var B,E,H,J;((H=(E=(B=t.getViewerRef)==null?void 0:B.call(t))==null?void 0:E.addImage)==null?void 0:H.call(E))??((J=document.querySelector(".image-tab-add"))==null||J.click())}function u(){var H,J,Ae;const B=(H=t.getViewerRef)==null?void 0:H.call(t);if(!B)return;const E=((J=B.isEyedropper)==null?void 0:J.call(B))??!1;(Ae=B.setEyedropper)==null||Ae.call(B,!E)}let p=P(()=>(()=>{var B,E,H;return n(i),((H=(E=(B=t.getViewerRef)==null?void 0:B.call(t))==null?void 0:E.isEyedropper)==null?void 0:H.call(E))??!1})());function v(B){var H,J,Ae;const E=parseInt(B.target.value,10);isNaN(E)||(Ae=(J=(H=t.getViewerRef)==null?void 0:H.call(t))==null?void 0:J.setZoom)==null||Ae.call(J,E)}function b(B){B.key==="Enter"&&(B.target.blur(),v(B))}function g(B){B.target.select()}var _=n0(),y=h(_),S=f(h(y),2),T=h(S);nh(T,{size:13});var I=f(S,2);let $;var x=h(I);ad(x,{size:13});var D=f(y,2);{var j=B=>{var E=t0(),H=f(h(E),2),J=h(H),Ae=f(J,2),me=h(Ae);te(()=>{Ge(J,`background: #${o()??""}`),Re(me,`#${o()??""}`)}),m(B,E)};xe(D,B=>{o()&&B(j)})}var R=f(D,2),k=f(h(R),2),M=h(k),L=f(k,2),F=h(L),Y=h(F);Yh(Y,{size:13});var q=f(F,2),oe=h(q);ud(oe,{size:13});var ee=f(q,2),Z=h(ee);sd(Z,{size:13});var N=f(ee,2),C=h(N);od(C,{size:13});var le=f(R,2),Q=h(le);te(()=>{$=Te(I,1,"action-btn eyedropper-btn svelte-12jhwcb",null,$,{active:n(p)}),Ct(M,n(i)),Ct(Q,r())}),z("click",S,d),z("click",I,u),Qe("focus",M,g),z("keydown",M,b),z("change",M,v),z("click",F,l),z("click",q,a),z("click",ee,s),z("click",N,c),m(e,_),Ke()}tt(["click","keydown","change"]);function sn(e){return JSON.parse(JSON.stringify(e))}var o0=G('<div class="viewer-layout svelte-q45hze"><div class="viewer-canvas-area svelte-q45hze"><!></div> <div class="viewer-sidebar svelte-q45hze"><div class="sidebar-settings svelte-q45hze"><!></div></div></div>'),i0=G('<div class="placeholder svelte-q45hze">Open or create a panel to use the Viewer</div>');function a0(e,t){Ve(t,!0);const r=()=>Ye(wn,"$activePanel",o),[o,i]=It();let a=K(t,"resetKey",3,0),l=K(t,"oncolorpicked",3,null),s=ae(zt([])),c=ae(0),d=ae(null),u=ae(""),p=ae(null);Pt(()=>{a();const T=r();if(!T){w(s,[],!0),w(c,0);return}const I=T.viewer;I?(w(s,sn(I.images),!0),w(c,I.activeImageIndex??0,!0)):(w(s,[],!0),w(c,0))});function v(T){w(s,T,!0);const I=r();I&&st(I.id,{viewer:{images:sn(T),activeImageIndex:n(c)},modified:!0})}function b(T){var $;const I=($=l())==null?void 0:$(T);typeof I=="string"&&w(u,I,!0)}var g=ue(),_=W(g);{var y=T=>{var I=o0(),$=h(I),x=h($);Kt(e0(x,{onchange:v,onColorPicked:b,onColorHover:k=>w(p,k,!0),get images(){return n(s)},set images(k){w(s,k,!0)},get activeImageIndex(){return n(c)},set activeImageIndex(k){w(c,k,!0)}}),k=>w(d,k,!0),()=>n(d));var D=f($,2),j=h(D),R=h(j);r0(R,{getViewerRef:()=>n(d),get statusMessage(){return n(u)},get hoverColor(){return n(p)}}),m(T,I)},S=T=>{var I=i0();m(T,I)};xe(_,T=>{r()?T(y):T(S,-1)})}m(e,g),Ke(),i()}var l0=G('<button class="note-tab-close svelte-1lt2j28" title="Close note"><!></button>'),s0=G('<button title="Double-click to rename"><span class="note-tab-label svelte-1lt2j28"> </span> <!></button>'),c0=G('<div class="notepad-editor svelte-1lt2j28"><div class="note-tabs svelte-1lt2j28"><!> <button class="note-tab-add svelte-1lt2j28" title="Add note"><!></button></div> <div class="editor-area svelte-1lt2j28" contenteditable="true" spellcheck="false"></div></div>');function d0(e,t){Ve(t,!0);let r=K(t,"notes",31,()=>zt([])),o=K(t,"activeNoteIndex",15,0),i=ae(null),a=ae(-1);Pt(()=>{const x=o();if(n(i)&&x!==n(a)){w(a,x,!0);const D=r()[x];n(i).innerHTML=D?D.content:""}});function l(){if(!n(i)||!r()[o()])return;const x=n(i).innerHTML;r()[o()].content!==x&&(r(r()[o()].content=x,!0),t.onchange&&t.onchange(r()))}function s(){l()}function c(x){l(),o(x)}function d(){const x=`Note ${r().length+1}`;r([...r(),{name:x,content:""}]),o(r().length-1),t.onchange&&t.onchange(r())}function u(x,D){D.stopPropagation(),!(r().length<=1)&&(l(),r(r().filter((j,R)=>R!==x)),o()>=r().length?o(r().length-1):o()>x&&o(o()-1),w(a,-1),t.onchange&&t.onchange(r()))}function p(x){const D=r()[x].name,j=prompt("Rename note:",D);j&&j.trim()&&(r(r()[x].name=j.trim(),!0),r([...r()]),t.onchange&&t.onchange(r()))}function v(x){if(x.ctrlKey||x.metaKey)switch(x.key.toLowerCase()){case"b":x.preventDefault(),document.execCommand("bold");break;case"i":x.preventDefault(),document.execCommand("italic");break;case"u":x.preventDefault(),document.execCommand("underline");break}x.key==="Tab"&&(x.preventDefault(),document.execCommand("insertText",!1,"    "))}function b(){return n(i)}var g={getEditorElement:b},_=c0(),y=h(_),S=h(y);Xe(S,17,r,at,(x,D,j)=>{var R=s0();let k;var M=h(R),L=h(M),F=f(M,2);{var Y=q=>{var oe=l0(),ee=h(oe);Ii(ee,{size:10}),z("click",oe,Z=>u(j,Z)),m(q,oe)};xe(F,q=>{r().length>1&&q(Y)})}te(()=>{k=Te(R,1,"note-tab svelte-1lt2j28",null,k,{active:j===o()}),Re(L,n(D).name)}),z("click",R,()=>c(j)),z("dblclick",R,()=>p(j)),m(x,R)});var T=f(S,2),I=h(T);Fi(I,{size:12});var $=f(y,2);return Kt($,x=>w(i,x),()=>n(i)),z("click",T,d),z("input",$,s),z("keydown",$,v),m(e,_),Ke(g)}tt(["click","dblclick","input","keydown"]);var u0=G("<option> </option>"),v0=G("<option> </option>"),f0=G('<div class="notepad-settings svelte-1aixn3k"><div class="section svelte-1aixn3k"><div class="section-label svelte-1aixn3k">Font</div> <select class="combo svelte-1aixn3k"></select></div> <div class="section svelte-1aixn3k"><div class="section-label svelte-1aixn3k">Size</div> <div class="input-row svelte-1aixn3k"><select class="combo size-combo svelte-1aixn3k"></select> <input type="number" class="size-input svelte-1aixn3k" min="6" max="72"/></div></div> <div class="section svelte-1aixn3k"><div class="section-label svelte-1aixn3k">Format</div> <div class="toolbar-row svelte-1aixn3k"><button class="tool-btn svelte-1aixn3k" title="Bold (Ctrl+B)"><!></button> <button class="tool-btn svelte-1aixn3k" title="Italic (Ctrl+I)"><!></button> <button class="tool-btn svelte-1aixn3k" title="Underline (Ctrl+U)"><!></button> <button class="tool-btn svelte-1aixn3k" title="Strikethrough"><!></button> <button class="tool-btn svelte-1aixn3k" title="Clear formatting"><!></button></div></div> <div class="section svelte-1aixn3k"><div class="section-label svelte-1aixn3k">Align</div> <div class="toolbar-row svelte-1aixn3k"><button class="tool-btn svelte-1aixn3k" title="Align left"><!></button> <button class="tool-btn svelte-1aixn3k" title="Align center"><!></button> <button class="tool-btn svelte-1aixn3k" title="Align right"><!></button></div></div> <div class="section svelte-1aixn3k"><div class="section-label svelte-1aixn3k">Lists</div> <div class="toolbar-row svelte-1aixn3k"><button class="tool-btn svelte-1aixn3k" title="Bullet list"><!></button> <button class="tool-btn svelte-1aixn3k" title="Numbered list"><!></button></div></div> <div class="section svelte-1aixn3k"><div class="section-label svelte-1aixn3k">Text Color</div> <button class="pick-color-btn svelte-1aixn3k"><!> Pick from Colors</button></div></div>');function h0(e,t){Ve(t,!0);let r=ae("Consolas"),o=ae(12);const i=["Arial","Verdana","Helvetica","Tahoma","Georgia","Times New Roman","Courier New","Consolas","Lucida Console","Segoe UI","Trebuchet MS","Impact"],a=[8,9,10,11,12,14,16,18,20,24,28,32,36,48],l={8:1,9:1,10:2,11:2,12:3,14:3,16:4,18:4,20:5,24:5,28:6,32:6,36:7,48:7};function s(){var pe;const se=(pe=t.getEditorElement)==null?void 0:pe.call(t);se&&se.focus()}function c(se,pe=null){s(),document.execCommand(se,!1,pe)}function d(){c("fontName",n(r))}function u(){var A;const se=l[n(o)]??3;c("fontSize",String(se));const pe=(A=t.getEditorElement)==null?void 0:A.call(t);if(pe){const U=pe.querySelectorAll(`font[size="${se}"]`);for(const re of U)re.removeAttribute("size"),re.style.fontSize=`${n(o)}px`}}function p(se){se.key==="Enter"&&(se.target.blur(),u())}function v(se){se.target.select()}var b=f0(),g=h(b),_=f(h(g),2);Xe(_,21,()=>i,at,(se,pe)=>{var A=u0(),U=h(A),re={};te(()=>{Ge(A,`font-family: '${n(pe)??""}'`),Re(U,n(pe)),re!==(re=n(pe))&&(A.value=(A.__value=n(pe))??"")}),m(se,A)});var y=f(g,2),S=f(h(y),2),T=h(S);Xe(T,21,()=>a,at,(se,pe)=>{var A=v0(),U=h(A),re={};te(()=>{Re(U,`${n(pe)??""}px`),re!==(re=n(pe))&&(A.value=(A.__value=n(pe))??"")}),m(se,A)});var I=f(T,2),$=f(y,2),x=f(h($),2),D=h(x),j=h(D);Bf(j,{size:13});var R=f(D,2),k=h(R);rh(k,{size:13});var M=f(R,2),L=h(M);Gh(L,{size:13});var F=f(M,2),Y=h(F);Fh(Y,{size:13});var q=f(F,2),oe=h(q);xh(oe,{size:13});var ee=f($,2),Z=f(h(ee),2),N=h(Z),C=h(N);Nh(C,{size:13});var le=f(N,2),Q=h(le);jh(Q,{size:13});var B=f(le,2),E=h(B);Ah(E,{size:13});var H=f(ee,2),J=f(h(H),2),Ae=h(J),me=h(Ae);ah(me,{size:13});var ne=f(Ae,2),ke=h(ne);ih(ke,{size:13});var _e=f(H,2),ie=f(h(_e),2),ce=h(ie);ad(ce,{size:13}),z("change",_,d),qr(_,()=>n(r),se=>w(r,se)),z("change",T,u),qr(T,()=>n(o),se=>w(o,se)),Qe("focus",I,v),z("keydown",I,p),z("change",I,u),ln(I,()=>n(o),se=>w(o,se)),z("click",D,()=>c("bold")),z("click",R,()=>c("italic")),z("click",M,()=>c("underline")),z("click",F,()=>c("strikeThrough")),z("click",q,()=>c("removeFormat")),z("click",N,()=>c("justifyLeft")),z("click",le,()=>c("justifyCenter")),z("click",B,()=>c("justifyRight")),z("click",Ae,()=>c("insertUnorderedList")),z("click",ne,()=>c("insertOrderedList")),z("click",ie,function(...se){var pe;(pe=t.onPickColor)==null||pe.apply(this,se)}),m(e,b),Ke()}tt(["change","keydown","click"]);var p0=G('<div class="notepad-layout svelte-2iywj9"><div class="notepad-editor-area svelte-2iywj9"><!></div> <div class="notepad-sidebar svelte-2iywj9"><div class="sidebar-settings svelte-2iywj9"><!></div> <!></div></div>'),g0=G('<div class="placeholder svelte-2iywj9">Open or create a panel to use the Notepad</div>');function b0(e,t){Ve(t,!0);const r=()=>Ye(wn,"$activePanel",o),[o,i]=It();let a=K(t,"swatches",19,()=>[]),l=K(t,"resetKey",3,0),s=K(t,"onswatchstore",3,null),c=K(t,"onswatchdblclick",3,null),d=K(t,"onswatchrightclick",3,null),u=K(t,"onpickcolor",3,null),p=ae(zt([{name:"Note 1",content:""}])),v=ae(0),b=ae(null),g=ae("DDDDDD");Pt(()=>{l();const k=r();if(!k)return;const M=k.notepad;M?(w(p,sn(M.notes),!0),w(v,M.activeNoteIndex??0,!0)):(w(p,[{name:"Note 1",content:""}],!0),w(v,0))});function _(k){w(p,k,!0);const M=r();M&&st(M.id,{notepad:{notes:sn(k),activeNoteIndex:n(v)},modified:!0})}function y(k){var M,L,F;if(a()[k]){w(g,a()[k],!0);const Y=(L=(M=n(b))==null?void 0:M.getEditorElement)==null?void 0:L.call(M);Y&&(Y.focus(),document.execCommand("foreColor",!1,"#"+a()[k]))}else(F=s())==null||F(k,n(g))}function S(){var k,M;return(M=(k=n(b))==null?void 0:k.getEditorElement)==null?void 0:M.call(k)}function T(k,M){w(g,k,!0),requestAnimationFrame(()=>{const L=S();if(L){if(L.focus(),M){const F=window.getSelection();F.removeAllRanges(),F.addRange(M)}document.execCommand("foreColor",!1,"#"+k)}})}var I={getEditorElement:S,applyTextColor:T},$=ue(),x=W($);{var D=k=>{var M=p0(),L=h(M),F=h(L);Kt(d0(F,{onchange:_,get notes(){return n(p)},set notes(Z){w(p,Z,!0)},get activeNoteIndex(){return n(v)},set activeNoteIndex(Z){w(v,Z,!0)}}),Z=>w(b,Z,!0),()=>n(b));var Y=f(L,2),q=h(Y),oe=h(q);h0(oe,{getEditorElement:S,onPickColor:()=>{var Z;return(Z=u())==null?void 0:Z()}});var ee=f(q,2);Pl(ee,{get swatches(){return a()},onclick:y,ondblclick:Z=>{var N;return(N=c())==null?void 0:N(Z)},oncontextmenu:(Z,N)=>{var C;return(C=d())==null?void 0:C(Z,N)},getTitle:Z=>Z?`#${Z} — click to apply as text color`:"Click to store current color"}),m(k,M)},j=k=>{var M=g0();m(k,M)};xe(x,k=>{r()?k(D):k(j,-1)})}m(e,$);var R=Ke(I);return i(),R}const m0=new Set(["radial","radialRamp"]),_0=new Set(["radial","radialRamp","conical"]),y0=new Set(["radial","radialRamp"]);function $0(e){switch(e.type){case"radial":case"radialRamp":return 90;case"conical":return e.angle??0;default:return e.angle??90}}function x0(e,t,r){const o=Math.cos(r),i=Math.sin(r);let a=1/0;return Math.abs(o)>.001&&(a=Math.min(a,Math.abs((o>0?100-e:e)/o))),Math.abs(i)>.001&&(a=Math.min(a,Math.abs((i>0?100-t:t)/i))),Math.min(a*.95,50)}function w0(e,t,r){const{centerX:o,centerY:i,radiusX:a,radiusY:l}=r,s=m0.has(e.type),c=_0.has(e.type),d=y0.has(e.type),u=$0(e),p=(u-90)*Math.PI/180,v=c?o:50,b=c?i:50,g=t==="rectangle"?x0(v,b,p):48;let _,y;if(s)_={x:v,y:b},y={x:v+a,y:b};else{const I=Math.cos(p),$=Math.sin(p);_={x:v-I*g,y:b-$*g},y={x:v+I*g,y:b+$*g}}const S=d&&(t==="rectangle"||t==="ellipse"),T=d?{x:v,y:b+l}:{x:v,y:b};return{axisAngle:u,axisRad:p,axisCenterX:v,axisCenterY:b,isRadialAxis:s,hasCenterControl:c,hasRadiusControl:d,linearHalfLen:g,axisStart:_,axisEnd:y,showPerpAxis:S,perpAxisEnd:T}}function k0(e,t,r){const o=r/100;return{x:e.x+(t.x-e.x)*o,y:e.y+(t.y-e.y)*o}}function C0(e,t,r,o){const i=o.x-r.x,a=o.y-r.y,l=i*i+a*a;if(l<.001)return 0;const s=((e-r.x)*i+(t-r.y)*a)/l;return Math.max(0,Math.min(100,Math.round(s*100)))}var z0=$t('<line stroke="rgba(255,255,255,0.15)" stroke-width="0.3" stroke-dasharray="1,1.5"></line>'),M0=G('<div class="center-handle svelte-ki4x81"></div>'),S0=G('<div class="radius-handle perp svelte-ki4x81"></div>'),P0=G('<div class="radius-handle svelte-ki4x81"></div> <!>',1),T0=G("<div></div>"),E0=G('<div class="shape-container svelte-ki4x81"><div><div class="gradient-bg svelte-ki4x81"></div> <svg class="axis-svg svelte-ki4x81" viewBox="0 0 100 100" preserveAspectRatio="none"><line stroke="rgba(255,255,255,0.3)" stroke-width="0.4" stroke-dasharray="1.5,1"></line><!></svg> <!> <!> <!></div></div>'),F0=$t('<line stroke="rgba(255,255,255,0.15)" stroke-width="0.3" stroke-dasharray="1,1.5"></line>'),I0=G('<div class="center-handle svelte-ki4x81"></div>'),A0=G('<div class="radius-handle svelte-ki4x81"></div> <div class="radius-handle perp svelte-ki4x81"></div>',1),j0=G("<div></div>"),N0=G('<div class="gradient-surface full svelte-ki4x81"></div>  <div class="axis-overlay axis-host svelte-ki4x81"><svg class="axis-svg svelte-ki4x81" viewBox="0 0 100 100" preserveAspectRatio="none"><line stroke="rgba(255,255,255,0.3)" stroke-width="0.4" stroke-dasharray="1.5,1"></line><!></svg> <!> <!> <!></div>',1),L0=G('<div class="gradient-editor svelte-ki4x81"><div class="checkerboard svelte-ki4x81"></div> <!></div>');function R0(e,t){Ve(t,!0);let r=P(()=>t.gradient),o=P(()=>t.selectedStop??0),i=P(()=>t.shape??"rectangle"),a=P(()=>t.onchange),l=P(()=>t.onSelectStop),s=ae(zt([])),c=ae(50),d=ae(50),u=ae(50),p=ae(50),v=ae(!1),b=ae(null),g=ae(0),_=ae(100),y=ae(100);Lc(()=>{if(!n(b))return;const A=new ResizeObserver(([U])=>{w(_,U.contentRect.width,!0),w(y,U.contentRect.height,!0)});return A.observe(n(b)),()=>A.disconnect()}),Pt(()=>{w(g,Math.floor(Math.min(n(_),n(y))*.85),!0)});let S=P(()=>n(i)==="ellipse"?Math.floor(n(_)*.85):n(g)),T=P(()=>n(i)==="ellipse"?Math.floor(n(y)*.85):n(g)),I=!1;Pt(()=>{const A=n(r);!n(v)&&!I&&A&&(A.stops&&w(s,A.stops.map(U=>({...U})),!0),w(c,A.centerX??50,!0),w(d,A.centerY??50,!0),w(u,A.radiusX??50,!0),w(p,A.radiusY??50,!0)),I=!1});let $=P(()=>({...n(r),stops:n(s),centerX:n(c),centerY:n(d),radiusX:n(u),radiusY:n(p)})),x=P(()=>n($).type==="squareRamp"?`url(${hd(n($),256,256)})`:oo(n($),n(i))),D=P(()=>fd(n($))),j=P(()=>vd(n($))),R=P(()=>n(i)==="circle"?"shape-circle":n(i)==="square"?"shape-square":n(i)==="ellipse"?"shape-ellipse":n(i)==="triangle"?"shape-triangle":""),k=P(()=>n(i)!=="rectangle"),M=P(()=>w0(n(r),n(i),{centerX:n(c),centerY:n(d),radiusX:n(u),radiusY:n(p)})),L=P(()=>n(M).hasCenterControl),F=P(()=>n(M).hasRadiusControl),Y=P(()=>n(M).axisCenterX),q=P(()=>n(M).axisCenterY),oe=P(()=>n(M).axisStart),ee=P(()=>n(M).axisEnd),Z=P(()=>n(M).showPerpAxis),N=P(()=>n(M).perpAxisEnd),C=ae(null);function le(A){const U=n(C);if(!U)return 50;const re=U.getBoundingClientRect(),ve=(A.clientX-re.left)/re.width*100,ye=(A.clientY-re.top)/re.height*100;return C0(ve,ye,n(oe),n(ee))}function Q(A){const{x:U,y:re}=k0(n(oe),n(ee),A.position);return`left: ${U}%; top: ${re}%; background: #${A.color}`}let B=P(()=>({x1:n(oe).x,y1:n(oe).y,x2:n(ee).x,y2:n(ee).y})),E=P(()=>({x1:n(Y),y1:n(q),x2:n(N).x,y2:n(N).y}));function H(){n(a)&&n(a)({...n(r),stops:n(s),centerX:n(c),centerY:n(d),radiusX:n(u),radiusY:n(p)})}function J(A,U){U.preventDefault(),U.stopPropagation(),w(v,!0),n(l)&&n(l)(A);function re(ye){const O=le(ye);w(s,n(s).map((X,ge)=>ge===A?{...X,position:O}:X),!0)}function ve(){document.removeEventListener("mousemove",re),document.removeEventListener("mouseup",ve),w(v,!1),ne=!0,I=!0,H()}document.addEventListener("mousemove",re),document.addEventListener("mouseup",ve)}function Ae(A){A.preventDefault(),A.stopPropagation(),w(v,!0);function U(ve){const ye=n(C);if(!ye)return;const O=ye.getBoundingClientRect();w(c,Math.max(0,Math.min(100,Math.round((ve.clientX-O.left)/O.width*100))),!0),w(d,Math.max(0,Math.min(100,Math.round((ve.clientY-O.top)/O.height*100))),!0)}function re(){document.removeEventListener("mousemove",U),document.removeEventListener("mouseup",re),w(v,!1),ne=!0,I=!0,H()}document.addEventListener("mousemove",U),document.addEventListener("mouseup",re)}function me(A,U){U.preventDefault(),U.stopPropagation(),w(v,!0);function re(ye){const O=n(C);if(!O)return;const X=O.getBoundingClientRect(),ge=(ye.clientX-X.left)/X.width*100,he=(ye.clientY-X.top)/X.height*100;A==="x"?w(u,Math.max(1,Math.round(Math.abs(ge-n(c)))),!0):w(p,Math.max(1,Math.round(Math.abs(he-n(d)))),!0)}function ve(){document.removeEventListener("mousemove",re),document.removeEventListener("mouseup",ve),w(v,!1),ne=!0,I=!0,H()}document.addEventListener("mousemove",re),document.addEventListener("mouseup",ve)}let ne=!1;function ke(A){if(ne){ne=!1;return}if(A.target.closest(".stop-thumb")||A.target.closest(".center-handle")||A.target.closest(".radius-handle"))return;const U=le(A),re=Vh(n(s),U),ve=[...n(s),{color:re,position:U}];w(s,ve,!0),I=!0,n(a)&&n(a)({...n(r),stops:ve}),n(l)&&n(l)(ve.length-1)}function _e(A,U){if(U.preventDefault(),U.stopPropagation(),n(s).length<=2)return;const re=n(s).filter((ve,ye)=>ye!==A);w(s,re,!0),I=!0,n(a)&&n(a)({...n(r),stops:re}),n(l)&&n(l)(Math.min(A,re.length-1))}var ie=L0(),ce=f(h(ie),2);{var se=A=>{var U=E0(),re=h(U),ve=h(re),ye=f(ve,2),O=h(ye),X=f(O);{var ge=Ie=>{var De=z0();te(()=>{fe(De,"x1",n(E).x1),fe(De,"y1",n(E).y1),fe(De,"x2",n(E).x2),fe(De,"y2",n(E).y2)}),m(Ie,De)};xe(X,Ie=>{n(Z)&&Ie(ge)})}var he=f(ye,2);{var Ce=Ie=>{var De=M0();te(()=>Ge(De,`left: ${n(Y)??""}%; top: ${n(q)??""}%`)),z("mousedown",De,Ae),m(Ie,De)};xe(he,Ie=>{n(L)&&Ie(Ce)})}var be=f(he,2);{var $e=Ie=>{var De=P0(),Ue=W(De),qe=f(Ue,2);{var Ze=ot=>{var Dt=S0();te(()=>Ge(Dt,`left: ${n(N).x??""}%; top: ${n(N).y??""}%`)),z("mousedown",Dt,Yt=>me("y",Yt)),m(ot,Dt)};xe(qe,ot=>{(n(i)==="rectangle"||n(i)==="ellipse")&&ot(Ze)})}te(()=>Ge(Ue,`left: ${n(ee).x??""}%; top: ${n(ee).y??""}%`)),z("mousedown",Ue,ot=>me("x",ot)),m(Ie,De)};xe(be,Ie=>{n(F)&&Ie($e)})}var Le=f(be,2);Xe(Le,17,()=>n(s),at,(Ie,De,Ue)=>{var qe=T0();let Ze;te(ot=>{Ze=Te(qe,1,"stop-thumb svelte-ki4x81",null,Ze,{selected:Ue===n(o)}),Ge(qe,ot)},[()=>Q(n(De))]),z("mousedown",qe,ot=>J(Ue,ot)),z("contextmenu",qe,ot=>_e(Ue,ot)),m(Ie,qe)}),Kt(re,Ie=>w(C,Ie),()=>n(C)),te(()=>{Te(re,1,`gradient-surface ${n(R)??""} axis-host`,"svelte-ki4x81"),Ge(re,`width: ${n(S)??""}px; height: ${n(T)??""}px;`),Ge(ve,`background: ${n(x)??""}; background-size: 100% 100%;${n(D)?` filter: ${n(D)};`:""}${n(j)?` background-blend-mode: ${n(j)};`:""}`),fe(O,"x1",n(B).x1),fe(O,"y1",n(B).y1),fe(O,"x2",n(B).x2),fe(O,"y2",n(B).y2)}),z("click",re,ke),m(A,U)},pe=A=>{var U=N0(),re=W(U),ve=f(re,2),ye=h(ve),O=h(ye),X=f(O);{var ge=Ie=>{var De=F0();te(()=>{fe(De,"x1",n(E).x1),fe(De,"y1",n(E).y1),fe(De,"x2",n(E).x2),fe(De,"y2",n(E).y2)}),m(Ie,De)};xe(X,Ie=>{n(Z)&&Ie(ge)})}var he=f(ye,2);{var Ce=Ie=>{var De=I0();te(()=>Ge(De,`left: ${n(Y)??""}%; top: ${n(q)??""}%`)),z("mousedown",De,Ae),m(Ie,De)};xe(he,Ie=>{n(L)&&Ie(Ce)})}var be=f(he,2);{var $e=Ie=>{var De=A0(),Ue=W(De),qe=f(Ue,2);te(()=>{Ge(Ue,`left: ${n(ee).x??""}%; top: ${n(ee).y??""}%`),Ge(qe,`left: ${n(N).x??""}%; top: ${n(N).y??""}%`)}),z("mousedown",Ue,Ze=>me("x",Ze)),z("mousedown",qe,Ze=>me("y",Ze)),m(Ie,De)};xe(be,Ie=>{n(F)&&Ie($e)})}var Le=f(be,2);Xe(Le,17,()=>n(s),at,(Ie,De,Ue)=>{var qe=j0();let Ze;te(ot=>{Ze=Te(qe,1,"stop-thumb svelte-ki4x81",null,Ze,{selected:Ue===n(o)}),Ge(qe,ot)},[()=>Q(n(De))]),z("mousedown",qe,ot=>J(Ue,ot)),z("contextmenu",qe,ot=>_e(Ue,ot)),m(Ie,qe)}),Kt(ve,Ie=>w(C,Ie),()=>n(C)),te(()=>{Ge(re,`background: ${n(x)??""}; background-size: 100% 100%;${n(D)?` filter: ${n(D)};`:""}${n(j)?` background-blend-mode: ${n(j)};`:""}`),fe(O,"x1",n(B).x1),fe(O,"y1",n(B).y1),fe(O,"x2",n(B).x2),fe(O,"y2",n(B).y2)}),z("click",ve,ke),m(A,U)};xe(ce,A=>{n(k)?A(se):A(pe,-1)})}Kt(ie,A=>w(b,A),()=>n(b)),m(e,ie),Ke()}tt(["click","mousedown","contextmenu"]);function D0(e){return[...e].sort((t,r)=>t.position-r.position)}function G0(e,t){const r=(o,i)=>Math.round((parseInt(o,16)+parseInt(i,16))/2).toString(16).padStart(2,"0");return(r(e.slice(0,2),t.slice(0,2))+r(e.slice(2,4),t.slice(2,4))+r(e.slice(4,6),t.slice(4,6))).toUpperCase()}function O0(e){var u,p;const t=D0(e);let r=0,o=0,i=100;for(let v=0;v<t.length-1;v++){const b=t[v+1].position-t[v].position;b>r&&(r=b,o=t[v].position,i=t[v+1].position)}const a=Math.round((o+i)/2),l=((u=t.find(v=>v.position===o))==null?void 0:u.color)||"888888",s=((p=t.find(v=>v.position===i))==null?void 0:p.color)||"888888",c=G0(l,s),d=[...e,{color:c,position:a}];return{stops:d,newIndex:d.length-1}}function B0(e,t,r){return e.map((o,i)=>i===t?{...o,...r}:o)}function q0(e,t){if(e.length<=2)return null;const r=e.filter((o,i)=>i!==t);return{stops:r,newIndex:Math.min(t,r.length-1)}}var Y0=G('<div class="section-label svelte-10tq9kx">Angle</div> <div class="input-row svelte-10tq9kx"><div class="num-input-wrap svelte-10tq9kx"><button class="pos-arrow left svelte-10tq9kx" tabindex="-1">&#9664;</button> <input class="num-input svelte-10tq9kx" type="number" min="0" max="360"/> <button class="pos-arrow right svelte-10tq9kx" tabindex="-1">&#9654;</button></div> <span class="input-suffix svelte-10tq9kx">°</span></div>',1),X0=G('<div class="section-label svelte-10tq9kx" style="margin-top: 4px">Center</div> <div class="input-row svelte-10tq9kx"><span class="input-prefix svelte-10tq9kx">X</span> <div class="num-input-wrap svelte-10tq9kx"><button class="pos-arrow left svelte-10tq9kx" tabindex="-1">&#9664;</button> <input class="num-input svelte-10tq9kx" type="number" min="0" max="100"/> <button class="pos-arrow right svelte-10tq9kx" tabindex="-1">&#9654;</button></div> <span class="input-prefix svelte-10tq9kx" style="margin-left: 4px">Y</span> <div class="num-input-wrap svelte-10tq9kx"><button class="pos-arrow left svelte-10tq9kx" tabindex="-1">&#9664;</button> <input class="num-input svelte-10tq9kx" type="number" min="0" max="100"/> <button class="pos-arrow right svelte-10tq9kx" tabindex="-1">&#9654;</button></div></div>',1),H0=G('<span class="input-prefix svelte-10tq9kx">X</span>'),U0=G('<span class="input-prefix svelte-10tq9kx" style="margin-left: 4px">Y</span> <div class="num-input-wrap svelte-10tq9kx"><button class="pos-arrow left svelte-10tq9kx" tabindex="-1">&#9664;</button> <input class="num-input svelte-10tq9kx" type="number" min="1" max="200"/> <button class="pos-arrow right svelte-10tq9kx" tabindex="-1">&#9654;</button></div>',1),W0=G('<div class="section-label svelte-10tq9kx" style="margin-top: 4px">Radius</div> <div class="input-row svelte-10tq9kx"><!> <div class="num-input-wrap svelte-10tq9kx"><button class="pos-arrow left svelte-10tq9kx" tabindex="-1">&#9664;</button> <input class="num-input svelte-10tq9kx" type="number" min="1" max="200"/> <button class="pos-arrow right svelte-10tq9kx" tabindex="-1">&#9654;</button></div> <!></div>',1),V0=G('<div class="section svelte-10tq9kx"><!> <!> <!></div>'),K0=G('<button class="stop-delete svelte-10tq9kx" title="Delete stop"><!></button>'),Z0=G('<div><button class="stop-color svelte-10tq9kx" title="Click to edit color"></button> <span class="stop-hex svelte-10tq9kx"> </span> <div class="stop-pos-wrap svelte-10tq9kx"><button class="pos-arrow left svelte-10tq9kx" tabindex="-1" title="Decrease">&#9664;</button> <input class="stop-pos svelte-10tq9kx" type="number" min="0" max="100"/> <button class="pos-arrow right svelte-10tq9kx" tabindex="-1" title="Increase">&#9654;</button></div> <span class="stop-pct svelte-10tq9kx">%</span> <!></div>'),J0=G("<button></button>"),Q0=G('<div class="gradient-settings svelte-10tq9kx"><div class="section svelte-10tq9kx"><div class="section-label svelte-10tq9kx">Type</div> <select class="combo svelte-10tq9kx"><optgroup label="Basic"><option>Linear</option> <option>Radial</option> <option>Conical</option></optgroup><optgroup label="Multi-point"><option>Radial Ramp</option> <option>Linear Ramp</option> <option>Square Ramp</option> <option>Reflected</option> <option>Mesh</option> <option>Volume Mesh</option></optgroup><optgroup label="Preset"><option>Duotone</option> <option>Tricolor</option> <option>Banding</option></optgroup></select></div> <!> <div class="section svelte-10tq9kx"><div class="section-label svelte-10tq9kx">Shape</div> <div class="toggle-row svelte-10tq9kx"><button title="Circle"><!></button> <button title="Ellipse"><!></button> <button title="Square"><!></button> <button title="Rectangle"><!></button> <button title="Triangle"><!></button></div></div> <div class="section svelte-10tq9kx"><div class="section-label svelte-10tq9kx">Edge</div> <div class="input-row svelte-10tq9kx"><div class="num-input-wrap svelte-10tq9kx"><button class="pos-arrow left svelte-10tq9kx" tabindex="-1">&#9664;</button> <input class="num-input svelte-10tq9kx" type="number" min="0" max="100"/> <button class="pos-arrow right svelte-10tq9kx" tabindex="-1">&#9654;</button></div> <span class="input-suffix svelte-10tq9kx">%</span></div></div> <div class="section stops-section svelte-10tq9kx"><div class="section-label svelte-10tq9kx">Stops</div> <div class="stops-list svelte-10tq9kx"></div> <button class="add-stop-btn svelte-10tq9kx"><!> Add</button></div> <div class="section svelte-10tq9kx"><div class="section-label svelte-10tq9kx">Presets</div> <div class="gradient-swatches-grid svelte-10tq9kx"></div></div></div>');function eb(e,t){Ve(t,!0);let r=P(()=>t.gradient),o=P(()=>t.selectedStop??0),i=P(()=>t.shape??"rectangle"),a=P(()=>t.onchange),l=P(()=>t.onSelectStop),s=P(()=>t.onEditStopColor),c=P(()=>t.onShapeChange),d=P(()=>t.gradientSwatches??[]),u=P(()=>t.onGradientPresetClick),p=P(()=>t.onGradientPresetDblClick),v=P(()=>t.onGradientPresetRightClick);function b(lt){n(a)({...n(r),...lt})}function g(lt,nt){n(a)({...n(r),stops:B0(n(r).stops,lt,nt)})}function _(lt){var xt;const nt=q0(n(r).stops,lt);nt&&(n(a)({...n(r),stops:nt.stops}),(xt=n(l))==null||xt(nt.newIndex))}function y(){var nt;const lt=O0(n(r).stops);n(a)({...n(r),stops:lt.stops}),(nt=n(l))==null||nt(lt.newIndex)}let S=P(()=>["linear","linearRamp","conical","reflected","duotone","tricolor","banding"].includes(n(r).type)),T=P(()=>["radial","conical","radialRamp","squareRamp","mesh","volumeMesh"].includes(n(r).type)),I=P(()=>["radial","radialRamp","linearRamp","squareRamp"].includes(n(r).type)),$=P(()=>[...n(r).stops].map((lt,nt)=>({...lt,origIdx:nt})).sort((lt,nt)=>lt.position-nt.position));function x(lt){lt.key==="Enter"&&lt.target.blur()}var D=Q0(),j=h(D),R=f(h(j),2),k=h(R),M=h(k);M.value=M.__value="linear";var L=f(M,2);L.value=L.__value="radial";var F=f(L,2);F.value=F.__value="conical";var Y=f(k),q=h(Y);q.value=q.__value="radialRamp";var oe=f(q,2);oe.value=oe.__value="linearRamp";var ee=f(oe,2);ee.value=ee.__value="squareRamp";var Z=f(ee,2);Z.value=Z.__value="reflected";var N=f(Z,2);N.value=N.__value="mesh";var C=f(N,2);C.value=C.__value="volumeMesh";var le=f(Y),Q=h(le);Q.value=Q.__value="duotone";var B=f(Q,2);B.value=B.__value="tricolor";var E=f(B,2);E.value=E.__value="banding";var H;jr(R);var J=f(j,2);{var Ae=lt=>{var nt=V0(),xt=h(nt);{var we=kt=>{var Je=Y0(),V=f(W(Je),2),Fe=h(V),je=h(Fe),Ee=f(je,2),Be=f(Ee,2);te(()=>Ct(Ee,n(r).angle)),z("click",je,()=>b({angle:Math.max(0,(n(r).angle??90)-1)})),z("keydown",Ee,x),z("change",Ee,Ne=>b({angle:parseInt(Ne.target.value)||0})),z("click",Be,()=>b({angle:Math.min(360,(n(r).angle??90)+1)})),m(kt,Je)};xe(xt,kt=>{n(S)&&kt(we)})}var We=f(xt,2);{var dt=kt=>{var Je=X0(),V=f(W(Je),2),Fe=f(h(V),2),je=h(Fe),Ee=f(je,2),Be=f(Ee,2),Ne=f(Fe,4),it=h(Ne),pt=f(it,2),mt=f(pt,2);te(()=>{Ct(Ee,n(r).centerX),Ct(pt,n(r).centerY)}),z("click",je,()=>b({centerX:Math.max(0,(n(r).centerX??50)-1)})),z("keydown",Ee,x),z("change",Ee,gt=>b({centerX:parseInt(gt.target.value)||50})),z("click",Be,()=>b({centerX:Math.min(100,(n(r).centerX??50)+1)})),z("click",it,()=>b({centerY:Math.max(0,(n(r).centerY??50)-1)})),z("keydown",pt,x),z("change",pt,gt=>b({centerY:parseInt(gt.target.value)||50})),z("click",mt,()=>b({centerY:Math.min(100,(n(r).centerY??50)+1)})),m(kt,Je)};xe(We,kt=>{n(T)&&kt(dt)})}var Mt=f(We,2);{var Gt=kt=>{var Je=W0(),V=f(W(Je),2),Fe=h(V);{var je=gt=>{var Xt=H0();m(gt,Xt)};xe(Fe,gt=>{(n(i)==="rectangle"||n(i)==="ellipse")&&gt(je)})}var Ee=f(Fe,2),Be=h(Ee),Ne=f(Be,2),it=f(Ne,2),pt=f(Ee,2);{var mt=gt=>{var Xt=U0(),Gn=f(W(Xt),2),zn=h(Gn),bn=f(zn,2),On=f(bn,2);te(()=>Ct(bn,n(r).radiusY)),z("click",zn,()=>b({radiusY:Math.max(1,(n(r).radiusY??50)-1)})),z("change",bn,Oo=>b({radiusY:parseInt(Oo.target.value)||50})),z("click",On,()=>b({radiusY:Math.min(200,(n(r).radiusY??50)+1)})),m(gt,Xt)};xe(pt,gt=>{(n(i)==="rectangle"||n(i)==="ellipse")&&gt(mt)})}te(()=>Ct(Ne,n(r).radiusX)),z("click",Be,()=>b({radiusX:Math.max(1,(n(r).radiusX??50)-1)})),z("keydown",Ne,x),z("change",Ne,gt=>b({radiusX:parseInt(gt.target.value)||50})),z("click",it,()=>b({radiusX:Math.min(200,(n(r).radiusX??50)+1)})),m(kt,Je)};xe(Mt,kt=>{n(I)&&kt(Gt)})}m(lt,nt)};xe(J,lt=>{(n(S)||n(T)||n(I))&&lt(Ae)})}var me=f(J,2),ne=f(h(me),2),ke=h(ne);let _e;var ie=h(ke);Oa(ie,{size:13,strokeWidth:1.5});var ce=f(ke,2);let se;var pe=h(ce);Oa(pe,{size:13,strokeWidth:1.5,style:"transform: scaleX(1.4)"});var A=f(ce,2);let U;var re=h(A);cd(re,{size:13,strokeWidth:1.5});var ve=f(A,2);let ye;var O=h(ve);ld(O,{size:13,strokeWidth:1.5});var X=f(ve,2);let ge;var he=h(X);Dh(he,{size:13,strokeWidth:1.5});var Ce=f(me,2),be=f(h(Ce),2),$e=h(be),Le=h($e),Ie=f(Le,2),De=f(Ie,2),Ue=f(Ce,2),qe=f(h(Ue),2);Xe(qe,21,()=>n($),at,(lt,nt)=>{var xt=Z0();let we;var We=h(xt),dt=f(We,2),Mt=h(dt),Gt=f(dt,2),kt=h(Gt),Je=f(kt,2),V=f(Je,2),Fe=f(Gt,4);{var je=Ee=>{var Be=K0(),Ne=h(Be);Ii(Ne,{size:10,strokeWidth:2}),z("click",Be,()=>_(n(nt).origIdx)),m(Ee,Be)};xe(Fe,Ee=>{n(r).stops.length>2&&Ee(je)})}te(()=>{we=Te(xt,1,"stop-row svelte-10tq9kx",null,we,{selected:n(nt).origIdx===n(o)}),Ge(We,`background: #${n(nt).color??""}`),Re(Mt,`#${n(nt).color??""}`),Ct(Je,n(nt).position)}),z("click",We,()=>{n(l)&&n(l)(n(nt).origIdx),n(s)&&n(s)(n(nt).origIdx)}),z("click",kt,()=>g(n(nt).origIdx,{position:Math.max(0,n(nt).position-1)})),z("keydown",Je,x),z("change",Je,Ee=>g(n(nt).origIdx,{position:parseInt(Ee.target.value)||0})),z("click",V,()=>g(n(nt).origIdx,{position:Math.min(100,n(nt).position+1)})),m(lt,xt)});var Ze=f(qe,2),ot=h(Ze);Fi(ot,{size:11,strokeWidth:2});var Dt=f(Ue,2),Yt=f(h(Dt),2);Xe(Yt,21,()=>n(d),at,(lt,nt,xt)=>{var we=J0();let We;te(dt=>{We=Te(we,1,"gradient-swatch svelte-10tq9kx",null,We,{empty:!n(nt)}),Ge(we,dt),fe(we,"title",n(nt)?`${n(nt).type} gradient — click to load, right-click to replace, double-click to clear`:"Click to store current gradient")},[()=>n(nt)?`background: ${oo(n(nt))}`:""]),z("click",we,()=>n(u)&&n(u)(xt)),z("dblclick",we,()=>n(p)&&n(p)(xt)),z("contextmenu",we,dt=>n(v)&&n(v)(xt,dt)),m(lt,we)}),te(()=>{H!==(H=n(r).type)&&(R.value=(R.__value=n(r).type)??"",Qn(R,n(r).type)),_e=Te(ke,1,"toggle-btn svelte-10tq9kx",null,_e,{active:n(i)==="circle"}),se=Te(ce,1,"toggle-btn svelte-10tq9kx",null,se,{active:n(i)==="ellipse"}),U=Te(A,1,"toggle-btn svelte-10tq9kx",null,U,{active:n(i)==="square"}),ye=Te(ve,1,"toggle-btn svelte-10tq9kx",null,ye,{active:n(i)==="rectangle"}),ge=Te(X,1,"toggle-btn svelte-10tq9kx",null,ge,{active:n(i)==="triangle"}),Ct(Ie,n(r).edge??0)}),z("change",R,lt=>b({type:lt.target.value})),z("click",ke,()=>n(c)&&n(c)("circle")),z("click",ce,()=>n(c)&&n(c)("ellipse")),z("click",A,()=>n(c)&&n(c)("square")),z("click",ve,()=>n(c)&&n(c)("rectangle")),z("click",X,()=>n(c)&&n(c)("triangle")),z("click",Le,()=>b({edge:Math.max(0,(n(r).edge??0)-1)})),z("keydown",Ie,x),z("change",Ie,lt=>b({edge:parseInt(lt.target.value)||0})),z("click",De,()=>b({edge:Math.min(100,(n(r).edge??0)+1)})),z("click",Ze,y),m(e,D),Ke()}tt(["change","click","keydown","dblclick","contextmenu"]);var tb=G('<div class="gradient-layout svelte-rrh42g"><div class="gradient-preview svelte-rrh42g"><!></div> <div class="gradient-sidebar svelte-rrh42g"><div class="sidebar-settings svelte-rrh42g"><!></div> <!></div></div>');function nb(e,t){Ve(t,!0);let r=K(t,"swatches",23,()=>[]),o=K(t,"onchange",3,null),i=K(t,"oneditstopcolor",3,null),a=K(t,"onswatchdblclick",3,null),l=K(t,"onswatchrightclick",3,null),s=ae(0),c=ae("rectangle"),d=zt(Array(24).fill(null));function u(x){var D;if(r()[x]){const j=t.gradient.stops.map((R,k)=>k===n(s)?{...R,color:r()[x]}:R);(D=o())==null||D({...t.gradient,stops:j})}else t.gradient.stops[n(s)]&&(r()[x]=t.gradient.stops[n(s)].color)}function p(x){var D;if(d[x]){const j=sn(d[x]);(D=o())==null||D(j)}else d[x]=sn(t.gradient)}function v(x){d[x]=null}function b(x,D){D.preventDefault(),d[x]=sn(t.gradient)}var g=tb(),_=h(g),y=h(_);R0(y,{get gradient(){return t.gradient},get selectedStop(){return n(s)},get shape(){return n(c)},onchange:x=>{var D;return(D=o())==null?void 0:D(x)},onSelectStop:x=>w(s,x,!0)});var S=f(_,2),T=h(S),I=h(T);eb(I,{get gradient(){return t.gradient},get selectedStop(){return n(s)},get shape(){return n(c)},onchange:x=>{var D;return(D=o())==null?void 0:D(x)},onSelectStop:x=>w(s,x,!0),onEditStopColor:x=>{var D;return(D=i())==null?void 0:D(x)},onShapeChange:x=>w(c,x,!0),get gradientSwatches(){return d},onGradientPresetClick:p,onGradientPresetDblClick:v,onGradientPresetRightClick:b});var $=f(T,2);Pl($,{get swatches(){return r()},onclick:u,ondblclick:x=>{var D;return(D=a())==null?void 0:D(x)},oncontextmenu:(x,D)=>{var j;return(j=l())==null?void 0:j(x,D)},getTitle:x=>x?`#${x} — click to assign to selected stop`:"Click to store stop color"}),m(e,g),Ke()}const Li=Ft(null);function Tl(e,t){const r=(t||"333333").replace(/^#/,"");let o,i;return r.length===8?(i=parseInt(r.slice(0,2),16)/255,o=r.slice(2,8)):(i=1,o=r.slice(0,6)),Li.set({...e,_initialColor:o,_initialAlpha:i}),{color:o,alpha:i}}function rb(e){const t=He(Li);if(t)if(t.type==="panel"){const r=He(bt);if(r==null)return;st(r,{[t.prop]:e,modified:!0})}else t.type==="control"&&et(t.controlId,t.path,e)}function ob(){Li.set(null)}const Ri=Ft(null);function ib(e,t){const r=t||{type:"linear",angle:90,stops:[{color:"FFFFFF",position:0},{color:"000000",position:100}],edge:0,centerX:50,centerY:50,radiusX:50,radiusY:50};return Ri.set({...e,_initialGradient:r}),r}function Cs(e){const t=He(Ri);return!t||t.type!=="control"?!1:(et(t.controlId,`${t.path}.gradient`,e),!0)}function ab(){Ri.set(null)}function zs(e,t,r,o){e&&r(e)&&e!==t.current&&(t.current=e,o(e)),e||(t.current=null)}var lb=G("<button> </button>"),sb=G('<div class="gradient-mini svelte-12apuct"><!></div>'),cb=G('<div class="notepad-color-mini svelte-12apuct"><div class="notepad-color-preview svelte-12apuct"></div> <div class="notepad-color-hex svelte-12apuct"> </div> <button class="notepad-color-back svelte-12apuct">Back to Notepad</button></div>'),db=G('<div class="display-panel svelte-12apuct"><div class="tab-bar svelte-12apuct"></div> <div class="tab-content svelte-12apuct"><div class="tab-pane svelte-12apuct"><div class="colors-layout svelte-12apuct"><div><!></div> <!> <!> <div class="colors-sidebar svelte-12apuct"><div class="sidebar-settings svelte-12apuct"><!></div> <!></div></div></div> <div class="tab-pane svelte-12apuct"><!></div> <div class="tab-pane svelte-12apuct"><!></div> <div class="tab-pane svelte-12apuct"><!></div> <div class="tab-pane svelte-12apuct"><div class="placeholder svelte-12apuct">Effects editor — full editing coming soon. Use Properties Panel for quick toggles.</div></div> <div class="tab-pane svelte-12apuct"><!></div> <div class="tab-pane svelte-12apuct"><!></div></div></div>');function ub(e,t){var xt;Ve(t,!0);const r=()=>Ye(Co,"$displayTabRequest",l),o=()=>Ye(wn,"$activePanel",l),i=()=>Ye(Li,"$colorTarget",l),a=()=>Ye(Ri,"$gradientTarget",l),[l,s]=It();let c=P(()=>t.onTabChange),d=ae("colors");Pt(()=>{const we=r();we&&(C(we.tab),Co.set(null))});let u=ae(zt(((xt=o())==null?void 0:xt.bgColour)??"333333")),p=ae(1);const v={current:null};Pt(()=>{zs(i(),v,we=>!!we._initialColor,we=>{w(d,"colors"),w(u,we._initialColor,!0),w(p,we._initialAlpha??1,!0)})});let b=ae(10),g=zt(Array(24).fill(null));const _={type:"linear",angle:90,centerX:50,centerY:50,radiusX:50,radiusY:50,edge:0,stops:[{color:"FF0000",position:0},{color:"0000FF",position:100}]};let y=ae(zt(sn(_))),S=ae(0),T=ae(null),I=ae(null);Pt(()=>{const we=o();we&&we.id!==n(I)&&(w(I,we.id,!0),w(y,we.bgGradient?sn(we.bgGradient):sn(_),!0),Fa(S))});const $={current:null};Pt(()=>{zs(a(),$,we=>!!we._initialGradient,we=>{var We;w(y,sn(we._initialGradient),!0),w(d,"gradient"),(We=n(c))==null||We("gradient")})});let x=ae(null),D=ae(!1),j=ae(null),R=P(()=>(()=>{if(n(x)===null)return n(y);const we=n(y).stops.map((We,dt)=>dt===n(x)?{...We,color:n(u)}:We);return{...n(y),stops:we}})());function k(we){if(we.length>=8?(w(p,parseInt(we.slice(0,2),16)/255),w(u,we.slice(2,8),!0)):(w(p,1),w(u,we.slice(0,6),!0)),n(x)!==null||n(D))return;if(i()){rb(we);return}const We=o();We&&st(We.id,{bgColour:n(u),modified:!0})}function M(we){const We=g.findIndex(dt=>dt===null);return We!==-1?(g[We]=we,`#${we} saved to swatch ${We+1}`):`#${we} — no empty swatch (double-click one to clear)`}function L(we){if(w(y,we,!0),a()&&Cs(we))return;const We=o();We&&st(We.id,{bgGradient:we,modified:!0})}function F(we){n(y).stops[we]&&(w(x,we,!0),w(u,n(y).stops[we].color,!0),w(p,1),w(d,"colors"))}function Y(){if(n(x)===null)return;const we=n(y).stops.map((dt,Mt)=>Mt===n(x)?{...dt,color:n(u)}:dt);if(w(y,{...n(y),stops:we},!0),a()&&Cs(n(y)))return;const We=o();We&&st(We.id,{bgGradient:n(y),modified:!0})}function q(){Y();const we=o();we&&(w(u,we.bgColour,!0),w(p,1)),w(x,null),w(d,"gradient"),n(c)&&n(c)("gradient")}function oe(){const we=window.getSelection();we&&we.rangeCount>0&&w(j,we.getRangeAt(0).cloneRange(),!0),w(D,!0),w(d,"colors"),n(c)&&n(c)("colors")}function ee(){var dt,Mt;const we=n(u),We=n(j);w(j,null),Z(),w(D,!1),w(d,"notepad"),(dt=n(c))==null||dt("notepad"),(Mt=n(T))==null||Mt.applyTextColor(we,We)}function Z(){const we=o();we&&(w(u,we.bgColour,!0),w(p,1))}function N(){const we=o();we&&w(y,we.bgGradient?sn(we.bgGradient):sn(_),!0)}function C(we){we!=="colors"&&(n(x)!==null&&(Y(),w(x,null),Z()),n(D)&&(w(j,null),w(D,!1),Z()),i()&&(ob(),Z())),we!=="gradient"&&a()&&(ab(),N()),w(d,we,!0),n(c)&&n(c)(we)}function le(we){g[we]?k("FF"+g[we]):g[we]=n(u)}function Q(we){g[we]=null}function B(we,We){We.preventDefault(),g[we]=n(u)}const E=[{id:"colors",label:"Colors"},{id:"gradient",label:"Gradient"},{id:"effects",label:"Effects"},{id:"notepad",label:"Notepad"},{id:"viewer",label:"Viewer"},{id:"align",label:"Align"},{id:"console",label:"Console"}];var H=db(),J=h(H);Xe(J,21,()=>E,at,(we,We)=>{var dt=lb();let Mt;var Gt=h(dt);te(()=>{Mt=Te(dt,1,"tab svelte-12apuct",null,Mt,{active:n(d)===n(We).id}),Re(Gt,n(We).label)}),z("click",dt,()=>C(n(We).id)),m(we,dt)});var Ae=f(J,2),me=h(Ae);let ne;var ke=h(me),_e=h(ke);let ie;var ce=h(_e);p1(ce,{get color(){return n(u)},get alpha(){return n(p)},get stepSize(){return n(b)},onchange:k});var se=f(_e,2);{var pe=we=>{var We=sb(),dt=h(We);P1(dt,{get gradient(){return n(R)},shape:gradientShape,onBack:q}),m(we,We)};xe(se,we=>{n(x)!==null&&n(y)&&we(pe)})}var A=f(se,2);{var U=we=>{var We=cb(),dt=h(We),Mt=f(dt,2),Gt=h(Mt),kt=f(Mt,2);te(()=>{Ge(dt,`background: #${n(u)??""}`),Re(Gt,`#${n(u)??""}`)}),z("click",kt,ee),m(we,We)};xe(A,we=>{n(D)&&we(U)})}var re=f(A,2),ve=h(re),ye=h(ve);C1(ye,{get color(){return n(u)},get alpha(){return n(p)},onApplyColor:k,get stepSize(){return n(b)},set stepSize(we){w(b,we,!0)}});var O=f(ve,2);Pl(O,{get swatches(){return g},onclick:le,ondblclick:Q,oncontextmenu:B});var X=f(me,2);let ge;var he=h(X);nb(he,{get gradient(){return n(y)},get swatches(){return g},onchange:L,oneditstopcolor:F,onswatchdblclick:Q,onswatchrightclick:B});var Ce=f(X,2);let be;var $e=h(Ce);Kt(b0($e,{get swatches(){return g},get resetKey(){return n(S)},onswatchstore:(we,We)=>g[we]=We,onswatchdblclick:Q,onswatchrightclick:B,onpickcolor:oe}),we=>w(T,we,!0),()=>n(T));var Le=f(Ce,2);let Ie;var De=h(Le);a0(De,{get resetKey(){return n(S)},oncolorpicked:M});var Ue=f(Le,2);let qe;var Ze=f(Ue,2);let ot;var Dt=h(Ze);U1(Dt,{});var Yt=f(Ze,2);let lt;var nt=h(Yt);B1(nt,{}),te(()=>{ne=Ge(me,"",ne,{display:n(d)==="colors"?"block":"none"}),ie=Te(_e,1,"colors-preview svelte-12apuct",null,ie,{split:n(x)!==null||n(D)}),ge=Ge(X,"",ge,{display:n(d)==="gradient"?"block":"none"}),be=Ge(Ce,"",be,{display:n(d)==="notepad"?"block":"none"}),Ie=Ge(Le,"",Ie,{display:n(d)==="viewer"?"block":"none"}),qe=Ge(Ue,"",qe,{display:n(d)==="effects"?"block":"none"}),ot=Ge(Ze,"",ot,{display:n(d)==="align"?"block":"none"}),lt=Ge(Yt,"",lt,{display:n(d)==="console"?"block":"none"})}),m(e,H),Ke(),s()}tt(["click"]);const El=Ft("");function vb(e){El.set(e)}function fb(){El.set("")}var hb=G('<div class="props-toolbar svelte-mc4nwp"><button title="Undo"><!></button> <button title="Redo"><!></button> <div class="toolbar-divider svelte-mc4nwp"></div> <button title="Save panel"><!></button> <button><!></button> <div class="toolbar-divider svelte-mc4nwp"></div> <button><!></button> <button><!></button> <div class="toolbar-spacer svelte-mc4nwp"></div> <button><!></button> <button><!></button></div>');function pb(e,t){Ve(t,!0);const r=()=>Ye(Da,"$undoAvailable",i),o=()=>Ye(Ga,"$redoAvailable",i),[i,a]=It();let l=K(t,"pinPanelProps",3,!1),s=K(t,"viewMode",3,"single"),c=K(t,"ontogglepin",3,null),d=K(t,"ontoggleview",3,null);var u=hb(),p=h(u);let v;var b=h(p);Oh(b,{size:18,strokeWidth:1.5});var g=f(p,2);let _;var y=h(g);$h(y,{size:18,strokeWidth:1.5});var S=f(g,4);let T;var I=h(S);wh(I,{size:18,strokeWidth:1.5});var $=f(S,2);let x;var D=h($);{var j=J=>{nd(J,{size:18,strokeWidth:1.5})},R=J=>{td(J,{size:18,strokeWidth:1.5})};xe(D,J=>{t.panel.locked?J(j):J(R,-1)})}var k=f($,4);let M;var L=h(k);Ba(L,{size:18,strokeWidth:1.5});var F=f(k,2);let Y;var q=h(F);rd(q,{size:18,strokeWidth:1.5});var oe=f(F,4);let ee;var Z=h(oe);{var N=J=>{yh(J,{size:16,strokeWidth:1.5})},C=J=>{_h(J,{size:16,strokeWidth:1.5})};xe(Z,J=>{l()?J(N):J(C,-1)})}var le=f(oe,2);let Q;var B=h(le);{var E=J=>{Qc(J,{size:16,strokeWidth:1.5})},H=J=>{Ph(J,{size:16,strokeWidth:1.5})};xe(B,J=>{s()==="single"?J(E):J(H,-1)})}te(()=>{v=Te(p,1,"toolbar-btn svelte-mc4nwp",null,v,{active:r()}),p.disabled=!r(),_=Te(g,1,"toolbar-btn svelte-mc4nwp",null,_,{active:o()}),g.disabled=!o(),T=Te(S,1,"toolbar-btn svelte-mc4nwp",null,T,{active:t.panel.modified}),x=Te($,1,"toolbar-btn svelte-mc4nwp",null,x,{active:t.panel.locked}),fe($,"title",t.panel.locked?"Unlock panel":"Lock panel"),M=Te(k,1,"toolbar-btn svelte-mc4nwp",null,M,{active:t.panel.gridEnabled}),fe(k,"title",t.panel.gridEnabled?"Hide grid":"Show grid"),Y=Te(F,1,"toolbar-btn svelte-mc4nwp",null,Y,{active:t.panel.snapToGrid}),fe(F,"title",t.panel.snapToGrid?"Disable snap":"Enable snap"),ee=Te(oe,1,"toolbar-btn svelte-mc4nwp",null,ee,{active:l()}),fe(oe,"title",l()?"Unpin panel properties":"Pin panel properties"),Q=Te(le,1,"toolbar-btn svelte-mc4nwp",null,Q,{active:s()==="multi"}),fe(le,"title",s()==="single"?"Switch to multi view":"Switch to single view")}),z("click",p,function(...J){mo==null||mo.apply(this,J)}),z("click",g,function(...J){_o==null||_o.apply(this,J)}),z("click",S,()=>Bc()),z("click",$,()=>st(t.panel.id,{locked:!t.panel.locked})),z("click",k,()=>st(t.panel.id,{gridEnabled:!t.panel.gridEnabled})),z("click",F,()=>st(t.panel.id,{snapToGrid:!t.panel.snapToGrid})),z("click",oe,()=>{var J;return(J=c())==null?void 0:J()}),z("click",le,()=>{var J;return(J=d())==null?void 0:J()}),m(e,u),Ke(),a()}tt(["click"]);var gb=G("<button><!></button>"),bb=G('<div class="icon-tabs svelte-yttbte"><!> <div class="tab-spacer svelte-yttbte"></div></div>');function ba(e,t){Ve(t,!0);let r=K(t,"tabs",19,()=>[]),o=K(t,"isActive",3,()=>!1),i=K(t,"onclick",3,null),a=K(t,"titlePrefix",3,"");var l=bb(),s=h(l);Xe(s,17,r,c=>c.id,(c,d)=>{var u=gb();let p;var v=h(u);$o(v,()=>n(d).icon,(b,g)=>{g(b,{size:20,strokeWidth:1.5})}),te(b=>{p=Te(u,1,"tab-icon svelte-yttbte",null,p,b),fe(u,"title",a()+n(d).label)},[()=>({active:o()(n(d).id)})]),z("click",u,b=>{var g;return(g=i())==null?void 0:g(n(d).id,b)}),m(c,u)}),m(e,l),Ke()}tt(["click"]);var mb=G('<div class="num-input svelte-16ngfpx"><button class="num-btn svelte-16ngfpx" title="Decrease">&minus;</button> <input class="num-field svelte-16ngfpx" type="number"/> <button class="num-btn svelte-16ngfpx" title="Increase">+</button></div>');function _t(e,t){Ve(t,!0);let r=K(t,"value",3,0),o=K(t,"step",3,1),i=K(t,"min",3,void 0),a=K(t,"max",3,void 0),l=K(t,"onchange",3,null);function s(S){return i()!=null&&S<i()&&(S=i()),a()!=null&&S>a()&&(S=a()),S}function c(S){var I;const T=s(S);(I=l())==null||I(T)}function d(){c((r()??0)-o())}function u(){c((r()??0)+o())}function p(S){const T=Number(S.target.value);isNaN(T)||c(T)}function v(S){S.target.select()}var b=mb(),g=h(b),_=f(g,2),y=f(_,2);te(()=>{Ct(_,r()),fe(_,"step",o()),fe(_,"min",i()),fe(_,"max",a())}),z("click",g,d),Qe("focus",_,v),z("change",_,p),z("click",y,u),m(e,b),Ke()}tt(["click","change"]);var _b=G('<div role="group"><span class="property-label svelte-1ju67x2"> </span> <div class="property-input svelte-1ju67x2"><!></div></div>');function ct(e,t){Ve(t,!0);let r=K(t,"label",3,""),o=K(t,"span",3,1),i=K(t,"disabled",3,!1),a=K(t,"hint",3,"");var l=_b();let s;var c=h(l),d=h(c),u=f(c,2),p=h(u);Fc(p,()=>t.children),te(()=>{s=Te(l,1,"property-cell svelte-1ju67x2",null,s,{"span-1":o()===1,"span-2":o()===2,"span-4":o()===4,disabled:i()}),Re(d,r())}),Qe("mouseenter",l,()=>a()&&vb(a())),Qe("mouseleave",l,()=>a()&&fb()),m(e,l),Ke()}var yb=G('<div class="property-grid svelte-166v1jb"><!></div>'),$b=G('<div class="property-section svelte-166v1jb"><button class="property-section-header svelte-166v1jb"><svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 3l3 4 3-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg> <span class="header-line svelte-166v1jb"></span> <span class="property-section-title"> </span></button> <!></div>');function Vt(e,t){Ve(t,!0);let r=K(t,"title",3,""),o=K(t,"collapsed",15,!1),i=K(t,"ontoggle",3,null);function a(){var g;o(!o()),(g=i())==null||g(o())}var l=$b(),s=h(l),c=h(s);let d;var u=f(c,4),p=h(u),v=f(s,2);{var b=g=>{var _=yb(),y=h(_);Fc(y,()=>t.children),m(g,_)};xe(v,g=>{o()||g(b)})}te(()=>{d=Te(c,0,"chevron svelte-166v1jb",null,d,{collapsed:o()}),Re(p,r())}),z("click",s,a),m(e,l),Ke()}tt(["click"]);var xb=G("<button> </button>");function Bn(e,t){Ve(t,!0);let r=K(t,"value",3,!1),o=K(t,"onchange",3,null);function i(){var c;(c=o())==null||c(!r())}var a=xb();let l;var s=h(a);te(()=>{l=Te(a,1,"property-toggle svelte-f6ymfy",null,l,{on:r()}),Re(s,r()?"On":"Off")}),z("click",a,i),m(e,a),Ke()}tt(["click"]);var wb=G('<div class="property-color svelte-12hw957"><button class="mini-swatch svelte-12hw957" title="Pick colour"></button> <input class="color-hex svelte-12hw957" type="text"/></div>');function Va(e,t){Ve(t,!0);let r=K(t,"value",3,"000000"),o=K(t,"onchange",3,null),i=K(t,"onswatchclick",3,null);function a(u){var p;(p=o())==null||p(u.target.value)}function l(u){u.target.select()}var s=wb(),c=h(s),d=f(c,2);te(u=>{Ge(c,`background:#${u??""}`),Ct(d,r())},[()=>r().slice(-6)]),z("click",c,()=>{var u;return(u=i())==null?void 0:u()}),Qe("focus",d,l),z("change",d,a),m(e,s),Ke()}tt(["click","change"]);var kb=G('<div class="property-scrub svelte-2j4xs3"><span class="scrub-label svelte-2j4xs3"> </span> <div class="scrub-track svelte-2j4xs3"><div class="scrub-fill svelte-2j4xs3"></div> <div class="scrub-thumb svelte-2j4xs3"></div></div> <input class="scrub-value svelte-2j4xs3" type="text"/></div>');function ma(e,t){Ve(t,!0);let r=K(t,"value",3,100),o=K(t,"min",3,0),i=K(t,"max",3,200),a=K(t,"step",3,1),l=K(t,"label",3,""),s=K(t,"onchange",3,null),c=ae(null),d=ae(!1);function u(R){return(R-o())/(i()-o())*100}function p(R){if(!n(c))return r();const k=n(c).getBoundingClientRect(),M=Math.max(0,Math.min(1,(R-k.left)/k.width));let L=o()+M*(i()-o());return L=Math.round(L/a())*a(),Math.max(o(),Math.min(i(),L))}function v(R){var M;w(d,!0),n(c).setPointerCapture(R.pointerId);const k=p(R.clientX);k!==r()&&((M=s())==null||M(k))}function b(R){var M;if(!n(d))return;const k=p(R.clientX);k!==r()&&((M=s())==null||M(k))}function g(){w(d,!1)}function _(R){R.target.select()}function y(R){var M;let k=parseFloat(R.target.value);isNaN(k)||(k=Math.max(o(),Math.min(i(),k)),(M=s())==null||M(k))}var S=kb(),T=h(S),I=h(T),$=f(T,2),x=h($),D=f(x,2);Kt($,R=>w(c,R),()=>n(c));var j=f($,2);te((R,k,M)=>{Re(I,l()),Ge(x,`width:${R??""}%`),Ge(D,`left:${k??""}%`),Ct(j,M)},[()=>u(r()),()=>u(r()),()=>Math.round(r())]),z("pointerdown",$,v),z("pointermove",$,b),z("pointerup",$,g),Qe("lostpointercapture",$,g),Qe("focus",j,_),z("change",j,y),m(e,S),Ke()}tt(["pointerdown","pointermove","pointerup","change"]);var Cb=G('<button><span class="align-dot svelte-bn9o6"></span></button>'),zb=G('<div class="alignment-picker svelte-bn9o6"></div>');function Mb(e,t){Ve(t,!0);let r=K(t,"value",3,"center"),o=K(t,"onchange",3,null);const i=["top-left","top","top-right","left","center","right","bottom-left","bottom","bottom-right"];function a(s){var c;(c=o())==null||c(s)}var l=zb();Xe(l,21,()=>i,at,(s,c)=>{var d=Cb();let u;te(()=>{u=Te(d,1,"align-cell svelte-bn9o6",null,u,{active:r()===n(c)}),fe(d,"title",n(c))}),z("click",d,()=>a(n(c))),m(s,d)}),m(e,l),Ke()}tt(["click"]);var Sb=G("<option> </option>"),Pb=G('<select class="val svelte-olietv"></select>');function Tb(e,t){Ve(t,!0);let r=K(t,"value",3,"normal"),o=K(t,"onchange",3,null);const i=[["normal","Normal"],["multiply","Multiply"],["screen","Screen"],["overlay","Overlay"],["darken","Darken"],["lighten","Lighten"],["color-dodge","Dodge"],["color-burn","Burn"],["soft-light","Soft Light"],["hard-light","Hard Light"],["difference","Difference"],["exclusion","Exclusion"],["hue","Hue"],["saturation","Saturation"],["color","Color"],["luminosity","Luminosity"]];var a=Pb();Xe(a,21,()=>i,([s,c])=>s,(s,c)=>{var d=P(()=>zi(n(c),2));let u=()=>n(d)[0],p=()=>n(d)[1];var v=Sb(),b=h(v),g={};te(()=>{Re(b,p()),g!==(g=u())&&(v.value=(v.__value=u())??"")}),m(s,v)});var l;jr(a),te(()=>{l!==(l=r())&&(a.value=(a.__value=r())??"",Qn(a,r()))}),z("change",a,s=>{var c;return(c=o())==null?void 0:c(s.target.value)}),m(e,a),Ke()}tt(["change"]);var Eb=G("<option> </option>"),Fb=G('<select class="val svelte-oiio1n"></select>');function Ib(e,t){Ve(t,!0);let r=K(t,"value",3,"fill"),o=K(t,"onchange",3,null);const i=[["fill","Fill"],["fit","Fit"],["stretch","Stretch"],["tile","Tile"],["original","Original"]];var a=Fb();Xe(a,21,()=>i,([s,c])=>s,(s,c)=>{var d=P(()=>zi(n(c),2));let u=()=>n(d)[0],p=()=>n(d)[1];var v=Eb(),b=h(v),g={};te(()=>{Re(b,p()),g!==(g=u())&&(v.value=(v.__value=u())??"")}),m(s,v)});var l;jr(a),te(()=>{l!==(l=r())&&(a.value=(a.__value=r())??"",Qn(a,r()))}),z("change",a,s=>{var c;return(c=o())==null?void 0:c(s.target.value)}),m(e,a),Ke()}tt(["change"]);var Ab=G('<div class="bg-file-row svelte-13x2y0h"><button class="bg-browse-btn svelte-13x2y0h" title="Browse...">...</button> <input class="val svelte-13x2y0h" type="text"/></div>'),jb=G('<div class="bg-props-layout svelte-13x2y0h"><div class="bg-props-left svelte-13x2y0h"><span class="bg-props-label svelte-13x2y0h">Align</span> <!></div> <div class="bg-props-right svelte-13x2y0h"><!> <!> <!></div></div> <!> <!> <!> <!>',1),Nb=G('<!> <!> <!> <!> <div class="bg-effects-layout svelte-13x2y0h"><div class="bg-scrub-group svelte-13x2y0h"><!> <!> <!></div> <div class="bg-grayscale-col svelte-13x2y0h"><span class="bg-props-label svelte-13x2y0h">Gray</span> <button title="Toggle grayscale">B/W</button></div></div>',1),Lb=G("<!> <!>",1),Rb=G("<!> <!>",1);function Ms(e,t){Ve(t,!0);let r=K(t,"defaultFit",3,"fill"),o=K(t,"placeholder",3,"No file selected"),i=K(t,"collapsed",3,!0),a=K(t,"onupdate",3,null),l=K(t,"onbrowse",3,null),s=K(t,"oncollapsetoggle",3,null),c=K(t,"onswatchclick",3,null);const d=T=>`bg${t.prefix}${T}`;function u(T,I=void 0){var x;const $=(x=t.panel)==null?void 0:x[d(T)];return $??I}function p(T,I){var $;($=a())==null||$({[d(T)]:I})}function v(T){p(T,!u(T,!1))}let b=P(()=>u("Fit",r()));var g=Rb(),_=W(g);Vt(_,{get title(){return t.label},get collapsed(){return i()},ontoggle:T=>{var I;return(I=s())==null?void 0:I(T)},children:(T,I)=>{var $=Ab(),x=h($),D=f(x,2);te(j=>{Ct(D,j),fe(D,"placeholder",o())},[()=>{var j;return((j=t.panel)==null?void 0:j[d("")])??""}]),z("click",x,()=>{var j;return(j=l())==null?void 0:j()}),Qe("focus",D,j=>j.target.select()),z("change",D,j=>p("",j.target.value)),m(T,$)},$$slots:{default:!0}});var y=f(_,2);{var S=T=>{var I=Lb(),$=W(I);Vt($,{title:"Geometry",children:(D,j)=>{var R=jb(),k=W(R),M=h(k),L=f(h(M),2);{let Q=P(()=>u("Align","center"));Mb(L,{get value(){return n(Q)},onchange:B=>p("Align",B)})}var F=f(M,2),Y=h(F);{let Q=P(()=>t.label.toLowerCase());ct(Y,{label:"Fit",span:1,get hint(){return`How the ${n(Q)??""} fills the panel area`},children:(B,E)=>{Ib(B,{get value(){return n(b)},onchange:H=>p("Fit",H)})},$$slots:{default:!0}})}var q=f(Y,2);ct(q,{label:"Offset X",span:1,hint:"Horizontal offset from anchor in pixels",children:(Q,B)=>{{let E=P(()=>u("OffsetX",0));_t(Q,{get value(){return n(E)},step:1,onchange:H=>p("OffsetX",H)})}},$$slots:{default:!0}});var oe=f(q,2);ct(oe,{label:"Offset Y",span:1,hint:"Vertical offset from anchor in pixels",children:(Q,B)=>{{let E=P(()=>u("OffsetY",0));_t(Q,{get value(){return n(E)},step:1,onchange:H=>p("OffsetY",H)})}},$$slots:{default:!0}});var ee=f(k,2);{let Q=P(()=>t.label.toLowerCase());ct(ee,{label:"Flip H",span:1,get hint(){return`Flip ${n(Q)??""} horizontally`},children:(B,E)=>{{let H=P(()=>u("FlipH",!1));Bn(B,{get value(){return n(H)},onchange:()=>v("FlipH")})}},$$slots:{default:!0}})}var Z=f(ee,2);{let Q=P(()=>t.label.toLowerCase());ct(Z,{label:"Flip V",span:1,get hint(){return`Flip ${n(Q)??""} vertically`},children:(B,E)=>{{let H=P(()=>u("FlipV",!1));Bn(B,{get value(){return n(H)},onchange:()=>v("FlipV")})}},$$slots:{default:!0}})}var N=f(Z,2);{let Q=P(()=>t.label.toLowerCase());ct(N,{label:"Angle",span:2,get hint(){return`Rotate the ${n(Q)??""} in degrees`},children:(B,E)=>{{let H=P(()=>u("Rotation",0));_t(B,{get value(){return n(H)},step:1,min:-360,max:360,onchange:J=>p("Rotation",J)})}},$$slots:{default:!0}})}var C=f(N,2);{var le=Q=>{ct(Q,{label:"Scale",span:4,hint:"Tile size multiplier",children:(B,E)=>{{let H=P(()=>u("TileScale",1));_t(B,{get value(){return n(H)},step:.1,min:.1,onchange:J=>p("TileScale",J)})}},$$slots:{default:!0}})};xe(C,Q=>{n(b)==="tile"&&Q(le)})}m(D,R)},$$slots:{default:!0}});var x=f($,2);Vt(x,{title:"Color Effects",children:(D,j)=>{var R=Nb(),k=W(R);ct(k,{label:"Blend",span:1,hint:"Blend mode for compositing",children:(Q,B)=>{{let E=P(()=>u("Blend","normal"));Tb(Q,{get value(){return n(E)},onchange:H=>p("Blend",H)})}},$$slots:{default:!0}});var M=f(k,2);ct(M,{label:"Opacity",span:1,get hint(){return`${t.label??""} layer opacity (0–100%)`},children:(Q,B)=>{{let E=P(()=>u("Opacity",100));_t(Q,{get value(){return n(E)},step:1,min:0,max:100,onchange:H=>p("Opacity",H)})}},$$slots:{default:!0}});var L=f(M,2);ct(L,{label:"Blur",span:1,hint:"Blur amount in pixels",children:(Q,B)=>{{let E=P(()=>u("Blur",0));_t(Q,{get value(){return n(E)},step:1,min:0,onchange:H=>p("Blur",H)})}},$$slots:{default:!0}});var F=f(L,2);{let Q=P(()=>t.label.toLowerCase());ct(F,{label:"Tint",span:1,get hint(){return`Colour tint applied over the ${n(Q)??""}`},children:(B,E)=>{{let H=P(()=>String(u("Tint","FFFFFF")));Va(B,{get value(){return n(H)},onchange:J=>p("Tint",J),onswatchclick:()=>{var J;return(J=c())==null?void 0:J(d("Tint"),u("Tint","FFFFFF"))}})}},$$slots:{default:!0}})}var Y=f(F,2),q=h(Y),oe=h(q);{let Q=P(()=>u("Saturation",100));ma(oe,{label:"Sat",get value(){return n(Q)},min:0,max:200,onchange:B=>p("Saturation",B)})}var ee=f(oe,2);{let Q=P(()=>u("Brightness",100));ma(ee,{label:"Bri",get value(){return n(Q)},min:0,max:200,onchange:B=>p("Brightness",B)})}var Z=f(ee,2);{let Q=P(()=>u("Contrast",100));ma(Z,{label:"Con",get value(){return n(Q)},min:0,max:200,onchange:B=>p("Contrast",B)})}var N=f(q,2),C=f(h(N),2);let le;te(Q=>le=Te(C,1,"bg-grayscale-btn svelte-13x2y0h",null,le,Q),[()=>({active:u("Grayscale",!1)})]),z("click",C,()=>v("Grayscale")),m(D,R)},$$slots:{default:!0}}),m(T,I)};xe(y,T=>{i()||T(S)})}m(e,g),Ke()}tt(["click","change"]);function Db(e){return e==null?"—":e<1024?`${e} B`:e<1024*1024?`${(e/1024).toFixed(1)} KB`:`${(e/(1024*1024)).toFixed(2)} MB`}function Ss(e){if(!e)return"—";const t=new Date(e);return t.toLocaleDateString()+" "+t.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}function Gb(e,t,r){if(!e)return{level:"red",msg:"ID cannot be empty"};if(!/^[a-zA-Z_]/.test(e))return{level:"red",msg:"Must start with a letter or underscore"};if(!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(e))return{level:"red",msg:"Only letters, numbers and underscores allowed"};const o=t.find(i=>i.id!==r&&i.scriptId===e);return o?{level:"red",msg:`ID "${e}" is already used by "${o.name}"`}:/^[A-Z]/.test(e)?{level:"yellow",msg:"Convention: start with lowercase (camelCase or snake_case)"}:{level:"green",msg:"Valid identifier"}}const $d=Ft({});function br(e,t){$d.update(r=>({...r,[e]:t}))}var Ob=G('<input class="val svelte-3rgj88" type="text"/>'),Bb=G('<input type="text"/>'),qb=G('<div class="validation-row svelte-3rgj88"><span> </span></div>'),Yb=G('<input class="val svelte-3rgj88" type="text" placeholder="Author name"/>'),Xb=G('<input class="val svelte-3rgj88" type="text"/>'),Hb=G('<textarea class="val val-textarea svelte-3rgj88" rows="3" placeholder="Panel description..."></textarea>'),Ub=G("<!> <!> <!> <!> <!> <!>",1),Wb=G("<!> <!>",1),Vb=G("<!> <!>",1),Kb=G("<!> <!> <!> <!> <!> <!>",1),Zb=G('<div class="info-row svelte-3rgj88"><span class="info-label svelte-3rgj88">Panel ID</span> <span class="info-value svelte-3rgj88"> </span></div> <div class="info-row svelte-3rgj88"><span class="info-label svelte-3rgj88">File</span> <span class="info-value svelte-3rgj88"> </span></div> <div class="info-row svelte-3rgj88"><span class="info-label svelte-3rgj88">Size</span> <span class="info-value svelte-3rgj88"> </span></div> <div class="info-row svelte-3rgj88"><span class="info-label svelte-3rgj88">Created</span> <span class="info-value svelte-3rgj88"> </span></div> <div class="info-row svelte-3rgj88"><span class="info-label svelte-3rgj88">Modified</span> <span class="info-value svelte-3rgj88"> </span></div>',1),Jb=G("<!> <!> <!> <!> <!>",1),Qb=G('<div class="bg-layer-buttons svelte-3rgj88"><button title="Solid fill"><!> <span class="bg-layer-label svelte-3rgj88">Solid</span></button> <button title="Gradient overlay"><!> <span class="bg-layer-label svelte-3rgj88">Gradient</span></button> <button title="Image overlay"><!> <span class="bg-layer-label svelte-3rgj88">Image</span></button> <button title="Texture overlay"><!> <span class="bg-layer-label svelte-3rgj88">Texture</span></button></div>'),em=G('<div><span class="zorder-label svelte-3rgj88"> </span> <span class="zorder-status svelte-3rgj88"> </span> <button class="zorder-btn svelte-3rgj88" title="Move up (front)"><!></button> <button class="zorder-btn svelte-3rgj88" title="Move down (back)"><!></button></div>'),tm=G('<div class="zorder-hint svelte-3rgj88">Front</div> <!> <div class="zorder-hint svelte-3rgj88">Back</div>',1),nm=G('<button class="bg-swatch svelte-3rgj88" title="Pick colour"></button>'),rm=G('<input class="val svelte-3rgj88" type="text"/>'),om=G("<!> <!>",1),im=G('<button class="bg-swatch svelte-3rgj88" title="Edit gradient"></button>'),am=G('<input class="val svelte-3rgj88" type="text" placeholder="Unnamed"/>'),lm=G("<!> <!> <!>",1),sm=G("<!> <!> <!> <!>",1),cm=G("<!> <!> <!>",1),dm=G('<select class="val svelte-3rgj88"><option>Lines</option><option>Dots</option><option>Crosses</option></select>'),um=G("<!> <!> <!> <!> <!> <!>",1),vm=G("<!> <!>",1),fm=G("<!> <!> <!>",1),hm=G("<!> <!> <!>",1),pm=G('<div class="placeholder svelte-3rgj88">No export settings configured</div>'),gm=G('<div class="placeholder svelte-3rgj88"> </div>');function bm(e,t){Ve(t,!0);const r=()=>Ye(yt,"$panels",a),o=()=>Ye(bt,"$activePanelId",a),i=()=>Ye($d,"$sectionCollapse",a),[a,l]=It();let s=K(t,"tabId",3,""),c=P(()=>r().find(C=>C.id===o())??null),d=P(()=>i()["bg-image"]??!0),u=P(()=>i()["bg-texture"]??!0),p=ae(null),v=ae(null);Wv(C=>{w(p,C,!0)}),Pt(()=>{var le;const C=(le=n(c))==null?void 0:le.filePath;C&&C!==n(v)&&(w(v,C,!0),Uv(C)),C||(w(p,null),w(v,null))});function b(C,le){Tl({type:"panel",prop:C},le)}const g=new Set(["bgColour","gridColour","name","scriptId","author","version","description","bgMode","bgImage","bgImageFit","bgImageAlign","bgImageBlend","bgImageTint","bgTexture","bgTextureFit","bgTextureAlign","bgTextureBlend","bgTextureTint","bgGradientName"]);function _(C,le){if(!n(c))return;let Q=le.target.value;if(!g.has(C)){const B=Number(Q);!isNaN(B)&&Q!==""&&(Q=B)}st(n(c).id,{[C]:Q})}Hv(C=>{n(c)&&(C.requestId==="bgImage"?st(n(c).id,{bgImage:C.filePath}):C.requestId==="bgTexture"&&st(n(c).id,{bgTexture:C.filePath}))});function y(){rs("bgImage")}function S(){rs("bgTexture")}const T={solid:"Solid",gradient:"Gradient",image:"Image",texture:"Texture"};function I(){var C;return((C=n(c))==null?void 0:C.bgLayerOrder)??["solid","gradient","image","texture"]}function $(C,le){if(!n(c))return;const Q=[...I()],B=Q.indexOf(C),E=B+le;E<0||E>=Q.length||([Q[B],Q[E]]=[Q[E],Q[B]],st(n(c).id,{bgLayerOrder:Q}))}function x(C){return n(c)?C==="solid"?n(c).bgSolid!==!1:C==="gradient"?n(c).bgGradientEnabled===!0:C==="image"?n(c).bgImageEnabled===!0:C==="texture"?n(c).bgTextureEnabled===!0:!1:!1}function D(C){if(!n(c))return;const le={[C]:!n(c)[C]};C==="resizable"&&!n(c).resizable&&(n(c).minWidth===0&&(le.minWidth=n(c).width),n(c).minHeight===0&&(le.minHeight=n(c).height),n(c).maxWidth===0&&(le.maxWidth=n(c).width),n(c).maxHeight===0&&(le.maxHeight=n(c).height)),st(n(c).id,le)}let j=ae(!1),R=ae(""),k=ae("green"),M=ae("");function L(C){const le=Gb(C,r(),n(c).id);w(k,le.level,!0),w(M,le.msg,!0)}function F(C){w(j,!0),w(R,n(c).scriptId??"",!0),L(n(R)),C.target.select()}function Y(C){w(R,C.target.value,!0),L(n(R))}function q(C){C.key==="Enter"?C.target.blur():C.key==="Escape"&&(w(R,n(c).scriptId??"",!0),w(j,!1),C.target.blur())}function oe(){n(k)!=="red"&&n(R)&&n(R)!==n(c).scriptId&&st(n(c).id,{scriptId:n(R)}),w(j,!1),w(M,"")}var ee=ue(),Z=W(ee);{var N=C=>{var le=ue(),Q=W(le);{var B=me=>{var ne=Jb(),ke=W(ne);Vt(ke,{title:"Identity",children:(pe,A)=>{var U=Ub(),re=W(U);ct(re,{label:"Name",span:2,hint:"Display name of the panel",children:(Ce,be)=>{var $e=Ob();te(()=>Ct($e,n(c).name)),z("change",$e,Le=>_("name",Le)),m(Ce,$e)},$$slots:{default:!0}});var ve=f(re,2);ct(ve,{label:"Id",span:2,hint:"Unique script identifier. Use camelCase or snake_case.",children:(Ce,be)=>{var $e=Bb();let Le;te(()=>{Le=Te($e,1,"val svelte-3rgj88",null,Le,{"val-error":n(j)&&n(k)==="red","val-warn":n(j)&&n(k)==="yellow","val-ok":n(j)&&n(k)==="green"}),Ct($e,n(j)?n(R):n(c).scriptId??"")}),Qe("focus",$e,F),z("input",$e,Y),z("keydown",$e,q),Qe("blur",$e,oe),m(Ce,$e)},$$slots:{default:!0}});var ye=f(ve,2);{var O=Ce=>{var be=qb(),$e=h(be);let Le;var Ie=h($e);te(()=>{Le=Te($e,1,"validation-msg svelte-3rgj88",null,Le,{"msg-red":n(k)==="red","msg-yellow":n(k)==="yellow","msg-green":n(k)==="green"}),Re(Ie,n(M))}),m(Ce,be)};xe(ye,Ce=>{n(j)&&n(M)&&Ce(O)})}var X=f(ye,2);ct(X,{label:"Author",span:2,hint:"Author of this panel",children:(Ce,be)=>{var $e=Yb();te(()=>Ct($e,n(c).author??"")),z("change",$e,Le=>_("author",Le)),m(Ce,$e)},$$slots:{default:!0}});var ge=f(X,2);ct(ge,{label:"Version",span:2,hint:"Version string, e.g. 1.0.0",children:(Ce,be)=>{var $e=Xb();te(()=>Ct($e,n(c).version??"1.0.0")),z("change",$e,Le=>_("version",Le)),m(Ce,$e)},$$slots:{default:!0}});var he=f(ge,2);ct(he,{label:"Description",span:4,hint:"Optional description or notes about this panel",children:(Ce,be)=>{var $e=Hb();te(()=>Ct($e,n(c).description??"")),z("change",$e,Le=>_("description",Le)),m(Ce,$e)},$$slots:{default:!0}}),m(pe,U)},$$slots:{default:!0}});var _e=f(ke,2);Vt(_e,{title:"State",children:(pe,A)=>{var U=Wb(),re=W(U);ct(re,{label:"Enabled",span:2,hint:"Enable or disable all interaction on this panel at runtime",children:(ye,O)=>{Bn(ye,{get value(){return n(c).enabled},onchange:()=>D("enabled")})},$$slots:{default:!0}});var ve=f(re,2);ct(ve,{label:"Locked",span:2,hint:"Lock panel to prevent editing in the designer",children:(ye,O)=>{Bn(ye,{get value(){return n(c).locked},onchange:()=>D("locked")})},$$slots:{default:!0}}),m(pe,U)},$$slots:{default:!0}});var ie=f(_e,2);Vt(ie,{title:"Size",children:(pe,A)=>{var U=Vb(),re=W(U);ct(re,{label:"Width",span:2,hint:"Panel width in pixels",children:(ye,O)=>{_t(ye,{get value(){return n(c).width},step:1,min:1,onchange:X=>st(n(c).id,{width:X})})},$$slots:{default:!0}});var ve=f(re,2);ct(ve,{label:"Height",span:2,hint:"Panel height in pixels",children:(ye,O)=>{_t(ye,{get value(){return n(c).height},step:1,min:1,onchange:X=>st(n(c).id,{height:X})})},$$slots:{default:!0}}),m(pe,U)},$$slots:{default:!0}});var ce=f(ie,2);{let pe=P(()=>i()["core-constraints"]??!0);Vt(ce,{title:"Constraints",get collapsed(){return n(pe)},ontoggle:A=>br("core-constraints",A),children:(A,U)=>{var re=Kb(),ve=W(re);ct(ve,{label:"Lock Ratio",span:2,hint:"Keep width/height ratio when resizing",children:(Ce,be)=>{Bn(Ce,{get value(){return n(c).lockAspectRatio},onchange:()=>D("lockAspectRatio")})},$$slots:{default:!0}});var ye=f(ve,2);ct(ye,{label:"Resizable",span:2,hint:"Allow end-user to resize at runtime. When Off, min/max are set to current size.",children:(Ce,be)=>{Bn(Ce,{get value(){return n(c).resizable},onchange:()=>D("resizable")})},$$slots:{default:!0}});var O=f(ye,2);{let Ce=P(()=>!n(c).resizable);ct(O,{label:"Min W",span:2,hint:"Minimum width when resizable",get disabled(){return n(Ce)},children:(be,$e)=>{{let Le=P(()=>n(c).resizable?n(c).minWidth:n(c).width);_t(be,{get value(){return n(Le)},step:1,min:0,onchange:Ie=>st(n(c).id,{minWidth:Ie})})}},$$slots:{default:!0}})}var X=f(O,2);{let Ce=P(()=>!n(c).resizable);ct(X,{label:"Min H",span:2,hint:"Minimum height when resizable",get disabled(){return n(Ce)},children:(be,$e)=>{{let Le=P(()=>n(c).resizable?n(c).minHeight:n(c).height);_t(be,{get value(){return n(Le)},step:1,min:0,onchange:Ie=>st(n(c).id,{minHeight:Ie})})}},$$slots:{default:!0}})}var ge=f(X,2);{let Ce=P(()=>!n(c).resizable);ct(ge,{label:"Max W",span:2,hint:"Maximum width when resizable. 0 = no limit.",get disabled(){return n(Ce)},children:(be,$e)=>{{let Le=P(()=>n(c).resizable?n(c).maxWidth:n(c).width);_t(be,{get value(){return n(Le)},step:1,min:0,onchange:Ie=>st(n(c).id,{maxWidth:Ie})})}},$$slots:{default:!0}})}var he=f(ge,2);{let Ce=P(()=>!n(c).resizable);ct(he,{label:"Max H",span:2,hint:"Maximum height when resizable. 0 = no limit.",get disabled(){return n(Ce)},children:(be,$e)=>{{let Le=P(()=>n(c).resizable?n(c).maxHeight:n(c).height);_t(be,{get value(){return n(Le)},step:1,min:0,onchange:Ie=>st(n(c).id,{maxHeight:Ie})})}},$$slots:{default:!0}})}m(A,re)},$$slots:{default:!0}})}var se=f(ce,2);{let pe=P(()=>i()["core-info"]??!0);Vt(se,{title:"Info",get collapsed(){return n(pe)},ontoggle:A=>br("core-info",A),children:(A,U)=>{var re=Zb(),ve=W(re),ye=f(h(ve),2),O=h(ye),X=f(ve,2),ge=f(h(X),2),he=h(ge),Ce=f(X,2),be=f(h(Ce),2),$e=h(be),Le=f(Ce,2),Ie=f(h(Le),2),De=h(Ie),Ue=f(Le,2),qe=f(h(Ue),2),Ze=h(qe);te((ot,Dt,Yt)=>{Re(O,n(c).id),fe(ge,"title",n(c).filePath??""),Re(he,n(c).filePath??"Not saved"),Re($e,ot),Re(De,Dt),Re(Ze,Yt)},[()=>n(p)?Db(n(p).size):"—",()=>n(p)?Ss(n(p).created):"—",()=>n(p)?Ss(n(p).modified):"—"]),m(A,re)},$$slots:{default:!0}})}m(me,ne)},E=me=>{var ne=cm(),ke=W(ne);Vt(ke,{title:"Background",children:(ce,se)=>{var pe=Qb(),A=h(pe);let U;var re=h(A);ph(re,{size:14,strokeWidth:1.5});var ve=f(A,2);let ye;var O=h(ve);Of(O,{size:14,strokeWidth:1.5});var X=f(ve,2);let ge;var he=h(X);xl(he,{size:14,strokeWidth:1.5});var Ce=f(X,2);let be;var $e=h(Ce);Yf($e,{size:14,strokeWidth:1.5}),te(()=>{U=Te(A,1,"bg-layer-btn svelte-3rgj88",null,U,{active:n(c).bgSolid!==!1}),ye=Te(ve,1,"bg-layer-btn svelte-3rgj88",null,ye,{active:n(c).bgGradientEnabled===!0}),ge=Te(X,1,"bg-layer-btn svelte-3rgj88",null,ge,{active:n(c).bgImageEnabled===!0}),be=Te(Ce,1,"bg-layer-btn svelte-3rgj88",null,be,{active:n(c).bgTextureEnabled===!0})}),z("click",A,()=>st(n(c).id,{bgSolid:n(c).bgSolid===!1})),z("click",ve,()=>st(n(c).id,{bgGradientEnabled:!n(c).bgGradientEnabled})),z("click",X,()=>st(n(c).id,{bgImageEnabled:!n(c).bgImageEnabled})),z("click",Ce,()=>st(n(c).id,{bgTextureEnabled:!n(c).bgTextureEnabled})),m(ce,pe)},$$slots:{default:!0}});var _e=f(ke,2);{let ce=P(()=>i()["bg-zorder"]??!0);Vt(_e,{title:"Z-Order",get collapsed(){return n(ce)},ontoggle:se=>br("bg-zorder",se),children:(se,pe)=>{var A=tm(),U=f(W(A),2);Xe(U,17,()=>[...I()].reverse(),at,(re,ve,ye)=>{const O=P(()=>I().length-1-ye);var X=em();let ge;var he=h(X),Ce=h(he),be=f(he,2),$e=h(be),Le=f(be,2),Ie=h(Le);Hf(Ie,{size:12,strokeWidth:1.5});var De=f(Le,2),Ue=h(De);$l(Ue,{size:12,strokeWidth:1.5}),te((qe,Ze,ot)=>{ge=Te(X,1,"zorder-row svelte-3rgj88",null,ge,qe),Re(Ce,T[n(ve)]),Re($e,Ze),Le.disabled=ot,De.disabled=n(O)===0},[()=>({enabled:x(n(ve))}),()=>x(n(ve))?"on":"off",()=>n(O)===I().length-1]),z("click",Le,()=>$(n(ve),1)),z("click",De,()=>$(n(ve),-1)),m(re,X)}),m(se,A)},$$slots:{default:!0}})}var ie=f(_e,2);Xe(ie,16,()=>[...I()].reverse(),ce=>ce,(ce,se)=>{var pe=sm(),A=W(pe);{var U=he=>{Vt(he,{title:"Solid",children:(Ce,be)=>{var $e=om(),Le=W($e);ct(Le,{label:"",span:2,hint:"Background fill colour — click swatch to open colour picker",children:(De,Ue)=>{var qe=nm();te(Ze=>Ge(qe,`background:#${Ze??""}`),[()=>String(n(c).bgColour??"333333").slice(-6)]),z("click",qe,()=>b("bgColour",n(c).bgColour)),z("contextmenu",qe,Ze=>{Ze.preventDefault()}),m(De,qe)},$$slots:{default:!0}});var Ie=f(Le,2);ct(Ie,{label:"",span:2,hint:"Hex colour value — type to change",children:(De,Ue)=>{var qe=rm();te(Ze=>Ct(qe,Ze),[()=>String(n(c).bgColour??"333333")]),Qe("focus",qe,Ze=>Ze.target.select()),z("change",qe,Ze=>st(n(c).id,{bgColour:Ze.target.value})),m(De,qe)},$$slots:{default:!0}}),m(Ce,$e)},$$slots:{default:!0}})};xe(A,he=>{se==="solid"&&n(c).bgSolid!==!1&&he(U)})}var re=f(A,2);{var ve=he=>{Vt(he,{title:"Gradient",children:(Ce,be)=>{var $e=lm(),Le=W($e);ct(Le,{label:"",span:2,hint:"Gradient preview — click to edit",children:(Ue,qe)=>{var Ze=im();te(ot=>Ge(Ze,`background:${ot??""}`),[()=>oo(n(c).bgGradient)]),z("click",Ze,()=>Co.set({tab:"gradient"})),m(Ue,Ze)},$$slots:{default:!0}});var Ie=f(Le,2);ct(Ie,{label:"",span:2,hint:"Gradient name",children:(Ue,qe)=>{var Ze=am();te(()=>Ct(Ze,n(c).bgGradientName??"")),Qe("focus",Ze,ot=>ot.target.select()),z("change",Ze,ot=>st(n(c).id,{bgGradientName:ot.target.value})),m(Ue,Ze)},$$slots:{default:!0}});var De=f(Ie,2);ct(De,{label:"Opacity",span:4,hint:"Gradient layer opacity (0–100%)",children:(Ue,qe)=>{{let Ze=P(()=>n(c).bgGradientOpacity??100);_t(Ue,{get value(){return n(Ze)},step:1,min:0,max:100,onchange:ot=>st(n(c).id,{bgGradientOpacity:ot})})}},$$slots:{default:!0}}),m(Ce,$e)},$$slots:{default:!0}})};xe(re,he=>{se==="gradient"&&n(c).bgGradientEnabled===!0&&he(ve)})}var ye=f(re,2);{var O=he=>{Ms(he,{get panel(){return n(c)},prefix:"Image",label:"Image",defaultFit:"fill",placeholder:"No image selected",get collapsed(){return n(d)},onupdate:Ce=>st(n(c).id,Ce),onbrowse:y,oncollapsetoggle:Ce=>br("bg-image",Ce),onswatchclick:b})};xe(ye,he=>{se==="image"&&n(c).bgImageEnabled===!0&&he(O)})}var X=f(ye,2);{var ge=he=>{Ms(he,{get panel(){return n(c)},prefix:"Texture",label:"Texture",defaultFit:"tile",placeholder:"No texture selected",get collapsed(){return n(u)},onupdate:Ce=>st(n(c).id,Ce),onbrowse:S,oncollapsetoggle:Ce=>br("bg-texture",Ce),onswatchclick:b})};xe(X,he=>{se==="texture"&&n(c).bgTextureEnabled===!0&&he(ge)})}m(ce,pe)}),m(me,ne)},H=me=>{var ne=hm(),ke=W(ne);Vt(ke,{title:"Grid",children:(ce,se)=>{var pe=um(),A=W(pe);ct(A,{label:"Show",span:2,hint:"Show or hide the grid overlay",children:(X,ge)=>{Bn(X,{get value(){return n(c).gridEnabled},onchange:()=>D("gridEnabled")})},$$slots:{default:!0}});var U=f(A,2);ct(U,{label:"Snap",span:2,hint:"Snap components to grid when moving or resizing",children:(X,ge)=>{Bn(X,{get value(){return n(c).snapToGrid},onchange:()=>D("snapToGrid")})},$$slots:{default:!0}});var re=f(U,2);ct(re,{label:"Size",span:2,hint:"Grid cell size in pixels",children:(X,ge)=>{_t(X,{get value(){return n(c).gridSize},step:1,min:1,onchange:he=>st(n(c).id,{gridSize:he})})},$$slots:{default:!0}});var ve=f(re,2);ct(ve,{label:"Thickness",span:2,hint:"Grid line thickness in pixels",children:(X,ge)=>{{let he=P(()=>n(c).gridLineWidth??1);_t(X,{get value(){return n(he)},step:1,min:1,max:10,onchange:Ce=>st(n(c).id,{gridLineWidth:Ce})})}},$$slots:{default:!0}});var ye=f(ve,2);ct(ye,{label:"Type",span:2,hint:"Grid line style",children:(X,ge)=>{var he=dm(),Ce=h(he);Ce.value=Ce.__value="lines";var be=f(Ce);be.value=be.__value="dots";var $e=f(be);$e.value=$e.__value="crosses";var Le;jr(he),te(()=>{Le!==(Le=n(c).gridType??"lines")&&(he.value=(he.__value=n(c).gridType??"lines")??"",Qn(he,n(c).gridType??"lines"))}),z("change",he,Ie=>st(n(c).id,{gridType:Ie.target.value})),m(X,he)},$$slots:{default:!0}});var O=f(ye,2);ct(O,{label:"Colour",span:2,hint:"Grid line colour (AARRGGBB hex)",children:(X,ge)=>{{let he=P(()=>n(c).gridColour??"33FFFFFF");Va(X,{get value(){return n(he)},onchange:Ce=>st(n(c).id,{gridColour:Ce}),onswatchclick:()=>b("gridColour",n(c).gridColour??"33FFFFFF")})}},$$slots:{default:!0}}),m(ce,pe)},$$slots:{default:!0}});var _e=f(ke,2);{let ce=P(()=>i()["grid-subdivision"]??!0);Vt(_e,{title:"Subdivision",get collapsed(){return n(ce)},ontoggle:se=>br("grid-subdivision",se),children:(se,pe)=>{var A=vm(),U=W(A);ct(U,{label:"Divisions",span:2,hint:"Group every Nth cell with a thicker border (1 = none)",children:(ve,ye)=>{{let O=P(()=>n(c).gridSubdivision??1);_t(ve,{get value(){return n(O)},step:1,min:1,max:10,onchange:X=>st(n(c).id,{gridSubdivision:X})})}},$$slots:{default:!0}});var re=f(U,2);ct(re,{label:"Colour",span:2,hint:"Subdivision border colour (AARRGGBB hex)",children:(ve,ye)=>{{let O=P(()=>n(c).gridSubColour??"55FFFFFF");Va(ve,{get value(){return n(O)},onchange:X=>st(n(c).id,{gridSubColour:X}),onswatchclick:()=>b("gridSubColour",n(c).gridSubColour??"55FFFFFF")})}},$$slots:{default:!0}}),m(se,A)},$$slots:{default:!0}})}var ie=f(_e,2);{let ce=P(()=>i()["grid-origin"]??!0);Vt(ie,{title:"Origin",get collapsed(){return n(ce)},ontoggle:se=>br("grid-origin",se),children:(se,pe)=>{var A=fm(),U=W(A);ct(U,{label:"Center",span:4,hint:"Center the grid on the panel — lines radiate from the middle",children:(ye,O)=>{{let X=P(()=>n(c).gridCentered??!1);Bn(ye,{get value(){return n(X)},onchange:()=>st(n(c).id,{gridCentered:!n(c).gridCentered})})}},$$slots:{default:!0}});var re=f(U,2);ct(re,{label:"Offset X",span:2,hint:"Shift grid origin horizontally in pixels",get disabled(){return n(c).gridCentered},children:(ye,O)=>{{let X=P(()=>n(c).gridOriginX??0);_t(ye,{get value(){return n(X)},step:1,onchange:ge=>st(n(c).id,{gridOriginX:ge})})}},$$slots:{default:!0}});var ve=f(re,2);ct(ve,{label:"Offset Y",span:2,hint:"Shift grid origin vertically in pixels",get disabled(){return n(c).gridCentered},children:(ye,O)=>{{let X=P(()=>n(c).gridOriginY??0);_t(ye,{get value(){return n(X)},step:1,onchange:ge=>st(n(c).id,{gridOriginY:ge})})}},$$slots:{default:!0}}),m(se,A)},$$slots:{default:!0}})}m(me,ne)},J=me=>{Vt(me,{title:"Export",children:(ne,ke)=>{var _e=pm();m(ne,_e)},$$slots:{default:!0}})},Ae=me=>{var ne=gm(),ke=h(ne);te(()=>Re(ke,`Panel: ${s()??""}`)),m(me,ne)};xe(Q,me=>{s()==="core"?me(B):s()==="background"?me(E,1):s()==="grid"?me(H,2):s()==="export"?me(J,3):me(Ae,-1)})}m(C,le)};xe(Z,C=>{n(c)&&C(N)})}m(e,ee),Ke(),l()}tt(["change","input","keydown","click","contextmenu"]);var mm=G('<div class="prop-card svelte-x4mvaq"><div class="prop-row svelte-x4mvaq"><span class="lbl svelte-x4mvaq">Name</span> <input class="val svelte-x4mvaq" type="text"/></div> <div class="prop-row svelte-x4mvaq"><span class="lbl svelte-x4mvaq">Type</span> <span class="val readonly svelte-x4mvaq"> </span></div> <div class="prop-row svelte-x4mvaq"><span class="lbl svelte-x4mvaq">Visible</span> <button> </button></div> <div class="prop-row svelte-x4mvaq"><span class="lbl svelte-x4mvaq">Enabled</span> <button> </button></div> <div class="prop-row svelte-x4mvaq"><span class="lbl svelte-x4mvaq">Locked</span> <button> </button></div> <div class="prop-row svelte-x4mvaq"><span class="lbl svelte-x4mvaq">Z-Index</span> <!></div> <div class="prop-row svelte-x4mvaq"><span class="lbl svelte-x4mvaq">Layer</span> <input class="val svelte-x4mvaq" type="text"/></div></div>');function _m(e,t){Ve(t,!0);const r=()=>Ye(wt,"$selectedComponentIds",o),[o,i]=It();let a=K(t,"control",3,null),l=P(()=>jt(a(),"Core"));function s(g,_){var y;(y=n(l))!=null&&y.id&&(r().size>1?Do(`Core.${g}`,_):et(n(l).id,`Core.${g}`,_))}function c(g,_){const y=_.target;let S=y.type==="number"?Number(y.value):y.value;s(g,S)}function d(g){var _;s(g,!((_=n(l))!=null&&_[g]))}function u(g){g.target.select()}var p=ue(),v=W(p);{var b=g=>{var _=mm(),y=h(_),S=f(h(y),2),T=f(y,2),I=f(h(T),2),$=h(I),x=f(T,2),D=f(h(x),2);let j;var R=h(D),k=f(x,2),M=f(h(k),2);let L;var F=h(M),Y=f(k,2),q=f(h(Y),2);let oe;var ee=h(q),Z=f(Y,2),N=f(h(Z),2);_t(N,{get value(){return n(l).zIndex},step:1,min:0,onchange:Q=>s("zIndex",Q)});var C=f(Z,2),le=f(h(C),2);te(()=>{Ct(S,n(l).name),Re($,n(l).controlType),j=Te(D,1,"toggle-val svelte-x4mvaq",null,j,{on:n(l).visible}),Re(R,n(l).visible?"On":"Off"),L=Te(M,1,"toggle-val svelte-x4mvaq",null,L,{on:n(l).enabled}),Re(F,n(l).enabled?"On":"Off"),oe=Te(q,1,"toggle-val svelte-x4mvaq",null,oe,{on:n(l).locked}),Re(ee,n(l).locked?"On":"Off"),Ct(le,n(l).layer)}),Qe("focus",S,u),z("change",S,Q=>c("name",Q)),z("click",D,()=>d("visible")),z("click",M,()=>d("enabled")),z("click",q,()=>d("locked")),Qe("focus",le,u),z("change",le,Q=>c("layer",Q)),m(g,_)};xe(v,g=>{n(l)&&g(b)})}m(e,p),Ke(),i()}tt(["change","click"]);var ym=G('<div class="prop-card svelte-117e023"><div class="prop-row-pair svelte-117e023"><div class="prop-row half svelte-117e023"><span class="lbl svelte-117e023">X</span> <!></div> <div class="prop-row half svelte-117e023"><span class="lbl svelte-117e023">Y</span> <!></div></div> <div class="prop-row-pair svelte-117e023"><div class="prop-row half svelte-117e023"><span class="lbl svelte-117e023">W</span> <!></div> <div class="prop-row half svelte-117e023"><span class="lbl svelte-117e023">H</span> <!></div></div> <div class="prop-row-pair svelte-117e023"><div class="prop-row half svelte-117e023"><span class="lbl svelte-117e023">Opacity</span> <!></div> <div class="prop-row half svelte-117e023"><span class="lbl svelte-117e023">Rot</span> <!></div></div> <div class="prop-row-pair svelte-117e023"><div class="prop-row half svelte-117e023"><span class="lbl svelte-117e023">MinW</span> <!></div> <div class="prop-row half svelte-117e023"><span class="lbl svelte-117e023">MinH</span> <!></div></div> <div class="prop-row-pair svelte-117e023"><div class="prop-row half svelte-117e023"><span class="lbl svelte-117e023">MaxW</span> <!></div> <div class="prop-row half svelte-117e023"><span class="lbl svelte-117e023">MaxH</span> <!></div></div> <div class="prop-row svelte-117e023"><span class="lbl svelte-117e023">Aspect Lock</span> <button> </button></div></div>');function $m(e,t){Ve(t,!0);const r=()=>Ye(wt,"$selectedComponentIds",o),[o,i]=It();let a=K(t,"control",3,null),l=P(()=>jt(a(),"Core")),s=P(()=>jt(a(),"Transform"));function c(v,b){var g;(g=n(l))!=null&&g.id&&(r().size>1?Do(`Transform.${v}`,b):et(n(l).id,`Transform.${v}`,b))}var d=ue(),u=W(d);{var p=v=>{var b=ym(),g=h(b),_=h(g),y=f(h(_),2);_t(y,{get value(){return n(s).x},step:1,onchange:me=>c("x",me)});var S=f(_,2),T=f(h(S),2);_t(T,{get value(){return n(s).y},step:1,onchange:me=>c("y",me)});var I=f(g,2),$=h(I),x=f(h($),2);_t(x,{get value(){return n(s).width},step:1,min:10,onchange:me=>c("width",me)});var D=f($,2),j=f(h(D),2);_t(j,{get value(){return n(s).height},step:1,min:10,onchange:me=>c("height",me)});var R=f(I,2),k=h(R),M=f(h(k),2);_t(M,{get value(){return n(s).opacity},step:.05,min:0,max:1,onchange:me=>c("opacity",me)});var L=f(k,2),F=f(h(L),2);_t(F,{get value(){return n(s).rotation},step:1,onchange:me=>c("rotation",me)});var Y=f(R,2),q=h(Y),oe=f(h(q),2);{let me=P(()=>n(s).minWidth??0);_t(oe,{get value(){return n(me)},step:1,min:0,onchange:ne=>c("minWidth",ne)})}var ee=f(q,2),Z=f(h(ee),2);{let me=P(()=>n(s).minHeight??0);_t(Z,{get value(){return n(me)},step:1,min:0,onchange:ne=>c("minHeight",ne)})}var N=f(Y,2),C=h(N),le=f(h(C),2);{let me=P(()=>n(s).maxWidth??0);_t(le,{get value(){return n(me)},step:1,min:0,onchange:ne=>c("maxWidth",ne)})}var Q=f(C,2),B=f(h(Q),2);{let me=P(()=>n(s).maxHeight??0);_t(B,{get value(){return n(me)},step:1,min:0,onchange:ne=>c("maxHeight",ne)})}var E=f(N,2),H=f(h(E),2);let J;var Ae=h(H);te(()=>{J=Te(H,1,"toggle-val svelte-117e023",null,J,{on:n(s).aspectLock}),Re(Ae,n(s).aspectLock?"On":"Off")}),z("click",H,()=>c("aspectLock",!n(s).aspectLock)),m(v,b)};xe(u,v=>{n(s)&&v(p)})}m(e,d),Ke(),i()}tt(["click"]);var xm=G("<button><!></button>"),wm=G("<div></div>");function km(e,t){Ve(t,!0);let r=K(t,"options",19,()=>[]),o=K(t,"value",3,""),i=K(t,"onchange",3,null),a=K(t,"disabled",3,!1);function l(d){var u;!a()&&d!==o()&&((u=i())==null||u(d))}var s=wm();let c;Xe(s,21,r,d=>d.value,(d,u)=>{var p=xm();let v;var b=h(p);{var g=y=>{var S=ue(),T=W(S);$o(T,()=>n(u).icon,(I,$)=>{$(I,{size:14,strokeWidth:1.5})}),m(y,S)},_=y=>{var S=fv();te(()=>Re(S,n(u).label??n(u).value)),m(y,S)};xe(b,y=>{n(u).icon?y(g):y(_,-1)})}te(()=>{v=Te(p,1,"group-btn svelte-pdar9u",null,v,{active:o()===n(u).value}),p.disabled=a(),fe(p,"title",n(u).label??n(u).value)}),z("click",p,()=>l(n(u).value)),m(d,p)}),te(()=>c=Te(s,1,"button-group svelte-pdar9u",null,c,{disabled:a()})),m(e,s),Ke()}tt(["click"]);var Cm=G('<div class="prop-row full-span svelte-1wx6vjp"><span class="lbl svelte-1wx6vjp">Colour</span> <div class="color-input svelte-1wx6vjp"><button class="mini-swatch svelte-1wx6vjp" title="Pick colour"></button> <input class="val svelte-1wx6vjp" type="text"/></div></div>'),zm=G('<div class="prop-row full-span svelte-1wx6vjp"><span class="lbl svelte-1wx6vjp">Gradient</span> <span class="hint-text svelte-1wx6vjp">Edit in Display Panel → Gradient</span></div>'),Mm=G('<div class="prop-row full-span svelte-1wx6vjp"><span class="lbl svelte-1wx6vjp">Image</span> <span class="hint-text svelte-1wx6vjp">Image source — coming soon</span></div>'),Sm=G('<div class="bg-editor svelte-1wx6vjp"><div class="prop-row full-span svelte-1wx6vjp"><span class="lbl svelte-1wx6vjp">Mode</span> <!></div> <!></div>');function Pm(e,t){Ve(t,!0);const r=()=>Ye(wt,"$selectedComponentIds",o),[o,i]=It();let a=K(t,"control",3,null),l=P(()=>jt(a(),"Core")),s=P(()=>jt(a(),"Background")),c=P(()=>{var T,I;return(I=(T=n(s))==null?void 0:T._children)==null?void 0:I.Fill});function d(T,I){var $;($=n(l))!=null&&$.id&&(r().size>1?Do(T,I):et(n(l).id,T,I))}function u(){var T,I;!((T=n(l))!=null&&T.id)||!((I=n(c))!=null&&I.colour)||Tl({type:"control",controlId:n(l).id,path:"Background.Fill.colour"},n(c).colour)}function p(T){let I=T.target.value.replace(/^#/,"").toUpperCase();I.length===6&&(I="FF"+I),d("Background.Fill.colour",I)}function v(T){T.target.select()}let b=P(()=>{var T;return(T=n(c))!=null&&T.colour?n(c).colour.slice(-6):"3A3A3A"});const g=[{value:"solid",label:"Solid"},{value:"gradient",label:"Grad"},{value:"image",label:"Image"},{value:"none",label:"None"}];var _=ue(),y=W(_);{var S=T=>{var I=Sm(),$=h(I),x=f(h($),2);km(x,{get options(){return g},get value(){return n(s).mode},onchange:M=>d("Background.mode",M)});var D=f($,2);{var j=M=>{var L=Cm(),F=f(h(L),2),Y=h(F),q=f(Y,2);te(()=>{Ge(Y,`background:#${n(b)??""}`),Ct(q,n(b))}),z("click",Y,u),Qe("focus",q,v),z("change",q,p),m(M,L)},R=M=>{var L=zm();m(M,L)},k=M=>{var L=Mm();m(M,L)};xe(D,M=>{n(s).mode==="solid"?M(j):n(s).mode==="gradient"?M(R,1):n(s).mode==="image"&&M(k,2)})}m(T,I)};xe(y,T=>{n(s)&&T(S)})}m(e,_),Ke(),i()}tt(["click","change"]);var Tm=G("<button></button>"),Em=G('<div class="lt-grid svelte-38t1l"></div>');function Fm(e,t){Ve(t,!0);let r=K(t,"options",19,()=>[]),o=K(t,"value",3,null),i=K(t,"onchange",3,null),a=K(t,"columns",3,3),l=K(t,"disabled",3,!1);var s=Em();let c;Xe(s,21,r,d=>d.value,(d,u)=>{var p=Tm();let v;xv(p,()=>n(u).svg,!0),te(()=>{v=Te(p,1,"lt-btn svelte-38t1l",null,v,{active:o()===n(u).value}),fe(p,"title",n(u).label),p.disabled=l()}),z("click",p,()=>{var b;return(b=i())==null?void 0:b(n(u).value)}),m(d,p)}),te(()=>c=Ge(s,"",c,{"--cols":a()})),m(e,s),Ke()}tt(["click"]);var Im=G('<div class="edit-row svelte-12x4wzn"><span class="edit-label svelte-12x4wzn">Dir</span> <button title="Flip gradient direction along the arc"> </button></div>'),Am=G('<div class="edit-row svelte-12x4wzn"><span class="edit-label svelte-12x4wzn">From</span> <div class="cgm-picker svelte-12x4wzn"><button title="Inherit from horizontal side (top/bottom)"> </button> <button title="Inherit from vertical side (left/right)"> </button></div></div>'),jm=G('<div class="edit-row svelte-12x4wzn"><span class="edit-label svelte-12x4wzn">G.Mode</span> <div class="cgm-picker svelte-12x4wzn"><button title="Radial — gradient flows along the curve (sweeps the arc)"><svg viewBox="0 0 14 14" fill="none" class="svelte-12x4wzn"><path d="M11 2 Q11 11 2 11" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round"></path><circle cx="11" cy="2" r="0.9" fill="currentColor"></circle><circle cx="2" cy="11" r="0.9" fill="currentColor"></circle></svg></button> <button title="Tangential — straight linear gradient between arc endpoints"><svg viewBox="0 0 14 14" fill="none" class="svelte-12x4wzn"><path d="M11 3 Q3 3 3 11" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round"></path><path d="M3 11 L1 9 M3 11 L5 9" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round"></path></svg></button> <button title="Inherit — corner uses an adjacent side gradient"><!></button></div></div> <!> <!>',1);function Nm(e,t){Ve(t,!0);let r=K(t,"mode",3,"radial"),o=K(t,"flip",3,!1),i=K(t,"inheritSide",3,"A"),a=K(t,"inheritLabelA",3,"A"),l=K(t,"inheritLabelB",3,"B"),s=K(t,"onmodechange",3,null),c=K(t,"onflip",3,null),d=K(t,"oninheritchange",3,null),u=P(()=>r()==="tangential"||r()==="radial");var p=jm(),v=W(p),b=f(h(v),2),g=h(b);let _;var y=f(g,2);let S;var T=f(y,2);let I;var $=h(T);wl($,{size:11,strokeWidth:1.5});var x=f(v,2);{var D=k=>{var M=Im(),L=f(h(M),2);let F;var Y=h(L);te(()=>{F=Te(L,1,"cgm-btn flip-btn svelte-12x4wzn",null,F,{active:o()}),Re(Y,o()?"← Flipped":"Normal →")}),z("click",L,()=>{var q;return(q=c())==null?void 0:q()}),m(k,M)};xe(x,k=>{n(u)&&k(D)})}var j=f(x,2);{var R=k=>{var M=Am(),L=f(h(M),2),F=h(L);let Y;var q=h(F),oe=f(F,2);let ee;var Z=h(oe);te(()=>{Y=Te(F,1,"cgm-btn svelte-12x4wzn",null,Y,{active:i()==="A"}),Re(q,a()),ee=Te(oe,1,"cgm-btn svelte-12x4wzn",null,ee,{active:i()==="B"}),Re(Z,l())}),z("click",F,()=>{var N;return(N=d())==null?void 0:N("A")}),z("click",oe,()=>{var N;return(N=d())==null?void 0:N("B")}),m(k,M)};xe(j,k=>{r()==="inherit"&&k(R)})}te(()=>{_=Te(g,1,"cgm-btn svelte-12x4wzn",null,_,{active:r()==="radial"}),S=Te(y,1,"cgm-btn svelte-12x4wzn",null,S,{active:r()==="tangential"}),I=Te(T,1,"cgm-btn svelte-12x4wzn",null,I,{active:r()==="inherit"})}),z("click",g,()=>{var k;return(k=s())==null?void 0:k("radial")}),z("click",y,()=>{var k;return(k=s())==null?void 0:k("tangential")}),z("click",T,()=>{var k;return(k=s())==null?void 0:k("inherit")}),m(e,p),Ke()}tt(["click"]);var Lm=$t('<svg viewBox="0 0 14 14" fill="none" class="svelte-1fxjg0q"><path d="M11 3 L7 3 L7 7 L3 7 L3 11" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"></path></svg>'),Rm=$t('<svg viewBox="0 0 14 14" fill="none" class="svelte-1fxjg0q"><path d="M11 3 L3 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path></svg>'),Dm=$t('<svg viewBox="0 0 14 14" fill="none" class="svelte-1fxjg0q"><path d="M11 3 L3 3 L3 11" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"></path></svg>'),Gm=$t('<svg viewBox="0 0 14 14" fill="none" class="svelte-1fxjg0q"><path d="M11 3 Q11 11 3 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"></path></svg>'),Om=$t('<svg viewBox="0 0 14 14" fill="none" class="svelte-1fxjg0q"><path d="M11 3 Q3 3 3 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"></path></svg>'),Bm=G('<div class="center-group svelte-1fxjg0q"><button><!></button> <button><!></button> <button><!></button></div>');function qm(e,t){Ve(t,!0);let r=K(t,"linked",3,!0),o=K(t,"oncycle",3,null),i=K(t,"ontogglelink",3,null);const a={straight:"Straight (click: Notch)",notch:"Notch (click: Chamfer)",chamfer:"Chamfer (click: Straight)"};let l=P(()=>a[t.cornerCombo]??"Straight corners"),s=P(()=>t.cornerCombo==="round-out"?"Rounded Out (click: Rounded In)":"Rounded In (click: Rounded Out)");var c=Bm(),d=h(c);let u;var p=h(d);{var v=k=>{var M=Lm();m(k,M)},b=k=>{var M=Rm();m(k,M)},g=k=>{var M=Dm();m(k,M)};xe(p,k=>{t.cornerCombo==="notch"?k(v):t.cornerCombo==="chamfer"?k(b,1):k(g,-1)})}var _=f(d,2);let y;var S=h(_);{var T=k=>{wl(k,{size:12,strokeWidth:1.5})},I=k=>{Bh(k,{size:12,strokeWidth:1.5})};xe(S,k=>{r()?k(T):k(I,-1)})}var $=f(_,2);let x;var D=h($);{var j=k=>{var M=Gm();m(k,M)},R=k=>{var M=Om();m(k,M)};xe(D,k=>{t.cornerCombo==="round-in"?k(j):k(R,-1)})}te(()=>{u=Te(d,1,"center-btn svelte-1fxjg0q",null,u,{active:t.cornerSide==="straight"}),fe(d,"title",n(l)),y=Te(_,1,"center-btn link-btn svelte-1fxjg0q",null,y,{linked:r()}),fe(_,"title",r()?"Unlink":"Link all"),x=Te($,1,"center-btn svelte-1fxjg0q",null,x,{active:t.cornerSide==="rounded"}),fe($,"title",n(s))}),z("click",d,()=>{var k;return(k=o())==null?void 0:k("straight")}),z("click",_,()=>{var k;return(k=i())==null?void 0:k()}),z("click",$,()=>{var k;return(k=o())==null?void 0:k("rounded")}),m(e,c),Ke()}tt(["click"]);const Ym=`<svg viewBox="0 0 40 18" fill="none" xmlns="http://www.w3.org/2000/svg">
  <line x1="12" y1="3" x2="28" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.5"/>
  <line x1="28" y1="3" x2="12" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.5"/>
</svg>`,Xm=`<svg viewBox="0 0 40 18" fill="none" xmlns="http://www.w3.org/2000/svg">
  <line x1="4" y1="9" x2="36" y2="9" stroke="currentColor" stroke-width="2"/>
</svg>`,Hm=`<svg viewBox="0 0 40 18" fill="none" xmlns="http://www.w3.org/2000/svg">
  <line x1="4" y1="9" x2="36" y2="9" stroke="currentColor" stroke-width="2" stroke-dasharray="6 3"/>
</svg>`,Um=`<svg viewBox="0 0 40 18" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="7"  cy="9" r="1.5" fill="currentColor"/>
  <circle cx="14" cy="9" r="1.5" fill="currentColor"/>
  <circle cx="21" cy="9" r="1.5" fill="currentColor"/>
  <circle cx="28" cy="9" r="1.5" fill="currentColor"/>
  <circle cx="35" cy="9" r="1.5" fill="currentColor"/>
</svg>`,Wm=`<svg viewBox="0 0 40 18" fill="none" xmlns="http://www.w3.org/2000/svg">
  <line x1="4" y1="6" x2="36" y2="6" stroke="currentColor" stroke-width="1.5"/>
  <line x1="4" y1="12" x2="36" y2="12" stroke="currentColor" stroke-width="1.5"/>
</svg>`,Vm=`<svg viewBox="0 0 40 18" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M4 6 L13 6 L17 12 L23 12 L27 6 L36 6" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" fill="none"/>
</svg>`,Km=`<svg viewBox="0 0 40 18" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M4 12 L13 12 L17 6 L23 6 L27 12 L36 12" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" fill="none"/>
</svg>`,Zm=`<svg viewBox="0 0 40 18" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M4 7 L18 7 L18 11 L36 11" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" fill="none"/>
</svg>`,Jm=`<svg viewBox="0 0 40 18" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M4 11 L18 11 L18 7 L36 7" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" fill="none"/>
</svg>`,Qm=[{value:"solid",label:"Solid",svg:Xm},{value:"dashed",label:"Dashed",svg:Hm},{value:"dotted",label:"Dotted",svg:Um},{value:"double",label:"Double",svg:Wm},{value:"groove",label:"Groove",svg:Vm},{value:"ridge",label:"Ridge",svg:Km},{value:"inset",label:"Inset",svg:Zm},{value:"outset",label:"Outset",svg:Jm},{value:"none",label:"None",svg:Ym}],_a=["top","right","bottom","left"],ai=["topLeft","topRight","bottomLeft","bottomRight"],e2=[["style",e=>e.style||"solid"],["thickness",e=>e.thickness||1],["dotRadius",e=>e.dotRadius||2],["doubleGap",e=>e.doubleGap||2],["doubleAnchor",e=>e.doubleAnchor||"center"],["doubleDirection",e=>e.doubleDirection||"outward"],["colour",e=>e.colour||"FF888888"]],t2=[["radius",e=>e.radius||0],["style",e=>e.style||"rounded"],["direction",e=>e.direction||"outward"],["borderStyle",e=>e.borderStyle||"solid"],["thickness",e=>e.thickness||2],["dotRadius",e=>e.dotRadius||2],["doubleGap",e=>e.doubleGap??2],["doubleAnchor",e=>e.doubleAnchor||"center"],["doubleDirection",e=>e.doubleDirection||"outward"],["colour",e=>e.colour||"FFFFFFFF"],["borderEnabled",e=>e.borderEnabled!==!1]];function Ps(e,t,r,o,i){for(const a of r)for(const[l,s]of o)i(`${e}.${a}.${l}`,s(t))}const xd={straight:["straight","notch","chamfer"],rounded:["round-out","round-in"]};function n2(e){switch(e){case"straight":return{style:"straight",direction:"outward"};case"round-out":return{style:"rounded",direction:"outward"};case"round-in":return{style:"rounded",direction:"inward"};case"chamfer":return{style:"chamfer",direction:"outward"};case"notch":return{style:"notch",direction:"outward"};default:return{style:"straight",direction:"outward"}}}function r2(e){var o,i;if(!e)return"round-out";const t=e.linked?e.style||"rounded":((o=e.topLeft)==null?void 0:o.style)||e.style||"rounded",r=e.linked?e.direction||"outward":((i=e.topLeft)==null?void 0:i.direction)||e.direction||"outward";return t==="rounded"?r==="inward"?"round-in":"round-out":t==="chamfer"?"chamfer":t==="notch"?"notch":"straight"}function wd(e){return xd.rounded.includes(e)?"rounded":"straight"}function o2(e,t){const r=xd[t];if(wd(e)!==t)return r[0];const o=r.indexOf(e);return r[(o+1)%r.length]}var i2=G('<div><input class="corner-input svelte-rb1szk" type="number"/></div>'),a2=G("<button></button>"),l2=G("<button><!></button>"),s2=G('<div class="edit-row svelte-rb1szk"><span class="edit-label svelte-rb1szk">Img</span> <input class="file-path svelte-rb1szk" type="text" readonly=""/></div>'),c2=G('<div class="edit-row svelte-rb1szk"><span class="edit-label svelte-rb1szk">Ovr</span> <input class="file-path svelte-rb1szk" type="text" readonly=""/></div>'),d2=G('<div class="edit-row svelte-rb1szk"><span class="edit-label svelte-rb1szk">Gap</span> <!></div>'),u2=G('<div class="edit-row svelte-rb1szk"><span class="edit-label svelte-rb1szk">Dot R</span> <!></div>'),v2=G('<div class="line-types-section svelte-rb1szk"><span class="section-label svelte-rb1szk">Line Types</span> <!></div> <div class="edit-row svelte-rb1szk"><span class="edit-label svelte-rb1szk">Thick</span> <!> <button> </button></div> <div class="edit-row svelte-rb1szk"><span class="edit-label svelte-rb1szk">Fill</span> <div class="fill-swatches svelte-rb1szk"></div></div> <!> <!> <!> <!> <!>',1),f2=G('<div class="bcw svelte-rb1szk"><div class="grid-3x3 svelte-rb1szk"></div> <!> <input type="file" accept="image/*" class="hidden-file svelte-rb1szk"/></div>');function h2(e,t){Ve(t,!0);let r=K(t,"border",3,null),o=K(t,"corners",3,null),i=K(t,"linked",3,!0),a=K(t,"controlId",3,null),l=K(t,"onupdate",3,null),s=ae(null),c=ae(!0);const d={style:"solid",thickness:1,dotRadius:2,doubleGap:2,colour:"FF888888"},u={radius:0,borderEnabled:!0,style:"rounded",direction:"outward",borderStyle:"solid",thickness:2,dotRadius:2,doubleGap:2,doubleAnchor:"center",doubleDirection:"outward",colour:"FFFFFFFF"},p={type:"linear",angle:90,stops:[{color:"FFFFFF",position:0},{color:"000000",position:100}],edge:0,centerX:50,centerY:50,radiusX:50,radiusY:50};function v(O,X){var ge;(ge=l())==null||ge(O,X)}function b(O){O.target.select()}function g(O,X){var ge,he;if((ge=r())!=null&&ge.linked)v(`Background.Border.${O}`,X);else for(const Ce of _a)v(`Background.Border.${Ce}.${O}`,X);if(v(`Background.Border.${O}`,X),(he=o())!=null&&he.linked)v(`Background.Corners.${O}`,X);else for(const Ce of ai)v(`Background.Corners.${Ce}.${O}`,X);v(`Background.Corners.${O}`,X)}function _(O){g("thickness",O)}function y(O){g("doubleGap",O)}function S(){const O=!i();O||(o()&&Ps("Background.Corners",o(),ai,t2,v),r()&&(Ps("Background.Border",r(),_a,e2,v),v("Background.Border.linked",!1))),v("Background.Corners.linked",O),r()&&v("Background.Border.linked",O)}function T(O){return r()?r().linked?r():r()[O]??{...d}:{...d}}function I(O){return o()?o().linked?o():o()[O]??{...u}:{...u}}function $(O){var ge;if(!((ge=r())!=null&&ge.enabled))return!1;if(r().linked)return!0;const X=r()[O];return X&&X.style!=="none"&&X.thickness>0}function x(O){return I(O).borderEnabled!==!1}function D(O){if(!r())return;if($(O))i()||r().linked?v("Background.Border.enabled",!1):v(`Background.Border.${O}.style`,"none");else if(r().enabled||v("Background.Border.enabled",!0),!(i()||r().linked)){const ge=r()[O];if(!ge||ge.style==="none"){const he=r().style||"solid";v(`Background.Border.${O}.style`,he),he==="double"&&(v(`Background.Border.${O}.doubleGap`,r().doubleGap??2),v(`Background.Border.${O}.doubleAnchor`,r().doubleAnchor??"center"),v(`Background.Border.${O}.doubleDirection`,r().doubleDirection??"outward"))}}}function j(O){var ge;const X=x(O);i()||(ge=o())!=null&&ge.linked?v("Background.Corners.borderEnabled",!X):v(`Background.Corners.${O}.borderEnabled`,!X)}function R(O,X){var ge;i()||(ge=o())!=null&&ge.linked?v("Background.Corners.radius",X):v(`Background.Corners.${O}.radius`,X)}function k(O,X){X.preventDefault(),w(s,O,!0)}const M=[{mode:"solid",cls:"",icon:null,title:"Solid colour (right-click toggle)"},{mode:"gradient",cls:"grad-swatch",icon:null,title:"Gradient (right-click toggle)"},{mode:"image",cls:"icon-swatch",icon:xl,title:"Image (right-click toggle)"},{mode:"overlay",cls:"icon-swatch",icon:Qc,title:"Overlay (right-click toggle)"}],L=[{kind:"corner",id:"topLeft",title:"Top Left corner"},{kind:"side",id:"top",title:"Top side"},{kind:"corner",id:"topRight",title:"Top Right corner"},{kind:"side",id:"left",title:"Left side"},{kind:"center"},{kind:"side",id:"right",title:"Right side"},{kind:"corner",id:"bottomLeft",title:"Bottom Left corner"},{kind:"side",id:"bottom",title:"Bottom side"},{kind:"corner",id:"bottomRight",title:"Bottom Right corner"}];let F=P(()=>n(s)&&_a.includes(n(s))),Y=P(()=>n(s)&&ai.includes(n(s))),q=P(()=>{var O,X;return n(F)?{kind:"side",section:"Border",sectionLinked:!!((O=r())!=null&&O.linked),styleProp:"style",defaultColour:"FF888888",defaultThickness:1,data:T(n(s))}:n(Y)?{kind:"corner",section:"Corners",sectionLinked:!!((X=o())!=null&&X.linked),styleProp:"borderStyle",defaultColour:"FFFFFFFF",defaultThickness:2,data:I(n(s))}:null});function oe(O){return n(q)?i()||n(q).sectionLinked?`Background.${n(q).section}.${O}`:`Background.${n(q).section}.${n(s)}.${O}`:null}function ee(){return n(q)?i()||n(q).sectionLinked?`Background.${n(q).section}`:`Background.${n(q).section}.${n(s)}`:null}function Z(O,X){const ge=oe(O);ge&&v(ge,X)}function N(){var X;if(!a()||!n(q))return;const O=((X=n(q).data)==null?void 0:X.colour)??n(q).defaultColour;Tl({type:"control",controlId:a(),path:oe("colour")},O)}let C=ae(null),le=ae(null);function Q(O){return`fill${O[0].toUpperCase()+O.slice(1)}`}function B(O){var he;const X=Q(O),ge=(he=n(q))==null?void 0:he.data;return O==="solid"?(ge==null?void 0:ge[X])!==!1:(ge==null?void 0:ge[X])??!1}function E(O,X){if(X.preventDefault(),X.stopPropagation(),!n(q))return;const ge=B(O);v(oe(Q(O)),!ge)}function H(){var ge;if(!a()||!n(q))return;let O=(ge=n(q).data)==null?void 0:ge.gradient;const X=ee();O||(O=JSON.parse(JSON.stringify(p)),v(`${X}.gradient`,O)),ib({type:"control",controlId:a(),path:X},O)}function J(O){var X;n(q)&&(B(O)||v(oe(Q(O)),!0),O==="solid"?N():O==="gradient"?H():(O==="image"||O==="overlay")&&(w(le,oe(O==="image"?"imageSrc":"overlaySrc"),!0),(X=n(C))==null||X.click()))}function Ae(O){var Ce;const X=(Ce=O.target.files)==null?void 0:Ce[0];if(!X||!n(le)){O.target.value="";return}const ge=n(le);w(le,null);const he=new FileReader;he.onload=()=>v(ge,he.result),he.readAsDataURL(X),O.target.value=""}function me(O){n(Y)&&v(oe("cornerGradientMode"),O)}function ne(){var O,X;n(Y)&&v(oe("cornerGradientFlip"),!((X=(O=n(q))==null?void 0:O.data)!=null&&X.cornerGradientFlip))}function ke(O){n(Y)&&v(oe("cornerGradientInheritSide"),O)}function _e(O,X){const ge=X!=="B";switch(O){case"topLeft":return ge?"Top":"Left";case"topRight":return ge?"Top":"Right";case"bottomRight":return ge?"Bottom":"Right";case"bottomLeft":return ge?"Bottom":"Left"}return ge?"A":"B"}let ie=P(()=>r2(o())),ce=P(()=>wd(n(ie)));function se(O){pe(o2(n(ie),O))}function pe(O){var ge;const X=n2(O);if(i()||(ge=o())!=null&&ge.linked)v("Background.Corners.style",X.style),v("Background.Corners.direction",X.direction);else for(const he of ai)v(`Background.Corners.${he}.style`,X.style),v(`Background.Corners.${he}.direction`,X.direction)}var A=f2(),U=h(A);Xe(U,21,()=>L,at,(O,X)=>{var ge=ue(),he=W(ge);{var Ce=Le=>{var Ie=i2();let De;var Ue=h(Ie);fe(Ue,"min",0),fe(Ue,"step",1),te((qe,Ze)=>{De=Te(Ie,1,"cell corner-cell svelte-rb1szk",null,De,qe),fe(Ie,"title",n(X).title),Ct(Ue,Ze)},[()=>({on:x(n(X).id),sel:n(s)===n(X).id}),()=>I(n(X).id).radius]),z("click",Ie,()=>j(n(X).id)),z("contextmenu",Ie,qe=>k(n(X).id,qe)),Qe("focus",Ue,b),z("click",Ue,qe=>qe.stopPropagation()),z("change",Ue,qe=>R(n(X).id,Number(qe.target.value))),m(Le,Ie)},be=Le=>{var Ie=a2();let De;te(Ue=>{De=Te(Ie,1,"cell side-cell svelte-rb1szk",null,De,Ue),fe(Ie,"title",n(X).title)},[()=>({on:$(n(X).id),sel:n(s)===n(X).id})]),z("click",Ie,()=>D(n(X).id)),z("contextmenu",Ie,Ue=>k(n(X).id,Ue)),m(Le,Ie)},$e=Le=>{qm(Le,{get cornerCombo(){return n(ie)},get cornerSide(){return n(ce)},get linked(){return i()},oncycle:se,ontogglelink:S})};xe(he,Le=>{n(X).kind==="corner"?Le(Ce):n(X).kind==="side"?Le(be,1):Le($e,-1)})}m(O,ge)});var re=f(U,2);{var ve=O=>{const X=P(()=>n(q).data);var ge=v2(),he=W(ge),Ce=f(h(he),2);{let Je=P(()=>{var V;return((V=n(X))==null?void 0:V[n(q).styleProp])??"solid"});Fm(Ce,{get options(){return Qm},columns:3,get value(){return n(Je)},onchange:V=>Z(n(q).styleProp,V)})}var be=f(he,2),$e=f(h(be),2);{let Je=P(()=>{var V;return((V=n(X))==null?void 0:V.thickness)??n(q).defaultThickness});_t($e,{get value(){return n(Je)},min:0,step:1,onchange:V=>n(c)?_(V):Z("thickness",V)})}var Le=f($e,2);let Ie;var De=h(Le),Ue=f(be,2),qe=f(h(Ue),2);Xe(qe,21,()=>M,Je=>Je.mode,(Je,V)=>{var Fe=l2();let je;var Ee=h(Fe);{var Be=Ne=>{var it=ue(),pt=W(it);$o(pt,()=>n(V).icon,(mt,gt)=>{gt(mt,{size:10,strokeWidth:1.5})}),m(Ne,it)};xe(Ee,Ne=>{n(V).icon&&Ne(Be)})}te((Ne,it)=>{je=Te(Fe,1,`fill-swatch ${n(V).cls??""}`,"svelte-rb1szk",je,Ne),fe(Fe,"title",n(V).title),Ge(Fe,it)},[()=>({active:B(n(V).mode)}),()=>{var Ne;return n(V).mode==="solid"?`background:#${(((Ne=n(X))==null?void 0:Ne.colour)??n(q).defaultColour).slice(-6)}`:void 0}]),z("click",Fe,()=>J(n(V).mode)),z("contextmenu",Fe,Ne=>E(n(V).mode,Ne)),m(Je,Fe)});var Ze=f(Ue,2);{var ot=Je=>{{let V=P(()=>{var Ne;return((Ne=n(X))==null?void 0:Ne.cornerGradientMode)??"radial"}),Fe=P(()=>{var Ne;return!!((Ne=n(X))!=null&&Ne.cornerGradientFlip)}),je=P(()=>{var Ne;return((Ne=n(X))==null?void 0:Ne.cornerGradientInheritSide)??"A"}),Ee=P(()=>_e(n(s),"A")),Be=P(()=>_e(n(s),"B"));Nm(Je,{get mode(){return n(V)},get flip(){return n(Fe)},get inheritSide(){return n(je)},get inheritLabelA(){return n(Ee)},get inheritLabelB(){return n(Be)},onmodechange:me,onflip:ne,oninheritchange:ke})}},Dt=P(()=>n(q).kind==="corner"&&B("gradient"));xe(Ze,Je=>{n(Dt)&&Je(ot)})}var Yt=f(Ze,2);{var lt=Je=>{var V=s2(),Fe=f(h(V),2);te(je=>Ct(Fe,je),[()=>n(X).imageSrc.startsWith("data:")?"(loaded)":n(X).imageSrc]),Qe("focus",Fe,b),m(Je,V)},nt=P(()=>{var Je;return B("image")&&((Je=n(X))==null?void 0:Je.imageSrc)});xe(Yt,Je=>{n(nt)&&Je(lt)})}var xt=f(Yt,2);{var we=Je=>{var V=c2(),Fe=f(h(V),2);te(je=>Ct(Fe,je),[()=>n(X).overlaySrc.startsWith("data:")?"(loaded)":n(X).overlaySrc]),Qe("focus",Fe,b),m(Je,V)},We=P(()=>{var Je;return B("overlay")&&((Je=n(X))==null?void 0:Je.overlaySrc)});xe(xt,Je=>{n(We)&&Je(we)})}var dt=f(xt,2);{var Mt=Je=>{var V=d2(),Fe=f(h(V),2);{let je=P(()=>{var Ee;return((Ee=n(X))==null?void 0:Ee.doubleGap)??2});_t(Fe,{get value(){return n(je)},min:0,step:1,onchange:Ee=>n(c)?y(Ee):Z("doubleGap",Ee)})}m(Je,V)};xe(dt,Je=>{var V;((V=n(X))==null?void 0:V[n(q).styleProp])==="double"&&Je(Mt)})}var Gt=f(dt,2);{var kt=Je=>{var V=u2(),Fe=f(h(V),2);{let je=P(()=>{var Ee;return((Ee=n(X))==null?void 0:Ee.dotRadius)??2});_t(Fe,{get value(){return n(je)},min:1,step:1,onchange:Ee=>Z("dotRadius",Ee)})}m(Je,V)};xe(Gt,Je=>{var V;((V=n(X))==null?void 0:V[n(q).styleProp])==="dotted"&&Je(kt)})}te(()=>{Ie=Te(Le,1,"all-sep-btn svelte-rb1szk",null,Ie,{active:n(c)}),fe(Le,"title",n(c)?"Editing all sides + corners":`Editing this ${n(q).kind} only`),Re(De,n(c)?"All":"Sep")}),z("click",Le,()=>w(c,!n(c))),m(O,ge)};xe(re,O=>{n(q)&&O(ve)})}var ye=f(re,2);Kt(ye,O=>w(C,O),()=>n(C)),z("change",ye,Ae),m(e,A),Ke()}tt(["click","contextmenu","change"]);var p2=G('<div class="border-editor svelte-1mvkgtf"><!></div>');function g2(e,t){Ve(t,!0);const r=()=>Ye(wt,"$selectedComponentIds",o),[o,i]=It();let a=K(t,"control",3,null),l=P(()=>jt(a(),"Core")),s=P(()=>jt(a(),"Background")),c=P(()=>{var g,_;return(_=(g=n(s))==null?void 0:g._children)==null?void 0:_.Border}),d=P(()=>{var g,_;return(_=(g=n(s))==null?void 0:g._children)==null?void 0:_.Corners});function u(g,_){var y;(y=n(l))!=null&&y.id&&(r().size>1?Do(g,_):et(n(l).id,g,_))}var p=ue(),v=W(p);{var b=g=>{var _=p2(),y=h(_);{let S=P(()=>{var I;return((I=n(d))==null?void 0:I.linked)??!0}),T=P(()=>{var I;return(I=n(l))==null?void 0:I.id});h2(y,{get border(){return n(c)},get corners(){return n(d)},get linked(){return n(S)},get controlId(){return n(T)},onupdate:(I,$)=>u(I,$)})}m(g,_)};xe(v,g=>{n(s)&&g(b)})}m(e,p),Ke(),i()}var b2=G('<span class="summary-value svelte-1cuy48x"> </span>'),m2=G("<option> </option>"),_2=G('<div class="effects-summary svelte-1cuy48x"><div class="summary-row svelte-1cuy48x"><span class="lbl svelte-1cuy48x">Shadows</span> <span class="summary-value svelte-1cuy48x"> </span> <button class="edit-btn svelte-1cuy48x" title="Edit shadows">Edit</button></div> <div class="summary-row svelte-1cuy48x"><span class="lbl svelte-1cuy48x">Bevel</span> <button> </button> <!> <button class="edit-btn svelte-1cuy48x" title="Edit bevel">Edit</button></div> <div class="summary-row svelte-1cuy48x"><span class="lbl svelte-1cuy48x">Filters</span> <span class="summary-value svelte-1cuy48x"> </span> <button class="edit-btn svelte-1cuy48x" title="Edit filters">Edit</button></div> <div class="summary-row svelte-1cuy48x"><span class="lbl svelte-1cuy48x">Blend</span> <select class="blend-select svelte-1cuy48x"></select></div></div>');function y2(e,t){Ve(t,!0);const r=()=>Ye(wt,"$selectedComponentIds",o),[o,i]=It();let a=K(t,"control",3,null),l=P(()=>jt(a(),"Core")),s=P(()=>jt(a(),"Effects")),c=P(()=>{var $,x;return(x=($=n(s))==null?void 0:$._children)==null?void 0:x.Shadows}),d=P(()=>{var $,x;return(x=($=n(s))==null?void 0:$._children)==null?void 0:x.Bevel}),u=P(()=>{var $,x;return(x=($=n(s))==null?void 0:$._children)==null?void 0:x.Filters}),p=P(()=>{var $,x;return(x=($=n(s))==null?void 0:$._children)==null?void 0:x.Blend}),v=P(()=>{var $,x;return((x=($=n(c))==null?void 0:$.items)==null?void 0:x.filter(D=>D.enabled).length)??0}),b=P(()=>n(u)?n(u).blur!==0||n(u).brightness!==100||n(u).contrast!==100||n(u).saturation!==100||n(u).hueRotate!==0||n(u).grayscale!==0||n(u).sepia!==0||n(u).invert!==0:!1);function g($,x){var D;(D=n(l))!=null&&D.id&&(r().size>1?Do($,x):et(n(l).id,$,x))}function _(){Co.set({tab:"effects"})}const y=["normal","multiply","screen","overlay","darken","lighten","color-dodge","color-burn","hard-light","soft-light","difference","exclusion","hue","saturation","color","luminosity"];var S=ue(),T=W(S);{var I=$=>{var x=_2(),D=h(x),j=f(h(D),2),R=h(j),k=f(j,2),M=f(D,2),L=f(h(M),2);let F;var Y=h(L),q=f(L,2);{var oe=H=>{var J=b2(),Ae=h(J);te(()=>Re(Ae,n(d).style)),m(H,J)};xe(q,H=>{var J;(J=n(d))!=null&&J.enabled&&H(oe)})}var ee=f(q,2),Z=f(M,2),N=f(h(Z),2),C=h(N),le=f(N,2),Q=f(Z,2),B=f(h(Q),2);Xe(B,21,()=>y,at,(H,J)=>{var Ae=m2(),me=h(Ae),ne={};te(()=>{Re(me,n(J)),ne!==(ne=n(J))&&(Ae.value=(Ae.__value=n(J))??"")}),m(H,Ae)});var E;jr(B),te(()=>{var H,J,Ae,me,ne;Re(R,`${n(v)??""} active`),F=Te(L,1,"toggle-btn svelte-1cuy48x",null,F,{on:(H=n(d))==null?void 0:H.enabled}),Re(Y,(J=n(d))!=null&&J.enabled?"On":"Off"),Re(C,n(b)?"Active":"Default"),E!==(E=((Ae=n(p))==null?void 0:Ae.mode)??"normal")&&(B.value=(B.__value=((me=n(p))==null?void 0:me.mode)??"normal")??"",Qn(B,((ne=n(p))==null?void 0:ne.mode)??"normal"))}),z("click",k,_),z("click",L,()=>{var H;return g("Effects.Bevel.enabled",!((H=n(d))!=null&&H.enabled))}),z("click",ee,_),z("click",le,_),z("change",B,H=>g("Effects.Blend.mode",H.target.value)),m($,x)};xe(T,$=>{n(s)&&$(I)})}m(e,S),Ke(),i()}tt(["click","change"]);var $2=G('<div class="placeholder svelte-14zlkpl"> </div>');function Ts(e,t){let r=K(t,"contextMode",3,"panel"),o=K(t,"tabId",3,""),i=K(t,"control",3,null),a=K(t,"fallbackLabel",3,"");var l=ue(),s=W(l);{var c=_=>{bm(_,{get tabId(){return o()}})},d=_=>{_m(_,{get control(){return i()}})},u=_=>{$m(_,{get control(){return i()}})},p=_=>{Pm(_,{get control(){return i()}})},v=_=>{g2(_,{get control(){return i()}})},b=_=>{y2(_,{get control(){return i()}})},g=_=>{var y=$2(),S=h(y);te(()=>Re(S,`Component: ${a()??""}`)),m(_,y)};xe(s,_=>{r()==="panel"?_(c):o()==="core"?_(d,1):o()==="transform"?_(u,2):o()==="background"?_(p,3):o()==="border"?_(v,4):o()==="effects"?_(b,5):_(g,-1)})}m(e,l)}var x2=G('<div class="card-header svelte-115bhok"><span class="card-title svelte-115bhok"> </span> <span class="owner-label svelte-115bhok"> </span></div> <div class="card-content svelte-115bhok"><!></div>',1),w2=G('<span class="owner-label svelte-115bhok"> </span>'),k2=G('<div class="multi-card-content svelte-115bhok"><!></div>'),C2=G('<div class="multi-card svelte-115bhok"><button class="multi-card-header svelte-115bhok"><!> <span class="multi-card-title svelte-115bhok"> </span> <!></button> <!></div>');function ya(e,t){Ve(t,!0);let r=K(t,"tabs",19,()=>[]),o=K(t,"visibleTabs",19,()=>[]),i=K(t,"control",3,null),a=K(t,"ownerName",3,""),l=K(t,"collapsedCards",19,()=>({})),s=K(t,"collapsePrefix",3,""),c=K(t,"ontogglecollapse",3,null);const d=_=>s()+_,u=_=>l()[d(_)]===!0;var p=ue(),v=W(p);{var b=_=>{var y=ue(),S=W(y);mv(S,()=>t.singleTabId,T=>{var I=x2(),$=W(I),x=h($),D=h(x),j=f(x,2),R=h(j),k=f($,2),M=h(k);{let L=P(()=>{var F;return((F=r().find(Y=>Y.id===t.singleTabId))==null?void 0:F.label)??""});Ts(M,{get contextMode(){return t.contextMode},get tabId(){return t.singleTabId},get control(){return i()},get fallbackLabel(){return n(L)}})}te(L=>{Re(D,L),Re(R,a())},[()=>{var L;return((L=r().find(F=>F.id===t.singleTabId))==null?void 0:L.label)??""}]),m(T,I)}),m(_,y)},g=_=>{var y=ue(),S=W(y);Xe(S,19,o,T=>T.id,(T,I,$)=>{var x=C2(),D=h(x),j=h(D);{var R=N=>{Uf(N,{size:16,strokeWidth:1.5})},k=P(()=>u(n(I).id)),M=N=>{$l(N,{size:16,strokeWidth:1.5})};xe(j,N=>{n(k)?N(R):N(M,-1)})}var L=f(j,2),F=h(L),Y=f(L,2);{var q=N=>{var C=w2(),le=h(C);te(()=>Re(le,a())),m(N,C)};xe(Y,N=>{n($)===0&&N(q)})}var oe=f(D,2);{var ee=N=>{var C=k2(),le=h(C);Ts(le,{get contextMode(){return t.contextMode},get tabId(){return n(I).id},get control(){return i()},get fallbackLabel(){return n(I).label}}),m(N,C)},Z=P(()=>!u(n(I).id));xe(oe,N=>{n(Z)&&N(ee)})}te(()=>Re(F,n(I).label)),z("click",D,()=>{var N;return(N=c())==null?void 0:N(d(n(I).id))}),m(T,x)}),m(_,y)};xe(v,_=>{t.viewMode==="single"?_(b):_(g,-1)})}m(e,p),Ke()}tt(["click"]);function Es({getSingle:e,setSingle:t,getMulti:r,setMulti:o,getViewMode:i,setViewMode:a}){function l(d,u){u.ctrlKey||u.metaKey?(s(d),r().size>1&&a("multi")):i()==="single"?t(d):s(d)}function s(d){const u=new Set(r());u.has(d)?u.size>1&&u.delete(d):u.add(d),o(u),u.size===1&&t([...u][0])}function c(d){return i()==="single"?e()===d:r().has(d)}return{handleClick:l,toggleMulti:s,isActive:c}}var z2=G('<div class="split-wrapper svelte-2rmaxa"><div class="split-half svelte-2rmaxa"><!> <div class="split-content-area svelte-2rmaxa"><!></div></div> <div class="split-divider svelte-2rmaxa"></div> <div class="split-half svelte-2rmaxa"><!> <div class="split-content-area svelte-2rmaxa"><!></div></div></div>'),M2=G('<div class="normal-wrapper svelte-2rmaxa"><!> <div class="card-area svelte-2rmaxa"><div class="content-scroll svelte-2rmaxa"><!></div> <div class="info-bar svelte-2rmaxa"><div class="info-header svelte-2rmaxa">Info</div> <span class="info-text svelte-2rmaxa"> </span></div></div></div>'),S2=G('<div class="info-bar svelte-2rmaxa"><div class="info-header svelte-2rmaxa">Info</div> <span class="info-text svelte-2rmaxa"> </span></div>'),P2=G("<!> <!> <!>",1),T2=G('<div class="empty-panel svelte-2rmaxa"><span class="empty-text svelte-2rmaxa">No panel open</span></div>'),E2=G('<div class="properties-panel svelte-2rmaxa"><!></div>');function F2(e,t){Ve(t,!0);const r=()=>Ye(yt,"$panels",s),o=()=>Ye(bt,"$activePanelId",s),i=()=>Ye(Gc,"$selectedComponentId",s),a=()=>Ye(sf,"$selectedControl",s),l=()=>Ye(El,"$propertyHint",s),[s,c]=It();let d=K(t,"width",3,280),u=P(()=>r().find(E=>E.id===o())??null),p=P(i),v=P(()=>n(p)!=null?"component":"panel"),b=P(()=>{var E;return((E=n(u))==null?void 0:E.name)??"Panel"}),g=P(()=>{var E,H,J;return((J=(H=(E=a())==null?void 0:E._children)==null?void 0:H.Core)==null?void 0:J.name)??"Component"}),_=P(()=>n(v)==="panel"?n(b):n(g)),y=ae("single"),S=ae(!1),T=ae("core"),I=ae(zt(new Set(["core"]))),$=ae("core"),x=ae(zt(new Set(["core"])));const D=Es({getSingle:()=>n(T),setSingle:E=>w(T,E,!0),getMulti:()=>n(I),setMulti:E=>w(I,E,!0),getViewMode:()=>n(y),setViewMode:E=>w(y,E,!0)}),j=Es({getSingle:()=>n($),setSingle:E=>w($,E,!0),getMulti:()=>n(x),setMulti:E=>w(x,E,!0),getViewMode:()=>n(y),setViewMode:E=>w(y,E,!0)});let R=ae(zt({}));Pt(()=>{n(v)&&(w(T,"core"),w(I,new Set(["core"]),!0))});let k=P(()=>n(S)&&n(v)==="component");const M=[{id:"core",icon:oh,label:"Core"},{id:"background",icon:ls,label:"Background"},{id:"grid",icon:Ba,label:"Grid"},{id:"export",icon:lh,label:"Export"}],L=[{id:"core",icon:qf,label:"Core",section:"Core"},{id:"transform",icon:id,label:"Transform",section:"Transform"},{id:"background",icon:ls,label:"Background",section:"Background"},{id:"border",icon:Jc,label:"Border",section:"Background"},{id:"text",icon:dd,label:"Text",section:"Text"},{id:"mouse",icon:uh,label:"Mouse",section:"Mouse"},{id:"grid",icon:Ba,label:"Grid",section:"Grid"},{id:"icon",icon:xl,label:"Icon",section:"Icon"},{id:"effects",icon:Sh,label:"Effects",section:"Effects"},{id:"actions",icon:qh,label:"Scripts",section:"Scripts"},{id:"links",icon:wl,label:"Links",section:null},{id:"specific",icon:zh,label:"Type",section:null}];let F=P(()=>a()?L.filter(E=>!E.section||lf(a(),E.section)):L.filter(E=>E.id==="core"||E.id==="transform")),Y=P(()=>n(v)==="panel"?M:n(F)),q=P(()=>n(y)==="single"?n(Y).filter(E=>E.id===n(T)):n(Y).filter(E=>n(I).has(E.id))),oe=P(()=>n(y)==="single"?n(F).filter(E=>E.id===n(T)):n(F).filter(E=>n(I).has(E.id))),ee=P(()=>n(y)==="single"?M.filter(E=>E.id===n($)):M.filter(E=>n(x).has(E.id)));function Z(){n(y)==="single"?(w(y,"multi"),w(I,new Set([n(T)]),!0)):(w(y,"single"),n(I).size>0&&w(T,[...n(I)][0],!0))}function N(E){w(R,{...n(R),[E]:!n(R)[E]},!0)}var C=E2(),le=h(C);{var Q=E=>{var H=P2(),J=W(H);pb(J,{get panel(){return n(u)},get pinPanelProps(){return n(S)},get viewMode(){return n(y)},ontogglepin:()=>w(S,!n(S)),ontoggleview:Z});var Ae=f(J,2);{var me=ie=>{var ce=z2(),se=h(ce),pe=h(se);ba(pe,{get tabs(){return M},get isActive(){return j.isActive},get onclick(){return j.handleClick},titlePrefix:"Panel: "});var A=f(pe,2),U=h(A);ya(U,{get viewMode(){return n(y)},get tabs(){return M},get visibleTabs(){return n(ee)},get singleTabId(){return n($)},contextMode:"panel",get ownerName(){return n(b)},get collapsedCards(){return n(R)},collapsePrefix:"panel-",ontogglecollapse:N});var re=f(se,4),ve=h(re);ba(ve,{get tabs(){return n(F)},get isActive(){return D.isActive},get onclick(){return D.handleClick}});var ye=f(ve,2),O=h(ye);ya(O,{get viewMode(){return n(y)},get tabs(){return n(F)},get visibleTabs(){return n(oe)},get singleTabId(){return n(T)},contextMode:"component",get control(){return a()},get ownerName(){return n(g)},get collapsedCards(){return n(R)},ontogglecollapse:N}),m(ie,ce)},ne=ie=>{var ce=M2(),se=h(ce);ba(se,{get tabs(){return n(Y)},get isActive(){return D.isActive},get onclick(){return D.handleClick}});var pe=f(se,2),A=h(pe),U=h(A);ya(U,{get viewMode(){return n(y)},get tabs(){return n(Y)},get visibleTabs(){return n(q)},get singleTabId(){return n(T)},get contextMode(){return n(v)},get control(){return a()},get ownerName(){return n(_)},get collapsedCards(){return n(R)},ontogglecollapse:N});var re=f(A,2),ve=f(h(re),2),ye=h(ve);te(()=>Re(ye,l()||"Hover a property for details")),m(ie,ce)};xe(Ae,ie=>{n(k)?ie(me):ie(ne,-1)})}var ke=f(Ae,2);{var _e=ie=>{var ce=S2(),se=f(h(ce),2),pe=h(se);te(()=>Re(pe,l()||"Hover a property for details")),m(ie,ce)};xe(ke,ie=>{n(k)&&ie(_e)})}m(E,H)},B=E=>{var H=T2();m(E,H)};xe(le,E=>{n(u)?E(Q):E(B,-1)})}te(()=>Ge(C,`width: ${d()??""}px;`)),m(e,C),Ke(),c()}var I2=G('<div class="tree-empty svelte-1bhvj9o">No components</div>'),A2=G('<input class="rename-input svelte-1bhvj9o" type="text"/>'),j2=G('<span class="item-name svelte-1bhvj9o"> </span>'),N2=G('<div draggable="true"><span class="item-type svelte-1bhvj9o"> </span> <!> <div class="item-actions svelte-1bhvj9o"><button><!></button> <button><!></button></div></div>'),L2=G('<div class="tree-panel svelte-1bhvj9o"><div class="tree-header svelte-1bhvj9o"><span class="tree-title svelte-1bhvj9o">Components</span> <span class="tree-count svelte-1bhvj9o"> </span></div> <div class="tree-list svelte-1bhvj9o"><!></div></div>');function R2(e,t){Ve(t,!0);const r=()=>Ye(yt,"$panels",l),o=()=>Ye(bt,"$activePanelId",l),i=()=>Ye(wt,"$selectedComponentIds",l),a=()=>Ye(Dn,"$keyObjectId",l),[l,s]=It();let c=P(()=>r().find(N=>N.id===o())??null),d=P(()=>n(c)?[...n(c).controls].reverse():[]),u=ae(null),p=ae("");function v(N,C){w(u,N,!0),w(p,C,!0)}function b(){n(u)&&n(p).trim()&&et(n(u),"Core.name",n(p).trim()),w(u,null)}function g(N){N.key==="Enter"?b():N.key==="Escape"&&w(u,null)}function _(N,C){C.ctrlKey||C.metaKey?eo(N,!0):eo(N,!1)}function y(N,C){et(N,"Core.visible",!C)}function S(N,C){et(N,"Core.locked",!C)}let T=ae(null),I=ae(null),$=ae(null);function x(N,C){w($,N,!0),C.dataTransfer.effectAllowed="move",C.dataTransfer.setData("text/plain",N)}function D(N,C){if(C.preventDefault(),C.dataTransfer.dropEffect="move",N===n($)){w(T,null);return}const le=C.currentTarget.getBoundingClientRect(),Q=le.top+le.height/2;w(T,N,!0),w(I,C.clientY<Q?"above":"below",!0)}function j(){w(T,null),w(I,null)}function R(N){if(N.preventDefault(),!n(c)||!n($)||!n(T)||n($)===n(T)){w(T,null),w(I,null),w($,null);return}const C=[...n(c).controls],le=C.findIndex(E=>{var H,J;return((J=(H=E._children)==null?void 0:H.Core)==null?void 0:J.id)===n($)}),Q=C[le];C.splice(le,1);let B=C.findIndex(E=>{var H,J;return((J=(H=E._children)==null?void 0:H.Core)==null?void 0:J.id)===n(T)});n(I)==="above"&&(B+=1),C.splice(B,0,Q),st(n(c).id,{controls:C}),w(T,null),w(I,null),w($,null)}function k(){w(T,null),w(I,null),w($,null)}var M=L2(),L=h(M),F=f(h(L),2),Y=h(F),q=f(L,2),oe=h(q);{var ee=N=>{var C=I2();m(N,C)},Z=N=>{var C=ue(),le=W(C);Xe(le,17,()=>n(d),Q=>{var B,E;return(E=(B=Q._children)==null?void 0:B.Core)==null?void 0:E.id},(Q,B)=>{const E=P(()=>jt(n(B),"Core")),H=P(()=>{var be;return(be=n(E))==null?void 0:be.id}),J=P(()=>i().has(n(H))),Ae=P(()=>a()===n(H)&&i().size>1);var me=N2();let ne;var ke=h(me),_e=h(ke),ie=f(ke,2);{var ce=be=>{var $e=A2();sl($e,!0),Qe("blur",$e,b),z("keydown",$e,g),Qe("focus",$e,Le=>Le.target.select()),z("click",$e,Le=>Le.stopPropagation()),ln($e,()=>n(p),Le=>w(p,Le)),m(be,$e)},se=be=>{var $e=j2(),Le=h($e);te(()=>{var Ie,De;fe($e,"title",(Ie=n(E))==null?void 0:Ie.name),Re(Le,((De=n(E))==null?void 0:De.name)??"")}),m(be,$e)};xe(ie,be=>{n(u)===n(H)?be(ce):be(se,-1)})}var pe=f(ie,2),A=h(pe);let U;var re=h(A);{var ve=be=>{Zf(be,{size:12,strokeWidth:1.5})},ye=be=>{Kf(be,{size:12,strokeWidth:1.5})};xe(re,be=>{var $e;(($e=n(E))==null?void 0:$e.visible)!==!1?be(ve):be(ye,-1)})}var O=f(A,2);let X;var ge=h(O);{var he=be=>{nd(be,{size:12,strokeWidth:1.5})},Ce=be=>{td(be,{size:12,strokeWidth:1.5})};xe(ge,be=>{var $e;($e=n(E))!=null&&$e.locked?be(he):be(Ce,-1)})}te(()=>{var be,$e,Le,Ie,De,Ue;ne=Te(me,1,"tree-item svelte-1bhvj9o",null,ne,{selected:n(J),"key-object":n(Ae),"hidden-item":((be=n(E))==null?void 0:be.visible)===!1,"drag-above":n(T)===n(H)&&n(I)==="above","drag-below":n(T)===n(H)&&n(I)==="below"}),Re(_e,(($e=n(E))==null?void 0:$e.controlType)??"?"),U=Te(A,1,"action-icon svelte-1bhvj9o",null,U,{off:((Le=n(E))==null?void 0:Le.visible)===!1}),fe(A,"title",((Ie=n(E))==null?void 0:Ie.visible)!==!1?"Hide":"Show"),X=Te(O,1,"action-icon svelte-1bhvj9o",null,X,{on:(De=n(E))==null?void 0:De.locked}),fe(O,"title",(Ue=n(E))!=null&&Ue.locked?"Unlock":"Lock")}),z("click",me,be=>_(n(H),be)),z("dblclick",me,()=>{var be;return v(n(H),((be=n(E))==null?void 0:be.name)??"")}),Qe("dragstart",me,be=>x(n(H),be)),Qe("dragover",me,be=>D(n(H),be)),Qe("dragleave",me,j),Qe("drop",me,R),Qe("dragend",me,k),z("click",A,be=>{var $e;be.stopPropagation(),y(n(H),(($e=n(E))==null?void 0:$e.visible)!==!1)}),z("click",O,be=>{var $e;be.stopPropagation(),S(n(H),(($e=n(E))==null?void 0:$e.locked)??!1)}),m(Q,me)}),m(N,C)};xe(oe,N=>{n(d).length===0?N(ee):N(Z,-1)})}te(()=>Re(Y,n(d).length)),m(e,M),Ke(),s()}tt(["click","dblclick","keydown"]);var D2=G('<div class="status-bar svelte-1gvod6j"><span class="status-item svelte-1gvod6j">Ready</span> <span class="spacer svelte-1gvod6j"></span> <span class="status-item dim svelte-1gvod6j">No selection</span> <span class="status-item dim svelte-1gvod6j">CEditor v0.1.0</span></div>');function G2(e){var t=D2();m(e,t)}var O2=G('<div class="shortcut-row svelte-x7fjnn"><kbd class="key svelte-x7fjnn"> </kbd> <span class="desc svelte-x7fjnn"> </span></div>'),B2=G('<div class="section svelte-x7fjnn"><h3 class="section-title svelte-x7fjnn"> </h3> <!></div>'),q2=G('<div class="overlay-backdrop svelte-x7fjnn"><div class="overlay-panel svelte-x7fjnn"><div class="overlay-header svelte-x7fjnn"><span class="overlay-title svelte-x7fjnn">Keyboard Shortcuts</span> <button class="close-btn svelte-x7fjnn">&times;</button></div> <div class="overlay-body svelte-x7fjnn"></div></div></div>');function Y2(e,t){Ve(t,!0);let r=K(t,"show",3,!1),o=K(t,"onclose",3,()=>{});const i=[{title:"File",shortcuts:[["Ctrl+N","New Panel"],["Ctrl+O","Open Panel"],["Ctrl+S","Save"],["Ctrl+Shift+S","Save As"],["Ctrl+W","Close Panel"]]},{title:"Edit",shortcuts:[["Ctrl+Z","Undo"],["Ctrl+Y","Redo"],["Ctrl+X","Cut"],["Ctrl+C","Copy"],["Ctrl+V","Paste"],["Ctrl+A","Select All"],["Ctrl+D","Duplicate"],["Delete","Delete selected"]]},{title:"View",shortcuts:[["Ctrl++","Zoom In"],["Ctrl+-","Zoom Out"],["Ctrl+0","Fit to Window"],["Ctrl+Shift+P","Zoom to Selection"],["Ctrl+Scroll","Mouse wheel zoom"]]},{title:"Canvas",shortcuts:[["Space+Drag","Pan canvas"],["Middle Drag","Pan canvas"],["Right Drag","Pan canvas"],["Right Click","Context menu"]]},{title:"Components",shortcuts:[["Click","Select"],["Ctrl+Click","Toggle multi-select"],["Drag","Move"],["Shift+Arrow","Nudge by grid size"],["Arrow keys","Nudge 1px"],["Shift+Resize","Aspect ratio lock"],["Corner outside","Rotate"],["Shift+Rotate","Snap to 15°"]]},{title:"Guides",shortcuts:[["Drag from ruler","Create guide"],["Drag guide label","Move guide"],["Click guide label","Select guide"],["Delete","Remove selected guide"],["Right-click guide","Remove guide"]]}];function a(u){u.target===u.currentTarget&&o()()}function l(u){u.key==="Escape"&&(u.preventDefault(),o()())}var s=ue();Qe("keydown",Rn,u=>{r()&&l(u)});var c=W(s);{var d=u=>{var p=q2(),v=h(p),b=h(v),g=f(h(b),2),_=f(b,2);Xe(_,21,()=>i,at,(y,S)=>{var T=B2(),I=h(T),$=h(I),x=f(I,2);Xe(x,17,()=>n(S).shortcuts,at,(D,j)=>{var R=P(()=>zi(n(j),2));let k=()=>n(R)[0],M=()=>n(R)[1];var L=O2(),F=h(L),Y=h(F),q=f(F,2),oe=h(q);te(()=>{Re(Y,k()),Re(oe,M())}),m(D,L)}),te(()=>Re($,n(S).title)),m(y,T)}),z("click",p,a),z("click",g,function(...y){var S;(S=o())==null||S.apply(this,y)}),m(u,p)};xe(c,u=>{r()&&u(d)})}m(e,s),Ke()}tt(["click"]);var X2=G('<div></div> <div class="tree-area svelte-1n46o8q"><!></div>',1),H2=G('<div></div> <div class="properties-area svelte-1n46o8q"><!></div>',1),U2=G('<div class="app svelte-1n46o8q"><div class="menubar-area svelte-1n46o8q"><!></div> <div class="icon-panel-area svelte-1n46o8q"><!></div> <div class="center-area svelte-1n46o8q"><div class="editor-top-row svelte-1n46o8q"><div class="editor-canvas-col svelte-1n46o8q"><div class="editor-canvas-area svelte-1n46o8q"><!></div> <div class="common-bar-area svelte-1n46o8q"><!></div> <div class="zoom-bar-area svelte-1n46o8q"><!></div></div> <!></div> <div></div> <div class="display-panel-area svelte-1n46o8q"><!></div></div> <!> <div class="statusbar-area svelte-1n46o8q"><!></div></div> <!>',1);function W2(e,t){Ve(t,!0),rf(),L1(),uf();function r(ne){if(ne.key==="F1"){ne.preventDefault(),w(c,!n(c));return}if((ne.ctrlKey||ne.metaKey)&&ne.shiftKey&&(ne.key==="P"||ne.key==="p")){ne.preventDefault(),Vc();return}(ne.ctrlKey||ne.metaKey)&&ne.key==="z"&&!ne.shiftKey?(ne.preventDefault(),mo()):(ne.ctrlKey||ne.metaKey)&&(ne.key==="y"||ne.key==="z"&&ne.shiftKey)&&(ne.preventDefault(),_o())}let o=ae(280),i=ae(!1),a=ae(200),l=ae(!1),s=ae(!0),c=ae(!1),d=ae(480),u=ae(!1),p=ae(!0),v=ae(!0);const b={colors:480,gradient:580};function g(ne){const ke=b[ne];ke&&w(d,ke,!0)}function _(ne){w(i,!0);const ke=ne.clientX,_e=n(o);function ie(se){const pe=ke-se.clientX;w(o,Math.max(220,Math.min(500,_e+pe)),!0)}function ce(){w(i,!1),window.removeEventListener("mousemove",ie),window.removeEventListener("mouseup",ce)}window.addEventListener("mousemove",ie),window.addEventListener("mouseup",ce)}function y(ne){w(l,!0);const ke=ne.clientX,_e=n(a);function ie(se){const pe=ke-se.clientX;w(a,Math.max(120,Math.min(400,_e+pe)),!0)}function ce(){w(l,!1),window.removeEventListener("mousemove",ie),window.removeEventListener("mouseup",ce)}window.addEventListener("mousemove",ie),window.addEventListener("mouseup",ce)}function S(ne){w(u,!0);const ke=ne.clientY,_e=n(d);function ie(se){const pe=ke-se.clientY;w(d,Math.max(80,Math.min(900,_e+pe)),!0)}function ce(){w(u,!1),window.removeEventListener("mousemove",ie),window.removeEventListener("mouseup",ce)}window.addEventListener("mousemove",ie),window.addEventListener("mouseup",ce)}var T=U2();Qe("keydown",Rn,r),Qe("contextmenu",Rn,ne=>ne.preventDefault());var I=W(T),$=h(I),x=h($);_f(x,{});var D=f($,2),j=h(D);Wh(j,{get showDisplayPanel(){return n(p)},get showPropertiesPanel(){return n(v)},get showTreePanel(){return n(s)},onToggleDisplay:()=>w(p,!n(p)),onToggleProperties:()=>w(v,!n(v)),onToggleTree:()=>w(s,!n(s))});var R=f(D,2),k=h(R),M=h(k),L=h(M),F=h(L);Qg(F,{});var Y=f(L,2),q=h(Y);t1(q);var oe=f(Y,2),ee=h(oe);i1(ee,{});var Z=f(M,2);{var N=ne=>{var ke=X2(),_e=W(ke);let ie;var ce=f(_e,2),se=h(ce);R2(se,{}),te(()=>{ie=Te(_e,1,"tree-resize-handle svelte-1n46o8q",null,ie,{active:n(l)}),Ge(ce,`flex: 0 0 ${n(a)??""}px;`)}),z("mousedown",_e,y),m(ne,ke)};xe(Z,ne=>{n(s)&&ne(N)})}var C=f(k,2);let le;var Q=f(C,2),B=h(Q);ub(B,{onTabChange:g});var E=f(R,2);{var H=ne=>{var ke=H2(),_e=W(ke);let ie;var ce=f(_e,2),se=h(ce);F2(se,{get width(){return n(o)}}),te(()=>ie=Te(_e,1,"resize-handle svelte-1n46o8q",null,ie,{active:n(i)})),z("mousedown",_e,_),m(ne,ke)};xe(E,ne=>{n(v)&&ne(H)})}var J=f(E,2),Ae=h(J);G2(Ae);var me=f(I,2);Y2(me,{get show(){return n(c)},onclose:()=>w(c,!1)}),te(()=>{Ge(I,`--props-width: ${n(v)?n(o)+"px":"0px"}; --resize-width: ${n(v)?"8px":"0px"}`),le=Te(C,1,"display-resize-handle svelte-1n46o8q",null,le,{active:n(u)}),Ge(C,`display: ${n(p)?"block":"none"}`),Ge(Q,`flex: 0 0 ${n(d)??""}px; display: ${n(p)?"block":"none"}`)}),z("mousedown",C,S),m(e,T),Ke()}tt(["mousedown"]);hv(W2,{target:document.getElementById("app")});
