export const STEALTH_LAUNCH_ARGS = [
    "--disable-blink-features=AutomationControlled",
];
const STEALTH_SCRIPT = `
(function(){
  try {
    Object.defineProperty(Navigator.prototype, 'webdriver', {
      get: function() { return undefined; },
      set: function() {},
      configurable: true,
      enumerable: true
    });
  } catch(e) {}

  try{Object.defineProperty(navigator,'languages',{get:function(){return['en-US','en']},configurable:true})}catch(e){}
  try{Object.defineProperty(navigator,'language',{get:function(){return'en-US'},configurable:true})}catch(e){}

  try{
    var ua=navigator.userAgent;
    if(ua.includes('HeadlessChrome')){
      Object.defineProperty(navigator,'userAgent',{get:function(){return ua.replace('HeadlessChrome','Chrome')},configurable:true});
    }
  }catch(e){}

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

  try{
    var mt=Object.create(MimeTypeArray.prototype);
    Object.defineProperty(mt,'length',{value:1});
    Object.defineProperty(mt,0,{value:{type:'application/pdf',suffixes:'pdf',description:'Portable Document Format'}});
    mt.item=function(i){return this[i]||null};
    mt.namedItem=function(n){for(var j=0;j<this.length;j++){if(this[j].type===n)return this[j]}return null};
    Object.defineProperty(navigator,'mimeTypes',{get:function(){return mt},configurable:true});
  }catch(e){}

  try{Object.defineProperty(navigator,'hardwareConcurrency',{get:function(){return 4+Math.floor(Math.random()*5)},configurable:true})}catch(e){}

  try{Object.defineProperty(navigator,'deviceMemory',{get:function(){return 8},configurable:true})}catch(e){}
  try{
    Object.defineProperty(navigator,'platform',{get:function(){
      var p=navigator.platform;
      if(p==='Win32'||p==='Win64')return'Win32';
      if(p==='MacIntel'||p==='MacPPC')return'MacIntel';
      return'Linux x86_64';
    },configurable:true});
  }catch(e){}

  try{
    if(!navigator.connection||!navigator.connection.effectiveType){
      Object.defineProperty(navigator,'connection',{value:{effectiveType:'4g',downlink:10,rtt:50,saveData:false},writable:false,configurable:true});
    }
  }catch(e){}

  try{
    Object.defineProperty(screen,'colorDepth',{value:30,writable:false,configurable:true});
    Object.defineProperty(screen,'pixelDepth',{value:30,writable:false,configurable:true});
  }catch(e){}

  try{
    if(!window.chrome) window.chrome = {};
    var _c = window.chrome;

    function makeEvent() {
      var listeners = [];
      return {
        addListener: function(fn) { if(typeof fn==='function') listeners.push(fn); },
        removeListener: function(fn) { listeners=listeners.filter(function(l){return l!==fn}); },
        hasListeners: function() { return listeners.length>0; },
        _fire: function() { for(var i=0;i<listeners.length;i++) listeners[i].apply(null,arguments); }
      };
    }

    _c.app = { isInstalled: false };

    var _runtimeValue = {
      connect: function() {
        return {
          onMessage: makeEvent(),
          postMessage: function(){},
          disconnect: function(){}
        };
      },
      sendMessage: function() {
        var cb = arguments[arguments.length-1];
        if(typeof cb==='function') setTimeout(cb, 0);
      },
      onMessage: makeEvent(),
      onConnect: makeEvent(),
      onInstalled: makeEvent(),
      onStartup: makeEvent(),
      id: 'nkeimhogjdpnpccoofpliimaahmaaome'
    };
    Object.defineProperty(_c, 'runtime', {
      get: function() { return _runtimeValue; },
      set: function(v) { _runtimeValue = v; },
      configurable: true,
      enumerable: true
    });

    _c.csi = function() {
      var t = performance.timing || {};
      return {
        onloadT: t.loadEventEnd || 0,
        startE: t.navigationStart || 0,
        pageT: Date.now(),
        tran: 15
      };
    };

    _c.loadTimes = function() {
      return {
        requestTime: 0,
        startLoadTime: 0,
        commitLoadTime: 0,
        finishDocumentLoadTime: 0,
        finishLoadTime: 0,
        firstPaintTime: 0,
        firstPaintAfterLoadTime: 0,
        navigationType: 'other',
        wasFetchedViaSpdy: true,
        wasNpnNegotiated: true,
        npnNegotiatedProtocol: 'h2',
        wasAlternateProtocolAvailable: false,
        connectionInfo: 'http/2'
      };
    };
  } catch(e){}

  try{
    var _oq=Permissions.prototype.query.bind(Permissions.prototype);
    Permissions.prototype.query=async function(d){
      var n=d.name;
      if(n==='notifications')return{state:'prompt',onchange:null};
      if(n==='geolocation')return{state:'prompt',onchange:null};
      if(n==='camera'||n==='microphone')return{state:'prompt',onchange:null};
      return _oq(d);
    };
  }catch(e){}

  try{
    var _getContext=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(){
      var ctx=_getContext.apply(this,arguments);
      if(ctx&&(arguments[0]==='webgl'||arguments[0]==='experimental-webgl')){
        var _getParam=ctx.getParameter;
        ctx.getParameter=function(p){
          if(p===37446) return 'Intel Iris OpenGL Engine';
          if(p===0x8A8F) {
            var orig=_getParam.call(this,p);
            if(orig && typeof orig=== 'number') return orig + 0.0001 * (Math.random()-0.5);
            return orig;
          }
          return _getParam.call(this,p);
        };
      }
      return ctx;
    };
  }catch(e){}

  try{
    var _toDataURL=HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL=function(){
      if(Math.random()<0.025){
        var ctx=this.getContext('2d');
        if(ctx){
          var imgData=ctx.getImageData(0,0,1,1);
          var ch=Math.floor(Math.random()*3);
          imgData.data[ch]=Math.min(255,Math.max(0,imgData.data[ch]+Math.round(Math.random()*2+1)));
          ctx.putImageData(imgData,0,0);
        }
      }
      return _toDataURL.apply(this,arguments);
    };
  }catch(e){}

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
          noiseNode.connect(this.context.destination);
        }
        return _origConnect.apply(this,arguments);
      };
      return osc;
    };
  }catch(e){}
})();
`;
export async function applyStealthToPage(page) {
    try {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
            source: STEALTH_SCRIPT,
        });
        await cdp.detach();
    }
    catch {
    }
}
export function installStealth(context) {
    for (const page of context.pages()) {
        applyStealthToPage(page);
    }
    context.on("page", (page) => {
        applyStealthToPage(page);
    });
}
//# sourceMappingURL=stealth.js.map