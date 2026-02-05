# Brain Bot Web Interface - Complete Setup Guide

## 🎯 What You're Setting Up

A secure web interface to interact with your Brain Bot through your browser.

**Stack:**
- Backend: FastAPI (Python) - `/backend`
- Frontend: React + @chatscope/chat-ui-kit-react - `/frontend`
- Security: JWT auth, fail2ban, firewall, SSH hardening
- Web Server: Nginx with SSL

---

## 📋 Prerequisites

- VPS running (Ubuntu/Debian recommended)
- Root or sudo access
- Domain name (optional but recommended for SSL)

---

## 🔒 Step 1: Security Hardening

### Run the Security Setup Script

```bash
cd /root/brain-web-interface
chmod +x security-setup.sh
sudo ./security-setup.sh
```

This script will:
- ✅ Install and configure fail2ban
- ✅ Harden SSH configuration
- ✅ Set up UFW firewall
- ✅ Configure automatic security updates
- ✅ Set up basic intrusion detection

---

## 🚀 Step 2: Install Dependencies

### Backend

```bash
cd /root/brain-web-interface/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Frontend

```bash
cd /root/brain-web-interface/frontend
npm install
```

---

## ⚙️ Step 3: Configuration

### Backend Environment Variables

Create `/root/brain-web-interface/backend/.env`:

```bash
JWT_SECRET_KEY=your-super-secret-key-change-this
REDIS_URL=redis://localhost:6379
```

**⚠️ IMPORTANT: Change the JWT_SECRET_KEY!**

```bash
# Generate a secure secret key
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

### Frontend Environment Variables

Create `/root/brain-web-interface/frontend/.env`:

```bash
VITE_API_URL=http://your-domain.com/api
# or for local testing:
VITE_API_URL=http://localhost:8000
```

### Change Default Password

Edit `backend/main.py` line 47-52:

```python
USERS_DB = {
    "admin": {
        "username": "admin",
        "hashed_password": pwd_context.hash("YOUR_NEW_PASSWORD_HERE"),
        "user_id": "web_user_1"
    }
}
```

Or use the password change script:

```bash
python3 scripts/change_password.py
```

---

## 🌐 Step 4: Web Server Setup (Nginx)

### Install Nginx

```bash
sudo apt update
sudo apt install nginx certbot python3-certbot-nginx -y
```

### Configure Nginx

Copy the provided nginx config:

```bash
sudo cp nginx/brain-bot.conf /etc/nginx/sites-available/brain-bot
sudo ln -s /etc/nginx/sites-available/brain-bot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Get SSL Certificate (Recommended)

```bash
sudo certbot --nginx -d your-domain.com
```

---

## 🏃 Step 5: Run the Application

### Option A: Development Mode

**Backend:**
```bash
cd /root/brain-web-interface/backend
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**Frontend:**
```bash
cd /root/brain-web-interface/frontend
npm run dev
```

### Option B: Production with PM2

**Backend:**
```bash
cd /root/brain-web-interface/backend
pm2 start ecosystem.config.js
```

**Frontend (build and serve):**
```bash
cd /root/brain-web-interface/frontend
npm run build
# Nginx will serve the static files from dist/
```

### Option C: Docker Compose (Easiest)

```bash
cd /root/brain-web-interface
docker-compose up -d
```

---

## 🔐 Security Checklist

After setup, verify:

- [ ] Changed default admin password
- [ ] Generated new JWT secret key
- [ ] fail2ban is running: `sudo fail2ban-client status`
- [ ] Firewall is active: `sudo ufw status`
- [ ] SSH key-only auth (password disabled)
- [ ] SSL certificate installed
- [ ] Nginx HTTPS redirect working
- [ ] Different user for running services (not root)

---

## 🧪 Testing

### Backend API

```bash
# Health check
curl http://localhost:8000/health

# Login test
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"changeme123"}'
```

### Frontend

Open browser: `http://your-domain.com` or `http://localhost:5173`

---

## 📱 Usage

1. Navigate to your domain in browser
2. Login with your credentials
3. Start chatting with your Brain Bot!
4. Messages are processed through the same system as Telegram

---

## 🛠️ Maintenance

### Update the Application

```bash
cd /root/brain-web-interface
git pull
cd backend && pip install -r requirements.txt
cd ../frontend && npm install && npm run build
pm2 restart all
```

### View Logs

```bash
# Backend logs
pm2 logs brain-bot-api

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# fail2ban logs
sudo tail -f /var/log/fail2ban.log
```

### Monitor fail2ban

```bash
# Check status
sudo fail2ban-client status

# Check specific jail
sudo fail2ban-client status sshd
sudo fail2ban-client status nginx-http-auth

# Unban an IP
sudo fail2ban-client set sshd unbanip 1.2.3.4
```

---

## 🔧 Troubleshooting

### Backend won't start

```bash
# Check if port is in use
sudo lsof -i :8000

# Check logs
cd /root/brain-web-interface/backend
tail -f logs/app.log
```

### Frontend build fails

```bash
cd /root/brain-web-interface/frontend
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Can't connect to API

1. Check firewall: `sudo ufw status`
2. Ensure port 8000 is open: `sudo ufw allow 8000`
3. Check nginx config: `sudo nginx -t`
4. Check CORS settings in `backend/main.py`

### fail2ban not blocking

```bash
# Check jail status
sudo fail2ban-client status sshd

# Manually test
sudo fail2ban-client set sshd banip 1.2.3.4

# Check if IP is banned
sudo fail2ban-client status sshd | grep "Banned IP"
```

---

## 📚 Additional Resources

- [FastAPI Docs](https://fastapi.tiangolo.com/)
- [React Chat UI Kit](https://chatscope.io/storybook/react/)
- [fail2ban Documentation](https://www.fail2ban.org/)
- [Let's Encrypt](https://letsencrypt.org/)
- [Nginx Security](https://nginx.org/en/docs/)

---

## ⚠️ Important Notes

1. **Never expose Redis directly** - It's already protected behind firewall
2. **Always use HTTPS in production** - Get a free SSL cert with Let's Encrypt
3. **Rotate JWT secrets regularly** - Every 90 days recommended
4. **Monitor fail2ban logs** - Watch for attack patterns
5. **Keep backups** - Database, configs, and user data

---

## 🎉 You're Done!

Your Brain Bot now has a secure web interface!

Access it at: `https://your-domain.com`

Default login (change this!):
- Username: `admin`
- Password: `changeme123`

Enjoy your web-accessible AI assistant! 🧠✨
