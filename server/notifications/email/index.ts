import "dotenv/config";
import nodemailer from "nodemailer";

export type EmailConfig = {
  from: string;
  host: string;
  pass: string;
  port: number;
  secure: boolean;
  to: string[];
  user: string;
};

export type SendEmailInput = {
  from?: string;
  html?: string;
  subject: string;
  text: string;
  to?: string | string[];
};

export type SendEmailResult = {
  accepted: string[];
  messageId: string;
  rejected: string[];
};

const requiredEnvKeys = [
  "TDX_MAIL_SMTP_HOST",
  "TDX_MAIL_SMTP_PORT",
  "TDX_MAIL_SMTP_USER",
  "TDX_MAIL_SMTP_PASS",
  "TDX_MAIL_FROM",
  "TDX_MAIL_TO",
] as const;

function envValue(env: NodeJS.ProcessEnv, key: (typeof requiredEnvKeys)[number]) {
  return env[key]?.trim() ?? "";
}

function parseRecipients(value: string) {
  return value
    .split(/[,\n;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseSecureFlag(value: string | undefined, port: number) {
  if (!value?.trim()) return port === 465;
  return ["1", "true", "yes", "y"].includes(value.trim().toLowerCase());
}

export function readEmailConfig(env: NodeJS.ProcessEnv = process.env): EmailConfig {
  const missing = requiredEnvKeys.filter((key) => !envValue(env, key));
  if (missing.length > 0) {
    throw new Error(`Missing email configuration: ${missing.join(", ")}`);
  }

  const port = Number(envValue(env, "TDX_MAIL_SMTP_PORT"));
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("Invalid email configuration: TDX_MAIL_SMTP_PORT must be a positive integer");
  }

  const to = parseRecipients(envValue(env, "TDX_MAIL_TO"));
  if (to.length === 0) {
    throw new Error("Invalid email configuration: TDX_MAIL_TO must contain at least one recipient");
  }

  return {
    from: envValue(env, "TDX_MAIL_FROM"),
    host: envValue(env, "TDX_MAIL_SMTP_HOST"),
    pass: envValue(env, "TDX_MAIL_SMTP_PASS"),
    port,
    secure: parseSecureFlag(env.TDX_MAIL_SMTP_SECURE, port),
    to,
    user: envValue(env, "TDX_MAIL_SMTP_USER"),
  };
}

export async function sendEmail(input: SendEmailInput, config = readEmailConfig()): Promise<SendEmailResult> {
  const recipients = Array.isArray(input.to) ? input.to : input.to ? parseRecipients(input.to) : config.to;
  if (recipients.length === 0) {
    throw new Error("Email recipient is required");
  }

  const transporter = nodemailer.createTransport({
    auth: {
      pass: config.pass,
      user: config.user,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    host: config.host,
    port: config.port,
    secure: config.secure,
    socketTimeout: 20_000,
  });

  const result = await transporter.sendMail({
    from: input.from ?? config.from,
    html: input.html,
    subject: input.subject,
    text: input.text,
    to: recipients,
  });

  return {
    accepted: result.accepted.map(String),
    messageId: result.messageId,
    rejected: result.rejected.map(String),
  };
}
