import { useState, useEffect, useRef } from 'react'
import api from '../api'
import '../styles/Monitor.css'

function Monitor({ token }) {
  const [stats, setStats] = useState({})
  const [activities, setActivities] = useState([])
  const [queueStatus, setQueueStatus] = useState({})
  const [processes, setProcesses] = useState([])
  const [errors, setErrors] = useState([])
  const [loading, setLoading] = useState(true)
  const logEndRef = useRef(null)

  useEffect(() => {
    loadMonitoringData()
    const interval = setInterval(loadMonitoringData, 5000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activities])

  const loadMonitoringData = async () => {
    try {
      const [statsRes, activityRes, queueRes, processRes, errorsRes] = await Promise.all([
        api.get('/monitor/stats'),
        api.get('/monitor/activity?limit=100'),
        api.get('/monitor/queue'),
        api.get('/monitor/processes'),
        api.get('/monitor/errors?limit=10'),
      ])
      setStats(statsRes.data)
      setActivities(activityRes.data.activities || [])
      setQueueStatus(queueRes.data)
      setProcesses(processRes.data.processes || [])
      setErrors(errorsRes.data.errors || [])
      setLoading(false)
    } catch (error) {
      console.error('Failed to load monitoring data:', error)
      setLoading(false)
    }
  }

  const formatTimestamp = (timestamp) => {
    try {
      return new Date(timestamp).toLocaleTimeString('en-US', { hour12: false })
    } catch {
      return timestamp
    }
  }

  const formatUptime = (ts) => {
    if (!ts) return '-'
    const diff = Date.now() - ts
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
  }

  const getActivityColor = (type) => {
    switch (type) {
      case 'message': return 'activity-message'
      case 'error': return 'activity-error'
      case 'success': return 'activity-success'
      default: return 'activity-info'
    }
  }

  if (loading) {
    return <div className="monitor-loading">Initializing monitoring...</div>
  }

  return (
    <div className="monitor-content">
      <h1>System Monitor</h1>

      {/* Process status cards */}
      {processes.length > 0 && (
        <div className="process-grid">
          {processes.map((p, i) => (
            <div key={i} className="process-card">
              <div className="process-card-header">
                <span className={`process-dot ${p.status === 'online' ? 'dot-green' : 'dot-red'}`} />
                <span className="process-card-name">{p.name}</span>
                <span className={`process-status ${p.status === 'online' ? 'status-up' : 'status-down'}`}>
                  {p.status}
                </span>
              </div>
              <div className="process-card-stats">
                <div className="process-stat">
                  <span className="process-stat-label">CPU</span>
                  <span className="process-stat-value">{p.cpu}%</span>
                </div>
                <div className="process-stat">
                  <span className="process-stat-label">Memory</span>
                  <span className="process-stat-value">{p.memory_mb}MB</span>
                </div>
                <div className="process-stat">
                  <span className="process-stat-label">Uptime</span>
                  <span className="process-stat-value">{formatUptime(p.uptime)}</span>
                </div>
                <div className="process-stat">
                  <span className="process-stat-label">Restarts</span>
                  <span className="process-stat-value">{p.restarts}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="monitor-grid">
        <div className="monitor-card stats-card">
          <div className="card-header">System Statistics</div>
          <div className="stats-list">
            <div className="stat-row">
              <span className="stat-key">Queue Length:</span>
              <span className="stat-value">{stats.queue_length || 0}</span>
            </div>
            <div className="stat-row">
              <span className="stat-key">Active Conversations:</span>
              <span className="stat-value">{stats.active_conversations || 0}</span>
            </div>
            <div className="stat-row">
              <span className="stat-key">Knowledge Entries:</span>
              <span className="stat-value">{stats.total_knowledge_entries || 0}</span>
            </div>
            <div className="stat-row">
              <span className="stat-key">Vector Embeddings:</span>
              <span className="stat-value">{stats.vector_embeddings || 0}</span>
            </div>
            <div className="stat-row">
              <span className="stat-key">Content Size:</span>
              <span className="stat-value">{stats.content_size || '0 B'}</span>
            </div>
            <div className="stat-row">
              <span className="stat-key">Redis Memory:</span>
              <span className="stat-value">{stats.redis_memory || 'N/A'}</span>
            </div>
            <div className="stat-row">
              <span className="stat-key">Uptime:</span>
              <span className="stat-value">{stats.redis_uptime_hours || 0}h</span>
            </div>
          </div>
        </div>

        <div className="monitor-card stats-card">
          <div className="card-header">Knowledge Topics</div>
          <div className="stats-list">
            {stats.topics && Object.keys(stats.topics).length > 0 ? (
              Object.entries(stats.topics).map(([topic, count]) => (
                <div key={topic} className="stat-row">
                  <span className="stat-key">{topic}:</span>
                  <span className="stat-value">{count}</span>
                </div>
              ))
            ) : (
              <div className="stat-row">
                <span className="stat-key">No topics yet</span>
              </div>
            )}
          </div>
        </div>

        <div className="monitor-card queue-card">
          <div className="card-header">Task Queue ({queueStatus.queue_length || 0})</div>
          <div className="queue-list">
            {queueStatus.jobs && queueStatus.jobs.length > 0 ? (
              queueStatus.jobs.map((job, idx) => (
                <div key={idx} className="queue-item">
                  <span className="queue-agent">[{job.agent}]</span>
                  <span className="queue-source">{job.source}</span>
                  <span className="queue-preview">{job.preview}</span>
                </div>
              ))
            ) : (
              <div className="queue-empty">Queue is empty</div>
            )}
          </div>
        </div>
      </div>

      {/* Error log */}
      {errors.length > 0 && (
        <div className="monitor-card terminal-card">
          <div className="card-header">
            Error Log
            <span className="log-count">{errors.length} issues</span>
          </div>
          <div className="terminal">
            {errors.map((err, idx) => (
              <div key={idx} className="log-entry activity-error">
                <span className="log-time">[{err.timestamp ? formatTimestamp(err.timestamp) : '?'}]</span>
                <span className="log-source">[{err.agent || err.issue_type || 'error'}]</span>
                <span className="log-content">{err.user_input?.substring(0, 80) || err.error || JSON.stringify(err).substring(0, 80)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="monitor-card terminal-card">
        <div className="card-header">
          Activity Log
          <span className="log-count">{activities.length} events</span>
        </div>
        <div className="terminal">
          {activities.length > 0 ? (
            activities.map((activity, idx) => (
              <div key={idx} className={`log-entry ${getActivityColor(activity.type)}`}>
                <span className="log-time">[{formatTimestamp(activity.timestamp)}]</span>
                <span className="log-source">[{activity.source}]</span>
                <span className="log-content">{activity.content}</span>
              </div>
            ))
          ) : (
            <div className="log-entry activity-info">
              <span className="log-content">No recent activity</span>
            </div>
          )}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  )
}

export default Monitor
