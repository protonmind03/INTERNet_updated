import nodemailer from "nodemailer";

/*
|--------------------------------------------------------------------------
| SENDING EMAIL
|--------------------------------------------------------------------------
|
| Two ways out, tried in this order:
|
|   1. An email provider's HTTPS API, when EMAIL_PROVIDER and EMAIL_API_KEY
|      are set. This is the one that works on the hosting platform, which
|      closes the SMTP ports to outbound traffic on its smaller plans.
|   2. SMTP, when the five SMTP_* settings are set.
|
| With neither, email is "not configured" and everything that would send
| one says so or stays quiet, exactly as before. The sender address is
| SMTP_FROM either way.
|
| Adding a provider is one entry in PROVIDERS: how to turn an email into
| that provider's request. Nothing here logs the API key or who an email
| was sent to.
|
*/

export type Email = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

type ProviderRequest = { url: string; headers: Record<string, string>; body: unknown };

/** One provider: the request that sends `email` from `from` with `key`. */
type Provider = (email: Email, from: string, key: string) => ProviderRequest;

const PROVIDERS: Record<string, Provider> = {
  resend: (email, from, key) => ({
    url: "https://api.resend.com/emails",
    headers: { Authorization: `Bearer ${key}` },
    body: {
      from,
      to: [email.to],
      subject: email.subject,
      text: email.text,
      ...(email.html ? { html: email.html } : {}),
    },
  }),
};

/** How long the provider is given to answer, matching the SMTP socket timeout. */
const API_TIMEOUT_MS = 20_000;

type Env = NodeJS.ProcessEnv;

/** The provider named in the settings, if it is one this server knows. */
function namedProvider(env: Env): string | null {
  const name = (env.EMAIL_PROVIDER || "").trim().toLowerCase();
  return name in PROVIDERS ? name : null;
}

function apiConfigured(env: Env): boolean {
  return Boolean(namedProvider(env) && env.EMAIL_API_KEY && env.SMTP_FROM);
}

function smtpConfigured(env: Env): boolean {
  return Boolean(
    env.SMTP_HOST && env.SMTP_PORT && env.SMTP_FROM && env.SMTP_USER && env.SMTP_PASSWORD
  );
}

/** "api", "smtp", or null when no email can be sent. */
export function emailRoute(env: Env = process.env): "api" | "smtp" | null {
  if (apiConfigured(env)) return "api";
  if (smtpConfigured(env)) return "smtp";
  return null;
}

export function isEmailConfigured(env: Env = process.env): boolean {
  return emailRoute(env) !== null;
}

/** The old name, kept for one round. Email may now go out by either route. */
export const isSmtpConfigured = (): boolean => isEmailConfigured();

/** The provider's own explanation of a refusal, when its answer carries one. */
function refusalText(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const { message, error } = body as { message?: unknown; error?: unknown };
  const text =
    typeof message === "string"
      ? message
      : typeof error === "string"
        ? error
        : error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string"
          ? (error as { message: string }).message
          : "";
  return text.slice(0, 200);
}

/**
 * Sends one email through the provider's HTTPS API. `fetcher` and
 * `timeoutMs` are passed in by the tests; the server uses the defaults.
 */
export async function sendThroughApi(
  email: Email,
  options: { env?: Env; fetcher?: typeof fetch; timeoutMs?: number } = {}
): Promise<void> {
  const env = options.env ?? process.env;
  const name = namedProvider(env);
  const key = env.EMAIL_API_KEY;
  const from = env.SMTP_FROM;
  if (!name || !key || !from) {
    throw new Error("EMAIL_PROVIDER, EMAIL_API_KEY and SMTP_FROM must be configured.");
  }
  const request = PROVIDERS[name](email, from, key);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? API_TIMEOUT_MS);
  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)(request.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...request.headers },
      body: JSON.stringify(request.body),
      signal: controller.signal,
    });
  } catch (error) {
    // Said in our own words: the underlying error can carry the request.
    throw new Error(
      controller.signal.aborted
        ? `The email provider (${name}) did not answer in time.`
        : `The email provider (${name}) could not be reached: ${error instanceof Error ? error.name : "error"}.`
    );
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    const reason = refusalText(await response.json().catch(() => null));
    throw new Error(
      `The email provider (${name}) refused the email with status ${response.status}${reason ? `: ${reason}` : "."}`
    );
  }
}

async function sendThroughSmtp(email: Email): Promise<void> {
  const port = Number(process.env.SMTP_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SMTP_PORT must be a valid TCP port.");
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    // A mail server that accepts the connection and then says nothing
    // would otherwise hold each send for minutes.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email.to,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
}

export async function sendEmail(options: Email): Promise<void> {
  const route = emailRoute();
  if (route === "api") return sendThroughApi(options);
  if (route === "smtp") return sendThroughSmtp(options);
  throw new Error(
    "Email is not configured. Set EMAIL_PROVIDER, EMAIL_API_KEY and SMTP_FROM, or the five SMTP_* settings."
  );
}
