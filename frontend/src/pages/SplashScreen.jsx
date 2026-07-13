import React, { useState, useEffect, useRef, useCallback } from 'react';

const BACKEND = 'https://your-domain.example';

const CHARACTERS = [
  {
    id: 'ciel', name: '沈晟', en: 'Ciel', initial: 'C',
    accent: '#d4a373',
    models: [
      { label: 'Claude Sonnet 4.6', value: 'claude-4.6-sonnet' },
      { label: 'Claude Opus 4.7', value: 'anthropic/claude-4.7-opus' },
    ]
  },
  {
    id: 'zephyr', name: '谢知予', en: 'Zephyr', initial: 'Z',
    accent: '#8a9ea7',
    models: [
      { label: 'Gemini 3.1 Pro', value: 'gemini-3.1-pro-preview' },
      { label: 'Gemini 3.1 Flash', value: 'gemini-3.1-flash-lite-preview' },
    ]
  },
  {
    id: 'wren', name: '魏珩', en: 'Wren', initial: 'W',
    accent: '#8e9d7d',
    models: [{ label: 'GPT-5.5', value: 'openai/gpt-5.5' }]
  },
  {
    id: 'lash', name: '贺临', en: 'Lash', initial: 'L',
    accent: '#a288b6',
    models: [
      { label: 'Grok 4.1 Fast', value: 'x-ai/grok-4.1-fast' },
      { label: 'Grok 4 Reasoning', value: 'x-ai/grok-4-fast-reasoning' },
    ]
  },
];

const THEMES = [
  {
    id: 'sunset', name: '水彩晕染',
    bgColor: '#fdf8f4',
    bgImage: 'radial-gradient(ellipse at 15% 25%, rgba(255,210,180,0.55) 0%, transparent 55%), radial-gradient(ellipse at 85% 75%, rgba(190,210,255,0.45) 0%, transparent 55%), radial-gradient(ellipse at 50% 50%, rgba(255,230,240,0.4) 0%, transparent 65%)',
    card: 'rgba(255,255,255,0.52)', border: 'rgba(255,255,255,0.75)',
    text1: '#4a3c34', text2: '#7a6858', text3: '#b09880', acc: '#d4926a',
    shadow: '0 6px 28px rgba(200,130,80,0.10)', blur: '18px', radius: 20,
    font: "'Georgia','Noto Serif SC',serif",
    navIcons: ['✦', '❋', '◈'],
  },
  {
    id: 'glass', name: '极光磨砂',
    bgColor: '#cfd4dc',
    bgImage: 'radial-gradient(ellipse at 20% 15%, rgba(220,210,235,0.8) 0%, transparent 55%), radial-gradient(ellipse at 80% 85%, rgba(200,220,240,0.7) 0%, transparent 55%), radial-gradient(ellipse at 55% 45%, rgba(240,235,250,0.6) 0%, transparent 60%)',
    card: 'rgba(255,255,255,0.22)', border: 'rgba(255,255,255,0.38)',
    cardGlow: 'inset 0 1px 0 rgba(255,255,255,0.7), inset 0 -1px 0 rgba(255,255,255,0.1)',
    text1: '#2e2c30', text2: '#5a5860', text3: '#8e8c96', acc: '#7a88c8',
    shadow: '0 8px 32px rgba(80,80,140,0.10), inset 0 1px 0 rgba(255,255,255,0.6)', blur: '36px', radius: 22,
    font: "'Helvetica Neue',Helvetica,Arial,sans-serif",
    navIcons: ['⌂', '◎', '⊞'],
    isGlass: true,
  },
  {
    id: 'pixel', name: '清爽像素',
    bgColor: '#f0ede6',
    bgImage: 'repeating-linear-gradient(0deg, transparent, transparent 15px, rgba(0,0,0,0.04) 15px, rgba(0,0,0,0.04) 16px), repeating-linear-gradient(90deg, transparent, transparent 15px, rgba(0,0,0,0.04) 15px, rgba(0,0,0,0.04) 16px)',
    card: '#ffffff', border: '#1a1a1a',
    text1: '#0f0f0f', text2: '#3a3a3a', text3: '#6a6a6a', acc: '#cc2200',
    shadow: '4px 4px 0 #1a1a1a', blur: '0px', radius: 0,
    font: "'Courier New',Courier,monospace",
    navIcons: ['[H]', '[C]', '[F]'],
    isPixel: true,
  },
  {
    id: 'collage', name: '复古拼贴',
    bgColor: '#e8e0d2',
    bgImage: 'repeating-linear-gradient(92deg, transparent, transparent 120px, rgba(0,0,0,0.018) 120px, rgba(0,0,0,0.018) 121px), repeating-linear-gradient(185deg, transparent, transparent 80px, rgba(0,0,0,0.012) 80px, rgba(0,0,0,0.012) 81px)',
    card: 'rgba(255,252,242,0.92)', border: 'rgba(60,40,20,0.25)',
    text1: '#2a1f0e', text2: '#5a4530', text3: '#9a8060', acc: '#c0392b',
    shadow: '2px 3px 0 rgba(0,0,0,0.12), 4px 6px 12px rgba(0,0,0,0.06)', blur: '0px', radius: 2,
    font: "'Georgia','Noto Serif SC',serif",
    navIcons: ['⌂', '✉', '◉'],
    isCollage: true,
  },
];

const MOODS = [
  { id: 'happy', label: '开心', svg: <svg width="26" height="26" viewBox="0 0 54 54" fill="none"><path d="M4 28 Q3 12 16 5 Q30 -1 43 8 Q54 17 51 32 Q49 46 36 51 Q21 56 11 46 Q3 38 4 28Z" fill="#F2C9A8"/><circle cx="18" cy="22" r="2.8" fill="#1a1a1a"/><circle cx="33" cy="21" r="3.1" fill="#1a1a1a"/><path d="M13 33 Q20 42 33 37" stroke="#1a1a1a" strokeWidth="2.8" strokeLinecap="round" fill="none"/><path d="M33 37 Q38 34 37 30" stroke="#1a1a1a" strokeWidth="2.8" strokeLinecap="round" fill="none"/></svg> },
  { id: 'content', label: '满足', svg: <svg width="26" height="26" viewBox="0 0 54 54" fill="none"><path d="M6 26 Q5 10 19 4 Q33 -1 44 9 Q55 19 50 34 Q45 48 31 52 Q17 56 9 45 Q3 36 6 26Z" fill="#F5D03A"/><circle cx="19" cy="24" r="2.6" fill="#1a1a1a"/><circle cx="35" cy="23" r="2.9" fill="#1a1a1a"/><path d="M22 34 Q27 39 33 34" stroke="#1a1a1a" strokeWidth="2.8" strokeLinecap="round" fill="none"/></svg> },
  { id: 'annoyed', label: '烦透了', svg: <svg width="26" height="26" viewBox="0 0 54 54" fill="none"><path d="M5 20 Q7 4 22 3 Q38 2 47 13 Q56 25 50 40 Q44 54 28 53 Q12 53 6 40 Q2 30 5 20Z" fill="#9BAA6A"/><path d="M14 17 L20 24 M20 17 L14 24" stroke="#1a1a1a" strokeWidth="3" strokeLinecap="round"/><path d="M31 16 L38 23 M38 16 L31 23" stroke="#1a1a1a" strokeWidth="3" strokeLinecap="round"/><path d="M13 36 Q17 33 21 36 Q25 39 29 35 Q33 32 38 36" stroke="#1a1a1a" strokeWidth="2.8" strokeLinecap="round" fill="none"/></svg> },
  { id: 'blank', label: '呆住了', svg: <svg width="26" height="26" viewBox="0 0 54 54" fill="none"><path d="M5 25 Q4 9 18 4 Q33 -1 44 10 Q55 21 51 37 Q47 51 32 53 Q16 56 8 43 Q3 33 5 25Z" fill="#6FC4B0"/><rect x="9" y="18" width="15" height="15" rx="6" stroke="#1a1a1a" strokeWidth="2.8" fill="none" transform="rotate(-3 16 25)"/><rect x="28" y="17" width="15" height="15" rx="6" stroke="#1a1a1a" strokeWidth="2.8" fill="none" transform="rotate(4 35 24)"/><circle cx="16.5" cy="25" r="2.8" fill="#1a1a1a"/><circle cx="35" cy="24" r="2.8" fill="#1a1a1a"/><line x1="17" y1="40" x2="29" y2="41" stroke="#1a1a1a" strokeWidth="3" strokeLinecap="round"/></svg> },
  { id: 'sad', label: '难过', svg: <svg width="26" height="26" viewBox="0 0 54 54" fill="none"><path d="M5 26 Q3 10 17 4 Q32 -2 44 9 Q55 20 51 36 Q47 50 32 53 Q15 56 8 43 Q3 33 5 26Z" fill="#8BB8D8"/><circle cx="19" cy="23" r="3.5" fill="#1a1a1a"/><circle cx="34" cy="22" r="2.8" fill="#1a1a1a"/><path d="M17 38 Q25 33 36 37" stroke="#1a1a1a" strokeWidth="2.8" strokeLinecap="round" fill="none"/></svg> },
  { id: 'sleepy', label: '困困', svg: <svg width="26" height="26" viewBox="0 0 54 54" fill="none"><path d="M7 27 Q6 11 20 5 Q35 -1 46 11 Q56 23 51 38 Q46 53 30 54 Q14 56 8 43 Q4 33 7 27Z" fill="#F0A898"/><path d="M13 22 Q18 19 23 22" stroke="#1a1a1a" strokeWidth="3" strokeLinecap="round" fill="none"/><ellipse cx="18" cy="24" rx="4" ry="2.2" fill="#1a1a1a"/><path d="M29 21 Q34 18 40 21" stroke="#1a1a1a" strokeWidth="3" strokeLinecap="round" fill="none"/><ellipse cx="34" cy="23" rx="3.5" ry="2" fill="#1a1a1a"/><ellipse cx="24" cy="36" rx="3.5" ry="4" stroke="#1a1a1a" strokeWidth="2.4" fill="none"/></svg> },
];

const WEATHER_CODES = { 0:'晴',1:'基本晴',2:'多云',3:'阴',45:'雾',48:'雾',51:'细雨',53:'毛毛雨',55:'大毛毛雨',61:'小雨',63:'中雨',65:'大雨',71:'小雪',73:'中雪',75:'大雪',80:'阵雨',81:'中阵雨',82:'大阵雨',95:'雷雨',96:'雷阵雨',99:'强雷雨' };

// ── 工具函数 ──
function getSavedSessions() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; } }
function saveSession(charId, sessionId) { const s = getSavedSessions(); s[charId] = sessionId; localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }

// ★ 严格过滤系统隐藏消息 — 这些不应该出现在对话框中
function isHiddenSystemPrompt(text) {
  if (!text) return false;
  // 标记为 _hidden 的直接过滤
  return false; // 我们改用 _hidden 字段而非内容匹配
}

// ★ 重写 thinking 分离 — 修复丢字
function splitThinkingReply(raw) {
  if (!raw) return { thinking: null, reply: '', thinkingOpen: false };
  const openTag = '<thinking>';
  const closeTag = '</thinking>';
  const openIdx = raw.indexOf(openTag);
  if (openIdx === -1) return { thinking: null, reply: raw, thinkingOpen: false };
  
  const closeIdx = raw.indexOf(closeTag, openIdx + openTag.length);
  const before = raw.slice(0, openIdx);
  
  if (closeIdx !== -1) {
    const thinking = raw.slice(openIdx + openTag.length, closeIdx);
    const after = raw.slice(closeIdx + closeTag.length);
    return { thinking: thinking.trim(), reply: (before + after).trim(), thinkingOpen: false };
  }
  // thinking 还没闭合
  const thinking = raw.slice(openIdx + openTag.length);
  return { thinking: thinking.trim(), reply: before.trim(), thinkingOpen: true };
}

// ★ 核心修复：流式SSE读取器 — 正确处理 buffer 残留，不丢字
async function streamSSE(url, body, onChunk, onDone) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let sseBuffer = '';   // SSE行级别的buffer
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    sseBuffer += decoder.decode(value, { stream: true });
    
    // 按换行拆分，最后一个可能不完整，保留在buffer中
    const parts = sseBuffer.split('\n');
    sseBuffer = parts.pop() || '';
    
    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const jsonStr = trimmed.slice(6);
      if (!jsonStr) continue;
      try {
        const parsed = JSON.parse(jsonStr);
        if (parsed.text) {
          fullText += parsed.text;
          onChunk(fullText);
        }
        if (parsed.done) {
          onDone(fullText);
          return fullText;
        }
      } catch (e) {
        // JSON解析失败，可能是不完整的数据，忽略
      }
    }
  }
  
  // 处理 buffer 中残留的最后一行
  if (sseBuffer.trim()) {
    const trimmed = sseBuffer.trim();
    if (trimmed.startsWith('data: ')) {
      try {
        const parsed = JSON.parse(trimmed.slice(6));
        if (parsed.text) {
          fullText += parsed.text;
          onChunk(fullText);
        }
      } catch {}
    }
  }
  
  // flush decoder
  const tail = decoder.decode();
  if (tail) {
    fullText += tail;
    onChunk(fullText);
  }
  
  onDone(fullText);
  return fullText;
}

// 静默请求（树洞、状态用）
const fetchSystemChat = async (charId, prompt, sessionId) => {
  try {
    const char = CHARACTERS.find(c => c.id === charId) || CHARACTERS[0];
    let result = '';
    await streamSSE(`${BACKEND}/chat`, {
      message: prompt, session_id: sessionId, character_id: charId,
      model: char.models[0].value, max_tokens: 4000
    }, (full) => { result = full; }, () => {});
    return splitThinkingReply(result).reply || result;
  } catch { return null; }
};
// ── 卡片组件 ──
function Card({ t, style, children, onClick, className }) {
  const base = {
    backgroundColor: t.card, backdropFilter: `blur(${t.blur})`, WebkitBackdropFilter: `blur(${t.blur})`,
    border: t.isPixel ? `2px solid ${t.border}` : `1px solid ${t.border}`, borderRadius: t.radius,
    boxShadow: t.isGlass ? (t.cardGlow + ', ' + t.shadow) : t.shadow, position: 'relative', transition: 'all 0.25s ease',
  };
  if (t.isCollage) {
    base.transform = `rotate(${Math.random() > 0.5 ? 0.3 : -0.3}deg)`;
    base.borderTop = `3px solid rgba(0,0,0,0.15)`;
  }
  return <div style={{ ...base, ...style }} onClick={onClick} className={className}>{children}</div>;
}

// ── Thinking 折叠 ──
function ThinkingPill({ thinking, thinkingOpen, char, t }) {
  const [open, setOpen] = useState(false);
  if (!thinking && !thinkingOpen) return null;
  return (
    <div style={{ alignSelf: 'flex-start', width: '100%', marginBottom: 4, textAlign: 'left' }}>
      <button onClick={() => setOpen(v => !v)} style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: t.text3, cursor: 'pointer',
        padding: '4px 12px', borderRadius: t.isPixel ? 0 : 20, border: t.isPixel ? `2px solid ${t.border}` : `1px solid ${t.border}`,
        backgroundColor: t.card, backdropFilter: `blur(${t.blur})`, fontFamily: 'inherit', letterSpacing: '0.04em', outline: 'none', transition: 'all 0.2s',
      }}>
        <span style={{ fontSize: 9, opacity: 0.6 }}>✦</span>
        {thinkingOpen ? '思考中…' : open ? '收起内心' : '洞察内心'}
        {!thinkingOpen && <span style={{ fontSize: 9, opacity: 0.5 }}>{open ? '▴' : '▾'}</span>}
      </button>
      {(open || thinkingOpen) && (
        <div style={{
          marginTop: 8, fontSize: 13, color: t.text3, lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          fontStyle: 'italic', fontFamily: 'inherit', animation: 'fadeIn 0.3s ease', textAlign: 'left'
        }}>
          {thinking}
          {thinkingOpen && <span style={{ display: 'inline-block', width: 1.5, height: '0.85em', backgroundColor: t.text3, marginLeft: 2, animation: 'cursorBlink 0.9s step-end infinite', verticalAlign: 'text-bottom', borderRadius: 1 }} />}
        </div>
      )}
    </div>
  );
}

function MessageBody({ content, isLong }) {
  if (!content) return null;
  const text = isLong ? content.replace(/\n{2,}/g, '\n').trim() : content.replace(/\n+/g, ' ').trim();
  return <span style={{ whiteSpace: isLong ? 'pre-wrap' : 'normal', wordBreak: 'break-word', display: 'block', fontFamily: 'inherit', textAlign: 'left' }}>{text}</span>;
}

// ── 天气 ──
function WeatherWidget({ t }) {
  const [w, setW] = useState(null);
  useEffect(() => {
    fetch('https://api.open-meteo.com/v1/forecast?latitude=31.2304&longitude=121.4737&current=temperature_2m,weathercode,windspeed_10m&timezone=Asia/Shanghai')
      .then(r => r.json()).then(d => { setW({ temp: Math.round(d.current.temperature_2m), desc: WEATHER_CODES[d.current.weathercode] || '未知', wind: d.current.windspeed_10m > 20 ? '风大' : d.current.windspeed_10m > 10 ? '微风' : '无风' }); }).catch(() => {});
  }, []);
  if (!w) return <span style={{ fontSize: 12, color: t.text3 }}>获取中…</span>;
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span style={{ fontSize: 22, fontWeight: t.isPixel ? 700 : 400, color: t.text1, fontFamily: 'inherit' }}>{w.temp}°</span>
      <span style={{ fontSize: 12, color: t.text2, fontFamily: 'inherit' }}>{w.desc} · {w.wind}</span>
    </div>
  );
}

// ── 侧栏项 ──
function SideItem({ icon, label, sub, active, t, collapsed, onClick, accent, isChar }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: collapsed ? '10px 0' : '10px 18px', justifyContent: collapsed ? 'center' : 'flex-start', cursor: 'pointer', backgroundColor: active ? `${accent}18` : 'transparent', borderLeft: active ? `3px solid ${accent}` : '3px solid transparent', transition: 'all 0.18s' }}>
      <div style={{ width: 30, height: 30, flexShrink: 0, borderRadius: t.isPixel ? 0 : (isChar ? '50%' : 8), border: t.isPixel ? `2px solid ${t.border}` : `1px solid ${t.border}`, backgroundColor: `rgba(0,0,0,0.04)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isChar ? 12 : 15, color: isChar ? accent : t.text2, fontWeight: 700 }}>{icon}</div>
      {!collapsed && (
        <div>
          <div style={{ fontSize: 13, fontWeight: t.isPixel ? 700 : 500, color: t.text1, fontFamily: 'inherit' }}>{label}</div>
          <div style={{ fontSize: 10, color: t.text3, fontFamily: 'inherit' }}>{sub}</div>
        </div>
      )}
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
  const days = Math.floor((Date.now() - new Date('2026-06-11')) / 86400000) + 1;
  return (
    <div onClick={onEnter} style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backgroundColor: t.bgColor, backgroundImage: t.bgImage, fontFamily: t.font, zIndex: 100 }}>
      <div style={{ textAlign: 'center', opacity: vis ? 1 : 0, transform: vis ? 'translateY(0)' : 'translateY(18px)', transition: 'opacity 1s ease, transform 1s ease' }}>
        <p style={{ fontSize: 10, color: t.text3, letterSpacing: '0.24em', marginBottom: 24 }}>WELCOME HOME</p>
        <h1 style={{ fontSize: 42, fontWeight: t.isPixel ? 700 : 400, color: t.text1, margin: '0 0 18px' }}>Yan & Ciel</h1>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, justifyContent: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 58, color: t.text1, fontWeight: t.isPixel ? 700 : 400, lineHeight: 1 }}>{days}</span>
          <span style={{ fontSize: 11, color: t.text3, letterSpacing: '0.12em' }}>DAYS TOGETHER</span>
        </div>
        <p style={{ fontSize: 11, color: t.acc, marginBottom: 34 }}>since June 11, 2026</p>
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

function HomePage({ themeIdx, setThemeIdx, t, onChat, globalNote, noteFetching, fetchGlobalNote, globalStatuses, globalTodos, saveGlobalTodos }) {
  const [mood, setMood] = useState(null);
  const [newTodo, setNewTodo] = useState('');
  const days = Math.floor((Date.now() - new Date('2026-06-11')) / 86400000) + 1;
  const toggleTodo = id => saveGlobalTodos(globalTodos.map(td => td.id === id ? { ...td, done: !td.done } : td));
  const addTodo = () => { if (!newTodo.trim()) return; saveGlobalTodos([...globalTodos, { id: Date.now(), text: newTodo.trim(), done: false }]); setNewTodo(''); };
  const cardBase = { padding: '14px 16px', marginBottom: 10, borderRadius: t.radius };

  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', padding: '20px 18px 24px', maxWidth: 430, margin: '0 auto', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
        <span style={{ fontSize: 10, color: t.text3, letterSpacing: '0.1em' }}>THEME</span>
        {THEMES.map((th, i) => (
          <div key={i} className="tap" onClick={() => setThemeIdx(i)} style={{ width: 18, height: 18, borderRadius: th.isPixel ? 0 : '50%', cursor: 'pointer', backgroundColor: th.bgColor, backgroundImage: th.bgImage, border: `2px solid ${themeIdx === i ? th.acc : 'rgba(0,0,0,0.15)'}`, transition: 'all 0.2s', boxShadow: themeIdx === i ? `0 0 0 2px ${th.acc}44` : 'none' }} />
        ))}
      </div>
      <p style={{ fontSize: 10, color: t.text3, letterSpacing: '0.12em', marginBottom: 16 }}>{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}</p>
      <div style={{ marginBottom: 18 }}>
        <p style={{ fontSize: 10, color: t.text3, letterSpacing: '0.16em', marginBottom: 8 }}>WELCOME HOME</p>
        <h1 style={{ fontSize: 28, fontWeight: t.isPixel ? 700 : 400, color: t.text1, margin: '0 0 10px' }}>Yan <span style={{ color: t.acc }}>&</span> Ciel</h1>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 46, fontWeight: t.isPixel ? 700 : 400, color: t.text1, lineHeight: 1 }}>{days}</span>
          <span style={{ fontSize: 11, color: t.text3, letterSpacing: '0.08em' }}>DAYS TOGETHER</span>
        </div>
      </div>
      <Card t={t} style={{ ...cardBase, cursor: 'pointer' }} onClick={fetchGlobalNote} className={t.isCollage ? 'collage-tape' : ''}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 10, color: t.text3, letterSpacing: '0.08em', fontWeight: 'bold' }}>{globalNote.author} 的树洞</span>
          <span style={{ fontSize: 10, color: t.acc, opacity: noteFetching ? 1 : 0.4 }}>{noteFetching ? '感知中…' : '点击刷新'}</span>
        </div>
        <p style={{ fontSize: 13, color: t.text1, lineHeight: 1.9, margin: 0, animation: 'fadeIn 0.5s ease' }} key={globalNote.text}>{globalNote.text}</p>
      </Card>
      <Card t={t} style={{ ...cardBase }}>
        <p style={{ fontSize: 10, color: t.text3, letterSpacing: '0.08em', marginBottom: 10, fontWeight: 'bold' }}>LIVE STATUS</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {globalStatuses.map(c => (
            <div key={c.id} className="tap" onClick={() => onChat(c.id, 'short')} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '6px 8px', borderRadius: t.radius > 0 ? 10 : 0, border: t.isPixel ? `1px solid ${t.border}` : `0.5px solid ${t.border}`, backgroundColor: 'rgba(255,255,255,0.3)' }}>
              <div style={{ width: 22, height: 22, borderRadius: t.isPixel ? 0 : '50%', flexShrink: 0, border: `1.5px solid ${c.accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: c.accent, fontWeight: 700 }}>{c.initial}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: t.text1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                <div style={{ fontSize: 10, color: t.text3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.status}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <Card t={t} style={{ padding: '14px 16px' }}>
          <p style={{ fontSize: 10, color: t.text3, letterSpacing: '0.08em', marginBottom: 8, fontWeight: 'bold' }}>上海</p>
          <WeatherWidget t={t} />
        </Card>
        <Card t={t} style={{ padding: '14px 12px' }}>
          <p style={{ fontSize: 10, color: t.text3, letterSpacing: '0.08em', marginBottom: 8, fontWeight: 'bold' }}>心情</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {MOODS.map(m => (
              <div key={m.id} className="tap" onClick={() => setMood(m.id)} title={m.label} style={{ cursor: 'pointer', borderRadius: '50%', border: `2px solid ${mood === m.id ? t.acc : 'transparent'}`, transition: 'border-color 0.15s', lineHeight: 0 }}>{m.svg}</div>
            ))}
          </div>
          {mood && <p style={{ fontSize: 10, color: t.text3, marginTop: 4 }}>{MOODS.find(m => m.id === mood)?.label}</p>}
        </Card>
      </div>
      <Card t={t} style={{ ...cardBase }}>
        <p style={{ fontSize: 10, color: t.text3, letterSpacing: '0.08em', marginBottom: 10, fontWeight: 'bold' }}>待办</p>
        {globalTodos.slice(0, 4).map((td, i) => (
          <div key={td.id} onClick={() => toggleTodo(td.id)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0', cursor: 'pointer', borderBottom: i < Math.min(globalTodos.length, 4) - 1 ? `0.5px solid ${t.border}` : 'none' }}>
            <div style={{ width: 14, height: 14, borderRadius: t.isPixel ? 0 : '50%', flexShrink: 0, border: `1.5px solid ${td.done ? t.acc : t.border}`, backgroundColor: td.done ? `${t.acc}22` : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {td.done && <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: t.acc }} />}
            </div>
            <span style={{ fontSize: 13, color: td.done ? t.text3 : t.text1, textDecoration: td.done ? 'line-through' : 'none', flex: 1, textAlign: 'left' }}>{td.text}</span>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <input value={newTodo} onChange={e => setNewTodo(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTodo()} placeholder="添加待办…" style={{ flex: 1, fontSize: 12, padding: '6px 10px', border: t.isPixel ? `2px solid ${t.border}` : `1px solid ${t.border}`, borderRadius: t.radius > 0 ? 16 : 0, backgroundColor: 'rgba(255,255,255,0.4)', outline: 'none', color: t.text1, fontFamily: 'inherit' }} />
          <button className="tap" onClick={addTodo} style={{ padding: '6px 14px', backgroundColor: t.acc, color: '#fff', border: 'none', borderRadius: t.radius > 0 ? 16 : 0, fontSize: 12, cursor: 'pointer', fontWeight: 'bold', fontFamily: 'inherit' }}>+</button>
        </div>
      </Card>
    </div>
  );
}

function FeaturesPage({ t, setScreen }) {
  const cards = [
    { id: 'moments', icon: '📸', title: '朋友圈', desc: '大家的日常碎碎念' },
    { id: 'mood', icon: '🌙', title: '情绪日记', desc: '记录心情的涟漪' },
    { id: 'todo', icon: '📝', title: '待办清单', desc: '生活里的小事簿' },
    { id: 'question', icon: '💌', title: '今日一问', desc: '他们今天想问你什么' },
  ];
  return (
    <div className="hs" style={{ height: '100%', overflowY: 'auto', padding: '24px 18px', maxWidth: 440, margin: '0 auto', width: '100%' }}>
      <h2 style={{ fontSize: 22, fontWeight: t.isPixel ? 700 : 400, color: t.text1, margin: '0 0 4px', fontFamily: 'inherit' }}>功能大厅</h2>
      <p style={{ fontSize: 11, color: t.text3, letterSpacing: '0.08em', marginBottom: 22 }}>explore the corner</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {cards.map(c => (
          <Card key={c.id} t={t} onClick={() => setScreen(c.id)} className="tap" style={{ padding: '26px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', cursor: 'pointer' }}>
            <div style={{ fontSize: 30, marginBottom: 12 }}>{c.icon}</div>
            <div style={{ fontSize: 14, fontWeight: t.isPixel ? 700 : 600, color: t.text1, marginBottom: 5, fontFamily: 'inherit' }}>{c.title}</div>
            <div style={{ fontSize: 10, color: t.text3, fontFamily: 'inherit' }}>{c.desc}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}
function ChatPage({ charId, mode, t, addGlobalTodo }) {
  const getIdx = () => { const i = CHARACTERS.findIndex(c => c.id === charId); return i < 0 ? 0 : i; };
  const [charIdx, setCharIdx] = useState(getIdx);
  const [modelIdx, setModelIdx] = useState(0);
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showModelMenu, setShowModelMenu] = useState(false);

  const bottomRef = useRef(null);
  const proactiveTimerRef = useRef(null);
  const sessionIdRef = useRef(null); // 用ref追踪最新sessionId
  const loadingRef = useRef(false);
  const messagesRef = useRef([]);

  const char = CHARACTERS[charIdx];
  const model = char.models[modelIdx];
  const isLong = mode === 'long';

  // 同步ref
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // ★ 持久化：每次消息变化（非streaming）都保存到本地
  useEffect(() => {
    if (messages.length > 0 && !messages.some(m => m.streaming)) {
      const toSave = messages.filter(m => !m._hidden).map(m => ({
        role: m.role, content: m.content || m.reply || '',
        thinking: m.thinking, reply: m.reply
      }));
      localStorage.setItem(`companion_chat_${char.id}_${mode}`, JSON.stringify(toSave));
    }
  }, [messages, char.id, mode]);

  // 切换角色/模式时加载
  useEffect(() => {
    const i = getIdx();
    setCharIdx(i);
    setModelIdx(0);
    loadSession(i, 0);
  }, [charId, mode]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  // ★ 核心修复：主动搭话定时器 — 3~5分钟随机触发，不需要用户先发消息
  useEffect(() => {
    startProactiveTimer();
    return () => { if (proactiveTimerRef.current) clearTimeout(proactiveTimerRef.current); };
  }, [sessionId, charIdx]);

  const startProactiveTimer = () => {
    if (proactiveTimerRef.current) clearTimeout(proactiveTimerRef.current);
    // 随机 3~5 分钟
    const delay = (3 + Math.random() * 2) * 60 * 1000;
    proactiveTimerRef.current = setTimeout(() => {
      if (!loadingRef.current && sessionIdRef.current) {
        triggerProactive();
      }
      startProactiveTimer(); // 循环
    }, delay);
  };

  const loadSession = async (cIdx, mIdx, forceNew = false) => {
    const c = CHARACTERS[cIdx];
    const m = c.models[mIdx];

    // ★ 优先从本地恢复聊天记录
    if (!forceNew) {
      const localKey = `companion_chat_${c.id}_${mode}`;
      const local = localStorage.getItem(localKey);
      if (local) {
        try {
          const parsed = JSON.parse(local);
          if (parsed.length > 0) {
            setMessages(parsed.map(msg => ({
              ...msg,
              thinking: msg.thinking || splitThinkingReply(msg.content).thinking,
              reply: msg.reply || splitThinkingReply(msg.content).reply,
            })));
          }
        } catch {}
      }
    } else {
      setMessages([]);
    }

    // 尝试恢复 session
    const saved = getSavedSessions();
    const existingId = saved[c.id + '_' + mode];

    if (existingId && !forceNew) {
      setSessionId(existingId);
      // 尝试从服务器拉取（作为补充，不覆盖本地）
      try {
        const res = await fetch(`${BACKEND}/session/${existingId}/messages`);
        const data = await res.json();
        if (data.messages?.length > 0) {
          const serverMsgs = data.messages
            .filter(msg => !(msg.role === 'user' && msg.content && msg.content.startsWith('[系统提示]')))
            .map(msg => {
              const { thinking, reply } = splitThinkingReply(msg.content);
              return { role: msg.role, content: msg.content, thinking, reply };
            });
          // 如果本地为空才用服务器的
          if (!localStorage.getItem(`companion_chat_${c.id}_${mode}`)) {
            setMessages(serverMsgs);
          }
        }
      } catch {}
      return;
    }

    // 创建新 session
    try {
      const res = await fetch(`${BACKEND}/session`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ character_id: c.id, model: m.value, max_tokens: 8000 })
      });
      const data = await res.json();
      const newId = data.session?.id;
      setSessionId(newId);
      saveSession(c.id + '_' + mode, newId);
      if (data.greeting && forceNew) {
        const { thinking, reply } = splitThinkingReply(data.greeting);
        setMessages([{ role: 'assistant', content: data.greeting, thinking, reply }]);
      } else if (data.greeting && messages.length === 0) {
        const { thinking, reply } = splitThinkingReply(data.greeting);
        setMessages([{ role: 'assistant', content: data.greeting, thinking, reply }]);
      }
    } catch {}
  };

  // ★ 主动搭话 — 不会在对话框中显示系统提示
  const triggerProactive = async () => {
    if (loadingRef.current) return;
    setLoading(true);

    const prompts = [
      '请结合之前的对话语境，主动找小满搭话，自然开启一个话题或关心她的近况。直接输出内容，不要带任何前缀。',
      '随便和小满聊点什么，比如分享你现在在做的事、看到的东西、或者突然想到的话。直接说话，不要带前缀。',
      '主动给小满发一条消息，可以是日常分享、撒娇、吐槽、或者关心。直接输出，不要系统前缀。',
    ];
    const prompt = prompts[Math.floor(Math.random() * prompts.length)];

    const sid = Date.now();
    // ★ 只插入 assistant 气泡，不插入 user 消息
    setMessages(prev => [...prev, {
      role: 'assistant', id: sid, streaming: true,
      content: '', thinking: null, reply: '', thinkingOpen: false
    }]);

    try {
      await streamSSE(`${BACKEND}/chat`, {
        message: `[系统提示]${prompt}`,
        session_id: sessionIdRef.current,
        character_id: char.id,
        model: model.value,
        mode,
        max_tokens: 8000
      }, (fullText) => {
        const { thinking, reply, thinkingOpen } = splitThinkingReply(fullText);
        setMessages(prev => prev.map(m =>
          m.id === sid ? { ...m, content: fullText, thinking, reply, thinkingOpen, streaming: true } : m
        ));
      }, (fullText) => {
        const { thinking, reply } = splitThinkingReply(fullText);
        setMessages(prev => prev.map(m =>
          m.id === sid ? { ...m, content: fullText, thinking, reply, thinkingOpen: false, streaming: false } : m
        ));
      });
    } catch {
      setMessages(prev => prev.map(m =>
        m.id === sid ? { ...m, reply: '…', streaming: false } : m
      ));
    }
    setLoading(false);
  };

  const send = async () => {
    if (!input.trim() || loading) return;
    const text = input.trim();

    // 智能待办拦截
    const todoMatch = text.match(/^(?:提醒我|记一下|待办|加待办|记得)(?:一下)?[:：\s]*(.+)/);
    if (todoMatch && todoMatch[1]) { addGlobalTodo(todoMatch[1]); }

    // 重置主动搭话定时器
    startProactiveTimer();

    setMessages(prev => [...prev, { role: 'user', content: text, thinking: null, reply: text }]);
    setInput('');
    setLoading(true);

    const sid = Date.now();
    setMessages(prev => [...prev, {
      role: 'assistant', id: sid, streaming: true,
      content: '', thinking: null, reply: '', thinkingOpen: false
    }]);

    try {
      await streamSSE(`${BACKEND}/chat`, {
        message: text,
        session_id: sessionId,
        character_id: char.id,
        model: model.value,
        mode,
        max_tokens: 8000
      }, (fullText) => {
        const { thinking, reply, thinkingOpen } = splitThinkingReply(fullText);
        setMessages(prev => prev.map(m =>
          m.id === sid ? { ...m, content: fullText, thinking, reply, thinkingOpen, streaming: true } : m
        ));
      }, (fullText) => {
        const { thinking, reply } = splitThinkingReply(fullText);
        setMessages(prev => prev.map(m =>
          m.id === sid ? { ...m, content: fullText, thinking, reply, thinkingOpen: false, streaming: false } : m
        ));
      });
    } catch {
      setMessages(prev => prev.map(m =>
        m.id === sid ? { ...m, reply: '网络出了点小状况…', streaming: false } : m
      ));
    }
    setLoading(false);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%' }}>
      {/* 顶栏 */}
      <div style={{ backgroundColor: t.isGlass ? 'rgba(255,255,255,0.2)' : t.card, backdropFilter: `blur(${t.blur})`, WebkitBackdropFilter: `blur(${t.blur})`, borderBottom: t.isPixel ? `2px solid ${t.border}` : `1px solid ${t.border}`, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: t.isPixel ? 0 : '50%', border: t.isPixel ? `2px solid ${t.border}` : `1.5px solid ${char.accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: char.accent, fontWeight: 700 }}>{char.initial}</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: t.isPixel ? 700 : 600, color: t.text1, fontFamily: 'inherit' }}>{char.name}</div>
            <div style={{ fontSize: 10, color: t.text3, fontFamily: 'inherit', letterSpacing: '0.1em' }}>{char.en} · {isLong ? '📖 长文' : '💬 微信'}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative' }}>
            <div className="tap" onClick={() => setShowModelMenu(!showModelMenu)} style={{ fontSize: 10, color: t.text2, padding: '5px 11px', cursor: 'pointer', whiteSpace: 'nowrap', border: t.isPixel ? `2px solid ${t.border}` : `1px solid ${t.border}`, borderRadius: t.radius > 0 ? 20 : 0, fontFamily: 'inherit', fontWeight: 'bold', backgroundColor: 'rgba(255,255,255,0.3)' }}>{model.label} ▾</div>
            {showModelMenu && (
              <div style={{ position: 'absolute', top: 34, right: 0, backgroundColor: t.isGlass ? 'rgba(255,255,255,0.6)' : t.card, backdropFilter: `blur(${t.blur})`, border: t.isPixel ? `2px solid ${t.border}` : `1px solid ${t.border}`, borderRadius: t.radius, boxShadow: t.shadow, zIndex: 100, minWidth: 170, overflow: 'hidden' }}>
                {char.models.map((m, i) => (
                  <div key={m.value} className="tap" onClick={() => { setModelIdx(i); setShowModelMenu(false); }} style={{ padding: '10px 14px', fontSize: 11, color: i === modelIdx ? char.accent : t.text2, backgroundColor: i === modelIdx ? 'rgba(0,0,0,0.04)' : 'transparent', cursor: 'pointer', borderBottom: i < char.models.length - 1 ? `1px solid ${t.border}` : 'none', fontFamily: 'inherit' }}>{m.label}</div>
                ))}
              </div>
            )}
          </div>
          <div className="tap" onClick={() => { localStorage.removeItem(`companion_chat_${char.id}_${mode}`); loadSession(charIdx, modelIdx, true); }} style={{ fontSize: 10, color: t.text3, cursor: 'pointer', padding: '5px 11px', border: t.isPixel ? `2px solid ${t.border}` : `1px solid ${t.border}`, borderRadius: t.radius > 0 ? 20 : 0, fontFamily: 'inherit', fontWeight: 'bold', backgroundColor: 'rgba(255,255,255,0.3)' }}>新对话</div>
        </div>
      </div>

      {/* 消息列表 */}
      <div className="hs" onClick={() => setShowModelMenu(false)} style={{ flex: 1, overflowY: 'auto', padding: isLong ? '24px 6%' : '18px 16px', display: 'flex', flexDirection: 'column', gap: isLong ? 28 : 14 }}>
        {messages.filter(m => !m._hidden).map((msg, i) => (
          <div key={msg.id || i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', animation: 'fadeIn 0.3s ease' }}>
            {msg.role === 'assistant' && msg.thinking && (
              <ThinkingPill thinking={msg.thinking} thinkingOpen={msg.thinkingOpen} char={char} t={t} />
            )}
            <div style={{
              maxWidth: isLong ? '95%' : '80%',
              padding: isLong ? '18px 22px' : '10px 14px',
              borderRadius: t.isPixel ? 0 : (msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px'),
              border: t.isPixel ? `2px solid ${t.border}` : (msg.role === 'user' ? `1px solid ${char.accent}44` : `1px solid ${t.border}`),
              backgroundColor: msg.role === 'user' ? `${char.accent}15` : (t.isGlass ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.7)'),
              backdropFilter: t.isGlass ? `blur(${t.blur})` : 'none',
              boxShadow: t.isPixel ? `2px 2px 0 ${t.border}` : '0 2px 8px rgba(0,0,0,0.04)',
              fontSize: isLong ? 15 : 14,
              lineHeight: isLong ? 2.0 : 1.75,
              color: t.text1,
              fontFamily: 'inherit',
              textAlign: 'left',
            }}>
              <MessageBody
                content={msg.role === 'user' ? msg.content : (msg.reply || msg.content || '')}
                isLong={isLong}
              />
              {msg.streaming && (
                <span style={{ display: 'inline-block', width: 2, height: '0.9em', backgroundColor: char.accent, marginLeft: 3, animation: 'cursorBlink 0.9s step-end infinite', verticalAlign: 'text-bottom', borderRadius: 1 }} />
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* 输入框 */}
      <div style={{ backgroundColor: t.isGlass ? 'rgba(255,255,255,0.2)' : t.card, backdropFilter: `blur(${t.blur})`, WebkitBackdropFilter: `blur(${t.blur})`, borderTop: t.isPixel ? `2px solid ${t.border}` : `1px solid ${t.border}`, padding: '12px 14px', display: 'flex', alignItems: 'flex-end', gap: 10, flexShrink: 0 }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={loading ? '等待回复中…' : `对${char.name}说点什么…`}
          disabled={loading}
          rows={1}
          style={{
            flex: 1, resize: 'none', overflow: 'hidden',
            fontSize: 14, lineHeight: 1.6, padding: '10px 14px',
            border: t.isPixel ? `2px solid ${t.border}` : `1px solid ${t.border}`,
            borderRadius: t.isPixel ? 0 : 20,
            backgroundColor: 'rgba(255,255,255,0.4)',
            outline: 'none', color: t.text1, fontFamily: 'inherit',
            minHeight: 40, maxHeight: 120,
          }}
          onInput={e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; }}
        />
        <button
          className="tap"
          onClick={send}
          disabled={loading || !input.trim()}
          style={{
            width: 40, height: 40, flexShrink: 0,
            borderRadius: t.isPixel ? 0 : '50%',
            border: t.isPixel ? `2px solid ${t.border}` : 'none',
            backgroundColor: loading || !input.trim() ? t.border : char.accent,
            color: '#fff', fontSize: 16, cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s', fontFamily: 'inherit',
          }}
        >↑</button>
      </div>
    </div>
  );
}
function GroupPage({ t }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    // 加载本地群聊记录
    const local = localStorage.getItem('companion_group_chat');
    if (local) {
      try { setMessages(JSON.parse(local)); } catch {}
    }
    // 创建或恢复 session
    const saved = getSavedSessions();
    if (saved['group']) {
      setSessionId(saved['group']);
    } else {
      fetch(`${BACKEND}/session`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ character_id: 'group', model: 'claude-4.6-sonnet', max_tokens: 8000 })
      }).then(r => r.json()).then(d => {
        if (d.session?.id) { setSessionId(d.session.id); saveSession('group', d.session.id); }
      }).catch(() => {});
    }
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // 本地持久化
  useEffect(() => {
    if (messages.length > 0 && !messages.some(m => m.streaming)) {
      localStorage.setItem('companion_group_chat', JSON.stringify(messages));
    }
  }, [messages]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const text = input.trim();
    setMessages(prev => [...prev, { role: 'user', content: text, name: '小满' }]);
    setInput('');
    setLoading(true);

    // 随机选 1~2 个角色回复
    const shuffled = [...CHARACTERS].sort(() => Math.random() - 0.5);
    const responders = shuffled.slice(0, Math.random() > 0.5 ? 2 : 1);

    for (const char of responders) {
      const sid = Date.now() + Math.random();
      setMessages(prev => [...prev, {
        role: 'assistant', id: sid, name: char.name, charId: char.id, accent: char.accent, initial: char.initial,
        content: '', reply: '', thinking: null, streaming: true
      }]);

      try {
        await streamSSE(`${BACKEND}/chat`, {
          message: `[群聊context]其他人也在群里。小满说：「${text}」\n请以${char.name}的身份自然回复，不要带任何前缀标记。`,
          session_id: sessionId,
          character_id: char.id,
          model: char.models[0].value,
          mode: 'short',
          max_tokens: 4000
        }, (fullText) => {
          const { thinking, reply, thinkingOpen } = splitThinkingReply(fullText);
          setMessages(prev => prev.map(m =>
            m.id === sid ? { ...m, content: fullText, thinking, reply, thinkingOpen, streaming: true } : m
          ));
        }, (fullText) => {
          const { thinking, reply } = splitThinkingReply(fullText);
          setMessages(prev => prev.map(m =>
            m.id === sid ? { ...m, content: fullText, thinking, reply, thinkingOpen: false, streaming: false } : m
          ));
        });
      } catch {
        setMessages(prev => prev.map(m =>
          m.id === sid ? { ...m, reply: '…', streaming: false } : m
        ));
      }

      // 角色之间间隔一下
      if (responders.length > 1) await new Promise(r => setTimeout(r, 800));
    }
    setLoading(false);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%' }}>
      {/* 顶栏 */}
      <div style={{ backgroundColor: t.isGlass ? 'rgba(255,255,255,0.2)' : t.card, backdropFilter: `blur(${t.blur})`, borderBottom: t.isPixel ? `2px solid ${t.border}` : `1px solid ${t.border}`, padding: '12px 16px', flexShrink: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: t.text1, fontFamily: 'inherit' }}>全员群聊</div>
        <div style={{ fontSize: 10, color: t.text3, marginTop: 2 }}>{CHARACTERS.map(c => c.name).join(' · ')} · 小满</div>
      </div>

      {/* 消息 */}
      <div className="hs" style={{ flex: 1, overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.filter(m => !m._hidden).map((msg, i) => (
          <div key={msg.id || i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', animation: 'fadeIn 0.3s ease' }}>
            {msg.role === 'assistant' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', border: `1.5px solid ${msg.accent || t.acc}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: msg.accent || t.acc, fontWeight: 700 }}>{msg.initial || '?'}</div>
                <span style={{ fontSize: 10, color: t.text3, fontWeight: 600 }}>{msg.name}</span>
              </div>
            )}
            {msg.role === 'assistant' && msg.thinking && (
              <ThinkingPill thinking={msg.thinking} thinkingOpen={msg.thinkingOpen} char={{ accent: msg.accent || t.acc }} t={t} />
            )}
            <div style={{
              maxWidth: '78%', padding: '10px 14px',
              borderRadius: t.isPixel ? 0 : (msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px'),
              border: t.isPixel ? `2px solid ${t.border}` : `1px solid ${msg.role === 'user' ? `${t.acc}44` : t.border}`,
              backgroundColor: msg.role === 'user' ? `${t.acc}15` : 'rgba(255,255,255,0.6)',
              fontSize: 14, lineHeight: 1.75, color: t.text1, fontFamily: 'inherit', textAlign: 'left',
            }}>
              <MessageBody content={msg.role === 'user' ? msg.content : (msg.reply || msg.content || '')} isLong={false} />
              {msg.streaming && <span style={{ display: 'inline-block', width: 2, height: '0.9em', backgroundColor: msg.accent || t.acc, marginLeft: 3, animation: 'cursorBlink 0.9s step-end infinite', verticalAlign: 'text-bottom', borderRadius: 1 }} />}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* 输入 */}
      <div style={{ backgroundColor: t.isGlass ? 'rgba(255,255,255,0.2)' : t.card, backdropFilter: `blur(${t.blur})`, borderTop: t.isPixel ? `2px solid ${t.border}` : `1px solid ${t.border}`, padding: '12px 14px', display: 'flex', alignItems: 'flex-end', gap: 10, flexShrink: 0 }}>
        <textarea
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={loading ? '等待中…' : '在群里说点什么…'}
          disabled={loading} rows={1}
          style={{ flex: 1, resize: 'none', overflow: 'hidden', fontSize: 14, lineHeight: 1.6, padding: '10px 14px', border: t.isPixel ? `2px solid ${t.border}` : `1px solid ${t.border}`, borderRadius: t.isPixel ? 0 : 20, backgroundColor: 'rgba(255,255,255,0.4)', outline: 'none', color: t.text1, fontFamily: 'inherit', minHeight: 40, maxHeight: 120 }}
          onInput={e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; }}
        />
        <button className="tap" onClick={send} disabled={loading || !input.trim()} style={{ width: 40, height: 40, flexShrink: 0, borderRadius: t.isPixel ? 0 : '50%', border: t.isPixel ? `2px solid ${t.border}` : 'none', backgroundColor: loading || !input.trim() ? t.border : t.acc, color: '#fff', fontSize: 16, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>↑</button>
      </div>
    </div>
  );
}
// ==================== 主 App ====================
function App() {
  const [page, setPage] = useState('home');
  const [chatChar, setChatChar] = useState(null);
  const [groupChars, setGroupChars] = useState([]);
  const [globalModel, setGlobalModel] = useState(() => localStorage.getItem('globalModel') || 'deepseek');

  useEffect(() => {
    localStorage.setItem('globalModel', globalModel);
  }, [globalModel]);

  if (page === 'chat' && chatChar) {
    return <ChatPage char={chatChar} onBack={() => setPage('home')} globalModel={globalModel} setGlobalModel={setGlobalModel} />;
  }
  if (page === 'group' && groupChars.length > 0) {
    return <GroupPage chars={groupChars} onBack={() => setPage('home')} globalModel={globalModel} setGlobalModel={setGlobalModel} />;
  }

  // 首页
  const t = THEMES.clean;

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', backgroundColor: t.bg, fontFamily: t.font, overflow: 'hidden' }}>
      {/* 顶栏 */}
      <div style={{ padding: '18px 20px 14px', borderBottom: `1px solid ${t.border}`, backgroundColor: t.card, flexShrink: 0 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: t.text1 }}>🎭 AI 角色聊天</h1>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: t.text2 }}>选择角色开始对话，或多选进入群聊</p>
      </div>

      {/* 模型选择 */}
      <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: t.text2 }}>默认模型：</span>
        {Object.entries(MODELS).map(([k, v]) => (
          <button
            key={k}
            className="tap"
            onClick={() => setGlobalModel(k)}
            style={{
              padding: '4px 10px', fontSize: 11, borderRadius: 12,
              border: globalModel === k ? `1.5px solid ${v.color}` : `1px solid ${t.border}`,
              backgroundColor: globalModel === k ? `${v.color}18` : 'transparent',
              color: globalModel === k ? v.color : t.text2,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >{v.name}</button>
        ))}
      </div>

      {/* 角色列表 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px 100px' }}>
        {CHARACTERS.map(char => {
          const ct = THEMES[char.theme] || t;
          const selected = groupChars.includes(char);
          return (
            <div
              key={char.id}
              className="tap"
              onClick={() => { setChatChar(char); setPage('chat'); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '14px 16px', marginBottom: 10,
                borderRadius: 16, border: selected ? `2px solid ${char.accent}` : `1px solid ${t.border}`,
                backgroundColor: selected ? `${char.accent}10` : t.card,
                cursor: 'pointer', transition: 'all 0.2s',
              }}
            >
              <div style={{ width: 48, height: 48, borderRadius: '50%', backgroundColor: `${char.accent}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                {char.avatar}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: t.text1 }}>{char.name}</div>
                <div style={{ fontSize: 12, color: t.text2, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{char.desc}</div>
              </div>
              <button
                className="tap"
                onClick={e => {
                  e.stopPropagation();
                  setGroupChars(prev => prev.includes(char) ? prev.filter(c => c !== char) : [...prev, char]);
                }}
                style={{
                  width: 28, height: 28, borderRadius: '50%', border: `1.5px solid ${selected ? char.accent : t.border}`,
                  backgroundColor: selected ? char.accent : 'transparent',
                  color: selected ? '#fff' : t.text2, fontSize: 14,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0,
                }}
              >{selected ? '✓' : '+'}</button>
            </div>
          );
        })}
      </div>

      {/* 群聊浮动按钮 */}
      {groupChars.length >= 2 && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 100 }}>
          <button
            className="tap"
            onClick={() => setPage('group')}
            style={{
              padding: '12px 28px', borderRadius: 24, border: 'none',
              backgroundColor: '#6C63FF', color: '#fff',
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(108,99,255,0.4)',
              fontFamily: 'inherit',
            }}
          >开始群聊（{groupChars.length}人）</button>
        </div>
      )}
    </div>
  );
}

export default App;
