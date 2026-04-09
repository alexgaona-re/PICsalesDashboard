"""Flask API for the PIC KPI Sales Dashboard."""

import os
from calendar import monthrange
from collections import defaultdict
from datetime import date, datetime, timedelta

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS

# Load .env before anything that reads env vars
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

from close_client import CloseClient  # noqa: E402
from database import (  # noqa: E402
    get_agent_config,
    get_all_agent_configs,
    get_all_deal_overrides,
    init_db,
    set_agent_config,
    set_deal_override,
)

app = Flask(__name__)
CORS(app)
close = CloseClient()
init_db()

# ─── Helpers ─────────────────────────────────────────────────────────


def _date_range(period, ref_date=None):
    """Return (date_from, date_to) ISO strings for the requested period."""
    ref = datetime.strptime(ref_date, "%Y-%m-%d").date() if ref_date else date.today()
    if period == "daily":
        d0 = ref
        d1 = ref + timedelta(days=1)
    elif period == "weekly":
        d0 = ref - timedelta(days=ref.weekday())
        d1 = d0 + timedelta(days=7)
    elif period == "ytd":
        d0 = date(ref.year, 1, 1)
        d1 = ref + timedelta(days=1)
    else:  # monthly (default)
        d0 = ref.replace(day=1)
        d1 = (d0 + timedelta(days=32)).replace(day=1)
    return d0.isoformat(), d1.isoformat()


def _mtd_range():
    """Always return the current calendar-month MTD range."""
    today = date.today()
    d0 = today.replace(day=1)
    d1 = today + timedelta(days=1)
    return d0.isoformat(), d1.isoformat()


def _filter_by_user(items, user_id):
    if not user_id:
        return items
    return [i for i in items if i.get("user_id") == user_id]


def _filter_opps_by_date(opps, date_from, date_to):
    """Keep opportunities whose win/creation date falls in [date_from, date_to)."""
    out = []
    for o in opps:
        d = (o.get("date_won") or o.get("date_created") or "")[:10]
        if date_from <= d < date_to:
            out.append(o)
    return out


def _opp_revenue(opp, overrides):
    """Return dollar value for an opportunity, respecting manual overrides."""
    override = overrides.get(opp.get("id"))
    if override is not None:
        return float(override)
    # Close stores monetary values in cents
    return (opp.get("value") or 0) / 100.0


def _fmt_duration(seconds):
    s = int(seconds or 0)
    h, remainder = divmod(s, 3600)
    m = remainder // 60
    return f"{h}h {m}m" if h else f"{m}m"


# ─── Metric computation ─────────────────────────────────────────────

CONTACT_DISPOSITIONS = {"Made Contact", "Not Interested", "Offer Made", "Offer Accepted"}


def _compute_activity(calls, emails):
    outbound = [c for c in calls if c.get("direction") == "outbound"]
    total_calls = len(outbound)
    sms_vm = len([c for c in outbound if c.get("disposition") == "No Answer/SMS"])
    offers = len([c for c in outbound if c.get("disposition") == "Offer Made"])
    accepted = len([c for c in outbound if c.get("disposition") == "Offer Accepted"])
    contact = len([c for c in outbound if c.get("disposition") in CONTACT_DISPOSITIONS])

    # Manual emails = outgoing, not from a sequence or bulk action
    manual = [
        e
        for e in emails
        if e.get("direction") == "outgoing"
        and not e.get("sequence_id")
        and not e.get("bulk_email_action_id")
    ]
    emails_sent = len(manual)

    # Talk time across ALL calls (inbound + outbound)
    talk_time = sum(c.get("duration", 0) for c in calls)

    return {
        "total_calls": total_calls,
        "sms_vm_sent": sms_vm,
        "emails_sent": emails_sent,
        "offers_made": offers,
        "offer_accepted": accepted,
        "made_contact": contact,
        "total_talk_time_seconds": talk_time,
        "total_talk_time_formatted": _fmt_duration(talk_time),
    }


def _compute_conversions(activity, opps, all_calls):
    tc = activity["total_calls"]
    mc = activity["made_contact"]
    om = activity["offers_made"]
    oa = activity["offer_accepted"]
    sms = activity["sms_vm_sent"]
    em = activity["emails_sent"]
    deeds = len(opps)

    contact_rate = (mc / tc * 100) if tc else 0
    calls_to_offer = (om / mc * 100) if mc else 0
    sms_to_offer = (om / sms * 100) if sms else 0
    total_outbound = tc + sms + em
    all_outbound_to_offer = (om / total_outbound * 100) if total_outbound else 0
    acceptance = (oa / om * 100) if om else 0

    # Avg talk time on calls whose lead resulted in a deed
    deed_leads = {o.get("lead_id") for o in opps}
    deed_calls = [c for c in all_calls if c.get("lead_id") in deed_leads and c.get("duration", 0) > 0]
    avg_tt_deed = (sum(c["duration"] for c in deed_calls) / len(deed_calls)) if deed_calls else 0

    calls_per_deed = (tc / deeds) if deeds else 0

    return {
        "contact_rate": round(contact_rate, 2),
        "calls_to_offer": round(calls_to_offer, 2),
        "sms_vm_to_offer": round(sms_to_offer, 2),
        "all_outbound_to_offer": round(all_outbound_to_offer, 2),
        "offer_acceptance_rate": round(acceptance, 2),
        "avg_talk_time_deed_seconds": round(avg_tt_deed),
        "avg_talk_time_deed_formatted": _fmt_duration(avg_tt_deed),
        "calls_per_signed_deed": round(calls_per_deed, 1),
    }


def _compute_equity(activity, opps, overrides):
    deeds = len(opps)
    total_rev = sum(_opp_revenue(o, overrides) for o in opps)
    tc = activity["total_calls"]
    om = activity["offers_made"]

    return {
        "avg_equity_per_deal": round(total_rev / deeds, 2) if deeds else 0,
        "total_equity_acquired": round(total_rev, 2),
        "revenue_per_call": round(total_rev / tc, 2) if tc else 0,
        "revenue_per_offer": round(total_rev / om, 2) if om else 0,
        "total_revenue": round(total_rev, 2),
    }


def _compute_commission(mtd_calls, mtd_opps, rate, overrides):
    """Commission & projections — always based on MTD data."""
    mtd_outbound = [c for c in mtd_calls if c.get("direction") == "outbound"]
    mtd_talk = sum(c.get("duration", 0) for c in mtd_calls)
    mtd_rev = sum(_opp_revenue(o, overrides) for o in mtd_opps)

    today = date.today()
    days_elapsed = today.day  # 1st → 1, 2nd → 2, …
    _, days_in_month = monthrange(today.year, today.month)

    commission_mtd = mtd_rev * rate
    est_monthly_rev = (mtd_rev / days_elapsed * days_in_month) if days_elapsed else 0
    est_monthly_comm = est_monthly_rev * rate
    talk_hours = mtd_talk / 3600.0
    eff_hourly = (commission_mtd / talk_hours) if talk_hours else 0

    return {
        "commission_mtd": round(commission_mtd, 2),
        "est_monthly_revenue": round(est_monthly_rev, 2),
        "est_monthly_commission": round(est_monthly_comm, 2),
        "effective_hourly_rate": round(eff_hourly, 2),
    }


# ─── Routes ──────────────────────────────────────────────────────────


@app.route("/api/agents")
def api_agents():
    """Active Close users merged with their commission config."""
    users = close.get_active_users()
    configs = get_all_agent_configs()
    result = []
    for u in users:
        cfg = configs.get(u["id"], {})
        result.append(
            {
                **u,
                "commission_rate": cfg.get("commission_rate", 0.15),
                "agent_type": cfg.get("agent_type", "default"),
            }
        )
    return jsonify(result)


@app.route("/api/agent-config/<user_id>", methods=["GET", "PUT"])
def api_agent_config(user_id):
    if request.method == "PUT":
        data = request.get_json(force=True)
        set_agent_config(
            user_id,
            data.get("commission_rate", 0.15),
            data.get("agent_type", "default"),
        )
    return jsonify(get_agent_config(user_id))


@app.route("/api/metrics")
def api_metrics():
    period = request.args.get("period", "monthly")
    agent_id = request.args.get("agent_id", "all")
    ref_date = request.args.get("date")

    date_from, date_to = _date_range(period, ref_date)
    mtd_from, mtd_to = _mtd_range()

    # Fetch period data (cached)
    period_calls = close.get_calls(date_from, date_to)
    period_emails = close.get_emails(date_from, date_to)
    all_opps = close.get_won_opportunities()

    # MTD data for commission — reuse period data when period is already monthly
    if date_from == mtd_from and date_to == mtd_to:
        mtd_calls_raw = period_calls
    else:
        mtd_calls_raw = close.get_calls(mtd_from, mtd_to)

    uid = agent_id if agent_id != "all" else None

    p_calls = _filter_by_user(period_calls, uid)
    p_emails = _filter_by_user(period_emails, uid)
    p_opps = _filter_opps_by_date(_filter_by_user(all_opps, uid), date_from, date_to)
    m_calls = _filter_by_user(mtd_calls_raw, uid)
    m_opps = _filter_opps_by_date(_filter_by_user(all_opps, uid), mtd_from, mtd_to)

    rate = get_agent_config(uid)["commission_rate"] if uid else 0.15
    overrides = get_all_deal_overrides()

    activity = _compute_activity(p_calls, p_emails)
    conversions = _compute_conversions(activity, p_opps, p_calls)
    equity = _compute_equity(activity, p_opps, overrides)
    commission = _compute_commission(m_calls, m_opps, rate, overrides)

    return jsonify(
        {
            "activity": activity,
            "conversion_rates": conversions,
            "equity_revenue": equity,
            "commission_projections": commission,
            "deeds_signed": len(p_opps),
            "period": period,
            "agent_id": agent_id,
            "date_range": {"from": date_from, "to": date_to},
        }
    )


@app.route("/api/leaderboard")
def api_leaderboard():
    period = request.args.get("period", "monthly")
    ref_date = request.args.get("date")

    date_from, date_to = _date_range(period, ref_date)
    mtd_from, mtd_to = _mtd_range()

    all_calls = close.get_calls(date_from, date_to)
    all_emails = close.get_emails(date_from, date_to)
    all_opps = close.get_won_opportunities()
    mtd_calls_raw = (
        all_calls
        if (date_from == mtd_from and date_to == mtd_to)
        else close.get_calls(mtd_from, mtd_to)
    )

    users = close.get_active_users()
    configs = get_all_agent_configs()
    overrides = get_all_deal_overrides()

    board = []
    for u in users:
        uid = u["id"]
        cfg = configs.get(uid, {})
        rate = cfg.get("commission_rate", 0.15)

        u_calls = [c for c in all_calls if c.get("user_id") == uid]
        u_opps = _filter_opps_by_date(
            [o for o in all_opps if o.get("user_id") == uid], date_from, date_to
        )
        u_mtd_calls = [c for c in mtd_calls_raw if c.get("user_id") == uid]
        u_mtd_opps = _filter_opps_by_date(
            [o for o in all_opps if o.get("user_id") == uid], mtd_from, mtd_to
        )

        outbound = [c for c in u_calls if c.get("direction") == "outbound"]
        total_calls = len(outbound)
        sms_vm = len([c for c in outbound if c.get("disposition") == "No Answer/SMS"])
        offers = len([c for c in outbound if c.get("disposition") == "Offer Made"])
        contact = len(
            [c for c in outbound if c.get("disposition") in CONTACT_DISPOSITIONS]
        )
        talk = sum(c.get("duration", 0) for c in u_calls)

        mtd_rev = sum(_opp_revenue(o, overrides) for o in u_mtd_opps)
        commission = mtd_rev * rate
        contact_rate = (contact / total_calls * 100) if total_calls else 0

        board.append(
            {
                "user_id": uid,
                "name": f"{u.get('first_name','')} {u.get('last_name','')}".strip(),
                "commission_mtd": round(commission, 2),
                "talk_time_seconds": talk,
                "talk_time_formatted": _fmt_duration(talk),
                "offers_made": offers,
                "contact_rate": round(contact_rate, 2),
                "total_calls": total_calls,
                "sms_vm_sent": sms_vm,
                "made_contact": contact,
            }
        )

    board.sort(key=lambda x: x["commission_mtd"], reverse=True)
    return jsonify(board)


@app.route("/api/deal-override/<opportunity_id>", methods=["PUT"])
def api_deal_override(opportunity_id):
    data = request.get_json(force=True)
    equity = data.get("equity_amount")
    if equity is not None:
        set_deal_override(opportunity_id, float(equity))
    return jsonify({"status": "ok"})


@app.route("/api/refresh", methods=["POST"])
def api_refresh():
    close.clear_cache()
    return jsonify({"status": "cache_cleared"})


# ─── Entrypoint ──────────────────────────────────────────────────────

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
