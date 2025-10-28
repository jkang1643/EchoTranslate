# AWS Deployment Files - Quick Reference

This directory contains everything you need to deploy Exbabel to AWS. Here's what each file does and how to use it.

## 📚 Documentation Files

### 1. **QUICKSTART_AWS.md** ⭐ START HERE
**Purpose**: Get up and running in 30 minutes  
**Use when**: First-time deployment, want the fastest path to production  
**Contains**: 5-step deployment process with commands

### 2. **AWS_DEPLOYMENT_GUIDE.md**
**Purpose**: Comprehensive deployment manual  
**Use when**: Need detailed explanations, troubleshooting, or advanced setup  
**Contains**: Complete step-by-step guide with architecture, security, scaling, troubleshooting

### 3. **DEPLOYMENT_CHECKLIST.md**
**Purpose**: Track your deployment progress  
**Use when**: Want to ensure nothing is missed, document your deployment  
**Contains**: Checkboxes for every deployment step, space for recording URLs/IPs

## 🔧 Deployment Scripts

### 4. **setup-ec2.sh** (Run ONCE on new EC2)
**Purpose**: Initial EC2 setup - installs all required software  
**Platform**: Linux (Ubuntu)  
**Usage**:
```bash
# On EC2 instance
chmod +x setup-ec2.sh
./setup-ec2.sh
```
**What it does**:
- Installs Node.js, PM2, Nginx
- Clones repository
- Configures firewall
- Sets up Nginx reverse proxy

### 5. **deploy-backend.sh** (For backend updates)
**Purpose**: Update backend code on EC2  
**Platform**: Linux (Ubuntu)  
**Usage**:
```bash
# On EC2 instance
cd /home/ubuntu/realtimetranslationapp/backend
./deploy-backend.sh
```
**What it does**:
- Pulls latest code
- Installs dependencies
- Restarts PM2 process
- Verifies health

### 6. **deploy-frontend.sh** (For frontend deployment)
**Purpose**: Build and deploy frontend to S3 + CloudFront  
**Platform**: Linux/Mac  
**Usage**:
```bash
# On your local machine
chmod +x deploy-frontend.sh
./deploy-frontend.sh
```
**What it does**:
- Builds React app
- Uploads to S3
- Invalidates CloudFront cache
- Shows deployment URLs

### 7. **deploy-frontend.bat** (Windows version)
**Purpose**: Same as deploy-frontend.sh but for Windows  
**Platform**: Windows  
**Usage**:
```cmd
deploy-frontend.bat
```

## ⚙️ Configuration Files

### 8. **nginx.conf**
**Purpose**: Nginx configuration for WebSocket proxy  
**Location**: Copy to `/etc/nginx/sites-available/exbabel` on EC2  
**Usage**:
```bash
sudo cp nginx.conf /etc/nginx/sites-available/exbabel
sudo ln -s /etc/nginx/sites-available/exbabel /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 9. **env-template-backend.txt**
**Purpose**: Template for backend environment variables  
**Location**: Copy to `backend/.env` on EC2  
**Usage**:
```bash
cp env-template-backend.txt backend/.env
nano backend/.env  # Add your API keys
```

### 10. **env-template-frontend.txt**
**Purpose**: Template for frontend environment variables  
**Location**: Copy to `frontend/.env.production` locally  
**Usage**:
```bash
cp env-template-frontend.txt frontend/.env.production
nano frontend/.env.production  # Add your EC2 IP
```

### 11. **cloudformation-template.yaml**
**Purpose**: AWS CloudFormation template for automated infrastructure setup  
**Use when**: Want to automate AWS resource creation  
**Usage**:
```bash
aws cloudformation create-stack \
  --stack-name exbabel \
  --template-body file://cloudformation-template.yaml \
  --parameters ParameterKey=KeyPairName,ParameterValue=your-key-pair
```
**What it creates**:
- EC2 instance with security group
- S3 bucket for frontend
- CloudFront distribution
- Elastic IP

## 🚀 Deployment Workflow

### First-Time Deployment

1. **Read**: `QUICKSTART_AWS.md`
2. **Prepare**: Have AWS account, API keys ready
3. **Deploy Backend**:
   ```bash
   # On EC2
   ./setup-ec2.sh
   # Edit .env with API keys
   pm2 start server.js --name exbabel-backend
   ```
4. **Deploy Frontend**:
   ```bash
   # On local machine
   ./deploy-frontend.sh  # or .bat on Windows
   ```
5. **Verify**: Check off items in `DEPLOYMENT_CHECKLIST.md`

### Regular Updates

**Backend Updates**:
```bash
ssh -i your-key.pem ubuntu@YOUR_EC2_IP
cd /home/ubuntu/realtimetranslationapp/backend
./deploy-backend.sh
```

**Frontend Updates**:
```bash
# On local machine
./deploy-frontend.sh  # or .bat
```

## 📋 Quick Decision Tree

**"I want to..."**

- **Deploy for the first time** → Read `QUICKSTART_AWS.md`, use `setup-ec2.sh` and `deploy-frontend.sh`
- **Understand the architecture** → Read `AWS_DEPLOYMENT_GUIDE.md`
- **Update my backend** → Run `deploy-backend.sh` on EC2
- **Update my frontend** → Run `deploy-frontend.sh` locally
- **Automate infrastructure** → Use `cloudformation-template.yaml`
- **Track deployment progress** → Use `DEPLOYMENT_CHECKLIST.md`
- **Configure Nginx** → Use `nginx.conf`
- **Set environment variables** → Use `env-template-*.txt` files

## 🔍 File Dependencies

```
QUICKSTART_AWS.md
├── setup-ec2.sh (EC2 setup)
├── deploy-backend.sh (Backend deployment)
├── deploy-frontend.sh (Frontend deployment)
├── nginx.conf (Nginx config)
├── env-template-backend.txt (Backend env vars)
└── env-template-frontend.txt (Frontend env vars)

AWS_DEPLOYMENT_GUIDE.md (detailed reference)

DEPLOYMENT_CHECKLIST.md (progress tracking)

cloudformation-template.yaml (infrastructure automation)
```

## 🛠️ Prerequisites by File

| File | Requires |
|------|----------|
| `setup-ec2.sh` | EC2 instance, SSH access, Ubuntu 22.04 |
| `deploy-backend.sh` | EC2 with Node.js, PM2, code uploaded |
| `deploy-frontend.sh` | AWS CLI configured, S3 bucket, Node.js locally |
| `deploy-frontend.bat` | AWS CLI, S3 bucket, Node.js (Windows) |
| `cloudformation-template.yaml` | AWS CLI, EC2 key pair |
| `nginx.conf` | Nginx installed on EC2 |

## 💡 Tips

1. **First deployment**: Follow `QUICKSTART_AWS.md` step-by-step
2. **Problems?**: Check troubleshooting in `AWS_DEPLOYMENT_GUIDE.md`
3. **Track progress**: Use `DEPLOYMENT_CHECKLIST.md`
4. **Automate**: Consider using `cloudformation-template.yaml` for clean deployments
5. **Scripts**: Always run from the correct directory:
   - Backend scripts: On EC2 in backend directory
   - Frontend scripts: On local machine in project root

## 🔐 Security Notes

- Never commit `.env` files to git
- Keep your `.pem` SSH key secure
- Rotate API keys regularly
- Use environment-specific configurations
- Review Security Group rules

## 📞 Support

If you encounter issues:

1. Check the troubleshooting section in `AWS_DEPLOYMENT_GUIDE.md`
2. Verify all prerequisites are met
3. Check logs:
   - Backend: `pm2 logs exbabel-backend`
   - Nginx: `sudo tail -f /var/log/nginx/error.log`
4. Test health endpoint: `curl http://YOUR_EC2_IP/health`

## 🎯 Success Criteria

Your deployment is successful when:

- ✅ Backend health check returns 200 OK
- ✅ Frontend loads via CloudFront URL
- ✅ WebSocket connection establishes
- ✅ Demo mode translation works
- ✅ Solo mode microphone works
- ✅ No errors in browser console

## 📊 Estimated Time Investment

| Task | Time |
|------|------|
| First-time deployment | 30-60 minutes |
| Backend update | 5 minutes |
| Frontend update | 5 minutes |
| SSL setup | 15 minutes |
| Custom domain | 20 minutes |

---

**Ready to deploy?** Start with `QUICKSTART_AWS.md` 🚀

