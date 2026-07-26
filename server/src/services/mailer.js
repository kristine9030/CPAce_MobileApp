// Email sending for password-reset codes.
// Configure SMTP in server/.env to send real emails. Without SMTP config the
// code is logged to the console and returned as `dev_code` so the flow can be
// tested locally.
const nodemailer = require('nodemailer');

function isConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

let transporter = null;
function getTransport() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE ?? 'true') === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
}

async function sendResetCode(email, code) {
  const subject = 'Your CPAce password reset code';
  const text =
    `Your CPAce password reset code is ${code}.\n\n` +
    `It expires in 15 minutes. If you didn't request this, you can safely ignore this email.`;
  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:460px;margin:0 auto;padding:24px;color:#1a1a1a">
      <div style="text-align:center;margin-bottom:20px">
        <div style="font-size:26px;font-weight:800;color:#7B1416;letter-spacing:1px">CPAce</div>
        <div style="font-size:12px;color:#888">Your Edge to Ace CPALE</div>
      </div>
      <h2 style="font-size:18px;margin:0 0 8px">Password reset code</h2>
      <p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 20px">
        Use the code below to reset your CPAce password. This code expires in 15 minutes.
      </p>
      <div style="text-align:center;background:#f5e8e8;border-radius:12px;padding:18px;margin-bottom:20px">
        <span style="font-size:34px;font-weight:800;letter-spacing:10px;color:#7B1416">${code}</span>
      </div>
      <p style="font-size:12px;color:#999;line-height:1.6">
        If you didn't request a password reset, you can safely ignore this email.
      </p>
    </div>`;

  if (!isConfigured()) {
    console.log(`[mailer] SMTP not configured — reset code for ${email}: ${code}`);
    return { sent: false };
  }

  await getTransport().sendMail({
    from: process.env.MAIL_FROM || `CPAce <${process.env.SMTP_USER}>`,
    to: email,
    subject,
    text,
    html,
  });
  return { sent: true };
}

module.exports = { isConfigured, sendResetCode };
