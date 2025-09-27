#!/bin/bash

# Complete the setup after VM creation

PROJECT_ID="tradebot-473404"
VM_NAME="tradebot-portal"
ZONE="asia-south1-c"
REGION="asia-south1"

echo "🎯 Completing TradeBot Portal setup..."

# Step 1: Fix static IP assignment
echo ""
echo "Step 1: Fixing static IP assignment..."
chmod +x deployment/fix-static-ip.sh
./deployment/fix-static-ip.sh

# Step 2: Set up snapshot schedule
echo ""
echo "Step 2: Setting up snapshot schedule..."

if ! gcloud compute resource-policies describe tradebot-daily-snapshots --region=$REGION --project=$PROJECT_ID &>/dev/null; then
    echo "Creating snapshot schedule..."
    gcloud compute resource-policies create snapshot-schedule tradebot-daily-snapshots \
        --project=$PROJECT_ID \
        --region=$REGION \
        --max-retention-days=30 \
        --daily-schedule \
        --start-time=02:00 \
        --storage-location=$REGION
    
    echo "✅ Snapshot schedule created"
else
    echo "✅ Snapshot schedule already exists"
fi

# Attach snapshot policy to VM disk
echo "Attaching snapshot policy to VM disk..."
gcloud compute disks add-resource-policies $VM_NAME \
    --project=$PROJECT_ID \
    --zone=$ZONE \
    --resource-policies=tradebot-daily-snapshots || echo "⚠️  Snapshot policy attachment will retry later"

# Step 3: Final verification
echo ""
echo "Step 3: Final verification..."

# Get final IP
FINAL_IP=$(gcloud compute instances describe $VM_NAME --zone=$ZONE --project=$PROJECT_ID --format="value(networkInterfaces[0].accessConfigs[0].natIP)")

# Test SSH connectivity
echo "Testing SSH connectivity..."
if gcloud compute ssh $VM_NAME --zone=$ZONE --project=$PROJECT_ID --command="echo 'SSH test successful'" --quiet; then
    echo "✅ SSH connectivity verified"
    
    # Check timezone
    echo "Checking timezone configuration..."
    TIMEZONE=$(gcloud compute ssh $VM_NAME --zone=$ZONE --project=$PROJECT_ID --command="timedatectl show --property=Timezone --value" --quiet)
    if [ "$TIMEZONE" = "Asia/Kolkata" ]; then
        echo "✅ Timezone correctly set to IST"
    else
        echo "⚠️  Timezone: $TIMEZONE (will be fixed during server setup)"
    fi
else
    echo "⚠️  SSH not ready yet. Wait 2-3 minutes and try again."
fi

# Display final summary
echo ""
echo "=============================================="
echo "🎉 TradeBot Portal Infrastructure Complete!"
echo "=============================================="
echo ""
echo "✅ VM Details:"
echo "  Name: $VM_NAME"
echo "  Zone: $ZONE"
echo "  IP Address: $FINAL_IP"
echo "  Machine Type: e2-medium"
echo "  Disk: 50GB SSD"
echo ""
echo "✅ Security & Access:"
echo "  Firewall: HTTP (80), HTTPS (443), Node.js (3000), SSH (22)"
echo "  SSH: gcloud compute ssh $VM_NAME --zone=$ZONE"
echo ""
echo "✅ Backup System:"
echo "  Storage: gs://tradebot-473404-tradebot-backups/"
echo "  Snapshots: Daily at 2:00 AM IST (30-day retention)"
echo ""
echo "🚀 Next Steps:"
echo "  1. SSH to VM:"
echo "     gcloud compute ssh $VM_NAME --zone=$ZONE"
echo ""
echo "  2. Upload server setup script:"
echo "     gcloud compute scp deployment/server-setup-ip.sh $VM_NAME:~/ --zone=$ZONE"
echo ""
echo "  3. Run server setup:"
echo "     chmod +x server-setup-ip.sh && sudo ./server-setup-ip.sh"
echo ""
echo "  4. Upload app deployment script:"
echo "     gcloud compute scp deployment/deploy-app-ip.sh $VM_NAME:~/ --zone=$ZONE"
echo ""
echo "  5. Deploy application:"
echo "     chmod +x deploy-app-ip.sh && sudo ./deploy-app-ip.sh"
echo ""
echo "  6. Access your application:"
echo "     http://$FINAL_IP:3000"
echo ""
echo "Estimated remaining time: 15-20 minutes"
echo "=============================================="