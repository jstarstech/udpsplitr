import dgram from "dgram";
import config from "./config.js";
import { fragmentMessage, reassembleMessage } from "./fragmentation.js";

function startClient() {
  // Configuration
  const {
    CLIENT_IP,
    CLIENT_PROXY_PORT,
    CLIENT_RESPONSE_PORT,
    SERVER_IP,
    SERVER_PORT,
    MTU_SIZE,
    ENABLE_FRAGMENTATION
  } = config;

  // Create UDP sockets
  const clientProxySocket = dgram.createSocket("udp4");
  const clientResponseSocket = dgram.createSocket("udp4");
  const serverSocket = dgram.createSocket("udp4");

  const clientRinfo = {
    address: "127.0.0.1",
    port: 52820,
  };

  // Bind the client proxy socket to the specified IP and port
  clientProxySocket.bind(CLIENT_PROXY_PORT, CLIENT_IP, () => {
    console.log(
      `Listening for client connections on ${CLIENT_IP}:${CLIENT_PROXY_PORT}`
    );
  });

  // Bind the client response socket to the specified IP and port
  clientResponseSocket.bind(CLIENT_RESPONSE_PORT, CLIENT_IP, () => {
    console.log(
      `Listening for server responses on ${CLIENT_IP}:${CLIENT_RESPONSE_PORT}`
    );
  });

  const fragmentStore = new Map();

  clientProxySocket.once("message", (_msg, rinfo) => {
    clientRinfo.address = rinfo.address;
    clientRinfo.port = rinfo.port;
  });

  clientProxySocket.on("message", (msg, rinfo) => {
    if (msg.length <= MTU_SIZE) {
      // Forward the data to the server without fragmentation
      serverSocket.send(msg, SERVER_PORT, SERVER_IP, (err) => {
        if (err) {
          console.error(`Error forwarding data to server: ${err.message}`);
          return;
        }
      });
      return;
    }

    if (ENABLE_FRAGMENTATION) {
      // Fragment the message if it exceeds the MTU size
      const fragments = fragmentMessage(msg, MTU_SIZE);

      // Send each fragment to the server
      fragments.forEach((fragment) => {
        serverSocket.send(fragment, SERVER_PORT, SERVER_IP, (err) => {
          if (err) {
            console.error(`Error forwarding data to server: ${err.message}`);
            return;
          }
        });
      });
    } else {
      // Forward the data to the server without fragmentation
      serverSocket.send(msg, SERVER_PORT, SERVER_IP, (err) => {
        if (err) {
          console.error(`Error forwarding data to server: ${err.message}`);
          return;
        }
      });
    }
  });

  clientResponseSocket.on("message", (msg, rinfo) => {
    if (msg.length <= MTU_SIZE && msg.readUInt8(8) !== 1) {
      // Forward the response back to the client without reassembly
      clientProxySocket.send(
        msg,
        clientRinfo.port,
        clientRinfo.address,
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
      const id = msg.toString("hex", 0, 4);
      if (!fragmentStore.has(id)) {
        fragmentStore.set(id, []);
      }
      fragmentStore.get(id).push(msg);

      // Check if all fragments are received
      const totalFragments = Math.ceil(msg.length / MTU_SIZE);
      if (fragmentStore.get(id).length === totalFragments) {
        const completeMessage = reassembleMessage(fragmentStore.get(id));
        fragmentStore.delete(id);

        // Forward the response back to the client
        clientProxySocket.send(
          completeMessage,
          clientRinfo.port,
          clientRinfo.address,
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
      // Forward the response back to the client without reassembly
      clientProxySocket.send(
        msg,
        clientRinfo.port,
        clientRinfo.address,
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
}

export { startClient };
