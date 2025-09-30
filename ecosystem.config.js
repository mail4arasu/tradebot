module.exports = {
  apps: [{
    name: 'tradebot-portal',
    script: 'npm',
    args: 'start',
    env: {
      NODE_ENV: 'production',
      MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/tradebot',
      MONGODB_DB: process.env.MONGODB_DB || 'tradebot',
      NEXTAUTH_URL: process.env.NEXTAUTH_URL || 'https://niveshawealth.in',
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
      ZERODHA_APP_NAME: process.env.ZERODHA_APP_NAME || 'TradeBot-Portal'
    }
  }]
}
