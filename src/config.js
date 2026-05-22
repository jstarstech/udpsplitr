import dotenv from "dotenv";

dotenv.config();

export function parseIntegerEnv(env, name, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const rawValue = env[name];

  if (rawValue === undefined || rawValue === "") {
    return fallback;
  }

  const parsedValue = Number(rawValue);

  if (!Number.isInteger(parsedValue) || parsedValue < min || parsedValue > max) {
    throw new Error(
      `${name} must be an integer between ${min} and ${max}, got ${JSON.stringify(rawValue)}`
    );
  }

  return parsedValue;
}

export function createConfig(env = process.env) {
  return {
    CLIENT_IP: env.CLIENT_IP || "0.0.0.0",
    CLIENT_PROXY_PORT: parseIntegerEnv(env, "CLIENT_PROXY_PORT", 27817, {
      min: 1,
      max: 65535,
    }),
    CLIENT_RESPONSE_PORT: parseIntegerEnv(env, "CLIENT_RESPONSE_PORT", 27818, {
      min: 1,
      max: 65535,
    }),
    SERVER_IP: env.SERVER_IP || "127.0.0.1",
    SERVER_PORT: parseIntegerEnv(env, "SERVER_PORT", 27817, {
      min: 1,
      max: 65535,
    }),
    MTU_SIZE: parseIntegerEnv(env, "MTU_SIZE", 1450, {
      min: 1,
      max: 65507,
    }),
    TARGET_IP: env.TARGET_IP || "127.0.0.1",
    TARGET_PORT: parseIntegerEnv(env, "TARGET_PORT", 443, {
      min: 1,
      max: 65535,
    }),
    CLIENT_RESPONSE_IP: env.CLIENT_RESPONSE_IP || "127.0.0.1",
  };
}

const config = createConfig();

export default config;
