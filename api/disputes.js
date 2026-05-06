// api/disputes.js
// ─────────────────────────────────────────────────────────────────────────────
// Dispute management — open, view, and resolve disputes.
//
// POST /api/disputes                  — buyer opens a dispute
// GET  /api/disputes?id=xxx           — get a single dispute (admin)
// GET  /api/disputes?status=open      — list disputes by status (admin)
// PUT  /api/disputes?id=xxx           — resolve a dispute (admin only)
//
// Opening a dispute immediately freezes the seller's payout (cancels the
// PaymentIntent capture so it can't be auto-released by release-escrow.js).
//
// Resolving in favour of buyer: refund the PaymentIntent
// Resolving in favour of seller: capture the PaymentIntent (pay seller out)
//
// Required env vars:
//   STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY
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

// Admin user IDs — add your Supabase user ID here after you create your account
const ADMIN_USER_IDS = process.env.ADMIN_USER_IDS
  ? process.env.ADMIN_USER_IDS.split(",")
  : [];

export default async function handler(req, res) {

  // ════════════════════════════════════════════════════════════
  // POST — buyer opens a dispute
  // Body: { transactionId, reason, evidenceText }
  // ════════════════════════════════════════════════════════════
  if (req.method === "POST") {
    const user = await requireAuth(req, res);
    if (!user) return;

    const { transactionId, reason, evidenceText } = req.body;

    if (!transactionId || !reason) {
      return res.status(400).json({ error: "Missing transactionId or reason" });
    }

    try {
      // Verify the buyer owns this transaction
      const { data: tx } = await supabase
        .from("transactions")
        .select("*, listing:listings(seller_id)")
        .eq("id", transactionId)
        .single();

      if (!tx) return res.status(404).json({ error: "Transaction not found" });
      if (tx.buyer_id !== user.id) return res.status(403).json({ error: "Not your transaction" });
      if (tx.status !== "held") return res.status(400).json({ error: `Cannot dispute a transaction with status '${tx.status}'` });

      // Check no dispute already exists
      const { data: existing } = await supabase
        .from("disputes")
        .select("id")
        .eq("transaction_id", transactionId)
        .limit(1);

      if (existing?.length) {
        return res.status(400).json({ error: "A dispute already exists for this transaction" });
      }

      // Create the dispute record
      const { data: dispute, error: dispErr } = await supabase
        .from("disputes")
        .insert({
          transaction_id:  transactionId,
          listing_id:      tx.listing_id,
          buyer_id:        user.id,
          seller_id:       tx.listing?.seller_id,
          reason:          reason,
          evidence_text:   evidenceText || "",
          status:          "open",
          opened_at:       new Date().toISOString(),
        })
        .select()
        .single();

      if (dispErr) throw dispErr;

      // Freeze payout — mark transaction as disputed so release-escrow skips it
      await supabase
        .from("transactions")
        .update({ status: "disputed", dispute_id: dispute.id })
        .eq("id", transactionId);

      return res.status(201).json({ dispute, message: "Dispute opened. Seller payout frozen." });

    } catch (err) {
      console.error("disputes POST error:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ════════════════════════════════════════════════════════════
  // GET — list or fetch disputes
  // ════════════════════════════════════════════════════════════
  if (req.method === "GET") {
    const user = await requireAuth(req, res);
    if (!user) return;

    const { id, status } = req.query;
    const isAdmin = ADMIN_USER_IDS.includes(user.id);

    try {
      if (id) {
        // Single dispute — admin or one of the parties
        const { data, error } = await supabase
          .from("disputes")
          .select("*, transaction:transactions(*), listing:listings(*)")
          .eq("id", id)
          .single();

        if (error) throw error;
        if (!data) return res.status(404).json({ error: "Dispute not found" });

        const canView = isAdmin || data.buyer_id === user.id || data.seller_id === user.id;
        if (!canView) return res.status(403).json({ error: "Access denied" });

        return res.status(200).json({ dispute: data });
      }

      // List — admin only
      if (!isAdmin) return res.status(403).json({ error: "Admin only" });

      let query = supabase
        .from("disputes")
        .select("*, transaction:transactions(stripe_payment_intent_id, amount_pence)")
        .order("opened_at", { ascending: false });

      if (status) query = query.eq("status", status);

      const { data, error } = await query;
      if (error) throw error;

      return res.status(200).json({ disputes: data, count: data.length });

    } catch (err) {
      console.error("disputes GET error:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ════════════════════════════════════════════════════════════
  // PUT — resolve a dispute (admin only)
  // Body: { outcome: 'buyer' | 'seller', resolution }
  // ════════════════════════════════════════════════════════════
  if (req.method === "PUT") {
    const user = await requireAuth(req, res);
    if (!user) return;

    if (!ADMIN_USER_IDS.includes(user.id)) {
      return res.status(403).json({ error: "Admin only" });
    }

    const { id } = req.query;
    const { outcome, resolution } = req.body;

    if (!id || !outcome) return res.status(400).json({ error: "Missing id or outcome" });
    if (!["buyer", "seller"].includes(outcome)) {
      return res.status(400).json({ error: "outcome must be 'buyer' or 'seller'" });
    }

    try {
      const { data: dispute } = await supabase
        .from("disputes")
        .select("*, transaction:transactions(*)")
        .eq("id", id)
        .single();

      if (!dispute) return res.status(404).json({ error: "Dispute not found" });
      if (dispute.status !== "open" && dispute.status !== "investigating") {
        return res.status(400).json({ error: `Dispute is already ${dispute.status}` });
      }

      const tx  = dispute.transaction;
      const pi  = tx.stripe_payment_intent_id;
      let stripeAction;

      if (outcome === "buyer") {
        // Refund the buyer — cancel the PaymentIntent
        stripeAction = await stripe.paymentIntents.cancel(pi, {
          cancellation_reason: "fraudulent",
        }).catch(async () => {
          // If already captured, issue a refund instead
          return stripe.refunds.create({ payment_intent: pi });
        });

        await supabase.from("transactions").update({ status: "refunded" }).eq("id", tx.id);

      } else {
        // Pay the seller — capture the PaymentIntent
        stripeAction = await stripe.paymentIntents.capture(pi);
        await supabase.from("transactions").update({ status: "released" }).eq("id", tx.id);
      }

      // Close the dispute
      await supabase
        .from("disputes")
        .update({
          status:      "resolved",
          outcome:     outcome,
          resolution:  resolution || "",
          resolved_at: new Date().toISOString(),
          resolved_by: user.id,
        })
        .eq("id", id);

      return res.status(200).json({
        dispute: { id, outcome, resolution },
        stripe:  { id: stripeAction.id, status: stripeAction.status },
        message: outcome === "buyer"
          ? "Refund issued. Buyer will receive funds within 5 business days."
          : "Seller paid out. Funds transferred immediately.",
      });

    } catch (err) {
      console.error("disputes PUT error:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
