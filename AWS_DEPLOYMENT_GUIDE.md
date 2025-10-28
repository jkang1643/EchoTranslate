# AWS Deployment Guide - Exbabel

This guide will help you deploy Exbabel to AWS with:
- **Frontend**: S3 + CloudFront (for fast global delivery)
- **Backend**: EC2 (for WebSocket support)

## Prerequisites

- AWS Account with appropriate permissions
- AWS CLI installed and configured (`aws configure`)
- Node.js 18+ installed locally
- Domain name (optional but recommended)

## Architecture Overview

```
┌──────────────┐
│    Users     │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────┐
│   CloudFront CDN             │
│   (Static Assets)            │
└──────┬───────────────────────┘
       │
       ├─────────► ┌──────────────────┐
       │           │   S3 Bucket      │
       │           │   (Frontend)     │
       │           └──────────────────┘
       │
       └─────────► ┌──────────────────┐
                   │   EC2 Instance   │
                   │   (Backend API   │
                   │   + WebSocket)   │
                   └──────────────────┘
```

## Part 1: Backend Deployment (EC2)

### Step 1.1: Launch EC2 Instance

1. **Launch an EC2 instance:**
   - **AMI**: Amazon Linux 2023
   - **Instance Type**: `t3.small` or `t3.medium` (depending on expected traffic)
   - **Storage**: 20 GB gp3
   - **Security Group**: Create with these inbound rules:
     - SSH (22) from your IP
     - HTTP (80) from anywhere (0.0.0.0/0)
     - HTTPS (443) from anywhere (0.0.0.0/0)
     - Custom TCP (3001) from anywhere (0.0.0.0/0) - for WebSocket

2. **Allocate an Elastic IP:**
   - Go to EC2 → Elastic IPs
   - Allocate new address
   - Associate with your EC2 instance
   - Note this IP address (we'll call it `<EC2_PUBLIC_IP>`)

### Step 1.2: Connect and Setup EC2

```bash
# SSH into your EC2 instance
ssh -i your-key.pem ec2-user@<EC2_PUBLIC_IP>

# Update system
sudo dnf update -y

# Install Node.js 18+
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo dnf install -y nodejs

# Install PM2 (process manager)
sudo npm install -g pm2

# Install git (usually pre-installed)
sudo dnf install -y git

# Clone your repository (or upload files)
cd /home/ec2-user
git clone <your-repo-url> realtimetranslationapp
cd realtimetranslationapp/backend

# Install dependencies
npm install
```

### Step 1.3: Configure Environment Variables

```bash
# Create .env file
cd /home/ec2-user/realtimetranslationapp/backend
nano .env
```

Add the following (replace with your actual keys):

```env
# OpenAI API Key (required for translation)
OPENAI_API_KEY=sk-your-openai-api-key-here

# Google Cloud Speech API Key (required for transcription)
GOOGLE_SPEECH_API_KEY=your-google-api-key-here

# Or use Service Account JSON (more secure)
# GOOGLE_APPLICATION_CREDENTIALS=/home/ec2-user/realtimetranslationapp/backend/google-credentials.json

# Server Configuration
PORT=3001
NODE_ENV=production
```

**Important**: If using Google Service Account JSON:
```bash
# Upload your credentials file
nano /home/ec2-user/realtimetranslationapp/backend/google-credentials.json
# Paste your JSON content and save

# Set permissions
chmod 600 /home/ec2-user/realtimetranslationapp/backend/google-credentials.json
```

### Step 1.4: Setup Nginx Reverse Proxy (Optional but Recommended)

This allows you to use port 80/443 instead of 3001 and adds SSL support.

```bash
# Install Nginx
sudo dnf install -y nginx

# Create Nginx configuration
sudo nano /etc/nginx/conf.d/exbabel.conf
```

Paste this configuration:

```nginx
# WebSocket upgrade headers
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

server {
    listen 80;
    server_name <EC2_PUBLIC_IP>; # Or your domain name

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
```

Enable and start Nginx:

```bash
# Test configuration
sudo nginx -t

# Start and enable Nginx
sudo systemctl start nginx
sudo systemctl enable nginx
sudo systemctl restart nginx
```

### Step 1.5: Start Backend with PM2

```bash
cd /home/ec2-user/realtimetranslationapp/backend

# Start application with PM2
pm2 start server.js --name exbabel-backend

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup systemd
# Copy and run the command it outputs

# Check status
pm2 status
pm2 logs exbabel-backend
```

### Step 1.6: Test Backend

```bash
# Test health endpoint
curl http://localhost:3001/health

# Or from your local machine
curl http://<EC2_PUBLIC_IP>/health
```

You should see a JSON response with service status.

## Part 2: Frontend Deployment (S3 + CloudFront)

### Step 2.1: Build Frontend

On your **local machine**:

```bash
cd frontend

# Create production environment file
cat > .env.production << EOF
# Backend API URL (HTTP)
VITE_API_URL=http://<EC2_PUBLIC_IP>

# Backend WebSocket URL
VITE_WS_URL=ws://<EC2_PUBLIC_IP>/translate
EOF

# If using Nginx on port 80, use:
# VITE_WS_URL=ws://<EC2_PUBLIC_IP>/translate

# If using domain with SSL, use:
# VITE_API_URL=https://api.yourdomain.com
# VITE_WS_URL=wss://api.yourdomain.com/translate

# Install dependencies
npm install

# Build for production
npm run build
```

This creates an optimized build in `frontend/dist/`.

### Step 2.2: Create S3 Bucket

```bash
# Set your bucket name (must be globally unique)
BUCKET_NAME="exbabel-frontend-$(date +%s)"

# Create bucket
aws s3 mb s3://${BUCKET_NAME} --region us-east-1

# Enable static website hosting
aws s3 website s3://${BUCKET_NAME} \
  --index-document index.html \
  --error-document index.html

# Create bucket policy for public read access
cat > /tmp/bucket-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::${BUCKET_NAME}/*"
    }
  ]
}
EOF

# Apply bucket policy
aws s3api put-bucket-policy \
  --bucket ${BUCKET_NAME} \
  --policy file:///tmp/bucket-policy.json
```

### Step 2.3: Upload Frontend to S3

```bash
# From your local machine, in the project root
cd frontend

# Upload build to S3
aws s3 sync dist/ s3://${BUCKET_NAME}/ \
  --delete \
  --cache-control "public, max-age=31536000" \
  --exclude "*.html" \
  --exclude "service-worker.js"

# Upload HTML files with shorter cache (for updates)
aws s3 sync dist/ s3://${BUCKET_NAME}/ \
  --exclude "*" \
  --include "*.html" \
  --cache-control "public, max-age=0, must-revalidate"

echo "S3 Website URL: http://${BUCKET_NAME}.s3-website-us-east-1.amazonaws.com"
```

### Step 2.4: Create CloudFront Distribution

```bash
# Create CloudFront distribution
cat > /tmp/cloudfront-config.json << EOF
{
  "CallerReference": "exbabel-$(date +%s)",
  "Comment": "Exbabel Frontend Distribution",
  "Enabled": true,
  "Origins": {
    "Quantity": 1,
    "Items": [
      {
        "Id": "S3-${BUCKET_NAME}",
        "DomainName": "${BUCKET_NAME}.s3-website-us-east-1.amazonaws.com",
        "CustomOriginConfig": {
          "HTTPPort": 80,
          "HTTPSPort": 443,
          "OriginProtocolPolicy": "http-only"
        }
      }
    ]
  },
  "DefaultRootObject": "index.html",
  "DefaultCacheBehavior": {
    "TargetOriginId": "S3-${BUCKET_NAME}",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {
      "Quantity": 2,
      "Items": ["GET", "HEAD"]
    },
    "ForwardedValues": {
      "QueryString": false,
      "Cookies": { "Forward": "none" }
    },
    "MinTTL": 0,
    "DefaultTTL": 86400,
    "MaxTTL": 31536000,
    "Compress": true
  },
  "CustomErrorResponses": {
    "Quantity": 1,
    "Items": [
      {
        "ErrorCode": 404,
        "ResponsePagePath": "/index.html",
        "ResponseCode": "200",
        "ErrorCachingMinTTL": 300
      }
    ]
  }
}
EOF

aws cloudfront create-distribution \
  --distribution-config file:///tmp/cloudfront-config.json
```

Alternatively, create via AWS Console:
1. Go to CloudFront → Create Distribution
2. **Origin Domain**: Select your S3 bucket (website endpoint)
3. **Viewer Protocol Policy**: Redirect HTTP to HTTPS
4. **Allowed HTTP Methods**: GET, HEAD
5. **Compress Objects**: Yes
6. **Custom Error Response**: 
   - Error Code: 404
   - Response Page Path: /index.html
   - HTTP Response Code: 200
7. Click "Create Distribution"

**Note the CloudFront domain name** (e.g., `d1234abcd.cloudfront.net`)

### Step 2.5: Update CORS on Backend

SSH back to your EC2 instance and update CORS to allow CloudFront:

```bash
ssh -i your-key.pem ec2-user@<EC2_PUBLIC_IP>
cd /home/ec2-user/realtimetranslationapp/backend
nano server.js
```

Find the CORS configuration and update:

```javascript
// Update CORS configuration
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://d1234abcd.cloudfront.net', // Your CloudFront domain
    'https://yourdomain.com' // Your custom domain if applicable
  ],
  credentials: true
}));
```

Restart backend:
```bash
pm2 restart exbabel-backend
```

## Part 3: Custom Domain Setup (Optional)

### Step 3.1: Request SSL Certificate

```bash
# Request certificate in us-east-1 (required for CloudFront)
aws acm request-certificate \
  --domain-name yourdomain.com \
  --domain-name www.yourdomain.com \
  --validation-method DNS \
  --region us-east-1
```

Follow email/DNS validation instructions.

### Step 3.2: Update CloudFront Distribution

1. Go to CloudFront → Your Distribution → Edit
2. **Alternate Domain Names (CNAMEs)**: Add `yourdomain.com`, `www.yourdomain.com`
3. **SSL Certificate**: Select your ACM certificate
4. Save changes

### Step 3.3: Update DNS

Add these records to your domain's DNS:

```
Type    Name              Value
A       @                 (CloudFront IPv4 - use alias)
A       www               (CloudFront IPv4 - use alias)
CNAME   api               <EC2_PUBLIC_IP>
```

Or if using Route 53:
```bash
# Create A record alias for root domain
aws route53 change-resource-record-sets \
  --hosted-zone-id <YOUR_ZONE_ID> \
  --change-batch file://dns-config.json
```

## Part 4: Testing Deployment

### Test Backend

```bash
# Health check
curl http://<EC2_PUBLIC_IP>/health

# Test translation endpoint
curl -X POST http://<EC2_PUBLIC_IP>/test-translation \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello world","sourceLang":"en","targetLang":"es"}'
```

### Test Frontend

1. Open CloudFront URL: `https://d1234abcd.cloudfront.net`
2. Try the demo mode to test translation
3. Test live translation with microphone
4. Check browser console for errors

### Test WebSocket Connection

Open browser console and run:

```javascript
const ws = new WebSocket('ws://<EC2_PUBLIC_IP>/translate');
ws.onopen = () => console.log('Connected!');
ws.onerror = (e) => console.error('Error:', e);
```

## Part 5: Monitoring and Maintenance

### Backend Monitoring

```bash
# View logs
pm2 logs exbabel-backend

# View status
pm2 status

# Restart backend
pm2 restart exbabel-backend

# View Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Frontend Updates

```bash
# Rebuild frontend
cd frontend
npm run build

# Upload to S3
aws s3 sync dist/ s3://${BUCKET_NAME}/ --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id <DISTRIBUTION_ID> \
  --paths "/*"
```

### Backend Updates

```bash
# SSH to EC2
ssh -i your-key.pem ec2-user@<EC2_PUBLIC_IP>

# Pull latest code
cd /home/ec2-user/realtimetranslationapp/backend
git pull

# Install new dependencies
npm install

# Restart
pm2 restart exbabel-backend
```

## Part 6: Cost Optimization

### Estimated Monthly Costs

- **EC2 t3.small**: ~$15/month
- **S3 Storage**: ~$0.50/month (for small site)
- **CloudFront**: ~$1/month (for light traffic)
- **Data Transfer**: Variable based on usage
- **Total**: ~$20-30/month

### Optimization Tips

1. **Use Spot Instances** for EC2 (save 70%)
2. **Enable CloudFront compression**
3. **Set proper S3 lifecycle policies**
4. **Monitor with AWS Cost Explorer**

## Part 7: Security Best Practices

### Backend Security

```bash
# Enable and configure firewall
sudo systemctl start firewalld
sudo systemctl enable firewalld

# Allow SSH, HTTP, HTTPS
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload

# Setup fail2ban for SSH
sudo dnf install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# Regular updates
sudo dnf update -y
```

### Environment Variables

- Never commit `.env` files
- Use AWS Secrets Manager for sensitive data (advanced)
- Rotate API keys regularly

### SSL/TLS

- Always use HTTPS in production
- Setup SSL with Let's Encrypt (if using custom domain)
- Use AWS Certificate Manager for CloudFront

## Part 8: Scaling

### When to Scale

- Backend CPU > 70% consistently
- Response times > 2 seconds
- WebSocket disconnections
- Multiple concurrent users (50+)

### Scaling Options

1. **Vertical Scaling**: Upgrade EC2 instance type
2. **Horizontal Scaling**: 
   - Use Application Load Balancer
   - Multiple EC2 instances
   - Session persistence required for WebSockets
3. **Auto Scaling**: Configure Auto Scaling Groups

## Troubleshooting

### WebSocket Connection Fails

1. Check security group allows port 3001 (or 80/443)
2. Verify Nginx WebSocket configuration
3. Check CORS settings
4. Test with `wscat -c ws://<EC2_PUBLIC_IP>/translate`

### CloudFront Shows Old Content

```bash
# Invalidate cache
aws cloudfront create-invalidation \
  --distribution-id <DISTRIBUTION_ID> \
  --paths "/*"
```

### Backend Crashes

```bash
# Check logs
pm2 logs exbabel-backend --lines 100

# Check system resources
htop
df -h
free -h
```

### API Keys Not Working

1. Verify `.env` file exists and has correct values
2. Restart backend: `pm2 restart exbabel-backend`
3. Check environment: `pm2 env exbabel-backend`

## Quick Reference Commands

```bash
# Backend
pm2 status
pm2 logs exbabel-backend
pm2 restart exbabel-backend

# Nginx
sudo systemctl status nginx
sudo systemctl restart nginx
sudo nginx -t

# Frontend Deploy
cd frontend && npm run build
aws s3 sync dist/ s3://${BUCKET_NAME}/ --delete
aws cloudfront create-invalidation --distribution-id <ID> --paths "/*"

# Logs
pm2 logs
sudo tail -f /var/log/nginx/error.log
```

## Support

For issues:
1. Check logs: `pm2 logs exbabel-backend`
2. Verify API keys are set correctly
3. Test backend health: `curl http://<EC2_PUBLIC_IP>/health`
4. Check AWS CloudWatch for detailed metrics

---

**Deployment Complete! 🚀**

Your app should now be live at:
- Frontend: `https://<cloudfront-domain>.cloudfront.net`
- Backend: `http://<EC2_PUBLIC_IP>`
- WebSocket: `ws://<EC2_PUBLIC_IP>/translate`

