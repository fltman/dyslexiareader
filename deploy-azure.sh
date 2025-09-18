#!/bin/bash

# TheReader Azure Deployment Script
# This script deploys the app to Azure App Service with PostgreSQL

set -e  # Exit on any error

echo "🚀 Starting Azure deployment for TheReader..."

# Configuration
APP_NAME="thereader-app-$(date +%s)"
RESOURCE_GROUP="thereader-rg-$(date +%s)"
LOCATION="eastus"
NODE_VERSION="20-lts"
SKU="F1"  # Free tier - smallest machine

# Database configuration - Set these environment variables before running
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
echo "  Database: $DB_NAME"
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

echo "✅ Azure CLI is ready"

# Create resource group if it doesn't exist
echo "📁 Creating resource group..."
az group create --name $RESOURCE_GROUP --location $LOCATION --output none || true

# Create App Service plan if it doesn't exist
echo "📊 Creating App Service plan..."
az appservice plan create \
    --name "${APP_NAME}-plan" \
    --resource-group $RESOURCE_GROUP \
    --location $LOCATION \
    --sku $SKU \
    --is-linux \
    --output none || true

# Create the web app
echo "🌐 Creating web app..."
az webapp create \
    --name $APP_NAME \
    --resource-group $RESOURCE_GROUP \
    --plan "${APP_NAME}-plan" \
    --runtime "NODE|$NODE_VERSION" \
    --output none || true

# Get the app URL
APP_URL="https://${APP_NAME}.azurewebsites.net"
echo "🔗 App URL will be: $APP_URL"

# Configure app settings
echo "⚙️  Configuring app settings..."
az webapp config appsettings set \
    --name $APP_NAME \
    --resource-group $RESOURCE_GROUP \
    --settings \
        NODE_ENV=production \
        USE_POSTGRES=true \
        DATABASE_URL="postgresql://${DB_USERNAME}:${DB_PASSWORD}@${DB_SERVER_NAME}.postgres.database.azure.com:5432/${DB_NAME}?sslmode=require" \
        EXTERNAL_URL="$APP_URL" \
        PORT=80 \
        WEBSITE_NODE_DEFAULT_VERSION="~18" \
        R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
        R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
        R2_ENDPOINT="$R2_ENDPOINT" \
        R2_BUCKET="$R2_BUCKET" \
        USE_R2_STORAGE=true \
    --output none

echo "🔑 Please set your API keys in the Azure portal:"
echo "   - OPENAI_API_KEY"
echo "   - ELEVENLABS_API_KEY"

# Build the client
echo "🏗️  Building React client..."
cd client
npm install --silent
npm run build
cd ..

# Prepare deployment files
echo "📦 Preparing deployment package..."
rm -rf .git/azure-deploy 2>/dev/null || true
mkdir -p .git/azure-deploy

# Copy necessary files for deployment
cp -r server .git/azure-deploy/
cp -r client/dist .git/azure-deploy/client/
cp package.json .git/azure-deploy/
cp web.config .git/azure-deploy/
cp .deployment .git/azure-deploy/
cp deploy.cmd .git/azure-deploy/

# Copy database files
cp server/database-unified.js .git/azure-deploy/server/

# Create a simple server start file for Azure
cat > .git/azure-deploy/server.js << 'EOF'
// Azure App Service entry point
import('./server/index.js').catch(console.error);
EOF

# Update package.json for Azure
cat > .git/azure-deploy/package.json << EOF
{
  "name": "thereader",
  "version": "1.0.0",
  "description": "The ultimate reader for people with dyslexia",
  "main": "server.js",
  "type": "module",
  "scripts": {
    "start": "node server.js"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "dependencies": {
    "@aws-sdk/client-s3": "^3.456.0",
    "@aws-sdk/lib-storage": "^3.456.0",
    "@elevenlabs/elevenlabs-js": "^2.15.0",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "express": "^4.18.2",
    "image-size": "^2.0.2",
    "multer": "^2.0.2",
    "openai": "^5.21.0",
    "pg": "^8.16.3",
    "qrcode": "^1.5.4",
    "sqlite3": "^5.1.7",
    "uuid": "^13.0.0"
  }
}
EOF

# Deploy using Azure CLI
echo "🚀 Deploying to Azure..."
cd .git/azure-deploy

# Create a temporary git repo for deployment
git init --quiet
git add .
git commit -m "Azure deployment" --quiet

# Deploy
az webapp deployment source config-local-git \
    --name $APP_NAME \
    --resource-group $RESOURCE_GROUP \
    --output none

# Get deployment URL
DEPLOY_URL=$(az webapp deployment source show \
    --name $APP_NAME \
    --resource-group $RESOURCE_GROUP \
    --query "repoUrl" --output tsv)

# Add Azure as remote and push
git remote add azure $DEPLOY_URL
git push azure main --force --quiet

cd ../..

# Clean up
rm -rf .git/azure-deploy

echo ""
echo "✅ Deployment completed!"
echo ""
echo "🌐 Your app is available at: $APP_URL"
echo ""
echo "⚠️  Next steps:"
echo "1. Go to Azure Portal: https://portal.azure.com"
echo "2. Navigate to your app: $APP_NAME"
echo "3. Go to Configuration > Application settings"
echo "4. Add your API keys:"
echo "   - OPENAI_API_KEY=your_actual_key"
echo "   - ELEVENLABS_API_KEY=your_actual_key"
echo "5. Save and restart the app"
echo ""
echo "🎉 TheReader is ready to help people with dyslexia!"