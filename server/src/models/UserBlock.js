import mongoose from "mongoose";

const userBlockSchema = new mongoose.Schema(
  {
    blockerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    blockedId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

userBlockSchema.index(
  { blockerId: 1, blockedId: 1 },
  { name: "user_block_unique", unique: true },
);
userBlockSchema.index(
  { blockedId: 1, blockerId: 1 },
  { name: "user_block_reverse_lookup" },
);
userBlockSchema.index(
  { blockerId: 1, createdAt: -1, _id: -1 },
  { name: "user_block_owner_created" },
);

export const UserBlock =
  mongoose.models.UserBlock || mongoose.model("UserBlock", userBlockSchema);
