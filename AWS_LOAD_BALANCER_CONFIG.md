# AWS Load Balancer Configuration for Video Uploads

This guide provides the necessary AWS Application Load Balancer (ALB) configuration to support large video uploads in the LMS application.

## 🚨 Critical Issue

The default AWS Application Load Balancer timeout is **60 seconds**, which is much shorter than our backend timeout of **30 minutes**. This causes connection resets and upload failures for large video files.

## 🔧 Required ALB Configuration

### 1. Target Group Settings

#### Timeout Configuration
```bash
# Increase idle timeout to match backend (30 minutes)
aws elbv2 modify-target-group-attributes \
    --target-group-arn arn:aws:elasticloadbalancing:region:account:targetgroup/your-target-group \
    --attributes Key=deregistration_delay.timeout_seconds,Value=300 \
                Key=load_balancing.cross_zone.enabled,Value=true
```

#### Health Check Settings
```bash
# Configure health checks for container startup time
aws elbv2 modify-target-group \
    --target-group-arn arn:aws:elasticloadbalancing:region:account:targetgroup/your-target-group \
    --health-check-interval-seconds 30 \
    --health-check-timeout-seconds 10 \
    --healthy-threshold-count 2 \
    --unhealthy-threshold-count 3 \
    --health-check-path "/health" \
    --health-check-protocol HTTP \
    --health-check-port traffic-port
```

### 2. Load Balancer Settings

#### Idle Timeout (CRITICAL)
```bash
# Set ALB idle timeout to 30 minutes (1800 seconds)
aws elbv2 modify-load-balancer-attributes \
    --load-balancer-arn arn:aws:elasticloadbalancing:region:account:loadbalancer/app/your-alb \
    --attributes Key=idle_timeout.timeout_seconds,Value=1800
```

#### Connection Settings
```bash
# Enable connection draining and set appropriate timeout
aws elbv2 modify-load-balancer-attributes \
    --load-balancer-arn arn:aws:elasticloadbalancing:region:account:loadbalancer/app/your-alb \
    --attributes Key=deletion_protection.enabled,Value=false \
                Key=access_logs.s3.enabled,Value=true \
                Key=access_logs.s3.bucket,Value=your-alb-logs-bucket
```

### 3. Listener Rules for Upload Endpoints

#### Priority Rules for Video Upload Paths
```bash
# Create rule for video upload endpoints with extended timeout
aws elbv2 create-rule \
    --listener-arn arn:aws:elasticloadbalancing:region:account:listener/app/your-alb/listener-id \
    --priority 10 \
    --conditions Field=path-pattern,Values="/api/v1/course/addSubSection,/api/v1/course/updateSubSection" \
    --actions Type=forward,TargetGroupArn=arn:aws:elasticloadbalancing:region:account:targetgroup/your-target-group
```

## 🏗️ Terraform Configuration

If using Terraform, here's the complete configuration:

```hcl
# Application Load Balancer
resource "aws_lb" "lms_alb" {
  name               = "lms-application-lb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb_sg.id]
  subnets           = var.public_subnet_ids

  # CRITICAL: Set idle timeout to 30 minutes for video uploads
  idle_timeout = 1800

  enable_deletion_protection = false

  # Enable access logs for debugging
  access_logs {
    bucket  = aws_s3_bucket.alb_logs.bucket
    prefix  = "lms-alb"
    enabled = true
  }

  tags = {
    Name        = "LMS-ALB"
    Environment = var.environment
  }
}

# Target Group with extended timeouts
resource "aws_lb_target_group" "lms_tg" {
  name     = "lms-target-group"
  port     = 80
  protocol = "HTTP"
  vpc_id   = var.vpc_id

  # Health check configuration
  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 10
    interval            = 30
    path                = "/health"
    matcher             = "200"
    port                = "traffic-port"
    protocol            = "HTTP"
  }

  # Target group attributes for large uploads
  deregistration_delay = 300
  
  # Enable cross-zone load balancing
  load_balancing_cross_zone_enabled = true

  tags = {
    Name        = "LMS-TG"
    Environment = var.environment
  }
}

# Listener with rules for different endpoints
resource "aws_lb_listener" "lms_listener" {
  load_balancer_arn = aws_lb.lms_alb.arn
  port              = "80"
  protocol          = "HTTP"

  # Default action
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.lms_tg.arn
  }
}

# Special rule for video upload endpoints
resource "aws_lb_listener_rule" "video_upload_rule" {
  listener_arn = aws_lb_listener.lms_listener.arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.lms_tg.arn
  }

  condition {
    path_pattern {
      values = [
        "/api/v1/course/addSubSection",
        "/api/v1/course/updateSubSection",
        "/api/v1/chunked-upload/*"
      ]
    }
  }
}

# Security Group for ALB
resource "aws_security_group" "alb_sg" {
  name_prefix = "lms-alb-sg"
  vpc_id      = var.vpc_id

  # HTTP access
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # HTTPS access (if using SSL)
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Outbound traffic
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "LMS-ALB-SG"
    Environment = var.environment
  }
}
```

## 🔒 Security Group Configuration

### EC2 Instance Security Group
```bash
# Allow traffic from ALB to EC2 instances
aws ec2 authorize-security-group-ingress \
    --group-id sg-your-ec2-security-group \
    --protocol tcp \
    --port 80 \
    --source-group sg-your-alb-security-group

# Allow health check traffic
aws ec2 authorize-security-group-ingress \
    --group-id sg-your-ec2-security-group \
    --protocol tcp \
    --port 8080 \
    --source-group sg-your-alb-security-group
```

### ALB Security Group
```bash
# Allow HTTP traffic from internet
aws ec2 authorize-security-group-ingress \
    --group-id sg-your-alb-security-group \
    --protocol tcp \
    --port 80 \
    --cidr 0.0.0.0/0

# Allow HTTPS traffic from internet (if using SSL)
aws ec2 authorize-security-group-ingress \
    --group-id sg-your-alb-security-group \
    --protocol tcp \
    --port 443 \
    --cidr 0.0.0.0/0
```

## 📊 CloudWatch Monitoring

### ALB Metrics to Monitor
```bash
# Create CloudWatch alarms for ALB
aws cloudwatch put-metric-alarm \
    --alarm-name "LMS-ALB-HighLatency" \
    --alarm-description "ALB response time is high" \
    --metric-name TargetResponseTime \
    --namespace AWS/ApplicationELB \
    --statistic Average \
    --period 300 \
    --threshold 30.0 \
    --comparison-operator GreaterThanThreshold \
    --dimensions Name=LoadBalancer,Value=app/lms-application-lb/your-lb-id \
    --evaluation-periods 2

# Monitor target health
aws cloudwatch put-metric-alarm \
    --alarm-name "LMS-ALB-UnhealthyTargets" \
    --alarm-description "ALB has unhealthy targets" \
    --metric-name UnHealthyHostCount \
    --namespace AWS/ApplicationELB \
    --statistic Average \
    --period 60 \
    --threshold 0 \
    --comparison-operator GreaterThanThreshold \
    --dimensions Name=TargetGroup,Value=targetgroup/lms-target-group/your-tg-id \
    --evaluation-periods 2
```

## 🔍 Troubleshooting Commands

### Check ALB Configuration
```bash
# Get current ALB attributes
aws elbv2 describe-load-balancer-attributes \
    --load-balancer-arn arn:aws:elasticloadbalancing:region:account:loadbalancer/app/your-alb

# Check target group health
aws elbv2 describe-target-health \
    --target-group-arn arn:aws:elasticloadbalancing:region:account:targetgroup/your-target-group

# View ALB access logs
aws s3 ls s3://your-alb-logs-bucket/lms-alb/ --recursive
```

### Test Upload Endpoints
```bash
# Test health endpoint through ALB
curl -v http://your-alb-dns-name/health

# Test API endpoint
curl -v http://your-alb-dns-name/api/v1/course/getAllCourses

# Monitor connection during upload
curl -v -X POST \
    -H "Content-Type: multipart/form-data" \
    -F "video=@test-video.mp4" \
    http://your-alb-dns-name/api/v1/course/addSubSection \
    --max-time 1800  # 30 minutes timeout
```

## 🚀 Deployment Checklist

### Pre-Deployment
- [ ] Verify ALB idle timeout is set to 1800 seconds
- [ ] Confirm target group health check settings
- [ ] Test security group rules
- [ ] Enable ALB access logs
- [ ] Set up CloudWatch monitoring

### Post-Deployment
- [ ] Test video upload through ALB
- [ ] Monitor ALB metrics in CloudWatch
- [ ] Verify target health status
- [ ] Check application logs for proxy headers
- [ ] Test failover scenarios

### Performance Validation
- [ ] Upload test video files of various sizes
- [ ] Monitor response times during uploads
- [ ] Verify no connection resets occur
- [ ] Check memory usage on EC2 instances
- [ ] Validate error handling for failed uploads

## 📈 Expected Performance

### Before ALB Configuration
- ❌ Uploads fail after 60 seconds
- ❌ Connection reset errors
- ❌ Inconsistent upload behavior

### After ALB Configuration
- ✅ Uploads complete within 30 minutes
- ✅ No connection resets
- ✅ Consistent upload performance
- ✅ Proper error handling

## 🔄 Maintenance

### Regular Tasks
```bash
# Check ALB health weekly
aws elbv2 describe-load-balancers --names lms-application-lb

# Monitor target group health
aws elbv2 describe-target-health --target-group-arn your-target-group-arn

# Review access logs monthly
aws s3 sync s3://your-alb-logs-bucket/lms-alb/ ./alb-logs/
```

### Scaling Considerations
- Monitor ALB request count and adjust target group size
- Consider using multiple availability zones
- Implement auto-scaling for EC2 instances
- Use CloudFront for static content delivery

## 📞 Support

If uploads still fail after ALB configuration:

1. **Check ALB Logs**: Review access logs for 5xx errors
2. **Monitor CloudWatch**: Check ALB and target metrics
3. **Verify Timeouts**: Ensure all timeout values are aligned
4. **Test Connectivity**: Use curl to test upload endpoints
5. **Review Security Groups**: Confirm traffic flow is allowed

---

**Note**: These configurations are specifically for AWS Application Load Balancer. For Network Load Balancer or Classic Load Balancer, different settings may apply.
