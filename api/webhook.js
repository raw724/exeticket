// api/webhook.js
// ─────────────────────────────────────────────────────────────────────────────
// Handles all incoming Stripe webhook events.
// Stripe calls this URL automatically when payment events happen.
//
// Required env vars:
//   STRIPE_SECRET_KEY=sk_live_...
//   STRIPE_WEBHOOK_SECRET=whsec_...  (from Stripe Dashboard → Webhooks)
//   SUPABASE_URL=https://xxx.supabase.co
//   SUPABASE_SERVICE_KEY=eyJ...
//
// In Stripe Dashboard → Developers → Webhooks → Add endpoint:
//   URL: https://yourdomain.com/api/webhook
//   Events to listen for:
//     - payment_intent.created
//     - payment_intent.succeeded
//     - payment_intent.payment_failed
//     - payment_intent.canceled
//     - transfer.created
//     - charge.dispute.created
//
// IMPORTANT: This endpoint must be excluded from any CSRF protection.
// Vercel handles this automatically for /api routes.
// ─────────────────────────────────────────────────────────────────────────────

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Vercel needs raw body for Stripe signature verification
export const config = {
  api: { bodyParser: false },
};

// Helper to read raw body from the request
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", chunk => chunks.push(chunk));
    req.on("end",  ()    => resolve(Buffer.concat(chunks)));
    req.on("error", err  => reject(err));
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rawBody  = await getRawBody(req);
  const sig      = req.headers["stripe-signature"];
  const secret   = process.env.STRIPE_WEBHOOK_SECRET;

  // ── Verify the webhook signature ─────────────────────────────────────────
  // This ensures the request genuinely came from Stripe, not a third party
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).json({ error: `Webhook signature invalid: ${err.message}` });
  }

  console.log(`[webhook] Received: ${event.type} | ${event.id}`);

  // ── Route to the right handler ────────────────────────────────────────────
  try {
    switch (event.type) {

      // ── Buyer's payment authorised — mark escrow as held ─────────────────
      case "payment_intent.created": {
        const pi = event.data.object;
        const { listingId, eventId, sellerId, buyerEmail } = pi.metadata;
        if (!listingId) break; // not one of ours

        await supabase.from("transactions").upsert({
          stripe_payment_intent_id: pi.id,
          listing_id:  listingId,
          event_id:    eventId,
          seller_id:   sellerId,
          buyer_email: buyerEmail,
          status:      "pending",
          amount_pence: pi.amount,
          created_at:  new Date().toISOString(),
        }, { onConflict: "stripe_payment_intent_id" });

        break;
      }

      // ── Payment method confirmed — funds are now authorised (held) ────────
      case "payment_intent.succeeded": {
        const pi = event.data.object;
        const { listingId } = pi.metadata;
        if (!listingId) break;

        // Mark transaction as held in escrow
        await supabase
          .from("transactions")
          .update({ status: "held", held_at: new Date().toISOString() })
          .eq("stripe_payment_intent_id", pi.id);

        // Mark the listing as sold (removes it from the marketplace)
        await supabase
          .from("listings")
          .update({ status: "sold" })
          .eq("id", listingId);

        console.log(`[webhook] ✓ Escrow held for listing ${listingId}`);
        break;
      }

      // ── Payment failed — unlock the listing so someone else can buy ───────
      case "payment_intent.payment_failed": {
        const pi = event.data.object;
        const { listingId } = pi.metadata;
        if (!listingId) break;

        await supabase
          .from("transactions")
          .update({ status: "failed", failure_reason: pi.last_payment_error?.message })
          .eq("stripe_payment_intent_id", pi.id);

        // Put the listing back to available
        await supabase
          .from("listings")
          .update({ status: "available" })
          .eq("id", listingId);

        console.log(`[webhook] ✗ Payment failed for listing ${listingId} — listing unlocked`);
        break;
      }

      // ── PaymentIntent cancelled (e.g. buyer abandoned checkout) ──────────
      case "payment_intent.canceled": {
        const pi = event.data.object;
        const { listingId } = pi.metadata;
        if (!listingId) break;

        await supabase
          .from("transactions")
          .update({ status: "cancelled" })
          .eq("stripe_payment_intent_id", pi.id);

        await supabase
          .from("listings")
          .update({ status: "available" })
          .eq("id", listingId);

        break;
      }

      // ── Transfer created — seller has been paid ────────────────────────────
      case "transfer.created": {
        const transfer = event.data.object;
        // transfer.metadata is inherited from the PaymentIntent
        console.log(`[webhook] Transfer ${transfer.id} created for £${(transfer.amount / 100).toFixed(2)} to ${transfer.destination}`);

        // Find the transaction by the source PaymentIntent and mark paid_out
        if (transfer.source_transaction) {
          await supabase
            .from("transactions")
            .update({
              status:            "paid_out",
              paid_out_at:       new Date().toISOString(),
              stripe_transfer_id: transfer.id,
            })
            .eq("stripe_charge_id", transfer.source_transaction);
        }
        break;
      }

      // ── Dispute opened — freeze escrow, alert admin ───────────────────────
      case "charge.dispute.created": {
        const dispute = event.data.object;
        console.warn(`[webhook] ⚠ Dispute opened: ${dispute.id} on charge ${dispute.charge}`);

        // Find the transaction for this charge
        const { data: txRows } = await supabase
          .from("transactions")
          .select("id, listing_id")
          .eq("stripe_charge_id", dispute.charge)
          .limit(1);

        if (txRows?.length) {
          const tx = txRows[0];
          // Create a dispute record in the DB
          await supabase.from("disputes").insert({
            transaction_id:   tx.id,
            listing_id:       tx.listing_id,
            stripe_dispute_id: dispute.id,
            reason:           dispute.reason,
            status:           "open",
            opened_at:        new Date().toISOString(),
          });

          // Flag the transaction as disputed
          await supabase
            .from("transactions")
            .update({ status: "disputed" })
            .eq("id", tx.id);
        }
        break;
      }

      default:
        // Unknown event type — log it but return 200 so Stripe doesn't retry
        console.log(`[webhook] Unhandled event type: ${event.type}`);
    }

  } catch (err) {
    console.error(`[webhook] Handler error for ${event.type}:`, err);
    // Return 200 anyway — if we return 5xx, Stripe will retry the webhook
    // and we risk double-processing. Log the error and investigate manually.
  }

  // Always return 200 to acknowledge receipt
  return res.status(200).json({ received: true, eventType: event.type });
}
