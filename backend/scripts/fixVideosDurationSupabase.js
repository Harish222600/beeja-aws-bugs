const mongoose = require('mongoose');
const SubSection = require('../models/subSection');
const { extractVideoMetadata } = require('../utils/videoMetadata');
const { convertSecondsToDuration } = require('../utils/secToDuration');
const axios = require('axios');
require('dotenv').config();

// Connect to MongoDB
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('✅ Connected to MongoDB');
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error);
        process.exit(1);
    }
};

// Download video buffer from URL
const downloadVideoBuffer = async (url) => {
    try {
        console.log(`📥 Downloading video from: ${url}`);
        const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'arraybuffer',
            timeout: 60000, // 60 seconds timeout
            maxContentLength: 500 * 1024 * 1024, // 500MB max
        });
        
        const buffer = Buffer.from(response.data);
        console.log(`✅ Downloaded ${(buffer.length / (1024 * 1024)).toFixed(2)}MB`);
        return buffer;
    } catch (error) {
        console.error(`❌ Failed to download video: ${error.message}`);
        return null;
    }
};

// Extract duration from video URL
const extractDurationFromUrl = async (videoUrl, originalFilename = 'video.mp4') => {
    try {
        // Download the video buffer
        const videoBuffer = await downloadVideoBuffer(videoUrl);
        if (!videoBuffer) {
            return 0;
        }

        // Extract metadata
        const metadata = await extractVideoMetadata(videoBuffer, {
            originalname: originalFilename,
            size: videoBuffer.length,
            mimetype: 'video/mp4'
        });

        return metadata.duration || 0;
    } catch (error) {
        console.error('Error extracting duration from URL:', error);
        return 0;
    }
};

// Main function to fix video durations
const fixVideosDuration = async () => {
    try {
        console.log('🎬 Starting video duration fix for Supabase videos...');
        
        // Find all subsections with video URLs but missing or zero duration
        const subsections = await SubSection.find({
            videoUrl: { $exists: true, $ne: null, $ne: '' },
            $or: [
                { timeDuration: { $exists: false } },
                { timeDuration: null },
                { timeDuration: 0 },
                { timeDuration: '' }
            ]
        });

        console.log(`Found ${subsections.length} subsections with missing duration`);

        if (subsections.length === 0) {
            console.log('✅ No subsections need duration fixes');
            return;
        }

        let updated = 0;
        let failed = 0;
        let skipped = 0;

        for (const subsection of subsections) {
            try {
                console.log(`\n📹 Processing subsection: ${subsection._id} (${subsection.title})`);
                console.log(`Video URL: ${subsection.videoUrl}`);

                // Check if it's a Supabase URL
                if (!subsection.videoUrl.includes('supabase.co')) {
                    console.log('⏭️ Skipping non-Supabase URL');
                    skipped++;
                    continue;
                }

                // Extract duration
                const duration = await extractDurationFromUrl(subsection.videoUrl, subsection.title || 'video.mp4');

                if (duration > 0) {
                    subsection.timeDuration = duration;
                    await subsection.save();
                    console.log(`✅ Updated duration for subsection ${subsection._id} (${subsection.title}): ${convertSecondsToDuration(duration)} (${duration}s)`);
                    updated++;
                } else {
                    console.log(`⚠️ Could not extract valid duration for subsection ${subsection._id} (${subsection.title})`);
                    failed++;
                }

                // Add a small delay to avoid overwhelming the server
                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (error) {
                console.error(`❌ Error processing subsection ${subsection._id}:`, error.message);
                failed++;
            }
        }

        console.log('\n📊 Summary:');
        console.log(`✅ Successfully updated: ${updated}`);
        console.log(`❌ Failed to update: ${failed}`);
        console.log(`⏭️ Skipped (non-Supabase): ${skipped}`);
        console.log(`📝 Total processed: ${subsections.length}`);

    } catch (error) {
        console.error('❌ Error in fixVideosDuration:', error);
    }
};

// Run the script
const main = async () => {
    try {
        await connectDB();
        await fixVideosDuration();
        console.log('\n🎉 Video duration fix completed!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Script failed:', error);
        process.exit(1);
    }
};

// Handle script termination
process.on('SIGINT', () => {
    console.log('\n⏹️ Script interrupted by user');
    mongoose.connection.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n⏹️ Script terminated');
    mongoose.connection.close();
    process.exit(0);
});

main();
