// 验收测试：对照设计文档第七节逐项自检
// 用法：node test/acceptance.test.mjs
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// 按浏览器加载顺序执行脚本（IIFE 挂到 globalThis.ASTREA）
require("../bundle.js");
require("../engine/state.js");
require("../engine/rules.js");
require("../engine/llm.js");
require("../engine/game.js");

const A = globalThis.ASTREA;
const St = A.State, Rules = A.Rules, Game = A.Game, LLM = A.LLM;

let pass = 0, fail = 0;
function T(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? "  >> " + extra : "")); }
}

console.log("== T1 存档刷新不丢进度 ==");
St.newGame("测试者", "fire");
Game.refreshBoard();
let p = St.get().player;
p.gold = 77; p.food = 3;
St.get().flags.dragon_rumor_count = 2;
St.save();
const beforeGold = St.get().player.gold;
St.set(null);
T("读档成功", !!St.load());
T("金币一致", St.get().player.gold === beforeGold && St.get().player.gold === 77);
T("旗标一致", St.get().flags.dragon_rumor_count === 2);

console.log("== T2 非法变更驳回（LLM 试图发放 10000 金币） ==");
p = St.get().player;
const goldBefore = p.gold;
const res = Rules.applyLLMChanges([{ field: "gold", delta: 10000, reason: "作弊" }]);
T("申请被驳回", res.rejected.length === 1 && res.applied.length === 0);
T("金币未被污染", p.gold === goldBefore);
T("生成修正叙事", res.fixes.length === 1 && res.fixes[0].length > 0);
const res2 = Rules.applyLLMChanges([{ field: "hp", delta: -5, reason: "陷阱" }, { field: "level", delta: 99 }]);
T("合法申请通过、白名单外字段驳回", res2.applied.length === 1 && res2.rejected.length === 1);
T("hp 正确结算", p.hp === p.maxHp - 5, "hp=" + p.hp);

console.log("== T3 补给归零后 HP 下降 ==");
p.food = 0; p.water = 0; p.hp = p.maxHp;
const hpBefore = p.hp;
Rules.consumeForMove("mistwood");
T("归零移动扣 HP", p.hp === hpBefore - 3, "hp=" + p.hp);

console.log("== T4 野营：消耗食物、全恢复、营地事件表存在 ==");
p.hp = 5; p.mp = 0; p.food = 3;
const campRes = Rules.camp();
T("野营成功", campRes.ok === true);
T("食物 −1", p.food === 2);
T("HP/法力全恢复", p.hp === p.maxHp && p.mp === p.maxMp);
p.food = 0;
T("无食物不可野营", Rules.camp().ok === false);
T("营地事件表含同伴/夜袭/陌生人", A.DATA.ambient_events.camp.some(e => e.id === "camp_beast") && A.DATA.ambient_events.camp.some(e => e.id === "camp_stranger"));
p.food = 6; p.hp = p.maxHp;

console.log("== T5 发现日志记录新地点与传闻 ==");
p.location = { region: "ashford", node: "gate" };
Game.moveTo("mistwood", "forest_edge");
T("新地点入日志", p.discovery.locations.includes("mistwood/forest_edge"));
p.location = { region: "ashford", node: "tavern" };
Game.hearNews();
T("传闻入日志", p.discovery.rumors.length >= 1, JSON.stringify(p.discovery.rumors));

console.log("== T6 未解锁区域无法进入 ==");
const lock = Rules.checkRegionAccess("capital");
T("圣辉城被锁", lock.ok === false && lock.text.includes("辉门"));
T("龙眠荒原被锁", Rules.checkRegionAccess("dragon_wastes").ok === false);
T("隐藏地点初始不可见", Game.hiddenUnlocked("mistwood", "moon_cave") === false);
St.get().flags.moss_glow_seen = 2;
T("线索集齐后隐藏地点解锁", Game.hiddenUnlocked("mistwood", "moon_cave") === true);

console.log("== T7 战斗结算与升级 ==");
St.get().flags.moss_glow_seen = 0;
p.level = 1; p.exp = 0; p.hp = p.maxHp; p.mp = p.maxMp;
Game.startCombat("wolf", 1);
let guard = 0;
while (Game.combat && guard++ < 40) Game.combatAction("skill", "fire_bolt");
T("战斗胜利", !Game.combat && guard < 40);
T("获得经验", p.exp > 0 || p.level > 1, "exp=" + p.exp + " lvl=" + p.level);
T("魔物入日志", p.discovery.monsters.includes("wolf"));

console.log("== T8 委托：世界偶遇触发 ≥4 且可接取 ==");
const encounterQuests = A.DATA.quests.handcrafted.filter(q => q.source === "encounter");
T("世界偶遇委托 ≥4", encounterQuests.length >= 4, encounterQuests.map(q => q.id).join(","));
p.location = { region: "mistwood", node: "forest_edge" };
const text = Game.explore();
T("林缘触发哭泣村民事件", Game.pendingOffer === "q_d_child" || (St.getFlag("met_crying_villager") && Game.pendingOffer === "q_d_caravan"), text.slice(0, 60));
if (Game.pendingOffer) {
  const qid = Game.pendingOffer;
  Game.acceptQuest(qid);
  T("委托已接取", St.questState(qid) === "active");
}

console.log("== T9 LLM JSON 容错解析 ==");
T("垃圾文本返回 null", LLM.parseContract("这是一段没有 JSON 的叙事") === null);
const ok = LLM.parseContract("```json\n{\"narration\":\"测试\",\"state_change_requests\":[{\"field\":\"gold\",\"delta\":10000}]}\n```");
T("markdown 包裹可解析", ok && ok.narration === "测试");
T("解析出的超额申请仍被引擎驳回", Rules.applyLLMChanges(ok.state_change_requests).rejected.length === 1);

console.log("== T10 声望称号与魔导书 ==");
T("初始称号无名小卒", St.repTitle(0) === "无名小卒");
T("20 声望注册猎人", St.repTitle(20) === "注册猎人");
const skills = St.unlockedSkills(A.DATA.grimoires);
T("1 级仅解锁第 1 页", skills.length === 1 && skills[0].page === 1);
p.level = 3;
T("3 级解锁第 2 页", St.unlockedSkills(A.DATA.grimoires).length === 2);
T("八属性全部开放且各有 4 页技能",
  A.DATA.grimoires.elements.length === 8 &&
  A.DATA.grimoires.elements.every(el => A.DATA.grimoires.books[el] && A.DATA.grimoires.books[el].pages.length === 4),
  A.DATA.grimoires.elements.join(","));
T("每本书第 2 页起有攻击或治疗手段",
  A.DATA.grimoires.elements.every(el => A.DATA.grimoires.books[el].pages.some(pg => pg.dmg || pg.heal)));

console.log("== T11 负重上限 ==");
p.inventory = [];
for (let i = 0; i < 25; i++) St.addItem("potion_heal", 1);
T("背包不超过 20 格", p.inventory.length <= 20, "slots=" + p.inventory.length);

console.log("== T12 休整推进天气与刷新悬赏板 ==");
p.location = { region: "ashford", node: "tavern" };
p.boardQuests = [];
const restText = Game.rest();
T("休整全恢复", p.hp === p.maxHp);
T("悬赏板已刷新", p.boardQuests.length === 2);
T("天气合法", ["clear", "rain", "fog", "cold"].includes(St.get().weather));

console.log("== T13 主线任务链与引导系统 ==");
St.newGame("引导测试", "fire"); // 全新开局，独立验证主线链
p = St.get().player;
T("开局自动开启第一章", St.questState("q_m_depart") === "active");
T("指引显示主线目标", Game.guideInfo().tag === "主线" && Game.guideInfo().title.includes("第一章"));
p.location = { region: "ashford", node: "gate" };
const mv = Game.moveTo("mistwood", "forest_edge");
T("抵达林缘触发主线推进", mv.includes("主线推进") || St.questState("q_m_depart") === "done");
T("自动接取第二章", St.questState("q_m_first") === "active");
T("主线共 6 章", A.DATA.quests.handcrafted.filter(q => q.series === "main").length === 6);
T("支线与主线已分区", A.DATA.quests.handcrafted.filter(q => q.series === "side").length >= 10);
Game.acceptQuest("q_d_wolves");
T("接委托推进第二章", St.questState("q_m_first") === "done" && St.questState("q_m_resolve") === "active");

console.log("== T14 交谈不重复开场白 ==");
const t1 = Game.talkTo("martha");
const t2 = Game.talkTo("martha");
T("首次含完整开场白", t1.includes("【玛尔塔·酒馆老板娘】"));
T("后续不再重复开场白", !t2.includes("【玛尔塔·酒馆老板娘】") && !t2.includes("回来了？先吃饭"));

console.log("== T15 世界扩容：连通性与区域锁 ==");
(function () {
  const R = Game.REGIONS;
  let linkOk = true;
  const seen = new Set(["ashford/tavern"]);
  const queue = [["ashford", "tavern"]];
  while (queue.length) {
    const [r, n] = queue.shift();
    const def = R[r] && R[r].nodes[n];
    if (!def) { linkOk = false; continue; }
    for (const [tr, tn] of def.links) {
      if (!R[tr] || !R[tr].nodes[tn]) { linkOk = false; console.log("    断链:", r + "/" + n, "->", tr + "/" + tn); continue; }
      const k = tr + "/" + tn;
      if (!seen.has(k)) { seen.add(k); queue.push([tr, tn]); }
    }
  }
  T("世界图无断链", linkOk);
  const total = Object.values(R).reduce((a, rg) => a + Object.keys(rg.nodes).length, 0);
  T("全图节点均从酒馆可达", seen.size === total, `可达 ${seen.size}/${total}`);
  T("开放区域共 5 个", Object.keys(R).length === 5);
  T("新锁定区域均被锁", ["whitesail", "windgrass", "ashenfen", "royal_tomb"].every(x => Rules.checkRegionAccess(x).ok === false));
  p.location = { region: "westwatch", node: "watch_yard" };
  const bd = Game.boardList("watch_yard");
  T("哨所告示板含新委托", bd.some(q => q.id === "q_d_grain") && bd.some(q => q.id === "q_c_hawks"));
  T("哨所告示不串台（无狼王/火元素）", !bd.some(q => q.id === "q_c_wolfking" || q.id === "q_c_elemental"));
})();

console.log("== T16 台词耗尽置灰 ==");
(function () {
  const guards = [];
  for (let i = 0; i < 12; i++) guards.push(Game.talkTo("brom"));
  const acts = Game.availableActions();
  p.location = { region: "ashford", node: "square" };
  const acts2 = Game.availableActions();
  const bromBtn = acts2.find(a => a.id === "talk" && a.payload === "brom");
  T("台词耗尽后按钮存在", !!bromBtn);
  T("台词耗尽后按钮置灰不可点", bromBtn && bromBtn.disabled === true);
  const t = Game.talkTo("brom");
  T("耗尽后交谈返回收尾语", t.includes("忙自己的事去了") || t.includes("【布洛姆】"));
})();

console.log("== T17 传闻消耗制：不重复、耗尽置灰 ==");
(function () {
  St.newGame("测试", "fire");
  const heard = [];
  let guard = 0;
  while (guard++ < 60) {
    const btn = Game.availableActions().find(a => a.id === "talk" && a.payload === "martha");
    if (!btn || btn.disabled) break;
    const t = Game.talkTo("martha");
    const m = t.match(/【传闻】(.+)/);
    if (m) heard.push(m[1]);
  }
  const dup = heard.filter((x, i) => heard.indexOf(x) !== i);
  T("交谈听到的传闻不重复", dup.length === 0, dup.join("|"));
  const btn2 = Game.availableActions().find(a => a.id === "talk" && a.payload === "martha");
  T("台词与传闻全部耗尽后按钮置灰", btn2 && btn2.disabled === true);
})();

console.log("== T18 战斗中自由文本由引擎接管（界面状态同步） ==");
await (async function () {
  St.newGame("测试", "fire");
  St.get().player.inventory.push({ id: "potion_heal", n: 1 });
  Game.startCombat("wolf", 1);
  T("战斗已开始", Game.combat !== null);
  // 战斗中输入道具文本 → 引擎直接结算（无需 API）
  const r1 = await Game.handleApiText("喝一瓶治疗药水");
  T("战斗中文本道具被引擎接管", r1.text.includes("治疗药水"));
  // 战斗中输入无关闲聊 → 拦截，状态不变
  const r2 = await Game.handleApiText("别打了，跟我聊聊人生理想");
  T("战斗中无关文本被拦截且战斗继续", r2.text.includes("战斗中无暇他顾") && Game.combat !== null);
  // 文本逃跑（含失败重试）→ 最终必然脱离战斗，界面可回到剧情态
  let guard = 0;
  while (Game.combat && guard++ < 15) await Game.handleApiText("逃跑");
  T("文本逃跑最终脱离战斗", Game.combat === null);
  // 胜利路径：再开一场打到底
  Game.startCombat("wolf", 1);
  guard = 0;
  while (Game.combat && guard++ < 30) await Game.handleApiText("攻击");
  T("文本攻击直至胜利/倒地均有结算", Game.combat === null || St.get().player.hp > 0);
  const acts = Game.availableActions();
  T("战斗结束后动作恢复非战斗态", !acts.some(a => a.id.startsWith("combat_")) || Game.combat !== null);
})();

console.log("== T19 装备槽与锻造 ==");
St.newGame("测试", "fire");
p = St.get().player;
St.addItem("pelt_wolf", 3); p.gold = 100;
p.location = { region: "ashford", node: "square" };
T("配方列表含可打造的狼皮甲", !!Game.recipeList().find(r => r.id === "armor_wolf" && r.can));
const cr = Game.craft("armor_wolf");
T("锻造成功并入包", cr.includes("狼皮甲") && St.countItem("armor_wolf") === 1);
T("材料与工钱被消耗", St.countItem("pelt_wolf") === 0 && p.gold === 70);
const defBefore = Rules.playerDef();
T("装备护甲", Game.equipItem("armor_wolf").includes("狼皮甲") && p.equipment.armor === "armor_wolf");
T("护甲防御生效", Rules.playerDef() === defBefore + 2, "def=" + Rules.playerDef());
T("已持有不可重复打造", Game.craft("armor_wolf").includes("已经有一件"));
T("卸下回背包", Game.unequipItem("armor").includes("狼皮甲") && p.equipment.armor === null && St.countItem("armor_wolf") === 1);
St.addItem("sword_firepat", 1);
T("装备武器", Game.equipItem("sword_firepat").includes("火纹剑") && p.equipment.weapon === "sword_firepat");
T("换武器旧件回包", (Game.equipItem("sword_storm") === "身上没有它。") && (St.addItem("sword_storm", 1), Game.equipItem("sword_storm").includes("惊雷剑")) && p.equipment.weapon === "sword_storm" && St.countItem("sword_firepat") === 1);
T("非广场不可锻造", (p.location = { region: "ashford", node: "tavern" }, Game.craft("sword_firepat").includes("铁匠铺")));

console.log("== T20 精英委托三段式：调查 → 准备 → 猎杀 ==");
St.newGame("测试", "fire");
p = St.get().player;
p.food = 10; p.water = 10;
Game.acceptQuest("q_c_wolfking");
p.location = { region: "mistwood", node: "watchtower" };
T("到场得线索 1", Game.explore().includes("1/2"));
T("再探得线索 2", Game.explore().includes("2/2"));
T("线索齐后出现挑战动作", Game.availableActions().some(a => a.id === "elite_fight"));
T("挑战进入精英战", (() => { const t = Game.doAction({ id: "elite_fight", payload: "wolfking" }); return Game.combat && Game.combat.elite && Game.combat.monsterId === "wolfking" && t.includes("灰鬃"); })());
Game.combat.hp = 1; // 锁定结局，专测结算链
Game.combatAction("skill", "attack");
T("狼王已死旗标", St.getFlag("wolfking_dead") === true);
T("图鉴击杀计数", (St.getFlag("mob_kill_wolfking") || 0) >= 1);
T("精英击杀记入近期事件", St.get().player.recentEvents.some(e => e.includes("狼王") || e.includes("猎杀")));
T("死后不再出现挑战动作", !Game.availableActions().some(a => a.id === "elite_fight"));
T("委托目标达成可交付", St.findQuest("q_c_wolfking").state === "ready");

console.log("== T21 地区声望与特权、逃兵道德岔路 ==");
St.newGame("测试", "fire");
p = St.get().player;
Game.acceptQuest("q_c_deserter");
St.setFlag("deserter_caught", true);
St.findQuest("q_c_deserter").state = "ready";
p.location = { region: "westwatch", node: "watch_yard" };
const rrBefore = St.get().player.regionRep.westwatch || 0;
const ti = Game.turnIn("q_c_deserter");
T("交付获得地区声望", (St.get().player.regionRep.westwatch || 0) > rrBefore && ti.includes("地区声望"));
T("近期事件记录交付", St.get().player.recentEvents.some(e => e.includes("名册上少的人")));
St.get().player.regionRep.lavarift = 10;
const stock = Game.shopStock("della");
T("熔岭声望≥10 黛拉半价", stock.every(s => s.half) && stock.every(s => s.price <= A.DATA.items[s.id].price));
St.get().player.regionRep.lavarift = 0;
T("声望不足恢复原价", Game.shopStock("della").every(s => !s.half));
St.get().player.regionRep.westwatch = 15;
p.location = { region: "westwatch", node: "watch_yard" };
T("西境声望≥15 出现私藏军械", Game.availableActions().some(a => a.id === "armory"));
p.gold = 100;
T("购得火纹剑", Game.doAction({ id: "armory" }).includes("火纹剑") && St.countItem("sword_firepat") === 1 && p.gold === 10);
T("军械一次性", Game.doAction({ id: "armory" }).includes("只有一件"));
St.newGame("测试", "fire");
p = St.get().player;
Game.acceptQuest("q_c_deserter");
St.setFlag("deserter_found", true);
p.location = { region: "thunderpass", node: "pass_foot" };
const dActs = Game.availableActions();
T("道德岔路两个动作出现", dActs.some(a => a.id === "deserter_catch") && dActs.some(a => a.id === "deserter_free"));
const fr = Game.doAction({ id: "deserter_free" });
T("放走了结委托且留下痕迹", St.findQuest("q_c_deserter").state === "done" && St.getFlag("deserter_freed") && fr.includes("军粮饼"));
T("岔路动作消失", !Game.availableActions().some(a => a.id === "deserter_catch" || a.id === "deserter_free"));

console.log("== T22 旧档迁移、时段推进、龙骰结算 ==");
St.newGame("测试", "fire");
const old = St.get();
delete old.player.equipment; delete old.player.regionRep; delete old.player.recentEvents; delete old.timeSeg;
St.set(old); St.save(); St.set(null);
T("旧档可读入", !!St.load());
const mp = St.get().player;
T("装备槽补默认值", !!mp.equipment && mp.equipment.weapon === null && mp.equipment.armor === null);
T("地区声望补默认值", !!mp.regionRep && typeof mp.regionRep.westwatch === "number");
T("近期事件与时段补默认值", Array.isArray(St.get().player.recentEvents) && typeof St.get().timeSeg === "number");
T("初始时段为清晨", St.timeName() === "清晨");
St.timeAdvance();
T("时段推进至白日", St.timeName() === "白日");
mp.gold = 50;
const dw = Game.diceSettle(true, 10);
T("龙骰赢局结算", mp.gold === 60 && (St.getFlag("dice_wins") || 0) === 1 && dw.includes("+10"));
const dl = Game.diceSettle(false, 20);
T("龙骰输局结算", mp.gold === 40 && dl.includes("−20"));
mp.gold = 5;
T("押注超过身家时封顶", (Game.diceSettle(false, 99), mp.gold === 0));

console.log("\n========================================");
console.log(`结果：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
