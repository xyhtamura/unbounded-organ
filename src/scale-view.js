/** Dimensioned comparison drawing. No audio or physics state is owned here. */
import { fmtLength, fmtFreq } from './format.js';
import { HEARING_FLOOR_HZ } from './physics.js';
import { drawTube, contactShadow, clampTilt, SUPERSAMPLE, TILT_MIN, TILT_MAX } from './tube-view.js';

// Generic objects have specified dimensions, not claimed average sizes.
export const REFERENCES = [
  { name: 'Ruler', height: 0.01, kind: 'ruler' },
  { name: 'Ruler', height: 0.3, kind: 'ruler' },
  { name: 'Person', height: 1.7, kind: 'person' },
  { name: 'Building', height: 30, kind: 'building' },
  { name: 'Tower', height: 300, kind: 'building' },
  { name: 'Mountain profile', height: 3000, kind: 'mountain' },
  { name: 'Distance', height: 100000, kind: 'ruler' },
  { name: 'Distance', height: 1000000, kind: 'ruler' },
  { name: 'Earth diameter', height: 12742000, kind: 'earth' },
];

export function cameraSpan(length, previous, locked = false) {
  if (locked && previous) return previous;
  if (previous && length / previous >= 0.24 && length / previous <= 0.78) return previous;
  return length * 1.8;
}

export function createScaleView(root) {
  const canvas = root.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const summary = root.querySelector('[data-summary]');
  const lock = root.querySelector('[data-lock]');
  const note = root.querySelector('[data-mode-note]');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let pipe, span, target, locked = false, frame = 0, lastTime = 0;
  // Rotation is decorative. Every dimension stays in the summary text, the
  // aria-label, and the vertical scale, none of which the spin touches.
  const view = { spin: 0.9, tilt: 0.26, dragging: false, x: 0, y: 0, mouse: false };
  let solid = false;
  const schedule = () => { if (!frame) frame = requestAnimationFrame(draw); };
  const label = (text, x, y, color = '#d7cbb0', align = 'left') => {
    ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(text, x, y);
  };
  const line = (x, y, xx, yy, color = '#657c7d') => {
    ctx.strokeStyle = color; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(xx, yy); ctx.stroke();
  };
  function reference(ref, x, base, h) {
    ctx.save(); ctx.translate(x, base);
    ctx.fillStyle = '#748e89'; ctx.strokeStyle = '#a3b8a7'; ctx.lineWidth = 1;
    if (ref.kind === 'person') {
      ctx.beginPath(); ctx.arc(0, -h * .93, h * .07, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = Math.max(1, h * .065); ctx.lineCap = 'round';
      for (const [a,b,c,d] of [[0,-.83,0,-.4],[0,-.75,-.2,-.48],[0,-.75,.2,-.48],[0,-.4,-.14,0],[0,-.4,.14,0]]) {
        line(a*h,b*h,c*h,d*h,'#91aaa1');
      }
    } else if (ref.kind === 'building') {
      const w = h * .3, depth = w * .28;
      ctx.fillRect(-w/2, -h, w, h);
      ctx.fillStyle = '#405856'; ctx.beginPath(); ctx.moveTo(w/2,-h); ctx.lineTo(w/2+depth,-h+depth); ctx.lineTo(w/2+depth,0); ctx.lineTo(w/2,0); ctx.fill();
      ctx.fillStyle = '#c6c6a3';
      for (let row=1; row<10; row++) for(let col=0;col<3;col++) ctx.fillRect(-w*.36+col*w*.28,-h+row*h*.09,w*.12,h*.025);
    } else if (ref.kind === 'earth') {
      const r=h/2;
      const g=ctx.createRadialGradient(-r*.3,-h*.65,r*.05,0,-r,r);
      g.addColorStop(0,'#abc6b0'); g.addColorStop(.6,'#567f82'); g.addColorStop(1,'#263c48');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,-r,r,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='#a5c0b066';
      for(const k of [.35,.7]) {ctx.beginPath();ctx.ellipse(0,-r,r*k,r,0,0,Math.PI*2);ctx.stroke();}
      for(const k of [-.5,0,.5]) {ctx.beginPath();ctx.ellipse(0,-r+r*k,r*Math.sqrt(1-k*k),r*.13,0,0,Math.PI*2);ctx.stroke();}
    } else if (ref.kind === 'mountain') {
      ctx.beginPath();ctx.moveTo(-h*.55,0);ctx.lineTo(0,-h);ctx.lineTo(h*.55,0);ctx.fill();
      ctx.fillStyle='#bbc6b6';ctx.beginPath();ctx.moveTo(0,-h);ctx.lineTo(h*.13,-h*.76);ctx.lineTo(0,-h*.82);ctx.lineTo(-h*.13,-h*.76);ctx.fill();
    } else {
      const w=Math.min(22,Math.max(5,h*.12));ctx.fillStyle='#6b8076';ctx.fillRect(-w/2,-h,w,h);
      for(let i=0;i<=10;i++) line(-w/2,-h*i/10,i%5===0?w/2:0,-h*i/10,'#c4c9ad');
    }
    ctx.restore();
  }
  function draw(time) {
    frame=0;
    if (!pipe || !ctx) return;
    const dt=Math.min(64,lastTime?time-lastTime:16);lastTime=time;
    if(reducedMotion.matches) span=target;
    else span=Math.exp(Math.log(span)+(Math.log(target)-Math.log(span))*(1-Math.exp(-dt/150)));
    if(Math.abs(Math.log(target/span))<.001) span=target;
    const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(devicePixelRatio||1,2);
    if(!w||!h)return;
    // The backing store is drawn larger than the element and downsampled on
    // display, which is the whole of the antialiasing. Offline audio pays no
    // price for it.
    const res=dpr*SUPERSAMPLE;
    if(canvas.width!==Math.round(w*res)||canvas.height!==Math.round(h*res)){canvas.width=Math.round(w*res);canvas.height=Math.round(h*res);}
    ctx.setTransform(res,0,0,res,0,0);ctx.clearRect(0,0,w,h);
    const bg=ctx.createLinearGradient(0,0,0,h);bg.addColorStop(0,'#152325');bg.addColorStop(1,'#26352e');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
    ctx.font=`${w<450?10:12}px "IBM Plex Mono", monospace`;ctx.lineWidth=1;
    const base=h-62, usable=base-42, px=usable/span, x=w*.22;
    const step=10**Math.floor(Math.log10(span/4));
    for(let i=0;i<=span/step;i++){const y=base-i*step*px;line(16,y,w-16,y,'#aec4b012');}
    line(16,base,w-16,base,'#879a7966');
    // References occupy separate comparison lanes; every vertical dimension uses px.
    const visible=REFERENCES.filter(r=>r.height*px>=2&&r.height*px<=usable*1.15);
    const refs=visible.slice(-2);
    refs.forEach((r)=>{
      const rx=w*(REFERENCES.indexOf(r)%2===0?.81:.53);
      ctx.save();
      const referencePixels=r.height*px;
      ctx.globalAlpha=Math.min(1,Math.max(.25,referencePixels/12),Math.max(0,(usable*1.15-referencePixels)/(usable*.15)));
      contactShadow(ctx,rx,base,Math.max(6,Math.min(referencePixels*.3,64)),4);
      reference(r,rx,base,r.height*px);
      label(r.name,rx,base+21,'#b4c5b8','center');
      label(fmtLength(r.height),rx,base+39,'#95a89e','center');
      ctx.restore();
    });
    const actual=pipe.lengthM*px, ph=Math.min(actual,base+20), pw=w<450?21:29, top=base-ph;
    // The tube is drawn only where its mode series is sparse, in frame, and
    // large enough to read. Everywhere else the flat elevation is the drawing.
    solid = pipe.hz >= HEARING_FLOOR_HZ && ph >= 48 && actual <= usable;
    if (solid) {
      drawTube(ctx,{x,base,height:ph,radius:pw/2,mode:pipe.mode,tilt:view.tilt,spin:view.spin,
        envelopeRadius:Math.min(pw*1.2,(x-30))});
    } else {
      const metal=ctx.createLinearGradient(x-pw/2,0,x+pw/2,0);metal.addColorStop(0,'#7e7657');metal.addColorStop(.33,'#e2d5a5');metal.addColorStop(.65,'#b8a979');metal.addColorStop(1,'#6b664c');
      ctx.fillStyle=metal;ctx.fillRect(x-pw/2,top,pw,ph);
      ctx.fillStyle=pipe.mode==='open'?'#17211e':'#d2c69a';ctx.beginPath();ctx.ellipse(x,top,pw/2,5,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#c9bc8d';ctx.stroke();
      ctx.fillStyle='#18231e';if(ph>20)ctx.fillRect(x-pw*.3,base-14,pw*.6,5);
    }
    canvas.style.cursor = solid ? (view.dragging ? 'grabbing' : 'grab') : 'default';
    const noteText = solid ? ' The lobed surface is the fundamental’s pressure envelope; drag to turn the pipe.' : '';
    if (note && note.textContent !== noteText) note.textContent = noteText;
    const bracket=x-pw/2-13;line(bracket,Math.max(32,top),bracket,base,'#d7cbb0');line(bracket-4,base,bracket+4,base,'#d7cbb0');line(bracket-4,Math.max(32,top),bracket+4,Math.max(32,top),'#d7cbb0');
    label(actual>usable?'↑ Extends beyond view':pipe.mode==='open'?'Open pipe':'Stopped pipe',16,23);
    label(fmtLength(pipe.lengthM),x,base+21,'#e6d8ad','center');
    label(fmtFreq(pipe.hz),x,base+39,'#c4ba98','center');
    const bar=step*px;line(w-24-bar,22,w-24,22,'#bac9b5');line(w-24-bar,18,w-24-bar,26,'#bac9b5');line(w-24,18,w-24,26,'#bac9b5');label(fmtLength(step),w-24,42,'#bac9b5','right');
    canvas.dataset.span=String(span);canvas.dataset.pipePixels=String(actual);
    if(span!==target)schedule();else lastTime=0;
  }
  canvas.addEventListener('pointerdown',e=>{
    if(!solid)return;
    view.dragging=true;view.x=e.clientX;view.y=e.clientY;view.mouse=e.pointerType==='mouse';
    try{canvas.setPointerCapture(e.pointerId);}catch{}
    schedule();
  });
  canvas.addEventListener('pointermove',e=>{
    if(!view.dragging)return;
    view.spin+=(e.clientX-view.x)*.012;view.x=e.clientX;
    // Vertical drag is mouse-only; on touch the page keeps that axis for scroll.
    if(view.mouse){view.tilt=clampTilt(view.tilt+(e.clientY-view.y)*.004);view.y=e.clientY;}
    schedule();
  });
  for(const done of ['pointerup','pointercancel']) canvas.addEventListener(done,e=>{
    if(!view.dragging)return;
    view.dragging=false;
    try{if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);}catch{}
    schedule();
  });
  lock.addEventListener('click',()=>{
    locked=!locked;lock.setAttribute('aria-pressed',String(locked));lock.textContent=locked?'Unlock view':'Lock view';
    target=locked?span:cameraSpan(pipe.lengthM,span);schedule();
  });
  root.querySelector('[data-fit]').addEventListener('click',()=>{target=pipe.lengthM*1.8;schedule();});
  new ResizeObserver(schedule).observe(canvas);
  reducedMotion.addEventListener('change',schedule);
  return {update(next){
    pipe=next;target=cameraSpan(pipe.lengthM,target,locked);span??=target;
    const candidates=REFERENCES.filter(r=>r.height<=pipe.lengthM*1.8);
    const nearest=candidates.reduce((a,b)=>Math.abs(Math.log(b.height/pipe.lengthM))<Math.abs(Math.log(a.height/pipe.lengthM))?b:a);
    const ratio=(pipe.lengthM/nearest.height).toLocaleString('en-US',{maximumSignificantDigits:3});
    summary.textContent=`${fmtLength(pipe.lengthM)} · ${ratio} × ${nearest.name.toLowerCase()} (${fmtLength(nearest.height)}).`;
    canvas.setAttribute('aria-label',`${pipe.mode==='open'?'Open':'Stopped'} pipe, ${fmtFreq(pipe.hz)}. ${summary.textContent}`);
    schedule();
  }};
}
