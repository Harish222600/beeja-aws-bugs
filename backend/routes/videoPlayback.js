const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const ChunkedVideo = require('../models/chunkedVideo');
const { supabaseAdmin } = require('../config/supabaseAdmin');

/**
 * Get video manifest for chunked video playback
 * GET /api/v1/video/manifest/:videoId
 */
router.get('/manifest/:videoId', auth, async (req, res) => {
    try {
        const { videoId } = req.params;
        
        // Get chunked video record
        const chunkedVideo = await ChunkedVideo.findOne({ videoId });
        if (!chunkedVideo) {
            return res.status(404).json({
                success: false,
                message: 'Video not found'
            });
        }

        if (!chunkedVideo.isComplete) {
            return res.status(400).json({
                success: false,
                message: 'Video upload is not complete'
            });
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

        const manifest = {
            videoId,
            originalFilename: chunkedVideo.originalFilename,
            totalSize: chunkedVideo.totalSize,
            totalChunks: chunkedVideo.totalChunks,
            chunkSize: chunkedVideo.chunkSize,
            mimetype: chunkedVideo.mimetype,
            chunks: chunkUrls,
            duration: chunkedVideo.duration || 0,
            isChunked: true
        };

        res.status(200).json({
            success: true,
            data: manifest,
            message: 'Video manifest retrieved successfully'
        });
    } catch (error) {
        console.error('Error getting video manifest:', error);
        res.status(500).json({
            success: false,
            message: error.message,
            error: 'Failed to get video manifest'
        });
    }
});

/**
 * Stream chunked video for playback
 * GET /api/v1/video/stream/:videoId
 * Supports both header and query parameter authentication
 */
router.get('/stream/:videoId', async (req, res) => {
    // Check for token in header or query parameter
    let token = req.headers.authorization?.replace('Bearer ', '');
    if (!token && req.query.token) {
        token = req.query.token;
    }
    
    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Authentication token required'
        });
    }
    
    // Verify token manually since we're not using the auth middleware
    try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Invalid authentication token'
        });
    }
    try {
        const { videoId } = req.params;
        const range = req.headers.range;
        
        // Get chunked video record
        const chunkedVideo = await ChunkedVideo.findOne({ videoId });
        if (!chunkedVideo) {
            return res.status(404).json({
                success: false,
                message: 'Video not found'
            });
        }

        if (!chunkedVideo.isComplete) {
            return res.status(400).json({
                success: false,
                message: 'Video upload is not complete'
            });
        }

        const totalSize = chunkedVideo.totalSize;
        
        if (range) {
            // Parse range header
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

            // Limit range size to prevent memory issues and improve performance
            const maxRangeSize = 2 * 1024 * 1024; // 2MB max per request
            const actualEnd = Math.min(end, start + maxRangeSize - 1, totalSize - 1);
            const rangeSize = actualEnd - start + 1;

            // Determine which chunks we need
            const startChunk = Math.floor(start / chunkedVideo.chunkSize);
            const endChunk = Math.floor(actualEnd / chunkedVideo.chunkSize);

            console.log(`Range request: ${start}-${actualEnd} (${rangeSize} bytes), chunks: ${startChunk}-${endChunk}`);

            // Set response headers immediately for faster response
            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${actualEnd}/${totalSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': rangeSize,
                'Content-Type': chunkedVideo.mimetype,
                'Cache-Control': 'public, max-age=3600'
            });

            // Stream chunks as we download them for faster response
            const sortedChunks = chunkedVideo.uploadedChunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
            let bytesWritten = 0;
            
            for (let i = startChunk; i <= endChunk && bytesWritten < rangeSize; i++) {
                const chunk = sortedChunks[i];
                if (!chunk) continue;

                try {
                    // Download chunk from Supabase
                    const { data, error } = await supabaseAdmin.storage
                        .from(chunkedVideo.bucket)
                        .download(chunk.chunkPath);

                    if (error) {
                        console.error(`Error downloading chunk ${i}:`, error);
                        continue;
                    }

                    const arrayBuffer = await data.arrayBuffer();
                    const chunkBuffer = Buffer.from(arrayBuffer);

                    // Calculate the portion of this chunk we need
                    const chunkStartPos = i * chunkedVideo.chunkSize;
                    const chunkEndPos = chunkStartPos + chunkBuffer.length - 1;
                    
                    // Check if this chunk overlaps with our requested range
                    if (chunkEndPos >= start && chunkStartPos <= actualEnd) {
                        const sliceStart = Math.max(0, start - chunkStartPos);
                        const sliceEnd = Math.min(chunkBuffer.length, actualEnd - chunkStartPos + 1);
                        
                        if (sliceStart < sliceEnd && bytesWritten < rangeSize) {
                            const slicedChunk = chunkBuffer.slice(sliceStart, sliceEnd);
                            const bytesToWrite = Math.min(slicedChunk.length, rangeSize - bytesWritten);
                            
                            if (bytesToWrite > 0) {
                                const finalChunk = slicedChunk.slice(0, bytesToWrite);
                                res.write(finalChunk);
                                bytesWritten += finalChunk.length;
                            }
                        }
                    }
                } catch (downloadError) {
                    console.error(`Error processing chunk ${i}:`, downloadError);
                }
            }

            res.end();
        } else {
            // No range header, stream entire video
            res.writeHead(200, {
                'Content-Length': totalSize,
                'Content-Type': chunkedVideo.mimetype,
            });

            // Stream all chunks in order
            const sortedChunks = chunkedVideo.uploadedChunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
            
            for (const chunk of sortedChunks) {
                try {
                    const { data, error } = await supabaseAdmin.storage
                        .from(chunkedVideo.bucket)
                        .download(chunk.chunkPath);

                    if (error) {
                        console.error(`Error downloading chunk ${chunk.chunkIndex}:`, error);
                        continue;
                    }

                    const arrayBuffer = await data.arrayBuffer();
                    const chunkBuffer = Buffer.from(arrayBuffer);
                    res.write(chunkBuffer);
                } catch (downloadError) {
                    console.error(`Error processing chunk ${chunk.chunkIndex}:`, downloadError);
                }
            }

            res.end();
        }
    } catch (error) {
        console.error('Error streaming video:', error);
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: error.message,
                error: 'Failed to stream video'
            });
        }
    }
});

/**
 * Get video info for chunked videos
 * GET /api/v1/video/info/:videoId
 * Supports both header and query parameter authentication
 */
router.get('/info/:videoId', async (req, res) => {
    // Check for token in header or query parameter
    let token = req.headers.authorization?.replace('Bearer ', '');
    if (!token && req.query.token) {
        token = req.query.token;
    }
    
    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Authentication token required'
        });
    }
    
    // Verify token manually
    try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Invalid authentication token'
        });
    }
    try {
        const { videoId } = req.params;
        
        const chunkedVideo = await ChunkedVideo.findOne({ videoId });
        if (!chunkedVideo) {
            return res.status(404).json({
                success: false,
                message: 'Video not found'
            });
        }

        const videoInfo = {
            videoId: chunkedVideo.videoId,
            originalFilename: chunkedVideo.originalFilename,
            totalSize: chunkedVideo.totalSize,
            totalChunks: chunkedVideo.totalChunks,
            isComplete: chunkedVideo.isComplete,
            uploadProgress: chunkedVideo.uploadProgress,
            duration: chunkedVideo.duration || 0,
            mimetype: chunkedVideo.mimetype,
            createdAt: chunkedVideo.createdAt,
            completedAt: chunkedVideo.completedAt,
            isChunked: true
        };

        res.status(200).json({
            success: true,
            data: videoInfo,
            message: 'Video info retrieved successfully'
        });
    } catch (error) {
        console.error('Error getting video info:', error);
        res.status(500).json({
            success: false,
            message: error.message,
            error: 'Failed to get video info'
        });
    }
});

module.exports = router;
