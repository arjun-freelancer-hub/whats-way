/**
 * ============================================================
 * © 2025 Diploy — a brand of Bisht Technologies Private Limited
 * Original Author: BTPL Engineering Team
 * Website: https://diploy.in
 * Contact: cs@diploy.in
 * ============================================================
 */

import { sendMail, verifyEmailConfiguration, sendOTPEmailVerify } from "../services/email.service";
import 'dotenv/config';

async function runTest() {
  console.log("🚀 Starting Email Diagnostic Tool...\n");

  const toEmail = process.argv[2];
  if (!toEmail) {
    console.error("❌ Error: Please provide a recipient email address.");
    console.log("Usage: npx ts-node server/utils/test-email.ts recipient@example.com");
    process.exit(1);
  }

  try {
    console.log("🔍 [1/3] Verifying configuration...");
    const isValid = await verifyEmailConfiguration();
    if (!isValid) {
      console.error("❌ Configuration verification failed! Please check your SMTP/Resend settings.");
      process.exit(1);
    }
    console.log("✅ Configuration looks good!\n");

    console.log(`📧 [2/3] Sending test OTP email to ${toEmail}...`);
    await sendOTPEmailVerify(toEmail, "123456", "Diagnostic Tester");
    console.log("✅ OTP email sent successfully!\n");

    console.log(`📝 [3/3] Sending simple text email to ${toEmail}...`);
    await sendMail({
      to: toEmail,
      subject: "Whatsway SMTP Diagnostic Test",
      text: "This is a diagnostic email sent from the Whatsway platform to verify your email connectivity.",
      html: "<h3>Whatsway SMTP Diagnostic Test</h3><p>This is a diagnostic email sent from the <b>Whatsway</b> platform to verify your email connectivity.</p>"
    });
    console.log("✅ Simple email sent successfully!\n");

    console.log("🎉 All tests passed! Your email system is fully functional.");
    process.exit(0);
  } catch (error: any) {
    console.error("\n❌ DIAGNOSTIC FAILED:");
    console.error("---------------------");
    console.error(`Message: ${error.message}`);
    if (error.code) console.error(`Code: ${error.code}`);
    if (error.command) console.error(`Command: ${error.command}`);
    if (error.response) console.error(`Response: ${error.response}`);
    console.error("---------------------");
    console.log("\n💡 Troubleshooting Tips:");
    console.log("1. Check if port 465/587 is blocked by your firewall/hosting provider.");
    console.log("2. For Gmail, ensure App Passwords are used if 2FA is enabled.");
    console.log("3. For Resend, ensure your API key starts with 're_' and is active.");
    console.log("4. If on a live server, ensure IPv6 is not causing resolution issues (Force IPv4 is active).");
    process.exit(1);
  }
}

runTest();
