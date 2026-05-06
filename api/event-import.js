// api/event-import.js
// ─────────────────────────────────────────────────────────────────────────────
// Proxies event detail requests to Fixr and Fatsoma APIs.
// The browser can't call these directly (CORS), so this runs server-side.
//
// Usage:
//   GET /api/event-import?platform=fixr&id=12345678
//   GET /api/event-import?platform=fatsoma&id=abc123xyz
//
// No extra env vars needed — Fixr and Fatsoma public APIs are unauthenticated.
// ─────────────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { platform, id } = req.query;

  if (!platform || !id) {
    return res.status(400).json({ error: "Missing platform or id query param" });
  }

  // ── Helper: format a unix timestamp or ISO string into readable parts ─────
  function parseDateTime(value) {
    const dt = typeof value === "number"
      ? new Date(value * 1000)   // Fixr uses unix seconds
      : new Date(value);         // Fatsoma uses ISO string
    return {
      iso: dt.toISOString(),
      date: dt.toLocaleDateString("en-GB", {
        weekday: "short", day: "2-digit", month: "short", year: "numeric"
      }),
      time: dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
    };
  }

  // ════════════════════════════════════════════════════════════
  // FIXR
  // ════════════════════════════════════════════════════════════
  if (platform === "fixr") {
    try {
      const apiRes = await fetch(
        `https://api.fixr.co/api/v2/public/event/${id}`,
        {
          headers: {
            "Accept": "application/json",
            "User-Agent": "Exeticket/1.0",
          },
        }
      );

      if (!apiRes.ok) {
        return res.status(apiRes.status).json({
          error: `Fixr API returned ${apiRes.status}`,
          detail: "Check the event ID is correct and the event is live on Fixr.",
        });
      }

      const data = await apiRes.json();

      // Fixr response shape:
      // data.name, data.venue.name, data.venue.city
      // data.open_time (unix seconds), data.close_time (unix seconds)
      // data.tickets[] -> { price (pence), name, sold_out }
      // data.image, data.description

      const open  = parseDateTime(data.open_time);
      const close = parseDateTime(data.close_time);

      // Find cheapest available ticket price (in pence → pounds)
      const availableTickets = (data.tickets || []).filter(t => !t.sold_out);
      const floorPence = availableTickets.length
        ? Math.min(...availableTickets.map(t => t.price || 0))
        : 0;

      return res.status(200).json({
        id:         `fixr-${id}`,
        title:      data.name,
        venue:      data.venue?.name || "Venue TBC",
        city:       data.venue?.city || "Exeter",
        date:       open.date,
        iso:        open.iso,
        door:       open.time,
        close:      close.time,
        tag:        "Club Night",
        listings:   0,
        floor:      floorPence / 100,
        blurb:      data.description || "",
        img:        data.image || "",
        source:     "Fixr",
        sourceUrl:  `https://fixr.co/event/--${id}`,
        rawTickets: (data.tickets || []).map(t => ({
          name:    t.name,
          price:   t.price / 100,
          soldOut: t.sold_out,
        })),
      });

    } catch (err) {
      console.error("Fixr fetch error:", err);
      return res.status(502).json({ error: "Failed to reach Fixr API", detail: err.message });
    }
  }

  // ════════════════════════════════════════════════════════════
  // FATSOMA
  // ════════════════════════════════════════════════════════════
  if (platform === "fatsoma") {
    try {
      const apiRes = await fetch(
        `https://www.fatsoma.com/api/v1/event/${id}`,
        {
          headers: {
            "Accept": "application/json",
            "User-Agent": "Exeticket/1.0",
          },
        }
      );

      if (!apiRes.ok) {
        return res.status(apiRes.status).json({
          error: `Fatsoma API returned ${apiRes.status}`,
          detail: "Check the event ID is correct and the event is listed on Fatsoma.",
        });
      }

      const data = await apiRes.json();

      // Fatsoma response shape:
      // data.event.name, data.event.venue.name
      // data.event.start_datetime (ISO), data.event.end_datetime (ISO)
      // data.event.ticket_types[] -> { price (string "12.50"), name, sold_out }
      // data.event.cover_image_url, data.event.description

      const ev    = data.event;
      const open  = parseDateTime(ev.start_datetime);
      const close = parseDateTime(ev.end_datetime);

      const availableTickets = (ev.ticket_types || []).filter(t => !t.sold_out);
      const floor = availableTickets.length
        ? Math.min(...availableTickets.map(t => parseFloat(t.price || "0")))
        : 0;

      return res.status(200).json({
        id:         `fatsoma-${id}`,
        title:      ev.name,
        venue:      ev.venue?.name || "Venue TBC",
        city:       ev.venue?.city || "Exeter",
        date:       open.date,
        iso:        open.iso,
        door:       open.time,
        close:      close.time,
        tag:        "Club Night",
        listings:   0,
        floor:      floor,
        blurb:      ev.description || "",
        img:        ev.cover_image_url || "",
        source:     "Fatsoma",
        sourceUrl:  `https://www.fatsoma.com/e/${id}`,
        rawTickets: (ev.ticket_types || []).map(t => ({
          name:    t.name,
          price:   parseFloat(t.price),
          soldOut: t.sold_out,
        })),
      });

    } catch (err) {
      console.error("Fatsoma fetch error:", err);
      return res.status(502).json({ error: "Failed to reach Fatsoma API", detail: err.message });
    }
  }

  return res.status(400).json({ error: `Unknown platform: ${platform}. Use 'fixr' or 'fatsoma'.` });
}
