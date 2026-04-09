import { setDealOverride } from "./lib/store.mjs";

export default async (req, context) => {
  try {
    if (req.method !== "PUT") {
      return Response.json({ error: "PUT only" }, { status: 405 });
    }

    const opportunityId = context.params.opportunityId;
    const body = await req.json();
    const equity = body.equity_amount;

    if (equity != null) {
      await setDealOverride(opportunityId, Number(equity));
    }

    return Response.json({ status: "ok" });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
};

export const config = { path: "/api/deal-override/:opportunityId" };
