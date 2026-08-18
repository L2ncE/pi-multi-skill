import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { stripFrontmatter, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * pi-multi-skill — invoke multiple skills with one command.
 *
 * `/skills <name> [<name>...] [message]` loads each named skill's SKILL.md
 * and delivers it as its own user message containing a standard `<skill>`
 * block, so the chat renders one collapsible `[skill]` chip per skill,
 * followed by the trailing message. Equivalent to sending
 * `/skill:<name>` once per skill plus the message by hand — in one line.
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
                baseDir: command.sourceInfo.baseDir ?? dirname(command.sourceInfo.path),
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

    api.registerCommand("skills", {
        description: "Invoke multiple skills in one message: /skills <skill> [<skill>...] [message]",
        getArgumentCompletions: (prefix) => {
            const lastToken = prefix.split(/\s+/).pop() ?? "";
            const matches = resolveSkills(api)
                .map((skill) => skill.name)
                .filter((name) => name.startsWith(lastToken))
                .sort()
                .slice(0, 20);
            if (matches.length === 0) {
                return null;
            }
            return matches.map((name) => ({ value: name, label: name }));
        },
        handler: async (args) => {
            const tokens = args.trim().split(/\s+/).filter(Boolean);
            const available = new Map(resolveSkills(api).map((skill) => [skill.name, skill]));

            const selected: LoadedSkill[] = [];
            let messageStart = 0;
            for (; messageStart < tokens.length; messageStart++) {
                const skill = available.get(tokens[messageStart]);
                if (!skill) {
                    break;
                }
                selected.push(skill);
            }

            if (selected.length === 0) {
                throw new Error(
                    tokens.length === 0
                        ? "usage: /skills <skill> [<skill>...] [message] — leading tokens naming installed skills are invoked"
                        : `unknown skill: ${tokens[0]}`,
                );
            }

            // Build every payload before the first send so a file-read failure
            // can never leave a half-delivered invocation in the chat.
            const payloads = selected.map(buildSkillBlock);
            const message = tokens.slice(messageStart).join(" ");
            if (message) {
                payloads.push(message);
            }

            api.sendUserMessage(payloads[0]);
            for (const payload of payloads.slice(1)) {
                await waitForDeliveryWindow();
                api.sendUserMessage(payload, { deliverAs: "followUp" });
            }
        },
    });
}
