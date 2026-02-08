import { useState } from 'react'
import './App.css'
import Login from './components/Login'
import ForcePasswordChange from './components/ForcePasswordChange'
import Dashboard from './components/Dashboard'
import Tasks from './components/Tasks'
import Journal from './components/Journal'
import GraphView from './components/GraphView'
import KnowledgeBase from './components/KnowledgeBase'
import Chat from './components/Chat'
import Monitor from './components/Monitor'
import Settings from './components/Settings'

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'))
  const [username, setUsername] = useState(localStorage.getItem('username'))
  const [loginPassword, setLoginPassword] = useState(null)
  const [needsPasswordChange, setNeedsPasswordChange] = useState(false)
  const [currentView, setCurrentView] = useState('dashboard')

  const handleLogin = (newToken, newUsername, password) => {
    localStorage.setItem('token', newToken)
    localStorage.setItem('username', newUsername)
    setToken(newToken)
    setUsername(newUsername)
    setLoginPassword(password)

    if (password === 'Y8gQScZIAZ0EHCM3') {
      setNeedsPasswordChange(true)
    }
  }

  const handlePasswordChanged = () => {
    setNeedsPasswordChange(false)
    setLoginPassword(null)
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('username')
    setToken(null)
    setUsername(null)
    setLoginPassword(null)
    setNeedsPasswordChange(false)
    setCurrentView('dashboard')
  }

  if (!token) {
    return (
      <div className="app">
        <Login onLogin={handleLogin} />
      </div>
    )
  }

  if (needsPasswordChange) {
    return (
      <div className="app">
        <ForcePasswordChange
          token={token}
          currentPassword={loginPassword}
          onPasswordChanged={handlePasswordChanged}
        />
      </div>
    )
  }

  return (
    <div className="app">
      <div className="app-layout">
        <aside className="sidebar">
          <div className="sidebar-header">
            <h2>Brain Bot</h2>
            <p className="sidebar-user">{username}</p>
          </div>

          <nav className="sidebar-nav">
            <button
              className={`nav-item ${currentView === 'dashboard' ? 'active' : ''}`}
              onClick={() => setCurrentView('dashboard')}
            >
              Dashboard
            </button>
            <button
              className={`nav-item ${currentView === 'tasks' ? 'active' : ''}`}
              onClick={() => setCurrentView('tasks')}
            >
              Tasks
            </button>
            <button
              className={`nav-item ${currentView === 'journal' ? 'active' : ''}`}
              onClick={() => setCurrentView('journal')}
            >
              Journal
            </button>
            <button
              className={`nav-item ${currentView === 'graph' ? 'active' : ''}`}
              onClick={() => setCurrentView('graph')}
            >
              Graph
            </button>
            <button
              className={`nav-item ${currentView === 'knowledge' ? 'active' : ''}`}
              onClick={() => setCurrentView('knowledge')}
            >
              Knowledge Base
            </button>
            <button
              className={`nav-item ${currentView === 'chat' ? 'active' : ''}`}
              onClick={() => setCurrentView('chat')}
            >
              Chat
            </button>
            <button
              className={`nav-item ${currentView === 'monitor' ? 'active' : ''}`}
              onClick={() => setCurrentView('monitor')}
            >
              Monitor
            </button>
            <button
              className={`nav-item ${currentView === 'settings' ? 'active' : ''}`}
              onClick={() => setCurrentView('settings')}
            >
              Settings
            </button>
          </nav>

          <button className="logout-button" onClick={handleLogout}>
            Logout
          </button>
        </aside>

        <main className="main-content">
          {currentView === 'dashboard' && <Dashboard token={token} />}
          {currentView === 'tasks' && <Tasks token={token} />}
          {currentView === 'journal' && <Journal token={token} />}
          {currentView === 'graph' && <GraphView token={token} />}
          {currentView === 'knowledge' && <KnowledgeBase token={token} />}
          {currentView === 'chat' && <Chat token={token} username={username} />}
          {currentView === 'monitor' && <Monitor token={token} />}
          {currentView === 'settings' && <Settings token={token} />}
        </main>
      </div>
    </div>
  )
}

export default App
