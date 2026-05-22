import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { main, parseArgs } from "../app.js";

test("parseArgs recognizes server mode with echo flag", () => {
  assert.deepEqual(parseArgs(["server", "--echo-mode"]), {
    mode: "server",
    echoMode: true,
    pingMode: false,
    valid: true,
  });
});

test("parseArgs recognizes client mode with ping flag", () => {
  assert.deepEqual(parseArgs(["client", "--ping-mode"]), {
    mode: "client",
    echoMode: false,
    pingMode: true,
    valid: true,
  });
});

test("parseArgs falls back to env mode", () => {
  assert.deepEqual(parseArgs([], { MODE: "server" }), {
    mode: "server",
    echoMode: false,
    pingMode: false,
    valid: true,
  });
});

test("parseArgs prefers cli mode over env mode", () => {
  assert.deepEqual(parseArgs(["client"], { MODE: "server" }), {
    mode: "client",
    echoMode: false,
    pingMode: false,
    valid: true,
  });
});

test("main dispatches server mode", () => {
  const calls = [];

  const exitCode = main(["server", "--echo-mode"], {
    startServer: (echoMode) => calls.push(["server", echoMode]),
    startClient: () => calls.push(["client"]),
    logger: { info: () => {} },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, [["server", true]]);
});

test("main dispatches client mode", () => {
  const calls = [];

  const exitCode = main(["client", "--ping-mode"], {
    startServer: () => calls.push(["server"]),
    startClient: (pingMode) => calls.push(["client", pingMode]),
    logger: { info: () => {} },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, [["client", true]]);
});

test("main returns usage code for invalid args", () => {
  const messages = [];

  const exitCode = main([], {
    logger: { info: (message) => messages.push(message) },
  });

  assert.equal(exitCode, 1);
  assert.equal(messages.length, 1);
  assert.match(messages[0], /^Usage: node app\.js/);
});

test("main dispatches env mode when cli mode is absent", () => {
  const calls = [];

  const exitCode = main([], {
    env: { MODE: "server" },
    startServer: () => calls.push(["server"]),
    startClient: () => calls.push(["client"]),
    logger: { info: () => {} },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, [["server"]]);
});

test("direct execution without args exits with usage", () => {
  const cwd = fileURLToPath(new URL("..", import.meta.url));

  assert.throws(
    () =>
      execFileSync(process.execPath, ["app.js"], {
        cwd,
        encoding: "utf8",
      }),
    (error) => {
      assert.equal(error.status, 1);
      return true;
    }
  );
});
