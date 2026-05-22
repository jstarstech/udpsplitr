import assert from "node:assert/strict";
import test from "node:test";

import { createConfig, parseIntegerEnv } from "../src/config.js";

test("parseIntegerEnv returns fallback when env value is missing", () => {
  assert.equal(
    parseIntegerEnv({}, "SERVER_PORT", 27817, { min: 1, max: 65535 }),
    27817
  );
});

test("parseIntegerEnv accepts valid integer strings", () => {
  assert.equal(
    parseIntegerEnv({ SERVER_PORT: "3000" }, "SERVER_PORT", 27817, {
      min: 1,
      max: 65535,
    }),
    3000
  );
});

test("parseIntegerEnv rejects invalid integer strings", () => {
  assert.throws(
    () =>
      parseIntegerEnv({ SERVER_PORT: "abc" }, "SERVER_PORT", 27817, {
        min: 1,
        max: 65535,
      }),
    /SERVER_PORT must be an integer between 1 and 65535/
  );
});

test("createConfig uses documented defaults", () => {
  const config = createConfig({});

  assert.deepEqual(config, {
    CLIENT_IP: "0.0.0.0",
    CLIENT_PROXY_PORT: 27817,
    CLIENT_RESPONSE_PORT: 27818,
    SERVER_IP: "127.0.0.1",
    SERVER_PORT: 27817,
    MTU_SIZE: 1450,
    TARGET_IP: "127.0.0.1",
    TARGET_PORT: 443,
    CLIENT_RESPONSE_IP: "127.0.0.1",
  });
});
