// api/connect-seller.js
// ─────────────────────────────────────────────────────────────────────────────
// Handles Stripe Connect onboarding so sellers can receive payouts.
// Every seller needs a Stripe Connect account linked before they can list.
//
// Two endpoints in one file:
//
//   POST /api/connect-seller        — creates an onboarding link for a seller
//   GET  /api/connect-seller/return — handles the return from Stripe's onboarding
//
// Required env vars:
//   STRIPE_SECRET_KEY=sk_live_...
//   SUPABASE_URL=https://xxx.supabase.co
//   SUPABASE_SERVICE_KEY=eyJ...
//   NEXT_PUBLIC_APP_URL=https://yourdomain.com  (your live domain)
//
// Flow:
//   1. Seller clicks "Set up payouts" in Account Settings
//   2. Frontend POSTs to /api/connect-seller with their userId
//   3. This creates a Stripe Connect account + returns an onboarding URL
//   4. Seller is redirected to Stripe to enter bank details and verify ID
//   5. Stripe redirects back to /api/connect-seller/return
//   6. We save the stripeAccountId to the user's DB record
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

export default async function handler(req, res) {

  // ════════════════════════════════════════════════════════════
  // POST — create onboarding link
  // Body: { userId, email }
  // ════════════════════════════════════════════════════════════
  if (req.method === "POST") {
    const { userId, email } = req.body;

    if (!userId || !email) {
      return res.status(400).json({ error: "Missing userId or email" });
    }

    try {
      // Check if this user already has a Stripe Connect account
      const { data: user } = await supabase
        .from("users")
        .select("stripe_account_id, stripe_onboarding_complete")
        .eq("id", userId)
        .single();

      let stripeAccountId = user?.stripe_account_id;

      // Create a new Connect account if they don't have one
      if (!stripeAccountId) {
        const account = await stripe.accounts.create({
          type:    "express",       // Express = Stripe handles the UI for us
          country: "GB",
          email:   email,
          capabilities: {
            card_payments: { requested: true },
            transfers:     { requested: true },
          },
          business_profile: {
            mcc:                 "7999", // Amusement & entertainment
            product_description: "Student ticket resale via Exeticket",
          },
          metadata: {
            exeticket_user_id: userId,
            platform:          "exeticket",
          },
        });

        stripeAccountId = account.id;

        // Save the Stripe account ID to the user record
        await supabase
          .from("users")
          .update({ stripe_account_id: stripeAccountId })
          .eq("id", userId);
      }

      // Generate the onboarding link (expires after 24 hours)
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://exeticket.com";
      const accountLink = await stripe.accountLinks.create({
        account:     stripeAccountId,
        refresh_url: `${appUrl}/account?stripe=refresh`,  // if link expires, send back here
        return_url:  `${appUrl}/account?stripe=success`,  // after completing onboarding
        type:        "account_onboarding",
      });

      return res.status(200).json({
        onboardingUrl:  accountLink.url,
        stripeAccountId,
      });

    } catch (err) {
      console.error("connect-seller POST error:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ════════════════════════════════════════════════════════════
  // GET — check onboarding status (called on return from Stripe)
  // Query: ?userId=xxx
  // ════════════════════════════════════════════════════════════
  if (req.method === "GET") {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }

    try {
      const { data: user } = await supabase
        .from("users")
        .select("stripe_account_id")
        .eq("id", userId)
        .single();

      if (!user?.stripe_account_id) {
        return res.status(200).json({ complete: false, reason: "No Stripe account found" });
      }

      // Check the account status with Stripe
      const account = await stripe.accounts.retrieve(user.stripe_account_id);

      const complete =
        account.details_submitted &&
        account.capabilities?.card_payments === "active" &&
        account.capabilities?.transfers     === "active";

      // Update the DB
      if (complete) {
        await supabase
          .from("users")
          .update({ stripe_onboarding_complete: true })
          .eq("id", userId);
      }

      return res.status(200).json({
        complete,
        stripeAccountId:    account.id,
        detailsSubmitted:   account.details_submitted,
        payoutsEnabled:     account.payouts_enabled,
        chargesEnabled:     account.charges_enabled,
        requirements:       account.requirements?.currently_due || [],
      });

    } catch (err) {
      console.error("connect-seller GET error:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
