import { randomUUID } from "node:crypto";

const SAFE_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

export function requestId(req, res, next) {
  const suppliedId = req.get("x-request-id");
  req.id =
    suppliedId && SAFE_REQUEST_ID.test(suppliedId) ? suppliedId : randomUUID();
  res.setHeader("X-Request-Id", req.id);
  next();
}
