import { getAgentConfig, setAgentConfig } from "./lib/store.mjs";

export default async (req, context) => {
  try {
    const userId = context.params.userId;

    if (req.method === "PUT") {
      const body = await req.json();
      await setAgentConfig(
        userId,
        body.commission_rate ?? 0.15,
        body.agent_type ?? "default",
      );
    }

    const cfg = await getAgentConfig(userId);
    return Response.json(cfg);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
};

export const config = { path: "/api/agent-config/:userId" };
