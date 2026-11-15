#!/usr/bin/env python3
"""Patch browser QA scripts for the React build:
- inject an rfill() helper (native value setter + input/change events — React onChange compatible)
- replace `$AB fill "SEL" "VAL"` with `rfill "SEL" "VAL"`
- replace legacy global `payMethod` reads with the DOM-based `.pm.sel` read
"""
import re, sys

HELPER = '''
# React-compatible fill (native setter + input/change events)
rfill(){
  $AB eval "(function(){const el=document.querySelector('$1');if(!el)return 'no-el';const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:(el instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype);const d=Object.getOwnPropertyDescriptor(proto,'value').set;d.call(el,'$2');el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return 'ok'})()" >/dev/null 2>&1
}
'''

SCRIPTS = [
    '/home/z/my-project/scripts/qa_prod_e2e.sh',
    '/home/z/my-project/scripts/qa_pixel_browser.sh',
    '/home/z/my-project/scripts/qa_admin_control_browser.sh',
]

for path in SCRIPTS:
    s = open(path, encoding='utf-8').read()
    orig = s
    # inject helper after AB="agent-browser" line
    if 'rfill()' not in s:
        s = re.sub(r'(AB="agent-browser"\n)', r'\1' + HELPER, s, count=1)
    # replace fills
    s = s.replace('$AB fill ', 'rfill ')
    # payMethod global reads → DOM-based
    s = s.replace(
        '$($AB eval "payMethod" 2>/dev/null | tail -1 | tr -d \'"\')',
        '$($AB eval "document.querySelector(\'.pm.sel\')?.dataset.pay||\'\'" 2>/dev/null | tail -1 | tr -d \'"\')',
    )
    open(path, 'w', encoding='utf-8').write(s)
    fills = s.count('rfill "')
    print(path.split('/')[-1], '| rfill calls:', fills, '| changed:', s != orig)
