const assert=require('node:assert/strict');
const {Battle,unit,dist,neutral}=require('../outputs/arena.js');
const b=new Battle('coop',{random:()=>.43});
for(let i=0;i<19000&&!['ended'].includes(b.phase);i++){
 const inputs=b.fighters.map((p,j)=>{
   const ally=b.fighters[1-j],target=b.boss.shield?b.pylons[j]:{x:j?760:520,y:390};
   let desired=target,link=b.boss.shield&&dist(p,target)<75;
   if(ally.down){desired=ally;link=dist(p,ally)<88;}
   const danger=b.warnings.find(w=>dist(p,w)<w.r+42);
   let dash=false;
   if(danger){desired={x:p.x,y:p.y+(p.y>440?-150:150)};link=false;dash=danger.life<.6;}
   const v=unit(desired.x-p.x,desired.y-p.y),moving=dist(p,desired)>12;
   return{x:moving?v.x:0,y:moving?v.y:0,attack:true,skill:i%380===0,dash,link};
 });
 b.step(1/120,inputs);
}
console.log(JSON.stringify({winner:b.winner,elapsed:b.elapsed,hp:b.fighters.map(p=>p.hp),bossHp:b.boss.hp,stats:b.stats},null,2));
assert.equal(b.winner,'team','Coordinated movement, pylons and skills must be able to win a complete unmodified match.');
