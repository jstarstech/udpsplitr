import dgram from "dgram";
import config from "./config.js";
import { fragmentMessage, reassembleMessage } from "./fragmentation.js";

function startServer() {
  // Configuration
  const {
    SERVER_IP,
    SERVER_PORT,
    TARGET_IP,
    TARGET_PORT,
    CLIENT_RESPONSE_IP,
    CLIENT_RESPONSE_PORT,
    MTU_SIZE,
    ENABLE_FRAGMENTATION
  } = config;

  // Create UDP socket for the server
  const serverSocket = dgram.createSocket("udp4");

  // Create UDP socket for forwarding data to the target server
  const targetSocket = dgram.createSocket("udp4");

  // Create UDP socket for sending responses to clients
  const clientResponseSocket = dgram.createSocket("udp4");

  // Bind the server socket to the specified IP and port
  serverSocket.bind(SERVER_PORT, SERVER_IP, () => {
    console.log(
      `Listening for client connections on ${SERVER_IP}:${SERVER_PORT}`
    );
  });

  const fragmentStore = new Map();

  // Receive the response from the target server
  targetSocket.on("message", (response, targetRinfo) => {
    if (response.length <= MTU_SIZE && response.readUInt8(8) !== 1) {
      // Forward the response back to the client without reassembly
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
      return;
    }

    if (ENABLE_FRAGMENTATION) {
      const id = response.toString("hex", 0, 4);
      if (!fragmentStore.has(id)) {
        fragmentStore.set(id, []);
      }
      fragmentStore.get(id).push(response);

      // Check if all fragments are received
      const totalFragments = Math.ceil(response.length / MTU_SIZE);
      if (fragmentStore.get(id).length === totalFragments) {
        const completeMessage = reassembleMessage(fragmentStore.get(id));
        fragmentStore.delete(id);

        // Forward the response back to the client
        clientResponseSocket.send(
          completeMessage,
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
      }
    } else {
      // Ensure the data size does not exceed the MTU size
      if (response.length > MTU_SIZE) {
        console.error(`Data size exceeds MTU size of ${MTU_SIZE} bytes`);
        return;
      }

      // Forward the response back to the client without reassembly
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
    }
  });

  serverSocket.on("message", (msg, rinfo) => {
    if (msg.length <= MTU_SIZE) {
      // Forward the data to the target server without fragmentation
      targetSocket.send(msg, TARGET_PORT, TARGET_IP, (err) => {
        if (err) {
          console.error(
            `Error forwarding data to target server: ${err.message}`
          );
          return;
        }
      });
      return;
    }

    if (ENABLE_FRAGMENTATION) {
      // Fragment the message if it exceeds the MTU size
      const fragments = fragmentMessage(msg, MTU_SIZE);

      // Send each fragment to the target server
      fragments.forEach((fragment) => {
        targetSocket.send(fragment, TARGET_PORT, TARGET_IP, (err) => {
          if (err) {
            console.error(
              `Error forwarding data to target server: ${err.message}`
            );
            return;
          }
        });
      });
    } else {
      // Forward the data to the target server without fragmentation
      targetSocket.send(msg, TARGET_PORT, TARGET_IP, (err) => {
        if (err) {
          console.error(
            `Error forwarding data to target server: ${err.message}`
          );
          return;
        }
      });
    }
  });
}

export { startServer };
