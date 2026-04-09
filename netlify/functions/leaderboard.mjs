import {
  getActiveUsers,
  getCalls,
  getEmails,
  getWonOpportunities,
} from "./lib/close.mjs";
import { getAllAgentConfigs, getAllDealOverrides } from "./lib/store.mjs";
import {
  dateRange,
  mtdRange,
  filterOppsByDate,
  fmtDuration,
  oppRevenue,
} from "./lib/compute.mjs";

const CONTACT_DISPOSITIONS = new Set([
  "Made Contact",
  "Not Interested",
  "Offer Made",
  "Offer Accepted",
]);

export default async (req) => {
  try {
    const url = new URL(req.url);
    const period = url.searchParams.get("period") || "monthly";
    const refDate = url.searchParams.get("date") || null;

    const [dateFrom, dateTo] = dateRange(period, refDate);
    const [mtdFrom, mtdTo] = mtdRange();
    const isMtdSame = dateFrom === mtdFrom && dateTo === mtdTo;

    const [allCalls, allEmails, allOpps, users, configs, overrides, mtdCallsRaw] =
      await Promise.all([
        getCalls(dateFrom, dateTo),
        getEmails(dateFrom, dateTo),
        getWonOpportunities(),
        getActiveUsers(),
        getAllAgentConfigs(),
        getAllDealOverrides(),
        isMtdSame ? Promise.resolve(null) : getCalls(mtdFrom, mtdTo),
      ]);

    const mtdCallsAll = mtdCallsRaw ?? allCalls;

    const board = users.map((u) => {
      const uid = u.id;
      const rate = configs[uid]?.commission_rate ?? 0.15;

      const uCalls = allCalls.filter((c) => c.user_id === uid);
      const uMtdCalls = mtdCallsAll.filter((c) => c.user_id === uid);
      const uOpps = filterOppsByDate(
        allOpps.filter((o) => o.user_id === uid),
        dateFrom,
        dateTo,
      );
      const uMtdOpps = filterOppsByDate(
        allOpps.filter((o) => o.user_id === uid),
        mtdFrom,
        mtdTo,
      );

      const outbound = uCalls.filter((c) => c.direction === "outbound");
      const totalCalls = outbound.length;
      const smsVm = outbound.filter((c) => c.disposition === "No Answer/SMS").length;
      const offers = outbound.filter((c) => c.disposition === "Offer Made").length;
      const contact = outbound.filter((c) => CONTACT_DISPOSITIONS.has(c.disposition)).length;
      const talk = uCalls.reduce((s, c) => s + (c.duration || 0), 0);

      const mtdRev = uMtdOpps.reduce((s, o) => s + oppRevenue(o, overrides), 0);
      const commission = mtdRev * rate;
      const contactRate = totalCalls ? (contact / totalCalls) * 100 : 0;

      return {
        user_id: uid,
        name: `${u.first_name} ${u.last_name}`.trim(),
        commission_mtd: +commission.toFixed(2),
        talk_time_seconds: talk,
        talk_time_formatted: fmtDuration(talk),
        offers_made: offers,
        contact_rate: +contactRate.toFixed(2),
        total_calls: totalCalls,
        sms_vm_sent: smsVm,
        made_contact: contact,
      };
    });

    board.sort((a, b) => b.commission_mtd - a.commission_mtd);

    return Response.json(board);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
};

export const config = { path: "/api/leaderboard" };
