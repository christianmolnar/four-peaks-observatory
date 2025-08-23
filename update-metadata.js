#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const exifr = require('exifr');

// Paths
const METADATA_FILE = '/Users/christian/Repos/MapleValleyObservatory/src/data/metadata.json';
const IMAGES_BASE = '/Users/christian/Repos/MapleValleyObservatory/public/images';

// Image folders to scan (matches the global config structure)
const SCAN_FOLDERS = [
  'astrophotography/featured',
  'astrophotography/deep-sky/galaxies',
  'astrophotography/deep-sky/nebulas',
  'astrophotography/deep-sky/star-clusters',
  'astrophotography/deep-sky/wide-field',
  'astrophotography/deep-sky/Hubble-Palette',
  'astrophotography/solar-system/solar',
  'astrophotography/solar-system/lunar',
  'astrophotography/solar-system/planets',
  'astrophotography/solar-system/events',
  'astrophotography/solar-system/events/total-eclipse-2017',
  'terrestrial/yellowstone',
  'terrestrial/grand-tetons',
  'equipment'
];

// Supported image and video extensions
const MEDIA_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.avif', '.webp', '.mp4', '.mov', '.avi', '.webm'];

function findImages() {
  const allImages = [];
  
  SCAN_FOLDERS.forEach(folder => {
    const fullPath = path.join(IMAGES_BASE, folder);
    
    if (fs.existsSync(fullPath)) {
      const files = fs.readdirSync(fullPath);
      
      files.forEach(file => {
        const ext = path.extname(file).toLowerCase();
        if (MEDIA_EXTENSIONS.includes(ext)) {
          allImages.push({
            filename: file,
            folder: folder,
            fullPath: path.join(fullPath, file)
          });
        }
      });
    }
  });
  
  return allImages;
}

function loadExistingMetadata() {
  try {
    const content = fs.readFileSync(METADATA_FILE, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.log('Could not load existing metadata, starting fresh');
    return {};
  }
}

// Comprehensive Astronomical Object Catalog Database
// Includes major catalogs: Messier, NGC, IC, Caldwell, Sharpless, Barnard, Abell, vdB
const ASTRONOMICAL_OBJECTS = {
  // ===== MESSIER CATALOG (M) - Most Popular Objects =====
  'M1': { catalog: 'M1', name: 'Crab Nebula', type: 'nebula' },
  'M2': { catalog: 'M2', name: 'Globular Cluster M2', type: 'star cluster' },
  'M3': { catalog: 'M3', name: 'Globular Cluster M3', type: 'star cluster' },
  'M4': { catalog: 'M4', name: 'Globular Cluster M4', type: 'star cluster' },
  'M5': { catalog: 'M5', name: 'Globular Cluster M5', type: 'star cluster' },
  'M6': { catalog: 'M6', name: 'Butterfly Cluster', type: 'star cluster' },
  'M7': { catalog: 'M7', name: 'Ptolemy Cluster', type: 'star cluster' },
  'M8': { catalog: 'M8', name: 'Lagoon Nebula', type: 'nebula' },
  'M11': { catalog: 'M11', name: 'Wild Duck Cluster', type: 'star cluster' },
  'M13': { catalog: 'M13', name: 'Great Globular Cluster in Hercules', type: 'star cluster' },
  'M15': { catalog: 'M15', name: 'Globular Cluster M15', type: 'star cluster' },
  'M16': { catalog: 'M16', name: 'Eagle Nebula', type: 'nebula' },
  'M17': { catalog: 'M17', name: 'Omega Nebula', type: 'nebula' },
  'M20': { catalog: 'M20', name: 'Trifid Nebula', type: 'nebula' },
  'M22': { catalog: 'M22', name: 'Sagittarius Cluster', type: 'star cluster' },
  'M27': { catalog: 'M27', name: 'Dumbbell Nebula', type: 'nebula' },
  'M31': { catalog: 'M31', name: 'Andromeda Galaxy', type: 'galaxy' },
  'M32': { catalog: 'M32', name: 'Elliptical Galaxy M32', type: 'galaxy' },
  'M33': { catalog: 'M33', name: 'Triangulum Galaxy', type: 'galaxy' },
  'M35': { catalog: 'M35', name: 'Open Cluster M35', type: 'star cluster' },
  'M36': { catalog: 'M36', name: 'Pinwheel Cluster', type: 'star cluster' },
  'M37': { catalog: 'M37', name: 'Open Cluster M37', type: 'star cluster' },
  'M38': { catalog: 'M38', name: 'Starfish Cluster', type: 'star cluster' },
  'M42': { catalog: 'M42', name: 'Orion Nebula', type: 'nebula' },
  'M43': { catalog: 'M43', name: 'De Mairan\'s Nebula', type: 'nebula' },
  'M44': { catalog: 'M44', name: 'Beehive Cluster', type: 'star cluster' },
  'M45': { catalog: 'M45', name: 'Pleiades', type: 'star cluster' },
  'M46': { catalog: 'M46', name: 'Open Cluster M46', type: 'star cluster' },
  'M47': { catalog: 'M47', name: 'Open Cluster M47', type: 'star cluster' },
  'M50': { catalog: 'M50', name: 'Open Cluster M50', type: 'star cluster' },
  'M51': { catalog: 'M51', name: 'Whirlpool Galaxy', type: 'galaxy' },
  'M52': { catalog: 'M52', name: 'Open Cluster M52', type: 'star cluster' },
  'M57': { catalog: 'M57', name: 'Ring Nebula', type: 'nebula' },
  'M63': { catalog: 'M63', name: 'Sunflower Galaxy', type: 'galaxy' },
  'M64': { catalog: 'M64', name: 'Black Eye Galaxy', type: 'galaxy' },
  'M65': { catalog: 'M65', name: 'Leo Triplet Galaxy', type: 'galaxy' },
  'M66': { catalog: 'M66', name: 'Leo Triplet Galaxy', type: 'galaxy' },
  'M67': { catalog: 'M67', name: 'King Cobra Cluster', type: 'star cluster' },
  'M78': { catalog: 'M78', name: 'Reflection Nebula M78', type: 'nebula' },
  'M81': { catalog: 'M81', name: 'Bode\'s Galaxy', type: 'galaxy' },
  'M82': { catalog: 'M82', name: 'Cigar Galaxy', type: 'galaxy' },
  'M92': { catalog: 'M92', name: 'Globular Cluster M92', type: 'star cluster' },
  'M94': { catalog: 'M94', name: 'Cat\'s Eye Galaxy', type: 'galaxy' },
  'M95': { catalog: 'M95', name: 'Barred Spiral Galaxy M95', type: 'galaxy' },
  'M96': { catalog: 'M96', name: 'Elliptical Galaxy M96', type: 'galaxy' },
  'M97': { catalog: 'M97', name: 'Owl Nebula', type: 'nebula' },
  'M101': { catalog: 'M101', name: 'Pinwheel Galaxy', type: 'galaxy' },
  'M103': { catalog: 'M103', name: 'Open Cluster M103', type: 'star cluster' },
  'M104': { catalog: 'M104', name: 'Sombrero Galaxy', type: 'galaxy' },
  'M106': { catalog: 'M106', name: 'Spiral Galaxy M106', type: 'galaxy' },
  'M108': { catalog: 'M108', name: 'Surfboard Galaxy', type: 'galaxy' },
  'M109': { catalog: 'M109', name: 'Barred Spiral Galaxy M109', type: 'galaxy' },
  'M110': { catalog: 'M110', name: 'Elliptical Galaxy M110', type: 'galaxy' },

  // ===== NGC CATALOG - Popular Objects =====
  'NGC224': { catalog: 'NGC224', name: 'Andromeda Galaxy', type: 'galaxy' },
  'NGC253': { catalog: 'NGC253', name: 'Sculptor Galaxy', type: 'galaxy' },
  'NGC281': { catalog: 'NGC281', name: 'Pacman Nebula', type: 'nebula' },
  'NGC598': { catalog: 'NGC598', name: 'Triangulum Galaxy', type: 'galaxy' },
  'NGC869': { catalog: 'NGC869', name: 'Double Cluster', type: 'star cluster' },
  'NGC884': { catalog: 'NGC884', name: 'Double Cluster', type: 'star cluster' },
  'NGC891': { catalog: 'NGC891', name: 'Silver Sliver Galaxy', type: 'galaxy' },
  'NGC1316': { catalog: 'NGC1316', name: 'Fornax A Galaxy', type: 'galaxy' },
  'NGC1499': { catalog: 'NGC1499', name: 'California Nebula', type: 'nebula' },
  'NGC1952': { catalog: 'NGC1952', name: 'Crab Nebula', type: 'nebula' },
  'NGC1976': { catalog: 'NGC1976', name: 'Orion Nebula', type: 'nebula' },
  'NGC1977': { catalog: 'NGC1977', name: 'Running Man Nebula', type: 'nebula' },
  'NGC2024': { catalog: 'NGC2024', name: 'Flame Nebula', type: 'nebula' },
  'NGC2070': { catalog: 'NGC2070', name: 'Tarantula Nebula', type: 'nebula' },
  'NGC2175': { catalog: 'NGC2175', name: 'Monkey Head Nebula', type: 'nebula' },
  'NGC2237': { catalog: 'NGC2237', name: 'Rosette Nebula', type: 'nebula' },
  'NGC2175': { catalog: 'NGC2175', name: 'Monkey Head Nebula', type: 'nebula' },
  'NGC2237': { catalog: 'NGC2237', name: 'Rosette Nebula', type: 'nebula' },
  'NGC2244': { catalog: 'NGC2244', name: 'Rosette Nebula Open Cluster', type: 'star cluster' },
  'NGC2264': { catalog: 'NGC2264', name: 'Cone Nebula', type: 'nebula' },
  'NGC2359': { catalog: 'NGC2359', name: 'Thor\'s Helmet', type: 'nebula' },
  'NGC3372': { catalog: 'NGC3372', name: 'Carina Nebula', type: 'nebula' },
  'NGC4565': { catalog: 'NGC4565', name: 'Needle Galaxy', type: 'galaxy' },
  'NGC5128': { catalog: 'NGC5128', name: 'Centaurus A', type: 'galaxy' },
  'NGC5194': { catalog: 'NGC5194', name: 'Whirlpool Galaxy', type: 'galaxy' },
  'NGC6302': { catalog: 'NGC6302', name: 'Bug Nebula', type: 'nebula' },
  'NGC6334': { catalog: 'NGC6334', name: 'Cat\'s Paw Nebula', type: 'nebula' },
  'NGC6543': { catalog: 'NGC6543', name: 'Cat\'s Eye Nebula', type: 'nebula' },
  'NGC6720': { catalog: 'NGC6720', name: 'Ring Nebula', type: 'nebula' },
  'NGC6888': { catalog: 'NGC6888', name: 'Crescent Nebula', type: 'nebula' },
  'NGC6939': { catalog: 'NGC6939', name: 'NGC6939 Cluster', type: 'star cluster' },
  'NGC6960': { catalog: 'NGC6960', name: 'Western Veil Nebula', type: 'nebula' },
  'NGC6992': { catalog: 'NGC6992', name: 'Eastern Veil Nebula', type: 'nebula' },
  'NGC7000': { catalog: 'NGC7000', name: 'North America Nebula', type: 'nebula' },
  'NGC7293': { catalog: 'NGC7293', name: 'Helix Nebula', type: 'nebula' },
  'NGC7380': { catalog: 'NGC7380', name: 'Wizard Nebula', type: 'nebula' },
  'NGC7635': { catalog: 'NGC7635', name: 'Bubble Nebula', type: 'nebula' },
  'NGC7822': { catalog: 'NGC7822', name: 'NGC7822 Nebula', type: 'nebula' },

  // ===== IC CATALOG - Popular Objects =====
  'IC63': { catalog: 'IC63', name: 'Ghost of Cassiopeia', type: 'nebula' },
  'IC410': { catalog: 'IC410', name: 'Tadpoles Nebula', type: 'nebula' },
  'IC417': { catalog: 'IC417', name: 'Spider Nebula', type: 'nebula' },
  'IC434': { catalog: 'IC434', name: 'Horsehead Nebula', type: 'nebula' },
  'IC443': { catalog: 'IC443', name: 'Jellyfish Nebula', type: 'nebula' },
  'IC1284': { catalog: 'IC1284', name: 'IC1284 Nebula', type: 'nebula' },
  'IC1295': { catalog: 'IC1295', name: 'IC1295 Nebula', type: 'nebula' },
  'IC1318': { catalog: 'IC1318', name: 'Butterfly Nebula', type: 'nebula' },
  'IC1396': { catalog: 'IC1396', name: 'Elephant\'s Trunk Nebula', type: 'nebula' },
  'IC1805': { catalog: 'IC1805', name: 'Heart Nebula', type: 'nebula' },
  'IC1848': { catalog: 'IC1848', name: 'Soul Nebula', type: 'nebula' },
  'IC2118': { catalog: 'IC2118', name: 'Witch Head Nebula', type: 'nebula' },
  'IC2177': { catalog: 'IC2177', name: 'Seagull Nebula', type: 'nebula' },
  'IC4628': { catalog: 'IC4628', name: 'Prawn Nebula', type: 'nebula' },
  'IC5070': { catalog: 'IC5070', name: 'Pelican Nebula', type: 'nebula' },
  'IC5146': { catalog: 'IC5146', name: 'Cocoon Nebula', type: 'nebula' },

  // ===== CALDWELL CATALOG - Popular Objects =====
  'C1': { catalog: 'C1', name: 'NGC188', type: 'star cluster' },
  'C2': { catalog: 'C2', name: 'NGC40', type: 'nebula' },
  'C4': { catalog: 'C4', name: 'Iris Nebula', type: 'nebula' },
  'C14': { catalog: 'C14', name: 'Double Cluster', type: 'star cluster' },
  'C20': { catalog: 'C20', name: 'North America Nebula', type: 'nebula' },
  'C27': { catalog: 'C27', name: 'Crescent Nebula', type: 'nebula' },
  'C33': { catalog: 'C33', name: 'Eastern Veil Nebula', type: 'nebula' },
  'C34': { catalog: 'C34', name: 'Western Veil Nebula', type: 'nebula' },
  'C49': { catalog: 'C49', name: 'Rosette Nebula', type: 'nebula' },
  'C50': { catalog: 'C50', name: 'Cone Nebula', type: 'nebula' },

  // ===== SHARPLESS CATALOG - Popular Emission Nebulae =====
  'SH2-101': { catalog: 'Sh2-101', name: 'Tulip Nebula', type: 'nebula' },
  'SH2-115': { catalog: 'Sh2-115', name: 'Abell 71', type: 'nebula' },
  'SH2-129': { catalog: 'Sh2-129', name: 'Flying Bat Nebula', type: 'nebula' },
  'SH2-132': { catalog: 'Sh2-132', name: 'Lion Nebula', type: 'nebula' },
  'SH2-140': { catalog: 'Sh2-140', name: 'Wizard Nebula', type: 'nebula' },
  'SH2-155': { catalog: 'Sh2-155', name: 'Cave Nebula', type: 'nebula' },
  'SH2-185': { catalog: 'Sh2-185', name: 'Sh2-185 Nebula', type: 'nebula' },
  'SH2-212': { catalog: 'Sh2-212', name: 'Sh2-212 Nebula', type: 'nebula' },
  'SH2-216': { catalog: 'Sh2-216', name: 'Lower\'s Nebula', type: 'nebula' },
  'SH2-240': { catalog: 'Sh2-240', name: 'Simeis 147', type: 'nebula' },
  'SH2-254': { catalog: 'Sh2-254', name: 'Sh2-254 Nebula', type: 'nebula' },
  'SH2-308': { catalog: 'Sh2-308', name: 'Dolphin Head Nebula', type: 'nebula' },

  // ===== BARNARD CATALOG - Dark Nebulae =====
  'B33': { catalog: 'B33', name: 'Horsehead Nebula', type: 'dark nebula' },
  'B72': { catalog: 'B72', name: 'Snake Nebula', type: 'dark nebula' },
  'B86': { catalog: 'B86', name: 'Ink Spot Nebula', type: 'dark nebula' },
  'B142': { catalog: 'B142', name: 'E Nebula', type: 'dark nebula' },
  'B143': { catalog: 'B143', name: 'E Nebula', type: 'dark nebula' },
  'B150': { catalog: 'B150', name: 'Seahorse Nebula', type: 'dark nebula' },

  // ===== ABELL CATALOG - Planetary Nebulae =====
  'A21': { catalog: 'Abell 21', name: 'Medusa Nebula', type: 'nebula' },
  'A39': { catalog: 'Abell 39', name: 'Abell 39', type: 'nebula' },
  'A426': { catalog: 'Abell 426', name: 'Perseus Cluster', type: 'galaxy cluster' },

  // ===== VAN DEN BERGH CATALOG - Reflection Nebulae =====
  'VDB14': { catalog: 'vdB 14', name: 'vdB 14', type: 'nebula' },
  'VDB15': { catalog: 'vdB 15', name: 'vdB 15', type: 'nebula' },
  'VDB149': { catalog: 'vdB 149', name: 'Reflection Nebula vdB 149', type: 'nebula' },
  'VDB152': { catalog: 'vdB 152', name: 'Reflection Nebula vdB 152', type: 'nebula' },

  // ===== COMMON NAME MAPPINGS =====
  'ANDROMEDA': { catalog: 'M31', name: 'Andromeda Galaxy', type: 'galaxy' },
  'ORION': { catalog: 'M42', name: 'Orion Nebula', type: 'nebula' },
  'PLEIADES': { catalog: 'M45', name: 'Pleiades', type: 'star cluster' },
  'WHIRLPOOL': { catalog: 'M51', name: 'Whirlpool Galaxy', type: 'galaxy' },
  'CRAB': { catalog: 'M1', name: 'Crab Nebula', type: 'nebula' },
  'RING': { catalog: 'M57', name: 'Ring Nebula', type: 'nebula' },
  'EAGLE': { catalog: 'M16', name: 'Eagle Nebula', type: 'nebula' },
  'LAGOON': { catalog: 'M8', name: 'Lagoon Nebula', type: 'nebula' },
  'TRIFID': { catalog: 'M20', name: 'Trifid Nebula', type: 'nebula' },
  'DUMBBELL': { catalog: 'M27', name: 'Dumbbell Nebula', type: 'nebula' },
  'TRIANGULUM': { catalog: 'M33', name: 'Triangulum Galaxy', type: 'galaxy' },
  'PINWHEEL': { catalog: 'M101', name: 'Pinwheel Galaxy', type: 'galaxy' },
  'SOMBRERO': { catalog: 'M104', name: 'Sombrero Galaxy', type: 'galaxy' },
  'BODES': { catalog: 'M81', name: 'Bode\'s Galaxy', type: 'galaxy' },
  'CIGAR': { catalog: 'M82', name: 'Cigar Galaxy', type: 'galaxy' },
  'OWL': { catalog: 'M97', name: 'Owl Nebula', type: 'nebula' },
  'SUNFLOWER': { catalog: 'M63', name: 'Sunflower Galaxy', type: 'galaxy' },
  'BLACKEYE': { catalog: 'M64', name: 'Black Eye Galaxy', type: 'galaxy' },
  'BEEHIVE': { catalog: 'M44', name: 'Beehive Cluster', type: 'star cluster' },
  'HERCULES': { catalog: 'M13', name: 'Great Globular Cluster in Hercules', type: 'star cluster' },
  
  'HORSEHEAD': { catalog: 'B33', name: 'Horsehead Nebula', type: 'dark nebula' },
  'FLAME': { catalog: 'NGC2024', name: 'Flame Nebula', type: 'nebula' },
  'ROSETTE': { catalog: 'NGC2237', name: 'Rosette Nebula', type: 'nebula' },
  'CONE': { catalog: 'NGC2264', name: 'Cone Nebula', type: 'nebula' },
  'CALIFORNIA': { catalog: 'NGC1499', name: 'California Nebula', type: 'nebula' },
  'RUNNING': { catalog: 'NGC1977', name: 'Running Man Nebula', type: 'nebula' },
  'HEART': { catalog: 'IC1805', name: 'Heart Nebula', type: 'nebula' },
  'SOUL': { catalog: 'IC1848', name: 'Soul Nebula', type: 'nebula' },
  'WITCH': { catalog: 'IC2118', name: 'Witch Head Nebula', type: 'nebula' },
  'SEAGULL': { catalog: 'IC2177', name: 'Seagull Nebula', type: 'nebula' },
  'COCOON': { catalog: 'IC5146', name: 'Cocoon Nebula', type: 'nebula' },
  'PELICAN': { catalog: 'IC5070', name: 'Pelican Nebula', type: 'nebula' },
  'ELEPHANT': { catalog: 'IC1396', name: 'Elephant\'s Trunk Nebula', type: 'nebula' },
  'TADPOLES': { catalog: 'IC410', name: 'Tadpoles Nebula', type: 'nebula' },
  'BUTTERFLY': { catalog: 'IC1318', name: 'Butterfly Nebula', type: 'nebula' },
  'JELLYFISH': { catalog: 'IC443', name: 'Jellyfish Nebula', type: 'nebula' },
  'SPIDER': { catalog: 'IC417', name: 'Spider Nebula', type: 'nebula' },
  
  'CRESCENT': { catalog: 'NGC6888', name: 'Crescent Nebula', type: 'nebula' },
  'BUBBLE': { catalog: 'NGC7635', name: 'Bubble Nebula', type: 'nebula' },
  'VEIL': { catalog: 'NGC6960', name: 'Western Veil Nebula', type: 'nebula' },
  'EASTERN': { catalog: 'NGC6992', name: 'Eastern Veil Nebula', type: 'nebula' },
  'WESTERN': { catalog: 'NGC6960', name: 'Western Veil Nebula', type: 'nebula' },
  'NORTH': { catalog: 'NGC7000', name: 'North America Nebula', type: 'nebula' },
  'AMERICA': { catalog: 'NGC7000', name: 'North America Nebula', type: 'nebula' },
  'HELIX': { catalog: 'NGC7293', name: 'Helix Nebula', type: 'nebula' },
  'PACMAN': { catalog: 'NGC281', name: 'Pacman Nebula', type: 'nebula' },
  'WIZARD': { catalog: 'NGC7380', name: 'Wizard Nebula', type: 'nebula' },
  'CARINA': { catalog: 'NGC3372', name: 'Carina Nebula', type: 'nebula' },
  'NEEDLE': { catalog: 'NGC4565', name: 'Needle Galaxy', type: 'galaxy' },
  'CENTAURUS': { catalog: 'NGC5128', name: 'Centaurus A', type: 'galaxy' },
  'THOR': { catalog: 'NGC2359', name: 'Thor\'s Helmet', type: 'nebula' },
  'HELMET': { catalog: 'NGC2359', name: 'Thor\'s Helmet', type: 'nebula' },
  'MONKEY': { catalog: 'NGC2175', name: 'Monkey Head Nebula', type: 'nebula' },
  'TARANTULA': { catalog: 'NGC2070', name: 'Tarantula Nebula', type: 'nebula' },
  'CATS': { catalog: 'NGC6543', name: 'Cat\'s Eye Nebula', type: 'nebula' },
  'CATS': { catalog: 'NGC6334', name: 'Cat\'s Paw Nebula', type: 'nebula' },
  'BUG': { catalog: 'NGC6302', name: 'Bug Nebula', type: 'nebula' },
  'MEDUSA': { catalog: 'Abell 21', name: 'Medusa Nebula', type: 'nebula' },
  
  'TULIP': { catalog: 'Sh2-101', name: 'Tulip Nebula', type: 'nebula' },
  'CAVE': { catalog: 'Sh2-155', name: 'Cave Nebula', type: 'nebula' },
  'FLYING': { catalog: 'Sh2-129', name: 'Flying Bat Nebula', type: 'nebula' },
  'BAT': { catalog: 'Sh2-129', name: 'Flying Bat Nebula', type: 'nebula' },
  'LION': { catalog: 'Sh2-132', name: 'Lion Nebula', type: 'nebula' },
  'DOLPHIN': { catalog: 'Sh2-308', name: 'Dolphin Head Nebula', type: 'nebula' },
  
  'DOUBLE': { catalog: 'NGC869', name: 'Double Cluster', type: 'star cluster' },
  'IRIS': { catalog: 'C4', name: 'Iris Nebula', type: 'nebula' },
  'SCULPTOR': { catalog: 'NGC253', name: 'Sculptor Galaxy', type: 'galaxy' },
  'SILVER': { catalog: 'NGC891', name: 'Silver Sliver Galaxy', type: 'galaxy' },
  'SLIVER': { catalog: 'NGC891', name: 'Silver Sliver Galaxy', type: 'galaxy' },
  'FORNAX': { catalog: 'NGC1316', name: 'Fornax A Galaxy', type: 'galaxy' },
  'PRAWN': { catalog: 'IC4628', name: 'Prawn Nebula', type: 'nebula' },
  'GHOST': { catalog: 'IC63', name: 'Ghost of Cassiopeia', type: 'nebula' },
  'CASSIOPEIA': { catalog: 'IC63', name: 'Ghost of Cassiopeia', type: 'nebula' }
};

// Parse astronomical object from filename
function parseAstronomicalObject(filename) {
  // Remove extension and clean filename
  const baseName = filename.replace(/\.[^/.]+$/, '');
  
  // Common processing indicators to ignore
  const processingTerms = ['DONE', 'FINISHED', 'FINAL', 'PROCESSED', 'LR', 'PI', 'PS', '1', '2', '3'];
  
  // Split by common separators
  const parts = baseName.split(/[-_\s]+/).filter(part => 
    part.length > 0 && !processingTerms.includes(part.toUpperCase())
  );
  
  let catalogDesignation = '';
  let objectName = '';
  
  // Look for catalog patterns
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const upperPart = part.toUpperCase();
    
    // Direct catalog lookup
    if (ASTRONOMICAL_OBJECTS[upperPart]) {
      const obj = ASTRONOMICAL_OBJECTS[upperPart];
      catalogDesignation = obj.catalog;
      objectName = obj.name;
      break;
    }
    
    // Check for catalog designation patterns
    // Messier: M + number
    if (/^M\d+$/.test(upperPart)) {
      if (ASTRONOMICAL_OBJECTS[upperPart]) {
        const obj = ASTRONOMICAL_OBJECTS[upperPart];
        catalogDesignation = obj.catalog;
        objectName = obj.name;
        break;
      } else {
        catalogDesignation = upperPart;
        objectName = `Messier ${upperPart.substring(1)}`;
        break;
      }
    }
    
    // NGC: NGC + number (handle both NGC1234 and NGC 1234 formats)
    if (/^NGC\d+$/.test(upperPart)) {
      if (ASTRONOMICAL_OBJECTS[upperPart]) {
        const obj = ASTRONOMICAL_OBJECTS[upperPart];
        catalogDesignation = obj.catalog;
        objectName = obj.name;
        break;
      } else {
        catalogDesignation = upperPart;
        objectName = `${upperPart}`;
        break;
      }
    }
    
    // NGC with space: NGC + number in next part
    if (upperPart === 'NGC' && i + 1 < parts.length && /^\d+$/.test(parts[i + 1])) {
      const number = parts[i + 1];
      const normalizedNgc = `NGC${number}`;
      if (ASTRONOMICAL_OBJECTS[normalizedNgc]) {
        const obj = ASTRONOMICAL_OBJECTS[normalizedNgc];
        catalogDesignation = obj.catalog;
        objectName = obj.name;
        break;
      } else {
        catalogDesignation = `NGC${number}`;
        objectName = `NGC${number}`;
        break;
      }
    }
    
    // IC: IC + number (handle both IC1234 and IC 1234 formats)
    if (/^IC\d+$/.test(upperPart)) {
      if (ASTRONOMICAL_OBJECTS[upperPart]) {
        const obj = ASTRONOMICAL_OBJECTS[upperPart];
        catalogDesignation = obj.catalog;
        objectName = obj.name;
        break;
      } else {
        catalogDesignation = upperPart;
        objectName = `${upperPart}`;
        break;
      }
    }
    
    // IC with space: IC + number in next part
    if (upperPart === 'IC' && i + 1 < parts.length && /^\d+$/.test(parts[i + 1])) {
      const number = parts[i + 1];
      const normalizedIc = `IC${number}`;
      if (ASTRONOMICAL_OBJECTS[normalizedIc]) {
        const obj = ASTRONOMICAL_OBJECTS[normalizedIc];
        catalogDesignation = obj.catalog;
        objectName = obj.name;
        break;
      } else {
        catalogDesignation = `IC${number}`;
        objectName = `IC${number}`;
        break;
      }
    }
    
    // Sharpless: SH2 followed by number in next part
    if (upperPart === 'SH2' && i + 1 < parts.length && /^\d+$/.test(parts[i + 1])) {
      const number = parts[i + 1];
      const normalizedSh = `SH2-${number}`;
      if (ASTRONOMICAL_OBJECTS[normalizedSh]) {
        const obj = ASTRONOMICAL_OBJECTS[normalizedSh];
        catalogDesignation = obj.catalog;
        objectName = obj.name;
        break;
      } else {
        catalogDesignation = `Sh2-${number}`;
        objectName = catalogDesignation;
        break;
      }
    }
    
    // Sharpless: SH2-number (with dash)
    if (/^SH2-\d+$/.test(upperPart)) {
      const normalizedSh = upperPart; // Already in correct format
      if (ASTRONOMICAL_OBJECTS[normalizedSh]) {
        const obj = ASTRONOMICAL_OBJECTS[normalizedSh];
        catalogDesignation = obj.catalog;
        objectName = obj.name;
        break;
      } else {
        catalogDesignation = `Sh2-${upperPart.substring(4)}`;
        objectName = catalogDesignation;
        break;
      }
    }
    
    // Sharpless: SH + number (without dash)
    if (/^SH\d+$/.test(upperPart)) {
      const number = upperPart.substring(2);
      const normalizedSh = `SH2-${number}`;
      if (ASTRONOMICAL_OBJECTS[normalizedSh]) {
        const obj = ASTRONOMICAL_OBJECTS[normalizedSh];
        catalogDesignation = obj.catalog;
        objectName = obj.name;
        break;
      } else {
        catalogDesignation = `Sh2-${number}`;
        objectName = catalogDesignation;
        break;
      }
    }
    
    // Caldwell: C + number
    if (/^C\d+$/.test(upperPart)) {
      if (ASTRONOMICAL_OBJECTS[upperPart]) {
        const obj = ASTRONOMICAL_OBJECTS[upperPart];
        catalogDesignation = obj.catalog;
        objectName = obj.name;
        break;
      } else {
        catalogDesignation = upperPart;
        objectName = `Caldwell ${upperPart.substring(1)}`;
        break;
      }
    }
    
    // Barnard: B + number
    if (/^B\d+$/.test(upperPart)) {
      if (ASTRONOMICAL_OBJECTS[upperPart]) {
        const obj = ASTRONOMICAL_OBJECTS[upperPart];
        catalogDesignation = obj.catalog;
        objectName = obj.name;
        break;
      } else {
        catalogDesignation = upperPart;
        objectName = `Barnard ${upperPart.substring(1)}`;
        break;
      }
    }
    
    // Abell: A + number or ABELL + number
    if (/^A\d+$/.test(upperPart) || /^ABELL\d+$/.test(upperPart)) {
      const number = upperPart.startsWith('ABELL') ? upperPart.substring(5) : upperPart.substring(1);
      const normalizedA = `A${number}`;
      if (ASTRONOMICAL_OBJECTS[normalizedA]) {
        const obj = ASTRONOMICAL_OBJECTS[normalizedA];
        catalogDesignation = obj.catalog;
        objectName = obj.name;
        break;
      } else {
        catalogDesignation = `Abell ${number}`;
        objectName = `Abell ${number}`;
        break;
      }
    }
    
    // van den Bergh: VDB + number, VdB + number, or VDB + number
    if (/^VDB\d+$/.test(upperPart) || /^VdB\d+$/.test(upperPart)) {
      const number = upperPart.substring(3);
      const normalizedVdb = `VDB${number}`;
      if (ASTRONOMICAL_OBJECTS[normalizedVdb]) {
        const obj = ASTRONOMICAL_OBJECTS[normalizedVdb];
        catalogDesignation = obj.catalog;
        objectName = obj.name;
        break;
      } else {
        catalogDesignation = `vdB ${number}`;
        objectName = `vdB ${number}`;
        break;
      }
    }
  }
  
  // If no catalog found, look for common names in the filename
  if (!catalogDesignation) {
    const combinedParts = parts.join(' ').toUpperCase();
    
    for (const [key, obj] of Object.entries(ASTRONOMICAL_OBJECTS)) {
      // Skip catalog designations, look for common names
      if (!/^[A-Z]+\d+/.test(key) && combinedParts.includes(key)) {
        catalogDesignation = obj.catalog;
        objectName = obj.name;
        break;
      }
    }
  }
  
  // If still no match, try to extract object name from filename
  if (!objectName) {
    // Look for "The" + name patterns
    const theMatch = baseName.match(/[-_]The[-_]([A-Za-z]+)/i);
    if (theMatch) {
      objectName = `The ${theMatch[1]}`;
    } else {
      // Use the cleaned filename parts
      objectName = parts
        .filter(part => !/^\d+$/.test(part)) // Remove pure numbers
        .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
    }
  }
  
  return {
    catalogDesignation: catalogDesignation,
    objectName: objectName || baseName
  };
}

function generateObjectName(filename) {
  // Remove file extension
  let name = filename.replace(/\.[^.]+$/, '');
  
  // Replace hyphens, underscores, and dots with spaces
  name = name.replace(/[-_.]/g, ' ');
  
  // Convert to uppercase
  name = name.toUpperCase();
  
  return name;
}

// Helper function to clean terrestrial/equipment names from filename
function generateCleanName(filename) {
  // Remove file extension
  let name = filename.replace(/\.[^.]+$/, '');
  
  // Handle camelCase by inserting spaces before uppercase letters
  name = name.replace(/([a-z])([A-Z])/g, '$1 $2');
  
  // Replace hyphens, underscores, and dots with spaces
  name = name.replace(/[-_.]/g, ' ');
  
  // Remove common camera/phone prefixes and suffixes
  name = name.replace(/^(IMG|DSC|DSCN|P|PHOTO|PIC|IMAGE)\s*/i, '');
  name = name.replace(/\s*(JPG|JPEG|PNG|AVIF|WEBP|iOS)$/i, '');
  
  // Remove sequences of numbers in the middle or end
  name = name.replace(/\s+\d{8,}\s*/g, ' '); // Remove 8+ digit sequences (timestamps)
  
  // Remove numbers at the end (handles both spaced and unspaced numbers)
  name = name.replace(/\s*\d+\s*$/, ''); // Remove numbers with optional spaces at end
  name = name.replace(/\d+$/, ''); // Remove numbers directly attached at end (like "Basin10" -> "Basin")
  
  // Clean up extra spaces
  name = name.replace(/\s+/g, ' ').trim();
  
  // Capitalize each word properly
  name = name.split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
    
  return name || 'Untitled';
}

// Helper function to generate location from folder path
function generateLocationFromFolder(folder) {
  if (!folder.startsWith('terrestrial/')) {
    return '';
  }
  
  // Extract the location part after 'terrestrial/'
  const locationPart = folder.replace('terrestrial/', '');
  
  // Convert folder names to proper location names
  const locationMap = {
    'yellowstone': 'Yellowstone National Park',
    'grand-tetons': 'Grand Teton National Park',
    'grand-teton': 'Grand Teton National Park',
    'yosemite': 'Yosemite National Park',
    'glacier': 'Glacier National Park',
    'zion': 'Zion National Park',
    'bryce': 'Bryce Canyon National Park',
    'arches': 'Arches National Park',
    'death-valley': 'Death Valley National Park',
    'joshua-tree': 'Joshua Tree National Park',
    'crater-lake': 'Crater Lake National Park',
    'olympic': 'Olympic National Park',
    'mount-rainier': 'Mount Rainier National Park',
    'north-cascades': 'North Cascades National Park'
  };
  
  // Check if we have a specific mapping
  if (locationMap[locationPart]) {
    return locationMap[locationPart];
  }
  
  // Otherwise, clean up the folder name
  return locationPart
    .replace(/[-_]/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// Helper function to extract Month, Year from image EXIF metadata
async function getDateTaken(filePath) {
  try {
    // First try to get EXIF data from the image
    const exifData = await exifr.parse(filePath);
    
    if (exifData) {
      // Look for the best date field in order of preference
      const dateFields = [
        'DateTimeOriginal',  // Best - actual capture time
        'CreateDate',        // Good - creation time  
        'DateTime',          // OK - file datetime
        'DateTimeDigitized', // OK - digitization time
        'ModifyDate'         // Last resort - modification time (processing date)
      ];
      
      let bestDate = null;
      let bestField = null;
      
      for (const field of dateFields) {
        if (exifData[field]) {
          bestDate = new Date(exifData[field]);
          bestField = field;
          break;
        }
      }
      
      if (bestDate && !isNaN(bestDate.getTime())) {
        // Format as "Month, Year" (e.g., "February, 2024")
        const monthNames = [
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'
        ];
        
        const month = monthNames[bestDate.getMonth()];
        const year = bestDate.getFullYear();
        
        console.log(`   📅 Date from EXIF ${bestField}: ${month}, ${year}`);
        return `${month}, ${year}`;
      }
    }
    
    // Fallback to file system dates if no EXIF data
    console.log(`   ⚠️  No EXIF date found, using file system date`);
    const stats = fs.statSync(filePath);
    const fileDate = stats.birthtime || stats.mtime;
    
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    
    const month = monthNames[fileDate.getMonth()];
    const year = fileDate.getFullYear();
    
    return `${month}, ${year}`;
  } catch (error) {
    console.warn(`⚠️  Could not read date for ${filePath}: ${error.message}`);
    return '';
  }
}

function getImageType(folder) {
  if (folder.startsWith('terrestrial/')) {
    return 'terrestrial';
  } else if (folder === 'equipment') {
    return 'equipment';
  } else if (folder.includes('events')) {
    return 'celestial-events';
  } else {
    return 'astrophotography';
  }
}

async function createMetadataEntry(image) {
  const imageType = getImageType(image.folder);
  const dateTaken = await getDateTaken(image.fullPath);
  
  switch (imageType) {
    case 'terrestrial':
      return {
        "name": generateCleanName(image.filename),      // e.g., "Mammoth Springs"
        "dateTaken": dateTaken,                         // e.g., "August, 2024"
        "location": generateLocationFromFolder(image.folder), // e.g., "Yellowstone National Park"
        "protected": false,
        "youtubeLink": "",
        "youtubeTitle": ""
      };
      
    case 'equipment':
      return {
        "equipmentName": generateCleanName(image.filename), // e.g., "SeeStar S50"
        "equipmentInfo": "",  // e.g., "Smart Telescope by ZWO"
        "protected": false,
        "youtubeLink": "",
        "youtubeTitle": ""
      };
      
    case 'celestial-events':
      return {
        "catalogDesignation": "",
        "objectName": generateCleanName(image.filename), // e.g., "Total Eclipse" instead of "2017 Total Eclipse1"
        "dateTaken": dateTaken,                         // e.g., "August, 2017"
        "location": "Maple Valley, WA",
        "equipment": "",
        "exposure": "",
        "protected": false,
        "youtubeLink": "",
        "youtubeTitle": ""
      };
      
    default: // astrophotography
      const parsed = parseAstronomicalObject(image.filename);
      return {
        "catalogDesignation": parsed.catalogDesignation,
        "objectName": parsed.objectName,
        "dateTaken": dateTaken,                         // e.g., "February, 2024"
        "location": "Maple Valley, WA",
        "equipment": "",
        "exposure": "",
        "protected": false,
        "youtubeLink": "",
        "youtubeTitle": ""
      };
  }
}

async function updateMetadata() {
  console.log('🔍 Scanning for images...');
  
  const allImages = findImages();
  const existingMetadata = loadExistingMetadata();
  
  let newEntries = 0;
  let updatedEntries = 0;
  let deletedEntries = 0;
  let totalImages = allImages.length;
  
  console.log(`📁 Found ${totalImages} images across all folders`);
  
  // First, check for entries that no longer have corresponding files (cleanup)
  const currentImageFilenames = new Set(allImages.map(img => img.filename));
  const entriesToDelete = [];
  
  Object.keys(existingMetadata).forEach(filename => {
    if (!currentImageFilenames.has(filename)) {
      entriesToDelete.push(filename);
    }
  });
  
  // Remove entries for deleted files
  entriesToDelete.forEach(filename => {
    console.log(`🗑️  Removing metadata for deleted file: ${filename}`);
    delete existingMetadata[filename];
    deletedEntries++;
  });
  
  // Add/update entries for all images
  for (const image of allImages) {
    const isNewEntry = !existingMetadata[image.filename];
    const imageType = getImageType(image.folder);
    
    if (isNewEntry) {
      console.log(`➕ Adding ${imageType} metadata for: ${image.filename} (in ${image.folder})`);
      newEntries++;
      
      // Create new entry with appropriate fields for image type
      existingMetadata[image.filename] = await createMetadataEntry(image);
    } else {
      // For all image types, check if dateTaken field is missing and add it
      const entry = existingMetadata[image.filename];
      let needsDateUpdate = false;
      
      // Check if dateTaken field is missing or empty (for astrophotography, terrestrial, and celestial events)
      if ((imageType === 'astrophotography' || imageType === 'terrestrial' || imageType === 'celestial-events') && 
          (!entry.dateTaken || entry.dateTaken === '')) {
        entry.dateTaken = await getDateTaken(image.fullPath);
        needsDateUpdate = true;
        console.log(`📅 Added dateTaken field for: ${image.filename} (${entry.dateTaken})`);
      }
      
      // For terrestrial and equipment images, update if fields are empty
      if (imageType === 'terrestrial') {
        const needsUpdate = !entry.location || !entry.name || entry.location === '' || entry.name === '' ||
                           (!entry.protected && entry.protected !== false) || 
                           (!entry.youtubeLink && entry.youtubeLink !== '') || 
                           (!entry.youtubeTitle && entry.youtubeTitle !== '');
        
        if (needsUpdate || needsDateUpdate) {
          console.log(`🔄 Updating terrestrial metadata for: ${image.filename} (${imageType} in ${image.folder})`);
          if (!entry.location || entry.location === '') entry.location = generateLocationFromFolder(image.folder);
          if (!entry.name || entry.name === '') entry.name = generateCleanName(image.filename);
          if (entry.protected === undefined) entry.protected = false;
          if (entry.youtubeLink === undefined) entry.youtubeLink = '';
          if (entry.youtubeTitle === undefined) entry.youtubeTitle = '';
          updatedEntries++;
        } else {
          console.log(`✅ Complete entry found for: ${image.filename} (${imageType} in ${image.folder})`);
        }
      } else if (imageType === 'equipment') {
        // Only update if both equipmentName and equipmentInfo are empty/missing
        // This preserves any manual edits to equipment descriptions
        const needsUpdate = (!entry.equipmentName || entry.equipmentName === '') && 
                           (!entry.equipmentInfo || entry.equipmentInfo === '') ||
                           (!entry.protected && entry.protected !== false) || 
                           (!entry.youtubeLink && entry.youtubeLink !== '') || 
                           (!entry.youtubeTitle && entry.youtubeTitle !== '');
        
        if (needsUpdate) {
          console.log(`🔄 Updating equipment metadata for: ${image.filename} (${imageType} in ${image.folder})`);
          if (!entry.equipmentName || entry.equipmentName === '') entry.equipmentName = generateCleanName(image.filename);
          // Don't overwrite equipmentInfo if it already has content
          if (!entry.equipmentInfo) entry.equipmentInfo = '';
          if (entry.protected === undefined) entry.protected = false;
          if (entry.youtubeLink === undefined) entry.youtubeLink = '';
          if (entry.youtubeTitle === undefined) entry.youtubeTitle = '';
          updatedEntries++;
        } else {
          console.log(`✅ Complete entry found for: ${image.filename} (${imageType} in ${image.folder}) - preserving manual edits`);
        }
      } else {
        // For astrophotography and celestial events, check if required fields are missing
        const needsUpdate = (!entry.protected && entry.protected !== false) || 
                           (!entry.youtubeLink && entry.youtubeLink !== '') || 
                           (!entry.youtubeTitle && entry.youtubeTitle !== '');
        
        if (needsUpdate || needsDateUpdate) {
          console.log(`🔄 Updating ${imageType} metadata for: ${image.filename} (${imageType} in ${image.folder})`);
          if (entry.protected === undefined) entry.protected = false;
          if (entry.youtubeLink === undefined) entry.youtubeLink = '';
          if (entry.youtubeTitle === undefined) entry.youtubeTitle = '';
          updatedEntries++;
        } else {
          console.log(`✅ Complete entry found for: ${image.filename} (${imageType} in ${image.folder})`);
        }
      }
    }
  }
  
  if (newEntries > 0 || updatedEntries > 0 || deletedEntries > 0) {
    // Write updated metadata back to file
    const sortedMetadata = {};
    Object.keys(existingMetadata).sort().forEach(key => {
      sortedMetadata[key] = existingMetadata[key];
    });
    
    fs.writeFileSync(METADATA_FILE, JSON.stringify(sortedMetadata, null, 2));
    console.log(`✅ Updated metadata file`);
  } else {
    console.log('ℹ️  No changes needed');
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`   Total images found: ${totalImages}`);
  console.log(`   Total metadata entries: ${Object.keys(existingMetadata).length}`);
  console.log(`   New entries added: ${newEntries}`);
  console.log(`   Existing entries updated: ${updatedEntries}`);
  console.log(`   Obsolete entries removed: ${deletedEntries}`);
}

// Run the script
updateMetadata().catch(console.error);
