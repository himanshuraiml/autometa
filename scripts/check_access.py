import os

for p in ['apps', 'apps/web', 'apps/web/src', 'apps/web/src/App.tsx', 'apps/desktop/package.json']:
    print(p, "exists:", os.path.exists(p), "readable:", os.access(p, os.R_OK), "writable:", os.access(p, os.W_OK))
