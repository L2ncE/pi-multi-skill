import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

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

function resolveSkills(api: ExtensionAPI): LoadedSkill[] {
    return api
        .getCommands()
        .filter((command) => command.source === "skill" && command.name.startsWith(SKILL_COMMAND_PREFIX))
        .map((command) => ({
            name: command.name.slice(SKILL_COMMAND_PREFIX.length),
            filePath: command.sourceInfo.path,
            baseDir: command.sourceInfo.baseDir ?? dirname(command.sourceInfo.path),
        }));
}

function stripFrontmatter(content: string): string {
    return content.replace(/^---\n[\s\S]*?\n---\n?/, "");
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
                const skill = available.get(tokens[messageStart] as string);
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

            const message = tokens.slice(messageStart).join(" ");

            // The first message triggers the agent turn; the remaining skill blocks
            // and the trailing message queue as follow-ups, so the model receives
            // everything in order across the run.
            api.sendUserMessage(buildSkillBlock(selected[0] as LoadedSkill));
            for (const skill of selected.slice(1)) {
                api.sendUserMessage(buildSkillBlock(skill), { deliverAs: "followUp" });
            }
            if (message) {
                api.sendUserMessage(message, { deliverAs: "followUp" });
            }
        },
    });
}
