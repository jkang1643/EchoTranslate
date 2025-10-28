#!/bin/bash

# Exbabel - EC2 Initial Setup Script
# Run this script ONCE on a new EC2 instance to set up everything

set -e  # Exit on error

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Exbabel EC2 Setup${NC}"
echo -e "${GREEN}========================================${NC}"

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
    echo -e "${RED}❌ Please run as ubuntu user, not root${NC}"
    exit 1
fi

# Update system
echo -e "\n${YELLOW}📦 Updating system packages...${NC}"
sudo apt update
sudo apt upgrade -y

# Install Node.js 18
echo -e "\n${YELLOW}📦 Installing Node.js 18...${NC}"
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt install -y nodejs
    echo -e "${GREEN}✅ Node.js installed: $(node --version)${NC}"
else
    echo -e "${GREEN}✅ Node.js already installed: $(node --version)${NC}"
fi

# Install PM2
echo -e "\n${YELLOW}📦 Installing PM2 process manager...${NC}"
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
    echo -e "${GREEN}✅ PM2 installed${NC}"
else
    echo -e "${GREEN}✅ PM2 already installed${NC}"
fi

# Install Git
echo -e "\n${YELLOW}📦 Installing Git...${NC}"
sudo apt install -y git

# Install Nginx
echo -e "\n${YELLOW}📦 Installing Nginx...${NC}"
if ! command -v nginx &> /dev/null; then
    sudo apt install -y nginx
    echo -e "${GREEN}✅ Nginx installed${NC}"
else
    echo -e "${GREEN}✅ Nginx already installed${NC}"
fi

# Install other utilities
echo -e "\n${YELLOW}📦 Installing utilities...${NC}"
sudo apt install -y htop curl wget unzip

# Setup firewall
echo -e "\n${YELLOW}🔒 Configuring firewall...${NC}"
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw allow 3001/tcp
echo "y" | sudo ufw enable || true
echo -e "${GREEN}✅ Firewall configured${NC}"

# Clone repository
echo -e "\n${YELLOW}📥 Cloning repository...${NC}"
cd /home/ubuntu

if [ -d "realtimetranslationapp" ]; then
    echo -e "${YELLOW}⚠️  Directory already exists. Skipping clone.${NC}"
else
    read -p "Enter your git repository URL (or press Enter to skip): " REPO_URL
    
    if [ ! -z "$REPO_URL" ]; then
        git clone "$REPO_URL" realtimetranslationapp
        echo -e "${GREEN}✅ Repository cloned${NC}"
    else
        echo -e "${YELLOW}⚠️  Skipping git clone. You'll need to upload files manually.${NC}"
        mkdir -p realtimetranslationapp/backend
    fi
fi

# Install backend dependencies
echo -e "\n${YELLOW}📦 Installing backend dependencies...${NC}"
cd /home/ubuntu/realtimetranslationapp/backend

if [ -f "package.json" ]; then
    npm install
    echo -e "${GREEN}✅ Backend dependencies installed${NC}"
else
    echo -e "${RED}❌ package.json not found. Please upload backend files first.${NC}"
fi

# Create .env template
echo -e "\n${YELLOW}📝 Creating .env template...${NC}"
if [ ! -f ".env" ]; then
    cat > .env << 'EOF'
# OpenAI API Key (required for translation)
OPENAI_API_KEY=your-openai-api-key-here

# Google Cloud Speech API Key (required for transcription)
GOOGLE_SPEECH_API_KEY=your-google-api-key-here

# Or use Service Account JSON (more secure)
# GOOGLE_APPLICATION_CREDENTIALS=/home/ubuntu/realtimetranslationapp/backend/google-credentials.json

# Server Configuration
PORT=3001
NODE_ENV=production
EOF
    echo -e "${GREEN}✅ .env template created${NC}"
    echo -e "${RED}⚠️  IMPORTANT: Edit .env file with your actual API keys:${NC}"
    echo -e "   nano /home/ubuntu/realtimetranslationapp/backend/.env"
else
    echo -e "${GREEN}✅ .env file already exists${NC}"
fi

# Setup Nginx
echo -e "\n${YELLOW}🔧 Configuring Nginx...${NC}"
sudo tee /etc/nginx/sites-available/exbabel > /dev/null << 'EOF'
# WebSocket upgrade headers
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    # Increase timeouts for WebSocket
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket specific
        proxy_buffering off;
        proxy_cache off;
    }
}
EOF

# Enable Nginx site
sudo ln -sf /etc/nginx/sites-available/exbabel /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
if sudo nginx -t; then
    sudo systemctl restart nginx
    echo -e "${GREEN}✅ Nginx configured and restarted${NC}"
else
    echo -e "${RED}❌ Nginx configuration error${NC}"
    exit 1
fi

# Setup PM2 startup
echo -e "\n${YELLOW}🚀 Configuring PM2 startup...${NC}"
pm2 startup systemd -u ubuntu --hp /home/ubuntu | grep -v "PM2" | sudo bash || true

# Get public IP
echo -e "\n${YELLOW}🌐 Getting public IP...${NC}"
PUBLIC_IP=$(curl -s http://checkip.amazonaws.com || echo "Unable to detect")

# Summary
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}✅ EC2 Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "\n${YELLOW}Next steps:${NC}"
echo -e "1. Edit .env file with your API keys:"
echo -e "   ${YELLOW}nano /home/ubuntu/realtimetranslationapp/backend/.env${NC}"
echo -e ""
echo -e "2. If using Google Service Account JSON, upload it:"
echo -e "   ${YELLOW}nano /home/ubuntu/realtimetranslationapp/backend/google-credentials.json${NC}"
echo -e ""
echo -e "3. Start the backend:"
echo -e "   ${YELLOW}cd /home/ubuntu/realtimetranslationapp/backend${NC}"
echo -e "   ${YELLOW}pm2 start server.js --name exbabel-backend${NC}"
echo -e "   ${YELLOW}pm2 save${NC}"
echo -e ""
echo -e "4. Test the backend:"
echo -e "   ${YELLOW}curl http://localhost:3001/health${NC}"
echo -e ""
echo -e "${GREEN}Your EC2 public IP: ${PUBLIC_IP}${NC}"
echo -e "Backend will be accessible at: ${GREEN}http://${PUBLIC_IP}${NC}"
echo -e "WebSocket endpoint: ${GREEN}ws://${PUBLIC_IP}/translate${NC}"
echo -e ""
echo -e "${YELLOW}📚 Full deployment guide: AWS_DEPLOYMENT_GUIDE.md${NC}"
echo -e ""

