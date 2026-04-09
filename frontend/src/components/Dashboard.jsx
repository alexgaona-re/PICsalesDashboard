import React, { useState, useEffect, useCallback } from 'react';
import { fetchMetrics, fetchAgents, refreshData } from '../api';

const PERIODS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'ytd', label: 'Year to Date' },
];

function Card({ label, value }) {
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
    </div>
  );
}

export default function Dashboard() {
  const [period, setPeriod] = useState('monthly');
  const [agentId, setAgentId] = useState('all');
  const [agents, setAgents] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [agentList, data] = await Promise.all([
        fetchAgents(),
        fetchMetrics(period, agentId),
      ]);
      setAgents(agentList);
      setMetrics(data);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [period, agentId]);

  useEffect(() => {
    load();
    const id = setInterval(load, 15 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  const handleRefresh = async () => {
    await refreshData();
    load();
  };

  // Formatters
  const n = (v) => (typeof v === 'number' ? v.toLocaleString() : '0');
  const pct = (v) => (typeof v === 'number' ? `${v.toFixed(1)}%` : '0%');
  const usd = (v) =>
    typeof v === 'number'
      ? `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : '$0.00';

  if (error && !metrics)
    return <div className="error">Failed to load dashboard: {error}</div>;

  const m = metrics;

  return (
    <div className="dashboard">
      {loading && <div className="loading-overlay" />}

      {/* ── Controls ─────────────────────────────────── */}
      <div className="controls">
        <div className="period-selector">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              className={period === p.value ? 'active' : ''}
              onClick={() => setPeriod(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
          <option value="all">All Agents (Team Total)</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.first_name} {a.last_name}
            </option>
          ))}
        </select>

        <button className="refresh-btn" onClick={handleRefresh} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>

        {lastRefresh && (
          <span className="last-refresh">
            Updated {lastRefresh.toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* ── Metrics ──────────────────────────────────── */}
      {!m ? (
        <div className="loading">Loading metrics...</div>
      ) : (
        <>
          {/* Activity */}
          <section className="metrics-section">
            <h2>Activity</h2>
            <div className="metrics-grid">
              <Card label="Total Calls Made" value={n(m.activity.total_calls)} />
              <Card label="SMS / Voicemails Sent" value={n(m.activity.sms_vm_sent)} />
              <Card label="Emails Sent" value={n(m.activity.emails_sent)} />
              <Card label="Offers Made" value={n(m.activity.offers_made)} />
              <Card
                label="Total Talk Time"
                value={m.activity.total_talk_time_formatted}
              />
              <Card label="Made Contact" value={n(m.activity.made_contact)} />
            </div>
          </section>

          {/* Conversion Rates */}
          <section className="metrics-section">
            <h2>Conversion Rates</h2>
            <div className="metrics-grid">
              <Card label="Contact Rate" value={pct(m.conversion_rates.contact_rate)} />
              <Card
                label="Calls &rarr; Offer"
                value={pct(m.conversion_rates.calls_to_offer)}
              />
              <Card
                label="SMS/VM &rarr; Offer"
                value={pct(m.conversion_rates.sms_vm_to_offer)}
              />
              <Card
                label="All Outbound &rarr; Offer"
                value={pct(m.conversion_rates.all_outbound_to_offer)}
              />
              <Card
                label="Offer Acceptance Rate"
                value={pct(m.conversion_rates.offer_acceptance_rate)}
              />
              <Card
                label="Avg Talk Time &rarr; Deed"
                value={m.conversion_rates.avg_talk_time_deed_formatted}
              />
              <Card
                label="Calls per Signed Deed"
                value={n(m.conversion_rates.calls_per_signed_deed)}
              />
            </div>
          </section>

          {/* Equity & Revenue */}
          <section className="metrics-section">
            <h2>Equity &amp; Revenue</h2>
            <div className="metrics-grid">
              <Card
                label="Avg Equity per Deal"
                value={usd(m.equity_revenue.avg_equity_per_deal)}
              />
              <Card
                label="Total Equity Acquired"
                value={usd(m.equity_revenue.total_equity_acquired)}
              />
              <Card
                label="Revenue per Call"
                value={usd(m.equity_revenue.revenue_per_call)}
              />
              <Card
                label="Revenue per Offer"
                value={usd(m.equity_revenue.revenue_per_offer)}
              />
            </div>
          </section>

          {/* Commission & Projections */}
          <section className="metrics-section">
            <h2>Commission &amp; Projections (MTD)</h2>
            <div className="metrics-grid">
              <Card
                label="Commission MTD"
                value={usd(m.commission_projections.commission_mtd)}
              />
              <Card
                label="Est. Monthly Revenue"
                value={usd(m.commission_projections.est_monthly_revenue)}
              />
              <Card
                label="Est. Monthly Commission"
                value={usd(m.commission_projections.est_monthly_commission)}
              />
              <Card
                label="Effective Hourly Rate"
                value={usd(m.commission_projections.effective_hourly_rate)}
              />
            </div>
          </section>

          {/* Deeds Signed */}
          <section className="metrics-section">
            <h2>Deeds Signed</h2>
            <div className="metrics-grid">
              <Card label="Total Deeds Signed" value={n(m.deeds_signed)} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
