import net from "node:net";

import { AppError } from "./AppError.js";

function scannerUnavailable() {
  return new AppError({
    statusCode: 503,
    code: "IDENTITY_SCANNER_UNAVAILABLE",
    message: "Identity document safety screening is unavailable",
  });
}

export function buildClamdRequest(bytes) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length);
  return Buffer.concat([
    Buffer.from("zINSTREAM\0", "ascii"),
    length,
    bytes,
    Buffer.alloc(4),
  ]);
}

export function parseClamdResult(response) {
  if (/^stream: OK$/.test(response)) return true;
  if (/^stream: .+ FOUND$/.test(response))
    throw new AppError({
      statusCode: 422,
      code: "IDENTITY_DOCUMENT_UNSAFE",
      message: "This document cannot be accepted for safety reasons",
    });
  throw scannerUnavailable();
}

export class IdentityScanner {
  constructor(config = {}, connect = net.createConnection) {
    this.socketPath = config.identityScannerSocket;
    this.port = config.identityScannerPort;
    this.connect = connect;
  }

  async scan(bytes) {
    if (!Buffer.isBuffer(bytes) || (!this.socketPath && !this.port))
      throw scannerUnavailable();
    return new Promise((resolve, reject) => {
      let settled = false;
      let response = Buffer.alloc(0);
      let socket;
      try {
        socket = this.socketPath
          ? this.connect({ path: this.socketPath })
          : this.connect({ host: "127.0.0.1", port: this.port });
      } catch {
        reject(scannerUnavailable());
        return;
      }
      const finish = (error) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (error) reject(error);
        else resolve(true);
      };
      socket.setTimeout(10000);
      socket.on("connect", () => {
        socket.write(buildClamdRequest(bytes));
      });
      socket.on("data", (chunk) => {
        response = Buffer.concat([response, chunk]);
        if (response.length > 512) {
          finish(scannerUnavailable());
          return;
        }
        const end = response.indexOf(0);
        if (end < 0) return;
        try {
          parseClamdResult(response.toString("utf8", 0, end));
          finish();
        } catch (error) {
          finish(error);
        }
      });
      socket.on("timeout", () => finish(scannerUnavailable()));
      socket.on("error", () => finish(scannerUnavailable()));
      socket.on("close", () => finish(scannerUnavailable()));
    });
  }
}
