#!/bin/bash

# Network Diagnostics Script for LMS Video Upload Issues
# This script helps diagnose network connectivity and timeout issues

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BACKEND_URL="http://localhost:5001"
NGINX_URL="http://localhost"
ALB_URL="${ALB_URL:-}"
SUPABASE_URL="${SUPABASE_URL:-}"

echo -e "${BLUE}🔍 LMS Network Diagnostics Tool${NC}"
echo "=================================="
echo

# Function to print section headers
print_section() {
    echo -e "${BLUE}📋 $1${NC}"
    echo "----------------------------------------"
}

# Function to print success
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

# Function to print warning
print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Function to print error
print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Function to test HTTP endpoint
test_endpoint() {
    local url=$1
    local name=$2
    local timeout=${3:-10}
    
    echo -n "Testing $name ($url)... "
    
    if curl -s --max-time $timeout --connect-timeout 5 -o /dev/null -w "%{http_code}" "$url" > /tmp/http_code 2>/dev/null; then
        local http_code=$(cat /tmp/http_code)
        if [ "$http_code" = "200" ]; then
            print_success "OK (HTTP $http_code)"
        else
            print_warning "HTTP $http_code"
        fi
    else
        print_error "Failed to connect"
    fi
}

# Function to test upload endpoint
test_upload_endpoint() {
    local url=$1
    local name=$2
    local timeout=${3:-30}
    
    echo -n "Testing $name upload endpoint... "
    
    # Create a small test file
    echo "test content" > /tmp/test_upload.txt
    
    if curl -s --max-time $timeout --connect-timeout 10 \
        -X POST \
        -H "Content-Type: multipart/form-data" \
        -F "test=@/tmp/test_upload.txt" \
        -o /dev/null \
        -w "%{http_code}" \
        "$url/api/v1/course/addSubSection" > /tmp/upload_code 2>/dev/null; then
        local http_code=$(cat /tmp/upload_code)
        if [ "$http_code" = "401" ] || [ "$http_code" = "403" ]; then
            print_success "Endpoint reachable (HTTP $http_code - Auth required)"
        elif [ "$http_code" = "200" ]; then
            print_success "OK (HTTP $http_code)"
        else
            print_warning "HTTP $http_code"
        fi
    else
        print_error "Failed to connect"
    fi
    
    rm -f /tmp/test_upload.txt
}

# 1. System Information
print_section "System Information"
echo "Hostname: $(hostname)"
echo "OS: $(uname -a)"
echo "Date: $(date)"
echo "Uptime: $(uptime)"
echo

# 2. Docker Status
print_section "Docker Container Status"
if command -v docker &> /dev/null; then
    echo "Docker containers:"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || print_error "Cannot access Docker"
    echo
    
    echo "Docker network:"
    docker network ls 2>/dev/null || print_error "Cannot list Docker networks"
    echo
else
    print_warning "Docker not found or not accessible"
fi

# 3. Network Connectivity Tests
print_section "Network Connectivity Tests"

# Test localhost endpoints
test_endpoint "$BACKEND_URL/health" "Backend Health" 10
test_endpoint "$NGINX_URL/health" "Nginx Health" 10
test_endpoint "$NGINX_URL/api/health" "API via Nginx" 10

# Test external services
if [ -n "$SUPABASE_URL" ]; then
    test_endpoint "$SUPABASE_URL" "Supabase" 10
else
    print_warning "SUPABASE_URL not set, skipping Supabase test"
fi

# Test ALB if configured
if [ -n "$ALB_URL" ]; then
    test_endpoint "$ALB_URL/health" "ALB Health" 10
    test_upload_endpoint "$ALB_URL" "ALB" 30
else
    print_warning "ALB_URL not set, skipping ALB tests"
fi

echo

# 4. Port Connectivity
print_section "Port Connectivity"
ports=("80:Nginx" "5001:Backend" "27017:MongoDB" "8080:Nginx-Monitor")

for port_info in "${ports[@]}"; do
    IFS=':' read -r port name <<< "$port_info"
    echo -n "Testing port $port ($name)... "
    
    if nc -z localhost $port 2>/dev/null; then
        print_success "Open"
    else
        print_error "Closed or filtered"
    fi
done
echo

# 5. DNS Resolution
print_section "DNS Resolution Tests"
domains=("google.com" "github.com")

if [ -n "$SUPABASE_URL" ]; then
    # Extract domain from Supabase URL
    supabase_domain=$(echo "$SUPABASE_URL" | sed 's|https\?://||' | cut -d'/' -f1)
    domains+=("$supabase_domain")
fi

for domain in "${domains[@]}"; do
    echo -n "Resolving $domain... "
    if nslookup "$domain" >/dev/null 2>&1; then
        print_success "OK"
    else
        print_error "Failed"
    fi
done
echo

# 6. Upload Endpoint Tests
print_section "Upload Endpoint Tests"
test_upload_endpoint "$BACKEND_URL" "Direct Backend" 30
test_upload_endpoint "$NGINX_URL" "Via Nginx" 30
echo

# 7. Memory and Disk Usage
print_section "System Resources"
echo "Memory Usage:"
free -h
echo

echo "Disk Usage:"
df -h
echo

echo "Load Average:"
uptime
echo

# 8. Network Configuration
print_section "Network Configuration"
echo "Network interfaces:"
ip addr show 2>/dev/null || ifconfig 2>/dev/null || print_error "Cannot show network interfaces"
echo

echo "Routing table:"
ip route 2>/dev/null || route -n 2>/dev/null || print_error "Cannot show routing table"
echo

# 9. Firewall Status
print_section "Firewall Status"
if command -v ufw &> /dev/null; then
    echo "UFW Status:"
    sudo ufw status 2>/dev/null || print_warning "Cannot check UFW status (permission denied)"
elif command -v iptables &> /dev/null; then
    echo "IPTables rules:"
    sudo iptables -L -n 2>/dev/null || print_warning "Cannot check iptables (permission denied)"
else
    print_warning "No firewall tools found"
fi
echo

# 10. Application Logs
print_section "Recent Application Logs"
if command -v docker &> /dev/null; then
    echo "Backend logs (last 10 lines):"
    docker logs --tail 10 lms-backend 2>/dev/null || print_error "Cannot access backend logs"
    echo
    
    echo "Nginx logs (last 10 lines):"
    docker logs --tail 10 lms-nginx 2>/dev/null || print_error "Cannot access nginx logs"
    echo
fi

# 11. Performance Test
print_section "Performance Tests"
echo "Testing network latency to key services:"

# Test latency to localhost
echo -n "Localhost latency... "
if ping -c 3 localhost >/dev/null 2>&1; then
    latency=$(ping -c 3 localhost 2>/dev/null | tail -1 | awk -F'/' '{print $5}')
    print_success "${latency}ms avg"
else
    print_error "Failed"
fi

# Test external latency
echo -n "External latency (8.8.8.8)... "
if ping -c 3 8.8.8.8 >/dev/null 2>&1; then
    latency=$(ping -c 3 8.8.8.8 2>/dev/null | tail -1 | awk -F'/' '{print $5}')
    print_success "${latency}ms avg"
else
    print_error "Failed"
fi
echo

# 12. Configuration Validation
print_section "Configuration Validation"

# Check Docker Compose configuration
if [ -f "docker-compose.aws.yml" ]; then
    echo -n "Docker Compose syntax... "
    if docker-compose -f docker-compose.aws.yml config >/dev/null 2>&1; then
        print_success "Valid"
    else
        print_error "Invalid syntax"
    fi
else
    print_warning "docker-compose.aws.yml not found"
fi

# Check Nginx configuration
if [ -f "nginx.aws.conf" ]; then
    echo -n "Nginx configuration... "
    if docker run --rm -v "$(pwd)/nginx.aws.conf:/etc/nginx/conf.d/default.conf:ro" nginx:alpine nginx -t >/dev/null 2>&1; then
        print_success "Valid"
    else
        print_error "Invalid syntax"
    fi
else
    print_warning "nginx.aws.conf not found"
fi
echo

# 13. Recommendations
print_section "Recommendations"

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    print_warning "Running as root - consider using non-root user"
fi

# Check available memory
available_mem=$(free -m | awk 'NR==2{printf "%.0f", $7}')
if [ "$available_mem" -lt 1000 ]; then
    print_warning "Low available memory (${available_mem}MB) - consider increasing instance size"
fi

# Check disk space
disk_usage=$(df / | awk 'NR==2{print $5}' | sed 's/%//')
if [ "$disk_usage" -gt 80 ]; then
    print_warning "High disk usage (${disk_usage}%) - consider cleanup or increasing storage"
fi

echo
print_section "Diagnostic Complete"
echo "Timestamp: $(date)"
echo "Log saved to: network-diagnostics-$(date +%Y%m%d-%H%M%S).log"

# Save output to log file
exec > >(tee -a "network-diagnostics-$(date +%Y%m%d-%H%M%S).log")

echo -e "${GREEN}✅ Network diagnostics completed successfully!${NC}"
echo
echo "Next steps if issues found:"
echo "1. Check Docker container logs: docker logs <container-name>"
echo "2. Verify environment variables in .env file"
echo "3. Test ALB configuration if using AWS Load Balancer"
echo "4. Monitor system resources during upload attempts"
echo "5. Check Supabase connectivity and credentials"

# Cleanup
rm -f /tmp/http_code /tmp/upload_code
