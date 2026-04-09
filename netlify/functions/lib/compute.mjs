/**
 * Shared metric computation logic used by the metrics and leaderboard functions.
 */

const CONTACT_DISPOSITIONS = new Set([
  "Made Contact",
  "Not Interested",
  "Offer Made",
  "Offer Accepted",
]);

// ── Formatters ───────────────────────────────────────────────────────

export function fmtDuration(seconds) {
  const s = Math.floor(seconds || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

// ── Date ranges ──────────────────────────────────────────────────────

export function dateRange(period, refDate) {
  const ref = refDate ? new Date(refDate + "T12:00:00Z") : new Date();
  const y = ref.getUTCFullYear();
  const mo = ref.getUTCMonth();
  const day = ref.getUTCDate();

  let d0, d1;
  switch (period) {
    case "daily":
      d0 = new Date(Date.UTC(y, mo, day));
      d1 = new Date(Date.UTC(y, mo, day + 1));
      break;
    case "weekly": {
      const dow = ref.getUTCDay();
      const mondayOffset = (dow + 6) % 7;
      d0 = new Date(Date.UTC(y, mo, day - mondayOffset));
      d1 = new Date(Date.UTC(y, mo, day - mondayOffset + 7));
      break;
    }
    case "ytd":
      d0 = new Date(Date.UTC(y, 0, 1));
      d1 = new Date(Date.UTC(y, mo, day + 1));
      break;
    default: // monthly
      d0 = new Date(Date.UTC(y, mo, 1));
      d1 = new Date(Date.UTC(y, mo + 1, 1));
  }
  return [isoDate(d0), isoDate(d1)];
}

export function mtdRange() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const mo = now.getUTCMonth();
  const day = now.getUTCDate();
  return [
    isoDate(new Date(Date.UTC(y, mo, 1))),
    isoDate(new Date(Date.UTC(y, mo, day + 1))),
  ];
}

// ── Filters ──────────────────────────────────────────────────────────

export function filterByUser(items, userId) {
  return userId ? items.filter((i) => i.user_id === userId) : items;
}

export function filterOppsByDate(opps, from, to) {
  return opps.filter((o) => {
    const d = (o.date_won || o.date_created || "").slice(0, 10);
    return d >= from && d < to;
  });
}

// ── Revenue helper ───────────────────────────────────────────────────

export function oppRevenue(opp, overrides) {
  const ov = overrides[opp.id];
  if (ov != null) return Number(ov);
  return (opp.value || 0) / 100; // Close stores cents
}

// ── Activity ─────────────────────────────────────────────────────────

export function computeActivity(calls, emails) {
  const outbound = calls.filter((c) => c.direction === "outbound");
  const totalCalls = outbound.length;
  const smsVm = outbound.filter((c) => c.disposition === "No Answer/SMS").length;
  const offers = outbound.filter((c) => c.disposition === "Offer Made").length;
  const accepted = outbound.filter((c) => c.disposition === "Offer Accepted").length;
  const contact = outbound.filter((c) => CONTACT_DISPOSITIONS.has(c.disposition)).length;

  const manual = emails.filter(
    (e) => e.direction === "outgoing" && !e.sequence_id && !e.bulk_email_action_id,
  );

  const talkTime = calls.reduce((s, c) => s + (c.duration || 0), 0);

  return {
    total_calls: totalCalls,
    sms_vm_sent: smsVm,
    emails_sent: manual.length,
    offers_made: offers,
    offer_accepted: accepted,
    made_contact: contact,
    total_talk_time_seconds: talkTime,
    total_talk_time_formatted: fmtDuration(talkTime),
  };
}

// ── Conversion rates ─────────────────────────────────────────────────

export function computeConversions(activity, opps, allCalls) {
  const { total_calls: tc, made_contact: mc, offers_made: om, offer_accepted: oa, sms_vm_sent: sms, emails_sent: em } = activity;
  const deeds = opps.length;

  const contactRate = tc ? (mc / tc) * 100 : 0;
  const callsToOffer = mc ? (om / mc) * 100 : 0;
  const smsToOffer = sms ? (om / sms) * 100 : 0;
  const totalOut = tc + sms + em;
  const allToOffer = totalOut ? (om / totalOut) * 100 : 0;
  const acceptance = om ? (oa / om) * 100 : 0;

  const deedLeads = new Set(opps.map((o) => o.lead_id));
  const deedCalls = allCalls.filter((c) => deedLeads.has(c.lead_id) && (c.duration || 0) > 0);
  const avgTtDeed = deedCalls.length
    ? deedCalls.reduce((s, c) => s + c.duration, 0) / deedCalls.length
    : 0;

  return {
    contact_rate: +contactRate.toFixed(2),
    calls_to_offer: +callsToOffer.toFixed(2),
    sms_vm_to_offer: +smsToOffer.toFixed(2),
    all_outbound_to_offer: +allToOffer.toFixed(2),
    offer_acceptance_rate: +acceptance.toFixed(2),
    avg_talk_time_deed_seconds: Math.round(avgTtDeed),
    avg_talk_time_deed_formatted: fmtDuration(avgTtDeed),
    calls_per_signed_deed: deeds ? +(tc / deeds).toFixed(1) : 0,
  };
}

// ── Equity & Revenue ─────────────────────────────────────────────────

export function computeEquity(activity, opps, overrides) {
  const deeds = opps.length;
  const totalRev = opps.reduce((s, o) => s + oppRevenue(o, overrides), 0);
  const { total_calls: tc, offers_made: om } = activity;

  return {
    avg_equity_per_deal: deeds ? +(totalRev / deeds).toFixed(2) : 0,
    total_equity_acquired: +totalRev.toFixed(2),
    revenue_per_call: tc ? +(totalRev / tc).toFixed(2) : 0,
    revenue_per_offer: om ? +(totalRev / om).toFixed(2) : 0,
    total_revenue: +totalRev.toFixed(2),
  };
}

// ── Commission & Projections (always MTD) ────────────────────────────

export function computeCommission(mtdCalls, mtdOpps, rate, overrides) {
  const mtdTalk = mtdCalls.reduce((s, c) => s + (c.duration || 0), 0);
  const mtdRev = mtdOpps.reduce((s, o) => s + oppRevenue(o, overrides), 0);

  const now = new Date();
  const daysElapsed = now.getUTCDate();
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();

  const commMtd = mtdRev * rate;
  const estRev = daysElapsed ? (mtdRev / daysElapsed) * daysInMonth : 0;
  const estComm = estRev * rate;
  const talkHrs = mtdTalk / 3600;
  const effHourly = talkHrs ? commMtd / talkHrs : 0;

  return {
    commission_mtd: +commMtd.toFixed(2),
    est_monthly_revenue: +estRev.toFixed(2),
    est_monthly_commission: +estComm.toFixed(2),
    effective_hourly_rate: +effHourly.toFixed(2),
  };
}
