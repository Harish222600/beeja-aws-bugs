const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const {
    initializeChunkedUpload,
    uploadChunk,
    completeChunkedUpload,
    getUploadProgress
} = require('../utils/chunkedVideoUploader');
const ChunkedVideo = require('../models/chunkedVideo');

// Middleware to parse JSON and handle file uploads
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

/**
 * Initialize chunked upload
 * POST /api/chunked-upload/initialize
 */
router.post('/initialize', auth, upload.single('video'), async (req, res) => {
    try {
        console.log('=== INITIALIZE CHUNKED UPLOAD REQUEST START ===');
        console.log('Request method:', req.method);
        console.log('Request URL:', req.url);
        console.log('User from auth:', req.user);
        console.log('File present:', !!req.file);
        
        if (!req.file) {
            console.log('❌ No video file provided');
            return res.status(400).json({
                success: false,
                message: 'No video file provided',
                error: 'MISSING_VIDEO_FILE'
            });
        }

        const { folder = 'videos' } = req.body;
        
        console.log('📤 Initializing chunked upload:', {
            filename: req.file.originalname,
            size: req.file.size,
            mimetype: req.file.mimetype,
            folder
        });
        
        const result = await initializeChunkedUpload(req.file, folder);
        
        console.log('✅ Chunked upload initialized successfully:', result);
        res.status(200).json({
            success: true,
            data: result,
            message: 'Chunked upload initialized successfully'
        });
    } catch (error) {
        console.error('❌ Error initializing chunked upload:', error);
        console.error('Error stack:', error.stack);
        
        // Ensure we always return JSON, never HTML
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to initialize chunked upload',
                error: 'INITIALIZATION_FAILED',
                details: {
                    errorType: error.name,
                    timestamp: new Date().toISOString()
                }
            });
        }
    }
});

/**
 * Upload a single chunk
 * POST /api/chunked-upload/chunk
 */
router.post('/chunk', auth, upload.single('chunk'), async (req, res) => {
    try {
        console.log('=== CHUNK UPLOAD REQUEST START ===');
        console.log('Request method:', req.method);
        console.log('Request URL:', req.url);
        console.log('Request headers:', req.headers);
        console.log('Request body:', req.body);
        console.log('File present:', !!req.file);
        console.log('User from auth:', req.user);

        const { videoId, chunkIndex } = req.body;
        
        if (!req.file) {
            console.log('❌ No chunk data provided');
            return res.status(400).json({
                success: false,
                message: 'No chunk data provided',
                error: 'MISSING_CHUNK_DATA'
            });
        }

        if (!videoId || chunkIndex === undefined) {
            console.log('❌ Missing required parameters:', { videoId, chunkIndex });
            return res.status(400).json({
                success: false,
                message: 'videoId and chunkIndex are required',
                error: 'MISSING_PARAMETERS'
            });
        }

        console.log('📤 Processing chunk upload:', {
            videoId,
            chunkIndex: parseInt(chunkIndex),
            chunkSize: req.file.buffer.length
        });

        const result = await uploadChunk(videoId, parseInt(chunkIndex), req.file.buffer);
        
        console.log('✅ Chunk upload successful:', result);
        res.status(200).json({
            success: true,
            data: result,
            message: `Chunk ${chunkIndex} uploaded successfully`
        });
    } catch (error) {
        console.error('❌ Error uploading chunk:', error);
        console.error('Error stack:', error.stack);
        
        // Ensure we always return JSON, never HTML
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to upload chunk',
                error: 'CHUNK_UPLOAD_FAILED',
                details: {
                    errorType: error.name,
                    timestamp: new Date().toISOString()
                }
            });
        }
    }
});

/**
 * Complete chunked upload
 * POST /api/chunked-upload/complete
 */
router.post('/complete', auth, async (req, res) => {
    try {
        console.log('=== COMPLETE CHUNKED UPLOAD REQUEST START ===');
        console.log('Request method:', req.method);
        console.log('Request URL:', req.url);
        console.log('Request body:', req.body);
        console.log('User from auth:', req.user);

        const { videoId } = req.body;
        
        if (!videoId) {
            console.log('❌ videoId is required');
            return res.status(400).json({
                success: false,
                message: 'videoId is required',
                error: 'MISSING_VIDEO_ID'
            });
        }

        console.log('🎯 Completing chunked upload for videoId:', videoId);
        const result = await completeChunkedUpload(videoId);
        
        console.log('✅ Chunked upload completed successfully:', result);
        res.status(200).json({
            success: true,
            data: result,
            message: 'Chunked upload completed successfully'
        });
    } catch (error) {
        console.error('❌ Error completing chunked upload:', error);
        console.error('Error stack:', error.stack);
        
        // Ensure we always return JSON, never HTML
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to complete chunked upload',
                error: 'COMPLETION_FAILED',
                details: {
                    errorType: error.name,
                    timestamp: new Date().toISOString()
                }
            });
        }
    }
});

/**
 * Get upload progress
 * GET /api/chunked-upload/progress/:videoId
 */
router.get('/progress/:videoId', auth, async (req, res) => {
    try {
        const { videoId } = req.params;
        
        const result = await getUploadProgress(videoId);
        
        res.status(200).json({
            success: true,
            data: result,
            message: 'Upload progress retrieved successfully'
        });
    } catch (error) {
        console.error('Error getting upload progress:', error);
        res.status(500).json({
            success: false,
            message: error.message,
            error: 'Failed to get upload progress'
        });
    }
});

/**
 * Get all chunked uploads for a user (for debugging/admin)
 * GET /api/chunked-upload/list
 */
router.get('/list', auth, async (req, res) => {
    try {
        const { page = 1, limit = 10, status } = req.query;
        
        const query = {};
        if (status === 'complete') {
            query.isComplete = true;
        } else if (status === 'incomplete') {
            query.isComplete = false;
        }

        const chunkedVideos = await ChunkedVideo.find(query)
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .select('videoId originalFilename totalSize uploadProgress isComplete createdAt completedAt finalVideoUrl');

        const total = await ChunkedVideo.countDocuments(query);

        res.status(200).json({
            success: true,
            data: {
                uploads: chunkedVideos,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                }
            },
            message: 'Chunked uploads retrieved successfully'
        });
    } catch (error) {
        console.error('Error listing chunked uploads:', error);
        res.status(500).json({
            success: false,
            message: error.message,
            error: 'Failed to list chunked uploads'
        });
    }
});

/**
 * Cancel/Delete an incomplete chunked upload
 * DELETE /api/chunked-upload/:videoId
 */
router.delete('/:videoId', auth, async (req, res) => {
    try {
        const { videoId } = req.params;
        
        const chunkedVideo = await ChunkedVideo.findOne({ videoId });
        if (!chunkedVideo) {
            return res.status(404).json({
                success: false,
                message: 'Chunked upload not found'
            });
        }

        if (chunkedVideo.isComplete) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete completed upload'
            });
        }

        // Clean up chunks
        const { cleanupChunks } = require('../utils/chunkedVideoUploader');
        await cleanupChunks(videoId);

        // Remove from database
        await ChunkedVideo.deleteOne({ videoId });

        res.status(200).json({
            success: true,
            message: 'Chunked upload cancelled and cleaned up successfully'
        });
    } catch (error) {
        console.error('Error cancelling chunked upload:', error);
        res.status(500).json({
            success: false,
            message: error.message,
            error: 'Failed to cancel chunked upload'
        });
    }
});

module.exports = router;
