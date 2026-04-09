import React, { useState, useEffect } from 'react';
import { fetchAgents, updateAgentConfig } from '../api';

export default function AgentConfig() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rates, setRates] = useState({});
  const [saving, setSaving] = useState({});
  const [saved, setSaved] = useState({});

  useEffect(() => {
    setLoading(true);
    fetchAgents()
      .then((list) => {
        setAgents(list);
        const r = {};
        list.forEach((a) => {
          r[a.id] = String(Math.round(a.commission_rate * 10000) / 100);
        });
        setRates(r);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (userId) => {
    setSaving((p) => ({ ...p, [userId]: true }));
    setSaved((p) => ({ ...p, [userId]: false }));
    try {
      const rate = parseFloat(rates[userId]) / 100;
      if (isNaN(rate) || rate < 0 || rate > 1) return;
      await updateAgentConfig(userId, rate);
      setAgents((prev) =>
        prev.map((a) => (a.id === userId ? { ...a, commission_rate: rate } : a)),
      );
      setSaved((p) => ({ ...p, [userId]: true }));
      setTimeout(() => setSaved((p) => ({ ...p, [userId]: false })), 2000);
    } catch {
      // ignore
    } finally {
      setSaving((p) => ({ ...p, [userId]: false }));
    }
  };

  if (error) return <div className="error">Failed to load agents: {error}</div>;
  if (loading) return <div className="loading">Loading agents...</div>;

  return (
    <div className="agent-config">
      <h2>Agent Commission Configuration</h2>
      <p className="config-note">
        Set each agent's individual commission rate. Default rate is <strong>15%</strong>.
        Junior acquisitions agents should be set to <strong>5%</strong>.
        Commission calculations use each agent's individual rate.
      </p>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Email</th>
              <th>Commission Rate</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((agent) => (
              <tr key={agent.id}>
                <td style={{ fontWeight: 600 }}>
                  {agent.first_name} {agent.last_name}
                </td>
                <td>{agent.email}</td>
                <td>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    className="rate-input"
                    value={rates[agent.id] ?? ''}
                    onChange={(e) =>
                      setRates((p) => ({ ...p, [agent.id]: e.target.value }))
                    }
                    onKeyDown={(e) => e.key === 'Enter' && handleSave(agent.id)}
                  />
                  <span className="rate-suffix">%</span>
                </td>
                <td>
                  <button
                    className={`save-btn${saved[agent.id] ? ' saved' : ''}`}
                    onClick={() => handleSave(agent.id)}
                    disabled={saving[agent.id]}
                  >
                    {saving[agent.id] ? 'Saving...' : saved[agent.id] ? 'Saved' : 'Save'}
                  </button>
                </td>
              </tr>
            ))}
            {agents.length === 0 && (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: 32 }}>
                  No active agents found in Close
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
