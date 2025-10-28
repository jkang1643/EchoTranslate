# CI/CD Pipeline Setup Guide

Complete step-by-step guide for setting up automated deployment pipelines for Exbabel using GitHub Actions.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [AWS Setup](#aws-setup)
4. [EC2 Initial Configuration](#ec2-initial-configuration)
5. [GitHub Secrets Configuration](#github-secrets-configuration)
6. [Testing the Pipelines](#testing-the-pipelines)
7. [Troubleshooting](#troubleshooting)

---

## Overview

This CI/CD pipeline includes three workflows:

1. **Linting** (`lint.yml`) - Runs ESLint on every push/PR to ensure code quality
2. **Backend Deployment** (`deploy-backend.yml`) - Deploys backend to EC2 via SSH when backend code changes
3. **Frontend Deployment** (`deploy-frontend.yml`) - Builds and deploys frontend to S3, then invalidates CloudFront cache

### Security: OIDC Authentication

This guide uses **OIDC (OpenID Connect)** for AWS authentication, which is more secure than traditional access keys:

✅ **Benefits:**
- **No long-lived credentials** - No access keys stored in GitHub secrets
- **Temporary tokens** - AWS issues short-lived credentials that auto-expire (1 hour)
- **No credential rotation** - No need to rotate access keys
- **Better security** - Credentials can only be used from GitHub Actions, not anywhere else
- **Granular control** - Can restrict which repositories and branches can access AWS
- **Better compliance** - Meets security best practices for cloud deployments

---

## Prerequisites

Before starting, ensure you have:

- [ ] AWS account with admin access
- [ ] GitHub repository for your project
- [ ] Domain name (optional, for custom domains)
- [ ] SSH key pair for EC2 access (.pem file)
- [ ] Access to AWS Console (https://console.aws.amazon.com)

---

## AWS Setup

### Step 1: Deploy CloudFormation Stack (if not already deployed)

If you haven't already deployed your infrastructure using CloudFormation:

**Using AWS Console:**

1. Go to **CloudFormation** service (search in top bar)
2. Click **Create stack** → **With new resources**
3. Under "Specify template":
   - Select **Upload a template file**
   - Click **Choose file** and select your `cloudformation-template.yaml`
   - Click **Next**
4. Fill in stack details:
   - **Stack name**: `exbabel-stack`
   - **KeyPairName**: Select your EC2 key pair from dropdown
   - **InstanceType**: `t3.small` (or your preference)
   - **DomainName**: Your domain (e.g., `exbabel.com`) or leave default
   - **AppSubdomain**: `app` (or your preference)
   - **ApiSubdomain**: `api` (or your preference)
   - **HostedZoneId**: Your Route 53 hosted zone ID (or leave empty)
   - **ACMCertificateArn**: Your SSL certificate ARN (or leave empty)
   - Click **Next**
5. Configure stack options (leave defaults) → Click **Next**
6. Review and click **Submit**
7. Wait 5-10 minutes for stack creation to complete (refresh to see progress)

**Get Stack Outputs** (you'll need these values):

1. Go to **CloudFormation** → **Stacks**
2. Click on your stack name (`exbabel-stack`)
3. Click the **Outputs** tab
4. Note down these important values:
   - **BackendPublicIP** - EC2 instance IP address
   - **S3BucketName** - S3 bucket name for frontend
   - **CloudFrontDistributionId** - CloudFront distribution ID

### Step 2: Create OIDC Identity Provider for GitHub Actions

Set up OIDC so GitHub Actions can securely authenticate to AWS without long-lived credentials:

1. Go to **IAM** service in AWS Console (search for "IAM" in top bar)
2. Click **Identity providers** in left sidebar
3. Click **Add provider**
4. Configure the provider:
   - **Provider type**: Select **OpenID Connect**
   - **Provider URL**: `https://token.actions.githubusercontent.com`
   - Click **Get thumbprint** (AWS will automatically fetch it)
   - **Audience**: `sts.amazonaws.com`
5. Click **Add provider**

✅ OIDC provider created! GitHub Actions can now authenticate to AWS.

### Step 3: Create IAM Policy for GitHub Actions

Create a custom policy with minimal required permissions:

1. In **IAM** service, click **Policies** in left sidebar
2. Click **Create policy**
3. Click the **JSON** tab
4. Replace the default policy with this content:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3DeploymentAccess",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:PutObjectAcl",
        "s3:GetObject",
        "s3:ListBucket",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::exbabel",
        "arn:aws:s3:::exbabel/*"
      ]
    },
    {
      "Sid": "CloudFrontInvalidation",
      "Effect": "Allow",
      "Action": [
        "cloudfront:CreateInvalidation",
        "cloudfront:GetInvalidation"
      ],
      "Resource": "*"
    }
  ]
}
```

5. Click **Next**
6. **Policy name**: `GitHubActionsExbabelPolicy`
7. **Description** (optional): `Allows GitHub Actions to deploy frontend to S3 and invalidate CloudFront`
8. Click **Create policy**

✅ Policy created!

### Step 4: Create IAM Role for GitHub Actions

Create a role that GitHub Actions will assume using OIDC:

1. In **IAM**, click **Roles** in left sidebar → **Create role**
2. **Trusted entity type**: Select **Web identity**
3. Configure web identity:
   - **Identity provider**: Select `token.actions.githubusercontent.com` (the one you just created)
   - **Audience**: Select `sts.amazonaws.com`
4. Click **Next**
5. Under **Permissions policies**, search for and select `GitHubActionsExbabelPolicy`
6. Click **Next**
7. Configure role:
   - **Role name**: `GitHubActionsExbabelRole`
   - **Description** (optional): `Role for GitHub Actions to deploy Exbabel application`
8. Click **Create role**

**Now configure the trust policy to restrict to your repository:**

1. Find and click on the role you just created (`GitHubActionsExbabelRole`)
2. Click the **Trust relationships** tab
3. Click **Edit trust policy**
4. Replace the policy with this (⚠️ **Replace `YOUR_GITHUB_USERNAME` with your actual GitHub username**):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::${AWS_ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:YOUR_GITHUB_USERNAME/realtimetranslationapp:*"
        }
      }
    }
  ]
}
```

**Important**: You need to replace `${AWS_ACCOUNT_ID}` with your actual AWS account ID in the trust policy. To find it:
- Look at the top right of AWS Console → Click your account name → Copy the 12-digit Account ID
- Replace `${AWS_ACCOUNT_ID}` with your account ID (e.g., `123456789012`)

5. Click **Update policy**

**Save the Role ARN** (you'll need this for GitHub secrets):

1. Still on the role page, find **ARN** near the top (e.g., `arn:aws:iam::123456789012:role/GitHubActionsExbabelRole`)
2. Copy this ARN - you'll add it to GitHub secrets

✅ IAM role configured! GitHub Actions can now assume this role to deploy your application.

---

## EC2 Initial Configuration

### Step 1: SSH into EC2 Instance

```bash
ssh -i /path/to/your-key.pem ubuntu@YOUR_EC2_IP
```

### Step 2: Clone Your Repository

```bash
cd /home/ubuntu
git clone https://github.com/YOUR_USERNAME/realtimetranslationapp.git
cd realtimetranslationapp
```

### Step 3: Configure Git Credentials (for automated pulls)

**Option A: Personal Access Token (Recommended)**

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token with `repo` scope
3. On EC2, configure git:

```bash
git config --global credential.helper store
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"

# First pull will ask for credentials, use PAT as password
git pull
# Username: your-github-username
# Password: ghp_YourPersonalAccessToken
```

**Option B: Deploy Keys (More Secure)**

```bash
# On EC2, generate SSH key
ssh-keygen -t ed25519 -C "github-deploy-key" -f ~/.ssh/github_deploy

# Display public key
cat ~/.ssh/github_deploy.pub
```

Then:
1. Copy the public key
2. Go to GitHub → Your Repo → Settings → Deploy keys → Add deploy key
3. Paste the key, give it a title, keep "Allow write access" UNCHECKED
4. Configure git to use this key:

```bash
# Create/edit SSH config
cat > ~/.ssh/config << 'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/github_deploy
  IdentitiesOnly yes
EOF

chmod 600 ~/.ssh/config

# Test connection
ssh -T git@github.com

# Update git remote to use SSH
cd /home/ubuntu/realtimetranslationapp
git remote set-url origin git@github.com:YOUR_USERNAME/realtimetranslationapp.git
```

### Step 4: Install Backend Dependencies

```bash
cd /home/ubuntu/realtimetranslationapp/backend
npm install
```

### Step 5: Configure Environment Variables

```bash
# Create .env file
nano /home/ubuntu/realtimetranslationapp/backend/.env
```

Add your environment variables:

```env
PORT=3001
OPENAI_API_KEY=your_openai_api_key_here
GOOGLE_SPEECH_API_KEY=your_google_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
NODE_ENV=production
CORS_ORIGIN=https://app.exbabel.com
```

Save and exit (Ctrl+X, then Y, then Enter)

### Step 6: Start Backend with PM2

```bash
cd /home/ubuntu/realtimetranslationapp/backend
pm2 start server.js --name exbabel-backend
pm2 save
pm2 startup  # Follow the instructions to enable PM2 on system startup
```

### Step 7: Configure Nginx (Optional but Recommended)

```bash
sudo nano /etc/nginx/sites-available/exbabel
```

Add this configuration:

```nginx
server {
    listen 80;
    server_name api.exbabel.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket support
    location /translate {
        proxy_pass http://localhost:3001/translate;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/exbabel /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Step 8: Setup SSL with Certbot (if using custom domain)

```bash
sudo apt-get update
sudo apt-get install -y certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d api.exbabel.com

# Test auto-renewal
sudo certbot renew --dry-run
```

---

## GitHub Secrets Configuration

Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Add the following secrets:

### Backend Deployment Secrets

| Secret Name | Description | Example Value |
|------------|-------------|---------------|
| `EC2_SSH_KEY` | Private SSH key content (entire .pem file) | `-----BEGIN RSA PRIVATE KEY-----\n...` |
| `EC2_HOST` | EC2 instance public IP or domain | `3.123.45.67` or `api.exbabel.com` |

**How to get EC2_SSH_KEY value:**
```bash
# On your local machine (Windows/WSL)
cat /path/to/your-key.pem
```
Copy the **entire output** including the BEGIN and END lines.

### Frontend Deployment Secrets

| Secret Name | Description | Example Value |
|------------|-------------|---------------|
| `AWS_ROLE_ARN` | IAM role ARN for OIDC authentication | `arn:aws:iam::123456789012:role/GitHubActionsExbabelRole` |
| `AWS_REGION` | AWS region for S3 bucket | `us-east-1` |
| `S3_BUCKET_NAME` | S3 bucket name from CloudFormation | `exbabel` |
| `CLOUDFRONT_DISTRIBUTION_ID` | CloudFront distribution ID | `E1234ABCDEF567` |
| `VITE_API_URL` | Backend API URL for frontend | `https://api.exbabel.com` |
| `VITE_WS_URL` | WebSocket URL for frontend | `wss://api.exbabel.com/translate` |

**How to get these values:**

**Using AWS Console:**

1. **AWS_ROLE_ARN**:
   - Go to **IAM** → **Roles** → Click `GitHubActionsExbabelRole`
   - Copy the **ARN** from the top (e.g., `arn:aws:iam::123456789012:role/GitHubActionsExbabelRole`)

2. **S3_BUCKET_NAME** and **CLOUDFRONT_DISTRIBUTION_ID**:
   - Go to **CloudFormation** → **Stacks** → Click `exbabel-stack`
   - Click the **Outputs** tab
   - Find `S3BucketName` value (e.g., `exbabel`)
   - Find `CloudFrontDistributionId` value (e.g., `E1234ABCDEF567`)

3. **EC2_HOST** (Backend IP):
   - From the same **Outputs** tab, find `BackendPublicIP`
   - Or go to **EC2** → **Instances** → Find your instance → Copy **Public IPv4 address**

4. **AWS_REGION**:
   - The region where you deployed your stack (check top-right corner of AWS Console)
   - Usually `us-east-1` if you followed CloudFormation defaults

5. **VITE_API_URL** and **VITE_WS_URL**:
   - If using custom domain: `https://api.exbabel.com` and `wss://api.exbabel.com/translate`
   - If using IP: `http://YOUR_EC2_IP` and `ws://YOUR_EC2_IP/translate`
   - Replace with your actual domain or IP from step 3 above

### Step-by-Step: Adding Secrets to GitHub

1. Go to: `https://github.com/YOUR_USERNAME/realtimetranslationapp/settings/secrets/actions`
2. Click **"New repository secret"**
3. For each secret in the tables above:
   - Enter the **Name** (e.g., `EC2_SSH_KEY`)
   - Paste the **Value**
   - Click **"Add secret"**
4. Repeat for all secrets

---

## Testing the Pipelines

### Test 1: Linting Workflow

```bash
# On your local machine, make a small change
echo "// Test comment" >> backend/server.js

# Commit and push
git add .
git commit -m "test: trigger linting workflow"
git push origin main
```

Go to GitHub → **Actions** tab → You should see the "Lint Code" workflow running

### Test 2: Backend Deployment

```bash
# Make a change to backend code
echo "console.log('CI/CD test');" >> backend/server.js

# Commit and push
git add backend/
git commit -m "feat: test backend deployment"
git push origin main
```

Go to GitHub → **Actions** → "Deploy Backend to EC2" should run automatically

**Verify on EC2:**
```bash
ssh -i your-key.pem ubuntu@YOUR_EC2_IP
pm2 logs exbabel-backend --lines 50
```

### Test 3: Frontend Deployment

```bash
# Make a change to frontend code
echo "/* CI/CD test */" >> frontend/src/App.jsx

# Commit and push
git add frontend/
git commit -m "feat: test frontend deployment"
git push origin main
```

Go to GitHub → **Actions** → "Deploy Frontend to S3 + CloudFront" should run

**Verify deployment:**
1. Go to **S3** in AWS Console → Open your bucket (`exbabel`) → You should see files like `index.html`, `assets/`, etc.
2. Visit your frontend URL (CloudFront may take 5-10 minutes to invalidate the cache)

### Test 4: Manual Deployment

You can also trigger deployments manually:

1. Go to GitHub → **Actions**
2. Select a workflow (e.g., "Deploy Backend to EC2")
3. Click **"Run workflow"**
4. Select branch (usually `main`)
5. Click **"Run workflow"**

---

## Troubleshooting

### Backend Deployment Issues

#### Error: "Permission denied (publickey)"

**Solution:**
```bash
# Verify EC2_SSH_KEY secret is correct
# On GitHub, delete and re-add the EC2_SSH_KEY secret
# Make sure you copied the ENTIRE .pem file including headers/footers
```

#### Error: "fatal: could not read Username for 'https://github.com'"

**Solution:**
```bash
# SSH into EC2 and configure git credentials
ssh -i your-key.pem ubuntu@YOUR_EC2_IP

# Option 1: Use Personal Access Token
git config --global credential.helper store
git pull  # Enter PAT when prompted

# Option 2: Switch to SSH
git remote set-url origin git@github.com:YOUR_USERNAME/realtimetranslationapp.git
```

#### Error: "pm2: command not found"

**Solution:**
```bash
# SSH into EC2
ssh -i your-key.pem ubuntu@YOUR_EC2_IP

# Install PM2 globally
sudo npm install -g pm2
```

#### Backend not restarting

**Solution:**
```bash
# SSH into EC2
ssh -i your-key.pem ubuntu@YOUR_EC2_IP

# Check PM2 status
pm2 status

# If process doesn't exist, start it
cd /home/ubuntu/realtimetranslationapp/backend
pm2 start server.js --name exbabel-backend
pm2 save
```

### Frontend Deployment Issues

#### Error: "AccessDenied" when uploading to S3

**Solution:**
1. Go to **IAM** → **Roles** → `GitHubActionsExbabelRole` → **Permissions** tab
   - Verify `GitHubActionsExbabelPolicy` is attached
2. Verify S3 bucket name in GitHub secrets matches your actual bucket name exactly
3. Check the IAM policy has correct S3 bucket ARN (should be `arn:aws:s3:::exbabel` and `arn:aws:s3:::exbabel/*`)

#### Error: "InvalidClientTokenId" or "Not authorized to perform sts:AssumeRoleWithWebIdentity"

**Solution:** OIDC configuration issue
1. Verify the `AWS_ROLE_ARN` secret in GitHub is correct
2. Check the IAM role trust policy:
   - Go to **IAM** → **Roles** → `GitHubActionsExbabelRole` → **Trust relationships**
   - Verify your GitHub username is correct in the trust policy
   - Ensure the account ID in the Federated ARN matches your AWS account
3. Verify OIDC provider exists:
   - Go to **IAM** → **Identity providers**
   - Ensure `token.actions.githubusercontent.com` provider exists with audience `sts.amazonaws.com`

#### CloudFront cache not invalidating

**Solution:**

Manually create an invalidation to test:
1. Go to **CloudFront** in AWS Console
2. Click on your distribution ID
3. Go to **Invalidations** tab
4. Click **Create invalidation**
5. Enter `/*` in the object paths field
6. Click **Create invalidation**
7. Wait 2-5 minutes and check if your changes appear
8. If this works but GitHub Actions doesn't, verify your `CLOUDFRONT_DISTRIBUTION_ID` secret is correct

#### Build fails with environment variable errors

**Solution:** 
- Verify `VITE_API_URL` and `VITE_WS_URL` secrets are set correctly
- These should start with `https://` and `wss://` respectively
- Example: `https://api.exbabel.com` not `https://api.exbabel.com/`

### Linting Issues

#### Linting fails on valid code

**Solution:**
```bash
# Run linting locally to see exact errors
npm run lint

# If errors are acceptable, you can disable specific rules
# Edit eslint.config.js
```

### General Debugging

#### Check GitHub Actions logs

1. Go to GitHub → **Actions**
2. Click on the failed workflow run
3. Click on the failed job
4. Expand the failed step to see detailed logs

#### Check EC2 logs

```bash
ssh -i your-key.pem ubuntu@YOUR_EC2_IP

# Check PM2 logs
pm2 logs exbabel-backend --lines 100

# Check system logs
sudo journalctl -u nginx -n 100

# Check git status
cd /home/ubuntu/realtimetranslationapp
git status
git log -1
```

#### Verify AWS Resources in Console

1. **Verify S3 bucket exists:**
   - Go to **S3** → Search for your bucket name
   - Ensure bucket is not empty after successful deployment
   
2. **Verify CloudFront distribution:**
   - Go to **CloudFront** → Find your distribution
   - Ensure status is "Enabled" and "Deployed"
   - Check that Origin points to your S3 bucket
   
3. **Verify IAM role and permissions:**
   - Go to **IAM** → **Roles** → `GitHubActionsExbabelRole`
   - Check **Permissions** tab for attached policies
   - Check **Trust relationships** tab to ensure GitHub is allowed to assume the role

---

## Workflow Triggers Summary

| Workflow | Automatic Trigger | Manual Trigger | Runs When |
|----------|------------------|----------------|-----------|
| Lint | ✅ Yes | ❌ No | Push or PR to main/develop |
| Backend Deploy | ✅ Yes | ✅ Yes | Push to main + backend/** changes |
| Frontend Deploy | ✅ Yes | ✅ Yes | Push to main + frontend/** changes |

---

## Security Best Practices

1. **Never commit secrets** to your repository
2. **Use OIDC for AWS authentication** ✅ (This guide uses OIDC - no long-lived credentials!)
3. **Use IAM roles with minimal permissions** - Only grant what's needed for deployment
4. **Restrict IAM role trust policy** - Limit to specific GitHub repository (already configured in Step 4)
5. **Use deploy keys** instead of personal access tokens for EC2 git access when possible
6. **Restrict EC2 SSH access** to specific IP addresses in CloudFormation
7. **Enable MFA** on your AWS account (especially for console access)
8. **Monitor AWS CloudTrail** for unauthorized access attempts
9. **Review GitHub Actions logs** regularly for suspicious activity
10. **Use branch protection** - Require PR reviews before merging to main

---

## Next Steps

After successful setup:

1. ✅ Test all three pipelines with small changes
2. ✅ Verify backend is running with `pm2 status`
3. ✅ Verify frontend is accessible via CloudFront
4. ✅ Setup CloudWatch alerts for EC2 instance health
5. ✅ Configure backup strategy for EC2 instance
6. ✅ Document your custom domain configuration (if using)
7. ✅ Setup monitoring/logging (CloudWatch, PM2 Plus, etc.)

---

## Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [AWS CloudFormation User Guide](https://docs.aws.amazon.com/cloudformation/)
- [PM2 Documentation](https://pm2.keymetrics.io/docs/usage/quick-start/)
- [AWS CLI Command Reference](https://docs.aws.amazon.com/cli/latest/)
- [Nginx Configuration Guide](https://nginx.org/en/docs/)

---

## Support

If you encounter issues not covered in this guide:

1. Check GitHub Actions logs for detailed error messages
2. Verify all secrets are correctly configured
3. Test AWS credentials locally
4. Check EC2 instance logs via SSH
5. Review CloudFormation stack events for infrastructure issues

---

**Last Updated:** October 2025  
**Version:** 1.0

