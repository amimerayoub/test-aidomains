import os

def fix_file(path):
    with open(path, 'rb') as f:
        content = f.read()
    
    # Define replacements (byte sequences)
    # These are common UTF-8 mangled patterns
    replacements = [
        (b'\xc3\xa2\xe2\x82\xac\xe2\x80\x94', b'\xe2\x80\x94'), # em dash
        (b'\xc3\xa2\xe2\x80\xa0\xe2\x80\x9c', b'\xe2\x86\x93'), # down arrow
        (b'\xc3\xb0\xc5\xb8\xe2\x80\x9d\xc2\xa5', b'\xf0\x9f\x94\xa5'), # fire
        (b'\xc3\xb0\xc5\xb8\xe2\x80\x99\xc2\xb0', b'\xf0\x9f\x92\xb0'), # money bag
        (b'\xc3\xa2\xc5\xa1\xc2\xa1', b'\xe2\x9a\xa1'), # lightning
        (b'\xc3\xa2\xc2\xa0\xc2\x8d', b'\xe2\x9d\x8c'), # cross mark
        (b'\xc3\xa2\xc2\xa0\xc2\xb8', b'\xe2\x8e\xb8'), # pause (sometimes mangled)
        (b'\xc3\xa2\xe2\x80\x93\xc2\xba', b'\xf0\x9f\x94\xb8'), # stop?
        (b'\xc3\xa2\xe2\x80\x93\xc2\xb6', b'\xe2\x96\xb6'), # resume/play
        (b'\xc3\xa2\xe2\x80\xa0\xe2\x80\x99', b'\xe2\x86\x92'), # right arrow
        (b'\xc3\xb0\xc5\xb8\xc5\x92\xc2\x82', b'\xf0\x9f\x8c\x8d')  # earth
    ]
    
    new_content = content
    for old, new in replacements:
        new_content = new_content.replace(old, new)
    
    if new_content != content:
        with open(path, 'wb') as f:
            f.write(new_content)
        print(f"Fixed {path}")
    else:
        print(f"No changes needed for {path}")

# Fix index.html
fix_file(r'c:\Users\space amr\Desktop\n8n automation\website\test-aidomains-master\test-aidomains-master\index.html')
