<div align="center">

**[pi](https://pi.dev) 的多行 `/skill:` —— 自然输入，堆叠加载。**

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![CI](https://github.com/L2ncE/pi-multi-skill/actions/workflows/ci.yml/badge.svg)](https://github.com/L2ncE/pi-multi-skill/actions/workflows/ci.yml)

[English README](README.md)

</div>

## 这是什么

pi 一条消息只能调用一个 skill，且必须位于首行行首；`/skill:name` 后面一换行，
核心解析还会把整条消息悄悄降级成纯文本。

本扩展让最自然的多行写法直接生效——**不用记任何新语法**：

```
/skill:human-writing
/skill:lanlance-article

写一篇关于 https://blog.cloudflare.com/code-mode/ 的文章
```

一次提交：开头每个 `/skill:` 行各生成一条含标准 `<skill>` 块的 user message，
聊天界面渲染为一个可折叠 `[skill]` 标签，剩余行作为正文消息跟在最后——
与手动逐条发送完全等价，但只需一次提交。

## 行为表

| 输入 | 结果 |
|---|---|
| 开头连续 `/skill:a` / `/skill:b` 行 + 正文（多行） | 每行一个 `[skill]` 标签 + 正文框 —— 本扩展接管 |
| 单个 `/skill:a` + 换行 + 正文 | skill 标签 + 正文 —— 顺带修复核心换行缺口 |
| `/skill:a 参数`（同一行） | 核心行为，分毫不动 |
| 单独一行 `/skill:a` | 核心行为，分毫不动 |
| 开头出现未知的 skill 名 | 原样放行给核心（不拦截、无半投递） |
| 带图片的消息 | 原样放行给核心 |

同时注册显式命令 `/skills <名> [<名>...] [正文]`（Tab 补全，免写 `skill:` 前缀）。

## 安装

```bash
pi install git:https://github.com/L2ncE/pi-multi-skill
```

或免安装试用：

```bash
pi -e /path/to/pi-multi-skill/extensions/multi-skill.ts
```

## 实现原理

1. `input` 事件处理器识别「开头整行 skill 引用」形态，以
   `{ action: "handled" }` 接管本次提交
2. 通过 `api.getCommands()` 解析 `skill:*` 命令定位各 SKILL.md ——
   覆盖用户目录、项目目录、包安装全部来源
3. 按核心 `/skill:` 展开的同一格式拼 `<skill>` 块，复用标准渲染的折叠标签
4. 首块正常发送触发回合，其余经事件驱动投递窗口（assistant 开始流式 /
   run 落定 / 15s 兜底）按 followUp 队列保序注入

只使用公开扩展 API（`on`、`registerCommand`、`sendUserMessage`、
`getCommands` 及官方导出的 `stripFrontmatter`）。不包装编辑器、不碰私有
缝隙，与其他编辑器类扩展零冲突。

## 许可

Apache-2.0
