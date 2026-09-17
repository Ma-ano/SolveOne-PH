import mongoose from "mongoose";

import { CONVERSATION_STATUSES } from "../constants/statuses.js";

const readStateSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    lastReadMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    lastReadMessageAt: { type: Date, default: null },
  },
  { _id: false, minimize: false },
);

const conversationSchema = new mongoose.Schema(
  {
    participants: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
          immutable: true,
        },
      ],
      required: true,
      immutable: true,
      validate: {
        validator(participants) {
          return (
            participants.length === 2 &&
            new Set(participants.map(String)).size === 2
          );
        },
        message: "A conversation requires two distinct participants",
      },
    },
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "HelpRequest",
      required: true,
      immutable: true,
    },
    offerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "HelpOffer",
      required: true,
      immutable: true,
    },
    status: {
      type: String,
      enum: CONVERSATION_STATUSES,
      default: "active",
      required: true,
    },
    readStates: {
      type: [readStateSchema],
      required: true,
      validate: {
        validator(states) {
          return (
            states.length === 2 &&
            new Set(states.map((state) => String(state.userId))).size === 2
          );
        },
        message: "Read state is required for both participants",
      },
    },
    lastMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    lastMessageAt: { type: Date, required: true },
  },
  { timestamps: true, minimize: false },
);

conversationSchema.index(
  { offerId: 1 },
  { name: "conversation_offer_unique", unique: true },
);
conversationSchema.index(
  { participants: 1, lastMessageAt: -1, _id: -1 },
  { name: "conversation_participant_activity" },
);
conversationSchema.index(
  { requestId: 1, createdAt: -1 },
  { name: "conversation_request_created" },
);

export const Conversation =
  mongoose.models.Conversation ||
  mongoose.model("Conversation", conversationSchema);
