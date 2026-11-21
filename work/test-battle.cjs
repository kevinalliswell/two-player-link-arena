const assert = require('node:assert/strict');
const { Battle, neutral } = require('../outputs/arena.js');
let checks = 0;
function test(name, run) { run(); checks++; console.log(`PASS ${name}`); }
function tick(b, seconds, input = [neutral(), neutral()]) { for (let t = 0; t < seconds; t += 1 / 120) b.step(1 / 120, typeof input === 'function' ? input(b, t) : input); }
function playing(mode, options) { const b = new Battle(mode, options); tick(b, 3); assert.equal(b.phase, 'playing'); return b; }
test('countdown freezes match timer, then both players move independently', () => {
  const b = new Battle('duel'); tick(b, 2); assert.equal(b.time, 75); tick(b, 1);
  const x = b.fighters.map(p => p.x); tick(b, .2, [{ ...neutral(), x: 1 }, { ...neutral(), x: -1 }]);
  assert(b.fighters[0].x > x[0]); assert(b.fighters[1].x < x[1]);
});
test('attack reaches only close targets, hold repeats, guard reduces damage', () => {
  const b = playing('duel'); tick(b, 1, [{ ...neutral(), attack: true }, neutral()]); assert.equal(b.fighters[1].hp, 100);
  b.fighters[0].x = 550; b.fighters[1].x = 630; tick(b, 1, [{ ...neutral(), attack: true }, neutral()]); assert(b.fighters[1].hp <= 76);
  const c = playing('duel'); c.fighters[0].x = 550; c.fighters[1].x = 630; tick(c,.05,[neutral(),{...neutral(),link:true}]); tick(c,.05,[{...neutral(),attack:true},{...neutral(),link:true}]); assert(c.fighters[1].hp > 95);
});
test('dash has cooldown, skill needs release, projectile damages opponent', () => {
  const b = playing('duel'); const x = b.fighters[0].x; tick(b,.2,[{...neutral(),x:1,dash:true,skill:true},neutral()]); assert(b.fighters[0].x > x+130); assert(b.fighters[0].dashCd>1);
  tick(b,1,[{...neutral(),skill:true},neutral()]); assert(b.fighters[1].hp<100); const hp=b.fighters[1].hp; tick(b,4,[{...neutral(),skill:true},neutral()]); assert.equal(b.fighters[1].hp,hp);
});
test('duel completes best of three and resets next round', () => {
  const b = playing('duel'); b.fighters[1].hp=0; tick(b,.01); assert.equal(b.phase,'round'); assert.deepEqual(b.scores,[1,0]); b.nextRound(); assert.equal(b.round,2); assert.equal(b.fighters[1].hp,100); tick(b,3); b.fighters[1].hp=0; tick(b,.01); assert.equal(b.phase,'ended'); assert.equal(b.winner,0);
});
test('duel timeout compares health; equal health creates replay', () => {
  const b=playing('duel'); b.time=.01;tick(b,.1);assert.equal(b.roundWinner,-1);assert.deepEqual(b.scores,[0,0]);
  const c=playing('duel');c.fighters[0].hp=60;c.time=.01;tick(c,.1);assert.equal(c.roundWinner,1);
});
test('co-op requires two occupied pylons; shield breaks then returns', () => {
  const b=playing('coop');b.boss.cycle=100;b.fighters[0].x=245;b.fighters[0].y=420;
  tick(b,2,[{...neutral(),link:true},{...neutral(),link:true}]);assert(b.boss.shield);
  b.fighters[1].x=1035;b.fighters[1].y=420;tick(b,1.4,[{...neutral(),link:true},{...neutral(),link:true}]);assert(!b.boss.shield);assert(b.boss.exposed>10);tick(b,11.3);assert(b.boss.shield);
});
test('co-op simultaneous skills give bonus only during exposure', () => {
  const b=playing('coop');b.boss.cycle=100;b.boss.shield=false;b.boss.exposed=10;const hp=b.boss.hp;
  tick(b,.02,[{...neutral(),skill:true},{...neutral(),skill:true}]);assert.equal(b.boss.hp,hp-50);assert.equal(b.stats.sync,1);tick(b,1);assert(b.boss.hp<hp-50);
});
test('co-op partner rescue restores health; double knockout loses', () => {
  const b=playing('coop');b.boss.cycle=100;const [a,c]=b.fighters;a.x=400;c.x=450;a.y=c.y=450;b.hit(a,200,b.boss);assert(a.down);tick(b,1.7,[neutral(),{...neutral(),link:true}]);assert(!a.down);assert(a.hp>0);assert.equal(b.stats.revives,1);
  a.invuln=0;b.hit(a,200,b.boss);b.hit(c,200,b.boss);tick(b,.02);assert.equal(b.winner,'boss');
});
test('co-op boss victory and time limit both resolve', () => {const b=playing('coop');b.boss.hp=0;tick(b,.02);assert.equal(b.winner,'team');const c=playing('coop');c.time=.01;tick(c,.02);assert.equal(c.winner,'boss');});
test('boss telegraphs cause damage and phases scale',()=>{const b=playing('coop');b.boss.hp=100;tick(b,1);assert.equal(b.boss.phase,3);tick(b,2.5);assert(b.warnings.length>0||b.projectiles.length>0);const hp=b.fighters[0].hp;tick(b,3);assert(b.fighters[0].hp<hp);});
test('kaiju role swap, asymmetric stats and facility destruction win',()=>{const b=playing('kaiju',{monsterSlot:1});assert(b.fighters[1].monster);assert.equal(b.fighters[1].hp,440);assert.equal(b.fighters[0].hp,180);b.generators.forEach(g=>g.hp=0);tick(b,.02);assert.equal(b.winner,1);});
test('kaiju melee and roar can destroy facilities',()=>{const b=playing('kaiju');b.fighters[0].x=290;b.fighters[0].y=370;tick(b,3.5,(b,t)=>[{...neutral(),attack:true,link:t<.05},neutral()]);assert(b.generators[0].hp<40);});
test('kaiju charge deals damage and hero beam has distinct cooldown',()=>{const b=playing('kaiju');b.fighters[0].x=450;b.fighters[1].x=620;tick(b,.4,[{...neutral(),x:1,dash:true},neutral()]);assert(b.fighters[1].hp<180);tick(b,.02,[neutral(),{...neutral(),link:true}]);assert(b.fighters[0].hp<440);assert(b.fighters[1].linkCd>7);});
test('kaiju hero can win by survival or knockout; monster can KO hero',()=>{for(const type of ['time','monster','hero']){const b=playing('kaiju');if(type==='time')b.time=.01;else b.fighters[type==='monster'?0:1].hp=0;tick(b,.02);assert.equal(b.winner,type==='hero'?0:1);}});
test('arena boundaries hold and all simulation values remain finite',()=>{for(const mode of ['duel','coop','kaiju']){const b=playing(mode);for(let i=0;i<6000&&b.phase==='playing';i++){const t=i/120;b.step(1/120,b.fighters.map((p,j)=>({x:Math.sin(t*1.3+j),y:Math.cos(t*.7+j),attack:true,dash:i%240===0,skill:i%420===0,link:i%600<150})));for(const p of b.fighters){assert(Number.isFinite(p.x)&&Number.isFinite(p.hp));assert(p.x>=85+p.r-.1&&p.x<=1195-p.r+.1);assert(p.y>=205+p.r-.1&&p.y<=630-p.r+.1);}}}});
console.log(`\n${checks} simulation tests passed.`);
