#!/usr/bin/env node
/**
 * Bulk Description Generator
 * Generates AI descriptions for all existing deep-sky objects in metadata.json
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

// OpenAI Configuration
const OPENAI_CONFIG = {
  model: "gpt-4o-mini",
  temperature: 0.7,
  maxTokens: 200
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Get educational description for astronomical objects using OpenAI
async function getAstronomicalObjectDescription(objectName, catalogDesignation, category) {
  try {
    const objectIdentifier = catalogDesignation && objectName ? 
      `${catalogDesignation} (${objectName})` : 
      objectName || catalogDesignation;

    console.log(`   🤖 Generating description for: ${objectIdentifier}`);

    const prompt = `Write a brief but complete educational description for the astronomical object: ${objectIdentifier}

Please provide:
- What type of object it is (galaxy, nebula, star cluster, etc.)
- Key interesting facts about the object
- Distance from Earth if known
- Notable features or characteristics
- Why it's significant or popular for astrophotography

Keep it to 2-3 sentences maximum. Make it accessible but informative.

Example format: "M42, the Orion Nebula, is a stellar nursery located about 1,344 light-years away in the constellation Orion. This bright emission nebula is one of the most photographed deep sky objects due to its vivid colors and intricate structure, caused by young hot stars ionizing the surrounding gas and dust."`;

    const completion = await openai.chat.completions.create({
      model: OPENAI_CONFIG.model,
      messages: [
        {
          role: "system",
          content: "You are an expert astronomy educator. Provide accurate, concise, and engaging descriptions of astronomical objects that would interest both amateur astronomers and the general public."
        },
        {
          role: "user", 
          content: prompt
        }
      ],
      max_tokens: OPENAI_CONFIG.maxTokens,
      temperature: OPENAI_CONFIG.temperature,
    });

    const description = completion.choices[0].message.content.trim();
    console.log(`   ✅ Description generated: ${description.substring(0, 50)}...`);
    return description;
    
  } catch (error) {
    console.log(`   ❌ Failed to generate description for ${objectName}: ${error.message}`);
    return null;
  }
}

async function generateDescriptionsForAllObjects() {
  console.log('🤖 Starting bulk description generation for deep-sky objects...');
  
  // Load existing metadata
  const metadataPath = path.join(__dirname, '..', 'src', 'data', 'metadata.json');
  let metadata;
  
  try {
    const metadataContent = fs.readFileSync(metadataPath, 'utf8');
    metadata = JSON.parse(metadataContent);
  } catch (error) {
    console.error('❌ Error loading metadata:', error.message);
    process.exit(1);
  }

  // Check OpenAI API key
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your-openai-api-key-here') {
    console.error('❌ OpenAI API key not configured. Please set OPENAI_API_KEY in .env file.');
    process.exit(1);
  }

  let processedCount = 0;
  let successCount = 0;
  let skippedCount = 0;

  // Process each entry
  for (const [filename, entry] of Object.entries(metadata)) {
    // Only process deep-sky astrophotography objects
    if (entry.category === 'astrophotography' && 
        entry.subcategory && 
        entry.subcategory.includes('deep-sky') &&
        !entry.description) {
      
      processedCount++;
      console.log(`\n📝 Processing ${processedCount}: ${filename}`);
      console.log(`   📍 Category: ${entry.subcategory}`);
      console.log(`   🔭 Object: ${entry.catalogDesignation || 'N/A'} - ${entry.objectName || 'N/A'}`);
      
      // Generate description
      const description = await getAstronomicalObjectDescription(
        entry.objectName, 
        entry.catalogDesignation, 
        entry.subcategory
      );
      
      if (description) {
        entry.description = description;
        successCount++;
        console.log(`   💾 Description added to metadata`);
      }
      
      // Small delay to be respectful to OpenAI API
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } else if (entry.description && entry.category === 'astrophotography' && entry.subcategory?.includes('deep-sky')) {
      skippedCount++;
      console.log(`⏭️  Skipping ${filename} - already has description`);
    }
  }

  // Save updated metadata
  try {
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    console.log('\n✅ Metadata file updated successfully!');
  } catch (error) {
    console.error('❌ Error saving metadata:', error.message);
    process.exit(1);
  }

  // Summary
  console.log('\n📊 GENERATION SUMMARY:');
  console.log('========================');
  console.log(`✅ Descriptions generated: ${successCount}`);
  console.log(`⏭️  Objects skipped (already had descriptions): ${skippedCount}`);
  console.log(`📝 Total deep-sky objects processed: ${processedCount}`);
  console.log('');
  console.log('🎉 All deep-sky objects now have AI-generated descriptions!');
}

// Run the description generation
generateDescriptionsForAllObjects().catch(error => {
  console.error('💥 Script failed:', error);
  process.exit(1);
});
