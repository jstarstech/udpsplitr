#!/usr/bin/env node

import { startServer } from "./src/udp_server_proxy.js";
import { startClient } from "./src/udp_client_proxy.js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const VALID_MODES = ["server", "client"];
const USAGE =
  "Usage: udpsplitr <server|client> [--init-env] [--echo-mode (server only)] [--ping-mode (client only)]";

export function parseArgs(args, env = process.env) {
  const cliMode = args[0];
  const hasPositionalMode = cliMode !== undefined && !cliMode.startsWith("--");
  const envMode = env.MODE;
  const mode = VALID_MODES.includes(cliMode)
    ? cliMode
    : !hasPositionalMode && VALID_MODES.includes(envMode)
      ? envMode
      : null;

  return {
    initEnv: args.includes("--init-env"),
    mode,
    echoMode: args.includes("--echo-mode"),
    pingMode: args.includes("--ping-mode"),
    valid: Boolean(mode),
  };
}

export function main(args = process.argv.slice(2), deps = {}) {
  const { initEnv, mode, echoMode, pingMode, valid } = parseArgs(args, deps.env);
  const logger = deps.logger ?? console;
  const runServer = deps.startServer ?? startServer;
  const runClient = deps.startClient ?? startClient;
  const createEnv = deps.createEnvFile ?? createEnvFile;

  if (!valid) {
    logger.info(USAGE);
    return 1;
  }

  if (initEnv) {
    return createEnv({
      cwd: deps.cwd,
      force: args.includes("--force"),
      mode,
      logger,
    })
      ? 0
      : 1;
  }

  if (mode === "server") {
    runServer(echoMode);
  } else if (mode === "client") {
    runClient(pingMode);
  }

  return 0;
}

export function createEnvFile({
  cwd = process.cwd(),
  force = false,
  mode = null,
  logger = console,
} = {}) {
  const source = new URL("./env.example", import.meta.url);
  const destination = `${cwd}/.env`;

  if (mode !== null && !VALID_MODES.includes(mode)) {
    logger.error("Invalid init-env mode. Use `server` or `client`.");
    return false;
  }

  if (existsSync(destination) && !force) {
    logger.error(
      ".env already exists. Use `udpsplitr <server|client> --init-env --force` to overwrite it."
    );
    return false;
  }

  const envContent = readFileSync(source, "utf8").replace(
    /^MODE=.*/m,
    `MODE=${mode ?? "server"}`
  );

  writeFileSync(destination, envContent);
  logger.info(`Created ${destination}`);
  return true;
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectExecution) {
  process.exit(main());
}
