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

## 快速开始

```bash
# 1. 依赖:Bun + Claude Code CLI + tmux(+ 可选 Caddy/nginx 做 HTTPS)
# 2. 配置
cp .env.example .env         # 填 TELEGRAM_BOT_TOKEN(最低限度) + 你要的其它
# 3. 人设:把 personas/*.example.* 复制成你自己的,写你的 AI 是谁
cp personas/companion.example.md personas/companion.md
# 4. 跑
bun run src/hub.ts
```

细节（systemd + supervise + tmux 的常驻方式、热更新技巧、反代 HTTPS）见 ARCHITECTURE 的「部署」。

## ⚠ 隐私

这套东西天生装满私人数据（聊天/记忆/日记/情绪/健康…）。`.gitignore` 已把**所有数据文件 + `.env` + 私人人设**排除在外。**开源你自己的实例前，务必确认这些从未进过 git 历史**（`git log --all -- .env` 之类核一遍）。语音/视觉/TTS 若用云 API，注意哪些内容会出境（见 `.env.example` 注释）。

## 致谢与许可

设计与实现受一批自托管 AI 陪伴项目启发。建议以 MIT 或你偏好的开源许可发布（作者自定）。
