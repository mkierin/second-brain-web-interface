import { useState, useEffect } from 'react'
import api from '../api'
import '../styles/Tasks.css'

function Tasks({ token }) {
  const [tasks, setTasks] = useState([])
  const [filter, setFilter] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', due_date: '', priority: 'medium', tags: '' })

  useEffect(() => { loadTasks() }, [filter])

  const loadTasks = async () => {
    setLoading(true)
    try {
      const params = {}
      if (filter !== 'all') params.task_status = filter
      const res = await api.get('/tasks', { params })
      setTasks(res.data.tasks || [])
    } catch (err) {
      console.error('Failed to load tasks:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) return
    try {
      const body = {
        title: form.title,
        priority: form.priority,
        tags: form.tags ? form.tags.split(',').map(t => t.trim()) : [],
      }
      if (form.due_date) body.due_date = new Date(form.due_date).toISOString()
      await api.post('/tasks', body)
      setForm({ title: '', due_date: '', priority: 'medium', tags: '' })
      setShowForm(false)
      loadTasks()
    } catch (err) {
      console.error('Failed to create task:', err)
    }
  }

  const handleComplete = async (taskId) => {
    try {
      await api.post(`/tasks/${taskId}/complete`)
      loadTasks()
    } catch (err) {
      console.error('Failed to complete task:', err)
    }
  }

  const handleDelete = async (taskId) => {
    try {
      await api.delete(`/tasks/${taskId}`)
      loadTasks()
    } catch (err) {
      console.error('Failed to delete task:', err)
    }
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
    if (diff === -1) return 'Yesterday'
    if (diff === 0) return 'Today'
    if (diff === 1) return 'Tomorrow'
    return `in ${diff}d`
  }

  return (
    <div className="tasks-content">
      <div className="tasks-header">
        <h1>Tasks</h1>
        <button className="add-task-btn" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Add Task'}
        </button>
      </div>

      {showForm && (
        <form className="task-form" onSubmit={handleCreate}>
          <input
            type="text"
            placeholder="Task title..."
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            autoFocus
          />
          <div className="task-form-row">
            <input
              type="datetime-local"
              value={form.due_date}
              onChange={e => setForm({ ...form, due_date: e.target.value })}
              placeholder="Due date"
            />
            <select
              value={form.priority}
              onChange={e => setForm({ ...form, priority: e.target.value })}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            <input
              type="text"
              placeholder="Tags (comma separated)"
              value={form.tags}
              onChange={e => setForm({ ...form, tags: e.target.value })}
            />
            <button type="submit">Create</button>
          </div>
        </form>
      )}

      <div className="filter-tabs">
        {['pending', 'completed', 'all'].map(f => (
          <button
            key={f}
            className={`filter-tab ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="tasks-loading">Loading tasks...</div>
      ) : tasks.length === 0 ? (
        <div className="tasks-empty">No {filter !== 'all' ? filter : ''} tasks. Use chat or Telegram to add tasks!</div>
      ) : (
        <div className="task-list">
          {tasks.map((task) => (
            <div key={task.id} className={`task-card ${task.status === 'completed' ? 'task-done' : ''}`}>
              <div className="task-priority-stripe" style={{ backgroundColor: priorityColor(task.priority) }} />
              <div className="task-body">
                <div className="task-title">{task.title}</div>
                <div className="task-meta">
                  {task.due_date && (
                    <span className={`task-due ${task.due_date < new Date().toISOString() && task.status !== 'completed' ? 'overdue' : ''}`}>
                      {relativeDate(task.due_date)}
                    </span>
                  )}
                  {task.tags && task.tags.length > 0 && task.tags.map((tag, i) => (
                    <span key={i} className="task-tag">{tag}</span>
                  ))}
                  <span className="task-priority-label">{task.priority}</span>
                </div>
              </div>
              <div className="task-actions">
                {task.status !== 'completed' && (
                  <button className="task-complete-btn" onClick={() => handleComplete(task.id)} title="Complete">
                    &#10003;
                  </button>
                )}
                <button className="task-delete-btn" onClick={() => handleDelete(task.id)} title="Delete">
                  &times;
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Tasks
