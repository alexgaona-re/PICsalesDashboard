/**
 * Persistent key-value storage backed by Netlify Blobs.
 * Stores agent commission configs and per-deal equity overrides.
 */

import { getStore } from "@netlify/blobs";

function configs() {
  return getStore({ name: "agent-configs", consistency: "strong" });
}

function deals() {
  return getStore({ name: "deal-overrides", consistency: "strong" });
}

// ── Agent configs ────────────────────────────────────────────────────

export async function getAgentConfig(userId) {
  try {
    const data = await configs().get(userId, { type: "json" });
    if (data) return data;
  } catch {
    // key doesn't exist yet
  }
  return { user_id: userId, commission_rate: 0.15, agent_type: "default" };
}

export async function getAllAgentConfigs() {
  const store = configs();
  const result = {};
  try {
    const { blobs } = await store.list();
    for (const blob of blobs) {
      try {
        const data = await store.get(blob.key, { type: "json" });
        if (data) result[blob.key] = data;
      } catch {
        // skip corrupt entries
      }
    }
  } catch {
    // store may not exist yet
  }
  return result;
}

export async function setAgentConfig(userId, commissionRate, agentType = "default") {
  await configs().setJSON(userId, {
    user_id: userId,
    commission_rate: commissionRate,
    agent_type: agentType,
    updated_at: new Date().toISOString(),
  });
}

// ── Deal equity overrides ────────────────────────────────────────────

export async function getAllDealOverrides() {
  const store = deals();
  const result = {};
  try {
    const { blobs } = await store.list();
    for (const blob of blobs) {
      try {
        const data = await store.get(blob.key, { type: "json" });
        if (data) result[blob.key] = data.equity_amount;
      } catch {
        // skip
      }
    }
  } catch {
    // store may not exist yet
  }
  return result;
}

export async function setDealOverride(opportunityId, equityAmount) {
  await deals().setJSON(opportunityId, {
    opportunity_id: opportunityId,
    equity_amount: equityAmount,
    updated_at: new Date().toISOString(),
  });
}
