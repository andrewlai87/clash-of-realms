# usage: blender -b --factory-startup --python optimize.py -- in.glb out.glb targetTris texSize
import bpy, sys
a = sys.argv[sys.argv.index("--") + 1:]
src, dst, target, tex = a[0], a[1], int(a[2]), int(a[3])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
for o in list(meshes):
    if not any(m.type == "ARMATURE" for m in o.modifiers):
        print("DROP unskinned", o.name, len(o.data.vertices)); bpy.data.objects.remove(o, do_unlink=True)
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
print("TRIS before", tris, "meshes", len(meshes))
if tris > target * 1.15:
    ratio = target / tris
    for o in meshes:
        if o.data.shape_keys:
            o.shape_key_clear()
        m = o.modifiers.new("dec", "DECIMATE"); m.ratio = ratio
        # decimate must run before the armature
        bpy.context.view_layer.objects.active = o
        while o.modifiers[0].name != "dec":
            bpy.ops.object.modifier_move_up(modifier="dec")
        bpy.ops.object.modifier_apply(modifier="dec")
    print("TRIS after", sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes))
for img in bpy.data.images:
    if img.size[0] > tex:
        img.scale(tex, max(1, int(img.size[1] * tex / img.size[0])))
for act in bpy.data.actions:
    print("ACTION", act.name, tuple(round(f) for f in act.frame_range))
print("ARMATURES", [(o.name, len(o.data.bones)) for o in bpy.data.objects if o.type == "ARMATURE"])
# normalise: 1 unit tall, feet on the ground, centred, measured on the posed mesh
from mathutils import Vector
sc = bpy.context.scene
def bounds(frame):
    sc.frame_set(frame)
    dg = bpy.context.evaluated_depsgraph_get()
    mn = Vector((1e9,) * 3); mx = Vector((-1e9,) * 3)
    for o in bpy.data.objects:
        if o.type != "MESH": continue
        ev = o.evaluated_get(dg); me = ev.to_mesh()
        step = max(1, len(me.vertices) // 3000)
        for vi in range(0, len(me.vertices), step):
            w = ev.matrix_world @ me.vertices[vi].co
            mn = Vector(map(min, mn, w)); mx = Vector(map(max, mx, w))
        ev.to_mesh_clear()
    return mn, mx
f0 = int(min(a.frame_range[0] for a in bpy.data.actions)) if bpy.data.actions else 0
mn, mx = bounds(f0)
print("POSED BOUNDS", [round(v, 2) for v in mn], [round(v, 2) for v in mx])
h = mx.z - mn.z
norm = bpy.data.objects.new("Norm", None); sc.collection.objects.link(norm)
roots = [o for o in bpy.data.objects if o.parent is None and o is not norm]
k = 1.0 / h
norm.scale = (k, k, k)
norm.location = (-(mn.x + mx.x) / 2 * k, -(mn.y + mx.y) / 2 * k, -mn.z * k)
for o in roots:
    o.parent = norm
bpy.context.view_layer.update()
mn2, mx2 = bounds(f0)
print("NORMALISED", [round(v, 2) for v in mn2], [round(v, 2) for v in mx2])
want = dict(filepath=dst, export_format="GLB", export_yup=True, export_animations=True, export_skins=True,
            export_image_format="JPEG", export_image_quality=82, export_jpeg_quality=82,
            export_optimize_animation_size=True, export_morph=False, export_cameras=False, export_lights=False)
props = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
bpy.ops.export_scene.gltf(**{k: v for k, v in want.items() if k in props})
print("DONE", dst)
