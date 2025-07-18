// AUTH , IS STUDENT , IS INSTRUCTOR , IS ADMIN

const jwt = require("jsonwebtoken");
const TokenBlacklist = require('../models/tokenBlacklist');
require('dotenv').config();


//   == AUTH   ==
// user Authentication by checking token validating
exports.auth = async (req, res, next) => {
    try {
        // extract token by anyone from this 3 ways
        const token = req.body?.token || req.cookies?.token || req.header('Authorization')?.replace('Bearer ', '');

        // if token is missing
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Token is Missing'
            });
        }

        // Check if token is blacklisted
        try {
            // First decode the token to get user ID (without verification)
            let userId = null;
            try {
                const decoded = jwt.decode(token);
                userId = decoded?.id;
            } catch (decodeError) {
                // Could not decode token for blacklist check
            }
            
            // Check for specific token blacklist
            const blacklistedToken = await TokenBlacklist.findOne({ token });
            if (blacklistedToken) {
                return res.status(401).json({
                    success: false,
                    message: 'Token has been invalidated. Please login again.',
                    reason: 'TOKEN_BLACKLISTED'
                });
            }
            
            // Check for user-wide token blacklist (when user is deleted/suspended)
            if (userId) {
                const userTokenIdentifier = `USER_${userId}_ALL_TOKENS`;
                const userBlacklisted = await TokenBlacklist.findOne({ token: userTokenIdentifier });
                if (userBlacklisted) {
                    return res.status(401).json({
                        success: false,
                        message: 'Your account has been deactivated. Please contact support.',
                        reason: 'USER_DEACTIVATED'
                    });
                }
            }
        } catch (error) {
            // Continue with token verification even if blacklist check fails
        }

        // verify token
        try {
            const decode = jwt.verify(token, process.env.JWT_SECRET);
            
            // Additional check: Verify if user is still active in database
            try {
                const User = require('../models/user');
                const currentUser = await User.findById(decode.id);
                
                if (!currentUser) {
                    return res.status(401).json({
                        success: false,
                        message: 'User account not found. Please login again.',
                        reason: 'USER_NOT_FOUND'
                    });
                }
                
                if (!currentUser.active) {
                    return res.status(401).json({
                        success: false,
                        message: 'Your account has been deactivated. Please contact support.',
                        reason: 'USER_DEACTIVATED'
                    });
                }
            } catch (dbError) {
                // Continue with normal flow if database check fails
            }
            
            req.user = decode;
        }
        catch (error) {
            return res.status(401).json({
                success: false,
                error: error.message,
                messgae: 'Error while decoding token'
            })
        }
        
        // go to next middleware
        next();
    }
    catch (error) {
        return res.status(500).json({
            success: false,
            messgae: 'Error while token validating'
        })
    }
}





//   == IS STUDENT   ==
exports.isStudent = (req, res, next) => {
    try {
        // console.log('User data -> ', req.user)
        if (req.user?.accountType != 'Student') {
            return res.status(401).json({
                success: false,
                messgae: 'This Page is protected only for student'
            })
        }
        // go to next middleware
        next();
    }
    catch (error) {
        console.log('Error while cheching user validity with student accountType');
        console.log(error);
        return res.status(500).json({
            success: false,
            error: error.message,
            messgae: 'Error while cheching user validity with student accountType'
        })
    }
}


//   == IS INSTRUCTOR   ==
exports.isInstructor = (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        // Allow both Instructors and Admins
        if (req.user?.accountType !== 'Instructor' && req.user?.accountType !== 'Admin') {
            return res.status(401).json({
                success: false,
                message: 'This page is protected for Instructors and Admins only',
                currentRole: req.user.accountType
            })
        }
        
        // go to next middleware
        next();
    }
    catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message,
            message: 'Error while checking user validity with Instructor/Admin accountType'
        })
    }
}


//   == IS ADMIN   ==
exports.isAdmin = (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        if (req.user.accountType !== 'Admin') {
            return res.status(401).json({
                success: false,
                message: 'This page is protected for Admin only',
                currentRole: req.user.accountType
            });
        }

        // go to next middleware
        next();
    }
    catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message,
            message: 'Error while checking admin status'
        });
    }
}


