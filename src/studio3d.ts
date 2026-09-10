import "./studio3d.css";

declare global {
  interface Window { THREE?: any; }
}

type ModeKey = "classic" | "daily" | "burn" | "trials" | "together";
type UtilityKey = "stats" | "rules" | "settings";
type InteractiveKey = ModeKey | UtilityKey;

type Crop = { x: number; y: number; w: number; h: number };
type PanelSpec = {
  key: ModeKey;
  crop: Crop;
  px: { x: number; y: number; w: number; h: number };
  color: number;
  glow: number;
  depth: number;
  rotZ: number;
  bridge: string;
};

type Interactive = {
  key: InteractiveKey;
  group: any;
  face: any;
  bridge: string;
  basePos: any;
  baseScale: any;
  baseRot: any;
  hover: number;
  press: number;
  accent: any;
  hit?: HTMLButtonElement;
};

const THREE = window.THREE;
if (!THREE) throw new Error("Studio3D requires Three.js");

const PARAM = new URLSearchParams(location.search).get("menu");
const ENABLED = PARAM === "layered";
const REF_W = 1672;
const REF_H = 941;
const REF_ASPECT = REF_W / REF_H;
const WORLD_H = 10;
const WORLD_W = WORLD_H * REF_ASPECT;
const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)");

const PANEL_SPECS: PanelSpec[] = [
  { key: "classic", crop: { x:125, y:205, w:855, h:470 }, px:{x:125,y:205,w:855,h:470}, color:0xd88800, glow:0xffd34f, depth:.20, rotZ:0, bridge:'[data-mode="classic"]' },
  { key: "daily", crop: { x:950, y:205, w:510, h:250 }, px:{x:950,y:205,w:510,h:250}, color:0x086ec4, glow:0x54d9ff, depth:.17, rotZ:0, bridge:'[data-mode="daily"]' },
  { key: "burn", crop: { x:925, y:450, w:580, h:225 }, px:{x:925,y:450,w:580,h:225}, color:0xa9130e, glow:0xff653e, depth:.17, rotZ:0, bridge:'[data-mode="burn"]' },
  { key: "trials", crop: { x:125, y:670, w:720, h:138 }, px:{x:125,y:670,w:720,h:138}, color:0x4b19a0, glow:0xb77bff, depth:.14, rotZ:0, bridge:'[data-action="journey"]' },
  { key: "together", crop: { x:820, y:670, w:700, h:140 }, px:{x:820,y:670,w:700,h:140}, color:0x07884b, glow:0x55f59b, depth:.14, rotZ:0, bridge:'[data-action="multiplayer"]' }
];

const LOGO_CROP: Crop = { x:435, y:45, w:815, h:160 };

function pxX(x:number): number { return (x / REF_W - .5) * WORLD_W; }
function pxY(y:number): number { return (.5 - y / REF_H) * WORLD_H; }
function pxW(w:number): number { return (w / REF_W) * WORLD_W; }
function pxH(h:number): number { return (h / REF_H) * WORLD_H; }

function clamp(v:number, a=0, b=1): number { return Math.max(a, Math.min(b, v)); }
function easeOutBack(t:number): number {
  t = clamp(t); const c1 = 1.35, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
function lerp(a:number,b:number,t:number):number { return a+(b-a)*t; }

function makeCropTexture(source:any, crop:Crop):any {
  const tex = source.clone();
  tex.needsUpdate = true;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(crop.w / REF_W, crop.h / REF_H);
  tex.offset.set(crop.x / REF_W, 1 - ((crop.y + crop.h) / REF_H));
  if ("colorSpace" in tex && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  if ("encoding" in tex) tex.encoding = THREE.sRGBEncoding;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8;
  return tex;
}

function roundedRectShape(w:number,h:number,r:number):any {
  const s = new THREE.Shape();
  const x=-w/2, y=-h/2;
  s.moveTo(x+r,y); s.lineTo(x+w-r,y); s.quadraticCurveTo(x+w,y,x+w,y+r);
  s.lineTo(x+w,y+h-r); s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  s.lineTo(x+r,y+h); s.quadraticCurveTo(x,y+h,x,y+h-r);
  s.lineTo(x,y+r); s.quadraticCurveTo(x,y,x+r,y);
  return s;
}

function makePanel(spec:PanelSpec, atlas:any):Interactive {
  const group = new THREE.Group();
  const w=pxW(spec.px.w), h=pxH(spec.px.h);
  const bodyGeo = new THREE.ExtrudeGeometry(roundedRectShape(w*.985,h*.965,.08), {
    depth: spec.depth, bevelEnabled:true, bevelSegments:3, steps:1, bevelSize:.035, bevelThickness:.035, curveSegments:8
  });
  bodyGeo.center();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: spec.color, metalness:.42, roughness:.3,
    emissive: new THREE.Color(spec.color).multiplyScalar(.22), emissiveIntensity:.22
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.z = -.08;
  body.castShadow = true;
  group.add(body);

  const faceTex = makeCropTexture(atlas,spec.crop);
  const faceMat = new THREE.MeshBasicMaterial({ map:faceTex, transparent:false, toneMapped:false });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w,h), faceMat);
  face.position.z = spec.depth*.52 + .016;
  face.renderOrder = 3;
  group.add(face);

  const rimMat = new THREE.MeshBasicMaterial({ color:spec.glow, transparent:true, opacity:.0, blending:THREE.AdditiveBlending, depthWrite:false });
  const rim = new THREE.Mesh(new THREE.PlaneGeometry(w*1.012,h*1.028), rimMat);
  rim.position.z = face.position.z - .012;
  rim.renderOrder=2;
  group.add(rim);
  group.userData.rim = rim;
  group.userData.body = body;

  group.position.set(pxX(spec.px.x+spec.px.w/2),pxY(spec.px.y+spec.px.h/2),0);
  group.rotation.z = spec.rotZ;
  const basePos=group.position.clone(), baseScale=group.scale.clone(), baseRot=group.rotation.clone();
  return { key:spec.key,group,face,bridge:spec.bridge,basePos,baseScale,baseRot,hover:0,press:0,accent:new THREE.Color(spec.glow) };
}

function canvasTexture(width:number,height:number,draw:(ctx:CanvasRenderingContext2D,w:number,h:number)=>void):any {
  const c=document.createElement("canvas"); c.width=width; c.height=height;
  const ctx=c.getContext("2d")!; draw(ctx,width,height);
  const tex=new THREE.CanvasTexture(c);
  tex.needsUpdate=true;
  if ("colorSpace" in tex && THREE.SRGBColorSpace) tex.colorSpace=THREE.SRGBColorSpace;
  if ("encoding" in tex) tex.encoding=THREE.sRGBEncoding;
  tex.anisotropy=8;
  return tex;
}

function rr(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number):void {
  ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y+r,r); ctx.arcTo(x,y,x+r,y,r); ctx.closePath();
}

function makeHudTexture(words:string,best:string):any {
  return canvasTexture(760,220,(ctx,w,h)=>{
    ctx.clearRect(0,0,w,h);
    const g=ctx.createLinearGradient(0,0,w,h); g.addColorStop(0,"#0b376f"); g.addColorStop(1,"#061c48");
    ctx.fillStyle=g; rr(ctx,10,10,w-20,h-20,26); ctx.fill();
    ctx.lineWidth=7; ctx.strokeStyle="#1699ff"; ctx.stroke();
    ctx.lineWidth=3; ctx.strokeStyle="#ffb11d"; rr(ctx,18,18,w-36,h-36,22); ctx.stroke();
    ctx.strokeStyle="rgba(255,255,255,.75)"; ctx.lineWidth=4; ctx.beginPath(); ctx.moveTo(w*.49,46);ctx.lineTo(w*.49,h-44);ctx.stroke();
    ctx.fillStyle="#fff"; ctx.font="900 27px Arial"; ctx.textAlign="left"; ctx.fillText("▥",50,80); ctx.font="900 20px Arial"; ctx.fillText("WORDS PLAYED",105,74);
    ctx.font="900 48px Arial"; ctx.fillText(words,105,145);
    ctx.fillStyle="#ffd23d"; ctx.font="900 58px Arial"; ctx.fillText("★",w*.53,92);
    ctx.fillStyle="#fff"; ctx.font="900 20px Arial"; ctx.fillText("BEST SCORE",w*.64,74); ctx.font="900 48px Arial"; ctx.fillText(best,w*.64,145);
  });
}

function makeUtilityTexture(label:string,icon:string):any {
  return canvasTexture(220,220,(ctx,w,h)=>{
    ctx.clearRect(0,0,w,h);
    const grd=ctx.createRadialGradient(w/2,h*.38,8,w/2,h*.42,w*.5); grd.addColorStop(0,"#0a5fa4");grd.addColorStop(1,"#06244e");
    ctx.fillStyle=grd; ctx.beginPath();ctx.arc(w/2,h*.43,68,0,Math.PI*2);ctx.fill();
    ctx.lineWidth=5;ctx.strokeStyle="#71c8ff";ctx.stroke();
    ctx.fillStyle="#fff";ctx.textAlign="center";ctx.font="900 62px Arial";ctx.fillText(icon,w/2,h*.52);
    ctx.font="900 24px Arial";ctx.fillText(label,w/2,h*.92);
  });
}

function makeTextTexture(lines:string[],opts:{w?:number,h?:number,size?:number,color?:string,weight?:string}={}):any {
  const w=opts.w??512,h=opts.h??180,size=opts.size??44;
  return canvasTexture(w,h,(ctx)=>{
    ctx.clearRect(0,0,w,h); ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillStyle=opts.color??"#9ec9ff"; ctx.font=`${opts.weight??"900"} ${size}px Arial`;
    const gap=size*1.15, y0=h/2-(lines.length-1)*gap/2;
    lines.forEach((line,i)=>ctx.fillText(line,w/2,y0+i*gap));
  });
}

function makeGlowSprite(color:number,scale:number):any {
  const tex=canvasTexture(128,128,(ctx,w,h)=>{
    const g=ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);
    const c=new THREE.Color(color); const rgb=`${Math.round(c.r*255)},${Math.round(c.g*255)},${Math.round(c.b*255)}`;
    g.addColorStop(0,`rgba(${rgb},.9)`);g.addColorStop(.18,`rgba(${rgb},.38)`);g.addColorStop(1,`rgba(${rgb},0)`);
    ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  });
  const mat=new THREE.SpriteMaterial({map:tex,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:.65});
  const s=new THREE.Sprite(mat);s.scale.set(scale,scale,1);return s;
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
  private beamGroup:any;
  private floorGlow:any;
  private logo:any;
  private floatTiles:any[]=[];
  private a11y:HTMLElement;
  private mobile=false;
  private resizeObserver:ResizeObserver;

  constructor(menu:HTMLElement){
    this.menu=menu;
    menu.classList.add("studio3d-active");
    this.host=document.createElement("div"); this.host.className="studio3d-host";
    this.stage=document.createElement("div"); this.stage.className="studio3d-stage";
    const loading=document.createElement("div");loading.className="studio3d-loading";loading.textContent="BUILDING THE STUDIO";
    this.a11y=document.createElement("div");this.a11y.className="studio3d-a11y";
    this.stage.append(loading,this.a11y);this.host.append(this.stage);menu.append(this.host);

    this.scene=new THREE.Scene(); this.scene.background=new THREE.Color(0x020816);
    this.camera=new THREE.OrthographicCamera(-WORLD_W/2,WORLD_W/2,WORLD_H/2,-WORLD_H/2,-30,40);
    this.camera.position.set(0,0,12);
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:"high-performance",stencil:false});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
    this.renderer.setSize(2,2,false);
    if ("outputColorSpace" in this.renderer && THREE.SRGBColorSpace) this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    if ("outputEncoding" in this.renderer) this.renderer.outputEncoding=THREE.sRGBEncoding;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.02;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.canvas=this.renderer.domElement;this.canvas.className="studio3d-canvas";this.canvas.tabIndex=-1;
    this.stage.prepend(this.canvas);
    this.root=new THREE.Group();this.scene.add(this.root);

    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(this.stage);
    this.resize();
    this.bindPointer();
    void this.load();
  }

  private async load():Promise<void>{
    const loader=new THREE.TextureLoader();
    [this.atlas,this.empty]=await Promise.all([
      loader.loadAsync("/assets/menu/studio-championship.webp"),
      loader.loadAsync("/assets/menu/studio-empty.png")
    ]);
    for(const t of [this.atlas,this.empty]){
      if("colorSpace" in t && THREE.SRGBColorSpace)t.colorSpace=THREE.SRGBColorSpace;
      if("encoding" in t)t.encoding=THREE.sRGBEncoding;
      t.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());
    }
    this.buildScene();
    this.resize();
    this.host.classList.add("studio3d-ready");
    this.raf=requestAnimationFrame((t)=>this.tick(t));
  }

  private buildScene():void{
    const ambient=new THREE.HemisphereLight(0x84bfff,0x061025,.82);this.scene.add(ambient);
    const key=new THREE.DirectionalLight(0xffffff,1.15);key.position.set(-5,9,9);this.scene.add(key);
    const warm=new THREE.PointLight(0xffaa36,1.1,20,2);warm.position.set(0,-4,7);this.scene.add(warm);

    const backMat=new THREE.MeshBasicMaterial({map:this.empty,toneMapped:false});
    const back=new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W,WORLD_H),backMat);back.position.z=-1.3;this.root.add(back);

    const floor=new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W*1.1,2.1),new THREE.MeshPhysicalMaterial({color:0x061633,metalness:.75,roughness:.18,clearcoat:1,clearcoatRoughness:.12,transparent:true,opacity:.72}));
    floor.position.set(0,-4.18,-.62);floor.rotation.x=-.36;floor.receiveShadow=true;this.root.add(floor);
    const ring=new THREE.Mesh(new THREE.RingGeometry(3.35,3.43,128),new THREE.MeshBasicMaterial({color:0xffb238,side:THREE.DoubleSide,transparent:true,opacity:.48,blending:THREE.AdditiveBlending,depthWrite:false}));
    ring.scale.y=.31;ring.position.set(0,-4.26,-.15);this.root.add(ring);this.floorGlow=ring;

    this.beamGroup=new THREE.Group();this.root.add(this.beamGroup);
    [-5.4,-2.8,0,2.8,5.4].forEach((x,i)=>{
      const geo=new THREE.ConeGeometry(.78,6.6,24,1,true);
      const mat=new THREE.MeshBasicMaterial({color:i===2?0xeaf9ff:0x7bd6ff,transparent:true,opacity:.055,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,depthWrite:false});
      const beam=new THREE.Mesh(geo,mat);beam.position.set(x,2.2,-.55);beam.rotation.z=(x/5.4)*-.06;beam.userData.phase=i*.9;this.beamGroup.add(beam);
      const glow=makeGlowSprite(i===2?0xffffff:0x5bc8ff,1.25);glow.position.set(x,4.64,.05);this.root.add(glow);
    });

    PANEL_SPECS.forEach((spec)=>{ const item=makePanel(spec,this.atlas); this.interactives.push(item);this.root.add(item.group); });

    const logoTex=makeCropTexture(this.atlas,LOGO_CROP);
    const lw=pxW(LOGO_CROP.w),lh=pxH(LOGO_CROP.h);
    const logoBack=new THREE.Mesh(new THREE.BoxGeometry(lw*.98,lh*.78,.16),new THREE.MeshStandardMaterial({color:0xead8ad,metalness:.08,roughness:.42}));
    logoBack.position.set(pxX(LOGO_CROP.x+LOGO_CROP.w/2),pxY(LOGO_CROP.y+LOGO_CROP.h/2),-.08);this.root.add(logoBack);
    this.logo=new THREE.Mesh(new THREE.PlaneGeometry(lw,lh),new THREE.MeshBasicMaterial({map:logoTex,toneMapped:false}));
    this.logo.position.set(pxX(LOGO_CROP.x+LOGO_CROP.w/2),pxY(LOGO_CROP.y+LOGO_CROP.h/2),.025);this.root.add(this.logo);

    this.buildHud();this.buildSideCopy();this.buildFloatingTiles();this.buildA11y();
  }

  private readStats():[string,string]{
    const vals=Array.from(this.menu.querySelectorAll<HTMLElement>(".studio-record strong")).map(e=>e.textContent?.trim()||"0");
    return [vals[0]||"0",vals[1]||"0"];
  }

  private buildHud():void{
    const [words,best]=this.readStats();
    const hudTex=makeHudTexture(words,best);
    const hud=new THREE.Mesh(new THREE.PlaneGeometry(pxW(380),pxH(115)),new THREE.MeshBasicMaterial({map:hudTex,transparent:true,toneMapped:false}));
    hud.position.set(pxX(226),pxY(113.5),.08);this.root.add(hud);

    const specs:[UtilityKey,string,string,string,number][]=[
      ["stats","STATS","♜",'[data-action="stats"]',1290],
      ["rules","RULES","▤",'[data-action="help"]',1414],
      ["settings","SETTINGS","⚙",'[data-action="settings"]',1538]
    ];
    for(const [key,label,icon,bridge,x] of specs){
      const tex=makeUtilityTexture(label,icon);
      const g=new THREE.Group();
      const disc=new THREE.Mesh(new THREE.CylinderGeometry(.42,.42,.12,48),new THREE.MeshStandardMaterial({color:0x0a3c76,metalness:.35,roughness:.3,emissive:0x0a4f92,emissiveIntensity:.18}));
      disc.rotation.x=Math.PI/2;g.add(disc);
      const face=new THREE.Mesh(new THREE.PlaneGeometry(1.38,1.38),new THREE.MeshBasicMaterial({map:tex,transparent:true,toneMapped:false}));face.position.z=.075;g.add(face);
      g.position.set(pxX(x),pxY(113),.13);this.root.add(g);
      this.utility.push({key,group:g,face,bridge,basePos:g.position.clone(),baseScale:g.scale.clone(),baseRot:g.rotation.clone(),hover:0,press:0,accent:new THREE.Color(0x59c9ff)});
    }
  }

  private buildSideCopy():void{
    const leftTex=makeTextTexture(["SMALL","WORDS","BIG","MINDS"],{w:260,h:400,size:48,color:"#8fc9ff"});
    const left=new THREE.Mesh(new THREE.PlaneGeometry(1.65,2.55),new THREE.MeshBasicMaterial({map:leftTex,transparent:true,toneMapped:false}));left.position.set(pxX(65),pxY(410),-.05);this.root.add(left);
    const rightTex=makeTextTexture(["PLAY","LEARN","IMPROVE","EVERY DAY"],{w:300,h:400,size:40,color:"#8fc9ff"});
    const right=new THREE.Mesh(new THREE.PlaneGeometry(1.75,2.55),new THREE.MeshBasicMaterial({map:rightTex,transparent:true,toneMapped:false}));right.position.set(pxX(1606),pxY(410),-.05);this.root.add(right);
    const tagTex=makeTextTexture(["A   B R I G H T E R   M I N D","O N E   W O R D   A T   A   T I M E"],{w:800,h:120,size:28,color:"#79bfff",weight:"800"});
    const tag=new THREE.Mesh(new THREE.PlaneGeometry(5.9,.8),new THREE.MeshBasicMaterial({map:tagTex,transparent:true,toneMapped:false}));tag.position.set(0,pxY(862),.06);this.root.add(tag);
  }

  private tileTexture(letter:string):any{
    return canvasTexture(256,256,(ctx,w,h)=>{
      const g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,"#fffdf4");g.addColorStop(.72,"#f4e6c4");g.addColorStop(1,"#cfac6d");
      ctx.fillStyle=g;rr(ctx,10,10,w-20,h-20,30);ctx.fill();ctx.lineWidth=9;ctx.strokeStyle="#fff5d9";ctx.stroke();
      ctx.fillStyle="#082653";ctx.textAlign="center";ctx.textBaseline="middle";ctx.font="900 150px Arial";ctx.fillText(letter,w/2,h*.55);
    });
  }

  private buildFloatingTiles():void{
    const letters="WORDPLAYMAKE";
    for(let i=0;i<9;i++){
      const tex=this.tileTexture(letters[i%letters.length]);
      const group=new THREE.Group();
      const box=new THREE.Mesh(new THREE.BoxGeometry(.55,.55,.12),new THREE.MeshStandardMaterial({color:0xd8bd83,roughness:.34,metalness:.06}));group.add(box);
      const face=new THREE.Mesh(new THREE.PlaneGeometry(.55,.55),new THREE.MeshBasicMaterial({map:tex,toneMapped:false}));face.position.z=.066;group.add(face);
      const side=i%2===0?-1:1;group.position.set(side*(7.8+Math.random()*.65),-4.3+Math.random()*8.4,.2+Math.random()*.8);group.rotation.z=(Math.random()-.5)*.7;
      group.userData={phase:Math.random()*Math.PI*2,speed:.25+Math.random()*.22,side,home:group.position.clone()};this.root.add(group);this.floatTiles.push(group);
    }
  }

  private buildA11y():void{
    for(const item of [...this.interactives,...this.utility]){
      const b=document.createElement("button");b.className="studio3d-hit";b.type="button";b.setAttribute("aria-label",item.key==="together"?"Play Together":item.key==="trials"?"Open Trials":item.key.charAt(0).toUpperCase()+item.key.slice(1));
      b.addEventListener("focus",()=>this.setHover(item));b.addEventListener("blur",()=>this.setHover(null));
      b.addEventListener("pointerenter",()=>this.setHover(item));b.addEventListener("pointerleave",()=>{if(this.hovered===item)this.setHover(null)});
      b.addEventListener("pointerdown",()=>this.press(item));b.addEventListener("click",()=>this.activate(item));
      this.a11y.append(b);item.hit=b;
    }
  }

  private bindPointer():void{
    this.canvas.addEventListener("pointermove",(e:PointerEvent)=>{
      const r=this.canvas.getBoundingClientRect();this.pointer.x=((e.clientX-r.left)/r.width)*2-1;this.pointer.y=-((e.clientY-r.top)/r.height)*2+1;
    });
    this.canvas.addEventListener("pointerleave",()=>{this.pointer.set(-9,-9);this.setHover(null)});
    this.canvas.addEventListener("pointerdown",()=>{if(this.hovered)this.press(this.hovered)});
    this.canvas.addEventListener("pointerup",()=>{if(this.hovered)this.activate(this.hovered)});
    document.addEventListener("visibilitychange",()=>{this.visible=!document.hidden;if(this.visible&&!this.raf)this.raf=requestAnimationFrame(t=>this.tick(t));});
  }

  private setHover(item:Interactive|null):void{
    if(this.hovered===item)return;this.hovered=item;
    this.canvas.style.cursor=item?"pointer":"default";
  }
  private press(item:Interactive):void{item.press=1;}
  private activate(item:Interactive):void{
    const bridge=this.menu.querySelector<HTMLElement>(item.bridge);
    if(!bridge)return;
    item.press=1;
    this.flash(item.accent);
    window.setTimeout(()=>bridge.click(),REDUCED.matches?0:230);
  }

  private flash(color:any):void{
    const s=makeGlowSprite(color.getHex(),7.5);s.position.set(0,0,4);s.material.opacity=.52;this.scene.add(s);
    const started=performance.now();
    const fade=()=>{const t=(performance.now()-started)/360;s.material.opacity=.52*(1-clamp(t));s.scale.setScalar(7.5+4*t);if(t<1)requestAnimationFrame(fade);else{this.scene.remove(s);s.material.dispose();s.material.map?.dispose();}};requestAnimationFrame(fade);
  }

  private raycast():void{
    if(!this.interactives.length)return;
    this.raycaster.setFromCamera(this.pointer,this.camera);
    const all=[...this.interactives,...this.utility];
    const hits=this.raycaster.intersectObjects(all.map(x=>x.face),false);
    if(!hits.length){if(!this.a11y.matches(":focus-within"))this.setHover(null);return;}
    const hit=all.find(x=>x.face===hits[0].object)||null;if(hit)this.setHover(hit);
  }

  private resize():void{
    const r=this.stage.getBoundingClientRect();if(!r.width||!r.height)return;
    this.mobile=r.width/r.height<.8;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,this.mobile?1.45:2));
    this.renderer.setSize(r.width,r.height,false);
    if(this.mobile){
      const aspect=r.width/r.height;const h=16.4,w=h*aspect;this.camera.left=-w/2;this.camera.right=w/2;this.camera.top=h/2;this.camera.bottom=-h/2;
    }else{
      const aspect=r.width/r.height;let w=WORLD_W,h=WORLD_H;if(aspect>REF_ASPECT)w=h*aspect;else h=w/aspect;
      this.camera.left=-w/2;this.camera.right=w/2;this.camera.top=h/2;this.camera.bottom=-h/2;
    }
    this.camera.updateProjectionMatrix();
    this.applyLayout();
  }

  private applyLayout():void{
    if(!this.interactives.length)return;
    if(!this.mobile){
      for(const item of this.interactives){const spec=PANEL_SPECS.find(p=>p.key===item.key)!;item.basePos.set(pxX(spec.px.x+spec.px.w/2),pxY(spec.px.y+spec.px.h/2),0);item.group.scale.set(1,1,1);item.baseScale.set(1,1,1);}
      if(this.logo){this.logo.position.set(pxX(LOGO_CROP.x+LOGO_CROP.w/2),pxY(LOGO_CROP.y+LOGO_CROP.h/2),.025);this.logo.scale.set(1,1,1);}
      return;
    }
    const map:Record<ModeKey,[number,number,number]>={classic:[0,3.0,.82],daily:[0,.2,.92],burn:[0,-2.05,.82],trials:[0,-4.05,.9],together:[0,-5.55,.9]};
    for(const item of this.interactives){const [x,y,s]=map[item.key];item.basePos.set(x,y,0);item.baseScale.set(s,s,s);item.group.scale.copy(item.baseScale);}
    if(this.logo){this.logo.position.set(0,6.65,.05);this.logo.scale.set(.72,.72,.72);}
    for(let i=0;i<this.utility.length;i++){const u=this.utility[i];u.basePos.set(-1.55+i*1.55,5.45,.1);u.group.position.copy(u.basePos);u.baseScale.set(.78,.78,.78);u.group.scale.copy(u.baseScale);}
  }

  private updateHits():void{
    const r=this.stage.getBoundingClientRect();
    for(const item of [...this.interactives,...this.utility]){
      if(!item.hit)continue;
      const box=new THREE.Box3().setFromObject(item.group);const min=box.min.clone().project(this.camera),max=box.max.clone().project(this.camera);
      const x1=(min.x*.5+.5)*r.width,y1=(-max.y*.5+.5)*r.height,x2=(max.x*.5+.5)*r.width,y2=(-min.y*.5+.5)*r.height;
      item.hit.style.left=`${(x1+x2)/2}px`;item.hit.style.top=`${(y1+y2)/2}px`;item.hit.style.width=`${Math.max(42,x2-x1)}px`;item.hit.style.height=`${Math.max(38,y2-y1)}px`;
    }
  }

  private tick(now:number):void{
    this.raf=0;if(!this.visible||!this.menu.isConnected)return;
    const dt=Math.min(.05,(now-this.last)/1000);this.last=now;const t=(now-this.start)/1000;
    this.raycast();

    for(let i=0;i<this.interactives.length;i++){
      const item=this.interactives[i];const delay=i*.055;const inT=REDUCED.matches?1:easeOutBack(clamp((t-.22-delay)/.68));
      item.hover=lerp(item.hover,this.hovered===item?1:0,1-Math.exp(-dt*10));item.press=lerp(item.press,0,1-Math.exp(-dt*14));
      const hover=item.hover, press=item.press;
      const yOffset=(1-inT)*-1.15;item.group.position.x=lerp(item.group.position.x,item.basePos.x,1-Math.exp(-dt*16));item.group.position.y=item.basePos.y+yOffset+hover*.035;
      item.group.position.z=hover*.32-press*.16;
      const s=(.9+.1*inT)*(1+hover*.017-press*.014);item.group.scale.set(item.baseScale.x*s,item.baseScale.y*s,item.baseScale.z*s);
      item.group.rotation.z=item.baseRot.z+(this.hovered===item?Math.sin(t*3+i)*.0018:0);
      item.group.rotation.x=hover*-.025;item.group.rotation.y=hover*(item.basePos.x>0?-.026:.026);
      const rim=item.group.userData.rim;rim.material.opacity=hover*.24+press*.35;
      const body=item.group.userData.body;body.material.emissiveIntensity=.2+hover*.45;
    }

    for(const u of this.utility){
      u.hover=lerp(u.hover,this.hovered===u?1:0,1-Math.exp(-dt*10));u.press=lerp(u.press,0,1-Math.exp(-dt*14));
      u.group.position.z=.13+u.hover*.18-u.press*.08;const s=(u.baseScale.x||1)*(1+u.hover*.06-u.press*.04);u.group.scale.setScalar(s);
    }

    if(this.logo&&!this.mobile){
      const li=REDUCED.matches?1:easeOutBack(clamp((t-.02)/.72));this.logo.position.y=pxY(LOGO_CROP.y+LOGO_CROP.h/2)+(1-li)*1.1;this.logo.rotation.z=Math.sin(t*.7)*.0015;
    }

    if(this.beamGroup){
      this.beamGroup.children.forEach((b:any,i:number)=>{b.material.opacity=.04+.045*(.5+.5*Math.sin(t*.9+b.userData.phase));b.rotation.z=(i-2)*-.028+Math.sin(t*.22+i)*.018;});
    }
    if(this.floorGlow){this.floorGlow.material.opacity=.40+.10*Math.sin(t*1.3);}
    for(const tile of this.floatTiles){
      const ud=tile.userData;tile.position.y=ud.home.y+Math.sin(t*ud.speed+ud.phase)*.32;tile.position.x=ud.home.x+Math.sin(t*ud.speed*.7+ud.phase)*.12;tile.rotation.z+=dt*.08*ud.side;tile.rotation.y=Math.sin(t*.35+ud.phase)*.18;
    }

    const targetX=this.hovered?this.hovered.basePos.x*.018:Math.sin(t*.17)*.018;
    const targetY=this.hovered?this.hovered.basePos.y*.012:Math.sin(t*.13)*.012;
    this.camera.position.x=lerp(this.camera.position.x,targetX,1-Math.exp(-dt*3));this.camera.position.y=lerp(this.camera.position.y,targetY,1-Math.exp(-dt*3));
    this.camera.lookAt(this.camera.position.x,this.camera.position.y,0);

    this.updateHits();this.renderer.render(this.scene,this.camera);
    this.raf=requestAnimationFrame((n)=>this.tick(n));
  }

  destroy():void{
    cancelAnimationFrame(this.raf);this.resizeObserver.disconnect();this.renderer.dispose();this.host.remove();this.menu.classList.remove("studio3d-active");
  }
}

let active:Studio3D|null=null;
function sync():void{
  if(!ENABLED)return;
  const menu=document.querySelector<HTMLElement>(".studio-menu--layered");
  if(menu && !active)active=new Studio3D(menu);
  else if(!menu && active){active.destroy();active=null;}
}

if(ENABLED){
  const app=document.querySelector("#app");if(app)new MutationObserver(sync).observe(app,{childList:true,subtree:true});
  sync();
}

export {};
