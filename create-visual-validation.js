#!/usr/bin/env node

const sharp = require('sharp');
const fs = require('fs');

async function createVisualValidation() {
  try {
    const imagePath = './public/images/assets/SampleCSC.png';
    
    if (!fs.existsSync(imagePath)) {
      console.error('Sample chart image not found at:', imagePath);
      return;
    }
    
    console.log('Creating visual validation overlay...');
    
    // Load original image
    const originalImage = sharp(imagePath);
    const { data, info } = await originalImage.raw().toBuffer({ resolveWithObject: true });
    
    console.log(`Original image: ${info.width}x${info.height}`);
    
    // Create a copy for overlay
    let overlayImage = sharp(imagePath);
    
    // Current coordinate estimates that need validation
    const coordinatesToTest = {
      cloudCover: { centerY: 71, startY: 61, endY: 81, color: 'red' },
      ecmwfCloud: { centerY: 97, startY: 87, endY: 107, color: 'green' },
      transparency: { centerY: 123, startY: 113, endY: 133, color: 'blue' },
      seeing: { centerY: 149, startY: 139, endY: 159, color: 'yellow' },
      darkness: { centerY: 174, startY: 164, endY: 184, color: 'cyan' },
      smoke: { centerY: 200, startY: 190, endY: 210, color: 'magenta' },
      wind: { centerY: 226, startY: 216, endY: 236, color: 'orange' },
      humidity: { centerY: 252, startY: 242, endY: 262, color: 'lime' },
      temperature: { centerY: 278, startY: 268, endY: 288, color: 'pink' }
    };
    
    // Column sampling positions
    const testColumns = [
      { x: 146, label: 'First Data' },
      { x: 200, label: 'Col 4' },
      { x: 300, label: 'Col 11' },
      { x: 500, label: 'Col 25' },
      { x: 700, label: 'Col 39' }
    ];
    
    // Create SVG overlay
    let svgOverlay = `
      <svg width="${info.width}" height="${info.height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <style>
            .row-line { stroke-width: 2; fill: none; stroke-opacity: 0.8; }
            .col-line { stroke-width: 1; fill: none; stroke-opacity: 0.6; stroke: white; }
            .sample-point { r: 3; fill-opacity: 0.9; stroke: white; stroke-width: 1; }
            .label { font-family: Arial; font-size: 12px; fill: white; font-weight: bold; }
            .small-label { font-family: Arial; font-size: 10px; fill: white; }
          </style>
        </defs>
        
        <!-- Chart boundaries -->
        <rect x="0" y="33" width="${info.width}" height="${info.height - 33}" 
              fill="none" stroke="white" stroke-width="2" stroke-dasharray="5,5" stroke-opacity="0.7"/>
        
        <!-- Row indicators -->`;
    
    Object.entries(coordinatesToTest).forEach(([param, coords]) => {
      svgOverlay += `
        <!-- ${param} row -->
        <line x1="0" y1="${coords.centerY}" x2="${info.width}" y2="${coords.centerY}" 
              class="row-line" stroke="${coords.color}"/>
        <text x="5" y="${coords.centerY - 5}" class="label" fill="${coords.color}">
          ${param} (y=${coords.centerY})
        </text>
        
        <!-- Sample points for this row -->`;
      
      testColumns.forEach(col => {
        svgOverlay += `
        <circle cx="${col.x}" cy="${coords.centerY}" class="sample-point" fill="${coords.color}"/>`;
      });
    });
    
    // Column indicators
    testColumns.forEach(col => {
      svgOverlay += `
        <line x1="${col.x}" y1="33" x2="${col.x}" y2="${info.height}" class="col-line"/>
        <text x="${col.x + 2}" y="50" class="small-label">${col.label} (x=${col.x})</text>`;
    });
    
    svgOverlay += `
      </svg>`;
    
    // Composite the overlay onto the image
    const svgBuffer = Buffer.from(svgOverlay);
    const compositeImage = await overlayImage
      .composite([{ input: svgBuffer, top: 0, left: 0 }])
      .png()
      .toBuffer();
    
    // Save the validation image
    fs.writeFileSync('./chart-validation-overlay.png', compositeImage);
    console.log('✅ Validation overlay saved as: chart-validation-overlay.png');
    
    // Sample actual RGB values at our coordinate guesses
    function getPixel(x, y) {
      if (x < 0 || x >= info.width || y < 0 || y >= info.height) {
        return { r: 0, g: 0, b: 0 };
      }
      const index = (y * info.width + x) * info.channels;
      return {
        r: data[index] || 0,
        g: data[index + 1] || 0,
        b: data[index + 2] || 0
      };
    }
    
    // Generate detailed sampling report
    console.log('\n=== PRECISE COORDINATE VALIDATION ===');
    console.log('Please check chart-validation-overlay.png to see where we\'re sampling.');
    console.log('\nCurrent RGB samples at our estimated coordinates:');
    
    Object.entries(coordinatesToTest).forEach(([param, coords]) => {
      console.log(`\n${param.toUpperCase()} ROW (y=${coords.centerY}):`);
      testColumns.forEach(col => {
        const pixel = getPixel(col.x, coords.centerY);
        console.log(`  ${col.label} (x=${col.x}): RGB(${pixel.r},${pixel.g},${pixel.b})`);
      });
    });
    
    // Generate a coordinate template for manual correction
    const templateData = {
      instructions: "Please correct these coordinates based on the validation overlay image",
      imageSize: { width: info.width, height: info.height },
      parametersToCorrect: {}
    };
    
    Object.entries(coordinatesToTest).forEach(([param, coords]) => {
      templateData.parametersToCorrect[param] = {
        currentEstimate: coords.centerY,
        correctedValue: "PLEASE_UPDATE", // User will fill this in
        notes: ""
      };
    });
    
    templateData.columnGrid = {
      firstDataColumn: 146,
      columnWidth: 14,
      correctedFirstColumn: "PLEASE_UPDATE",
      correctedColumnWidth: "PLEASE_UPDATE"
    };
    
    fs.writeFileSync('./coordinate-correction-template.json', JSON.stringify(templateData, null, 2));
    console.log('\n✅ Template saved as: coordinate-correction-template.json');
    console.log('\n🔍 NEXT STEPS:');
    console.log('1. Open chart-validation-overlay.png');
    console.log('2. Check if the colored lines are hitting the CENTER of each parameter row');
    console.log('3. Check if the white vertical lines are hitting column boundaries correctly');
    console.log('4. Update coordinate-correction-template.json with correct values');
    console.log('5. Or use https://imageonline.io/find-coordinates-of-image/ for precise measurements');
    
  } catch (error) {
    console.error('Validation creation failed:', error);
  }
}

createVisualValidation();
