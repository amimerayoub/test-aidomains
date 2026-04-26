import re
import os

path = r'c:\Users\space amr\Desktop\n8n automation\website\test-aidomains-master\test-aidomains-master\index.html'
with open(path, 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    # Campaign buttons
    if 'id="btnPauseCampaign"' in line:
        line = re.sub(r'>.*Pause', '>⏸ Pause', line)
    elif 'id="btnResumeCampaign"' in line:
        line = re.sub(r'>.*Resume', '>▶ Resume', line)
    elif 'id="btnStopCampaign"' in line:
        line = re.sub(r'>.*Stop', '>⏹ Stop', line)
    
    # Analyzer Sorting
    elif 'data-value="score"' in line and 'Score' in line:
        line = re.sub(r'>Score.*<', '>Score ↓<', line)
    elif 'data-value="cpc"' in line and 'CPC' in line:
        line = re.sub(r'>CPC.*<', '>CPC ↓<', line)
    elif 'data-value="age"' in line and 'Age' in line:
        line = re.sub(r'>Age.*<', '>Age ↓<', line)
    
    # Analyzer Classes
    elif 'data-value="Elite"' in line:
        line = re.sub(r'>.*Elite', '>🔥 Elite', line)
    elif 'data-value="High Value"' in line:
        line = re.sub(r'>.*High Value', '>💰 High Value', line)
    elif 'data-value="Good Flip"' in line:
        line = re.sub(r'>.*Good Flip', '>⚡ Good Flip', line)
    elif 'data-value="Low Quality"' in line:
        line = re.sub(r'>.*Low Quality', '>❌ Low Quality', line)
    
    # Select triggers
    elif 'custom-select-trigger' in line and 'Score' in line:
        line = re.sub(r'Score.*<', 'Score ↓<', line)
    
    # Misc
    if 'Ã¢â‚¬â€' in line:
        line = line.replace('Ã¢â‚¬â€', '—')
    if 'Ã¢â€ â€™' in line:
        line = line.replace('Ã¢â€ â€™', '→')
    if 'Ã°Å¸Å’Â' in line:
        line = line.replace('Ã°Å¸Å’Â', '🌍')

    new_lines.append(line)

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Fixed all remaining issues in index.html")
