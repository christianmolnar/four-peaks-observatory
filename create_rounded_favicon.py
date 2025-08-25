#!/usr/bin/env python3

from PIL import Image, ImageDraw
import os

def create_rounded_image(input_path, output_path, size, corner_radius=None):
    """Create a rounded corner version of an image"""
    # Open and resize the image
    image = Image.open(input_path)
    image = image.convert("RGBA")
    image = image.resize((size, size), Image.Resampling.LANCZOS)
    
    # Default corner radius is 1/8 of the size for a nice rounded look
    if corner_radius is None:
        corner_radius = size // 8
    
    # Create a mask for rounded corners
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([(0, 0), (size-1, size-1)], corner_radius, fill=255)
    
    # Apply the mask
    result = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    result.paste(image, (0, 0))
    result.putalpha(mask)
    
    # Save the result
    result.save(output_path, 'PNG')
    print(f"Created rounded favicon: {output_path} ({size}x{size}, radius: {corner_radius})")

def main():
    source_image = "/Users/christian/Repos/MapleValleyObservatory/public/images/assets/MVO-Favicon.jpg"
    app_dir = "/Users/christian/Repos/MapleValleyObservatory/src/app"
    
    # Create rounded versions
    create_rounded_image(source_image, f"{app_dir}/apple-touch-icon.png", 180, 32)  # More rounded for iOS
    create_rounded_image(source_image, f"{app_dir}/favicon-32x32.png", 32, 6)       # Moderately rounded
    create_rounded_image(source_image, f"{app_dir}/favicon-16x16.png", 16, 3)       # Slightly rounded
    
    # For the ICO file, we'll convert the 16x16 PNG
    print("Converting to ICO format...")
    ico_image = Image.open(f"{app_dir}/favicon-16x16.png")
    ico_image.save(f"{app_dir}/favicon.ico", format='ICO', sizes=[(16,16)])
    print(f"Created ICO: {app_dir}/favicon.ico")

if __name__ == "__main__":
    main()
