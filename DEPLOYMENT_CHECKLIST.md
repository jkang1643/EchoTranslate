# AWS Deployment Checklist

Use this checklist to track your deployment progress. Check off each item as you complete it.

## Pre-Deployment

- [ ] AWS Account created and configured
- [ ] AWS CLI installed locally (`aws --version`)
- [ ] AWS CLI configured (`aws configure`)
- [ ] EC2 SSH key pair created and downloaded (.pem file)
- [ ] OpenAI API key obtained (https://platform.openai.com/api-keys)
- [ ] Google Cloud Speech API key obtained (https://console.cloud.google.com/apis/credentials)

## Part 1: Backend (EC2)

### EC2 Setup
- [ ] EC2 instance launched (Ubuntu 22.04, t3.small)
- [ ] Security group configured:
  - [ ] SSH (port 22) from your IP
  - [ ] HTTP (port 80) from anywhere
  - [ ] HTTPS (port 443) from anywhere
  - [ ] Custom TCP (port 3001) from anywhere
- [ ] Elastic IP allocated and associated
- [ ] EC2 Public IP noted: `___________________`

### Backend Configuration
- [ ] SSH connection to EC2 working
- [ ] System updated (`sudo apt update && sudo apt upgrade`)
- [ ] Node.js 18+ installed
- [ ] PM2 installed globally
- [ ] Git installed
- [ ] Nginx installed
- [ ] Code uploaded/cloned to EC2
- [ ] Dependencies installed (`npm install`)
- [ ] `.env` file created with API keys
- [ ] Google Service Account JSON uploaded (if using)

### Backend Deployment
- [ ] Backend started with PM2
- [ ] PM2 configured to start on boot (`pm2 save`, `pm2 startup`)
- [ ] Nginx configured for WebSocket proxy
- [ ] Nginx restarted
- [ ] Health check working: `curl http://localhost:3001/health`
- [ ] Health check working from internet: `curl http://YOUR_EC2_IP/health`

## Part 2: Frontend (S3 + CloudFront)

### S3 Setup
- [ ] S3 bucket created
- [ ] Bucket name noted: `___________________`
- [ ] Static website hosting enabled
- [ ] Bucket policy configured for public read
- [ ] S3 website URL accessible

### Frontend Build & Deploy
- [ ] `.env.production` created with correct EC2 IP
- [ ] Dependencies installed (`npm install`)
- [ ] Production build successful (`npm run build`)
- [ ] Build uploaded to S3 (`aws s3 sync dist/ s3://...`)
- [ ] S3 website URL working

### CloudFront Setup
- [ ] CloudFront distribution created
- [ ] Origin configured to S3 website endpoint
- [ ] HTTPS redirect enabled
- [ ] Compression enabled
- [ ] Custom error page (404 → index.html) configured
- [ ] Distribution deployed (Status: Deployed)
- [ ] CloudFront domain noted: `___________________`
- [ ] CloudFront distribution ID noted: `___________________`

## Part 3: Integration & Testing

### Backend CORS Update
- [ ] CloudFront domain added to CORS configuration
- [ ] Backend restarted after CORS update

### Application Testing
- [ ] CloudFront URL accessible in browser
- [ ] Home page loads correctly
- [ ] Demo mode works (text translation)
- [ ] Solo mode works (microphone access)
- [ ] Host mode works (create session)
- [ ] Listener mode works (join session)
- [ ] WebSocket connection successful
- [ ] No errors in browser console
- [ ] Translations working correctly
- [ ] Audio playback working (if applicable)

### Performance Testing
- [ ] Frontend loads quickly (< 3 seconds)
- [ ] Backend responds quickly (< 500ms)
- [ ] WebSocket connects instantly
- [ ] Translation latency acceptable (< 2 seconds)

## Part 4: Optional Enhancements

### Custom Domain (Optional)
- [ ] Domain registered
- [ ] SSL certificate requested in ACM (us-east-1)
- [ ] Certificate validated (DNS or email)
- [ ] CloudFront configured with custom domain
- [ ] DNS records updated (A/CNAME to CloudFront)
- [ ] Custom domain working with HTTPS

### SSL on Backend (Optional)
- [ ] Let's Encrypt installed (`certbot`)
- [ ] SSL certificate obtained
- [ ] Nginx configured for HTTPS
- [ ] Frontend updated to use `wss://` instead of `ws://`
- [ ] HTTPS working on backend

### Monitoring (Optional)
- [ ] CloudWatch alarms configured
- [ ] EC2 monitoring enabled
- [ ] Log aggregation setup
- [ ] Error tracking configured

## Part 5: Documentation

### Deployment Info Recorded
```
Deployment Date:        ___________________
EC2 Instance ID:        ___________________
EC2 Public IP:          ___________________
Elastic IP:             ___________________
S3 Bucket:              ___________________
CloudFront Domain:      ___________________
CloudFront ID:          ___________________
Custom Domain:          ___________________

URLs:
Frontend (CloudFront):  https://___________________
Backend API:            http://___________________
WebSocket:              ws://___________________/translate

SSH Command:            ssh -i _____.pem ubuntu@___________________
```

### Scripts & Files
- [ ] Deployment scripts saved locally
- [ ] `.env` files backed up securely (NOT in git)
- [ ] SSH key saved securely
- [ ] AWS credentials documented

## Part 6: Security

### Backend Security
- [ ] Firewall (UFW) enabled
- [ ] SSH key authentication only (password disabled)
- [ ] fail2ban installed and configured
- [ ] System updates automated
- [ ] API keys not exposed in frontend
- [ ] HTTPS enabled (if using custom domain)

### General Security
- [ ] `.env` files in `.gitignore`
- [ ] No API keys in source code
- [ ] Security group rules minimal (least privilege)
- [ ] EC2 instance in private subnet (advanced)
- [ ] Backup strategy defined

## Part 7: Maintenance

### Regular Tasks Scheduled
- [ ] Weekly backend updates planned
- [ ] Monthly dependency updates planned
- [ ] Regular backups scheduled
- [ ] Cost monitoring setup
- [ ] Log rotation configured

### Update Procedures Documented
- [ ] Backend update process tested
- [ ] Frontend update process tested
- [ ] Rollback procedure documented
- [ ] Emergency contacts defined

## Troubleshooting Done

Common issues verified:
- [ ] WebSocket connection working
- [ ] CORS configured correctly
- [ ] API keys valid and working
- [ ] SSL/TLS working (if applicable)
- [ ] CloudFront cache invalidation working
- [ ] PM2 logs accessible

## Cost Optimization

- [ ] Instance type appropriate for traffic
- [ ] Spot instances considered (dev/staging)
- [ ] S3 lifecycle policies configured
- [ ] CloudFront caching optimized
- [ ] Cost alerts configured
- [ ] Monthly cost estimated: $___________

## Final Sign-Off

- [ ] All functionality tested and working
- [ ] Performance acceptable
- [ ] Security measures in place
- [ ] Documentation complete
- [ ] Team trained on updates/maintenance
- [ ] Monitoring in place

**Deployment completed by:** ___________________  
**Date:** ___________________  
**Status:** [ ] Dev  [ ] Staging  [ ] Production

---

## Quick Reference Commands

### Backend Management
```bash
# SSH to EC2
ssh -i your-key.pem ubuntu@YOUR_EC2_IP

# Check backend status
pm2 status

# View logs
pm2 logs exbabel-backend

# Restart backend
pm2 restart exbabel-backend

# Update backend
cd /home/ubuntu/realtimetranslationapp/backend
git pull
npm install
pm2 restart exbabel-backend
```

### Frontend Deployment
```bash
# Build frontend
cd frontend
npm run build

# Deploy to S3
aws s3 sync dist/ s3://YOUR_BUCKET/ --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id YOUR_DIST_ID \
  --paths "/*"
```

### Health Checks
```bash
# Backend health
curl http://YOUR_EC2_IP/health

# Test translation
curl -X POST http://YOUR_EC2_IP/test-translation \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello","sourceLang":"en","targetLang":"es"}'
```

---

**Need help?** See `AWS_DEPLOYMENT_GUIDE.md` or `QUICKSTART_AWS.md`

