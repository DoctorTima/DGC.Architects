import * as THREE from 'three';
import {constructionState,comparisonState,stageAt} from './reconstruction-stages.js';

// One GPU context and one set of model buffers. Comparison frames are copied
// synchronously to 2D canvases; moving the wipe needs no extra WebGL rendering.
export class LiveComparison {
 constructor({renderer,scene,meshes,caps,pdf,restore}){
  Object.assign(this,{renderer,scene,meshes,caps,pdf,restore});
  this.canvas=document.getElementById('compare-canvas');this.ctx=this.canvas.getContext('2d');
  this.frame=document.getElementById('compare-frame');this.range=document.getElementById('compare-slider');
  this.mode='wipe';this.view='perspective';this.percent=50;this.playing=false;this.cache={};this.pending=false;
  this.camera=new THREE.OrthographicCamera(-50,50,33,-33,.35,250);
  document.querySelectorAll('[data-compare-mode]').forEach(b=>b.addEventListener('click',()=>{this.stop();this.mode=b.dataset.compareMode;this.percent=this.mode==='wipe'?50:0;this.range.value=this.percent;this.update();}));
  document.querySelectorAll('[data-compare-view]').forEach(b=>b.addEventListener('click',()=>{this.view=b.dataset.compareView;this.cache={};this.update();}));
  this.range.addEventListener('input',()=>{this.stop();this.percent=+this.range.value;this.update();});
  document.getElementById('compare-play').addEventListener('click',()=>this.playing?this.stop():this.play());
  this.observer=new IntersectionObserver(entries=>{this.inView=entries[0].isIntersecting;if(this.inView)this.update();else this.stop();},{rootMargin:'100px'});this.observer.observe(this.frame);
  this.resizeObserver=new ResizeObserver(()=>{this.cache={};if(this.inView)this.update();});this.resizeObserver.observe(this.frame);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)this.stop();});
  document.getElementById('compare-start').hidden=true;document.getElementById('compare-status').textContent='Модель REC v10, единый ракурс';
  document.querySelectorAll('[data-compare-mode],[data-compare-view],#compare-slider,#compare-play').forEach(el=>el.disabled=false);
  this.update();
 }
 stop(){this.playing=false;cancelAnimationFrame(this.raf);document.getElementById('compare-play').textContent='Показать этапы';document.getElementById('compare-play').setAttribute('aria-pressed','false');}
 play(){
  this.percent=this.mode==='wipe'||this.percent>=100?0:this.percent;this.mode='build';this.playing=true;
  document.getElementById('compare-play').textContent='Пауза';document.getElementById('compare-play').setAttribute('aria-pressed','true');
  const start=performance.now()-this.percent/100*16000;let last=0;
  const loop=now=>{if(!this.playing)return;this.percent=Math.min(100,(now-start)/160);this.range.value=this.percent;
   if(now-last>80){last=now;this.update();}if(this.percent>=100){this.stop();this.update();return;}this.raf=requestAnimationFrame(loop);};
  this.raf=requestAnimationFrame(loop);
 }
 update(){
  document.querySelectorAll('[data-compare-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.compareMode===this.mode)));
  document.querySelectorAll('[data-compare-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.compareView===this.view)));
  const build=this.mode==='build',stage=stageAt(this.percent/100);
  document.getElementById('compare-stage-title').textContent=build?stage.title:'Один ракурс. Два состояния.';
  document.getElementById('compare-stage-note').textContent=build?stage.text:'Передвиньте границу и сравните исходный дом с обновлённым проектом.';
  document.getElementById('compare-value').value=Math.round(this.percent)+'%';
  this.range.setAttribute('aria-label',build?'Этап преобразования дома':'Граница сравнения до и после');
  this.range.setAttribute('aria-valuetext',build?Math.round(this.percent)+'% — '+stage.title:Math.round(this.percent)+'% исходного состояния');
  document.getElementById('compare-line').hidden=build;
  document.getElementById('compare-retained').hidden=!build;
  document.querySelectorAll('.compare-label').forEach(el=>el.hidden=build);
  document.getElementById('compare-line').style.left=this.percent+'%';
  if(this.pending)return;this.pending=true;requestAnimationFrame(()=>{this.pending=false;this.draw();});
 }
 configureCamera(w,h){
  const span=Math.max(58,102*h/w),aspect=w/h;Object.assign(this.camera,{left:-span*aspect/2,right:span*aspect/2,top:span/2,bottom:-span/2});
  const offsets={perspective:[.72,.55,.88],front:[0,.14,1.15],back:[-.45,.5,-1],top:[0,1.25,.001]};
  this.camera.position.set(...offsets[this.view]).multiplyScalar(82).add(new THREE.Vector3(0,7,-1));this.camera.lookAt(0,7,-1);this.camera.updateProjectionMatrix();
 }
 capture(t,w,h,mode='build'){
  const image=document.createElement('canvas');image.width=w;image.height=h;
  const renderer=this.renderer,size=renderer.getSize(new THREE.Vector2()),ratio=renderer.getPixelRatio();
  const snapshots=this.meshes.map(o=>({o,visible:o.visible,planes:o.material.clippingPlanes,cast:o.castShadow,receive:o.receiveShadow}));
  const capVisible=this.caps.group.visible,pdfVisible=this.pdf?.visible;
  try{
   this.caps.group.visible=false;if(this.pdf)this.pdf.visible=false;
   for(const {o} of snapshots){const s=(mode==='wipe'?comparisonState:constructionState)(o.userData,o.name,t);o.visible=s.visible;o.material.clippingPlanes=s.planes.map(p=>new THREE.Plane(new THREE.Vector3(...p.slice(0,3)),p[3]));o.castShadow=!s.planes.length&&o.userData.castShadowBase;o.receiveShadow=!s.planes.length;}
   renderer.setPixelRatio(1);renderer.setSize(w,h,false);this.configureCamera(w,h);renderer.render(this.scene,this.camera);image.getContext('2d').drawImage(renderer.domElement,0,0,w,h);
  }finally{
   for(const s of snapshots){s.o.visible=s.visible;s.o.material.clippingPlanes=s.planes;s.o.castShadow=s.cast;s.o.receiveShadow=s.receive;}
   this.caps.group.visible=capVisible;if(this.pdf)this.pdf.visible=pdfVisible;
   renderer.setPixelRatio(ratio);renderer.setSize(size.x,size.y,false);this.restore();
  }
  return image;
 }
 draw(){
  const r=this.frame.getBoundingClientRect();if(!r.width||!r.height)return;
  const ratio=Math.min(devicePixelRatio,1.6),w=Math.round(r.width*ratio),h=Math.round(r.height*ratio);
  if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;this.cache={};}
  const c=this.ctx;c.clearRect(0,0,w,h);
  if(this.mode==='wipe'){
   this.cache.before ||= this.capture(0,w,h,'wipe');this.cache.after ||= this.capture(1,w,h,'wipe');
   c.drawImage(this.cache.after,0,0);const split=Math.round(w*this.percent/100);
   if(split)c.drawImage(this.cache.before,0,0,split,h,0,0,split,h);
  }else c.drawImage(this.capture(this.percent/100,w,h),0,0);
 }
}
