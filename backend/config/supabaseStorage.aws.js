const supabase = require('./supabase');

// Storage bucket configuration
const STORAGE_BUCKETS = {
    IMAGES: 'images',
    VIDEOS: 'videos', 
    DOCUMENTS: 'documents',
    PROFILES: 'profiles',
    COURSES: 'courses',
    CHAT: 'chat-files'
};

// AWS-optimized file size limits (in bytes)
const FILE_SIZE_LIMITS = {
    IMAGE: 10 * 1024 * 1024,    // 10MB
    VIDEO: 2 * 1024 * 1024 * 1024, // 2GB (with chunked upload support)
    DOCUMENT: 50 * 1024 * 1024, // 50MB
    PROFILE: 5 * 1024 * 1024    // 5MB
};

// AWS-optimized chunked upload configuration
const CHUNKED_UPLOAD_CONFIG = {
    CHUNK_THRESHOLD: 100 * 1024 * 1024, // 100MB - files larger than this will be chunked
    MAX_DIRECT_UPLOAD: 50 * 1024 * 1024, // 50MB max for direct upload (Supabase free tier)
    SUPABASE_FREE_LIMIT: 50 * 1024 * 1024, // 50MB Supabase free tier limit
    CHUNK_SIZE: parseInt(process.env.CHUNK_SIZE) || 10 * 1024 * 1024, // 10MB chunks for AWS (configurable)
    MAX_RETRIES: 5, // Increased retries for AWS network conditions
    RETRY_DELAY_BASE: 2000, // Increased base delay for AWS (2 seconds)
    MAX_CONCURRENT_CHUNKS: parseInt(process.env.MAX_CONCURRENT_CHUNKS) || 2, // Limit concurrent uploads
    CHUNK_TIMEOUT: parseInt(process.env.CHUNK_TIMEOUT) || 300000, // 5 minutes per chunk
    SUPABASE_TIMEOUT: parseInt(process.env.SUPABASE_TIMEOUT) || 600000, // 10 minutes for Supabase operations
    CONNECTION_TIMEOUT: 30000, // 30 seconds connection timeout
    SOCKET_TIMEOUT: 60000 // 60 seconds socket timeout
};

// Allowed file types
const ALLOWED_FILE_TYPES = {
    IMAGES: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
    VIDEOS: [
        'video/mp4', 
        'video/mpeg', 
        'video/quicktime', 
        'video/x-msvideo', 
        'video/webm',
        'video/x-matroska', // .mkv files
        'video/x-flv',      // .flv files
        'video/x-ms-wmv',   // .wmv files
        'application/octet-stream' // Sometimes .mkv files are detected as this
    ],
    DOCUMENTS: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
};

/**
 * AWS-optimized storage bucket initialization
 */
const initializeStorageBuckets = async () => {
    try {
        console.log('🗄️ Initializing AWS-optimized Supabase storage buckets...');
        
        // Add timeout for bucket operations
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Bucket initialization timeout')), 30000);
        });
        
        // Get existing buckets with timeout
        const listBucketsPromise = supabase.storage.listBuckets();
        const { data: existingBuckets, error: listError } = await Promise.race([
            listBucketsPromise,
            timeoutPromise
        ]);
        
        if (listError) {
            console.error('❌ Error listing buckets:', listError);
            console.log('⚠️  Please ensure your Supabase service role key has proper permissions');
            console.log('📋 Manual bucket creation required. See SUPABASE_MIGRATION.md for instructions');
            return;
        }

        const existingBucketNames = existingBuckets.map(bucket => bucket.name);
        console.log('📋 Existing buckets:', existingBucketNames);
        
        let bucketsCreated = 0;
        let bucketsExisted = 0;
        let bucketsFailed = 0;
        
        // Create missing buckets with AWS-optimized settings
        for (const [key, bucketName] of Object.entries(STORAGE_BUCKETS)) {
            if (!existingBucketNames.includes(bucketName)) {
                console.log(`📁 Creating AWS-optimized bucket: ${bucketName}`);
                
                try {
                    const createBucketPromise = supabase.storage.createBucket(bucketName, {
                        public: true, // Make buckets public for easier access
                        allowedMimeTypes: getAllowedMimeTypes(bucketName),
                        fileSizeLimit: getFileSizeLimit(bucketName)
                    });
                    
                    const { data, error } = await Promise.race([
                        createBucketPromise,
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Create bucket timeout')), 15000))
                    ]);

                    if (error) {
                        console.error(`❌ Error creating bucket ${bucketName}:`, error.message);
                        bucketsFailed++;
                        
                        // Provide specific guidance for common errors
                        if (error.message.includes('row-level security policy')) {
                            console.log(`💡 RLS Policy Error: Please create bucket '${bucketName}' manually in Supabase Dashboard`);
                        } else if (error.message.includes('maximum allowed size')) {
                            console.log(`💡 Size Error: Please adjust file size limits for bucket '${bucketName}'`);
                        }
                    } else {
                        console.log(`✅ Created AWS-optimized bucket: ${bucketName}`);
                        bucketsCreated++;
                    }
                } catch (createError) {
                    console.error(`❌ Failed to create bucket ${bucketName}:`, createError.message);
                    bucketsFailed++;
                }
            } else {
                console.log(`✅ Bucket already exists: ${bucketName}`);
                bucketsExisted++;
            }
        }
        
        // Summary
        console.log('\n📊 AWS-OPTIMIZED BUCKET INITIALIZATION SUMMARY:');
        console.log(`   ✅ Existing buckets: ${bucketsExisted}`);
        console.log(`   🆕 Created buckets: ${bucketsCreated}`);
        console.log(`   ❌ Failed buckets: ${bucketsFailed}`);
        console.log(`   🔧 Chunk size: ${(CHUNKED_UPLOAD_CONFIG.CHUNK_SIZE / 1024 / 1024).toFixed(0)}MB`);
        console.log(`   ⏱️  Chunk timeout: ${CHUNKED_UPLOAD_CONFIG.CHUNK_TIMEOUT / 1000}s`);
        console.log(`   🔄 Max retries: ${CHUNKED_UPLOAD_CONFIG.MAX_RETRIES}`);
        
        if (bucketsFailed > 0) {
            console.log('\n⚠️  MANUAL ACTION REQUIRED:');
            console.log('   Some buckets failed to create automatically.');
            console.log('   Please create them manually in your Supabase Dashboard:');
            console.log('   1. Go to Storage in your Supabase project');
            console.log('   2. Create the following buckets as PUBLIC:');
            
            for (const [key, bucketName] of Object.entries(STORAGE_BUCKETS)) {
                if (!existingBucketNames.includes(bucketName)) {
                    console.log(`      - ${bucketName}`);
                }
            }
            
            console.log('\n   3. Set appropriate file size limits and MIME types');
            console.log('   4. Restart the server after creating buckets');
            console.log('\n   📖 See SUPABASE_MIGRATION.md for detailed instructions');
        } else {
            console.log('\n🎉 All AWS-optimized storage buckets are ready!');
        }
        
        console.log('🗄️ AWS-optimized storage buckets initialization completed');
    } catch (error) {
        console.error('❌ Error initializing AWS-optimized storage buckets:', error);
        console.log('\n⚠️  FALLBACK MODE ACTIVATED:');
        console.log('   - File uploads will use Cloudinary as fallback');
        console.log('   - Please check your Supabase configuration');
        console.log('   - Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are correct');
        console.log('   - Check AWS network connectivity to Supabase');
    }
};

/**
 * Get allowed MIME types for a bucket
 */
const getAllowedMimeTypes = (bucketName) => {
    switch (bucketName) {
        case STORAGE_BUCKETS.IMAGES:
        case STORAGE_BUCKETS.PROFILES:
        case STORAGE_BUCKETS.COURSES:
        case STORAGE_BUCKETS.CHAT:
            return ALLOWED_FILE_TYPES.IMAGES;
        case STORAGE_BUCKETS.VIDEOS:
            return ALLOWED_FILE_TYPES.VIDEOS;
        case STORAGE_BUCKETS.DOCUMENTS:
            return ALLOWED_FILE_TYPES.DOCUMENTS;
        default:
            return [...ALLOWED_FILE_TYPES.IMAGES, ...ALLOWED_FILE_TYPES.VIDEOS, ...ALLOWED_FILE_TYPES.DOCUMENTS];
    }
};

/**
 * Get file size limit for a bucket
 */
const getFileSizeLimit = (bucketName) => {
    switch (bucketName) {
        case STORAGE_BUCKETS.VIDEOS:
            return FILE_SIZE_LIMITS.VIDEO;
        case STORAGE_BUCKETS.DOCUMENTS:
            return FILE_SIZE_LIMITS.DOCUMENT;
        case STORAGE_BUCKETS.PROFILES:
            return FILE_SIZE_LIMITS.PROFILE;
        default:
            return FILE_SIZE_LIMITS.IMAGE;
    }
};

/**
 * Get the appropriate bucket for a file type
 */
const getBucketForFileType = (mimetype, folder = '', originalname = '') => {
    console.log('🗂️ Determining bucket for:', { mimetype, folder, originalname });
    
    // Enhanced video detection - check both mimetype and file extension
    const isVideoByMimetype = ALLOWED_FILE_TYPES.VIDEOS && ALLOWED_FILE_TYPES.VIDEOS.includes(mimetype);
    const isVideoByExtension = originalname && /\.(mp4|mov|avi|wmv|mkv|flv|webm)$/i.test(originalname);
    const isMkvFile = originalname && /\.mkv$/i.test(originalname);
    const isOctetStreamMkv = mimetype === 'application/octet-stream' && isMkvFile;
    
    // Check if it's a video (by mimetype, extension, or special MKV case)
    if (isVideoByMimetype || isVideoByExtension || isOctetStreamMkv) {
        console.log('📹 Using VIDEOS bucket (detected by:', {
            mimetype: isVideoByMimetype,
            extension: isVideoByExtension,
            mkvSpecial: isOctetStreamMkv
        }, ')');
        return STORAGE_BUCKETS.VIDEOS;
    }
    
    // Check if it's a document
    if (ALLOWED_FILE_TYPES.DOCUMENTS && ALLOWED_FILE_TYPES.DOCUMENTS.includes(mimetype)) {
        console.log('📄 Using DOCUMENTS bucket');
        return STORAGE_BUCKETS.DOCUMENTS;
    }
    
    // Check if it's an image and determine bucket based on folder
    if (ALLOWED_FILE_TYPES.IMAGES && ALLOWED_FILE_TYPES.IMAGES.includes(mimetype)) {
        if (folder && folder.includes('profile')) {
            console.log('👤 Using PROFILES bucket');
            return STORAGE_BUCKETS.PROFILES;
        }
        if (folder && (folder.includes('course') || folder === 'courses')) {
            console.log('📚 Using COURSES bucket');
            return STORAGE_BUCKETS.COURSES;
        }
        if (folder && folder.includes('chat')) {
            console.log('💬 Using CHAT bucket');
            return STORAGE_BUCKETS.CHAT;
        }
        console.log('🖼️ Using default IMAGES bucket');
        return STORAGE_BUCKETS.IMAGES;
    }
    
    // Default to images bucket
    console.log('🔄 Using fallback IMAGES bucket');
    return STORAGE_BUCKETS.IMAGES;
};

/**
 * AWS-optimized file validation
 */
const validateFile = (file, bucket) => {
    const errors = [];
    
    // Enhanced video detection - check both mimetype and file extension
    const isVideoByMimetype = file.mimetype.startsWith('video/');
    const isVideoByExtension = file.originalname && /\.(mp4|mov|avi|wmv|mkv|flv|webm)$/i.test(file.originalname);
    const isVideo = isVideoByMimetype || isVideoByExtension;
    
    // Special handling for .mkv files that might be detected as application/octet-stream
    const isMkvFile = file.originalname && /\.mkv$/i.test(file.originalname);
    const isOctetStreamMkv = file.mimetype === 'application/octet-stream' && isMkvFile;
    
    console.log('AWS file validation details:', {
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        sizeMB: (file.size / 1024 / 1024).toFixed(2),
        isVideoByMimetype,
        isVideoByExtension,
        isVideo,
        isMkvFile,
        isOctetStreamMkv,
        bucket,
        willUseChunkedUpload: isVideo && file.size > CHUNKED_UPLOAD_CONFIG.CHUNK_THRESHOLD
    });
    
    // Check file size - for videos, we allow larger sizes with chunked upload
    const sizeLimit = getFileSizeLimit(bucket);
    
    // For videos larger than chunk threshold, we'll use chunked upload
    if (!isVideo && file.size > sizeLimit) {
        errors.push(`File size (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds limit (${(sizeLimit / 1024 / 1024).toFixed(2)}MB)`);
    } else if (isVideo && file.size > sizeLimit) {
        errors.push(`Video file size (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds maximum limit (${(sizeLimit / 1024 / 1024).toFixed(2)}MB)`);
    }
    
    // Check file type with enhanced logic
    const allowedTypes = getAllowedMimeTypes(bucket);
    const isTypeAllowed = allowedTypes.includes(file.mimetype) || isOctetStreamMkv;
    
    if (!isTypeAllowed) {
        // If it's a video file by extension but not recognized by mimetype, provide helpful error
        if (isVideoByExtension && !isVideoByMimetype) {
            errors.push(`Video file type not properly detected. File extension suggests video but mimetype is ${file.mimetype}. Please ensure the file is a valid video format.`);
        } else {
            errors.push(`File type ${file.mimetype} is not allowed. Allowed types: ${allowedTypes.join(', ')}`);
        }
    }
    
    return {
        isValid: errors.length === 0,
        errors,
        willUseChunkedUpload: isVideo && file.size > CHUNKED_UPLOAD_CONFIG.CHUNK_THRESHOLD,
        isVideo,
        detectedAsVideo: isVideo,
        awsOptimized: true
    };
};

/**
 * AWS-optimized check for chunked upload
 */
const shouldUseChunkedUpload = (file) => {
    // Enhanced video detection - check both mimetype and file extension
    const isVideoByMimetype = file.mimetype.startsWith('video/');
    const isVideoByExtension = file.originalname && /\.(mp4|mov|avi|wmv|mkv|flv|webm)$/i.test(file.originalname);
    const isMkvFile = file.originalname && /\.mkv$/i.test(file.originalname);
    const isOctetStreamMkv = file.mimetype === 'application/octet-stream' && isMkvFile;
    const isVideo = isVideoByMimetype || isVideoByExtension || isOctetStreamMkv;
    
    const shouldChunk = isVideo && file.size > CHUNKED_UPLOAD_CONFIG.CHUNK_THRESHOLD;
    
    if (shouldChunk) {
        console.log('🔄 AWS chunked upload will be used:', {
            fileSize: (file.size / 1024 / 1024).toFixed(2) + 'MB',
            chunkSize: (CHUNKED_UPLOAD_CONFIG.CHUNK_SIZE / 1024 / 1024).toFixed(2) + 'MB',
            estimatedChunks: Math.ceil(file.size / CHUNKED_UPLOAD_CONFIG.CHUNK_SIZE),
            maxConcurrent: CHUNKED_UPLOAD_CONFIG.MAX_CONCURRENT_CHUNKS
        });
    }
    
    return shouldChunk;
};

module.exports = {
    STORAGE_BUCKETS,
    FILE_SIZE_LIMITS,
    ALLOWED_FILE_TYPES,
    CHUNKED_UPLOAD_CONFIG,
    initializeStorageBuckets,
    getBucketForFileType,
    validateFile,
    shouldUseChunkedUpload,
    getAllowedMimeTypes,
    getFileSizeLimit
};
