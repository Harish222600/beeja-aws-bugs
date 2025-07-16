const { supabaseAdmin } = require('../config/supabaseAdmin');
const { getBucketForFileType, CHUNKED_UPLOAD_CONFIG } = require('../config/supabaseStorage');
const { extractVideoMetadata } = require('./videoMetadata');
const ChunkedVideo = require('../models/chunkedVideo');
const path = require('path');
const crypto = require('crypto');

// Configuration - use centralized config
const CHUNK_SIZE = CHUNKED_UPLOAD_CONFIG.CHUNK_SIZE;
const MAX_RETRIES = CHUNKED_UPLOAD_CONFIG.MAX_RETRIES;
const RETRY_DELAY_BASE = CHUNKED_UPLOAD_CONFIG.RETRY_DELAY_BASE;

/**
 * Generate a unique video ID for chunked upload
 */
const generateVideoId = () => {
    return crypto.randomBytes(16).toString('hex');
};

/**
 * Initialize chunked video upload
 */
const initializeChunkedUpload = async (file, folder = 'videos') => {
    try {
        console.log('🎬 Initializing chunked video upload...');
        
        // Validate file
        if (!file.buffer || !Buffer.isBuffer(file.buffer)) {
            throw new Error('Invalid file buffer');
        }

        // Enhanced video detection - check both mimetype and file extension
        const isVideoByMimetype = file.mimetype.startsWith('video/');
        const isVideoByExtension = file.originalname && /\.(mp4|mov|avi|wmv|mkv|flv|webm)$/i.test(file.originalname);
        const isMkvFile = file.originalname && /\.mkv$/i.test(file.originalname);
        const isOctetStreamMkv = file.mimetype === 'application/octet-stream' && isMkvFile;
        const isVideo = isVideoByMimetype || isVideoByExtension || isOctetStreamMkv;

        if (!isVideo) {
            throw new Error('File must be a video');
        }

        const videoId = generateVideoId();
        const totalSize = file.size;
        const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);
        const bucket = getBucketForFileType(file.mimetype, folder);

        console.log('Video upload details:', {
            videoId,
            originalFilename: file.originalname,
            totalSize,
            totalChunks,
            chunkSize: CHUNK_SIZE,
            bucket
        });

        // Create chunked video record
        const chunkedVideo = new ChunkedVideo({
            videoId,
            originalFilename: file.originalname,
            totalSize,
            totalChunks,
            chunkSize: CHUNK_SIZE,
            mimetype: file.mimetype,
            bucket,
            folder,
            uploadedChunks: []
        });

        await chunkedVideo.save();

        return {
            videoId,
            totalChunks,
            chunkSize: CHUNK_SIZE,
            message: 'Chunked upload initialized successfully'
        };

    } catch (error) {
        console.error('Error initializing chunked upload:', error);
        throw new Error(`Failed to initialize chunked upload: ${error.message}`);
    }
};

/**
 * Upload a single chunk
 */
const uploadChunk = async (videoId, chunkIndex, chunkBuffer) => {
    try {
        console.log(`📤 Uploading chunk ${chunkIndex} for video ${videoId}...`);

        // Get chunked video record
        const chunkedVideo = await ChunkedVideo.findOne({ videoId });
        if (!chunkedVideo) {
            throw new Error('Chunked video record not found');
        }

        // Check if chunk already uploaded
        const existingChunk = chunkedVideo.uploadedChunks.find(
            chunk => chunk.chunkIndex === chunkIndex
        );
        if (existingChunk) {
            console.log(`Chunk ${chunkIndex} already uploaded, skipping...`);
            return {
                chunkIndex,
                status: 'already_uploaded',
                chunkPath: existingChunk.chunkPath
            };
        }

        // Generate chunk filename
        const extension = path.extname(chunkedVideo.originalFilename);
        const chunkFilename = `${chunkedVideo.folder}/chunks/${videoId}/chunk_${chunkIndex.toString().padStart(4, '0')}${extension}`;

        let uploadAttempts = 0;
        let uploadSuccess = false;
        let chunkPath = '';

        // Retry upload with exponential backoff and better error handling
        while (uploadAttempts < MAX_RETRIES && !uploadSuccess) {
            try {
                uploadAttempts++;
                console.log(`Upload attempt ${uploadAttempts}/${MAX_RETRIES} for chunk ${chunkIndex}`);

                // Add timeout for individual chunk uploads
                const uploadPromise = supabaseAdmin.storage
                    .from(chunkedVideo.bucket)
                    .upload(chunkFilename, chunkBuffer, {
                        contentType: 'application/octet-stream',
                        cacheControl: '3600',
                        upsert: false
                    });

                // Set timeout for chunk upload (5 minutes per chunk)
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Chunk upload timeout')), 5 * 60 * 1000);
                });

                const { data, error } = await Promise.race([uploadPromise, timeoutPromise]);

                if (error) {
                    console.error(`Supabase storage error for chunk ${chunkIndex}:`, error);
                    throw new Error(`Supabase upload error: ${error.message}`);
                }

                if (!data || !data.path) {
                    throw new Error('Invalid response from Supabase storage - no path returned');
                }

                chunkPath = data.path;
                uploadSuccess = true;
                console.log(`✅ Chunk ${chunkIndex} uploaded successfully to path: ${chunkPath}`);

            } catch (uploadError) {
                console.error(`Attempt ${uploadAttempts} failed for chunk ${chunkIndex}:`, uploadError);
                console.error('Upload error details:', {
                    errorMessage: uploadError.message,
                    errorName: uploadError.name,
                    chunkIndex,
                    chunkSize: chunkBuffer.length,
                    bucket: chunkedVideo.bucket,
                    filename: chunkFilename,
                    attempt: uploadAttempts,
                    maxRetries: MAX_RETRIES
                });
                
                if (uploadAttempts < MAX_RETRIES) {
                    // Exponential backoff with jitter to avoid thundering herd
                    const baseDelay = RETRY_DELAY_BASE * Math.pow(2, uploadAttempts - 1);
                    const jitter = Math.random() * 1000; // Add up to 1 second of jitter
                    const waitTime = baseDelay + jitter;
                    
                    console.log(`Retrying chunk ${chunkIndex} in ${Math.round(waitTime)}ms...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                } else {
                    // Final attempt failed, provide detailed error
                    const errorDetails = {
                        chunkIndex,
                        totalAttempts: uploadAttempts,
                        lastError: uploadError.message,
                        chunkSize: chunkBuffer.length,
                        bucket: chunkedVideo.bucket
                    };
                    
                    throw new Error(`Failed to upload chunk ${chunkIndex} after ${MAX_RETRIES} attempts. Details: ${JSON.stringify(errorDetails)}`);
                }
            }
        }

        // Update chunked video record
        chunkedVideo.uploadedChunks.push({
            chunkIndex,
            chunkPath,
            chunkSize: chunkBuffer.length,
            uploadedAt: new Date()
        });

        // Calculate progress and check completion
        chunkedVideo.calculateProgress();
        const isComplete = chunkedVideo.checkCompletion();

        await chunkedVideo.save();

        console.log(`Chunk ${chunkIndex} upload complete. Progress: ${chunkedVideo.uploadProgress.toFixed(2)}%`);

        return {
            chunkIndex,
            status: 'uploaded',
            chunkPath,
            progress: chunkedVideo.uploadProgress,
            isComplete
        };

    } catch (error) {
        console.error(`Error uploading chunk ${chunkIndex}:`, error);
        throw new Error(`Failed to upload chunk ${chunkIndex}: ${error.message}`);
    }
};

/**
 * Complete chunked upload - Keep chunks separate for Supabase free tier
 */
const completeChunkedUpload = async (videoId) => {
    try {
        console.log(`🎯 Completing chunked upload for video ${videoId}...`);

        // Get chunked video record
        const chunkedVideo = await ChunkedVideo.findOne({ videoId });
        if (!chunkedVideo) {
            throw new Error('Chunked video record not found');
        }

        if (!chunkedVideo.isComplete) {
            throw new Error('Not all chunks have been uploaded');
        }

        if (chunkedVideo.finalVideoUrl) {
            console.log('Video already completed, returning existing URL');
            return {
                videoId,
                secure_url: chunkedVideo.finalVideoUrl,
                status: 'already_completed',
                isChunked: true,
                chunks: chunkedVideo.uploadedChunks.sort((a, b) => a.chunkIndex - b.chunkIndex)
            };
        }

        // Sort chunks by index
        const sortedChunks = chunkedVideo.uploadedChunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

        // Generate chunk URLs for playback
        const chunkUrls = sortedChunks.map(chunk => {
            const { data: urlData } = supabaseAdmin.storage
                .from(chunkedVideo.bucket)
                .getPublicUrl(chunk.chunkPath);
            return {
                index: chunk.chunkIndex,
                url: urlData.publicUrl,
                size: chunk.chunkSize
            };
        });

        // Create a manifest URL that will serve the chunk information
        const manifestData = {
            videoId,
            originalFilename: chunkedVideo.originalFilename,
            totalSize: chunkedVideo.totalSize,
            totalChunks: chunkedVideo.totalChunks,
            chunkSize: chunkedVideo.chunkSize,
            mimetype: chunkedVideo.mimetype,
            chunks: chunkUrls,
            createdAt: chunkedVideo.createdAt,
            completedAt: new Date()
        };

        // Store manifest as JSON file
        const manifestFilename = `${chunkedVideo.folder}/manifests/${videoId}_manifest.json`;
        const manifestBuffer = Buffer.from(JSON.stringify(manifestData, null, 2));

        const { data: manifestUpload, error: manifestError } = await supabaseAdmin.storage
            .from(chunkedVideo.bucket)
            .upload(manifestFilename, manifestBuffer, {
                contentType: 'application/json',
                cacheControl: '3600',
                upsert: true
            });

        if (manifestError) {
            console.warn('Failed to upload manifest, continuing without it:', manifestError);
        }

        // Get manifest URL
        const { data: manifestUrlData } = supabaseAdmin.storage
            .from(chunkedVideo.bucket)
            .getPublicUrl(manifestFilename);

        const manifestUrl = manifestUrlData.publicUrl;

        // Update chunked video record
        chunkedVideo.finalVideoUrl = manifestUrl; // Store manifest URL as the "video URL"
        chunkedVideo.completedAt = new Date();
        await chunkedVideo.save();

        console.log('✅ Chunked upload completed successfully (chunks kept separate)');

        return {
            videoId,
            secure_url: manifestUrl, // Return manifest URL
            public_id: manifestFilename,
            format: path.extname(chunkedVideo.originalFilename).substring(1),
            resource_type: 'video',
            bucket: chunkedVideo.bucket,
            path: manifestUpload?.path || manifestFilename,
            fullPath: manifestUpload?.fullPath || manifestFilename,
            size: chunkedVideo.totalSize,
            original_filename: chunkedVideo.originalFilename,
            status: 'completed',
            isChunked: true,
            chunks: chunkUrls,
            manifestUrl: manifestUrl
        };

    } catch (error) {
        console.error('Error completing chunked upload:', error);
        throw new Error(`Failed to complete chunked upload: ${error.message}`);
    }
};

/**
 * Clean up chunk files - Modified for separate chunk storage
 * Only clean up if specifically requested (not automatic)
 */
const cleanupChunks = async (videoId, force = false) => {
    try {
        console.log(`🧹 Cleaning up chunks for video ${videoId}...`);

        const chunkedVideo = await ChunkedVideo.findOne({ videoId });
        if (!chunkedVideo) {
            console.log('Chunked video record not found for cleanup');
            return;
        }

        // Only cleanup if forced or if upload failed
        if (!force && chunkedVideo.isComplete) {
            console.log('Skipping cleanup for completed chunked video (chunks needed for playback)');
            return;
        }

        // Delete chunk files from Supabase
        const chunkPaths = chunkedVideo.uploadedChunks.map(chunk => chunk.chunkPath);
        
        if (chunkPaths.length > 0) {
            const { data, error } = await supabaseAdmin.storage
                .from(chunkedVideo.bucket)
                .remove(chunkPaths);

            if (error) {
                console.error('Error deleting chunks:', error);
            } else {
                console.log(`✅ Cleaned up ${chunkPaths.length} chunk files`);
            }
        }

        // Remove the chunked video record if cleanup was forced
        if (force) {
            await ChunkedVideo.deleteOne({ videoId });
            console.log('✅ Removed chunked video record');
        }

    } catch (error) {
        console.error('Error during cleanup:', error);
    }
};

/**
 * Get upload progress
 */
const getUploadProgress = async (videoId) => {
    try {
        const chunkedVideo = await ChunkedVideo.findOne({ videoId });
        if (!chunkedVideo) {
            throw new Error('Chunked video record not found');
        }

        return {
            videoId,
            progress: chunkedVideo.uploadProgress,
            uploadedChunks: chunkedVideo.uploadedChunks.length,
            totalChunks: chunkedVideo.totalChunks,
            isComplete: chunkedVideo.isComplete,
            finalVideoUrl: chunkedVideo.finalVideoUrl
        };
    } catch (error) {
        console.error('Error getting upload progress:', error);
        throw new Error(`Failed to get upload progress: ${error.message}`);
    }
};

/**
 * Process entire video file in chunks
 */
const uploadVideoInChunks = async (file, folder = 'videos') => {
    try {
        console.log('🎬 Starting chunked video upload process...');

        // Initialize upload
        const initResult = await initializeChunkedUpload(file, folder);
        const { videoId, totalChunks } = initResult;

        // Split file into chunks and upload sequentially to avoid memory issues
        const fileBuffer = file.buffer;
        const chunkResults = [];

        console.log(`Uploading ${totalChunks} chunks sequentially...`);
        console.log(`Total file size: ${(fileBuffer.length / (1024 * 1024)).toFixed(2)}MB`);
        console.log(`Chunk size: ${(CHUNK_SIZE / (1024 * 1024)).toFixed(2)}MB`);
        
        for (let i = 0; i < totalChunks; i++) {
            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, fileBuffer.length);
            const chunkBuffer = fileBuffer.slice(start, end);

            console.log(`Uploading chunk ${i + 1}/${totalChunks} (${(chunkBuffer.length / (1024 * 1024)).toFixed(2)}MB)`);
            
            try {
                const chunkResult = await uploadChunk(videoId, i, chunkBuffer);
                chunkResults.push(chunkResult);
                
                // Log progress
                const progressPercent = ((i + 1) / totalChunks * 100).toFixed(1);
                console.log(`✅ Chunk ${i + 1}/${totalChunks} uploaded successfully (${progressPercent}% complete)`);
                
                // Small delay between chunks to prevent overwhelming the server
                if (i < totalChunks - 1) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            } catch (chunkError) {
                console.error(`❌ Failed to upload chunk ${i + 1}/${totalChunks}:`, chunkError);
                
                // Try to cleanup uploaded chunks on failure
                try {
                    console.log('🧹 Attempting to cleanup uploaded chunks due to failure...');
                    await cleanupChunks(videoId, true);
                } catch (cleanupError) {
                    console.error('Failed to cleanup chunks:', cleanupError);
                }
                
                throw new Error(`Failed to upload chunk ${i + 1}/${totalChunks}: ${chunkError.message}`);
            }
        }

        // Verify all chunks were uploaded before completing
        console.log('🔍 Verifying all chunks were uploaded...');
        const chunkedVideo = await ChunkedVideo.findOne({ videoId });
        if (!chunkedVideo) {
            throw new Error('Chunked video record not found after upload');
        }

        console.log(`Upload verification: ${chunkedVideo.uploadedChunks.length}/${totalChunks} chunks uploaded`);
        
        if (chunkedVideo.uploadedChunks.length !== totalChunks) {
            throw new Error(`Upload incomplete: ${chunkedVideo.uploadedChunks.length}/${totalChunks} chunks uploaded`);
        }

        // Force recalculate completion status
        chunkedVideo.calculateProgress();
        const isComplete = chunkedVideo.checkCompletion();
        await chunkedVideo.save();

        if (!isComplete) {
            throw new Error('Upload verification failed: not all chunks are marked as uploaded');
        }

        console.log('✅ All chunks verified successfully, proceeding to complete upload...');

        // Extract video duration before completing upload
        let videoDuration = 0;
        try {
            console.log('🎬 Extracting video duration from chunked upload...');
            const videoMetadata = await extractVideoMetadata(file.buffer, {
                originalname: file.originalname,
                size: file.size,
                mimetype: file.mimetype
            });
            videoDuration = videoMetadata.duration;
            console.log(`✅ Video duration extracted: ${videoDuration}s`);
        } catch (durationError) {
            console.warn('⚠️ Failed to extract video duration:', durationError.message);
            videoDuration = 0;
        }

        // Complete the upload (creates manifest, keeps chunks separate)
        const finalResult = await completeChunkedUpload(videoId);
        
        // Add duration to the result
        finalResult.duration = videoDuration;

        console.log('🎉 Chunked video upload completed successfully!');
        console.log('📋 Chunks stored separately for Supabase free tier compatibility');
        return finalResult;

    } catch (error) {
        console.error('Error in chunked video upload:', error);
        throw new Error(`Chunked video upload failed: ${error.message}`);
    }
};

module.exports = {
    initializeChunkedUpload,
    uploadChunk,
    completeChunkedUpload,
    getUploadProgress,
    cleanupChunks,
    uploadVideoInChunks,
    generateVideoId,
    CHUNK_SIZE
};
