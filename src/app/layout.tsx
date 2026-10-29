import type { Metadata } from "next";
import localFont from "next/font/local";
import { CatalystSdkLoader } from "@/components/CatalystSdkLoader";
import "./globals.css";

// Self-hosted fonts — no external font CDN (Google Fonts) is contacted at
// build or runtime. Variable woff2 files ship in the repo under app/fonts.
// Pairing: Space Grotesk (display — a confident, engineered grotesque that
// reads as authoritative signage), Manrope (body — a highly legible geometric
// sans), JetBrains Mono (data/IDs). fallback + metric adjustment cut the
// layout shift before the woff2 swaps in.
const sans = localFont({
  src: "./fonts/manrope.woff2",
  variable: "--font-sans",
  display: "swap",
  weight: "400 700",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});
const display = localFont({
  src: "./fonts/space-grotesk.woff2",
  variable: "--font-display",
  display: "swap",
  weight: "400 700",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});
const mono = localFont({
  src: "./fonts/jetbrains-mono.woff2",
  variable: "--font-mono",
  display: "swap",
  weight: "400 700",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "NETRA — Crime Intelligence Platform | KSP",
  description:
    "AI-powered Crime Investigation Intelligence Platform for the Karnataka State Police. Natural-language investigation, criminal network analysis, and explainable predictive intelligence.",
};

// Set the theme before first paint to avoid a flash of the wrong palette.
const themeInit = `(function(){try{var p=JSON.parse(localStorage.getItem('netra-prefs'));var t=p&&p.state&&p.state.theme;var v=p&&p.version;if((v==null||v<2)&&(!t||t==='midnight'))t='daylight';document.documentElement.setAttribute('data-theme',t||'daylight');}catch(e){document.documentElement.setAttribute('data-theme','daylight');}})();`;

// Hosting can briefly reject an asset request during a Catalyst rollout or throttle window.
const assetRecoveryInit = `(function(){
  var marker='netra_asset_recovery_v3';
  var recovering=false;
  function showRecovery(message,canReload){
    function mount(){
      if(!document.body)return;
      var panel=document.getElementById('netra-asset-recovery');
      if(!panel){
        panel=document.createElement('div');
        panel.id='netra-asset-recovery';
        panel.setAttribute('role','alert');
        panel.style.cssText='position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:#f2f7fa;color:#10283b;font:15px system-ui,sans-serif;text-align:center;padding:24px';
        var content=document.createElement('div');
        content.style.cssText='max-width:420px';
        var heading=document.createElement('strong');
        heading.textContent='NETRA is having trouble loading';
        heading.style.cssText='display:block;font-size:18px;margin-bottom:10px';
        var detail=document.createElement('p');
        detail.id='netra-asset-recovery-message';
        detail.style.cssText='line-height:1.5;margin:0 0 18px';
        var button=document.createElement('button');
        button.id='netra-asset-recovery-button';
        button.type='button';
        button.textContent='Reload';
        button.style.cssText='padding:9px 18px;border:1px solid #078fb2;border-radius:4px;background:#078fb2;color:white;cursor:pointer';
        button.onclick=function(){try{sessionStorage.removeItem(marker);}catch(e){}window.location.reload();};
        content.appendChild(heading);
        content.appendChild(detail);
        content.appendChild(button);
        panel.appendChild(content);
        document.body.appendChild(panel);
      }
      document.getElementById('netra-asset-recovery-message').textContent=message;
      document.getElementById('netra-asset-recovery-button').style.display=canReload?'inline-block':'none';
    }
    if(document.body)mount();else document.addEventListener('DOMContentLoaded',mount,{once:true});
  }
  function isAssetFailure(value){
    var text=String(value&&value.message||value||'');
    return /ChunkLoadError|Loading chunk [^ ]+ failed|Failed to fetch dynamically imported module|MIME type.*not executable/i.test(text);
  }
  function recover(){
    if(recovering)return;
    recovering=true;
    var attempt=1;
    try{
      var previous=JSON.parse(sessionStorage.getItem(marker)||'null');
      if(previous&&Date.now()-previous.at<120000)attempt=previous.attempt+1;
      if(attempt>3){showRecovery('A required script could not be loaded. Please reload, or try again in a moment.',true);return;}
      sessionStorage.setItem(marker,JSON.stringify({at:Date.now(),attempt:attempt}));
    }catch(e){}
    showRecovery('A required script could not be loaded. Retrying automatically ('+attempt+'/3)...',false);
    var reload=function(){
      var url=new URL(window.location.href);
      url.searchParams.set('_netra_reload',Date.now().toString());
      window.setTimeout(function(){window.location.replace(url.toString());},attempt*3000);
    };
    reload();
  }
  window.addEventListener('error',function(event){
    var target=event.target;
    var src=target&&(target.src||target.href)||'';
    if(src&&src.indexOf('/_next/static/')!==-1)recover();
    else if(isAssetFailure(event.error||event.message))recover();
  },true);
  window.addEventListener('unhandledrejection',function(event){if(isAssetFailure(event.reason))recover();});
  window.setTimeout(function(){try{sessionStorage.removeItem(marker);}catch(e){}},125000);
}());`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="daylight" className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <script dangerouslySetInnerHTML={{ __html: assetRecoveryInit }} />
      </head>
      <body>
        <CatalystSdkLoader />
        {children}
      </body>
    </html>
  );
}
