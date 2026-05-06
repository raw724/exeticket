// api/auth-email.js
// ─────────────────────────────────────────────────────────────────────────────
// Generates Supabase auth links (confirm, reset) and sends them via Resend.
// This bypasses Supabase's own SMTP entirely while keeping email verification.
//
// POST /api/auth-email
// Body: { type: 'signup' | 'recovery', email }
//
// Required env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

// Service role client — needed to generate auth links
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const FROM    = "Exeticket <no-reply@exeticket.com>";
const SITE    = process.env.NEXT_PUBLIC_APP_URL || "https://exeticket.com";
const RESEND  = process.env.RESEND_API_KEY;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { type, email } = req.body;
  if (!type || !email) return res.status(400).json({ error: "Missing type or email" });
  if (!email.endsWith("@exeter.ac.uk")) return res.status(403).json({ error: "Not an Exeter email" });

  try {
    let subject, html;

    if (type === "signup") {
      // Generate a real Supabase email confirmation link
      const { data, error } = await supabase.auth.admin.generateLink({
        type: "signup",
        email,
        options: { redirectTo: `${SITE}/?confirmed=true` }
      });
      if (error) throw error;

      const link = data.properties?.action_link;
      if (!link) throw new Error("Could not generate confirmation link");

      subject = "Confirm your Exeticket account";
      html = `
        <div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#0B0B0C">
          <div style="background:#00DEA5;color:#003D2D;display:inline-block;padding:4px 12px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:24px">
            Exeticket
          </div>
          <h1 style="font-size:26px;font-weight:700;margin:0 0 12px;letter-spacing:-0.02em">Confirm your email</h1>
          <p style="font-size:15px;line-height:1.6;color:#555;margin:0 0 8px">
            You're almost in. Click below to verify your <strong>@exeter.ac.uk</strong> address and activate your Exeticket account.
          </p>
          <p style="font-size:13px;color:#888;margin:0 0 28px">
            This link expires in 24 hours.
          </p>
          <a href="${link}" style="display:inline-block;background:#00DEA5;color:#003D2D;font-weight:700;font-size:15px;padding:14px 32px;text-decoration:none;border-radius:4px;margin-bottom:24px">
            Confirm my account →
          </a>
          <p style="font-size:13px;color:#999;margin:0">
            If you didn't create an Exeticket account, ignore this email.
          </p>
          <hr style="border:none;border-top:1px solid #eee;margin:28px 0 16px">
          <p style="font-size:11px;color:#bbb;margin:0">Exeticket · exeticket.com · Exeter students only</p>
        </div>
      `;

    } else if (type === "recovery") {
      // Generate a real Supabase password reset link
      const { data, error } = await supabase.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: `${SITE}/?reset=true` }
      });
      if (error) throw error;

      const link = data.properties?.action_link;
      if (!link) throw new Error("Could not generate reset link");

      subject = "Reset your Exeticket password";
      html = `
        <div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#0B0B0C">
          <div style="background:#00DEA5;color:#003D2D;display:inline-block;padding:4px 12px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:24px">
            Exeticket
          </div>
          <h1 style="font-size:26px;font-weight:700;margin:0 0 12px;letter-spacing:-0.02em">Reset your password</h1>
          <p style="font-size:15px;line-height:1.6;color:#555;margin:0 0 28px">
            Click below to set a new password for your Exeticket account.
          </p>
          <a href="${link}" style="display:inline-block;background:#0B0B0C;color:#fff;font-weight:700;font-size:15px;padding:14px 32px;text-decoration:none;border-radius:4px;margin-bottom:24px">
            Reset my password →
          </a>
          <p style="font-size:13px;color:#999;margin:0">
            This link expires in 1 hour. If you didn't request a reset, ignore this email.
          </p>
          <hr style="border:none;border-top:1px solid #eee;margin:28px 0 16px">
          <p style="font-size:11px;color:#bbb;margin:0">Exeticket · exeticket.com</p>
        </div>
      `;

    } else {
      return res.status(400).json({ error: `Unknown type: ${type}` });
    }

    // Send via Resend
    if (!RESEND) throw new Error("RESEND_API_KEY not configured");

    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
  method: "POST",
  headers: {
    "api-key": process.env.BREVO_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    sender:   { name: "Exeticket", email: "no-reply@exeticket.com" },
    to:       [{ email }],
    subject,
    htmlContent: html,
  }),
});

    const result = await r.json();
    if (!r.ok) throw new Error(result?.message || JSON.stringify(result));

    console.log(`[auth-email] Sent ${type} email to ${email} — Resend ID: ${result.id}`);
    return res.status(200).json({ ok: true, id: result.id });

  } catch (err) {
    console.error("[auth-email] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
