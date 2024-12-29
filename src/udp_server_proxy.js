import dgram from "dgram";
import readline from "node:readline";
import config from "./config.js";

function startServer() {
  // Configuration
  const {
    SERVER_IP,
    SERVER_PORT,
    TARGET_IP,
    TARGET_PORT,
    CLIENT_RESPONSE_IP,
    CLIENT_RESPONSE_PORT,
    MTU_SIZE
  } = config;

  // Create UDP socket for the server
  const serverSocket = dgram.createSocket("udp4");

  // Create UDP socket for forwarding data to the target server
  const targetSocket = dgram.createSocket("udp4");

  // Create UDP socket for sending responses to clients
  const clientResponseSocket = dgram.createSocket("udp4");

  let incomingTraffic = 0;
  let outgoingTraffic = 0;

  function displayTraffic() {
    console.log(`Traffic - In: ${incomingTraffic} bytes, Out: ${outgoingTraffic} bytes`);
  }

  setInterval(displayTraffic, 10000); // Display traffic every 10 seconds

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.on('line', displayTraffic);

  // Bind the server socket to the specified IP and port
  serverSocket.bind(SERVER_PORT, SERVER_IP, () => {
    console.log(
      `Listening for client connections on ${SERVER_IP}:${SERVER_PORT}`
    );
  });

  // Receive the response from the target server
  targetSocket.on("message", (response) => {
    // Ensure the data size does not exceed the MTU size
    if (response.length > MTU_SIZE) {
      console.error(`Data size exceeds MTU size of ${MTU_SIZE} bytes`);
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
          console.error(
            `Error forwarding response to client: ${err.message}`
          );
          return;
        }
      }
    );
  });

  serverSocket.on("message", (msg) => {
    // Ensure the data size does not exceed the MTU size
    if (msg.length > MTU_SIZE) {
      console.error(`Data size exceeds MTU size of ${MTU_SIZE} bytes`);
      return;
    }

    incomingTraffic += msg.length;

    // Forward the data to the target server
    targetSocket.send(msg, TARGET_PORT, TARGET_IP, (err) => {
      if (err) {
        console.error(
          `Error forwarding data to target server: ${err.message}`
        );
        return;
      }
    });
  });
}

export { startServer };
