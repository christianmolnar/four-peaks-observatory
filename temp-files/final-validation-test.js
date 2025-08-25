// Final validation test
const exifr = require('exifr');
const fs = require('fs');

function validateDate(date, source) {
    if (!date) return null;
    
    const dateObj = new Date(date);
    const currentYear = new Date().getFullYear();
    const dateYear = dateObj.getFullYear();
    
    // Reject dates before 1995 or more than 1 year in future
    if (dateYear < 1995 || dateYear > currentYear + 1) {
        console.log(`❌ Rejected ${source} date: ${date} (year ${dateYear})`);
        return null;
    }
    
    console.log(`✅ Accepted ${source} date: ${date} (year ${dateYear})`);
    return date;
}

// Test with various dates
console.log('\n🧪 Testing date validation:');
validateDate('1984-01-15', 'bad file timestamp');
validateDate('2021-07-15', 'good EXIF');
validateDate('2017-08-21', 'eclipse EXIF');
validateDate('2026-01-01', 'future date');
validateDate('2005-02-07', 'early astro');
validateDate(null, 'no date');

console.log('\n✅ All validation tests completed!');
