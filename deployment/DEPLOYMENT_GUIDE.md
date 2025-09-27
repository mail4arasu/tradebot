# TradeBot Portal - GCP Deployment Guide

Complete guide for deploying TradeBot Portal on Google Cloud Platform with IST timezone configuration, optimized for small-scale production (up to 100 users).

## 📋 Prerequisites

### Local Requirements
- Google Cloud SDK installed and configured
- Valid GCP project with billing enabled
- Domain name registered and DNS access
- Git repository with TradeBot Portal code

### GCP Permissions Required
- Compute Engine Admin
- Storage Admin
- IAM Admin (for service accounts)

## 🚀 Deployment Steps

### Step 1: Infrastructure Setup

1. **Update Configuration Variables**
   ```bash
   # Edit deployment/gcp-setup.sh
   PROJECT_ID="your-actual-project-id"
   DOMAIN_NAME="yourdomain.com"
   ```

2. **Run Infrastructure Setup**
   ```bash
   chmod +x deployment/gcp-setup.sh
   ./deployment/gcp-setup.sh
   ```

   This script will:
   - Create VM in Mumbai region (asia-south1-a) for optimal IST performance
   - Configure firewall rules
   - Set up Cloud Storage bucket for backups
   - Create daily snapshot schedule at 2:00 AM IST
   - Reserve and assign static IP

### Step 2: Server Environment Setup

1. **SSH into the VM**
   ```bash
   gcloud compute ssh tradebot-portal --zone=asia-south1-a
   ```

2. **Upload and run server setup script**
   ```bash
   # Copy server setup script to VM
   scp deployment/server-setup.sh tradebot-portal:~/
   
   # Make executable and run
   chmod +x server-setup.sh
   sudo ./server-setup.sh
   ```

   This will install and configure:
   - IST timezone (Asia/Kolkata)
   - Node.js 18.x and PM2
   - MongoDB with authentication
   - Nginx with security headers
   - SSL certificate support (Let's Encrypt)
   - UFW firewall
   - Fail2Ban protection
   - Automated backup system

### Step 3: Application Deployment

1. **Update deployment configuration**
   ```bash
   # Edit deployment/deploy-app.sh
   REPO_URL="https://github.com/your-username/tradebot-portal.git"
   DOMAIN_NAME="yourdomain.com"
   PROJECT_ID="your-project-id"
   ```

2. **Deploy application**
   ```bash
   # Copy deployment script to VM
   scp deployment/deploy-app.sh tradebot-portal:~/
   scp deployment/ecosystem.config.js tradebot-portal:~/
   
   # Run deployment
   chmod +x deploy-app.sh
   sudo ./deploy-app.sh
   ```

### Step 4: DNS Configuration

Point your domain to the VM's static IP:

```
A Record: yourdomain.com → [VM_STATIC_IP]
A Record: www.yourdomain.com → [VM_STATIC_IP]
```

### Step 5: SSL Certificate

The deployment script automatically sets up Let's Encrypt SSL:

```bash
# Manual SSL setup if needed
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

### Step 6: Environment Configuration

Update production environment variables:

```bash
sudo -u tradebot nano /opt/tradebot-portal/.env.production
```

Required configurations:
- MongoDB credentials (auto-generated)
- NextAuth secret (generate 32+ character string)
- OAuth provider credentials (Google, GitHub)
- Encryption key for Zerodha API credentials
- Email/SMS provider settings (optional)

## 🛠 Production Configuration

### Machine Specifications
```
VM Type: e2-medium
- vCPUs: 1 core
- Memory: 4 GB
- Boot Disk: 50 GB SSD
- Network: Premium tier
- Location: asia-south1-a (Mumbai)
- Estimated Cost: ~$25-35/month
```

### IST Timezone Setup
All services are configured for IST (Asia/Kolkata):
- System timezone: Asia/Kolkata
- MongoDB timezone: Asia/Kolkata
- Application timezone: TZ=Asia/Kolkata
- Backup schedule: 1:30 AM IST
- Snapshot schedule: 2:00 AM IST
- Log timestamps: IST format

### Security Configuration

**Firewall (UFW):**
- SSH (22): Allowed
- HTTP (80): Allowed → Redirects to HTTPS
- HTTPS (443): Allowed
- All other ports: Denied

**Fail2Ban:**
- SSH protection: 3 failed attempts = 1-hour ban
- Nginx rate limiting: 10 requests/second per IP
- Login endpoint: 1 request/second per IP

**Nginx Security Headers:**
- HSTS enforcement
- XSS protection
- Content type validation
- Frame options
- CSP policy

### Backup Strategy

**Automated Backups (1:30 AM IST daily):**
- MongoDB database dump
- Application code backup
- Upload to Cloud Storage
- Local retention: 7 days
- Cloud retention: Indefinite (with versioning)

**VM Snapshots (2:00 AM IST daily):**
- Full disk snapshot
- Retention: 30 days
- Automatic cleanup

## 📊 Monitoring & Management

### PM2 Process Management
```bash
# View application status
pm2 status

# View logs
pm2 logs tradebot-portal

# Restart application
pm2 restart tradebot-portal

# Monitor resources
pm2 monit
```

### System Monitoring
```bash
# Check system resources
htop

# Check disk usage
df -h

# Check service status
systemctl status mongod nginx

# View application logs
tail -f /var/log/tradebot-portal/combined.log
```

### Health Check
Automated monitoring runs every 5 minutes:
- Application health check
- MongoDB status
- Disk space monitoring (alert at 80%)
- Memory usage monitoring (alert at 85%)

## 🔧 Maintenance Commands

### Application Updates
```bash
# SSH to VM
gcloud compute ssh tradebot-portal --zone=asia-south1-a

# Switch to app directory
cd /opt/tradebot-portal

# Pull latest changes
sudo -u tradebot git pull origin main

# Install dependencies
sudo -u tradebot npm ci --production

# Build application
sudo -u tradebot npm run build

# Restart application
sudo -u tradebot pm2 restart tradebot-portal
```

### Database Maintenance
```bash
# Connect to MongoDB
mongo -u tradebot_user -p --authenticationDatabase tradebot

# Manual backup
mongodump --host localhost --port 27017 --db tradebot --out /opt/backups/manual_backup

# Check database status
mongo --eval "db.adminCommand('serverStatus')"
```

### Certificate Renewal
```bash
# Test renewal (dry run)
sudo certbot renew --dry-run

# Force renewal
sudo certbot renew --force-renewal

# Check certificate expiry
sudo certbot certificates
```

## 🚨 Troubleshooting

### Application Not Starting
```bash
# Check PM2 status
pm2 status

# Check logs for errors
pm2 logs tradebot-portal --lines 50

# Check environment variables
pm2 env 0

# Restart with fresh environment
pm2 delete tradebot-portal
pm2 start ecosystem.config.js --env production
```

### Database Connection Issues
```bash
# Check MongoDB status
systemctl status mongod

# Check MongoDB logs
tail -f /var/log/mongodb/mongod.log

# Restart MongoDB
systemctl restart mongod

# Test connection
mongo -u tradebot_user -p --authenticationDatabase tradebot
```

### SSL Certificate Issues
```bash
# Check certificate status
sudo certbot certificates

# Check Nginx configuration
sudo nginx -t

# Renew certificate
sudo certbot renew --nginx
```

### High Resource Usage
```bash
# Check memory usage
free -h

# Check disk usage
df -h

# Check CPU usage
top

# Restart application if needed
pm2 restart tradebot-portal
```

## 📈 Scaling Considerations

### Vertical Scaling
To handle more users, upgrade to:
- e2-standard-2 (2 vCPUs, 8GB RAM) for 100-500 users
- e2-standard-4 (4 vCPUs, 16GB RAM) for 500+ users

### Horizontal Scaling
For high availability:
- Load balancer with multiple VM instances
- Managed MongoDB (Atlas) or Cloud Firestore
- Redis for session storage
- CDN for static assets

## 💰 Cost Optimization

### Current Estimated Costs (Monthly)
- VM (e2-medium): ~$25-30
- Storage (50GB SSD): ~$10
- Static IP: ~$3
- Snapshots (30 days): ~$5
- Cloud Storage (backups): ~$2
- **Total: ~$45-50/month**

### Cost Reduction Tips
- Use preemptible VMs for development (-60-90%)
- Committed use discounts for production (-30-57%)
- Monitor and right-size instances
- Clean up old snapshots and backups

## 🔒 Security Best Practices

### Regular Maintenance
- [ ] Update system packages monthly
- [ ] Review access logs weekly
- [ ] Monitor security alerts
- [ ] Backup verification monthly
- [ ] Certificate renewal (automatic)

### Access Control
- [ ] Use SSH keys (disable password auth)
- [ ] Regular security audits
- [ ] Monitor failed login attempts
- [ ] Update firewall rules as needed

### Data Protection
- [ ] Encrypt sensitive data at rest
- [ ] Regular backup testing
- [ ] Access logging for database
- [ ] API rate limiting enforcement

## 📞 Support

For deployment issues:
1. Check application logs: `/var/log/tradebot-portal/`
2. Check system logs: `journalctl -f`
3. Monitor resources: `htop` and `df -h`
4. Review this guide for troubleshooting steps

Remember: All timestamps and schedules are configured for IST (Asia/Kolkata) timezone.