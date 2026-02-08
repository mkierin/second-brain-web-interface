import { useState, useEffect } from 'react'
import api from '../api'
import '../styles/Journal.css'

function Journal({ token }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState('week')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  useEffect(() => { loadEntries() }, [range])

  const loadEntries = async () => {
    setLoading(true)
    try {
      const params = { limit: 100 }
      const now = new Date()
      if (range === 'week') {
        const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000)
        params.date_from = weekAgo.toISOString()
      } else if (range === 'month') {
        const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000)
        params.date_from = monthAgo.toISOString()
      } else if (range === 'custom') {
        if (customFrom) params.date_from = new Date(customFrom).toISOString()
        if (customTo) params.date_to = new Date(customTo).toISOString()
      }
      const res = await api.get('/journal', { params })
      setEntries(res.data.entries || [])
    } catch (err) {
      console.error('Failed to load journal:', err)
    } finally {
      setLoading(false)
    }
  }

  const moodColor = (mood) => {
    if (!mood) return null
    const m = mood.toLowerCase()
    if (m.includes('happy') || m.includes('great') || m.includes('excited') || m.includes('grateful')) return '#22c55e'
    if (m.includes('sad') || m.includes('down') || m.includes('tired') || m.includes('stressed')) return '#f59e0b'
    if (m.includes('angry') || m.includes('frustrated') || m.includes('anxious')) return '#dc2626'
    return '#666'
  }

  const formatDate = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  const formatTime = (iso) => {
    if (!iso) return ''
    return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  // Group entries by date
  const groupedEntries = entries.reduce((acc, entry) => {
    const date = (entry.created_at || '').substring(0, 10)
    if (!acc[date]) acc[date] = []
    acc[date].push(entry)
    return acc
  }, {})

  return (
    <div className="journal-content">
      <h1>Journal</h1>

      <div className="journal-nav">
        {['week', 'month', 'all', 'custom'].map(r => (
          <button
            key={r}
            className={`range-btn ${range === r ? 'active' : ''}`}
            onClick={() => setRange(r)}
          >
            {r === 'week' ? 'This Week' : r === 'month' ? 'This Month' : r === 'all' ? 'All' : 'Custom'}
          </button>
        ))}
        {range === 'custom' && (
          <div className="custom-range">
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
            <span className="range-sep">to</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} />
            <button className="range-apply" onClick={loadEntries}>Apply</button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="journal-loading">Loading journal entries...</div>
      ) : entries.length === 0 ? (
        <div className="journal-empty">
          No journal entries for this period. Use chat or Telegram: "journal: your entry here"
        </div>
      ) : (
        <div className="journal-timeline">
          {Object.entries(groupedEntries).map(([date, dayEntries]) => (
            <div key={date} className="journal-day">
              <div className="journal-date-header">{formatDate(date + 'T00:00:00')}</div>
              {dayEntries.map((entry, idx) => {
                const meta = typeof entry.metadata === 'object' ? entry.metadata : {}
                const mood = meta.mood || null
                const tags = entry.tags || meta.tags || []
                return (
                  <div key={idx} className="journal-entry">
                    <div className="journal-time">{formatTime(entry.created_at)}</div>
                    <div className="journal-entry-body">
                      <div className="journal-entry-content">{entry.content || entry.summary || ''}</div>
                      <div className="journal-entry-meta">
                        {mood && (
                          <span className="journal-mood" style={{ color: moodColor(mood) }}>
                            {mood}
                          </span>
                        )}
                        {Array.isArray(tags) && tags.map((tag, i) => (
                          <span key={i} className="journal-tag">{tag}</span>
                        ))}
                        {meta.input_type === 'voice' && (
                          <span className="journal-voice-badge">voice</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Journal
