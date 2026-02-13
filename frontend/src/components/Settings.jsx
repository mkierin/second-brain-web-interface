import { useState, useEffect } from 'react'
import api from '../api'
import '../styles/Settings.css'

const PROVIDER_MODELS = {
  openai: ['gpt-4o-mini', 'gpt-4o'],
  deepseek: ['deepseek-chat'],
  openrouter: [
    'anthropic/claude-sonnet-4-20250514',
    'anthropic/claude-3-haiku-20240307',
    'meta-llama/llama-3-70b-instruct',
    'mistralai/mistral-large-latest',
    'google/gemini-pro-1.5',
  ],
}

function Settings({ token }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // LLM settings
  const [llmProvider, setLlmProvider] = useState('openai')
  const [llmModel, setLlmModel] = useState('')
  const [llmApiKey, setLlmApiKey] = useState('')
  const [llmStatus, setLlmStatus] = useState({})
  const [llmMessage, setLlmMessage] = useState('')
  const [llmError, setLlmError] = useState('')
  const [llmLoading, setLlmLoading] = useState(false)

  useEffect(() => { loadLlmSettings() }, [])

  const loadLlmSettings = async () => {
    try {
      const res = await api.get('/settings/llm')
      setLlmProvider(res.data.provider || 'openai')
      setLlmModel(res.data.model || '')
      setLlmStatus(res.data)
    } catch (err) {
      console.error('Failed to load LLM settings:', err)
    }
  }

  const handleLlmSave = async (e) => {
    e.preventDefault()
    setLlmMessage('')
    setLlmError('')
    setLlmLoading(true)
    try {
      const body = { provider: llmProvider, model: llmModel }
      if (llmApiKey) body.api_key = llmApiKey
      await api.post('/settings/llm', body)
      setLlmMessage('Settings saved! Changes apply on next message.')
      setLlmApiKey('')
      loadLlmSettings()
    } catch (err) {
      setLlmError(err.response?.data?.detail || 'Failed to save settings')
    } finally {
      setLlmLoading(false)
    }
  }

  const handlePasswordChange = async (e) => {
    e.preventDefault()
    setMessage('')
    setError('')

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match')
      return
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long')
      return
    }

    setLoading(true)
    try {
      await api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword
      })

      setMessage('Password changed successfully!')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to change password')
    } finally {
      setLoading(false)
    }
  }

  const models = PROVIDER_MODELS[llmProvider] || []

  return (
    <div className="settings-content">
      <h1>Settings</h1>

      <div className="settings-section">
        <h2>LLM Provider</h2>
        <form onSubmit={handleLlmSave} className="password-form">
          <div className="form-group">
            <label>Provider</label>
            <select
              value={llmProvider}
              onChange={(e) => {
                setLlmProvider(e.target.value)
                setLlmModel(PROVIDER_MODELS[e.target.value]?.[0] || '')
              }}
              className="settings-select"
            >
              <option value="openai">OpenAI</option>
              <option value="deepseek">DeepSeek</option>
              <option value="openrouter">OpenRouter</option>
            </select>
          </div>

          <div className="form-group">
            <label>Model</label>
            <select
              value={llmModel}
              onChange={(e) => setLlmModel(e.target.value)}
              className="settings-select"
            >
              {models.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {llmProvider === 'openrouter' && (
            <div className="form-group">
              <label>
                OpenRouter API Key
                {llmStatus.openrouter_key_masked && (
                  <span className="key-hint"> (current: {llmStatus.openrouter_key_masked})</span>
                )}
              </label>
              <input
                type="password"
                value={llmApiKey}
                onChange={(e) => setLlmApiKey(e.target.value)}
                placeholder="sk-or-... (leave blank to keep current)"
              />
            </div>
          )}

          <div className="key-status">
            <span className={llmStatus.has_openai_key ? 'key-ok' : 'key-missing'}>
              OpenAI {llmStatus.has_openai_key ? 'configured' : 'not set'}
            </span>
            <span className={llmStatus.has_deepseek_key ? 'key-ok' : 'key-missing'}>
              DeepSeek {llmStatus.has_deepseek_key ? 'configured' : 'not set'}
            </span>
            <span className={llmStatus.has_openrouter_key ? 'key-ok' : 'key-missing'}>
              OpenRouter {llmStatus.has_openrouter_key ? 'configured' : 'not set'}
            </span>
          </div>

          {llmError && <div className="error-message">{llmError}</div>}
          {llmMessage && <div className="success-message">{llmMessage}</div>}

          <button type="submit" disabled={llmLoading} className="save-button">
            {llmLoading ? 'Saving...' : 'Save LLM Settings'}
          </button>
        </form>
      </div>

      <div className="settings-section">
        <h2>Change Password</h2>
        <form onSubmit={handlePasswordChange} className="password-form">
          <div className="form-group">
            <label>Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>

          <div className="form-group">
            <label>Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>

          {error && <div className="error-message">{error}</div>}
          {message && <div className="success-message">{message}</div>}

          <button type="submit" disabled={loading} className="save-button">
            {loading ? 'Changing...' : 'Change Password'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default Settings
