#!/usr/bin/env node

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function analyzeChart() {
  try {
    const imagePath = './public/images/assets/SampleCSC.png';
    
    // Check if file exists
    if (!fs.existsSync(imagePath)) {
      console.error('Sample chart image not found at:', imagePath);
      return;
    }
    
    console.log('Loading image:', imagePath);
    const image = sharp(imagePath);
    const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
    
    console.log('=== CLEAR SKY CHART DIMENSION ANALYSIS ===');
    console.log(`Image dimensions: ${info.width}x${info.height}, channels: ${info.channels}`);
    
    // Helper function to get pixel color
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
    
    // Helper to classify color
    function classifyColor(pixel) {
      const { r, g, b } = pixel;
      const total = r + g + b;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = max > 0 ? (max - min) / max : 0;
      
      if (saturation < 0.2 && total > 600) return 'WHITE';
      if (saturation < 0.3 && total < 150) return 'BLACK';
      if (total < 300 && saturation < 0.5) return 'GRAY';
      if (b > r && b > g && saturation > 0.3) return 'BLUE';
      if (r > g && r > b && saturation > 0.3) return 'RED';
      if (g > r && g > b && saturation > 0.3) return 'GREEN';
      if (r > b && g > b && saturation > 0.3) return 'YELLOW';
      return 'OTHER';
    }
    
    // 1. ANALYZE CHART STRUCTURE
    console.log('\n=== CHART STRUCTURE ANALYSIS ===');
    
    // Find chart boundaries by looking for consistent data regions
    let chartTop = 0, chartBottom = info.height, chartLeft = 0, chartRight = info.width;
    
    // Find top boundary (skip header)
    for (let y = 0; y < info.height; y++) {
      let colorfulPixels = 0;
      for (let x = info.width * 0.2; x < info.width * 0.8; x += 10) {
        const pixel = getPixel(Math.floor(x), y);
        const color = classifyColor(pixel);
        if (color === 'BLUE' || color === 'RED' || color === 'GREEN' || color === 'WHITE') {
          colorfulPixels++;
        }
      }
      if (colorfulPixels > 3) {
        chartTop = y;
        break;
      }
    }
    
    // Find bottom boundary 
    for (let y = info.height - 1; y >= 0; y--) {
      let colorfulPixels = 0;
      for (let x = info.width * 0.2; x < info.width * 0.8; x += 10) {
        const pixel = getPixel(Math.floor(x), y);
        const color = classifyColor(pixel);
        if (color === 'BLUE' || color === 'RED' || color === 'GREEN' || color === 'WHITE') {
          colorfulPixels++;
        }
      }
      if (colorfulPixels > 3) {
        chartBottom = y;
        break;
      }
    }
    
    // Find left boundary
    for (let x = 0; x < info.width; x++) {
      let colorfulPixels = 0;
      for (let y = chartTop; y < chartBottom; y += 10) {
        const pixel = getPixel(x, y);
        const color = classifyColor(pixel);
        if (color === 'BLUE' || color === 'RED' || color === 'GREEN' || color === 'WHITE') {
          colorfulPixels++;
        }
      }
      if (colorfulPixels > 3) {
        chartLeft = x;
        break;
      }
    }
    
    // Find right boundary
    for (let x = info.width - 1; x >= 0; x--) {
      let colorfulPixels = 0;
      for (let y = chartTop; y < chartBottom; y += 10) {
        const pixel = getPixel(x, y);
        const color = classifyColor(pixel);
        if (color === 'BLUE' || color === 'RED' || color === 'GREEN' || color === 'WHITE') {
          colorfulPixels++;
        }
      }
      if (colorfulPixels > 3) {
        chartRight = x;
        break;
      }
    }
    
    console.log(`Chart boundaries: Left=${chartLeft}, Right=${chartRight}, Top=${chartTop}, Bottom=${chartBottom}`);
    console.log(`Chart dimensions: ${chartRight - chartLeft}x${chartBottom - chartTop}`);
    
    // 2. DETECT ROW STRUCTURE
    console.log('\n=== ROW DETECTION ===');
    const chartHeight = chartBottom - chartTop;
    const rows = [];
    
    // Sample middle of chart horizontally to find row boundaries
    const sampleX = chartLeft + Math.floor((chartRight - chartLeft) * 0.5);
    
    // Look for horizontal bands of similar colors
    for (let y = chartTop; y < chartBottom; y += Math.floor(chartHeight / 50)) {
      const pixel = getPixel(sampleX, y);
      const color = classifyColor(pixel);
      rows.push({
        y: y,
        relativeY: y - chartTop,
        percentage: Math.round(((y - chartTop) / chartHeight) * 100),
        color: color,
        rgb: pixel
      });
    }
    
    console.log('Row samples (every ~2% of chart height):');
    rows.forEach(row => {
      console.log(`${row.percentage}% (y=${row.y}): ${row.color} RGB(${row.rgb.r},${row.rgb.g},${row.rgb.b})`);
    });
    
    // 3. DETECT COLUMN STRUCTURE  
    console.log('\n=== COLUMN DETECTION ===');
    const chartWidth = chartRight - chartLeft;
    const columns = [];
    
    // Sample middle of chart vertically to find column boundaries
    const sampleY = chartTop + Math.floor(chartHeight * 0.3);
    
    // Look for vertical transitions
    let lastSignificantX = chartLeft;
    const transitions = [];
    
    for (let x = chartLeft; x < chartRight; x++) {
      const pixel = getPixel(x, sampleY);
      if (x > chartLeft) {
        const prevPixel = getPixel(x - 1, sampleY);
        const colorDiff = Math.abs(pixel.r - prevPixel.r) + Math.abs(pixel.g - prevPixel.g) + Math.abs(pixel.b - prevPixel.b);
        
        if (colorDiff > 80 && x - lastSignificantX > 5) {
          transitions.push({
            x: x,
            width: x - lastSignificantX,
            color: classifyColor(pixel)
          });
          lastSignificantX = x;
        }
      }
    }
    
    console.log('Column transitions (potential square boundaries):');
    transitions.slice(0, 15).forEach((t, i) => {
      console.log(`Transition ${i}: x=${t.x}, width=${t.width}, color=${t.color}`);
    });
    
    // Estimate square width
    const widths = transitions.map(t => t.width).filter(w => w > 10 && w < 100);
    if (widths.length > 0) {
      const avgWidth = widths.reduce((sum, w) => sum + w, 0) / widths.length;
      console.log(`Average square width: ${Math.round(avgWidth)} pixels`);
      console.log(`Width variations: ${widths.slice(0, 10).join(', ')}`);
    }
    
    // 4. PARAMETER ROW IDENTIFICATION
    console.log('\n=== PARAMETER ROW IDENTIFICATION ===');
    
    // Based on typical Clear Sky Chart layout, estimate row positions
    const estimatedRows = [
      { name: 'Cloud Cover', percentage: 15, description: 'Expected: Blue/White squares' },
      { name: 'ECMWF Cloud', percentage: 25, description: 'Expected: Blue squares' },
      { name: 'Transparency', percentage: 35, description: 'Expected: Blue/White squares' },
      { name: 'Seeing', percentage: 45, description: 'Expected: Blue/White squares' },
      { name: 'Darkness', percentage: 55, description: 'Expected: Blue squares (day/night)' },
      { name: 'Smoke', percentage: 65, description: 'Expected: Blue squares' },
      { name: 'Wind', percentage: 75, description: 'Expected: Blue squares' },
      { name: 'Humidity', percentage: 85, description: 'Expected: Blue to Red gradient' },
      { name: 'Temperature', percentage: 95, description: 'Expected: Full color spectrum' }
    ];
    
    estimatedRows.forEach(row => {
      const y = chartTop + Math.floor(chartHeight * (row.percentage / 100));
      const pixel = getPixel(sampleX, y);
      const color = classifyColor(pixel);
      console.log(`${row.name} (${row.percentage}%, y=${y}): ${color} RGB(${pixel.r},${pixel.g},${pixel.b}) - ${row.description}`);
    });
    
    // 5. GENERATE COORDINATE MAPPING
    console.log('\n=== COORDINATE MAPPING RESULTS ===');
    
    const coordinateMapping = {
      chartBoundaries: {
        left: chartLeft,
        right: chartRight,
        top: chartTop,
        bottom: chartBottom,
        width: chartWidth,
        height: chartHeight
      },
      estimatedSquareWidth: widths.length > 0 ? Math.round(widths.reduce((sum, w) => sum + w, 0) / widths.length) : 20,
      parameterRows: {}
    };
    
    estimatedRows.forEach(row => {
      const y = chartTop + Math.floor(chartHeight * (row.percentage / 100));
      coordinateMapping.parameterRows[row.name.toLowerCase().replace(' ', '_')] = {
        centerY: y,
        startY: y - 10,
        endY: y + 10,
        percentage: row.percentage
      };
    });
    
    console.log('Final coordinate mapping:');
    console.log(JSON.stringify(coordinateMapping, null, 2));
    
    // Save results to file
    fs.writeFileSync('./chart-analysis-results.json', JSON.stringify(coordinateMapping, null, 2));
    console.log('\nResults saved to chart-analysis-results.json');
    
  } catch (error) {
    console.error('Chart analysis failed:', error);
  }
}

analyzeChart();
