<div align="center">

**[pi](https://pi.dev) 的 `/skills` 命令 —— 一行挂载多个 skill。**

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![CI](https://github.com/L2ncE/pi-multi-skill/actions/workflows/ci.yml/badge.svg)](https://github.com/L2ncE/pi-multi-skill/actions/workflows/ci.yml)

[English README](README.md)

</div>

## 这是什么

pi 一条消息只能调用一个 skill，且必须位于首行行首。想串两个 skill 加一段正文，
得手动发三条消息；而用 Shift+Enter 在 `/skill:name` 后面换行，核心解析会把整条
消息当成纯文本（换行不是合法分隔符）。

`/skills` 一个命令解决：

```
/skills human-writing lanlance-article 写一篇关于 https://blog.cloudflare.com/code-mode/ 的文章
```

每个 skill 的 `SKILL.md` 会作为独立的 user message（标准 `<skill>` 块）注入，
聊天界面渲染为一个个可折叠的 `[skill]` 标签，正文跟在最后——效果与手动分三条
发送完全一致，但只需一行。

## 安装

```bash
pi install git:https://github.com/L2ncE/pi-multi-skill
```

或免安装试用：

```bash
pi -e /path/to/pi-multi-skill/extensions/multi-skill.ts
```

## 用法

```
/skills <skill名> [<skill名>...] [正文]
```

- 开头连续若干个 token 只要命中已安装的 skill 名就依次调用；第一个未命中的
  token 起视为正文
- skill 名支持 Tab 补全（`/skills hu<Tab>`）
- 覆盖会话已注册的全部 skill 来源：用户目录、项目目录、包安装

## 实现原理

1. 通过 `api.getCommands()` 解析 `skill:*` 命令拿到各 SKILL.md 路径
2. 按核心 `/skill:` 展开的同一格式拼 `<skill>` 块，复用标准渲染的折叠标签
3. 第一个块正常发送（触发 agent 回合），其余块与正文以 followUp 队列按序注入

只使用公开扩展 API：不包装编辑器、不碰私有缝隙；上下文开销仅为所请求的
skill 正文本身。

## 许可

Apache-2.0
