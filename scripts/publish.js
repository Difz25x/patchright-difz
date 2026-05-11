#!/usr/bin/env node

import { spawnSync } from "node:child_process";

if (process.env.npm_command === "publish") {
  process.exit(0);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    shell: process.platform === "win32",
    stdio: "inherit",
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("npm", ["run", "build"]);
run("npm", ["publish", "--ignore-scripts", ...process.argv.slice(2)]);
