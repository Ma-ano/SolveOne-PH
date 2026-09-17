import {
  serializeOwnPrivacyRequest,
  serializePrivacyRequestDetail,
  serializePrivacyRequestQueueItem,
} from "../serializers/privacyRequest.serializer.js";
import { AppError } from "../utils/AppError.js";
import { hashIpAddress } from "../utils/authCrypto.js";
import { decodePageCursor, encodePageCursor } from "../utils/pageCursor.js";

function privacyError(statusCode, code, message) {
  return new AppError({ statusCode, code, message });
}

function pageInfo(result, scope) {
  const last = result.items.at(-1);
  return {
    hasNextPage: result.hasNextPage,
    nextCursor:
      result.hasNextPage && last
        ? encodePageCursor({ scope, date: last.createdAt, id: last._id })
        : null,
  };
}

export class PrivacyRequestService {
  constructor({ repository, config, clock = () => new Date() }) {
    this.repository = repository;
    this.config = config;
    this.clock = clock;
  }

  ipHash(ipAddress) {
    return hashIpAddress(ipAddress, this.config.ipHashSecret);
  }

  requireAdmin(actor) {
    if (actor.role !== "admin")
      throw privacyError(
        403,
        "FORBIDDEN",
        "Administrator permission is required",
      );
  }

  async submit(requesterId, input, context) {
    const result = await this.repository.submit({
      requesterId,
      requestType: input.requestType,
      details: input.details,
      privacyPolicyVersion: this.config.privacyVersion,
      ipHash: this.ipHash(context?.ipAddress),
      now: this.clock(),
    });
    return {
      request: serializeOwnPrivacyRequest(result.request),
      duplicate: result.outcome === "duplicate",
    };
  }

  async listOwner(requesterId, query) {
    const scope = `privacy-owner:${requesterId}`;
    const result = await this.repository.listOwner({
      requesterId,
      limit: query.limit,
      cursor: decodePageCursor(query.cursor, scope),
    });
    return {
      items: result.items.map(serializeOwnPrivacyRequest),
      pageInfo: pageInfo(result, scope),
    };
  }

  async getOwner(requesterId, requestId) {
    const request = await this.repository.findOwner({ requesterId, requestId });
    if (!request)
      throw privacyError(404, "PRIVACY_REQUEST_NOT_FOUND", "Request not found");
    return { request: serializeOwnPrivacyRequest(request) };
  }

  async cancel(requesterId, requestId, context) {
    const result = await this.repository.cancel({
      requesterId,
      requestId,
      ipHash: this.ipHash(context?.ipAddress),
      now: this.clock(),
    });
    if (result.outcome === "not_found")
      throw privacyError(404, "PRIVACY_REQUEST_NOT_FOUND", "Request not found");
    if (result.outcome === "unavailable")
      throw privacyError(
        409,
        "PRIVACY_REQUEST_CANNOT_BE_CANCELLED",
        "Only an unclaimed submitted request can be cancelled",
      );
    return { request: serializeOwnPrivacyRequest(result.request) };
  }

  async listAdmin(actor, query) {
    this.requireAdmin(actor);
    const scope = `privacy-admin:${query.status}:${query.requestType ?? ""}`;
    const result = await this.repository.listAdmin({
      ...query,
      cursor: decodePageCursor(query.cursor, scope),
    });
    return {
      items: result.items.map((item) =>
        serializePrivacyRequestQueueItem(item, actor.userId),
      ),
      pageInfo: pageInfo(result, scope),
    };
  }

  async getAdmin(actor, requestId) {
    this.requireAdmin(actor);
    const request = await this.repository.findAdmin(requestId);
    if (!request)
      throw privacyError(404, "PRIVACY_REQUEST_NOT_FOUND", "Request not found");
    return { request: serializePrivacyRequestDetail(request, actor.userId) };
  }

  async claim(actor, requestId, context) {
    this.requireAdmin(actor);
    const result = await this.repository.claim({
      actorId: actor.userId,
      requestId,
      ipHash: this.ipHash(context?.ipAddress),
      now: this.clock(),
    });
    if (result.outcome === "not_found")
      throw privacyError(404, "PRIVACY_REQUEST_NOT_FOUND", "Request not found");
    if (result.outcome === "unavailable")
      throw privacyError(
        409,
        "PRIVACY_REQUEST_ALREADY_CLAIMED",
        "This request is unavailable for assignment",
      );
    return {
      request: serializeOwnPrivacyRequest(result.request),
      duplicate: Boolean(result.duplicate),
    };
  }

  async release(actor, requestId, context) {
    this.requireAdmin(actor);
    const result = await this.repository.release({
      actorId: actor.userId,
      requestId,
      ipHash: this.ipHash(context?.ipAddress),
      now: this.clock(),
    });
    if (result.outcome === "not_found")
      throw privacyError(404, "PRIVACY_REQUEST_NOT_FOUND", "Request not found");
    if (result.outcome === "unavailable")
      throw privacyError(
        409,
        "PRIVACY_REQUEST_NOT_ASSIGNED",
        "Only the assigned administrator can release this request",
      );
    return { request: serializeOwnPrivacyRequest(result.request) };
  }

  async resolve(actor, requestId, input, context) {
    this.requireAdmin(actor);
    const result = await this.repository.resolve({
      actorId: actor.userId,
      requestId,
      outcome: input.outcome,
      resolutionSummary: input.resolutionSummary,
      ipHash: this.ipHash(context?.ipAddress),
      now: this.clock(),
    });
    if (result.outcome === "not_found")
      throw privacyError(404, "PRIVACY_REQUEST_NOT_FOUND", "Request not found");
    if (result.outcome === "unavailable")
      throw privacyError(
        409,
        "PRIVACY_REQUEST_NOT_ASSIGNED",
        "Only the assigned administrator can resolve an in-review request",
      );
    return { request: serializeOwnPrivacyRequest(result.request) };
  }
}
