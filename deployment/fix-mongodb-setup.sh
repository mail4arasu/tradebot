#!/bin/bash

# Fix MongoDB setup for TradeBot Portal
# This script fixes the MongoDB authentication setup

echo "🔧 Fixing MongoDB setup..."

# Install mongosh (MongoDB Shell)
echo "Installing MongoDB Shell (mongosh)..."
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt-get update
sudo apt-get install -y mongodb-mongosh

# Wait for MongoDB to be ready
echo "Waiting for MongoDB to start..."
sleep 10

# Check if MongoDB is running
if ! systemctl is-active --quiet mongod; then
    echo "Starting MongoDB..."
    sudo systemctl start mongod
    sleep 5
fi

# Create MongoDB admin user
echo "Setting up MongoDB admin user..."
mongosh --eval "
use admin;
db.createUser({
  user: 'admin',
  pwd: 'SecureAdminPassword123!',
  roles: [ { role: 'userAdminAnyDatabase', db: 'admin' }, 'readWriteAnyDatabase' ]
});
"

if [ $? -eq 0 ]; then
    echo "✅ Admin user created successfully"
else
    echo "⚠️  Admin user may already exist or MongoDB not ready"
fi

# Create application database and user
echo "Setting up application database and user..."
mongosh --eval "
use tradebot;
db.createUser({
  user: 'tradebot_user',
  pwd: 'SecureAppPassword123!',
  roles: [ { role: 'readWrite', db: 'tradebot' } ]
});
"

if [ $? -eq 0 ]; then
    echo "✅ Application user created successfully"
else
    echo "⚠️  Application user may already exist"
fi

# Test the connection
echo "Testing MongoDB connection..."
if mongosh --eval "db.runCommand({ping: 1})" > /dev/null 2>&1; then
    echo "✅ MongoDB is responding"
else
    echo "❌ MongoDB connection test failed"
fi

# Restart MongoDB to ensure all settings are applied
echo "Restarting MongoDB with authentication..."
sudo systemctl restart mongod
sleep 5

# Final status check
if systemctl is-active --quiet mongod; then
    echo "✅ MongoDB is running with authentication enabled"
else
    echo "❌ MongoDB failed to start"
    sudo systemctl status mongod
fi

echo ""
echo "📋 MongoDB Configuration Complete"
echo "Admin User: admin / SecureAdminPassword123!"
echo "App User: tradebot_user / SecureAppPassword123!"
echo ""