#!/usr/bin/env python3

import json
import sys

def add_youtube_fields():
    try:
        # Read the metadata file
        with open('src/data/metadata.json', 'r') as f:
            metadata = json.load(f)
        
        print(f"Processing {len(metadata)} entries...")
        
        updated_count = 0
        
        # Add YouTube fields to each entry
        for filename, data in metadata.items():
            modified = False
            
            # Add youtubeLink if missing
            if 'youtubeLink' not in data:
                data['youtubeLink'] = ""
                modified = True
            
            # Add youtubeTitle if missing  
            if 'youtubeTitle' not in data:
                data['youtubeTitle'] = ""
                modified = True
                
            if modified:
                updated_count += 1
        
        # Special case for M27-2-1.jpg
        if 'M27-2-1.jpg' in metadata:
            metadata['M27-2-1.jpg']['youtubeTitle'] = 'Cosmic Contemplations'
            print("✅ Set M27-2-1.jpg youtubeTitle to 'Cosmic Contemplations'")
        
        # Write back to file with proper formatting
        with open('src/data/metadata.json', 'w') as f:
            json.dump(metadata, f, indent=2)
        
        print(f"✅ Updated {updated_count} entries")
        print(f"✅ Total entries: {len(metadata)}")
        print("✅ All entries now have youtubeLink and youtubeTitle fields")
        
        # Verify by checking a few entries
        sample_entries = list(metadata.keys())[:3]
        print("\n📋 Sample entries after update:")
        for entry in sample_entries:
            has_link = 'youtubeLink' in metadata[entry]
            has_title = 'youtubeTitle' in metadata[entry]
            print(f"  {entry}: youtubeLink={has_link}, youtubeTitle={has_title}")
            
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    add_youtube_fields()
