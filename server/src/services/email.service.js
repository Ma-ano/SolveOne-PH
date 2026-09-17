import { createHash } from "node:crypto";

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character];
  });
}

function recipientHash(email) {
  return createHash("sha256").update(email).digest("hex").slice(0, 12);
}

export function createEmailService(
  config,
  logger,
  fetchImplementation = fetch,
) {
  async function deliver({ to, subject, text, html, template }) {
    if (config.emailProvider === "console") {
      logger.info(
        { template, recipientHash: recipientHash(to) },
        "Development email delivery recorded without message content",
      );
      return;
    }

    const response = await fetchImplementation(
      "https://api.resend.com/emails",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.emailApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: config.emailFrom,
          to: [to],
          subject,
          text,
          html,
        }),
      },
    );

    if (!response.ok) {
      throw new Error("Transactional email provider rejected delivery");
    }
  }

  return Object.freeze({
    sendEmailVerification({ to, firstName, token }) {
      const link = `${config.frontendOrigin}/verify-email?token=${encodeURIComponent(token)}`;
      const safeName = escapeHtml(firstName);
      return deliver({
        to,
        template: "email_verification",
        subject: "Verify your SolveOne PH email",
        text: `Hello ${firstName}, verify your email: ${link}`,
        html: `<p>Hello ${safeName},</p><p><a href="${link}">Verify your SolveOne PH email</a>.</p>`,
      });
    },

    sendPasswordReset({ to, firstName, token }) {
      const link = `${config.frontendOrigin}/reset-password?token=${encodeURIComponent(token)}`;
      const safeName = escapeHtml(firstName);
      return deliver({
        to,
        template: "password_reset",
        subject: "Reset your SolveOne PH password",
        text: `Hello ${firstName}, reset your password: ${link}`,
        html: `<p>Hello ${safeName},</p><p><a href="${link}">Reset your SolveOne PH password</a>.</p>`,
      });
    },
  });
}
