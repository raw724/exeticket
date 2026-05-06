// api/send-email.js
// ─────────────────────────────────────────────────────────────────────────────
// Sends transactional emails directly via Resend API.
// Bypasses Supabase SMTP entirely — more reliable, easier to debug.
//
// POST /api/send-email
// Body: { type, to, data }
//
// Types:
//   verify       — account verification link
//   reset        — password reset link
//   purchase     — buyer confirmation
//   sale         — seller notification
//   dispute      — dispute opened notification
//
// Required env vars:
//   RESEND_API_KEY=re_...
// ─────────────────────────────────────────────────────────────────────────────

const FROM = "Exeticket <no-reply@exeticket.com>";
const SITE = process.env.NEXT_PUBLIC_APP_URL || "https://exeticket.com";

const templates = {

  verify: ({ link }) => ({
    subject: "Confirm your Exeticket account",
    html: `
      <div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#0B0B0C">
        <div style="margin-bottom:24px">
          <img src="${SITE}/logo.png" alt="Exeticket" height="32" style="display:block" />
        </div>
        <h1 style="font-size:24px;font-weight:700;margin:0 0 12px">Confirm your email</h1>
        <p style="font-size:15px;line-height:1.6;color:#555;margin:0 0 24px">
          Click the button below to verify your <strong>@exeter.ac.uk</strong> address and activate your Exeticket account.
        </p>
        <a href="${link}" style="display:inline-block;background:#00DEA5;color:#003D2D;font-weight:700;font-size:15px;padding:14px 28px;text-decoration:none;border-radius:4px">
          Confirm my account →
        </a>
        <p style="font-size:13px;color:#888;margin:24px 0 0">
          This link expires in 24 hours. If you didn't create an Exeticket account, ignore this email.
        </p>
        <hr style="border:none;border-top:1px solid #eee;margin:32px 0 16px" />
        <p style="font-size:11px;color:#aaa;margin:0">Exeticket · exeticket.com · Exeter, UK</p>
      </div>
    `,
  }),

  reset: ({ link }) => ({
    subject: "Reset your Exeticket password",
    html: `
      <div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#0B0B0C">
        <h1 style="font-size:24px;font-weight:700;margin:0 0 12px">Reset your password</h1>
        <p style="font-size:15px;line-height:1.6;color:#555;margin:0 0 24px">
          Click below to set a new password for your Exeticket account.
        </p>
        <a href="${link}" style="display:inline-block;background:#00DEA5;color:#003D2D;font-weight:700;font-size:15px;padding:14px 28px;text-decoration:none;border-radius:4px">
          Reset password →
        </a>
        <p style="font-size:13px;color:#888;margin:24px 0 0">
          This link expires in 1 hour. If you didn't request a reset, ignore this email.
        </p>
        <hr style="border:none;border-top:1px solid #eee;margin:32px 0 16px" />
        <p style="font-size:11px;color:#aaa;margin:0">Exeticket · exeticket.com</p>
      </div>
    `,
  }),

  purchase: ({ eventTitle, venue, date, price, walletUrl }) => ({
    subject: `Your ticket for ${eventTitle}`,
    html: `
      <div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#0B0B0C">
        <div style="background:#00DEA5;padding:4px 12px;display:inline-block;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#003D2D;margin-bottom:20px">
          ✓ Ticket purchased
        </div>
        <h1 style="font-size:24px;font-weight:700;margin:0 0 8px">${eventTitle}</h1>
        <p style="font-size:14px;color:#555;margin:0 0 24px">${venue} · ${date}</p>
        <div style="background:#F4F4F2;padding:16px;margin-bottom:24px">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px">
            <span style="font-size:13px;color:#888">Amount paid</span>
            <span style="font-size:15px;font-weight:600">£${price}</span>
          </div>
          <div style="display:flex;justify-content:space-between">
            <span style="font-size:13px;color:#888">Status</span>
            <span style="font-size:13px;font-weight:600;color:#00C491">In escrow</span>
          </div>
        </div>
        <p style="font-size:14px;line-height:1.6;color:#555;margin:0 0 20px">
          Your ticket is in your wallet. Show the screenshot at the door to get in.
          The seller is paid 48 hours after the event — your money is protected until then.
        </p>
        <a href="${walletUrl}" style="display:inline-block;background:#0B0B0C;color:#fff;font-weight:700;font-size:14px;padding:12px 24px;text-decoration:none;border-radius:4px">
          View in wallet →
        </a>
        <hr style="border:none;border-top:1px solid #eee;margin:32px 0 16px" />
        <p style="font-size:11px;color:#aaa;margin:0">Exeticket · exeticket.com</p>
      </div>
    `,
  }),

  sale: ({ eventTitle, price, payoutDate }) => ({
    subject: `Your ticket for ${eventTitle} has sold`,
    html: `
      <div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#0B0B0C">
        <div style="background:#00DEA5;padding:4px 12px;display:inline-block;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#003D2D;margin-bottom:20px">
          ✓ Ticket sold
        </div>
        <h1 style="font-size:24px;font-weight:700;margin:0 0 8px">Your ticket sold!</h1>
        <p style="font-size:15px;line-height:1.6;color:#555;margin:0 0 20px">
          Your listing for <strong>${eventTitle}</strong> has been purchased. The buyer's funds are held in escrow.
        </p>
        <div style="background:#F4F4F2;padding:16px;margin-bottom:24px">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px">
            <span style="font-size:13px;color:#888">You receive</span>
            <span style="font-size:15px;font-weight:700">£${price}</span>
          </div>
          <div style="display:flex;justify-content:space-between">
            <span style="font-size:13px;color:#888">Estimated payout</span>
            <span style="font-size:13px">${payoutDate}</span>
          </div>
        </div>
        <p style="font-size:13px;color:#888">Payout is sent to your bank 48 hours after the event ends, if no disputes are raised.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:32px 0 16px" />
        <p style="font-size:11px;color:#aaa;margin:0">Exeticket · exeticket.com</p>
      </div>
    `,
  }),

  dispute: ({ disputeId, eventTitle, reason }) => ({
    subject: `Dispute opened — ${eventTitle}`,
    html: `
      <div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#0B0B0C">
        <div style="background:#FEE2E2;padding:4px 12px;display:inline-block;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#DC2626;margin-bottom:20px">
          ⚠ Dispute opened
        </div>
        <h1 style="font-size:24px;font-weight:700;margin:0 0 8px">A dispute has been raised</h1>
        <p style="font-size:14px;line-height:1.6;color:#555;margin:0 0 16px">
          Dispute <strong>${disputeId}</strong> for <strong>${eventTitle}</strong>.<br/>
          Reason: ${reason}
        </p>
        <p style="font-size:14px;color:#555">Your payout is frozen while we investigate. We will be in touch.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:32px 0 16px" />
        <p style="font-size:11px;color:#aaa;margin:0">Exeticket · exeticket.com</p>
      </div>
    `,
  }),

};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { type, to, data } = req.body;
  if (!type || !to) return res.status(400).json({ error: "Missing type or to" });
  if (!process.env.RESEND_API_KEY) return res.status(500).json({ error: "RESEND_API_KEY not set" });

  const template = templates[type];
  if (!template) return res.status(400).json({ error: `Unknown email type: ${type}` });

  const { subject, html } = template(data || {});

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to: [to], subject, html }),
    });

    const result = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: result });
    return res.status(200).json({ id: result.id });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
