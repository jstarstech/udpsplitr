# UDPSplitR

UDPSplitR is a UDP proxy that splits outgoing and incoming traffic across different ports. The client sends proxied packets from one local port and listens for server responses on another, while the server receives client packets and forwards them to `TARGET_IP:TARGET_PORT`.

The tool is useful when a UDP flow needs separate paths for input and output traffic between the client-side proxy and the server-side proxy.

The client side intentionally supports one active local UDP peer at a time. The first peer that sends traffic owns the return path; packets from other peers are rejected so responses are not accidentally delivered to the wrong process.

For deployments behind NAT, the experimental `NAT_TRAVERSAL` option can make the client response socket send keepalive packets. This lets the server learn the observed return endpoint instead of relying only on the configured `CLIENT_RESPONSE_IP` and `CLIENT_RESPONSE_PORT`.

## Traffic Schema

```text
                 outgoing path
┌───────────────┐   CLIENT_PROXY_PORT   ┌───────────────────┐   SERVER_PORT   ┌───────────────────┐   TARGET_PORT   ┌──────────────┐
│ Local UDP app │ ────────────────────> │ UDPSplitR client  │ ──────────────> │ UDPSplitR server  │ ──────────────> │ Target UDP   │
└───────────────┘                       └───────────────────┘                 └───────────────────┘                 └──────────────┘
        ▲                                      │                                  │                                │
        │                                      │                                  │                                │
        └──────────────────────────────────────┘ <────────────────────────────────┘ <──────────────────────────────┘
              CLIENT_RESPONSE_PORT                         response path
```

The important part is that the client-side proxy uses different ports for the two directions: `CLIENT_PROXY_PORT` for incoming local traffic and `CLIENT_RESPONSE_PORT` for responses from the server.

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
