#!/bin/bash

# TradeBot Portal - Application Deployment Script
# Run this script to deploy the application to the configured VM
# Ensures IST timezone operation and proper environment setup

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
REPO_URL="https://github.com/mail4arasu/tradebot.git"  # Update with your repo
DOMAIN_NAME=""  # Will use IP address initially
PROJECT_ID="tradebot-473404"  # Update with your GCP project ID

echo "🚀 Deploying TradeBot Portal Application..."
echo "Target: $APP_DIR"
echo "Timezone: IST (Asia/Kolkata)"
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

# Step 8: Create environment file
print_step "Creating production environment file..."
sudo -u $APP_USER tee .env.production > /dev/null <<EOF
# Production Environment Configuration
# TradeBot Portal - IST Timezone

NODE_ENV=production
PORT=3000
TZ=Asia/Kolkata

# MongoDB Configuration
MONGODB_URI=mongodb://tradebot_user:SecureAppPassword123!@localhost:27017/tradebot
MONGODB_DB=tradebot

# NextAuth Configuration
NEXTAUTH_URL=https://$DOMAIN_NAME
NEXTAUTH_SECRET=your-secure-nextauth-secret-key-here-32chars-min

# OAuth Providers (Configure with your actual credentials)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# Email Configuration (Optional - for email verification)
EMAIL_SERVER_HOST=smtp.gmail.com
EMAIL_SERVER_PORT=587
EMAIL_SERVER_USER=your-email@gmail.com
EMAIL_SERVER_PASSWORD=your-gmail-app-password
EMAIL_FROM=noreply@$DOMAIN_NAME

# SMS Provider (Twilio - Optional)
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=your-twilio-phone-number

# Security - Encryption key for API credentials (MUST be 32 characters)
ENCRYPTION_KEY=your-32-character-encryption-key

# Zerodha Configuration
ZERODHA_APP_NAME=TradeBot Portal

# Backup Configuration
BACKUP_BUCKET_NAME=${PROJECT_ID}-tradebot-backups
EOF

print_warning "Please update the environment variables in .env.production with your actual credentials"

# Step 9: Set up PM2 ecosystem
print_step "Configuring PM2 ecosystem..."
sudo -u $APP_USER cp deployment/ecosystem.config.js ./

# Update ecosystem config with actual values
sudo -u $APP_USER sed -i "s/your-domain.com/$DOMAIN_NAME/g" ecosystem.config.js
sudo -u $APP_USER sed -i "s/your-project-id/$PROJECT_ID/g" ecosystem.config.js

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

# Step 14: Setup SSL certificate with Let's Encrypt
print_step "Setting up SSL certificate..."
if [ "$DOMAIN_NAME" != "your-domain.com" ]; then
    sudo certbot --nginx -d $DOMAIN_NAME --non-interactive --agree-tos --email admin@$DOMAIN_NAME
    
    # Test certificate renewal
    sudo certbot renew --dry-run
    
    # Setup auto-renewal cron job
    (sudo crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet") | sudo crontab -
else
    print_warning "Please update DOMAIN_NAME in the script and run SSL setup manually:"
    print_warning "sudo certbot --nginx -d yourdomain.com"
fi

# Step 15: Restart Nginx
print_step "Restarting Nginx..."
sudo systemctl reload nginx

# Step 16: Setup monitoring script
print_step "Creating monitoring script..."
sudo tee /usr/local/bin/monitor-tradebot.sh > /dev/null <<'EOF'
#!/bin/bash

# TradeBot Portal Monitoring Script
# Checks application health and sends alerts

APP_URL="http://localhost:3000"
LOG_FILE="/var/log/tradebot-monitoring.log"
TIMESTAMP=$(TZ='Asia/Kolkata' date '+%Y-%m-%d %H:%M:%S IST')

# Check if application is responding
if curl -f -s $APP_URL > /dev/null; then
    echo "[$TIMESTAMP] TradeBot Portal: OK" >> $LOG_FILE
else
    echo "[$TIMESTAMP] TradeBot Portal: FAILED - Restarting..." >> $LOG_FILE
    pm2 restart tradebot-portal
    
    # Wait and check again
    sleep 10
    if curl -f -s $APP_URL > /dev/null; then
        echo "[$TIMESTAMP] TradeBot Portal: RECOVERED" >> $LOG_FILE
    else
        echo "[$TIMESTAMP] TradeBot Portal: CRITICAL - Manual intervention required" >> $LOG_FILE
    fi
fi

# Check MongoDB
if systemctl is-active --quiet mongod; then
    echo "[$TIMESTAMP] MongoDB: OK" >> $LOG_FILE
else
    echo "[$TIMESTAMP] MongoDB: FAILED - Restarting..." >> $LOG_FILE
    systemctl restart mongod
fi

# Check disk space
DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
if [ $DISK_USAGE -gt 80 ]; then
    echo "[$TIMESTAMP] Disk Usage: WARNING - ${DISK_USAGE}% full" >> $LOG_FILE
fi

# Check memory usage
MEMORY_USAGE=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100.0}')
if [ $MEMORY_USAGE -gt 85 ]; then
    echo "[$TIMESTAMP] Memory Usage: WARNING - ${MEMORY_USAGE}% used" >> $LOG_FILE
fi
EOF

sudo chmod +x /usr/local/bin/monitor-tradebot.sh

# Setup monitoring cron job (every 5 minutes)
(sudo crontab -l 2>/dev/null; echo "*/5 * * * * /usr/local/bin/monitor-tradebot.sh") | sudo crontab -

# Step 17: Update backup script with correct project ID
print_step "Updating backup script..."
sudo sed -i "s/your-project-id/$PROJECT_ID/g" /usr/local/bin/backup-tradebot.sh

# Step 18: Final status check
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
echo "  URL: https://$DOMAIN_NAME"
echo "  Local: http://localhost:3000"
echo "  PM2 Status: $PM2_STATUS"
echo "  Timezone: $(timedatectl show --property=Timezone --value)"
echo "  Logs: /var/log/tradebot-portal/"
echo ""
echo "Management Commands:"
echo "  View logs: pm2 logs tradebot-portal"
echo "  Restart app: pm2 restart tradebot-portal"
echo "  App status: pm2 status"
echo "  Monitor: pm2 monit"
echo ""
echo "Configuration Files:"
echo "  Environment: $APP_DIR/.env.production"
echo "  PM2 Config: $APP_DIR/ecosystem.config.js"
echo "  Nginx Config: /etc/nginx/sites-available/tradebot-portal"
echo ""
echo "Next Steps:"
echo "  1. Update environment variables in .env.production"
echo "  2. Configure OAuth providers (Google, GitHub)"
echo "  3. Test the application functionality"
echo "  4. Setup monitoring and alerts"
echo ""
echo "=============================================="
