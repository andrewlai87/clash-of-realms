# usage: blender -b --factory-startup --python static.py -- in.glb out.glb texSize [pivotZfrac]
# Normalises a static model: 1 unit tall, centred in X/Y. With pivotZfrac the
# origin is placed at that fraction of the height (for attachments); default feet.
import bpy, sys
from mathutils import Vector
a = sys.argv[sys.argv.index("--") + 1:]
src, dst, tex = a[0], a[1], int(a[2]); piv = float(a[3]) if len(a) > 3 else 0.0
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
for o in list(bpy.data.objects):
    if o.type == "MESH" and o.name.startswith("Icosphere"): bpy.data.objects.remove(o, do_unlink=True)
mn = Vector((1e9,)*3); mx = Vector((-1e9,)*3)
for o in bpy.data.objects:
    if o.type != "MESH": continue
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c); mn = Vector(map(min, mn, w)); mx = Vector(map(max, mx, w))
print("BOUNDS", [round(v,2) for v in mn], [round(v,2) for v in mx], "tris", sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in bpy.data.objects if o.type=="MESH"))
h = mx.z - mn.z; k = 1.0 / h
norm = bpy.data.objects.new("Norm", None); bpy.context.scene.collection.objects.link(norm)
for o in [o for o in bpy.data.objects if o.parent is None and o is not norm]: o.parent = norm
norm.scale = (k, k, k)
norm.location = (-(mn.x+mx.x)/2*k, -(mn.y+mx.y)/2*k, -(mn.z + h*piv)*k)
for img in bpy.data.images:
    if img.size[0] > tex: img.scale(tex, max(1, int(img.size[1]*tex/img.size[0])))
want = dict(filepath=dst, export_format="GLB", export_yup=True, export_animations=False,
            export_image_format="AUTO", export_morph=False, export_cameras=False, export_lights=False)
props = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
bpy.ops.export_scene.gltf(**{k2: v for k2, v in want.items() if k2 in props})
print("DONE", dst)
