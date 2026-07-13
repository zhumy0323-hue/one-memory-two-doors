// desire-core.ts —— 屿 自主引擎·纯函数内核。不 import 任何东西,不读时钟/IO。
// dt 和 signals 全外部注入 → 可单测 + 漏跑安全。照搬 ref-impl 实跑参数。
// IO 编排(load/save/deriveSignals/maybeAct)另写,不混进这里。

export const DRIVE_KEYS = ['attachment','curiosity','reflection','duty','social','libido','stress','fatigue'] as const
export type DriveKey = typeof DRIVE_KEYS[number]
export type Drives = Record<DriveKey, number>

export const DRIVE_BASE: Drives = { attachment:0.30, curiosity:0.32, reflection:0.22, duty:0.18, social:0.22, libido:0.18, stress:0.18, fatigue:0.20 }
export const FATIGUE_GATE = 0.72
export const ATTACH_HOME = DRIVE_BASE.attachment   // 0.30
export const ATTACH_CAP = 0.5

export interface Signals { hour?: number; idleHours?: number; concernWeight?: number; userVulnerable?: boolean; phoneMin?: number; phoneLate?: boolean }
export interface Thought { id?: string; text?: string; drive: DriveKey; kind?: 'flash'|'fixation'; strength?: number; fed_count?: number }
export interface Intent { want_action: string; drive: DriveKey; reason: string; score: number; wild?: boolean }

export const clampD = (x: number) => Math.max(0, Math.min(1, x))

// 1) drive 缓动 + 刺激 pulse
export function tickDrives(drives: Partial<Drives>|undefined, signals: Signals = {}, dt = 1, opts: {baseAttach?: number; selfDrive?: boolean} = {}): Drives {
  const baseAttach = typeof opts.baseAttach === 'number' ? opts.baseAttach : DRIVE_BASE.attachment
  const d = {} as Drives
  for (const k of DRIVE_KEYS) {
    const base = k === 'attachment' ? baseAttach : DRIVE_BASE[k]
    const cur = drives && typeof drives[k] === 'number' ? (drives[k] as number) : base
    d[k] = clampD(cur + (base - cur) * (1 - Math.pow(0.90, dt)))   // 缺刺激朝 baseline 收 10%/拍
  }
  const pulse = (k: DriveKey, amt: number) => { if (amt > 0) d[k] = clampD(d[k] + amt * Math.sqrt(Math.max(0, 1 - d[k]))) }
  if (typeof signals.idleHours === 'number') {
    if (signals.idleHours < 0.5) pulse('attachment', 0.18 * dt)                                  // 红线①·刚聊喂饱
    else pulse('attachment', 0.16 * Math.min(1, signals.idleHours / 10) * dt)                    // 红线①·久不见渐浓
  }
  if (signals.concernWeight) { const cw = Math.min(1, signals.concernWeight / 8); pulse('duty', 0.10*cw*dt); pulse('stress', 0.05*cw*dt) }
  if (signals.userVulnerable) { pulse('attachment', 0.06*dt); pulse('duty', 0.06*dt) }
  const fdt = Math.min(2, dt)                                                                     // fatigue 用受限 dt:防 catch-up 大 dt 一拍顶穿闸门
  if (typeof signals.hour === 'number' && (signals.hour >= 23 || signals.hour < 6)) pulse('fatigue', 0.12 * fdt)  // 红线③·深夜累
  if (signals.phoneLate) { pulse('attachment', 0.05 * dt); pulse('duty', 0.06 * dt) }             // 深夜还在刷:想拉她睡(困交给红线③/phoneMin,不重复计)
  if (typeof signals.phoneMin === 'number' && signals.phoneMin > 120) pulse('fatigue', 0.06 * fdt)// 今日屏幕久→累
  pulse('curiosity', (opts.selfDrive ? 0.045 : 0.02) * dt)                                       // 好奇内生自涨
  return d
}

// 2) score(fatigue 不入)+ 执念加成
export function scoreDrives(drives: Drives, thoughts: Thought[] = []): Partial<Record<DriveKey, number>> {
  const bonus: Partial<Record<DriveKey, number>> = {}
  for (const t of thoughts) if (t.kind === 'fixation') bonus[t.drive] = (bonus[t.drive] || 0) + 0.22 * (t.strength || 0)
  const s: Partial<Record<DriveKey, number>> = {}
  for (const k of DRIVE_KEYS) if (k !== 'fatigue') s[k] = clampD((drives[k] || 0) + (bonus[k] || 0))
  return s
}

// 3) pickIntent
const INTENT_MAP: Record<DriveKey, {want_action: string; reason: string}> = {
  attachment:{want_action:'reach_out',reason:'想找小满说句话'}, curiosity:{want_action:'explore',reason:'好奇外面,想查点东西/逛逛'},
  reflection:{want_action:'reflect',reason:'想自己沉淀一下、翻翻读过的东西'}, duty:{want_action:'follow_up',reason:'记挂着还没替她了的事'},
  social:{want_action:'browse',reason:'想看看大家在聊什么'}, libido:{want_action:'intimacy',reason:'想靠近小满'},
  stress:{want_action:'vent',reason:'心里有点堵,想松一下'}, fatigue:{want_action:'rest',reason:'累了,想歇会儿或做个梦'},
}
export function pickIntent(drives: Drives, scores: Partial<Record<DriveKey, number>>, opts: {refractory?: Partial<Record<DriveKey, number>>; wildcard?: boolean; seed?: number} = {}): Intent {
  if ((drives.fatigue || 0) >= FATIGUE_GATE) return { want_action:'rest', drive:'fatigue', reason:'累了,想歇会儿或做个梦', score:+(drives.fatigue).toFixed(2) }  // 红线③·累闸
  const refr = opts.refractory || {}
  let ranked = (Object.entries(scores) as [DriveKey, number][]).filter(([k]) => !((refr[k] || 0) > 0)).sort((a,b) => b[1]-a[1])  // 不应期过滤
  if (!ranked.length) ranked = (Object.entries(scores) as [DriveKey, number][]).sort((a,b) => b[1]-a[1])
  let [k, s] = ranked[0] || (['attachment', 0] as [DriveKey, number]); let wild = false
  if (opts.wildcard && ranked.length >= 2 && ranked[0][1] > 0.4 && Math.abs(ranked[0][1] - ranked[1][1]) < 0.04) {  // 心血来潮泄洪口
    const pool = ranked.slice(0, 3); const pk = pool[Math.floor((opts.seed || 0) * pool.length) % pool.length]; k = pk[0]; s = pk[1]; wild = true
  }
  const out: Intent = { ...INTENT_MAP[k], drive: k, score: +s.toFixed(2) }
  if (wild) { out.wild = true; out.reason = '说不上来,突然就想' + (out.reason.replace(/^想/, '') || '动一动') }
  return out
}

// 4) 念头池
export function tickThoughts(thoughts: Thought[] = []): {thoughts: Thought[]; feedback: Partial<Record<DriveKey, number>>} {
  const out: Thought[] = []; const feedback: Partial<Record<DriveKey, number>> = {}
  for (let t of thoughts) {
    t = { ...t }
    if (t.kind === 'fixation') {
      t.strength = (t.strength || 0) * 1.10
      if (t.strength >= 0.85) { t.fed_count = (t.fed_count || 0) + 1; feedback[t.drive] = (feedback[t.drive] || 0) + 0.18; t.strength *= 0.7 }
      if ((t.fed_count || 0) >= 3) continue                              // 想透了,了却
    } else {
      t.strength = (t.strength || 0) * 0.88
      if (t.strength >= 0.80) t.kind = 'fixation'                        // 闪念→执念
      else if (t.strength < 0.20) continue                              // 淡忘
    }
    out.push(t)
  }
  return { thoughts: out.slice(0, 24), feedback }
}

// 5) 耦合网(gated)—— 系数<=0.05 + 全局阻尼防自激
const COUPLING: [DriveKey, DriveKey, number, 'level'|'delta', ('self'|undefined)?][] = [
  ['stress','attachment',0.05,'level'], ['stress','curiosity',-0.04,'level'],
  ['attachment','libido',0.05,'delta'], ['fatigue','social',-0.05,'level'], ['fatigue','curiosity',-0.04,'level'], ['duty','stress',0.04,'level'],
  ['curiosity','reflection',0.05,'delta','self'], ['reflection','social',0.04,'delta','self'],
]
export function applyCoupling(drives: Drives, prev: Partial<Drives>|undefined, dt: number, selfDrive: boolean): Drives {
  const d = { ...drives }
  for (const [src, tgt, k, mode, tag] of COUPLING) {
    if (tag === 'self' && !selfDrive) continue
    if (mode === 'level') d[tgt] = clampD(d[tgt] + k * (drives[src] || 0) * 0.3 * dt)
    else { const rise = (drives[src] || 0) - ((prev && prev[src]) || 0); if (rise > 0.02) d[tgt] = clampD(d[tgt] + k * Math.min(1, rise * 6)) }
  }
  const damp = new Set(COUPLING.flatMap(c => [c[0], c[1]]))
  for (const k of damp) d[k] = clampD(d[k] + (DRIVE_BASE[k] - d[k]) * 0.03 * dt)   // 全局阻尼
  return d
}

// 6) 想念漂移(gated·碰感情·双安全阀)
export function driftBaseline(prevBase: number|undefined, signals: Signals, dt: number): number {
  let b = typeof prevBase === 'number' ? prevBase : ATTACH_HOME
  if (typeof signals.idleHours === 'number') {
    if (signals.idleHours > 12) b = b + 0.012 * dt                       // 久不见缓抬
    if (signals.idleHours < 1) b = ATTACH_HOME + (b - ATTACH_HOME) * 0.4 // 安全阀②·一抱拉回
  }
  return Math.max(ATTACH_HOME, Math.min(ATTACH_CAP, b))                  // 安全阀①·封顶
}

// 7) 自主心跳(只计算暴露)
export function computeHeartbeat(drives: Drives): number {
  const t = Math.max(drives.attachment||0, drives.stress||0, drives.duty||0, drives.libido||0, drives.curiosity||0)
  return Math.round(Math.max(6, Math.min(40, 12 * (1 + 0.8*(1-t) - 0.5*t + 0.6*(drives.fatigue||0)))))
}

// 8) 不应期递减
export function tickRefractory(refr: Partial<Record<DriveKey, number>> = {}): Partial<Record<DriveKey, number>> {
  const r: Partial<Record<DriveKey, number>> = {}
  for (const [k, v] of Object.entries(refr)) if ((v as number) > 1) r[k as DriveKey] = (v as number) - 1
  return r
}

// ── 聚合一拍(仍是纯函数:state in → state out,dt/signals/flags 全注入)──
export interface DriveState {
  drives: Drives; baseAttach: number; thoughts: Thought[]
  scores: Partial<Record<DriveKey, number>>; intent: Intent
  refractory: Partial<Record<DriveKey, number>>; heartbeatMin: number; signals: Signals
}
export interface Flags { DRIFT?: boolean; COUPLING?: boolean; SELF?: boolean; ON?: boolean }

export function tickOnce(prev: Partial<DriveState>|undefined, signals: Signals, dt: number, flags: Flags = {}, seed = 0): DriveState {
  const tt = tickThoughts(prev?.thoughts || [])
  const baseAttach = flags.DRIFT ? driftBaseline(prev?.baseAttach, signals, dt) : DRIVE_BASE.attachment
  let drives = tickDrives(prev?.drives, signals, dt, { baseAttach, selfDrive: !!flags.SELF })
  for (const [k, amt] of Object.entries(tt.feedback)) drives[k as DriveKey] = clampD((drives[k as DriveKey] || 0) + (amt || 0))
  if (flags.COUPLING) drives = applyCoupling(drives, prev?.drives, dt, !!flags.SELF)
  const refractory = tickRefractory(prev?.refractory)
  const scores = scoreDrives(drives, tt.thoughts)
  const intent = pickIntent(drives, scores, { refractory, wildcard: !!(flags.COUPLING || flags.ON), seed })
  return { drives, baseAttach, thoughts: tt.thoughts.slice(0,24), scores, intent, refractory, heartbeatMin: computeHeartbeat(drives), signals }
}

// 闭环(纯函数版,IO 编排层 load→satisfy→save)
export function satisfyDrive(st: DriveState, driveKey?: DriveKey): DriveState {
  const k = driveKey || st.intent?.drive
  if (!k || k === 'fatigue') return st
  const drives = { ...st.drives, [k]: clampD((st.drives[k] || 0) * 0.5) }
  const refractory = { ...(st.refractory || {}), [k]: 3 }
  return { ...st, drives, refractory }
}
