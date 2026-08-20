import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractSkillRefs } from "./multi-skill.ts";

const known = new Set(["grill-me", "human-writing", "writing-for-agents"]);

function plan(text: string): { names: string[]; body: string } {
    const { names, bodyLines } = extractSkillRefs(text.trim().split("\n"), (name) => known.has(name));
    return { names, body: bodyLines.join("\n").trim() };
}

describe("extractSkillRefs", () => {
    it("collects leading standalone lines and keeps the body", () => {
        const { names, body } = plan("/skill:grill-me\n/skill:human-writing\n\nExplain this repo to me.");
        assert.deepEqual(names, ["grill-me", "human-writing"]);
        assert.equal(body, "Explain this repo to me.");
    });

    it("collects a trailing token after prose", () => {
        const { names, body } = plan("给项目加个 AGENTS.md 吧 /skill:writing-for-agents\n背景是多仓工作目录");
        assert.deepEqual(names, ["writing-for-agents"]);
        assert.equal(body, "给项目加个 AGENTS.md 吧\n背景是多仓工作目录");
    });

    it("collects a standalone line at the end of the message", () => {
        const { names, body } = plan("背景是多仓工作目录\n/skill:grill-me");
        assert.deepEqual(names, ["grill-me"]);
        assert.equal(body, "背景是多仓工作目录");
    });

    it("collects a standalone line in the middle of the message", () => {
        const { names, body } = plan("第一行\n/skill:grill-me\n最后一行");
        assert.deepEqual(names, ["grill-me"]);
        assert.equal(body, "第一行\n最后一行");
    });

    it("collects several trailing tokens on one line in document order", () => {
        const { names, body } = plan("do it /skill:grill-me /skill:human-writing");
        assert.deepEqual(names, ["grill-me", "human-writing"]);
        assert.equal(body, "do it");
    });

    it("keeps prose when a known token precedes an unknown one", () => {
        const { names, body } = plan("正文 /skill:unknown /skill:grill-me");
        assert.deepEqual(names, ["grill-me"]);
        assert.equal(body, "正文 /skill:unknown");
    });

    it("leaves mid-line tokens and unknown names in the text", () => {
        const { names, body } = plan("use /skill:grill-me here\n/skill:nope\ntail /skill:unknown");
        assert.deepEqual(names, []);
        assert.equal(body, "use /skill:grill-me here\n/skill:nope\ntail /skill:unknown");
    });

    it("does not touch same-line arguments", () => {
        const { names, body } = plan("/skill:grill-me focus on the plan");
        assert.deepEqual(names, []);
        assert.equal(body, "/skill:grill-me focus on the plan");
    });

    it("does not match a reference glued to prose", () => {
        const { names } = plan("正文/skill:grill-me");
        assert.deepEqual(names, []);
    });
});
