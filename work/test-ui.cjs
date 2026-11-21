// A local DOM/input harness exercises the production controller without a browser.
const vm = require('node:vm');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { createCanvas } = require('C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1119-907-0_26.1119.907.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules/@napi-rs/canvas');
const source = fs.readFileSync('outputs/index.html','utf8');
const elements = new Map();
let document;
class Element {
  constructor(tagName = 'div', id = '') { this.tagName=tagName.toUpperCase();this.id=id;this.children=[];this.dataset={};this.hidden=false;this.style={};this.value='';this.textContent='';this.className='';this.listeners={};const classes=new Set();this.classList={add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)}; }
  set innerHTML(value) {this._html=value;this.children=[];for(const m of value.matchAll(/<(button|span)[^>]*id="([^"]+)"[^>]*>(.*?)<\//g)){const e=new Element(m[1],m[2]);e.textContent=m[3];this.append(e);elements.set(e.id,e);}}
  get innerHTML(){return this._html||'';}
  append(e){this.children.push(e);}
  replaceChildren(...e){this.children=e;}
  get options(){return this.children;}
  focus(){document.activeElement=this;}
  querySelectorAll(selector){const children=this.children.flatMap(e=>[e,...e.querySelectorAll('*')]);return selector==='*'?children:children.filter(e=>e.tagName==='BUTTON');}
  querySelector(s){return this.querySelectorAll(s)[0]||null;}
  addEventListener(name,fn){(this.listeners[name]||=[]).push(fn);}
  dispatchEvent(e){this['on'+e.type]?.({target:this,...e});this.listeners[e.type]?.forEach(fn=>fn(e));}
  click(){this.onclick?.({target:this,preventDefault(){}});}
}
for(const m of source.matchAll(/<([a-z0-9-]+)\b[^>]*\bid="([^"]+)"[^>]*>/gi)){const e=new Element(m[1],m[2]);e.hidden=/\bhidden\b/.test(m[0]);elements.set(e.id,e);}
for(const id of ['game','poster']) { const e=elements.get(id); e.canvas=createCanvas(id==='game'?1280:620,id==='game'?720:410);e.getContext=type=>e.canvas.getContext(type); }
const cards=['duel','coop','kaiju'].map(mode=>{const e=new Element('button');e.dataset.mode=mode;return e;});
const winEvents={},docEvents={};let raf,now=0,pads=[];
document={activeElement:null,hidden:false,fullscreenElement:null,getElementById:id=>elements.get(id)||null,createElement:tag=>new Element(tag),querySelectorAll:s=>s==='[data-mode]'||s==='.mode-card'?cards:[],querySelector:s=>cards[0],addEventListener:(name,fn)=>(docEvents[name]||=[]).push(fn)};
const sandbox={document,navigator:{getGamepads:()=>pads},console,Math,Set,Map,Event:class{constructor(type){this.type=type;}},addEventListener:(name,fn)=>(winEvents[name]||=[]).push(fn),requestAnimationFrame:fn=>raf=fn};
sandbox.window=sandbox;sandbox.globalThis=sandbox;sandbox.scrollTo=()=>{};vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('outputs/arena.js','utf8'),sandbox);vm.runInContext(fs.readFileSync('outputs/game.js','utf8'),sandbox);
const el=id=>elements.get(id),snapshot=()=>sandbox.LinkArena.snapshot();
function frames(seconds){for(let t=0;t<seconds;t+=1/60){now+=1000/60;raf(now);}}
function key(code,type='keydown'){for(const fn of winEvents[type]||[])fn({code,repeat:false,preventDefault(){}});}
function action(text){const e=el('modal-actions').children.find(e=>e.textContent.includes(text));assert(e,`Missing action ${text}`);e.click();}
function pad(index){return{index,id:`Xbox Controller ${index}`,mapping:'standard',connected:true,axes:[0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};}
function test(name,fn){fn();console.log('PASS '+name);}
test('all three menu cards open complete rules and start real match',()=>{
  for(const card of cards){card.click();assert(!el('modal').hidden);assert(el('modal-content').innerHTML.includes('rule-list'));action('开始');frames(3.1);assert.equal(snapshot().mode,card.dataset.mode);assert.equal(snapshot().phase,'playing');key('Escape');action('返回菜单');assert.equal(snapshot().screen,'menu');}
});
test('keyboard movement, actions, pause freeze, rules and restart',()=>{
  cards[0].click();action('开始');frames(3);const x=snapshot().fighters[0].x;key('KeyD');key('ArrowLeft');frames(.5);key('KeyD','keyup');key('ArrowLeft','keyup');assert(snapshot().fighters[0].x>x);assert(snapshot().fighters[1].x<920);key('KeyL');frames(1);key('KeyL','keyup');assert(snapshot().fighters[1].hp<100);
  key('Escape');const t=snapshot().time;frames(1);assert.equal(snapshot().time,t);action('继续');el('rules-button').click();assert(snapshot().paused);action('继续');key('Escape');action('重新开局');action('确认');assert.equal(snapshot().phase,'countdown');assert.equal(snapshot().fighters[1].hp,100);frames(3);
});
test('requested split keyboard controls move and trigger separate players',()=>{
  pads=[];cards[0].click();action('开始');frames(3);const start=snapshot().fighters.map(p=>({x:p.x,y:p.y}));
  key('KeyW');key('ArrowRight');frames(.25);key('KeyW','keyup');key('ArrowRight','keyup');assert(snapshot().fighters[0].y<start[0].y);assert(snapshot().fighters[1].x>start[1].x);
  key('Digit2');frames(.08);key('Digit2','keyup');key('Digit8');frames(.08);key('Digit8','keyup');assert(snapshot().fighters[0].dashCd>0);assert(snapshot().fighters[1].dashCd>0);
  key('Digit3');frames(.08);key('Digit3','keyup');key('Digit9');frames(.08);key('Digit9','keyup');assert(snapshot().fighters[0].skillCd>0);assert(snapshot().fighters[1].skillCd>0);
  key('Escape');action('返回菜单');
});
test('dual Xbox mapping, exclusive assignment and deadzone',()=>{
  cards[0].click();action('开始');frames(3);
  pads=[pad(0),pad(1)];frames(.1);assert(snapshot().devices[0].includes('手柄 1'));assert(snapshot().devices[1].includes('手柄 2'));const x=snapshot().fighters[0].x;pads[0].axes[0]=.1;frames(.2);assert.equal(snapshot().fighters[0].x,x);pads[0].axes[0]=1;pads[1].axes[0]=-1;frames(.3);assert(snapshot().fighters[0].x>x);assert(snapshot().fighters[1].x<920);pads.forEach(p=>p.axes=[0,0]);
  el('device0').value='pad:1';el('device0').dispatchEvent(new sandbox.Event('change'));assert(snapshot().devices[0].includes('手柄 2'));el('device1').value='pad:1';el('device1').dispatchEvent(new sandbox.Event('change'));assert(snapshot().devices[0].includes('键盘'));assert(snapshot().devices[1].includes('手柄 2'));
  el('device0').value='auto';el('device0').dispatchEvent(new sandbox.Event('change'));el('device1').value='auto';el('device1').dispatchEvent(new sandbox.Event('change'));frames(.1);
});
test('disconnect pauses, does not steal surviving pad, keyboard fallback and reconnect',()=>{
  const before=snapshot().devices;const assigned=before[0].includes('手柄 1')?0:1;const keep=1-assigned;pads=[pad(keep)];frames(.1);assert(snapshot().paused);assert(snapshot().devices[1].includes(`手柄 ${keep+1}`));action('继续');const x=snapshot().fighters[0].x;key('KeyA');frames(.2);key('KeyA','keyup');assert(snapshot().fighters[0].x<x);pads=[pad(0),pad(1)];frames(.1);assert(snapshot().devices.every(d=>d.includes('手柄')));
});
test('gamepad A attacks, X skill, B dash, Start pause/resume',()=>{
  const p=pads.find(p=>snapshot().devices[0].includes(`手柄 ${p.index+1}`));p.buttons[0].pressed=true;p.buttons[1].pressed=true;p.buttons[2].pressed=true;frames(.1);assert(snapshot().fighters[0].attackCd>0||snapshot().fighters[0].dashCd>0);assert(snapshot().fighters[0].skillCd>0);p.buttons.forEach(b=>b.pressed=false);frames(.1);p.buttons[9].pressed=true;frames(.05);assert(snapshot().paused);p.buttons[9].pressed=false;frames(.05);p.buttons[9].pressed=true;frames(.05);assert(!snapshot().paused);p.buttons[9].pressed=false;frames(.05);
});
test('blur pauses in both countdown and live match',()=>{
  winEvents.blur.forEach(fn=>fn());assert(snapshot().paused);action('重新开局');action('确认');winEvents.blur.forEach(fn=>fn());assert(snapshot().paused);action('返回菜单');
});
test('two gamepads use Y together to break the co-op shield',()=>{
  cards[1].click();action('开始');frames(3);
  const assigned=snapshot().devices.map(d=>pads.find(p=>d.includes(`手柄 ${p.index+1}`)));
  assigned[0].axes[0]=-1;assigned[1].axes[0]=1;frames(.6);assigned.forEach(p=>{p.axes=[0,0];p.buttons[3].pressed=true;});frames(1.5);assert(!snapshot().boss.shield);assigned.forEach(p=>p.buttons[3].pressed=false);key('Escape');action('返回菜单');
});
test('real keyboard attacks reach round and final results; rematch resets scores',()=>{
  cards[0].click();action('开始');frames(3);for(let round=0;round<2;round++){key('KeyD');key('KeyJ');frames(7);key('KeyD','keyup');key('KeyJ','keyup');assert.equal(snapshot().phase,round?'ended':'round');if(!round){action('下一回合');frames(3);}}
  assert(el('modal-title').textContent.includes('P1'));action('再来一场');assert.equal(snapshot().scores[0],0);assert.equal(snapshot().phase,'countdown');key('Escape');action('返回菜单');
});
test('canvas renders menu poster and every battle mode without drawing errors',()=>{
  frames(.1);fs.writeFileSync('work/poster.png',el('poster').canvas.toBuffer('image/png'));
  for(const card of cards){card.click();action('开始');frames(4);fs.writeFileSync(`work/${card.dataset.mode}.png`,el('game').canvas.toBuffer('image/png'));key('Escape');action('返回菜单');}
});
console.log('\n10 controller / rendering checks passed (local DOM harness; not a browser or physical gamepad test).');



