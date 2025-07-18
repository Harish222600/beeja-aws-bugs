const { supabaseAdmin } = require('../config/supabaseAdmin');
const { getBucketForFileType, CHUNKED_UPLOAD_CONFIG } = require('../config/supabaseStorage.aws');
const { extractVideoMetadata } = require('./videoMetadata');
const ChunkedVideo = require('../models/chunkedVideo');
const path = require('path');
const crypto = require('crypto');

// AWS-optimized configuration
const CHUNK_SIZE = CHUNKED_UPLOAD_CONFIG.CHUNK_SIZE;
const MAX_RETRIES = CHUNKED_UPLOAD_CONFIG.MAX_RETRIES;
const RETRY_DELAY_BASE = CHUNKED_UPLOAD_CONFIG.RETRY_DELAY_BASE;
const MAX_CONCURRENT_CHUNKS = CHUNKED_UPLOAD_CONFIG.MAX_CONCURRENT_CHUNKS;
const CHUNK_TIMEOUT = CHUNKED_UPLOAD_CONFIG.CHUNK_TIMEOUT;
const SUPABASE_TIMEOUT = CHUNKED_UPLOAD_CONFIG.SUPABASE_TIMEOUT;

/**
 * Generate a unique video ID for chunked upload
 */
const generateVideoId = () => {
    return crypto.randomBytes(16).toString('hex');
};

/**
 * AWS-optimized chunked video upload initialization
 */
const initializeChunkedUpload = async (file, folder = 'videos') => {
    try {
        console.log('🎬 Initializing AWS-optimized chunked video upload...');
        
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

        console.log('AWS video upload details:', {
            videoId,
            originalFilename: file.originalname,
            totalSize,
            totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
            totalChunks,
            chunkSize: CHUNK_SIZE,
            chunkSizeMB: (CHUNK_SIZE / 1024 / 1024).toFixed(2),
            bucket,
            maxConcurrentChunks: MAX_CONCURRENT_CHUNKS,
            estimatedUploadTime: Math.ceil((totalChunks * 30) / MAX_CONCURRENT_CHUNKS) + ' seconds'
        });

        // Create chunked video record with AWS-specific metadata
        const chunkedVideo = new ChunkedVideo({
            videoId,
            originalFilename: file.originalname,
            totalSize,
            totalChunks,
            chunkSize: CHUNK_SIZE,
            mimetype: file.mimetype,
            bucket,
            folder,
            uploadedChunks: [],
            awsOptimized: true,
            maxConcurrentChunks: MAX_CONCURRENT_CHUNKS,
            chunkTimeout: CHUNK_TIMEOUT
        });

        await chunkedVideo.save();

        return {
            videoId,
            totalChunks,
            chunkSize: CHUNK_SIZE,
            maxConcurrentChunks: MAX_CONCURRENT_CHUNKS,
            message: 'AWS-optimized chunked upload initialized successfully'
        };

    } catch (error) {
        console.error('Error initializing AWS-optimized chunked upload:', error);
        throw new Error(`Failed to initialize AWS-optimized chunked upload: ${error.message}`);
    }
};

/**
 * AWS-optimized single chunk upload with enhanced error handling
 */
const uploadChunk = async (videoId, chunkIndex, chunkBuffer) => {
    try {
        console.log(`📤 AWS uploading chunk ${chunkIndex} for video ${videoId}...`);

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

        // Generate chunk filename with AWS-optimized path structure
        const extension = path.extname(chunkedVideo.originalFilename);
        const timestamp = Date.now();
        const chunkFilename = `${chunkedVideo.folder}/chunks/${videoId}/${timestamp}_chunk_${chunkIndex.toString().padStart(4, '0')}${extension}`;

        let uploadAttempts = 0;
        let uploadSuccess = false;
        let chunkPath = '';
        let lastError = null;

        // AWS-optimized retry upload with exponential backoff and jitter
        while (uploadAttempts < MAX_RETRIES && !uploadSuccess) {
            try {
                uploadAttempts++;
                console.log(`AWS upload attempt ${uploadAttempts}/${MAX_RETRIES} for chunk ${chunkIndex} (${(chunkBuffer.length / 1024 / 1024).toFixed(2)}MB)`);

                // Create upload promise with AWS-optimized settings
                const uploadPromise = supabaseAdmin.storage
                    .from(chunkedVideo.bucket)
                    .upload(chunkFilename, chunkBuffer, {
                        contentType: 'application/octet-stream',
                        cacheControl: '3600',
                        upsert: false,
                        duplex: 'half' // AWS optimization for large uploads
                    });

                // AWS-optimized timeout for chunk upload
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('AWS chunk upload timeout')), CHUNK_TIMEOUT);
                });

                const { data, error } = await Promise.race([uploadPromise, timeoutPromise]);

                if (error) {
                    lastError = error;
                    console.error(`AWS Supabase storage error for chunk ${chunkIndex} (attempt ${uploadAttempts}):`, error);
                    
                    // Check for specific AWS/network errors
                    if (error.message.includes('network') || error.message.includes('timeout') || error.message.includes('ECONNRESET')) {
                        throw new Error(`AWS network error: ${error.message}`);
                    } else if (error.message.includes('413') || error.message.includes('too large')) {
                        throw new Error(`Chunk too large for AWS: ${error.message}`);
                    } else {
                        throw new Error(`AWS Supabase upload error: ${error.message}`);
                    }
                }

                if (!data || !data.path) {
                    throw new Error('Invalid response from Supabase storage - no path returned');
                }

                chunkPath = data.path;
                uploadSuccess = true;
                console.log(`✅ AWS chunk ${chunkIndex} uploaded successfully to path: ${chunkPath} (attempt ${uploadAttempts})`);

            } catch (uploadError) {
                lastError = uploadError;
                console.error(`AWS attempt ${uploadAttempts} failed for chunk ${chunkIndex}:`, uploadError.message);
                
                if (uploadAttempts < MAX_RETRIES) {
                    // AWS-optimized exponential backoff with jitter
                    const baseDelay = RETRY_DELAY_BASE * Math.pow(2, uploadAttempts - 1);
                    const jitter = Math.random() * 2000; // Add up to 2 seconds of jitter for AWS
                    const waitTime = Math.min(baseDelay + jitter, 30000); // Cap at 30 seconds
                    
                    console.log(`AWS retrying chunk ${chunkIndex} in ${Math.round(waitTime)}ms... (${uploadError.message})`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                } else {
                    // Final attempt failed, provide detailed AWS error
                    const errorDetails = {
                        chunkIndex,
                        totalAttempts: uploadAttempts,
                        lastError: lastError?.message || uploadError.message,
                        chunkSize: chunkBuffer.length,
                        chunkSizeMB: (chunkBuffer.length / 1024 / 1024).toFixed(2),
                        bucket: chunkedVideo.bucket,
                        awsOptimized: true,
                        timestamp: new Date().toISOString()
                    };
                    
                    throw new Error(`AWS failed to upload chunk ${chunkIndex} after ${MAX_RETRIES} attempts. Details: ${JSON.stringify(errorDetails)}`);
                }
            }
        }

        // Update chunked video record with AWS metadata
        chunkedVideo.uploadedChunks.push({
            chunkIndex,
            chunkPath,
            chunkSize: chunkBuffer.length,
            uploadedAt: new Date(),
            uploadAttempts,
            awsOptimized: true
        });

        // Calculate progress and check completion
        chunkedVideo.calculateProgress();
        const isComplete = chunkedVideo.checkCompletion();

        await chunkedVideo.save();

        console.log(`AWS chunk ${chunkIndex} upload complete. Progress: ${chunkedVideo.uploadProgress.toFixed(2)}% (${chunkedVideo.uploadedChunks.length}/${chunkedVideo.totalChunks})`);

        return {
            chunkIndex,
            status: 'uploaded',
            chunkPath,
            progress: chunkedVideo.uploadProgress,
            isComplete,
            uploadAttempts,
            awsOptimized: true
        };

    } catch (error) {
        console.error(`AWS error uploading chunk ${chunkIndex}:`, error);
        throw new Error(`AWS failed to upload chunk ${chunkIndex}: ${error.message}`);
    }
};

/**
 * AWS-optimized chunked upload completion
 */
const completeChunkedUpload = async (videoId) => {
    try {
        console.log(`🎯 Completing AWS-optimized chunked upload for video ${videoId}...`);

        // Get chunked video record
        const chunkedVideo = await ChunkedVideo.findOne({ videoId });
        if (!chunkedVideo) {
            throw new Error('Chunked video record not found');
        }

        if (!chunkedVideo.isComplete) {
            throw new Error(`Not all chunks have been uploaded. Progress: ${chunkedVideo.uploadProgress.toFixed(2)}% (${chunkedVideo.uploadedChunks.length}/${chunkedVideo.totalChunks})`);
        }

        if (chunkedVideo.finalVideoUrl) {
            console.log('AWS video already completed, returning existing URL');
            return {
                videoId,
                secure_url: chunkedVideo.finalVideoUrl,
                status: 'already_completed',
                isChunked: true,
                awsOptimized: true,
                chunks: chunkedVideo.uploadedChunks.sort((a, b) => a.chunkIndex - b.chunkIndex)
            };
        }

        // Sort chunks by index
        const sortedChunks = chunkedVideo.uploadedChunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

        // Generate AWS-optimized chunk URLs for playback
        const chunkUrls = sortedChunks.map(chunk => {
            const { data: urlData } = supabaseAdmin.storage
                .from(chunkedVideo.bucket)
                .getPublicUrl(chunk.chunkPath);
            return {
                index: chunk.chunkIndex,
                url: urlData.publicUrl,
                size: chunk.chunkSize,
                uploadAttempts: chunk.uploadAttempts || 1
            };
        });

        // Create AWS-optimized manifest with additional metadata
        const manifestData = {
            videoId,
            originalFilename: chunkedVideo.originalFilename,
            totalSize: chunkedVideo.totalSize,
            totalSizeMB: (chunkedVideo.totalSize / 1024 / 1024).toFixed(2),
            totalChunks: chunkedVideo.totalChunks,
            chunkSize: chunkedVideo.chunkSize,
            chunkSizeMB: (chunkedVideo.chunkSize / 1024 / 1024).toFixed(2),
            mimetype: chunkedVideo.mimetype,
            chunks: chunkUrls,
            createdAt: chunkedVideo.createdAt,
            completedAt: new Date(),
            awsOptimized: true,
            maxConcurrentChunks: chunkedVideo.maxConcurrentChunks || MAX_CONCURRENT_CHUNKS,
            totalUploadAttempts: sortedChunks.reduce((sum, chunk) => sum + (chunk.uploadAttempts || 1), 0),
            averageUploadAttempts: (sortedChunks.reduce((sum, chunk) => sum + (chunk.uploadAttempts || 1), 0) / sortedChunks.length).toFixed(2)
        };

        // Store AWS-optimized manifest as JSON file
        const manifestFilename = `${chunkedVideo.folder}/manifests/aws_${videoId}_manifest.json`;
        const manifestBuffer = Buffer.from(JSON.stringify(manifestData, null, 2));

        try {
            const manifestUploadPromise = supabaseAdmin.storage
                .from(chunkedVideo.bucket)
                .upload(manifestFilename, manifestBuffer, {
                    contentType: 'application/json',
                    cacheControl: '3600',
                    upsert: true
                });

            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Manifest upload timeout')), 30000);
            });

            const { data: manifestUpload, error: manifestError } = await Promise.race([
                manifestUploadPromise,
                timeoutPromise
            ]);

            if (manifestError) {
                console.warn('AWS failed to upload manifest, continuing without it:', manifestError);
            } else {
                console.log('✅ AWS manifest uploaded successfully');
            }
        } catch (manifestUploadError) {
            console.warn('AWS manifest upload failed, continuing without it:', manifestUploadError.message);
        }

        // Get manifest URL
        const { data: manifestUrlData } = supabaseAdmin.storage
            .from(chunkedVideo.bucket)
            .getPublicUrl(manifestFilename);

        const manifestUrl = manifestUrlData.publicUrl;

        // Update chunked video record with AWS completion data
        chunkedVideo.finalVideoUrl = manifestUrl;
        chunkedVideo.completedAt = new Date();
        chunkedVideo.awsOptimized = true;
        await chunkedVideo.save();

        console.log('✅ AWS-optimized chunked upload completed successfully (chunks kept separate)');
        console.log(`📊 AWS upload stats: ${manifestData.totalUploadAttempts} total attempts, ${manifestData.averageUploadAttempts} avg per chunk`);

        return {
            videoId,
            secure_url: manifestUrl,
            public_id: manifestFilename,
            format: path.extname(chunkedVideo.originalFilename).substring(1),
            resource_type: 'video',
            bucket: chunkedVideo.bucket,
            path: manifestFilename,
            fullPath: manifestFilename,
            size: chunkedVideo.totalSize,
            original_filename: chunkedVideo.originalFilename,
            status: 'completed',
            isChunked: true,
            awsOptimized: true,
            chunks: chunkUrls,
            manifestUrl: manifestUrl,
            uploadStats: {
                totalAttempts: manifestData.totalUploadAttempts,
                averageAttempts: manifestData.averageUploadAttempts,
                maxConcurrentChunks: manifestData.maxConcurrentChunks
            }
        };

    } catch (error) {
        console.error('AWS error completing chunked upload:', error);
        throw new Error(`AWS failed to complete chunked upload: ${error.message}`);
    }
};

/**
 * AWS-optimized chunk cleanup
 */
const cleanupChunks = async (videoId, force = false) => {
    try {
        console.log(`🧹 AWS cleaning up chunks for video ${videoId}...`);

        const chunkedVideo = await ChunkedVideo.findOne({ videoId });
        if (!chunkedVideo) {
            console.log('Chunked video record not found for AWS cleanup');
            return;
        }

        // Only cleanup if forced or if upload failed
        if (!force && chunkedVideo.isComplete) {
            console.log('Skipping AWS cleanup for completed chunked video (chunks needed for playback)');
            return;
        }

        // Delete chunk files from Supabase with AWS timeout handling
        const chunkPaths = chunkedVideo.uploadedChunks.map(chunk => chunk.chunkPath);
        
        if (chunkPaths.length > 0) {
            try {
                const deletePromise = supabaseAdmin.storage
                    .from(chunkedVideo.bucket)
                    .remove(chunkPaths);

                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('AWS cleanup timeout')), 60000);
                });

                const { data, error } = await Promise.race([deletePromise, timeoutPromise]);

                if (error) {
                    console.error('AWS error deleting chunks:', error);
                } else {
                    console.log(`✅ AWS cleaned up ${chunkPaths.length} chunk files`);
                }
            } catch (deleteError) {
                console.error('AWS chunk deletion failed:', deleteError.message);
            }
        }

        // Remove the chunked video record if cleanup was forced
        if (force) {
            await ChunkedVideo.deleteOne({ videoId });
            console.log('✅ AWS removed chunked video record');
        }

    } catch (error) {
        console.error('AWS error during cleanup:', error);
    }
};

/**
 * AWS-optimized upload progress tracking
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
            finalVideoUrl: chunkedVideo.finalVideoUrl,
            awsOptimized: chunkedVideo.awsOptimized || false,
            uploadStats: {
                totalAttempts: chunkedVideo.uploadedChunks.reduce((sum, chunk) => sum + (chunk.uploadAttempts || 1), 0),
                averageAttempts: chunkedVideo.uploadedChunks.length > 0 
                    ? (chunkedVideo.uploadedChunks.reduce((sum, chunk) => sum + (chunk.uploadAttempts || 1), 0) / chunkedVideo.uploadedChunks.length).toFixed(2)
                    : 0
            }
        };
    } catch (error) {
        console.error('AWS error getting upload progress:', error);
        throw new Error(`AWS failed to get upload progress: ${error.message}`);
    }
};

/**
 * AWS-optimized concurrent chunk upload processing
 */
const uploadVideoInChunks = async (file, folder = 'videos') => {
    try {
        console.log('🎬 Starting AWS-optimized chunked video upload process...');

        // Initialize upload
        const initResult = await initializeChunkedUpload(file, folder);
        const { videoId, totalChunks, maxConcurrentChunks } = initResult;

        // Split file into chunks and upload with AWS-optimized concurrency
        const fileBuffer = file.buffer;
        const chunkResults = [];

        console.log(`AWS uploading ${totalChunks} chunks with max ${maxConcurrentChunks} concurrent uploads...`);
        console.log(`Total file size: ${(fileBuffer.length / (1024 * 1024)).toFixed(2)}MB`);
        console.log(`Chunk size: ${(CHUNK_SIZE / (1024 * 1024)).toFixed(2)}MB`);
        
        // Process chunks in batches for AWS optimization
        for (let batchStart = 0; batchStart < totalChunks; batchStart += maxConcurrentChunks) {
            const batchEnd = Math.min(batchStart + maxConcurrentChunks, totalChunks);
            const batchPromises = [];

            console.log(`AWS processing batch ${Math.floor(batchStart / maxConcurrentChunks) + 1}/${Math.ceil(totalChunks / maxConcurrentChunks)} (chunks ${batchStart} to ${batchEnd - 1})`);

            // Create concurrent upload promises for this batch
            for (let i = batchStart; i < batchEnd; i++) {
                const start = i * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE, fileBuffer.length);
                const chunkBuffer = fileBuffer.slice(start, end);

                console.log(`AWS preparing chunk ${i + 1}/${totalChunks} (${(chunkBuffer.length / (1024 * 1024)).toFixed(2)}MB)`);
                
                const chunkPromise = uploadChunk(videoId, i, chunkBuffer)
                    .then(result => {
                        const progressPercent = ((i + 1) / totalChunks * 100).toFixed(1);
                        console.log(`✅ AWS chunk ${i + 1}/${totalChunks} uploaded successfully (${progressPercent}% complete)`);
                        return result;
                    })
                    .catch(error => {
                        console.error(`❌ AWS failed to upload chunk ${i + 1}/${totalChunks}:`, error.message);
                        throw error;
                    });

                batchPromises.push(chunkPromise);
            }

            // Wait for all chunks in this batch to complete
            try {
                const batchResults = await Promise.all(batchPromises);
                chunkResults.push(...batchResults);
                
                console.log(`✅ AWS batch ${Math.floor(batchStart / maxConcurrentChunks) + 1} completed successfully`);
                
                // Small delay between batches to prevent overwhelming AWS/Supabase
                if (batchEnd < totalChunks) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } catch (batchError) {
                console.error(`❌ AWS batch ${Math.floor(batchStart / maxConcurrentChunks) + 1} failed:`, batchError.message);
                
                // Try to cleanup uploaded chunks on failure
                try {
                    console.log('🧹 AWS attempting to cleanup uploaded chunks due to batch failure...');
                    await cleanupChunks(videoId, true);
                } catch (cleanupError) {
                    console.error('AWS failed to cleanup chunks:', cleanupError.message);
                }
                
                throw new Error(`AWS failed to upload batch starting at chunk ${batchStart + 1}: ${batchError.message}`);
            }
        }

        // Verify all chunks were uploaded before completing
        console.log('🔍 AWS verifying all chunks were uploaded...');
        const chunkedVideo = await ChunkedVideo.findOne({ videoId });
        if (!chunkedVideo) {
            throw new Error('AWS chunked video record not found after upload');
        }

        console.log(`AWS upload verification: ${chunkedVideo.uploadedChunks.length}/${totalChunks} chunks uploaded`);
        
        if (chunkedVideo.uploadedChunks.length !== totalChunks) {
            throw new Error(`AWS upload incomplete: ${chunkedVideo.uploadedChunks.length}/${totalChunks} chunks uploaded`);
        }

        // Force recalculate completion status
        chunkedVideo.calculateProgress();
        const isComplete = chunkedVideo.checkCompletion();
        await chunkedVideo.save();

        if (!isComplete) {
            throw new Error('AWS upload verification failed: not all chunks are marked as uploaded');
        }

        console.log('✅ AWS all chunks verified successfully, proceeding to complete upload...');

        // Extract video duration before completing upload
        let videoDuration = 0;
        try {
            console.log('🎬 AWS extracting video duration from chunked upload...');
            const videoMetadata = await extractVideoMetadata(file.buffer, {
                originalname: file.originalname,
                size: file.size,
                mimetype: file.mimetype
            });
            videoDuration = videoMetadata.duration;
            console.log(`✅ AWS video duration extracted: ${videoDuration}s`);
        } catch (durationError) {
            console.warn('⚠️ AWS failed to extract video duration:', durationError.message);
            videoDuration = 0;
        }

        // Complete the upload (creates manifest, keeps chunks separate)
        const finalResult = await completeChunkedUpload(videoId);
        
        // Add duration and AWS stats to the result
        finalResult.duration = videoDuration;
        finalResult.awsOptimized = true;

        console.log('🎉 AWS-optimized chunked video upload completed successfully!');
        console.log('📋 AWS chunks stored separately for Supabase free tier compatibility');
        console.log(`📊 AWS upload stats: ${finalResult.uploadStats.totalAttempts} total attempts, ${finalResult.uploadStats.averageAttempts} avg per chunk`);
        
        return finalResult;

    } catch (error) {
        console.error('AWS error in chunked video upload:', error);
        throw new Error(`AWS chunked video upload failed: ${error.message}`);
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
    CHUNK_SIZE,
    MAX_CONCURRENT_CHUNKS,
    CHUNK_TIMEOUT
};
