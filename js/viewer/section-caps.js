import * as THREE from './vendor/three.module.js';

// True polygonal cross sections, including holes. The tiny inward probe avoids
// ambiguous intersections at a shelf, slab or the former low/high wall seam.
const SNAP=1e-6, PROBE=3e-5, INSET=1.5e-4;
const key=p=>p.map(v=>Math.round(v/SNAP)).join(',');
const area=p=>p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0)/2;
function inside(p,poly){let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
// A shared boundary vertex is not a reliable containment sample. Use the
// centroid of an interior triangle so touching wall returns stay filled.
function interiorPoint(poly){
 const points=poly.map(p=>new THREE.Vector2(...p));
 const faces=THREE.ShapeUtils.triangulateShape(points,[]);
 for(const f of faces){const p=f.map(i=>poly[i]);if(Math.abs(area(p))>1e-10)return [(p[0][0]+p[1][0]+p[2][0])/3,(p[0][1]+p[1][1]+p[2][1])/3];}
 return poly[0];
}
function simplify(p){return p.filter((a,i)=>{const b=p[(i+p.length-1)%p.length],c=p[(i+1)%p.length];return Math.abs((a[0]-b[0])*(c[1]-a[1])-(a[1]-b[1])*(c[0]-a[0]))>1e-9;});}

export function sectionTriangles(triangles,plane){
 const axis=plane.slice(0,3).findIndex(v=>Math.abs(v)>.5),sign=plane[axis];
 if(axis<0)return {positions:[],loops:0,openChains:0};
 const axes=[0,1,2].filter(a=>a!==axis),coordinate=-plane[3]/sign,probe=coordinate+sign*PROBE;
 const vertices=new Map(),edges=new Map(),adj=new Map();
 for(let t=0;t<triangles.length;t+=9){
  const d=[triangles[t+axis]-probe,triangles[t+3+axis]-probe,triangles[t+6+axis]-probe];
  if(Math.min(...d)>0||Math.max(...d)<0)continue;
  const points=[];
  for(let i=0;i<3;i++){const j=(i+1)%3;if((d[i]>0)===(d[j]>0))continue;const k=d[i]/(d[i]-d[j]);points.push(axes.map(a=>triangles[t+i*3+a]+k*(triangles[t+j*3+a]-triangles[t+i*3+a])));}
  if(points.length!==2)continue;
  const u=[0,1,2].map(a=>triangles[t+3+a]-triangles[t+a]),w=[0,1,2].map(a=>triangles[t+6+a]-triangles[t+a]);
  const normal=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]],pn=plane.slice(0,3);
  const tangent=[normal[1]*pn[2]-normal[2]*pn[1],normal[2]*pn[0]-normal[0]*pn[2],normal[0]*pn[1]-normal[1]*pn[0]];
  if((points[1][0]-points[0][0])*tangent[axes[0]]+(points[1][1]-points[0][1])*tangent[axes[1]]<0)points.reverse();
  const a=key(points[0]),b=key(points[1]);if(a===b)continue;
  vertices.set(a,points[0]);vertices.set(b,points[1]);const id=[a,b].sort().join('|');if(!edges.has(id))edges.set(id,[a,b]);
 }
 for(const [id,[a,b]] of edges){if(!adj.has(a))adj.set(a,[]);adj.get(a).push([b,id]);}
 const used=new Set(),loops=[];let openChains=0;
 for(const [id,[a,b]] of edges){
  if(used.has(id))continue;used.add(id);let prev=a,current=b;const ring=[a];let closed=false;
  for(let n=0;n<edges.size+1;n++){
   if(current===a){closed=true;break;}ring.push(current);
   const options=(adj.get(current)||[]).filter(([_,edge])=>!used.has(edge));if(!options.length)break;
   // Branches only occur at touching solids. Follow the smallest left turn.
   const p=vertices.get(prev),q=vertices.get(current),heading=Math.atan2(q[1]-p[1],q[0]-p[0]);
   options.sort(([u],[v])=>{const angle=k=>{const r=vertices.get(k);return (Math.atan2(r[1]-q[1],r[0]-q[0])-heading+Math.PI*2)%(Math.PI*2);};return angle(u)-angle(v);});
   const [next,edge]=options[0];used.add(edge);prev=current;current=next;
  }
  if(!closed){openChains++;continue;}const poly=simplify(ring.map(k=>vertices.get(k)));if(poly.length>=3&&Math.abs(area(poly))>1e-8)loops.push({poly,area:Math.abs(area(poly)),parent:-1,depth:0});
 }
 loops.sort((a,b)=>b.area-a.area);
 for(let i=0;i<loops.length;i++){const sample=interiorPoint(loops[i].poly);for(let j=i-1;j>=0;j--)if(inside(sample,loops[j].poly)){loops[i].parent=j;loops[i].depth=loops[j].depth+1;break;}}
 const positions=[];
 for(let i=0;i<loops.length;i++){
  if(loops[i].depth%2)continue;const outer=loops[i].poly.map(p=>new THREE.Vector2(...p));
  const holes=loops.filter(p=>p.parent===i&&p.depth%2).map(p=>p.poly.map(v=>new THREE.Vector2(...v)));
  const all=outer.concat(...holes),faces=THREE.ShapeUtils.triangulateShape(outer,holes);
  for(const face of faces)for(const index of face){const p=[0,0,0];p[axis]=coordinate+sign*INSET;p[axes[0]]=all[index].x;p[axes[1]]=all[index].y;positions.push(...p);}
 }
 return {positions,loops:loops.length,openChains};
}

export function worldTriangles(mesh){
 const g=mesh.geometry,p=g.getAttribute('position'),ix=g.index,n=ix?ix.count:p.count,tri=new Float32Array(n*3),v=new THREE.Vector3();
 for(let i=0;i<n;i++){v.fromBufferAttribute(p,ix?ix.getX(i):i).applyMatrix4(mesh.matrixWorld);tri.set([v.x,v.y,v.z],i*3);}return tri;
}
export function canCap(meta,material){
 if(meta.transitionRole||meta.transitionOnly||meta.representation==='transition'||meta.stage==='before'||meta.category==='courtyard'||material.transparent)return false;
 return !['curtains','signage','glass','exterior_glass','roof_glass','finish','door_swing'].includes(meta.category);
}
export function wallCap(meta){return ['wall','wall_low','wall_high','exterior','plinth','exterior_fascia','wall_lintel','rear_walls'].includes(meta.category);}

export class SectionCaps {
 constructor(scene,meshes){this.scene=scene;this.meshes=meshes;this.group=new THREE.Group();this.group.name='Solid section faces';scene.add(this.group);this.cache=new Map();this.timer=null;this.stats={};}
 clear(){for(const c of [...this.group.children]){this.group.remove(c);c.geometry.dispose();c.material.dispose();}}
 update(){
  clearTimeout(this.timer);this.clear();
  // Coalesce slider events. Geometry is rebuilt only on an actual cut change.
  this.timer=setTimeout(()=>this.build(),45);
 }
 build(){
  this.scene.updateMatrixWorld(true);let count=0,triangles=0,openChains=0;
  for(const mesh of this.meshes){
   const planes=mesh.material.clippingPlanes||[];if(!mesh.visible||!planes.length||!canCap(mesh.userData,mesh.material))continue;
   if(!this.cache.has(mesh))this.cache.set(mesh,worldTriangles(mesh));
   const tri=this.cache.get(mesh);
   for(const plane of planes){
    const v=[plane.normal.x,plane.normal.y,plane.normal.z,plane.constant];const cap=sectionTriangles(tri,v);openChains+=cap.openChains;if(!cap.positions.length)continue;
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(cap.positions,3));g.computeVertexNormals();
    const material=new THREE.MeshBasicMaterial({color:wallCap(mesh.userData)?0x45463f:mesh.material.color,side:THREE.DoubleSide,clippingPlanes:planes.filter(p=>p!==plane),polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
    const face=new THREE.Mesh(g,material);face.renderOrder=2;face.userData.sectionOf=mesh.name;this.group.add(face);count++;triangles+=cap.positions.length/9;
   }
  }
  this.stats={meshes:count,triangles,openChains};if(globalThis.window)window.recSectionCaps=this.stats;
 }
}
