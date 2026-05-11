#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

if (process.env.npm_command === "publish") {
  process.exit(0);
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const tag = `v${pkg.version}`;

function run(command, args) {
  const result = spawn(command, args, {
    stdio: "inherit",
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return result;
}

function output(command, args) {
  const result = spawn(command, args, {
    encoding: "utf8",
  });

  if (result.status !== 0) return "";

  return result.stdout.trim();
}

function hasStagedChanges() {
  const result = spawn("git", ["diff", "--cached", "--quiet"]);

  if (result.status === 0) return false;
  if (result.status === 1) return true;

  process.exit(result.status ?? 1);
}

function spawn(command, args, options = {}) {
  if (process.platform === "win32" && command === "npm") {
    return spawnSync(
      "cmd.exe",
      ["/d", "/s", "/c", commandLine([command, ...args])],
      {
        windowsHide: true,
        ...options,
      },
    );
  }

  return spawnSync(command, args, {
    windowsHide: true,
    ...options,
  });
}

function commandLine(args) {
  return args.map(quoteWindowsArg).join(" ");
}

function quoteWindowsArg(value) {
  if (/^[A-Za-z0-9_./:=@-]+$/.test(value)) return value;

  return `"${value.replace(/(["\\])/g, "\\$1")}"`;
}

function ensureTag() {
  const current = output("git", ["rev-parse", "HEAD"]);
  const tagged = output("git", ["rev-list", "-n", "1", tag]);

  if (!tagged) {
    run("git", ["tag", tag]);
    return;
  }

  if (tagged !== current) {
    console.error(`${tag} already exists on another commit.`);
    process.exit(1);
  }
}

run("npm", ["run", "build"]);
run("npm", ["pack", "--dry-run", "--ignore-scripts"]);

if (dryRun) {
  console.log(`[dry-run] would commit, tag ${tag}, and push to GitHub.`);
  console.log("[dry-run] GitHub Actions would publish the package to npm.");
  process.exit(0);
}

run("git", ["add", "-A"]);

if (hasStagedChanges()) {
  run("git", ["commit", "-m", `Release ${tag}`]);
}

ensureTag();
run("git", ["push", "origin", "HEAD"]);
run("git", ["push", "origin", tag]);

console.log(`${tag} pushed. GitHub Actions will publish to npm.`);
