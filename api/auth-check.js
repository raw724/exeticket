// api/auth-check.js
// ─────────────────────────────────────────────────────────────────────────────
// Server-side auth helper.
// Call this at the start of any API route that requires a logged-in user.
// Verifies the Supabase JWT and ensures the email ends in @exeter.ac.uk.
//
// Required env vars:
//   SUPABASE_URL=https://xxx.supabase.co
//   SUPABASE_SERVICE_KEY=eyJ...
//
// Usage in other API routes:
//   import { requireAuth } from "./auth-check.js";
//
//   export default async function handler(req, res) {
//     const user = await requireAuth(req, res);
//     if (!user) return; // requireAuth already sent the 401
//     // ... rest of your handler
//   }
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const ALLOWED_DOMAIN = "@exeter.ac.uk";

// ─────────────────────────────────────────────────────────────────────────────
// requireAuth — call at the top of any protected API route
// Returns the user object if valid, or sends a 401/403 and returns null.
// ─────────────────────────────────────────────────────────────────────────────
export async function requireAuth(req, res) {
  // Extract Bearer token from Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return null;
  }

  const token = authHeader.replace("Bearer ", "").trim();

  // Verify the JWT with Supabase
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    res.status(401).json({ error: "Invalid or expired session" });
    return null;
  }

  // Enforce @exeter.ac.uk email — even if they somehow got a valid JWT
  if (!user.email || !user.email.endsWith(ALLOWED_DOMAIN)) {
    res.status(403).json({
      error: "Access restricted to Exeter University students",
      detail: `Your email (${user.email}) is not an @exeter.ac.uk address.`,
    });
    return null;
  }

  return user;
}

// auth-check is a shared helper only — no standalone endpoint
