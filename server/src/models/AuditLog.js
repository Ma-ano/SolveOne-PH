import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
      immutable: true,
    },
    targetType: {
      type: String,
      required: true,
      trim: true,
      maxlength: 60,
      immutable: true,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
      immutable: true,
    },
    ipHash: { type: String, required: true, select: false, immutable: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, minimize: false },
);

auditLogSchema.index(
  { targetType: 1, targetId: 1, createdAt: -1 },
  { name: "audit_target_created" },
);
auditLogSchema.index(
  { actorId: 1, createdAt: -1 },
  { name: "audit_actor_created" },
);
auditLogSchema.index({ createdAt: -1, _id: -1 }, { name: "audit_created" });

export const AuditLog =
  mongoose.models.AuditLog || mongoose.model("AuditLog", auditLogSchema);
