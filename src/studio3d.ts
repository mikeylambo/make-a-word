import "./studio3d.css";

declare global { interface Window { THREE?: any; } }

type ModeKey = "classic" | "daily" | "burn" | "trials" | "together";
type UtilityKey = "stats" | "rules" | "settings";
type InteractiveKey = ModeKey | UtilityKey;
type Crop = { x:number; y:number; w:number; h:number };
type PanelSpec = {
  key: ModeKey;
  crop: Crop;
  color: number;
  glow: number;
  depth: number;
  bridge: string;
};
type Interactive = {
  key: InteractiveKey;
  group: any;
  face: any;
  bridge: string;
  basePos: any;
  baseScale: any;
  hover: number;
  press: number;
  accent: any;
  hit?: HTMLButtonElement;
};

const THREE = window.THREE;
if (!THREE) throw new Error("Studio3D requires Three.js");

const ENABLED = new URLSearchParams(location.search).get("menu") === "layered";
const REF_W = 1672;
const REF_H = 941;
const REF_ASPECT = REF_W / REF_H;
const WORLD_H = 10;
const WORLD_W = WORLD_H * REF_ASPECT;
const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)");

// These bounds are measured directly from the approved 1672x941 composition.
// Daily/Burn deliberately include their attached letter clusters so the idle
// Three.js frame remains visually locked to the reference rather than clipping them.
const PANEL_SPECS: PanelSpec[] = [
  { key:"classic",  crop:{x:125,y:205,w:855,h:470}, color:0xd88800, glow:0xffd34f, depth:.13, bridge:'[data-mode="classic"]' },
  { key:"daily",    crop:{x:948,y:202,w:570,h:258}, color:0x086ec4, glow:0x54d9ff, depth:.11, bridge:'[data-mode="daily"]' },
  { key:"burn",     crop:{x:910,y:447,w:625,h:232}, color:0xa9130e, glow:0xff653e, depth:.11, bridge:'[data-mode="burn"]' },
  { key:"trials",   crop:{x:125,y:670,w:720,h:138}, color:0x4b19a0, glow:0xb77bff, depth:.09, bridge:'[data-action="journey"]' },
  { key:"together", crop:{x:820,y:670,w:700,h:140}, color:0x07884b, glow:0x55f59b, depth:.09, bridge:'[data-action="multiplayer"]' }
];
const LOGO_CROP: Crop = { x:435, y:45, w:815, h:160 };
const SIDE_LEFT: Crop = { x:20, y:294, w:105, h:238 };
const SIDE_RIGHT: Crop = { x:1535, y:294, w:120, h:238 };
const TAGLINE: Crop = { x:474, y:826, w:725, h:76 };
const UTILITY_CROPS: Record<UtilityKey,Crop> = {
  stats:{x:1253,y:58,w:113,h:117},
  rules:{x:1366,y:58,w:113,h:117},
  settings:{x:1479,y:58,w:123,h:117}
};

const pxX = (x:number) => (x / REF_W - .5) * WORLD_W;
const pxY = (y:number) => (.5 - y / REF_H) * WORLD_H;
const pxW = (w:number) => (w / REF_W) * WORLD_W;
const pxH = (h:number) => (h / REF_H) * WORLD_H;
const clamp = (v:number,a=0,b=1) => Math.max(a,Math.min(b,v));
const lerp = (a:number,b:number,t:number) => a+(b-a)*t;
const easeOutBack = (t:number) => { t=clamp(t); const c1=1.18,c3=c1+1; return 1+c3*Math.pow(t-1,3)+c1*Math.pow(t-1,2); };

function cropTexture(source:any,crop:Crop):any {
  const tex=source.clone();
  tex.needsUpdate=true;
  tex.wrapS=tex.wrapT=THREE.ClampToEdgeWrapping;
  tex.repeat.set(crop.w/REF_W,crop.h/REF_H);
  tex.offset.set(crop.x/REF_W,1-(crop.y+crop.h)/REF_H);
  if("colorSpace" in tex && THREE.SRGBColorSpace) tex.colorSpace=THREE.SRGBColorSpace;
  if("encoding" in tex) tex.encoding=THREE.sRGBEncoding;
  tex.minFilter=THREE.LinearMipmapLinearFilter;
  tex.magFilter=THREE.LinearFilter;
  return tex;
}

function roundedRect(w:number,h:number,r:number):any {
  const s=new THREE.Shape(),x=-w/2,y=-h/2;
  s.moveTo(x+r,y); s.lineTo(x+w-r,y); s.quadraticCurveTo(x+w,y,x+w,y+r);
  s.lineTo(x+w,y+h-r); s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  s.lineTo(x+r,y+h); s.quadraticCurveTo(x,y+h,x,y+h-r);
  s.lineTo(x,y+r); s.quadraticCurveTo(x,y,x+r,y); return s;
}

function canvasTexture(width:number,height:number,draw:(ctx:CanvasRenderingContext2D,w:number,h:number)=>void):any {
  const c=document.createElement("canvas"); c.width=width;c.height=height;
  const ctx=c.getContext("2d")!; draw(ctx,width,height);
  const tex=new THREE.CanvasTexture(c);tex.needsUpdate=true;
  if("colorSpace" in tex && THREE.SRGBColorSpace) tex.colorSpace=THREE.SRGBColorSpace;
  if("encoding" in tex) tex.encoding=THREE.sRGBEncoding;
  return tex;
}

function rr(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number):void {
  ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();
}

function glowSprite(color:number,scale:number):any {
  const tex=canvasTexture(128,128,(ctx,w,h)=>{
    const c=new THREE.Color(color),rgb=`${Math.round(c.r*255)},${Math.round(c.g*255)},${Math.round(c.b*255)}`;
    const g=ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);
    g.addColorStop(0,`rgba(${rgb},.85)`);g.addColorStop(.2,`rgba(${rgb},.28)`);g.addColorStop(1,`rgba(${rgb},0)`);
    ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  });
  const mat=new THREE.SpriteMaterial({map:tex,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:0});
  const sprite=new THREE.Sprite(mat);sprite.scale.set(scale,scale,1);return sprite;
}

function makePanel(spec:PanelSpec,atlas:any):Interactive {
  const group=new THREE.Group();
  const w=pxW(spec.crop.w),h=pxH(spec.crop.h);
  const bodyGeo=new THREE.ExtrudeGeometry(roundedRect(w*.985,h*.955,.075),{
    depth:spec.depth,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.025,bevelThickness:.025,curveSegments:6
  });
  bodyGeo.center();
  const bodyMat=new THREE.MeshStandardMaterial({
    color:spec.color,metalness:.38,roughness:.32,emissive:new THREE.Color(spec.color).multiplyScalar(.16),
    emissiveIntensity:.2,transparent:true,opacity:0
  });
  const body=new THREE.Mesh(bodyGeo,bodyMat);body.position.z=-.06;group.add(body);

  const faceMat=new THREE.MeshBasicMaterial({map:cropTexture(atlas,spec.crop),toneMapped:false,transparent:true,opacity:1});
  const face=new THREE.Mesh(new THREE.PlaneGeometry(w,h),faceMat);face.position.z=.015;face.renderOrder=3;group.add(face);

  const rimMat=new THREE.MeshBasicMaterial({color:spec.glow,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false});
  const rim=new THREE.Mesh(new THREE.PlaneGeometry(w*1.006,h*1.018),rimMat);rim.position.z=.008;rim.renderOrder=2;group.add(rim);
  group.userData={body,rim};

  const cx=spec.crop.x+spec.crop.w/2,cy=spec.crop.y+spec.crop.h/2;
  group.position.set(pxX(cx),pxY(cy),0);
  return {key:spec.key,group,face,bridge:spec.bridge,basePos:group.position.clone(),baseScale:group.scale.clone(),hover:0,press:0,accent:new THREE.Color(spec.glow)};
}

class Studio3D {
  private menu:HTMLElement;
  private host:HTMLElement;
  private stage:HTMLElement;
  private canvas:any;
  private scene:any;
  private camera:any;
  private renderer:any;
  private root:any;
  private atlas:any;
  private empty:any;
  private interactives:Interactive[]=[];
  private utility:Interactive[]=[];
  private raycaster=new THREE.Raycaster();
  private pointer=new THREE.Vector2(-9,-9);
  private hovered:Interactive|null=null;
  private raf=0;
  private start=performance.now();
  private last=performance.now();
  private visible=!document.hidden;
  private beams:any[]=[];
  private floorGlow:any;
  private logo:any;
  private a11y:HTMLElement;
  private mobile=false;
  private resizeObserver:ResizeObserver;

  constructor(menu:HTMLElement){
    this.menu=menu;menu.classList.add("studio3d-active");
    this.host=document.createElement("div");this.host.className="studio3d-host";
    this.stage=document.createElement("div");this.stage.className="studio3d-stage";
    const loading=document.createElement("div");loading.className="studio3d-loading";loading.textContent="BUILDING THE STUDIO";
    this.a11y=document.createElement("div");this.a11y.className="studio3d-a11y";
    this.stage.append(loading,this.a11y);this.host.append(this.stage);menu.append(this.host);

    this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0x020816);
    this.camera=new THREE.OrthographicCamera(-WORLD_W/2,WORLD_W/2,WORLD_H/2,-WORLD_H/2,-30,40);this.camera.position.set(0,0,12);
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:"high-performance",stencil:false});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));this.renderer.setSize(2,2,false);
    if("outputColorSpace" in this.renderer && THREE.SRGBColorSpace)this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    if("outputEncoding" in this.renderer)this.renderer.outputEncoding=THREE.sRGBEncoding;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1;
    this.canvas=this.renderer.domElement;this.canvas.className="studio3d-canvas";this.canvas.tabIndex=-1;this.stage.prepend(this.canvas);
    this.root=new THREE.Group();this.scene.add(this.root);

    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(this.stage);this.resize();this.bindPointer();void this.load();
  }

  private async load():Promise<void>{
    const loader=new THREE.TextureLoader();
    [this.atlas,this.empty]=await Promise.all([loader.loadAsync("/assets/menu/studio-championship.webp"),loader.loadAsync("/assets/menu/studio-empty.png")]);
    for(const tex of [this.atlas,this.empty]){
      if("colorSpace" in tex && THREE.SRGBColorSpace)tex.colorSpace=THREE.SRGBColorSpace;
      if("encoding" in tex)tex.encoding=THREE.sRGBEncoding;
      tex.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());
    }
    this.buildScene();this.resize();this.host.classList.add("studio3d-ready");this.raf=requestAnimationFrame(t=>this.tick(t));
  }

  private addCrop(crop:Crop,z:number):any{
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(pxW(crop.w),pxH(crop.h)),new THREE.MeshBasicMaterial({map:cropTexture(this.atlas,crop),toneMapped:false,transparent:false}));
    mesh.position.set(pxX(crop.x+crop.w/2),pxY(crop.y+crop.h/2),z);this.root.add(mesh);return mesh;
  }

  private buildScene():void{
    const background=new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W,WORLD_H),new THREE.MeshBasicMaterial({map:this.empty,toneMapped:false}));background.position.z=-1.5;this.root.add(background);

    // The approved background already contains the premium floor, rails and static spotlights.
    // WebGL only adds very soft animated light, avoiding the doubled floor ring from the previous pass.
    [-3.9,0,3.9].forEach((x,i)=>{
      const beam=new THREE.Mesh(new THREE.ConeGeometry(.52,5.8,20,1,true),new THREE.MeshBasicMaterial({color:i===1?0xffffff:0x78cfff,transparent:true,opacity:.018,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,depthWrite:false}));
      beam.position.set(x,2.25,-.9);beam.userData.phase=i*1.7;this.root.add(beam);this.beams.push(beam);
    });
    this.floorGlow=glowSprite(0xffb13b,5.4);this.floorGlow.position.set(0,-4.25,-.2);this.floorGlow.scale.y=1.15;this.root.add(this.floorGlow);

    PANEL_SPECS.forEach(spec=>{const item=makePanel(spec,this.atlas);this.interactives.push(item);this.root.add(item.group);});

    this.logo=this.addCrop(LOGO_CROP,.035);
    this.addCrop(SIDE_LEFT,-.05);this.addCrop(SIDE_RIGHT,-.05);this.addCrop(TAGLINE,.02);
    this.buildHud();this.buildUtilities();this.buildA11y();
  }

  private readStats():[string,string]{
    const vals=Array.from(this.menu.querySelectorAll<HTMLElement>(".studio-record strong")).map(e=>e.textContent?.trim()||"0");return [vals[0]||"0",vals[1]||"0"];
  }

  private buildHud():void{
    const [words,best]=this.readStats();
    const tex=canvasTexture(900,250,(ctx,w,h)=>{
      ctx.clearRect(0,0,w,h);const g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,"#0c3b78");g.addColorStop(1,"#071c49");
      ctx.fillStyle=g;rr(ctx,12,12,w-24,h-24,30);ctx.fill();ctx.lineWidth=8;ctx.strokeStyle="#168fff";ctx.stroke();ctx.lineWidth=4;ctx.strokeStyle="#f7ab1c";rr(ctx,20,20,w-40,h-40,25);ctx.stroke();
      ctx.strokeStyle="rgba(255,255,255,.74)";ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(w*.49,48);ctx.lineTo(w*.49,h-48);ctx.stroke();
      ctx.fillStyle="#fff";ctx.textAlign="left";ctx.font="900 24px Arial";ctx.fillText("▥",55,82);ctx.font="900 22px Arial";ctx.fillText("WORDS PLAYED",120,75);ctx.font="900 52px Arial";ctx.fillText(words,120,157);
      ctx.fillStyle="#ffd23d";ctx.font="900 64px Arial";ctx.fillText("★",w*.54,98);ctx.fillStyle="#fff";ctx.font="900 22px Arial";ctx.fillText("BEST SCORE",w*.65,75);ctx.font="900 52px Arial";ctx.fillText(best,w*.65,157);
    });
    const crop={x:36,y:60,w:372,h:100};
    const hud=new THREE.Mesh(new THREE.PlaneGeometry(pxW(crop.w),pxH(crop.h)),new THREE.MeshBasicMaterial({map:tex,transparent:true,toneMapped:false}));hud.position.set(pxX(crop.x+crop.w/2),pxY(crop.y+crop.h/2),.07);this.root.add(hud);
  }

  private buildUtilities():void{
    const bridges:Record<UtilityKey,string>={stats:'[data-action="stats"]',rules:'[data-action="help"]',settings:'[data-action="settings"]'};
    (Object.keys(UTILITY_CROPS) as UtilityKey[]).forEach(key=>{
      const crop=UTILITY_CROPS[key],group=new THREE.Group();
      const face=new THREE.Mesh(new THREE.PlaneGeometry(pxW(crop.w),pxH(crop.h)),new THREE.MeshBasicMaterial({map:cropTexture(this.atlas,crop),toneMapped:false}));face.position.z=.02;group.add(face);
      group.position.set(pxX(crop.x+crop.w/2),pxY(crop.y+crop.h/2),.09);this.root.add(group);
      this.utility.push({key,group,face,bridge:bridges[key],basePos:group.position.clone(),baseScale:group.scale.clone(),hover:0,press:0,accent:new THREE.Color(0x59c9ff)});
    });
  }

  private buildA11y():void{
    for(const item of [...this.interactives,...this.utility]){
      const b=document.createElement("button");b.className="studio3d-hit";b.type="button";
      b.setAttribute("aria-label",item.key==="together"?"Play Together":item.key==="trials"?"Open Trials":item.key.charAt(0).toUpperCase()+item.key.slice(1));
      b.addEventListener("focus",()=>this.setHover(item));b.addEventListener("blur",()=>this.setHover(null));
      b.addEventListener("pointerenter",()=>this.setHover(item));b.addEventListener("pointerleave",()=>{if(this.hovered===item)this.setHover(null);});
      b.addEventListener("pointerdown",()=>this.press(item));b.addEventListener("click",()=>this.activate(item));this.a11y.append(b);item.hit=b;
    }
  }

  private bindPointer():void{
    this.canvas.addEventListener("pointermove",(e:PointerEvent)=>{const r=this.canvas.getBoundingClientRect();this.pointer.x=((e.clientX-r.left)/r.width)*2-1;this.pointer.y=-((e.clientY-r.top)/r.height)*2+1;});
    this.canvas.addEventListener("pointerleave",()=>{this.pointer.set(-9,-9);this.setHover(null);});
    this.canvas.addEventListener("pointerdown",()=>{if(this.hovered)this.press(this.hovered);});
    this.canvas.addEventListener("pointerup",()=>{if(this.hovered)this.activate(this.hovered);});
    document.addEventListener("visibilitychange",()=>{this.visible=!document.hidden;if(this.visible&&!this.raf)this.raf=requestAnimationFrame(t=>this.tick(t));});
  }

  private setHover(item:Interactive|null):void{if(this.hovered===item)return;this.hovered=item;this.canvas.style.cursor=item?"pointer":"default";}
  private press(item:Interactive):void{item.press=1;}
  private activate(item:Interactive):void{
    const bridge=this.menu.querySelector<HTMLElement>(item.bridge);if(!bridge)return;item.press=1;this.flash(item.accent);window.setTimeout(()=>bridge.click(),REDUCED.matches?0:190);
  }

  private flash(color:any):void{
    const sprite=glowSprite(color.getHex(),7.2);sprite.position.set(0,0,4);sprite.material.opacity=.34;this.scene.add(sprite);const start=performance.now();
    const fade=()=>{const t=(performance.now()-start)/300;sprite.material.opacity=.34*(1-clamp(t));sprite.scale.setScalar(7.2+2.8*t);if(t<1)requestAnimationFrame(fade);else{this.scene.remove(sprite);sprite.material.dispose();sprite.material.map?.dispose();}};requestAnimationFrame(fade);
  }

  private raycast():void{
    if(!this.interactives.length)return;this.raycaster.setFromCamera(this.pointer,this.camera);const all=[...this.interactives,...this.utility];const hits=this.raycaster.intersectObjects(all.map(x=>x.face),false);
    if(!hits.length){if(!this.a11y.matches(":focus-within"))this.setHover(null);return;}const hit=all.find(x=>x.face===hits[0].object)||null;if(hit)this.setHover(hit);
  }

  private resize():void{
    const r=this.stage.getBoundingClientRect();if(!r.width||!r.height)return;this.mobile=r.width/r.height<.8;this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,this.mobile?1.4:2));this.renderer.setSize(r.width,r.height,false);
    if(this.mobile){const aspect=r.width/r.height,h=16.2,w=h*aspect;this.camera.left=-w/2;this.camera.right=w/2;this.camera.top=h/2;this.camera.bottom=-h/2;}
    else {const aspect=r.width/r.height;let w=WORLD_W,h=WORLD_H;if(aspect>REF_ASPECT)w=h*aspect;else h=w/aspect;this.camera.left=-w/2;this.camera.right=w/2;this.camera.top=h/2;this.camera.bottom=-h/2;}
    this.camera.updateProjectionMatrix();this.applyLayout();
  }

  private applyLayout():void{
    if(!this.interactives.length)return;
    if(!this.mobile){
      for(const item of this.interactives){const spec=PANEL_SPECS.find(p=>p.key===item.key)!;item.basePos.set(pxX(spec.crop.x+spec.crop.w/2),pxY(spec.crop.y+spec.crop.h/2),0);item.baseScale.set(1,1,1);item.group.scale.copy(item.baseScale);}
      if(this.logo){this.logo.position.set(pxX(LOGO_CROP.x+LOGO_CROP.w/2),pxY(LOGO_CROP.y+LOGO_CROP.h/2),.035);this.logo.scale.set(1,1,1);}return;
    }
    const map:Record<ModeKey,[number,number,number]>={classic:[0,3.25,.75],daily:[0,.45,.72],burn:[0,-1.8,.72],trials:[0,-3.75,.78],together:[0,-5.15,.78]};
    for(const item of this.interactives){const [x,y,s]=map[item.key as ModeKey];item.basePos.set(x,y,0);item.baseScale.set(s,s,s);item.group.scale.copy(item.baseScale);}
    if(this.logo){this.logo.position.set(0,6.55,.04);this.logo.scale.set(.7,.7,.7);}
    for(let i=0;i<this.utility.length;i++){const u=this.utility[i];u.basePos.set(-1.35+i*1.35,5.35,.1);u.group.position.copy(u.basePos);u.baseScale.set(.72,.72,.72);u.group.scale.copy(u.baseScale);}
  }

  private updateHits():void{
    const r=this.stage.getBoundingClientRect();for(const item of [...this.interactives,...this.utility]){if(!item.hit)continue;const box=new THREE.Box3().setFromObject(item.group),min=box.min.clone().project(this.camera),max=box.max.clone().project(this.camera);const x1=(min.x*.5+.5)*r.width,y1=(-max.y*.5+.5)*r.height,x2=(max.x*.5+.5)*r.width,y2=(-min.y*.5+.5)*r.height;item.hit.style.left=`${(x1+x2)/2}px`;item.hit.style.top=`${(y1+y2)/2}px`;item.hit.style.width=`${Math.max(42,x2-x1)}px`;item.hit.style.height=`${Math.max(38,y2-y1)}px`;}
  }

  private tick(now:number):void{
    this.raf=0;if(!this.visible||!this.menu.isConnected)return;const dt=Math.min(.05,(now-this.last)/1000);this.last=now;const t=(now-this.start)/1000;this.raycast();

    for(let i=0;i<this.interactives.length;i++){
      const item=this.interactives[i],intro=REDUCED.matches?1:easeOutBack(clamp((t-.14-i*.045)/.56));item.hover=lerp(item.hover,this.hovered===item?1:0,1-Math.exp(-dt*11));item.press=lerp(item.press,0,1-Math.exp(-dt*18));
      const hover=item.hover,press=item.press;item.group.position.x=lerp(item.group.position.x,item.basePos.x,1-Math.exp(-dt*18));item.group.position.y=lerp(item.group.position.y,item.basePos.y,1-Math.exp(-dt*18));item.group.position.z=hover*.16-press*.07;
      const s=(.985+.015*intro)*(1+hover*.003-press*.006);item.group.scale.set(item.baseScale.x*s,item.baseScale.y*s,item.baseScale.z*s);item.group.rotation.x=hover*-.005;item.group.rotation.y=hover*(item.basePos.x>0?-.005:.005);
      item.face.material.opacity=.18+.82*intro;const rim=item.group.userData.rim,body=item.group.userData.body;rim.material.opacity=hover*.13+press*.2;body.material.opacity=hover*.2+press*.16;body.material.emissiveIntensity=.18+hover*.28;
    }
    for(const u of this.utility){u.hover=lerp(u.hover,this.hovered===u?1:0,1-Math.exp(-dt*11));u.press=lerp(u.press,0,1-Math.exp(-dt*18));u.group.position.z=.09+u.hover*.09-u.press*.04;const s=(u.baseScale.x||1)*(1+u.hover*.025-u.press*.018);u.group.scale.setScalar(s);}

    const active=this.hovered?.accent;for(const beam of this.beams){beam.material.opacity=.012+.016*(.5+.5*Math.sin(t*.72+beam.userData.phase))+(active?.getHex? .006:0);beam.rotation.z=Math.sin(t*.18+beam.userData.phase)*.012;}
    if(this.floorGlow){if(active?.getHex)this.floorGlow.material.color.copy(active);this.floorGlow.material.opacity=lerp(this.floorGlow.material.opacity,active?.getHex?.()? .08:0,1-Math.exp(-dt*4));}

    // Fidelity lock: camera stays fixed at rest. All motion is local to real 3D pieces,
    // so the approved image remains the exact visual baseline instead of drifting against the background.
    this.camera.position.x=lerp(this.camera.position.x,0,1-Math.exp(-dt*5));this.camera.position.y=lerp(this.camera.position.y,0,1-Math.exp(-dt*5));this.camera.lookAt(0,0,0);
    this.updateHits();this.renderer.render(this.scene,this.camera);this.raf=requestAnimationFrame(n=>this.tick(n));
  }

  destroy():void{cancelAnimationFrame(this.raf);this.resizeObserver.disconnect();this.renderer.dispose();this.host.remove();this.menu.classList.remove("studio3d-active");}
}

let active:Studio3D|null=null;
function sync():void{if(!ENABLED)return;const menu=document.querySelector<HTMLElement>(".studio-menu--layered");if(menu&&!active)active=new Studio3D(menu);else if(!menu&&active){active.destroy();active=null;}}
if(ENABLED){const app=document.querySelector("#app");if(app)new MutationObserver(sync).observe(app,{childList:true,subtree:true});sync();}

export {};
