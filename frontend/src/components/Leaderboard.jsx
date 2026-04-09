import React, { useState, useEffect } from 'react';
import { fetchLeaderboard } from '../api';

const PERIODS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'ytd', label: 'Year to Date' },
];

const COLUMNS = [
  { key: 'commission_mtd', label: 'Commission MTD', fmt: 'currency' },
  { key: 'talk_time_seconds', label: 'Talk Time', fmt: 'time' },
  { key: 'offers_made', label: 'Offers Made', fmt: 'number' },
  { key: 'contact_rate', label: 'Contact Rate %', fmt: 'percent' },
  { key: 'total_calls', label: 'Total Calls', fmt: 'number' },
  { key: 'sms_vm_sent', label: 'SMS/VM Sent', fmt: 'number' },
];

function fmtCell(value, fmt, row) {
  switch (fmt) {
    case 'currency':
      return `$${(value || 0).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    case 'percent':
      return `${(value || 0).toFixed(1)}%`;
    case 'time':
      return row.talk_time_formatted || '0m';
    case 'number':
      return (value || 0).toLocaleString();
    default:
      return value;
  }
}

export default function Leaderboard() {
  const [period, setPeriod] = useState('monthly');
  const [data, setData] = useState([]);
  const [sortKey, setSortKey] = useState('commission_mtd');
  const [sortDir, setSortDir] = useState('desc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchLeaderboard(period)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [period]);

  const sorted = [...data].sort((a, b) => {
    const av = a[sortKey] ?? 0;
    const bv = b[sortKey] ?? 0;
    return sortDir === 'desc' ? bv - av : av - bv;
  });

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  return (
    <div className="leaderboard">
      {loading && <div className="loading-overlay" />}

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
      </div>

      {error ? (
        <div className="error">Failed to load leaderboard: {error}</div>
      ) : !loading || data.length ? (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Agent</th>
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className="sortable"
                    onClick={() => toggleSort(col.key)}
                  >
                    {col.label}
                    {sortKey === col.key ? (sortDir === 'desc' ? ' \u25BC' : ' \u25B2') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length + 2} style={{ textAlign: 'center', padding: 32 }}>
                    No agent data available
                  </td>
                </tr>
              ) : (
                sorted.map((row, i) => (
                  <tr key={row.user_id}>
                    <td className="rank">{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>{row.name}</td>
                    {COLUMNS.map((col) => (
                      <td key={col.key} className={col.fmt === 'currency' ? 'currency' : ''}>
                        {fmtCell(row[col.key], col.fmt, row)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="loading">Loading leaderboard...</div>
      )}
    </div>
  );
}
