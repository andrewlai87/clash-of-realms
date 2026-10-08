# Adds a modest high-necked bodice to the Nyx sculpt, then normalises it
# (1 unit tall, feet at origin). usage: blender -b --factory-startup --python nyx_cover.py -- in.glb out.glb [preview.png] [probe]
import bpy, sys, math, bmesh
from mathutils import Vector
a = sys.argv[sys.argv.index("--") + 1:]
src, dst = a[0], a[1]; preview = a[2] if len(a) > 2 else None; probe = len(a) > 3
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
for o in list(bpy.data.objects):
    if o.type == "MESH" and o.name.startswith("Icosphere"): bpy.data.objects.remove(o, do_unlink=True)
body = max((o for o in bpy.data.objects if o.type == "MESH"), key=lambda o: len(o.data.vertices))
W = [body.matrix_world @ v.co for v in body.data.vertices]
mn = Vector((min(p.x for p in W), min(p.y for p in W), min(p.z for p in W)))
mx = Vector((max(p.x for p in W), max(p.y for p in W), max(p.z for p in W)))
H = mx.z - mn.z
print("BOUNDS", [round(v, 3) for v in mn], [round(v, 3) for v in mx])
if probe:
    for f in (0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9):
        z = mn.z + H * f
        sl = [p for p in W if abs(p.z - z) < 0.012 * H]
        if sl: print("SLICE %.2f n=%d x[%.2f,%.2f] y[%.2f,%.2f]" % (f, len(sl), min(p.x for p in sl), max(p.x for p in sl), min(p.y for p in sl), max(p.y for p in sl)))

def render(tag):
    sc = bpy.context.scene
    bpy.ops.object.light_add(type="SUN", location=(0, -3, 5)); sun = bpy.context.object; sun.data.energy = 3
    ctr = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z + H * 0.74))
    for i, (dx, dy) in enumerate([(0, -1), (0.8, -0.6), (-0.8, -0.6), (0, 1)]):
        bpy.ops.object.camera_add(location=(ctr.x + dx * H * 1.0, ctr.y + dy * H * 1.0, ctr.z + H * 0.05)); cam = bpy.context.object
        cam.rotation_euler = (ctr - cam.location).to_track_quat("-Z", "Y").to_euler()
        cam.data.clip_start = 0.01
        sc.camera = cam; sc.render.engine = "BLENDER_WORKBENCH"; sc.display.shading.color_type = "TEXTURE"
        sc.render.resolution_x = 520; sc.render.resolution_y = 520
        sc.render.filepath = preview.replace(".png", "_%s%d.png" % (tag, i)); bpy.ops.render.render(write_still=True)
        bpy.data.objects.remove(cam, do_unlink=True)
    bpy.data.objects.remove(sun, do_unlink=True)

if probe and preview:
    render("probe")
    sys.exit(0)

# ---- the cover-up: her gown's dark cloth is extended up to a high collar by
# repainting the sculpt's own surface, so it fits every curve exactly ----
import numpy as np
cx, cy = 0.085, 0.0
z_lo, z_hi = mn.z + 0.50 * H, mn.z + 0.828 * H
me = body.data

# soften the bust on the sculpt itself
zc = mn.z + 0.725 * H; span = 0.065 * H; d0 = 0.08
inv = body.matrix_world.inverted(); moved = 0
for v in me.vertices:
    w = body.matrix_world @ v.co
    if abs(w.x - cx) > 0.2: continue
    bell = max(0.0, 1.0 - ((w.z - zc) / span) ** 2)
    f = cy - w.y                               # she faces -Y
    if bell <= 0 or f <= d0: continue
    w.y = cy - (d0 + (f - d0) * (1.0 - 0.8 * bell))
    v.co = inv @ w; moved += 1
print("bust verts moved", moved)

mat = me.materials[0]
tex = next(n for n in mat.node_tree.nodes if n.type == "TEX_IMAGE" and any(l.to_socket.name == "Base Color" for l in n.outputs[0].links))
img = tex.image
TW, TH = img.size
px = np.array(img.pixels[:], dtype=np.float32).reshape(TH, TW, 4)
cloth = np.array([0.030, 0.027, 0.045], dtype=np.float32)
trim = np.array([0.42, 0.36, 0.62], dtype=np.float32)
me.calc_loop_triangles()
uvl = me.uv_layers.active.data
Wv = [body.matrix_world @ v.co for v in me.vertices]
painted = 0
for t in me.loop_triangles:
    p = [Wv[i] for i in t.vertices]
    c = (p[0] + p[1] + p[2]) / 3
    if not (z_lo - 0.02 * H < c.z < z_hi + 0.02 * H): continue
    if not (-0.30 < c.x - cx < 0.62) or c.y > cy + 0.17: continue
    uv = np.array([[uvl[l].uv.x * TW, uvl[l].uv.y * TH] for l in t.loops], dtype=np.float32)
    x0, y0 = np.floor(uv.min(0)).astype(int) - 1; x1, y1 = np.ceil(uv.max(0)).astype(int) + 1
    x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, TW - 1), min(y1, TH - 1)
    if x1 < x0 or y1 < y0: continue
    gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
    d = (uv[1, 1] - uv[2, 1]) * (uv[0, 0] - uv[2, 0]) + (uv[2, 0] - uv[1, 0]) * (uv[0, 1] - uv[2, 1])
    if abs(d) < 1e-9: continue
    b0 = ((uv[1, 1] - uv[2, 1]) * (gx - uv[2, 0]) + (uv[2, 0] - uv[1, 0]) * (gy - uv[2, 1])) / d
    b1 = ((uv[2, 1] - uv[0, 1]) * (gx - uv[2, 0]) + (uv[0, 0] - uv[2, 0]) * (gy - uv[2, 1])) / d
    b2 = 1 - b0 - b1
    e = -0.6 / max(1.0, abs(d) ** 0.5)                 # bleed a little past the edges to hide seams
    z = b0 * p[0].z + b1 * p[1].z + b2 * p[2].z
    x = b0 * p[0].x + b1 * p[1].x + b2 * p[2].x - cx
    # the allowed width narrows from the shoulders up to the neck, so her
    # hair and raised hand are left alone
    up = np.clip((z - (mn.z + 0.765 * H)) / (0.05 * H), 0.0, 1.0)
    left = -0.30 + (0.30 - 0.085) * up
    right = 0.62 - (0.62 - 0.085) * up
    inside = (b0 >= e) & (b1 >= e) & (b2 >= e) & (z > z_lo) & (z < z_hi) & (x > left) & (x < right)
    if not inside.any(): continue
    sub = px[y0:y1 + 1, x0:x1 + 1, :3]
    lum = sub @ np.array([0.3, 0.59, 0.11], dtype=np.float32)
    new = cloth[None, None, :] * (0.7 + 1.6 * lum[..., None])
    band = inside & (z > z_hi - 0.014 * H)
    new[band] = trim * (0.6 + 0.6 * lum[band][..., None])
    sub[inside] = new[inside]
    painted += int(inside.sum())
print("texels painted", painted, "of", TW * TH)
img.pixels = px.ravel().tolist(); img.update(); img.pack()

if preview: render("after")

norm = bpy.data.objects.new("Norm", None); bpy.context.scene.collection.objects.link(norm)
for o in [o for o in bpy.data.objects if o.parent is None and o is not norm]: o.parent = norm
k = 1.0 / H
norm.scale = (k, k, k); norm.location = (-(mn.x + mx.x) / 2 * k, -(mn.y + mx.y) / 2 * k, -mn.z * k)
for im in bpy.data.images:
    if im.size[0] > 1024: im.scale(1024, max(1, int(im.size[1] * 1024 / im.size[0])))
want = dict(filepath=dst, export_format="GLB", export_yup=True, export_animations=False,
            export_image_format="AUTO", export_morph=False, export_cameras=False, export_lights=False)
props = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
bpy.ops.export_scene.gltf(**{k2: v for k2, v in want.items() if k2 in props})
print("DONE", dst)
