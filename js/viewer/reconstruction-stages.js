// Architectural explanation of the reconstruction, scroll-driven in story.js.
// What the project does to the existing 1-510 house:
//  - keeps the outer walls, the inner load-bearing walls (spine, stair and party walls) and the floor slabs;
//  - removes only partitions inside flats and the old finish; enlarges some openings locally;
//  - ATTACHES additions from the side: lift portals at the front, stair portals at the back,
//    floor-plate extensions, the technical level and the roof terrace;
//  - APPLIES the new facade finish (plaster, panels, glazing) onto the retained walls.
// So additions slide in horizontally and the facade is "painted" across the house; nothing drops from above.
// The schematic retained shell and bearing walls are animation-only, separate from measured plans.
export const STAGES = [
  {at:0, title:'Существующий дом', text:'Пятиэтажка до реконструкции. Исходный облик показан схематично.'},
  {at:.05, title:'Основа остаётся', text:'Наружные и внутренние несущие стены и перекрытия сохраняются. Сносятся только перегородки внутри квартир.'},
  {at:.18, title:'Меняем проёмы — сохраняем стены', text:'Локально увеличиваем оконные проёмы. Простенки и основная оболочка дома остаются на месте.'},
  {at:.45, title:'Пристраиваем новые объёмы', text:'Спереди — лифтовые порталы, сзади — лестницы. Обстройка пристраивается к дому сбоку.'},
  {at:.7, title:'Отделываем фасад', text:'Штукатурка, панели и остекление наносятся на сохранённые стены.'},
  {at:.88, title:'Технический уровень и крыша', text:'Служебный уровень и терраса достраиваются над домом.'},
  {at:1, title:'Переустраиваем двор', text:'Участок и парковка остаются. Обновляем подходы к дому, места отдыха и детскую площадку.'}
];
export function stageAt(t){return STAGES.find(s=>t<=s.at+1e-8)||STAGES.at(-1);}

// Old house footprint (inner faces of the retained outer walls), metres.
export const OLD = {x0:-26.04, x1:26.04, zRear:-7.19, zFront:4.09};
// Timeline, in story t (0..1).
export const T = {finish:[0,.05], openings:[.05,.18], plates:[.21,.36], cores:[.26,.45], facade:[.45,.70], partitions:[.45,.70], roof:[.70,.88], life:[.70,.88], yard:[.88,1]};

const clamp=x=>Math.max(0,Math.min(1,x));
export const progress=(t,[a,b])=>clamp((t-a)/(b-a));
const ease=x=>1-Math.pow(1-x,3);
const shown={visible:true,planes:[]},hidden={visible:false,planes:[]};
export function isTransition(meta){return !!meta.transitionRole||meta.transitionOnly||meta.representation==='transition';}
// Wipe endpoints must remain identical to the actual before/after viewer.
export function comparisonState(meta,name,t){
  if(isTransition(meta)||meta.category==='door_swing')return hidden;
  return (meta.stage==='before')===(t===0)?shown:hidden;
}
export function buildPhase(meta,name){
  const cat=meta.category||'';
  if(meta.storyPart)return 'cores';
  if(isTransition(meta))return meta.transitionRole;
  if(meta.stage==='before')return 'unused_before';
  if(meta.asset==='courtyard'||cat==='courtyard')return name.startsWith('courtyard_v9_')?'yard':'retained_context';
  if(meta.asset==='technical'||meta.representation==='technical'||meta.representation==='roof'||['roof','parapet'].includes(cat))return 'roof';
  if(['lifts','rear-base','portal-details'].includes(meta.asset)||cat==='stairs'||meta.source_material===43)return 'cores';
  if(meta.asset==='structure')return cat==='slabs'?'slabs':cat==='wall'?'pdf_walls':'cores';
  if(['interiors','doors','glassblocks','common','apartment-fitout','interior-additions'].includes(meta.asset))return 'life';
  return 'facade';
}
// Which side an addition is attached from: +1 front (entrance, +z), -1 rear (yard, -z).
export function sideOf(meta,centreZ){if(meta.side)return meta.side==='front'?1:-1;if(meta.storyPart)return meta.storyPart==='front'?1:-1;return centreZ>0?1:-1;}

// Facade finish: a vertical "application front" sweeps along the house (x), left to right.
export const sweepX=p=>-27.5+55*p;
// Distances an addition travels when it is attached (story build) - horizontal only.
export const SLIDE={cores:16,roof:34};

// State of one mesh at story time t. opt.sweep (0..1) caps the facade finish (analytical view).
// Returns {visible, planes, move:[dx,dy,dz] (unit: metres, before side sign), side}.
export function constructionState(meta,name,t,opt={}){
  t=clamp(t);
  if(meta.category==='door_swing')return hidden;
  const phase=buildPhase(meta,name);
  if(phase==='unused_before'||phase==='pdf_walls')return hidden;    // PDF walls replaced by the split set below
  if(['retained_core','retained_bearing','retained_context'].includes(phase)){
    // The schematic end walls give way to the finished end facade once the finish has passed them.
    const end=/^transition_retained_core_end_(-?1)/.exec(name);
    if(end){const X=sweepX(Math.min(progress(t,T.facade),opt.sweep??1));return (+end[1]<0?X>-26.0:X>26.0)?hidden:shown;}
    return shown;
  }
  if(phase==='old_finish'||phase==='opening_infill'){
    // Old finish is stripped top-down; the sills under enlarged windows are cut out.
    const p=progress(t,phase==='old_finish'?T.finish:T.openings);
    return p>=1?hidden:p===0?shown:{visible:true,planes:[[0,1,0,-(-1+17*p)]]};
  }
  if(phase==='slabs'){
    // Existing slabs stay; their extension grows outwards to the new facade line.
    const p=ease(progress(t,T.plates));
    if(p>=1)return shown;
    return {visible:true,planes:[[0,0,1,-(OLD.zRear-.3-3.3*p)],[0,0,-1,OLD.zFront+.3+5.3*p]]};
  }
  if(phase==='wall_finish'||phase==='facade'){
    const p=Math.min(progress(t,T.facade),opt.sweep??1);
    if(p<=0)return hidden; if(p>=1)return shown;
    return {visible:true,planes:[[-1,0,0,sweepX(p)]]};
  }
  if(phase==='new_partitions'||phase==='life'||phase==='yard'){
    const r=phase==='yard'?T.yard:phase==='life'?T.life:T.partitions, p=progress(t,r), h=phase==='yard'?6:16;
    if(p<=0)return hidden; if(p>=1)return shown;
    return {visible:true,planes:[[0,-1,0,-1+h*p]]};
  }
  if(phase==='cores'||phase==='annex_walls'){
    const p=progress(t,phase==='annex_walls'?T.plates:T.cores);
    if(p<=0)return hidden;
    return {visible:true,planes:[],slide:[0,0,SLIDE.cores*(1-ease(p))],perSide:true};
  }
  if(phase==='roof'){
    const p=progress(t,T.roof);
    if(p<=0)return hidden;
    return {visible:true,planes:[],slide:[SLIDE.roof*(1-ease(p)),0,0]};
  }
  return t>=1?shown:hidden;
}
