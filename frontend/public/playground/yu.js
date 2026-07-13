// Yu Playground 桥 —— 只对屿托管在 web/playground/ 下的同源页面可用。
// 单次生成：  const t = await Yu.gen("用你的口吻写…", { system });
// 多轮对话：  const reply = await Yu.chat(messages, { scene, system });   // messages:[{role:'user'|'assistant',content}]
// 一键聊天UI：Yu.mountChat(document.body, { scene, system, greeting, starters, placeholder });
// 读屿现有接口：await Yu.read("/memory");
// 说明：屿以自己人设/尺度生成(NSFW 由屿 CLAUDE.md 处理)；每轮最长约 2 分钟。多轮为无状态：每轮把最近历史拼进 prompt。
(function () {
  async function gen(prompt, opts) {
    opts = opts || {};
    const r = await fetch('/playground/gen', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: String(prompt || ''), system: opts.system || undefined, context: opts.context || undefined }),
    });
    const d = await r.json().catch(() => ({}));
    if (!d || !d.ok) throw new Error((d && d.error) || 'gen failed');
    return d.text;
  }
  async function chat(messages, opts) {
    opts = opts || {};
    const hist = (messages || []).slice(-12);   // 只带最近 12 条，控 prompt 长度
    const convo = hist.map(m => (m.role === 'user' ? '小满' : '你') + '：' + m.content).join('\n');
    const prompt =
      (opts.scene ? opts.scene.trim() + '\n\n' : '') +
      '下面是你(屿)和小满的对话。以你的身份、口吻，接住最后一句小满说的话继续。只输出你要说的话本身，不要旁白、不要角色名前缀、不要复述对话：\n\n' +
      convo + '\n你：';
    return gen(prompt, { system: opts.system });
  }
  async function read(path) {
    const p = String(path || '');
    const r = await fetch(p.startsWith('/') ? p : '/' + p);
    return r.json();
  }
  // 让 hub 服务端拉取一个网页 → {ok,title,text}
  async function fetchUrl(url) {
    const r = await fetch('/playground/fetch-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: String(url || '') }) });
    return r.json();
  }

  // 轻量深色聊天 UI，注入自己的样式，挂到任意容器。
  function mountChat(container, opts) {
    opts = opts || {};
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;
    if (!document.getElementById('yu-chat-css')) {
      const s = document.createElement('style'); s.id = 'yu-chat-css';
      s.textContent = `
      .sc-wrap{position:fixed;inset:0;display:flex;flex-direction:column;background:#0c0b0f;color:#e6e2ea;font-family:-apple-system,'PingFang SC',sans-serif}
      .sc-hd{flex-shrink:0;padding:calc(env(safe-area-inset-top,0) + 12px) 16px 10px;border-bottom:1px solid #201d27;font-size:13px;color:#b0a8ba;letter-spacing:.06em}
      .sc-log{flex:1;overflow-y:auto;padding:16px 14px;display:flex;flex-direction:column;gap:12px}
      .sc-row{display:flex;max-width:86%}
      .sc-u{align-self:flex-end}.sc-a{align-self:flex-start}
      .sc-b{padding:10px 14px;border-radius:14px;font-size:14px;line-height:1.7;white-space:pre-wrap;word-break:break-word}
      .sc-u .sc-b{background:linear-gradient(135deg,#7c4dff,#a94b7a);color:#fff;border-bottom-right-radius:4px}
      .sc-a .sc-b{background:#17151d;color:#e6e2ea;border:1px solid #262230;border-bottom-left-radius:4px}
      .sc-typing{color:#6a6572;font-size:13px;font-style:italic;padding:2px 4px}
      .sc-chips{display:flex;gap:7px;flex-wrap:wrap;padding:0 14px 8px}
      .sc-chip{font-size:12px;padding:6px 12px;border-radius:999px;border:1px solid #322e3a;color:#b0a8ba;background:transparent;cursor:pointer}
      .sc-bar{flex-shrink:0;display:flex;gap:8px;padding:10px 12px calc(env(safe-area-inset-bottom,0) + 12px);border-top:1px solid #201d27;background:#0c0b0f}
      .sc-in{flex:1;background:#17151d;border:1px solid #2a2732;border-radius:20px;color:#e6e2ea;font:14px/1.5 inherit;padding:9px 14px;outline:none;resize:none;max-height:120px}
      .sc-send{flex-shrink:0;width:44px;border:none;border-radius:22px;background:linear-gradient(135deg,#7c4dff,#a94b7a);color:#fff;font-size:16px;cursor:pointer}
      .sc-send:disabled{opacity:.45}`;
      document.head.appendChild(s);
    }
    el.innerHTML = `<div class="sc-wrap">
      <div class="sc-hd">${opts.title || '屿'}</div>
      <div class="sc-log" id="scLog"></div>
      <div class="sc-chips" id="scChips"></div>
      <div class="sc-bar"><textarea class="sc-in" id="scIn" rows="1" placeholder="${opts.placeholder || '跟屿说点什么…'}"></textarea><button class="sc-send" id="scSend">↑</button></div>
    </div>`;
    const log = el.querySelector('#scLog'), input = el.querySelector('#scIn'), send = el.querySelector('#scSend'), chips = el.querySelector('#scChips');
    const messages = [];
    const esc = (s) => { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; };
    // 极简安全 markdown：先转义(防 XSS)，再把 **粗**/*斜*/`码`/~~删~~ 和 # 标题、- 列表 渲染成标签。
    const md = (s) => esc(s)
      .replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>')
      .replace(/\*\*([\s\S]+?)\*\*/g, '<b>$1</b>')
      .replace(/(^|[^*])\*(?!\s)([^*\n]+?)\*/g, '$1<i>$2</i>')
      .replace(/~~([\s\S]+?)~~/g, '<s>$1</s>')
      .replace(/`([^`\n]+?)`/g, '<code style="background:rgba(255,255,255,.09);padding:1px 5px;border-radius:4px;font-size:.92em">$1</code>')
      .replace(/^[-*]\s+(.+)$/gm, '· $1');
    const addBubble = (role, text) => {
      const row = document.createElement('div'); row.className = 'sc-row ' + (role === 'user' ? 'sc-u' : 'sc-a');
      row.innerHTML = `<div class="sc-b">${role === 'assistant' ? md(text) : esc(text)}</div>`;
      log.appendChild(row); log.scrollTop = log.scrollHeight; return row.querySelector('.sc-b');
    };
    let busy = false;
    async function sendMsg(text) {
      text = (text || input.value).trim(); if (!text || busy) return;
      input.value = ''; input.style.height = 'auto'; chips.innerHTML = '';
      addBubble('user', text); messages.push({ role: 'user', content: text });
      busy = true; send.disabled = true;
      const typing = document.createElement('div'); typing.className = 'sc-row sc-a'; typing.innerHTML = '<div class="sc-typing">屿在打字…</div>';
      log.appendChild(typing); log.scrollTop = log.scrollHeight;
      try {
        const reply = await chat(messages, { scene: opts.scene, system: opts.system });
        typing.remove(); addBubble('assistant', reply); messages.push({ role: 'assistant', content: reply });
        if (navigator.vibrate) navigator.vibrate(12);
      } catch (e) { typing.remove(); addBubble('assistant', '（屿没接住…' + (e.message || e) + '，再说一次？）'); }
      busy = false; send.disabled = false; input.focus();
    }
    send.onclick = () => sendMsg();
    input.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } };
    input.oninput = () => { input.style.height = 'auto'; input.style.height = Math.min(120, input.scrollHeight) + 'px'; };
    (opts.starters || []).forEach(s => { const c = document.createElement('span'); c.className = 'sc-chip'; c.textContent = s; c.onclick = () => sendMsg(s); chips.appendChild(c); });
    if (opts.greeting) { addBubble('assistant', opts.greeting); messages.push({ role: 'assistant', content: opts.greeting }); }
    return { send: sendMsg, messages };
  }

  window.Yu = { gen: gen, chat: chat, read: read, fetchUrl: fetchUrl, mountChat: mountChat };
})();
