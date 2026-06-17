import type { Page, BrowserContext } from "patchright";

// ── Launch args ─────────────────────────────────────────────────────
// Removed flags that are automation magnets:
//   --disable-web-security — no real browser has this
//   --no-sandbox           — real browsers always sandbox
//   --disable-gpu          — real browsers use GPU
// Users who need these (Docker, CI) can pass them manually in launch options.
export const STEALTH_LAUNCH_ARGS: readonly string[] = [
  "--disable-blink-features=AutomationControlled",
];

// ── Stealth script — comprehensive navigator/API patches ───────────
// Applied via CDP Page.addScriptToEvaluateOnNewDocument which
// persists across navigations.
const STEALTH_SCRIPT = `
(function(){
  // 1. WebDriver flag
  try{delete navigator.__proto__.webdriver}catch(e){}
  try{Object.defineProperty(navigator,'webdriver',{get:()=>false,configurable:true})}catch(e){}

  // 2. Languages
  try{Object.defineProperty(navigator,'languages',{get:()=>['en-US','en'],configurable:true})}catch(e){}

  // 3. Language
  try{Object.defineProperty(navigator,'language',{get:()=>'en-US',configurable:true})}catch(e){}

  // 4. User Agent — ensure no HeadlessChrome
  try{
    var ua=navigator.userAgent;
    if(ua.includes('HeadlessChrome')&&!ua.includes('HeadlessChrome')){}
    Object.defineProperty(navigator,'userAgent',{get:function(){return ua.replace('HeadlessChrome','Chrome')},configurable:true});
  }catch(e){}

  // 5. Plugins array — fully emulate PluginArray with item/namedItem
  try{
    var plugins=[
      {name:'Chrome PDF Plugin',filename:'internal-pdf-viewer',description:'Portable Document Format',length:0},
      {name:'Chrome PDF Viewer',filename:'mhjfbmdgcfjbbpaeojofohoefgiehjai',description:'',length:0},
      {name:'Native Client',filename:'internal-nacl-plugin',description:'',length:0}
    ];
    var pa=Object.create(PluginArray.prototype);
    Object.defineProperty(pa,'length',{value:plugins.length});
    for(var i=0;i<plugins.length;i++){
      Object.defineProperty(pa,i,{value:plugins[i]});
    }
    pa.item=function(i){return this[i]||null};
    pa.namedItem=function(n){for(var j=0;j<this.length;j++){if(this[j].name===n)return this[j]}return null};
    Object.defineProperty(navigator,'plugins',{get:function(){return pa},configurable:true});
  }catch(e){}

  // 6. Mime types
  try{
    var mt=Object.create(MimeTypeArray.prototype);
    Object.defineProperty(mt,'length',{value:1});
    Object.defineProperty(mt,0,{value:{type:'application/pdf',suffixes:'pdf',description:'Portable Document Format'}});
    mt.item=function(i){return this[i]||null};
    mt.namedItem=function(n){for(var j=0;j<this.length;j++){if(this[j].type===n)return this[j]}return null};
    Object.defineProperty(navigator,'mimeTypes',{get:function(){return mt},configurable:true});
  }catch(e){}

  // 7. Hardware concurrency
  try{Object.defineProperty(navigator,'hardwareConcurrency',{get:function(){return 4+Math.floor(Math.random()*5)},configurable:true})}catch(e){}

  // 8. Device memory
  try{Object.defineProperty(navigator,'deviceMemory',{get:function(){return 8},configurable:true})}catch(e){}

  // 9. Platform
  try{
    Object.defineProperty(navigator,'platform',{get:function(){
      var p=navigator.platform;
      if(p==='Win32'||p==='Win64')return'Win32';
      if(p==='MacIntel'||p==='MacPPC')return'MacIntel';
      return'Linux x86_64';
    },configurable:true});
  }catch(e){}

  // 10. Connection
  try{
    if(!navigator.connection||!navigator.connection.effectiveType){
      Object.defineProperty(navigator,'connection',{value:{effectiveType:'4g',downlink:10,rtt:50,saveData:false},writable:false,configurable:true});
    }
  }catch(e){}

  // 11. Screen properties
  try{
    Object.defineProperty(screen,'colorDepth',{value:30,writable:false,configurable:true});
    Object.defineProperty(screen,'pixelDepth',{value:30,writable:false,configurable:true});
  }catch(e){}

  // 12. Chrome runtime emulation
  try{
    if(!window.chrome)window.chrome={};
    var c=window.chrome;
    c.app={isInstalled:false};
    c.runtime={
      connect:function(){return{onMessage:{addListener:function(){}},postMessage:function(){},disconnect:function(){}}},
      sendMessage:function(){},
      onMessage:{addListener:function(){}},
      onConnect:{addListener:function(){}},
      id:'nkeimhogjdpnpccoofpliimaahmaaome'
    };
    c.csi=function(){return{}};
    c.loadTimes=function(){
      return{
        requestTime:0,startLoadTime:0,commitLoadTime:0,finishDocumentLoadTime:0,finishLoadTime:0,
        firstPaintTime:0,firstPaintAfterLoadTime:0,navigationType:'other',
        wasFetchedViaSpdy:true,wasNpnNegotiated:true,npnNegotiatedProtocol:'h2'
      };
    };
  }catch(e){}

  // 13. Permissions API override
  try{
    var _oq=Permissions.prototype.query.bind(Permissions.prototype);
    Permissions.prototype.query=async function(d){
      var n=d.name;
      if(n==='notifications')return{state:'prompt',onchange:null};
      if(n==='clipboard-read'||n==='clipboard-write')return{state:'granted',onchange:null};
      if(n==='geolocation')return{state:'prompt',onchange:null};
      if(n==='camera'||n==='microphone')return{state:'prompt',onchange:null};
      return _oq(d);
    };
  }catch(e){}

  // 14. WebGL vendor/renderer spoofing
  try{
    var getExt=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(){
      var ctx=getExt.apply(this,arguments);
      if(ctx&&arguments[0]==='webgl'||arguments[0]==='experimental-webgl'){
        var _getExt=ctx.getExtension;
        ctx.getExtension=function(e){
          if(e==='WEBGL_debug_renderer_info')return null;
          return _getExt.call(this,e);
        };
        var _getParam=ctx.getParameter;
        ctx.getParameter=function(p){
          if(p===37445)return'Google Inc. (Intel)';
          if(p===37446)return'Intel Iris OpenGL Engine (Intel Iris)';
          return _getParam.call(this,p);
        };
      }
      return ctx;
    };
  }catch(e){}

  // 15. Canvas fingerprint noise (subtle — 1% pixel perturbation)
  try{
    var _toDataURL=HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL=function(){
      if(Math.random()<0.01){
        var ctx=this.getContext('2d');
        if(ctx){
          var imgData=ctx.getImageData(0,0,1,1);
          imgData.data[0]=Math.min(255,imgData.data[0]+1);
          ctx.putImageData(imgData,0,0);
        }
      }
      return _toDataURL.apply(this,arguments);
    };
  }catch(e){}

  // 16. AudioContext fingerprint (subtle — 1% channel noise)
  try{
    var _createOscillator=AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator=function(){
      var osc=_createOscillator.apply(this,arguments);
      var _origConnect=osc.connect;
      osc.connect=function(){
        if(Math.random()<0.01){
          var now=performance.now()*0.001;
          var noiseNode=this.context.createGain();
          noiseNode.gain.setValueAtTime(0.0001,now);
          /** @type {any} */ (noiseNode).connect(this.context.destination);
        }
        return _origConnect.apply(this,arguments);
      };
      return osc;
    };
  }catch(e){}
})();
`;

// ── Apply stealth via CDP (best-effort) ─────────────────────────────
// Runs before any page JS but on fresh pages only (does NOT persist navs).
// This means additional patches (plugins, chrome, etc.) are applied
// on a best-effort basis. The primary stealth is via launch args.
export async function applyStealthToPage(page: Page): Promise<void> {
  try {
    const cdp = await (page.context() as any).newCDPSession(page);
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
      source: STEALTH_SCRIPT,
    });
    await cdp.detach();
  } catch {
    // Stealth patches non-critical; launch args handle primary stealth
  }
}

// ── Install stealth across a context ────────────────────────────────
export function installStealth(context: BrowserContext): void {
  for (const page of context.pages()) {
    applyStealthToPage(page);
  }
  context.on("page", (page: Page) => {
    applyStealthToPage(page);
  });
}
