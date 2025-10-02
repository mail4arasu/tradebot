# Manual Image Upload Guide

Due to server-level upload size restrictions, images for announcements need to be uploaded manually via SCP.

## Upload Process

### 1. Prepare Your Images
- Supported formats: JPEG, PNG, GIF, WebP
- Recommended size: Under 1MB for best performance
- Use descriptive filenames (e.g., `puja-announcement-2025.jpg`)

### 2. Upload via SCP
```bash
# Upload to production server
scp your-image.jpg username@niveshawealth.in:/path/to/tradebot-portal/public/uploads/announcements/

# Or if using a specific path/port
scp -P [port] your-image.jpg username@server:/home/user/tradebot-portal/public/uploads/announcements/
```

### 3. Set Proper Permissions
```bash
# SSH into the server
ssh username@niveshawealth.in

# Navigate to the directory
cd /path/to/tradebot-portal/public/uploads/announcements/

# Set proper permissions
chmod 644 *.jpg *.png *.gif *.webp
```

### 4. Use in Admin Panel
1. Go to `/admin/announcements`
2. Click "Create New Announcement"
3. Click "Browse Available Images"
4. Select your uploaded image from the grid
5. Complete the announcement and save

## Directory Structure
```
tradebot-portal/
└── public/
    └── uploads/
        └── announcements/
            ├── your-image-1.jpg
            ├── your-image-2.png
            └── puja-announcement.gif
```

## Image Access
- Images are served at: `https://niveshawealth.in/uploads/announcements/filename.jpg`
- The admin panel automatically detects and lists all available images
- Click "Browse Available Images" to refresh the list after uploading new files

## Troubleshooting
- If images don't appear, check file permissions (should be 644)
- Ensure the uploads directory exists: `public/uploads/announcements/`
- Refresh the image browser in the admin panel
- Check that filenames don't contain special characters or spaces