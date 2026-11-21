/* Simulation has no browser dependencies; fixed-step inputs also make it testable. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ArenaCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const unit = (x, y) => { const n = Math.hypot(x, y); return n ? { x: x / n, y: y / n } : { x: 1, y: 0 }; };
  const neutral = () => ({ x: 0, y: 0, attack: false, dash: false, skill: false, link: false });
  const BOUNDS = { left: 85, right: 1195, top: 205, bottom: 630 };
  class Battle {
    constructor(mode, options = {}) {
      this.mode = mode; this.monsterSlot = options.monsterSlot || 0; this.onEvent = options.onEvent || (() => {});
      this.random = options.random || Math.random; this.scores = [0, 0]; this.round = 1;
      this.totalTime = 0; this.stats = { damage: [0, 0], sync: 0, revives: 0 }; this.setup();
    }
    emit(type, data = {}) { this.onEvent({ type, ...data }); }
    fighter(id, x, y, monster = false) {
      const maxHp = monster ? 440 : this.mode === 'kaiju' ? 180 : this.mode === 'coop' ? 130 : 100;
      return { id, x, y, monster, r: monster ? 40 : 24, hp: maxHp, maxHp, fx: id ? -1 : 1, fy: 0,
        attackCd: 0, dashCd: 0, skillCd: 0, linkCd: 0, attackTime: 0, dashTime: 0, invuln: 0,
        hurt: 0, energy: 100, ultimate: 0, combo: 0, comboTimer: 0, guard: false, down: false, revive: 0, walk: 0, dashHit: new Set(), prev: neutral() };
    }
    setup() {
      this.phase = 'countdown'; this.countdown = 2.8; this.time = this.mode === 'duel' ? 75 : this.mode === 'coop' ? 150 : 120;
      this.elapsed = 0; this.projectiles = []; this.warnings = []; this.effects = []; this.pylons = [{ x: 245, y: 420, charge: 0 }, { x: 1035, y: 420, charge: 0 }];
      this.fighters = [this.fighter(0, 360, 450, this.mode === 'kaiju' && this.monsterSlot === 0), this.fighter(1, 920, 450, this.mode === 'kaiju' && this.monsterSlot === 1)];
      if (this.mode === 'coop') { this.fighters[0].x = 390; this.fighters[1].x = 890; this.boss = { x: 640, y: 345, r: 56, hp: 680, maxHp: 680, shield: true, exposed: 0, phase: 1, cycle: 2.6, hurt: 0, anim: 0 }; }
      this.generators = [{ x: 290, y: 300, hp: 100, maxHp: 100 }, { x: 640, y: 555, hp: 100, maxHp: 100 }, { x: 990, y: 300, hp: 100, maxHp: 100 }];
      this.syncCharge = 0; this.syncShots = [-99, -99]; this.boss = this.mode === 'coop' ? this.boss : null;
    }
    nextRound() { if (this.phase !== 'round') return; this.round++; this.setup(); }
    enemy(p) { return this.mode === 'coop' ? this.boss : this.fighters[1 - p.id]; }
    aimTarget(p) {
      const enemy = this.enemy(p);
      if (!p.monster) return enemy;
      const nearby = this.generators.filter(g => g.hp > 0).sort((a, b) => dist(p, a) - dist(p, b))[0];
      return nearby && dist(p, nearby) < dist(p, enemy) * .85 ? nearby : enemy;
    }
    hit(target, amount, source, knock = 0) {
      if (!target || target.hp <= 0 || target.invuln > 0) return false;
      if (target === this.boss && target.shield) amount *= .16;
      if (target.guard && target.energy > 5) { amount *= .3; target.energy = Math.max(0, target.energy - amount * 2); this.emit('guard', { x: target.x, y: target.y }); }
      amount = Math.round(amount * 10) / 10;
      target.hp = Math.max(0, target.hp - amount); target.hurt = .18;
      if ('invuln' in target) target.invuln = .16;
      if (source && source.id !== undefined) this.stats.damage[source.id] += amount;
      if (source && source.id !== undefined && 'ultimate' in source) source.ultimate = clamp(source.ultimate + amount * .72, 0, 100);
      if (source && knock && target.id !== undefined) { const v = unit(target.x - source.x, target.y - source.y); target.x = clamp(target.x + v.x * knock, BOUNDS.left + target.r, BOUNDS.right - target.r); target.y = clamp(target.y + v.y * knock, BOUNDS.top + target.r, BOUNDS.bottom - target.r); }
      this.emit('hit', { x: target.x, y: target.y, amount, heavy: amount > 20, color: target === this.boss && target.shield ? '#91a2b0' : '#f1ead2' });
      if (this.mode === 'coop' && target.id !== undefined && target.hp <= 0) { target.down = true; this.emit('toast', { text: `P${target.id + 1} 倒地！搭档靠近并按住协作键救援` }); }
      return true;
    }
    fire(p, spread = 0, damageScale = 1, kind = null) {
      const target = this.aimTarget(p);
      const v = unit(target.x - p.x, target.y - p.y), angle = Math.atan2(v.y, v.x) + spread, speed = p.monster ? 340 : 650;
      this.projectiles.push({ x: p.x + v.x * (p.r + 10), y: p.y + v.y * (p.r + 10), vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: p.monster ? 17 : 7, damage: (p.monster ? 25 : this.mode === 'coop' ? 28 : 19) * damageScale, life: 2.6, owner: p.id, kind: kind || (p.monster ? 'rock' : 'bolt') });
      this.emit('shot', { x: p.x, y: p.y, burst: kind === 'burst' });
    }
    attack(p) {
      p.attackCd = p.monster ? .7 : .43; p.attackTime = .25;
      const reach = p.monster ? 125 : 93;
      const candidates = [this.enemy(p)];
      if (p.monster) candidates.push(...this.generators.filter(g => g.hp > 0));
      let landed = false, landedTarget = null;
      for (const target of candidates) {
        if (dist(p, target) < reach + (target.r || 20)) {
          const v = unit(target.x - p.x, target.y - p.y);
          if (v.x * p.fx + v.y * p.fy > -.15) {
            const next = p.comboTimer > 0 ? p.combo + 1 : 1;
            const scale = [1, 1.15, 1.3, 1.55][Math.min(3, next - 1)];
            if (this.hit(target, (p.monster ? 23 : 12) * scale, p, p.monster ? 25 + (next >= 4 ? 12 : 0) : 12 + (next >= 4 ? 8 : 0))) {
              landed = true;
              landedTarget ||= target;
            }
          }
        }
      }
      if (landed) {
        const next = p.comboTimer > 0 ? p.combo + 1 : 1;
        p.combo = next >= 4 ? 0 : next;
        p.comboTimer = next >= 4 ? 0 : 1.1;
        this.emit('combo', { x: landedTarget.x, y: landedTarget.y, count: next, finisher: next >= 4 });
      }
      if (!landed && p.comboTimer <= 0) p.combo = 0;
      this.emit('swing', { x: p.x, y: p.y, monster: p.monster });
    }
    step(dt, inputs) {
      if (this.phase === 'ended' || this.phase === 'round') return;
      if (this.phase === 'countdown') { this.countdown -= dt; if (this.countdown <= 0) { this.phase = 'playing'; this.emit('toast', { text: '开战！' }); } return; }
      this.time = Math.max(0, this.time - dt); this.elapsed += dt; this.totalTime += dt;
      for (const p of this.fighters) {
        const input = inputs[p.id] || neutral();
        for (const key of ['attackCd', 'dashCd', 'skillCd', 'linkCd', 'attackTime', 'invuln', 'hurt', 'comboTimer']) p[key] = Math.max(0, p[key] - dt);
        if (p.comboTimer <= 0) p.combo = 0;
        p.energy = Math.min(100, p.energy + dt * (input.link ? 0 : 20)); p.guard = false;
        if (p.down) { p.prev = { ...input }; continue; }
        const magnitude = Math.hypot(input.x, input.y), moving = magnitude > .12;
        const move = moving ? unit(input.x, input.y) : { x: 0, y: 0 };
        if (moving && p.dashTime <= 0) { p.fx = move.x; p.fy = move.y; }
        if (!moving && p.dashTime <= 0) { const target = this.aimTarget(p); const v = unit(target.x - p.x, target.y - p.y); p.fx = v.x; p.fy = v.y; }
        if (input.dash && !p.prev.dash && p.dashCd <= 0) { p.dashTime = p.monster ? .4 : .19; p.dashCd = p.monster ? 3.5 : 1.65; p.invuln = p.monster ? .15 : .3; p.dashHit.clear(); this.emit('dash', { x: p.x, y: p.y }); }
        const speed = p.monster ? 155 : 245;
        if (p.dashTime > 0) {
          p.dashTime = Math.max(0, p.dashTime - dt); p.x += p.fx * (p.monster ? 580 : 850) * dt; p.y += p.fy * (p.monster ? 580 : 850) * dt;
          if (p.monster) for (const t of [this.enemy(p), ...this.generators.filter(g => g.hp > 0)]) { if (!p.dashHit.has(t) && dist(p, t) < p.r + (t.r || 24)) { this.hit(t, 32, p, 40); p.dashHit.add(t); } }
        } else {
          p.guard = this.mode === 'duel' && input.link && p.energy > 5;
          p.x += move.x * speed * Math.min(1, magnitude) * dt * (p.guard ? .4 : 1); p.y += move.y * speed * Math.min(1, magnitude) * dt * (p.guard ? .4 : 1);
          if (moving) p.walk += dt * 11;
        }
        p.x = clamp(p.x, BOUNDS.left + p.r, BOUNDS.right - p.r); p.y = clamp(p.y, BOUNDS.top + p.r, BOUNDS.bottom - p.r);
        if (input.attack && p.attackCd <= 0 && p.dashTime <= 0 && !p.guard) this.attack(p);
        if (input.skill && !p.prev.skill && p.skillCd <= 0) {
          const burst = p.ultimate >= 100;
          p.skillCd = p.monster ? (burst ? 4.8 : 3.4) : this.mode === 'coop' ? (burst ? 4.2 : 2.8) : (burst ? 4.4 : 3.1);
          if (burst) {
            p.ultimate = 0;
            for (const spread of [-.24, -.12, 0, .12, .24]) this.fire(p, spread, .72, 'burst');
            this.emit('burst', { x: p.x, y: p.y });
          } else this.fire(p);
          if (this.mode === 'coop') { this.syncShots[p.id] = this.elapsed; if (Math.abs(this.syncShots[0] - this.syncShots[1]) < .65) { this.syncShots = [-99, -99]; this.stats.sync++; if (this.boss.exposed > 0) { this.hit(this.boss, 50, p); this.boss.exposed = Math.min(12, this.boss.exposed + 1); this.emit('toast', { text: '同步射击！共振追加 50 伤害' }); } else { this.emit('toast', { text: '射击同步成功！先占领两端装置，解除护盾' }); } } }
        }
        if (this.mode === 'kaiju' && input.link && !p.prev.link && p.linkCd <= 0) {
          p.linkCd = p.monster ? 7 : 8;
          if (p.monster) {
            this.effects.push({ kind: 'ring', x: p.x, y: p.y, radius: 180, life: .7, max: .7, color: '#ff9c65' });
            for (const t of [this.enemy(p), ...this.generators.filter(g => g.hp > 0)]) if (dist(p, t) < 195) this.hit(t, 30, p, 40);
            this.emit('roar', { x: p.x, y: p.y });
          } else {
            const enemy = this.enemy(p); this.effects.push({ kind: 'beam', x: p.x, y: p.y, tx: enemy.x, ty: enemy.y, life: .35, max: .35 });
            if (dist(p, enemy) < 700) this.hit(enemy, 47, p, 15); this.emit('beam', { x: p.x, y: p.y });
          }
        }
        p.prev = { ...input };
      }
      const [a, b] = this.fighters, overlap = a.r + b.r - dist(a, b);
      if (overlap > 0 && !a.down && !b.down) { const v = unit(b.x - a.x, b.y - a.y); a.x -= v.x * overlap * .5; a.y -= v.y * overlap * .5; b.x += v.x * overlap * .5; b.y += v.y * overlap * .5; }
      for (const p of this.fighters) { p.x = clamp(p.x, BOUNDS.left + p.r, BOUNDS.right - p.r); p.y = clamp(p.y, BOUNDS.top + p.r, BOUNDS.bottom - p.r); }
      if (this.mode === 'coop') this.updateCoop(dt, inputs);
      for (const g of this.generators) g.hurt = Math.max(0, (g.hurt || 0) - dt);
      this.updateProjectiles(dt);
      for (const e of this.effects) e.life -= dt;
      this.effects = this.effects.filter(e => e.life > 0);
      this.checkEnd();
    }
    updateCoop(dt, inputs) {
      const boss = this.boss; boss.hurt = Math.max(0, boss.hurt - dt); boss.anim += dt; boss.cycle -= dt;
      boss.phase = boss.hp < boss.maxHp * .32 ? 3 : boss.hp < boss.maxHp * .67 ? 2 : 1;
      if (boss.exposed > 0) { boss.exposed = Math.max(0, boss.exposed - dt); boss.shield = false; }
      else if (!boss.shield) { boss.shield = true; this.syncCharge = 0; this.emit('toast', { text: '护盾重启！再次分头启动共振装置' }); }
      const active = this.pylons.map(pylon => this.fighters.some(p => !p.down && dist(p, pylon) < 84 && inputs[p.id]?.link));
      this.pylons.forEach((p, i) => p.charge = active[i] ? 1 : 0);
      if (boss.shield) {
        this.syncCharge = clamp(this.syncCharge + (active.every(Boolean) ? dt : -dt * 1.6), 0, 1.3);
        if (this.syncCharge >= 1.3) { boss.shield = false; boss.exposed = 11; this.syncCharge = 0; this.stats.sync++; this.emit('toast', { text: '共振破盾！11 秒输出窗口 · 同时释放技能追加伤害' }); this.emit('shieldbreak', { x: boss.x, y: boss.y }); }
      }
      // A downed partner remains rescuable; no hidden bleed-out timer.
      for (const p of this.fighters.filter(p => p.down)) {
        const ally = this.fighters[1 - p.id]; p.revive = !ally.down && dist(p, ally) < 92 && inputs[ally.id]?.link ? p.revive + dt : Math.max(0, p.revive - dt);
        if (p.revive >= 1.6) { p.down = false; p.hp = p.maxHp * .55; p.revive = 0; p.invuln = 2; this.stats.revives++; this.emit('toast', { text: `P${p.id + 1} 已被救起！` }); }
      }
      if (boss.cycle <= 0) {
        boss.cycle = boss.shield ? 2.7 - boss.phase * .3 : 3;
        const targets = this.fighters.filter(p => !p.down);
        for (const p of targets) this.warnings.push({ x: p.x, y: p.y, r: boss.phase === 3 ? 90 : 76, life: 1.05, max: 1.05, damage: 28 });
        if (boss.phase >= 2) this.warnings.push({ x: 640 + (this.random() - .5) * 650, y: 420 + (this.random() - .5) * 210, r: 82, life: 1.25, max: 1.25, damage: 25 });
        const count = 5 + boss.phase * 2, offset = this.random() * Math.PI * 2;
        for (let i = 0; i < count; i++) { const angle = offset + i * Math.PI * 2 / count; this.projectiles.push({ x: boss.x, y: boss.y, vx: Math.cos(angle) * (140 + boss.phase * 20), vy: Math.sin(angle) * (140 + boss.phase * 20), r: 9, life: 4, damage: 15, owner: 'boss', kind: 'orb' }); }
      }
      for (const w of this.warnings) { w.life -= dt; if (w.life <= 0) { for (const p of this.fighters) if (!p.down && dist(p, w) < w.r + p.r * .5) this.hit(p, w.damage, boss, 20); this.effects.push({ kind: 'ring', x: w.x, y: w.y, radius: w.r, life: .45, max: .45, color: '#ff776b' }); this.emit('stomp', { x: w.x, y: w.y }); } }
      this.warnings = this.warnings.filter(w => w.life > 0);
    }
    updateProjectiles(dt) {
      for (const b of this.projectiles) {
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        let targets;
        if (b.owner === 'boss') targets = this.fighters.filter(p => !p.down);
        else if (this.mode === 'coop') targets = [this.boss];
        else targets = [this.fighters[1 - b.owner], ...(this.fighters[b.owner].monster ? this.generators.filter(g => g.hp > 0) : [])];
        for (const t of targets) if (dist(b, t) < b.r + (t.r || 25)) { this.hit(t, b.damage, b.owner === 'boss' ? this.boss : this.fighters[b.owner], 7); b.life = 0; break; }
        if (b.x < 50 || b.x > 1230 || b.y < 180 || b.y > 660) b.life = 0;
      }
      this.projectiles = this.projectiles.filter(b => b.life > 0);
    }
    finish(winner, reason) { this.phase = 'ended'; this.winner = winner; this.reason = reason; this.emit('end', { winner, reason }); }
    checkEnd() {
      if (this.mode === 'duel') {
        if (this.fighters.some(p => p.hp <= 0) || this.time <= 0) {
          const [a, b] = this.fighters, winner = Math.abs(a.hp - b.hp) < .1 ? -1 : a.hp > b.hp ? 0 : 1;
          if (winner >= 0) this.scores[winner]++;
          if (this.scores.some(s => s >= 2)) this.finish(winner, '率先获得两回合胜利');
          else { this.phase = 'round'; this.roundWinner = winner; this.emit('round', { winner }); }
        }
      } else if (this.mode === 'coop') {
        if (this.boss.hp <= 0) this.finish('team', '双星共振，巨兽已被击败');
        else if (this.fighters.every(p => p.down)) this.finish('boss', '两位英雄均已倒地');
        else if (this.time <= 0) this.finish('boss', '挑战时间结束，巨兽仍在暴走');
      } else {
        const monster = this.fighters[this.monsterSlot], hero = this.fighters[1 - this.monsterSlot];
        if (monster.hp <= 0) this.finish(hero.id, '英雄击退巨兽，城市安全了');
        else if (hero.hp <= 0) this.finish(monster.id, '巨兽击倒了守护英雄');
        else if (this.generators.every(g => g.hp <= 0)) this.finish(monster.id, '三座能源设施全部被摧毁');
        else if (this.time <= 0) this.finish(hero.id, '守住 120 秒，城市援军抵达');
      }
    }
  }
  return { Battle, BOUNDS, clamp, dist, unit, neutral };
});
