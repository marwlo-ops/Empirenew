const server="EmpirefourkingdomsExGG2_3";
const base="https://empire-api.fly.dev";
const x=789,y=516,spacing=13,tile=12;
const x1=Math.floor(x/spacing)*spacing,y1=Math.floor(y/spacing)*spacing;
for(const kid of [1,2,3]){
 const params={KID:kid,AX1:x1,AY1:y1,AX2:x1+tile,AY2:y1+tile};
 const encoded=encodeURIComponent(JSON.stringify(params).slice(1,-1));
 const url=base+'/'+encodeURIComponent(server)+'/gaa/'+encoded;
 try{
  const response=await fetch(url,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(20000)});
  const body=await response.json();
  const rows=body.content?.AI;
  const match=Array.isArray(rows)?rows.find(r=>Array.isArray(r)&&String(r[0])==="11"&&Number(r[1])===x&&Number(r[2])===y):null;
  console.log(JSON.stringify({kid,http_status:response.status,return_code:body.return_code,ai_count:Array.isArray(rows)?rows.length:null,match:match?{x:match[1],y:match[2],remaining_seconds:match[5],player_id:match[6]}:null,error:body.error??null}));
 }catch(error){console.log(JSON.stringify({kid,error:String(error)}));}
}
