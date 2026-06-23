#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const LOG_BUFFER_BYTES = 100 * 1024 * 1024;
const WAIT_INTERVAL_MS = 10_000;
const WAIT_POLLS = 30;

function printUsage(exitCode = 0) {
  const output = `CI monitor helper

Usage:
  node scripts/ci_monitor.cjs --help
  node scripts/ci_monitor.cjs help
  node scripts/ci_monitor.cjs runs [--branch <name>] [--limit <n>]
  node scripts/ci_monitor.cjs watch <run-id>
  node scripts/ci_monitor.cjs fail-fast <run-id>
  node scripts/ci_monitor.cjs log-failed <run-id>
  node scripts/ci_monitor.cjs test-summary <run-id>
  node scripts/ci_monitor.cjs check-actions [file]
  node scripts/ci_monitor.cjs grep <run-id> --pattern <text>
  node scripts/ci_monitor.cjs wait-for <run-id> <job> --keyword <text>

Commands:
  runs          List recent workflow runs using gh run list.
  watch         Watch a workflow run and exit with its final status.
  fail-fast     Exit nonzero when a run failed, was cancelled, or timed out.
  log-failed    Print failed logs for a workflow run.
  test-summary  Print job names, statuses, and conclusions.
  check-actions Print action refs found in workflow YAML uses: lines.
  grep          Print log lines that contain literal text.
  wait-for      Poll a job log until a keyword appears or timeout expires.`;

  const writer = exitCode === 0 ? console.log : console.error;
  writer(output);
  process.exit(exitCode);
}

function failWithUsage(message) {
  console.error(`Error: ${message}`);
  console.error("");
  printUsage(1);
}

function runGh(args, options = {}) {
  const result = spawnSync("gh", args, {
    encoding: "utf8",
    maxBuffer: LOG_BUFFER_BYTES,
    stdio: options.stdio || "pipe",
  });

  if (result.error) {
    if (result.error.code === "ENOENT") {
      console.error("Error: GitHub CLI (gh) was not found on PATH.");
      console.error("Install gh and authenticate it before using this helper.");
    } else {
      console.error(`Error: Failed to run gh: ${result.error.message}`);
    }
    process.exit(1);
  }

  return result;
}

function exitOnGhFailure(result, description) {
  if (result.status === 0) {
    return;
  }

  console.error(`Error: gh command failed while trying to ${description}.`);
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  process.exit(result.status || 1);
}

function parseGhJson(result, description) {
  exitOnGhFailure(result, description);

  try {
    return JSON.parse(result.stdout || "null");
  } catch (error) {
    console.error(`Error: Could not parse JSON from gh while trying to ${description}.`);
    console.error(error.message);
    process.exit(1);
  }
}

function requireNoExtraArgs(args, commandName) {
  if (args.length > 0) {
    failWithUsage(`${commandName} does not accept extra arguments: ${args.join(" ")}`);
  }
}

function requireRunId(args, commandName) {
  if (args.length !== 1 || args[0].startsWith("-")) {
    failWithUsage(`${commandName} requires exactly one <run-id> argument.`);
  }
  return args[0];
}

function formatSha(value) {
  return value ? String(value).slice(0, 7) : "-";
}

function formatValue(value) {
  return value === undefined || value === null || value === "" ? "-" : String(value);
}

function pad(value, width) {
  const text = formatValue(value);
  return text.length >= width ? text : `${text}${" ".repeat(width - text.length)}`;
}

function parseRunsOptions(args) {
  const options = {
    branch: undefined,
    limit: 20,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--branch") {
      const branch = args[index + 1];
      if (!branch || branch.startsWith("-")) {
        failWithUsage("runs --branch requires a branch name.");
      }
      options.branch = branch;
      index += 1;
      continue;
    }

    if (arg === "--limit") {
      const limit = args[index + 1];
      if (!limit || limit.startsWith("-")) {
        failWithUsage("runs --limit requires a positive integer.");
      }
      const parsed = Number.parseInt(limit, 10);
      if (!Number.isInteger(parsed) || parsed < 1) {
        failWithUsage("runs --limit requires a positive integer.");
      }
      options.limit = parsed;
      index += 1;
      continue;
    }

    failWithUsage(`Unknown runs argument: ${arg}`);
  }

  return options;
}

function handleRuns(args) {
  const options = parseRunsOptions(args);
  const jsonFields = "databaseId,workflowName,name,status,conclusion,headBranch,headSha,url";
  const ghArgs = ["run", "list", "--json", jsonFields, "--limit", String(options.limit)];

  if (options.branch) {
    ghArgs.push("--branch", options.branch);
  }

  const runs = parseGhJson(runGh(ghArgs), "list workflow runs");

  if (!Array.isArray(runs) || runs.length === 0) {
    console.log("No workflow runs found.");
    return;
  }

  console.log(`Recent workflow runs (${runs.length}):`);
  console.log(
    `${pad("Run ID", 12)} ${pad("Workflow", 30)} ${pad("Status", 12)} ${pad("Conclusion", 12)} ${pad(
      "Branch",
      22,
    )} ${pad("SHA", 8)} URL`,
  );

  for (const run of runs) {
    const workflow = run.workflowName || run.name || "-";
    console.log(
      `${pad(run.databaseId, 12)} ${pad(workflow, 30)} ${pad(run.status, 12)} ${pad(
        run.conclusion || "-",
        12,
      )} ${pad(run.headBranch, 22)} ${pad(formatSha(run.headSha), 8)} ${formatValue(run.url)}`,
    );
  }
}

function handleWatch(args) {
  const runId = requireRunId(args, "watch");
  const result = runGh(["run", "watch", runId, "--exit-status", "--interval", "10"], { stdio: "inherit" });
  process.exit(result.status || 0);
}

function handleFailFast(args) {
  const runId = requireRunId(args, "fail-fast");
  const jsonFields = "databaseId,workflowName,name,status,conclusion,headBranch,headSha,url";
  const run = parseGhJson(runGh(["run", "view", runId, "--json", jsonFields]), "inspect workflow run");
  const status = formatValue(run.status).toLowerCase();
  const conclusion = formatValue(run.conclusion).toLowerCase();
  const workflow = run.workflowName || run.name || "-";

  console.log(
    `Run ${formatValue(run.databaseId || runId)}: workflow=${formatValue(workflow)} status=${status} conclusion=${conclusion} branch=${formatValue(
      run.headBranch,
    )} sha=${formatSha(run.headSha)} url=${formatValue(run.url)}`,
  );

  if (["failure", "cancelled", "timed_out"].includes(conclusion)) {
    process.exit(1);
  }

  if (status !== "completed") {
    console.log("Run is still running.");
  }
}

function handleLogFailed(args) {
  const runId = requireRunId(args, "log-failed");
  const result = runGh(["run", "view", runId, "--log-failed"], { stdio: "inherit" });
  process.exit(result.status || 0);
}

function handleTestSummary(args) {
  const runId = requireRunId(args, "test-summary");
  const data = parseGhJson(runGh(["run", "view", runId, "--json", "jobs"]), "read workflow jobs");
  const jobs = Array.isArray(data.jobs) ? data.jobs : [];

  if (jobs.length === 0) {
    console.log("No jobs found for this run.");
    return;
  }

  console.log(`Jobs for run ${runId}:`);
  for (const job of jobs) {
    console.log(
      `- ${formatValue(job.name)}: status=${formatValue(job.status)} conclusion=${formatValue(job.conclusion)}`,
    );
  }
}

function listWorkflowFiles(fileArg) {
  if (fileArg) {
    const filePath = path.resolve(process.cwd(), fileArg);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      console.error(`Error: Workflow file not found: ${filePath}`);
      process.exit(1);
    }
    return [filePath];
  }

  const workflowsDir = path.join(process.cwd(), ".github", "workflows");
  if (!fs.existsSync(workflowsDir) || !fs.statSync(workflowsDir).isDirectory()) {
    return [];
  }

  return fs
    .readdirSync(workflowsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(ya?ml)$/i.test(entry.name))
    .map((entry) => path.join(workflowsDir, entry.name))
    .sort();
}

function handleCheckActions(args) {
  if (args.length > 1) {
    failWithUsage("check-actions accepts at most one workflow file path.");
  }

  const files = listWorkflowFiles(args[0]);
  let found = 0;

  for (const filePath of files) {
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      const match = line.match(/^\s*uses:\s*["']?([^"'\s#]+)["']?/);
      if (match) {
        found += 1;
        console.log(`${path.relative(process.cwd(), filePath)}:${index + 1} uses: ${match[1]}`);
      }
    }
  }

  if (found === 0) {
    console.log("No uses: action references found.");
  }
}

function parsePatternArgs(args) {
  if (args.length !== 3 || args[1] !== "--pattern" || args[0].startsWith("-") || !args[2]) {
    failWithUsage("grep requires <run-id> --pattern <text>.");
  }

  return {
    patternText: args[2],
    runId: args[0],
  };
}

function handleGrep(args) {
  const { patternText, runId } = parsePatternArgs(args);
  const result = runGh(["run", "view", runId, "--log"]);
  exitOnGhFailure(result, "fetch workflow logs");

  let matches = 0;
  const lines = (result.stdout || "").split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (line.includes(patternText)) {
      matches += 1;
      console.log(`${index + 1}: ${line}`);
    }
  }

  if (matches === 0) {
    console.log(`No log lines contained text ${JSON.stringify(patternText)}.`);
  }
}

function parseWaitForArgs(args) {
  if (args.length !== 4 || args[0].startsWith("-") || args[1].startsWith("-") || args[2] !== "--keyword" || !args[3]) {
    failWithUsage("wait-for requires <run-id> <job> --keyword <text>.");
  }

  return {
    job: args[1],
    keyword: args[3],
    runId: args[0],
  };
}

function resolveJobId(runId, jobNameOrId) {
  if (/^\d+$/.test(jobNameOrId)) {
    return jobNameOrId;
  }

  const data = parseGhJson(runGh(["run", "view", runId, "--json", "jobs"]), "read workflow jobs");
  const jobs = Array.isArray(data.jobs) ? data.jobs : [];
  const exactMatch = jobs.find((job) => job.name === jobNameOrId);
  const caseInsensitiveMatch =
    exactMatch || jobs.find((job) => String(job.name || "").toLowerCase() === jobNameOrId.toLowerCase());
  const match = exactMatch || caseInsensitiveMatch;

  if (!match) {
    console.error(`Error: Job not found for run ${runId}: ${jobNameOrId}`);
    if (jobs.length > 0) {
      console.error("Available jobs:");
      for (const job of jobs) {
        console.error(`- ${formatValue(job.name)} (${formatValue(job.databaseId || job.id)})`);
      }
    }
    process.exit(1);
  }

  const jobId = match.databaseId || match.id;
  if (!jobId) {
    console.error(`Error: Job ${jobNameOrId} did not include a usable job id from gh.`);
    process.exit(1);
  }

  return String(jobId);
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function handleWaitFor(args) {
  const options = parseWaitForArgs(args);
  const jobId = resolveJobId(options.runId, options.job);

  for (let attempt = 1; attempt <= WAIT_POLLS; attempt += 1) {
    const result = runGh(["run", "view", options.runId, "--job", jobId, "--log"]);

    if (result.status === 0) {
      const lines = (result.stdout || "").split(/\r?\n/);
      const matchIndex = lines.findIndex((line) => line.includes(options.keyword));

      if (matchIndex !== -1) {
        console.log(`Keyword found for job ${options.job} on poll ${attempt}/${WAIT_POLLS}: ${options.keyword}`);
        console.log(`${matchIndex + 1}: ${lines[matchIndex]}`);
        return;
      }

      console.log(`Poll ${attempt}/${WAIT_POLLS}: keyword not found for job ${options.job}.`);
    } else {
      const message = (result.stderr || result.stdout || "logs not available").trim();
      console.log(`Poll ${attempt}/${WAIT_POLLS}: ${message}`);
    }

    if (attempt < WAIT_POLLS) {
      sleep(WAIT_INTERVAL_MS);
    }
  }

  console.error(`Timed out after ${WAIT_POLLS} polls waiting for keyword in job ${options.job}: ${options.keyword}`);
  process.exit(1);
}

function main() {
  const [command, ...args] = process.argv.slice(2);

  if (command === "--help" || command === "help") {
    requireNoExtraArgs(args, command);
    printUsage(0);
  }

  if (!command) {
    failWithUsage("A command is required.");
  }

  switch (command) {
    case "runs":
      handleRuns(args);
      break;
    case "watch":
      handleWatch(args);
      break;
    case "fail-fast":
      handleFailFast(args);
      break;
    case "log-failed":
      handleLogFailed(args);
      break;
    case "test-summary":
      handleTestSummary(args);
      break;
    case "check-actions":
      handleCheckActions(args);
      break;
    case "grep":
      handleGrep(args);
      break;
    case "wait-for":
      handleWaitFor(args);
      break;
    default:
      failWithUsage(`Unknown command: ${command}`);
  }
}

main();
