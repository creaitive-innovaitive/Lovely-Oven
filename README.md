# Lovely Oven website

Static site served by GitHub Pages at https://www.lovelyoven.com (custom domain in `CNAME`).

```
index.html  menu.html  order.html  nutrition.html  social.html   pages (clean URLs: /menu, /order ...)
404.html                       not-found page
css/   styles.css (site), menu.css (menu + order bar), order.css (order page)
js/    script.js (shared), menu-order.js (order builder: WhatsApp / Zalo)
img/   hero, dishes, menu, gallery, home, payment, logos
tools/serve.py                 local preview
```

Preview locally: `python3 tools/serve.py`, then open http://localhost:8000.

Business files (finances, orders, source photos, Grab exports, A5 specials) are kept outside this repo, in `~/Documents/Lovely Oven Files`. Don't commit them: GitHub Pages publishes everything in the repo.

## Keeping the order, menu and nutrition pages in step

`order.html` is the source of truth for items, names, descriptions and prices. After editing it, run

```
python3 tools/sync_menu.py
```

to rebuild the menu page's item list (page 2 of the menu and the PDF). `nutrition.html` uses the same section headings and items, so update it by hand when items are added, renamed or removed.
