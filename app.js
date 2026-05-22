import { startServer } from "./src/udp_server_proxy.js";
import { startClient } from "./src/udp_client_proxy.js";
import { pathToFileURL } from "node:url";

const VALID_MODES = ["server", "client"];

export function parseArgs(args, env = process.env) {
  const cliMode = args[0];
  const envMode = env.MODE;
  const mode = VALID_MODES.includes(cliMode)
    ? cliMode
    : VALID_MODES.includes(envMode)
      ? envMode
      : null;

  return {
    mode,
    echoMode: args.includes("--echo-mode"),
    pingMode: args.includes("--ping-mode"),
    valid: Boolean(mode),
  };
}

export function main(args = process.argv.slice(2), deps = {}) {
  const { mode, echoMode, pingMode, valid } = parseArgs(args, deps.env);
  const logger = deps.logger ?? console;
  const runServer = deps.startServer ?? startServer;
  const runClient = deps.startClient ?? startClient;

  if (!valid) {
    logger.info(
      "Usage: node app.js <server|client> [--echo-mode (server only)] [--ping-mode (client only)]"
    );
    return 1;
  }

  if (mode === "server") {
    runServer(echoMode);
  } else if (mode === "client") {
    runClient(pingMode);
  }

  return 0;
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectExecution) {
  process.exit(main());
}
