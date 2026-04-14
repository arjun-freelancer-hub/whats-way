/**
 * ============================================================
 * © 2025 Diploy — a brand of Bisht Technologies Private Limited
 * Original Author: BTPL Engineering Team
 * Website: https://diploy.in
 * Contact: cs@diploy.in
 *
 * Distributed under the Envato / CodeCanyon License Agreement.
 * Licensed to the purchaser for use as defined by the
 * Envato Market (CodeCanyon) Regular or Extended License.
 *
 * You are NOT permitted to redistribute, resell, sublicense,
 * or share this source code, in whole or in part.
 * Respect the author's rights and Envato licensing terms.
 * ============================================================
 */

import nodemailer from "nodemailer";
import SMTPTransport from "nodemailer/lib/smtp-transport";
import dns from "dns";
import { getSMTPConfig } from "server/controllers/smtp.controller";
import { getPanelConfigs } from "./panel.config";
import { cacheInvalidate, CACHE_KEYS } from './cache';

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

  if (config) {
    const port = Number(config.port);
    // Explicitly force secure: false for 587 (STARTTLS) and true for 465 (SSL/TLS)
    // This prevents connection hangs due to misconfiguration.
    const secure = port === 465;

    const user = config.user || '';
    const pass = config.password || '';

    const configSource = config.id === 'env-override' ? 'Environment (Variable)' : 'Database';
    console.info(`[Email] Initializing SMTP: ${config.host}:${port} (secure: ${secure}) [Source: ${configSource}]`);
    console.info(`[Email] Authentication: User=${user.slice(0, 3)}***@***, Pass=*** (Length: ${pass.length})`);
    
    if (pass.length === 0) {
      console.warn(`[Email] ⚠️ WARNING: SMTP password length is 0. This will likely cause authentication or timeout errors.`);
    }

    const transportOptions: SMTPTransport.Options & { family?: number, lookup?: any } = {
      host: config.host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
      // Robustness settings
      connectionTimeout: 30000,
      greetingTimeout: 30000,
      socketTimeout: 30000,
      dnsTimeout: 10000,
      // Force IPv4 aggressively at both socket and DNS level
      family: 4,
      // Custom lookup to ensure only IPv4 is used even if DNS returns IPv6
      lookup: (hostname: string, options: any, callback: any) => {
        dns.lookup(hostname, { family: 4 }, callback);
      },
      tls: {
        rejectUnauthorized: false,
        // Ensure STARTTLS is used for port 587
        ...(port === 587 ? { minVersion: 'TLSv1.2' } : {})
      },
      // Require TLS for port 587
      ...(port === 587 ? { requireTLS: true } : {}),
      // Enable logging based on debug mode
      debug: process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development',
      logger: process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development',
    };

    transporter = nodemailer.createTransport(transportOptions);

    // Diagnostic verify on initialization
    try {
      console.log(`[Email] Testing connection to ${config.host}...`);
      await transporter.verify();
      console.log(`[Email] SMTP Connection verified successfully!`);
    } catch (verifyError: any) {
      console.error(`[Email] SMTP Initialization Verify Failed:`, {
        message: verifyError.message,
        code: verifyError.code,
        command: verifyError.command,
        response: verifyError.response,
        stack: verifyError.stack
      });
      // We don't throw here to allow the app to start, but the error is now visible
    }
  } else {
    console.warn("[Email] Using fallback SMTP settings (emails will not be sent)");
    transporter = nodemailer.createTransport({
      jsonTransport: true,
    });
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

function generateEmailHTML(options: {
  companyName?: string;
  logo?: string;
  otpCode?: string;
  name?: string;
  title: string;
  message: string;
}): string {
  const { companyName, logo, otpCode, name, title, message } = options;
  const displayName = companyName || "Your Company";
  const headerContent = logo
    ? `<img src="${logo}" alt="${displayName} Logo" style="max-height: 60px; margin-bottom: 10px;">`
    : `<div class="logo">${displayName}</div>`;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .container { background: #ffffff; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); }
        .header { text-align: center; margin-bottom: 30px; }
        .logo { font-size: 28px; font-weight: bold; color: #1f2937; margin-bottom: 10px; }
        .otp-box { background: #f3f4f6; border: 2px solid #e5e7eb; border-radius: 8px; padding: 20px; text-align: center; margin: 30px 0; }
        .otp-code { font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #1f2937; font-family: 'Courier New', monospace; }
        .message { font-size: 16px; color: #4b5563; margin: 20px 0; }
        .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 20px 0; font-size: 14px; color: #92400e; }
        .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          ${headerContent}
          <p style="color: #6b7280; margin: 0;">${title}</p>
        </div>
        
        <div class="message">
          ${name ? `<p>Hello <strong>${name}</strong>,</p>` : "<p>Hello,</p>"}
          <p>${message}</p>
        </div>
        
        <div class="otp-box">
          <div style="font-size: 14px; color: #6b7280; margin-bottom: 10px;">Your Verification Code</div>
          <div class="otp-code">${otpCode}</div>
          <div style="font-size: 12px; color: #9ca3af; margin-top: 10px;">Valid for 5 minutes</div>
        </div>
        
        <div class="warning">
          <strong>Security Notice:</strong> Never share this code with anyone. ${displayName} will never ask for your verification code.
        </div>
        
        <div class="footer">
          <p>This is an automated message from ${displayName}.</p>
          <p>&copy; ${new Date().getFullYear()} ${displayName}. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

function generateOTPEmailHTML(
  companyName?: string,
  logo?: string,
  otpCode?: string,
  name?: string
): string {
  return generateEmailHTML({
    companyName,
    logo,
    otpCode,
    name,
    title: "Identity Verification",
    message: "Please use the verification code below to verify your identity."
  });
}

function generateForgotPasswordEmailHTML(
  companyName?: string,
  logo?: string,
  otpCode?: string,
  name?: string
): string {
  return generateEmailHTML({
    companyName,
    logo,
    otpCode,
    name,
    title: "Password Reset Request",
    message: "You requested to reset your password. Use the verification code below to reset your password."
  });
}

function generateEmailText(options: {
  companyName: string;
  otpCode: string;
  name?: string;
  message: string;
}): string {
  const { companyName, otpCode, name, message } = options;
  return `
Hello${name ? " " + name : ""},

${message}

Your verification code is: ${otpCode}

This code will expire in 5 minutes.

If you didn't request this code, please ignore this email.

---
${companyName}
  `.trim();
}

function generateOTPEmailText(
  companyName: string,
  otpCode: string,
  name?: string
): string {
  return generateEmailText({
    companyName,
    otpCode,
    name,
    message: `Thank you for signing up for ${companyName}!`
  });
}

function generateForgotPasswordEmailText(
  companyName: string,
  otpCode: string,
  name?: string
): string {
  return generateEmailText({
    companyName,
    otpCode,
    name,
    message: `You requested to reset your password for ${companyName}.`
  });
}

export async function sendOTPEmail(
  email: string,
  otpCode: string,
  name?: string
) {
  const config = await getConfig();
  const configs = await getPanelConfig();
  const mailer = await getTransporter();

  const companyName = configs?.name || "Your Company";
  const fromName = config?.fromName || companyName;
  const fromEmail = config?.fromEmail || config?.user || process.env.SMTP_USER;

  const mailOptions = {
    from: `"${fromName}" <${fromEmail}>`,
    to: email,
    subject: `Your ${companyName} Verification Code`,
    html: generateForgotPasswordEmailHTML(
      companyName,
      resolveLogoUrl(config?.logo, configs?.logo),
      otpCode,
      name
    ),
    text: generateForgotPasswordEmailText(companyName, otpCode, name),
  };

  try {
    const info = await mailer.sendMail(mailOptions);
    console.log(`[Email] OTP sent successfully to ${email}. MessageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error("[Email] Failed to send OTP:", {
      email,
      host: config?.host,
      port: config?.port,
      message: error.message,
      code: error.code,
      command: error.command,
      response: error.response,
      stack: error.stack
    });
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
  const { name, email, company, subject, message } = data;

  const config = await getConfig();
  const configs = await getPanelConfig();
  const mailer = await getTransporter();

  const companyName = configs?.name || "Your Company";
  const fromName = config?.fromName || companyName;
  const fromEmail = config?.fromEmail || config?.user || process.env.SMTP_USER;

  const html = `
  <div style="background:#f4f5f7; padding:40px; font-family:Arial, sans-serif;">
    <div style="max-width:600px; margin:auto; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.08);">
      <div style="background:#4f46e5; padding:24px; color:#ffffff; text-align:center;">
        <h2 style="margin:0; font-size:24px; font-weight:600;">New Contact Form Message</h2>
        <p style="margin:6px 0 0; opacity:0.85;">${companyName}</p>
      </div>
      <div style="padding:30px;">
        <p style="font-size:16px; color:#111827;">You have received a new message from your website contact form.</p>
        <table style="width:100%; margin-top:20px;">
          <tr>
            <td style="padding:10px 0; font-size:16px; font-weight:600; width:150px; color:#374151;">Name:</td>
            <td style="padding:10px 0; font-size:16px; color:#111827;">${name}</td>
          </tr>
          <tr>
            <td style="padding:10px 0; font-size:16px; font-weight:600; color:#374151;">Email:</td>
            <td style="padding:10px 0; font-size:16px; color:#111827;">${email}</td>
          </tr>
          <tr>
            <td style="padding:10px 0; font-size:16px; font-weight:600; color:#374151;">Company:</td>
            <td style="padding:10px 0; font-size:16px; color:#111827;">${company || "-"}</td>
          </tr>
          <tr>
            <td style="padding:10px 0; font-size:16px; font-weight:600; color:#374151;">Subject:</td>
            <td style="padding:10px 0; font-size:16px; color:#111827;">${subject}</td>
          </tr>
        </table>
        <div style="margin-top:30px;">
          <p style="font-size:16px; font-weight:600; color:#374151; margin-bottom:8px;">Message:</p>
          <div style="background:#f9fafb; padding:20px; border-radius:10px; font-size:15px; line-height:1.6; color:#111827;">
            ${message.replace(/\n/g, "<br>")}
          </div>
        </div>
      </div>
      <div style="background:#f3f4f6; padding:18px; text-align:center; font-size:13px; color:#6b7280;">
        This email was sent from the contact form on <strong>${companyName}</strong>.
      </div>
    </div>
  </div>
`;

  const mailOptions = {
    from: `"${fromName}" <${fromEmail}>`,
    to: fromEmail,
    subject: `Contact Form: ${subject}`,
    html,
    text: `${name} (${email}) says: ${message}`,
  };

  try {
    const info = await mailer.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error("[Contact] Failed:", {
      message: error.message,
      code: error.code,
      command: error.command,
      response: error.response,
      stack: error.stack
    });
    throw new Error(`Failed to send contact message: ${error.code || error.message}`);
  }
}

export async function sendOTPEmailVerify(
  email: string,
  otpCode: string,
  name?: string
) {
  const config = await getConfig();
  const configs = await getPanelConfig();
  const mailer = await getTransporter();

  const companyName = configs?.name || "Your Company";
  const fromName = config?.fromName || companyName;
  const fromEmail = config?.fromEmail || config?.user || process.env.SMTP_USER;

  const mailOptions = {
    from: `"${fromName}" <${fromEmail}>`,
    to: email,
    subject: `Your ${companyName} Verification Code`,
    html: generateOTPEmailHTML(companyName, resolveLogoUrl(config?.logo, configs?.logo), otpCode, name),
    text: generateOTPEmailText(companyName, otpCode, name),
  };

  try {
    const info = await mailer.sendMail(mailOptions);
    console.log(`[Email] Verify OTP sent successfully to ${email}. MessageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error("[Email] Failed to send Verify OTP:", {
      email,
      host: config?.host,
      port: config?.port,
      message: error.message,
      code: error.code,
      command: error.command,
      response: error.response,
      stack: error.stack
    });
    throw new Error(`Failed to send verification email: ${error.code || error.message}`);
  }
}

export async function verifyEmailConfiguration(): Promise<boolean> {
  try {
    const mailer = await getTransporter();
    await mailer.verify();
    return true;
  } catch (error) {
    console.error("[Email] SMTP configuration error:", error);
    return false;
  }
}
