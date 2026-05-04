// api/verify-ticket.js
// ─────────────────────────────────────────────────────────────────────────────
// Vercel serverless function.
// Save this file as: /api/verify-ticket.js in your project root.
//
// Receives a ticket screenshot as base64 + the expected event details.
// Sends it to GPT-4o Vision with a strict prompt.
// Returns a structured pass/fail result for each check.
//
// Environment variable needed (add in Vercel dashboard):
//   OPENAI_API_KEY=sk-...
// ─────────────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { imageBase64, imageMimeType, event } = req.body;

  if (!imageBase64 || !event) {
    return res.status(400).json({ error: "Missing imageBase64 or event" });
  }

  // Validate we have an API key
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY not configured" });
  }

  // ── Build the GPT-4o Vision prompt ───────────────────────────────────────
  // We ask GPT-4o to act as a ticket verification system.
  // We give it the expected values and ask it to find them in the image.
  // Crucially we ask it to check the QR code is fully visible.

  const systemPrompt = `You are a ticket verification system for Exeticket, a student ticket resale platform.
You will be shown a screenshot of an event ticket and a set of expected values.
Your job is to check each field and return a structured JSON response.
Be strict — partial matches, fuzzy dates or cropped QR codes should fail.
Never invent information. If you cannot read something clearly, mark it as failed.`;

  const userPrompt = `Check this ticket screenshot against these expected values:

Expected event title: "${event.title}"
Expected venue: "${event.venue}"
Expected date: "${event.date}"
Expected doors time: "${event.door}"

Perform exactly these 5 checks and return ONLY valid JSON, no other text:

{
  "pass": true or false (true only if ALL 5 checks pass),
  "failReason": "Short explanation if pass is false, otherwise empty string",
  "checks": [
    {
      "key": "QR code visible & scannable",
      "found": "describe what you see in the QR area",
      "match": true or false,
      "detail": "Is a complete, unobstructed QR code visible? Is it sharp enough to be scanned? Fail if: cropped, blurred, screenshot-of-screenshot, partially hidden, or any overlay covering it."
    },
    {
      "key": "Event name",
      "found": "exact text you read from the ticket",
      "match": true or false,
      "detail": "Does the event name on the ticket closely match '${event.title}'? Minor case or punctuation differences are OK. Different event names are not."
    },
    {
      "key": "Venue",
      "found": "exact venue text you read from the ticket",
      "match": true or false,
      "detail": "Does the venue on the ticket match '${event.venue}'?"
    },
    {
      "key": "Date",
      "found": "exact date text you read from the ticket",
      "match": true or false,
      "detail": "Does the date on the ticket match '${event.date}'? Different dates must fail."
    },
    {
      "key": "Doors time",
      "found": "exact time text you read from the ticket",
      "match": true or false,
      "detail": "Does the entry/doors time on the ticket match '${event.door}'? If no time is visible on the ticket, mark as true — not all platforms show it."
    }
  ]
}`;

  // ── Call GPT-4o Vision ───────────────────────────────────────────────────
  try {
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 800,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:${imageMimeType};base64,${imageBase64}`,
                  detail: "high", // high detail so it can read fine text and QR codes
                },
              },
              {
                type: "text",
                text: userPrompt,
              },
            ],
          },
        ],
        response_format: { type: "json_object" }, // force JSON response
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error("OpenAI error:", errText);
      return res.status(502).json({ error: "OpenAI API error", detail: errText });
    }

    const openaiData = await openaiRes.json();
    const rawContent = openaiData.choices?.[0]?.message?.content;

    if (!rawContent) {
      return res.status(502).json({ error: "Empty response from OpenAI" });
    }

    // Parse the JSON GPT-4o returned
    let result;
    try {
      result = JSON.parse(rawContent);
    } catch {
      console.error("Failed to parse OpenAI JSON:", rawContent);
      return res.status(502).json({ error: "Could not parse verification result", raw: rawContent });
    }

    // Validate shape
    if (typeof result.pass !== "boolean" || !Array.isArray(result.checks)) {
      return res.status(502).json({ error: "Unexpected response shape from OpenAI", raw: result });
    }

    // Log for admin audit trail (in production, write to your DB instead)
    console.log("Ticket verification result:", {
      eventTitle: event.title,
      pass: result.pass,
      failReason: result.failReason,
      timestamp: new Date().toISOString(),
    });

    return res.status(200).json(result);

  } catch (err) {
    console.error("verify-ticket handler error:", err);
    return res.status(500).json({ error: err.message });
  }
}
