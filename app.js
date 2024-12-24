import { startServer } from "./src/udp_server_proxy.js";
import { startClient } from "./src/udp_client_proxy.js";

const args = process.argv.slice(2);

if (!args[0] || !["server", "client"].includes(args[0])) {
  console.error('Please specify "server" or "client" mode.');
  process.exit(1);
}

const mode = args[0];

if (mode === "server") {
  startServer();
} else if (mode === "client") {
  startClient();
}
