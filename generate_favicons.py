import os
from PIL import Image, ImageEnhance
from rembg import remove

def process_favicon():
    # 1. Read and remove background
    input_path = 'WhatsApp Image 2026-04-21 at 14.14.54.png'
    print("Reading image and removing background...")
    with open(input_path, 'rb') as i:
        input_data = i.read()
        output_data = remove(input_data)
        
    with open('temp_nobg.png', 'wb') as o:
        o.write(output_data)
        
    # 2. Process with Pillow
    img = Image.open('temp_nobg.png')
    
    # 3. Crop to bounding box
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
        
    # 4. Make it a perfect square with centering
    max_dim = max(img.size)
    # Add a little padding (e.g., 5%)
    padding = int(max_dim * 0.05)
    new_dim = max_dim + padding * 2
    
    square_img = Image.new('RGBA', (new_dim, new_dim), (0, 0, 0, 0))
    offset = ((new_dim - img.width) // 2, (new_dim - img.height) // 2)
    square_img.paste(img, offset)
    
    # 5. Increase contrast and sharpness for small sizes
    # Metallic look needs good contrast
    enhancer_contrast = ImageEnhance.Contrast(square_img)
    square_img = enhancer_contrast.enhance(1.3)
    
    enhancer_sharpness = ImageEnhance.Sharpness(square_img)
    square_img = enhancer_sharpness.enhance(1.5)
    
    # 6. Generate the requested sizes
    sizes = [180, 64, 48, 32, 16]
    resized_images = {}
    
    for size in sizes:
        # LANCZOS is high quality for downsampling
        resized_images[size] = square_img.resize((size, size), Image.Resampling.LANCZOS)
        
    print("Saving outputs...")
    # apple-touch-icon.png (180x180)
    resized_images[180].save('apple-touch-icon.png')
    
    # favicon-32.png
    resized_images[32].save('favicon-32.png')
    
    # favicon-16.png
    resized_images[16].save('favicon-16.png')
    
    # favicon.ico (multi-size ICO file containing 16, 32, 48, 64)
    # Pillow save() supports saving multiple sizes into a single .ico
    ico_sizes = [(16, 16), (32, 32), (48, 48), (64, 64)]
    # Use the 64x64 as base, append others
    base_ico = resized_images[64]
    base_ico.save(
        'favicon.ico', 
        format='ICO', 
        sizes=ico_sizes,
        append_images=[resized_images[s] for s in [48, 32, 16]]
    )
    
    print("Cleanup...")
    if os.path.exists('temp_nobg.png'):
        os.remove('temp_nobg.png')
        
    print("Done! Generated favicon.ico, favicon-32.png, favicon-16.png, apple-touch-icon.png")

if __name__ == '__main__':
    process_favicon()
