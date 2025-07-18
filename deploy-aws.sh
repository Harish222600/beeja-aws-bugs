#!/bin/bash

# AWS Deployment Script for LMS with Large Video Upload Optimization
# This script deploys the LMS application with AWS-specific optimizations

set -e

echo "🚀 Starting AWS-optimized LMS deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running on AWS EC2
check_aws_environment() {
    print_status "Checking AWS environment..."
    
    if curl -s --max-time 5 http://169.254.169.254/latest/meta-data/instance-id > /dev/null 2>&1; then
        INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)
        INSTANCE_TYPE=$(curl -s http://169.254.169.254/latest/meta-data/instance-type)
        AZ=$(curl -s http://169.254.169.254/latest/meta-data/placement/availability-zone)
        
        print_success "Running on AWS EC2 instance: $INSTANCE_ID ($INSTANCE_TYPE) in $AZ"
        
        # Check instance specifications
        if [[ "$INSTANCE_TYPE" == *"micro"* ]] || [[ "$INSTANCE_TYPE" == *"nano"* ]]; then
            print_warning "Instance type $INSTANCE_TYPE may not be suitable for large video uploads"
            print_warning "Consider upgrading to t3.small or larger for better performance"
        fi
    else
        print_warning "Not running on AWS EC2 or metadata service unavailable"
    fi
}

# Check system resources
check_system_resources() {
    print_status "Checking system resources..."
    
    # Check available memory
    TOTAL_MEM=$(free -m | awk 'NR==2{printf "%.0f", $2}')
    AVAILABLE_MEM=$(free -m | awk 'NR==2{printf "%.0f", $7}')
    
    print_status "Total Memory: ${TOTAL_MEM}MB, Available: ${AVAILABLE_MEM}MB"
    
    if [ "$TOTAL_MEM" -lt 2048 ]; then
        print_warning "System has less than 2GB RAM. Large video uploads may fail."
        print_warning "Consider adding swap space or upgrading instance."
    fi
    
    # Check available disk space
    DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
    AVAILABLE_SPACE=$(df -h / | awk 'NR==2 {print $4}')
    
    print_status "Disk usage: ${DISK_USAGE}%, Available space: ${AVAILABLE_SPACE}"
    
    if [ "$DISK_USAGE" -gt 80 ]; then
        print_warning "Disk usage is above 80%. Consider cleaning up or expanding storage."
    fi
}

# Setup swap space for better memory management
setup_swap() {
    print_status "Setting up swap space for large video processing..."
    
    if [ ! -f /swapfile ]; then
        print_status "Creating 2GB swap file..."
        sudo fallocate -l 2G /swapfile
        sudo chmod 600 /swapfile
        sudo mkswap /swapfile
        sudo swapon /swapfile
        
        # Make swap permanent
        echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
        
        print_success "Swap space created and activated"
    else
        print_status "Swap file already exists"
    fi
    
    # Optimize swap settings for video processing
    echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
    echo 'vm.vfs_cache_pressure=50' | sudo tee -a /etc/sysctl.conf
    sudo sysctl -p
}

# Install required packages
install_dependencies() {
    print_status "Installing system dependencies..."
    
    sudo apt-get update
    sudo apt-get install -y \
        curl \
        wget \
        git \
        htop \
        iotop \
        nethogs \
        docker.io \
        docker-compose \
        nginx \
        certbot \
        python3-certbot-nginx
    
    # Start and enable Docker
    sudo systemctl start docker
    sudo systemctl enable docker
    
    # Add current user to docker group
    sudo usermod -aG docker $USER
    
    print_success "System dependencies installed"
}

# Configure system limits for large uploads
configure_system_limits() {
    print_status "Configuring system limits for large video uploads..."
    
    # Increase file descriptor limits
    echo '* soft nofile 65536' | sudo tee -a /etc/security/limits.conf
    echo '* hard nofile 65536' | sudo tee -a /etc/security/limits.conf
    echo 'root soft nofile 65536' | sudo tee -a /etc/security/limits.conf
    echo 'root hard nofile 65536' | sudo tee -a /etc/security/limits.conf
    
    # Configure kernel parameters for network performance
    sudo tee -a /etc/sysctl.conf << EOF

# AWS Network Optimizations for Large Uploads
net.core.rmem_default = 262144
net.core.rmem_max = 16777216
net.core.wmem_default = 262144
net.core.wmem_max = 16777216
net.ipv4.tcp_rmem = 4096 65536 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216
net.core.netdev_max_backlog = 5000
net.ipv4.tcp_congestion_control = bbr
EOF
    
    sudo sysctl -p
    
    print_success "System limits configured for large uploads"
}

# Setup Nginx reverse proxy with upload optimizations
setup_nginx() {
    print_status "Setting up Nginx reverse proxy with upload optimizations..."
    
    # Note: Using containerized nginx instead of system nginx for better integration
    print_status "Nginx will be deployed as a Docker container with the application"
    print_status "Using nginx.aws.conf for optimized reverse proxy configuration"
    
    # Validate nginx configuration exists
    if [ ! -f "nginx.aws.conf" ]; then
        print_error "nginx.aws.conf not found! This file is required for the reverse proxy setup."
        exit 1
    fi
    
    # Validate nginx configuration syntax
    if docker run --rm -v "$(pwd)/nginx.aws.conf:/etc/nginx/conf.d/default.conf:ro" nginx:1.25-alpine nginx -t >/dev/null 2>&1; then
        print_success "Nginx configuration validated successfully"
    else
        print_error "Nginx configuration has syntax errors"
        docker run --rm -v "$(pwd)/nginx.aws.conf:/etc/nginx/conf.d/default.conf:ro" nginx:1.25-alpine nginx -t
        exit 1
    fi
    
    print_success "Nginx reverse proxy configuration ready"
}

# Create environment file for AWS
create_aws_env() {
    print_status "Creating AWS-optimized environment configuration..."
    
    if [ ! -f backend/.env ]; then
        print_warning "backend/.env not found. Creating template..."
        
        cat > backend/.env << 'EOF'
# AWS-Optimized Environment Configuration
NODE_ENV=production
PORT=5001

# Database
MONGODB_URL=mongodb://mongodb:27017/lms

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Supabase Configuration
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# AWS Optimizations
AWS_DEPLOYMENT=true
MAX_UPLOAD_SIZE=2147483648
CHUNK_SIZE=10485760
MAX_CONCURRENT_CHUNKS=2
UPLOAD_TIMEOUT=1800000
CHUNK_TIMEOUT=300000
SUPABASE_TIMEOUT=600000

# Frontend URL
FRONTEND_URL=http://localhost:5173

# Email Configuration (optional)
MAIL_HOST=smtp.gmail.com
MAIL_USER=your-email@gmail.com
MAIL_PASS=your-app-password

# Razorpay (optional)
RAZORPAY_KEY=your-razorpay-key
RAZORPAY_SECRET=your-razorpay-secret
EOF
        
        print_warning "Please edit backend/.env with your actual configuration values"
        print_warning "Especially update Supabase credentials and JWT secret"
    else
        print_success "Environment file exists"
    fi
}

# Deploy with Docker Compose
deploy_application() {
    print_status "Deploying AWS-optimized LMS application..."
    
    # Stop existing containers
    if [ -f docker-compose.yml ]; then
        print_status "Stopping existing containers..."
        docker-compose down
    fi
    
    # Build and start AWS-optimized containers
    print_status "Building and starting AWS-optimized containers..."
    docker-compose -f docker-compose.aws.yml up --build -d
    
    # Wait for services to be ready
    print_status "Waiting for services to be ready..."
    sleep 30
    
    # Check service health
    check_service_health
}

# Check service health
check_service_health() {
    print_status "Checking service health..."
    
    # Check backend health
    for i in {1..10}; do
        if curl -s http://localhost:5001/health > /dev/null; then
            print_success "Backend service is healthy"
            break
        else
            print_status "Waiting for backend service... (attempt $i/10)"
            sleep 10
        fi
        
        if [ $i -eq 10 ]; then
            print_error "Backend service failed to start"
            docker-compose -f docker-compose.aws.yml logs backend
            exit 1
        fi
    done
    
    # Check frontend health
    for i in {1..5}; do
        if curl -s http://localhost:5173 > /dev/null; then
            print_success "Frontend service is healthy"
            break
        else
            print_status "Waiting for frontend service... (attempt $i/5)"
            sleep 5
        fi
        
        if [ $i -eq 5 ]; then
            print_error "Frontend service failed to start"
            docker-compose -f docker-compose.aws.yml logs frontend
            exit 1
        fi
    done
}

# Display deployment information
show_deployment_info() {
    print_success "🎉 AWS-optimized LMS deployment completed!"
    
    echo ""
    echo "📋 Deployment Information:"
    echo "=========================="
    
    if [ -n "$INSTANCE_ID" ]; then
        PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)
        echo "🌐 Public IP: $PUBLIC_IP"
        echo "🔗 Application URL: http://$PUBLIC_IP"
        echo "🏥 Health Check: http://$PUBLIC_IP/health"
    else
        echo "🔗 Application URL: http://localhost"
        echo "🏥 Health Check: http://localhost/health"
    fi
    
    echo ""
    echo "📊 Service Status:"
    echo "=================="
    docker-compose -f docker-compose.aws.yml ps
    
    echo ""
    echo "🔧 AWS Optimizations Applied:"
    echo "============================="
    echo "✅ 10MB chunk size for optimal AWS performance"
    echo "✅ 2 concurrent chunk uploads to prevent overload"
    echo "✅ 30-minute upload timeout for large files"
    echo "✅ 3GB memory limit for backend container"
    echo "✅ Enhanced error handling and retry logic"
    echo "✅ Nginx reverse proxy with upload optimizations"
    echo "✅ System limits configured for large uploads"
    
    echo ""
    echo "📝 Next Steps:"
    echo "=============="
    echo "1. Update backend/.env with your actual Supabase credentials"
    echo "2. Configure your domain name in Nginx (optional)"
    echo "3. Set up SSL certificate with Let's Encrypt (recommended)"
    echo "4. Monitor logs: docker-compose -f docker-compose.aws.yml logs -f"
    echo "5. Test large video upload functionality"
    
    echo ""
    echo "🚨 Important Notes:"
    echo "=================="
    echo "• Large video uploads (780MB+) should now work properly"
    echo "• Monitor system resources during heavy upload activity"
    echo "• Consider setting up CloudWatch monitoring for production"
    echo "• Backup your data regularly"
}

# Main deployment flow
main() {
    print_status "Starting AWS-optimized LMS deployment process..."
    
    check_aws_environment
    check_system_resources
    setup_swap
    install_dependencies
    configure_system_limits
    setup_nginx
    create_aws_env
    deploy_application
    show_deployment_info
    
    print_success "🚀 AWS deployment completed successfully!"
}

# Run main function
main "$@"
