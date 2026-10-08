#!/usr/bin/env python3
"""Clean up TeacherLookupView: remove subView + VEDA, simplify to just lookup"""
f='js/app.js'
s=open(f,encoding='utf-8',newline='').read()

# Replace the remaining veda subview code in TeacherLookupView with simple close
old = "            _meta, _links, _pubs, _works);\r\n        }))\r\n      )\r\n    ),\r\n    !loading && subView === 'veda' && e('div', { className: 'veda-embedded-panel', style: { height: '600px', minHeight: '500px', border: '1px solid var(--bg-2)', borderRadius: 8, overflow: 'hidden' } },\r\n      e(VedaPanel, { user: props.user })\r\n    )\r\n  )\r\n});"

new = "            _meta, _links, _pubs, _works);\r\n        }))\r\n      )\r\n    )\r\n});"

if old in s:
    s = s.replace(old, new, 1)
    print("OK: Cleaned TeacherLookupView")
else:
    print("NOT FOUND")
    exit(1)

open(f,'w',encoding='utf-8',newline='').write(s)
