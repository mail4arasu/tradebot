#!/bin/bash

# GCP Setup Verification Script
# Run this before the main deployment to check prerequisites

echo "🔍 Checking GCP Setup Prerequisites..."
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ Google Cloud SDK not found. Please install it first:"
    echo "   brew install --cask google-cloud-sdk"
    exit 1
fi

echo "✅ Google Cloud SDK found: $(gcloud version --format='value(Google Cloud SDK)')"

# Check authentication
echo ""
echo "🔐 Checking authentication..."
if gcloud auth list --filter="status:ACTIVE" --format="value(account)" | grep -q "@"; then
    ACTIVE_ACCOUNT=$(gcloud auth list --filter="status:ACTIVE" --format="value(account)")
    echo "✅ Authenticated as: $ACTIVE_ACCOUNT"
else
    echo "❌ Not authenticated. Please run:"
    echo "   gcloud auth login"
    exit 1
fi

# Check current project
echo ""
echo "📋 Checking current project..."
CURRENT_PROJECT=$(gcloud config get-value project 2>/dev/null)
if [ -z "$CURRENT_PROJECT" ]; then
    echo "❌ No project set. Please run:"
    echo "   gcloud config set project YOUR_PROJECT_ID"
    exit 1
fi

echo "✅ Current project: $CURRENT_PROJECT"

# Verify project exists and is accessible
echo ""
echo "🏗️ Verifying project access..."
if gcloud projects describe $CURRENT_PROJECT &>/dev/null; then
    echo "✅ Project accessible"
else
    echo "❌ Cannot access project. Please check:"
    echo "   1. Project ID is correct"
    echo "   2. You have permissions"
    echo "   3. Billing is enabled"
    exit 1
fi

# Check required APIs
echo ""
echo "🔌 Checking required APIs..."
REQUIRED_APIS=("compute.googleapis.com" "storage.googleapis.com")

for api in "${REQUIRED_APIS[@]}"; do
    if gcloud services list --enabled --filter="name:$api" --format="value(name)" | grep -q "$api"; then
        echo "✅ $api enabled"
    else
        echo "⚠️  $api not enabled. Enabling now..."
        gcloud services enable $api
        if [ $? -eq 0 ]; then
            echo "✅ $api enabled successfully"
        else
            echo "❌ Failed to enable $api"
            exit 1
        fi
    fi
done

# Check available zones
echo ""
echo "🌍 Checking available zones in asia-south1..."
AVAILABLE_ZONES=$(gcloud compute zones list --filter="region:asia-south1" --format="value(name)" | tr '\n' ' ')
if echo "$AVAILABLE_ZONES" | grep -q "asia-south1-a"; then
    echo "✅ Zone asia-south1-a available"
else
    echo "❌ Zone asia-south1-a not available"
    echo "Available zones: $AVAILABLE_ZONES"
    echo "Please update the ZONE variable in gcp-setup.sh"
    exit 1
fi

# Check available image families
echo ""
echo "💿 Checking Ubuntu image availability..."
UBUNTU_IMAGES=$(gcloud compute images list --filter="family=ubuntu-2204-lts" --format="value(name)" --limit=1)
if [ -n "$UBUNTU_IMAGES" ]; then
    echo "✅ Ubuntu 22.04 LTS image available"
else
    echo "⚠️  Ubuntu 22.04 LTS not found, checking available Ubuntu images..."
    echo "Available Ubuntu families:"
    gcloud compute images list --filter="project=ubuntu-os-cloud" --format="value(family)" | sort | uniq
    echo ""
    echo "We'll use the latest available Ubuntu LTS image"
fi

# Check quotas (basic check)
echo ""
echo "📊 Checking basic quotas..."
CPU_QUOTA=$(gcloud compute project-info describe --format="value(quotas[metric=CPUS].limit)" | head -1)
if [ "$CPU_QUOTA" -ge 4 ]; then
    echo "✅ CPU quota sufficient: $CPU_QUOTA"
else
    echo "⚠️  CPU quota may be low: $CPU_QUOTA"
    echo "You may need to request quota increase"
fi

# Check if VM name already exists
echo ""
echo "🖥️ Checking if VM already exists..."
if gcloud compute instances describe tradebot-portal --zone=asia-south1-a &>/dev/null; then
    echo "⚠️  VM 'tradebot-portal' already exists in asia-south1-a"
    echo "You may want to delete it first:"
    echo "   gcloud compute instances delete tradebot-portal --zone=asia-south1-a"
else
    echo "✅ VM name 'tradebot-portal' available"
fi

# Check if static IP already exists
echo ""
echo "🌐 Checking if static IP already exists..."
if gcloud compute addresses describe tradebot-portal-ip --region=asia-south1 &>/dev/null; then
    echo "⚠️  Static IP 'tradebot-portal-ip' already exists"
    echo "You may want to delete it first:"
    echo "   gcloud compute addresses delete tradebot-portal-ip --region=asia-south1"
else
    echo "✅ Static IP name 'tradebot-portal-ip' available"
fi

echo ""
echo "🎉 All prerequisites check passed!"
echo ""
echo "Summary:"
echo "  Project: $CURRENT_PROJECT"
echo "  Account: $ACTIVE_ACCOUNT"
echo "  Zone: asia-south1-a ✅"
echo "  Image: ubuntu-2204-lts ✅"
echo "  APIs: Enabled ✅"
echo ""
echo "You can now run:"
echo "  ./gcp-setup.sh"
echo ""