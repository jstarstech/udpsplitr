import dgram from "dgram";
import readline from "node:readline";
import config from "./config.js";

function createClientProxy(pingMode = false, deps = {}) {
  const activeConfig = deps.config ?? config;
  const dgramImpl = deps.dgram ?? dgram;
  const readlineImpl = deps.readline ?? readline;
  const logger = deps.logger ?? console;
  const setIntervalImpl = deps.setInterval ?? setInterval;
  const setTimeoutImpl = deps.setTimeout ?? setTimeout;
  const clearTimeoutImpl = deps.clearTimeout ?? clearTimeout;
  const now = deps.now ?? Date.now;
  const exit = deps.exit ?? ((code) => process.exit(code));
  const log = logger.log ?? logger.info ?? (() => {});
  const error = logger.error ?? (() => {});

  const {
    CLIENT_IP,
    CLIENT_PROXY_PORT,
    CLIENT_RESPONSE_PORT,
    SERVER_IP,
    SERVER_PORT,
    MTU_SIZE,
  } = activeConfig;

  // Create UDP sockets
  const clientProxySocket = dgramImpl.createSocket("udp4");
  const clientResponseSocket = dgramImpl.createSocket("udp4");
  const serverSocket = dgramImpl.createSocket("udp4");
  const PROBE_ID_BYTES = 8;
  const PING_DATA_BYTES = 56;
  const PING_INTERVAL_MS = 1000;
  const PROBE_TIMEOUT_MS = 4000;

  let activeClientRinfo = null;
  let nextProbeId = 0n;
  const pendingProbes = new Map();

  let incomingTraffic = 0;
  let outgoingTraffic = 0;

  function displayTraffic() {
    log(
      `Traffic - In: ${incomingTraffic} bytes, Out: ${outgoingTraffic} bytes`
    );
  }

  setIntervalImpl(displayTraffic, 10000); // Display traffic every 10 seconds

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.on("line", displayTraffic);

  // Bind the client proxy socket to the specified IP and port
  clientProxySocket.bind(CLIENT_PROXY_PORT, CLIENT_IP, () => {
    log(
      `Listening for client connections on ${CLIENT_IP}:${CLIENT_PROXY_PORT}`
    );
  });

  clientProxySocket.on("error", (err) => {
    error(`Client proxy socket error: ${err.message}`);
    exit(1);
  });

  // Bind the client response socket to the specified IP and port
  clientResponseSocket.bind(CLIENT_RESPONSE_PORT, CLIENT_IP, () => {
    log(
      `Listening for server responses on ${CLIENT_IP}:${CLIENT_RESPONSE_PORT}`
    );
  });

  clientResponseSocket.on("error", (err) => {
    error(`Client response socket error: ${err.message}`);
    exit(1);
  });

  clientProxySocket.on("message", (msg, rinfo) => {
    if (!activeClientRinfo) {
      activeClientRinfo = { address: rinfo.address, port: rinfo.port };
      log(
        `Bound upstream responses to client ${activeClientRinfo.address}:${activeClientRinfo.port}`
      );
    } else if (
      rinfo.address !== activeClientRinfo.address ||
      rinfo.port !== activeClientRinfo.port
    ) {
      error(
        `Rejecting packet from ${rinfo.address}:${rinfo.port}; this proxy only supports one active client at a time (${activeClientRinfo.address}:${activeClientRinfo.port})`
      );
      return;
    }

    // Ensure the data size does not exceed the MTU size
    if (msg.length > MTU_SIZE) {
      error(`Data size exceeds MTU size of ${MTU_SIZE} bytes`);
      return;
    }

    outgoingTraffic += msg.length;

    // Forward the data to the server
    serverSocket.send(msg, SERVER_PORT, SERVER_IP, (err) => {
      if (err) {
        error(`Error forwarding data to server: ${err.message}`);
        return;
      }
    });
  });

  clientResponseSocket.on("message", (msg) => {
    // Ensure the data size does not exceed the MTU size
    if (msg.length > MTU_SIZE) {
      error(`Data size exceeds MTU size of ${MTU_SIZE} bytes`);
      return;
    }

    incomingTraffic += msg.length;

    if (pingMode) {
      if (msg.length < PROBE_ID_BYTES) {
        error("Dropping ping response without a probe id");
        return;
      }

      const probeId = msg.readBigUInt64BE(0);
      const pendingProbe = pendingProbes.get(probeId);

      if (pendingProbe === undefined) {
        error(`Dropping ping response for unknown probe ${probeId}`);
        return;
      }

      clearTimeout(pendingProbe.timeoutId);
      pendingProbes.delete(probeId);

      const latency = now() - pendingProbe.sentTime;
      log(
        `${msg.length} bytes from ${SERVER_IP}:${SERVER_PORT}: icmp_seq=${probeId.toString()} time=${latency} ms`
      );
      return;
    }

    if (!activeClientRinfo) {
      error("Dropping response because no client is currently bound");
      return;
    }

    // Forward the response back to the client
    clientProxySocket.send(
      msg,
      activeClientRinfo.port,
      activeClientRinfo.address,
      (err) => {
        if (err) {
          error(`Error forwarding response to client: ${err.message}`);
          return;
        }
      }
    );
  });

  if (pingMode) {
    const pingTarget = `${SERVER_IP}:${SERVER_PORT}`;
    log(`PING ${pingTarget} (${SERVER_IP}) ${PING_DATA_BYTES} data bytes`);

    setIntervalImpl(() => {
      const probeId = nextProbeId++;
      const payload = Buffer.alloc(PING_DATA_BYTES);
      const sentMessage = Buffer.allocUnsafe(PROBE_ID_BYTES + payload.length);
      sentMessage.writeBigUInt64BE(probeId, 0);
      payload.copy(sentMessage, PROBE_ID_BYTES);
      const sentTime = now();
      const timeoutId = setTimeoutImpl(() => {
        if (pendingProbes.delete(probeId)) {
          error(`Request timeout for icmp_seq ${probeId.toString()}`);
        }
      }, PROBE_TIMEOUT_MS);

      pendingProbes.set(probeId, { sentTime, timeoutId });

      outgoingTraffic += sentMessage.length;

      serverSocket.send(sentMessage, SERVER_PORT, SERVER_IP, (err) => {
        if (err) {
          clearTimeoutImpl(timeoutId);
          pendingProbes.delete(probeId);
          error(`Error sending ping message: ${err.message}`);
        }
      });
    }, PING_INTERVAL_MS);
  }

  return {
    clientProxySocket,
    clientResponseSocket,
    serverSocket,
    getActiveClientRinfo: () => activeClientRinfo,
    pendingProbes,
  };
}

function startClient(pingMode = false, deps = {}) {
  return createClientProxy(pingMode, deps);
}

export { createClientProxy, startClient };
