const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function testSupabaseConnection() {
    console.log('🔍 Testing Supabase Configuration...\n');
    
    // Check environment variables
    console.log('📋 Environment Variables:');
    console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '✅ Set' : '❌ Missing');
    console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Set' : '❌ Missing');
    
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.log('\n❌ Missing required environment variables!');
        return;
    }
    
    // Check if it's actually a service role key
    try {
        const payload = JSON.parse(Buffer.from(process.env.SUPABASE_SERVICE_ROLE_KEY.split('.')[1], 'base64').toString());
        console.log('\n🔑 Token Analysis:');
        console.log('Role:', payload.role);
        console.log('Issuer:', payload.iss);
        
        if (payload.role !== 'service_role') {
            console.log('\n❌ ERROR: You are using an ANON key, not a SERVICE ROLE key!');
            console.log('🔧 Fix: Go to Supabase Dashboard → Settings → API → Copy the "service_role" key');
            return;
        } else {
            console.log('✅ Correct service role key detected');
        }
    } catch (error) {
        console.log('\n❌ Invalid token format');
        return;
    }
    
    // Test connection
    console.log('\n🔌 Testing Connection...');
    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        }
    );
    
    try {
        // Test bucket listing
        const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
        
        if (bucketsError) {
            console.log('❌ Failed to list buckets:', bucketsError.message);
            return;
        }
        
        console.log('✅ Connection successful!');
        console.log('\n📁 Existing Buckets:');
        if (buckets && buckets.length > 0) {
            buckets.forEach(bucket => {
                console.log(`  - ${bucket.name} (${bucket.public ? 'public' : 'private'})`);
            });
        } else {
            console.log('  No buckets found - you need to create them!');
        }
        
        // Check required buckets
        const requiredBuckets = ['images', 'videos', 'documents', 'profiles', 'courses', 'chat-files'];
        const existingBucketNames = buckets ? buckets.map(b => b.name) : [];
        const missingBuckets = requiredBuckets.filter(name => !existingBucketNames.includes(name));
        
        if (missingBuckets.length > 0) {
            console.log('\n⚠️  Missing Required Buckets:');
            missingBuckets.forEach(bucket => {
                console.log(`  - ${bucket}`);
            });
            console.log('\n🔧 Run the SQL script from backend/scripts/setupSupabaseBuckets.sql');
        } else {
            console.log('\n✅ All required buckets exist!');
        }
        
        // Test upload (if buckets exist)
        if (existingBucketNames.includes('images')) {
            console.log('\n🧪 Testing File Upload...');
            const testFile = Buffer.from('test file content');
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('images')
                .upload('test-file.txt', testFile, {
                    contentType: 'text/plain',
                    upsert: true
                });
                
            if (uploadError) {
                console.log('❌ Upload test failed:', uploadError.message);
                if (uploadError.message.includes('row-level security policy')) {
                    console.log('🔧 Fix: Run the RLS policy setup from setupSupabaseBuckets.sql');
                }
            } else {
                console.log('✅ Upload test successful!');
                
                // Clean up test file
                await supabase.storage.from('images').remove(['test-file.txt']);
                console.log('🧹 Test file cleaned up');
            }
        }
        
    } catch (error) {
        console.log('❌ Connection failed:', error.message);
    }
}

testSupabaseConnection().catch(console.error);
