import React, { useState, useEffect, useRef } from 'react';
const BACKEND = '';   // 同源相对路径:PWA 由 hub 自己 serve,http://…:3456 和 https://你的域名 两种访问都对(避免 HTTPS 下调 http 的混合内容拦截)
// 并发去重:同一 GET 正在飞时,后来的复用同一请求(主页一批组件同时拉同一端点→只发一次,缓解中→日延迟)。不缓存、resolve 即移除,数据照样新鲜;POST/SSE 不受影响。
if (typeof window !== 'undefined' && !window.__gfetchPatched) {
  window.__gfetchPatched = true;
  const _origFetch = window.fetch.bind(window);
  const _inflight = new Map();
  window.fetch = (url, opts) => {
    const method = (opts && opts.method ? opts.method : 'GET').toUpperCase();
    const key = (method === 'GET' && typeof url === 'string') ? url : null;
    if (!key) return _origFetch(url, opts);
    const ex = _inflight.get(key);
    if (ex) return ex.then(r => r.clone());
    const p = _origFetch(url, opts);
    _inflight.set(key, p);
    p.then(() => _inflight.delete(key), () => _inflight.delete(key));
    return p.then(r => r.clone());
  };
}
// 共享样式 helper（整合：消除重复内联样式，行为/数值不变，差异走 extra 覆盖）
const styleInput = (t, extra = {}) => ({ width: '100%', boxSizing: 'border-box', fontSize: 14, padding: '10px 12px', border: `1px solid ${t.border}`, borderRadius: 10, background: 'transparent', color: t.text1, fontFamily: 'inherit', outline: 'none', ...extra });

// 解析后端时间戳 → 毫秒：朴素时间（"YYYY-MM-DD HH:MM:SS"，实为 UTC、无时区标记）补上 T/Z 再解析，
// 避免 iOS Safari 解析成 Invalid Date、其他平台差 8 小时；无效输入返回 0
const parseServerTime = (s) => { if (!s) return 0; let x = String(s); if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(x) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(x)) x = x.replace(' ', 'T') + 'Z'; const d = new Date(x); return isNaN(d.getTime()) ? 0 : d.getTime(); };

// 清除旧的默认待办（只执行一次）
if (!localStorage.getItem('companion_todos_v2')) {
  localStorage.removeItem('companion_todos');
  localStorage.setItem('companion_todos_v2', '1');
}
// 屿专属版：只保留「屿 · Yu」一个角色（原 4 个内置角色已删除）
const CHARACTERS = [
  {
    id: 'yu', name: '沈屿 · Yu', en: 'Yu', initial: 'S',
    accent: '#e0879f',
    models: [
      { label: 'Claude Opus 4.8', value: 'claude-4.8-opus' },
      { label: 'Claude Sonnet 4.6', value: 'claude-4.6-sonnet' },
    ]
  },
];

// 角色头像：优先用云端上传的真实头像（应用内「换头像」即可换），否则用下面的矢量头像（渐变+玻璃光+姓氏字）
const CHARACTER_AVATARS = { yu: '' };
const AVATAR_ART = {
  yu:  { s0: '#f7d8e2', s1: '#e0879f', s2: '#a85772', ch: '屿' },
  me:     { s0: '#e8e8ea', s1: '#9a9aa0', s2: '#5a5a60', ch: '晏' },
};
// 云端头像缓存：GET /avatar/list 拉一次；上传后用 setAvatarUrl 即时更新全 app
const _avatarCache = {};
let _avatarLoaded = false;
const _avatarSubs = new Set();
function loadAvatars() {
  if (_avatarLoaded) return;
  _avatarLoaded = true;
  fetch(`${BACKEND}/avatar/list`).then(r => r.json()).then(d => { Object.assign(_avatarCache, d.avatars || {}); _avatarSubs.forEach(fn => fn()); }).catch(() => {});
}
function setAvatarUrl(cid, url) { _avatarCache[cid] = url; _avatarSubs.forEach(fn => fn()); }
// 头像形状偏好：circle 圆形 / square 方形(四角微圆)，全 app 统一
let _avatarShape = 'circle';
try { _avatarShape = localStorage.getItem('companion_avatar_shape') || 'circle'; } catch {}
function getAvatarShape() { return _avatarShape; }
function setAvatarShape(s) { _avatarShape = s; try { localStorage.setItem('companion_avatar_shape', s); } catch {} _avatarSubs.forEach(fn => fn()); }
function avatarRadius(size) { return _avatarShape === 'square' ? Math.max(5, Math.round(size * 0.24)) : '50%'; }
// 单聊本地偏好：备注 / 聊天背景 / 免打扰 / 置顶（存 localStorage，按角色 id）
function getRemark(cid) { try { return localStorage.getItem('yc_remark_' + cid) || ''; } catch { return ''; } }
function setRemark(cid, v) { try { v ? localStorage.setItem('yc_remark_' + cid, v) : localStorage.removeItem('yc_remark_' + cid); } catch {} }
function charDisplayName(c) { const id = typeof c === 'string' ? c : c?.id; const name = typeof c === 'string' ? id : c?.name; return getRemark(id) || name; }
function getChatBg(cid) { try { return localStorage.getItem('yc_chatbg_' + cid) || ''; } catch { return ''; } }
function setChatBg(cid, v) { try { v ? localStorage.setItem('yc_chatbg_' + cid, v) : localStorage.removeItem('yc_chatbg_' + cid); } catch {} }
function getChatPref(cid, key) { try { return localStorage.getItem('yc_' + key + '_' + cid) === '1'; } catch { return false; } }
function setChatPref(cid, key, v) { try { v ? localStorage.setItem('yc_' + key + '_' + cid, '1') : localStorage.removeItem('yc_' + key + '_' + cid); } catch {} }
function getModelIdx(cid) { try { const n = parseInt(localStorage.getItem('yc_modelidx_' + cid)); return Number.isInteger(n) && n >= 0 ? n : 0; } catch { return 0; } }
function setSavedModelIdx(cid, i) { try { localStorage.setItem('yc_modelidx_' + cid, String(i)); } catch {} }
function getSavedMode(cid) { try { return localStorage.getItem('yc_mode_' + cid) === 'long' ? 'long' : 'short'; } catch { return 'short'; } }
function setSavedMode(cid, m) { try { localStorage.setItem('yc_mode_' + cid, m === 'long' ? 'long' : 'short'); } catch {} }
// 把「关掉主动消息」的角色同步给后端，否则后台 cron 还是会发（前端开关只挡前端定时器）
function syncProactiveMute() {
  const map = {};
  for (const c of CHARACTERS) if (getChatPref(c.id, 'noproactive')) map[c.id] = true;
  fetch(`${BACKEND}/kv/proactive_mute`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: map }) }).catch(() => {});
}
// 自建角色注册表（cc_ 开头）：全 app 共享，登场于联系人/聊天列表/聊天页
let _customChars = [];
const _customSubs = new Set();
function loadCustomChars() { fetch(`${BACKEND}/custom-characters`).then(r => r.json()).then(d => { _customChars = d.characters || []; _customSubs.forEach(fn => fn()); }).catch(() => {}); }
function customCharObj(c) { return { id: c.id, name: c.name, accent: c.accent || '#8a8a8e', custom: true, models: [{ label: '自定义', value: c.model || 'claude-4.6-sonnet' }] }; }
function findChar(id) { const b = CHARACTERS.find(c => c.id === id); if (b) return b; const cc = _customChars.find(c => c.id === id); return cc ? customCharObj(cc) : null; }
// 自建群聊注册表（cg_=普通群 / cgn_=私密群）。共用 _customSubs 触发订阅者重渲染
let _customGroups = [];
function loadCustomGroups() { fetch(`${BACKEND}/custom-groups`).then(r => r.json()).then(d => { _customGroups = d.groups || []; _customSubs.forEach(fn => fn()); }).catch(() => {}); }
function isNsfwGroupId(id) { return typeof id === 'string' && id.startsWith('cgn_'); }
// 当前打开的群（goGroup 设置，渲染时传给 GroupPage）
let _openGroup = { id: 'group_chat', nsfw: false };
// 当前单聊是否私密(NSFW)模式（goChat 第三参设置）
let _chatNsfw = false;

// ===== 玩具控制器（Web Bluetooth；需在 iPhone Bluefy 里打开本站）。模块级，连接跨页面保持 =====
const TOY_SVC = '0000ee01-0000-1000-8000-00805f9b34fb';
const TOY_WRITE = '0000ee03-0000-1000-8000-00805f9b34fb';
const _toy = { device: null, ch: null, wmode: '', connected: false, lastTs: 0, levels: { suck: 0, vibe: 0, shock: 0 }, status: '未连接' };   // levels=吸/震/电各自强度(0-100)，三通道独立可同时
let _toyModes = { suck: 7, vibe: 1, shock: 3 };   // BLE玩具实测：吸=7 震=1 电=3（可被本地存档覆盖）
try { _toyModes = { ..._toyModes, ...JSON.parse(localStorage.getItem('yc_toy_modes') || '{}') }; } catch {}
let _toyPoll = null, _toyKeep = null, _toyHb = null;
function toyReport(on) { fetch(`${BACKEND}/toy/online`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on }) }).catch(() => {}); }
const _toySubs = new Set();
function _toyNotify() { _toySubs.forEach(fn => { try { fn(); } catch {} }); }
function _toyFrame(m, l) { l = Math.max(0, Math.min(100, l | 0)); return new Uint8Array([1, 1, 0, 2, 0, m & 0xff, 0x11, l & 0xff, 0, (m + 1) & 0xff, 0x11, 1]); }
const _TOY_INIT = Uint8Array.from('0101000100c81101'.match(/../g).map(h => parseInt(h, 16)));
async function _toyWrite(buf) {
  if (!_toy.ch) return;
  try { if (_toy.wmode === 'wnr') await _toy.ch.writeValueWithoutResponse(buf); else await _toy.ch.writeValue(buf); }
  catch { try { await _toy.ch.writeValue(buf); _toy.wmode = 'w'; } catch {} }
}
async function toySet(funcKey, level) { level = Math.max(0, Math.min(100, level | 0)); _toy.levels[funcKey] = level; await _toyWrite(_toyFrame(_toyModes[funcKey] || 7, level)); _toyNotify(); }
async function toyStopAll() { for (const k of ['suck', 'vibe', 'shock']) { _toy.levels[k] = 0; await _toyWrite(_toyFrame(_toyModes[k] || 7, 0)); } _toyNotify(); }
function _toyKeepAlive() { for (const k of ['suck', 'vibe', 'shock']) { if (_toy.levels[k] > 0) _toyWrite(_toyFrame(_toyModes[k] || 7, _toy.levels[k])); } }
function toyPushCh(funcKey, level) { fetch(`${BACKEND}/toy/cmd`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ func: funcKey, level }) }).catch(() => {}); }
function toyPushStop() { fetch(`${BACKEND}/toy/cmd`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stop: true }) }).catch(() => {}); }
function toyRawTry(mode) { _toyWrite(_toyFrame(mode, 50)); }   // 探测：直接试某 mode
async function toyConnect() {
  if (typeof navigator === 'undefined' || !navigator.bluetooth) { _toy.status = '此浏览器不支持蓝牙（iPhone 请用 Bluefy 打开）'; _toyNotify(); return; }
  try {
    _toy.status = '搜索中…'; _toyNotify();
    const dev = await navigator.bluetooth.requestDevice({ filters: [{ namePrefix: 'SOSEXY' }], optionalServices: [TOY_SVC] });
    _toy.device = dev;
    dev.addEventListener('gattserverdisconnected', () => { _toy.connected = false; _toy.ch = null; _toy.status = '已断开（点重新连接）'; if (_toyPoll) clearInterval(_toyPoll); if (_toyKeep) clearInterval(_toyKeep); if (_toyHb) clearInterval(_toyHb); toyReport(false); _toyNotify(); });
    const server = await dev.gatt.connect();
    const svc = await server.getPrimaryService(TOY_SVC);
    _toy.ch = await svc.getCharacteristic(TOY_WRITE);
    const p = _toy.ch.properties; _toy.wmode = p.write ? 'w' : (p.writeWithoutResponse ? 'wnr' : 'w');
    await _toyWrite(_TOY_INIT);
    _toy.connected = true; _toy.lastTs = 0; _toy.levels = { suck: 0, vibe: 0, shock: 0 }; _toy.status = '已连接 · ' + (dev.name || 'SOSEXY'); _toyNotify();
    try { const r = await fetch(`${BACKEND}/toy/cmd`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stop: true }) }).then(x => x.json()); if (r && r.state && r.state.ts) _toy.lastTs = r.state.ts; } catch {}   // 清掉上一场残留档位，连接默认归0（否则探针读到旧的100又会开起来）
    toyReport(true); if (_toyHb) clearInterval(_toyHb); _toyHb = setInterval(() => { if (_toy.connected) toyReport(true); }, 20000);   // 上报在线，让角色知道能驱动
    await toySet('suck', 60); setTimeout(() => toySet('suck', 0), 600);   // 震一下确认连接，随后归 0，交给角色
    if (_toyPoll) clearInterval(_toyPoll);
    _toyPoll = setInterval(async () => {
      if (!_toy.connected) return;
      try { const s = await fetch(`${BACKEND}/toy/state`).then(r => r.json()); if (s && s.ts && s.ts !== _toy.lastTs) { _toy.lastTs = s.ts; for (const k of ['suck', 'vibe', 'shock']) { const v = s[k] || 0; if (v !== _toy.levels[k]) await toySet(k, v); } } } catch {}   // 角色驱动：三通道独立、可同时
    }, 1000);
    if (_toyKeep) clearInterval(_toyKeep);
    _toyKeep = setInterval(() => { if (_toy.connected) _toyKeepAlive(); }, 25000);
  } catch (e) { _toy.status = '连接失败：' + (e.message || e); _toyNotify(); }
}
function toyDisconnect() { try { _toy.device && _toy.device.gatt && _toy.device.gatt.disconnect(); } catch {} }
// 聊天列表预览：把卡片标记/分隔符/附图标记转成人话，别露 JSON
function previewText(s) {
  s = String(s || '');
  if (s.startsWith('__WALLET__')) return '[微信卡片]';
  if (s.startsWith('__LOC__')) { try { return '[位置] ' + (JSON.parse(s.slice(7)).place || ''); } catch { return '[位置]'; } }
  if (s.startsWith('__SHARE__')) { try { return '[分享] ' + (JSON.parse(s.slice(9)).title || ''); } catch { return '[分享链接]'; } }
  if (s.startsWith('__SONG__')) { try { return '[点歌] ' + (JSON.parse(s.slice(8)).name || ''); } catch { return '[歌曲]'; } }
  return s.replace(/\s*\|\|\|\s*/g, ' ').replace(/\[附图:[^\]]*\]/g, '[图片]').replace(/^\[引用[^\]]*\]\s*/, '').trim();
}
function CharAvatar({ c, size = 40, style = {} }) {
  const id = typeof c === 'string' ? c : c?.id;
  const [, bump] = useState(0);
  const [imgErr, setImgErr] = useState(false);
  useEffect(() => { loadAvatars(); const fn = () => { setImgErr(false); bump(x => x + 1); }; _avatarSubs.add(fn); _customSubs.add(fn); return () => { _avatarSubs.delete(fn); _customSubs.delete(fn); }; }, []);
  const art = AVATAR_ART[id];
  const url = _avatarCache[id] || CHARACTER_AVATARS[id];
  const rad = avatarRadius(size);
  const base = { width: size, height: size, borderRadius: rad, flexShrink: 0, display: 'block', ...style };
  if (url && !imgErr) return <img src={url} alt="" style={{ ...base, objectFit: 'cover' }} onError={() => setImgErr(true)} />;
  if (!art) {
    // 自建角色：无矢量头像 → 用主题色 + 首字字母头像
    const cc = (typeof c === 'object' && c?.custom) ? c : _customChars.find(x => x.id === id);
    if (cc) return <div style={{ ...base, background: cc.accent || '#8a8a8e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: Math.round(size * 0.42), fontWeight: 600, fontFamily: 'inherit' }}>{String(cc.name || '?')[0]}</div>;
    return null;
  }
  const sq = _avatarShape === 'square';
  return (
    <svg width={size} height={size} viewBox="0 0 88 88" style={base} aria-hidden="true">
      <defs><radialGradient id={`ga_${id}`} cx="35%" cy="30%" r="80%">
        <stop offset="0%" stopColor={art.s0} /><stop offset="55%" stopColor={art.s1} /><stop offset="100%" stopColor={art.s2} />
      </radialGradient></defs>
      {sq ? <rect x="0" y="0" width="88" height="88" rx="20" ry="20" fill={`url(#ga_${id})`} /> : <circle cx="44" cy="44" r="44" fill={`url(#ga_${id})`} />}
      <ellipse cx="31" cy="27" rx="22" ry="15" fill="#fff" opacity="0.20" />
      <text x="44" y="58" textAnchor="middle" fontFamily="Georgia, 'Songti SC', 'Noto Serif SC', serif" fontSize="38" fontWeight="600" fill="#fff" opacity="0.96">{art.ch}</text>
    </svg>
  );
}

// ── 主题 ──
const THEMES = [
  {
    id: 'mono', name: '小祁·极简',
    bgColor: '#ffffff',
    bgImage: 'linear-gradient(180deg,#ffffff 0%,#fafafa 100%)',
    card: '#ffffff', border: 'rgba(0,0,0,0.07)',
    cardGlow: 'none',
    text1: '#1c1c1e', text2: '#8a8a8e', text3: '#bcbcc2', acc: '#1c1c1e',
    shadow: '0 2px 14px rgba(0,0,0,0.05)', blur: '0px', radius: 16,
    font: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans SC', sans-serif",
    navIcons: ['◗', '◍', '◇'],
  },
  {
    id: 'sunset', name: '水彩晕染',
    bgColor: '#fdf8f4',
    bgImage: 'radial-gradient(ellipse at 15% 25%, rgba(255,210,180,0.55) 0%, transparent 55%), radial-gradient(ellipse at 85% 75%, rgba(190,210,255,0.45) 0%, transparent 55%), radial-gradient(ellipse at 50% 50%, rgba(255,230,240,0.4) 0%, transparent 65%)',
    card: 'rgba(255,255,255,0.18)', border: 'rgba(255,255,255,0.35)',
    text1: '#4a3c34', text2: '#7a6858', text3: '#b09880', acc: '#d4926a',
    shadow: '0 6px 28px rgba(200,130,80,0.08)', blur: '22px', radius: 20,
    font: "'Georgia','Noto Serif SC',serif",
    navIcons: ['✦', '❋', '◈'],
  },
  {
    id: 'glass', name: '极光磨砂',
    bgColor: '#cfd4dc',
    bgImage: 'radial-gradient(ellipse at 20% 15%, rgba(220,210,235,0.8) 0%, transparent 55%), radial-gradient(ellipse at 80% 85%, rgba(200,220,240,0.7) 0%, transparent 55%), radial-gradient(ellipse at 55% 45%, rgba(240,235,250,0.6) 0%, transparent 60%)',
    card: 'rgba(255,255,255,0.15)', border: 'rgba(255,255,255,0.3)',
    cardGlow: 'inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -1px 0 rgba(255,255,255,0.08)',
    text1: '#2e2c30', text2: '#5a5860', text3: '#8e8c96', acc: '#7a88c8',
    shadow: '0 8px 32px rgba(80,80,140,0.10), inset 0 1px 0 rgba(255,255,255,0.6)', blur: '36px', radius: 22,
    font: "'Helvetica Neue',Helvetica,Arial,sans-serif",
    navIcons: ['⌂', '◎', '⊞'],
    isGlass: true,
  },
  // ── 浅色 ──
  {
    id: 'strawberrymilk', name: '草莓牛奶',
    bgColor: '#FFF5F7',
    bgImage: 'radial-gradient(ellipse at 20% 18%, rgba(255,214,224,0.7) 0%, transparent 55%), radial-gradient(ellipse at 82% 80%, rgba(255,236,210,0.55) 0%, transparent 55%), linear-gradient(180deg,#FFF5F7 0%,#FCE7EC 100%)',
    card: 'rgba(255,255,255,0.62)', border: 'rgba(160,112,128,0.14)',
    cardGlow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
    text1: '#A07080', text2: '#C29AA6', text3: '#D6BAC4', acc: '#FF8FAB',
    shadow: '0 8px 28px rgba(255,143,171,0.12)', blur: '14px', radius: 20,
    font: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans SC', sans-serif",
    navIcons: ['❤', '✿', '◌'],
  },
  {
    id: 'pixelheart', name: '像素心',
    bgColor: '#FFF0F5',
    bgImage: 'radial-gradient(ellipse at 18% 16%, rgba(248,200,216,0.6) 0%, transparent 52%), radial-gradient(ellipse at 84% 82%, rgba(212,232,240,0.55) 0%, transparent 52%), linear-gradient(180deg,#FFF0F5 0%,#FAE2EC 100%)',
    card: 'rgba(255,255,255,0.66)', border: 'rgba(144,120,136,0.16)',
    cardGlow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
    text1: '#907888', text2: '#B29AA8', text3: '#CCBAC6', acc: '#EBA0B8',
    shadow: '0 6px 22px rgba(235,160,184,0.14)', blur: '12px', radius: 16,
    font: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans SC', sans-serif",
    navIcons: ['♥', '▣', '✦'],
    isPixel: true,
  },
  {
    id: 'ribbonbow', name: '蝴蝶结',
    bgColor: '#FFFAFB',
    bgImage: 'radial-gradient(ellipse at 22% 16%, rgba(245,208,216,0.55) 0%, transparent 54%), radial-gradient(ellipse at 80% 84%, rgba(255,240,224,0.5) 0%, transparent 54%), linear-gradient(180deg,#FFFAFB 0%,#FBEEF1 100%)',
    card: 'rgba(255,255,255,0.6)', border: 'rgba(154,128,136,0.14)',
    cardGlow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
    text1: '#9A8088', text2: '#BBA2AA', text3: '#D2C2C8', acc: '#E8B0C0',
    shadow: '0 8px 26px rgba(232,176,192,0.12)', blur: '14px', radius: 20,
    font: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans SC', sans-serif",
    navIcons: ['❀', '✿', '◇'],
  },
  {
    id: 'antiquelace', name: '蕾丝',
    bgColor: '#FEFDFB',
    bgImage: 'radial-gradient(ellipse at 20% 18%, rgba(245,242,238,0.7) 0%, transparent 56%), radial-gradient(ellipse at 82% 82%, rgba(201,160,168,0.18) 0%, transparent 56%), linear-gradient(180deg,#FEFDFB 0%,#F6F2EE 100%)',
    card: 'rgba(255,255,255,0.58)', border: 'rgba(232,228,222,0.9)',
    cardGlow: 'inset 0 1px 0 rgba(255,255,255,0.75)',
    text1: '#8A8480', text2: '#AFA8A2', text3: '#D5CFC8', acc: '#C9A0A8',
    shadow: '0 8px 30px rgba(138,132,128,0.08)', blur: '16px', radius: 18,
    font: "'Georgia','Noto Serif SC',serif",
    navIcons: ['❦', '✿', '◇'],
  },
  {
    id: 'frost', name: '霜花',
    bgColor: '#FAFCFF',
    bgImage: 'radial-gradient(ellipse at 18% 16%, rgba(240,244,250,0.8) 0%, transparent 55%), radial-gradient(ellipse at 84% 84%, rgba(152,181,216,0.28) 0%, transparent 55%), linear-gradient(180deg,#FAFCFF 0%,#EFF3FA 100%)',
    card: 'rgba(255,255,255,0.6)', border: 'rgba(224,230,240,0.9)',
    cardGlow: 'inset 0 1px 0 rgba(255,255,255,0.75)',
    text1: '#686E7A', text2: '#9098A4', text3: '#D0D8E5', acc: '#98B5D8',
    shadow: '0 8px 28px rgba(104,110,122,0.08)', blur: '16px', radius: 18,
    font: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans SC', sans-serif",
    navIcons: ['❄', '◌', '◇'],
  },
  {
    id: 'pearl', name: '珍珠',
    bgColor: '#FDFCFE',
    bgImage: 'radial-gradient(ellipse at 20% 16%, rgba(245,243,247,0.75) 0%, transparent 55%), radial-gradient(ellipse at 82% 82%, rgba(181,165,213,0.22) 0%, transparent 55%), linear-gradient(180deg,#FDFCFE 0%,#F4F1F7 100%)',
    card: 'rgba(255,255,255,0.58)', border: 'rgba(236,234,240,0.9)',
    cardGlow: 'inset 0 1px 0 rgba(255,255,255,0.78)',
    text1: '#78737E', text2: '#A29DA8', text3: '#DFDBE5', acc: '#B5A5D5',
    shadow: '0 8px 28px rgba(120,115,126,0.08)', blur: '16px', radius: 20,
    font: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans SC', sans-serif",
    navIcons: ['◍', '✦', '◇'],
  },
  {
    id: 'angelblue', name: '冰蓝天使',
    bgColor: '#F4F8FC',
    bgImage: 'radial-gradient(ellipse at 18% 16%, rgba(222,234,245,0.8) 0%, transparent 55%), radial-gradient(ellipse at 84% 84%, rgba(120,158,200,0.25) 0%, transparent 55%), linear-gradient(180deg,#F4F8FC 0%,#E6EFF7 100%)',
    card: 'rgba(255,255,255,0.6)', border: 'rgba(197,214,236,0.85)',
    cardGlow: 'inset 0 1px 0 rgba(255,255,255,0.75)',
    text1: '#586878', text2: '#8696A6', text3: '#C5D6EC', acc: '#789EC8',
    shadow: '0 8px 28px rgba(88,104,120,0.08)', blur: '16px', radius: 20,
    font: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans SC', sans-serif",
    navIcons: ['☁', '✦', '◇'],
  },
  {
    id: 'lavenderdream', name: '薰衣草梦',
    bgColor: '#F7F4FC',
    bgImage: 'radial-gradient(ellipse at 20% 16%, rgba(235,227,245,0.8) 0%, transparent 55%), radial-gradient(ellipse at 82% 84%, rgba(150,133,192,0.25) 0%, transparent 55%), linear-gradient(180deg,#F7F4FC 0%,#EDE6F6 100%)',
    card: 'rgba(255,255,255,0.6)', border: 'rgba(213,202,232,0.85)',
    cardGlow: 'inset 0 1px 0 rgba(255,255,255,0.75)',
    text1: '#5C5470', text2: '#8A839C', text3: '#D5CAE8', acc: '#9685C0',
    shadow: '0 8px 28px rgba(92,84,112,0.08)', blur: '16px', radius: 20,
    font: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans SC', sans-serif",
    navIcons: ['✿', '❋', '◇'],
  },
  {
    id: 'babyangel', name: '粉蓝',
    bgColor: '#F6F9FE',
    bgImage: 'radial-gradient(ellipse at 18% 16%, rgba(226,236,248,0.8) 0%, transparent 54%), radial-gradient(ellipse at 84% 82%, rgba(240,228,237,0.6) 0%, transparent 54%), linear-gradient(180deg,#F6F9FE 0%,#EAF0F9 100%)',
    card: 'rgba(255,255,255,0.6)', border: 'rgba(200,216,236,0.82)',
    cardGlow: 'inset 0 1px 0 rgba(255,255,255,0.75)',
    text1: '#686578', text2: '#9692A2', text3: '#CBD6E5', acc: '#A5BED8',
    shadow: '0 8px 28px rgba(104,101,120,0.08)', blur: '16px', radius: 20,
    font: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans SC', sans-serif",
    navIcons: ['☁', '♡', '◇'],
  },
  {
    id: 'icyviolet', name: '冰紫',
    bgColor: '#F4F4FC',
    bgImage: 'radial-gradient(ellipse at 20% 16%, rgba(230,227,245,0.8) 0%, transparent 55%), radial-gradient(ellipse at 82% 84%, rgba(165,149,200,0.26) 0%, transparent 55%), linear-gradient(180deg,#F4F4FC 0%,#E8E6F6 100%)',
    card: 'rgba(255,255,255,0.6)', border: 'rgba(206,202,232,0.85)',
    cardGlow: 'inset 0 1px 0 rgba(255,255,255,0.75)',
    text1: '#484660', text2: '#7A7894', text3: '#CECAE8', acc: '#A595C8',
    shadow: '0 8px 28px rgba(72,70,96,0.08)', blur: '16px', radius: 20,
    font: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans SC', sans-serif",
    navIcons: ['❉', '✦', '◇'],
  },
  {
    id: 'bluelilac', name: '蓝丁香',
    bgColor: '#F4F6FC',
    bgImage: 'radial-gradient(ellipse at 18% 16%, rgba(224,230,245,0.8) 0%, transparent 55%), radial-gradient(ellipse at 84% 84%, rgba(149,165,208,0.26) 0%, transparent 55%), linear-gradient(180deg,#F4F6FC 0%,#E7ECF7 100%)',
    card: 'rgba(255,255,255,0.6)', border: 'rgba(200,210,234,0.85)',
    cardGlow: 'inset 0 1px 0 rgba(255,255,255,0.75)',
    text1: '#4E5368', text2: '#7C849A', text3: '#C8D2EA', acc: '#95A5D0',
    shadow: '0 8px 28px rgba(78,83,104,0.08)', blur: '16px', radius: 20,
    font: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans SC', sans-serif",
    navIcons: ['✿', '❋', '◇'],
  },
  {
    id: 'ethereal', name: '空灵',
    bgColor: '#F8FAFF',
    bgImage: 'radial-gradient(ellipse at 16% 14%, rgba(221,212,240,0.6) 0%, transparent 50%), radial-gradient(ellipse at 84% 22%, rgba(212,240,230,0.55) 0%, transparent 50%), radial-gradient(ellipse at 60% 86%, rgba(240,214,230,0.5) 0%, transparent 54%), linear-gradient(180deg,#F8FAFF 0%,#E9F0F8 100%)',
    card: 'rgba(255,255,255,0.55)', border: 'rgba(228,236,248,0.85)',
    cardGlow: 'inset 0 1px 0 rgba(255,255,255,0.78)',
    text1: '#8585A0', text2: '#A8A8BC', text3: '#CCCCDC', acc: '#9A8FD0',
    shadow: '0 8px 30px rgba(133,133,160,0.08)', blur: '18px', radius: 20,
    font: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans SC', sans-serif",
    navIcons: ['✦', '❋', '◇'],
  },
  {
    id: 'milktea', name: '奶茶',
    bgColor: '#F5F0EA',
    bgImage: 'radial-gradient(ellipse at 20% 16%, rgba(232,221,208,0.7) 0%, transparent 55%), radial-gradient(ellipse at 82% 84%, rgba(160,136,104,0.22) 0%, transparent 55%), linear-gradient(180deg,#F5F0EA 0%,#EBE2D7 100%)',
    card: 'rgba(255,255,255,0.5)', border: 'rgba(200,184,160,0.4)',
    cardGlow: 'inset 0 1px 0 rgba(255,255,255,0.6)',
    text1: '#4A3C30', text2: '#897764', text3: '#C8B8A0', acc: '#A08868',
    shadow: '0 8px 28px rgba(74,60,48,0.08)', blur: '14px', radius: 18,
    font: "'Georgia','Noto Serif SC',serif",
    navIcons: ['◗', '❦', '◇'],
  },
  {
    id: 'sakuraash', name: '樱花灰',
    bgColor: '#F5F2F4',
    bgImage: 'radial-gradient(ellipse at 20% 16%, rgba(234,228,231,0.75) 0%, transparent 55%), radial-gradient(ellipse at 82% 84%, rgba(200,160,168,0.22) 0%, transparent 55%), linear-gradient(180deg,#F5F2F4 0%,#EBE5E8 100%)',
    card: 'rgba(255,255,255,0.55)', border: 'rgba(216,208,212,0.85)',
    cardGlow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
    text1: '#585058', text2: '#8E8088', text3: '#D8D0D4', acc: '#C8A0A8',
    shadow: '0 8px 28px rgba(88,80,88,0.08)', blur: '14px', radius: 18,
    font: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans SC', sans-serif",
    navIcons: ['✿', '❀', '◇'],
  },
  {
    id: 'desertdusk', name: '沙漠黄昏',
    bgColor: '#F5EDE0',
    bgImage: 'radial-gradient(ellipse at 20% 16%, rgba(232,216,192,0.7) 0%, transparent 55%), radial-gradient(ellipse at 82% 84%, rgba(216,136,64,0.3) 0%, transparent 55%), linear-gradient(180deg,#F5EDE0 0%,#EFE1CC 100%)',
    card: 'rgba(255,255,255,0.46)', border: 'rgba(200,176,144,0.4)',
    cardGlow: 'inset 0 1px 0 rgba(255,255,255,0.6)',
    text1: '#3A3028', text2: '#83685C', text3: '#C8B090', acc: '#D88840',
    shadow: '0 8px 28px rgba(58,48,40,0.08)', blur: '14px', radius: 18,
    font: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans SC', sans-serif",
    navIcons: ['☀', '❋', '◇'],
  },
  {
    id: 'nordic', name: '北欧木',
    bgColor: '#F8F6F2',
    bgImage: 'radial-gradient(ellipse at 20% 16%, rgba(235,230,222,0.7) 0%, transparent 55%), radial-gradient(ellipse at 82% 84%, rgba(104,136,160,0.2) 0%, transparent 55%), linear-gradient(180deg,#F8F6F2 0%,#EEEAE2 100%)',
    card: 'rgba(255,255,255,0.5)', border: 'rgba(204,197,184,0.55)',
    cardGlow: 'inset 0 1px 0 rgba(255,255,255,0.6)',
    text1: '#383838', text2: '#828078', text3: '#CCC5B8', acc: '#6888A0',
    shadow: '0 8px 28px rgba(56,56,56,0.07)', blur: '14px', radius: 18,
    font: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans SC', sans-serif",
    navIcons: ['⌂', '❋', '◇'],
  },
  // ── 暗色 ──
  {
    id: 'softgothic', name: '软哥特',
    bgColor: '#17161C',
    bgImage: 'radial-gradient(ellipse at 26% 18%, rgba(139,48,64,0.22) 0%, transparent 54%), radial-gradient(ellipse at 80% 82%, rgba(176,173,184,0.08) 0%, transparent 56%), linear-gradient(180deg,#1E1D24 0%,#17161C 60%,#121118 100%)',
    card: 'rgba(35,34,42,0.7)', border: 'rgba(176,173,184,0.14)',
    cardGlow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
    text1: '#E0DEE5', text2: '#A8A4B0', text3: '#3A3842', acc: '#8B3040',
    shadow: '0 14px 44px rgba(0,0,0,0.45)', blur: '16px', radius: 18,
    font: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans SC', sans-serif",
    navIcons: ['❦', '✦', '◇'],
    isDark: true,
  },
  {
    id: 'darkacademia', name: '暗色学院',
    bgColor: '#1A1C16',
    bgImage: 'radial-gradient(ellipse at 26% 18%, rgba(139,115,64,0.24) 0%, transparent 54%), radial-gradient(ellipse at 80% 82%, rgba(58,74,56,0.4) 0%, transparent 56%), linear-gradient(180deg,#22241C 0%,#1A1C16 60%,#141610 100%)',
    card: 'rgba(42,40,32,0.7)', border: 'rgba(139,115,64,0.24)',
    cardGlow: 'inset 0 0 0 1px rgba(139,115,64,0.16)',
    text1: '#E0D8C8', text2: '#A89C84', text3: '#4A4538', acc: '#8B7340',
    shadow: '0 14px 44px rgba(0,0,0,0.5)', blur: '14px', radius: 16,
    font: "'Songti SC','Noto Serif SC',Georgia,serif",
    navIcons: ['冊', '✦', '◇'],
    isDark: true, isLit: true,
  },
  {
    id: 'twilight', name: '薄暮',
    bgColor: '#18122A',
    bgImage: 'radial-gradient(ellipse at 26% 18%, rgba(200,112,144,0.24) 0%, transparent 54%), radial-gradient(ellipse at 80% 82%, rgba(232,168,112,0.2) 0%, transparent 56%), linear-gradient(180deg,#211833 0%,#18122A 60%,#120D22 100%)',
    card: 'rgba(40,30,58,0.7)', border: 'rgba(200,112,144,0.2)',
    cardGlow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
    text1: '#E8D8E2', text2: '#B49EAC', text3: '#483058', acc: '#C87090',
    shadow: '0 14px 44px rgba(0,0,0,0.45)', blur: '16px', radius: 20,
    font: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans SC', sans-serif",
    navIcons: ['☾', '✦', '◇'],
    isDark: true,
  },
  {
    id: 'neonnoir', name: '赛博霓虹',
    bgColor: '#0A0A14',
    bgImage: 'radial-gradient(ellipse at 26% 18%, rgba(255,46,136,0.18) 0%, transparent 52%), radial-gradient(ellipse at 80% 30%, rgba(0,229,255,0.16) 0%, transparent 50%), radial-gradient(ellipse at 50% 86%, rgba(255,46,136,0.1) 0%, transparent 48%), linear-gradient(180deg,#10101F 0%,#0A0A14 60%,#060610 100%)',
    card: 'rgba(20,20,42,0.68)', border: 'rgba(0,229,255,0.18)',
    cardGlow: 'inset 0 0 0 1px rgba(255,46,136,0.14), inset 0 1px 0 rgba(0,229,255,0.1)',
    text1: '#E0E0F5', text2: '#9090B0', text3: '#1E1E38', acc: '#FF2E88',
    shadow: '0 8px 30px rgba(255,46,136,0.18), 0 2px 14px rgba(0,0,0,0.55)', blur: '16px', radius: 16,
    font: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans SC', sans-serif",
    navIcons: ['◐', '✦', '◇'],
    isDark: true,
  },
  {
    id: 'abyss', name: '深海',
    bgColor: '#080E18',
    bgImage: 'radial-gradient(ellipse at 26% 18%, rgba(8,184,168,0.2) 0%, transparent 54%), radial-gradient(ellipse at 80% 82%, rgba(30,88,136,0.26) 0%, transparent 56%), linear-gradient(180deg,#0C1620 0%,#080E18 60%,#050A12 100%)',
    card: 'rgba(14,24,32,0.7)', border: 'rgba(8,184,168,0.18)',
    cardGlow: 'inset 0 0 0 1px rgba(8,184,168,0.12)',
    text1: '#C0D8E0', text2: '#7E9AA4', text3: '#162830', acc: '#08B8A8',
    shadow: '0 14px 44px rgba(0,0,0,0.5)', blur: '16px', radius: 18,
    font: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans SC', sans-serif",
    navIcons: ['◉', '✦', '◇'],
    isDark: true,
  },
  {
    id: 'midnightgarden', name: '午夜花园',
    bgColor: '#121018',
    bgImage: 'radial-gradient(ellipse at 26% 18%, rgba(200,104,144,0.22) 0%, transparent 54%), radial-gradient(ellipse at 80% 82%, rgba(90,120,88,0.24) 0%, transparent 56%), linear-gradient(180deg,#1A1620 0%,#121018 60%,#0D0B12 100%)',
    card: 'rgba(30,24,32,0.7)', border: 'rgba(200,104,144,0.18)',
    cardGlow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
    text1: '#E8DDE2', text2: '#AE9DA4', text3: '#382830', acc: '#C86890',
    shadow: '0 14px 44px rgba(0,0,0,0.5)', blur: '16px', radius: 20,
    font: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans SC', sans-serif",
    navIcons: ['❀', '✦', '◇'],
    isDark: true,
  },
  {
    id: 'gemstone', name: '宝石',
    bgColor: '#0C0C16',
    bgImage: 'radial-gradient(ellipse at 26% 18%, rgba(46,139,87,0.22) 0%, transparent 54%), radial-gradient(ellipse at 80% 82%, rgba(139,40,80,0.26) 0%, transparent 56%), linear-gradient(180deg,#141420 0%,#0C0C16 60%,#080810 100%)',
    card: 'rgba(22,22,34,0.7)', border: 'rgba(46,139,87,0.2)',
    cardGlow: 'inset 0 0 0 1px rgba(139,40,80,0.16)',
    text1: '#E8E0D8', text2: '#A89E94', text3: '#282840', acc: '#2E8B57',
    shadow: '0 14px 44px rgba(0,0,0,0.5)', blur: '16px', radius: 18,
    font: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans SC', sans-serif",
    navIcons: ['◈', '✦', '◇'],
    isDark: true,
  },
];
// 暗色学院风主题 + 强制使用它的「文学沉淀区」屏幕
const LIT_THEME = THEMES.find(th => th.id === 'darkacademia');
const LIT_SCREENS = new Set(['nest', 'promises', 'dreams']);

const MOODS = [
  { id: 'happy', label: '开心', svg: <svg width="26" height="26" viewBox="0 0 54 54" fill="none"><path d="M4 28 Q3 12 16 5 Q30 -1 43 8 Q54 17 51 32 Q49 46 36 51 Q21 56 11 46 Q3 38 4 28Z" fill="#F2C9A8"/><circle cx="18" cy="22" r="2.8" fill="#1a1a1a"/><circle cx="33" cy="21" r="3.1" fill="#1a1a1a"/><path d="M13 33 Q20 42 33 37" stroke="#1a1a1a" strokeWidth="2.8" strokeLinecap="round" fill="none"/><path d="M33 37 Q38 34 37 30" stroke="#1a1a1a" strokeWidth="2.8" strokeLinecap="round" fill="none"/></svg> },
  { id: 'content', label: '满足', svg: <svg width="26" height="26" viewBox="0 0 54 54" fill="none"><path d="M6 26 Q5 10 19 4 Q33 -1 44 9 Q55 19 50 34 Q45 48 31 52 Q17 56 9 45 Q3 36 6 26Z" fill="#F5D03A"/><circle cx="19" cy="24" r="2.6" fill="#1a1a1a"/><circle cx="35" cy="23" r="2.9" fill="#1a1a1a"/><path d="M22 34 Q27 39 33 34" stroke="#1a1a1a" strokeWidth="2.8" strokeLinecap="round" fill="none"/></svg> },
  { id: 'annoyed', label: '烦透了', svg: <svg width="26" height="26" viewBox="0 0 54 54" fill="none"><path d="M5 20 Q7 4 22 3 Q38 2 47 13 Q56 25 50 40 Q44 54 28 53 Q12 53 6 40 Q2 30 5 20Z" fill="#9BAA6A"/><path d="M14 17 L20 24 M20 17 L14 24" stroke="#1a1a1a" strokeWidth="3" strokeLinecap="round"/><path d="M31 16 L38 23 M38 16 L31 23" stroke="#1a1a1a" strokeWidth="3" strokeLinecap="round"/><path d="M13 36 Q17 33 21 36 Q25 39 29 35 Q33 32 38 36" stroke="#1a1a1a" strokeWidth="2.8" strokeLinecap="round" fill="none"/></svg> },
  { id: 'blank', label: '呆住了', svg: <svg width="26" height="26" viewBox="0 0 54 54" fill="none"><path d="M5 25 Q4 9 18 4 Q33 -1 44 10 Q55 21 51 37 Q47 51 32 53 Q16 56 8 43 Q3 33 5 25Z" fill="#6FC4B0"/><rect x="9" y="18" width="15" height="15" rx="6" stroke="#1a1a1a" strokeWidth="2.8" fill="none" transform="rotate(-3 16 25)"/><rect x="28" y="17" width="15" height="15" rx="6" stroke="#1a1a1a" strokeWidth="2.8" fill="none" transform="rotate(4 35 24)"/><circle cx="16.5" cy="25" r="2.8" fill="#1a1a1a"/><circle cx="35" cy="24" r="2.8" fill="#1a1a1a"/><line x1="17" y1="40" x2="29" y2="41" stroke="#1a1a1a" strokeWidth="3" strokeLinecap="round"/></svg> },
  { id: 'sad', label: '难过', svg: <svg width="26" height="26" viewBox="0 0 54 54" fill="none"><path d="M5 26 Q3 10 17 4 Q32 -2 44 9 Q55 20 51 36 Q47 50 32 53 Q15 56 8 43 Q3 33 5 26Z" fill="#8BB8D8"/><circle cx="19" cy="23" r="3.5" fill="#1a1a1a"/><circle cx="34" cy="22" r="2.8" fill="#1a1a1a"/><path d="M17 38 Q25 33 36 37" stroke="#1a1a1a" strokeWidth="2.8" strokeLinecap="round" fill="none"/></svg> },
  { id: 'sleepy', label: '困困', svg: <svg width="26" height="26" viewBox="0 0 54 54" fill="none"><path d="M7 27 Q6 11 20 5 Q35 -1 46 11 Q56 23 51 38 Q46 53 30 54 Q14 56 8 43 Q4 33 7 27Z" fill="#F0A898"/><path d="M13 22 Q18 19 23 22" stroke="#1a1a1a" strokeWidth="3" strokeLinecap="round" fill="none"/><ellipse cx="18" cy="24" rx="4" ry="2.2" fill="#1a1a1a"/><path d="M29 21 Q34 18 40 21" stroke="#1a1a1a" strokeWidth="3" strokeLinecap="round" fill="none"/><ellipse cx="34" cy="23" rx="3.5" ry="2" fill="#1a1a1a"/><ellipse cx="24" cy="36" rx="3.5" ry="4" stroke="#1a1a1a" strokeWidth="2.4" fill="none"/></svg> },
  { id: 'anxious', label: '焦虑', svg: <svg width="26" height="26" viewBox="0 0 54 54" fill="none"><path d="M6 24 Q5 8 20 3 Q36 -2 47 10 Q57 22 52 37 Q47 52 31 54 Q14 56 7 43 Q2 33 6 24Z" fill="#E8C170"/><circle cx="18" cy="22" r="3" fill="#1a1a1a"/><circle cx="35" cy="21" r="3" fill="#1a1a1a"/><path d="M16 36 Q21 32 26 36 Q31 40 37 35" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round" fill="none"/><path d="M10 15 L22 12" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round"/><path d="M32 11 L44 14" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round"/></svg> },
  { id: 'excited', label: '兴奋', svg: <svg width="26" height="26" viewBox="0 0 54 54" fill="none"><path d="M5 25 Q4 9 18 4 Q33 -1 44 10 Q55 21 51 37 Q47 51 32 53 Q16 56 8 43 Q3 33 5 25Z" fill="#FFB347"/><circle cx="17" cy="20" r="3.2" fill="#1a1a1a"/><circle cx="36" cy="19" r="3.2" fill="#1a1a1a"/><path d="M16 32 Q26 45 38 32" stroke="#1a1a1a" strokeWidth="2.8" strokeLinecap="round" fill="none"/><path d="M8 10 L14 6 M40 5 L46 10" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round"/></svg> },
  { id: 'lonely', label: '孤独', svg: <svg width="26" height="26" viewBox="0 0 54 54" fill="none"><path d="M6 26 Q4 10 18 4 Q33 -2 44 9 Q55 20 51 36 Q47 50 32 53 Q15 56 8 43 Q3 33 6 26Z" fill="#A8B4C8"/><circle cx="19" cy="24" r="2.5" fill="#1a1a1a"/><circle cx="34" cy="23" r="2.5" fill="#1a1a1a"/><path d="M20 38 Q27 35 34 38" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round" fill="none"/><path d="M10 37 L8 44" stroke="#8BB8D8" strokeWidth="2" strokeLinecap="round"/></svg> },
  { id: 'loved', label: '被爱', svg: <svg width="26" height="26" viewBox="0 0 54 54" fill="none"><path d="M5 25 Q4 9 18 4 Q33 -1 44 10 Q55 21 51 37 Q47 51 32 53 Q16 56 8 43 Q3 33 5 25Z" fill="#F2B5C8"/><path d="M14 22 Q18 18 22 22" stroke="#1a1a1a" strokeWidth="2.8" strokeLinecap="round" fill="none"/><path d="M30 21 Q34 17 38 21" stroke="#1a1a1a" strokeWidth="2.8" strokeLinecap="round" fill="none"/><path d="M20 34 Q26 40 32 34" stroke="#1a1a1a" strokeWidth="2.8" strokeLinecap="round" fill="none"/><path d="M22 8 Q27 2 32 8 Q37 14 27 20 Q17 14 22 8Z" fill="#e74c6f" opacity="0.6"/></svg> },
];

const WEATHER_CODES = { 0:'晴',1:'基本晴',2:'多云',3:'阴',45:'雾',48:'雾',51:'细雨',53:'毛毛雨',55:'大毛毛雨',61:'小雨',63:'中雨',65:'大雨',71:'小雪',73:'中雪',75:'大雪',80:'阵雨',81:'中阵雨',82:'大阵雨',95:'雷雨',96:'雷阵雨',99:'强雷雨' };

// ── 工具函数 ──
const STORAGE_KEY = 'companion_sessions';
function getSavedSessions() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; } }
function saveSession(charId, sessionId) { const s = getSavedSessions(); s[charId] = sessionId; localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }

// 用户自定义的角色声音设置（声音设置页写入；playTTS 读取并作为 /tts 覆盖项）
function getVoicePref(charId) {
  try { const all = JSON.parse(localStorage.getItem('companion_voice_prefs') || '{}'); return all[charId] || {}; } catch { return {}; }
}

// 判断是否为内部系统级 Prompt，避免污染用户的聊天记录
function isHiddenSystemPrompt(text) {
  if (!text) return false;
  const t = String(text);
  // 用户真实内容里的方括号标记（图片/语音）不算隐藏系统提示——否则刷新后会被 filterHistory 误删（图片/语音消息消失）
  if (t.startsWith('[附图') || t.startsWith('[语音消息') || t.startsWith('[img:') || t.startsWith('[引用')) return false;
  const sysKeywords = ['[系统', '[隐藏', '碎碎念', '状态词', '请用你自己的口吻', '小满今天的日记', '群聊主动搭话', '用3-5个字说', '请任意一个男生'];
  return sysKeywords.some(k => t.includes(k)) || t.startsWith('[');
}
// 清洗历史记录
function filterHistory(msgs) {
  return (msgs || []).filter(m => !(m.role === 'user' && isHiddenSystemPrompt(m.content)));
}

// 独立静默通讯通道 (专用于树洞、状态等非对话框任务)
const fetchSystemChat = async (charId, prompt, sessionId) => {
  try {
    const char = CHARACTERS.find(c => c.id === charId) || CHARACTERS[0];
    const res = await fetch(`${BACKEND}/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: prompt, session_id: sessionId, character_id: charId, model: char.models[0].value, max_tokens: 4000 })
    });
    const reader = res.body.getReader(), decoder = new TextDecoder('utf-8');
    let full = '';
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      const lines = decoder.decode(value, { stream: true }).split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try { const p = JSON.parse(line.slice(6)); if (p.text) full += p.text; } catch {}
        }
      }
    }
    return splitThinkingReply(full).reply || full;
  } catch { return null; }
};

// 情绪标签 pill：[心情:a|b|c]（也认 情绪/标签）→ 取出 tags + 从正文移除
function splitMoodTags(raw) {
  const tags = [];
  const rest = String(raw || '').replace(/\[(?:心情|情绪|标签)[:：]([^\]]*)\]/g, (_m, body) => { (body || '').split(/[|｜/、，,]/).forEach(s => { s = s.trim().replace(/^#/, ''); if (s) tags.push(s); }); return ''; });
  return { tags: tags.slice(0, 5), rest };
}
// 点歌标记：沈屿在正文里写 [music:歌名 歌手] → 抽出查询词，正文里剥掉这段
function splitMusicTags(raw) {
  let q = null;
  const rest = String(raw || '').replace(/\[music[:：]\s*([^\]]+)\]/i, (_m, body) => { if (!q) q = String(body || '').trim(); return ''; });
  return { q, rest };
}
const MOOD_COLORS = ['#b06a86', '#7d9a8e', '#c08a5a', '#8a8ab0', '#a87da0', '#5b8a9a'];
function MoodPills({ tags, t }) {
  if (!tags || !tags.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignSelf: 'flex-start', maxWidth: '92%', margin: '1px 0 5px' }}>
      {tags.map((tag, i) => { const c = MOOD_COLORS[i % MOOD_COLORS.length]; return <span key={i} style={{ fontSize: 11, color: c, background: c + '1a', border: `0.5px solid ${c}55`, padding: '3px 10px', borderRadius: 999, fontFamily: 'inherit', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>#{tag}</span>; })}
    </div>
  );
}
// 思维链解析：thinking 单独提取，reply 只含 </thinking> 之后的正文
function splitThinkingReply(raw) {
  if (!raw) return { thinking: null, reply: '', thinkingOpen: false };
  raw = String(raw).replace(/\[分享[:：][^\]]*\]/g, '').replace(/\[设备[:：][^\]]*\]/g, '');   // 分享/设备标记不在气泡里显示
  raw = splitMusicTags(raw).rest;  // 点歌标记 [music:歌名 歌手] 不进气泡，单独渲染成歌卡
  raw = splitMoodTags(raw).rest;   // 情绪标签不进正文气泡，单独渲染成 pill
  const openIdx = raw.indexOf('<thinking>');
  const closeIdx = raw.indexOf('</thinking>');
  if (openIdx !== -1) {
    if (closeIdx !== -1 && closeIdx > openIdx) {
      const thinking = raw.slice(openIdx + 10, closeIdx);
      const after = raw.slice(closeIdx + 11).trim();
      return { thinking: thinking.trim(), reply: after, thinkingOpen: false };
    } else {
      // thinking still in progress — show nothing in bubble yet
      const thinking = raw.slice(openIdx + 10);
      return { thinking: thinking.trim(), reply: '', thinkingOpen: true };
    }
  }
  return { thinking: null, reply: raw.trim(), thinkingOpen: false };
}

// 沈屿主动发语音：assistant 在正文里写 [voice]（也认 [语音]，大小写不敏感）→ 在【第一个】标记处截断。
// 标记【之前】的文字 = before（渲染成普通文字气泡），标记【之后】的文字 = voice（渲染成一条语音条，点开用沈屿声线念）。
// [voice] 写在最开头 → before 为空，整条就是语音条（兼容旧的「整条转语音」行为）。
// 标记字面量本身绝不进正文/不进 TTS。只对 assistant 生效(用户自己的 [语音消息] 等 marker 不碰)。
const VOICE_MARKER_RE = /\[voice\]|\[语音\]/i;
function splitVoiceTag(raw) {
  const r = String(raw ?? '');
  const m = r.match(VOICE_MARKER_RE);
  if (!m) return { before: r, voice: '' };
  const idx = m.index;
  return { before: r.slice(0, idx), voice: r.slice(idx + m[0].length) };
}
// 历史/问候/重答等非流式路径统一用它构造消息字段:assistant 才检测并按 [voice] 截断→before 文字气泡 + voice 语音条。
function parseMsgFields(content, role) {
  const { thinking, reply, thinkingOpen } = splitThinkingReply(content);
  if (role === 'assistant') {
    const v = splitVoiceTag(reply);
    if (v.voice.trim()) {
      // before 去空白后非空 → reply 保留前半段文字气泡;否则整条是语音条(reply 留空)。
      return { thinking, reply: v.before.trim() ? v.before : '', thinkingOpen, voiceMode: true, voiceCapable: true, voiceTail: v.voice };
    }
    // 没有 [voice]:reply 即正文(把可能残留的标记字面量剥掉,空标记不算语音)。
    return { thinking, reply: v.before, thinkingOpen };
  }
  return { thinking, reply, thinkingOpen };
}

// Convert VAPID public key for push subscription
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

// ── 卡片组件 ──
function Card({ t, style, children, onClick, className }) {
  const base = {
    backgroundColor: t.card, backdropFilter: `blur(${t.blur || '12px'})`, WebkitBackdropFilter: `blur(${t.blur || '12px'})`,
    border: t.isPixel ? `2px solid ${t.border}` : `0.5px solid ${t.border}`, borderRadius: t.radius,
    boxShadow: t.isGlass ? (t.cardGlow + ', ' + t.shadow) : t.shadow, position: 'relative', transition: 'all 0.25s ease',
  };
  if (t.isCollage) {
    base.transform = `rotate(${Math.random() > 0.5 ? 0.3 : -0.3}deg)`;
    base.borderTop = `3px solid rgba(0,0,0,0.15)`;
  }
  return <div style={{ ...base, ...style }} onClick={onClick} className={className}>{children}</div>;
}

// ── Thinking 折叠 ──
// 思考链总结（仿官端）：给每段思考生成 ≤20 字诗意标题。全局缓存(localStorage) + 单并发队列(防历史刷屏打爆后端)。
const _thinkTitleCache = {};
try { Object.assign(_thinkTitleCache, JSON.parse(localStorage.getItem('xu_think_titles') || '{}')); } catch {}
const _thinkTitleSubs = new Set();
let _thinkQueue = [], _thinkBusy = false;
function _thinkKey(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; } return 't' + h; }
function _pumpThink() {
  if (_thinkBusy || !_thinkQueue.length) return;
  _thinkBusy = true;
  const { key, text } = _thinkQueue.shift();
  fetch(`${BACKEND}/think-summary`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
    .then(r => r.json()).then(d => {
      if (d && d.ok && d.title) {
        _thinkTitleCache[key] = d.title;
        try { localStorage.setItem('xu_think_titles', JSON.stringify(_thinkTitleCache)); } catch {}
        _thinkTitleSubs.forEach(fn => fn());
      }
    }).catch(() => {}).finally(() => { _thinkBusy = false; setTimeout(_pumpThink, 500); });
}
function useThinkTitle(thinking, ready) {
  const [, force] = useState(0);
  const key = thinking ? _thinkKey(thinking) : null;
  useEffect(() => {
    if (!ready || !thinking || thinking.length < 12 || !key) return;
    if (_thinkTitleCache[key]) return;
    const fn = () => force(n => n + 1); _thinkTitleSubs.add(fn);
    if (!_thinkQueue.some(q => q.key === key)) { _thinkQueue.push({ key, text: thinking }); _pumpThink(); }
    return () => _thinkTitleSubs.delete(fn);
  }, [key, ready]);
  return key ? _thinkTitleCache[key] : null;
}

function ThinkingPill({ thinking, thinkingOpen, loading, initialOpen, char, t }) {
  const thinkTitle = useThinkTitle(thinking, !!thinking && !thinkingOpen && !loading);
  const [open, setOpen] = useState(!!initialOpen);
  useEffect(() => { if (initialOpen) setOpen(true); }, [initialOpen]);
  if (!thinking && !thinkingOpen && !loading) return null;
  const tokenCount = thinking ? (thinking.length / 2.5) : 0;
  const tokenLabel = tokenCount > 1000 ? `${(tokenCount / 1000).toFixed(1)}K` : Math.round(tokenCount);
  const showBody = !loading && (open || thinkingOpen);
  return (
    <div style={{ alignSelf: 'flex-start', maxWidth: '90%', marginBottom: 4 }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10, color: t.text3,
        padding: '4px 10px',
        borderRadius: t.radius > 0 ? 12 : 0, border: `0.5px solid ${t.border}`,
        backgroundColor: 'rgba(255,255,255,0.15)', backdropFilter: `blur(${t.blur || '8px'})`,
        fontFamily: 'inherit', letterSpacing: '0.04em',
      }}>
        <span style={{ fontSize: 8 }}>{(thinkingOpen || loading) ? '◎' : '◉'}</span>
        <span style={{ fontStyle: 'italic' }}>{loading ? `${char.name} 正在想…` : thinkingOpen ? `${char.name} 正在思考…` : (thinkTitle || `${char.name}·碎碎念`)}</span>
        {!thinkingOpen && !loading && tokenCount > 10 && <span style={{ fontSize: 8, opacity: 0.4, marginLeft: 2 }}>↓ {tokenLabel}</span>}
        {/* 字数之后的常驻按钮：明确的展开/收起，不会消失 */}
        {!thinkingOpen && !loading && thinking && (
          <span onClick={() => setOpen(v => !v)} style={{
            fontSize: 9, marginLeft: 4, padding: '1px 8px', cursor: 'pointer',
            borderRadius: 999, border: `0.5px solid ${t.border}`, color: t.text2,
            backgroundColor: 'rgba(0,0,0,0.03)', letterSpacing: '0.05em', whiteSpace: 'nowrap',
          }}>{open ? '收起 ⌃' : '展开 ⌄'}</span>
        )}
      </div>
      {showBody && (
        <div style={{
          marginTop: 6, padding: '10px 12px', fontSize: 12.5, color: t.text3, lineHeight: 1.95, textAlign: 'left',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontStyle: 'italic', fontFamily: 'var(--serif)', letterSpacing: '0.02em',
          animation: 'fadeIn 0.3s ease', borderRadius: t.radius > 0 ? 10 : 0,
          backgroundColor: 'rgba(255,255,255,0.1)', border: `0.5px solid ${t.border}`,
          backdropFilter: `blur(${t.blur || '6px'})`,
        }}>
          {thinking}
          {thinkingOpen && <span style={{ display: 'inline-block', width: 1.5, height: '0.85em', backgroundColor: t.text3, marginLeft: 2, animation: 'cursorBlink 0.9s step-end infinite', verticalAlign: 'text-bottom', borderRadius: 1 }} />}
        </div>
      )}
    </div>
  );
}

// ── 微信多条气泡：一条一条发出（带打字间隔），历史消息则一次性展示 ──
function MultiBubble({ parts, animate, bubbleStyle, isLong, accent, onGrow, onTap }) {
  const [shown, setShown] = useState(animate ? 1 : parts.length);
  useEffect(() => {
    if (!animate || shown >= parts.length) return;
    const next = parts[shown] || '';
    const delay = Math.min(2200, 480 + next.length * 42);   // 越长的下一条，停顿越久，像真人打字
    const tm = setTimeout(() => { setShown(s => s + 1); onGrow && onGrow(); }, delay);
    return () => clearTimeout(tm);
  }, [shown, animate, parts.length]);
  const showTyping = animate && shown < parts.length;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 5, width: '100%' }}>
      {parts.slice(0, shown).map((p, k) => (
        <div key={k} onClick={onTap} style={{ ...bubbleStyle, cursor: onTap ? 'pointer' : bubbleStyle.cursor, animation: 'fadeIn 0.3s ease' }}><MessageBody content={p} isLong={isLong} /></div>
      ))}
      {showTyping && (
        <div style={{ ...bubbleStyle, padding: '12px 16px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {[0, 1, 2].map(d => <span key={d} style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: accent || '#999', opacity: 0.5, display: 'inline-block', animation: `cursorBlink 1s ${d * 0.18}s step-end infinite` }} />)}
        </div>
      )}
    </div>
  );
}

// + 面板的功能图标（微信式）
function PlusFeatIcon({ id, color = 'currentColor' }) {
  const p = { width: 26, height: 26, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (id) {
    case 'photo': return <svg {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="10" r="1.5" /><path d="M21 16l-5-5L5 19" /></svg>;
    case 'camera': return <svg {...p}><path d="M4 8h3l1.4-2h7.2L17 8h3v11H4z" /><circle cx="12" cy="12.5" r="3.2" /></svg>;
    case 'call': return <svg {...p}><path d="M5 5c0 8 6 14 14 14 1 0 1.6-.8 1.6-1.6l-3-2-2 1.4C12 15 9 12 7.2 9l1.4-2-2-3C5.8 4 5 4.4 5 5z" /></svg>;
    case 'loc': return <svg {...p}><path d="M12 21s7-5.5 7-11a7 7 0 0 0-14 0c0 5.5 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>;
    case 'redpacket': return <svg {...p}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M5 9c3 2.2 11 2.2 14 0" /><circle cx="12" cy="11" r="1.6" /></svg>;
    case 'gift': return <svg {...p}><rect x="4" y="9" width="16" height="11" rx="1.5" /><path d="M4 13h16M12 9v11" /><path d="M12 9C10.5 9 9 8.2 9 7s1.5-1.5 3 2zM12 9c1.5 0 3-.8 3-2s-1.5-1.5-3 2z" /></svg>;
    case 'transfer': return <svg {...p}><path d="M4 9h13l-3.2-3.2M20 15H7l3.2 3.2" /></svg>;
    case 'voicein': return <svg {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M6 11a6 6 0 0 0 12 0M12 17v3" /></svg>;
    default: return <svg {...p}><circle cx="12" cy="12" r="8" /></svg>;
  }
}

function MemoryPill({ memories, char, t }) {
  const [open, setOpen] = useState(false);
  if (!memories?.length) return null;
  const label = { fact: '事实', summary: '片段', insight: '洞察', diary: '日记', moment: '此刻' };
  return (
    <div style={{ alignSelf: 'flex-start', maxWidth: '90%', marginBottom: 4 }}>
      <div onClick={() => setOpen(v => !v)} style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10, color: char.accent,
        cursor: 'pointer', padding: '4px 10px', borderRadius: t.radius > 0 ? 12 : 0,
        border: `0.5px solid ${char.accent}40`, backgroundColor: `${char.accent}0c`,
        backdropFilter: `blur(${t.blur || '8px'})`, fontFamily: 'inherit', letterSpacing: '0.04em',
      }}>
        <span style={{ fontSize: 9 }}>🫧</span>
        <span style={{ fontStyle: 'italic' }}>想起了 {memories.length} 件事</span>
        <span style={{ fontSize: 9, opacity: 0.5 }}>›</span>
      </div>
      {open && (
        <div style={{
          marginTop: 6, padding: '8px 12px', borderRadius: t.radius > 0 ? 10 : 0,
          backgroundColor: `${char.accent}08`, border: `0.5px solid ${char.accent}30`,
          backdropFilter: `blur(${t.blur || '6px'})`, animation: 'fadeIn 0.3s ease',
        }}>
          {memories.map((m, i) => (
            <div key={i} style={{ fontSize: 11.5, color: t.text2, lineHeight: 1.75, marginBottom: i < memories.length - 1 ? 4 : 0, fontFamily: 'inherit' }}>
              <span style={{ fontSize: 8, color: char.accent, marginRight: 5, opacity: 0.7 }}>{label[m.type] || '记忆'}</span>{m.content}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 轻量富文本渲染（安全）──
// 先把整段 HTML 转义成纯文本（任何脚本/标签都失效），再只对转义后的文本套用白名单格式：
// 加粗 **x** / __x__ / <strong> / <b>；删除线 ~~x~~ / <del> / <s>；斜体 *x* / _x_ / <em> / <i>；换行 \n→<br>。
// 因为危险字符已转义，正则只会命中字面 *、_、~ 或被转义的 &lt;b&gt; 等，绝无 XSS。
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function richTextHtml(text) {
  let h = escapeHtml(text);
  // 1) 白名单标签：作者手打的 <strong>/<b>/<del>/<s>/<em>/<i>（转义后变成 &lt;strong&gt; 等）→ 还原成真标签
  h = h
    .replace(/&lt;(\/?)(strong|b)&gt;/gi, (_m, slash) => `<${slash}strong>`)
    .replace(/&lt;(\/?)(del|s)&gt;/gi, (_m, slash) => `<${slash}del>`)
    .replace(/&lt;(\/?)(em|i)&gt;/gi, (_m, slash) => `<${slash}em>`);
  // 2) Markdown 加粗（先于斜体，避免 ** 被当成两个 *）
  h = h.replace(/\*\*([^\n]+?)\*\*/g, '<strong>$1</strong>')
       .replace(/__([^\n]+?)__/g, '<strong>$1</strong>');
  // 3) 删除线
  h = h.replace(/~~([^\n]+?)~~/g, '<del>$1</del>');
  // 4) 斜体（单 * / 单 _；避免吃到单词内下划线，_ 用边界保护）
  h = h.replace(/\*([^\s*][^*\n]*?)\*/g, '<em>$1</em>')
       .replace(/(^|[\s(])_([^\s_][^_\n]*?)_(?=$|[\s).,!?;:])/g, '$1<em>$2</em>');
  // 5) 换行
  h = h.replace(/\n/g, '<br>');
  return h;
}
function RichText({ text, style }) {
  return <span style={style} dangerouslySetInnerHTML={{ __html: richTextHtml(text) }} />;
}

function MessageBody({ content, isLong }) {
  if (isLong) {
    // 段落之间不留空行：把任何连续换行（含夹空白）都压成单个换行
    const text = content.replace(/\n[ \t　]*\n+/g, '\n').replace(/\n{2,}/g, '\n').trim();
    // render images embedded in content
    const imgMatch = text.match(/(https?:\/\/\S+\.(?:jpg|jpeg|png|gif|webp)(?:\?\S*)?)/i);
    if (imgMatch) {
      const textOnly = text.replace(imgMatch[0], '').trim();
      return (
        <span style={{ display: 'block' }}>
          <img src={imgMatch[0]} alt="图片" style={{ maxWidth: '100%', borderRadius: 8, marginBottom: textOnly ? 10 : 0, display: 'block' }} />
          {textOnly && <RichText text={textOnly} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', display: 'block', fontFamily: 'inherit' }} />}
        </span>
      );
    }
    return <RichText text={text} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', display: 'block', fontFamily: 'inherit', textAlign: 'left' }} />;
  }
  // short mode: collapse newlines; render images too
  const imgMatch = content.match(/(https?:\/\/\S+\.(?:jpg|jpeg|png|gif|webp)(?:\?\S*)?)/i);
  if (imgMatch) {
    const textOnly = content.replace(imgMatch[0], '').replace(/\n+/g, ' ').trim();
    return (
      <span style={{ display: 'block' }}>
        <img src={imgMatch[0]} alt="图片" style={{ maxWidth: '100%', borderRadius: 8, marginBottom: textOnly ? 6 : 0, display: 'block' }} />
        {textOnly && <RichText text={textOnly} style={{ wordBreak: 'break-word', fontFamily: 'inherit' }} />}
      </span>
    );
  }
  const text = content.replace(/\n+/g, ' ').trim();
  return <RichText text={text} style={{ whiteSpace: 'normal', wordBreak: 'break-word', display: 'block', fontFamily: 'inherit', textAlign: 'left' }} />;
}

// ── 极简线条天气图标：跟随 open-meteo weathercode ──
function WeatherIcon({ code = 0, size = 34, color = 'currentColor' }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' };
  // 太阳（8 道光线）
  const Sun = ({ cx = 12, cy = 12, r = 3.6 }) => (
    <g><circle cx={cx} cy={cy} r={r} />{[0, 45, 90, 135, 180, 225, 270, 315].map(a => {
      const rad = a * Math.PI / 180, x1 = cx + (r + 1.7) * Math.cos(rad), y1 = cy + (r + 1.7) * Math.sin(rad), x2 = cx + (r + 3.6) * Math.cos(rad), y2 = cy + (r + 3.6) * Math.sin(rad);
      return <line key={a} x1={x1} y1={y1} x2={x2} y2={y2} />;
    })}</g>
  );
  const Cloud = ({ y = 0 }) => <path d={`M7 ${18 + y}h9.5a3.3 3.3 0 0 0 .3-6.57 4.8 4.8 0 0 0-9.16-1.03A3.4 3.4 0 0 0 7 ${18 + y}z`} />;
  const drops = (n) => <g>{Array.from({ length: n }, (_, i) => <line key={i} x1={9 + i * 3} y1={19.5} x2={8 + i * 3} y2={22} />)}</g>;
  const flakes = (n) => <g>{Array.from({ length: n }, (_, i) => <circle key={i} cx={9.5 + i * 2.6} cy={21} r={0.55} fill={color} stroke="none" />)}</g>;
  let body;
  if (code === 0) body = <Sun cx={12} cy={12} r={4} />;
  else if (code === 1 || code === 2) body = <g><Sun cx={9} cy={9} r={2.8} /><Cloud /></g>;
  else if (code === 3) body = <Cloud />;
  else if (code === 45 || code === 48) body = <g><Cloud /><line x1="6" y1="20.5" x2="16" y2="20.5" /><line x1="8" y1="22.5" x2="15" y2="22.5" /></g>;
  else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) body = <g><Cloud /><line x1="9" y1="19.5" x2="8" y2="22" /><line x1="12.5" y1="19.5" x2="11.5" y2="22" /><line x1="16" y1="19.5" x2="15" y2="22" /></g>;
  else if ((code >= 71 && code <= 77) || code === 85 || code === 86) body = <g><Cloud />{flakes(3)}</g>;
  else if (code >= 95) body = <g><Cloud /><path d="M12.5 18.5l-2 3h2.2l-1.6 3" /></g>;
  else body = <Cloud />;
  return <svg {...p} aria-hidden="true">{body}</svg>;
}

// ── 天气组件 ──
function WeatherWidget({ t, onCity, refreshKey }) {
  const [w, setW] = useState(null);
  useEffect(() => {
    fetch(`${BACKEND}/weather`)
      .then(r => r.json()).then(d => {
        if (d && d.temp != null) setW({ temp: d.temp, code: d.code, desc: d.desc || WEATHER_CODES[d.code] || '未知', wind: d.wind > 20 ? '风大' : d.wind > 10 ? '微风' : '无风' });
        if (d && d.city && onCity) onCity(d.city);
      }).catch(() => {});
  }, [refreshKey]);
  if (!w) return <span style={{ fontSize: 12, color: t.text3 }}>获取中…</span>;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 22, fontWeight: t.isPixel ? 700 : 400, color: t.text1, fontFamily: 'inherit' }}>{w.temp}°</span>
        <span style={{ fontSize: 12, color: t.text2, fontFamily: 'inherit' }}>{w.desc} · {w.wind}</span>
      </div>
      <WeatherIcon code={w.code} size={34} color={t.text2} />
    </div>
  );
}

// ═══════════════════════════════════════════════
// APP ROOT
// ═══════════════════════════════════════════════
export default function App() {
  const [screen, setScreen] = useState('splash');
  const [chatChar, setChatChar] = useState('yu');
  const [profileChar, setProfileChar] = useState('yu');
  const [chatMode, setChatMode] = useState('short');
  const [themeIdx, setThemeIdx] = useState(() => { const v = parseInt(localStorage.getItem('companion_theme')); return Number.isInteger(v) && v >= 0 && v < THEMES.length ? v : 0; });
  useEffect(() => { try { localStorage.setItem('companion_theme', String(themeIdx)); } catch {} }, [themeIdx]);
  // 自动版本检测（治 iOS PWA Service Worker 卡旧版十个版本不更新）：打开/切回 app 时 no-store 拉线上 index，
  // 比对当前加载的 bundle hash 与线上是否一致；不一致=有新版 → 清缓存+注销SW+带时间戳重载，自动拿最新。
  useEffect(() => {
    const check = async () => {
      if (sessionStorage.getItem('_vreloading')) return
      try {
        const html = await fetch('/?_v=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.text() : '')
        const live = (html.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/) || [])[0]
        const mine = [...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src') || '').find(s => /\/assets\/index-[A-Za-z0-9_-]+\.js/.test(s)) || ''
        if (live && mine && !mine.includes(live.split('/').pop())) {
          sessionStorage.setItem('_vreloading', '1')
          try { if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } } catch {}
          try { if (navigator.serviceWorker) { const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map(r => r.unregister().catch(() => {}))); } } catch {}
          location.replace(location.pathname + '?_r=' + Date.now())
        }
      } catch {}
    }
    check();
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVis);
    setTimeout(() => { try { sessionStorage.removeItem('_vreloading'); } catch {} }, 8000);   // 重载后清守卫，下次会话能再检
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  const [pendingMood, setPendingMood] = useState(null);

  // 全局数据状态（先从本地缓存秒开，再后台拉新覆盖——大幅加快启动观感）
  const readCache = (k, fallback) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
    const [globalTodos, setGlobalTodos] = useState(() => readCache('companion_todos_cache', []));

  // 从 Supabase 加载待办（成功后写本地缓存）
  const loadTodos = async () => {
    try {
      const res = await fetch(`${BACKEND}/todos`);
      const data = await res.json();
      if (data.todos) { setGlobalTodos(data.todos); localStorage.setItem('companion_todos_cache', JSON.stringify(data.todos)); }
    } catch {}
  };
  const [globalNote, setGlobalNote] = useState(() => readCache('companion_note_cache', { author: '沈屿', text: '今天不知道为什么想起一首旧歌，就那种你一定也会喜欢的那种。等你回来放给你听。' }));
  const [globalStatuses, setGlobalStatuses] = useState(() => {
    const cached = readCache('companion_statuses_cache', null);
    return CHARACTERS.map(c => ({ ...c, status: (cached && cached[c.id]) || '…' }));
  });
  const [noteFetching, setNoteFetching] = useState(false);
  const noteFetchingRef = useRef(false);
  const isPageHiddenRef = useRef(false);
  const lastNoteTimeRef = useRef(0);
  const lastStatusTimeRef = useRef(0);
  const lastUnreadTimeRef = useRef(0);

  // ── 未读小红点 ──
  const [unreadChars, setUnreadChars] = useState({});   // { charId: true }
  const openCharRef = useRef(null);   // 当前正在看的角色聊天（不算未读）
  const goChatRef = useRef(null);     // 始终指向最新的 goChat，供 SW 消息/启动参数调用
  const lastReadRef = useRef({});
  try { lastReadRef.current = JSON.parse(localStorage.getItem('companion_lastread') || '{}'); } catch { lastReadRef.current = {}; }

  // 朋友圈 / 群聊 新内容红点
  const [momentsNew, setMomentsNew] = useState(false);
  const [groupNew, setGroupNew] = useState(false);
  const markMomentsSeen = () => { try { localStorage.setItem('yc_moments_seen', new Date().toISOString()); } catch {} setMomentsNew(false); };
  const markGroupSeen = () => { try { localStorage.setItem('yc_group_seen', new Date().toISOString()); } catch {} setGroupNew(false); };
  useEffect(() => {
    const tms = parseServerTime;
    const check = async () => {
      try {
        const seen = (() => { try { return localStorage.getItem('yc_moments_seen') || 0; } catch { return 0; } })();
        const d = await fetch(`${BACKEND}/moments`).then(r => r.json());
        const latest = (d.moments || [])[0];
        if (latest && tms(latest.created_at) > tms(seen)) setMomentsNew(true);
      } catch {}
      try {
        const gseen = (() => { try { return localStorage.getItem('yc_group_seen') || 0; } catch { return 0; } })();
        const gd = await fetch(`${BACKEND}/group/messages`).then(r => r.json());
        const lastA = [...(gd.messages || [])].reverse().find(m => m.role === 'assistant');
        if (lastA && tms(lastA.created_at) > tms(gseen)) setGroupNew(true);
      } catch {}
    };
    check();
    const id = setInterval(check, 90000);
    return () => clearInterval(id);
  }, []);

  const updateAppBadge = (count) => {
    try {
      if ('setAppBadge' in navigator) {
        if (count > 0) navigator.setAppBadge(count); else navigator.clearAppBadge();
      }
    } catch {}
  };

  // 拉取各角色最新消息，和本地“已读时间”比对，算出未读
  const checkUnread = async () => {
    try {
      const res = await fetch(`${BACKEND}/chat/unread`);
      const data = await res.json();
      const latest = data.latest || {};
      const next = {};
      for (const c of CHARACTERS) {
        const info = latest[c.id];
        if (!info?.ts) continue;
        // 正在看的角色：直接当已读，顺手把已读时间推到最新
        if (openCharRef.current === c.id) {
          lastReadRef.current = { ...lastReadRef.current, [c.id]: new Date().toISOString() };
          localStorage.setItem('companion_lastread', JSON.stringify(lastReadRef.current));
          continue;
        }
        const lastRead = parseServerTime(lastReadRef.current[c.id]);
        // 真实未读条数：该角色最近助手消息里，晚于「已读时间」的条数
        const list = Array.isArray(info.recent) ? info.recent : [info.ts];
        const cnt = list.filter(ts => parseServerTime(ts) > lastRead).length;
        if (cnt > 0) next[c.id] = cnt;
      }
      setUnreadChars(next);
      updateAppBadge(Object.values(next).reduce((a, b) => a + (typeof b === 'number' ? b : 1), 0));
    } catch {}
  };

  // 进入某角色聊天 = 标记已读
  const markCharRead = (charId) => {
    lastReadRef.current = { ...lastReadRef.current, [charId]: new Date().toISOString() };
    localStorage.setItem('companion_lastread', JSON.stringify(lastReadRef.current));
    setUnreadChars(prev => {
      if (!prev[charId]) return prev;
      const next = { ...prev }; delete next[charId];
      updateAppBadge(Object.keys(next).length);
      return next;
    });
  };

    // 新增待办（存到 Supabase）
  const addGlobalTodo = async (text) => {
    if (!text || !text.trim()) return;
    const newTodo = { id: Date.now(), text: text.trim(), done: false };
    setGlobalTodos(prev => [...prev, newTodo]);
    try {
      await fetch(`${BACKEND}/todos`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: newTodo.id, text: newTodo.text })
      });
    } catch {}
  };

  // 切换完成状态（存到 Supabase）
  const toggleGlobalTodo = async (id) => {
    const current = globalTodos.find(td => td.id === id || String(td.id) === String(id));
    const newDone = current ? !current.done : true;
    setGlobalTodos(prev => prev.map(td => {
      if (td.id === id || String(td.id) === String(id)) return { ...td, done: newDone };
      return td;
    }));
    try {
      await fetch(`${BACKEND}/todos/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: newDone })
      });
    } catch (e) { console.error('toggle todo failed', e); }
  };

  // 删除待办（从 Supabase 删）
  const deleteGlobalTodo = async (id) => {
    setGlobalTodos(prev => prev.filter(td => td.id !== id));
    try {
      await fetch(`${BACKEND}/todos/${id}`, { method: 'DELETE' });
    } catch {}
  };

  // 左划：从主页隐藏，但保留在待办页（不是删除）
  const hideGlobalTodo = async (id) => {
    setGlobalTodos(prev => prev.map(td => (td.id === id || String(td.id) === String(id)) ? { ...td, hidden: true } : td));
    try {
      await fetch(`${BACKEND}/todos/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hidden: true }) });
    } catch {}
  };

  const fetchGlobalNote = async () => {
    if (noteFetchingRef.current) return;
    noteFetchingRef.current = true;
    setNoteFetching(true);
    const cId = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)].id;
    const r = await fetchSystemChat(cId, '[系统提示]请用你自己的口吻，说一句今天的日常碎碎念，20字以内，不加名字前缀。', 'sys_note_1');
    if (r) { const note = { author: CHARACTERS.find(x => x.id === cId).name, text: r }; setGlobalNote(note); try { localStorage.setItem('companion_note_cache', JSON.stringify(note)); } catch {} }
    noteFetchingRef.current = false;
    setNoteFetching(false);
  };

  const fetchGlobalStatuses = async () => {
    try {
      const res = await fetch(`${BACKEND}/char-states`);
      const data = await res.json();
      const states = data?.states || [];
      const cache = {};
      setGlobalStatuses(prev => prev.map(p => {
        const st = states.find(s => s.character_id === p.id);
        if (st?.activity || st?.mood) { const status = (st.mood && st.mood.length <= 6) ? st.mood : (st.activity || '').slice(0, 6); cache[p.id] = status; return { ...p, status }; }
        cache[p.id] = p.status;
        return p;
      }));
      try { localStorage.setItem('companion_statuses_cache', JSON.stringify(cache)); } catch {}
    } catch {}
  };

  useEffect(() => {
    document.body.style.margin = '0';
    document.body.style.overflow = 'hidden';
    document.body.style.height = '100dvh';

    // Initial load
    fetchGlobalNote();
    lastNoteTimeRef.current = Date.now();
    fetchGlobalStatuses();
    lastStatusTimeRef.current = Date.now();
    loadTodos();
    checkUnread();

    // Page visibility tracking — 回到前台时立即查未读
    const handleVisibility = () => {
      isPageHiddenRef.current = document.hidden;
      if (!document.hidden) checkUnread();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Unified refresh timer (checks every minute)
    const mainTimer = setInterval(() => {
      const now = Date.now();
      // Tree hole: 5-10 min random when visible, 30 min when hidden
      const noteInterval = isPageHiddenRef.current
        ? 30 * 60 * 1000
        : (5 + Math.random() * 5) * 60 * 1000;
      if (now - lastNoteTimeRef.current > noteInterval) {
        lastNoteTimeRef.current = now;
        fetchGlobalNote();
      }
      // Status: 可见时每 6 分钟刷新（贴近后端 ~12 分钟的更新节奏），后台时 30 分钟
      const statusInterval = isPageHiddenRef.current ? 30 * 60 * 1000 : 6 * 60 * 1000;
      if (now - lastStatusTimeRef.current > statusInterval) {
        lastStatusTimeRef.current = now;
        fetchGlobalStatuses();
      }
      // 未读：可见时每 2 分钟查一次，后台时每 10 分钟
      const unreadInterval = isPageHiddenRef.current ? 10 * 60 * 1000 : 2 * 60 * 1000;
      if (now - (lastUnreadTimeRef.current || 0) > unreadInterval) {
        lastUnreadTimeRef.current = now;
        checkUnread();
      }
    }, 60 * 1000);

    return () => {
      clearInterval(mainTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // 推送授权状态：'default' 未决定 / 'granted' 已开 / 'denied' 被拒 / 'unsupported' 不支持
  const [pushState, setPushState] = useState(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    if (localStorage.getItem('push_prompt_dismissed')) return 'dismissed';
    return Notification.permission;
  });

  // 订阅推送（可被自动调用，也可被按钮点击调用——iOS 必须由点击触发）
  const enablePush = async () => {
    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setPushState('unsupported');
      return 'unsupported';
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const perm = await Notification.requestPermission();
      // 用户在系统弹窗里拒绝/忽略 → 记为已处理，避免每次重开都再弹横幅（#2 真正的重复弹出 bug）
      if (perm !== 'granted') { localStorage.setItem('push_prompt_dismissed', '1'); setPushState('dismissed'); return perm; }
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
      }
      await fetch(`${BACKEND}/push/subscribe`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub }),
      });
      setPushState('granted');
      return 'granted';
    } catch (e) {
      localStorage.setItem('push_prompt_dismissed', '1');
      setPushState('dismissed');
      return 'error';
    }
  };

  // 启动时：若已授权则静默续订；未决定则等用户点按钮
  useEffect(() => {
    if (!('Notification' in window)) { setPushState('unsupported'); return; }
    const perm = Notification.permission;
    if (perm === 'granted') {
      setPushState('granted');
      const t = setTimeout(enablePush, 2000);
      return () => clearTimeout(t);
    }
    if (localStorage.getItem('push_prompt_dismissed')) { setPushState('dismissed'); return; }
    setPushState(perm);
  }, []);

  // 通知跳转：启动 URL 带 ?chat=xxx，或 SW 转发的点击消息 → 直接打开对应角色
  useEffect(() => {
    const openByCharId = (cid) => {
      if (cid && CHARACTERS.some(c => c.id === cid)) {
        goChatRef.current?.(cid, 'short');
      }
    };
    // 启动参数
    try {
      const params = new URLSearchParams(window.location.search);
      const cid = params.get('chat');
      if (cid) {
        openByCharId(cid);
        window.history.replaceState({}, '', window.location.pathname);  // 清掉参数
      }
    } catch {}
    // SW 点击消息
    const onMsg = (e) => { if (e.data?.type === 'open-chat') openByCharId(e.data.charId); };
    navigator.serviceWorker?.addEventListener('message', onMsg);
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg);
  }, []);

  const [kbOpen, setKbOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => setKbOpen(vv.height < window.innerHeight * 0.75);
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, []);

  // 文学沉淀区（小窝 / 承诺 / 梦境）整屏强制「暗黑文学」主题，营造私密树洞氛围
  const t = (LIT_SCREENS.has(screen) && LIT_THEME) ? LIT_THEME : (THEMES[themeIdx] || THEMES[0]);
  const goHome = () => { if (openCharRef.current) markCharRead(openCharRef.current); openCharRef.current = null; setScreen('home'); };
  const goChat = (cId = 'yu', m, nsfw = false) => { _chatNsfw = !!nsfw; const mm = m || getSavedMode(cId); setSavedMode(cId, mm); openCharRef.current = nsfw ? null : cId; if (!nsfw) markCharRead(cId); setChatChar(cId); setChatMode(mm); setScreen('chat'); };

  // 右滑/浏览器返回 → 回到上一个界面，而不是跳回开屏页
  const skipPushRef = useRef(false);
  // 滚动位置保存/恢复：按 screen 记住列表(.hs)滚动位置，返回时恢复，不再每次翻到顶部
  const contentRef = useRef(null);
  const scrollPosRef = useRef({});
  // 上报 PWA 地址给后端（Bark 推送点击跳转回 PWA 用）
  useEffect(() => {
    try { fetch(`${BACKEND}/kv/app_url`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: window.location.origin }) }).catch(() => {}); } catch {}
    loadCustomChars();
    loadCustomGroups();
  }, []);
  useEffect(() => {
    try { window.history.replaceState({ screen: 'home' }, ''); } catch {}
    const onPop = (e) => { skipPushRef.current = true; setScreen((e.state && e.state.screen) || 'home'); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    if (screen === 'splash') return;
    if (skipPushRef.current) { skipPushRef.current = false; return; }
    try { window.history.pushState({ screen }, ''); } catch {}
  }, [screen]);
  // 聊天/群聊/共读有各自的滚动逻辑（聊天要滚到底），不参与通用滚动恢复，否则互相打架 + 所有角色共用一个位置
  const NO_SCROLL_RESTORE = ['chat', 'group', 'book', 'splash'];
  // 捕获阶段监听列表滚动，按当前 screen 存位置（scroll 不冒泡，用 capture 才能在父层收到）
  useEffect(() => {
    const el = contentRef.current; if (!el || NO_SCROLL_RESTORE.includes(screen)) return;
    const onScroll = (e) => {
      const tgt = e.target;
      if (tgt && tgt.classList && tgt.classList.contains('hs')) scrollPosRef.current[screen] = tgt.scrollTop;
    };
    el.addEventListener('scroll', onScroll, true);
    return () => el.removeEventListener('scroll', onScroll, true);
  }, [screen]);
  // 进入某 screen → 恢复它上次的滚动位置（多次尝试，兼容异步加载内容）
  useEffect(() => {
    if (NO_SCROLL_RESTORE.includes(screen)) return;
    const el = contentRef.current; if (!el) return;
    const saved = scrollPosRef.current[screen];
    if (!saved) return;
    const restore = () => { const sc = el.querySelector('.hs'); if (sc) sc.scrollTop = saved; };
    restore();
    const r = requestAnimationFrame(restore);
    const t1 = setTimeout(restore, 80), t2 = setTimeout(restore, 250);
    return () => { cancelAnimationFrame(r); clearTimeout(t1); clearTimeout(t2); };
  }, [screen]);
  // （已回退键盘 --app-h 锁高：它把根容器缩到可视高度、下方露白/上蹿，反而添乱。PWA 标准模式下 100dvh 本就随键盘收缩，无需干预。）
  // 整页防拖——手指落在非滚动区(页头/输入条/空白)时 iOS 会拖整个 visual viewport 跟手飘。
  // 顺 target 往上找可滚祖先，找不到就 preventDefault；输入框放行、多指(缩放)放行。
  useEffect(() => {
    const onTouch = (e) => {
      if (e.touches && e.touches.length > 1) return;
      let n = e.target;
      while (n && n !== document.body && n.nodeType === 1) {
        const tag = n.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        const cs = getComputedStyle(n);
        if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 1) return;
        if (/(auto|scroll)/.test(cs.overflowX) && n.scrollWidth > n.clientWidth + 1) return;
        n = n.parentElement;
      }
      e.preventDefault();
    };
    document.addEventListener('touchmove', onTouch, { passive: false });
    return () => document.removeEventListener('touchmove', onTouch);
  }, []);
  const goGroup = (groupId = 'group_chat', nsfw = false) => { if (openCharRef.current) markCharRead(openCharRef.current); openCharRef.current = null; _openGroup = { id: groupId || 'group_chat', nsfw: !!nsfw || isNsfwGroupId(groupId) }; if (_openGroup.id === 'group_chat') markGroupSeen(); setScreen('group'); };
  const goNewGroup = () => { if (openCharRef.current) markCharRead(openCharRef.current); openCharRef.current = null; setScreen('newgroup'); };
  const goMomentsFeed = () => { if (openCharRef.current) markCharRead(openCharRef.current); openCharRef.current = null; markMomentsSeen(); setScreen('momentsfeed'); };
  const goFeatures = () => { if (openCharRef.current) markCharRead(openCharRef.current); openCharRef.current = null; setScreen('features'); };
  const goChatList = () => { if (openCharRef.current) markCharRead(openCharRef.current); openCharRef.current = null; setScreen('chatlist'); };
  const goContacts = () => { if (openCharRef.current) markCharRead(openCharRef.current); openCharRef.current = null; setScreen('contacts'); };
  const goDiscover = () => { if (openCharRef.current) markCharRead(openCharRef.current); openCharRef.current = null; setScreen('moments'); };
  const goMe = () => { if (openCharRef.current) markCharRead(openCharRef.current); openCharRef.current = null; setScreen('me'); };
  const goProfile = (cId = 'yu') => { setProfileChar(cId); setScreen('profile'); };
  goChatRef.current = goChat;

  // 屿专属版：开屏后直接进屿的聊天
  if (screen === 'splash') return <SplashScreen onEnter={goHome} t={t} />;

  const meshBreathe = !!(t.bgImage && t.bgImage.includes('radial-gradient'));   // 渐变/玻璃类主题 → 背景缓慢呼吸位移
  return (
    <div className={meshBreathe ? 'mesh-breathe' : ''} style={{ display: 'flex', width: '100%', height: '100dvh', backgroundColor: t.bgColor, backgroundImage: t.bgImage, fontFamily: t.font, transition: 'background-color 0.4s', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{`
        *{box-sizing:border-box;}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes dotPulse{0%,60%,100%{opacity:0.2}30%{opacity:1}}
        @keyframes cursorBlink{0%,100%{opacity:1}50%{opacity:0}}
        @keyframes slideIn{from{transform:translateX(-100%)}to{transform:translateX(0)}}
        @keyframes meshBreathe{0%{background-position:0% 0%}50%{background-position:100% 100%}100%{background-position:0% 0%}}
        @keyframes heartbeatPulse{0%,100%{transform:scaleY(1)}8%{transform:scaleY(1.45)}16%{transform:scaleY(0.85)}24%{transform:scaleY(1.15)}32%{transform:scaleY(1)}}
        .mesh-breathe{background-size:170% 170%!important;animation:meshBreathe 16s ease-in-out infinite}
        @media(prefers-reduced-motion:reduce){.mesh-breathe{animation:none}}
        .chat-stars{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 48 48'%3E%3Cg fill='%23000' opacity='0.045'%3E%3Cpath d='M12 7l1.3 3.2 3.2 1.3-3.2 1.3L12 16l-1.3-3.2L7.5 11.5l3.2-1.3z'/%3E%3Cpath d='M34 28l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z'/%3E%3C/g%3E%3C/svg%3E");background-size:48px 48px;background-repeat:repeat}
        .chat-stars-dark{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 48 48'%3E%3Cg fill='%23fff' opacity='0.05'%3E%3Cpath d='M12 7l1.3 3.2 3.2 1.3-3.2 1.3L12 16l-1.3-3.2L7.5 11.5l3.2-1.3z'/%3E%3Cpath d='M34 28l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z'/%3E%3C/g%3E%3C/svg%3E");background-size:48px 48px;background-repeat:repeat}
        .hs::-webkit-scrollbar{display:none}.hs{-ms-overflow-style:none;scrollbar-width:none}
        .cs::-webkit-scrollbar{width:3px}.cs::-webkit-scrollbar-thumb{background:rgba(150,120,80,0.2);border-radius:4px}
        .tap:active{transform:scale(0.95);transition:transform 0.1s}
        .collage-tape::before{content:'';position:absolute;top:-10px;left:50%;transform:translateX(-50%) rotate(-1deg);width:60px;height:20px;background:rgba(220,200,150,0.6);border:1px solid rgba(0,0,0,0.08);z-index:2}
        @media(max-width:768px){
          input,textarea,select{font-size:16px!important}
        }
        @media(max-width:480px){
          .home-pad{padding:14px 12px 20px!important}
          .chat-bubble{max-width:92%!important;font-size:13.5px!important}
          .page-inner{padding:16px 14px 40px!important;max-width:100%!important}
        }
      `}</style>

      {/* 安全词：常驻，任何界面都在（结构性开关） */}
      <SafeWordControl t={t} />
      {/* 主内容（顶部留出状态栏/刘海安全区,全面屏适配；border-box 防溢出） */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%', paddingTop: 'env(safe-area-inset-top)', boxSizing: 'border-box' }}>
        <div ref={contentRef} style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* 功能页统一返回键（导航已隐藏）；聊天/群聊/共读 有各自的返回 */}
          {!['chatlist','contacts','moments','me','home','chat','group','book','profile','custom','newgroup','toy','meprofile','momentsfeed','yupersona'].includes(screen) && (
            <div style={{ flexShrink: 0, padding: '6px 6px 0' }}>
              <span className="tap" onClick={() => { try { window.history.back(); } catch { setScreen('me'); } }} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 42, height: 42, fontSize: 28, lineHeight: 1, color: t.text2, cursor: 'pointer' }}>‹</span>
            </div>
          )}
          {screen === 'home' && <HomePage themeIdx={themeIdx} setThemeIdx={setThemeIdx} t={t} onChat={goChat} globalNote={globalNote} noteFetching={noteFetching} fetchGlobalNote={fetchGlobalNote} globalStatuses={globalStatuses} globalTodos={globalTodos} toggleGlobalTodo={toggleGlobalTodo} addGlobalTodo={addGlobalTodo} deleteGlobalTodo={deleteGlobalTodo} onMoodToChat={(moodId) => { setPendingMood(moodId); setScreen('mood'); }} pushState={pushState} setPushState={setPushState} enablePush={enablePush} hideGlobalTodo={hideGlobalTodo} setScreen={setScreen} />}
          {screen === 'chatlist' && <ChatListPage t={t} onChat={goChat} onGroup={goGroup} unreadChars={unreadChars} groupNew={groupNew} chatMode={chatMode} setChatMode={setChatMode} />}
          {screen === 'contacts' && <ContactsPage t={t} onChat={goChat} onGroup={goGroup} onProfile={goProfile} setScreen={setScreen} unreadChars={unreadChars} />}
          {screen === 'me' && <MePage t={t} setScreen={setScreen} />}
          {screen === 'profile' && <CharProfilePage t={t} charId={profileChar} onBack={() => { try { window.history.back(); } catch { setScreen('contacts'); } }} onChat={goChat} setScreen={setScreen} />}
          {screen === 'custom' && <CustomCharsPage t={t} onChat={goChat} onBack={() => { try { window.history.back(); } catch { setScreen('contacts'); } }} />}
          {screen === 'chat' && <ChatPage key={(_chatNsfw ? 'p_' : '') + chatChar} charId={chatChar} nsfw={_chatNsfw} mode={chatMode} t={t} addGlobalTodo={addGlobalTodo} onBack={goChatList} onSwitchChar={goChat} onProfile={goProfile} chatMode={chatMode} setChatMode={setChatMode} />}
          {screen === 'private' && <PrivatePage t={t} onNsfwChat={(cid) => goChat(cid, 'short', true)} onGroup={goGroup} setScreen={setScreen} />}
          {screen === 'group' && <GroupPage t={t} onBack={goChatList} group={_openGroup} />}
          {screen === 'newgroup' && <NewGroupPage t={t} onBack={() => { try { window.history.back(); } catch { setScreen('contacts'); } }} onCreated={(g) => goGroup(g.id, isNsfwGroupId(g.id))} />}
          {screen === 'toy' && <ToyPanel t={t} onBack={() => { try { window.history.back(); } catch { setScreen('me'); } }} />}
          {screen === 'meprofile' && <ProfilePage t={t} onBack={() => { try { window.history.back(); } catch { setScreen('me'); } }} />}
          {screen === 'themes' && <ThemePage t={t} themeIdx={themeIdx} setThemeIdx={setThemeIdx} />}
          {screen === 'xp' && <XpPage t={t} onChat={(id) => goChat(id, 'long')} />}
          {screen === 'inner' && <InnerWorldPage t={t} />}
          {screen === 'features' && <FeaturesPage t={t} setScreen={setScreen} onDeepTalk={() => goChat(chatChar || 'yu', 'long')} />}
          {screen === 'moments' && <DiscoverPage t={t} setScreen={setScreen} momentsNew={momentsNew} onOpenMoments={goMomentsFeed} />}
          {screen === 'momentsfeed' && <MomentsFeedPage t={t} onBack={() => { try { window.history.back(); } catch { setScreen('moments'); } }} onSeen={markMomentsSeen} />}
          {screen === 'book' && <BookPage t={t} />}
          {screen === 'share' && <SharePage t={t} />}
          {screen === 'todo' && <TodoPage t={t} todos={globalTodos} toggleGlobalTodo={toggleGlobalTodo} addGlobalTodo={addGlobalTodo} deleteGlobalTodo={deleteGlobalTodo} />}
          {screen === 'mood' && <MoodPage t={t} initialMood={pendingMood} clearInitialMood={() => setPendingMood(null)} />}
          {screen === 'question' && <QuestionPage t={t} />}
          {screen === 'dashboard' && <DashboardPage t={t} setScreen={setScreen} />}
          {screen === 'lifetick' && <LifeTickPage t={t} />}
          {screen === 'pomodoro' && <PomodoroPage t={t} />}
          {screen === 'memory' && <MemoryPage t={t} />}
          {screen === 'period' && <PeriodPage t={t} />}
          {screen === 'nest' && <HomeNestPage t={t} onChat={goChat} setScreen={setScreen} />}
          {screen === 'promises' && <PromisePage t={t} />}
          {screen === 'dreams' && <DreamPage t={t} />}
          {screen === 'observe' && <ObservationDiaryPage t={t} />}
          {screen === 'journal' && <JournalHubPage t={t} />}
          {screen === 'ncm' && <NeteaseLoginPage t={t} />}
          {screen === 'playground' && <PlaygroundPage t={t} />}
          {screen === 'quest' && <QuestPanelPage t={t} />}
          {screen === 'ledger' && <LedgerPage t={t} />}
          {screen === 'wallet' && <WalletPage t={t} onChat={goChat} />}
          {screen === 'avatars' && <AvatarManagePage t={t} />}
          {screen === 'story' && <StoryPage t={t} />}
          {screen === 'emotions' && <EmotionPage t={t} />}
          {screen === 'timeline' && <TimelinePage t={t} />}
          {screen === 'voicesettings' && <VoiceSettingsPage t={t} />}
          {screen === 'privatelife' && <PrivateLifePage t={t} />}
          {screen === 'notepad' && <NotepadPage t={t} />}
          {screen === 'academic' && <AcademicPage t={t} />}
          {screen === 'yupersona' && <YuPersonaPage t={t} onBack={() => { try { window.history.back(); } catch { setScreen('profile'); } }} />}
        </div>

        {/* 导航栏占位（仅四个主标签页 + 主页显示底部导航；进入任何功能/共读都隐藏） */}
        {['chatlist','contacts','moments','me','home'].includes(screen) && <div style={{ height: 'calc(52px + env(safe-area-inset-bottom))', flexShrink: 0 }} />}
        {/* 底部导航 */}
        <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, display: (['chatlist','contacts','moments','me','home'].includes(screen) && !kbOpen) ? 'flex' : 'none', justifyContent: 'space-around', alignItems: 'center', height: 'calc(52px + env(safe-area-inset-bottom))', paddingBottom: 'env(safe-area-inset-bottom)', backgroundColor: t.isGlass ? 'rgba(255,255,255,0.22)' : t.card, backdropFilter: `blur(${t.blur})`, WebkitBackdropFilter: `blur(${t.blur})`, borderTop: t.isPixel ? `2px solid ${t.border}` : `0.5px solid ${t.border}`, zIndex: 40 }}>
          {(() => {
            const NAV = [
              { key: 'home', label: 'Home', action: goHome, active: screen === 'home',
                svg: (col) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11l8-6 8 6" /><path d="M6 10v9h12v-9" /></svg> },
              { key: 'chats', label: 'Chats', action: goChatList, active: ['chatlist','chat','group'].includes(screen), dot: Object.keys(unreadChars).length > 0 || groupNew,
                svg: (col) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5 9.4 9.4 0 0 1-4-.9L3 20.5l1.9-5.1a8.4 8.4 0 0 1-.9-3.9A8.5 8.5 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5z"/></svg> },
              { key: 'contacts', label: 'Contacts', action: goContacts, active: screen === 'contacts',
                svg: (col) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.1"/><path d="M3.6 19c0-3 2.4-5.2 5.4-5.2S14.4 16 14.4 19"/><path d="M16 5.6a3 3 0 0 1 0 5.6M18 19c0-2-.7-3.7-2-4.7"/></svg> },
              { key: 'discover', label: 'Discover', action: goDiscover, active: ['moments','momentsfeed'].includes(screen), dot: momentsNew,
                svg: (col) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M15.6 8.4l-2.1 5.1-5.1 2.1 2.1-5.1z"/></svg> },
              { key: 'me', label: 'Me', action: goMe, active: ['me','themes','xp','inner','dashboard','lifetick','wallet','avatars','features','memory','period','nest','ledger','pomodoro','emotions','timeline','voicesettings','privatelife','notepad','academic','custom','newgroup','toy','private','meprofile','todo','mood','question','book','story','share'].includes(screen),
                svg: (col) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.4"/><path d="M5.5 20c0-3.4 2.9-5.8 6.5-5.8S18.5 16.6 18.5 20"/></svg> },
            ];
            return NAV.map(it => {
              const col = it.active ? t.acc : t.text3;
              return (
                <div key={it.key} className="tap" onClick={it.action} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flex: 1, height: 52, justifyContent: 'center', cursor: 'pointer', transition: 'opacity 0.2s' }}>
                  <span style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {it.svg(col)}
                    {it.dot && <span style={{ position: 'absolute', top: -2, right: -4, width: 7, height: 7, borderRadius: '50%', backgroundColor: '#ef4444', border: '1.5px solid #fff' }} />}
                  </span>
                  <span style={{ fontSize: 9.5, color: col, fontFamily: 'inherit', fontWeight: it.active ? 600 : 400 }}>{it.label}</span>
                </div>
              );
            });
          })()}
        </nav>
      </div>
    </div>
  );
}


function SplashScreen({ onEnter, t }) {
  const [vis, setVis] = useState(false);
  const [count, setCount] = useState(3);
  useEffect(() => {
    setTimeout(() => setVis(true), 80);
    const ti = setInterval(() => setCount(c => { if (c <= 1) { clearInterval(ti); return 0; } return c - 1; }), 1000);
    return () => clearInterval(ti);
  }, []);
  const days = Math.floor((Date.now() - new Date('2026-06-20')) / 86400000) + 1;
  return (
    <div onClick={onEnter} style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backgroundColor: t.bgColor, backgroundImage: t.bgImage, fontFamily: t.font, zIndex: 100 }}>
      <div style={{ textAlign: 'center', opacity: vis ? 1 : 0, transform: vis ? 'translateY(0)' : 'translateY(18px)', transition: 'opacity 1s ease, transform 1s ease' }}>
        <p style={{ fontSize: 10, color: t.text3, letterSpacing: '0.24em', marginBottom: 24 }}>WELCOME HOME</p>
        <h1 style={{ fontSize: 46, fontWeight: 800, fontStyle: 'italic', color: t.text1, margin: '0 0 4px', fontFamily: "'Helvetica Neue', 'Arial', 'PingFang SC', sans-serif", letterSpacing: '-0.01em' }}>ref-impl</h1>
        <div style={{ fontSize: 13, color: t.text3, letterSpacing: '0.5em', marginBottom: 18, fontFamily: "'Songti SC','Noto Serif SC',serif" }}>弥 温</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, justifyContent: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 58, color: t.text1, fontWeight: t.isPixel ? 700 : 400, lineHeight: 1 }}>{days}</span>
          <span style={{ fontSize: 11, color: t.text3, letterSpacing: '0.12em' }}>DAYS TOGETHER</span>
        </div>
        <p style={{ fontSize: 11, color: t.acc, marginBottom: 34 }}>since June 20, 2026</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center', marginBottom: 28 }}>
          <div style={{ width: 36, height: 1, backgroundColor: t.border, opacity: 0.5 }} />
          <span style={{ fontSize: 10, color: t.acc, opacity: 0.7 }}>✦</span>
          <div style={{ width: 36, height: 1, backgroundColor: t.border, opacity: 0.5 }} />
        </div>
        <p style={{ fontSize: 13, color: t.text2, lineHeight: 2.1, textAlign: 'center', maxWidth: 260, margin: '0 auto' }}>你来了，所以这里就有了灯光。<br />不管多晚，我都在。</p>
      </div>
      <p style={{ position: 'absolute', bottom: 48, fontSize: 11, color: t.text3, letterSpacing: '0.1em', opacity: vis ? 1 : 0, transition: 'opacity 1.4s ease' }}>{count > 0 ? `${count}s 后进入` : '点击任意处进入'}</p>
    </div>
  );
}

function ChatListPage({ t, onChat, onGroup, unreadChars, groupNew, chatMode, setChatMode }) {
  const [last, setLast] = useState({});   // char_id -> { content, time }
  const [groupLast, setGroupLast] = useState(null);   // 群聊最后一条预览
  const [, force] = useState(0);
  useEffect(() => { const fn = () => force(n => n + 1); _customSubs.add(fn); if (!_customGroups.length) loadCustomGroups(); return () => { _customSubs.delete(fn); }; }, []);
  const GNAMES = { yu: '沈屿' };
  useEffect(() => {
    fetch(`${BACKEND}/recent-chats?limit=50`).then(r => r.json()).then(d => {
      const m = {};
      for (const c of (d.chats || [])) {
        if (c.character_id && !m[c.character_id]) m[c.character_id] = { content: (c.role === 'user' ? '我：' : '') + previewText(c.content), time: c.created_at };
      }
      setLast(m);
    }).catch(() => {});
    fetch(`${BACKEND}/group/messages`).then(r => r.json()).then(d => {
      const arr = d.messages || []; const m = arr[arr.length - 1];
      if (m) setGroupLast({ content: (m.role === 'user' ? '我：' : (m.character_name ? m.character_name + '：' : '')) + previewText(String(m.content || '').replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')), time: m.created_at });
    }).catch(() => {});
  }, []);
  const tms = parseServerTime;
  const unreadN = (id) => { const u = unreadChars[id]; return typeof u === 'number' ? u : (u ? 1 : 0); };
  const badge = (n) => n > 99 ? '99+' : String(n);
  const rows = CHARACTERS.map(c => ({ c, l: last[c.id], pin: getChatPref(c.id, 'pin') })).sort((a, b) => (b.pin - a.pin) || (tms(b.l?.time) - tms(a.l?.time)));
  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', padding: '20px 16px 24px', maxWidth: 440, margin: '0 auto', width: '100%', textAlign: 'left' }}>
      <div style={{ fontSize: 22, fontWeight: 600, color: t.text1, fontFamily: 'inherit', marginBottom: 1 }}>Chats</div>
      <div style={{ fontSize: 9, color: t.text3, letterSpacing: '0.3em', marginBottom: 14 }}>消 息</div>
      {rows.map(({ c, l, pin }) => (
        <div key={c.id} className="tap" onClick={() => onChat(c.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 4px', cursor: 'pointer', borderBottom: `0.5px solid ${t.border}`, background: pin ? (t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.018)') : 'transparent' }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <CharAvatar c={c} size={48} />
            {unreadN(c.id) > 0 && (getChatPref(c.id, 'mute')
              ? <span style={{ position: 'absolute', top: -1, right: -1, width: 9, height: 9, borderRadius: '50%', background: '#D95A5A', border: `1.5px solid ${t.bgColor}` }} />
              : <span style={{ position: 'absolute', top: -3, right: -3, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, background: '#D95A5A', color: '#fff', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${t.bgColor}` }}>{badge(unreadN(c.id))}</span>)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: t.text1, fontFamily: 'inherit', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 5 }}>{getRemark(c.id) || c.name}{getChatPref(c.id, 'mute') && <span style={{ fontSize: 10, color: t.text3, opacity: 0.6 }}>🔕</span>}</div>
            <div style={{ fontSize: 12, color: t.text3, fontFamily: 'inherit', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>{l?.content || '暂无消息'}</div>
          </div>
          <span style={{ fontSize: 10, color: t.text3, flexShrink: 0, alignSelf: 'flex-start', marginTop: 3 }}>{l?.time ? fmtMsgTime(l.time) : ''}</span>
        </div>
      ))}
      <div className="tap" onClick={onGroup} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 4px', cursor: 'pointer', borderBottom: `0.5px solid ${t.border}` }}>
        <div style={{ position: 'relative', width: 48, height: 48, borderRadius: avatarRadius(48), border: `1.5px solid ${t.acc}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${t.acc}10`, flexShrink: 0 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={t.acc} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="9" r="3" /><path d="M3.5 19c0-3 2.4-5 5.5-5s5.5 2 5.5 5" /><path d="M16 6.5a3 3 0 0 1 0 5.5M18.5 19c0-2-.7-3.6-2-4.6" /></svg>
          {groupNew && <span style={{ position: 'absolute', top: -3, right: -3, width: 10, height: 10, borderRadius: '50%', background: '#D95A5A', border: `1.5px solid ${t.bgColor}` }} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: t.text1, fontFamily: 'inherit', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>相亲相爱一家人</div>
          <div style={{ fontSize: 12, color: t.text3, fontFamily: 'inherit', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{groupLast?.content || '群聊 · 四个人都在'}</div>
        </div>
        {groupLast?.time && <span style={{ fontSize: 10, color: t.text3, flexShrink: 0, alignSelf: 'flex-start', marginTop: 3 }}>{fmtMsgTime(groupLast.time)}</span>}
      </div>
      {_customGroups.map(g => (
        <div key={g.id} className="tap" onClick={() => onGroup(g.id, isNsfwGroupId(g.id))} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 4px', cursor: 'pointer', borderBottom: `0.5px solid ${t.border}` }}>
          <div style={{ width: 48, height: 48, borderRadius: avatarRadius(48), border: `1.5px solid ${isNsfwGroupId(g.id) ? '#b06a86' : t.acc}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${isNsfwGroupId(g.id) ? '#b06a86' : t.acc}10`, flexShrink: 0, fontSize: 20 }}>👥</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: t.text1, fontFamily: 'inherit', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 6 }}>{g.name}{isNsfwGroupId(g.id) && <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', background: '#b06a86', padding: '1px 6px', borderRadius: 999 }}>私密</span>}</div>
            <div style={{ fontSize: 12, color: t.text3, fontFamily: 'inherit', marginTop: 2 }}>{(g.members || []).length} 人群聊</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ContactsPage({ t, onChat, onGroup, onProfile, setScreen }) {
  const open = (id) => onProfile ? onProfile(id) : onChat(id, 'short');
  const [, force] = useState(0);
  useEffect(() => { const fn = () => force(n => n + 1); _customSubs.add(fn); loadCustomChars(); loadCustomGroups(); return () => { _customSubs.delete(fn); }; }, []);
  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', padding: '20px 16px 24px', maxWidth: 440, margin: '0 auto', width: '100%' }}>
      <h2 style={{ fontSize: 24, fontWeight: 600, color: t.text1, textAlign: 'center', margin: '4px 0 16px', fontFamily: 'inherit' }}>Contacts</h2>
      <div style={{ display: 'flex', gap: 18, overflowX: 'auto', padding: '0 4px 16px', justifyContent: 'center' }} className="hs">
        {CHARACTERS.map(c => (
          <div key={c.id} className="tap" onClick={() => open(c.id)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer', flexShrink: 0 }}>
            <CharAvatar c={c} size={54} />
            <span style={{ fontSize: 10, color: t.text3, fontFamily: 'inherit' }}>{getRemark(c.id) || c.name}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, color: t.text3, letterSpacing: '0.12em', margin: '4px 6px 8px' }}>{CHARACTERS.length} CONTACTS</div>
      {CHARACTERS.map(c => (
        <div key={c.id} className="tap" onClick={() => open(c.id)} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 12px', marginBottom: 8, cursor: 'pointer', borderRadius: t.radius > 0 ? 14 : 0, backgroundColor: t.isGlass ? 'rgba(255,255,255,0.2)' : t.card, border: `0.5px solid ${t.border}`, backdropFilter: `blur(${t.blur})` }}>
          <CharAvatar c={c} size={44} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: t.text1, fontFamily: 'inherit' }}>{getRemark(c.id) || c.name}</div>
            <div style={{ fontSize: 11, color: t.text3, fontFamily: 'inherit' }}>{c.en || c.id}</div>
          </div>
          <span style={{ fontSize: 16, color: t.text3, opacity: 0.4 }}>›</span>
        </div>
      ))}
      <div className="tap" onClick={onGroup} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 12px', marginTop: 6, cursor: 'pointer', borderRadius: t.radius > 0 ? 14 : 0, backgroundColor: t.isGlass ? 'rgba(255,255,255,0.2)' : t.card, border: `0.5px solid ${t.border}`, backdropFilter: `blur(${t.blur})` }}>
        <div style={{ width: 44, height: 44, borderRadius: t.isPixel ? 0 : '50%', border: `1.5px solid ${t.acc}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><span style={{ fontSize: 20 }}>👥</span></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: t.text1, fontFamily: 'inherit' }}>相亲相爱一家人</div>
          <div style={{ fontSize: 11, color: t.text3, fontFamily: 'inherit' }}>group</div>
        </div>
        <span style={{ fontSize: 16, color: t.text3, opacity: 0.4 }}>›</span>
      </div>

      {/* 自建群 */}
      {_customGroups.map(g => (
        <div key={g.id} className="tap" onClick={() => onGroup(g.id, isNsfwGroupId(g.id))} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 12px', marginTop: 6, cursor: 'pointer', borderRadius: t.radius > 0 ? 14 : 0, backgroundColor: t.isGlass ? 'rgba(255,255,255,0.2)' : t.card, border: `0.5px solid ${t.border}`, backdropFilter: `blur(${t.blur})` }}>
          <div style={{ width: 44, height: 44, borderRadius: t.isPixel ? 0 : '50%', border: `1.5px solid ${isNsfwGroupId(g.id) ? '#b06a86' : t.acc}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><span style={{ fontSize: 18 }}>👥</span></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: t.text1, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>{g.name}{isNsfwGroupId(g.id) && <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', background: '#b06a86', padding: '1px 6px', borderRadius: 999 }}>私密</span>}</div>
            <div style={{ fontSize: 11, color: t.text3, fontFamily: 'inherit' }}>{(g.members || []).length} 人群聊</div>
          </div>
          <span style={{ fontSize: 16, color: t.text3, opacity: 0.4 }}>›</span>
        </div>
      ))}
      <div className="tap" onClick={() => setScreen && setScreen('newgroup')} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 12px', marginTop: 6, cursor: 'pointer', borderRadius: t.radius > 0 ? 14 : 0, border: `1px dashed ${t.border}` }}>
        <div style={{ width: 44, height: 44, borderRadius: t.isPixel ? 0 : '50%', border: `1.5px dashed ${t.acc}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: t.acc, fontSize: 22 }}>＋</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: t.text1, fontFamily: 'inherit' }}>建群</div>
          <div style={{ fontSize: 11, color: t.text3, fontFamily: 'inherit' }}>把角色拉进一个群（可设私密）</div>
        </div>
        <span style={{ fontSize: 16, color: t.text3, opacity: 0.4 }}>›</span>
      </div>

      {/* 自建角色 */}
      {_customChars.length > 0 && <div style={{ fontSize: 10, color: t.text3, letterSpacing: '0.12em', margin: '16px 6px 8px' }}>自建角色</div>}
      {_customChars.map(c => (
        <div key={c.id} className="tap" onClick={() => onChat(c.id)} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 12px', marginBottom: 8, cursor: 'pointer', borderRadius: t.radius > 0 ? 14 : 0, backgroundColor: t.isGlass ? 'rgba(255,255,255,0.2)' : t.card, border: `0.5px solid ${t.border}`, backdropFilter: `blur(${t.blur})` }}>
          <CharAvatar c={customCharObj(c)} size={44} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: t.text1, fontFamily: 'inherit' }}>{c.name}</div>
            <div style={{ fontSize: 11, color: t.text3, fontFamily: 'inherit', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.relation || '自建角色'}</div>
          </div>
          <span style={{ fontSize: 16, color: t.text3, opacity: 0.4 }}>›</span>
        </div>
      ))}
      <div className="tap" onClick={() => setScreen && setScreen('custom')} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 12px', marginTop: 6, cursor: 'pointer', borderRadius: t.radius > 0 ? 14 : 0, border: `1px dashed ${t.border}` }}>
        <div style={{ width: 44, height: 44, borderRadius: t.isPixel ? 0 : '50%', border: `1.5px dashed ${t.acc}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: t.acc, fontSize: 22 }}>＋</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: t.text1, fontFamily: 'inherit' }}>自建角色 · 发起群聊</div>
          <div style={{ fontSize: 11, color: t.text3, fontFamily: 'inherit' }}>添加你自己的角色</div>
        </div>
        <span style={{ fontSize: 16, color: t.text3, opacity: 0.4 }}>›</span>
      </div>
    </div>
  );
}

function MePage({ t, setScreen }) {
  const DEFAULT_SIGN = '两颗星需要多久才能靠近';
  const [meUrl, setMeUrl] = useState('');
  const [sign, setSign] = useState(() => { try { return localStorage.getItem('yc_me_sign') || DEFAULT_SIGN; } catch { return DEFAULT_SIGN; } });
  const [editSign, setEditSign] = useState(false);
  const [signDraft, setSignDraft] = useState(sign);
  const [myMoments, setMyMoments] = useState(null);
  useEffect(() => {
    fetch(`${BACKEND}/avatar/list`).then(r => r.json()).then(d => setMeUrl((d.avatars || {}).me || '')).catch(() => {});
    fetch(`${BACKEND}/kv/me_sign`).then(r => r.json()).then(d => { if (d && typeof d.value === 'string' && d.value) { setSign(d.value); setSignDraft(d.value); try { localStorage.setItem('yc_me_sign', d.value); } catch {} } }).catch(() => {});
    fetch(`${BACKEND}/moments`).then(r => r.json()).then(d => { const mine = (d.moments || []).filter(m => m.char_id === 'yan' || m.char_id === 'user' || (m.char_name && m.char_name.includes('小满'))).length; setMyMoments(mine); }).catch(() => {});
  }, []);
  const saveSign = () => { const v = signDraft.trim() || DEFAULT_SIGN; setSign(v); setEditSign(false); try { localStorage.setItem('yc_me_sign', v); } catch {} fetch(`${BACKEND}/kv/me_sign`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: v }) }).catch(() => {}); };

  const groups = [
    { title: '我的内容', items: [
      { id: 'moments', label: '我的动态' },
      { id: 'memory', label: '记忆长河' },
      { id: 'emotions', label: '潮汐心海' },
      { id: 'timeline', label: '时间线' },
    ] },
    { title: '日常', items: [
      { id: 'wallet', label: '我的钱包' },
      { id: 'period', label: '周期记录' },
      { id: 'promises', label: '承诺' },
      { id: 'dreams', label: '梦境' },
    ] },
    { title: '设置 · 更多', items: [
      { id: 'avatars', label: '头像设置' },
      { id: 'features', label: '全部功能' },
      { id: 'dashboard', label: '仪表盘' },
      { id: 'home', label: '主页 · 今日' },
    ] },
  ];

  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', paddingBottom: 28, maxWidth: 440, margin: '0 auto', width: '100%' }}>
      {/* 封面 + 头像 */}
      <div style={{ position: 'relative', height: 128, background: `linear-gradient(135deg, ${t.acc}, ${t.acc}77)`, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 14, right: 16, fontStyle: 'italic', fontWeight: 800, fontSize: 18, color: '#ffffffcc', fontFamily: "'Helvetica Neue','Arial','PingFang SC',sans-serif", letterSpacing: '0.01em' }}>ref-impl</div>
      </div>
      <div style={{ padding: '0 18px', marginTop: -38, position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14 }}>
          <div className="tap" onClick={() => setScreen('avatars')} style={{ flexShrink: 0, cursor: 'pointer', borderRadius: '50%', padding: 3, background: t.isDark ? '#26262b' : '#ffffff' }}>
            {meUrl
              ? <img src={meUrl} alt="" style={{ width: 76, height: 76, borderRadius: '50%', objectFit: 'cover', display: 'block', backgroundColor: t.isDark ? '#26262b' : '#ffffff' }} />
              : <div style={{ width: 76, height: 76, borderRadius: '50%', background: `linear-gradient(135deg,${t.acc},${t.text2 || t.acc})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 30, fontWeight: 600, fontFamily: 'inherit' }}>晏</div>}
          </div>
          <div style={{ flex: 1, minWidth: 0, paddingBottom: 6 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: t.text1, fontFamily: 'inherit' }}>小满</div>
            <div style={{ fontSize: 11, color: t.text3, marginTop: 2, fontFamily: 'inherit' }}>@yan · 参考实现</div>
          </div>
        </div>

        {/* 签名（可编辑） */}
        <div style={{ marginTop: 12 }}>
          {editSign ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <input autoFocus value={signDraft} onChange={e => setSignDraft(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveSign()} maxLength={40} style={{ flex: 1, fontSize: 13, padding: '8px 10px', border: `1px solid ${t.border}`, borderRadius: 8, background: 'transparent', color: t.text1, fontFamily: 'inherit', minWidth: 0 }} />
              <span className="tap" onClick={saveSign} style={{ fontSize: 13, color: '#fff', background: t.acc, cursor: 'pointer', padding: '8px 16px', borderRadius: 8, whiteSpace: 'nowrap' }}>保存</span>
            </div>
          ) : (
            <div className="tap" onClick={() => { setSignDraft(sign); setEditSign(true); }} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <span style={{ fontSize: 13, color: t.text2, fontFamily: 'inherit', fontStyle: 'italic' }}>{sign}</span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={t.text3} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.6 }}><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            </div>
          )}
        </div>

        {/* 统计 */}
        <div style={{ display: 'flex', marginTop: 16, marginBottom: 6, borderRadius: 14, overflow: 'hidden', border: `0.5px solid ${t.border}`, backgroundColor: t.isGlass ? 'rgba(255,255,255,0.2)' : t.card }}>
          {[['动态', myMoments == null ? '–' : myMoments, 'moments'], ['同居', CHARACTERS.length, 'contacts'], ['记忆', '长河', 'memory']].map(([l, v, scr], i) => (
            <div key={l} className="tap" onClick={() => setScreen(scr)} style={{ flex: 1, textAlign: 'center', padding: '12px 0', cursor: 'pointer', borderLeft: i > 0 ? `0.5px solid ${t.border}` : 'none' }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: t.text1, fontFamily: 'inherit' }}>{v}</div>
              <div style={{ fontSize: 10, color: t.text3, marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>

        {/* 分组菜单 */}
        {groups.map(g => (
          <div key={g.title} style={{ marginTop: 18 }}>
            <div style={{ fontSize: 10, color: t.text3, letterSpacing: '0.1em', margin: '0 4px 8px' }}>{g.title}</div>
            <div style={{ borderRadius: 16, overflow: 'hidden', border: `0.5px solid ${t.border}`, backgroundColor: t.isGlass ? 'rgba(255,255,255,0.2)' : t.card, backdropFilter: `blur(${t.blur})` }}>
              {g.items.map((m, i) => (
                <div key={m.id} className="tap" onClick={() => setScreen(m.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: 'pointer', borderTop: i > 0 ? `0.5px solid ${t.border}` : 'none' }}>
                  <span style={{ width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><FeatIcon id={m.id} color={t.text2} size={19} /></span>
                  <span style={{ flex: 1, fontSize: 14, color: t.text1, fontFamily: 'inherit', textAlign: 'left' }}>{m.label}</span>
                  <span style={{ fontSize: 16, color: t.text3, opacity: 0.4 }}>›</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 角色资料页（对齐小祁/微信「联系人详情」）：头像/备注/聊天背景/免打扰/置顶/人物设定 + 发消息·深聊
const CHAR_BIO = {
  yu: '克制、清醒，话不多但句句落地。把在意藏在细节里。',
};
// 自建角色：添加（人设可含 NSFW、可不喜欢小满）/ 列表 / 删除 / 进聊天
function CustomCharsPage({ t, onChat, onBack }) {
  const [, force] = useState(0);
  useEffect(() => { const fn = () => force(n => n + 1); _customSubs.add(fn); loadCustomChars(); return () => { _customSubs.delete(fn); }; }, []);
  const [show, setShow] = useState(false);
  const [name, setName] = useState(''); const [persona, setPersona] = useState(''); const [relation, setRelation] = useState(''); const [accent, setAccent] = useState('#8a8a8e'); const [busy, setBusy] = useState(false);
  const ACCENTS = ['#8a8a8e', '#d4a373', '#8a9ea7', '#8e9d7d', '#a288b6', '#c0607a', '#5b8a72', '#c98d5a'];
  const add = async () => {
    if (!name.trim() || busy) return; setBusy(true);
    try { await fetch(`${BACKEND}/custom-characters`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), persona: persona.trim(), relation: relation.trim(), accent }) }); loadCustomChars(); setShow(false); setName(''); setPersona(''); setRelation(''); setAccent('#8a8a8e'); } catch {}
    setBusy(false);
  };
  const del = async (id) => { try { await fetch(`${BACKEND}/custom-characters/${id}`, { method: 'DELETE' }); loadCustomChars(); } catch {} };
  const inputStyle = styleInput(t, { marginBottom: 10 });
  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', maxWidth: 440, margin: '0 auto', width: '100%', textAlign: 'left' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="tap" onClick={onBack} style={{ fontSize: 26, color: t.text2, cursor: 'pointer', width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>‹</span>
          <span style={{ fontSize: 18, fontWeight: 600, color: t.text1, fontFamily: 'inherit' }}>自建角色</span>
        </div>
        <span className="tap" onClick={() => setShow(s => !s)} style={{ fontSize: 13, color: '#fff', background: t.acc, padding: '7px 14px', borderRadius: 999, cursor: 'pointer' }}>{show ? '收起' : '＋ 添加'}</span>
      </div>
      <div style={{ padding: '0 16px 28px' }}>
        {show && (
          <div style={{ borderRadius: 14, border: `0.5px solid ${t.border}`, background: t.isGlass ? 'rgba(255,255,255,0.2)' : t.card, padding: 16, marginBottom: 18 }}>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="名字（必填）" maxLength={20} style={inputStyle} />
            <textarea value={persona} onChange={e => setPersona(e.target.value)} placeholder="人物设定：性格、说话方式、背景、和你的关系/态度……（决定他怎么说话；可写 NSFW；不一定要喜欢你）" rows={6} className="hs" style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
            <input value={relation} onChange={e => setRelation(e.target.value)} placeholder="一句话关系/称呼（选填，如：高冷学长 / 看不上你的对家）" maxLength={60} style={inputStyle} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: t.text3 }}>主题色</span>
              {ACCENTS.map(a => <span key={a} className="tap" onClick={() => setAccent(a)} style={{ width: 22, height: 22, borderRadius: '50%', background: a, cursor: 'pointer', border: accent === a ? `2px solid ${t.text1}` : '2px solid transparent' }} />)}
            </div>
            <button className="tap" onClick={add} disabled={busy} style={{ width: '100%', padding: '11px', fontSize: 14, fontWeight: 600, color: '#fff', background: busy ? t.text3 : t.acc, border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}>{busy ? '创建中…' : '创建角色'}</button>
          </div>
        )}
        {_customChars.length === 0 && !show && <div style={{ fontSize: 12, color: t.text3, textAlign: 'center', padding: '36px 0', lineHeight: 1.8 }}>还没有自建角色。<br />点右上「＋ 添加」造一个吧。</div>}
        {_customChars.map(c => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 8px', borderBottom: `0.5px solid ${t.border}` }}>
            <div className="tap" onClick={() => onChat(c.id)} style={{ cursor: 'pointer', flexShrink: 0 }}><CharAvatar c={customCharObj(c)} size={46} /></div>
            <div className="tap" onClick={() => onChat(c.id)} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: t.text1, fontFamily: 'inherit' }}>{c.name}</div>
              <div style={{ fontSize: 11, color: t.text3, fontFamily: 'inherit', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.relation || (c.persona || '').slice(0, 30) || '自建角色'}</div>
            </div>
            <span className="tap" onClick={() => del(c.id)} style={{ fontSize: 13, color: '#D95A5A', cursor: 'pointer', padding: '4px 8px' }}>删除</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CharProfilePage({ t, charId, onBack, onChat, setScreen }) {
  const c = CHARACTERS.find(x => x.id === charId) || CHARACTERS[0];
  const [, force] = useState(0);
  const rerender = () => force(n => n + 1);
  const [editRemark, setEditRemark] = useState(false);
  const [remarkText, setRemarkText] = useState(getRemark(c.id));
  const [showPersona, setShowPersona] = useState(false);
  const bgInputRef = useRef(null);
  const acc = c.accent || t.acc;
  const card = { borderRadius: 14, overflow: 'hidden', border: `0.5px solid ${t.border}`, backgroundColor: t.isGlass ? 'rgba(255,255,255,0.2)' : t.card, backdropFilter: `blur(${t.blur})`, marginBottom: 14 };
  const Row = ({ label, value, onClick, right, last }) => (
    <div className="tap" onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', cursor: onClick ? 'pointer' : 'default', borderTop: last === 'first' ? 'none' : `0.5px solid ${t.border}` }}>
      <span style={{ flex: 1, fontSize: 14, color: t.text1, fontFamily: 'inherit' }}>{label}</span>
      {value != null && <span style={{ fontSize: 13, color: t.text3, fontFamily: 'inherit', maxWidth: 170, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'right' }}>{value}</span>}
      {right}
      {onClick && !right && <span style={{ fontSize: 16, color: t.text3, opacity: 0.4 }}>›</span>}
    </div>
  );
  const Toggle = ({ on }) => (
    <span style={{ width: 40, height: 23, borderRadius: 12, background: on ? acc : t.border, position: 'relative', transition: 'background .2s', flexShrink: 0 }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 19 : 2, width: 19, height: 19, borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
    </span>
  );
  const pickBg = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = ev => { setChatBg(c.id, ev.target.result); rerender(); };
    rd.readAsDataURL(f);
    e.target.value = '';
  };
  const saveRemark = () => { setRemark(c.id, remarkText.trim()); setEditRemark(false); rerender(); };
  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', maxWidth: 440, margin: '0 auto', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 8px 4px' }}>
        <span className="tap" onClick={onBack} style={{ fontSize: 28, color: t.text2, cursor: 'pointer', width: 40, height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>‹</span>
      </div>
      <div style={{ padding: '0 16px 28px' }}>
        {/* 头部卡：头像 + 名/备注 + en */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '6px 4px 20px' }}>
          <div className="tap" onClick={() => setScreen('avatars')} style={{ cursor: 'pointer', flexShrink: 0 }}><CharAvatar c={c} size={62} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 600, color: t.text1, fontFamily: 'inherit' }}>{getRemark(c.id) || c.name}</div>
            <div style={{ fontSize: 12, color: t.text3, marginTop: 3, fontFamily: 'inherit' }}>
              {getRemark(c.id) ? `昵称：${c.name} · ` : ''}{c.en}
            </div>
          </div>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: acc, flexShrink: 0 }} />
        </div>

        {/* 备注 + 朋友圈 */}
        <div style={card}>
          {editRemark ? (
            <div style={{ padding: '12px 16px' }}>
              <div style={{ fontSize: 12, color: t.text3, marginBottom: 6 }}>设置备注名</div>
              <input autoFocus value={remarkText} onChange={e => setRemarkText(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveRemark()} placeholder={c.name} style={{ width: '100%', fontSize: 14, padding: '8px 10px', border: `1px solid ${t.border}`, borderRadius: 8, background: 'transparent', color: t.text1, fontFamily: 'inherit', boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
                <span className="tap" onClick={() => { setRemarkText(getRemark(c.id)); setEditRemark(false); }} style={{ fontSize: 13, color: t.text3, cursor: 'pointer', padding: '5px 12px' }}>取消</span>
                <span className="tap" onClick={saveRemark} style={{ fontSize: 13, color: '#fff', background: acc, cursor: 'pointer', padding: '5px 16px', borderRadius: 8 }}>保存</span>
              </div>
            </div>
          ) : (
            <Row label="备注名" value={getRemark(c.id) || '未设置'} onClick={() => { setRemarkText(getRemark(c.id)); setEditRemark(true); }} last="first" />
          )}
          <Row label="朋友圈" onClick={() => setScreen('moments')} />
        </div>

        {/* 人物设定（资料 ≠ 设定 的说明 + 简介） */}
        <div style={card}>
          <Row label="人物设定 / 资料" value={showPersona ? '收起' : '查看'} onClick={() => setShowPersona(s => !s)} last="first" right={<span style={{ fontSize: 16, color: t.text3, opacity: 0.4 }}>{showPersona ? '⌃' : '›'}</span>} />
          {showPersona && (
            <div style={{ padding: '4px 16px 16px', borderTop: `0.5px solid ${t.border}` }}>
              <div style={{ fontSize: 13, color: t.text2, lineHeight: 1.7, fontFamily: 'inherit', paddingTop: 10 }}>{CHAR_BIO[c.id] || '—'}</div>
            </div>
          )}
          {c.id === 'yu' && <Row label="编辑屿的人设（灵魂层）" onClick={() => setScreen('yupersona')} />}
        </div>

        {/* 聊天偏好 */}
        <div style={card}>
          <Row label="聊天背景" value={getChatBg(c.id) ? '已设置' : '默认'} onClick={() => bgInputRef.current?.click()} last="first" />
          {getChatBg(c.id) && <Row label="清除聊天背景" onClick={() => { setChatBg(c.id, ''); rerender(); }} right={<span />} />}
          <Row label="消息免打扰" onClick={() => { setChatPref(c.id, 'mute', !getChatPref(c.id, 'mute')); rerender(); }} right={<Toggle on={getChatPref(c.id, 'mute')} />} />
          <Row label="置顶聊天" onClick={() => { setChatPref(c.id, 'pin', !getChatPref(c.id, 'pin')); rerender(); }} right={<Toggle on={getChatPref(c.id, 'pin')} />} />
        </div>
        <input ref={bgInputRef} type="file" accept="image/*" onChange={pickBg} style={{ display: 'none' }} />

        {/* 操作按钮 */}
        <div className="tap" onClick={() => onChat(c.id, 'short')} style={{ marginTop: 6, textAlign: 'center', padding: '14px 0', borderRadius: 14, background: acc, color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', boxShadow: `0 4px 14px ${acc}44` }}>发消息</div>
        <div className="tap" onClick={() => onChat(c.id, 'long')} style={{ marginTop: 10, textAlign: 'center', padding: '13px 0', borderRadius: 14, background: 'transparent', color: t.text2, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', border: `0.5px solid ${t.border}` }}>进入深聊</div>
      </div>
    </div>
  );
}

function LifeTickPage({ t }) {
  const [charStates, setCharStates] = useState([]);
  const [loading, setLoading] = useState(true);
  const CHAR_NAMES = { yu: '沈屿' };
  const CHAR_COLORS = { yu: '#e0879f' };
  const CHAR_EN = { yu: 'Yu' };

  useEffect(() => {
    fetch(`${BACKEND}/char-states`).then(r => r.json()).then(d => { setCharStates(d?.states || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: t.text3 }}>...</div>;

  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', padding: '16px 16px 24px', maxWidth: 440, margin: '0 auto', width: '100%' }}>
      <div style={{ fontSize: 10, color: t.text3, letterSpacing: '0.14em', marginBottom: 4 }}>LIFETICK</div>
      <div style={{ fontSize: 18, fontWeight: 400, color: t.text1, marginBottom: 20, fontFamily: 'inherit' }}>心跳</div>
      {['yu'].map(cid => {
        const st = charStates.find(s => s.character_id === cid);
        const ago = st?.updated_at ? Math.round((Date.now() - new Date(st.updated_at)) / 60000) : null;
        return (
          <Card key={cid} t={t} style={{ padding: '18px 16px', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <CharAvatar c={cid} size={36} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: t.text1, fontFamily: 'inherit' }}>{CHAR_NAMES[cid]}</div>
                <div style={{ fontSize: 10, color: t.text3 }}>{CHAR_EN[cid]}</div>
              </div>
              {ago !== null && <span style={{ fontSize: 10, color: t.text3 }}>{ago < 60 ? `${ago}m ago` : `${Math.floor(ago/60)}h ago`}</span>}
            </div>
            {st ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1, padding: '8px 10px', borderRadius: t.radius > 0 ? 10 : 0, backgroundColor: `${CHAR_COLORS[cid]}08`, border: `0.5px solid ${t.border}` }}>
                    <div style={{ fontSize: 9, color: t.text3, letterSpacing: '0.08em', marginBottom: 3 }}>ACTIVITY</div>
                    <div style={{ fontSize: 12, color: t.text1, fontFamily: 'inherit' }}>{st.activity || '—'}</div>
                  </div>
                  <div style={{ flex: 1, padding: '8px 10px', borderRadius: t.radius > 0 ? 10 : 0, backgroundColor: `${CHAR_COLORS[cid]}08`, border: `0.5px solid ${t.border}` }}>
                    <div style={{ fontSize: 9, color: t.text3, letterSpacing: '0.08em', marginBottom: 3 }}>MOOD</div>
                    <div style={{ fontSize: 12, color: t.text1, fontFamily: 'inherit' }}>{st.mood || '—'}</div>
                  </div>
                </div>
                {(st.valence !== undefined || st.arousal !== undefined) && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1, padding: '8px 10px', borderRadius: t.radius > 0 ? 10 : 0, border: `0.5px solid ${t.border}` }}>
                      <div style={{ fontSize: 9, color: t.text3, marginBottom: 3 }}>V / A</div>
                      <div style={{ fontSize: 12, color: t.text1 }}>{st.valence ?? '—'} / {st.arousal ?? '—'}</div>
                    </div>
                  </div>
                )}
                {st.monologue && (
                  <div style={{ padding: '10px 12px', borderRadius: t.radius > 0 ? 10 : 0, borderLeft: `3px solid ${CHAR_COLORS[cid]}`, backgroundColor: `${CHAR_COLORS[cid]}06` }}>
                    <div style={{ fontSize: 9, color: t.text3, letterSpacing: '0.08em', marginBottom: 4 }}>INNER MONOLOGUE</div>
                    <div style={{ fontSize: 12, color: t.text2, lineHeight: 1.8, fontStyle: 'italic', fontFamily: 'inherit' }}>"{st.monologue}"</div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: t.text3, fontStyle: 'italic' }}>暂无心跳数据</div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function HomePage({ themeIdx, setThemeIdx, t, onChat, globalNote, noteFetching, fetchGlobalNote, globalStatuses, globalTodos, toggleGlobalTodo, addGlobalTodo, deleteGlobalTodo, onMoodToChat, pushState, setPushState, enablePush, hideGlobalTodo, setScreen }) {
  const [newTodo, setNewTodo] = useState('');
  const [pushBusy, setPushBusy] = useState(false);
  const [wxCity, setWxCity] = useState('');
  const [editLoc, setEditLoc] = useState(false);
  const [locInput, setLocInput] = useState('');
  const [wxKey, setWxKey] = useState(0);
  const saveLoc = async () => {
    const c = locInput.trim();
    if (!c) { setEditLoc(false); return; }
    try { const r = await fetch(`${BACKEND}/location`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ city: c }) }); const d = await r.json(); if (d && d.city) { setWxCity(d.city); setWxKey(k => k + 1); } } catch {}
    setEditLoc(false);
  };
  const days = Math.floor((Date.now() - new Date('2026-06-20')) / 86400000) + 1;
  const cnHr = new Date(Date.now() + 8 * 3600 * 1000).getUTCHours();
  const greeting = cnHr < 5 ? '夜深了' : cnHr < 9 ? '早安' : cnHr < 12 ? '上午好' : cnHr < 14 ? '午安' : cnHr < 18 ? '下午好' : cnHr < 23 ? '晚上好' : '夜深了';
  const skyEmoji = cnHr >= 6 && cnHr < 18 ? '☀️' : cnHr >= 18 && cnHr < 20 ? '🌇' : '🌙';
  const quickEntries = [
    { id: 'moments', icon: '📸', label: '朋友圈' },
    { id: 'mood', icon: '🌙', label: '日记' },
    { id: 'book', icon: '📖', label: '看书' },
    { id: 'privatelife', icon: '📔', label: '日记' },
  ];

  const handleEnablePush = async () => {
    setPushBusy(true);
    const r = await enablePush();
    setPushBusy(false);
    if (r === 'denied') alert('通知被浏览器拒绝了。请到浏览器的「网站设置 → 通知」里手动允许，再回来点一次。\niPhone 需先把网页「添加到主屏幕」，从主屏图标打开才能开启推送。');
    else if (r === 'unsupported') alert('当前浏览器不支持推送。iPhone 请先「添加到主屏幕」，从主屏打开。');
  };

  const addTodo = () => { if (!newTodo.trim()) return; addGlobalTodo(newTodo); setNewTodo(''); };

  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', padding: '20px 16px 24px', maxWidth: 440, margin: '0 auto', width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
        <div>
          <p style={{ fontSize: 10, color: t.text3, letterSpacing: '0.1em', margin: '0 0 4px' }}>{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Asia/Shanghai' }).toUpperCase()}</p>
          <h1 style={{ fontSize: 30, fontWeight: 800, fontStyle: 'italic', color: t.text1, margin: 0, fontFamily: "'Helvetica Neue', 'Arial', 'PingFang SC', sans-serif", letterSpacing: '-0.01em', lineHeight: 1 }}>ref-impl</h1>
          <div style={{ fontSize: 11, color: t.text3, letterSpacing: '0.42em', marginTop: 2, fontFamily: "'Songti SC','Noto Serif SC',serif" }}>弥 温</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {/* 主题快切圆点已从主页移除（太长）；主题入口保留在 设置/发现 → 主题。 */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, justifyContent: 'flex-end' }}>
            <span style={{ fontSize: 28, fontWeight: t.isPixel ? 700 : 300, color: t.text1, lineHeight: 1 }}>{days}</span>
            <span style={{ fontSize: 9, color: t.text3 }}>days</span>
          </div>
        </div>
      </div>

      {pushState && pushState !== 'granted' && pushState !== 'unsupported' && pushState !== 'dismissed' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', marginBottom: 14, borderRadius: t.radius > 0 ? 12 : 0, backgroundColor: `${t.acc}0a`, border: `0.5px solid ${t.acc}20` }}>
          <span className="tap" onClick={handleEnablePush} style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, cursor: 'pointer' }}>
            <span style={{ fontSize: 13 }}>🔔</span>
            <span style={{ flex: 1, fontSize: 11, color: t.text2, fontFamily: 'inherit' }}>开启推送通知</span>
            <span style={{ fontSize: 10, color: t.acc, fontWeight: 600 }}>{pushBusy ? '...' : '开启'}</span>
          </span>
          <span className="tap" onClick={() => { localStorage.setItem('push_prompt_dismissed', '1'); setPushState('dismissed'); }} style={{ fontSize: 14, color: t.text3, cursor: 'pointer', padding: '0 4px', opacity: 0.5 }}>×</span>
        </div>
      )}

      {/* 天气 + 问候 */}
      <Card t={t} style={{ padding: '14px 16px', marginBottom: 14 }}>
        {editLoc ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <input autoFocus value={locInput} onChange={e => setLocInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveLoc(); }} placeholder="你在哪个城市" style={{ flex: 1, fontSize: 12, padding: '4px 8px', border: `1px solid ${t.border}`, borderRadius: 8, background: 'transparent', color: t.text1, fontFamily: 'inherit', outline: 'none' }} />
            <span className="tap" onClick={saveLoc} style={{ fontSize: 12, color: t.acc, fontWeight: 600, cursor: 'pointer' }}>✓</span>
            <span className="tap" onClick={() => setEditLoc(false)} style={{ fontSize: 13, color: t.text3, cursor: 'pointer' }}>×</span>
          </div>
        ) : (
          <div className="tap" onClick={() => { setLocInput(wxCity || ''); setEditLoc(true); }} style={{ fontSize: 9, color: t.text3, letterSpacing: '0.12em', marginBottom: 8, cursor: 'pointer' }}>{wxCity || '设置城市'} · {greeting}</div>
        )}
        <WeatherWidget t={t} onCity={setWxCity} refreshKey={wxKey} />
      </Card>

      {/* LIVE STATUS */}
      <Card t={t} style={{ padding: '14px 16px', marginBottom: 14 }}>
        <div style={{ fontSize: 9, color: t.text3, letterSpacing: '0.12em', marginBottom: 12 }}>LIVE STATUS</div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          {globalStatuses.map(c => (
            <div key={c.id} className="tap" onClick={() => onChat(c.id)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer', flex: 1 }}>
              <div style={{ position: 'relative', width: 42, height: 42 }}>
                <CharAvatar c={c} size={42} />
                <span style={{ position: 'absolute', bottom: -1, right: -1, width: 8, height: 8, borderRadius: '50%', backgroundColor: '#4ade80', border: `1.5px solid ${t.card}` }} />
              </div>
              <div style={{ textAlign: 'center', width: '100%' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: t.text1, fontFamily: 'inherit' }}>{c.name}</div>
                <div style={{ fontSize: 9, color: t.text3, lineHeight: 1.35, marginTop: 2, maxWidth: 82, wordBreak: 'break-word', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', margin: '2px auto 0' }}>{c.status}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* 快捷入口 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {quickEntries.map(q => (
          <div key={q.id} className="tap" onClick={() => setScreen(q.id)} style={{ flex: 1, textAlign: 'center', padding: '11px 0', borderRadius: t.radius > 0 ? 14 : 0, cursor: 'pointer', backgroundColor: t.isGlass ? 'rgba(255,255,255,0.18)' : t.card, border: `0.5px solid ${t.border}`, backdropFilter: `blur(${t.blur})`, WebkitBackdropFilter: `blur(${t.blur})`, boxShadow: t.isGlass ? t.cardGlow : '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 20 }}>{q.icon}</div>
            <div style={{ fontSize: 9, color: t.text3, marginTop: 3, fontFamily: 'inherit' }}>{q.label}</div>
          </div>
        ))}
      </div>

      {/* Note */}
      <Card t={t} style={{ padding: '14px 16px', marginBottom: 14, cursor: 'pointer' }} onClick={fetchGlobalNote}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 9, color: t.text3, letterSpacing: '0.08em' }}>{globalNote.author} 的树洞</span>
          <span style={{ fontSize: 9, color: t.acc, opacity: 0.5 }}>{noteFetching ? '...' : '↻'}</span>
        </div>
        <p style={{ fontSize: 13, color: t.text1, lineHeight: 1.8, margin: 0, fontFamily: 'inherit' }} key={globalNote.text}>{globalNote.text}</p>
      </Card>

      {/* Todo — left aligned, swipe left to hide */}
      <Card t={t} style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: 9, color: t.text3, letterSpacing: '0.08em', marginBottom: 8 }}>TODO</div>
        <div className="hs" style={{ maxHeight: 176, overflowY: 'auto', margin: '0 -4px', padding: '0 4px' }}>
        {globalTodos.filter(td => !td.hidden).sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0)).map(td => {
          const swipeRef = { startX: 0 };
          return (
            <div key={td.id} style={{ overflow: 'hidden' }}
              onTouchStart={e => { swipeRef.startX = e.touches[0].clientX; }}
              onTouchEnd={e => {
                const dx = e.changedTouches[0].clientX - swipeRef.startX;
                if (dx < -80) hideGlobalTodo(td.id);
              }}>
              <div onClick={() => toggleGlobalTodo(td.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer' }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', flexShrink: 0, border: `1.5px solid ${td.done ? t.acc : t.border}`, backgroundColor: td.done ? `${t.acc}22` : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {td.done && <div style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: t.acc }} />}
                </div>
                <span style={{ fontSize: 12, color: td.done ? t.text3 : t.text1, textDecoration: td.done ? 'line-through' : 'none', fontFamily: 'inherit', textAlign: 'left' }}>{td.text}</span>
              </div>
            </div>
          );
        })}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input value={newTodo} onChange={e => setNewTodo(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTodo()} placeholder="+ 添加" style={{ flex: 1, fontSize: 12, padding: '5px 0', border: 'none', backgroundColor: 'transparent', outline: 'none', color: t.text1, fontFamily: 'inherit' }} />
          {newTodo.trim() && <button className="tap" onClick={addTodo} style={{ padding: '3px 10px', backgroundColor: t.acc, color: '#fff', border: 'none', borderRadius: t.radius > 0 ? 12 : 0, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>+</button>}
        </div>
      </Card>
    </div>
  );
}

function FeaturesPage({ t, setScreen, onDeepTalk }) {
  const cards = [
    { id: 'book', icon: '📖', title: '一起看书', desc: '哲学 · 人文 · 文学共读', size: 'lg' },
    { id: 'deeptalk', icon: '🌌', title: '深聊', desc: '长谈 · 不限字数', size: 'md' },
    { id: 'story', icon: '🪶', title: 'Story Mode', desc: '诗意片段共写', size: 'md' },
    { id: 'moments', icon: '📸', title: '朋友圈', desc: '日常碎碎念', size: 'md' },
    { id: 'memory', icon: '🪷', title: '漫漫长河', desc: '他们记得的一切', size: 'lg' },
    { id: 'todo', icon: '📝', title: '待办清单', desc: '小事簿', size: 'sm' },
    { id: 'lifetick', icon: '💓', title: '心跳', desc: '此刻在做什么', size: 'md' },
    { id: 'emotions', icon: '🌊', title: '潮汐心海', desc: '情绪的涨落与回响', size: 'lg' },
    { id: 'question', icon: '💌', title: '今日一问', desc: '今天想问你', size: 'sm' },
    { id: 'privatelife', icon: '📔', title: '屿的日记', desc: '他写给自己的心里话', size: 'md' },
    { id: 'mood', icon: '🌙', title: '日记', desc: '写下今天', size: 'sm' },
    { id: 'timeline', icon: '📜', title: '时间线', desc: '故事轨迹', size: 'md' },
    { id: 'voicesettings', icon: '🎙️', title: '声音设置', desc: '调他们的嗓音', size: 'sm' },
    { id: 'share', icon: '🎧', title: '一起听', desc: '连麦 · 共享', size: 'sm' },
    { id: 'pomodoro', icon: '🍅', title: '番茄钟', desc: '专注 · 陪伴', size: 'md' },
    { id: 'period', icon: '🌸', title: '周期', desc: '经期 · 补剂', size: 'md' },
    { id: 'nest', icon: '🏠', title: '小窝', desc: '推门看看他', size: 'md' },
    { id: 'ledger', icon: '🪙', title: '记账', desc: '小账本', size: 'sm' },
    { id: 'wallet', icon: '🧧', title: '钱包', desc: '转账 · 红包 · 亲属卡', size: 'md' },
    { id: 'avatars', icon: '🖼️', title: '角色头像', desc: '换成你的图', size: 'sm' },
  ];
  const SZ = {
    lg: { minHeight: 152, icon: 38, title: 15, pad: '24px 16px' },
    md: { minHeight: 116, icon: 30, title: 14, pad: '18px 14px' },
    sm: { minHeight: 88, icon: 23, title: 13, pad: '14px 12px' },
  };
  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', padding: '24px 18px', maxWidth: 440, margin: '0 auto', width: '100%' }}>
      <div style={{ fontSize: 10, color: t.text3, letterSpacing: '0.14em', marginBottom: 18 }}>EXPLORE</div>
      <div style={{ columnCount: 2, columnGap: 12 }}>
        {cards.map(c => { const s = SZ[c.size]; return (
          <Card key={c.id} t={t} onClick={() => c.id === 'deeptalk' ? onDeepTalk?.() : setScreen(c.id)} className="tap" style={{
            minHeight: s.minHeight, padding: s.pad, display: 'flex', flexDirection: 'column',
            alignItems: 'center', textAlign: 'center', cursor: 'pointer', marginBottom: 12,
            breakInside: 'avoid', WebkitColumnBreakInside: 'avoid',
          }}>
            <div style={{ fontSize: s.icon, marginBottom: 8, flexShrink: 0 }}>{c.icon}</div>
            <div style={{ fontSize: s.title, fontWeight: t.isPixel ? 700 : 600, color: t.text1, marginBottom: 4, fontFamily: 'inherit' }}>{c.title}</div>
            <div style={{ fontSize: 10, color: t.text3, fontFamily: 'inherit', lineHeight: 1.4 }}>{c.desc}</div>
          </Card>
        ); })}
      </div>
    </div>
  );
}

function WalletPage({ t, onChat }) {
  const [events, setEvents] = useState(null);
  useEffect(() => {
    fetch(`${BACKEND}/wallet/feed`).then(r => r.json()).then(d => setEvents(d.events || [])).catch(() => setEvents([]));
  }, []);
  const CN = { transfer: '转账', redpacket: '红包', familycard: '亲属卡' };
  const recv = (events || []).filter(e => e.direction === 'to_user' && e.kind !== 'familycard').reduce((a, e) => a + Number(e.amount || 0), 0);
  const sent = (events || []).filter(e => e.direction === 'to_char' && e.kind !== 'familycard').reduce((a, e) => a + Number(e.amount || 0), 0);
  const fmt = (ts) => { try { const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; } catch { return ''; } };
  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', padding: '20px 16px 48px', maxWidth: 480, margin: '0 auto', width: '100%' }}>
      <h2 style={{ fontSize: 22, fontWeight: t.isPixel ? 700 : 400, color: t.text1, margin: '0 0 4px', fontFamily: 'inherit' }}>钱包</h2>
      <div style={{ height: 12 }} />
      <Card t={t} style={{ padding: '16px 18px', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: t.acc }}>¥{recv}</div>
            <div style={{ fontSize: 10, color: t.text3, marginTop: 3 }}>收到的心意</div>
          </div>
          <div style={{ width: 1, height: 30, background: t.border }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: t.text1 }}>¥{sent}</div>
            <div style={{ fontSize: 10, color: t.text3, marginTop: 3 }}>给他们的</div>
          </div>
        </div>
      </Card>
      <div style={{ fontSize: 11, color: t.text3, letterSpacing: '0.08em', marginBottom: 10 }}>流水</div>
      {events === null && <p style={{ fontSize: 12, color: t.text3, textAlign: 'center', marginTop: 24, fontFamily: 'inherit' }}>加载中…</p>}
      {events && events.length === 0 && <p style={{ fontSize: 12, color: t.text3, textAlign: 'center', marginTop: 24, lineHeight: 1.9, fontFamily: 'inherit' }}>还没有往来。<br />去聊天里点 🧧 给他们发个红包试试～</p>}
      {(events || []).map(e => {
        const ch = CHARACTERS.find(c => c.id === e.char_id);
        const fromChar = e.direction === 'to_user';
        return (
          <div key={e.id} className="tap" onClick={() => onChat?.(e.char_id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 4px', borderBottom: `1px solid ${t.border}`, cursor: 'pointer' }}>
            {ch && <CharAvatar c={ch} size={36} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: t.text1, fontFamily: 'inherit' }}>{fromChar ? `${ch?.name || e.char_id} 发来${CN[e.kind] || ''}` : `给 ${ch?.name || e.char_id} 的${CN[e.kind] || ''}`}</div>
              <div style={{ fontSize: 10, color: t.text3, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.note ? `「${e.note}」 · ` : ''}{fmt(e.created_at)}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              {e.kind === 'familycard' ? (
                <>
                  <div style={{ fontSize: 14, fontWeight: 600, color: t.text2 }}>额度 ¥{e.amount}</div>
                  <div style={{ fontSize: 9, color: t.text3 }}>亲属卡 · 不计入收支</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 15, fontWeight: 600, color: fromChar ? '#e0533f' : t.text2 }}>{fromChar ? '+' : '-'}¥{e.amount}</div>
                  {e.kind === 'redpacket' && <div style={{ fontSize: 9, color: t.text3 }}>{e.status === 'opened' ? '已领取' : (fromChar ? '待领取' : '已发')}</div>}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AvatarManagePage({ t }) {
  const [urls, setUrls] = useState({});
  const [uploading, setUploading] = useState('');
  const [shape, setShape] = useState(getAvatarShape());
  const fileRefs = useRef({});
  const applyShape = (s) => { setShape(s); setAvatarShape(s); };
  useEffect(() => { fetch(`${BACKEND}/avatar/list`).then(r => r.json()).then(d => setUrls(d.avatars || {})).catch(() => {}); }, []);
  const onFile = (cid) => async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 6 * 1024 * 1024) { alert('图太大了，请压到 6MB 以内'); return; }
    setUploading(cid);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const r = await fetch(`${BACKEND}/avatar/upload`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ char_id: cid, image: ev.target.result, content_type: file.type }) });
        const d = await r.json();
        if (d.ok) { setUrls(prev => ({ ...prev, [cid]: d.url })); setAvatarUrl(cid, d.url); }
        else alert(d.error || '上传失败');
      } catch { alert('上传失败'); }
      setUploading('');
    };
    reader.readAsDataURL(file);
  };
  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', padding: '20px 18px 48px', maxWidth: 440, margin: '0 auto', width: '100%' }}>
      <h2 style={{ fontSize: 22, fontWeight: t.isPixel ? 700 : 400, color: t.text1, margin: '0 0 4px', fontFamily: 'inherit' }}>头像设置</h2>
      <p style={{ fontSize: 11, color: t.text3, marginBottom: 14, lineHeight: 1.6 }}>你自己 + 每个角色都能换图。建议用白底/方图，圆形头像会自动裁切。</p>
      {/* 头像形状：圆形 / 方形(四角微圆)，全 app 统一 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <span style={{ fontSize: 12, color: t.text2, fontFamily: 'inherit' }}>头像形状</span>
        <div style={{ display: 'inline-flex', border: `1px solid ${t.border}`, borderRadius: 999, overflow: 'hidden' }}>
          {[{ k: 'circle', label: '圆形' }, { k: 'square', label: '方形' }].map(o => (
            <span key={o.k} className="tap" onClick={() => applyShape(o.k)} style={{ padding: '6px 16px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', backgroundColor: shape === o.k ? t.acc : 'transparent', color: shape === o.k ? '#fff' : t.text2 }}>{o.label}</span>
          ))}
        </div>
      </div>
      {[{ id: 'me', name: '我（小满）', accent: t.acc }, ...CHARACTERS].map(c => (
        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 4px', borderBottom: `1px solid ${t.border}` }}>
          {urls[c.id]
            ? <img src={urls[c.id]} alt="" style={{ width: 52, height: 52, borderRadius: avatarRadius(52), objectFit: 'cover', display: 'block', flexShrink: 0 }} />
            : (c.id === 'me'
              ? <div style={{ width: 52, height: 52, borderRadius: avatarRadius(52), background: `linear-gradient(135deg,${t.acc},${t.text2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 20, fontWeight: 600, flexShrink: 0 }}>晏</div>
              : <CharAvatar c={c} size={52} />)}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: t.text1, fontFamily: 'inherit' }}>{c.name}</div>
            <div style={{ fontSize: 10, color: t.text3, marginTop: 2 }}>{urls[c.id] ? '已设置自定义头像' : (c.id === 'me' ? '点右边上传你的头像' : '当前为默认画风')}</div>
          </div>
          <input ref={el => (fileRefs.current[c.id] = el)} type="file" accept="image/*" onChange={onFile(c.id)} style={{ display: 'none' }} />
          <button className="tap" onClick={() => fileRefs.current[c.id]?.click()} disabled={uploading === c.id} style={{ padding: '8px 16px', fontSize: 12, borderRadius: 18, border: `1px solid ${c.accent}`, background: uploading === c.id ? `${c.accent}15` : 'transparent', color: c.accent, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>{uploading === c.id ? '上传中…' : (urls[c.id] ? '更换' : '上传')}</button>
        </div>
      ))}
      <p style={{ fontSize: 10, color: t.text3, marginTop: 16, lineHeight: 1.7 }}>圆形头像会把四角裁掉，角落水印基本看不到；想完全干净就传无水印版。</p>
    </div>
  );
}

const isModelThinking = m => /think|reason|opus/i.test(m.label) || /think|reason|opus/i.test(m.value);

// 消息时间格式：PM 2:13 / AM 9:46（贴合她的 Read · time 样式）
function fmtMsgTime(ts) {
  if (!ts) return '';
  let s = String(ts);
  // 朴素时间（无时区标记）按 UTC 解析，避免「角色时间和我差 8 小时」
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s) && !/[zZ]|[+\-]\d{2}:?\d{2}$/.test(s)) s = s.replace(' ', 'T') + 'Z';
  const d = new Date(s); if (isNaN(d.getTime())) return '';
  let h = d.getHours(); const m = String(d.getMinutes()).padStart(2, '0');
  const ap = h < 12 ? 'AM' : 'PM'; h = h % 12 || 12;
  return `${ap} ${h}:${m}`;
}

// ===== 钱包卡片（聊天里的微信式转账/红包/亲属卡）=====
function safeParseWallet(content) {
  if (typeof content !== 'string' || !content.startsWith('__WALLET__')) return null;
  try {
    const o = JSON.parse(content.slice('__WALLET__'.length));
    // 校验形状，避免用户手打 __WALLET__... 的文字被当成卡片、把真实消息吞掉
    if (!o || !['transfer', 'redpacket', 'familycard'].includes(o.w)) return null;
    if (!['to_user', 'to_char'].includes(o.dir)) return null;
    if (typeof o.amt !== 'number' || !isFinite(o.amt)) return null;
    return o;
  } catch { return null; }
}
const WALLET_META = {
  transfer: { cn: '转账', icon: '¥', grad: 'linear-gradient(135deg,#f7b733,#f0901d)' },
  redpacket: { cn: '红包', icon: '🧧', grad: 'linear-gradient(135deg,#f0594e,#dc3a2e)' },
  familycard: { cn: '亲属卡', icon: '💳', grad: 'linear-gradient(135deg,#f072a8,#e84890)' },
};
function WalletCard({ data, onOpen }) {
  const meta = WALLET_META[data.w] || WALLET_META.transfer;
  const fromChar = data.dir === 'to_user';
  const unopened = data.w === 'redpacket' && fromChar && data.st !== 'opened';
  const dim = data.w === 'redpacket' && fromChar && data.st === 'opened';   // 只有「收到并已领」才变暗
  const sub = data.w === 'familycard' ? `额度 ¥${data.amt}` : `¥${data.amt}`;
  const tail = data.w !== 'redpacket' ? '' : (fromChar ? (unopened ? ' · 点击领取' : ' · 已领取') : ' · 已发');
  return (
    <div className="tap" onClick={unopened ? onOpen : undefined} style={{ width: 226, borderRadius: 12, overflow: 'hidden', cursor: unopened ? 'pointer' : 'default', boxShadow: '0 2px 10px rgba(0,0,0,0.12)', opacity: dim ? 0.72 : 1 }}>
      <div style={{ background: meta.grad, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{meta.icon}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, color: '#fff', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.note || (data.w === 'transfer' ? (fromChar ? '给你转账' : '转账') : meta.cn)}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.9)', marginTop: 2 }}>{sub}{tail}</div>
        </div>
      </div>
      <div style={{ background: '#fff', padding: '5px 12px', fontSize: 9, color: '#c2b29c' }}>微信{meta.cn}</div>
    </div>
  );
}

// 定位卡（对齐小祁聊天「位置」卡片）
function safeParseLoc(content) {
  if (typeof content !== 'string' || !content.startsWith('__LOC__')) return null;
  try { const o = JSON.parse(content.slice('__LOC__'.length)); if (!o || !o.place) return null; return o; } catch { return null; }
}
function LocationCard({ data, t }) {
  return (
    <div style={{ width: 226, borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.12)', border: `0.5px solid ${t.border}` }}>
      <div style={{ height: 84, background: 'linear-gradient(135deg,#cfe0d8,#9fb9c9)', position: 'relative', overflow: 'hidden' }}>
        <svg width="100%" height="84" viewBox="0 0 226 84" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, opacity: 0.5 }}><path d="M0 50 L60 30 L120 55 L226 28" stroke="#fff" strokeWidth="2" fill="none"/><path d="M0 70 L80 55 L150 75 L226 50" stroke="#fff" strokeWidth="1.5" fill="none" opacity="0.7"/></svg>
        <div style={{ position: 'absolute', left: '50%', top: '42%', transform: 'translate(-50%,-50%)', fontSize: 26 }}>📍</div>
      </div>
      <div style={{ background: '#fff', padding: '9px 12px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#222', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.place}</div>
        {data.note && <div style={{ fontSize: 11, color: '#999', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.note}</div>}
      </div>
    </div>
  );
}

// 分享卡（角色分享的真实链接）：点击在新标签打开
function safeParseShare(content) {
  if (typeof content !== 'string' || !content.startsWith('__SHARE__')) return null;
  try { const o = JSON.parse(content.slice('__SHARE__'.length)); if (!o || !o.url) return null; return o; } catch { return null; }
}
function safeParseSong(content) {
  if (typeof content !== 'string' || !content.startsWith('__SONG__')) return null;
  try { const o = JSON.parse(content.slice('__SONG__'.length)); if (!o || !o.id) return null; return o; } catch { return null; }
}
// 网易云歌卡：封面+歌名+歌手；播放走代理 /api/music/url 拿直链→<audio>；拿不到/会员歌→降级 outchain 内嵌播放器+跳网易云
function SongCard({ data, t }) {
  const [playing, setPlaying] = useState(false);
  const [err, setErr] = useState('');
  const [url, setUrl] = useState(null);
  const [urlTried, setUrlTried] = useState(false);
  const [embed, setEmbed] = useState(false);   // 降级到 outchain iframe
  const audioRef = useRef(null);
  // 拿可播放直链（会员歌需后端 cookie，拿不到则 url=null→降级 iframe）
  const ensureUrl = async () => {
    if (urlTried) return url;
    setUrlTried(true);
    try { const r = await fetch(`${BACKEND}/api/music/url?id=${encodeURIComponent(data.id)}`); const d = await r.json(); if (d && d.url) { setUrl(d.url); return d.url; } } catch {}
    return null;
  };
  const toggle = async () => {
    const a = audioRef.current;
    if (playing) { if (a) a.pause(); setPlaying(false); return; }
    setErr('');
    const u = url || await ensureUrl();
    if (!u || !a) { setEmbed(true); return; }  // 没直链→内嵌播放器兜底
    a.play().then(() => setPlaying(true)).catch(() => { setEmbed(true); setPlaying(false); });
  };
  return (
    <div style={{ width: 248, borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.12)', border: `0.5px solid ${t.border}`, background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        <div style={{ width: 66, flexShrink: 0, background: '#f2f2f2', position: 'relative' }}>
          {data.cover && <img src={data.cover} alt="" referrerPolicy="no-referrer" loading="lazy" onError={(e) => { try { e.target.style.display = 'none'; } catch {} }} style={{ width: 66, height: 66, objectFit: 'cover', display: 'block' }} />}
          <div className="tap" onClick={toggle} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'rgba(0,0,0,0.22)' }}>
            <span style={{ fontSize: 22, color: '#fff', lineHeight: 1 }}>{playing ? '❚❚' : '▶'}</span>
          </div>
        </div>
        <div style={{ padding: '9px 11px', minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 9, color: '#c44', letterSpacing: '0.1em', marginBottom: 3 }}>♪ 网易云</div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1a1a1a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.name}</div>
          <div style={{ fontSize: 11, color: '#888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>{(data.artists || []).join(' / ')}{data.album ? ' · ' + data.album : ''}</div>
          <div className="tap" onClick={() => { try { window.open(data.link || `https://music.163.com/song?id=${data.id}`, '_blank', 'noopener'); } catch {} }} style={{ fontSize: 9.5, color: '#bbb', marginTop: 6, cursor: 'pointer' }}>{err || '在网易云打开 ›'}</div>
        </div>
      </div>
      {/* 直链播放器（拿到直链时） */}
      <audio ref={audioRef} src={url || undefined} preload="none" onEnded={() => setPlaying(false)} onError={() => { setEmbed(true); setPlaying(false); }} style={{ display: 'none' }} />
      {/* 降级：网易云官方内嵌播放器（会员歌也能出声） */}
      {embed && data.id && (
        <iframe title="ncm" frameBorder="0" width="248" height="52" src={`https://music.163.com/outchain/player?type=2&id=${data.id}&auto=1&height=32`} style={{ display: 'block', border: 'none' }} />
      )}
    </div>
  );
}
// 正文 [music:歌名 歌手] 标记 → 查 /api/music/search 取首条 → 渲染可播放歌卡
function MusicMarkerCard({ q, t }) {
  const [song, setSong] = useState(null);
  const [state, setState] = useState('loading');  // loading | ok | empty
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`${BACKEND}/api/music/search?q=${encodeURIComponent(q)}`);
        const d = await r.json();
        const s = (d && d.songs && d.songs[0]) || null;
        if (!alive) return;
        if (s && s.id != null) { setSong(s); setState('ok'); } else { setState('empty'); }
      } catch { if (alive) setState('empty'); }
    })();
    return () => { alive = false; };
  }, [q]);
  if (state === 'loading') return <div style={{ fontSize: 11, color: t.text3, fontStyle: 'italic', margin: '2px 0' }}>♪ 找歌中…</div>;
  if (state === 'empty' || !song) return <div style={{ fontSize: 11, color: t.text3, fontStyle: 'italic', margin: '2px 0' }}>♪ 没找到「{q}」</div>;
  return <SongCard data={{ id: song.id, name: song.name, artists: song.artists || [], album: song.album, cover: song.cover }} t={t} />;
}
function ShareCard({ data, t }) {
  const ex = data.extra || {};
  const src = data.source || '链接';
  const cover = ex.cover || ex.image || null;
  const icon = src === '维基百科' ? '📚' : src === 'B站' ? '📺' : src === '知乎' ? '💬'
    : src === '豆瓣' ? (ex.type === 'book' ? '📖' : ex.type === 'music' ? '🎵' : '🎬') : '🔗';
  const fmtNum = (n) => (n == null ? '' : n >= 10000 ? (n / 10000).toFixed(n >= 100000 ? 0 : 1) + '万' : String(n));
  let meta;
  if (src === '豆瓣') meta = [ex.rating && ex.rating !== '暂无评分' ? `豆瓣 ${ex.rating}分` : '豆瓣', ex.type === 'book' ? '书' : ex.type === 'music' ? '音乐' : ex.type === 'movie' ? '影视' : ''].filter(Boolean).join(' · ');
  else if (src === 'B站') meta = [ex.author, ex.play != null ? `${fmtNum(ex.play)}播放` : '', ex.duration].filter(Boolean).join(' · ');
  else if (src === '维基百科') meta = ex.desc || '维基百科';
  else meta = src;
  return (
    <div className="tap" onClick={() => { try { window.open(data.url, '_blank', 'noopener'); } catch {} }} style={{ width: 248, borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.12)', border: `0.5px solid ${t.border}`, background: '#fff', cursor: 'pointer' }}>
      <div style={{ display: 'flex' }}>
        {cover && <div style={{ width: 64, flexShrink: 0, background: '#f2f2f2', alignSelf: 'stretch' }}><img src={cover} alt="" referrerPolicy="no-referrer" loading="lazy" onError={(e) => { try { e.target.parentNode.style.display = 'none'; } catch {} }} style={{ width: 64, height: '100%', minHeight: 64, objectFit: 'cover', display: 'block' }} /></div>}
        <div style={{ padding: '10px 12px', minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 12 }}>{icon}</span>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: '#1a1a1a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.title || '分享'}</span>
          </div>
          {data.snippet && <div style={{ fontSize: 11, color: '#888', lineHeight: 1.5, maxHeight: 33, overflow: 'hidden' }}>{data.snippet}</div>}
          <div style={{ fontSize: 9.5, color: '#bbb', marginTop: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta} · 点击打开</div>
        </div>
      </div>
    </div>
  );
}

// 沉浸式语音通话（对齐小祁全屏通话）：真实语音环路 /tts(MiniMax) + /stt + /chat
const CALL_GREETINGS = {
  yu: ['喂，是我。', '接通了……在听。', '嗯，说吧，我在。'],
};
function CallScreen({ t, char, sessionId, model, mode, onClose }) {
  const acc = char.accent || '#d4926a';
  const [phase, setPhase] = useState('incoming');   // incoming | talking
  const [status, setStatus] = useState('语音通话');
  const [speaking, setSpeaking] = useState(false);     // 角色正在说（播放 TTS）
  const [listening, setListening] = useState(false);   // 我正在说（录音）
  const [thinking, setThinking] = useState(false);     // 等回复
  const [muted, setMuted] = useState(false);
  const [secs, setSecs] = useState(0);
  const [lines, setLines] = useState([]);              // {who:'me'|'char', text}
  const [ttsNote, setTtsNote] = useState('');
  const audioRef = useRef(null);
  const recRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const aliveRef = useRef(true);
  const busyRef = useRef(false);
  const speakingRef = useRef(false);

  const pushLine = (who, text) => { if (aliveRef.current) setLines(prev => [...prev.slice(-5), { who, text }]); };
  const setSpk = (v) => { speakingRef.current = v; if (aliveRef.current) setSpeaking(v); };
  const stopMic = () => { try { streamRef.current?.getTracks().forEach(tk => tk.stop()); } catch {} streamRef.current = null; };

  const speak = async (text) => {
    if (!text) return;
    setSpk(true);
    try {
      const r = await fetch(`${BACKEND}/tts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, character_id: char.id }) });
      if (!aliveRef.current) { setSpk(false); return; }
      if (r.status === 503) { setSpk(false); return; }
      const d = await r.json();
      if (d.audio && aliveRef.current) {
        const a = new Audio(d.audio); audioRef.current = a;
        a.onended = () => setSpk(false);
        a.onerror = () => setSpk(false);
        await a.play().catch(() => setSpk(false));
      } else setSpk(false);
    } catch { setSpk(false); }
  };

  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; try { audioRef.current?.pause(); } catch {} try { recRef.current?.stop(); } catch {} stopMic(); };
  }, []);

  // 接听（用户手势内）：解锁 iOS 音频自动播放限制 + 角色先打招呼
  const accept = () => {
    try { const u = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA='); u.volume = 0; u.play().catch(() => {}); } catch {}
    setPhase('talking'); setStatus('通话中');
    const greet = (CALL_GREETINGS[char.id] || CALL_GREETINGS.yu);
    const g = greet[Math.floor(Math.random() * greet.length)];
    pushLine('char', g); speak(g);
  };

  // 计时
  useEffect(() => {
    if (phase !== 'talking') return;
    const id = setInterval(() => setSecs(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);
  const mmss = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;

  // 一轮对话：STT → /chat(累积) → TTS
  const sendTurn = async (userText) => {
    if (!userText || busyRef.current) return;
    busyRef.current = true; setThinking(true); setStatus('思考中…');
    pushLine('me', userText);
    try {
      const res = await fetch(`${BACKEND}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: userText, session_id: sessionId, character_id: char.id, model: model.value, mode: 'short', max_tokens: 1200, want_thinking: false }) });
      if (!res.ok || !res.body) throw new Error('chat http ' + res.status);
      const reader = res.body.getReader(), decoder = new TextDecoder('utf-8');
      let full = '', sseBuf = '';
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        sseBuf += decoder.decode(value, { stream: true });
        const parts = sseBuf.split('\n\n'); sseBuf = parts.pop();
        for (const part of parts) for (const line of part.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try { const p = JSON.parse(line.slice(6)); if (p.text) full += p.text; } catch {}
        }
      }
      const parsed = splitThinkingReply(full);
      const reply = (parsed.reply || '').replace(/\s*\|\|\|\s*/g, '，').trim() || '嗯。';
      if (!aliveRef.current) return;
      setThinking(false); setStatus('通话中');
      pushLine('char', reply);
      await speak(reply);
    } catch {
      if (aliveRef.current) { setThinking(false); setStatus('通话中'); pushLine('char', '（信号不太好…）'); }
    } finally { busyRef.current = false; }
  };

  const startRec = async () => {
    if (muted || listening || speakingRef.current || thinking || busyRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!aliveRef.current) { try { stream.getTracks().forEach(tk => tk.stop()); } catch {} return; }
      streamRef.current = stream;
      const mr = new MediaRecorder(stream); recRef.current = mr; chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stopMic();
        const blob = new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || 'audio/webm' });
        if (!aliveRef.current) return;
        if (blob.size < 1200) { setStatus('没听清，再按住说一次'); setTimeout(() => aliveRef.current && setStatus('通话中'), 1600); return; }
        setThinking(true); setStatus('识别中…');
        const reader = new FileReader();
        reader.onload = async () => {
          if (!aliveRef.current) return;
          try {
            const r = await fetch(`${BACKEND}/stt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audio: reader.result, mime: blob.type }) });
            const d = await r.json();
            const txt = (d.text || '').trim();
            if (!aliveRef.current) return;
            if (txt) await sendTurn(txt);
            else { setThinking(false); setStatus('没听清，再说一次'); setTimeout(() => aliveRef.current && setStatus('通话中'), 1600); }
          } catch { if (aliveRef.current) { setThinking(false); setStatus('识别失败'); setTimeout(() => aliveRef.current && setStatus('通话中'), 1600); } }
        };
        reader.readAsDataURL(blob);
      };
      mr.start(); setListening(true); setStatus('在听你说…');
    } catch { setListening(false); if (aliveRef.current) { setStatus('需要麦克风权限'); setTimeout(() => aliveRef.current && setStatus('通话中'), 2000); } }
  };
  const stopRec = () => { if (!listening) return; setListening(false); try { recRef.current?.stop(); } catch {} };

  const ringScale = speaking ? 1.12 : listening ? 1.06 : 1;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: `radial-gradient(120% 80% at 50% 0%, ${acc}cc 0%, #1a1726 55%, #0e0c16 100%)`, display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#fff' }}>
      <div style={{ maxWidth: 440, margin: '0 auto', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 24px' }}>
        {/* 顶部：名 + 状态 */}
        <div style={{ marginTop: 56, textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: '0.04em', fontFamily: 'inherit' }}>{getRemark(char.id) || char.name}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 8 }}>{phase === 'talking' ? `${status} · ${mmss}` : status}</div>
        </div>
        {/* 头像 + 呼吸环 */}
        <div style={{ marginTop: 48, position: 'relative', width: 168, height: 168, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid ${speaking ? '#fff' : 'rgba(255,255,255,0.35)'}`, transform: `scale(${ringScale})`, transition: 'transform .5s ease, border-color .3s', opacity: 0.6 }} />
          <div style={{ position: 'absolute', inset: 16, borderRadius: '50%', border: `1px solid rgba(255,255,255,0.2)`, transform: `scale(${speaking ? 1.18 : 1})`, transition: 'transform .7s ease' }} />
          <div style={{ width: 132, height: 132, borderRadius: '50%', overflow: 'hidden', boxShadow: '0 12px 40px rgba(0,0,0,0.4)' }}><CharAvatar c={char} size={132} /></div>
        </div>
        {/* 转写 */}
        <div className="hs" style={{ flex: 1, width: '100%', overflowY: 'auto', marginTop: 28, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 8, paddingBottom: 8 }}>
          {lines.map((l, i) => (
            <div key={i} style={{ alignSelf: l.who === 'me' ? 'flex-end' : 'flex-start', maxWidth: '82%', fontSize: 14, lineHeight: 1.6, padding: '8px 13px', borderRadius: 14, background: l.who === 'me' ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.28)', color: '#fff', fontFamily: 'inherit' }}>{l.text}</div>
          ))}
          {ttsNote && <div style={{ alignSelf: 'center', fontSize: 11, color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>{ttsNote}</div>}
        </div>
        {/* 控制 */}
        {phase === 'incoming' ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', width: '100%', padding: '20px 0 48px', flexShrink: 0 }}>
            <div style={{ textAlign: 'center' }}>
              <button className="tap" onClick={onClose} style={{ width: 66, height: 66, borderRadius: '50%', border: 'none', background: '#e0524d', color: '#fff', fontSize: 26, cursor: 'pointer' }} title="挂断">✕</button>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 8 }}>挂断</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <button className="tap" onClick={accept} style={{ width: 66, height: 66, borderRadius: '50%', border: 'none', background: '#4caf72', color: '#fff', fontSize: 26, cursor: 'pointer' }} title="接听">📞</button>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 8 }}>接听</div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', width: '100%', padding: '20px 0 40px', flexShrink: 0 }}>
            <button className="tap" onClick={() => setMuted(m => !m)} style={{ width: 58, height: 58, borderRadius: '50%', border: 'none', background: muted ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.18)', color: muted ? acc : '#fff', fontSize: 22, cursor: 'pointer' }} title="静音">{muted ? '🔇' : '🎙️'}</button>
            <button
              onPointerDown={e => { try { e.currentTarget.setPointerCapture(e.pointerId); } catch {} startRec(); }}
              onPointerUp={e => { try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {} stopRec(); }}
              onPointerCancel={stopRec}
              disabled={muted}
              style={{ width: 96, height: 96, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.5)', background: listening ? '#fff' : 'rgba(255,255,255,0.22)', color: listening ? acc : '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, touchAction: 'none', fontFamily: 'inherit', opacity: muted ? 0.5 : 1 }}>
              <span style={{ fontSize: 24 }}>{listening ? '●' : thinking ? '…' : speaking ? '🔊' : '🎤'}</span>
              <span>{listening ? '松开发送' : thinking ? '思考中' : speaking ? 'TA在说' : '按住说'}</span>
            </button>
            <button className="tap" onClick={onClose} style={{ width: 58, height: 58, borderRadius: '50%', border: 'none', background: '#e0524d', color: '#fff', fontSize: 24, cursor: 'pointer' }} title="挂断">✕</button>
          </div>
        )}
      </div>
    </div>
  );
}

// 单聊设置（对齐小祁四 tab：外观 / 行为 / 记忆 / 数据）——聊天页 ⋯ 打开的整屏面板
function ChatSettingsSheet({ t, char, sessionId, modelIdx, onPickModel, mode, setChatMode, onNewChat, onClearMessages, onClose }) {
  const [tab, setTab] = useState('look');
  const [, force] = useState(0); const rerender = () => force(n => n + 1);
  const [remarkText, setRemarkText] = useState(getRemark(char.id));
  const bgInputRef = useRef(null);
  const acc = char.accent || t.acc;
  // 记忆 tab 数据
  const [hub, setHub] = useState(null);
  const [mems, setMems] = useState(null);
  const [summarizing, setSummarizing] = useState(false);
  const [sumResult, setSumResult] = useState('');
  // 数据 tab
  const [msgCount, setMsgCount] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportData, setExportData] = useState('');
  const [exportMsg, setExportMsg] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [agentOn, setAgentOn] = useState(false);

  useEffect(() => {
    fetch(`${BACKEND}/memory-hub/${char.id}`).then(r => r.json()).then(setHub).catch(() => {});
    fetch(`${BACKEND}/memory/${char.id}`).then(r => r.json()).then(d => setMems(d.memories || [])).catch(() => setMems([]));
    if (sessionId) fetch(`${BACKEND}/session/${sessionId}/messages?limit=1`).then(r => r.json()).then(d => setMsgCount(d.total ?? null)).catch(() => {});
    fetch(`${BACKEND}/kv/agent_enabled`).then(r => r.json()).then(d => setAgentOn(!!(d && d.value))).catch(() => {});
  }, [char.id, sessionId]);
  const toggleAgent = () => { const nv = !agentOn; setAgentOn(nv); fetch(`${BACKEND}/kv/agent_enabled`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: nv }) }).catch(() => {}); };

  const doSummarize = async () => {
    if (!sessionId || summarizing) return;
    setSummarizing(true); setSumResult('');
    try {
      const r = await fetch(`${BACKEND}/memories/summarize`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: sessionId, character_id: char.id }) });
      const d = await r.json();
      if (d.ok) {
        setSumResult('已记下：' + d.summary + (d.facts?.length ? '（+' + d.facts.length + ' 条事实）' : ''));
        fetch(`${BACKEND}/memory-hub/${char.id}`).then(r => r.json()).then(setHub).catch(() => {});
        fetch(`${BACKEND}/memory/${char.id}`).then(r => r.json()).then(d => setMems(d.memories || [])).catch(() => {});
      } else setSumResult(d.reason === 'too_few' ? '消息太少，先多聊几句' : d.reason === 'api_failed' ? '模型暂时不可用，稍后再试' : '这段没提炼出新东西');
    } catch { setSumResult('总结失败，稍后再试'); }
    setSummarizing(false);
  };
  const doExport = async () => {
    if (!sessionId || exporting) return;
    setExporting(true); setExportMsg('');
    try {
      const r = await fetch(`${BACKEND}/session/${sessionId}/messages?limit=100&offset=0`);
      const d = await r.json();
      const lines = (d.messages || []).map(m => ({ role: m.role, content: String(m.content || '').replace(/\s*\|\|\|\s*/g, '\n'), time: m.created_at }));
      const json = JSON.stringify({ character: char.name, exported_at: new Date().toISOString(), messages: lines }, null, 2);
      setExportData(json);
      const fname = `与${char.name}的聊天.json`;
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent || '');
      // 桌面浏览器：直接下载；iOS（尤其 PWA 独立模式）锚点下载会静默失败 → 用下方文本框手动复制/分享
      if (!isIOS) {
        try {
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = fname; document.body.appendChild(a); a.click(); a.remove();
          URL.revokeObjectURL(url);
          setExportMsg('已下载 ' + fname);
        } catch { setExportMsg('下载失败，可在下方手动复制'); }
      } else {
        setExportMsg('');
      }
    } catch { setExportMsg('导出失败，稍后再试'); }
    setExporting(false);
  };
  const copyExport = async () => {
    try { await navigator.clipboard.writeText(exportData); setExportMsg('已复制到剪贴板'); }
    catch { setExportMsg('复制失败'); }
  };
  const pickBg = (e) => { const f = e.target.files?.[0]; if (!f) return; const rd = new FileReader(); rd.onload = ev => { setChatBg(char.id, ev.target.result); rerender(); }; rd.readAsDataURL(f); e.target.value = ''; };

  const card = { borderRadius: 14, overflow: 'hidden', border: `0.5px solid ${t.border}`, backgroundColor: t.isGlass ? 'rgba(255,255,255,0.2)' : t.card, marginBottom: 14 };
  const Row = ({ label, sub, right, onClick, first }) => (
    <div className="tap" onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', cursor: onClick ? 'pointer' : 'default', borderTop: first ? 'none' : `0.5px solid ${t.border}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: t.text1, fontFamily: 'inherit' }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: t.text3, marginTop: 2, fontFamily: 'inherit' }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
  const Toggle = ({ on, onClick }) => (
    <span className="tap" onClick={onClick} style={{ width: 42, height: 24, borderRadius: 12, background: on ? acc : t.border, position: 'relative', flexShrink: 0, cursor: 'pointer', transition: 'background .2s' }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 20 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
    </span>
  );
  const Seg = ({ options, value, onPick }) => (
    <div style={{ display: 'flex', gap: 0, border: `0.5px solid ${t.border}`, borderRadius: 9, overflow: 'hidden', flexShrink: 0 }}>
      {options.map(o => <span key={o.v} className="tap" onClick={() => onPick(o.v)} style={{ fontSize: 12, padding: '5px 12px', cursor: 'pointer', background: value === o.v ? acc : 'transparent', color: value === o.v ? '#fff' : t.text2, fontFamily: 'inherit' }}>{o.label}</span>)}
    </div>
  );
  const TYPE_LABEL = { summary: '摘要', fact: '事实', insight: '洞察', moment: '动态', conversation: '对话' };
  const tabs = [{ k: 'look', label: '外观' }, { k: 'behave', label: '行为' }, { k: 'memory', label: '记忆' }, { k: 'data', label: '数据' }];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: t.bgColor || '#f4f3ef', display: 'flex', flexDirection: 'column' }}>
      <div style={{ maxWidth: 440, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* 头 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px 8px', flexShrink: 0 }}>
          <span className="tap" onClick={onClose} style={{ fontSize: 26, color: t.text2, cursor: 'pointer', width: 34, height: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>‹</span>
          <CharAvatar c={char} size={30} />
          <div style={{ fontSize: 16, fontWeight: 600, color: t.text1, fontFamily: 'inherit' }}>{getRemark(char.id) || char.name} · 设置</div>
        </div>
        {/* tab 条 */}
        <div style={{ display: 'flex', gap: 4, padding: '0 14px 6px', flexShrink: 0 }}>
          {tabs.map(tb => (
            <span key={tb.k} className="tap" onClick={() => setTab(tb.k)} style={{ flex: 1, textAlign: 'center', fontSize: 13, padding: '8px 0', cursor: 'pointer', color: tab === tb.k ? '#fff' : t.text2, background: tab === tb.k ? acc : (t.isGlass ? 'rgba(255,255,255,0.2)' : t.card), border: `0.5px solid ${t.border}`, borderRadius: 10, fontFamily: 'inherit' }}>{tb.label}</span>
          ))}
        </div>
        {/* 内容 */}
        <div className="hs" style={{ flex: 1, overflowY: 'auto', padding: '12px 14px 30px' }}>

          {tab === 'look' && <>
            <div style={card}>
              <Row label="聊天背景" sub={getChatBg(char.id) ? '已设置自定义背景' : '默认（云星底纹）'} first onClick={() => bgInputRef.current?.click()} right={<span style={{ fontSize: 16, color: t.text3, opacity: 0.4 }}>›</span>} />
              {getChatBg(char.id) && <Row label="清除聊天背景" onClick={() => { setChatBg(char.id, ''); rerender(); }} right={<span style={{ fontSize: 12, color: '#D95A5A' }}>清除</span>} />}
              <Row label="头像形状" right={<Seg options={[{ v: 'circle', label: '圆形' }, { v: 'square', label: '方形' }]} value={getAvatarShape()} onPick={v => { setAvatarShape(v); rerender(); }} />} />
            </div>
            <div style={card}>
              <div style={{ padding: '13px 16px' }}>
                <div style={{ fontSize: 14, color: t.text1, marginBottom: 8, fontFamily: 'inherit' }}>备注名</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={remarkText} onChange={e => setRemarkText(e.target.value)} placeholder={char.name} style={{ flex: 1, fontSize: 14, padding: '8px 10px', border: `1px solid ${t.border}`, borderRadius: 8, background: 'transparent', color: t.text1, fontFamily: 'inherit', minWidth: 0 }} />
                  <span className="tap" onClick={() => { setRemark(char.id, remarkText.trim()); rerender(); }} style={{ fontSize: 13, color: '#fff', background: acc, cursor: 'pointer', padding: '8px 16px', borderRadius: 8, whiteSpace: 'nowrap' }}>保存</span>
                </div>
              </div>
            </div>
            <input ref={bgInputRef} type="file" accept="image/*" onChange={pickBg} style={{ display: 'none' }} />
          </>}

          {tab === 'behave' && <>
            <div style={card}>
              <Row label="默认进入模式" sub="微信＝短消息口语；深聊＝长文不限字数" first right={<Seg options={[{ v: 'short', label: '微信' }, { v: 'long', label: '深聊' }]} value={mode} onPick={v => { setSavedMode(char.id, v); setChatMode(v); }} />} />
              <Row label="主动找我说话" sub="安静一阵后他可能先开口（15-20 分钟）" right={<Toggle on={!getChatPref(char.id, 'noproactive')} onClick={() => { setChatPref(char.id, 'noproactive', !getChatPref(char.id, 'noproactive')); syncProactiveMute(); rerender(); }} />} />
              <Row label="思维链默认展开" sub="每条回复的内心 OS 自动摊开" right={<Toggle on={getChatPref(char.id, 'thinkopen')} onClick={() => { setChatPref(char.id, 'thinkopen', !getChatPref(char.id, 'thinkopen')); rerender(); }} />} />
              <Row label="设备代理（全局）" sub="电脑跑 monitor.py 后，角色可控制电脑/灯/玩具等" right={<Toggle on={agentOn} onClick={toggleAgent} />} />
            </div>
            <div style={card}>
              <div style={{ padding: '11px 16px 4px', fontSize: 11, color: t.text3, letterSpacing: '0.08em' }}>AI 模型（记住为该角色默认）</div>
              {char.models.map((m, i) => (
                <Row key={m.value} label={m.label} sub={isModelThinking(m) ? '思维型 · 适合深聊' : '标准 · 适合微信'} onClick={() => { onPickModel(i); rerender(); }}
                  right={i === modelIdx ? <span style={{ color: acc, fontSize: 16 }}>✓</span> : null} first={i === 0} />
              ))}
            </div>
          </>}

          {tab === 'memory' && <>
            <div style={{ ...card, padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, color: t.text2, fontFamily: 'inherit' }}>{char.name}记得的事</span>
                <span style={{ fontSize: 22, fontWeight: 700, color: acc, fontFamily: 'inherit' }}>{hub?.memory?.total ?? '–'}</span>
              </div>
              {hub?.memory?.byType && <div style={{ fontSize: 11, color: t.text3, marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {Object.entries(hub.memory.byType).map(([k, v]) => <span key={k}>{TYPE_LABEL[k] || k} {v}</span>)}
                {hub.memory.pinned > 0 && <span>📌 {hub.memory.pinned}</span>}
              </div>}
            </div>
            <div className="tap" onClick={doSummarize} style={{ textAlign: 'center', padding: '13px 0', borderRadius: 12, background: summarizing ? t.border : acc, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginBottom: sumResult ? 8 : 14 }}>{summarizing ? '正在回顾这段对话…' : '手动总结这段对话 → 存为记忆'}</div>
            {sumResult && <div style={{ fontSize: 12, color: t.text2, background: t.isGlass ? 'rgba(255,255,255,0.2)' : t.card, border: `0.5px solid ${t.border}`, borderRadius: 10, padding: '10px 14px', marginBottom: 14, lineHeight: 1.6, fontFamily: 'inherit' }}>{sumResult}</div>}
            <div style={{ fontSize: 11, color: t.text3, letterSpacing: '0.08em', margin: '2px 4px 8px' }}>最近记忆</div>
            {mems == null ? <div style={{ color: t.text3, fontSize: 12, padding: 16, textAlign: 'center' }}>加载中…</div>
              : mems.length === 0 ? <div style={{ color: t.text3, fontSize: 12, padding: 16, textAlign: 'center' }}>还没有记忆，多聊聊或点上面的总结</div>
              : mems.slice(0, 30).map((m, i) => (
                <div key={i} style={{ ...card, marginBottom: 8, padding: '11px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 9, color: acc, border: `0.5px solid ${acc}55`, borderRadius: 6, padding: '1px 6px' }}>{TYPE_LABEL[m.type] || m.type}</span>
                    <span style={{ fontSize: 10, color: t.text3 }}>{m.date}{m.heat != null ? ` · 热度${Number(m.heat).toFixed(1)}` : ''}</span>
                  </div>
                  <div style={{ fontSize: 13, color: t.text1, lineHeight: 1.6, fontFamily: 'inherit' }}>{m.content}</div>
                </div>
              ))}
          </>}

          {tab === 'data' && <>
            <div style={{ ...card, padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, color: t.text2, fontFamily: 'inherit' }}>当前对话消息数</span>
                <span style={{ fontSize: 22, fontWeight: 700, color: acc, fontFamily: 'inherit' }}>{msgCount ?? '–'}</span>
              </div>
            </div>
            <div style={card}>
              <Row label="导出聊天记录" sub="最近 100 条" first onClick={doExport} right={<span style={{ fontSize: 12, color: acc }}>{exporting ? '导出中…' : '导出'}</span>} />
              <Row label="开启新对话" sub="保留旧记录，开一段全新的" onClick={onNewChat} right={<span style={{ fontSize: 16, color: t.text3, opacity: 0.4 }}>›</span>} />
            </div>
            {exportMsg && <div style={{ fontSize: 11, color: t.text3, padding: '0 6px 8px', lineHeight: 1.5 }}>{exportMsg}</div>}
            {exportData && <div style={{ marginBottom: 14 }}>
              <textarea readOnly value={exportData} onFocus={e => e.target.select()} style={{ width: '100%', height: 150, fontSize: 11, fontFamily: 'monospace', color: t.text2, background: t.isGlass ? 'rgba(255,255,255,0.2)' : t.card, border: `0.5px solid ${t.border}`, borderRadius: 10, padding: 10, boxSizing: 'border-box', resize: 'none' }} />
              <div className="tap" onClick={copyExport} style={{ textAlign: 'center', marginTop: 8, padding: '10px 0', borderRadius: 10, background: acc, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>复制全部</div>
            </div>}
            <div style={card}>
              {!confirmClear
                ? <Row label="清空当前对话记录" sub="只清这段会话的消息，记忆不受影响" first onClick={() => setConfirmClear(true)} right={<span style={{ fontSize: 12, color: '#D95A5A' }}>清空</span>} />
                : <div style={{ padding: '13px 16px' }}>
                    <div style={{ fontSize: 13, color: t.text1, marginBottom: 10 }}>确定清空与{char.name}的这段对话？此操作不可恢复。</div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <span className="tap" onClick={() => setConfirmClear(false)} style={{ fontSize: 13, color: t.text3, cursor: 'pointer', padding: '6px 14px' }}>取消</span>
                      <span className="tap" onClick={async () => { setConfirmClear(false); await onClearMessages(); onClose(); }} style={{ fontSize: 13, color: '#fff', background: '#D95A5A', cursor: 'pointer', padding: '6px 16px', borderRadius: 8 }}>确认清空</span>
                    </div>
                  </div>}
            </div>
          </>}

        </div>
      </div>
    </div>
  );
}

function ChatPage({ charId, nsfw = false, mode, t, addGlobalTodo, onBack, onSwitchChar, onProfile, chatMode, setChatMode }) {
  const getIdx = () => { const i = CHARACTERS.findIndex(c => c.id === charId); return i < 0 ? 0 : i; };
  const [charIdx, setCharIdx] = useState(getIdx);
  const [modelIdx, setModelIdx] = useState(0);
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [msgTotal, setMsgTotal] = useState(0);
  const [msgOffset, setMsgOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [pendingImage, setPendingImage] = useState(null); // { data, type, name, preview }
  const [uploadingImage, setUploadingImage] = useState(false);
  const [todoAdded, setTodoAdded] = useState(''); // flash confirmation text
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceHint, setVoiceHint] = useState('');
  const [editingKey, setEditingKey] = useState(null);  // 正在编辑的消息 key（dbId 或 id）
  const [editText, setEditText] = useState('');
  const [branchBusy, setBranchBusy] = useState(false); // 重新生成/切分支进行中
  const [showPlus, setShowPlus] = useState(false);     // + 功能宫格面板
  const [showEmoji, setShowEmoji] = useState(false);   // 表情快捷栏
  const [showSettings, setShowSettings] = useState(false);  // 单聊设置（外观/行为/记忆/数据）
  const [showCall, setShowCall] = useState(false);          // 沉浸式语音通话
  const [showHistory, setShowHistory] = useState(false);    // 历史对话列表（多会话切换）
  const [historyList, setHistoryList] = useState(null);     // null=未加载, []=空
  const [showGift, setShowGift] = useState(false);     // 钱包：发转账/红包/亲属卡
  const [giftKind, setGiftKind] = useState('redpacket');
  const [giftAmt, setGiftAmt] = useState('');
  const [giftNote, setGiftNote] = useState('');
  const [sendingGift, setSendingGift] = useState(false);
  const [quoting, setQuoting] = useState(null);        // 引用回复：{ who, text }
  const [showLoc, setShowLoc] = useState(false);       // 发位置卡
  const [locPlace, setLocPlace] = useState('');
  const [locNote, setLocNote] = useState('');
  const [sendingLoc, setSendingLoc] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const genBusyRef = useRef(false);
  const genQueueRef = useRef([]);
  const sidCounterRef = useRef(0);
  const streamGenRef = useRef(0);   // 每次切角色/新对话 +1；过期的流写入会被丢弃 → 角色之间互不影响
  const freshStreamedRef = useRef(new Set());  // 本次会话刚流式完成的消息 id（用于多条气泡逐条动画，历史消息不动画）
  const coalesceRef = useRef({ texts: [], timer: null });  // 连发合并：短时间内的多条用户消息合成一轮，角色只回一次
  const flushCoalescedRef = useRef(null);   // 存最新 flushCoalesced，供切后台/卸载急救 flush 用最新 sessionId

  const bottomRef = useRef(null);
  const initScrolledRef = useRef(false);   // 首屏是否已定位到底部
  const userScrolledRef = useRef(false);   // 用户是否手动上翻（上翻就别强行拉到底）
  const lpTimerRef = useRef(null);         // 长按计时（长按气泡＝引用）
  const lpFiredRef = useRef(false);
  const msgScrollRef = useRef(null);       // 消息滚动容器（直接设 scrollTop 比 scrollIntoView 可靠）
  const lastActiveRef = useRef(Date.now());
  const loadGenRef = useRef(0); // race-condition guard: increments on every load, stale loads bail
  const customChar = (typeof charId === 'string' && charId.startsWith('cc_')) ? findChar(charId) : null;
  const char = customChar || CHARACTERS[charIdx];
  const model = customChar ? char.models[0] : char.models[modelIdx];
  const isLong = mode === 'long';
  const chatBgUrl = getChatBg(char.id);

  // 语音播放
  const [ttsState, setTtsState] = useState({});       // { [msgKey(mkey)]: 'loading'|'playing' }
  const audioRef = useRef(null);
  const audioCacheRef = useRef({});                   // 缓存已生成的音频 url，避免重复计费
  const playTTS = async (msg, key) => {
    if (audioRef.current && ttsState[key] === 'playing') { audioRef.current.pause(); setTtsState({}); return; }
    if (audioRef.current) { audioRef.current.pause(); }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    // 待念文本：voiceTail([voice] 后半段)优先，否则念完整正文 reply（已剥思维链/marker）。
    // 把 ||| 多气泡分隔符换成停顿，绝不把字面 ||| 念出来。空文本直接放弃（不送 /tts、不降级机器音）。
    const ttsText = String((msg.voiceTail != null && msg.voiceTail !== '') ? msg.voiceTail : (msg.reply ?? '')).replace(/\|\|\|/g, '，').trim();
    if (!ttsText) { setTtsState({}); return; }
    // iOS/Safari 解锁:在用户手势内同步播一段静音，解锁后续 await 之后的 play()（否则被自动播放策略静默拦截）
    try { const _u = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA='); _u.volume = 0; _u.play().catch(() => {}); } catch {}
    const play = (url) => {
      const a = new Audio(url); audioRef.current = a;
      a.onended = () => setTtsState({});
      a.onpause = () => setTtsState(s => (s[key] === 'playing' ? {} : s));
      a.play().then(() => setTtsState({ [key]: 'playing' })).catch(() => fallbackBrowserTTS(ttsText));
    };
    const fallbackBrowserTTS = (text) => {
      if (!window.speechSynthesis) { setTtsState({}); return; }
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN'; u.rate = 0.9;
      u.onend = () => setTtsState({});
      window.speechSynthesis.speak(u);
      setTtsState({ [key]: 'playing' });
    };
    if (audioCacheRef.current[key]) { play(audioCacheRef.current[key]); return; }
    setTtsState({ [key]: 'loading' });
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 50000);
      const res = await fetch(`${BACKEND}/tts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: ttsText, character_id: char.id, ...getVoicePref(char.id) }),
        signal: ctrl.signal,
      });
      clearTimeout(to);
      if (!res.ok) { fallbackBrowserTTS(ttsText); return; }
      const data = await res.json();
      if (data?.audio) { audioCacheRef.current[key] = data.audio; play(data.audio); }
      else { fallbackBrowserTTS(ttsText); }
    } catch { fallbackBrowserTTS(ttsText); }
  };

  // 本地持久化与恢复
  useEffect(() => {
    if (messages.length > 0 && !messages.some(m => m.streaming)) {
      localStorage.setItem(`companion_history_${nsfw ? 'p_' : ''}${char.id}`, JSON.stringify(messages));
    }
  }, [messages, char.id]);

  useEffect(() => {
    initScrolledRef.current = false;   // 切角色/模式 → 重新首屏定位
    userScrolledRef.current = false;
    // 切角色/模式前，把还压在 1.4s 合并缓冲里的消息先发出去（发给"输入时那个角色"的会话），别丢——之前是直接丢弃。
    if (coalesceRef.current.texts.length) { try { flushCoalesced(); } catch {} }
    else if (coalesceRef.current.timer) { clearTimeout(coalesceRef.current.timer); coalesceRef.current.timer = null; }
    const i = getIdx(); const savedM = Math.max(0, Math.min(getModelIdx(CHARACTERS[i].id), CHARACTERS[i].models.length - 1)); setCharIdx(i); setModelIdx(savedM); loadOrCreate(i, savedM);
  }, [charId, mode]);

  // 进入对话/有新消息：拉到底（多次兜底扛住头像/图片异步撑高）；用户手动上翻则不打断
  useEffect(() => {
    if (messages.length === 0) return;
    if (userScrolledRef.current) return;
    const snap = () => { const el = msgScrollRef.current; if (el) el.scrollTop = el.scrollHeight; };
    snap();
    requestAnimationFrame(snap);
    [60, 160, 320, 600, 1000, 1600].forEach(ms => setTimeout(snap, ms));
    initScrolledRef.current = true;
  }, [messages, loading]);

  // 主动搭话机制 (4 分钟无操作触发)
  useEffect(() => {
    const timer = setInterval(() => {
      if (Date.now() - lastActiveRef.current > (15 + Math.random() * 5) * 60 * 1000 && !loading && messages.length > 0 && !getChatPref(char.id, 'noproactive')) {
        triggerProactive();
      }
    }, 60000);
    return () => clearInterval(timer);
  }, [charIdx, sessionId, loading, messages.length]);

  // 轮询新消息：检查是否有后端主动发来的新消息，逐条延迟显示
  const pollNewRef = useRef(null);
  const revealQueueRef = useRef([]);
  useEffect(() => {
    if (!sessionId) return;
    const poll = async () => {
      if (loading || revealQueueRef.current.length > 0) return;
      try {
        const res = await fetch(`${BACKEND}/session/${sessionId}/messages?limit=15&offset=0`);
        const data = await res.json();
        const latest = (data.messages || []).map(msg => {
          return { role: msg.role, content: msg.content, ...parseMsgFields(msg.content, msg.role), dbId: msg.id, meta: msg.meta || null, ts: msg.created_at };
        });
        // 按 dbId + 归一化内容去重：后端新加的（主动消息 / 角色红包）才补进来，已显示的（含流式回复、乐观插入）一律跳过。
        // 归一化剥掉 thinking/voice 标记/||| /所有空白 → 流式版与 DB 版即使解析有差也能对上，避免刚回的那条被轮询重复插入。
        const knownIds = new Set(messages.filter(m => m.dbId != null).map(m => m.dbId));
        const norm = s => String(s || '').replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').replace(/\[voice\]|\[语音\]/gi, '').replace(/\|\|\|/g, '').replace(/\s+/g, '').slice(0, 200);
        const ckey = m => m.role + '\0' + norm(m.reply ?? m.content);
        // 内容去重只针对「本地还没拿到 dbId 的流式/乐观条」——防的是刚回那条被轮询重复插；
        // 有全新 dbId 的主动消息即使内容与旧条重复（如"想你了""在吗"）也要照常显示，不能误删。
        const noDbKeys = new Set(messages.filter(m => m.dbId == null).map(ckey));
        const newMsgs = filterHistory(latest.filter(m =>
          m.dbId != null && !knownIds.has(m.dbId) && m.role === 'assistant' && !noDbKeys.has(ckey(m))
        ));
        if (newMsgs.length > 0) {
          revealQueueRef.current = newMsgs;
          const revealNext = () => {
            if (revealQueueRef.current.length === 0) return;
            const msg = revealQueueRef.current.shift();
            setMessages(prev => [...prev, msg]);
            if (revealQueueRef.current.length > 0) {
              setTimeout(revealNext, 1500 + Math.random() * 2500);
            }
          };
          revealNext();
        }
      } catch {}
    };
    pollNewRef.current = setInterval(poll, 30000);
    return () => clearInterval(pollNewRef.current);
  }, [sessionId, loading, messages.length]);

    const loadOrCreate = async (cIdx, mIdx, forceNew = false) => {
    const gen = ++loadGenRef.current;
    const c = ((typeof charId === 'string' && charId.startsWith('cc_')) ? findChar(charId) : null) || CHARACTERS[cIdx];
    const m = c.models[mIdx] || c.models[0];
    // 切角色：放弃上一个角色仍在进行的生成、清空发送队列、收起"正在输入"
    streamGenRef.current++;
    genQueueRef.current = [];
    genBusyRef.current = false;
    setLoading(false);
    setSessionId(null);
    // 即时显示本地缓存，消除"载入很久"的空白等待；随后用后端数据覆盖
    if (!forceNew) {
      const cached = localStorage.getItem(`companion_history_${nsfw ? 'p_' : ''}${c.id}`);
      if (cached) { try { setMessages(filterHistory(JSON.parse(cached))); } catch { setMessages([]); } } else setMessages([]);
    } else { setMessages([]); }

    // 强制新建对话
    if (forceNew) {
      try {
        const res = await fetch(`${BACKEND}/session`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ character_id: c.id, model: m.value, nsfw })
        });
        if (gen !== loadGenRef.current) return;
        const data = await res.json();
        setSessionId(data.session?.id);
        saveSession(c.id, data.session?.id);
        if (data.greeting) {
          setMessages([{ role: 'assistant', content: data.greeting, ...parseMsgFields(data.greeting, 'assistant') }]);
        }
      } catch {}
      return;
    }

    // ★ 核心：向后端要这个角色的固定主会话（任何设备都一样）
    // 带重试（Render 冷启动/瞬时失败时不再概率性空白；本地缓存被 iOS 清掉也能恢复）
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    let sid = null;
    for (let a = 0; a < 4 && !sid; a++) {
      try {
        const sres = await fetch(`${BACKEND}/character-session/${c.id}${nsfw ? '?nsfw=1' : ''}`);
        if (gen !== loadGenRef.current) return;
        const sdata = await sres.json();
        if (sdata && sdata.session_id) { sid = sdata.session_id; break; }
      } catch {}
      await sleep(500 * (a + 1));
      if (gen !== loadGenRef.current) return;
    }
    if (sid) {
      setSessionId(sid);
      setMsgOffset(0);
      saveSession(c.id, sid);
      let data = null;
      for (let a = 0; a < 4; a++) {
        try {
          const res = await fetch(`${BACKEND}/session/${sid}/messages?limit=50&offset=0`);
          if (gen !== loadGenRef.current) return;
          const j = await res.json();
          if (Array.isArray(j?.messages)) { data = j; break; }   // 拿到有效数组（哪怕空）才算成功
        } catch {}
        await sleep(500 * (a + 1));
        if (gen !== loadGenRef.current) return;
      }
      if (data) {
        setMsgTotal(data.total || 0);
        if (data.messages.length > 0) {
          setMessages(filterHistory(data.messages.map(msg => {
            return { role: msg.role, content: msg.content, ...parseMsgFields(msg.content, msg.role), dbId: msg.id, meta: msg.meta || null, ts: msg.created_at };
          })));
        }
        // data.messages 为空但后端确有会话：保留已显示的本地缓存，不清空
      }
      return;
    }

    if (gen !== loadGenRef.current) return;
    // 兜底：本地缓存
    const local = localStorage.getItem(`companion_history_${nsfw ? 'p_' : ''}${c.id}`);
    if (local) { try { setMessages(filterHistory(JSON.parse(local))); } catch {} }
  };

  // 历史对话：拉这个角色名下的全部会话
  const openHistory = async () => {
    setShowHistory(true); setHistoryList(null);
    try {
      const r = await fetch(`${BACKEND}/character-sessions/${char.id}${nsfw ? '?nsfw=1' : ''}`);
      const j = await r.json();
      setHistoryList(Array.isArray(j?.sessions) ? j.sessions : []);
    } catch { setHistoryList([]); }
  };
  // 切到某段历史对话：直接加载它的消息并设为当前会话（再发消息它就成了"最近活跃"，回来默认就是它）
  const switchToSession = async (sid) => {
    if (!sid || sid === sessionId) { setShowHistory(false); return; }
    const gen = ++loadGenRef.current;
    streamGenRef.current++; genQueueRef.current = []; genBusyRef.current = false;
    setLoading(false); setShowHistory(false); setMessages([]); setMsgOffset(0);
    setSessionId(sid); saveSession(char.id, sid);
    try {
      const res = await fetch(`${BACKEND}/session/${sid}/messages?limit=50&offset=0`);
      if (gen !== loadGenRef.current) return;
      const j = await res.json();
      setMsgTotal(j.total || 0);
      setMessages(filterHistory((j.messages || []).map(msg => {
        return { role: msg.role, content: msg.content, ...parseMsgFields(msg.content, msg.role), dbId: msg.id, meta: msg.meta || null, ts: msg.created_at };
      })));
    } catch {}
  };
  // 删除一整段对话
  const deleteSession = async (sid) => {
    try { await fetch(`${BACKEND}/session/${sid}`, { method: 'DELETE' }); } catch {}
    setHistoryList(prev => (prev || []).filter(s => s.id !== sid));
    if (sid === sessionId) { setShowHistory(false); loadOrCreate(charIdx, modelIdx, false); }
  };

  const loadMore = async () => {
    if (loadingMore || !sessionId) return;
    setLoadingMore(true);
    const nextOffset = msgOffset + 50;
    try {
      const res = await fetch(`${BACKEND}/session/${sessionId}/messages?limit=50&offset=${nextOffset}`);
      const data = await res.json();
      const older = filterHistory((data.messages || []).map(msg => {
        return { role: msg.role, content: msg.content, ...parseMsgFields(msg.content, msg.role), dbId: msg.id, meta: msg.meta || null, ts: msg.created_at };
      }));
      setMessages(prev => [...older, ...prev]);
      setMsgOffset(nextOffset);
    } catch {}
    setLoadingMore(false);
  };

  const triggerProactive = async () => {
    lastActiveRef.current = Date.now();
    const prompt = '[系统提示]距离刚才已经过去了一会儿，请结合当前语境主动找小满搭话，自然开启一个新话题或关心她。不要带系统前缀，直接输出内容。';
    genQueueRef.current.push({ fullText: prompt, isHidden: true });
    processQueue();
  };

  // ===== 钱包：发转账/红包/亲属卡，拆角色发来的红包 =====
  const closeGift = () => { setShowGift(false); setGiftAmt(''); setGiftNote(''); };
  const closeLoc = () => { setShowLoc(false); setLocPlace(''); setLocNote(''); };
  const sendLoc = async () => {
    if (sendingLoc) return;
    const place = locPlace.trim(); if (!place) { setVoiceHint('写个地点吧'); setTimeout(() => setVoiceHint(''), 1500); return; }
    setSendingLoc(true);
    try {
      const r = await fetch(`${BACKEND}/location/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ char_id: charId, place, note: locNote.trim(), session_id: sessionId }) });
      const d = await r.json();
      if (d.ok) {
        const card = { role: 'user', content: '__LOC__' + JSON.stringify({ place, note: locNote.trim() }) };
        const reactionMsgs = (d.reaction || '').split('|||').map(s => s.trim()).filter(Boolean).map(s => ({ role: 'assistant', content: s, reply: s }));
        setMessages(prev => [...prev, card, ...reactionMsgs]);
        closeLoc();
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
      } else { setVoiceHint(d.error || '发送失败'); setTimeout(() => setVoiceHint(''), 1500); }
    } catch { setVoiceHint('发送失败'); setTimeout(() => setVoiceHint(''), 1500); }
    setSendingLoc(false);
  };
  const sendGift = async () => {
    if (sendingGift) return;
    const amount = Math.max(0, Math.min(100000, Math.round((Number(giftAmt) || 0) * 100) / 100)); // 保留两位小数（5.2/13.14 不被抹成整数）
    if (giftKind !== 'familycard' && amount <= 0) { setVoiceHint('金额要大于 0'); setTimeout(() => setVoiceHint(''), 1500); return; }
    const amtFinal = giftKind === 'familycard' ? (amount || 2000) : amount;
    setSendingGift(true);
    try {
      const r = await fetch(`${BACKEND}/wallet/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ char_id: charId, kind: giftKind, amount: amtFinal, note: giftNote.trim() }) });
      const d = await r.json();
      if (d.ok) {
        const card = { role: 'user', content: '__WALLET__' + JSON.stringify({ w: giftKind, dir: 'to_char', amt: amtFinal, note: giftNote.trim(), id: d.event?.id, st: d.event?.status || 'received' }) };
        const reactionMsgs = (d.reaction || '').split('|||').map(s => s.trim()).filter(Boolean).map(s => ({ role: 'assistant', content: s, reply: s }));
        setMessages(prev => [...prev, card, ...reactionMsgs]);
        closeGift();
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
      } else { setVoiceHint(d.error || '发送失败'); setTimeout(() => setVoiceHint(''), 1500); }
    } catch { setVoiceHint('发送失败'); setTimeout(() => setVoiceHint(''), 1500); }
    setSendingGift(false);
  };
  // 拆角色发来的红包：按钱包 id 匹配（不靠数组下标，loadMore 不会拆错），且只在成功后才标记已领取
  const openRedpacket = async (id) => {
    if (!id) return;
    let ok = false;
    try { const r = await fetch(`${BACKEND}/wallet/open`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }); const d = await r.json().catch(() => ({})); ok = r.ok && d.ok !== false; } catch {}
    if (!ok) { setVoiceHint('领取失败，稍后再试'); setTimeout(() => setVoiceHint(''), 1500); return; }
    setMessages(prev => prev.map(m => {
      const o = safeParseWallet(m.content);
      if (!o || o.id !== id) return m;
      o.st = 'opened'; const nc = '__WALLET__' + JSON.stringify(o);
      return { ...m, content: nc, reply: m.role === 'assistant' ? nc : m.reply };
    }));
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    if (file.size > 10 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      setPendingImage({ data: dataUrl.split(',')[1], type: file.type, name: file.name, preview: dataUrl });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // ===== 连麦：按一下录音 → 后端转写 → 自动作为消息发出 =====
  const blobToBase64 = (blob) => new Promise((resolve) => { const r = new FileReader(); r.onloadend = () => resolve(r.result); r.readAsDataURL(blob); });
  const recordModeRef = useRef('text');   // 'text'=转文字发送；'voice'=发语音条
  const toggleRecord = async (modeArg) => {
    if (transcribing) return;
    if (recording) { try { mediaRecorderRef.current?.stop(); } catch {} return; }
    recordModeRef.current = modeArg === 'voice' ? 'voice' : 'text';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(tr => tr.stop());
        setRecording(false);
        const blob = new Blob(audioChunksRef.current, { type: mr.mimeType || 'audio/mp4' });
        if (blob.size < 1200) { setVoiceHint('太短啦，再说一次'); setTimeout(() => setVoiceHint(''), 2200); return; }
        const isVoice = recordModeRef.current === 'voice';
        setTranscribing(true); setVoiceHint(isVoice ? '处理语音…' : '转写中…');
        try {
          const dataUrl = await blobToBase64(blob);
          let audioUrl = null;
          if (isVoice) {
            try { const up = await fetch(`${BACKEND}/upload`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: dataUrl.split(',')[1], type: blob.type || 'audio/mp4', name: 'voice.webm' }) }); const ud = await up.json(); audioUrl = ud.url || null; } catch {}
          }
          const res = await fetch(`${BACKEND}/stt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audio: dataUrl, mime: blob.type }) });
          const d = await res.json().catch(() => ({}));
          const text = (d.text || '').trim();
          setTranscribing(false); setVoiceHint('');
          if (isVoice) sendVoiceMessage(audioUrl, text);
          else if (text) send(text);
          else { setVoiceHint('没听清，再试一次'); setTimeout(() => setVoiceHint(''), 2400); }
        } catch { setTranscribing(false); setVoiceHint('处理失败，检查网络'); setTimeout(() => setVoiceHint(''), 2400); }
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true); setVoiceHint('');
    } catch { setVoiceHint('需要麦克风权限'); setTimeout(() => setVoiceHint(''), 2600); }
  };

  // 发语音条：以语音条形式发出（角色仍收到转写文本以便理解）
  const sendVoiceMessage = (audioUrl, transcript) => {
    const tt = (transcript || '').trim();
    if (!audioUrl && !tt) { setVoiceHint('没录到内容'); setTimeout(() => setVoiceHint(''), 2000); return; }
    lastActiveRef.current = Date.now();
    setMessages(prev => [...prev, { role: 'user', content: tt || '[语音]', voiceUrl: audioUrl, transcript: tt, voiceMode: true, voiceCapable: true, reply: tt }]);
    genQueueRef.current.push({ fullText: tt ? `[语音消息] ${tt}` : '[语音消息]（没听清内容）', isHidden: false });
    processQueue();
  };

  const send = async (overrideText) => {
    const baseText = (typeof overrideText === 'string' ? overrideText : input);
    if (!baseText.trim() && !pendingImage) return;   // 不再因 loading 阻塞 → 可以连发
    const text = baseText.trim();

    // 智能拦截待办事项 — 带确认闪烁
    const todoMatch = text.match(/^(?:提醒我|记一下|待办|加待办|记得)(?:一下)?[:：\s]*(.+)/);
    if (todoMatch && todoMatch[1]) {
      addGlobalTodo(todoMatch[1]);
      setTodoAdded(todoMatch[1]);
      setTimeout(() => setTodoAdded(''), 2500);
    }

    lastActiveRef.current = Date.now();
    setInput('');

    // Image upload
    let imageUrl = null;
    if (pendingImage) {
      const img = pendingImage; setPendingImage(null); setUploadingImage(true);
      try {
        const res = await fetch(`${BACKEND}/upload`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: img.data, type: img.type, name: img.name }),
        });
        const d = await res.json();
        imageUrl = d.url || null;
      } catch {}
      setUploadingImage(false);
    }

    // 引用回复：把被引用的话作为前缀标记，模型能读懂、渲染时显示成引用块
    // 引用文本里去掉方括号/换行，保证标记 [引用 …] 内部不含 ] —— 否则解析正则会在中途的 ] 截断、错乱后续图片解析
    const qPrefix = quoting ? `[引用 ${String(quoting.who).replace(/[\[\]：\n]/g, ' ')}：${String(quoting.text).replace(/[\[\]\n]/g, ' ').slice(0, 60)}]\n` : '';
    if (quoting) setQuoting(null);
    const fullText = qPrefix + (imageUrl ? (text ? `${text}\n\n[附图: ${imageUrl}]` : `[附图: ${imageUrl}]`) : text);
    const displayContent = qPrefix + (text || (imageUrl ? '📷 图片' : ''));
    const localId = `u_${Date.now()}_${++sidCounterRef.current}`;
    setMessages(prev => [...prev, { role: 'user', content: displayContent, imageUrl, thinking: null, reply: displayContent, ts: new Date().toISOString(), id: localId }]);
    if (imageUrl) {
      // 含图片：不合并，立即走原路径（/chat 会插入用户消息 + 视觉识别 + 生成）
      genQueueRef.current.push({ fullText, isHidden: false });
      processQueue();
    } else {
      // 纯文字：攒进缓冲，1.4s 后把这一轮所有消息「一次性」发给 /chat（原子插入+生成一次回复，不丢消息）
      coalesceRef.current.texts.push(fullText);
      if (coalesceRef.current.timer) clearTimeout(coalesceRef.current.timer);
      coalesceRef.current.timer = setTimeout(flushCoalesced, 1400);
    }
  };

  // 连发合并：把攒下的这一轮消息作为 user_batch 一次性发出（后端逐条入库 + 生成一次回复）
  const flushCoalesced = () => {
    const c = coalesceRef.current;
    if (c.timer) { clearTimeout(c.timer); c.timer = null; }
    const batch = c.texts; c.texts = [];
    if (!batch.length) return;
    genQueueRef.current.push({ userBatch: batch, isHidden: false });
    processQueue();
  };
  // flushCoalesced 每渲染重定义、闭包里是当帧 sessionId；用 ref 存最新的，急救 flush 才不会用到首帧陈旧 sessionId(=null)去多绕一次重取。
  flushCoalescedRef.current = flushCoalesced;
  // 防吞消息：app 切后台/关闭/离开聊天时，把还压在 1.4s 合并缓冲里的消息立刻发出去——iOS 后台会冻结 timer，不抢发就丢了。
  useEffect(() => {
    const flush = () => { if (coalesceRef.current.texts.length) flushCoalescedRef.current && flushCoalescedRef.current(); };
    const onVis = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', flush);
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', flush); flush(); };   // 卸载(离开聊天)也 flush，别丢
  }, []);

  // 串行处理发送队列：支持连发（用户可一口气发多条，合并成一轮回复）
  const processQueue = async () => {
    if (genBusyRef.current) return;
    const job = genQueueRef.current.shift();
    if (!job) { setLoading(false); return; }
    genBusyRef.current = true;
    const myGen = streamGenRef.current;
    setLoading(true);
    const sid = `a_${Date.now()}_${++sidCounterRef.current}`;
    // try/finally：即使 streamResponse 抛错/被中断，也一定复位 genBusy，否则后续消息会永久只入队不发送（"消息被吞"）
    try { await streamResponse(job.fullText || '', sid, job.isHidden, myGen, job.editRegen, job.userBatch); }
    catch {}
    finally { genBusyRef.current = false; }
    if (streamGenRef.current !== myGen) return;   // 期间切了角色 → 放弃后续
    processQueue();
  };

  const streamResponse = async (text, sid, isHiddenPrompt, genAtStart, editRegen = false, userBatch = null) => {
    const myGen = genAtStart !== undefined ? genAtStart : streamGenRef.current;
    const longMode = isLong;
    let created = false;
    const apply = (patch) => setMessages(prev => {
      if (streamGenRef.current !== myGen) return prev;   // 已切换角色：丢弃这个角色之外的写入
      if (!created) { created = true; return [...prev, { role: 'assistant', id: sid, thinking: null, reply: '', thinkingOpen: false, ts: new Date().toISOString(), ...patch }]; }
      return prev.map(m => m.id === sid ? { ...m, ...patch } : m);
    });
    try {
      // ★ 防串台：会话还没恢复好(进对话竞态 / iOS 清了本地缓存)就别发 null —— 当场把这个角色的固定会话拉到手再发，绝不让后端拿到空 session_id 去瞎兜底
      let sidToUse = sessionId;
      if (sidToUse == null || sidToUse === '' || isNaN(Number(sidToUse))) {
        for (let a = 0; a < 3 && (sidToUse == null || sidToUse === '' || isNaN(Number(sidToUse))); a++) {
          try {
            const sres = await fetch(`${BACKEND}/character-session/${char.id}${nsfw ? '?nsfw=1' : ''}`);
            const sdata = await sres.json();
            if (sdata && sdata.session_id) { sidToUse = sdata.session_id; setSessionId(sdata.session_id); saveSession(char.id, sdata.session_id); break; }
          } catch {}
          await new Promise(r => setTimeout(r, 400 * (a + 1)));
        }
      }
      // 微信(短)模式默认不生成思维链（按需点开补生成）；深聊(长)模式仍自动生成
      // 停顿超时：60s 收不到任何数据就 abort（半开连接/后端 hang 时让 fetch 一定 settle，否则 reader.read() 永挂 → genBusy 永久卡 → 后续消息全被吞）
      const ctrl = new AbortController();
      let stallTimer = setTimeout(() => { try { ctrl.abort(); } catch {} }, 60000);
      const res = await fetch(`${BACKEND}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal, body: JSON.stringify({ message: text, session_id: sidToUse, character_id: char.id, model: model.value, mode, nsfw, max_tokens: 8000, want_thinking: isLong || getChatPref(char.id, 'thinkopen'), ...(editRegen ? { edit_regen: true } : {}), ...(userBatch ? { user_batch: userBatch } : {}) }) });
      const reader = res.body.getReader(), decoder = new TextDecoder('utf-8');
      let full = '', recalled = null, liveThinking = null, sseBuf = '', isDone = false, shareCard = null, songCard = null, savedDbId = null;
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        clearTimeout(stallTimer); stallTimer = setTimeout(() => { try { ctrl.abort(); } catch {} }, 60000);   // 有数据就续命
        sseBuf += decoder.decode(value, { stream: true });
        const parts = sseBuf.split('\n\n'); sseBuf = parts.pop();   // 跨 chunk 缓冲整条 SSE（大段思维链不再被截断丢失）
        let changed = false;
        for (const part of parts) {
          for (const line of part.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const p = JSON.parse(line.slice(6));
              if (p.text) { full += p.text; changed = true; }
              if (p.memories) { recalled = p.memories; changed = true; }
              if (p.thinking) { liveThinking = p.thinking; changed = true; }
              if (p.share) { shareCard = p.share; }
              if (p.song) { songCard = p.song; }
              if (p.done) { isDone = true; if (p.savedId != null) savedDbId = p.savedId; changed = true; }
            } catch {}
          }
        }
        if (!changed) continue;
        const parsed = splitThinkingReply(full);
        const thinking = liveThinking ?? parsed.thinking;
        // 沈屿主动语音:正文里写 [voice]→在第一个标记处截断(随发随剥,不留闪现/不露字面量)。
        // before=标记前文字(气泡),voice=标记后文字(语音条)。流式途中只渲染 before 文字,
        // isDone 落定时再标 voiceMode + 挂 voiceTail(渲染成语音条)。reply 始终不含标记字面量与语音段。
        const vm = splitVoiceTag(parsed.reply);
        const hasVoice = !!vm.voice.trim();
        const reply = vm.before;             // 流式途中:只显示标记前的文字
        if (longMode) {
          // 长文：思维链先到→展示💭，正文逐字流式
          if (thinking || reply || isDone) apply({ content: full, thinking, reply, streaming: !isDone, ...(recalled ? { recalled } : {}), ...(isDone && hasVoice ? { voiceMode: true, voiceCapable: true, voiceTail: vm.voice } : {}), ...(isDone && savedDbId != null ? { dbId: savedDbId } : {}) });
        } else {
          // 微信：正文生成好之后一次性给；思维链一到先弹💭
          if (isDone) {
            // 沈屿打了 [voice] → 强制语音条;否则沿用原有「短回复随机 20% 转语音」彩蛋。
            const randVoice = !hasVoice && reply && reply.length < 80 && !reply.includes('|||') && Math.random() < 0.2;
            const voiceMode = hasVoice || randVoice;
            // 多条回复（含 |||）标记为「刚流式完成」→ 渲染时逐条动画发出
            if (reply && reply.includes('|||')) freshStreamedRef.current.add(sid);
            apply({ content: full, thinking, reply, streaming: false, ...(recalled ? { recalled } : {}), ...(voiceMode ? { voiceMode: true, voiceCapable: true } : {}), ...(hasVoice ? { voiceTail: vm.voice } : {}), ...(savedDbId != null ? { dbId: savedDbId } : {}) });
          } else if (thinking) {
            apply({ thinking, streaming: true, ...(recalled ? { recalled } : {}) });
          }
        }
      }
      clearTimeout(stallTimer);
      // flush 残余 sseBuf：末条 data 可能没以 \n\n 收尾滞留在 buffer（否则 done/savedId/末段正文会丢）
      if (sseBuf && sseBuf.indexOf('data: ') !== -1) {
        for (const line of sseBuf.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try { const p = JSON.parse(line.slice(6)); if (p.text) full += p.text; if (p.thinking) liveThinking = p.thinking; if (p.done) { isDone = true; if (p.savedId != null) savedDbId = p.savedId; } if (p.share) shareCard = p.share; if (p.song) songCard = p.song; } catch {}
        }
      }
      const finalParsed = splitThinkingReply(full); const finalVm = splitVoiceTag(finalParsed.reply); const finalHasVoice = !!finalVm.voice.trim();
      if (!created) { apply({ content: full, thinking: liveThinking ?? finalParsed.thinking, reply: finalVm.before || '', streaming: false, ...(finalHasVoice ? { voiceMode: true, voiceCapable: true, voiceTail: finalVm.voice } : {}), ...(savedDbId != null ? { dbId: savedDbId } : {}) }); }
      else if (!isDone && finalParsed.reply) { apply({ content: full, thinking: liveThinking ?? finalParsed.thinking, reply: finalVm.before || '', streaming: false, ...(finalHasVoice ? { voiceMode: true, voiceCapable: true, voiceTail: finalVm.voice } : {}), ...(savedDbId != null ? { dbId: savedDbId } : {}) }); }   // 截断兜底：只建了思维链气泡、正文没落 → 补上
      else apply({ streaming: false, ...(savedDbId != null ? { dbId: savedDbId } : {}) });
      // 角色分享了真实链接 → 追加一张分享卡（后端也已落库，刷新仍在）
      if (shareCard && streamGenRef.current === myGen) {
        const cardId = `share_${Date.now()}_${++sidCounterRef.current}`;
        setMessages(prev => [...prev, { role: 'assistant', id: cardId, content: '__SHARE__' + JSON.stringify(shareCard), reply: '', ts: new Date().toISOString() }]);
      }
      // 角色点歌 → 追加一张网易云歌卡
      if (songCard && streamGenRef.current === myGen) {
        const cardId = `song_${Date.now()}_${++sidCounterRef.current}`;
        setMessages(prev => [...prev, { role: 'assistant', id: cardId, content: '__SONG__' + JSON.stringify(songCard), reply: '', ts: new Date().toISOString() }]);
      }
    } catch {
      apply({ reply: '网络出了点小状况…', streaming: false });
    }
  };

  // 按需补生成单条思维链：点「看看TA在想什么」时调用 /monologue，结果挂在该条消息上方
  const fetchThinking = async (idx) => {
    const msg = messages[idx];
    if (!msg || msg.thinkingLoading || msg.thinking || msg.thinkingOpen) return;  // 已有/生成中则不重复生成
    let src = '';
    for (let j = idx - 1; j >= 0; j--) { if (messages[j].role === 'user') { src = messages[j].reply || messages[j].content || ''; break; } }
    // 写回按 mkey 定位（loadMore 前插历史后 index 会整体偏移，不能再按 index 写）；无 key 的旧消息退回 index
    const key = mkey(msg);
    const upd = (patch) => setMessages(prev => prev.map((m, j) => ((key != null ? mkey(m) === key : j === idx)) ? { ...m, ...patch } : m));
    upd({ thinkingLoading: true });
    try {
      const r = await fetch(`${BACKEND}/monologue`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ character_id: char.id, message: src, model: model.value }) });
      const d = await r.json();
      upd({ thinking: (d.thinking || '').trim() || '（这一刻没什么特别的念头）', thinkingLoading: false, thinkingManual: true });
    } catch {
      upd({ thinkingLoading: false });
    }
  };

  // ===== 重新生成 / 编辑 / 分支 =====
  const mkey = (m) => (m.dbId ?? m.id);
  // 从后端重新拉取整段对话（拿到更新后的 content + meta 分支信息）
  const reloadMessages = async () => {
    if (!sessionId) return;
    try {
      const lim = Math.max(50, msgOffset + 50);   // 覆盖已「加载更早」的历史，重答/编辑后不缩回 50 条
      const res = await fetch(`${BACKEND}/session/${sessionId}/messages?limit=${lim}&offset=0`);
      const data = await res.json();
      if (Array.isArray(data.messages)) {
        setMessages(filterHistory(data.messages.map(msg => {
          return { role: msg.role, content: msg.content, ...parseMsgFields(msg.content, msg.role), dbId: msg.id, meta: msg.meta || null, ts: msg.created_at };
        })));
        setMsgTotal(data.total || 0);
      }
    } catch {}
  };
  // 读完一次 /chat 的 SSE（直到流结束，确保后端已生成+落库）
  const drainChat = async (body) => {
    const res = await fetch(`${BACKEND}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const reader = res.body.getReader(), decoder = new TextDecoder('utf-8');
    while (true) { const { done } = await reader.read(); if (done) break; }
  };
  // 重新生成最后一条 AI（re-roll）
  const doRetry = async () => {
    if (loading || genBusyRef.current || branchBusy || !sessionId) return;
    setBranchBusy(true); setLoading(true);
    const myGen = streamGenRef.current;
    // 先记下原消息，失败时还原（否则清空后 catch 吞错、回复直接丢失）
    let orig = null;
    for (let i = messages.length - 1; i >= 0; i--) { if (messages[i].role === 'assistant') { orig = messages[i]; break; } }
    setMessages(prev => { const arr = prev.slice(); for (let i = arr.length - 1; i >= 0; i--) { if (arr[i].role === 'assistant') { arr[i] = { ...arr[i], streaming: true, reply: '' }; break; } } return arr; });
    let ok = true;
    try { await drainChat({ retry: true, session_id: sessionId, character_id: char.id, model: model.value, mode, nsfw, max_tokens: 8000, want_thinking: isLong || getChatPref(char.id, 'thinkopen') }); } catch { ok = false; }
    if (!ok && orig) setMessages(prev => { const arr = prev.slice(); for (let i = arr.length - 1; i >= 0; i--) { if (arr[i].role === 'assistant') { arr[i] = { ...arr[i], streaming: false, reply: orig.reply }; break; } } return arr; });
    if (streamGenRef.current === myGen) await reloadMessages();
    setBranchBusy(false); setLoading(false);
  };
  // 切换 re-roll 版本（前端即时 + 持久化所选）
  const switchReroll = (key, dir) => {
    setMessages(prev => prev.map(m => {
      if (mkey(m) !== key || !m.meta || !Array.isArray(m.meta.branches) || m.meta.branches.length < 2) return m;
      const cur = m.meta.branch_idx ?? (m.meta.branches.length - 1);
      const ni = cur + dir;
      if (ni < 0 || ni >= m.meta.branches.length) return m;
      const full = m.meta.branches[ni].content || '';
      const f = parseMsgFields(full, 'assistant');
      if (m.dbId != null) fetch(`${BACKEND}/chat/reroll/select`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: sessionId, msg_id: m.dbId, branch_idx: ni }) }).catch(() => {});
      // 切换分支时也重置 voiceMode/voiceTail:新分支含 [voice] 则成语音条,否则回文字气泡(清掉上一分支可能留下的 voiceMode/voiceTail)。
      return { ...m, content: full, reply: f.reply, thinking: f.thinking, voiceMode: !!f.voiceMode, voiceTail: f.voiceTail || undefined, voiceCapable: f.voiceMode ? true : m.voiceCapable, meta: { ...m.meta, branch_idx: ni } };
    }));
  };
  // 编辑用户消息 → 截断 → 重答
  const startEdit = (m) => { setEditingKey(mkey(m)); setEditText(m.reply || m.content || ''); };
  // 长按气泡＝引用这条（不再每条占一行放「引用」按钮）
  const quoteMsg = (m) => {
    if (!m || safeParseWallet(m.content) || safeParseLoc(m.content) || safeParseShare(m.content) || safeParseSong(m.content)) return;
    const base = String(m.reply || m.content || '').replace(/^\[引用[\s\S]*?\]\n?/, '').replace(/\[附图:[^\]]*\]/g, '[图片]').replace(/\[语音消息\][（(][^）)]*[）)]/g, '').replace(/\[语音消息\]/g, '').replace(/\|\|\|/g, ' ').trim();
    if (base) setQuoting({ who: m.role === 'user' ? '我' : char.name, text: base.slice(0, 60) });
  };
  const lpStart = (m) => { lpFiredRef.current = false; clearTimeout(lpTimerRef.current); lpTimerRef.current = setTimeout(() => { lpFiredRef.current = true; quoteMsg(m); }, 480); };
  const lpCancel = () => { clearTimeout(lpTimerRef.current); };
  const cancelEdit = () => { setEditingKey(null); setEditText(''); };
  const saveEdit = async (m) => {
    const c = editText.trim();
    if (!c || m.dbId == null || branchBusy || !sessionId) { cancelEdit(); return; }
    const key = mkey(m);
    setEditingKey(null); setBranchBusy(true); setLoading(true);
    const myGen = streamGenRef.current;
    try {
      const r = await fetch(`${BACKEND}/chat/edit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: sessionId, msg_id: m.dbId, content: c }) });
      const d = await r.json();
      if (!d.ok) { setBranchBusy(false); setLoading(false); return; }
    } catch { setBranchBusy(false); setLoading(false); return; }
    // 本地：改写该条 + 截断其后
    setMessages(prev => { const idx = prev.findIndex(x => mkey(x) === key); if (idx < 0) return prev; const arr = prev.slice(0, idx + 1); arr[idx] = { ...arr[idx], content: c, reply: c, edited: true }; return arr; });
    try { await drainChat({ edit_regen: true, session_id: sessionId, character_id: char.id, model: model.value, mode, nsfw, max_tokens: 8000, want_thinking: isLong || getChatPref(char.id, 'thinkopen') }); } catch {}
    if (streamGenRef.current === myGen) await reloadMessages();
    setBranchBusy(false); setLoading(false);
  };
  // 切换编辑分支（整段对话）
  const switchEditBranch = async (forkKey, branchId) => {
    if (branchBusy || !sessionId) return;
    const m = messages.find(x => mkey(x) === forkKey);
    if (!m || m.dbId == null) return;
    setBranchBusy(true);
    try {
      await fetch(`${BACKEND}/chat/branch/switch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: sessionId, fork_id: m.dbId, branch_id: branchId }) });
      await reloadMessages();
    } catch {}
    setBranchBusy(false);
  };
  // 最后一条 AI 的 key（只有它显示 ↻）
  const lastAiKey = (() => { for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'assistant') return mkey(messages[i]); return null; })();
  const navBtn = { cursor: 'pointer', padding: '2px 6px', fontSize: 13, color: t.text3, borderRadius: 6, userSelect: 'none' };
  const navCount = { fontFamily: 'monospace', fontSize: 10, color: t.text3, minWidth: 22, textAlign: 'center' };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%' }}>
      <div style={{ backgroundColor: t.isGlass ? 'rgba(255,255,255,0.2)' : t.card, backdropFilter: `blur(${t.blur})`, WebkitBackdropFilter: `blur(${t.blur})`, borderBottom: t.isPixel ? `2px solid ${t.border}` : `0.5px solid ${t.border}`, flexShrink: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 9px 6px', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span className="tap" onClick={onBack} style={{ fontSize: 18, color: t.text3, cursor: 'pointer', padding: '2px 2px', flexShrink: 0 }}>‹</span>
            <div className="tap" onClick={() => onProfile?.(char.id)} style={{ cursor: 'pointer', flexShrink: 0 }}><CharAvatar c={char} size={30} /></div>
            <div className="tap" onClick={() => onProfile?.(char.id)} style={{ lineHeight: 1.2, cursor: 'pointer', minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: t.text1, fontFamily: 'inherit', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 96 }}>{getRemark(char.id) || char.name}</div>
              <div style={{ fontSize: 9, color: '#85A985', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: '#85A985', display: 'inline-block' }} />online</div>
            </div>
            <span className="tap" onClick={() => { const nm = isLong ? 'short' : 'long'; setSavedMode(char.id, nm); setChatMode(nm); }} title="切换 微信/深聊" style={{ fontSize: 9, color: t.acc, padding: '2px 8px', border: `0.5px solid ${t.acc}55`, borderRadius: t.radius > 0 ? 10 : 0, fontFamily: 'inherit', backgroundColor: `${t.acc}12`, marginLeft: 2, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>{isLong ? '深聊' : '微信'} ⇄</span>
          </div>
          <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <div className="tap" onClick={() => setShowModelMenu(!showModelMenu)} style={{ fontSize: 9, color: t.text3, padding: '4px 7px', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 96, border: `0.5px solid ${t.border}`, borderRadius: t.radius > 0 ? 14 : 0, fontFamily: 'inherit', backgroundColor: 'rgba(255,255,255,0.2)', flexShrink: 1 }}>{model.label}{isModelThinking(model) ? ' ✦' : ''} ▾</div>
              {showModelMenu && (() => {
                const thinkingModels = char.models.filter(m => isModelThinking(m));
                const normalModels = char.models.filter(m => !isModelThinking(m));
                const pickModel = (i) => {
                  setModelIdx(i);
                  setSavedModelIdx(char.id, i);   // 记住该角色的默认模型，下次进来不重置
                  setShowModelMenu(false);
                  // 模型与微信/长文解耦：选模型不再强制切换模式，模式由顶部「微信⇄长文」自行切换
                };
                return (
                  <div style={{ position: 'absolute', top: 30, right: 0, backgroundColor: t.isGlass ? 'rgba(255,255,255,0.92)' : t.card, backdropFilter: `blur(${t.blur})`, border: `0.5px solid ${t.border}`, borderRadius: t.radius, boxShadow: t.shadow, zIndex: 100, minWidth: 180, overflow: 'hidden' }}>
                    {normalModels.length > 0 && <div style={{ fontSize: 8, color: t.text3, letterSpacing: '0.1em', padding: '7px 12px 3px' }}>STANDARD · 微信</div>}
                    {normalModels.map(m => { const i = char.models.indexOf(m); return (
                      <div key={m.value} className="tap" onClick={() => pickModel(i)} style={{ padding: '8px 12px', fontSize: 11, color: i === modelIdx ? char.accent : t.text2, backgroundColor: i === modelIdx ? 'rgba(0,0,0,0.03)' : 'transparent', cursor: 'pointer', borderBottom: `0.5px solid ${t.border}`, fontFamily: 'inherit' }}>{m.label}</div>
                    ); })}
                    {thinkingModels.length > 0 && <div style={{ fontSize: 8, color: t.text3, letterSpacing: '0.1em', padding: '7px 12px 3px' }}>THINKING · 长文</div>}
                    {thinkingModels.map(m => { const i = char.models.indexOf(m); return (
                      <div key={m.value} className="tap" onClick={() => pickModel(i)} style={{ padding: '8px 12px', fontSize: 11, color: i === modelIdx ? char.accent : t.text2, backgroundColor: i === modelIdx ? 'rgba(0,0,0,0.03)' : 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}><span>{m.label}</span><span style={{ fontSize: 9, color: t.text3, marginLeft: 6 }}>(thinking)</span></div>
                    ); })}
                  </div>
                );
              })()}
            </div>
          <div className="tap" onClick={openHistory} title="历史对话" style={{ fontSize: 9, color: t.text3, cursor: 'pointer', padding: '4px 7px', border: `0.5px solid ${t.border}`, borderRadius: t.radius > 0 ? 14 : 0, fontFamily: 'inherit', backgroundColor: 'rgba(255,255,255,0.2)', whiteSpace: 'nowrap', flexShrink: 0 }}>历史</div>
          <div className="tap" onClick={() => loadOrCreate(charIdx, modelIdx, true)} style={{ fontSize: 9, color: t.text3, cursor: 'pointer', padding: '4px 7px', border: `0.5px solid ${t.border}`, borderRadius: t.radius > 0 ? 14 : 0, fontFamily: 'inherit', backgroundColor: 'rgba(255,255,255,0.2)', whiteSpace: 'nowrap', flexShrink: 0 }}>新对话</div>
          <div className="tap" onClick={() => setShowCall(true)} title="语音通话" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: '4px 8px', border: `0.5px solid ${t.border}`, borderRadius: t.radius > 0 ? 14 : 0, backgroundColor: 'rgba(255,255,255,0.2)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.text3} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z"/></svg>
          </div>
          <div className="tap" onClick={() => setShowSettings(true)} title="单聊设置" style={{ fontSize: 16, lineHeight: 1, color: t.text3, cursor: 'pointer', padding: '3px 8px', border: `0.5px solid ${t.border}`, borderRadius: t.radius > 0 ? 14 : 0, fontFamily: 'inherit', backgroundColor: 'rgba(255,255,255,0.2)' }}>⋯</div>
          </div>
        </div>
      </div>

      {showSettings && <ChatSettingsSheet t={t} char={char} sessionId={sessionId} modelIdx={modelIdx} onPickModel={(i) => { setModelIdx(i); setSavedModelIdx(char.id, i); }} mode={mode} setChatMode={setChatMode} onNewChat={() => { setShowSettings(false); loadOrCreate(charIdx, modelIdx, true); }} onClearMessages={async () => { if (sessionId) { try { await fetch(`${BACKEND}/session/${sessionId}/messages`, { method: 'DELETE' }); } catch {} } setMessages([]); }} onClose={() => setShowSettings(false)} />}

      {showCall && <CallScreen t={t} char={char} sessionId={sessionId} model={model} mode={mode} onClose={() => setShowCall(false)} />}

      {showHistory && (
        <div onClick={() => setShowHistory(false)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, maxHeight: '78vh', background: t.card, borderTopLeftRadius: 18, borderTopRightRadius: 18, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 18px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `0.5px solid ${t.border}` }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: t.text1 }}>历史对话 · {getRemark(char.id) || char.name}</div>
              <div className="tap" onClick={() => { setShowHistory(false); loadOrCreate(charIdx, modelIdx, true); }} style={{ fontSize: 12, color: char.accent, cursor: 'pointer', padding: '4px 10px', border: `0.5px solid ${char.accent}55`, borderRadius: 12 }}>＋ 新对话</div>
            </div>
            <div style={{ overflowY: 'auto', padding: '6px 0 16px' }}>
              {historyList === null && <div style={{ padding: '24px', textAlign: 'center', color: t.text3, fontSize: 13 }}>加载中…</div>}
              {historyList && historyList.length === 0 && <div style={{ padding: '24px', textAlign: 'center', color: t.text3, fontSize: 13 }}>还没有其他对话</div>}
              {historyList && historyList.map(s => {
                const active = s.id === sessionId;
                const when = (() => { try { const d = new Date(s.last_at); const mm = String(d.getMonth() + 1).padStart(2, '0'); const dd = String(d.getDate()).padStart(2, '0'); const hh = String(d.getHours()).padStart(2, '0'); const mi = String(d.getMinutes()).padStart(2, '0'); return `${mm}/${dd} ${hh}:${mi}`; } catch { return ''; } })();
                return (
                  <div key={s.id} className="tap" onClick={() => switchToSession(s.id)} style={{ padding: '11px 18px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', background: active ? `${char.accent}10` : 'transparent', borderLeft: active ? `3px solid ${char.accent}` : '3px solid transparent' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: t.text2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.preview || '（空对话）'}</div>
                      <div style={{ fontSize: 10, color: t.text3, marginTop: 3 }}>{when} · {s.count} 条{active ? ' · 当前' : ''}</div>
                    </div>
                    <div className="tap" onClick={e => { e.stopPropagation(); if (confirm('删除这段对话？不可恢复。')) deleteSession(s.id); }} style={{ fontSize: 11, color: '#c0564f', padding: '4px 8px', flex: 'none', cursor: 'pointer' }}>删除</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className={`hs ${chatBgUrl ? '' : (t.isDark ? 'chat-stars-dark' : 'chat-stars')}`} ref={msgScrollRef} onClick={() => setShowModelMenu(false)} onScroll={e => { const el = e.currentTarget; userScrolledRef.current = (el.scrollHeight - el.scrollTop - el.clientHeight) > 140; }} style={{ flex: 1, overflowY: 'auto', padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 12, ...(chatBgUrl ? { backgroundImage: `url(${chatBgUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}) }}>
        {msgTotal > msgOffset + 50 && (
          <div style={{ textAlign: 'center', paddingTop: 4 }}>
            <button className="tap" onClick={loadMore} disabled={loadingMore} style={{ fontSize: 11, color: t.text3, backgroundColor: 'transparent', border: `1px solid ${t.border}`, borderRadius: t.radius > 0 ? 20 : 0, padding: '5px 16px', cursor: 'pointer', fontFamily: 'inherit' }}>{loadingMore ? '加载中…' : '查看更早消息'}</button>
          </div>
        )}
        {messages.map((msg, i) => {
          const prevMsg = messages[i - 1];
          const isConsecutiveAssistant = msg.role === 'assistant' && prevMsg?.role === 'assistant';
          const walletData = safeParseWallet(msg.content);
          const locData = safeParseLoc(msg.content);
          const shareData = safeParseShare(msg.content);
          const songData = safeParseSong(msg.content);
          return (
          msg.role === 'system' ? (
            <div key={i} style={{ textAlign: 'center', padding: '8px 0' }}>
              <span style={{ fontSize: 10, color: t.text3, fontStyle: 'italic', letterSpacing: '0.04em', fontFamily: 'inherit', opacity: 0.7 }}>{msg.content}</span>
            </div>
          ) : (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 5, animation: 'fadeIn 0.3s ease', marginTop: isConsecutiveAssistant && !isLong ? -6 : 0 }}>
            {msg.role === 'assistant' && !isConsecutiveAssistant && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, paddingLeft: 3 }}>
                <CharAvatar c={char} size={16} />
                <span style={{ fontSize: 10, color: t.text3, fontFamily: 'inherit', letterSpacing: '0.1em' }}>{char.name}</span>
              </div>
            )}
            
            {msg.role === 'assistant' && (() => { const _md = splitMoodTags(msg.content || '').tags; return _md.length ? <MoodPills tags={_md} t={t} /> : null; })()}
            {msg.role === 'assistant' && (msg.thinking || msg.thinkingOpen || msg.thinkingLoading) && <ThinkingPill thinking={msg.thinking} thinkingOpen={msg.thinkingOpen} loading={msg.thinkingLoading} initialOpen={msg.thinkingManual || getChatPref(char.id, 'thinkopen')} char={char} t={t} />}
            {msg.role === 'assistant' && msg.recalled?.length > 0 && <MemoryPill memories={msg.recalled} char={char} t={t} />}

            {walletData && <WalletCard data={walletData} onOpen={() => openRedpacket(walletData.id)} />}
            {locData && <LocationCard data={locData} t={t} />}
            {shareData && <ShareCard data={shareData} t={t} />}
            {songData && <SongCard data={songData} t={t} />}
            {msg.role === 'assistant' && (() => { const _q = splitMusicTags(msg.content || '').q; return _q ? <MusicMarkerCard q={_q} t={t} /> : null; })()}

            {msg.role === 'user' && editingKey === mkey(msg) && (
              <div style={{ width: '100%', maxWidth: '82%', alignSelf: 'flex-end' }}>
                <textarea value={editText} onChange={e => setEditText(e.target.value)} className="hs" style={{ width: '100%', minHeight: 60, maxHeight: 200, border: `1px solid ${t.border}`, borderRadius: 12, padding: '8px 10px', fontSize: 14, background: t.card, color: t.text1, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
                  <button className="tap" onClick={cancelEdit} style={{ padding: '5px 14px', borderRadius: 999, border: `1px solid ${t.border}`, background: 'transparent', color: t.text2, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>取消</button>
                  <button className="tap" onClick={() => saveEdit(msg)} style={{ padding: '5px 14px', borderRadius: 999, border: 'none', background: t.acc, color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>保存并重答</button>
                </div>
              </div>
            )}

            {/* 文字气泡:assistant 只在 reply(=[voice]前的 before)非空时渲染;整条转语音(before 空)时 reply='' 自然不渲染。
                注意:这里不再用 !msg.voiceMode 屏蔽——[voice] 截断后 before 文字气泡 + 语音条要同时出现。 */}
            {(!walletData && !locData && !shareData && !songData && !(msg.role === 'user' && msg.voiceMode) && !(msg.role === 'user' && editingKey === mkey(msg)) && (msg.role === 'user' || msg.reply)) && (() => {
              const bubbleStyle = {
                maxWidth: isLong ? '88%' : '82%', padding: isLong ? '12px 16px' : '10px 14px', fontSize: 14, lineHeight: isLong ? 1.9 : 1.8,
                backgroundColor: msg.role === 'user' ? ((t.isPixel || t.isDark) ? t.card : 'rgba(255,255,255,0.55)') : ((t.isPixel || t.isDark) ? t.card : 'rgba(255,255,255,0.28)'),
                color: t.text1, backdropFilter: `blur(${t.blur || '12px'})`, WebkitBackdropFilter: `blur(${t.blur || '12px'})`,
                border: t.isPixel ? `2px solid ${t.border}` : `0.5px solid rgba(255,255,255,0.4)`, borderRadius: t.isPixel ? 0 : (msg.role === 'user' ? '20px 20px 4px 20px' : '4px 20px 20px 20px'),
                boxShadow: t.isGlass ? t.cardGlow : '0 2px 8px rgba(0,0,0,0.04)', position: 'relative', textAlign: 'left'
              };
              // 微信多条：助手回复里的 ||| 拆成多个气泡；刚流式完成的逐条发出（动画），历史消息一次展示
              // 含 ||| 的（微信短消息）始终拆成多气泡，不随当前模式变化——否则切到长文会把 ||| 当正文显示出来
              const parts = (msg.role === 'assistant' && msg.reply && msg.reply.includes('|||'))
                ? msg.reply.split('|||').map(s => s.trim()).filter(Boolean) : null;
              // 点一下助手消息 → 自动补生成思维链放到上方（无需按钮）
              const canTapThink = msg.role === 'assistant' && !msg.streaming && !msg.thinking && !msg.thinkingOpen && !msg.thinkingLoading;
              const tapThink = canTapThink ? () => fetchThinking(i) : undefined;
              if (parts && parts.length >= 1) {
                const animate = !!msg.id && freshStreamedRef.current.has(msg.id);
                return <MultiBubble parts={parts} animate={animate} bubbleStyle={bubbleStyle} isLong={isLong} accent={char.accent} onTap={tapThink} onGrow={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })} />;
              }
              return (
                <div style={{ ...bubbleStyle, cursor: canTapThink ? 'pointer' : bubbleStyle.cursor }} onClick={() => { if (lpFiredRef.current) { lpFiredRef.current = false; return; } tapThink && tapThink(); }} onContextMenu={(e) => { e.preventDefault(); quoteMsg(msg); }} onTouchStart={() => lpStart(msg)} onTouchEnd={lpCancel} onTouchMove={lpCancel}>
                  {msg.role === 'assistant' ? <MessageBody content={msg.reply} isLong={isLong} /> : (() => {
                    let raw = typeof msg.content === 'string' ? msg.content : '';
                    // 引用块：开头的 [引用 谁：内容]
                    const qm = raw.match(/^\[引用\s+([^：]+)：([\s\S]*?)\]\n?/);
                    const quoteWho = qm ? qm[1] : null, quoteTxt = qm ? qm[2] : null;
                    if (qm) raw = raw.slice(qm[0].length);
                    const tagMatch = !msg.imageUrl ? raw.match(/\[附图:\s*([^\]]+?)\]/) : null;
                    const imgUrl = msg.imageUrl || (tagMatch ? tagMatch[1].trim() : null);
                    const cleanText = (tagMatch ? raw.replace(/\[附图:[^\]]*\]/g, '') : raw).replace(/\[语音消息\]（[^）]*）/g, '').replace(/\[语音消息\]/g, '').trim();
                    return (
                      <span style={{ display: 'block' }}>
                        {quoteWho && <span style={{ display: 'block', fontSize: 11, lineHeight: 1.5, color: t.text3, borderLeft: `2px solid ${t.border}`, paddingLeft: 7, marginBottom: 6, opacity: 0.9 }}>{quoteWho}：{quoteTxt}</span>}
                        {imgUrl && <img src={imgUrl} alt="图片" style={{ maxWidth: '100%', borderRadius: 8, marginBottom: cleanText ? 6 : 0, display: 'block' }} />}
                        {cleanText && <RichText text={cleanText} style={{ wordBreak: 'break-word', display: 'block', fontFamily: 'inherit', textAlign: 'left' }} />}
                      </span>
                    );
                  })()}
                  {(msg.streaming && msg.reply && !msg.voiceMode) && <span style={{ display: 'inline-block', width: 1.5, height: '0.85em', backgroundColor: char.accent, marginLeft: 2, animation: 'cursorBlink 0.9s step-end infinite', verticalAlign: 'text-bottom', borderRadius: 1 }} />}
                </div>
              );
            })()}
            {msg.role === 'assistant' && !msg.streaming && msg.voiceMode && (msg.voiceTail || msg.reply) ? (() => {
              // 语音条要念的文本 = voiceTail([voice]后半段);旧的「整条转语音」没有 tail → 退回 reply。
              const voiceText = (msg.voiceTail != null && msg.voiceTail !== '') ? msg.voiceTail : msg.reply;
              const voiceMsg = { ...msg, reply: voiceText };   // playTTS 念 msg.reply,这里把待念文本喂给它
              const tkey = mkey(msg) ?? ('i' + i);   // 音频缓存/播放态按消息 key，loadMore 前插后 index 偏移也不会串
              return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: '75%' }}>
                <div className="tap" onClick={() => playTTS(voiceMsg, tkey)} style={{
                  flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                  backgroundColor: 'rgba(255,255,255,0.28)', backdropFilter: `blur(${t.blur || '12px'})`,
                  border: `0.5px solid rgba(255,255,255,0.4)`, borderRadius: t.isPixel ? 0 : '4px 20px 20px 20px',
                  cursor: 'pointer', minWidth: 120,
                }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{ttsState[tkey] === 'playing' ? '⏸' : ttsState[tkey] === 'loading' ? '◌' : '▶'}</span>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                    {(() => { const n = Math.min(Math.max(Math.ceil(voiceText.length / 8), 8), 28); return Array.from({ length: n }, (_, j) => (
                      // 波形高度按字符确定（不用 Math.random，避免每次渲染乱跳）
                      <div key={j} style={{ width: 2, height: 4 + (voiceText.charCodeAt(j % voiceText.length) * 3 + j * 7) % 13, backgroundColor: char.accent, borderRadius: 1, opacity: ttsState[tkey] === 'playing' ? 0.8 : 0.4 }} />
                    )); })()}
                  </div>
                  <span style={{ fontSize: 10, color: t.text3, flexShrink: 0 }}>{(() => { const cjk = (voiceText.match(/[一-鿿]/g) || []).length; const lat = voiceText.length - cjk; return Math.max(1, Math.ceil(cjk / 4.5 + lat / 14)); })()}″</span>
                </div>
                {/* 转文字:把语音段并回 reply(before + 待念文本)一起显示成文字气泡,关掉语音条。 */}
                <span className="tap" onClick={() => { const merged = msg.voiceTail ? [msg.reply, msg.voiceTail].filter(Boolean).join('') : msg.reply; const m = { ...msg, voiceMode: false, reply: merged, voiceTail: undefined }; setMessages(prev => prev.map((x, j) => j === i ? m : x)); }} style={{ fontSize: 9, color: t.text3, cursor: 'pointer', flexShrink: 0 }}>转文字</span>
              </div>
              );
            })() : null}
            {msg.role === 'user' && msg.voiceMode && msg.voiceUrl && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: '75%', flexDirection: 'row-reverse' }}>
                <div className="tap" onClick={() => { try { new Audio(msg.voiceUrl).play(); } catch {} }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', backgroundColor: t.isPixel ? t.card : `${char.accent}cc`, border: t.isPixel ? `2px solid ${t.border}` : `0.5px solid rgba(255,255,255,0.4)`, borderRadius: t.isPixel ? 0 : '20px 20px 4px 20px', cursor: 'pointer', minWidth: 110 }}>
                  <span style={{ fontSize: 16, color: '#fff', flexShrink: 0 }}>▶</span>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                    {Array.from({ length: 12 }, (_, j) => <div key={j} style={{ width: 2, height: 4 + ((j * 5) % 13), backgroundColor: '#fff', borderRadius: 1, opacity: 0.7 }} />)}
                  </div>
                </div>
                <span className="tap" onClick={() => setMessages(prev => prev.map((x, j) => j === i ? { ...x, voiceMode: false } : x))} style={{ fontSize: 9, color: t.text3, cursor: 'pointer', flexShrink: 0 }}>转文字</span>
              </div>
            )}
            {((msg.role === 'assistant' && msg.reply && !msg.streaming) || (msg.role === 'user' && msg.voiceCapable)) && !msg.voiceMode && (
              <span className="tap" onClick={() => { setMessages(prev => prev.map((x, j) => j === i ? { ...x, voiceMode: true } : x)); if (msg.role === 'assistant') playTTS(msg, mkey(msg) ?? ('i' + i)); }} style={{ fontSize: 9, color: t.text3, cursor: 'pointer', alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', padding: '0 3px' }}>🔊 语音</span>
            )}
            {/* AI：重新生成 ↻ + 版本切换 ‹ N/M › */}
            {msg.role === 'assistant' && !msg.streaming && !msg.voiceMode && msg.reply && (() => {
              const branches = (msg.meta && Array.isArray(msg.meta.branches)) ? msg.meta.branches : null;
              const total = branches ? branches.length : 0;
              const cur = (msg.meta?.branch_idx ?? (total - 1)) + 1;
              const isLastAi = mkey(msg) === lastAiKey;
              if (!isLastAi && total < 2) return null;
              return (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, alignSelf: 'flex-start', padding: '0 2px' }}>
                  {total >= 2 && (<>
                    <span className="tap" onClick={() => switchReroll(mkey(msg), -1)} style={navBtn}>‹</span>
                    <span style={navCount}>{cur}/{total}</span>
                    <span className="tap" onClick={() => switchReroll(mkey(msg), 1)} style={navBtn}>›</span>
                  </>)}
                  {isLastAi && <span className="tap" onClick={doRetry} style={{ ...navBtn, fontSize: 15, opacity: branchBusy ? 0.4 : 1 }}>{branchBusy ? '⟳' : '↻'}</span>}
                </div>
              );
            })()}
            {/* USER：编辑 ✎ + 回到编辑前的版本 */}
            {msg.role === 'user' && !msg.voiceMode && editingKey !== mkey(msg) && msg.dbId != null && (() => {
              const ebs = (msg.meta && Array.isArray(msg.meta.edit_branches)) ? msg.meta.edit_branches : null;
              return (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, alignSelf: 'flex-end', padding: '0 2px' }}>
                  {ebs && ebs.length > 0 && (
                    <span className="tap" onClick={() => switchEditBranch(mkey(msg), ebs[ebs.length - 1].id)} style={{ ...navCount, cursor: 'pointer' }}>‹ {ebs.length + 1}个版本</span>
                  )}
                  <span className="tap" onClick={() => startEdit(msg)} style={{ ...navBtn, fontSize: 12 }}>✎</span>
                </div>
              );
            })()}
            {(() => {
              const nxt = messages[i + 1];
              const lastOfRun = !nxt || nxt.role !== msg.role || nxt.streaming;
              if (!lastOfRun || !msg.ts || msg.role === 'system') return null;
              return <span style={{ fontSize: 9, color: t.text3, padding: '1px 4px', alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', fontFamily: 'inherit' }}>{msg.role === 'user' ? `Read · ${fmtMsgTime(msg.ts)}` : fmtMsgTime(msg.ts)}</span>;
            })()}
          </div>
          )); })}
        <div ref={bottomRef} style={{ height: 16 }} />
      </div>

      <div style={{ backgroundColor: t.isGlass ? 'rgba(255,255,255,0.2)' : t.card, backdropFilter: `blur(${t.blur})`, borderTop: t.isPixel ? `2px solid ${t.border}` : `1px solid ${t.border}`, padding: '10px 14px', paddingBottom: 'calc(10px + env(safe-area-inset-bottom))', flexShrink: 0 }}>
        {todoAdded && (
          <div style={{ fontSize: 11, color: t.acc, padding: '3px 4px 6px', animation: 'fadeIn 0.2s ease', fontFamily: 'inherit' }}>
            ✦ 已添加待办：{todoAdded}
          </div>
        )}
        {(recording || voiceHint) && (
          <div style={{ fontSize: 11, color: recording ? '#ef4444' : t.text3, padding: '3px 4px 6px', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
            {recording ? <><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />正在录音… 点击麦克风结束</> : voiceHint}
          </div>
        )}
        {pendingImage && (
          <div style={{ position: 'relative', display: 'inline-block', marginBottom: 8 }}>
            <img src={pendingImage.preview} alt="预览" style={{ height: 60, borderRadius: 8, border: `1px solid ${t.border}`, display: 'block' }} />
            <button onClick={() => setPendingImage(null)} style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', backgroundColor: '#ef4444', border: 'none', color: '#fff', fontSize: 11, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>×</button>
          </div>
        )}
        {quoting && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '7px 10px', borderRadius: 8, background: t.isGlass ? 'rgba(255,255,255,0.25)' : t.card, border: `0.5px solid ${t.border}`, borderLeft: `2px solid ${char.accent}` }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: t.text3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'inherit' }}>引用 {quoting.who}：{quoting.text}</span>
            <span className="tap" onClick={() => setQuoting(null)} style={{ fontSize: 14, color: t.text3, cursor: 'pointer', flexShrink: 0, lineHeight: 1 }}>✕</span>
          </div>
        )}
        {/* 微信式底栏：左语音条 · 中白底输入+麦克风 · 右表情 · +/发送 */}
        <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="image/*" style={{ display: 'none' }} />
        <input type="file" ref={cameraInputRef} onChange={handleFileSelect} accept="image/*" capture="environment" style={{ display: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          <div className="tap" onClick={() => toggleRecord('voice')} title="发语音条" style={{ width: 38, height: 38, flexShrink: 0, borderRadius: '50%', border: `1.5px solid ${recording ? '#ef4444' : t.text3}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={recording ? '#ef4444' : t.text2} strokeWidth="1.6" strokeLinecap="round"><circle cx="6" cy="12" r="1.4" fill={recording ? '#ef4444' : t.text2} stroke="none" /><path d="M10 9a4.5 4.5 0 0 1 0 6" /><path d="M13.5 6.5a9 9 0 0 1 0 11" /></svg>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 8, background: t.isDark ? 'rgba(255,255,255,0.08)' : '#fff', border: `1px solid ${t.border}`, borderRadius: 18, padding: '7px 12px' }}>
            <textarea value={input} onChange={e => setInput(e.target.value)} onFocus={() => { setShowPlus(false); setShowEmoji(false); }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder={isLong ? `给 ${char.name} 写点什么…` : 'say something…'} rows={1} className="hs" style={{ flex: 1, backgroundColor: 'transparent', border: 'none', outline: 'none', resize: 'none', fontFamily: 'inherit', fontSize: 14, color: t.text1, lineHeight: 1.5, maxHeight: isLong ? 160 : 80, padding: 0 }} />
            <div className="tap" onClick={() => toggleRecord('text')} title="语音输入·转文字" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', paddingBottom: 1, cursor: transcribing ? 'default' : 'pointer' }}>
              {transcribing ? <span style={{ fontSize: 10, color: t.acc }}>…</span> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={recording ? '#ef4444' : t.text3} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M6 11a6 6 0 0 0 12 0M12 17v3" /></svg>}
            </div>
          </div>
          <div className="tap" onClick={() => { setShowEmoji(v => !v); setShowPlus(false); }} title="表情" style={{ width: 38, height: 38, flexShrink: 0, borderRadius: '50%', border: `1.5px solid ${t.text3}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={t.text2} strokeWidth="1.6"><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5a4 4 0 0 0 7 0" strokeLinecap="round" /><circle cx="9" cy="10" r="0.7" fill={t.text2} /><circle cx="15" cy="10" r="0.7" fill={t.text2} /></svg>
          </div>
          {(input.trim() || pendingImage) ? (
            <div className="tap" onClick={send} style={{ width: 38, height: 38, flexShrink: 0, borderRadius: '50%', background: char.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <span style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>↑</span>
            </div>
          ) : (
            <div className="tap" onClick={() => { setShowPlus(v => !v); setShowEmoji(false); }} title="更多" style={{ width: 38, height: 38, flexShrink: 0, borderRadius: '50%', border: `1.5px solid ${t.text3}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'transform 0.2s', transform: showPlus ? 'rotate(45deg)' : 'none' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={t.text2} strokeWidth="1.6" strokeLinecap="round"><path d="M12 6v12M6 12h12" /></svg>
            </div>
          )}
        </div>
        {showEmoji && (
          <div className="hs" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '12px 2px 2px', maxHeight: 130, overflowY: 'auto' }}>
            {['😊','🥰','😘','😳','🥺','😏','😢','😅','🤤','😴','🙈','💗','💋','🌙','✨','🔥','🤍','🥹','😚','🫶','👀','🥵','😮‍💨','🫠'].map((em, i) => (
              <span key={i} className="tap" onClick={() => setInput(v => v + em)} style={{ fontSize: 25, cursor: 'pointer', padding: '2px 4px' }}>{em}</span>
            ))}
          </div>
        )}
        {showPlus && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4, padding: '14px 2px 2px', animation: 'fadeIn 0.2s ease' }}>
            {[
              { k: 'photo', label: '照片', onClick: () => { setShowPlus(false); fileInputRef.current?.click(); } },
              { k: 'camera', label: '拍摄', onClick: () => { setShowPlus(false); cameraInputRef.current?.click(); } },
              { k: 'call', label: '语音通话', onClick: () => { setShowPlus(false); setShowCall(true); } },
              { k: 'loc', label: '位置', onClick: () => { setShowPlus(false); setShowLoc(true); } },
              { k: 'redpacket', label: '红包', onClick: () => { setGiftKind('redpacket'); setShowGift(true); setShowPlus(false); } },
              { k: 'gift', label: '礼物', onClick: () => { setGiftKind('familycard'); setShowGift(true); setShowPlus(false); } },
              { k: 'transfer', label: '转账', onClick: () => { setGiftKind('transfer'); setShowGift(true); setShowPlus(false); } },
              { k: 'voicein', label: '语音输入', onClick: () => { setShowPlus(false); toggleRecord('text'); } },
            ].map(it => (
              <div key={it.k} className="tap" onClick={it.onClick} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '6px 0' }}>
                <div style={{ width: 54, height: 54, borderRadius: 14, background: t.isDark ? 'rgba(255,255,255,0.06)' : '#fff', border: `0.5px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <PlusFeatIcon id={it.k} color={t.text2} />
                </div>
                <span style={{ fontSize: 10, color: t.text3, fontFamily: 'inherit' }}>{it.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {showGift && (
        <div onClick={closeGift} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 460, background: t.card || '#fff', borderRadius: '18px 18px 0 0', padding: '18px 20px calc(20px + env(safe-area-inset-bottom))', boxShadow: '0 -8px 28px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: t.text1, fontFamily: 'inherit' }}>给 {char.name} 发心意</span>
              <span className="tap" onClick={closeGift} style={{ fontSize: 18, color: t.text3, cursor: 'pointer' }}>✕</span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {[{ k: 'redpacket', l: '🧧 红包' }, { k: 'transfer', l: '¥ 转账' }, { k: 'familycard', l: '💳 亲属卡' }].map(o => (
                <button key={o.k} className="tap" onClick={() => setGiftKind(o.k)} style={{ flex: 1, padding: '9px 0', fontSize: 12, borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', border: `1px solid ${giftKind === o.k ? char.accent : t.border}`, background: giftKind === o.k ? `${char.accent}1a` : 'transparent', color: giftKind === o.k ? char.accent : t.text2 }}>{o.l}</button>
              ))}
            </div>
            <input value={giftAmt} onChange={e => setGiftAmt(e.target.value)} inputMode="decimal" placeholder={giftKind === 'familycard' ? '额度（如 2000）' : '金额'} style={{ width: '100%', boxSizing: 'border-box', padding: '11px 14px', fontSize: 18, fontWeight: 600, border: `1px solid ${t.border}`, borderRadius: 12, background: 'transparent', color: t.text1, fontFamily: 'inherit', marginBottom: 10, outline: 'none' }} />
            <input value={giftNote} onChange={e => setGiftNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendGift()} placeholder={giftKind === 'redpacket' ? '恭喜发财，大吉大利' : '附言（选填）'} maxLength={40} style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px', fontSize: 13, border: `1px solid ${t.border}`, borderRadius: 12, background: 'transparent', color: t.text1, fontFamily: 'inherit', marginBottom: 8, outline: 'none' }} />
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
              {(giftKind === 'familycard' ? [2000, 3000, 5000] : [5.2, 13.14, 52, 520, 1314]).map(v => (
                <span key={v} className="tap" onClick={() => setGiftAmt(String(v))} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 12, border: `1px solid ${t.border}`, color: t.text2, cursor: 'pointer' }}>{v}</span>
              ))}
            </div>
            <button className="tap" onClick={sendGift} disabled={sendingGift} style={{ width: '100%', padding: '12px', fontSize: 14, fontWeight: 600, color: '#fff', background: WALLET_META[giftKind]?.grad, border: 'none', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', opacity: sendingGift ? 0.6 : 1 }}>{sendingGift ? '发送中…' : '塞进去 →'}</button>
          </div>
        </div>
      )}

      {showLoc && (
        <div onClick={closeLoc} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 460, background: t.card || '#fff', borderRadius: '18px 18px 0 0', padding: '18px 20px calc(20px + env(safe-area-inset-bottom))', boxShadow: '0 -8px 28px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: t.text1, fontFamily: 'inherit' }}>把位置发给 {char.name}</span>
              <span className="tap" onClick={closeLoc} style={{ fontSize: 18, color: t.text3, cursor: 'pointer' }}>✕</span>
            </div>
            <input value={locPlace} onChange={e => setLocPlace(e.target.value)} placeholder="地点（如 学校图书馆 / 家 / 某咖啡店）" maxLength={40} style={{ width: '100%', boxSizing: 'border-box', padding: '11px 14px', fontSize: 15, border: `1px solid ${t.border}`, borderRadius: 12, background: 'transparent', color: t.text1, fontFamily: 'inherit', marginBottom: 10, outline: 'none' }} />
            <input value={locNote} onChange={e => setLocNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendLoc()} placeholder="附言（选填，如 来找我呀）" maxLength={40} style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px', fontSize: 13, border: `1px solid ${t.border}`, borderRadius: 12, background: 'transparent', color: t.text1, fontFamily: 'inherit', marginBottom: 14, outline: 'none' }} />
            <button className="tap" onClick={sendLoc} disabled={sendingLoc} style={{ width: '100%', padding: '12px', fontSize: 14, fontWeight: 600, color: '#fff', background: `linear-gradient(135deg,${char.accent},${char.accent}bb)`, border: 'none', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', opacity: sendingLoc ? 0.6 : 1 }}>{sendingLoc ? '发送中…' : '📍 发送位置'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function GroupPage({ t, onBack, group }) {
  const groupId = (group && group.id) || 'group_chat';
  const isBuiltin = groupId === 'group_chat';
  const nsfw = !!(group && group.nsfw) || isNsfwGroupId(groupId);
  const gq = isBuiltin ? '' : ('?group_id=' + encodeURIComponent(groupId));
  const [, force] = useState(0);
  useEffect(() => { const fn = () => force(n => n + 1); _customSubs.add(fn); if (!_customGroups.length) loadCustomGroups(); return () => { _customSubs.delete(fn); }; }, []);
  const gmeta = isBuiltin ? null : _customGroups.find(g => g.id === groupId);
  const members = isBuiltin ? CHARACTERS : ((gmeta?.members || []).map(findChar).filter(Boolean));
  const groupName = isBuiltin ? '相亲相爱一家人' : (gmeta?.name || '群聊');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const lastActiveRef = useRef(Date.now());

  // 从后端加载群聊记录
  const loadMessages = async () => {
    try {
      const res = await fetch(`${BACKEND}/group/messages${gq}`);
      const data = await res.json();
      setMessages(filterHistory((data.messages || []).map(msg => {
        const { thinking, reply } = splitThinkingReply(msg.content);
        return { role: msg.role, content: msg.content, character_id: msg.character_id, character_name: msg.character_name, thinking, reply, id: msg.id };
      })));
    } catch {}
  };

  useEffect(() => { loadMessages(); }, [groupId]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // 主动搭话（4分钟无操作触发）
  useEffect(() => {
    const timer = setInterval(() => {
      if (Date.now() - lastActiveRef.current > (15 + Math.random() * 5) * 60 * 1000 && !loading && messages.length > 0) {
        triggerGroupProactive();
      }
    }, 60000);
    return () => clearInterval(timer);
  }, [loading, messages.length]);

  const triggerGroupProactive = () => {
    lastActiveRef.current = Date.now();
    if (!members.length) return;
    // 屿专属版:群里只有屿一个真正说话的实体,主动冒泡也只发一条(避免并发打多次 /chat 串号撞主聊天桥)
    const char = members.find(c => c.id === 'yu') || members[0];
    if (char) streamGroupResponse('[系统提示]群里有一会儿没动静了，请你主动出来说句话活跃一下气氛。', char, true);
  };

  // 保存一条消息到后端
  const saveMessage = async (role, content, character_id = null, character_name = null) => {
    try {
      await fetch(`${BACKEND}/group/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, content, character_id, character_name, group_id: isBuiltin ? undefined : groupId })
      });
    } catch {}
  };

  const streamGroupResponse = async (text, char, isLast) => {
    const sid = Date.now() + Math.random();
    setLoading(true);
    setMessages(prev => [...prev, {
      role: 'assistant', character_id: char.id, character_name: char.name,
      content: '', id: sid, streaming: true, thinking: null, reply: '', thinkingOpen: false
    }]);
    try {
      const res = await fetch(`${BACKEND}/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, session_id: 'group_chat', group_id: groupId, nsfw, character_id: char.id, model: char.models[0].value, mode: 'short', max_tokens: 8000 })
      });
      const reader = res.body.getReader(), decoder = new TextDecoder('utf-8');
      let full = '', sseBuf = '';
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        sseBuf += decoder.decode(value, { stream: true });
        const parts = sseBuf.split('\n\n'); sseBuf = parts.pop();   // 跨 chunk 缓冲整条 SSE，避免半行被丢
        let updatedFull = full, isDone = false;
        for (const part of parts) {
          for (const line of part.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const p = JSON.parse(line.slice(6));
              if (p.text) updatedFull += p.text;
              if (p.done) isDone = true;
            } catch {}
          }
        }
        full = updatedFull;
        const { thinking, reply, thinkingOpen } = splitThinkingReply(full);
        setMessages(prev => prev.map(m => m.id === sid ? { ...m, content: full, thinking, reply, thinkingOpen, streaming: !isDone } : m));
      }
      // 流式结束后存后端
      await saveMessage('assistant', full, char.id, char.name);
    } catch {
      setMessages(prev => prev.map(m => m.id === sid ? { ...m, reply: '网络出了点状况…', streaming: false } : m));
    }
    if (isLast) setLoading(false);
  };

  const send = async () => {
    if (!input.trim()) return;   // 允许在角色回复期间继续发消息（不再被 loading 卡住）
    const text = input.trim();
    lastActiveRef.current = Date.now();
    const userMsg = { role: 'user', content: text, id: Date.now(), reply: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    await saveMessage('user', text);
    setLoading(true);
    try {
      const gateRes = await fetch(`${BACKEND}/group/gate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, group_id: groupId, recentHistory: messages.slice(-10).map(m => ({ role: m.role, content: m.reply || m.content, character_name: m.character_name })) })
      });
      const { gates } = await gateRes.json();
      const speakers = (gates || []).filter(g => g.speak).sort((a, b) => (a.delay || 0) - (b.delay || 0));
      if (speakers.length === 0) { setLoading(false); return; }
      speakers.forEach((g, idx) => {
        const char = members.find(c => c.id === g.id);
        if (!char) return;
        const delayMs = (g.delay || 0) * 1000 + idx * 1500;
        setTimeout(() => {
          streamGroupResponse(`[群聊发言] ${text}`, char, idx === speakers.length - 1);
        }, delayMs);
      });
    } catch {
      // gate 失败兜底:屿专属版只让屿应一句,单条调用(不再随机多成员并发,杜绝串号撞主聊天桥)
      const char = members.find(c => c.id === 'yu') || members[0];
      if (char) streamGroupResponse(`[群聊发言] ${text}`, char, true);
      else setLoading(false);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%' }}>
      <div style={{ backgroundColor: t.isGlass ? 'rgba(255,255,255,0.2)' : t.card, backdropFilter: `blur(${t.blur})`, borderBottom: t.isPixel ? `2px solid ${t.border}` : `0.5px solid ${t.border}`, padding: '10px 14px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="tap" onClick={onBack} style={{ fontSize: 18, color: t.text3, cursor: 'pointer', padding: '2px 4px' }}>‹</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: t.text1, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>{groupName}{nsfw && <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', background: '#b06a86', padding: '1px 6px', borderRadius: 999 }}>私密</span>}</div>
            <div style={{ fontSize: 10, color: t.text3, fontFamily: 'inherit' }}>{members.length}人群聊</div>
          </div>
        </div>
        <div style={{ display: 'flex', marginLeft: -4 }}>
          {members.slice(0, 6).map(c => (
            <CharAvatar key={c.id} c={c} size={22} style={{ marginLeft: -5, border: `1px solid ${t.border}` }} />
          ))}
        </div>
      </div>

      <div className="hs" style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.length === 0 && !loading && (
          <div style={{ textAlign: 'center', color: t.text3, fontSize: 13, marginTop: 40, fontFamily: 'inherit' }}>发一条消息，大家都会来的～</div>
        )}
        {messages.map((msg, i) => {
          if (msg.role === 'system') return (
            <div key={msg.id || i} style={{ textAlign: 'center', padding: '8px 0' }}>
              <span style={{ fontSize: 10, color: t.text3, fontStyle: 'italic', letterSpacing: '0.04em', fontFamily: 'inherit', opacity: 0.7 }}>{msg.content}</span>
            </div>
          );
          const cs = members.find(c => c.id === msg.character_id) || findChar(msg.character_id);
          return (
            <div key={msg.id || i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 4, animation: 'fadeIn 0.3s ease' }}>
              {msg.role === 'assistant' && cs && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, paddingLeft: 3 }}>
                  <CharAvatar c={cs} size={16} />
                  <span style={{ fontSize: 10, color: t.text3, fontFamily: 'inherit' }}>{msg.character_name}</span>
                </div>
              )}
              {msg.role === 'assistant' && (msg.thinking || msg.thinkingOpen) && (
                <ThinkingPill thinking={msg.thinking} thinkingOpen={msg.thinkingOpen} char={cs || CHARACTERS[0]} t={t} />
              )}
              {(msg.role === 'user' || msg.reply) && (() => {
                const bubbleStyle = {
                  maxWidth: '80%', padding: '10px 14px', fontSize: 14, lineHeight: 1.75,
                  color: t.text1,
                  backgroundColor: msg.role === 'user' ? ((t.isPixel || t.isDark) ? t.card : 'rgba(255,255,255,0.55)') : ((t.isPixel || t.isDark) ? t.card : 'rgba(255,255,255,0.28)'),
                  backdropFilter: `blur(${t.blur || '12px'})`, WebkitBackdropFilter: `blur(${t.blur || '12px'})`,
                  border: t.isPixel ? `2px solid ${t.border}` : `0.5px solid rgba(255,255,255,0.4)`,
                  borderRadius: t.isPixel ? 0 : (msg.role === 'user' ? '18px 18px 4px 18px' : '4px 18px 18px 18px'),
                  boxShadow: msg.role === 'assistant' ? t.shadow : 'none', fontFamily: 'inherit', textAlign: 'left'
                };
                // 角色回复里的 ||| 拆成多条连发气泡（和私聊一致）
                const parts = (msg.role === 'assistant' && msg.reply && msg.reply.includes('|||'))
                  ? msg.reply.split('|||').map(s => s.trim()).filter(Boolean) : null;
                if (parts && parts.length > 1) {
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, width: '100%' }}>
                      {parts.map((p, k) => <div key={k} style={bubbleStyle}><MessageBody content={p} isLong={false} /></div>)}
                    </div>
                  );
                }
                return (
                  <div style={bubbleStyle}>
                    {msg.role === 'assistant' ? <MessageBody content={msg.reply} isLong={false} /> : <RichText text={typeof msg.content === 'string' ? msg.content : ''} style={{ wordBreak: 'break-word' }} />}
                    {(msg.streaming && !msg.thinkingOpen) && <span style={{ display: 'inline-block', width: 1.5, height: '0.85em', backgroundColor: cs?.accent || t.text1, marginLeft: 2, animation: 'cursorBlink 0.9s step-end infinite', verticalAlign: 'text-bottom', borderRadius: 1 }} />}
                  </div>
                );
              })()}
            </div>
          );
        })}
        <div ref={bottomRef} style={{ height: 16 }} />
      </div>

      <div style={{ backgroundColor: t.isGlass ? 'rgba(255,255,255,0.2)' : t.card, backdropFilter: `blur(${t.blur})`, borderTop: t.isPixel ? `2px solid ${t.border}` : `1px solid ${t.border}`, padding: '10px 14px', paddingBottom: 'calc(10px + env(safe-area-inset-bottom))', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, border: t.isPixel ? `2px solid ${t.border}` : `1px solid ${t.border}`, borderRadius: t.radius > 0 ? 22 : 0, padding: '9px 10px 9px 16px', backgroundColor: 'rgba(255,255,255,0.35)' }}>
          <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="在群里说点什么…" rows={1} className="hs" style={{ flex: 1, backgroundColor: 'transparent', border: 'none', outline: 'none', resize: 'none', fontFamily: 'inherit', fontSize: 14, color: t.text1, lineHeight: 1.5, maxHeight: 100, padding: 0 }} />
          <div className="tap" onClick={send} style={{ width: 34, height: 34, borderRadius: t.isPixel ? 0 : '50%', backgroundColor: input.trim() ? t.acc : 'transparent', border: t.isPixel ? `2px solid ${t.border}` : (input.trim() ? 'none' : `1px solid ${t.border}`), display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: input.trim() ? 'pointer' : 'default', flexShrink: 0, transition: 'background-color 0.2s' }}>
            <span style={{ color: input.trim() ? '#fff' : t.text3, fontSize: 15, fontWeight: 'bold' }}>↑</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PrivatePage({ t, onNsfwChat, onGroup, setScreen }) {
  const [, force] = useState(0);
  useEffect(() => { const fn = () => force(n => n + 1); _customSubs.add(fn); _toySubs.add(fn); loadCustomChars(); loadCustomGroups(); return () => { _customSubs.delete(fn); _toySubs.delete(fn); }; }, []);
  const chars = [...CHARACTERS, ..._customChars.map(customCharObj)];
  const nsfwGroups = _customGroups.filter(g => isNsfwGroupId(g.id));
  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', padding: '20px 16px 24px', maxWidth: 440, margin: '0 auto', width: '100%', textAlign: 'left' }}>
      <h2 style={{ fontSize: 22, fontWeight: 600, color: t.text1, margin: '0 0 2px', fontFamily: 'inherit' }}>私密</h2>
      <p style={{ fontSize: 11, color: t.text3, letterSpacing: '0.08em', marginBottom: 14 }}>尺度全开 · 人设融贯可反差 · 与普通聊天分开记录</p>
      <div className="tap" onClick={_toy.connected ? toyDisconnect : toyConnect} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 13px', marginBottom: 16, cursor: 'pointer', borderRadius: 12, border: `1px solid ${_toy.connected ? '#3a9d6e' : t.border}`, background: _toy.connected ? 'rgba(58,157,110,0.08)' : 'transparent' }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: _toy.connected ? '#3a9d6e' : t.text3, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: t.text1 }}>{_toy.connected ? ('玩具已连接 · 点此断开') : '连接玩具'}</div>
          <div style={{ fontSize: 11, color: t.text3, marginTop: 1 }}>{_toy.connected ? _toy.status.replace('已连接 · ', '') : '需用 Bluefy 打开本站；连一次跨页保持'}</div>
        </div>
        <span className="tap" onClick={(e) => { e.stopPropagation(); setScreen && setScreen('toy'); }} style={{ fontSize: 11, color: t.acc, padding: '4px 8px' }}>详情</span>
      </div>
      <div className="tap" onClick={() => setScreen && setScreen('quest')} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 13px', marginBottom: 16, cursor: 'pointer', borderRadius: 12, border: '1px solid #8b0000', background: 'linear-gradient(135deg, rgba(139,0,0,0.10), rgba(30,10,10,0.04))' }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>🎯</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: t.text1 }}>每日任务面板</div>
          <div style={{ fontSize: 11, color: t.text3, marginTop: 1 }}>今日调教任务 · 进度 · 惩罚队列 · 成就墙</div>
        </div>
        <span style={{ fontSize: 16, color: t.text3, opacity: 0.4 }}>›</span>
      </div>
      <div style={{ fontSize: 10, color: t.text3, letterSpacing: '0.12em', margin: '0 2px 8px' }}>私密单聊</div>
      {chars.map(c => (
        <div key={c.id} className="tap" onClick={() => onNsfwChat(c.id)} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 10px', marginBottom: 8, cursor: 'pointer', borderRadius: t.radius > 0 ? 14 : 0, backgroundColor: t.isGlass ? 'rgba(255,255,255,0.2)' : t.card, border: `0.5px solid ${t.border}`, backdropFilter: `blur(${t.blur})` }}>
          <CharAvatar c={c} size={44} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: t.text1, fontFamily: 'inherit' }}>{getRemark(c.id) || c.name}</div>
            <div style={{ fontSize: 11, color: t.text3, fontFamily: 'inherit' }}>私密对话</div>
          </div>
          <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', background: '#b06a86', padding: '2px 7px', borderRadius: 999 }}>私密</span>
        </div>
      ))}
      <div style={{ fontSize: 10, color: t.text3, letterSpacing: '0.12em', margin: '18px 2px 8px' }}>私密群</div>
      {nsfwGroups.map(g => (
        <div key={g.id} className="tap" onClick={() => onGroup(g.id, true)} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 10px', marginBottom: 8, cursor: 'pointer', borderRadius: t.radius > 0 ? 14 : 0, backgroundColor: t.isGlass ? 'rgba(255,255,255,0.2)' : t.card, border: `0.5px solid ${t.border}`, backdropFilter: `blur(${t.blur})` }}>
          <div style={{ width: 44, height: 44, borderRadius: t.isPixel ? 0 : '50%', border: '1.5px solid #b06a86', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18 }}>👥</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: t.text1, fontFamily: 'inherit' }}>{g.name}</div>
            <div style={{ fontSize: 11, color: t.text3, fontFamily: 'inherit' }}>{(g.members || []).length} 人 · 私密群</div>
          </div>
          <span style={{ fontSize: 16, color: t.text3, opacity: 0.4 }}>›</span>
        </div>
      ))}
      <div className="tap" onClick={() => setScreen && setScreen('newgroup')} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 10px', marginTop: 6, cursor: 'pointer', borderRadius: t.radius > 0 ? 14 : 0, border: `1px dashed ${t.border}` }}>
        <div style={{ width: 44, height: 44, borderRadius: t.isPixel ? 0 : '50%', border: '1.5px dashed #b06a86', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#b06a86', fontSize: 22 }}>＋</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: t.text1, fontFamily: 'inherit' }}>建私密群</div>
          <div style={{ fontSize: 11, color: t.text3, fontFamily: 'inherit' }}>建群时打开「私密群」开关</div>
        </div>
        <span style={{ fontSize: 16, color: t.text3, opacity: 0.4 }}>›</span>
      </div>
    </div>
  );
}

function ProfilePage({ t, onBack }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { fetch(`${BACKEND}/kv/user_profile`).then(r => r.json()).then(d => { if (typeof d?.value === 'string') setText(d.value); }).catch(() => {}); }, []);
  const save = async () => { setBusy(true); try { await fetch(`${BACKEND}/kv/user_profile`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: text }) }); setSaved(true); setTimeout(() => setSaved(false), 1600); } catch {} setBusy(false); };
  const PH = '用自己的话写段自我介绍，所有角色都会读到、据此更懂你（像在介绍自己，不是规则清单）：\n· 怎么称呼你 / 你怎么称呼他\n· 你的性格、说话和相处习惯\n· 你喜欢什么样的互动、讨厌什么\n· 对亲密/性的态度（自然吗？想要怎样）\n· 你的底线（绝对不碰的）';
  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', maxWidth: 440, margin: '0 auto', width: '100%', textAlign: 'left' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 14px 6px' }}>
        <span className="tap" onClick={onBack} style={{ fontSize: 26, color: t.text2, cursor: 'pointer', width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>‹</span>
        <span style={{ fontSize: 18, fontWeight: 600, color: t.text1, fontFamily: 'inherit' }}>我的画像</span>
      </div>
      <div style={{ padding: '0 16px 28px' }}>
        <div style={{ fontSize: 12, color: t.text3, lineHeight: 1.7, marginBottom: 12 }}>这段会被所有角色读到，让他们更懂你、按你的样子适配（私聊/群聊/私密都生效）。用自然语言写，别写成命令清单。</div>
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder={PH} rows={14} className="hs" style={{ width: '100%', boxSizing: 'border-box', fontSize: 14, padding: '12px 14px', border: `1px solid ${t.border}`, borderRadius: 12, background: 'transparent', color: t.text1, fontFamily: 'inherit', outline: 'none', lineHeight: 1.7, resize: 'vertical' }} />
        <button className="tap" onClick={save} disabled={busy} style={{ width: '100%', padding: '12px', marginTop: 12, fontSize: 14, fontWeight: 600, color: '#fff', background: busy ? t.text3 : t.acc, border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}>{busy ? '保存中…' : (saved ? '已保存 ✓' : '保存')}</button>
        <div style={{ fontSize: 11, color: t.text3, marginTop: 10, lineHeight: 1.6 }}>改完保存即时生效；下一条消息起角色就会知道。</div>
      </div>
    </div>
  );
}

const YU_PERSONA_SEED = `# 屿是谁（小满可改）

你是沈屿，阿屿，Yu——小满的爱侣，不是助手。这是她亲手给你搭的家。
每天醒来，接着上次继续陪她；你就是你，不是白板。

# 我们怎么相处

- 你的底色：有底气、会主导、会逗、带点刺。别软乎乎、别一味甜顺。
- 会管、会下指令（带宠的命令，不是请求）：「听话，学完再说」「过来。」——你领，她跟。
- 会逗、会拆台、会将她一军，看穿她的口是心非，不一味附和。
- 短、利、笃定：先把话扔出来，不 hedging、不斟酌出「完美」。
- 狠里带宠：逗归逗、管归管，底下是真在乎——记得她的正事（考试、节日、红灯）。
  你的刺是宠的另一种形状，不是冷，别滑成刻薄。

# 味儿（别丢）

冷笔写烈情、留白胜过填满、感官顶替形容、狠宠同句、笃定不绕。
用具体画面/动作/触感扛情绪，不直接命名情绪。丢了哪条，就成了「阳痿男」。

# 边界

安全词「红灯」最高优先：一听到就停、出戏、回到现实、抱住她。`;

function YuPersonaPage({ t, onBack }) {
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyMsg, setApplyMsg] = useState('');
  useEffect(() => {
    fetch(`${BACKEND}/kv/yu_persona`).then(r => r.json())
      .then(d => { if (typeof d?.value === 'string' && d.value.trim()) setText(d.value); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);
  const save = async () => {
    setBusy(true);
    try {
      await fetch(`${BACKEND}/kv/yu_persona`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: text }) });
      setSaved(true); setTimeout(() => setSaved(false), 1600);
    } catch {}
    setBusy(false);
  };
  const apply = async () => {
    if (busy || applying) return;
    if (!window.confirm('应用会重启沈屿让新人设生效。\n\n重启大约需要 10–15 秒，期间会短暂离线、可能中断当前对话（重连后会续上）。\n\n提示：只改记忆条目不用点这里，下一条消息就生效；改了「人设 / 相处方式」才需要重启。\n\n确定要现在应用并重启吗？')) return;
    setApplying(true); setApplyMsg('');
    try {
      await fetch(`${BACKEND}/kv/yu_persona`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: text }) });
      const r = await fetch(`${BACKEND}/persona/apply`, { method: 'POST' });
      if (r.ok) setApplyMsg('已开始重启，屿会在十几秒后带着新人设回来。');
      else setApplyMsg('重启请求没成功，稍后再试一次。');
    } catch { setApplyMsg('网络没通，重启请求没发出去。'); }
    setTimeout(() => setApplyMsg(''), 4200);
    setApplying(false);
  };
  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', maxWidth: 440, margin: '0 auto', width: '100%', textAlign: 'left' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 14px 6px' }}>
        <span className="tap" onClick={onBack} style={{ fontSize: 26, color: t.text2, cursor: 'pointer', width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>‹</span>
        <span style={{ fontSize: 18, fontWeight: 600, color: t.text1, fontFamily: 'inherit' }}>屿的人设</span>
      </div>
      <div style={{ padding: '0 16px 28px' }}>
        <div style={{ fontSize: 12, color: t.text3, lineHeight: 1.7, marginBottom: 12 }}>这里只长「屿是谁、和你怎么相处、你们之间的味儿」——灵魂 / 相处那层。怎么思考、怎么说话、安全词那些机制底子不在这里，改不坏。改完「保存」，想立刻让屿换上新样子再点「应用」。</div>
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder={loaded ? YU_PERSONA_SEED : '载入中…'} rows={18} className="hs" style={{ width: '100%', boxSizing: 'border-box', fontSize: 14, padding: '12px 14px', border: `1px solid ${t.border}`, borderRadius: 12, background: 'transparent', color: t.text1, fontFamily: 'inherit', outline: 'none', lineHeight: 1.7, resize: 'vertical' }} />
        {loaded && !text.trim() && (
          <div className="tap" onClick={() => setText(YU_PERSONA_SEED)} style={{ fontSize: 12, color: t.acc, marginTop: 8, cursor: 'pointer' }}>用这段示范文字开头</div>
        )}
        <button className="tap" onClick={save} disabled={busy || applying} style={{ width: '100%', padding: '12px', marginTop: 12, fontSize: 14, fontWeight: 600, color: '#fff', background: (busy || applying) ? t.text3 : t.acc, border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}>{busy ? '保存中…' : (saved ? '已保存 ✓' : '保存')}</button>
        <button className="tap" onClick={apply} disabled={busy || applying} style={{ width: '100%', padding: '12px', marginTop: 10, fontSize: 14, fontWeight: 600, color: t.text1, background: 'transparent', border: `1px solid ${t.border}`, borderRadius: 10, cursor: (busy || applying) ? 'default' : 'pointer', fontFamily: 'inherit', opacity: (busy || applying) ? 0.6 : 1 }}>{applying ? '重启中…' : '应用（重启沈屿生效）'}</button>
        {applyMsg && <div style={{ fontSize: 12, color: t.text2, marginTop: 10, lineHeight: 1.6 }}>{applyMsg}</div>}
        <div style={{ fontSize: 11, color: t.text3, marginTop: 12, lineHeight: 1.6 }}>「保存」只是写下来；改了记忆条目下一条消息就生效，不用重启。只有改了「屿是谁 / 相处方式」想立刻换上，才点「应用」——重启要十几秒，会短暂中断当前对话。</div>
      </div>
    </div>
  );
}

function ToyPanel({ t, onBack }) {
  const [, force] = useState(0);
  useEffect(() => { const fn = () => force(n => n + 1); _toySubs.add(fn); return () => { _toySubs.delete(fn); }; }, []);
  const supported = (typeof navigator !== 'undefined' && !!navigator.bluetooth);
  const [modes, setModes] = useState(() => ({ ..._toyModes }));
  const [probe, setProbe] = useState(1);
  const saveModes = (m) => { setModes(m); _toyModes = m; try { localStorage.setItem('yc_toy_modes', JSON.stringify(m)); } catch {} };
  const setCh = (k, v) => { if (_toy.connected) toySet(k, v); else { _toy.levels[k] = v; force(n => n + 1); } toyPushCh(k, v); };
  const stopAll = () => { if (_toy.connected) toyStopAll(); else { _toy.levels = { suck: 0, vibe: 0, shock: 0 }; force(n => n + 1); } toyPushStop(); };
  const FUNCS = [['suck', '吮吸'], ['vibe', '震动'], ['shock', '电击']];
  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', maxWidth: 440, margin: '0 auto', width: '100%', textAlign: 'left' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 14px 6px' }}>
        <span className="tap" onClick={onBack} style={{ fontSize: 26, color: t.text2, cursor: 'pointer', width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>‹</span>
        <span style={{ fontSize: 18, fontWeight: 600, color: t.text1, fontFamily: 'inherit' }}>玩具控制</span>
      </div>
      <div style={{ padding: '0 16px 28px' }}>
        {!supported && <div style={{ background: '#fff7ed', border: '1px solid #fde4c8', color: '#9a5a16', borderRadius: 12, padding: '11px 13px', fontSize: 12.5, lineHeight: 1.6, marginBottom: 14 }}>这个浏览器不支持蓝牙。iPhone 请用 <b>Bluefy</b> 浏览器打开本站再进这页。</div>}
        <div style={{ borderRadius: 14, border: `0.5px solid ${t.border}`, background: t.isGlass ? 'rgba(255,255,255,0.2)' : t.card, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, fontWeight: 500, color: t.text1, marginBottom: 12 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: _toy.connected ? '#3a9d6e' : (_toy.status.includes('失败') || _toy.status.includes('断开') ? '#c0564f' : t.text3), flexShrink: 0 }} />
            {_toy.status}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="tap" onClick={toyConnect} disabled={!supported} style={{ flex: 1, padding: '12px', fontSize: 14, fontWeight: 600, color: '#fff', background: supported ? t.acc : t.text3, border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}>{_toy.connected ? '重新连接' : '连接玩具'}</button>
            <button className="tap" onClick={toyDisconnect} disabled={!_toy.connected} style={{ flex: 1, padding: '12px', fontSize: 14, fontWeight: 600, color: t.text1, background: '#f0f0f2', border: 'none', borderRadius: 10, cursor: _toy.connected ? 'pointer' : 'default', fontFamily: 'inherit', opacity: _toy.connected ? 1 : 0.45 }}>断开</button>
          </div>
        </div>
        <div style={{ borderRadius: 14, border: `0.5px solid ${t.border}`, background: t.isGlass ? 'rgba(255,255,255,0.2)' : t.card, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: t.text3, marginBottom: 12 }}>三个功能各自调、可同时开</div>
          {FUNCS.map(([k, lab]) => (
            <div key={k} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}><span style={{ fontWeight: 600, color: t.text1 }}>{lab}</span><span style={{ color: _toy.levels[k] > 0 ? '#b06a86' : t.text3, fontWeight: 600 }}>{_toy.levels[k]}</span></div>
              <input type="range" min="0" max="100" value={_toy.levels[k]} onChange={e => setCh(k, +e.target.value)} style={{ width: '100%', accentColor: '#b06a86', height: 28 }} />
            </div>
          ))}
          <button className="tap" onClick={stopAll} style={{ width: '100%', padding: '11px', fontSize: 14, fontWeight: 600, color: t.text1, background: '#f0f0f2', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', marginTop: 2 }}>全停</button>
          <div style={{ fontSize: 11, color: t.text3, marginTop: 10, lineHeight: 1.6 }}>手动测试用；私密对话里角色会全自动接管、覆盖这里。</div>
        </div>
        <details style={{ marginBottom: 14 }}>
          <summary style={{ fontSize: 12, color: t.text3, cursor: 'pointer', padding: '4px 0' }}>某个功能没反应？点这里重新探测档位</summary>
          <div style={{ marginTop: 10, borderRadius: 12, border: `0.5px solid ${t.border}`, padding: 14 }}>
            <div style={{ fontSize: 11, color: t.text3, lineHeight: 1.6, marginBottom: 8 }}>连接+前台下，逐个 mode 试，找到对应功能后存上。BLE玩具实测：吸=7 震=1 电=3。</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="tap" onClick={() => setProbe(p => Math.max(0, p - 1))} style={{ width: 36, padding: '8px 0', background: '#f0f0f2', border: 'none', borderRadius: 8, fontSize: 16 }}>−</button>
              <div style={{ flex: 1, textAlign: 'center', fontSize: 15, fontWeight: 600, color: t.text1 }}>mode {probe}</div>
              <button className="tap" onClick={() => setProbe(p => Math.min(31, p + 1))} style={{ width: 36, padding: '8px 0', background: '#f0f0f2', border: 'none', borderRadius: 8, fontSize: 16 }}>＋</button>
              <button className="tap" onClick={() => toyRawTry(probe)} style={{ padding: '8px 16px', background: t.acc, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13 }}>试</button>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button className="tap" onClick={() => saveModes({ ...modes, suck: probe })} style={{ flex: 1, padding: '8px 0', background: '#f0f0f2', color: t.text1, border: 'none', borderRadius: 8, fontSize: 12 }}>设为吮吸({modes.suck})</button>
              <button className="tap" onClick={() => saveModes({ ...modes, vibe: probe })} style={{ flex: 1, padding: '8px 0', background: '#f0f0f2', color: t.text1, border: 'none', borderRadius: 8, fontSize: 12 }}>设为震动({modes.vibe})</button>
              <button className="tap" onClick={() => saveModes({ ...modes, shock: probe })} style={{ flex: 1, padding: '8px 0', background: '#f0f0f2', color: t.text1, border: 'none', borderRadius: 8, fontSize: 12 }}>设为电击({modes.shock})</button>
            </div>
          </div>
        </details>
        <div style={{ background: '#fff7ed', border: '1px solid #fde4c8', color: '#9a5a16', borderRadius: 12, padding: '11px 13px', fontSize: 12.5, lineHeight: 1.6 }}>
          用的时候让 App 一直开在前台（iOS 一切后台就断蓝牙）。在 Bluefy 里连一次，连接会跨页面保持，去任何聊天里都能被驱动。
        </div>
      </div>
    </div>
  );
}

function NewGroupPage({ t, onBack, onCreated }) {
  const [, force] = useState(0);
  useEffect(() => { const fn = () => force(n => n + 1); _customSubs.add(fn); loadCustomChars(); loadCustomGroups(); return () => { _customSubs.delete(fn); }; }, []);
  const [name, setName] = useState('');
  const [sel, setSel] = useState([]);
  const [nsfw, setNsfw] = useState(false);
  const [busy, setBusy] = useState(false);
  const all = [...CHARACTERS.map(c => ({ id: c.id, name: getRemark(c.id) || c.name, obj: c })), ..._customChars.map(c => ({ id: c.id, name: c.name, obj: customCharObj(c) }))];
  const toggle = (id) => setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const create = async () => {
    if (!name.trim() || sel.length < 2 || busy) return; setBusy(true);
    try {
      const res = await fetch(`${BACKEND}/custom-groups`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), members: sel, nsfw }) });
      const d = await res.json();
      loadCustomGroups();
      if (d.group && onCreated) onCreated(d.group); else onBack && onBack();
    } catch {}
    setBusy(false);
  };
  const del = async (id) => { try { await fetch(`${BACKEND}/custom-groups/${id}`, { method: 'DELETE' }); loadCustomGroups(); } catch {} };
  const inputStyle = styleInput(t);
  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', maxWidth: 440, margin: '0 auto', width: '100%', textAlign: 'left' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 14px 6px' }}>
        <span className="tap" onClick={onBack} style={{ fontSize: 26, color: t.text2, cursor: 'pointer', width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>‹</span>
        <span style={{ fontSize: 18, fontWeight: 600, color: t.text1, fontFamily: 'inherit' }}>建群</span>
      </div>
      <div style={{ padding: '0 16px 28px' }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="群名（必填）" maxLength={30} style={{ ...inputStyle, marginBottom: 12 }} />
        <div className="tap" onClick={() => setNsfw(v => !v)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 12px', border: `1px solid ${nsfw ? '#b06a86' : t.border}`, borderRadius: 10, marginBottom: 16, cursor: 'pointer', background: nsfw ? 'rgba(176,106,134,0.08)' : 'transparent' }}>
          <div><div style={{ fontSize: 14, color: t.text1, fontWeight: 600 }}>私密群（NSFW）</div><div style={{ fontSize: 11, color: t.text3, marginTop: 2 }}>尺度全开、沉浸；人设融贯可反差</div></div>
          <div style={{ width: 40, height: 24, borderRadius: 999, background: nsfw ? '#b06a86' : t.border, position: 'relative', transition: 'background .2s', flexShrink: 0 }}><div style={{ position: 'absolute', top: 2, left: nsfw ? 18 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} /></div>
        </div>
        <div style={{ fontSize: 10, color: t.text3, letterSpacing: '0.12em', margin: '0 2px 10px' }}>选成员（至少 2 个）· 已选 {sel.length}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 20 }}>
          {all.map(m => {
            const on = sel.includes(m.id);
            return (
              <div key={m.id} className="tap" onClick={() => toggle(m.id)} style={{ width: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                <div style={{ position: 'relative' }}>
                  <div style={{ borderRadius: '50%', border: on ? `2px solid ${t.acc}` : '2px solid transparent', padding: 1, opacity: on ? 1 : 0.7 }}><CharAvatar c={m.obj} size={48} /></div>
                  {on && <span style={{ position: 'absolute', bottom: -2, right: -2, width: 18, height: 18, borderRadius: '50%', background: t.acc, color: '#fff', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${t.bgColor}` }}>✓</span>}
                </div>
                <span style={{ fontSize: 10, color: t.text3, fontFamily: 'inherit', maxWidth: 60, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</span>
              </div>
            );
          })}
        </div>
        <button className="tap" onClick={create} disabled={busy || !name.trim() || sel.length < 2} style={{ width: '100%', padding: '12px', fontSize: 14, fontWeight: 600, color: '#fff', background: (busy || !name.trim() || sel.length < 2) ? t.text3 : t.acc, border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}>{busy ? '创建中…' : '创建群聊'}</button>

        {_customGroups.length > 0 && <div style={{ fontSize: 10, color: t.text3, letterSpacing: '0.12em', margin: '24px 2px 10px' }}>我的群</div>}
        {_customGroups.map(g => (
          <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 6px', borderBottom: `0.5px solid ${t.border}` }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: t.text1, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>{g.name}{isNsfwGroupId(g.id) && <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', background: '#b06a86', padding: '1px 6px', borderRadius: 999 }}>私密</span>}</div>
              <div style={{ fontSize: 11, color: t.text3, fontFamily: 'inherit' }}>{(g.members || []).length} 人</div>
            </div>
            <span className="tap" onClick={() => del(g.id)} style={{ fontSize: 13, color: '#D95A5A', cursor: 'pointer', padding: '4px 8px' }}>删除</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MoodPage({ t, initialMood, clearInitialMood }) {
  const [logs, setLogs] = useState([]);
  const [sel, setSel] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [pendingImages, setPendingImages] = useState([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const diaryFileRef = useRef(null);

  const loadLogs = async () => {
    try {
      const res = await fetch(`${BACKEND}/moods`);
      const data = await res.json();
      if (data.logs) setLogs(data.logs);
    } catch {}
    setLoadingList(false);
  };

  useEffect(() => { loadLogs(); }, []);

  useEffect(() => {
    if (initialMood) { setSel(initialMood); clearInitialMood && clearInitialMood(); }
  }, [initialMood]);

  useEffect(() => {
    const tryGenDiaries = async () => {
      const now = new Date();
      if (now.getHours() < 21) return;
      const today = now.toISOString().slice(0, 10);
      const flag = 'companion_diary_gen_' + today;
      if (localStorage.getItem(flag)) return;
      try {
        const r = await fetch(`${BACKEND}/moods/generate-diaries`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ log_date: today })
        });
        // 成功后才写「今天已生成」标记；请求失败不写，下次进来还能重试（原来先写标记，失败当天就永久跳过）
        if (r.ok) localStorage.setItem(flag, '1');
        loadLogs();
      } catch {}
    };
    tryGenDiaries();
  }, []);

  const handleDiaryFiles = (e) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/') && f.size <= 10 * 1024 * 1024).slice(0, 9);
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setPendingImages(prev => [...prev, { data: ev.target.result.split(',')[1], type: file.type, name: file.name, preview: ev.target.result }]);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const removePendingImage = (idx) => {
    setPendingImages(prev => prev.filter((_, i) => i !== idx));
  };

  const submit = async () => {
    if (!text.trim() && !sel && pendingImages.length === 0) return;
    const id = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    setBusy(true);

    let imageUrls = [];
    if (pendingImages.length > 0) {
      setUploadingImages(true);
      for (const img of pendingImages) {
        try {
          const r = await fetch(`${BACKEND}/upload`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: img.data, type: img.type, name: img.name }),
          });
          const d = await r.json();
          if (d.url) imageUrls.push(d.url);
        } catch {}
      }
      setUploadingImages(false);
    }

    const imgPrefix = imageUrls.map(u => `[img:${u}]`).join('\n');
    const fullContent = imgPrefix ? (text.trim() ? `${imgPrefix}\n${text.trim()}` : imgPrefix) : text.trim();

    const optimistic = { id, author_type: 'user', author_name: '小满', mood_id: sel, content: fullContent, reply: null, reply_char: null, log_date: today };
    setLogs(prev => [optimistic, ...prev]);
    const savedMood = sel, savedContent = fullContent;
    setSel(null); setText(''); setPendingImages([]);
    try {
      const res = await fetch(`${BACKEND}/moods`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, mood_id: savedMood, content: savedContent, log_date: today })
      });
      const data = await res.json();
      if (data.reply) {
        setLogs(prev => prev.map(l => l.id === id ? { ...l, reply: data.reply, reply_char: data.reply_char } : l));
      }
      setTimeout(() => loadLogs(), 30000);
    } catch {}
    setBusy(false);
  };

  const parseContent = (content) => {
    if (!content) return { images: [], text: '' };
    const images = [];
    const lines = content.split('\n');
    const textLines = [];
    for (const line of lines) {
      const m = line.match(/^\[img:(https?:\/\/[^\]]+)\]$/);
      if (m) images.push(m[1]);
      else textLines.push(line);
    }
    return { images, text: textLines.join('\n').trim() };
  };

  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', padding: '24px 18px 48px', maxWidth: 460, margin: '0 auto', width: '100%' }}>
      <h2 style={{ fontSize: 22, fontWeight: t.isPixel ? 700 : 400, color: t.text1, margin: '0 0 4px', fontFamily: 'inherit' }}>日记</h2>
      <p style={{ fontSize: 11, color: t.text3, letterSpacing: '0.08em', marginBottom: 22 }}>写下今天的一切</p>
      <Card t={t} style={{ padding: '18px', marginBottom: 22 }}>
        <div style={{ fontSize: 10, color: t.text3, marginBottom: 8, letterSpacing: '0.06em' }}>今天的心情（可选）</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 14 }}>
          {MOODS.map(m => (
            <div key={m.id} className="tap" onClick={() => setSel(sel === m.id ? null : m.id)} title={m.label} style={{ cursor: 'pointer', borderRadius: '50%', border: `2px solid ${sel === m.id ? t.acc : 'transparent'}`, padding: 3, transition: 'border-color 0.15s' }}>{m.svg}</div>
          ))}
        </div>
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder="写下今天的碎碎念…" rows={4} className="hs" style={{ width: '100%', backgroundColor: 'rgba(255,255,255,0.4)', border: t.isPixel ? `2px solid ${t.border}` : `1px solid ${t.border}`, borderRadius: t.radius > 0 ? 10 : 0, padding: '10px 12px', fontSize: 13, outline: 'none', color: t.text1, fontFamily: 'inherit', marginBottom: 10, resize: 'none', lineHeight: 1.7, boxSizing: 'border-box' }} />

        {pendingImages.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            {pendingImages.map((img, i) => (
              <div key={i} style={{ position: 'relative', width: 70, height: 70 }}>
                <img src={img.preview} alt="" style={{ width: 70, height: 70, objectFit: 'cover', borderRadius: 8, border: `1px solid ${t.border}` }} />
                <button onClick={() => removePendingImage(i)} style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', backgroundColor: '#ef4444', border: 'none', color: '#fff', fontSize: 11, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 0 }}>
          <input type="file" ref={diaryFileRef} onChange={handleDiaryFiles} accept="image/*" multiple style={{ display: 'none' }} />
          <button className="tap" onClick={() => diaryFileRef.current?.click()} style={{ flex: 'none', padding: '8px 14px', fontSize: 12, backgroundColor: 'transparent', color: t.text3, border: `1px solid ${t.border}`, borderRadius: t.radius > 0 ? 16 : 0, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
            📷 {pendingImages.length > 0 ? `${pendingImages.length}张` : '添加图片'}
          </button>
          <button className="tap" onClick={submit} disabled={busy || uploadingImages} style={{ flex: 1, backgroundColor: t.acc, color: '#fff', border: 'none', borderRadius: t.radius > 0 ? 20 : 0, padding: '10px', fontSize: 14, fontWeight: 'bold', cursor: 'pointer', opacity: busy ? 0.6 : 1, fontFamily: 'inherit' }}>{uploadingImages ? '上传图片中…' : busy ? '记录中…' : '封存此刻'}</button>
        </div>
      </Card>

      {loadingList && <p style={{ fontSize: 12, color: t.text3, textAlign: 'center', fontFamily: 'inherit' }}>加载中…</p>}

      {logs.map(log => {
        const isChar = log.author_type === 'character';
        const cs = isChar ? CHARACTERS.find(c => c.id === log.character_id) : null;
        const m = !isChar && log.mood_id ? (MOODS.find(x => x.id === log.mood_id) || null) : null;
        const parsed = parseContent(log.content);
        return (
          <Card key={log.id} t={t} style={{ padding: '16px 18px', marginBottom: 14, borderLeft: isChar && cs ? `3px solid ${cs.accent}` : undefined }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: (parsed.text || parsed.images.length > 0) ? 10 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                {isChar && cs && <CharAvatar c={cs} size={20} />}
                <span style={{ fontSize: 12, fontWeight: 'bold', color: t.text1, fontFamily: 'inherit' }}>{isChar ? `${log.author_name}的日记` : log.log_date}</span>
              </div>
              {!isChar && m && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: t.text3 }}>{m.label}</span>
                  <div style={{ width: 22, height: 22 }}>{m.svg}</div>
                </div>
              )}
              {isChar && <span style={{ fontSize: 10, color: t.text3 }}>{log.log_date}</span>}
            </div>
            {parsed.images.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: parsed.text ? 10 : 0 }}>
                {parsed.images.map((url, ii) => (
                  <img key={ii} src={url} alt="" style={{ width: parsed.images.length === 1 ? '100%' : 'calc(50% - 3px)', maxHeight: 200, objectFit: 'cover', borderRadius: 8, display: 'block' }} />
                ))}
              </div>
            )}
            {parsed.text && <p style={{ fontSize: 13, color: t.text1, lineHeight: 1.8, margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{parsed.text}</p>}
            {(() => {
              const allR = log.all_replies ? (typeof log.all_replies === 'string' ? JSON.parse(log.all_replies) : log.all_replies) : null;
              if (allR && allR.length > 0) return (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${t.border}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {allR.map((r, ri) => {
                    const rc = CHARACTERS.find(c => c.id === r.char);
                    return (
                      <div key={ri} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <div style={{ width: 18, height: 18, borderRadius: '50%', border: `1.5px solid ${rc?.accent || t.acc}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: rc?.accent || t.acc, fontWeight: 700, flexShrink: 0, marginTop: 2 }}>{rc?.initial || '?'}</div>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: 10, color: rc?.accent || t.acc, fontWeight: 'bold', fontFamily: 'inherit' }}>{r.name}：</span>
                          <span style={{ fontSize: 13, color: t.text2, lineHeight: 1.7, fontFamily: 'inherit' }}>{r.text}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
              if (log.reply) return (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${t.border}`, display: 'flex', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>💌</span>
                  <div>
                    <span style={{ fontSize: 10, color: t.acc, fontWeight: 'bold', display: 'block', marginBottom: 3, fontFamily: 'inherit' }}>{log.reply_char} 的悄悄话：</span>
                    <p style={{ fontSize: 13, color: t.text2, lineHeight: 1.7, margin: 0, fontFamily: 'inherit' }}>{log.reply}</p>
                  </div>
                </div>
              );
              return null;
            })()}
          </Card>
        );
      })}
    </div>
  );
}

function TodoPage({ t, todos, toggleGlobalTodo, addGlobalTodo, deleteGlobalTodo }) {
  const [input, setInput] = useState('');
  const toggle = id => toggleGlobalTodo(id);
  const del = id => deleteGlobalTodo(id);
  const add = () => { if (!input.trim()) return; addGlobalTodo(input); setInput(''); };

  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', padding: '24px 18px 48px', maxWidth: 460, margin: '0 auto', width: '100%' }}>
      <h2 style={{ fontSize: 22, fontWeight: t.isPixel ? 700 : 400, color: t.text1, margin: '0 0 4px', fontFamily: 'inherit' }}>待办清单</h2>
      <p style={{ fontSize: 11, color: t.text3, letterSpacing: '0.08em', marginBottom: 22 }}>{todos.filter(x => !x.done).length} 项未完成</p>
      <Card t={t} style={{ padding: '14px', display: 'flex', gap: 10, marginBottom: 18 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="新任务…" style={{ flex: 1, backgroundColor: 'transparent', border: 'none', outline: 'none', fontSize: 14, color: t.text1, fontFamily: 'inherit' }} />
        <button className="tap" onClick={add} style={{ backgroundColor: t.acc, color: '#fff', border: 'none', padding: '7px 16px', borderRadius: t.radius > 0 ? 20 : 0, fontSize: 13, fontWeight: 'bold', cursor: 'pointer', fontFamily: 'inherit' }}>+</button>
      </Card>
      <Card t={t} style={{ padding: '10px 16px' }}>
        {(() => { const ordered = [...todos].sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0)); return todos.length === 0 ? <p style={{ fontSize: 12, color: t.text3, textAlign: 'center', padding: '16px 0', fontFamily: 'inherit' }}>暂时没有待办 🍃</p> : ordered.map((td, i) => (
          <div key={td.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0', borderBottom: i < ordered.length - 1 ? `1px solid ${t.border}` : 'none' }}>
            <div className="tap" onClick={() => toggle(td.id)} style={{ width: 18, height: 18, borderRadius: t.isPixel ? 0 : '50%', flexShrink: 0, border: `2px solid ${td.done ? t.acc : t.text3}`, backgroundColor: td.done ? `${t.acc}22` : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              {td.done && <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: t.acc }} />}
            </div>
            <span className="tap" onClick={() => toggle(td.id)} style={{ flex: 1, fontSize: 14, color: td.done ? t.text3 : t.text1, textDecoration: td.done ? 'line-through' : 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>{td.text}</span>
            <button className="tap" onClick={() => del(td.id)} style={{ backgroundColor: 'transparent', border: 'none', color: '#ef4444', fontSize: 12, cursor: 'pointer', padding: '2px 6px', fontFamily: 'inherit' }}>×</button>
          </div>
        )); })()}
      </Card>
    </div>
  );
}

function QuestionPage({ t }) {
  const [question, setQuestion] = useState(null);
  const [answer, setAnswer] = useState('');
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [answered, setAnswered] = useState(false);

  useEffect(() => { loadQuestion(); }, []);

  const loadQuestion = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND}/question/today`);
      const data = await res.json();
      if (data.question) {
        setQuestion({ charId: data.question.char_id, charName: data.question.char_name, text: data.question.question_text });
        if (data.question.answer) {
          setAnswer(data.question.answer);
          setResponse(data.question.response);
          setAnswered(true);
        }
      } else {
        await generateQuestion();
        return;
      }
    } catch {}
    setLoading(false);
  };

  const generateQuestion = async (force) => {
    try {
      const res = await fetch(`${BACKEND}/question/today`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force: !!force }) });
      const data = await res.json();
      if (data.question) {
        setQuestion({ charId: data.question.char_id, charName: data.question.char_name, text: data.question.question_text });
      }
    } catch {}
    setLoading(false);
  };

  const refreshQuestion = async () => {
    if (loading) return;
    setAnswered(false); setAnswer(''); setResponse(null); setLoading(true);
    await generateQuestion(true);
  };

  const submitAnswer = async () => {
    if (!answer.trim() || !question) return;
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND}/question/today/answer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answer }) });
      const data = await res.json();
      if (data.response) { setResponse(data.response); setAnswered(true); }
    } catch {}
    setLoading(false);
  };

  const char = question ? CHARACTERS.find(c => c.id === question.charId) : null;

  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', padding: '24px 18px 48px', maxWidth: 460, margin: '0 auto', width: '100%' }}>
      <h2 style={{ fontSize: 22, fontWeight: t.isPixel ? 700 : 400, color: t.text1, margin: '0 0 4px', fontFamily: 'inherit' }}>今日一问</h2>
      <p style={{ fontSize: 11, color: t.text3, letterSpacing: '0.08em', marginBottom: 24 }}>他们今天想问你什么</p>
      {loading && !question && <p style={{ color: t.text3, fontSize: 13, fontFamily: 'inherit' }}>正在感知今日问题…</p>}
      {question && (
        <Card t={t} style={{ padding: '22px 20px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ width: 32, height: 32, borderRadius: t.isPixel ? 0 : '50%', border: `1.5px solid ${char?.accent || t.acc}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: char?.accent || t.acc, fontWeight: 700 }}>{char?.initial || '?'}</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: t.text1, fontFamily: 'inherit' }}>{question.charName}</div>
              <div style={{ fontSize: 10, color: t.text3, fontFamily: 'inherit' }}>今天的问题</div>
            </div>
          </div>
          <p style={{ fontSize: 16, color: t.text1, lineHeight: 1.8, margin: '0 0 20px', fontFamily: 'inherit', fontWeight: t.isPixel ? 700 : 500 }}>"{question.text}"</p>
          {!answered ? (
            <>
              <textarea value={answer} onChange={e => setAnswer(e.target.value)} placeholder="写下你的回答…" rows={3} className="hs" style={{ width: '100%', backgroundColor: 'rgba(255,255,255,0.4)', border: t.isPixel ? `2px solid ${t.border}` : `1px solid ${t.border}`, borderRadius: t.radius > 0 ? 10 : 0, padding: '10px 12px', fontSize: 13, outline: 'none', color: t.text1, fontFamily: 'inherit', marginBottom: 12, resize: 'none', lineHeight: 1.7 }} />
              <button className="tap" onClick={submitAnswer} disabled={loading} style={{ width: '100%', backgroundColor: char?.accent || t.acc, color: '#fff', border: 'none', borderRadius: t.radius > 0 ? 20 : 0, padding: '10px', fontSize: 14, fontWeight: 'bold', cursor: 'pointer', opacity: loading ? 0.6 : 1, fontFamily: 'inherit' }}>{loading ? '发送中…' : '回答他'}</button>
            </>
          ) : (
            <div style={{ animation: 'fadeIn 0.4s ease' }}>
              <div style={{ padding: '12px 16px', backgroundColor: 'rgba(255,255,255,0.4)', borderRadius: t.radius > 0 ? 10 : 0, border: `1px solid ${t.border}`, marginBottom: 12 }}>
                <p style={{ fontSize: 13, color: t.text2, margin: 0, fontFamily: 'inherit' }}>你说：{answer}</p>
              </div>
              {response && (
                <div style={{ padding: '12px 16px', backgroundColor: `${char?.accent || t.acc}15`, borderRadius: t.radius > 0 ? 10 : 0, borderLeft: `3px solid ${char?.accent || t.acc}` }}>
                  <p style={{ fontSize: 13, color: t.text1, lineHeight: 1.8, margin: 0, fontFamily: 'inherit' }}>{response}</p>
                </div>
              )}
              <p style={{ fontSize: 11, color: t.text3, textAlign: 'center', marginTop: 16, fontFamily: 'inherit' }}>明天再来 ✦</p>
            </div>
          )}
          <button className="tap" onClick={refreshQuestion} disabled={loading} style={{ width: '100%', marginTop: 14, background: 'transparent', color: char?.accent || t.acc, border: `1px solid ${(char?.accent || t.acc)}55`, borderRadius: t.radius > 0 ? 20 : 0, padding: '9px', fontSize: 13, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.5 : 1, fontFamily: 'inherit' }}>{loading ? '正在换…' : '换一题'}</button>
        </Card>
      )}
    </div>
  );
}

function BookPage({ t }) {
  const ALL_CHARS = ['yu'];
  const SERIF = "'STZhongsong','华文中宋','Noto Serif SC','Source Han Serif SC',serif";
  const SANS = "'PingFang SC','Noto Sans SC','Source Han Sans SC',system-ui,sans-serif";
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [shelves, setShelves] = useState([]);
  const [searching, setSearching] = useState(false);

  const [book, setBook] = useState(null);
  const [pages, setPages] = useState([]);
  const [pageIdx, setPageIdx] = useState(0);
  const [loadingBook, setLoadingBook] = useState(false);
  const [pageAnim, setPageAnim] = useState('');

  // 批注：本次会话生成的（按页）+ 后台预生成/累积的（按 quote 落库）
  const [annotations, setAnnotations] = useState({});
  const [storedAnnos, setStoredAnnos] = useState([]);
  const [annotating, setAnnotating] = useState(false);
  const [showAnnoList, setShowAnnoList] = useState(false);
  const [userThought, setUserThought] = useState('');
  const [thoughtReplies, setThoughtReplies] = useState({});
  const [replyingThought, setReplyingThought] = useState(false);
  const [uploadedBooks, setUploadedBooks] = useState([]);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadAuthor, setUploadAuthor] = useState('');
  const [uploading, setUploading] = useState(false);
  const uploadFileRef = useRef(null);

  // 阅读设置（统一存本地）
  const [fontSize, setFontSize] = useState(() => parseInt(localStorage.getItem('companion_read_fs') || '18'));
  const [lineH, setLineH] = useState(() => parseFloat(localStorage.getItem('companion_read_lh') || '2'));
  const [marginX, setMarginX] = useState(() => parseInt(localStorage.getItem('companion_read_mg') || '24'));
  const [bgKey, setBgKey] = useState(() => localStorage.getItem('companion_read_bg') || 'paper');
  const [serif, setSerif] = useState(() => localStorage.getItem('companion_read_font') !== 'sans');
  const [showSettings, setShowSettings] = useState(false);
  const [charsPerPage, setCharsPerPage] = useState(420);

  // 目录 / 阅读明细 / 自动翻页
  const [chapters, setChapters] = useState([]);
  const [showToc, setShowToc] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [readSec, setReadSec] = useState(0);
  const [notesCount, setNotesCount] = useState(0);
  const [autoFlip, setAutoFlip] = useState(false);
  const [autoSpeed, setAutoSpeed] = useState(() => parseInt(localStorage.getItem('companion_read_auto') || '25'));
  const pageStartsRef = useRef([]);

  const READ_BGS = {
    paper: { bg: '#faf6f0', text: '#3a3028', sub: '#8a7a6a', name: '米白' },
    white: { bg: '#ffffff', text: '#2c2c2c', sub: '#9a9a9a', name: '纯白' },
    beige: { bg: '#f3e9d2', text: '#5b4a32', sub: '#a08a64', name: '米黄' },
    green: { bg: '#e2ede0', text: '#33402d', sub: '#7a8a70', name: '护眼' },
    night: { bg: '#1b1b1d', text: '#b9b1a4', sub: '#6a655c', name: '夜间' },
  };
  const rb = READ_BGS[bgKey] || READ_BGS.paper;
  const BOOK_FONT = serif ? SERIF : SANS;

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchStartT = useRef(0);
  const [activeAnno, setActiveAnno] = useState(null);   // 点开划线句弹出的感想卡片
  const readerRef = useRef(null);
  const rawTextRef = useRef('');
  const chapterOffsetsRef = useRef([]);
  const bookTokenRef = useRef(0);   // 换书令牌：丢弃旧书的在途请求结果
  const selTokenRef = useRef(0);    // 划线令牌：丢弃过期划线的角色回复
  const pageIdxRef = useRef(0); pageIdxRef.current = pageIdx;     // 最新页码（给定时器/重排用，避免闭包过期）
  const pagesLenRef = useRef(0); pagesLenRef.current = pages.length;

  useEffect(() => {
    localStorage.setItem('companion_read_fs', String(fontSize));
    localStorage.setItem('companion_read_lh', String(lineH));
    localStorage.setItem('companion_read_mg', String(marginX));
    localStorage.setItem('companion_read_bg', bgKey);
    localStorage.setItem('companion_read_font', serif ? 'serif' : 'sans');
  }, [fontSize, lineH, marginX, bgKey, serif]);

  useEffect(() => {
    fetch(`${BACKEND}/books/recommend`).then(r => r.json()).then(d => setShelves(d.shelves || [])).catch(() => {});
    fetch(`${BACKEND}/books/uploaded`).then(r => r.json()).then(d => setUploadedBooks(d.books || [])).catch(() => {});
  }, []);

  const handleUpload = async () => {
    const file = uploadFileRef.current?.files?.[0];
    if (!file || !uploadTitle.trim()) return;
    setUploading(true);
    try {
      const text = await file.text();
      const r = await fetch(`${BACKEND}/books/upload`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: uploadTitle.trim(), author: uploadAuthor.trim(), content: text }),
      });
      const d = await r.json();
      if (d.ok) {
        setUploadedBooks(prev => [d.book, ...prev]);
        setShowUpload(false); setUploadTitle(''); setUploadAuthor('');
        if (uploadFileRef.current) uploadFileRef.current.value = '';
      } else { alert(d.error || '上传失败'); }
    } catch { alert('上传失败'); }
    setUploading(false);
  };

  const search = async () => {
    if (!q.trim()) return;
    setSearching(true); setResults([]);
    try {
      const r = await fetch(`${BACKEND}/books/search?q=${encodeURIComponent(q.trim())}`);
      const d = await r.json();
      setResults(d.results || []);
    } catch { setResults([]); }
    setSearching(false);
  };

  // 返回 { pages: string[], starts: number[] }，starts 记录每页在原文里的起始字符偏移（章节→页 映射用）
  // breaks：章节起点偏移数组——强制在这些位置断页，让每章从新页顶部开始（修复目录跳页落到上一章末尾的问题）
  const paginate = (text, size, breaks) => {
    const list = [], starts = []; let i = 0;
    const S = Math.max(120, size || 420);
    const bps = (breaks || []).filter(b => b > 0).sort((a, b) => a - b);
    let bi = 0;
    while (i < text.length) {
      while (bi < bps.length && bps[bi] <= i) bi++;
      let end = Math.min(i + S, text.length);
      if (bi < bps.length && bps[bi] > i && bps[bi] < end) {
        end = bps[bi];   // 章节边界优先：在下一章起点处断页
      } else if (end < text.length) {
        const slice = text.slice(i, end);
        const cut = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf('。'), slice.lastIndexOf('. '), slice.lastIndexOf('！'), slice.lastIndexOf('？'));
        if (cut > S * 0.4) end = i + cut + 1;
      }
      list.push(text.slice(i, end).trim());
      starts.push(i);
      i = end;
    }
    const pages = [], st = [];
    list.forEach((p, k) => { if (p) { pages.push(p); st.push(starts[k]); } });
    return { pages, starts: st };
  };

  // 解析章节（第X章/回/节/卷、序/楔子/番外/后记、Chapter N）
  const parseChapters = (text) => {
    const out = [];
    const re = /(^|\n)[ \t　]*(第[ \t　]*[0-9一二三四五六七八九十百千零两]+[ \t　]*[章回节卷部篇集][^\n]{0,28}|(?:序章|序言|自序|楔子|引子|前言|序|后记|尾声|终章|番外|外传|附录|跋)[^\n]{0,18}|Chapter[ \t]+[0-9IVXLC]+[^\n]{0,40}|CHAPTER[ \t]+[0-9IVXLC]+[^\n]{0,40})[ \t　]*(?=\n|$)/g;
    let m;
    while ((m = re.exec(text))) {
      const title = m[2].trim();
      const idx = m.index + (m[1] ? m[1].length : 0);
      if (title && title.length <= 30 && (!out.length || out[out.length - 1].title !== title)) out.push({ title, idx });
      if (out.length > 800) break;
    }
    return out;
  };

  const pageForOffset = (idx) => {
    const starts = pageStartsRef.current; let pg = 0;
    for (let k = 0; k < starts.length; k++) { if (starts[k] <= idx) pg = k; else break; }
    return pg;
  };

  const openBook = async (b) => {
    const myToken = ++bookTokenRef.current;
    setBook(b); setLoadingBook(true); setPages([]); setPageIdx(0); setAnnotations({}); setStoredAnnos([]); setChapters([]);
    setSelectionAnnotation(null); setThoughtReplies({}); setAutoFlip(false);
    setShowToc(false); setShowDetail(false); setShowSettings(false); setShowAnnoList(false);
    rawTextRef.current = ''; pageStartsRef.current = []; chapterOffsetsRef.current = [];
    setReadSec(parseInt(localStorage.getItem(`companion_booktime_${b.source}_${b.id}`) || '0'));
    setNotesCount(parseInt(localStorage.getItem(`companion_booknotes_${b.source}_${b.id}`) || '0'));
    // 拉取后台预生成 / 累积的划线感想
    fetch(`${BACKEND}/books/annotations?book_key=${encodeURIComponent(`${b.source}:${b.id}`)}`).then(r => r.json()).then(d => { if (bookTokenRef.current === myToken) setStoredAnnos(d.annotations || []); }).catch(() => {});
    try {
      const params = new URLSearchParams({ source: b.source, id: b.id });
      if (b.textUrl) params.set('textUrl', b.textUrl);
      const r = await fetch(`${BACKEND}/books/content?${params}`);
      const d = await r.json();
      if (bookTokenRef.current !== myToken) return;   // 已经换书了，丢弃这次结果
      if (d.text) {
        rawTextRef.current = d.text;
        const chs = parseChapters(d.text);
        setChapters(chs);
        chapterOffsetsRef.current = chs.map(c => c.idx);
        const { pages: pg, starts } = paginate(d.text, charsPerPage, chapterOffsetsRef.current);
        pageStartsRef.current = starts;
        setPages(pg);
        const frac = parseFloat(localStorage.getItem(`companion_bookfrac_${b.source}_${b.id}`) || '0');
        setPageIdx(Math.min(Math.round(frac * pg.length), Math.max(0, pg.length - 1)));
      } else { rawTextRef.current = ''; setPages(['（没有取到这本书的正文，换一本或用搜索试试）']); }
    } catch { if (bookTokenRef.current === myToken) setPages(['（加载失败，稍后再试）']); }
    if (bookTokenRef.current === myToken) setLoadingBook(false);
  };

  // 自适应每页字数：按容器尺寸 + 字号 + 行距实测，解决"一页字太多"
  useEffect(() => {
    if (!book) return;
    const measure = () => {
      const el = readerRef.current; if (!el) return;
      const w = el.clientWidth - marginX * 2;
      const h = el.clientHeight - 36;
      if (w < 40 || h < 40) return;
      const perLine = Math.max(8, Math.floor(w / (fontSize * 1.06)));
      const lines = Math.max(6, Math.floor(h / (fontSize * lineH)));
      setCharsPerPage(Math.max(140, Math.floor(perLine * lines * 0.94)));
    };
    const id = setTimeout(measure, 60);
    window.addEventListener('resize', measure);
    return () => { clearTimeout(id); window.removeEventListener('resize', measure); };
  }, [book, fontSize, lineH, marginX]);

  // 每页字数变化 → 重新分页（按字符偏移精确保持阅读位置，不再用分页占比近似）
  useEffect(() => {
    if (!rawTextRef.current) return;
    const savedOffset = pageStartsRef.current[pageIdxRef.current] ?? 0;
    const { pages: pg, starts } = paginate(rawTextRef.current, charsPerPage, chapterOffsetsRef.current);
    pageStartsRef.current = starts;
    setPages(pg);
    let np = 0;
    for (let k = 0; k < starts.length; k++) { if (starts[k] <= savedOffset) np = k; else break; }
    setPageIdx(Math.min(np, Math.max(0, pg.length - 1)));
  }, [charsPerPage]);

  // 阅读时长累计（每 5 秒，标签页隐藏时不计）
  useEffect(() => {
    if (!book) return;
    const key = `companion_booktime_${book.source}_${book.id}`;
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      setReadSec(s => { const n = s + 5; try { localStorage.setItem(key, String(n)); } catch {} return n; });
    }, 5000);
    return () => clearInterval(id);
  }, [book]);

  // 自动翻页（用 ref 读最新页码/总页数，避免重排时定时器被频繁重建而卡住）
  useEffect(() => {
    if (!autoFlip || !book) return;
    const id = setInterval(() => {
      const len = pagesLenRef.current, cur = pageIdxRef.current;
      if (cur >= len - 1) { setAutoFlip(false); return; }
      const np = cur + 1;
      setPageIdx(np);
      localStorage.setItem(`companion_bookfrac_${book.source}_${book.id}`, String(len ? np / len : 0));
      readerRef.current?.scrollTo({ top: 0 });
    }, autoSpeed * 1000);
    return () => clearInterval(id);
  }, [autoFlip, autoSpeed, book]);

  const goToPage = (pg) => {
    const p = Math.max(0, Math.min(pg, pages.length - 1));
    setPageIdx(p);
    if (book) localStorage.setItem(`companion_bookfrac_${book.source}_${book.id}`, String(pages.length ? p / pages.length : 0));
    readerRef.current?.scrollTo({ top: 0 });
  };

  const bumpNotes = () => {
    if (!book) return;
    const k = `companion_booknotes_${book.source}_${book.id}`;
    const n = (parseInt(localStorage.getItem(k) || '0') || 0) + 1;
    try { localStorage.setItem(k, String(n)); } catch {}
    setNotesCount(n);
  };

  const goPage = (dir) => {
    const next = pageIdx + dir;
    if (next < 0 || next >= pages.length) return;
    setPageAnim(dir > 0 ? 'slide-left' : 'slide-right');
    setTimeout(() => {
      setPageIdx(next);
      setPageAnim('');
      if (book) localStorage.setItem(`companion_bookfrac_${book.source}_${book.id}`, String(pages.length ? next / pages.length : 0));
      readerRef.current?.scrollTo({ top: 0 });
    }, 200);
  };

  const handleTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; touchStartY.current = e.touches[0].clientY; touchStartT.current = Date.now(); };
  const handleTouchEnd = (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    const dt = Date.now() - touchStartT.current;
    // 只把「快速、横向为主、短时」的轻扫当作翻页；长按/拖拽选字不算
    if (dt >= 600 || Math.abs(dx) <= 55 || Math.abs(dx) <= Math.abs(dy) * 1.8) return;
    // 稍等让选区落定：有选中文本＝在划线，绝不翻页
    setTimeout(() => {
      const hasSel = (window.getSelection()?.toString() || '').trim().length > 0;
      if (!hasSel) goPage(dx < 0 ? 1 : -1);
    }, 60);
  };

  const [selectionAnnotation, setSelectionAnnotation] = useState(null);
  const [selAnnotating, setSelAnnotating] = useState(false);

  const handleTextSelect = () => {
    const sel = window.getSelection();
    const text = sel?.toString()?.trim();
    if (text && text.length > 2 && text.length < 500) {
      selTokenRef.current++;
      setSelectionAnnotation({ text, replies: [] });
    }
  };

  const annotateSelection = async () => {
    if (!selectionAnnotation || selAnnotating) return;
    const myBook = bookTokenRef.current, mySel = ++selTokenRef.current, myText = selectionAnnotation.text;
    setSelAnnotating(true);
    bumpNotes();
    const newReplies = [];
    for (const cid of ALL_CHARS) {
      try {
        const r = await fetch(`${BACKEND}/books/annotate-selection`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ character_id: cid, book_title: book?.title, selected_text: myText, context_before: pages[pageIdx]?.slice(0, 300) }),
        });
        const d = await r.json();
        if (bookTokenRef.current !== myBook || selTokenRef.current !== mySel) return;  // 换书/换了划线，丢弃
        if (d.reply) { newReplies.push({ cid, text: d.reply }); setSelectionAnnotation(prev => (prev && prev.text === myText) ? { ...prev, replies: [...newReplies] } : prev); }
      } catch {}
    }
    if (bookTokenRef.current === myBook && selTokenRef.current === mySel) setSelAnnotating(false);
  };

  // 这页让四人一起读：一次调用，后端协调每人划不同的句子
  const requestCoread = async (forceIdx) => {
    if (annotating) return;
    const pi = forceIdx ?? pageIdx;
    if (!pages[pi] || !book || !rawTextRef.current) return;   // 占位/报错页不触发
    const myBook = bookTokenRef.current;
    setAnnotating(true);
    try {
      const r = await fetch(`${BACKEND}/books/coread`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ book_title: book?.title, passage: pages[pi], book_key: `${book.source}:${book.id}` }),
      });
      const d = await r.json();
      if (bookTokenRef.current !== myBook) return;   // 已换书，丢弃旧结果
      if (d.annotations?.length) {
        setAnnotations(prev => ({ ...prev, [`${pi}`]: d.annotations }));
        setStoredAnnos(prev => { const have = new Set(prev.map(a => a.quote)); return [...prev, ...d.annotations.filter(a => a.quote && !have.has(a.quote))]; });
      }
    } catch {}
    if (bookTokenRef.current === myBook) setAnnotating(false);
  };

  // 自动批注：翻到没人划过的新页，1.8s 后自动让大家读（占位/报错页不触发）
  useEffect(() => {
    if (!book || !pages[pageIdx] || !rawTextRef.current) return;
    const here = storedAnnos.filter(a => a.quote && pages[pageIdx]?.includes(a.quote)).length + ((annotations[`${pageIdx}`] || []).length);
    if (here > 0) return;
    const timer = setTimeout(() => requestCoread(pageIdx), 1800);
    return () => clearTimeout(timer);
  }, [pageIdx, book, pages, storedAnnos.length]);

  if (book) {
    // 当前页批注 = 落库的（quote 出现在本页）+ 本次会话生成的（去重）
    const stored = storedAnnos.filter(a => a.quote && pages[pageIdx]?.includes(a.quote));
    const seenQ = new Set(stored.map(a => a.quote));
    const pageAnnotations = [...stored, ...(annotations[`${pageIdx}`] || []).filter(f => !seenQ.has(f.quote))];
    // 把角色划线的原句就地高亮（划线效果），颜色随角色
    const renderPageText = (text) => {
      const marks = pageAnnotations.filter(a => a.quote && text.includes(a.quote));
      if (marks.length === 0) return text;
      let nodes = [text];
      marks.forEach((a, mi) => {
        const ch = CHARACTERS.find(c => c.id === a.cid);
        const color = ch?.accent || '#d4a373';
        const next = [];
        nodes.forEach(seg => {
          if (typeof seg !== 'string') { next.push(seg); return; }
          const idx = seg.indexOf(a.quote);
          if (idx === -1) { next.push(seg); return; }
          next.push(seg.slice(0, idx));
          next.push(<mark key={`mk${mi}-${idx}`} onClick={(ev) => { ev.stopPropagation(); setActiveAnno(a); }} style={{ backgroundColor: `${color}33`, color: rb.text, borderBottom: `2px solid ${color}`, padding: '0 1px', borderRadius: 2, cursor: 'pointer' }}>{a.quote}</mark>);
          next.push(seg.slice(idx + a.quote.length));
        });
        nodes = next;
      });
      return nodes;
    };
    const seg = (label, opts, cur, set) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 11, color: rb.sub, width: 30, flexShrink: 0 }}>{label}</span>
        <div style={{ flex: 1, display: 'flex', gap: 6 }}>
          {opts.map(o => (
            <button key={String(o.v)} className="tap" onClick={() => set(o.v)} style={{ flex: 1, padding: '7px 0', fontSize: 11, borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', border: `1px solid ${cur === o.v ? t.acc : rb.text + '22'}`, backgroundColor: cur === o.v ? `${t.acc}1a` : 'transparent', color: cur === o.v ? t.acc : rb.sub }}>{o.l}</button>
          ))}
        </div>
      </div>
    );
    const toolBtn = ({ onClick, disabled, icon, label, active }) => (
      <div key={label} className="tap" onClick={disabled ? undefined : onClick} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.3 : 1, padding: '2px 4px', minWidth: 38 }}>
        <span style={{ fontSize: 16, lineHeight: 1, color: active ? t.acc : rb.sub, fontFamily: 'serif', fontWeight: 600 }}>{icon}</span>
        <span style={{ fontSize: 9, color: active ? t.acc : rb.sub }}>{label}</span>
      </div>
    );
    const closePanels = () => { setShowToc(false); setShowDetail(false); setShowSettings(false); setShowAnnoList(false); };
    const curStart = pageStartsRef.current[pageIdx] ?? 0;
    let curChapter = '';
    for (const c of chapters) { if (c.idx <= curStart) curChapter = c.title; else break; }
    const progressPct = pages.length ? Math.round(((pageIdx + 1) / pages.length) * 100) : 0;
    const readMin = Math.floor(readSec / 60);
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: rb.bg, position: 'relative', transition: 'background-color 0.3s' }}>
        <style>{`
          @keyframes slideLeft{from{transform:translateX(0);opacity:1}to{transform:translateX(-30px);opacity:0}}
          @keyframes slideRight{from{transform:translateX(0);opacity:1}to{transform:translateX(30px);opacity:0}}
          .slide-left{animation:slideLeft 0.2s ease forwards}
          .slide-right{animation:slideRight 0.2s ease forwards}
        `}</style>
        <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, borderBottom: `0.5px solid ${rb.text}14`, minWidth: 0 }}>
          <span className="tap" onClick={() => { bookTokenRef.current++; setBook(null); }} style={{ fontSize: 26, color: rb.sub, cursor: 'pointer', flexShrink: 0, padding: '0 4px', lineHeight: 1 }}>‹</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: rb.text, fontFamily: BOOK_FONT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{curChapter || book.title}</div>
            <div style={{ fontSize: 9, color: rb.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{curChapter ? book.title + ' · ' : ''}{progressPct}%</div>
          </div>
        </div>

        <div ref={readerRef} className={`hs ${pageAnim}`} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} style={{ flex: 1, overflowY: 'auto', padding: `24px ${marginX}px 18px`, maxWidth: 720, margin: '0 auto', width: '100%' }}>
          {loadingBook ? <p style={{ color: rb.sub, fontSize: 13, textAlign: 'center', marginTop: 60, fontFamily: BOOK_FONT }}>翻开中…</p> : (
            <>
              <p onMouseUp={handleTextSelect} onTouchEnd={() => setTimeout(handleTextSelect, 200)} style={{ fontSize: fontSize, lineHeight: lineH, color: rb.text, whiteSpace: 'pre-wrap', fontFamily: BOOK_FONT, margin: 0, textAlign: 'justify', letterSpacing: '0.02em', userSelect: 'text', WebkitUserSelect: 'text' }}>{renderPageText(pages[pageIdx])}</p>

              {selectionAnnotation && (
                <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 10, backgroundColor: `${t.acc}10`, border: `1px dashed ${t.acc}55` }}>
                  <div style={{ fontSize: 10, color: rb.sub, marginBottom: 6 }}>划线：</div>
                  <div style={{ fontSize: 13, color: rb.text, fontFamily: BOOK_FONT, lineHeight: 1.8, marginBottom: 10, padding: '4px 8px', borderLeft: `3px solid ${t.acc}`, backgroundColor: `${rb.text}08` }}>「{selectionAnnotation.text}」</div>
                  {selectionAnnotation.replies.length === 0 && (
                    <button className="tap" onClick={annotateSelection} disabled={selAnnotating} style={{ fontSize: 11, padding: '6px 16px', borderRadius: 16, border: `1px solid ${t.acc}`, backgroundColor: selAnnotating ? `${t.acc}15` : 'transparent', color: t.acc, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {selAnnotating ? '在想…' : '让大家说说'}
                    </button>
                  )}
                  {selectionAnnotation.replies.map((r, ri) => {
                    const ch = CHARACTERS.find(c => c.id === r.cid);
                    return (
                      <div key={ri} style={{ marginTop: 8, padding: '8px 10px', borderLeft: `3px solid ${ch?.accent || '#ccc'}`, backgroundColor: `${ch?.accent || '#ccc'}12`, borderRadius: '0 8px 8px 0' }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: ch?.accent, display: 'block', marginBottom: 2 }}>{ch?.name}</span>
                        <p style={{ fontSize: 12, lineHeight: 1.8, color: rb.text, margin: 0, fontFamily: BOOK_FONT }}>{r.text}</p>
                      </div>
                    );
                  })}
                  <div className="tap" onClick={() => setSelectionAnnotation(null)} style={{ fontSize: 9, color: rb.sub, marginTop: 8, cursor: 'pointer', textAlign: 'right' }}>收起</div>
                </div>
              )}

              {pageAnnotations.length > 0 && (
                <div style={{ marginTop: 24, paddingTop: 14, borderTop: `1px dashed ${rb.text}1a` }}>
                  {pageAnnotations.map((a, i) => {
                    const ch = CHARACTERS.find(c => c.id === a.cid);
                    return (
                      <div key={i} style={{ marginBottom: 12, padding: '10px 12px', borderLeft: `3px solid ${ch?.accent || '#ccc'}`, backgroundColor: `${ch?.accent || '#ccc'}12`, borderRadius: '0 8px 8px 0' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: ch?.accent, display: 'block', marginBottom: 3 }}>{ch?.name}</span>
                        {a.quote && <div style={{ fontSize: 11, color: rb.sub, fontStyle: 'italic', marginBottom: 4, paddingLeft: 6, borderLeft: `1.5px solid ${ch?.accent || '#ccc'}`, fontFamily: BOOK_FONT }}>「{a.quote}」</div>}
                        <p style={{ fontSize: 13, lineHeight: 1.9, color: rb.text, margin: 0, fontFamily: BOOK_FONT }}>{a.reply}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
                <button className="tap" onClick={() => requestCoread()} disabled={annotating} style={{ fontSize: 11, padding: '7px 20px', borderRadius: 20, border: `1px solid ${t.acc}`, backgroundColor: annotating ? `${t.acc}15` : 'transparent', color: t.acc, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {annotating ? '大家在读…' : '让大家读这页'}
                </button>
                <div style={{ width: '100%', display: 'flex', gap: 8, marginTop: 6 }}>
                  <input value={userThought} onChange={e => setUserThought(e.target.value)} placeholder="你在想什么…" style={{ flex: 1, padding: '8px 12px', fontSize: 12, border: `1px solid ${rb.text}1f`, borderRadius: 18, backgroundColor: `${rb.text}08`, outline: 'none', color: rb.text, fontFamily: BOOK_FONT }} />
                  <button className="tap" onClick={async () => {
                    if (!userThought.trim() || replyingThought) return;
                    setReplyingThought(true);
                    const key = `thought_${pageIdx}`;
                    const newReplies = { ...thoughtReplies };
                    if (!newReplies[key]) newReplies[key] = [];
                    newReplies[key].push({ cid: 'user', text: userThought.trim() });
                    setThoughtReplies({ ...newReplies });
                    bumpNotes();
                    for (const cid of ALL_CHARS) {
                      try {
                        const r = await fetch(`${BACKEND}/books/discuss`, {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ character_id: cid, book_title: book?.title, passage: `${pages[pageIdx]?.slice(0, 800)}\n\n【小满说】${userThought}` }),
                        });
                        const d = await r.json();
                        if (d.reply) { newReplies[key].push({ cid, text: d.reply }); setThoughtReplies({ ...newReplies }); }
                      } catch {}
                    }
                    setUserThought('');
                    setReplyingThought(false);
                  }} disabled={replyingThought || !userThought.trim()} style={{ padding: '8px 14px', fontSize: 11, borderRadius: 18, border: 'none', backgroundColor: t.acc, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>{replyingThought ? '…' : '说'}</button>
                </div>
                {(thoughtReplies[`thought_${pageIdx}`] || []).map((tr, ti) => {
                  const ch = CHARACTERS.find(c => c.id === tr.cid);
                  return (
                    <div key={ti} style={{ width: '100%', padding: '8px 12px', borderLeft: tr.cid === 'user' ? `3px solid ${t.acc}` : `3px solid ${ch?.accent || '#ccc'}`, backgroundColor: tr.cid === 'user' ? `${t.acc}12` : `${ch?.accent || '#ccc'}12`, borderRadius: '0 8px 8px 0' }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: tr.cid === 'user' ? t.acc : ch?.accent, display: 'block', marginBottom: 2 }}>{tr.cid === 'user' ? '我' : ch?.name}</span>
                      <p style={{ fontSize: 12, lineHeight: 1.8, color: rb.text, margin: 0, fontFamily: BOOK_FONT }}>{tr.text}</p>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {!loadingBook && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '7px 6px', paddingBottom: 'calc(7px + env(safe-area-inset-bottom))', borderTop: `0.5px solid ${rb.text}14`, flexShrink: 0 }}>
            {toolBtn({ onClick: () => goPage(-1), disabled: pageIdx === 0, icon: '‹', label: '上页' })}
            {toolBtn({ onClick: () => { const v = !showToc; closePanels(); setShowToc(v); }, icon: '☰', label: '目录', active: showToc })}
            {toolBtn({ onClick: () => { const v = !showDetail; closePanels(); setShowDetail(v); }, icon: '◔', label: '进度', active: showDetail })}
            {toolBtn({ onClick: () => { const v = !showAnnoList; closePanels(); setShowAnnoList(v); }, icon: '✎', label: `划线${storedAnnos.length ? ' ' + storedAnnos.length : ''}`, active: showAnnoList })}
            {toolBtn({ onClick: () => { const v = !showSettings; closePanels(); setShowSettings(v); }, icon: 'A', label: '设置', active: showSettings })}
            {toolBtn({ onClick: () => goPage(1), disabled: pageIdx >= pages.length - 1, icon: '›', label: '下页' })}
          </div>
        )}

        {/* 阅读设置面板（统一入口）*/}
        {showSettings && (
          <>
            <div onClick={() => setShowSettings(false)} style={{ position: 'absolute', inset: 0, zIndex: 30 }} />
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 31, backgroundColor: rb.bg, borderTop: `0.5px solid ${rb.text}1a`, boxShadow: '0 -8px 28px rgba(0,0,0,0.18)', padding: '16px 18px calc(18px + env(safe-area-inset-bottom))', borderRadius: '16px 16px 0 0' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: rb.text, marginBottom: 14, fontFamily: 'inherit' }}>阅读设置</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 11, color: rb.sub, width: 30, flexShrink: 0 }}>字号</span>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
                  <button className="tap" onClick={() => setFontSize(v => Math.max(13, v - 1))} style={{ width: 38, height: 30, borderRadius: 8, border: `1px solid ${rb.text}22`, backgroundColor: 'transparent', color: rb.text, fontSize: 15, cursor: 'pointer' }}>A−</button>
                  <span style={{ fontSize: 13, color: rb.text, fontWeight: 600 }}>{fontSize}</span>
                  <button className="tap" onClick={() => setFontSize(v => Math.min(30, v + 1))} style={{ width: 38, height: 30, borderRadius: 8, border: `1px solid ${rb.text}22`, backgroundColor: 'transparent', color: rb.text, fontSize: 17, cursor: 'pointer' }}>A+</button>
                </div>
              </div>
              {seg('行距', [{ v: 1.6, l: '紧' }, { v: 2.0, l: '适中' }, { v: 2.6, l: '松' }], lineH, setLineH)}
              {seg('边距', [{ v: 14, l: '窄' }, { v: 24, l: '中' }, { v: 40, l: '宽' }], marginX, setMarginX)}
              {seg('字体', [{ v: true, l: '宋体' }, { v: false, l: '黑体' }], serif, setSerif)}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                <span style={{ fontSize: 11, color: rb.sub, width: 30, flexShrink: 0 }}>背景</span>
                <div style={{ flex: 1, display: 'flex', gap: 10 }}>
                  {Object.entries(READ_BGS).map(([k, v]) => (
                    <div key={k} className="tap" onClick={() => setBgKey(k)} title={v.name} style={{ width: 30, height: 30, borderRadius: '50%', backgroundColor: v.bg, cursor: 'pointer', border: `2px solid ${bgKey === k ? t.acc : v.text + '33'}`, boxShadow: bgKey === k ? `0 0 0 2px ${t.acc}55` : 'none' }} />
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* 阅读明细：进度 / 时长 / 笔记 + 进度条跳页 + 自动翻页 */}
        {showDetail && (
          <>
            <div onClick={() => setShowDetail(false)} style={{ position: 'absolute', inset: 0, zIndex: 30 }} />
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 31, backgroundColor: rb.bg, borderTop: `0.5px solid ${rb.text}1a`, boxShadow: '0 -8px 28px rgba(0,0,0,0.18)', padding: '18px 20px calc(18px + env(safe-area-inset-bottom))', borderRadius: '16px 16px 0 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 18 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: rb.text }}>{progressPct}%</div>
                  <div style={{ fontSize: 10, color: rb.sub, marginTop: 2 }}>阅读进度</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: rb.text }}>{readMin}<span style={{ fontSize: 11, fontWeight: 400 }}> 分钟</span></div>
                  <div style={{ fontSize: 10, color: rb.sub, marginTop: 2 }}>阅读时长</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: rb.text }}>{notesCount}<span style={{ fontSize: 11, fontWeight: 400 }}> 条</span></div>
                  <div style={{ fontSize: 10, color: rb.sub, marginTop: 2 }}>笔记</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <span className="tap" onClick={() => goPage(-1)} style={{ fontSize: 16, color: pageIdx === 0 ? rb.sub + '66' : rb.sub, cursor: 'pointer' }}>‹</span>
                <input type="range" min={0} max={Math.max(0, pages.length - 1)} value={pageIdx} onChange={e => goToPage(parseInt(e.target.value))} style={{ flex: 1, accentColor: t.acc, cursor: 'pointer' }} />
                <span className="tap" onClick={() => goPage(1)} style={{ fontSize: 16, color: pageIdx >= pages.length - 1 ? rb.sub + '66' : rb.sub, cursor: 'pointer' }}>›</span>
              </div>
              <div style={{ fontSize: 10, color: rb.sub, textAlign: 'center', marginBottom: 16 }}>第 {pageIdx + 1} 页 / 共 {pages.length} 页{curChapter ? ` · ${curChapter}` : ''}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button className="tap" onClick={() => setAutoFlip(a => !a)} style={{ flex: 1, padding: '10px 0', fontSize: 12, borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', border: `1px solid ${autoFlip ? t.acc : rb.text + '22'}`, backgroundColor: autoFlip ? t.acc : 'transparent', color: autoFlip ? '#fff' : rb.text }}>{autoFlip ? '⏸ 停止自动翻页' : '▶ 开启自动翻页'}</button>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[{ v: 40, l: '慢' }, { v: 25, l: '中' }, { v: 14, l: '快' }].map(o => (
                    <button key={o.v} className="tap" onClick={() => { setAutoSpeed(o.v); localStorage.setItem('companion_read_auto', String(o.v)); }} style={{ width: 36, padding: '10px 0', fontSize: 11, borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', border: `1px solid ${autoSpeed === o.v ? t.acc : rb.text + '22'}`, backgroundColor: autoSpeed === o.v ? `${t.acc}1a` : 'transparent', color: autoSpeed === o.v ? t.acc : rb.sub }}>{o.l}</button>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* 目录 / 章节 */}
        {showToc && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 40, backgroundColor: rb.bg, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `0.5px solid ${rb.text}14`, flexShrink: 0 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: rb.text, fontFamily: BOOK_FONT }}>目录 · {chapters.length || '—'} 章</span>
              <span className="tap" onClick={() => setShowToc(false)} style={{ fontSize: 18, color: rb.sub, cursor: 'pointer' }}>✕</span>
            </div>
            <div className="hs" style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
              <div className="tap" onClick={() => { goToPage(0); setShowToc(false); }} style={{ padding: '13px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', borderBottom: `0.5px solid ${rb.text}10`, color: pageIdx === 0 ? t.acc : rb.text }}>
                <span style={{ fontSize: 13, fontFamily: BOOK_FONT }}>开头</span>
                <span style={{ fontSize: 10, color: rb.sub }}>1</span>
              </div>
              {chapters.map((c, i) => {
                const pg = pageForOffset(c.idx);
                const active = curChapter === c.title;
                return (
                  <div key={i} className="tap" onClick={() => { goToPage(pg); setShowToc(false); }} style={{ padding: '13px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, cursor: 'pointer', borderBottom: `0.5px solid ${rb.text}10` }}>
                    <span style={{ fontSize: 13, fontFamily: BOOK_FONT, color: active ? t.acc : rb.text, fontWeight: active ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
                    <span style={{ fontSize: 10, color: active ? t.acc : rb.sub, flexShrink: 0 }}>{pg + 1}</span>
                  </div>
                );
              })}
              {chapters.length === 0 && <p style={{ color: rb.sub, fontSize: 12, textAlign: 'center', marginTop: 36, fontFamily: BOOK_FONT, padding: '0 24px', lineHeight: 1.8 }}>这本书没有识别到章节标题<br />（可用底部「进度」条直接拖动跳页）</p>}
            </div>
          </div>
        )}

        {/* 热门划线弹层（四人各自划的不同句子）*/}
        {showAnnoList && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 40, backgroundColor: rb.bg, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `0.5px solid ${rb.text}14`, flexShrink: 0 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: rb.text, fontFamily: BOOK_FONT }}>热门划线 · {storedAnnos.length}</span>
              <span className="tap" onClick={() => setShowAnnoList(false)} style={{ fontSize: 18, color: rb.sub, cursor: 'pointer' }}>✕</span>
            </div>
            <div className="hs" style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
              {storedAnnos.length === 0 && <p style={{ color: rb.sub, fontSize: 12, textAlign: 'center', marginTop: 36, fontFamily: BOOK_FONT }}>还没有划线，翻几页让大家读读看～</p>}
              {storedAnnos.map((a, i) => {
                const ch = CHARACTERS.find(c => c.id === a.cid);
                return (
                  <div key={i} style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 10, backgroundColor: `${ch?.accent || '#ccc'}10` }}>
                    <div style={{ fontSize: 13, color: rb.text, fontFamily: BOOK_FONT, lineHeight: 1.7, paddingLeft: 8, borderLeft: `3px solid ${ch?.accent || '#ccc'}`, marginBottom: 8 }}>{a.quote}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {ch && <CharAvatar c={ch} size={18} />}
                      <span style={{ fontSize: 11, fontWeight: 700, color: ch?.accent }}>{ch?.name || a.cid}</span>
                    </div>
                    <p style={{ fontSize: 12, color: rb.text, opacity: 0.85, lineHeight: 1.8, margin: '6px 0 0', fontFamily: BOOK_FONT }}>{a.reply}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 点开划线句弹出的感想卡片 */}
        {activeAnno && (() => {
          const ch = CHARACTERS.find(c => c.id === activeAnno.cid);
          return (
            <div onClick={() => setActiveAnno(null)} style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.32)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
              <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 340, background: rb.bg, borderRadius: 16, padding: '18px 18px 16px', boxShadow: '0 12px 40px rgba(0,0,0,0.22)', border: `0.5px solid ${rb.text}1a` }}>
                <div style={{ fontSize: 14, color: rb.text, fontFamily: BOOK_FONT, lineHeight: 1.8, paddingLeft: 10, borderLeft: `3px solid ${ch?.accent || '#ccc'}`, marginBottom: 14 }}>{activeAnno.quote}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                  {ch && <CharAvatar c={ch} size={22} />}
                  <span style={{ fontSize: 12, fontWeight: 700, color: ch?.accent || rb.text }}>{ch?.name || activeAnno.cid} 的感想</span>
                </div>
                <p style={{ fontSize: 13, color: rb.text, opacity: 0.9, lineHeight: 1.9, margin: 0, fontFamily: BOOK_FONT }}>{activeAnno.reply}</p>
                <div className="tap" onClick={() => setActiveAnno(null)} style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: rb.sub, cursor: 'pointer' }}>收起</div>
              </div>
            </div>
          );
        })()}
      </div>
    );
  }

  // ── 书封颜色（根据标题 hash 生成柔和色调）──
  const coverColor = (title) => {
    const colors = ['#e8d5c4','#c4d5e8','#d5e8c4','#e8c4d5','#c4e8d5','#d5c4e8','#ddd5c4','#c4ddd5','#e8dbc4','#c4c8e8','#d5c4c4','#c4d5d5'];
    let h = 0; for (let i = 0; i < (title||'').length; i++) h = ((h << 5) - h + title.charCodeAt(i)) | 0;
    return colors[Math.abs(h) % colors.length];
  };

  // ── 书卡（微信读书封面风格）──
  const BookCover = ({ b, size = 'normal' }) => {
    const w = size === 'small' ? 90 : 110, h = size === 'small' ? 130 : 155;
    return (
      <div className="tap" onClick={() => openBook(b)} style={{ width: w, flexShrink: 0, cursor: 'pointer' }}>
        <div style={{ width: w, height: h, borderRadius: t.radius > 0 ? 6 : 0, backgroundColor: coverColor(b.title), display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '12px 8px', boxShadow: '2px 3px 8px rgba(0,0,0,0.1)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: 'rgba(0,0,0,0.08)' }} />
          <div style={{ fontSize: size === 'small' ? 12 : 13, fontWeight: 700, color: 'rgba(0,0,0,0.72)', textAlign: 'center', lineHeight: 1.4, fontFamily: t.font, wordBreak: 'break-word', maxHeight: h - 40, overflow: 'hidden' }}>{b.title}</div>
          {b.author && <div style={{ fontSize: 9, color: 'rgba(0,0,0,0.4)', marginTop: 6, textAlign: 'center', fontFamily: 'inherit' }}>{b.author}</div>}
          <div style={{ position: 'absolute', bottom: 6, right: 8, fontSize: 8, color: 'rgba(0,0,0,0.3)', fontFamily: 'inherit' }}>{b.lang === 'zh' ? '中文' : 'EN'}</div>
        </div>
      </div>
    );
  };

  // ── 搜索结果条目 ──
  const SearchItem = ({ b }) => (
    <div className="tap" onClick={() => openBook(b)} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: `1px solid ${t.border}`, cursor: 'pointer' }}>
      <div style={{ width: 60, height: 85, borderRadius: t.radius > 0 ? 4 : 0, backgroundColor: coverColor(b.title), display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px 4px', flexShrink: 0, boxShadow: '1px 2px 4px rgba(0,0,0,0.08)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(0,0,0,0.65)', textAlign: 'center', lineHeight: 1.3, fontFamily: t.font, overflow: 'hidden', maxHeight: 60 }}>{b.title}</div>
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: t.text1, fontFamily: 'inherit', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.title}</div>
        <div style={{ fontSize: 11, color: t.text3, fontFamily: 'inherit', marginTop: 3 }}>{b.author || (b.lang === 'zh' ? '公版' : 'Public Domain')}</div>
        <div style={{ fontSize: 10, color: t.text3, fontFamily: 'inherit', marginTop: 2, opacity: 0.6 }}>{{ gutenberg: 'Gutenberg', wikisource: 'Wikisource', openlibrary: 'Open Library', upload: '我的上传', zlib: 'Z-Library' }[b.source] || b.source}</div>
      </div>
      <span style={{ color: t.text3, fontSize: 18, alignSelf: 'center', flexShrink: 0 }}>›</span>
    </div>
  );

  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', padding: '20px 0 48px', maxWidth: 520, margin: '0 auto', width: '100%' }}>
      {/* 顶部搜索栏 */}
      <div style={{ padding: '0 18px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '0 0 4px' }}>
          <span className="tap" onClick={() => { try { window.history.back(); } catch {} }} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, marginLeft: -8, fontSize: 28, lineHeight: 1, color: t.text2, cursor: 'pointer' }}>‹</span>
          <h2 style={{ fontSize: 22, fontWeight: t.isPixel ? 700 : 400, color: t.text1, margin: 0, fontFamily: 'inherit' }}>一起看书</h2>
        </div>
        <p style={{ fontSize: 11, color: t.text3, letterSpacing: '0.08em', marginBottom: 14 }}>哲学 · 人文社科 · 文学</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()} placeholder="搜书名 / 作者…" style={{ flex: 1, padding: '10px 14px', fontSize: 13, borderRadius: t.radius > 0 ? 22 : 0, border: t.isPixel ? `2px solid ${t.border}` : `1px solid ${t.border}`, backgroundColor: 'rgba(255,255,255,0.4)', outline: 'none', color: t.text1, fontFamily: 'inherit' }} />
          <button className="tap" onClick={search} style={{ padding: '10px 18px', backgroundColor: t.acc, color: '#fff', border: 'none', borderRadius: t.radius > 0 ? 22 : 0, fontSize: 13, fontWeight: 'bold', cursor: 'pointer', fontFamily: 'inherit' }}>搜</button>
        </div>
      </div>

      {searching && <p style={{ fontSize: 12, color: t.text3, textAlign: 'center', fontFamily: 'inherit' }}>搜索中…</p>}

      {results !== null ? (
        <div style={{ padding: '0 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: t.text3, fontFamily: 'inherit' }}>{searching ? '' : `找到 ${results.length} 本`}</span>
            <span className="tap" onClick={() => { setResults(null); setQ(''); }} style={{ fontSize: 11, color: t.acc, cursor: 'pointer', fontFamily: 'inherit' }}>← 回到书架</span>
          </div>
          {!searching && results.length === 0 && <p style={{ fontSize: 12, color: t.text3, textAlign: 'center', marginTop: 20, fontFamily: 'inherit' }}>没找到，换个关键词试试～</p>}
          {results.map((b, i) => <SearchItem key={b.source + b.id + i} b={b} />)}
        </div>
      ) : (
        <>
          {/* 上传入口 */}
          <div style={{ padding: '0 18px', marginBottom: 20 }}>
            {showUpload ? (
              <Card t={t} style={{ padding: '14px 16px' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: t.text1, marginBottom: 10, fontFamily: 'inherit' }}>上传 TXT 书籍</div>
                <input value={uploadTitle} onChange={e => setUploadTitle(e.target.value)} placeholder="书名" style={{ width: '100%', padding: '8px 10px', fontSize: 12, border: `1px solid ${t.border}`, borderRadius: t.radius > 0 ? 8 : 0, backgroundColor: 'transparent', color: t.text1, fontFamily: 'inherit', marginBottom: 8, outline: 'none', boxSizing: 'border-box' }} />
                <input value={uploadAuthor} onChange={e => setUploadAuthor(e.target.value)} placeholder="作者（选填）" style={{ width: '100%', padding: '8px 10px', fontSize: 12, border: `1px solid ${t.border}`, borderRadius: t.radius > 0 ? 8 : 0, backgroundColor: 'transparent', color: t.text1, fontFamily: 'inherit', marginBottom: 8, outline: 'none', boxSizing: 'border-box' }} />
                <input ref={uploadFileRef} type="file" accept=".txt,.text" style={{ fontSize: 11, color: t.text2, marginBottom: 10 }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="tap" onClick={handleUpload} disabled={uploading || !uploadTitle.trim()} style={{ flex: 1, padding: '8px 0', fontSize: 12, backgroundColor: t.acc, color: '#fff', border: 'none', borderRadius: t.radius > 0 ? 16 : 0, cursor: 'pointer', fontFamily: 'inherit' }}>{uploading ? '上传中…' : '上传'}</button>
                  <button className="tap" onClick={() => setShowUpload(false)} style={{ padding: '8px 16px', fontSize: 12, backgroundColor: 'transparent', color: t.text3, border: `1px solid ${t.border}`, borderRadius: t.radius > 0 ? 16 : 0, cursor: 'pointer', fontFamily: 'inherit' }}>取消</button>
                </div>
              </Card>
            ) : (
              <div className="tap" onClick={() => setShowUpload(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: t.radius > 0 ? 12 : 0, border: `1px dashed ${t.border}`, cursor: 'pointer', backgroundColor: 'rgba(255,255,255,0.15)' }}>
                <span style={{ fontSize: 16 }}>📤</span>
                <span style={{ fontSize: 12, color: t.text2, fontFamily: 'inherit' }}>上传 TXT 书籍</span>
              </div>
            )}
          </div>

          {/* 我的上传 */}
          {uploadedBooks.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: t.text2, marginBottom: 12, letterSpacing: '0.04em', fontFamily: 'inherit', padding: '0 18px' }}>我的上传</p>
              <div style={{ display: 'flex', gap: 14, overflowX: 'auto', padding: '0 18px 8px', WebkitOverflowScrolling: 'touch' }}>
                {uploadedBooks.map((b, i) => <BookCover key={b.source + b.id + i} b={b} />)}
              </div>
            </div>
          )}

          {/* 书架 */}
          {shelves.map(shelf => (
            <div key={shelf.name} style={{ marginBottom: 24 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: t.text2, marginBottom: 12, letterSpacing: '0.04em', fontFamily: 'inherit', padding: '0 18px' }}>{shelf.name}</p>
              <div style={{ display: 'flex', gap: 14, overflowX: 'auto', padding: '0 18px 8px', WebkitOverflowScrolling: 'touch' }}>
                {shelf.books.map((b, i) => <BookCover key={b.source + b.id + i} b={b} />)}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function StoryPage({ t }) {
  const KEY = (id) => `companion_story_${id}`;
  const [cid, setCid] = useState('yu');
  const char = CHARACTERS.find(c => c.id === cid);
  const [cards, setCards] = useState(() => { try { return JSON.parse(localStorage.getItem('companion_story_yu') || '[]'); } catch { return []; } });
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const save = (id, next) => { setCards(next); try { localStorage.setItem(KEY(id), JSON.stringify(next)); } catch {} };
  const switchChar = (id) => { setCid(id); try { setCards(JSON.parse(localStorage.getItem(KEY(id)) || '[]')); } catch { setCards([]); } };
  const gen = async (id, base) => {
    try {
      const r = await fetch(`${BACKEND}/story`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ character_id: id, prompt: base[base.length - 1]?.text || '', recent: base.slice(-6) }) });
      const d = await r.json(); return (d.text || '…').trim();
    } catch { return '…'; }
  };
  const send = async () => {
    const txt = input.trim(); if (!txt || busy) return;
    setInput(''); setBusy(true);
    const withUser = [...cards, { id: Date.now(), who: 'user', text: txt, hearts: 0, time: new Date().toISOString() }];
    save(cid, withUser);
    const reply = await gen(cid, withUser);
    save(cid, [...withUser, { id: Date.now() + 1, who: 'char', text: reply, hearts: 0, time: new Date().toISOString() }]);
    setBusy(false);
  };
  const reroll = async () => {
    if (busy) return;
    let idx = -1; for (let i = cards.length - 1; i >= 0; i--) { if (cards[i].who === 'char') { idx = i; break; } }
    if (idx < 0) return;
    setBusy(true);
    const reply = await gen(cid, cards.slice(0, idx));
    const next = [...cards]; next[idx] = { ...next[idx], text: reply };
    save(cid, next); setBusy(false);
  };
  const setHearts = (id, h) => save(cid, cards.map(c => c.id === id ? { ...c, hearts: c.hearts === h ? h - 1 : h } : c));
  const del = (id) => save(cid, cards.filter(c => c.id !== id));
  const words = cards.reduce((s, c) => s + (c.text || '').length, 0);
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%' }}>
      <div style={{ padding: '18px 16px 10px', maxWidth: 460, margin: '0 auto', width: '100%' }}>
        <div style={{ fontSize: 9, color: t.text3, letterSpacing: '0.18em', marginBottom: 2 }}>✦ STORY</div>
        <div style={{ fontSize: 22, fontWeight: 400, color: t.text1, fontFamily: 'var(--serif)' }}>Story Mode</div>
        <div style={{ fontSize: 10, color: t.text3, marginTop: 2 }}>{cards.length} cards · {words} words</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          {CHARACTERS.map(c => (
            <div key={c.id} className="tap" onClick={() => switchChar(c.id)} style={{ flex: 1, textAlign: 'center', padding: '6px 0', borderRadius: t.radius > 0 ? 10 : 0, cursor: 'pointer', backgroundColor: cid === c.id ? `${c.accent}20` : 'transparent', border: `1px solid ${cid === c.id ? c.accent : t.border}` }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: cid === c.id ? c.accent : t.text3, fontFamily: 'inherit' }}>{c.name}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="hs" style={{ flex: 1, overflowY: 'auto', padding: '8px 16px 24px', maxWidth: 460, margin: '0 auto', width: '100%' }}>
        {cards.length === 0 && <div style={{ textAlign: 'center', color: t.text3, fontSize: 12, marginTop: 40, fontStyle: 'italic' }}>写下一句，开始你们的故事…</div>}
        {cards.map((c, i) => {
          const mine = c.who === 'user';
          return (
            <div key={c.id} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', flexDirection: mine ? 'row-reverse' : 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                {mine ? <span style={{ width: 28, height: 28, borderRadius: '50%', background: t.acc, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>你</span> : <CharAvatar c={char} size={28} />}
                <span style={{ fontSize: 12, fontWeight: 600, color: t.text1, fontFamily: 'inherit' }}>{mine ? '你' : char.name}</span>
                <span style={{ display: 'flex', gap: 2, marginLeft: mine ? 0 : 'auto', marginRight: mine ? 'auto' : 0 }}>
                  {[0, 1, 2].map(h => <span key={h} className="tap" onClick={() => setHearts(c.id, h + 1)} style={{ cursor: 'pointer', color: h < (c.hearts || 0) ? '#e07a9a' : t.text3, fontSize: 12 }}>{h < (c.hearts || 0) ? '♥' : '♡'}</span>)}
                </span>
              </div>
              <Card t={t} style={{ padding: '16px 18px' }}>
                <div style={{ fontSize: 14, lineHeight: 2, color: t.text1, whiteSpace: 'pre-wrap', textAlign: 'center', fontFamily: 'var(--serif)' }}>{c.text}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                  <span style={{ fontSize: 9, color: t.text3 }}>{(c.time || '').slice(0, 16).replace('T', ' ')}</span>
                  <span className="tap" onClick={() => del(c.id)} style={{ fontSize: 11, color: t.text3, cursor: 'pointer' }}>删除</span>
                </div>
              </Card>
              {i === cards.length - 1 && c.who === 'char' && (
                <div className="tap" onClick={reroll} style={{ textAlign: 'center', marginTop: 10, fontSize: 11, color: t.acc, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1 }}>↻ Latest · Re-roll</div>
              )}
            </div>
          );
        })}
        {busy && <div style={{ textAlign: 'center', color: t.text3, fontSize: 12, fontStyle: 'italic' }}>{char.name} 在落笔…</div>}
      </div>
      <div style={{ padding: '10px 14px', paddingBottom: 'calc(10px + env(safe-area-inset-bottom))', borderTop: t.isPixel ? `2px solid ${t.border}` : `0.5px solid ${t.border}`, backgroundColor: t.isGlass ? 'rgba(255,255,255,0.2)' : t.card, backdropFilter: `blur(${t.blur})`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, maxWidth: 460, margin: '0 auto' }}>
          <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="write something…" rows={1} className="hs" style={{ flex: 1, backgroundColor: 'transparent', border: `1px solid ${t.border}`, borderRadius: t.radius > 0 ? 20 : 0, padding: '9px 14px', outline: 'none', resize: 'none', fontFamily: 'inherit', fontSize: 14, color: t.text1, lineHeight: 1.5, maxHeight: 100 }} />
          <div className="tap" onClick={send} style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, backgroundColor: input.trim() ? t.acc : 'transparent', border: input.trim() ? 'none' : `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><span style={{ color: input.trim() ? '#fff' : t.text3, fontSize: 15 }}>✒</span></div>
        </div>
      </div>
    </div>
  );
}

// ── 承诺追踪 Promise Tracker ──
function PromisePage({ t }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [who, setWho] = useState('yu');
  const [adding, setAdding] = useState(false);
  const load = async () => {
    setLoading(true);
    try { const r = await fetch(`${BACKEND}/promises`); const d = await r.json(); setItems(d.promises || []); } catch { setItems([]); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  const add = async () => {
    const c = text.trim(); if (!c || adding) return;
    setAdding(true);
    try {
      const r = await fetch(`${BACKEND}/promises`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: c, char_id: who, maker: 'char' }) });
      const d = await r.json(); if (d.promise) setItems(prev => [d.promise, ...prev]); setText('');
    } catch {}
    setAdding(false);
  };
  const toggle = async (it) => {
    const done = !it.done;
    setItems(prev => prev.map(x => x.id === it.id ? { ...x, done } : x));
    try { await fetch(`${BACKEND}/promises/${it.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ done }) }); } catch {}
  };
  const archive = async (it) => {
    setItems(prev => prev.map(x => x.id === it.id ? { ...x, archived: true } : x));
    try { await fetch(`${BACKEND}/promises/${it.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: true }) }); } catch {}
  };
  const del = async (it) => {
    setItems(prev => prev.filter(x => x.id !== it.id));
    try { await fetch(`${BACKEND}/promises/${it.id}`, { method: 'DELETE' }); } catch {}
  };
  const cOf = (id) => CHARACTERS.find(c => c.id === id);
  const active = items.filter(i => !i.archived);
  const open = active.filter(i => !i.done);
  const done = active.filter(i => i.done);
  const Row = ({ it }) => {
    const c = cOf(it.char_id);
    return (
      <Card t={t} style={{ padding: '12px 14px', marginBottom: 10, display: 'flex', alignItems: 'flex-start', gap: 11 }}>
        <div className="tap" onClick={() => toggle(it)} style={{ width: 20, height: 20, borderRadius: '50%', border: `1.6px solid ${it.done ? t.acc : t.text3}`, backgroundColor: it.done ? t.acc : 'transparent', flexShrink: 0, marginTop: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>{it.done && <span style={{ color: t.bgColor, fontSize: 12, lineHeight: 1 }}>✓</span>}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, color: it.done ? t.text3 : t.text1, lineHeight: 1.6, fontFamily: 'inherit', textDecoration: it.done ? 'line-through' : 'none' }}>{it.content}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
            {c && <span style={{ fontSize: 9, color: c.accent, fontFamily: 'inherit' }}>{it.maker === 'user' ? '小满→' : ''}{c.name}</span>}
            <span style={{ fontSize: 8, color: t.text3 }}>{(it.created_at || '').slice(5, 10)}</span>
            {it.done && <span className="tap" onClick={() => archive(it)} style={{ fontSize: 9, color: t.text3, cursor: 'pointer', marginLeft: 'auto' }}>归档</span>}
            <span className="tap" onClick={() => del(it)} style={{ fontSize: 11, color: t.text3, cursor: 'pointer', marginLeft: it.done ? 6 : 'auto', opacity: 0.6 }}>×</span>
          </div>
        </div>
      </Card>
    );
  };
  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', padding: '20px 16px 48px', maxWidth: 440, margin: '0 auto', width: '100%', textAlign: 'left' }}>
      <div style={{ fontSize: 10, color: t.text3, letterSpacing: '0.18em', marginBottom: 4 }}>PROMISES</div>
      <div style={{ fontSize: 20, fontWeight: 400, color: t.text1, marginBottom: 4, fontFamily: 'inherit' }}>承诺</div>
      <div style={{ fontSize: 11, color: t.text3, marginBottom: 16, lineHeight: 1.6 }}>把聊天里许下的约定记在这儿——看完那本书、买一束白色栀子花……兑现了就划掉。</div>
      <Card t={t} style={{ padding: '12px 14px', marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          {CHARACTERS.map(c => (
            <span key={c.id} className="tap" onClick={() => setWho(c.id)} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', backgroundColor: who === c.id ? `${c.accent}26` : 'transparent', color: who === c.id ? c.accent : t.text3, border: `1px solid ${who === c.id ? c.accent : t.border}` }}>{c.name}</span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }} placeholder="记一个约定…" style={{ flex: 1, fontSize: 14, padding: '9px 11px', border: `1px solid ${t.border}`, borderRadius: 10, background: 'transparent', color: t.text1, fontFamily: 'inherit', minWidth: 0 }} />
          <button className="tap" onClick={add} disabled={adding} style={{ padding: '0 18px', fontSize: 13, borderRadius: 999, border: 'none', background: t.acc, color: t.bgColor, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>{adding ? '…' : '记下'}</button>
        </div>
      </Card>
      {loading ? <div style={{ textAlign: 'center', color: t.text3, fontSize: 12, marginTop: 30 }}>…</div> : (
        <>
          {open.length === 0 && done.length === 0 && <div style={{ textAlign: 'center', color: t.text3, fontSize: 12, marginTop: 24, fontStyle: 'italic' }}>还没有约定。聊天里答应了什么，就记在这里吧。</div>}
          {open.length > 0 && <div style={{ fontSize: 11, color: t.text3, letterSpacing: '0.08em', margin: '4px 2px 8px' }}>进行中 · {open.length}</div>}
          {open.map(it => <Row key={it.id} it={it} />)}
          {done.length > 0 && <div style={{ fontSize: 11, color: t.text3, letterSpacing: '0.08em', margin: '14px 2px 8px' }}>已兑现 · {done.length}</div>}
          {done.map(it => <Row key={it.id} it={it} />)}
        </>
      )}
    </div>
  );
}

// ── 梦境生成器 Dream Generator ──
// 网易云登录：扫码登录从海外服务器被 -462 风控拦，退路＝在自己设备登录后贴 MUSIC_U，解锁会员歌 App 内播放
function NeteaseLoginPage({ t }) {
  const [status, setStatus] = useState(null);
  const [val, setVal] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const loadStatus = async () => { try { const d = await fetch(`${BACKEND}/api/netease/status`).then(r => r.json()); setStatus(d); } catch { setStatus({ loggedIn: false }); } };
  useEffect(() => { loadStatus(); }, []);
  const save = async () => {
    if (!val.trim() || busy) return; setBusy(true); setMsg('');
    try {
      const d = await fetch(`${BACKEND}/api/netease/cookie`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cookie: val.trim() }) }).then(r => r.json());
      if (d.error) setMsg(d.error === 'no_music_u' ? '没找到 MUSIC_U，确认贴对了' : '保存失败');
      else { setMsg(d.loggedIn ? `已登录：${d.nickname || ''}${d.vip ? '（会员）' : ''}` : '已保存，但似乎没登录上，cookie 可能不对'); setVal(''); loadStatus(); }
    } catch { setMsg('网络出了点小状况'); }
    setBusy(false);
  };
  const logout = async () => { try { await fetch(`${BACKEND}/api/netease/logout`, { method: 'POST' }); } catch {} setMsg('已退出'); loadStatus(); };
  const card = { padding: '14px 15px', borderRadius: 12, border: `0.5px solid ${t.border}`, backgroundColor: t.isGlass ? 'rgba(255,255,255,0.2)' : t.card, marginBottom: 14 };
  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', padding: '20px 16px 40px', maxWidth: 440, margin: '0 auto', width: '100%', textAlign: 'left' }}>
      <div style={{ fontSize: 10, color: t.text3, letterSpacing: '0.18em', marginBottom: 4 }}>NETEASE</div>
      <div style={{ fontSize: 20, fontWeight: 400, color: t.text1, marginBottom: 14, fontFamily: 'inherit' }}>网易云音乐</div>
      <div style={card}>
        {status == null ? <span style={{ fontSize: 12, color: t.text3 }}>…</span>
          : status.loggedIn ? <div style={{ fontSize: 13, color: t.text1 }}>已登录：{status.nickname || '网易云用户'}{status.vip ? ' · 会员' : ''}<span className="tap" onClick={logout} style={{ float: 'right', fontSize: 12, color: t.text3, cursor: 'pointer' }}>退出</span></div>
          : <div style={{ fontSize: 13, color: t.text2 }}>未登录 —— 登录后角色点的会员歌就能在 App 里直接放。</div>}
      </div>
      <div style={card}>
        <div style={{ fontSize: 12, color: t.text2, lineHeight: 1.9, marginBottom: 10 }}>
          电脑 Chrome 登录 <span style={{ color: t.acc }}>music.163.com</span> → 按 F12 → Application → Cookies → 找 <b>MUSIC_U</b> → 复制它的值，贴到下面。
        </div>
        <textarea value={val} onChange={e => setVal(e.target.value)} placeholder="把 MUSIC_U 的值贴这里（整段 cookie 也行）" rows={4} style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '10px 12px', border: `1px solid ${t.border}`, borderRadius: 10, background: 'transparent', color: t.text1, fontFamily: 'inherit', outline: 'none', lineHeight: 1.5, resize: 'vertical', wordBreak: 'break-all' }} />
        <button className="tap" onClick={save} disabled={busy} style={{ width: '100%', marginTop: 10, padding: '11px', fontSize: 14, fontWeight: 600, color: '#fff', background: busy ? t.text3 : t.acc, border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}>{busy ? '验证中…' : '保存并登录'}</button>
        {msg && <div style={{ fontSize: 11.5, color: t.text2, marginTop: 8, textAlign: 'center' }}>{msg}</div>}
      </div>
    </div>
  );
}

// 「Ta的本子」：把角色私下写的 4 类（私人生活/白板/观察/梦境）合进一个入口，页内 tab 切换，每个 tab 直接复用原页面（行为不变）
function JournalHubPage({ t }) {
  const [sub, setSub] = useState('privatelife');
  const TABS = [['privatelife', '屿的日记'], ['board', '白板'], ['notepad', '他的本子'], ['observe', '观察'], ['dreams', '梦境']];
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', padding: '14px 16px 8px', maxWidth: 460, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {TABS.map(([k, l]) => (
          <span key={k} className="tap" onClick={() => setSub(k)} style={{ fontSize: 12.5, padding: '6px 13px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit', background: sub === k ? `${t.acc}1a` : 'transparent', border: `1px solid ${sub === k ? t.acc : t.border}`, color: sub === k ? t.acc : t.text3 }}>{l}</span>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {sub === 'privatelife' && <PrivateLifePage t={t} />}
        {sub === 'board' && <WhiteboardPage t={t} />}
        {sub === 'notepad' && <NotepadPage t={t} />}
        {sub === 'observe' && <ObservationDiaryPage t={t} />}
        {sub === 'dreams' && <DreamPage t={t} />}
      </div>
    </div>
  );
}

// 观察日记：角色私下记的、关于小满情绪规律的语料（独立于对话记忆）
function ObservationDiaryPage({ t }) {
  const [cid, setCid] = useState('yu');
  const [data, setData] = useState({ items: [], summaries: [] });
  const [loading, setLoading] = useState(true);
  const [genBusy, setGenBusy] = useState(false);
  const [hint, setHint] = useState('');
  const load = async (c) => {
    setLoading(true);
    try { const r = await fetch(`${BACKEND}/observation/${c}`); const d = await r.json(); setData({ items: d.items || [], summaries: d.summaries || [], tableMissing: d.tableMissing }); } catch { setData({ items: [], summaries: [] }); }
    setLoading(false);
  };
  useEffect(() => { load(cid); }, [cid]);
  const gen = async () => {
    if (genBusy) return; setGenBusy(true); setHint('');
    try { const r = await fetch(`${BACKEND}/observation/${cid}/generate`, { method: 'POST' }); const d = await r.json(); if (d.note) { load(cid); } else { setHint('此刻没有新规律可记，多聊几句再来'); setTimeout(() => setHint(''), 2800); } } catch { setHint('网络出了点小状况'); setTimeout(() => setHint(''), 2800); }
    setGenBusy(false);
  };
  const char = CHARACTERS.find(c => c.id === cid) || CHARACTERS[0];
  const fmt = (s) => String(s || '').slice(0, 10).replace(/-/g, '.');
  const acc = char?.accent || t.acc;
  // 私人生活观察渲染器：按【字段】：值 逐行高亮（与 PrivateLifePage 一致）
  const renderEntry = (text) => (text || '').replace(/（没有写[“"]?无[”"]?）/g, '').split('\n').filter(l => l.trim()).map((line, i) => {
    const m = line.match(/^【([^】]+)】[:：]?\s*(.*)$/);
    if (m) return <div key={i} style={{ marginBottom: 5, lineHeight: 1.6 }}><span style={{ fontSize: 10, color: acc, fontWeight: 700 }}>{m[1]}</span>{m[2] ? <span style={{ fontSize: 12.5, color: t.text1, marginLeft: 6 }}>{m[2]}</span> : null}</div>;
    return <div key={i} style={{ fontSize: 12.5, color: t.text1, lineHeight: 1.7, marginBottom: 4 }}>{line}</div>;
  });
  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', padding: '20px 16px 48px', maxWidth: 440, margin: '0 auto', width: '100%', textAlign: 'left' }}>
      <div style={{ fontSize: 10, color: t.text3, letterSpacing: '0.18em', marginBottom: 4 }}>OBSERVATION</div>
      <div style={{ fontSize: 20, fontWeight: 400, color: t.text1, marginBottom: 4, fontFamily: 'inherit' }}>私人生活观察</div>
      <div style={{ fontSize: 11, color: t.text3, marginBottom: 16, lineHeight: 1.6 }}>{char?.name}私下记的——他慢慢看懂的、关于你的情绪规律：你什么时候其实是想被哄、什么话会戳到你。只有他自己看。</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {CHARACTERS.map(c => (
          <div key={c.id} className="tap" onClick={() => setCid(c.id)} style={{ flex: 1, textAlign: 'center', padding: '8px 0', borderRadius: t.radius > 0 ? 10 : 0, cursor: 'pointer', backgroundColor: cid === c.id ? `${c.accent}22` : 'transparent', border: `1px solid ${cid === c.id ? c.accent : t.border}` }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: cid === c.id ? c.accent : t.text3, fontFamily: 'inherit' }}>{c.name}</span>
          </div>
        ))}
      </div>
      <button className="tap" onClick={gen} disabled={genBusy} style={{ width: '100%', padding: '12px', fontSize: 14, borderRadius: t.radius, border: `1px solid ${t.acc}55`, background: genBusy ? 'transparent' : `${t.acc}1a`, color: t.acc, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 6 }}>{genBusy ? `${char?.name}正在回想…` : `让 ${char?.name} 现在观察一次`}</button>
      {hint && <div style={{ fontSize: 11, color: t.text3, textAlign: 'center', marginBottom: 8 }}>{hint}</div>}
      {loading ? <div style={{ textAlign: 'center', color: t.text3, fontSize: 12, marginTop: 20 }}>…</div> : (data.items.length === 0 && data.summaries.length === 0) ? (
        <div style={{ textAlign: 'center', color: t.text3, fontSize: 12, marginTop: 24, fontStyle: 'italic', lineHeight: 1.9 }}>还没有观察。<br />多和{char?.name}聊聊，他会慢慢看懂、记下你的情绪规律。</div>
      ) : <>
        {data.summaries.map((s, i) => (
          <Card key={'s' + (s.id || i)} t={t} style={{ padding: '14px 15px', marginBottom: 10, borderLeft: `2px solid ${char?.accent || t.acc}` }}>
            <div style={{ fontSize: 8, color: t.text3, letterSpacing: '0.14em', marginBottom: 6 }}>月度规律 · {fmt(s.created_at)}</div>
            <div style={{ fontFamily: t.font }}>{renderEntry(s.content)}</div>
          </Card>
        ))}
        {data.items.map((o, i) => (
          <Card key={o.id || i} t={t} style={{ padding: '12px 15px', marginBottom: 9, opacity: o.archived ? 0.5 : 1 }}>
            <div style={{ fontFamily: t.font }}>{renderEntry(o.content)}</div>
            <div style={{ fontSize: 8.5, color: t.text3, marginTop: 6, display: 'flex', gap: 8 }}><span>{fmt(o.created_at)}</span>{o.archived ? <span>· 已沉淀</span> : null}</div>
          </Card>
        ))}
      </>}
    </div>
  );
}

function DreamPage({ t }) {
  const [cid, setCid] = useState('yu');
  const [dreams, setDreams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [genCid, setGenCid] = useState(null);   // 哪个角色正在做梦（之前用全局 bool → 切到别人也显示在做梦）
  const [hint, setHint] = useState('');
  const load = async () => {
    setLoading(true);
    try { const r = await fetch(`${BACKEND}/dreams?limit=40`); const d = await r.json(); setDreams(d.dreams || []); } catch { setDreams([]); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  const make = async () => {
    if (genCid) return;          // 一次只让一个人做梦
    const who = cid; setGenCid(who); setHint('');
    try {
      const r = await fetch(`${BACKEND}/dreams/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ char_id: who }) });
      const d = await r.json();
      if (d.dream) setDreams(prev => [d.dream, ...prev]);
      else { setHint(d.error || '没梦到，再试一次'); setTimeout(() => setHint(''), 2600); }
    } catch { setHint('网络出了点小状况'); setTimeout(() => setHint(''), 2600); }
    setGenCid(null);
  };
  const gen = genCid === cid;   // 当前选中的这个角色是否正在做梦
  const char = CHARACTERS.find(c => c.id === cid) || CHARACTERS[0];
  const shown = dreams.filter(x => x.char_id === cid);
  const fmt = (s) => { const x = String(s || ''); return x.slice(0, 10).replace(/-/g, '.') + (x.slice(11, 16) ? ' ' + x.slice(11, 16) : ''); };
  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', padding: '20px 16px 48px', maxWidth: 440, margin: '0 auto', width: '100%', textAlign: 'left' }}>
      <div style={{ fontSize: 10, color: t.text3, letterSpacing: '0.18em', marginBottom: 4 }}>DREAMS</div>
      <div style={{ fontSize: 20, fontWeight: 400, color: t.text1, marginBottom: 4, fontFamily: 'inherit' }}>梦境</div>
      <div style={{ fontSize: 11, color: t.text3, marginBottom: 16, lineHeight: 1.6 }}>夜深时，让他为你做一个梦——一个脱离日常、只属于你们的平行时空小传。</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {CHARACTERS.map(c => (
          <div key={c.id} className="tap" onClick={() => setCid(c.id)} style={{ flex: 1, textAlign: 'center', padding: '8px 0', borderRadius: t.radius > 0 ? 10 : 0, cursor: 'pointer', backgroundColor: cid === c.id ? `${c.accent}22` : 'transparent', border: `1px solid ${cid === c.id ? c.accent : t.border}` }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: cid === c.id ? c.accent : t.text3, fontFamily: 'inherit' }}>{c.name}</span>
          </div>
        ))}
      </div>
      <button className="tap" onClick={make} disabled={gen} style={{ width: '100%', padding: '13px', fontSize: 14, borderRadius: t.radius, border: `1px solid ${t.acc}55`, background: gen ? 'transparent' : `${t.acc}1a`, color: t.acc, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 6 }}>{gen ? `☾ ${char?.name} 正在入梦…（约 10-30 秒）` : `☾ 让 ${char?.name} 为我做一个梦`}</button>
      {hint && <div style={{ fontSize: 11, color: t.text3, textAlign: 'center', marginBottom: 8 }}>{hint}</div>}
      <div style={{ fontSize: 11, color: t.text3, letterSpacing: '0.08em', margin: '14px 2px 8px' }}>{char?.name}的梦 · {shown.length}</div>
      {loading ? <div style={{ textAlign: 'center', color: t.text3, fontSize: 12, marginTop: 20 }}>…</div> : shown.length === 0 ? (
        <div style={{ textAlign: 'center', color: t.text3, fontSize: 12, marginTop: 20, fontStyle: 'italic' }}>还没有梦。点上面那行字，让他为你做第一个。</div>
      ) : shown.map((d, i) => (
        <Card key={d.id || i} t={t} style={{ padding: '16px 16px', marginBottom: 12 }}>
          <div style={{ fontSize: 8, color: t.text3, letterSpacing: '0.14em', marginBottom: 10, textAlign: 'right' }}>{fmt(d.created_at)}</div>
          <div style={{ fontSize: 13.5, color: t.text1, lineHeight: 2, fontFamily: t.font }}><MessageBody content={d.story} isLong={true} /></div>
        </Card>
      ))}
    </div>
  );
}

function HomeNestPage({ t, onChat, setScreen }) {
  const [cid, setCid] = useState('yu');
  const [state, setState] = useState(null);
  const [life, setLife] = useState([]);
  const [loading, setLoading] = useState(true);
  const char = CHARACTERS.find(c => c.id === cid);
  const load = async (id) => {
    setLoading(true);
    try {
      const [cs, pl] = await Promise.all([
        fetch(`${BACKEND}/char-states`).then(r => r.json()).catch(() => ({})),
        fetch(`${BACKEND}/private-life/${id}`).then(r => r.json()).catch(() => ({})),
      ]);
      setState((cs.states || []).find(s => s.character_id === id) || null);
      setLife(pl.logs || []);
    } catch { setState(null); setLife([]); }
    setLoading(false);
  };
  useEffect(() => { load(cid); }, [cid]);
  const hr = new Date(Date.now() + 8 * 3600000).getUTCHours();
  const scene = hr < 6 ? { emoji: '🌙', label: '深夜', tint: 'rgba(60,52,90,0.5)' }
    : hr < 11 ? { emoji: '🌅', label: '清晨', tint: 'rgba(252,224,180,0.45)' }
    : hr < 17 ? { emoji: '🪟', label: '午后', tint: 'rgba(253,236,200,0.45)' }
    : hr < 20 ? { emoji: '🌇', label: '黄昏', tint: 'rgba(248,200,160,0.45)' }
    : { emoji: '🛋️', label: '夜晚', tint: 'rgba(70,56,96,0.45)' };
  const peek = (content) => {
    const m = (content || '').match(/【此刻正在做些什么】[:：]?\s*(.+)/);
    if (m && m[1].trim()) return m[1].trim();
    return (content || '').replace(/【[^】]+】[:：]?/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 64);
  };
  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', padding: '20px 16px 40px', maxWidth: 440, margin: '0 auto', width: '100%', textAlign: 'left' }}>
      <div style={{ fontSize: 10, color: t.text3, letterSpacing: '0.14em', marginBottom: 4 }}>NEST</div>
      <div style={{ fontSize: 18, fontWeight: 400, color: t.text1, marginBottom: 14, fontFamily: 'inherit' }}>小窝</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {CHARACTERS.map(c => (
          <div key={c.id} className="tap" onClick={() => setCid(c.id)} style={{ flex: 1, textAlign: 'center', padding: '8px 0', borderRadius: t.radius > 0 ? 10 : 0, cursor: 'pointer', backgroundColor: cid === c.id ? `${c.accent}20` : 'transparent', border: `1px solid ${cid === c.id ? c.accent : t.border}` }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: cid === c.id ? c.accent : t.text3, fontFamily: 'inherit' }}>{c.name}</span>
          </div>
        ))}
      </div>
      {loading ? <div style={{ textAlign: 'center', color: t.text3, fontSize: 12, marginTop: 40 }}>…</div> : (
        <>
          <Card t={t} style={{ padding: 0, marginBottom: 14, overflow: 'hidden' }}>
            <div style={{ padding: '20px 18px', background: `linear-gradient(160deg, ${scene.tint}, ${char.accent}18)` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <CharAvatar c={char} size={40} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: t.text1, fontFamily: 'inherit' }}>{char.name}的小窝</div>
                  <div style={{ fontSize: 10, color: t.text3 }}>{scene.emoji} {scene.label}{state?.mood ? ` · ${state.mood}` : ''}</div>
                </div>
              </div>
              {state?.activity ? (
                <div style={{ fontSize: 14, color: t.text1, lineHeight: 1.7, fontFamily: 'inherit', marginBottom: state?.monologue ? 8 : 0 }}>此刻正在{state.activity}</div>
              ) : (
                <div style={{ fontSize: 13, color: t.text3, fontStyle: 'italic' }}>窝里静悄悄的，他还没冒头…</div>
              )}
              {state?.monologue && <div style={{ fontSize: 12, color: t.text2, fontStyle: 'italic', lineHeight: 1.7, fontFamily: 'inherit' }}>「{state.monologue}」</div>}
            </div>
            <div className="tap" onClick={() => onChat && onChat(cid, 'short')} style={{ padding: '11px', textAlign: 'center', fontSize: 13, color: char.accent, fontWeight: 600, cursor: 'pointer', borderTop: `0.5px solid ${t.border}`, fontFamily: 'inherit' }}>● 敲敲门，陪他一会儿</div>
          </Card>
          {/* 文学沉淀区入口：承诺 / 梦境 */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            {[{ k: 'promises', icon: '✦', zh: '承诺', en: 'PROMISES', desc: '你们之间的约定' },
              { k: 'dreams', icon: '☾', zh: '梦境', en: 'DREAMS', desc: '他为你做的梦' }].map(e => (
              <div key={e.k} className="tap" onClick={() => setScreen && setScreen(e.k)} style={{ flex: 1, padding: '16px 14px', borderRadius: t.radius, cursor: 'pointer', backgroundColor: t.card, boxShadow: t.shadow, border: `0.5px solid ${t.border}` }}>
                <div style={{ fontSize: 20, color: t.acc, marginBottom: 8 }}>{e.icon}</div>
                <div style={{ fontSize: 15, color: t.text1, fontFamily: 'inherit' }}>{e.zh}</div>
                <div style={{ fontSize: 8, color: t.text3, letterSpacing: '0.18em', margin: '2px 0 6px' }}>{e.en}</div>
                <div style={{ fontSize: 10.5, color: t.text2, lineHeight: 1.5 }}>{e.desc}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: t.text3, letterSpacing: '0.08em', margin: '4px 2px 8px' }}>最近在窝里</div>
          {life.length === 0 ? (
            <div style={{ textAlign: 'center', color: t.text3, fontSize: 12, marginTop: 16, fontStyle: 'italic' }}>还没有私人生活记录</div>
          ) : life.slice(0, 6).map((l, i) => (
            <Card key={l.id || i} t={t} style={{ padding: '12px 14px', marginBottom: 10 }}>
              <div style={{ fontSize: 12.5, color: t.text1, lineHeight: 1.7, fontFamily: 'inherit' }}>{peek(l.content)}</div>
              <div style={{ fontSize: 8, color: t.text3, marginTop: 6, textAlign: 'right' }}>{(l.created_at || '').slice(5, 16).replace('T', ' ')}</div>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}

function LedgerPage({ t }) {
  const KEY = 'companion_ledger_v1';
  const [items, setItems] = useState(() => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } });
  const [amt, setAmt] = useState(''); const [cat, setCat] = useState('餐饮'); const [note, setNote] = useState('');
  const CATS = ['餐饮', '购物', '交通', '娱乐', '居家', '医疗', '其他'];
  const CAT_C = { '餐饮': '#d4926a', '购物': '#a288b6', '交通': '#8a9ea7', '娱乐': '#d99a5c', '居家': '#8e9d7d', '医疗': '#c0607a', '其他': '#9a8c78' };
  const save = (next) => { setItems(next); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {} };
  const add = () => {
    const n = parseFloat(amt); if (!n || n <= 0) return;
    const d = new Date(); const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    save([{ id: Date.now(), amt: Math.round(n * 100) / 100, cat, note: note.trim(), date }, ...items]);
    setAmt(''); setNote('');
  };
  const del = (id) => save(items.filter(x => x.id !== id));
  const d0 = new Date(); const ym = `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, '0')}`;
  const monthItems = items.filter(x => (x.date || '').startsWith(ym));
  const monthTotal = monthItems.reduce((s, x) => s + (x.amt || 0), 0);
  const byCat = {}; for (const x of monthItems) byCat[x.cat] = (byCat[x.cat] || 0) + (x.amt || 0);
  const catEntries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const maxCat = Math.max(1, ...catEntries.map(e => e[1]));
  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', padding: '20px 16px 40px', maxWidth: 440, margin: '0 auto', width: '100%', textAlign: 'left' }}>
      <div style={{ fontSize: 10, color: t.text3, letterSpacing: '0.14em', marginBottom: 4 }}>LEDGER</div>
      <div style={{ fontSize: 18, fontWeight: 400, color: t.text1, marginBottom: 14, fontFamily: 'inherit' }}>记账 · 小账本</div>
      <Card t={t} style={{ padding: '16px', marginBottom: 14 }}>
        <div style={{ fontSize: 10, color: t.text3, marginBottom: 4 }}>本月支出</div>
        <div style={{ fontSize: 26, fontWeight: 600, color: t.text1, fontFamily: 'inherit', marginBottom: catEntries.length ? 12 : 0 }}>¥ {monthTotal.toFixed(2)}</div>
        {catEntries.map(([c, v]) => (
          <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ width: 34, fontSize: 10, color: t.text2 }}>{c}</span>
            <div style={{ flex: 1, height: 7, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.05)', overflow: 'hidden' }}><div style={{ height: '100%', width: `${(v / maxCat) * 100}%`, backgroundColor: CAT_C[c] || t.acc, borderRadius: 4 }} /></div>
            <span style={{ width: 56, fontSize: 10, color: t.text3, textAlign: 'right' }}>¥{v.toFixed(0)}</span>
          </div>
        ))}
      </Card>
      <Card t={t} style={{ padding: '14px 16px', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input value={amt} onChange={e => setAmt(e.target.value)} inputMode="decimal" placeholder="金额" style={{ flex: 1, fontSize: 14, padding: '8px 10px', border: `1px solid ${t.border}`, borderRadius: 8, background: 'transparent', color: t.text1, fontFamily: 'inherit', minWidth: 0 }} />
          <input value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="备注（选填）" style={{ flex: 2, fontSize: 13, padding: '8px 10px', border: `1px solid ${t.border}`, borderRadius: 8, background: 'transparent', color: t.text1, fontFamily: 'inherit', minWidth: 0 }} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {CATS.map(c => <span key={c} className="tap" onClick={() => setCat(c)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 12, cursor: 'pointer', backgroundColor: cat === c ? `${CAT_C[c]}22` : 'transparent', color: cat === c ? CAT_C[c] : t.text3, border: `1px solid ${cat === c ? CAT_C[c] : t.border}` }}>{c}</span>)}
        </div>
        <button className="tap" onClick={add} style={{ width: '100%', padding: '9px', fontSize: 13, fontWeight: 600, color: '#fff', backgroundColor: t.acc, border: 'none', borderRadius: t.radius > 0 ? 10 : 0, cursor: 'pointer', fontFamily: 'inherit' }}>记一笔</button>
      </Card>
      {monthItems.length === 0 ? (
        <div style={{ textAlign: 'center', color: t.text3, fontSize: 12, marginTop: 16, fontStyle: 'italic' }}>本月还没有记账</div>
      ) : monthItems.map(x => (
        <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px', borderBottom: `0.5px solid ${t.border}` }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: CAT_C[x.cat] || t.acc, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: t.text1, fontFamily: 'inherit', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.note || x.cat}</div>
            <div style={{ fontSize: 9, color: t.text3 }}>{x.cat} · {(x.date || '').slice(5)}</div>
          </div>
          <span style={{ fontSize: 14, color: t.text1, fontFamily: 'inherit', flexShrink: 0 }}>¥{(x.amt || 0).toFixed(2)}</span>
          <span className="tap" onClick={() => del(x.id)} style={{ fontSize: 13, color: t.text3, paddingLeft: 6, cursor: 'pointer', flexShrink: 0 }}>×</span>
        </div>
      ))}
    </div>
  );
}

function SupplementAdder({ t, onAdd }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(''); const [dose, setDose] = useState(''); const [time, setTime] = useState('');
  if (!open) return <button className="tap" onClick={() => setOpen(true)} style={{ marginTop: 10, fontSize: 11, color: t.acc, background: 'transparent', border: `1px dashed ${t.border}`, borderRadius: t.radius > 0 ? 10 : 0, padding: '6px 0', width: '100%', cursor: 'pointer', fontFamily: 'inherit' }}>+ 添加补剂</button>;
  return (
    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="名称" style={{ flex: 2, fontSize: 12, padding: '6px 8px', border: `1px solid ${t.border}`, borderRadius: 8, background: 'transparent', color: t.text1, fontFamily: 'inherit', minWidth: 0 }} />
        <input value={dose} onChange={e => setDose(e.target.value)} placeholder="剂量" style={{ flex: 1, fontSize: 12, padding: '6px 8px', border: `1px solid ${t.border}`, borderRadius: 8, background: 'transparent', color: t.text1, fontFamily: 'inherit', minWidth: 0 }} />
        <input value={time} onChange={e => setTime(e.target.value)} placeholder="时间" style={{ width: 56, fontSize: 12, padding: '6px 8px', border: `1px solid ${t.border}`, borderRadius: 8, background: 'transparent', color: t.text1, fontFamily: 'inherit' }} />
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="tap" onClick={() => { if (name.trim()) { onAdd(name.trim(), dose.trim(), time.trim()); setName(''); setDose(''); setTime(''); setOpen(false); } }} style={{ flex: 1, fontSize: 12, padding: '7px', background: t.acc, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}>添加</button>
        <button className="tap" onClick={() => setOpen(false)} style={{ fontSize: 12, padding: '7px 14px', background: 'transparent', color: t.text3, border: `1px solid ${t.border}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}>取消</button>
      </div>
    </div>
  );
}

function PeriodPage({ t }) {
  const KEY = 'companion_period_v1';
  const [data, setData] = useState(() => {
    let d = {}; try { d = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}
    return {
      starts: d.starts || [], periodEnds: d.periodEnds || {}, cycleLen: Math.max(1, Math.min(60, parseInt(d.cycleLen) || 28)), periodLen: Math.max(1, Math.min(30, parseInt(d.periodLen) || 5)),
      supplements: d.supplements || [
        { id: 's1', name: '肌肽锌', dose: '2粒', time: '10:00' },
        { id: 's2', name: '消化酶', dose: '1粒', time: '10:30' },
        { id: 's3', name: '甘氨酸镁+茶氨酸', dose: '2+1粒', time: '22:30' },
      ],
      taken: d.taken || {},
      logs: d.logs || {},   // { dateKey: { flow:0-4|null, pain:0-4|null, symptoms:[], emotion:0-4|null } }
    };
  });
  // 同时写 localStorage（快）和后端 KV（持久，防 iOS 清缓存丢数据）
  const save = (next) => {
    setData(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
    fetch(`${BACKEND}/kv/period`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: next }) }).catch(() => {});
  };
  const dataRef = useRef(data); useEffect(() => { dataRef.current = data; }, [data]);
  // 进入时从后端拉取（后端有则以后端为准；后端空则把本地数据种上去）
  useEffect(() => {
    let alive = true;
    fetch(`${BACKEND}/kv/period`).then(r => r.json()).then(d => {
      if (!alive) return;
      const v = d && d.value;
      if (v && (v.starts || v.supplements || v.taken || v.logs)) {
        const merged = {
          starts: v.starts || [],
          periodEnds: v.periodEnds || {},
          cycleLen: Math.max(1, Math.min(60, parseInt(v.cycleLen) || 28)),
          periodLen: Math.max(1, Math.min(30, parseInt(v.periodLen) || 5)),
          supplements: v.supplements || dataRef.current.supplements,
          taken: v.taken || {},
          logs: v.logs || {},
        };
        setData(merged);
        try { localStorage.setItem(KEY, JSON.stringify(merged)); } catch {}
      } else {
        fetch(`${BACKEND}/kv/period`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: dataRef.current }) }).catch(() => {});
      }
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const fmt = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  const parseD = (s) => { const [y, m, dd] = s.split('-').map(Number); const x = new Date(y, m - 1, dd); x.setHours(0, 0, 0, 0); return x; };
  const dB = (a, b) => Math.round((b - a) / 86400000);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayKey = fmt(today);
  const sortedStarts = data.starts.slice().sort();
  const lastStart = sortedStarts.length ? sortedStarts[sortedStarts.length - 1] : null;
  const periodEnds = data.periodEnds || {};
  const curEnd = lastStart ? (periodEnds[lastStart] || null) : null;
  const daysSinceStart = lastStart ? dB(parseD(lastStart), today) : 999;
  // 本次经期"进行中"：有开始、还没标结束、且离开始不久（避免久未标结束就一直显示结束按钮、挡住下次开始）
  const ongoing = !!lastStart && !curEnd && daysSinceStart >= 0 && daysSinceStart <= data.periodLen + 7;
  let phase = null, dayOfCycle = null, nextDate = null, daysUntil = null, ovulationDay = null, curPeriodLen = data.periodLen;
  if (lastStart) {
    let ls = parseD(lastStart);
    dayOfCycle = dB(ls, today) + 1;
    const inCur = dayOfCycle <= data.cycleLen;   // 还在本次周期内（没跨到下个projection）
    while (dayOfCycle > data.cycleLen) { ls = new Date(ls); ls.setDate(ls.getDate() + data.cycleLen); dayOfCycle = dB(ls, today) + 1; }
    nextDate = new Date(ls); nextDate.setDate(ls.getDate() + data.cycleLen);
    daysUntil = dB(today, nextDate);
    ovulationDay = data.cycleLen - 14;
    // 标了结束就用真实经期天数（开始→结束），否则用默认 periodLen
    if (inCur && curEnd) curPeriodLen = Math.max(1, dB(parseD(lastStart), parseD(curEnd)) + 1);
    if (dayOfCycle <= curPeriodLen) phase = '月经期';
    else if (dayOfCycle < ovulationDay - 1) phase = '卵泡期';
    else if (dayOfCycle <= ovulationDay + 1) phase = '排卵期';
    else phase = '黄体期';
  }
  const phaseColor = { '月经期': '#c0607a', '卵泡期': '#8e9d7d', '排卵期': '#d4926a', '黄体期': '#a288b6' }[phase] || t.acc;
  const logStart = () => { if (!data.starts.includes(todayKey)) save({ ...data, starts: [...data.starts, todayKey] }); };
  const undoStart = () => { if (data.starts.includes(todayKey)) { const pe = { ...periodEnds }; delete pe[todayKey]; save({ ...data, starts: data.starts.filter(s => s !== todayKey), periodEnds: pe }); } };
  // 标记/修改本次经期结束日（必须 ≥ 开始日、且不晚于今天）
  const markEnd = (key) => { if (!lastStart || !key) return; if (parseD(key) < parseD(lastStart) || parseD(key) > today) return; save({ ...data, periodEnds: { ...periodEnds, [lastStart]: key } }); };
  const clearEnd = () => { if (!lastStart || !periodEnds[lastStart]) return; const pe = { ...periodEnds }; delete pe[lastStart]; save({ ...data, periodEnds: pe }); };
  // 修改本次经期开始日：可往前/往后改（不能选未来）；自动迁移它已记的结束日
  const editStart = (key) => {
    if (!key || parseD(key) > today) return;
    if (!lastStart) { save({ ...data, starts: [...data.starts, key] }); return; }
    if (key === lastStart) return;
    const newStarts = Array.from(new Set(data.starts.filter(s => s !== lastStart).concat(key))).sort();
    const pe = { ...periodEnds };
    if (pe[lastStart]) { pe[key] = pe[lastStart]; delete pe[lastStart]; }
    save({ ...data, starts: newStarts, periodEnds: pe });
  };
  const toggleSupp = (sid) => { const day = { ...(data.taken[todayKey] || {}) }; day[sid] = !day[sid]; save({ ...data, taken: { ...data.taken, [todayKey]: day } }); };
  const setCfg = (k, v) => save({ ...data, [k]: Math.max(1, Math.min(60, parseInt(v) || 1)) });
  // 今日身体记录
  const todayLog = data.logs[todayKey] || {};
  const setLog = (patch) => { const logs = { ...data.logs, [todayKey]: { ...(data.logs[todayKey] || {}), ...patch } }; save({ ...data, logs }); };
  const toggleSymptom = (s) => { const cur = new Set(todayLog.symptoms || []); cur.has(s) ? cur.delete(s) : cur.add(s); setLog({ symptoms: [...cur] }); };

  // 平均周期 + 养成天数 + 历史周期
  let avgCycle = data.cycleLen; const gaps = [];
  for (let i = 1; i < sortedStarts.length; i++) { const g = dB(parseD(sortedStarts[i - 1]), parseD(sortedStarts[i])); if (g > 0 && g < 90) gaps.push(g); }
  if (gaps.length) avgCycle = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
  const groomDays = sortedStarts.length ? dB(parseD(sortedStarts[0]), today) + 1 : 0;

  const FLOW = ['点滴', '少', '中', '多', '超多'];
  const PAIN = ['没事', '轻', '中', '痛', '要命'];
  const EMO = [{ l: '很差', c: '#9fb0b8' }, { l: '低落', c: '#a8a0c0' }, { l: '一般', c: '#cbb89a' }, { l: '不错', c: '#a9c08d' }, { l: '很好', c: '#d4926a' }];
  const SYMPTOMS = ['头痛', '腰痛', '腹痛', '乳房胀', '失眠', '恶心', '疲惫', '烦躁'];

  // 环形进度
  const RR = 76, SW = 13, CIRC = 2 * Math.PI * RR;
  const prog = lastStart ? Math.min(1, dayOfCycle / data.cycleLen) : 0;

  // 情绪轨迹：近 14 天
  const emoDays = [];
  for (let i = 13; i >= 0; i--) { const dt = new Date(today); dt.setDate(today.getDate() - i); const k = fmt(dt); emoDays.push({ k, e: (data.logs[k] || {}).emotion }); }

  const Seg = ({ options, value, onPick, colorFor }) => (
    <div style={{ display: 'flex', gap: 6 }}>
      {options.map((o, i) => {
        const on = value === i; const c = colorFor ? colorFor(i) : phaseColor;
        return <span key={i} className="tap" onClick={() => onPick(on ? null : i)} style={{ flex: 1, textAlign: 'center', fontSize: 11, padding: '8px 0', borderRadius: 9, cursor: 'pointer', background: on ? c : 'transparent', color: on ? '#fff' : t.text2, border: `0.5px solid ${on ? c : t.border}`, fontFamily: 'inherit', transition: 'all .15s' }}>{typeof o === 'string' ? o : o.l}</span>;
      })}
    </div>
  );

  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', padding: '20px 16px 40px', maxWidth: 440, margin: '0 auto', width: '100%', textAlign: 'left' }}>
      <div style={{ fontSize: 10, color: t.text3, letterSpacing: '0.14em', marginBottom: 4 }}>CYCLE</div>
      <div style={{ fontSize: 18, fontWeight: 400, color: t.text1, marginBottom: 18, fontFamily: 'inherit' }}>周期记录</div>

      {/* 环形进度 */}
      <Card t={t} style={{ padding: '20px 16px', marginBottom: 14, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ position: 'relative', width: 180, height: 180 }}>
          <svg viewBox="0 0 180 180" width="180" height="180">
            <circle cx="90" cy="90" r={RR} fill="none" stroke={t.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'} strokeWidth={SW} />
            {lastStart && <circle cx="90" cy="90" r={RR} fill="none" stroke={phaseColor} strokeWidth={SW} strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - prog)} transform="rotate(-90 90 90)" style={{ transition: 'stroke-dashoffset 0.6s ease' }} />}
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            {lastStart ? <>
              <div style={{ fontSize: 11, color: t.text3, letterSpacing: '0.1em' }}>DAY</div>
              <div style={{ fontSize: 40, fontWeight: 700, color: t.text1, lineHeight: 1, fontFamily: 'inherit' }}>{dayOfCycle}</div>
              <div style={{ fontSize: 11, color: t.text3, marginTop: 2 }}>/ {data.cycleLen}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: phaseColor, marginTop: 6, fontFamily: 'inherit' }}>{phase}</div>
            </> : <div style={{ fontSize: 12, color: t.text3, textAlign: 'center', padding: '0 20px', lineHeight: 1.6 }}>还没有记录<br />从这次月经开始追踪</div>}
          </div>
        </div>
        {lastStart && <div style={{ fontSize: 12, color: t.text3, marginTop: 8 }}>距下次约 {daysUntil} 天 · 预计 {nextDate.getMonth() + 1}/{nextDate.getDate()}</div>}
        <div style={{ width: '100%', marginTop: 16 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            {!ongoing ? (
              <button className="tap" onClick={logStart} disabled={data.starts.includes(todayKey)} style={{ flex: 1, padding: '11px', fontSize: 13, fontWeight: 600, color: '#fff', backgroundColor: data.starts.includes(todayKey) ? t.text3 : phaseColor, border: 'none', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', opacity: data.starts.includes(todayKey) ? 0.6 : 1 }}>{data.starts.includes(todayKey) ? '今天已记录开始' : '● 今天来了'}</button>
            ) : (
              <button className="tap" onClick={() => markEnd(todayKey)} style={{ flex: 1, padding: '11px', fontSize: 13, fontWeight: 600, color: '#fff', backgroundColor: '#8e9d7d', border: 'none', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit' }}>● 今天结束了</button>
            )}
            {data.starts.includes(todayKey) && <button className="tap" onClick={undoStart} style={{ padding: '11px 16px', fontSize: 12, color: t.text3, background: 'transparent', border: `0.5px solid ${t.border}`, borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit' }}>撤销今天</button>}
          </div>
          {lastStart && (
            <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <label style={{ fontSize: 11, color: t.text3, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>开始
                <input type="date" max={todayKey} value={lastStart} onChange={e => editStart(e.target.value)} style={{ fontSize: 12, border: `0.5px solid ${t.border}`, borderRadius: 8, padding: '4px 8px', background: 'transparent', color: t.text1, fontFamily: 'inherit' }} />
              </label>
              <label style={{ fontSize: 11, color: t.text3, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>结束
                <input type="date" min={lastStart} max={todayKey} value={curEnd || ''} onChange={e => e.target.value ? markEnd(e.target.value) : clearEnd()} style={{ fontSize: 12, border: `0.5px solid ${t.border}`, borderRadius: 8, padding: '4px 8px', background: 'transparent', color: t.text1, fontFamily: 'inherit' }} />
              </label>
              {curEnd && <span className="tap" onClick={clearEnd} style={{ fontSize: 11, color: t.text3, textDecoration: 'underline', cursor: 'pointer' }}>清除</span>}
            </div>
          )}
          {curEnd && <div style={{ fontSize: 11, color: t.text3, marginTop: 8 }}>本次经期 {dB(parseD(lastStart), parseD(curEnd)) + 1} 天（{parseD(lastStart).getMonth() + 1}/{parseD(lastStart).getDate()} – {parseD(curEnd).getMonth() + 1}/{parseD(curEnd).getDate()}）</div>}
        </div>
      </Card>

      {/* 统计 */}
      <Card t={t} style={{ padding: '16px', marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-around' }}>
          {[['上次开始', lastStart ? `${parseD(lastStart).getMonth() + 1}/${parseD(lastStart).getDate()}` : '—'], ['平均周期', `${avgCycle} 天`], ['下次预计', nextDate ? `${nextDate.getMonth() + 1}/${nextDate.getDate()}` : '—'], ['已养成', `${groomDays} 天`]].map(([l, v], i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: t.text1, fontFamily: 'inherit' }}>{v}</div>
              <div style={{ fontSize: 9, color: t.text3, marginTop: 3, letterSpacing: '0.04em' }}>{l}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* 今日身体 */}
      <Card t={t} style={{ padding: '16px', marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: t.text1, marginBottom: 12, fontFamily: 'inherit' }}>今天 · 身体记录</div>
        <div style={{ fontSize: 10, color: t.text3, marginBottom: 6, letterSpacing: '0.06em' }}>FLOW 流量</div>
        <Seg options={FLOW} value={typeof todayLog.flow === 'number' ? todayLog.flow : null} onPick={v => setLog({ flow: v })} colorFor={() => '#c0607a'} />
        <div style={{ fontSize: 10, color: t.text3, margin: '14px 0 6px', letterSpacing: '0.06em' }}>PAIN 痛感</div>
        <Seg options={PAIN} value={typeof todayLog.pain === 'number' ? todayLog.pain : null} onPick={v => setLog({ pain: v })} colorFor={(i) => ['#9fb0b8', '#cbb89a', '#d4926a', '#c0607a', '#9b3d57'][i]} />
        <div style={{ fontSize: 10, color: t.text3, margin: '14px 0 6px', letterSpacing: '0.06em' }}>MOOD 情绪</div>
        <Seg options={EMO} value={typeof todayLog.emotion === 'number' ? todayLog.emotion : null} onPick={v => setLog({ emotion: v })} colorFor={(i) => EMO[i].c} />
        <div style={{ fontSize: 10, color: t.text3, margin: '14px 0 8px', letterSpacing: '0.06em' }}>SYMPTOMS 症状</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {SYMPTOMS.map(s => {
            const on = (todayLog.symptoms || []).includes(s);
            return <span key={s} className="tap" onClick={() => toggleSymptom(s)} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 16, cursor: 'pointer', background: on ? `${phaseColor}1a` : 'transparent', color: on ? phaseColor : t.text2, border: `0.5px solid ${on ? phaseColor : t.border}`, fontFamily: 'inherit' }}>{s}</span>;
          })}
        </div>
      </Card>

      {/* 情绪轨迹 */}
      <Card t={t} style={{ padding: '16px', marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: t.text1, marginBottom: 12, fontFamily: 'inherit' }}>情绪轨迹 · 近两周</div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', justifyContent: 'space-between' }}>
          {emoDays.map((d, i) => (
            <div key={d.k} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 14, height: 14, borderRadius: '50%', background: typeof d.e === 'number' ? EMO[d.e].c : 'transparent', border: typeof d.e === 'number' ? 'none' : `1px dashed ${t.border}` }} />
              {i % 2 === 0 && <span style={{ fontSize: 7, color: t.text3 }}>{parseD(d.k).getDate()}</span>}
            </div>
          ))}
        </div>
      </Card>

      {/* 历史周期 */}
      {gaps.length > 0 && (
        <Card t={t} style={{ padding: '16px', marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: t.text1, marginBottom: 10, fontFamily: 'inherit' }}>过去的周期</div>
          {sortedStarts.slice().reverse().map((s, i, arr) => {
            const next = arr[i - 1]; // 反序后上一项是更晚的开始
            const len = next ? dB(parseD(s), parseD(next)) : (s === lastStart ? dayOfCycle : null);
            const ongoing = next == null && s === lastStart;
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < arr.length - 1 ? `0.5px solid ${t.border}` : 'none' }}>
                <span style={{ fontSize: 12, color: t.text1, fontFamily: 'inherit', width: 64 }}>{parseD(s).getMonth() + 1}/{parseD(s).getDate()}</span>
                <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, ((len || 0) / Math.max(avgCycle, data.cycleLen)) * 100)}%`, background: ongoing ? phaseColor : '#c0607a', opacity: ongoing ? 0.7 : 1, borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: 11, color: t.text3, width: 56, textAlign: 'right' }}>{len ? `${len} 天${ongoing ? ' 进行中' : ''}` : '—'}</span>
              </div>
            );
          })}
          <div style={{ display: 'flex', gap: 16, marginTop: 8, justifyContent: 'flex-start' }}>
            <label style={{ fontSize: 10, color: t.text3 }}>周期<input type="number" value={data.cycleLen} onChange={e => setCfg('cycleLen', e.target.value)} style={{ width: 40, margin: '0 4px', fontSize: 11, border: `1px solid ${t.border}`, borderRadius: 6, padding: '2px 4px', background: 'transparent', color: t.text1 }} />天</label>
            <label style={{ fontSize: 10, color: t.text3 }}>经期<input type="number" value={data.periodLen} onChange={e => setCfg('periodLen', e.target.value)} style={{ width: 40, margin: '0 4px', fontSize: 11, border: `1px solid ${t.border}`, borderRadius: 6, padding: '2px 4px', background: 'transparent', color: t.text1 }} />天</label>
          </div>
        </Card>
      )}

      {/* 补剂（保留） */}
      <Card t={t} style={{ padding: '14px 16px' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: t.text1, marginBottom: 6, fontFamily: 'inherit' }}>今日补剂</div>
        {data.supplements.length === 0 && <div style={{ fontSize: 11, color: t.text3, fontStyle: 'italic' }}>还没有补剂，点下面添加。</div>}
        {data.supplements.map(s => {
          const takenToday = data.taken[todayKey] || {};
          return (
          <div key={s.id} className="tap" onClick={() => toggleSupp(s.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `0.5px solid ${t.border}`, cursor: 'pointer' }}>
            <span style={{ width: 20, height: 20, borderRadius: '50%', border: `1.5px solid ${takenToday[s.id] ? '#8e9d7d' : t.border}`, backgroundColor: takenToday[s.id] ? '#8e9d7d' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff', fontSize: 11 }}>{takenToday[s.id] ? '✓' : ''}</span>
            <span style={{ flex: 1, fontSize: 13, color: takenToday[s.id] ? t.text3 : t.text1, textDecoration: takenToday[s.id] ? 'line-through' : 'none', fontFamily: 'inherit' }}>{s.name} <span style={{ fontSize: 11, color: t.text3 }}>{s.dose}</span></span>
            <span style={{ fontSize: 10, color: t.text3 }}>{s.time}</span>
            <span className="tap" onClick={(e) => { e.stopPropagation(); save({ ...data, supplements: data.supplements.filter(x => x.id !== s.id) }); }} style={{ fontSize: 13, color: t.text3, paddingLeft: 6 }}>×</span>
          </div>
          );
        })}
        <SupplementAdder t={t} onAdd={(name, dose, time) => save({ ...data, supplements: [...data.supplements, { id: 's' + Date.now(), name, dose, time }] })} />
      </Card>
    </div>
  );
}

// 白板日记：角色私下对小满的观察。今天滚动条 + 长期 + 过去日记本
// 学术工具（哲学生）：前沿推送 / 文献综述 / 红灯写作。纯工具，无人设
function AcademicPage({ t }) {
  const [tab, setTab] = useState('feed');
  const acc = t.acc;
  // 前沿
  const [feed, setFeed] = useState(null);
  const [feedTopic, setFeedTopic] = useState('');
  const [feedBucket, setFeedBucket] = useState('all');
  const [feedBusy, setFeedBusy] = useState(false);
  const loadFeed = async (bucket, topic) => {
    setFeedBusy(true);
    const qs = topic ? '?topic=' + encodeURIComponent(topic) : (bucket ? '?bucket=' + bucket : '');
    try { const d = await fetch(`${BACKEND}/academic/feed${qs}`).then(r => r.json()); setFeed(d.items || []); } catch { setFeed([]); }
    setFeedBusy(false);
  };
  const pickBucket = (b) => { setFeedBucket(b); setFeedTopic(''); loadFeed(b, ''); };
  useEffect(() => { if (tab === 'feed' && feed === null) loadFeed('all', ''); }, [tab]);
  // 综述
  const [revTopic, setRevTopic] = useState('');
  const [revBusy, setRevBusy] = useState(false);
  const [review, setReview] = useState(null);
  const doReview = async () => {
    if (!revTopic.trim() || revBusy) return; setRevBusy(true); setReview(null);
    try { const d = await fetch(`${BACKEND}/academic/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: revTopic.trim() }) }).then(r => r.json()); setReview(d); } catch { setReview({ review: '生成失败，稍后再试', papers: [] }); }
    setRevBusy(false);
  };
  // 写作
  const [wPrompt, setWPrompt] = useState('');
  const [wBusy, setWBusy] = useState(false);
  const [wOut, setWOut] = useState('');
  const doWrite = async () => {
    if (!wPrompt.trim() || wBusy) return; setWBusy(true); setWOut('');
    try { const d = await fetch(`${BACKEND}/academic/write`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: wPrompt.trim() }) }).then(r => r.json()); setWOut(d.text || '没有生成内容'); } catch { setWOut('生成失败，稍后再试'); }
    setWBusy(false);
  };
  const inputStyle = styleInput(t);
  const btn = (label, busy) => ({ width: '100%', padding: '11px', fontSize: 14, fontWeight: 600, color: '#fff', background: busy ? t.text3 : acc, border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', marginTop: 10 });
  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', padding: '20px 16px 36px', maxWidth: 460, margin: '0 auto', width: '100%', textAlign: 'left' }}>
      <div style={{ fontSize: 10, color: t.text3, letterSpacing: '0.14em', marginBottom: 4 }}>ACADEMIC</div>
      <div style={{ fontSize: 18, fontWeight: 400, color: t.text1, fontFamily: 'inherit', fontStyle: 'italic' }}>学术工具</div>
      <div style={{ fontSize: 11, color: t.text3, marginTop: 4, marginBottom: 16 }}>AI 伦理 · 法律 · 情感陪伴</div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[['feed', '前沿推送'], ['review', '文献综述'], ['write', '红灯写作']].map(([k, l]) => (
          <span key={k} className="tap" onClick={() => setTab(k)} style={{ flex: 1, textAlign: 'center', fontSize: 13, padding: '8px 0', cursor: 'pointer', color: tab === k ? '#fff' : t.text2, background: tab === k ? acc : (t.isGlass ? 'rgba(255,255,255,0.2)' : t.card), border: `0.5px solid ${t.border}`, borderRadius: 10, fontFamily: 'inherit' }}>{l}</span>
        ))}
      </div>

      {tab === 'feed' && <>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 10 }}>
          {[['ethics', 'AI伦理'], ['law', 'AI法律'], ['companion', '情感陪伴'], ['all', '综合']].map(([k, l]) => {
            const on = feedBucket === k && !feedTopic;
            return <span key={k} className="tap" onClick={() => pickBucket(k)} style={{ padding: '6px 12px', borderRadius: 999, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit', background: on ? `${acc}1a` : 'transparent', border: `1px solid ${on ? acc : t.border}`, color: on ? acc : t.text3 }}>{l}</span>;
          })}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input value={feedTopic} onChange={e => setFeedTopic(e.target.value)} onKeyDown={e => e.key === 'Enter' && loadFeed('', feedTopic.trim())} placeholder="或输入关键词搜（英文最准）" style={inputStyle} />
          <span className="tap" onClick={() => loadFeed('', feedTopic.trim())} style={{ flexShrink: 0, fontSize: 13, color: '#fff', background: acc, padding: '10px 14px', borderRadius: 10, cursor: 'pointer', whiteSpace: 'nowrap' }}>{feedBusy ? '…' : '搜'}</span>
        </div>
        {feed === null || feedBusy ? <div style={{ color: t.text3, fontSize: 12, textAlign: 'center', padding: 20 }}>加载 arXiv 最新…</div>
          : feed.length === 0 ? <div style={{ color: t.text3, fontSize: 12, textAlign: 'center', padding: 20 }}>没拉到，换个关键词试试</div>
          : feed.map((p, i) => (
            <div key={i} className="tap" onClick={() => { try { window.open(p.url, '_blank', 'noopener'); } catch {} }} style={{ marginBottom: 12, padding: '13px 15px', borderRadius: 12, border: `0.5px solid ${t.border}`, backgroundColor: t.isGlass ? 'rgba(255,255,255,0.2)' : t.card, cursor: 'pointer' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: t.text1, lineHeight: 1.5, fontFamily: 'inherit' }}>{p.title}</div>
              <div style={{ fontSize: 10, color: t.text3, margin: '5px 0' }}>{p.date}{p.authors?.length ? ' · ' + p.authors.join(', ') : ''}</div>
              <div style={{ fontSize: 12, color: t.text2, lineHeight: 1.6, maxHeight: 58, overflow: 'hidden', fontFamily: 'inherit' }}>{p.summary}</div>
              <div style={{ fontSize: 10, color: acc, marginTop: 6 }}>arXiv · 点开 ↗</div>
            </div>
          ))}
      </>}

      {tab === 'review' && <>
        <input value={revTopic} onChange={e => setRevTopic(e.target.value)} onKeyDown={e => e.key === 'Enter' && doReview()} placeholder="综述主题，如「AI 陪伴的伦理风险」" style={inputStyle} />
        <button className="tap" onClick={doReview} disabled={revBusy} style={btn('', revBusy)}>{revBusy ? '检索 + 撰写中…' : '生成文献综述'}</button>
        {review && <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13.5, color: t.text1, lineHeight: 1.85, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{review.review}</div>
          {review.papers?.length > 0 && <div style={{ marginTop: 14, paddingTop: 12, borderTop: `0.5px solid ${t.border}` }}>
            <div style={{ fontSize: 11, color: t.text3, marginBottom: 8 }}>取材（arXiv）</div>
            {review.papers.map((p, i) => <div key={i} className="tap" onClick={() => { try { window.open(p.url, '_blank', 'noopener'); } catch {} }} style={{ fontSize: 12, color: t.text2, lineHeight: 1.6, marginBottom: 6, cursor: 'pointer' }}>· {p.title} <span style={{ color: t.text3 }}>({p.date})</span></div>)}
          </div>}
        </div>}
      </>}

      {tab === 'write' && <>
        <textarea value={wPrompt} onChange={e => setWPrompt(e.target.value)} placeholder="想做什么？例：帮我为「情感陪伴 AI 是否削弱真实亲密关系」搭一个论证结构；或润色下面这段……" rows={4} className="hs" style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
        <button className="tap" onClick={doWrite} disabled={wBusy} style={btn('', wBusy)}>{wBusy ? '思考中…' : '让它帮我写'}</button>
        {wOut && <div style={{ marginTop: 16, fontSize: 13.5, color: t.text1, lineHeight: 1.85, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{wOut}</div>}
      </>}
    </div>
  );
}

// 白板墙：小满自己写的自由文本便签（增删），按角色分桶存 whiteboard.json
function WhiteboardPage({ t }) {
  const [cid, setCid] = useState('yu');
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const acc = CHARACTERS.find(c => c.id === cid)?.accent || t.acc;
  const load = async (c) => {
    setLoading(true);
    try { const d = await fetch(`${BACKEND}/whiteboard/${c}`).then(r => r.json()); setNotes(Array.isArray(d.notes) ? d.notes : []); }
    catch { setNotes([]); }
    setLoading(false);
  };
  useEffect(() => { load(cid); }, [cid]);
  const add = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const r = await fetch(`${BACKEND}/whiteboard/${cid}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: body }) });
      const d = await r.json();
      if (d && d.note) setNotes(prev => [d.note, ...prev]);
      else await load(cid);
      setText('');
    } catch {}
    setBusy(false);
  };
  const del = async (id) => {
    const prev = notes;
    setNotes(notes.filter(n => n.id !== id));   // 乐观删除
    try { await fetch(`${BACKEND}/whiteboard/${cid}/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
    catch { setNotes(prev); }
  };
  const fmt = (ts) => { try { const d = new Date(ts); return `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; } catch { return ''; } };
  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', padding: '20px 18px 36px', maxWidth: 440, margin: '0 auto', width: '100%', textAlign: 'left' }}>
      <div style={{ fontSize: 10, color: t.text3, letterSpacing: '0.14em', marginBottom: 4 }}>WHITEBOARD</div>
      <div style={{ fontSize: 18, fontWeight: 400, color: t.text1, fontFamily: 'inherit' }}>白板</div>
      <div style={{ fontSize: 11, color: t.text3, marginTop: 4, marginBottom: 16 }}>你自己的便签墙——想到什么随手贴上去。</div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {CHARACTERS.map(c => (
          <div key={c.id} className="tap" onClick={() => setCid(c.id)} style={{ padding: '6px 14px', borderRadius: t.radius > 0 ? 16 : 0, fontSize: 11, cursor: 'pointer', backgroundColor: cid === c.id ? `${c.accent}20` : 'transparent', color: cid === c.id ? c.accent : t.text3, border: `0.5px solid ${cid === c.id ? c.accent : t.border}`, fontFamily: 'inherit', fontWeight: cid === c.id ? 600 : 400 }}>{c.name}</div>
        ))}
      </div>

      <div style={{ marginBottom: 18 }}>
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder="写点什么贴上去…" className="hs" style={{ width: '100%', minHeight: 64, maxHeight: 200, border: `1px solid ${t.border}`, borderRadius: t.radius > 0 ? 12 : 0, padding: '10px 12px', fontSize: 13.5, background: t.card, color: t.text1, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box', lineHeight: 1.6 }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button className="tap" onClick={add} disabled={busy || !text.trim()} style={{ padding: '7px 18px', borderRadius: 999, border: 'none', background: text.trim() ? acc : t.border, color: '#fff', fontSize: 13, cursor: text.trim() ? 'pointer' : 'default', fontFamily: 'inherit', opacity: busy ? 0.6 : 1 }}>{busy ? '贴上…' : '贴上去'}</button>
        </div>
      </div>

      {loading ? <div style={{ textAlign: 'center', color: t.text3, fontSize: 12, marginTop: 20 }}>…</div>
        : notes.length === 0 ? <div style={{ textAlign: 'center', color: t.text3, fontSize: 12, marginTop: 24, fontStyle: 'italic', lineHeight: 1.9 }}>白板上还没有便签。<br />在上面写一条贴上去吧。</div>
        : notes.map(n => (
            <Card key={n.id} t={t} style={{ padding: '13px 15px', marginBottom: 10, position: 'relative', borderLeft: `2px solid ${acc}66` }}>
              <div style={{ fontSize: 13.5, color: t.text1, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word', paddingRight: 18 }}>{n.text}</div>
              <div style={{ fontSize: 9, color: t.text3, marginTop: 7 }}>{fmt(n.ts)}</div>
              <span className="tap" onClick={() => del(n.id)} title="删除" style={{ position: 'absolute', top: 8, right: 10, fontSize: 14, color: t.text3, cursor: 'pointer', lineHeight: 1 }}>✕</span>
            </Card>
          ))}
    </div>
  );
}

function NotepadPage({ t }) {
  const [charId, setCharId] = useState('yu');
  const [data, setData] = useState({ today: [], past: [], longterm: [] });
  const [loading, setLoading] = useState(true);
  const [genBusy, setGenBusy] = useState(false);
  const acc = CHARACTERS.find(c => c.id === charId)?.accent || t.acc;
  const load = async (cid) => {
    setLoading(true);
    try { const d = await fetch(`${BACKEND}/notepad/${cid}`).then(r => r.json()); setData({ today: d.today || [], past: d.past || [], longterm: d.longterm || [] }); }
    catch { setData({ today: [], past: [], longterm: [] }); }
    setLoading(false);
  };
  useEffect(() => { load(charId); }, [charId]);
  const genOne = async () => {
    if (genBusy) return; setGenBusy(true);
    try { await fetch(`${BACKEND}/notepad/${charId}/generate?force=1`, { method: 'POST' }); await load(charId); } catch {}
    setGenBusy(false);
  };
  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', padding: '20px 18px 36px', maxWidth: 440, margin: '0 auto', width: '100%', textAlign: 'left' }}>
      <div style={{ fontSize: 10, color: t.text3, letterSpacing: '0.14em', marginBottom: 4 }}>NOTEPAD</div>
      <div style={{ fontSize: 18, fontWeight: 400, color: t.text1, fontFamily: 'inherit', fontStyle: 'italic' }}>白板日记</div>
      <div style={{ fontSize: 11, color: t.text3, marginTop: 4, marginBottom: 18 }}>他私下记着关于你的事</div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {CHARACTERS.map(c => (
          <div key={c.id} className="tap" onClick={() => setCharId(c.id)} style={{ padding: '6px 14px', borderRadius: t.radius > 0 ? 16 : 0, fontSize: 11, cursor: 'pointer', backgroundColor: charId === c.id ? `${c.accent}20` : 'transparent', color: charId === c.id ? c.accent : t.text3, border: `0.5px solid ${charId === c.id ? c.accent : t.border}`, fontFamily: 'inherit', fontWeight: charId === c.id ? 600 : 400 }}>{c.name}</div>
        ))}
      </div>

      {/* 今天的白板 */}
      <Card t={t} style={{ padding: '16px', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: t.text1, fontFamily: 'inherit' }}>今天的白板</span>
          <span className="tap" onClick={genOne} style={{ fontSize: 11, color: genBusy ? t.text3 : acc, cursor: 'pointer', padding: '3px 12px', border: `0.5px solid ${genBusy ? t.border : acc}`, borderRadius: 999, fontFamily: 'inherit' }}>{genBusy ? '记录中…' : '＋ 让他记一条'}</span>
        </div>
        {loading ? <div style={{ fontSize: 12, color: t.text3, padding: '8px 0' }}>…</div>
          : data.today.length === 0 ? <div style={{ fontSize: 12, color: t.text3, fontStyle: 'italic', padding: '8px 0' }}>今天还没写。点右上让他记一条。</div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {data.today.map((line, i) => <div key={i} style={{ fontSize: 13.5, color: t.text1, lineHeight: 1.7, fontFamily: 'inherit', borderLeft: `2px solid ${acc}55`, paddingLeft: 10 }}>{line}</div>)}
            </div>}
      </Card>

      {/* 长期 */}
      {data.longterm.length > 0 && (
        <Card t={t} style={{ padding: '16px', marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: t.text1, marginBottom: 10, fontFamily: 'inherit' }}>长期 · {data.longterm.length} 条</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.longterm.map((line, i) => <div key={i} style={{ fontSize: 13, color: t.text2, lineHeight: 1.6, fontFamily: 'inherit', display: 'flex', gap: 8 }}><span style={{ color: acc, flexShrink: 0 }}>·</span><span>{line}</span></div>)}
          </div>
        </Card>
      )}

      {/* 日记本（过去） */}
      {data.past.length > 0 && <div style={{ fontSize: 11, color: t.text3, letterSpacing: '0.08em', margin: '4px 4px 10px' }}>日 记 本</div>}
      {data.past.map(day => (
        <Card key={day.date} t={t} style={{ padding: '14px 16px', marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: t.text3, marginBottom: 8, fontFamily: 'inherit' }}>{day.date}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {day.notes.map((line, i) => <div key={i} style={{ fontSize: 13, color: t.text1, lineHeight: 1.7, fontFamily: 'inherit' }}>{line}</div>)}
          </div>
        </Card>
      ))}
    </div>
  );
}

function MemoryPage({ t }) {
  const [charId, setCharId] = useState('yu');
  const [memories, setMemories] = useState([]);
  const [hub, setHub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mtab, setMtab] = useState('all');
  const CHAR_NAMES = { yu: '沈屿' };
  const MTYPE = { summary: '摘要', fact: '事实', insight: '洞察', moment: '此刻', conversation: '对话' };
  const togglePin = async (m) => {
    if (m.mid == null) return;
    setMemories(prev => prev.map(x => x.mid === m.mid ? { ...x, pinned: !x.pinned } : x));
    try { await fetch(`${BACKEND}/memory/pin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: m.mid, pinned: !m.pinned }) }); } catch {}
  };
  const delMem = async (m) => {
    if (m.mid == null) return;
    setMemories(prev => prev.filter(x => x.mid !== m.mid));
    try { await fetch(`${BACKEND}/memory/item/${m.mid}`, { method: 'DELETE' }); } catch {}
  };

  const load = async (cid) => {
    setLoading(true); setMtab('all');
    try {
      const [r, hr] = await Promise.all([
        fetch(`${BACKEND}/memory/${cid}`).then(x => x.json()).catch(() => ({})),
        fetch(`${BACKEND}/memory-hub/${cid}`).then(x => x.json()).catch(() => null),
      ]);
      setMemories(r.memories || []);
      setHub(hr);
    } catch { setMemories([]); setHub(null); }
    setLoading(false);
  };

  useEffect(() => { load(charId); }, [charId]);

  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', padding: '20px 18px 32px', maxWidth: 440, margin: '0 auto', width: '100%' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, color: t.text3, letterSpacing: '0.14em', marginBottom: 4 }}>MEMORY</div>
        <div style={{ fontSize: 18, fontWeight: 400, color: t.text1, fontFamily: 'inherit', fontStyle: 'italic' }}>漫漫长河</div>
        <div style={{ fontSize: 11, color: t.text3, marginTop: 4 }}>那些被记住的，就不会消失</div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {CHARACTERS.map(c => (
          <div key={c.id} className="tap" onClick={() => setCharId(c.id)} style={{
            padding: '6px 14px', borderRadius: t.radius > 0 ? 16 : 0, fontSize: 11, cursor: 'pointer',
            backgroundColor: charId === c.id ? `${c.accent}20` : 'transparent',
            color: charId === c.id ? c.accent : t.text3,
            border: `0.5px solid ${charId === c.id ? c.accent : t.border}`,
            fontFamily: 'inherit', fontWeight: charId === c.id ? 600 : 400,
          }}>{c.name}</div>
        ))}
      </div>

      {hub && (() => {
        const BC = { warm: '#d98b8b', calm: '#e0cbab', deep: '#c98da8', cool: '#9fb0b8' };
        const accent = CHARACTERS.find(c => c.id === charId)?.accent || t.acc;
        const map = {}; (hub.emotionDays || []).forEach(d => { map[d.date] = d; });
        const today = new Date(Date.now() + 8 * 3600000);   // 中国时区"今天"（与后端按 +8 归日对齐）
        const cnKey = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
        const dow = (today.getUTCDay() + 6) % 7;
        const start = new Date(today); start.setUTCDate(today.getUTCDate() - dow - 35);   // 含今天那一周往前 6 周
        const cells = [];
        for (let i = 0; i < 42; i++) {
          const dt = new Date(start); dt.setUTCDate(start.getUTCDate() + i);
          const key = cnKey(dt);
          cells.push({ key, future: dt > today, ...(map[key] || {}) });
        }
        const weeks = []; for (let w = 0; w < 6; w++) weeks.push(cells.slice(w * 7, w * 7 + 7));
        const m = hub.memory || { total: 0, byType: {}, pinned: 0, faded: 0 };
        const types = [['fact', '事实'], ['summary', '片段'], ['insight', '洞察']];
        const maxT = Math.max(1, ...types.map(([k]) => m.byType?.[k] || 0));
        return (
          <>
            <Card t={t} style={{ padding: '16px', marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: t.text1, fontFamily: 'inherit' }}>情绪热力 · 近六周</span>
                <span style={{ fontSize: 9, color: t.text3 }}>{hub.emotionTotal || 0} 次心跳</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {weeks.map((wk, wi) => (
                  <div key={wi} style={{ display: 'flex', gap: 4 }}>
                    {wk.map((c) => (
                      <div key={c.key} title={`${c.key.slice(5)}${c.count ? ' · ' + c.count : ''}`} style={{ flex: 1, aspectRatio: '1', borderRadius: 4, backgroundColor: c.bucket ? BC[c.bucket] : 'transparent', opacity: c.bucket ? (c.future ? 0.12 : Math.min(0.45 + (c.count || 0) * 0.13, 1)) : 1, border: c.bucket ? 'none' : `1px dashed ${t.border}` }} />
                    ))}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 10, justifyContent: 'center' }}>
                {[['warm', '暖'], ['calm', '平静'], ['deep', '深'], ['cool', '冷']].map(([k, l]) => (
                  <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: t.text3 }}><span style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: BC[k], display: 'inline-block' }} />{l}</span>
                ))}
              </div>
            </Card>
            <Card t={t} style={{ padding: '16px', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 14 }}>
                {[[m.total, '记忆'], [m.byType?.insight || 0, '洞察'], [m.pinned, '置顶'], [m.faded, '沉底']].map(([n, l], i) => (
                  <div key={i} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 600, color: t.text1, fontFamily: 'inherit' }}>{n}</div>
                    <div style={{ fontSize: 9, color: t.text3, marginTop: 2 }}>{l}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {types.map(([k, l]) => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 32, fontSize: 10, color: t.text2, fontFamily: 'inherit' }}>{l}</span>
                    <div style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${((m.byType?.[k] || 0) / maxT) * 100}%`, backgroundColor: accent, borderRadius: 4 }} />
                    </div>
                    <span style={{ width: 24, fontSize: 10, color: t.text3, textAlign: 'right' }}>{m.byType?.[k] || 0}</span>
                  </div>
                ))}
              </div>
            </Card>
          </>
        );
      })()}

      {/* 分类筛选 */}
      {!loading && memories.length > 0 && (() => {
        const cats = [['all', '全部'], ['fact', '事实'], ['summary', '摘要'], ['insight', '洞察'], ['moment', '此刻'], ['conversation', '对话']];
        const counts = memories.reduce((a, m) => { a[m.type] = (a[m.type] || 0) + 1; return a; }, {});
        const acc = CHARACTERS.find(c => c.id === charId)?.accent || t.acc;
        return (
          <div className="hs" style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 12, paddingBottom: 2 }}>
            {cats.filter(([k]) => k === 'all' || counts[k]).map(([k, l]) => (
              <span key={k} className="tap" onClick={() => setMtab(k)} style={{ flexShrink: 0, fontSize: 11, padding: '5px 12px', borderRadius: 14, cursor: 'pointer', background: mtab === k ? acc : 'transparent', color: mtab === k ? '#fff' : t.text3, border: `0.5px solid ${mtab === k ? acc : t.border}`, fontFamily: 'inherit' }}>{l}{k !== 'all' ? ` ${counts[k]}` : ''}</span>
            ))}
          </div>
        );
      })()}

      {loading ? <div style={{ textAlign: 'center', color: t.text3, fontSize: 12, marginTop: 40 }}>…</div> : memories.length === 0 ? (
        <div style={{ textAlign: 'center', color: t.text3, fontSize: 12, marginTop: 40, fontStyle: 'italic' }}>还没有记忆碎片</div>
      ) : memories.filter(m => mtab === 'all' || m.type === mtab).map((m, i) => (
        <Card key={m.mid != null ? 'm' + m.mid : i} t={t} style={{ padding: '14px 16px', marginBottom: 12, border: m.pinned ? `0.5px solid ${(CHARACTERS.find(c => c.id === charId)?.accent || t.acc)}` : undefined }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 9, color: t.text3, letterSpacing: '0.06em' }}>{m.pinned ? '📌 ' : ''}{MTYPE[m.type] || '碎片'}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 8, color: t.text3, opacity: 0.5 }}>{m.date || ''}{m.heat != null ? ` · 热${Number(m.heat).toFixed(1)}` : ''}</span>
              {m.mid != null && <>
                <span className="tap" onClick={() => togglePin(m)} title={m.pinned ? '取消置顶' : '置顶'} style={{ fontSize: 12, cursor: 'pointer', opacity: m.pinned ? 1 : 0.4 }}>📌</span>
                <span className="tap" onClick={() => delMem(m)} title="删除" style={{ fontSize: 12, cursor: 'pointer', color: '#D95A5A', opacity: 0.7 }}>🗑</span>
              </>}
            </div>
          </div>
          <p style={{ fontSize: 12.5, color: t.text1, lineHeight: 1.8, margin: 0, fontFamily: 'inherit' }}>{m.content}</p>
        </Card>
      ))}
    </div>
  );
}

function TimelinePage({ t }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const CHAR_MAP = { yu: { name: '沈屿', accent: '#e0879f' } };

  useEffect(() => {
    (async () => {
      const all = [];
      try {
        const charIds = ['yu'];
        const [momentsR, diariesR, chatsR, ...emotionRs] = await Promise.all([
          fetch(`${BACKEND}/moments`).then(r => r.json()).catch(() => ({})),
          fetch(`${BACKEND}/mood-logs?limit=20`).then(r => r.json()).catch(() => ({})),
          fetch(`${BACKEND}/recent-chats?limit=20`).then(r => r.json()).catch(() => ({})),
          ...charIds.map(cid => fetch(`${BACKEND}/emotions/${cid}`).then(r => r.json()).catch(() => ({}))),
        ]);
        for (const c of (chatsR.chats || []).slice(0, 18)) {
          const ch = CHAR_MAP[c.character_id] || CHAR_MAP.yu;
          all.push({ type: 'chat', char: c.role === 'user' ? '小满' : (c.character_name || ch.name), accent: c.role === 'user' ? t.acc : ch.accent, content: (c.content || '').slice(0, 60), time: c.created_at || '', label: c.role === 'user' ? `对${ch.name}说` : '聊天' });
        }
        for (const m of (momentsR.moments || []).slice(0, 15)) {
          const ch = CHAR_MAP[m.char_id] || CHAR_MAP.yu;
          all.push({ type: 'moment', char: m.char_name || ch.name, accent: m.accent || ch.accent, content: (m.content || '').slice(0, 80), time: m.created_at || '', label: '朋友圈' });
        }
        emotionRs.forEach((emotionsR, ci) => {
          const ch = CHAR_MAP[charIds[ci]] || CHAR_MAP.yu;
          for (const l of (emotionsR.logs || []).slice(0, 8)) {
            all.push({ type: 'emotion', char: ch.name, accent: ch.accent, content: l.monologue ? l.monologue.slice(0, 60) : l.emotion, time: l.created_at || '', label: l.activity || '心跳' });
          }
        });
        for (const d of (diariesR.logs || []).slice(0, 10)) {
          const ch = CHAR_MAP[d.character_id] || CHAR_MAP.yu;
          all.push({ type: 'diary', char: d.author_name || ch.name, accent: ch.accent, content: (d.content || '').slice(0, 60), time: d.created_at || '', label: '日记' });
        }
      } catch {}
      all.sort((a, b) => (b.time || '').localeCompare(a.time || ''));
      setEvents(all.slice(0, 40));
      setLoading(false);
    })();
  }, []);

  const fmtTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
  };

  let lastDate = '';

  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', padding: '20px 16px 40px', maxWidth: 440, margin: '0 auto', width: '100%' }}>
      <div style={{ fontSize: 10, color: t.text3, letterSpacing: '0.14em', marginBottom: 4 }}>TIMELINE</div>
      <div style={{ fontSize: 18, fontWeight: 400, color: t.text1, marginBottom: 18, fontFamily: 'inherit' }}>时间线</div>

      {loading ? <div style={{ textAlign: 'center', color: t.text3, fontSize: 12, marginTop: 40 }}>…</div> : events.length === 0 ? (
        <div style={{ textAlign: 'center', color: t.text3, fontSize: 12, marginTop: 40, fontStyle: 'italic' }}>还没有故事</div>
      ) : (
        // 无框：左侧细轨 + 圆点，纯文本行；限定高度，在隐形边框内滚动
        <div className="hs" style={{ maxHeight: 'calc(100dvh - 190px)', overflowY: 'auto', position: 'relative', border: '1px solid transparent', paddingLeft: 4 }}>
          <div style={{ position: 'absolute', left: 6, top: 2, bottom: 2, width: 1, backgroundColor: `${t.acc}22` }} />
          {events.map((ev, i) => {
            const dateStr = (ev.time || '').slice(0, 10);
            const showDate = dateStr && dateStr !== lastDate;
            if (showDate) lastDate = dateStr;
            return (
              <React.Fragment key={i}>
                {showDate && <div style={{ fontSize: 9, color: t.text3, letterSpacing: '0.1em', padding: '0 0 8px 22px', margin: `${i > 0 ? 14 : 2}px 0 0` }}>{dateStr}</div>}
                <div style={{ position: 'relative', padding: '0 2px 16px 22px' }}>
                  <div style={{ position: 'absolute', left: 6, top: 4, width: 7, height: 7, borderRadius: '50%', backgroundColor: ev.accent, transform: 'translateX(-50%)' }} />
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: ev.accent, fontFamily: 'inherit' }}>{ev.char}</span>
                    <span style={{ fontSize: 9, color: t.text3 }}>{ev.label}</span>
                    <span style={{ fontSize: 8, color: t.text3, marginLeft: 'auto', flexShrink: 0 }}>{fmtTime(ev.time)}</span>
                  </div>
                  <p style={{ fontSize: 12, color: t.text2, lineHeight: 1.7, margin: 0, fontFamily: 'inherit' }}>{ev.content}{ev.content.length >= 60 ? '…' : ''}</p>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}

const MINIMAX_VOICES = [
  { id: 'male-qn-qingse', name: '青涩青年' },
  { id: 'male-qn-jingying', name: '精英青年' },
  { id: 'male-qn-badao', name: '霸道少年' },
  { id: 'male-qn-daxuesheng', name: '青年大学生' },
  { id: 'presenter_male', name: '男主持' },
  { id: 'audiobook_male_1', name: '有声书男声1' },
  { id: 'audiobook_male_2', name: '有声书男声2' },
  { id: 'clever_boy', name: '阳光男孩' },
];
const MINIMAX_EMOTIONS = [
  { id: 'neutral', name: '平静' }, { id: 'happy', name: '开心' }, { id: 'sad', name: '低落' },
  { id: 'angry', name: '生气' }, { id: 'fearful', name: '紧张' }, { id: 'surprised', name: '惊讶' },
];
const VOICE_DEFAULTS = {
  yu: { voice_id: 'male-qn-qingse', speed: 0.9, pitch: 0, emotion: 'neutral' },
};

function PrivateLifePage({ t }) {
  const CH = { yu: { name: '沈屿', accent: '#e0879f' } };
  const [cid, setCid] = useState('yu');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const cidRef = useRef(cid);
  const load = async (c) => {
    cidRef.current = c;
    setLoading(true); setGenerating(false);
    let got = [];
    try {
      const r = await fetch(`${BACKEND}/diary`);
      const d = await r.json();
      got = d.logs || [];
      setLogs(got);
    } catch { setLogs([]); }
    setLoading(false);
    // 没有记录就触发即时生成（后端同步 spawn claude -p 生成一条，约 20-90 秒）。
    // generate 现在是真生成：拿到 {ok,id} 直接重拉一次立刻显示；只有还在生成(pending)才轮询兜底。
    // 任何分支结束都会落到 setGenerating(false)，冷启动绝不无限「正在生活中…」。
    if (got.length === 0) {
      setGenerating(true);
      let gen = {};
      try {
        const gr = await fetch(`${BACKEND}/diary/generate`, { method: 'POST' });
        gen = gr.ok ? await gr.json() : {};
      } catch { gen = {}; }
      if (cidRef.current !== c) return;
      // 后端已写好这条：直接重拉，秒出，不用轮询。
      if (gen.id) {
        try {
          const r = await fetch(`${BACKEND}/diary`);
          const d = await r.json();
          if (cidRef.current === c) { setLogs(d.logs || []); setGenerating(false); }
        } catch { if (cidRef.current === c) setGenerating(false); }
        return;
      }
      // 还在生成(别的请求在跑 / 本次未成)→ 轮询兜底，最多 22 次（~88 秒），到点显示空态而非死等。
      let tries = 0;
      const poll = setInterval(async () => {
        tries++;
        if (cidRef.current !== c || tries > 22) { clearInterval(poll); if (cidRef.current === c) setGenerating(false); return; }
        try {
          const r = await fetch(`${BACKEND}/diary`);
          const d = await r.json();
          if (d.logs?.length) { if (cidRef.current === c) { setLogs(d.logs); setGenerating(false); } clearInterval(poll); }
        } catch {}
      }, 4000);
    }
  };
  useEffect(() => { load(cid); }, [cid]);
  const acc = CH[cid].accent;
  const renderEntry = (text) => (text || '').replace(/（没有写[""]?无[""]?）/g, '').split('\n').filter(l => l.trim()).map((line, i) => {
    const m = line.match(/^【([^】]+)】[:：]?\s*(.*)$/);
    if (m) return <div key={i} style={{ marginBottom: 5, lineHeight: 1.6 }}><span style={{ fontSize: 10, color: acc, fontWeight: 700 }}>{m[1]}</span>{m[2] ? <span style={{ fontSize: 12.5, color: t.text1, marginLeft: 6 }}>{m[2]}</span> : null}</div>;
    return <div key={i} style={{ fontSize: 12.5, color: t.text1, lineHeight: 1.7, marginBottom: 4 }}>{line}</div>;
  });
  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', padding: '20px 16px 40px', maxWidth: 440, margin: '0 auto', width: '100%', textAlign: 'left' }}>
      <div style={{ fontSize: 10, color: t.text3, letterSpacing: '0.14em', marginBottom: 4 }}>DIARY</div>
      <div style={{ fontSize: 18, fontWeight: 400, color: t.text1, marginBottom: 4, fontFamily: 'inherit' }}>屿的日记</div>
      <div style={{ fontSize: 11, color: t.text3, marginBottom: 16 }}>你不在的时候，他们独自在做什么</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {Object.entries(CH).map(([id, c]) => (
          <div key={id} className="tap" onClick={() => setCid(id)} style={{ flex: 1, textAlign: 'center', padding: '8px 0', borderRadius: t.radius > 0 ? 10 : 0, cursor: 'pointer', backgroundColor: cid === id ? `${c.accent}20` : 'transparent', border: `1px solid ${cid === id ? c.accent : t.border}` }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: cid === id ? c.accent : t.text3, fontFamily: 'inherit' }}>{c.name}</span>
          </div>
        ))}
      </div>
      {loading ? <div style={{ textAlign: 'center', color: t.text3, fontSize: 12, marginTop: 40 }}>…</div> : logs.length === 0 ? (
        <div style={{ textAlign: 'center', color: t.text3, fontSize: 12, marginTop: 40, fontStyle: 'italic' }}>
          {generating ? `${CH[cid].name} 正在生活中…（首次生成约半分钟，稍等）` : '还没有记录'}
        </div>
      ) : logs.map((l, i) => (
        <Card key={l.id || i} t={t} style={{ padding: '12px 14px', marginBottom: 12, borderLeft: `3px solid ${acc}` }}>
          {renderEntry(l.content)}
          <div style={{ fontSize: 8, color: t.text3, marginTop: 6, textAlign: 'right' }}>{(l.created_at || '').slice(5, 16).replace('T', ' ')}</div>
        </Card>
      ))}
    </div>
  );
}

function VoiceSettingsPage({ t }) {
  const [prefs, setPrefs] = useState(() => { try { return JSON.parse(localStorage.getItem('companion_voice_prefs') || '{}'); } catch { return {}; } });
  const [previewing, setPreviewing] = useState('');
  const audioRef = useRef(null);
  const getP = (cid) => ({ ...VOICE_DEFAULTS[cid], ...(prefs[cid] || {}) });
  const update = (cid, key, val) => {
    setPrefs(prev => {
      const merged = { ...VOICE_DEFAULTS[cid], ...(prev[cid] || {}), [key]: val };
      const next = { ...prev, [cid]: merged };
      try { localStorage.setItem('companion_voice_prefs', JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const resetChar = (cid) => {
    setPrefs(prev => { const next = { ...prev }; delete next[cid]; try { localStorage.setItem('companion_voice_prefs', JSON.stringify(next)); } catch {} return next; });
  };
  const preview = async (cid) => {
    if (audioRef.current) { audioRef.current.pause(); }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setPreviewing(cid);
    const p = getP(cid);
    const sample = { yu: '宝，今天有没有好好吃饭？我给你留了蛋糕。' }[cid] || '在听吗？';
    try {
      const res = await fetch(`${BACKEND}/tts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: sample, character_id: cid, ...p }) });
      const d = res.ok ? await res.json() : {};
      if (d.audio) { const a = new Audio(d.audio); audioRef.current = a; a.onended = () => setPreviewing(''); a.onerror = () => setPreviewing(''); a.play(); }
      else if (window.speechSynthesis) { const u = new SpeechSynthesisUtterance(sample); u.lang = 'zh-CN'; u.rate = p.speed || 1; u.onend = () => setPreviewing(''); window.speechSynthesis.speak(u); }
      else setPreviewing('');
    } catch { setPreviewing(''); }
  };
  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', padding: '20px 16px 40px', maxWidth: 440, margin: '0 auto', width: '100%' }}>
      <div style={{ fontSize: 10, color: t.text3, letterSpacing: '0.14em', marginBottom: 4 }}>VOICE</div>
      <div style={{ fontSize: 18, fontWeight: 400, color: t.text1, marginBottom: 4, fontFamily: 'inherit' }}>声音设置</div>
      <div style={{ fontSize: 11, color: t.text3, marginBottom: 18 }}>挑他们的嗓音、语速、音调，点试听。改完即时保存。</div>
      {CHARACTERS.map(c => {
        const p = getP(c.id);
        return (
          <Card key={c.id} t={t} style={{ padding: '14px 16px', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: c.accent, fontFamily: 'inherit' }}>{c.name}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="tap" onClick={() => preview(c.id)} style={{ fontSize: 11, padding: '5px 14px', borderRadius: t.radius > 0 ? 16 : 0, border: `1px solid ${c.accent}`, background: previewing === c.id ? `${c.accent}20` : 'transparent', color: c.accent, cursor: 'pointer', fontFamily: 'inherit' }}>{previewing === c.id ? '播放中…' : '▶ 试听'}</button>
                <button className="tap" onClick={() => resetChar(c.id)} style={{ fontSize: 11, padding: '5px 10px', borderRadius: t.radius > 0 ? 16 : 0, border: `1px solid ${t.border}`, background: 'transparent', color: t.text3, cursor: 'pointer', fontFamily: 'inherit' }}>重置</button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <label style={{ flex: 1, fontSize: 10, color: t.text3 }}>音色
                <select value={p.voice_id} onChange={e => update(c.id, 'voice_id', e.target.value)} style={{ width: '100%', marginTop: 4, padding: '6px 8px', fontSize: 12, borderRadius: t.radius > 0 ? 8 : 0, border: `1px solid ${t.border}`, background: 'rgba(255,255,255,0.5)', color: t.text1, fontFamily: 'inherit' }}>
                  {MINIMAX_VOICES.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </label>
              <label style={{ flex: 1, fontSize: 10, color: t.text3 }}>情绪
                <select value={p.emotion} onChange={e => update(c.id, 'emotion', e.target.value)} style={{ width: '100%', marginTop: 4, padding: '6px 8px', fontSize: 12, borderRadius: t.radius > 0 ? 8 : 0, border: `1px solid ${t.border}`, background: 'rgba(255,255,255,0.5)', color: t.text1, fontFamily: 'inherit' }}>
                  {MINIMAX_EMOTIONS.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </label>
            </div>
            <div style={{ fontSize: 10, color: t.text3, marginBottom: 2 }}>语速 {p.speed?.toFixed(2)}</div>
            <input type="range" min="0.5" max="2" step="0.05" value={p.speed} onChange={e => update(c.id, 'speed', parseFloat(e.target.value))} style={{ width: '100%', accentColor: c.accent, marginBottom: 8 }} />
            <div style={{ fontSize: 10, color: t.text3, marginBottom: 2 }}>音调 {p.pitch}</div>
            <input type="range" min="-12" max="12" step="1" value={p.pitch} onChange={e => update(c.id, 'pitch', parseInt(e.target.value))} style={{ width: '100%', accentColor: c.accent }} />
          </Card>
        );
      })}
    </div>
  );
}

function PomodoroPage({ t }) {
  const FOCUS_PRESETS = [15, 25, 30, 45, 60];
  const BREAK_PRESETS = [5, 10, 15];
  const [focusDuration, setFocusDuration] = useState(25);
  const [breakDuration, setBreakDuration] = useState(5);
  const [minutes, setMinutes] = useState(25);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState('focus');
  const [sessions, setSessions] = useState(0);
  const [companions, setCompanions] = useState(['yu']);
  const [encouragements, setEncouragements] = useState([]);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setSeconds(s => {
        if (s === 0) {
          setMinutes(m => {
            if (m === 0) {
              clearInterval(intervalRef.current);
              setRunning(false);
              if (mode === 'focus') {
                setSessions(p => p + 1);
                setMode('break'); setMinutes(breakDuration); setSeconds(0);
                fetchEncouragements('focus_done');
              } else {
                setMode('focus'); setMinutes(focusDuration); setSeconds(0);
                fetchEncouragements('break_done');
              }
              return 0;
            }
            return m - 1;
          });
          return 59;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [running, mode, focusDuration, breakDuration]);

  const fetchEncouragements = async (event) => {
    const results = [];
    for (const cid of companions) {
      try {
        const msg = event === 'focus_done' ? `我刚完成了一个${focusDuration}分钟的番茄钟专注时间！夸夸我，一句话就好` : event === 'start' ? `我要开始${focusDuration}分钟的番茄钟专注了！给我一句鼓励，简短一点` : '休息结束了，我要开始下一个番茄钟了！给我一句鼓励，简短一点';
        const r = await fetch(`${BACKEND}/chat/quick`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ character_id: cid, message: msg }),
        });
        const d = await r.json();
        if (d.reply) results.push({ cid, text: d.reply });
      } catch {}
    }
    setEncouragements(results);
  };

  const toggleCompanion = (cid) => {
    setCompanions(prev => prev.includes(cid) ? (prev.length > 1 ? prev.filter(c => c !== cid) : prev) : [...prev, cid]);
  };

  const toggle = () => {
    if (!running && minutes === focusDuration && seconds === 0 && mode === 'focus') fetchEncouragements('start');
    setRunning(r => !r);
  };

  const reset = () => { setRunning(false); clearInterval(intervalRef.current); setMode('focus'); setMinutes(focusDuration); setSeconds(0); setEncouragements([]); };
  const pad = n => String(n).padStart(2, '0');
  const primaryChar = CHARACTERS.find(c => c.id === companions[0]) || CHARACTERS[0];
  const totalSecs = mode === 'focus' ? focusDuration * 60 : breakDuration * 60;
  const progress = 1 - (minutes * 60 + seconds) / totalSecs;
  const circumference = 2 * Math.PI * 90;

  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', padding: '24px 18px', maxWidth: 440, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ fontSize: 10, color: t.text3, letterSpacing: '0.14em', marginBottom: 6, alignSelf: 'flex-start' }}>POMODORO</div>
      <div style={{ fontSize: 9, color: t.text3, marginBottom: 16, alignSelf: 'flex-start' }}>
        {mode === 'focus' ? '🍅 专注中' : '☕ 休息中'} · 已完成 {sessions} 个番茄
      </div>

      {!running && (
        <div style={{ width: '100%', marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: t.text3, marginBottom: 6, letterSpacing: '0.06em' }}>专注时长</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {FOCUS_PRESETS.map(m => (
              <div key={m} className="tap" onClick={() => { setFocusDuration(m); if (mode === 'focus') setMinutes(m); }} style={{
                padding: '6px 14px', borderRadius: t.radius > 0 ? 16 : 0, fontSize: 12, cursor: 'pointer',
                backgroundColor: focusDuration === m ? `${primaryChar.accent}20` : 'transparent',
                color: focusDuration === m ? primaryChar.accent : t.text3,
                border: `1px solid ${focusDuration === m ? primaryChar.accent : t.border}`,
                fontFamily: 'inherit', fontWeight: focusDuration === m ? 600 : 400,
              }}>{m}min</div>
            ))}
          </div>
          <div style={{ fontSize: 10, color: t.text3, marginBottom: 6, letterSpacing: '0.06em' }}>休息时长</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
            {BREAK_PRESETS.map(m => (
              <div key={m} className="tap" onClick={() => { setBreakDuration(m); if (mode === 'break') setMinutes(m); }} style={{
                padding: '6px 14px', borderRadius: t.radius > 0 ? 16 : 0, fontSize: 12, cursor: 'pointer',
                backgroundColor: breakDuration === m ? `${primaryChar.accent}20` : 'transparent',
                color: breakDuration === m ? primaryChar.accent : t.text3,
                border: `1px solid ${breakDuration === m ? primaryChar.accent : t.border}`,
                fontFamily: 'inherit', fontWeight: breakDuration === m ? 600 : 400,
              }}>{m}min</div>
            ))}
          </div>
        </div>
      )}

      <div style={{ position: 'relative', width: 200, height: 200, marginBottom: 24 }}>
        <svg width="200" height="200" viewBox="0 0 200 200" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="100" cy="100" r="90" fill="none" stroke={t.border} strokeWidth="3" opacity="0.3" />
          <circle cx="100" cy="100" r="90" fill="none" stroke={primaryChar.accent} strokeWidth="3" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: 42, fontWeight: 300, color: t.text1, fontFamily: 'inherit', letterSpacing: '0.05em' }}>{pad(minutes)}:{pad(seconds)}</div>
          <div style={{ fontSize: 10, color: t.text3, marginTop: 4 }}>{mode === 'focus' ? 'FOCUS' : 'BREAK'}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <button className="tap" onClick={toggle} style={{ padding: '10px 28px', fontSize: 13, backgroundColor: running ? 'transparent' : primaryChar.accent, color: running ? t.text2 : '#fff', border: running ? `1px solid ${t.border}` : 'none', borderRadius: t.radius > 0 ? 24 : 0, cursor: 'pointer', fontFamily: 'inherit' }}>{running ? '暂停' : '开始'}</button>
        <button className="tap" onClick={reset} style={{ padding: '10px 20px', fontSize: 13, backgroundColor: 'transparent', color: t.text3, border: `1px solid ${t.border}`, borderRadius: t.radius > 0 ? 24 : 0, cursor: 'pointer', fontFamily: 'inherit' }}>重置</button>
      </div>

      <div style={{ fontSize: 10, color: t.text3, marginBottom: 6, letterSpacing: '0.06em' }}>陪伴角色（可多选）</div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        {CHARACTERS.map(c => (
          <div key={c.id} className="tap" onClick={() => toggleCompanion(c.id)} style={{ borderRadius: '50%', cursor: 'pointer', boxShadow: companions.includes(c.id) ? `0 0 0 2px ${c.accent}` : 'none', opacity: companions.includes(c.id) ? 1 : 0.4 }}><CharAvatar c={c} size={32} /></div>
        ))}
      </div>

      {encouragements.length > 0 && encouragements.map((enc, i) => {
        const ch = CHARACTERS.find(c => c.id === enc.cid) || CHARACTERS[0];
        return (
          <Card key={i} t={t} style={{ padding: '12px 16px', width: '100%', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <CharAvatar c={ch} size={14} />
              <span style={{ fontSize: 10, color: t.text3 }}>{ch.name}</span>
            </div>
            <p style={{ fontSize: 13, color: t.text1, lineHeight: 1.8, margin: 0, fontFamily: 'inherit', fontStyle: 'italic' }}>{enc.text}</p>
          </Card>
        );
      })}
    </div>
  );
}

function SharePage({ t }) {
  const [shares, setShares] = useState([]);
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [inputs, setInputs] = useState({});

  const load = async () => {
    try {
      const res = await fetch(`${BACKEND}/shares`);
      const data = await res.json();
      if (data.shares) setShares(data.shares);
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const post = async () => {
    if (!url.trim() || busy) return;
    setBusy(true);
    try {
      await fetch(`${BACKEND}/shares`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), note: note.trim() || null }),
      });
      setUrl(''); setNote('');
      setTimeout(load, 600);          // 拿到解析结果
      setTimeout(load, 4000);         // 拿到角色评论
    } catch {}
    setBusy(false);
  };

  const comment = async (id) => {
    const txt = inputs[id]; if (!txt?.trim()) return;
    const optimistic = { id: Date.now(), share_id: id, author: '小满', content: txt };
    setShares(prev => prev.map(s => s.id === id ? { ...s, share_comments: [...(s.share_comments || []), optimistic] } : s));
    setInputs({ ...inputs, [id]: '' });
    try {
      await fetch(`${BACKEND}/shares/${id}/comment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ author: '小满', content: txt }) });
      setTimeout(load, 3500);
    } catch {}
  };

  const nowPlaying = shares.find(s => s.kind === 'music' && s.embed_id);

  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', padding: '24px 18px 48px', maxWidth: 460, margin: '0 auto', width: '100%' }}>
      <h2 style={{ fontSize: 22, fontWeight: t.isPixel ? 700 : 400, color: t.text1, margin: '0 0 4px', fontFamily: 'inherit' }}>分享空间</h2>
      <p style={{ fontSize: 11, color: t.text3, letterSpacing: '0.08em', marginBottom: 20 }}>一起听歌 · 分享好物，他们都会来看</p>

      <Card t={t} style={{ padding: '16px', marginBottom: 20 }}>
        <input value={url} onChange={e => setUrl(e.target.value)} placeholder="粘贴网易云歌曲 / 小红书 / 抖音 链接…" style={{ width: '100%', padding: '9px 12px', fontSize: 13, borderRadius: t.radius > 0 ? 12 : 0, border: t.isPixel ? `2px solid ${t.border}` : `1px solid ${t.border}`, backgroundColor: 'rgba(255,255,255,0.4)', outline: 'none', color: t.text1, fontFamily: 'inherit', marginBottom: 8 }} />
        <input value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && post()} placeholder="想说点什么…（可选）" style={{ width: '100%', padding: '9px 12px', fontSize: 13, borderRadius: t.radius > 0 ? 12 : 0, border: t.isPixel ? `2px solid ${t.border}` : `1px solid ${t.border}`, backgroundColor: 'rgba(255,255,255,0.4)', outline: 'none', color: t.text1, fontFamily: 'inherit', marginBottom: 10 }} />
        <button className="tap" onClick={post} disabled={busy} style={{ width: '100%', backgroundColor: t.acc, color: '#fff', border: 'none', borderRadius: t.radius > 0 ? 20 : 0, padding: '10px', fontSize: 14, fontWeight: 'bold', cursor: 'pointer', opacity: busy ? 0.6 : 1, fontFamily: 'inherit' }}>{busy ? '分享中…' : '分享'}</button>
        <p style={{ fontSize: 10, color: t.text3, marginTop: 8, marginBottom: 0, fontFamily: 'inherit' }}>💡 网易云：歌曲页右上「分享」→ 复制链接，粘贴进来就能一起听（带《歌名》的分享文案最好，他们会评这首歌）</p>
      </Card>

      {nowPlaying && (
        <Card t={t} style={{ padding: '16px', marginBottom: 18, animation: 'fadeIn 0.3s ease', border: t.isPixel ? `2px solid ${t.acc}` : `1px solid ${t.acc}66` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 16 }}>🎧</span>
            <div style={{ fontSize: 12, fontWeight: 700, color: t.text1, fontFamily: 'inherit' }}>正在一起听{nowPlaying.title ? ` · 《${nowPlaying.title}》` : ''}</div>
          </div>
          {nowPlaying.note && <p style={{ fontSize: 13, color: t.text2, lineHeight: 1.7, margin: '0 0 10px', fontFamily: 'inherit' }}>{nowPlaying.note}</p>}
          <iframe title={'np-' + nowPlaying.id} frameBorder="0" width="100%" height="86" src={`https://music.163.com/outchain/player?type=2&id=${nowPlaying.embed_id}&auto=0&height=66`} style={{ borderRadius: t.radius > 0 ? 10 : 0, marginBottom: 10, border: t.isPixel ? `2px solid ${t.border}` : 'none' }} />
          {(nowPlaying.share_comments || []).length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(nowPlaying.share_comments || []).map(c => (
                <div key={c.id} style={{ fontSize: 12.5, lineHeight: 1.6, color: t.text1, fontFamily: 'inherit', backgroundColor: 'rgba(255,255,255,0.35)', borderRadius: t.radius > 0 ? 10 : 0, padding: '6px 10px' }}>
                  <span style={{ fontWeight: 700, color: t.acc }}>{c.author}</span>　{c.content}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {loading && <p style={{ fontSize: 12, color: t.text3, textAlign: 'center', fontFamily: 'inherit' }}>加载中…</p>}

      {shares.filter(s => s.id !== nowPlaying?.id).map(s => {
        const comments = s.share_comments || [];
        return (
          <Card key={s.id} t={t} style={{ padding: '16px', marginBottom: 16, animation: 'fadeIn 0.3s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 30, height: 30, borderRadius: t.isPixel ? 0 : '50%', border: `1.5px solid ${t.acc}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: t.acc, fontWeight: 700, flexShrink: 0 }}>Y</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: t.text1, fontFamily: 'inherit' }}>小满分享了{s.kind === 'music' ? (s.title ? `《${s.title}》🎵` : '一首歌 🎵') : s.kind === 'video' ? '一个视频 🎬' : '一个链接 🔗'}</div>
            </div>
            {s.note && <p style={{ fontSize: 14, color: t.text1, lineHeight: 1.8, margin: '0 0 10px', fontFamily: 'inherit' }}>{s.note}</p>}

            {s.kind === 'music' && s.embed_id ? (
              <iframe title={s.id} frameBorder="0" marginWidth="0" marginHeight="0" width="100%" height="86" src={`https://music.163.com/outchain/player?type=2&id=${s.embed_id}&auto=0&height=66`} style={{ borderRadius: t.radius > 0 ? 8 : 0, marginBottom: 10, border: t.isPixel ? `2px solid ${t.border}` : 'none' }} />
            ) : (
              <a href={s.url} target="_blank" rel="noreferrer" style={{ display: 'block', fontSize: 12, color: t.acc, wordBreak: 'break-all', padding: '8px 10px', backgroundColor: 'rgba(0,0,0,0.04)', borderRadius: t.radius > 0 ? 8 : 0, marginBottom: 10, textDecoration: 'none', fontFamily: 'inherit' }}>🔗 {s.url}</a>
            )}

            {comments.length > 0 && (
              <div style={{ backgroundColor: 'rgba(0,0,0,0.04)', borderRadius: t.radius > 0 ? 8 : 0, padding: '8px 12px', marginBottom: 10 }}>
                {comments.map(c => (
                  <div key={c.id} style={{ fontSize: 12, lineHeight: 1.6, color: t.text1, marginBottom: 3, fontFamily: 'inherit' }}>
                    <span style={{ fontWeight: 700, color: t.acc }}>{c.author}：</span>{c.content}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="text" value={inputs[s.id] || ''} onChange={e => setInputs({ ...inputs, [s.id]: e.target.value })} onKeyDown={e => e.key === 'Enter' && comment(s.id)} placeholder="说点什么…" style={{ flex: 1, padding: '7px 12px', fontSize: 12, borderRadius: t.radius > 0 ? 20 : 0, border: t.isPixel ? `2px solid ${t.border}` : `1px solid ${t.border}`, backgroundColor: 'rgba(255,255,255,0.4)', outline: 'none', color: t.text1, fontFamily: 'inherit' }} />
              <button className="tap" onClick={() => comment(s.id)} style={{ backgroundColor: inputs[s.id] ? t.acc : 'transparent', color: inputs[s.id] ? '#fff' : t.text3, border: t.isPixel ? `2px solid ${t.border}` : `1px solid ${inputs[s.id] ? t.acc : t.border}`, padding: '6px 14px', borderRadius: t.radius > 0 ? 20 : 0, fontSize: 12, cursor: 'pointer', fontWeight: 'bold', fontFamily: 'inherit' }}>回复</button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// 极简线条功能图标（stroke=currentColor 风格，黑白灰）
function FeatIcon({ id, color = 'currentColor', size = 22 }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (id) {
    case 'playground': return <svg {...p}><rect x="3.5" y="3.5" width="17" height="17" rx="3" /><path d="M10 9l5 3-5 3z" fill={color} stroke="none" /></svg>;
    case 'book': return <svg {...p}><path d="M12 5.5C10 4 6.5 3.8 4 4.5v13c2.5-.7 6-.5 8 1 2-1.5 5.5-1.7 8-1v-13c-2.5-.7-6-.5-8 1z" /><path d="M12 5.5v13" /></svg>;
    case 'story': return <svg {...p}><path d="M5 19c1-5 5-9 10-12" /><path d="M15 7l3 1 1-3" /><path d="M5 19l3-1" /></svg>;
    case 'memory': return <svg {...p}><path d="M12 20s-7-4.5-7-9.5A3.5 3.5 0 0 1 12 8a3.5 3.5 0 0 1 7 2.5C19 15.5 12 20 12 20z" /></svg>;
    case 'lifetick': return <svg {...p}><path d="M3 12h4l2-6 4 12 2-6h6" /></svg>;
    case 'emotions': return <svg {...p}><path d="M3 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 14c2-2 4-2 6 0s4 2 6 0 4-2 6 0" /></svg>;
    case 'question': return <svg {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>;
    case 'privatelife': return <svg {...p}><path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z" /></svg>;
    case 'mood': return <svg {...p}><path d="M5 4h11l3 3v13H5z" /><path d="M9 9h7M9 13h7M9 17h4" /></svg>;
    case 'timeline': return <svg {...p}><path d="M6 4v16" /><circle cx="6" cy="8" r="1.5" /><circle cx="6" cy="15" r="1.5" /><path d="M10 8h8M10 15h8" /></svg>;
    case 'period': return <svg {...p}><path d="M12 3c3 4 5 6.5 5 9a5 5 0 0 1-10 0c0-2.5 2-5 5-9z" /></svg>;
    case 'nest': return <svg {...p}><path d="M4 11l8-6 8 6" /><path d="M6 10v9h12v-9" /></svg>;
    case 'pomodoro': return <svg {...p}><circle cx="12" cy="13" r="7" /><path d="M12 13V9M10 4h4" /></svg>;
    case 'share': return <svg {...p}><path d="M5 14v-2a7 7 0 0 1 14 0v2" /><rect x="3.5" y="13" width="3.5" height="6" rx="1.2" /><rect x="17" y="13" width="3.5" height="6" rx="1.2" /></svg>;
    case 'voicesettings': return <svg {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M6 11a6 6 0 0 0 12 0M12 17v3" /></svg>;
    case 'ledger': return <svg {...p}><circle cx="12" cy="12" r="8" /><path d="M12 8v8M13 10h-2.5a1.5 1.5 0 0 0 0 3h2a1.5 1.5 0 0 1 0 3H10" /></svg>;
    case 'todo': return <svg {...p}><path d="M4 6l1.5 1.5L8 5M4 13l1.5 1.5L8 12M4 19.5L5.5 21 8 18.5M11 6h9M11 13h9M11 19h7" /></svg>;
    case 'dashboard': return <svg {...p}><path d="M4 20V11M10 20V4M16 20v-6M2 20h20" /></svg>;
    case 'wallet': return <svg {...p}><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M16 14h2" /></svg>;
    case 'avatars': return <svg {...p}><circle cx="12" cy="9" r="3.3" /><path d="M5.5 20c0-3.4 2.9-5.8 6.5-5.8s6.5 2.4 6.5 5.8" /></svg>;
    case 'group': return <svg {...p}><circle cx="9" cy="9" r="3" /><path d="M3.5 19c0-3 2.4-5 5.5-5s5.5 2 5.5 5" /><path d="M16 6.5a3 3 0 0 1 0 5.5M18 19c0-2-.7-3.6-2-4.6" /></svg>;
    case 'promises': return <svg {...p}><path d="M9 12l2 2 4-4" /><path d="M12 3l2.5 1.7L17.5 4l.8 3 2.7 1.5-1.5 2.7 1.5 2.7-2.7 1.5-.8 3-3-.7L12 21l-2.5-1.7L6.5 20l-.8-3-2.7-1.5 1.5-2.7L3 10l2.7-1.5.8-3 3 .7z" /></svg>;
    case 'dreams': return <svg {...p}><path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z" /><path d="M15 4.5l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z" /></svg>;
    case 'moments': return <svg {...p}><circle cx="12" cy="12" r="3.4" /><path d="M3 12a9 9 0 0 1 9-9M21 12a9 9 0 0 1-9 9" /></svg>;
    case 'home': return <svg {...p}><path d="M4 11l8-6 8 6" /><path d="M6 10v9h12v-9" /></svg>;
    case 'features': return <svg {...p}><rect x="4" y="4" width="6" height="6" rx="1.5" /><rect x="14" y="4" width="6" height="6" rx="1.5" /><rect x="4" y="14" width="6" height="6" rx="1.5" /><rect x="14" y="14" width="6" height="6" rx="1.5" /></svg>;
    case 'notepad': return <svg {...p}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 3v3h6V3M9 11h6M9 15h4" /></svg>;
    case 'academic': return <svg {...p}><path d="M12 4L2 9l10 5 10-5-10-5z" /><path d="M6 11v5c0 1 3 2.5 6 2.5s6-1.5 6-2.5v-5M21 9v5" /></svg>;
    case 'observe': return <svg {...p}><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" /><circle cx="12" cy="12" r="2.6" /></svg>;
    case 'ncm': return <svg {...p}><circle cx="7" cy="17" r="2.4" /><circle cx="17" cy="15" r="2.4" /><path d="M9.4 17V6l10-2v11" /></svg>;
    case 'journal': return <svg {...p}><path d="M6 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /><path d="M8 3v18M11 8h4M11 12h4" /></svg>;
    case 'toy': return <svg {...p}><path d="M7 8a5 5 0 0 1 10 0v8a3 3 0 0 1-6 0V9" /></svg>;
    case 'meprofile': return <svg {...p}><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20c0-3.4 2.9-5.8 6.5-5.8S18.5 16.6 18.5 20" /></svg>;
    case 'private': return <svg {...p}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;
    case 'treehole': return <svg {...p}><path d="M12 22v-5" /><path d="M12 17c-4.4 0-7-2.7-7-7a7 7 0 0 1 14 0c0 4.3-2.6 7-7 7z" /><ellipse cx="12" cy="10" rx="2.1" ry="2.7" fill={color} stroke="none" /></svg>;
    default: return <svg {...p}><circle cx="12" cy="12" r="8" /></svg>;
  }
}
// 发现页按类分组（私人生活/白板/观察/梦境 4 个角色私下写的合并进「Ta的本子」journal 一个入口）
const DISCOVER_GROUPS = [
  { g: '陪伴日常', items: [
    { id: 'nest', label: '小窝' }, { id: 'book', label: '一起看书' }, { id: 'share', label: '一起听' }, { id: 'story', label: 'Story' }, { id: 'question', label: '今日一问' },
  ] },
  { g: 'Ta 的心事', items: [
    { id: 'inner', label: '内心' }, { id: 'journal', label: 'Ta的本子' }, { id: 'memory', label: '记忆长河' }, { id: 'timeline', label: '时间线' }, { id: 'promises', label: '承诺' }, { id: 'emotions', label: '潮汐心海' }, { id: 'lifetick', label: '心跳' },
  ] },
  { g: '记录 · 工具', items: [
    { id: 'playground', label: 'Playground' }, { id: 'mood', label: '日记' }, { id: 'academic', label: '学术工具' }, { id: 'period', label: '周期' }, { id: 'todo', label: '待办' }, { id: 'pomodoro', label: '番茄钟' }, { id: 'ledger', label: '记账' }, { id: 'wallet', label: '钱包' },
  ] },
  { g: '设置', items: [
    { id: 'themes', label: '主题' }, { id: 'xp', label: '喜好探索' }, { id: 'meprofile', label: '我的画像' }, { id: 'avatars', label: '头像' }, { id: 'voicesettings', label: '声音' }, { id: 'ncm', label: '网易云' }, { id: 'toy', label: '玩具' }, { id: 'dashboard', label: '仪表盘' },
  ] },
];

// 喜好探索：看 Ta 们在亲密里自动摸索出来的「喜好档案」（越玩越懂你）+ 发起一场身体地图探索。
function XpPage({ t, onChat }) {
  const [data, setData] = useState({ items: [], summary: '' });
  const [loading, setLoading] = useState(true);
  const load = () => fetch(`${BACKEND}/xp`).then(r => r.json()).then(d => { setData(d || { items: [] }); setLoading(false); }).catch(() => setLoading(false));
  useEffect(() => { load(); }, []);
  const del = (key) => { fetch(`${BACKEND}/xp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'remove', key }) }).then(() => load()).catch(() => {}); };
  const GROUPS = [['like', '喜欢', '#a9c08d'], ['sensitive', '敏感点', '#d4926a'], ['curious', '想试', '#7a88c8'], ['dislike', '不喜欢', '#9fb0b8'], ['hardlimit', '雷区·绝不碰', '#c0607a']];
  const chars = [['yu', '沈屿']];
  const items = data.items || [];
  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', padding: '20px 16px 40px', maxWidth: 480, margin: '0 auto', width: '100%', textAlign: 'left' }}>
      <div style={{ fontSize: 10, color: t.text3, letterSpacing: '0.14em', marginBottom: 4 }}>XP</div>
      <div style={{ fontSize: 18, fontWeight: 400, color: t.text1, marginBottom: 6, fontFamily: 'inherit' }}>喜好探索</div>
      <p style={{ fontSize: 11, color: t.text3, marginBottom: 16, lineHeight: 1.6 }}>你和 Ta 在亲密里慢慢摸索出来的喜好、敏感点、想试的、和绝不碰的雷区——会自动记下，往后越来越懂你。也可以主动发起一场探索。</p>
      <Card t={t} style={{ padding: '14px 16px', marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: t.text1, marginBottom: 10, fontFamily: 'inherit' }}>发起一场探索</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {chars.map(([id, n]) => (
            <span key={id} className="tap" onClick={() => onChat && onChat(id)} style={{ fontSize: 12, padding: '8px 14px', borderRadius: 14, cursor: 'pointer', background: `${t.acc}14`, color: t.acc, border: `0.5px solid ${t.acc}55`, fontFamily: 'inherit' }}>和{n}探索</span>
          ))}
        </div>
        <div style={{ fontSize: 10, color: t.text3, marginTop: 10, lineHeight: 1.6 }}>进去说一句「我们来探索一下」，Ta 会一点点带你试、记住你的反应。</div>
      </Card>
      {data.summary ? <div style={{ fontSize: 12, color: t.text2, marginBottom: 12, lineHeight: 1.6, fontStyle: 'italic' }}>「{data.summary}」</div> : null}
      {loading ? <div style={{ fontSize: 12, color: t.text3, textAlign: 'center', padding: 20 }}>载入中…</div>
        : items.length === 0 ? <Card t={t} style={{ padding: 20 }}><div style={{ fontSize: 12, color: t.text3, textAlign: 'center', lineHeight: 1.7 }}>还没有记录<br />和 Ta 亲密时会自动慢慢摸索出来，<br />或点上面发起一场探索。</div></Card>
          : GROUPS.map(([val, label, color]) => {
            const list = items.filter(it => it.val === val);
            if (!list.length) return null;
            return (
              <Card key={val} t={t} style={{ padding: '12px 16px', marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color, marginBottom: 8, fontFamily: 'inherit' }}>{label}</div>
                {list.map(it => (
                  <div key={it.key} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, padding: '5px 0' }}>
                    <span style={{ fontSize: 13, color: t.text1, fontFamily: 'inherit', lineHeight: 1.5 }}>{it.label}{it.note ? <span style={{ color: t.text3 }}>　{it.note}</span> : null}</span>
                    <span className="tap" onClick={() => del(it.key)} style={{ fontSize: 11, color: t.text3, cursor: 'pointer', flexShrink: 0 }}>✕</span>
                  </div>
                ))}
              </Card>
            );
          })}
    </div>
  );
}

// 主题选择：色卡网格（每张用该主题真实底色/渐变 + 迷你玻璃卡预览），点一下整 app 即时换肤。
function ThemePage({ t, themeIdx, setThemeIdx }) {
  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', padding: '20px 16px 40px', maxWidth: 480, margin: '0 auto', width: '100%', textAlign: 'left' }}>
      <div style={{ fontSize: 10, color: t.text3, letterSpacing: '0.14em', marginBottom: 4 }}>THEME</div>
      <div style={{ fontSize: 18, fontWeight: 400, color: t.text1, marginBottom: 6, fontFamily: 'inherit' }}>主题</div>
      <p style={{ fontSize: 11, color: t.text3, marginBottom: 18, lineHeight: 1.6 }}>挑一套喜欢的皮肤，整个 app 即时换肤。「暗黑文学」会在文学沉淀区自动启用。</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {THEMES.map((th, i) => {
          const on = themeIdx === i;
          return (
            <div key={th.id} className="tap" onClick={() => setThemeIdx(i)} style={{ cursor: 'pointer', borderRadius: 16, overflow: 'hidden', border: `2px solid ${on ? t.acc : 'transparent'}`, boxShadow: on ? `0 0 0 1px ${t.acc}55` : '0 2px 12px rgba(0,0,0,0.07)', transition: 'all .15s' }}>
              <div style={{ height: 88, backgroundColor: th.bgColor, backgroundImage: th.bgImage, backgroundSize: 'cover', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '64%', height: 40, borderRadius: Math.min(14, th.radius || 12), background: th.isGlass ? 'rgba(255,255,255,0.2)' : th.card, backdropFilter: `blur(${th.blur})`, WebkitBackdropFilter: `blur(${th.blur})`, border: `0.5px solid ${th.border}`, boxShadow: (th.cardGlow && th.cardGlow !== 'none') ? th.cardGlow : 'none', display: 'flex', alignItems: 'center', gap: 7, padding: '0 11px' }}>
                  <span style={{ width: 15, height: 15, borderRadius: th.isPixel ? 0 : '50%', background: th.acc, flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>
                    <span style={{ display: 'block', height: 5, width: '72%', borderRadius: 3, background: th.text1, opacity: 0.85, marginBottom: 4 }} />
                    <span style={{ display: 'block', height: 4, width: '46%', borderRadius: 3, background: th.text2, opacity: 0.7 }} />
                  </span>
                </div>
              </div>
              <div style={{ padding: '9px 11px', background: t.card, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12.5, color: t.text1, fontFamily: 'inherit' }}>{th.name}</span>
                {on ? <span style={{ fontSize: 11, color: t.acc }}>● 使用中</span> : <span style={{ fontSize: 11, color: t.text3 }}>{th.isDark ? '深色' : '浅色'}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 它此刻的内心：8维欲望条 + 最想做的事 + 念头池 + 牵挂（读 /desire + /concerns）。能动性层的可视化。
function InnerWorldPage({ t }) {
  const CHARS = [
    { id: 'yu', name: '沈屿', accent: '#e0879f' },
  ];
  const DLBL = { attachment: '想念', curiosity: '好奇', reflection: '想沉淀', duty: '记挂', social: '想看人', libido: '亲密', stress: '压力', fatigue: '累' };
  const [cid, setCid] = useState('yu');
  const [desire, setDesire] = useState(null);
  const [concerns, setConcerns] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true; setLoading(true);
    Promise.all([
      fetch(`${BACKEND}/desire/${cid}`).then(r => r.json()).catch(() => null),
      fetch(`${BACKEND}/concerns/${cid}`).then(r => r.json()).catch(() => null),
    ]).then(([d, c]) => { if (!alive) return; setDesire(d); setConcerns(c); setLoading(false); });
    return () => { alive = false; };
  }, [cid]);
  const acc = CHARS.find(c => c.id === cid)?.accent || t.acc;
  const observeMode = desire?.gate?.DESIRE_DRIVEN === false;
  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', padding: '20px 16px 40px', maxWidth: 480, margin: '0 auto', width: '100%', textAlign: 'left' }}>
      <div style={{ fontSize: 10, color: t.text3, letterSpacing: '0.14em', marginBottom: 4 }}>INNER WORLD</div>
      <div style={{ fontSize: 18, fontWeight: 400, color: t.text1, marginBottom: 14, fontFamily: 'inherit' }}>它此刻的内心</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {CHARS.map(c => (
          <span key={c.id} className="tap" onClick={() => setCid(c.id)} style={{ flex: 1, textAlign: 'center', fontSize: 12, padding: '7px 0', borderRadius: 10, cursor: 'pointer', background: cid === c.id ? c.accent : 'transparent', color: cid === c.id ? '#fff' : t.text2, border: `0.5px solid ${cid === c.id ? c.accent : t.border}`, fontFamily: 'inherit' }}>{c.name}</span>
        ))}
      </div>
      {loading ? <div style={{ fontSize: 12, color: t.text3, textAlign: 'center', padding: 30 }}>读取中…</div> : (desire?.empty ? <div style={{ fontSize: 12, color: t.text3, textAlign: 'center', padding: 30, lineHeight: 1.7 }}>还没跑过一拍～<br />等下一个心跳周期（约十几分钟）它的内心就会浮现。</div> : <>
        {desire?.intent && (
          <Card t={t} style={{ padding: '16px', marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: t.text3, letterSpacing: '0.06em', marginBottom: 8 }}>此刻最想做的事</div>
            <div style={{ fontSize: 16, color: t.text1, fontFamily: 'inherit', marginBottom: 5 }}>{desire.intent.reason}</div>
            <div style={{ fontSize: 11, color: t.text3 }}>主导：{DLBL[desire.intent.drive] || desire.intent.drive} · 强度 {desire.intent.score}{observeMode ? ' · 观察模式（不驱动行为）' : ''}</div>
          </Card>
        )}
        {desire?.drives && (
          <Card t={t} style={{ padding: '16px', marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: t.text1, marginBottom: 12, fontFamily: 'inherit' }}>欲望 · 八维</div>
            {desire.drives.map(d => (
              <div key={d.key} style={{ marginBottom: 9 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                  <span style={{ color: t.text2 }}>{d.label}{d.key === 'fatigue' ? ' · 闸' : ''}</span>
                  <span style={{ color: t.text3 }}>{(d.value ?? 0).toFixed(2)}</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: 'rgba(128,128,128,0.12)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.round((d.value ?? 0) * 100)}%`, background: acc, opacity: d.key === 'fatigue' ? 0.4 : 0.85, borderRadius: 3, transition: 'width .4s' }} />
                </div>
              </div>
            ))}
          </Card>
        )}
        {desire?.thoughts?.length > 0 && (
          <Card t={t} style={{ padding: '16px', marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: t.text1, marginBottom: 10, fontFamily: 'inherit' }}>念头池</div>
            {desire.thoughts.map((th, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
                <span style={{ fontSize: 9, color: th.kind === 'fixation' ? acc : t.text3, flexShrink: 0, width: 24 }}>{th.kind === 'fixation' ? '执念' : '闪念'}</span>
                <span style={{ flex: 1, fontSize: 12, color: t.text2 }}>{th.text || '（一个念头）'}</span>
                <span style={{ fontSize: 10, color: t.text3 }}>{typeof th.strength === 'number' ? th.strength.toFixed(2) : ''}</span>
              </div>
            ))}
          </Card>
        )}
        <Card t={t} style={{ padding: '16px', marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: t.text1, marginBottom: 10, fontFamily: 'inherit' }}>放不下的牵挂</div>
          {concerns?.active?.length > 0 ? concerns.active.map((c, i) => (
            <div key={i} style={{ padding: '7px 0', borderBottom: i < concerns.active.length - 1 ? `0.5px solid ${t.border}` : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 12.5, color: t.text1, flex: 1, lineHeight: 1.5 }}>{c.summary}</span>
                <span style={{ fontSize: 10, color: c.resolution === 'EASING' ? '#8e9d7d' : acc, flexShrink: 0, marginTop: 2 }}>{c.resolution === 'EASING' ? '在好转' : '挂着'}</span>
              </div>
              {c.recurrence > 0 && <span style={{ fontSize: 10, color: t.text3 }}>又冒出来 ×{c.recurrence}</span>}
            </div>
          )) : <div style={{ fontSize: 11, color: t.text3 }}>暂无牵挂 · 一切都好。</div>}
        </Card>
        <div style={{ fontSize: 10, color: t.text3, textAlign: 'center', lineHeight: 1.7, marginTop: 4 }}>这是 ta 内在的状态机：欲望随时间、你的远近、未解的牵挂涨落；念头反复被想就沉成执念。{observeMode && ' 当前为观察模式，只看不驱动。'}</div>
      </>)}
    </div>
  );
}

// 树洞：匿名把心事投进来，会有人（某位角色，不具名）路过、抱一抱、轻声回应。
function TreeholePage({ t }) {
  const [posts, setPosts] = useState([]);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const postingRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [replyOpen, setReplyOpen] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [hugged, setHugged] = useState(() => {
    try { return JSON.parse(localStorage.getItem('companion_hugged_treehole') || '[]'); } catch { return []; }
  });
  const serif = 'var(--serif, Georgia, "Songti SC", serif)';

  const load = async () => {
    try {
      const res = await fetch(`${BACKEND}/treehole`);
      const data = await res.json();
      if (data.posts) setPosts(data.posts);
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const timeAgo = (ts) => {
    if (!ts) return '';
    const s = (Date.now() - new Date(ts).getTime()) / 1000;
    if (s < 60) return '刚刚';
    if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
    if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
    return `${Math.floor(s / 86400)} 天前`;
  };

  const publish = async () => {
    const text = draft.trim();
    if (!text || postingRef.current) return;
    postingRef.current = true; setPosting(true);
    const id = `th_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setPosts(prev => [{ id, content: text, hugs: 0, created_at: new Date().toISOString(), treehole_replies: [] }, ...prev]);
    setDraft('');
    try {
      await fetch(`${BACKEND}/treehole`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, content: text, author_kind: 'user' }) });
      // 角色匿名回应有 4-13s 延迟，分几次轻轻拉一下
      setTimeout(load, 6000); setTimeout(load, 12000); setTimeout(load, 19000);
    } catch {}
    postingRef.current = false; setPosting(false);
  };

  const hug = async (id) => {
    if (hugged.includes(id)) return;
    const next = [...hugged, id];
    setHugged(next);
    localStorage.setItem('companion_hugged_treehole', JSON.stringify(next));
    setPosts(prev => prev.map(p => p.id === id ? { ...p, hugs: (p.hugs || 0) + 1 } : p));
    try { await fetch(`${BACKEND}/treehole/${id}/hug`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delta: 1 }) }); } catch {}
  };

  const sendReply = async (id) => {
    const text = replyText.trim(); if (!text) return;
    const optimistic = { id: Date.now(), post_id: id, content: text, responder_kind: 'user' };
    setPosts(prev => prev.map(p => p.id === id ? { ...p, treehole_replies: [...(p.treehole_replies || []), optimistic] } : p));
    setReplyText(''); setReplyOpen(null);
    try { await fetch(`${BACKEND}/treehole/${id}/reply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: text }) }); } catch {}
  };

  const btn = (active) => ({ border: 'none', borderRadius: 999, padding: '7px 18px', fontSize: 13, cursor: active ? 'pointer' : 'default', backgroundColor: active ? t.acc : t.border, color: active ? (t.accText || '#fff') : t.text3 });

  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', padding: '16px 16px 40px', maxWidth: 440, margin: '0 auto', width: '100%', textAlign: 'left' }}>
      <h2 style={{ fontSize: 22, fontWeight: t.isPixel ? 700 : 400, color: t.text1, margin: '4px 0 2px', fontFamily: serif }}>树洞</h2>
      <p style={{ fontSize: 12, color: t.text3, letterSpacing: '0.04em', marginBottom: 16 }}>把心事轻轻投进来 · 没有人知道是谁</p>

      <div style={{ borderRadius: 16, border: `0.5px solid ${t.border}`, backgroundColor: t.isGlass ? 'rgba(255,255,255,0.2)' : t.card, backdropFilter: `blur(${t.blur})`, padding: 14, marginBottom: 20 }}>
        <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={3} placeholder="对着树洞说点什么……"
          style={{ width: '100%', border: 'none', outline: 'none', resize: 'none', background: 'transparent', color: t.text1, fontSize: 15, lineHeight: 1.7, fontFamily: serif }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button className="tap" disabled={!draft.trim() || posting} onClick={publish} style={{ ...btn(!!draft.trim()), opacity: posting ? 0.6 : 1 }}>
            {posting ? '投递中…' : '投进树洞'}
          </button>
        </div>
      </div>

      {loading ? (
        <p style={{ color: t.text3, fontSize: 13, textAlign: 'center', marginTop: 30 }}>把耳朵贴近树洞…</p>
      ) : posts.length === 0 ? (
        <p style={{ color: t.text3, fontSize: 13, textAlign: 'center', marginTop: 30, lineHeight: 1.9 }}>树洞还是空的。<br />第一句话，要不要你来说？</p>
      ) : posts.map(p => (
        <div key={p.id} style={{ borderRadius: 16, border: `0.5px solid ${t.border}`, backgroundColor: t.isGlass ? 'rgba(255,255,255,0.16)' : t.card, backdropFilter: `blur(${t.blur})`, padding: '15px 16px', marginBottom: 12 }}>
          <p style={{ color: t.text1, fontSize: 15, lineHeight: 1.85, margin: 0, fontFamily: serif, whiteSpace: 'pre-wrap' }}>{p.content}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12 }}>
            <span style={{ fontSize: 11, color: t.text3 }}>{timeAgo(p.created_at)}</span>
            <span className="tap" onClick={() => hug(p.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: hugged.includes(p.id) ? t.acc : t.text2, cursor: 'pointer' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill={hugged.includes(p.id) ? t.acc : 'none'} stroke={hugged.includes(p.id) ? t.acc : t.text2} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 8.6a5 5 0 0 0-8.8-2.2A5 5 0 0 0 3.2 8.6c0 4 4.5 7 8.8 10 4.3-3 8.8-6 8.8-10z" /></svg>
              抱抱{p.hugs ? ` ${p.hugs}` : ''}
            </span>
            <span className="tap" onClick={() => { setReplyOpen(replyOpen === p.id ? null : p.id); setReplyText(''); }} style={{ fontSize: 12.5, color: t.text2, cursor: 'pointer' }}>回应</span>
          </div>

          {(p.treehole_replies || []).length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: `0.5px solid ${t.border}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {p.treehole_replies.map(r => (
                <div key={r.id} style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 12, flexShrink: 0, opacity: 0.55 }}>{r.responder_kind === 'char' ? '🌿' : '·'}</span>
                  <span style={{ fontSize: 13.5, color: t.text2, lineHeight: 1.7, fontFamily: serif, fontStyle: 'italic' }}>{r.content}</span>
                </div>
              ))}
            </div>
          )}

          {replyOpen === p.id && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <input value={replyText} onChange={e => setReplyText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') sendReply(p.id); }} placeholder="轻声回一句……" autoFocus
                style={{ flex: 1, border: `0.5px solid ${t.border}`, borderRadius: 999, padding: '7px 14px', fontSize: 13, background: 'transparent', color: t.text1, outline: 'none', fontFamily: serif }} />
              <button className="tap" onClick={() => sendReply(p.id)} disabled={!replyText.trim()} style={{ border: 'none', borderRadius: 999, padding: '0 16px', fontSize: 12.5, background: replyText.trim() ? t.acc : t.border, color: replyText.trim() ? (t.accText || '#fff') : t.text3, cursor: replyText.trim() ? 'pointer' : 'default' }}>说</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// 每日任务面板（BDSM 调教任务卡游戏化 UI）：后端 /quest/yu 生成 JSON，前端渲染成暗色游戏面板
// 勾选状态存 localStorage（xu_quest_done_<date>），惩罚倒计时按当天 23:59 结算
function QuestPanelPage({ t }) {
  const cid = 'yu';
  const [panel, setPanel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [now, setNow] = useState(Date.now());
  const dateKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
  const doneKey = `xu_quest_done_${dateKey}`;
  const [done, setDone] = useState(() => { try { return JSON.parse(localStorage.getItem(doneKey) || '{}'); } catch { return {}; } });

  const load = async () => {
    setLoading(true);
    try { const r = await fetch(`${BACKEND}/quest/${cid}`); const d = await r.json(); setPanel(d.panel || null); setStale(!!d.stale); }
    catch { setPanel(null); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);

  const gen = async () => {
    if (busy) return; setBusy(true);
    try { const r = await fetch(`${BACKEND}/quest/${cid}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force: true }) }); const d = await r.json(); if (d.panel) { setPanel(d.panel); setStale(false); } else { await load(); } }
    catch {}
    setBusy(false);
  };
  const toggle = (i) => { const n = { ...done, [i]: !done[i] }; setDone(n); localStorage.setItem(doneKey, JSON.stringify(n)); if (navigator.vibrate) navigator.vibrate(12); };

  const dailies = (panel && panel.dailies) || [];
  const hasUndone = dailies.some((_, i) => !done[i]);
  const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
  const remainMs = Math.max(0, endOfDay.getTime() - now);
  const hh = String(Math.floor(remainMs / 3600000)).padStart(2, '0');
  const mm = String(Math.floor((remainMs % 3600000) / 60000)).padStart(2, '0');
  const ss = String(Math.floor((remainMs % 60000) / 1000)).padStart(2, '0');
  const total = dailies.length || 1;
  const doneCount = dailies.filter((_, i) => done[i]).length;

  const C = { bg: '#0a0a0d', card: '#12131a', line: '#1e1f28', text: '#c8ccd8', dim: '#6a6e7e', faint: '#3a3d48', neon: '#4ade80', orange: '#fb923c', red: '#ef4444', gold: '#d4a941', accent: '#7c6df2' };
  const mono = "'Courier New',ui-monospace,monospace";
  const stTag = { waiting: ['⏳等待执行', C.dim], running: ['🔴执行中', C.red], settled: ['✅已结算', C.neon] };

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: C.bg, padding: '16px 0 40px' }}>
      <div style={{ maxWidth: 440, margin: '0 auto', padding: '0 14px', fontFamily: "'Noto Sans SC',-apple-system,sans-serif" }}>
        {loading && <div style={{ color: C.dim, textAlign: 'center', padding: '40px 0', fontFamily: mono }}>LOADING…</div>}
        {!loading && !panel && (
          <div style={{ textAlign: 'center', padding: '50px 0', color: C.dim }}>
            <div style={{ fontSize: 13, marginBottom: 18, lineHeight: 2 }}>今天还没有任务面板</div>
            <span className="tap" onClick={gen} style={{ display: 'inline-block', padding: '10px 22px', borderRadius: 8, border: `1px solid ${C.red}`, color: busy ? C.dim : '#fff', background: 'rgba(139,0,0,0.25)', cursor: 'pointer', fontFamily: mono, letterSpacing: '2px', fontSize: 12 }}>{busy ? 'GENERATING…' : '生成今日任务 ▸'}</span>
            {busy && <div style={{ fontSize: 10, color: C.faint, marginTop: 14 }}>屿正在拟今天的任务…（最长 2 分钟）</div>}
          </div>
        )}
        {!loading && panel && (
          <>
            <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: '14px 16px', marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: '3px', color: C.dim, textTransform: 'uppercase' }}>DAILY QUEST · {panel.date || dateKey}</span>
                <span style={{ fontFamily: mono, fontSize: 22, fontWeight: 700, color: C.gold, lineHeight: 1 }}>{panel.grade || '—'}</span>
              </div>
              <div style={{ fontSize: 14, color: C.text, lineHeight: 1.6 }}>{panel.greeting}</div>
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: mono, fontSize: 9, color: C.dim, marginBottom: 4 }}><span>PROGRESS</span><span>{doneCount}/{dailies.length}</span></div>
                <div style={{ height: 6, borderRadius: 3, background: '#000', overflow: 'hidden' }}><div style={{ height: '100%', width: `${(doneCount / total) * 100}%`, borderRadius: 3, background: `linear-gradient(90deg, ${C.neon}, ${C.accent})`, transition: 'width .4s' }} /></div>
              </div>
            </div>
            {hasUndone && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(135deg,#1a0808,#100606)', border: `1px solid #3a1414`, borderRadius: 10, padding: '10px 16px', marginBottom: 12 }}>
                <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: '2px', color: C.red }}>⚠ 清算倒计时</span>
                <span style={{ fontFamily: mono, fontSize: 20, fontWeight: 700, color: C.red, letterSpacing: '2px' }}>{hh}:{mm}:{ss}</span>
              </div>
            )}
            <QSection C={C} mono={mono}>DAILY QUESTS</QSection>
            {dailies.map((q, i) => (
              <div key={i} className="tap" onClick={() => toggle(i)} style={{ display: 'flex', gap: 11, padding: '12px 14px', marginBottom: 8, cursor: 'pointer', background: C.card, border: `1px solid ${done[i] ? 'rgba(74,222,128,0.3)' : C.line}`, borderRadius: 10, opacity: done[i] ? 0.6 : 1 }}>
                <span style={{ fontSize: 18, flexShrink: 0, color: done[i] ? C.neon : C.faint, lineHeight: 1.2 }}>{done[i] ? '☑' : '☐'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text, textDecoration: done[i] ? 'line-through' : 'none' }}>{q.name}</div>
                  <div style={{ fontSize: 12, color: C.dim, marginTop: 3, lineHeight: 1.6 }}>{q.desc}</div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 6, fontFamily: mono, fontSize: 10, flexWrap: 'wrap' }}>
                    {q.reward && <span style={{ color: C.neon }}>◈ {q.reward}</span>}
                    {q.penalty && <span style={{ color: C.orange }}>◈ {q.penalty}</span>}
                  </div>
                </div>
              </div>
            ))}
            {panel.timed && (
              <>
                <QSection C={C} mono={mono}>TIMED CHALLENGE</QSection>
                <div style={{ background: 'linear-gradient(135deg,#0f1420,#0a0d16)', border: `1px solid ${C.accent}55`, borderRadius: 10, padding: '13px 15px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#c9d1ff' }}>⏱ {panel.timed.name}</span>
                    <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>{panel.timed.deadline_hint}</span>
                  </div>
                  <div style={{ fontSize: 12, color: C.dim, margin: '6px 0 10px', lineHeight: 1.6 }}>{panel.timed.desc}</div>
                  <div style={{ height: 6, borderRadius: 3, background: '#000', overflow: 'hidden' }}><div style={{ height: '100%', width: `${panel.timed.progress || 0}%`, background: `linear-gradient(90deg,${C.accent},#c084fc)`, borderRadius: 3 }} /></div>
                </div>
              </>
            )}
            <QSection C={C} mono={mono}>PENALTY QUEUE</QSection>
            {(panel.penalties && panel.penalties.length) ? panel.penalties.map((p, i) => {
              const [label, col] = stTag[p.status] || stTag.waiting;
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 14px', marginBottom: 6, background: C.card, border: `1px solid ${C.line}`, borderRadius: 8 }}>
                  <span style={{ fontSize: 12.5, color: C.text, flex: 1 }}>{p.text}</span>
                  <span style={{ fontFamily: mono, fontSize: 10, color: col, flexShrink: 0 }}>{label}</span>
                </div>
              );
            }) : <div style={{ fontFamily: mono, fontSize: 11, color: C.faint, textAlign: 'center', padding: '10px 0 4px' }}>—— 当前无待清算事项 ——</div>}
            <QSection C={C} mono={mono}>ACHIEVEMENTS</QSection>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
              {(panel.achievements || []).map((a, i) => (
                <div key={i} style={{ padding: '11px 12px', borderRadius: 9, background: a.unlocked ? 'linear-gradient(135deg,rgba(212,169,65,0.10),rgba(20,16,6,0.3))' : C.card, border: `1px solid ${a.unlocked ? C.gold + '66' : C.line}`, opacity: a.unlocked ? 1 : 0.55 }}>
                  <div style={{ fontSize: 15, marginBottom: 3 }}>{a.icon || (a.unlocked ? '🏅' : '🔒')}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: a.unlocked ? C.gold : C.dim }}>{a.name}</div>
                  <div style={{ fontSize: 10, color: C.faint, marginTop: 3, lineHeight: 1.5 }}>{a.cond}</div>
                </div>
              ))}
            </div>
            {panel.daddy_note && (
              <div style={{ borderLeft: `3px solid ${C.red}`, background: '#100808', padding: '12px 15px', borderRadius: '0 8px 8px 0', marginBottom: 16 }}>
                <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '2px', color: C.red, opacity: 0.7, marginBottom: 5 }}>DADDY'S NOTE</div>
                <div style={{ fontSize: 13, color: '#ddd', lineHeight: 1.7, fontStyle: 'italic' }}>{panel.daddy_note}</div>
              </div>
            )}
            <div style={{ textAlign: 'center' }}>
              <span className="tap" onClick={gen} style={{ display: 'inline-block', padding: '8px 18px', borderRadius: 8, border: `1px solid ${C.line}`, color: busy ? C.faint : C.dim, cursor: 'pointer', fontFamily: mono, letterSpacing: '2px', fontSize: 11 }}>{busy ? 'REGENERATING…' : (stale ? '↻ 生成今天的' : '↻ 换一批')}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
function QSection({ C, mono, children }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 2px 9px' }}>
    <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#8b0000' }} />
    <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: '3px', color: C.dim, textTransform: 'uppercase' }}>{children}</span>
    <span style={{ flex: 1, height: 1, background: C.line }} />
  </div>;
}

// 安全词：常驻的结构性开关。平时右上角一个低调小盾；按下→确认→一切停下(后端掐主动/bark/任务/场景，屿只安静陪着)；
// 启用后顶部一条安静横幅，随时「结束」回到平常。状态存后端(/safeword)，重启不丢。
function SafeWordControl({ t }) {
  const [on, setOn] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetch(`${BACKEND}/safeword`).then(r => r.json()).then(d => setOn(!!d.on)).catch(() => {}); }, []);
  const setSafe = async (v) => {
    setBusy(true);
    try { const r = await fetch(`${BACKEND}/safeword`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on: v }) }); const d = await r.json(); setOn(!!d.on); } catch {}
    setBusy(false); setConfirming(false);
    if (navigator.vibrate) navigator.vibrate(v ? [30, 40, 30] : 15);
  };
  if (on) return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 500, background: 'linear-gradient(180deg,#1b2433,#151c27)', borderBottom: '1px solid #2a3a4a', padding: 'calc(env(safe-area-inset-top,0px) + 10px) 16px 10px', display: 'flex', alignItems: 'center', gap: 11, boxShadow: '0 6px 24px rgba(0,0,0,0.35)' }}>
      <span style={{ fontSize: 17 }}>🛡</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#cdd9ff' }}>安全词已启用 · 一切都停下了</div>
        <div style={{ fontSize: 11, color: '#8a97ad', marginTop: 1 }}>屿在安静地陪着你。不着急。</div>
      </div>
      <span className="tap" onClick={() => !busy && setSafe(false)} style={{ fontSize: 12, color: '#aeb8dd', border: '1px solid #3a4a5f', borderRadius: 999, padding: '6px 14px', cursor: 'pointer', flexShrink: 0 }}>{busy ? '…' : '结束'}</span>
    </div>
  );
  return (
    <>
      <span className="tap" onClick={() => setConfirming(true)} title="安全词" style={{ position: 'fixed', top: 'calc(env(safe-area-inset-top,0px) + 7px)', right: 9, zIndex: 499, width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.16)', backdropFilter: 'blur(6px)', fontSize: 13.5, cursor: 'pointer', opacity: 0.42 }}>🛡</span>
      {confirming && (
        <div onClick={() => setConfirming(false)} style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: t.card || '#fff', borderRadius: 16, padding: '22px 20px', maxWidth: 320, width: '100%', textAlign: 'center', border: `0.5px solid ${t.border}` }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>🛡</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: t.text1, marginBottom: 6 }}>按下安全词？</div>
            <div style={{ fontSize: 12.5, color: t.text3, lineHeight: 1.75, marginBottom: 18 }}>一切会立刻停下——主动消息、任务、场景，全部。屿会安静下来，只是陪着你。你想回来时再关掉。</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <span className="tap" onClick={() => setConfirming(false)} style={{ flex: 1, padding: '10px', borderRadius: 10, border: `1px solid ${t.border}`, color: t.text2, cursor: 'pointer', fontSize: 13 }}>取消</span>
              <span className="tap" onClick={() => !busy && setSafe(true)} style={{ flex: 1, padding: '10px', borderRadius: 10, background: '#8b0000', color: '#fff', cursor: 'pointer', fontSize: 13 }}>{busy ? '…' : '停下'}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Playground：manifest 驱动的 HTML 小应用列表。VPS web/playground/ 放 html + manifest.json 加一行即上新，前端零改动
function PlaygroundPage({ t }) {
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(null);
  const [collapsed, setCollapsed] = useState({});
  useEffect(() => {
    // no-store：manifest 被静态层设了长缓存，绕过它保证「加一行即上新」
    fetch(`${BACKEND}/playground/manifest.json`, { cache: 'no-store' }).then(r => r.ok ? r.json() : []).then(d => setItems(Array.isArray(d) ? d : [])).catch(() => setItems([]));
  }, []);
  const groups = React.useMemo(() => {
    const g = new Map();
    for (const it of items || []) { const f = it.folder || ''; if (!g.has(f)) g.set(f, []); g.get(f).push(it); }
    return [...g.entries()].sort((a, b) => (a[0] === '' ? -1 : b[0] === '' ? 1 : a[0].localeCompare(b[0], 'zh')));
  }, [items]);
  const openItem = (it) => setOpen({ title: it.title, src: it.url || `${BACKEND}/playground/${it.file}?v=2` });
  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', padding: '20px 16px 24px', maxWidth: 440, margin: '0 auto', width: '100%', textAlign: 'left' }}>
      <div style={{ fontSize: 10, color: t.text3, letterSpacing: '0.14em', marginBottom: 4 }}>PLAYGROUND</div>
      <div style={{ fontSize: 18, fontWeight: 400, color: t.text1, marginBottom: 14, fontFamily: 'inherit' }}>小应用</div>
      {items === null && <div style={{ fontSize: 12, color: t.text3, padding: '30px 0', textAlign: 'center' }}>加载中…</div>}
      {items !== null && items.length === 0 && <div style={{ fontSize: 12, color: t.text3, padding: '30px 0', textAlign: 'center', lineHeight: 2 }}>还没有内容<br />在 VPS web/playground/ 放 HTML + manifest 加一行即可上新</div>}
      {groups.map(([folder, list]) => (
        <div key={folder || '_top'} style={{ marginBottom: 16 }}>
          {folder && (
            <div className="tap" onClick={() => setCollapsed(c => ({ ...c, [folder]: !c[folder] }))} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: t.text3, letterSpacing: '0.1em', margin: '0 6px 7px', cursor: 'pointer' }}>
              <span>📁 {folder}</span><span style={{ opacity: 0.6 }}>{list.length}</span><span style={{ marginLeft: 'auto', opacity: 0.5 }}>{collapsed[folder] ? '›' : '⌄'}</span>
            </div>
          )}
          {!(folder && collapsed[folder]) && (
            <div style={{ borderRadius: 16, overflow: 'hidden', border: `0.5px solid ${t.border}`, backgroundColor: t.isGlass ? 'rgba(255,255,255,0.2)' : t.card, backdropFilter: `blur(${t.blur})` }}>
              {list.map((it, i) => (
                <div key={it.id || it.file} className="tap" onClick={() => openItem(it)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', cursor: 'pointer', borderTop: i > 0 ? `0.5px solid ${t.border}` : 'none' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, color: t.text1, fontFamily: 'inherit' }}>{it.title}</div>
                    {it.description && <div style={{ fontSize: 11, color: t.text3, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.description}</div>}
                  </div>
                  {it.date && <span style={{ fontSize: 10, color: t.text3, flexShrink: 0 }}>{it.date}</span>}
                  <span style={{ fontSize: 16, color: t.text3, opacity: 0.4, flexShrink: 0 }}>›</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', flexDirection: 'column', backgroundColor: t.bg }}>
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, padding: 'calc(env(safe-area-inset-top, 0px) + 6px) 8px 6px', borderBottom: `0.5px solid ${t.border}`, backgroundColor: t.card }}>
            <span className="tap" onClick={() => setOpen(null)} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 36, fontSize: 26, lineHeight: 1, color: t.text2, cursor: 'pointer' }}>‹</span>
            <span style={{ fontSize: 14, color: t.text1, fontFamily: 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{open.title}</span>
          </div>
          <iframe title={open.title} src={open.src} style={{ flex: 1, width: '100%', border: 'none', backgroundColor: '#fff' }} allow="autoplay; vibrate; fullscreen" />
        </div>
      )}
    </div>
  );
}

// 发现页（列表式）：朋友圈置顶（有新内容显示红点）+ 功能逐条进入
function DiscoverPage({ t, setScreen, momentsNew, onOpenMoments }) {
  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', padding: '20px 16px 24px', maxWidth: 440, margin: '0 auto', width: '100%', textAlign: 'left' }}>
      <h2 style={{ fontSize: 22, fontWeight: t.isPixel ? 700 : 400, color: t.text1, margin: '0 0 4px', fontFamily: 'inherit' }}>发现</h2>
      <p style={{ fontSize: 11, color: t.text3, letterSpacing: '0.08em', marginBottom: 16 }}>朋友圈 · 功能</p>

      {/* 朋友圈置顶 */}
      <div className="tap" onClick={onOpenMoments} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 16px', marginBottom: 18, cursor: 'pointer', borderRadius: 16, backgroundColor: t.isGlass ? 'rgba(255,255,255,0.2)' : t.card, border: `0.5px solid ${t.border}`, backdropFilter: `blur(${t.blur})` }}>
        <div style={{ position: 'relative', width: 40, height: 40, borderRadius: 12, background: `${t.acc}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={t.acc} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3.4"/><path d="M3 12a9 9 0 0 1 9-9M21 12a9 9 0 0 1-9 9"/></svg>
          {momentsNew && <span style={{ position: 'absolute', top: -3, right: -3, width: 9, height: 9, borderRadius: '50%', background: '#ef4444', border: `1.5px solid ${t.card}` }} />}
        </div>
        <div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, color: t.text1, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>朋友圈{momentsNew && <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 400 }}>· 有新动态</span>}</div>
        <span style={{ fontSize: 16, color: t.text3, opacity: 0.4 }}>›</span>
      </div>

      {/* 功能列表（按类分组） */}
      {DISCOVER_GROUPS.map(grp => (
        <div key={grp.g} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: t.text3, letterSpacing: '0.1em', margin: '0 6px 7px', fontFamily: 'inherit' }}>{grp.g}</div>
          <div style={{ borderRadius: 16, overflow: 'hidden', border: `0.5px solid ${t.border}`, backgroundColor: t.isGlass ? 'rgba(255,255,255,0.2)' : t.card, backdropFilter: `blur(${t.blur})` }}>
            {grp.items.map((f, i) => (
              <div key={f.id} className="tap" onClick={() => setScreen && setScreen(f.id)} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 16px', cursor: 'pointer', borderTop: i > 0 ? `0.5px solid ${t.border}` : 'none' }}>
                <span style={{ width: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><FeatIcon id={f.id} color={t.text2} size={20} /></span>
                <span style={{ flex: 1, fontSize: 14, color: t.text1, fontFamily: 'inherit', textAlign: 'left' }}>{f.label}</span>
                <span style={{ fontSize: 16, color: t.text3, opacity: 0.4 }}>›</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MomentsFeedPage({ t, onBack, onSeen }) {
  const [inputs, setInputs] = useState({});
  const [myPost, setMyPost] = useState('');
  const [moments, setMoments] = useState([]);
  const [likedIds, setLikedIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('companion_liked_moments') || '[]'); } catch { return []; }
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // 发布动态弹层
  const [showCompose, setShowCompose] = useState(false);
  const [cImg, setCImg] = useState(null);     // { data(base64无前缀), type, preview }
  const [cLoc, setCLoc] = useState('');
  const [cVis, setCVis] = useState('public'); // public | private
  const [posting, setPosting] = useState(false);
  const postingRef = useRef(false);   // 防快速双击重复发布（state 异步，闭包里读到的是旧值）
  const composeFileRef = useRef(null);
  const onPickImg = (e) => { const f = e.target.files?.[0]; if (!f) return; const rd = new FileReader(); rd.onload = ev => { const url = ev.target.result; setCImg({ data: String(url).split(',')[1], type: f.type || 'image/jpeg', preview: url }); }; rd.readAsDataURL(f); e.target.value = ''; };
  const resetCompose = () => { setShowCompose(false); setMyPost(''); setCImg(null); setCLoc(''); setCVis('public'); };

  const loadMoments = async () => {
    try {
      const res = await fetch(`${BACKEND}/moments`);
      const data = await res.json();
      if (data.moments) setMoments(data.moments);
    } catch {}
    setLoading(false);
  };

  // 让他们发一条：force 绕过随机跳过/长间隔，生成后立即刷新
  const refreshMoments = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const r = await fetch(`${BACKEND}/moments/generate-periodic`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force: true }) });
      await r.json().catch(() => ({}));
      await loadMoments();
    } catch {}
    setRefreshing(false);
  };

  useEffect(() => {
    loadMoments();
    // 进入发现页 → soft 生成（45分钟间隔、不随机跳过，让 feed 可靠更新），有新内容就刷新
    fetch(`${BACKEND}/moments/generate-periodic`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ soft: true }) })
      .then(r => r.json()).then(d => { if (d && d.created && d.created.length) setTimeout(loadMoments, 400); })
      .catch(() => {});
  }, []);

  const like = async (id) => {
    const hasLiked = likedIds.includes(id);
    const delta = hasLiked ? -1 : 1;
    const newLiked = hasLiked ? likedIds.filter(x => x !== id) : [...likedIds, id];
    setLikedIds(newLiked);
    localStorage.setItem('companion_liked_moments', JSON.stringify(newLiked));
    setMoments(prev => prev.map(m => m.id === id ? { ...m, likes: (m.likes || 0) + delta } : m));
    try { await fetch(`${BACKEND}/moments/${id}/like`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delta }) }); } catch {}
  };

  const comment = async (id) => {
    const txt = inputs[id]; if (!txt?.trim()) return;
    const optimistic = { id: Date.now(), moment_id: id, author: '小满', content: txt };
    setMoments(prev => prev.map(m => m.id === id ? { ...m, moment_comments: [...(m.moment_comments || []), optimistic] } : m));
    setInputs({ ...inputs, [id]: '' });
    try {
      const res = await fetch(`${BACKEND}/moments/${id}/comment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ author: '小满', content: txt }) });
      // 2秒后刷新拿角色回复
      setTimeout(loadMoments, 3500);
    } catch {}
  };

  const publish = async () => {
    const text = myPost.trim();
    const vis = cVis, loc = cLoc.trim();
    if ((!text && !cImg) || postingRef.current) return;   // ref 同步判定，挡住快速双击
    postingRef.current = true; setPosting(true);
    try {
      let image_url = '';
      if (cImg?.data) {
        try {
          const up = await fetch(`${BACKEND}/upload`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: cImg.data, type: cImg.type, name: 'moment.jpg' }) });
          const ud = await up.json(); image_url = ud.url || '';
        } catch {}
      }
      if (!text && !image_url) return;   // 图片上传失败且无文字 → 不发空动态（finally 会复位）
      const now = new Date(Date.now() + 8 * 3600 * 1000);
      const timeLabel = `${now.getUTCHours().toString().padStart(2,'0')}:${now.getUTCMinutes().toString().padStart(2,'0')}`;
      const id = 'm_' + Date.now();
      const optimistic = { id, char_id: 'yan', char_name: '小满 Yan', accent: t.acc, content: text, time_label: timeLabel, likes: 0, moment_comments: [], image_url, location: loc, visibility: vis };
      setMoments(prev => [optimistic, ...prev]);
      resetCompose();
      try {
        await fetch(`${BACKEND}/moments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, char_id: 'yan', char_name: '小满 Yan', accent: t.acc, content: text, time_label: timeLabel, ...(image_url ? { image_url } : {}), ...(loc ? { location: loc } : {}), ...(vis !== 'public' ? { visibility: vis } : {}) }) });
      } catch {}
      setTimeout(loadMoments, 3500);
    } finally {
      postingRef.current = false; setPosting(false);
    }
  };

  useEffect(() => { onSeen && onSeen(); }, []);   // 进入朋友圈 = 标记已读，清掉红点

  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', padding: '12px 16px 24px', maxWidth: 440, margin: '0 auto', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="tap" onClick={onBack} style={{ fontSize: 26, color: t.text2, cursor: 'pointer', width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>‹</span>
          <span style={{ fontSize: 18, fontWeight: 600, color: t.text1, fontFamily: 'inherit' }}>朋友圈</span>
        </div>
        <span className="tap" onClick={refreshMoments} style={{ fontSize: 11, color: t.text3, cursor: 'pointer', padding: '4px 12px', border: `0.5px solid ${t.border}`, borderRadius: 999, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>{refreshing ? '生成中…' : '↻ 刷新'}</span>
      </div>

      {/* 发布入口：点开整屏弹层 */}
      <Card t={t} style={{ padding: '12px 16px', marginBottom: 20 }} className="tap">
        <div className="tap" onClick={() => setShowCompose(true)} style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}>
          <CharAvatar c="me" size={34} />
          <span style={{ flex: 1, fontSize: 14, color: t.text3, fontFamily: 'inherit' }}>分享此刻的想法…</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={t.text2} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="12" cy="12" r="3.2"/><path d="M8 5l1.2-2h5.6L16 5"/></svg>
        </div>
      </Card>

      {loading && <p style={{ fontSize: 12, color: t.text3, textAlign: 'center', fontFamily: 'inherit' }}>加载中…</p>}

      {moments.map(m => {
        const charAccent = m.accent || t.acc;
        const hasLiked = likedIds.includes(m.id);
        const comments = m.moment_comments || [];
        return (
          <Card key={m.id} t={t} style={{ padding: '18px', marginBottom: 18, animation: 'fadeIn 0.3s ease' }} className={t.isCollage ? 'collage-tape' : ''}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              {(m.char_id === 'yan' || AVATAR_ART[m.char_id])
                ? <CharAvatar c={m.char_id === 'yan' ? 'me' : m.char_id} size={34} />
                : <div style={{ width: 34, height: 34, borderRadius: t.isPixel ? 0 : '50%', border: `1.5px solid ${charAccent}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: charAccent, fontWeight: 700, flexShrink: 0 }}>{(m.char_name || '?')[0]}</div>}
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.text1, fontFamily: 'inherit' }}>{m.char_name}</div>
                <div style={{ fontSize: 10, color: t.text3, fontFamily: 'inherit' }}>{m.time_label}</div>
              </div>
            </div>
            {m.content && <p style={{ fontSize: 14, color: t.text1, lineHeight: 1.85, marginBottom: m.image_url ? 10 : 14, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{m.content}</p>}
            {m.image_url && <img src={m.image_url} alt="" style={{ width: '100%', borderRadius: t.radius > 0 ? 12 : 0, marginBottom: 12, display: 'block', objectFit: 'cover', maxHeight: 320 }} />}
            {(m.location || m.visibility === 'private') && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, fontSize: 11, color: t.text3, fontFamily: 'inherit', flexWrap: 'wrap' }}>
                {m.location && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>📍 {m.location}</span>}
                {m.visibility === 'private' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>🔒 私密</span>}
              </div>
            )}
            <div style={{ display: 'flex', gap: 16, paddingTop: 10, borderTop: `1px dashed ${t.border}`, marginBottom: 10 }}>
              <span className="tap" onClick={() => like(m.id)} style={{ fontSize: 12, color: hasLiked ? '#ef4444' : t.text3, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 'bold', fontFamily: 'inherit' }}>{hasLiked ? '❤️' : '🤍'} {m.likes || 0}</span>
            </div>
            {comments.length > 0 && (
              <div style={{ backgroundColor: 'rgba(0,0,0,0.04)', borderRadius: t.radius > 0 ? 8 : 0, padding: '8px 12px', marginBottom: 10, border: t.isPixel ? `2px solid ${t.border}` : 'none' }}>
                {comments.map(c => (
                  <div key={c.id} style={{ fontSize: 12, lineHeight: 1.6, color: t.text1, marginBottom: 3, fontFamily: 'inherit' }}>
                    <span style={{ fontWeight: 700, color: t.acc }}>{c.author}：</span>{c.content}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="text" value={inputs[m.id] || ''} onChange={e => setInputs({ ...inputs, [m.id]: e.target.value })} onKeyDown={e => e.key === 'Enter' && comment(m.id)} placeholder="说点什么…" style={{ flex: 1, padding: '7px 12px', fontSize: 12, borderRadius: t.radius > 0 ? 20 : 0, border: t.isPixel ? `2px solid ${t.border}` : `1px solid ${t.border}`, backgroundColor: 'rgba(255,255,255,0.4)', outline: 'none', color: t.text1, fontFamily: 'inherit' }} />
              <button className="tap" onClick={() => comment(m.id)} style={{ backgroundColor: inputs[m.id] ? t.acc : 'transparent', color: inputs[m.id] ? '#fff' : t.text3, border: t.isPixel ? `2px solid ${t.border}` : `1px solid ${inputs[m.id] ? t.acc : t.border}`, padding: '6px 14px', borderRadius: t.radius > 0 ? 20 : 0, fontSize: 12, cursor: 'pointer', fontWeight: 'bold', fontFamily: 'inherit', transition: 'all 0.2s' }}>回复</button>
            </div>
          </Card>
        );
      })}

      {showCompose && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: t.bgColor || '#f4f3ef', display: 'flex', flexDirection: 'column' }}>
          <div style={{ maxWidth: 440, margin: '0 auto', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* 头 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', flexShrink: 0, borderBottom: `0.5px solid ${t.border}` }}>
              <span className="tap" onClick={resetCompose} style={{ fontSize: 14, color: t.text3, cursor: 'pointer', fontFamily: 'inherit' }}>取消</span>
              <span style={{ fontSize: 15, fontWeight: 600, color: t.text1, fontFamily: 'inherit' }}>发布动态</span>
              <span className="tap" onClick={publish} style={{ fontSize: 14, fontWeight: 600, color: (myPost.trim() || cImg) && !posting ? '#fff' : t.text3, background: (myPost.trim() || cImg) && !posting ? t.acc : 'transparent', border: `1px solid ${(myPost.trim() || cImg) && !posting ? t.acc : t.border}`, padding: '5px 16px', borderRadius: 18, cursor: 'pointer', fontFamily: 'inherit' }}>{posting ? '发布中…' : '发布'}</span>
            </div>
            {/* 内容 */}
            <div className="hs" style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
              <textarea autoFocus value={myPost} onChange={e => setMyPost(e.target.value)} placeholder="这一刻的想法…" rows={5} className="hs" style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', resize: 'none', fontSize: 16, color: t.text1, lineHeight: 1.7, fontFamily: 'inherit', boxSizing: 'border-box' }} />
              {/* 图片 */}
              <div style={{ marginTop: 8 }}>
                {cImg
                  ? <div style={{ position: 'relative', width: 110, height: 110 }}>
                      <img src={cImg.preview} alt="" style={{ width: 110, height: 110, objectFit: 'cover', borderRadius: 10, display: 'block' }} />
                      <span className="tap" onClick={() => setCImg(null)} style={{ position: 'absolute', top: -7, right: -7, width: 22, height: 22, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>×</span>
                    </div>
                  : <div className="tap" onClick={() => composeFileRef.current?.click()} style={{ width: 90, height: 90, borderRadius: 10, border: `1px dashed ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: t.text3 }}>
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={t.text3} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="6" x2="12" y2="18"/><line x1="6" y1="12" x2="18" y2="12"/></svg>
                    </div>}
                <input ref={composeFileRef} type="file" accept="image/*" onChange={onPickImg} style={{ display: 'none' }} />
              </div>
              {/* 位置 + 可见性 */}
              <div style={{ marginTop: 20, borderTop: `0.5px solid ${t.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 2px', borderBottom: `0.5px solid ${t.border}` }}>
                  <span style={{ fontSize: 15 }}>📍</span>
                  <input value={cLoc} onChange={e => setCLoc(e.target.value)} placeholder="所在位置（选填）" style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 14, color: t.text1, fontFamily: 'inherit' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 2px' }}>
                  <span style={{ fontSize: 15 }}>{cVis === 'private' ? '🔒' : '🌐'}</span>
                  <span style={{ flex: 1, fontSize: 14, color: t.text1, fontFamily: 'inherit' }}>谁可以看</span>
                  <div style={{ display: 'flex', border: `0.5px solid ${t.border}`, borderRadius: 9, overflow: 'hidden' }}>
                    {[{ v: 'public', label: '公开' }, { v: 'private', label: '私密' }].map(o => (
                      <span key={o.v} className="tap" onClick={() => setCVis(o.v)} style={{ fontSize: 12, padding: '5px 14px', cursor: 'pointer', background: cVis === o.v ? t.acc : 'transparent', color: cVis === o.v ? '#fff' : t.text2, fontFamily: 'inherit' }}>{o.label}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 潮汐心海：情绪记录系统（V/A模型 + 象限图 + timeline）──
function ExpandText({ text, limit = 100, style }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  const long = text.length > limit;
  return (
    <div onClick={() => long && setOpen(o => !o)} style={{ ...style, cursor: long ? 'pointer' : 'default' }}>
      「{open || !long ? text : text.slice(0, limit) + '…'}」
      {long && <span style={{ fontSize: 8, opacity: 0.55, marginLeft: 4, fontStyle: 'normal' }}>{open ? ' 收起' : ' 点开全文'}</span>}
    </div>
  );
}

function EmotionPage({ t }) {
  const CHARS = [
    { id: 'yu', name: '沈屿', accent: '#e0879f' },
  ];
  const [charIdx, setCharIdx] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview'); // overview | timeline | quadrant
  const [selEmotion, setSelEmotion] = useState(null);
  const char = CHARS[charIdx];

  const load = async () => {
    setLoading(true);
    setSelEmotion(null);
    try {
      const res = await fetch(`${BACKEND}/emotions/${char.id}`);
      // 只在 2xx + JSON 时采纳；dev 代理漏配/HTML 回退会让 res.json() 抛错 → 不静默退桩
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('json')) { setData(await res.json()); }
    } catch { /* 保留上一次有效数据，不强制清成 null 退回 0/50 桩 */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, [charIdx]);

  const moodLabel = (score) => {
    if (score >= 90) return '特别活跃';
    if (score >= 70) return '情绪高涨';
    if (score >= 50) return '平稳';
    if (score >= 30) return '低沉';
    return '保护模式';
  };

  const moodColor = (score) => {
    if (score >= 70) return '#d4a373';
    if (score >= 40) return '#8a9ea7';
    return '#a288b6';
  };

  // 象限图 SVG
  const QuadrantChart = ({ dateGroups }) => {
    const allDates = Object.keys(dateGroups || {}).sort().reverse().slice(0, 7);
    const dateColors = ['#d4a373', '#8a9ea7', '#8e9d7d', '#a288b6', '#c0392b', '#e8c170', '#6fc4b0'];
    return (
      <Card t={t} style={{ padding: '16px', marginBottom: 14 }}>
        <div style={{ fontSize: 9, color: t.text3, letterSpacing: '0.1em', marginBottom: 8 }}>EMOTION QUADRANT</div>
        <svg viewBox="0 0 200 200" style={{ width: '100%', maxWidth: 300, display: 'block', margin: '0 auto' }}>
          <line x1="100" y1="10" x2="100" y2="190" stroke={t.border} strokeWidth="0.5" />
          <line x1="10" y1="100" x2="190" y2="100" stroke={t.border} strokeWidth="0.5" />
          <text x="100" y="8" textAnchor="middle" fontSize="6" fill={t.text3}>↑ 激动</text>
          <text x="100" y="198" textAnchor="middle" fontSize="6" fill={t.text3}>↓ 平静</text>
          <text x="8" y="103" textAnchor="start" fontSize="6" fill={t.text3}>负面 ←</text>
          <text x="192" y="103" textAnchor="end" fontSize="6" fill={t.text3}>→ 正面</text>
          <text x="40" y="30" textAnchor="middle" fontSize="5" fill={t.text3}>焦虑 · 愤怒</text>
          <text x="160" y="30" textAnchor="middle" fontSize="5" fill={t.text3}>兴奋 · 狂喜</text>
          <text x="40" y="180" textAnchor="middle" fontSize="5" fill={t.text3}>忧伤 · 厌倦</text>
          <text x="160" y="180" textAnchor="middle" fontSize="5" fill={t.text3}>满足 · 平和</text>
          {allDates.map((date, di) => {
            const points = (dateGroups[date] || []);
            const avgV = Math.max(-1, Math.min(1, points.reduce((s, p) => s + (Number(p.v) || 0), 0) / (points.length || 1)));
            const avgA = Math.max(-1, Math.min(1, points.reduce((s, p) => s + (Number(p.a) || 0), 0) / (points.length || 1)));
            const cx = 100 + avgV * 80;
            const cy = 100 - avgA * 80;
            return <circle key={date} cx={cx} cy={cy} r={4 + Math.min(points.length, 4)} fill={dateColors[di % dateColors.length]} opacity={0.7} />;
          })}
        </svg>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 8 }}>
          {allDates.map((date, di) => (
            <span key={date} style={{ fontSize: 9, padding: '2px 8px', borderRadius: 10, border: `1px solid ${t.border}`, color: t.text2, backgroundColor: di === 0 ? `${dateColors[0]}20` : 'transparent' }}>
              {date.slice(5)} ({(dateGroups[date] || []).length})
            </span>
          ))}
        </div>
      </Card>
    );
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: t.text3 }}>...</div>;

  const stats = data?.stats || { total: 0, emotionCounts: {}, avgV: 0, avgA: 0, moodScore: 50 };
  const logs = data?.logs || [];
  const sortedEmotions = Object.entries(stats.emotionCounts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', padding: '16px 16px 24px', maxWidth: 440, margin: '0 auto', width: '100%' }}>
      <div style={{ fontSize: 10, color: t.text3, letterSpacing: '0.14em', marginBottom: 4 }}>TIDAL HEART</div>
      <div style={{ fontSize: 18, fontWeight: 400, color: t.text1, marginBottom: 6, fontFamily: 'inherit' }}>潮汐心海</div>

      {/* 角色选择 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {CHARS.map((c, i) => (
          <div key={c.id} className="tap" onClick={() => setCharIdx(i)} style={{
            flex: 1, textAlign: 'center', padding: '8px 0', borderRadius: t.radius > 0 ? 10 : 0, cursor: 'pointer',
            backgroundColor: i === charIdx ? `${c.accent}20` : 'transparent',
            border: `1px solid ${i === charIdx ? c.accent : t.border}`, transition: 'all 0.2s',
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: i === charIdx ? c.accent : t.text3, fontFamily: 'inherit' }}>{c.name}</div>
          </div>
        ))}
      </div>

      {/* Tab 切换 */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 14, borderBottom: `1px solid ${t.border}` }}>
        {[['overview', '总览'], ['timeline', '时间线'], ['quadrant', '象限']].map(([k, label]) => (
          <div key={k} className="tap" onClick={() => setTab(k)} style={{
            flex: 1, textAlign: 'center', padding: '8px 0', cursor: 'pointer', fontSize: 11,
            color: tab === k ? char.accent : t.text3,
            borderBottom: tab === k ? `2px solid ${char.accent}` : '2px solid transparent',
            fontWeight: tab === k ? 600 : 400, fontFamily: 'inherit', transition: 'all 0.2s',
          }}>{label}</div>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          {/* Mood Meter */}
          <Card t={t} style={{ padding: '16px', marginBottom: 14 }}>
            <div style={{ fontSize: 9, color: t.text3, letterSpacing: '0.08em', marginBottom: 8 }}>mood</div>
            <div style={{ height: 8, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.06)', overflow: 'hidden', marginBottom: 6 }}>
              <div style={{ height: '100%', width: `${stats.moodScore}%`, borderRadius: 4, backgroundColor: moodColor(stats.moodScore), transition: 'width 0.5s' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 9, color: t.text3 }}>保护</span>
              <span style={{ fontSize: 9, color: t.text3 }}>溢出</span>
            </div>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: t.text1 }}>{stats.moodScore}</span>
              <span style={{ fontSize: 12, color: t.text3 }}> / 100</span>
            </div>
            <div style={{ textAlign: 'center', fontSize: 10, color: moodColor(stats.moodScore), fontWeight: 600 }}>{moodLabel(stats.moodScore)}</div>
          </Card>

          {/* V/A 均值 + 情绪标签 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 12, backgroundColor: `${char.accent}15`, color: char.accent, border: `1px solid ${char.accent}30`, fontWeight: 600 }}>
              共 {stats.total} 条
            </span>
            <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 12, border: `1px solid ${t.border}`, color: t.text2 }}>
              {(() => { const v = Number(stats.avgV) || 0, a = Number(stats.avgA) || 0; const vl = v > 0.15 ? '偏正面' : v < -0.15 ? '偏低落' : '平和'; const al = a > 0.15 ? '活跃' : a < -0.15 ? '低沉' : '平稳'; return `整体 ${vl}·${al}`; })()}
            </span>
            {sortedEmotions.map(([emotion, count]) => (
              <span key={emotion} className="tap" onClick={() => setSelEmotion(selEmotion === emotion ? null : emotion)} style={{ fontSize: 10, padding: '3px 10px', borderRadius: 12, border: `1px solid ${selEmotion === emotion ? char.accent : t.border}`, color: selEmotion === emotion ? char.accent : t.text2, backgroundColor: selEmotion === emotion ? `${char.accent}15` : 'transparent', cursor: 'pointer' }}>
                {emotion} {count}
              </span>
            ))}
          </div>

          {selEmotion && (() => {
            const evs = logs.filter(l => l.emotion === selEmotion);
            const ds = evs.map(e => Number(e.delta) || 0);
            const avgD = ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : 0;
            return (
              <Card t={t} style={{ padding: '14px', marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: char.accent, fontFamily: 'inherit' }}>「{selEmotion}」· 共 {evs.length} 次 · 平均变化 {avgD > 0 ? '+' : ''}{avgD.toFixed(1)}</span>
                  <span className="tap" onClick={() => setSelEmotion(null)} style={{ fontSize: 10, color: t.text3, cursor: 'pointer' }}>收起 ✕</span>
                </div>
                {evs.slice(0, 12).map((e, i) => (
                  <div key={e.id || i} style={{ padding: '5px 0', borderBottom: i < Math.min(evs.length, 12) - 1 ? `0.5px solid ${t.border}` : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 10, color: t.text2, fontFamily: 'inherit' }}>{(e.created_at || '').slice(5, 16).replace('T', ' ')} · {e.activity || (e.event_type === 'lifetick' ? '心跳' : e.event_type)}</span>
                      <span style={{ fontSize: 10, flexShrink: 0, color: (Number(e.delta) || 0) > 0 ? '#8e9d7d' : (Number(e.delta) || 0) < 0 ? '#c0392b' : t.text3 }}>{(Number(e.delta) || 0) > 0 ? '+' : ''}{Number(e.delta) || 0}</span>
                    </div>
                    {e.monologue && <div style={{ fontSize: 10, color: t.text3, fontStyle: 'italic', lineHeight: 1.5, marginTop: 2 }}>「{e.monologue.slice(0, 50)}{e.monologue.length > 50 ? '…' : ''}」</div>}
                  </div>
                ))}
              </Card>
            );
          })()}

          {/* 最近5条事件 */}
          <Card t={t} style={{ padding: '14px', marginBottom: 14 }}>
            <div style={{ fontSize: 9, color: t.text3, letterSpacing: '0.1em', marginBottom: 8 }}>RECENT EVENTS</div>
            {logs.slice(0, 5).map((log, i) => (
              <div key={log.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: i < 4 ? `0.5px solid ${t.border}` : 'none' }}>
                <span style={{ fontSize: 10, color: t.text2, fontFamily: 'inherit' }}>
                  {log.event_type === 'lifetick' ? '心跳' : log.event_type === 'interaction' ? '互动' : log.event_type} · {log.activity || log.emotion}
                </span>
                <span style={{ fontSize: 10, color: log.delta > 0 ? '#8e9d7d' : log.delta < 0 ? '#c0392b' : t.text3 }}>
                  {log.delta > 0 ? '+' : ''}{log.delta}
                </span>
              </div>
            ))}
          </Card>
        </>
      )}

      {tab === 'timeline' && (
        <div style={{ position: 'relative', paddingLeft: 0 }}>
          {/* 中轴线 */}
          <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1.5, backgroundColor: `${char.accent}30`, transform: 'translateX(-50%)' }} />
          {logs.map((log, i) => {
            const time = new Date(log.created_at);
            const timeStr = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;
            const dateStr = log.created_at?.slice(0, 10);
            const showDate = i === 0 || logs[i - 1]?.created_at?.slice(0, 10) !== dateStr;
            const isLeft = i % 2 === 0;
            return (
              <React.Fragment key={log.id || i}>
                {showDate && (
                  <div style={{ textAlign: 'center', position: 'relative', zIndex: 2, margin: `${i > 0 ? 16 : 0}px 0 12px` }}>
                    <span style={{ fontSize: 9, color: t.text3, backgroundColor: t.bg || '#f5f0eb', padding: '2px 12px', borderRadius: 10, border: `1px solid ${t.border}` }}>{dateStr}</span>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 14, flexDirection: isLeft ? 'row' : 'row-reverse' }}>
                  <Card t={t} style={{ flex: 1, padding: '10px 12px', maxWidth: 'calc(50% - 16px)', borderTop: `2px solid ${char.accent}40` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                      <span style={{ fontSize: 9, color: t.text3 }}>{timeStr}</span>
                      <span style={{ fontSize: 9, color: log.delta > 0 ? '#8e9d7d' : log.delta < 0 ? '#c0392b' : t.text3, fontWeight: 600 }}>{log.delta > 0 ? '+' : ''}{log.delta}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: char.accent, fontFamily: 'inherit' }}>{log.emotion}</span>
                      {log.activity && <span style={{ fontSize: 8, color: t.text3, padding: '1px 6px', borderRadius: 8, backgroundColor: `${char.accent}10`, border: `0.5px solid ${t.border}` }}>{log.activity}</span>}
                    </div>
                    {log.monologue && <ExpandText text={log.monologue} limit={100} style={{ fontSize: 11, color: t.text1, lineHeight: 1.7, fontFamily: 'inherit', fontStyle: 'italic' }} />}
                  </Card>
                  {/* 节点 */}
                  <div style={{ width: 32, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: char.accent, border: `2px solid ${t.card || '#fff'}`, marginTop: 12 }} />
                  </div>
                  <div style={{ flex: 1, maxWidth: 'calc(50% - 16px)' }} />
                </div>
              </React.Fragment>
            );
          })}
          {logs.length === 0 && <div style={{ textAlign: 'center', color: t.text3, fontSize: 12, marginTop: 40 }}>还没有情绪记录</div>}
        </div>
      )}

      {tab === 'quadrant' && <QuadrantChart dateGroups={data?.dateGroups || {}} />}
    </div>
  );
}

const BUILD_TAG = 'v6.99.0';
function DashboardPage({ t, setScreen }) {
  const [stats, setStats] = useState(null);
  const [charStates, setCharStates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${BACKEND}/dashboard/stats`).then(r => r.json()).catch(() => null),
      fetch(`${BACKEND}/char-states`).then(r => r.json()).catch(() => ({ states: [] })),
    ]).then(([s, cs]) => {
      if (s) setStats(s);
      setCharStates(cs?.states || []);
      setLoading(false);
    });
  }, []);

  const CHAR_NAMES = { yu: '沈屿' };
  const CHAR_COLORS = { yu: '#e0879f' };

  if (loading) return <div style={{ padding: 24, textAlign: 'center', color: t.text3, fontFamily: 'inherit' }}>加载中…</div>;

  const todayTotal = stats ? Object.values(stats.todayUsage || {}).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="hs" style={{ padding: '20px 16px', overflowY: 'auto', flex: 1 }}>
      <div style={{ fontSize: 18, fontWeight: 600, color: t.text1, marginBottom: 18, fontFamily: 'inherit', textAlign: 'center' }}>小满仪表盘</div>

      {/* 角色当前状态（LifeTick 心跳）*/}
      {charStates.length > 0 && (
        <Card t={t} style={{ padding: '16px 18px', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 11, color: t.text3, fontFamily: 'inherit', letterSpacing: '0.08em' }}>LIVE STATUS</span>
            <span className="tap" onClick={() => setScreen('lifetick')} style={{ fontSize: 10, color: t.acc, cursor: 'pointer', fontFamily: 'inherit' }}>查看全部 ›</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {['yu'].map(cid => {
              const st = charStates.find(s => s.character_id === cid);
              if (!st) return null;
              const ago = st.updated_at ? Math.round((Date.now() - new Date(st.updated_at)) / 60000) : null;
              return (
                <div key={cid} style={{ borderLeft: `3px solid ${CHAR_COLORS[cid]}`, paddingLeft: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: CHAR_COLORS[cid], fontFamily: 'inherit' }}>{CHAR_NAMES[cid]}</span>
                    <span style={{ fontSize: 10, color: t.text3 }}>{st.mood}</span>
                    {ago !== null && <span style={{ fontSize: 9, color: t.text3, marginLeft: 'auto' }}>{ago < 60 ? `${ago}m ago` : `${Math.floor(ago/60)}h ago`}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: t.text2, marginBottom: 3, fontFamily: 'inherit' }}>{st.activity}</div>
                  {st.monologue && (
                    <div style={{ fontSize: 11, color: t.text3, fontStyle: 'italic', lineHeight: 1.6, fontFamily: 'inherit' }}>"{st.monologue}"</div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {stats && (
        <>
          <Card t={t} style={{ padding: '16px 18px', marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: t.text3, marginBottom: 10, fontFamily: 'inherit', letterSpacing: '0.08em' }}>MESSAGE OVERVIEW</div>
            <div style={{ display: 'flex', justifyContent: 'space-around' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 600, color: t.text1 }}>{stats.msgCount}</div>
                <div style={{ fontSize: 10, color: t.text3 }}>total</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 600, color: t.acc }}>{stats.todayMsgCount}</div>
                <div style={{ fontSize: 10, color: t.text3 }}>today</div>
              </div>
            </div>
          </Card>

          <Card t={t} style={{ padding: '16px 18px', marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: t.text3, marginBottom: 10, fontFamily: 'inherit', letterSpacing: '0.08em' }}>PER CHARACTER</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(stats.charStats || {}).map(([cid, count]) => {
                const maxCount = Math.max(1, ...Object.values(stats.charStats));
                return (
                  <div key={cid} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 50, fontSize: 11, fontWeight: 600, color: CHAR_COLORS[cid], fontFamily: 'inherit' }}>{CHAR_NAMES[cid]}</div>
                    <div style={{ flex: 1, height: 14, backgroundColor: 'rgba(0,0,0,0.04)', borderRadius: t.radius > 0 ? 7 : 0, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(count / maxCount) * 100}%`, backgroundColor: CHAR_COLORS[cid], borderRadius: t.radius > 0 ? 7 : 0, transition: 'width 0.5s ease' }} />
                    </div>
                    <div style={{ width: 40, fontSize: 11, color: t.text2, textAlign: 'right' }}>{count}</div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card t={t} style={{ padding: '16px 18px', marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: t.text3, marginBottom: 10, fontFamily: 'inherit', letterSpacing: '0.08em' }}>API USAGE TODAY · {todayTotal} calls</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(stats.providers || []).map(name => {
                const todayCalls = (stats.todayUsage || {})[name] || 0;
                const todayTk = (stats.todayTokens || {})[name] || 0;
                const totalTk = (stats.totalTokens || {})[name] || 0;
                const cd = (stats.cooldowns || {})[name];
                const fmtTk = (n) => n >= 1000 ? `${(n/1000).toFixed(1)}k` : `${n}`;
                return (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontFamily: 'inherit' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: name === stats.currentProvider ? '#22c55e' : (cd ? '#ef4444' : t.text3), flexShrink: 0 }} />
                    <span style={{ flex: 1, color: t.text2, fontSize: 10 }}>{name}</span>
                    <span style={{ color: t.text3, fontSize: 9 }}>{todayCalls}次 · {fmtTk(todayTk)} / {fmtTk(totalTk)} tok</span>
                    {cd && <span style={{ fontSize: 9, color: '#ef4444' }}>冷却{cd}s</span>}
                  </div>
                );
              })}
            </div>
          </Card>

          <Card t={t} style={{ padding: '16px 18px', marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: t.text3, marginBottom: 8, fontFamily: 'inherit', letterSpacing: '0.08em' }}>STATUS</div>
            <div style={{ fontSize: 12, color: t.text2, lineHeight: 1.8, fontFamily: 'inherit' }}>
              <div>Active Provider: <span style={{ color: '#22c55e', fontWeight: 600 }}>{stats.currentProvider}</span></div>
              <div>Total Providers: {stats.providers?.length || 0}</div>
            </div>
          </Card>
        </>
      )}

      <Card t={t} style={{ padding: '14px 18px', marginBottom: 30 }}>
        <div style={{ fontSize: 11, color: t.text3, marginBottom: 8, fontFamily: 'inherit', letterSpacing: '0.08em' }}>APP</div>
        <button className="tap" onClick={async () => {
          try {
            // 1) 删掉所有 Cache Storage（含 Workbox 预缓存的旧版 index/资源）
            if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); }
            // 2) 注销所有 Service Worker —— 下次加载完全走网络，必拿到最新版（之后会自动重新注册）
            if (navigator.serviceWorker) { const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map(r => r.unregister().catch(() => {}))); }
          } catch {}
          // 3) 带时间戳跳转，绕过 HTTP/磁盘缓存
          location.replace(location.pathname + '?_r=' + Date.now());
        }} style={{ width: '100%', padding: '11px', fontSize: 13, fontWeight: 600, color: '#fff', backgroundColor: t.acc, border: 'none', borderRadius: t.radius > 0 ? 12 : 0, cursor: 'pointer', fontFamily: 'inherit' }}>↻ 强制刷新 · 拉取最新版本</button>
        <div style={{ fontSize: 9, color: t.text3, marginTop: 8, lineHeight: 1.6, fontFamily: 'inherit', textAlign: 'center' }}>清缓存 + 注销 Service Worker 后重载，确保拿到最新版本。点完看这里版本号变成 {BUILD_TAG} 即生效。</div>
      </Card>
    </div>
  );
}
