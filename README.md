<div align="center">

**Multi-line `/skill:` for [pi](https://pi.dev) — stack skills, type naturally.**

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![CI](https://github.com/L2ncE/pi-multi-skill/actions/workflows/ci.yml/badge.svg)](https://github.com/L2ncE/pi-multi-skill/actions/workflows/ci.yml)

[中文说明](README_zh.md)

</div>

## What Is This

pi invokes one skill per message, and only at the very start of the first
line. A newline after `/skill:name` even makes the core parser silently
degrade the whole message to plain text.

This extension makes the natural multi-line form just work — **no new
syntax to remember**:

```
/skill:human-writing
/skill:lanlance-article

Write about https://blog.cloudflare.com/code-mode/
```

Submit once: each leading `/skill:` line becomes its own user message with
a standard `<skill>` block, so the chat renders one collapsible `[skill]`
chip per skill, followed by the remaining lines as your message. Exactly
what you'd get by sending the messages by hand — in one submission.

## Behavior

| Input | Result |
|---|---|
| leading `/skill:a` / `/skill:b` lines + body (multi-line) | one `[skill]` chip each + body message — handled by this extension |
| single `/skill:a` + body on following lines | skill chip + body — also repairs the core newline gap |
| `/skill:a args` on one line | untouched core behavior (chip + args) |
| bare `/skill:a` on one line | untouched core behavior |
| unknown skill name in leading position | passed through to core (no partial sends, no interception) |
| messages with images | passed through to core |

## Install

```bash
pi install git:https://github.com/L2ncE/pi-multi-skill
```

or try without installing:

```bash
pi -e /path/to/pi-multi-skill/extensions/multi-skill.ts
```

## How It Works

1. An `input` event handler detects the leading-skill-lines shape and
   takes over the submission (`{ action: "handled" }`).
2. Skill names resolve against `api.getCommands()` (`skill:*` entries) —
   user, project, and package sources are all covered.
3. Blocks are built with the exact format the core `/skill:` expansion
   produces, so the standard renderer draws the collapsible chips.
4. The first block triggers the agent turn; the rest queue as follow-ups
   behind an event-driven delivery window (assistant streaming started /
   run settled / 15s safety net), preserving order.

Pure public extension APIs (`on`, `sendUserMessage`, `getCommands`,
and the officially exported `stripFrontmatter`). No editor
wrapping, no private seams, no conflict with other editor extensions.

## License

Apache-2.0
