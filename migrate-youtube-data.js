const fs = require('fs');
const path = require('path');

// File paths
const contemplationFile = path.join(__dirname, 'src', 'data', 'contemplation-inventory.json');
const metadataFile = path.join(__dirname, 'src', 'data', 'metadata.json');

console.log('🔍 Starting YouTube data migration...');
console.log('📁 Reading contemplation-inventory.json...');

// Read contemplation data
let contemplationData;
try {
    const contemplationContent = fs.readFileSync(contemplationFile, 'utf8');
    contemplationData = JSON.parse(contemplationContent);
    console.log(`✅ Found ${Object.keys(contemplationData.assignments).length} YouTube assignments`);
} catch (error) {
    console.error('❌ Error reading contemplation-inventory.json:', error.message);
    process.exit(1);
}

console.log('📁 Reading metadata.json...');

// Read metadata
let metadata;
try {
    const metadataContent = fs.readFileSync(metadataFile, 'utf8');
    metadata = JSON.parse(metadataContent);
    console.log(`✅ Found ${Object.keys(metadata).length} total entries in metadata.json`);
} catch (error) {
    console.error('❌ Error reading metadata.json:', error.message);
    process.exit(1);
}

// Migrate YouTube data
let migratedCount = 0;
let skippedCount = 0;

console.log('\n🔄 Migrating YouTube data...');

for (const [filename, assignment] of Object.entries(contemplationData.assignments)) {
    if (metadata[filename]) {
        // Update the metadata entry with YouTube data
        metadata[filename].youtubeLink = assignment.youtubeLink;
        metadata[filename].youtubeTitle = assignment.youtubeTitle;
        
        console.log(`✅ ${filename}: ${assignment.youtubeTitle}`);
        migratedCount++;
    } else {
        console.log(`⚠️  ${filename}: Not found in metadata.json`);
        skippedCount++;
    }
}

console.log(`\n📊 Migration Summary:`);
console.log(`   ✅ Migrated: ${migratedCount} entries`);
console.log(`   ⚠️  Skipped: ${skippedCount} entries`);

// Create backup
const backupFile = path.join(__dirname, 'src', 'data', `metadata.json.backup.${Date.now()}`);
console.log(`\n💾 Creating backup: ${path.basename(backupFile)}`);

try {
    const originalContent = fs.readFileSync(metadataFile, 'utf8');
    fs.writeFileSync(backupFile, originalContent);
    console.log('✅ Backup created successfully');
} catch (error) {
    console.error('❌ Error creating backup:', error.message);
    process.exit(1);
}

// Write updated metadata
console.log('\n💾 Writing updated metadata.json...');

try {
    fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));
    console.log('✅ metadata.json updated successfully');
} catch (error) {
    console.error('❌ Error writing metadata.json:', error.message);
    process.exit(1);
}

console.log('\n🎉 YouTube data migration completed!');
console.log('\n📋 Next steps:');
console.log('   1. Test the YouTube contemplation controls in the gallery');
console.log('   2. Verify migrated data is correct');
console.log('   3. Run update-metadata.js for OpenAI descriptions');
