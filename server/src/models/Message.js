import mongoose from "mongoose";

import { MESSAGE_SAFETY_FLAGS, MESSAGE_TYPES } from "../constants/statuses.js";

const attachmentSchema = new mongoose.Schema(
  {
    storageKey: {
      type: String,
      required: true,
      select: false,
      immutable: true,
    },
    mimeType: {
      type: String,
      enum: ["image/jpeg", "image/png", "image/webp"],
      required: true,
    },
  },
  { _id: false, minimize: false },
);

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      immutable: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    clientMessageId: {
      type: String,
      minlength: 16,
      maxlength: 100,
      required: true,
      immutable: true,
      select: false,
    },
    type: {
      type: String,
      enum: MESSAGE_TYPES,
      required: true,
      immutable: true,
    },
    content: { type: String, trim: true, maxlength: 2000, default: null },
    attachment: { type: attachmentSchema, default: null },
    safetyFlags: {
      type: [{ type: String, enum: MESSAGE_SAFETY_FLAGS }],
      default: [],
      select: false,
    },
    editedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, minimize: false },
);

messageSchema.pre("validate", function validateMessageShape() {
  const hasContent =
    typeof this.content === "string" && this.content.length > 0;
  if (this.type === "text" && (!hasContent || this.attachment)) {
    this.invalidate("type", "Text messages require content and no attachment");
  }
  if (this.type === "image" && !this.attachment) {
    this.invalidate("type", "Image messages require an attachment");
  }
});

messageSchema.index(
  { conversationId: 1, createdAt: -1, _id: -1 },
  { name: "message_conversation_created" },
);
messageSchema.index(
  { senderId: 1, clientMessageId: 1 },
  { name: "message_sender_client_unique", unique: true },
);

export const Message =
  mongoose.models.Message || mongoose.model("Message", messageSchema);
