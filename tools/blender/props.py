# Lifts the Paladin's sword and shield out of his FBX as two static meshes,
# each expressed in the local space of the bone that carries it, so they can
# be parented to the same bone on any Mixamo character.
# usage: blender -b --factory-startup --python props.py -- paladin.fbx out.glb
import bpy, sys
from mathutils import Vector
a = sys.argv[sys.argv.index("--") + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=a[0])
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
out = []
for o in [o for o in bpy.data.objects if o.type == "MESH"]:
    tally = {}
    for v in o.data.vertices:
        for g in v.groups:
            n = o.vertex_groups[g.group].name
            tally[n] = tally.get(n, 0) + g.weight
    top = max(tally, key=tally.get)
    share = tally[top] / sum(tally.values())
    print("MESH", o.name, "verts", len(o.data.vertices), "bone", top, "share", round(share, 2), "dims", [round(d, 2) for d in o.dimensions])
    if share < 0.95: continue                      # the body is spread over many bones
    if "Sword_joint" in top: kind = "sword"
    elif "Shield_joint" in top: kind = "shield"
    else: continue
    bone = arm.data.bones[top].parent           # the standard hand/forearm bone that carries it
    inv = (arm.matrix_world @ bone.matrix_local).inverted()
    me = o.data.copy()
    me.transform(inv @ o.matrix_world)
    p = bpy.data.objects.new(kind, me)
    bpy.context.scene.collection.objects.link(p)
    out.append(p)
    print("PROP", kind, "on", bone.name, "size", [round(d, 1) for d in p.dimensions])
print("HIPLEN", round((arm.matrix_world @ arm.data.bones["mixamorig:Hips"].head_local).z * 100, 1))
for o in list(bpy.data.objects):
    if o not in out: bpy.data.objects.remove(o, do_unlink=True)
for img in bpy.data.images:
    if img.size[0] > 512: img.scale(512, 512)
for mat in bpy.data.materials:
    if not mat.use_nodes: continue
    for node in mat.node_tree.nodes:
        if node.type == "BSDF_PRINCIPLED":
            al = node.inputs.get("Alpha")
            if al is not None:
                for l in list(al.links): mat.node_tree.links.remove(l)
                al.default_value = 1.0
bpy.ops.export_scene.gltf(filepath=a[1], export_format="GLB", export_yup=False, export_animations=False,
                          export_image_format="JPEG", export_cameras=False, export_lights=False)
print("DONE", a[1])
