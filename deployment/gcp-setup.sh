#!/bin/bash

# TradeBot Portal - GCP VM Setup Script
# Production Environment (Small Scale - Up to 100 users)
# IST Timezone Configuration

set -e

echo "🚀 Setting up TradeBot Portal on GCP VM..."

# Configuration variables
PROJECT_ID="tradebot-473404"
VM_NAME="tradebot-portal"
ZONE="asia-south1-a"  # Mumbai zone for better IST latency
REGION="asia-south1"
MACHINE_TYPE="e2-medium"
BOOT_DISK_SIZE="50GB"
DOMAIN_NAME=""  # Will use IP address initially

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_step() {
    echo -e "${GREEN}[STEP]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Step 1: Create VM Instance
print_step "Creating GCP VM instance..."
gcloud compute instances create $VM_NAME \
    --project=$PROJECT_ID \
    --zone=$ZONE \
    --machine-type=$MACHINE_TYPE \
    --network-interface=network-tier=PREMIUM,subnet=default \
    --boot-disk-size=$BOOT_DISK_SIZE \
    --boot-disk-type=pd-ssd \
    --boot-disk-device-name=$VM_NAME \
    --image-family=ubuntu-2204-lts \
    --image-project=ubuntu-os-cloud \
    --tags=http-server,https-server,tradebot-portal \
    --metadata=startup-script='#!/bin/bash
    # Set timezone to IST
    timedatectl set-timezone Asia/Kolkata
    
    # Update system
    apt-get update
    apt-get upgrade -y
    
    # Install basic tools
    apt-get install -y curl wget git htop vim ufw fail2ban
    
    echo "VM initialized with IST timezone"' \
    --scopes=https://www.googleapis.com/auth/cloud-platform

print_step "VM created successfully!"

# Step 2: Create firewall rules
print_step "Setting up firewall rules..."
gcloud compute firewall-rules create allow-tradebot-http \
    --project=$PROJECT_ID \
    --allow tcp:80,tcp:443,tcp:3000 \
    --source-ranges 0.0.0.0/0 \
    --target-tags tradebot-portal \
    --description="Allow HTTP, HTTPS, and Node.js traffic for TradeBot Portal"

gcloud compute firewall-rules create allow-ssh-tradebot \
    --project=$PROJECT_ID \
    --allow tcp:22 \
    --source-ranges 0.0.0.0/0 \
    --target-tags tradebot-portal \
    --description="Allow SSH access to TradeBot Portal VM"

# Step 3: Create Cloud Storage bucket for backups
print_step "Creating Cloud Storage bucket for backups..."
BUCKET_NAME="${PROJECT_ID}-tradebot-backups"
gsutil mb -p $PROJECT_ID -c STANDARD -l $REGION gs://$BUCKET_NAME/

# Enable versioning for backups
gsutil versioning set on gs://$BUCKET_NAME/

print_step "Cloud Storage bucket created: gs://$BUCKET_NAME/"

# Step 4: Set up snapshot schedule
print_step "Creating snapshot schedule for automated backups..."
gcloud compute resource-policies create snapshot-schedule tradebot-daily-snapshots \
    --project=$PROJECT_ID \
    --region=$REGION \
    --max-retention-days=30 \
    --on-source-disk-delete=apply-retention-policy \
    --daily-schedule \
    --start-time=02:00 \
    --storage-location=$REGION

# Attach snapshot policy to VM disk
gcloud compute disks add-resource-policies $VM_NAME \
    --project=$PROJECT_ID \
    --zone=$ZONE \
    --resource-policies=tradebot-daily-snapshots

print_step "Snapshot schedule configured for 2:00 AM IST daily"

# Step 5: Reserve static IP
print_step "Reserving static IP address..."
gcloud compute addresses create tradebot-portal-ip \
    --project=$PROJECT_ID \
    --region=$REGION

STATIC_IP=$(gcloud compute addresses describe tradebot-portal-ip --region=$REGION --format="value(address)")

print_step "Static IP reserved: $STATIC_IP"

# Step 6: Assign static IP to VM
print_step "Assigning static IP to VM..."
gcloud compute instances delete-access-config $VM_NAME \
    --project=$PROJECT_ID \
    --zone=$ZONE \
    --access-config-name="External NAT"

gcloud compute instances add-access-config $VM_NAME \
    --project=$PROJECT_ID \
    --zone=$ZONE \
    --access-config-name="External NAT" \
    --address=$STATIC_IP

print_step "Static IP assigned successfully!"

# Step 7: Wait for VM to be ready
print_step "Waiting for VM to be ready..."
sleep 30

# Step 8: Display connection information
echo ""
echo "=============================================="
echo "🎉 GCP Infrastructure Setup Complete!"
echo "=============================================="
echo ""
echo "VM Details:"
echo "  Name: $VM_NAME"
echo "  Zone: $ZONE"
echo "  Machine Type: $MACHINE_TYPE"
echo "  Static IP: $STATIC_IP"
echo "  Timezone: Asia/Kolkata (IST)"
echo ""
echo "Backup Configuration:"
echo "  Storage Bucket: gs://$BUCKET_NAME/"
echo "  Snapshot Schedule: Daily at 2:00 AM IST"
echo "  Retention: 30 days"
echo ""
echo "Next Steps:"
echo "  1. SSH into the VM: gcloud compute ssh $VM_NAME --zone=$ZONE"
echo "  2. Run the server setup script"
echo "  3. Access your application at: http://$STATIC_IP:3000"
echo "  4. Later: Configure domain DNS to point to: $STATIC_IP"
echo ""
echo "=============================================="
