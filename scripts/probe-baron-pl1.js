const base="https://api.gge-tracker.com/api/v1";
const serverListResponse=await fetch(base+"/servers",{headers:{Accept:"application/json"},signal:AbortSignal.timeout(20000)});
const serverList=await serverListResponse.json();
function findCandidates(value){
 if(Array.isArray(value))return value.flatMap(findCandidates);
 if(value&&typeof value==="object"){
  const text=JSON.stringify(value).toLowerCase();
  const here=(text.includes("empirefourkingdomsexgg2_3")||text.includes("e4k")||text.includes("pl1")||text.includes("poland"))? [value]:[];
  return here.concat(Object.values(value).flatMap(findCandidates));
 }
 return [];
}
const candidates=findCandidates(serverList);
console.log(JSON.stringify({probe:"server-list",status:serverListResponse.status,topKeys:Object.keys(serverList||{}),matches:candidates.slice(0,20)}));
for(const server of ["EmpirefourkingdomsExGG2_3","E4K_PL1","PL1","IT1"]){
 try{
  const url=base+"/dungeons?page=1&size=1&filterByKid="+encodeURIComponent("[1,2,3]");
  const response=await fetch(url,{headers:{"gge-server":server,Accept:"application/json"},signal:AbortSignal.timeout(20000)});
  const body=await response.json();
  console.log(JSON.stringify({probe:"dungeons",server,http_status:response.status,error:body.error??null,count:Array.isArray(body.dungeons)?body.dungeons.length:null,pagination:body.pagination??null,first:body.dungeons?.[0]??null}));
 }catch(error){console.log(JSON.stringify({probe:"dungeons",server,error:String(error)}));}
}
