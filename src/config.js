import dotenv from "dotenv";

dotenv.config();

function parseIntegerEnv(name, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const rawValue = process.env[name];

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

const config = {
  CLIENT_IP: process.env.CLIENT_IP || "0.0.0.0",
  CLIENT_PROXY_PORT: parseIntegerEnv("CLIENT_PROXY_PORT", 27817, {
    min: 1,
    max: 65535,
  }),
  CLIENT_RESPONSE_PORT: parseIntegerEnv("CLIENT_RESPONSE_PORT", 27818, {
    min: 1,
    max: 65535,
  }),
  SERVER_IP: process.env.SERVER_IP || "127.0.0.1",
  SERVER_PORT: parseIntegerEnv("SERVER_PORT", 27817, {
    min: 1,
    max: 65535,
  }),
  MTU_SIZE: parseIntegerEnv("MTU_SIZE", 1450, {
    min: 1,
    max: 65507,
  }),
  TARGET_IP: process.env.TARGET_IP || "127.0.0.1",
  TARGET_PORT: parseIntegerEnv("TARGET_PORT", 443, {
    min: 1,
    max: 65535,
  }),
  CLIENT_RESPONSE_IP: process.env.CLIENT_RESPONSE_IP || "127.0.0.1",
};

export default config;
