import nodemailer from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env from the root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const config = {
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
  user: process.env.SMTP_USER,
  pass: process.env.SMTP_PASS,
  fromEmail: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER,
};

async function testConnection() {
  console.log('--- SMTP Diagnostic Tool ---');
  console.log(`Host: ${config.host}`);
  console.log(`Port: ${config.port}`);
  console.log(`Secure: ${config.secure}`);
  console.log(`User: ${config.user}`);
  console.log('---------------------------');

  if (!config.host || !config.user || !config.pass) {
    console.error('Error: Incomplete SMTP configuration in .env');
    process.exit(1);
  }

  const host = (config.host || '').toLowerCase() === 'smtp.gmail.com' 
    ? 'smtp.googlemail.com' 
    : (config.host || '');

  const transportOptions: SMTPTransport.Options & { family?: number } = {
    host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    // Using the same robustness settings as the updated app
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 30000,
    dnsTimeout: 10000,
    // Force IPv4 to avoid common IPv6 resolution/connection issues
    family: 4,
    tls: {
      rejectUnauthorized: false,
      ...(config.port === 587 ? { minVersion: 'TLSv1.2' } : {})
    },
    // Require TLS for port 587
    ...(config.port === 587 ? { requireTLS: true } : {}),
    debug: true,
    logger: true,
  };

  const transporter = nodemailer.createTransport(transportOptions);

  try {
    console.log('Testing connection...');
    await transporter.verify();
    console.log('✅ Connection verified successfully!');

    console.log('Attempting to send test email...');
    const info = await transporter.sendMail({
      from: config.fromEmail,
      to: config.user, // Send to self
      subject: 'SMTP Diagnostic Test',
      text: 'If you see this email, your SMTP configuration is working correctly.',
      html: '<b>If you see this email, your SMTP configuration is working correctly.</b>',
    });

    console.log('✅ Test email sent!');
    console.log(`Message ID: ${info.messageId}`);
  } catch (error: any) {
    console.error('\n❌ SMTP Error:');
    console.error(`Code: ${error.code}`);
    console.error(`Command: ${error.command}`);
    console.error(`Response: ${error.response}`);
    console.error('Full Error:', error);
  }
}

testConnection();
