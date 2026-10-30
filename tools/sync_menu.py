"""Rebuild the menu page's item list (menu.html, page 2) from order.html so the two never drift.
Edit items, names, descriptions or prices in order.html, then run:  python3 tools/sync_menu.py
"""
import re, os, html

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
order = open(os.path.join(ROOT, "order.html"), encoding="utf-8").read()
menu_path = os.path.join(ROOT, "menu.html")
menu = open(menu_path, encoding="utf-8").read()

LEFT = ["o-veg", "o-set", "o-toppings"]
RIGHT = ["o-drinks", "o-add", "o-box"]
SHORT = {"Vegetarian": "Vegetarian", "Main Meals": "Main Meals", "Soup Toppings": "Soup Toppings",
         "Drinks": "Drinks", "Add-ons &amp; Extras": "Add-ons &amp; Extras", "Boxes to Share": "Boxes to Share"}


def section(sec_id):
    m = re.search(r'<section class="o-sec" id="%s"><h2>(.*?)</h2>(.*?)\n    </section>' % sec_id, order, re.S)
    title, body = m.group(1), m.group(2)
    small = re.search(r"<small>(.*?)</small>", title)
    sub = small.group(1) if small else ""
    name = re.sub(r"\s*<small>.*?</small>", "", title).strip()
    items = []
    for it in re.finditer(r'<div class="o-item[^"]*"[^>]*>(.*?)</div>\s*(?=<div class="o-item|\Z)', body + "<div class=\"o-item\">", re.S):
        block = it.group(1)
        n = re.search(r"<strong>(.*?)</strong>", block, re.S)
        if not n:
            continue
        nm = re.sub(r"<[^>]+>", "", n.group(1)).strip()
        d = re.search(r"</strong><span>(.*?)</span>", block, re.S)
        p = re.search(r'class="o-price">₫([\d,]+)', block)
        items.append((nm, d.group(1) if d else "", p.group(1) if p else ""))
    return name, sub, items


def card(sec_id):
    name, sub, items = section(sec_id)
    words = name.rsplit(" ", 1)
    title = (words[0] + " <em>" + words[1] + "</em>") if len(words) == 2 else "<em>%s</em>" % name
    subtxt = ' <span class="special-sub">(%s)</span>' % sub if sub else ""
    rows = ""
    for nm, desc, price in items:
        d = '<small class="price-desc">%s</small>' % desc if desc else ""
        rows += '        <div class="price-sub-row"><span>%s%s</span><span class="price-amount">₫%s</span></div>\n' % (nm, d, price)
    return ('    <div class="special-card">\n      <div class="special-body">\n        <div class="special-title">%s%s</div>\n'
            '        <div class="price-group">\n%s        </div>\n      </div>\n    </div>\n') % (title, subtxt, rows)


block = '  <div class="p2-cols p2-menu-cols">\n    <div class="p2-stack">\n' + "".join(card(i) for i in LEFT) + \
        '    </div>\n    <div class="p2-stack">\n' + "".join(card(i) for i in RIGHT) + '    </div>\n  </div>\n'
menu = re.sub(r"<!-- MENU:START -->.*?<!-- MENU:END -->", "<!-- MENU:START -->\n" + block + "  <!-- MENU:END -->", menu, flags=re.S)
open(menu_path, "w", encoding="utf-8").write(menu)
print("menu.html page 2 rebuilt from order.html")
