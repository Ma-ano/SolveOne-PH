import { describe, expect, it, vi } from "vitest";

import { attachSocketAuthorization } from "../src/realtime/socketServer.js";
import { AppError } from "../src/utils/AppError.js";

function harness({ authenticate, authorize }) {
  const listeners = {};
  let middleware;
  const io = {
    use(handler) {
      middleware = handler;
    },
    on(event, handler) {
      listeners[event] = handler;
    },
  };
  attachSocketAuthorization({
    io,
    authService: { authenticateAccessToken: authenticate },
    conversationService: { authorizeRealtime: authorize },
  });
  return { listeners, middleware };
}

describe("Socket.IO authorization", () => {
  it("rejects missing tokens during the connection handshake", async () => {
    const { middleware } = harness({
      authenticate: vi.fn(),
      authorize: vi.fn(),
    });
    const next = vi.fn();
    await middleware({ handshake: { auth: {} }, data: {} }, next);
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toMatchObject({
      message: "Authentication is required",
      data: { code: "AUTH_REQUIRED" },
    });
  });

  it("joins only derived user and authorized conversation rooms", async () => {
    const authenticate = vi.fn().mockResolvedValue({
      userId: "111111111111111111111111",
    });
    const authorize = vi.fn().mockImplementation((userId, conversationId) => {
      if (conversationId === "222222222222222222222222") {
        return { conversationId };
      }
      throw new AppError({
        statusCode: 404,
        code: "CONVERSATION_NOT_FOUND",
        message: "Conversation not found",
      });
    });
    const { listeners, middleware } = harness({ authenticate, authorize });
    const socketListeners = {};
    const socket = {
      handshake: { auth: { token: "signed-access-token" } },
      data: {},
      join: vi.fn().mockResolvedValue(undefined),
      on(event, handler) {
        socketListeners[event] = handler;
      },
    };
    const next = vi.fn();
    await middleware(socket, next);
    expect(next).toHaveBeenCalledWith();
    listeners.connection(socket);
    expect(socket.join).toHaveBeenCalledWith("user:111111111111111111111111");

    const accepted = vi.fn();
    await socketListeners["conversation:join"](
      { conversationId: "222222222222222222222222" },
      accepted,
    );
    expect(authorize).toHaveBeenCalledWith(
      "111111111111111111111111",
      "222222222222222222222222",
    );
    expect(socket.join).toHaveBeenCalledWith(
      "conversation:222222222222222222222222",
    );
    expect(accepted).toHaveBeenCalledWith({
      success: true,
      data: { conversationId: "222222222222222222222222" },
    });

    const denied = vi.fn();
    await socketListeners["conversation:join"](
      { conversationId: "333333333333333333333333" },
      denied,
    );
    expect(denied).toHaveBeenCalledWith({
      success: false,
      error: {
        code: "CONVERSATION_NOT_FOUND",
        message: "Conversation not found",
      },
    });
    expect(socket.join).not.toHaveBeenCalledWith(
      "conversation:333333333333333333333333",
    );
  });
});
