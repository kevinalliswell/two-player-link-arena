(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const { Battle, clamp, unit } = ArenaCore;
  const canvas = $('game'), ctx = canvas.getContext('2d'), poster = $('poster'), pc = poster.getContext('2d');
  const colors = ['#67e4e0', '#ffab77'];
  const modes = {
    duel: { title: '擂台对决', label: '01 / VERSUS', hint: '面向对手出招 · 按住协作键可格挡', rules: [
      '<b>三局两胜。</b>每回合 75 秒，击倒对手获胜。时间到后剩余生命较多者获胜；平局加赛。',
      '<b>连击与必杀。</b>近战连续命中打出四连击，第四击是重型终结技；造成伤害会积攒必杀能量，蓄满后按技能键发射五发扇形爆发。',
      '<b>格挡。</b>按住协作键减伤 70%，消耗能量并降低移速；松开后能量自动恢复。'
    ] },
    coop: { title: '双星共振', label: '02 / TOGETHER', hint: '两端同时按住协作键破盾 · 靠近倒地搭档可救援', rules: [
      '<b>150 秒协力击败巨兽。</b>巨兽有三阶段，生命越低，弹幕与落点攻击越密集。红圈出现后，及时冲刺离开。',
      '<b>分头占点，按住协作键。</b>两人分别站在左右共振装置内，同时按住协作键 1.3 秒，解除护盾 11 秒。带盾时仅承受 16% 伤害。',
      '<b>同步射击 + 倒地救援。</b>破盾后，两人在 0.65 秒内释放技能，追加 50 伤害。搭档倒地时，靠近并按住协作键 1.6 秒救起；两人都倒地则失败。'
    ] },
    kaiju: { title: '巨兽警报', label: '03 / TITAN', hint: '怪兽：拆毁三座设施或击倒英雄 ｜ 英雄：击败巨兽或守住时间', rules: [
      '<b>怪兽 · 440 生命。</b>击倒英雄或摧毁全部三座能源设施即可获胜。攻击为重爪，冲刺为伤害冲撞，技能为投石，协作键为范围咆哮。',
      '<b>英雄 · 180 生命。</b>击败怪兽，或至少保住一座设施并存活 120 秒即可获胜。技能为追踪方向的能量弹，协作键为 700 范围内自动瞄准的高能光束。',
      '<b>不同体型，不同节奏。</b>怪兽速度慢但攻击范围大，咆哮可同时破坏附近设施；英雄用冲刺闪避，用远程技能牵制。'
    ] },
    adventure: { title: '普通探险', label: '04 / ADVENTURE', hint: '击败越来越多的小兵，收集装备，迎战逐波变强的小巨兽', rules: [
      '<b>普通探险。</b>从少量小兵开始，每一波敌人越来越多；第 4 波、第 8 波会出现带技能的小巨兽。',
      '<b>掉落装备。</b>击败小兵和巨兽会掉落装备，装备自动进入背包；初始 5 格，满了以后装备会留在战场上。',
      '<b>装备经济。</b>装备可以出售换金币，花金币可以把背包扩容到 6、7、8 格，最高 100 格。'
    ] }
  };
  let screen = 'menu', battle = null, paused = false, modalKind = '', currentMode = 'duel', monsterSlot = 0;
  let last = 0, accumulator = 0, globalTime = 0, toastTime = 0, shake = 0, particles = [], popups = [];
  const RESULT_HOLD_SECONDS = 10;
  let resultLockUntil = 0, resultLockButtons = [];
  let audioOn = false, audioContext = null, soundCooldown = 0, previousFocus = null;
  const keys = new Set(), selections = ['auto', 'auto'], selectedPads = [null, null], autoBindings = [null, null], padPrevious = new Map();
  let padSignature = '', connectedBefore = new Set(), navCooldown = 0, focusIndex = 0;
  const padNav = new Map(); // index -> { cooldown, focusIndex } 每只手柄独立导航焦点
  const keymaps = [
    { left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS', 'KeyZ'], attack: ['Digit1', 'Numpad1', 'KeyJ'], dash: ['Digit2', 'Numpad2', 'KeyK'], skill: ['Digit3', 'Numpad3', 'KeyL'], link: ['Digit4', 'Numpad4', 'KeyI'] },
    { left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'], attack: ['Digit7', 'Numpad7'], dash: ['Digit8', 'Numpad8'], skill: ['Digit9', 'Numpad9'], link: ['Digit0', 'Numpad0'] }
  ];
  function tone(freq, duration = .09, type = 'sine', volume = .045, end = freq * .65) {
    if (!audioOn) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume();
      const o = audioContext.createOscillator(), g = audioContext.createGain(), t = audioContext.currentTime;
      o.type = type; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, end), t + duration);
      g.gain.setValueAtTime(volume, t); g.gain.exponentialRampToValueAtTime(.001, t + duration); o.connect(g); g.connect(audioContext.destination); o.start(); o.stop(t + duration);
    } catch (_) { /* Audio is optional. */ }
  }
  $('sound').onclick = () => { audioOn = !audioOn; $('sound').textContent = `音效：${audioOn ? '开' : '关'}`; tone(620, .15, 'sine', .04, 820); };
  $('fullscreen').onclick = () => { const promise = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.(); promise?.catch(() => {}); };
  function showToast(text) { $('toast').textContent = text; $('toast').classList.add('show'); toastTime = 3.4; }
  function event(e) {
    if (e.type === 'toast') return showToast(e.text);
    if (e.type === 'hit') {
      popups.push({ x: e.x, y: e.y - 35, text: `${Math.round(e.amount)}`, color: e.color, life: .85 });
      burst(e.x, e.y, e.heavy ? 18 : 8, e.color); shake = Math.max(shake, e.heavy ? 6 : 3);
      if (soundCooldown <= 0) { tone(e.heavy ? 90 : 180, .12, 'triangle', .055); soundCooldown = .065; }
    }
    if (e.type === 'combo') {
      popups.push({ x: e.x, y: e.y - 60, text: e.finisher ? '终结！' : `${e.count} 连击`, color: e.finisher ? '#ffe08a' : '#d9ffff', life: 1.05 });
      burst(e.x, e.y, e.finisher ? 30 : 12, e.finisher ? '#ffe08a' : '#8af7ec');
      if (e.finisher) { shake = Math.max(shake, 11); tone(520, .24, 'triangle', .08, 120); showToast('四连终结！'); }
      else tone(350 + e.count * 90, .08, 'sine', .035, 620 + e.count * 100);
    }
    if (e.type === 'burst') { burst(e.x, e.y, 42, '#f8df91'); shake = Math.max(shake, 10); showToast('必杀爆发！'); tone(780, .35, 'sawtooth', .06, 140); }
    if (e.type === 'loot') showToast(`${e.item.name} 已入背包 · ${e.coins} 金币${e.full ? ' · 背包已满，去出售装备' : ''}`);
    if (e.type === 'dash') burst(e.x, e.y, 9, '#a5eae6');
    if (e.type === 'shot') tone(720, .1, 'triangle', .025, 260);
    if (e.type === 'swing') tone(e.monster ? 90 : 260, .08, 'sawtooth', .018);
    if (['stomp', 'roar', 'shieldbreak', 'beam'].includes(e.type)) { burst(e.x, e.y, 26, e.type === 'shieldbreak' ? '#67e4e0' : '#ffc787'); shake = 8; tone(80, .28, 'triangle', .08, 35); }
    if (e.type === 'round') roundModal(e.winner);
    if (e.type === 'end') endModal(e.winner, e.reason);
  }
  function burst(x, y, count, color) { for (let i = 0; i < count; i++) { const a = Math.random() * Math.PI * 2, speed = 35 + Math.random() * 190; particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: .25 + Math.random() * .4, color, r: 1 + Math.random() * 3 }); } }
  function resultLockActive() { return resultLockUntil > globalTime + .0001; }
  function clearResultLock() { resultLockUntil = 0; resultLockButtons = []; }
  function beginResultLock() { resultLockUntil = globalTime + RESULT_HOLD_SECONDS; resultLockButtons = []; }
  function updateResultLock() {
    if (!resultLockButtons.length) return;
    const remaining = Math.max(0, Math.ceil(resultLockUntil - globalTime));
    for (const button of resultLockButtons) {
      button.disabled = remaining > 0;
      button.textContent = remaining > 0 ? `${button.dataset.baseLabel}（${remaining}秒后可用）` : button.dataset.baseLabel;
    }
    const countdown = $('result-countdown');
    if (countdown) countdown.textContent = remaining ? `${remaining}` : '0';
  }
  function modal(title, kicker, content, actions, kind) {
    if (!['round', 'end'].includes(kind)) clearResultLock();
    previousFocus = document.activeElement; modalKind = kind; paused = true; keys.clear();
    $('modal-title').textContent = title; $('modal-kicker').textContent = kicker; $('modal-content').innerHTML = content;
    $('modal-actions').replaceChildren();
    actions.forEach((a, i) => {
      const button = document.createElement('button');
      button.dataset.baseLabel = a.label;
      button.textContent = a.label;
      if (!i) button.className = 'primary';
      const lockedResultAction = ['round', 'end'].includes(kind);
      if (lockedResultAction) resultLockButtons.push(button);
      button.onclick = () => { if (lockedResultAction && resultLockActive()) return; a.run(); };
      $('modal-actions').append(button);
    });
    updateResultLock();
    $('modal').hidden = false; focusIndex = 0; $('modal-actions').querySelector('button')?.focus();
  }
  function hideModal() { clearResultLock(); $('modal').hidden = true; modalKind = ''; paused = false; keys.clear(); if (screen === 'game') canvas.focus(); else previousFocus?.focus(); }
  function controlsHTML(mode) {
    return `<div class="rule-controls">爸爸 / P1：W 上 · A 左 · D 右 · Z 下 · 1 攻击 · 2 冲刺 · 3 技能 · 4 ${mode === 'duel' ? '格挡' : mode === 'coop' ? '共振 / 救援' : '咆哮 / 光束'}<br>你 / P2：方向键移动 · 7 攻击 · 8 冲刺 · 9 技能 · 0 模式动作<br>手柄：左摇杆 / 方向键移动 · A 攻击 · B 冲刺 · X 技能 · Y 模式动作<br>连按近战打出四连击；命中积攒必杀能量，蓄满后按技能键释放五发扇形爆发。冲刺与技能须松开后再按。</div>`;
  }
  function briefing(mode, fromGame = false) {
    currentMode = mode; const data = modes[mode];
    const roles = mode === 'kaiju' && !fromGame ? `<div class="role-switch"><span id="roles">P${monsterSlot + 1} 怪兽 · P${2 - monsterSlot} 英雄</span><button id="swap-role">交换角色 ⇄</button></div>` : '';
    modal(data.title, fromGame ? 'HOW TO PLAY / 规则' : `${data.label} · 战前简报`, `<ul class="rule-list">${data.rules.map(x => `<li>${x}</li>`).join('')}</ul>${roles}${controlsHTML(mode)}`, [
      { label: fromGame ? '继续战斗 →' : '准备好了，开始 →', run: () => fromGame ? hideModal() : start(mode) },
      { label: fromGame ? '返回暂停菜单' : '返回选模式', run: () => fromGame ? pauseMenu() : hideModal() }
    ], fromGame ? 'rules' : 'briefing');
    if ($('swap-role')) $('swap-role').onclick = () => { monsterSlot = 1 - monsterSlot; $('roles').textContent = `P${monsterSlot + 1} 怪兽 · P${2 - monsterSlot} 英雄`; };
  }
  function start(mode) {
    if (resultLockActive()) return;
    currentMode = mode; screen = 'game'; particles = []; popups = []; shake = 0; toastTime = 0; $('toast').classList.remove('show');
    battle = new Battle(mode, { monsterSlot, onEvent: event }); $('menu').hidden = true; $('arena-view').hidden = false;
    $('mode-label').textContent = modes[mode].label; $('match-title').textContent = modes[mode].title; $('mode-hint').textContent = modes[mode].hint;
    hideModal(); accumulator = 0; window.scrollTo({ top: 0, behavior: 'instant' }); tone(440, .2, 'sine', .045, 880); updateHud();
  }
  function goMenu() { if (resultLockActive()) return; screen = 'menu'; battle = null; $('menu').hidden = false; $('arena-view').hidden = true; hideModal(); document.querySelector('[data-mode]')?.focus(); }
  function pauseMenu(note = '') {
    if (screen !== 'game' || !battle) return;
    modal('休息一下，搭档。', 'MATCH PAUSED / 已暂停', `<p>${note || '战斗时间已冻结。调整呼吸，下一次配合更漂亮。'}</p><div class="rule-controls">${deviceName(0)}<br>${deviceName(1)}<br>可在主菜单中更换控制设备。Esc / 手柄 ☰ 继续。</div>`, [
      { label: '继续战斗 →', run: hideModal }, { label: '重新开局', run: restartConfirm }, { label: '返回菜单', run: goMenu }
    ], 'pause');
  }
  function restartConfirm() { modal('重新开始这场比赛？', 'RESTART MATCH', '<p>本场比分和战斗进度将重置。</p>', [{ label: '确认重新开局', run: () => start(currentMode) }, { label: '继续当前比赛', run: hideModal }], 'restart'); }
  function roundModal(winner) {
    beginResultLock();
    const winnerLabel = winner < 0 ? '本回合平局' : `胜者：P${winner + 1}（${winner === 0 ? '爸爸' : '你'}）`;
    modal(winner < 0 ? '势均力敌 · 平局加赛' : `P${winner + 1}（${winner === 0 ? '爸爸' : '你'}）赢下本回合`, `ROUND ${battle.round} / 回合结束`, `<div class="winner-banner"><strong>${winnerLabel}</strong><span>${winner < 0 ? '双方生命相同，本回合不计分。' : '这一回合已经结束。'}</span></div><div class="score-line">${battle.scores[0]} : ${battle.scores[1]}</div><p style="text-align:center">率先拿到两分的玩家赢得比赛。<br>下一回合生命与技能全部恢复。</p><p class="result-lock-note">请先看清比分和胜者；<b><span id="result-countdown">10</span> 秒</b>后才能继续。</p>`, [
      { label: '下一回合 →', run: () => { battle.nextRound(); hideModal(); updateHud(); } }, { label: '返回菜单', run: goMenu }
    ], 'round');
  }
  function endModal(winner, reason) {
    beginResultLock();
    const won = winner === 'team';
    const adventure = battle.mode === 'adventure';
    const winnerLabel = adventure ? (winner === 'team' ? '胜者：探险小队' : '探险失败：敌方部队') : battle.mode === 'coop' ? (won ? '胜者：P1 + P2（双人团队）' : '胜者：巨兽（电脑）') : `胜者：P${winner + 1}（${battle.mode === 'kaiju' ? (winner === monsterSlot ? '巨兽' : '英雄') : winner === 0 ? '爸爸' : '你'}）`;
    const title = adventure ? (winner === 'team' ? '探险成功！' : '探险暂时失败') : battle.mode === 'coop' ? (won ? '双人团队胜利！' : '巨兽胜利！') : `P${winner + 1}（${battle.mode === 'kaiju' ? (winner === monsterSlot ? '巨兽' : '英雄') : winner === 0 ? '爸爸' : '你'}）胜利！`;
    const stats = battle.stats;
    modal(title, 'MATCH COMPLETE / 战斗结算', `<div class="winner-banner"><strong>${winnerLabel}</strong><span>${reason}</span></div>${battle.mode === 'duel' ? `<div class="score-line">${battle.scores[0]} : ${battle.scores[1]}</div>` : ''}<div class="stat-grid"><div><b>${Math.round(battle.totalTime)}s</b><span>本场战斗用时</span></div><div><b>${Math.round(stats.damage[0])}</b><span>P1 总伤害</span></div><div><b>${Math.round(stats.damage[1])}</b><span>P2 总伤害</span></div></div>${adventure ? `<p>到达第 ${battle.wave} 波 · 背包 ${battle.inventory.length} / ${battle.capacity} · 金币 ${battle.coins}</p>` : ''}${battle.mode === 'coop' ? `<p>共振配合 ${stats.sync} 次 · 成功救援 ${stats.revives} 次</p>` : ''}<p class="result-lock-note">比赛已暂停，先停留看清结果；<b><span id="result-countdown">10</span> 秒</b>内任何继续操作都不会生效。</p>`, [
      { label: '再来一场 →', run: () => start(currentMode) }, ...(battle.mode === 'kaiju' ? [{ label: '交换角色再战', run: () => { monsterSlot = 1 - monsterSlot; start(currentMode); } }] : []), { label: '返回菜单', run: goMenu }
    ], 'end'); tone(won || typeof winner === 'number' ? 480 : 180, .5, 'sine', .04, won || typeof winner === 'number' ? 900 : 80);
  }
  document.querySelectorAll('[data-mode]').forEach(button => button.onclick = () => briefing(button.dataset.mode));
  $('brand').onclick = e => { e.preventDefault(); if (screen === 'game') pauseMenu(); };
  $('pause-button').onclick = () => pauseMenu(); $('rules-button').onclick = () => briefing(currentMode, true);
  function escape() {
    if (modalKind === 'pause' || modalKind === 'rules' || modalKind === 'restart') hideModal();
    else if (modalKind === 'briefing') hideModal();
    else if (!modalKind && screen === 'game') pauseMenu();
  }
  addEventListener('keydown', e => {
    if (e.code === 'Escape' && !e.repeat) { e.preventDefault(); escape(); return; }
    if (screen === 'game' && !$('modal').hidden) { if (e.code === 'Tab') { const buttons = [...$('modal').querySelectorAll('button')]; const i = buttons.indexOf(document.activeElement); e.preventDefault(); buttons[(i + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus(); } return; }
    if (screen === 'game' && [...Object.values(keymaps[0]).flat(), ...Object.values(keymaps[1]).flat(), 'Space'].includes(e.code)) e.preventDefault();
    keys.add(e.code);
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => { keys.clear(); if (screen === 'game' && !modalKind && ['playing', 'countdown'].includes(battle?.phase)) pauseMenu('窗口失去焦点，已自动暂停。'); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && screen === 'game' && !modalKind) pauseMenu('页面已切到后台，战斗已暂停。'); });
  const getPads = () => { try { return Array.from(navigator.getGamepads?.() || []).filter(p => p?.connected); } catch (_) { return []; } };
  const pressed = (pad, i) => !!pad?.buttons[i]?.pressed;
  // 标准映射按钮索引：0=A 1=B 2=X 3=Y 4=LB 5=RB 6=LT 7=RT 8=Back 9=Start 10=L3 11=R3 12=上 13=下 14=左 15=右
  const isStandard = pad => pad?.mapping === 'standard';
  function rebuildDevices(pads) {
    for (let slot = 0; slot < 2; slot++) {
      const select = $(`device${slot}`); select.replaceChildren();
      const options = [['auto', '自动分配 / 键盘'], ['keyboard', '仅使用键盘'], ...pads.map(p => [`pad:${p.index}`, `手柄 ${p.index + 1} · ${p.id.includes('Xbox') ? 'Xbox' : p.mapping === 'standard' ? '标准手柄' : '通用手柄'}`])];
      if (selections[slot].startsWith('pad:') && !options.some(x => x[0] === selections[slot])) options.push([selections[slot], '手柄已断开 · 等待重连']);
      for (const [value, text] of options) { const o = document.createElement('option'); o.value = value; o.textContent = text; select.append(o); }
      select.value = selections[slot];
    }
    $('connection-help').textContent = pads.length ? `已识别 ${pads.length} 只手柄。可用手柄方向键 / 左摇杆 + A 键选模式开打；两人可各自指定手柄。` : '支持两只 Xbox 手柄，也可以用键盘一起玩。连接后按任意手柄按键。';
  }
  function assignPads(pads) {
    const reserved = new Set(selections.filter(s => s.startsWith('pad:')).map(s => Number(s.slice(4))));
    for (let i = 0; i < 2; i++) {
      selectedPads[i] = selections[i] === 'auto' && !reserved.has(autoBindings[i]) ? pads.find(p => p.index === autoBindings[i]) || null : selections[i].startsWith('pad:') ? pads.find(p => p.index === Number(selections[i].slice(4))) || null : null;
      if (selectedPads[i]) reserved.add(selectedPads[i].index);
    }
    const available = pads.filter(p => !reserved.has(p.index));
    for (let i = 0; i < 2; i++) if (selections[i] === 'auto' && !selectedPads[i]) { selectedPads[i] = available.shift() || null; if (selectedPads[i]) autoBindings[i] = selectedPads[i].index; }
  }
  for (let i = 0; i < 2; i++) $(`device${i}`).onchange = e => {
    selections[i] = e.target.value; autoBindings[i] = null; if (selections[i].startsWith('pad:') && selections[1 - i] === selections[i]) selections[1 - i] = 'keyboard';
    const pads = getPads(); assignPads(pads); rebuildDevices(pads);
  };
  function deviceName(i) { const p = selectedPads[i]; return `P${i + 1} · ${p ? `手柄 ${p.index + 1}${p.mapping !== 'standard' ? '（通用映射）' : ''}` : selections[i].startsWith('pad:') ? '手柄断开 / 键盘可接管' : '键盘'}`; }
  function pollPads(dt) {
    const pads = getPads(), signature = pads.map(p => `${p.index}:${p.id}`).join('|');
    const lost = selectedPads.filter(p => p && !pads.some(next => next.index === p.index));
    assignPads(pads);
    if (signature !== padSignature) { padSignature = signature; rebuildDevices(pads); if (lost.length && screen === 'game' && !modalKind && ['playing', 'countdown'].includes(battle?.phase)) pauseMenu('手柄连接已中断。重新连接后按任意手柄键，或用对应玩家的键盘继续。'); }
    connectedBefore = new Set(pads.map(p => p.index));
    // 每只手柄独立导航，避免互相抢焦点。
    for (const idx of padNav.keys()) if (!pads.some(p => p.index === idx)) padNav.delete(idx);
    for (const p of pads) {
      const prev = padPrevious.get(p.index) || Array(17).fill(false);
      const fresh = i => pressed(p, i) && !prev[i];
      const nav = padNav.get(p.index) || (padNav.set(p.index, { cooldown: 0, focusIndex: 0 }), padNav.get(p.index));
      nav.cooldown = Math.max(0, nav.cooldown - dt);
      if (fresh(9)) { if (!modalKind && screen === 'game') pauseMenu(); else if (modalKind === 'pause' || modalKind === 'rules') hideModal(); }
      else if (screen === 'menu' || modalKind) {
        const buttons = modalKind ? [...$('modal-actions').querySelectorAll('button'), ...$('modal-content').querySelectorAll('button')] : [...document.querySelectorAll('.mode-card'), $('device0'), $('device1'), $('sound'), $('fullscreen')];
        const delta = pressed(p, BTN.DOWN) || pressed(p, BTN.RIGHT) || p.axes[1] > .6 || p.axes[0] > .6 ? 1 : pressed(p, BTN.UP) || pressed(p, BTN.LEFT) || p.axes[1] < -.6 || p.axes[0] < -.6 ? -1 : 0;
        if (delta && nav.cooldown <= 0) { const active = buttons.indexOf(document.activeElement); nav.focusIndex = ((active < 0 ? nav.focusIndex : active) + delta + buttons.length) % buttons.length; buttons[nav.focusIndex]?.focus(); nav.cooldown = .22; }
        if (fresh(BTN.A)) {
          const active = buttons.includes(document.activeElement) ? document.activeElement : buttons[nav.focusIndex] || buttons[0];
          if (active?.tagName === 'SELECT') { const index = (active.selectedIndex + 1) % active.options.length; active.selectedIndex = index; active.dispatchEvent(new Event('change')); }
          else active?.click();
        }
        if (fresh(BTN.B)) { if (modalKind === 'end' || modalKind === 'round') { if (!resultLockActive()) goMenu(); } else escape(); }
      }
      padPrevious.set(p.index, p.buttons.map(b => b.pressed));
    }
    for (const index of padPrevious.keys()) if (!pads.some(p => p.index === index)) padPrevious.delete(index);
  }
  // 标准映射按钮索引（W3C Gamepad "standard" mapping）
  const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
  function readInput(slot) {
    const m = keymaps[slot], down = name => m[name].some(code => keys.has(code)), pad = selectedPads[slot];
    // Keyboard is always a fallback, including when a selected gamepad disconnects.
    let x = Number(down('right')) - Number(down('left')), y = Number(down('down')) - Number(down('up'));
    if (pad) { const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0, dead = v => Math.abs(v) < .22 ? 0 : Math.sign(v) * (Math.abs(v) - .22) / .78; x += dead(ax) + Number(pressed(pad, BTN.RIGHT)) - Number(pressed(pad, BTN.LEFT)); y += dead(ay) + Number(pressed(pad, BTN.DOWN)) - Number(pressed(pad, BTN.UP)); }
    const n = Math.hypot(x, y); if (n > 1) { x /= n; y /= n; }
    return { x, y, attack: down('attack') || pressed(pad, BTN.A), dash: down('dash') || pressed(pad, BTN.B), skill: down('skill') || pressed(pad, BTN.X), link: down('link') || pressed(pad, BTN.Y) };
  }
  function updateHud() {
    if (!battle) return;
    for (const p of battle.fighters) {
      $(`name${p.id}`).textContent = `P${p.id + 1} · ${p.monster ? '暴走巨兽' : battle.mode === 'coop' ? '共振英雄' : battle.mode === 'adventure' ? '探险英雄' : '守护机甲'}`;
      $(`hp${p.id}`).style.width = `${p.hp / p.maxHp * 100}%`; $(`hp${p.id}-text`).textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
      const ult = $(`ult${p.id}`), combat = $(`combat${p.id}`);
      if (ult) { ult.style.width = `${p.ultimate}%`; ult.parentElement?.classList.toggle('ready', p.ultimate >= 100); }
      if (combat) combat.textContent = p.combo ? `${p.combo} 连击 · ${p.comboTimer.toFixed(1)}s` : p.ultimate >= 100 ? '必杀就绪！按技能键' : `必杀 ${Math.floor(p.ultimate)}%`;
      const cd = n => n > 0 ? `${n.toFixed(1)}s` : '就绪';
      $(`cd${p.id}`).textContent = p.down ? `倒地 · 救援 ${Math.min(100, p.revive / 1.6 * 100).toFixed(0)}%` : `冲刺 ${cd(p.dashCd)} · 技能 ${cd(p.skillCd)}${battle.mode === 'duel' ? ` · 格挡能量 ${Math.round(p.energy)}` : battle.mode === 'kaiju' ? ` · ${p.monster ? '咆哮' : '光束'} ${cd(p.linkCd)}` : ''}`;
      $(`live-device${p.id}`).textContent = deviceName(p.id);
    }
    $('timer').textContent = Math.ceil(battle.time).toString().padStart(2, '0'); $('timer').style.color = battle.time < 15 ? '#ff9c82' : '#e8edef';
    $('round-label').textContent = battle.mode === 'duel' ? `${battle.scores[0]} — ${battle.scores[1]} / R${battle.round}` : battle.mode === 'coop' ? `PHASE ${battle.boss.phase}` : battle.mode === 'adventure' ? `WAVE ${battle.wave}` : 'CITY DEFENSE';
    $('objective').textContent = battle.mode === 'duel' ? '三局两胜 · 自动瞄准远程技能 · 协作键格挡' : battle.mode === 'coop' ? (battle.boss.shield ? '护盾在线 / 两人分站左右装置，按住协作键' : `护盾解除 / 输出窗口 ${battle.boss.exposed.toFixed(1)} 秒 · 同步技能追加伤害`) : battle.mode === 'adventure' ? `小兵 ${battle.enemies.filter(e => e.hp > 0 && !e.boss).length} · 背包 ${battle.inventory.length}/${battle.capacity} · 金币 ${battle.coins}` : `能源设施 ${battle.generators.filter(g => g.hp > 0).length} / 3 · P${monsterSlot + 1} 怪兽进攻 / P${2 - monsterSlot} 英雄防守`;
  }
  // Canvas artwork: all assets are drawn locally; no downloads, fonts or servers required.
  function rounded(c, x, y, w, h, r, fill, stroke, line = 1) { c.beginPath(); c.roundRect(x, y, w, h, r); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = line; c.stroke(); } }
  function ellipse(c, x, y, rx, ry, fill, stroke, line = 1) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = line; c.stroke(); } }
  function path(c, points, fill, stroke, width = 2) { c.beginPath(); points.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p)); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); } }
  function text(c, str, x, y, size = 12, color = '#9ab1ba', align = 'center', weight = 500) { c.fillStyle = color; c.font = `${weight} ${size}px "Segoe UI", "Microsoft YaHei", sans-serif`; c.textAlign = align; c.fillText(str, x, y); }
  function hero(c, p, scale = 1, posterMode = false) {
    c.save(); c.translate(p.x, p.y); c.scale(scale, scale); const color = colors[p.id] || colors[0], s = Math.sin(p.walk || 0) * 3, hurt = p.hurt > 0;
    ellipse(c, 0, 14, 31, 12, '#0006');
    if (p.down) { c.rotate(-Math.PI / 2); c.globalAlpha = .55; }
    if (p.invuln > 0 && !posterMode && Math.sin(globalTime * 45) > .3) c.globalAlpha = .65;
    if (p.dashTime > 0) { c.save(); c.globalAlpha = .3; for (let i = 1; i < 4; i++) ellipse(c, -p.fx * i * 18, -p.fy * i * 18 - 8, 19, 27, color); c.restore(); }
    c.lineJoin = 'round'; c.lineCap = 'round';
    // Boots, leg joints, armored chest and separate shoulder plates.
    rounded(c, -17, -5 + s, 13, 25, 4, '#172f3a', '#081921', 3); rounded(c, 5, -5 - s, 13, 25, 4, '#172f3a', '#081921', 3);
    rounded(c, -19, 11 + s, 16, 9, 3, color, '#102b34', 2); rounded(c, 5, 11 - s, 16, 9, 3, color, '#102b34', 2);
    path(c, [[-19,-33],[19,-33],[23,-15],[12,1],[-12,1],[-23,-15]], hurt ? '#fff8dc' : '#dce6e1', '#0c222c', 3);
    path(c, [[-16,-30],[0,-22],[16,-30],[13,-14],[0,-7],[-13,-14]], color, '#2c5763', 1.5);
    ellipse(c, 0, -18, 6, 6, '#183e49', '#eafff8', 2); ellipse(c, 0, -18, 2.4, 2.4, color);
    rounded(c, -31, -30, 14, 14, 4, color, '#112b35', 3); rounded(c, 18, -30, 14, 14, 4, color, '#112b35', 3);
    rounded(c, -30, -13, 12, 14, 4, '#bed1d1', '#112b35', 3); rounded(c, 19, -13, 12, 14, 4, '#bed1d1', '#112b35', 3);
    // Helmet with a luminous single visor and two antennas.
    path(c, [[-15,-44],[-20,-62],[-7,-52],[7,-52],[20,-62],[15,-44]], '#dce9e4', '#112c35', 3);
    rounded(c, -18, -53, 36, 25, 8, hurt ? '#fff8dc' : '#e6ede5', '#0f2833', 3);
    path(c, [[-14,-45],[14,-45],[11,-35],[-11,-35]], '#143843', null);
    rounded(c, -10, -43, 20, 4, 2, color); c.fillStyle = '#effff5'; c.fillRect(-6, -43, 6, 2);
    path(c, [[-6,-31],[6,-31],[0,-24]], '#94abb1', '#143a46', 1);
    // Direction indicator makes the facing direction explicit.
    if (!posterMode && !p.down) { c.save(); c.translate(p.fx * 42, p.fy * 42 - 10); c.rotate(Math.atan2(p.fy, p.fx)); path(c, [[7,0],[-3,-4],[-3,4]], color); c.restore(); }
    if (p.attackTime > 0) { c.save(); c.rotate(Math.atan2(p.fy, p.fx)); c.beginPath(); c.arc(0, 0, 67, -.95, .95); c.strokeStyle = color; c.lineWidth = 9; c.globalAlpha = p.attackTime * 3; c.stroke(); c.beginPath(); c.arc(0, 0, 76, -.7, .7); c.lineWidth = 2; c.strokeStyle = '#eef8df'; c.stroke(); c.restore(); }
    if (p.guard) { ellipse(c, 0, -13, 42, 47, '#67e4e016', '#b3fff4', 2); }
    c.restore();
    if (!posterMode) {
      text(c, p.down ? `P${p.id + 1} 救援 ${Math.floor(p.revive / 1.6 * 100)}%` : `P${p.id + 1}`, p.x, p.y - 73 * scale, 11, color, 'center', 800);
      if (p.down) { c.strokeStyle = color; c.lineWidth = 3; c.beginPath(); c.arc(p.x, p.y, 35, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p.revive / 1.6); c.stroke(); }
    }
  }
  function monster(c, p, scale = 1, boss = false, posterMode = false) {
    c.save(); c.translate(p.x, p.y); c.scale(scale, scale); const phase = boss ? p.anim || 0 : p.walk || 0, bob = Math.sin(phase * 2) * 2, hurt = p.hurt > 0;
    ellipse(c, 0, 23, 53, 17, '#0006'); c.translate(0, bob);
    path(c, [[27,9],[70,20],[86,5],[75,30],[40,31],[22,23]], '#a45c40', '#292c30', 3);
    for (let i = 0; i < 4; i++) path(c, [[-16+i*11,-36],[i*12-17,-69+i*4],[i*13-2,-35]], '#d6e3c9', '#2b383b', 2);
    rounded(c, -33, -4, 24, 33, 8, '#bb7550', '#263238', 3); rounded(c, 12, -4, 25, 33, 8, '#bb7550', '#263238', 3);
    path(c, [[-35,21],[-35,29],[-8,29],[-10,19]], '#ffcc8f', '#263238', 2); path(c, [[12,21],[12,29],[40,29],[35,19]], '#ffcc8f', '#263238', 2);
    path(c, [[-36,-44],[26,-45],[42,-17],[28,16],[-23,17],[-44,-12]], hurt ? '#ffe5bc' : '#e38f56', '#263238', 4);
    path(c, [[-23,-23],[24,-24],[27,4],[14,14],[-15,14],[-30,0]], '#f2bf7c', '#a16643', 2);
    for (let i = 0; i < 3; i++) { c.strokeStyle = '#bc8a60'; c.lineWidth = 2; c.beginPath(); c.moveTo(-19, -11 + i * 9); c.lineTo(23, -11 + i * 9); c.stroke(); }
    path(c, [[-31,-40],[-55,-32],[-58,-8],[-44,1],[-33,-14]], '#c9784b', '#263238', 3); path(c, [[30,-40],[53,-29],[59,-8],[46,2],[34,-13]], '#e59c61', '#263238', 3);
    for (const side of [-1,1]) for (let i=0;i<3;i++) path(c, [[side*(43+i*4),-3],[side*(46+i*4),8],[side*(49+i*4),-6]], '#ece1c4', '#344042', 1);
    path(c, [[-30,-60],[-22,-77],[-5,-68],[16,-72],[33,-55],[30,-34],[13,-26],[-20,-33],[-36,-44]], hurt ? '#ffe5bc' : '#eea565', '#263238', 4);
    path(c, [[-27,-60],[-40,-77],[-20,-68]], '#eadbb8', '#384044', 2); path(c, [[20,-67],[34,-83],[31,-53]], '#eadbb8', '#384044', 2);
    path(c, [[-26,-53],[-9,-49],[-13,-43],[-26,-46]], '#253e40'); path(c, [[7,-49],[24,-54],[23,-46],[11,-43]], '#253e40');
    c.fillStyle = '#cffeaf'; c.fillRect(-21,-49,7,3); c.fillRect(12,-49,7,3);
    path(c, [[-18,-36],[17,-36],[8,-29],[-8,-29]], '#4d4140');
    if (p.attackTime > 0) { c.save(); c.rotate(Math.atan2(p.fy, p.fx)); for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(0, 0, 82 + i * 8, -.85, .85); c.lineWidth = 5; c.strokeStyle = '#ffe2a3'; c.stroke(); } c.restore(); }
    if (boss && p.shield) { c.save(); c.strokeStyle = '#8feae3'; c.lineWidth = 2; c.setLineDash([10,7]); ellipse(c, 0, -15, 74, 77, '#67e4e00c', '#67e4e080', 2); c.restore(); }
    c.restore();
    if (!posterMode && !boss) text(c, `P${p.id + 1} / TITAN`, p.x, p.y - 96 * scale, 11, '#ffba83', 'center', 800);
  }
  function drawArena(c, t) {
    const g = c.createLinearGradient(0, 0, 0, 720); g.addColorStop(0, '#152630'); g.addColorStop(1, '#203b45'); c.fillStyle = g; c.fillRect(0,0,1280,720);
    // Architectural tiers and ambient signage.
    rounded(c, 34, 156, 1212, 510, 40, '#0b1d27', '#34515e', 2);
    rounded(c, 65, 181, 1150, 466, 31, '#213c46', '#4f6870', 2);
    rounded(c, 85, 204, 1110, 425, 20, '#29454e', '#90b8bd35', 2);
    c.save(); rounded(c, 86,205,1108,423,20); c.clip();
    c.strokeStyle = '#9cb8bd0a'; c.lineWidth = 1;
    for (let x = -600; x < 1500; x += 65) { c.beginPath(); c.moveTo(x,205); c.lineTo(x+430,630); c.stroke(); c.beginPath(); c.moveTo(x+430,205); c.lineTo(x,630); c.stroke(); }
    c.strokeStyle='#8fadb31d';c.lineWidth=2;c.setLineDash([9,12]); c.beginPath();c.moveTo(640,205);c.lineTo(640,630);c.stroke();c.setLineDash([]);
    ellipse(c,640,420,165,128,null,'#a9c2bd18',2); ellipse(c,640,420,124,96,null,'#a9c2bd12',2);
    text(c,'LINK / ARENA',640,435,29,'#9cc4c017','center',900);
    for (const x of [95,1185]) { c.fillStyle = x === 95 ? '#67e4e036' : '#ffac7736'; c.fillRect(x,280,4,280); }
    c.restore();
    for (let x = 145; x < 1190; x += 125) { rounded(c,x,172,65,5,2,x<640?'#67e4e095':'#ffab7795'); rounded(c,x,651,65,4,2,'#49626b'); }
    for (const x of [45,1219]) for (let y=250;y<620;y+=65) { rounded(c,x,y,16,30,3,'#304651','#45606d',1); rounded(c,x+5,y+6,6,9,1,Math.sin(t*2+y)>.2?'#78c7c0':'#48656d'); }
    text(c,'SECTOR 02',114,692,10,'#688a98','left');text(c,'OFFLINE · TWO PLAYERS · ONE ARENA',1165,692,9,'#688a98','right');
  }
  function drawPylon(c, p, i) {
    const active = p.charge > 0, color = active ? '#9af6d9' : '#a6d8d3';
    ellipse(c,p.x,p.y,77,64,active?'#67e4e014':'#67e4e006',active?'#82ffe2':'#83c6c448',2);
    c.save(); c.setLineDash([4,9]); ellipse(c,p.x,p.y,66,54,null,'#91e0d260',1); c.restore();
    path(c,[[p.x-28,p.y-7],[p.x,p.y-23],[p.x+28,p.y-7],[p.x+28,p.y+12],[p.x,p.y+26],[p.x-28,p.y+12]],'#1d3742','#6d9a9f',2);
    rounded(c,p.x-17,p.y-46,34,47,5,'#416773','#8db6b9',2);rounded(c,p.x-11,p.y-40,22,24,3,active?'#92f8d4':'#243e49');
    path(c,[[p.x,p.y-36],[p.x+8,p.y-28],[p.x,p.y-20],[p.x-8,p.y-28]],color);
    text(c,active?'已连接 ✓':`${i===0?'左':'右'}共振 · 按住协作键`,p.x,p.y+90,12,color);
  }
  function drawGenerator(c,g,i) {
    const alive=g.hp>0;ellipse(c,g.x,g.y+13,40,18,'#0004');
    if (!alive) { path(c,[[g.x-30,g.y+12],[g.x-20,g.y-5],[g.x-8,g.y+2],[g.x+3,g.y-15],[g.x+21,g.y+3],[g.x+30,g.y+15]],'#4c4d47','#6f6b58',2);text(c,'已摧毁',g.x,g.y+42,10,'#bc8670');return; }
    path(c,[[g.x-27,g.y-30],[g.x,g.y-46],[g.x+27,g.y-30],[g.x+27,g.y+11],[g.x,g.y+27],[g.x-27,g.y+11]],g.hurt>0?'#e6eee4':'#547682','#203b46',3);
    path(c,[[g.x,g.y-38],[g.x+19,g.y-27],[g.x,g.y-16],[g.x-19,g.y-27]],'#b9e6d6','#d7e5c7',1);
    rounded(c,g.x-18,g.y-11,36,8,2,'#132e3a');rounded(c,g.x-15,g.y-9,30*g.hp/g.maxHp,4,1,'#a8e8c7');
    text(c,`能源 ${String.fromCharCode(65+i)} · ${Math.ceil(g.hp)}%`,g.x,g.y+47,10,'#cad9c5');
  }
  function drawAdventureEnemy(c, e) {
    if (e.hp <= 0) return;
    if (e.boss) { monster(c, e, 1.02, true); text(c, `${e.skill} · 小巨兽`, e.x, e.y - 70, 11, '#ffc787', 'center', 800); }
    else { monster(c, e, .42, false); text(c, '小兵', e.x, e.y - 35, 8, '#ffb58d', 'center', 700); }
    c.fillStyle = '#101b20'; c.fillRect(e.x - 25, e.y - (e.boss ? 65 : 29), 50, 4); c.fillStyle = e.boss ? '#ffbd77' : '#ef8e6f'; c.fillRect(e.x - 25, e.y - (e.boss ? 65 : 29), 50 * e.hp / e.maxHp, 4);
  }
  function drawBattle() {
    if (!battle) return; const c=ctx;c.save();if(shake>0)c.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);drawArena(c,globalTime);
    if(battle.mode==='coop') {
      battle.pylons.forEach((p,i)=>drawPylon(c,p,i));
      const b=battle.boss;rounded(c,445,164,390,9,3,'#13222a','#546d76',1);rounded(c,446,165,388*b.hp/b.maxHp,7,2,b.shield?'#85c3c9':'#f2bc86');text(c,`暴走巨兽 · ${Math.ceil(b.hp)} / ${b.maxHp} · ${b.shield?'护盾':'弱点暴露'}`,640,154,11,b.shield?'#91ced0':'#ffd6a1');
      if(b.shield && battle.syncCharge>0){rounded(c,540,588,200,6,3,'#142e38');rounded(c,540,588,200*battle.syncCharge/1.3,6,3,'#94f3d2');text(c,'共振同步中…',640,617,12,'#a1f8d7');}
    }
    if(battle.mode==='kaiju')battle.generators.forEach((g,i)=>drawGenerator(c,g,i));
    if(battle.mode==='adventure') { for(const e of battle.enemies) drawAdventureEnemy(c,e); for(const item of battle.groundLoot) { ellipse(c,item.x,item.y,10,10,'#ffe08a33','#ffe08a',2); text(c,'装',item.x,item.y+4,9,'#ffe08a','center',800); } }
    for(const w of battle.warnings){const a=1-w.life/w.max;ellipse(c,w.x,w.y,w.r,w.r*.8,'#ff756a15','#ff9b7b',2);ellipse(c,w.x,w.y,w.r*a,w.r*.8*a,'#ff756a32');text(c,'!',w.x,w.y+6,28,'#ffd6a5','center',900);}
    const entities=[...battle.fighters];if(battle.boss)entities.push({...battle.boss,isBoss:true});entities.sort((a,b)=>a.y-b.y);
    for(const p of entities){if(p.isBoss)monster(c,p,1.25,true);else if(p.monster)monster(c,p,1.03);else hero(c,p);}
    for(const b of battle.projectiles){c.save();c.translate(b.x,b.y);c.rotate(Math.atan2(b.vy,b.vx));if(b.kind==='rock'){path(c,[[-15,-5],[-5,-16],[13,-11],[18,4],[4,15],[-11,12]],'#d8a16b','#694f41',2);path(c,[[-5,-10],[8,-6],[0,4]],'#ffe2ab');}else{const color=b.kind==='orb'?'#ffaf7c':colors[b.owner];c.shadowColor=color;c.shadowBlur=12;ellipse(c,0,0,b.r*1.5,b.r,color);c.shadowBlur=0;c.fillStyle=color;c.globalAlpha=.25;c.fillRect(-26,-3,23,6);}c.restore();}
    for(const e of battle.effects){c.save();c.globalAlpha=e.life/e.max;if(e.kind==='beam'){c.strokeStyle='#d5fff2';c.shadowColor='#67e4e0';c.shadowBlur=18;c.lineWidth=10;c.beginPath();c.moveTo(e.x,e.y);c.lineTo(e.tx,e.ty);c.stroke();}else{const r=e.radius*(1-e.life/e.max);ellipse(c,e.x,e.y,r,r*.83,null,e.color,7*e.life/e.max);}c.restore();}
    for(const p of particles){c.globalAlpha=clamp(p.life*2,0,1);c.fillStyle=p.color;c.fillRect(p.x,p.y,p.r,p.r);}c.globalAlpha=1;
    for(const p of popups){c.globalAlpha=clamp(p.life*2,0,1);text(c,p.text,p.x,p.y,18,p.color,'center',800);}c.globalAlpha=1;
    if(battle.phase==='countdown'){c.fillStyle='#10232b55';c.fillRect(85,205,1110,425);text(c,Math.ceil(battle.countdown).toString(),640,430,100,'#f1edd5','center',900);text(c,battle.mode==='coop'?'分站两端 · 同步破盾':battle.mode==='kaiju'?'城市防卫战 · 即将开始':battle.mode==='adventure'?'探险开始 · 小兵会逐波增加':'准备好了吗，搭档？',640,477,17,'#c0d6d8');}
    c.restore();
  }
  function drawPoster(t) {
    const c=pc;c.clearRect(0,0,620,410);c.save();c.translate(310,269);c.scale(1,.42);c.rotate(-.08);rounded(c,-265,-165,530,330,38,'#2c434b','#536a70',2);rounded(c,-240,-140,480,280,25,'#344e54','#94b9b527',2);
    c.strokeStyle='#8db1b815';for(let x=-250;x<300;x+=50){c.beginPath();c.moveTo(x,-140);c.lineTo(x,140);c.stroke();}for(let y=-100;y<150;y+=50){c.beginPath();c.moveTo(-240,y);c.lineTo(240,y);c.stroke();}ellipse(c,0,0,100,100,null,'#b6cec12a',3);c.restore();
    // Arena corner beacons.
    for(const p of [{x:63,y:248},{x:545,y:225},{x:96,y:334},{x:546,y:312}]){rounded(c,p.x,p.y,13,24,3,'#223c47','#557b84',1);rounded(c,p.x+2,p.y+2,9,5,1,'#a4d1c8');}
    c.save();c.translate(0,Math.sin(t*1.4)*3);hero(c,{x:209,y:277,id:0,fx:1,fy:0,walk:t,invuln:0},2.05,true);c.restore();
    monster(c,{x:425,y:267,walk:t*.55,hurt:0},1.5,false,true);
    c.save();c.translate(315,183);c.rotate(.15);path(c,[[-15,-11],[4,-3],[-3,-25],[20,1],[4,9],[9,28],[-19,2],[-3,-3]],'#e8d8a7');c.restore();
    for(let i=0;i<7;i++){const x=110+i*64,y=85+Math.sin(t*.8+i)*12;c.globalAlpha=.2+Math.sin(t+i)*.1;ellipse(c,x,y,2,2,'#a5e8d7');}c.globalAlpha=1;
    text(c,'P1',197,124,11,'#99f0e6','center',800);text(c,'P2',439,100,11,'#ffc28c','center',800);
  }
  function loop(ms) {
    const dt=Math.min(.05,last?(ms-last)/1000:0);last=ms;globalTime+=dt;soundCooldown-=dt;updateResultLock();pollPads(dt);
    if(screen==='game'&&battle){
      if(!paused){accumulator+=dt;const inputs=[readInput(0),readInput(1)];while(accumulator>=1/120){battle.step(1/120,inputs);accumulator-=1/120;if(paused)break;}toastTime-=dt;if(toastTime<=0)$('toast').classList.remove('show');for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.96;p.vy*=.96;p.life-=dt;}particles=particles.filter(p=>p.life>0);for(const p of popups){p.y-=dt*35;p.life-=dt;}popups=popups.filter(p=>p.life>0);shake=Math.max(0,shake-dt*35);}
      updateHud();drawBattle();
    }else drawPoster(globalTime);
    requestAnimationFrame(loop);
  }
  rebuildDevices(getPads());requestAnimationFrame(loop);
  // Read-only diagnostics for local QA, without gameplay shortcuts.
  window.LinkArena=Object.freeze({snapshot:()=>battle?JSON.parse(JSON.stringify({mode:battle.mode,phase:battle.phase,time:battle.time,scores:battle.scores,wave:battle.wave,inventory:battle.inventory,capacity:battle.capacity,coins:battle.coins,fighters:battle.fighters,boss:battle.boss,generators:battle.generators,paused,resultLock:Math.max(0,resultLockUntil-globalTime),devices:[deviceName(0),deviceName(1)]})):({screen,devices:[deviceName(0),deviceName(1)]})});
})();
