#!/bin/bash
# Family Finance — סקריפט Deploy
# להריץ אחרי כל עדכון קוד: bash /root/deploy.sh

set -e
echo "🚀 Starting deployment..."

cd /root/family-finance

echo "📥 Pulling latest code..."
git pull

echo "📦 Installing dependencies..."
npm install

echo "🔨 Building application..."
NODE_OPTIONS="--dns-result-order=ipv4first" npm run build

echo "📁 Copying static files..."
mkdir -p .next/standalone/.next/static
cp -r .next/static/* .next/standalone/.next/static/
cp -r public .next/standalone/public 2>/dev/null || true
cp .env .next/standalone/.env

echo "🔄 Restarting server..."
pm2 stop family-finance 2>/dev/null || true
pm2 delete family-finance 2>/dev/null || true
cd .next/standalone
NODE_OPTIONS="--dns-result-order=ipv4first" pm2 start server.js --name "family-finance"
pm2 flush
pm2 save

echo ""
echo "✅ Deployment complete!"
echo "🌐 https://osadchi-systems.com"
echo ""
echo "📋 Quick check:"
pm2 status
