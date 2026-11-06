"""Builds orders.html from tools/Index.html and injects the live menu, read from order.html and js/menu-order.js,
so the staff form always offers exactly what the website does. Run after editing Index.html, order.html or menu-order.js."""
import os, re, json, html

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
read = lambda *p: open(os.path.join(root, *p), encoding="utf-8").read()

page, js = read("order.html"), read("js", "menu-order.js")

def attrs(tag):
    return {k: html.unescape(v) for k, v in re.findall(r'([\w-]+)="([^"]*)"', tag)}

menu = {"chicken": {}, "sections": []}
for g in ("protein", "flavour", "carb", "side"):
    menu["chicken"][g] = [html.unescape(v) for v in re.findall(r'data-group="%s" data-value="([^"]*)"' % g, page)]
menu["chicken"]["spice"] = re.findall(r'data-spice="([^"]+)"', js)

menu["rules"] = {
    "chickenBase": int(re.search(r"130000", js).group(0)),
    "ricePrice": int(re.search(r"RICE_PRICE\s*=\s*(\d+)", js).group(1)),
    "sideOptions": [{"value": v, "extra": int(e)} for v, e in re.findall(r"\{ value: '([^']+)',\s*extra: (\d+) \}", js)],
    "chickenSideSurcharge": {k: int(v) for k, v in re.findall(r"'([^']+)':\s*(\d+)", re.search(r"SIDE_SURCHARGE = \{([^}]*)\}", js).group(1))},
}

for sec in re.findall(r'<section class="o-sec" id="(o-[\w-]+)">(.*?)</section>', page, re.S):
    sid, body = sec
    if sid == "o-chicken":
        continue
    title = html.unescape(re.sub(r"<[^>]+>", "", re.search(r"<h2>(.*?)</h2>", body, re.S).group(1))).strip()
    title = re.sub(r"\s+(non-vegetarian|pumpkin soup only|no rice)$", "", title)
    items = []
    for tag in re.findall(r'<div class="o-item[^"]*"([^>]*)>', body):
        a = attrs(tag)
        items.append({"g": a["data-group"], "value": a["data-value"], "label": a["data-label"], "price": int(a["data-price"]),
                      "rice": "data-rice" in a, "side": "data-side" in a, "soup": "data-soup" in a})
    menu["sections"].append({"id": sid[2:], "title": title, "items": items})

assert menu["rules"]["sideOptions"] and menu["chicken"]["protein"] and len(menu["sections"]) >= 6, "menu parse failed"

src = read("tools", "Index.html")
assert "/*MENU*/null/*END*/" in src, "marker missing in Index.html"
out = src.replace("/*MENU*/null/*END*/", json.dumps(menu, ensure_ascii=False))
open(os.path.join(root, "orders.html"), "w", encoding="utf-8").write(out)
print("orders.html built:", sum(len(s["items"]) for s in menu["sections"]), "items")
