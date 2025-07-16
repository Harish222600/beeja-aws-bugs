require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../config/database');
const { initializeStorageBuckets } = require('../config/supabaseStorage');

// Models
const User = require('../models/user');
const Course = require('../models/course');
const SubSection = require('../models/subSection');
const JobApplication = require('../models/jobApplication');

/**
 * Migration script to help transition from Cloudinary to Supabase
 * This script helps identify files that need to be migrated
 */

const analyzeCloudinaryUsage = async () => {
    try {
        console.log('🔍 Analyzing Cloudinary usage in database...');
        
        // Connect to database
        await connectDB();
        
        // Initialize Supabase buckets
        await initializeStorageBuckets();
        
        const analysis = {
            users: { total: 0, withImages: 0, cloudinaryImages: 0 },
            courses: { total: 0, withThumbnails: 0, cloudinaryThumbnails: 0 },
            videos: { total: 0, withVideos: 0, cloudinaryVideos: 0 },
            resumes: { total: 0, withResumes: 0, cloudinaryResumes: 0 }
        };
        
        // Analyze user profile images
        console.log('📊 Analyzing user profile images...');
        const users = await User.find({});
        analysis.users.total = users.length;
        
        for (const user of users) {
            if (user.image) {
                analysis.users.withImages++;
                if (user.image.includes('cloudinary.com') || user.image.includes('res.cloudinary.com')) {
                    analysis.users.cloudinaryImages++;
                }
            }
        }
        
        // Analyze course thumbnails
        console.log('📊 Analyzing course thumbnails...');
        const courses = await Course.find({});
        analysis.courses.total = courses.length;
        
        for (const course of courses) {
            if (course.thumbnail) {
                analysis.courses.withThumbnails++;
                if (course.thumbnail.includes('cloudinary.com') || course.thumbnail.includes('res.cloudinary.com')) {
                    analysis.courses.cloudinaryThumbnails++;
                }
            }
        }
        
        // Analyze videos
        console.log('📊 Analyzing videos...');
        const subSections = await SubSection.find({});
        analysis.videos.total = subSections.length;
        
        for (const subSection of subSections) {
            if (subSection.videoUrl) {
                analysis.videos.withVideos++;
                if (subSection.videoUrl.includes('cloudinary.com') || subSection.videoUrl.includes('res.cloudinary.com')) {
                    analysis.videos.cloudinaryVideos++;
                }
            }
        }
        
        // Analyze resumes
        console.log('📊 Analyzing resumes...');
        const jobApplications = await JobApplication.find({});
        analysis.resumes.total = jobApplications.length;
        
        for (const application of jobApplications) {
            if (application.resume && application.resume.url) {
                analysis.resumes.withResumes++;
                if (application.resume.url.includes('cloudinary.com') || application.resume.url.includes('res.cloudinary.com')) {
                    analysis.resumes.cloudinaryResumes++;
                }
            }
        }
        
        // Display results
        console.log('\n📈 CLOUDINARY USAGE ANALYSIS RESULTS:');
        console.log('=====================================');
        
        console.log('\n👥 USER PROFILE IMAGES:');
        console.log(`   Total users: ${analysis.users.total}`);
        console.log(`   Users with images: ${analysis.users.withImages}`);
        console.log(`   Cloudinary images: ${analysis.users.cloudinaryImages}`);
        console.log(`   Migration needed: ${analysis.users.cloudinaryImages > 0 ? 'YES' : 'NO'}`);
        
        console.log('\n📚 COURSE THUMBNAILS:');
        console.log(`   Total courses: ${analysis.courses.total}`);
        console.log(`   Courses with thumbnails: ${analysis.courses.withThumbnails}`);
        console.log(`   Cloudinary thumbnails: ${analysis.courses.cloudinaryThumbnails}`);
        console.log(`   Migration needed: ${analysis.courses.cloudinaryThumbnails > 0 ? 'YES' : 'NO'}`);
        
        console.log('\n🎥 VIDEOS:');
        console.log(`   Total subsections: ${analysis.videos.total}`);
        console.log(`   Subsections with videos: ${analysis.videos.withVideos}`);
        console.log(`   Cloudinary videos: ${analysis.videos.cloudinaryVideos}`);
        console.log(`   Migration needed: ${analysis.videos.cloudinaryVideos > 0 ? 'YES' : 'NO'}`);
        
        console.log('\n📄 RESUMES:');
        console.log(`   Total applications: ${analysis.resumes.total}`);
        console.log(`   Applications with resumes: ${analysis.resumes.withResumes}`);
        console.log(`   Cloudinary resumes: ${analysis.resumes.cloudinaryResumes}`);
        console.log(`   Migration needed: ${analysis.resumes.cloudinaryResumes > 0 ? 'YES' : 'NO'}`);
        
        const totalCloudinaryFiles = analysis.users.cloudinaryImages + 
                                   analysis.courses.cloudinaryThumbnails + 
                                   analysis.videos.cloudinaryVideos + 
                                   analysis.resumes.cloudinaryResumes;
        
        console.log('\n🔄 MIGRATION SUMMARY:');
        console.log(`   Total Cloudinary files: ${totalCloudinaryFiles}`);
        console.log(`   Migration status: ${totalCloudinaryFiles > 0 ? 'REQUIRED' : 'NOT REQUIRED'}`);
        
        if (totalCloudinaryFiles > 0) {
            console.log('\n⚠️  NEXT STEPS:');
            console.log('   1. New uploads will automatically use Supabase with Cloudinary fallback');
            console.log('   2. Existing Cloudinary files will continue to work');
            console.log('   3. Consider migrating existing files gradually');
            console.log('   4. Monitor both storage services during transition');
        } else {
            console.log('\n✅ No Cloudinary files found. Ready for Supabase-only mode!');
        }
        
        console.log('\n🗄️ SUPABASE STORAGE BUCKETS:');
        console.log('   ✅ images - for general images');
        console.log('   ✅ videos - for course videos');
        console.log('   ✅ documents - for PDFs and documents');
        console.log('   ✅ profiles - for user profile images');
        console.log('   ✅ courses - for course thumbnails');
        console.log('   ✅ chat-files - for chat attachments');
        
        return analysis;
        
    } catch (error) {
        console.error('❌ Error analyzing Cloudinary usage:', error);
        throw error;
    } finally {
        await mongoose.connection.close();
    }
};

// Run the analysis
if (require.main === module) {
    analyzeCloudinaryUsage()
        .then(() => {
            console.log('\n✅ Analysis completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Analysis failed:', error);
            process.exit(1);
        });
}

module.exports = { analyzeCloudinaryUsage };
