import fs from 'fs';
import path from 'path';

describe('File Structure and Assets', () => {
  const rootDir = process.cwd();
  
  test('essential directories exist', () => {
    const requiredDirs = [
      'src',
      'src/app',
      'src/components',
      'src/config',
      'src/data',
      'public',
      'public/images'
    ];
    
    requiredDirs.forEach(dir => {
      const dirPath = path.join(rootDir, dir);
      expect(fs.existsSync(dirPath)).toBe(true);
      expect(fs.statSync(dirPath).isDirectory()).toBe(true);
    });
  });

  test('essential configuration files exist', () => {
    const requiredFiles = [
      'src/config/observatory.ts',
      'src/config/global.ts',
      'src/data/metadata.json',
      'next.config.ts',
      'package.json',
      'tsconfig.json'
    ];
    
    requiredFiles.forEach(file => {
      const filePath = path.join(rootDir, file);
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.statSync(filePath).isFile()).toBe(true);
    });
  });

  test('main page files exist', () => {
    const requiredPages = [
      'src/app/page.tsx',
      'src/app/layout.tsx',
      'src/app/contact/page.tsx',
      'src/app/equipment/page.tsx',
      'src/app/terrestrial/page.tsx'
    ];
    
    requiredPages.forEach(page => {
      const pagePath = path.join(rootDir, page);
      expect(fs.existsSync(pagePath)).toBe(true);
      expect(fs.statSync(pagePath).isFile()).toBe(true);
    });
  });

  test('main component files exist', () => {
    const requiredComponents = [
      'src/components/Navigation.tsx',
      'src/components/SubNavigation.tsx',
      'src/components/GalleryTemplate.tsx'
    ];
    
    requiredComponents.forEach(component => {
      const componentPath = path.join(rootDir, component);
      expect(fs.existsSync(componentPath)).toBe(true);
      expect(fs.statSync(componentPath).isFile()).toBe(true);
    });
  });

  test('package.json has required scripts', () => {
    const packageJsonPath = path.join(rootDir, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    expect(packageJson.scripts).toBeDefined();
    expect(packageJson.scripts.dev).toBeDefined();
    expect(packageJson.scripts.build).toBeDefined();
    expect(packageJson.scripts.start).toBeDefined();
    expect(packageJson.scripts.lint).toBeDefined();
  });

  test('logo files exist in public/images/logo', () => {
    const logoDir = path.join(rootDir, 'public/images/logo');
    if (fs.existsSync(logoDir)) {
      const logoFiles = fs.readdirSync(logoDir);
      expect(logoFiles.length).toBeGreaterThan(0);
      
      // Check for at least one image file
      const hasImageFile = logoFiles.some(file => 
        /\.(jpg|jpeg|png|avif|webp)$/i.test(file)
      );
      expect(hasImageFile).toBe(true);
    }
  });

  test('astrophotography image directories exist', () => {
    const astroBase = path.join(rootDir, 'public/images/astrophotography');
    if (fs.existsSync(astroBase)) {
      const expectedDirs = ['deep-sky', 'solar-system'];
      
      expectedDirs.forEach(dir => {
        const dirPath = path.join(astroBase, dir);
        if (fs.existsSync(dirPath)) {
          expect(fs.statSync(dirPath).isDirectory()).toBe(true);
        }
      });
    }
  });
});
