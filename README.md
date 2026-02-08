# 🧠 Brain Bot Web Interface

A secure, React-based web interface to interact with your Brain Bot through your browser.

## 🎯 Features

- 💬 Clean chat interface using @chatscope/chat-ui-kit-react
- 🔐 JWT authentication with password protection
- 🛡️ Comprehensive security (fail2ban, SSH hardening, firewall)
- 📱 Responsive design - works on desktop and mobile
- 🚀 Fast and lightweight
- 🔄 Real-time message polling
- 💾 Conversation history

## 📁 Project Structure

```
brain-web-interface/
├── backend/              # FastAPI backend
│   ├── main.py          # API server with auth
│   └── requirements.txt
│
├── frontend/            # React frontend
│   ├── src/
│   │   ├── components/  # Login, Chat components
│   │   ├── styles/      # CSS files
│   │   └── App.jsx
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
│
├── nginx/               # Web server config
│   └── brain-bot.conf
│
├── security-setup.sh    # VPS hardening script
├── SETUP.md            # Detailed setup guide
└── README.md           # This file
```

## 🚀 Quick Start

### 1. Security First

```bash
cd /root/brain-web-interface
sudo ./security-setup.sh
```

### 2. Install Dependencies

**Backend:**
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

**Frontend:**
```bash
cd frontend
npm install
```

### 3. Configure

Create `backend/.env`:
```env
JWT_SECRET_KEY=your-secret-key-here
REDIS_URL=redis://localhost:6379
```

Create `frontend/.env`:
```env
VITE_API_URL=http://your-domain.com/api
```

### 4. Run

**Development:**
```bash
# Backend
cd backend && source venv/bin/activate
uvicorn main:app --reload

# Frontend
cd frontend
npm run dev
```

**Production:**
See SETUP.md for full production deployment guide.

## 🔐 Security Features

### Built-in Security

- ✅ JWT token authentication
- ✅ Password hashing with bcrypt
- ✅ CORS protection
- ✅ Rate limiting on API endpoints
- ✅ Secure HTTP headers

### VPS Hardening (via security-setup.sh)

- ✅ fail2ban - Auto-ban failed login attempts
- ✅ UFW firewall - Only necessary ports open
- ✅ SSH hardening - Key-only auth, rate limiting
- ✅ Automatic security updates
- ✅ Kernel parameter tuning
- ✅ Protection against common attacks

## 🎨 UI Components

Built with **@chatscope/chat-ui-kit-react**:
- Clean, modern chat interface
- Message bubbles with avatars
- Typing indicators
- Responsive layout
- Customizable styling

## 📡 API Endpoints

### Authentication
- `POST /auth/login` - Login and get JWT token

### Messages
- `POST /messages/send` - Send message to bot
- `GET /messages/history` - Get conversation history
- `GET /messages/pending` - Poll for bot responses

### Health
- `GET /health` - Health check
- `GET /` - API info

## 🔧 Configuration

### Change Default Password

Edit `backend/main.py`:
```python
USERS_DB = {
    "admin": {
        "username": "admin",
        "hashed_password": pwd_context.hash("YOUR_NEW_PASSWORD"),
        "user_id": "web_user_1"
    }
}
```

### Add More Users

Add entries to `USERS_DB` dict with hashed passwords.

### Configure CORS

Edit `backend/main.py` line 32:
```python
allow_origins=["http://your-domain.com"],
```

## 📊 Monitoring

### Check Services

```bash
# Backend API
curl http://localhost:8000/health

# fail2ban status
sudo fail2ban-client status

# Firewall status
sudo ufw status verbose

# Nginx status
sudo systemctl status nginx
```

### View Logs

```bash
# API logs
tail -f backend/logs/*.log

# Nginx logs
sudo tail -f /var/log/nginx/brain-bot-*.log

# fail2ban logs
sudo tail -f /var/log/fail2ban.log
```

## 🐛 Troubleshooting

### Can't Login

1. Check if backend is running: `curl http://localhost:8000/health`
2. Verify credentials in `USERS_DB`
3. Check browser console for CORS errors

### Messages Not Sending

1. Verify Redis is running: `redis-cli ping`
2. Check worker processes: `pm2 list`
3. Review backend logs

### fail2ban Not Working

```bash
# Check status
sudo fail2ban-client status sshd

# Test manually
sudo fail2ban-client set sshd banip 1.2.3.4
```

## 📚 Documentation

- [Complete Setup Guide](SETUP.md) - Detailed installation and configuration
- [FastAPI Docs](https://fastapi.tiangolo.com/)
- [Chat UI Kit](https://chatscope.io/)
- [fail2ban Manual](https://www.fail2ban.org/)

## ⚠️ Important Notes

1. **Change default password immediately**
2. **Use HTTPS in production** (Let's Encrypt)
3. **Keep JWT_SECRET_KEY secret**
4. **Monitor fail2ban logs regularly**
5. **Test SSH access before closing terminal**

## 🎉 Default Credentials

**Username:** admin
**Password:** changeme123

**⚠️ CHANGE THESE IMMEDIATELY!**

## 📝 License

Same as Brain Bot project.

## 🤝 Contributing

Issues and PRs welcome!

---

**Enjoy your secure web interface! 🚀**
