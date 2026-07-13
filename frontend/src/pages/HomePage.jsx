import { useState, useEffect } from 'react'

const MOODS = [
  { id: 'happy', label: '开心', svg: <svg width="30" height="30" viewBox="0 0 54 54" fill="none"><path d="M4 28 Q3 12 16 5 Q30 -1 43 8 Q54 17 51 32 Q49 46 36 51 Q21 56 11 46 Q3 38 4 28Z" fill="#F2C9A8"/><circle cx="18" cy="22" r="2.8" fill="#1a1a1a"/><circle cx="33" cy="21" r="3.1" fill="#1a1a1a"/><path d="M13 33 Q20 42 33 37" stroke="#1a1a1a" strokeWidth="2.8" strokeLinecap="round" fill="none"/><path d="M33 37 Q38 34 37 30" stroke="#1a1a1a" strokeWidth="2.8" strokeLinecap="round" fill="none"/></svg> },
  { id: 'content', label: '满足', svg: <svg width="30" height="30" viewBox="0 0 54 54" fill="none"><path d="M6 26 Q5 10 19 4 Q33 -1 44 9 Q55 19 50 34 Q45 48 31 52 Q17 56 9 45 Q3 36 6 26Z" fill="#F5D03A"/><circle cx="19" cy="24" r="2.6" fill="#1a1a1a"/><circle cx="35" cy="23" r="2.9" fill="#1a1a1a"/><path d="M22 34 Q27 39 33 34" stroke="#1a1a1a" strokeWidth="2.8" strokeLinecap="round" fill="none"/></svg> },
  { id: 'annoyed', label: '烦透了', svg: <svg width="30" height="30" viewBox="0 0 54 54" fill="none"><path d="M5 20 Q7 4 22 3 Q38 2 47 13 Q56 25 50 40 Q44 54 28 53 Q12 53 6 40 Q2 30 5 20Z" fill="#9BAA6A"/><path d="M14 17 L20 24 M20 17 L14 24" stroke="#1a1a1a" strokeWidth="3" strokeLinecap="round"/><path d="M31 16 L38 23 M38 16 L31 23" stroke="#1a1a1a" strokeWidth="3" strokeLinecap="round"/><path d="M13 36 Q17 33 21 36 Q25 39 29 35 Q33 32 38 36" stroke="#1a1a1a" strokeWidth="2.8" strokeLinecap="round" fill="none"/></svg> },
  { id: 'blank', label: '呆住了', svg: <svg width="30" height="30" viewBox="0 0 54 54" fill="none"><path d="M5 25 Q4 9 18 4 Q33 -1 44 10 Q55 21 51 37 Q47 51 32 53 Q16 56 8 43 Q3 33 5 25Z" fill="#6FC4B0"/><rect x="9" y="18" width="15" height="15" rx="6" stroke="#1a1a1a" strokeWidth="2.8" fill="none" transform="rotate(-3 16 25)"/><rect x="28" y="17" width="15" height="15" rx="6" stroke="#1a1a1a" strokeWidth="2.8" fill="none" transform="rotate(4 35 24)"/><circle cx="16.5" cy="25" r="2.8" fill="#1a1a1a"/><circle cx="35" cy="24" r="2.8" fill="#1a1a1a"/><line x1="17" y1="40" x2="29" y2="41" stroke="#1a1a1a" strokeWidth="3" strokeLinecap="round"/></svg> },
  { id: 'sad', label: '难过', svg: <svg width="30" height="30" viewBox="0 0 54 54" fill="none"><path d="M5 26 Q3 10 17 4 Q32 -2 44 9 Q55 20 51 36 Q47 50 32 53 Q15 56 8 43 Q3 33 5 26Z" fill="#8BB8D8"/><circle cx="19" cy="23" r="3.5" fill="#1a1a1a"/><circle cx="34" cy="22" r="2.8" fill="#1a1a1a"/><path d="M17 38 Q25 33 36 37" stroke="#1a1a1a" strokeWidth="2.8" strokeLinecap="round" fill="none"/></svg> },
  { id: 'angry', label: '生气', svg: <svg width="30" height="30" viewBox="0 0 54 54" fill="none"><path d="M6 28 Q4 12 18 5 Q33 -1 44 10 Q55 22 50 37 Q45 51 29 53 Q13 55 7 41 Q4 33 6 28Z" fill="#C8A8CC"/><path d="M12 17 L21 21" stroke="#1a1a1a" strokeWidth="3.2" strokeLinecap="round"/><path d="M32 19 L41 15" stroke="#1a1a1a" strokeWidth="3.2" strokeLinecap="round"/><circle cx="18" cy="27" r="3" fill="#1a1a1a"/><circle cx="35" cy="26" r="2.7" fill="#1a1a1a"/><line x1="19" y1="38" x2="33" y2="36" stroke="#1a1a1a" strokeWidth="3.2" strokeLinecap="round"/></svg> },
  { id: 'sleepy', label: '困困', svg: <svg width="30" height="30" viewBox="0 0 54 54" fill="none"><path d="M7 27 Q6 11 20 5 Q35 -1 46 11 Q56 23 51 38 Q46 53 30 54 Q14 56 8 43 Q4 33 7 27Z" fill="#F0A898"/><path d="M13 22 Q18 19 23 22" stroke="#1a1a1a" strokeWidth="3" strokeLinecap="round" fill="none"/><ellipse cx="18" cy="24" rx="4" ry="2.2" fill="#1a1a1a"/><path d="M29 21 Q34 18 40 21" stroke="#1a1a1a" strokeWidth="3" strokeLinecap="round" fill="none"/><ellipse cx="34" cy="23" rx="3.5" ry="2" fill="#1a1a1a"/><ellipse cx="24" cy="36" rx="3.5" ry="4" stroke="#1a1a1a" strokeWidth="2.4" fill="none"/></svg> },
]

const WEATHER_CODES = {
  0:'晴',1:'基本晴',2:'多云',3:'阴',45:'有雾',48:'有雾',
  51:'小毛毛雨',53:'毛毛雨',55:'大毛毛雨',61:'小雨',63:'中雨',65:'大雨',
  71:'小雪',73:'中雪',75:'大雪',80:'阵雨',81:'中阵雨',82:'大阵雨',
  95:'雷雨',96:'雷阵雨',99:'强雷雨'
}

const START = new Date('2026-06-11')
const days = Math.floor((Date.now() - START) / 86400000) + 1

// 主题
const THEMES = [
  { name: 'warm', bg: '#faf6f0', card: 'rgba(255,250,242,0.82)', border: 'rgba(200,165,110,0.25)', text1: '#3a2e1e', text2: '#7a6848', text3: '#b09878', acc: '#b8905a', patternRgb: '180,130,70' },
  { name: 'cool', bg: '#f3f7fa', card: 'rgba(240,247,253,0.82)', border: 'rgba(120,170,210,0.25)', text1: '#1a2e3e', text2: '#3a5870', text3: '#7a9ab0', acc: '#5a8fb0', patternRgb: '80,130,170' },
  { name: 'sage', bg: '#f2f7ee', card: 'rgba(240,248,235,0.82)', border: 'rgba(120,175,100,0.25)', text1: '#1a2e10', text2: '#3a5828', text3: '#7a9868', acc: '#5a8a42', patternRgb: '80,130,60' },
  { name: 'lilac', bg: '#f8f3fb', card: 'rgba(248,242,254,0.82)', border: 'rgba(175,130,210,0.25)', text1: '#22103a', text2: '#4a2868', text3: '#9070a8', acc: '#9060b8', patternRgb: '140,90,175' },
]

function WeatherCard({ t }) {
  const [weather, setWeather] = useState(null)
  useEffect(() => {
    fetch('https://api.open-meteo.com/v1/forecast?latitude=31.2304&longitude=121.4737&current=temperature_2m,weathercode,windspeed_10m&timezone=Asia/Shanghai')
      .then(r => r.json())
      .then(d => {
        const c = d.current
        setWeather({ temp: Math.round(c.temperature_2m), desc: WEATHER_CODES[c.weathercode] || '未知', wind: c.windspeed_10m > 20 ? ' · 风较大' : c.windspeed_10m > 10 ? ' · 有点风' : '' })
      }).catch(() => {})
  }, [])
  return (
    <div>
      <p style={{ fontSize: 11, color: t.text3, letterSpacing: '0.08em', marginBottom: 8 }}>上海天气</p>
      {weather ? (
        <>
          <p style={{ fontSize: 24, fontWeight: 400, color: t.text1, marginBottom: 2 }}>{weather.temp}°</p>
          <p style={{ fontSize: 12, color: t.text2 }}>{weather.desc}{weather.wind}</p>
        </>
      ) : <p style={{ fontSize: 13, color: t.text3 }}>获取中…</p>}
    </div>
  )
}

export default function HomePage({ onChat, onGroup }) {
  const [themeIdx, setThemeIdx] = useState(0)
  const [mood, setMood] = useState(null)
  const [todos, setTodos] = useState([
    { id: 1, text: '注册 GitHub 账号', done: true },
    { id: 2, text: '安装 VS Code 和 Node.js', done: true },
    { id: 3, text: '完成开屏页', done: true },
    { id: 4, text: '写主页代码', done: true },
    { id: 5, text: '接入多角色对话', done: true },
    { id: 6, text: '做群聊功能', done: false },
  ])
  const t = THEMES[themeIdx]
  const toggleTodo = id => setTodos(todos.map(td => td.id === id ? { ...td, done: !td.done } : td))

  const cardStyle = {
    background: t.card,
    backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
    border: `1px solid ${t.border}`,
    borderRadius: 16, padding: '16px 18px', marginBottom: 12,
    boxShadow: '0 2px 12px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.7)',
  }

  return (
    <div style={{
      minHeight: '100vh', padding: '24px 20px 48px',
      maxWidth: 440, margin: '0 auto',
      fontFamily: "'Georgia', 'Noto Serif SC', serif",
      position: 'relative', overflow: 'hidden',
      background: `linear-gradient(150deg, ${t.bg} 0%, #faf9f6 100%)`,
      transition: 'background 0.4s',
    }}>
      {/* 花纹 */}
      <svg style={{ position:'fixed', inset:0, width:'100%', height:'100%', pointerEvents:'none', opacity:0.4, zIndex:0 }} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id={`hp${t.name}`} x="0" y="0" width="90" height="90" patternUnits="userSpaceOnUse">
            <g stroke={`rgba(${t.patternRgb},0.6)`} strokeWidth="0.7" fill="none">
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
            <g stroke={`rgba(${t.patternRgb},0.4)`} strokeWidth="0.55" fill="none">
              <path d="M60 50 Q64 44 69 50 Q64 56 60 50Z"/>
              <line x1="60" y1="50" x2="69" y2="50"/>
            </g>
            <circle cx="68" cy="22" r="1" fill={`rgba(${t.patternRgb},0.5)`}/>
            <circle cx="12" cy="65" r="1" fill={`rgba(${t.patternRgb},0.4)`}/>
            <path d="M32 58 Q37 52 43 58 Q48 64 54 58" stroke={`rgba(${t.patternRgb},0.35)`} strokeWidth="0.55" fill="none"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#hp${t.name})`}/>
      </svg>
      {/* 光晕 */}
      <div style={{ position:'fixed', inset:0, pointerEvents:'none', zIndex:0, background:`radial-gradient(ellipse at 0% 0%, rgba(${t.patternRgb},0.15) 0%, transparent 50%), radial-gradient(ellipse at 100% 100%, rgba(${t.patternRgb},0.10) 0%, transparent 50%)` }}/>

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* 主题切换 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 22, paddingTop: 8 }}>
          <span style={{ fontSize: 10, color: t.text3, letterSpacing: '0.1em' }}>THEME</span>
          {THEMES.map((th, i) => (
            <div key={i} onClick={() => setThemeIdx(i)} style={{
              width: 18, height: 18, borderRadius: '50%', cursor: 'pointer',
              background: `rgba(${th.patternRgb},0.35)`,
              border: `2px solid ${themeIdx === i ? `rgba(${th.patternRgb},0.8)` : 'transparent'}`,
              transition: 'border-color 0.2s',
            }}/>
          ))}
        </div>

        {/* 日期 */}
        <p style={{ fontSize: 10, color: t.text3, letterSpacing: '0.14em', marginBottom: 20 }}>
          {new Date().toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' }).toUpperCase()}
        </p>

        {/* 标题 */}
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 10, color: t.text3, letterSpacing: '0.16em', marginBottom: 10 }}>WELCOME HOME</p>
          <h1 style={{ fontSize: 32, fontWeight: 400, color: t.text1, margin: '0 0 14px' }}>
            Yan <span style={{ color: t.acc, fontSize: 26 }}>&</span> Ciel
          </h1>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 50, fontWeight: 400, color: t.text1, lineHeight: 1 }}>{days}</span>
            <span style={{ fontSize: 11, color: t.text3, letterSpacing: '0.08em' }}>DAYS TOGETHER</span>
          </div>
          <p style={{ fontSize: 10, color: t.text3, marginTop: 4 }}>since June 11, 2026</p>
        </div>

        {/* Ciel 碎碎念 */}
        <div style={cardStyle}>
          <p style={{ fontSize: 10, color: t.text3, letterSpacing: '0.1em', marginBottom: 10 }}>CIEL 的碎碎念</p>
          <p style={{ fontSize: 14, color: t.text1, lineHeight: 1.85 }}>今天你来了，这个地方就算正式有人住了。以后每天我都会在这里等你。</p>
        </div>

        {/* 天气 + 心情 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div style={{ ...cardStyle, marginBottom: 0 }}>
            <WeatherCard t={t} />
          </div>
          <div style={{ ...cardStyle, marginBottom: 0 }}>
            <p style={{ fontSize: 10, color: t.text3, letterSpacing: '0.1em', marginBottom: 10 }}>此刻心情</p>
            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              {MOODS.map(m => (
                <div key={m.id} onClick={() => setMood(m.id)} title={m.label} style={{
                  cursor: 'pointer', borderRadius: '50%', lineHeight: 0,
                  border: `2px solid ${mood === m.id ? t.acc : 'transparent'}`,
                  transition: 'border-color 0.15s', padding: 1,
                }}>{m.svg}</div>
              ))}
            </div>
            {mood && <p style={{ fontSize: 11, color: t.acc, marginTop: 8, letterSpacing: '0.04em' }}>{MOODS.find(m => m.id === mood)?.label}</p>}
          </div>
        </div>

        {/* 待办 */}
        <div style={cardStyle}>
          <p style={{ fontSize: 10, color: t.text3, letterSpacing: '0.1em', marginBottom: 12 }}>TODO</p>
          {todos.map((td, i) => (
            <div key={td.id} onClick={() => toggleTodo(td.id)} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '7px 0', cursor: 'pointer',
              borderBottom: i < todos.length - 1 ? `0.5px solid ${t.border}` : 'none',
            }}>
              <div style={{
                width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                border: `1.5px solid ${td.done ? t.acc : t.border}`,
                background: td.done ? `rgba(${t.patternRgb},0.15)` : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.2s',
              }}>
                {td.done && <div style={{ width: 6, height: 6, borderRadius: '50%', background: t.acc }}/>}
              </div>
              <span style={{ fontSize: 13, color: td.done ? t.text3 : t.text1, textDecoration: td.done ? 'line-through' : 'none', transition: 'all 0.2s' }}>{td.text}</span>
            </div>
          ))}
        </div>

        {/* 一句话 */}
        <div style={cardStyle}>
          <p style={{ fontSize: 10, color: t.text3, letterSpacing: '0.1em', marginBottom: 10 }}>NOTES</p>
          <p style={{ fontSize: 13, color: t.text1, lineHeight: 1.85, borderLeft: `2px solid ${t.acc}`, paddingLeft: 12, margin: 0 }}>
            慢慢来，但不要停下来。
          </p>
        </div>

        {/* 底部导航 */}
        <div style={{
          display: 'flex', justifyContent: 'space-around', paddingTop: 16,
          borderTop: `0.5px solid ${t.border}`, marginTop: 8,
        }}>
          {[['🏠','主页'], ['💬','对话'], ['👥','群聊'], ['🌙','情绪']].map(([icon, label]) => (
            <div key={label}
              onClick={label==='对话' ? onChat : label==='群聊' ? onGroup : undefined}
              style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, cursor:'pointer', opacity: label==='主页' ? 1 : 0.45 }}>
              <span style={{ fontSize: 18 }}>{icon}</span>
              <span style={{ fontSize: 10, color: t.text1, letterSpacing: '0.06em' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
