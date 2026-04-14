import nodemailer from "nodemailer";
import SMTPTransport from "nodemailer/lib/smtp-transport";
import dns from "dns";
import fetch from "node-fetch";
import { getSMTPConfig } from "server/controllers/smtp.controller";
import { getPanelConfigs } from "./panel.config";
import { cacheInvalidate, CACHE_KEYS } from './cache';
import { renderEmail } from "./email-renderer.service";

let transporter: any = null;

function resolveLogoUrl(smtpLogo?: string | null, panelLogo?: string | null): string | undefined {
  const logo = smtpLogo || panelLogo;
  if (!logo) return undefined;
  if (logo.startsWith("http://") || logo.startsWith("https://")) return logo;
  const baseUrl = (process.env.APP_URL || "").replace(/\/$/, "");
  if (!baseUrl) return undefined;
  const path = logo.startsWith("/") ? logo : `/uploads/${logo}`;
  return `${baseUrl}${path}`;
}

async function getTransporter() {
  if (transporter) return transporter;

  const config = await getSMTPConfig();

  // If provider is Resend, we don't need a NodeMailer transporter, 
  // but we might still initialize it as a fallback or for verification.
  // However, to satisfy the user's request, we should only initialize SMTP if the provider is 'smtp'.

  if (config && config.provider === 'smtp') {
    const port = Number(config.port);
    const secure = port === 465;

    const user = config.user || '';
    const pass = config.password || '';

    const configSource = config.id === 'env-override' ? 'Environment (Variable)' : 'Database';
    console.info(`[Email] Initializing SMTP: ${config.host}:${port} (secure: ${secure}) [Source: ${configSource}]`);
    
    if (pass.length === 0) {
      console.warn(`[Email] ⚠️ WARNING: SMTP password length is 0.`);
    }

    const transportOptions: SMTPTransport.Options & { family?: number, lookup?: any } = {
      host: config.host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
      connectionTimeout: 20000,
      greetingTimeout: 20000,
      socketTimeout: 20000,
      dnsTimeout: 10000,
      // Aggressive IPv4 enforcement
      family: 4,
      lookup: (hostname: string, options: any, callback: any) => {
        // Force IPv4 resolution only
        dns.lookup(hostname, { family: 4, hints: dns.ADDRCONFIG }, (err, address, family) => {
          if (err) return callback(err);
          callback(null, address, 4);
        });
      },
      tls: {
        rejectUnauthorized: false,
        minVersion: 'TLSv1.2'
      },
      debug: process.env.DEBUG === 'true',
      logger: process.env.DEBUG === 'true',
    };

    transporter = nodemailer.createTransport(transportOptions);

    try {
      console.log(`[Email] Verifying connectivity to ${config.host} (IPv4 Only)...`);
      await transporter.verify();
      console.log(`[Email] SMTP Connection verified successfully!`);
    } catch (verifyError: any) {
      console.error(`[Email] SMTP Verification Failed:`, verifyError.message);
    }
  } else if (config && config.provider === 'resend') {
    console.info(`[Email] Skipping SMTP initialization (Using Resend API)`);
    transporter = {
      sendMail: async () => { throw new Error("SMTP is disabled. Using Resend instead."); },
      verify: async () => { 
        const apiKey = config.resendApiKey || process.env.RESEND_API_KEY;
        if (!apiKey) throw new Error("Resend API Key is missing");
        // Simple verification for Resend API key format
        if (!apiKey.startsWith("re_")) throw new Error("Invalid Resend API Key format");
        return true; 
      }
    };
  } else {
    console.warn("[Email] No valid email provider found (SMTP or Resend)");
    transporter = nodemailer.createTransport({ jsonTransport: true });
  }

  return transporter;
}

async function getConfig() {
  return getSMTPConfig();
}

async function getPanelConfig() {
  const configs = await getPanelConfigs();
  return Array.isArray(configs) ? configs[0] : configs;
}

export function resetEmailCache() {
  transporter = null;
  cacheInvalidate(CACHE_KEYS.smtpConfig()).catch(() => { });
  cacheInvalidate(CACHE_KEYS.panelConfig()).catch(() => { });
}

async function sendViaResend(options: {
  fromEmail: string;
  fromName: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  apiKey: string;
}) {
  const { fromEmail, fromName, to, subject, html, text, apiKey } = options;
  const from = `${fromName} <${fromEmail}>`;

  console.log(`[Email] Sending via Resend API to ${to}...`);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
      text,
    }),
  });

  const result: any = await response.json();

  if (!response.ok) {
    throw new Error(result.message || "Failed to send email via Resend");
  }

  return { success: true, messageId: result.id };
}

export async function sendMail(options: {
  to: string;
  subject: string;
  html: string;
  text: string;
  fromName?: string;
  fromEmail?: string;
}) {
  const config = await getConfig();
  const panelCnf = await getPanelConfig();

  const companyName = panelCnf?.name || "Your Company";
  const fromName = options.fromName || config?.fromName || companyName;
  const fromEmail = options.fromEmail || config?.fromEmail || config?.user || process.env.SMTP_USER;

  // Decision logic for provider
  if (config?.provider === 'resend' || (!config && process.env.RESEND_API_KEY)) {
    const apiKey = config?.resendApiKey || process.env.RESEND_API_KEY;
    if (apiKey) {
      console.log(`[Email] Route: Resend API [Source: ${config?.id === 'env-override' ? 'Env' : 'Database'}]`);
      return sendViaResend({ 
        fromEmail: fromEmail!, 
        fromName, 
        to: options.to, 
        subject: options.subject, 
        html: options.html, 
        text: options.text, 
        apiKey 
      });
    }
  }

  // Default to SMTP
  console.log(`[Email] Route: SMTP [Source: ${config?.id === 'env-override' ? 'Env' : 'Database'}]`);
  const mailer = await getTransporter();
  const mailOptions = {
    from: `"${fromName}" <${fromEmail}>`,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
  };

  const info = await mailer.sendMail(mailOptions);
  return { success: true, messageId: info.messageId };
}

export async function sendOTPEmail(
  email: string,
  otpCode: string,
  name?: string
) {
  const config = await getConfig();
  const panelCnf = await getPanelConfig();
  const companyName = panelCnf?.name || "Your Company";
  const logoUrl = resolveLogoUrl(config?.logo, panelCnf?.logo);

  const title = "Password Reset Request";
  const message = "You requested to reset your password. Use the verification code below to complete the process.";

  const html = await renderEmail({
    title,
    message,
    name,
    otpCode,
    companyName,
    logoUrl
  });

  const text = `Hello ${name || 'there'},\n\n${message}\n\nYour code: ${otpCode}\n\nBest regards,\n${companyName}`;
  const subject = `[${companyName}] Password Reset Code`;

  try {
    const result = await sendMail({ to: email, subject, html, text });
    console.log(`[Email] Password Reset OTP sent to ${email}`);
    return result;
  } catch (error: any) {
    console.error("[Email] Failed to send Password Reset OTP:", error.message);
    throw new Error(`Failed to send verification email: ${error.code || error.message}`);
  }
}

export async function sendContactEmail(data: {
  name: string;
  email: string;
  company?: string;
  subject: string;
  message: string;
}) {
  const panelCnf = await getPanelConfig();
  const companyName = panelCnf?.name || "Your Company";

  const html = await renderEmail({
    title: "New Contact Message",
    message: `You have received a new message from **${data.name}** (${data.email}) regarding **${data.subject}**.\n\n**Company:** ${data.company || 'N/A'}\n\n**Message:**\n${data.message}`,
    companyName
  });

  try {
    return await sendMail({
      to: (await getConfig())?.fromEmail || process.env.SMTP_FROM_EMAIL || "",
      subject: `Contact Form: ${data.subject}`,
      html,
      text: `${data.name} (${data.email}) says: ${data.message}`,
    });
  } catch (error: any) {
    console.error("[Email] Contact Form failed:", error.message);
    throw new Error(`Failed to send contact message: ${error.code || error.message}`);
  }
}

export async function sendOTPEmailVerify(
  email: string,
  otpCode: string,
  name?: string
) {
  const config = await getConfig();
  const panelCnf = await getPanelConfig();
  const companyName = panelCnf?.name || "Your Company";
  const logoUrl = resolveLogoUrl(config?.logo, panelCnf?.logo);

  const title = "Identity Verification";
  const message = "Thank you for choosing our platform. Please use the verification code below to activate your account and get started.";

  const html = await renderEmail({
    title,
    message,
    name,
    otpCode,
    companyName,
    logoUrl
  });

  const text = `Hello ${name || 'there'},\n\n${message}\n\nYour verification code: ${otpCode}\n\nBest regards,\n${companyName}`;
  const subject = `[${companyName}] Verify Your Email`;

  try {
    const result = await sendMail({ to: email, subject, html, text });
    console.log(`[Email] Verification OTP sent to ${email}`);
    return result;
  } catch (error: any) {
    console.error("[Email] Failed to send Verification OTP:", error.message);
    throw new Error(`Failed to send verification email: ${error.code || error.message}`);
  }
}

export async function verifyEmailConfiguration(): Promise<boolean> {
  try {
    const mailer = await getTransporter();
    await mailer.verify();
    return true;
  } catch (error: any) {
    console.error("[Email] configuration error:", error.message);
    return false;
  }
}
