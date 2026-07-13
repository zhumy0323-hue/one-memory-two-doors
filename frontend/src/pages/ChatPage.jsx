import { useState, useRef, useEffect } from 'react'

const BACKEND = 'https://your-domain.example'

const CHARACTERS = [
  {
    id: 'ciel', name: '沈晟', en: 'Ciel', initial: 'C',
    bgFrom: '#f5ede0', bgTo: '#faf5ee',
    patternRgb: '180,130,70',
    glass: 'rgba(255,250,242,0.75)',
    userGlass: 'rgba(238,218,190,0.80)',
    border: 'rgba(200,165,110,0.30)',
    userBorder: 'rgba(185,145,85,0.38)',
    accent: '#b8905a',
    text1: '#3a2e1e', text2: '#7a6848', text3: '#b09878',
    topGlass: 'rgba(250,245,235,0.88)',
    models: [
      { label: 'Claude Sonnet 4.6', value: 'claude-4.6-sonnet' },
      { label: 'Claude Opus 4.7', value: 'anthropic/claude-4.7-opus' },
      { label: 'Claude Opus 4.6', value: 'claude-4.6-opus' },
    ]
  },
  {
    id: 'zephyr', name: '谢知予', en: 'Zephyr', initial: 'Z',
    bgFrom: '#e8eff5', bgTo: '#f3f7fa',
    patternRgb: '80,130,170',
    glass: 'rgba(240,247,253,0.75)',
    userGlass: 'rgba(195,222,242,0.80)',
    border: 'rgba(120,170,210,0.30)',
    userBorder: 'rgba(100,155,200,0.38)',
    accent: '#5a8fb0',
    text1: '#1a2e3e', text2: '#3a5870', text3: '#7a9ab0',
    topGlass: 'rgba(235,245,252,0.88)',
    models: [
      { label: 'Gemini 3.1 Pro', value: 'gemini-3.1-pro-preview' },
      { label: 'Gemini 3.1 Flash', value: 'gemini-3.1-flash-lite-preview' },
    ]
  },
  {
    id: 'wren', name: '魏珩', en: 'Wren', initial: 'W',
    bgFrom: '#e8f0e2', bgTo: '#f2f7ee',
    patternRgb: '80,130,60',
    glass: 'rgba(240,248,235,0.75)',
    userGlass: 'rgba(200,228,180,0.80)',
    border: 'rgba(120,175,100,0.30)',
    userBorder: 'rgba(100,160,80,0.38)',
    accent: '#5a8a42',
    text1: '#1a2e10', text2: '#3a5828', text3: '#7a9868',
    topGlass: 'rgba(235,248,228,0.88)',
    models: [{ label: 'GPT-5.5', value: 'openai/gpt-5.5' }]
  },
  {
    id: 'lash', name: '贺临', en: 'Lash', initial: 'L',
    bgFrom: '#f0e8f5', bgTo: '#f8f3fb',
    patternRgb: '140,90,175',
    glass: 'rgba(248,242,254,0.75)',
    userGlass: 'rgba(222,200,244,0.80)',
    border: 'rgba(175,130,210,0.30)',
    userBorder: 'rgba(160,110,200,0.38)',
    accent: '#9060b8',
    text1: '#22103a', text2: '#4a2868', text3: '#9070a8',
    topGlass: 'rgba(248,240,255,0.88)',
    models: [
      { label: 'Grok 4.1 Fast', value: 'x-ai/grok-4.1-fast' },
      { label: 'Grok 4 Reasoning', value: 'x-ai/grok-4-fast-reasoning' },
      { label: 'Grok 4 Fast', value: 'x-ai/grok-4-fast-non-reasoning' },
    ]
  },
]

const STORAGE_KEY = 'companion_sessions'
function getSavedSessions() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') } catch { return {} }
}
function saveSession(charId, sessionId) {
  const s = getSavedSessions(); s[charId] = sessionId
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
}

// ★ 核心修复：实时从 fullText 流中分离 thinking 和 reply
// 流式过程中 thinking 可能还没闭合，安全处理
function splitThinkingReply(raw) {
  if (!raw) return { thinking: null, reply: '' }
  
  // 完整的 <thinking>...</thinking> 块
  const completeMatch = raw.match(/^<thinking>([\s\S]*?)<\/thinking>\s*([\s\S]*)$/i)
  if (completeMatch) {
    return {
      thinking: completeMatch[1].trim(),
      reply: completeMatch[2].trim()
    }
  }
  
  // thinking 块还没闭合（流式中）
  if (raw.trimStart().startsWith('<thinking>')) {
    const inner = raw.replace(/^<thinking>/i, '')
    return { thinking: inner, reply: '', thinkingOpen: true }
  }
  
  // 没有 thinking
  return { thinking: null, reply: raw }
}

// Thinking 折叠 pill — 独立在气泡外
function ThinkingPill({ thinking, thinkingOpen, char }) {
  const [open, setOpen] = useState(false)
  if (!thinking) return null
  return (
    <div style={{ alignSelf: 'flex-start', maxWidth: '85%', marginBottom: 4 }}>
      <button onClick={() => setOpen(v => !v)} style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        fontSize: 11, color: char.text3, cursor: 'pointer',
        padding: '4px 12px', borderRadius: 20,
        border: `1px solid ${char.border}`,
        background: char.glass,
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        fontFamily: 'inherit', letterSpacing: '0.04em',
        transition: 'all 0.2s',
      }}>
        <span style={{ fontSize: 9, opacity: 0.6 }}>✦</span>
        {thinkingOpen ? '思考中…' : open ? '收起思考' : '查看思考过程'}
        {!thinkingOpen && <span style={{ fontSize: 10, opacity: 0.5 }}>{open ? '▴' : '▾'}</span>}
      </button>
      {open && (
        <div style={{
          marginTop: 6, padding: '12px 16px',
          background: char.glass, backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: `1px solid ${char.border}`,
          borderLeft: `2px solid ${char.accent}`,
          borderRadius: '0 12px 12px 12px',
          fontSize: 12, color: char.text3,
          lineHeight: 1.9, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          fontStyle: 'italic', letterSpacing: '0.02em',
        }}>
          {thinking}
        </div>
      )}
    </div>
  )
}

function MessageBody({ content, isLong }) {
  const text = isLong
    ? content.replace(/\n{3,}/g, '\n\n').trim()
    : content.replace(/\n+/g, ' ').trim()
  return (
    <span style={{
      whiteSpace: isLong ? 'pre-wrap' : 'normal',
      wordBreak: 'break-word', display: 'block', textAlign: 'left',
    }}>{text}</span>
  )
}

function BgPattern({ rgb }) {
  const c = `rgba(${rgb},0.55)`
  return (
    <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none', opacity:0.5 }} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id={`fp${rgb.replace(/,/g,'')}`} x="0" y="0" width="90" height="90" patternUnits="userSpaceOnUse">
          <g stroke={c} strokeWidth="0.7" fill="none">
            <circle cx="22" cy="22" r="3.5"/>
            <line x1="22" y1="15" x2="22" y2="18.5"/>
            <line x1="22" y1="25.5" x2="22" y2="29"/>
            <line x1="15" y1="22" x2="18.5" y2="22"/>
            <line x1="25.5" y1="22" x2="29" y2="22"/>
            <line x1="16.8" y1="16.8" x2="19.1" y2="19.1"/>
            <line x1="24.9" y1="24.9" x2="27.2" y2="27.2"/>
            <line x1="27.2" y1="16.8" x2="24.9" y2="19.1"/>
            <line x1="19.1" y1="24.9" x2="16.8" y2="27.2"/>
          </g>
          <g stroke={c} strokeWidth="0.55" fill="none">
            <path d="M60 50 Q64 44 69 50 Q64 56 60 50Z"/>
            <line x1="60" y1="50" x2="69" y2="50"/>
            <path d="M35 70 Q38 65 42 70 Q38 75 35 70Z"/>
            <line x1="35" y1="70" x2="42" y2="70"/>
          </g>
          <circle cx="68" cy="22" r="1" fill={c} opacity="0.6"/>
          <circle cx="12" cy="65" r="1" fill={c} opacity="0.5"/>
          <circle cx="45" cy="78" r="0.8" fill={c} opacity="0.4"/>
          <circle cx="78" cy="70" r="0.8" fill={c} opacity="0.35"/>
          <path d="M32 58 Q37 52 43 58 Q48 64 54 58" stroke={c} strokeWidth="0.55" fill="none"/>
          <path d="M70 35 Q74 31 78 35" stroke={c} strokeWidth="0.55" fill="none"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#fp${rgb.replace(/,/g,'')})`}/>
    </svg>
  )
}

export default function ChatPage({ onBack, charId = 'ciel', mode = 'short' }) {
  const getDefaultIdx = () => { const i = CHARACTERS.findIndex(c => c.id === charId); return i < 0 ? 0 : i }
  const [charIdx, setCharIdx] = useState(getDefaultIdx)
  const [modelIdx, setModelIdx] = useState(0)
  const [sessionId, setSessionId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showModelMenu, setShowModelMenu] = useState(false)
  const bottomRef = useRef(null)
  const char = CHARACTERS[charIdx]
  const model = char.models[modelIdx]
  const isLong = mode === 'long'

  useEffect(() => {
    const idx = CHARACTERS.findIndex(c => c.id === charId)
    const newIdx = idx < 0 ? 0 : idx
    setCharIdx(newIdx); setModelIdx(0)
    loadOrCreateSession(newIdx, 0)
  }, [charId])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const loadOrCreateSession = async (cIdx, mIdx, forceNew = false) => {
    const c = CHARACTERS[cIdx], m = c.models[mIdx]
    setMessages([])
    const saved = getSavedSessions()
    const existingId = saved[c.id]
    if (existingId && !forceNew) {
      try {
        const res = await fetch(`${BACKEND}/session/${existingId}/messages`)
        const data = await res.json()
        if (data.messages?.length > 0) {
          setSessionId(existingId)
          // 历史消息也要分离 thinking
          setMessages(data.messages.map(m => {
            const { thinking, reply } = splitThinkingReply(m.content)
            return { role: m.role, content: m.content, thinking, reply }
          }))
          return
        }
      } catch {}
    }
    try {
      const res = await fetch(`${BACKEND}/session`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ character_id: c.id, model: m.value })
      })
      const data = await res.json()
      setSessionId(data.session?.id)
      saveSession(c.id, data.session?.id)
      if (data.greeting) {
        const { thinking, reply } = splitThinkingReply(data.greeting)
        setMessages([{ role: 'assistant', content: data.greeting, thinking, reply }])
      }
    } catch {}
  }

  const send = async () => {
    if (!input.trim() || loading) return
    const text = input.trim()
    setMessages(prev => [...prev, { role: 'user', content: text, thinking: null, reply: text }])
    setInput('')
    setLoading(true)

    const streamingId = Date.now()
    let bubbleCreated = false

    try {
      const res = await fetch(`${BACKEND}/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, session_id: sessionId, character_id: char.id, model: model.value, mode })
      })

      const reader = res.body.getReader()
      const decoder = new TextDecoder('utf-8', { fatal: false })
      let buffer = ''
      let fullText = ''  // 完整的原始文本（含 thinking 标签）

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const parsed = JSON.parse(line.slice(6))
            if (parsed.text) {
              fullText += parsed.text
              // ★ 每次更新都实时分离 thinking/reply
              const { thinking, reply, thinkingOpen } = splitThinkingReply(fullText)

              if (!bubbleCreated && reply) {
                // 有正文内容才创建气泡
                setMessages(prev => [...prev, {
                  role: 'assistant', id: streamingId, streaming: true,
                  content: fullText, thinking, reply, thinkingOpen
                }])
                bubbleCreated = true
              } else if (bubbleCreated) {
                setMessages(prev => prev.map(m =>
                  m.id === streamingId
                    ? { ...m, content: fullText, thinking, reply, thinkingOpen }
                    : m
                ))
              } else if (!bubbleCreated && thinking) {
                // 还在 thinking 阶段，显示 thinking pill 但没有气泡
                // 用一个临时占位
                setMessages(prev => {
                  const exists = prev.find(m => m.id === streamingId)
                  if (exists) {
                    return prev.map(m => m.id === streamingId
                      ? { ...m, content: fullText, thinking, reply: '', thinkingOpen: true }
                      : m)
                  }
                  return [...prev, {
                    role: 'assistant', id: streamingId, streaming: true,
                    content: fullText, thinking, reply: '', thinkingOpen: true
                  }]
                })
                bubbleCreated = true
              }
            }
            if (parsed.done) {
              setMessages(prev => prev.map(m => {
                if (m.id !== streamingId) return m
                const { thinking, reply } = splitThinkingReply(m.content)
                return { ...m, streaming: false, thinkingOpen: false, thinking, reply }
              }))
            }
          } catch {}
        }
      }

      // flush 尾部
      const tail = decoder.decode()
      if (tail) {
        setMessages(prev => prev.map(m => {
          if (m.id !== streamingId) return m
          const newContent = m.content + tail
          const { thinking, reply } = splitThinkingReply(newContent)
          return { ...m, content: newContent, thinking, reply, streaming: false, thinkingOpen: false }
        }))
      }
    } catch {
      if (bubbleCreated) {
        setMessages(prev => prev.map(m =>
          m.id === streamingId ? { ...m, reply: '网络出了点问题…', streaming: false } : m
        ))
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: '网络出了点问题…', thinking: null, reply: '网络出了点问题…' }])
      }
    }
    setLoading(false)
  }

  return (
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column', width: '100%',
      fontFamily: "'Georgia', 'Noto Serif SC', serif",
      background: `linear-gradient(150deg, ${char.bgFrom} 0%, ${char.bgTo} 100%)`,
      position: 'relative', overflow: 'hidden',
      transition: 'background 0.5s',
    }}>
      {/* 花纹背景 */}
      <BgPattern rgb={char.patternRgb} />
      {/* 四角光晕 */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `
          radial-gradient(ellipse at 0% 0%, rgba(${char.patternRgb},0.20) 0%, transparent 50%),
          radial-gradient(ellipse at 100% 100%, rgba(${char.patternRgb},0.16) 0%, transparent 50%),
          radial-gradient(ellipse at 100% 0%, rgba(${char.patternRgb},0.09) 0%, transparent 40%),
          radial-gradient(ellipse at 0% 100%, rgba(${char.patternRgb},0.09) 0%, transparent 40%)
        `
      }} />

      {/* ── 顶栏 ── */}
      <div style={{
        background: char.topGlass,
        backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
        borderBottom: `1px solid ${char.border}`,
        padding: '10px 16px 10px 60px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'relative', zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: char.userGlass, backdropFilter: 'blur(8px)',
            border: `1.5px solid ${char.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, color: char.accent, fontWeight: 700,
            boxShadow: `0 2px 8px rgba(${char.patternRgb},0.15)`,
          }}>{char.initial}</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: char.text1, letterSpacing: '0.04em' }}>{char.name}</div>
            <div style={{ fontSize: 10, color: char.text3, letterSpacing: '0.12em', marginTop: 1 }}>
              {char.en} · {isLong ? 'letter mode' : 'chat mode'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ position: 'relative' }}>
            <div onClick={() => setShowModelMenu(!showModelMenu)} style={{
              fontSize: 10, color: char.text2, letterSpacing: '0.08em',
              background: char.glass, backdropFilter: 'blur(8px)',
              border: `1px solid ${char.border}`, borderRadius: 20,
              padding: '5px 12px', cursor: 'pointer', whiteSpace: 'nowrap',
            }}>{model.label} ▾</div>
            {showModelMenu && (
              <div style={{
                position: 'absolute', top: 34, right: 0,
                background: char.topGlass, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                border: `1px solid ${char.border}`, borderRadius: 14, overflow: 'hidden',
                boxShadow: '0 8px 32px rgba(0,0,0,0.12)', zIndex: 100, minWidth: 175,
              }}>
                {char.models.map((m, i) => (
                  <div key={m.value} onClick={() => { setModelIdx(i); setShowModelMenu(false) }} style={{
                    padding: '10px 14px', fontSize: 11,
                    color: i === modelIdx ? char.accent : char.text2,
                    background: i === modelIdx ? char.userGlass : 'transparent',
                    cursor: 'pointer', letterSpacing: '0.04em',
                    borderBottom: i < char.models.length - 1 ? `1px solid ${char.border}` : 'none',
                  }}>{m.label}</div>
                ))}
              </div>
            )}
          </div>
          <div onClick={() => loadOrCreateSession(charIdx, modelIdx, true)} style={{
            fontSize: 10, color: char.text3, cursor: 'pointer', padding: '5px 12px',
            background: char.glass, backdropFilter: 'blur(8px)',
            border: `1px solid ${char.border}`, borderRadius: 20, letterSpacing: '0.1em',
          }}>新对话</div>
        </div>
      </div>

      {/* ── 消息列表 ── */}
      <div onClick={() => setShowModelMenu(false)} style={{
        flex: 1, overflowY: 'auto', position: 'relative', zIndex: 1,
        padding: isLong ? '28px 8%' : '20px 16px',
        display: 'flex', flexDirection: 'column', gap: isLong ? 32 : 16,
      }}>
        {messages.map((msg, i) => (
          <div key={i} style={{
            display: 'flex', flexDirection: 'column',
            alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
            gap: 5,
          }}>
            {/* 角色名 */}
            {msg.role === 'assistant' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 4 }}>
                <div style={{
                  width: 18, height: 18, borderRadius: '50%',
                  background: char.glass, border: `1px solid ${char.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 8, color: char.accent, fontWeight: 700,
                }}>{char.initial}</div>
                <span style={{ fontSize: 10, color: char.text3, letterSpacing: '0.12em' }}>{char.name}</span>
              </div>
            )}

            {/* ★ Thinking pill — 永远在气泡外面、名字下面 */}
            {msg.role === 'assistant' && msg.thinking && (
              <ThinkingPill
                thinking={msg.thinking}
                thinkingOpen={msg.thinkingOpen}
                char={char}
              />
            )}

            {/* 气泡 — 只渲染 reply，永远不包含 thinking */}
            {(msg.role === 'user' || (msg.reply !== undefined ? msg.reply : msg.content)) && (
              <div style={{
                maxWidth: isLong ? '100%' : '78%',
                padding: isLong ? '18px 22px' : '11px 15px',
                fontSize: isLong ? 15 : 14,
                lineHeight: isLong ? 2.0 : 1.85,
                color: char.text1,
                background: msg.role === 'user' ? char.userGlass : char.glass,
                backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
                border: `1px solid ${msg.role === 'user' ? char.userBorder : char.border}`,
                borderRadius: msg.role === 'user' ? '20px 20px 5px 20px' : '5px 20px 20px 20px',
                boxShadow: '0 2px 16px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.6)',
                letterSpacing: '0.02em', position: 'relative',
              }}>
                {msg.role === 'assistant'
                  ? <MessageBody content={msg.reply ?? msg.content} isLong={isLong} />
                  : <span style={{ wordBreak: 'break-word', display: 'block', textAlign: 'left' }}>{msg.content}</span>
                }
                {msg.streaming && (msg.reply || msg.content) && (
                  <span style={{
                    display: 'inline-block', width: 1.5, height: '0.9em',
                    background: char.accent, marginLeft: 2,
                    animation: 'cursor-blink 0.9s step-end infinite',
                    verticalAlign: 'text-bottom', borderRadius: 1,
                  }} />
                )}
              </div>
            )}
          </div>
        ))}

        {/* loading dots — 只在没有流式气泡时 */}
        {loading && !messages.some(m => m.streaming) && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 4 }}>
              <div style={{
                width: 18, height: 18, borderRadius: '50%',
                background: char.glass, border: `1px solid ${char.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 8, color: char.accent, fontWeight: 700,
              }}>{char.initial}</div>
              <span style={{ fontSize: 10, color: char.text3, letterSpacing: '0.12em' }}>{char.name}</span>
            </div>
            <div style={{
              padding: '13px 18px', background: char.glass,
              backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
              border: `1px solid ${char.border}`,
              borderRadius: '5px 20px 20px 20px',
              boxShadow: '0 2px 16px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.6)',
            }}>
              <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{
                    width: 5, height: 5, borderRadius: '50%', background: char.accent,
                    animation: `dot-fade 1.4s ${i*0.22}s infinite`,
                  }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── 输入框 ── */}
      <div style={{
        padding: '10px 14px 22px', position: 'relative', zIndex: 10,
        background: char.topGlass,
        backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
        borderTop: `1px solid ${char.border}`,
      }}>
        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: 10,
          background: char.glass, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          border: `1px solid ${char.border}`, borderRadius: 24,
          padding: '10px 10px 10px 18px',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7), 0 2px 12px rgba(0,0,0,0.04)',
        }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder={isLong ? `给 ${char.name} 写点什么…` : `和 ${char.name} 说点什么…`}
            rows={isLong ? 3 : 1}
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              resize: 'none', fontFamily: 'inherit',
              fontSize: 14, color: char.text1, lineHeight: 1.6,
              maxHeight: isLong ? 200 : 100, letterSpacing: '0.02em',
            }}
          />
          <div onClick={send} style={{
            width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
            background: input.trim()
              ? `linear-gradient(135deg, ${char.accent}, ${char.accent}cc)`
              : char.border,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: input.trim() ? 'pointer' : 'default',
            transition: 'all 0.25s',
            boxShadow: input.trim() ? `0 3px 10px rgba(${char.patternRgb},0.35)` : 'none',
          }}>
            <span style={{ color: '#fff', fontSize: 16 }}>↑</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes dot-fade { 0%,60%,100%{opacity:0.2} 30%{opacity:1} }
        @keyframes cursor-blink { 0%,100%{opacity:1} 50%{opacity:0} }
        ::-webkit-scrollbar { width: 3px }
        ::-webkit-scrollbar-track { background: transparent }
        ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 3px }
        textarea::placeholder { color: inherit; opacity: 0.4; }
      `}</style>
    </div>
  )
}
