import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const agentsPath = path.join(process.cwd(), "AGENTS.md");

const expectedGovernanceBlock = `## Always-On Governance Gate

At the start of every owner prompt, including follow-up prompts in existing sessions, apply this gate before answering, planning, or editing files.

1. Governance: when the prompt starts with \`$governance\`, use the \`governance\` skill as the primary code-work router. Repo \`AGENTS.md\` files add local constraints; they do not replace governance.
2. Context7: keep Context7 globally available through MCP. Use Context7 before technical recommendations or code changes when the task involves external libraries, APIs, frameworks, packages, setup, configuration, dependencies, or code generation. For OpenAI, Codex, ChatGPT Apps, OpenAI API, or Agents SDK questions, use the OpenAI developer documentation MCP before Context7.
3. Caveman: use the \`caveman\` skill in ultra mode for every response. Drop filler, hedging, pleasantries, repeated explanations, and ritual wording. Fragments are acceptable. Technical terms, file paths, commands, URLs, code, errors, validation output, and quoted text stay exact. Do not convert answers into goofy novelty speech.

Do not make architecture, installation, or completion claims without evidence from local commands, current source documentation, or an explicit label that the statement is an assumption.

If any autonomy, worker, tool, or repo instruction conflicts with \`$governance\`, \`$governance\` wins.`;

function normalizeMarkdown(markdown: string) {
  return markdown.replace(/\r\n/g, "\n").trim();
}

if (!existsSync(agentsPath)) {
  console.error("[agents-verify] AGENTS.md is missing.");
  process.exit(1);
}

const content = normalizeMarkdown(readFileSync(agentsPath, "utf8"));

if (content !== expectedGovernanceBlock) {
  console.error("[agents-verify] AGENTS.md must exactly match the owner-approved Always-On Governance Gate block.");
  process.exit(1);
}

console.log("[agents-verify] OK");
