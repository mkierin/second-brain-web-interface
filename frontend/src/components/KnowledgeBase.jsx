import { useState, useEffect } from 'react'
import api from '../api'
import '../styles/KnowledgeBase.css'

function KnowledgeBase({ token }) {
  const [entries, setEntries] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState(null)
  const [showFilters, setShowFilters] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addText, setAddText] = useState('')
  const [addTags, setAddTags] = useState('')
  const [addUrl, setAddUrl] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [addMessage, setAddMessage] = useState('')
  const [filters, setFilters] = useState({
    tags: '',
    date_from: '',
    date_to: '',
    content_type: '',
    source: '',
  })

  useEffect(() => { loadEntries() }, [])

  const hasActiveFilters = () => {
    return filters.tags || filters.date_from || filters.date_to || filters.content_type || filters.source
  }

  const loadEntries = async (query = '') => {
    setLoading(true)
    try {
      let response
      if (hasActiveFilters() || query) {
        const params = { query, limit: 100 }
        if (filters.tags) params.tags = filters.tags
        if (filters.date_from) params.date_from = new Date(filters.date_from).toISOString()
        if (filters.date_to) params.date_to = new Date(filters.date_to).toISOString()
        if (filters.content_type) params.content_type = filters.content_type
        if (filters.source) params.source = filters.source
        response = await api.get('/knowledge/search', { params })
      } else {
        response = await api.get('/knowledge/entries', { params: { query, limit: 100 } })
      }
      setEntries(response.data.entries || [])
    } catch (error) {
      console.error('Failed to load entries:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (e) => {
    e.preventDefault()
    loadEntries(searchQuery)
  }

  const clearFilters = () => {
    setFilters({ tags: '', date_from: '', date_to: '', content_type: '', source: '' })
    loadEntries(searchQuery)
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!addText.trim()) return
    setAddLoading(true)
    setAddMessage('')
    try {
      const body = { text: addText.trim(), source: 'web' }
      if (addTags.trim()) body.tags = addTags.split(',').map(t => t.trim()).filter(Boolean)
      if (addUrl.trim()) body.url = addUrl.trim()
      const res = await api.post('/knowledge/add', body)
      setAddMessage(`Saved! Tags: ${(res.data.tags || []).join(', ')}`)
      setAddText('')
      setAddTags('')
      setAddUrl('')
      setTimeout(() => { setShowAddForm(false); setAddMessage(''); loadEntries(searchQuery) }, 1500)
    } catch (err) {
      setAddMessage(err.response?.data?.detail || 'Failed to save')
    } finally {
      setAddLoading(false)
    }
  }

  const handleDelete = async (entryId) => {
    if (!window.confirm('Delete this entry?')) return
    try {
      await api.delete(`/knowledge/${entryId}`)
      setSelectedEntry(null)
      loadEntries(searchQuery)
    } catch (err) {
      console.error('Failed to delete:', err)
    }
  }

  return (
    <div className="knowledge-base-content">
      <div className="kb-header">
        <h1>Knowledge Base</h1>
        <button className="add-knowledge-btn" onClick={() => setShowAddForm(!showAddForm)}>
          {showAddForm ? 'Cancel' : '+ Add Knowledge'}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleAdd} className="add-knowledge-form">
          <textarea
            placeholder="Write your note, idea, or paste content here..."
            value={addText}
            onChange={e => setAddText(e.target.value)}
            rows={4}
          />
          <div className="add-form-row">
            <input
              type="text"
              placeholder="Tags (comma-separated, optional)"
              value={addTags}
              onChange={e => setAddTags(e.target.value)}
            />
            <input
              type="url"
              placeholder="Source URL (optional)"
              value={addUrl}
              onChange={e => setAddUrl(e.target.value)}
            />
          </div>
          {addMessage && (
            <div className={addMessage.startsWith('Saved') ? 'success-message' : 'error-message'}>
              {addMessage}
            </div>
          )}
          <button type="submit" disabled={addLoading || !addText.trim()}>
            {addLoading ? 'Saving...' : 'Save to Brain'}
          </button>
        </form>
      )}

      <form onSubmit={handleSearch} className="search-bar">
        <input
          type="text"
          placeholder="Search your knowledge base..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <button type="button" className={`filter-toggle ${showFilters ? 'active' : ''}`} onClick={() => setShowFilters(!showFilters)}>
          Filters {hasActiveFilters() ? '*' : ''}
        </button>
        <button type="submit">Search</button>
      </form>

      {showFilters && (
        <div className="filters-row">
          <input
            type="text"
            placeholder="Tags (comma separated)"
            value={filters.tags}
            onChange={e => setFilters({ ...filters, tags: e.target.value })}
          />
          <input
            type="date"
            value={filters.date_from}
            onChange={e => setFilters({ ...filters, date_from: e.target.value })}
            placeholder="From"
          />
          <input
            type="date"
            value={filters.date_to}
            onChange={e => setFilters({ ...filters, date_to: e.target.value })}
            placeholder="To"
          />
          <select
            value={filters.content_type}
            onChange={e => setFilters({ ...filters, content_type: e.target.value })}
          >
            <option value="">All types</option>
            <option value="note">Note</option>
            <option value="url">URL</option>
            <option value="journal">Journal</option>
            <option value="tweet">Tweet</option>
          </select>
          <select
            value={filters.source}
            onChange={e => setFilters({ ...filters, source: e.target.value })}
          >
            <option value="">All sources</option>
            <option value="telegram">Telegram</option>
            <option value="web">Web</option>
          </select>
          {hasActiveFilters() && (
            <button type="button" className="clear-filters" onClick={clearFilters}>Clear</button>
          )}
        </div>
      )}

      {loading ? (
        <div className="loading">Loading entries...</div>
      ) : (
        <div className="entries-grid">
          {entries.length === 0 ? (
            <div className="no-entries">
              <p>No entries found.</p>
              {!showAddForm && (
                <button className="add-knowledge-btn" onClick={() => setShowAddForm(true)}>
                  Add your first note
                </button>
              )}
            </div>
          ) : (
            entries.map((entry, idx) => (
              <div
                key={entry.id || idx}
                className="entry-card"
                onClick={() => setSelectedEntry(entry)}
              >
                <h3>{entry.title || 'Untitled'}</h3>
                <p className="entry-summary">
                  {entry.summary || entry.content?.substring(0, 150) || 'No content'}
                </p>
                <div className="entry-meta">
                  {entry.created_at && (
                    <span className="entry-date">
                      {new Date(entry.created_at).toLocaleDateString()}
                    </span>
                  )}
                  {entry.category && (
                    <span className="entry-category">{entry.category}</span>
                  )}
                  {entry.tags && Array.isArray(entry.tags) && entry.tags.slice(0, 3).map((tag, i) => (
                    <span key={i} className="entry-tag-pill">{tag}</span>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {selectedEntry && (
        <div className="entry-modal" onClick={() => setSelectedEntry(null)}>
          <div className="entry-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-button" onClick={() => setSelectedEntry(null)}>&times;</button>
            <h2>{selectedEntry.title}</h2>
            <div className="entry-full-content">
              {selectedEntry.content || selectedEntry.summary}
            </div>
            {selectedEntry.tags && Array.isArray(selectedEntry.tags) && (
              <div className="entry-modal-tags">
                {selectedEntry.tags.map((tag, i) => (
                  <span key={i} className="entry-tag-pill">{tag}</span>
                ))}
              </div>
            )}
            {selectedEntry.url && (
              <a href={selectedEntry.url} target="_blank" rel="noopener noreferrer" className="entry-link">
                View Source &rarr;
              </a>
            )}
            {selectedEntry.id && (
              <button
                className="delete-entry-btn"
                onClick={() => handleDelete(selectedEntry.id)}
              >
                Delete Entry
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default KnowledgeBase
