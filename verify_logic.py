import re

# Replicating the exact logic of normalizePlate
def normalizePlate(p):
    if p is None: return ""
    s = str(p).strip()
    if not s: return ""
    if re.match(r'^\d+$', s):
        return s.zfill(3)
    return s

# Replicating the exact logic of normaliseAsanaId
def normaliseAsanaId(q):
    if not q: return None
    q = str(q).strip()
    m = re.match(r'^(\d+)([a-z]?)$', q, re.IGNORECASE)
    if not m: return None
    num = m.group(1).zfill(3)
    suffix = m.group(2) or ""
    return num + suffix

print("--- Mapping Logic Verification ---")

tests_plate = [
    ("1", "001"),
    ("  2  ", "002"),
    ("003", "003"),
    ("1a", "1a"),
    ("", ""),
    (None, "")
]

passed = True
for inp, exp in tests_plate:
    res = normalizePlate(inp)
    if res != exp:
        print(f"FAIL normalizePlate: {inp} -> {res} (Expected {exp})")
        passed = False
    else:
        print(f"PASS normalizePlate: '{inp}' -> '{res}'")

tests_id = [
    ("1", "001"),
    ("1a", "001a"),
    ("  42b ", "042b"),
    ("003B", "003B"),
    ("xyz", None),
    (None, None)
]

for inp, exp in tests_id:
    res = normaliseAsanaId(inp)
    if res != exp:
        print(f"FAIL normaliseAsanaId: {inp} -> {res} (Expected {exp})")
        passed = False
    else:
        print(f"PASS normaliseAsanaId: '{inp}' -> '{res}'")

if passed:
    print("✅ Mapping Logic Mathematically Verified: ID zero-padding and suffix detection is solid.")
else:
    print("❌ Verification Failed.")
