<div align="center">

<img src="assets/logo.png" alt="pi-multi-skill" width="280"/>

**一条消息堆叠多个 `/skill:` —— 单回合，每个 skill 一个折叠块。**

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![CI](https://github.com/L2ncE/pi-multi-skill/actions/workflows/ci.yml/badge.svg)](https://github.com/L2ncE/pi-multi-skill/actions/workflows/ci.yml)

[English README](README.md)

</div>

## 这是什么

pi 一条消息只能调用一个 skill，且必须位于首行行首；`/skill:name` 后面一换行，
核心解析还会把整条消息悄悄降级成纯文本。

本扩展让最自然的多行写法直接生效——**不用记任何新语法**：

```
/skill:grill-me
/skill:human-writing

Explain this repo to me.
```

一次提交：每个 `/skill:` 引用各渲染一个可折叠 `[skill]` 标签，剩余文字作为正文消息跟在最后；且全部内容在**单回合**内到达模型，没有逐个「已加载」的中间废话。

引用可以在消息任何位置——单独成行（开头、中间、末尾都行），也可以跟在正文行尾：

```
给这个项目加个 AGENTS.md 吧 /skill:writing-for-agents

背景是多仓工作目录，需要建索引
```

![pi-multi-skill 实际效果](assets/screenshot.png)

## 行为表

| 输入 | 结果 |
|---|---|
| 开头连续 `/skill:a` / `/skill:b` 行 + 正文（多行） | 每行一个 `[skill]` 标签 + 正文框 —— 本扩展接管 |
| 单个 `/skill:a` + 换行 + 正文 | skill 标签 + 正文 —— 顺带修复核心换行缺口 |
| 正文行尾 `/skill:a`（`……吧 /skill:a`） | 标签 + 去掉引用后的正文 —— 本扩展接管 |
| 中间/末尾的独立 `/skill:a` 行 | 标签 + 剩余正文 —— 本扩展接管 |
| `/skill:a 参数`（同一行） | 核心行为，分毫不动 |
| 单独一行 `/skill:a` | 核心行为，分毫不动 |
| 引用在行中间（后面还有文字） | 视为普通文本，不拦截 |
| 出现未知的 skill 名 | 该引用原样留在正文（不拦截、无半投递） |
| 带图片的消息 | 原样放行给核心 |

## 安装

```bash
pi install npm:@lanlance/pi-multi-skill
```

或通过 git：

```bash
pi install git:https://github.com/L2ncE/pi-multi-skill
```

或免安装试用：

```bash
pi -e /path/to/pi-multi-skill/extensions/multi-skill.ts
```

## 实现原理

1. `input` 事件处理器逐行提取行尾的 skill 引用（独立行，或正文后的尾随 token），以
   `{ action: "handled" }` 接管本次提交
2. 通过 `api.getCommands()` 解析 `skill:*` 命令定位各 SKILL.md ——
   覆盖用户目录、项目目录、包安装全部来源
3. 按核心 `/skill:` 展开的同一格式拼 `<skill>` 块，复用标准渲染的折叠标签
4. 全部块与正文拼成一条 custom message 一次性发送（`triggerTurn` 触发单回合），
   自定义渲染器逐块复用核心解析与折叠标签组件

只使用公开扩展 API（`on`、`sendMessage`、`getCommands`、`registerMessageRenderer`
及官方导出的 `parseSkillBlock` / `stripFrontmatter` 等渲染组件）。不包装编辑器、不碰私有
缝隙，与其他编辑器类扩展零冲突。

## 许可

Apache-2.0
