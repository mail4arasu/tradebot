// PM2 Ecosystem Configuration for TradeBot Portal
// Optimized for production environment with IST timezone

module.exports = {
  apps: [{
    name: 'tradebot-portal',
    script: 'npm',
    args: 'start',
    cwd: '/opt/tradebot-portal',
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
      
      // NextAuth Configuration
      NEXTAUTH_URL: 'https://your-domain.com',
      NEXTAUTH_SECRET: 'your-secure-nextauth-secret-key-here',
      
      // OAuth Providers (configure as needed)
      GOOGLE_CLIENT_ID: 'your-google-client-id',
      GOOGLE_CLIENT_SECRET: 'your-google-client-secret',
      GITHUB_CLIENT_ID: 'your-github-client-id', 
      GITHUB_CLIENT_SECRET: 'your-github-client-secret',
      
      // Email Configuration (optional)
      EMAIL_SERVER_HOST: 'smtp.gmail.com',
      EMAIL_SERVER_PORT: 587,
      EMAIL_SERVER_USER: 'your-email@gmail.com',
      EMAIL_SERVER_PASSWORD: 'your-app-password',
      EMAIL_FROM: 'noreply@your-domain.com',
      
      // SMS Provider (Twilio - optional)
      TWILIO_ACCOUNT_SID: 'your-twilio-account-sid',
      TWILIO_AUTH_TOKEN: 'your-twilio-auth-token',
      TWILIO_PHONE_NUMBER: 'your-twilio-phone-number',
      
      // Encryption key for API keys (32 characters)
      ENCRYPTION_KEY: 'your-32-character-encryption-key',
      
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
    node_args: '--max-old-space-size=256',
    
    // Custom start script for IST timezone
    pre_setup: 'echo "Starting TradeBot Portal in IST timezone..."',
    post_setup: 'echo "TradeBot Portal started successfully"'
  }],

  // Deployment configuration
  deploy: {
    production: {
      user: 'tradebot',
      host: 'your-vm-external-ip',
      ref: 'origin/main',
      repo: 'https://github.com/your-username/tradebot-portal.git',
      path: '/opt/tradebot-portal',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': 'echo "Setting up production environment..."',
      'post-setup': 'echo "Production setup completed"',
      env: {
        NODE_ENV: 'production',
        TZ: 'Asia/Kolkata'
      }
    }
  }
}