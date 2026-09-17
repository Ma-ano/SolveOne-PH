export const USER_ROLES = Object.freeze(["user", "moderator", "admin"]);

export const ACCOUNT_STATUSES = Object.freeze([
  "active",
  "suspended",
  "disabled",
]);

export const VERIFICATION_LEVELS = Object.freeze([
  "UNVERIFIED",
  "EMAIL_VERIFIED",
  "IDENTITY_VERIFIED",
  "PARTNER_VERIFIED",
]);

export const VERIFICATION_RECORD_STATUSES = Object.freeze([
  "pending",
  "approved",
  "rejected",
  "expired",
]);

export const VERIFICATION_DOCUMENT_TYPES = Object.freeze([
  "image/jpeg",
  "image/png",
]);

export const DONATION_CHECKOUT_STATES = Object.freeze([
  "creating",
  "ready",
  "attention",
]);

export const HELP_TYPES = Object.freeze(["money", "item", "skill", "time"]);

export const REQUEST_URGENCIES = Object.freeze([
  "normal",
  "important",
  "time_sensitive",
]);

export const REQUEST_VISIBILITIES = Object.freeze(["public"]);

export const REQUEST_SAFETY_FLAGS = Object.freeze([
  "vague_money_request",
  "gambling",
  "weapons",
  "illegal_goods",
  "drugs",
  "sexual_services",
  "account_selling",
  "credential_request",
  "investment_scheme",
  "loan_sharking",
  "suspicious_crypto",
  "illegal_behavior",
  "immediate_danger",
  "medical_emergency",
  "self_harm",
  "violence",
]);

export const REQUEST_MODERATION_ACTIONS = Object.freeze([
  "request_approved",
  "request_rejected",
  "request_changes_requested",
]);

export const HELP_REQUEST_STATUSES = Object.freeze([
  "draft",
  "pending_review",
  "changes_requested",
  "published",
  "partially_solved",
  "solved",
  "cancelled",
  "rejected",
  "expired",
]);

export const HELP_OFFER_STATUSES = Object.freeze([
  "pending",
  "accepted",
  "rejected",
  "withdrawn",
  "in_progress",
  "completion_submitted",
  "completed",
  "disputed",
  "cancelled",
]);

export const MESSAGE_TYPES = Object.freeze(["text", "image", "system"]);

export const CONVERSATION_STATUSES = Object.freeze(["active", "closed"]);

export const NOTIFICATION_KINDS = Object.freeze([
  "offer_received",
  "offer_accepted",
  "offer_rejected",
  "completion_submitted",
  "completion_confirmed",
  "completion_disputed",
  "message_received",
  "request_approved",
  "request_changes_requested",
  "request_rejected",
  "identity_approved",
  "identity_rejected",
  "giveaway_reserved",
  "giveaway_confirmation_needed",
  "giveaway_handoff_completed",
  "giveaway_reservation_cancelled",
  "mission_approved",
  "mission_changes_requested",
  "mission_rejected",
  "mission_contribution_received",
  "mission_contribution_accepted",
  "mission_contribution_rejected",
  "mission_completion_submitted",
  "mission_contribution_completed",
  "mission_completed",
  "mission_cancelled",
]);

export const NOTIFICATION_RESOURCE_TYPES = Object.freeze([
  "offer",
  "request",
  "conversation",
  "verification",
  "giveaway_item",
  "giveaway_reservation",
  "community_mission",
  "mission_contribution",
]);

export const MESSAGE_SAFETY_FLAGS = Object.freeze([
  "credential_request",
  "suspicious_payment",
  "harassment",
  "phone_spam",
]);

export const REPORT_TARGET_TYPES = Object.freeze([
  "request",
  "user",
  "offer",
  "message",
  "giveaway_item",
  "community_mission",
]);

export const MESSAGE_REPORT_REASONS = Object.freeze([
  "credential_request",
  "suspicious_payment",
  "harassment",
  "spam",
  "other",
]);

export const USER_REPORT_REASONS = Object.freeze([
  "scam",
  "impersonation",
  "harassment",
  "unsafe_contact",
  "spam",
  "other",
]);

export const REQUEST_REPORT_REASONS = Object.freeze([
  "scam",
  "prohibited_content",
  "privacy_exposure",
  "dangerous_activity",
  "child_safety",
  "duplicate",
  "other",
]);

export const AUTH_TOKEN_TYPES = Object.freeze([
  "email_verification",
  "password_reset",
]);

export const SESSION_PLATFORMS = Object.freeze([
  "android",
  "ios",
  "web",
  "unknown",
]);

export const SECURITY_EVENT_TYPES = Object.freeze([
  "login_failed",
  "refresh_token_reuse",
  "password_reset_completed",
  "account_closed",
]);

export const PLATFORM_DONATION_STATUSES = Object.freeze([
  "pending",
  "paid",
  "failed",
  "expired",
  "refunded",
]);

export const REPORT_STATUSES = Object.freeze([
  "open",
  "reviewing",
  "resolved",
  "dismissed",
]);

export const GIVEAWAY_ITEM_CONDITIONS = Object.freeze([
  "new",
  "good",
  "used",
  "needs_minor_repair",
]);

export const GIVEAWAY_ITEM_STATUSES = Object.freeze([
  "available",
  "reserved",
  "given",
  "removed",
]);

export const GIVEAWAY_RESERVATION_STATUSES = Object.freeze([
  "reserved",
  "completed",
  "cancelled",
]);

export const COMMUNITY_MISSION_STATUSES = Object.freeze([
  "draft",
  "pending_review",
  "changes_requested",
  "published",
  "in_progress",
  "completed",
  "cancelled",
  "rejected",
]);

export const MISSION_VERIFICATION_STATUSES = Object.freeze([
  "unverified",
  "pending",
  "verified",
  "rejected",
]);

export const MISSION_RESOURCE_TYPES = Object.freeze(["item", "skill", "time"]);

export const MISSION_CONTRIBUTION_STATUSES = Object.freeze([
  "pending",
  "accepted",
  "rejected",
  "withdrawn",
  "in_progress",
  "completion_submitted",
  "completed",
  "cancelled",
]);
