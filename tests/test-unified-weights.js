#!/usr/bin/env node

/**
 * Test script to validate unified factor weights between ObservationModule and ObservationModuleCustom
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Testing Factor Weights Unification...\n');

// Read ObservationModule.tsx
const observationModulePath = path.join(__dirname, 'src/components/ObservationModule.tsx');
const observationModuleContent = fs.readFileSync(observationModulePath, 'utf8');

// Read ObservationModuleCustom.tsx  
const observationModuleCustomPath = path.join(__dirname, 'src/components/ObservationModuleCustom.tsx');
const observationModuleCustomContent = fs.readFileSync(observationModuleCustomPath, 'utf8');

// Extract default factor weights from ObservationModule
const moduleWeightsMatch = observationModuleContent.match(/const factorWeights = savedWeights \? JSON\.parse\(savedWeights\) : \{([^}]+)\}/);
const moduleWeights = moduleWeightsMatch ? moduleWeightsMatch[1] : null;

// Extract default factor weights from ObservationModuleCustom
const customWeightsMatch = observationModuleCustomContent.match(/const \[factorWeights, setFactorWeights\] = useState\(\{([^}]+)\}\)/);
const customWeights = customWeightsMatch ? customWeightsMatch[1] : null;

console.log('📊 ObservationModule default weights:');
console.log(moduleWeights ? moduleWeights.trim() : 'Not found');

console.log('\n📊 ObservationModuleCustom default weights:');
console.log(customWeights ? customWeights.trim() : 'Not found');

// Parse and compare
function parseWeights(weightsString) {
  if (!weightsString) return null;
  
  const weights = {};
  const lines = weightsString.split(',');
  
  lines.forEach(line => {
    const match = line.match(/(\w+):\s*(\d+)/);
    if (match) {
      weights[match[1]] = parseInt(match[2]);
    }
  });
  
  return weights;
}

const parsedModuleWeights = parseWeights(moduleWeights);
const parsedCustomWeights = parseWeights(customWeights);

console.log('\n🔍 Comparison:');
if (parsedModuleWeights && parsedCustomWeights) {
  const allKeys = new Set([...Object.keys(parsedModuleWeights), ...Object.keys(parsedCustomWeights)]);
  let isUnified = true;
  
  allKeys.forEach(key => {
    const moduleValue = parsedModuleWeights[key] || 0;
    const customValue = parsedCustomWeights[key] || 0;
    const match = moduleValue === customValue;
    
    if (!match) isUnified = false;
    
    console.log(`  ${key}: ${moduleValue} vs ${customValue} ${match ? '✅' : '❌'}`);
  });
  
  console.log(`\n🎯 Result: ${isUnified ? '✅ UNIFIED' : '❌ NOT UNIFIED'}`);
} else {
  console.log('❌ Could not parse weights for comparison');
}

console.log('\n🔍 Testing metadata.json structure...');

// Test metadata.json structure
try {
  const metadataPath = path.join(__dirname, 'src/data/metadata.json');
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  
  let validKeys = 0;
  let invalidKeys = 0;
  
  Object.keys(metadata).forEach(key => {
    if (typeof key === 'string' && key.length > 0) {
      validKeys++;
    } else {
      invalidKeys++;
      console.log(`❌ Invalid key: ${typeof key} - ${key}`);
    }
  });
  
  console.log(`✅ Valid keys: ${validKeys}`);
  console.log(`❌ Invalid keys: ${invalidKeys}`);
  console.log(`🎯 Metadata structure: ${invalidKeys === 0 ? '✅ VALID' : '❌ INVALID'}`);
  
} catch (error) {
  console.log(`❌ Error reading metadata.json: ${error.message}`);
}

console.log('\n✅ Test complete!');
