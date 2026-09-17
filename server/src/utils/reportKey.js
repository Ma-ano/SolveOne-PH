import { createHash } from "node:crypto";

export function createReportActiveKey({ reporterId, targetType, targetId }) {
  return createHash("sha256")
    .update(`${targetType}:${targetId}:reporter:${reporterId}`)
    .digest("hex");
}
