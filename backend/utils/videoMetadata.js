/**
 * Extract video duration from buffer using basic MP4 parsing
 * @param {Buffer} videoBuffer - Video file buffer
 * @param {string} originalFilename - Original filename for format detection
 * @returns {Promise<number>} Duration in seconds
 */
const extractVideoDuration = async (videoBuffer, originalFilename = 'video.mp4') => {
    try {
        console.log('🎬 Extracting video duration using basic MP4 parsing...');
        
        if (!videoBuffer || !Buffer.isBuffer(videoBuffer)) {
            throw new Error('Invalid video buffer provided');
        }

        // Try to extract duration from MP4 metadata
        const duration = await extractMP4Duration(videoBuffer);
        
        if (duration > 0) {
            console.log(`✅ Video duration extracted: ${duration} seconds`);
            return duration;
        }

        console.warn('Could not extract valid duration from video, using fallback');
        return 0;

    } catch (error) {
        console.error('Error extracting video duration:', error);
        console.warn('Falling back to duration 0 due to extraction error');
        return 0; // Return 0 instead of throwing to prevent upload failure
    }
};

/**
 * Extract duration from MP4 file by parsing the mvhd atom
 * @param {Buffer} buffer - Video file buffer
 * @returns {Promise<number>} Duration in seconds
 */
const extractMP4Duration = async (buffer) => {
    try {
        // Look for the mvhd (movie header) atom which contains duration info
        const mvhdIndex = buffer.indexOf('mvhd');
        if (mvhdIndex === -1) {
            throw new Error('mvhd atom not found - not a valid MP4 file');
        }

        // The mvhd atom structure:
        // 4 bytes: atom size
        // 4 bytes: atom type ('mvhd')
        // 1 byte: version
        // 3 bytes: flags
        // 4 bytes: creation time (version 0) or 8 bytes (version 1)
        // 4 bytes: modification time (version 0) or 8 bytes (version 1)
        // 4 bytes: time scale
        // 4 bytes: duration (version 0) or 8 bytes (version 1)

        const mvhdStart = mvhdIndex - 4; // Start of the atom (including size)
        if (mvhdStart < 0 || mvhdStart + 32 > buffer.length) {
            throw new Error('Invalid mvhd atom position');
        }

        // Read version to determine the structure
        const version = buffer.readUInt8(mvhdStart + 8);
        
        let timeScale, duration;
        
        if (version === 0) {
            // Version 0: 32-bit values
            timeScale = buffer.readUInt32BE(mvhdStart + 20);
            duration = buffer.readUInt32BE(mvhdStart + 24);
        } else if (version === 1) {
            // Version 1: 64-bit values (we'll read as 32-bit for simplicity)
            timeScale = buffer.readUInt32BE(mvhdStart + 28);
            duration = buffer.readUInt32BE(mvhdStart + 36); // Reading lower 32 bits
        } else {
            throw new Error(`Unsupported mvhd version: ${version}`);
        }

        if (timeScale === 0) {
            throw new Error('Invalid time scale in mvhd atom');
        }

        const durationInSeconds = Math.round(duration / timeScale);
        console.log(`MP4 duration extracted: ${durationInSeconds}s (duration: ${duration}, timeScale: ${timeScale})`);
        
        return durationInSeconds;

    } catch (error) {
        console.warn('MP4 duration extraction failed:', error.message);
        return 0;
    }
};

/**
 * Fallback method to estimate duration from file size (very rough estimate)
 * This is used when ffprobe fails
 * @param {number} fileSize - File size in bytes
 * @param {string} mimetype - Video mimetype
 * @returns {number} Estimated duration in seconds
 */
const estimateDurationFromSize = (fileSize, mimetype = 'video/mp4') => {
    try {
        // Very rough estimates based on typical bitrates
        // These are just fallback estimates and won't be accurate
        const estimatedBitrates = {
            'video/mp4': 2000000, // 2 Mbps
            'video/webm': 1500000, // 1.5 Mbps
            'video/avi': 2500000, // 2.5 Mbps
            'video/mov': 2000000, // 2 Mbps
            'video/quicktime': 2000000, // 2 Mbps
            'default': 2000000 // 2 Mbps default
        };

        const bitrate = estimatedBitrates[mimetype] || estimatedBitrates.default;
        const estimatedDuration = Math.round((fileSize * 8) / bitrate); // Convert bytes to bits, divide by bitrate
        
        console.log(`📊 Estimated duration from file size: ${estimatedDuration}s (very rough estimate)`);
        return Math.max(1, estimatedDuration); // At least 1 second
        
    } catch (error) {
        console.error('Error estimating duration from size:', error);
        return 60; // Default to 1 minute if all else fails
    }
};

/**
 * Extract video metadata with fallbacks
 * @param {Buffer} videoBuffer - Video file buffer
 * @param {Object} fileInfo - File information object
 * @returns {Promise<Object>} Metadata object with duration
 */
const extractVideoMetadata = async (videoBuffer, fileInfo = {}) => {
    try {
        const { originalname = 'video.mp4', size = 0, mimetype = 'video/mp4' } = fileInfo;
        
        console.log('🔍 Extracting video metadata...');
        
        let duration = 0;
        let extractionMethod = 'none';
        
        // Try MP4 parsing first
        try {
            duration = await extractVideoDuration(videoBuffer, originalname);
            extractionMethod = duration > 0 ? 'mp4_parsing' : 'size_estimation';
        } catch (parseError) {
            console.warn('MP4 parsing failed, trying fallback methods:', parseError.message);
            extractionMethod = 'size_estimation';
        }
        
        // If MP4 parsing failed or returned 0, use size estimation
        if (duration === 0) {
            duration = estimateDurationFromSize(size, mimetype);
            extractionMethod = 'size_estimation';
        }
        
        const metadata = {
            duration,
            extractionMethod,
            originalFilename: originalname,
            fileSize: size,
            mimetype,
            extractedAt: new Date().toISOString()
        };
        
        console.log('📋 Video metadata extracted:', {
            duration: `${duration}s`,
            method: extractionMethod,
            filename: originalname,
            size: `${(size / (1024 * 1024)).toFixed(2)}MB`
        });
        
        return metadata;
        
    } catch (error) {
        console.error('Error in extractVideoMetadata:', error);
        
        // Return minimal metadata with fallback duration
        return {
            duration: estimateDurationFromSize(fileInfo.size || 0, fileInfo.mimetype),
            extractionMethod: 'fallback',
            originalFilename: fileInfo.originalname || 'unknown',
            fileSize: fileInfo.size || 0,
            mimetype: fileInfo.mimetype || 'video/mp4',
            extractedAt: new Date().toISOString(),
            error: error.message
        };
    }
};

module.exports = {
    extractVideoDuration,
    estimateDurationFromSize,
    extractVideoMetadata
};
