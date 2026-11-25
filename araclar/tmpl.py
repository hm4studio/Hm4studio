# Albüm AR şablonu: 30x30 kapalı albüm, sırt solda. kumaş UV'leri metre cinsinden (sunucu doku boyuna böler).
import numpy as np, json
from lib3d import *
W=0.30; TB=0.0032; PG=0.018; H=2*TB+PG; R=H/2; OV=0.003
x0,x1,z0,z1=-W/2,W/2,-W/2,W/2; xs=x0+R
mf=Mesh('kumas'); ms=Mesh('sayfa'); my=Mesh('yaldiz'); mp=Mesh('foto')
rad={'x1z1':0.004,'x1z0':0.004}
slab(mf,mf,mf,xs,x1,z0,z1,0,TB,rad,uvrect=(0,1,1,0),side_tile=1)
slab(mf,mf,mf,xs,x1,z0,z1,TB+PG,H,rad,uvrect=(0,1,1,0),side_tile=1)
seg=16; cx,cy=xs,R; ids=[]
for k in range(seg+1):
  a=np.radians(90+180*k/seg); nrm=[np.cos(a),np.sin(a),0]; p=[cx+R*np.cos(a),cy+R*np.sin(a)]
  s=np.pi*R*k/seg
  ids.append((mf.v([p[0],p[1],z1],nrm,[s,z1]),mf.v([p[0],p[1],z0],nrm,[s,z0])))
for k in range(seg): mf.quad(ids[k][0],ids[k+1][0],ids[k+1][1],ids[k][1])
for zz,nn in ((z1,[0,0,1]),(z0,[0,0,-1])):
  c=mf.v([cx,cy,zz],nn,[cx,cy]); ring=[mf.v([cx+R*np.cos(np.radians(90+180*k/seg)),cy+R*np.sin(np.radians(90+180*k/seg)),zz],nn,[cx+R*np.cos(np.radians(90+180*k/seg)),cy+R*np.sin(np.radians(90+180*k/seg))]) for k in range(seg+1)]
  for k in range(seg): mf.tri(c,ring[k],ring[k+1])
box_sides(ms,xs,x1-OV,TB,TB+PG,z0+OV,z1-OV,['xp','zp','zm'],tile=1.0)
# yaldız: kapağın üstünde ince düzlem; UV USD düzeninde (v yukarı: kapağın üst kenarı v=1)
yy=H+0.0003; a=xs+0.004; b=x1-0.004
q=[my.v([a,yy,z0],[0,1,0],[0,1]),my.v([b,yy,z0],[0,1,0],[1,1]),my.v([b,yy,z1],[0,1,0],[1,0]),my.v([a,yy,z1],[0,1,0],[0,0])]
my.quad(*q)
yy=H+0.0001
q=[mp.v([a,yy,z0],[0,1,0],[0,1]),mp.v([b,yy,z0],[0,1,0],[1,1]),mp.v([b,yy,z1],[0,1,0],[1,0]),mp.v([a,yy,z1],[0,1,0],[0,0])]
mp.quad(*q)
out={'W':W,'xs':xs,'meshes':[]}
for m in (mf,ms,my,mp):
  fix_winding(m); P,N,U,I=m.arrays()
  out['meshes'].append({'mat':m.mat,'P':np.round(P,6).reshape(-1).tolist(),'N':np.round(N,5).reshape(-1).tolist(),'U':np.round(U,6).reshape(-1).tolist(),'I':I.tolist()})
json.dump(out,open('/home/claude/hm4studio/src/data/ar-album.json','w'),separators=(',',':'))
print([len(m['I'])//3 for m in out['meshes']])
