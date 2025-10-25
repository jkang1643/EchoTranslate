# Quick Start: AWS Deployment

Get your EchoTranslate app running on AWS in ~30 minutes!

## Prerequisites

✅ AWS Account  
✅ AWS CLI installed and configured (`aws configure`)  
✅ SSH key pair for EC2 access  
✅ OpenAI API Key  
✅ Google Cloud Speech API Key  

## 🚀 5-Step Deployment

### Step 1: Launch EC2 Instance (5 min)

1. Go to AWS Console → EC2 → Launch Instance
2. Choose: **Ubuntu Server 22.04 LTS**
3. Instance type: **t3.small**
4. Create security group with these ports:
   - SSH (22) - Your IP
   - HTTP (80) - Anywhere
   - HTTPS (443) - Anywhere
   - Custom TCP (3001) - Anywhere
5. Launch and allocate **Elastic IP**
6. Note your EC2 IP: `_________________`

### Step 2: Setup Backend on EC2 (10 min)

```bash
# 1. SSH to EC2
ssh -i your-key.pem ubuntu@YOUR_EC2_IP

# 2. Upload setup script (from your local machine)
scp -i your-key.pem setup-ec2.sh ubuntu@YOUR_EC2_IP:~/

# 3. Run setup script (on EC2)
chmod +x setup-ec2.sh
./setup-ec2.sh

# 4. Configure API keys (on EC2)
cd /home/ubuntu/realtimetranslationapp/backend
nano .env

# Add your keys:
# OPENAI_API_KEY=sk-your-key-here
# GOOGLE_SPEECH_API_KEY=your-key-here

# 5. Start backend (on EC2)
pm2 start server.js --name echotranslate-backend
pm2 save

# 6. Test (on EC2)
curl http://localhost:3001/health
```

✅ **Backend running!** → `http://YOUR_EC2_IP`

### Step 3: Create S3 Bucket (2 min)

```bash
# On your local machine
export BUCKET_NAME="echotranslate-frontend-$(date +%s)"

# Create bucket
aws s3 mb s3://${BUCKET_NAME} --region us-east-1

# Enable website hosting
aws s3 website s3://${BUCKET_NAME} \
  --index-document index.html \
  --error-document index.html

# Make public
cat > /tmp/bucket-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicReadGetObject",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::${BUCKET_NAME}/*"
  }]
}
EOF

aws s3api put-bucket-policy \
  --bucket ${BUCKET_NAME} \
  --policy file:///tmp/bucket-policy.json

echo "✅ Bucket created: ${BUCKET_NAME}"
```

### Step 4: Deploy Frontend (5 min)

**Option A: Using Script (Linux/Mac)**
```bash
# On your local machine
chmod +x deploy-frontend.sh
./deploy-frontend.sh

# Enter when prompted:
# - S3 bucket name: echotranslate-frontend-XXXXX
# - CloudFront ID: (skip for now)
# - Backend URL: YOUR_EC2_IP
```

**Option B: Using Script (Windows)**
```cmd
deploy-frontend.bat

REM Enter when prompted:
REM - S3 bucket name: echotranslate-frontend-XXXXX
REM - CloudFront ID: (skip for now)
REM - Backend URL: YOUR_EC2_IP
```

**Option C: Manual**
```bash
cd frontend

# Create env
cat > .env.production << EOF
VITE_API_URL=http://YOUR_EC2_IP
VITE_WS_URL=ws://YOUR_EC2_IP/translate
EOF

# Build and deploy
npm install
npm run build
aws s3 sync dist/ s3://${BUCKET_NAME}/ --delete
```

✅ **Frontend deployed!** → `http://${BUCKET_NAME}.s3-website-us-east-1.amazonaws.com`

### Step 5: Setup CloudFront (8 min)

1. Go to AWS Console → CloudFront → Create Distribution
2. **Origin Domain**: Select your S3 bucket **(use website endpoint)**
3. **Origin Protocol**: HTTP only
4. **Viewer Protocol Policy**: Redirect HTTP to HTTPS
5. **Compress Objects**: Yes
6. **Custom Error Responses**:
   - Error Code: **404**
   - Response Page: **/index.html**
   - Response Code: **200**
7. Click **Create Distribution**
8. Wait 5-10 minutes for deployment
9. Note your CloudFront domain: `https://d1234abcd.cloudfront.net`

✅ **Done!** → Access your app at the CloudFront URL

## 🧪 Test Your Deployment

1. **Open CloudFront URL** in browser
2. **Try Demo Mode**: Test translation without microphone
3. **Try Solo Mode**: Test with microphone
4. **Try Host Mode**: Create a session and test live streaming
5. **Check Console**: Look for any errors

### Quick Tests

```bash
# Test backend health
curl http://YOUR_EC2_IP/health

# Test translation API
curl -X POST http://YOUR_EC2_IP/test-translation \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello","sourceLang":"en","targetLang":"es"}'

# Test WebSocket (install wscat: npm i -g wscat)
wscat -c ws://YOUR_EC2_IP/translate
```

## 🔧 Common Issues

### Backend not accessible
```bash
# On EC2, check status
pm2 status
pm2 logs echotranslate-backend

# Check if port is open
curl http://localhost:3001/health

# Check firewall
sudo ufw status
```

### WebSocket fails to connect
- Check Security Group allows port 3001
- Verify CORS is configured for CloudFront domain
- Test with HTTP (not HTTPS) first

### Frontend shows old version
```bash
# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id YOUR_DIST_ID \
  --paths "/*"
```

## 📊 Your Deployment Info

Fill this out for quick reference:

```
EC2 Instance ID:    _________________
EC2 Public IP:      _________________
Elastic IP:         _________________
S3 Bucket:          _________________
CloudFront Domain:  _________________
CloudFront ID:      _________________

Backend URL:        http://YOUR_EC2_IP
Frontend URL:       https://YOUR_CF_DOMAIN
WebSocket URL:      ws://YOUR_EC2_IP/translate
```

## 🔄 Future Updates

### Update Backend
```bash
# SSH to EC2
ssh -i your-key.pem ubuntu@YOUR_EC2_IP

# Run update script
cd /home/ubuntu/realtimetranslationapp/backend
./deploy-backend.sh
```

### Update Frontend
```bash
# On your local machine
./deploy-frontend.sh
# Or: deploy-frontend.bat (Windows)
```

## 💰 Estimated Costs

- **EC2 t3.small**: ~$15/month
- **S3 + CloudFront**: ~$2/month (low traffic)
- **Data Transfer**: ~$5/month (moderate usage)
- **Total**: ~$20-25/month

## 📚 More Information

- **Full Guide**: See `AWS_DEPLOYMENT_GUIDE.md` for detailed instructions
- **Architecture**: See `DUAL_SERVICE_ARCHITECTURE.md` for system design
- **API Setup**: See `QUICKSTART_OPENAI.md` and `QUICKSTART_GOOGLE_APIKEY.md`

## 🆘 Need Help?

1. Check logs: `pm2 logs echotranslate-backend`
2. Test health: `curl http://YOUR_EC2_IP/health`
3. Verify API keys in `.env`
4. Check Security Group rules
5. Review `AWS_DEPLOYMENT_GUIDE.md` troubleshooting section

---

**🎉 Congratulations! Your app is live on AWS!**

