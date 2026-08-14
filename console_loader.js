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
// MUST be loaded FIRST (before rw_install). Establishes RW.enabled and
// wraps annotation-canvas's addEventListener so every handler registered
// by subsequent modules checks RW.enabled automatically.
// Panel UX (collapse/resize/toggle) attaches at the end.
(function boot(){
  'use strict';

  // Do NOT create __RW here — rw_install will create it. We just set up
  // the addEventListener wrappers so subsequent modules get auto-gated.
  // After rw_install runs, poll for __RW and attach our state + panel UX.

  // We need RW.enabled accessible BEFORE rw_install runs (the wrapper checks
  // it). Store it on a separate object that the wrapper reads.
  if (!window.__RWgate) window.__RWgate = { enabled: true };
  const gate = window.__RWgate;

  /* ---------- auto-gate all annotation-canvas listeners ---------- */
  // Override addEventListener on the annotation-canvas so any handler
  // registered by us checks RW.enabled first. Store the original under
  // _rawAdd so the override itself doesn't get wrapped.
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
        // This is how our modules attach key handlers (capture phase)
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

    // sync the enabled flag from our gate object to RW
    RW.enabled = gate.enabled;
    RW.v28 = true;

    // wrap existing children into collapsible body
    const body = document.createElement('div');
    body.id = 'rw-body';
    while (panel.firstChild) body.appendChild(panel.firstChild);
    panel.appendChild(body);

    // header bar
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

    // panel styling
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
      // clamp region size threshold proportionally
      RW._areaFloor = Math.round(2500 * (W*H) / (2592*1728));
    }
    const areaFloor = RW._areaFloor != null ? RW._areaFloor : 2500;
    // ... rest of extraction
    const cv = document.createElement('canvas'); cv.width=W; cv.height=H;
    const ctx = cv.getContext('2d');
    ctx.drawImage(src, 0, 0, W, H);
    const d = ctx.getImageData(0,0,W,H).data;
    let wall = new Uint8Array(W*H);
    for (let i=0;i<W*H;i++){
      // use minimum RGB channel to catch colored lines (yellow, green, blue)
      // on white background (255,255,255 → min=255). any color drop = line
      const minChan = Math.min(d[i*4], d[i*4+1], d[i*4+2]);
      if (minChan < 200) wall[i]=1;
    }
    // no morphological pass — raw luminance only.
    // mask boundary sits at line edge. curves follow pixel data directly.
    // knock out existing annotations
    const c2 = document.createElement('canvas'); c2.width=W; c2.height=H;
    const x2 = c2.getContext('2d');
    for (const a of annotationState.annotations){
      if (a._hidden || a.is_void) continue;
      // Array.isArray, not just !pts.length — a bbox-type annotation stores
      // coordinates as {x,y,width,height}, not a point array. This specific
      // check (!pts.length) happens to catch that case since `undefined`
      // negates to true, but rw_healinterior.js/rw_textdetect.js used
      // `pts.length<3` instead, which does NOT catch it (`undefined < 3` is
      // false in JS) and crashed on .forEach — confirmed live. Using
      // Array.isArray here too for real defense-in-depth, not just luck.
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

  /* ---------- commit preview: raw contours of selected groups ---------- */
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
    // Delete/Backspace: remove selected regions from the mask (pick mode)
    if ((e.key==='Delete'||e.key==='Backspace') && RW.pickMode && RW.selected.size){
      e.preventDefault(); e.stopImmediatePropagation();
      // paint all pixels of selected groups as wall, then relabel
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
// Extends live __RW v2. Paints into RW.wall, re-labels preserving groups.
// Now uses normalized coordinates for pan-stable previews and a single mode
// 'rect' with RW.maskAction ('block'|'open') toggled via Shift or the button.
// Depends on _toNorm/_toPx from v2.2 (rw_stable.js must be loaded first).
(function(){
  const RW = window.__RW;
  if (!RW || RW.v !== 2) return 'need RW v2 first';
  if (RW.v21r) return 'v2.1r already installed';
  RW.v21r = true;

  /* ---------- rect tool: unified block/open via maskAction ---------- */
  // NOTE: RW.maskAction is 'block' or 'open' (shared with v2.6). Default block.
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

  // Bresenham polyline — paints wall=1 only where pixels are currently wall=0
  // AND are NOT part of an existing included mask region.
  // (seals gaps in linework without cutting through mask regions)
  RW._paintPolylineGap = function(pts){
    const {W,H,wall,labels,regions} = RW;
    function line(x0,y0,x1,y1){
      const dx=Math.abs(x1-x0), sx=x0<x1?1:-1;
      const dy=-Math.abs(y1-y0), sy=y0<y1?1:-1;
      let err=dx+dy;
      while(true){
        if (x0>=0&&x0<W&&y0>=0&&y0<H && wall[y0*W+x0]===0){
          // skip if this pixel belongs to an included mask region
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

  /* ---------- rect tool: unified block/open via RW.maskAction ---------- */
  const ac = document.getElementById('annotation-canvas');

  // n.b.: v2.6's previewV=5 handles poly2/brush; this module only handles
  // maskMode==='rect'.  v2.6 keys (N/J) check maskMode2 to avoid conflict.
  // legacy keys B/O are removed here; unified rect uses B-only gated on
  // maskMode2 being null (so B does nothing while poly2/brush are armed).

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
    // render via the shared preview path from v2.2
    RW._renderPreview2({x:e.clientX,y:e.clientY});
  }, true);

  ac.addEventListener('mouseup', function(e){
    if (RW.maskMode!=='rect' || !RW.__rectStartN) return;
    e.stopPropagation(); e.preventDefault();
    const s=RW.__rectStartN; RW.__rectStartN=null; RW.__rectCurN=null;
    const rl=document.getElementById('rw-rectline'); if(rl) rl.remove();
    const en=RW._toNorm(e.clientX,e.clientY);
    if (RW.maskAction==='add'){
      // Fill-then-hollow: paint full rect as wall, then shrink 2px and clear interior.
      // Build skip mask for existing included-region pixels (bbox only, cheap).
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

  /* ---------- rect preview render (plugged into v2.2 renderer) ---------- */
  // v2.2 _renderPreview only checks maskMode==='poly' — we extend it here
  // by wrapping into a _renderPreview2 that the v2.2 mousemove calls instead.
  RW._renderPreview2 = function(cursorClient){
    // delegate to v2.2 renderer for poly/brush first
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
    // never handle when v2.6 tools are armed — BUT disarm them first so the
    // user can switch directly between rect and poly2/brush in one keystroke
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
      // Red = wall pixels
      for (let i = 0; i < W*H; i++) {
        if (wall[i] === 1) { img.data[i*4]=255; img.data[i*4+1]=60; img.data[i*4+2]=60; img.data[i*4+3]=220; }
      }
    } else {
      // Cyan = enclosed white space (not reachable from border → would become regions)
      // Match _relabel() behavior: existing included region pixels block the flood
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
// page coords (0-1 of page), converts to pixels at render time. Supersedes v3 preview handlers.
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
    const dotR = 2.5;  // constant screen px

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
    // let the app handle the zoom, then re-render after a microtask
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
// RW v2.3 — undo system for mask tools.
// Load AFTER rw_stable.js (needs v2.2).
//
// Behavior:
// - Poly: Backspace removes last vertex; Escape clears in-progress vertices FIRST,
//   second Escape closes the tool; double-click commits.
// - Block/Open rect strokes, Poly commits, Cut, Merge: snapshot-based undo stack.
//   Panel "Undo" button or backtick (`) key reverts the last edit.
(function(){
  const RW = window.__RW;
  if (!RW || !RW.v22) return 'need v2.2 first';
  if (RW.v23) return 'v2.3 already installed';
  RW.v23 = true;
  const ac = document.getElementById('annotation-canvas');

  /* ---------- undo stack ---------- */
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

  /* ---------- snapshot triggers (window-level capture = fires before element handlers) ---------- */
  // rect strokes: snapshot on stroke-start mousedown
  window.addEventListener('mousedown', function(e){
    if (RW._previewV!==4 || !RW.maskMode) return;
    if (e.target !== ac && !ac.contains(e.target)) return;
    if (RW.maskMode==='block' || RW.maskMode==='open' || RW.maskMode==='rect') RW._snapshot(RW.maskMode);
  }, true);

  // poly commit: snapshot via _paintPoly wrapper (fires on dblclick commit only,
  // because v2.2's dblclick handler is the sole caller with a full polygon)
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

  // cut + merge
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

  /* ---------- poly vertex editing (window capture beats older document handlers) ---------- */
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

  /* ---------- undo trigger: backtick + panel button ---------- */
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

  /* ---------- contour tracing (Moore neighbor, union of group members) ---------- */
  RW._groupToPolygon = function(gid, eps){
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
    // simplify closed contour
    function dp(pts, e2){
      if (pts.length<3) return pts;
      const [x1,y1]=pts[0], [x2,y2]=pts[pts.length-1];
      const dx=x2-x1, dy=y2-y1, len=Math.hypot(dx,dy)||1;
      let maxD=0, idx=0;
      for (let i=1;i<pts.length-1;i++){
        const dd=Math.abs(dy*pts[i][0]-dx*pts[i][1]+x2*y1-y2*x1)/len;
        if (dd>maxD){maxD=dd;idx=i;}
      }
      if (maxD>e2){
        const l=dp(pts.slice(0,idx+1),e2), r=dp(pts.slice(idx),e2);
        return l.slice(0,-1).concat(r);
      }
      return [pts[0], pts[pts.length-1]];
    }
    // Chaikin corner-cutting: smooth pixel staircases (dragon's teeth) on
    // diagonal edges. Each vertex -> two points at 25%/75% of adjacent edges.
    // `passes` rounds progressively; ~0.5-1px inward erosion per pass at mask res.
    function chaikin(pts, passes){
      let out = pts;
      for (let p=0;p<passes;p++){
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
    let simp = path;
    if (path.length >= 8){
      // smooth first so DP sees curves, not staircases
      let work = chaikin(path, RW.smoothPasses != null ? RW.smoothPasses : 4);
      let far=0, farD=0;
      const [sx2,sy2]=work[0];
      for (let i=0;i<work.length;i++){
        const d=Math.hypot(work[i][0]-sx2, work[i][1]-sy2);
        if (d>farD){farD=d;far=i;}
      }
      const e2 = RW.smoothEps != null ? RW.smoothEps : (eps||1.2);
      const h1=dp(work.slice(0,far+1), e2), h2=dp(work.slice(far), e2);
      simp = h1.slice(0,-1).concat(h2.slice(0,-1));
    }
    return simp.map(([x,y])=>({x:+(x/W).toFixed(6), y:+(y/H).toFixed(6)}));
  };

  /* ---------- direct annotation creation ---------- */
  let tempCounter = 1;
  RW._createPendingAnnotation = function(normPts){
    const st = annotationState;
    const tag = st.currentTag;
    const tempId = 'temp_rw_' + (Date.now()%100000) + '_' + (tempCounter++);
    const annotationData = {
      page_id: st.pageId,
      measurement_type: 'POLYGON',
      points_data: normPts,
      notes: '',
      temp_id: tempId,
    };
    if (tag) annotationData.tag_id = tag.id;
    const newAnnotation = {
      id: tempId,
      tag: tag || null,
      labels: [],
      measurement_type: 'POLYGON',
      coordinates: normPts,
      notes: '',
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
      // Show polygon area (current vertices + cursor position)
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
      // Show approximate brush area: stroke length × diameter
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
        // Compute bbox of the brush stroke, build skip mask for existing regions
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
        // Compute bbox of the polygon, build skip mask for existing regions
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
          if (skip[y*W+x]) wall[y*W+x]=1;  // restore existing region pixels as wall
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
      // Render as a single thick polyline instead of N individual circles
      // (1 DOM node instead of potentially hundreds — huge perf win for long strokes)
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
// Status: shipped, in both console loaders. Paused for a time after four
// rounds of live testing each surfacing a genuinely different failure mode
// (see below); a fifth round (annotation-knockout protection) fixed the
// remaining known issue and this was re-enabled. A sixth round (barrier-
// margin expansion) fixed a thick-line erosion issue found afterward. If a
// new failure mode turns up, read all six rounds below first before assuming
// it's something new — the fix for one round has occasionally looked like it
// broke another.
//
// Reframed from the whole-page text-density overlay (rw_textdetect.js) after
// live testing showed the real problem isn't "where does text sit on the
// page" — it's "which wall pixels inside a region about to be committed are
// pure interior noise (text/hatch/dimension/leader marks) versus the
// region's genuine perimeter." Dimension/extension/leader lines legitimately
// touch a region's true boundary and reach into its interior, so the commit
// contour trace doesn't just ignore them — it weaves in and follows the
// text/hatch shape itself, producing a jagged polygon instead of one clean
// outline.
//
// Six failure modes found live, in order:
//   1. Connected-component veto (flood all touching wall into one blob, veto
//      the WHOLE blob if any part touches something unsafe) was fatally
//      coarse — dimension/leader lines touch the real perimeter often enough
//      that nearly all interior noise ends up wall-connected to the true
//      boundary into one network. Measured: a real region's wall split into
//      4 components, the largest 65% of all wall in its bbox, ALL vetoed.
//   2. Per-pixel safety test (fixed the veto problem) but bounded by a small
//      padding around the region's own OPEN-pixel bounding box — wrong on a
//      hatch-heavy job, where that open "clearing" can sit deep inside a much
//      larger connected mass of hatch fill. The padding never reached real
//      exterior, so 100% of wall in the window came back "safe."
//   3. Unbounded reachability flood (let the search stop naturally at real
//      barriers instead of guessing a padding size) fixed #2, but on a page
//      with only ONE included region, there was nothing nearby to fence the
//      search in — it explored ~2.65M pixels, nearly the whole non-blank
//      page, before hitting a real barrier anywhere.
//   4. Added a size threshold so a neighboring non-included area only counts
//      as "protected" if it's bigger than a tunable hole-size cutoff (a
//      building's room is not "tiny noise" the way a letter's hole is) — but
//      this can't help when the "room" isn't even a separate label to begin
//      with: door-opening gaps in the linework had already merged a real
//      building's floor plan into the SAME connected open region as the
//      pavement around it, so its walls were floating inside one blob with
//      no second region to be "not merged with" in the first place. From
//      pure wall/label topology, that's indistinguishable from actual noise.
//   5. (Fixed, currently shipped.) Existing committed annotations get knocked
//      out into RW.wall as uniform filled interior (the same step
//      RW.extract() already does so they're never re-proposed as candidate
//      regions) — but that knockout doesn't distinguish itself from
//      text/hatch wall, so a wall pixel deep inside an already-annotated area
//      looked exactly as "safe" as real noise. Healing tried to erase into
//      already-completed territory. Fixed by rebuilding the same
//      annotation-knockout mask here and hard-excluding it, both from the
//      reachability flood (never steps into it) and as a final filter on the
//      result (belt-and-suspenders, given the history above).
//   6. (Fixed, currently shipped.) The original per-pixel safety test only
//      checks each wall pixel's OWN immediate 1-hop neighbors — correct for
//      thin (1-2px) barriers, since every pixel in a thin line directly
//      touches the outside. But on a THICK drawn barrier (a wide stroke),
//      only its outer ~1px skin touches anything unsafe this way; pixels in
//      the middle of the thickness are surrounded by more of the same wall
//      on all sides and look exactly like real interior noise. Confirmed
//      live: a thick black boundary line got partially hollowed out through
//      its middle — never merges two regions (so the OLD test wasn't
//      "wrong" by its own rule), but visibly damages a real boundary and
//      would corrupt the commit contour along that stretch. Fixed by finding
//      the "unsafe shell" (wall pixels whose own neighbor is unsafe, i.e.
//      exactly what the old test flagged as protected) and widening it by a
//      bounded multi-source BFS (RW._healBarrierMargin, default ~12px at
//      2592-baseline resolution) through reachable wall only.
//
//      IMPORTANT, verified with a synthetic test after shipping: this only
//      protects HALF as deep as it looks like it should for the most common
//      case — a region's own boundary line facing a *different* region or
//      exterior. The near face of that line (the side touching the region's
//      own interior) never starts "unsafe" — crossing into your own open
//      space is never foreign — so the BFS only ever expands inward from the
//      single far face. A 16px-thick barrier in testing needed
//      RW._healBarrierMargin ~= 16 (the FULL thickness) to be fully
//      protected; margin=10 (~2/3 of the thickness) still left ~23% of it
//      erodable. The "up to 2x margin thick, expansion from both sides meet
//      in the middle" framing only holds when NEITHER face of the wall
//      segment is the target region's own interior, which is the rare case,
//      not the norm. Practical upshot: set barrier≥ to roughly the visible
//      line's FULL pixel thickness, not half of it. (Genuine deep-interior
//      noise, far from any real boundary, is unaffected by this and still
//      gets flagged correctly at any margin setting — confirmed in the same
//      test.)
//
// The throughline: this approach can only ever reason from wall/label
// topology, and real drawings have cases (structure connected via a small
// gap, hatch-heavy jobs with no nearby second region, already-annotated
// territory with no distinguishing marker) where topology alone doesn't
// encode the distinction a human makes by recognizing the content.
(function(){
  const RW = window.__RW;
  // Needs v26 (rw_brushpoly.js), not just v23 — the cross-disarm wrap below
  // reads RW.setMaskMode2, which doesn't exist until rw_brushpoly.js has
  // loaded. Loading this module before that point silently skipped the wrap
  // (the `if (RW.setMaskMode2)` guard just found nothing to wrap) rather than
  // erroring, so arming Poly2/Brush didn't disarm the heal brush as intended
  // — confirmed live. Gating on v26 turns that into a loud, obvious bail
  // instead of a silent partial failure if the load order ever regresses.
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
  //       exterior or a different included region (a purely local, per-pixel
  //       test, not a connected-component veto).
  //
  // Earlier attempts got both parts wrong in different ways:
  //  - v1 used connected-component flood + "if ANY part of the component ever
  //    touches something bad, veto the WHOLE component." Fatally coarse:
  //    dimension/leader lines and hatch marks routinely touch the real
  //    perimeter by a pixel or two, so nearly all interior noise ended up
  //    wall-connected to the true boundary into one giant network — measured
  //    live, a real region's wall pixels formed 4 components, the largest
  //    65% of all wall pixels in its bbox, ALL vetoed together.
  //  - v2 (per-pixel test alone, bounded by a small fixed padding around the
  //    region's own open-pixel bounding box) fixed the veto problem but
  //    revealed a second one: on a hatch-heavy job, a region's own open
  //    pixels can be a small clearing deeply embedded in a much larger mass
  //    of dense hatch fill, so a small fixed pad never reaches anywhere near
  //    the true exterior-facing edge — measured live, 100% of wall in the
  //    padded window came back "safe" because NONE of it was close enough to
  //    touch real exterior within that window at all.
  //
  // Bounding by REACHABILITY (rather than guessing a padding size) fixes
  // this: the flood naturally stops wherever it would have to cross into
  // exterior/a different region/a tiny speck, however far that actually is,
  // and the per-pixel test (applied only within that reachable set) is what
  // avoids the whole-component veto bug.
  RW._computeInteriorNoise = function(gids){
    const {W,H,labels,regions,wall} = RW;
    const memberIds = new Set(regions.filter(r=>gids.has(r.group)).map(r=>r.id));
    if (!memberIds.size) return null;

    const isSameRegion = i => { const l=labels[i]; return l>=0 && memberIds.has(l); };

    // A neighboring open area counts as "protected" (never merge into it) if
    // it's either already included, OR bigger than RW._healNoiseHoleMax — a
    // dedicated, separately-tunable threshold for "how big can a hole be
    // before it's a real feature rather than negligible noise." This is
    // deliberately NOT the same value as RW._areaFloor: that one answers "is
    // this worth showing as a selectable candidate region" and is tuned for
    // that purpose (session default seen live: 6026px). A building's floor
    // plan drawn inside a large pavement region has its own room interiors as
    // separate labeled areas — confirmed live, several rooms measured
    // 868–5296px, all comfortably BELOW that area-floor value, so reusing it
    // here failed to protect them: real rooms and text-glyph holes both
    // count as "not included," but they're very different sizes, and a hole
    // threshold needs to sit well below real-feature size, not above it.
    const holeMax = RW._healNoiseHoleMax != null ? RW._healNoiseHoleMax : Math.round(300*(RW.W/2592));
    const isProtectedRegion = i => {
      const l = labels[i];
      if (l<0 || memberIds.has(l)) return false;
      const r = regions[l];
      return !!r && (r.included || r.size > holeMax);
    };

    // Existing committed annotations get knocked out into RW.wall as filled
    // interiors (the same step RW.extract() already does, so they never get
    // re-proposed as candidate regions) — but that knockout is just uniform
    // wall, with nothing distinguishing "wall because an already-completed
    // annotation lives here" from "wall because it's text/hatch." A wall
    // pixel deep inside an existing annotation is surrounded by more wall on
    // all sides, never touching a labeled region or true exterior, so it
    // looked exactly as "safe" as real noise — confirmed live: healing tried
    // to erase into already-annotated territory. Rebuilding that same
    // knockout mask here (mirroring RW.extract()'s own logic) and hard-
    // excluding it from the result fixes this directly, regardless of what
    // the reachability/per-pixel checks above conclude.
    const annotationMask = new Uint8Array(W*H);
    if (typeof annotationState !== 'undefined'){
      const cv = document.createElement('canvas'); cv.width=W; cv.height=H;
      const actx = cv.getContext('2d');
      actx.fillStyle = '#000';
      for (const a of annotationState.annotations){
        if (a._hidden || a.is_void) continue;
        // Array.isArray, not just !pts.length — a bbox-type annotation stores
        // coordinates as {x,y,width,height}, not a point array; that object
        // has no .length at all, and `undefined < 3` is false in JS, so the
        // old `pts.length<3` guard let it silently through to pts.forEach(),
        // which doesn't exist on a plain object. Confirmed live.
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
    // more same-region-open or wall pixels — never into exterior, a
    // different included region, or a tiny speck (those are natural stopping
    // barriers, not something to tunnel past). Everything this reaches is
    // "relevant" wall; anything it can't reach is irrelevant to this region
    // and left alone regardless of how the per-pixel test alone would judge it.
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

    // Per-pixel safety test, restricted to the reachable wall set. This finds
    // the "unsafe shell" — reachable wall pixels whose own immediate neighbor
    // is exterior/protected/annotation. On a THICK barrier (a wide drawn
    // line), only its outer ~1px skin touches something unsafe this way —
    // pixels in the middle of the thickness are surrounded by more of the
    // same wall on all sides, so they look exactly like real interior noise
    // and get flagged too. Confirmed live: a thick black boundary line got
    // partially hollowed out through its middle, leaving thin slivers of the
    // original line on both edges — technically never merges two regions,
    // but visibly damages a real boundary and would corrupt the commit
    // contour along exactly that stretch.
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

    // Widen that shell by a bounded margin (RW._healBarrierMargin, default
    // ~12px at this job's resolution) via a multi-source BFS through
    // reachable wall pixels only — this "thickens" protection to cover
    // realistic barrier widths. NOTE: for the common case (a region's own
    // boundary facing a different region/exterior), only the OUTER face ever
    // starts in unsafeShell — the inner face touches the region's own
    // interior, which is never "foreign" — so expansion only reaches inward
    // from that single face. Set the margin to roughly the line's FULL
    // pixel thickness, not half; verified live that margin=thickness/2 still
    // leaves a real fraction of the line erodable. Genuinely deep interior
    // noise (further than the margin from any real boundary) still gets
    // flagged regardless. Bounded and cheap: it only walks the already-small
    // reachable-wall set, not the whole image.
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
    const b = document.createElement('button');
    b.id = 'rw-heal-btn';
    b.title = 'Preview interior noise (text/hatch/dimension marks) inside the SELECTED region(s) that\'s safe to erase without merging with any other region. Pick a region first. Detection only until you Apply Heal.';
    b.style.cssText = 'font-size:11px;padding:2px 6px;';
    b.innerText = 'Heal Interior?';
    b.onclick = () => RW.toggleHealPreview();
    bar.appendChild(b);

    const ab = document.createElement('button');
    ab.id = 'rw-heal-apply-btn';
    ab.title = 'Erase the highlighted interior noise from the selected region(s).';
    ab.style.cssText = 'font-size:11px;padding:2px 6px;display:none;background:rgba(255,140,0,0.25);';
    ab.innerText = 'Apply Heal';
    ab.onclick = () => RW.applyHeal();
    bar.appendChild(ab);

    const label = document.createElement('span');
    label.innerText = 'hole≤'; label.style.cssText = 'font-size:10px;opacity:0.7;margin-left:4px;';
    bar.appendChild(label);
    const holeInp = document.createElement('input');
    holeInp.type = 'number';
    holeInp.value = RW._healNoiseHoleMax != null ? RW._healNoiseHoleMax : Math.round(300*(RW.W/2592));
    holeInp.title = 'Max pixel size for a non-included area to still count as a negligible hole (safe to merge) rather than a real feature (protected). Separate from the area-floor input — that one is for candidate regions, this one is for "how big is too big to be noise."';
    holeInp.style.cssText = 'font-size:11px;padding:1px 4px;width:52px;text-align:right;';
    let holeDebounce = null;
    holeInp.oninput = function(){
      // live preview while typing/spinning, debounced — _computeInteriorNoise
      // is a real O(W×H)-ish recompute (measured 200ms-1.5s live), so firing
      // on every keystroke would make typing feel laggy rather than "live."
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
    bar.appendChild(holeInp);

    const label3 = document.createElement('span');
    label3.innerText = 'barrier≥'; label3.style.cssText = 'font-size:10px;opacity:0.7;margin-left:4px;';
    bar.appendChild(label3);
    const marginInp = document.createElement('input');
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
    bar.appendChild(marginInp);
  }

  /* ---------- manual brush correction for the heal preview ---------- */
  // The topology-based detector will sometimes get it wrong in ways no
  // threshold can fix (e.g. an isolated solid symbol swept up as "noise"
  // because it never happens to border true exterior/a protected region
  // within reach — confirmed live). Rather than chase every such case
  // algorithmically, let the user paint directly onto RW._healNoiseMask
  // before Apply Heal — the same interaction as the existing Brush tool
  // (rw_brushpoly.js), just targeting the heal mask instead of RW.wall.
  // Requires a preview to already exist; arms it automatically (computing it
  // if needed) if a region is already selected.
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

  // RW.__tabHeld is a shared flag, but rw_brushpoly.js's own Tab handler only
  // ever sets it when RW.maskMode2==='brush' (the *original* Brush tool's own
  // mode) — pressing Tab while THIS tool is armed instead never set it, so
  // the wheel handler above always bailed out immediately. Cross-disarm
  // already guarantees only one of these tools is active at a time, so
  // sharing the flag is safe: extend the same keydown/keyup pair to also
  // fire for RW.healBrushMode, rather than introducing a second flag.
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

  // Reactive cross-disarm: wrap the shared functions Rect/Poly2/Brush already
  // call right after arming themselves (from BOTH their keydown handler and
  // their panel button's onclick — one shared touchpoint covers both input
  // paths, rather than only catching the keyboard shortcut).
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
// Load AFTER rw_brushpoly.js (needs v2.6). Snaps freshly-placed Poly2 vertices
// (mousedown) and the live preview point (mousemove) to nearby line
// endpoints/intersections detected on the wall bitmap, so polygons lock onto
// the actual linework instead of free-floating pixel positions.
//
// Pipeline (recomputed lazily, only when the wall bitmap has changed since
// the last build — see RW._snapDirty):
//   1. Density-prefilter RW.wall (RW._buildThinMask) via an integral image:
//      any wall pixel whose local window is mostly wall gets excluded before
//      skeletonizing. This matters a lot in practice — pavement-hatch fill
//      routinely marks 30%+ of a whole drawing as "wall", and (a) that's WAY
//      too many pixels to skeletonize synchronously without hanging the tab,
//      and (b) hatching doesn't have meaningful line endpoints/junctions
//      anyway, so it would just produce junk candidates. Only thin, line-like
//      wall survives into step 2.
//   2. Skeletonize the filtered mask (Zhang-Suen thinning, foreground-only
//      active list so cost scales with surviving-pixel count, not full W×H).
//   3. Classify skeleton pixels by 8-neighbor count: 1 neighbor = endpoint,
//      3+ neighbors = junction (branch point). 2 = ordinary skeleton point,
//      not a candidate.
//   4. Cluster nearby candidates (skeletonization often yields a few adjacent
//      pixels per real junction) into single snap points; junction wins over
//      endpoint when a cluster mixes both kinds.
//   5. Separately, add every included region's boundary pixel as an
//      uncluustered 'edge' snap candidate (RW._buildEdgePoints) — this is what
//      lets a vertex slide along any point of a region outline, not just its
//      corners. Detected in a single O(W×H) pass over RW.labels (checking each
//      included-region pixel's 4-neighbors for a different group/background),
//      NOT by calling the existing RW._rawContour once per region — that
//      function re-scans the entire W×H image on every call (it was written
//      to trace 1-2 selected groups for a commit preview), so calling it per
//      region here would be O(W×H × region count) and hang far worse than the
//      density-fill issue this file already exists to avoid.
//   6. Index the resulting points (clustered endpoints/junctions + raw edge
//      pixels together) in a bucket grid for fast nearest-point lookup. The
//      catch radius is recomputed per-query in current screen px
//      (RW._snapCatchPx), so the snap feel stays constant across zoom levels
//      the same way stroke widths do elsewhere in the workbench.
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
  // Window radius and density threshold that decide "thin line" vs "fill/hatch".
  // Scaled to resolution the same way _areaFloor is (2592-px baseline).
  RW._snapFillRadiusPx = function(){
    return Math.max(4, Math.round(10 * (RW.W/2592)));
  };
  RW._snapFillDensityThresh = 0.55;

  RW._buildThinMask = function(){
    const {W,H,wall} = RW;
    // Summed-area table, padded with a zero row/col so window queries never
    // need to special-case the image edges.
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
  // seed: the (already density-filtered) mask to thin — dense/hatched pixels
  // are simply absent from it, so they're invisible to this step entirely.
  RW._skeletonize = function(seed){
    const {W,H} = RW;
    const skel = new Uint8Array(seed);
    let active = [];
    for (let i=0;i<W*H;i++) if (skel[i]) active.push(i);

    // 8-neighbors in clockwise order starting north (P2..P9 in the Zhang-Suen
    // paper): N, NE, E, SE, S, SW, W, NW. Border pixels are skipped entirely
    // (never deleted, never classified) so no bounds-wrapping logic is needed.
    // Read as plain locals rather than a per-pixel array/object — this runs
    // over the active list up to ~120 times, so allocation-per-pixel here is
    // the difference between sub-second and tens of seconds.
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
  // NOTE: a cluster is bucketed by its FIRST point's position; later merges
  // can drift its centroid a little without re-bucketing. Harmless at the
  // small merge radii used here (a few mask px).
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

  /* ---------- 5. region-outline edge points (single-pass, uncluustered) ---------- */
  // Every included region's boundary pixel becomes its own snap candidate
  // (not merged into one point like junctions are) so a vertex can land
  // anywhere along the outline's length, not just at its corners.
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
    // constant ~14 screen px catch radius regardless of current zoom level
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
    // Cached raw (unclustered) so other features can read local point density —
    // _clusterPoints below deliberately erases that density (many points -> one),
    // which is exactly what snapping wants but the opposite of what a
    // density-based detector (e.g. rw_textdetect.js) needs.
    RW._skeletonCandidates = candidates;
    const clustered = RW._clusterPoints(candidates, RW._snapMergeRadiusPx());
    const edgePts = (RW.labels && RW.regions) ? RW._buildEdgePoints() : [];
    RW._snapPoints = clustered.concat(edgePts);
    RW._buildSnapIndex();
    RW._snapDirty = false;
  };

  // nx,ny are normalized page coords. Returns [nx,ny], snapped if a nearby
  // endpoint/junction was found and snapping is enabled.
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
// Prototype for the "auto text exclusion" roadmap item: flags areas where
// skeleton endpoint/junction candidates cluster unusually densely — text
// glyphs are small, stroke-heavy shapes, so they produce far more candidates
// per unit area than real linework does (confirmed empirically while testing
// rw_snap.js: dense clusters kept landing on labels/title-block text).
//
// This module ONLY renders an overlay of candidate bounding boxes. It never
// touches RW.wall/RW.labels/RW.regions — purely a "does this heuristic look
// useful on real pages" visualization, so it can be evaluated before any
// auto-apply step is built. See CLAUDE.md's Text exclusion roadmap entry.
(function(){
  const RW = window.__RW;
  if (!RW || !RW.v27) return 'need v2.7 (rw_snap.js) first';
  if (RW.v29) return 'v2.9 already installed';
  RW.v29 = true;

  // Tunable live from the panel (see inputs below) rather than fixed in code —
  // this is explicitly for experimenting against real pages without a rebuild.
  RW._textCellPx = Math.max(6, Math.round(16 * (RW.W/2592)));
  RW._textMinPerCell = 4;
  RW._textDirty = true;
  RW._textCandidates = [];

  // Existing committed annotations get knocked out into RW.wall as filled
  // interiors (same step RW.extract already does) — an irregular/complex
  // annotation shape skeletonizes into a tangle of branch points that mimics
  // dense text, purely as a geometric artifact. Confirmed live: on a
  // partially-annotated page, every single flagged candidate turned out to
  // overlap an existing annotation, not real text. Rebuilding that same
  // knockout mask here (rather than reading it off RW.wall, which has already
  // merged it with linework) lets us exclude those pixels from the density
  // scan — there's no reason to flag text inside an already-committed
  // annotation anyway, that area's already resolved.
  RW._buildAnnotationMask = function(){
    const {W,H} = RW;
    const cv = document.createElement('canvas'); cv.width=W; cv.height=H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#000';
    for (const a of (typeof annotationState!=='undefined' ? annotationState.annotations : [])){
      if (a._hidden || a.is_void) continue;
      // Array.isArray, not just !pts.length — a bbox-type annotation stores
      // coordinates as {x,y,width,height}, not a point array; `undefined < 3`
      // is false in JS, so the old guard let that object slip through to
      // pts.forEach(), which doesn't exist on it. Confirmed live (same bug
      // as rw_healinterior.js).
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

    // bucket raw (unclustered) candidates into a coarse grid
    const counts = new Map();       // 'cx_cy' -> count
    const cellPts = new Map();      // 'cx_cy' -> [{x,y},...]
    for (const p of pts){
      const cx=(p.x/cell)|0, cy=(p.y/cell)|0;
      const k = cx+'_'+cy;
      counts.set(k, (counts.get(k)||0)+1);
      if (!cellPts.has(k)) cellPts.set(k, []);
      cellPts.get(k).push(p);
    }

    // hot cells: density at/above threshold
    const hot = new Set();
    for (const [k,c] of counts) if (c >= minPerCell) hot.add(k);

    // connect adjacent hot cells (4-connected) into candidate regions —
    // same conceptual flood-fill/labeling pattern used elsewhere in this
    // codebase (RW.extract's component labeling), just over a density grid.
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
      // bounding box over every point in every cell of this connected group
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

  // invalidate whenever the wall changes (same dirty flag rw_snap.js already
  // wires up via RW._relabel/RW.extract — piggyback on RW._snapDirty rather
  // than adding a second wrapper layer)
  RW._textDirty = true;
  const origBuildSnapPoints = RW._buildSnapPoints;
  RW._buildSnapPoints = function(){ origBuildSnapPoints.apply(RW, arguments); RW._textDirty = true; };

  /* ---------- panel controls ---------- */
  const bar = (document.getElementById('rw-pick') || {}).parentNode;
  if (bar && !document.getElementById('rw-textdetect')){
    // Single wrapper so the whole cluster (button + cell/min inputs + status)
    // can be shown/hidden as one unit — see the "hide clutter" block below.
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

  /* ---------- hide clutter (per user request, not currently useful for
     their work) — hide, don't remove, so the underlying functionality stays
     intact and easy to re-enable later. Same convention rw_brushpoly.js
     already uses to hide its own legacy 'poly' button. Done here (loaded
     last) since Relabel/Add live in earlier-loaded files. ---------- */
  ['rw-relabel-btn', 'rw-addmode', 'rw-textdetect-group'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  return 'v2.9 up: text-density overlay (detection only, no edits) — "Text? (density)" panel button';
})()


  console.log('[RW] workbench ready: ' + __RW.regions.filter(r=>r.included).length + ' regions. Keys: P pick, K cut, B/O rects, N poly, J brush, ` undo, H heatmap, [ ] pages.');
})()
