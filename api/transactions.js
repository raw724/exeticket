// api/transactions.js
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/transactions?role=buyer   — transactions where current user is buyer
// GET /api/transactions?role=seller  — transactions where current user is seller
// GET /api/transactions?id=xxx       — single transaction
//
// Required env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "./auth-check.js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const { role, id } = req.query;

  try {
    if (id) {
      const { data, error } = await supabase
        .from("transactions")
        .select(`
          *,
          event:events(title, venue, date, iso, door, close),
          listing:listings(price, screenshot_url)
        `)
        .eq("id", id)
        .single();

      if (error) throw error;
      if (!data) return res.status(404).json({ error: "Not found" });

      // Only allow buyer or seller to see their own transaction
      if (data.buyer_id !== user.id && data.seller_id !== user.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      return res.status(200).json({ transaction: data });
    }

    // List by role
    let query = supabase
      .from("transactions")
      .select(`
        *,
        event:events(title, venue, date, iso, door, close),
        listing:listings(price, screenshot_url)
      `)
      .order("created_at", { ascending: false });

    if (role === "buyer")  query = query.eq("buyer_id",  user.id);
    if (role === "seller") query = query.eq("seller_id", user.id);

    const { data, error } = await query;
    if (error) throw error;

    // Normalise shape so WalletScreen can render them
    const normalised = (data || []).map(tx => ({
      id:       tx.id,
      eventId:  tx.event_id,
      price:    tx.listing?.price || 0,
      status:   tx.status?.toUpperCase() || "UNKNOWN",
      sub:      tx.event
        ? `${tx.event.date} · ${tx.event.venue}`
        : "Event details unavailable",
      // Buyer wallet needs the screenshot URL to show the ticket
      screenshotUrl: tx.listing?.screenshot_url || null,
      event:    tx.event,
    }));

    return res.status(200).json({ transactions: normalised, count: normalised.length });

  } catch (err) {
    console.error("transactions GET error:", err);
    return res.status(500).json({ error: err.message });
  }
}
