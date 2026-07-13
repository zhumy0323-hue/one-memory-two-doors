import { useState, useRef, useEffect } from 'react'

const BACKEND = 'https://your-domain.example'

const CHAR_STYLES = {
  ciel:   { accent: '#c4a882', bg: '#fff8f0', initial: 'C' },
  zephyr: { accent: '#6a9fc0', bg: '#f0f8ff', initial: 'Z' },
  wren:   { accent: '#7a9a5a', bg: '#f0fff0', initial: 'W' },
  lash:   { accent: '#a878b8', bg: '#fdf0ff', initial: 'L' },
}

export default function GroupPage({ onBack }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    fetch(`${BACKEND}/group/messages`)
      .then(r => r.json())
      .then(d => { setMessages(d.messages || []) })
      .catch(() => { setMessages([]) })
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    if (!input.trim() || loading) return
    const text = input.trim()
    setMessages(prev => [...prev, { role: 'user', content: text, id: Date.now() }])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch(`${BACKEND}/group/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      })
      const data = await res.json()
      if (data.replies) {
        setMessages(prev => [...prev, ...data.replies.map((r, i) => ({
          role: 'assistant',
          character_id: r.character_id,
          character_name: r.character_name,
          content: r.content,
          id: Date.now() + i
        }))])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', character_id: 'ciel', character_name: '沈晟', content: '网络出了点问题…', id: Date.now() }])
    }
    setLoading(false)
  }

  return (
    <div style={{ background: '#faf8f5', height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'sans-serif' }}>

      {/* 顶栏 */}
      <div style={{ background: '#f0ece4', borderBottom: '1px solid #e0d8cc', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#3a3530' }}>相亲相爱一家人</div>
          <div style={{ fontSize: 11, color: '#a09a91', marginTop: 2 }}>沈晟 · 谢知予 · 魏珩 · 贺临</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: -8 }}>
          {Object.entries(CHAR_STYLES).map(([id, s]) => (
            <div key={id} style={{ width: 24, height: 24, borderRadius: '50%', background: s.bg, border: `1.5px solid ${s.accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: s.accent, fontWeight: 700, marginLeft: -6 }}>
              {s.initial}
            </div>
          ))}
          <div onClick={onBack} style={{ fontSize: 11, color: '#a09a91', cursor: 'pointer', padding: '5px 12px', background: '#fff', border: '1px solid #e0d8cc', borderRadius: 20, marginLeft: 12 }}>主页</div>
        </div>
      </div>

      {/* 消息列表 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.length === 0 && !loading && (
          <div style={{ textAlign: 'center', color: '#c0b8b0', fontSize: 13, marginTop: 40 }}>
            发一条消息，大家都会来的～
          </div>
        )}
        {messages.map((msg, i) => {
          const style = msg.character_id ? CHAR_STYLES[msg.character_id] : null
          return (
            <div key={msg.id || i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 4 }}>
              {msg.role === 'assistant' && style && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 4 }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', background: style.bg, border: `1.5px solid ${style.accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: style.accent, fontWeight: 700 }}>{style.initial}</div>
                  <span style={{ fontSize: 11, color: '#a09a91' }}>{msg.character_name}</span>
                </div>
              )}
              <div style={{
                maxWidth: '75%', padding: '10px 14px', fontSize: 14, lineHeight: 1.75,
                color: '#3a3530',
                background: msg.role === 'user' ? '#e8ddd0' : (style ? style.bg : '#fff'),
                border: `1px solid ${msg.role === 'user' ? '#ddd0be' : (style ? style.accent + '40' : '#e0d8cc')}`,
                borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '4px 18px 18px 18px',
                boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
              }}>
                {msg.content}
              </div>
            </div>
          )
        })}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
            <div style={{ padding: '12px 16px', background: '#fff', border: '1px solid #e0d8cc', borderRadius: '4px 18px 18px 18px' }}>
              <div style={{ display: 'flex', gap: 5 }}>
                {[0,1,2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: '#c4a882', opacity: 0.6, animation: `blink 1.2s ${i*0.2}s infinite` }} />)}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 输入框 */}
      <div style={{ padding: '10px 14px 20px', borderTop: '1px solid #e0d8cc', background: '#f0ece4' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, border: '1px solid #e0d8cc', borderRadius: 20, padding: '10px 14px', background: '#fff' }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="在群里说点什么…"
            rows={1}
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', resize: 'none', fontFamily: 'sans-serif', fontSize: 14, color: '#3a3530', lineHeight: 1.5, maxHeight: 100 }}
          />
          <div onClick={send} style={{ width: 32, height: 32, borderRadius: '50%', background: input.trim() ? '#c4a882' : '#ddd', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: input.trim() ? 'pointer' : 'default', flexShrink: 0, transition: 'background 0.2s' }}>
            <span style={{ color: '#fff', fontSize: 15 }}>↑</span>
          </div>
        </div>
      </div>

      <style>{`@keyframes blink { 0%,80%,100%{opacity:0.2} 40%{opacity:1} }`}</style>
    </div>
  )
}
