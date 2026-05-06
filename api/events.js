// api/events.js
// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/events              — list all upcoming events
// GET  /api/events?id=xxx       — single event
// POST /api/events              — create event (after Fixr/Fatsoma import)
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

  // ── GET ──────────────────────────────────────────────────────────────────
  if (req.method === "GET") {
    const { id } = req.query;

    try {
      if (id) {
        const { data, error } = await supabase
          .from("events")
          .select("*")
          .eq("id", id)
          .single();

        if (error) throw error;
        if (!data) return res.status(404).json({ error: "Event not found" });
        return res.status(200).json({ event: data });
      }

      // List all upcoming events, soonest first
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .gte("iso", new Date().toISOString()) // only future events
        .order("iso", { ascending: true });

      if (error) throw error;
      return res.status(200).json({ events: data || [], count: data?.length || 0 });

    } catch (err) {
      console.error("events GET error:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── POST — create event after import (requires auth) ─────────────────────
  if (req.method === "POST") {
    const user = await requireAuth(req, res);
    if (!user) return;

    const { id, title, venue, date, iso, door, close, tag, blurb, img, source, sourceUrl } = req.body;

    if (!id || !title || !iso) {
      return res.status(400).json({ error: "Missing required fields: id, title, iso" });
    }

    try {
      // Upsert — if event already imported by someone else, just return it
      const { data, error } = await supabase
        .from("events")
        .upsert({
          id, title, venue, date, iso, door, close,
          tag:        tag || "Club Night",
          blurb:      blurb || "",
          img:        img || "",
          source:     source || "",
          source_url: sourceUrl || "",
          created_at: new Date().toISOString(),
        }, { onConflict: "id" })
        .select()
        .single();

      if (error) throw error;
      return res.status(201).json({ event: data });

    } catch (err) {
      console.error("events POST error:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
