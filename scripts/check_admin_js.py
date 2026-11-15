#!/usr/bin/env python3
"""Extract inline <script> blocks from admin pages and node --check each."""
import glob, subprocess, sys, os

ROOT = '/home/z/my-project/download/forged-full-project/admin'
TMP = '/home/z/my-project/scripts/_admin_js'
os.makedirs(TMP, exist_ok=True)
fails = 0

# also check the shared asset directly
direct = [ROOT + '/assets/admin.js']

for path in sorted(glob.glob(ROOT + '/*.html')) + direct:
    name = os.path.basename(path)
    if path.endswith('.html'):
        src = open(path, encoding='utf-8').read()
        blocks = []
        i = 0
        while True:
            a = src.find('<script', i)
            if a < 0: break
            b = src.find('>', a)
            tag = src[a:b]
            if 'src=' in tag:  # external — skip
                i = b; continue
            c = src.find('</script>', b)
            blocks.append(src[b + 1:c])
            i = c + 1
        if not blocks: continue
        js = '\n;\n'.join(blocks)
    else:
        js = open(path, encoding='utf-8').read()

    tmp = os.path.join(TMP, name.replace('.html', '.js'))
    with open(tmp, 'w', encoding='utf-8') as f:
        f.write(js)
    r = subprocess.run(['node', '--check', tmp], capture_output=True, text=True)
    status = 'OK' if r.returncode == 0 else 'FAIL'
    print(f'{name}: {status}')
    if r.returncode != 0:
        fails += 1
        print(r.stderr[:1500])

print('\nRESULT:', 'ALL OK' if fails == 0 else f'{fails} FILE(S) FAILED')
sys.exit(1 if fails else 0)
