/* llm.js — LLM API 适配、prompt 组装、JSON 容错解析、离线 Mock 模式 */
(function (G) {
  "use strict";
  const St = G.State;
  const SET_KEY = "astrea_settings_v1";

  const store = (typeof localStorage !== "undefined") ? localStorage : { getItem: () => null, setItem: () => {}, removeItem: () => {} };

  function getSettings() {
    try {
      const s = JSON.parse(store.getItem(SET_KEY) || "{}");
      return Object.assign({ mode: "offline", apiKey: "", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" }, s);
    } catch (e) { return { mode: "offline", apiKey: "", baseUrl: "", model: "" }; }
  }
  function saveSettings(s) { store.setItem(SET_KEY, JSON.stringify(s)); }

  /* ============ Prompt 组装 ============ */
  function buildPrompt(playerText) {
    const s = St.get(), p = s.player;
    const regionMd = (G.WORLD.regions[p.location.region] || "").slice(0, 6000);
    const nodeInfo = G.Game.nodeDef(p.location.region, p.location.node);
    const skills = St.unlockedSkills(G.DATA.grimoires).map(sk => `${sk.name}(MP${sk.mp}${sk.dmg ? "/伤" + sk.dmg : ""}${sk.heal ? "/愈" + sk.heal : ""})`).join("、");
    const quests = p.quests.filter(q => q.state !== "done").map(q => {
      const def = G.DATA.quests.handcrafted.find(h => h.id === q.id);
      return def ? `${def.name}[${q.state === "ready" ? "可交付" : "进行中"} ${q.progress || 0}/${def.objective.count || 1}]` : q.id;
    }).join("；") || "无";
    const inv = p.inventory.map(i => `${G.DATA.items[i.id] ? G.DATA.items[i.id].name : i.id}×${i.n}`).join("、") || "空";

    // 叙事导演：心境标签 + 近期事件 + 文风规则
    const segName = St.timeName();
    const safe = G.Game.REGIONS[p.location.region].safe;
    const hpRatio = p.hp / p.maxHp;
    let mood;
    if (hpRatio <= 0.25) mood = "濒死紧绷——字句短促，痛感与耳鸣清晰，世界在收缩";
    else if (!safe && (s.weather === "fog" || s.weather === "cold")) mood = "不安压抑——视线受阻，声音来源暧昧，每一步都像被注视";
    else if (!safe && segName === "夜晚") mood = "孤绝警惕——黑暗里有东西在动，火光之外的描写留三分不点破";
    else if (safe && s.weather === "clear") mood = "松弛温热——烟火气、食物香、人声，日子是可以过的";
    else if (safe) mood = "庇护感——屋外天气再坏，屋檐下总有一碗热的";
    else mood = "旅途苍凉——天地很大，人是小的，但路在脚下";
    const events = (p.recentEvents && p.recentEvents.length) ? p.recentEvents.join("；") : "尚无";

    const system = [
      "你是《魔导纪元》的叙事引擎。铁律：你只能叙事与提交变更申请，数值由引擎最终结算。",
      "【世界圣经（冻结，不可改写）】\n" + (G.WORLD.bible || "").slice(0, 5000),
      "【当前区域包】\n" + regionMd,
      "【游戏规则摘要】移动/扎营/商店/战斗/委托奖励的消耗与结算由引擎处理，禁止在 state_change_requests 中重复申请。你的 state_change_requests 仅用于引擎未覆盖的叙事损益（如陷阱、误伤），且必须遵守单回合上限：hp[-30,40] mp[-20,40] gold[-50,50] food/water[-3,5] exp[0,100] reputation[0,30]。",
      "禁止创造世界圣经之外的地理/势力/历史；禁止让玩家进入龙眠荒原/镜湖/圣辉城；禁止复活、传送、时间魔法。",
      `【导演指令·心境】当前心境：${mood}。叙事全程贴合这个基调，不要中途换挡。`,
      `【导演指令·近期事件】玩家最近经历：${events}。叙事中可以回望、提及或让这些事在环境里留下余波（路人的眼神、伤口的钝痛、未干的泥），让世界记得玩家做过的事。`,
      (s.storyLog && s.storyLog.length)
        ? "【近期叙事回顾】最近几回合（由旧到新）：\n" + s.storyLog.map(t => "玩家：" + t.q + " → " + t.a).join("\n") + "\n叙事必须与此衔接：场景、在场人物、未了之事都要延续，不得重置场景、不得让说过的话作废。"
        : null,
      "【文风规则】禁止总结腔（'总之''就这样''你感到一段旅程结束了'）；每段叙事至少落在一个具体的感官细节上（气味、温度、声响、触感）；结尾停在一个画面或动作上，不要用旁白点评收束；不用'你决定''你选择'这类元叙述。",
      "【输出契约】严格输出 JSON（不要 markdown 代码块）：{\"narration\":\"给玩家看的中文叙事，150-300字\",\"state_change_requests\":[{\"field\":\"hp\",\"delta\":-5,\"reason\":\"...\"}],\"scene_flags\":{},\"combat\":null,\"choices\":[\"选项1\",\"选项2\",\"选项3\"]}。choices 给出 2-4 个符合当前场景的后续动作建议。"
    ].filter(Boolean).join("\n\n");

    const user = [
      `【当前状态】位置：${G.Game.regionName(p.location.region)}·${nodeInfo.name}；时段：${segName}；天气：${G.Game.weatherName(s.weather)}；HP ${p.hp}/${p.maxHp}，法力 ${p.mp}/${p.maxMp}，金币 ${p.gold}，食物 ${p.food}/10，水 ${p.water}/10；声望：${St.repTitle()}(${p.reputation})；魔导书：${G.DATA.grimoires.element_names[p.grimoire.element]}，技能：${skills}`,
      `【背包】${inv}（${p.inventory.length}/20 格）`,
      `【进行中委托】${quests}`,
      `【同伴】${p.companions.with ? G.DATA.npcs[p.companions.with].name + "同行中" : "无"}`,
      `【可用动作】${G.Game.availableActions().map(a => a.label).join("；")}`,
      `【玩家输入】${playerText}`
    ].join("\n");
    return { system, user };
  }

  /* ============ JSON 容错解析 ============ */
  function parseContract(text) {
    if (!text) return null;
    let t = String(text).trim();
    // 去掉可能的 markdown 代码块
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    const i = t.indexOf("{"), j = t.lastIndexOf("}");
    if (i >= 0 && j > i) {
      try {
        const obj = JSON.parse(t.slice(i, j + 1));
        if (obj && typeof obj === "object") {
          return {
            narration: typeof obj.narration === "string" ? obj.narration : "……（叙事者沉默了片刻）",
            state_change_requests: Array.isArray(obj.state_change_requests) ? obj.state_change_requests : [],
            scene_flags: (obj.scene_flags && typeof obj.scene_flags === "object") ? obj.scene_flags : {},
            combat: obj.combat || null,
            choices: Array.isArray(obj.choices) ? obj.choices.filter(c => typeof c === "string").slice(0, 4) : []
          };
        }
      } catch (e) { /* fallthrough */ }
    }
    return null;
  }

  /* ============ API 调用（OpenAI 兼容，含 1 次修正重试） ============ */
  async function callApi(playerText) {
    const cfg = getSettings();
    const prompt = buildPrompt(playerText);
    const url = cfg.baseUrl.replace(/\/+$/, "") + "/chat/completions";
    async function once(extraNote) {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + cfg.apiKey },
        body: JSON.stringify({
          model: cfg.model,
          messages: [
            { role: "system", content: prompt.system + (extraNote ? "\n【重要】上一次输出不是合法 JSON，本次必须只输出 JSON 本体。" : "") },
            { role: "user", content: prompt.user }
          ],
          temperature: 0.8
        })
      });
      if (!resp.ok) throw new Error("API " + resp.status + ": " + (await resp.text()).slice(0, 200));
      const data = await resp.json();
      return data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : "";
    }
    let raw = await once(false);
    let contract = parseContract(raw);
    if (!contract) { raw = await once(true); contract = parseContract(raw); }
    if (!contract) {
      // 兜底：原文作为叙事，全部变更丢弃
      St.addFlag("parse_fail_count", 1);
      contract = { narration: raw || "……（远方的叙事者失联了。）", state_change_requests: [], scene_flags: {}, combat: null, choices: [] };
    }
    return contract;
  }

  /* ============ 连接测试（设置页用，返回中文诊断） ============ */
  async function testConnection(cfg) {
    if (!cfg.baseUrl || !cfg.apiKey) return { ok: false, msg: "请先填写 Base URL 和 API Key。" };
    const url = cfg.baseUrl.replace(/\/+$/, "") + "/chat/completions";
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + cfg.apiKey },
        body: JSON.stringify({ model: cfg.model, messages: [{ role: "user", content: "ping" }], max_tokens: 1 })
      });
      if (resp.ok) return { ok: true, msg: "连接成功——Key 与模型均可用，旅途愉快。" };
      const body = (await resp.text()).slice(0, 300);
      if (resp.status === 401) return { ok: false, msg: "Key 无效（401）。请到 API 平台后台重新复制完整 Key，注意别带空格、别用已删除的旧 Key。" };
      if (/model|Model/i.test(body) || resp.status === 404) return { ok: false, msg: "模型名不对（" + resp.status + "）。DeepSeek 应填 deepseek-chat 或 deepseek-reasoner，须一字不差。" };
      if (resp.status === 402 || /balance|quota|insufficient/i.test(body)) return { ok: false, msg: "账户余额不足或额度用尽（" + resp.status + "），请充值后再试。" };
      if (resp.status === 429) return { ok: false, msg: "请求太频繁被限流（429），稍等片刻即可——Key 和模型本身没问题。" };
      return { ok: false, msg: "API 返回 " + resp.status + "：" + body };
    } catch (e) {
      return { ok: false, msg: "连不上服务器（" + e.message + "）。检查 Base URL 是否完整（如 https://api.deepseek.com）、网络是否正常。" };
    }
  }

  /* ============ 离线 Mock：自由文本 → 引擎动作 ============ */
  function mockParse(text) {
    const t = (text || "").trim();
    if (!t) return null;
    const game = G.Game;
    // 移动：去/前往/到 + 节点名
    const mv = t.match(/(?:去|前往|到|回|走(?:去|到)?)\s*[「『"]?([\u4e00-\u9fa5A-Za-z·]{2,12})[」』"]?/);
    if (mv) {
      const target = game.findNodeByName(mv[1]);
      if (target) return { type: "move", target };
      if (/镇|烬炉/.test(mv[1])) return { type: "move", target: { region: "ashford", node: "gate" } };
      if (/家|酒馆/.test(mv[1])) return { type: "move", target: { region: "ashford", node: "tavern" } };
    }
    if (/探索|四处|搜寻|查看周围|看看周围|调查/.test(t)) return { type: "explore" };
    if (/扎营|露营|篝火/.test(t)) return { type: "camp" };
    if (/睡觉|休息|休整|住店/.test(t)) return { type: "rest" };
    if (/大新闻|八卦|传闻|听.*故?事/.test(t)) return { type: "news" };
    if (/背包|行囊|物品/.test(t)) return { type: "open", panel: "inventory" };
    if (/地图/.test(t)) return { type: "open", panel: "map" };
    if (/委托|任务|日志/.test(t)) return { type: "open", panel: "quests" };
    if (/发现|图鉴/.test(t)) return { type: "open", panel: "discovery" };
    if (/魔导书|技能/.test(t)) return { type: "open", panel: "grimoire" };
    if (/存|仓库/.test(t)) return { type: "open", panel: "storage" };
    if (/商店|买|卖|交易/.test(t)) return { type: "shop" };
    if (/聊|谈|说话|对话/.test(t)) return { type: "talk" };
    if (/悬赏|告示/.test(t)) return { type: "board" };
    return { type: "unknown", text: t };
  }

  /* 主入口：离线走 mockParse，API 走 callApi */
  async function narrate(playerText) {
    const cfg = getSettings();
    if (cfg.mode === "api" && cfg.apiKey) return await callApi(playerText);
    return null; // 离线模式由 game.js 的 mockParse 驱动
  }

  G.LLM = { getSettings, saveSettings, buildPrompt, parseContract, callApi, testConnection, mockParse, narrate };
})(typeof window !== "undefined" ? (window.ASTREA = window.ASTREA || {}) : (globalThis.ASTREA = globalThis.ASTREA || {}));
