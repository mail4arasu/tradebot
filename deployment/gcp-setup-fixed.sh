#!/bin/bash

# TradeBot Portal - GCP VM Setup Script (Fixed for CLI compatibility)
# Compatible with newer gcloud CLI versions

set -e

echo "🚀 Setting up TradeBot Portal on GCP VM..."

# Configuration variables
PROJECT_ID="tradebot-473404"
VM_NAME="tradebot-portal"
ZONE="asia-south1-c"  # Using your configured zone
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

# Step 1: Find available Ubuntu image (simple approach)
print_step "Finding latest Ubuntu image..."

# Use a simple approach that works with all CLI versions
echo "Available Ubuntu images:"
gcloud compute images list --project=ubuntu-os-cloud --no-standard-images | grep ubuntu | head -5

# Try the most common Ubuntu LTS images
IMAGE_FAMILIES=("ubuntu-2204-lts" "ubuntu-2004-lts" "ubuntu-minimal-2204-lts")
IMAGE_FAMILY=""
IMAGE_PROJECT="ubuntu-os-cloud"

for family in "${IMAGE_FAMILIES[@]}"; do
    echo "Testing image family: $family"
    if gcloud compute images describe-from-family "$family" --project="$IMAGE_PROJECT" &>/dev/null; then
        IMAGE_FAMILY="$family"
        echo "✅ Using image family: $IMAGE_FAMILY"
        break
    else
        echo "⚠️  $family not available"
    fi
done

# If none of the preferred images work, get the latest ubuntu image manually
if [ -z "$IMAGE_FAMILY" ]; then
    print_warning "Using fallback method to find Ubuntu image..."
    LATEST_UBUNTU=$(gcloud compute images list --project=ubuntu-os-cloud --format="value(name)" | grep ubuntu | grep -v deprecated | head -1)
    if [ -n "$LATEST_UBUNTU" ]; then
        echo "✅ Using latest Ubuntu image: $LATEST_UBUNTU"
        IMAGE_FLAG="--image=$LATEST_UBUNTU --image-project=$IMAGE_PROJECT"
    else
        print_error "No Ubuntu images found. Using Debian as fallback."
        IMAGE_FLAG="--image-family=debian-11 --image-project=debian-cloud"
    fi
else
    IMAGE_FLAG="--image-family=$IMAGE_FAMILY --image-project=$IMAGE_PROJECT"
fi

# Step 2: Create VM Instance
print_step "Creating GCP VM instance..."
gcloud compute instances create $VM_NAME \
    --project=$PROJECT_ID \
    --zone=$ZONE \
    --machine-type=$MACHINE_TYPE \
    --network-interface=network-tier=PREMIUM,subnet=default \
    --boot-disk-size=$BOOT_DISK_SIZE \
    --boot-disk-type=pd-ssd \
    --boot-disk-device-name=$VM_NAME \
    $IMAGE_FLAG \
    --tags=http-server,https-server,tradebot-portal \
    --metadata=startup-script='#!/bin/bash
    # Set timezone to IST
    timedatectl set-timezone Asia/Kolkata
    
    # Update system
    apt-get update
    apt-get upgrade -y
    
    # Install basic tools
    apt-get install -y curl wget git htop vim ufw fail2ban
    
    echo "VM initialized with IST timezone" > /var/log/startup.log'

if [ $? -eq 0 ]; then
    print_step "VM created successfully!"
else
    print_error "VM creation failed. Exiting."
    exit 1
fi

# Step 3: Create firewall rules (only if they don't exist)
print_step "Setting up firewall rules..."

if ! gcloud compute firewall-rules describe allow-tradebot-http --project=$PROJECT_ID &>/dev/null; then
    gcloud compute firewall-rules create allow-tradebot-http \
        --project=$PROJECT_ID \
        --allow tcp:80,tcp:443,tcp:3000 \
        --source-ranges 0.0.0.0/0 \
        --target-tags tradebot-portal \
        --description="Allow HTTP, HTTPS, and Node.js traffic for TradeBot Portal"
    echo "✅ Firewall rule created: allow-tradebot-http"
else
    echo "✅ Firewall rule already exists: allow-tradebot-http"
fi

if ! gcloud compute firewall-rules describe allow-ssh-tradebot --project=$PROJECT_ID &>/dev/null; then
    gcloud compute firewall-rules create allow-ssh-tradebot \
        --project=$PROJECT_ID \
        --allow tcp:22 \
        --source-ranges 0.0.0.0/0 \
        --target-tags tradebot-portal \
        --description="Allow SSH access to TradeBot Portal VM"
    echo "✅ Firewall rule created: allow-ssh-tradebot"
else
    echo "✅ Firewall rule already exists: allow-ssh-tradebot"
fi

# Step 4: Create Cloud Storage bucket
print_step "Creating Cloud Storage bucket for backups..."
BUCKET_NAME="${PROJECT_ID}-tradebot-backups"

if ! gsutil ls gs://$BUCKET_NAME/ &>/dev/null; then
    gsutil mb -p $PROJECT_ID -c STANDARD -l $REGION gs://$BUCKET_NAME/
    gsutil versioning set on gs://$BUCKET_NAME/
    echo "✅ Cloud Storage bucket created: gs://$BUCKET_NAME/"
else
    echo "✅ Cloud Storage bucket already exists: gs://$BUCKET_NAME/"
fi

# Step 5: Reserve static IP
print_step "Creating static IP address..."

if ! gcloud compute addresses describe tradebot-portal-ip --region=$REGION --project=$PROJECT_ID &>/dev/null; then
    gcloud compute addresses create tradebot-portal-ip \
        --project=$PROJECT_ID \
        --region=$REGION
    echo "✅ Static IP created: tradebot-portal-ip"
else
    echo "✅ Static IP already exists: tradebot-portal-ip"
fi

# Get the static IP
STATIC_IP=$(gcloud compute addresses describe tradebot-portal-ip --region=$REGION --project=$PROJECT_ID --format="value(address)")
echo "Static IP address: $STATIC_IP"

# Step 6: Wait for VM to be running
print_step "Waiting for VM to be ready..."
echo "Checking VM status..."

for i in {1..30}; do
    STATUS=$(gcloud compute instances describe $VM_NAME --zone=$ZONE --project=$PROJECT_ID --format="value(status)")
    if [ "$STATUS" = "RUNNING" ]; then
        echo "✅ VM is running"
        break
    else
        echo "VM status: $STATUS (attempt $i/30)"
        sleep 10
    fi
done

# Step 7: Assign static IP to VM
print_step "Assigning static IP to VM..."

# Wait a bit more for the VM to be fully ready
sleep 20

# Delete existing access config first (if exists)
gcloud compute instances delete-access-config $VM_NAME \
    --project=$PROJECT_ID \
    --zone=$ZONE \
    --access-config-name="External NAT" &>/dev/null || echo "No existing access config to delete"

# Add new access config with static IP
gcloud compute instances add-access-config $VM_NAME \
    --project=$PROJECT_ID \
    --zone=$ZONE \
    --access-config-name="External NAT" \
    --address=$STATIC_IP

if [ $? -eq 0 ]; then
    echo "✅ Static IP assigned successfully"
else
    print_warning "Static IP assignment may have failed. You can try again later."
fi

# Step 8: Set up snapshot schedule (simplified)
print_step "Setting up daily snapshots..."

if ! gcloud compute resource-policies describe tradebot-daily-snapshots --region=$REGION --project=$PROJECT_ID &>/dev/null; then
    gcloud compute resource-policies create snapshot-schedule tradebot-daily-snapshots \
        --project=$PROJECT_ID \
        --region=$REGION \
        --max-retention-days=30 \
        --daily-schedule \
        --start-time=02:00 \
        --storage-location=$REGION
    echo "✅ Snapshot schedule created"
    
    # Try to attach the policy (may fail if disk is busy)
    sleep 10
    gcloud compute disks add-resource-policies $VM_NAME \
        --project=$PROJECT_ID \
        --zone=$ZONE \
        --resource-policies=tradebot-daily-snapshots &>/dev/null || echo "⚠️  Snapshot policy will be attached later"
else
    echo "✅ Snapshot schedule already exists"
fi

# Final verification
print_step "Final verification..."
sleep 10

# Test SSH connectivity
echo "Testing SSH connectivity..."
if gcloud compute ssh $VM_NAME --zone=$ZONE --project=$PROJECT_ID --command="echo 'SSH test successful'" --quiet &>/dev/null; then
    echo "✅ SSH connectivity verified"
else
    print_warning "SSH not ready yet. Wait 2-3 minutes and try: gcloud compute ssh $VM_NAME --zone=$ZONE"
fi

# Display final information
echo ""
echo "=============================================="
echo "🎉 TradeBot Portal Infrastructure Ready!"
echo "=============================================="
echo ""
echo "VM Details:"
echo "  Name: $VM_NAME"
echo "  Zone: $ZONE"
echo "  Machine Type: $MACHINE_TYPE"
echo "  Static IP: $STATIC_IP"
echo "  Image: $IMAGE_FAMILY (or latest Ubuntu)"
echo "  Timezone: Asia/Kolkata (IST)"
echo ""
echo "Access Information:"
echo "  SSH: gcloud compute ssh $VM_NAME --zone=$ZONE"
echo "  Future App URL: http://$STATIC_IP:3000"
echo ""
echo "Backup Configuration:"
echo "  Storage Bucket: gs://$BUCKET_NAME/"
echo "  Snapshots: Daily at 2:00 AM IST (30 days retention)"
echo ""
echo "Next Steps:"
echo "  1. SSH to VM: gcloud compute ssh $VM_NAME --zone=$ZONE"
echo "  2. Upload and run: server-setup-ip.sh"
echo "  3. Upload and run: deploy-app-ip.sh"
echo "  4. Access your app: http://$STATIC_IP:3000"
echo ""
echo "Estimated setup time: 15-20 minutes total"
echo "=============================================="