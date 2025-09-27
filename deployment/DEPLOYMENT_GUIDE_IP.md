# 🚀 TradeBot Portal - Step-by-Step Deployment (IP Address Only)

**Simple deployment guide using VM IP address instead of domain name. Perfect for testing and development!**

## 📋 Prerequisites Check

**Before starting, ensure you have:**
- [ ] Google Cloud Platform account with billing enabled
- [ ] Local machine with Google Cloud SDK installed
- [ ] Your TradeBot Portal code ready in Git repository

---

## **STEP 1: Prepare Your Local Environment**

### 1.1 Install Google Cloud SDK (if not installed)
```bash
# On macOS
brew install --cask google-cloud-sdk

# On Linux
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
```

### 1.2 Authenticate and Set Project
```bash
# Login to Google Cloud
gcloud auth login

# List your projects
gcloud projects list

# Set your project (already configured)
gcloud config set project tradebot-473404
```

### 1.3 Enable Required APIs
```bash
gcloud services enable compute.googleapis.com
gcloud services enable storage.googleapis.com
```

---

## **STEP 2: Create GCP Infrastructure**

### 2.1 Make Script Executable
```bash
chmod +x deployment/gcp-setup.sh
```

### 2.2 Run Infrastructure Setup
```bash
./deployment/gcp-setup.sh
```

**Expected Output:**
```
🚀 Setting up TradeBot Portal on GCP VM...
[STEP] Creating GCP VM instance...
[STEP] Setting up firewall rules...
[STEP] Creating Cloud Storage bucket...
[STEP] Creating snapshot schedule...
[STEP] Reserving static IP...

🎉 GCP Infrastructure Setup Complete!
VM Details:
  Name: tradebot-portal
  Zone: asia-south1-a
  Machine Type: e2-medium
  Static IP: XXX.XXX.XXX.XXX  ← SAVE THIS IP!
  Timezone: Asia/Kolkata (IST)
```

### 2.3 **IMPORTANT: Save Your VM IP Address**
**Write down the static IP address - you'll use this to access your application!**

---

## **STEP 3: Set Up Server Environment**

### 3.1 SSH into Your VM
```bash
gcloud compute ssh tradebot-portal --zone=asia-south1-a
```

### 3.2 Upload Server Setup Script
**In a new terminal (keep SSH session open):**
```bash
# Copy server setup script to VM
gcloud compute scp deployment/server-setup-ip.sh tradebot-portal:~/ --zone=asia-south1-a
```

### 3.3 Run Server Setup
**Back in the SSH session:**
```bash
# Make executable and run
chmod +x server-setup-ip.sh
sudo ./server-setup-ip.sh
```

**This will take 10-15 minutes. Expected steps:**
- ✅ Set IST timezone (Asia/Kolkata)
- ✅ Install Node.js 18.x and PM2
- ✅ Install MongoDB with authentication
- ✅ Configure Nginx for IP access (ports 80 and 3000)
- ✅ Set up firewall (SSH, HTTP, port 3000)
- ✅ Configure automated backups

### 3.4 **Important: Save MongoDB Credentials**
```
MongoDB Credentials:
  Admin: admin / SecureAdminPassword123!
  App: tradebot_user / SecureAppPassword123!
```

**Expected final output:**
```
🎉 TradeBot Portal Server Setup Complete!
Access Information:
  External IP: XXX.XXX.XXX.XXX
  HTTP Access: http://XXX.XXX.XXX.XXX
  Direct Access: http://XXX.XXX.XXX.XXX:3000
```

---

## **STEP 4: Deploy Application**

### 4.1 Upload Deployment Script
**From your local machine:**
```bash
# Copy deployment script
gcloud compute scp deployment/deploy-app-ip.sh tradebot-portal:~/ --zone=asia-south1-a
```

### 4.2 Run Application Deployment
**In your SSH session:**
```bash
# Make executable and run
chmod +x deploy-app-ip.sh
sudo ./deploy-app-ip.sh
```

**This will:**
- ✅ Clone your repository from GitHub
- ✅ Install Node.js dependencies
- ✅ Build the application
- ✅ Configure environment for IP access
- ✅ Set up PM2 process management
- ✅ Start the application

**Expected final output:**
```
🎉 TradeBot Portal Deployment Complete!
Application Status:
  Primary URL: http://XXX.XXX.XXX.XXX:3000
  Proxy URL: http://XXX.XXX.XXX.XXX
  PM2 Status: online

OAuth Redirect URLs for providers:
  Google: http://XXX.XXX.XXX.XXX:3000/api/auth/callback/google
  GitHub: http://XXX.XXX.XXX.XXX:3000/api/auth/callback/github
```

---

## **STEP 5: Test Your Application**

### 5.1 Access Your Application
**Open your browser and go to:**
```
http://YOUR_VM_IP:3000
```

**You should see:**
- ✅ TradeBot Portal homepage
- ✅ Professional landing page with features
- ✅ Sign in/Register buttons

### 5.2 Basic Functionality Test
1. **Homepage loads correctly**
2. **Navigation works**
3. **Time zone is IST** (check browser console for any timezone-related logs)

---

## **STEP 6: Configure OAuth Providers (Optional)**

### 6.1 Google OAuth Setup
1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create OAuth 2.0 Client ID
3. **Authorized redirect URI:** `http://YOUR_VM_IP:3000/api/auth/callback/google`
4. Copy Client ID and Secret

### 6.2 GitHub OAuth Setup
1. Go to GitHub → Settings → Developer settings → OAuth Apps
2. Create new OAuth App
3. **Authorization callback URL:** `http://YOUR_VM_IP:3000/api/auth/callback/github`
4. Copy Client ID and Secret

### 6.3 Update Environment Variables
```bash
# SSH to VM
gcloud compute ssh tradebot-portal --zone=asia-south1-a

# Edit environment file
sudo -u tradebot nano /opt/tradebot-portal/.env.production
```

**Update OAuth credentials:**
```bash
GOOGLE_CLIENT_ID=your-actual-google-client-id
GOOGLE_CLIENT_SECRET=your-actual-google-client-secret
GITHUB_CLIENT_ID=your-actual-github-client-id
GITHUB_CLIENT_SECRET=your-actual-github-client-secret
```

### 6.4 Restart Application
```bash
sudo -u tradebot pm2 restart tradebot-portal
```

---

## **STEP 7: Verify Everything Works**

### 7.1 Full Application Test
1. **Access:** `http://YOUR_VM_IP:3000`
2. **Test registration** with email
3. **Test OAuth login** (Google/GitHub) if configured
4. **Access dashboard** after login
5. **Test navigation** between pages

### 7.2 Check IST Timezone
```bash
# Check system timezone
timedatectl

# Check application logs for IST timestamps
sudo -u tradebot pm2 logs tradebot-portal | head -10
```

### 7.3 Verify Services
```bash
# Application status
sudo -u tradebot pm2 status

# MongoDB status
systemctl status mongod

# Nginx status
systemctl status nginx

# Check if ports are open
netstat -tlnp | grep -E ':80|:3000|:27017'
```

---

## **🎉 STEP 8: Your Application is Live!**

### ✅ Success Checklist
- [ ] Application accessible at `http://YOUR_VM_IP:3000`
- [ ] Homepage loads correctly
- [ ] User registration/login works
- [ ] IST timezone configured
- [ ] MongoDB running with authentication
- [ ] Automated backups scheduled (1:30 AM IST)
- [ ] VM snapshots scheduled (2:00 AM IST)

### 📊 Application Management

**Access VM:**
```bash
gcloud compute ssh tradebot-portal --zone=asia-south1-a
```

**View application status:**
```bash
sudo -u tradebot pm2 status
```

**View logs:**
```bash
sudo -u tradebot pm2 logs tradebot-portal
```

**Restart application:**
```bash
sudo -u tradebot pm2 restart tradebot-portal
```

**Monitor resources:**
```bash
sudo -u tradebot pm2 monit
htop
df -h
```

---

## **🔧 Common Management Tasks**

### Update Application Code
```bash
# SSH to VM
gcloud compute ssh tradebot-portal --zone=asia-south1-a

# Go to app directory
cd /opt/tradebot-portal

# Pull latest changes
sudo -u tradebot git pull origin main

# Install dependencies and build
sudo -u tradebot npm ci --production
sudo -u tradebot npm run build

# Restart application
sudo -u tradebot pm2 restart tradebot-portal
```

### Check Application Health
```bash
# Application responding?
curl http://localhost:3000

# Check all services
systemctl status mongod nginx

# Check resource usage
free -h
df -h
```

### View Logs
```bash
# Application logs
sudo -u tradebot pm2 logs tradebot-portal

# System logs
journalctl -f

# Nginx logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log

# MongoDB logs
tail -f /var/log/mongodb/mongod.log
```

---

## **🚨 Troubleshooting**

### Application Not Loading
```bash
# Check if app is running
sudo -u tradebot pm2 status

# Check logs for errors
sudo -u tradebot pm2 logs tradebot-portal --lines 20

# Restart if needed
sudo -u tradebot pm2 restart tradebot-portal
```

### Can't Access from Browser
```bash
# Check if port 3000 is open
netstat -tlnp | grep :3000

# Check firewall
sudo ufw status

# Check if Nginx is running
systemctl status nginx
```

### Database Issues
```bash
# Check MongoDB status
systemctl status mongod

# Check MongoDB logs
tail -f /var/log/mongodb/mongod.log

# Restart MongoDB
sudo systemctl restart mongod
```

---

## **💰 Cost Information**

### Current Setup Cost (Monthly)
- **VM (e2-medium):** ~$25-30
- **Storage (50GB SSD):** ~$10
- **Static IP:** ~$3
- **Snapshots:** ~$5
- **Cloud Storage:** ~$2
- **Total:** ~$45-50/month

---

## **🔄 Later: Adding Domain Name**

When you're ready to add a domain name:

1. **Purchase domain** from any registrar
2. **Point DNS** to your VM IP: `YOUR_VM_IP`
3. **Update Nginx config** for domain
4. **Get SSL certificate** with Let's Encrypt
5. **Update environment** with HTTPS URLs
6. **Update OAuth** redirect URLs to use domain

---

## **📈 Your TradeBot Portal is Now Running!**

**Access your application:**
- **URL:** `http://YOUR_VM_IP:3000`
- **Server:** GCP VM in Mumbai (IST timezone)
- **Database:** MongoDB with authentication
- **Monitoring:** PM2 with health checks
- **Backups:** Daily at 1:30 AM IST
- **Snapshots:** Daily at 2:00 AM IST

**You can now:**
- ✅ Register users and test authentication
- ✅ Develop and test trading bot features
- ✅ Integrate with Zerodha API
- ✅ Monitor application performance
- ✅ Access logs and metrics

**Perfect for development and testing before adding a domain name!** 🎉