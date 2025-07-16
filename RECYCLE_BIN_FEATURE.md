# Recycle Bin Feature Documentation

## Overview

The Recycle Bin feature provides a safety net for deleted items in the admin dashboard. Instead of permanently deleting users, courses, and categories, they are moved to a recycle bin where they can be restored within 30 days or permanently deleted manually.

## Features

### 1. Soft Delete System
- **Users**: When deleted, users are moved to recycle bin and marked as inactive
- **Courses**: When deleted, courses are moved to recycle bin and marked as hidden/draft
- **Categories**: When deleted, categories are moved to recycle bin

### 2. Auto-Expiry
- Items automatically expire after 30 days
- Expired items are permanently deleted via scheduled cleanup
- Daily cleanup runs at 2:00 AM UTC

### 3. Restore Functionality
- Items can be restored to their original state
- Restored users become active again
- Restored courses become visible and published again

### 4. Admin Interface
- Dedicated Recycle Bin section in admin sidebar
- Tabbed interface for different item types (All, Users, Courses, Categories)
- Search functionality within recycle bin
- Pagination for large datasets

## Implementation Details

### Backend Components

#### 1. Database Model (`backend/models/recycleBin.js`)
```javascript
{
  itemType: String, // 'User', 'Course', 'Category'
  originalId: ObjectId, // Reference to original item
  originalData: Mixed, // Complete original item data
  deletedBy: ObjectId, // Admin who deleted the item
  deletedAt: Date, // When item was deleted
  reason: String, // Optional deletion reason
  expiresAt: Date // Auto-expiry date (30 days)
}
```

#### 2. Controller (`backend/controllers/recycleBin.js`)
- `getRecycleBinItems()` - Fetch items with pagination and filtering
- `moveToRecycleBin()` - Soft delete items
- `restoreFromRecycleBin()` - Restore items
- `permanentlyDelete()` - Permanently delete items
- `getRecycleBinStats()` - Get statistics
- `cleanupExpiredItems()` - Manual cleanup

#### 3. Routes (`backend/routes/recycleBin.js`)
- `GET /api/v1/recycle-bin` - Get items
- `GET /api/v1/recycle-bin/stats` - Get statistics
- `POST /api/v1/recycle-bin/move` - Move item to bin
- `PUT /api/v1/recycle-bin/restore/:id` - Restore item
- `DELETE /api/v1/recycle-bin/permanent/:id` - Permanently delete
- `POST /api/v1/recycle-bin/cleanup` - Manual cleanup

#### 4. Auto-Cleanup (`backend/scripts/recycleBinCleanup.js`)
- Scheduled daily cleanup using node-cron
- Permanently deletes expired items
- Can be run manually for testing

### Frontend Components

#### 1. API Service (`frontend/src/services/operations/recycleBinAPI.js`)
- Complete API integration for all recycle bin operations
- Error handling and toast notifications
- Proper authentication token handling

#### 2. Main Component (`frontend/src/pages/Admin/components/RecycleBin.jsx`)
- Tabbed interface for different item types
- Search and pagination functionality
- Restore and permanent delete actions
- Statistics display
- Expiry status indicators

#### 3. Integration Updates
- **CourseManagement.jsx**: Modified to use recycle bin instead of permanent delete
- **UserManagement.jsx**: Modified to use recycle bin instead of permanent delete
- **AdminSidebar.jsx**: Added recycle bin navigation item
- **Dashboard.jsx**: Added recycle bin component routing

#### 4. Utilities (`frontend/src/utils/dateFormatter.js`)
- Date formatting functions
- Relative time calculations
- Expiry status helpers

## Usage Guide

### For Administrators

#### Accessing Recycle Bin
1. Navigate to Admin Dashboard
2. Click "Recycle Bin" in the sidebar
3. Use tabs to filter by item type (All, Users, Courses, Categories)

#### Deleting Items
1. Go to respective management section (Users, Courses, Categories)
2. Click delete button on any item
3. Confirm the action in the modal
4. Item is moved to recycle bin (not permanently deleted)

#### Restoring Items
1. Go to Recycle Bin
2. Find the item you want to restore
3. Click "Restore" button
4. Item is restored to its original state

#### Permanent Deletion
1. Go to Recycle Bin
2. Find the item you want to permanently delete
3. Click "Delete" button
4. Confirm the permanent deletion
5. Item is permanently removed from database

#### Bulk Cleanup
1. Go to Recycle Bin
2. Click "Cleanup Expired" button
3. All expired items (>30 days) are permanently deleted

### For Students (Course Deletion Handling)

When a course is deleted:
1. Course becomes invisible in course listings
2. Enrolled students can still access course content
3. Course shows as "deleted by admin" message
4. If course is restored, it becomes normal again

## Technical Considerations

### Database Indexes
- TTL index on `expiresAt` for automatic MongoDB cleanup
- Compound indexes for efficient querying
- Indexes on `itemType`, `deletedAt`, and `deletedBy`

### Performance
- Pagination implemented for large datasets
- Lazy loading of components
- Optimized database queries with proper indexing

### Security
- Admin-only access to recycle bin functionality
- Proper authentication checks on all endpoints
- Input validation and sanitization

### Error Handling
- Comprehensive error handling in API calls
- User-friendly error messages
- Graceful fallbacks for failed operations

## Installation & Setup

### Backend Setup
1. Install dependencies:
   ```bash
   cd backend
   npm install node-cron
   ```

2. The recycle bin routes are automatically registered in `server.js`

3. The cleanup scheduler starts automatically when server starts

### Frontend Setup
1. No additional dependencies required
2. Components are lazy-loaded for better performance
3. Recycle bin is automatically added to admin navigation

### Database Setup
1. MongoDB TTL indexes are created automatically
2. No manual database setup required
3. Existing data is not affected

## API Documentation

### Get Recycle Bin Items
```
GET /api/v1/recycle-bin?itemType=Course&page=1&limit=10
```

### Move Item to Recycle Bin
```
POST /api/v1/recycle-bin/move
{
  "itemType": "Course",
  "itemId": "64f8a1b2c3d4e5f6a7b8c9d0",
  "reason": "Course outdated"
}
```

### Restore Item
```
PUT /api/v1/recycle-bin/restore/64f8a1b2c3d4e5f6a7b8c9d0
```

### Permanently Delete Item
```
DELETE /api/v1/recycle-bin/permanent/64f8a1b2c3d4e5f6a7b8c9d0
```

## Future Enhancements

1. **Email Notifications**: Notify admins before items expire
2. **Bulk Operations**: Select multiple items for restore/delete
3. **Advanced Filtering**: Filter by date range, admin, etc.
4. **Audit Trail**: Detailed logs of all recycle bin operations
5. **Category Integration**: Full category soft delete support
6. **Export Functionality**: Export recycle bin data

## Troubleshooting

### Common Issues

1. **Items not appearing in recycle bin**
   - Check if soft delete was properly implemented
   - Verify API endpoints are working
   - Check database for RecycleBin collection

2. **Auto-cleanup not working**
   - Verify node-cron is installed
   - Check server logs for scheduler errors
   - Ensure MongoDB TTL indexes are created

3. **Restore not working**
   - Check if original item still exists
   - Verify restore logic in controllers
   - Check for database constraint violations

### Debugging

1. Enable debug logs in cleanup script
2. Check MongoDB TTL index status
3. Monitor API response times and errors
4. Use browser dev tools for frontend debugging

## Security Notes

- All recycle bin operations require admin authentication
- Sensitive data in originalData field should be handled carefully
- Consider data retention policies for compliance
- Regular security audits recommended

## Performance Monitoring

- Monitor recycle bin collection size
- Track cleanup job performance
- Monitor API response times
- Set up alerts for failed operations
