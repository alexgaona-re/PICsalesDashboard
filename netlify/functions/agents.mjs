import { getActiveUsers } from "./lib/close.mjs";
import { getAllAgentConfigs } from "./lib/store.mjs";

export default async () => {
  try {
    const [users, configs] = await Promise.all([
      getActiveUsers(),
      getAllAgentConfigs(),
    ]);

    const result = users.map((u) => ({
      ...u,
      commission_rate: configs[u.id]?.commission_rate ?? 0.15,
      agent_type: configs[u.id]?.agent_type ?? "default",
    }));

    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
};

export const config = { path: "/api/agents" };
