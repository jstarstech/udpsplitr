import dotenv from "dotenv";

dotenv.config();

const config = {
  CLIENT_IP: process.env.CLIENT_IP || "0.0.0.0",
  CLIENT_PROXY_PORT: Number(process.env.CLIENT_PROXY_PORT) || 27817,
  CLIENT_RESPONSE_PORT: Number(process.env.CLIENT_RESPONSE_PORT) || 27818,
  SERVER_IP: process.env.SERVER_IP || "192.168.1.1",
  SERVER_PORT: Number(process.env.SERVER_PORT) || 27817,
  MTU_SIZE: Number(process.env.MTU_SIZE) || 1450,
  TARGET_IP: process.env.TARGET_IP || "127.0.0.1",
  TARGET_PORT: Number(process.env.TARGET_PORT) || 443,
  CLIENT_RESPONSE_IP: process.env.CLIENT_RESPONSE_IP || "192.168.99.100"
};

export default config;
