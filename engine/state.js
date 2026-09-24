/* state.js — 硬状态读写与存档（铁律 1：状态不可被模型篡改，唯一写入口在本模块与 rules.js） */
(function (G) {
  "use strict";
  const SAVE_KEY = "astrea_save_v1";
  const VERSION = 1;

  const REP_TITLES = [
    [0, "无名小卒"], [20, "注册猎人"], [60, "铜牌猎人"],
    [140, "银牌猎人"], [260, "金牌猎人"], [400, "传奇"]
  ];

  // localStorage 兼容（Node 测试环境下用内存 shim）
  const store = (typeof localStorage !== "undefined") ? localStorage : (function () {
    const m = {};
    return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } };
  })();

  let S = null; // 当前存档对象（内存）

  function newGame(name, element) {
    S = {
      version: VERSION,
      player: {
        name: name || "无名者",
        level: 1, exp: 0,
        hp: 30, maxHp: 30, mp: 20, maxMp: 20,
        gold: 30, food: 6, water: 6,
        grimoire: { element: element, unlockedPages: [1] },
        reputation: 0,
        inventory: [ { id: "ration", n: 2 }, { id: "water_skin", n: 2 }, { id: "potion_heal", n: 1 } ],
        storage: [],
        location: { region: "ashford", node: "tavern" },
        quests: [ { id: "q_m_depart", state: "active", progress: 0 } ], // 主线第一章自动开启；其余 {id, state, progress}
        boardQuests: [],     // 悬赏板生成委托
        discovery: { locations: [], rumors: [], monsters: [], plants: [] },
        companions: { with: null, met: [], eventsSeen: [], together: {} },
        equipment: { weapon: null, armor: null },          // 装备槽（物品 id）
        regionRep: { ashford: 0, mistwood: 0, lavarift: 0, thunderpass: 0, westwatch: 0 }, // 地区声望
        recentEvents: []     // 近期经历（叙事导演用，最多 5 条）
      },
      flags: { dragon_rumor_count: 0, parse_fail_count: 0 },
      weather: "clear",
      timeSeg: 0,            // 时段：0 清晨 1 白日 2 黄昏 3 夜晚
      turn: 0
    };
    return S;
  }

  function get() { return S; }
  function set(s) { S = s; }

  function save() {
    if (!S) return false;
    store.setItem(SAVE_KEY, JSON.stringify(S));
    return true;
  }

  function hasSave() { return !!store.getItem(SAVE_KEY); }

  function load() {
    const raw = store.getItem(SAVE_KEY);
    if (!raw) return null;
    try {
      const s = JSON.parse(raw);
      if (!s || s.version !== VERSION || !s.player) return null; // 版本不符：回退新游戏，不清档
      // 旧档迁移：补齐后加的字段
      const p = s.player;
      if (!p.equipment) p.equipment = { weapon: null, armor: null };
      if (!p.regionRep) p.regionRep = { ashford: 0, mistwood: 0, lavarift: 0, thunderpass: 0, westwatch: 0 };
      if (!p.recentEvents) p.recentEvents = [];
      if (typeof s.timeSeg !== "number") s.timeSeg = 0;
      S = s;
      return S;
    } catch (e) { return null; }
  }

  function wipe() { store.removeItem(SAVE_KEY); S = null; }

  /* ---------- 数值工具 ---------- */
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function clampVitals() {
    const p = S.player;
    p.hp = clamp(Math.round(p.hp), 0, p.maxHp);
    p.mp = clamp(Math.round(p.mp), 0, p.maxMp);
    p.gold = Math.max(0, Math.round(p.gold));
    p.food = clamp(Math.round(p.food), 0, 10);
    p.water = clamp(Math.round(p.water), 0, 10);
    p.exp = Math.max(0, Math.round(p.exp));
    p.reputation = Math.max(0, Math.round(p.reputation));
  }

  function repTitle(rep) {
    rep = (rep === undefined) ? S.player.reputation : rep;
    let t = REP_TITLES[0][1];
    for (const [th, name] of REP_TITLES) if (rep >= th) t = name;
    return t;
  }

  function addExp(n) {
    const p = S.player;
    p.exp += n;
    const ups = [];
    while (p.level < 10 && p.exp >= p.level * 60) {
      p.exp -= p.level * 60;
      p.level += 1;
      p.maxHp += 6; p.maxMp += 4;
      p.hp = p.maxHp; p.mp = p.maxMp;
      ups.push(p.level);
    }
    return ups; // 升到的新等级数组
  }

  function unlockedSkills(grimoires) {
    const p = S.player;
    const book = grimoires.books[p.grimoire.element];
    return book.pages.filter(pg => p.level >= pg.unlock_lvl);
  }

  /* ---------- 背包 / 仓库 ---------- */
  function itemDef(id) { return (G.DATA && G.DATA.items[id]) || { name: id, stack: 1, price: 0 }; }

  function invSlots(list) { return list.length; }

  function addItem(id, n, toStorage) {
    n = n || 1;
    const p = S.player;
    const list = toStorage ? p.storage : p.inventory;
    const limit = toStorage ? 40 : 20;
    const def = itemDef(id);
    let left = n;
    for (const slot of list) {
      if (slot.id === id && slot.n < (def.stack || 1)) {
        const take = Math.min((def.stack || 1) - slot.n, left);
        slot.n += take; left -= take;
        if (left <= 0) return { ok: true };
      }
    }
    while (left > 0) {
      if (invSlots(list) >= limit) return { ok: false, left };
      const take = Math.min(def.stack || 1, left);
      list.push({ id, n: take });
      left -= take;
    }
    return { ok: true };
  }

  function removeItem(id, n, fromStorage) {
    n = n || 1;
    const p = S.player;
    const list = fromStorage ? p.storage : p.inventory;
    let left = n;
    for (let i = list.length - 1; i >= 0 && left > 0; i--) {
      if (list[i].id === id) {
        const take = Math.min(list[i].n, left);
        list[i].n -= take; left -= take;
        if (list[i].n <= 0) list.splice(i, 1);
      }
    }
    return left === 0;
  }

  function countItem(id, fromStorage) {
    const list = fromStorage ? S.player.storage : S.player.inventory;
    return list.reduce((a, s) => a + (s.id === id ? s.n : 0), 0);
  }

  /* ---------- 旗标与发现日志 ---------- */
  function getFlag(k) { return S.flags[k]; }
  function setFlag(k, v) { S.flags[k] = v; }
  function addFlag(k, d) { S.flags[k] = (S.flags[k] || 0) + d; }

  /* ---------- 时段与近期经历 ---------- */
  const TIME_NAMES = ["清晨", "白日", "黄昏", "夜晚"];
  function timeAdvance() { S.timeSeg = (S.timeSeg + 1) % 4; return S.timeSeg; }
  function timeName() { return TIME_NAMES[S.timeSeg || 0]; }
  function pushEvent(txt) {
    const ev = S.player.recentEvents;
    ev.unshift(txt);
    if (ev.length > 5) ev.length = 5;
  }
  function addRegionRep(region, n) {
    const rr = S.player.regionRep;
    if (rr && region in rr) rr[region] = Math.max(0, rr[region] + n);
  }

  function discover(type, id) {
    const log = S.player.discovery[type];
    if (log && !log.includes(id)) { log.push(id); return true; }
    return false;
  }

  /* ---------- 委托 ---------- */
  function findQuest(id) {
    return S.player.quests.find(q => q.id === id) ||
           S.player.boardQuests.find(q => q.id === id);
  }
  function questState(id) {
    const q = findQuest(id);
    return q ? q.state : null;
  }

  G.State = {
    SAVE_KEY, newGame, get, set, save, load, hasSave, wipe,
    clamp, clampVitals, repTitle, addExp, unlockedSkills,
    addItem, removeItem, countItem, itemDef,
    getFlag, setFlag, addFlag, discover,
    findQuest, questState,
    TIME_NAMES, timeAdvance, timeName, pushEvent, addRegionRep
  };
})(typeof window !== "undefined" ? (window.ASTREA = window.ASTREA || {}) : (globalThis.ASTREA = globalThis.ASTREA || {}));
