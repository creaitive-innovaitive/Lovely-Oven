"""Rebuild the menu page (page 2 of menu.html and the PDF) from order.html so the two never drift.
Edit items, names, descriptions or prices in order.html, then run:  python3 tools/sync_menu.py
"""
import re, os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
order = open(os.path.join(ROOT, "order.html"), encoding="utf-8").read()
menu_path = os.path.join(ROOT, "menu.html")
menu = open(menu_path, encoding="utf-8").read()

LEFT = ["o-veg", "o-set", "o-toppings"]
RIGHT = ["o-drinks", "o-add", "o-box"]


def section(sec_id):
    m = re.search(r'<section class="o-sec" id="%s"><h2>(.*?)</h2>(.*?)\n    </section>' % sec_id, order, re.S)
    title, body = m.group(1), m.group(2)
    small = re.search(r"<small>(.*?)</small>", title)
    sub = small.group(1) if small else ""
    name = re.sub(r"\s*<small>.*?</small>", "", title).strip()
    items = []
    for it in re.finditer(r'<div class="o-item[^"]*"[^>]*>(.*?)</div>\s*(?=<div class="o-item|\Z)', body + '<div class="o-item">', re.S):
        chunk = it.group(1)
        n = re.search(r"<strong>(.*?)</strong>", chunk, re.S)
        if not n:
            continue
        nm = re.sub(r"<[^>]+>", "", n.group(1)).strip()
        d = re.search(r"</strong><span>(.*?)</span>", chunk, re.S)
        p = re.search(r'class="o-price">₫([\d,]+)', chunk)
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


def build():
    m = re.search(r'<section class="o-sec o-build" id="o-chicken">(.*?)\n    </section>', order, re.S)
    body = m.group(1)
    price = re.search(r'class="o-badge">(.*?)</span>', body).group(1)
    sub = re.search(r'<p class="o-sub">(.*?)</p>', body, re.S).group(1)
    steps = ""
    for label, group in (("1 · Cut", "protein"), ("2 · Marinade", "flavour"), ("3 · Carb", "carb"), ("4 · Side", "side")):
        opts = re.findall(r'data-group="%s" data-value="([^"]*)"' % group, body)
        steps += '      <div class="pg2-step"><b>%s</b>%s</div>\n' % (label, "".join("<span>%s</span>" % o for o in opts))
    return ('  <div class="pg2-build">\n    <div class="pg2-build-title">Build your own <em>Chicken Meal</em><span class="pg2-badge">Full meal — %s</span></div>\n'
            '    <div class="pg2-build-sub">%s</div>\n    <div class="pg2-steps">\n%s    </div>\n  </div>\n') % (price, sub, steps)


PHOTOS = ('        <div class="pg2-photos">\n'
          '          <figure><img data-cover src="img/menu/cottage-pie.jpg" alt="Cottage pie"><figcaption>Cottage Pie</figcaption></figure>\n'
          '          <figure><img data-cover src="img/menu/pumpkin-soup.jpg" alt="Pumpkin soup"><figcaption>Pumpkin Soup</figcaption></figure>\n'
          '          <figure><img data-cover src="img/menu/chilli-con-carne.jpg" alt="Chilli con carne"><figcaption>Chilli Con Carne</figcaption></figure>\n'
          '        </div>\n')

HEAD = ('  <div class="pg2-head">\n    <div class="pg2-brand">Lovely <em>Oven</em></div>\n'
        '    <div class="pg2-head-contact"><strong>+84 987 390 140</strong>Zalo · WhatsApp · www.lovelyoven.com</div>\n  </div>\n')
FOOT = ('  <div class="pg2-foot"><span><strong>Order:</strong> phone, Zalo or WhatsApp +84 987 390 140 · lovelyoven.com/order</span>'
        '<span>Free delivery in the FPT area · Danang &amp; Hoi An: book on Grab</span></div>\n')

block = ('<div class="page pg2">\n' + HEAD + build() + '  <div class="pg2-cols">\n    <div class="pg2-stack">\n' + "".join(card(i) for i in LEFT) +
         '    </div>\n    <div class="pg2-stack">\n' + "".join(card(i) for i in RIGHT) + PHOTOS + '    </div>\n  </div>\n' + FOOT + '</div><!-- end page 2 -->\n')
menu = re.sub(r"<!-- MENU:START -->.*?<!-- MENU:END -->", lambda _: "<!-- MENU:START -->\n" + block + "<!-- MENU:END -->", menu, flags=re.S)
open(menu_path, "w", encoding="utf-8").write(menu)
print("menu.html page 2 rebuilt from order.html")
