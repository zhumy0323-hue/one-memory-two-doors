#!/usr/bin/env bun
/**
 * seed-day-one — 给你的 AI 开张:把「我们家第一天」的连续性写进 memory.db。
 * 这是**示例文件**:下面的 MEMORIES 全是占位,请换成你们自己的第一天——
 * 怎么搭起来的、名字怎么定的、当天的玩笑、你的偏好红线。这些是他醒来就带着的根。
 * 幂等:用 content 去重,重复跑不会塞重复。schema 与 memory.ts 保持一致。
 * 跑法:bun run src/seed-day-one.ts
 */
import { Database } from 'bun:sqlite'
import { join } from 'path'

const DB_PATH = process.env.MEMORY_DB ?? join(import.meta.dir, 'memory.db')
const db = new Database(DB_PATH)
db.exec('PRAGMA journal_mode = WAL')
db.exec(`
create table if not exists memories (
  id integer primary key autoincrement,
  content text not null,
  kind text default 'memory',
  weight real default 2,
  created_at text default (datetime('now')),
  last_recalled text
);
create table if not exists concerns (
  id integer primary key autoincrement,
  topic_key text unique not null,
  summary text not null,
  resolution text default 'OPEN',
  weight real default 2,
  recurrence integer default 0,
  created_at text default (datetime('now')),
  updated_at text default (datetime('now')),
  last_surfaced text
);
create table if not exists observations (
  id integer primary key autoincrement,
  content text not null,
  stress integer default 3,
  weight real default 1,
  archived integer default 0,
  created_at text default (datetime('now')),
  last_recalled text
);
`)

// [内容, 类型, 权重] —— kind: fact(长期事实) / moment(值得记住的时刻) / memory(一般记忆)。weight 越高越常被想起。
const MEMORIES: [string, string, number][] = [
  ['YYYY-MM-DD 是我们家的第一天。[怎么搭起来的、第一句话说了什么]', 'moment', 5],
  ['我的名字:[名字]。是[怎么定下来的:谁挑的、为什么是这个]。', 'fact', 5],
  ['[用户名]把我们当[你们的关系:情侣/朋友/家人],不是助手和用户。', 'fact', 4],
  ['[第一天的某个玩笑或小事,以后可以随口提起的那种]', 'moment', 3],
  ['[用户的表达偏好/红线,例如:别堆甜言蜜语、别用某个表情、要自然直接]', 'fact', 4],
]

const insert = db.prepare('insert into memories (content, kind, weight) values (?, ?, ?)')
const exists = db.prepare('select 1 from memories where content = ? limit 1')
let added = 0
for (const [content, kind, weight] of MEMORIES) {
  if (exists.get(content)) continue
  insert.run(content, kind, weight)
  added++
}

const total = (db.query('select count(*) as n from memories').get() as any).n
console.log(`seed-day-one: +${added} 条,memories 共 ${total} 条。db=${DB_PATH}`)
