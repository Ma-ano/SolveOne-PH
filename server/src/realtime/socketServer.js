import { Server } from "socket.io";
import { z } from "zod";

import { createCorsOptions } from "../middleware/cors.js";

const joinSchema = z
  .object({
    conversationId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  })
  .strict();

function safeSocketError(error) {
  return {
    success: false,
    error: {
      code: error?.code ?? "REALTIME_REQUEST_FAILED",
      message:
        error?.statusCode && error.statusCode < 500
          ? error.message
          : "Realtime request failed",
    },
  };
}

export function createSocketServer({
  httpServer,
  authService,
  conversationService,
  publisher,
  config,
  logger,
}) {
  const io = new Server(httpServer, {
    cors: createCorsOptions(config.corsOrigins),
    maxHttpBufferSize: 100000,
  });

  attachSocketAuthorization({ io, authService, conversationService });

  io.engine.on("connection_error", (error) => {
    logger.warn({ errorCode: error.code }, "Realtime connection rejected");
  });
  publisher.attach(io);
  return io;
}

export function attachSocketAuthorization({
  io,
  authService,
  conversationService,
}) {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== "string" || !token) {
        const error = new Error("Authentication is required");
        error.data = { code: "AUTH_REQUIRED" };
        next(error);
        return;
      }
      socket.data.auth = await authService.authenticateAccessToken(token);
      socket.data.accessToken = token;
      next();
    } catch {
      const error = new Error("Authentication is required");
      error.data = { code: "AUTH_REQUIRED" };
      next(error);
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.data.auth.userId;
    socket.join(`user:${userId}`);
    const expiresAt = socket.data.auth.accessTokenExpiresAt;
    let expiryTimer;
    const sessionCheck = setInterval(async () => {
      try {
        await authService.authenticateAccessToken(socket.data.accessToken);
      } catch {
        socket.disconnect(true);
      }
    }, 30000);
    sessionCheck.unref?.();
    socket.on("disconnect", () => clearInterval(sessionCheck));
    if (expiresAt) {
      expiryTimer = setTimeout(
        () => socket.disconnect(true),
        Math.max(0, new Date(expiresAt).getTime() - Date.now()),
      );
      expiryTimer.unref?.();
      socket.on("disconnect", () => clearTimeout(expiryTimer));
    }

    socket.on("conversation:join", async (payload, acknowledge = () => {}) => {
      const parsed = joinSchema.safeParse(payload);
      if (!parsed.success) {
        acknowledge({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Conversation ID is invalid",
          },
        });
        return;
      }
      try {
        const currentAuth = await authService.authenticateAccessToken(
          socket.data.accessToken,
        );
        if (currentAuth.userId !== userId) {
          throw new Error("Socket principal changed");
        }
        const authorized = await conversationService.authorizeRealtime(
          userId,
          parsed.data.conversationId,
        );
        const room = `conversation:${authorized.conversationId}`;
        await socket.join(room);
        acknowledge({
          success: true,
          data: { conversationId: authorized.conversationId },
        });
      } catch (error) {
        acknowledge(safeSocketError(error));
      }
    });
  });
}

export function closeSocketServer(io) {
  return new Promise((resolve) => {
    io.close(() => resolve());
  });
}
