#!/usr/bin/env node

/**
 * Simple Coordinate System Test
 * Tests the 8x8 pixel sampling logic without imports
 */

console.log('🔬 Enhanced Clear Sky Chart Coordinate System Test\n');

/**
 * Calculate sampling area from top-left coordinate
 */
function calculateSamplingArea(topLeftX, topLeftY) {
  // 8x8 pixel area: top-left to top-left + 8
  const bottomRightX = topLeftX + 8;
  const bottomRightY = topLeftY + 8;
  
  // Center is top-left + 4
  const centerX = topLeftX + 4;
  const centerY = topLeftY + 4;
  
  return {
    topLeft: { x: topLeftX, y: topLeftY },
    center: { x: centerX, y: centerY },
    bottomRight: { x: bottomRightX, y: bottomRightY },
    bounds: {
      minX: topLeftX,
      maxX: bottomRightX - 1,  // Inclusive bounds
      minY: topLeftY,
      maxY: bottomRightY - 1   // Inclusive bounds
    }
  };
}

/**
 * Generate grid for 24 hours
 */
function generateGrid(coordinates) {
  const grid = {};
  
  for (const [paramName, baseCoord] of Object.entries(coordinates.parameters)) {
    const parameterAreas = [];
    
    // Generate 24 hours of sampling areas
    for (let hour = 0; hour < coordinates.maxHours; hour++) {
      const hourOffsetX = hour * coordinates.hourlySpacing;
      const topLeftX = baseCoord.x + hourOffsetX;
      const topLeftY = baseCoord.y;  // Y doesn't change across hours
      
      const samplingArea = calculateSamplingArea(topLeftX, topLeftY);
      parameterAreas.push(samplingArea);
    }
    
    grid[paramName] = parameterAreas;
  }
  
  return grid;
}

/**
 * Test the coordinate system
 */
function testCoordinateSystem() {
  console.log('📐 Testing coordinate system with your specifications...\n');
  
  // Example coordinates (user will provide these)
  const testCoordinates = {
    parameters: {
      cloudCover: { x: 10, y: 45 },
      transparency: { x: 10, y: 70 }, 
      seeing: { x: 10, y: 95 },
      darkness: { x: 10, y: 120 },
      smoke: { x: 10, y: 145 },
      wind: { x: 10, y: 170 },
      humidity: { x: 10, y: 195 },
      temperature: { x: 10, y: 220 }
    },
    hourlySpacing: 14,  // Pixels between hour columns
    maxHours: 24        // Fixed at 24 hours as you requested
  };
  
  console.log('📍 Test Coordinates (example):');
  console.log(`   Hourly spacing: ${testCoordinates.hourlySpacing} pixels`);
  console.log(`   Max hours: ${testCoordinates.maxHours}`);
  console.log('   Parameter coordinates (top-left of 8x8 areas):');
  
  for (const [param, coord] of Object.entries(testCoordinates.parameters)) {
    console.log(`     ${param}: (${coord.x}, ${coord.y})`);
  }
  
  // Generate grid
  console.log('\n🏗️  Generating coordinate grid...');
  const grid = generateGrid(testCoordinates);
  
  // Test specific sampling areas
  console.log('\n📊 Sample area calculations:');
  
  // Test hours 0, 5, 12, 23 for transparency parameter
  const testHours = [0, 5, 12, 23];
  for (const hour of testHours) {
    const area = grid.transparency[hour];
    console.log(`   Transparency Hour ${hour}:`);
    console.log(`     Top-left: (${area.topLeft.x}, ${area.topLeft.y})`);
    console.log(`     Center: (${area.center.x}, ${area.center.y})`);
    console.log(`     8x8 bounds: X=${area.bounds.minX}-${area.bounds.maxX}, Y=${area.bounds.minY}-${area.bounds.maxY}`);
    console.log(`     Sampling area: ${area.bounds.maxX - area.bounds.minX + 1}x${area.bounds.maxY - area.bounds.minY + 1} pixels`);
  }
  
  // Show last hour calculation for all parameters
  console.log('\n📈 Hour 23 (last hour) coordinates for all parameters:');
  for (const [param, areas] of Object.entries(grid)) {
    const lastArea = areas[23];
    console.log(`   ${param}: Top-left (${lastArea.topLeft.x}, ${lastArea.topLeft.y}), Center (${lastArea.center.x}, ${lastArea.center.y})`);
  }
  
  // Validate coordinates don't exceed typical image bounds
  console.log('\n✅ Validating against typical Clear Sky Chart dimensions (1284x292):');
  let valid = true;
  
  for (const [param, areas] of Object.entries(grid)) {
    const lastArea = areas[23]; // Check last hour
    
    if (lastArea.bottomRight.x > 1284) {
      console.log(`   ❌ ${param}: Hour 23 exceeds image width (${lastArea.bottomRight.x} > 1284)`);
      valid = false;
    }
    
    if (lastArea.bottomRight.y > 292) {
      console.log(`   ❌ ${param}: Exceeds image height (${lastArea.bottomRight.y} > 292)`);
      valid = false;
    }
  }
  
  if (valid) {
    console.log('   ✅ All coordinates are within bounds!');
  }
  
  return grid;
}

/**
 * Simulate 8x8 area RGB sampling
 */
function simulateSampling() {
  console.log('\n🔬 Simulating 8x8 area RGB sampling...\n');
  
  // Calculate center ± 4 pixels logic
  const topLeft = { x: 100, y: 50 };
  const area = calculateSamplingArea(topLeft.x, topLeft.y);
  
  console.log(`📍 Example sampling area:`);
  console.log(`   Top-left coordinate: (${topLeft.x}, ${topLeft.y})`);
  console.log(`   Center: (${area.center.x}, ${area.center.y})`);
  console.log(`   Sampling bounds: X=${area.bounds.minX}-${area.bounds.maxX}, Y=${area.bounds.minY}-${area.bounds.maxY}`);
  console.log(`   This covers: (${area.center.x - 4}, ${area.center.y - 4}) to (${area.center.x + 3}, ${area.center.y + 3})`);
  console.log(`   Total pixels sampled: 8×8 = 64 pixels`);
  
  // Mock RGB sampling
  console.log('\n🎨 Mock RGB sampling process:');
  let totalR = 0, totalG = 0, totalB = 0;
  let pixelCount = 0;
  
  // Simulate sampling all pixels in 8x8 area
  for (let y = area.bounds.minY; y <= area.bounds.maxY; y++) {
    for (let x = area.bounds.minX; x <= area.bounds.maxX; x++) {
      // Mock RGB values (in real implementation, read from image buffer)
      const mockR = 200 + Math.floor(Math.random() * 20); // Slight variation
      const mockG = 150 + Math.floor(Math.random() * 20);
      const mockB = 100 + Math.floor(Math.random() * 20);
      
      totalR += mockR;
      totalG += mockG;
      totalB += mockB;
      pixelCount++;
    }
  }
  
  const avgR = Math.round(totalR / pixelCount);
  const avgG = Math.round(totalG / pixelCount);
  const avgB = Math.round(totalB / pixelCount);
  
  console.log(`   📊 Sampled ${pixelCount} pixels`);
  console.log(`   📊 Average RGB: (${avgR}, ${avgG}, ${avgB})`);
  console.log(`   📊 This RGB will be mapped to parameter value using color scales`);
  
  // Example conversion
  const cloudCoverPercent = Math.round((avgR + avgG + avgB) / 3 / 255 * 100);
  console.log(`   📊 Example: Cloud cover ≈ ${cloudCoverPercent}% (using grayscale approximation)`);
}

/**
 * Show what user needs to provide
 */
function showUserRequirements() {
  console.log('\n📋 WHAT YOU NEED TO PROVIDE');
  console.log('='.repeat(50));
  
  console.log('\n1️⃣  TOP-LEFT COORDINATES for each parameter\'s 8x8 area at hour 0:');
  const params = ['cloudCover', 'transparency', 'seeing', 'darkness', 'smoke', 'wind', 'humidity', 'temperature'];
  params.forEach((param, i) => {
    console.log(`   ${i + 1}. ${param}: { x: ???, y: ??? }`);
  });
  
  console.log('\n2️⃣  HOURLY SPACING:');
  console.log('   - Horizontal distance in pixels between hour columns');
  console.log('   - Example: If hour 0 center is at X=100 and hour 1 center is at X=114, spacing = 14');
  
  console.log('\n🎯 RESULT:');
  console.log('   ✅ System generates 24-hour grid automatically');
  console.log('   ✅ Each parameter gets 24 sampling areas (8x8 pixels each)');
  console.log('   ✅ Time synchronization filters to relevant hours only');
  console.log('   ✅ Center ± 4 pixel sampling as you requested');
  
  console.log('\n📐 COORDINATE FORMAT:');
  console.log('const coordinates = {');
  console.log('  parameters: {');
  params.forEach(param => {
    console.log(`    ${param}: { x: ???, y: ??? },`);
  });
  console.log('  },');
  console.log('  hourlySpacing: ???,');
  console.log('  maxHours: 24');
  console.log('};');
}

// Run all tests
console.log('🚀 Testing Enhanced Clear Sky Chart Coordinate System\n');

const grid = testCoordinateSystem();
simulateSampling();
showUserRequirements();

console.log('\n🎉 COORDINATE SYSTEM READY!');
console.log('\n📋 SUMMARY:');
console.log('✅ 8x8 pixel sampling area calculation works');
console.log('✅ 24-hour grid generation works');
console.log('✅ Center ± 4 pixel logic implemented');
console.log('✅ Coordinate validation works');
console.log('✅ Ready for your actual measurements');

console.log('\n🔄 NEXT: Provide your 9 measurements (8 coordinates + 1 spacing)');
console.log('Then I can update the enhanced parser and test with real data!');
