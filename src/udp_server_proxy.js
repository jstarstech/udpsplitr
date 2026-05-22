import dgram from "dgram";
import readline from "node:readline";
import config from "./config.js";

function createServerProxy(echoMode = false, deps = {}) {
  const activeConfig = deps.config ?? config;
  const dgramImpl = deps.dgram ?? dgram;
  const readlineImpl = deps.readline ?? readline;
  const logger = deps.logger ?? console;
  const setIntervalImpl = deps.setInterval ?? setInterval;
  const exit = deps.exit ?? ((code) => process.exit(code));
  const log = logger.log ?? logger.info ?? (() => {});
  const error = logger.error ?? (() => {});

  const {
    SERVER_IP,
    SERVER_PORT,
    TARGET_IP,
    TARGET_PORT,
    CLIENT_RESPONSE_IP,
    CLIENT_RESPONSE_PORT,
    MTU_SIZE,
  } = activeConfig;

  // Create UDP socket for the server
  const serverSocket = dgramImpl.createSocket("udp4");

  // Create UDP socket for forwarding data to the target server
  const targetSocket = dgramImpl.createSocket("udp4");

  // Create UDP socket for sending responses to clients
  const clientResponseSocket = dgramImpl.createSocket("udp4");

  let incomingTraffic = 0;
  let outgoingTraffic = 0;

  function displayTraffic() {
    log(
      `Traffic - In: ${incomingTraffic} bytes, Out: ${outgoingTraffic} bytes`
    );
  }

  setIntervalImpl(displayTraffic, 10000); // Display traffic every 10 seconds

  const rl = readlineImpl.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.on("line", displayTraffic);

  // Bind the server socket to the specified IP and port
  serverSocket.bind(SERVER_PORT, SERVER_IP, () => {
    log(
      `Listening for client connections on ${SERVER_IP}:${SERVER_PORT}`
    );

    if (echoMode) {
      log("Echo mode activated");
    }
  });

  serverSocket.on("error", (err) => {
    error(`Server socket error: ${err.message}`);
    exit(1);
  });

  function handleMessage(msg) {
    incomingTraffic += msg.length;

    // Ensure the data size does not exceed the MTU size
    if (msg.length > MTU_SIZE) {
      error(`Data size exceeds MTU size of ${MTU_SIZE} bytes`);
      return;
    }

    // Forward the data to the target server
    targetSocket.send(msg, TARGET_PORT, TARGET_IP, (err) => {
      if (err) {
        error(`Error forwarding data to target server: ${err.message}`);
        return;
      }
    });
  }

  function handleMessageEcho(msg) {
    incomingTraffic += msg.length;

    // Ensure the data size does not exceed the MTU size
    if (msg.length > MTU_SIZE) {
      error(`Data size exceeds MTU size of ${MTU_SIZE} bytes`);
      return;
    }

    outgoingTraffic += msg.length;

    // Echo the message back to the client
    clientResponseSocket.send(
      msg,
      CLIENT_RESPONSE_PORT,
      CLIENT_RESPONSE_IP,
      (err) => {
        if (err) {
          error(`Error echoing message: ${err.message}`);
        }
      }
    );
  }

  serverSocket.on("message", echoMode ? handleMessageEcho : handleMessage);

  if (!echoMode) {
    // Receive the response from the target server
    targetSocket.on("message", (response) => {
      // Ensure the data size does not exceed the MTU size
      if (response.length > MTU_SIZE) {
        error(`Data size exceeds MTU size of ${MTU_SIZE} bytes`);
        return;
      }

      outgoingTraffic += response.length;

      // Forward the response back to the client
      clientResponseSocket.send(
        response,
        CLIENT_RESPONSE_PORT,
        CLIENT_RESPONSE_IP,
        (err) => {
          if (err) {
            error(`Error forwarding response to client: ${err.message}`);
            return;
          }
        }
      );
    });
  }

  return {
    serverSocket,
    targetSocket,
    clientResponseSocket,
  };
}

function startServer(echoMode = false, deps = {}) {
  return createServerProxy(echoMode, deps);
}

export { createServerProxy, startServer };
