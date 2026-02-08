import { useState, useEffect, useRef } from 'react'
import api from '../api'
import ReactMarkdown from 'react-markdown'
import {
  MainContainer,
  ChatContainer,
  MessageList,
  Message,
  MessageInput,
  TypingIndicator,
  Avatar
} from '@chatscope/chat-ui-kit-react'
import '@chatscope/chat-ui-kit-styles/dist/default/styles.min.css'
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

function Chat({ token, username }) {
  const [messages, setMessages] = useState([])
  const [isTyping, setIsTyping] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [selectedAgent, setSelectedAgent] = useState('auto')
  const pollingInterval = useRef(null)

  useEffect(() => { loadHistory() }, [])

  useEffect(() => {
    pollingInterval.current = setInterval(checkForResponses, 2000)
    return () => clearInterval(pollingInterval.current)
  }, [])

  const loadHistory = async () => {
    try {
      const response = await api.get('/messages/history')
      setMessages(response.data.map(msg => ({
        message: msg.message,
        sender: msg.sender,
        direction: msg.sender === 'user' ? 'outgoing' : 'incoming',
        position: 'single'
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
            direction: 'incoming',
            position: 'single'
          }])
        })
      }
    } catch (err) {
      console.error('Failed to check responses:', err)
    }
  }

  const handleSend = async (message) => {
    if (!message.trim()) return
    const userMessage = {
      message: message,
      sender: 'user',
      direction: 'outgoing',
      position: 'single'
    }
    setMessages(prev => [...prev, userMessage])
    setInputValue('')
    setIsTyping(true)

    try {
      const body = { message }
      if (selectedAgent !== 'auto') body.agent = selectedAgent
      await api.post('/messages/send', body)
    } catch (err) {
      console.error('Failed to send message:', err)
      setIsTyping(false)
      setMessages(prev => [...prev, {
        message: 'Failed to send message. Please try again.',
        sender: 'system',
        direction: 'incoming',
        position: 'single'
      }])
    }
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
      <div className="chat-container">
        <MainContainer>
          <ChatContainer>
            <MessageList
              typingIndicator={isTyping ? <TypingIndicator content="Brain Bot is thinking..." /> : null}
            >
              {messages.map((msg, i) => (
                <Message
                  key={i}
                  model={{
                    message: '',
                    sender: msg.sender,
                    direction: msg.direction,
                    position: msg.position
                  }}
                >
                  <Message.CustomContent>
                    {msg.sender !== 'user' ? (
                      <div className="markdown-content">
                        <ReactMarkdown>{msg.message}</ReactMarkdown>
                      </div>
                    ) : (
                      <span>{msg.message}</span>
                    )}
                  </Message.CustomContent>
                  {msg.sender !== 'user' && (
                    <Avatar src="/bot-avatar.png" name="Brain Bot" />
                  )}
                </Message>
              ))}
            </MessageList>
            <MessageInput
              placeholder="Type your message..."
              value={inputValue}
              onChange={val => setInputValue(val)}
              onSend={handleSend}
              attachButton={false}
            />
          </ChatContainer>
        </MainContainer>
      </div>
    </div>
  )
}

export default Chat
