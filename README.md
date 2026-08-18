<div align="center">

**`/skills` for [pi](https://pi.dev) — load them all in one line.**

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![CI](https://github.com/L2ncE/pi-multi-skill/actions/workflows/ci.yml/badge.svg)](https://github.com/L2ncE/pi-multi-skill/actions/workflows/ci.yml)

[中文说明](README_zh.md)

</div>

## What Is This

pi invokes skills one per message, and only at the very start of the first
line. Chaining two skills plus a prompt means sending three separate messages —
and if you let Shift+Enter sneak a newline after `/skill:name`, the core
parser silently treats the whole thing as plain text.

`/skills` fixes the workflow with one command:

```
/skills human-writing lanlance-article write about https://blog.cloudflare.com/code-mode/
```

Each named skill's `SKILL.md` is delivered as its own user message containing
a standard `<skill>` block, so the chat renders one collapsible
`[skill]` chip per skill, followed by your trailing message — exactly like
sending the messages by hand, minus the ceremony.

## Install

```bash
pi install git:https://github.com/L2ncE/pi-multi-skill
```

or try without installing:

```bash
pi -e /path/to/pi-multi-skill/extensions/multi-skill.ts
```

## Usage

```
/skills <skill> [<skill>...] [message]
```

- Leading tokens that name an installed skill are invoked, in order; the
  first unknown token starts the free-text message.
- Skill names complete with Tab (`/skills hu<Tab>`).
- Skills resolve from the session's registered skills — user, project, and
  package sources are all covered.

## How It Works

1. Resolves names against `api.getCommands()` (`skill:*` entries carry each
   SKILL.md path).
2. Builds the same `<skill name="..." location="...">` block the core
   `/skill:` expansion produces, so the standard renderer draws the
   collapsible chip.
3. Sends the first block normally (triggers the agent turn) and queues the
   remaining blocks plus the trailing message as follow-ups, preserving order.

Pure public extension API — no editor wrapping, no private seams, no context
overhead beyond the skill bodies you asked for.

## License

Apache-2.0
