const supabase = require('../config/supabase');
const { STORAGE_BUCKETS } = require('../config/supabaseStorage');

/**
 * Generate a signed URL for a file (replaces cloudinaryHelper.js functionality)
 * @param {string} fileUrl - The public URL of the file
 * @param {number} expiresIn - Expiration time in seconds (default 3600 seconds = 1 hour)
 * @returns {string|null} - Signed URL with expiration
 */
const generateSignedUrl = async (fileUrl, expiresIn = 3600) => {
    try {
        if (!fileUrl) return null;

        // Extract bucket and path from Supabase URL
        const urlParts = fileUrl.split('/storage/v1/object/public/');
        if (urlParts.length !== 2) {
            console.warn('Invalid Supabase URL format for signed URL generation');
            return fileUrl; // Return original URL as fallback
        }

        const [bucket, ...pathParts] = urlParts[1].split('/');
        const filePath = pathParts.join('/');

        console.log(`Generating signed URL for bucket: ${bucket}, path: ${filePath}`);

        const { data, error } = await supabase.storage
            .from(bucket)
            .createSignedUrl(filePath, expiresIn);

        if (error) {
            console.error('Error generating signed URL:', error);
            return fileUrl; // Return original URL as fallback
        }

        console.log('Generated signed URL for:', filePath);
        return data.signedUrl;
    } catch (error) {
        console.error('Error generating signed URL:', error);
        return fileUrl; // Return original URL as fallback
    }
};

/**
 * Get optimized image URL with transformations
 * @param {string} fileUrl - The original file URL
 * @param {Object} options - Transformation options
 * @returns {string} - Optimized URL (Note: Supabase doesn't have built-in transformations like Cloudinary)
 */
const getOptimizedImageUrl = (fileUrl, options = {}) => {
    // Note: Supabase Storage doesn't have built-in image transformations like Cloudinary
    // For now, we return the original URL
    // In the future, you might want to integrate with a service like ImageKit or implement your own transformation service
    
    console.log('Note: Supabase Storage does not have built-in image transformations. Returning original URL.');
    console.log('Consider integrating with ImageKit, Cloudflare Images, or implementing a transformation service if needed.');
    
    return fileUrl;
};

/**
 * Get responsive image URLs
 * @param {string} fileUrl - The original file URL
 * @param {Array} sizes - Array of sizes for responsive images
 * @returns {Array} - Array of responsive image objects
 */
const getResponsiveImageUrls = (fileUrl, sizes = [200, 400, 600, 800]) => {
    // Note: Supabase Storage doesn't have built-in image transformations
    // For now, we return the same URL for all sizes
    // You might want to pre-generate different sizes during upload or use a transformation service
    
    console.log('Note: Supabase Storage does not have built-in responsive image generation. Returning original URL for all sizes.');
    
    return sizes.map(size => ({
        url: fileUrl,
        width: size
    }));
};

/**
 * Extract file information from Supabase URL
 * @param {string} fileUrl - The Supabase file URL
 * @returns {Object} - File information object
 */
const extractFileInfo = (fileUrl) => {
    try {
        if (!fileUrl || !fileUrl.includes('/storage/v1/object/public/')) {
            return null;
        }

        const urlParts = fileUrl.split('/storage/v1/object/public/');
        if (urlParts.length !== 2) {
            return null;
        }

        const [bucket, ...pathParts] = urlParts[1].split('/');
        const filePath = pathParts.join('/');
        const fileName = pathParts[pathParts.length - 1];
        const fileExtension = fileName.split('.').pop();

        return {
            bucket,
            filePath,
            fileName,
            fileExtension,
            fullUrl: fileUrl
        };
    } catch (error) {
        console.error('Error extracting file info:', error);
        return null;
    }
};

/**
 * Check if a file exists in Supabase Storage
 * @param {string} bucket - The storage bucket
 * @param {string} filePath - The file path
 * @returns {boolean} - Whether the file exists
 */
const fileExists = async (bucket, filePath) => {
    try {
        const { data, error } = await supabase.storage
            .from(bucket)
            .list(filePath.split('/').slice(0, -1).join('/'), {
                search: filePath.split('/').pop()
            });

        if (error) {
            console.error('Error checking file existence:', error);
            return false;
        }

        return data && data.length > 0;
    } catch (error) {
        console.error('Error checking file existence:', error);
        return false;
    }
};

/**
 * Get file metadata from Supabase Storage
 * @param {string} bucket - The storage bucket
 * @param {string} filePath - The file path
 * @returns {Object|null} - File metadata
 */
const getFileMetadata = async (bucket, filePath) => {
    try {
        const { data, error } = await supabase.storage
            .from(bucket)
            .list(filePath.split('/').slice(0, -1).join('/'), {
                search: filePath.split('/').pop()
            });

        if (error || !data || data.length === 0) {
            console.error('Error getting file metadata:', error);
            return null;
        }

        return data[0];
    } catch (error) {
        console.error('Error getting file metadata:', error);
        return null;
    }
};

/**
 * Move file from one location to another within Supabase Storage
 * @param {string} fromBucket - Source bucket
 * @param {string} fromPath - Source path
 * @param {string} toBucket - Destination bucket
 * @param {string} toPath - Destination path
 * @returns {boolean} - Success status
 */
const moveFile = async (fromBucket, fromPath, toBucket, toPath) => {
    try {
        // Download the file
        const { data: fileData, error: downloadError } = await supabase.storage
            .from(fromBucket)
            .download(fromPath);

        if (downloadError) {
            console.error('Error downloading file for move:', downloadError);
            return false;
        }

        // Upload to new location
        const { error: uploadError } = await supabase.storage
            .from(toBucket)
            .upload(toPath, fileData);

        if (uploadError) {
            console.error('Error uploading file to new location:', uploadError);
            return false;
        }

        // Delete from old location
        const { error: deleteError } = await supabase.storage
            .from(fromBucket)
            .remove([fromPath]);

        if (deleteError) {
            console.error('Error deleting file from old location:', deleteError);
            // File was copied but not deleted from original location
            return false;
        }

        console.log(`Successfully moved file from ${fromBucket}/${fromPath} to ${toBucket}/${toPath}`);
        return true;
    } catch (error) {
        console.error('Error moving file:', error);
        return false;
    }
};

/**
 * Copy file within Supabase Storage
 * @param {string} fromBucket - Source bucket
 * @param {string} fromPath - Source path
 * @param {string} toBucket - Destination bucket
 * @param {string} toPath - Destination path
 * @returns {boolean} - Success status
 */
const copyFile = async (fromBucket, fromPath, toBucket, toPath) => {
    try {
        // Download the file
        const { data: fileData, error: downloadError } = await supabase.storage
            .from(fromBucket)
            .download(fromPath);

        if (downloadError) {
            console.error('Error downloading file for copy:', downloadError);
            return false;
        }

        // Upload to new location
        const { error: uploadError } = await supabase.storage
            .from(toBucket)
            .upload(toPath, fileData);

        if (uploadError) {
            console.error('Error uploading file to new location:', uploadError);
            return false;
        }

        console.log(`Successfully copied file from ${fromBucket}/${fromPath} to ${toBucket}/${toPath}`);
        return true;
    } catch (error) {
        console.error('Error copying file:', error);
        return false;
    }
};

/**
 * Get storage usage statistics
 * @returns {Object} - Storage usage information
 */
const getStorageStats = async () => {
    try {
        const stats = {};
        
        for (const [key, bucketName] of Object.entries(STORAGE_BUCKETS)) {
            try {
                const { data, error } = await supabase.storage
                    .from(bucketName)
                    .list('', { limit: 1000 });

                if (!error && data) {
                    stats[bucketName] = {
                        fileCount: data.length,
                        totalSize: data.reduce((sum, file) => sum + (file.metadata?.size || 0), 0)
                    };
                }
            } catch (bucketError) {
                console.error(`Error getting stats for bucket ${bucketName}:`, bucketError);
                stats[bucketName] = { fileCount: 0, totalSize: 0 };
            }
        }

        return stats;
    } catch (error) {
        console.error('Error getting storage stats:', error);
        return {};
    }
};

module.exports = {
    generateSignedUrl,
    getOptimizedImageUrl,
    getResponsiveImageUrls,
    extractFileInfo,
    fileExists,
    getFileMetadata,
    moveFile,
    copyFile,
    getStorageStats
};
