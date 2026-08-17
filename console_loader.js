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
// MUST be loaded FIRST (before rw_install). Wraps annotation-canvas's
// addEventListener so every handler registered by later modules auto-checks
// RW.enabled.
(function boot(){
  'use strict';

  // __RW doesn't exist yet (rw_install creates it). Gate lives on a separate
  // object until retrofit().
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

  // Also wraps window keydown (capture)
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
    // scale extraction resolution to native canvas size
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
      // min RGB channel: catches colored (yellow/green/blue) lines too
      const minChan = Math.min(d[i*4], d[i*4+1], d[i*4+2]);
      if (minChan < 200) wall[i]=1;
    }
    // no morphological pass
    // knock out existing annotations
    const c2 = document.createElement('canvas'); c2.width=W; c2.height=H;
    const x2 = c2.getContext('2d');
    for (const a of annotationState.annotations){
      if (a._hidden || a.is_void) continue;
      // Array.isArray guard: bbox-type annotations store {x,y,width,height}, not a point array
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
      '<button id="rw-pick" style="font-size:11px;padding:2px 6px;">Pick</button>' +
      '<button id="rw-merge" style="font-size:11px;padding:2px 6px;">Merge</button>' +
      '<button id="rw-cut" style="font-size:11px;padding:2px 6px;">Cut</button>' +
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
// RW v2.1-revised — unified Rect tool.
// Paints into RW.wall via RW.maskAction (block/open/add), re-labels preserving groups.
// Uses normalized coords (_toNorm/_toPx from rw_stable.js) for pan-stable previews.
(function(){
  const RW = window.__RW;
  if (!RW || RW.v !== 2) return 'need RW v2 first';
  if (RW.v21r) return 'v2.1r already installed';
  RW.v21r = true;

  /* ---------- rect tool: unified block/open via maskAction ---------- */
  if (!('maskAction' in RW)) RW.maskAction = 'block';

  // coordinate helpers, available before rw_stable loads
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

  // Bresenham polyline — paints wall=1 only on wall=0 pixels not already part of an included region.
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
    // snapshot old regions before flood
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
      // skipping existing included-region pixels (bbox scope).
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

  // Wraps v2.2's _renderPreview (which only handles maskMode==='poly'), adding rect support.
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
    b.innerText = 'Rect '+sym;
    const bg = RW.maskAction==='add' ? 'rgba(50,205,50,0.4)' : 'rgba(255,160,60,0.4)';
    b.style.background = RW.maskMode==='rect' ? bg : '';
  };
  const bar = (document.getElementById('rw-pick') || {}).parentNode;
  if (bar && !document.getElementById('rw-rect')){
    const b=document.createElement('button');
    b.id='rw-rect'; b.title='Unified rect mask. Cycle its action via the "cycle" command.';
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
      // Mirrors _relabel()'s flood exactly (incl. included regions as barriers).
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

  /* ---------- Walls panel button ---------- */
  if (bar && !document.getElementById('rw-walls')){
    const wb = document.createElement('button');
    wb.id = 'rw-walls';
    wb.title = 'Toggle wall overlay. Shows wall=1 pixels in red.';
    wb.style.cssText = 'font-size:11px;padding:2px 6px;';
    wb.innerText = 'Walls';
    wb.onclick = ()=>RW.toggleWallOverlay();
    bar.appendChild(wb);
  }

  return 'v2.1r unified rect up: pan-stable';
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
    const sw = 1.5;   // constant screen px
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

  // v4 listeners (guarded by _previewV)
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

  // re-render preview on scroll
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
  // wheel = zoom (Ctrl+scroll)
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
    // re-render preview after mouseup
    if (RW._previewV!==4 || !RW.maskMode) return;
    setTimeout(()=>RW._renderPreview(null), 30);
  }, true);

  // Escape clears normalized state too
  document.addEventListener('keydown', function(e){
    const t=e.target;
    if (t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable)) return;
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

  // mousedown capture (window-level)
  window.addEventListener('mousedown', function(e){
    if (RW._previewV!==4 || !RW.maskMode) return;
    if (e.target !== ac && !ac.contains(e.target)) return;
    if (RW.maskMode==='block' || RW.maskMode==='open' || RW.maskMode==='rect') RW._snapshot(RW.maskMode);
  }, true);

  // _paintPoly wrapper: snapshots once per commit
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

  // keydown capture (window-level)
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
// RW v2.5 — mask contours become real pending annotations via
// annotationState/editHistory.
//
// Mechanism:
//   1. build newAnnotation { id: temp_*, tag, measurement_type:'POLYGON',
//      coordinates: <normalized pts>, _pending: true, _data: {page_id,
//      measurement_type, points_data, notes, tag_id, temp_id} }
//   2. annotationState.annotations.push(newAnnotation)
//   3. editHistory.push(createHistoryEntry('create_annotation', {before:null, after:newAnnotation}))
//   4. re-render via a zoom-button round-trip
//
// Load AFTER rw_undo.js (needs v2.3).
(function(){
  const RW = window.__RW;
  if (!RW || !RW.v23) return 'need v2.3 first';
  RW.v24 = true; // supersedes
  RW.v25 = true;

  /* ---------- contour tracing (Moore neighbor), generic over any 1/0 mask ----------
     Traces/smooths/simplifies any 1/0 mask, not just RW.labels regions.
     Reads no global RW.smoothPasses/RW.smoothEps; callers pass explicit
     smoothPasses/eps.
     opts: { seed:{x,y}|null, smoothPasses:int (Chaikin rounds, ~0.5-1px
              inward erosion each), eps:number (DP tolerance, ignored if
              targetPts set), targetPts:int|null (bisect eps to the vertex
              count closest to, without exceeding, this target), W:int, H:int
              (override RW.W/RW.H, default RW.W/RW.H) } */
  // Douglas-Peucker on an open polyline.
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

  // Simplify a closed ring at a given eps: splits at the point farthest from
  // ring[0] into two open chains (each including ring[0] as an endpoint),
  // DP-simplifies each, merges. `far` optional, precomputed if given.
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

  // Bisects eps (range 0.05-1e5) to the point count closest to, without
  // exceeding, `targetPts`.
  RW._bisectRingToTargetPts = function(ring, targetPts, far){
    let lo = 0.05, hi = 1e5;
    const at = (eps) => RW._simplifyRing(ring, eps, far);
    if (at(lo).length <= targetPts) return at(lo);
    if (at(hi).length > targetPts) return at(hi);
    for (let iter=0; iter<20; iter++){
      const mid = (lo+hi)/2;
      if (at(mid).length <= targetPts) hi = mid; else lo = mid;
    }
    return at(hi);
  };

  // Even-odd scanline fill of a [x,y]-tuple polygon (local raster px) into a
  // mask. dst (optional) lets multiple polygons union into one shared mask —
  // each call only ever sets pixels, never clears. Shared by rw_elbow.js and
  // rw_wallspan.js.
  RW._rasterizePolyLocal = function(localPts, w, h, dst){
    const mask = dst || new Uint8Array(w*h);
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
    // Chaikin corner-cutting: each vertex -> two points at 25%/75% of adjacent edges.
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

  /* ---------- exact pixel-edge boundary tracer ----------
     Walks the grid edges between pixels: every output edge is horizontal or
     vertical, a vertex only where the walk changes direction. No Chaikin/DP.

     Each foreground pixel's 4 sides bordering background (or out-of-bounds)
     are directed edges between the two grid corners at that side, foreground
     on the RIGHT of travel — right turns cycle N->E->S->W->N, clockwise in
     this codebase's y-down coordinates.

     Starts at the topmost-then-leftmost foreground pixel, no seed param.

     Ambiguous corner (an 8-connected region touching itself diagonally, 2
     valid outgoing directions): take the direction 90 degrees
     COUNTER-CLOCKWISE from the incoming one. Full proof: CLAUDE.md,
     verify_gridboundary.js.

     Output can be a weakly simple polygon (a pinch point revisits one
     corner); a caller simplifying with DP (RW._bisectRingToTargetPts) must
     check for a resulting self-intersection (done in rw_elbow.js).

     opts: { W:int, H:int }. Returns [{x,y}] or null if the mask is empty or
     the walk can't close. */
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
    const maxSteps = 4*fgCount + 8;

    let cx = startX, cy = startY;
    let dir = 'E';
    const verts = [[cx, cy]];
    let steps = 0;
    while (true){
      const [dx,dy] = DIRS[dir];
      cx += dx; cy += dy;
      steps++;
      if (steps > maxSteps) return null;
      if (cx === startX && cy === startY) break;

      // 4 pixels touching this corner: NW=(cx-1,cy-1), NE=(cx,cy-1), SW=(cx-1,cy), SE=(cx,cy).
      const NW = fg(cx-1,cy-1), NE = fg(cx,cy-1), SW = fg(cx-1,cy), SE = fg(cx,cy);
      const validE = SE && !NE, validS = SW && !SE, validW = NW && !SW, validN = NE && !NW;
      const count = (validE?1:0) + (validS?1:0) + (validW?1:0) + (validN?1:0);
      if (count === 0) return null;
      const nextDir = count === 1
        ? (validE ? 'E' : validS ? 'S' : validW ? 'W' : 'N')
        : CCW[dir];
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
    const passes = RW.smoothPasses != null ? RW.smoothPasses : 4;
    const e2 = RW.smoothEps != null ? RW.smoothEps : (eps||1.2);
    return RW._maskToPolygon(uni, {seed:null, smoothPasses:passes, eps:e2});
  };

  /* ---------- direct annotation creation ---------- */
  let tempCounter = 1;
  // notes: optional string, default ''.
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
    st.annotations.push(newAnnotation);
    window.editHistory.push(window.createHistoryEntry('create_annotation', {
      description: 'Draw polygon',
      targetId: newAnnotation.id,
      targetType: 'annotation',
      before: null,
      after: JSON.parse(JSON.stringify(newAnnotation)),
    }));
    return newAnnotation;
  };

  /* ---------- redraw: zoom-button round-trip ---------- */
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
//   Poly2 tool: freeform vertices, dbl-click closes.
//   Brush tool: freehand stroke, Tab+scroll sizes radius.
//   Add mode / action cycle (block → open → add), armed via the panel or the command line.
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
    if (pb) pb.innerText = 'Poly2 ' + label;
    if (pb) pb.style.background = RW.maskMode2==='poly2' ? 'rgba(255,160,60,0.4)' : '';
    const bb = document.getElementById('rw-brush');
    if (bb) bb.innerText = 'Brush ' + label;
    if (bb) bb.style.background = RW.maskMode2==='brush' ? 'rgba(255,160,60,0.4)' : '';
    const ab = document.getElementById('rw-addmode');
    if (ab){
      ab.innerText = 'Add ' + label;
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
    const t=e.target;
    if (t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable)) return;
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
      // Single thick polyline, not N circles
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
  const pb = addBtn('rw-poly2','Freeform mask: click vertices, double-click closes.');
  if (pb) pb.onclick=()=>RW.setMaskMode2(RW.maskMode2==='poly2'?null:'poly2');
  const bb = addBtn('rw-brush','Freehand mask stroke. Tab+scroll resizes.');
  if (bb) bb.onclick=()=>RW.setMaskMode2(RW.maskMode2==='brush'?null:'brush');
  const ab = document.createElement('button');
  ab.id='rw-addmode'; ab.title='Toggle Add Region mode.';
  ab.style.cssText='font-size:11px;padding:2px 6px;';
  ab.onclick=()=>{
    RW.setMaskAction(RW.maskAction==='add' ? 'block' : 'add');
  };
  bar.appendChild(ab);
  RW._syncToolButtons();

  return 'v2.6 up: Poly2 + Brush + Add';
})()

;
// ===== rw_healinterior.js =====
// RW v3 — interior noise healing.
//
// Detects wall pixels inside a selected region's group that are interior
// noise (text/hatch/dimension/leader marks) rather than the region's
// perimeter, and can erase them.
//
// Detection steps:
//   1. Per-pixel safety test (not a whole-component veto).
//   2. Bounded by reachability flood, not a fixed pad.
//   3. Hole-size threshold (RW._healNoiseHoleMax): a neighboring open area
//      larger than this counts as protected even if not `included`.
//   4. Door-opening gaps that merge a floor plan into the same open region
//      as the noise are not distinguished from noise.
//   5. Existing annotations' wall-knockout mask is rebuilt and excluded from
//      both the flood and the result.
//   6. Unsafe shell widened via a bounded BFS (RW._healBarrierMargin).
//
// RW._healBarrierMargin expands only inward from a region's own outer wall
// face, not both sides. Set barrier≥ to the line's full visible thickness,
// not half.
(function(){
  const RW = window.__RW;
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
  //       exterior or a different included region (per-pixel test).
  RW._computeInteriorNoise = function(gids){
    const {W,H,labels,regions,wall} = RW;
    const memberIds = new Set(regions.filter(r=>gids.has(r.group)).map(r=>r.id));
    if (!memberIds.size) return null;

    const isSameRegion = i => { const l=labels[i]; return l>=0 && memberIds.has(l); };

    // Protected: included, or bigger than RW._healNoiseHoleMax.
    const holeMax = RW._healNoiseHoleMax != null ? RW._healNoiseHoleMax : Math.round(300*(RW.W/2592));
    const isProtectedRegion = i => {
      const l = labels[i];
      if (l<0 || memberIds.has(l)) return false;
      const r = regions[l];
      return !!r && (r.included || r.size > holeMax);
    };

    // Rebuild existing annotations' wall-knockout mask; excluded from both the flood and the result.
    const annotationMask = new Uint8Array(W*H);
    if (typeof annotationState !== 'undefined'){
      const cv = document.createElement('canvas'); cv.width=W; cv.height=H;
      const actx = cv.getContext('2d');
      actx.fillStyle = '#000';
      for (const a of annotationState.annotations){
        if (a._hidden || a.is_void) continue;
        const pts = a.coordinates; if (!Array.isArray(pts) || pts.length<3) continue;
        actx.beginPath();
        pts.forEach((p,idx)=>{ const X=p.x*W, Y=p.y*H; idx?actx.lineTo(X,Y):actx.moveTo(X,Y); });
        actx.closePath(); actx.fill();
      }
      const adata = actx.getImageData(0,0,W,H).data;
      for (let i=0;i<W*H;i++) if (adata[i*4+3]>127) annotationMask[i]=1;
    }

    // True-unenclosed-exterior mask: reachable from the sheet border without crossing a wall or protected region.
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

    // Reachability flood from the region's own open pixels, stepping only into wall/same-region pixels.
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
        if (annotationMask[n]) continue;
        if (wall[n]===1){ seenReach[n]=1; reachableWall[n]=1; q2.push(n); }
        else if (isSameRegion(n)){ seenReach[n]=1; q2.push(n); }
      }
    }

    // Unsafe shell: reachable wall pixels whose immediate neighbor is exterior/protected/annotation.
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

    // Widen the unsafe shell by RW._healBarrierMargin via bounded BFS through reachable wall.
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

  window.addEventListener('keydown', function(e){
    const t=e.target;
    if (t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable)) return;
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
// Pipeline (rebuilt lazily on RW._snapDirty):
//   1. Density-prefilter RW.wall (RW._buildThinMask, integral image).
//   2. Skeletonize (Zhang-Suen thinning, active-list based).
//   3. Classify by 8-neighbor count: 1 = endpoint, 3+ = junction, 2 = not a candidate.
//   4. Cluster nearby candidates (junction wins over endpoint in a mixed cluster).
//   5. RW._buildEdgePoints adds every included region's boundary pixel as its
//      own unclustered 'edge' candidate.
//   6. Index all points in a bucket grid; catch radius (RW._snapCatchPx)
//      recomputed per-query, ~14 screen px regardless of zoom.
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
    // Summed-area table, padded with a zero row/col.
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
  // seed: the already density-filtered mask.
  RW._skeletonize = function(seed){
    const {W,H} = RW;
    const skel = new Uint8Array(seed);
    let active = [];
    for (let i=0;i<W*H;i++) if (skel[i]) active.push(i);

    // 8-neighbors clockwise from north (P2..P9, Zhang-Suen paper). Border
    // pixels are skipped (never deleted/classified).
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
    return Math.max(3, Math.round(6 * (RW.W/2592)));
  };
  RW._snapCellPx = function(){
    return Math.max(4, Math.round(RW.W/200));
  };
  RW._snapCatchPx = function(){
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
// Flags areas where skeleton endpoint/junction candidates cluster densely.
// Never touches RW.wall/RW.labels/RW.regions — visualization only.
(function(){
  const RW = window.__RW;
  if (!RW || !RW.v27) return 'need v2.7 (rw_snap.js) first';
  if (RW.v29) return 'v2.9 already installed';
  RW.v29 = true;

  RW._textCellPx = Math.max(6, Math.round(16 * (RW.W/2592)));
  RW._textMinPerCell = 4;
  RW._textDirty = true;
  RW._textCandidates = [];

  // Mask of annotation interiors.
  RW._buildAnnotationMask = function(){
    const {W,H} = RW;
    const cv = document.createElement('canvas'); cv.width=W; cv.height=H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#000';
    for (const a of (typeof annotationState!=='undefined' ? annotationState.annotations : [])){
      if (a._hidden || a.is_void) continue;
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
    if (RW._snapDirty) RW._buildSnapPoints();
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

    // connect adjacent hot cells (4-connected)
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

  RW._textDirty = true;
  const origBuildSnapPoints = RW._buildSnapPoints;
  RW._buildSnapPoints = function(){ origBuildSnapPoints.apply(RW, arguments); RW._textDirty = true; };

  /* ---------- panel controls ---------- */
  const bar = (document.getElementById('rw-pick') || {}).parentNode;
  if (bar && !document.getElementById('rw-textdetect')){
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

  ['rw-relabel-btn', 'rw-addmode', 'rw-textdetect-group'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  return 'v2.9 up: text-density overlay (detection only, no edits) — "Text? (density)" panel button';
})()

;
// ===== rw_wallspan.js =====
// RW v3.1 — Pipe annotation: a fixed-width path. Click along the centerline
// (multiple points for bends), drag once to measure a fixed width, builds a
// constant-width ribbon. Reads RW.wall only via the Poly2 vertex-snap index,
// for point precision. Double-click finishes a segment and immediately
// starts the next, so a branch can snap onto a previous segment's centerline
// (an end connects at the tip, a mid-span click tees onto the side) — this
// works even before Commit Pipe, and against already-committed pipes too.
// Commit Pipe batches every segment from this session into one action;
// segments connected via snapping merge into one combined polygon (raster
// union + re-trace), unstaged network only.
// Full history: CLAUDE.md.
//
// Load LAST (after rw_textdetect.js, needs v2.9).
//
// Elbow fittings: rw_elbow.js, v3.2, press L.
(function(){
  const RW = window.__RW;
  if (!RW || !RW.v29) return 'need v2.9 (rw_textdetect.js) first';
  if (RW.v31) return 'v3.1 already installed';
  RW.v31 = true;

  const ac = document.getElementById('annotation-canvas');

  /* ---------- state ---------- */
  RW.pipeMode      = false;
  RW._pipePts      = [];     // confirmed path points, normalized [nx,ny] page-space
  RW._pipeWidth    = Math.max(3, Math.round(6 * (RW.W/2592))); // mask px
  RW._pipeAnchor   = 'center'; // 'center'|'edgeA'|'edgeB' — which rail the click represents, frozen per-segment at finish time
  RW._pipeNetwork  = [];      // finished-but-unstaged segments this session: {ptsN, widthPx, anchor, ribbon, links}
  RW._pipePendingLinks = [];  // parallel to RW._pipePts: a RW._pipeNetwork index or null per placed point
  RW._pipeSnapHit  = null;     // side-channel result of the last _tryPipeSnap call
  RW._pipeSnapEnabled = true;
  RW._pipeCommitting  = false; // re-entrancy guard for commitPipe
  RW._pipeMergeRes    = 4;      // local raster px per mask px, for merging connected segments
  RW._pipeMergeBudget = 12_000_000; // local raster px cap
  RW._pipeMergeEpsMaskPx = 1.0; // DP tolerance target, in MASK px (not raster px) — scaled by `scale` at use, so it stays a constant real-world tolerance regardless of merge resolution
  RW._pipeDragHandle = null;  // {segIdx, end:'start'|'end'} while dragging a free network-segment endpoint, else null
  let downPos = null;         // client {x,y} at mousedown
  let dragging = false;
  let dragCurClient = null;   // live end point of an in-progress width-measure drag
  let shiftHeld = false;

  RW._fmtWidth = function(v){
    return (Math.round(v*100)/100).toString();
  };

  /* ---------- geometry: path + width -> closed ribbon polygon ---------- */
  // ptsN: [nx,ny] normalized points, widthPx: mask-px width. Returns {x,y}
  // normalized points or null.
  //
  // Walk one rail forward, the other rail backward, close into one loop.
  // Interior vertices use a scaled-average-perpendicular miter join, falling
  // back to a true bevel (two separate points, one per segment's own
  // perpendicular) past MITER_LIMIT. Every interior vertex pushes exactly 1
  // point to each rail (miter) or 2 to each rail (bevel), so left.length ===
  // right.length always (call it k) and the closed ribbon
  // (left.concat(right.reverse())) always has even length 2k, with
  // midpoint(ribbon[i], ribbon[2k-1-i]) === the original centerline vertex i
  // for every i — this is what RW._pipeCenterlineFromRibbon below relies on.
  //
  // offL/offR (mask-px, offL+offR === widthPx) let each rail sit at a
  // different distance from the clicked path instead of splitting it evenly
  // — offR=0 means the click IS the right rail (an edge-anchor), etc. This
  // does NOT break centerline recovery: midpoint(left[i],right[i]) is always
  // the ribbon's true geometric center regardless of offL/offR, verified
  // directly (including at a miter joint) against RW._pipeCenterlineFromRibbon.
  const MITER_LIMIT = 4;
  function analyticPipeRibbon(ptsN, widthPx, offL, offR){
    if (offL == null || offR == null){ offL = widthPx/2; offR = widthPx/2; }
    const {W,H} = RW;
    const pts = ptsN.map(([nx,ny]) => [nx*W, ny*H]);
    const clean = [pts[0]];
    for (let i=1;i<pts.length;i++){
      const [px,py] = clean[clean.length-1], [x,y] = pts[i];
      if (Math.hypot(x-px, y-py) > 1e-6) clean.push(pts[i]);
    }
    if (clean.length < 2) return null;
    const n = clean.length;

    const perp = [];
    for (let i=0;i<n-1;i++){
      const [x1,y1] = clean[i], [x2,y2] = clean[i+1];
      const dx=x2-x1, dy=y2-y1, len=Math.hypot(dx,dy) || 1e-6;
      perp.push([-dy/len, dx/len]);
    }

    const left = [], right = [];
    left.push([clean[0][0]+perp[0][0]*offL, clean[0][1]+perp[0][1]*offL]);
    right.push([clean[0][0]-perp[0][0]*offR, clean[0][1]-perp[0][1]*offR]);

    for (let i=1;i<n-1;i++){
      const p1 = perp[i-1], p2 = perp[i];
      const [vx,vy] = clean[i];
      let ax = p1[0]+p2[0], ay = p1[1]+p2[1];
      const alen = Math.hypot(ax,ay);
      let bevel = alen < 1e-6;
      let mx=0, my=0;
      if (!bevel){
        ax/=alen; ay/=alen;
        const dot = ax*p2[0] + ay*p2[1];
        const scale = Math.abs(dot) > 1e-6 ? 1/dot : Infinity;
        if (Math.abs(scale) > MITER_LIMIT) bevel = true;
        else { mx = ax*scale; my = ay*scale; }
      }
      if (bevel){
        left.push([vx+p1[0]*offL, vy+p1[1]*offL], [vx+p2[0]*offL, vy+p2[1]*offL]);
        right.push([vx-p1[0]*offR, vy-p1[1]*offR], [vx-p2[0]*offR, vy-p2[1]*offR]);
      } else {
        left.push([vx+mx*offL, vy+my*offL]);
        right.push([vx-mx*offR, vy-my*offR]);
      }
    }

    left.push([clean[n-1][0]+perp[n-2][0]*offL, clean[n-1][1]+perp[n-2][1]*offL]);
    right.push([clean[n-1][0]-perp[n-2][0]*offR, clean[n-1][1]-perp[n-2][1]*offR]);

    const loop = left.concat(right.reverse());
    return loop.map(([x,y]) => ({x:+(x/W).toFixed(6), y:+(y/H).toFixed(6)}));
  }

  // Consecutive-duplicate removal, in mask-px terms.
  RW._pipeDedupe = function(ptsN){
    if (!ptsN || !ptsN.length) return [];
    const {W,H} = RW;
    const clean = [ptsN[0]];
    for (let i=1;i<ptsN.length;i++){
      const [px,py] = clean[clean.length-1], [x,y] = ptsN[i];
      if (Math.hypot((x-px)*W, (y-py)*H) > 1e-6) clean.push(ptsN[i]);
    }
    return clean;
  };

  // anchor: 'center' (default, splits width evenly — today's exact
  // behavior) | 'edgeA' (click = the right rail, full width to the left) |
  // 'edgeB' (click = the left rail, full width to the right). Lets a click
  // trace one visible edge of a thick drawn line instead of its (often
  // unmarked) centerline; RW._pipeCenterlineFromRibbon still recovers the
  // true center from the result with no changes of its own.
  RW._pipeAnchorOffsets = function(widthPx, anchor){
    if (anchor === 'edgeA') return [widthPx, 0];
    if (anchor === 'edgeB') return [0, widthPx];
    return [widthPx/2, widthPx/2];
  };

  RW._pipeRibbon = function(ptsN, widthPx, anchor){
    if (!ptsN || ptsN.length < 2 || !(widthPx > 0)) return null;
    const clean = RW._pipeDedupe(ptsN);
    if (clean.length < 2) return null;
    const [offL, offR] = RW._pipeAnchorOffsets(widthPx, anchor);
    return analyticPipeRibbon(clean, widthPx, offL, offR);
  };

  // Recovers the original centerline from a ribbon polygon built by
  // analyticPipeRibbon: for a ring of even length 2k, midpoint(ring[i],
  // ring[2k-1-i]) is the original centerline vertex i, for every i in
  // 0..k-1. Returns [[nx,ny],...] (length k, deduping any coincident pair)
  // or null if `ring` isn't a valid even-length array of >=4 {x,y} points.
  RW._pipeCenterlineFromRibbon = function(ring){
    if (!Array.isArray(ring) || ring.length < 4 || (ring.length % 2)) return null;
    const k = ring.length / 2;
    const out = [];
    for (let i=0;i<k;i++){
      const a = ring[i], b = ring[ring.length-1-i];
      if (!a || !b || typeof a.x !== 'number' || typeof a.y !== 'number'
          || typeof b.x !== 'number' || typeof b.y !== 'number') return null;
      const p = [(a.x+b.x)/2, (a.y+b.y)/2];
      const q = out[out.length-1];
      if (!q || Math.hypot((p[0]-q[0])*RW.W, (p[1]-q[1])*RW.H) > 1e-6) out.push(p);
    }
    return out.length >= 2 ? out : null;
  };

  /* ---------- sanity check before commit ---------- */
  RW._pipeSanityCheck = function(ptsN, widthPx){
    if (!ptsN || ptsN.length < 2) return 'need at least a start and finish point';
    if (!(widthPx > 0)) return 'width must be greater than 0 — drag across the pipe to measure it';
    return null;
  };

  /* ---------- pipe-to-pipe snapping ---------- */
  RW._pipeCatchPx = function(){
    try { if (RW._snapCatchPx) return RW._snapCatchPx(); } catch(e){}
    return Math.max(4, RW.W/200);
  };

  // Extracts a pipe's three meaningful snap curves from its ribbon — the
  // true centerline and its two edges (rails) — each in the same forward
  // vertex order, so t=0/t=1 on any of the three consistently means "this
  // pipe's real start/end" regardless of which curve a click actually hit.
  // Independent of how the pipe was originally anchored: even a
  // center-anchored pipe has two real edges, and an edge-anchored pipe's
  // true center is still recoverable exactly (see RW._pipeCenterlineFromRibbon).
  // Returns null if the ribbon is invalid.
  RW._pipeRailsFromRibbon = function(ribbon){
    if (!Array.isArray(ribbon) || ribbon.length < 4 || (ribbon.length % 2)) return null;
    const k = ribbon.length / 2;
    const toPts = arr => arr.map(p => [p.x, p.y]);
    const center = RW._pipeCenterlineFromRibbon(ribbon);
    return { center: center, left: toPts(ribbon.slice(0, k)), right: toPts(ribbon.slice(k).reverse()) };
  };

  // Every curve the current point may connect to: for each of this
  // session's finished-but-unstaged segments and every already-committed
  // pipe-tagged annotation (identified by the 'pipe width: ' notes prefix —
  // the only existing marker, same 4-gate discipline every annotation
  // reader in this codebase already uses), offers its centerline AND both
  // edges as separate candidates — a click always snaps to whichever of the
  // three is actually closest, regardless of what anchor the target pipe was
  // originally drawn with (previously, an uncommitted segment only offered
  // its raw clicked curve — its centerline for a center anchor, but an EDGE
  // for an edge anchor — while a committed one always recovered the true
  // center; that inconsistency is what this fixes). Excludes RW._pipePts.
  RW._pipeSnapCandidates = function(){
    const out = [];
    const pushRails = (ribbon, widthPx, src, ref) => {
      const rails = RW._pipeRailsFromRibbon(ribbon);
      if (!rails) return;
      if (rails.center && rails.center.length >= 2) out.push({ptsN:rails.center, widthPx:widthPx, src:src, ref:ref, rail:'center'});
      if (rails.left && rails.left.length >= 2) out.push({ptsN:rails.left, widthPx:widthPx, src:src, ref:ref, rail:'left'});
      if (rails.right && rails.right.length >= 2) out.push({ptsN:rails.right, widthPx:widthPx, src:src, ref:ref, rail:'right'});
    };
    for (let i=0;i<RW._pipeNetwork.length;i++){
      const s = RW._pipeNetwork[i];
      if (s && Array.isArray(s.ribbon)) pushRails(s.ribbon, s.widthPx, 'network', i);
    }
    if (typeof annotationState === 'undefined' || !annotationState || !annotationState.annotations) return out;
    for (const a of annotationState.annotations){
      if (a._hidden || a.is_void) continue;
      const pts = a.coordinates; if (!Array.isArray(pts) || pts.length < 3) continue;
      if (typeof a.notes !== 'string' || a.notes.indexOf('pipe width: ') !== 0) continue;
      const m = /^pipe width:\s*([0-9.]+)/.exec(a.notes);
      const w = m ? parseFloat(m[1]) : NaN;
      pushRails(pts, (isFinite(w) && w>0) ? w : 0, 'annotation', a.id);
    }
    return out;
  };

  // nx,ny normalized. Contract mirrors RW._trySnap: ALWAYS returns [nx,ny];
  // the hit (or null) lands in the RW._pipeSnapHit side channel. Projects
  // onto each candidate's centerline (clamped point-to-segment) — the clamp
  // at t=0/t=1 IS the end-to-end-connection case, no separate code path.
  RW._tryPipeSnap = function(nx, ny){
    RW._pipeSnapHit = null;
    if (!RW._pipeSnapEnabled || RW._snapEnabled === false) return [nx, ny];
    const cands = RW._pipeSnapCandidates();
    if (!cands.length) return [nx, ny];
    const mx = nx*RW.W, my = ny*RW.H;
    const catchPx = RW._pipeCatchPx();
    let best = null;
    for (const c of cands){
      const halfPx = c.widthPx > 0 ? c.widthPx/2 : 0;
      const rad = catchPx + halfPx;
      const last = c.ptsN.length - 2;
      for (let i=0;i<=last;i++){
        const ax = c.ptsN[i][0]*RW.W,   ay = c.ptsN[i][1]*RW.H;
        const bx = c.ptsN[i+1][0]*RW.W, by = c.ptsN[i+1][1]*RW.H;
        const dx = bx-ax, dy = by-ay, len2 = dx*dx + dy*dy;
        if (len2 < 1e-12) continue;
        let t = ((mx-ax)*dx + (my-ay)*dy) / len2;
        if (t < 0) t = 0; else if (t > 1) t = 1;
        const fx = ax + t*dx, fy = ay + t*dy;
        const d = Math.hypot(fx-mx, fy-my);
        if (d > rad) continue;
        const rank = (d <= halfPx) ? 0 : 1; // inside the body beats merely near
        if (!best || rank < best.rank || (rank === best.rank && d < best.dist)){
          // Real click precision almost never lands exactly past a segment's
          // own true endpoint (the old t===0/t===1 clamp test), so an
          // intended end-to-end click routinely came back mid-span. Use a
          // distance tolerance against the true endpoint instead — same
          // catchPx radius the snap itself already uses, no new tunable.
          let te = null;
          if (i === 0 && Math.hypot(mx-ax, my-ay) <= catchPx) te = 'start';
          else if (i === last && Math.hypot(mx-bx, my-by) <= catchPx) te = 'end';
          best = { x:fx, y:fy, nx:fx/RW.W, ny:fy/RW.H, dist:d, rank:rank,
                    inside:(rank===0),
                    atEnd:(te !== null),
                    targetEnd:te, // 'start'|'end'|null — which end of the target this hit, if either
                    src:c.src, ref:c.ref, widthPx:c.widthPx };
        }
      }
    }
    if (!best) return [nx, ny];
    RW._pipeSnapHit = best;
    return [best.nx, best.ny];
  };

  // Dedupes rawPts exactly like RW._pipeDedupe (same 1e-6 mask-px rule against
  // the previously-kept point), while tracking which ORIGINAL index each kept
  // point came from — so a link recorded on a point dedupe later drops (a
  // double-click artifact) still lands on the kept point it collapsed into.
  // `links` is the same flat, deduped array RW._pipeGroups already consumes;
  // linkStart/linkEnd/linkMid are new, additive info for the chain fast path.
  RW._pipeResolveLinks = function(rawPts, pending, netLen){
    const {W,H} = RW;
    const out = { ptsN: [], links: [], linkStart: null, linkEnd: null, linkMid: false };
    if (!Array.isArray(rawPts) || !rawPts.length) return out;
    pending = Array.isArray(pending) ? pending : [];

    const ptsN = [rawPts[0]];
    const keep = [0];
    for (let i=1;i<rawPts.length;i++){
      const [px,py] = ptsN[ptsN.length-1], [x,y] = rawPts[i];
      if (Math.hypot((x-px)*W, (y-py)*H) > 1e-6){ ptsN.push(rawPts[i]); keep.push(i); }
    }
    out.ptsN = ptsN;

    const bucket = new Array(rawPts.length).fill(0);
    for (let i=0, b=0; i<rawPts.length; i++){
      if (b+1 < keep.length && i >= keep[b+1]) b++;
      bucket[i] = b;
    }
    const lastB = ptsN.length - 1;

    const norm = function(l){
      if (Number.isInteger(l)) return {ref:l, targetEnd:null}; // legacy bare integer
      if (l && Number.isInteger(l.ref)){
        const te = (l.targetEnd === 'start' || l.targetEnd === 'end') ? l.targetEnd : null;
        return {ref:l.ref, targetEnd:te};
      }
      return null;
    };
    // an end slot prefers a link that names a target end over a mid-span one
    const pick = function(cur, l){ if (!cur) return l; if (cur.targetEnd) return cur; return l.targetEnd ? l : cur; };

    const seen = new Set();
    for (let i=0;i<pending.length;i++){
      const l = norm(pending[i]);
      if (!l || l.ref < 0 || l.ref >= netLen) continue;
      if (!seen.has(l.ref)){ seen.add(l.ref); out.links.push(l.ref); }
      if (i >= rawPts.length) continue;
      const b = bucket[i];
      if (b === 0)          out.linkStart = pick(out.linkStart, l);
      else if (b === lastB) out.linkEnd   = pick(out.linkEnd,   l);
      else                  out.linkMid   = true;
    }
    return out;
  };

  /* ---------- finishing a path: push into the network, ready for the next ---------- */
  RW._pipeFinishPath = function(){
    if (RW._pipePts.length < 2) return false;
    const info = RW._pipeResolveLinks(RW._pipePts, RW._pipePendingLinks, RW._pipeNetwork.length);
    const ptsN = info.ptsN;
    const ribbon = RW._pipeRibbon(ptsN, RW._pipeWidth, RW._pipeAnchor);
    if (!ribbon || ribbon.length < 4){
      RW._commitStatus('need two distinct points — keep clicking, or Escape to clear');
      return false;
    }
    RW._pipeNetwork.push({
      ptsN: ptsN, widthPx: RW._pipeWidth, anchor: RW._pipeAnchor, ribbon: ribbon,
      links: info.links,         // unchanged contract for RW._pipeGroups
      linkStart: info.linkStart, // {ref,targetEnd}|null — this segment's OWN first point
      linkEnd: info.linkEnd,     // {ref,targetEnd}|null — this segment's OWN last point
      linkMid: info.linkMid      // true if an interior point also carried a link
    });
    RW._pipePts = [];
    RW._pipePendingLinks = [];
    RW._pipeSnapHit = null;
    const n = RW._pipeNetwork.length;
    RW._commitStatus('segment finished · ' + n + ' pending — click to start a branch '
      + '(clicking on or near an existing pipe connects to it), or Commit Pipe to stage all ' + n);
    return true;
  };

  // RW._pipeNetwork is append-only within a session (push or reset to []), so
  // every recorded link index stays valid for the network's lifetime.
  RW._pipeGroups = function(segs){
    const n = segs.length;
    const parent = Array.from({length:n}, (_,i)=>i);
    function find(x){ while (parent[x]!==x){ parent[x]=parent[parent[x]]; x=parent[x]; } return x; }
    function union(a,b){ const ra=find(a), rb=find(b); if (ra!==rb) parent[ra]=rb; }
    for (let i=0;i<n;i++){
      const links = (segs[i] && segs[i].links) || [];
      for (const l of links){
        if (Number.isInteger(l) && l >= 0 && l < n && l !== i) union(i, l);
      }
    }
    const byRoot = new Map();
    for (let i=0;i<n;i++){
      const r = find(i);
      if (!byRoot.has(r)) byRoot.set(r, []);
      byRoot.get(r).push(i);
    }
    const groups = Array.from(byRoot.values());
    groups.forEach(g => g.sort((a,b)=>a-b));
    groups.sort((a,b)=>a[0]-b[0]);
    return groups;
  };

  // 8-connected flood-fill from (x0,y0); returns the reached-pixel count.
  function flood8(mask, w, h, x0, y0){
    const seen = new Uint8Array(w*h);
    const stack = [y0*w + x0];
    seen[y0*w + x0] = 1;
    let count = 0;
    while (stack.length){
      const idx = stack.pop();
      count++;
      const x = idx % w, y = (idx - x) / w;
      for (let dy=-1; dy<=1; dy++){
        for (let dx=-1; dx<=1; dx++){
          if (!dx && !dy) continue;
          const nx = x+dx, ny = y+dy;
          if (nx<0 || ny<0 || nx>=w || ny>=h) continue;
          const nidx = ny*w+nx;
          if (seen[nidx] || !mask[nidx]) continue;
          seen[nidx] = 1;
          stack.push(nidx);
        }
      }
    }
    return count;
  }

  RW._pipeGapSinFloor = 0.3;  // bounds the crossing extension for a near-parallel tee
  RW._pipeGapMarginPx = 2;    // extra mask-px past the crossing point, absorbs DP/raster rounding

  // Nearest-segment local direction (unit vector, mask-px) of ptsN to (mx,my).
  // Pure/testable; null if ptsN has no usable segment.
  RW._pipeNearestDir = function(ptsN, mx, my){
    let best = null, bestD = Infinity;
    for (let i=0;i<ptsN.length-1;i++){
      const ax=ptsN[i][0]*RW.W, ay=ptsN[i][1]*RW.H;
      const bx=ptsN[i+1][0]*RW.W, by=ptsN[i+1][1]*RW.H;
      const dx=bx-ax, dy=by-ay, len=Math.hypot(dx,dy);
      if (len < 1e-9) continue;
      let t = ((mx-ax)*dx+(my-ay)*dy)/(len*len);
      if (t<0) t=0; else if (t>1) t=1;
      const fx=ax+t*dx, fy=ay+t*dy;
      const d = Math.hypot(fx-mx, fy-my);
      if (d < bestD){ bestD=d; best=[dx/len, dy/len]; }
    }
    return best;
  };

  // A segment's own ribbon has a flat cap at each end, perpendicular to ITS
  // OWN direction — fine for a free end, but wrong for a mid-span tee: the
  // cap generally doesn't line up with the TARGET's local direction, so the
  // raster union leaves a wedge-shaped gap between the two shapes right at
  // the join (worse the closer the join sits to the target's own edge rail
  // rather than its centerline — snapping onto an edge is the extreme case).
  // Extends the linked end far enough along the segment's own direction to
  // cross the target's full width even at a shallow approach angle
  // (bounded by RW._pipeGapSinFloor so a near-parallel tee doesn't runaway),
  // then rebuilds a ribbon from that extended point for rasterizing ONLY —
  // seg.ptsN/seg.ribbon themselves are never mutated. Falls back to the
  // segment's own unmodified ribbon whenever the target can't be resolved,
  // or the link isn't a genuine mid-span tee (targetEnd !== null).
  RW._pipeExtendRibbonForMerge = function(seg){
    const ribbon = seg.ribbon;
    if (!Array.isArray(seg.ptsN) || seg.ptsN.length < 2) return ribbon;
    const ends = [];
    if (seg.linkStart && seg.linkStart.targetEnd === null) ends.push('start');
    if (seg.linkEnd && seg.linkEnd.targetEnd === null) ends.push('end');
    if (!ends.length) return ribbon;

    const pts = seg.ptsN.map(p => p.slice());
    let changed = false;
    for (const end of ends){
      const link = end === 'start' ? seg.linkStart : seg.linkEnd;
      const target = RW._pipeNetwork[link.ref];
      if (!target || !Array.isArray(target.ptsN) || target.ptsN.length < 2) continue;
      const idx = end === 'start' ? 0 : pts.length - 1;
      const nbrIdx = end === 'start' ? 1 : pts.length - 2;
      if (nbrIdx < 0 || nbrIdx >= pts.length || nbrIdx === idx) continue;
      const joinX = pts[idx][0]*RW.W, joinY = pts[idx][1]*RW.H;
      const nbrX = pts[nbrIdx][0]*RW.W, nbrY = pts[nbrIdx][1]*RW.H;
      const ownDx = joinX-nbrX, ownDy = joinY-nbrY, ownLen = Math.hypot(ownDx,ownDy);
      if (ownLen < 1e-6) continue;
      const ownDir = [ownDx/ownLen, ownDy/ownLen];
      const tgtDir = RW._pipeNearestDir(target.ptsN, joinX, joinY);
      if (!tgtDir) continue;
      const sinTheta = Math.abs(ownDir[0]*tgtDir[1] - ownDir[1]*tgtDir[0]);
      const targetHalf = (target.widthPx||0)/2;
      const crossDist = targetHalf / Math.max(sinTheta, RW._pipeGapSinFloor);
      const ext = crossDist + RW._pipeGapMarginPx;
      pts[idx] = [(joinX + ownDir[0]*ext)/RW.W, (joinY + ownDir[1]*ext)/RW.H];
      changed = true;
    }
    if (!changed) return ribbon;
    const extended = RW._pipeRibbon(pts, seg.widthPx, seg.anchor);
    return extended || ribbon;
  };

  // Raster-union + re-trace a connected group of RW._pipeNetwork segments into
  // one combined polygon. Returns {poly, meta} or {error, meta}.
  RW._pipeMergeGroup = function(segs){
    const {W,H} = RW;
    let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
    let maxHalf = 0;
    const ribbons = [];
    for (const seg of segs){
      if (!seg || !Array.isArray(seg.ribbon)) return {error:'missing ribbon', meta:{}};
      const ribbon = RW._pipeExtendRibbonForMerge(seg);
      if (!Array.isArray(ribbon)) return {error:'missing ribbon', meta:{}};
      ribbons.push(ribbon);
      maxHalf = Math.max(maxHalf, (seg.widthPx||0)/2);
      for (const p of ribbon){
        const x = p.x*W, y = p.y*H;
        if (!isFinite(x) || !isFinite(y)) return {error:'non-finite point', meta:{}};
        if (x<minX) minX=x; if (x>maxX) maxX=x;
        if (y<minY) minY=y; if (y>maxY) maxY=y;
      }
    }
    if (!(maxX>minX) || !(maxY>minY)) return {error:'degenerate bounding box', meta:{}};

    const rawW = maxX-minX, rawH = maxY-minY;
    const area = rawW*rawH;
    const scale = Math.min(RW._pipeMergeRes, Math.sqrt(RW._pipeMergeBudget / Math.max(1, area)));
    if (!(scale >= 1)) return {error:'network too large to merge', meta:{scale:scale}};
    if (maxHalf*2*scale < 2) return {error:'too thin to merge at this scale', meta:{scale:scale}};

    const pad = Math.max(4, Math.round(4*scale));
    const localW = Math.max(1, Math.round(rawW*scale)) + pad*2;
    const localH = Math.max(1, Math.round(rawH*scale)) + pad*2;
    const mask = new Uint8Array(localW*localH);

    function toLocal(nx, ny){
      return [ (nx*W - minX)*scale + pad, (ny*H - minY)*scale + pad ];
    }
    for (const ribbon of ribbons){
      const localPts = ribbon.map(p => toLocal(p.x, p.y));
      RW._rasterizePolyLocal(localPts, localW, localH, mask);
    }

    let seedIdx = -1, total = 0;
    for (let i=0;i<mask.length;i++){ if (mask[i]){ total++; if (seedIdx<0) seedIdx=i; } }
    if (seedIdx < 0) return {error:'empty raster', meta:{}};
    const seedX = seedIdx % localW, seedY = (seedIdx - seedX) / localW;
    const reached = flood8(mask, localW, localH, seedX, seedY);
    if (reached !== total){
      return {error:'segments do not actually touch after rasterizing', meta:{reached:reached, total:total}};
    }

    // eps must scale WITH the raster's own resolution, not stay flat: it's a
    // local-raster-px tolerance, and higher scale means each raster px is a
    // smaller real-world (mask-px) distance — a flat eps quietly becomes too
    // tight to absorb the raster's own pixel staircase once scale climbs
    // toward RW._pipeMergeRes for a small, tightly-bounded merge, leaving
    // hundreds of leftover staircase vertices in the committed polygon.
    const eps = (RW._pipeMergeEpsMaskPx != null ? RW._pipeMergeEpsMaskPx : 1.0) * scale;
    const poly = RW._maskToPolygon(mask, {
      W: localW, H: localH, seed: {x:seedX, y:seedY}, smoothPasses: 1, eps: eps
    });
    if (!poly || poly.length < 3) return {error:'trace failed', meta:{}};

    const out = poly.map(p => ({
      x: +(((p.x*localW - pad)/scale + minX)/W).toFixed(6),
      y: +(((p.y*localH - pad)/scale + minY)/H).toFixed(6)
    }));
    return { poly: out, meta: { scale:scale, localW:localW, localH:localH, pixels: total } };
  };

  // Pure vector fast path for a connected group that is a SIMPLE end-to-end
  // chain (no mid-span tees, no 3+-way end junction, uniform width) — builds
  // one ribbon via RW._pipeRibbon directly, no rasterizing at all. Returns
  // {poly, meta} or {error, meta}, mirroring RW._pipeMergeGroup's contract.
  // `indices[k]` is the RW._pipeNetwork index of `members[k]`.
  //
  // The walk below picks its start node by DEGREE (a free end-slot), not by
  // draw order or array index, so a segment drawn last but sitting in the
  // MIDDLE of the final path (e.g. draw A, then B off A's end, then go back
  // and draw C off A's other end) still walks correctly — the start is
  // whichever segment happens to have a free slot, and each segment's own
  // point array is reversed whenever it's entered through its `end` slot
  // rather than its `start` slot. A segment linked at both its own ends
  // (bridging two others) falls out of the same loop with no extra code.
  RW._pipeChainMerge = function(members, indices){
    const meta = {method:'chain', count: Array.isArray(members) ? members.length : 0};
    if (!Array.isArray(members) || !Array.isArray(indices)
        || members.length !== indices.length || !members.length)
      return {error:'bad group', meta:meta};

    const pos = new Map();
    for (let k=0;k<indices.length;k++){
      if (!Number.isInteger(indices[k]) || pos.has(indices[k])) return {error:'bad group indices', meta:meta};
      pos.set(indices[k], k);
    }

    const w0 = members[0] && members[0].widthPx;
    if (!(typeof w0 === 'number' && w0 > 0)) return {error:'bad width', meta:meta};
    const wKey = w0.toFixed(2);
    const anchor0 = (members[0] && members[0].anchor) || 'center';
    for (const s of members){
      if (!s || !Array.isArray(s.ptsN) || s.ptsN.length < 2) return {error:'bad member', meta:meta};
      if (!(typeof s.widthPx === 'number' && s.widthPx > 0) || s.widthPx.toFixed(2) !== wKey)
        return {error:'mixed widths', meta:meta};
      // Concatenating segments whose raw ptsN mean different things (one's
      // clicks are a centerline, another's are an edge) into one combined
      // path and building it with a single anchor would be geometrically
      // wrong — the whole group must agree, same shape of gate as width.
      if (((s.anchor) || 'center') !== anchor0) return {error:'mixed anchors', meta:meta};
    }
    meta.widthPx = w0;
    meta.anchor = anchor0;

    // Each segment end is a slot usable at most once; a chain edge only ever
    // connects one segment's own start/end to ANOTHER segment's true start/end.
    const slot  = members.map(()=>({start:-1, end:-1}));
    const edges = [];
    const norm = l => (l && Number.isInteger(l.ref)
                       && (l.targetEnd === 'start' || l.targetEnd === 'end')) ? l : null;

    for (let k=0;k<members.length;k++){
      const s = members[k];
      if (s.linkMid) return {error:'link at an interior vertex', meta:meta};
      const own = [['start', norm(s.linkStart)], ['end', norm(s.linkEnd)]];

      // every plain union-find link must be explained by an end-to-end link,
      // or the group is held together by something concatenation can't represent
      const endRefs = new Set();
      for (const pair of own) if (pair[1]) endRefs.add(pair[1].ref);
      for (const l of (s.links || [])){
        if (!Number.isInteger(l) || l === indices[k]) continue;
        if (!pos.has(l))     return {error:'link outside the group', meta:meta};
        if (!endRefs.has(l)) return {error:'mid-span or interior link', meta:meta};
      }

      for (const pair of own){
        const mySlot = pair[0], L = pair[1];
        if (!L) continue;
        if (!pos.has(L.ref)) return {error:'link outside the group', meta:meta};
        const j = pos.get(L.ref);
        if (j === k) return {error:'self link', meta:meta};
        if (slot[k][mySlot] !== -1 || slot[j][L.targetEnd] !== -1)
          return {error:'3+ segments meet at one end', meta:meta};
        const id = edges.length;
        slot[k][mySlot] = id; slot[j][L.targetEnd] = id;
        edges.push({a:{k:k, slot:mySlot}, b:{k:j, slot:L.targetEnd}});
      }
    }
    meta.edges = edges.length;
    // every node degree <=2 by slot occupancy, so V-1 edges + no revisit == simple path
    if (edges.length !== members.length - 1) return {error:'not a simple path (cycle or split)', meta:meta};

    let startK = -1;
    for (let k=0;k<members.length;k++){
      if ((slot[k].start === -1 ? 0:1) + (slot[k].end === -1 ? 0:1) <= 1){ startK = k; break; }
    }
    if (startK < 0) return {error:'no free end (cycle)', meta:meta};

    const {W,H} = RW;
    const order = [], reversed = [], seen = new Uint8Array(members.length);
    const combined = [];
    let cur = startK, maxJoint = 0;
    let enter = (slot[startK].start === -1) ? 'start' : 'end';
    for (;;){
      if (seen[cur]) return {error:'revisited a segment', meta:meta};
      seen[cur] = 1;
      const rev = (enter === 'end');
      const pts = rev ? members[cur].ptsN.slice().reverse() : members[cur].ptsN;
      order.push(indices[cur]); reversed.push(rev);
      let from = 0;
      if (combined.length){
        const t = combined[combined.length-1], p = pts[0];
        const gap = Math.hypot((p[0]-t[0])*W, (p[1]-t[1])*H);
        if (gap > maxJoint) maxJoint = gap;
        if (gap > Math.max(1, w0)) return {error:'joint geometry does not match the recorded link', meta:meta};
        if (gap <= 1e-6) from = 1; // drop the shared joint point
      }
      for (let i=from;i<pts.length;i++) combined.push(pts[i]);
      const exit = (enter === 'start') ? 'end' : 'start';
      const id = slot[cur][exit];
      if (id === -1) break;
      const e = edges[id];
      const other = (e.a.k === cur && e.a.slot === exit) ? e.b : e.a;
      enter = other.slot; cur = other.k;
    }
    if (order.length !== members.length) return {error:'chain does not cover the group', meta:meta};
    meta.segmentOrder = order; meta.reversed = reversed; meta.jointGapPx = maxJoint; meta.points = combined.length;

    const problem = RW._pipeSanityCheck(combined, w0);
    if (problem) return {error:problem, meta:meta};
    const poly = RW._pipeRibbon(combined, w0, anchor0); // the SAME builder a lone pipe uses
    if (!poly || poly.length < 4) return {error:'ribbon build failed', meta:meta};
    meta.polyPoints = poly.length;
    return {poly:poly, meta:meta};
  };

  // Single dispatch used by BOTH _renderPipeTrace and commitPipe, so Trace can
  // never disagree with Commit. Vector chain first (deterministic, no
  // rasterizing, re-snappable result); raster union otherwise.
  RW._pipeMergeConnected = function(members, indices){
    const chain = RW._pipeChainMerge(members, indices);
    if (chain && chain.poly) return chain;
    const raster = RW._pipeMergeGroup(members);
    const meta = Object.assign({}, (raster && raster.meta) || {}, {
      method: (raster && raster.poly) ? 'raster' : 'none',
      chainError: chain && chain.error
    });
    if (raster && raster.poly) return {poly: raster.poly, meta: meta};
    return {error: (raster && raster.error) || 'merge failed', meta: meta};
  };

  // True if RW._pipeNetwork[segIdx]'s given end ('start'|'end') has no
  // connection at all — neither did this segment link outward from that end,
  // nor does any OTHER segment's linkStart/linkEnd point at this specific
  // segment+end. A link is recorded only on the LATER-drawn segment, so both
  // directions must be checked — the earlier segment has no reciprocal field.
  RW._pipeEndpointIsFree = function(segIdx, end){
    const seg = RW._pipeNetwork[segIdx];
    if (!seg) return false;
    const own = end === 'start' ? seg.linkStart : seg.linkEnd;
    if (own) return false;
    for (let i=0;i<RW._pipeNetwork.length;i++){
      if (i === segIdx) continue;
      const other = RW._pipeNetwork[i];
      if (!other) continue;
      if ((other.linkStart && other.linkStart.ref === segIdx && other.linkStart.targetEnd === end)
          || (other.linkEnd && other.linkEnd.ref === segIdx && other.linkEnd.targetEnd === end))
        return false;
    }
    return true;
  };

  // Hit-tests a free network-segment endpoint against a client point.
  // Container-relative px, mirrors rw_elbow.js's hitTestElbowHandle exactly.
  function hitTestPipeHandle(clientX, clientY){
    const cr = document.getElementById('pdf-container').getBoundingClientRect();
    const mx = clientX - cr.x, my = clientY - cr.y;
    const HIT = 10;
    for (let i=0;i<RW._pipeNetwork.length;i++){
      const seg = RW._pipeNetwork[i];
      if (!seg || !Array.isArray(seg.ptsN) || seg.ptsN.length < 2) continue;
      const ends = [['start', seg.ptsN[0]], ['end', seg.ptsN[seg.ptsN.length-1]]];
      for (const [end, pt] of ends){
        if (!RW._pipeEndpointIsFree(i, end)) continue;
        const [px,py] = RW._toPx(pt[0], pt[1]);
        if (Math.hypot(px-mx, py-my) <= HIT) return { segIdx:i, end:end };
      }
    }
    return null;
  }

  /* ---------- click / drag / finish state machine ---------- */
  let pipeHandleCandidate = null; // hit-test result at mousedown, not yet armed as a real drag
  ac.addEventListener('mousedown', function(e){
    if (!RW.pipeMode) return;
    e.stopPropagation(); e.preventDefault();
    shiftHeld = e.shiftKey;
    // Deliberately NOT armed yet: a plain click here must still fall through
    // to the existing click-to-place/snap-onto-this-same-tip behavior
    // unchanged. Only an actual drag (>5px, checked in mousemove) commits to
    // reshaping this endpoint instead of starting a new branch there.
    pipeHandleCandidate = hitTestPipeHandle(e.clientX, e.clientY);
    downPos = {x:e.clientX, y:e.clientY};
    dragging = false;
    dragCurClient = null;
  }, true);

  ac.addEventListener('mousemove', function(e){
    if (!RW.pipeMode) return;
    e.stopPropagation();
    shiftHeld = e.shiftKey;
    if (RW._pipeDragHandle){
      applyPipeDragPoint(e.clientX, e.clientY);
      RW._renderPipePreview(e.clientX, e.clientY);
      return;
    }
    if (downPos){
      const d = Math.hypot(e.clientX-downPos.x, e.clientY-downPos.y);
      if (d > 5){
        if (pipeHandleCandidate){
          RW._pipeDragHandle = pipeHandleCandidate;
          pipeHandleCandidate = null;
          applyPipeDragPoint(e.clientX, e.clientY); // apply THIS frame's position too, no one-frame lag
          RW._renderPipePreview(e.clientX, e.clientY);
          return;
        }
        dragging = true;
        dragCurClient = {x:e.clientX, y:e.clientY};
        RW._renderPipePreview(e.clientX, e.clientY);
        return;
      }
    }
    RW._renderPipePreview(e.clientX, e.clientY);
  }, true);

  // Moves the currently-armed drag handle's endpoint to (clientX,clientY),
  // rebuilding that segment's ribbon. Refuses (leaves the point untouched)
  // if the result would collapse the segment onto its own neighbor point.
  function applyPipeDragPoint(clientX, clientY){
    const { segIdx, end } = RW._pipeDragHandle;
    const seg = RW._pipeNetwork[segIdx];
    if (!seg) return;
    const n = RW._toNorm(clientX, clientY);
    const idx = end === 'start' ? 0 : seg.ptsN.length - 1;
    const neighborIdx = end === 'start' ? 1 : seg.ptsN.length - 2;
    const neighbor = seg.ptsN[neighborIdx];
    const distPx = Math.hypot((n[0]-neighbor[0])*RW.W, (n[1]-neighbor[1])*RW.H);
    if (distPx > 1){ // refuse to collapse the segment onto its neighbor point
      seg.ptsN[idx] = n;
      seg.ribbon = RW._pipeRibbon(seg.ptsN, seg.widthPx, seg.anchor);
    }
  }

  ac.addEventListener('mouseup', function(e){
    if (!RW.pipeMode) return;
    e.stopPropagation(); e.preventDefault();
    shiftHeld = e.shiftKey;
    pipeHandleCandidate = null;
    if (RW._pipeDragHandle){
      RW._pipeDragHandle = null;
      downPos = null;
      RW._renderPipePreview(e.clientX, e.clientY);
      return;
    }
    const d = downPos; downPos = null;
    if (!d) return;
    const dist = Math.hypot(e.clientX-d.x, e.clientY-d.y);
    if (dragging || dist > 5){
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
    let [nx,ny] = RW._toNorm(e.clientX, e.clientY);
    if (!e.shiftKey){
      const p = RW._tryPipeSnap(nx, ny);
      // Pipe mode snaps to PIPES ONLY — this session's _pipeNetwork segments and
      // already-committed pipe annotations (_tryPipeSnap's full candidate set).
      // _trySnap still runs, unconditionally, but purely so RW._lastSnapHit stays
      // fresh for Poly2's own preview marker after a tool switch — its result is
      // never used to choose where the pipe point lands.
      if (RW._trySnap) RW._trySnap(nx, ny);
      if (RW._pipeSnapHit){ nx = p[0]; ny = p[1]; }
    } else {
      RW._pipeSnapHit = null;
    }
    let link = null;
    if (!e.shiftKey && RW._pipeSnapHit && RW._pipeSnapHit.src === 'network'
        && Number.isInteger(RW._pipeSnapHit.ref)
        && RW._pipeSnapHit.ref >= 0 && RW._pipeSnapHit.ref < RW._pipeNetwork.length){
      link = { ref: RW._pipeSnapHit.ref, targetEnd: RW._pipeSnapHit.targetEnd || null };
    }
    RW._pipePts.push([nx,ny]);
    RW._pipePendingLinks.push(link);
    RW._renderPipePreview(e.clientX, e.clientY);
    RW._syncPipeBtns();
  }, true);

  ac.addEventListener('dblclick', function(e){
    if (!RW.pipeMode) return;
    e.stopPropagation(); e.preventDefault();
    RW._pipeFinishPath();
    RW._renderPipePreview(e.clientX, e.clientY);
    RW._syncPipeBtns();
  }, true);

  ac.addEventListener('click', function(e){
    if (RW.pipeMode){ e.stopPropagation(); e.preventDefault(); }
  }, true);

  window.addEventListener('keydown', function(e){
    const t = e.target;
    if (t && (t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable)) return;
    if (!RW.pipeMode) return;
    if (e.key==='Escape'){
      e.preventDefault(); e.stopImmediatePropagation();
      if (RW._pipePts.length){
        RW._pipePts = []; RW._pipePendingLinks = []; RW._pipeSnapHit = null;
        RW._renderPipePreview(null, null);
        RW._commitStatus(RW._pipeNetwork.length
          ? ('cleared the in-progress path — ' + RW._pipeNetwork.length + ' finished segment'
             + (RW._pipeNetwork.length===1?'':'s') + ' still pending')
          : '');
        RW._syncPipeBtns();
      } else if (RW._pipeNetwork.length){
        const n = RW._pipeNetwork.length;
        RW._pipeNetwork = []; RW._pipeSnapHit = null;
        RW._renderPipePreview(null, null);
        RW._commitStatus('discarded ' + n + ' unstaged pipe segment' + (n===1?'':'s'));
        RW._syncPipeBtns();
      } else {
        RW.setPipeMode(false);
      }
    }
    if (e.key==='Backspace'){
      e.preventDefault(); e.stopImmediatePropagation();
      if (RW._pipePts.length){ RW._pipePts.pop(); RW._pipePendingLinks.pop(); }
      RW._renderPipePreview(null, null);
    }
  }, true);

  /* ---------- preview rendering ---------- */
  function polyPx(ribbon){
    return ribbon.map(p => { const [px,py]=RW._toPx(p.x,p.y); return px+','+py; }).join(' ');
  }
  function linePx(ptsN){
    return ptsN.map(([nx,ny]) => { const [px,py]=RW._toPx(nx,ny); return px+','+py; }).join(' ');
  }
  // Live width-measure dimension line: main line + perpendicular end ticks
  // (any drag angle) + a labeled backdrop centered on the offset midpoint.
  // Coordinates must already be container-relative (RW._toPx output), like
  // every other element this preview draws.
  function dimensionLineSvg(x1,y1,x2,y2,label){
    const dx = x2-x1, dy = y2-y1;
    const len = Math.hypot(dx,dy) || 1;
    const ux = dx/len, uy = dy/len;
    let px = -uy, py = ux; // unit normal
    if (py > 0){ px = -px; py = -py; } // keep the label above the line regardless of drag direction
    const TICK=7, OFF=15, FS=12, CHW=7, PADX=8, BH=18;
    let s = '<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2
      + '" stroke="#ff8c00" stroke-width="2" stroke-dasharray="4,3"/>';
    s += '<line x1="'+(x1-px*TICK)+'" y1="'+(y1-py*TICK)+'" x2="'+(x1+px*TICK)+'" y2="'+(y1+py*TICK)
      + '" stroke="#ff8c00" stroke-width="2"/>';
    s += '<line x1="'+(x2-px*TICK)+'" y1="'+(y2-py*TICK)+'" x2="'+(x2+px*TICK)+'" y2="'+(y2+py*TICK)
      + '" stroke="#ff8c00" stroke-width="2"/>';
    const bw = label.length*CHW + PADX*2;
    const lx = (x1+x2)/2 + px*OFF, ly = (y1+y2)/2 + py*OFF;
    s += '<rect x="'+(lx-bw/2)+'" y="'+(ly-BH/2)+'" width="'+bw+'" height="'+BH
      + '" rx="4" ry="4" fill="rgba(20,20,20,0.85)"/>';
    s += '<text x="'+lx+'" y="'+ly+'" fill="#ffffff" font-size="'+FS
      + '" font-family="sans-serif" text-anchor="middle" dominant-baseline="central">' + label + '</text>';
    return s;
  }
  RW._pipeDimensionLineSvg = dimensionLineSvg; // exposed for direct Node-testability, same convention as RW._pipeRibbon
  function pipeMarkerSvg(hit){
    const [px,py] = RW._toPx(hit.nx, hit.ny);
    let s = '<circle cx="'+px+'" cy="'+py+'" r="7" fill="none" stroke="#ffffff" stroke-width="2.5"'
      + (hit.inside ? '' : ' stroke-dasharray="3,2"') + '/>';
    s += '<circle cx="'+px+'" cy="'+py+'" r="7" fill="none" stroke="#ff2d95" stroke-width="1.25"'
      + (hit.inside ? '' : ' stroke-dasharray="3,2"') + '/>';
    if (hit.atEnd){
      s += '<line x1="'+(px-5)+'" y1="'+py+'" x2="'+(px+5)+'" y2="'+py+'" stroke="#ff2d95" stroke-width="1.5"/>';
      s += '<line x1="'+px+'" y1="'+(py-5)+'" x2="'+px+'" y2="'+(py+5)+'" stroke="#ff2d95" stroke-width="1.5"/>';
    } else {
      s += '<circle cx="'+px+'" cy="'+py+'" r="2.5" fill="#ff2d95"/>';
    }
    return s;
  }

  RW._renderPipePreview = function(clientX, clientY){
    const old = document.getElementById('rw-pipe-preview'); if (old) old.remove();
    if (!RW.pipeMode) return;
    const parts = [];
    let status = null;

    for (let i=0;i<RW._pipeNetwork.length;i++){
      const seg = RW._pipeNetwork[i];
      parts.push('<polygon points="'+ polyPx(seg.ribbon) +'" fill="rgba(255,140,0,0.16)" '
        + 'stroke="#ff8c00" stroke-width="1" stroke-opacity="0.85"/>');
      parts.push('<polyline points="'+ linePx(seg.ptsN) +'" fill="none" stroke="#ff8c00" '
        + 'stroke-width="1" stroke-opacity="0.45" stroke-dasharray="2,4"/>');
      // A handle only at genuinely free (unconnected) endpoints — communicates
      // which ends are draggable, mirroring rw_elbow.js's own handle style.
      if (Array.isArray(seg.ptsN) && seg.ptsN.length >= 2){
        const ends = [['start', seg.ptsN[0]], ['end', seg.ptsN[seg.ptsN.length-1]]];
        for (const [end, pt] of ends){
          if (!RW._pipeEndpointIsFree(i, end)) continue;
          const [px,py] = RW._toPx(pt[0], pt[1]);
          parts.push('<circle cx="'+px+'" cy="'+py+'" r="5" fill="#fff" stroke="#ff8c00" stroke-width="2"/>');
        }
      }
    }

    if (dragging && dragCurClient && downPos){
      RW._pipeSnapHit = null; // clear a stale marker from before the drag started
      const [ax,ay] = RW._toNorm(downPos.x, downPos.y), [bx,by] = RW._toNorm(dragCurClient.x, dragCurClient.y);
      const liveW = Math.hypot((bx-ax)*RW.W, (by-ay)*RW.H);
      // Container-relative, matching every other element in this SVG — raw
      // clientX/clientY would be offset by #pdf-container's own left/top.
      const [x1,y1] = RW._toPx(ax,ay), [x2,y2] = RW._toPx(bx,by);
      parts.push(dimensionLineSvg(x1,y1,x2,y2, RW._fmtWidth(liveW) + ' px'));
      status = 'width: ' + RW._fmtWidth(liveW) + 'px (release to set)';
    } else {
      const pts = RW._pipePts.slice();
      if (clientX != null){
        let [cnx,cny] = RW._toNorm(clientX, clientY);
        if (!shiftHeld){ const p = RW._tryPipeSnap(cnx,cny); cnx=p[0]; cny=p[1]; }
        else RW._pipeSnapHit = null;
        if (pts.length) pts.push([cnx,cny]);
      }
      if (pts.length < 2){
        if (pts.length===1){
          const [px,py] = RW._toPx(pts[0][0], pts[0][1]);
          parts.push('<circle cx="'+px+'" cy="'+py+'" r="4" fill="#ff8c00"/>');
        }
      } else {
        const ribbon = RW._pipeRibbon(pts, RW._pipeWidth, RW._pipeAnchor);
        if (ribbon){
          parts.push('<polygon points="'+polyPx(ribbon)+'" fill="rgba(255,140,0,0.22)" stroke="#ff8c00" stroke-width="1.5"/>');
          parts.push('<polyline points="'+linePx(pts)+'" fill="none" stroke="#ff8c00" stroke-width="1" stroke-dasharray="3,3"/>');
        }
      }
      const n = RW._pipeNetwork.length;
      const groupCount = n ? RW._pipeGroups(RW._pipeNetwork).length : 0;
      const pendingNote = n ? (' · ' + n + ' pending' + (groupCount !== n ? (' (' + groupCount + ' connected)') : '')) : '';
      const snapNote = RW._pipeSnapHit ? (RW._pipeSnapHit.atEnd ? ' · connects to pipe end' : ' · tees onto a pipe') : '';
      status = 'pipe: ' + RW._pipePts.length + ' point' + (RW._pipePts.length===1?'':'s')
        + ' · width ' + RW._fmtWidth(RW._pipeWidth) + 'px' + pendingNote + snapNote
        + ' · double-click to finish';
    }

    if (RW._pipeSnapHit) parts.push(pipeMarkerSvg(RW._pipeSnapHit));

    if (!parts.length){ if (status != null) RW._commitStatus(status); return; }
    const svg = RW._mkSvg('rw-pipe-preview', 71);
    svg.innerHTML = parts.join('');
    if (status != null) RW._commitStatus(status);
  };

  RW._renderPipeTrace = function(){
    if (!RW._pipeNetwork.length){
      RW._commitStatus('finish a path first (double-click), then Trace');
      return;
    }
    const old = document.getElementById('rw-pipe-preview'); if (old) old.remove();
    const svg = RW._mkSvg('rw-pipe-preview', 76);
    const groups = RW._pipeGroups(RW._pipeNetwork);
    let inner = '', totalPts = 0, merged = 0;
    for (const g of groups){
      let mergedOk = false;
      if (g.length > 1){
        const res = RW._pipeMergeConnected(g.map(i => RW._pipeNetwork[i]), g);
        if (res.poly){
          inner += '<polygon points="'+polyPx(res.poly)+'" fill="rgba(255,140,0,0.28)" stroke="#ff8c00" stroke-width="2"/>';
          totalPts += res.poly.length; merged++; mergedOk = true;
        }
      }
      if (!mergedOk){
        for (const i of g){
          const seg = RW._pipeNetwork[i];
          if (!seg.ribbon) continue;
          inner += '<polygon points="'+polyPx(seg.ribbon)+'" fill="rgba(255,140,0,0.28)" stroke="#ff8c00" stroke-width="2"/>';
          totalPts += seg.ribbon.length;
        }
      }
    }
    svg.innerHTML = inner;
    const n = RW._pipeNetwork.length;
    const outCount = groups.length;
    RW._commitStatus('traced ' + n + ' segment' + (n===1?'':'s')
      + (merged ? (' → ' + outCount + ' polygon' + (outCount===1?'':'s') + ' (' + merged + ' merged)') : '')
      + ', ' + totalPts + ' pts total — Commit Pipe to stage all ' + outCount);
  };

  RW.commitPipe = async function(){
    if (RW._pipeCommitting) return;
    if (!annotationState.currentTag){
      RW._commitStatus('no active tag — press a tag number first'); return;
    }
    const segs = RW._pipeNetwork.slice();
    if (!segs.length){
      RW._commitStatus('nothing to commit — double-click to finish a path first'); return;
    }
    RW._pipeCommitting = true; RW._syncPipeBtns();
    try {
      const total = segs.length;
      let done = 0, failed = 0, totalPts = 0, merged = 0;
      const created = [];
      RW._commitStatus('committing 0/'+total+' — tag: '+annotationState.currentTag.name);
      const groups = RW._pipeGroups(segs);
      for (const g of groups){
        const members = g.map(i => segs[i]);
        let mergedOk = false;
        if (members.length > 1){
          const res = RW._pipeMergeConnected(members, g);
          if (res.poly){
            let notes;
            if (res.meta && res.meta.method === 'chain'){
              // Same analyticPipeRibbon a lone pipe uses, so this stays a
              // first-class, re-snappable pipe — ordinary prefix, not 'pipe run:'.
              notes = 'pipe width: ' + res.meta.widthPx.toFixed(2) + ' px — '
                + members.length + ' segments joined';
            } else {
              const widths = Array.from(new Set(members.map(s => +s.widthPx.toFixed(2)))).sort((a,b)=>a-b);
              notes = 'pipe run: ' + members.length + ' segments merged, widths '
                + widths.join(', ') + ' px — branched outline, centerline not recoverable';
            }
            created.push(RW._createPendingAnnotation(res.poly, notes));
            totalPts += res.poly.length;
            done += members.length; merged++; mergedOk = true;
            RW._commitStatus('staged '+done+'/'+total+' (failed: '+failed+')');
          }
        }
        if (!mergedOk){
          for (const seg of members){
            const problem = RW._pipeSanityCheck(seg.ptsN, seg.widthPx);
            const ribbon = problem ? null : (seg.ribbon || RW._pipeRibbon(seg.ptsN, seg.widthPx, seg.anchor));
            if (!ribbon || ribbon.length < 4){
              failed++;
              RW._commitStatus('staged '+done+'/'+total+' (failed: '+failed+')');
              continue;
            }
            created.push(RW._createPendingAnnotation(ribbon, 'pipe width: ' + seg.widthPx.toFixed(2) + ' px'));
            totalPts += ribbon.length; done++;
            RW._commitStatus('staged '+done+'/'+total+' (failed: '+failed+')');
          }
        }
      }
      if (!done){
        RW._commitStatus('refused: no segment could be turned into a ribbon');
        return;
      }
      RW._commitStatus('staged '+done+', rendering...');
      await RW._forceRender();
      RW._lastCommit = created;
      RW._pipeNetwork = [];
      RW._pipePendingLinks = Array(RW._pipePts.length).fill(null);
      RW._renderPipePreview(null, null);
      RW._commitStatus(merged
        ? ('staged ' + created.length + ' pipe annotation' + (created.length===1?'':'s')
           + ' from ' + done + ' segment' + (done===1?'':'s') + ' (' + merged + ' merged)'
           + ' (' + totalPts + ' pts total)' + (failed ? (' — ' + failed + ' failed') : '')
           + ' — review and Save. To remove one before Save, select it in the app and press Delete.'
           + ' Got an elbow fitting to mark? Press L.')
        : ('staged ' + done + ' pipe segment' + (done===1?'':'s')
           + ' (' + totalPts + ' pts total)' + (failed ? (' — ' + failed + ' failed') : '')
           + ' — review and Save. To remove one before Save, select it in the app and press Delete.'
           + ' Got an elbow fitting to mark? Press L.'));
    } finally {
      RW._pipeCommitting = false; RW._syncPipeBtns();
    }
  };

  RW.clearPipe = function(opts){
    const lost = RW._pipeNetwork.length;
    RW._pipePts = [];
    RW._pipePendingLinks = [];
    RW._pipeNetwork = [];
    RW._pipeSnapHit = null;
    RW._pipeDragHandle = null;
    const old = document.getElementById('rw-pipe-preview'); if (old) old.remove();
    if (!opts || !opts.keepStatus){
      RW._commitStatus(lost ? ('discarded ' + lost + ' unstaged pipe segment' + (lost===1?'':'s')) : '');
    }
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
    b.title = 'Click points along a pipe\'s centerline (double-click to finish); drag anywhere to measure a fixed width off the drawing. Double-click finishes a segment and immediately starts the next — click on or near an existing pipe (white/magenta ring) to connect to it: a cross means end-to-end, a dot means a tee onto its side. Shift bypasses snapping. Escape: clear the path -> discard pending segments -> exit.';
    b.style.cssText = 'font-size:11px;padding:2px 6px;';
    b.innerText = 'Pipe';
    b.onclick = () => RW.setPipeMode(!RW.pipeMode);
    group.appendChild(b);

    const traceBtn = document.createElement('button');
    traceBtn.id = 'rw-pipe-trace';
    traceBtn.title = 'Preview the exact polygons that would be committed — connected segments show as one merged outline.';
    traceBtn.style.cssText = 'font-size:11px;padding:2px 6px;';
    traceBtn.innerText = 'Trace';
    traceBtn.onclick = () => RW._renderPipeTrace();
    group.appendChild(traceBtn);

    const commitBtn = document.createElement('button');
    commitBtn.id = 'rw-pipe-commit';
    commitBtn.title = 'Stage every finished segment from this drawing session as pending polygon annotations, in one batch — segments connected by snapping merge into one combined polygon. The path you\'re still drawing is not affected.';
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
    widthInp.title = 'Ribbon width in mask px. Set by dragging across the pipe in the drawing, or type a value directly. Applies to the path you\'re drawing now; each finished segment keeps the width it had when you finished it, so branches can be a different diameter.';
    widthInp.style.cssText = 'font-size:11px;padding:1px 4px;width:44px;text-align:right;';
    widthInp.onchange = function(){
      const v = parseFloat(widthInp.value);
      if (isNaN(v) || v<=0) return;
      RW._pipeWidth = v;
      RW._renderPipePreview(null, null);
    };
    group.appendChild(widthInp);

    const anchorBtn = document.createElement('button');
    anchorBtn.id = 'rw-pipe-anchor';
    anchorBtn.style.cssText = 'font-size:11px;padding:2px 6px;';
    RW._syncPipeAnchorBtn = function(){
      const label = RW._pipeAnchor === 'edgeA' ? 'Edge A' : RW._pipeAnchor === 'edgeB' ? 'Edge B' : 'Center';
      anchorBtn.innerText = 'Anchor: ' + label;
      anchorBtn.title = 'What your click represents: Center splits the width evenly to each side '
        + '(today\'s default). Edge A/Edge B put the click on one rail instead, with the full width '
        + 'to the other side — useful for tracing along one visible edge of a thick line instead of '
        + 'its (often unmarked) centerline. Which side is "A" vs "B" depends on your click direction, '
        + 'not absolute screen position. Applies to the path you\'re drawing now; each finished '
        + 'segment keeps the anchor it had when finished.';
    };
    anchorBtn.onclick = function(){
      RW._pipeAnchor = RW._pipeAnchor === 'center' ? 'edgeA' : RW._pipeAnchor === 'edgeA' ? 'edgeB' : 'center';
      RW._syncPipeAnchorBtn();
      RW._renderPipePreview(null, null);
    };
    RW._syncPipeAnchorBtn();
    group.appendChild(anchorBtn);

    bar.appendChild(group);
  }

  RW._syncPipeBtns = function(){
    const n = RW._pipeNetwork.length;
    const b = document.getElementById('rw-pipe');
    if (b) b.style.background = RW.pipeMode ? 'rgba(255,140,0,0.35)' : '';
    const t = document.getElementById('rw-pipe-trace');
    if (t) t.disabled = !n;
    const c = document.getElementById('rw-pipe-commit');
    if (c){
      c.disabled = !n || !!RW._pipeCommitting;
      const groupCount = n ? RW._pipeGroups(RW._pipeNetwork).length : 0;
      c.innerText = groupCount > 1 ? ('Commit ' + groupCount + ' Pipes') : 'Commit Pipe';
    }
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

  return 'v3.1 up: Pipe annotation — click a path (double-click to finish, branches connect to existing pipes), drag to measure width, Trace/Commit Pipe';
})()

;
// ===== rw_panelsections.js =====
// RW vsec — panel reorganization: labelled sections instead of one long
// wrapping row. Post-load reflow: modules keep appending to the original
// anonymous button-bar; this module moves controls by id into labelled
// sections afterward.
//
// Load AFTER every tool module and BEFORE rw_elbow.js.
(function(){
  const RW = window.__RW;
  if (!RW || !RW.v31) return 'need v3.1 (rw_wallspan.js) first';
  if (RW.vsec) return 'panel sections already installed';
  RW.vsec = true;

  RW.ui = {
    BTN: 'font-size:11px;padding:2px 6px;',
    NUM: 'font-size:11px;padding:1px 4px;width:44px;text-align:right;',
    LBL: 'font-size:10px;opacity:0.7;margin-left:4px;',
    ACCENT: 'background:rgba(255,140,0,0.25);',
  };

  const list = document.getElementById('rw-list');
  const host = list && list.parentNode; // #rw-panel now, or #rw-body if retrofit already ran
  if (!host){ return 'panel sections: #rw-list not found, skipping'; }

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

  // Pre-create every section in display order.
  const REGIONS  = RW.panelSection('regions',  'REGIONS');
  const MASK     = RW.panelSection('mask',     'MASK TOOLS');
  const HEAL     = RW.panelSection('heal',     'HEAL');
  const PIPE     = RW.panelSection('pipe',     'PIPE');
  const FITTINGS = RW.panelSection('fittings', 'FITTINGS');
  const VIEW     = RW.panelSection('view',     'VIEW');

  // id -> destination section.
  const moves = [
    [REGIONS, ['rw-pick','rw-merge','rw-cut','rw-commit','rw-refresh','rw-undo']],
    [MASK,    ['rw-rect','rw-poly2','rw-brush','rw-snap','rw-relabel-inp','rw-relabel-btn','rw-addmode']],
    [HEAL,    ['rw-heal-group','rw-healbrush-btn']],
    [PIPE,    ['rw-pipe-group']],
    [VIEW,    ['rw-walls','rw-hide','rw-textdetect-group']],
  ];

  // Label for the area-floor input.
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

  // Set flex/gap on group-wrapper spans, preserving display:none if already hidden.
  ['rw-pipe-group','rw-textdetect-group'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const alreadyHidden = el.style.display === 'none';
    el.style.display = alreadyHidden ? 'none' : 'inline-flex';
    el.style.gap = '4px';
    el.style.alignItems = 'center';
  });

  if (legacyBar){
    if (legacyBar.children.length){
      console.warn('[RW] unmapped panel controls left in the legacy bar:',
        Array.from(legacyBar.children).map(c => c.id || c.tagName));
    } else {
      legacyBar.remove();
    }
  }

  // Hide any section with zero children, deferred via setTimeout(0).
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
// close a tighter polygon region) around a pipe fitting and trace the real
// linework inside it into a polygon. Color-pick + tolerance control what
// counts as ink; the single largest connected piece inside the box/region is
// selected, traced pixel-exactly (RW._traceGridBoundary), then diagonal/
// curved staircase runs are collapsed via RW._simplifyRing.
//
// Full design history: CLAUDE.md.
//
// Load LAST (after rw_panelsections.js, needs v31). Depends on:
//   - RW.wall / RW.extract (rw_install.js).
//   - RW._buildAnnotationMask (rw_textdetect.js).
//   - RW._traceGridBoundary, RW._dpOpen/_simplifyRing/_bisectRingToTargetPts,
//     RW._createPendingAnnotation, RW._forceRender, RW._commitStatus (rw_commit.js).
//   - RW._toNorm/_toPx/_mkSvg (rw_stable.js).
//   - RW.panelSection (rw_panelsections.js) — optional.
(function(){
  const RW = window.__RW;
  if (!RW || !RW.v31) return 'need v3.1 (rw_wallspan.js) first';
  if (RW.v32) return 'v3.2 already installed';
  RW.v32 = true;

  const ac = document.getElementById('annotation-canvas');

  /* ---------- state ---------- */
  RW.elbowMode      = false;
  RW._elbowBoxN     = null;   // detection box {x0,y0,x1,y1}, normalized, min/max-ordered
  RW._elbowRegionN  = null;   // committed polygon region, normalized [[x,y],...], or null
  RW._elbowRegionWip = null;  // in-progress polygon vertices, normalized [[x,y],...]
  RW._elbowPoly     = null;   // detected polygon, normalized [{x,y}], or null
  RW._elbowRaster   = null;   // {localW,localH,pad,scale,gx0,gy0, src,selected}
  RW._elbowMeta     = null;   // {totalComps,candidateComps,keptPx,srcPx,coverage,source,capFallback}
  RW._elbowMinArea  = 1;
  RW._elbowSubAnn   = true;
  RW._elbowRes      = 100;
  RW._elbowTargetPts = 24;    // 0 = auto
  RW._elbowPxState  = 0;      // 0 off, 1 source, 2 selected
  RW._elbowPicking     = false;
  RW._elbowTargetColor = null;  // {r,g,b} once picked
  RW._elbowColorTol    = 100;
  RW._elbowDragHandle  = null;  // {type:'box', anchor:[nx,ny]} or {type:'region', index}

  let downClient  = null;   // client {x,y} at mousedown, for the click-vs-drag threshold
  let dragStartN  = null;   // normalized start corner of the in-progress box drag
  let dragging    = false;
  let elbowRerunTimer = null;
  // 250ms-debounced re-detect, shared by panel tunables and handle-dragging.
  function scheduleElbowRerun(){
    clearTimeout(elbowRerunTimer);
    elbowRerunTimer = setTimeout(() => { if (RW._elbowBoxN) RW._runElbowDetect(); }, 250);
  }

  // Hit-tests an existing box corner or region vertex against a client point. Container-relative px.
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

  // Segment-intersection test (orientation-based).
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

  // Pixel color-match decision. No color picked -> flat darkness threshold; once picked, replaces it.
  RW._elbowColorMatch = function(r, g, b){
    const tc = RW._elbowTargetColor;
    if (!tc) return Math.min(r,g,b) < 200;
    const tol = RW._elbowColorTol != null ? RW._elbowColorTol : 40;
    const dr=r-tc.r, dg=g-tc.g, db=b-tc.b;
    return Math.sqrt(dr*dr+dg*dg+db*db) < tol;
  };

  // width -> {minArea} seed formula.
  RW._elbowSeedFromWidth = function(width){
    return { minArea: Math.max(1, Math.round(2.5 * width * width)) };
  };

  /* ---------- raster acquisition: two sources, tried in order ---------- */

  // Eyedropper: sample #pdf-canvas's pixel color at a normalized page point.
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

  // Sample #pdf-canvas directly at `res` x the current mask resolution.
  // Returns null (falls through to the RW.wall crop) if the canvas is
  // unavailable, throws, or the sampled region comes back entirely blank.
  RW._elbowAcquireRaster = function(geom){
    try {
      const src = document.getElementById('pdf-canvas');
      if (!src || typeof src.getContext !== 'function') return null;
      const cv = document.createElement('canvas');
      cv.width = geom.localW; cv.height = geom.localH;
      const ctx = cv.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, geom.localW, geom.localH);
      const dw = geom.rawW*geom.scale, dh = geom.rawH*geom.scale;
      // geom.* are RW.W-space; pdf-canvas's native backing store can be a
      // different resolution — scale through nativeScale.
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
      if (!srcPx) return null;
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
      return null;
    }
  };

  // Fallback: crop the existing page-wide RW.wall mask, filling each source
  // pixel's full scale x scale destination footprint.
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
     Function of a raster + tunables only. Returns {poly, stages, meta} or {error}. */
  RW._elbowProcessRaster = function(raster, opts){
    const { localW, localH } = raster;
    let src = raster.data;
    // Clip to the region polygon if active, otherwise the box interior.
    let clipMask;
    if (opts.regionLocalPts){
      clipMask = RW._rasterizePolyLocal(opts.regionLocalPts, localW, localH);
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

    const { labels, comps } = labelComponents(src, localW, localH, cx, cy);
    if (!comps.length) return { error: 'no connected shape found inside the box — try picking a color, or raising "tol"' };
    const candidates = comps.filter(c => c.size >= minAreaLocal);
    if (!candidates.length){
      return { error: 'only noise-sized pieces found inside the box — lower "min px"' };
    }
    candidates.sort((a,b) => b.size - a.size);
    const keep = candidates[0];

    const selected = new Uint8Array(localW*localH);
    for (let i=0;i<selected.length;i++) if (labels[i]===keep.id) selected[i]=1;

    let traced = RW._traceGridBoundary(selected, { W:localW, H:localH });
    if (!traced) return { error: 'trace failed — try adjusting the box, the color, or "tol"' };
    const rawAreaPx = shoelaceAreaPx(traced, localW, localH);
    if (rawAreaPx < 4) return { error: 'traced shape is too small (likely noise) — try a bigger box or raise "min px"' };

    let capFallback = false;
    const targetPts = opts.targetPts != null && opts.targetPts > 0 ? Math.max(5, Math.round(opts.targetPts)) : 0;
    const ring = traced.map(p => [p.x*localW, p.y*localH]);
    const simplifiedRing = targetPts
      ? RW._bisectRingToTargetPts(ring, targetPts, null)
      : RW._simplifyRing(ring, 0.8, null);
    if (isSimplePolygon(simplifiedRing)){
      traced = simplifiedRing.map(([x,y]) => ({ x:+(x/localW).toFixed(6), y:+(y/localH).toFixed(6) }));
    } else {
      capFallback = true;
    }
    if (traced.length < 3) return { error: 'traced shape has too few points' };

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
    result.meta.coverage = regionAreaPx != null
      ? (regionAreaPx>0 ? polyAreaPx/regionAreaPx : 0)
      : (boxAreaPx>0 ? polyAreaPx/boxAreaPx : 0);
    return result;
  };

  /* ---------- sanity check: refuses on structurally-broken results, warns on high coverage ---------- */
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

  /* ---------- interaction: drag a box, or click points + double-click to close a region ---------- */
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
      [[b.x0,b.y0],[b.x1,b.y0],[b.x1,b.y1],[b.x0,b.y1]].forEach(([nx,ny])=>{
        const [px,py] = RW._toPx(nx,ny);
        html += '<circle cx="'+px+'" cy="'+py+'" r="5" fill="#fff" stroke="#ff8c00" stroke-width="2"/>';
      });
    }
    if (RW._elbowRegionN){
      const pts = RW._elbowRegionN.map(([nx,ny]) => { const [px,py]=RW._toPx(nx,ny); return px+','+py; }).join(' ');
      html += '<polygon points="'+pts+'" fill="none" stroke="#ff8c00" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.7"/>';
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

  // Debug overlay: 2-state cycle (source / selected). Positioned in percentage coordinates of #pdf-container.
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
  const sec = (RW.panelSection && RW.panelSection('fittings', 'FITTINGS'))
    || (document.getElementById('rw-pick') || {}).parentNode;

  if (sec && !document.getElementById('rw-elbow')){
    const b = document.createElement('button');
    b.id = 'rw-elbow';
    b.title = 'Drag a box (or click points + double-click to close a tighter region) around an elbow fitting; traces the real linework inside it into a polygon that hugs the fitting (curve + any side stub). Once drawn, drag any corner/vertex to reshape it live. Escape backs out one step at a time.';
    b.style.cssText = 'font-size:11px;padding:2px 6px;';
    b.innerText = 'Elbow';
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

  return 'v3.2 up: Elbow fitting — drag a box, traces the real fitting inside it, Commit Elbow';
})()

;
// ===== rw_cmdline.js =====
// RW vcmd — AutoCAD-style command line: type a tool's name/alias into an
// always-visible input, autocomplete suggests matches, Enter arms it by
// clicking its existing panel button (so all existing cross-disarm logic
// fires unchanged) and opens a floating popup with that tool's own controls,
// borrowed from the panel and returned on close/disarm.
//
// Full design history: CLAUDE.md.
//
// Load LAST (after rw_elbow.js, needs v32).
(function(){
  const RW = window.__RW;
  if (!RW || !RW.v32) return 'need v3.2 (rw_elbow.js) first';
  if (RW.vcmd) return 'command line already installed';
  RW.vcmd = true;

  /* ---------- command table ---------- */
  // Each entry is either `btn` (click this id to arm/run it) or `run` (call
  // directly — for one-shot actions with no dedicated button). `ctl` lists
  // ids to relocate into the popup; omitted for pure one-shot actions.
  // `armed` is omitted for tools with no real on/off transition (their popup
  // just stays open until manually closed).
  function cycleMaskAction(){
    const next = RW.maskAction==='block' ? 'open' : (RW.maskAction==='open' ? 'add' : 'block');
    RW.setMaskAction(next);
    RW._commitStatus && RW._commitStatus('action: ' + next);
  }

  // Dispatches a synthetic keydown on `document` for the host app's own
  // listeners to consume — same idiom already used to make the app relinquish
  // its own tool (rw_install.js/rw_wallspan.js/rw_elbow.js's synthetic
  // Escape), generalized to an arbitrary key.
  RW._cmdDispatchAppKey = function(key){
    document.dispatchEvent(new KeyboardEvent('keydown', {key:key, bubbles:true, cancelable:true}));
  };

  // Draw-mode tool letters dispatch `d` (draw mode) first — defensive, since
  // the app's own keymap documents these as "Tools (draw mode)"; harmless if
  // they already work from any mode.
  function nativeDrawTool(key){
    return function(){ RW._cmdDispatchAppKey('d'); RW._cmdDispatchAppKey(key); };
  }
  function nativeKey(key){
    return function(){ RW._cmdDispatchAppKey(key); };
  }

  RW._cmdTable = [
    { name:'pick',      aliases:['p'],       btn:'rw-pick',        ctl:['rw-pick'],                                   armed:()=>!!RW.pickMode },
    { name:'cut',       aliases:['k'],       btn:'rw-cut',         ctl:['rw-cut'],                                    armed:()=>!!RW.cutMode, disarm:()=>RW.setCut(false) },
    { name:'rect',      aliases:['r','b'],   btn:'rw-rect',        ctl:['rw-rect'],                                   armed:()=>RW.maskMode==='rect' },
    { name:'poly2',     aliases:['poly','n'],btn:'rw-poly2',       ctl:['rw-poly2'],                                  armed:()=>RW.maskMode2==='poly2' },
    { name:'brush',     aliases:['j'],       btn:'rw-brush',       ctl:['rw-brush'],                                  armed:()=>RW.maskMode2==='brush' },
    { name:'heal',      aliases:['h'],       btn:'rw-heal-btn',    ctl:['rw-heal-group'],                             armed:()=>!!RW._healPreviewOn },
    { name:'healbrush', aliases:['hb'],      btn:'rw-healbrush-btn', ctl:['rw-healbrush-btn'],                        armed:()=>!!RW.healBrushMode },
    { name:'pipe',      aliases:['c'],       btn:'rw-pipe',        ctl:['rw-pipe-group'],                             armed:()=>!!RW.pipeMode },
    { name:'elbow',     aliases:['el','l'],  btn:'rw-elbow',       ctl:['rw-sec-fittings'],                           armed:()=>!!RW.elbowMode },
    { name:'walls',     aliases:['wall','o'],btn:'rw-walls',       ctl:['rw-walls'],                                  armed:()=>RW.wallOverlayState!==0,
      disarm:()=>{ const ov=document.getElementById('rw-wall-overlay'); if (ov) ov.remove(); RW.wallOverlayState=0; } },
    { name:'snap',      aliases:['s'],       btn:'rw-snap',        ctl:['rw-snap'],                                   armed:()=>!!RW._snapEnabled },
    { name:'text',      aliases:['density'], btn:'rw-textdetect',  ctl:['rw-textdetect-group'],                       armed:()=>!!RW.textOverlayOn },
    { name:'addmode',   aliases:['add','a'], btn:'rw-addmode',     ctl:['rw-addmode'],                                armed:()=>RW.maskAction==='add' },
    { name:'relabel',   aliases:[],          btn:'rw-relabel-btn', ctl:['rw-relabel-label','rw-relabel-inp','rw-relabel-btn'] },
    { name:'cycle',     aliases:['action'],  run: cycleMaskAction },

    // ---- native app tools (dispatched to the host app, not this workbench) ----
    // Aliases deliberately omit any single letter already claimed above by a
    // workbench command (k=cut, a=addmode, s=snap, r=rect) — those tools are
    // reachable only by their fuller name; `polygon` also skips `poly`
    // (already poly2's alias). One-shot `run` only: switching the app's own
    // tool isn't an on/off concept the way arming a workbench tool is.
    { name:'linear',   aliases:['q'],  run: nativeDrawTool('q') },
    { name:'bbox',     aliases:['w'],  run: nativeDrawTool('w') },
    { name:'count',    aliases:['e'],  run: nativeDrawTool('e') },
    { name:'polygon',  aliases:[],     run: nativeDrawTool('r') },
    { name:'polyline', aliases:['t'],  run: nativeDrawTool('t') },
    { name:'circle',   aliases:['y'],  run: nativeDrawTool('y') },
    { name:'cloud',    aliases:['u'],  run: nativeDrawTool('u') },
    { name:'wand',     aliases:[],     run: nativeDrawTool('k') },
    { name:'wrap',     aliases:['x'],  run: nativeDrawTool('x') },
    { name:'void',     aliases:['v'],  run: nativeDrawTool('v') },
    { name:'tag1',     aliases:['1'],  run: nativeDrawTool('1') },
    { name:'tag2',     aliases:['2'],  run: nativeDrawTool('2') },
    { name:'tag3',     aliases:['3'],  run: nativeDrawTool('3') },
    { name:'tag4',     aliases:['4'],  run: nativeDrawTool('4') },
    { name:'tag5',     aliases:['5'],  run: nativeDrawTool('5') },
    { name:'tag6',     aliases:['6'],  run: nativeDrawTool('6') },
    { name:'tag7',     aliases:['7'],  run: nativeDrawTool('7') },
    { name:'tag8',     aliases:['8'],  run: nativeDrawTool('8') },
    { name:'tag9',     aliases:['9'],  run: nativeDrawTool('9') },
    { name:'tag0',     aliases:['0'],  run: nativeDrawTool('0') },

    { name:'pan',      aliases:[],     run: nativeKey('a') },
    { name:'select',   aliases:[],     run: nativeKey('s') },
    { name:'draw',     aliases:['d'],  run: nativeKey('d') },
    { name:'label',    aliases:['f'],  run: nativeKey('f') },
    { name:'crop',     aliases:['g'],  run: nativeKey('g') },
    { name:'mirror',   aliases:['m'],  run: nativeKey('m') },
  ];

  /* ---------- matching ---------- */
  RW._cmdMatch = function(query){
    const q = (query||'').trim().toLowerCase();
    if (!q) return RW._cmdTable.slice();
    const ranked = [];
    RW._cmdTable.forEach(function(entry){
      const name = entry.name.toLowerCase();
      const aliases = (entry.aliases||[]).map(function(a){ return a.toLowerCase(); });
      let rank = -1;
      if (name === q) rank = 0;
      else if (aliases.indexOf(q) !== -1) rank = 1;
      else if (name.indexOf(q) === 0) rank = 2;
      else if (aliases.some(function(a){ return a.indexOf(q) === 0; })) rank = 3;
      else if (name.indexOf(q) !== -1) rank = 4;
      if (rank !== -1) ranked.push({entry:entry, rank:rank});
    });
    ranked.sort(function(a,b){ return a.rank - b.rank; });
    return ranked.map(function(r){ return r.entry; });
  };

  function findEntry(name){
    const q = (name||'').trim().toLowerCase();
    if (!q) return null;
    for (const e of RW._cmdTable){ if (e.name.toLowerCase()===q) return e; }
    for (const e of RW._cmdTable){ if ((e.aliases||[]).some(function(a){ return a.toLowerCase()===q; })) return e; }
    return null;
  }

  /* ---------- popup: borrow real controls, never duplicate ---------- */
  let popupEl=null, popupTitleEl=null, popupBodyEl=null;

  function tidyOldParent(oldParent){
    // If the control's old parent is now left empty (or a .rw-sec wrapper is
    // now left with only its label), hide it — mirrors rw_panelsections.js's
    // own empty-section rule — and return how to undo that on restore.
    if (!oldParent) return null;
    if (oldParent.classList && oldParent.classList.contains && oldParent.classList.contains('rw-sec')){
      if (!oldParent.children || oldParent.children.length <= 1){
        const prev = oldParent.style.display;
        oldParent.style.display = 'none';
        return {el: oldParent, prevDisplay: prev};
      }
      return null;
    }
    if (oldParent.id && oldParent.id.indexOf('rw-sec-') === 0 && (!oldParent.children || oldParent.children.length === 0)){
      const wrap = oldParent.parentNode;
      if (wrap){
        const prev = wrap.style.display;
        wrap.style.display = 'none';
        return {el: wrap, prevDisplay: prev};
      }
    }
    return null;
  }

  function ensurePopupDom(){
    if (popupEl) return;
    popupEl = document.createElement('div');
    popupEl.id = 'rw-cmd-popup';
    popupEl.style.cssText = 'position:fixed;display:none;z-index:99990;background:#222;color:#eee;'
      + 'border:1px solid #666;border-radius:4px;box-shadow:0 4px 16px rgba(0,0,0,0.4);min-width:100px;';
    popupEl.addEventListener('mousedown', function(e){ e.stopPropagation(); });

    const header = document.createElement('div');
    header.id = 'rw-cmd-popup-bar';
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;'
      + 'padding:4px 6px;cursor:move;border-bottom:1px solid rgba(255,255,255,0.15);'
      + 'font-size:11px;font-weight:bold;user-select:none;';
    popupTitleEl = document.createElement('span');
    header.appendChild(popupTitleEl);
    const closeBtn = document.createElement('button');
    closeBtn.innerText = '×';
    closeBtn.title = 'Close (keeps the tool armed)';
    closeBtn.style.cssText = 'font-size:13px;line-height:1;padding:0 4px;background:none;border:none;color:inherit;cursor:pointer;';
    closeBtn.onclick = closePopup;
    header.appendChild(closeBtn);
    popupEl.appendChild(header);

    popupBodyEl = document.createElement('div');
    popupBodyEl.id = 'rw-cmd-popup-body';
    popupBodyEl.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;align-items:center;padding:6px;';
    popupEl.appendChild(popupBodyEl);

    document.body.appendChild(popupEl);
    makeDraggable(header, popupEl);
  }

  function makeDraggable(handle, target){
    let dragging=false, offX=0, offY=0;
    handle.addEventListener('mousedown', function(e){
      dragging = true;
      const r = target.getBoundingClientRect();
      offX = e.clientX - r.left; offY = e.clientY - r.top;
      e.preventDefault();
    });
    document.addEventListener('mousemove', function(e){
      if (!dragging) return;
      target.style.left = Math.max(0, e.clientX - offX) + 'px';
      target.style.top = Math.max(0, e.clientY - offY) + 'px';
    });
    document.addEventListener('mouseup', function(){ dragging = false; });
  }

  function positionPopupDefault(){
    if (!inputEl) return;
    const r = inputEl.getBoundingClientRect();
    const w = popupEl.offsetWidth || 200;
    let left = r.left - w - 12;
    if (left < 8) left = r.right + 12;
    popupEl.style.left = Math.max(8, left) + 'px';
    popupEl.style.top = Math.max(8, r.top) + 'px';
  }

  RW._cmdPopupState = null;

  function openPopup(entry){
    closePopup();
    if (!entry.ctl || !entry.ctl.length) return;
    ensurePopupDom();
    popupTitleEl.innerText = entry.name;
    const moved = [];
    entry.ctl.forEach(function(id){
      const node = document.getElementById(id);
      if (!node || !node.parentNode) return;
      const parent = node.parentNode;
      const nextSibling = node.nextSibling;
      const prevInlineDisplay = node.style.display;
      if (prevInlineDisplay === 'none') node.style.display = '';
      popupBodyEl.appendChild(node);
      const hiddenWrap = tidyOldParent(parent);
      moved.push({node:node, parent:parent, nextSibling:nextSibling, prevInlineDisplay:prevInlineDisplay, hiddenWrap:hiddenWrap});
    });
    if (!moved.length){
      const msg = document.createElement('div');
      msg.style.cssText = 'font-size:11px;opacity:0.7;max-width:180px;';
      msg.innerText = 'controls unavailable right now — tool is armed; use the panel.';
      popupBodyEl.appendChild(msg);
    }
    popupEl.style.display = 'block';
    positionPopupDefault();

    const state = { entry:entry, moved:moved, pollId:null, sawArmed: entry.armed ? !!entry.armed() : false };
    state.pollId = setInterval(function(){
      if (!RW.enabled){ closePopup(); return; }
      if (!entry.armed) return;
      const now = !!entry.armed();
      if (now) state.sawArmed = true;
      if (state.sawArmed && !now) closePopup();
    }, 250);
    RW._cmdPopupState = state;
  }

  function closePopup(){
    const st = RW._cmdPopupState;
    if (!st) return;
    if (st.pollId) clearInterval(st.pollId);
    for (let i = st.moved.length - 1; i >= 0; i--){
      const m = st.moved[i];
      m.parent.insertBefore(m.node, m.nextSibling);
      m.node.style.display = m.prevInlineDisplay;
      if (m.hiddenWrap) m.hiddenWrap.el.style.display = m.hiddenWrap.prevDisplay;
    }
    if (popupEl) popupEl.style.display = 'none';
    RW._cmdPopupState = null;
  }

  RW._cmdOpenPopup = openPopup;
  RW._cmdClosePopup = closePopup;

  /* ---------- run a command ---------- */
  // Re-running an already-armed tool's command toggles it off (mirrors how
  // the original single-key shortcuts worked). Most tools' own buttons
  // already toggle on click; `disarm` on a table entry overrides that for
  // the two that don't (cut, walls — see the table above).
  RW.runCommand = function(name){
    const entry = findEntry(name);
    if (!entry){ RW._commitStatus && RW._commitStatus('unknown command: ' + name); return false; }
    if (entry.run){
      entry.run();
      return true;
    }
    const btn = document.getElementById(entry.btn);
    if (!btn){ RW._commitStatus && RW._commitStatus('"' + entry.name + '" — its button is not on the page right now'); return false; }
    const wasArmed = entry.armed ? !!entry.armed() : false;
    if (wasArmed){
      if (entry.disarm) entry.disarm(); else btn.click();
      closePopup();
      return true;
    }
    btn.click();
    if (entry.ctl && entry.ctl.length) openPopup(entry);
    return true;
  };

  /* ---------- command bar + autocomplete ---------- */
  let barEl=null, inputEl=null, menuEl=null, menuItems=[], menuHighlight=-1;

  function ensureMenuDom(){
    if (menuEl) return;
    menuEl = document.createElement('div');
    menuEl.id = 'rw-cmd-menu';
    menuEl.style.cssText = 'position:fixed;display:none;z-index:99991;background:#222;color:#eee;'
      + 'border:1px solid #666;border-radius:4px;max-height:200px;overflow-y:auto;';
    document.body.appendChild(menuEl);
  }

  function positionMenu(){
    const r = inputEl.getBoundingClientRect();
    menuEl.style.left = r.left + 'px';
    menuEl.style.top = (r.bottom + 2) + 'px';
    menuEl.style.width = r.width + 'px';
  }

  function hideMenu(){ if (menuEl) menuEl.style.display = 'none'; }

  function renderMenuRows(){
    if (!menuItems.length){ hideMenu(); return; }
    ensureMenuDom();
    menuEl.innerHTML = '';
    menuItems.forEach(function(entry, i){
      const row = document.createElement('div');
      row.className = 'rw-cmd-item';
      row.style.cssText = 'padding:3px 6px;font-size:11px;cursor:pointer;'
        + (i===menuHighlight ? 'background:rgba(255,140,0,0.3);' : '');
      row.innerText = entry.name + ((entry.aliases && entry.aliases.length) ? (' (' + entry.aliases.join(',') + ')') : '');
      row.addEventListener('mousedown', function(e){ e.preventDefault(); }); // survive the input's blur
      row.addEventListener('click', function(){ runAndClear(entry.name); });
      menuEl.appendChild(row);
    });
    positionMenu();
    menuEl.style.display = 'block';
  }

  function onInput(){
    menuItems = RW._cmdMatch(inputEl.value).slice(0, 8);
    menuHighlight = menuItems.length ? 0 : -1;
    renderMenuRows();
  }

  function moveHighlight(delta){
    if (!menuItems.length) return;
    menuHighlight = (menuHighlight + delta + menuItems.length) % menuItems.length;
    renderMenuRows();
  }

  function runAndClear(name){
    RW.runCommand(name);
    inputEl.value = '';
    hideMenu();
    inputEl.blur();
  }

  function onInputKeydown(e){
    if (e.key === 'ArrowDown'){ e.preventDefault(); e.stopPropagation(); moveHighlight(1); return; }
    if (e.key === 'ArrowUp'){ e.preventDefault(); e.stopPropagation(); moveHighlight(-1); return; }
    if (e.key === 'Tab'){
      e.preventDefault(); e.stopPropagation();
      if (menuHighlight >= 0 && menuItems[menuHighlight]) inputEl.value = menuItems[menuHighlight].name;
      return;
    }
    if (e.key === 'Enter'){
      e.preventDefault(); e.stopPropagation();
      let entry = null;
      if (menuHighlight >= 0 && menuItems[menuHighlight]) entry = menuItems[menuHighlight];
      else {
        const matches = RW._cmdMatch(inputEl.value);
        if (matches.length === 1) entry = matches[0];
      }
      if (entry) runAndClear(entry.name);
      else { RW._commitStatus && RW._commitStatus('unknown command: ' + inputEl.value); }
      return;
    }
    if (e.key === 'Escape'){
      e.stopPropagation();
      if (menuEl && menuEl.style.display !== 'none'){ hideMenu(); }
      else { inputEl.value = ''; inputEl.blur(); }
      return;
    }
  }

  function mountCommandBar(){
    if (document.getElementById('rw-cmd-row')) return;
    const sections = document.getElementById('rw-sections');
    const list = document.getElementById('rw-list');
    const host = sections ? sections.parentNode : (list && list.parentNode);
    if (!host) return;
    barEl = document.createElement('div');
    barEl.id = 'rw-cmd-row';
    barEl.style.cssText = 'display:flex;align-items:center;gap:4px;margin-bottom:6px;';
    const prompt = document.createElement('span');
    prompt.innerText = '>';
    prompt.style.cssText = 'opacity:0.5;font-family:monospace;';
    barEl.appendChild(prompt);
    inputEl = document.createElement('input');
    inputEl.id = 'rw-cmd-input';
    inputEl.type = 'text';
    inputEl.autocomplete = 'off';
    inputEl.spellcheck = false;
    inputEl.placeholder = 'command… (pipe, elbow, rect…) — just start typing';
    inputEl.style.cssText = 'flex:1;font-size:11px;padding:2px 4px;';
    barEl.appendChild(inputEl);
    host.insertBefore(barEl, sections || list);

    inputEl.addEventListener('input', onInput);
    inputEl.addEventListener('keydown', onInputKeydown);
    inputEl.addEventListener('blur', function(){ setTimeout(hideMenu, 150); });
  }

  mountCommandBar();

  // Global auto-capture: typing anywhere (nothing else focused) seeds the
  // command input and focuses it — only the FIRST character needs this;
  // every character after that lands on the now-focused real <input> and is
  // handled by onInputKeydown/onInput above, unchanged. "Capture always
  // wins": this consumes the keystroke (preventDefault + stopImmediatePropagation)
  // so the host app's own same-letter shortcut does not also fire — to use a
  // native single-key shortcut directly again, blur the command input first
  // (Escape, or click the canvas).
  document.addEventListener('keydown', function(e){
    const t = e.target;
    if (t && (t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable)) return;
    if (e.ctrlKey||e.metaKey||e.altKey) return;
    if (e.key.length !== 1) return; // printable characters only
    e.preventDefault(); e.stopImmediatePropagation();
    mountCommandBar();
    if (!inputEl) return;
    inputEl.value += e.key;
    inputEl.focus();
    if (inputEl.setSelectionRange) inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
    onInput();
  }, true);

  return 'vcmd up: command line — just start typing a tool name, ' + RW._cmdTable.length + ' commands';
})()


  console.log('[RW] workbench ready: ' + __RW.regions.filter(r=>r.included).length + ' regions. Type a tool name into the command line (or press / to focus it) to arm a tool; ` undo, Escape cancel.');
})()
