// api/create-payment.js
// ─────────────────────────────────────────────────────────────────────────────
// Creates a Stripe PaymentIntent when a buyer clicks "Pay into escrow".
// Uses manual capture so the funds are authorised but NOT taken until
// release-escrow.js fires 48 hours after the event.
//
// Required env vars (add in Vercel dashboard):
//   STRIPE_SECRET_KEY=sk_live_... (or sk_test_... for testing)
//
// Called from BuyScreen in the frontend when buyer confirms purchase.
//
// Request body:
//   { listingId, listingPrice, eventId, eventTitle, sellerId, buyerEmail }
//
// Response:
//   { clientSecret }  — pass this to Stripe.js to confirm the payment
// ─────────────────────────────────────────────────────────────────────────────

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    listingId,
    listingPrice,   // number in pounds e.g. 24.00
    eventId,
    eventTitle,
    sellerId,       // seller's Stripe Connect account ID (stripeAccountId in your DB)
    buyerEmail,
  } = req.body;

  if (!listingId || !listingPrice || !eventId || !sellerId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: "STRIPE_SECRET_KEY not configured" });
  }

  try {
    // Buyer pays listing price + 99p fee
    // Exeticket keeps the 99p as application_fee_amount
    // The listing price is transferred to the seller on capture
    const listingPence     = Math.round(listingPrice * 100);
    const feePence         = 99;
    const totalPence       = listingPence + feePence;

    const paymentIntent = await stripe.paymentIntents.create({
      amount:   totalPence,          // total buyer pays in pence
      currency: "gbp",

      // Exeticket takes 99p; rest goes to seller on capture
      application_fee_amount: feePence,

      // Destination = seller's connected Stripe account
      transfer_data: {
        destination: sellerId,
      },

      // IMPORTANT: manual capture = funds held, not taken immediately
      // We capture in release-escrow.js after 48h post-event
      capture_method: "manual",

      // Payment method types accepted
      payment_method_types: ["card"],

      // Metadata stored against this PaymentIntent in Stripe dashboard
      metadata: {
        listingId,
        eventId,
        eventTitle: eventTitle || "",
        sellerId,
        buyerEmail: buyerEmail || "",
        feeGbp: "0.99",
        platform: "exeticket",
      },

      // Pre-fill buyer email in Stripe's payment UI
      receipt_email: buyerEmail || undefined,

      description: `Exeticket — ${eventTitle || eventId} (listing ${listingId})`,
    });

    return res.status(200).json({
      clientSecret:    paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amountTotal:     totalPence,
      amountListing:   listingPence,
      amountFee:       feePence,
    });

  } catch (err) {
    console.error("create-payment error:", err);
    return res.status(500).json({ error: err.message });
  }
}
