#!/usr/bin/env python3
"""Phase 5 cleanup — normalize the confirm/prompt refactor fallout:
1) dedupe `const toast = useToast();` blocks created by the insertion bug
2) dedupe duplicated function headers (banners.jsx)
3) ensure every file using useConfirm/usePrompt imports them
"""
import pathlib, re, sys

D = pathlib.Path('/home/z/my-project/arixgear/admin/src/pages')
changed = []

for p in sorted(D.glob('*.jsx')):
    t = p.read_text()
    orig = t

    # 2) duplicated function header directly followed by itself
    t = re.sub(r'(function (\w+)\(\) \{\n)(function \2\(\) \{\n)', r'\1', t)

    # 1) toast / confirm / toast dedupe (any order, with optional ask + blanks)
    t = re.sub(
        r'([ \t]*)const toast = useToast\(\);(\n+)([ \t]*)const confirm = useConfirm\(\);([ \t]*\n)?([ \t]*)const ask = usePrompt\(\);(\n+)([ \t]*)const toast = useToast\(\);',
        r'\1const toast = useToast();\n\3const confirm = useConfirm();\n\3const ask = usePrompt();',
        t)
    t = re.sub(
        r'([ \t]*)const toast = useToast\(\);(\n+)([ \t]*)const confirm = useConfirm\(\);(\n+)([ \t]*)const toast = useToast\(\);',
        r'\1const toast = useToast();\n\3const confirm = useConfirm();',
        t)
    t = re.sub(
        r'([ \t]*)const confirm = useConfirm\(\);(\n+)([ \t]*)const ask = usePrompt\(\);(\n+)([ \t]*)const toast = useToast\(\);(\n+)([ \t]*)const toast = useToast\(\);',
        r'\1const confirm = useConfirm();\n\3const ask = usePrompt();\n\5const toast = useToast();',
        t)

    # 3) imports
    needs_confirm = 'useConfirm(' in t and "useConfirm }" not in t and "useConfirm,\n" not in t and "import { useConfirm" not in t
    needs_prompt = 'usePrompt(' in t and "usePrompt }" not in t and "usePrompt,\n" not in t and "import { useConfirm, usePrompt" not in t
    if needs_confirm or needs_prompt:
        # find existing ui.jsx import to extend, else add after Overlays import
        m = re.search(r"import \{([^}]*)\} from '\.\./components/ui\.jsx';", t)
        want = []
        if 'useConfirm(' in t and 'useConfirm' not in (m.group(1) if m else ''):
            want.append('useConfirm')
        if 'usePrompt(' in t and 'usePrompt' not in (m.group(1) if m else ''):
            want.append('usePrompt')
        if m:
            names = m.group(1).strip()
            names = ', '.join(sorted(set([n.strip() for n in names.split(',')] + want)))
            t = t.replace(m.group(0), f"import {{ {names} }} from '../components/ui.jsx';", 1)
        else:
            add = ', '.join(want)
            m2 = re.search(r"import \{[^}]*\} from '\.\./components/Overlays\.jsx';\n", t)
            t = t.replace(m2.group(0), m2.group(0) + f"import {{ {add} }} from '../components/ui.jsx';\n", 1)

    if t != orig:
        p.write_text(t)
        changed.append(p.name)

print('changed:', ', '.join(changed) if changed else 'none')
# verify: no duplicate toast declarations per component scope (rough check)
for p in sorted(D.glob('*.jsx')):
    t = p.read_text()
    dups = len(re.findall(r'const toast = useToast\(\);', t))
    if dups > 1:
        comps = len(re.findall(r'^function |^export default function ', t, re.M))
        print(f'{p.name}: {dups} toast decls / {comps} components')
