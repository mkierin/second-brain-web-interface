import { useState, useEffect, useRef, useCallback } from 'react'
import api, { API_URL } from '../api'
import ReactMarkdown from 'react-markdown'
import '../styles/Chat.css'

const AGENTS = [
  { value: 'auto', label: 'Auto' },
  { value: 'researcher', label: 'Researcher' },
  { value: 'archivist', label: 'Archivist' },
  { value: 'coder', label: 'Coder' },
  { value: 'writer', label: 'Writer' },
  { value: 'journal', label: 'Journal' },
  { value: 'task_manager', label: 'Task Manager' },
]

const TYPING_MESSAGES = {
  researcher: 'Researching...',
  archivist: 'Searching your brain...',
  coder: 'Writing code...',
  writer: 'Drafting...',
  journal: 'Journaling...',
  task_manager: 'Managing tasks...',
  casual: 'Thinking...',
  auto: 'Working on it...',
}

function MessageBubble({ message, isUser, timestamp, agent, showTimestamp }) {
  const [showCopy, setShowCopy] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(message)
  }

  const getRelativeTime = (ts) => {
    const now = Date.now()
    const diff = now - new Date(ts).getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    return `${days}d ago`
  }

  return (
    <div className={`message-group ${isUser ? 'message-group-user' : 'message-group-bot'}`}>
      {showTimestamp && timestamp && (
        <div className="message-timestamp">{getRelativeTime(timestamp)}</div>
      )}
      <div
        className={`message-bubble ${isUser ? 'message-user' : 'message-bot'}`}
        onMouseEnter={() => !isUser && setShowCopy(true)}
        onMouseLeave={() => setShowCopy(false)}
      >
        {!isUser && agent && (
          <div className="agent-badge">via {agent}</div>
        )}
        <div className="message-content">
          {isUser ? (
            <span>{message}</span>
          ) : (
            <ReactMarkdown>{message}</ReactMarkdown>
          )}
        </div>
        {!isUser && showCopy && (
          <button className="copy-btn" onClick={handleCopy} title="Copy message">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

function TypingIndicator({ agent }) {
  const message = TYPING_MESSAGES[agent] || TYPING_MESSAGES.auto

  return (
    <div className="typing-indicator">
      <span>{message}</span>
      <div className="typing-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
  )
}

function Chat({ token, username }) {
  const [messages, setMessages] = useState([])
  const [isTyping, setIsTyping] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [selectedAgent, setSelectedAgent] = useState('auto')
  const messagesEndRef = useRef(null)
  const eventSourceRef = useRef(null)
  const pollingInterval = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => { loadHistory() }, [])

  // SSE connection with polling fallback
  useEffect(() => {
    connectSSE()
    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close()
      if (pollingInterval.current) clearInterval(pollingInterval.current)
    }
  }, [])

  const connectSSE = useCallback(() => {
    if (eventSourceRef.current) eventSourceRef.current.close()
    if (pollingInterval.current) clearInterval(pollingInterval.current)

    try {
      const sseToken = localStorage.getItem('token')
      const es = new EventSource(`${API_URL}/messages/stream?token=${sseToken}`)
      eventSourceRef.current = es

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          setIsTyping(false)
          setMessages(prev => [...prev, {
            message: data.message,
            sender: 'bot',
            timestamp: data.timestamp,
            agent: data.agent
          }])
        } catch (e) {
          // heartbeat or invalid JSON - ignore
        }
      }

      es.onerror = () => {
        es.close()
        eventSourceRef.current = null
        // Fall back to polling
        startPolling()
      }
    } catch {
      startPolling()
    }
  }, [])

  const startPolling = () => {
    if (pollingInterval.current) return
    pollingInterval.current = setInterval(checkForResponses, 2000)
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, isTyping])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const loadHistory = async () => {
    try {
      const response = await api.get('/messages/history')
      setMessages(response.data.map(msg => ({
        message: msg.message,
        sender: msg.sender,
        timestamp: msg.timestamp,
        agent: msg.agent
      })))
    } catch (err) {
      console.error('Failed to load history:', err)
    }
  }

  const checkForResponses = async () => {
    try {
      const response = await api.get('/messages/pending')
      if (response.data.responses && response.data.responses.length > 0) {
        setIsTyping(false)
        response.data.responses.forEach(res => {
          setMessages(prev => [...prev, {
            message: res.message,
            sender: 'bot',
            timestamp: res.timestamp,
            agent: res.agent
          }])
        })
      }
    } catch (err) {
      console.error('Failed to check responses:', err)
    }
  }

  const handleSend = async () => {
    if (!inputValue.trim()) return

    const userMessage = {
      message: inputValue,
      sender: 'user',
      timestamp: new Date().toISOString()
    }
    setMessages(prev => [...prev, userMessage])
    setInputValue('')
    setIsTyping(true)

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    try {
      const body = { message: inputValue }
      if (selectedAgent !== 'auto') body.agent = selectedAgent
      await api.post('/messages/send', body)
    } catch (err) {
      console.error('Failed to send message:', err)
      setIsTyping(false)
      setMessages(prev => [...prev, {
        message: 'Failed to send message. Please try again.',
        sender: 'system',
        timestamp: new Date().toISOString()
      }])
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInputChange = (e) => {
    setInputValue(e.target.value)

    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`
    }
  }

  const shouldShowTimestamp = (index) => {
    if (index === 0) return true

    const currentMsg = messages[index]
    const prevMsg = messages[index - 1]

    if (!currentMsg.timestamp || !prevMsg.timestamp) return false

    const timeDiff = new Date(currentMsg.timestamp) - new Date(prevMsg.timestamp)
    return timeDiff > 5 * 60 * 1000 // 5 minutes
  }

  return (
    <div className="chat-wrapper">
      <div className="chat-top-bar">
        <h1>Chat</h1>
        <div className="agent-selector">
          <label>Agent:</label>
          <select value={selectedAgent} onChange={e => setSelectedAgent(e.target.value)}>
            {AGENTS.map(a => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="chat-messages">
        {messages.map((msg, i) => (
          <MessageBubble
            key={i}
            message={msg.message}
            isUser={msg.sender === 'user'}
            timestamp={msg.timestamp}
            agent={msg.agent}
            showTimestamp={shouldShowTimestamp(i)}
          />
        ))}
        {isTyping && <TypingIndicator agent={selectedAgent} />}
        <div ref={messagesEndRef} />
      </div>

      <div className="message-input-area">
        <textarea
          ref={textareaRef}
          className="message-input"
          placeholder="Type your message... (Shift+Enter for newline)"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        <button
          className="send-btn"
          onClick={handleSend}
          disabled={!inputValue.trim()}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>
    </div>
  )
}

export default Chat
