const $=x=>document.getElementById(x);
let viewer;
const air=new Cesium.CustomDataSource("aircraft");
const sats=new Cesium.CustomDataSource("satellites");
const quakes=new Cesium.CustomDataSource("earthquakes");

async function boot(){
 viewer=new Cesium.Viewer("cesiumContainer",{animation:false,timeline:false,baseLayerPicker:false,geocoder:false,homeButton:false,navigationHelpButton:false,sceneModePicker:false,fullscreenButton:false,infoBox:false,selectionIndicator:false,terrainProvider:await Cesium.createWorldTerrainAsync()});

 // iPhone/iPad Safari WebGL compatibility:
 // Cesium's atmospheric scattering shader can fail to link on Apple's ANGLE/WebGL path.
 // Disable the atmosphere passes while keeping the 3D globe and data layers.
 if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show=false;
 viewer.scene.globe.showGroundAtmosphere=false;
 viewer.scene.globe.enableLighting=true;
 viewer.scene.backgroundColor=Cesium.Color.fromCssColorString("#02050a");
 viewer.dataSources.add(air);viewer.dataSources.add(sats);viewer.dataSources.add(quakes);
 viewer.camera.setView({destination:Cesium.Cartesian3.fromDegrees(105,25,18500000)});
 viewer.selectedEntityChanged.addEventListener(e=>{
   if(!e)return;
   $("selectedName").textContent=e.name||"OBJECT";
   $("selectedMeta").textContent=e.properties?.meta?.getValue?.()||"Public data";
 });
 tick();
 await Promise.all([aircraft(),satellites(),earthquakes()]);
 $("connection").textContent="ONLINE";
 setInterval(aircraft,30000);
 setInterval(tick,1000);
}
function tick(){let d=new Date();$("utc").textContent=d.toISOString().slice(11,19)}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
async function aircraft(){
 try{
   // Public OpenSky state vectors. Anonymous access is rate-limited, so refresh conservatively.
   const r=await fetch("https://opensky-network.org/api/states/all");
   if(!r.ok)throw Error();
   const j=await r.json(); air.entities.removeAll(); let n=0;
   for(const s of (j.states||[])){
     const [icao,callsign,country,timePos,last,lon,lat,alt,,vel,heading]=s;
     if(lat==null||lon==null)continue;
     n++;
     const name=(callsign||icao||"AIRCRAFT").trim();
     const e=air.entities.add({
       position:Cesium.Cartesian3.fromDegrees(lon,lat,Math.max(0,(alt||0))),
       point:{pixelSize:5,color:Cesium.Color.fromCssColorString("#65e9ff"),outlineColor:Cesium.Color.BLACK,outlineWidth:1},
       name,
       properties:{meta:`${country||"Unknown"} · ${Math.round((alt||0)*3.28084)} ft · ${Math.round((vel||0)*1.94384)} kt · HDG ${Math.round(heading||0)}°`}
     });
     if(n>1800)break;
   }
   $("airCount").textContent=n;
 }catch(e){$("airCount").textContent="OFFLINE";toast("Aircraft feed is temporarily unavailable")}
}
async function satellites(){
 try{
   // Fetch current TLE catalog and propagate a selected active subset correctly with satellite.js.
   const r=await fetch("https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle");
   if(!r.ok)throw Error();
   const text=await r.text(); const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
   sats.entities.removeAll(); let n=0;
   for(let i=0;i+2<lines.length && n<350;i+=3){
     if(!lines[i+1]?.startsWith("1 ")||!lines[i+2]?.startsWith("2 "))continue;
     const name=lines[i],l1=lines[i+1],l2=lines[i+2];
     try{
       const rec=satellite.twoline2satrec(l1,l2);
       const pv=satellite.propagate(rec,new Date());
       const gmst=satellite.gstime(new Date());
       const geo=satellite.eciToGeodetic(pv.position,gmst);
       const lon=satellite.degreesLong(geo.longitude),lat=satellite.degreesLat(geo.latitude),h=geo.height*1000;
       sats.entities.add({position:Cesium.Cartesian3.fromDegrees(lon,lat,h),point:{pixelSize:3,color:Cesium.Color.fromCssColorString("#b9ff9b")},name,properties:{meta:"CelesTrak active catalog · propagated from TLE"}});
       n++;
     }catch(_){}
   }
   $("satCount").textContent=n;
 }catch(e){$("satCount").textContent="OFFLINE";toast("Satellite catalog is temporarily unavailable")}
}
async function earthquakes(){
 try{
   const r=await fetch("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson");
   const j=await r.json();quakes.entities.removeAll();let n=0;
   for(const f of j.features||[]){
     const [lon,lat,depth]=f.geometry.coordinates,mag=f.properties.mag||0;
     quakes.entities.add({position:Cesium.Cartesian3.fromDegrees(lon,lat,Math.max(0,depth)*-1000),point:{pixelSize:Math.max(5,Math.min(16,5+mag*2)),color:Cesium.Color.fromCssColorString("#ffb25c"),outlineColor:Cesium.Color.BLACK,outlineWidth:1},name:f.properties.place||"Earthquake",properties:{meta:`M ${mag} · ${new Date(f.properties.time).toLocaleString()}`}});
     n++;
   }
   $("quakeCount").textContent=n;
 }catch(e){$("quakeCount").textContent="OFFLINE"}
}
document.querySelectorAll("[data-layer]").forEach(b=>b.onclick=()=>{
 const k=b.dataset.layer,ds=k==="air"?air:k==="sat"?sats:quakes;ds.show=!ds.show;b.classList.toggle("off",!ds.show)
});
$("locate").onclick=()=>navigator.geolocation?.getCurrentPosition(p=>viewer.camera.flyTo({destination:Cesium.Cartesian3.fromDegrees(p.coords.longitude,p.coords.latitude,50000),duration:1.3}),()=>toast("Location permission was not granted"));
function toast(t){$("toast").textContent=t;$("toast").style.display="block";clearTimeout(window.tt);window.tt=setTimeout(()=>$("toast").style.display="none",2600)}
boot();
