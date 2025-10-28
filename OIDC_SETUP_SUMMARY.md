# OIDC Authentication Summary

## What Changed

The CI/CD setup has been updated to use **OIDC (OpenID Connect)** instead of traditional AWS access keys for secure, keyless authentication.

## Key Differences

### Before (Access Keys)
- Created IAM **User** with access keys
- Stored `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in GitHub secrets
- Keys were long-lived and needed rotation every 90 days
- Keys could be used from anywhere if leaked

### After (OIDC)
- Created OIDC **Identity Provider** in AWS
- Created IAM **Role** that GitHub Actions assumes
- Only store `AWS_ROLE_ARN` in GitHub secrets (no sensitive credentials)
- AWS issues temporary tokens that expire in 1 hour
- Tokens only work from your specific GitHub repository

## Security Benefits

| Feature | Access Keys | OIDC |
|---------|-------------|------|
| Credential Type | Long-lived (permanent) | Temporary (1 hour) |
| Stored in GitHub | Yes (sensitive) | No (just role ARN) |
| Rotation Required | Every 90 days | Automatic |
| Can be used outside GitHub | Yes (if leaked) | No (repo-specific) |
| AWS Best Practice | ❌ Legacy | ✅ Modern |

## GitHub Secrets Required

### Backend Deployment
- `EC2_SSH_KEY` - Your EC2 private key (.pem file)
- `EC2_HOST` - EC2 instance IP address

### Frontend Deployment (OIDC)
- `AWS_ROLE_ARN` - IAM role ARN (e.g., `arn:aws:iam::123456789012:role/GitHubActionsExbabelRole`)
- `AWS_REGION` - AWS region (e.g., `us-east-1`)
- `S3_BUCKET_NAME` - S3 bucket name (e.g., `exbabel`)
- `CLOUDFRONT_DISTRIBUTION_ID` - CloudFront distribution ID
- `VITE_API_URL` - Backend API URL
- `VITE_WS_URL` - WebSocket URL

**Notice:** No `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` needed! 🎉

## How OIDC Works

```
┌─────────────────┐
│ GitHub Actions  │
│   (Your Repo)   │
└────────┬────────┘
         │ 1. Request token
         ▼
┌─────────────────────┐
│ GitHub OIDC Token   │
│   token.actions.    │
│ githubusercontent.com│
└────────┬────────────┘
         │ 2. Return signed JWT token
         ▼
┌─────────────────────┐
│   AWS STS Service   │
│ (Security Token     │
│     Service)        │
└────────┬────────────┘
         │ 3. Verify token & trust policy
         │    - Is it from GitHub?
         │    - Is it from allowed repo?
         │    - Is audience correct?
         ▼
┌─────────────────────┐
│ Temporary AWS       │
│ Credentials (1h)    │
│ - Access Key        │
│ - Secret Key        │
│ - Session Token     │
└────────┬────────────┘
         │ 4. Use credentials
         ▼
┌─────────────────────┐
│ AWS Services        │
│ - S3 Upload         │
│ - CloudFront        │
│   Invalidation      │
└─────────────────────┘
```

## Trust Policy Explanation

The IAM role trust policy restricts which GitHub repository can assume the role:

```json
{
  "StringLike": {
    "token.actions.githubusercontent.com:sub": "repo:YOUR_USERNAME/realtimetranslationapp:*"
  }
}
```

This means:
- ✅ Only workflows from `YOUR_USERNAME/realtimetranslationapp` can assume the role
- ✅ Any branch in that repo can assume it (`*` wildcard)
- ❌ Other repos cannot use this role, even if they know the ARN
- ❌ Someone with the ARN cannot use it outside GitHub Actions

### Even More Restrictive (Optional)

You can restrict to only the `main` branch:

```json
"token.actions.githubusercontent.com:sub": "repo:YOUR_USERNAME/realtimetranslationapp:ref:refs/heads/main"
```

Or only specific environments:

```json
"token.actions.githubusercontent.com:sub": "repo:YOUR_USERNAME/realtimetranslationapp:environment:production"
```

## Workflow Changes

The GitHub Actions workflow was updated:

### Added Permissions
```yaml
permissions:
  id-token: write  # Required to request OIDC token
  contents: read   # Required to checkout code
```

### Changed AWS Configuration
```yaml
# Before
- name: Configure AWS credentials
  uses: aws-actions/configure-aws-credentials@v4
  with:
    aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
    aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
    aws-region: ${{ secrets.AWS_REGION }}

# After (OIDC)
- name: Configure AWS credentials via OIDC
  uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
    aws-region: ${{ secrets.AWS_REGION }}
    role-session-name: GitHubActions-FrontendDeploy
```

## Troubleshooting OIDC

### Error: "Not authorized to perform sts:AssumeRoleWithWebIdentity"

**Causes:**
1. Trust policy has wrong GitHub username
2. Trust policy has wrong AWS account ID
3. OIDC provider not created
4. Role ARN is incorrect

**Solution:**
- Verify trust policy in IAM → Roles → GitHubActionsExbabelRole → Trust relationships
- Check that OIDC provider exists in IAM → Identity providers

### Error: "No OIDC token found"

**Cause:** Missing `id-token: write` permission

**Solution:** Ensure workflow has:
```yaml
permissions:
  id-token: write
  contents: read
```

## Migration from Access Keys

If you previously set up access keys, you should:

1. ✅ Follow new OIDC setup steps
2. ✅ Update GitHub secrets (remove access keys, add role ARN)
3. ✅ Test deployment works with OIDC
4. ✅ Delete old IAM user and access keys:
   - Go to IAM → Users → Delete `github-actions-exbabel` user
   - This permanently revokes the old access keys

## Additional Resources

- [GitHub OIDC Documentation](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)
- [AWS IAM Roles for GitHub Actions](https://aws.amazon.com/blogs/security/use-iam-roles-to-connect-github-actions-to-actions-in-aws/)
- [aws-actions/configure-aws-credentials](https://github.com/aws-actions/configure-aws-credentials)

---

**Setup Guide:** See `CICD_SETUP_GUIDE.md` for complete step-by-step instructions.

