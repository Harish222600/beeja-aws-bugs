#!/usr/bin/env node

/**
 * Test script to verify bcrypt is working correctly
 * This can be run inside the Docker container to test the fix
 */

const bcrypt = require('bcrypt');

async function testBcrypt() {
    console.log('🧪 Testing bcrypt functionality...');
    
    try {
        const password = 'test-password-123';
        const saltRounds = 10;
        
        console.log('📝 Hashing password...');
        const hash = await bcrypt.hash(password, saltRounds);
        console.log('✅ Password hashed successfully:', hash.substring(0, 20) + '...');
        
        console.log('🔍 Comparing password...');
        const isMatch = await bcrypt.compare(password, hash);
        console.log('✅ Password comparison result:', isMatch);
        
        if (isMatch) {
            console.log('🎉 bcrypt is working correctly!');
            process.exit(0);
        } else {
            console.log('❌ bcrypt comparison failed');
            process.exit(1);
        }
        
    } catch (error) {
        console.error('❌ bcrypt test failed:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

testBcrypt();
