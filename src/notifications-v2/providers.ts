/**
 * Email, push and SMS delivery through the providers' HTTP APIs.
 *
 * Supported: SendGrid and Mailgun (email), Firebase Cloud Messaging and
 * OneSignal (push), Twilio (SMS). Other providers, and providers without
 * credentials, fail with an explanatory error rather than pretending to
 * deliver.
 */

import { createSign } from "crypto";
import { requestUserUrl, OutboundResponse } from "../security/outbound";
import {
  EmailConfig,
  EmailDeliveryResult,
  EmailMessage,
  PushConfig,
  PushDeliveryResult,
  PushMessage,
  SmsConfig,
  SmsDeliveryResult,
  SmsMessage,
} from "./types";

/** Provider API endpoints; overridable for testing */
export interface DeliveryEndpoints {
  sendgrid: string;
  mailgun: string;
  googleOAuth: string;
  fcm: string;
  onesignal: string;
  twilio: string;
}

export const DEFAULT_ENDPOINTS: DeliveryEndpoints = {
  sendgrid: "https://api.sendgrid.com/v3",
  mailgun: "https://api.mailgun.net/v3",
  googleOAuth: "https://oauth2.googleapis.com",
  fcm: "https://fcm.googleapis.com/v1",
  onesignal: "https://onesignal.com/api/v1",
  twilio: "https://api.twilio.com/2010-04-01",
};

const TIMEOUT_MS = 10_000;

async function call(
  url: string,
  headers: Record<string, string>,
  body: string
): Promise<OutboundResponse> {
  const response = await requestUserUrl(url, { method: "POST", headers, body, timeoutMs: TIMEOUT_MS });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`HTTP ${response.status}: ${response.body.slice(0, 200)}`);
  }
  return response;
}

const json = (payload: unknown) => JSON.stringify(payload);
const form = (fields: Record<string, string>) => new URLSearchParams(fields).toString();
const basic = (user: string, password: string) =>
  `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;

// ============================================================================
// EMAIL
// ============================================================================

export async function deliverEmail(
  config: EmailConfig | undefined,
  message: EmailMessage,
  endpoints: DeliveryEndpoints
): Promise<EmailDeliveryResult> {
  if (!config?.apiKey) {
    throw new Error("Email is not configured (set EMAIL_PROVIDER and its API key)");
  }

  switch (config.provider) {
    case "sendgrid": {
      const response = await call(
        `${endpoints.sendgrid}/mail/send`,
        { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        json({
          personalizations: [{ to: [{ email: message.to, name: message.toName }] }],
          from: { email: config.fromEmail, name: config.fromName },
          reply_to: message.replyTo || config.replyTo ? { email: message.replyTo || config.replyTo } : undefined,
          subject: message.subject,
          content: [
            { type: "text/plain", value: message.text },
            ...(message.html ? [{ type: "text/html", value: message.html }] : []),
          ],
          categories: message.tags,
          custom_args: message.metadata,
        })
      );
      return { success: true, messageId: String(response.headers["x-message-id"] ?? "") || undefined };
    }

    case "mailgun": {
      const domain = config.domain || config.fromEmail.split("@")[1];
      const fields: Record<string, string> = {
        from: `${config.fromName} <${config.fromEmail}>`,
        to: message.toName ? `${message.toName} <${message.to}>` : message.to,
        subject: message.subject,
        text: message.text,
      };
      if (message.html) fields.html = message.html;
      if (message.replyTo || config.replyTo) fields["h:Reply-To"] = (message.replyTo || config.replyTo)!;
      const response = await call(
        `${endpoints.mailgun}/${encodeURIComponent(domain)}/messages`,
        { Authorization: basic("api", config.apiKey), "Content-Type": "application/x-www-form-urlencoded" },
        form(fields)
      );
      return { success: true, messageId: JSON.parse(response.body).id };
    }

    default:
      throw new Error(`Email provider "${config.provider}" is not supported (use sendgrid or mailgun)`);
  }
}

// ============================================================================
// PUSH
// ============================================================================

const googleTokens = new Map<string, { token: string; expiresAt: number }>();

/** OAuth access token for a Firebase service account (JWT bearer grant) */
async function firebaseAccessToken(
  firebase: NonNullable<PushConfig["firebaseConfig"]>,
  endpoints: DeliveryEndpoints
): Promise<string> {
  const cached = googleTokens.get(firebase.clientEmail);
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;

  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
    iss: firebase.clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  // Keys from environment variables often carry literal "\n"
  const key = firebase.privateKey.replace(/\\n/g, "\n");
  const signature = createSign("RSA-SHA256").update(unsigned).sign(key).toString("base64url");

  const response = await call(
    `${endpoints.googleOAuth}/token`,
    { "Content-Type": "application/x-www-form-urlencoded" },
    form({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` })
  );
  const result = JSON.parse(response.body);
  googleTokens.set(firebase.clientEmail, {
    token: result.access_token,
    expiresAt: Date.now() + Number(result.expires_in ?? 3600) * 1000,
  });
  return result.access_token;
}

export async function deliverPush(
  config: PushConfig | undefined,
  message: PushMessage,
  endpoints: DeliveryEndpoints
): Promise<PushDeliveryResult> {
  switch (config?.provider) {
    case "firebase": {
      const firebase = config.firebaseConfig;
      if (!firebase?.projectId || !firebase.privateKey || !firebase.clientEmail) {
        throw new Error("Push is not configured (set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY)");
      }
      const accessToken = await firebaseAccessToken(firebase, endpoints);

      const failedTokens: string[] = [];
      let lastError: string | undefined;
      for (const token of message.tokens) {
        try {
          await call(
            `${endpoints.fcm}/projects/${encodeURIComponent(firebase.projectId)}/messages:send`,
            { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            json({
              message: {
                token,
                notification: { title: message.title, body: message.body, image: message.imageUrl },
                data: message.data,
                android: message.ttl ? { ttl: `${message.ttl}s` } : undefined,
              },
            })
          );
        } catch (error) {
          failedTokens.push(token);
          lastError = (error as Error).message;
        }
      }
      return pushResult(message.tokens.length, failedTokens, lastError);
    }

    case "onesignal": {
      const onesignal = config.oneSignalConfig;
      if (!onesignal?.appId || !onesignal.apiKey) {
        throw new Error("Push is not configured (set ONESIGNAL_APP_ID and ONESIGNAL_API_KEY)");
      }
      const response = await call(
        `${endpoints.onesignal}/notifications`,
        { Authorization: `Basic ${onesignal.apiKey}`, "Content-Type": "application/json" },
        json({
          app_id: onesignal.appId,
          include_player_ids: message.tokens,
          headings: { en: message.title },
          contents: { en: message.body },
          data: message.data,
          url: message.clickAction,
        })
      );
      const result = JSON.parse(response.body);
      const invalid: string[] = Array.isArray(result.errors?.invalid_player_ids) ? result.errors.invalid_player_ids : [];
      return pushResult(message.tokens.length, invalid, invalid.length ? "Invalid device tokens" : undefined);
    }

    default:
      throw new Error(
        config ? `Push provider "${config.provider}" is not supported (use firebase or onesignal)` : "Push is not configured"
      );
  }
}

function pushResult(total: number, failedTokens: string[], error?: string): PushDeliveryResult {
  if (failedTokens.length === total) {
    throw new Error(error ?? "Push delivery failed");
  }
  return {
    success: true,
    successCount: total - failedTokens.length,
    failureCount: failedTokens.length,
    failedTokens,
    error,
  };
}

// ============================================================================
// SMS
// ============================================================================

export async function deliverSms(
  config: SmsConfig | undefined,
  message: SmsMessage,
  endpoints: DeliveryEndpoints
): Promise<SmsDeliveryResult> {
  if (!config) {
    throw new Error("SMS is not configured (set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER)");
  }
  if (config.provider !== "twilio") {
    throw new Error(`SMS provider "${config.provider}" is not supported (use twilio)`);
  }
  if (!config.accountSid || !config.authToken || !config.fromNumber) {
    throw new Error("SMS is not configured (set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER)");
  }

  const fields: Record<string, string> = { To: message.to, From: config.fromNumber, Body: message.body };
  if (message.mediaUrl) fields.MediaUrl = message.mediaUrl;
  const response = await call(
    `${endpoints.twilio}/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`,
    { Authorization: basic(config.accountSid, config.authToken), "Content-Type": "application/x-www-form-urlencoded" },
    form(fields)
  );
  return { success: true, messageId: JSON.parse(response.body).sid };
}
