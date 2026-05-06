// api/listings.js
// ─────────────────────────────────────────────────────────────────────────────
// CRUD for ticket listings.
//
// GET  /api/listings?eventId=xxx       — get cheapest listing for an event
// GET  /api/listings?sellerId=xxx      — get all listings for a seller
// POST /api/listings                   — create a new listing (seller)
// PUT  /api/listings?id=xxx            — update price or status
// DELETE /api/listings?id=xxx          — delist (seller only)
//
// Required env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_KEY, STRIPE_SECRET_KEY
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "./auth-check.js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);


// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTIONS sub-route: GET /api/listings?route=transactions&role=buyer|seller
// ─────────────────────────────────────────────────────────────────────────────
async function handleTransactions(req, res, user) {
  const { role, id } = req.query;

  try {
    if (id) {
      const { data, error } = await supabase
        .from("transactions")
        .select(`*, event:events(title, venue, date, iso, door, close), listing:listings(price, screenshot_url)`)
        .eq("id", id)
        .single();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: "Not found" });
      if (data.buyer_id !== user.id && data.seller_id !== user.id) return res.status(403).json({ error: "Access denied" });
      return res.status(200).json({ transaction: data });
    }

    let query = supabase
      .from("transactions")
      .select(`*, event:events(title, venue, date, iso, door, close), listing:listings(price, screenshot_url)`)
      .order("created_at", { ascending: false });

    if (role === "buyer")  query = query.eq("buyer_id",  user.id);
    if (role === "seller") query = query.eq("seller_id", user.id);

    const { data, error } = await query;
    if (error) throw error;

    const normalised = (data || []).map(tx => ({
      id: tx.id, eventId: tx.event_id,
      price: tx.listing?.price || 0,
      status: tx.status?.toUpperCase() || "UNKNOWN",
      sub: tx.event ? `${tx.event.date} · ${tx.event.venue}` : "Event details unavailable",
      screenshotUrl: tx.listing?.screenshot_url || null,
      event: tx.event,
    }));

    return res.status(200).json({ transactions: normalised, count: normalised.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

export default async function handler(req, res) {
  // Route transactions sub-requests
  if (req.query.route === 'transactions') {
    const user = await requireAuth(req, res);
    if (!user) return;
    return handleTransactions(req, res, user);
  }


  // ════════════════════════════════════════════════════════════
  // GET — fetch listings
  // ════════════════════════════════════════════════════════════
  if (req.method === "GET") {
    const { eventId, sellerId, id } = req.query;

    try {
      let query = supabase
        .from("listings")
        .select(`
          id, event_id, seller_id, price, status, created_at,
          screenshot_url, decay_start, decay_floor, decay_ends_at,
          seller:users(handle, stripe_account_id),
          event:events(title, venue, date, iso, door, close)
        `)
        .eq("status", "available");

      if (id)       query = query.eq("id", id);
      if (eventId)  query = query.eq("event_id", eventId);
      if (sellerId) query = query.eq("seller_id", sellerId);

      // Always sort by price ascending — buyer sees cheapest first
      query = query.order("price", { ascending: true });

      const { data, error } = await query;

      if (error) throw error;

      // For event page: apply smart decay to prices before returning
      const now = Date.now();
      const enriched = (data || []).map(listing => {
        let displayPrice = listing.price;

        if (listing.decay_start && listing.decay_floor && listing.decay_ends_at) {
          const endsAt   = new Date(listing.decay_ends_at).getTime();
          const startsAt = new Date(listing.created_at).getTime();
          const total    = endsAt - startsAt;
          const elapsed  = now - startsAt;
          const pct      = Math.min(1, Math.max(0, elapsed / total));
          displayPrice   = Math.max(
            listing.decay_floor,
            listing.price - (listing.price - listing.decay_floor) * pct
          );
          // Round to nearest 50p
          displayPrice = Math.round(displayPrice * 2) / 2;
        }

        return { ...listing, displayPrice };
      });

      // Re-sort by displayPrice after decay applied
      enriched.sort((a, b) => a.displayPrice - b.displayPrice);

      return res.status(200).json({ listings: enriched, count: enriched.length });

    } catch (err) {
      console.error("listings GET error:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ════════════════════════════════════════════════════════════
  // POST — create a listing (requires auth)
  // Body: { eventId, price, screenshotUrl, decayFloor?, decayEndsAt? }
  // ════════════════════════════════════════════════════════════
  if (req.method === "POST") {
    const user = await requireAuth(req, res);
    if (!user) return;

    const {
      eventId,
      price,
      screenshotUrl,
      decayFloor,
      decayEndsAt,
    } = req.body;

    if (!eventId || !price || !screenshotUrl) {
      return res.status(400).json({ error: "Missing eventId, price or screenshotUrl" });
    }

    if (price < 0.01) {
      return res.status(400).json({ error: "Price must be at least £0.01" });
    }

    try {
      // Get seller's Stripe account ID
      const { data: sellerUser } = await supabase
        .from("users")
        .select("id, stripe_account_id, stripe_onboarding_complete")
        .eq("id", user.id)
        .single();

      if (!sellerUser?.stripe_onboarding_complete) {
        return res.status(403).json({
          error:  "Payout account not set up",
          detail: "You need to complete Stripe onboarding before listing tickets.",
          action: "setup_payouts",
        });
      }

      // Create the listing
      const { data: listing, error } = await supabase
        .from("listings")
        .insert({
          event_id:       eventId,
          seller_id:      user.id,
          price:          price,
          screenshot_url: screenshotUrl,
          status:         "available",
          decay_start:    decayFloor ? price : null,
          decay_floor:    decayFloor || null,
          decay_ends_at:  decayEndsAt || null,
          created_at:     new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      return res.status(201).json({ listing });

    } catch (err) {
      console.error("listings POST error:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ════════════════════════════════════════════════════════════
  // PUT — update price or delist (requires auth, must be owner)
  // ════════════════════════════════════════════════════════════
  if (req.method === "PUT") {
    const user = await requireAuth(req, res);
    if (!user) return;

    const { id } = req.query;
    const { price, status } = req.body;

    if (!id) return res.status(400).json({ error: "Missing listing id" });

    try {
      // Verify ownership
      const { data: existing } = await supabase
        .from("listings")
        .select("seller_id, status")
        .eq("id", id)
        .single();

      if (!existing) return res.status(404).json({ error: "Listing not found" });
      if (existing.seller_id !== user.id) return res.status(403).json({ error: "Not your listing" });
      if (existing.status === "sold") return res.status(400).json({ error: "Cannot edit a sold listing" });

      const updates = {};
      if (price  !== undefined) updates.price  = price;
      if (status !== undefined) updates.status = status;
      updates.updated_at = new Date().toISOString();

      const { data: updated, error } = await supabase
        .from("listings")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ listing: updated });

    } catch (err) {
      console.error("listings PUT error:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ════════════════════════════════════════════════════════════
  // DELETE — delist (requires auth, must be owner)
  // ════════════════════════════════════════════════════════════
  if (req.method === "DELETE") {
    const user = await requireAuth(req, res);
    if (!user) return;

    const { id } = req.query;
    if (!id) return res.status(400).json({ error: "Missing listing id" });

    try {
      const { data: existing } = await supabase
        .from("listings")
        .select("seller_id, status")
        .eq("id", id)
        .single();

      if (!existing) return res.status(404).json({ error: "Listing not found" });
      if (existing.seller_id !== user.id) return res.status(403).json({ error: "Not your listing" });
      if (existing.status === "sold") return res.status(400).json({ error: "Cannot delete a sold listing" });

      // Soft delete — set status to 'delisted' rather than removing the row
      const { error } = await supabase
        .from("listings")
        .update({ status: "delisted", updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;
      return res.status(200).json({ success: true });

    } catch (err) {
      console.error("listings DELETE error:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
