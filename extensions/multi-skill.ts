import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import {
    getMarkdownTheme,
    parseSkillBlock,
    SkillInvocationMessageComponent,
    stripFrontmatter,
    UserMessageComponent,
    type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Container, Spacer } from "@earendil-works/pi-tui";

/**
 * pi-multi-skill — stack multiple skills in one message.
 *
 * `/skill:name` lines at the top of a submitted message (one reference per
 * line, remaining lines as the body) are detected at submit time and
 * delivered as ONE custom message carrying every `<skill>` block plus the
 * body — so a single LLM turn sees all of them, no intermediate
 * "skill loaded" rounds. The custom renderer draws one collapsible
 * `[skill]` chip per skill followed by the body message box, exactly like
 * individual core invocations. Anything else (single-line `/skill:name`,
 * same-line arguments, unknown names, images) passes through to core.
 */

const SKILL_COMMAND_PREFIX = "skill:";

/** A line that is exactly one skill reference, e.g. `/skill:human-writing`. */
const SKILL_LINE_PATTERN = /^\/skill:([a-z0-9][a-z0-9-]*)$/;

interface LoadedSkill {
    name: string;
    filePath: string;
    baseDir: string;
}

/** Details payload of the "multi-skill" custom message; blocks are raw `<skill>` texts. */
interface MultiSkillDetails {
    blocks: string[];
    body?: string;
}

/** First match wins, matching the core `/skill:name` lookup order. */
function resolveSkills(api: ExtensionAPI): Map<string, LoadedSkill> {
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
    return skills;
}

/**
 * Build the same block the core `/skill:name` expansion produces, so the
 * renderer can reuse the core parser and the collapsible-chip component.
 */
function buildSkillBlock(skill: LoadedSkill): string {
    const body = stripFrontmatter(readFileSync(skill.filePath, "utf-8")).trim();
    return `<skill name="${skill.name}" location="${skill.filePath}">\nReferences are relative to ${skill.baseDir}.\n\n${body}\n</skill>`;
}

/**
 * Detect the leading-skill-lines shape. Returns the selected skills and the
 * remaining body, or null when the message is not this shape — callers must
 * then leave core behavior untouched. This also repairs a core parser gap:
 * `_expandSkillCommand` splits the command from its arguments on the first
 * space only, so `/skill:name` + newline + text silently degrades to a
 * plain message.
 */
function planInvocation(text: string, api: ExtensionAPI): { skills: LoadedSkill[]; body: string } | null {
    const lines = text.trim().split("\n");
    if (lines.length < 2 || !SKILL_LINE_PATTERN.test(lines[0].trim())) {
        return null;
    }
    const available = resolveSkills(api);
    const skills: LoadedSkill[] = [];
    let bodyStart = 0;
    for (; bodyStart < lines.length; bodyStart++) {
        const match = SKILL_LINE_PATTERN.exec(lines[bodyStart].trim());
        if (!match || !available.has(match[1])) {
            break;
        }
        skills.push(available.get(match[1]) as LoadedSkill);
    }
    if (skills.length === 0) {
        return null;
    }
    return { skills, body: lines.slice(bodyStart).join("\n").trim() };
}

export default function multiSkillExtension(api: ExtensionAPI): void {
    api.registerMessageRenderer<MultiSkillDetails>(
        "multi-skill",
        (message, options) => {
            const details = message.details;
            if (!details || details.blocks.length === 0) {
                return undefined;
            }
            const markdownTheme = getMarkdownTheme();
            const container = new Container();
            for (const block of details.blocks) {
                const parsed = parseSkillBlock(block);
                if (!parsed) {
                    continue;
                }
                const chip = new SkillInvocationMessageComponent(parsed, markdownTheme);
                chip.setExpanded(options.expanded);
                container.addChild(chip);
            }
            if (details.body) {
                container.addChild(new Spacer(1));
                container.addChild(new UserMessageComponent(details.body, markdownTheme));
            }
            return container;
        },
    );

    api.on("input", (event) => {
        // Images are not remuxed into the enhanced delivery; degrade to core.
        if (event.images?.length) {
            return { action: "continue" };
        }
        let plan: { skills: LoadedSkill[]; body: string } | null = null;
        try {
            plan = planInvocation(event.text, api);
        } catch {
            return { action: "continue" };
        }
        if (!plan) {
            return { action: "continue" };
        }
        // Build every block before taking over the submission so a file-read
        // failure can never leave a half-delivered invocation in the chat.
        const blocks = plan.skills.map(buildSkillBlock);
        const llmText = plan.body ? [...blocks, plan.body].join("\n\n") : blocks.join("\n\n");
        // One custom message = one LLM turn with every skill block plus the
        // body; custom messages are converted to user messages for the LLM.
        // While streaming, sendMessage queues automatically.
        api.sendMessage(
            {
                customType: "multi-skill",
                content: [{ type: "text", text: llmText }],
                display: true,
                details: { blocks, body: plan.body || undefined },
            },
            { triggerTurn: true },
        );
        return { action: "handled" };
    });
}
