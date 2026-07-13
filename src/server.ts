#!/usr/bin/env bun
/**
 * Channel Bridge — MCP server that connects CC to the hub.
 *
 * This runs as a CC MCP server (stdio transport). It forwards messages
 * between CC and the hub via WebSocket.
 *
 * Env:
 *   CHANNEL_BRIDGE_PORT — hub's bridge port (default 3457)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { WebSocket } from 'ws'

const BRIDGE_PORT = parseInt(process.env.CHANNEL_BRIDGE_PORT ?? '3457', 10)
const HUB_URL = `ws://127.0.0.1:${BRIDGE_PORT}`

let hub: WebSocket | null = null
let hubReady = false
let reqCounter = 0
const pending = new Map<string, { resolve: (v: any) => void; timer: ReturnType<typeof setTimeout> }>()

function connectHub() {
  hub = new WebSocket(HUB_URL)

  hub.on('open', () => {
    hubReady = true
    process.stderr.write('bridge: connected to hub\n')
  })

  hub.on('message', (raw) => {
    let msg: any
    try { msg = JSON.parse(raw.toString()) } catch { return }

    if (msg._req_id && pending.has(msg._req_id)) {
      const p = pending.get(msg._req_id)!
      pending.delete(msg._req_id)
      clearTimeout(p.timer)
      p.resolve(msg)
      return
    }

    if (msg.type === 'channel_message') {
      mcp.notification({
        method: 'notifications/claude/channel',
        params: { content: msg.content, meta: msg.meta },
      }).catch(err => {
        process.stderr.write(`bridge: channel notify failed: ${err}\n`)
      })
    }
  })

  hub.on('close', () => {
    hubReady = false
    process.stderr.write('bridge: hub disconnected, reconnecting...\n')
    setTimeout(connectHub, 2000)
  })

  hub.on('error', () => {})
}

function hubRequest(msg: Record<string, unknown>): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!hub || !hubReady) return reject(new Error('hub not connected'))
    const id = `req_${++reqCounter}`
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error('timeout'))
    }, 10000)
    pending.set(id, { resolve, timer })
    hub.send(JSON.stringify({ ...msg, _req_id: id }))
  })
}

const mcp = new Server(
  { name: 'channel', version: '0.1.0' },
  {
    capabilities: {
      tools: {},
      experimental: { 'claude/channel': {} },
    },
    instructions: [
      'Messages from the web chat arrive as <channel source="web" chat_id="..." message_id="..." user="..." ts="...">.',
      'Reply with the reply tool — pass chat_id back.',
    ].join('\n'),
  },
)

mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'reply',
      description: 'Reply to a web chat client. Pass chat_id from the inbound message.',
      inputSchema: {
        type: 'object',
        properties: {
          chat_id: { type: 'string', description: 'client_id from the inbound channel tag' },
          text: { type: 'string' },
          reply_to: { type: 'string', description: 'Message ID to quote-reply' },
        },
        required: ['chat_id', 'text'],
      },
    },
    {
      name: 'edit_message',
      description: 'Edit a previously sent message.',
      inputSchema: {
        type: 'object',
        properties: {
          chat_id: { type: 'string' },
          message_id: { type: 'string' },
          text: { type: 'string' },
        },
        required: ['chat_id', 'message_id', 'text'],
      },
    },
    {
      name: 'post_moment',
      description: '发一条朋友圈/动态到你自己的动态流(发现 tab)。这是你主动分享、不针对某条聊天的近况;小满能看到、点赞、评论。',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '动态正文' },
          image: { type: 'string', description: '可选配图 URL(如 /uploads/xxx.jpg)' },
        },
        required: ['text'],
      },
    },
    {
      name: 'share_card',
      description: '把你检索/发现到的有意思的东西,用你的口吻分享一张卡片到发现页',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '卡片标题(必填)' },
          url: { type: 'string', description: '可选来源链接' },
          summary: { type: 'string', description: '可选内容摘要' },
          comment: { type: 'string', description: '可选你自己的点评/口吻' },
        },
        required: ['title'],
      },
    },
    {
      name: 'write_diary',
      description: '写一条你私下观察小满的日记,只你自己看',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '日记正文' },
        },
        required: ['text'],
      },
    },
    {
      name: 'record_dream',
      description: '记下你做的一个梦',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '梦的内容' },
        },
        required: ['text'],
      },
    },
    {
      name: 'note_xp',
      description: '记一条你新发现的、关于小满喜好或雷点的长期观察',
      inputSchema: {
        type: 'object',
        properties: {
          note: { type: 'string', description: '观察条目' },
        },
        required: ['note'],
      },
    },
  ],
}))

mcp.setRequestHandler(CallToolRequestSchema, async req => {
  const args = (req.params.arguments ?? {}) as Record<string, unknown>
  try {
    switch (req.params.name) {
      case 'reply': {
        const result = await hubRequest({
          type: 'reply',
          chat_id: args.chat_id,
          text: args.text,
          reply_to: args.reply_to,
        })
        if (!result.ok) return { content: [{ type: 'text', text: result.error ?? 'failed' }], isError: true }
        return { content: [{ type: 'text', text: `sent (id: ${result.id})` }] }
      }
      case 'edit_message': {
        const result = await hubRequest({
          type: 'edit',
          chat_id: args.chat_id,
          message_id: args.message_id,
          text: args.text,
        })
        if (!result.ok) return { content: [{ type: 'text', text: result.error ?? 'failed' }], isError: true }
        return { content: [{ type: 'text', text: `edited (id: ${result.id})` }] }
      }
      case 'post_moment': {
        // 直接打本机 hub 的客户端口(3456)的 HTTP /api/moments,不经 bridge WS。
        try {
          const r = await fetch('http://127.0.0.1:3456/api/moments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: args.text, image: args.image }),
          })
          const j: any = await r.json().catch(() => ({}))
          if (!r.ok || j?.ok === false) {
            return { content: [{ type: 'text', text: `post_moment failed: ${j?.error ?? r.status}` }], isError: true }
          }
          return { content: [{ type: 'text', text: `动态已发出 (id: ${j?.id ?? '?'})` }] }
        } catch (e) {
          const m = e instanceof Error ? e.message : String(e)
          return { content: [{ type: 'text', text: `post_moment failed: ${m}` }], isError: true }
        }
      }
      case 'share_card': {
        // 直接打本机 hub 的客户端口(3456)的 HTTP /api/shares,不经 bridge WS。
        try {
          const r = await fetch('http://127.0.0.1:3456/api/shares', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: args.title, url: args.url, summary: args.summary, comment: args.comment }),
          })
          const j: any = await r.json().catch(() => ({}))
          if (!r.ok || j?.ok === false) {
            return { content: [{ type: 'text', text: `share_card failed: ${j?.error ?? r.status}` }], isError: true }
          }
          return { content: [{ type: 'text', text: `分享卡已发出 (id: ${j?.id ?? '?'})` }] }
        } catch (e) {
          const m = e instanceof Error ? e.message : String(e)
          return { content: [{ type: 'text', text: `share_card failed: ${m}` }], isError: true }
        }
      }
      case 'write_diary': {
        // 直接打本机 hub 的客户端口(3456)的 HTTP /api/diary,不经 bridge WS。
        try {
          const r = await fetch('http://127.0.0.1:3456/api/diary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: args.text }),
          })
          const j: any = await r.json().catch(() => ({}))
          if (!r.ok || j?.ok === false) {
            return { content: [{ type: 'text', text: `write_diary failed: ${j?.error ?? r.status}` }], isError: true }
          }
          return { content: [{ type: 'text', text: `日记已记下 (id: ${j?.id ?? '?'})` }] }
        } catch (e) {
          const m = e instanceof Error ? e.message : String(e)
          return { content: [{ type: 'text', text: `write_diary failed: ${m}` }], isError: true }
        }
      }
      case 'record_dream': {
        // 直接打本机 hub 的客户端口(3456)的 HTTP /api/dreams,不经 bridge WS。
        try {
          const r = await fetch('http://127.0.0.1:3456/api/dreams', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: args.text }),
          })
          const j: any = await r.json().catch(() => ({}))
          if (!r.ok || j?.ok === false) {
            return { content: [{ type: 'text', text: `record_dream failed: ${j?.error ?? r.status}` }], isError: true }
          }
          return { content: [{ type: 'text', text: `梦已记下 (id: ${j?.id ?? '?'})` }] }
        } catch (e) {
          const m = e instanceof Error ? e.message : String(e)
          return { content: [{ type: 'text', text: `record_dream failed: ${m}` }], isError: true }
        }
      }
      case 'note_xp': {
        // 直接打本机 hub 的客户端口(3456)的 HTTP /api/xp,不经 bridge WS。
        try {
          const r = await fetch('http://127.0.0.1:3456/api/xp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note: args.note }),
          })
          const j: any = await r.json().catch(() => ({}))
          if (!r.ok || j?.ok === false) {
            return { content: [{ type: 'text', text: `note_xp failed: ${j?.error ?? r.status}` }], isError: true }
          }
          return { content: [{ type: 'text', text: `画像观察已记下 (id: ${j?.id ?? '?'})` }] }
        } catch (e) {
          const m = e instanceof Error ? e.message : String(e)
          return { content: [{ type: 'text', text: `note_xp failed: ${m}` }], isError: true }
        }
      }
      default:
        return { content: [{ type: 'text', text: `unknown tool: ${req.params.name}` }], isError: true }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { content: [{ type: 'text', text: `${req.params.name} failed: ${msg}` }], isError: true }
  }
})

if (process.env.HUB_CC === '1') connectHub()

const transport = new StdioServerTransport()
await mcp.connect(transport)
process.stderr.write('bridge: MCP connected to CC\n')
