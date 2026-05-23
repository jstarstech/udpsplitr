import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { createEnvFile, main, parseArgs } from "../app.js";

test("parseArgs recognizes server mode with echo flag", () => {
  assert.deepEqual(parseArgs(["server", "--echo-mode"]), {
    initEnv: false,
    mode: "server",
    echoMode: true,
    pingMode: false,
    valid: true,
  });
});

test("parseArgs recognizes client mode with ping flag", () => {
  assert.deepEqual(parseArgs(["client", "--ping-mode"]), {
    initEnv: false,
    mode: "client",
    echoMode: false,
    pingMode: true,
    valid: true,
  });
});

test("parseArgs falls back to env mode", () => {
  assert.deepEqual(parseArgs([], { MODE: "server" }), {
    initEnv: false,
    mode: "server",
    echoMode: false,
    pingMode: false,
    valid: true,
  });
});

test("parseArgs prefers cli mode over env mode", () => {
  assert.deepEqual(parseArgs(["client"], { MODE: "server" }), {
    initEnv: false,
    mode: "client",
    echoMode: false,
    pingMode: false,
    valid: true,
  });
});

test("parseArgs recognizes mode-first init-env flag", () => {
  assert.deepEqual(parseArgs(["client", "--init-env", "--force"]), {
    initEnv: true,
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
  assert.match(messages[0], /^Usage: udpsplitr/);
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

test("main dispatches mode-first init-env flag", () => {
  const calls = [];

  const exitCode = main(["client", "--init-env", "--force"], {
    createEnvFile: ({ force, mode }) => {
      calls.push({ force, mode });
      return true;
    },
    logger: { info: () => {}, error: () => {} },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, [{ force: true, mode: "client" }]);
});

test("createEnvFile creates .env from env.example", () => {
  const cwd = mkdtempSync(join(tmpdir(), "udpsplitr-env-"));
  const messages = [];

  const created = createEnvFile({
    cwd,
    logger: { info: (message) => messages.push(message), error: () => {} },
  });

  assert.equal(created, true);
  assert.equal(existsSync(join(cwd, ".env")), true);
  assert.match(readFileSync(join(cwd, ".env"), "utf8"), /^# Server \/ client mode/);
  assert.match(messages[0], /Created/);
});

test("createEnvFile creates client .env when requested", () => {
  const cwd = mkdtempSync(join(tmpdir(), "udpsplitr-env-"));

  const created = createEnvFile({
    cwd,
    mode: "client",
    logger: { info: () => {}, error: () => {} },
  });

  assert.equal(created, true);
  assert.match(readFileSync(join(cwd, ".env"), "utf8"), /^MODE=client/m);
});

test("createEnvFile rejects invalid mode", () => {
  const cwd = mkdtempSync(join(tmpdir(), "udpsplitr-env-"));
  const messages = [];

  const created = createEnvFile({
    cwd,
    mode: "edge",
    logger: { info: () => {}, error: (message) => messages.push(message) },
  });

  assert.equal(created, false);
  assert.equal(existsSync(join(cwd, ".env")), false);
  assert.match(messages[0], /Invalid init-env mode/);
});

test("createEnvFile does not overwrite .env without force", () => {
  const cwd = mkdtempSync(join(tmpdir(), "udpsplitr-env-"));
  const envPath = join(cwd, ".env");
  const messages = [];
  writeFileSync(envPath, "MODE=client\n");

  const created = createEnvFile({
    cwd,
    logger: { info: () => {}, error: (message) => messages.push(message) },
  });

  assert.equal(created, false);
  assert.equal(readFileSync(envPath, "utf8"), "MODE=client\n");
  assert.match(messages[0], /--init-env --force/);
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
