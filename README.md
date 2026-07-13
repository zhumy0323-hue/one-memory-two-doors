<div align="center">

# 一份记忆，两个入口

**一个自托管的 AI 陪伴后端**——Telegram 和网页共享同一份记忆、同一个人，由 Claude Code 驱动，长期在线、有主动性。

</div>

---

不是聊天机器人 demo，是一套**长期陪伴**的骨架：他记得你、会主动找你、在哪个入口说话都接得上，还能接玩具、语音、推送。核心设计只有一句——**从头到尾只有一份记忆，所有入口打同一个网关**。

> 这是一个**脱敏参考实现**：完整可跑的代码 + 文档，但作者的密钥、身份和私人数据已全部剥除，人设换成了模板。fork 下来填上你自己的 persona 和密钥即可运行。

## 能干什么

- 🧠 **不失忆**：多入口共享一份记忆；三层记忆（最近对话 / 自动摘要沉淀 / 相关性检索 + 保底）
- 💬 **多入口**：Telegram（可多 bot 扮多角色）+ 网页 PWA，同一个后端、同一份上下文
- 🫀 **有主动性**：主动找你、夜间写日记/做梦、发「朋友圈」、情绪打点——都可开关
- 🎛️ **会动手**：AI 回复里内嵌标记 → 真的去控玩具 / 改任务面板 / 记承诺 / 开网页
- 🔊 **可扩展**：语音(TTS/STT)、视觉看图、iOS 推送、BLE 玩具、多 LLM 角色
- 🛠️ **能运维**：`/status` `/logs` `/restart` `/shutdown`（白名单+二次确认+审计）、自动告警

## 架构

见 **[ARCHITECTURE.md](ARCHITECTURE.md)**（强烈建议先读）。接口清单见 **[API.md](API.md)**。

## 快速开始（约 5 分钟）

**前置**：[Bun](https://bun.sh)、[Claude Code CLI](https://claude.com/claude-code)（`claude`，已登录）、`tmux`；可选 Caddy/nginx 做 HTTPS（Telegram Mini App / PWA 需要）。

```bash
git clone <this-repo> && cd <this-repo>
bun install                                              # 装依赖(web-push / ws / mcp-sdk)
cp .env.example .env                                     # 至少填 TELEGRAM_BOT_TOKEN(找 @BotFather 要)
cp personas/companion.example.md personas/companion.md   # 写你的 AI 是谁
# 可选：cp personas/second.example.md personas/second.md  # 第二个角色
bun run src/hub.ts                                       # 起 hub(默认 :3456)
```

**验证**：`curl localhost:3456/health` 应回 `{"status":"ok",...}`；给你的 TG bot 发一句话，他应答。
常驻部署（systemd + supervise + tmux）见 [ARCHITECTURE.md](ARCHITECTURE.md) 的「部署」。

## 踩坑 / Troubleshooting

作者踩过的都在这（多是自托管 / 墙内环境的通病）：

- **`bun: command not found`（systemd / 非交互 shell 里）**：非交互 shell 不加载 `~/.bashrc`，`bun` 不在 PATH。用绝对路径 `~/.bun/bin/bun`，或在 supervise 脚本里显式 export PATH。
- **推/拉 GitHub `Failed to connect port 443`、超时（墙内）**：走代理。`git config --global http.proxy http://127.0.0.1:7890`（端口按你的代理，Clash 常 7890），或 `gh auth login` 浏览器登录。
- **`git push` 报 `Password authentication is not supported`**：GitHub 不收密码，用 **Personal Access Token**（`repo` 权限）当密码，或 `gh auth login`。**别把 token 贴进任何聊天 / 日志**。
- **TTS/HTTPS 请求 `TLSV1_ALERT_INTERNAL_ERROR`（尤其 macOS 系统 Python）**：系统 Python 用 LibreSSL 握手失败 → 改用 `curl` 子进程，或换 Homebrew Python。
- **Windows 上编辑后 `bun build` 行尾报错**：CRLF。部署前 `sed -i 's/\r$//' file`。
- **改了 `hub.ts` 想热更新、又不想清掉 AI 的会话记忆**：`tmux kill-session -t hub`（supervise ~30s 重建 hub、**保留 cc 会话**）。注意 `systemctl restart` **不会**重置 cc（tmux server 持久）；要彻底重开 cc 才 `tmux kill-server`。
- **AI 变慢 / 一条回复好几分钟**：cc 会话上下文膨胀。靠深夜自动 `/compact`（见 ARCHITECTURE），或 `tmux kill-server` 重开 fresh 会话（连续性靠 memory.db，不靠会话本身）。
- **scp 上去却没生效**：`scp … | tail` 会吞掉失败退出码。scp 后 **grep 确认新代码真落地**再 build / 重启。

## 数据流向 & 隐私边界

```
你(任意入口) ──▶ hub 网关 ──▶ 组装上下文 ──▶ 你的 LLM ──▶ 回复
                   │                               │
                   └──── 读/写 ───▶ 共享存储 ◀──── 记账 / 摘要沉淀
                        memory.db(SQLite) + *.json + history/
```

- **从哪来**：你在 TG / 网页说的话，加上你可选接入的信号（心率 / 位置 / 手机活跃…，都有开关）。
- **经过哪里**：只经**你自己的 hub**。语音(TTS/STT)、视觉、部分 LLM 若用**云 API**，那部分内容会到对应厂商——`.env.example` 里逐项标了 `← SECRET`；想全本地就换自托管模型。
- **落到哪里**：全部在你服务器的 `memory.db` + `*.json` + `history/`，不出你的机器。
- **私密边界**：以上运行时数据 + `.env` + 你的私人人设，**全部被 `.gitignore` 排除、绝不进仓库**。开源你自己的实例前，`git log --all -- .env` 核一遍，确认从没手滑提交过。

## 致谢与许可

设计与实现受一批自托管 AI 陪伴项目启发。建议以 MIT 或你偏好的开源许可发布（作者自定）。
