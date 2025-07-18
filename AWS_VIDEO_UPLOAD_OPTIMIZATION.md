# AWS Video Upload Optimization Guide

This guide explains the optimizations implemented to handle large video uploads (780MB+) when deploying the LMS application on AWS EC2.

## 🚨 Problem Statement

When deploying the LMS application on AWS EC2, large video uploads (780MB+) were failing or taking too long to complete, even though they worked perfectly on local development environments.

## 🔍 Root Cause Analysis

The issues were caused by several factors:

1. **Docker Container Memory Limits**: Backend container limited to 1GB RAM vs 780MB files
2. **Network Timeouts**: Default timeouts too short for AWS network conditions
3. **Chunked Upload Configuration**: Not optimized for AWS/cloud deployment
4. **System Resource Constraints**: EC2 instance limitations not accounted for
5. **Missing Reverse Proxy Optimizations**: Nginx not configured for large uploads

## 🛠️ AWS-Specific Optimizations Implemented

### 1. Docker Configuration Optimizations

#### Enhanced Docker Compose (`docker-compose.aws.yml`)
```yaml
backend:
  deploy:
    resources:
      limits:
        memory: 3G        # Increased from 1G
        cpus: '1.0'       # Increased from 0.5
      reservations:
        memory: 1.5G      # Increased from 512M
        cpus: '0.5'       # Increased from 0.25
  environment:
    - NODE_OPTIONS=--max-old-space-size=2048
    - UV_THREADPOOL_SIZE=16
    - CHUNK_SIZE=10485760           # 10MB chunks for AWS
    - MAX_CONCURRENT_CHUNKS=2       # Limit concurrent uploads
    - UPLOAD_TIMEOUT=1800000        # 30 minutes
    - CHUNK_TIMEOUT=300000          # 5 minutes per chunk
```

#### AWS-Optimized Dockerfile (`Dockerfile.aws`)
- PM2 process manager for better resource management
- Enhanced memory settings
- Improved health checks
- AWS-specific environment variables

### 2. Chunked Upload Optimizations

#### AWS-Optimized Configuration
```javascript
const CHUNKED_UPLOAD_CONFIG = {
    CHUNK_SIZE: 10 * 1024 * 1024,        // 10MB (reduced from 25MB)
    MAX_CONCURRENT_CHUNKS: 2,             // Limit concurrent uploads
    MAX_RETRIES: 5,                       // Increased retries
    RETRY_DELAY_BASE: 2000,               // Increased base delay
    CHUNK_TIMEOUT: 300000,                // 5 minutes per chunk
    SUPABASE_TIMEOUT: 600000              // 10 minutes for operations
};
```

#### Key Improvements:
- **Smaller Chunk Size**: 10MB chunks for better AWS network handling
- **Concurrent Upload Limiting**: Max 2 concurrent chunks to prevent overload
- **Enhanced Retry Logic**: Exponential backoff with jitter
- **AWS-Specific Error Handling**: Network error detection and handling
- **Timeout Optimizations**: Separate timeouts for different operations

### 3. Server Configuration Optimizations

#### AWS-Optimized Server (`server.aws.js`)
```javascript
// AWS-specific timeout configurations
server.timeout = 1800000;              // 30 minutes
server.keepAliveTimeout = 65000;       // ALB compatibility
server.headersTimeout = 66000;         // Higher than keepAlive

// Enhanced CORS for AWS
const corsOptions = {
    origin: [
        process.env.FRONTEND_URL,
        process.env.AWS_FRONTEND_URL
    ].filter(Boolean),
    maxAge: 86400                       // 24 hours preflight cache
};
```

### 4. System-Level Optimizations

#### Nginx Reverse Proxy Configuration
```nginx
server {
    # Large upload settings
    client_max_body_size 2G;
    client_body_timeout 300s;
    client_header_timeout 300s;
    
    # Proxy timeouts
    proxy_connect_timeout 300s;
    proxy_send_timeout 300s;
    proxy_read_timeout 300s;
    
    # Buffer optimizations
    proxy_buffering off;
    proxy_request_buffering off;
    proxy_max_temp_file_size 0;
}
```

#### System Limits Configuration
```bash
# File descriptor limits
* soft nofile 65536
* hard nofile 65536

# Network optimizations
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.ipv4.tcp_congestion_control = bbr
```

### 5. Memory Management Optimizations

#### Swap Space Setup
- 2GB swap file for better memory management
- Optimized swappiness settings
- Cache pressure adjustments

#### Node.js Memory Settings
```bash
NODE_OPTIONS="--max-old-space-size=2048 --max-semi-space-size=128"
UV_THREADPOOL_SIZE=16
```

## 📋 Deployment Instructions

### Prerequisites
- AWS EC2 instance (m7i-flex.large or larger recommended)
- Ubuntu 20.04+ or Amazon Linux 2
- At least 4GB RAM and 20GB storage
- Docker and Docker Compose installed

### Quick Deployment

1. **Clone the repository**:
   ```bash
   git clone <your-repo-url>
   cd <your-repo-name>
   ```

2. **Make deployment script executable**:
   ```bash
   chmod +x deploy-aws.sh
   ```

3. **Run AWS deployment**:
   ```bash
   ./deploy-aws.sh
   ```

4. **Configure environment variables**:
   ```bash
   nano backend/.env
   # Update Supabase credentials and other settings
   ```

5. **Restart services**:
   ```bash
   docker-compose -f docker-compose.aws.yml restart
   ```

### Manual Deployment Steps

If you prefer manual deployment:

1. **System Setup**:
   ```bash
   # Update system
   sudo apt update && sudo apt upgrade -y
   
   # Install dependencies
   sudo apt install -y docker.io docker-compose nginx
   
   # Setup swap
   sudo fallocate -l 2G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   ```

2. **Configure System Limits**:
   ```bash
   # Add to /etc/security/limits.conf
   echo '* soft nofile 65536' | sudo tee -a /etc/security/limits.conf
   echo '* hard nofile 65536' | sudo tee -a /etc/security/limits.conf
   ```

3. **Deploy Application**:
   ```bash
   docker-compose -f docker-compose.aws.yml up --build -d
   ```

## 🔧 Configuration Files

### Environment Variables (`.env`)
```bash
# AWS Optimizations
AWS_DEPLOYMENT=true
MAX_UPLOAD_SIZE=2147483648      # 2GB
CHUNK_SIZE=10485760             # 10MB
MAX_CONCURRENT_CHUNKS=2
UPLOAD_TIMEOUT=1800000          # 30 minutes
CHUNK_TIMEOUT=300000            # 5 minutes
SUPABASE_TIMEOUT=600000         # 10 minutes

# Node.js Optimizations
NODE_OPTIONS=--max-old-space-size=2048
UV_THREADPOOL_SIZE=16
```

### PM2 Ecosystem (`ecosystem.config.js`)
```javascript
module.exports = {
  apps: [{
    name: 'lms-backend',
    script: 'server.aws.js',
    max_memory_restart: '2G',
    node_args: '--max-old-space-size=2048',
    env_production: {
      NODE_ENV: 'production',
      AWS_DEPLOYMENT: 'true'
    }
  }]
};
```

## 📊 Performance Improvements

### Before Optimization
- ❌ 780MB video uploads failing
- ❌ Timeout errors after 5-10 minutes
- ❌ Memory exhaustion issues
- ❌ Container crashes during uploads

### After Optimization
- ✅ 780MB+ video uploads successful
- ✅ 30-minute timeout allowance
- ✅ Stable memory usage
- ✅ Graceful error handling and retries
- ✅ Concurrent upload management

### Expected Upload Times (780MB file)
- **Local Network**: 2-5 minutes
- **AWS EC2 (optimized)**: 8-15 minutes
- **Depends on**: Instance type, network conditions, Supabase region

## 🔍 Monitoring and Troubleshooting

### Health Checks
```bash
# Check application health
curl http://your-ec2-ip/health

# Check container status
docker-compose -f docker-compose.aws.yml ps

# View logs
docker-compose -f docker-compose.aws.yml logs -f backend
```

### Common Issues and Solutions

#### 1. Upload Still Timing Out
```bash
# Check system resources
htop
free -h
df -h

# Increase timeouts if needed
# Edit docker-compose.aws.yml and increase UPLOAD_TIMEOUT
```

#### 2. Memory Issues
```bash
# Check memory usage
docker stats

# Verify swap is active
swapon --show

# Increase container memory limits if needed
```

#### 3. Network Issues
```bash
# Test Supabase connectivity
curl -I https://your-supabase-url.supabase.co

# Check network performance
ping -c 10 your-supabase-url.supabase.co
```

### Log Analysis
```bash
# Backend logs
docker-compose -f docker-compose.aws.yml logs backend | grep -i "chunk\|upload\|error"

# System logs
sudo journalctl -u docker -f

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

## 🚀 Production Recommendations

### Security
1. **SSL Certificate**: Use Let's Encrypt for HTTPS
2. **Firewall**: Configure UFW or Security Groups
3. **Environment Variables**: Use AWS Secrets Manager
4. **Database**: Use MongoDB Atlas or AWS DocumentDB

### Monitoring
1. **CloudWatch**: Set up AWS CloudWatch monitoring
2. **Alerts**: Configure alerts for high memory/CPU usage
3. **Logs**: Centralize logs with CloudWatch Logs
4. **Health Checks**: Set up ELB health checks

### Scaling
1. **Load Balancer**: Use Application Load Balancer
2. **Auto Scaling**: Configure Auto Scaling Groups
3. **Database**: Use replica sets for MongoDB
4. **CDN**: Use CloudFront for static assets

### Backup
1. **Database**: Regular MongoDB backups
2. **Files**: Backup Supabase storage
3. **Configuration**: Version control all configs
4. **Snapshots**: Regular EC2 snapshots

## 📈 Cost Optimization

### Instance Sizing
- **Development**: t3.medium (2 vCPU, 4GB RAM)
- **Production**: m5.large or c5.large (2 vCPU, 8GB RAM)
- **High Load**: m5.xlarge (4 vCPU, 16GB RAM)

### Storage
- **EBS**: Use gp3 volumes for better performance
- **Supabase**: Monitor storage usage and costs
- **Cleanup**: Regular cleanup of old chunked uploads

## 🔄 Maintenance

### Regular Tasks
```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Clean up Docker
docker system prune -f

# Restart services
docker-compose -f docker-compose.aws.yml restart

# Check disk usage
df -h
du -sh /var/lib/docker/
```

### Backup Script
```bash
#!/bin/bash
# Backup MongoDB
docker exec lms-mongodb mongodump --out /backup/$(date +%Y%m%d)

# Backup environment files
tar -czf /backup/config-$(date +%Y%m%d).tar.gz backend/.env docker-compose.aws.yml
```

## 📞 Support

If you encounter issues:

1. **Check Logs**: Always start with application and system logs
2. **Resource Monitoring**: Monitor CPU, memory, and disk usage
3. **Network Testing**: Test connectivity to external services
4. **Configuration Review**: Verify all environment variables
5. **Community Support**: Check GitHub issues and discussions

## 🎯 Success Metrics

After implementing these optimizations, you should see:

- ✅ Successful upload of 780MB+ video files
- ✅ Upload completion within 30 minutes
- ✅ Stable memory usage below 2GB
- ✅ No container crashes during uploads
- ✅ Proper error handling and retry mechanisms
- ✅ Improved user experience for large file uploads

---

**Note**: These optimizations are specifically designed for AWS EC2 deployment. For other cloud providers, you may need to adjust the configurations accordingly.
