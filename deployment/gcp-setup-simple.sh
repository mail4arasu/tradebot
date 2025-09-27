#!/bin/bash

# TradeBot Portal - Simple GCP VM Setup Script
# Uses latest available Ubuntu LTS image automatically

set -e

echo "🚀 Setting up TradeBot Portal on GCP VM (Simple)..."

# Configuration variables
PROJECT_ID="tradebot-473404"
VM_NAME="tradebot-portal"
ZONE="asia-south1-a"
REGION="asia-south1"
MACHINE_TYPE="e2-medium"
BOOT_DISK_SIZE="50GB"

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

# Step 1: Find the best available Ubuntu image
print_step "Finding latest Ubuntu LTS image..."

# Try different Ubuntu versions in order of preference
UBUNTU_FAMILIES=("ubuntu-2204-lts" "ubuntu-2004-lts" "ubuntu-minimal-2204-lts" "ubuntu-minimal-2004-lts")
IMAGE_FAMILY=""
IMAGE_PROJECT="ubuntu-os-cloud"

for family in "${UBUNTU_FAMILIES[@]}"; do
    if gcloud compute images describe-from-family "$family" --project="$IMAGE_PROJECT" &>/dev/null; then
        IMAGE_FAMILY="$family"
        echo "✅ Using image family: $IMAGE_FAMILY"
        break
    fi
done

if [ -z "$IMAGE_FAMILY" ]; then
    print_error "No suitable Ubuntu image found. Available families:"
    gcloud compute images list --filter="project=$IMAGE_PROJECT" --format="value(family)" | sort | uniq
    exit 1
fi

# Step 2: Create VM Instance
print_step "Creating GCP VM instance with $IMAGE_FAMILY..."
gcloud compute instances create $VM_NAME \
    --project=$PROJECT_ID \
    --zone=$ZONE \
    --machine-type=$MACHINE_TYPE \
    --network-interface=network-tier=PREMIUM,subnet=default \
    --boot-disk-size=$BOOT_DISK_SIZE \
    --boot-disk-type=pd-ssd \
    --boot-disk-device-name=$VM_NAME \
    --image-family=$IMAGE_FAMILY \
    --image-project=$IMAGE_PROJECT \
    --tags=http-server,https-server,tradebot-portal \
    --metadata=startup-script='#!/bin/bash
    # Set timezone to IST
    timedatectl set-timezone Asia/Kolkata
    
    # Update system
    apt-get update
    apt-get upgrade -y
    
    # Install basic tools
    apt-get install -y curl wget git htop vim ufw fail2ban
    
    echo "VM initialized with IST timezone"'

print_step "VM created successfully!"

# Step 3: Create firewall rules
print_step "Setting up firewall rules..."

# Check if firewall rules already exist before creating
if ! gcloud compute firewall-rules describe allow-tradebot-http --project=$PROJECT_ID &>/dev/null; then
    gcloud compute firewall-rules create allow-tradebot-http \
        --project=$PROJECT_ID \
        --allow tcp:80,tcp:443,tcp:3000 \
        --source-ranges 0.0.0.0/0 \
        --target-tags tradebot-portal \
        --description="Allow HTTP, HTTPS, and Node.js traffic for TradeBot Portal"
else
    echo "✅ Firewall rule allow-tradebot-http already exists"
fi

if ! gcloud compute firewall-rules describe allow-ssh-tradebot --project=$PROJECT_ID &>/dev/null; then
    gcloud compute firewall-rules create allow-ssh-tradebot \
        --project=$PROJECT_ID \
        --allow tcp:22 \
        --source-ranges 0.0.0.0/0 \
        --target-tags tradebot-portal \
        --description="Allow SSH access to TradeBot Portal VM"
else
    echo "✅ Firewall rule allow-ssh-tradebot already exists"
fi

# Step 4: Create Cloud Storage bucket for backups
print_step "Creating Cloud Storage bucket for backups..."
BUCKET_NAME="${PROJECT_ID}-tradebot-backups"

if ! gsutil ls gs://$BUCKET_NAME/ &>/dev/null; then
    gsutil mb -p $PROJECT_ID -c STANDARD -l $REGION gs://$BUCKET_NAME/
    gsutil versioning set on gs://$BUCKET_NAME/
    print_step "Cloud Storage bucket created: gs://$BUCKET_NAME/"
else
    echo "✅ Cloud Storage bucket gs://$BUCKET_NAME/ already exists"
fi

# Step 5: Set up snapshot schedule
print_step "Creating snapshot schedule for automated backups..."

if ! gcloud compute resource-policies describe tradebot-daily-snapshots --region=$REGION --project=$PROJECT_ID &>/dev/null; then
    gcloud compute resource-policies create snapshot-schedule tradebot-daily-snapshots \
        --project=$PROJECT_ID \
        --region=$REGION \
        --max-retention-days=30 \
        --on-source-disk-delete=apply-retention-policy \
        --daily-schedule \
        --start-time=02:00 \
        --storage-location=$REGION
else
    echo "✅ Snapshot schedule tradebot-daily-snapshots already exists"
fi

# Attach snapshot policy to VM disk
gcloud compute disks add-resource-policies $VM_NAME \
    --project=$PROJECT_ID \
    --zone=$ZONE \
    --resource-policies=tradebot-daily-snapshots || echo "Snapshot policy already attached or disk not ready"

print_step "Snapshot schedule configured for 2:00 AM IST daily"

# Step 6: Reserve static IP
print_step "Reserving static IP address..."

if ! gcloud compute addresses describe tradebot-portal-ip --region=$REGION --project=$PROJECT_ID &>/dev/null; then
    gcloud compute addresses create tradebot-portal-ip \
        --project=$PROJECT_ID \
        --region=$REGION
else
    echo "✅ Static IP tradebot-portal-ip already exists"
fi

STATIC_IP=$(gcloud compute addresses describe tradebot-portal-ip --region=$REGION --project=$PROJECT_ID --format="value(address)")
print_step "Static IP: $STATIC_IP"

# Step 7: Assign static IP to VM
print_step "Assigning static IP to VM..."

# Delete existing access config first
gcloud compute instances delete-access-config $VM_NAME \
    --project=$PROJECT_ID \
    --zone=$ZONE \
    --access-config-name="External NAT" || echo "No existing access config found"

# Add new access config with static IP
gcloud compute instances add-access-config $VM_NAME \
    --project=$PROJECT_ID \
    --zone=$ZONE \
    --access-config-name="External NAT" \
    --address=$STATIC_IP

print_step "Static IP assigned successfully!"

# Step 8: Wait for VM to be ready
print_step "Waiting for VM to be ready..."
sleep 30

# Final verification
print_step "Verifying VM is accessible..."
if gcloud compute ssh $VM_NAME --zone=$ZONE --project=$PROJECT_ID --command="echo 'VM is ready'" --quiet; then
    echo "✅ VM is accessible via SSH"
else
    print_warning "VM may not be fully ready yet. Wait a few more minutes before SSH access."
fi

# Display connection information
echo ""
echo "=============================================="
echo "🎉 GCP Infrastructure Setup Complete!"
echo "=============================================="
echo ""
echo "VM Details:"
echo "  Name: $VM_NAME"
echo "  Zone: $ZONE"
echo "  Machine Type: $MACHINE_TYPE"
echo "  Image: $IMAGE_FAMILY"
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
echo ""
echo "SSH Command:"
echo "  gcloud compute ssh $VM_NAME --zone=$ZONE --project=$PROJECT_ID"
echo ""
echo "=============================================="