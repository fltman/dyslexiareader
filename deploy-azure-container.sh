#!/bin/bash

# TheReader Azure Container Deployment Script
# This script builds and deploys the app to Azure Container Instances with R2 storage

set -e  # Exit on any error

echo "🚀 Starting Azure Container deployment for TheReader..."

# Configuration
APP_NAME="thereader"
RESOURCE_GROUP="thereader-rg"
LOCATION="westeurope"
CONTAINER_REGISTRY="thereadercr"
IMAGE_NAME="thereader"
TAG="latest"

# Database configuration (PostgreSQL) - Set these environment variables before running
# AZURE_DB_SERVER=your-postgresql-server.postgres.database.azure.com
# AZURE_DB_NAME=your-database-name
# AZURE_DB_USERNAME=your-username
# AZURE_DB_PASSWORD=your-password

if [ -z "$AZURE_DB_SERVER" ] || [ -z "$AZURE_DB_NAME" ] || [ -z "$AZURE_DB_USERNAME" ] || [ -z "$AZURE_DB_PASSWORD" ]; then
    echo "❌ Error: Database environment variables not set."
    echo "Please set the following environment variables:"
    echo "   export AZURE_DB_SERVER=your-postgresql-server.postgres.database.azure.com"
    echo "   export AZURE_DB_NAME=your-database-name"
    echo "   export AZURE_DB_USERNAME=your-username"
    echo "   export AZURE_DB_PASSWORD=your-password"
    exit 1
fi

DB_SERVER_NAME="$AZURE_DB_SERVER"
DB_NAME="$AZURE_DB_NAME"
DB_USERNAME="$AZURE_DB_USERNAME"
DB_PASSWORD="$AZURE_DB_PASSWORD"

# R2 Storage configuration - Set these environment variables before running
# R2_ACCESS_KEY_ID=your-r2-access-key
# R2_SECRET_ACCESS_KEY=your-r2-secret-key
# R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
# R2_BUCKET=your-bucket-name

if [ -z "$R2_ACCESS_KEY_ID" ] || [ -z "$R2_SECRET_ACCESS_KEY" ] || [ -z "$R2_ENDPOINT" ] || [ -z "$R2_BUCKET" ]; then
    echo "❌ Error: R2 storage environment variables not set."
    echo "Please set the following environment variables:"
    echo "   export R2_ACCESS_KEY_ID=your-r2-access-key"
    echo "   export R2_SECRET_ACCESS_KEY=your-r2-secret-key"
    echo "   export R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com"
    echo "   export R2_BUCKET=your-bucket-name"
    exit 1
fi

echo "📋 Configuration:"
echo "  App Name: $APP_NAME"
echo "  Resource Group: $RESOURCE_GROUP"
echo "  Location: $LOCATION"
echo "  Container Registry: $CONTAINER_REGISTRY"
echo ""

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    echo "❌ Azure CLI is not installed. Please install it first:"
    echo "   brew install azure-cli"
    exit 1
fi

# Check if logged in to Azure
if ! az account show &> /dev/null; then
    echo "🔐 Please log in to Azure first..."
    az login
fi

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

echo "✅ Prerequisites are ready"

# Create resource group if it doesn't exist
echo "📁 Creating resource group..."
az group create --name $RESOURCE_GROUP --location $LOCATION --output none || true

# Create Azure Container Registry if it doesn't exist
echo "🏗️  Creating Azure Container Registry..."
az acr create \
    --name $CONTAINER_REGISTRY \
    --resource-group $RESOURCE_GROUP \
    --location $LOCATION \
    --sku Basic \
    --admin-enabled true \
    --output none || true

# Get ACR login server
ACR_LOGIN_SERVER=$(az acr show --name $CONTAINER_REGISTRY --resource-group $RESOURCE_GROUP --query loginServer --output tsv)
echo "🔗 ACR Login Server: $ACR_LOGIN_SERVER"

# Login to ACR
echo "🔐 Logging into Azure Container Registry..."
az acr login --name $CONTAINER_REGISTRY

# Build and tag the image
echo "🏗️  Building Docker image..."
docker build -t $IMAGE_NAME:$TAG .

# Tag for ACR
docker tag $IMAGE_NAME:$TAG $ACR_LOGIN_SERVER/$IMAGE_NAME:$TAG

# Push to ACR
echo "📤 Pushing image to Azure Container Registry..."
docker push $ACR_LOGIN_SERVER/$IMAGE_NAME:$TAG

# Get ACR credentials
ACR_USERNAME=$(az acr credential show --name $CONTAINER_REGISTRY --query username --output tsv)
ACR_PASSWORD=$(az acr credential show --name $CONTAINER_REGISTRY --query "passwords[0].value" --output tsv)

# Deploy to Azure Container Instances
echo "🚀 Deploying to Azure Container Instances..."
az container create \
    --name $APP_NAME \
    --resource-group $RESOURCE_GROUP \
    --location $LOCATION \
    --image $ACR_LOGIN_SERVER/$IMAGE_NAME:$TAG \
    --registry-login-server $ACR_LOGIN_SERVER \
    --registry-username $ACR_USERNAME \
    --registry-password $ACR_PASSWORD \
    --dns-name-label $APP_NAME \
    --ports 80 \
    --os-type Linux \
    --cpu 1 \
    --memory 1.5 \
    --environment-variables \
        NODE_ENV=production \
        USE_POSTGRES=true \
        DATABASE_URL="postgresql://${DB_USERNAME}:${DB_PASSWORD}@${DB_SERVER_NAME}.postgres.database.azure.com:5432/${DB_NAME}?sslmode=require" \
        PORT=80 \
        R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
        R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
        R2_ENDPOINT="$R2_ENDPOINT" \
        R2_BUCKET="$R2_BUCKET" \
        USE_R2_STORAGE=true \
    --secure-environment-variables \
        OPENAI_API_KEY="${OPENAI_API_KEY:-your_openai_api_key}" \
        ELEVENLABS_API_KEY="${ELEVENLABS_API_KEY:-your_elevenlabs_api_key}" \
    --restart-policy Always \
    --output none

# Get the container instance details
CONTAINER_FQDN=$(az container show --name $APP_NAME --resource-group $RESOURCE_GROUP --query ipAddress.fqdn --output tsv)
CONTAINER_IP=$(az container show --name $APP_NAME --resource-group $RESOURCE_GROUP --query ipAddress.ip --output tsv)

echo ""
echo "✅ Deployment completed!"
echo ""
echo "🌐 Your app is available at:"
echo "   HTTP:  http://$CONTAINER_FQDN"
echo "   IP:    http://$CONTAINER_IP"
echo ""
echo "📋 Container details:"
echo "   Name: $APP_NAME"
echo "   Resource Group: $RESOURCE_GROUP"
echo "   Image: $ACR_LOGIN_SERVER/$IMAGE_NAME:$TAG"
echo ""
echo "🔧 To view logs:"
echo "   az container logs --name $APP_NAME --resource-group $RESOURCE_GROUP"
echo ""
echo "🔄 To restart the container:"
echo "   az container restart --name $APP_NAME --resource-group $RESOURCE_GROUP"
echo ""
echo "🗑️  To delete the container:"
echo "   az container delete --name $APP_NAME --resource-group $RESOURCE_GROUP --yes"
echo ""
echo "⚠️  Note: Set your API keys as environment variables before running:"
echo "   export OPENAI_API_KEY='your_actual_key'"
echo "   export ELEVENLABS_API_KEY='your_actual_key'"
echo ""
echo "🎉 TheReader is ready to help people with dyslexia!"