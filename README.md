# UDPSplitR

This project implements a UDP proxy that forwards traffic between a client and a server. The proxy is split into two parts: a client-side proxy and a server-side proxy. The client listens on two ports: one for proxying incoming data and another for receiving responses from the server. The server listens on a port for incoming data from the client and connects to the target IP:port to proxy data coming from the client proxy port.

## Configuration

Both the client and server proxies have the following configuration options, which can be set in a `.env` file:

- `CLIENT_IP`: The IP address to listen for client connections (default: `0.0.0.0`).
- `CLIENT_PROXY_PORT`: The port to listen for client connections (default: `27817`).
- `CLIENT_RESPONSE_PORT`: The port to receive responses from the server (default: `27818`).
- `SERVER_IP`: The IP address of the server to forward data to.
- `SERVER_PORT`: The port to forward data to the server (default: `27817`).
- `TARGET_IP`: The IP address of the target server to forward data to.
- `TARGET_PORT`: The port to forward data to the target server (default: `443`).
- `CLIENT_RESPONSE_IP`: The IP address of the client to receive responses.
- `CLIENT_RESPONSE_PORT`: The port to receive responses from the target server (default: `27818`).
- `MTU_SIZE`: The Maximum Transmission Unit size (default: `1450`).

## Usage

### Running the Proxy

Use the `app.js` entry file to start the proxy in either server or client mode.

#### Server Mode

```sh
node app.js server
```

#### Client Mode

```sh
node app.js client
```

## Running Tests

To run the tests for this project, use the following command:

```sh
npm test
```
