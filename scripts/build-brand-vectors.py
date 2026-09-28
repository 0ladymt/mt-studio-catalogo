"""Trace the supplied MT brand artwork into native, transparent vector paths."""
from pathlib import Path
import sys, cv2, numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'assets/brand'
def path(mask,minimum=1):
 contours,_=cv2.findContours(mask.astype('uint8')*255,cv2.RETR_LIST,cv2.CHAIN_APPROX_SIMPLE)
 return ''.join('M'+'L'.join(f'{x},{y}' for x,y in cv2.approxPolyDP(c,.36,True).reshape(-1,2))+'Z' for c in contours if cv2.contourArea(c)>=minimum)
def layer(mask,color,minimum=1):return f'<path fill="{color}" fill-rule="evenodd" d="{path(mask,minimum)}"/>'
def svg(name,w,h,body):
 (OUT/f'{name}.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}"><title>MT Studio — {name}</title>{body}</svg>')
def write(name,im):
 a=np.array(im.convert('RGB')).astype(float);r,g,b=a.transpose(2,0,1);purple=(b>85)&(r>70)&(b-g>28)&(r-g>22);white=(a.min(2)>135)&(a.max(2)-a.min(2)<72)
 svg(name,*im.size,layer(purple,'#A320FF')+(layer(white,'#FFFFFF') if name!='underline' else ''))
for name in ['signature','crown','brush','butterflies','drips']:write(name,Image.open(OUT/f'{name}.png'))
im=Image.open(sys.argv[1]);w,h=im.size
for name,box in {'doodles':(478,1055,824,1270),'sticker':(911,1055,1171,1277),'heart':(551,1062,646,1154),'edge-grunge':(0,0,66,1800)}.items():write(name,im.crop(tuple(round(v*(w/1273 if i%2==0 else h/1800)) for i,v in enumerate(box))))
im=Image.open(OUT/'brush.png');write('underline',im.crop((0,0,im.width,115)))
im=Image.open(OUT/'graffiti-reference.png').convert('RGB');a=np.array(im).astype(float);r,g,b=a.transpose(2,0,1);mask=np.zeros(a.shape[:2],dtype='uint8')
polygons=[[(610,548),(526,340),(319,198),(51,141),(68,320),(138,485),(265,616),(565,637)],[(640,543),(762,300),(985,119),(1162,13),(1207,21),(1189,234),(1149,467),(1013,593),(686,637)],[(614,627),(378,610),(233,589),(154,654),(173,835),(139,1049),(130,1145),(325,1016),(511,819),(617,690)],[(651,625),(825,600),(1040,518),(1112,540),(1068,696),(990,857),(1016,1009),(886,941),(687,729)],[(599,477),(646,471),(661,520),(649,660),(633,824),(612,744),(607,664)]]
cv2.fillPoly(mask,[np.array(p) for p in polygons],1);mask=mask.astype(bool);purple=mask&(b>g*1.12)&(r>g*1.04)&(b>60);white=mask&(a.min(2)>153)&~purple
body='<path fill="none" stroke="#0a090d" stroke-width="12" stroke-linecap="round" d="M614 493Q587 336 494 241Q474 217 486 238M642 481Q694 312 773 228Q793 207 790 236"/>'+layer(mask&(a.max(2)<68),'#09080c',2)
for lo,hi,color in [(0,125,'#592078'),(125,170,'#8b2bb8'),(170,215,'#a320ff'),(215,256,'#d88bff')]:body+=layer(purple&(b>=lo)&(b<hi),color,2)
svg('graffiti',*im.size,body+layer(white,'#e5cee9',2))
svg('wall-grain',240,240,'<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="240" height="240" filter="url(#grain)" opacity=".13"/>')
a=np.array(Image.open(ROOT/'assets/rafa-joy-foto.jpg').convert('RGB'));y,x=np.indices(a.shape[:2]);r,g,b=a.transpose(2,0,1);gaps=(x<190)&(y>175)&(y<375)&(r>170)&(g>140)&(b>180)
outline='M1 347Q9 328 26 306Q50 273 90 246Q110 222 139 199Q151 175 172 161Q185 140 207 123Q226 90 260 68Q283 45 322 34Q373 22 400 41Q420 51 429 82Q468 93 481 143Q492 193 511 222Q531 246 550 266Q570 295 565 321Q575 344 563 370Q576 400 558 427Q572 445 554 464Q568 484 554 510Q574 537 561 558Q569 579 565 598Q585 626 573 650L557 675L539 695H2Z'
svg('portrait-mask',590,695,f'<defs><linearGradient id="edge" x2="0" y2="1"><stop offset=".82" stop-color="white"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient><radialGradient id="side" gradientUnits="userSpaceOnUse" cx="0" cy="620" r="225"><stop stop-color="white" stop-opacity="0"/><stop offset=".4" stop-color="white" stop-opacity=".1"/><stop offset="1" stop-color="white"/></radialGradient><mask id="soft"><rect width="590" height="695" fill="url(#side)"/></mask><clipPath id="hair"><path clip-rule="evenodd" d="M0 0H590V695H0Z{path(gaps,2)}"/></clipPath></defs><path d="{outline}" fill="url(#edge)" mask="url(#soft)" clip-path="url(#hair)"/>')
print('Brand vectors reconstructed from supplied artwork')
