#!/bin/bash

# TradeBot Portal - Server Setup Script (IP-based deployment)
# Run this script on the GCP VM after SSH connection
# Configures IST timezone, MongoDB, Node.js, Nginx for IP access

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_step() {
    echo -e "${GREEN}[STEP]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Configuration
APP_USER="tradebot"
APP_DIR="/opt/tradebot-portal"
MONGO_DATA_DIR="/data/mongodb"
BACKUP_DIR="/opt/backups"

# Get VM external IP
EXTERNAL_IP=$(curl -s "http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip" -H "Metadata-Flavor: Google")

echo "🚀 Setting up TradeBot Portal Server Environment..."
echo "Timezone will be set to IST (Asia/Kolkata)"
echo "External IP: $EXTERNAL_IP"
echo ""

# Step 1: System Update and Timezone
print_step "Updating system and setting IST timezone..."
sudo apt update && sudo apt upgrade -y

# Set timezone to IST
sudo timedatectl set-timezone Asia/Kolkata
print_info "Timezone set to: $(timedatectl show --property=Timezone --value)"

# Install essential packages
sudo apt install -y curl wget git htop vim ufw fail2ban unzip software-properties-common

# Step 2: Create application user
print_step "Creating application user..."
sudo useradd -m -s /bin/bash $APP_USER
sudo usermod -aG sudo $APP_USER

# Step 3: Install Node.js 18.x
print_step "Installing Node.js 18.x..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node_version=$(node --version)
npm_version=$(npm --version)
print_info "Node.js version: $node_version"
print_info "NPM version: $npm_version"

# Install PM2 globally
sudo npm install -g pm2

# Step 4: Install MongoDB
print_step "Installing MongoDB Community Edition..."
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org

# Create MongoDB data directory
sudo mkdir -p $MONGO_DATA_DIR
sudo chown mongodb:mongodb $MONGO_DATA_DIR

# Configure MongoDB for IST timezone and security
print_step "Configuring MongoDB..."
sudo tee /etc/mongod.conf > /dev/null <<EOF
# mongod.conf - TradeBot Portal Configuration

# Where to store data
storage:
  dbPath: $MONGO_DATA_DIR
  journal:
    enabled: true

# Where to write logging data
systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod.log
  timeStampFormat: iso8601-local

# Network interfaces
net:
  port: 27017
  bindIp: 127.0.0.1

# Process management
processManagement:
  timeZoneInfo: /usr/share/zoneinfo

# Security settings
security:
  authorization: enabled

# Operation profiling
operationProfiling:
  slowOpThresholdMs: 100
  mode: slowOp

# Set timezone to IST
setParameter:
  timeZoneDatabase: /usr/share/zoneinfo
EOF

# Start and enable MongoDB
sudo systemctl start mongod
sudo systemctl enable mongod

# Wait for MongoDB to start
sleep 5

# Create MongoDB admin user
print_step "Setting up MongoDB authentication..."
mongo --eval "
db = db.getSiblingDB('admin');
db.createUser({
  user: 'admin',
  pwd: 'SecureAdminPassword123!',
  roles: [ { role: 'userAdminAnyDatabase', db: 'admin' }, 'readWriteAnyDatabase' ]
});
"

# Create application database and user
mongo --eval "
db = db.getSiblingDB('tradebot');
db.createUser({
  user: 'tradebot_user',
  pwd: 'SecureAppPassword123!',
  roles: [ { role: 'readWrite', db: 'tradebot' } ]
});
"

print_info "MongoDB configured with authentication enabled"
print_warning "Save these credentials securely:"
print_warning "  Admin: admin / SecureAdminPassword123!"
print_warning "  App User: tradebot_user / SecureAppPassword123!"

# Step 5: Install and configure Nginx for IP access
print_step "Installing and configuring Nginx for IP access..."
sudo apt install -y nginx

# Remove default site
sudo rm -f /etc/nginx/sites-enabled/default

# Create Nginx configuration for IP-based access
sudo tee /etc/nginx/sites-available/tradebot-portal > /dev/null <<EOF
# TradeBot Portal Nginx Configuration - IP Access
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name $EXTERNAL_IP _;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:" always;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;

    # Rate limiting zones
    limit_req_zone \$binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone \$binary_remote_addr zone=login:10m rate=1r/s;

    # Main application proxy
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
    }

    # API rate limiting
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Login endpoint rate limiting
    location /api/auth/ {
        limit_req zone=login burst=5 nodelay;
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Static files caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files \$uri \$uri/ @proxy;
    }

    location @proxy {
        proxy_pass http://localhost:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}

# Direct port 3000 access for development
server {
    listen 3000;
    server_name $EXTERNAL_IP _;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

# Enable the site
sudo ln -sf /etc/nginx/sites-available/tradebot-portal /etc/nginx/sites-enabled/

# Test Nginx configuration
sudo nginx -t

# Step 6: Configure UFW Firewall for IP access
print_step "Configuring UFW firewall for IP access..."
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 3000/tcp  # Allow direct access to Node.js
sudo ufw --force enable

# Step 7: Configure Fail2Ban
print_step "Configuring Fail2Ban..."
sudo tee /etc/fail2ban/jail.local > /dev/null <<EOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 3

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3

[nginx-http-auth]
enabled = true
filter = nginx-http-auth
logpath = /var/log/nginx/error.log

[nginx-req-limit]
enabled = true
filter = nginx-req-limit
logpath = /var/log/nginx/error.log
maxretry = 10
EOF

sudo systemctl restart fail2ban

# Step 8: Create application directory
print_step "Setting up application directory..."
sudo mkdir -p $APP_DIR
sudo chown $APP_USER:$APP_USER $APP_DIR

# Create backup directory
sudo mkdir -p $BACKUP_DIR
sudo chown $APP_USER:$APP_USER $BACKUP_DIR

# Step 9: Create backup script
print_step "Creating backup script..."
sudo tee /usr/local/bin/backup-tradebot.sh > /dev/null <<'EOF'
#!/bin/bash

# TradeBot Portal Backup Script
# Runs daily at 1:30 AM IST

BACKUP_DIR="/opt/backups"
TIMESTAMP=$(TZ='Asia/Kolkata' date +"%Y%m%d_%H%M%S")
MONGO_BACKUP_DIR="$BACKUP_DIR/mongodb_$TIMESTAMP"
APP_BACKUP_DIR="$BACKUP_DIR/app_$TIMESTAMP"

# MongoDB backup
echo "Creating MongoDB backup..."
mongodump --host localhost --port 27017 --db tradebot --out $MONGO_BACKUP_DIR
tar -czf "$BACKUP_DIR/mongodb_$TIMESTAMP.tar.gz" -C $BACKUP_DIR "mongodb_$TIMESTAMP"
rm -rf $MONGO_BACKUP_DIR

# Application backup
echo "Creating application backup..."
tar -czf "$APP_BACKUP_DIR.tar.gz" -C /opt tradebot-portal

# Upload to Cloud Storage
echo "Uploading backups to Cloud Storage..."
gsutil cp "$BACKUP_DIR/mongodb_$TIMESTAMP.tar.gz" gs://tradebot-473404-tradebot-backups/mongodb/
gsutil cp "$APP_BACKUP_DIR.tar.gz" gs://tradebot-473404-tradebot-backups/app/

# Clean up local backups older than 7 days
find $BACKUP_DIR -type f -name "*.tar.gz" -mtime +7 -delete

echo "Backup completed successfully: $TIMESTAMP"
EOF

sudo chmod +x /usr/local/bin/backup-tradebot.sh

# Step 10: Setup cron job for backups
print_step "Setting up cron job for daily backups..."
(sudo crontab -l 2>/dev/null; echo "30 1 * * * /usr/local/bin/backup-tradebot.sh >> /var/log/tradebot-backup.log 2>&1") | sudo crontab -

# Step 11: Start services
print_step "Starting services..."
sudo systemctl start nginx
sudo systemctl enable nginx
sudo systemctl restart mongod

# Step 12: Install Google Cloud SDK
print_step "Installing Google Cloud SDK..."
curl https://sdk.cloud.google.com | bash
exec -l $SHELL

# Final setup
print_step "Server setup completed!"

echo ""
echo "=============================================="
echo "🎉 TradeBot Portal Server Setup Complete!"
echo "=============================================="
echo ""
echo "System Configuration:"
echo "  ✅ Timezone: $(timedatectl show --property=Timezone --value)"
echo "  ✅ Node.js: $(node --version)"
echo "  ✅ MongoDB: Running with authentication"
echo "  ✅ Nginx: Configured for IP access"
echo "  ✅ Firewall: UFW enabled (ports 22, 80, 3000)"
echo "  ✅ Fail2Ban: Active"
echo "  ✅ Backups: Daily at 1:30 AM IST"
echo ""
echo "Access Information:"
echo "  External IP: $EXTERNAL_IP"
echo "  HTTP Access: http://$EXTERNAL_IP"
echo "  Direct Access: http://$EXTERNAL_IP:3000"
echo ""
echo "MongoDB Credentials:"
echo "  Admin: admin / SecureAdminPassword123!"
echo "  App: tradebot_user / SecureAppPassword123!"
echo ""
echo "Next Steps:"
echo "  1. Deploy your application to $APP_DIR"
echo "  2. Configure environment variables"
echo "  3. Start application with PM2"
echo "  4. Access at: http://$EXTERNAL_IP:3000"
echo ""
echo "Application Directory: $APP_DIR"
echo "Backup Directory: $BACKUP_DIR"
echo "=============================================="