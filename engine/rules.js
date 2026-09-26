/* rules.js — 变更校验、战斗结算、补给消耗、非法请求驳回（引擎是唯一的规则裁判） */
(function (G) {
  "use strict";
  const St = G.State;

  /* ============ LLM 变更申请校验（白名单 + 单回合上限） ============ */
  const CHANGE_LIMITS = {
    hp: [-30, 40], mp: [-20, 40], gold: [-50, 50],
    food: [-3, 5], water: [-3, 5], exp: [0, 100], reputation: [0, 30]
  };
  const REJECT_QUIPS = {
    gold: "许愿是好事，但公会的账不是这么算的。",
    hp: "生死有数，伤不是这么好的，也不是这么受的。",
    mp: "法力如井，井不会因为你想，就多出一汪水。",
    food: "干粮不会凭空出现，也不会凭空消失——除了被吃掉的时候。",
    water: "水囊的重量骗不了人。",
    exp: "历练要一步一步走。",
    reputation: "声望是别人嘴里的你，不是你自己嘴里的。",
    _field: "世界对你的请求无动于衷。规则就是规则。"
  };

  function applyLLMChanges(requests) {
    const res = { applied: [], rejected: [], fixes: [] };
    if (!Array.isArray(requests)) return res;
    const p = St.get().player;
    for (const r of requests) {
      if (!r || typeof r.field !== "string" || typeof r.delta !== "number" || !isFinite(r.delta)) {
        res.rejected.push(r); res.fixes.push(REJECT_QUIPS._field); continue;
      }
      const lim = CHANGE_LIMITS[r.field];
      if (!lim) { res.rejected.push(r); res.fixes.push(REJECT_QUIPS._field); continue; }
      if (r.delta < lim[0] || r.delta > lim[1]) {
        res.rejected.push(r);
        res.fixes.push(REJECT_QUIPS[r.field] || REJECT_QUIPS._field);
        continue;
      }
      p[r.field] += r.delta;
      res.applied.push(r);
    }
    St.clampVitals(); // 结算后统一钳制：任何情况下数值不越界
    return res;
  }

  /* ============ 元素克制 ============ */
  function elementMult(atkElement, defElement) {
    const chart = G.DATA.grimoires.chart;
    if (!atkElement || atkElement === "none" || atkElement === "heal") return 1;
    if (!defElement || defElement === "none") return 1;
    const row = chart[atkElement];
    if (!row) return 1;
    if (row.strong === defElement) return 1.5;
    if (row.weak === defElement) return 0.75;
    return 1;
  }

  /* ============ 战斗 ============ */
  // 多只怪合并为"一群"：HP 叠加、攻击加成，UI 与结算都保持单目标
  function makeCombat(monsterId, count) {
    count = count || 1;
    const m = G.DATA.monsters[monsterId];
    const elite = !!m.elite;
    const c = {
      monsterId, name: m.name, count: elite ? 1 : count,
      hp: m.hp * (elite ? 1 : count), maxHp: m.hp * (elite ? 1 : count),
      atk: m.atk + (elite ? 0 : (count - 1)),
      def: m.def, lvl: m.lvl, element: m.element,
      exp: m.exp * (elite ? 1 : count), gold: m.gold * (elite ? 1 : count),
      elite, round: 1, veraProtected: false, log: []
    };
    c.displayName = (c.count > 1) ? `${m.name} ×${c.count}` : m.name;
    return c;
  }

  function playerDef() {
    const p = St.get().player;
    let def = 2 + Math.floor(p.level / 2);
    const arm = p.equipment && p.equipment.armor;
    if (arm && G.DATA.items[arm]) def += G.DATA.items[arm].def || 0;
    return def;
  }

  function playerAttack(skillId) {
    const p = St.get().player;
    const c = G.Game.combat;
    if (!c) return { text: "（不在战斗中）" };
    const out = [];
    let base = 4 + p.level, elem = "none", skillName = "普通攻击", heal = 0;
    // 武器加成
    const wpn = p.equipment && p.equipment.weapon;
    const wpnAtk = (wpn && G.DATA.items[wpn]) ? (G.DATA.items[wpn].atk || 0) : 0;

    if (skillId && skillId !== "attack") {
      const book = G.DATA.grimoires.books[p.grimoire.element];
      const sk = book.pages.find(pg => pg.id === skillId);
      if (!sk) return { text: "你的魔导书上没有这一页。" };
      if (p.level < sk.unlock_lvl) return { text: `「${sk.name}」的书页还未为你翻开（需要等级 ${sk.unlock_lvl}）。` };
      if (p.mp < sk.mp) return { text: `法力不足（需要 ${sk.mp} 点）。` };
      p.mp -= sk.mp;
      base = sk.dmg || 0; heal = sk.heal || 0; skillName = sk.name;
      elem = (p.grimoire.element === "heal") ? "heal" : p.grimoire.element;
    }

    let dmg = 0;
    if (base > 0) {
      const mult = elementMult(elem, c.element);
      dmg = Math.max(1, Math.round(base * mult) + (p.level - c.lvl) * 2 - c.def) + wpnAtk;
      if (c.playerBuff === "dmg_up") {
        c.playerBuff = null;
        dmg = Math.round(dmg * 1.5);
        out.push("剑油在刃口烧出一层薄光——这一击格外沉重（伤害 +50%）。");
      }
      c.hp -= dmg;
      const multTxt = mult > 1 ? "（克制！）" : (mult < 1 ? "（效果不佳……）" : "");
      out.push(`你施放「${skillName}」，对 ${c.displayName} 造成 ${dmg} 点伤害${multTxt}。`);
    }
    if (heal > 0) {
      p.hp = St.clamp(p.hp + heal, 0, p.maxHp);
      out.push(`暖光流过伤口，你恢复了 ${heal} 点 HP。`);
    }
    if (base === 0 && heal === 0) out.push("你摆开架势，却什么也没发生。");

    if (c.hp <= 0) return { text: out.join("\n"), victory: true };
    const enemyRes = enemyTurn();
    out.push(enemyRes.text);
    return { text: out.join("\n"), fled: false, playerDown: enemyRes.playerDown };
  }

  function enemyTurn() {
    const p = St.get().player;
    const c = G.Game.combat;
    // 捕兽夹：敌人本次反击落空
    if (c.snare) {
      c.snare = false;
      c.round += 1;
      return { text: `${c.displayName} 扑到一半，预先设下的捕兽夹咔地咬住了它——这一击落空了。`, playerDown: false };
    }
    let atk = c.atk;
    let note = "";
    if (c.elite && c.hp < c.maxHp * 0.3) { atk += 2; note = "（垂死挣扎！）"; }
    let dmg = Math.max(1, atk + (c.lvl - p.level) * 2 - playerDef());

    // 薇拉护主：同伴薇拉在场，此击将令 HP 跌破 30%，且本战未触发过
    const comp = p.companions;
    if (comp.with === "vera" && !c.veraProtected && p.hp - dmg < p.maxHp * 0.3) {
      c.veraProtected = true;
      return { text: `${c.displayName} 的攻势直取你要害——薇拉的剑先一步到了。锵的一声，她替你挡下了这一击。`, playerDown: false };
    }
    p.hp -= dmg;
    St.clampVitals();
    c.round += 1;
    if (p.hp <= 0) return { text: `${c.displayName} 扑了上来${note}，造成 ${dmg} 点伤害。你眼前一黑……`, playerDown: true };
    return { text: `${c.displayName} 反击${note}，对你造成 ${dmg} 点伤害。`, playerDown: false };
  }

  function tryEscape() {
    const c = G.Game.combat;
    if (Math.random() < 0.7) return { ok: true, text: "你且战且退，终于甩开了身后的威胁。" };
    const r = enemyTurn();
    return { ok: false, text: "你转身欲逃，却被缠住了去路！\n" + r.text, playerDown: r.playerDown };
  }

  /* ============ 补给消耗 ============ */
  // 节点移动消耗；返回叙事片段
  function consumeForMove(toRegion) {
    const p = St.get().player;
    const notes = [];
    let foodCost = 1, waterCost = (toRegion === "lavarift") ? 2 : 1;
    if (St.get().weather === "cold" && !["lavarift", "thunderpass"].includes(toRegion) && !["lavarift", "thunderpass"].includes(p.location.region)) {
      foodCost += 1; notes.push("极寒逼人，你得多吃点东西扛住寒气。");
    }
    // 同伴口粮：从据点结伴出发时额外消耗一份食物
    const SETTLEMENTS = ["tavern", "hunter_hut", "miner_camp"];
    if (p.companions.with && SETTLEMENTS.includes(p.location.node)) {
      foodCost += 1; notes.push(`${G.DATA.npcs[p.companions.with].name}的那份口粮也算在了你的行囊里。`);
    }
    const starving = (p.food <= 0 || p.water <= 0);
    p.food = Math.max(0, p.food - foodCost);
    p.water = Math.max(0, p.water - waterCost);
    if (starving) {
      p.hp = Math.max(1, p.hp - 3);
      notes.push("补给已经见底。饥饿与干渴啃噬着你，HP −3。回家睡一觉，玛尔塔的餐桌会解决一切。");
    }
    if (toRegion === "lavarift") notes.push("裂谷的热浪让水囊以可见的速度变轻。");
    return notes;
  }

  function consumeForExplore(region) {
    const p = St.get().player;
    const notes = [];
    const starving = (p.food <= 0 || p.water <= 0);
    p.water = Math.max(0, p.water - (region === "lavarift" ? 2 : 1));
    if (starving) { p.hp = Math.max(1, p.hp - 3); notes.push("你空着肚子在野地里翻找，眼前一阵阵发黑。HP −3。回家睡一觉就能免费补满水粮。"); }
    return notes;
  }

  // 野营：消耗 1 食物，全恢复
  function camp() {
    const p = St.get().player;
    if (p.food < 1) return { ok: false, text: "没有食物，扎营只是挨饿。去找补给，或者回家。" };
    p.food -= 1;
    p.hp = p.maxHp; p.mp = p.maxMp;
    return { ok: true, text: "你生起一小堆篝火，分食了干粮。火光里，伤口和疲乏一起慢慢退去。（食物 −1，HP/法力全恢复）" };
  }

  /* ============ 区域锁（LLM 无权放行） ============ */
  const LOCKED_REGIONS = {
    dragon_wastes: "你朝着龙眠荒原的方向走了不到半里，焦土的热浪和心底炸开的恐惧就把你推了回来。你的双腿拒绝了这个疯狂的想法。",
    mirror_lake: "镜湖在所有人嘴里，却没人说得出确切的路。你问了三个旅人，得到四个方向。也许缘分未到。",
    capital: "辉门的卫兵隔着十步就抬起了手：'纹章。'你拿不出。他礼貌而坚决地摇头：'王都今日不见客。'——圣辉城依然只在远方的地平线上。",
    whitesail: "去白帆城要搭商船或走一个月的海岸商道。秦铎拍着骡子笑你：'先在山口活下来，再想去白帆城的事。'",
    windgrass: "风语草原在西境更西。老兵拦住你：'草场枯了一半，部族正在迁界，生人去了就是箭靶。等开春吧。'",
    ashenfen: "灰潮沼泽的灰白水潮按无人理解的规律涨落。进去的人要么空手而归，要么不归——你站在边缘看了看，决定做第三种人：不去的人。",
    royal_tomb: "苍岩王陵的石椁嵌在整面山壁上，据说有骑士团护陵。你到不了山脚下——十年前就没人换过岗的哨位上，如今坐着一头熊。"
  };
  function checkRegionAccess(regionId) {
    if (LOCKED_REGIONS[regionId]) return { ok: false, text: LOCKED_REGIONS[regionId] };
    return { ok: true };
  }

  /* ============ 委托目标核对 ============ */
  function checkObjective(q, def) {
    const p = St.get().player;
    const o = def.objective;
    switch (o.type) {
      case "kill": return q.progress >= o.count;
      case "collect": return St.countItem(o.item) >= o.count;
      case "visit": return !!St.getFlag(o.with_flag);
      case "visit_node": return p.location.region === o.region && p.location.node === o.node;
      case "flag": return !!St.getFlag(o.flag);
      case "escort": return !!St.getFlag("escorted_" + o.npc);
      default: return false;
    }
  }

  G.Rules = {
    CHANGE_LIMITS, applyLLMChanges, elementMult,
    makeCombat, playerDef, playerAttack, enemyTurn, tryEscape,
    consumeForMove, consumeForExplore, camp,
    checkRegionAccess, LOCKED_REGIONS, checkObjective
  };
})(typeof window !== "undefined" ? (window.ASTREA = window.ASTREA || {}) : (globalThis.ASTREA = globalThis.ASTREA || {}));
