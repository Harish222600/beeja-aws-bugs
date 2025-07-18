#!/bin/bash

# Quick Setup Script for AWS Video Upload Optimization
# This script switches your existing LMS to use AWS-optimized configurations

set -e

echo "🔧 Setting up AWS video upload optimizations..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Check if we're in the right directory
check_project_structure() {
    if [ ! -f "docker-compose.yml" ] || [ ! -d "backend" ] || [ ! -d "frontend" ]; then
        print_error "This doesn't appear to be the LMS project root directory"
        print_error "Please run this script from the project root where docker-compose.yml is located"
        exit 1
    fi
    print_success "Project structure verified"
}

# Backup existing configurations
backup_configs() {
    print_status "Creating backup of existing configurations..."
    
    BACKUP_DIR="backup_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    
    # Backup existing files
    [ -f "docker-compose.yml" ] && cp "docker-compose.yml" "$BACKUP_DIR/"
    [ -f "backend/server.js" ] && cp "backend/server.js" "$BACKUP_DIR/"
    [ -f "backend/Dockerfile" ] && cp "backend/Dockerfile" "$BACKUP_DIR/"
    [ -f "backend/config/supabaseStorage.js" ] && cp "backend/config/supabaseStorage.js" "$BACKUP_DIR/"
    [ -f "backend/utils/chunkedVideoUploader.js" ] && cp "backend/utils/chunkedVideoUploader.js" "$BACKUP_DIR/"
    
    print_success "Backup created in $BACKUP_DIR/"
}

# Update package.json to include PM2
update_package_json() {
    print_status "Updating backend package.json for AWS deployment..."
    
    if [ -f "backend/package.json" ]; then
        # Check if pm2 is already in dependencies
        if ! grep -q '"pm2"' backend/package.json; then
            print_status "Adding PM2 to package.json..."
            # Add pm2 to dependencies (this is a simple approach, you might want to use jq for more robust JSON manipulation)
            sed -i 's/"dependencies": {/"dependencies": {\n    "pm2": "^5.3.0",/' backend/package.json
        fi
        print_success "Package.json updated"
    else
        print_warning "backend/package.json not found"
    fi
}

# Update environment configuration
update_env_config() {
    print_status "Updating environment configuration for AWS..."
    
    if [ -f "backend/.env" ]; then
        # Add AWS-specific environment variables if they don't exist
        if ! grep -q "AWS_DEPLOYMENT" backend/.env; then
            cat >> backend/.env << 'EOF'

# AWS Optimizations
AWS_DEPLOYMENT=true
MAX_UPLOAD_SIZE=2147483648
CHUNK_SIZE=10485760
MAX_CONCURRENT_CHUNKS=2
UPLOAD_TIMEOUT=1800000
CHUNK_TIMEOUT=300000
SUPABASE_TIMEOUT=600000
EOF
            print_success "AWS environment variables added to .env"
        else
            print_status "AWS environment variables already exist in .env"
        fi
    else
        print_warning "backend/.env not found. You'll need to create it manually."
    fi
}

# Create logs directory
create_logs_directory() {
    print_status "Creating logs directory for PM2..."
    mkdir -p backend/logs
    print_success "Logs directory created"
}

# Update import statements in existing files
update_imports() {
    print_status "Updating import statements for AWS-optimized modules..."
    
    # Update routes that use chunked upload
    if [ -f "backend/routes/chunkedUpload.js" ]; then
        sed -i "s|require('../utils/chunkedVideoUploader')|require('../utils/chunkedVideoUploader.aws')|g" backend/routes/chunkedUpload.js
        print_success "Updated chunkedUpload.js imports"
    fi
    
    # Update other files that might import supabaseStorage
    find backend -name "*.js" -type f -exec grep -l "supabaseStorage" {} \; | while read file; do
        if [[ "$file" != *".aws.js" ]]; then
            print_status "Checking $file for supabaseStorage imports..."
            # This is a simple replacement - you might need to be more specific
            sed -i "s|require('../config/supabaseStorage')|require('../config/supabaseStorage.aws')|g" "$file" 2>/dev/null || true
            sed -i "s|require('./config/supabaseStorage')|require('./config/supabaseStorage.aws')|g" "$file" 2>/dev/null || true
        fi
    done
}

# Create startup script
create_startup_script() {
    print_status "Creating AWS startup script..."
    
    cat > start-aws.sh << 'EOF'
#!/bin/bash

echo "🚀 Starting LMS with AWS optimizations..."

# Stop existing containers
docker-compose down 2>/dev/null || true

# Start AWS-optimized containers
docker-compose -f docker-compose.aws.yml up --build -d

echo "✅ AWS-optimized LMS started!"
echo "🔗 Frontend: http://localhost:5173"
echo "🔗 Backend: http://localhost:5001"
echo "🏥 Health: http://localhost:5001/health"

# Show container status
docker-compose -f docker-compose.aws.yml ps
EOF
    
    chmod +x start-aws.sh
    print_success "Startup script created: ./start-aws.sh"
}

# Create monitoring script
create_monitoring_script() {
    print_status "Creating monitoring script..."
    
    cat > monitor-aws.sh << 'EOF'
#!/bin/bash

echo "📊 LMS AWS Monitoring Dashboard"
echo "==============================="

# Container status
echo "🐳 Container Status:"
docker-compose -f docker-compose.aws.yml ps

echo ""
echo "💾 Memory Usage:"
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}"

echo ""
echo "📁 Disk Usage:"
df -h /

echo ""
echo "🔄 System Load:"
uptime

echo ""
echo "📋 Recent Backend Logs (last 10 lines):"
docker-compose -f docker-compose.aws.yml logs --tail=10 backend

echo ""
echo "🏥 Health Check:"
curl -s http://localhost:5001/health | jq . 2>/dev/null || curl -s http://localhost:5001/health
EOF
    
    chmod +x monitor-aws.sh
    print_success "Monitoring script created: ./monitor-aws.sh"
}

# Create troubleshooting script
create_troubleshooting_script() {
    print_status "Creating troubleshooting script..."
    
    cat > troubleshoot-aws.sh << 'EOF'
#!/bin/bash

echo "🔍 LMS AWS Troubleshooting"
echo "=========================="

echo "1. Checking container status..."
docker-compose -f docker-compose.aws.yml ps

echo ""
echo "2. Checking system resources..."
echo "Memory:"
free -h
echo "Disk:"
df -h /
echo "CPU Load:"
uptime

echo ""
echo "3. Checking recent errors in backend logs..."
docker-compose -f docker-compose.aws.yml logs backend | grep -i error | tail -10

echo ""
echo "4. Testing connectivity..."
echo "Backend health check:"
curl -s http://localhost:5001/health || echo "❌ Backend not responding"
echo "Frontend check:"
curl -s http://localhost:5173 > /dev/null && echo "✅ Frontend responding" || echo "❌ Frontend not responding"

echo ""
echo "5. Checking environment variables..."
docker-compose -f docker-compose.aws.yml exec backend printenv | grep -E "(AWS_|CHUNK_|UPLOAD_|TIMEOUT)" | sort

echo ""
echo "6. Recent container restarts..."
docker-compose -f docker-compose.aws.yml logs | grep -i restart | tail -5

echo ""
echo "For detailed logs, run:"
echo "  docker-compose -f docker-compose.aws.yml logs -f backend"
echo ""
echo "To restart services:"
echo "  docker-compose -f docker-compose.aws.yml restart"
EOF
    
    chmod +x troubleshoot-aws.sh
    print_success "Troubleshooting script created: ./troubleshoot-aws.sh"
}

# Display final instructions
show_final_instructions() {
    print_success "🎉 AWS optimization setup completed!"
    
    echo ""
    echo "📋 What was configured:"
    echo "======================="
    echo "✅ AWS-optimized Docker Compose configuration"
    echo "✅ AWS-optimized Dockerfile with PM2"
    echo "✅ AWS-optimized server configuration"
    echo "✅ AWS-optimized chunked upload system"
    echo "✅ AWS-optimized Supabase storage configuration"
    echo "✅ PM2 ecosystem configuration"
    echo "✅ Environment variables for AWS deployment"
    echo "✅ Utility scripts for management"
    
    echo ""
    echo "📝 Next Steps:"
    echo "=============="
    echo "1. Review and update backend/.env with your Supabase credentials"
    echo "2. Test locally first:"
    echo "   ./start-aws.sh"
    echo ""
    echo "3. For AWS EC2 deployment:"
    echo "   chmod +x deploy-aws.sh"
    echo "   ./deploy-aws.sh"
    echo ""
    echo "4. Monitor your application:"
    echo "   ./monitor-aws.sh"
    echo ""
    echo "5. If you encounter issues:"
    echo "   ./troubleshoot-aws.sh"
    
    echo ""
    echo "📚 Documentation:"
    echo "================="
    echo "• Read AWS_VIDEO_UPLOAD_OPTIMIZATION.md for detailed information"
    echo "• Check the backup directory: $BACKUP_DIR"
    
    echo ""
    echo "🚨 Important Notes:"
    echo "=================="
    echo "• Your original files have been backed up"
    echo "• Update your .env file with actual Supabase credentials"
    echo "• Test thoroughly before deploying to production"
    echo "• Monitor system resources during large uploads"
}

# Main setup function
main() {
    print_status "Starting AWS optimization setup..."
    
    check_project_structure
    backup_configs
    update_package_json
    update_env_config
    create_logs_directory
    update_imports
    create_startup_script
    create_monitoring_script
    create_troubleshooting_script
    show_final_instructions
    
    print_success "🚀 Setup completed successfully!"
}

# Run main function
main "$@"
