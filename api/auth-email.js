import { createClient } from "@supabase/supabase-js";

const SITE = process.env.NEXT_PUBLIC_APP_URL || "https://exeticket.com";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { type, email } = req.body;
  console.log(`[auth-email] Called — type: ${type}, email: ${email}`);

  if (!type || !email) return res.status(400).json({ error: "Missing type or email" });
  if (!email.endsWith("@exeter.ac.uk")) return res.status(403).json({ error: "Not an Exeter email" });

  const missing = ["SUPABASE_URL","SUPABASE_SERVICE_KEY","BREVO_API_KEY"].filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`[auth-email] Missing: ${missing.join(", ")}`);
    return res.status(500).json({ error: `Missing env vars: ${missing.join(", ")}` });
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    console.log(`[auth-email] Generating Supabase ${type} link...`);
    const { data, error: linkError } = await supabase.auth.admin.generateLink({
      type: type === "signup" ? "signup" : "recovery",
      email,
      options: { redirectTo: type === "signup" ? `${SITE}/?confirmed=true` : `${SITE}/?reset=true` }
    });

    if (linkError) throw new Error(`Supabase: ${linkError.message}`);
    const link = data?.properties?.action_link;
    if (!link) throw new Error("No link returned from Supabase");
    console.log(`[auth-email] Link generated OK`);

    const isSignup = type === "signup";
    const subject = isSignup ? "Confirm your Exeticket account" : "Reset your Exeticket password";
    const html = `<div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#0B0B0C">
      <div style="background:#00DEA5;color:#003D2D;display:inline-block;padding:4px 12px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:24px">Exeticket</div>
      <h1 style="font-size:26px;font-weight:700;margin:0 0 12px">${isSignup ? "Confirm your email" : "Reset your password"}</h1>
      <p style="font-size:15px;line-height:1.6;color:#555;margin:0 0 24px">${isSignup ? "Click below to verify your @exeter.ac.uk address and activate your account. This link expires in 24 hours." : "Click below to set a new password. This link expires in 1 hour."}</p>
      <a href="${link}" style="display:inline-block;background:${isSignup ? "#00DEA5" : "#0B0B0C"};color:${isSignup ? "#003D2D" : "#fff"};font-weight:700;font-size:15px;padding:14px 32px;text-decoration:none;border-radius:4px;margin-bottom:24px">${isSignup ? "Confirm my account →" : "Reset my password →"}</a>
      <p style="font-size:13px;color:#999;margin:0">If you did not ${isSignup ? "create an Exeticket account" : "request a password reset"}, ignore this email.</p>
      <hr style="border:none;border-top:1px solid #eee;margin:28px 0 16px">
      <p style="font-size:11px;color:#bbb;margin:0">Exeticket · exeticket.com</p>
    </div>`;

    console.log(`[auth-email] Sending via Brevo to ${email}...`);
    const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": process.env.BREVO_API_KEY,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        sender: { name: "Exeticket", email: "no-reply@exeticket.com" },
        to: [{ email }],
        subject,
        htmlContent: html,
      }),
    });

    const brevoText = await brevoRes.text();
    console.log(`[auth-email] Brevo status: ${brevoRes.status} body: ${brevoText}`);

    if (!brevoRes.ok) throw new Error(`Brevo ${brevoRes.status}: ${brevoText}`);

    const brevoData = JSON.parse(brevoText);
    console.log(`[auth-email] Done — messageId: ${brevoData.messageId}`);
    return res.status(200).json({ ok: true, messageId: brevoData.messageId });

  } catch (err) {
    console.error(`[auth-email] Error:`, err.message);
    return res.status(500).json({ error: err.message });
  }
}
