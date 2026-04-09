import { getCalls, getEmails, getWonOpportunities } from "./lib/close.mjs";
import { getAgentConfig, getAllDealOverrides } from "./lib/store.mjs";
import {
  dateRange,
  mtdRange,
  filterByUser,
  filterOppsByDate,
  computeActivity,
  computeConversions,
  computeEquity,
  computeCommission,
} from "./lib/compute.mjs";

export default async (req) => {
  try {
    const url = new URL(req.url);
    const period = url.searchParams.get("period") || "monthly";
    const agentId = url.searchParams.get("agent_id") || "all";
    const refDate = url.searchParams.get("date") || null;

    const [dateFrom, dateTo] = dateRange(period, refDate);
    const [mtdFrom, mtdTo] = mtdRange();

    // Fetch data in parallel (cached within warm instances)
    const isMtdSame = dateFrom === mtdFrom && dateTo === mtdTo;
    const fetches = [
      getCalls(dateFrom, dateTo),
      getEmails(dateFrom, dateTo),
      getWonOpportunities(),
      getAllDealOverrides(),
      isMtdSame ? Promise.resolve(null) : getCalls(mtdFrom, mtdTo),
    ];
    const [periodCalls, periodEmails, allOpps, overrides, mtdCallsRaw] =
      await Promise.all(fetches);

    const mtdCallsAll = mtdCallsRaw ?? periodCalls;

    const uid = agentId !== "all" ? agentId : null;
    const pCalls = filterByUser(periodCalls, uid);
    const pEmails = filterByUser(periodEmails, uid);
    const pOpps = filterOppsByDate(filterByUser(allOpps, uid), dateFrom, dateTo);
    const mCalls = filterByUser(mtdCallsAll, uid);
    const mOpps = filterOppsByDate(filterByUser(allOpps, uid), mtdFrom, mtdTo);

    const rate = uid ? (await getAgentConfig(uid)).commission_rate : 0.15;

    const activity = computeActivity(pCalls, pEmails);
    const conversions = computeConversions(activity, pOpps, pCalls);
    const equity = computeEquity(activity, pOpps, overrides);
    const commission = computeCommission(mCalls, mOpps, rate, overrides);

    return Response.json({
      activity,
      conversion_rates: conversions,
      equity_revenue: equity,
      commission_projections: commission,
      deeds_signed: pOpps.length,
      period,
      agent_id: agentId,
      date_range: { from: dateFrom, to: dateTo },
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
};

export const config = { path: "/api/metrics" };
