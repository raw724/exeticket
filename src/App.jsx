import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from "react";
import { createClient } from '@supabase/supabase-js';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

// ── Supabase client (reads from Vite env vars) ────────────────────────────────
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || '',
  import.meta.env.VITE_SUPABASE_ANON_KEY || ''
);

// ── Stripe (reads publishable key from env) ───────────────────────────────────
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');

/* ─── DESIGN TOKENS ─────────────────────────────────────────────────────────── */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@700&display=swap');
  

  :root {
    --paper: #FFFFFF;
    --paper-2: #F4F4F2;
    --ink: #0B0B0C;
    --ink-2: #1B1B1D;
    --ink-mute: oklch(0.45 0.01 240);
    --ink-faint: oklch(0.72 0.005 240);
    --rule: oklch(0.88 0.005 240);
    --accent: #00DEA5;
    --accent-fg: #003D2D;
    --accent-soft: #e0faf3;
    --accent-deep: #00C491;
    --danger: oklch(0.62 0.20 28);
    --ok: oklch(0.70 0.16 150);
    --serif: 'New York', 'Georgia', serif;
    --sans: -apple-system, 'SF Pro Text', 'SF Pro Display', BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;
    --mono: 'SF Mono', ui-monospace, 'Menlo', monospace;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: var(--sans); background: var(--paper); color: var(--ink);
    -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }

  .mono { font-family: var(--mono); font-feature-settings: "tnum"; }
  .serif { font-family: var(--serif); }
  .cap { text-transform: uppercase; letter-spacing: 0.08em; font-size: 11px; }
  .cap-sm { text-transform: uppercase; letter-spacing: 0.12em; font-size: 10px; }
  .rule-ink { border: 0; border-top: 1px solid var(--ink); }

  .btn {
    font-family: var(--sans); font-weight: 500; font-size: 14px;
    padding: 12px 20px; border: 1px solid var(--ink);
    background: var(--ink); color: var(--paper);
    cursor: pointer; letter-spacing: 0.02em;
    transition: transform .15s ease, background .2s, color .2s;
    display: inline-flex; align-items: center; gap: 8px;
  }
  .btn:hover { transform: translateY(-1px); }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
  .btn-ghost { background: transparent; color: var(--ink); }
  .btn-ghost:hover { background: var(--ink); color: var(--paper); }
  .btn-accent { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
  .btn-accent:hover { background: var(--accent-deep); border-color: var(--accent-deep); }
  .btn-sm { padding: 8px 14px; font-size: 12px; }
  .btn-lg { padding: 16px 28px; font-size: 15px; }

  .field {
    border: 1px solid var(--ink); background: transparent;
    padding: 14px 16px; font-family: var(--sans); font-size: 15px;
    width: 100%; color: var(--ink);
  }
  .field:focus { outline: 2px solid var(--accent); outline-offset: -2px; }

  .badge {
    display: inline-flex; align-items: center; gap: 6px;
    font-family: var(--mono); font-size: 10px; letter-spacing: 0.08em;
    text-transform: uppercase; padding: 4px 8px;
    border: 1px solid var(--ink); background: var(--paper);
  }
  .badge-accent { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
  .badge-ink { background: var(--ink); color: var(--paper); }
  .badge-ok { background: var(--ok); color: var(--paper); border-color: var(--ok); }

  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); display: inline-block; }
  .dot-pulse { position: relative; }
  .dot-pulse::after {
    content: ''; position: absolute; inset: -4px; border-radius: 50%;
    border: 1px solid var(--accent); animation: pulse 1.6s ease-out infinite;
  }
  @keyframes pulse {
    0% { transform: scale(0.6); opacity: 1; }
    100% { transform: scale(2.2); opacity: 0; }
  }

  .ticker { overflow: hidden; border-top: 1px solid var(--ink); border-bottom: 1px solid var(--ink);
    background: var(--ink); color: var(--paper); }
  .ticker-track {
    display: inline-flex; white-space: nowrap;
    animation: ticker 60s linear infinite; padding: 10px 0;
  }
  .ticker-track > span {
    display: inline-flex; align-items: center; gap: 12px; padding: 0 24px;
    font-family: var(--mono); font-size: 12px; letter-spacing: 0.04em;
    border-right: 1px solid oklch(0.3 0 0);
  }
  .ticker-track .ac { color: var(--accent); }
  @keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }

  .container { max-width: 1440px; margin: 0 auto; padding: 0 32px; }
  .section { border-top: 1px solid var(--ink); }

  .holo {
    position: relative;
    background: linear-gradient(135deg, oklch(0.95 0.08 110 / 0.6) 0%, oklch(0.85 0.12 200 / 0.5) 25%,
      oklch(0.80 0.15 320 / 0.5) 50%, oklch(0.85 0.12 60 / 0.5) 75%, oklch(0.95 0.08 110 / 0.6) 100%), var(--paper);
    background-size: 200% 200%; animation: holo 6s ease-in-out infinite;
  }
  @keyframes holo { 0%,100% { background-position: 0% 0%; } 50% { background-position: 100% 100%; } }

  .scan-line {
    position: absolute; left: 0; right: 0; height: 2px;
    background: var(--accent); box-shadow: 0 0 12px var(--accent);
    animation: scan 2.4s ease-in-out infinite;
  }
  @keyframes scan { 0% { top: 0%; } 50% { top: 100%; } 100% { top: 0%; } }

  .ph-img {
    background-image: repeating-linear-gradient(135deg, var(--paper-2) 0 8px, var(--paper) 8px 16px);
    position: relative; overflow: hidden;
  }
  .ph-img::after {
    content: attr(data-label); position: absolute; left: 12px; bottom: 10px;
    font-family: var(--mono); font-size: 10px; text-transform: uppercase;
    letter-spacing: 0.12em; color: var(--ink-mute);
  }

  .ink-bg { background: var(--ink); color: var(--paper); }
  .ink-bg .rule { border-top-color: oklch(0.3 0 0); }

  .nav { position: sticky; top: 0; z-index: 50; background: var(--paper); border-bottom: 1px solid var(--ink); }
  .nav-inner { display: flex; align-items: center; justify-content: space-between; padding: 14px 32px; }
  .nav-links { display: flex; gap: 24px; align-items: center; }
  .nav-link {
    font-size: 13px; cursor: pointer; color: var(--ink); text-decoration: none;
    position: relative; padding: 4px 0;
  }
  .nav-link.active::after {
    content: ''; position: absolute; left: 0; right: 0; bottom: -16px;
    height: 2px; background: var(--accent);
  }
  .nav-link:hover { opacity: 0.7; }

  .logo {
    font-family: var(--serif); font-style: italic; font-weight: 500;
    font-size: 26px; letter-spacing: -0.02em;
    display: inline-flex; align-items: center; gap: 8px; cursor: pointer;
  }
  .logo-mark { width: 22px; height: 22px; background: var(--ink); position: relative; display: inline-block; }
  .logo-mark::before { content: ''; position: absolute; inset: 6px; background: var(--accent); }
  .logo-mark::after {
    content: ''; position: absolute; width: 6px; height: 6px; border-radius: 50%;
    background: var(--paper); top: -3px; right: -3px; box-shadow: -16px 12px 0 var(--paper);
  }

  .menu {
    position: absolute; top: calc(100% + 8px); right: 0;
    background: var(--paper); border: 1px solid var(--ink);
    min-width: 240px; z-index: 60; box-shadow: 0 16px 40px -16px rgba(0,0,0,0.2);
  }
  .menu-item {
    padding: 12px 16px; cursor: pointer; font-size: 13px;
    border-bottom: 1px solid var(--rule);
    display: flex; justify-content: space-between; align-items: center;
  }
  .menu-item:last-child { border-bottom: 0; }
  .menu-item:hover { background: var(--paper-2); }

  .modal-backdrop {
    position: fixed; inset: 0; z-index: 100;
    background: rgba(11,11,12,0.55);
    display: flex; align-items: center; justify-content: center; padding: 24px;
  }
  .modal {
    background: var(--paper); border: 1px solid var(--ink);
    max-width: 640px; width: 100%; max-height: 90vh; overflow: auto;
  }
  .shake { animation: shake 0.4s; }
  @keyframes shake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }

  .fade-in { animation: fadeIn .35s ease; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

  .step-dot { width: 14px; height: 14px; border: 1px solid var(--ink); display: inline-block; position: relative; }
  .step-dot.done { background: var(--accent); border-color: var(--accent); }
  .step-dot.done::after {
    content: '✓'; position: absolute; inset: 0; display: flex;
    align-items: center; justify-content: center; font-size: 9px; font-weight: 700; color: var(--accent-fg);
  }
  .step-dot.active::after { content: ''; position: absolute; inset: 3px; background: var(--ink); }

  .spin {
    width: 14px; height: 14px; border: 1.5px solid var(--ink);
    border-right-color: transparent; border-radius: 50%;
    animation: spin .8s linear infinite; display: inline-block;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-track { background: var(--paper); }
  ::-webkit-scrollbar-thumb { background: var(--ink); }
  ::selection { background: var(--accent); color: var(--accent-fg); }
`;

/* ─── MOCK DATA ─────────────────────────────────────────────────────────────── */
const EVENTS = [
  { id:"tp-thu-may7", title:"Timepiece — Cheesy Tuesday", venue:"Timepiece", date:"Thu 07 May 2026", iso:"2026-05-07T22:00:00", door:"22:00", close:"03:00", tag:"Tuesday Institution", listings:47, floor:8.50, ceiling:14.00, blurb:"The Tuesday that's somehow on a Thursday this week. Cheese, sticky floors, the works.", img:"Crowd at TP, smoke + green lasers" },
  { id:"move-fri-may8", title:"MOVE x Sub Focus", venue:"Move @ Lemmy", date:"Fri 08 May 2026", iso:"2026-05-08T23:00:00", door:"23:00", close:"04:00", tag:"DnB / Bass", listings:23, floor:22.00, ceiling:38.50, blurb:"Move's biggest booking of the term. Tier 3 already gone on the official site.", img:"Sub Focus on decks, hands up" },
  { id:"phoenix-sat-may9", title:"Phoenix Late — Disco Disco", venue:"Exeter Phoenix", date:"Sat 09 May 2026", iso:"2026-05-09T22:30:00", door:"22:30", close:"02:30", tag:"Disco / House", listings:11, floor:6.00, ceiling:11.00, blurb:"Mirrorball, glitter, the Phoenix back room. Smaller capacity, sells out quietly.", img:"Mirrorball over crowd" },
  { id:"au-summer-ball", title:"AU Summer Ball 2026", venue:"Westpoint Arena", date:"Wed 13 May 2026", iso:"2026-05-13T19:00:00", door:"19:00", close:"01:00", tag:"Sports Socials", listings:84, floor:45.00, ceiling:89.00, blurb:"The big one. Coaches from campus. Don't lose your wristband.", img:"Westpoint stage, fairy lights" },
  { id:"cavern-indie", title:"The Cavern — Slowdive (DJ Set)", venue:"The Cavern", date:"Sun 10 May 2026", iso:"2026-05-10T20:00:00", door:"20:00", close:"01:00", tag:"Indie / Live", listings:6, floor:14.00, ceiling:22.00, blurb:"Intimate, stickered walls, the smell of old amps.", img:"Cavern stage, red light" },
  { id:"unit-techno", title:"UNIT — Anfisa Letyago", venue:"Unit 1", date:"Sat 16 May 2026", iso:"2026-05-16T23:00:00", door:"23:00", close:"05:00", tag:"Techno", listings:19, floor:18.00, ceiling:32.00, blurb:"All-night-long set. Bring water, bring patience.", img:"Strobe wall + silhouettes" },
];

const LISTINGS = [
  { id:"lst-001", eventId:"tp-thu-may7",     seller:"marlow.h",  price:9.50,  type:"Standard Entry",  verified:true, posted:"12 min ago", escrow:"held" },
  { id:"lst-002", eventId:"tp-thu-may7",     seller:"j.patel",   price:8.50,  type:"Standard Entry",  verified:true, posted:"34 min ago", escrow:"held" },
  { id:"lst-003", eventId:"tp-thu-may7",     seller:"rosa.k",    price:12.00, type:"Standard Entry",  verified:true, posted:"1 h ago",    escrow:"held" },
  { id:"lst-004", eventId:"move-fri-may8",   seller:"t.okafor",  price:24.00, type:"Tier 3",          verified:true, posted:"5 min ago",  escrow:"held" },
  { id:"lst-005", eventId:"move-fri-may8",   seller:"alice.w",   price:28.00, type:"Tier 3 + Cloak",  verified:true, posted:"22 min ago", escrow:"held" },
  { id:"lst-006", eventId:"move-fri-may8",   seller:"zane.b",    price:38.50, type:"VIP Booth",       verified:true, posted:"2 h ago",    escrow:"held" },
  { id:"lst-007", eventId:"phoenix-sat-may9",seller:"neha.s",    price:7.00,  type:"Standard",        verified:true, posted:"8 min ago",  escrow:"held" },
  { id:"lst-008", eventId:"au-summer-ball",  seller:"h.weston",  price:65.00, type:"Standard Ticket", verified:true, posted:"3 h ago",    escrow:"held" },
  { id:"lst-009", eventId:"au-summer-ball",  seller:"m.alvarez", price:72.00, type:"Standard Ticket", verified:true, posted:"yesterday",  escrow:"held" },
  { id:"lst-010", eventId:"cavern-indie",    seller:"fin.a",     price:16.00, type:"Standing",        verified:true, posted:"44 min ago", escrow:"held" },
  { id:"lst-011", eventId:"unit-techno",     seller:"yui.k",     price:22.00, type:"Standard",        verified:true, posted:"1 h ago",    escrow:"held" },
  { id:"lst-012", eventId:"tp-thu-may7",     seller:"owen.d",    price:10.00, type:"Standard Entry",  verified:true, posted:"3 min ago",  escrow:"held" },
  { id:"lst-013", eventId:"move-fri-may8",   seller:"rosa.k",    price:32.00, type:"Standard",        verified:true, posted:"just now",  escrow:"held", decay:{ start:32.00, floor:20.00, endsAt:"2026-05-08T23:00:00" } },
  { id:"lst-014", eventId:"au-summer-ball",  seller:"m.alvarez", price:80.00, type:"Standard Ticket", verified:true, posted:"2 h ago",   escrow:"held", decay:{ start:80.00, floor:55.00, endsAt:"2026-05-13T19:00:00" } },
];

const SELLER_REP = {
  "marlow.h":  { sales: 14, disputes: 0, scanRate: 100, tier: "trusted" },
  "j.patel":   { sales: 8,  disputes: 0, scanRate: 100, tier: "trusted" },
  "rosa.k":    { sales: 3,  disputes: 1, scanRate: 96,  tier: "standard" },
  "t.okafor":  { sales: 22, disputes: 0, scanRate: 100, tier: "trusted" },
  "alice.w":   { sales: 6,  disputes: 1, scanRate: 94,  tier: "standard" },
  "zane.b":    { sales: 2,  disputes: 2, scanRate: 88,  tier: "new" },
  "neha.s":    { sales: 11, disputes: 0, scanRate: 100, tier: "trusted" },
  "h.weston":  { sales: 5,  disputes: 0, scanRate: 100, tier: "trusted" },
  "m.alvarez": { sales: 4,  disputes: 1, scanRate: 97,  tier: "standard" },
  "fin.a":     { sales: 19, disputes: 0, scanRate: 100, tier: "trusted" },
  "yui.k":     { sales: 7,  disputes: 0, scanRate: 99,  tier: "trusted" },
  "owen.d":    { sales: 1,  disputes: 0, scanRate: 100, tier: "new" },
};

function sellerTierBadge(handle) {
  const rep = SELLER_REP[handle];
  if (!rep) return null;
  if (rep.tier === "trusted") return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"2px 7px",
      background:"var(--accent)", color:"var(--accent-fg)",
      fontFamily:"var(--mono)", fontSize:10, textTransform:"uppercase", letterSpacing:"0.08em", fontWeight:600 }}>
      ✓ Trusted
    </span>
  );
  if (rep.tier === "standard") return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"2px 7px",
      border:"1px solid var(--rule)",
      fontFamily:"var(--mono)", fontSize:10, textTransform:"uppercase", letterSpacing:"0.08em", color:"var(--ink-mute)" }}>
      Verified
    </span>
  );
  return null;
}

const FEED = [
  { t:"now",  msg:"Sold — TP Thu, £9.50",         kind:"sold" },
  { t:"32s",  msg:"New listing — MOVE Fri, £24.00", kind:"new" },
  { t:"1m",   msg:"Verified ✓ — Phoenix Late, £7.00", kind:"verify" },
  { t:"2m",   msg:"Sold — AU Summer Ball, £65.00", kind:"sold" },
  { t:"3m",   msg:"Price drop — TP Thu £12 → £10", kind:"drop" },
  { t:"4m",   msg:"Verified ✓ — UNIT Sat, £22.00", kind:"verify" },
  { t:"6m",   msg:"Sold — Cavern Sun, £16.00",    kind:"sold" },
  { t:"8m",   msg:"New listing — TP Thu Standard £12.00", kind:"new" },
];

const MY_TICKETS = {
  buying: [
    { id:"tx-201", eventId:"move-fri-may8", price:24.00, status:"ESCROW HELD", sub:"Releases on door check-in · Fri 23:00" }
  ],
  selling: [
    { id:"tx-101", eventId:"tp-thu-may7",     price:9.50,  status:"LIVE", sub:"Listed 12 min ago · 0 watchers", views:4 },
    { id:"tx-102", eventId:"phoenix-sat-may9", price:7.00,  status:"SOLD", sub:"Sold 32 min ago · payout pending check-in", views:18 },
  ],
  attended: [
    { id:"tx-301", eventId:"cavern-indie", price:14.00, status:"USED", sub:"Sun 10 May · Entry confirmed 20:14" }
  ],
};

const DISPUTES = [
  { id:"DSP-7711", eventId:"move-fri-may8",    buyer:"kira.l",  seller:"alice.w",  reason:"QR not scanning at door",          opened:"2m ago",    severity:"high",   status:"open" },
  { id:"DSP-7710", eventId:"tp-thu-may7",      buyer:"sam.t",   seller:"owen.d",   reason:"Duplicate ticket suspected",        opened:"14m ago",   severity:"high",   status:"investigating" },
  { id:"DSP-7708", eventId:"au-summer-ball",   buyer:"p.green", seller:"m.alvarez",reason:"Wrong event date on screenshot",    opened:"1h ago",    severity:"medium", status:"open" },
  { id:"DSP-7705", eventId:"phoenix-sat-may9", buyer:"ines.m",  seller:"neha.s",   reason:"Buyer didn't show — refund?",       opened:"yesterday", severity:"low",    status:"review" },
];

const INFO_CONTENT = {
  escrow: { title:"How escrow works", body:[
    ["01 — Listing","A seller uploads their original ticket screenshot. Our AI scans it securely — reading the event name, venue, date, doors time and barcode against the event registry. If anything doesn't match, the listing is rejected immediately."],
    ["02 — Buyer pays","When you buy, your money goes to Exeticket — never directly to the seller. The listing locks while the transfer settles. The seller's payout is released 48 hours after the event ends, once no disputes have been raised."],
    ["03 — Door check-in","Show the ticket screenshot at the door — this is the exact QR the seller uploaded. No re-issuing, no invalidation. Just show what you bought."],
    ["04 — If anything fails","Something goes wrong at the door? Open a dispute from your Wallet and our team will investigate. Refunds are issued after review — usually within 24 hours."],
  ]},
  refunds: { title:"Refund policy", body:[
    ["Automatic refunds","If you cannot enter the venue using your Exeticket QR, you are refunded in full (including the 99p fee) within 24 hours. We pay the fee out of pocket."],
    ["Cancelled events","If the venue or promoter cancels, all buyers are refunded automatically. Sellers are not paid out — funds return to buyers."],
    ["Buyer no-shows","You did not arrive at the event? No refund. The ticket was valid, the seller did their part."],
    ["Disputes","Any other issue: open a dispute from your Wallet. Average resolution time is under 3 hours."],
  ]},
  disputes: { title:"Dispute resolution", body:[
    ["Open from Wallet","On any ticket in your Wallet you can open a dispute. Seller payout is frozen the moment you do."],
    ["Evidence","Attach any screenshots or relevant information you have. We pull the full ticket and transaction history automatically."],
    ["Trust & Safety review","Every dispute is reviewed by a member of the Exeticket team. We investigate both sides before making a decision."],
    ["Outcome","The large majority of disputes are resolved in favour of the buyer. Sellers who repeatedly trigger disputes are removed from the platform."],
  ]},
  verified: { title:"Verified students", body:[
    ["One account per student","Sign-up requires a valid @exeter.ac.uk email. Your address is verified before your account is activated."],
    ["No off-platform deals","Trying to push a deal off-platform (WhatsApp, Insta) gets you banned. Both sides."],
    ["Annual re-verification","Each September you re-verify with your university email. Keeps grads from lingering."],
  ]},
  about: { title:"About Exeticket", body:[
    ["Built in Exeter","Exeticket was started by a first-year Computer Science student at Exeter after watching a friend lose £85 in a Facebook Marketplace ticket scam in 2024. Built from a dorm room, for Exeter students who deserve better than group chat ticket roulette."],
    ["Why a flat fee","Percentage fees punish people selling higher-priced tickets. 99p covers what it costs to run the platform — nothing more. Simple, fair, fixed."],
    ["Where we run","Exeter only. The whole point is local trust — keeping it small keeps it accountable. No plans to expand."],
    ["Funded by","100% self-funded. No investors, no VC money, no corporate backing. Built and paid for out of pocket."],
  ]},
  terms: { title:"Terms & privacy", body:[
    ["Eligibility","You must be a current Exeter student with a valid @exeter.ac.uk address. Accounts found to be otherwise are removed without refund."],
    ["Data","We store your university email, transaction history, and verified payout details. We do not sell data to anyone."],
    ["Liability","Exeticket is the platform. The contract is between buyer and seller; we hold escrow and adjudicate."],
    ["Cookies","Strictly-necessary only. No analytics tracking, no third-party pixels."],
  ]},
};

/* ─── UTILS ──────────────────────────────────────────────────────────────────── */
const FEE = 0.99;
const fmt = (n) => `£${n.toFixed(2)}`;
const pad = (n) => String(n).padStart(2, "0");

function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  return now;
}

function useCountdown(iso) {
  const now = useNow();
  const target = new Date(iso).getTime();
  let diff = Math.max(0, target - now);
  const d = Math.floor(diff / 86400000); diff -= d * 86400000;
  const h = Math.floor(diff / 3600000); diff -= h * 3600000;
  const m = Math.floor(diff / 60000); diff -= m * 60000;
  const s = Math.floor(diff / 1000);
  return { d, h, m, s, total: target - now };
}

function useDecayPrice(listing) {
  const now = useNow();
  if (!listing?.decay) return listing?.price ?? 0;
  const { start, floor, endsAt } = listing.decay;
  const total = new Date(endsAt).getTime() - (Date.now() - 86400000 * 2); // mock: started 2 days ago
  const elapsed = now - (new Date(endsAt).getTime() - total);
  const pct = Math.min(1, Math.max(0, elapsed / total));
  return Math.max(floor, start - (start - floor) * pct);
}

/* ─── SHARED COMPONENTS ──────────────────────────────────────────────────────── */

function Logo({ onClick, light }) {
  return (
    <div onClick={onClick} style={{ display: "inline-flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="36" height="36" style={{ flexShrink: 0 }}>
        <defs>
          <filter id="softShadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#000000" floodOpacity="0.15"/>
          </filter>
          <radialGradient id="greenField" cx="50%" cy="50%" r="70%" fx="50%" fy="20%">
            <stop offset="0%" stopColor="#00DEA5" />
            <stop offset="100%" stopColor="#00C491" />
          </radialGradient>
        </defs>
        <rect width="400" height="400" rx="40" fill="url(#greenField)" />
        <path d="M 80 50 H 320 A 30 30 0 0 1 350 80 V 170 A 30 30 0 0 0 350 230 V 320 A 30 30 0 0 1 320 350 H 80 A 30 30 0 0 1 50 320 V 230 A 30 30 0 0 0 50 170 V 80 A 30 30 0 0 1 80 50 Z M 145 145 L 200 200 L 145 255 M 255 145 L 200 200 L 255 255"
          fill="none" stroke="#FFFFFF" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" filter="url(#softShadow)"/>
      </svg>
      <span style={{
        fontFamily: "var(--serif)", fontStyle: "italic", fontWeight: 500,
        fontSize: 26, letterSpacing: "-0.02em",
        color: light ? "var(--paper)" : "var(--ink)",
      }}>Exeticket</span>
    </div>
  );
}

function Nav({ route, go, user }) {
  const baseItems = [
    { id: "home",   label: "Home" },
    { id: "browse", label: "Browse" },
    { id: "sell",   label: "Sell" },
    { id: "wallet", label: "Wallet" },
  ];
  // Only show Admin tab to users with admin role
  const items = user?.role === "admin"
    ? [...baseItems, { id: "admin", label: "Admin" }]
    : baseItems;
  const [menuOpen, setMenuOpen] = useState(false);
  const wrap = useRef(null);
  useEffect(() => {
    const onDoc = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  return (
    <nav className="nav">
      <div className="nav-inner">
        <Logo onClick={() => go("home")} />
        <div className="nav-links">
          {items.map((it) => (
            <a key={it.id} className={`nav-link ${route === it.id ? "active" : ""}`} onClick={() => go(it.id)}>{it.label}</a>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div ref={wrap} style={{ position: "relative" }}>
            {!user ? (
              <button className="btn btn-accent btn-sm" onClick={() => go("auth")}>
                Sign in / Register
              </button>
            ) : (
            <button onClick={() => setMenuOpen(!menuOpen)} style={{
              all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
              padding: "4px 8px 4px 4px", border: "1px solid var(--rule)"
            }}>
              <span style={{
                width: 28, height: 28, background: "var(--ink)", color: "var(--paper)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600
              }}>{user.initials}</span>
              <span className="mono" style={{ fontSize: 12 }}>{user.handle}</span>
              <span style={{ fontSize: 9, color: "var(--ink-mute)" }}>▼</span>
            </button>
            )}
            {menuOpen && user && (
              <div className="menu fade-in">
                <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--rule)" }}>
                  <div className="mono cap-sm" style={{ color: "var(--ink-mute)" }}>Signed in as</div>
                  <div className="mono" style={{ fontSize: 13, marginTop: 2 }}>{user.handle}@exeter.ac.uk</div>
                </div>
                <div className="menu-item" onClick={() => { setMenuOpen(false); go("account"); }}>Account settings <span style={{ color: "var(--ink-mute)" }}>›</span></div>
                <div className="menu-item" onClick={() => { setMenuOpen(false); go("wallet"); }}>Wallet <span style={{ color: "var(--ink-mute)" }}>›</span></div>
                <div className="menu-item" onClick={() => { setMenuOpen(false); go("alerts"); }}>Price alerts <span style={{ color: "var(--ink-mute)" }}>›</span></div>
                <div className="menu-item" style={{ color: "var(--danger)" }} onClick={() => { setMenuOpen(false); go("auth"); }}>Sign out</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

function Ticker({ items }) {
  const doubled = [...items, ...items];
  return (
    <div className="ticker">
      <div className="ticker-track">
        {doubled.map((it, i) => (
          <span key={i}>
            <span className="ac">●</span>
            <span style={{ opacity: 0.6 }}>{it.t.padStart(4, " ")}</span>
            <span>{it.msg.toUpperCase()}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Countdown({ iso, compact = false }) {
  const c = useCountdown(iso);
  if (c.total <= 0) return <span className="mono">LIVE NOW</span>;
  if (compact) return <span className="mono" style={{ fontSize: 11, letterSpacing: "0.04em" }}>{c.d > 0 ? `${c.d}D ` : ""}{pad(c.h)}:{pad(c.m)}:{pad(c.s)}</span>;
  return (
    <span className="mono" style={{ fontSize: 13, letterSpacing: "0.04em" }}>
      {c.d > 0 && <><b>{c.d}</b><span style={{ opacity: 0.5 }}>D </span></>}
      <b>{pad(c.h)}</b><span style={{ opacity: 0.5 }}>:</span>
      <b>{pad(c.m)}</b><span style={{ opacity: 0.5 }}>:</span>
      <b>{pad(c.s)}</b>
    </span>
  );
}

function FlatFeeBadge({ size = "md" }) {
  const lg = size === "lg";
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: lg ? 12 : 10,
      padding: lg ? "10px 16px 10px 10px" : "6px 12px 6px 6px",
      border: "1px solid var(--ink)", background: "var(--accent)", color: "var(--accent-fg)",
      fontFamily: "var(--mono)", fontSize: lg ? 12 : 10, letterSpacing: "0.08em", textTransform: "uppercase",
    }}>
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        background: "var(--paper)", color: "var(--ink)",
        fontFamily: "'Poppins', sans-serif",
        fontStyle: "normal", fontSize: lg ? 17 : 12, lineHeight: 1, fontWeight: 700,
        padding: lg ? "4px 10px" : "3px 7px", letterSpacing: "0",
        verticalAlign: "middle",
      }}>99p</span>
      <span>Flat fee · No hidden %</span>
    </div>
  );
}

function EventCard({ event, onOpen, accent = false, large = false }) {
  return (
    <article onClick={onOpen} style={{
      cursor: "pointer", border: "1px solid var(--ink)",
      background: accent ? "var(--ink)" : "var(--paper)",
      color: accent ? "var(--paper)" : "var(--ink)",
      display: "grid", gridTemplateRows: large ? "320px auto" : "200px auto",
      height: "100%", transition: "transform .2s ease",
    }}
      onMouseEnter={(e) => e.currentTarget.style.transform = "translateY(-2px)"}
      onMouseLeave={(e) => e.currentTarget.style.transform = "translateY(0)"}
    >
      <div style={{ borderBottom: `1px solid ${accent ? "var(--paper)" : "var(--ink)"}`, position: "relative", overflow: "hidden", background: accent ? "var(--ink)" : "var(--paper-2)" }}>
        {event.img && (event.img.startsWith("http") || event.img.startsWith("/")) ? (
          <img
            src={event.img}
            alt={event.title}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", minHeight: large ? 320 : 200 }}
            onError={(e) => { e.target.style.display = "none"; e.target.parentNode.querySelector(".ph-img").style.display = "block"; }}
          />
        ) : null}
        <div className="ph-img" data-label={event.title}
          style={{ display: (event.img && (event.img.startsWith("http") || event.img.startsWith("/"))) ? "none" : "block", height: "100%", minHeight: large ? 320 : 200 }}></div>
        <div style={{ position: "absolute", top: 12, right: 12 }}>
          <span className="badge badge-accent"><Countdown iso={event.iso} compact /></span>
        </div>
      </div>
      <div style={{ padding: large ? 24 : 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 8 }}>
          <span className="cap mono" style={{ opacity: 0.7 }}>{event.venue}</span>
          <span className="cap mono" style={{ opacity: 0.7 }}>{event.date}</span>
        </div>
        <h3 className="serif" style={{ margin: 0, fontSize: large ? 36 : 22, fontWeight: 500, lineHeight: 1.05, letterSpacing: "-0.01em" }}>{event.title}</h3>
        <hr style={{ margin: "14px 0", border: 0, borderTop: `1px solid ${accent ? "var(--paper)" : "var(--rule)"}` }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div className="cap-sm mono" style={{ opacity: 0.6 }}>From</div>
            <div className="serif" style={{ fontSize: large ? 28 : 22 }}>{fmt(event.floor)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="cap-sm mono" style={{ opacity: 0.6 }}>Listings</div>
            <div className="mono" style={{ fontSize: large ? 22 : 18, fontWeight: 500 }}>{event.listings}</div>
          </div>
        </div>
      </div>
    </article>
  );
}

function HoloTicket({ event, listing, status = "preview" }) {
  const ref = useRef(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const handleMove = (e) => {
    const r = ref.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width - 0.5) * 16;
    const y = ((e.clientY - r.top) / r.height - 0.5) * -10;
    setTilt({ x: y, y: x });
  };
  const reset = () => setTilt({ x: 0, y: 0 });
  return (
    <div ref={ref} onMouseMove={handleMove} onMouseLeave={reset} style={{ perspective: "1200px" }}>
      <div className="holo" style={{
        border: "1px solid var(--ink)", position: "relative", padding: 24,
        transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
        transition: "transform .12s ease", boxShadow: "0 20px 40px -20px rgba(0,0,0,0.25)"
      }}>
        <div style={{
          position: "absolute", left: -1, top: 0, bottom: 0, width: 28,
          borderRight: "1px dashed var(--ink)",
          background: "repeating-linear-gradient(0deg, transparent 0 12px, var(--ink) 12px 13px)",
          opacity: 0.15,
        }}></div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginLeft: 28 }}>
          <div>
            <div className="cap mono" style={{ marginBottom: 6 }}>EXETICKET · ESCROW</div>
            <h2 className="serif" style={{ fontSize: 32, margin: 0, lineHeight: 1.05, letterSpacing: "-0.01em", maxWidth: 360 }}>{event.title}</h2>
          </div>
          <span className="badge badge-ink">{listing?.type || "STANDARD"}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24, marginTop: 32, marginLeft: 28 }}>
          {[["Venue", event.venue], ["Doors", `${event.date.split(" ")[0]} ${event.door}`], ["Status", status === "held" ? "In escrow" : status === "released" ? "Released" : status === "used" ? "Used at door" : "Preview"]].map(([l, v]) => (
            <div key={l}>
              <div className="cap-sm mono" style={{ opacity: 0.6 }}>{l}</div>
              <div className="serif" style={{ fontSize: 18 }}>{v}</div>
            </div>
          ))}
        </div>
        <hr style={{ margin: "24px 0 16px 28px", border: 0, borderTop: "1px solid var(--ink)", opacity: 0.3 }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginLeft: 28 }}>
          <div className="mono" style={{ fontSize: 11, letterSpacing: "0.08em" }}>REF · EXT-{(listing?.id || "XXXXXXX").toUpperCase().slice(-7)}</div>
          <div style={{ width: 80, height: 80, background: "var(--ink)", color: "var(--paper)", display: "grid", gridTemplateColumns: "repeat(8,1fr)", padding: 6 }}>
            {Array.from({ length: 64 }).map((_, i) => {
              const seed = (i * 9301 + 49297) % 233280;
              const on = seed % 100 > 45;
              const corner = (i < 8 && i % 8 < 3) || (i < 24 && i % 8 === 0) || (i > 39 && i % 8 === 0 && i < 56) || (i % 8 > 4 && i < 24);
              return <span key={i} style={{ background: (on || corner) ? "var(--paper)" : "transparent", width: "100%", aspectRatio: "1/1" }}></span>;
            })}
          </div>
        </div>
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.45) 50%, transparent 65%)",
          backgroundSize: "200% 100%", animation: "holo 4s ease-in-out infinite", mixBlendMode: "overlay"
        }}></div>
      </div>
    </div>
  );
}

const VOUCHER_CODES = { "NOFEE": 0.99, "nofee": 0.99 };

function PriceBreakdown({ price, mode = "buy", voucher = "" }) {
  const discount = VOUCHER_CODES[voucher.trim()] || 0;
  const fee      = Math.max(0, FEE - discount);
  const total    = price + fee;

  if (mode === "sell") return (
    <div style={{ border: "1px solid var(--ink)", padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
        <span className="mono cap-sm" style={{ color: "var(--ink-mute)" }}>Your listing price</span>
        <span className="mono">{fmt(price)}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
        <span className="mono cap-sm" style={{ color: "var(--ink-mute)" }}>Exeticket fee (paid by buyer)</span>
        <span className="mono" style={{ color: "var(--ink-mute)" }}>+£0.99</span>
      </div>
      <hr className="rule-ink" style={{ margin: "12px 0" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span className="cap mono">You receive</span>
        <span className="serif" style={{ fontSize: 28 }}>{fmt(price)}</span>
      </div>
    </div>
  );

  return (
    <div style={{ border: "1px solid var(--ink)", padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
        <span className="mono cap-sm" style={{ color: "var(--ink-mute)" }}>Listing price</span>
        <span className="mono">{fmt(price)}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
        <span className="mono cap-sm" style={{ color: "var(--ink-mute)" }}>Exeticket fee</span>
        <span className="mono">{fee === 0 ? <span style={{ color: "var(--ok)" }}>FREE</span> : `+£${fee.toFixed(2)}`}</span>
      </div>
      {discount > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
          <span className="mono cap-sm" style={{ color: "var(--ok)" }}>✓ Voucher applied ({voucher.trim().toUpperCase()})</span>
          <span className="mono" style={{ color: "var(--ok)" }}>−£{discount.toFixed(2)}</span>
        </div>
      )}
      <hr className="rule-ink" style={{ margin: "12px 0" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span className="cap mono">You pay</span>
        <span className="serif" style={{ fontSize: 28 }}>{fmt(total)}</span>
      </div>
    </div>
  );
}

function Footer({ go, openInfo }) {
  const Link = ({ children, onClick }) => (
    <li onClick={onClick} style={{ cursor: "pointer", listStyle: "none" }}
      onMouseEnter={(e) => e.currentTarget.style.color = "var(--accent)"}
      onMouseLeave={(e) => e.currentTarget.style.color = ""}
    >{children}</li>
  );
  return (
    <footer style={{ borderTop: "1px solid var(--ink)", background: "var(--ink)", color: "var(--paper)" }}>
      <div className="container" style={{ padding: "56px 32px 32px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr repeat(3, 1fr)", gap: 48, marginBottom: 48 }}>
          <div>
            <Logo onClick={() => go("home")} light />
            <p style={{ fontSize: 13, lineHeight: 1.5, marginTop: 14, color: "oklch(0.7 0.01 80)", maxWidth: 340 }}>An Exeter-student-only ticket exchange. Built in Devon. Not affiliated with any venue.</p>
            <div style={{ marginTop: 18 }}><FlatFeeBadge /></div>
          </div>
          {[
            { title: "Marketplace", links: [{ l: "Browse listings", a: () => go("browse") }, { l: "Sell a ticket", a: () => go("sell") }, { l: "My wallet", a: () => go("wallet") }, { l: "Price alerts", a: () => go("alerts") }] },
            { title: "Trust", links: [{ l: "How escrow works", a: () => openInfo("escrow") }, { l: "Refund policy", a: () => openInfo("refunds") }, { l: "Dispute resolution", a: () => openInfo("disputes") }, { l: "Verified students", a: () => openInfo("verified") }] },
            { title: "Company", links: [{ l: "About", a: () => openInfo("about") }, { l: "Terms & privacy", a: () => openInfo("terms") }] },
          ].map(({ title, links }) => (
            <div key={title}>
              <div className="cap mono" style={{ color: "var(--accent)" }}>{title}</div>
              <ul style={{ padding: 0, margin: "14px 0 0", display: "grid", gap: 10 }}>
                {links.map(({ l, a }) => <Link key={l} onClick={a}>{l}</Link>)}
              </ul>
            </div>
          ))}
        </div>
        <hr style={{ border: 0, borderTop: "1px solid oklch(0.3 0 0)" }} />
        <div style={{ display: "flex", justifyContent: "space-between", padding: "24px 0 0", alignItems: "center" }}>
          <span className="mono cap-sm" style={{ color: "oklch(0.6 0.01 80)" }}>© 2026 Exeticket Ltd · Made in Exeter, Devon</span>
          <span className="mono cap-sm" style={{ color: "oklch(0.6 0.01 80)" }}>v2.4 · {new Date().toLocaleString("en-GB")}</span>
        </div>
      </div>
    </footer>
  );
}

function InfoModal({ kind, onClose }) {
  if (!kind) return null;
  const c = INFO_CONTENT[kind];
  if (!c) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal fade-in" onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "24px 28px", borderBottom: "1px solid var(--ink)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div className="cap mono" style={{ color: "var(--ink-mute)" }}>§ Exeticket</div>
            <h2 className="serif" style={{ fontSize: 32, fontStyle: "italic", fontWeight: 400, margin: "6px 0 0" }}>{c.title}</h2>
          </div>
          <button onClick={onClose} style={{ all: "unset", cursor: "pointer", fontSize: 20 }}>✕</button>
        </div>
        <div style={{ padding: "24px 28px" }}>
          {c.body.map(([h, b], i) => (
            <div key={i} style={{ padding: "14px 0", borderBottom: "1px solid var(--rule)" }}>
              <div className="cap mono" style={{ color: "var(--accent)", marginBottom: 6 }}>{h}</div>
              <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0 }}>{b}</p>
            </div>
          ))}
        </div>
        <div style={{ padding: "18px 28px", background: "var(--paper-2)", display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

/* ─── HOME SCREEN ────────────────────────────────────────────────────────────── */
function LiveFeed() {
  const [items, setItems] = useState(FEED.slice(0, 6));
  useEffect(() => {
    const id = setInterval(() => {
      setItems((prev) => {
        const sample = ["TP Thu, £9.50", "MOVE Fri, £24", "Phoenix £7", "UNIT Sat £22", "AU Ball £65", "Cavern £14"];
        const verbs = ["Sold", "Verified ✓", "New listing", "Price drop", "Sold", "Verified ✓"];
        const i = Math.floor(Math.random() * sample.length);
        const j = Math.floor(Math.random() * verbs.length);
        const newItem = { t: "now", msg: `${verbs[j]} — ${sample[i]}`, kind: "sold" };
        return [newItem, ...prev.slice(0, 5)].map((it, idx) => ({ ...it, t: idx === 0 ? "now" : `${idx * 8}s` }));
      });
    }, 3200);
    return () => clearInterval(id);
  }, []);
  return (
    <div>
      {items.map((it, i) => (
        <div key={`${it.msg}-${i}`} className={i === 0 ? "fade-in" : ""} style={{
          display: "flex", justifyContent: "space-between", alignItems: "baseline",
          padding: "10px 0", borderBottom: "1px solid var(--rule)", opacity: 1 - i * 0.1
        }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: i === 0 ? "var(--accent)" : "var(--ink)" }}></span>
            <span style={{ fontSize: 13 }}>{it.msg}</span>
          </div>
          <span className="mono cap-sm" style={{ color: "var(--ink-mute)" }}>{it.t}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── LIVE STATS BAR ─────────────────────────────────────────────────────────── */
function AnimatedNumber({ value, prefix = "", suffix = "" }) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    if (value === prevRef.current) return;
    const start = prevRef.current;
    const end   = value;
    const isNum = typeof end === "number";
    if (!isNum) { setDisplay(end); prevRef.current = end; return; }
    const diff     = end - start;
    const duration = 800;
    const startTs  = performance.now();
    const tick = (now) => {
      const pct = Math.min(1, (now - startTs) / duration);
      const ease = 1 - Math.pow(1 - pct, 3); // ease-out cubic
      setDisplay(Math.round(start + diff * ease));
      if (pct < 1) requestAnimationFrame(tick);
      else { setDisplay(end); prevRef.current = end; }
    };
    requestAnimationFrame(tick);
  }, [value]);

  return <span>{prefix}{typeof display === "number" ? display.toLocaleString() : display}{suffix}</span>;
}

function LiveStatsBar() {
  const [stats, setStats] = useState({
    listings:  47,
    students:  2194,
    scanRate:  99.4,
  });
  const [pulse, setPulse] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      // Fetch live listing count from DB
      const [listingsRes, usersRes] = await Promise.all([
        supabase.from("listings").select("id", { count: "exact", head: true }).eq("status", "available"),
        supabase.from("users").select("id", { count: "exact", head: true }),
      ]);
      const newStats = {
        listings: listingsRes.count ?? stats.listings,
        students:  usersRes.count   ?? stats.students,
        scanRate:  99.4, // pulled from transactions table in future
      };
      // Only update + pulse if something changed
      if (newStats.listings !== stats.listings || newStats.students !== stats.students) {
        setStats(newStats);
        setPulse(true);
        setTimeout(() => setPulse(false), 600);
      }
    } catch {
      // Keep showing last known values if DB not reachable
    }
  }, [stats]);

  // Fetch on mount
  useEffect(() => { fetchStats(); }, []);

  // Refresh every 30 seconds
  useEffect(() => {
    const id = setInterval(fetchStats, 30000);
    return () => clearInterval(id);
  }, [fetchStats]);

  // Supabase Realtime — update instantly when a listing is added or removed
  useEffect(() => {
    const channel = supabase
      .channel("stats-listings")
      .on("postgres_changes", { event: "*", schema: "public", table: "listings" }, () => {
        fetchStats();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "users" }, () => {
        fetchStats();
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [fetchStats]);

  const items = [
    {
      value: <AnimatedNumber value={stats.listings} />,
      label: "Live listings right now",
      live: true,
    },
    {
      value: <AnimatedNumber value={stats.students} />,
      label: "Verified students",
      live: false,
    },
    {
      value: <AnimatedNumber value={99.4} suffix="%" />,
      label: "Door scan success rate",
      live: false,
    },
    {
      value: "99p",
      label: "Flat fee. Always.",
      live: false,
    },
  ];

  return (
    <section className="section">
      <div className="container" style={{ padding: "48px 32px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderLeft: "1px solid var(--ink)" }}>
          {items.map((s, i) => (
            <div key={i} style={{
              borderRight: "1px solid var(--ink)", padding: "8px 24px",
              transition: "background .3s",
              background: pulse && s.live ? "oklch(0.96 0.05 150)" : "transparent",
            }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <div className="serif" style={{ fontSize: 48, lineHeight: 1, fontStyle: "italic", fontWeight: 400 }}>
                  {s.value}
                </div>
                {s.live && (
                  <span style={{
                    width: 7, height: 7, borderRadius: "50%",
                    background: "var(--accent)", display: "inline-block",
                    boxShadow: "0 0 0 0 var(--accent)",
                    animation: "pulse 2s ease-out infinite",
                    flexShrink: 0, marginBottom: 4,
                  }} />
                )}
              </div>
              <div className="cap mono" style={{ marginTop: 10, color: "var(--ink-mute)" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HomeScreen({ go, setSelectedEvent, openInfo }) {
  const [events, setEvents] = useState(EVENTS);

  useEffect(() => {
    fetch('/api/events')
      .then(r => r.json())
      .then(data => { if (data.events?.length > 0) setEvents(data.events); })
      .catch(() => {}); // keep mock data if API not deployed yet
  }, []);

  const featured = events[0];
  const more = events.slice(1);
  const openEvent = (ev) => { setSelectedEvent(ev); go("detail"); };

  return (
    <div className="fade-in">
      <div className="container" style={{ padding: "56px 32px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 56, padding: "40px 0 32px", alignItems: "center" }}>
          <div>
            <h1 style={{ fontSize: "clamp(48px, 7vw, 96px)", lineHeight: 0.95, letterSpacing: "-0.03em", fontWeight: 700, margin: 0 }}>
              Resold,<br />
              <span style={{ fontStyle: "normal" }}>verified,</span><br />
              <span style={{ background: "var(--accent)", color: "var(--accent-fg)", padding: "2px 14px", display: "inline-block", marginTop: 8, borderRadius: 4 }}>safe.</span>
            </h1>
            <p style={{ fontSize: 18, lineHeight: 1.5, maxWidth: 520, marginTop: 32, color: "var(--ink-mute)" }}>
              The Exeter student ticket exchange. AI scans every ticket screenshot to verify it's genuine before it goes live — checking the event, venue, date and QR code. Funds sit in escrow until you're through the door. One flat 99p fee.
            </p>
            <div style={{ display: "flex", gap: 12, marginTop: 32, flexWrap: "wrap", alignItems: "center" }}>
              <button className="btn btn-accent btn-lg" onClick={() => go("browse")}>Browse listings <span>→</span></button>
              <button className="btn btn-ghost btn-lg" onClick={() => go("sell")}>Sell a ticket</button>
              <FlatFeeBadge size="lg" />
            </div>
          </div>

        </div>
      </div>

      <section className="container" style={{ padding: "56px 32px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 24 }}>
          <h2 className="serif" style={{ fontSize: 32, margin: 0, fontStyle: "italic", fontWeight: 400 }}>Tonight & this week</h2>
          <a className="cap mono" style={{ cursor: "pointer" }} onClick={() => go("browse")}>See all 47 events ↗</a>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 24 }}>
          <EventCard event={featured} onOpen={() => openEvent(featured)} large accent />
          <div style={{ display: "grid", gap: 24, gridTemplateRows: "1fr 1fr" }}>
            {more.slice(0, 2).map((ev) => <EventCard key={ev.id} event={ev} onOpen={() => openEvent(ev)} />)}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24, marginTop: 24 }}>
          {more.slice(2, 5).map((ev) => <EventCard key={ev.id} event={ev} onOpen={() => openEvent(ev)} />)}
        </div>
      </section>

      <section className="section" style={{ background: "var(--ink)", color: "var(--paper)" }}>
        <div className="container" style={{ padding: "72px 32px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 40 }}>
            <span className="cap mono" style={{ color: "var(--accent)" }}>§ Method</span>
            <span className="cap mono" style={{ opacity: 0.6 }}>How escrow works</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 32 }}>
            {[
              { n: "01", t: "Seller uploads", d: "Screenshot of the original ticket. Our scanner reads event, date, time, seat, barcode." },
              { n: "02", t: "We verify", d: "Match against the event registry. Fail = listing rejected. Pass = goes live in escrow." },
              { n: "03", t: "Buyer pays", d: "Funds held by Exeticket — never touch the seller. Your payout is released 48 hours after the event ends." },
              { n: "04", t: "Door check-in", d: "Buyer scans at the door. Only then is the seller paid out. Refunds if it fails." },
            ].map((s) => (
              <div key={s.n}>
                <div className="mono" style={{ fontSize: 64, lineHeight: 1, color: "var(--accent)", fontWeight: 300 }}>{s.n}</div>
                <h3 className="serif" style={{ fontSize: 24, marginTop: 16, marginBottom: 8, fontWeight: 400 }}>{s.t}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.55, color: "oklch(0.78 0.01 80)", margin: 0 }}>{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <LiveStatsBar />

      <Footer go={go} openInfo={openInfo} />
    </div>
  );
}

/* ─── BROWSE SCREEN ──────────────────────────────────────────────────────────── */
function BrowseScreen({ go, setSelectedEvent, openInfo }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("time");
  const [events, setEvents] = useState(EVENTS);

  useEffect(() => {
    fetch('/api/events')
      .then(r => r.json())
      .then(data => { if (data.events?.length > 0) setEvents(data.events); })
      .catch(() => {});
  }, []);

  const rows = useMemo(() => {
    return events.map((ev) => {
      const lst = LISTINGS.filter((l) => l.eventId === ev.id || l.event_id === ev.id);
      return { ev, listings: lst, floor: lst.length ? Math.min(...lst.map((l) => l.price)) : ev.floor };
    }).filter((r) => {
      if (q && !`${r.ev.title} ${r.ev.venue} ${r.ev.tag || ''}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    }).sort((a, b) => {
      if (sort === "price-asc") return a.floor - b.floor;
      if (sort === "price-desc") return b.floor - a.floor;
      if (sort === "listings") return b.listings.length - a.listings.length;
      return new Date(a.ev.iso) - new Date(b.ev.iso);
    });
  }, [q, sort, events]);

  return (
    <div className="fade-in">
      <div className="container" style={{ padding: "40px 32px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
          <div>
            <div className="cap mono" style={{ color: "var(--ink-mute)" }}>§ Browse</div>
            <h1 className="serif" style={{ fontSize: 64, fontStyle: "italic", fontWeight: 400, margin: "12px 0 0", letterSpacing: "-0.02em", lineHeight: 0.95 }}>What's on, who's selling.</h1>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="mono" style={{ fontSize: 36 }}>{rows.reduce((a, r) => a + r.listings.length, 0)}</div>
            <div className="cap mono" style={{ color: "var(--ink-mute)" }}>active listings</div>
          </div>
        </div>
        <hr className="rule-ink" />
        <div style={{ padding: "24px 0", display: "grid", gridTemplateColumns: "1fr auto", gap: 16 }}>
          <div style={{ position: "relative" }}>
            <input className="field" placeholder="Search events, venues, artists..." value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 44 }} />
            <span style={{ position: "absolute", left: 16, top: 14, opacity: 0.5 }}>⌕</span>
          </div>
          <select className="field" value={sort} onChange={(e) => setSort(e.target.value)} style={{ width: "auto" }}>
            {[{ id: "time", label: "Soonest first" }, { id: "price-asc", label: "Price ↑" }, { id: "price-desc", label: "Price ↓" }, { id: "listings", label: "Most listings" }].map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </div>
        <hr className="rule-ink" />
        <div style={{ padding: "8px 0 64px" }}>
          {rows.map((r, idx) => {
            return (
              <div key={r.ev.id} style={{ borderBottom: "1px solid var(--ink)" }}>
                <div onClick={() => { setSelectedEvent(r.ev); go("detail"); }} style={{
                  display: "grid", gridTemplateColumns: "72px 1fr auto auto auto auto", gap: 24,
                  padding: "24px 0", cursor: "pointer", alignItems: "center",
                }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "var(--paper-2)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = ""}
                >
                  <div className="mono" style={{ fontSize: 14, color: "var(--ink-mute)" }}>{String(idx + 1).padStart(2, "0")}</div>
                  <div>
                    <div className="cap-sm mono" style={{ color: "var(--ink-mute)", marginBottom: 6 }}>{r.ev.venue} · {r.ev.tag}</div>
                    <div className="serif" style={{ fontSize: 28, lineHeight: 1.05, fontWeight: 400 }}>{r.ev.title}</div>
                  </div>
                  <div className="mono" style={{ fontSize: 13, minWidth: 140 }}>{r.ev.date}<br /><span style={{ color: "var(--ink-mute)" }}>doors {r.ev.door}</span></div>
                  <div style={{ minWidth: 120, textAlign: "right" }}>
                    <div className="cap-sm mono" style={{ color: "var(--ink-mute)" }}>countdown</div>
                    <Countdown iso={r.ev.iso} />
                  </div>
                  <div style={{ minWidth: 100, textAlign: "right" }}>
                    <div className="cap-sm mono" style={{ color: "var(--ink-mute)" }}>from</div>
                    <div className="serif" style={{ fontSize: 24 }}>{fmt(r.floor)}</div>
                  </div>
                  <div style={{ minWidth: 80, textAlign: "right" }}>
                    <span className="badge badge-ink">{r.listings.length} listings</span>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      </div>
      <Footer go={go} openInfo={openInfo} />
    </div>
  );
}

/* ─── DETAIL SCREEN ──────────────────────────────────────────────────────────── */
function DecayPrice({ listing }) {
  const price = useDecayPrice(listing);
  if (!listing.decay) return <span style={{ fontSize:36, fontFamily:"var(--serif)", fontWeight:400 }}>{fmt(listing.price)}</span>;
  const pct = Math.round(((listing.decay.start - price) / (listing.decay.start - listing.decay.floor)) * 100);
  return (
    <div>
      <div style={{ fontSize:36, fontFamily:"var(--serif)", fontWeight:400 }}>{fmt(price)}</div>
      <div style={{ fontSize:11, fontFamily:"var(--mono)", textTransform:"uppercase", letterSpacing:"0.08em", color:"var(--accent-deep)", marginTop:2 }}>
        ↓ Auto-decaying · {pct}% off start
      </div>
    </div>
  );
}

function OfferModal({ listing, event, onClose }) {
  const [offerPrice, setOfferPrice] = useState(Math.max(1, listing.price - 3).toFixed(2));
  const [sent, setSent] = useState(false);
  if (sent) return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal fade-in" style={{ maxWidth:420, padding:40, textAlign:"center" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize:40, marginBottom:16 }}>📲</div>
        <div style={{ fontWeight:700, fontSize:22, marginBottom:8 }}>Offer sent!</div>
        <p style={{ fontSize:14, color:"var(--ink-mute)", lineHeight:1.6, marginBottom:20 }}>
          @{listing.seller} will get a push notification with a one-tap "Accept & sell for {fmt(parseFloat(offerPrice))}" button. If they accept, it goes straight to escrow.
        </p>
        <button className="btn btn-accent" style={{ width:"100%", justifyContent:"center" }} onClick={onClose}>Done</button>
      </div>
    </div>
  );
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal fade-in" style={{ maxWidth:440 }} onClick={e => e.stopPropagation()}>
        <div style={{ padding:"20px 24px", borderBottom:"1px solid var(--ink)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ fontSize:11, fontFamily:"var(--mono)", textTransform:"uppercase", letterSpacing:"0.1em", color:"var(--ink-mute)", marginBottom:4 }}>Make an offer</div>
            <div style={{ fontWeight:700, fontSize:18 }}>Propose a lower price</div>
          </div>
          <button onClick={onClose} style={{ all:"unset", cursor:"pointer", fontSize:18, color:"var(--ink-mute)" }}>✕</button>
        </div>
        <div style={{ padding:"20px 24px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, color:"var(--ink-mute)", marginBottom:16, padding:"12px 14px", background:"var(--paper-2)", border:"1px solid var(--rule)" }}>
            <span>Listed at</span><span style={{ fontWeight:600, color:"var(--ink)" }}>{fmt(listing.price)}</span>
          </div>
          <label style={{ fontSize:12, fontFamily:"var(--mono)", textTransform:"uppercase", letterSpacing:"0.1em", color:"var(--ink-mute)", display:"block", marginBottom:8 }}>Your offer</label>
          <div style={{ position:"relative" }}>
            <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", fontFamily:"var(--serif)", fontSize:26, fontStyle:"italic" }}>£</span>
            <input className="field" type="number" min="1" step="0.50" value={offerPrice} onChange={e => setOfferPrice(e.target.value)} style={{ paddingLeft:36, fontSize:26, fontFamily:"var(--serif)", fontStyle:"italic", height:64 }} />
          </div>
          <div style={{ fontSize:13, color:"var(--ink-mute)", marginTop:10, lineHeight:1.5 }}>
            @{listing.seller} will receive a notification: <b>"Accept &amp; sell for {offerPrice ? fmt(parseFloat(offerPrice)) : "—"}?"</b> — one tap to accept. If they decline or don't respond in 30 min, your offer expires.
          </div>
          <button className="btn btn-accent btn-lg" style={{ width:"100%", justifyContent:"center", marginTop:18 }} disabled={!offerPrice || parseFloat(offerPrice) >= listing.price} onClick={() => setSent(true)}>
            Send offer to @{listing.seller} →
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailScreen({ event, go, setSelectedListing, openInfo, setPrefillSellEvent }) {
  const [offerListing, setOfferListing] = useState(null);
  const [rawListings, setRawListings] = useState(
    LISTINGS.filter(l => l.eventId === event.id || l.event_id === event.id)
  );
  const [listingsLoading, setListingsLoading] = useState(true);

  useEffect(() => {
    setListingsLoading(true);
    fetch(`/api/listings?eventId=${event.id}`)
      .then(r => r.json())
      .then(data => {
        if (data.listings?.length > 0) setRawListings(data.listings);
        setListingsLoading(false);
      })
      .catch(() => setListingsLoading(false));
  }, [event.id]);

  // Sort purely by price — lowest first
  const sorted = [...rawListings].sort((a, b) => a.price - b.price);
  const cheapest = sorted[0] || null;
  const floor = cheapest ? cheapest.price : event.floor;
  const otherCount = sorted.length - 1;

  return (
    <div className="fade-in">
      <section className="ink-bg" style={{ borderBottom: "1px solid var(--ink)" }}>
        <div className="container" style={{ padding: "48px 32px" }}>
          <button className="btn btn-ghost btn-sm" onClick={() => go("browse")} style={{ marginBottom: 24, color: "var(--paper)", borderColor: "var(--paper)" }}>← Browse</button>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 64, alignItems: "center" }}>
            <div>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <span className="badge badge-accent">{event.tag}</span>
                <span className="badge" style={{ color: "var(--paper)", borderColor: "var(--paper)" }}>VERIFIED EVENT</span>
              </div>
              <h1 className="serif" style={{ fontSize: "clamp(56px, 8vw, 110px)", lineHeight: 0.92, fontWeight: 400, letterSpacing: "-0.03em", margin: 0, fontStyle: "italic" }}>{event.title}</h1>
              <p style={{ fontSize: 18, lineHeight: 1.5, marginTop: 24, color: "oklch(0.78 0.01 80)", maxWidth: 520 }}>{event.blurb}</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 24, marginTop: 32, paddingTop: 32, borderTop: "1px solid oklch(0.3 0 0)" }}>
                {[["Venue", event.venue], ["Date", event.date], ["Doors → close", `${event.door} → ${event.close}`]].map(([l, v]) => (
                  <div key={l}>
                    <div className="cap-sm mono" style={{ opacity: 0.6, marginBottom: 6 }}>{l}</div>
                    <div className="serif" style={{ fontSize: 18 }}>{v}</div>
                  </div>
                ))}
                <div>
                  <div className="cap-sm mono" style={{ opacity: 0.6, marginBottom: 6 }}>Doors in</div>
                  <Countdown iso={event.iso} />
                </div>
              </div>
            </div>
            <div className="ph-img" data-label={event.img} style={{ height: 480, border: "1px solid var(--paper)" }}></div>
          </div>
        </div>
      </section>

      <section className="container" style={{ padding: "56px 32px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 56, alignItems: "start" }}>
          <div>
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
                <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Best available listing</h2>
                <span style={{ fontSize: 13, color: "var(--ink-mute)" }}>We always show you the lowest price first</span>
              </div>
              {otherCount > 0 && (
                <div style={{ fontSize: 13, color: "var(--ink-mute)" }}>
                  {otherCount} other listing{otherCount > 1 ? "s" : ""} available at higher prices — you're seeing the cheapest one.
                </div>
              )}
            </div>
            <hr className="rule-ink" />
            <div>
              {cheapest ? (
                <div style={{ padding:"28px 0" }}>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr auto auto", gap:24, alignItems:"center" }}>
                    <div>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8, flexWrap:"wrap" }}>
                        <span style={{ fontSize:13, fontWeight:600 }}>Best available</span>
                        <span style={{ fontSize:11, fontFamily:"var(--mono)", textTransform:"uppercase", letterSpacing:"0.08em", padding:"2px 7px", background:"var(--accent)", color:"var(--accent-fg)", fontWeight:600 }}>Lowest price</span>
                        {sellerTierBadge(cheapest.seller)}
                      </div>
                      <div style={{ fontSize:13, color:"var(--ink-mute)", marginBottom:4 }}>
                        @{cheapest.seller} · {cheapest.posted}
                      </div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <DecayPrice listing={cheapest} />
                      <div className="mono cap-sm" style={{ color:"var(--ink-mute)", marginTop:4 }}>+99p fee = {fmt(cheapest ? cheapest.price + 0.99 : 0)} all-in</div>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                      <button className="btn btn-accent" style={{ fontSize:15, padding:"14px 24px" }} onClick={() => { setSelectedListing(cheapest); go("buy"); }}>Buy →</button>
                      <button className="btn btn-ghost btn-sm" style={{ justifyContent:"center" }} onClick={() => setOfferListing(cheapest)}>Make offer</button>
                    </div>
                  </div>
                  {otherCount > 0 && (
                    <div style={{ marginTop:18, padding:"12px 14px", background:"var(--paper-2)", border:"1px solid var(--rule)", fontSize:13, color:"var(--ink-mute)" }}>
                      {otherCount} other listing{otherCount > 1 ? "s" : ""} exist at higher prices — Trusted Sellers are ranked first, then by price.
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ padding:"48px 0", color:"var(--ink-mute)", fontSize:15 }}>No listings yet for this event.</div>
              )}
              {offerListing && <OfferModal listing={offerListing} event={event} onClose={() => setOfferListing(null)} />}
            </div>
          </div>
          <aside style={{ position: "sticky", top: 80 }}>
            <div style={{ border: "1px solid var(--ink)", padding: 24 }}>
              <div className="cap mono" style={{ color: "var(--ink-mute)" }}>Floor price</div>
              <div className="serif" style={{ fontSize: 64, lineHeight: 1, fontStyle: "italic", margin: "12px 0" }}>{fmt(floor)}</div>
              <div className="mono" style={{ fontSize: 12, color: "var(--ink-mute)" }}>+ 99p buyer fee = {fmt(floor + 0.99)} all-in</div>
              <hr className="rule-ink" style={{ margin: "20px 0" }} />
              <FlatFeeBadge />
              <div style={{ marginTop: 16, fontSize: 13, lineHeight: 1.5, color: "var(--ink-mute)" }}>
                Funds are held in escrow by Exeticket. Sellers are paid after you scan in at the door. Refunds automatic if entry fails.
              </div>
            </div>
            <div style={{ marginTop: 16, border: "1px solid var(--rule)", padding: 18, background: "var(--paper-2)" }}>
              <div className="cap mono" style={{ marginBottom: 8 }}>Watch this event</div>
              <div style={{ fontSize: 13, color: "var(--ink-mute)", marginBottom: 12 }}>Get pinged when a new listing posts under your target.</div>
              <button className="btn btn-ghost btn-sm" style={{ width: "100%", justifyContent: "center" }}>+ Set price alert</button>
            </div>
            <div style={{ marginTop: 12, border: "1px solid var(--ink)", padding: 18, background: "var(--ink)", color: "var(--paper)" }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Got a ticket to sell?</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 14, lineHeight: 1.5 }}>List it for this event in minutes. Upload your screenshot and set your price.</div>
              <button className="btn btn-accent btn-sm" style={{ width: "100%", justifyContent: "center" }}
                onClick={() => { setPrefillSellEvent(event); go("sell"); }}>
                Sell for this event →
              </button>
            </div>
          </aside>
        </div>
      </section>
      <Footer go={go} openInfo={openInfo} />
    </div>
  );
}

/* ─── VOUCHER INPUT ──────────────────────────────────────────────────────────── */
function VoucherInput({ onApply }) {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("idle"); // idle | valid | invalid

  const handleApply = () => {
    const trimmed = code.trim().toUpperCase();
    if (VOUCHER_CODES[trimmed] || VOUCHER_CODES[trimmed.toLowerCase()]) {
      setStatus("valid");
      onApply(trimmed);
    } else {
      setStatus("invalid");
      onApply("");
      setTimeout(() => setStatus("idle"), 2000);
    }
  };

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="field"
          placeholder="Voucher code"
          value={code}
          onChange={(e) => { setCode(e.target.value); setStatus("idle"); if (!e.target.value) onApply(""); }}
          onKeyDown={(e) => e.key === "Enter" && handleApply()}
          style={{ flex: 1, fontSize: 14, padding: "10px 14px",
            borderColor: status === "valid" ? "var(--ok)" : status === "invalid" ? "var(--danger)" : "var(--rule)" }}
        />
        <button className="btn btn-ghost btn-sm" onClick={handleApply} style={{ whiteSpace: "nowrap" }}>
          Apply
        </button>
      </div>
      {status === "valid" && (
        <div style={{ fontSize: 12, color: "var(--ok)", marginTop: 6, fontWeight: 500 }}>
          ✓ Voucher applied — fee waived
        </div>
      )}
      {status === "invalid" && (
        <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 6 }}>
          Invalid voucher code
        </div>
      )}
    </div>
  );
}

/* ─── BUY SCREEN ─────────────────────────────────────────────────────────────── */
function StripeCheckoutForm({ onSuccess, listing }) {
  const stripe   = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true);
    setError(null);
    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    });
    if (stripeError) {
      setError(stripeError.message);
      setLoading(false);
    } else {
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 20 }}>
        <PaymentElement />
      </div>
      {error && (
        <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 14, padding: '10px 12px', border: '1px solid var(--danger)' }}>
          {error}
        </div>
      )}
      <button className="btn btn-accent btn-lg" type="submit" disabled={!stripe || loading}
        style={{ width: '100%', justifyContent: 'center' }}>
        {loading
          ? <><span className="spin" style={{ borderColor: 'var(--accent-fg)', borderRightColor: 'transparent' }}></span> Processing…</>
          : `Pay £${listing ? (listing.price + 0.99).toFixed(2) : ''} →`}
      </button>
      <div style={{ fontSize: 12, color: 'var(--ink-mute)', textAlign: 'center', marginTop: 10 }}>
        Secured by Stripe · Apple Pay & Google Pay accepted
      </div>
    </form>
  );
}

function BuyScreen({ event, listing, go }) {
  const [step, setStep] = useState(0);
  const [clientSecret, setClientSecret] = useState(null);
  const [voucher, setVoucher] = useState("");
  const steps = ["Review", "Pay", "Escrow", "Door"];

  useEffect(() => {
    if (step === 1 && !clientSecret) {
      const session = supabase.auth.session ? supabase.auth.session() : null;
      const token = session?.access_token || '';
      fetch('/api/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          listingId:    listing.id,
          listingPrice: listing.price,
          eventId:      event.id,
          eventTitle:   event.title,
          sellerId:     listing.sellerId || listing.seller_id || '',
          buyerEmail:   supabase.auth.user?.()?.email || '',
        }),
      })
        .then(r => r.json())
        .then(data => { if (data.clientSecret) setClientSecret(data.clientSecret); })
        .catch(err => console.error('Payment setup error:', err));
    }
  }, [step]);

  return (
    <div className="fade-in container" style={{ padding: "48px 32px", maxWidth: 1100 }}>
      <button className="btn btn-ghost btn-sm" onClick={() => go("detail")}>← Back</button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "24px 0" }}>
        <div className="cap mono">§ Checkout · Listing {listing.id.toUpperCase()}</div>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          {steps.map((s, i) => (
            <Fragment key={s}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className={`step-dot ${i < step ? "done" : i === step ? "active" : ""}`}></span>
                <span className="cap mono" style={{ color: i <= step ? "var(--ink)" : "var(--ink-mute)" }}>{s}</span>
              </div>
              {i < steps.length - 1 && <span style={{ width: 18, height: 1, background: "var(--rule)" }}></span>}
            </Fragment>
          ))}
        </div>
      </div>
      <hr className="rule-ink" />
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 48, marginTop: 40, alignItems: "start" }}>
        <div>
          <HoloTicket event={event} listing={listing} status={step >= 2 ? "held" : "preview"} />
          {step === 0 && (
            <div style={{ marginTop: 32, fontSize: 14, color: "var(--ink-mute)", lineHeight: 1.6 }}>
              The ticket above is held in Exeticket escrow. After you pay, the QR is locked to your account and the seller is paid <em>only</em> when you successfully scan in at the door.
            </div>
          )}
          {step === 2 && (
            <div className="fade-in" style={{ marginTop: 32, border: "1px solid var(--ok)", padding: 18, background: "oklch(0.95 0.06 150)" }}>
              <div className="cap mono" style={{ color: "var(--ok)" }}>● Escrow opened</div>
              <div className="serif" style={{ fontSize: 22, marginTop: 6 }}>Ticket reserved for you.</div>
              <p style={{ fontSize: 14, lineHeight: 1.5, color: "var(--ink-mute)", margin: "8px 0 0" }}>
                The QR is in your wallet. We'll release the seller's payout the moment you scan in at {event.venue}, {event.door}.
              </p>
            </div>
          )}
        </div>
        <div style={{ position: "sticky", top: 80 }}>
          {step === 0 && (
            <>
              <div style={{ marginBottom: 18 }}>
                <div className="cap mono" style={{ marginBottom: 8 }}>Your purchase</div>
                <div className="serif" style={{ fontSize: 24, lineHeight: 1.2 }}>{event.title}</div>
                <div className="mono" style={{ fontSize: 13, color: "var(--ink-mute)", marginTop: 6 }}>{event.date} · {event.venue} · {listing.type}</div>
              </div>
              <VoucherInput onApply={setVoucher} />
              <PriceBreakdown price={listing.price} mode="buy" voucher={voucher} />
              <button className="btn btn-accent btn-lg" style={{ width: "100%", marginTop: 18, justifyContent: "center" }} onClick={() => setStep(1)}>
                Continue to payment →
              </button>
              <div className="mono cap-sm" style={{ color: "var(--ink-mute)", textAlign: "center", marginTop: 10 }}>Seller receives full listing price · fee charged to you</div>
            </>
          )}
          {step === 1 && clientSecret && (
            <Elements stripe={stripePromise} options={{ clientSecret }}>
              <StripeCheckoutForm onSuccess={() => setStep(2)} listing={listing} />
            </Elements>
          )}
          {step === 1 && !clientSecret && (
            <div style={{ textAlign: "center", padding: "80px 24px", border: "1px solid var(--ink)" }}>
              <span className="spin" style={{ width: 32, height: 32, borderWidth: 2 }}></span>
              <div style={{ fontSize: 16, fontWeight: 500, marginTop: 20 }}>Preparing checkout…</div>
              <div className="cap mono" style={{ color: "var(--ink-mute)", marginTop: 8 }}>Setting up secure payment</div>
            </div>
          )}
          {step === 2 && (
            <>
              <div style={{ border: "1px solid var(--ink)", padding: 24, background: "var(--accent)", color: "var(--accent-fg)" }}>
                <div className="cap mono">Door check-in</div>
                <div className="serif" style={{ fontSize: 32, fontStyle: "italic", margin: "8px 0" }}>You're in.</div>
                <p style={{ fontSize: 14, lineHeight: 1.5, margin: 0 }}>Open <b>Wallet</b> at the venue and show the ticket screenshot to door staff. The seller's payout is released 48 hours after the event ends.</p>
              </div>
              <button className="btn btn-lg" style={{ width: "100%", marginTop: 14, justifyContent: "center" }} onClick={() => go("wallet")}>Go to Wallet →</button>
              <button className="btn btn-ghost btn-sm" style={{ width: "100%", marginTop: 8, justifyContent: "center" }} onClick={() => go("home")}>Browse more events</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── SELL SCREEN ────────────────────────────────────────────────────────────── */
function SellScreen({ go, prefillEvent }) {
  const [step, setStep] = useState(prefillEvent ? 1 : 0);
  const [event, setEvent] = useState(prefillEvent || null);
  const [price, setPrice] = useState("");
  const [uploadedFile, setUploadedFile] = useState(null);  // real File object from upload
  const [screenshotUrl, setScreenshotUrl] = useState('');   // Supabase Storage URL after upload
  const [sellShowAddEvent, setSellShowAddEvent] = useState(false);
  const steps = ["Event", "Upload", "Verify", "Price", "Live"];

  return (
    <div className="fade-in container" style={{ padding: "40px 32px", maxWidth: 1200 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <div className="cap mono" style={{ color: "var(--ink-mute)" }}>§ Sell a ticket</div>
          <h1 className="serif" style={{ fontSize: 64, fontStyle: "italic", fontWeight: 400, margin: "10px 0 16px", letterSpacing: "-0.02em", lineHeight: 1.05 }}>List in five steps.</h1>
        </div>
        <button className="btn btn-accent btn-lg" onClick={() => setSellShowAddEvent(true)} style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:18, lineHeight:1 }}>+</span>
          <div style={{ textAlign:"left" }}>
            <div style={{ fontWeight:600, fontSize:14, lineHeight:1.2 }}>Add your event</div>
            <div style={{ fontSize:11, opacity:0.75, fontWeight:400, marginTop:1 }}>Requires a Fixr or Fatsoma link</div>
          </div>
        </button>
      </div>
      <hr className="rule-ink" />
      <div style={{ display: "flex", gap: 0, padding: "24px 0", borderBottom: "1px solid var(--rule)" }}>
        {steps.map((s, i) => (
          <div key={s} style={{
            flex: 1, padding: "12px 16px",
            borderLeft: i === 0 ? "1px solid var(--ink)" : "none", borderRight: "1px solid var(--ink)",
            borderTop: "1px solid var(--ink)", borderBottom: "1px solid var(--ink)",
            background: i < step ? "var(--accent)" : i === step ? "var(--ink)" : "var(--paper)",
            color: i === step ? "var(--paper)" : "var(--ink)",
          }}>
            <div className="cap-sm mono" style={{ opacity: 0.7 }}>STEP {String(i + 1).padStart(2, "0")}</div>
            <div className="serif" style={{ fontSize: 18, marginTop: 4, fontStyle: "italic" }}>{s}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 32, display: "grid", gridTemplateColumns: step >= 1 ? "1.2fr 1fr" : "1fr", gap: 48, alignItems: "start" }}>
        <div>
          {step === 0 && <SellPickEvent onPick={(ev) => { setEvent(ev); setStep(1); }} />}
          {step === 1 && <SellUploadStep event={event} onDone={(file, url) => { setUploadedFile(file); setScreenshotUrl(url || ''); setStep(2); }} onBack={() => setStep(0)} />}
          {step === 2 && <SellVerifyStep event={event} uploadedFile={uploadedFile} onDone={() => setStep(3)} onFail={() => setStep(1)} />}
          {step === 3 && <SellPriceStep event={event} price={price} setPrice={setPrice} onDone={async () => {
        const session = supabase.auth.session ? supabase.auth.session() : null;
        const token = session?.access_token;
        if (token) {
          await fetch('/api/listings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ eventId: event.id, price: parseFloat(price), screenshotUrl }),
          }).catch(() => {}); // continue even if API not deployed
        }
        setStep(4);
      }} />}
          {step === 4 && <SellLiveStep event={event} price={price} go={go} />}
        </div>
        {step >= 1 && event && (
          <aside style={{ position: "sticky", top: 80 }}>
            <div style={{ border: "1px solid var(--ink)", padding: 20, background: "var(--paper-2)" }}>
              <div className="cap mono" style={{ color: "var(--ink-mute)" }}>Listing draft</div>
              <div className="serif" style={{ fontSize: 24, fontWeight: 400, lineHeight: 1.1, marginTop: 8 }}>{event.title}</div>
              <div className="mono" style={{ fontSize: 12, color: "var(--ink-mute)", marginTop: 6 }}>{event.date} · {event.venue}</div>
              <hr className="rule-ink" style={{ margin: "18px 0" }} />
              <div style={{ display: "grid", gap: 10, fontSize: 13 }}>
                {[price && ["Listing price", `£${parseFloat(price || 0).toFixed(2)}`], price && ["Buyer pays", `£${(parseFloat(price || 0) + 0.99).toFixed(2)}`]].filter(Boolean).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span className="cap-sm mono" style={{ color: "var(--ink-mute)" }}>{k}</span>
                    <span style={{ fontSize: 13 }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        )}
      </div>
      {sellShowAddEvent && <AddEventModal onClose={() => setSellShowAddEvent(false)} onAdd={(ev) => { setSellShowAddEvent(false); setEvent(ev); setStep(1); }} />}
    </div>
  );
}

function SellPickEvent({ onPick }) {
  const [q, setQ] = useState("");
  const [showLinkModal, setShowLinkModal] = useState(false);
  const filtered = EVENTS.filter((e) => `${e.title} ${e.venue}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <h2 className="serif" style={{ fontSize: 28, fontWeight: 600, margin: "0 0 6px" }}>Which event?</h2>
      <p style={{ color: "var(--ink-mute)", fontSize: 14, margin: "0 0 18px" }}>Search events already listed on Exeticket, or add a new one with a Fixr or Fatsoma link.</p>
      <input className="field" placeholder="Search events..." value={q} onChange={(e) => setQ(e.target.value)} />
      <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
        {filtered.map((ev) => (
          <button key={ev.id} onClick={() => onPick(ev)} style={{
            all: "unset", cursor: "pointer", display: "grid", gridTemplateColumns: "1fr auto auto",
            gap: 24, alignItems: "center", padding: "14px 16px", border: "1px solid var(--rule)",
            background: "var(--paper)", borderRadius: 0
          }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--paper-2)"; e.currentTarget.style.borderColor = "var(--ink)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--paper)"; e.currentTarget.style.borderColor = "var(--rule)"; }}
          >
            <div>
              <div style={{ fontSize: 15, fontWeight: 500 }}>{ev.title}</div>
              <div className="mono cap-sm" style={{ color: "var(--ink-mute)", marginTop: 3 }}>{ev.venue} · {ev.date} · doors {ev.door}</div>
            </div>
            <span className="mono" style={{ fontSize: 12, color: "var(--ink-mute)" }}>from {fmt(ev.floor)}</span>
            <span style={{ fontSize: 16, color: "var(--ink-mute)" }}>›</span>
          </button>
        ))}
      </div>
      <div style={{ marginTop: 24, border: "1px solid var(--ink)", background: "var(--ink)", color: "var(--paper)", padding: "22px 24px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:20 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 5 }}>Your event isn't listed yet?</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.55 }}>
              We only accept <b style={{ color:"var(--accent)" }}>Fixr</b> and <b style={{ color:"var(--accent)" }}>Fatsoma</b> links.
              Paste one and we'll import the event name, venue, date and doors time automatically — no typing required.
            </div>
          </div>
          <button className="btn btn-accent" onClick={() => setShowLinkModal(true)} style={{ whiteSpace:"nowrap", flexShrink:0, padding:"12px 20px" }}>
            Paste Fixr / Fatsoma link →
          </button>
        </div>
      </div>
      {showLinkModal && <AddEventModal onClose={() => setShowLinkModal(false)} onAdd={(ev) => { setShowLinkModal(false); onPick(ev); }} />}
    </div>
  );
}

// ─── REAL API INTEGRATION HELPERS ────────────────────────────────────────────
// These functions call your backend proxy at /api/event-import
// Your backend must implement GET /api/event-import?url=<encoded_url>
// See the manual steps at the bottom of this file for backend setup.

function extractFixrEventId(url) {
  // Fixr URLs: https://fixr.co/event/event-name-here--12345678
  // The numeric ID is after the last --
  const match = url.match(/--(\d+)\/?$/);
  return match ? match[1] : null;
}

function extractFatsomaEventId(url) {
  // Fatsoma URLs: https://www.fatsoma.com/e/abc123/event-name
  // The short ID is the path segment after /e/
  const match = url.match(/\/e\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

async function fetchFixrEvent(eventId) {
  // Fixr public API: https://api.fixr.co/api/v2/public/event/<id>
  // NOTE: This must be called from your backend (CORS blocks browser calls).
  // Your backend endpoint: GET /api/event-import?platform=fixr&id=<eventId>
  const res = await fetch(`/api/event-import?platform=fixr&id=${eventId}`);
  if (!res.ok) throw new Error(`Fixr API error: ${res.status}`);
  const data = await res.json();
  // Fixr response shape (key fields):
  // data.name, data.venue.name, data.open_time, data.close_time,
  // data.tickets[0].price (in pence), data.image
  const openDt  = new Date(data.open_time * 1000);
  const closeDt = new Date(data.close_time * 1000);
  const fmt2 = (d) => d.toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit" });
  const fmtDate = (d) => d.toLocaleDateString("en-GB", { weekday:"short", day:"2-digit", month:"short", year:"numeric" });
  const minPrice = data.tickets?.length
    ? Math.min(...data.tickets.map(t => (t.price || 0) / 100))
    : 0;
  return {
    id:       "fixr-" + eventId,
    title:    data.name,
    venue:    data.venue?.name || "Venue TBC",
    date:     fmtDate(openDt),
    iso:      openDt.toISOString(),
    door:     fmt2(openDt),
    close:    fmt2(closeDt),
    tag:      "Club Night",
    listings: 0,
    floor:    minPrice,
    blurb:    data.description || "",
    img:      data.image || "",
    source:   "Fixr",
    sourceUrl: `https://fixr.co/event/--${eventId}`,
  };
}

async function fetchFatsomaEvent(eventId) {
  // Fatsoma public API: https://www.fatsoma.com/api/v1/event/<id>
  // NOTE: Must be called from your backend.
  // Your backend endpoint: GET /api/event-import?platform=fatsoma&id=<eventId>
  const res = await fetch(`/api/event-import?platform=fatsoma&id=${eventId}`);
  if (!res.ok) throw new Error(`Fatsoma API error: ${res.status}`);
  const data = await res.json();
  // Fatsoma response shape:
  // data.event.name, data.event.venue.name, data.event.start_datetime,
  // data.event.end_datetime, data.event.ticket_types[0].price
  const openDt  = new Date(data.event.start_datetime);
  const closeDt = new Date(data.event.end_datetime);
  const fmt2 = (d) => d.toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit" });
  const fmtDate = (d) => d.toLocaleDateString("en-GB", { weekday:"short", day:"2-digit", month:"short", year:"numeric" });
  const minPrice = data.event.ticket_types?.length
    ? Math.min(...data.event.ticket_types.map(t => parseFloat(t.price || 0)))
    : 0;
  return {
    id:       "fatsoma-" + eventId,
    title:    data.event.name,
    venue:    data.event.venue?.name || "Venue TBC",
    date:     fmtDate(openDt),
    iso:      openDt.toISOString(),
    door:     fmt2(openDt),
    close:    fmt2(closeDt),
    tag:      "Club Night",
    listings: 0,
    floor:    minPrice,
    blurb:    data.event.description || "",
    img:      data.event.cover_image_url || "",
    source:   "Fatsoma",
    sourceUrl: `https://www.fatsoma.com/e/${eventId}`,
  };
}

function AddEventModal({ onClose, onAdd }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(null);
  const [error, setError] = useState("");

  const platform = url.includes("fixr.co") ? "Fixr" : url.includes("fatsoma.com") ? "Fatsoma" : null;
  const isValid = platform !== null && url.startsWith("http");

  const handleFetch = async () => {
    if (!isValid) return;
    setLoading(true);
    setError("");
    setFetched(null);
    try {
      let result;
      if (platform === "Fixr") {
        const id = extractFixrEventId(url);
        if (!id) throw new Error("Couldn't find a Fixr event ID in that URL. Make sure you paste the full event page link.");
        result = await fetchFixrEvent(id);
      } else {
        const id = extractFatsomaEventId(url);
        if (!id) throw new Error("Couldn't find a Fatsoma event ID in that URL. Make sure you paste the full event page link.");
        result = await fetchFatsomaEvent(id);
      }
      setFetched(result);
    } catch (e) {
      // If backend isn't deployed yet, show a clear message rather than a crash
      if (e.message.includes("Failed to fetch") || e.message.includes("NetworkError") || e.message.includes("404")) {
        setError("The import backend isn't running yet. See setup instructions — this will work once /api/event-import is deployed.");
      } else {
        setError(e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal fade-in" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--ink)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ink-mute)", marginBottom: 4 }}>Add new event</div>
            <div style={{ fontSize: 20, fontWeight: 600 }}>Paste your event link</div>
          </div>
          <button onClick={onClose} style={{ all: "unset", cursor: "pointer", fontSize: 18, color: "var(--ink-mute)" }}>✕</button>
        </div>

        <div style={{ padding: "20px 24px" }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            {["Fixr", "Fatsoma"].map(p => (
              <div key={p} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", border: "1px solid var(--rule)", fontSize: 13, fontWeight: 500,
                background: url.toLowerCase().includes(p.toLowerCase()) ? "var(--accent-soft)" : "var(--paper)",
                borderColor: url.toLowerCase().includes(p.toLowerCase()) ? "var(--accent)" : "var(--rule)" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: url.toLowerCase().includes(p.toLowerCase()) ? "var(--accent)" : "var(--rule)" }}></span>
                {p}
              </div>
            ))}
            <div style={{ fontSize: 12, color: "var(--ink-mute)", alignSelf: "center", marginLeft: 4 }}>Only accepted sources</div>
          </div>

          <input
            className="field"
            placeholder="https://fixr.co/event/... or https://fatsoma.com/e/..."
            value={url}
            onChange={(e) => { setUrl(e.target.value); setFetched(null); setError(""); }}
            style={{ fontSize: 14 }}
          />
          {url && !isValid && (
            <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 8 }}>
              Only Fixr (fixr.co) and Fatsoma (fatsoma.com) links are accepted.
            </div>
          )}
          {error && (
            <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 8, padding: "10px 12px", border: "1px solid var(--danger)", lineHeight: 1.5 }}>
              ⚠ {error}
            </div>
          )}

          {!fetched && (
            <button className="btn btn-accent" disabled={!isValid || loading}
              style={{ width: "100%", justifyContent: "center", marginTop: 14 }}
              onClick={handleFetch}>
              {loading
                ? <><span className="spin" style={{ borderColor: "var(--accent-fg)", borderRightColor: "transparent" }}></span> Importing from {platform}…</>
                : `Import from ${platform || "…"} →`}
            </button>
          )}

          {fetched && (
            <div className="fade-in" style={{ marginTop: 16 }}>
              <div style={{ padding: "14px 16px", border: "1px solid var(--accent)", background: "var(--accent-soft)" }}>
                <div style={{ fontSize: 11, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--accent-deep)", marginBottom: 8 }}>
                  ✓ Imported from {fetched.source}
                </div>
                <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>{fetched.title}</div>
                <div style={{ fontSize: 13, color: "var(--ink-mute)", marginBottom: 8 }}>{fetched.venue} · {fetched.date}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13 }}>
                  {[["Doors open", fetched.door], ["Closes", fetched.close], ["Floor price", fetched.floor ? fmt(fetched.floor) : "TBC"]].map(([k,v]) => (
                    <div key={k}><span style={{ color:"var(--ink-mute)" }}>{k}: </span><b>{v}</b></div>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => { setFetched(null); setUrl(""); }}>Try different link</button>
                <button className="btn btn-accent" style={{ flex: 1, justifyContent: "center" }} onClick={() => onAdd(fetched)}>
                  Use this event →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SellUploadStep({ event, onDone, onBack }) {
  const [drag, setDrag] = useState(false);
  const [file, setFile] = useState(null);
  const fileInputRef = useRef(null);

  const handleFile = (f) => {
    if (!f) return;
    const ok = ["image/png","image/jpeg","image/heic","image/webp"].includes(f.type) || f.name.match(/\.(png|jpg|jpeg|heic|webp)$/i);
    if (!ok) { alert("Please upload a PNG, JPG or HEIC image."); return; }
    if (f.size > 10 * 1024 * 1024) { alert("File must be under 10MB."); return; }
    setFile(f);
  };

  const handleDrop = (e) => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]); };

  return (
    <div>
      <h2 className="serif" style={{ fontSize: 32, fontStyle: "italic", fontWeight: 400, margin: "0 0 8px" }}>Upload your screenshot</h2>
      <p style={{ color: "var(--ink-mute)", fontSize: 14, margin: "0 0 18px" }}>
        PNG or JPG of the original ticket from Fatsoma or Fixr. Make sure the <b>QR code is fully visible</b> — our AI will check everything matches <b>{event.title}</b>.
      </p>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={handleDrop}
        onClick={() => !file && fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${drag ? "var(--accent-deep)" : file ? "var(--accent)" : "var(--ink)"}`,
          padding: "56px 24px", textAlign: "center",
          background: drag ? "oklch(0.95 0.1 110 / 0.4)" : file ? "var(--accent-soft)" : "var(--paper)",
          cursor: file ? "default" : "pointer", position: "relative", transition: "all .2s"
        }}
      >
        <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/heic,image/webp,.heic" style={{ display:"none" }} onChange={(e) => handleFile(e.target.files[0])} />
        {!file ? (
          <>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📸</div>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>Drop your ticket screenshot here</div>
            <div className="mono cap-sm" style={{ color: "var(--ink-mute)" }}>PNG · JPG · HEIC · max 10MB · QR code must be visible</div>
          </>
        ) : (
          <div className="fade-in">
            {/* Preview thumbnail */}
            <img src={URL.createObjectURL(file)} alt="ticket preview"
              style={{ maxHeight: 220, maxWidth: "100%", border: "1px solid var(--rule)", borderRadius: 4, marginBottom: 14, objectFit: "contain" }} />
            <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-mute)", marginBottom: 14 }}>
              📎 {file.name} · {(file.size / 1024).toFixed(0)} KB
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); setFile(null); fileInputRef.current.value=""; }}>Replace</button>
              <button className="btn btn-accent btn-sm" onClick={async (e) => {
                e.stopPropagation();
                try {
                  const filePath = `screenshots/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
                  const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('ticket-screenshots')
                    .upload(filePath, file, { cacheControl: '3600', upsert: false });
                  if (uploadError) throw uploadError;
                  const { data: urlData } = await supabase.storage
                    .from('ticket-screenshots')
                    .createSignedUrl(filePath, 60 * 60 * 24 * 7); // 7 day signed URL
                  onDone(file, urlData?.signedUrl || '');
                } catch (err) {
                  // If storage not configured yet, proceed without URL (dev mode)
                  console.warn('Storage upload skipped:', err.message);
                  onDone(file, '');
                }
              }}>Run AI verification →</button>
            </div>
          </div>
        )}
      </div>
      <div style={{ marginTop: 12, padding: "10px 14px", background: "var(--paper-2)", border: "1px solid var(--rule)", fontSize: 13, color: "var(--ink-mute)", lineHeight: 1.5 }}>
        ⚠ The QR code must be <b>fully visible and unobstructed</b> in the screenshot. Cropped, blurred or screenshot-of-screenshot images will be rejected.
      </div>
      <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginTop: 14 }}>← Pick a different event</button>
    </div>
  );
}

function SellVerifyStep({ event, uploadedFile, onDone, onFail }) {
  // status: 'checking' | 'pass' | 'fail'
  const [status, setStatus] = useState("checking");
  const [checks, setChecks] = useState([
    { k: "QR code visible & scannable", v: null, result: null },
    { k: "Event name",                  v: event.title, result: null },
    { k: "Venue",                       v: event.venue, result: null },
    { k: "Date",                        v: event.date,  result: null },
    { k: "Doors time",                  v: event.door,  result: null },
  ]);
  const [failReason, setFailReason] = useState("");
  const [previewUrl] = useState(() => uploadedFile ? URL.createObjectURL(uploadedFile) : null);

  useEffect(() => {
    if (!uploadedFile) return;

    const run = async () => {
      try {
        // Convert file to base64
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(uploadedFile);
        });

        const res = await fetch("/api/verify-ticket", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageBase64: base64,
            imageMimeType: uploadedFile.type || "image/jpeg",
            event: {
              title: event.title,
              venue: event.venue,
              date:  event.date,
              door:  event.door,
            }
          })
        });

        if (!res.ok) throw new Error("Verification service error: " + res.status);
        const data = await res.json();

        // data.checks = [{ key, found, match, detail }]
        // data.pass = true | false
        // data.failReason = string

        // Animate results in one by one
        const results = data.checks || [];
        for (let i = 0; i < results.length; i++) {
          await new Promise(r => setTimeout(r, 500));
          setChecks(prev => prev.map((c, idx) => idx === i
            ? { ...c, result: results[i]?.match ? "pass" : "fail", v: results[i]?.found || c.v }
            : c
          ));
        }

        await new Promise(r => setTimeout(r, 600));

        if (data.pass) {
          setStatus("pass");
          setTimeout(onDone, 1200);
        } else {
          setStatus("fail");
          setFailReason(data.failReason || "One or more checks failed. Please upload a clearer screenshot.");
        }

      } catch (e) {
        // If /api/verify-ticket isn't deployed yet, show a clear message
        if (e.message.includes("Failed to fetch") || e.message.includes("404")) {
          setFailReason("Verification backend not deployed yet. Deploy api/verify-ticket.js to enable real AI checks.");
        } else {
          setFailReason(e.message);
        }
        setStatus("fail");
      }
    };

    run();
  }, [uploadedFile]);

  return (
    <div>
      <h2 className="serif" style={{ fontSize: 32, fontStyle: "italic", fontWeight: 400, margin: "0 0 8px" }}>
        {status === "checking" ? "AI verification running…" : status === "pass" ? "All checks passed ✓" : "Verification failed"}
      </h2>
      <p style={{ color: "var(--ink-mute)", fontSize: 14, margin: "0 0 24px" }}>
        {status === "checking" ? "GPT-4o Vision is checking your screenshot against the event details. Stay on this page." :
         status === "pass"     ? "Your ticket is authentic and matches the event. Proceeding to pricing…" :
                                 "Your screenshot didn't pass all checks. See the details below."}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* Screenshot preview with scan animation */}
        <div style={{ position: "relative", overflow: "hidden", border: "1px solid var(--ink)", background: "var(--ink)" }}>
          {previewUrl
            ? <img src={previewUrl} alt="your ticket" style={{ width:"100%", height:360, objectFit:"contain", opacity: status === "checking" ? 0.7 : 1, transition:"opacity .4s" }} />
            : <div className="ph-img" style={{ height:360 }}></div>
          }
          {status === "checking" && <div className="scan-line"></div>}
          <div style={{
            position:"absolute", top:10, right:10, padding:"4px 10px",
            fontFamily:"var(--mono)", fontSize:10, letterSpacing:"0.08em",
            background: status === "checking" ? "var(--accent)" : status === "pass" ? "var(--ok)" : "var(--danger)",
            color: "white"
          }}>
            {status === "checking" ? "● SCANNING" : status === "pass" ? "✓ VERIFIED" : "✗ FAILED"}
          </div>
        </div>

        {/* Check results */}
        <div>
          {checks.map((c, i) => (
            <div key={c.k} style={{ display:"grid", gridTemplateColumns:"22px 1fr auto", gap:12, alignItems:"center", padding:"13px 0", borderBottom:"1px dotted var(--rule)", opacity: c.result ? 1 : 0.4, transition:"opacity .3s" }}>
              {c.result === null
                ? <span className="spin" style={{ flexShrink:0 }}></span>
                : c.result === "pass"
                  ? <span style={{ color:"var(--ok)", fontSize:16, flexShrink:0 }}>✓</span>
                  : <span style={{ color:"var(--danger)", fontSize:16, flexShrink:0 }}>✗</span>
              }
              <div>
                <div className="cap-sm mono" style={{ color:"var(--ink-mute)", marginBottom:2 }}>{c.k}</div>
                <div style={{ fontSize:13, fontWeight:500 }}>{c.result ? c.v : "—"}</div>
              </div>
              <span className="cap-sm mono" style={{
                color: c.result === "pass" ? "var(--ok)" : c.result === "fail" ? "var(--danger)" : "var(--ink-mute)"
              }}>
                {c.result === "pass" ? "MATCH" : c.result === "fail" ? "FAIL" : "…"}
              </span>
            </div>
          ))}

          {status === "pass" && (
            <div className="fade-in" style={{ marginTop:16, padding:"12px 16px", background:"var(--accent)", border:"1px solid var(--ink)" }}>
              <div style={{ fontWeight:700, fontSize:14 }}>All checks passed</div>
              <div style={{ fontSize:13, marginTop:2, color:"var(--accent-fg)" }}>Proceeding to set your price…</div>
            </div>
          )}

          {status === "fail" && (
            <div className="fade-in" style={{ marginTop:16, padding:"14px 16px", background:"#FEF2F2", border:"1px solid var(--danger)" }}>
              <div style={{ fontWeight:700, fontSize:14, color:"var(--danger)", marginBottom:6 }}>Verification failed</div>
              <div style={{ fontSize:13, lineHeight:1.6, color:"#991B1B" }}>{failReason}</div>
              <div style={{ marginTop:12, display:"flex", gap:8 }}>
                <button className="btn btn-ghost btn-sm" style={{ borderColor:"var(--danger)", color:"var(--danger)" }} onClick={onFail}>← Upload a different screenshot</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SellPriceStep({ event, price, setPrice, onDone }) {
  const num = parseFloat(price || 0);
  const ok = num >= 0.01;
  const [decayEnabled, setDecayEnabled] = useState(false);
  const [floorPrice, setFloorPrice] = useState("");
  const floorNum = parseFloat(floorPrice || 0);
  const decayOk = !decayEnabled || (floorNum > 0 && floorNum < num);

  return (
    <div>
      <h2 className="serif" style={{ fontSize: 32, fontStyle: "italic", fontWeight: 400, margin: "0 0 8px" }}>Set your price</h2>
      <p style={{ color: "var(--ink-mute)", fontSize: 14, margin: "0 0 24px" }}>Enter any price — no cap applied. You receive your full listing price. The 99p fee is charged to the buyer on top.</p>
      <label className="cap mono" style={{ display: "block", marginBottom: 8 }}>Starting price (GBP)</label>
      <div style={{ position: "relative" }}>
        <span style={{ position: "absolute", left: 18, top: "50%", transform: "translateY(-50%)", fontFamily: "var(--serif)", fontSize: 32, fontStyle: "italic" }}>£</span>
        <input className="field" type="number" min="0.01" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" style={{ paddingLeft: 44, fontSize: 32, fontFamily: "var(--serif)", fontStyle: "italic", height: 80 }} />
      </div>

      {/* Smart Price Decay toggle */}
      <div style={{ marginTop: 20, border: "1px solid var(--rule)" }}>
        <div style={{ padding:"14px 16px", display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer", background: decayEnabled ? "var(--accent-soft)" : "var(--paper)" }} onClick={() => setDecayEnabled(!decayEnabled)}>
          <div>
            <div style={{ fontWeight:600, fontSize:14, marginBottom:2 }}>↓ Smart Price Decay</div>
            <div style={{ fontSize:13, color:"var(--ink-mute)" }}>Automatically lower your price as the event gets closer, so it always sells.</div>
          </div>
          <div style={{ width:44, height:24, background: decayEnabled ? "var(--accent)" : "var(--rule)", borderRadius:12, position:"relative", transition:"background .2s", flexShrink:0 }}>
            <div style={{ position:"absolute", top:3, left: decayEnabled ? 23 : 3, width:18, height:18, borderRadius:"50%", background:"var(--paper)", transition:"left .2s", boxShadow:"0 1px 4px rgba(0,0,0,0.2)" }}></div>
          </div>
        </div>
        {decayEnabled && (
          <div className="fade-in" style={{ padding:"14px 16px", borderTop:"1px solid var(--rule)", background:"var(--paper-2)" }}>
            <label style={{ fontSize:12, fontFamily:"var(--mono)", textTransform:"uppercase", letterSpacing:"0.1em", color:"var(--ink-mute)", display:"block", marginBottom:8 }}>Floor price — never drop below this</label>
            <div style={{ position:"relative", maxWidth:240 }}>
              <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", fontFamily:"var(--serif)", fontSize:22, fontStyle:"italic" }}>£</span>
              <input className="field" type="number" min="0.01" step="0.01" value={floorPrice} onChange={e => setFloorPrice(e.target.value)} placeholder="0.00" style={{ paddingLeft:34, fontSize:22, fontFamily:"var(--serif)", fontStyle:"italic", height:56 }} />
            </div>
            {ok && floorNum > 0 && (
              <div style={{ marginTop:12, fontSize:13, color:"var(--ink-mute)", lineHeight:1.6 }}>
                Starts at <b>{fmt(num)}</b>, decays gradually to <b>{fmt(floorNum)}</b> by doors open ({event.door} on {event.date}).
              </div>
            )}
            {floorNum >= num && floorNum > 0 && <div style={{ color:"var(--danger)", fontSize:13, marginTop:8 }}>Floor must be below your starting price.</div>}
          </div>
        )}
      </div>

      <hr className="rule-ink" style={{ margin: "32px 0" }} />
      {ok && <PriceBreakdown price={num} mode="sell" />}
      <button className="btn btn-accent btn-lg" disabled={!ok || !decayOk} style={{ width: "100%", justifyContent: "center", marginTop: 18 }} onClick={onDone}>Hold to confirm listing →</button>
    </div>
  );
}

function SellLiveStep({ event, go }) {
  return (
    <div className="fade-in">
      <div style={{ padding: "40px 0", textAlign: "center" }}>
        <div style={{ display: "inline-block", padding: "4px 12px", background: "var(--accent)", border: "1px solid var(--ink)", fontFamily: "var(--mono)", fontSize: 11, textTransform: "uppercase" }}>● Listing live</div>
        <h2 className="serif" style={{ fontSize: 64, fontStyle: "italic", fontWeight: 400, margin: "18px 0 12px", letterSpacing: "-0.02em", lineHeight: 0.95 }}>You're on the market.</h2>
        <p style={{ color: "var(--ink-mute)", fontSize: 16, maxWidth: 560, margin: "0 auto" }}>Your <b>{event.title}</b> ticket is now visible to verified Exeter students. We'll ping you the second a buyer locks it in.</p>
      </div>
      <HoloTicket event={event} listing={{ id: "lst-new", type: "Standard Entry" }} status="held" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 24 }}>
        <button className="btn btn-ghost btn-lg" onClick={() => go("wallet")} style={{ justifyContent: "center" }}>View in wallet</button>
        <button className="btn btn-accent btn-lg" onClick={() => go("browse")} style={{ justifyContent: "center" }}>See it on the marketplace →</button>
      </div>
    </div>
  );
}

/* ─── BUYING TICKET CARD (wallet) ───────────────────────────────────────────── */
function BuyingTicketCard({ item, ev }) {
  const [showTicket, setShowTicket] = useState(false);
  const listing = LISTINGS.find(l => l.eventId === ev.id) || LISTINGS[0];
  const barcode = (item.id + ev.id).toUpperCase().replace(/[^A-Z0-9]/g,'').padEnd(18,'X').slice(0,18);

  return (
    <>
      {/* Clickable ticket preview */}
      <div
        onClick={() => setShowTicket(true)}
        style={{
          position: "relative", cursor: "pointer", border: "1px solid var(--rule)",
          background: "var(--paper-2)", borderRadius: 0, overflow: "hidden",
          padding: "16px 18px", display: "flex", justifyContent: "space-between", alignItems: "center",
          transition: "border-color .15s",
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = "var(--ink)"}
        onMouseLeave={e => e.currentTarget.style.borderColor = "var(--rule)"}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>Tap to view ticket screenshot</div>
          <div style={{ fontSize: 12, color: "var(--ink-mute)" }}>Show this at the door · {ev.venue}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 40, height: 40, background: "var(--ink)", display: "grid", gridTemplateColumns: "repeat(6,1fr)", padding: 4, flexShrink: 0 }}>
            {Array.from({length:36}).map((_,i) => {
              const s = (i*7 + 13) % 17;
              return <span key={i} style={{ background: s > 8 ? "var(--paper)" : "transparent", width: "100%", aspectRatio: "1/1" }}></span>;
            })}
          </div>
          <span style={{ fontSize: 18, color: "var(--ink-mute)" }}>›</span>
        </div>
      </div>

      <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div><div style={{ fontSize: 11, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ink-mute)", marginBottom: 2 }}>Doors in</div><Countdown iso={ev.iso} /></div>
        <div style={{ textAlign: "right" }}><div style={{ fontSize: 11, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ink-mute)", marginBottom: 2 }}>Paid</div><div style={{ fontSize: 20, fontFamily: "var(--serif)" }}>{fmt(item.price + 0.99)}</div></div>
      </div>

      {/* Full ticket screenshot modal */}
      {showTicket && (
        <div className="modal-backdrop" onClick={() => setShowTicket(false)}>
          <div className="modal fade-in" style={{ maxWidth: 400, background: "var(--paper)" }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--ink)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 11, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ink-mute)", marginBottom: 2 }}>Your ticket</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{ev.title}</div>
              </div>
              <button onClick={() => setShowTicket(false)} style={{ all: "unset", cursor: "pointer", fontSize: 18, color: "var(--ink-mute)" }}>✕</button>
            </div>
            <div style={{ padding: "20px", background: "#f8f8f8" }}>
              {/* Mock phone ticket screenshot */}
              <div style={{
                background: "#fff", border: "1px solid #e5e5e5",
                borderRadius: 16, overflow: "hidden",
                boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                maxWidth: 320, margin: "0 auto",
                fontFamily: "-apple-system, sans-serif",
              }}>
                {/* Status bar */}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 16px 4px", fontSize: 11, fontWeight: 600 }}>
                  <span>20:14</span>
                  <span>●●●●● 5G</span>
                </div>
                {/* Platform header */}
                <div style={{ padding: "8px 16px 12px", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 10, color: "#888", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                      {listing?.seller?.includes("fatsoma") ? "Fatsoma" : "Fixr"} · My Tickets
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{ev.title}</div>
                  </div>
                  <div style={{ fontSize: 10, color: "#888" }}>Order #{barcode.slice(-5)}</div>
                </div>
                {/* QR code area */}
                <div style={{ padding: "20px 16px", textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: "#888", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 4 }}>Entry pass · {ev.date}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>{ev.venue}</div>
                  <div style={{ fontSize: 11, color: "#666", marginBottom: 16 }}>Doors {ev.door} · 1 × Standard Entry</div>
                  {/* QR grid */}
                  <div style={{ width: 150, height: 150, margin: "0 auto 12px", position: "relative", background: "repeating-conic-gradient(#000 0% 25%, #fff 0% 50%) 50% / 8px 8px", border: "8px solid #fff", boxShadow: "inset 0 0 0 1px #000" }}>
                    {[[0,0],[0,"auto"],["auto",0]].map((p,i) => (
                      <div key={i} style={{ position: "absolute", width: 34, height: 34, background: "#fff", border: "7px solid #000", top: p[0]==="auto"?"auto":p[0], left: p[1]==="auto"?"auto":p[1], bottom: p[0]==="auto"?0:"auto", right: p[1]==="auto"?0:"auto" }}></div>
                    ))}
                  </div>
                  <div style={{ fontFamily: "monospace", fontSize: 11, letterSpacing: 2, color: "#111" }}>{barcode.slice(0,6)} {barcode.slice(6,12)} {barcode.slice(12)}</div>
                </div>
                <div style={{ padding: "10px 16px", borderTop: "1px solid #eee", fontSize: 10, color: "#999", textAlign: "center" }}>
                  Show this screen at the door
                </div>
              </div>
            </div>
            <div style={{ padding: "14px 20px", borderTop: "1px solid var(--ink)", background: "var(--paper)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 12, color: "var(--ink-mute)" }}>Purchased via Exeticket · {ev.venue}</div>
              <button className="btn btn-sm btn-accent" onClick={() => setShowTicket(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ─── WALLET SCREEN ──────────────────────────────────────────────────────────── */
function WalletScreen({ go }) {
  const [tab, setTab] = useState("selling");
  const [tickets, setTickets] = useState(MY_TICKETS);
  const [walletLoading, setWalletLoading] = useState(true);

  useEffect(() => {
    const session = supabase.auth.session ? supabase.auth.session() : null;
    const token = session?.access_token;
    if (!token) { setWalletLoading(false); return; }

    Promise.all([
      fetch('/api/listings?sellerId=me', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch('/api/transactions?role=buyer', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
    ]).then(([sellerData, buyerData]) => {
      setTickets(prev => ({
        ...prev,
        selling:  sellerData.listings?.length  > 0 ? sellerData.listings  : prev.selling,
        buying:   buyerData.transactions?.length > 0 ? buyerData.transactions : prev.buying,
      }));
      setWalletLoading(false);
    }).catch(() => setWalletLoading(false));
  }, []);

  const tabs = [
    { id: "buying",   label: "Buying",  count: tickets.buying.length },
    { id: "selling",  label: "Selling", count: tickets.selling.length },
    { id: "attended", label: "Past",    count: tickets.attended.length },
  ];
  const list = tickets[tab] || [];
  return (
    <div className="fade-in container" style={{ padding: "40px 32px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div>
          <div className="cap mono" style={{ color: "var(--ink-mute)" }}>§ Wallet</div>
          <h1 className="serif" style={{ fontSize: 64, fontStyle: "italic", fontWeight: 400, margin: "10px 0 0", letterSpacing: "-0.02em", lineHeight: 0.95 }}>Your tickets.</h1>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="cap mono" style={{ color: "var(--ink-mute)" }}>Balance · pending payouts</div>
          <div className="serif" style={{ fontSize: 48, fontStyle: "italic", lineHeight: 1 }}>£7.00</div>
          <div className="mono cap-sm" style={{ color: "var(--ink-mute)" }}>Releases after door scan</div>
        </div>
      </div>
      <hr className="rule-ink" style={{ margin: "24px 0" }} />
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--ink)" }}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            all: "unset", cursor: "pointer", padding: "14px 24px",
            borderBottom: tab === t.id ? "3px solid var(--accent)" : "3px solid transparent",
            fontFamily: "var(--serif)", fontSize: 22, fontStyle: "italic",
            color: tab === t.id ? "var(--ink)" : "var(--ink-mute)",
            display: "inline-flex", alignItems: "baseline", gap: 8, whiteSpace: "nowrap"
          }}>
            <span>{t.label}</span><span className="mono" style={{ fontSize: 12, fontStyle: "normal" }}>{t.count}</span>
          </button>
        ))}
      </div>
      <div style={{ padding: "32px 0", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
        {list.length === 0 && <div style={{ padding: 48, textAlign: "center", color: "var(--ink-mute)", gridColumn: "span 2" }}>Nothing here yet.</div>}
        {list.map((item) => {
          const ev = EVENTS.find((e) => e.id === item.eventId);
          const statusColor = { "ESCROW HELD": "var(--accent)", LIVE: "var(--accent)", SOLD: "var(--ok)", USED: "var(--ink-mute)" }[item.status] || "var(--paper)";
          return (
            <div key={item.id} style={{ border: "1px solid var(--ink)" }}>
              <div style={{ padding: 18, borderBottom: "1px solid var(--ink)", display: "grid", gridTemplateColumns: "1fr auto", gap: 14, alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <div className="cap mono" style={{ color: "var(--ink-mute)" }}>{item.id.toUpperCase()}</div>
                  <div className="serif" style={{ fontSize: 20, fontWeight: 400, lineHeight: 1.1, marginTop: 4 }}>{ev.title}</div>
                  <div className="mono cap-sm" style={{ color: "var(--ink-mute)", marginTop: 6 }}>{ev.venue} · {ev.date} · {ev.door}</div>
                </div>
                <span style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".08em", padding: "4px 8px", border: "1px solid var(--ink)", background: statusColor, color: item.status === "SOLD" ? "var(--paper)" : "var(--ink)", whiteSpace: "nowrap", alignSelf: "flex-start" }}>{item.status}</span>
              </div>
              <div style={{ padding: 18 }}>
                {tab === "buying" && (
                  <BuyingTicketCard item={item} ev={ev} />
                )}
                {tab === "selling" && (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
                      <div><div className="cap-sm mono" style={{ color: "var(--ink-mute)" }}>Listed at</div><div className="serif" style={{ fontSize: 28 }}>{fmt(item.price)}</div></div>
                      <div style={{ textAlign: "right" }}><div className="cap-sm mono" style={{ color: "var(--ink-mute)" }}>You receive</div><div className="serif" style={{ fontSize: 28 }}>{fmt(item.price)}</div></div>
                    </div>
                    <hr style={{ margin: "14px 0", border: 0, borderTop: "1px solid var(--rule)" }} />
                    <div style={{ fontSize: 13, color: "var(--ink-mute)" }}>{item.sub}</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                      {item.status === "LIVE" ? (
                        <><button className="btn btn-ghost btn-sm">Edit price</button><button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)", borderColor: "var(--danger)" }}>Delist</button></>
                      ) : (
                        <button className="btn btn-accent btn-sm">View payout schedule</button>
                      )}
                    </div>
                  </>
                )}
                {tab === "attended" && (
                  <>
                    <div style={{ fontSize: 13, color: "var(--ink-mute)" }}>{item.sub}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14 }}>
                      <span className="mono cap-sm">PAID {fmt(item.price + 0.99)}</span>
                      <span className="badge">RECEIPT</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── ALERTS SCREEN ──────────────────────────────────────────────────────────── */
function AlertsScreen({ go }) {
  const [alerts, setAlerts] = useState([
    { id:"al-01", eventId:"tp-thu-may7",    maxPrice:8.50,  autoBuy:true,  cardLast4:"4411", active:true, createdAt:"Mon, 04 May" },
    { id:"al-02", eventId:"au-summer-ball", maxPrice:60.00, autoBuy:false, cardLast4:null,   active:true, createdAt:"Sat, 02 May" },
  ]);
  const [showNew, setShowNew] = useState(false);
  const [newEv, setNewEv]     = useState(EVENTS[0]);
  const [newPrice, setNewPrice] = useState("");
  const [newAutoBuy, setNewAutoBuy] = useState(false);
  const [autoBuyConfirmed, setAutoBuyConfirmed] = useState(false);

  const addAlert = () => {
    if (!newPrice) return;
    setAlerts(a => [...a, {
      id: "al-" + Math.random().toString(36).slice(2,6),
      eventId: newEv.id, maxPrice: parseFloat(newPrice),
      autoBuy: newAutoBuy && autoBuyConfirmed, cardLast4: newAutoBuy && autoBuyConfirmed ? "4411" : null,
      active: true, createdAt: new Date().toLocaleDateString("en-GB",{weekday:"short",day:"2-digit",month:"short"})
    }]);
    setShowNew(false); setNewPrice(""); setNewAutoBuy(false); setAutoBuyConfirmed(false);
  };

  return (
    <div className="fade-in container" style={{ padding: "40px 32px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom: 8 }}>
        <div>
          <h1 style={{ fontSize: 36, fontWeight: 700, margin: "0 0 6px" }}>Price alerts & Auto-Buy</h1>
          <p style={{ color:"var(--ink-mute)", fontSize:14, maxWidth:560, lineHeight:1.5 }}>
            Set a target price for any event. We'll notify you the moment a verified listing hits it —
            or enable <b>Auto-Buy</b> to have us purchase it instantly on your behalf.
          </p>
        </div>
        <button className="btn btn-accent" onClick={() => setShowNew(true)}>+ New alert</button>
      </div>
      <hr className="rule-ink" style={{ margin:"24px 0" }} />

      {/* Feature callout */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:28 }}>
        {[
          { icon:"⚡", title:"Auto-Buy", desc:"Pre-authorise your card. The instant a verified ticket hits your price, we buy it — before anyone else sees it." },
          { icon:"🔔", title:"Notify & Hold", desc:"We ping you and hold the listing exclusively for 90 seconds while you decide." },
        ].map(f => (
          <div key={f.title} style={{ padding:"16px 18px", border:"1px solid var(--rule)", background:"var(--paper-2)", display:"flex", gap:14 }}>
            <span style={{ fontSize:22 }}>{f.icon}</span>
            <div>
              <div style={{ fontWeight:600, fontSize:14, marginBottom:4 }}>{f.title}</div>
              <div style={{ fontSize:13, color:"var(--ink-mute)", lineHeight:1.5 }}>{f.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display:"grid", gap:12 }}>
        {alerts.map((a) => {
          const ev   = EVENTS.find(e => e.id === a.eventId);
          const lst  = LISTINGS.filter(l => l.eventId === a.eventId);
          const floor = lst.length ? Math.min(...lst.map(l => l.price)) : null;
          const triggered = floor !== null && floor <= a.maxPrice;
          return (
            <div key={a.id} style={{ border:`1px solid ${triggered ? "var(--accent)" : "var(--ink)"}`, padding:"20px 24px", display:"grid", gridTemplateColumns:"2fr auto auto auto auto", gap:24, alignItems:"center", background: triggered ? "var(--accent-soft)" : "var(--paper)" }}>
              <div>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                  <span style={{ fontWeight:600, fontSize:16 }}>{ev.title}</span>
                  {a.autoBuy && (
                    <span style={{ padding:"2px 8px", background:"var(--ink)", color:"var(--paper)", fontFamily:"var(--mono)", fontSize:10, textTransform:"uppercase", letterSpacing:"0.08em" }}>⚡ Auto-Buy ON</span>
                  )}
                  {triggered && <span style={{ padding:"2px 8px", background:"var(--accent)", color:"var(--accent-fg)", fontFamily:"var(--mono)", fontSize:10, textTransform:"uppercase", letterSpacing:"0.08em" }}>● Triggered</span>}
                </div>
                <div style={{ fontSize:13, color:"var(--ink-mute)" }}>{ev.venue} · {ev.date}{a.autoBuy ? ` · card ····${a.cardLast4}` : " · notify only"}</div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:11, fontFamily:"var(--mono)", textTransform:"uppercase", color:"var(--ink-mute)", marginBottom:3 }}>Target</div>
                <div style={{ fontSize:22, fontFamily:"var(--serif)" }}>{fmt(a.maxPrice)}</div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:11, fontFamily:"var(--mono)", textTransform:"uppercase", color:"var(--ink-mute)", marginBottom:3 }}>Floor now</div>
                <div style={{ fontSize:22, fontFamily:"var(--serif)", color: triggered ? "var(--accent-deep)" : "var(--ink)" }}>{floor ? fmt(floor) : "—"}</div>
              </div>
              {triggered && !a.autoBuy && (
                <button className="btn btn-accent btn-sm" onClick={() => go("browse")}>Buy now →</button>
              )}
              {triggered && a.autoBuy && (
                <span style={{ fontSize:13, fontWeight:600, color:"var(--accent-deep)" }}>✓ Purchased automatically</span>
              )}
              {!triggered && <div />}
              <div style={{ display:"flex", gap:6 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setAlerts(alerts.map(x => x.id===a.id ? {...x, active:!x.active} : x))}>{a.active?"Pause":"Resume"}</button>
                <button className="btn btn-ghost btn-sm" style={{ borderColor:"var(--danger)", color:"var(--danger)" }} onClick={() => setAlerts(alerts.filter(x => x.id!==a.id))}>✕</button>
              </div>
            </div>
          );
        })}
      </div>

      {showNew && (
        <div className="modal-backdrop" onClick={() => setShowNew(false)}>
          <div className="modal fade-in" style={{ maxWidth:560 }} onClick={e => e.stopPropagation()}>
            <div style={{ padding:"20px 24px", borderBottom:"1px solid var(--ink)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontWeight:700, fontSize:20 }}>New price alert</div>
              <button onClick={() => setShowNew(false)} style={{ all:"unset", cursor:"pointer", fontSize:18, color:"var(--ink-mute)" }}>✕</button>
            </div>
            <div style={{ padding:"20px 24px", display:"grid", gap:18 }}>
              <div>
                <label style={{ fontSize:12, fontFamily:"var(--mono)", textTransform:"uppercase", letterSpacing:"0.1em", color:"var(--ink-mute)", display:"block", marginBottom:8 }}>Event</label>
                <select className="field" value={newEv.id} onChange={e => setNewEv(EVENTS.find(ev => ev.id===e.target.value))} style={{ fontSize:14 }}>
                  {EVENTS.map(ev => <option key={ev.id} value={ev.id}>{ev.title} — {ev.date}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize:12, fontFamily:"var(--mono)", textTransform:"uppercase", letterSpacing:"0.1em", color:"var(--ink-mute)", display:"block", marginBottom:8 }}>Alert me if price drops to or below</label>
                <div style={{ position:"relative" }}>
                  <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", fontFamily:"var(--serif)", fontSize:22, fontStyle:"italic" }}>£</span>
                  <input className="field" type="number" min="1" step="0.50" placeholder="0.00" value={newPrice} onChange={e => setNewPrice(e.target.value)} style={{ paddingLeft:36, fontSize:22, fontFamily:"var(--serif)", fontStyle:"italic", height:60 }} />
                </div>
              </div>

              {/* Auto-Buy toggle */}
              <div style={{ border:"1px solid var(--rule)", borderRadius:0 }}>
                <div style={{ padding:"14px 16px", display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer", background: newAutoBuy ? "var(--accent-soft)" : "var(--paper)" }} onClick={() => { setNewAutoBuy(!newAutoBuy); setAutoBuyConfirmed(false); }}>
                  <div>
                    <div style={{ fontWeight:600, fontSize:14, marginBottom:2 }}>⚡ Enable Auto-Buy</div>
                    <div style={{ fontSize:13, color:"var(--ink-mute)" }}>Pre-authorise your card. We buy instantly when your price is hit.</div>
                  </div>
                  <div style={{ width:44, height:24, background: newAutoBuy ? "var(--accent)" : "var(--rule)", borderRadius:12, position:"relative", transition:"background .2s", flexShrink:0 }}>
                    <div style={{ position:"absolute", top:3, left: newAutoBuy ? 23 : 3, width:18, height:18, borderRadius:"50%", background:"var(--paper)", transition:"left .2s", boxShadow:"0 1px 4px rgba(0,0,0,0.2)" }}></div>
                  </div>
                </div>
                {newAutoBuy && (
                  <div className="fade-in" style={{ padding:"14px 16px", borderTop:"1px solid var(--rule)", background:"var(--paper-2)" }}>
                    <div style={{ fontSize:13, lineHeight:1.6, marginBottom:12 }}>
                      Your saved card <b>····4411</b> will be charged automatically when a verified listing hits <b>{newPrice ? fmt(parseFloat(newPrice)) : "your target"}</b>. The ticket goes straight to your wallet. You won't need to do anything.
                    </div>
                    <label style={{ display:"flex", gap:10, alignItems:"flex-start", cursor:"pointer", fontSize:13 }}>
                      <input type="checkbox" checked={autoBuyConfirmed} onChange={e => setAutoBuyConfirmed(e.target.checked)} style={{ marginTop:2, accentColor:"var(--accent)", width:15, height:15 }} />
                      I authorise Exeticket to charge ····4411 automatically at this price for this event.
                    </label>
                  </div>
                )}
              </div>

              <button className="btn btn-accent btn-lg" style={{ width:"100%", justifyContent:"center" }}
                disabled={!newPrice || (newAutoBuy && !autoBuyConfirmed)}
                onClick={addAlert}>
                {newAutoBuy && autoBuyConfirmed ? "⚡ Create Auto-Buy order" : "Create alert"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── AUTH SCREEN ────────────────────────────────────────────────────────────── */
function AuthScreen({ go, onSignIn }) {
  const [tab, setTab]           = useState("signin");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [stage, setStage]       = useState("form");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [showPass, setShowPass] = useState(false);

  const validEmail = email.endsWith("@exeter.ac.uk") && email.length > 16;
  const validPass  = password.length >= 8;
  const validForm  = validEmail && validPass && (tab === "signin" || confirm === password);

  const handleSubmit = async () => {
    setError(""); setLoading(true);
    if (tab === "signup") {
      const { error: err } = await supabase.auth.signUp({
        email, password, options: { emailRedirectTo: window.location.origin }
      });
      if (err) { setError(err.message); setLoading(false); return; }
      setStage("verify");
    } else {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) {
        if (err.message.toLowerCase().includes("email not confirmed")) {
          setError("Please verify your email first — check your inbox for the confirmation link.");
        } else if (err.message.toLowerCase().includes("invalid")) {
          setError("Incorrect email or password.");
        } else { setError(err.message); }
        setLoading(false); return;
      }
      setStage("success");
      setTimeout(() => onSignIn(email), 1000);
    }
    setLoading(false);
  };

  const handleForgot = async () => {
    if (!validEmail) { setError("Enter your @exeter.ac.uk email first."); return; }
    setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (err) { setError(err.message); }
    else { alert("Password reset email sent to " + email + ". Check your inbox."); }
    setLoading(false);
  };

  const LeftPanel = () => (
    <div className="ink-bg" style={{ padding: "80px 64px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <h1 className="serif" style={{ fontSize: "clamp(40px, 5vw, 80px)", fontStyle: "italic", fontWeight: 400, lineHeight: 0.95, letterSpacing: "-0.02em" }}>
        University-only.<br />By design.
      </h1>
      <p style={{ fontSize: 17, lineHeight: 1.6, maxWidth: 400, color: "oklch(0.78 0.01 80)", marginTop: 24 }}>
        Only <span style={{ color: "var(--accent)" }}>@exeter.ac.uk</span> addresses are accepted. Your email is verified before your account is activated.
      </p>
      <div style={{ marginTop: 40, display: "grid", gap: 14 }}>
        {[["🔒","Secure accounts","Email verified, password protected"],["🎫","Verified tickets","AI checks every screenshot before listing"],["💷","Escrow protection","Money held safely until you are through the door"]].map(([icon, title, desc]) => (
          <div key={title} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>{icon}</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: "var(--paper)" }}>{title}</div>
              <div style={{ fontSize: 13, color: "oklch(0.65 0.01 80)" }}>{desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (stage === "verify") return (
    <div className="fade-in" style={{ minHeight: "calc(100vh - 60px)", display: "grid", gridTemplateColumns: "1fr 1fr" }}>
      <LeftPanel />
      <div style={{ padding: "80px 64px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📬</div>
        <h2 className="serif" style={{ fontSize: 36, fontStyle: "italic", fontWeight: 400, margin: "0 0 12px" }}>Check your inbox.</h2>
        <p style={{ color: "var(--ink-mute)", fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>
          We sent a verification link to <b style={{ fontFamily: "var(--mono)" }}>{email}</b>. Click the link to activate your account, then come back here to sign in.
        </p>
        <div style={{ padding: "14px 16px", background: "var(--paper-2)", border: "1px solid var(--rule)", fontSize: 13, color: "var(--ink-mute)", lineHeight: 1.6 }}>
          Not arrived? Check your spam. Still nothing?{" "}
          <span style={{ textDecoration: "underline", cursor: "pointer", color: "var(--ink)" }}
            onClick={async () => { await supabase.auth.resend({ type: "signup", email }); alert("Verification email resent."); }}>
            Resend it
          </span>.
        </div>
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 20, alignSelf: "flex-start" }} onClick={() => { setStage("form"); setTab("signin"); }}>
          Back to sign in
        </button>
      </div>
    </div>
  );

  if (stage === "success") return (
    <div className="fade-in" style={{ minHeight: "calc(100vh - 60px)", display: "grid", gridTemplateColumns: "1fr 1fr" }}>
      <LeftPanel />
      <div style={{ padding: "80px 64px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ display: "inline-block", padding: "4px 12px", background: "var(--accent)", color: "var(--accent-fg)", fontFamily: "var(--mono)", fontSize: 11, textTransform: "uppercase", marginBottom: 14 }}>● Signed in</div>
        <h2 className="serif" style={{ fontSize: 48, fontStyle: "italic", fontWeight: 400, margin: "0 0 8px", lineHeight: 1 }}>You are in.</h2>
        <p style={{ color: "var(--ink-mute)" }}>Redirecting…</p>
      </div>
    </div>
  );

  return (
    <div className="fade-in" style={{ minHeight: "calc(100vh - 60px)", display: "grid", gridTemplateColumns: "1fr 1fr" }}>
      <LeftPanel />
      <div style={{ padding: "80px 64px", display: "flex", flexDirection: "column", justifyContent: "center", maxWidth: 520 }}>
        <div style={{ display: "flex", gap: 0, marginBottom: 32, borderBottom: "1px solid var(--rule)" }}>
          {[["signin","Sign in"],["signup","Create account"]].map(([id, label]) => (
            <button key={id} onClick={() => { setTab(id); setError(""); }} style={{
              all: "unset", cursor: "pointer", padding: "10px 20px", fontSize: 15, fontWeight: 600,
              borderBottom: tab === id ? "2px solid var(--accent)" : "2px solid transparent",
              color: tab === id ? "var(--ink)" : "var(--ink-mute)", marginBottom: "-1px",
            }}>{label}</button>
          ))}
        </div>
        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ink-mute)", display: "block", marginBottom: 8 }}>University email</label>
            <input className="field" type="email" placeholder="ab1234@exeter.ac.uk" value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }} style={{ fontSize: 16 }} />
            {email && !validEmail && <div style={{ color: "var(--danger)", fontSize: 12, marginTop: 6 }}>Must be an @exeter.ac.uk address</div>}
          </div>
          <div>
            <label style={{ fontSize: 12, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ink-mute)", display: "block", marginBottom: 8 }}>Password</label>
            <div style={{ position: "relative" }}>
              <input className="field" type={showPass ? "text" : "password"}
                placeholder={tab === "signup" ? "Min. 8 characters" : "Your password"}
                value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }}
                onKeyDown={(e) => e.key === "Enter" && validForm && handleSubmit()}
                style={{ fontSize: 16, paddingRight: 56 }} />
              <button onClick={() => setShowPass(!showPass)} style={{
                all: "unset", cursor: "pointer", position: "absolute", right: 14, top: "50%",
                transform: "translateY(-50%)", fontSize: 12, color: "var(--ink-mute)"
              }}>{showPass ? "Hide" : "Show"}</button>
            </div>
            {tab === "signup" && password && !validPass && <div style={{ color: "var(--danger)", fontSize: 12, marginTop: 6 }}>At least 8 characters</div>}
          </div>
          {tab === "signup" && (
            <div>
              <label style={{ fontSize: 12, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ink-mute)", display: "block", marginBottom: 8 }}>Confirm password</label>
              <input className="field" type={showPass ? "text" : "password"} placeholder="Re-enter password"
                value={confirm} onChange={(e) => { setConfirm(e.target.value); setError(""); }}
                onKeyDown={(e) => e.key === "Enter" && validForm && handleSubmit()}
                style={{ fontSize: 16, borderColor: confirm && confirm !== password ? "var(--danger)" : undefined }} />
              {confirm && confirm !== password && <div style={{ color: "var(--danger)", fontSize: 12, marginTop: 6 }}>Passwords do not match</div>}
            </div>
          )}
          {error && (
            <div style={{ padding: "10px 14px", background: "#FEF2F2", border: "1px solid var(--danger)", color: "var(--danger)", fontSize: 13, lineHeight: 1.5 }}>{error}</div>
          )}
          <button className="btn btn-accent btn-lg" disabled={!validForm || loading}
            style={{ width: "100%", justifyContent: "center", marginTop: 4 }} onClick={handleSubmit}>
            {loading
              ? <><span className="spin" style={{ borderColor: "var(--accent-fg)", borderRightColor: "transparent" }}></span>{" "}{tab === "signup" ? "Creating account…" : "Signing in…"}</>
              : tab === "signup" ? "Create account →" : "Sign in →"}
          </button>
          {tab === "signin" && (
            <button onClick={handleForgot} style={{ all: "unset", cursor: "pointer", fontSize: 13, color: "var(--ink-mute)", textAlign: "center", textDecoration: "underline" }}>
              Forgot password?
            </button>
          )}
          <div className="mono cap-sm" style={{ color: "var(--ink-mute)", textAlign: "center", fontSize: 11 }}>
            By continuing you agree to our terms · refund policy · escrow rules
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── ACCOUNT SCREEN ─────────────────────────────────────────────────────────── */
function AccountScreen({ go, user, onSignOut }) {
  const [section, setSection] = useState("profile");
  const sections = [{ id: "profile", label: "Profile" }, { id: "payouts", label: "Payout details" }, { id: "security", label: "Security" }, { id: "notifications", label: "Notifications" }, { id: "data", label: "Data & privacy" }];

  return (
    <div className="fade-in container" style={{ padding: "40px 32px", maxWidth: 1200 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div>
          <div className="cap mono" style={{ color: "var(--ink-mute)" }}>§ Account</div>
          <h1 className="serif" style={{ fontSize: 64, fontStyle: "italic", fontWeight: 400, margin: "10px 0 0", letterSpacing: "-0.02em", lineHeight: 0.95 }}>Hi, {user.handle}.</h1>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="mono cap-sm" style={{ color: "var(--ink-mute)" }}>Member since</div>
          <div className="serif" style={{ fontSize: 22 }}>September 2024</div>
          <div className="mono cap-sm" style={{ color: "var(--accent)", marginTop: 4 }}>● VERIFIED EXETER STUDENT</div>
        </div>
      </div>
      <hr className="rule-ink" style={{ margin: "24px 0" }} />
      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 48, alignItems: "start" }}>
        <aside>
          {sections.map((s) => (
            <button key={s.id} onClick={() => setSection(s.id)} style={{
              all: "unset", cursor: "pointer", display: "block", width: "100%",
              padding: "12px 14px", marginBottom: 2,
              borderLeft: section === s.id ? "2px solid var(--accent)" : "2px solid transparent",
              background: section === s.id ? "var(--paper-2)" : "transparent", fontSize: 15
            }}>{s.label}</button>
          ))}
          <hr className="rule-ink" style={{ margin: "18px 0" }} />
          <button className="btn btn-ghost btn-sm" style={{ width: "100%", justifyContent: "center", borderColor: "var(--danger)", color: "var(--danger)" }} onClick={onSignOut}>Sign out</button>
        </aside>
        <div>
          {section === "profile" && (
            <div>
              <h2 className="serif" style={{ fontSize: 32, fontStyle: "italic", fontWeight: 400, margin: "0 0 18px" }}>Profile</h2>
              {[["Display handle", `@${user.handle}`], ["University email", `${user.handle}@exeter.ac.uk`], ["First name", "Marlow"], ["Course / year", "BSc Computer Science · Year 3"]].map(([l, v]) => (
                <div key={l} style={{ display: "grid", gridTemplateColumns: "200px 1fr auto", gap: 18, padding: "18px 0", borderBottom: "1px solid var(--rule)", alignItems: "center" }}>
                  <div className="cap mono" style={{ color: "var(--ink-mute)" }}>{l}</div>
                  <div className="mono" style={{ fontSize: 14 }}>{v}</div>
                  <button className="btn btn-ghost btn-sm">Edit</button>
                </div>
              ))}
            </div>
          )}
          {section === "payouts" && (
            <div>
              <h2 className="serif" style={{ fontSize: 32, fontStyle: "italic", fontWeight: 400, margin: "0 0 8px" }}>Payouts</h2>
              <p style={{ fontSize: 14, color: "var(--ink-mute)", maxWidth: 560, marginBottom: 18 }}>Payouts hit your account 2 hours after the buyer scans in at the door. UK Faster Payments only.</p>
              {[["Account holder", "Marlow Bennett"], ["Sort code", "04-00-04"], ["Account number", "•••• 8821"], ["Currency", "GBP"]].map(([l, v]) => (
                <div key={l} style={{ display: "grid", gridTemplateColumns: "200px 1fr auto", gap: 18, padding: "18px 0", borderBottom: "1px solid var(--rule)", alignItems: "center" }}>
                  <div className="cap mono" style={{ color: "var(--ink-mute)" }}>{l}</div>
                  <div className="mono" style={{ fontSize: 14 }}>{v}</div>
                  <button className="btn btn-ghost btn-sm">Edit</button>
                </div>
              ))}
            </div>
          )}
          {section === "security" && (
            <div>
              <h2 className="serif" style={{ fontSize: 32, fontStyle: "italic", fontWeight: 400, margin: "0 0 18px" }}>Security</h2>
              {[["Sign-in method", "Magic link · @exeter.ac.uk"], ["Active sessions", "2 devices · MacBook Pro · iPhone"], ["Two-factor", "Authenticator app · enabled"], ["Backup codes", "8 of 10 unused"]].map(([l, v]) => (
                <div key={l} style={{ display: "grid", gridTemplateColumns: "200px 1fr auto", gap: 18, padding: "18px 0", borderBottom: "1px solid var(--rule)", alignItems: "center" }}>
                  <div className="cap mono" style={{ color: "var(--ink-mute)" }}>{l}</div>
                  <div className="mono" style={{ fontSize: 14 }}>{v}</div>
                  <button className="btn btn-ghost btn-sm">Manage</button>
                </div>
              ))}
            </div>
          )}
          {(section === "notifications" || section === "data") && (
            <div>
              <h2 className="serif" style={{ fontSize: 32, fontStyle: "italic", fontWeight: 400, margin: "0 0 18px" }}>{section === "notifications" ? "Notifications" : "Data & privacy"}</h2>
              <p style={{ color: "var(--ink-mute)", fontSize: 14 }}>Settings for {section} are available here.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── ADMIN SCREEN ───────────────────────────────────────────────────────────── */
function AdminScreen({ go }) {
  const [filter, setFilter] = useState("open");
  const [selected, setSelected] = useState(DISPUTES[0]);
  const filtered = DISPUTES.filter((d) => filter === "all" || d.status === filter);

  return (
    <div className="fade-in container" style={{ padding: "40px 32px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div>
          <div className="cap mono" style={{ color: "var(--ink-mute)" }}>§ Admin · Trust & Safety</div>
          <h1 className="serif" style={{ fontSize: 64, fontStyle: "italic", fontWeight: 400, margin: "10px 0 0", letterSpacing: "-0.02em", lineHeight: 0.95 }}>Disputes desk.</h1>
        </div>
        <div style={{ display: "flex", gap: 24 }}>
          {[["4", "Open"], ["11", "This week"], ["2.4h", "Avg. resolution"], ["98.1%", "Buyer-favoured"]].map(([k, v]) => (
            <div key={k} style={{ textAlign: "right" }}>
              <div className="serif" style={{ fontSize: 32, fontStyle: "italic", lineHeight: 1 }}>{k}</div>
              <div className="cap-sm mono" style={{ color: "var(--ink-mute)" }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
      <hr className="rule-ink" style={{ margin: "24px 0" }} />
      <div style={{ display: "grid", gridTemplateColumns: "420px 1fr", gap: 32 }}>
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {["open", "investigating", "review", "all"].map((f) => (
              <button key={f} onClick={() => setFilter(f)} className="badge" style={{ cursor: "pointer", textTransform: "uppercase", background: filter === f ? "var(--ink)" : "var(--paper)", color: filter === f ? "var(--paper)" : "var(--ink)" }}>{f}</button>
            ))}
          </div>
          {filtered.map((d) => {
            const ev = EVENTS.find((e) => e.id === d.eventId);
            return (
              <div key={d.id} onClick={() => setSelected(d)} style={{ cursor: "pointer", padding: "14px 16px", border: `1px solid ${selected?.id === d.id ? "var(--ink)" : "var(--rule)"}`, background: selected?.id === d.id ? "var(--accent)" : "var(--paper)", marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span className="mono" style={{ fontSize: 12 }}>{d.id}</span>
                  <span className="cap-sm mono" style={{ color: d.severity === "high" ? "var(--danger)" : d.severity === "medium" ? "var(--ink)" : "var(--ink-mute)" }}>● {d.severity}</span>
                </div>
                <div className="serif" style={{ fontSize: 18, marginTop: 4, lineHeight: 1.1 }}>{d.reason}</div>
                <div className="mono cap-sm" style={{ color: "var(--ink-mute)", marginTop: 6 }}>{ev?.title.slice(0, 36)}… · {d.opened}</div>
              </div>
            );
          })}
        </div>
        {selected && (() => {
          const ev = EVENTS.find((e) => e.id === selected.eventId);
          return (
            <div style={{ border: "1px solid var(--ink)" }}>
              <div style={{ padding: 24, borderBottom: "1px solid var(--ink)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div className="cap mono" style={{ color: "var(--ink-mute)" }}>{selected.id} · opened {selected.opened}</div>
                  <h2 className="serif" style={{ fontSize: 32, fontStyle: "italic", fontWeight: 400, margin: "8px 0 4px" }}>{selected.reason}</h2>
                  <div className="mono cap-sm" style={{ color: "var(--ink-mute)" }}>{ev?.title} · {ev?.date} · {ev?.venue}</div>
                </div>
                <span className="badge badge-ink">{selected.status.toUpperCase()}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid var(--ink)" }}>
                {[["Buyer", selected.buyer], ["Seller", selected.seller]].map(([label, handle], i) => (
                  <div key={label} style={{ padding: 24, borderLeft: i === 1 ? "1px solid var(--ink)" : "none" }}>
                    <div className="cap mono" style={{ color: "var(--ink-mute)" }}>{label}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                      <span style={{ width: 36, height: 36, background: "var(--ink)", color: "var(--paper)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600 }}>{handle.slice(0, 2).toUpperCase()}</span>
                      <div>
                        <div className="mono" style={{ fontSize: 14 }}>@{handle}</div>
                        <div className="cap-sm mono" style={{ color: "var(--ink-mute)" }}>verified · 4.9★</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ padding: 24 }}>
                <div className="cap mono" style={{ marginBottom: 12 }}>Timeline</div>
                <div style={{ display: "grid", gap: 14 }}>
                  {[
                    { t: selected.opened, who: selected.buyer, msg: "Filed dispute. Attached door-staff photo of failed scan." },
                    { t: "just now", who: "system", msg: "Auto-frozen seller payout. Escrow remains held." },
                    { t: "just now", who: "admin (you)", msg: "Reviewing. Seller asked for original receipt." },
                  ].map((e, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "80px 120px 1fr", gap: 14, alignItems: "flex-start" }}>
                      <span className="mono cap-sm" style={{ color: "var(--ink-mute)" }}>{e.t}</span>
                      <span className="mono" style={{ fontSize: 13 }}>{e.who}</span>
                      <span style={{ fontSize: 14 }}>{e.msg}</span>
                    </div>
                  ))}
                </div>
                <hr className="rule-ink" style={{ margin: "24px 0" }} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 24 }}>
                  <div className="ph-img" data-label="original ticket screenshot" style={{ height: 160, border: "1px solid var(--rule)" }}></div>
                  <div className="ph-img" data-label="door scan failure log" style={{ height: 160, border: "1px solid var(--rule)" }}></div>
                </div>
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button className="btn btn-ghost btn-sm">Request more info</button>
                  <button className="btn btn-ghost btn-sm" style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>Side with seller</button>
                  <button className="btn btn-accent">Refund buyer + flag seller</button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

/* ─── APP ROOT ───────────────────────────────────────────────────────────────── */
export default function App() {
  const [route, setRoute] = useState("home");
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedListing, setSelectedListing] = useState(null);
  const [prefillSellEvent, setPrefillSellEvent] = useState(null);
  const [user, setUser] = useState(null);
  const [infoModal, setInfoModal] = useState(null);

  const go = useCallback((r) => { setRoute(r); window.scrollTo({ top: 0, behavior: "instant" }); }, []);
  const openInfo = useCallback((kind) => setInfoModal(kind), []);

  // ── Real Supabase session on load ─────────────────────────────────────────
  useEffect(() => {
    // Check for an existing session when the page loads
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const email = session.user.email;
        setUser({
          initials: email.slice(0, 2).toUpperCase(),
          handle:   email.split("@")[0],
          role:     email === "admin@exeter.ac.uk" ? "admin" : "user",
          email,
        });
      }
      // Always start on home regardless of login state
    });

    // Listen for sign in / sign out events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const email = session.user.email;
        setUser({
          initials: email.slice(0, 2).toUpperCase(),
          handle:   email.split("@")[0],
          role:     email === "admin@exeter.ac.uk" ? "admin" : "user",
          email,
        });
        setRoute(r => r === "auth" ? "home" : r);
      } else {
        setUser(null);
        // Stay on home when logged out — don't redirect to auth
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // expose setSelectedEvent / setSelectedListing for browse inline buy
  const setEvAndGo = useCallback((ev, r) => { setSelectedEvent(ev); go(r); }, [go]);

  return (
    <>
      <style>{CSS}</style>
      {route !== "auth" && <Nav route={route} go={go} user={user} />}
      {route === "home" && <HomeScreen go={go} setSelectedEvent={setSelectedEvent} openInfo={openInfo} />}
      {route === "browse" && <BrowseScreen go={go} setSelectedEvent={setSelectedEvent} setSelectedListing={setSelectedListing} openInfo={openInfo} />}
      {route === "detail" && selectedEvent && <DetailScreen event={selectedEvent} go={go} setSelectedListing={setSelectedListing} openInfo={openInfo} setPrefillSellEvent={setPrefillSellEvent} />}
      {route === "buy" && selectedEvent && selectedListing && <BuyScreen event={selectedEvent} listing={selectedListing} go={go} />}
      {route === "sell" && (user ? <SellScreen go={go} prefillEvent={prefillSellEvent} /> : (() => { go("auth"); return null; })())}
      {route === "wallet" && (user ? <WalletScreen go={go} /> : (() => { go("auth"); return null; })())}
      {route === "alerts" && <AlertsScreen go={go} />}
      {route === "account" && <AccountScreen go={go} user={user} onSignOut={async () => { await supabase.auth.signOut(); setUser(null); go("auth"); }} />}
      {route === "auth" && <AuthScreen go={go} onSignIn={(em) => { setUser({ initials: em.slice(0, 2).toUpperCase(), handle: em.split("@")[0] }); }} />}
      {route === "admin" && (user?.role === "admin" ? <AdminScreen go={go} /> : (() => { go("home"); return null; })())}
      <InfoModal kind={infoModal} onClose={() => setInfoModal(null)} />
    </>
  );
}
