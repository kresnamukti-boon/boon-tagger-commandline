/* Boon Region Workbench — console loader.
 * Usage: F12 -> Console -> paste this entire block -> Enter.
 * Installs the full workbench (regions, mask tools, undo, commit, helpers).
 * Paste again after each page navigation. Nothing persists server-side until you Save. */
(async function(){
  function ready(){
    return typeof annotationState !== 'undefined'
        && annotationState.annotations
        && document.getElementById('pdf-canvas')
        && document.getElementById('annotation-canvas')
        && document.getElementById('right-rail-content');
  }
  // wait for app (up to 30s) — safe to paste immediately on page load
  for (let i=0; i<60 && !ready(); i++) await new Promise(r=>setTimeout(r,500));
  if (!ready()){ console.warn('[RW] app not ready after 30s — try pasting again once the page renders'); return; }
  await new Promise(r=>setTimeout(r,600)); // let the canvas settle

// ===== rw_panelux.js =====
// RW v2.8 — collapsible panel + master killswitch.
// MUST be loaded FIRST (before rw_install): wraps annotation-canvas's
// addEventListener so every handler registered by later modules auto-checks
// RW.enabled.
(function boot(){
  'use strict';

  // __RW doesn't exist yet (rw_install creates it) — RW.enabled must still be
  // readable before then, so the gate lives on a separate object until retrofit().
  if (!window.__RWgate) window.__RWgate = { enabled: true };
  const gate = window.__RWgate;

  /* ---------- auto-gate all annotation-canvas listeners ---------- */
  const ac = document.getElementById('annotation-canvas');
  if (ac && !ac.__RWrawAdd){
    ac.__RWrawAdd = ac.addEventListener;
    ac.addEventListener = function(type, handler, options){
      const wrapped = function(e){
        if (!window.__RWgate || !window.__RWgate.enabled) return;
        return handler.call(this, e);
      };
      return ac.__RWrawAdd.call(ac, type, wrapped, options);
    };
  }

  // Also wrap window keydown (capture) for the modules that attach there
  if (!window.__RWrawAddKey){
    window.__RWrawAddKey = window.addEventListener;
    window.addEventListener = function(type, handler, options){
      if (type === 'keydown' && options === true){
        const wrapped = function(e){
          if (!window.__RWgate || !window.__RWgate.enabled) return;
          return handler.call(this, e);
        };
        return window.__RWrawAddKey.call(window, type, wrapped, options);
      }
      return window.__RWrawAddKey.call(window, type, handler, options);
    };
  }

  /* ---------- post-init: retrofits panel after all modules loaded ---------- */
  function retrofit(){
    const RW = window.__RW;
    if (!RW) return;
    const panel = document.getElementById('rw-panel');
    if (!panel) return;

    RW.enabled = gate.enabled;
    RW.v28 = true;

    // wrap existing panel children into a collapsible body
    const body = document.createElement('div');
    body.id = 'rw-body';
    while (panel.firstChild) body.appendChild(panel.firstChild);
    panel.appendChild(body);

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:6px;padding:2px 0;cursor:pointer;user-select:none;';

    const caret = document.createElement('span');
    caret.id = 'rw-collapse';
    caret.style.cssText = 'font-size:11px;flex:none;';
    caret.innerHTML = '&#9660;';
    caret.title = 'Collapse Region Workbench';
    caret.onclick = (e)=>{ e.stopPropagation(); RW.setPanelExpanded(!RW.panelExpanded); };

    const title = document.createElement('b');
    title.innerText = 'Region Workbench';
    title.style.cssText = 'font-size:12px;flex:1;';

    const enableBtn = document.createElement('button');
    enableBtn.id = 'rw-enable';
    enableBtn.style.cssText = 'font-size:11px;padding:1px 6px;flex:none;border-radius:3px;';
    enableBtn.onclick = (e)=>{ e.stopPropagation(); RW.setEnabled(!RW.enabled); };

    header.appendChild(caret);
    header.appendChild(title);
    header.appendChild(enableBtn);
    header.onclick = (e)=>{
      if (e.target === header || e.target === title) RW.setPanelExpanded(!RW.panelExpanded);
    };
    panel.insertBefore(header, body);

    panel.style.position = 'relative';
    panel.style.resize = 'vertical';
    panel.style.overflow = 'auto';
    panel.style.minHeight = '32px';
    panel.style.maxHeight = '50%';

    /* ---------- panel state ---------- */
    RW.panelExpanded = true;
    RW.setPanelExpanded = function(on){
      RW.panelExpanded = !!on;
      const p = document.getElementById('rw-panel');
      const b = document.getElementById('rw-body');
      const c = document.getElementById('rw-collapse');
      if (!p || !c) return;
      if (RW.panelExpanded){
        p.style.maxHeight = '50%';
        if (b) b.style.display = '';
        c.innerHTML = '&#9660;';
        c.title = 'Collapse Region Workbench';
      } else {
        p.style.maxHeight = '32px';
        if (b) b.style.display = 'none';
        c.innerHTML = '&#9654;';
        c.title = 'Expand Region Workbench';
      }
    };

    RW.setEnabled = function(on){
      gate.enabled = !!on;
      RW.enabled = !!on;
      const btn = document.getElementById('rw-enable');
      if (btn){
        btn.innerText = 'RW: ' + (RW.enabled ? 'ON' : 'OFF');
        btn.style.background = RW.enabled ? 'rgba(100,220,100,0.25)' : 'rgba(220,100,100,0.30)';
      }
      const overlay = document.getElementById('rw-overlay');
      if (overlay){
        if (RW.overlayHidden) overlay.style.display = 'none';
        else overlay.style.opacity = RW.enabled ? '0.55' : '0.12';
      }
      if (!RW.enabled){
        RW.maskMode = null; RW.maskMode2 = null; RW.setPick(false);
        RW._polyPtsN = []; RW.__rectStartN = null; RW.__rectCurN = null;
        const av = document.getElementById('annotation-canvas');
        if (av) av.style.cursor = '';
        ['rw-polyline','rw-rectline','rw-brushline','rw-commitpreview'].forEach(id=>{
          const el = document.getElementById(id); if(el) el.remove();
        });
        if (RW._syncRectBtn) RW._syncRectBtn();
        if (RW._syncToolButtons) RW._syncToolButtons();
      }
    };

    RW.setEnabled(true);
    RW.setPanelExpanded(true);
  }

  // The panel is built by rw_install (v2). Schedule retrofit after all modules run.
  setTimeout(retrofit, 100);
  // Backup: if setTimeout fires before rw_install, poll
  let tries = 0;
  const poll = setInterval(() => {
    tries++;
    const p = document.getElementById('rw-panel');
    if (p && p.children.length > 0){
      if (!document.getElementById('rw-collapse')){
        retrofit();
        clearInterval(poll);
      }
    }
    if (tries > 80) clearInterval(poll);
  }, 250);

  return 'v2.8 boot: listener gate + panel UX pending';
})()

;
// ===== rw_install.js =====
// Region Workbench v2 — single-shot installer.
// Paste-injected via OpenCLI eval. All listeners named/registered once.
(function(){
  if (window.__RW && window.__RW.v === 2) return 'RW v2 already installed';

  const RW = window.__RW = { v: 2, W: 2592, H: 1728, selected: new Set(), hovered: null, pickMode: false };

  /* ---------- segmentation ---------- */
  RW.extract = function(){
    const src = document.getElementById('pdf-canvas');
    // scale extraction resolution to native canvas size so thin lines survive
    let {W,H} = RW;
    const nw = src.width, nh = src.height;
    if (nw && nh && (nw > W*1.3 || nh > H*1.3)){
      W = RW.W = Math.min(nw, 3888);
      H = RW.H = Math.round(W * (nh/nw));
      RW._areaFloor = Math.round(2500 * (W*H) / (2592*1728));
    }
    const areaFloor = RW._areaFloor != null ? RW._areaFloor : 2500;
    const cv = document.createElement('canvas'); cv.width=W; cv.height=H;
    const ctx = cv.getContext('2d');
    ctx.drawImage(src, 0, 0, W, H);
    const d = ctx.getImageData(0,0,W,H).data;
    let wall = new Uint8Array(W*H);
    for (let i=0;i<W*H;i++){
      // min RGB channel catches colored (yellow/green/blue) lines too, not just black
      const minChan = Math.min(d[i*4], d[i*4+1], d[i*4+2]);
      if (minChan < 200) wall[i]=1;
    }
    // no morphological pass — mask boundary sits exactly at the line edge
    // knock out existing annotations
    const c2 = document.createElement('canvas'); c2.width=W; c2.height=H;
    const x2 = c2.getContext('2d');
    for (const a of annotationState.annotations){
      if (a._hidden || a.is_void) continue;
      // Array.isArray guard: bbox-type annotations store {x,y,width,height}, not a point
      // array — pts.length<3 wouldn't catch that (undefined<3 is false) and crashes .forEach.
      const pts = a.coordinates; if (!Array.isArray(pts) || !pts.length) continue;
      x2.fillStyle='#000';
      x2.beginPath();
      pts.forEach((p,i)=>{ const X=p.x*W, Y=p.y*H; i?x2.lineTo(X,Y):x2.moveTo(X,Y); });
      x2.closePath(); x2.fill();
    }
    const dd = x2.getImageData(0,0,W,H).data;
    for (let i=0;i<W*H;i++) if (dd[i*4+3]>127) wall[i]=1;
    // background flood from border
    const seen = new Uint8Array(W*H);
    const q=[];
    for (let x=0;x<W;x++){ q.push(x,(H-1)*W+x); }
    for (let y=0;y<H;y++){ q.push(y*W,y*W+W-1); }
    while(q.length){
      const i=q.pop();
      if (seen[i]||wall[i]) continue;
      seen[i]=1;
      const x=i%W, y=(i/W)|0;
      if(x>0)q.push(i-1); if(x<W-1)q.push(i+1);
      if(y>0)q.push(i-W); if(y<H-1)q.push(i+W);
    }
    // label enclosed components
    const labels = new Int32Array(W*H).fill(-1);
    let nComp=0; const sizes=[];
    for (let s=0;s<W*H;s++){
      if (seen[s]||wall[s]||labels[s]>=0) continue;
      const stack=[s]; labels[s]=nComp; let size=0;
      while(stack.length){
        const i=stack.pop(); size++;
        const x=i%W, y=(i/W)|0;
        if(x>0&&!seen[i-1]&&!wall[i-1]&&labels[i-1]<0){labels[i-1]=nComp;stack.push(i-1);}
        if(x<W-1&&!seen[i+1]&&!wall[i+1]&&labels[i+1]<0){labels[i+1]=nComp;stack.push(i+1);}
        if(y>0&&!seen[i-W]&&!wall[i-W]&&labels[i-W]<0){labels[i-W]=nComp;stack.push(i-W);}
        if(y<H-1&&!seen[i+W]&&!wall[i+W]&&labels[i+W]<0){labels[i+W]=nComp;stack.push(i+W);}
      }
      sizes.push(size); nComp++;
    }
    RW.labels=labels; RW.nComp=nComp; RW.wall=wall;
    RW.regions = sizes.map((size,id)=>({id, size, included: size>=areaFloor, group: id, color:'hsl('+((id*67)%360)+',70%,55%)'}));
    return {components:nComp, kept: RW.regions.filter(r=>r.included).length, W, H};
  };

  /* ---------- overlay ---------- */
  RW.renderOverlay = function(){
    const {W,H,labels,regions,selected,hovered} = RW;
    const old = document.getElementById('rw-overlay'); if(old) old.remove();
    const cv = document.createElement('canvas'); cv.width=W; cv.height=H;
    cv.id='rw-overlay';
    cv.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:45;opacity:0.55;image-rendering:auto;';
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(W,H);
    const tmp = document.createElement('canvas').getContext('2d');
    const groupColor = {};
    for (const r of regions){
      if (!r.included || (r.group in groupColor)) continue;
      tmp.fillStyle = r.color;
      groupColor[r.group] = tmp.fillStyle.match(/\d+/g).map(Number);
    }
    for (let i=0;i<W*H;i++){
      const l = labels[i];
      if (l<0) continue;
      const r = regions[l];
      if (!r || !r.included) continue;
      const c = groupColor[r.group] || [200,200,200];
      let a = 110;
      if (selected.has(r.group)) a = 255;
      else if (hovered === r.group) a = 220;
      img.data[i*4]=c[0]; img.data[i*4+1]=c[1]; img.data[i*4+2]=c[2]; img.data[i*4+3]=a;
    }
    if (selected.size){
      for (let y=1;y<H-1;y++) for (let x=1;x<W-1;x++){
        const i=y*W+x; const l=labels[i];
        if (l<0) continue;
        const r=regions[l]; if(!r||!selected.has(r.group)) continue;
        const g = (ll)=> ll>=0 && regions[ll] && selected.has(regions[ll].group);
        if (!g(labels[i-1])||!g(labels[i+1])||!g(labels[i-W])||!g(labels[i+W])){
          img.data[i*4]=255; img.data[i*4+1]=255; img.data[i*4+2]=255; img.data[i*4+3]=255;
        }
      }
    }
    ctx.putImageData(img,0,0);
    document.getElementById('pdf-container').appendChild(cv);
    if (RW.overlayHidden) cv.style.display = 'none';
  };

  /* ---------- panel ---------- */
  RW.buildPanel = function(){
    const old = document.getElementById('rw-panel'); if(old) old.remove();
    const rail = document.getElementById('right-rail-content');
    const panel = document.createElement('div');
    panel.id='rw-panel';
    panel.style.cssText='border-top:1px solid #999;margin-top:8px;padding:8px;font-size:12px;max-height:45%;overflow-y:auto;';
    panel.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;"><b>Region Workbench</b><span id="rw-count" style="opacity:0.7"></span></div>' +
      '<div style="margin-bottom:6px;display:flex;gap:4px;flex-wrap:wrap;">' +
      '<button id="rw-pick" style="font-size:11px;padding:2px 6px;">Pick (P)</button>' +
      '<button id="rw-merge" style="font-size:11px;padding:2px 6px;">Merge</button>' +
      '<button id="rw-cut" style="font-size:11px;padding:2px 6px;">Cut (K)</button>' +
      '<button id="rw-commit" style="font-size:11px;padding:2px 6px;">Commit</button>' +
      '<button id="rw-refresh" style="font-size:11px;padding:2px 6px;">Re-extract</button>' +
      '<button id="rw-hide" style="font-size:11px;padding:2px 6px;">Hide</button>' +
      '</div><div id="rw-list"></div>';
    rail.insertBefore(panel, rail.firstChild);
    document.getElementById('rw-pick').onclick = ()=>RW.setPick(!RW.pickMode);
    document.getElementById('rw-merge').onclick = ()=>RW.mergeSelected();
    document.getElementById('rw-cut').onclick = ()=>RW.setCut(true);
    document.getElementById('rw-refresh').onclick = ()=>{ RW.extract(); RW.renderList(); RW.renderOverlay(); };
    document.getElementById('rw-hide').onclick = ()=>{
      const o = document.getElementById('rw-overlay');
      if (o) { o.style.display = o.style.display==='none'?'':'none'; RW.overlayHidden = o.style.display==='none'; }
      const p = document.getElementById('rw-commitpreview');
      if (p) p.style.display = RW.overlayHidden ? 'none' : '';
    };
    document.getElementById('rw-commit').onclick = ()=>RW.commitSelected && RW.commitSelected();
    RW.renderList();
  };

  RW.renderList = function(){
    const list = document.getElementById('rw-list');
    if (!list) return;
    const kept = RW.regions.filter(r=>r.included);
    const groups = {};
    for (const r of kept){ (groups[r.group]=groups[r.group]||[]).push(r); }
    document.getElementById('rw-count').innerText = Object.keys(groups).length + ' groups';
    list.innerHTML='';
    Object.entries(groups)
      .sort((a,b)=>{
        const sa=a[1].reduce((s,m)=>s+m.size,0), sb=b[1].reduce((s,m)=>s+m.size,0);
        return sb-sa;
      })
      .forEach(([gid, members])=>{
        const total = members.reduce((s,m)=>s+m.size,0);
        const row = document.createElement('div');
        row.dataset.group = gid;
        row.style.cssText='display:flex;align-items:center;gap:6px;padding:2px 4px;border-radius:3px;cursor:pointer;user-select:none;';
        if (RW.selected.has(+gid)) row.classList.add('rw-sel'), row.style.background='rgba(80,120,255,0.25)';
        const sw = document.createElement('span');
        sw.style.cssText='width:12px;height:12px;background:'+members[0].color+';display:inline-block;border-radius:2px;flex:none;';
        const label = document.createElement('span');
        const pct = (100*total/(RW.W*RW.H)).toFixed(1);
        label.innerText = 'G'+gid+' · '+members.length+'p · '+pct+'%';
        label.style.cssText='flex:1;opacity:0.85;';
        row.appendChild(sw); row.appendChild(label);
        row.onclick = ()=>RW.toggleGroup(+gid);
        row.onmouseenter = ()=>{ if(!RW.pickMode){ RW.hovered=+gid; RW.renderOverlay(); } };
        row.onmouseleave = ()=>{ if(!RW.pickMode){ RW.hovered=null; RW.renderOverlay(); } };
        list.appendChild(row);
      });
  };

  RW.toggleGroup = function(gid){
    if (RW.selected.has(gid)) RW.selected.delete(gid); else RW.selected.add(gid);
    document.querySelectorAll('#rw-list > div').forEach(row=>{
      const g = +row.dataset.group;
      const on = RW.selected.has(g);
      row.classList.toggle('rw-sel', on);
      row.style.background = on ? 'rgba(80,120,255,0.25)' : '';
    });
    RW.renderOverlay();
    RW._renderCommitPreview();
  };

  /* ---------- merge ---------- */
  RW.mergeSelected = function(){
    if (RW.selected.size < 2) return;
    const ids = Array.from(RW.selected).sort((a,b)=>a-b);
    const target = ids[0];
    for (const r of RW.regions){ if (RW.selected.has(r.group)) r.group = target; }
    RW.selected = new Set([target]);
    RW.renderList(); RW.renderOverlay();
  };

  /* ---------- cut ---------- */
  RW.cutMode = false; RW.cutStart = null;
  RW.setCut = function(on){
    RW.cutMode = on; RW.cutStart = null;
    document.getElementById('annotation-canvas').style.cursor = on ? 'crosshair' : '';
    if (!on){ const g=document.getElementById('rw-cutline'); if(g) g.remove(); }
  };
  RW.applyCut = function(p1, p2){
    const {W,H,labels,regions} = RW;
    const cr = document.getElementById('pdf-container').getBoundingClientRect();
    const x1=(p1.x-cr.x)/cr.width*W, y1=(p1.y-cr.y)/cr.height*H;
    const x2=(p2.x-cr.x)/cr.width*W, y2=(p2.y-cr.y)/cr.height*H;
    const dx=x2-x1, dy=y2-y1;
    const mx=Math.round((x1+x2)/2), my=Math.round((y1+y2)/2);
    const hitLabel=(mx>=0&&mx<W&&my>=0&&my<H)?labels[my*W+mx]:-1;
    if (hitLabel<0) return;
    const hitGroup = regions[hitLabel].group;
    const newId = RW.nComp++;
    let moved=0;
    for (let y=0;y<H;y++) for (let x=0;x<W;x++){
      const i=y*W+x; const l=labels[i];
      if (l<0 || regions[l].group!==hitGroup) continue;
      const side = dy*x - dx*y + (x2*y1 - y2*x1);
      if (side>0){ labels[i]=newId; moved++; }
    }
    regions.push({id:newId, size:moved, included:true, group:newId, color:'hsl('+Math.floor(Math.random()*360)+',85%,50%)'});
    const sizes={};
    for (let i=0;i<W*H;i++){ const l=labels[i]; if(l>=0) sizes[l]=(sizes[l]||0)+1; }
    for (const r of regions){ if (r.id in sizes) r.size=sizes[r.id]; }
    RW.renderList(); RW.renderOverlay();
  };

  /* ---------- commit preview ---------- */
  RW._rawContour = function(gid){
    const {W,H,labels,regions} = RW;
    const memberIds = new Set(regions.filter(r=>r.group===gid).map(r=>r.id));
    if (!memberIds.size) return null;
    const uni = new Int8Array(W*H);
    for (let i=0;i<W*H;i++){
      const l = labels[i];
      uni[i] = (l>=0 && memberIds.has(l)) ? 1 : 0;
    }
    const on = (x,y)=> x>=0&&x<W&&y>=0&&y<H&&uni[y*W+x]===1;
    let sx=-1, sy=-1;
    outer: for (let y=0;y<H;y++) for (let x=0;x<W;x++){ if(on(x,y)){sx=x;sy=y;break outer;} }
    if (sx<0) return null;
    const dirs=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
    let path=[[sx,sy]];
    let cx=sx, cy=sy, dir=6;
    for (let step=0; step<400000; step++){
      let found=false;
      for (let k=0;k<8;k++){
        const d=(dir+k)%8;
        const nx=cx+dirs[d][0], ny=cy+dirs[d][1];
        if (on(nx,ny)){ cx=nx; cy=ny; dir=(d+6)%8; found=true; path.push([cx,cy]); break; }
      }
      if (!found) break;
      if (cx===sx&&cy===sy&&path.length>3) break;
    }
    return path.map(([x,y])=>({x:+(x/W).toFixed(6), y:+(y/H).toFixed(6)}));
  };

  RW._renderCommitPreview = function(){
      const old = document.getElementById('rw-commitpreview'); if(old) old.remove();
      if (!RW.selected.size) return;
      const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.id = 'rw-commitpreview';
      svg.setAttribute('viewBox','0 0 '+RW.W+' '+RW.H);
      svg.setAttribute('preserveAspectRatio','none');
      svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:75;';
      // zoom-invariant stroke: 2.5 screen px → SVG units at current zoom
      const container = document.getElementById('pdf-container');
      const sw = container ? 2.5 * RW.W / container.clientWidth : 2.5;
      const dash = sw * 2.4;
      let inner = '';
      for (const gid of RW.selected){
        const path = RW._rawContour(gid);
        if (!path || path.length<3) continue;
        const pts = path.map(p=>(p.x*RW.W)+','+(p.y*RW.H)).join(' ');
        const col = RW.regions.filter(r=>r.group===gid)[0]?.color || '#ccc';
        inner += '<polyline points="'+pts+'" fill="none" stroke="'+col+'" stroke-width="'+sw.toFixed(2)+'" stroke-dasharray="'+dash.toFixed(1)+','+(dash*0.5).toFixed(1)+'"/>';
      }
    svg.innerHTML = inner;
    document.getElementById('pdf-container').appendChild(svg);
  };
  RW.setPick = function(on){
    RW.pickMode = on;
    document.getElementById('rw-pick').style.background = on ? 'rgba(80,120,255,0.35)' : '';
    document.getElementById('annotation-canvas').style.cursor = on ? 'pointer' : '';
    if (on){
      document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
      const popup=document.getElementById('selection-popup');
      if (popup) popup.style.display='none';
    }
    if (!on && RW.hovered!==null){ RW.hovered=null; RW.renderOverlay(); }
  };

  RW.groupAt = function(clientX, clientY){
    const cr = document.getElementById('pdf-container').getBoundingClientRect();
    const x = Math.round((clientX-cr.x)/cr.width*RW.W);
    const y = Math.round((clientY-cr.y)/cr.height*RW.H);
    if (x<0||x>=RW.W||y<0||y>=RW.H) return null;
    const l = RW.labels[y*RW.W+x];
    if (l<0) return null;
    const r = RW.regions[l];
    return (r && r.included) ? r.group : null;
  };

  /* ---------- global event wiring (once) ---------- */
  const ac = document.getElementById('annotation-canvas');

  ac.addEventListener('mousedown', function(e){
    if (RW.pickMode){
      e.stopPropagation(); e.preventDefault();
      RW.__downPos = {x:e.clientX, y:e.clientY};
      return;
    }
    if (RW.cutMode){
      e.stopPropagation(); e.preventDefault();
      RW.cutStart = {x:e.clientX, y:e.clientY};
    }
  }, true);

  ac.addEventListener('mousemove', function(e){
    if (RW.pickMode){
      e.stopPropagation();
      if (RW.__raf) return;
      RW.__raf = true;
      const cx=e.clientX, cy=e.clientY;
      requestAnimationFrame(()=>{
        RW.__raf=false;
        const g = RW.groupAt(cx,cy);
        if (g !== RW.hovered){ RW.hovered=g; RW.renderOverlay(); }
      });
      return;
    }
    if (RW.cutMode && RW.cutStart){
      e.stopPropagation();
      const container=document.getElementById('pdf-container');
      let svg=document.getElementById('rw-cutline');
      if (!svg){
        svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
        svg.id='rw-cutline';
        svg.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:70;';
        const ln=document.createElementNS('http://www.w3.org/2000/svg','line');
        ln.setAttribute('stroke','red');
        ln.setAttribute('stroke-width','2');
        svg.appendChild(ln);
        svg.__rwCutLine = ln;
        container.appendChild(svg);
      }
      const cr=container.getBoundingClientRect();
      const pc=(v,off,len)=>((v-off)/len*100)+'%';
      const ln=svg.__rwCutLine;
      if (ln){
        ln.setAttribute('x1',pc(RW.cutStart.x,cr.x,cr.width));
        ln.setAttribute('y1',pc(RW.cutStart.y,cr.y,cr.height));
        ln.setAttribute('x2',pc(e.clientX,cr.x,cr.width));
        ln.setAttribute('y2',pc(e.clientY,cr.y,cr.height));
      }
    }
  }, true);

  ac.addEventListener('mouseup', function(e){
    if (RW.pickMode){
      e.stopPropagation(); e.preventDefault();
      const d=RW.__downPos; RW.__downPos=null;
      if (d && Math.hypot(e.clientX-d.x,e.clientY-d.y)<=5){
        const g=RW.groupAt(e.clientX,e.clientY);
        if (g!==null) RW.toggleGroup(g);
      }
      return;
    }
    if (RW.cutMode && RW.cutStart){
      e.stopPropagation(); e.preventDefault();
      const s=RW.cutStart;
      RW.setCut(false);
      RW.applyCut(s,{x:e.clientX,y:e.clientY});
    }
  }, true);

  ac.addEventListener('click', function(e){
    if (RW.pickMode || RW.cutMode){ e.stopPropagation(); e.preventDefault(); }
  }, true);

  document.addEventListener('keydown', function(e){
    const t=e.target;
    if (t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable)) return;
    if (e.ctrlKey||e.metaKey||e.altKey) return;
    if (e.key==='p'||e.key==='P'){ e.preventDefault(); e.stopPropagation(); RW.setPick(!RW.pickMode); }
    if (e.key==='k'||e.key==='K'){ e.preventDefault(); e.stopPropagation(); RW.setCut(true); }
    if ((e.key==='Delete'||e.key==='Backspace') && RW.pickMode && RW.selected.size){
      e.preventDefault(); e.stopImmediatePropagation();
      for (const sv of RW.selected){
        for (let i=0;i<RW.W*RW.H;i++){
          if (RW.labels[i]>=0 && RW.regions[RW.labels[i]] && RW.regions[RW.labels[i]].group===sv){
            RW.wall[i]=1;
          }
        }
      }
      RW.selected = new Set();
      RW._relabel(); RW.renderList(); RW.renderOverlay();
      RW._renderCommitPreview();
    }
  }, true);

  /* ---------- boot ---------- */
  RW.extract();
  RW.buildPanel();
  RW.renderOverlay();
  return 'RW v2 up: '+RW.regions.filter(r=>r.included).length+' regions';
})()

;
// ===== rw_masktools.js =====
// RW v2.1-revised — unified Rect tool (supplants separate Block/Open).
// Paints into RW.wall via RW.maskAction (block/open/add), re-labels preserving groups.
// Uses normalized coords (_toNorm/_toPx from rw_stable.js) for pan-stable previews.
(function(){
  const RW = window.__RW;
  if (!RW || RW.v !== 2) return 'need RW v2 first';
  if (RW.v21r) return 'v2.1r already installed';
  RW.v21r = true;

  /* ---------- rect tool: unified block/open via maskAction ---------- */
  if (!('maskAction' in RW)) RW.maskAction = 'block';

  // coordinate helpers (mirror v2.2 — available before rw_stable loads)
  if (!RW._toNorm) RW._toNorm = function(cx,cy){
    const cr = document.getElementById('pdf-container').getBoundingClientRect();
    return [(cx-cr.x)/cr.width, (cy-cr.y)/cr.height];
  };
  if (!RW._toPx) RW._toPx = function(nx,ny){
    const cr = document.getElementById('pdf-container').getBoundingClientRect();
    return [nx*cr.width, ny*cr.height];
  };
  if (!RW._mkSvg) RW._mkSvg = function(id, z){
    const old=document.getElementById(id); if(old) old.remove();
    const container=document.getElementById('pdf-container');
    const cr=container.getBoundingClientRect();
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.id=id;
    svg.setAttribute('viewBox','0 0 '+cr.width+' '+cr.height);
    svg.setAttribute('preserveAspectRatio','none');
    svg.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:'+z+';';
    container.appendChild(svg);
    return svg;
  };
  if (!RW._strokeK) RW._strokeK = function(){
    const pc=document.getElementById('pdf-container');
    const sc=document.getElementById('canvas-scroll-container');
    return pc.getBoundingClientRect().width/sc.getBoundingClientRect().width;
  };

  RW._paintRect = function(x0,y0,x1,y1,val){
    const {W,H,wall} = RW;
    const xa=Math.max(0,Math.min(x0,x1)|0), xb=Math.min(W-1,Math.max(x0,x1)|0);
    const ya=Math.max(0,Math.min(y0,y1)|0), yb=Math.min(H-1,Math.max(y0,y1)|0);
    for (let y=ya;y<=yb;y++) for (let x=xa;x<=xb;x++) wall[y*W+x]=val;
  };
  RW._paintPoly = function(pts,val){
    const {W,H,wall} = RW;
    let minY=H,maxY=0;
    for (const [x,y] of pts){ if(y<minY)minY=y; if(y>maxY)maxY=y; }
    minY=Math.max(0,minY|0); maxY=Math.min(H-1,Math.ceil(maxY));
    for (let y=minY;y<=maxY;y++){
      const xs=[];
      for (let i=0,j=pts.length-1;i<pts.length;j=i++){
        const [xi,yi]=pts[i], [xj,yj]=pts[j];
        if ((yi>y)!==(yj>y)) xs.push(xi+(y-yi)/(yj-yi)*(xj-xi));
      }
      xs.sort((a,b)=>a-b);
      for (let k=0;k+1<xs.length;k+=2){
        const xa=Math.max(0,Math.round(xs[k])), xb=Math.min(W-1,Math.round(xs[k+1]));
        for (let x=xa;x<=xb;x++) wall[y*W+x]=val;
      }
    }
  };

  // Bresenham polyline — paints wall=1 only on wall=0 pixels not already part of an
  // included region (seals linework gaps without cutting through mask regions).
  RW._paintPolylineGap = function(pts){
    const {W,H,wall,labels,regions} = RW;
    function line(x0,y0,x1,y1){
      const dx=Math.abs(x1-x0), sx=x0<x1?1:-1;
      const dy=-Math.abs(y1-y0), sy=y0<y1?1:-1;
      let err=dx+dy;
      while(true){
        if (x0>=0&&x0<W&&y0>=0&&y0<H && wall[y0*W+x0]===0){
          const l = labels ? labels[y0*W+x0] : -1;
          if (!(l>=0 && regions && regions[l] && regions[l].included)){
            wall[y0*W+x0]=1;
          }
        }
        if (x0===x1&&y0===y1) break;
        const e2=2*err;
        if (e2>=dy){ err+=dy; x0+=sx; }
        if (e2<=dx){ err+=dx; y0+=sy; }
      }
    }
    for (let i=0;i<pts.length;i++){
      const [x0,y0]=pts[i], [x1,y1]=pts[(i+1)%pts.length];
      line(Math.round(x0),Math.round(y0),Math.round(x1),Math.round(y1));
    }
  };

  /* ---------- relabel preserving groups by centroid ---------- */
  RW._relabel = function(){
    if (!RW.labels) RW.extract(); // auto-bootstrap if no mask exists yet
    const {W,H,wall} = RW;
    // snapshot old regions BEFORE flood — used to protect existing mask from border absorption
    const oldRegions = RW.regions;
    const oldLabels = RW.labels;
    const oldCent = {};
    for (let i=0;i<W*H;i++){
      const l=oldLabels[i]; if (l<0) continue;
      const g=oldRegions[l].group;
      const c=oldCent[g]=oldCent[g]||{sx:0,sy:0,n:0};
      c.sx+=i%W; c.sy+=(i/W)|0; c.n++;
    }
    for (const g in oldCent){ const c=oldCent[g]; c.x=c.sx/c.n; c.y=c.sy/c.n; }
    const seen=new Uint8Array(W*H); const q=[];
    for (let x=0;x<W;x++){ q.push(x,(H-1)*W+x); }
    for (let y=0;y<H;y++){ q.push(y*W,y*W+W-1); }
    while(q.length){
      const i=q.pop();
      if (seen[i]||wall[i]) continue;
      // protect pixels that were previously part of included mask regions
      const ol=oldLabels[i];
      if (ol>=0 && oldRegions[ol] && oldRegions[ol].included) continue;
      seen[i]=1; const x=i%W,y=(i/W)|0;
      if(x>0)q.push(i-1); if(x<W-1)q.push(i+1);
      if(y>0)q.push(i-W); if(y<H-1)q.push(i+W);
    }
    const labels = new Int32Array(W*H).fill(-1);
    let nComp=0; const sizes=[];
    for (let s=0;s<W*H;s++){
      if (seen[s]||wall[s]||labels[s]>=0) continue;
      const stack=[s]; labels[s]=nComp; let size=0,sx=0,sy=0;
      while(stack.length){
        const i=stack.pop(); size++;
        const x=i%W,y=(i/W)|0; sx+=x;sy+=y;
        if(x>0&&!seen[i-1]&&!wall[i-1]&&labels[i-1]<0){labels[i-1]=nComp;stack.push(i-1);}
        if(x<W-1&&!seen[i+1]&&!wall[i+1]&&labels[i+1]<0){labels[i+1]=nComp;stack.push(i+1);}
        if(y>0&&!seen[i-W]&&!wall[i-W]&&labels[i-W]<0){labels[i-W]=nComp;stack.push(i-W);}
        if(y<H-1&&!seen[i+W]&&!wall[i+W]&&labels[i+W]<0){labels[i+W]=nComp;stack.push(i+W);}
      }
      sizes.push({size, cx:sx/size, cy:sy/size}); nComp++;
    }
    const newGroupFor=new Array(nComp).fill(-1);
    for (let id=0;id<nComp;id++){
      const {cx,cy}=sizes[id]; let best=-1,bestD=40*40;
      for (const g in oldCent){ const c=oldCent[g]; const d=(c.x-cx)*(c.x-cx)+(c.y-cy)*(c.y-cy); if (d<bestD){bestD=d;best=+g;} }
      newGroupFor[id]=best;
    }
    RW.labels=labels; RW.nComp=nComp;
    const areaFloor = RW._areaFloor != null ? RW._areaFloor : 2500;
    RW.regions = sizes.map((s,id)=>{ const g=newGroupFor[id]>=0?newGroupFor[id]:id; return {id,size:s.size,included:s.size>=areaFloor,group:g,color:'hsl('+((g*67)%360)+',70%,55%)'}; });
  };

  const ac = document.getElementById('annotation-canvas');

  // v2.6 handles poly2/brush (maskMode2); this module only handles maskMode==='rect'.
  // Legacy B/O keys are gone — B here only acts while maskMode2 is null.

  ac.addEventListener('mousedown', function(e){
    if (RW.maskMode!=='rect') return;
    e.stopPropagation(); e.preventDefault();
    RW.__rectStartN = RW._toNorm(e.clientX, e.clientY);
    RW.__rectCurN = RW.__rectStartN.slice();
  }, true);

  ac.addEventListener('mousemove', function(e){
    if (RW.maskMode!=='rect' || !RW.__rectStartN) return;
    e.stopPropagation();
    RW.__rectCurN = RW._toNorm(e.clientX, e.clientY);
    const en=RW.__rectCurN, st=RW.__rectStartN;
    const px = Math.round(Math.abs(en[0]-st[0])*RW.W * Math.abs(en[1]-st[1])*RW.H);
    RW._showAreaHint(px);
    RW._renderPreview2({x:e.clientX,y:e.clientY});
  }, true);

  ac.addEventListener('mouseup', function(e){
    if (RW.maskMode!=='rect' || !RW.__rectStartN) return;
    e.stopPropagation(); e.preventDefault();
    const s=RW.__rectStartN; RW.__rectStartN=null; RW.__rectCurN=null;
    const rl=document.getElementById('rw-rectline'); if(rl) rl.remove();
    const en=RW._toNorm(e.clientX,e.clientY);
    if (RW.maskAction==='add'){
      // Fill-then-hollow: paint rect as wall, then shrink 2px and clear interior,
      // skipping a skip-mask of existing included-region pixels (bbox only, cheap).
      const {W,H,labels,regions,wall} = RW;
      const rx0=s[0]*W, ry0=s[1]*H, rx1=en[0]*W, ry1=en[1]*H;
      const xa=Math.max(0,Math.min(rx0,rx1)|0), xb=Math.min(W-1,Math.max(rx0,rx1)|0);
      const ya=Math.max(0,Math.min(ry0,ry1)|0), yb=Math.min(H-1,Math.max(ry0,ry1)|0);
      const skip = new Uint8Array(W*H);
      for (let y=ya;y<=yb;y++) for (let x=xa;x<=xb;x++){
        const l=labels[y*W+x];
        if (l>=0 && regions[l] && regions[l].included) skip[y*W+x]=1;
      }
      for (let y=ya;y<=yb;y++) for (let x=xa;x<=xb;x++)
        if (!skip[y*W+x]) wall[y*W+x]=1;
      const ixa=Math.min(xb, xa+2), ixb=Math.max(xa, xb-2);
      const iya=Math.min(yb, ya+2), iyb=Math.max(ya, yb-2);
      for (let y=iya;y<=iyb;y++) for (let x=ixa;x<=ixb;x++)
        if (!skip[y*W+x]) wall[y*W+x]=0;
    } else if (RW.maskAction==='open'){
      // open mode: seal perimeter gaps, then convert interior walls to non-wall
      const rx0=s[0]*RW.W, ry0=s[1]*RW.H, rx1=en[0]*RW.W, ry1=en[1]*RW.H;
      RW._paintPolylineGap([[rx0,ry0],[rx1,ry0],[rx1,ry1],[rx0,ry1]]);
      const xa=Math.max(0,Math.min(rx0,rx1)|0), xb=Math.min(RW.W-1,Math.max(rx0,rx1)|0);
      const ya=Math.max(0,Math.min(ry0,ry1)|0), yb=Math.min(RW.H-1,Math.max(ry0,ry1)|0);
      for (let y=ya;y<=yb;y++) for (let x=xa;x<=xb;x++) {
        if (RW.wall[y*RW.W+x]===1) RW.wall[y*RW.W+x]=0;
      }
    } else {
      const val = RW.maskAction==='block' ? 1 : 0;
      RW._paintRect(s[0]*RW.W, s[1]*RW.H, en[0]*RW.W, en[1]*RW.H, val);
    }
    RW._relabel();
    if (RW.maskAction==='add'){
      // Force-include the region at the center of the drawn rect (ignore areaFloor)
      const cx = Math.round((s[0]+en[0])/2 * RW.W), cy = Math.round((s[1]+en[1])/2 * RW.H);
      if (cx>=0 && cx<RW.W && cy>=0 && cy<RW.H){
        const l = RW.labels[cy*RW.W + cx];
        if (l>=0 && RW.regions[l]) RW.regions[l].included = true;
      }
    }
    RW.renderList(); RW.renderOverlay();
    RW._renderCommitPreview();
    RW._showAreaHint(null);
  }, true);

  ac.addEventListener('click', function(e){
    if (RW.maskMode==='rect'){ e.stopPropagation(); e.preventDefault(); }
  }, true);

  // Wraps v2.2's _renderPreview (which only handles maskMode==='poly') so its
  // mousemove calls this instead, adding rect support.
  RW._renderPreview2 = function(cursorClient){
    RW._renderPreview(cursorClient);
    if (RW.maskMode!=='rect' || !RW.__rectStartN) return;
    const sw = 1.5;  // constant screen px — zoom-invariant
    const svg = RW._mkSvg ? RW._mkSvg('rw-rectline', 71) : null;
    if (!svg) return;
    let x0=RW.__rectStartN[0], y0=RW.__rectStartN[1];
    let x1=RW.__rectCurN ? RW.__rectCurN[0] : x0, y1=RW.__rectCurN ? RW.__rectCurN[1] : y0;
    const [ax,ay]=RW._toPx(Math.min(x0,x1),Math.min(y0,y1));
    const [bx,by]=RW._toPx(Math.max(x0,x1),Math.max(y0,y1));
    const col = RW._actionColor ? RW._actionColor() : (RW.maskAction==='block' ? 'orange' : 'deepskyblue');
    svg.innerHTML='<rect x="'+ax+'" y="'+ay+'" width="'+(bx-ax)+'" height="'+(by-ay)+'" fill="rgba(255,160,60,0.10)" stroke="'+col+'" stroke-width="'+sw+'"/>';
  };

  /* ---------- keys: B = rect (Shift-B toggles action) ---------- */
  window.addEventListener('keydown', function(e){
    const t=e.target;
    if (t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable)) return;
    if (e.ctrlKey||e.metaKey||e.altKey) return;
    // Disarm v2.6 tools first so B switches directly to rect in one keystroke.
    if (e.key==='b'||e.key==='B'){
      if (RW.maskMode2){ RW.setMaskMode2(null); }
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.shiftKey){ const next=RW.maskAction==='block'?'open':RW.maskAction==='open'?'add':'block'; RW.maskAction=next; RW._syncRectBtn(); return; }
      RW.maskMode = RW.maskMode==='rect' ? null : 'rect';
      RW._syncRectBtn();
      const ac=document.getElementById('annotation-canvas');
      ac.style.cursor = RW.maskMode==='rect' ? 'crosshair' : '';
      if (RW.maskMode!=='rect'){ RW.__rectStartN=null; RW.__rectCurN=null; const rl=document.getElementById('rw-rectline'); if(rl) rl.remove(); }
    }
    if (e.key==='Escape' && RW.maskMode==='rect'){
      e.preventDefault(); e.stopImmediatePropagation();
      RW.maskMode=null; RW.__rectStartN=null; RW.__rectCurN=null;
      document.getElementById('annotation-canvas').style.cursor='';
      const rl=document.getElementById('rw-rectline'); if(rl) rl.remove();
      RW._syncRectBtn();
    }
  }, true);

  /* ---------- panel button ---------- */
  RW._syncRectBtn = function(){
    const b = document.getElementById('rw-rect');
    if (!b) return;
    const sym = RW.maskAction==='block' ? '-' : (RW.maskAction==='open' ? '+' : '⊕');
    b.innerText = 'Rect '+sym+' (B)';
    const bg = RW.maskAction==='add' ? 'rgba(50,205,50,0.4)' : 'rgba(255,160,60,0.4)';
    b.style.background = RW.maskMode==='rect' ? bg : '';
  };
  const bar = (document.getElementById('rw-pick') || {}).parentNode;
  if (bar && !document.getElementById('rw-rect')){
    const b=document.createElement('button');
    b.id='rw-rect'; b.title='Unified rect mask. Shift+B cycles block→open→add.';
    b.style.cssText='font-size:11px;padding:2px 6px;';
    b.onclick=()=>{
      // cross-disarm: if any v2.6 tool is armed, kill it first
      if (RW.maskMode2) RW.setMaskMode2(null);
      if (RW.maskMode!=='rect'){ RW.maskMode='rect'; RW.__rectStartN=null; RW.__rectCurN=null; }
      else { RW.maskMode=null; }
      document.getElementById('annotation-canvas').style.cursor = RW.maskMode==='rect' ? 'crosshair' : '';
      RW._syncRectBtn();
    };
    bar.appendChild(b);
  }
  RW._syncRectBtn();

  /* ---------- live area hint ---------- */
  RW._showAreaHint = function(px){
    const el = document.getElementById('rw-commit-status');
    if (!el) return;
    const floor = RW._areaFloor != null ? RW._areaFloor : 2500;
    if (px == null){ el.innerText = ''; return; }
    const ok = px >= floor;
    el.innerHTML = '<span style="color:'+(ok?'#4c4':'#c44')+'">area: '+px+' px '+(ok?'≥':'<')+' '+floor+'</span>';
  };
  RW._polyArea = function(ptsN){
    // Shoelace formula on normalized polygon points
    let a=0; const n=ptsN.length;
    for (let i=0;i<n;i++){ const j=(i+1)%n; a+=ptsN[i][0]*ptsN[j][1]-ptsN[j][0]*ptsN[i][1]; }
    return Math.round(Math.abs(a/2) * RW.W * RW.H);
  };

  /* ---------- relabel with configured size floor ---------- */
  RW.relabelAll = function(){
    RW._relabel();
    RW.renderList(); RW.renderOverlay();
    RW._renderCommitPreview();
  };

  /* ---------- Global area-floor input (affects ALL tools + re-extract) ---------- */
  if (bar && !document.getElementById('rw-relabel-inp')){
    const inp = document.createElement('input');
    inp.id = 'rw-relabel-inp';
    inp.type = 'number';
    inp.value = RW._areaFloor || 2500;
    inp.title = 'Min region pixels (global). Affects all mask tools, Re-extract and Relabel.';
    inp.style.cssText = 'font-size:11px;padding:1px 4px;width:52px;text-align:right;';
    inp.onchange = function(){
      const v = parseInt(this.value, 10);
      RW._areaFloor = isNaN(v) ? 2500 : Math.max(1, v);
    };
    bar.appendChild(inp);
    const rb = document.createElement('button');
    rb.id = 'rw-relabel-btn';
    rb.title = 'Relabel using the current pixel threshold.';
    rb.style.cssText = 'font-size:11px;padding:2px 6px;';
    rb.innerText = 'Relabel';
    rb.onclick = ()=>RW.relabelAll();
    bar.appendChild(rb);
  }

  /* ---------- wall overlay toggle (3-state: off → walls → floodable → off) ---------- */
  RW.wallOverlayState = 0; // 0=off, 1=walls(red), 2=floodable(cyan)
  RW.toggleWallOverlay = function(){
    const existing = document.getElementById('rw-wall-overlay');
    if (existing) existing.remove();
    RW.wallOverlayState = (RW.wallOverlayState + 1) % 3;
    if (RW.wallOverlayState === 0) return;
    const {W,H,wall} = RW;
    const ov = document.createElement('canvas');
    ov.id = 'rw-wall-overlay';
    ov.width = W; ov.height = H;
    ov.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:44;opacity:0.7;image-rendering:pixelated;';
    const ctx = ov.getContext('2d');
    const img = ctx.createImageData(W, H);
    if (RW.wallOverlayState === 1){
      for (let i = 0; i < W*H; i++) {
        if (wall[i] === 1) { img.data[i*4]=255; img.data[i*4+1]=60; img.data[i*4+2]=60; img.data[i*4+3]=220; }
      }
    } else {
      // Cyan = enclosed space not reached by border flood (would become regions).
      // Must mirror _relabel()'s flood exactly (incl. included regions as barriers)
      // or this preview will disagree with the real relabel.
      const seen = new Uint8Array(W*H);
      const q = [];
      for (let x=0;x<W;x++){ q.push(x,(H-1)*W+x); }
      for (let y=0;y<H;y++){ q.push(y*W,y*W+W-1); }
      while(q.length){
        const i = q.pop();
        if (seen[i]||wall[i]) continue;
        const ol = RW.labels[i];
        if (ol>=0 && RW.regions[ol] && RW.regions[ol].included) continue;
        seen[i]=1;
        const x=i%W, y=(i/W)|0;
        if(x>0)q.push(i-1); if(x<W-1)q.push(i+1);
        if(y>0)q.push(i-W); if(y<H-1)q.push(i+W);
      }
      for (let i = 0; i < W*H; i++) {
        if (!wall[i] && !seen[i]) { img.data[i*4]=60; img.data[i*4+1]=220; img.data[i*4+2]=255; img.data[i*4+3]=200; }
      }
    }
    ctx.putImageData(img, 0, 0);
    document.getElementById('pdf-container').appendChild(ov);
  };

  /* ---------- W key: toggle wall overlay ---------- */
  window.addEventListener('keydown', function(e){
    const t = e.target;
    if (t && (t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable)) return;
    if (e.ctrlKey||e.metaKey||e.altKey) return;
    if (e.key==='w'||e.key==='W'){
      e.preventDefault(); e.stopImmediatePropagation();
      RW.toggleWallOverlay();
    }
  }, true);

  /* ---------- Walls panel button ---------- */
  if (bar && !document.getElementById('rw-walls')){
    const wb = document.createElement('button');
    wb.id = 'rw-walls';
    wb.title = 'Toggle wall overlay (W). Shows wall=1 pixels in red.';
    wb.style.cssText = 'font-size:11px;padding:2px 6px;';
    wb.innerText = 'Walls (W)';
    wb.onclick = ()=>RW.toggleWallOverlay();
    bar.appendChild(wb);
  }

  return 'v2.1r unified rect up: B=rect (Shift+B toggles block/open), pan-stable';
})()
;
// ===== rw_stable.js =====
// RW v2.2 — pan/zoom-stable previews. Stores in-progress geometry in normalized
// page coords (0-1 of page), converts to pixels at render time.
(function(){
  const RW = window.__RW;
  if (!RW || (!RW.v21 && !RW.v21r)) return 'need v2.1 first';
  if (RW.v22) return 'v2.2 already installed';
  RW.v22 = true;
  RW._previewV = 4;

  // client (screen) -> normalized page coords
  RW._toNorm = function(cx, cy){
    const cr = document.getElementById('pdf-container').getBoundingClientRect();
    return [(cx - cr.x)/cr.width, (cy - cr.y)/cr.height];
  };
  // normalized -> client px offset within container's box
  RW._toPx = function(nx, ny){
    const cr = document.getElementById('pdf-container').getBoundingClientRect();
    return [nx*cr.width, ny*cr.height];
  };

  RW._strokeK = function(){
    const pc = document.getElementById('pdf-container');
    const sc = document.getElementById('canvas-scroll-container');
    return pc.getBoundingClientRect().width / sc.getBoundingClientRect().width;
  };

  RW._mkSvg = function(id, z){
    const old = document.getElementById(id); if(old) old.remove();
    const container = document.getElementById('pdf-container');
    const cr = container.getBoundingClientRect();
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.id = id;
    svg.setAttribute('viewBox', '0 0 ' + cr.width + ' ' + cr.height);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:'+z+';';
    container.appendChild(svg);
    return svg;
  };

  // re-render previews from normalized state (call on mousemove AND on pan/zoom)
  RW._renderPreview = function(cursorClient){
    const sw = 1.5;   // constant screen px — zoom-invariant
    const dotR = 2.5;

    // poly (legacy 'poly' via maskMode, v2.6 'poly2' via maskMode2)
    const polyActive = (RW.maskMode==='poly') || (RW.maskMode2==='poly2');
    if (polyActive && RW._polyPtsN && RW._polyPtsN.length){
      const svg = RW._mkSvg('rw-polyline', 71);
      const pts = RW._polyPtsN.map(([nx,ny])=>{
        const [px,py]=RW._toPx(nx,ny); return px+','+py;
      });
      if (cursorClient){
        let [cnx,cny]=RW._toNorm(cursorClient.x,cursorClient.y);
        if (RW.maskMode2==='poly2' && RW._trySnap){ const s=RW._trySnap(cnx,cny); cnx=s[0]; cny=s[1]; }
        const [px,py]=RW._toPx(cnx,cny);
        pts.push(px+','+py);
      }
      let inner = '<polyline points="'+pts.join(' ')+'" fill="rgba(255,160,60,0.18)" stroke="orange" stroke-width="'+sw+'"/>';
      for (const [nx,ny] of RW._polyPtsN){
        const [px,py]=RW._toPx(nx,ny);
        inner += '<circle cx="'+px+'" cy="'+py+'" r="'+dotR+'" fill="orange" stroke="white" stroke-width="1.0"/>';
      }
      svg.innerHTML = inner;
    }
    // rect preview (used by v2.1r _renderPreview2 wrapper)
    if ((RW.maskMode==='block' || RW.maskMode==='open' || RW.maskMode==='rect') && RW.__rectStartN){
      const svg = RW._mkSvg('rw-rectline', 71);
      let x0=RW.__rectStartN[0], y0=RW.__rectStartN[1];
      let x1=RW.__rectCurN ? RW.__rectCurN[0] : x0, y1=RW.__rectCurN ? RW.__rectCurN[1] : y0;
      const [ax,ay]=RW._toPx(Math.min(x0,x1),Math.min(y0,y1));
      const [bx,by]=RW._toPx(Math.max(x0,x1),Math.max(y0,y1));
      const col = RW.maskMode==='block' ? 'orange' : 'deepskyblue';
      svg.innerHTML='<rect x="'+ax+'" y="'+ay+'" width="'+(bx-ax)+'" height="'+(by-ay)+'" fill="rgba(255,160,60,0.10)" stroke="'+col+'" stroke-width="'+sw+'"/>';
    }
  };

  const ac = document.getElementById('annotation-canvas');

  // v4 listeners (guarded by _previewV so older handlers no-op)
  ac.addEventListener('mousedown', function(e){
    if (RW._previewV!==4 || !RW.maskMode) return;
    e.stopPropagation(); e.preventDefault();
    const [nx,ny]=RW._toNorm(e.clientX,e.clientY);
    if (RW.maskMode==='poly'){
      RW._polyPtsN = RW._polyPtsN || [];
      RW._polyPtsN.push([nx,ny]);
    } else {
      RW.__rectStartN = [nx,ny];
      RW.__rectCurN = [nx,ny];
    }
  }, true);

  ac.addEventListener('mousemove', function(e){
    if (RW._previewV!==4 || !RW.maskMode) return;
    e.stopPropagation();
    if (RW.maskMode==='block'||RW.maskMode==='open'){
      if (RW.__rectStartN) RW.__rectCurN = RW._toNorm(e.clientX,e.clientY);
    }
    RW._renderPreview({x:e.clientX,y:e.clientY});
  }, true);

  ac.addEventListener('mouseup', function(e){
    if (RW._previewV!==4 || !RW.maskMode) return;
    e.stopPropagation(); e.preventDefault();
    if (RW.maskMode==='poly') return; // commits on dblclick
    if (!RW.__rectStartN) return;
    const s=RW.__rectStartN; RW.__rectStartN=null; RW.__rectCurN=null;
    const rl=document.getElementById('rw-rectline'); if(rl) rl.remove();
    const e_n = RW._toNorm(e.clientX,e.clientY);
    const W=RW.W, H=RW.H;
    const val = RW.maskMode==='block' ? 1 : 0;
    if (RW.maskMode==='open'){
      RW._paintPolylineGap([[s[0]*W, s[1]*H], [e_n[0]*W, s[1]*H], [e_n[0]*W, e_n[1]*H], [s[0]*W, e_n[1]*H]]);
      const xa=Math.max(0,Math.min(s[0]*W, e_n[0]*W)|0), xb=Math.min(W-1,Math.max(s[0]*W, e_n[0]*W)|0);
      const ya=Math.max(0,Math.min(s[1]*H, e_n[1]*H)|0), yb=Math.min(H-1,Math.max(s[1]*H, e_n[1]*H)|0);
      for (let y=ya;y<=yb;y++) for (let x=xa;x<=xb;x++) {
        if (RW.wall[y*W+x]===1) RW.wall[y*W+x]=0;
      }
    } else {
      RW._paintRect(s[0]*W, s[1]*H, e_n[0]*W, e_n[1]*H, val);
    }
    RW._relabel(); RW.renderList(); RW.renderOverlay();
    RW._renderCommitPreview();
  }, true);

  ac.addEventListener('dblclick', function(e){
    if (RW._previewV!==4 || RW.maskMode!=='poly') return;
    e.stopPropagation(); e.preventDefault();
    if (RW._polyPtsN && RW._polyPtsN.length>=3){
      const mpts = RW._polyPtsN.map(([nx,ny])=>[nx*RW.W, ny*RW.H]);
      RW._paintPoly(mpts, 1);
      RW._relabel(); RW.renderList(); RW.renderOverlay();
      RW._renderCommitPreview();
    }
    RW._polyPtsN=[];
    const pl=document.getElementById('rw-polyline'); if(pl) pl.remove();
  }, true);

  // keep preview glued during pan/zoom: re-render on scroll + wheel
  const sc = document.getElementById('canvas-scroll-container');
  RW.__scrollRaf = false;
  sc.addEventListener('scroll', function(){
    if (RW._previewV!==4) return;
    if (!RW.maskMode && !RW.maskMode2) return;
    if (RW.__scrollRaf) return;              // debounce: one rAF at a time
    RW.__scrollRaf = true;
    requestAnimationFrame(() => {
      RW.__scrollRaf = false;
      RW._renderPreview(null);
      if (RW._renderPreview2) RW._renderPreview2(null);
      if (RW._renderCommitPreview) RW._renderCommitPreview();
    });
  }, {passive:true});
  // wheel = zoom (Ctrl+scroll) — re-render so stroke stays zoom-invariant
  ac.addEventListener('wheel', function(e){
    if (RW._previewV!==4) return;
    if (!RW.maskMode && !RW.maskMode2) return;
    requestAnimationFrame(() => {
      RW._renderPreview(null);
      if (RW._renderPreview2) RW._renderPreview2(null);
      if (RW._renderCommitPreview) RW._renderCommitPreview();
    });
  }, {passive:true});
  document.addEventListener('mouseup', function(){
    // after any pan gesture ends, re-render so preview re-anchors
    if (RW._previewV!==4 || !RW.maskMode) return;
    setTimeout(()=>RW._renderPreview(null), 30);
  }, true);

  // Escape clears normalized state too
  document.addEventListener('keydown', function(e){
    if (e.key==='Escape' && RW.maskMode){
      RW._polyPtsN=[]; RW.__rectStartN=null; RW.__rectCurN=null;
    }
  }, true);

  return 'v2.2 up: pan/zoom-stable previews (normalized coords)';
})()

;
// ===== rw_undo.js =====
// RW v2.3 — undo system for mask tools. Load AFTER rw_stable.js (needs v2.2).
(function(){
  const RW = window.__RW;
  if (!RW || !RW.v22) return 'need v2.2 first';
  if (RW.v23) return 'v2.3 already installed';
  RW.v23 = true;
  const ac = document.getElementById('annotation-canvas');

  RW._undoStack = [];
  RW._snapshot = function(label){
    RW._undoStack.push({
      label,
      wall: RW.wall.slice(),
      labels: RW.labels.slice(),
      nComp: RW.nComp,
      regions: JSON.parse(JSON.stringify(RW.regions.map(r=>({id:r.id,size:r.size,included:r.included,group:r.group,color:r.color})))),
    });
    if (RW._undoStack.length > 30) RW._undoStack.shift();
    RW._updateUndoBtn();
  };
  RW.undo = function(){
    const s = RW._undoStack.pop();
    if (!s) return 'nothing to undo';
    RW.wall = s.wall;
    RW.labels = s.labels;
    RW.nComp = s.nComp;
    RW.regions = s.regions;
    const live = new Set(RW.regions.map(r=>r.group));
    RW.selected = new Set(Array.from(RW.selected).filter(g=>live.has(g)));
    RW.renderList(); RW.renderOverlay();
    RW._updateUndoBtn();
    return 'undid: ' + s.label;
  };
  RW._updateUndoBtn = function(){
    const b = document.getElementById('rw-undo');
    if (b) b.innerText = 'Undo (`)' + (RW._undoStack.length ? ' '+RW._undoStack.length : '');
  };

  // window-level capture: fires before element handlers
  window.addEventListener('mousedown', function(e){
    if (RW._previewV!==4 || !RW.maskMode) return;
    if (e.target !== ac && !ac.contains(e.target)) return;
    if (RW.maskMode==='block' || RW.maskMode==='open' || RW.maskMode==='rect') RW._snapshot(RW.maskMode);
  }, true);

  // _paintPoly wrapper snapshots once per commit — dblclick is the sole caller with a full polygon
  const origPaintPoly = RW._paintPoly;
  let polySnapArmed = false;
  RW._paintPoly = function(pts, val){
    if (!polySnapArmed){
      polySnapArmed = true;
      RW._snapshot('poly');
      const r = origPaintPoly.apply(RW, arguments);
      polySnapArmed = false;
      return r;
    }
    return origPaintPoly.apply(RW, arguments);
  };

  const origApplyCut = RW.applyCut;
  RW.applyCut = function(){
    RW._snapshot('cut');
    return origApplyCut.apply(RW, arguments);
  };
  const origMerge = RW.mergeSelected;
  RW.mergeSelected = function(){
    if (RW.selected.size >= 2) RW._snapshot('merge');
    return origMerge.apply(RW, arguments);
  };

  // window capture beats older document handlers
  window.addEventListener('keydown', function(e){
    const t = e.target;
    if (t && (t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable)) return;
    if (RW.maskMode !== 'poly') return;
    if (e.key === 'Backspace'){
      e.preventDefault(); e.stopImmediatePropagation();
      if (RW._polyPtsN && RW._polyPtsN.length){
        RW._polyPtsN.pop();
        RW._renderPreview(null);
      }
      return;
    }
    if (e.key === 'Escape'){
      e.preventDefault(); e.stopImmediatePropagation();
      if (RW._polyPtsN && RW._polyPtsN.length){
        RW._polyPtsN = [];
        const pl = document.getElementById('rw-polyline'); if (pl) pl.remove();
      } else {
        RW.setMaskMode(null);
      }
    }
  }, true);

  window.addEventListener('keydown', function(e){
    const t = e.target;
    if (t && (t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable)) return;
    if (e.ctrlKey||e.metaKey||e.altKey) return;
    if (e.key === '`'){
      e.preventDefault(); e.stopImmediatePropagation();
      RW.undo();
    }
  }, true);

  const bar = (document.getElementById('rw-pick') || {}).parentNode;
  if (bar && !document.getElementById('rw-undo')){
    const b = document.createElement('button');
    b.id = 'rw-undo';
    b.title = 'Undo last mask edit (block/open/poly/cut/merge)';
    b.style.cssText = 'font-size:11px;padding:2px 6px;';
    b.onclick = ()=>RW.undo();
    bar.appendChild(b);
  }
  RW._updateUndoBtn();

  return 'v2.3 undo up: Backspace=poly point, Esc=clear points then close, `=undo mask edit';
})()

;
// ===== rw_commit.js =====
// RW v2.5 — Direct-write commit: mask contours become real pending annotations
// via the app's own state + EditHistory contract. No synthetic clicks.
//
// Mechanism (mirrors createPolygonPolylineAnnotation exactly):
//   1. build newAnnotation { id: temp_*, tag, measurement_type:'POLYGON',
//      coordinates: <normalized pts>, _pending: true, _data: {page_id,
//      measurement_type, points_data, notes, tag_id, temp_id} }
//   2. annotationState.annotations.push(newAnnotation)
//   3. editHistory.push(createHistoryEntry('create_annotation', {before:null,
//      after: newAnnotation})) — this is what buildSaveManifest classifies
//      into the create bucket; saveAnnotationChanges then POSTs _data.
//   4. render via the app's own redraw: simulated by nudging UI through their
//      exposed controls (zoom round-trip) since renderAnnotations is module-scoped.
//
// Load AFTER rw_undo.js (needs v2.3). Replaces v2.4 click-replay commit.
(function(){
  const RW = window.__RW;
  if (!RW || !RW.v23) return 'need v2.3 first';
  RW.v24 = true; // supersedes
  RW.v25 = true;

  /* ---------- contour tracing (Moore neighbor), generic over any 1/0 mask ----------
     Traces/smooths/simplifies any 1/0 mask (not just RW.labels regions), so
     e.g. rw_wallspan.js's wall-span selections share this pipeline. Reads no
     global RW.smoothPasses/RW.smoothEps — callers pass explicit
     smoothPasses/eps; _groupToPolygon (below) is the only place those
     globals are read, preserving region-commit behavior.
     opts: { seed:{x,y}|null (skip the O(W*H) scan if the caller already
              knows a mask pixel), smoothPasses:int (Chaikin rounds, ~0.5-1px
              inward erosion each), eps:number (DP tolerance, ignored if
              targetPts set), targetPts:int|null (bisect eps to the vertex
              count closest to, without exceeding, this target — see
              rw_elbow.js's `pts`; bisects only the cheap final simplify
              step, not the trace/Chaikin), W:int, H:int (override RW.W/RW.H
              for a local raster not sized to the page, e.g. rw_elbow.js's
              detection crop; defaults to RW.W/RW.H) } */
  // Douglas-Peucker on an OPEN polyline, self-recursing via RW._dpOpen (not a
  // closure) so RW._traceGridBoundary's own `pts` cap can reuse it too.
  RW._dpOpen = function(pts, eps2){
    if (pts.length<3) return pts;
    const [x1,y1]=pts[0], [x2,y2]=pts[pts.length-1];
    const dx=x2-x1, dy=y2-y1, len=Math.hypot(dx,dy)||1;
    let maxD=0, idx=0;
    for (let i=1;i<pts.length-1;i++){
      const dd=Math.abs(dy*pts[i][0]-dx*pts[i][1]+x2*y1-y2*x1)/len;
      if (dd>maxD){maxD=dd;idx=i;}
    }
    if (maxD>eps2){
      const l=RW._dpOpen(pts.slice(0,idx+1),eps2), r=RW._dpOpen(pts.slice(idx),eps2);
      return l.slice(0,-1).concat(r);
    }
    return [pts[0], pts[pts.length-1]];
  };

  // Simplify a CLOSED ring at a given eps — splits at the point farthest
  // from ring[0] (eps-independent; pass a precomputed `far` when bisecting
  // many eps values to skip re-scanning) into two open chains, DP-simplifies
  // each, merges. Works on any closed point ring regardless of source
  // (Chaikin-smoothed Moore trace or RW._traceGridBoundary's exact walk).
  //
  // FIXED BUG: the second half used to run `RW._dpOpen(ring.slice(far),
  // eps2)`, stopping at ring[n-1] instead of wrapping back to ring[0] — the
  // final `.slice(0,-1)` merge then silently dropped the ring's true closing
  // vertex. Invisible for years on Chaikin-smoothed rings (the dropped point
  // sits ~0.25-0.75px from ring[0]) but a real, visible defect on an exact
  // grid-boundary trace (e.g. a rectangle simplified to a 3-point triangle at
  // any eps). Fixed by appending ring[0] onto the second half before
  // simplifying, so DP sees the true closing edge.
  RW._simplifyRing = function(ring, eps2, far){
    if (far == null){
      let farD=0; far=0;
      const [sx2,sy2]=ring[0];
      for (let i=0;i<ring.length;i++){
        const d=Math.hypot(ring[i][0]-sx2, ring[i][1]-sy2);
        if (d>farD){farD=d;far=i;}
      }
    }
    const h1=RW._dpOpen(ring.slice(0,far+1), eps2), h2=RW._dpOpen(ring.slice(far).concat([ring[0]]), eps2);
    return h1.slice(0,-1).concat(h2.slice(0,-1));
  };

  // Bisect eps to land at the vertex count closest to, without exceeding,
  // `targetPts` — extracted out of RW._maskToPolygon's inline bisection so
  // RW._traceGridBoundary's own `pts` cap can reuse the exact same bracket
  // and "unreachable" handling instead of re-deriving it. `far` is passed
  // straight through to RW._simplifyRing on every iteration (still
  // eps-independent, so still safe to reuse — see RW._simplifyRing's own
  // comment); each of the ~20 iterations only re-runs the cheap DP halves,
  // never re-traces or re-Chaikins.
  RW._bisectRingToTargetPts = function(ring, targetPts, far){
    // Floor above 0 (not at it): eps->0 makes DP retain nearly every point,
    // and its recursion depth scales with retained-point count — a real
    // risk once `ring` is large (a high-resolution local raster, see
    // rw_elbow.js's `res` tunable).
    let lo = 0.05, hi = 1e5;
    const at = (eps) => RW._simplifyRing(ring, eps, far);
    if (at(lo).length <= targetPts) return at(lo);
    if (at(hi).length > targetPts) return at(hi); // unreachable even at max simplification — caller should notice
    for (let iter=0; iter<20; iter++){
      const mid = (lo+hi)/2;
      if (at(mid).length <= targetPts) hi = mid; else lo = mid;
    }
    return at(hi);
  };

  RW._maskToPolygon = function(uni, opts){
    opts = opts || {};
    const W = opts.W != null ? opts.W : RW.W;
    const H = opts.H != null ? opts.H : RW.H;
    const passes = opts.smoothPasses != null ? opts.smoothPasses : 4;
    const on = (x,y)=> x>=0&&x<W&&y>=0&&y<H&&uni[y*W+x]===1;
    let sx=-1, sy=-1;
    if (opts.seed){
      sx=opts.seed.x; sy=opts.seed.y;
      if (!on(sx,sy)) return null;
    } else {
      outer: for (let y=0;y<H;y++) for (let x=0;x<W;x++){ if(on(x,y)){sx=x;sy=y;break outer;} }
    }
    if (sx<0) return null;
    const dirs=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
    let path=[[sx,sy]];
    let cx=sx, cy=sy, dir=6;
    for (let step=0; step<400000; step++){
      let found=false;
      for (let k=0;k<8;k++){
        const d=(dir+k)%8;
        const nx=cx+dirs[d][0], ny=cy+dirs[d][1];
        if (on(nx,ny)){ cx=nx; cy=ny; dir=(d+6)%8; found=true; path.push([cx,cy]); break; }
      }
      if (!found) break;
      if (cx===sx&&cy===sy&&path.length>3) break;
    }
    // Chaikin corner-cutting: smooth pixel staircases (dragon's teeth) on
    // diagonal edges. Each vertex -> two points at 25%/75% of adjacent edges.
    // `rounds` progressively erode ~0.5-1px inward per pass at mask res.
    function chaikin(pts, rounds){
      let out = pts;
      for (let p=0;p<rounds;p++){
        const next = [];
        for (let i=0;i<out.length;i++){
          const [ax,ay]=out[i], [bx,by]=out[(i+1)%out.length];
          next.push([ax*0.75+bx*0.25, ay*0.75+by*0.25]);
          next.push([ax*0.25+bx*0.75, ay*0.25+by*0.75]);
        }
        out = next;
      }
      return out;
    }
    // The `path.length>=8` gate and Chaikin's `work`/`far` split are both
    // eps-independent (far is picked by max distance from work[0], computed
    // before any eps comparison) — run them ONCE, then RW._simplifyRing just
    // re-runs the cheap DP halves. This is what makes targetPts's bisection
    // below affordable: each of its ~20 iterations only redoes DP, not the
    // Moore trace or Chaikin smoothing.
    let work = null, far = 0;
    if (path.length >= 8){
      work = chaikin(path, passes);
      let farD=0;
      const [sx2,sy2]=work[0];
      for (let i=0;i<work.length;i++){
        const d=Math.hypot(work[i][0]-sx2, work[i][1]-sy2);
        if (d>farD){farD=d;far=i;}
      }
    }
    let simp;
    if (opts.targetPts != null && opts.targetPts > 0 && work){
      simp = RW._bisectRingToTargetPts(work, opts.targetPts, far);
    } else if (work){
      const e2 = opts.eps != null ? opts.eps : 1.2;
      simp = RW._simplifyRing(work, e2, far);
    } else {
      simp = path; // too few raw points for Chaikin/DP to matter
    }
    return simp.map(([x,y])=>({x:+(x/W).toFixed(6), y:+(y/H).toFixed(6)}));
  };

  /* ---------- exact pixel-EDGE boundary tracer, distinct from the Moore
     pixel-CENTER tracer above ----------
     RW._maskToPolygon walks pixel CENTERS (8-connected, diagonal jumps
     allowed) and relies on Chaikin+DP to turn the resulting staircase into a
     smooth curve. This tracer instead walks the grid EDGES *between* pixels
     — every output edge is purely horizontal or vertical, and a vertex is
     emitted only where the walk genuinely changes direction, so a long
     straight run of boundary pixels collapses to one edge for free, with no
     simplification pass needed. Built for rw_elbow.js's "pixel-precise"
     trace mode (RW._elbowPixelPrecise) — the user's own ask, after finding
     the Px:src debug overlay more trustworthy than the smoothed trace once a
     color has been picked.

     Construction: each foreground pixel's 4 sides bordering background (or
     out-of-bounds, background by convention) become directed edges between
     the two grid corners at that side, foreground always on the RIGHT of
     travel — repeated right turns cycle N->E->S->W->N, clockwise in this
     codebase's y-down coordinates, matching the Moore tracer's orientation.

     No seed: always starts at the topmost-then-leftmost foreground pixel,
     which is provably unambiguous (an ambiguous corner needs its diagonal-
     opposite pixel foreground too, which would have to appear earlier in
     raster order — a contradiction).

     Ambiguous corners: an 8-connected region can touch itself diagonally at
     one corner, which this construction sees as 2 valid outgoing directions
     there (always an opposite pair). RULE: take the direction 90 degrees
     COUNTER-CLOCKWISE from the incoming one. This is the correct pairing for
     8-connected-foreground/4-connected-background (the standard convention
     that avoids ambiguity at a shared corner) — the CLOCKWISE reading
     instead traces only half of a diagonally-touching component, or (for a
     ring with a hole) splices the hole into the outer boundary as one wrong
     shape. Derived by hand and independently re-derived by an adversarial
     review; full worked proof (a 2x2 checkerboard, a 3x3 ring) is in
     CLAUDE.md and directly tested in verify_gridboundary.js. **Do not "fix"
     this back to clockwise without re-reading that proof** — it looks like
     an arbitrary choice but isn't.

     Output can be a WEAKLY simple polygon (a genuine pinch point revisits
     one corner) — exact for area, but a caller simplifying with DP
     (RW._bisectRingToTargetPts) must check for a resulting true self-
     intersection; that check lives in rw_elbow.js, not here, since this
     function's job is to trace exactly, not simplify.

     opts: { W:int, H:int }. Returns [{x,y}] (same 0-1 fraction format as
     RW._maskToPolygon) or null if the mask is empty or the walk can't close
     (a bug, not expected on a real boundary — the step budget is a safety
     net only). */
  RW._traceGridBoundary = function(mask, opts){
    opts = opts || {};
    const W = opts.W != null ? opts.W : RW.W;
    const H = opts.H != null ? opts.H : RW.H;
    let fgCount = 0;
    for (let i=0;i<mask.length;i++) if (mask[i]) fgCount++;
    if (!fgCount) return null;
    let startX=-1, startY=-1;
    outer: for (let y=0;y<H;y++) for (let x=0;x<W;x++){ if (mask[y*W+x]){ startX=x; startY=y; break outer; } }
    const fg = (x,y) => x>=0 && x<W && y>=0 && y<H && mask[y*W+x]===1;
    const DIRS = { E:[1,0], S:[0,1], W:[-1,0], N:[0,-1] };
    const CCW  = { N:'W', W:'S', S:'E', E:'N' };
    const maxSteps = 4*fgCount + 8; // a correct trace can never exceed this — mirrors RW._maskToPolygon's own step<400000 bailout idiom

    let cx = startX, cy = startY;
    let dir = 'E'; // proven unambiguous first direction, see header comment
    const verts = [[cx, cy]];
    let steps = 0;
    while (true){
      const [dx,dy] = DIRS[dir];
      cx += dx; cy += dy;
      steps++;
      if (steps > maxSteps) return null;
      if (cx === startX && cy === startY) break; // closed — start corner's position is already verts[0]

      // The 4 pixels touching this corner: NW=(cx-1,cy-1), NE=(cx,cy-1),
      // SW=(cx-1,cy), SE=(cx,cy). Each of the 4 possible outgoing directions
      // from a corner is valid iff exactly one of its two flanking pixels is
      // foreground — derived directly from the per-pixel-side construction
      // above (e.g. "outgoing east" is pixel(cx,cy)'s own top edge, valid
      // iff SE is foreground and NE is not).
      const NW = fg(cx-1,cy-1), NE = fg(cx,cy-1), SW = fg(cx-1,cy), SE = fg(cx,cy);
      const validE = SE && !NE, validS = SW && !SE, validW = NW && !SW, validN = NE && !NW;
      const count = (validE?1:0) + (validS?1:0) + (validW?1:0) + (validN?1:0);
      if (count === 0) return null; // structurally impossible on a real boundary — safety net, not an expected path
      const nextDir = count === 1
        ? (validE ? 'E' : validS ? 'S' : validW ? 'W' : 'N')
        : CCW[dir]; // ambiguous corner — see header proof
      if (nextDir !== dir) verts.push([cx, cy]);
      dir = nextDir;
    }
    return verts.map(([x,y]) => ({ x:+(x/W).toFixed(6), y:+(y/H).toFixed(6) }));
  };

  /* ---------- region contour tracing (union of group members) ---------- */
  RW._groupToPolygon = function(gid, eps){
    const {W,H,labels,regions} = RW;
    const memberIds = new Set(regions.filter(r=>r.group===gid).map(r=>r.id));
    if (!memberIds.size) return null;
    const uni = new Int8Array(W*H);
    for (let i=0;i<W*H;i++){
      const l = labels[i];
      uni[i] = (l>=0 && memberIds.has(l)) ? 1 : 0;
    }
    // Globals win here, exactly as before the v3.1 refactor — _maskToPolygon
    // itself no longer looks at RW.smoothPasses/RW.smoothEps at all.
    const passes = RW.smoothPasses != null ? RW.smoothPasses : 4;
    const e2 = RW.smoothEps != null ? RW.smoothEps : (eps||1.2);
    return RW._maskToPolygon(uni, {seed:null, smoothPasses:passes, eps:e2});
  };

  /* ---------- direct annotation creation ---------- */
  let tempCounter = 1;
  // notes: optional string (default '', matching every caller before this
  // parameter existed) — e.g. rw_wallspan.js's commitPipe uses this to record
  // the measured pipe width, and rw_elbow.js's commitElbow uses it to record
  // its detection tunables, without inventing a new annotation type or a
  // text-rendering mechanism of its own.
  RW._createPendingAnnotation = function(normPts, notes){
    notes = notes || '';
    const st = annotationState;
    const tag = st.currentTag;
    const tempId = 'temp_rw_' + (Date.now()%100000) + '_' + (tempCounter++);
    const annotationData = {
      page_id: st.pageId,
      measurement_type: 'POLYGON',
      points_data: normPts,
      notes: notes,
      temp_id: tempId,
    };
    if (tag) annotationData.tag_id = tag.id;
    const newAnnotation = {
      id: tempId,
      tag: tag || null,
      labels: [],
      measurement_type: 'POLYGON',
      coordinates: normPts,
      notes: notes,
      _pending: true,
      _data: annotationData,
    };
    // 1. state
    st.annotations.push(newAnnotation);
    // 2. WAL entry (this is what buildSaveManifest reads)
    window.editHistory.push(window.createHistoryEntry('create_annotation', {
      description: 'Draw polygon',
      targetId: newAnnotation.id,
      targetType: 'annotation',
      before: null,
      after: JSON.parse(JSON.stringify(newAnnotation)),
    }));
    return newAnnotation;
  };

  /* ---------- redraw: force the app to re-render annotations ----------
     renderAnnotations is module-scoped. The exposed zoom controls trigger a
     full re-render pipeline. We do a silent zoom round-trip. */
  RW._forceRender = async function(){
    const zin = document.getElementById('zoom-in-btn');
    const zout = document.getElementById('zoom-out-btn');
    if (zin && zout){
      zin.click();
      await new Promise(r=>setTimeout(r,120));
      zout.click();
      await new Promise(r=>setTimeout(r,120));
    }
  };

  /* ---------- commit flow ---------- */
  RW._commitAbort = false;
  RW.commitSelected = async function(){
    if (!RW.selected.size){ RW._commitStatus('nothing selected'); return; }
    if (!annotationState.currentTag){ RW._commitStatus('no active tag — press a tag number first'); return; }
    const groups = Array.from(RW.selected);
    const total = groups.length;
    let done = 0, failed = 0;
    const tagName = annotationState.currentTag.name;
    RW._commitStatus('committing 0/'+total+' — tag: '+tagName);
    const created = [];
    for (const gid of groups){
      const poly = RW._groupToPolygon(gid, 1.2);
      if (!poly || poly.length < 3){ failed++; continue; }
      created.push(RW._createPendingAnnotation(poly));
      done++;
      RW._commitStatus('staged '+done+'/'+total+' (failed: '+failed+')');
    }
    RW._commitStatus('staged '+done+', rendering...');
    await RW._forceRender();
    RW._commitStatus('done: '+done+' committed, '+failed+' failed — review and Save');
    RW._lastCommit = created;
    RW.selected = new Set();
    RW.renderList(); RW.renderOverlay();
    RW._renderCommitPreview();
  };
  RW.abortCommit = function(){ RW._commitAbort = true; };
  RW._commitStatus = function(msg){
    const el = document.getElementById('rw-commit-status');
    if (el) el.innerText = msg;
    console.log('[RW commit]', msg);
  };

  /* ---------- panel wiring ---------- */
  const commitBtn = document.getElementById('rw-commit');
  if (commitBtn) commitBtn.onclick = ()=>RW.commitSelected();
  const panel = document.getElementById('rw-panel');
  if (panel && !document.getElementById('rw-commit-status')){
    const s = document.createElement('div');
    s.id='rw-commit-status';
    s.style.cssText='font-size:11px;opacity:0.75;margin-top:4px;min-height:14px;';
    panel.insertBefore(s, document.getElementById('rw-list'));
  }

  return 'v2.5 direct-write commit up: instant staging, no click replay';
})()

;
// ===== rw_brushpoly.js =====
// RW v2.6 — Poly (dual-action) + Brush mask tools.
// Load AFTER rw_undo.js (needs v2.3). Adds:
//   N  — Poly2 tool: freeform vertices, dbl-click closes. Shift+N toggles block/open.
//   J  — Brush tool: freehand stroke, Tab+scroll sizes radius. Shift+J toggles block/open.
//   A  — Cycle maskAction: block → open → add (creates new regions from drawn shapes).
(function(){
  const RW = window.__RW;
  if (!RW || !RW.v23) return 'need v2.3 first';
  if (RW.v26) return 'v2.6 already installed';
  if (window.__RWv26listeners) return 'v2.6 listeners already attached';
  window.__RWv26listeners = true;
  RW.v26 = true;
  RW._previewV = 5;

  const ac = document.getElementById('annotation-canvas');

  RW.maskAction = 'block';
  RW.brushR = 6;

  RW.setMaskMode2 = function(mode){
    if (RW.maskMode==='rect'){ RW.maskMode=null; RW.__rectStartN=null; RW.__rectCurN=null;
      document.getElementById('annotation-canvas').style.cursor='';
      const rl=document.getElementById('rw-rectline'); if(rl) rl.remove();
      if (RW._syncRectBtn) RW._syncRectBtn(); }
    RW.maskMode2 = mode || null;
    RW._polyPtsN = [];
    ['rw-polyline','rw-rectline','rw-brushline'].forEach(id=>{
      const el=document.getElementById(id); if(el) el.remove();
    });
    ac.style.cursor = RW.maskMode2 ? 'crosshair' : '';
    RW._syncToolButtons();
  };

  RW._actionLabel = function(){ return RW.maskAction==='block'?'−':RW.maskAction==='open'?'+':'⊕'; };
  RW._actionColor = function(){ return RW.maskAction==='block'?'orange':RW.maskAction==='open'?'deepskyblue':'limegreen'; };
  RW._actionBg = function(){ return RW.maskAction==='block'?'rgba(255,160,60,0.18)':RW.maskAction==='open'?'rgba(60,180,255,0.18)':'rgba(50,205,50,0.18)'; };
  RW.setMaskAction = function(a){ RW.maskAction = a; RW._syncToolButtons(); RW._syncRectBtn && RW._syncRectBtn(); };

  RW._syncToolButtons = function(){
    const label = RW._actionLabel();
    const pb = document.getElementById('rw-poly2');
    if (pb) pb.innerText = 'Poly2 ' + label + ' (N)';
    if (pb) pb.style.background = RW.maskMode2==='poly2' ? 'rgba(255,160,60,0.4)' : '';
    const bb = document.getElementById('rw-brush');
    if (bb) bb.innerText = 'Brush ' + label + ' (J)';
    if (bb) bb.style.background = RW.maskMode2==='brush' ? 'rgba(255,160,60,0.4)' : '';
    const ab = document.getElementById('rw-addmode');
    if (ab){
      ab.innerText = 'Add ' + label + ' (A)';
      ab.style.background = RW.maskAction==='add' ? 'rgba(50,205,50,0.45)' : '';
    }
  };

  RW._paintDisk = function(mx, my, r, val){
    const {W,H,wall} = RW;
    const x0=Math.max(0,Math.round(mx-r)), x1=Math.min(W-1,Math.round(mx+r));
    const y0=Math.max(0,Math.round(my-r)), y1=Math.min(H-1,Math.round(my+r));
    const r2=r*r;
    for (let y=y0;y<=y1;y++) for (let x=x0;x<=x1;x++){
      const dx=x-mx, dy=y-my;
      if (dx*dx+dy*dy<=r2) wall[y*W+x]=val;
    }
  };

  ac.addEventListener('mousedown', function(e){
    if (!RW.maskMode2) return;
    e.stopPropagation(); e.preventDefault();
    let [nx,ny]=RW._toNorm(e.clientX,e.clientY);
    if (RW.maskMode2==='poly2'){
      if (RW._trySnap && !e.shiftKey){ const s=RW._trySnap(nx,ny); nx=s[0]; ny=s[1]; }
      RW._polyPtsN = RW._polyPtsN || [];
      RW._polyPtsN.push([nx,ny]);
      return;
    }
    if (RW.maskMode2==='brush'){
      RW._brushDown = true;
      RW._brushStroke = [[nx,ny]];
      RW._snapshot('brush');
      const val = RW.maskAction==='add' ? 0 : (RW.maskAction==='block' ? 1 : 0);
      RW._paintDisk(nx*RW.W, ny*RW.H, RW.brushR, val);
    }
  }, true);

  ac.addEventListener('mousemove', function(e){
    if (!RW.maskMode2) return;
    e.stopPropagation();
    const [nx,ny]=RW._toNorm(e.clientX,e.clientY);
    if (RW.maskMode2==='poly2'){
      RW._renderPreview({x:e.clientX,y:e.clientY});
      if (RW._polyPtsN && RW._polyPtsN.length >= 2){
        const pts = RW._polyPtsN.concat([[nx,ny]]);
        RW._showAreaHint(RW._polyArea(pts));
      }
      return;
    }
    if (RW.maskMode2==='brush'){
      if (RW._brushDown){
        RW._brushStroke.push([nx,ny]);
        const val = RW.maskAction==='add' ? 0 : (RW.maskAction==='block' ? 1 : 0);
        RW._paintDisk(nx*RW.W, ny*RW.H, RW.brushR, val);
      }
      RW._renderBrushCursor(e.clientX, e.clientY);
      if (RW._brushDown && RW._brushStroke && RW._brushStroke.length > 1){
        const strokes = RW._brushStroke.length;
        const px = Math.round(strokes * RW.brushR * 2 * RW.brushR * 2);
        RW._showAreaHint(px);
      }
    }
  }, true);

  ac.addEventListener('mouseup', function(e){
    if (!RW.maskMode2) return;
    e.stopPropagation(); e.preventDefault();
    if (RW.maskMode2==='poly2') return;
    if (RW.maskMode2==='brush' && RW._brushDown){
      RW._brushDown = false;
      RW._showAreaHint(null);
      if (RW.maskAction==='add'){
        const {W,H,labels,regions,wall} = RW;
        const r = RW.brushR;
        let bx0=W, by0=H, bx1=0, by1=0;
        for (const [snx,sny] of RW._brushStroke){
          const mx=Math.round(snx*W), my=Math.round(sny*H);
          if (mx-(r+3)<bx0) bx0=mx-(r+3);
          if (my-(r+3)<by0) by0=my-(r+3);
          if (mx+(r+3)>bx1) bx1=mx+(r+3);
          if (my+(r+3)>by1) by1=my+(r+3);
        }
        bx0=Math.max(0,bx0); by0=Math.max(0,by0);
        bx1=Math.min(W-1,bx1); by1=Math.min(H-1,by1);
        const skip = new Uint8Array(W*H);
        for (let y=by0;y<=by1;y++) for (let x=bx0;x<=bx1;x++){
          const l=labels[y*W+x];
          if (l>=0 && regions[l] && regions[l].included) skip[y*W+x]=1;
        }
        // Create perimeter ring around the cleared stroke (skip existing regions)
        for (const [snx,sny] of RW._brushStroke){
          const mx=Math.round(snx*W), my=Math.round(sny*H);
          const r0=Math.max(0,mx-(r+2)), r1=Math.min(W-1,mx+(r+2));
          const c0=Math.max(0,my-(r+2)), c1=Math.min(H-1,my+(r+2));
          for (let y=c0;y<=c1;y++) for (let x=r0;x<=r1;x++){
            if (skip[y*W+x]) continue;
            if ((x-mx)*(x-mx)+(y-my)*(y-my)<=(r+2)*(r+2)) wall[y*W+x]=1;
          }
        }
        for (const [snx,sny] of RW._brushStroke){
          const mx=Math.round(snx*W), my=Math.round(sny*H);
          const r0=Math.max(0,mx-(r-1)), r1=Math.min(W-1,mx+(r-1));
          const c0=Math.max(0,my-(r-1)), c1=Math.min(H-1,my+(r-1));
          for (let y=c0;y<=c1;y++) for (let x=r0;x<=r1;x++){
            if (skip[y*W+x]) continue;
            if ((x-mx)*(x-mx)+(y-my)*(y-my)<=(r-1)*(r-1)) wall[y*W+x]=0;
          }
        }
      }
      RW._relabel();
      if (RW.maskAction==='add' && RW._brushStroke && RW._brushStroke.length){
        // Force-include the region at the center of the brush stroke
        const sn = RW._brushStroke[Math.floor(RW._brushStroke.length/2)];
        const cx = Math.round(sn[0]*RW.W), cy = Math.round(sn[1]*RW.H);
        if (cx>=0 && cx<RW.W && cy>=0 && cy<RW.H){
          const l = RW.labels[cy*RW.W + cx];
          if (l>=0 && RW.regions[l]) RW.regions[l].included = true;
        }
      }
      RW.renderList(); RW.renderOverlay();
      RW._renderCommitPreview();
    }
  }, true);

  ac.addEventListener('dblclick', function(e){
    if (RW.maskMode2!=='poly2') return;
    e.stopPropagation(); e.preventDefault();
      if (RW._polyPtsN && RW._polyPtsN.length>=3){
      const mpts = RW._polyPtsN.map(([nx,ny])=>[nx*RW.W, ny*RW.H]);
      if (RW.maskAction==='add'){
        const {W,H,labels,regions,wall} = RW;
        let bx0=W, by0=H, bx1=0, by1=0;
        for (const [x,y] of mpts){
          if (Math.round(x)-3<bx0) bx0=Math.round(x)-3;
          if (Math.round(y)-3<by0) by0=Math.round(y)-3;
          if (Math.round(x)+3>bx1) bx1=Math.round(x)+3;
          if (Math.round(y)+3>by1) by1=Math.round(y)+3;
        }
        bx0=Math.max(0,bx0); by0=Math.max(0,by0);
        bx1=Math.min(W-1,bx1); by1=Math.min(H-1,by1);
        const skip = new Uint8Array(W*H);
        for (let y=by0;y<=by1;y++) for (let x=bx0;x<=bx1;x++){
          const l=labels[y*W+x];
          if (l>=0 && regions[l] && regions[l].included) skip[y*W+x]=1;
        }
        // Fill-then-hollow with skip: paint wall over whitespace, clear interior
        for (let y=by0;y<=by1;y++) for (let x=bx0;x<=bx1;x++) wall[y*W+x]=1;
        // Shrink polygon inward by 2 mask px and clear the interior
        const cx=mpts.reduce((s,[x])=>s+x,0)/mpts.length, cy=mpts.reduce((s,[,y])=>s+y,0)/mpts.length;
        const inner = mpts.map(([x,y])=>{
          const dx=x-cx, dy=y-cy, d=Math.hypot(dx,dy)||1;
          return [x-(dx/d)*2, y-(dy/d)*2];
        });
        // Clear interior of the inner polygon, then restore skip pixels
        RW._paintPoly(inner, 0);
        for (let y=by0;y<=by1;y++) for (let x=bx0;x<=bx1;x++)
          if (skip[y*W+x]) wall[y*W+x]=1;
      } else if (RW.maskAction==='open'){
        // open mode: seal perimeter gaps, then convert interior walls to non-wall
        RW._paintPolylineGap(mpts);
        const W=RW.W, H=RW.H, wall=RW.wall;
        let minY=H,maxY=0;
        for (const [x,y] of mpts){ if(y<minY)minY=y; if(y>maxY)maxY=y; }
        minY=Math.max(0,minY|0); maxY=Math.min(H-1,Math.ceil(maxY));
        for (let y=minY;y<=maxY;y++){
          const xs=[];
          for (let i=0,j=mpts.length-1;i<mpts.length;j=i++){
            const [xi,yi]=mpts[i], [xj,yj]=mpts[j];
            if ((yi>y)!==(yj>y)) xs.push(xi+(y-yi)/(yj-yi)*(xj-xi));
          }
          xs.sort((a,b)=>a-b);
          for (let k=0;k+1<xs.length;k+=2){
            const xa=Math.max(0,Math.round(xs[k])), xb=Math.min(W-1,Math.round(xs[k+1]));
            for (let x=xa;x<=xb;x++) if (wall[y*W+x]===1) wall[y*W+x]=0;
          }
        }
      } else {
        RW._paintPoly(mpts, RW.maskAction==='block' ? 1 : 0);
      }
      RW._relabel();
      if (RW.maskAction==='add' && RW._polyPtsN && RW._polyPtsN.length){
        // Force-include the region at the centroid of the drawn poly
        const cxN = RW._polyPtsN.reduce((s,[x])=>s+x,0)/RW._polyPtsN.length;
        const cyN = RW._polyPtsN.reduce((s,[,y])=>s+y,0)/RW._polyPtsN.length;
        const cx = Math.round(cxN*RW.W), cy = Math.round(cyN*RW.H);
        if (cx>=0 && cx<RW.W && cy>=0 && cy<RW.H){
          const l = RW.labels[cy*RW.W + cx];
          if (l>=0 && RW.regions[l]) RW.regions[l].included = true;
        }
      }
      RW.renderList(); RW.renderOverlay();
      RW._renderCommitPreview();
    }
    RW._polyPtsN=[];
    const pl=document.getElementById('rw-polyline'); if(pl) pl.remove();
    RW._showAreaHint(null);
  }, true);

  ac.addEventListener('click', function(e){
    if (RW.maskMode2){ e.stopPropagation(); e.preventDefault(); }
  }, true);

  ac.addEventListener('wheel', function(e){
    if (RW.maskMode2!=='brush' || !RW.__tabHeld) return;
    e.stopPropagation(); e.preventDefault();
    RW.brushR = Math.min(30, Math.max(2, RW.brushR + (e.deltaY<0?1:-1)));
    const bb = document.getElementById('rw-brush');
    if (bb) bb.title = 'Brush radius: '+RW.brushR+' mask px (Tab+scroll to resize)';
    RW._renderBrushCursor(e.clientX, e.clientY);
  }, {capture:true, passive:false});

  ac.addEventListener('wheel', function(e){
    if (!RW.maskMode2) return;
    if (RW.__tabHeld) return;
    requestAnimationFrame(() => {
      if (RW.maskMode2==='brush') RW._renderBrushCursor(e.clientX||0, e.clientY||0);
    });
  }, {passive:true});

  window.addEventListener('keydown', function(e){
    if (e.key==='Tab' && RW.maskMode2==='brush'){ RW.__tabHeld = true; e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  window.addEventListener('keyup', function(e){
    if (e.key==='Tab') RW.__tabHeld = false;
  }, true);

  RW._renderBrushCursor = function(cx, cy){
    const svg = RW._mkSvg('rw-brushline', 72);
    const [nx,ny]=RW._toNorm(cx,cy);
    const [px,py]=RW._toPx(nx,ny);
    const pr = RW._toPx(RW.brushR/RW.W, 0)[0];
    const col = RW._actionColor();
    const sw = 1.2;
    let inner = '<circle cx="'+px+'" cy="'+py+'" r="'+pr+'" fill="none" stroke="'+col+'" stroke-width="'+sw+'" stroke-dasharray="8"/>';
    if (RW._brushDown && RW._brushStroke && RW._brushStroke.length){
      const fill = RW.maskAction==='add' ? 'rgba(50,205,50,0.35)' : (RW.maskAction==='block' ? 'rgba(255,120,0,0.30)' : 'rgba(60,180,255,0.30)');
      // Single thick polyline, not N circles — 1 DOM node vs. hundreds, big perf win for long strokes
      const ptsStr = RW._brushStroke.map(([snx,sny])=>{
        const [spx,spy]=RW._toPx(snx,sny);
        return spx+','+spy;
      }).join(' ');
      inner += '<polyline points="'+ptsStr+'" fill="none" stroke="'+fill+'" stroke-width="'+(pr*2)+'" stroke-linecap="round" stroke-linejoin="round"/>';
    }
    svg.innerHTML = inner;
  };

  const sc = document.getElementById('canvas-scroll-container');
  sc.addEventListener('scroll', function(){
    if (!RW.maskMode2) return;
    if (RW.maskMode2==='poly2') RW._renderPreview(null);
  }, {passive:true});

  (function(){
    const orig = RW._renderPreview;
    RW._renderPreview = function(cursorClient){
      const ret = orig.call(RW, cursorClient);
      if (RW.maskMode2==='poly2'){
        const svg = document.getElementById('rw-polyline');
        if (svg){
          const col = RW._actionColor();
          svg.querySelectorAll('polyline,circle').forEach(el=>{
            el.setAttribute('stroke', col);
          });
        }
      }
      return ret;
    };
  })();

  window.addEventListener('keydown', function(e){
    const t=e.target;
    if (t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable)) return;
    if (e.ctrlKey||e.metaKey||e.altKey) return;
    const k = e.key.toLowerCase();
    if (k==='a'){
      e.preventDefault(); e.stopImmediatePropagation();
      RW.setMaskAction(RW.maskAction==='add' ? 'block' : 'add');
      return;
    }
    if (k==='n'){
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.shiftKey){ const next=RW.maskAction==='block'?'open':RW.maskAction==='open'?'add':'block'; RW.setMaskAction(next); return; }
      if (RW.maskMode==='rect'){ RW.maskMode=null; RW.__rectStartN=null; RW.__rectCurN=null;
        document.getElementById('annotation-canvas').style.cursor='';
        const rl=document.getElementById('rw-rectline'); if(rl) rl.remove();
        RW._syncRectBtn(); }
      RW.setMaskMode2(RW.maskMode2==='poly2' ? null : 'poly2');
    }
    if (k==='j'){
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.shiftKey){ const next=RW.maskAction==='block'?'open':RW.maskAction==='open'?'add':'block'; RW.setMaskAction(next); return; }
      if (RW.maskMode==='rect'){ RW.maskMode=null; RW.__rectStartN=null; RW.__rectCurN=null;
        document.getElementById('annotation-canvas').style.cursor='';
        const rl=document.getElementById('rw-rectline'); if(rl) rl.remove();
        RW._syncRectBtn(); }
      RW.setMaskMode2(RW.maskMode2==='brush' ? null : 'brush');
    }
    if (e.key==='Escape' && RW.maskMode2){
      e.preventDefault(); e.stopImmediatePropagation();
      if (RW.maskMode2==='poly2' && RW._polyPtsN && RW._polyPtsN.length){
        RW._polyPtsN=[];
        const pl=document.getElementById('rw-polyline'); if(pl) pl.remove();
      } else {
        RW.setMaskMode2(null);
      }
    }
    if (e.key==='Backspace' && RW.maskMode2==='poly2'){
      e.preventDefault(); e.stopImmediatePropagation();
      if (RW._polyPtsN && RW._polyPtsN.length){
        RW._polyPtsN.pop();
        RW._renderPreview(null);
      }
    }
  }, true);

  const bar = (document.getElementById('rw-pick') || {}).parentNode;
  const legacyPoly = document.getElementById('rw-poly');
  if (legacyPoly) legacyPoly.style.display = 'none';
  function addBtn(id, title){
    if (document.getElementById(id)) return null;
    const b=document.createElement('button');
    b.id=id; b.title=title;
    b.style.cssText='font-size:11px;padding:2px 6px;';
    bar.appendChild(b);
    return b;
  }
  const pb = addBtn('rw-poly2','Freeform mask: click vertices, double-click closes. Shift+N toggles mode.');
  if (pb) pb.onclick=()=>RW.setMaskMode2(RW.maskMode2==='poly2'?null:'poly2');
  const bb = addBtn('rw-brush','Freehand mask stroke. Tab+scroll resizes. Shift+J toggles mode.');
  if (bb) bb.onclick=()=>RW.setMaskMode2(RW.maskMode2==='brush'?null:'brush');
  const ab = document.createElement('button');
  ab.id='rw-addmode'; ab.title='Toggle Add Region mode. A key also toggles.';
  ab.style.cssText='font-size:11px;padding:2px 6px;';
  ab.onclick=()=>{
    RW.setMaskAction(RW.maskAction==='add' ? 'block' : 'add');
  };
  bar.appendChild(ab);
  RW._syncToolButtons();

  return 'v2.6 up: Poly2 (N) + Brush (J) + Add (A)';
})()

;
// ===== rw_healinterior.js =====
// RW v3 — interior noise healing.
//
// Reframed from the whole-page text-density overlay (rw_textdetect.js): the
// real problem is "which wall pixels inside a region about to be committed
// are pure interior noise (text/hatch/dimension/leader marks) versus the
// region's genuine perimeter" — dimension/leader lines legitimately touch a
// region's true boundary too, so the commit contour trace weaves into them.
//
// Six failure modes found live, in order (topology alone can't always
// distinguish noise from real content — see each fix below):
//   1. Component veto (flood + veto the WHOLE blob if any part touches
//      something unsafe) was fatally coarse — leader lines touch the real
//      perimeter often enough that ~65% of a region's wall got vetoed
//      together. Fixed with a per-pixel test instead of a whole-component one.
//   2. Per-pixel test bounded by fixed padding around the region's open-pixel
//      bbox failed on hatch-heavy jobs: the clearing sits deep inside a much
//      larger hatch mass and the pad never reaches real exterior (100%
//      false-safe). Fixed by bounding via REACHABILITY, not a guessed pad —
//      the flood stops naturally at real barriers.
//   3. Unbounded reachability flood explored ~2.65M px (nearly the whole
//      page) when a region had no nearby neighbor to fence it in. Fixed with
//      a hole-size threshold (RW._healNoiseHoleMax): a big enough
//      neighboring open area counts as protected even if not `included`.
//   4. That threshold still can't help when door-opening gaps merge a real
//      building's floor plan into the SAME open region as the noise — no
//      second label exists to be "not merged with." Indistinguishable from
//      noise by pure topology; not fully fixed, documented as a known limit.
//   5. (Fixed, shipped.) Existing annotations' wall-knockout looked exactly
//      like real noise from the inside. Fixed by rebuilding that knockout
//      mask here and hard-excluding it from both the flood and the result.
//   6. (Fixed, shipped.) The per-pixel test only checks 1-hop neighbors —
//      correct for thin lines, but on a THICK drawn barrier only its ~1px
//      outer skin registers unsafe, so healing hollowed out its middle.
//      Fixed by widening that "unsafe shell" via a bounded BFS
//      (RW._healBarrierMargin, ~12px default).
//
//      IMPORTANT: this margin only protects from ONE side. A region's own
//      boundary line always has that region's own interior on its near face,
//      which never registers as unsafe (crossing into your own open space
//      isn't foreign) — so the BFS only expands inward from the line's
//      single outer face. Verified: a 16px-thick barrier needed margin~=16
//      (the FULL thickness) to be fully protected; margin=10 (~2/3) still
//      left ~23% erodable. Set barrier≥ to the line's full visible
//      thickness, not half. Deep interior noise is unaffected either way.
(function(){
  const RW = window.__RW;
  // Needs v26 (rw_brushpoly.js): the cross-disarm wrap below reads
  // RW.setMaskMode2, which doesn't exist until then. Without this gate the
  // wrap silently no-ops instead of erroring, and Poly2/Brush stop disarming
  // the heal brush — confirmed live.
  if (!RW || !RW.v26) return 'need v2.6 (rw_brushpoly.js) first';
  if (RW.v3) return 'v3 already installed';
  RW.v3 = true;

  RW._healPreviewOn = false;
  RW._healNoiseMask = null;

  // For the given set of groups, find wall pixels that are both:
  //   (a) RELEVANT — reachable from the region's own open pixels through a
  //       path of only wall/same-region pixels (never crossing into exterior,
  //       a different included region, or a tiny excluded speck), and
  //   (b) SAFE — none of the pixel's own 4-neighbors are true unenclosed
  //       exterior or a different included region (per-pixel, not a
  //       connected-component veto — see failure modes 1-2 above).
  RW._computeInteriorNoise = function(gids){
    const {W,H,labels,regions,wall} = RW;
    const memberIds = new Set(regions.filter(r=>gids.has(r.group)).map(r=>r.id));
    if (!memberIds.size) return null;

    const isSameRegion = i => { const l=labels[i]; return l>=0 && memberIds.has(l); };

    // A neighboring open area is "protected" if included, OR bigger than
    // RW._healNoiseHoleMax — deliberately separate from RW._areaFloor (that
    // tunes candidate-region selectability, not noise-vs-feature size): real
    // rooms measured live at 868-5296px, well below a typical area-floor of
    // 6026px, so reusing area-floor here failed to protect them.
    const holeMax = RW._healNoiseHoleMax != null ? RW._healNoiseHoleMax : Math.round(300*(RW.W/2592));
    const isProtectedRegion = i => {
      const l = labels[i];
      if (l<0 || memberIds.has(l)) return false;
      const r = regions[l];
      return !!r && (r.included || r.size > holeMax);
    };

    // Existing annotations get knocked out into RW.wall as filled interior
    // (mirroring RW.extract()) but that knockout is indistinguishable from
    // text/hatch wall by topology alone — a wall pixel deep inside an
    // existing annotation looked "safe" too (failure mode 5). Rebuild the
    // same knockout mask here and hard-exclude it from both the flood and
    // the result.
    const annotationMask = new Uint8Array(W*H);
    if (typeof annotationState !== 'undefined'){
      const cv = document.createElement('canvas'); cv.width=W; cv.height=H;
      const actx = cv.getContext('2d');
      actx.fillStyle = '#000';
      for (const a of annotationState.annotations){
        if (a._hidden || a.is_void) continue;
        // bbox annotations store {x,y,width,height}, not a point array — the
        // old `pts.length<3` guard let it through (`undefined<3` is false)
        // to a pts.forEach() that doesn't exist on a plain object. Confirmed
        // live; Array.isArray guards it now.
        const pts = a.coordinates; if (!Array.isArray(pts) || pts.length<3) continue;
        actx.beginPath();
        pts.forEach((p,idx)=>{ const X=p.x*W, Y=p.y*H; idx?actx.lineTo(X,Y):actx.moveTo(X,Y); });
        actx.closePath(); actx.fill();
      }
      const adata = actx.getImageData(0,0,W,H).data;
      for (let i=0;i<W*H;i++) if (adata[i*4+3]>127) annotationMask[i]=1;
    }

    // True-unenclosed-exterior mask (reachable from the sheet border without
    // crossing a wall or any protected region), mirroring the same
    // border-protected flood RW._relabel already uses internally.
    const exterior = new Uint8Array(W*H);
    {
      const q = [];
      for (let x=0;x<W;x++){ q.push(x,(H-1)*W+x); }
      for (let y=0;y<H;y++){ q.push(y*W,y*W+W-1); }
      while (q.length){
        const i = q.pop();
        if (exterior[i] || wall[i]) continue;
        if (isProtectedRegion(i)) continue;
        exterior[i]=1;
        const x=i%W, y=(i/W)|0;
        if (x>0) q.push(i-1); if (x<W-1) q.push(i+1);
        if (y>0) q.push(i-W); if (y<H-1) q.push(i+W);
      }
    }

    // Reachability flood: from the region's own open pixels, step only into
    // wall/same-region pixels — exterior, other included regions, and tiny
    // specks are natural stopping barriers. Everything reached is "relevant"
    // wall; anything unreached is left alone.
    const reachableWall = new Uint8Array(W*H);
    const seenReach = new Uint8Array(W*H);
    const q2 = [];
    for (let i=0;i<W*H;i++) if (isSameRegion(i)){ seenReach[i]=1; q2.push(i); }
    while (q2.length){
      const i = q2.pop();
      const x=i%W, y=(i/W)|0;
      const neigh = [];
      if (x>0) neigh.push(i-1);
      if (x<W-1) neigh.push(i+1);
      if (y>0) neigh.push(i-W);
      if (y<H-1) neigh.push(i+W);
      for (const n of neigh){
        if (seenReach[n]) continue;
        if (annotationMask[n]) continue; // never enter an existing annotation's knockout
        if (wall[n]===1){ seenReach[n]=1; reachableWall[n]=1; q2.push(n); }
        else if (isSameRegion(n)){ seenReach[n]=1; q2.push(n); }
        // otherIncluded / exterior / tiny-speck-open: stop here, don't cross
      }
    }

    // Per-pixel safety test restricted to reachable wall: flags reachable
    // wall pixels whose immediate neighbor is exterior/protected/annotation
    // (the "unsafe shell"). On a thick barrier only the outer ~1px skin
    // triggers this — see failure mode 6 above.
    const unsafeShell = new Uint8Array(W*H);
    for (let i=0;i<W*H;i++){
      if (!reachableWall[i] || annotationMask[i]) continue;
      const x=i%W, y=(i/W)|0;
      let unsafe = false;
      if (x>0 && (exterior[i-1] || isProtectedRegion(i-1) || annotationMask[i-1])) unsafe=true;
      if (!unsafe && x<W-1 && (exterior[i+1] || isProtectedRegion(i+1) || annotationMask[i+1])) unsafe=true;
      if (!unsafe && y>0 && (exterior[i-W] || isProtectedRegion(i-W) || annotationMask[i-W])) unsafe=true;
      if (!unsafe && y<H-1 && (exterior[i+W] || isProtectedRegion(i+W) || annotationMask[i+W])) unsafe=true;
      if (unsafe) unsafeShell[i]=1;
    }

    // Widen the unsafe shell by RW._healBarrierMargin via bounded BFS through
    // reachable wall only — protects realistic barrier widths. One-sided
    // only (see header): expansion only reaches inward from the barrier's
    // outer face, so set the margin to the line's FULL thickness, not half.
    const margin = RW._healBarrierMargin != null ? RW._healBarrierMargin : Math.max(4, Math.round(12*(RW.W/2592)));
    const protectedExpanded = new Uint8Array(W*H);
    {
      let frontier = [];
      for (let i=0;i<W*H;i++) if (unsafeShell[i]){ protectedExpanded[i]=1; frontier.push(i); }
      for (let step=0; step<margin && frontier.length; step++){
        const next = [];
        for (const i of frontier){
          const x=i%W, y=(i/W)|0;
          const neigh = [];
          if (x>0) neigh.push(i-1);
          if (x<W-1) neigh.push(i+1);
          if (y>0) neigh.push(i-W);
          if (y<H-1) neigh.push(i+W);
          for (const n of neigh){
            if (protectedExpanded[n] || !reachableWall[n]) continue;
            protectedExpanded[n]=1;
            next.push(n);
          }
        }
        frontier = next;
      }
    }

    const noise = new Uint8Array(W*H);
    for (let i=0;i<W*H;i++){
      if (reachableWall[i] && !annotationMask[i] && !protectedExpanded[i]) noise[i]=1;
    }
    return noise;
  };

  RW._renderHealPreview = function(){
    const old = document.getElementById('rw-heal-overlay'); if (old) old.remove();
    if (!RW._healPreviewOn || !RW._healNoiseMask) return;
    const {W,H} = RW;
    const ov = document.createElement('canvas');
    ov.id = 'rw-heal-overlay';
    ov.width = W; ov.height = H;
    ov.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:47;opacity:0.75;image-rendering:pixelated;';
    const ctx = ov.getContext('2d');
    const img = ctx.createImageData(W,H);
    const mask = RW._healNoiseMask;
    for (let i=0;i<W*H;i++) if (mask[i]){ img.data[i*4]=255; img.data[i*4+1]=140; img.data[i*4+2]=0; img.data[i*4+3]=220; }
    ctx.putImageData(img,0,0);
    document.getElementById('pdf-container').appendChild(ov);
  };

  RW.toggleHealPreview = function(){
    if (!RW.selected.size){
      RW._healPreviewOn = false; RW._healNoiseMask = null; RW._renderHealPreview();
      RW._syncHealButtons();
      return;
    }
    RW._healPreviewOn = !RW._healPreviewOn;
    RW._healNoiseMask = RW._healPreviewOn ? RW._computeInteriorNoise(RW.selected) : null;
    RW._renderHealPreview();
    RW._syncHealButtons();
  };

  RW.applyHeal = function(){
    if (!RW._healNoiseMask) return;
    RW._snapshot('heal-interior');
    const {W,H,wall} = RW;
    let erased = 0;
    for (let i=0;i<W*H;i++) if (RW._healNoiseMask[i]){ wall[i]=0; erased++; }
    RW._healPreviewOn = false;
    RW._healNoiseMask = null;
    RW._renderHealPreview();
    RW._relabel();
    RW.renderList(); RW.renderOverlay();
    if (RW._renderCommitPreview) RW._renderCommitPreview();
    RW._syncHealButtons();
    console.log('[RW] healed ' + erased + ' interior-noise wall px');
  };

  RW._syncHealButtons = function(){
    const b = document.getElementById('rw-heal-btn');
    if (b) b.style.background = RW._healPreviewOn ? 'rgba(255,140,0,0.35)' : '';
    const ab = document.getElementById('rw-heal-apply-btn');
    if (ab) ab.style.display = (RW._healPreviewOn && RW._healNoiseMask) ? '' : 'none';
  };

  // keep the preview in sync if the selection changes while it's on
  const origToggleGroup = RW.toggleGroup;
  RW.toggleGroup = function(gid){
    origToggleGroup.call(RW, gid);
    if (RW._healPreviewOn){
      RW._healNoiseMask = RW.selected.size ? RW._computeInteriorNoise(RW.selected) : null;
      RW._renderHealPreview();
      RW._syncHealButtons();
    }
  };

  /* ---------- panel controls ---------- */
  const bar = (document.getElementById('rw-pick') || {}).parentNode;
  if (bar && !document.getElementById('rw-heal-btn')){
    // Wrapped in a span so rw_panelsections.js can relocate the whole Heal
    // cluster as one unit (same idiom as #rw-pipe-group/#rw-textdetect-group).
    const group = document.createElement('span');
    group.id = 'rw-heal-group';
    group.style.cssText = 'display:inline-flex;gap:4px;align-items:center;';

    const b = document.createElement('button');
    b.id = 'rw-heal-btn';
    b.title = 'Preview interior noise (text/hatch/dimension marks) inside the SELECTED region(s) that\'s safe to erase without merging with any other region. Pick a region first. Detection only until you Apply Heal.';
    b.style.cssText = 'font-size:11px;padding:2px 6px;';
    b.innerText = 'Heal Interior?';
    b.onclick = () => RW.toggleHealPreview();
    group.appendChild(b);

    const ab = document.createElement('button');
    ab.id = 'rw-heal-apply-btn';
    ab.title = 'Erase the highlighted interior noise from the selected region(s).';
    ab.style.cssText = 'font-size:11px;padding:2px 6px;display:none;background:rgba(255,140,0,0.25);';
    ab.innerText = 'Apply Heal';
    ab.onclick = () => RW.applyHeal();
    group.appendChild(ab);

    const label = document.createElement('span');
    label.innerText = 'hole≤'; label.style.cssText = 'font-size:10px;opacity:0.7;margin-left:4px;';
    group.appendChild(label);
    const holeInp = document.createElement('input');
    holeInp.id = 'rw-heal-hole';
    holeInp.type = 'number';
    holeInp.value = RW._healNoiseHoleMax != null ? RW._healNoiseHoleMax : Math.round(300*(RW.W/2592));
    holeInp.title = 'Max pixel size for a non-included area to still count as a negligible hole (safe to merge) rather than a real feature (protected). Separate from the area-floor input — that one is for candidate regions, this one is for "how big is too big to be noise."';
    holeInp.style.cssText = 'font-size:11px;padding:1px 4px;width:52px;text-align:right;';
    let holeDebounce = null;
    holeInp.oninput = function(){
      // debounced — _computeInteriorNoise is O(W×H)-ish (200ms-1.5s live),
      // so firing on every keystroke would feel laggy rather than "live."
      clearTimeout(holeDebounce);
      const v = parseInt(holeInp.value, 10);
      if (isNaN(v)) return;
      holeDebounce = setTimeout(function(){
        RW._healNoiseHoleMax = Math.max(0, v);
        if (RW._healPreviewOn && RW.selected.size){
          RW._healNoiseMask = RW._computeInteriorNoise(RW.selected);
          RW._renderHealPreview();
          RW._syncHealButtons();
        }
      }, 250);
    };
    group.appendChild(holeInp);

    const label3 = document.createElement('span');
    label3.innerText = 'barrier≥'; label3.style.cssText = 'font-size:10px;opacity:0.7;margin-left:4px;';
    group.appendChild(label3);
    const marginInp = document.createElement('input');
    marginInp.id = 'rw-heal-margin';
    marginInp.type = 'number';
    marginInp.value = RW._healBarrierMargin != null ? RW._healBarrierMargin : Math.max(4, Math.round(12*(RW.W/2592)));
    marginInp.title = 'Protection margin (mask px) around any real barrier — raise this if a thick boundary line is getting partially eaten through its middle. Set this to roughly the FULL pixel thickness of the line you see (not half) — protection only expands inward from the line\'s outer face, not from both sides at once.';
    marginInp.style.cssText = 'font-size:11px;padding:1px 4px;width:44px;text-align:right;';
    let marginDebounce = null;
    marginInp.oninput = function(){
      clearTimeout(marginDebounce);
      const v = parseInt(marginInp.value, 10);
      if (isNaN(v)) return;
      marginDebounce = setTimeout(function(){
        RW._healBarrierMargin = Math.max(0, v);
        if (RW._healPreviewOn && RW.selected.size){
          RW._healNoiseMask = RW._computeInteriorNoise(RW.selected);
          RW._renderHealPreview();
          RW._syncHealButtons();
        }
      }, 250);
    };
    group.appendChild(marginInp);

    bar.appendChild(group);
  }

  /* ---------- manual brush correction for the heal preview ---------- */
  // The topology-based detector can still be wrong in cases no threshold
  // fixes (e.g. an isolated solid symbol that never borders exterior/a
  // protected region within reach — confirmed live). Let the user paint
  // directly onto RW._healNoiseMask before Apply Heal, same interaction as
  // the Brush tool (rw_brushpoly.js). Requires a preview to already exist;
  // arms it automatically if a region is already selected.
  const ac = document.getElementById('annotation-canvas');
  RW.healBrushMode = false;
  RW.healBrushAction = 'add'; // 'add' — mark more as noise; 'remove' — protect/un-mark
  RW.healBrushR = Math.max(3, Math.round(6*(RW.W/2592)));
  let healBrushDown = false;

  RW._paintHealDisk = function(mx, my, r, val){
    if (!RW._healNoiseMask) return;
    const {W,H} = RW;
    const mask = RW._healNoiseMask;
    const x0=Math.max(0,Math.round(mx-r)), x1=Math.min(W-1,Math.round(mx+r));
    const y0=Math.max(0,Math.round(my-r)), y1=Math.min(H-1,Math.round(my+r));
    const r2=r*r;
    for (let y=y0;y<=y1;y++) for (let x=x0;x<=x1;x++){
      const dx=x-mx, dy=y-my;
      if (dx*dx+dy*dy<=r2) mask[y*W+x]=val;
    }
  };

  RW.setHealBrushMode = function(on){
    if (on){
      // cross-disarm the other mask tools, same pattern used throughout
      if (RW.maskMode){
        RW.maskMode=null; ac.style.cursor='';
        const rl=document.getElementById('rw-rectline'); if(rl) rl.remove();
        if (RW._syncRectBtn) RW._syncRectBtn();
      }
      if (RW.maskMode2) RW.setMaskMode2(null);
      if (!RW._healPreviewOn || !RW._healNoiseMask){
        if (!RW.selected.size){
          console.warn('[RW] Heal Brush: pick a region and preview Heal Interior first');
          return;
        }
        RW.toggleHealPreview();
        if (!RW._healNoiseMask) return;
      }
    }
    RW.healBrushMode = !!on;
    ac.style.cursor = RW.healBrushMode ? 'crosshair' : '';
    const btn = document.getElementById('rw-healbrush-btn');
    if (btn) btn.style.background = RW.healBrushMode ? 'rgba(255,140,0,0.4)' : '';
    if (!RW.healBrushMode){
      const cur = document.getElementById('rw-healbrush-cursor'); if (cur) cur.remove();
    }
  };

  RW._renderHealBrushCursor = function(cx, cy){
    const svg = RW._mkSvg('rw-healbrush-cursor', 73);
    const [nx,ny] = RW._toNorm(cx,cy);
    const [px,py] = RW._toPx(nx,ny);
    const pr = RW._toPx(RW.healBrushR/RW.W, 0)[0];
    const col = RW.healBrushAction==='add' ? '#ff8c00' : '#0af';
    svg.innerHTML = '<circle cx="'+px+'" cy="'+py+'" r="'+pr+'" fill="none" stroke="'+col+'" stroke-width="1.4" stroke-dasharray="6"/>';
  };

  ac.addEventListener('mousedown', function(e){
    if (!RW.healBrushMode) return;
    e.stopPropagation(); e.preventDefault();
    healBrushDown = true;
    RW.healBrushAction = e.shiftKey ? 'remove' : 'add';
    const [nx,ny] = RW._toNorm(e.clientX, e.clientY);
    RW._paintHealDisk(nx*RW.W, ny*RW.H, RW.healBrushR, RW.healBrushAction==='add'?1:0);
    RW._renderHealPreview();
  }, true);

  ac.addEventListener('mousemove', function(e){
    if (!RW.healBrushMode) return;
    e.stopPropagation();
    if (healBrushDown){
      const [nx,ny] = RW._toNorm(e.clientX, e.clientY);
      RW._paintHealDisk(nx*RW.W, ny*RW.H, RW.healBrushR, RW.healBrushAction==='add'?1:0);
      RW._renderHealPreview();
    }
    RW._renderHealBrushCursor(e.clientX, e.clientY);
  }, true);

  ac.addEventListener('mouseup', function(e){
    if (!RW.healBrushMode) return;
    e.stopPropagation(); e.preventDefault();
    healBrushDown = false;
  }, true);

  ac.addEventListener('wheel', function(e){
    if (!RW.healBrushMode || !RW.__tabHeld) return;
    e.stopPropagation(); e.preventDefault();
    RW.healBrushR = Math.max(2, Math.min(60, RW.healBrushR + (e.deltaY<0?1:-1)));
    RW._renderHealBrushCursor(e.clientX, e.clientY);
  }, {capture:true, passive:false});

  // RW.__tabHeld is shared, but rw_brushpoly.js's Tab handler only sets it
  // when RW.maskMode2==='brush' — extend the same keydown/keyup pair to also
  // fire for RW.healBrushMode (cross-disarm guarantees only one tool is
  // active at a time, so sharing the flag is safe).
  window.addEventListener('keydown', function(e){
    if (e.key==='Tab' && RW.healBrushMode){
      RW.__tabHeld = true;
      e.preventDefault(); e.stopImmediatePropagation();
    }
  }, true);
  window.addEventListener('keyup', function(e){
    if (e.key==='Tab') RW.__tabHeld = false;
  }, true);

  window.addEventListener('keydown', function(e){
    const t = e.target;
    if (t && (t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable)) return;
    if (e.key==='Escape' && RW.healBrushMode){
      e.preventDefault(); e.stopImmediatePropagation();
      RW.setHealBrushMode(false);
    }
  }, true);

  // Reactive cross-disarm: wrap the shared arm functions Rect/Poly2/Brush
  // already call, so both keyboard and panel-button arming disarm this tool.
  if (RW._syncRectBtn){
    const origSyncRectBtn = RW._syncRectBtn;
    RW._syncRectBtn = function(){
      origSyncRectBtn.apply(RW, arguments);
      if (RW.maskMode==='rect' && RW.healBrushMode) RW.setHealBrushMode(false);
    };
  }
  if (RW.setMaskMode2){
    const origSetMaskMode2 = RW.setMaskMode2;
    RW.setMaskMode2 = function(mode){
      origSetMaskMode2.call(RW, mode);
      if (mode && RW.healBrushMode) RW.setHealBrushMode(false);
    };
  }
  if (bar && !document.getElementById('rw-healbrush-btn')){
    const hb = document.createElement('button');
    hb.id = 'rw-healbrush-btn';
    hb.title = 'Manually correct the Heal preview: drag to mark more area as noise (safe to erase), Shift+drag to protect/un-mark an area (e.g. a real symbol the detector got wrong). Tab+scroll resizes the brush.';
    hb.style.cssText = 'font-size:11px;padding:2px 6px;';
    hb.innerText = 'Edit Heal (Brush)';
    hb.onclick = () => RW.setHealBrushMode(!RW.healBrushMode);
    bar.appendChild(hb);
  }

  return 'v3 up: Heal Interior? preview + Apply Heal + Edit Heal (Brush) manual correction';
})()

;
// ===== rw_snap.js =====
// RW v2.7 — vertex snapping for the Poly2 tool.
// Load AFTER rw_brushpoly.js (needs v2.6). Snaps Poly2 vertices (mousedown)
// and the live preview point (mousemove) to nearby line endpoints/
// intersections on the wall bitmap, or to any included region's outline.
//
// Pipeline (rebuilt lazily — only when RW._snapDirty, on the next snap query):
//   1. Density-prefilter RW.wall (RW._buildThinMask, integral image): a wall
//      pixel whose local window is mostly wall gets excluded before
//      skeletonizing. Load-bearing, not an optimization nicety — hatch fill
//      can mark 30%+ of a drawing as "wall", which hangs the tab if
//      skeletonized directly and has no real line endpoints/junctions anyway.
//   2. Skeletonize (Zhang-Suen thinning, active-list only — cost scales with
//      surviving-pixel count, not full W×H).
//   3. Classify by 8-neighbor count: 1 = endpoint, 3+ = junction, 2 = not a
//      candidate.
//   4. Cluster nearby candidates into one point per real junction (junction
//      wins over endpoint in a mixed cluster).
//   5. RW._buildEdgePoints adds every included region's boundary pixel as its
//      own unclustered 'edge' candidate (lets a vertex slide anywhere along an
//      outline, not just corners), via one O(W×H) pass over RW.labels — NOT
//      via RW._rawContour (rw_install.js), which re-scans the whole image per
//      call and would be O(W×H × region count) here.
//   6. Index all points in a bucket grid; catch radius (RW._snapCatchPx) is
//      recomputed per-query to stay ~14 screen px regardless of zoom.
(function(){
  const RW = window.__RW;
  if (!RW || !RW.v26) return 'need v2.6 first';
  if (RW.v27) return 'v2.7 already installed';
  RW.v27 = true;

  RW._snapEnabled = true;
  RW._snapDirty = true;
  RW._snapPoints = [];
  RW._lastSnapHit = null;

  /* ---------- 1. density prefilter (integral image) ---------- */
  // Window radius/density threshold deciding "thin line" vs "fill/hatch".
  // Scaled like _areaFloor (2592-px baseline).
  RW._snapFillRadiusPx = function(){
    return Math.max(4, Math.round(10 * (RW.W/2592)));
  };
  RW._snapFillDensityThresh = 0.55;

  RW._buildThinMask = function(){
    const {W,H,wall} = RW;
    // Summed-area table, padded with a zero row/col so edge queries need no special-casing.
    const integ = new Float64Array((W+1)*(H+1));
    for (let y=0;y<H;y++){
      let rowSum=0;
      const rowBase=(y+1)*(W+1), prevBase=y*(W+1);
      for (let x=0;x<W;x++){
        rowSum += wall[y*W+x];
        integ[rowBase+x+1] = integ[prevBase+x+1] + rowSum;
      }
    }
    function S(x,y){ return integ[(y+1)*(W+1)+(x+1)]; }
    function windowSum(x0,y0,x1,y1){
      x0=Math.max(0,x0); y0=Math.max(0,y0); x1=Math.min(W-1,x1); y1=Math.min(H-1,y1);
      return S(x1,y1) - S(x0-1,y1) - S(x1,y0-1) + S(x0-1,y0-1);
    }
    const r = RW._snapFillRadiusPx();
    const winArea = (2*r+1)*(2*r+1);
    const capacity = winArea * RW._snapFillDensityThresh;
    const thin = new Uint8Array(W*H);
    for (let y=0;y<H;y++) for (let x=0;x<W;x++){
      const i=y*W+x;
      if (!wall[i]) continue;
      if (windowSum(x-r,y-r,x+r,y+r) <= capacity) thin[i]=1;
    }
    return thin;
  };

  /* ---------- 2. skeletonize (Zhang-Suen, active-list optimized) ---------- */
  // seed: the already density-filtered mask — hatched pixels are absent, so invisible here.
  RW._skeletonize = function(seed){
    const {W,H} = RW;
    const skel = new Uint8Array(seed);
    let active = [];
    for (let i=0;i<W*H;i++) if (skel[i]) active.push(i);

    // 8-neighbors clockwise from north (P2..P9, Zhang-Suen paper). Border
    // pixels are skipped (never deleted/classified), avoiding bounds-wrapping.
    // Kept as plain locals, not a per-pixel allocation — this runs over the
    // active list up to ~120 times; allocating per-pixel here would be the
    // difference between sub-second and tens of seconds.
    let changed = true, iter = 0;
    while (changed && iter < 60){
      changed = false; iter++;
      const del1 = [];
      for (const i of active){
        if (!skel[i]) continue;
        const x=i%W, y=(i/W)|0;
        if (x===0||x===W-1||y===0||y===H-1) continue;
        const n0=skel[i-W], n1=skel[i-W+1], n2=skel[i+1], n3=skel[i+W+1],
              n4=skel[i+W], n5=skel[i+W-1], n6=skel[i-1], n7=skel[i-W-1];
        const B = n0+n1+n2+n3+n4+n5+n6+n7;
        if (B<2||B>6) continue;
        let A=0;
        if (n0===0&&n1===1)A++; if(n1===0&&n2===1)A++; if(n2===0&&n3===1)A++; if(n3===0&&n4===1)A++;
        if (n4===0&&n5===1)A++; if(n5===0&&n6===1)A++; if(n6===0&&n7===1)A++; if(n7===0&&n0===1)A++;
        if (A!==1) continue;
        if (n0*n2*n4!==0) continue; // P2*P4*P6
        if (n2*n4*n6!==0) continue; // P4*P6*P8
        del1.push(i);
      }
      if (del1.length){ for (const i of del1) skel[i]=0; changed=true; }

      const del2 = [];
      for (const i of active){
        if (!skel[i]) continue;
        const x=i%W, y=(i/W)|0;
        if (x===0||x===W-1||y===0||y===H-1) continue;
        const n0=skel[i-W], n1=skel[i-W+1], n2=skel[i+1], n3=skel[i+W+1],
              n4=skel[i+W], n5=skel[i+W-1], n6=skel[i-1], n7=skel[i-W-1];
        const B = n0+n1+n2+n3+n4+n5+n6+n7;
        if (B<2||B>6) continue;
        let A=0;
        if (n0===0&&n1===1)A++; if(n1===0&&n2===1)A++; if(n2===0&&n3===1)A++; if(n3===0&&n4===1)A++;
        if (n4===0&&n5===1)A++; if(n5===0&&n6===1)A++; if(n6===0&&n7===1)A++; if(n7===0&&n0===1)A++;
        if (A!==1) continue;
        if (n0*n2*n6!==0) continue; // P2*P4*P8
        if (n0*n4*n6!==0) continue; // P2*P6*P8
        del2.push(i);
      }
      if (del2.length){ for (const i of del2) skel[i]=0; changed=true; }

      if (changed) active = active.filter(i=>skel[i]);
    }
    return {skel, pts: active};
  };

  /* ---------- 3. classify skeleton points ---------- */
  RW._classifySkeleton = function(skel, pts){
    const {W,H} = RW;
    const candidates = [];
    for (const i of pts){
      const x=i%W, y=(i/W)|0;
      if (x===0||x===W-1||y===0||y===H-1) continue;
      const c = skel[i-W]+skel[i-W+1]+skel[i+1]+skel[i+W+1]
              + skel[i+W]+skel[i+W-1]+skel[i-1]+skel[i-W-1];
      if (c===1) candidates.push({x,y,kind:'endpoint'});
      else if (c>=3) candidates.push({x,y,kind:'junction'});
    }
    return candidates;
  };

  /* ---------- 4. cluster nearby candidates ---------- */
  // A cluster is bucketed by its FIRST point's position; later merges can
  // drift its centroid without re-bucketing. Harmless at these small merge radii.
  RW._clusterPoints = function(candidates, mergeR){
    const buckets = new Map();
    const clusters = [];
    for (const p of candidates){
      const bx=(p.x/mergeR)|0, by=(p.y/mergeR)|0;
      let found = null;
      outer:
      for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++){
        const arr = buckets.get((bx+dx)+'_'+(by+dy));
        if (!arr) continue;
        for (const c of arr){
          const ddx=c.x-p.x, ddy=c.y-p.y;
          if (ddx*ddx+ddy*ddy <= mergeR*mergeR){ found=c; break outer; }
        }
      }
      if (found){
        found.sx+=p.x; found.sy+=p.y; found.n++;
        found.x = found.sx/found.n; found.y = found.sy/found.n;
        if (p.kind==='junction') found.kind='junction'; // junction beats endpoint
      } else {
        const c = {x:p.x,y:p.y,sx:p.x,sy:p.y,n:1,kind:p.kind};
        clusters.push(c);
        const k = ((c.x/mergeR)|0)+'_'+((c.y/mergeR)|0);
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push(c);
      }
    }
    return clusters;
  };

  /* ---------- 5. region-outline edge points (single-pass, unclustered) ---------- */
  // Each boundary pixel is its own candidate (not merged like junctions),
  // so a vertex can land anywhere along the outline, not just at corners.
  RW._buildEdgePoints = function(){
    const {W,H,labels,regions} = RW;
    const edgePts = [];
    function group(x,y){
      const l = labels[y*W+x];
      return (l>=0 && regions[l] && regions[l].included) ? regions[l].group : null;
    }
    for (let y=0;y<H;y++){
      for (let x=0;x<W;x++){
        const g = group(x,y);
        if (g===null) continue;
        const isBoundary =
          (x===0   || group(x-1,y)!==g) ||
          (x===W-1 || group(x+1,y)!==g) ||
          (y===0   || group(x,y-1)!==g) ||
          (y===H-1 || group(x,y+1)!==g);
        if (isBoundary) edgePts.push({x,y,kind:'edge'});
      }
    }
    return edgePts;
  };

  /* ---------- 6. spatial index + zoom-invariant catch radius ---------- */
  RW._snapMergeRadiusPx = function(){
    return Math.max(3, Math.round(6 * (RW.W/2592))); // same 2592-baseline scaling as _areaFloor
  };
  RW._snapCellPx = function(){
    return Math.max(4, Math.round(RW.W/200));
  };
  RW._snapCatchPx = function(){
    // ~14 screen px catch radius regardless of zoom
    const cr = document.getElementById('pdf-container').getBoundingClientRect();
    return (14 / cr.width) * RW.W;
  };

  RW._buildSnapIndex = function(){
    const cell = RW._snapCellPx();
    RW._snapCell = cell;
    const grid = new Map();
    for (const p of RW._snapPoints){
      const k = ((p.x/cell)|0)+'_'+((p.y/cell)|0);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(p);
    }
    RW._snapGrid = grid;
  };

  RW._nearestSnapPoint = function(mx, my){
    const grid = RW._snapGrid; if (!grid) return null;
    const cell = RW._snapCell;
    const rad = RW._snapCatchPx();
    const bx=(mx/cell)|0, by=(my/cell)|0;
    const c = Math.max(1, Math.ceil(rad/cell));
    let best=null, bestD=rad*rad;
    for (let dy=-c;dy<=c;dy++) for (let dx=-c;dx<=c;dx++){
      const arr = grid.get((bx+dx)+'_'+(by+dy));
      if (!arr) continue;
      for (const p of arr){
        const ddx=p.x-mx, ddy=p.y-my;
        const d=ddx*ddx+ddy*ddy;
        if (d<bestD){ bestD=d; best=p; }
      }
    }
    return best;
  };

  RW._buildSnapPoints = function(){
    if (!RW.wall || !RW.W || !RW.H){ RW._snapPoints=[]; RW._skeletonCandidates=[]; RW._snapDirty=false; return; }
    const thin = RW._buildThinMask();
    const {skel, pts} = RW._skeletonize(thin);
    const candidates = RW._classifySkeleton(skel, pts);
    // Cached raw (unclustered) so density-based detectors (rw_textdetect.js) can
    // read local point density — _clusterPoints below deliberately erases it.
    RW._skeletonCandidates = candidates;
    const clustered = RW._clusterPoints(candidates, RW._snapMergeRadiusPx());
    const edgePts = (RW.labels && RW.regions) ? RW._buildEdgePoints() : [];
    RW._snapPoints = clustered.concat(edgePts);
    RW._buildSnapIndex();
    RW._snapDirty = false;
  };

  // nx,ny normalized page coords. Returns [nx,ny], snapped if enabled and a hit was found.
  RW._trySnap = function(nx, ny){
    if (!RW._snapEnabled){ RW._lastSnapHit=null; return [nx, ny]; }
    if (RW._snapDirty) RW._buildSnapPoints();
    if (!RW._snapPoints || !RW._snapPoints.length){ RW._lastSnapHit=null; return [nx, ny]; }
    const mx = nx*RW.W, my = ny*RW.H;
    const hit = RW._nearestSnapPoint(mx, my);
    RW._lastSnapHit = hit || null;
    if (!hit) return [nx, ny];
    return [hit.x/RW.W, hit.y/RW.H];
  };

  /* ---------- invalidate on any wall-bitmap change ---------- */
  const origRelabel = RW._relabel;
  RW._relabel = function(){ const r = origRelabel.apply(RW, arguments); RW._snapDirty = true; return r; };
  const origExtract = RW.extract;
  RW.extract = function(){ const r = origExtract.apply(RW, arguments); RW._snapDirty = true; return r; };

  /* ---------- snap-hit marker on the poly2 preview ---------- */
  (function(){
    const orig = RW._renderPreview;
    RW._renderPreview = function(cursorClient){
      const ret = orig.call(RW, cursorClient);
      if (RW.maskMode2==='poly2' && RW._lastSnapHit){
        const svg = document.getElementById('rw-polyline');
        if (svg){
          const [px,py] = RW._toPx(RW._lastSnapHit.x/RW.W, RW._lastSnapHit.y/RW.H);
          const ring = document.createElementNS('http://www.w3.org/2000/svg','circle');
          ring.setAttribute('cx', px); ring.setAttribute('cy', py); ring.setAttribute('r', 6);
          ring.setAttribute('fill','none');
          ring.setAttribute('stroke', RW._lastSnapHit.kind==='junction' ? '#0f0' : RW._lastSnapHit.kind==='endpoint' ? '#0ff' : '#ff0');
          ring.setAttribute('stroke-width','2');
          svg.appendChild(ring);
        }
      }
      return ret;
    };
  })();

  /* ---------- panel toggle ---------- */
  const bar = (document.getElementById('rw-pick') || {}).parentNode;
  if (bar && !document.getElementById('rw-snap')){
    const sb = document.createElement('button');
    sb.id = 'rw-snap';
    sb.title = 'Snap Poly2 vertices to nearby line endpoints/intersections (green/cyan) or along any included region\'s outline (yellow). Hold Shift while clicking to place a vertex without snapping.';
    sb.style.cssText = 'font-size:11px;padding:2px 6px;';
    function sync(){
      sb.innerText = 'Snap ' + (RW._snapEnabled ? 'On' : 'Off');
      sb.style.background = RW._snapEnabled ? 'rgba(50,205,50,0.3)' : '';
    }
    sb.onclick = ()=>{ RW._snapEnabled = !RW._snapEnabled; sync(); };
    bar.appendChild(sb);
    sync();
  }

  return 'v2.7 up: Poly2 vertex snapping (endpoints/intersections + region outlines). Shift bypasses.';
})()

;
// ===== rw_textdetect.js =====
// RW v2.9 — text/dimension density overlay (DETECTION ONLY — no mask edits).
// Load AFTER rw_snap.js (needs v27, reuses its skeleton-candidate data).
// Flags areas where skeleton endpoint/junction candidates cluster densely —
// text glyphs are small, stroke-heavy shapes, so they produce far more
// candidates per unit area than real linework. Never touches
// RW.wall/RW.labels/RW.regions — visualization only.
(function(){
  const RW = window.__RW;
  if (!RW || !RW.v27) return 'need v2.7 (rw_snap.js) first';
  if (RW.v29) return 'v2.9 already installed';
  RW.v29 = true;

  RW._textCellPx = Math.max(6, Math.round(16 * (RW.W/2592)));
  RW._textMinPerCell = 4;
  RW._textDirty = true;
  RW._textCandidates = [];

  // Annotation interiors skeletonize into dense branch-point tangles that
  // mimic text — rebuilt here (not read off RW.wall, which already merged
  // this mask with linework) so those pixels can be excluded from the scan.
  RW._buildAnnotationMask = function(){
    const {W,H} = RW;
    const cv = document.createElement('canvas'); cv.width=W; cv.height=H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#000';
    for (const a of (typeof annotationState!=='undefined' ? annotationState.annotations : [])){
      if (a._hidden || a.is_void) continue;
      // Array.isArray guard: a bbox-type annotation stores {x,y,width,height},
      // not a point array — pts.forEach would throw (same bug as rw_healinterior.js).
      const pts = a.coordinates; if (!Array.isArray(pts) || pts.length<3) continue;
      ctx.beginPath();
      pts.forEach((p,i)=>{ const X=p.x*W, Y=p.y*H; i?ctx.lineTo(X,Y):ctx.moveTo(X,Y); });
      ctx.closePath(); ctx.fill();
    }
    const data = ctx.getImageData(0,0,W,H).data;
    const mask = new Uint8Array(W*H);
    for (let i=0;i<W*H;i++) if (data[i*4+3]>127) mask[i]=1;
    return mask;
  };

  /* ---------- grid-bucket candidate density, then connect hot cells ---------- */
  RW._buildTextCandidates = function(){
    if (RW._snapDirty) RW._buildSnapPoints(); // ensures RW._skeletonCandidates is fresh
    const annMask = RW._buildAnnotationMask();
    const pts = (RW._skeletonCandidates || []).filter(p => !annMask[p.y*RW.W + p.x]);
    const cell = RW._textCellPx;
    const minPerCell = RW._textMinPerCell;
    if (!pts.length){ RW._textCandidates = []; RW._textDirty = false; return; }

    const counts = new Map();       // 'cx_cy' -> count
    const cellPts = new Map();      // 'cx_cy' -> [{x,y},...]
    for (const p of pts){
      const cx=(p.x/cell)|0, cy=(p.y/cell)|0;
      const k = cx+'_'+cy;
      counts.set(k, (counts.get(k)||0)+1);
      if (!cellPts.has(k)) cellPts.set(k, []);
      cellPts.get(k).push(p);
    }

    const hot = new Set();
    for (const [k,c] of counts) if (c >= minPerCell) hot.add(k);

    // connect adjacent hot cells (4-connected) — same flood-fill pattern as
    // RW.extract's component labeling, over a density grid.
    const visited = new Set();
    const candidates = [];
    for (const k of hot){
      if (visited.has(k)) continue;
      const stack = [k];
      visited.add(k);
      const group = [];
      while (stack.length){
        const cur = stack.pop();
        group.push(cur);
        const [cx,cy] = cur.split('_').map(Number);
        for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
          const nk = (cx+dx)+'_'+(cy+dy);
          if (hot.has(nk) && !visited.has(nk)){ visited.add(nk); stack.push(nk); }
        }
      }
      let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity,total=0;
      for (const k2 of group){
        for (const p of cellPts.get(k2)){
          if (p.x<x0) x0=p.x; if (p.x>x1) x1=p.x;
          if (p.y<y0) y0=p.y; if (p.y>y1) y1=p.y;
          total++;
        }
      }
      candidates.push({x0,y0,x1,y1,count:total,cells:group.length});
    }
    RW._textCandidates = candidates;
    RW._textDirty = false;
  };

  /* ---------- overlay rendering (visualization only) ---------- */
  RW.textOverlayOn = false;
  RW.toggleTextOverlay = function(){
    RW.textOverlayOn = !RW.textOverlayOn;
    RW._renderTextOverlay();
    const btn = document.getElementById('rw-textdetect');
    if (btn) btn.style.background = RW.textOverlayOn ? 'rgba(200,80,220,0.35)' : '';
  };
  RW._renderTextOverlay = function(){
    const old = document.getElementById('rw-text-overlay'); if (old) old.remove();
    if (!RW.textOverlayOn) return;
    if (RW._textDirty) RW._buildTextCandidates();
    const svg = RW._mkSvg('rw-text-overlay', 46);
    let inner = '';
    for (const c of RW._textCandidates){
      const [ax,ay] = RW._toPx(c.x0/RW.W, c.y0/RW.H);
      const [bx,by] = RW._toPx((c.x1+1)/RW.W, (c.y1+1)/RW.H);
      inner += '<rect x="'+ax+'" y="'+ay+'" width="'+(bx-ax)+'" height="'+(by-ay)
        +'" fill="rgba(200,80,220,0.22)" stroke="#c850dc" stroke-width="1.5"/>';
    }
    svg.innerHTML = inner;
    const status = document.getElementById('rw-textdetect-count');
    if (status) status.innerText = RW._textCandidates.length + ' candidates';
  };

  // piggyback on RW._snapDirty (already wired to RW._relabel/RW.extract)
  // instead of adding a second wrapper layer.
  RW._textDirty = true;
  const origBuildSnapPoints = RW._buildSnapPoints;
  RW._buildSnapPoints = function(){ origBuildSnapPoints.apply(RW, arguments); RW._textDirty = true; };

  /* ---------- panel controls ---------- */
  const bar = (document.getElementById('rw-pick') || {}).parentNode;
  if (bar && !document.getElementById('rw-textdetect')){
    // wrapper lets the whole cluster be hidden as one unit (see below).
    const group = document.createElement('span');
    group.id = 'rw-textdetect-group';

    const b = document.createElement('button');
    b.id = 'rw-textdetect';
    b.title = 'Prototype: highlight areas where skeleton points cluster densely (likely text/dimensions). Detection only — nothing is edited.';
    b.style.cssText = 'font-size:11px;padding:2px 6px;';
    b.innerText = 'Text? (density)';
    b.onclick = () => RW.toggleTextOverlay();
    group.appendChild(b);

    const label1 = document.createElement('span');
    label1.innerText = 'cell'; label1.style.cssText = 'font-size:10px;opacity:0.7;margin-left:4px;';
    group.appendChild(label1);
    const cellInp = document.createElement('input');
    cellInp.type = 'number'; cellInp.value = RW._textCellPx;
    cellInp.title = 'Density grid cell size (mask px). Roughly a character height.';
    cellInp.style.cssText = 'font-size:11px;padding:1px 4px;width:44px;text-align:right;';
    cellInp.onchange = function(){
      const v = parseInt(this.value, 10);
      RW._textCellPx = isNaN(v) ? RW._textCellPx : Math.max(2, v);
      RW._textDirty = true;
      RW._renderTextOverlay();
    };
    group.appendChild(cellInp);

    const label2 = document.createElement('span');
    label2.innerText = 'min'; label2.style.cssText = 'font-size:10px;opacity:0.7;margin-left:4px;';
    group.appendChild(label2);
    const minInp = document.createElement('input');
    minInp.type = 'number'; minInp.value = RW._textMinPerCell;
    minInp.title = 'Minimum candidate points per cell to flag as text-like.';
    minInp.style.cssText = 'font-size:11px;padding:1px 4px;width:36px;text-align:right;';
    minInp.onchange = function(){
      const v = parseInt(this.value, 10);
      RW._textMinPerCell = isNaN(v) ? RW._textMinPerCell : Math.max(1, v);
      RW._textDirty = true;
      RW._renderTextOverlay();
    };
    group.appendChild(minInp);

    const status = document.createElement('span');
    status.id = 'rw-textdetect-count';
    status.style.cssText = 'font-size:10px;opacity:0.7;margin-left:4px;';
    group.appendChild(status);

    bar.appendChild(group);
  }

  /* ---------- hide clutter (per user request): hide, don't remove — same
     convention as rw_brushpoly.js's legacy 'poly' button. Done here since
     Relabel/Add live in earlier-loaded files. ---------- */
  ['rw-relabel-btn', 'rw-addmode', 'rw-textdetect-group'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  return 'v2.9 up: text-density overlay (detection only, no edits) — "Text? (density)" panel button';
})()

;
// ===== rw_wallspan.js =====
// RW v3.1 — Pipe annotation: a fixed-width path, not a traced pixel blob.
//
// An earlier version traced actual drawn pixels (flood-fill through RW.wall,
// bounded by auto-detected fittings) — abandoned because piping-centerline
// drawings are visually interrupted by text labels, leader lines, and gaps,
// which broke the real pixel linework in ways no tuning could fix (full
// history in CLAUDE.md). This version reads RW.wall only indirectly, via the
// Poly2 vertex-snap index for point precision — never to decide the pipe's
// path/width. Click along the centerline (multiple points for bends), drag
// once to measure a fixed width off the drawing, and it builds a constant-
// width ribbon: crossing a text label or fitting symbol never changes
// direction/width, since nothing depends on what's actually drawn in between.
//
// Load LAST (after rw_textdetect.js, needs v2.9) — position kept for
// build_loader.sh stability, no longer a real dependency.
//
// Elbow fittings moved out to their own tool (rw_elbow.js, v3.2, press L) —
// this file no longer reads any pixels at all. See CLAUDE.md for the
// in-pipe predecessor this replaced and the bug it hit.
(function(){
  const RW = window.__RW;
  if (!RW || !RW.v29) return 'need v2.9 (rw_textdetect.js) first';
  if (RW.v31) return 'v3.1 already installed';
  RW.v31 = true;

  const ac = document.getElementById('annotation-canvas');

  /* ---------- state ---------- */
  RW.pipeMode      = false;
  RW._pipePts      = [];     // confirmed path points, normalized [nx,ny] page-space
  RW._pipeFinished = false;  // true once double-click has closed off the path
  RW._pipeWidth    = Math.max(3, Math.round(6 * (RW.W/2592))); // mask px, 2592-baseline like other stroke widths in this codebase
  let downPos = null;         // client {x,y} at mousedown, for click-vs-drag
  let dragging = false;       // true once movement has exceeded the click threshold
  let dragCurClient = null;   // live end point of an in-progress width-measure drag

  // RW._pipeWidth is a plain float — a drag distance under 1 mask-px is
  // real and legitimate (e.g. a thin line at a zoomed-out view), never
  // rounded in the actual geometry. Every DISPLAY of it must show that same
  // precision instead of Math.round()'ing it to 0/1, which looked like the
  // measurement had failed (confirmed live: a sub-1px drag showed "0" or "1"
  // in the panel despite the real value being used correctly underneath).
  RW._fmtWidth = function(v){
    return (Math.round(v*100)/100).toString();
  };

  /* ---------- geometry: path + width -> closed ribbon polygon ---------- */
  // ptsN: [nx,ny] normalized points, widthPx: mask-px width. Returns {x,y}
  // normalized points (same shape RW._maskToPolygon produces) or null if the
  // path can't form a ribbon.
  //
  // Standard "stroke to filled ribbon": walk one rail forward, the other
  // rail backward, close into one loop. Interior vertices use a scaled-
  // average-perpendicular miter join, falling back to a true bevel (two
  // separate points, one per segment's own perpendicular) past MITER_LIMIT —
  // same concept SVG/canvas stroke rendering uses. This bevel fallback is a
  // real bug fix: an earlier version clamped the miter's MAGNITUDE instead
  // of switching to a bevel, which doesn't bound the resulting SHAPE — an
  // acute bend still flared into a wide triangle (confirmed live). A true
  // bevel point sits exactly `half` from the vertex along its own segment's
  // perpendicular, incapable of that flare.
  const MITER_LIMIT = 4;
  function analyticPipeRibbon(ptsN, widthPx){
    const {W,H} = RW;
    const pts = ptsN.map(([nx,ny]) => [nx*W, ny*H]);
    // drop consecutive duplicate points (e.g. a double-click's extra vertex
    // landing on the same spot as the click just before it)
    const clean = [pts[0]];
    for (let i=1;i<pts.length;i++){
      const [px,py] = clean[clean.length-1], [x,y] = pts[i];
      if (Math.hypot(x-px, y-py) > 1e-6) clean.push(pts[i]);
    }
    if (clean.length < 2) return null;
    const n = clean.length;
    const half = widthPx/2;

    // per-segment unit perpendiculars (rotate the segment direction 90°)
    const perp = [];
    for (let i=0;i<n-1;i++){
      const [x1,y1] = clean[i], [x2,y2] = clean[i+1];
      const dx=x2-x1, dy=y2-y1, len=Math.hypot(dx,dy) || 1e-6;
      perp.push([-dy/len, dx/len]);
    }

    // flat, incrementally-pushed rails (not one point per vertex) — an
    // interior vertex contributes one point (miter) or two (bevel fallback).
    const left = [], right = [];
    left.push([clean[0][0]+perp[0][0]*half, clean[0][1]+perp[0][1]*half]);
    right.push([clean[0][0]-perp[0][0]*half, clean[0][1]-perp[0][1]*half]);

    for (let i=1;i<n-1;i++){
      const p1 = perp[i-1], p2 = perp[i];
      const [vx,vy] = clean[i];
      let ax = p1[0]+p2[0], ay = p1[1]+p2[1];
      const alen = Math.hypot(ax,ay);
      let bevel = alen < 1e-6; // ~180° reversal — degenerate miter direction, always bevel
      let mx=0, my=0;
      if (!bevel){
        ax/=alen; ay/=alen;
        const dot = ax*p2[0] + ay*p2[1];
        const scale = Math.abs(dot) > 1e-6 ? 1/dot : Infinity;
        if (Math.abs(scale) > MITER_LIMIT) bevel = true;
        else { mx = ax*scale; my = ay*scale; }
      }
      if (bevel){
        left.push([vx+p1[0]*half, vy+p1[1]*half], [vx+p2[0]*half, vy+p2[1]*half]);
        right.push([vx-p1[0]*half, vy-p1[1]*half], [vx-p2[0]*half, vy-p2[1]*half]);
      } else {
        left.push([vx+mx*half, vy+my*half]);
        right.push([vx-mx*half, vy-my*half]);
      }
    }

    left.push([clean[n-1][0]+perp[n-2][0]*half, clean[n-1][1]+perp[n-2][1]*half]);
    right.push([clean[n-1][0]-perp[n-2][0]*half, clean[n-1][1]-perp[n-2][1]*half]);

    const loop = left.concat(right.reverse());
    return loop.map(([x,y]) => ({x:+(x/W).toFixed(6), y:+(y/H).toFixed(6)}));
  }

  RW._pipeRibbon = function(ptsN, widthPx){
    if (!ptsN || ptsN.length < 2 || !(widthPx > 0)) return null;
    // dedup in mask-px terms (matching analyticPipeRibbon's own internal
    // threshold exactly) — NOT normalized-coordinate distance, which would
    // be off by a factor of RW.W/RW.H and make this far less aggressive
    // than intended.
    const {W,H} = RW;
    const clean = [ptsN[0]];
    for (let i=1;i<ptsN.length;i++){
      const [px,py] = clean[clean.length-1], [x,y] = ptsN[i];
      if (Math.hypot((x-px)*W, (y-py)*H) > 1e-6) clean.push(ptsN[i]);
    }
    if (clean.length < 2) return null;
    return analyticPipeRibbon(clean, widthPx);
  };

  /* ---------- dimension line: tried and reverted ----------
     A first version staged a SECOND small annotation (a tick straddling the
     path's start, width in its own notes) alongside the ribbon. Live testing
     showed it read as a random unlabeled shape, not a measurement — no
     visible number on the canvas, and it sat wherever the path happened to
     start rather than where the user was looking. Reverted: the width is now
     recorded directly in the ribbon's own notes (RW.commitPipe below). If a
     real dimension-line indicator is wanted again, it needs an actual
     visible number on the drawing — check the app's annotation model
     supports text rendering first (full account: CLAUDE.md). */

  /* ---------- sanity check before commit ---------- */
  // Trivial compared to the pixel-tracing version — there's no pixel blob
  // for a leaked-area/containment check to apply to; a valid path + a
  // positive width is definitionally a sane ribbon.
  RW._pipeSanityCheck = function(ptsN, widthPx){
    if (!ptsN || ptsN.length < 2) return 'need at least a start and finish point';
    if (!(widthPx > 0)) return 'width must be greater than 0 — drag across the pipe to measure it';
    return null;
  };

  /* ---------- click / drag / finish state machine ---------- */
  ac.addEventListener('mousedown', function(e){
    if (!RW.pipeMode) return;
    e.stopPropagation(); e.preventDefault();
    downPos = {x:e.clientX, y:e.clientY};
    dragging = false;
    dragCurClient = null;
  }, true);

  ac.addEventListener('mousemove', function(e){
    if (!RW.pipeMode) return;
    e.stopPropagation();
    if (downPos && !RW._pipeFinished){
      const d = Math.hypot(e.clientX-downPos.x, e.clientY-downPos.y);
      if (d > 5){
        dragging = true;
        dragCurClient = {x:e.clientX, y:e.clientY};
        RW._renderPipePreview(e.clientX, e.clientY);
        return;
      }
    }
    RW._renderPipePreview(e.clientX, e.clientY);
  }, true);

  ac.addEventListener('mouseup', function(e){
    if (!RW.pipeMode) return;
    e.stopPropagation(); e.preventDefault();
    const d = downPos; downPos = null;
    if (!d) return;
    const dist = Math.hypot(e.clientX-d.x, e.clientY-d.y);
    if (dragging || dist > 5){
      // drag: measure width as the on-screen drag distance, converted to
      // mask px the same zoom-invariant way RW._snapCatchPx does (screen px
      // -> mask px via the live pdf-container width).
      const [ax,ay] = RW._toNorm(d.x, d.y), [bx,by] = RW._toNorm(e.clientX, e.clientY);
      const mx1=ax*RW.W, my1=ay*RW.H, mx2=bx*RW.W, my2=by*RW.H;
      const w = Math.hypot(mx2-mx1, my2-my1);
      if (w > 0.5){
        RW._pipeWidth = w;
        const inp = document.getElementById('rw-pipe-width'); if (inp) inp.value = RW._fmtWidth(w);
      }
      dragging = false; dragCurClient = null;
      RW._renderPipePreview(e.clientX, e.clientY);
      return;
    }
    // click: add a path vertex (Poly2's exact placement idiom — rw_brushpoly.js).
    if (RW._pipeFinished){ RW._pipePts = []; RW._pipeFinished = false; } // start a fresh path after a finished one
    let [nx,ny] = RW._toNorm(e.clientX, e.clientY);
    if (RW._trySnap && !e.shiftKey){ const s = RW._trySnap(nx,ny); nx=s[0]; ny=s[1]; }
    RW._pipePts.push([nx,ny]);
    RW._renderPipePreview(e.clientX, e.clientY);
    RW._syncPipeBtns();
  }, true);

  ac.addEventListener('dblclick', function(e){
    if (!RW.pipeMode) return;
    e.stopPropagation(); e.preventDefault();
    if (RW._pipePts.length >= 2){
      RW._pipeFinished = true;
      RW._renderPipePreview(e.clientX, e.clientY);
      RW._commitStatus('pipe path finished (' + RW._pipePts.length + ' points) — Trace to preview, Commit Pipe to stage');
    }
    RW._syncPipeBtns();
  }, true);

  ac.addEventListener('click', function(e){
    if (RW.pipeMode){ e.stopPropagation(); e.preventDefault(); }
  }, true);

  window.addEventListener('keydown', function(e){
    const t = e.target;
    if (t && (t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable)) return;
    if (!RW.pipeMode) return;
    if (e.key==='c'||e.key==='C'){
      // still allow toggling the mode off/on via C even while mid-path — matches
      // every other tool's own key both arming and disarming itself.
    }
    if (e.key==='Escape'){
      e.preventDefault(); e.stopImmediatePropagation();
      if (RW._pipePts.length){
        RW._pipePts = []; RW._pipeFinished = false;
        RW._renderPipePreview(null, null);
        RW._commitStatus('');
      } else {
        RW.setPipeMode(false);
      }
    }
    if (e.key==='Backspace' && !RW._pipeFinished){
      e.preventDefault(); e.stopImmediatePropagation();
      if (RW._pipePts.length) RW._pipePts.pop();
      RW._renderPipePreview(null, null);
    }
  }, true);

  // `C` arms/disarms the tool itself — separate listener so it works even
  // when RW.pipeMode is currently false (the block above only fires once armed).
  window.addEventListener('keydown', function(e){
    const t = e.target;
    if (t && (t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable)) return;
    if (e.ctrlKey||e.metaKey||e.altKey) return;
    if (e.key==='c'||e.key==='C'){
      e.preventDefault(); e.stopImmediatePropagation();
      RW.setPipeMode(!RW.pipeMode);
    }
  }, true);

  /* ---------- preview rendering ---------- */
  // Live while drawing: the confirmed points plus (if the mouse isn't
  // mid-drag) the current cursor as a provisional last point — same idiom
  // as Poly2's own live area hint (rw_brushpoly.js:91-94).
  RW._renderPipePreview = function(clientX, clientY){
    const old = document.getElementById('rw-pipe-preview'); if (old) old.remove();
    if (!RW.pipeMode) return;

    if (dragging && dragCurClient && downPos){
      const svg = RW._mkSvg('rw-pipe-preview', 71);
      svg.innerHTML = '<line x1="'+downPos.x+'" y1="'+downPos.y+'" x2="'+dragCurClient.x+'" y2="'+dragCurClient.y
        + '" stroke="#ff8c00" stroke-width="2" stroke-dasharray="4,3"/>';
      // same mask-px conversion mouseup uses when it actually locks the value in
      const [ax,ay] = RW._toNorm(downPos.x, downPos.y), [bx,by] = RW._toNorm(dragCurClient.x, dragCurClient.y);
      const liveW = Math.hypot((bx-ax)*RW.W, (by-ay)*RW.H);
      RW._commitStatus('width: ' + RW._fmtWidth(liveW) + 'px (release to set)');
      return;
    }

    const pts = RW._pipePts.slice();
    if (!RW._pipeFinished && clientX != null && pts.length){
      const [nx,ny] = RW._toNorm(clientX, clientY);
      pts.push([nx,ny]);
    }
    if (pts.length < 2){
      if (pts.length===1){
        const svg = RW._mkSvg('rw-pipe-preview', 71);
        const [px,py] = RW._toPx(pts[0][0], pts[0][1]);
        svg.innerHTML = '<circle cx="'+px+'" cy="'+py+'" r="4" fill="#ff8c00"/>';
      }
      return;
    }
    const ribbon = RW._pipeRibbon(pts, RW._pipeWidth);
    if (!ribbon) return;
    const svg = RW._mkSvg('rw-pipe-preview', 71);
    const poly = ribbon.map(p => { const [px,py]=RW._toPx(p.x,p.y); return px+','+py; }).join(' ');
    const centerline = pts.map(([nx,ny]) => { const [px,py]=RW._toPx(nx,ny); return px+','+py; }).join(' ');
    svg.innerHTML = '<polygon points="'+poly+'" fill="rgba(255,140,0,0.22)" stroke="#ff8c00" stroke-width="1.5"/>'
      + '<polyline points="'+centerline+'" fill="none" stroke="#ff8c00" stroke-width="1" stroke-dasharray="3,3"/>';
    if (!RW._pipeFinished){
      RW._commitStatus('pipe: ' + (RW._pipePts.length) + ' point' + (RW._pipePts.length===1?'':'s')
        + ' · width ' + RW._fmtWidth(RW._pipeWidth) + 'px · double-click to finish');
    }
  };

  RW._renderPipeTrace = function(){
    if (!RW._pipeFinished || RW._pipePts.length < 2){
      RW._commitStatus('finish the path first (double-click), then Trace');
      return;
    }
    const ribbon = RW._pipeRibbon(RW._pipePts, RW._pipeWidth);
    const old = document.getElementById('rw-pipe-preview'); if (old) old.remove();
    const svg = RW._mkSvg('rw-pipe-preview', 76);
    const poly = ribbon.map(p => { const [px,py]=RW._toPx(p.x,p.y); return px+','+py; }).join(' ');
    svg.innerHTML = '<polygon points="'+poly+'" fill="rgba(255,140,0,0.28)" stroke="#ff8c00" stroke-width="2"/>';
    RW._commitStatus('traced: ' + ribbon.length + ' pts · width ' + RW._fmtWidth(RW._pipeWidth) + 'px — Commit Pipe to stage');
  };

  RW.commitPipe = async function(){
    if (!annotationState.currentTag){
      RW._commitStatus('no active tag — press a tag number first'); return;
    }
    const problem = RW._pipeSanityCheck(RW._pipePts, RW._pipeWidth);
    if (problem){ RW._commitStatus('refused: ' + problem); return; }
    const ribbon = RW._pipeRibbon(RW._pipePts, RW._pipeWidth);
    if (!ribbon || ribbon.length < 4){ RW._commitStatus('refused: could not build a ribbon from this path'); return; }
    // The measured width is recorded in the pipe's own notes rather than a
    // second visible shape — see the "dimension line, tried and reverted"
    // history note above RW._pipeSanityCheck for why a separate tick
    // annotation was tried first and dropped.
    const a = RW._createPendingAnnotation(ribbon, 'pipe width: ' + RW._pipeWidth.toFixed(2) + ' px');
    await RW._forceRender();
    RW._lastCommit = [a];
    RW.clearPipe({keepStatus:true});
    // set AFTER clearPipe, not before — clearPipe blanks the status by
    // default (used by Escape/mode-off), which would otherwise overwrite
    // this success message before the user ever sees it. Confirmed live:
    // without keepStatus, this message flashed and vanished instantly.
    RW._commitStatus('staged 1 pipe (' + ribbon.length + ' pts, width ' + RW._fmtWidth(RW._pipeWidth) + 'px)'
      + ' — review and Save. To remove it before Save, select it in the app and press Delete.'
      + ' Got an elbow fitting to mark? Press L.');
  };

  RW.clearPipe = function(opts){
    RW._pipePts = [];
    RW._pipeFinished = false;
    const old = document.getElementById('rw-pipe-preview'); if (old) old.remove();
    if (!opts || !opts.keepStatus) RW._commitStatus('');
    RW._syncPipeBtns();
  };

  /* ---------- mode arm/disarm, cross-disarm both directions ---------- */
  RW.setPipeMode = function(on){
    if (on){
      if (RW.maskMode){
        RW.maskMode=null; ac.style.cursor='';
        const rl=document.getElementById('rw-rectline'); if(rl) rl.remove();
        if (RW._syncRectBtn) RW._syncRectBtn();
      }
      if (RW.maskMode2)     RW.setMaskMode2(null);
      if (RW.healBrushMode) RW.setHealBrushMode(false);
      if (RW.pickMode)      RW.setPick(false);
      if (RW.cutMode)       RW.setCut(false);
      document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
      const popup=document.getElementById('selection-popup'); if (popup) popup.style.display='none';
      RW._commitStatus('pipe mode: click to place points (double-click to finish), drag to measure width');
    }
    RW.pipeMode = !!on;
    ac.style.cursor = on ? 'crosshair' : '';
    if (!on) RW.clearPipe();
    RW._syncPipeBtns();
  };

  ['setPick','setCut','setMaskMode2','setHealBrushMode'].forEach(fn=>{
    const orig = RW[fn];
    if (typeof orig !== 'function') return;
    RW[fn] = function(arg){
      if (arg && RW.pipeMode) RW.setPipeMode(false);
      return orig.apply(RW, arguments);
    };
  });
  if (RW._syncRectBtn){
    const origSyncRectBtn = RW._syncRectBtn;
    RW._syncRectBtn = function(){
      origSyncRectBtn.apply(RW, arguments);
      if (RW.maskMode==='rect' && RW.pipeMode) RW.setPipeMode(false);
    };
  }

  /* ---------- panel ---------- */
  const bar = (document.getElementById('rw-pick') || {}).parentNode;
  if (bar && !document.getElementById('rw-pipe-group')){
    const group = document.createElement('span');
    group.id = 'rw-pipe-group';

    const b = document.createElement('button');
    b.id = 'rw-pipe';
    b.title = 'Click points along a pipe\'s centerline (double-click to finish); drag anywhere to measure a fixed width off the drawing. Builds a constant-width ribbon regardless of text/fittings crossing the line. Escape clears, Backspace drops the last point. Elbow fittings get their own tool — press L.';
    b.style.cssText = 'font-size:11px;padding:2px 6px;';
    b.innerText = 'Pipe (C)';
    b.onclick = () => RW.setPipeMode(!RW.pipeMode);
    group.appendChild(b);

    const traceBtn = document.createElement('button');
    traceBtn.id = 'rw-pipe-trace';
    traceBtn.title = 'Preview the exact ribbon polygon that would be committed.';
    traceBtn.style.cssText = 'font-size:11px;padding:2px 6px;';
    traceBtn.innerText = 'Trace';
    traceBtn.onclick = () => RW._renderPipeTrace();
    group.appendChild(traceBtn);

    const commitBtn = document.createElement('button');
    commitBtn.id = 'rw-pipe-commit';
    commitBtn.title = 'Stage the finished path as a pending polygon annotation.';
    commitBtn.style.cssText = 'font-size:11px;padding:2px 6px;background:rgba(255,140,0,0.25);';
    commitBtn.innerText = 'Commit Pipe';
    commitBtn.onclick = () => RW.commitPipe();
    group.appendChild(commitBtn);

    const label1 = document.createElement('span');
    label1.innerText = 'width'; label1.style.cssText = 'font-size:10px;opacity:0.7;margin-left:4px;';
    group.appendChild(label1);
    const widthInp = document.createElement('input');
    widthInp.id = 'rw-pipe-width';
    widthInp.type = 'number'; widthInp.value = RW._fmtWidth(RW._pipeWidth); widthInp.step = 'any';
    widthInp.title = 'Ribbon width in mask px. Set by dragging across the pipe in the drawing, or type a value directly.';
    widthInp.style.cssText = 'font-size:11px;padding:1px 4px;width:44px;text-align:right;';
    widthInp.onchange = function(){
      const v = parseFloat(widthInp.value);
      if (isNaN(v) || v<=0) return;
      RW._pipeWidth = v;
      if (RW._pipeFinished) RW._renderPipeTrace();
      else RW._renderPipePreview(null, null);
    };
    group.appendChild(widthInp);

    bar.appendChild(group);
  }

  RW._syncPipeBtns = function(){
    const b = document.getElementById('rw-pipe');
    if (b) b.style.background = RW.pipeMode ? 'rgba(255,140,0,0.35)' : '';
    const t = document.getElementById('rw-pipe-trace');
    if (t) t.disabled = !RW._pipeFinished;
    const c = document.getElementById('rw-pipe-commit');
    if (c) c.disabled = !RW._pipeFinished;
  };
  RW._syncPipeBtns();

  const hideBtn = document.getElementById('rw-hide');
  if (hideBtn){
    const origHideClick = hideBtn.onclick;
    hideBtn.onclick = function(){
      if (origHideClick) origHideClick.apply(this, arguments);
      const el = document.getElementById('rw-pipe-preview');
      if (el) el.style.display = (el.style.display==='none') ? '' : 'none';
    };
  }

  return 'v3.1 up: Pipe annotation — click a path (double-click to finish), drag to measure width, Trace/Commit Pipe';
})()

;
// ===== rw_panelsections.js =====
// RW vsec — panel reorganization: labelled sections instead of one long
// wrapping row (no collapsing/hiding — not asked for).
//
// Approach: POST-LOAD REFLOW, not editing every module to mount into named
// containers. Modules keep appending to the original anonymous button-bar;
// this module moves controls BY ID into labelled sections afterward — so a
// missed/renamed id just leaves the control visible in the leftover bar
// instead of silently vanishing (no test suite, non-programmer users). Also
// keeps the `(document.getElementById('rw-pick')||{}).parentNode` idiom every
// module uses working unmodified — that element still exists, just gets
// emptied after everyone else has appended to it.
//
// Timing: rw_panelux.js's retrofit() (wraps everything into #rw-body) is
// deferred via setTimeout(...,100). This module runs synchronously near the
// end of the same concatenated script, so it's guaranteed to finish first —
// anchored off #rw-list's OWN parent (not #rw-panel by name) so it's correct
// either way.
//
// Load AFTER every tool module (so controls exist to move) and BEFORE
// rw_elbow.js (so RW.panelSection exists for it to call).
(function(){
  const RW = window.__RW;
  if (!RW || !RW.v31) return 'need v3.1 (rw_wallspan.js) first';
  if (RW.vsec) return 'panel sections already installed';
  RW.vsec = true;

  // Shared style constants (the ~18x copy-pasted strings this codebase uses
  // everywhere) — for NEW code to reuse; existing modules keep their own
  // inline copies untouched.
  RW.ui = {
    BTN: 'font-size:11px;padding:2px 6px;',
    NUM: 'font-size:11px;padding:1px 4px;width:44px;text-align:right;',
    LBL: 'font-size:10px;opacity:0.7;margin-left:4px;',
    ACCENT: 'background:rgba(255,140,0,0.25);',
  };

  const list = document.getElementById('rw-list');
  const host = list && list.parentNode; // #rw-panel now, or #rw-body if retrofit already ran
  if (!host){ return 'panel sections: #rw-list not found, skipping'; }

  // Capture the legacy bar BEFORE the sweep, same lookup every module uses.
  const legacyBar = (document.getElementById('rw-pick') || {}).parentNode;

  const sections = document.createElement('div');
  sections.id = 'rw-sections';
  const anchor = document.getElementById('rw-commit-status') || list;
  host.insertBefore(sections, anchor);

  const sectionEls = {};
  let firstSection = true;
  RW.panelSection = function(key, label){
    const existingId = 'rw-sec-' + key;
    let row = document.getElementById(existingId);
    if (row) return row;
    const wrap = document.createElement('div');
    wrap.className = 'rw-sec';
    wrap.dataset.sec = key;
    wrap.style.cssText = 'margin-bottom:6px;' + (firstSection ? '' : 'border-top:1px solid rgba(128,128,128,0.22);padding-top:5px;');
    firstSection = false;
    const lbl = document.createElement('div');
    lbl.id = 'rw-sec-label-' + key;
    lbl.innerText = label;
    lbl.style.cssText = 'font-size:9px;letter-spacing:0.09em;text-transform:uppercase;opacity:0.55;margin-bottom:3px;user-select:none;';
    wrap.appendChild(lbl);
    row = document.createElement('div');
    row.id = existingId;
    row.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;align-items:center;';
    wrap.appendChild(row);
    sections.appendChild(wrap);
    sectionEls[key] = row;
    return row;
  };

  // Pre-create every section in display order (an empty one, e.g. FITTINGS
  // before rw_elbow.js mounts anything, is hidden below).
  const REGIONS  = RW.panelSection('regions',  'REGIONS');
  const MASK     = RW.panelSection('mask',     'MASK TOOLS');
  const HEAL     = RW.panelSection('heal',     'HEAL');
  const PIPE     = RW.panelSection('pipe',     'PIPE');
  const FITTINGS = RW.panelSection('fittings', 'FITTINGS');
  const VIEW     = RW.panelSection('view',     'VIEW');

  // id -> destination section, in intended visual order. A missing id is
  // just skipped, never a hard failure.
  const moves = [
    [REGIONS, ['rw-pick','rw-merge','rw-cut','rw-commit','rw-refresh','rw-undo']],
    [MASK,    ['rw-rect','rw-poly2','rw-brush','rw-snap','rw-relabel-inp','rw-relabel-btn','rw-addmode']],
    [HEAL,    ['rw-heal-group','rw-healbrush-btn']],
    [PIPE,    ['rw-pipe-group']],
    [VIEW,    ['rw-walls','rw-hide','rw-textdetect-group']],
  ];

  // The area-floor input never had a visible label (stray unlabeled box next
  // to Rect) — give it one now so it travels into MASK TOOLS with the input.
  const relabelInp = document.getElementById('rw-relabel-inp');
  if (relabelInp && !document.getElementById('rw-relabel-label')){
    const l = document.createElement('span');
    l.id = 'rw-relabel-label';
    l.innerText = 'min area'; l.style.cssText = RW.ui.LBL;
    relabelInp.parentNode.insertBefore(l, relabelInp);
  }

  const movedIds = [];
  moves.forEach(([sectionEl, ids]) => {
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (id === 'rw-relabel-inp'){
        const l = document.getElementById('rw-relabel-label');
        if (l) { sectionEl.appendChild(l); }
      }
      sectionEl.appendChild(el);
      movedIds.push(id);
    });
  });

  // Restore flex/gap on group-wrapper spans (#rw-pipe-group/#rw-textdetect-group
  // predate this reorg and need it set explicitly; #rw-heal-group already sets
  // its own).
  //
  // Real bug found live: `cssText += 'display:inline-flex;...'` appends a
  // second `display` declaration rather than replacing it — for
  // #rw-textdetect-group the existing one is `display:none` (rw_textdetect.js's
  // deliberate hide), and the LATER declaration wins, silently un-hiding it.
  // Fixed by setting individual style properties and preserving `display:none`
  // on anything already hidden.
  ['rw-pipe-group','rw-textdetect-group'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const alreadyHidden = el.style.display === 'none';
    el.style.display = alreadyHidden ? 'none' : 'inline-flex';
    el.style.gap = '4px';
    el.style.alignItems = 'center';
  });

  // Safety net: an unanticipated leftover control stays visible (unsectioned)
  // with a console warning, rather than silently disappearing.
  if (legacyBar){
    if (legacyBar.children.length){
      console.warn('[RW] unmapped panel controls left in the legacy bar:',
        Array.from(legacyBar.children).map(c => c.id || c.tagName));
    } else {
      legacyBar.remove();
    }
  }

  // Hide a section that ended up with zero children — build-time only, not a
  // live re-evaluation. Deferred via setTimeout(0): checked synchronously,
  // FITTINGS would always look empty here since rw_elbow.js (loaded right
  // after this module) hasn't run yet, and would get hidden permanently.
  // Deferring to the next tick runs this after the whole loader has finished.
  setTimeout(function(){
    Object.keys(sectionEls).forEach(key => {
      const row = sectionEls[key];
      if (row && !row.children.length) row.parentNode.style.display = 'none';
    });
  }, 0);

  return 'panel sections up: ' + Object.keys(sectionEls).length + ' sections, ' + movedIds.length + ' controls relocated';
})()

;
// ===== rw_elbow.js =====
// RW v3.2 — Elbow fitting: drag a box (or click points + double-click to
// close a tighter polygon region) around a pipe fitting and trace the REAL
// linework inside it into a polygon (not a shape inferred from where you
// dragged). Color-pick + tolerance is the primary control over what counts
// as ink; the single largest connected piece inside the box/region is
// selected, traced pixel-exactly (RW._traceGridBoundary), then diagonal/
// curved staircase runs are collapsed into clean chords via the same
// Douglas-Peucker simplifier region commits use (RW._simplifyRing).
//
// Full design history (rejected approaches, live-found bugs, why fuse/hug/
// shrink were removed) lives in CLAUDE.md — this file only carries the
// "why" that's load-bearing for the code itself.
//
// Load LAST (after rw_panelsections.js, needs v31). Depends on:
//   - RW.wall / RW.extract (rw_install.js) — fallback linework source.
//   - RW._buildAnnotationMask (rw_textdetect.js) — excludes already-committed
//     annotations from the detection source.
//   - RW._traceGridBoundary, RW._dpOpen/_simplifyRing/_bisectRingToTargetPts
//     (rw_commit.js) — exact tracing + Douglas-Peucker collapsing.
//   - RW._createPendingAnnotation, RW._forceRender, RW._commitStatus (rw_commit.js).
//   - RW._toNorm/_toPx/_mkSvg (rw_stable.js).
//   - RW.panelSection (rw_panelsections.js) — optional; falls back to the
//     legacy #rw-pick-parentNode bar-append idiom if absent.
(function(){
  const RW = window.__RW;
  if (!RW || !RW.v31) return 'need v3.1 (rw_wallspan.js) first';
  if (RW.v32) return 'v3.2 already installed';
  RW.v32 = true;

  const ac = document.getElementById('annotation-canvas');

  /* ---------- state ---------- */
  RW.elbowMode      = false;
  RW._elbowBoxN     = null;   // detection box {x0,y0,x1,y1}, normalized, min/max-ordered — always set (even for a region, it's the region's own bbox)
  RW._elbowRegionN  = null;   // committed polygon region, normalized [[x,y],...], or null (rectangle-only detection)
  RW._elbowRegionWip = null;  // in-progress (not yet double-clicked closed) polygon vertices, normalized [[x,y],...]
  RW._elbowPoly     = null;   // detected polygon, normalized [{x,y}], or null — one shape (the largest qualifying piece)
  RW._elbowRaster   = null;   // {localW,localH,pad,scale,gx0,gy0, src,selected} — for the Px debug overlay
  RW._elbowMeta     = null;   // {totalComps,candidateComps,keptPx,srcPx,coverage,source,capFallback}
  // Tunables, mask-px, defaults per user preference (not the resolution-scaled formula).
  RW._elbowMinArea  = 1;
  RW._elbowSubAnn   = true;   // subtract already-committed annotations from the detection source
  RW._elbowRes      = 100;    // sample the box at this many x the current mask resolution (RASTER_BUDGET still caps a large box)
  RW._elbowTargetPts = 24;    // 0 = auto; >0 = bisect eps to hit this many output vertices
  RW._elbowPxState  = 0;      // 0 off, 1 source (thresholded+clipped), 2 selected (the piece that gets traced/committed)
  RW._elbowPicking     = false; // one-shot "next click samples a color" mode, armed by the Pick Color button
  RW._elbowTargetColor = null;  // {r,g,b} once picked — replaces the darkness threshold when set
  RW._elbowColorTol    = 100;   // Euclidean RGB distance tolerance, used when RW._elbowTargetColor is set
  RW._elbowDragHandle  = null;  // {type:'box', anchor:[nx,ny]} or {type:'region', index} while dragging an existing corner/vertex

  let downClient  = null;   // client {x,y} at mousedown, for the click-vs-drag threshold
  let dragStartN  = null;   // normalized start corner of the in-progress box drag
  let dragging    = false;
  let elbowRerunTimer = null;
  // Shared 250ms-debounced re-detect, used by both the panel's tunable
  // inputs and handle-dragging below, so dragging doesn't re-run the full
  // raster/trace pipeline on every mousemove frame.
  function scheduleElbowRerun(){
    clearTimeout(elbowRerunTimer);
    elbowRerunTimer = setTimeout(() => { if (RW._elbowBoxN) RW._runElbowDetect(); }, 250);
  }

  // Hit-tests an existing box corner or region vertex against a client
  // point, for click-and-drag editing. Container-relative px, matching
  // RW._toPx's own coordinate space.
  function hitTestElbowHandle(clientX, clientY){
    const cr = document.getElementById('pdf-container').getBoundingClientRect();
    const mx = clientX - cr.x, my = clientY - cr.y;
    const HIT = 10;
    if (RW._elbowRegionN){
      for (let i=0;i<RW._elbowRegionN.length;i++){
        const [px,py] = RW._toPx(RW._elbowRegionN[i][0], RW._elbowRegionN[i][1]);
        if (Math.hypot(px-mx, py-my) <= HIT) return { type:'region', index:i };
      }
    } else if (RW._elbowBoxN){
      const b = RW._elbowBoxN;
      const corners = [[b.x0,b.y0],[b.x1,b.y0],[b.x1,b.y1],[b.x0,b.y1]];
      const opposite = [[b.x1,b.y1],[b.x0,b.y1],[b.x0,b.y0],[b.x1,b.y0]];
      for (let i=0;i<corners.length;i++){
        const [px,py] = RW._toPx(corners[i][0], corners[i][1]);
        if (Math.hypot(px-mx, py-my) <= HIT) return { type:'box', anchor:opposite[i] };
      }
    }
    return null;
  }

  /* ---------- pure geometry/raster helpers (Node-testable, no DOM) ---------- */

  // 8-connected component labeling scoped to a local raster. Tracks each
  // component's size and its min distance to (cx,cy) during the same flood.
  function labelComponents(mask, w, h, cx, cy){
    const labels = new Int32Array(w*h).fill(-1);
    const comps = [];
    for (let s=0; s<w*h; s++){
      if (!mask[s] || labels[s]>=0) continue;
      const id = comps.length;
      const stack=[s]; labels[s]=id;
      let size=0, dCenter=Infinity, x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
      while (stack.length){
        const i = stack.pop(); size++;
        const x=i%w, y=(i/w)|0;
        if (x<x0)x0=x; if (x>x1)x1=x; if (y<y0)y0=y; if (y>y1)y1=y;
        const d = Math.hypot(x-cx, y-cy); if (d<dCenter) dCenter=d;
        for (let dy=-1; dy<=1; dy++){
          for (let dx=-1; dx<=1; dx++){
            if (!dx && !dy) continue;
            const nx=x+dx, ny=y+dy;
            if (nx<0||nx>=w||ny<0||ny>=h) continue;
            const ni = ny*w+nx;
            if (mask[ni] && labels[ni]<0){ labels[ni]=id; stack.push(ni); }
          }
        }
      }
      comps.push({id, size, x0,y0,x1,y1, dCenter});
    }
    return {labels, comps};
  }

  // Shoelace area of a normalized {x,y} polygon, in mask-px^2 (coverage sanity check).
  function shoelaceAreaPx(poly, W, H){
    let a = 0;
    for (let i=0;i<poly.length;i++){
      const p1=poly[i], p2=poly[(i+1)%poly.length];
      a += (p1.x*W)*(p2.y*H) - (p2.x*W)*(p1.y*H);
    }
    return Math.abs(a)/2;
  }
  // Same, for a raw [x,y] (mask-px) ring — used for a drawn region's own area.
  function shoelaceRaw(pts){
    let a = 0;
    for (let i=0;i<pts.length;i++){
      const [x1,y1]=pts[i], [x2,y2]=pts[(i+1)%pts.length];
      a += x1*y2 - x2*y1;
    }
    return Math.abs(a)/2;
  }

  // Segment-intersection test (orientation-based) — used only to check a
  // Douglas-Peucker-capped grid-boundary trace for a genuine self-crossing.
  // RW._traceGridBoundary's raw output can be a WEAKLY simple ring (a pinch
  // point revisits one corner — harmless on its own), and DP could in
  // principle cut across the pinch into a true crossing. Adjacent edges
  // (sharing a ring index, including the wraparound pair) are skipped.
  function segmentsIntersect(p1,p2,p3,p4){
    function orient(a,b,c){ return (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]); }
    function onSeg(a,b,c){
      return Math.min(a[0],b[0])<=c[0] && c[0]<=Math.max(a[0],b[0])
          && Math.min(a[1],b[1])<=c[1] && c[1]<=Math.max(a[1],b[1]);
    }
    const o1=orient(p1,p2,p3), o2=orient(p1,p2,p4), o3=orient(p3,p4,p1), o4=orient(p3,p4,p2);
    if (((o1>0&&o2<0)||(o1<0&&o2>0)) && ((o3>0&&o4<0)||(o3<0&&o4>0))) return true;
    if (o1===0 && onSeg(p1,p2,p3)) return true;
    if (o2===0 && onSeg(p1,p2,p4)) return true;
    if (o3===0 && onSeg(p3,p4,p1)) return true;
    if (o4===0 && onSeg(p3,p4,p2)) return true;
    return false;
  }
  function isSimplePolygon(ring){
    const n = ring.length;
    if (n < 3) return false;
    for (let i=0;i<n;i++){
      const a1=ring[i], a2=ring[(i+1)%n];
      for (let j=i+1;j<n;j++){
        if (j === i+1) continue;           // shares vertex ring[i+1]
        if (i === 0 && j === n-1) continue; // wraparound adjacency
        const b1=ring[j], b2=ring[(j+1)%n];
        if (segmentsIntersect(a1,a2,b1,b2)) return false;
      }
    }
    return true;
  }

  // Pixel color-match decision, extracted so it's directly Node-testable
  // without a real canvas. No color picked -> the flat darkness threshold
  // RW.extract also uses; once picked, this REPLACES the darkness test.
  RW._elbowColorMatch = function(r, g, b){
    const tc = RW._elbowTargetColor;
    if (!tc) return Math.min(r,g,b) < 200;
    const tol = RW._elbowColorTol != null ? RW._elbowColorTol : 40;
    const dr=r-tc.r, dg=g-tc.g, db=b-tc.b;
    return Math.sqrt(dr*dr+dg*dg+db*db) < tol;
  };

  // width -> {minArea} seed formula, so the panel's `width` input can stay a
  // one-shot write (see its oninput handler below) rather than a standing
  // recompute rule.
  RW._elbowSeedFromWidth = function(width){
    return { minArea: Math.max(1, Math.round(2.5 * width * width)) };
  };

  // Even-odd scanline fill of a polygon (given in LOCAL raster px already)
  // into a fresh mask — a from-scratch reimplementation rather than reusing
  // RW._paintPoly (rw_masktools.js), which is hardcoded to RW.wall/RW.W/RW.H.
  function rasterizePolyLocal(localPts, w, h){
    const mask = new Uint8Array(w*h);
    let minY=Infinity, maxY=-Infinity;
    for (const [,y] of localPts){ if (y<minY) minY=y; if (y>maxY) maxY=y; }
    minY = Math.max(0, Math.floor(minY)); maxY = Math.min(h-1, Math.ceil(maxY));
    for (let y=minY; y<=maxY; y++){
      const xs=[];
      for (let i=0,j=localPts.length-1; i<localPts.length; j=i++){
        const [xi,yi]=localPts[i], [xj,yj]=localPts[j];
        if ((yi>y)!==(yj>y)) xs.push(xi + (y-yi)/(yj-yi)*(xj-xi));
      }
      xs.sort((a,b)=>a-b);
      for (let k=0;k+1<xs.length;k+=2){
        const xa=Math.max(0,Math.round(xs[k])), xb=Math.min(w-1,Math.round(xs[k+1]));
        for (let x=xa;x<=xb;x++) mask[y*w+x]=1;
      }
    }
    return mask;
  }

  /* ---------- raster acquisition ----------
     Two sources, tried in order. Kept separate from the pure pixel pipeline
     below (RW._elbowProcessRaster) so the Node test suite keeps injecting a
     synthetic raster directly, while the real DOM path stays exercised live. */

  // Eyedropper: sample #pdf-canvas's actual pixel color at a normalized page
  // point. Only meaningful against the real canvas — RW.wall has already
  // thrown color information away by the time it's a binary mask.
  RW._elbowSampleColorAt = function(nx, ny){
    try {
      const src = document.getElementById('pdf-canvas');
      if (!src || typeof src.getContext !== 'function') return null;
      const cv = document.createElement('canvas');
      cv.width = 1; cv.height = 1;
      const ctx = cv.getContext('2d');
      if (!ctx) return null;
      const gx = Math.max(0, Math.min(src.width-1, Math.round(nx*src.width)));
      const gy = Math.max(0, Math.min(src.height-1, Math.round(ny*src.height)));
      ctx.drawImage(src, gx, gy, 1, 1, 0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return { r:d[0], g:d[1], b:d[2] };
    } catch (e){
      return null;
    }
  };

  // Primary: sample #pdf-canvas directly at `res` x the current mask
  // resolution — sidesteps RW.extract's page-wide width cap so a small box
  // genuinely benefits from more source detail. Returns null (falls through
  // to the RW.wall crop) if the canvas is unavailable, throws, or the
  // sampled region comes back entirely blank.
  RW._elbowAcquireRaster = function(geom){
    try {
      const src = document.getElementById('pdf-canvas');
      if (!src || typeof src.getContext !== 'function') return null;
      const cv = document.createElement('canvas');
      cv.width = geom.localW; cv.height = geom.localH;
      const ctx = cv.getContext('2d');
      if (!ctx) return null;
      // Fill white first: a fresh canvas reads back (0,0,0,0) wherever
      // nothing is drawn, and the darkness threshold would mark that as
      // wall — the pad margin needs to read as genuinely empty.
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, geom.localW, geom.localH);
      const dw = geom.rawW*geom.scale, dh = geom.rawH*geom.scale;
      // geom.* are RW.W-space; pdf-canvas's native backing store can be a
      // larger, different resolution when RW.extract's width cap kicked in
      // — scale through nativeScale so drawImage samples the right region
      // (a real bug, found live: an un-scaled crop silently sampled the
      // wrong sub-region on a page where the cap had triggered).
      const nativeScale = src.width / RW.W;
      const sgx0 = geom.gx0*nativeScale, sgy0 = geom.gy0*nativeScale;
      const srawW = geom.rawW*nativeScale, srawH = geom.rawH*nativeScale;
      ctx.drawImage(src, sgx0, sgy0, srawW, srawH, geom.pad, geom.pad, dw, dh);
      const img = ctx.getImageData(0, 0, geom.localW, geom.localH).data;
      const data = new Uint8Array(geom.localW*geom.localH);
      let srcPx = 0;
      for (let i=0;i<data.length;i++){
        if (RW._elbowColorMatch(img[i*4], img[i*4+1], img[i*4+2])){ data[i]=1; srcPx++; }
      }
      if (!srcPx) return null; // blank crop -> fall back rather than report a false empty box
      if (RW._elbowSubAnn && typeof annotationState !== 'undefined'){
        const acv = document.createElement('canvas');
        acv.width = geom.localW; acv.height = geom.localH;
        const actx = acv.getContext('2d');
        actx.fillStyle = '#000';
        for (const a of annotationState.annotations){
          if (a._hidden || a.is_void) continue;
          const pts = a.coordinates; if (!Array.isArray(pts) || pts.length<3) continue;
          actx.beginPath();
          pts.forEach((p,i)=>{
            const X = (p.x*RW.W - geom.gx0)*geom.scale + geom.pad;
            const Y = (p.y*RW.H - geom.gy0)*geom.scale + geom.pad;
            i ? actx.lineTo(X,Y) : actx.moveTo(X,Y);
          });
          actx.closePath(); actx.fill();
        }
        const adata = actx.getImageData(0, 0, geom.localW, geom.localH).data;
        for (let i=0;i<data.length;i++) if (adata[i*4+3]>127) data[i]=0;
      }
      return { data, localW:geom.localW, localH:geom.localH, pad:geom.pad, scale:geom.scale,
        gx0:geom.gx0, gy0:geom.gy0, source:'canvas' };
    } catch (e){
      return null; // e.g. a tainted canvas
    }
  };

  // Fallback: crop the existing page-wide RW.wall mask. Loses anything only
  // visible in RW.wall and not on the real canvas but never hard-fails.
  // Fills each source pixel's full scale x scale destination footprint
  // (not just a single rounded point) so upsampling (`scale`>1) doesn't
  // leave a sparse, gap-riddled pattern.
  function acquireFromWall(geom){
    if (!RW.wall) RW.extract();
    const ann = RW._elbowSubAnn && RW._buildAnnotationMask ? RW._buildAnnotationMask() : null;
    const data = new Uint8Array(geom.localW*geom.localH);
    let srcPx = 0;
    const {W,H} = RW;
    const gx0i = Math.max(0, Math.floor(geom.gx0)), gx1i = Math.min(W-1, Math.ceil(geom.gx0+geom.rawW));
    const gy0i = Math.max(0, Math.floor(geom.gy0)), gy1i = Math.min(H-1, Math.ceil(geom.gy0+geom.rawH));
    for (let gy=gy0i; gy<=gy1i; gy++){
      for (let gx=gx0i; gx<=gx1i; gx++){
        const gi = gy*W+gx;
        if (!RW.wall[gi]) continue;
        if (ann && ann[gi]) continue;
        const lx0 = Math.round((gx-geom.gx0)*geom.scale) + geom.pad;
        const lx1 = Math.round((gx+1-geom.gx0)*geom.scale) + geom.pad;
        const ly0 = Math.round((gy-geom.gy0)*geom.scale) + geom.pad;
        const ly1 = Math.round((gy+1-geom.gy0)*geom.scale) + geom.pad;
        const lxa = Math.max(0,lx0), lxb = Math.min(geom.localW-1, lx1-1);
        const lya = Math.max(0,ly0), lyb = Math.min(geom.localH-1, ly1-1);
        for (let ly=lya; ly<=lyb; ly++){
          for (let lx=lxa; lx<=lxb; lx++){
            const li = ly*geom.localW+lx;
            if (!data[li]){ data[li]=1; srcPx++; }
          }
        }
      }
    }
    return { data, localW:geom.localW, localH:geom.localH, pad:geom.pad, scale:geom.scale,
      gx0:geom.gx0, gy0:geom.gy0, source:'wall', srcPx };
  }

  /* ---------- pure pixel pipeline ----------
     A function of a raster + tunables only — no DOM, directly Node-testable.
     Returns {poly, stages, meta} or {error}. */
  RW._elbowProcessRaster = function(raster, opts){
    const { localW, localH } = raster;
    let src = raster.data;
    // Clip to the region polygon if one is active, otherwise the box's own
    // interior (pad is just working room for the trace/coordinate math near
    // the raster edge — nothing dilates past this clip once applied, since
    // there's no dilation step anymore).
    let clipMask;
    if (opts.regionLocalPts){
      clipMask = rasterizePolyLocal(opts.regionLocalPts, localW, localH);
    } else {
      clipMask = new Uint8Array(localW*localH);
      const { pad } = raster;
      for (let y=pad; y<localH-pad; y++) for (let x=pad; x<localW-pad; x++) clipMask[y*localW+x]=1;
    }
    {
      const masked = new Uint8Array(localW*localH);
      for (let i=0;i<masked.length;i++) masked[i] = src[i] && clipMask[i] ? 1 : 0;
      src = masked;
    }
    let srcPx = 0; for (let i=0;i<src.length;i++) srcPx += src[i];
    if (!srcPx){
      return { error: 'no linework found in that box' +
        (RW._elbowSubAnn ? ' — try turning off "sub ann", or hit Re-extract if the page changed' : ' — hit Re-extract if the page changed') };
    }

    const minAreaLocal = Math.max(1, Math.round(opts.minArea * raster.scale * raster.scale));
    const cx = localW/2, cy = localH/2;

    // Label 8-connected components on the thresholded, clipped source
    // directly — no dilation/bridging. Color-pick + `tol` is the primary
    // control over what counts as ink; a genuinely separate piece just
    // isn't included rather than being forced together.
    const { labels, comps } = labelComponents(src, localW, localH, cx, cy);
    if (!comps.length) return { error: 'no connected shape found inside the box — try picking a color, or raising "tol"' };
    const candidates = comps.filter(c => c.size >= minAreaLocal);
    if (!candidates.length){
      return { error: 'only noise-sized pieces found inside the box — lower "min px"' };
    }
    // Pick the component with the MOST raw pixels.
    candidates.sort((a,b) => b.size - a.size);
    const keep = candidates[0];

    const selected = new Uint8Array(localW*localH);
    for (let i=0;i<selected.length;i++) if (labels[i]===keep.id) selected[i]=1;

    // Exact rectilinear trace — the only tracer.
    let traced = RW._traceGridBoundary(selected, { W:localW, H:localH });
    if (!traced) return { error: 'trace failed — try adjusting the box, the color, or "tol"' };
    const rawAreaPx = shoelaceAreaPx(traced, localW, localH);
    if (rawAreaPx < 4) return { error: 'traced shape is too small (likely noise) — try a bigger box or raise "min px"' };

    // Diagonal collapsing: Douglas-Peucker (RW._simplifyRing /
    // RW._bisectRingToTargetPts, rw_commit.js) on the exact trace's raw
    // vertices — a small fixed eps by default, or bisected to a `pts` target.
    let capFallback = false;
    const targetPts = opts.targetPts != null && opts.targetPts > 0 ? Math.max(5, Math.round(opts.targetPts)) : 0;
    const ring = traced.map(p => [p.x*localW, p.y*localH]);
    const simplifiedRing = targetPts
      ? RW._bisectRingToTargetPts(ring, targetPts, null)
      : RW._simplifyRing(ring, 0.8, null);
    // The raw trace can be only WEAKLY simple (a pinch point) — DP over a
    // pinch could in principle cut across it into a true self-intersection.
    // Fall back to the full uncollapsed trace rather than ship a bad polygon.
    if (isSimplePolygon(simplifiedRing)){
      traced = simplifiedRing.map(([x,y]) => ({ x:+(x/localW).toFixed(6), y:+(y/localH).toFixed(6) }));
    } else {
      capFallback = true;
    }
    if (traced.length < 3) return { error: 'traced shape has too few points' };

    // Map local-normalized -> global mask-px -> page-normalized.
    const poly = traced.map(p => ({
      x: +((((p.x*localW) - raster.pad)/raster.scale + raster.gx0)/RW.W).toFixed(6),
      y: +((((p.y*localH) - raster.pad)/raster.scale + raster.gy0)/RW.H).toFixed(6),
    }));

    return {
      poly,
      stages: { src, selected, localW, localH, pad:raster.pad, scale:raster.scale, gx0:raster.gx0, gy0:raster.gy0 },
      meta: { totalComps: comps.length, candidateComps: candidates.length, keptPx: keep.size, srcPx,
        source: raster.source, res: raster.scale, localW, localH, capFallback },
    };
  };

  /* ---------- orchestrator: acquire a raster, then process it ---------- */
  RW._elbowDetect = function(boxN, opts){
    if (!boxN) return { error: 'no box' };
    opts = opts || {};
    const { W, H } = RW;

    const gx0raw = Math.min(boxN.x0,boxN.x1)*W, gx1raw = Math.max(boxN.x0,boxN.x1)*W;
    const gy0raw = Math.min(boxN.y0,boxN.y1)*H, gy1raw = Math.max(boxN.y0,boxN.y1)*H;
    const gx0 = Math.max(0, gx0raw), gx1 = Math.min(W-1, gx1raw);
    const gy0 = Math.max(0, gy0raw), gy1 = Math.min(H-1, gy1raw);
    const rawW = gx1-gx0, rawH = gy1-gy0;
    if (rawW < 4 || rawH < 4) return { error: "that's a click, not a box — drag out a bigger area around the fitting" };

    // Budget-scale-cap: scale = min(res, sqrt(budget/area)) — bounds a
    // pathologically large box while letting `res` genuinely upscale a
    // normal-sized one.
    const RASTER_BUDGET = 1_500_000;
    const res = RW._elbowRes != null ? RW._elbowRes : 3;
    const scale = Math.min(res, Math.sqrt(RASTER_BUDGET / Math.max(1, rawW*rawH)));
    const pad = Math.max(2, Math.round(2*scale));
    const localW = Math.max(2, Math.round(rawW*scale)) + 2*pad;
    const localH = Math.max(2, Math.round(rawH*scale)) + 2*pad;
    const geom = { gx0, gy0, rawW, rawH, pad, scale, localW, localH };

    let raster = RW._elbowAcquireRaster ? RW._elbowAcquireRaster(geom) : null;
    if (!raster) raster = acquireFromWall(geom);

    let regionLocalPts = null;
    let regionAreaPx = null;
    if (opts.regionN && opts.regionN.length >= 3){
      const globalPts = opts.regionN.map(([nx,ny]) => [nx*W, ny*H]);
      regionLocalPts = globalPts.map(([gx,gy]) => [ (gx-gx0)*scale+pad, (gy-gy0)*scale+pad ]);
      regionAreaPx = shoelaceRaw(globalPts);
    }

    const result = RW._elbowProcessRaster(raster, {
      minArea: RW._elbowMinArea, regionLocalPts, targetPts: RW._elbowTargetPts,
    });
    if (result.error) return result;

    const polyAreaPx = shoelaceAreaPx(result.poly, W, H);
    const boxAreaPx = rawW*rawH;
    // Coverage against the REGION's own area when one is active, not its
    // (larger) bounding box's — otherwise a tight region inside a much
    // looser bbox would read as artificially low coverage.
    result.meta.coverage = regionAreaPx != null
      ? (regionAreaPx>0 ? polyAreaPx/regionAreaPx : 0)
      : (boxAreaPx>0 ? polyAreaPx/boxAreaPx : 0);
    return result;
  };

  /* ---------- sanity check ----------
     Refuses on structurally-broken results; WARNS (doesn't refuse) on a
     high-coverage trace — the user decides whether a near-100% trace is
     right or a sign the box sat inside an existing annotation/solid fill. */
  RW._elbowSanityCheck = function(poly, boxN, meta){
    if (!poly || poly.length < 3) return 'traced shape has too few points';
    if (meta && meta.coverage < 0.0002) return 'found almost nothing inside the box — try picking a color, or raising "tol"';
    const warnings = [];
    if (meta && meta.coverage > 0.95){
      warnings.push('warning: the trace covers ~the whole box — that usually means it sits inside an existing annotation or a solid fill; try lowering "tol" or redrawing tighter');
    }
    if (boxN){
      const areaN = Math.abs(boxN.x1-boxN.x0) * Math.abs(boxN.y1-boxN.y0);
      if (areaN > 0.2) warnings.push('warning: this box covers a large chunk of the page — elbow fittings are small; detection will be dominated by whatever else is in there');
    }
    return warnings.length ? warnings.join(' ') : null;
  };

  /* ---------- run detection + update state/status/preview ---------- */
  RW._runElbowDetect = function(){
    if (!RW._elbowBoxN) return;
    const result = RW._elbowDetect(RW._elbowBoxN, { regionN: RW._elbowRegionN });
    if (result.error){
      RW._elbowPoly = null; RW._elbowMeta = null; RW._elbowRaster = null;
      RW._commitStatus('elbow: ' + result.error);
      RW._renderElbowPreview();
      RW._syncElbowBtns();
      return;
    }
    RW._elbowRaster = result.stages;
    const problem = RW._elbowSanityCheck(result.poly, RW._elbowBoxN, result.meta);
    if (problem && problem.indexOf('warning:') !== 0){
      RW._elbowPoly = null; RW._elbowMeta = result.meta;
      RW._commitStatus('elbow: refused: ' + problem);
      RW._renderElbowPreview();
      RW._syncElbowBtns();
      return;
    }
    RW._elbowPoly = result.poly;
    RW._elbowMeta = result.meta;
    const m = result.meta;
    const pctCov = Math.round((m.coverage||0)*100);
    const colorNote = RW._elbowTargetColor
      ? (m.source==='wall' ? ' — color pick ignored (no canvas access this time, used darkness threshold)' : ' — color-matched')
      : '';
    const piecesNote = m.candidateComps > 1
      ? ' — selected the largest of ' + m.candidateComps + ' candidate pieces (' + m.keptPx + 'px)'
      : '';
    const capNote = m.capFallback
      ? ' — could not simplify safely (a pinch point) — showing the full exact trace instead'
      : '';
    const bigNote = (result.poly.length > 200)
      ? ' — ' + result.poly.length + ' points is a lot; consider setting "pts" to simplify'
      : '';
    RW._commitStatus('elbow: traced ' + result.poly.length + ' pts, ' + pctCov + '% of '
      + (RW._elbowRegionN ? 'region' : 'box') + ' — raster '
      + m.localW + 'x' + m.localH + ' (res ' + m.res.toFixed(2) + 'x, src:' + m.source + ')' + colorNote
      + piecesNote + capNote + bigNote
      + (problem ? ' — ' + problem : '') + ' — Commit Elbow to stage (tunables re-detect live)');
    RW._renderElbowPreview();
    RW._syncElbowBtns();
  };

  /* ---------- interaction: drag a box, OR click a series of points and
     double-click to close a tighter polygon region (same 5px click/drag
     threshold and capture-phase mousedown/mousemove/mouseup/click/dblclick
     template the Rect mask tool / Pipe tool already use) ---------- */
  ac.addEventListener('mousedown', function(e){
    if (!RW.elbowMode) return;
    e.stopPropagation(); e.preventDefault();
    if (!RW._elbowPicking){
      const hit = hitTestElbowHandle(e.clientX, e.clientY);
      if (hit){
        RW._elbowDragHandle = hit;
        downClient = {x:e.clientX, y:e.clientY};
        dragging = false;
        return;
      }
    }
    downClient = {x:e.clientX, y:e.clientY};
    dragStartN = RW._toNorm(e.clientX, e.clientY);
    dragging = false;
  }, true);

  ac.addEventListener('mousemove', function(e){
    if (!RW.elbowMode || !downClient) return;
    e.stopPropagation();
    // dragging an existing box corner or region vertex: mutate it, redraw
    // immediately, and debounce a full re-detect so the traced highlight
    // updates live without re-running the pipeline on every mouse event.
    if (RW._elbowDragHandle){
      const n = RW._toNorm(e.clientX, e.clientY);
      if (RW._elbowDragHandle.type === 'box'){
        const [ax,ay] = RW._elbowDragHandle.anchor;
        RW._elbowBoxN = { x0:Math.min(ax,n[0]), y0:Math.min(ay,n[1]), x1:Math.max(ax,n[0]), y1:Math.max(ay,n[1]) };
      } else {
        RW._elbowRegionN[RW._elbowDragHandle.index] = n;
        const xs=RW._elbowRegionN.map(p=>p[0]), ys=RW._elbowRegionN.map(p=>p[1]);
        RW._elbowBoxN = { x0:Math.min(...xs), y0:Math.min(...ys), x1:Math.max(...xs), y1:Math.max(...ys) };
      }
      RW._renderElbowPreview();
      scheduleElbowRerun();
      return;
    }
    // once a region vertex exists, never fall into rectangle-drag — a shaky
    // click while placing a vertex shouldn't silently discard the polygon.
    if (RW._elbowRegionWip && RW._elbowRegionWip.length) return;
    const d = Math.hypot(e.clientX-downClient.x, e.clientY-downClient.y);
    if (d > 5) dragging = true;
    if (dragging){
      const curN = RW._toNorm(e.clientX, e.clientY);
      RW._renderElbowRect(dragStartN, curN);
    }
  }, true);

  ac.addEventListener('mouseup', function(e){
    if (!RW.elbowMode || !downClient) return;
    e.stopPropagation(); e.preventDefault();
    const down = downClient; downClient = null;
    const rl = document.getElementById('rw-elbow-rect'); if (rl) rl.remove();
    const wasDragging = dragging; dragging = false;
    if (RW._elbowDragHandle){
      // release: settle on an immediate, non-debounced detect so the final
      // result matches exactly where the handle was dropped.
      RW._elbowDragHandle = null;
      clearTimeout(elbowRerunTimer);
      RW._runElbowDetect();
      return;
    }
    if (RW._elbowPicking){
      // one-shot color sample: a plain click while armed samples the ink
      // color at that point instead of placing a vertex/starting a box; a
      // real drag cancels picking without sampling.
      RW._elbowPicking = false;
      if (!wasDragging){
        const n = RW._toNorm(down.x, down.y);
        const c = RW._elbowSampleColorAt(n[0], n[1]);
        if (c){
          RW._elbowTargetColor = c;
          RW._commitStatus('elbow: picked color rgb(' + c.r + ',' + c.g + ',' + c.b + ') — detection now matches this color (tol ' + RW._elbowColorTol + ')');
        } else {
          RW._commitStatus('elbow: could not sample a color there — canvas unavailable');
        }
      }
      RW._syncElbowBtns();
      if (RW._elbowBoxN) RW._runElbowDetect();
      return;
    }
    if (!wasDragging){
      // a plain click: place (or continue) a polygon-region vertex, at the
      // MOUSEDOWN position (not mouseup) so it lands where the user aimed.
      // Every plain click adds a vertex, whether or not one already exists —
      // an earlier version of this handler returned early once a first
      // vertex existed, which silently discarded every click after the
      // first and made a polygon region impossible to ever close.
      if (!RW._elbowRegionWip) RW._elbowRegionWip = [];
      RW._elbowRegionWip.push(RW._toNorm(down.x, down.y));
      dragStartN = null;
      RW._renderElbowPreview();
      return;
    }
    const curN = RW._toNorm(e.clientX, e.clientY);
    const [ax,ay] = dragStartN, [bx,by] = curN;
    dragStartN = null;
    RW._elbowBoxN = { x0:Math.min(ax,bx), y0:Math.min(ay,by), x1:Math.max(ax,bx), y1:Math.max(ay,by) };
    RW._elbowRegionN = null; RW._elbowRegionWip = null;
    RW._runElbowDetect();
  }, true);

  ac.addEventListener('click', function(e){
    if (RW.elbowMode){ e.stopPropagation(); e.preventDefault(); }
  }, true);

  ac.addEventListener('dblclick', function(e){
    if (!RW.elbowMode) return;
    e.stopPropagation(); e.preventDefault();
    if (!RW._elbowRegionWip || RW._elbowRegionWip.length < 3) return;
    // a real double-click fires two full mousedown/mouseup pairs before this
    // event, so the closing click already appended a near-duplicate vertex
    // — drop it.
    const pts = RW._elbowRegionWip.slice();
    const [lx,ly] = pts[pts.length-1], [px,py] = pts[pts.length-2];
    if (Math.hypot(lx-px, ly-py) < 0.002) pts.pop();
    if (pts.length < 3) return;
    RW._elbowRegionN = pts;
    RW._elbowRegionWip = null;
    const xs = pts.map(p=>p[0]), ys = pts.map(p=>p[1]);
    RW._elbowBoxN = { x0:Math.min(...xs), y0:Math.min(...ys), x1:Math.max(...xs), y1:Math.max(...ys) };
    RW._runElbowDetect();
  }, true);

  window.addEventListener('keydown', function(e){
    const t = e.target;
    if (t && (t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable)) return;
    if (!RW.elbowMode) return;
    if (e.key==='Escape'){
      e.preventDefault(); e.stopImmediatePropagation();
      if (RW._elbowPicking){
        RW._elbowPicking = false;
        RW._syncElbowBtns();
        RW._commitStatus('');
      } else if (RW._elbowRegionWip && RW._elbowRegionWip.length){
        RW._elbowRegionWip = null;
        RW._renderElbowPreview();
      } else if (RW._elbowBoxN || RW._elbowPoly || RW._elbowRegionN){
        RW.clearElbow();
      } else {
        RW.setElbowMode(false);
      }
    }
  }, true);

  // `L` arms/disarms the tool itself — works even when RW.elbowMode is
  // currently false (matches RW.pipeMode's own `C` key, rw_wallspan.js).
  window.addEventListener('keydown', function(e){
    const t = e.target;
    if (t && (t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable)) return;
    if (e.ctrlKey||e.metaKey||e.altKey) return;
    if (e.key==='l'||e.key==='L'){
      e.preventDefault(); e.stopImmediatePropagation();
      RW.setElbowMode(!RW.elbowMode);
    }
  }, true);

  /* ---------- preview rendering ---------- */
  RW._renderElbowRect = function(aN, bN){
    const svg = RW._mkSvg('rw-elbow-rect', 71);
    const [ax,ay] = RW._toPx(Math.min(aN[0],bN[0]), Math.min(aN[1],bN[1]));
    const [bx,by] = RW._toPx(Math.max(aN[0],bN[0]), Math.max(aN[1],bN[1]));
    svg.innerHTML = '<rect x="'+ax+'" y="'+ay+'" width="'+(bx-ax)+'" height="'+(by-ay)
      + '" fill="rgba(255,140,0,0.08)" stroke="#ff8c00" stroke-width="1.5" stroke-dasharray="5,3"/>';
  };

  RW._renderElbowPreview = function(){
    const old = document.getElementById('rw-elbow-preview'); if (old) old.remove();
    if (!RW.elbowMode || (!RW._elbowBoxN && !(RW._elbowRegionWip && RW._elbowRegionWip.length))){ RW._renderElbowPx(); return; }
    const svg = RW._mkSvg('rw-elbow-preview', 76);
    let html = '';
    if (RW._elbowBoxN && !RW._elbowRegionN){
      const b = RW._elbowBoxN;
      const [bx0,by0] = RW._toPx(b.x0,b.y0), [bx1,by1] = RW._toPx(b.x1,b.y1);
      html += '<rect x="'+bx0+'" y="'+by0+'" width="'+(bx1-bx0)+'" height="'+(by1-by0)
        + '" fill="none" stroke="#ff8c00" stroke-width="1" stroke-dasharray="4,3" opacity="0.6"/>';
      // draggable corner handles
      [[b.x0,b.y0],[b.x1,b.y0],[b.x1,b.y1],[b.x0,b.y1]].forEach(([nx,ny])=>{
        const [px,py] = RW._toPx(nx,ny);
        html += '<circle cx="'+px+'" cy="'+py+'" r="5" fill="#fff" stroke="#ff8c00" stroke-width="2"/>';
      });
    }
    if (RW._elbowRegionN){
      const pts = RW._elbowRegionN.map(([nx,ny]) => { const [px,py]=RW._toPx(nx,ny); return px+','+py; }).join(' ');
      html += '<polygon points="'+pts+'" fill="none" stroke="#ff8c00" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.7"/>';
      // draggable vertex handles
      RW._elbowRegionN.forEach(([nx,ny])=>{
        const [px,py] = RW._toPx(nx,ny);
        html += '<circle cx="'+px+'" cy="'+py+'" r="5" fill="#fff" stroke="#ff8c00" stroke-width="2"/>';
      });
    }
    if (RW._elbowRegionWip && RW._elbowRegionWip.length){
      const pts = RW._elbowRegionWip.map(([nx,ny]) => { const [px,py]=RW._toPx(nx,ny); return px+','+py; }).join(' ');
      html += '<polyline points="'+pts+'" fill="none" stroke="#ff8c00" stroke-width="1.5"/>';
      RW._elbowRegionWip.forEach(([nx,ny])=>{ const [px,py]=RW._toPx(nx,ny); html += '<circle cx="'+px+'" cy="'+py+'" r="3" fill="#ff8c00"/>'; });
    }
    if (RW._elbowPoly && RW._elbowPoly.length >= 3){
      const poly = RW._elbowPoly.map(p => { const [px,py]=RW._toPx(p.x,p.y); return px+','+py; }).join(' ');
      html += '<polygon points="'+poly+'" fill="rgba(255,140,0,0.28)" stroke="#ff8c00" stroke-width="2"/>';
    }
    svg.innerHTML = html;
    RW._renderElbowPx();
  };

  // Debug overlay — a 2-state cycle (source / selected), mirroring the `W`
  // wall-overlay convention. Positioned in PERCENTAGE coordinates of
  // #pdf-container so it stays glued to the drawing through pan/zoom.
  RW._renderElbowPx = function(){
    const old = document.getElementById('rw-elbow-px'); if (old) old.remove();
    if (!RW._elbowPxState || !RW._elbowRaster) return;
    const r = RW._elbowRaster;
    const stageKey = RW._elbowPxState===1 ? 'src' : 'selected';
    const data = r[stageKey];
    if (!data) return;
    const {W,H} = RW;
    const cv = document.createElement('canvas');
    cv.id = 'rw-elbow-px';
    cv.width = r.localW; cv.height = r.localH;
    const leftN = (r.gx0 - r.pad/r.scale) / W;
    const topN  = (r.gy0 - r.pad/r.scale) / H;
    const wN    = (r.localW/r.scale) / W;
    const hN    = (r.localH/r.scale) / H;
    cv.style.cssText = 'position:absolute;left:'+(leftN*100)+'%;top:'+(topN*100)+'%;width:'+(wN*100)+'%;height:'+(hN*100)
      + '%;pointer-events:none;z-index:75;opacity:0.75;image-rendering:pixelated;';
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(r.localW, r.localH);
    for (let i=0;i<data.length;i++) if (data[i]){ img.data[i*4]=255; img.data[i*4+1]=140; img.data[i*4+2]=0; img.data[i*4+3]=220; }
    ctx.putImageData(img,0,0);
    document.getElementById('pdf-container').appendChild(cv);
  };

  /* ---------- commit ---------- */
  RW.commitElbow = async function(){
    if (!annotationState.currentTag){
      RW._commitStatus('no active tag — press a tag number first'); return;
    }
    if (!RW._elbowPoly || RW._elbowPoly.length < 3){
      RW._commitStatus('elbow: nothing traced yet — drag a box (or draw a region) around a fitting first'); return;
    }
    const n = RW._elbowPoly.length;
    const colorDesc = RW._elbowTargetColor
      ? ('color rgb(' + RW._elbowTargetColor.r + ',' + RW._elbowTargetColor.g + ',' + RW._elbowTargetColor.b + '), tol ' + RW._elbowColorTol)
      : 'darkness threshold';
    const a = RW._createPendingAnnotation(RW._elbowPoly,
      'elbow fitting (traced: ' + colorDesc + ', min px ' + RW._elbowMinArea.toFixed(2) + ', res ' + RW._elbowRes.toFixed(2)
      + (RW._elbowRegionN ? ', region' : '') + ')');
    await RW._forceRender();
    RW._lastCommit = [a];
    RW.clearElbow({keepStatus:true});
    RW._commitStatus('staged 1 elbow (' + n + ' pts) — review and Save. To remove it before Save, select it in the app and press Delete.');
  };

  RW.clearElbow = function(opts){
    RW._elbowBoxN = null;
    RW._elbowRegionN = null;
    RW._elbowRegionWip = null;
    RW._elbowPoly = null;
    RW._elbowMeta = null;
    RW._elbowRaster = null;
    RW._elbowPicking = false;
    RW._elbowDragHandle = null;
    clearTimeout(elbowRerunTimer);
    ['rw-elbow-rect','rw-elbow-preview','rw-elbow-px'].forEach(id=>{
      const el = document.getElementById(id); if (el) el.remove();
    });
    if (!opts || !opts.keepStatus) RW._commitStatus('');
    RW._syncElbowBtns();
  };

  /* ---------- mode arm/disarm, cross-disarm both directions ---------- */
  RW.setElbowMode = function(on){
    if (on){
      if (RW.maskMode){
        RW.maskMode=null; ac.style.cursor='';
        const rl=document.getElementById('rw-rectline'); if(rl) rl.remove();
        if (RW._syncRectBtn) RW._syncRectBtn();
      }
      if (RW.maskMode2)     RW.setMaskMode2(null);
      if (RW.healBrushMode) RW.setHealBrushMode(false);
      if (RW.pickMode)      RW.setPick(false);
      if (RW.cutMode)       RW.setCut(false);
      if (RW.pipeMode)      RW.setPipeMode(false);
      document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
      const popup=document.getElementById('selection-popup'); if (popup) popup.style.display='none';
      RW._commitStatus('elbow mode: drag a box, or click points + double-click to close a tighter region, around an elbow fitting');
    }
    RW.elbowMode = !!on;
    ac.style.cursor = on ? 'crosshair' : '';
    if (!on) RW.clearElbow();
    RW._syncElbowBtns();
  };

  ['setPick','setCut','setMaskMode2','setHealBrushMode','setPipeMode'].forEach(fn=>{
    const orig = RW[fn];
    if (typeof orig !== 'function') return;
    RW[fn] = function(arg){
      if (arg && RW.elbowMode) RW.setElbowMode(false);
      return orig.apply(RW, arguments);
    };
  });
  if (RW._syncRectBtn){
    const origSyncRectBtn = RW._syncRectBtn;
    RW._syncRectBtn = function(){
      origSyncRectBtn.apply(RW, arguments);
      if (RW.maskMode==='rect' && RW.elbowMode) RW.setElbowMode(false);
    };
  }

  /* ---------- panel ---------- */
  // Mounts into the FITTINGS section (rw_panelsections.js) if present;
  // otherwise falls back to the legacy bar-append idiom.
  const sec = (RW.panelSection && RW.panelSection('fittings', 'FITTINGS'))
    || (document.getElementById('rw-pick') || {}).parentNode;

  if (sec && !document.getElementById('rw-elbow')){
    const b = document.createElement('button');
    b.id = 'rw-elbow';
    b.title = 'Drag a box (or click points + double-click to close a tighter region) around an elbow fitting; traces the real linework inside it into a polygon that hugs the fitting (curve + any side stub). Once drawn, drag any corner/vertex to reshape it live. Escape backs out one step at a time.';
    b.style.cssText = 'font-size:11px;padding:2px 6px;';
    b.innerText = 'Elbow (L)';
    b.onclick = () => RW.setElbowMode(!RW.elbowMode);
    sec.appendChild(b);

    const commitBtn = document.createElement('button');
    commitBtn.id = 'rw-elbow-commit';
    commitBtn.title = 'Stage the traced elbow shape as a pending polygon annotation.';
    commitBtn.style.cssText = 'font-size:11px;padding:2px 6px;background:rgba(255,140,0,0.25);';
    commitBtn.innerText = 'Commit Elbow';
    commitBtn.onclick = () => RW.commitElbow();
    sec.appendChild(commitBtn);

    const pxBtn = document.createElement('button');
    pxBtn.id = 'rw-elbow-px-btn';
    pxBtn.title = 'Cycle a debug overlay of the detection pixels: off -> source (thresholded+clipped) -> selected (the one piece that will be traced/committed) -> off. Shows what got dropped and why.';
    pxBtn.style.cssText = 'font-size:11px;padding:2px 6px;';
    pxBtn.innerText = 'Px?';
    pxBtn.onclick = () => {
      RW._elbowPxState = (RW._elbowPxState + 1) % 3;
      RW._syncElbowPxBtn();
      RW._renderElbowPx();
    };
    sec.appendChild(pxBtn);

    const pickBtn = document.createElement('button');
    pickBtn.id = 'rw-elbow-pick-color';
    pickBtn.title = 'Click this, then click a pixel on the drawing to sample its ink color. Detection then matches that color (within "tol") instead of the flat darkness threshold — replaces it entirely, not an additional filter.';
    pickBtn.style.cssText = 'font-size:11px;padding:2px 6px;';
    pickBtn.innerText = 'Pick Color';
    pickBtn.onclick = () => {
      RW._elbowPicking = !RW._elbowPicking;
      pickBtn.style.background = RW._elbowPicking ? 'rgba(255,140,0,0.35)' : '';
      RW._commitStatus(RW._elbowPicking ? 'elbow: click a pixel on the drawing to sample its color' : '');
    };
    sec.appendChild(pickBtn);

    const clearColorBtn = document.createElement('button');
    clearColorBtn.id = 'rw-elbow-clear-color';
    clearColorBtn.title = 'Clear the picked color — detection goes back to the flat darkness threshold.';
    clearColorBtn.style.cssText = 'font-size:11px;padding:2px 6px;';
    clearColorBtn.innerText = 'Clear Color';
    clearColorBtn.onclick = () => {
      RW._elbowTargetColor = null;
      RW._commitStatus('elbow: color cleared — back to the darkness threshold');
      if (RW._elbowBoxN) RW._runElbowDetect();
    };
    sec.appendChild(clearColorBtn);

    function numInput(id, label, value, title){
      const l = document.createElement('span');
      l.innerText = label; l.style.cssText = 'font-size:10px;opacity:0.7;margin-left:4px;';
      sec.appendChild(l);
      const inp = document.createElement('input');
      inp.id = id; inp.type='number'; inp.step='any'; inp.value = value;
      inp.title = title;
      inp.style.cssText = 'font-size:11px;padding:1px 4px;width:40px;text-align:right;';
      sec.appendChild(inp);
      return inp;
    }
    const tolInp = numInput('rw-elbow-tol', 'tol', RW._elbowColorTol,
      'Color-match tolerance (Euclidean RGB distance) used once a color has been picked (Pick Color) — the PRIMARY control over what counts as ink now. Has no effect until a color is picked (falls back to the flat darkness threshold).');
    const minInp = numInput('rw-elbow-min', 'min px', RW._elbowMinArea,
      'Minimum connected-shape size (mask px area) to be considered a real candidate rather than noise — the primary defense against a stray pixel being picked as "the largest piece," since there is no dilation step to smooth noise away implicitly.');
    const resInp = numInput('rw-elbow-res', 'res', RW._elbowRes,
      'Sample the detection box at this many times the current mask resolution — higher genuinely adds detail for a small box (up to a pixel budget), not just interpolation.');
    const ptsInp = numInput('rw-elbow-pts', 'pts', RW._elbowTargetPts,
      'Target vertex count for the traced output polygon. 0 = auto (fixed detail level — still collapses genuine diagonal/curved runs into straight chords). The preview and the committed shape are always the same polygon.');
    const widthInp = numInput('rw-elbow-width', 'width', 2,
      'The fitting\'s approximate drawn line thickness in mask px. Entering a value seeds "min px" from THIS instead of a generic guess — a one-time starting point you can still fine-tune directly afterward.');

    const subLabel = document.createElement('label');
    subLabel.style.cssText = 'font-size:10px;opacity:0.7;margin-left:4px;display:inline-flex;align-items:center;gap:2px;';
    subLabel.title = 'Subtract already-committed annotations (e.g. the pipe itself) from the detection so they don\'t dominate as "the largest shape in the box."';
    const subCb = document.createElement('input');
    subCb.type = 'checkbox'; subCb.id = 'rw-elbow-subann'; subCb.checked = !!RW._elbowSubAnn;
    subLabel.appendChild(subCb);
    subLabel.appendChild(document.createTextNode('sub ann'));
    sec.appendChild(subLabel);

    minInp.oninput    = () => { const v=parseFloat(minInp.value);    if (!isNaN(v) && v>=0){ RW._elbowMinArea=v; scheduleElbowRerun(); } };
    resInp.oninput    = () => { const v=parseFloat(resInp.value);    if (!isNaN(v) && v>0){  RW._elbowRes=v;     scheduleElbowRerun(); } };
    ptsInp.oninput    = () => { const v=parseInt(ptsInp.value,10);   if (!isNaN(v) && v>=0){ RW._elbowTargetPts=v; scheduleElbowRerun(); } };
    tolInp.oninput    = () => { const v=parseFloat(tolInp.value);    if (!isNaN(v) && v>=0){ RW._elbowColorTol=v; scheduleElbowRerun(); } };
    // width is a ONE-SHOT seed, not a standing tunable — writes a concrete
    // value into "min px" once, exactly like typing into that input directly.
    widthInp.oninput  = () => {
      const v = parseFloat(widthInp.value);
      if (isNaN(v) || v<=0) return;
      RW._elbowMinArea = RW._elbowSeedFromWidth(v).minArea;
      minInp.value = RW._elbowMinArea;
      scheduleElbowRerun();
    };
    subCb.onchange    = () => { RW._elbowSubAnn = subCb.checked; scheduleElbowRerun(); };
  }

  RW._syncElbowPxBtn = function(){
    const pxBtn = document.getElementById('rw-elbow-px-btn');
    if (!pxBtn) return;
    const labels = ['Px?','Px:src','Px:selected'];
    pxBtn.innerText = labels[RW._elbowPxState] || 'Px?';
    pxBtn.style.background = RW._elbowPxState ? 'rgba(255,140,0,0.35)' : '';
  };

  RW._syncElbowBtns = function(){
    const b = document.getElementById('rw-elbow');
    if (b) b.style.background = RW.elbowMode ? 'rgba(255,140,0,0.35)' : '';
    const c = document.getElementById('rw-elbow-commit');
    if (c) c.disabled = !(RW._elbowPoly && RW._elbowPoly.length >= 3);
    const p = document.getElementById('rw-elbow-pick-color');
    if (p) p.style.background = RW._elbowPicking ? 'rgba(255,140,0,0.35)' : '';
    RW._syncElbowPxBtn();
  };
  RW._syncElbowBtns();

  const hideBtn = document.getElementById('rw-hide');
  if (hideBtn){
    const origHideClick = hideBtn.onclick;
    hideBtn.onclick = function(){
      if (origHideClick) origHideClick.apply(this, arguments);
      ['rw-elbow-preview','rw-elbow-px'].forEach(id=>{
        const el = document.getElementById(id);
        if (el) el.style.display = (el.style.display==='none') ? '' : 'none';
      });
    };
  }

  return 'v3.2 up: Elbow fitting — drag a box (L), traces the real fitting inside it, Commit Elbow';
})()


  console.log('[RW] workbench ready: ' + __RW.regions.filter(r=>r.included).length + ' regions. Keys: P pick, K cut, B rect, N poly, J brush, A add, W walls, C pipe, L elbow, ` undo.');
})()
