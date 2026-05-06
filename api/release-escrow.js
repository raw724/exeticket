// api/release-escrow.js
// ─────────────────────────────────────────────────────────────────────────────
// Runs as a Vercel cron job every hour.
// Finds all transactions where:
//   - status = 'held' (payment authorised but not yet captured)
//   - event ended more than 48 hours ago
//   - no open disputes
// Then captures the PaymentIntent, which:
//   - charges the buyer's card
//   - transfers the listing price to the seller's Stripe account
//   - Exeticket keeps the 99p application fee automatically
//
// Required env vars:
//   STRIPE_SECRET_KEY=sk_live_...
//   SUPABASE_URL=https://xxx.supabase.co
//   SUPABASE_SERVICE_KEY=eyJ...  (service role key, NOT anon key)
//
// Add to vercel.json in your project root:
// {
//   "crons": [{ "path": "/api/release-escrow", "schedule": "0 * * * *" }]
// }
//
// Can also be triggered manually with:
//   GET /api/release-escrow?secret=YOUR_CRON_SECRET
// ─────────────────────────────────────────────────────────────────────────────

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY  // service key bypasses RLS — only use server-side
);

export default async function handler(req, res) {
  // Simple secret check to prevent accidental public triggers
  // Set CRON_SECRET in your Vercel env vars to any random string
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.query.secret !== cronSecret && req.headers["authorization"] !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorised" });
  }

  const now        = new Date();
  const cutoff     = new Date(now.getTime() - 48 * 60 * 60 * 1000); // 48 hours ago

  console.log(`[release-escrow] Running at ${now.toISOString()}, releasing events that ended before ${cutoff.toISOString()}`);

  try {
    // ── Fetch all transactions ready for release ──────────────────────────
    // Your DB schema should have a `transactions` table with:
    //   id, listing_id, event_id, event_end_time, stripe_payment_intent_id,
    //   status ('held' | 'released' | 'refunded' | 'disputed'), seller_id, buyer_id
    const { data: transactions, error: dbError } = await supabase
      .from("transactions")
      .select("*")
      .eq("status", "held")
      .lt("event_end_time", cutoff.toISOString())  // event ended > 48h ago
      .is("dispute_id", null);                      // no open dispute

    if (dbError) {
      console.error("[release-escrow] DB query error:", dbError);
      return res.status(500).json({ error: "Database query failed", detail: dbError.message });
    }

    if (!transactions || transactions.length === 0) {
      console.log("[release-escrow] No transactions ready for release.");
      return res.status(200).json({ released: 0, message: "Nothing to release." });
    }

    console.log(`[release-escrow] Found ${transactions.length} transaction(s) to release.`);

    const results = [];

    for (const tx of transactions) {
      try {
        // ── Capture the PaymentIntent ───────────────────────────────────
        // This is the moment the buyer's card is actually charged
        // and Stripe transfers the listing price to the seller account
        const captured = await stripe.paymentIntents.capture(
          tx.stripe_payment_intent_id
        );

        // ── Update transaction status in DB ─────────────────────────────
        const { error: updateError } = await supabase
          .from("transactions")
          .update({
            status:       "released",
            released_at:  new Date().toISOString(),
            stripe_charge_id: captured.latest_charge,
          })
          .eq("id", tx.id);

        if (updateError) {
          console.error(`[release-escrow] Failed to update tx ${tx.id}:`, updateError);
        }

        // ── Update listing status ────────────────────────────────────────
        await supabase
          .from("listings")
          .update({ status: "paid_out" })
          .eq("id", tx.listing_id);

        console.log(`[release-escrow] ✓ Released tx ${tx.id} | PaymentIntent ${tx.stripe_payment_intent_id} | £${(captured.amount_received / 100).toFixed(2)}`);

        results.push({
          transactionId:    tx.id,
          paymentIntentId:  tx.stripe_payment_intent_id,
          status:           "released",
          amountCaptured:   captured.amount_received / 100,
        });

      } catch (stripeErr) {
        // Log the failure but continue processing other transactions
        console.error(`[release-escrow] ✗ Failed to capture tx ${tx.id}:`, stripeErr.message);

        // Mark as failed in DB so we don't retry infinitely
        await supabase
          .from("transactions")
          .update({
            status:        "capture_failed",
            failure_reason: stripeErr.message,
          })
          .eq("id", tx.id);

        results.push({
          transactionId:   tx.id,
          paymentIntentId: tx.stripe_payment_intent_id,
          status:          "failed",
          error:           stripeErr.message,
        });
      }
    }

    const successCount = results.filter(r => r.status === "released").length;
    const failCount    = results.filter(r => r.status === "failed").length;

    return res.status(200).json({
      released: successCount,
      failed:   failCount,
      total:    transactions.length,
      results,
    });

  } catch (err) {
    console.error("[release-escrow] Unexpected error:", err);
    return res.status(500).json({ error: err.message });
  }
}
