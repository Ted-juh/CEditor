/** Imported GIFs must advance in the Editor even with reduced UI motion enabled. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// Two 4x2 GIF frames: left half lit, then right half lit, with 200ms delays.
// Clear the tiny LZW dictionary between pixels to keep all codes at three bits.
function gifFixture(specs = [
  {pixels:[1,1,0,0,1,1,0,0]}, {pixels:[0,0,1,1,0,0,1,1]},
]) {
  const bytes=[...Buffer.from('GIF89a'),4,0,2,0,0x80,0,0,0,0,0,255,255,255,
    0x21,0xff,11,...Buffer.from('NETSCAPE2.0'),3,1,0,0,0];
  for(const {pixels,disposal=1,left=0,width=4,transparent=false,delay=20} of specs) {
    const codes=pixels.flatMap(p=>[4,p]);codes.push(5);
    const packed=[];let bits=0,value=0;
    for(const code of codes){value|=code<<bits;bits+=3;while(bits>=8){packed.push(value&255);value>>=8;bits-=8;}}
    if(bits)packed.push(value&255);
    bytes.push(0x21,0xf9,4,(disposal<<2)|(transparent?1:0),delay,0,0,0,0x2c,left,0,0,0,width,0,2,0,0,2,packed.length,...packed,0);
  }
  return Buffer.from([...bytes,0x3b]);
}
const root=fileURLToPath(new URL('..',import.meta.url));
const server=await createServer({root,configFile:join(root,'vite.config.js'),server:{host:'127.0.0.1',port:0}});await server.listen();
const browser=await chromium.launch({channel:'msedge'});
const page=await browser.newPage({viewport:{width:1600,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
try {
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);await page.locator('.app').waitFor();
  console.log('Host reduced motion:',await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches));
  await page.emulateMedia({reducedMotion:'reduce'});
  // WebView hosts can lack WebCodecs; GIF playback must work there too.
  await page.evaluate(() => { window.ImageDecoder = undefined; });
  for(const disposal of [2,3]) {
    const bytes=gifFixture([{pixels:Array(8).fill(1),delay:7},
      {pixels:Array(4).fill(0),width:2,disposal,delay:11},
      {pixels:[0,0],left:3,width:1}]);
    const decoded=await page.evaluate(async data=>{
      const {decodeGifAnimation}=await import('/src/CE_Application/utils/gifAnimation.js');
      const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));
      return decodeGifAnimation(bytes.buffer,canvas=>Array.from(canvas.getContext('2d').getImageData(0,0,4,2).data));
    },bytes.toString('base64'));
    assert.deepEqual(decoded.durations,[70,110,200]);
    assert.equal(decoded.frames[1][0],0,'partial frame paints black on the left');
    assert.equal(decoded.frames[2][3],disposal===2?0:255,'clear or restore previous canvas before next patch');
    if(disposal===3)assert.equal(decoded.frames[2][0],255,'previous white pixels restored');
  }
  const transparent=await page.evaluate(async data=>{
    const {decodeGifAnimation}=await import('/src/CE_Application/utils/gifAnimation.js');
    return decodeGifAnimation(Uint8Array.from(atob(data),c=>c.charCodeAt(0)).buffer,
      canvas=>Array.from(canvas.getContext('2d').getImageData(0,0,4,2).data));
  },gifFixture([{pixels:Array(8).fill(1)},{pixels:Array(8).fill(0),transparent:true}]).toString('base64'));
  assert.deepEqual(transparent.frames[0],transparent.frames[1],'transparent patch preserves previous pixels');
  console.log('ok GIF patch composition, transparency, disposal and frame delays');
  const ids=await page.evaluate(async()=>{
    const p=await import('/src/CE_Application/stores/panels.js'),c=await import('/src/CE_Application/stores/controls.js');p.addPanel();
    const result=[];
    for(const [type,section,x]of[['PixelDisplay','Pixel',20],['LcdDisplay','Display',310]]){
      const id=c.addControl(type)._children.Core.id;
      c.applyControlPatch(id,{'Transform.x':x,'Transform.y':25,'Transform.width':240,'Transform.height':160,
        [`${section}.panelType`]:'graphic',[`${section}.animMode`]:'file',[`${section}.animLoop`]:true,
        [`${section}.animFrames`]:12,[`${section}.pixelsW`]:16,[`${section}.pixelsH`]:8,
        [`${section}.pixelWidth`]:16,[`${section}.pixelHeight`]:8,[`${section}.lines`]:[],
        [`${section}.elements`]:[],[`${section}.showGhost`]:false});
      result.push(id);
    }
    (await import('/src/CE_Application/stores/panelVisibility.js')).showDisplayPanel.set(true);
    (await import('/src/CE_Application/stores/displayTab.js')).displayTabRequest.set({tab:'screen'});
    return result;
  });
  for(const [index,id]of ids.entries()){
    await page.evaluate(async id=>(await import('/src/CE_Application/stores/panels.js')).selectComponent(id),id);
    const dock=page.locator('.screen-dock');await dock.waitFor();
    await dock.locator('.groups').getByRole('button',{name:'Motion',exact:true}).click();
    await dock.locator('input[type="file"]').setInputFiles({name:'two-frames.gif',mimeType:'image/gif',buffer:gifFixture()});
    await page.waitForTimeout(500);
    assert.equal(await dock.locator('.number-cell').filter({has:page.locator('.nc-label',{hasText:'Sheet frames'})}).locator('input').inputValue(),'0','GIF import clears old sprite-sheet count');
    const canvas=page.locator(`[data-control-id="${id}"] canvas.lcd-graphic`).first();await canvas.waitFor();
    const samples=new Set();
    for(let i=0;i<10;i++){samples.add(await canvas.evaluate(c=>c.toDataURL()));await page.waitForTimeout(85);}
    assert.ok(samples.size>1,`${index?'LCD':'Pixel'} GIF advances with reduced motion; got ${samples.size} distinct frame(s)`);
    console.log('ok',index?'LCD':'Pixel','GIF advances with reduced motion');
    await dock.locator('.property-cell').filter({has:page.locator('.property-label',{hasText:/^Loop$/})}).getByRole('switch').click();
    await page.waitForTimeout(500);
    const stopped=await canvas.evaluate(c=>c.toDataURL());await page.waitForTimeout(350);
    assert.equal(await canvas.evaluate(c=>c.toDataURL()),stopped,'Loop off holds final frame');
    await dock.locator('.property-cell').filter({has:page.locator('.property-label',{hasText:/^Loop$/})}).getByRole('switch').click();
    const resumed=new Set();
    for(let i=0;i<8;i++){resumed.add(await canvas.evaluate(c=>c.toDataURL()));await page.waitForTimeout(75);}
    assert.ok(resumed.size>1,'Loop on resumes advancing');
  }
  assert.deepEqual(errors,[]);
  console.log('ok GIF import, loop stop/resume and no browser errors');
}finally{await browser.close();await server.close();}
