import subprocess
import sys

res = subprocess.run(['git'] + sys.argv[1:], capture_output=True, text=True)
print("STDOUT:", res.stdout)
print("STDERR:", res.stderr)
print("CODE:", res.returncode)
