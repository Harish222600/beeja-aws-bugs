const mongoose = require('mongoose');

const chunkedVideoSchema = new mongoose.Schema({
    videoId: {
        type: String,
        required: true,
        unique: true
    },
    originalFilename: {
        type: String,
        required: true
    },
    totalSize: {
        type: Number,
        required: true
    },
    totalChunks: {
        type: Number,
        required: true
    },
    chunkSize: {
        type: Number,
        default: 25 * 1024 * 1024 // 25MB
    },
    uploadedChunks: [{
        chunkIndex: Number,
        chunkPath: String,
        chunkSize: Number,
        uploadedAt: {
            type: Date,
            default: Date.now
        }
    }],
    isComplete: {
        type: Boolean,
        default: false
    },
    finalVideoUrl: {
        type: String,
        default: null
    },
    mimetype: {
        type: String,
        required: true
    },
    bucket: {
        type: String,
        required: true
    },
    folder: {
        type: String,
        default: 'videos'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    completedAt: {
        type: Date,
        default: null
    },
    // Metadata for video playback
    duration: {
        type: Number,
        default: 0
    },
    // Progress tracking
    uploadProgress: {
        type: Number,
        default: 0
    }
});

// Index for efficient queries
chunkedVideoSchema.index({ videoId: 1 });
chunkedVideoSchema.index({ isComplete: 1 });
chunkedVideoSchema.index({ createdAt: 1 });

// Method to calculate upload progress
chunkedVideoSchema.methods.calculateProgress = function() {
    if (this.totalChunks === 0) return 0;
    this.uploadProgress = (this.uploadedChunks.length / this.totalChunks) * 100;
    return this.uploadProgress;
};

// Method to check if upload is complete
chunkedVideoSchema.methods.checkCompletion = function() {
    this.isComplete = this.uploadedChunks.length === this.totalChunks;
    if (this.isComplete && !this.completedAt) {
        this.completedAt = new Date();
    }
    return this.isComplete;
};

// Static method to cleanup old incomplete uploads (older than 24 hours)
chunkedVideoSchema.statics.cleanupOldUploads = async function() {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    try {
        const oldUploads = await this.find({
            isComplete: false,
            createdAt: { $lt: twentyFourHoursAgo }
        });

        for (const upload of oldUploads) {
            // Delete chunks from Supabase
            const { deleteFileFromSupabase } = require('../utils/supabaseUploader');
            for (const chunk of upload.uploadedChunks) {
                try {
                    await deleteFileFromSupabase(chunk.chunkPath);
                } catch (error) {
                    console.error(`Failed to delete chunk ${chunk.chunkPath}:`, error);
                }
            }
        }

        // Remove from database
        const result = await this.deleteMany({
            isComplete: false,
            createdAt: { $lt: twentyFourHoursAgo }
        });

        console.log(`Cleaned up ${result.deletedCount} old incomplete uploads`);
        return result.deletedCount;
    } catch (error) {
        console.error('Error cleaning up old uploads:', error);
        return 0;
    }
};

module.exports = mongoose.model('ChunkedVideo', chunkedVideoSchema);
