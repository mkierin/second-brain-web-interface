#!/bin/bash

# Brain Bot VPS Security Hardening Script
# This script hardens your VPS security with fail2ban, SSH hardening, firewall, and more

set -e

echo "🔒 Starting VPS Security Hardening..."
echo "====================================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
   echo "Please run as root (sudo ./security-setup.sh)"
   exit 1
fi

# Update system
echo ""
echo "📦 Updating system packages..."
apt update && apt upgrade -y

# Install essential security packages
echo ""
echo "📦 Installing security packages..."
apt install -y fail2ban ufw unattended-upgrades apt-listchanges

# ============================================
# SSH Hardening
# ============================================
echo ""
echo "🔐 Hardening SSH configuration..."

# Backup original SSH config
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.backup

# Configure SSH
cat > /etc/ssh/sshd_config.d/hardening.conf << 'EOF'
# Disable root login
PermitRootLogin prohibit-password

# Disable password authentication (use SSH keys only)
PasswordAuthentication no
ChallengeResponseAuthentication no

# Enable public key authentication
PubkeyAuthentication yes

# Disable empty passwords
PermitEmptyPasswords no

# Limit max auth tries
MaxAuthTries 3

# Disconnect idle sessions
ClientAliveInterval 300
ClientAliveCountMax 2

# Disable X11 forwarding (unless needed)
X11Forwarding no

# Enable strict mode
StrictModes yes

# Disable host-based authentication
HostbasedAuthentication no

# Log verbosely
LogLevel VERBOSE
EOF

echo "✅ SSH configuration hardened"
echo "⚠️  Make sure you have SSH key authentication set up before restarting SSH!"
read -p "Do you have SSH key access? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Restarting SSH..."
    systemctl restart sshd
    echo "✅ SSH restarted with new configuration"
else
    echo "⚠️  Skipping SSH restart. Configure SSH keys first!"
    echo "   Then run: sudo systemctl restart sshd"
fi

# ============================================
# Firewall (UFW) Setup
# ============================================
echo ""
echo "🔥 Configuring UFW firewall..."

# Reset UFW to default
ufw --force reset

# Default policies
ufw default deny incoming
ufw default allow outgoing

# Allow SSH (IMPORTANT!)
ufw allow 22/tcp comment 'SSH'

# Allow HTTP and HTTPS
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'

# Allow backend API (only if needed externally)
# ufw allow 8000/tcp comment 'Backend API'

# Enable UFW
ufw --force enable

echo "✅ Firewall configured and enabled"
ufw status verbose

# ============================================
# fail2ban Configuration
# ============================================
echo ""
echo "🛡️  Configuring fail2ban..."

# Create local jail configuration
cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
# Ban duration (10 minutes)
bantime = 600

# Find time window (10 minutes)
findtime = 600

# Max retries before ban
maxretry = 3

# Destination email for notifications
destemail = root@localhost
sendername = Fail2Ban
mta = sendmail

# Action: ban and send email
action = %(action_mwl)s

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600

[sshd-ddos]
enabled = true
port = ssh
filter = sshd-ddos
logpath = /var/log/auth.log
maxretry = 2
bantime = 3600

[nginx-http-auth]
enabled = true
port = http,https
filter = nginx-http-auth
logpath = /var/log/nginx/error.log
maxretry = 3
bantime = 3600

[nginx-noscript]
enabled = true
port = http,https
filter = nginx-noscript
logpath = /var/log/nginx/access.log
maxretry = 6
bantime = 3600

[nginx-badbots]
enabled = true
port = http,https
filter = nginx-badbots
logpath = /var/log/nginx/access.log
maxretry = 2
bantime = 86400

[nginx-noproxy]
enabled = true
port = http,https
filter = nginx-noproxy
logpath = /var/log/nginx/access.log
maxretry = 2
bantime = 86400
EOF

# Create custom fail2ban filter for API rate limiting
cat > /etc/fail2ban/filter.d/nginx-api-limit.conf << 'EOF'
[Definition]
failregex = ^<HOST> -.*"(GET|POST|PUT|DELETE) /api/.*" (429|401|403)
ignoreregex =
EOF

# Restart fail2ban
systemctl enable fail2ban
systemctl restart fail2ban

echo "✅ fail2ban configured and started"
fail2ban-client status

# ============================================
# Automatic Security Updates
# ============================================
echo ""
echo "🔄 Configuring automatic security updates..."

cat > /etc/apt/apt.conf.d/50unattended-upgrades << 'EOF'
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
    "${distro_id}ESM:${distro_codename}-infra-security";
};

Unattended-Upgrade::AutoFixInterruptedDpkg "true";
Unattended-Upgrade::MinimalSteps "true";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Automatic-Reboot-Time "02:00";
EOF

cat > /etc/apt/apt.conf.d/20auto-upgrades << 'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
APT::Periodic::Unattended-Upgrade "1";
EOF

echo "✅ Automatic security updates enabled"

# ============================================
# Additional Security Measures
# ============================================
echo ""
echo "🔒 Applying additional security measures..."

# Disable IPv6 if not needed
if ! grep -q "net.ipv6.conf.all.disable_ipv6" /etc/sysctl.conf; then
    cat >> /etc/sysctl.conf << 'EOF'

# Disable IPv6
net.ipv6.conf.all.disable_ipv6 = 1
net.ipv6.conf.default.disable_ipv6 = 1
net.ipv6.conf.lo.disable_ipv6 = 1
EOF
    sysctl -p
fi

# Protect against SYN flood attacks
if ! grep -q "net.ipv4.tcp_syncookies" /etc/sysctl.conf; then
    cat >> /etc/sysctl.conf << 'EOF'

# SYN flood protection
net.ipv4.tcp_syncookies = 1
net.ipv4.tcp_max_syn_backlog = 2048
net.ipv4.tcp_synack_retries = 2
net.ipv4.tcp_syn_retries = 5
EOF
    sysctl -p
fi

# IP spoofing protection
if ! grep -q "net.ipv4.conf.all.rp_filter" /etc/sysctl.conf; then
    cat >> /etc/sysctl.conf << 'EOF'

# IP spoofing protection
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
EOF
    sysctl -p
fi

# Ignore ICMP ping requests (optional)
# Uncomment if you want to hide from ping
# echo "net.ipv4.icmp_echo_ignore_all = 1" >> /etc/sysctl.conf
# sysctl -p

echo "✅ Additional security measures applied"

# ============================================
# Summary
# ============================================
echo ""
echo "====================================="
echo "✅ Security Hardening Complete!"
echo "====================================="
echo ""
echo "Summary of changes:"
echo "  ✅ System updated"
echo "  ✅ SSH hardened (key-only auth, rate limiting)"
echo "  ✅ UFW firewall configured and enabled"
echo "  ✅ fail2ban installed and configured"
echo "  ✅ Automatic security updates enabled"
echo "  ✅ Kernel security parameters tuned"
echo ""
echo "🔍 Check status:"
echo "  sudo ufw status verbose"
echo "  sudo fail2ban-client status"
echo "  sudo systemctl status ssh"
echo ""
echo "⚠️  IMPORTANT REMINDERS:"
echo "  1. Make sure you can login with SSH keys before disconnecting!"
echo "  2. Test SSH access in a new terminal before closing this one"
echo "  3. Keep your SSH private key secure"
echo "  4. Monitor fail2ban logs: sudo tail -f /var/log/fail2ban.log"
echo "  5. Review firewall rules regularly: sudo ufw status numbered"
echo ""
echo "🎉 Your VPS is now much more secure!"
