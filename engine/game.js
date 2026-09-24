/* game.js — 游戏编排层：世界图、动作、探索、委托、同伴、传闻、商店（引擎通道的唯一入口） */
(function (G) {
  "use strict";
  const St = G.State;
  const R = () => G.Rules;

  /* ============ 世界图 ============ */
  const REGIONS = {
    ashford: { name: "烬炉镇", safe: true, nodes: {
      tavern: { name: "铜壶与龙息酒馆", links: [["ashford","square"],["ashford","guild"]], desc: "家。壁炉、炖菜、大新闻。" },
      guild:  { name: "酒馆二楼·公会联络点", links: [["ashford","tavern"]], desc: "芬恩的柜台，委托与声望。" },
      square: { name: "镇广场", links: [["ashford","tavern"],["ashford","gate"]], desc: "杂货店、铁匠铺、悬赏板、流民摊。" },
      gate:   { name: "镇门", links: [["ashford","square"],["mistwood","forest_edge"],["lavarift","rift_edge"],["westwatch","watch_gate"]], desc: "往北雾帷森林，往东熔痕裂谷，往西旧商道通西林哨所。" }
    }},
    mistwood: { name: "雾帷森林", nodes: {
      forest_edge: { name: "林缘小径", links: [["ashford","gate"],["mistwood","clearing"]], desc: "雾最薄的地方，采药小径的起点。" },
      clearing:    { name: "林间空地", links: [["mistwood","forest_edge"],["mistwood","watchtower"],["mistwood","hunter_hut"],["mistwood","deep_mist"]], camp: true, desc: "晒得到太阳的空地，适合扎营。" },
      watchtower:  { name: "废弃哨塔", links: [["mistwood","clearing"],["thunderpass","pass_foot"]], camp: true, desc: "旧边防塔，狼王灰鬃的领地外围。塔后有北行的山道，通往雷鸣山口。" },
      hunter_hut:  { name: "猎户小屋", links: [["mistwood","clearing"]], settlement: true, desc: "老猎户加洛的落脚点。基础补给、本地八卦、本地委托。" },
      deep_mist:   { name: "迷雾深处", links: [["mistwood","clearing"],["mistwood","moon_cave"]], camp: true, desc: "雾最浓处。三步之外，世界就只剩声音。" },
      moon_cave:   { name: "月光苔洞窟", links: [["mistwood","deep_mist"]], hidden: true, camp: true, desc: "洞壁覆满月光苔，整洞如浸在淡青色的月光里。" }
    }},
    lavarift: { name: "熔痕裂谷", nodes: {
      rift_edge:      { name: "裂谷边缘", links: [["ashford","gate"],["lavarift","obsidian_slope"]], camp: true, desc: "能俯瞰谷底岩浆河，风是烫的。" },
      obsidian_slope: { name: "黑曜石坡道", links: [["lavarift","rift_edge"],["lavarift","miner_camp"],["lavarift","lava_depths"]], camp: true, desc: "下矿主路，两侧是黑色玻璃质岩壁。" },
      miner_camp:     { name: "矿工营地", links: [["lavarift","obsidian_slope"]], settlement: true, desc: "黛拉说了算的营地。水比别处贵，情报也是。" },
      lava_depths:    { name: "熔痕深处", links: [["lavarift","obsidian_slope"],["lavarift","scale_ledge"]], camp: true, desc: "最靠近岩浆层的矿道群，热浪扭曲了空气。" },
      scale_ledge:    { name: "龙鳞岩台", links: [["lavarift","lava_depths"]], hidden: true, camp: true, desc: "岩层里嵌着一片桌面大的暗金色鳞。" }
    }},
    thunderpass: { name: "雷鸣山口", nodes: {
      pass_foot:   { name: "山口隘口", links: [["mistwood","watchtower"],["thunderpass","pass_mid"]], camp: true, desc: "旧关门遗址，商队在此歇脚。雷声在山脊上滚。" },
      pass_mid:    { name: "雷音栈道", links: [["thunderpass","pass_foot"],["thunderpass","pass_shrine"],["thunderpass","pass_overlook"]], camp: true, desc: "贴壁而行的旧军道，电弧在岩壁上爬行，风推着人往崖外去。" },
      pass_shrine: { name: "风暴神龛", links: [["thunderpass","pass_mid"]], camp: true, desc: "旧战争时期的祭祀所，供奉'镇雷者'。守龛老人住在旁边的石屋。" },
      pass_overlook: { name: "岭脊瞭望台", links: [["thunderpass","pass_mid"]], hidden: true, camp: true, desc: "哨塔链最高处。晴日里，圣辉城的尖塔第一次落进眼里。" }
    }},
    westwatch: { name: "西林哨所", safe: true, nodes: {
      watch_gate: { name: "哨所辕门", links: [["ashford","gate"],["westwatch","watch_yard"]], desc: "登记处与流民粥棚。名册、木牌、稀粥，一样不缺。" },
      watch_yard: { name: "哨所校场", links: [["westwatch","watch_gate"],["westwatch","armory"]], settlement: true, desc: "军需处、告示板、老兵的子弹壳棋局。二十七人喊出八百人的晨操。" },
      armory:     { name: "旧军械库", links: [["westwatch","watch_yard"]], desc: "上锁的石库。卫霜有钥匙，不给看。锁着的，都是不该再用的东西。" }
    }}
  };
  const WEATHERS = { clear: "晴", rain: "雨", fog: "大雾", cold: "极寒" };

  function regionName(r) { return REGIONS[r] ? REGIONS[r].name : r; }
  function weatherName(w) { return WEATHERS[w] || w; }
  function nodeDef(region, node) { return REGIONS[region].nodes[node]; }
  function findNodeByName(name) {
    for (const r in REGIONS) for (const n in REGIONS[r].nodes)
      if (REGIONS[r].nodes[n].name.includes(name) || name.includes(REGIONS[r].nodes[n].name)) return { region: r, node: n };
    return null;
  }
  function hiddenUnlocked(region, node) {
    const def = nodeDef(region, node);
    if (!def.hidden) return true;
    if (node === "moon_cave") return (St.getFlag("moss_glow_seen") || 0) >= 2;
    if (node === "scale_ledge") return !!(St.getFlag("scale_glow_seen") || St.getFlag("heard_scale_rumor") || St.getFlag("lute_clue"));
    if (node === "pass_overlook") return !!St.getFlag("spire_gaze_seen");
    return false;
  }

  const Game = { combat: null, pendingOffer: null, REGIONS, regionName, weatherName, nodeDef, findNodeByName };

  function P() { return St.get().player; }
  function saveNote() { St.clampVitals(); St.save(); }

  /* ============ 发现日志辅助 ============ */
  function discoverNode(region, node) {
    const key = region + "/" + node;
    if (St.discover("locations", key)) {
      const def = nodeDef(region, node);
      return `\n【发现日志】新地点：${regionName(region)}·${def.name}`;
    }
    return "";
  }

  /* ============ 时段：每两次行动（移动/探索）推进一段，一天四段 ============ */
  function tickTime() {
    const t = (St.getFlag("time_tick") || 0) + 1;
    St.setFlag("time_tick", t);
    if (t % 2 === 0) St.timeAdvance();
  }

  /* ============ 移动 ============ */
  function moveTo(region, node) {
    const p = P();
    const lock = G.Rules.checkRegionAccess(region);
    if (!lock.ok) { saveNote(); return lock.text; }
    const cur = nodeDef(p.location.region, p.location.node);
    const linked = cur.links.some(([r, n]) => r === region && n === node);
    if (!linked) return "从这里过不去。";
    if (!hiddenUnlocked(region, node)) return "那个方向只有浓雾与歧路——你还没有找到真正的路。";

    const notes = G.Rules.consumeForMove(region);
    p.location = { region, node };
    tickTime();
    const def = nodeDef(region, node);
    let text = `你来到了${regionName(region)}·${def.name}。${def.desc}`;
    if (notes.length) text += "\n" + notes.join("\n");
    text += discoverNode(region, node);
    // 安全区内走动：四成概率撞上镇/哨所的环境日常（世界不围着玩家转）
    if (REGIONS[region].safe && Math.random() < 0.4) {
      const table = (G.DATA.ambient_events[region] || []).filter(ev => !ev.battle && !(ev.once_flag && St.getFlag(ev.once_flag)));
      if (table.length) {
        const ev = pickWeighted(table);
        if (ev.once_flag) St.setFlag(ev.once_flag, true);
        if (ev.flag) St.addFlag(ev.flag, 1);
        text += "\n" + ev.text;
        if (ev.rumor) text += "\n" + hearRumorText(null);
      }
    }
    text += arrivalTriggers(region, node);
    if (!Game.combat) text += escortArrivalCheck();
    const mm = updateQuestReadiness();
    if (mm.length) text += "\n" + mm.join("\n");
    saveNote();
    return text;
  }

  function arrivalTriggers(region, node) {
    const p = P(); let t = "";
    // 委托：寻回小荞
    const qc = St.findQuest("q_d_child");
    if (node === "deep_mist" && qc && qc.state === "active" && !St.getFlag("found_doumiao")) {
      St.setFlag("found_doumiao", true); qc.state = "ready";
      t += "\n\n雾深处传来哼歌声——小荞蹲在一片微光的苔痕旁，毫发无损。'小鹿领我来的！'他指着雾气更深处，'它还给看了会发光的山洞，说是谢礼。'（委托目标达成，回林缘小径交还孩子）";
      St.setFlag("moss_glow_seen", Math.max(St.getFlag("moss_glow_seen") || 0, 2));
    }
    // 委托：塌方救援——进入熔痕深处触发战斗
    const qcol = St.findQuest("q_c_collapse");
    if (node === "lava_depths" && qcol && qcol.state === "active" && !St.getFlag("collapse_fight_done")) {
      St.setFlag("collapse_fight_done", true);
      t += "\n\n塌石堆外，两只火蜥蜴正绕着被困矿工的呼救声打转。没有绕开的余地了。";
      t += "\n" + startCombat("firesalamander", 2);
    }
    return t;
  }

  /* ============ 探索 ============ */
  function pickWeighted(events) {
    const w = s => { s.weather = s.weather || {}; };
    const weather = St.get().weather;
    const pool = events.map(ev => {
      let wt = ev.w;
      if (ev.weather_boost && ev.weather_boost[weather]) wt *= ev.weather_boost[weather];
      return { ev, wt };
    });
    const total = pool.reduce((a, x) => a + x.wt, 0);
    let roll = Math.random() * total;
    for (const x of pool) { roll -= x.wt; if (roll <= 0) return x.ev; }
    return pool[pool.length - 1].ev;
  }

  function explore() {
    const p = P();
    const { region, node } = p.location;
    if (REGIONS[region].safe) return "镇子里没什么可探索的——想找事做，去广场看看悬赏板，或者出门走远点。";
    const notes = G.Rules.consumeForExplore(region);
    tickTime();
    let text = notes.join("\n");

    // 1) 同伴探索事件（一次性）
    const compEv = tryCompanionExploreEvent(region);
    if (compEv) { saveNote(); return (text ? text + "\n" : "") + compEv; }

    // 2) 委托脚本遭遇（一次性/条件性）
    const scripted = scriptedEncounter(region, node);
    if (scripted) { saveNote(); return (text ? text + "\n" : "") + scripted; }

    // 3) 环境事件表
    const table = (G.DATA.ambient_events[region] || []).filter(ev => {
      if (ev.node && ev.node !== node) return false;
      if (ev.once_flag && St.getFlag(ev.once_flag)) return false;
      return true;
    });
    if (!table.length) { saveNote(); return text + "\n你在四周转了一圈，只有风。"; }
    const ev = pickWeighted(table);
    if (ev.once_flag) St.setFlag(ev.once_flag, true);
    if (ev.flag) St.addFlag(ev.flag, 1);
    let et = ev.text;

    if (ev.battle) {
      const count = ev.battle.count[0] + Math.floor(Math.random() * (ev.battle.count[1] - ev.battle.count[0] + 1));
      et = et.replace("{count}", count);
      text += (text ? "\n" : "") + et + "\n" + startCombat(ev.battle.monster, count);
    } else if (ev.gather) {
      text += (text ? "\n" : "") + et;
      for (const itemId of ev.gather) {
        const n = 1 + (Math.random() < 0.4 ? 1 : 0);
        const res = St.addItem(itemId, n);
        const nm = G.DATA.items[itemId].name;
        if (res.ok) {
          text += `\n获得 ${nm} ×${res.left ? n - res.left : n}。`;
          if (["herb_mist", "moss_stanch", "moss_moon"].includes(itemId) && St.discover("plants", itemId))
            text += `【发现日志】新植物：${nm}`;
        } else text += `\n背包已满，${nm} 只能放弃——负重逼你做出取舍。`;
      }
      if (ev.effect) applyAmbientEffect(ev.effect, t2 => { text += t2; });
    } else if (ev.effect) {
      text += (text ? "\n" : "") + et;
      const p2 = P();
      for (const k in ev.effect) {
        p2[k] += ev.effect[k];
        const nm = { hp: "HP", food: "食物", water: "水" }[k] || k;
        text += `（${nm} ${ev.effect[k] > 0 ? "+" : ""}${ev.effect[k]}）`;
      }
    } else if (ev.quest_hook) {
      Game.pendingOffer = ev.quest_hook;
      text += (text ? "\n" : "") + et + "\n（要管这件事吗？）";
    } else {
      if (ev.discovery) St.discover("locations", ev.discovery);
      text += (text ? "\n" : "") + et;
      if (ev.rumor) text += "\n" + hearRumorText(null);
    }
    updateQuestReadiness();
    saveNote();
    return text;
  }

  function applyAmbientEffect(effect) {
    const p = P();
    for (const k in effect) p[k] += effect[k];
  }

  /* ============ 精英委托三段式：调查 → 准备 → 猎杀 ============ */
  const ELITES = {
    wolfking: { quest: "q_c_wolfking", dead: "wolfking_dead", region: "mistwood", node: "watchtower", clueFlag: "clue_wolfking",
      arrive: "哨塔下的影子比别处浓。你放轻脚步绕了一圈——泥地上的爪印比寻常森林狼大出一倍，左后腿的印子浅。它有旧伤，而且走得不急。【调查线索 1/2：狼王的左后腿】",
      explore: "你在哨塔背风处找到一撮挂在断砖上的灰鬃，和半截啃剩的鹿角。鬃毛根部发白——它老了，靠的不是牙，是耐心。加洛的话浮上来：走得不急的东西，最会把人带迷。【调查线索 2/2：它靠耐心狩猎】\n（线索已足。挑战它之前——涂好剑油，设下捕兽夹，把药备齐。）",
      challenge: "挑战狼王灰鬃（可先涂剑油/设捕兽夹）",
      intro: "哨塔的阴影里，一双眼睛先你一步亮了。灰鬃踱出来，步子不急不缓——它看你的眼神，像在掂量你值不值得它费劲。\n" },
    fireelemental: { quest: "q_c_elemental", dead: "elemental_dead", region: "lavarift", node: "lava_depths", clueFlag: "clue_elemental",
      arrive: "矿道尽头的热浪不对劲——它不顺着风走，逆着风聚。你贴着岩壁看了一会儿：火光每凝一次，洞壁的苔就焦一圈，像有什么在收集热。【调查线索 1/2：它在聚拢热】",
      explore: "你蹲下身摸了摸地面的浮灰——灰是凉的，只有一道蜿蜒的轨迹烫手，轨迹尽头通向岩浆层。岩叔的话浮上来：失控的元素没有心智，只有「烧」。它不会躲。【调查线索 2/2：它不会躲】\n（线索已足。水是你最大的胜算；动手前，做好万全准备。）",
      challenge: "挑战失控火元素（可先涂剑油/设捕兽夹）",
      intro: "岩浆层方向的热浪忽然拧成一团——火光拔地而起，凝成一个没有心智、只有「烧」的形体。失控火元素发现了你。\n" },
    shrine_ape: { quest: "q_c_shrine", dead: "shrine_ape_dead", region: "thunderpass", node: "pass_shrine", clueFlag: "clue_shrine_ape",
      arrive: "神龛的石门虚掩着，门轴上有新鲜的抓痕。供桌上的祭品被翻得乱七八糟，唯独那口石磬擦得发亮——占着这里的东西，在乎的不是吃食。【调查线索 1/2：它在守着什么】",
      explore: "你在石屋后墙找到一排旧爪印，上头叠着新爪印——老魈在这里住了很多年，久到把神龛当成了自己的东西。守龛老人隔着窗低声说：「守着不是自己的东西，最怕的也是不是自己的东西。」【调查线索 2/2：暗蚀之术能乱它心神】\n（线索已足。它发狂的时候，就是你出手的时候。）",
      challenge: "挑战神龛魈王（可先涂剑油/设捕兽夹）",
      intro: "石门后传来抓挠声——一头老魈把风暴神龛占成了王座。看见你，它抄起供桌上的石磬，发出刺耳的咆哮。\n" }
  };
  function eliteAt(region, node) {
    for (const k in ELITES) {
      const e = ELITES[k];
      if (e.region === region && e.node === node) {
        const q = St.findQuest(e.quest);
        if (q && q.state === "active" && !St.getFlag(e.dead)) return { key: k, def: e, quest: q };
      }
    }
    return null;
  }

  /* ============ 委托：脚本遭遇 ============ */
  function scriptedEncounter(region, node) {
    // 哭泣的村民（寻回小荞）
    if (region === "mistwood" && node === "forest_edge" && !St.getFlag("met_crying_villager") && !St.findQuest("q_d_child")) {
      St.setFlag("met_crying_villager", true);
      Game.pendingOffer = "q_d_child";
      return "林缘传来哭声。一个村妇瘫坐在路边，死死抓住你的袖子：她的儿子小荞追着一只'发光的小鹿'跑进林子，已经半天了。'求求你，他就八岁，他说那小鹿在跟他招手……'\n（要管这件事吗？）";
    }
    // 被烧毁的商队
    if (region === "mistwood" && node === "forest_edge" && !St.getFlag("caravan_encounter") && St.getFlag("met_crying_villager")) {
      St.setFlag("caravan_encounter", true);
      Game.pendingOffer = "q_d_caravan";
      return "小径旁的灌木一片焦黑——一支商队在这里被烧成了炭。车辙、断辕、散落一地的焦货。没有活口，也没有尸体，像被什么巨大的东西'路过'了。灰烬里，一块货箱碎片上还留着艾达杂货店的烙印。\n（把碎片带回去吗？）";
    }
    // 被困的青芷（护送委托）
    if (region === "mistwood" && node === "clearing" && !St.getFlag("met_xiaoduan_trapped") && !St.findQuest("q_c_escort")) {
      St.setFlag("met_xiaoduan_trapped", true);
      Game.pendingOffer = "q_c_escort";
      return "林间空地边缘，一个背着药篓的少年正被两只森林狼逼在树上，药篓挂得比他人还高。是布罗迪的学徒青芷。他看见你，哭腔都破了音：'帮、帮帮忙！我师父说采药要看天时，天时它起了雾啊！'\n（出手吗？）";
    }
    // 塌方呼救（救援委托）
    if (region === "lavarift" && node === "obsidian_slope" && !St.getFlag("heard_collapse") && !St.findQuest("q_c_collapse")) {
      St.setFlag("heard_collapse", true);
      Game.pendingOffer = "q_c_collapse";
      return "坡道下方传来闷响，接着是压着嗓子的呼救——一条支矿道塌了，有人被堵在熔痕深处。几个矿工围在塌口不敢擅动：'里面有火蜥蜴被惊了……'\n（下去救人吗？）";
    }
    // 精英委托：现场调查（线索逐条收集，集齐后由玩家发起猎杀）
    const el = eliteAt(region, node);
    if (el) {
      const clues = St.getFlag(el.def.clueFlag) || 0;
      if (clues === 0) { St.setFlag(el.def.clueFlag, 1); return el.def.arrive; }
      if (clues === 1) { St.setFlag(el.def.clueFlag, 2); return el.def.explore; }
      return null; // 线索已齐——等待玩家主动挑战
    }
    // 逃兵阿七（道德岔路）
    if (region === "thunderpass" && node === "pass_foot") {
      const qd = St.findQuest("q_c_deserter");
      if (qd && qd.state === "active" && !St.getFlag("deserter_found")) {
        St.setFlag("deserter_found", true);
        return "旧关门的断墙后缩着一个穿旧军袄的少年，怀里抱着半块军粮饼——是阿七。他看清你，没跑，只是把饼掰了一半递过来：'你也走这条道？……是卫百夫长让你来的吧。'他笑了笑，比哭还难看：'我不是怕打仗。我娘病在灰潮边上，军中不准假。……你要拿我回去吗？'";
      }
    }
    // 岭脊瞭望台：远眺圣辉城
    if (region === "thunderpass" && node === "pass_overlook" && !St.getFlag("saw_capital")) {
      St.setFlag("saw_capital", true);
      const p2 = P(); p2.reputation += 5;
      St.discover("locations", "capital_seen");
      return "你爬上哨塔链最高处的瞭望台。风把云层撕开一道缝——\n圣辉城。八座尖塔，很小，很白，很远，但真实存在。所有人在嘴里说的那个地方，第一次落进了你眼里。\n你看了很久，直到云重新合上。（声望 +5：你是亲眼见过王都的人了）";
    }
    // 月琴
    if (region === "lavarift" && node === "scale_ledge") {
      const q = St.findQuest("q_c_lute");
      if (q && q.state === "active" && St.countItem("moonlute") === 0 && !St.getFlag("lute_found")) {
        St.setFlag("lute_found", true);
        St.addItem("moonlute", 1);
        q.state = "ready";
        return "龙鳞岩台的背风处，一把六弦琴安静地倚着岩壁，琴弦在谷底的红光里微微泛亮——镜湖的月琴。它怎么会在这儿，MVP……不，没人说得清。（获得月琴，回去找莱恩吧）";
      }
    }
    // 月光苔洞窟采集
    if (region === "mistwood" && node === "moon_cave") {
      const first = !St.getFlag("moon_cave_gathered");
      const n = first ? 2 : (Math.random() < 0.5 ? 1 : 0);
      let t = first ? "你屏住呼吸走进洞窟——整面洞壁覆满月光苔，淡青色的光像把月亮沉进了山里。" : "洞窟里的月光苔又长得厚了些。";
      if (n > 0) {
        const res = St.addItem("moss_moon", n);
        if (res.ok) { t += `\n你小心采下月光苔 ×${n}。`; if (St.discover("plants", "moss_moon")) t += "【发现日志】新植物：月光苔"; }
        else t += "\n背包已满，只能看着满壁的光叹气。";
      } else t += "今日没有可采的苔。";
      St.setFlag("moon_cave_gathered", true);
      return t;
    }
    // 龙鳞岩台
    if (region === "lavarift" && node === "scale_ledge" && !St.getFlag("scale_ledge_found")) {
      St.setFlag("scale_ledge_found", true);
      St.addItem("dragon_scale_shard", 1);
      St.addFlag("dragon_rumor_count", 2);
      const p = P(); p.reputation += 15;
      St.discover("locations", "scale_ledge");
      return "岩台的岩层里嵌着一片桌面大的暗金色鳞，边缘锋利如新。你伸手碰了碰——指尖传来的不是石头的凉，而是一种沉睡的、缓慢的温热。你撬下一小块崩落的碎片收好。整片鳞纹丝不动，像在等它的主人回来。\n【发现日志】龙鳞岩台（声望 +15：这是会被讲很多年的事迹）";
    }
    return null;
  }

  /* ============ 委托系统 ============ */
  function questDef(id) { return G.DATA.quests.handcrafted.find(h => h.id === id); }

  function acceptQuest(id) {
    Game.pendingOffer = null;
    const def = questDef(id);
    if (!def) { // 悬赏板生成委托
      const bq = P().boardQuests.find(q => q.id === id);
      if (bq && bq.state === "offered") { bq.state = "active"; saveNote(); return `接下了委托「${bq.name}」。`; }
      return "没有这项委托。";
    }
    if (St.findQuest(id)) return "这项委托已经在你的日志里了。";
    P().quests.push({ id, state: "active", progress: 0 });
    St.setFlag("any_quest_accepted", true);
    St.pushEvent(`接下了「${def.name}」`);
    let extra = "";
    if (id === "q_c_escort") {
      St.setFlag("escorting_xiaoduan", true);
      extra = "\n青芷从树上溜下来，紧紧跟在你身后：'去猎户小屋……加洛爷爷的汤，师父说能压惊。'\n树下的狼群可没打算让路。";
      extra += "\n" + startCombat("wolf", 2);
    }
    if (id === "q_d_caravan") { St.addItem("crate_shard", 1); extra = "\n（获得货箱碎片）"; }
    let text = `接下委托「${def.name}」（${def.rank} 级）。${def.brief}${extra}`;
    const mm = updateQuestReadiness();
    if (mm.length) text += "\n" + mm.join("\n");
    saveNote();
    return text;
  }

  function declineOffer() {
    Game.pendingOffer = null;
    saveNote();
    return "你按下心里的波澜，继续赶路。世界很大，管不过来的事也很多——这也是实话。";
  }

  function updateQuestReadiness() {
    const p = P();
    const msgs = [];
    for (const q of p.quests) {
      if (q.state !== "active") continue;
      const def = questDef(q.id);
      if (!def) continue;
      if (def.auto) {
        // 主线：目标达成即自动完成并链式推进
        if (G.Rules.checkObjective(q, def)) {
          q.state = "done";
          const rw = def.rewards || {};
          let msg = `【主线推进】「${def.name}」完成`;
          if (rw.gold) { p.gold += rw.gold; msg += `，金币 +${rw.gold}`; }
          if (rw.rep) { p.reputation += rw.rep; msg += `，声望 +${rw.rep}`; }
          if (rw.exp) {
            const ups = St.addExp(rw.exp);
            msg += `，经验 +${rw.exp}`;
            if (ups.length) msg += "（升级！魔导书翻开了新的一页）";
          }
          if (def.auto_text) msg += "\n" + def.auto_text;
          if (def.next) {
            p.quests.push({ id: def.next, state: "active", progress: 0 });
            const nd = questDef(def.next);
            msg += `\n【新主线】「${nd.name}」——${nd.hint || nd.brief}`;
          }
          msgs.push(msg);
        }
        continue;
      }
      if (G.Rules.checkObjective(q, def)) q.state = "ready";
    }
    for (const q of p.boardQuests) {
      if (q.state !== "active") continue;
      if (q.type === "kill" && q.progress >= q.count) q.state = "ready";
      if (q.type === "collect" && St.countItem(q.item) >= q.count) q.state = "ready";
    }
    return msgs;
  }

  /* ============ 当前目标指引 ============ */
  const TURNIN_NAME = { villager: "林缘的村妇", miner: "矿工们", auto: "（自动完成）" };
  function guideInfo() {
    const p = P();
    const activeMain = p.quests.find(q => { const d = questDef(q.id); return d && d.series === "main" && q.state !== "done"; });
    if (activeMain) {
      const d = questDef(activeMain.id);
      return { tag: "主线", title: d.name, text: d.hint || d.brief };
    }
    const ready = p.quests.find(q => q.state === "ready") || p.boardQuests.find(q => q.state === "ready");
    if (ready) {
      const d = questDef(ready.id);
      const who = d ? (TURNIN_NAME[d.turnin] || (G.DATA.npcs[d.turnin] && G.DATA.npcs[d.turnin].name) || "委托人") : "芬恩（酒馆二楼）";
      return { tag: "交付", title: d ? d.name : ready.name, text: "目标已达成——回到 " + who + " 处交付领取酬劳。" };
    }
    const activeSide = p.quests.find(q => { const d = questDef(q.id); return d && d.series === "side" && q.state === "active"; });
    if (activeSide) {
      const d = questDef(activeSide.id);
      return { tag: "支线", title: d.name, text: d.brief };
    }
    return { tag: "旅途", title: "自由探索", text: "没有迫近的目标。出门走走——委托会自己撞上你；补给见底、负重满时，就回家。" };
  }

  function turnIn(id) {
    const p = P();
    const q = St.findQuest(id);
    if (!q || q.state !== "ready") return "这项委托还不能交付。";
    const def = questDef(id);
    let rw, name;
    if (def) {
      rw = def.rewards; name = def.name;
      if (def.objective.type === "collect") St.removeItem(def.objective.item, def.objective.count);
      if (def.side_effect && def.side_effect.flag)
        for (const k in def.side_effect.flag) St.setFlag(k, def.side_effect.flag[k]);
    } else {
      rw = { gold: q.gold, rep: q.rep, exp: q.exp }; name = q.name;
      if (q.type === "collect") St.removeItem(q.item, q.count);
    }
    q.state = "done";
    St.setFlag("any_quest_completed", true);
    if (def && def.rank === "C") St.setFlag("c_quest_done", true);
    p.gold += rw.gold; p.reputation += rw.rep;
    St.pushEvent(`完成了「${name}」`);
    // 地区声望：交付对象所在地区 +酬劳声望的一半（当地人会记你的好）
    const tnNpc = def && G.DATA.npcs[def.turnin];
    let repMsg = "";
    if (tnNpc) {
      const n = Math.max(1, Math.ceil(rw.rep / 2));
      St.addRegionRep(tnNpc.region, n);
      repMsg = `\n【地区声望】${regionName(tnNpc.region)} +${n}——当地人记下了你的名字。`;
    }
    const ups = St.addExp(rw.exp);
    let text = def ? def.complete_text : `芬恩按条例登记完毕：「${name}」已结算。`;
    text += `\n【委托完成】${name}：金币 +${rw.gold}，声望 +${rw.rep}，经验 +${rw.exp}${repMsg}`;
    if (ups.length) text += `\n【升级！】你到了 ${P().level} 级——魔导书"哗"地翻过新的一页。`;
    if (def && def.id === "q_c_collapse") text += "\n获救的小燧逢人就讲你的事。营地里看你的眼神，不一样了。";
    const mm = updateQuestReadiness();
    if (mm.length) text += "\n" + mm.join("\n");
    saveNote();
    return text;
  }

  /* ============ 悬赏板 ============ */
  function refreshBoard() {
    const p = P();
    p.boardQuests = [];
    const tpl = G.DATA.quests.board_generator.templates;
    for (let i = 0; i < 2; i++) {
      const t = tpl[Math.floor(Math.random() * tpl.length)];
      const count = t.count[0] + Math.floor(Math.random() * (t.count[1] - t.count[0] + 1));
      const gold = t.gold[0] + Math.floor(Math.random() * (t.gold[1] - t.gold[0] + 1));
      let q;
      if (t.type === "kill") {
        const m = t.monsters[Math.floor(Math.random() * t.monsters.length)];
        q = { id: "bq_" + Date.now() + "_" + i, type: "kill", monster: m, count, progress: 0,
              name: t.names[Math.floor(Math.random() * t.names.length)] + "：" + G.DATA.monsters[m].name + " ×" + count,
              gold, rep: t.rep, exp: t.exp, state: "offered" };
      } else {
        const it = t.items[Math.floor(Math.random() * t.items.length)];
        q = { id: "bq_" + Date.now() + "_" + i, type: "collect", item: it, count, progress: 0,
              name: "征购：" + G.DATA.items[it].name + " ×" + count,
              gold, rep: t.rep, exp: t.exp, state: "offered" };
      }
      p.boardQuests.push(q);
    }
  }

  function boardList(node) {
    const p = P();
    const out = [];
    const srcMap = { square: "board", hunter_hut: "notice", miner_camp: "notice", watch_yard: "notice" };
    for (const def of G.DATA.quests.handcrafted) {
      const q = St.findQuest(def.id);
      if (q) continue;
      if (def.source !== srcMap[node]) continue;
      if (def.source === "notice") {
        // 告示归属委托人所在的据点
        const giverNpc = G.DATA.npcs[def.giver];
        if (!giverNpc || giverNpc.node !== node) continue;
      }
      if (def.source === "board" && node !== "square") continue;
      out.push({ id: def.id, label: `[${def.rank}] ${def.name} — ${def.brief}`, state: "offered" });
    }
    if (node === "square")
      for (const q of p.boardQuests)
        if (q.state === "offered") out.push({ id: q.id, label: `[D] ${q.name}（酬金 ${q.gold}）`, state: "offered" });
    return out;
  }

  /* ============ 战斗编排 ============ */
  function startCombat(monsterId, count) {
    Game.combat = G.Rules.makeCombat(monsterId, count);
    const m = G.DATA.monsters[monsterId];
    if (St.discover("monsters", monsterId))
      Game.combat.log.push(`【发现日志】新魔物：${m.name}`);
    return `遭遇战斗：${Game.combat.displayName}！${m.desc}`;
  }

  function combatAction(kind, payload) {
    const p = P();
    const c = Game.combat;
    if (!c) return "（不在战斗中）";
    let res;
    if (kind === "flee") {
      res = G.Rules.tryEscape();
      if (res.ok) { Game.combat = null; saveNote(); return res.text; }
      if (res.playerDown) return res.text + "\n" + onPlayerDown();
      saveNote(); return res.text;
    }
    if (kind === "item") {
      const def = G.DATA.items[payload];
      if (!def || !def.battle) return "那件东西在战斗里派不上用场。";
      if (St.countItem(payload) <= 0) return "没有了。";
      St.removeItem(payload, 1);
      let t = `你用掉了${def.name}。`;
      if (def.buff === "dmg_up") { c.playerBuff = "dmg_up"; t = `你把${def.name}仔细抹上刃口，油膜在光下泛起一层薄亮。你的下一次攻击伤害 +50%。`; }
      else if (def.buff === "snare") { c.snare = true; t = `你把${def.name}压进脚边的浮土，只露出一线寒光。敌人的下一次反击将落空。`; }
      else { for (const k in def.effect) { p[k] += def.effect[k]; t += `（${k === "hp" ? "HP" : "法力"} +${def.effect[k]}）`; } }
      St.clampVitals();
      const er = G.Rules.enemyTurn();
      t += "\n" + er.text;
      if (er.playerDown) return t + "\n" + onPlayerDown();
      saveNote(); return t;
    }
    // 技能 / 普攻
    res = G.Rules.playerAttack(payload);
    let text = res.text;
    if (res.victory) return text + "\n" + onVictory();
    if (res.playerDown) return text + "\n" + onPlayerDown();
    saveNote();
    return text;
  }

  function onVictory() {
    const p = P();
    const c = Game.combat;
    Game.combat = null;
    p.gold += c.gold;
    const ups = St.addExp(c.exp);
    let text = `【战斗胜利】${c.displayName} 倒下了。金币 +${c.gold}，经验 +${c.exp}`;
    // 图鉴：击杀计数 + 战利品掉落
    St.addFlag("mob_kill_" + c.monsterId, c.count);
    const md = G.DATA.monsters[c.monsterId];
    if (md.drops) for (const dr of md.drops) {
      if (Math.random() < dr.chance) {
        const r = St.addItem(dr.id, dr.n);
        if (r.ok) text += `\n战利品：${G.DATA.items[dr.id].name} ×${dr.n}。`;
      }
    }
    if (c.elite) St.pushEvent(`猎杀了${c.name}`);
    if (ups.length) text += `\n【升级！】你到了 ${p.level} 级——生死之间，魔导书翻过了新的一页（HP/法力上限提升并完全恢复）。`;
    // 委托进度
    for (const q of p.quests) {
      if (q.state !== "active") continue;
      const def = questDef(q.id);
      if (def && def.objective.type === "kill" && def.objective.monster === c.monsterId) {
        q.progress += c.count;
        if (G.Rules.checkObjective(q, def)) {
          q.state = "ready";
          text += `\n【委托目标达成】「${def.name}」——回去交付吧。`;
          if (def.objective.then_flag) St.setFlag(def.objective.then_flag, true);
        } else text += `\n（「${def.name}」进度 ${q.progress}/${def.objective.count}）`;
      }
    }
    for (const q of p.boardQuests) {
      if (q.state === "active" && q.type === "kill" && q.monster === c.monsterId) {
        q.progress += c.count;
        if (q.progress >= q.count) { q.state = "ready"; text += `\n【委托目标达成】「${q.name}」。`; }
      }
    }
    if (c.monsterId === "wolfking") St.setFlag("wolfking_dead", true);
    if (c.monsterId === "fireelemental") St.setFlag("elemental_dead", true);
    if (c.monsterId === "shrine_ape") St.setFlag("shrine_ape_dead", true);
    // 薇拉护主事件
    if (c.veraProtected) {
      const ev = G.DATA.npcs.vera.events.find(e => e.id === "vera_2");
      if (!P().companions.eventsSeen.includes("vera_2")) {
        P().companions.eventsSeen.push("vera_2");
        text += "\n\n" + ev.text;
      }
    }
    // 护送到达判定（战斗结束后若在猎户小屋）
    escortArrivalCheck();
    updateQuestReadiness();
    saveNote();
    return text;
  }

  function onPlayerDown() {
    const p = P();
    Game.combat = null;
    const lost = Math.floor(p.gold * 0.1);
    p.gold -= lost;
    p.hp = Math.max(1, Math.floor(p.maxHp / 2));
    p.location = { region: "ashford", node: "tavern" };
    St.pushEvent("重伤倒地，被抬回了烬炉镇");
    saveNote();
    return `你醒来时，头顶是酒馆熟悉的房梁。玛尔塔把一碗热汤墩在床头：'命是捡回来的，汤是自己喝下去的。选一个。'（巡林人把你抬回了烬炉镇。金币 −${lost}，HP 恢复至一半）`;
  }

  function escortArrivalCheck() {
    const p = P();
    const q = St.findQuest("q_c_escort");
    if (q && q.state === "active" && St.getFlag("escorting_xiaoduan") &&
        p.location.region === "mistwood" && p.location.node === "hunter_hut" && !Game.combat) {
      if (!St.getFlag("escort_wave2_done")) {
        St.setFlag("escort_wave2_done", true);
        return "\n猎户小屋的烟囱已在眼前——狼群却从雾里做了最后一次扑击！\n" + startCombat("wolf", 2);
      }
      St.setFlag("escorting_xiaoduan", false);
      St.setFlag("escorted_xiaoduan", true);
      q.state = "ready";
      return "\n青芷一头扎进猎户小屋，加洛的热汤已经墩在了桌上。（护送达成，向加洛复命吧）";
    }
    return "";
  }

  /* ============ 野营与营地事件 ============ */
  function doCamp() {
    const p = P();
    const node = nodeDef(p.location.region, p.location.node);
    if (!node.camp) return "这里不是扎营的地方。找一处背风、离水、视野开阔的野地。";
    const res = G.Rules.camp();
    if (!res.ok) { saveNote(); return res.text; }
    St.get().timeSeg = 0; // 一觉到天亮
    let text = res.text;
    // 同伴计数
    const withId = p.companions.with;
    if (withId) p.companions.together[withId] = (p.companions.together[withId] || 0) + 1;
    // 营地事件：同伴事件优先
    const compEv = tryCompanionCampEvent();
    if (compEv) text += "\n\n" + compEv;
    else {
      const table = G.DATA.ambient_events.camp.filter(e => e.id !== "camp_companion");
      const ev = pickWeighted(table);
      if (ev.battle) {
        const count = ev.battle.count[0] + Math.floor(Math.random() * (ev.battle.count[1] - ev.battle.count[0] + 1));
        text += "\n\n" + ev.text + "\n" + startCombat(ev.battle.monster, count);
      } else if (ev.rumor) {
        text += "\n\n" + ev.text + "\n" + hearRumorText(null);
      } else text += "\n\n" + ev.text;
    }
    saveNote();
    return text;
  }

  function tryCompanionCampEvent() {
    const p = P();
    const withId = p.companions.with;
    if (!withId) return null;
    const npc = G.DATA.npcs[withId];
    const seen = p.companions.eventsSeen;
    for (const ev of npc.events) {
      if (ev.trigger !== "camp" || seen.includes(ev.id)) continue;
      if (ev.after && !seen.includes(ev.after)) continue;
      if ((p.companions.together[withId] || 0) < (ev.min_together || 1)) continue;
      seen.push(ev.id);
      return ev.text;
    }
    return null;
  }

  function tryCompanionExploreEvent(region) {
    const p = P();
    const withId = p.companions.with;
    if (!withId) return null;
    const npc = G.DATA.npcs[withId];
    const seen = p.companions.eventsSeen;
    for (const ev of npc.events) {
      if (ev.trigger !== "explore" || seen.includes(ev.id)) continue;
      if (ev.region && ev.region !== "any_wild" && ev.region !== region) continue;
      if (ev.region === "any_wild" && REGIONS[region].safe) continue;
      if ((p.companions.together[withId] || 0) < (ev.min_together || 1)) continue;
      seen.push(ev.id);
      let t = ev.text;
      if (ev.id === "brody_2") { const r = St.addItem("moss_moon", 1); if (r.ok) t += "\n（获得月光苔 ×1）"; }
      if (ev.battle) t += "\n" + startCombat(ev.battle, 2);
      return t;
    }
    return null;
  }

  /* ============ 同伴结识与邀请 ============ */
  const COMPANION_INTROS = {
    brody: {
      button: "搭话：站在凳子上吵架的矮人",
      text: "酒馆中央，一个矮人正站在板凳上，同时跟三个商人吵架——关于今年的麦芽、去年的债，和某种蘑菇到底有没有毒。玛尔塔朝那边努了努嘴：'布罗迪，药剂师，布洛姆的远房侄儿，来咱们这儿七年了。人不坏，就是话比人多。'\n吵架中场休息，矮人注意到了你——准确地说是你手背上的魔导书烙印。他三步并两步凑过来，眼睛亮得像两枚铜币：'觉醒者！出门吗？带上我！林子里有几味药我想了很久了！'\n（已结识：布罗迪·药剂师——现在可以邀请他同行了。）"
    },
    vera: {
      button: "搭话：角落独桌的剑士",
      text: "酒馆最暗的角落独占着一张桌子，一个女人在擦剑。周围的桌子全是空的——不是没人想坐，是没人敢坐。玛尔塔给你续碗时压低了声音：'薇拉，流浪剑士，来了三个月。没人听她说过超过十个字。'\n你走近时，她抬起了眼。那目光不凶，只是……像淬过火的铁，凉，且硬。她看了你两秒，把长凳上的剑挪开了一拳的距离。\n——在薇拉这里，这就算欢迎了。\n（已结识：薇拉·流浪剑士——现在可以邀请她同行了。）"
    },
    kane: {
      button: "搭话：对稻草人练枪的少年",
      text: "广场边上，一个少年正对着稻草人演练骑士枪的持法，嘴里还给自己配着号角声：'咚！咚咚！银棘骑士团——凯因——参上！'\n他余光扫到你，一个急立正，木枪差点脱手：'你看、看到了？不对，你手背——是魔导书！你是觉醒者！'他凑上来，声音压得像在说军情：'我叫凯因，未来的银棘骑士。你要出门冒险的话——带上我，我认路，我力气大，我还能帮你背干粮！'\n（已结识：凯因·热血少年——现在可以邀请他同行了。）"
    }
  };
  function introduceCompanion(id) {
    const p = P();
    const intro = COMPANION_INTROS[id];
    if (!intro) return "……（没有回应）";
    if (!p.companions.met.includes(id)) p.companions.met.push(id);
    saveNote();
    return intro.text;
  }

  function inviteCompanion(id) {
    const p = P();
    const npc = G.DATA.npcs[id];
    if (!npc || !npc.companion) return "他不能同行。";
    if (!p.companions.met.includes(id)) return "你们还没打过照面。先上前搭个话吧。";
    if (p.companions.with === id) return `${npc.name}已经跟你同行了。`;
    if (p.companions.with) return `一次只能与一位同伴同行（当前：${G.DATA.npcs[p.companions.with].name}）。`;
    p.companions.with = id;
    St.pushEvent(`${npc.name}开始与你同行`);
    const quips = {
      brody: "布罗迪把药箱往肩上一甩：'正好，林子里有几味药我想了很久了。走吧走吧，路上的话我一个顶仨。'",
      vera: "薇拉站起身，把剑挂回腰间，只说了两个字：'带路。'",
      kane: "凯因差点把木剑挥到灯上：'真的？！等等我我拿干粮——好了！出发！'"
    };
    saveNote();
    return quips[id] + "\n（同行提示：从据点结伴出发会多消耗一份食物。）";
  }

  function dismissCompanion() {
    const p = P();
    if (!p.companions.with) return "你身边没有同伴。";
    const nm = G.DATA.npcs[p.companions.with].name;
    p.companions.with = null;
    saveNote();
    return `${nm}朝你点点头，转身走进了各自的日子里。酒馆的门帘落下，世界又剩你一个人。`;
  }

  /* ============ 传闻八卦 ============ */
  // freshOnly=true 时只返回没听过的传闻（用于"交谈"消耗制）；false 时 once 传闻仍只出现一次（用于"听大新闻"）
  function eligibleRumors(sourceId, freshOnly) {
    const seen = P().discovery.rumors;
    return G.DATA.rumors.filter(r => {
      if (sourceId && !r.source.includes(sourceId)) return false;
      if (freshOnly) { if (seen.includes(r.id)) return false; }
      else if (r.once && seen.includes(r.id)) return false;
      if (r.require_flag) for (const k in r.require_flag) if (!St.getFlag(k)) return false;
      return true;
    });
  }

  function applyRumorEffects(r) {
    if (r.set_flag) for (const k in r.set_flag) {
      const v = r.set_flag[k];
      if (typeof v === "string" && v.startsWith("+")) St.addFlag(k, parseInt(v.slice(1), 10));
      else St.setFlag(k, v);
    }
    St.discover("rumors", r.id);
  }

  function hearRumorText(sourceId, freshOnly) {
    let pool = eligibleRumors(sourceId, freshOnly);
    if (!freshOnly && pool.length) {
      // 大新闻：优先没听过的；全都听过时避免与上一条重复
      const fresh = pool.filter(r => !P().discovery.rumors.includes(r.id));
      if (fresh.length) pool = fresh;
      else {
        const last = St.getFlag("last_rumor_" + (sourceId || "news"));
        if (pool.length > 1 && last) pool = pool.filter(r => r.id !== last);
      }
    }
    if (!pool.length) return "他摇摇头：'该说的都说了，剩下的都是编的。'";
    const total = pool.reduce((a, r) => a + r.weight, 0);
    let roll = Math.random() * total, pick = pool[0];
    for (const r of pool) { roll -= r.weight; if (roll <= 0) { pick = r; break; } }
    St.setFlag("last_rumor_" + (sourceId || "news"), pick.id);
    applyRumorEffects(pick);
    return `【传闻】${pick.text}`;
  }

  function hearNews() {
    const p = P();
    if (p.location.region !== "ashford" || p.location.node !== "tavern") return "大新闻只在酒馆的壁炉边流通。";
    let text = "玛尔塔擦着杯子，朝壁炉边的长桌努了努嘴：'坐。今晚值得你听的可不少。'\n";
    text += hearRumorText("martha");
    if (Math.random() < 0.6) text += "\n" + hearRumorText(Math.random() < 0.5 ? "martha" : "finn");
    if (St.getFlag("scale_ledge_found") && !St.getFlag("scale_news")) {
      St.setFlag("scale_news", true);
      text += "\n\n酒馆的角落里，有人压低声音复述着你的事迹——'裂谷里那片鳞，是真的，摸过的人就坐在那儿。'玛尔塔难得地没有打断他们。";
    }
    saveNote();
    return text;
  }

  /* ============ 交谈（台词按序消耗，耗尽置灰） ============ */
  // 该 NPC 是否还有可说的内容（新台词 / 未听传闻 / 特殊剧情对话）
  function npcTalkable(npcId) {
    const npc = G.DATA.npcs[npcId];
    if (!npc) return false;
    if (npc.condition_flag && !St.getFlag(npc.condition_flag)) return false;
    const seenIdx = St.getFlag("talk_idx_" + npcId) || 0;
    if (seenIdx < (npc.lines || []).length) return true;
    if (npc.rumor_source && eligibleRumors(npcId, true).length > 0) return true;
    if (npcId === "finn" && P().reputation >= 20 && !St.getFlag("registered_hunter")) return true;
    if (npcId === "della") {
      const q = St.findQuest("q_c_lute");
      if (q && q.state === "active" && !St.getFlag("lute_clue")) return true;
    }
    if (npcId === "laen" && St.getFlag("heard_bard_rumor") && !St.findQuest("q_c_lute")) return true;
    return false;
  }

  function talkTo(npcId) {
    const p = P();
    const npc = G.DATA.npcs[npcId];
    if (!npc) return "查无此人。";
    if (npc.condition_flag && !St.getFlag(npc.condition_flag)) return "酒馆里还没有这个人。";

    const seenIdx = St.getFlag("talk_idx_" + npcId) || 0;
    const lines = npc.lines || [];
    const hasLines = seenIdx < lines.length;
    const rumorsLeft = npc.rumor_source && eligibleRumors(npcId, true).length > 0;

    // 特殊剧情：莱恩的月琴委托（优先于一切闲谈）
    if (npcId === "laen" && St.getFlag("heard_bard_rumor") && !St.findQuest("q_c_lute")) {
      Game.pendingOffer = "q_c_lute";
      saveNote();
      return "【莱恩】他听完你提起裂谷，忽然站起身，郑重地行了一个镜湖的礼：'我的月琴就丢在那儿。琴在，路就在——求你替我把它找回来。'\n（要接下这件事吗？）";
    }

    if (!hasLines && !rumorsLeft &&
        !(npcId === "finn" && p.reputation >= 20 && !St.getFlag("registered_hunter")) &&
        !(npcId === "della" && St.findQuest("q_c_lute") && St.findQuest("q_c_lute").state === "active" && !St.getFlag("lute_clue"))) {
      return `【${npc.name}】${npc.exhausted || "（该说的都说过了。他冲你点点头，转身忙自己的事去了。）"}`;
    }

    let text = "";
    const greeted = !!St.getFlag("greeted_" + npcId);
    if (!greeted) {
      text = `【${npc.name}·${npc.role}】「${npc.greeting}」`;
      St.setFlag("greeted_" + npcId, true);
    } else {
      text = `【${npc.name}】`;
    }
    if (hasLines) {
      text += "\n" + lines[seenIdx];
      St.setFlag("talk_idx_" + npcId, seenIdx + 1);
    } else if (rumorsLeft) {
      // 台词说完后，交谈进入打听传闻阶段（每条传闻同样只听一次，听完即耗尽）
      text += "\n" + hearRumorText(npcId, true);
    } else {
      text += "\n（他听着你说，时不时点头。）";
    }
    if (hasLines && npc.rumor_source && Math.random() < 0.5 && eligibleRumors(npcId, true).length > 0) {
      const rumor = hearRumorText(npcId, true);
      if (!text.includes(rumor.replace("【传闻】", "").slice(0, 12))) text += "\n" + rumor;
    }
    // 芬恩：注册猎人
    if (npcId === "finn" && p.reputation >= 20 && !St.getFlag("registered_hunter")) {
      St.setFlag("registered_hunter", true);
      text += "\n\n芬恩忽然站直了，从柜台下取出一枚崭新的铜壶徽章，双手递过来——他的耳朵尖是红的：'按条例，你的声望已达注册猎人标准。从今以后，你是公会在册的人了。'";
    }
    // 黛拉：月琴线索
    if (npcId === "della") {
      const q = St.findQuest("q_c_lute");
      if (q && q.state === "active" && !St.getFlag("lute_clue")) {
        St.setFlag("lute_clue", true);
        text += "\n\n黛拉想了想：'琴？没见着。但南边矿道尽头的岩台，夜里有过不一样的光。矿工们不敢去——那儿离龙鳞太近了。'（龙鳞岩台的线索已明朗）";
      }
    }
    const mm2 = updateQuestReadiness();
    if (mm2.length) text += "\n" + mm2.join("\n");
    saveNote();
    return text;
  }

  /* ============ 商店 ============ */
  function shopStock(npcId) {
    const npc = G.DATA.npcs[npcId];
    if (!npc || !npc.shop) return null;
    const mod = (npc.shop_price_mod) || {};
    // 地区声望特权：熔岭声望 ≥10，黛拉按"自己人"半价供货
    const half = npcId === "della" && (St.get().player.regionRep && St.get().player.regionRep.lavarift || 0) >= 10;
    return npc.shop.map(id => {
      let price = mod[id] || G.DATA.items[id].price;
      if (half) price = Math.max(1, Math.ceil(price / 2));
      return { id, name: G.DATA.items[id].name, price, desc: G.DATA.items[id].desc, half };
    });
  }
  function buyItem(npcId, itemId) {
    const p = P();
    const stock = shopStock(npcId);
    if (!stock) return "这里没有生意可做。";
    const entry = stock.find(s => s.id === itemId);
    if (!entry) return "没有这件货。";
    if (p.gold < entry.price) return "金币不够。";
    const res = St.addItem(itemId, 1);
    if (!res.ok) return "背包已满（20 格）。先清理负重，或回烬炉镇存进仓库。";
    p.gold -= entry.price;
    saveNote();
    return `买下 ${entry.name} ×1（金币 −${entry.price}）。`;
  }
  function sellItem(itemId) {
    const p = P();
    const def = G.DATA.items[itemId];
    if (!def || def.type === "quest" || !def.price) return "这件东西不能卖。";
    if (St.countItem(itemId) <= 0) return "没有了。";
    const price = Math.max(1, Math.floor(def.price / 2));
    St.removeItem(itemId, 1);
    p.gold += price;
    saveNote();
    return `卖出 ${def.name} ×1（金币 +${price}）。`;
  }
  function useItem(itemId) {
    const p = P();
    const def = G.DATA.items[itemId];
    if (!def || !def.effect) return "这件东西用不上。";
    if (St.countItem(itemId) <= 0) return "没有了。";
    if (def.type === "tool") return "它会在需要的时候自己派上用场（被动生效）。";
    St.removeItem(itemId, 1);
    const labels = { hp: "HP", mp: "法力", food: "食物", water: "水" };
    const parts = [];
    for (const k in def.effect) { p[k] += def.effect[k]; parts.push(`${labels[k] || k} +${def.effect[k]}`); }
    St.clampVitals();
    saveNote();
    return `你用掉了${def.name}。（${parts.join("，")}）`;
  }

  /* ============ 铁匠强化 ============ */
  function honeWeapon() {
    const p = P();
    if (St.getFlag("weapon_honed")) return "布洛姆摆手：'你的家伙已经是我手上出来的样子了。再好的钢，也得人去配它。'";
    if (p.gold < 30) return "布洛姆报了个价：30 金币。你数了数钱袋，还差些。";
    p.gold -= 30;
    St.setFlag("weapon_honed", true);
    saveNote();
    return "布洛姆接过你的武器，在炉前忙活了半个时辰，淬火的白汽腾起来三次。'好了。'他把武器抛回来，'砍石头都省劲。'（普通攻击 +1）";
  }

  /* ============ 锻造配方（布洛姆·广场铁匠铺） ============ */
  const RECIPES = [
    { id: "armor_wolf",   needs: { pelt_wolf: 3 },                        gold: 30, note: "冬狼皮缝的甲，轻而暖。" },
    { id: "sword_firepat", needs: { ore_fire: 3, pelt_wolf: 1 },          gold: 40, note: "火纹矿锻的剑，带细碎火星。" },
    { id: "sword_storm",  needs: { ore_fire: 2, storm_moss: 2 },          gold: 70, note: "缠着细小电弧，雨夜嗡嗡作响。" },
    { id: "charm_scale",  needs: { ore_fire: 2, sulfur: 2, moss_moon: 1 }, gold: 80, note: "龙鳞护符，贴着心口是温的。" }
  ];
  function recipeList() {
    return RECIPES.map(r => {
      const def = G.DATA.items[r.id];
      const mats = Object.keys(r.needs).map(mid => ({
        id: mid, name: G.DATA.items[mid].name, need: r.needs[mid], have: St.countItem(mid)
      }));
      return { id: r.id, name: def.name, slot: def.slot, atk: def.atk || 0, def: def.def || 0,
        desc: def.desc, note: r.note, gold: r.gold, mats,
        owned: St.countItem(r.id) > 0 || (P().equipment && (P().equipment.weapon === r.id || P().equipment.armor === r.id)),
        can: mats.every(m => m.have >= m.need) && P().gold >= r.gold };
    });
  }
  function craft(recipeId) {
    const p = P();
    if (p.location.region !== "ashford" || p.location.node !== "square") return "锻造得找布洛姆——他在烬炉镇广场的铁匠铺。";
    const r = RECIPES.find(x => x.id === recipeId);
    if (!r) return "没有这张配方。";
    if (St.countItem(r.id) > 0 || (p.equipment && (p.equipment.weapon === r.id || p.equipment.armor === r.id)))
      return `布洛姆摆手：'你身上已经有一件了。好东西不在多，在趁手。'`;
    for (const mid in r.needs) if (St.countItem(mid) < r.needs[mid]) return `材料不够：${G.DATA.items[mid].name} 需要 ×${r.needs[mid]}。`;
    if (p.gold < r.gold) return `工钱不够：布洛姆要 ${r.gold} 金。`;
    for (const mid in r.needs) St.removeItem(mid, r.needs[mid]);
    p.gold -= r.gold;
    const res = St.addItem(r.id, 1);
    if (!res.ok) { p.gold += r.gold; for (const mid in r.needs) St.addItem(mid, r.needs[mid]); return "背包满了，腾个格子再来。"; }
    const def = G.DATA.items[r.id];
    St.pushEvent(`请布洛姆打造了${def.name}`);
    saveNote();
    return `炉火亮了小半天。布洛姆把${def.name}递过来时还在发烫：'${r.note}'\n（获得 ${def.name}：${def.slot === "weapon" ? `攻击 +${def.atk}` : `防御 +${def.def}`}——在背包里装备它）`;
  }

  /* ============ 装备（武器/护甲槽位） ============ */
  function equipItem(itemId) {
    const p = P();
    const def = G.DATA.items[itemId];
    if (!def || def.type !== "equip") return "这件东西不能装备。";
    if (St.countItem(itemId) <= 0) return "身上没有它。";
    const slot = def.slot;
    const old = p.equipment[slot];
    St.removeItem(itemId, 1);
    if (old) { const r = St.addItem(old, 1); if (!r.ok) { St.addItem(itemId, 1); return "背包满了，换不下来。"; } }
    p.equipment[slot] = itemId;
    saveNote();
    const stat = slot === "weapon" ? `攻击 +${def.atk}` : `防御 +${def.def}`;
    return old ? `你换上${def.name}（${stat}），把${G.DATA.items[old].name}收回了背包。` : `你装备上${def.name}（${stat}）。`;
  }
  function unequipItem(slot) {
    const p = P();
    const cur = p.equipment[slot];
    if (!cur) return "这个位置是空的。";
    const r = St.addItem(cur, 1);
    if (!r.ok) return "背包满了，卸不下来。";
    p.equipment[slot] = null;
    saveNote();
    return `卸下了${G.DATA.items[cur].name}，收回背包。`;
  }

  /* ============ 龙骰（酒馆赌局：三局两胜，胜负各押注） ============ */
  function diceSettle(win, bet) {
    const p = P();
    bet = Math.max(1, Math.min(bet | 0, p.gold));
    if (win) {
      p.gold += bet;
      St.addFlag("dice_wins", 1);
      const wins = St.getFlag("dice_wins");
      St.pushEvent("在龙骰桌上赢了一局");
      saveNote();
      let t = `骰子落定，是你笑到最后。（金币 +${bet}，龙骰胜场 ${wins}）`;
      if (wins === 10) {
        St.addItem("potion_strong", 1);
        t += "\n玛尔塔擦着杯子瞥你一眼：'十场了。上一个这么旺的，后来把钱都输在了圣辉城。'她顿了顿，把一小袋东西推过来，'拿着，图个吉利。'（获得烈性魔药 ×1）";
      }
      return t;
    }
    p.gold -= bet;
    saveNote();
    return `骰子落定，对面把钱拨到自己那边。（金币 −${bet}）`;
  }

  /* ============ 休整 ============ */
  function rollWeather() {
    const r = Math.random();
    const w = r < 0.40 ? "clear" : r < 0.65 ? "rain" : r < 0.90 ? "fog" : "cold";
    St.get().weather = w;
    return w;
  }
  function rest() {
    const p = P();
    if (p.location.region !== "ashford" || p.location.node !== "tavern") return "能安心睡下的床，只有家里有。";
    p.hp = p.maxHp; p.mp = p.maxMp;
    St.get().timeSeg = 0;
    const w = rollWeather();
    refreshBoard();
    St.get().turn++;
    const wtxt = { clear: "云开日出，是个好赶路的天。", rain: "雨点敲着酒馆的招牌，泥路怕是不太好走。", fog: "雾气从林子的方向漫过来，今早的雾帷森林怕是更认不得路了。", cold: "一夜极寒，窗棂上结了霜花。出门得多带干粮。" }[w];
    saveNote();
    return `你在阁楼的床上睡了个整觉。伤口结痂，法力回满。（HP/法力全恢复）\n清晨推窗——${wtxt}（天气：${weatherName(w)}；悬赏板已更新）`;
  }

  /* ============ 仓库 ============ */
  function deposit(itemId, n) {
    const p = P();
    if (p.location.region !== "ashford" || p.location.node !== "tavern") return "仓库在家里。";
    n = n || 1;
    if (St.countItem(itemId) < n) return "数量不够。";
    if (p.storage.length >= 40) return "仓库也满了（40 格）。";
    St.removeItem(itemId, n);
    St.addItem(itemId, n, true);
    saveNote();
    return `把 ${G.DATA.items[itemId].name} ×${n} 存进了阁楼的小仓库。`;
  }
  function withdraw(itemId, n) {
    const p = P();
    if (p.location.region !== "ashford" || p.location.node !== "tavern") return "仓库在家里。";
    n = n || 1;
    if (St.countItem(itemId, true) < n) return "仓库里数量不够。";
    const res = St.addItem(itemId, n);
    if (!res.ok) return "背包装不下。";
    St.removeItem(itemId, n, true);
    saveNote();
    return `从仓库取出 ${G.DATA.items[itemId].name} ×${n}。`;
  }

  /* ============ 可用动作（按钮与 prompt 共用） ============ */
  function availableActions() {
    const p = P();
    const acts = [];
    if (Game.combat) {
      const c = Game.combat;
      const skills = St.unlockedSkills(G.DATA.grimoires);
      acts.push({ id: "combat_attack", label: "普通攻击", payload: "attack" });
      for (const sk of skills) acts.push({ id: "combat_skill", label: `${sk.name}（MP${sk.mp}）`, payload: sk.id });
      for (const slot of p.inventory) {
        const def = G.DATA.items[slot.id];
        if (def && def.battle) acts.push({ id: "combat_item", label: `使用${def.name}×${slot.n}`, payload: slot.id });
      }
      acts.push({ id: "combat_flee", label: "逃跑" });
      return acts;
    }
    if (Game.pendingOffer) {
      const def = questDef(Game.pendingOffer);
      acts.push({ id: "accept_quest", label: `接受委托「${def.name}」`, payload: Game.pendingOffer });
      acts.push({ id: "decline_offer", label: "婉拒，继续赶路" });
      return acts;
    }
    const { region, node } = p.location;
    const ndef = nodeDef(region, node);
    // 移动
    for (const [r, n] of ndef.links) {
      if (!hiddenUnlocked(r, n)) continue;
      const target = nodeDef(r, n);
      acts.push({ id: "move", label: `前往 ${r === region ? "" : regionName(r) + "·"}${target.name}`, payload: { region: r, node: n } });
    }
    if (!REGIONS[region].safe) acts.push({ id: "explore", label: "探索四周" });
    if (ndef.camp) acts.push({ id: "camp", label: "扎营（食物−1，全恢复）" });
    // 据点功能
    if (node === "tavern") {
      acts.push({ id: "rest", label: "休整（睡觉，推进天气）" });
      acts.push({ id: "news", label: "听大新闻" });
      acts.push({ id: "dice", label: "来一局龙骰（小赌怡情）" });
      acts.push({ id: "talk", label: "与玛尔塔交谈", payload: "martha" });
      if (St.getFlag("heard_bard_rumor")) acts.push({ id: "talk", label: "与吟游诗人莱恩交谈", payload: "laen" });
      for (const cid of ["brody", "vera"]) {
        if (p.companions.with === cid) acts.push({ id: "dismiss", label: `送${G.DATA.npcs[cid].name}回去` });
        else if (!p.companions.met.includes(cid)) acts.push({ id: "introduce", label: COMPANION_INTROS[cid].button, payload: cid });
        else acts.push({ id: "invite", label: `邀请${G.DATA.npcs[cid].name}同行`, payload: cid });
      }
    }
    if (node === "guild") {
      acts.push({ id: "talk", label: "与芬恩交谈（声望/登记）", payload: "finn" });
    }
    if (node === "square") {
      acts.push({ id: "shop", label: "艾达杂货店", payload: "ada" });
      acts.push({ id: "talk", label: "与布洛姆交谈", payload: "brom" });
      acts.push({ id: "hone", label: St.getFlag("weapon_honed") ? "武器已强化" : "强化武器（30 金）" });
      acts.push({ id: "talk", label: "与流民老妇人交谈", payload: "oldwoman" });
      acts.push({ id: "craft", label: "请布洛姆打造装备（看配方）" });
      if (p.companions.with === "kane") acts.push({ id: "dismiss", label: "让凯因先回去" });
      else if (!p.companions.met.includes("kane")) acts.push({ id: "introduce", label: COMPANION_INTROS.kane.button, payload: "kane" });
      else acts.push({ id: "invite", label: "邀请凯因同行", payload: "kane" });
    }
    if (node === "hunter_hut") {
      acts.push({ id: "talk", label: "与加洛交谈", payload: "garo" });
      acts.push({ id: "shop", label: "加洛的补给", payload: "garo" });
    }
    if (node === "miner_camp") {
      acts.push({ id: "talk", label: "与黛拉交谈", payload: "della" });
      acts.push({ id: "talk", label: "与岩叔交谈", payload: "yanshu" });
      acts.push({ id: "shop", label: "营地补给", payload: "della" });
    }
    if (node === "pass_foot") acts.push({ id: "talk", label: "与秦铎交谈", payload: "qinduo" });
    if (node === "pass_shrine") acts.push({ id: "talk", label: "与守龛老人交谈", payload: "shrine_keeper" });
    if (node === "watch_yard") {
      acts.push({ id: "talk", label: "与百夫长卫霜交谈", payload: "weishuang" });
      acts.push({ id: "talk", label: "与军需官佟石交谈", payload: "tongshi" });
      acts.push({ id: "shop", label: "军需处补给", payload: "tongshi" });
      // 西境声望 ≥15：卫霜开放私藏军械（一次性）
      if ((p.regionRep && p.regionRep.westwatch || 0) >= 15 && !St.getFlag("armory_bought"))
        acts.push({ id: "armory", label: "卫霜的私藏军械（西境声望专属）" });
    }
    // 精英委托：线索集齐后由玩家主动发起猎杀（可先涂剑油/设捕兽夹）
    const el = eliteAt(region, node);
    if (el && (St.getFlag(el.def.clueFlag) || 0) >= 2)
      acts.push({ id: "elite_fight", label: el.def.challenge, payload: el.key });
    // 逃兵阿七：道德岔路
    if (region === "thunderpass" && node === "pass_foot" && St.getFlag("deserter_found") && !St.getFlag("deserter_resolved")) {
      const qd = St.findQuest("q_c_deserter");
      if (qd && qd.state === "active") {
        acts.push({ id: "deserter_catch", label: "押阿七回哨所（军法）" });
        acts.push({ id: "deserter_free", label: "放他走，只说没找着（人情）" });
      }
    }
    // 告示板
    if (["square", "hunter_hut", "miner_camp", "watch_yard"].includes(node)) acts.push({ id: "board", label: node === "square" ? "查看悬赏板" : "查看本地告示" });
    // 可交付委托
    for (const q of p.quests) {
      if (q.state !== "ready") continue;
      const def = questDef(q.id);
      if (!def) continue;
      const tn = def.turnin;
      const npcHere = G.DATA.npcs[tn] && G.DATA.npcs[tn].node === node && G.DATA.npcs[tn].region === region;
      if (npcHere) acts.push({ id: "turnin", label: `交付委托「${def.name}」`, payload: q.id });
      if (def.id === "q_d_child" && node === "forest_edge") acts.push({ id: "turnin", label: "把小荞送回村妇手中", payload: q.id });
    }
    for (const q of p.boardQuests) {
      if (q.state === "ready" && node === "guild") acts.push({ id: "turnin", label: `交付「${q.name}」`, payload: q.id });
    }
    // 台词耗尽的 NPC：按钮置灰不可点，明示"该说的都说完了"
    for (const act of acts) {
      if (act.id === "talk" && !npcTalkable(act.payload)) {
        act.disabled = true;
        act.label += "（已聊完）";
      }
    }
    return acts;
  }

  /* ============ 动作分发（离线模式主入口） ============ */
  function doAction(act) {
    switch (act.id) {
      case "move": return moveTo(act.payload.region, act.payload.node);
      case "explore": return explore();
      case "camp": return doCamp();
      case "rest": return rest();
      case "news": return hearNews();
      case "talk": return talkTo(act.payload);
      case "invite": return inviteCompanion(act.payload);
      case "introduce": return introduceCompanion(act.payload);
      case "dismiss": return dismissCompanion();
      case "hone": return honeWeapon();
      case "accept_quest": return acceptQuest(act.payload);
      case "decline_offer": return declineOffer();
      case "turnin": return turnIn(act.payload);
      case "buy": return buyItem(act.payload.npc, act.payload.item);
      case "sell": return sellItem(act.payload);
      case "use": return useItem(act.payload);
      case "deposit": return deposit(act.payload);
      case "withdraw": return withdraw(act.payload);
      case "combat_attack": case "combat_skill": return combatAction("skill", act.payload);
      case "combat_item": return combatAction("item", act.payload);
      case "combat_flee": return combatAction("flee");
      case "elite_fight": {
        const e = ELITES[act.payload];
        if (!e) return "……（什么也没有发生）";
        St.pushEvent(`向${G.DATA.monsters[act.payload].name}发起了猎杀`);
        return e.intro + "\n" + startCombat(act.payload, 1);
      }
      case "deserter_catch": {
        const qd = St.findQuest("q_c_deserter");
        if (!qd || qd.state !== "active") return "这件事已经了结了。";
        St.setFlag("deserter_caught", true);
        St.setFlag("deserter_resolved", true);
        St.addRegionRep("westwatch", 5);
        St.pushEvent("把逃兵阿七押回了哨所");
        const mm = updateQuestReadiness();
        saveNote();
        return "你抓住阿七的手腕。他没挣，只是把剩下半块饼塞进了怀里。\n哨所门口，卫霜看了他很久，挥手让士兵把人带下去。'军法如此。'她说，'谢谢你把他带回来——活着带回来。'\n（委托目标达成：回哨所向卫霜复命。西境声望 +5）" + (mm.length ? "\n" + mm.join("\n") : "");
      }
      case "deserter_free": {
        const qd = St.findQuest("q_c_deserter");
        if (!qd || qd.state !== "active") return "这件事已经了结了。";
        qd.state = "done";
        St.setFlag("deserter_resolved", true);
        St.setFlag("deserter_freed", true);
        St.addItem("ration", 2);
        St.addRegionRep("westwatch", -3);
        St.pushEvent("放走了逃兵阿七");
        saveNote();
        return "你侧过身，让开了山口的路。\n阿七愣了几秒，把怀里那半块军粮饼和揣着的两块干粮都塞给你：'我娘在灰潮边上的柳营村……谢谢你。'他鞠了一躬，转身跑进了风雪里。\n回去你只能对卫霜说：没找到。她盯着你看了很久，没再问。（委托了结，无酬劳；获得干粮 ×2；西境声望 −3——她未必信你）";
      }
      case "dice": return { openDice: true };
      case "armory": {
        if ((P().regionRep && P().regionRep.westwatch || 0) < 15) return "卫霜打量你一眼：'军械不卖给生面孔。'";
        if (St.getFlag("armory_bought")) return "卫霜摇头：'好东西只有一件，已经在你手上了。'";
        if (P().gold < 90) return "卫霜报了个实在价：90 金。你钱袋还差些。";
        const res = St.addItem("sword_firepat", 1);
        if (!res.ok) return "背包满了，腾个格子再来。";
        P().gold -= 90;
        St.setFlag("armory_bought", true);
        saveNote();
        return "卫霜从军械架最里层抽出一柄带火纹的剑：'巡边队的老货，跟着我从灰潮里出来的。90 金，不还价——它得跟个会用的人。'（获得火纹剑：攻击 +4）";
      }
      case "craft": return { openCraft: true };
      default: return "……（什么也没有发生）";
    }
  }

  /* ============ 战斗中自由文本拦截（引擎管世界：战斗态只认引擎指令） ============ */
  // 命中战斗意图 → { kind, payload }；未命中 → null
  function combatTextIntent(text) {
    const t = (text || "").trim();
    if (!t) return null;
    if (/逃跑|逃走|跑路|撤退|逃离|开溜/.test(t)) return { kind: "flee" };
    const skills = St.unlockedSkills(G.DATA.grimoires);
    for (const sk of skills) if (t.includes(sk.name)) return { kind: "skill", payload: sk.id };
    const p = P();
    for (const slot of p.inventory) {
      const def = G.DATA.items[slot.id];
      if (def && def.battle && t.includes(def.name)) return { kind: "item", payload: slot.id };
    }
    if (/攻击|普攻|砍|劈|刺|揍|干它|打他|打它/.test(t)) return { kind: "skill", payload: "attack" };
    return null;
  }

  /* ============ 离线自由文本入口 ============ */
  function handleOfflineText(text) {
    if (Game.combat) {
      const ci = combatTextIntent(text);
      if (ci) return combatAction(ci.kind, ci.payload);
      return `战斗中无暇他顾——${Game.combat.displayName}就在眼前！先攻击、施放技能、使用道具，或者逃跑。`;
    }
    const cmd = G.LLM.mockParse(text);
    if (!cmd) return "说什么呢？";
    switch (cmd.type) {
      case "move": return moveTo(cmd.target.region, cmd.target.node);
      case "explore": return explore();
      case "camp": return doCamp();
      case "rest": return rest();
      case "news": return hearNews();
      case "shop": { const { region, node } = P().location; const npc = node === "square" ? "ada" : node === "hunter_hut" ? "garo" : node === "miner_camp" ? "della" : null; return npc ? { openShop: npc } : "这里没有商店。"; }
      case "talk": return "找谁聊？（点下方对应的人名按钮）";
      case "board": return { openBoard: true };
      case "open": return { openPanel: cmd.panel };
      default: return "你没太想清楚要做什么。试试：「探索」「扎营」「前往某地」「听大新闻」，或直接点下方按钮。";
    }
  }

  /* ============ API 模式回合入口 ============ */
  async function handleApiText(text) {
    // 战斗态：自由文本一律由引擎接管，保证剧情与界面状态永远同步（不调 LLM）
    if (Game.combat) {
      const ci = combatTextIntent(text);
      if (ci) return { text: combatAction(ci.kind, ci.payload), choices: [] };
      return { text: `战斗中无暇他顾——${Game.combat.displayName}就在眼前！先攻击、施放技能、使用道具，或者逃跑。`, choices: [] };
    }
    const contract = await G.LLM.narrate(text);
    const p = P();
    let out = contract.narration;
    // 变更校验
    const res = G.Rules.applyLLMChanges(contract.state_change_requests);
    if (res.fixes.length) out += "\n\n" + res.fixes.join("\n");
    // 场景旗标（软旗标，仅允许安全键名与原始类型）
    for (const k in contract.scene_flags) {
      const v = contract.scene_flags[k];
      if (/^[a-z_]+$/.test(k) && ["boolean", "number", "string"].includes(typeof v)) St.setFlag(k, v);
    }
    // 战斗指令：仅在引擎战斗态内解释，非法则忽略
    if (contract.combat && Game.combat) {
      const cb = contract.combat;
      if (cb.action === "flee") out += "\n" + combatAction("flee");
      else if (cb.action === "cast" && cb.skill) out += "\n" + combatAction("skill", cb.skill);
      else if (cb.action === "item" && cb.item) out += "\n" + combatAction("item", cb.item);
      else if (cb.action === "attack") out += "\n" + combatAction("skill", "attack");
    }
    updateQuestReadiness();
    saveNote();
    return { text: out, choices: contract.choices || [] };
  }

  Object.assign(Game, {
    moveTo, explore, doCamp, rest, hearNews, talkTo, npcTalkable, inviteCompanion, dismissCompanion, introduceCompanion, COMPANION_INTROS,
    shopStock, buyItem, sellItem, useItem, honeWeapon, deposit, withdraw,
    boardList, refreshBoard, acceptQuest, declineOffer, turnIn, questDef,
    startCombat, combatAction, availableActions, doAction, handleOfflineText, handleApiText,
    updateQuestReadiness, escortArrivalCheck, hearRumorText, hiddenUnlocked, rollWeather, guideInfo,
    recipeList, craft, equipItem, unequipItem, diceSettle, eliteAt
  });
  G.Game = Game;
})(typeof window !== "undefined" ? (window.ASTREA = window.ASTREA || {}) : (globalThis.ASTREA = globalThis.ASTREA || {}));
