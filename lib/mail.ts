import nodemailer, { type Transporter } from "nodemailer";

/**
 * Outgoing email over plain SMTP, so any provider works (Resend, Brevo, Gmail with an app password, the
 * hosting's own mailbox…). Configured with environment variables:
 *
 *   SMTP_HOST, SMTP_PORT (587 by default; 465 means TLS from the start), SMTP_USER, SMTP_PASS,
 *   MAIL_FROM ("Rifas <rifas@tu-dominio.com>"; defaults to SMTP_USER).
 *
 * Without SMTP_HOST email is simply off: nothing is sent and nothing fails.
 */

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Where the buyer's reply goes (the organizer's contact email). */
  replyTo?: string | null;
}

let transporter: Transporter | null | undefined;

/** Lazy for the same reason as lib/push.ts: `next build` evaluates modules before runtime env exists. */
function getTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter;
  const host = process.env.SMTP_HOST;
  if (!host) {
    transporter = null;
    return null;
  }
  const port = Number(process.env.SMTP_PORT || 587);
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" } : undefined,
    // A slow mail server must never hold up a request for long (sends are fire-and-forget anyway).
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    // Test-only: lets a local mock SMTP server with a self-signed certificate stand in.
    ...(process.env.SMTP_ALLOW_INSECURE_TLS === "true" ? { tls: { rejectUnauthorized: false } } : {}),
  });
  return transporter;
}

export function mailEnabled(): boolean {
  return getTransporter() !== null;
}

/** Sends one email. Never throws: returns whether the server accepted it. */
export async function sendMail(message: MailMessage): Promise<boolean> {
  const t = getTransporter();
  if (!t) return false;
  try {
    await t.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
    });
    return true;
  } catch (err) {
    console.error("[mail] could not send:", err instanceof Error ? err.message : err);
    return false;
  }
}

/** A plausible single address (what the forms accept). */
export const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;
