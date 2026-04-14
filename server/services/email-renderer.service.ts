import { getPanelConfigs } from "./panel.config";

export interface EmailTemplateData {
  title: string;
  message: string;
  name?: string;
  otpCode?: string;
  buttonLink?: string;
  buttonText?: string;
  companyName?: string;
  logoUrl?: string;
  [key: string]: any;
}

export async function renderEmail(data: EmailTemplateData): Promise<string> {
  const configs = await getPanelConfigs();
  const config = Array.isArray(configs) ? configs[0] : configs;

  const companyName = data.companyName || config?.name || "Your Company";
  const logoUrl = data.logoUrl;

  const displayName = companyName;
  const headerContent = logoUrl
    ? `<img src="${logoUrl}" alt="${displayName} Logo" style="max-height: 50px; margin-bottom: 10px;">`
    : `<div style="font-size: 24px; font-weight: bold; color: #1f2937;">${displayName}</div>`;

  const buttonHtml = data.buttonLink && data.buttonText
    ? `
      <div style="margin: 30px 0; text-align: center;">
        <a href="${data.buttonLink}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block;">
          ${data.buttonText}
        </a>
      </div>`
    : "";

  const otpHtml = data.otpCode
    ? `
      <div style="background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 12px; padding: 30px; text-align: center; margin: 30px 0;">
        <div style="font-size: 14px; color: #6b7280; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 1px;">Verification Code</div>
        <div style="font-size: 42px; font-weight: 800; letter-spacing: 10px; color: #111827; font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;">${data.otpCode}</div>
        <div style="font-size: 12px; color: #9ca3af; margin-top: 15px;">This code expires in 10 minutes.</div>
      </div>
      <div style="background: #fffbeb; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; font-size: 14px; color: #92400e; border-radius: 4px;">
        <strong>Security Alert:</strong> If you did not request this code, please ignore this email and do not share this code with anyone.
      </div>`
    : "";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.title}</title>
  <style>
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #374151; max-width: 600px; margin: 0 auto; padding: 0; background-color: #f4f7fa; }
    .wrapper { padding: 40px 20px; }
    .container { background: #ffffff; border-radius: 16px; padding: 40px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05); }
    .header { text-align: center; margin-bottom: 30px; }
    .content { font-size: 16px; }
    .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #f1f5f9; font-size: 13px; color: #94a3b8; }
    h1 { color: #111827; font-size: 24px; font-weight: 700; margin-bottom: 16px; text-align: center; }
    p { margin-bottom: 16px; }
    strong { color: #111827; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      ${headerContent}
    </div>
    <div class="container">
      <h1>${data.title}</h1>
      <div class="content">
        ${data.name ? `<p>Hello <strong>${data.name}</strong>,</p>` : "<p>Hello,</p>"}
        <p>${data.message}</p>
        ${otpHtml}
        ${buttonHtml}
      </div>
      <div class="footer">
        <p>&copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
        <p>WhatsApp Marketing Automation Platform</p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}
