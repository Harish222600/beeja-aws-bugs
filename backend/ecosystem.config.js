module.exports = {
  apps: [{
    name: 'lms-backend',
    script: 'server.js',
    instances: 1, // Single instance for m7i-flex.large
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 5001
    },
    // Memory and CPU optimizations
    max_memory_restart: '2G',
    node_args: '--max-old-space-size=2048 --max-semi-space-size=128',
    
    // Logging
    log_file: '/app/logs/combined.log',
    out_file: '/app/logs/out.log',
    error_file: '/app/logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    
    // Auto-restart settings
    autorestart: true,
    watch: false,
    max_restarts: 10,
    min_uptime: '10s',
    
    // AWS-specific settings
    kill_timeout: 30000,
    listen_timeout: 10000,
    
    // Environment variables for AWS optimization
    env_production: {
      NODE_ENV: 'production',
      AWS_DEPLOYMENT: 'true',
      MAX_UPLOAD_SIZE: '2147483648', // 2GB
      CHUNK_SIZE: '10485760', // 10MB chunks for AWS
      MAX_CONCURRENT_CHUNKS: '2',
      UPLOAD_TIMEOUT: '1800000', // 30 minutes
      CHUNK_TIMEOUT: '300000', // 5 minutes per chunk
      SUPABASE_TIMEOUT: '600000', // 10 minutes for Supabase operations
      UV_THREADPOOL_SIZE: '16'
    }
  }]
};
