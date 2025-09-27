#!/bin/bash

# Fix static IP assignment for TradeBot Portal VM

PROJECT_ID="tradebot-473404"
VM_NAME="tradebot-portal"
ZONE="asia-south1-c"
REGION="asia-south1"

echo "🔧 Fixing static IP assignment..."

# Get the reserved static IP
STATIC_IP=$(gcloud compute addresses describe tradebot-portal-ip --region=$REGION --project=$PROJECT_ID --format="value(address)")
echo "Reserved static IP: $STATIC_IP"

# Get current VM external IP
CURRENT_IP=$(gcloud compute instances describe $VM_NAME --zone=$ZONE --project=$PROJECT_ID --format="value(networkInterfaces[0].accessConfigs[0].natIP)")
echo "Current VM IP: $CURRENT_IP"

if [ "$STATIC_IP" = "$CURRENT_IP" ]; then
    echo "✅ VM already using the correct static IP!"
else
    echo "🔄 Updating VM to use static IP..."
    
    # Delete current access config
    gcloud compute instances delete-access-config $VM_NAME \
        --project=$PROJECT_ID \
        --zone=$ZONE \
        --access-config-name="External NAT"
    
    # Add new access config with static IP
    gcloud compute instances add-access-config $VM_NAME \
        --project=$PROJECT_ID \
        --zone=$ZONE \
        --access-config-name="External NAT" \
        --address=$STATIC_IP
    
    if [ $? -eq 0 ]; then
        echo "✅ Static IP assigned successfully"
    else
        echo "❌ Failed to assign static IP"
        exit 1
    fi
fi

# Verify the assignment
UPDATED_IP=$(gcloud compute instances describe $VM_NAME --zone=$ZONE --project=$PROJECT_ID --format="value(networkInterfaces[0].accessConfigs[0].natIP)")
echo "Updated VM IP: $UPDATED_IP"

if [ "$STATIC_IP" = "$UPDATED_IP" ]; then
    echo "✅ Static IP successfully assigned!"
else
    echo "❌ IP assignment verification failed"
fi

echo ""
echo "VM is ready at: $STATIC_IP"
echo "SSH command: gcloud compute ssh $VM_NAME --zone=$ZONE --project=$PROJECT_ID"