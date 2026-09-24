// 完整流程冒烟测试：模拟一次"出门→探索→护送→扎营→补给见底→回家→交付"的完整循环
import { createRequire } from "module";
const require = createRequire(import.meta.url);
require("../bundle.js"); require("../engine/state.js"); require("../engine/rules.js");
require("../engine/llm.js"); require("../engine/game.js");
const A = globalThis.ASTREA;
const St = A.State, Game = A.Game;

let pass = 0, fail = 0;
const T = (n, c, e) => { if (c) { pass++; console.log("  PASS  " + n); } else { fail++; console.log("  FAIL  " + n + (e ? " >> " + e : "")); } };
const fightOut = () => {
  let g = 0;
  while (Game.combat && g++ < 80) {
    const p = St.get().player;
    if (p.hp < p.maxHp * 0.4 && St.countItem("potion_heal") > 0) { Game.combatAction("item", "potion_heal"); continue; }
    const skills = St.unlockedSkills(A.DATA.grimoires).filter(s => s.dmg && s.mp <= p.mp);
    const best = skills.sort((a, b) => b.dmg - a.dmg)[0];
    Game.combatAction("skill", best ? best.id : "attack");
  }
};
const levelTo = (lv) => { const p = St.get().player; while (p.level < lv) St.addExp(p.level * 60); };

St.newGame("巡林人", "water");
const p = St.get().player;
Game.refreshBoard();

console.log("== 循环 1：出门 → 林缘偶遇 → 接委托 ==");
T("起点是酒馆", p.location.node === "tavern");
Game.moveTo("ashford", "square");
Game.moveTo("ashford", "gate");
Game.moveTo("mistwood", "forest_edge");
T("到达林缘小径", p.location.node === "forest_edge");
T("移动消耗了补给", p.food < 6 || p.water < 6, `food=${p.food} water=${p.water}`);
let txt = Game.explore();
T("触发村民偶遇", Game.pendingOffer === "q_d_child", txt.slice(0, 50));
Game.acceptQuest("q_d_child");
T("委托进行中", St.questState("q_d_child") === "active");

console.log("== 循环 2：深入森林 → 找到孩子 ==");
if (Game.combat) fightOut();
Game.moveTo("mistwood", "clearing");
// 空地触发青芷护送
txt = Game.explore();
T("触发青芷护送偶遇", Game.pendingOffer === "q_c_escort", txt.slice(0, 50));
Game.acceptQuest("q_c_escort");
T("护送战第一波开打", !!Game.combat);
fightOut();
T("第一波结束", !Game.combat);
Game.moveTo("mistwood", "deep_mist");
T("找到小荞，委托可交付", St.questState("q_d_child") === "ready");
T("月光苔线索集齐", (St.getFlag("moss_glow_seen") || 0) >= 2);
T("月光苔洞窟解锁", Game.hiddenUnlocked("mistwood", "moon_cave"));

console.log("== 循环 3：护送到猎户小屋（第二波） ==");
p.hp = p.maxHp; p.mp = p.maxMp; p.food = 6; p.water = 6; // 中途补给休整过，补满再赶路
Game.moveTo("mistwood", "clearing");
const arrive = Game.moveTo("mistwood", "hunter_hut");
T("抵达触发第二波", !!Game.combat, arrive.slice(-60));
fightOut();
T("护送完成可交付", St.questState("q_c_escort") === "ready");
// 加洛处交付
txt = Game.turnIn("q_c_escort");
T("护送委托交付", St.questState("q_c_escort") === "done", txt.slice(0, 50));
const goldAfterEscort = p.gold;
T("获得酬金", goldAfterEscort > 30);

console.log("== 循环 4：邀请同伴 → 扎营 → 营地事件 ==");
p.location = { region: "ashford", node: "tavern" };
T("未结识不可邀请", Game.inviteCompanion("brody").includes("搭个话"));
Game.introduceCompanion("brody");
T("结识剧情已触发", p.companions.met.includes("brody"));
Game.inviteCompanion("brody");
T("布罗迪同行", p.companions.with === "brody");
p.food = 9; p.hp = p.maxHp; p.mp = p.maxMp;
Game.moveTo("ashford", "square"); Game.moveTo("ashford", "gate");
Game.moveTo("mistwood", "forest_edge"); Game.moveTo("mistwood", "clearing");
const campTxt = Game.doCamp();
T("野营执行", campTxt.length > 10);
T("布罗迪篝火事件触发", campTxt.includes("布罗迪") || p.companions.eventsSeen.includes("brody_1"), campTxt.slice(-80));
if (Game.combat) fightOut();

console.log("== 循环 5：补给见底 → 强制回家 ==");
p.food = 0; p.water = 0; p.hp = 20;
Game.moveTo("mistwood", "forest_edge");
T("空腹移动掉血", p.hp < 20, "hp=" + p.hp);
Game.moveTo("ashford", "gate"); Game.moveTo("ashford", "square"); Game.moveTo("ashford", "tavern");
Game.dismissCompanion();
T("送同伴回家", p.companions.with === null);
const restTxt = Game.rest();
T("休整完成", p.hp === p.maxHp && restTxt.includes("天气"));

console.log("== 循环 6：林缘交付孩子 + 商队事件 ==");
Game.moveTo("ashford", "square"); Game.moveTo("ashford", "gate"); Game.moveTo("mistwood", "forest_edge");
txt = Game.turnIn("q_d_child");
T("孩子委托交付", St.questState("q_d_child") === "done", txt.slice(0, 50));
txt = Game.explore();
T("触发商队残骸事件", Game.pendingOffer === "q_d_caravan", txt.slice(0, 50));
Game.acceptQuest("q_d_caravan");
T("获得货箱碎片", St.countItem("crate_shard") === 1);
Game.updateQuestReadiness();
T("商队委托可交付", St.questState("q_d_caravan") === "ready");
if (Game.combat) fightOut();
Game.moveTo("ashford", "gate"); Game.moveTo("ashford", "square");
txt = Game.turnIn("q_d_caravan");
T("商队委托交付", St.questState("q_d_caravan") === "done");
T("burned_caravan_found 旗标", St.getFlag("burned_caravan_found") === true);

console.log("== 循环 7：悬赏板 → 接板 → 商店 → 强化 ==");
const board = Game.boardList("square");
T("悬赏板有手工 D 委托", board.some(q => q.id === "q_d_herb") && board.some(q => q.id === "q_d_wolves"));
T("悬赏板有生成委托", board.length >= 4, "count=" + board.length);
Game.acceptQuest("q_d_wolves");
p.gold = 100;
Game.buyItem("ada", "ration");
T("购买干粮", St.countItem("ration") >= 3, "ration=" + St.countItem("ration"));
Game.useItem("ration");
T("吃干粮回补给", p.food > 0);
const honeTxt = Game.honeWeapon();
T("武器强化", St.getFlag("weapon_honed") === true, honeTxt.slice(0, 40));

console.log("== 循环 8：裂谷 → 塌方救援委托 ==");
levelTo(5); // 模拟自然成长到 5 级再进裂谷（C 级区域）
St.addItem("potion_heal", 3);
p.hp = p.maxHp; p.mp = p.maxMp; p.food = 10; p.water = 10;
Game.moveTo("ashford", "gate"); Game.moveTo("lavarift", "rift_edge");
T("裂谷水消耗加倍", p.water <= 9, "water=" + p.water);
Game.moveTo("lavarift", "obsidian_slope");
txt = Game.explore();
if (Game.combat) fightOut();
T("触发塌方呼救", Game.pendingOffer === "q_c_collapse", txt.slice(0, 50));
Game.acceptQuest("q_c_collapse");
p.hp = p.maxHp;
Game.moveTo("lavarift", "lava_depths");
T("深处触发救援战", !!Game.combat);
fightOut();
T("救援目标达成", St.questState("q_c_collapse") === "ready", "state=" + St.questState("q_c_collapse"));
Game.moveTo("lavarift", "obsidian_slope"); Game.moveTo("lavarift", "miner_camp");
txt = Game.turnIn("q_c_collapse");
T("救援委托交付", St.questState("q_c_collapse") === "done", txt.slice(0, 50));
T("声望达到注册猎人线", p.reputation >= 20, "rep=" + p.reputation);

console.log("== 循环 9：存档往返 ==");
St.save();
const snap = JSON.stringify({ gold: p.gold, rep: p.reputation, lvl: p.level, quests: p.quests.filter(q => q.state === "done").length });
St.set(null);
St.load();
const p2 = St.get().player;
T("全量状态一致", JSON.stringify({ gold: p2.gold, rep: p2.reputation, lvl: p2.level, quests: p2.quests.filter(q => q.state === "done").length }) === snap);

console.log("\n========================================");
console.log(`结果：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
