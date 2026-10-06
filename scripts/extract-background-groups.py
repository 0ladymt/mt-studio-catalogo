"""Extract intact ink compositions from approved page art with transparent edges.

Preserves source RGB and relationships between marks; removes the dark surface.
Only the alpha perimeter is softened where a brush meets an internal crop edge.
Run from the repository with Pillow and numpy; originals are never modified.
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
root=Path(__file__).resolve().parents[1]
# Preserve the spatial relationships of the approved source compositions.
groups={
'home-hero':('home',(0,0,360,590)),
'home-butterflies':('home',(590,245,941,1160)),
'home-closing':('home',(0,1010,385,1672)),
'loja-hero':('loja',(0,0,350,620)),
'loja-collection':('loja',(610,965,941,1672)),
'catalogo-hero':('catalogo',(0,0,350,470)),
'catalogo-closing':('catalogo',(615,1230,941,1672)),
'sobre-hero':('sobre',(0,0,340,610)),
'sobre-butterfly':('sobre',(630,280,941,875)),
'sobre-closing':('sobre',(0,960,380,1672)),
'redes-hero':('redes',(0,0,365,605)),
'redes-butterfly':('redes',(630,0,941,825)),
'redes-closing':('redes',(615,970,941,1672)),
'projetos-hero':('projetos',(0,0,445,690)),
'projetos-signature':('projetos',(655,525,941,1200)),
'projetos-closing':('projetos',(570,1280,941,1672)),
}
def extract(page,box):
 src=Image.open(root/'assets/backgrounds'/f'{page}.png').convert('RGB')
 rgb=np.asarray(src.crop(box)).astype(float)
 white=np.clip((rgb.min(2)-76)/65,0,1)
 purple=np.minimum(np.clip((rgb[:,:,2]-48)/55,0,1),np.clip((rgb[:,:,2]-rgb[:,:,1]-24)/30,0,1))
 alpha=np.maximum(white,purple)
 # Fade only ink cut by a new crop boundary, not the original artwork edges.
 # Avoid abrupt horizontal/vertical ends of a brush crossing the crop boundary.
 h,w=alpha.shape; feather=48
 for axis,edge in [(1,0),(1,1),(0,0),(0,1)]:
  xy=0 if axis==1 else 1
  coordinate=box[xy] if edge==0 else box[xy+2]
  original_edge=0 if edge==0 else src.size[xy]
  # Keep only the side that was originally flush with the outside page edge.
  if axis==1 and coordinate==original_edge:continue
  n=w if axis==1 else h
  t=np.clip((np.arange(n) if edge==0 else np.arange(n)[::-1])/feather,0,1)
  t=t*t*(3-2*t)
  alpha*=t[None,:] if axis==1 else t[:,None]
 rgba=np.dstack((rgb.astype('uint8'),np.round(alpha*255).astype('uint8')))
 return Image.fromarray(rgba)
target=root/'assets/backgrounds/groups';target.mkdir(exist_ok=True)
for name,(page,box) in groups.items():
 out=extract(page,box);out.save(target/f'{name}.png');print(name,out.size)
