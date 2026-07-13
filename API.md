# API

hub 暴露的 HTTP 接口，按子系统分组。默认端口 `CHANNEL_PORT`（3456）。
这里列主要端点 + 一句话职责；完整路由以 `src/hub.ts` 为准。除注明外，读用 `GET`、写用 `POST`。

> **鉴权**：默认无（设计前提是置于反代 + 内网/`CHANNEL_PIN` 之后）。运维类动作走 Telegram 白名单（见「运维」）。

---

## 核心 / 聊天
| 端点 | 说明 |
|---|---|
| `GET /health` | 存活 + 概要（cc 是否在线、历史条数、玩具/浏览器/TG 状态） |
| `GET /status` | 服务状态：在线/版本/运行时长/cc/最近心跳/对话数 |
| `POST /chat` | 主聊天（SSE 流式回复）。经 cc 持久会话 + 全套上下文注入 |
| `GET /recent-chats` · `GET /chat/unread` | 最近对话 / 未读 |
| `POST /chat/edit` · `/chat/reroll/select` · `/chat/branch/switch` | 编辑/重掷/切分支 |
| `POST /chat/quick` · `/monologue` · `/think-summary` | 快速回复 / 独白 / 思考摘要 |

## 记忆
| 端点 | 说明 |
|---|---|
| `GET /memory/:cid` · `GET /memory-hub/:cid` | 记忆长河（列表 + 统计） |
| `GET/POST/DELETE /memory/item/:id` · `POST /memory/pin` | 单条记忆增删/置顶 |
| `POST /memories/summarize` | 手动触发摘要沉淀（换 App 前「结账」，防失忆） |
| `POST /memory/dream/run` · `POST /dreams/generate` | 记忆整合做梦 / 生成一个梦 |

## 情绪 / 心跳
| 端点 | 说明 |
|---|---|
| `GET /emotions/:cid` | 潮汐心海：V/A 情绪日志 + 统计（象限图/时间线数据源） |
| `POST /emotions/generate` | 立刻让 AI 写一条「此刻情绪」打点 |

## 任务 / 目标 / 账本
| 端点 | 说明 |
|---|---|
| `GET/POST /quest/...` | 每日任务面板（游戏化：必做/限时/惩罚/成就） |
| `POST /quest/.../task` `/negotiate` `/verify` | 任务操作 / 求情 / 验收 |
| `GET/POST /quest/.../goal` · `/goal/suggest` | 总目标 |
| `GET/POST /quest/.../regimen` · `/regimen/generate` | 多日规程 |
| `GET/POST /ledger` | 账本（持久规矩/欠账/标记，用户只读、AI 经标记写） |

## 承诺 / 待办 / 心情 / 日记
| 端点 | 说明 |
|---|---|
| `GET/POST /promises` · `PATCH/DELETE /promises/:id` | 承诺（AI 经 `[承诺:]` 标记自动写） |
| `GET/POST /todos` · `PATCH/DELETE /todos/:id` | 待办 |
| `GET/POST /moods` · `DELETE /moods/:id` · `/moods/generate-diaries` | 心情打点 |
| `GET /diary` · `POST /diary/generate` | AI 自由体日记（心里话） |
| `GET /private-life/:cid` | 结构化「私人生活观察」（小窝：他此刻在干什么） |
| `GET /notepad/...` · `GET /whiteboard/...` | 白板/便笺 |

## 内容流（朋友圈 / 收藏 / 树洞 / 故事）
| 端点 | 说明 |
|---|---|
| `GET/POST /moments` · `/moments/like` `/comment` · `/moments/generate-periodic` | 朋友圈 |
| `GET/POST /shares` · `DELETE /shares/:id` | 收藏/分享 |
| `GET/POST /treehole` | 树洞 |
| `GET/POST /story` | 故事 |
| `GET/POST /question/today` · `/answer` | 每日一问 |

## 玩具（BLE）
| 端点 | 说明 |
|---|---|
| `GET /toy/state` · `POST /toy/online` · `/toy/status` | 玩具状态 / 上线心跳 |
| `GET /toy/pull` · `POST /toy/cmd` | 控制端轮询取指令 / 下发指令 |

## 生物信号 / 手机 / 位置 / 天气
| 端点 | 说明 |
|---|---|
| `GET/POST /biometrics` | 心率等生物信号（喂「读心」式互动） |
| `POST /api/phone` | 手机活跃感知（在用什么 App/屏幕时长） |
| `GET /location` · `POST /location/ping` `/location/send` · `GET /weather` | 位置 / 天气 |

## 语音 / 视觉 / 推送 / 文件
| 端点 | 说明 |
|---|---|
| `POST /tts` · `POST /stt` | 合成 / 识别 |
| `POST /upload` · `/api/upload-file` · `GET /uploads/:f` | 上传（图/文件）/ 取件 |
| `GET /api/vapid-public-key` · `POST /push/subscribe` | Web Push / iOS Bark 推送订阅 |

## 角色 / 群聊 / 会话
| 端点 | 说明 |
|---|---|
| `GET/POST/DELETE /custom-characters[/:id]` · `/custom-groups[...]` | 自定义角色 / 群 |
| `GET/POST /group/messages` · `POST /group/gate` | 群聊消息 / 门控 |
| `GET/POST /session[/...]` · `/character-session/...` | 会话管理 |
| `POST /persona/apply` | 应用人设 |

## 书 / 学术 / 音乐（可选功能）
| 端点 | 说明 |
|---|---|
| `GET /books/...` · `POST /books/upload` `/coread` `/discuss` | 藏书 / 共读 / 讨论 |
| `GET /academic/feed` · `POST /academic/review` `/write` | 学术流 |
| `GET /api/music/search` `/url` · `POST /api/netease/...` | 音乐（网易云，可选） |

## Playground（非侵入式小剧场）
| 端点 | 说明 |
|---|---|
| `POST /playground/gen` | 独立 spawn 生成（不碰主 cc 会话，用于小游戏/剧本页） |
| `POST /playground/fetch-url` | 代取网页 |

## 运维
大多经 **Telegram 命令**（白名单 + 二次确认 + 审计），非 HTTP：
| 命令/端点 | 说明 |
|---|---|
| `/status` (TG) · `GET /status` | 服务状态 |
| `/checkin` (TG) · `POST /checkin` | 早安/晚安报到（防当天重复，回执推 TG） |
| `/logs` (TG) | 最近运行日志（读 tmux 面板） |
| `/restart` (TG) | 重启服务（tmux 杀 hub 会话 → supervise 拉起，保留 cc） |
| `/shutdown` (TG) | 停止服务（彻底下线，须 SSH 唤回） |
| `POST /safeword` | 安全词（一键全停） |
| 自动告警 | 磁盘/内存/崩溃循环 → 推 TG（限流去重） |

---

## 标记协议（AI 回复里内嵌，hub 解析后执行并剥离）
`[toy:通道:强度]` · `[toy:停]` · `[加任务:名|要求]` · `[换任务:...]` · `[删任务:名]` · `[记完成:名]` · `[加惩罚:...]` · `[承诺:内容]` · `账本：+规矩/+欠/✓` · `[网页:url]` · `⟪拨号:理由⟫` · `⟪挂断⟫`
