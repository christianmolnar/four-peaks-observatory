const fs = require('fs');

// Quick debug script to check the parsing
const CONTEMPLATION_LINKS_FILE = '/Users/christian/Repos/MapleValleyObservatory/docs/youtube-contemplation-links.md';

try {
  const content = fs.readFileSync(CONTEMPLATION_LINKS_FILE, 'utf8');
  const lines = content.split('\n');
  let currentVideo = null;
  let foundAssignment = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // Look for video name/title
    if (trimmedLine.match(/^- \*\*([^*]+)\*\*\s*$/)) {
      if (currentVideo && foundAssignment) {
        console.log(`✅ Found assignment for: ${currentVideo.name} -> ${currentVideo.assignedTo}`);
      }
      
      currentVideo = {
        name: trimmedLine.match(/^- \*\*([^*]+)\*\*\s*$/)[1].trim(),
        assignedTo: null
      };
      foundAssignment = false;
      console.log(`🔍 Parsing video: ${currentVideo.name}`);
    }
    
    // Look for assignment
    if (trimmedLine.match(/^- \*\*🎯 Assigned to: ([^*]+)\*\*\s*$/) && currentVideo) {
      currentVideo.assignedTo = trimmedLine.match(/^- \*\*🎯 Assigned to: ([^*]+)\*\*\s*$/)[1].trim();
      foundAssignment = true;
      console.log(`   📍 Assignment found: ${currentVideo.assignedTo}`);
    }
    
    // Debug: show lines that contain assignment emoji
    if (line.includes('🎯')) {
      console.log(`🔍 Line ${i+1}: "${line}"`);
      console.log(`   Trimmed: "${trimmedLine}"`);
      console.log(`   Matches regex: ${!!trimmedLine.match(/^- \*\*🎯 Assigned to: ([^*]+)\*\*\s*$/)}`);
    }
  }
  
  // Check the last one
  if (currentVideo && foundAssignment) {
    console.log(`✅ Found assignment for: ${currentVideo.name} -> ${currentVideo.assignedTo}`);
  }
  
} catch (error) {
  console.log(`Error: ${error.message}`);
}
