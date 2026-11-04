"""Copies the order form (tools/Index.html) to orders.html for the website. Run after editing Index.html."""
import os, shutil
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
shutil.copyfile(os.path.join(root, "tools", "Index.html"), os.path.join(root, "orders.html"))
