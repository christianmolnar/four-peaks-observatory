# Contemplation Inventory Management System

## Overview

This system provides comprehensive coordination between your astrophotography metadata and YouTube contemplation links. It maintains an automated inventory that tracks which images have videos assigned, which don't, and provides easy management capabilities.

## Files in the System

### 1. **metadata.json** (`src/data/metadata.json`)
- Primary metadata for all astrophotography images
- Contains `youtubeLink` and `youtubeTitle` fields for each image
- Automatically updated by the management system

### 2. **youtube-contemplation-links.md** (`docs/youtube-contemplation-links.md`)
- Curated collection of contemplative YouTube content
- Contains assignment annotations (`🎯 Assigned to: image.jpg`)
- Automatically updated with assignment tracking

### 3. **contemplation-inventory.json** (NEW)
- Real-time inventory of the entire system
- Tracks assignments, available content, and statistics
- Updated automatically by update-metadata.js

### 4. **update-metadata.js** (ENHANCED)
- Enhanced script with contemplation management capabilities
- Provides CLI commands for video management
- Maintains coordination between all files

## Usage Commands

### Basic Inventory Management

```bash
# Generate comprehensive inventory report
node update-metadata.js inventory

# Update metadata and refresh inventory (standard operation)
node update-metadata.js
```

### Video Assignment Management

```bash
# Add a video to an image
node update-metadata.js add-video "image.jpg" "https://youtube.com/watch?v=..." "Video Title"

# Remove video from an image
node update-metadata.js remove-video "image.jpg"
```

### Example Workflow

```bash
# 1. Check current inventory
node update-metadata.js inventory

# 2. Add a video to an available image
node update-metadata.js add-video "NGC2244.jpg" "https://www.youtube.com/watch?v=abc123" "Peaceful Space Music"

# 3. Verify the assignment
node update-metadata.js inventory
```

## Inventory Report Features

The inventory command provides:

### 📊 **Statistics Overview**
- Total images in collection
- Images with videos assigned
- Images available for assignment
- Available videos in contemplation links

### 🎨 **Content Categories**
- Classical music assignments
- Progressive rock assignments  
- Gratitude/mindfulness practices
- Cosmic contemplation content
- Jazz fusion compositions
- Poetry and spoken word
- Experimental/ambient content

### 📷 **Available Images List**
- Shows unassigned images with their astronomical details
- Includes catalog designations and object names
- Helps identify good candidates for video pairing

### 🎵 **Available Videos List**
- Shows unassigned videos from contemplation links
- Includes video titles and descriptions
- Perfect for finding content to assign

## Automated Coordination

The system automatically:

1. **Updates contemplation-inventory.json** whenever metadata changes
2. **Adds assignment annotations** to youtube-contemplation-links.md when videos are assigned
3. **Removes assignment annotations** when videos are unassigned
4. **Maintains consistency** between all three files
5. **Categorizes content** by type for easy analysis

## Current Statistics

Based on your latest inventory:
- **Total Images**: 135
- **Images with Videos**: 24 (18%)
- **Images Available**: 111 (82%)
- **Content Categories**: 8 different types represented

## Content Distribution

- **Lito Vitale (Jazz)**: 7 assignments
- **Gratitude Practices**: 5 assignments  
- **David Whyte Poetry**: 3 assignments
- **Classical, Progressive, Mindfulness, Cosmic, Experimental**: 1 each

## Best Practices

### For Adding New Videos:
1. Run `inventory` to see available images and content types
2. Match content type to appropriate astronomical subjects:
   - **Deep sky objects** → Cosmic, instrumental, jazz
   - **Planets/Moon** → Mindfulness, poetry, meditation
   - **Wide fields** → Progressive rock, classical symphonies
   - **Nebulae** → Ambient, experimental, contemplative

### For Content Curation:
1. The system tracks which types of content you have most/least of
2. Use this data to guide new content additions to youtube-contemplation-links.md
3. The inventory will automatically update when you add new content

### For Quality Control:
1. Run `inventory` regularly to spot-check assignments
2. Use `remove-video` to correct any mismatched pairings
3. The system maintains data integrity automatically

## File Locations

```
/Users/christian/Repos/MapleValleyObservatory/
├── src/data/metadata.json              # Primary metadata
├── docs/youtube-contemplation-links.md # Curated content list  
├── contemplation-inventory.json        # Automated inventory
└── update-metadata.js                  # Management script
```

## Integration with Your Workflow

This system integrates seamlessly with your existing astrophotography workflow:

1. **Normal operations** continue as before with `node update-metadata.js`
2. **New inventory capabilities** are available when you need them
3. **Video management** is now streamlined and automated
4. **Cross-file consistency** is maintained automatically

The contemplation system now has full inventory management, making it easy to see your progress toward creating a comprehensive contemplative viewing experience for your astrophotography gallery.
