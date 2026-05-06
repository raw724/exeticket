// api/price-alerts.js
// ─────────────────────────────────────────────────────────────────────────────
// Price alerts and Auto-Buy orders.
//
// GET    /api/price-alerts              — get current user's alerts
// POST   /api/price-alerts              — create an alert or auto-buy order
// DELETE /api/price-alerts?id=xxx       — delete an alert
// POST   /api/price-alerts/check        — internal: called by cron every 5 min
//                                         checks all active alerts against
//                                         current listings and fires Auto-Buys
//
// Add to vercel.json:
// { "crons": [{ "path": "/api/price-alerts/check", "schedule": "*/5 * * * *" }] }
//
// Required env vars:
//   STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY
//   RESEND_API_KEY (for email notifications)
//   CRON_SECRET (random string to protect the /check endpoint)
// ─────────────────────────────────────────────────────────────────────────────

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "./auth-check.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {

  // ════════════════════════════════════════════════════════════
  // Internal cron: check all alerts and fire Auto-Buys
  // POST /api/price-alerts with ?action=check
  // ════════════════════════════════════════════════════════════
  if (req.method === "POST" && req.query.action === "check") {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers["authorization"];
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: "Unauthorised" });
    }

    return await runAlertCheck(res);
  }

  // All other routes require auth
  const user = await requireAuth(req, res);
  if (!user) return;

  // ════════════════════════════════════════════════════════════
  // GET — fetch user's alerts
  // ════════════════════════════════════════════════════════════
  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("price_alerts")
      .select("*, event:events(title, venue, date)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    // Enrich with current floor price
    const enriched = await Promise.all((data || []).map(async (alert) => {
      const { data: listings } = await supabase
        .from("listings")
        .select("price")
        .eq("event_id", alert.event_id)
        .eq("status", "available")
        .order("price", { ascending: true })
        .limit(1);

      return {
        ...alert,
        currentFloor: listings?.[0]?.price ?? null,
        triggered:    listings?.[0]?.price != null && listings[0].price <= alert.max_price,
      };
    }));

    return res.status(200).json({ alerts: enriched });
  }

  // ════════════════════════════════════════════════════════════
  // POST — create alert or auto-buy
  // Body: { eventId, maxPrice, autoBuy, stripePaymentMethodId }
  // ════════════════════════════════════════════════════════════
  if (req.method === "POST") {
    const { eventId, maxPrice, autoBuy, stripePaymentMethodId } = req.body;

    if (!eventId || !maxPrice) {
      return res.status(400).json({ error: "Missing eventId or maxPrice" });
    }

    if (autoBuy && !stripePaymentMethodId) {
      return res.status(400).json({ error: "Auto-Buy requires a saved payment method" });
    }

    const { data, error } = await supabase
      .from("price_alerts")
      .insert({
        user_id:                  user.id,
        event_id:                 eventId,
        max_price:                maxPrice,
        auto_buy:                 autoBuy || false,
        stripe_payment_method_id: stripePaymentMethodId || null,
        active:                   true,
        created_at:               new Date().toISOString(),
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ alert: data });
  }

  // ════════════════════════════════════════════════════════════
  // DELETE — remove an alert
  // ════════════════════════════════════════════════════════════
  if (req.method === "DELETE") {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: "Missing id" });

    const { data: existing } = await supabase
      .from("price_alerts")
      .select("user_id")
      .eq("id", id)
      .single();

    if (!existing) return res.status(404).json({ error: "Alert not found" });
    if (existing.user_id !== user.id) return res.status(403).json({ error: "Not your alert" });

    await supabase.from("price_alerts").delete().eq("id", id);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}

// ─────────────────────────────────────────────────────────────────────────────
// runAlertCheck — fired by cron every 5 minutes
// Checks every active alert against current listings
// Sends notifications or fires Auto-Buys as appropriate
// ─────────────────────────────────────────────────────────────────────────────
async function runAlertCheck(res) {
  const { data: alerts } = await supabase
    .from("price_alerts")
    .select("*, user:users(id, email, stripe_account_id), event:events(*)")
    .eq("active", true);

  if (!alerts?.length) {
    return res.status(200).json({ checked: 0 });
  }

  const results = { notified: 0, autoBought: 0, errors: 0 };

  for (const alert of alerts) {
    try {
      // Find cheapest available listing for this event at or below the target
      const { data: listings } = await supabase
        .from("listings")
        .select("*, seller:users(stripe_account_id)")
        .eq("event_id",   alert.event_id)
        .eq("status",     "available")
        .lte("price",     alert.max_price)
        .order("price",   { ascending: true })
        .limit(1);

      if (!listings?.length) continue; // Nothing at target price yet

      const listing = listings[0];

      if (alert.auto_buy && alert.stripe_payment_method_id) {
        // ── AUTO-BUY: purchase the ticket immediately ────────────────────
        try {
          // Lock the listing first to prevent race conditions
          const { error: lockErr } = await supabase
            .from("listings")
            .update({ status: "locked", locked_at: new Date().toISOString() })
            .eq("id", listing.id)
            .eq("status", "available"); // Only update if still available

          if (lockErr) continue; // Someone else got it first

          const amountPence = Math.round(listing.price * 100) + 99;

          // Create and confirm PaymentIntent in one step
          const pi = await stripe.paymentIntents.create({
            amount:                 amountPence,
            currency:               "gbp",
            application_fee_amount: 99,
            transfer_data:          { destination: listing.seller.stripe_account_id },
            capture_method:         "manual",
            payment_method:         alert.stripe_payment_method_id,
            customer:               alert.user.stripe_customer_id,
            confirm:                true,
            metadata: {
              listingId:    listing.id,
              eventId:      alert.event_id,
              sellerId:     listing.seller_id,
              buyerEmail:   alert.user.email,
              autoBuy:      "true",
              alertId:      alert.id,
            },
          });

          // Mark listing sold and deactivate the alert
          await supabase.from("listings").update({ status: "sold" }).eq("id", listing.id);
          await supabase.from("price_alerts").update({ active: false, triggered_at: new Date().toISOString() }).eq("id", alert.id);

          // Notify buyer by email
          await sendEmail(alert.user.email, "auto_buy_success", {
            eventTitle: alert.event.title,
            price:      listing.price,
            venue:      alert.event.venue,
            date:       alert.event.date,
          });

          results.autoBought++;

        } catch (autoErr) {
          console.error(`Auto-buy failed for alert ${alert.id}:`, autoErr);
          // Unlock the listing so someone else can buy it
          await supabase.from("listings").update({ status: "available" }).eq("id", listing.id);
          results.errors++;
        }

      } else {
        // ── NOTIFY ONLY: send email and hold for 90 seconds ─────────────
        // Mark the alert as triggered so we don't spam
        const { error: updateErr } = await supabase
          .from("price_alerts")
          .update({
            triggered_at:       new Date().toISOString(),
            triggered_listing_id: listing.id,
          })
          .eq("id", alert.id)
          .is("triggered_at", null); // Only if not already triggered

        if (!updateErr) {
          await sendEmail(alert.user.email, "price_alert", {
            eventTitle: alert.event.title,
            price:      listing.price,
            venue:      alert.event.venue,
            date:       alert.event.date,
            listingId:  listing.id,
          });
          results.notified++;
        }
      }

    } catch (err) {
      console.error(`Alert check error for alert ${alert.id}:`, err);
      results.errors++;
    }
  }

  return res.status(200).json({ ...results, alertsChecked: alerts.length });
}

// ─────────────────────────────────────────────────────────────────────────────
// sendEmail — sends transactional emails via Resend
// ─────────────────────────────────────────────────────────────────────────────
async function sendEmail(to, type, data) {
  if (!process.env.RESEND_API_KEY) return; // Skip if not configured

  const templates = {
    price_alert: {
      subject: `Price alert: ${data.eventTitle} is now £${data.price.toFixed(2)}`,
      html: `
        <h2>Your price alert triggered</h2>
        <p>A ticket for <strong>${data.eventTitle}</strong> at ${data.venue} (${data.date}) is available for <strong>£${data.price.toFixed(2)}</strong> — at or below your target.</p>
        <p><a href="https://exeticket.co.uk/event/${data.listingId}" style="background:#00DEA5;color:#003D2D;padding:12px 24px;text-decoration:none;font-weight:600;display:inline-block;">Buy now →</a></p>
        <p style="color:#999;font-size:12px">This listing is held for you for 90 seconds. After that it goes back on sale.</p>
      `,
    },
    auto_buy_success: {
      subject: `Ticket purchased automatically — ${data.eventTitle}`,
      html: `
        <h2>Auto-Buy successful ✓</h2>
        <p>We automatically purchased a ticket for <strong>${data.eventTitle}</strong> at ${data.venue} on ${data.date} for <strong>£${data.price.toFixed(2)}</strong>.</p>
        <p>The ticket screenshot is in your wallet.</p>
        <p><a href="https://exeticket.co.uk/wallet" style="background:#00DEA5;color:#003D2D;padding:12px 24px;text-decoration:none;font-weight:600;display:inline-block;">View in wallet →</a></p>
      `,
    },
  };

  const template = templates[type];
  if (!template) return;

  await fetch("https://api.resend.com/emails", {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      from:    "Exeticket <no-reply@exeticket.co.uk>",
      to:      [to],
      subject: template.subject,
      html:    template.html,
    }),
  });
}
