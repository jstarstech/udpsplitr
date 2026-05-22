import assert from "node:assert/strict";
import test from "node:test";

import { createClientProxy } from "../src/udp_client_proxy.js";
import { createServerProxy } from "../src/udp_server_proxy.js";

function createFakeSocket() {
  return {
    bindCalls: [],
    sendCalls: [],
    handlers: {},
    bind(port, address, callback) {
      this.bindCalls.push({ port, address });
      if (callback) callback();
    },
    on(event, handler) {
      this.handlers[event] = handler;
    },
    send(message, port, address, callback) {
      this.sendCalls.push({
        message: Buffer.from(message),
        port,
        address,
      });
      if (callback) callback();
    },
    emit(event, ...args) {
      if (this.handlers[event]) {
        this.handlers[event](...args);
      }
    },
  };
}

function createFakeDgram() {
  const sockets = [];

  return {
    sockets,
    createSocket() {
      const socket = createFakeSocket();
      sockets.push(socket);
      return socket;
    },
  };
}

function createTimerHarness() {
  const intervals = [];
  const timeouts = [];

  return {
    intervals,
    timeouts,
    setInterval(fn, ms) {
      const timer = { fn, ms };
      intervals.push(timer);
      return timer;
    },
    setTimeout(fn, ms) {
      const timer = { fn, ms, cancelled: false };
      timeouts.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      if (timer) {
        timer.cancelled = true;
      }
    },
    runInterval(ms) {
      for (const timer of intervals.filter((item) => item.ms === ms)) {
        timer.fn();
      }
    },
  };
}

function createLogger() {
  const logs = [];
  const errors = [];

  return {
    logs,
    errors,
    logger: {
      log: (message) => logs.push(message),
      info: (message) => logs.push(message),
      error: (message) => errors.push(message),
    },
  };
}

const fakeReadline = {
  createInterface() {
    return {
      on() {},
    };
  },
};

function createReadlineHarness() {
  let lineHandler = null;

  return {
    api: {
      createInterface() {
        return {
          on(event, handler) {
            if (event === "line") {
              lineHandler = handler;
            }
          },
        };
      },
    },
    emitLine(line) {
      if (lineHandler) {
        lineHandler(line);
      }
    },
  };
}

test("client proxy forwards packets and returns responses to the active client", () => {
  const dgram = createFakeDgram();
  const timers = createTimerHarness();
  const { logger, errors, logs } = createLogger();
  let clock = 1000;

  const proxy = createClientProxy(false, {
    config: {
      CLIENT_IP: "127.0.0.1",
      CLIENT_PROXY_PORT: 3000,
      CLIENT_RESPONSE_PORT: 3001,
      SERVER_IP: "127.0.0.1",
      SERVER_PORT: 4000,
      MTU_SIZE: 1450,
    },
    dgram,
    readline: fakeReadline,
    logger,
    setInterval: timers.setInterval,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    now: () => clock,
    exit: () => {
      throw new Error("unexpected exit");
    },
  });

  const [clientProxySocket, clientResponseSocket, serverSocket] = dgram.sockets;

  clientProxySocket.emit("message", Buffer.from("hello"), {
    address: "10.0.0.10",
    port: 5555,
  });

  assert.equal(serverSocket.sendCalls.length, 1);
  assert.equal(serverSocket.sendCalls[0].address, "127.0.0.1");
  assert.equal(serverSocket.sendCalls[0].port, 4000);
  assert.equal(serverSocket.sendCalls[0].message.toString(), "hello");
  assert.deepEqual(proxy.getActiveClientRinfo(), {
    address: "10.0.0.10",
    port: 5555,
  });

  clientResponseSocket.emit("message", Buffer.from("world"));

  assert.equal(clientProxySocket.sendCalls.length, 1);
  assert.equal(clientProxySocket.sendCalls[0].address, "10.0.0.10");
  assert.equal(clientProxySocket.sendCalls[0].port, 5555);
  assert.equal(clientProxySocket.sendCalls[0].message.toString(), "world");
  assert.deepEqual(errors, []);
  assert.match(logs.join("\n"), /Bound upstream responses to client/);
});

test("client proxy rejects packets from a second client", () => {
  const dgram = createFakeDgram();
  const timers = createTimerHarness();
  const { logger, errors, logs } = createLogger();
  let clock = 1000;

  const proxy = createClientProxy(false, {
    config: {
      CLIENT_IP: "127.0.0.1",
      CLIENT_PROXY_PORT: 3000,
      CLIENT_RESPONSE_PORT: 3001,
      SERVER_IP: "127.0.0.1",
      SERVER_PORT: 4000,
      MTU_SIZE: 1450,
    },
    dgram,
    readline: fakeReadline,
    logger,
    setInterval: timers.setInterval,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    now: () => clock,
    exit: () => {
      throw new Error("unexpected exit");
    },
  });

  const [clientProxySocket, , serverSocket] = dgram.sockets;

  clientProxySocket.emit("message", Buffer.from("first"), {
    address: "10.0.0.10",
    port: 5555,
  });
  clientProxySocket.emit("message", Buffer.from("second"), {
    address: "10.0.0.11",
    port: 5556,
  });

  assert.equal(serverSocket.sendCalls.length, 1);
  assert.equal(serverSocket.sendCalls[0].message.toString(), "first");
  assert.deepEqual(proxy.getActiveClientRinfo(), {
    address: "10.0.0.10",
    port: 5555,
  });
  assert.match(
    errors.join("\n"),
    /Rejecting packet from 10\.0\.0\.11:5556/
  );
  assert.ok(
    logs.includes("Bound upstream responses to client 10.0.0.10:5555"),
    "expected first client binding to be logged"
  );
});

test("client proxy drops oversized packets before forwarding", () => {
  const dgram = createFakeDgram();
  const timers = createTimerHarness();
  const { logger, errors } = createLogger();
  let clock = 1000;

  const proxy = createClientProxy(false, {
    config: {
      CLIENT_IP: "127.0.0.1",
      CLIENT_PROXY_PORT: 3000,
      CLIENT_RESPONSE_PORT: 3001,
      SERVER_IP: "127.0.0.1",
      SERVER_PORT: 4000,
      MTU_SIZE: 5,
    },
    dgram,
    readline: fakeReadline,
    logger,
    setInterval: timers.setInterval,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    now: () => clock,
    exit: () => {
      throw new Error("unexpected exit");
    },
  });

  const [clientProxySocket, , serverSocket] = dgram.sockets;

  clientProxySocket.emit("message", Buffer.from("toolong"), {
    address: "10.0.0.10",
    port: 5555,
  });

  assert.equal(serverSocket.sendCalls.length, 0);
  assert.equal(proxy.getActiveClientRinfo().address, "10.0.0.10");
  assert.match(errors.join("\n"), /Data size exceeds MTU size of 5 bytes/);
});

test("client proxy logs traffic on interval and stdin line", () => {
  const dgram = createFakeDgram();
  const timers = createTimerHarness();
  const readline = createReadlineHarness();
  const { logger, logs } = createLogger();
  let clock = 1000;

  const proxy = createClientProxy(false, {
    config: {
      CLIENT_IP: "127.0.0.1",
      CLIENT_PROXY_PORT: 3000,
      CLIENT_RESPONSE_PORT: 3001,
      SERVER_IP: "127.0.0.1",
      SERVER_PORT: 4000,
      MTU_SIZE: 1450,
    },
    dgram,
    readline: readline.api,
    logger,
    setInterval: timers.setInterval,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    now: () => clock,
    exit: () => {
      throw new Error("unexpected exit");
    },
  });

  const [clientProxySocket] = dgram.sockets;
  clientProxySocket.emit("message", Buffer.from("hello"), {
    address: "10.0.0.10",
    port: 5555,
  });

  timers.runInterval(10000);
  readline.emitLine("traffic");

  assert.equal(proxy.getActiveClientRinfo().address, "10.0.0.10");
  assert.ok(
    logs.some((line) => line === "Traffic - In: 0 bytes, Out: 5 bytes"),
    "expected traffic line to be logged"
  );
});

test("client proxy exits when a socket emits an error", () => {
  const dgram = createFakeDgram();
  const timers = createTimerHarness();
  const { logger, errors } = createLogger();
  let exitCode = null;

  const proxy = createClientProxy(false, {
    config: {
      CLIENT_IP: "127.0.0.1",
      CLIENT_PROXY_PORT: 3000,
      CLIENT_RESPONSE_PORT: 3001,
      SERVER_IP: "127.0.0.1",
      SERVER_PORT: 4000,
      MTU_SIZE: 1450,
    },
    dgram,
    readline: fakeReadline,
    logger,
    setInterval: timers.setInterval,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    now: () => 1000,
    exit: (code) => {
      exitCode = code;
    },
  });

  const [clientProxySocket] = dgram.sockets;
  clientProxySocket.emit("error", new Error("boom"));

  assert.equal(exitCode, 1);
  assert.match(errors.join("\n"), /Client proxy socket error: boom/);
  assert.ok(proxy.clientProxySocket);
});

test("client proxy drops responses when no active client is bound", () => {
  const dgram = createFakeDgram();
  const timers = createTimerHarness();
  const { logger, errors } = createLogger();

  createClientProxy(false, {
    config: {
      CLIENT_IP: "127.0.0.1",
      CLIENT_PROXY_PORT: 3000,
      CLIENT_RESPONSE_PORT: 3001,
      SERVER_IP: "127.0.0.1",
      SERVER_PORT: 4000,
      MTU_SIZE: 1450,
    },
    dgram,
    readline: fakeReadline,
    logger,
    setInterval: timers.setInterval,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    now: () => 1000,
    exit: () => {
      throw new Error("unexpected exit");
    },
  });

  const [, clientResponseSocket, clientProxySocket] = dgram.sockets;
  clientResponseSocket.emit("message", Buffer.from("reply"));

  assert.equal(clientProxySocket.sendCalls.length, 0);
  assert.match(
    errors.join("\n"),
    /Dropping response because no client is currently bound/
  );
});

test("client proxy reports send errors while forwarding", () => {
  const dgram = createFakeDgram();
  const timers = createTimerHarness();
  const { logger, errors } = createLogger();
  let exitCode = null;

  const proxy = createClientProxy(false, {
    config: {
      CLIENT_IP: "127.0.0.1",
      CLIENT_PROXY_PORT: 3000,
      CLIENT_RESPONSE_PORT: 3001,
      SERVER_IP: "127.0.0.1",
      SERVER_PORT: 4000,
      MTU_SIZE: 1450,
    },
    dgram,
    readline: fakeReadline,
    logger,
    setInterval: timers.setInterval,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    now: () => 1000,
    exit: (code) => {
      exitCode = code;
    },
  });

  const [clientProxySocket, , serverSocket] = dgram.sockets;
  serverSocket.send = (message, port, address, callback) => {
    if (callback) callback(new Error("forward failed"));
  };

  clientProxySocket.emit("message", Buffer.from("hello"), {
    address: "10.0.0.10",
    port: 5555,
  });

  assert.equal(exitCode, null);
  assert.match(errors.join("\n"), /Error forwarding data to server: forward failed/);
  assert.deepEqual(proxy.getActiveClientRinfo(), {
    address: "10.0.0.10",
    port: 5555,
  });
});

test("client proxy rejects ping responses shorter than a probe id", () => {
  const dgram = createFakeDgram();
  const timers = createTimerHarness();
  const { logger, errors } = createLogger();

  createClientProxy(true, {
    config: {
      CLIENT_IP: "127.0.0.1",
      CLIENT_PROXY_PORT: 3000,
      CLIENT_RESPONSE_PORT: 3001,
      SERVER_IP: "127.0.0.1",
      SERVER_PORT: 4000,
      MTU_SIZE: 1450,
    },
    dgram,
    readline: fakeReadline,
    logger,
    setInterval: timers.setInterval,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    now: () => 1000,
    exit: () => {
      throw new Error("unexpected exit");
    },
  });

  const [, clientResponseSocket] = dgram.sockets;

  clientResponseSocket.emit("message", Buffer.alloc(4));

  assert.match(
    errors.join("\n"),
    /Dropping ping response without a probe id/
  );
});

test("client proxy reports send errors while forwarding responses to client", () => {
  const dgram = createFakeDgram();
  const timers = createTimerHarness();
  const { logger, errors } = createLogger();

  createClientProxy(false, {
    config: {
      CLIENT_IP: "127.0.0.1",
      CLIENT_PROXY_PORT: 3000,
      CLIENT_RESPONSE_PORT: 3001,
      SERVER_IP: "127.0.0.1",
      SERVER_PORT: 4000,
      MTU_SIZE: 1450,
    },
    dgram,
    readline: fakeReadline,
    logger,
    setInterval: timers.setInterval,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    now: () => 1000,
    exit: () => {
      throw new Error("unexpected exit");
    },
  });

  const [clientProxySocket, clientResponseSocket] = dgram.sockets;
  clientProxySocket.emit("message", Buffer.from("hello"), {
    address: "10.0.0.10",
    port: 5555,
  });
  clientProxySocket.send = (message, port, address, callback) => {
    if (callback) callback(new Error("client send failed"));
  };

  clientResponseSocket.emit("message", Buffer.from("reply"));

  assert.match(
    errors.join("\n"),
    /Error forwarding response to client: client send failed/
  );
});

test("client proxy ping mode tracks probe ids and latency", () => {
  const dgram = createFakeDgram();
  const timers = createTimerHarness();
  const { logger, errors, logs } = createLogger();
  let clock = 1000;

  createClientProxy(true, {
    config: {
      CLIENT_IP: "127.0.0.1",
      CLIENT_PROXY_PORT: 3000,
      CLIENT_RESPONSE_PORT: 3001,
      SERVER_IP: "127.0.0.1",
      SERVER_PORT: 4000,
      MTU_SIZE: 1450,
    },
    dgram,
    readline: fakeReadline,
    logger,
    setInterval: timers.setInterval,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    now: () => clock,
    exit: () => {
      throw new Error("unexpected exit");
    },
  });

  const [, clientResponseSocket, serverSocket] = dgram.sockets;

  timers.runInterval(1000);

  assert.equal(serverSocket.sendCalls.length, 1);
  assert.equal(serverSocket.sendCalls[0].message.length, 64);
  assert.equal(serverSocket.sendCalls[0].message.readBigUInt64BE(0), 0n);

  clock = 1042;
  clientResponseSocket.emit("message", serverSocket.sendCalls[0].message);

  assert.ok(
    logs.includes("PING 127.0.0.1:4000 (127.0.0.1) 56 data bytes"),
    "expected ping banner to be logged"
  );
  assert.match(
    logs.find((line) =>
      /^64 bytes from 127\.0\.0\.1:4000: icmp_seq=0 time=42 ms$/.test(line)
    ),
    /^64 bytes from 127\.0\.0\.1:4000: icmp_seq=0 time=42 ms$/
  );
  assert.deepEqual(errors, []);
});

test("client proxy ping mode expires unanswered probes", () => {
  const dgram = createFakeDgram();
  const timers = createTimerHarness();
  const { logger, errors, logs } = createLogger();
  let clock = 1000;

  const proxy = createClientProxy(true, {
    config: {
      CLIENT_IP: "127.0.0.1",
      CLIENT_PROXY_PORT: 3000,
      CLIENT_RESPONSE_PORT: 3001,
      SERVER_IP: "127.0.0.1",
      SERVER_PORT: 4000,
      MTU_SIZE: 1450,
    },
    dgram,
    readline: fakeReadline,
    logger,
    setInterval: timers.setInterval,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    now: () => clock,
    exit: () => {
      throw new Error("unexpected exit");
    },
  });

  timers.runInterval(1000);

  assert.equal(proxy.pendingProbes.size, 1);
  assert.equal(timers.timeouts.length, 1);
  assert.equal(timers.timeouts[0].ms, 4000);

  timers.timeouts[0].fn();

  assert.equal(proxy.pendingProbes.size, 0);
  assert.match(
    errors.join("\n"),
    /Request timeout for icmp_seq 0/
  );
  assert.ok(
    logs.includes("PING 127.0.0.1:4000 (127.0.0.1) 56 data bytes"),
    "expected ping banner to be logged"
  );
});

test("client proxy ping mode ignores unknown probe ids", () => {
  const dgram = createFakeDgram();
  const timers = createTimerHarness();
  const { logger, errors, logs } = createLogger();
  let clock = 1000;

  const proxy = createClientProxy(true, {
    config: {
      CLIENT_IP: "127.0.0.1",
      CLIENT_PROXY_PORT: 3000,
      CLIENT_RESPONSE_PORT: 3001,
      SERVER_IP: "127.0.0.1",
      SERVER_PORT: 4000,
      MTU_SIZE: 1450,
    },
    dgram,
    readline: fakeReadline,
    logger,
    setInterval: timers.setInterval,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    now: () => clock,
    exit: () => {
      throw new Error("unexpected exit");
    },
  });

  const [, clientResponseSocket] = dgram.sockets;

  timers.runInterval(1000);

  const response = Buffer.alloc(64);
  response.writeBigUInt64BE(99n, 0);
  clientResponseSocket.emit("message", response);

  assert.equal(proxy.pendingProbes.size, 1);
  assert.match(
    errors.join("\n"),
    /Dropping ping response for unknown probe 99/
  );
  assert.ok(
    logs.includes("PING 127.0.0.1:4000 (127.0.0.1) 56 data bytes"),
    "expected ping banner to be logged"
  );
});

test("server echo mode enforces mtu limits before replying", () => {
  const dgram = createFakeDgram();
  const timers = createTimerHarness();
  const { logger, errors } = createLogger();

  createServerProxy(true, {
    config: {
      SERVER_IP: "127.0.0.1",
      SERVER_PORT: 4000,
      TARGET_IP: "127.0.0.1",
      TARGET_PORT: 5000,
      CLIENT_RESPONSE_IP: "127.0.0.1",
      CLIENT_RESPONSE_PORT: 6000,
      MTU_SIZE: 10,
    },
    dgram,
    readline: fakeReadline,
    logger,
    setInterval: timers.setInterval,
    exit: () => {
      throw new Error("unexpected exit");
    },
  });

  const [serverSocket, , clientResponseSocket] = dgram.sockets;

  serverSocket.emit("message", Buffer.from("0123456789"));
  assert.equal(clientResponseSocket.sendCalls.length, 1);
  assert.equal(clientResponseSocket.sendCalls[0].message.toString(), "0123456789");

  serverSocket.emit("message", Buffer.from("01234567890"));
  assert.equal(clientResponseSocket.sendCalls.length, 1);
  assert.match(errors[0], /Data size exceeds MTU size of 10 bytes/);
});

test("server proxy logs traffic on interval and stdin line", () => {
  const dgram = createFakeDgram();
  const timers = createTimerHarness();
  const readline = createReadlineHarness();
  const { logger, logs } = createLogger();

  const proxy = createServerProxy(false, {
    config: {
      SERVER_IP: "127.0.0.1",
      SERVER_PORT: 4000,
      TARGET_IP: "127.0.0.1",
      TARGET_PORT: 5000,
      CLIENT_RESPONSE_IP: "127.0.0.1",
      CLIENT_RESPONSE_PORT: 6000,
      MTU_SIZE: 1450,
    },
    dgram,
    readline: readline.api,
    logger,
    setInterval: timers.setInterval,
    exit: () => {
      throw new Error("unexpected exit");
    },
  });

  const [serverSocket] = dgram.sockets;
  serverSocket.emit("message", Buffer.from("hello"));
  timers.runInterval(10000);
  readline.emitLine("traffic");

  assert.equal(proxy.serverSocket, serverSocket);
  assert.ok(
    logs.some((line) => line.startsWith("Traffic - In: 5 bytes, Out: 0 bytes")),
    "expected traffic line to be logged"
  );
});

test("server proxy exits when a socket emits an error", () => {
  const dgram = createFakeDgram();
  const timers = createTimerHarness();
  const { logger, errors } = createLogger();
  let exitCode = null;

  createServerProxy(false, {
    config: {
      SERVER_IP: "127.0.0.1",
      SERVER_PORT: 4000,
      TARGET_IP: "127.0.0.1",
      TARGET_PORT: 5000,
      CLIENT_RESPONSE_IP: "127.0.0.1",
      CLIENT_RESPONSE_PORT: 6000,
      MTU_SIZE: 1450,
    },
    dgram,
    readline: fakeReadline,
    logger,
    setInterval: timers.setInterval,
    exit: (code) => {
      exitCode = code;
    },
  });

  const [serverSocket] = dgram.sockets;
  serverSocket.emit("error", new Error("boom"));

  assert.equal(exitCode, 1);
  assert.match(errors.join("\n"), /Server socket error: boom/);
});

test("server proxy reports target send errors", () => {
  const dgram = createFakeDgram();
  const timers = createTimerHarness();
  const { logger, errors } = createLogger();

  createServerProxy(false, {
    config: {
      SERVER_IP: "127.0.0.1",
      SERVER_PORT: 4000,
      TARGET_IP: "127.0.0.1",
      TARGET_PORT: 5000,
      CLIENT_RESPONSE_IP: "127.0.0.1",
      CLIENT_RESPONSE_PORT: 6000,
      MTU_SIZE: 1450,
    },
    dgram,
    readline: fakeReadline,
    logger,
    setInterval: timers.setInterval,
    exit: () => {
      throw new Error("unexpected exit");
    },
  });

  const [serverSocket, targetSocket] = dgram.sockets;
  targetSocket.send = (message, port, address, callback) => {
    if (callback) callback(new Error("target failed"));
  };

  serverSocket.emit("message", Buffer.from("hello"));

  assert.match(
    errors.join("\n"),
    /Error forwarding data to target server: target failed/
  );
});

test("server proxy reports response send errors", () => {
  const dgram = createFakeDgram();
  const timers = createTimerHarness();
  const { logger, errors } = createLogger();

  createServerProxy(false, {
    config: {
      SERVER_IP: "127.0.0.1",
      SERVER_PORT: 4000,
      TARGET_IP: "127.0.0.1",
      TARGET_PORT: 5000,
      CLIENT_RESPONSE_IP: "127.0.0.1",
      CLIENT_RESPONSE_PORT: 6000,
      MTU_SIZE: 1450,
    },
    dgram,
    readline: fakeReadline,
    logger,
    setInterval: timers.setInterval,
    exit: () => {
      throw new Error("unexpected exit");
    },
  });

  const [, , clientResponseSocket] = dgram.sockets;
  clientResponseSocket.send = (message, port, address, callback) => {
    if (callback) callback(new Error("response failed"));
  };

  dgram.sockets[1].emit("message", Buffer.from("reply"));

  assert.match(
    errors.join("\n"),
    /Error forwarding response to client: response failed/
  );
});

test("server proxy drops oversized target responses", () => {
  const dgram = createFakeDgram();
  const timers = createTimerHarness();
  const { logger, errors } = createLogger();

  createServerProxy(false, {
    config: {
      SERVER_IP: "127.0.0.1",
      SERVER_PORT: 4000,
      TARGET_IP: "127.0.0.1",
      TARGET_PORT: 5000,
      CLIENT_RESPONSE_IP: "127.0.0.1",
      CLIENT_RESPONSE_PORT: 6000,
      MTU_SIZE: 5,
    },
    dgram,
    readline: fakeReadline,
    logger,
    setInterval: timers.setInterval,
    exit: () => {
      throw new Error("unexpected exit");
    },
  });

  const [, targetSocket, clientResponseSocket] = dgram.sockets;
  targetSocket.emit("message", Buffer.from("toolong"));

  assert.equal(clientResponseSocket.sendCalls.length, 0);
  assert.match(
    errors.join("\n"),
    /Data size exceeds MTU size of 5 bytes/
  );
});

test("server normal mode forwards to target and relays the target response", () => {
  const dgram = createFakeDgram();
  const timers = createTimerHarness();
  const { logger, errors } = createLogger();

  createServerProxy(false, {
    config: {
      SERVER_IP: "127.0.0.1",
      SERVER_PORT: 4000,
      TARGET_IP: "127.0.0.1",
      TARGET_PORT: 5000,
      CLIENT_RESPONSE_IP: "127.0.0.1",
      CLIENT_RESPONSE_PORT: 6000,
      MTU_SIZE: 1450,
    },
    dgram,
    readline: fakeReadline,
    logger,
    setInterval: timers.setInterval,
    exit: () => {
      throw new Error("unexpected exit");
    },
  });

  const [serverSocket, targetSocket, clientResponseSocket] = dgram.sockets;

  serverSocket.emit("message", Buffer.from("hello"));
  assert.equal(targetSocket.sendCalls.length, 1);
  assert.equal(targetSocket.sendCalls[0].port, 5000);

  targetSocket.emit("message", Buffer.from("reply"));
  assert.equal(clientResponseSocket.sendCalls.length, 1);
  assert.equal(clientResponseSocket.sendCalls[0].address, "127.0.0.1");
  assert.equal(clientResponseSocket.sendCalls[0].port, 6000);
  assert.equal(clientResponseSocket.sendCalls[0].message.toString(), "reply");
  assert.deepEqual(errors, []);
});

test("server normal mode drops oversized packets before forwarding", () => {
  const dgram = createFakeDgram();
  const timers = createTimerHarness();
  const { logger, errors } = createLogger();

  createServerProxy(false, {
    config: {
      SERVER_IP: "127.0.0.1",
      SERVER_PORT: 4000,
      TARGET_IP: "127.0.0.1",
      TARGET_PORT: 5000,
      CLIENT_RESPONSE_IP: "127.0.0.1",
      CLIENT_RESPONSE_PORT: 6000,
      MTU_SIZE: 5,
    },
    dgram,
    readline: fakeReadline,
    logger,
    setInterval: timers.setInterval,
    exit: () => {
      throw new Error("unexpected exit");
    },
  });

  const [serverSocket, targetSocket] = dgram.sockets;

  serverSocket.emit("message", Buffer.from("toolong"));

  assert.equal(targetSocket.sendCalls.length, 0);
  assert.match(errors.join("\n"), /Data size exceeds MTU size of 5 bytes/);
});
