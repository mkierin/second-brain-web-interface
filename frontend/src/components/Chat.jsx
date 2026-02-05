import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
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

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function Chat({ token, username, onLogout }) {
  const [messages, setMessages] = useState([])
  const [isTyping, setIsTyping] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const pollingInterval = useRef(null)

  const api = axios.create({
    baseURL: API_URL,
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })

  // Load conversation history
  useEffect(() => {
    loadHistory()
  }, [])

  // Poll for new bot responses
  useEffect(() => {
    pollingInterval.current = setInterval(() => {
      checkForResponses()
    }, 2000) // Poll every 2 seconds

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

    // Add user message to UI
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
      await api.post('/messages/send', { message })
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
      <div className="chat-header">
        <div className="header-content">
          <h2>🧠 Brain Bot</h2>
          <div className="header-actions">
            <span className="username">@{username}</span>
            <button onClick={onLogout} className="logout-button">Logout</button>
          </div>
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
                    message: msg.message,
                    sender: msg.sender,
                    direction: msg.direction,
                    position: msg.position
                  }}
                >
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
