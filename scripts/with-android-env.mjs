#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { createAndroidClientEnv } from "./android-client-env.mjs";

const { args, cwd } = parseArgs(process.argv.slice(2));
if (args.length === 0) {
  console.error("Usage: node scripts/with-android-env.mjs [--cwd <dir>] -- <command> [args...]");
  process.exit(1);
}

const androidEnv = createAndroidClientEnv();
if (!androidEnv.javaHome) {
  console.error("JAVA_HOME is not set and Java could not be resolved from PATH.");
  process.exit(1);
}

const result = spawnSync(args[0], args.slice(1), {
  cwd,
  env: androidEnv.env,
  stdio: "inherit",
});

if (result.error) {
  console.error(String(result.error));
  process.exit(1);
}
process.exit(result.status ?? 1);

function parseArgs(rawArgs) {
  let cwd = process.cwd();
  const args = [];
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--") {
      args.push(...rawArgs.slice(index + 1));
      break;
    }
    if (arg === "--cwd") {
      const value = rawArgs[index + 1];
      if (!value) {
        console.error("--cwd requires a value.");
        process.exit(1);
      }
      cwd = path.resolve(value);
      index += 1;
      continue;
    }
    args.push(arg);
  }
  return { args, cwd };
}
