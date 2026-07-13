// 屿 · 浏览器遥控 —— MV3 service worker
// 长轮询 hub 取屿的指令并执行,回报当前页给屿"看"。点扩展图标 开/关。
const HUB = 'https://your-domain.example';
let enabled = true;
let polling = false;

function setBadge() {
  chrome.action.setBadgeText({ text: enabled ? 'ON' : 'OFF' });
  chrome.action.setBadgeBackgroundColor({ color: enabled ? '#4ade80' : '#888888' });
  chrome.action.setTitle({ title: '屿遥控 · ' + (enabled ? '开着(点击关)' : '关了(点击开)') });
}
function reportStatus() {
  fetch(HUB + '/browser/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ connected: enabled }) }).catch(() => {});
}

chrome.storage.local.get('enabled', (r) => { enabled = r.enabled !== false; setBadge(); reportStatus(); if (enabled) startPoll(); });
chrome.action.onClicked.addListener(async () => {
  enabled = !enabled;
  await chrome.storage.local.set({ enabled });
  setBadge(); reportStatus();
  if (enabled) startPoll();
});
// SW 可能被系统回收 → 每分钟唤醒确保轮询在跑
chrome.alarms.create('keepalive', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(() => { if (enabled && !polling) startPoll(); });

async function activeTab() { const [t] = await chrome.tabs.query({ active: true, currentWindow: true }); return t; }

async function reportPage() {
  try {
    const t = await activeTab();
    if (!t || !t.id || !/^https?:/.test(t.url || '')) return;
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: t.id },
      func: () => {
        const seen = new Set();
        const imgs = [];
        for (const el of document.querySelectorAll('img')) {
          const src = el.currentSrc || el.src;
          if (!src || !/^https?:/.test(src) || seen.has(src)) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 150 || r.height < 150) continue;   // 滤掉图标/像素/装饰小图
          seen.add(src);
          imgs.push({ src, alt: (el.alt || '').slice(0, 100), area: Math.round(r.width * r.height) });
        }
        imgs.sort((a, b) => b.area - a.area);              // 大图=主图优先
        const vids = [];
        for (const v of document.querySelectorAll('video')) {
          const r = v.getBoundingClientRect();
          if (r.width < 120 || r.height < 120) continue;
          vids.push({ poster: v.poster || '' });
        }
        return {
          title: document.title,
          url: location.href,
          text: (document.body ? document.body.innerText : '').slice(0, 4000),
          images: imgs.slice(0, 6).map((i) => ({ src: i.src, alt: i.alt })),
          videos: vids.slice(0, 3),
        };
      },
    });
    if (res && res.result) fetch(HUB + '/browser/page', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(res.result) }).catch(() => {});
  } catch (e) {}
}
chrome.tabs.onActivated.addListener(reportPage);
chrome.tabs.onUpdated.addListener((id, info) => { if (info.status === 'complete') reportPage(); });

async function exec(cmd) {
  try {
    const t = await activeTab();
    if (!t || !t.id) return;
    if (cmd.action === 'open') { let u = String(cmd.url || ''); if (!/^https?:/.test(u)) u = 'https://' + u; await chrome.tabs.update(t.id, { url: u }); }
    else if (cmd.action === 'back') { await chrome.tabs.goBack(t.id).catch(() => {}); }
    else if (cmd.action === 'forward') { await chrome.tabs.goForward(t.id).catch(() => {}); }
    else if (cmd.action === 'read') { setTimeout(reportPage, 300); return; }
    else if (cmd.action === 'scroll') {
      await chrome.scripting.executeScript({ target: { tabId: t.id }, func: (d) => window.scrollBy({ top: d === 'up' ? -800 : 800, behavior: 'smooth' }), args: [cmd.dir] });
    }
    else if (cmd.action === 'type') {
      await chrome.scripting.executeScript({
        target: { tabId: t.id },
        func: (txt) => {
          const fire = (e) => { e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); };
          let el = document.activeElement;
          if (!el || !(el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
            el = document.querySelector('textarea, input[type=text], input[type=search], input[type=email], input:not([type]), [contenteditable=true]');
            if (el) el.focus();
          }
          if (!el) return false;
          if (el.isContentEditable) { el.textContent = txt; } else { el.value = txt; }
          fire(el);
          return true;
        },
        args: [String(cmd.text || '')],
      });
    }
    else if (cmd.action === 'click') {
      await chrome.scripting.executeScript({
        target: { tabId: t.id },
        func: (target) => {
          const els = [...document.querySelectorAll('button, a, [role="button"], input[type="submit"], input[type="button"], label, span, div')];
          const el = els.find((e) => ((e.innerText || e.value || '').trim()).includes(target) && e.offsetParent !== null);
          if (el) { el.click(); return true; }
          return false;
        },
        args: [String(cmd.target || '')],
      });
    }
    setTimeout(reportPage, 900);   // 操作后回报新页面状态给屿
  } catch (e) {}
}

async function startPoll() {
  if (polling) return;
  polling = true;
  while (enabled) {
    try {
      const r = await fetch(HUB + '/browser/pull', { cache: 'no-store' });   // 长轮询(hub 挂起最多25秒),让 SW 靠这条 fetch 保活
      const d = await r.json();
      for (const c of (d.commands || [])) await exec(c);
    } catch (e) {
      await new Promise((res) => setTimeout(res, 3000));   // 网络抖动退避
    }
  }
  polling = false;
}
