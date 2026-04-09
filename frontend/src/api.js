const API = '/api';

async function _fetch(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.json();
}

export function fetchAgents() {
  return _fetch(`${API}/agents`);
}

export function fetchMetrics(period = 'monthly', agentId = 'all', date = null) {
  const p = new URLSearchParams({ period, agent_id: agentId });
  if (date) p.set('date', date);
  return _fetch(`${API}/metrics?${p}`);
}

export function fetchLeaderboard(period = 'monthly', date = null) {
  const p = new URLSearchParams({ period });
  if (date) p.set('date', date);
  return _fetch(`${API}/leaderboard?${p}`);
}

export async function updateAgentConfig(userId, commissionRate, agentType = 'default') {
  const res = await fetch(`${API}/agent-config/${userId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commission_rate: commissionRate, agent_type: agentType }),
  });
  if (!res.ok) throw new Error('Failed to update config');
  return res.json();
}

export async function refreshData() {
  const res = await fetch(`${API}/refresh`, { method: 'POST' });
  if (!res.ok) throw new Error('Refresh failed');
  return res.json();
}
