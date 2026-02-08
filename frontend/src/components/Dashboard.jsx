import { useState, useEffect } from 'react'
import api from '../api'
import '../styles/Dashboard.css'

function Dashboard({ token }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadDashboard() }, [])

  const loadDashboard = async () => {
    try {
      const res = await api.get('/dashboard/overview')
      setData(res.data)
    } catch (err) {
      console.error('Failed to load dashboard:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="dashboard-loading">Loading dashboard...</div>
  }

  if (!data) {
    return <div className="dashboard-loading">Failed to load dashboard data.</div>
  }

  const priorityColor = (p) => {
    switch (p) {
      case 'high': return '#dc2626'
      case 'medium': return '#f59e0b'
      case 'low': return '#22c55e'
      default: return '#666'
    }
  }

  const relativeDate = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    const now = new Date()
    const diff = Math.floor((d - now) / (1000 * 60 * 60 * 24))
    if (diff < -1) return `${Math.abs(diff)}d overdue`
    if (diff === 0) return 'Today'
    if (diff === 1) return 'Tomorrow'
    return `in ${diff}d`
  }

  const processStatus = (status) => {
    return status === 'online' ? 'status-online' : 'status-offline'
  }

  return (
    <div className="dashboard-content">
      <h1>Dashboard</h1>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{data.knowledge_total}</div>
          <div className="stat-label">Total Knowledge</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{data.pending_tasks?.length || 0}</div>
          <div className="stat-label">Pending Tasks</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{data.journal_streak}d</div>
          <div className="stat-label">Journal Streak</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{data.graph_nodes}</div>
          <div className="stat-label">Graph Nodes</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{data.queue_length}</div>
          <div className="stat-label">Queue Length</div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="dash-card">
          <div className="dash-card-header">Tasks Due Today</div>
          <div className="dash-card-body">
            {data.pending_tasks && data.pending_tasks.length > 0 ? (
              data.pending_tasks.slice(0, 5).map((task, i) => (
                <div key={i} className="dash-task-item">
                  <span className="dash-task-priority" style={{ backgroundColor: priorityColor(task.priority) }} />
                  <span className="dash-task-title">{task.title}</span>
                  {task.due_date && (
                    <span className="dash-task-due">{relativeDate(task.due_date)}</span>
                  )}
                </div>
              ))
            ) : (
              <div className="dash-empty">No pending tasks</div>
            )}
          </div>
        </div>

        <div className="dash-card">
          <div className="dash-card-header">
            Recent Journal
            {data.journal_latest_mood && (
              <span className="dash-mood">{data.journal_latest_mood}</span>
            )}
          </div>
          <div className="dash-card-body">
            {data.journal_recent && data.journal_recent.length > 0 ? (
              data.journal_recent.map((entry, i) => (
                <div key={i} className="dash-journal-item">
                  <div className="dash-journal-date">
                    {entry.created_at ? new Date(entry.created_at).toLocaleDateString() : ''}
                  </div>
                  <div className="dash-journal-text">
                    {(entry.content || entry.summary || '').substring(0, 120)}
                  </div>
                </div>
              ))
            ) : (
              <div className="dash-empty">No journal entries yet</div>
            )}
          </div>
        </div>

        <div className="dash-card dash-card-dark">
          <div className="dash-card-header">Worker Health</div>
          <div className="dash-card-body">
            {data.processes && data.processes.length > 0 ? (
              data.processes.map((p, i) => (
                <div key={i} className="dash-process">
                  <span className={`dash-process-dot ${processStatus(p.status)}`} />
                  <span className="dash-process-name">{p.name}</span>
                  <span className="dash-process-info">
                    {p.memory}MB | {p.restarts} restarts
                  </span>
                </div>
              ))
            ) : (
              <div className="dash-empty-dark">No process data</div>
            )}
          </div>
        </div>

        <div className="dash-card">
          <div className="dash-card-header">Top Tags</div>
          <div className="dash-card-body">
            {data.graph_top_tags && data.graph_top_tags.length > 0 ? (
              <div className="dash-tags">
                {data.graph_top_tags.map(([tag, count], i) => (
                  <span key={i} className="dash-tag">{tag} ({count})</span>
                ))}
              </div>
            ) : (
              <div className="dash-empty">No tags yet</div>
            )}
          </div>
        </div>
      </div>

      <div className="dash-card dash-card-dark dash-card-wide">
        <div className="dash-card-header">Recent Activity</div>
        <div className="dash-card-body dash-terminal">
          {data.recent_activity && data.recent_activity.length > 0 ? (
            data.recent_activity.map((a, i) => (
              <div key={i} className="dash-activity-line">
                <span className="dash-activity-time">
                  {a.timestamp ? new Date(a.timestamp).toLocaleTimeString('en-US', { hour12: false }) : ''}
                </span>
                <span className="dash-activity-source">[{a.source}]</span>
                <span className="dash-activity-text">{a.content}</span>
              </div>
            ))
          ) : (
            <div className="dash-empty-dark">No recent activity</div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Dashboard
