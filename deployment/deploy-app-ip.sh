#!/bin/bash

# TradeBot Portal - Application Deployment Script (IP-based)
# Run this script to deploy the application to the configured VM
# Uses IP address instead of domain name

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_step() {
    echo -e "${GREEN}[DEPLOY]${NC} $1"
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
APP_DIR="/opt/tradebot-portal"
APP_USER="tradebot"
REPO_URL="https://github.com/mail4arasu/tradebot.git"
PROJECT_ID="tradebot-473404"

# Get VM external IP
EXTERNAL_IP=$(curl -s "http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip" -H "Metadata-Flavor: Google")

echo "🚀 Deploying TradeBot Portal Application..."
echo "Target: $APP_DIR"
echo "Timezone: IST (Asia/Kolkata)"
echo "External IP: $EXTERNAL_IP"
echo ""

# Step 1: Verify timezone
print_step "Verifying timezone configuration..."
current_tz=$(timedatectl show --property=Timezone --value)
if [ "$current_tz" != "Asia/Kolkata" ]; then
    print_warning "Timezone is not set to Asia/Kolkata. Setting it now..."
    sudo timedatectl set-timezone Asia/Kolkata
    print_info "Timezone set to: $(timedatectl show --property=Timezone --value)"
fi

# Step 2: Create application directory if it doesn't exist
print_step "Setting up application directory..."
if [ ! -d "$APP_DIR" ]; then
    sudo mkdir -p $APP_DIR
    sudo chown $APP_USER:$APP_USER $APP_DIR
fi

# Step 3: Create log directories
print_step "Creating log directories..."
sudo mkdir -p /var/log/tradebot-portal
sudo chown $APP_USER:$APP_USER /var/log/tradebot-portal

# Step 4: Switch to application user and directory
print_step "Switching to application user and directory..."
cd $APP_DIR

# Step 5: Clone or update repository
if [ -d ".git" ]; then
    print_step "Updating existing repository..."
    sudo -u $APP_USER git fetch origin
    sudo -u $APP_USER git reset --hard origin/main
    sudo -u $APP_USER git clean -fd
else
    print_step "Cloning repository..."
    sudo rm -rf $APP_DIR/*
    sudo -u $APP_USER git clone $REPO_URL .
fi

# Step 6: Install dependencies
print_step "Installing Node.js dependencies..."
sudo -u $APP_USER npm ci --production

# Step 7: Build application
print_step "Building application..."
sudo -u $APP_USER npm run build

# Step 8: Create environment file for IP-based access
print_step "Creating production environment file..."
sudo -u $APP_USER tee .env.production > /dev/null <<EOF
# Production Environment Configuration
# TradeBot Portal - IST Timezone - IP Access

NODE_ENV=production
PORT=3000
TZ=Asia/Kolkata

# MongoDB Configuration
MONGODB_URI=mongodb://tradebot_user:SecureAppPassword123!@localhost:27017/tradebot
MONGODB_DB=tradebot

# NextAuth Configuration - IP Based
NEXTAUTH_URL=http://$EXTERNAL_IP:3000
NEXTAUTH_SECRET=TradeBot-Portal-Secret-Key-2024-IST-Timezone

# OAuth Providers (Configure with your actual credentials later)
# For IP-based deployment, you'll need to update OAuth redirect URLs
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# Email Configuration (Optional - for email verification)
EMAIL_SERVER_HOST=smtp.gmail.com
EMAIL_SERVER_PORT=587
EMAIL_SERVER_USER=your-email@gmail.com
EMAIL_SERVER_PASSWORD=your-gmail-app-password
EMAIL_FROM=noreply@$EXTERNAL_IP

# SMS Provider (Twilio - Optional)
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=your-twilio-phone-number

# Security - Encryption key for API credentials (32 characters)
ENCRYPTION_KEY=TradeBot2024IST-SecureKey-32chars

# Zerodha Configuration
ZERODHA_APP_NAME=TradeBot Portal

# Backup Configuration
BACKUP_BUCKET_NAME=${PROJECT_ID}-tradebot-backups
EOF

print_info "Environment configured for IP-based access: http://$EXTERNAL_IP:3000"

# Step 9: Set up PM2 ecosystem for IP access
print_step "Configuring PM2 ecosystem..."
sudo -u $APP_USER tee ecosystem.config.js > /dev/null <<EOF
// PM2 Ecosystem Configuration for TradeBot Portal - IP Access
// Optimized for production environment with IST timezone

module.exports = {
  apps: [{
    name: 'tradebot-portal',
    script: 'npm',
    args: 'start',
    cwd: '$APP_DIR',
    instances: 2, // Use 2 instances for e2-medium (1 core)
    exec_mode: 'cluster',
    watch: false,
    max_memory_restart: '500M',
    
    // Environment variables
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      TZ: 'Asia/Kolkata', // IST timezone
      
      // MongoDB Configuration
      MONGODB_URI: 'mongodb://tradebot_user:SecureAppPassword123!@localhost:27017/tradebot',
      MONGODB_DB: 'tradebot',
      
      // NextAuth Configuration - IP Based
      NEXTAUTH_URL: 'http://$EXTERNAL_IP:3000',
      NEXTAUTH_SECRET: 'TradeBot-Portal-Secret-Key-2024-IST-Timezone',
      
      // Security
      ENCRYPTION_KEY: 'TradeBot2024IST-SecureKey-32chars',
      
      // Zerodha Configuration
      ZERODHA_APP_NAME: 'TradeBot Portal'
    },
    
    // Logging configuration
    log_file: '/var/log/tradebot-portal/combined.log',
    out_file: '/var/log/tradebot-portal/out.log',
    error_file: '/var/log/tradebot-portal/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    
    // Auto-restart configuration
    min_uptime: '10s',
    max_restarts: 5,
    
    // Monitoring
    pmx: true,
    
    // Advanced PM2 features
    kill_timeout: 5000,
    listen_timeout: 10000,
    
    // Health check
    health_check_grace_period: 10000,
    
    // Process management
    autorestart: true,
    restart_delay: 5000,
    
    // Memory and CPU settings
    node_args: '--max-old-space-size=256'
  }]
}
EOF

# Step 10: Set proper permissions
print_step "Setting file permissions..."
sudo chown -R $APP_USER:$APP_USER $APP_DIR
sudo chmod -R 755 $APP_DIR
sudo chmod 600 $APP_DIR/.env.production

# Step 11: Configure PM2 startup
print_step "Configuring PM2 startup..."
sudo -u $APP_USER pm2 startup
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $APP_USER --hp /home/$APP_USER

# Step 12: Start application with PM2
print_step "Starting application with PM2..."
sudo -u $APP_USER pm2 delete tradebot-portal 2>/dev/null || true  # Delete if exists
sudo -u $APP_USER pm2 start ecosystem.config.js --env production

# Step 13: Save PM2 configuration
sudo -u $APP_USER pm2 save

# Step 14: Restart Nginx
print_step "Restarting Nginx..."
sudo systemctl reload nginx

# Step 15: Setup monitoring script
print_step "Creating monitoring script..."
sudo tee /usr/local/bin/monitor-tradebot.sh > /dev/null <<EOF
#!/bin/bash

# TradeBot Portal Monitoring Script
# Checks application health and sends alerts

APP_URL="http://localhost:3000"
LOG_FILE="/var/log/tradebot-monitoring.log"
TIMESTAMP=\$(TZ='Asia/Kolkata' date '+%Y-%m-%d %H:%M:%S IST')

# Check if application is responding
if curl -f -s \$APP_URL > /dev/null; then
    echo "[\$TIMESTAMP] TradeBot Portal: OK" >> \$LOG_FILE
else
    echo "[\$TIMESTAMP] TradeBot Portal: FAILED - Restarting..." >> \$LOG_FILE
    pm2 restart tradebot-portal
    
    # Wait and check again
    sleep 10
    if curl -f -s \$APP_URL > /dev/null; then
        echo "[\$TIMESTAMP] TradeBot Portal: RECOVERED" >> \$LOG_FILE
    else
        echo "[\$TIMESTAMP] TradeBot Portal: CRITICAL - Manual intervention required" >> \$LOG_FILE
    fi
fi

# Check MongoDB
if systemctl is-active --quiet mongod; then
    echo "[\$TIMESTAMP] MongoDB: OK" >> \$LOG_FILE
else
    echo "[\$TIMESTAMP] MongoDB: FAILED - Restarting..." >> \$LOG_FILE
    systemctl restart mongod
fi

# Check disk space
DISK_USAGE=\$(df / | tail -1 | awk '{print \$5}' | sed 's/%//')
if [ \$DISK_USAGE -gt 80 ]; then
    echo "[\$TIMESTAMP] Disk Usage: WARNING - \${DISK_USAGE}% full" >> \$LOG_FILE
fi

# Check memory usage
MEMORY_USAGE=\$(free | grep Mem | awk '{printf "%.0f", \$3/\$2 * 100.0}')
if [ \$MEMORY_USAGE -gt 85 ]; then
    echo "[\$TIMESTAMP] Memory Usage: WARNING - \${MEMORY_USAGE}% used" >> \$LOG_FILE
fi
EOF

sudo chmod +x /usr/local/bin/monitor-tradebot.sh

# Setup monitoring cron job (every 5 minutes)
(sudo crontab -l 2>/dev/null; echo "*/5 * * * * /usr/local/bin/monitor-tradebot.sh") | sudo crontab -

# Step 16: Final status check
print_step "Performing final status check..."
sleep 5

# Check PM2 status
PM2_STATUS=$(sudo -u $APP_USER pm2 jlist | jq -r '.[0].pm2_env.status' 2>/dev/null || echo "unknown")
print_info "PM2 Status: $PM2_STATUS"

# Check if application is responding
if curl -f -s http://localhost:3000 > /dev/null; then
    print_info "Application: ✅ Responding"
else
    print_error "Application: ❌ Not responding"
fi

# Check MongoDB
if systemctl is-active --quiet mongod; then
    print_info "MongoDB: ✅ Running"
else
    print_error "MongoDB: ❌ Not running"
fi

# Check Nginx
if systemctl is-active --quiet nginx; then
    print_info "Nginx: ✅ Running"
else
    print_error "Nginx: ❌ Not running"
fi

echo ""
echo "=============================================="
echo "🎉 TradeBot Portal Deployment Complete!"
echo "=============================================="
echo ""
echo "Application Status:"
echo "  Primary URL: http://$EXTERNAL_IP:3000"
echo "  Proxy URL: http://$EXTERNAL_IP"
echo "  Local: http://localhost:3000"
echo "  PM2 Status: $PM2_STATUS"
echo "  Timezone: $(timedatectl show --property=Timezone --value)"
echo "  Logs: /var/log/tradebot-portal/"
echo ""
echo "Management Commands:"
echo "  View logs: sudo -u tradebot pm2 logs tradebot-portal"
echo "  Restart app: sudo -u tradebot pm2 restart tradebot-portal"
echo "  App status: sudo -u tradebot pm2 status"
echo "  Monitor: sudo -u tradebot pm2 monit"
echo ""
echo "Configuration Files:"
echo "  Environment: $APP_DIR/.env.production"
echo "  PM2 Config: $APP_DIR/ecosystem.config.js"
echo "  Nginx Config: /etc/nginx/sites-available/tradebot-portal"
echo ""
echo "Next Steps:"
echo "  1. Test the application: http://$EXTERNAL_IP:3000"
echo "  2. Configure OAuth providers with IP-based redirect URLs"
echo "  3. Test user registration and login"
echo "  4. When ready, configure domain and SSL"
echo ""
echo "OAuth Redirect URLs for providers:"
echo "  Google: http://$EXTERNAL_IP:3000/api/auth/callback/google"
echo "  GitHub: http://$EXTERNAL_IP:3000/api/auth/callback/github"
echo ""
echo "=============================================="