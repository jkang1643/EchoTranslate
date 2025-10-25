@echo off
REM EchoTranslate - Frontend Deployment Script for AWS S3 + CloudFront (Windows)
REM This script builds and deploys the frontend to S3 and invalidates CloudFront cache

echo ========================================
echo EchoTranslate Frontend Deployment
echo ========================================
echo.

REM Check if AWS CLI is installed
where aws >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: AWS CLI not found. Please install it first.
    echo Download from: https://aws.amazon.com/cli/
    pause
    exit /b 1
)

REM Get configuration
set /p S3_BUCKET="Enter your S3 bucket name: "
set /p CLOUDFRONT_ID="Enter your CloudFront distribution ID (press Enter to skip): "
set /p BACKEND_URL="Enter your EC2 public IP or domain: "

if "%S3_BUCKET%"=="" (
    echo ERROR: S3 bucket name is required
    pause
    exit /b 1
)

if "%BACKEND_URL%"=="" (
    echo ERROR: Backend URL is required
    pause
    exit /b 1
)

REM Create production environment file
echo.
echo Creating production environment configuration...
cd frontend

(
echo # Backend API URL
echo VITE_API_URL=http://%BACKEND_URL%
echo.
echo # Backend WebSocket URL
echo VITE_WS_URL=ws://%BACKEND_URL%/translate
echo.
echo # If using HTTPS/WSS, use:
echo # VITE_API_URL=https://%BACKEND_URL%
echo # VITE_WS_URL=wss://%BACKEND_URL%/translate
) > .env.production

echo Environment configuration created
echo.

REM Install dependencies
echo Installing dependencies...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: npm install failed
    pause
    exit /b 1
)
echo.

REM Build frontend
echo Building frontend for production...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Build failed
    pause
    exit /b 1
)

if not exist "dist" (
    echo ERROR: Build failed - dist directory not found
    pause
    exit /b 1
)

echo Build complete
echo.

REM Upload to S3
echo Uploading to S3: %S3_BUCKET%...

REM Upload assets with long cache
aws s3 sync dist/ s3://%S3_BUCKET%/ --delete --cache-control "public, max-age=31536000" --exclude "*.html" --exclude "index.html"
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: S3 upload failed
    pause
    exit /b 1
)

REM Upload HTML with short cache
aws s3 sync dist/ s3://%S3_BUCKET%/ --exclude "*" --include "*.html" --cache-control "public, max-age=0, must-revalidate"

echo Upload complete
echo.

REM Invalidate CloudFront cache
if not "%CLOUDFRONT_ID%"=="" (
    echo Invalidating CloudFront cache...
    aws cloudfront create-invalidation --distribution-id %CLOUDFRONT_ID% --paths "/*"
    echo Cache invalidation created
    echo Note: It may take 5-10 minutes to complete
) else (
    echo Skipping CloudFront cache invalidation
)
echo.

REM Get region
for /f "tokens=*" %%i in ('aws s3api get-bucket-location --bucket %S3_BUCKET% --query LocationConstraint --output text') do set REGION=%%i
if "%REGION%"=="None" set REGION=us-east-1

REM Summary
echo ========================================
echo Deployment Complete!
echo ========================================
echo S3 Bucket: %S3_BUCKET%
echo S3 Website URL: http://%S3_BUCKET%.s3-website-%REGION%.amazonaws.com

if not "%CLOUDFRONT_ID%"=="" (
    for /f "tokens=*" %%i in ('aws cloudfront get-distribution --id %CLOUDFRONT_ID% --query Distribution.DomainName --output text') do set CF_DOMAIN=%%i
    echo CloudFront URL: https://!CF_DOMAIN!
)

echo.
echo Next steps:
echo 1. Test your deployment at the CloudFront URL
echo 2. Check browser console for any errors
echo 3. Test microphone and translation features
echo.
pause

