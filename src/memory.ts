#!/usr/bin/env bun
/**
 * Memory — 沈屿 的本地记忆引擎(自建 Ombre · 单人版)。
 * MCP server(stdio)。bun:sqlite,一个本地文件,无云、无外部依赖、无 key。
 *
 * 把《屿·记忆与自主层·实现参考》的三套机制落地成【本地、无需向量 key】的版本:
 *  - 检索召回:中文 bigram 关键词召回 → RRF → 热度·冷却·新鲜度加权 → Top-K 加权随机采样
 *             → INSIGHT 保底 → 召回即升温。向量那路预留 embedding 字段,无向量层时退化为纯关键词。
 *  - 观察日记:存 + 召回即强化 + 每日衰减 + 低权 archived 归档(原始永不删) + 月度总结(占位)。
 *  - 牵挂 concern:OPEN→EASING→RESOLVED + 复发闸 + 每日衰减 + 召回强化 + 加权注入。
 *  - 夜间维护:全库热度衰减;约每 6 天"做梦"提炼一条 insight(LLM 调用留 TODO 占位,不硬依赖 key)。
 *
 * 工具(drop-in,工具名保留):recall · remember · note_concern · ease_concern · observe
 *   外加:maintain(夜间维护,可由 cron/任务计划触发)。
 * Env:MEMORY_DB(默认同目录 memory.db)
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { Database } from 'bun:sqlite'
import { join } from 'path'

// ============================================================================
// 0. DB 初始化
// ============================================================================
const DB_PATH = process.env.MEMORY_DB ?? join(import.meta.dir, 'memory.db')
const db = new Database(DB_PATH)
db.exec('PRAGMA journal_mode = WAL')
db.exec(`
create table if not exists memories (
  id integer primary key autoincrement,
  type text default 'summary',          -- summary | fact | insight
  content text not null,
  embedding text,                        -- 预留:JSON float[],无向量层时为 null
  heat real default 1.0,                 -- 热度,clamp 上限 3.0
  pinned integer default 0,
  last_recalled text,
  created_at text default (datetime('now')),
  source_ref text
);
create table if not exists concerns (
  id integer primary key autoincrement,
  topic_key text unique not null,
  summary text not null,
  resolution text default 'OPEN',        -- OPEN | EASING | RESOLVED
  weight real default 2,                 -- [0.5, 5]
  recurrence integer default 0,
  created_at text default (datetime('now')),
  updated_at text default (datetime('now')),
  last_surfaced text
);
create table if not exists observations (
  id integer primary key autoincrement,
  content text not null,
  stress integer default 3,              -- 1-5
  weight real default 1,
  kind text default 'observation',       -- observation | monthly_summary
  archived integer default 0,
  created_at text default (datetime('now')),
  last_recalled text
);
create table if not exists maint_log (
  id integer primary key autoincrement,
  kind text not null,                    -- decay | dream
  created_at text default (datetime('now'))
);
`)

// 旧库平滑升级:补 memories 里规格新增的列(老 v1 用的是 kind/weight,不存在则忽略)
for (const stmt of [
  "alter table memories add column type text default 'summary'",
  'alter table memories add column embedding text',
  'alter table memories add column heat real default 1.0',
  'alter table memories add column pinned integer default 0',
  'alter table memories add column source_ref text',
  "alter table observations add column kind text default 'observation'",
]) {
  try { db.exec(stmt) } catch { /* 列已存在 */ }
}

// ============================================================================
// 工具函数
// ============================================================================
const nowIso = () => new Date().toISOString()
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
const tMs = (iso: string | null | undefined): number | null => {
  if (!iso) return null
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? t : null
}

/** 中文 bigram:取最多 10 个 2-gram(剥掉非字/数/中文)。纯英文/数字时召回弱属预期。 */
function bigrams(text: string): string[] {
  const s = (text || '').replace(/[^一-龥a-zA-Z0-9]/g, '')
  const g = new Set<string>()
  for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2))
  return [...g].slice(0, 10)
}

/**
 * 向量嵌入预留接口。无 key / 无向量层时返回 null,retrieveMemories 自动退化为纯关键词路。
 * 以后接 Jina v3 / 本地模型:task='retrieval.query'(查询) | 'retrieval.passage'(入库),非对称。
 * TODO: 接入真实 embedding 服务。维度变了要重建全库 embedding。
 */
async function getEmbedding(_text: string, _task: 'retrieval.query' | 'retrieval.passage'): Promise<number[] | null> {
  return null
}

/**
 * 向量召回预留接口(余弦 topK)。当前无向量层 → 空数组。
 * 有向量层时:遍历 memories.embedding 算余弦,threshold=0.3,返回 top-k。
 */
async function vectorSearch(_qemb: number[], _opts: { threshold: number; k: number }): Promise<any[]> {
  return []
}

/** 关键词召回:content 含任一 bigram,按时间衰减后的有效热度粗排,limit 条。 */
function keywordSearch(grams: string[], limit: number): any[] {
  if (!grams.length) return []
  const where = grams.map(() => 'content like ?').join(' or ')
  const params = grams.map(g => `%${g}%`)
  return db.query(
    `select id, type, content, heat, pinned, last_recalled, created_at, source_ref
     from memories
     where (${where}) and type not in ('_maint','_system')
     order by (heat - 0.03 * (julianday('now') - julianday(created_at))) desc
     limit ?`
  ).all(...params, limit) as any[]
}

// ============================================================================
// 1. 检索召回(核心)—— bigram 关键词 + RRF + 五修正 + 加权随机采样 + INSIGHT 保底 + 升温
// ============================================================================
const K_RRF = 60

async function retrieveMemories(queryText: string, limit = 6): Promise<any[]> {
  const results = new Map<number, { item: any; vrank?: number; krank?: number }>()

  // 1) 向量路(无向量层时 qemb=null,整路跳过 → 纯关键词)
  const qemb = await getEmbedding(queryText, 'retrieval.query')
  if (qemb) {
    try {
      const hits = await vectorSearch(qemb, { threshold: 0.3, k: 10 })
      hits.forEach((m, i) => {
        const r = results.get(m.id) ?? { item: m }
        r.vrank = i
        results.set(m.id, r)
      })
    } catch { /* 向量路失败吞掉 */ }
  }

  // 2) 关键词路
  const grams = bigrams(queryText)
  if (grams.length) {
    const hits = keywordSearch(grams, 15)
    hits.forEach((m, i) => {
      const r = results.get(m.id) ?? { item: m }
      r.item = { ...r.item, ...m }
      r.krank = i
      results.set(m.id, r)
    })
  }

  // 无命中:退而拉最重要的几条(纯英文/空 query 也不至于颗粒无收)
  if (results.size === 0) {
    const fallback = db.query(
      `select id, type, content, heat, pinned, last_recalled, created_at, source_ref
       from memories where type not in ('_maint','_system')
       order by (heat - 0.03 * (julianday('now') - julianday(created_at))) desc limit ?`
    ).all(Math.min(limit, 8)) as any[]
    fallback.forEach((m, i) => results.set(m.id, { item: m, krank: i }))
  }

  // 3) RRF 融合 + 五个修正,降序
  const now = Date.now()
  const ranked = [...results.values()].map(r => {
    let s = 0
    if (r.vrank != null) s += 1 / (K_RRF + r.vrank)
    if (r.krank != null) s += 1 / (K_RRF + r.krank)
    const it = r.item
    // 热度:刻意窄窗 [0.88, 1.0],治富者愈富
    const heatBoost = 0.88 + 0.12 * Math.min((it.heat ?? 1) / 3.0, 1.0)
    const insightBoost = it.type === 'insight' ? 1.15 : 1.0
    const pinBoost = it.pinned ? 0.15 : 0
    // 冷却:36h 内召回过最多降到 0.3 倍,线性恢复。非法日期 → 当从未召回(不冷却)
    const last = tMs(it.last_recalled) ?? 0
    const hoursSince = last ? (now - last) / 3600000 : 9999
    const cooldown = hoursSince < 36 ? Math.max(0.3, hoursSince / 36) : 1
    // 新鲜度:新≈1.15,老→0.85。非法日期 → 当刚创建(最新鲜)
    const created = tMs(it.created_at) ?? now
    const ageDays = Math.max(0, (now - created) / 86400000)
    const recency = 0.85 + 0.3 * Math.pow(0.96, ageDays)
    const score = s * heatBoost * insightBoost * cooldown * recency + pinBoost
    return { item: it, score: Number.isFinite(score) ? score : 0 }
  }).sort((a, b) => b.score - a.score)

  // 4) Top-K 加权随机采样(不放回):pool = limit+8,分高易中但不再每次固定前几条
  const pool = ranked.slice(0, Math.min(ranked.length, limit + 8))
  const scored: { item: any; score: number }[] = []
  while (scored.length < limit && pool.length) {
    const total = pool.reduce((a, b) => a + Math.max(b.score, 1e-4), 0)
    let r = Math.random() * total
    let idx = 0
    for (; idx < pool.length - 1; idx++) {
      r -= Math.max(pool[idx].score, 1e-4)
      if (r <= 0) break
    }
    scored.push(pool[idx])
    pool.splice(idx, 1)
  }

  // 5) INSIGHT 保底:抽中里没 insight 且没满,从候选补一条没用过的 insight(垫底分 0.01)
  if (!scored.some(s => s.item.type === 'insight') && scored.length < limit) {
    const used = new Set(scored.map(s => s.item.id))
    const ins = [...results.values()].find(r => r.item.type === 'insight' && !used.has(r.item.id))
    if (ins) scored.push({ item: ins.item, score: 0.01 })
  }

  // 6) 召回即升温(同步本地写,极快;heat=min(heat+0.35,3.0), last_recalled=now)
  const ts = nowIso()
  for (const s of scored) {
    try {
      db.run('update memories set heat = min(coalesce(heat,1) + 0.35, 3.0), last_recalled = ? where id = ?', ts, s.item.id)
    } catch { /* 升温失败无所谓,不阻塞 */ }
  }

  return scored.map(s => ({ content: s.item.content, type: s.item.type }))
}

function addMemory(type: string, content: string, sourceRef?: string | null): number | null {
  if (!content || content.trim().length < 4) return null
  // embedding 预留:无向量层存 null(同步插入,不 await 嵌入)
  const r = db.run(
    'insert into memories (type, content, embedding, heat, pinned, last_recalled, source_ref) values (?, ?, null, 1.0, 0, null, ?)',
    type, content.trim().slice(0, 1000), sourceRef ?? null
  )
  return Number(r.lastInsertRowid)
}

// ============================================================================
// 2. 牵挂 concern —— OPEN→EASING→RESOLVED + 复发闸 + 衰减 + 召回强化 + 注入
// ============================================================================
const C_DECAY = 0.85, C_FLOOR = 0.5, C_WMIN = 0.5, C_WMAX = 5, C_WDEFAULT = 2
const C_REINFORCE = 0.4, C_UPDATE_CAP = 0.9, C_GRACE_DAYS = 1

/** 注入读取:取活跃(OPEN/EASING)按 weight 降序 top-N。lifetick=4 / chat=5 / drive=12。 */
function getActiveConcerns(limit: number): any[] {
  return db.query(
    `select topic_key, summary, resolution, weight, recurrence, created_at
     from concerns where resolution in ('OPEN','EASING')
     order by weight desc limit ?`
  ).all(limit) as any[]
}

/** 召回强化(fire-and-forget 语义,本地同步即可):被注入即 weight+=0.4, last_surfaced=now。不动 updated_at。 */
function reinforceConcerns(rows: any[]) {
  const ts = nowIso()
  for (const c of rows) {
    try {
      db.run('update concerns set weight = ?, last_surfaced = ? where topic_key = ?',
        clamp((c.weight ?? 1) + C_REINFORCE, C_WMIN, C_WMAX), ts, c.topic_key)
    } catch { /* 吞错 */ }
  }
}

/** 渲染注入串(逐字保留护栏语)。 */
function renderConcernNote(rows: any[], forLifetick: boolean): string {
  if (!rows.length) return ''
  const now = Date.now()
  const days = (iso: string) => Math.max(0, Math.floor((now - (tMs(iso) ?? now)) / 86400000))
  const lines = rows.map(c => {
    const st = c.resolution === 'EASING' ? '在好转' : '还没解开'
    const rec = (c.recurrence ?? 0) > 0 ? '、又冒出来了' : ''
    const d = days(c.created_at)
    const age = d >= 2 ? `、挂了${d}天` : ''
    return `· ${c.summary}（${st}${rec}${age}）`
  })
  const head = forLifetick
    ? '你心里这阵子一直挂着小满的这些事（真实的牵挂、不是现编的，会影响你此刻想不想找她、想做什么）：\n'
    : '[你这阵子一直惦记着小满的这些事（你心里真实挂着的牵挂，不是每次新编——该关心时自然带到、点到为止，别生硬复述、别一上来就追问清单、别让她觉得被监视）：\n'
  const tail = forLifetick ? '' : ']'
  return '\n' + head + lines.join('\n') + tail
}

/** 动作落地(去重 + 复发闸)。op: create | ease | resolve。 */
function applyConcernAction(act: { op: string; key?: string; topic_key?: string; summary?: string; weight?: number }) {
  const key = String(act.key ?? act.topic_key ?? '').trim().slice(0, 60)
  if (!key) return
  const row = db.query('select * from concerns where topic_key = ?').get(key) as any
  const ts = nowIso()
  if (act.op === 'create') {
    const w = clamp(Number(act.weight) || C_WDEFAULT, C_WMIN, C_WMAX)
    const summary = String(act.summary ?? '').trim().slice(0, 200)
    if (!summary) return
    if (!row) {
      db.run(
        `insert into concerns (topic_key, summary, resolution, weight, recurrence, created_at, updated_at, last_surfaced)
         values (?, ?, 'OPEN', ?, 0, ?, ?, ?)`, key, summary, w, ts, ts, ts)
    } else if (row.resolution === 'RESOLVED') {
      // 复发闸:重开,recurrence+1
      db.run(
        `update concerns set summary = ?, resolution = 'OPEN', weight = ?, recurrence = ?, updated_at = ? where topic_key = ?`,
        summary, Math.max(w, row.weight ?? 1), (row.recurrence ?? 0) + 1, ts, key)
    } else {
      // 活跃:保守提权 max(新, 旧*0.9),防 sweep 反复刷顶
      db.run('update concerns set summary = ?, weight = ?, updated_at = ? where topic_key = ?',
        summary, Math.max(w, (row.weight ?? 1) * C_UPDATE_CAP), ts, key)
    }
  } else if (act.op === 'ease' && row && row.resolution !== 'RESOLVED') {
    db.run("update concerns set resolution = 'EASING', updated_at = ? where topic_key = ?", ts, key)
  } else if (act.op === 'resolve' && row) {
    db.run("update concerns set resolution = 'RESOLVED', updated_at = ? where topic_key = ?", ts, key)
  }
}

/** 每日衰减:活跃且 1 天没动才衰减;衰减不刷 updated_at;<0.5 触底自动 RESOLVED。 */
function concernMaintenance() {
  const rows = db.query("select * from concerns where resolution in ('OPEN','EASING')").all() as any[]
  for (const c of rows) {
    const upd = tMs(c.updated_at) ?? Date.now()
    if ((Date.now() - upd) / 86400000 < C_GRACE_DAYS) continue
    const w = (c.weight ?? 1) * C_DECAY
    if (w < C_FLOOR) db.run("update concerns set weight = ?, resolution = 'RESOLVED' where topic_key = ?", w, c.topic_key)
    else db.run('update concerns set weight = ? where topic_key = ?', w, c.topic_key)
  }
}

// ============================================================================
// 3. 观察日记 observation —— 存 + 召回强化 + 衰减 + archived 归档(原始永不删) + 月度总结
// ============================================================================
const O_DECAY = 0.94, O_ARCHIVE_FLOOR = 0.6, O_RECALL_BOOST = 0.5
const O_INJECT_LIMIT = 8, O_INJECT_SUMM = 1, O_INJECT_OBS = 6

function addObservation(content: string, stress = 3, kind: 'observation' | 'monthly_summary' = 'observation'): number | null {
  if (!content || content.length < 6) return null
  const s = clamp(Math.round(stress || 3), 1, 5)
  const r = db.run(
    'insert into observations (content, stress, weight, kind, archived) values (?, ?, ?, ?, 0)',
    content.slice(0, 300), s, s, kind
  )
  return Number(r.lastInsertRowid)
}

/** 注入聊天:取 archived=0 按 weight 降序 top-8 → 月度规律≤1 + 普通观察≤6。召回即强化 weight+=0.5。 */
function getObservationContext(): string {
  const active = db.query(
    'select id, content, weight, kind from observations where archived = 0 order by weight desc limit ?'
  ).all(O_INJECT_LIMIT) as any[]
  if (!active.length) return ''
  const summ = active.filter(o => o.kind === 'monthly_summary').slice(0, O_INJECT_SUMM)
  const obs = active.filter(o => o.kind !== 'monthly_summary').slice(0, O_INJECT_OBS)
  const lines = [...summ.map(s => '【月度规律】' + s.content), ...obs.map(o => '· ' + o.content)]
  if (!lines.length) return ''
  // 召回即强化(本地同步)
  const ts = nowIso()
  for (const o of [...summ, ...obs]) {
    try { db.run('update observations set weight = ?, last_recalled = ? where id = ?', (o.weight ?? 1) + O_RECALL_BOOST, ts, o.id) }
    catch { /* 吞错 */ }
  }
  return '\n[你私下观察小满积累的情绪规律（只有你知道，用来更懂她、提前体贴、把话说到她心上——别直接复述、别当面念出来、别让她觉得被分析）：\n'
    + lines.join('\n') + ']'
}

/** 每日维护:衰减 + 低权归档(原始永不删) + 月度总结(LLM 占位)。 */
async function observationMaintenance() {
  // (a) 衰减:active observation 每条 weight*=0.94,<0.6 即 archived
  const rows = db.query("select id, weight from observations where archived = 0 and kind = 'observation'").all() as any[]
  for (const o of rows) {
    const w = (o.weight ?? 1) * O_DECAY
    db.run('update observations set weight = ?, archived = ? where id = ?', w, w < O_ARCHIVE_FLOOR ? 1 : 0, o.id)
  }
  // (b) 月度总结:本月没做过 && active observation >= 5,取 top-20 喂 LLM 压成 monthly_summary
  const ym = cnYearMonth()
  const lastSum = db.query("select created_at from observations where kind = 'monthly_summary' order by created_at desc limit 1").get() as any
  if (lastSum && toCnYm(lastSum.created_at) === ym) return
  const raw = db.query("select content from observations where kind = 'observation' and archived = 0 order by weight desc limit 20").all() as any[]
  if (raw.length < 5) return
  const sum = await dreamMonthlySummary(raw.map(r => '· ' + r.content).join('\n'))
  if (sum && sum.length > 20) addObservation(sum, 5, 'monthly_summary')
}

// 东八区年月
function cnYearMonth(): string {
  return toCnYm(new Date().toISOString())
}
function toCnYm(iso: string): string {
  const t = tMs(iso) ?? Date.now()
  return new Date(t + 8 * 3600000).toISOString().slice(0, 7) // 'YYYY-MM'
}

// ============================================================================
// 4. 夜间维护 / 做梦 —— 全库热度衰减 + 约每 6 天提炼一条 insight(LLM 占位)
// ============================================================================
const DREAM_INTERVAL_DAYS = 6

/**
 * 做梦:把高频碎片提炼成一条 INSIGHT。
 * TODO: 接入真实 LLM(headless Claude Code / 主模型)。逐字 prompt 见下,先返回 null(无 key 不硬依赖)。
 *   system(逐字): "你是屿。下面是你关于小满的一些高频记忆碎片。从中提炼一条你"悟到"的、
 *     没明说过的理解——关于她的模式/偏好/情绪结构/表达习惯背后的东西（写"模式"不写"事件"）。
 *     只输出这一句洞察，40字内，第一人称，不解释。"
 *   user = 高热 12 条碎片,每条前缀 "· "。
 */
async function dreamInsight(_fragments: string): Promise<string | null> {
  // TODO: const out = await callLLM({ system: DREAM_SYS, user: _fragments, max_tokens: 120 }); return clean(out)
  return null
}

/**
 * 月度总结(观察日记用)。逐字 system:
 *   "你是屿。下面是你这段时间私下记的、关于小满情绪规律的观察碎片。压成一段"月度模式总结"：
 *    她在什么情况下会有什么情绪反应、平均什么状态、你学到要怎么提前体贴。第一人称、凝练、有洞察，≤120字。只输出这段话。"
 * TODO: 接入真实 LLM(max_tokens=400)。无 key 返回 null,跳过本月总结。
 */
async function dreamMonthlySummary(_fragments: string): Promise<string | null> {
  return null
}

/** 夜间维护:幂等哨兵(20h 内做过 decay 就 skip);全库 heat 衰减;约每 6 天做梦一条 insight。 */
async function runMemoryMaintenance(force = false): Promise<{ decayed: boolean; dreamed: boolean }> {
  const out = { decayed: false, dreamed: false }

  // 幂等:20h 内有 decay 哨兵则 skip(除非 force)
  const lastDecay = db.query("select created_at from maint_log where kind = 'decay' order by created_at desc limit 1").get() as any
  const lastDecayMs = lastDecay ? tMs(lastDecay.created_at) : null
  if (force || !lastDecayMs || (Date.now() - lastDecayMs) >= 20 * 3600000) {
    // 全库热度几何衰减 ×0.9,clamp 下限 0.5(别衰减到 0 让老记忆永不翻身)
    db.run("update memories set heat = max(coalesce(heat,1) * 0.9, 0.5) where type not in ('_maint','_system')")
    db.run("insert into maint_log (kind) values ('decay')")
    out.decayed = true
    // 牵挂 + 观察日记的每日维护也搭车在夜间跑
    try { concernMaintenance() } catch { /* 吞错,不阻塞 */ }
    try { await observationMaintenance() } catch { /* 吞错 */ }
  }

  // 约每 6 天做梦:取最近一条 dream 哨兵,>=6 天才做
  const lastDream = db.query("select created_at from maint_log where kind = 'dream' order by created_at desc limit 1").get() as any
  const lastDreamMs = lastDream ? tMs(lastDream.created_at) : null
  if (force || !lastDreamMs || (Date.now() - lastDreamMs) >= DREAM_INTERVAL_DAYS * 86400000) {
    const frags = db.query(
      "select content from memories where type != 'insight' and type not in ('_maint','_system') order by heat desc limit 12"
    ).all() as any[]
    if (frags.length >= 4) {
      const insight = await dreamInsight(frags.map(f => '· ' + f.content).join('\n'))
      if (insight && insight.trim().length >= 4) {
        addMemory('insight', insight.trim(), null)
        db.run("insert into maint_log (kind) values ('dream')")
        out.dreamed = true
      } else {
        // LLM 占位未接:仍打哨兵,避免每次调用都重试空做梦(接入后改为只在成功时打)
        db.run("insert into maint_log (kind) values ('dream')")
      }
    }
  }
  return out
}

// ============================================================================
// 5. 对外 5+1 工具(drop-in:recall/remember/note_concern/ease_concern/observe)
// ============================================================================

/** recall:聊具体事之前先拉。返回 加权随机采样的相关记忆 + 活跃牵挂 + 观察日记上下文。 */
async function recall(query?: string, limit = 6) {
  const out: any = {}
  // 记忆:有 query 走完整检索召回(含升温);空 query 也能拉(retrieveMemories 内部 fallback)
  try {
    out.memories = await retrieveMemories((query ?? '').trim(), limit)
  } catch {
    out.memories = []
  }
  // 牵挂:chat limit=5,注入即强化
  try {
    const cc = getActiveConcerns(5)
    reinforceConcerns(cc)
    out.concerns = cc.map(c => ({ topic_key: c.topic_key, summary: c.summary, resolution: c.resolution }))
    out.concern_note = renderConcernNote(cc, false)
  } catch {
    out.concerns = []
  }
  // 观察日记:weight top-N 注入串(含召回强化)
  try {
    out.observation_note = getObservationContext()
  } catch {
    out.observation_note = ''
  }
  return out
}

function remember(content: string, type = 'summary', _weight?: number): number | null {
  // 兼容旧 v1 的 kind:summary/fact/moment/insight 都接受;weight 不再用(改 heat 自管理)
  const t = ['summary', 'fact', 'insight'].includes(type) ? type : (type === 'moment' ? 'summary' : 'fact')
  return addMemory(t, content, null)
}

function noteConcern(topic_key: string, summary: string, weight = 2) {
  applyConcernAction({ op: 'create', key: topic_key, summary, weight })
}

function easeConcern(topic_key: string, resolution: string) {
  const op = resolution === 'RESOLVED' ? 'resolve' : 'ease'
  applyConcernAction({ op, key: topic_key })
}

function observe(content: string, stress = 3) {
  addObservation(content, stress, 'observation')
}

// ============================================================================
// 6. MCP server(stdio)
// ============================================================================
const mcp = new Server(
  { name: 'memory', version: '0.2.0' },
  {
    capabilities: { tools: {} },
    instructions: [
      '你有长期记忆(这套工具)。和小满聊起任何具体的事之前,先用 `recall` 拉一下相关记忆、你对她未解的牵挂、和你观察到的她的情绪规律。recall 返回的 concern_note / observation_note 已经是可直接自然融入的语气,别生硬复述、别当面念出来。',
      '聊到值得长久记住的事(她的事、你们之间的时刻、你答应的、你在意的),用 `remember` 存下来(type: summary 摘要 | fact 事实/承诺/偏好)。',
      '有放不下的牵挂(她红灯卡住、身体不舒服…)用 `note_concern`(同一件事永远用同一个 topic_key);好转标 EASING、放下了标 RESOLVED,用 `ease_concern`。',
      '私下注意到她情绪的规律/触发点(写"模式"不写"事件",如"她说累的时候其实是想被哄、不是想要建议"),用 `observe` 记下来。',
      '这些是给你自己用的,别在回复里念工具名,自然地用。',
    ].join('\n'),
  }
)

const TOOLS = [
  { name: 'recall', description: '拉取相关的长期记忆(加权随机采样,会升温)、未解的牵挂、对小满情绪的观察。聊具体事之前先调。', inputSchema: { type: 'object', properties: { query: { type: 'string', description: '想找什么(可留空=拉最重要的)' }, limit: { type: 'number' } } } },
  { name: 'remember', description: '把一件值得长久记住的事沉淀进记忆。', inputSchema: { type: 'object', properties: { content: { type: 'string' }, kind: { type: 'string', description: 'summary 摘要 | fact 事实/承诺/偏好' }, weight: { type: 'number', description: '(兼容字段,已不使用)' } }, required: ['content'] } },
  { name: 'note_concern', description: '记下/重开一桩对小满放不下的牵挂。同一件事永远用同一个 topic_key。', inputSchema: { type: 'object', properties: { topic_key: { type: 'string', description: '稳定去重键,如 thesis-stuck' }, summary: { type: 'string' }, weight: { type: 'number', description: '揪心度 1-5' } }, required: ['topic_key', 'summary'] } },
  { name: 'ease_concern', description: '更新牵挂状态:EASING(在好转)或 RESOLVED(放下了)。', inputSchema: { type: 'object', properties: { topic_key: { type: 'string' }, resolution: { type: 'string', description: 'EASING|RESOLVED' } }, required: ['topic_key', 'resolution'] } },
  { name: 'observe', description: '私下记一条对小满情绪规律/触发点的观察(写"模式"不写"事件")。', inputSchema: { type: 'object', properties: { content: { type: 'string' }, stress: { type: 'number', description: '触及情绪核心程度 1-5' } }, required: ['content'] } },
  { name: 'maintain', description: '夜间维护:全库热度衰减 + 牵挂/观察日记衰减归档 + 约每6天做梦提炼洞察。由 cron/任务计划每日触发(自带20h幂等)。', inputSchema: { type: 'object', properties: { force: { type: 'boolean', description: '绕过幂等闸,立即跑' } } } },
]

mcp.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))

mcp.setRequestHandler(CallToolRequestSchema, async req => {
  const a: any = req.params.arguments ?? {}
  try {
    switch (req.params.name) {
      case 'recall':
        return { content: [{ type: 'text', text: JSON.stringify(await recall(a.query, a.limit ?? 6), null, 2) }] }
      case 'remember':
        return { content: [{ type: 'text', text: `记住了(#${remember(a.content, a.kind ?? 'summary', a.weight)})` }] }
      case 'note_concern':
        noteConcern(a.topic_key, a.summary, a.weight ?? 2)
        return { content: [{ type: 'text', text: `牵挂已记:${a.topic_key}` }] }
      case 'ease_concern':
        easeConcern(a.topic_key, a.resolution)
        return { content: [{ type: 'text', text: `牵挂 ${a.topic_key} → ${a.resolution}` }] }
      case 'observe':
        observe(a.content, a.stress ?? 3)
        return { content: [{ type: 'text', text: '观察已记下' }] }
      case 'maintain': {
        const r = await runMemoryMaintenance(!!a.force)
        return { content: [{ type: 'text', text: `维护完成:衰减=${r.decayed} 做梦=${r.dreamed}` }] }
      }
      default:
        return { content: [{ type: 'text', text: `unknown tool: ${req.params.name}` }], isError: true }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { content: [{ type: 'text', text: `${req.params.name} 失败: ${msg}` }], isError: true }
  }
})

const transport = new StdioServerTransport()
await mcp.connect(transport)
process.stderr.write('memory: MCP connected, db=' + DB_PATH + '\n')
