"""Re-render catalogue geometry on one neutral studio background.
Requirements: numpy, moderngl, Pillow; OpenGL via EGL. Does not modify models.
"""
import json, math
from io import BytesIO
from pathlib import Path
import numpy as np
import moderngl
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
ctx=moderngl.create_standalone_context(backend='egl')
ctx.enable(moderngl.DEPTH_TEST)
program=ctx.program(vertex_shader='''#version 330
in vec3 position; in vec3 normal; uniform mat4 mvp; uniform mat3 rotation;
out vec3 n;
void main(){n=rotation*normal;gl_Position=mvp*vec4(position,1.0);}
''',fragment_shader='''#version 330
in vec3 n;out vec4 frag;
void main(){vec3 norm=normalize(n);if(!gl_FrontFacing)norm=-norm;
float key=max(dot(norm,normalize(vec3(3.,4.,5.))),0.);
float fill=max(dot(norm,normalize(vec3(-3.,1.,2.))),0.);
float top=max(norm.y,0.);
float light=.36+.46*key+.13*fill+.06*top;
vec3 color=vec3(.82,.82,.83)*light;
frag=vec4(pow(color,vec3(1./2.2)),1.);
}''')
fbo=ctx.simple_framebuffer((512,512));fbo.use()

def load_obj(path):
    verts=[];faces=[]
    for line in path.read_text().splitlines():
        if line.startswith('v '):verts.append([float(v) for v in line.split()[1:4]])
        elif line.startswith('f '):
            ids=[int(s.split('/')[0]) for s in line.split()[1:]]
            ids=[i-1 if i>0 else len(verts)+i for i in ids]
            for i in range(1,len(ids)-1):faces.append([ids[0],ids[i],ids[i+1]])
    v=np.asarray(verts,dtype='f4');f=np.asarray(faces,dtype='i4')
    center=(v.min(0)+v.max(0))/2;v-=center
    a=v[f[:,1]]-v[f[:,0]];b=v[f[:,2]]-v[f[:,0]]
    fn=np.cross(a,b);unit=fn/np.maximum(np.linalg.norm(fn,axis=1,keepdims=True),1e-12)
    corners=v[f].reshape(-1,3);epsilon=max(float(np.ptp(v,axis=0).max()),1e-6)*1e-5
    _,ids=np.unique(np.floor(corners/epsilon+.5).astype('i8'),axis=0,return_inverse=True)
    order=np.argsort(ids);groups=np.split(order,np.flatnonzero(np.diff(ids[order]))+1);norm=np.zeros_like(corners)
    for group in groups:
        fi=group//3;allowed=(unit[fi]@unit[fi].T)>=math.cos(math.radians(65))
        n=allowed.astype('f4')@fn[fi];norm[group]=n/np.maximum(np.linalg.norm(n,axis=1,keepdims=True),1e-12)

    return v,f,norm

if __name__=='__main__':
    items=json.loads((ROOT/'catalogo.json').read_text())
    results=[]
    for num,item in enumerate(items):
        v,f,n=load_obj(ROOT/item['obj']);radius=float(np.linalg.norm((v.max(0)-v.min(0))/2));radius=max(radius,1e-6)
        # Circumscribed sphere remains in view for every rotation, at 14% margin.
        distance=radius/math.sin(math.radians(18))*1.14
        angle=.16;c,s=math.cos(angle),math.sin(angle)
        rot=np.array([[c,0,s],[0,1,0],[-s,0,c]],dtype='f4');model=np.eye(4,dtype='f4');model[:3,:3]=rot
        view=np.eye(4,dtype='f4');view[2,3]=-distance
        near=radius/1000;far=distance+radius*10;t=1/math.tan(math.radians(18))
        proj=np.array([[t,0,0,0],[0,t,0,0],[0,0,(far+near)/(near-far),2*far*near/(near-far)],[0,0,-1,0]],dtype='f4')
        data=np.column_stack([v[f].reshape(-1,3),n]).astype('f4')
        vbo=ctx.buffer(data.tobytes());vao=ctx.vertex_array(program,[(vbo,'3f 3f','position','normal')])
        program['mvp'].write((proj@view@model).T.tobytes());program['rotation'].write(rot.T.tobytes())
        fbo.clear(39/255,39/255,46/255,1);vao.render()
        image=Image.frombytes('RGB',(512,512),fbo.read(components=3)).transpose(Image.Transpose.FLIP_TOP_BOTTOM)
        # Validate encoded bytes and publish atomically; never truncate a valid preview.
        output=BytesIO();image.save(output,format='PNG',optimize=True)
        encoded=output.getvalue()
        with Image.open(BytesIO(encoded)) as check:
            check.load()
            if check.size!=(512,512):raise RuntimeError('Invalid preview dimensions')
        target=ROOT/item['preview'];temporary=target.with_suffix('.png.tmp')
        temporary.write_bytes(encoded)
        if temporary.read_bytes()!=encoded:raise RuntimeError(f'Incomplete preview write: {target}')
        temporary.replace(target)
        with Image.open(target) as check:check.verify()
        vao.release();vbo.release()
        # Project actual vertices through many orientations and portrait/landscape aspects.
        worst=0
        for aspect in [.42,.7,1,1.8,2.6]:
            half=min(math.radians(18),math.atan(math.tan(math.radians(18))*aspect))
            dist=radius/math.sin(half)*1.14
            for yaw in np.linspace(0,2*math.pi,24):
                co,si=math.cos(yaw),math.sin(yaw);rotation=np.array([[co,0,si],[0,1,0],[-si,0,co]])
                q=v@rotation.T;depth=dist-q[:,2]
                xx=np.abs(q[:,0]/depth*t/aspect);yy=np.abs(q[:,1]/depth*t)
                worst=max(worst,float(max(xx.max(),yy.max())))
        if worst>=1:raise RuntimeError(f"Clipped {item['id']} {worst}")
        results.append({'id':item['id'],'radius':radius,'max_ndc':round(worst,5)})
        if (num+1)%60==0:print(f'{num+1}/{len(items)} rendered and geometry checked',flush=True)
    (ROOT/'scripts'/'preview-validation.json').write_text(json.dumps({'models':len(results),'aspects':[.42,.7,1,1.8,2.6],'rotations_per_aspect':24,'worst_ndc':max(r['max_ndc'] for r in results),'results':results},indent=2))
