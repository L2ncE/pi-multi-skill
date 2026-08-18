import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { stripFrontmatter, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * pi-multi-skill — invoke multiple skills with one command.
 *
 * `/skill:name` lines at the top of a message (one reference per line,
 * any remaining lines as the body) are detected at submit time and each
 * delivered as its own user message containing a standard `<skill>`
 * block, so the chat renders one collapsible `[skill]` chip per skill,
 * followed by the trailing message. Equivalent to sending
 * `/skill:<name>` once per skill plus the message by hand — in one
 * submission. No new syntax: anything else (single-line `/skill:name`,
 * same-line arguments, unknown names) passes through to core untouched.
 *
 * Skill names are resolved from the session's registered skill commands
 * (`api.getCommands()`), which covers user, project, and package skills.
 */

const SKILL_COMMAND_PREFIX = "skill:";

interface LoadedSkill {
    name: string;
    filePath: string;
    baseDir: string;
}

/** First match wins, matching the core `/skill:name` lookup order. */
function resolveSkills(api: ExtensionAPI): LoadedSkill[] {
    const skills = new Map<string, LoadedSkill>();
    for (const command of api.getCommands()) {
        if (command.source !== "skill" || !command.name.startsWith(SKILL_COMMAND_PREFIX)) {
            continue;
        }
        const name = command.name.slice(SKILL_COMMAND_PREFIX.length);
        if (!skills.has(name)) {
            skills.set(name, {
                name,
                filePath: command.sourceInfo.path,
                // Match the core /skill: expansion, which uses the skill's own
                // directory (SKILL.md parent), not the source scan root.
                baseDir: dirname(command.sourceInfo.path),
            });
        }
    }
    return [...skills.values()];
}

/**
 * Build the same block the core `/skill:name` expansion produces, so the
 * standard renderer picks it up and draws the collapsible chip.
 */
function buildSkillBlock(skill: LoadedSkill): string {
    const body = stripFrontmatter(readFileSync(skill.filePath, "utf-8")).trim();
    return `<skill name="${skill.name}" location="${skill.filePath}">\nReferences are relative to ${skill.baseDir}.\n\n${body}\n</skill>`;
}

/** A line that is exactly one skill reference, e.g. `/skill:human-writing`. */
const SKILL_LINE_PATTERN = /^\/skill:([a-z0-9][a-z0-9-]*)$/;

/**
 * Plan the transparent enhancement for a submitted message: leading lines
 * that are each a bare `/skill:name` reference become one `<skill>` block
 * payload each, the remaining lines become the trailing message. Returns
 * null when the message is not this shape — callers must then leave core
 * behavior untouched.
 *
 * This also repairs a core parser gap: `_expandSkillCommand` splits the
 * command from its arguments on the first space only, so
 * `/skill:name` + newline + text silently degrades to a plain message.
 */
function planInvocation(text: string, api: ExtensionAPI): string[] | null {
    const lines = text.trim().split("\n");
    if (lines.length < 2 || !SKILL_LINE_PATTERN.test(lines[0].trim())) {
        return null;
    }
    const available = new Map(resolveSkills(api).map((skill) => [skill.name, skill]));
    const blocks: string[] = [];
    let bodyStart = 0;
    for (; bodyStart < lines.length; bodyStart++) {
        const match = SKILL_LINE_PATTERN.exec(lines[bodyStart].trim());
        if (!match || !available.has(match[1])) {
            break;
        }
        blocks.push(buildSkillBlock(available.get(match[1]) as LoadedSkill));
    }
    if (blocks.length === 0) {
        return null;
    }
    const body = lines.slice(bodyStart).join("\n").trim();
    return body ? [...blocks, body] : blocks;
}

/**
 * Deliver payloads in order. When queued from streaming input, everything
 * queues via the given behavior; when idle, the first payload triggers the
 * run and the rest wait for a delivery window.
 */
async function deliverPayloads(
    api: ExtensionAPI,
    waitForDeliveryWindow: () => Promise<void>,
    payloads: string[],
    streamingBehavior?: "steer" | "followUp",
): Promise<void> {
    if (streamingBehavior) {
        for (const payload of payloads) {
            api.sendUserMessage(payload, { deliverAs: streamingBehavior });
        }
        return;
    }
    api.sendUserMessage(payloads[0]);
    for (const payload of payloads.slice(1)) {
        await waitForDeliveryWindow();
        api.sendUserMessage(payload, { deliverAs: "followUp" });
    }
}

export default function multiSkillExtension(api: ExtensionAPI): void {
    // sendUserMessage(deliverAs) only queues while the session is actually
    // streaming, and the run triggered by our previous message needs a moment
    // to boot — sending inside that gap is rejected (error swallowed by the
    // runtime binding). waitForIdle() also returns instantly during the gap,
    // so delivery windows are driven by events instead: an assistant message
    // starting to stream (queue the rest) or the run settling (send fresh).
    //
    // ponytail: single delivery-window slot — two overlapping /skills
    // invocations would clobber each other's waiters. Unreachable today:
    // extension commands only dispatch while the agent is idle, and the
    // first send re-activates it. If commands ever become queueable, make
    // the coordinator invocation-scoped.
    let resolveStreaming: (() => void) | undefined;
    let resolveSettled: (() => void) | undefined;
    api.on("message_start", (event) => {
        // message_start also fires for user messages; only an assistant
        // message means the LLM response is actually streaming.
        if (event.message.role === "assistant") {
            resolveStreaming?.();
        }
    });
    api.on("agent_settled", () => {
        resolveSettled?.();
    });
    const waitForDeliveryWindow = () => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const clear = () => {
            clearTimeout(timer);
            resolveStreaming = undefined;
            resolveSettled = undefined;
        };
        return Promise.race([
            new Promise<void>((resolve) => {
                resolveStreaming = () => {
                    clear();
                    resolve();
                };
            }),
            new Promise<void>((resolve) => {
                resolveSettled = () => {
                    clear();
                    resolve();
                };
            }),
            // Safety net: never wedge the command on a missed event.
            new Promise<void>((resolve) => {
                timer = setTimeout(() => {
                    clear();
                    resolve();
                }, 15000);
            }),
        ]);
    };

    api.on("input", (event) => {
        // Images are not remuxed into the enhanced delivery; degrade to core.
        if (event.images?.length) {
            return { action: "continue" };
        }
        let payloads: string[] | null = null;
        try {
            payloads = planInvocation(event.text, api);
        } catch {
            return { action: "continue" };
        }
        if (!payloads) {
            return { action: "continue" };
        }
        void deliverPayloads(api, waitForDeliveryWindow, payloads, event.streamingBehavior);
        return { action: "handled" };
    });
}
