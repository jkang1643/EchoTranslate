# Exbabel AWS Architecture

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                            USERS                                     │
│                    (Browsers/Mobile Devices)                         │
└───────┬─────────────────────────────────────────────────┬───────────┘
        │                                                  │
        │ HTTPS (Static Content)                          │ WS/WSS (Real-time)
        │                                                  │
        ▼                                                  ▼
┌──────────────────────────────────────┐    ┌────────────────────────────┐
│     Amazon CloudFront (CDN)          │    │                            │
│  • Global edge locations             │    │                            │
│  • HTTPS/SSL certificates            │    │                            │
│  • Gzip compression                  │    │                            │
│  • Cache optimization                │    │                            │
└───────────┬──────────────────────────┘    │                            │
            │                                │                            │
            │ Origin Request                 │                            │
            │                                │                            │
            ▼                                │                            │
┌────────────────────────────────────┐      │      ┌─────────────────────┤
│     Amazon S3 Bucket               │      │      │    EC2 Instance     │
│  • Static website hosting          │      │      │   (Ubuntu 22.04)    │
│  • React app build (HTML/JS/CSS)   │      │      ├─────────────────────┤
│  • Images, fonts, assets           │      │      │                     │
│  • Versioned deployments           │      │      │   Nginx (Proxy)     │
└────────────────────────────────────┘      │      │   • Port 80/443     │
                                             │      │   • WebSocket       │
                                             │      │   • SSL/TLS         │
                                             │      └──────────┬──────────┤
                                             │                 │          │
                                             └─────────────────┘          │
                                                       │                  │
                                                       ▼                  │
                                             ┌─────────────────────────┐  │
                                             │  Node.js Backend        │  │
                                             │  • Express Server       │  │
                                             │  • WebSocket Server     │  │
                                             │  • Port 3001            │  │
                                             │  • PM2 Process Manager  │  │
                                             └──────────┬──────────────┘  │
                                                        │                 │
                                    ┌───────────────────┼─────────────────┤
                                    │                   │                 │
                                    ▼                   ▼                 │
                        ┌──────────────────┐  ┌──────────────────┐       │
                        │ OpenAI API       │  │ Google Cloud     │       │
                        │ • GPT-4o         │  │ Speech-to-Text   │       │
                        │ • Translation    │  │ • Chirp 3 Model  │       │
                        │ • Chat API       │  │ • Streaming STT  │       │
                        └──────────────────┘  └──────────────────┘       │
                                                                          │
                                             ┌────────────────────────────┘
                                             │
                                             ▼
                                    ┌────────────────────┐
                                    │  Elastic IP (EIP)  │
                                    │  • Static IP       │
                                    │  • DNS mapping     │
                                    └────────────────────┘
```

## Component Breakdown

### Frontend Layer
```
┌─────────────────────────────────────┐
│  CloudFront Distribution            │
│  ├─ Edge Locations Worldwide        │
│  ├─ SSL/TLS Termination             │
│  ├─ Caching (1 day for assets)      │
│  └─ Gzip/Brotli Compression         │
└─────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  S3 Bucket (Static Website)         │
│  ├─ index.html (SPA entry)          │
│  ├─ /assets/*.js (React bundles)    │
│  ├─ /assets/*.css (Styles)          │
│  └─ /assets/*.{png,svg} (Images)    │
└─────────────────────────────────────┘
```

### Backend Layer
```
┌─────────────────────────────────────┐
│  EC2 Instance                       │
│  ├─ Security Group                  │
│  │  ├─ Port 22 (SSH)               │
│  │  ├─ Port 80 (HTTP)              │
│  │  ├─ Port 443 (HTTPS)            │
│  │  └─ Port 3001 (WebSocket)       │
│  │                                  │
│  ├─ Nginx Reverse Proxy             │
│  │  ├─ WebSocket upgrade headers   │
│  │  ├─ SSL/TLS (optional)          │
│  │  └─ Rate limiting               │
│  │                                  │
│  ├─ Node.js Application             │
│  │  ├─ Express HTTP Server         │
│  │  ├─ WebSocket Server (ws)       │
│  │  ├─ Session Management          │
│  │  └─ Audio Stream Processing     │
│  │                                  │
│  └─ PM2 Process Manager             │
│     ├─ Auto-restart on crash       │
│     ├─ Log management              │
│     └─ Cluster mode (optional)     │
└─────────────────────────────────────┘
```

### External Services
```
┌────────────────────────────┐
│  OpenAI API                │
│  • Model: gpt-4o           │
│  • Function: Translation   │
│  • Protocol: HTTPS/REST    │
└────────────────────────────┘

┌────────────────────────────┐
│  Google Cloud Speech       │
│  • Model: Chirp 3          │
│  • Function: STT           │
│  • Protocol: gRPC          │
└────────────────────────────┘
```

## Data Flow

### Static Content Delivery
```
User Browser → CloudFront → S3 Bucket → React App Loads
```

### Real-Time Translation Flow
```
1. User speaks into microphone
   └─> Browser captures audio (PCM 24kHz)

2. Audio sent via WebSocket
   └─> ws://EC2-IP/translate

3. Backend receives audio
   └─> Streams to Google Cloud Speech-to-Text
   
4. Google returns transcription
   ├─> Partial results: Display immediately
   └─> Final results: Send to OpenAI for translation

5. OpenAI returns translation
   └─> Send back to client via WebSocket

6. Client displays translation
   └─> Updates UI in real-time
```

### Session Flow (Host/Listener Mode)
```
HOST:
1. Create session → POST /session/start
2. Receive sessionCode
3. Connect WebSocket → ws://EC2-IP/translate?role=host&sessionId=X
4. Stream audio
5. Transcription broadcast to all listeners

LISTENER:
1. Join session → POST /session/join (with sessionCode)
2. Connect WebSocket → ws://EC2-IP/translate?role=listener&sessionId=X&targetLang=Y
3. Receive translations in real-time
```

## Network Architecture

```
Internet Gateway
       │
       ├─── CloudFront (Global)
       │    • US, EU, APAC, etc.
       │    • Cache Hit Ratio: ~80%
       │
       └─── EC2 Instance
            • Region: us-east-1 (or your choice)
            • AZ: us-east-1a
            • VPC: default or custom
            • Subnet: public
            • Elastic IP: Static assignment
```

## Security Architecture

```
┌──────────────────────────────────────┐
│  Security Layers                     │
├──────────────────────────────────────┤
│  1. CloudFront                       │
│     • AWS Shield (DDoS protection)   │
│     • SSL/TLS encryption             │
│     • Geo-blocking (optional)        │
│                                      │
│  2. EC2 Security Group               │
│     • Port-based firewall            │
│     • IP whitelisting                │
│                                      │
│  3. UFW (Host Firewall)              │
│     • Application-level rules        │
│     • Rate limiting                  │
│                                      │
│  4. Nginx                            │
│     • Request validation             │
│     • SSL termination                │
│     • Headers security               │
│                                      │
│  5. Application                      │
│     • API key validation             │
│     • Session management             │
│     • CORS policies                  │
└──────────────────────────────────────┘
```

## Scaling Strategy

### Current Setup (Small Scale)
- EC2: t3.small (2 vCPU, 2GB RAM)
- Handles: ~50 concurrent users
- Cost: ~$20/month

### Scale to Medium (100-500 users)
```
                Load Balancer
                      │
        ┌─────────────┼─────────────┐
        │             │             │
    EC2 #1        EC2 #2        EC2 #3
  (t3.medium)   (t3.medium)   (t3.medium)
        │             │             │
        └─────────────┴─────────────┘
                      │
                  ElastiCache
               (Session Store)
```
Cost: ~$100-150/month

### Scale to Large (1000+ users)
- Auto Scaling Group (3-10 instances)
- Application Load Balancer
- RDS for session storage
- ElastiCache for caching
- Cost: ~$500-1000/month

## Monitoring Points

```
┌─────────────────────────────────────┐
│  CloudWatch Metrics                 │
├─────────────────────────────────────┤
│  EC2:                               │
│  • CPU Utilization                  │
│  • Network In/Out                   │
│  • Disk I/O                         │
│                                     │
│  Application:                       │
│  • WebSocket connections            │
│  • Translation requests/min         │
│  • Error rate                       │
│  • Response time                    │
│                                     │
│  CloudFront:                        │
│  • Requests/sec                     │
│  • Cache hit rate                   │
│  • Error rate (4xx, 5xx)            │
│                                     │
│  Costs:                             │
│  • Daily spend                      │
│  • Cost by service                  │
└─────────────────────────────────────┘
```

## Backup & Disaster Recovery

```
┌──────────────────────────────────────┐
│  Backup Strategy                     │
├──────────────────────────────────────┤
│  Code:                               │
│  • Git repository (source of truth)  │
│  • Automated deployments             │
│                                      │
│  Configuration:                      │
│  • .env backed up securely           │
│  • Infrastructure as Code (CF)       │
│                                      │
│  Data:                               │
│  • Session data: in-memory (ephemeral)│
│  • Logs: CloudWatch (7-30 day retention)│
│                                      │
│  Recovery Time Objective (RTO):      │
│  • Frontend: 5 minutes (redeploy)    │
│  • Backend: 10 minutes (new EC2)     │
└──────────────────────────────────────┘
```

## Cost Breakdown (Monthly)

```
Service              Usage               Cost
─────────────────────────────────────────────────
EC2 (t3.small)      730 hours           $15.20
Elastic IP          1 address           $0.00*
S3 Storage          5 GB                $0.12
S3 Requests         1M requests         $0.50
CloudFront          10GB transfer       $0.85
CloudFront Requests 1M requests         $0.75
Data Transfer       20GB out            $1.80
─────────────────────────────────────────────────
Total (Light Usage)                     ~$19.22

* Free while associated with running EC2

Medium Usage (100+ concurrent users):
EC2 (t3.medium * 2) 1460 hours          $60.00
ALB                 730 hours           $16.50
S3/CloudFront       50GB                $5.00
Data Transfer       200GB               $18.00
─────────────────────────────────────────────────
Total (Medium Usage)                    ~$99.50
```

---

**This architecture provides:**
- ✅ High availability (CloudFront + Multi-region)
- ✅ Low latency (Global CDN)
- ✅ Real-time communication (WebSocket)
- ✅ Scalability (Add more EC2 instances)
- ✅ Cost-effective (Pay only for what you use)
- ✅ Secure (Multiple security layers)

