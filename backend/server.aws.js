require('dotenv').config(); 
const express = require('express')
const app = express();
const http = require('http');
const socketIo = require('socket.io');

// Create HTTP server with AWS optimizations
const server = http.createServer(app);

// AWS-specific timeout configurations
server.timeout = parseInt(process.env.UPLOAD_TIMEOUT) || 1800000; // 30 minutes
server.keepAliveTimeout = 65000; // Slightly higher than ALB timeout
server.headersTimeout = 66000; // Higher than keepAliveTimeout

// packages
const cookieParser = require('cookie-parser');
const cors = require('cors');

// connection to DB and Supabase
const { connectDB, isConnected, getConnectionStatus } = require('./config/database');
const { initializeStorageBuckets } = require('./config/supabaseStorage');

// routes
const userRoutes = require('./routes/user');
const profileRoutes = require('./routes/profile');
const paymentRoutes = require('./routes/payments');
const courseRoutes = require('./routes/course');
const adminRoutes = require('./routes/admin');
const studentProgressRoutes = require('./routes/admin/studentProgress');
const courseAccessRoutes = require('./routes/courseAccess');
const quizRoutes = require('./routes/quiz');
const certificateRoutes = require('./routes/certificate');
const notificationRoutes = require('./routes/notification');
const contactMessageRoutes = require('./routes/contactMessage');
const featuredCoursesRoutes = require('./routes/featuredCourses');
const faqRoutes = require('./routes/faq.js');
const userAnalyticsRoutes = require('./routes/userAnalytics');
const chatRoutes = require('./routes/chat');
const jobRoutes = require('./routes/jobs');
const jobApplicationRoutes = require('./routes/jobApplications');
const recycleBinRoutes = require('./routes/recycleBin');
const chunkedUploadRoutes = require('./routes/chunkedUpload');
const videoPlaybackRoutes = require('./routes/videoPlayback');

// middleware 
app.use(cookieParser());

// CORS configuration for AWS
const corsOptions = {
    origin: [
        'http://localhost:5173', 
        'http://localhost:5174', 
        'http://localhost:3000',
        'http://13.40.145.100:5173',
        // Add your actual AWS domain here
        process.env.FRONTEND_URL,
        process.env.AWS_FRONTEND_URL
    ].filter(Boolean), // Remove undefined values
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400 // 24 hours preflight cache
};

app.use(cors(corsOptions));

// Socket.io configuration with AWS optimizations
const io = socketIo(server, {
    cors: corsOptions,
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'],
    allowEIO3: true
});

// Socket.io connection handling (same as original)
const jwt = require('jsonwebtoken');
const Chat = require('./models/chat');
const Message = require('./models/message');

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Authenticate socket connection
    socket.on('authenticate', async (token) => {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.userId = decoded.id;
            socket.userRole = decoded.accountType;
            
            // Join user-specific room for notifications
            socket.join(decoded.id);
            
            console.log(`User ${decoded.id} authenticated with role ${decoded.accountType} and joined personal room`);
            socket.emit('authenticated', { success: true });
        } catch (error) {
            console.error('Socket authentication failed:', error);
            socket.emit('authentication_error', { message: 'Invalid token' });
        }
    });

    // Join chat room
    socket.on('join_chat', async (chatId) => {
        try {
            if (!socket.userId) {
                socket.emit('error', { message: 'Not authenticated' });
                return;
            }

            // Verify user has access to this chat
            const chat = await Chat.findById(chatId);
            if (!chat) {
                socket.emit('error', { message: 'Chat not found' });
                return;
            }

            const hasAccess = chat.student.toString() === socket.userId || 
                            chat.instructor.toString() === socket.userId || 
                            socket.userRole === 'Admin';

            if (!hasAccess) {
                socket.emit('error', { message: 'Access denied' });
                return;
            }

            socket.join(chatId);
            console.log(`User ${socket.userId} joined chat ${chatId}`);
            socket.emit('joined_chat', { chatId });

        } catch (error) {
            console.error('Error joining chat:', error);
            socket.emit('error', { message: 'Error joining chat' });
        }
    });

    // Leave chat room
    socket.on('leave_chat', (chatId) => {
        socket.leave(chatId);
        console.log(`User ${socket.userId} left chat ${chatId}`);
    });

    // Handle new message
    socket.on('send_message', async (data) => {
        try {
            const { chatId, content, messageType = 'text' } = data;

            if (!socket.userId) {
                socket.emit('error', { message: 'Not authenticated' });
                return;
            }

            // Verify chat access
            const chat = await Chat.findById(chatId);
            if (!chat) {
                socket.emit('error', { message: 'Chat not found' });
                return;
            }

            const hasAccess = chat.student.toString() === socket.userId || 
                            chat.instructor.toString() === socket.userId || 
                            socket.userRole === 'Admin';

            if (!hasAccess) {
                socket.emit('error', { message: 'Access denied' });
                return;
            }

            // Create and save message
            const message = new Message({
                chat: chatId,
                sender: socket.userId,
                messageType,
                content
            });

            await message.save();

            // Update chat's last message
            await Chat.findByIdAndUpdate(chatId, {
                lastMessage: message._id,
                lastMessageTime: new Date()
            });

            // Populate message for broadcasting
            const populatedMessage = await Message.findById(message._id)
                .populate('sender', 'firstName lastName image');

            // Broadcast to all users in the chat room
            io.to(chatId).emit('new_message', populatedMessage);

            console.log(`Message sent in chat ${chatId} by user ${socket.userId}`);

        } catch (error) {
            console.error('Error sending message:', error);
            socket.emit('error', { message: 'Error sending message' });
        }
    });

    // Handle typing indicators
    socket.on('typing_start', (chatId) => {
        socket.to(chatId).emit('user_typing', { userId: socket.userId, typing: true });
    });

    socket.on('typing_stop', (chatId) => {
        socket.to(chatId).emit('user_typing', { userId: socket.userId, typing: false });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// Make io available to routes
app.set('io', io);

// Body parser middleware with AWS-optimized limits
const maxUploadSize = process.env.MAX_UPLOAD_SIZE || '2147483648'; // 2GB default
app.use(express.json({ limit: maxUploadSize }));
app.use(express.urlencoded({ extended: true, limit: maxUploadSize }));

// AWS-optimized timeout middleware
app.use((req, res, next) => {
    const uploadTimeout = parseInt(process.env.UPLOAD_TIMEOUT) || 1800000; // 30 minutes
    res.setTimeout(uploadTimeout, () => {
        console.error('Request timeout:', req.method, req.url);
        if (!res.headersSent) {
            res.status(408).json({
                success: false,
                error: 'Request timeout',
                message: 'The request took too long to process'
            });
        }
    });
    next();
});

// Database connection health check middleware
app.use('/api', (req, res, next) => {
    if (!isConnected()) {
        const status = getConnectionStatus();
        console.error('❌ Database not connected for API request:', {
            method: req.method,
            url: req.url,
            connectionStatus: status
        });
        
        return res.status(503).json({
            success: false,
            message: 'Database connection unavailable. Please try again later.',
            error: 'SERVICE_UNAVAILABLE',
            connectionStatus: status.state
        });
    }
    next();
});

// mount routes
app.use('/api/v1/auth', userRoutes);
app.use('/api/v1/profile', profileRoutes);
app.use('/api/v1/payment', paymentRoutes);
app.use('/api/v1/course', courseRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/admin', studentProgressRoutes);
app.use('/api/v1/course-access', courseAccessRoutes);
app.use('/api/v1/quiz', quizRoutes);
app.use('/api/v1/certificate', certificateRoutes);
app.use('/api/v1/notification', notificationRoutes);
app.use('/api/v1/contact', contactMessageRoutes);
app.use('/api/v1/featured-courses', featuredCoursesRoutes);
app.use('/api/v1/faqs', faqRoutes);
app.use('/api/v1/user', userAnalyticsRoutes);
app.use('/api/v1/chat', chatRoutes);
app.use('/api/v1/jobs', jobRoutes);
app.use('/api/v1/job-applications', jobApplicationRoutes);
app.use('/api/v1/recycle-bin', recycleBinRoutes);
app.use('/api/v1/chunked-upload', chunkedUploadRoutes);
app.use('/api/v1/video', videoPlaybackRoutes);

// Health check route with AWS-specific checks
app.get('/health', (req, res) => {
    const dbStatus = getConnectionStatus();
    const isDbConnected = isConnected();
    
    res.status(isDbConnected ? 200 : 503).json({
        status: isDbConnected ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        database: {
            connected: isDbConnected,
            ...dbStatus
        },
        server: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            version: process.version,
            environment: process.env.NODE_ENV,
            awsDeployment: process.env.AWS_DEPLOYMENT === 'true'
        },
        aws: {
            deployment: process.env.AWS_DEPLOYMENT === 'true',
            maxUploadSize: maxUploadSize,
            chunkSize: process.env.CHUNK_SIZE,
            uploadTimeout: process.env.UPLOAD_TIMEOUT
        }
    });
});

// Database monitoring route
app.get('/api/v1/admin/db-monitor', (req, res) => {
    try {
        const report = connectionMonitor.getDetailedReport();
        res.status(200).json({
            success: true,
            data: report
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error getting database monitoring report',
            error: error.message
        });
    }
});

// Database connection test route
app.get('/api/v1/admin/db-test', async (req, res) => {
    try {
        const testResult = await connectionMonitor.testConnection();
        res.status(testResult.success ? 200 : 503).json({
            success: testResult.success,
            data: testResult
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error testing database connection',
            error: error.message
        });
    }
});

// Default Route
app.get('/', (req, res) => {
    const dbStatus = getConnectionStatus();
    const isDbConnected = isConnected();
    
    res.send(`<div>
        <h2>LMS Backend Server (AWS Optimized)</h2>
        <p>✅ Server is running</p>
        <p>Database Status: ${isDbConnected ? '✅ Connected' : '❌ Disconnected'} (${dbStatus.state})</p>
        <p>Environment: ${process.env.NODE_ENV}</p>
        <p>AWS Deployment: ${process.env.AWS_DEPLOYMENT === 'true' ? '✅ Yes' : '❌ No'}</p>
        <p>Uptime: ${Math.floor(process.uptime())} seconds</p>
        <p><a href="/health">Health Check</a></p>
    </div>`);
});

// 404 handler - must come after all routes
app.use((req, res) => {
    console.log('404 - Route not found:', req.method, req.url);
    
    const isApiRoute = req.url.startsWith('/api/');
    
    if (isApiRoute) {
        res.status(404).json({
            success: false,
            error: 'Route not found',
            message: `Cannot ${req.method} ${req.url}`,
            timestamp: new Date().toISOString()
        });
    } else {
        res.status(404).send(`
            <div>
                <h1>404 - Page Not Found</h1>
                <p>The requested page could not be found.</p>
            </div>
        `);
    }
});

// Enhanced error handling middleware for AWS
app.use((err, req, res, next) => {
    console.error('Global error handler caught:', err);
    console.error('Request URL:', req.url);
    console.error('Request method:', req.method);
    
    const isApiRoute = req.url.startsWith('/api/');
    
    if (err.name === 'MulterError') {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ 
                success: false,
                error: 'File size is too large. Maximum limit is 2GB.',
                code: 'LIMIT_FILE_SIZE',
                maxSize: maxUploadSize
            });
        }
        return res.status(400).json({ 
            success: false,
            error: err.message,
            code: err.code
        });
    }
    
    // Handle timeout errors
    if (err.code === 'ETIMEDOUT' || err.message.includes('timeout')) {
        return res.status(408).json({
            success: false,
            error: 'Request timeout',
            message: 'The request took too long to process. Please try again.',
            code: 'TIMEOUT'
        });
    }
    
    // Only handle errors that haven't been handled by route controllers
    if (!res.headersSent) {
        console.error('Unhandled error:', err);
        
        if (isApiRoute) {
            res.status(500).json({ 
                success: false,
                error: 'An internal server error occurred.',
                message: err.message,
                timestamp: new Date().toISOString(),
                stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
            });
        } else {
            res.status(500).send(`
                <div>
                    <h1>Internal Server Error</h1>
                    <p>An error occurred while processing your request.</p>
                    ${process.env.NODE_ENV === 'development' ? `<pre>${err.stack}</pre>` : ''}
                </div>
            `);
        }
    }
});

// Import seed function and connection monitor
const { seedDatabase } = require('./utils/seedData');
const { connectionMonitor } = require('./utils/connectionMonitor');

// AWS-optimized startup function
const startServer = async () => {
    try {
        console.log('🚀 Starting AWS-optimized LMS Backend Server...');
        console.log('Environment:', process.env.NODE_ENV);
        console.log('AWS Deployment:', process.env.AWS_DEPLOYMENT === 'true');
        
        // Connect to database with retry logic for AWS
        let dbConnected = false;
        let retries = 5;
        
        while (!dbConnected && retries > 0) {
            try {
                await connectDB();
                dbConnected = true;
            } catch (dbError) {
                console.error(`Database connection failed, retries left: ${retries - 1}`, dbError.message);
                retries--;
                if (retries > 0) {
                    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
                }
            }
        }
        
        if (!dbConnected) {
            throw new Error('Failed to connect to database after multiple retries');
        }
        
        // Initialize storage buckets
        await initializeStorageBuckets();
        
        // Run seed data if SEED_DATABASE environment variable is set to true
        if (process.env.SEED_DATABASE === 'true') {
            console.log('🌱 SEED_DATABASE is enabled, running database seeding...');
            try {
                const seedResult = await seedDatabase();
                console.log('✅ Seeding completed:', seedResult.message);
            } catch (seedError) {
                console.error('❌ Seeding failed:', seedError.message);
                console.log('⚠️  Server will continue without seeding...');
            }
        } else {
            console.log('ℹ️  Database seeding skipped (SEED_DATABASE not set to true)');
        }
        
        // Initialize recycle bin cleanup scheduler
        const { scheduleCleanup } = require('./scripts/recycleBinCleanup');
        scheduleCleanup();

        // Start connection monitoring with AWS-optimized intervals
        connectionMonitor.startMonitoring(60000); // Check every 60 seconds for AWS

        // Start the server
        const PORT = process.env.PORT || 5001;
        server.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 AWS-Optimized Server Started on PORT ${PORT}`);
            console.log(`🔌 Socket.IO server is running`);
            console.log('🔍 Database connection monitoring started');
            console.log('📊 Memory limit:', process.env.NODE_OPTIONS);
            console.log('📁 Max upload size:', maxUploadSize);
            console.log('⏱️  Upload timeout:', process.env.UPLOAD_TIMEOUT || '1800000', 'ms');
            console.log('✅ AWS-optimized server initialization completed successfully!');
        });
        
    } catch (error) {
        console.error('❌ Failed to start AWS-optimized server:', error);
        process.exit(1);
    }
};

// Graceful shutdown for AWS
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
        process.exit(0);
    });
});

// Start the server
startServer();
