# usage: blender -b --factory-startup --python convert.py -- <in.fbx> <out.glb> <char|anim> [clipName]
import bpy, sys
args = sys.argv[sys.argv.index("--") + 1:]
src, dst, mode = args[0], args[1], args[2]
clip = args[3] if len(args) > 3 else "Clip"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=src)

if mode == "char":
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        for node in mat.node_tree.nodes:
            if node.type == "BSDF_PRINCIPLED":
                a = node.inputs.get("Alpha")
                if a is not None:
                    for l in list(a.links):
                        mat.node_tree.links.remove(l)
                    a.default_value = 1.0
                print("MAT", mat.name, {i.name: (i.links[0].from_node.type if i.links else None)
                                         for i in node.inputs if i.links})
    for img in bpy.data.images:
        if img.size[0] > 1024:
            img.scale(1024, 1024)
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
else:
    for o in list(bpy.data.objects):
        if o.type == "MESH":
            bpy.data.objects.remove(o, do_unlink=True)
    for a in bpy.data.actions:
        a.name = clip

want = dict(
    filepath=dst, export_format="GLB", export_yup=True,
    export_animations=(mode == "anim"), export_skins=True,
    export_image_format="JPEG", export_image_quality=85, export_jpeg_quality=85,
    export_force_sampling=True, export_optimize_animation_size=True,
    export_animation_mode="ACTIONS", export_nla_strips=False,
    export_morph=False, export_cameras=False, export_lights=False,
)
props = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
kw = {k: v for k, v in want.items() if k in props}
print("EXPORT KW", sorted(kw))
bpy.ops.export_scene.gltf(**kw)
print("DONE", dst)
