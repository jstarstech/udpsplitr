import dgram from "dgram";
import readline from "node:readline";
import config from "./config.js";

function startClient(pingMode = false) {
  // Configuration
  const {
    CLIENT_IP,
    CLIENT_PROXY_PORT,
    CLIENT_RESPONSE_PORT,
    SERVER_IP,
    SERVER_PORT,
    MTU_SIZE,
  } = config;

  // Create UDP sockets
  const clientProxySocket = dgram.createSocket("udp4");
  const clientResponseSocket = dgram.createSocket("udp4");
  const serverSocket = dgram.createSocket("udp4");
  const PROBE_ID_BYTES = 8;
  const PROBE_TIMEOUT_MS = 30000;

  let activeClientRinfo = null;
  let nextProbeId = 0n;
  const pendingProbes = new Map();

  let incomingTraffic = 0;
  let outgoingTraffic = 0;

  function displayTraffic() {
    console.log(
      `Traffic - In: ${incomingTraffic} bytes, Out: ${outgoingTraffic} bytes`
    );
  }

  setInterval(displayTraffic, 10000); // Display traffic every 10 seconds

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.on("line", displayTraffic);

  // Bind the client proxy socket to the specified IP and port
  clientProxySocket.bind(CLIENT_PROXY_PORT, CLIENT_IP, () => {
    console.log(
      `Listening for client connections on ${CLIENT_IP}:${CLIENT_PROXY_PORT}`
    );
  });

  clientProxySocket.on("error", (err) => {
    console.error(`Client proxy socket error: ${err.message}`);
    process.exit(1);
  });

  // Bind the client response socket to the specified IP and port
  clientResponseSocket.bind(CLIENT_RESPONSE_PORT, CLIENT_IP, () => {
    console.log(
      `Listening for server responses on ${CLIENT_IP}:${CLIENT_RESPONSE_PORT}`
    );
  });

  clientResponseSocket.on("error", (err) => {
    console.error(`Client response socket error: ${err.message}`);
    process.exit(1);
  });

  clientProxySocket.on("message", (msg, rinfo) => {
    if (!activeClientRinfo) {
      activeClientRinfo = { address: rinfo.address, port: rinfo.port };
      console.log(
        `Bound upstream responses to client ${activeClientRinfo.address}:${activeClientRinfo.port}`
      );
    } else if (
      rinfo.address !== activeClientRinfo.address ||
      rinfo.port !== activeClientRinfo.port
    ) {
      console.error(
        `Rejecting packet from ${rinfo.address}:${rinfo.port}; this proxy only supports one active client at a time (${activeClientRinfo.address}:${activeClientRinfo.port})`
      );
      return;
    }

    // Ensure the data size does not exceed the MTU size
    if (msg.length > MTU_SIZE) {
      console.error(`Data size exceeds MTU size of ${MTU_SIZE} bytes`);
      return;
    }

    outgoingTraffic += msg.length;

    // Forward the data to the server
    serverSocket.send(msg, SERVER_PORT, SERVER_IP, (err) => {
      if (err) {
        console.error(`Error forwarding data to server: ${err.message}`);
        return;
      }
    });
  });

  clientResponseSocket.on("message", (msg) => {
    // Ensure the data size does not exceed the MTU size
    if (msg.length > MTU_SIZE) {
      console.error(`Data size exceeds MTU size of ${MTU_SIZE} bytes`);
      return;
    }

    incomingTraffic += msg.length;

    if (pingMode) {
      if (msg.length < PROBE_ID_BYTES) {
        console.error("Dropping ping response without a probe id");
        return;
      }

      const probeId = msg.readBigUInt64BE(0);
      const pendingProbe = pendingProbes.get(probeId);

      if (pendingProbe === undefined) {
        console.error(`Dropping ping response for unknown probe ${probeId}`);
        return;
      }

      clearTimeout(pendingProbe.timeoutId);
      pendingProbes.delete(probeId);

      const latency = Date.now() - pendingProbe.sentTime;
      console.log(
        `Echo message received for probe ${probeId}. Latency: ${latency} ms`
      );
      return;
    }

    if (!activeClientRinfo) {
      console.error("Dropping response because no client is currently bound");
      return;
    }

    // Forward the response back to the client
    clientProxySocket.send(
      msg,
      activeClientRinfo.port,
      activeClientRinfo.address,
      (err) => {
        if (err) {
          console.error(`Error forwarding response to client: ${err.message}`);
          return;
        }
      }
    );
  });

  if (pingMode) {
    console.log("Start pinging server every 2 seconds");

    setInterval(() => {
      const probeId = nextProbeId++;
      const payload = Buffer.from("Echo test message");
      const sentMessage = Buffer.allocUnsafe(PROBE_ID_BYTES + payload.length);
      sentMessage.writeBigUInt64BE(probeId, 0);
      payload.copy(sentMessage, PROBE_ID_BYTES);
      const sentTime = Date.now();
      const timeoutId = setTimeout(() => {
        if (pendingProbes.delete(probeId)) {
          console.error(`Ping probe ${probeId} timed out after ${PROBE_TIMEOUT_MS} ms`);
        }
      }, PROBE_TIMEOUT_MS);

      pendingProbes.set(probeId, { sentTime, timeoutId });

      outgoingTraffic += sentMessage.length;

      console.log(`Sending ping message ${probeId} to the server`);

      serverSocket.send(sentMessage, SERVER_PORT, SERVER_IP, (err) => {
        if (err) {
          clearTimeout(timeoutId);
          pendingProbes.delete(probeId);
          console.error(`Error sending ping message: ${err.message}`);
        }
      });
    }, 2000); // Send echo message every 2 seconds
  }
}

export { startClient };
