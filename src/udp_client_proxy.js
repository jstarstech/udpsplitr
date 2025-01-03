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

  const clientRinfo = {
    address: "127.0.0.1",
    port: 52820,
  };

  let incomingTraffic = 0;
  let outgoingTraffic = 0;
  let sentMessage = null;
  let sentTime = null;

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
    if (
      rinfo.address !== clientRinfo.address ||
      rinfo.port !== clientRinfo.port
    ) {
      clientRinfo.address = rinfo.address;
      clientRinfo.port = rinfo.port;
    }

    // Ensure the data size does not exceed the MTU size
    if (msg.length > MTU_SIZE) {
      console.error(`Data size exceeds MTU size of ${MTU_SIZE} bytes`);
      return;
    }

    incomingTraffic += msg.length;

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

    if (pingMode && sentMessage && msg.equals(sentMessage)) {
      const latency = Date.now() - sentTime;
      console.log(`Echo message received. Latency: ${latency} ms`);
      return;
    }

    // Forward the response back to the client
    clientProxySocket.send(
      msg,
      clientRinfo.port,
      clientRinfo.address,
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
      sentMessage = Buffer.from("Echo test message");
      sentTime = Date.now();

      outgoingTraffic += sentMessage.length;

      console.log("Sending ping messages to the server");

      serverSocket.send(sentMessage, SERVER_PORT, SERVER_IP, (err) => {
        if (err) {
          console.error(`Error sending ping message: ${err.message}`);
        }
      });
    }, 2000); // Send echo message every 2 seconds
  }
}

export { startClient };
