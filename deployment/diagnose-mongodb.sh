#!/bin/bash

# Diagnose and fix MongoDB issues

echo "🔍 Diagnosing MongoDB issues..."

# Check MongoDB logs
echo "=== MongoDB Error Logs ==="
sudo tail -20 /var/log/mongodb/mongod.log

echo ""
echo "=== Checking MongoDB data directory ==="
ls -la /data/mongodb/

echo ""
echo "=== Checking MongoDB configuration ==="
cat /etc/mongod.conf

echo ""
echo "=== Checking disk space ==="
df -h

echo ""
echo "=== Checking if MongoDB process is running ==="
ps aux | grep mongod

echo ""
echo "🔧 Attempting to fix MongoDB..."

# Stop any running MongoDB processes
sudo systemctl stop mongod
sudo pkill -f mongod

# Check if custom data directory exists and fix permissions
if [ -d "/data/mongodb" ]; then
    echo "Custom data directory exists, fixing permissions..."
    sudo chown -R mongodb:mongodb /data/mongodb
    sudo chmod 755 /data/mongodb
else
    echo "Custom data directory missing, creating default setup..."
    sudo mkdir -p /var/lib/mongodb
    sudo chown -R mongodb:mongodb /var/lib/mongodb
    sudo chmod 755 /var/lib/mongodb
fi

# Create a simple MongoDB configuration that works
echo "Creating basic MongoDB configuration..."
sudo tee /etc/mongod.conf > /dev/null <<EOF
# mongod.conf - Basic configuration for TradeBot Portal

# Where to store data
storage:
  dbPath: /var/lib/mongodb
  journal:
    enabled: true

# Where to write logging data
systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod.log

# Network interfaces
net:
  port: 27017
  bindIp: 127.0.0.1

# Process management
processManagement:
  timeZoneInfo: /usr/share/zoneinfo
EOF

# Ensure log directory exists
sudo mkdir -p /var/log/mongodb
sudo chown mongodb:mongodb /var/log/mongodb

# Fix MongoDB service file permissions
sudo chown mongodb:mongodb /var/lib/mongodb
sudo chown mongodb:mongodb /var/log/mongodb

# Try to start MongoDB with basic config
echo "Starting MongoDB with basic configuration..."
sudo systemctl start mongod

# Wait and check status
sleep 5
if systemctl is-active --quiet mongod; then
    echo "✅ MongoDB started successfully"
    
    # Now try to create users without authentication first
    echo "Creating MongoDB users..."
    sleep 2
    
    # Create admin user
    mongosh --eval "
    use admin;
    db.createUser({
      user: 'admin',
      pwd: 'SecureAdminPassword123!',
      roles: [ { role: 'userAdminAnyDatabase', db: 'admin' }, 'readWriteAnyDatabase' ]
    });
    " 2>/dev/null
    
    # Create app user
    mongosh --eval "
    use tradebot;
    db.createUser({
      user: 'tradebot_user',
      pwd: 'SecureAppPassword123!',
      roles: [ { role: 'readWrite', db: 'tradebot' } ]
    });
    " 2>/dev/null
    
    # Now enable authentication
    echo "Enabling authentication..."
    sudo tee /etc/mongod.conf > /dev/null <<EOF
# mongod.conf - TradeBot Portal with authentication

# Where to store data
storage:
  dbPath: /var/lib/mongodb
  journal:
    enabled: true

# Where to write logging data
systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod.log

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
EOF
    
    # Restart with authentication
    sudo systemctl restart mongod
    sleep 5
    
    if systemctl is-active --quiet mongod; then
        echo "✅ MongoDB running with authentication enabled"
        
        # Test connection
        echo "Testing authentication..."
        if mongosh --eval "db.adminCommand('listCollections')" -u admin -p SecureAdminPassword123! --authenticationDatabase admin > /dev/null 2>&1; then
            echo "✅ MongoDB authentication working"
        else
            echo "⚠️  Authentication test failed, but MongoDB is running"
        fi
    else
        echo "❌ MongoDB failed to start with authentication"
        sudo systemctl status mongod
    fi
else
    echo "❌ MongoDB failed to start"
    echo "Checking logs..."
    sudo tail -10 /var/log/mongodb/mongod.log
fi

echo ""
echo "=== Final MongoDB Status ==="
sudo systemctl status mongod --no-pager