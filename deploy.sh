#\!/bin/bash
# TradeBot Portal Deployment Script

echo "🚀 Deploying TradeBot Portal to production..."

# Build and push locally
echo "📦 Building locally..."
npm run build

echo "📤 Pushing to GitHub..."
git add .
git commit -m "Update: $(date '+%Y-%m-%d %H:%M:%S')" || echo "No changes to commit"
git push origin main

# Deploy to server
echo "🌐 Deploying to server..."
gcloud compute ssh tradebot-portal --zone=asia-south1-c --command="
cd ~/tradebot-portal && 
git pull origin main && 
npm install && 
npm run build && 
pm2 restart tradebot-portal
"

echo "✅ Deployment complete\!"
echo "🔗 Application running at: https://niveshawealth.in"
