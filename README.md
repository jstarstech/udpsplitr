# UDPSplitR

This project implements a UDP proxy that forwards traffic between a client and a server. The proxy is split into two parts: a client-side proxy and a server-side proxy. The client listens on two ports: one for proxying incoming data and another for receiving responses from the server. The server listens on a port for incoming data from the client and connects to the target IP:port to proxy data coming from the client proxy port.

The client-side proxy currently supports one active upstream client at a time. If a second client sends traffic on the proxy port, the packet is rejected instead of stealing the return path.

In `--ping-mode`, the client prepends a probe ID to each echo payload and matches responses by that ID. The console output is formatted like standard `ping`, with a `PING ...` banner, 1-second probe intervals, and per-probe latency lines.

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
- `NAT_TRAVERSAL`: Enables client response-port keepalives so the server learns the NAT-mapped return path for responses (default: `false`).

`NAT_TRAVERSAL` is an experimental feature. It relies on periodic client keepalives to keep the response-port mapping alive through NAT and firewalls, and behavior will vary by network.

When `NAT_TRAVERSAL` is enabled, the client response socket periodically sends a small keepalive packet to the server. The server uses the observed source address and port as the return path for responses instead of the static `CLIENT_RESPONSE_IP` and `CLIENT_RESPONSE_PORT` values.

## Usage

### Running the Proxy

Use the `app.js` entry file to start the proxy in either server or client mode.

You can pass the mode as a CLI argument or via `MODE=server|client` in the environment. If both are set, the CLI argument wins.

#### Server Mode

```sh
node app.js server
```

#### Client Mode

```sh
node app.js client
```

#### Environment Mode

```sh
MODE=server node app.js
MODE=client node app.js
```

## Running Tests

To run the tests for this project, use the following command:

```sh
npm test
```

## Docker

### Temporary Echo/Ping

#### Server Machine

```sh
docker run -d --rm --env-file .env --name udpsplitr-server udpsplitr node app.js server --echo-mode
```

#### Client Machine

```sh
docker run -d --rm --env-file .env --name udpsplitr-client udpsplitr node app.js client --ping-mode
```

### Client-Server Compose

Copy [env.example](/home/maks/Development/personal/udpsplit/env.example) to `.env` on each machine:

```sh
cp env.example .env
```

Set the mode in `.env` to match the machine role:

```sh
# server machine
MODE=server

# client machine
MODE=client
```

Run Compose normally on both machines:

```sh
docker compose up --build
```

The server machine should use `MODE=server`. The client machine should use `MODE=client`.

The Compose service loads environment values from the project `.env` file.
