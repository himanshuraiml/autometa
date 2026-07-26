import os

def fix_perms(root_dir):
    try:
        os.chmod(root_dir, 0o755)
    except Exception:
        pass
    for root, dirs, files in os.walk(root_dir):
        for d in dirs:
            p = os.path.join(root, d)
            try:
                os.chmod(p, 0o755)
            except Exception:
                pass
        for f in files:
            p = os.path.join(root, f)
            try:
                os.chmod(p, 0o644)
            except Exception:
                pass

fix_perms('apps')
fix_perms('packages')
print("Permissions fixed successfully!")
