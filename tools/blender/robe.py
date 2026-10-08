# Royal robe variant of gown.py (crimson velvet, gold trim, ankle length).
# Builds a fitted gown on a Mixamo character: rings lofted around the body's
# own cross-sections (torso + both legs), skinned by transferring the body's
# weights. usage: blender -b --factory-startup --python gown.py -- in.fbx out.glb [preview.png]
import bpy, sys, math, bmesh
from mathutils import Vector
a = sys.argv[sys.argv.index("--") + 1:]
src, dst = a[0], a[1]; preview = a[2] if len(a) > 2 else None
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=src)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
for act in list(bpy.data.actions): bpy.data.actions.remove(act)

def bone_z(name):
    return (arm.matrix_world @ arm.data.bones["mixamorig:" + name].head_local)
hips = bone_z("Hips"); neck = bone_z("Neck"); foot = bone_z("LeftFoot"); head = bone_z("Head")
H = head.z * 1.08
print("H", round(H, 3), "hips", round(hips.z, 3), "neck", round(neck.z, 3), "foot", round(foot.z, 3))

toe = bone_z("LeftToeBase")
FRONT = 1.0 if toe.y > foot.y else -1.0          # which way she faces along Y
torso = neck.z - hips.z
zc = hips.z + 0.60 * torso; span = 0.30 * torso
d0 = 0.046 * H
moved = 0
for o in meshes:
    names = {g.index: g.name.replace("mixamorig:", "") for g in o.vertex_groups}
    inv = o.matrix_world.inverted()
    if o.data.shape_keys: o.shape_key_clear()
    for v in o.data.vertices:
        if not v.groups: continue
        g = max(v.groups, key=lambda e: e.weight)
        if names.get(g.group, "") not in ("Spine", "Spine1", "Spine2"): continue
        w = o.matrix_world @ v.co
        bell = max(0.0, 1.0 - ((w.z - zc) / span) ** 2)
        f = (w.y - hips.y) * FRONT
        if bell <= 0 or f <= d0: continue
        f2 = d0 + (f - d0) * (1.0 - 0.0 * bell)
        w.y = hips.y + f2 * FRONT
        v.co = inv @ w; moved += 1
print("bust verts moved", moved, "front", FRONT)

KEEP = ("Hips", "Spine", "Spine1", "Spine2", "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg", "LeftShoulder", "RightShoulder", "Neck")
pts = []
for o in meshes:
    names = {g.index: g.name.replace("mixamorig:", "") for g in o.vertex_groups}
    for v in o.data.vertices:
        if not v.groups: continue
        g = max(v.groups, key=lambda e: e.weight)
        n = names.get(g.group, "")
        if n not in KEEP: continue
        w = o.matrix_world @ v.co
        if n in ("LeftShoulder", "RightShoulder", "Neck") and abs(w.x - hips.x) > 0.078 * H: continue
        if w.z > hips.z + 0.05 * H and abs(w.x - hips.x) > 0.092 * H: continue     # ignore pauldrons and arm plates
        pts.append(w)
print("body points", len(pts))

def hull(points):
    p = sorted(set((round(x, 5), round(y, 5)) for x, y in points))
    if len(p) < 3: return p
    def cross(o, a, b): return (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0])
    lo = []
    for q in p:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], q) <= 0: lo.pop()
        lo.append(q)
    up = []
    for q in reversed(p):
        while len(up) >= 2 and cross(up[-2], up[-1], q) <= 0: up.pop()
        up.append(q)
    return lo[:-1] + up[:-1]

def ray_radius(poly, c, ang):
    d = (math.cos(ang), math.sin(ang)); best = None
    n = len(poly)
    for i in range(n):
        ax, ay = poly[i][0]-c[0], poly[i][1]-c[1]; bx, by = poly[(i+1) % n][0]-c[0], poly[(i+1) % n][1]-c[1]
        ex, ey = bx-ax, by-ay
        den = d[0]*ey - d[1]*ex
        if abs(den) < 1e-12: continue
        t = (ax*ey - ay*ex) / den; u = (ax*d[1] - ay*d[0]) / den
        if t > 0 and -1e-9 <= u <= 1+1e-9: best = t if best is None else max(best, t)
    return best

z_top = neck.z - 0.012 * H
z_bot = foot.z + 0.035 * H    # ankle-length: he walks
NR, NS = 54, 48
rings = []
for i in range(NR):
    z = z_top + (z_bot - z_top) * i / (NR - 1)
    slab = 0.022 * H
    sl = [(p.x, p.y) for p in pts if abs(p.z - z) < slab]
    if len(sl) < 6: rings.append(None); continue
    hl = hull(sl)
    cx = sum(q[0] for q in hl) / len(hl); cy = sum(q[1] for q in hl) / len(hl)
    rr = [ray_radius(hl, (cx, cy), 2 * math.pi * k / NS) or 0.05 * H for k in range(NS)]
    rings.append([z, cx, cy, rr])
# fill gaps, then smooth along the height so armour plates don't make ridges
last = None
for i in range(NR):
    if rings[i] is None: rings[i] = [z_top + (z_bot - z_top) * i / (NR - 1)] + last[1:]
    last = rings[i]
for _ in range(2):
    new = []
    for i in range(NR):
        lo, hi = rings[max(0, i-1)], rings[min(NR-1, i+1)]
        rr = [(lo[3][k] + 2 * rings[i][3][k] + hi[3][k]) / 4 for k in range(NS)]
        new.append([rings[i][0], (lo[1] + 2*rings[i][1] + hi[1]) / 4, (lo[2] + 2*rings[i][2] + hi[2]) / 4, rr])
    rings = new
off = 0.008 * H
verts = []; 
for i, (z, cx, cy, rr) in enumerate(rings):
    t = i / (NR - 1)
    # fitted to the waist, then an A-line skirt that opens out and falls in folds
    sk = 0.0 if z > hips.z else (hips.z - z) / (hips.z - z_bot)
    if sk > 0:
        # below the hips the skirt hangs from the hip line; it no longer hugs the legs
        if "hipring" not in globals():
            globals()["hipring"] = (cx, cy, list(rr))
        cx, cy, hr_ = globals()["hipring"]
        mean = sum(hr_) / NS
    for k in range(NS):
        ang = 2 * math.pi * k / NS
        base = rr[k] if sk == 0 else hr_[k] + (mean - hr_[k]) * min(1.0, 2.5 * sk)
        r = (base + off * 2.2) * (1 + 1.15 * sk ** 0.9)
        r *= 1 + 0.07 * sk * math.sin(ang * 9 + 1.3) + 0.03 * sk * math.sin(ang * 17 + 0.4)
        verts.append((cx + math.cos(ang) * r, cy + math.sin(ang) * r, z))
faces = []
for i in range(NR - 1):
    for k in range(NS):
        a0 = i * NS + k; a1 = i * NS + (k + 1) % NS
        faces.append((a0, a1, a1 + NS, a0 + NS))
me = bpy.data.meshes.new("Gown"); me.from_pydata(verts, [], faces); me.update()
gown = bpy.data.objects.new("Gown", me); bpy.context.scene.collection.objects.link(gown)
for p in me.polygons: p.use_smooth = True
cloth = bpy.data.materials.new("GownCloth"); cloth.use_nodes = True
b = cloth.node_tree.nodes["Principled BSDF"]; b.inputs["Base Color"].default_value = (0.20, 0.012, 0.03, 1); b.inputs["Roughness"].default_value = 0.5
gold = bpy.data.materials.new("GownGold"); gold.use_nodes = True
b = gold.node_tree.nodes["Principled BSDF"]; b.inputs["Base Color"].default_value = (0.83, 0.62, 0.22, 1); b.inputs["Roughness"].default_value = 0.32; b.inputs["Metallic"].default_value = 1.0
me.materials.append(cloth); me.materials.append(gold)
waist = min(range(NR), key=lambda i: abs(rings[i][0] - (hips.z + 0.035 * H)))
for p in me.polygons:
    ring = p.index // NS
    col = p.index % NS
    ang = 2 * math.pi * (col + 0.5) / NS
    front = abs(math.atan2(math.sin(ang - (math.pi / 2 if FRONT > 0 else -math.pi / 2)), math.cos(ang - (math.pi / 2 if FRONT > 0 else -math.pi / 2))))
    if ring <= 1 or ring >= NR - 3 or ring in (waist, waist + 1) or (0.16 < front < 0.30): p.material_index = 1
# make sure normals face outward
bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()

# skin it: copy weights from the nearest point on the body
body = max(meshes, key=lambda o: len(o.data.vertices))
bpy.ops.object.select_all(action="DESELECT")
if len(meshes) > 1:
    dup = []
    for o in meshes:
        d = o.copy(); d.data = o.data.copy(); bpy.context.scene.collection.objects.link(d); dup.append(d)
    for d in dup: d.select_set(True)
    bpy.context.view_layer.objects.active = dup[0]; bpy.ops.object.join(); srcobj = dup[0]
else:
    srcobj = body
bpy.ops.object.select_all(action="DESELECT")
gown.select_set(True); bpy.context.view_layer.objects.active = gown
m = gown.modifiers.new("dt", "DATA_TRANSFER"); m.object = srcobj
m.use_vert_data = True; m.data_types_verts = {"VGROUP_WEIGHTS"}; m.vert_mapping = "POLYINTERP_NEAREST"
bpy.ops.object.datalayout_transfer(modifier="dt"); bpy.ops.object.modifier_apply(modifier="dt")
if srcobj is not body: bpy.data.objects.remove(srcobj, do_unlink=True)
# The skirt hangs from the hips as one piece instead of following each leg,
# so it keeps a clean shape while he strides underneath it.
hg = gown.vertex_groups.get("mixamorig:Hips") or gown.vertex_groups.new(name="mixamorig:Hips")
for v in gown.data.vertices:
    z = (gown.matrix_world @ v.co).z
    t_ = min(1.0, max(0.0, (hips.z - z) / (0.07 * H)))
    if t_ <= 0: continue
    for g_ in v.groups:
        if g_.group != hg.index: gown.vertex_groups[g_.group].add([v.index], g_.weight * (1 - t_), "REPLACE")
    hg.add([v.index], 1.0 if t_ >= 1 else max(t_, 0.01), "ADD")
gown.parent = arm; gown.matrix_parent_inverse = arm.matrix_world.inverted()
am = gown.modifiers.new("Armature", "ARMATURE"); am.object = arm
print("GOWN verts", len(me.vertices), "groups", len(gown.vertex_groups))


for mat in bpy.data.materials:
    if not mat.use_nodes: continue
    for node in mat.node_tree.nodes:
        if node.type == "BSDF_PRINCIPLED":
            al = node.inputs.get("Alpha")
            if al is not None:
                for l in list(al.links): mat.node_tree.links.remove(l)
                al.default_value = 1.0
for img in bpy.data.images:
    if img.size[0] > 1024: img.scale(1024, 1024)

if preview:
    sc = bpy.context.scene
    bpy.ops.object.light_add(type="SUN", location=(0, -3, 5)); bpy.context.object.data.energy = 3
    for i, (px, py) in enumerate([(1.6, -3.2), (-2.4, 2.6)]):
        bpy.ops.object.camera_add(location=(px, py, H * 0.62)); cam = bpy.context.object
        cam.rotation_euler = (Vector((0, 0, H * 0.5)) - cam.location).to_track_quat("-Z", "Y").to_euler()
        sc.camera = cam; sc.render.engine = "BLENDER_WORKBENCH"; sc.display.shading.color_type = "TEXTURE"
        sc.render.resolution_x = 520; sc.render.resolution_y = 640
        sc.render.filepath = preview.replace(".png", "_%d.png" % i); bpy.ops.render.render(write_still=True)
        bpy.data.objects.remove(cam, do_unlink=True)
    for o in list(bpy.data.objects):
        if o.type == "LIGHT": bpy.data.objects.remove(o, do_unlink=True)

want = dict(filepath=dst, export_format="GLB", export_yup=True, export_animations=False, export_skins=True,
            export_image_format="JPEG", export_image_quality=85, export_jpeg_quality=85,
            export_morph=False, export_cameras=False, export_lights=False)
props = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
bpy.ops.export_scene.gltf(**{k: v for k, v in want.items() if k in props})
print("DONE", dst)
