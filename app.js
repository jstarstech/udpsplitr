import { startServer } from "./src/udp_server_proxy.js";
import { startClient } from "./src/udp_client_proxy.js";

const args = process.argv.slice(2);

if (!args[0] || !["server", "client"].includes(args[0])) {
  console.info(
    "Usage: node app.js <server|client> [--echo-mode (server only)] [--ping-mode (client only)]"
  );
  process.exit(1);
}

const mode = args[0];
const echoMode = args.includes("--echo-mode");
const pingMode = args.includes("--ping-mode");

if (mode === "server") {
  startServer(echoMode);
} else if (mode === "client") {
  startClient(pingMode);
}
